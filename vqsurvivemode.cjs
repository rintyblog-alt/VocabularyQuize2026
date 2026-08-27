#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivemode.cjs — 遊び方 4 つが 実際に 別の 遊びに なって いるか。

     レース         先に ゴールした 人が 勝ち
     タイムアタック  1 人。相手は 入らない
     サバイバル      落ちたら 戻されず **脱落**。最後の 1 人が 勝ち
     クイズラッシュ  100 秒。**正解した 門の 数**で 順位が つく
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const { COURSE_BY_ID } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { Player, STEP } = await import(道("game/player.js"));
  const { Bot } = await import(道("game/bot.js"));
  const { Sim, PHASE, MODE } = await import(道("game/sim.js"));

  const 走らせる = (mode, opt) => {
    opt = opt || {};
    const course = buildCourse(COURSE_BY_ID[opt.course || "c01"]);
    const sim = new Sim(course, { timeLimit: opt.limit || 120, countdown: 0.1, mode });
    sim.autoGate = 1.0;
    const ps = [], bots = [];
    for (let i = 0; i < (opt.n || 4); i++) {
      const p = new Player({ id: "p" + i, name: "P" + i, colorIndex: i });
      sim.add(p); ps.push(p);
      bots.push(new Bot(p, course, { level: i === 0 ? "perfect" : ["easy", "normal", "hard"][i % 3], seed: 100 + i }));
    }
    sim.localId = ps[0].id;
    sim.start();
    const inputs = new Map();
    let 歩 = 0;
    const 出来事 = [];
    while (sim.phase !== PHASE.FINISHED && 歩 < Math.round((opt.limit || 120) / STEP)) {
      for (const b of bots) inputs.set(b.p.id, b.decide(sim.time));
      for (const e of sim.step(inputs)) 出来事.push(e.t);
      歩++;
    }
    return { sim, ps, course, 出来事, 秒: 歩 * STEP };
  };

  節("① レース");
  {
    const r = 走らせる(MODE.RACE, { n: 4 });
    const 戻り = r.ps.reduce((a, p) => a + p.respawns, 0);
    const 脱落 = r.出来事.filter((t) => t === "eliminated").length;
    console.log("     " + r.秒.toFixed(0) + "秒 / 戻り " + 戻り + " / ゴール " + r.sim.finishOrder.length);
    ok("落ちても 戻される（脱落しない）", 脱落 === 0, 脱落);
    ok("順位が 全員に つく", r.ps.every((p) => p.rank >= 1), r.ps.map((p) => p.rank));
  }

  節("② サバイバル");
  {
    const r = 走らせる(MODE.SURVIVAL, { n: 4, course: "c22" });
    const 脱落 = r.出来事.filter((t) => t === "eliminated").length;
    const 戻り = r.ps.reduce((a, p) => a + p.respawns, 0);
    console.log("     " + r.秒.toFixed(0) + "秒 / 脱落 " + 脱落 + " 回 / 戻り " + 戻り);
    ok("落ちたら 最後は 脱落する", 脱落 >= 1, 脱落);
    /* ★ 1 回で 終わりに したら **8 秒で 決着**して しまった（実測）。
       3 回 までは 戻す。だから 戻りは 0 では ない。 */
    ok("3 回 までは 戻る（すぐ 終わらない）", 戻り >= 1 && r.秒 > 12, { 戻り, 秒: r.秒.toFixed(1) });
    ok("脱落した 人に 印が つく", r.ps.some((p) => p.eliminated), r.ps.map((p) => !!p.eliminated));
    const 生 = r.ps.filter((p) => !p.eliminated);
    ok("終わったら 残りは 1 人 以下（か 全員 ゴール）",
      生.length <= 1 || 生.every((p) => p.finished), { 生: 生.length });
    const 一位 = r.ps.find((p) => p.rank === 1);
    ok("1 位が いる", !!一位, r.ps.map((p) => p.rank));
    if (一位) ok("1 位は 脱落して いない", !一位.eliminated, 一位.eliminated);
  }

  節("③ クイズラッシュ");
  {
    const r = 走らせる(MODE.QUIZRUSH, { n: 4, limit: 60 });
    const rows = r.sim.standings();
    console.log("     順位: " + rows.map((x) => x.rank + "位 正解" + x.correct + " 進み" + Math.round(x.progress)).join(" / "));
    ok("正解の 多い 人が 上に 来る", (() => {
      for (let i = 1; i < rows.length; i++) if (rows[i].correct > rows[i - 1].correct) return false;
      return true;
    })(), rows.map((x) => x.correct));
    ok("同じ 正解数なら 進んだ 人が 上", (() => {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].correct === rows[i - 1].correct && rows[i].progress > rows[i - 1].progress + 0.5) return false;
      }
      return true;
    })(), rows.map((x) => [x.correct, Math.round(x.progress)]));
    ok("制限時間で 終わる", r.秒 <= 61, r.秒.toFixed(1));
  }

  節("④ タイムアタック（画面側の 決まり）");
  {
    /* ロビーが bots:0 を 渡すこと は vqsurvivegame で 見ている。
       ここでは **1 人でも 成立する** ことを 見る。 */
    const r = 走らせる(MODE.RACE, { n: 1 });
    ok("1 人でも 試合に なる", r.ps.length === 1);
    ok("1 人でも 順位が つく", r.ps[0].rank >= 1, r.ps[0].rank);
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
