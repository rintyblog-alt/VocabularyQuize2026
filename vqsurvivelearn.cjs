#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivelearn.cjs — 遊んだ ぶんが **本体の 学習の 記録に 積み上がるか**。

   ★ 直す前は、VocabuSurvive で 何十問 答えても
     ホームにも Insight にも 1 つも 残らなかった（2026-08-31）。
     本体には すでに 「学習データの 統合」（VQ2.learning）が あり、
     クイズも Quick Mock も VocabuSpeak も そこへ 通って いる。
     **この 遊びだけが 繋がって いなかった。**

   見るもの:
     ① 本体の 口が ある（VQ2.learning.recordResult）
     ② 門に 答えると 1 問ずつ 覚えている
     ③ ゴールすると **記録が 1 本 増える**
     ④ 出どころの 名前が 「その他」に ならない
     ⑤ 二重に 数えない（同じ 試合を 2 度 渡しても 1 本）
     ⑥ 答えの 中身（選んだ 語）を 送って いない

   使い方: node vqsurvivelearn.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 780 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });

  /* ★ 本体の 道具（vq2-app）は 押した ときか 立ち上がりの あとで 読まれる。
     検査では 明示的に 呼んで 待つ（本番でも 5 秒で 必ず 読まれる）。 */
  await pg.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await pg.waitForFunction(() => !!(window.VQ2 && window.VQ2.learning), null, { timeout: 90000, polling: 300 });

  節("① 本体の 口");
  const 口 = await pg.evaluate(() => {
    const L = window.VQ2 && window.VQ2.learning;
    return { ある: !!(L && typeof L.recordResult === "function"),
             鍵: L && L.KEYS ? L.KEYS.sessions : "",
             出どころ: L && L.SOURCES ? Object.keys(L.SOURCES).length : 0 };
  });
  見(口.ある, "★ 学習の 記録の 口が ある", 口);

  /* 積む 前の 本数 */
  const 前 = await pg.evaluate(() => {
    const L = window.VQ2.learning;
    return (L.listSessions ? L.listSessions() : []).length;
  });

  節("② 走って ゴールする");
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
  await 待(1400);
  await pg.evaluate(() => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.botCount = 1; lb.mode = "race"; lb._save(); lb._render();
    r.querySelector(".vs-lb-start").click(); });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 90000 });
  await 待(3800);

  /* ボットに 走らせて 早送り（vqsurvivegame と 同じ 手）。
     ★ 位置を 直に 書き換える 手は **効かない**（次の 歩で 物理が 上書きする）。
       実測: 90 秒 走らせても progress が 進まず ゴールしなかった。 */
  const fin = await pg.evaluate(async () => {
    const app = window.VocabuSurvive.__app;
    const ms = app.shell.get("match");
    const { Bot } = await import("/assets/vocabu-survive/game/bot.js");
    const bot = new Bot(ms.local, ms.course, { level: "perfect", seed: 3 });
    /* 門は **半分 わざと 外す**（正誤の 両方が 記録に 入るか 見る）。 */
    const orig = ms._collectInputs.bind(ms);
    ms._collectInputs = function () {
      orig();
      if (ms.sim.phase === "running" && !ms.local.finished) {
        ms.inputs.set(ms.local.id, bot.decide(ms.sim.time));
      }
      if (ms.quiz && ms.quiz.open && !ms.quiz.answered && ms.quiz.q) {
        const n = (ms._qlog || []).length;
        ms.quiz._pick(n % 2 === 0 ? ms.quiz.q.answer : (ms.quiz.q.answer + 1) % 4);
      }
    };
    return new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (ms.local.finished || ms.sim.phase === "finished" || Date.now() - t0 > 100000) {
          clearInterval(iv);
          res({ finished: !!ms.local.finished, 問: (ms._qlog || []).length,
                秒: Math.round((Date.now() - t0) / 100) / 10, 積: ms._learn || null });
        }
      }, 250);
    });
  });
  console.log("     ", JSON.stringify(fin));
  見(fin.問 > 0, "★ 門に 答えた ぶんを 覚えている", fin.問);
  await 待(2600);

  節("③ 記録が 増える");
  const 後 = await pg.evaluate(() => {
    const L = window.VQ2.learning;
    const s = (L.listSessions ? L.listSessions() : []);
    const mine = s.filter((x) => x && x.source === "vocabusurvive");
    const one = mine[0] || null;
    return {
      本数: s.length, 自分: mine.length,
      名: L.sourceLabel ? L.sourceLabel("vocabusurvive") : "",
      中身: one ? { id: one.id, 問: one.questionCount, 正: one.correctCount,
                    誤: one.incorrectCount, 題: one.title, mode: one.mode,
                    科: one.subject, 秒: one.durationSeconds } : null,
      答え: one && L.listAnswers ? L.listAnswers({ sessionId: one.id }).length : 0
    };
  });
  見(後.本数 > 前, "★ 学習の 記録が 1 本 増えた", { 前, 後: 後.本数 });
  見(後.自分 >= 1, "★ 出どころが VocabuSurvive の 記録が ある", 後.自分);
  見(後.名 === "VocabuSurvive", "★ 出どころの 名前が 「その他」に ならない", 後.名);
  見(後.中身 && 後.中身.問 > 0, "問題の 数が 入っている", 後.中身);
  見(後.中身 && (後.中身.正 + 後.中身.誤) === 後.中身.問, "正誤の 合計が 問題の 数と 合う", 後.中身);
  見(後.答え === (後.中身 ? 後.中身.問 : -1), "1 問ずつの 記録も 残る", { 答え: 後.答え, 問: 後.中身 && 後.中身.問 });

  節("④ 二重に 数えない");
  const 二 = await pg.evaluate(() => {
    const L = window.VQ2.learning;
    const s = L.listSessions();
    const mine = s.filter((x) => x && x.source === "vocabusurvive");
    const one = mine[0];
    /* 同じ 試合を もう一度 渡す */
    const ms = window.VocabuSurvive.__app.shell.get("match");
    const 前 = L.listSessions().length;
    L.recordResult({
      id: one.id.replace(/^ls_/, ""), source: "vocabusurvive", mode: one.mode,
      title: one.title, items: [{ questionId: "x", answered: true, correct: true, score: 1, maxScore: 1 }],
      questionsSnapshot: [{ id: "x", type: "choice4" }],
      startedAt: one.startedAt, finishedAt: one.completedAt
    }, { source: "vocabusurvive" });
    return { 前, 後: L.listSessions().length };
  });
  見(二.後 === 二.前, "★ 同じ 試合を 2 度 渡しても 1 本の まま", 二);

  節("⑤ 答えの 中身を 送って いない");
  const 中 = await pg.evaluate(() => {
    const L = window.VQ2.learning;
    const one = L.listSessions().filter((x) => x && x.source === "vocabusurvive")[0];
    const a = L.listAnswers({ sessionId: one.id });
    const 文字 = JSON.stringify(a);
    /* 選んだ 語・正解の 語が そのまま 入って いない こと。 */
    return { 見捨てる: /見捨てる|鮮やかな/.test(文字), 例: a[0] || null };
  });
  見(中.見捨てる === false, "★ えらんだ 語・答えの 語は 残さない", 中.例);

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await browser.close();
  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
