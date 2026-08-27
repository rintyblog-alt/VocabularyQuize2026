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

(async () => {
  const { COURSES } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  /* ★ 測り方は **画面と 同じ もの**を 使う（game/analyze.js）。
     ここに 写しを 置くと、検査は 通るのに 走れない コースが 作れて しまう。 */
  const { analyzeCourse, 越えられる隙間, 越えられる段差 } = await import(道("game/analyze.js"));

  const list = だけ ? COURSES.filter((c) => c.id === だけ) : COURSES;
  console.log("隙間と 段差を 測る（走らせない）\n");
  console.log("  ID   名前                    長さ  最大隙間  最大段差  板→板   危ない所");
  console.log("  ──── ─────────────────────── ───── ──────── ──────── ──────── ────────");

  for (const def of list) {
    const c = buildCourse(def);
    const a = analyzeCourse(c);

    console.log("  " + def.id.padEnd(5) + def.name.padEnd(22).slice(0, 22)
      + String(Math.round(c.length)).padStart(5) + "m"
      + (a.gap.toFixed(1) + "m").padStart(9)
      + (a.step.toFixed(1) + "m").padStart(9)
      + (a.far.toFixed(1) + "m").padStart(9)
      + "  " + (a.warn.length ? "⚠ " + a.warn.join(" / ") : "—"));

    ok(def.id + " 隙間が 跳べる 範囲", a.gap <= a.gapMax,
      { 隙間: a.gap.toFixed(1), 場所: Math.round(a.gapAt) + "m", 許す: a.gapMax });
    ok(def.id + " 段差が 跳べる 範囲（≦" + 越えられる段差 + "m）", a.step <= 越えられる段差,
      { 段差: a.step.toFixed(1), 場所: Math.round(a.stepAt) + "m" });
    ok(def.id + " 板から 板へ 届く（≦" + 越えられる隙間 + "m）", a.far <= 越えられる隙間,
      { 距離: a.far.toFixed(1), 何: a.farWhat, 場所: Math.round(a.farAt) + "m" });
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  越えられない 恐れ:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
