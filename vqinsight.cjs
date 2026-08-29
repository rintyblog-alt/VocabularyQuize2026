/* ══════════════════════════════════════════════════════════════════════════
   vqinsight.cjs — インサイトの **細かい 指標**と **総合評価・一言**を
   実物で 確かめる。

   訴え（2026-08-29）:
     「インサイトを もう少し 正確に、細かい 指標まで 記録して」
     「Lumi が 毎回 こっそり 記録できれば なお いい。裏で 3 flash live・音声なし」
     「総合評価の 欄と 一言フィードバックを 追加」
     「細かい 分析を して、それを 数値化する。毎回」

   見るところ:
     ① 解き終わると **指標が 数えられる**（速さ・失速・連続・迷い…）
     ② 総合点は **式のとおり**（同じ入力なら 同じ点。AI では 決めない）
     ③ 採点できた数が 3 問 未満なら 点を 出さない（でっち上げない）
     ④ 裏で 一言が 届き、セッションに しまわれる
     ⑤ インサイトの 画面に 総合評価と くわしい 数値が 出る
     ⑥ 答えの 中身は **1 文字も 送らない**

   使い方: VQ_TOKEN=<札> node vqinsight.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const SP = process.env.SP || ".";

/* 12 問。前半は 当たり、後半は 外す（失速が 出る はず）。 */
function 作る(id) {
  const items = [], snaps = [];
  for (let i = 0; i < 12; i++) {
    const 前半 = i < 6;
    const type = i < 6 ? "multiple_choice_single" : (i < 10 ? "fill_blank" : "ordering");
    snaps.push({ id: "q" + i, type: type, subject: "japanese_history", unit: "鎌倉", difficulty: "normal" });
    items.push({
      questionId: "q" + i, type: type, answered: i !== 11,
      correct: 前半, isCorrect: 前半,
      score: 前半 ? 1 : 0, maxScore: 1,
      timeMs: 前半 ? 9000 : (i === 6 ? 1500 : 12000),   /* 1 問は 3 秒 未満で 外す */
      changeCount: i === 8 ? 2 : 0, hintUsed: i === 9,
      /* ★ 答えの 中身。**送られない ことを 確かめる ため**に わざと 入れる。 */
      answerText: "ヒミツの答え" + i, userAnswer: "ヒミツの答え" + i
    });
  }
  return {
    id: id, sessionId: id, presetId: "p_test", presetName: "鎌倉時代テスト対策",
    subject: "japanese_history", kind: "practice",
    startedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: 5 * 60000, items: items, questionsSnapshot: snaps
  };
}

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  /* 送った 中身を 覗く（答えの 文が 混ざっていない ことを 見る） */
  const 送信 = [];
  await page.route("**/api/insight/review", async (route) => {
    try { 送信.push(route.request().postData() || ""); } catch (e) {}
    await route.continue();
  });
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.learning, null, { timeout: 60000 });
  await page.waitForTimeout(2000);

  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 300) : "")); if (!ok) 落++; };

  /* ── ① 指標が 数えられる ── */
  const m = await page.evaluate((r) => {
    const L = window.VQ2.learning;
    const out = L.recordResult(r, {});
    return { ok: out.ok, metrics: out.session && out.session.metrics, sid: out.session && out.session.id };
  }, 作る("res_test_1"));
  console.log("指標:", JSON.stringify(m.metrics, null, 1).slice(0, 900));
  const M = m.metrics || {};
  見(m.ok && !!M.schema, "① 指標が 数えられた");
  見(M.questionCount === 12 && M.gradedCount === 11, "① 問題数 12 ／ 採点できた 11", [M.questionCount, M.gradedCount]);
  見(M.firstHalfAccuracy === 1 && M.secondHalfAccuracy === 0, "① 前半 100% ／ 後半 0%", [M.firstHalfAccuracy, M.secondHalfAccuracy]);
  見(M.fade === -1, "① 失速が −1（後半で 落ちた）", M.fade);
  見(M.maxStreakCorrect === 6 && M.maxStreakWrong === 5, "① 連続 正解 6 ／ 連続 不正解 5", [M.maxStreakCorrect, M.maxStreakWrong]);
  見(Math.abs(M.fastMissRate - 1 / 12) < 0.01, "① 3 秒 未満で 外した 割合", M.fastMissRate);
  見(Math.abs(M.skipRate - 1 / 12) < 0.01, "① 飛ばした 割合", M.skipRate);
  見(Math.abs(M.changeRate - 1 / 12) < 0.01, "① 答えを 変えた 割合", M.changeRate);
  見(M.medianSecPerQuestion === 9, "① 1 問あたりの 中央値 9 秒", M.medianSecPerQuestion);
  見((M.weakTypes || []).length > 0 && M.weakTypes[0].accuracy === 0, "① 弱い 形式が 出る", M.weakTypes);

  /* ── ② 総合点は 式のとおり ── */
  /* 正しさ = 6/11*70 = 38.18 ／ ねばり = (1-1)*10 = 0 ／ やりきり = (1-1/12)*10 = 9.17
     落ち着き = (1-1/12)*10 = 9.17 → 56.5 → 57 */
  見(M.score100 === 57, "② 総合点が 式のとおり（57）", { 点: M.score100, 内訳: M.scoreParts });

  /* ── ③ 採点が 少ないと 点を 出さない ── */
  const 少 = await page.evaluate(() => {
    const L = window.VQ2.learning;
    const r = { id: "res_test_2", sessionId: "res_test_2", presetId: "p2", presetName: "少ない",
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), elapsedMs: 1000,
      items: [{ questionId: "a", type: "multiple_choice_single", answered: true, correct: true, score: 1, maxScore: 1, timeMs: 3000 },
              { questionId: "b", type: "multiple_choice_single", answered: true, correct: false, score: 0, maxScore: 1, timeMs: 3000 }],
      questionsSnapshot: [{ id: "a", type: "multiple_choice_single" }, { id: "b", type: "multiple_choice_single" }] };
    const o = L.recordResult(r, {});
    return o.session.metrics;
  });
  見(少.score100 === null, "③ 採点できた数が 3 未満なら 点は null（でっち上げない）", 少.score100);

  /* ── ④ 裏で 一言が 届く ── */
  const rev = await page.evaluate((sid) => window.VQ2.learning.askReview(sid, { force: true }), m.sid);
  console.log("一言:", JSON.stringify(rev));
  見(!!(rev && rev.headline && rev.advice), "④ AI の 一言が 返る", rev);
  見(!!(rev && rev.by), "④ どこで 作ったかが 分かる（live / gemini）", rev && rev.by);
  const しまった = await page.evaluate((sid) => {
    const ss = window.VQ2.learning.listSessions({});
    const s = ss.filter((x) => x.id === sid)[0];
    return s && s.review;
  }, m.sid);
  見(!!(しまった && しまった.headline), "④ セッションに しまわれた", しまった);

  /* ── ⑥ 答えの 中身を 送っていない ── */
  const 本文 = 送信.join("\n");
  見(送信.length > 0, "⑥ 送った 中身を 見られた（" + 送信.length + " 回）");
  見(本文.indexOf("ヒミツの答え") < 0, "⑥ **答えの 中身は 1 文字も 送っていない**");
  見(本文.indexOf("鎌倉時代テスト対策") >= 0, "⑥ 題と 数字は 送っている（分析に 要る）");

  /* ── ⑤-0 何回か 記録して、点の 移り変わりが 出るか ── */
  await page.evaluate(() => {
    const L = window.VQ2.learning;
    for (let k = 0; k < 4; k++) {
      const items = [], snaps = [];
      for (let i = 0; i < 8; i++) {
        const 当 = i < (4 + k);            /* 回を 追うごとに 良くなる */
        snaps.push({ id: "q" + i, type: "multiple_choice_single" });
        items.push({ questionId: "q" + i, type: "multiple_choice_single", answered: true,
          correct: 当, isCorrect: 当, score: 当 ? 1 : 0, maxScore: 1, timeMs: 8000 });
      }
      const t = new Date(Date.now() - (4 - k) * 86400000).toISOString();
      L.recordResult({ id: "res_seq_" + k, sessionId: "res_seq_" + k, presetId: "p3",
        presetName: "つづき " + k, startedAt: t, finishedAt: t, elapsedMs: 60000,
        items: items, questionsSnapshot: snaps }, {});
    }
  });
  await page.waitForTimeout(600);

  /* ── ⑤ 画面に 出る ── */
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
    document.body.setAttribute("data-app-tab", "insight");
  });
  await page.waitForTimeout(3500);
  const 画 = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".ov-n, .wrap"));
    if (!器) return { 無い: true };
    const r = 器.shadowRoot;
    const t = (r.textContent || "").replace(/\s+/g, " ");
    return { 総合: /総合評価/.test(t), 点: (r.querySelector(".ov-n") || {}).textContent || "",
             ランク: (r.querySelector(".ov-g") || {}).textContent || "",
             一言: (r.querySelector(".ov-hl") || {}).textContent || "",
             くわしい: /くわしい 数値/.test(t),
             失速行: /後半 − 前半/.test(t),
             棒: r.querySelectorAll(".ov-b").length };
  });
  console.log("画面:", JSON.stringify(画));
  見(画.総合, "⑤ 総合評価の 欄が 出る");
  見(!!String(画.点).trim() && 画.点 !== "—", "⑤ 点が 出る", 画.点);
  見(!!String(画.ランク).trim(), "⑤ ランクが 出る", 画.ランク);
  見(!!String(画.一言).trim(), "⑤ 一言が 出る", 画.一言);
  見(画.くわしい && 画.失速行, "⑤ くわしい 数値が 出る");
  見(画.棒 >= 5, "⑤ 総合点の 移り変わりが 出る（" + 画.棒 + " 回ぶん）", 画.棒);
  見(例外.length === 0, "⑦ 画面の 例外 0 件", 例外.slice(0, 3));

  await page.screenshot({ path: SP + "/insight.png", fullPage: false });

  /* ── ⑧ グラフの 動き（左から 出てくる）── */
  const 動 = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-chart] svg"));
    if (!器) return { 無い: true };
    const svg = 器.shadowRoot.querySelector("[data-chart] svg");
    const cs = getComputedStyle(svg);
    const 線 = 器.shadowRoot.querySelector(".ln-p");
    const 点 = 器.shadowRoot.querySelector(".ln-d");
    return {
      名: cs.animationName, 秒: cs.animationDuration,
      切り: cs.clipPath,
      線の名: 線 ? getComputedStyle(線).animationName : "",
      点の名: 点 ? getComputedStyle(点).animationName : "",
      点の遅れ: 点 ? getComputedStyle(点).animationDelay : ""
    };
  });
  console.log("動き:", JSON.stringify(動));
  見(動.名 === "insWipe", "⑧ グラフが 左から めくれる（clip-path）", 動.名);
  見(動.線の名 === "insDraw", "⑧ 折れ線が 左から 描かれる", 動.線の名);
  見(動.点の名 === "insPop", "⑧ 点が ふくらんで 出る", 動.点の名);

  /* 切り替える たびに **やり直す**（data-tick が 変わる） */
  const 前tick = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-chart]"));
    return 器.shadowRoot.querySelector("[data-chart]").getAttribute("data-tick");
  });
  await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="metric"][data-v="minutes"]'));
    器.shadowRoot.querySelector('[data-a="metric"][data-v="minutes"]').click();
  });
  await page.waitForTimeout(400);
  const 後tick = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-chart]"));
    const c = 器.shadowRoot.querySelector("[data-chart]");
    const svg = c.querySelector("svg");
    return { tick: c.getAttribute("data-tick"),
             途中: getComputedStyle(svg).clipPath };
  });
  見(後tick.tick !== 前tick, "⑧ 切り替えると 動きを やり直す（tick " + 前tick + " → " + 後tick.tick + "）");

  /* ── ⑨ 相関図 ── */
  await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="view"][data-v="scatter"]'));
    器.shadowRoot.querySelector('[data-a="view"][data-v="scatter"]').click();
  });
  await page.waitForTimeout(900);
  const 相 = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".scax, [data-chart]"));
    const r = 器.shadowRoot;
    const t = (r.textContent || "").replace(/\s+/g, " ");
    return {
      軸えらび: !!r.querySelector('[data-a="sx"]') && !!r.querySelector('[data-a="sy"]'),
      点の数: r.querySelectorAll(".sc-d").length,
      目安の線: !!r.querySelector(".sc-fit"),
      言い方: (r.querySelector(".hint") || {}).textContent || "",
      表: !!r.querySelector(".tbl"),
      因果を言わない: !/が原因|のせいで|だから必ず/.test(t)
    };
  });
  console.log("相関図:", JSON.stringify(相));
  見(相.軸えらび, "⑨ よこ・たての ものさしを 選べる");
  見(相.点の数 >= 5, "⑨ 1 回 ＝ 1 つの 点が 出る（" + 相.点の数 + " 点）", 相.点の数);
  見(相.目安の線, "⑨ 目安の 線が 引かれる（5 点 以上）");
  見(/r = |つながり|足りません/.test(相.言い方), "⑨ つながりの 強さを 言葉で 出す", 相.言い方);
  見(/原因だとは 限りません|足りません|目立った つながりは/.test(相.言い方),
     "⑨ **因果だと 言い切らない**", 相.言い方);
  見(相.言い方.indexOf("**") < 0, "⑨ 画面に 記号（**）が そのまま 出ていない", 相.言い方);
  見(相.表, "⑨ 同じ 数字を 表でも 出す");
  /* 点に 触れたら どの回か 出るか */
  const 触 = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".sc-d"));
    if (!器) return { 無い: true };
    const r = 器.shadowRoot;
    const d = r.querySelector(".sc-d");
    const box = d.closest("[data-chart]");
    const rect = d.getBoundingClientRect();
    box.dispatchEvent(new MouseEvent("mousemove", { bubbles: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    /* 実際の 的（透明な 丸）へ 直接 送る */
    const 的 = r.querySelectorAll('circle[data-si="0"]');
    的.forEach((x) => x.dispatchEvent(new MouseEvent("mousemove", { bubbles: true })));
    const tip = r.querySelector("[data-tip]");
    return { 出た: !!(tip && tip.classList.contains("on")),
             文: tip ? (tip.textContent || "").replace(/\s+/g, " ").slice(0, 60) : "" };
  });
  console.log("触れたとき:", JSON.stringify(触));
  見(触.出た && /正答率|秒/.test(触.文), "⑨ 点に 触れると どの回か 出る", 触);

  /* グラフの ところだけを 撮る（下の ほうに あるため） */
  try {
    const 箱 = await page.evaluateHandle(() => {
      const 器 = Array.from(document.querySelectorAll("*")).find(
        (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-chart]"));
      const c = 器.shadowRoot.querySelector("[data-chart]");
      return c.closest("section") || c;
    });
    const el = 箱.asElement();
    if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
              await el.screenshot({ path: SP + "/insight-scatter.png" }); }
    else await page.screenshot({ path: SP + "/insight-scatter.png" });
  } catch (e) { await page.screenshot({ path: SP + "/insight-scatter.png" }); }
  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
