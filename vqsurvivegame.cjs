#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivegame.cjs — **端から端まで 実際に 遊べるか**。

   START → ロビー → コースを 選ぶ → 試合 → 走る → 門 → ゴール → 結果

   要件 33 の 「browser automation で 確認」そのもの。
   絵も 撮る（見て 判断する ため）。

   使い方: node vqsurvivegame.cjs        （--shot で 絵を 多めに）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { serve } = require("./vqsrvserve.cjs");
const fs = require("fs");
const PORT = Number(process.env.VQ_PORT || 8976);
const BASE = "http://127.0.0.1:" + PORT;
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const OUT = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
const 絵 = process.argv.includes("--shot");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(PORT);
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
           "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"]
  });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("pageerror: " + String(e && e.message || e)));
    pg.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 240)); });

    /* ★ 未ログインだと 認証の 覆いが **何度でも 出てくる**。
       出るたび 本体が display:none に なり、板の 大きさが 0 に なる。
       検査の 間だけ 見張って 消し続ける（本番の 動きは 変えない）。 */
    const どける = () => pg.evaluate(() => {
      const 消す = () => {
        document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
        for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
          const e = document.getElementById(id); if (e) e.classList.add("hidden");
        }
      };
      消す();
      if (!window.__vqTestGuard) window.__vqTestGuard = setInterval(消す, 120);
    });
    const 影 = () => pg.evaluateHandle(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot);

    節("① 開く");
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 20000 });
    await どける();
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened,
      null, { timeout: 45000, polling: 250 });
    await どける();
    ok("読み込み画面が 出る", (await pg.evaluate(() => window.VocabuSurvive.state().screen)) === "loading");
    await pg.waitForFunction(() => {
      const st = window.VocabuSurvive.state();
      return st.loaded && st.loaded.length >= 5;
    }, null, { timeout: 45000, polling: 250 }).catch(() => {});
    const st1 = await pg.evaluate(() => window.VocabuSurvive.state());
    ok("部品が 全部 読めた", st1.loaded.length >= 5, st1);
    ok("読み込みで 例外が 出ていない", !st1.error, st1.error);

    節("② START → ロビー");
    /* ★ 影の DOM と START が 出るまで 待つ。**時間で 見る**（polling）。
       出る 前に 押すと null で 落ちる。 */
    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 45000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-load-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000 });
    ok("ロビーへ 移る", true);
    await 待つ(500);
    const lb = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return {
        courses: r.querySelectorAll(".vs-lb-cc").length,
        tiers: r.querySelectorAll(".vs-lb-tier").length,
        modes: r.querySelectorAll(".vs-lb-mode").length,
        colors: r.querySelectorAll(".vs-lb-color").length,
        party: r.querySelectorAll(".vs-lb-prow").length,
        preview: !!r.querySelector(".vs-lb-pv-nm"),
        pvName: r.querySelector(".vs-lb-pv-nm") ? r.querySelector(".vs-lb-pv-nm").textContent : "",
        start: !!r.querySelector(".vs-lb-start"),
        ready: !!r.querySelector(".vs-lb-ready")
      };
    });
    ok("コースが 30 本 並ぶ", lb.courses === 30, lb.courses);
    ok("難しさの 段が 7 つ", lb.tiers === 7, lb.tiers);
    ok("遊び方が 選べる", lb.modes >= 2, lb.modes);
    ok("色が 8 つ 選べる", lb.colors === 8, lb.colors);
    ok("下見が 出る", lb.preview && lb.pvName.length > 0, lb.pvName);
    ok("自分＋ボットが 並ぶ", lb.party >= 4, lb.party);
    ok("準備 と スタートの ボタンが ある", lb.start && lb.ready, lb);
    if (絵) await pg.screenshot({ path: OUT + "/survive-lobby.png" });

    節("③ 試合を 始める");
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 25000 });
    ok("試合の 画面へ 移る", true);
    /* ★ 初めてなら「あそび方」が 出る。出ていれば 中身を 見てから 閉じる。 */
    const 説明 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-help");
      if (!el || el.getAttribute("data-on") !== "1") return null;
      const rows = r.querySelectorAll(".vs-help-row").length;
      const cols = r.querySelectorAll(".vs-help-col").length;
      el.querySelector(".vs-btn").click();
      return { rows, cols };
    });
    ok("初めては あそび方が 出る", !!説明, 説明);
    if (説明) {
      ok("キーボード・指・遊び方の 3 つが ある", 説明.cols === 3, 説明.cols);
      ok("操作が 10 個 以上 書いてある", 説明.rows >= 10, 説明.rows);
    }
    await pg.waitForFunction(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const cv = r.querySelector(".vs-match canvas.vs-canvas");
      return cv && cv.width > 200;
    }, null, { timeout: 20000 }).catch(() => {});
    const m1 = await pg.evaluate(() => {
      const app = window.VocabuSurvive.__app;
      const ms = app.shell.get("match");
      return {
        w: ms.canvas.width, h: ms.canvas.height,
        players: ms.sim ? ms.sim.players.length : 0,
        course: ms.course ? ms.course.name : "",
        length: ms.course ? Math.round(ms.course.length) : 0,
        gates: ms.course ? ms.course.gates.length : 0,
        obstacles: ms.course ? ms.course.obstacles.length : 0,
        questions: ms.questions ? ms.questions.length : 0
      };
    });
    console.log("     " + m1.course + " / " + m1.length + "m / 門 " + m1.gates
      + " / 仕掛け " + m1.obstacles + " / 人 " + m1.players + " / 問題 " + m1.questions);
    ok("人が 4 人 以上", m1.players >= 4, m1.players);
    ok("問題を 用意できた", m1.questions >= 3, m1.questions);

    節("④ 合図 → 走る");
    /* ★ 決め打ちの 待ちに しない。合図が 終わるまで 待つ。 */
    await pg.waitForFunction(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      return ms && ms.sim && ms.sim.phase === "running";
    }, null, { timeout: 20000 }).catch(() => {});
    const ph = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").sim.phase);
    ok("合図が 終わって 走れる", ph === "running", ph);
    /* ★ 板の 大きさは **描き始めてから** 見る。
       画面へ 出た 直後は まだ 既定の 300×150 のまま。 */
    const cv = await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      return { w: ms.canvas.width, h: ms.canvas.height, cw: ms.canvas.clientWidth, draws: ms.renderer.stats.draws };
    });
    ok("板に 大きさが 入る", cv.w > 200 && cv.h > 200, cv);
    ok("実際に 描いている（描き回数 > 0）", cv.draws > 0, cv);
    /* 実際に 鍵盤で 走らせる */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const cv = r.querySelector(".vs-match canvas.vs-canvas");
      cv.focus();
    });
    await pg.keyboard.down("KeyW");
    await 待つ(2500);
    const mv = await pg.evaluate(() => {
      const p = window.VocabuSurvive.__app.shell.get("match").local;
      return { z: p.z, sp: p.speed, pr: p.progress, g: p.grounded };
    });
    ok("自分が 前へ 進む", mv.pr > 6, mv);
    ok("速さが 出ている", mv.sp > 4, mv);
    if (絵) await pg.screenshot({ path: OUT + "/survive-run.png" });

    節("⑤ 跳ぶ");
    const y0 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").local.y);
    await pg.keyboard.down("Space");
    await 待つ(200);
    const y1 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").local.y);
    await pg.keyboard.up("Space");
    ok("跳べる", y1 > y0 + 0.4, { y0, y1 });

    節("⑥ クイズの 門");
    /* 門まで 走らせる */
    let 出た = false;
    for (let i = 0; i < 60; i++) {
      await 待つ(400);
      出た = await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const q = r.querySelector(".vs-quiz");
        return !!q && q.getAttribute("data-on") === "1";
      });
      if (出た) break;
    }
    await pg.keyboard.up("KeyW");
    ok("門に 着くと クイズが 出る", 出た);
    if (出た) {
      const q = await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        return {
          prompt: r.querySelector(".vs-quiz-q").textContent,
          opts: Array.from(r.querySelectorAll(".vs-quiz-opt")).filter((b) => b.style.display !== "none").length,
          timer: !!r.querySelector(".vs-quiz-ring")
        };
      });
      console.log("     問題: " + q.prompt.slice(0, 40) + " / 選択肢 " + q.opts);
      ok("問題文が ある", q.prompt.length > 0, q.prompt);
      ok("選択肢が 4 つ", q.opts === 4, q.opts);
      ok("残り時間の 輪が ある", q.timer);
      if (絵) await pg.screenshot({ path: OUT + "/survive-quiz.png" });
      /* 正解を 押す */
      const 正 = await pg.evaluate(() => {
        const app = window.VocabuSurvive.__app;
        const ms = app.shell.get("match");
        return ms.quiz.q ? ms.quiz.q.answer : 0;
      });
      await pg.evaluate((i) => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        r.querySelectorAll(".vs-quiz-opt")[i].click();
      }, 正);
      await 待つ(900);
      const after = await pg.evaluate(() => {
        const p = window.VocabuSurvive.__app.shell.get("match").local;
        return { correct: p.quizCorrect, boost: p.boost, gates: p.gatePassed };
      });
      ok("正解が 数えられる", after.correct === 1, after);
      ok("ごほうびの 加速が つく", after.boost > 0, after);
      ok("門を 通った 数が 増える", after.gates === 1, after);
    }

    節("⑦ ゴールまで（ボットに 走らせて 早送り）");
    const fin = await pg.evaluate(async () => {
      const app = window.VocabuSurvive.__app;
      const ms = app.shell.get("match");
      /* 自分にも ボットを 付けて 最後まで 走らせる（絵は 動いたまま） */
      const { Bot } = await import("/assets/vocabu-survive/game/bot.js");
      const bot = new Bot(ms.local, ms.course, { level: "perfect", seed: 3 });
      ms.sim.autoGate = 0.8;
      const orig = ms._collectInputs.bind(ms);
      ms._collectInputs = function () {
        orig();
        if (ms.sim.phase === "running" && !ms.local.finished) {
          ms.inputs.set(ms.local.id, bot.decide(ms.sim.time));
        }
      };
      return new Promise((res) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (ms.local.finished || ms.sim.phase === "finished" || Date.now() - t0 > 100000) {
            clearInterval(iv);
            res({ finished: ms.local.finished, time: ms.local.finishTime,
                  rank: ms.local.rank, pr: ms.local.progress, len: ms.course.length,
                  correct: ms.local.quizCorrect, gates: ms.local.gatePassed });
          }
        }, 250);
      });
    });
    console.log("     " + JSON.stringify(fin));
    ok("ゴールできる", fin.finished === true, fin);

    節("⑧ 結果");
    await 待つ(2200);
    const rs = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-res");
      return {
        on: el && el.getAttribute("data-on") === "1",
        title: r.querySelector(".vs-res-title") ? r.querySelector(".vs-res-title").textContent : "",
        stats: r.querySelectorAll(".vs-res-stat").length,
        rows: r.querySelectorAll(".vs-res-row").length,
        /* ★ **見えている ものだけ** 数える。
           勝ち抜きの「次の ラウンドへ」は 同じ 場所に あるが、
           勝ち抜き以外では 隠れている（隠れている ものを 数えると
           「押せる ボタンが 4 つ ある」と 読み違える）。 */
        btns: Array.from(r.querySelectorAll(".vs-res-btns .vs-btn"))
          .filter((b) => !b.classList.contains("vs-hide")).length,
        btnAll: r.querySelectorAll(".vs-res-btns .vs-btn").length,
        btnText: Array.from(r.querySelectorAll(".vs-res-btns .vs-btn"))
          .filter((b) => !b.classList.contains("vs-hide")).map((b) => b.textContent)
      };
    });
    ok("結果が 出る", rs.on === true, rs);
    ok("順位が 出る", /位/.test(rs.title), rs.title);
    ok("成績が 4 つ 出る（時間/クイズ/戻り/XP）", rs.stats === 4, rs.stats);
    ok("全員の 一覧が 出る", rs.rows >= 4, rs.rows);
    ok("もう一度 / ロビー / 戻る の 3 つ", rs.btns === 3, rs.btnText);
    /* ★ 数で 決め打ちしない。ボタンは これからも 増える。
       「その 場面で 出て いない ものが 隠れている」ことだけ 見る。 */
    ok("いま 使えない ボタンは 隠れている（次の ラウンドへ／間違えた 単語で）",
      rs.btnAll > rs.btns && !rs.btnText.some((t) => /次の ラウンドへ|間違えた 単語で/.test(t)),
      [rs.btnAll, rs.btns, rs.btnText]);

    節("⑦-a 実際に 間違えると 覚える");
    /* 見た目だけ 作っても 意味が ない。**本当の 門で 間違えて** 溜まるか。 */
    const 溜 = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      if (m.result && m.result.hide) m.result.hide();
      m._missed = [];
      m._done = false;
      const q = m.questions[0];
      const 誤 = q.answer === 0 ? 1 : 0;
      /* 門を 開けて、わざと 違う ものを 押す */
      m.pendingGate = m.course.gates[0];
      m._lastQ = q;
      m._answer(誤, false);
      await new Promise((x) => setTimeout(x, 200));
      /* 同じ 問題を もう一度 間違えても 増えない（だぶらせない） */
      m.pendingGate = m.course.gates[0];
      m._lastQ = q;
      m._answer(誤, false);
      await new Promise((x) => setTimeout(x, 200));
      /* 正解は 溜めない */
      const q2 = m.questions[1];
      m.pendingGate = m.course.gates[0];
      m._lastQ = q2;
      m._answer(q2.answer, true);
      await new Promise((x) => setTimeout(x, 200));
      return { 数: m._missed.length, 中: m._missed.slice(0, 2),
        問: q.prompt, 答: q.choices[q.answer], 押: q.choices[誤] };
    });
    ok("**間違えると 溜まる**", 溜.数 === 1, 溜);
    ok("同じ 問題は だぶらない", 溜.数 === 1, 溜.数);
    ok("正解は 溜めない", 溜.数 === 1, 溜);
    ok("問題文が 入る", 溜.中[0] && 溜.中[0].q === 溜.問, 溜);
    ok("正しい 答えが 入る", 溜.中[0] && 溜.中[0].a === 溜.答, 溜);
    ok("押した ものが 入る", 溜.中[0] && 溜.中[0].y === 溜.押, 溜);

    節("⑦-b 間違えた 単語が 出る");
    /* ★ 数だけ 出しても 学びに ならない。**何を 間違えたのか**を 出す。 */
    const 誤 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      m.result.show({
        rank: 2, total: 4, finished: true, time: 40, correct: 1, wrong: 2, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "race", standings: [], courseName: "検査",
        splits: [], bestSplits: [],
        missed: [{ q: "enormous", a: "巨大な", y: "小さな" }, { q: "adequate", a: "十分な", y: "" }]
      });
      const el = r.querySelector(".vs-res-miss");
      return {
        出: !!el && !el.classList.contains("vs-hide"),
        見: (el && el.querySelector(".vs-res-splab") || {}).textContent,
        行: Array.from(r.querySelectorAll(".vs-res-miss1")).map((e) => e.textContent)
      };
    });
    ok("間違えた 単語の 欄が 出る", 誤.出, 誤);
    ok("何個 か 出る", /2 個/.test(String(誤.見)), 誤.見);
    ok("**単語と 正しい 答えが 出る**", 誤.行[0] && /enormous/.test(誤.行[0]) && /巨大な/.test(誤.行[0]), 誤.行);
    ok("えらんだ ものも 出る", /小さな/.test(誤.行[0]), 誤.行[0]);
    ok("時間切れは えらんだ ものを 出さない", 誤.行[1] && !/えらんだ/.test(誤.行[1]), 誤.行[1]);
    const 無 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      m.result.show({ rank: 1, total: 4, finished: true, time: 40, correct: 3, wrong: 0, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "race", standings: [], courseName: "検査",
        splits: [], bestSplits: [], missed: [] });
      const el = r.querySelector(".vs-res-miss");
      return !el || el.classList.contains("vs-hide");
    });
    ok("全問 正解なら 出さない", 無 === true, 無);

    節("⑦-c 間違えた 単語で もう一度");
    const 復 = await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      m.result.show({ rank: 2, total: 4, finished: true, time: 40, correct: 1, wrong: 3, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "race", standings: [], courseName: "検査",
        splits: [], bestSplits: [],
        missed: [{ q: "ZQAlpha", a: "アルファ", y: "" }, { q: "ZQBeta", a: "ベータ", y: "" },
                 { q: "ZQGamma", a: "ガンマ", y: "" }, { q: "ZQDelta", a: "デルタ", y: "" }] });
      /* ★ 位置で 取らない。ボタンが 増える たびに 検査が ずれる。 */
      const b = Array.from(r.querySelectorAll(".vs-res-btns .vs-btn"))
        .filter((e) => /間違えた 単語で/.test(e.textContent))[0];
      return { 文: b ? b.textContent : "", 出: !!b && !b.classList.contains("vs-hide") };
    });
    ok("「間違えた 単語で もう一度」が 出る", 復.出 && /間違えた 単語で/.test(復.文), 復);
    const 少 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      m.result.show({ rank: 2, total: 4, finished: true, time: 40, correct: 3, wrong: 1, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "race", standings: [], courseName: "検査",
        splits: [], bestSplits: [], missed: [{ q: "a", a: "b", y: "" }] });
      const b = Array.from(r.querySelectorAll(".vs-res-btns .vs-btn"))
        .filter((e) => /間違えた 単語で/.test(e.textContent))[0];
      return !b || b.classList.contains("vs-hide");
    });
    ok("1 個 だけなら 出さない（4 択が 作れない）", 少 === true, 少);

    /* 押して 走る */
    await pg.evaluate(async () => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      m.result.show({ rank: 2, total: 4, finished: true, time: 40, correct: 1, wrong: 3, respawns: 0,
        xp: 100, best: 0, newBest: false, mode: "race", standings: [], courseName: "検査",
        splits: [], bestSplits: [],
        missed: [{ q: "ZQAlpha", a: "アルファ", y: "" }, { q: "ZQBeta", a: "ベータ", y: "" },
                 { q: "ZQGamma", a: "ガンマ", y: "" }, { q: "ZQDelta", a: "デルタ", y: "" }] });
      await new Promise((x) => setTimeout(x, 200));
      Array.from(r.querySelectorAll(".vs-res-btns .vs-btn"))
        .filter((e) => /間違えた 単語で/.test(e.textContent))[0].click();
    });
    await 待つ(2600);
    const 走 = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { 語: (m.cfg.reviewWords || []).length,
        問: (m.questions || []).slice(0, 6).map((q) => q.prompt) };
    });
    ok("間違えた 単語が 渡る", 走.語 === 4, 走);
    ok("**門の 問題が その 単語に なる**",
      走.問.some((p2) => /^ZQ/.test(String(p2))), 走.問);
    ok("問題が 足りる（門の 数 ＋ 2）", 走.問.length >= 4, 走.問.length);
    if (絵) await pg.screenshot({ path: OUT + "/survive-result.png" });

    節("⑨ 例外");
    const 無視 = /favicon|net::ERR_|Failed to load resource|firebase|config\.public|\/api\/|AudioContext|play\(\) failed/i;
    const 実害 = errs.filter((e) => !無視.test(e));
    ok("実害の ある 例外が 0 件", 実害.length === 0, 実害.slice(0, 6));
    console.log("     （参考）出た 全部: " + errs.length + " 件");
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
