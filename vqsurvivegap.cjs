#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivegap.cjs — コースの 隙間を **ボットに 頼らず** 直に 測る。

   なぜ 要るか:
     ボットが 通れない とき、「コースが 無理」なのか
     「ボットが 下手」なのか 区別が つかない。
     隙間の 長さは **形の 性質**なので、走らせずに 測れる。

   測り方:
     ① 中心線を 0.4m ごとに 見る
     ② その 断面（道の 幅ぶん）を 横に 0.7m ごとに 見て、足場が あるか
     ③ 動く／消える ものは **8 秒ぶん 時間を 進めて**、
        一度でも 足場に なれば「足場あり」と する
     ④ 足場が 一度も 無い 区間の 長さ ＝ 隙間

   線引き（実測から）:
     走り跳びの 飛距離 5.88m ／ 跳びの 高さ 2.0m
     → 隙間 5.5m 超え は **越えられない 恐れ**として 報告する
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const だけ = process.argv[2] && /^c\d+$/.test(process.argv[2]) ? process.argv[2] : "";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) pass++;
  else { fail++; bad.push(n + (x !== undefined ? " → " + JSON.stringify(x).slice(0, 200) : "")); }
  return c;
};

const 越えられる隙間 = 5.5;
/* 跳びの 高さ 2.0m ＋ 自動で 上る 段 0.42m。
   ★ 「一番 低い とき」で 測る やり方も 試したが、消える 板が 混ざると
     その 位置の 低い 値と 前の 高い 値を 比べて しまい、作り物の 警告に なった。
     ここは **一番 高い とき**で 測り、線を 2.4m に 置く。 */
const 越えられる段差 = 2.4;

(async () => {
  const { COURSES } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { topOf } = await import(道("game/physics.js"));
  const { TUNE } = await import(道("game/player.js"));

  const list = だけ ? COURSES.filter((c) => c.id === だけ) : COURSES;
  console.log("隙間と 段差を 測る（走らせない）\n");
  console.log("  ID   名前                    長さ  最大隙間  最大段差  板→板   危ない所");
  console.log("  ──── ─────────────────────── ───── ──────── ──────── ──────── ────────");

  for (const def of list) {
    const c = buildCourse(def);
    const near = [];
    const 幅 = (d) => Math.max(6, c.pointAt(d).w);
    /* 時間を 進めながら 「どこかで 足場に なった」を 記録する */
    const N = Math.ceil(c.length / 0.4) + 1;
    const 支え = new Float32Array(N).fill(NaN);   /* 足場の 高さ（一番 高い） */
    /* ★ 段差は **一番 低い とき**で 見る。
       上下する 板は 低い ときに 乗れば よいので、
       一番 高い ときの 差を 「越えられない 段差」と するのは 誤り。 */
    const 支え低 = new Float32Array(N).fill(NaN);
    const 時刻 = [];
    for (let t = 0; t <= 8; t += 0.25) 時刻.push(t);
    for (const t of 時刻) {
      c.update(t);
      for (let i = 0; i < N; i++) {
        const d = i * 0.4;
        const p = c.pointAt(d);
        const w = 幅(d);
        for (let lat = -w / 2; lat <= w / 2 + 0.01; lat += 0.7) {
          /* 中心線の 向き（前後の 点から） */
          const a = c.pointAt(Math.max(0, d - 0.5)), b = c.pointAt(Math.min(c.length, d + 0.5));
          let dx = b.x - a.x, dz = b.z - a.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const x = p.x + (-dz) * lat, z = p.z + dx * lat;
          c.world.near(x, z, 2.0, near);
          for (const s of near) {
            /* 弾く もの・跳ねる もの・熱い ものは **足場では ない**。
               上に 乗る 前提で 数えると 「段差 2.2m」の ような
               作り物の 警告に なる（バンパーの 頭）。 */
            if (s.touch) continue;
            const top = topOf(s, x, z, TUNE.radius * 0.5);
            if (top === null) continue;
            /* ★ 「上に 何か ある」＝足場、では ない。
               クイズの 門の 幕（床から 4.6m）や 時間の 門の 板を
               足場と 数えていたので、全 30 本で 「段差 4.6m」と 出ていた。
               **歩ける 高さの 帯**（中心線の -6m 〜 +2.2m）だけを 見る。 */
            if (top > p.y + 2.2 || top < p.y - 6) continue;
            if (Number.isNaN(支え[i]) || top > 支え[i]) 支え[i] = top;
            if (Number.isNaN(支え低[i]) || top < 支え低[i]) 支え低[i] = top;
          }
        }
      }
    }
    c.update(0);

    /* 隙間 */
    let 最大隙間 = 0, 隙間場所 = 0, 連 = 0, 連始 = 0;
    for (let i = 0; i < N; i++) {
      if (Number.isNaN(支え[i])) { if (連 === 0) 連始 = i; 連++; }
      else {
        if (連 * 0.4 > 最大隙間) { 最大隙間 = 連 * 0.4; 隙間場所 = 連始 * 0.4; }
        連 = 0;
      }
    }
    if (連 * 0.4 > 最大隙間) { 最大隙間 = 連 * 0.4; 隙間場所 = 連始 * 0.4; }

    /* 段差（隣どうしの 高さの 差） */
    let 最大段差 = 0, 段差場所 = 0;
    let 前 = NaN;
    for (let i = 0; i < N; i++) {
      const v = 支え[i];
      if (!Number.isNaN(v) && !Number.isNaN(前)) {
        const d = v - 前;
        if (d > 最大段差) { 最大段差 = d; 段差場所 = i * 0.4; }
      }
      if (!Number.isNaN(v)) 前 = v;
    }

    /* ★ 打ち上げ台・トランポリンの 直後は 大きく 跳べる。
       15.5×1.9 で 上へ 29m/s → 高さ 16m・滞空 2.3 秒 → 19m 跳べる。
       その 手前 14m 以内に 射出台が あれば 隙間 20m まで 許す。 */
    const 射出 = c.obstacles.filter((o) => o.kind === "launch" || o.kind === "tramp");
    const 射出が手前にある = (d) => {
      const p = c.pointAt(d);
      return 射出.some((o) => {
        const dz = Math.hypot(o.x - p.x, o.z - p.z);
        return dz < 16;
      });
    };
    const 許す隙間 = 射出が手前にある(隙間場所) ? 20 : 越えられる隙間;

    /* ── ② 足場から 足場への 距離 ──────────────────────────────
       ★ 中心線の 断面だけ 見ると 見落とす。
         とび石・消える板・落ちる板が 道幅の 中で 左右に 振れていると、
         断面には いつも 何か あるのに **板から 板へは 届かない**。
         実際 c22 で 隣の 板まで 7.7m あった（跳べるのは 5.88m）。 */
    const 点 = [];
    for (const o of c.obstacles) {
      if (o.kind === "stones") { for (const st of o.stones) 点.push({ x: st.x, z: st.z, r: o.r, k: "石" }); }
      else if (o.kind === "blinker") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2, k: "消" });
      else if (o.kind === "faller") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2, k: "落" });
      else if (o.kind === "mover") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2 + (o.ax || 0), k: "動" });
    }
    点.sort((a, b) => b.z - a.z);   /* 進む 向き（-Z）へ 並べる */
    /* ★ 「並び順の 隣」では なく **一番 近い 先の 板**を 見る。
       c17 の ように 3 本の 道が 並んでいる ときは、
       違う 道の 板どうしを 比べて しまう（横に 10m 離れている）。
       「この 板から 一番 近い 先の 板」が 届かない ときだけ 数える。 */
    let 最遠 = 0, 最遠場所 = 0, 最遠札 = "";
    for (let i = 0; i < 点.length; i++) {
      const a = 点[i];
      let 近 = Infinity, 相手 = null;
      for (let j = 0; j < 点.length; j++) {
        const b = 点[j];
        if (b.z >= a.z - 0.5) continue;              /* 先に ある ものだけ */
        if (a.z - b.z > 14) continue;                /* ひとつながりで ない */
        /* 横に 6m 以上 離れて いれば **別の 道**（c17 の 三又）。比べない。 */
        if (Math.abs(a.x - b.x) > 6) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z) - (a.r + b.r) * 0.55;
        if (d < 近) { 近 = d; 相手 = b; }
      }
      if (!相手) continue;                            /* 先に 板が 無い＝床へ 出る */
      if (近 > 最遠) { 最遠 = 近; 最遠場所 = Math.abs(a.z); 最遠札 = a.k + "→" + 相手.k; }
    }

    const 危 = [];
    if (最遠 > 越えられる隙間) 危.push("板から板 " + 最遠.toFixed(1) + "m " + 最遠札 + " @" + Math.round(最遠場所) + "m");
    if (最大隙間 > 許す隙間) 危.push("隙間 " + 最大隙間.toFixed(1) + "m @" + Math.round(隙間場所) + "m");
    if (最大段差 > 越えられる段差) 危.push("段差 " + 最大段差.toFixed(1) + "m @" + Math.round(段差場所) + "m");

    console.log("  " + def.id.padEnd(5) + def.name.padEnd(22).slice(0, 22)
      + String(Math.round(c.length)).padStart(5) + "m"
      + (最大隙間.toFixed(1) + "m").padStart(9)
      + (最大段差.toFixed(1) + "m").padStart(9)
      + (最遠.toFixed(1) + "m").padStart(9)
      + "  " + (危.length ? "⚠ " + 危.join(" / ") : "—"));

    ok(def.id + " 隙間が 跳べる 範囲", 最大隙間 <= 許す隙間,
      { 隙間: 最大隙間.toFixed(1), 場所: Math.round(隙間場所) + "m", 許す: 許す隙間 });
    ok(def.id + " 段差が 跳べる 範囲（≦" + 越えられる段差 + "m）", 最大段差 <= 越えられる段差,
      { 段差: 最大段差.toFixed(1), 場所: Math.round(段差場所) + "m" });
    ok(def.id + " 板から 板へ 届く（≦" + 越えられる隙間 + "m）", 最遠 <= 越えられる隙間,
      { 距離: 最遠.toFixed(1), 何: 最遠札, 場所: Math.round(最遠場所) + "m" });
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  越えられない 恐れ:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
