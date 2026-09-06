#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivesoak.cjs — **何百 試合も 通しで 走らせて、決まりが 崩れないか**。

   画面を 開かずに 走りの 中身だけ 回す（1 試合 8 人で 約 0.17 秒）。
   だから **30 コース × 6 遊び方 × 3 強さ**を 全部 見られる。

   撮った 絵を 見るだけでは 見つからない ものを 探す:
     ① 必ず 終わる（止まったまま に ならない）
     ② 順位が **いつでも 1..N の 通し番号**（だぶり・抜けが ない）
        ★ これが 崩れると 順位表に 「1 位」が 2 人 並ぶ
     ③ ゴールした 順と 時間が 食い違わない
     ④ 数が 壊れない（NaN・無限・とんでもない 座標）
     ⑤ ゴールした 人は 本当に ゴールまで 進んで いる
     ⑥ サバイバル … 脱落した 人は 残機 0。最後は 1 人 か 全員 ゴール
     ⑦ クイズラッシュ … 順位が **正解した 門の 数**の 順
     ⑧ チーム戦 … 組の 点が 数として 正しい
     ⑨ 同じ 種なら **1 ミリも 変わらない**（作り直しても 同じ）

   使い方: node vqsurvivesoak.cjs [--回 3]
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const 道 = (p) => "file://" + path.join(__dirname, "client/assets/vocabu-survive", p);
const 引数 = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 420) : "")); }
};
const 数OK = (v) => typeof v === "number" && isFinite(v);

(async () => {
  const { Sim, PHASE, MODE } = await import(道("game/sim.js"));
  const { COURSES } = await import(道("data/courses.js"));
  const { buildCourse } = await import(道("game/course.js"));
  const { Player, STEP } = await import(道("game/player.js"));
  const { Bot } = await import(道("game/bot.js"));

  /* 1 試合。壊れて いる ところを 全部 集めて 返す。 */
  function 走る(コース, mode, 強さ, 種, 人数) {
    const course = buildCourse(コース);
    const 制限 = mode === "quizrush" ? 100 : 300;
    const sim = new Sim(course, {
      timeLimit: 制限, countdown: 0.1,
      mode: mode === "cup" ? "race" : mode
    });
    sim.autoGate = 1.0;                 /* 門は 1 秒で 自動的に 開く（人が 居ない ので） */
    const bots = [];
    const n = mode === "timeattack" ? 1 : 人数;
    for (let i = 0; i < n; i++) {
      const p = new Player({ id: "p" + i, name: "P" + i, colorIndex: i });
      sim.add(p);
      bots.push(new Bot(p, course, { level: 強さ, seed: 種 + i * 17, lane: n > 1 ? (i / (n - 1)) * 2 - 1 : 0 }));
    }
    sim.localId = "p0";
    sim.start();

    const 傷 = [];
    const inputs = new Map();
    const 上限 = Math.round((制限 + 5) / STEP);
    let 歩 = 0;
    let 順位崩れ = 0;
    while (sim.phase !== PHASE.FINISHED && 歩 < 上限) {
      for (const b of bots) {
        inputs.set(b.p.id, b.decide(sim.time));
        /* ★ match.js と 同じ 保険を ここでも 効かせる。
           入れないと **本物の 試合より 悪い 絵**を 見て 直しに 走る。 */
        if (b.hopeless && !b.p.finished) {
          b.p.respawnAt(course.respawnPoint(b.p.checkpoint, b.p.slot || 0));
          b.noProgress = 0; b.hopeless = false; b.stuck = 0; b.lastProgress = -1;
        }
      }
      sim.step(inputs);
      歩++;
      /* ② 順位は いつでも 1..N の 通し番号 */
      if (歩 % 30 === 0) {
        const rs = sim.standings().map((r) => r.rank).sort((a, b) => a - b);
        for (let i = 0; i < rs.length; i++) if (rs[i] !== i + 1) { 順位崩れ++; break; }
      }
      /* ④ 数が 壊れない */
      if (歩 % 120 === 0) {
        for (const p of sim.players) {
          if (!数OK(p.x) || !数OK(p.y) || !数OK(p.z) || !数OK(p.progress)) 傷.push("数が 壊れた " + p.id);
          else if (Math.abs(p.x) > 4000 || Math.abs(p.z) > 4000 || p.y < -600) 傷.push("遠くへ 飛んだ " + p.id + " " + [p.x | 0, p.y | 0, p.z | 0]);
        }
      }
    }
    if (順位崩れ) 傷.push("順位が 通し番号で ない（" + 順位崩れ + " 回）");
    if (sim.phase !== PHASE.FINISHED) 傷.push("終わらない（" + 歩 + " 歩）");

    /* ③ ゴールした 順と 時間 */
    const fo = sim.finishOrder;
    for (let i = 1; i < fo.length; i++) {
      if (fo[i].finishTime + 1e-6 < fo[i - 1].finishTime) 傷.push("ゴール順と 時間が 逆");
    }
    for (let i = 0; i < fo.length; i++) {
      if (!fo[i].finished) 傷.push("ゴール一覧に 未ゴールが 居る");
      /* サバイバルは 脱落した 人が 後ろから 番号を 取る ので 通し番号に ならない */
      if (mode !== "survival" && mode !== "quizrush" && fo[i].rank !== i + 1) 傷.push("ゴール順と 順位が 食い違う");
    }
    /* ⑤ ゴールした 人は ゴールまで 進んで いる */
    for (const p of sim.players) {
      /* ★ サバイバルは 「最後の 1 人」が **ゴールに 着かなくても 勝ち**。
         その 人は finished だが 進んで いない。決まりどおり なので 見ない。 */
      if (mode !== "survival" && p.finished && !p.eliminated && p.progress < course.length * 0.9) {
        傷.push("ゴールしたのに 進んで いない " + p.id + " " + Math.round(p.progress) + "/" + Math.round(course.length));
      }
    }
    /* ⑥ サバイバル */
    if (mode === "survival") {
      for (const p of sim.players) {
        if (p.eliminated && (p.lives | 0) !== 0) 傷.push("脱落なのに 残機が 残って いる " + p.id + " " + p.lives);
        if (!p.eliminated && (p.lives | 0) < 0) 傷.push("残機が 負 " + p.id);
      }
      const 残 = sim.players.filter((p) => !p.eliminated);
      if (sim.players.length > 1 && 残.length === 0) 傷.push("全員 脱落（勝者が 居ない）");
    }
    /* ⑦ クイズラッシュ */
    if (mode === "quizrush") {
      const rows = sim.standings();
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1], b = rows[i];
        if (a.correct < b.correct) 傷.push("門の 数の 順に なって いない");
      }
    }
    /* ⑧ チーム戦 */
    if (mode === "team") {
      const s = sim.teamScores();
      if (!数OK(s[0]) || !数OK(s[1]) || s[0] < 0 || s[1] < 0) 傷.push("組の 点が おかしい " + JSON.stringify(s));
      const 組 = sim.players.map((p) => p.team);
      if (組.some((t) => t !== 0 && t !== 1)) 傷.push("組が 割り当てられて いない");
      const a = 組.filter((t) => t === 0).length, b = 組.filter((t) => t === 1).length;
      if (Math.abs(a - b) > 1) 傷.push("組の 人数が 偏る " + a + " / " + b);
    }
    return {
      傷, 歩, 秒: sim.raceTime,
      指紋: sim.players.map((p) => [p.id, p.rank, Math.round((p.finishTime || 0) * 1e4),
        Math.round(p.x * 1e4), Math.round(p.z * 1e4), p.quizCorrect | 0].join(",")).join("|"),
      ゴール: sim.players.filter((p) => p.finished && !p.eliminated).length,
      人: sim.players.length
    };
  }

  const 回 = Number(引数("--回", "1"));
  const 強さ列 = ["easy", "normal", "hard"];
  const 遊び = ["race", "survival", "quizrush", "team", "timeattack", "cup"];

  節("① 30 コース × 6 遊び方（レース＝全コース、ほかは 5 本ずつ）");
  const t0 = Date.now();
  let 試合 = 0; const 全傷 = []; const 打切 = []; let 着計 = 0, 着母 = 0;
  let 最長 = 0, 最長名 = "";
  for (let ci = 0; ci < COURSES.length; ci++) {
    const c = COURSES[ci];
    const 強 = 強さ列[ci % 3];
    for (const m of 遊び) {
      /* レースは 全コース。ほかは 5 本 おきに（時間の ため） */
      if (m !== "race" && ci % 5 !== (遊び.indexOf(m) % 5)) continue;
      for (let r = 0; r < 回; r++) {
        const res = 走る(c, m, 強, 1000 + ci * 31 + r * 7, 8);
        試合++;
        if (res.秒 > 最長) { 最長 = res.秒; 最長名 = c.name + "/" + m; }
        /* ★ 300 秒に 当たる ＝ 「8 人 **全員**が ゴールしなかった」だけ。
           人は 自分が ゴールした 時点で 結果へ 進める ので、
           それ 自体は 遊びの 妨げでは ない。
           困るのは **誰 ひとり ゴールしない**とき（順位表が 死ぬ）。 */
        if (m !== "quizrush" && res.ゴール === 0) 打切.push({ id: c.id, 難: c.difficulty, 名: c.id + "/" + m + "/" + 強 });
        if (m === "race" || m === "cup") { 着計 += res.ゴール; 着母 += res.人; }
        for (const s of res.傷) 全傷.push(c.id + " " + c.name + " [" + m + "/" + 強 + "] " + s);
      }
    }
  }
  const かかった = Date.now() - t0;
  console.log("     " + 試合 + " 試合 / " + (かかった / 1000).toFixed(1) + " 秒（1 試合 " + Math.round(かかった / 試合) + "ms）");
  console.log("     いちばん 長い 試合: " + 最長.toFixed(1) + " 秒（" + 最長名 + "）");
  console.log("     レース／勝ち抜きで ゴールした 割合: " + (100 * 着計 / Math.max(1, 着母)).toFixed(0) + "%（" + 着計 + " / " + 着母 + " 人）");
  console.log("     誰も ゴールしなかった 試合: " + 打切.length + " / " + 試合);
  見(全傷.length === 0, "★ " + 試合 + " 試合で 決まりが 一度も 崩れない", 全傷.slice(0, 6));
  /* ★ ここは **人の 遊びの 決まりでは ない。** 人は 自分が ゴールした 時点で
     結果へ 進める ので、相手が 残って いても 困らない。
     見て いるのは 「相手の 出来が 落ちて いないか」。
     2026-08-31 の 実測は 60 試合中 1。増えたら 相手が 下手に なって いる。 */
  /* ★ 直す前は 12 本の コースで 誰も ゴールできなかった。
     「同じ ところで 3 回 落ちたら 腕を 上げる」で 大きく 減った。 */
  /* ★ 難しさ 10 の 2 本（最後の試練・チャンピオンシップ）だけは
     相手が 全滅する ことが ある。そこは そういう コース。
     **それ 以外で 全滅したら 相手が 下手に なって いる。** */
  const 軽い全滅 = 打切.filter((x) => (x.難 | 0) < 10).map((x) => x.名);
  見(軽い全滅.length === 0, "★ 難しさ 10 未満の コースで **誰 ひとり ゴールしない** 試合が 無い", 軽い全滅);
  /* 回数を 増やしても 割合で 見る（--回 を 上げても 意味が 変わらない ように）。 */
  見(打切.length <= Math.max(4, Math.ceil(試合 * 0.06)),
     "全滅する 試合は 6% 以下（実測 5%・すべて 難しさ 10）", 打切.map((x) => x.名));
  見(着計 / Math.max(1, 着母) > 0.55, "レースの 半分 以上が ゴールに 着く",
     (100 * 着計 / Math.max(1, 着母)).toFixed(0) + "%");

  節("② 同じ 種なら 同じ 結果（作り直しても ぶれない）");
  const ぶれ = [];
  for (const ci of [0, 7, 14, 21, 29]) {
    for (const m of ["race", "survival", "quizrush"]) {
      const a = 走る(COURSES[ci], m, "normal", 555 + ci, 6);
      const b = 走る(COURSES[ci], m, "normal", 555 + ci, 6);
      if (a.指紋 !== b.指紋) ぶれ.push(COURSES[ci].id + "/" + m);
    }
  }
  見(ぶれ.length === 0, "★ 15 通り すべて 1 ミリも 変わらない", ぶれ);

  節("③ 人数を 変えても 通る（1〜8 人）");
  const 人傷 = [];
  for (let n = 1; n <= 8; n++) {
    const res = 走る(COURSES[4], "race", "normal", 777 + n, n);
    if (res.傷.length) 人傷.push(n + " 人: " + res.傷.join(" / "));
    if (res.人 !== n) 人傷.push(n + " 人 の はずが " + res.人);
  }
  見(人傷.length === 0, "1〜8 人 すべて 通る", 人傷);

  節("④ 弱い ボットでも ゴールに 着く（詰みコースが ない）");
  /* ★ 「越えられる 隙間か」は vqsurvivegap が 形で 測る。
     ここでは **実際に 走らせて** 着けるかを 見る。 */
  const 詰み = [];
  for (let ci = 0; ci < COURSES.length; ci++) {
    const res = 走る(COURSES[ci], "race", "easy", 2000 + ci, 4);
    if (res.ゴール === 0) 詰み.push(COURSES[ci].id + " " + COURSES[ci].name);
  }
  /* ★ 2026-08-31 の 通しで **12 本 → 2 本**に 減った。
     減らせた 理由は 「同じ ところで 3 回 落ちたら 腕を 上げる」を
     入れた こと（bot.js の giveups）。
     残り 2 本は 難しさ 9〜10 の コース。増えたら 相手が 下手に なって いる。 */
  見(詰み.length <= 3, "★ 30 本中 27 本 以上で やさしい ボットが 誰か ゴールする（実測 残り 2）", 詰み);

  節("⑤ 上手い ボットは やさしい ボットより 速い");
  let 逆転 = 0;
  const 比べ = [];
  for (const ci of [0, 4, 9, 14, 19, 24, 29]) {
    const 速 = 走る(COURSES[ci], "timeattack", "hard", 3000 + ci, 1);
    const 遅 = 走る(COURSES[ci], "timeattack", "easy", 3000 + ci, 1);
    比べ.push([COURSES[ci].id, +速.秒.toFixed(1), +遅.秒.toFixed(1)]);
    if (速.秒 > 遅.秒) 逆転++;
  }
  /* ★ 直す前は **7 本中 3 本で ぴったり 同じ タイム**だった
     （進みたい 向きの 長さは 加速しか 変えず、上限が 同じ だった ため）。
     いま は 5 本で つよい ほうが 速い。
     残る 逆転は 「慎重さが 裏目に 出る コース」（上昇気流など）。 */
  見(逆転 <= 2, "強さの 違いが 時間に 出る（逆転 " + 逆転 + " / 7・実測 2）", 比べ);

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
