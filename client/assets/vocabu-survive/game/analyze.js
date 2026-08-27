/* ══════════════════════════════════════════════════════════════════════════
   コースの 形を 測る（走らせない）

   「跳べない ところが ないか」を **人が 走る 前に** 数で 見る。
   もとは 検査の 中（vqsurvivegap.cjs）に あったが、
   コースを 自分で 作る 画面でも 同じ 判定が 要る ので ここへ 出した。
   ★ **判定の 線は 1 か所に する。** 検査と 画面で 違う 線を 使うと、
     「検査は 通るのに 走れない コース」が 作れて しまう。

   測る もの:
     ① 隙間      … 足場が 何も 無い 区間の 長さ
     ② 段差      … 隣どうしの 足場の 高さの 差
     ③ 板から 板 … とび石・消える板・落ちる板・動く板の 間の 距離
                    （断面には 何か あるのに 板から 板へは 届かない ことが ある）
   ══════════════════════════════════════════════════════════════════════════ */
import { topOf } from "./physics.js";
import { TUNE } from "./player.js";

/** 走って 越えられる 隙間（m）。8.2m/s で 走って 跳ぶと およそ これだけ。 */
export const 越えられる隙間 = 5.5;
/* 跳びの 高さ 2.0m ＋ 自動で 上る 段 0.42m。
   ★ 「一番 低い とき」で 測る やり方も 試したが、消える 板が 混ざると
     その 位置の 低い 値と 前の 高い 値を 比べて しまい、作り物の 警告に なった。
     ここは **一番 高い とき**で 測り、線を 2.4m に 置く。 */
export const 越えられる段差 = 2.4;
/* 打ち上げ台・トランポリンの 直後だけ 大きく 跳べる（上へ 29m/s → 19m 跳ぶ）。 */
export const 射出のあとの隙間 = 20;

/**
 * @param {object} c buildCourse() の 返り
 * @returns {{gap:number,gapAt:number,gapMax:number,step:number,stepAt:number,
 *            far:number,farAt:number,farWhat:string,ok:boolean,warn:string[]}}
 */
export function analyzeCourse(c) {
  const near = [];
  const 幅 = (d) => Math.max(6, c.pointAt(d).w);
  const N = Math.ceil(c.length / 0.4) + 1;
  const 支え = new Float32Array(N).fill(NaN);

  for (let t = 0; t <= 8; t += 0.25) {
    c.update(t);
    for (let i = 0; i < N; i++) {
      const d = i * 0.4;
      const p = c.pointAt(d);
      const w = 幅(d);
      for (let lat = -w / 2; lat <= w / 2 + 0.01; lat += 0.7) {
        const a = c.pointAt(Math.max(0, d - 0.5)), b = c.pointAt(Math.min(c.length, d + 0.5));
        let dx = b.x - a.x, dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const x = p.x + (-dz) * lat, z = p.z + dx * lat;
        c.world.near(x, z, 2.0, near);
        for (const s of near) {
          /* 弾く もの・跳ねる もの・熱い ものは **足場では ない** */
          if (s.touch) continue;
          const top = topOf(s, x, z, TUNE.radius * 0.5);
          if (top === null) continue;
          /* 門の 幕（床から 4.6m）を 足場と 数えない ため、
             **歩ける 高さの 帯**（-6m 〜 +2.2m）だけ 見る */
          if (top > p.y + 2.2 || top < p.y - 6) continue;
          if (Number.isNaN(支え[i]) || top > 支え[i]) 支え[i] = top;
        }
      }
    }
  }
  c.update(0);

  /* ① 隙間 */
  let gap = 0, gapAt = 0, 連 = 0, 連始 = 0;
  for (let i = 0; i < N; i++) {
    if (Number.isNaN(支え[i])) { if (連 === 0) 連始 = i; 連++; }
    else {
      if (連 * 0.4 > gap) { gap = 連 * 0.4; gapAt = 連始 * 0.4; }
      連 = 0;
    }
  }
  if (連 * 0.4 > gap) { gap = 連 * 0.4; gapAt = 連始 * 0.4; }

  /* ② 段差 */
  let step = 0, stepAt = 0, 前 = NaN;
  for (let i = 0; i < N; i++) {
    const v = 支え[i];
    if (!Number.isNaN(v) && !Number.isNaN(前)) {
      const d = v - 前;
      if (d > step) { step = d; stepAt = i * 0.4; }
    }
    if (!Number.isNaN(v)) 前 = v;
  }

  /* 射出台の 近くなら 大きな 隙間を 許す */
  const 射出 = c.obstacles.filter((o) => o.kind === "launch" || o.kind === "tramp");
  const p隙 = c.pointAt(gapAt);
  const 射出が近い = 射出.some((o) => Math.hypot(o.x - p隙.x, o.z - p隙.z) < 16);
  const gapMax = 射出が近い ? 射出のあとの隙間 : 越えられる隙間;

  /* ③ 板から 板 */
  const 点 = [];
  for (const o of c.obstacles) {
    if (o.kind === "stones") { for (const st of o.stones) 点.push({ x: st.x, z: st.z, r: o.r, k: "石" }); }
    else if (o.kind === "blinker") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2, k: "消" });
    else if (o.kind === "faller") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2, k: "落" });
    else if (o.kind === "mover") 点.push({ x: o.x, z: o.z, r: Math.min(o.w, o.d) / 2 + (o.ax || 0), k: "動" });
  }
  点.sort((a, b) => b.z - a.z);
  let far = 0, farAt = 0, farWhat = "";
  for (let i = 0; i < 点.length; i++) {
    const a = 点[i];
    let 近 = Infinity, 相手 = null;
    for (let j = 0; j < 点.length; j++) {
      const b = 点[j];
      if (b.z >= a.z - 0.5) continue;
      if (a.z - b.z > 14) continue;
      /* 横に 6m 以上 離れて いれば 別の 道。比べない。 */
      if (Math.abs(a.x - b.x) > 6) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z) - (a.r + b.r) * 0.55;
      if (d < 近) { 近 = d; 相手 = b; }
    }
    if (!相手) continue;
    if (近 > far) { far = 近; farAt = Math.abs(a.z); farWhat = a.k + "→" + 相手.k; }
  }

  const warn = [];
  if (far > 越えられる隙間) warn.push("板から 板へ " + far.toFixed(1) + "m（" + farWhat + "）@" + Math.round(farAt) + "m");
  if (gap > gapMax) warn.push("すきま " + gap.toFixed(1) + "m @" + Math.round(gapAt) + "m");
  if (step > 越えられる段差) warn.push("段差 " + step.toFixed(1) + "m @" + Math.round(stepAt) + "m");

  return { gap, gapAt, gapMax, step, stepAt, far, farAt, farWhat, ok: warn.length === 0, warn };
}
