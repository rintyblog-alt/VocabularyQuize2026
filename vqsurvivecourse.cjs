#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivecourse.cjs — 30 コースを **ボットに 走らせて** 越えられるか 見る。

   要件 35/36 そのもの:
     START → 走る → クイズ → 中間地点 → ゴール が 全 30 本で できること。
     詰み（進めない）・届かない ゴール・不可能な 仕掛け を 出さない。

   ここは 絵を 使わない。game/sim.js（画面と 同じ 中身）を そのまま 回す。
   ★ 画面と 別の 計算を 書いたら 検査の 意味が 無い。

   使い方:
     node vqsurvivecourse.cjs                全部
     node vqsurvivecourse.cjs c07            1 本だけ
     VQ_LEVEL=normal node vqsurvivecourse.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const だけ = process.argv[2] && /^c\d+$/.test(process.argv[2]) ? process.argv[2] : "";
const 段 = process.env.VQ_LEVEL || "perfect";
const 回数 = Number(process.env.VQ_RUNS || 2);

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; }
  else { fail++; bad.push(n + (x !== undefined ? " → " + JSON.stringify(x).slice(0, 160) : "")); }
  return c;
};

(async () => {
  const { COURSES } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { Player, STEP } = await import(道("game/player.js"));
  const { Bot } = await import(道("game/bot.js"));
  const { Sim, PHASE } = await import(道("game/sim.js"));

  const list = だけ ? COURSES.filter((c) => c.id === だけ) : COURSES;
  console.log("コース " + list.length + " 本 / ボットの 強さ " + 段 + " / 1 本 " + 回数 + " 回\n");
  console.log("  ID   名前                    長さ  門 CP  結果      時間   戻り  詰まり");
  console.log("  ──── ─────────────────────── ───── ── ── ───────── ────── ───── ──────");

  const 総括 = [];
  for (const def of list) {
    const t0 = Date.now();
    let 最良 = null;
    for (let run = 0; run < 回数; run++) {
      const course = buildCourse(def);
      const sim = new Sim(course, { timeLimit: 480, countdown: 0.1 });
      sim.autoGate = 1.2;          /* 門は 1.2 秒で 開く（人が 答えたと みなす） */
      const p = new Player({ id: "bot", name: "検査", isLocal: true });
      sim.add(p);
      sim.localId = p.id;
      sim.start();
      const bot = new Bot(p, course, { level: 段, seed: 1000 + run });
      const inputs = new Map();
      let 歩 = 0, 詰まり = 0, 最大詰まり = 0, 前進 = 0, 止まった秒 = 0, 最高到達 = 0;
      const 最大歩 = Math.round(480 / STEP);
      while (sim.phase !== PHASE.FINISHED && 歩 < 最大歩) {
        inputs.set(p.id, bot.decide(sim.time));
        sim.step(inputs);
        歩++;
        if (sim.phase === PHASE.RUNNING) {
          /* ★ 「どこまで 行けたか」は **最高到達**で 見る。
             最後の 位置だと 落ちた 直後は 出発点に 戻っていて、
             「8% で 詰まった」のように 見える（実際 そう 誤読した）。 */
          if (p.progress > 最高到達) 最高到達 = p.progress;
          if (p.progress - 前進 < 0.01) { 止まった秒 += STEP; 最大詰まり = Math.max(最大詰まり, 止まった秒); }
          else { 止まった秒 = 0; 前進 = p.progress; }
        }
        if (p.finished) break;
      }
      const r = {
        finished: p.finished, time: p.finishTime || (歩 * STEP),
        respawns: p.respawns, stuck: 最大詰まり,
        progress: 最高到達, length: course.length,
        gates: course.gates.length, cps: course.checkpoints.length,
        passed: p.gatePassed
      };
      if (!最良 || (r.finished && !最良.finished) || (r.finished && r.time < 最良.time)) 最良 = r;
      if (r.finished) break;   /* 1 回 通れば 十分 */
    }
    const r = 最良;
    const 印 = r.finished ? "✅ 通過   " : "❌ 詰まり ";
    const 割 = ((r.progress / Math.max(1, r.length)) * 100).toFixed(0);
    console.log("  " + def.id.padEnd(5) + def.name.padEnd(22).slice(0, 22)
      + String(Math.round(r.length)).padStart(5) + "m"
      + String(r.gates).padStart(3) + String(r.cps).padStart(3) + "  " + 印
      + (r.finished ? (r.time.toFixed(1) + "s").padStart(6) : (割 + "%").padStart(6))
      + String(r.respawns).padStart(6) + String(r.stuck.toFixed(1)).padStart(7) + "s"
      + "  " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
    総括.push({ def, r });
    ok(def.id + " ゴールできる", r.finished, { 到達: 割 + "%", 戻り: r.respawns, 詰まり: r.stuck.toFixed(1) });
    ok(def.id + " 門を 全部 通る", r.passed >= r.gates, { 通った: r.passed, 全: r.gates });
    ok(def.id + " どこにも 8 秒 以上 詰まらない", r.stuck < 8, r.stuck.toFixed(1));
    ok(def.id + " 中間地点が 1 つ 以上", r.cps >= 1, r.cps);
    ok(def.id + " 門が 2 つ 以上", r.gates >= 2, r.gates);
  }

  /* ── まとめ ── */
  console.log("\n══ まとめ ══");
  const 通った = 総括.filter((x) => x.r.finished).length;
  console.log("  ゴールできた: " + 通った + " / " + 総括.length);
  const 時間 = 総括.filter((x) => x.r.finished).map((x) => x.r.time);
  if (時間.length) {
    時間.sort((a, b) => a - b);
    console.log("  かかった 時間: 最短 " + 時間[0].toFixed(0) + "s / 中央 "
      + 時間[(時間.length / 2) | 0].toFixed(0) + "s / 最長 " + 時間[時間.length - 1].toFixed(0) + "s");
  }
  /* 同じ 仕掛けの 使い回しだけの コースが 無いか */
  const 芯 = new Set(総括.map((x) => x.def.core));
  ok("コースの 芯が 全部 違う", 芯.size === 総括.length, { 種類: 芯.size, 本数: 総括.length });
  const 風景 = {};
  for (const x of 総括) 風景[x.def.theme] = (風景[x.def.theme] || 0) + 1;
  console.log("  風景の 内訳: " + Object.entries(風景).map(([k, v]) => k + "×" + v).join(" / "));

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.slice(0, 30).join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
