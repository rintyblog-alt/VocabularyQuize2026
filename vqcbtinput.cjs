/* ══════════════════════════════════════════════════════════════════════════
   vqcbtinput.cjs — 受験の 画面（CBT）の 右側が **全部の 形式に 対応しているか**

   訴え（2026-08-30・Rinty さん）
     「なんか右の解答欄でさ、全ての形式に対応してる？してない気がするんだけど」

   ★ 見て 分かったのは、**見た目の 話では なく 採点の 話**だった:
     ・並べ替え … 「3,1,4,2」と 打たせて、その **文字を そのまま 保存**していた。
       採点は 項目の id と 見比べるので、**必ず 不正解**。
     ・組み合わせ … 右の 選びものが 紙にしか 出ておらず、
       画面では **id を 手で 打つ**しか なかった。やはり 必ず 不正解。

   ここで 測るのは:
     ① どの 形式にも 入力の 口が ある（黙って 打ち込み欄に 落ちない）
     ② 紙と 画面で **同じ 記号（ア イ ウ／1 2 3）**が 出る
     ③ 画面で 選んだ 答えが **そのまま 採点で 正解に なる**

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqcbtinput.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqi" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("i" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 形式を ひととおり 入れた 試験を こしらえる（AI は 使わない）。 */
const 試験を置く = () => {
  const S = window.VQ2.schema, ST = window.VQ2.store;
  const 素 = (id, type, extra) => Object.assign({
    id: id, schemaVersion: S.SCHEMA_VERSION, sectionId: "s1", number: 0, globalNumber: 0,
    type: type, prompt: type + " の 問題文です。よく 読んで 答えなさい。",
    promptRichText: null, media: [], contentBlocks: [], choices: [],
    correctAnswer: null, acceptedAnswers: [], explanation: "かいせつ", choiceExplanations: null,
    answerBindingId: "b-" + id, points: 10, criterionAllocation: null, scoringRubric: null,
    estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
    sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
  }, extra || {});

  const qs = [
    素("q1", "multiple_choice_single", { choices: [
      { id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false },
      { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }] }),
    素("q2", "true_false", { choices: [
      { id: "t1", text: "正しい", isCorrect: true }, { id: "t2", text: "誤っている", isCorrect: false }] }),
    素("q3", "multiple_choice_multiple", { choices: [
      { id: "m1", text: "あ", isCorrect: true }, { id: "m2", text: "い", isCorrect: true },
      { id: "m3", text: "う", isCorrect: false }, { id: "m4", text: "え", isCorrect: false }] }),
    素("q4", "short_answer", { correctAnswer: "こたえ", acceptedAnswers: ["こたえ"] }),
    素("q5", "numeric", { correctAnswer: "42", acceptedAnswers: ["42"] }),
    /* 空欄の 一覧が **ある** もの（いまの 作りかた）。 */
    素("q6", "fill_blank", { blanks: [{ id: "bl1", answer: "あ" }, { id: "bl2", answer: "い" }],
                             correctAnswer: ["あ", "い"], acceptedAnswers: [] }),
    /* ★ 空欄の 一覧が **無い** 古い 試験。ここも 正解に なること。 */
    素("q12", "fill_blank", { correctAnswer: "とうきょう", acceptedAnswers: ["とうきょう"] }),
    素("q7", "ordering", {
      orderItems: [{ id: "o1", text: "いちばん目" }, { id: "o2", text: "にばん目" },
                   { id: "o3", text: "さんばん目" }, { id: "o4", text: "よんばん目" }],
      correctAnswer: ["o1", "o2", "o3", "o4"] }),
    素("q8", "matching", {
      pairs: { left: [{ id: "L1", text: "みぎ" }, { id: "L2", text: "ひだり" }],
               right: [{ id: "R1", text: "right" }, { id: "R2", text: "left" }] },
      correctAnswer: { L1: "R1", L2: "R2" } }),
    素("q9", "long_answer", { correctAnswer: "説明の 文", acceptedAnswers: [],
      scoringRubric: { items: [{ id: "r1", description: "要点", points: 10 }] } }),
    素("q10", "source_analysis", { correctAnswer: "資料の 読み取り", acceptedAnswers: [] }),
    素("q11", "formula", { correctAnswer: "2x+1", acceptedAnswers: ["2x+1"] })
  ];
  qs.forEach((q, i) => { q.number = i + 1; q.globalNumber = i + 1; });

  const spec = {
    id: "cbt-in-1", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "形式ぜんぶの たしかめ", subject: "情報", grade: "高校2年",
    durationMinutes: 50, totalPoints: qs.length * 10, instructions: "", sourceMode: "open",
    cover: { examName: "形式ぜんぶの たしかめ", subject: "情報" },
    sections: [{ id: "s1", number: 1, title: "大問一", instructions: "", points: qs.length * 10, questions: qs }],
    answerBindings: qs.map((q, i) => ({ id: "b-" + q.id, questionId: q.id, sectionId: "s1",
      number: String(i + 1), blankCount: q.type === "fill_blank" ? 2 : 1, kind: "text" })),
    paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
             margins: { top: 20, bottom: 20, left: 18, right: 18 } },
    layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const r = ST.saveExam(spec, {});
  return { ok: !!(r && r.ok), id: spec.id, 形式: qs.map((q) => q.type) };
};

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.store),
    null, { timeout: 60000 });
  await 待(1200);

  節("① 置いて 受験の 画面を 開く");
  const 置 = await page.evaluate(試験を置く);
  見(置.ok, "試験を 置いた", 置.形式.join(", "));
  await page.evaluate(() => {
    const ST = window.VQ2.store;
    window.VQ2.examWorkspace.open({ spec: ST.getExam("cbt-in-1") });
  });
  await 待(2000);

  節("② どの 形式にも 入力の 口が ある");
  const 口 = await page.evaluate(() => {
    const h = [...document.querySelectorAll("[id^='vq2-']")].filter((e) => /exam-workspace/.test(e.id))[0];
    const sr = h && h.shadowRoot;
    if (!sr) return { なし: true };
    const 出 = {};
    sr.querySelectorAll("[data-arow]").forEach((row) => {
      const qid = row.getAttribute("data-arow");
      const 印 = [];
      ["data-pick", "data-pickm", "data-blank", "data-ord", "data-ordclear",
       "data-pairsel", "data-clssel", "data-cell", "data-text", "data-order", "data-pair"]
        .forEach((k) => { if (row.querySelector("[" + k + "]")) 印.push(k.replace("data-", "")); });
      出[qid] = 印;
    });
    return 出;
  });
  見(!口.なし, "受験の 画面が 開いた");
  const 期待 = { q1: "pick", q2: "pick", q3: "pickm", q4: "text", q5: "text",
                 q6: "blank", q7: "ord", q8: "pairsel", q9: "text", q10: "text", q11: "text",
                 q12: "blank" };
  Object.keys(期待).forEach((qid) => {
    const 有 = (口[qid] || []).indexOf(期待[qid]) >= 0;
    見(有, "  " + qid + " → " + 期待[qid], (口[qid] || []).join(","));
  });
  /* 打ち込み欄へ **黙って 落ちて** いないこと。 */
  見(!(口.q7 || []).includes("order"), "★ 並べ替えは 文字打ちに 落ちない");
  見(!(口.q8 || []).includes("pair"), "★ 組み合わせは 文字打ちに 落ちない");

  節("③ 紙と 画面で 同じ 記号");
  const 記 = await page.evaluate(() => {
    const L = window.VQ2.layout;
    const 並 = [{ id: "o1", text: "いちばん目" }, { id: "o2", text: "にばん目" },
                { id: "o3", text: "さんばん目" }, { id: "o4", text: "よんばん目" }];
    const 紙 = L.stableShuffle(並, "q7").map((x, i) => L.kana(i) + ":" + x.id);
    const h = [...document.querySelectorAll("[id^='vq2-']")].filter((e) => /exam-workspace/.test(e.id))[0];
    const sr = h.shadowRoot;
    const 画 = [...sr.querySelectorAll("[data-ord]")].map((b) =>
      b.textContent.trim().replace(/\d+$/, "") + ":" + b.getAttribute("data-ord").split("|")[1]);
    return { 紙: 紙, 画: 画 };
  });
  見(記.紙.join(",") === 記.画.join(","), "★ 並べ替えの 記号と 並びが 紙と 同じ",
     "紙 " + 記.紙.join(",") + " ／ 画面 " + 記.画.join(","));

  節("④ 画面で 選んだ 答えが **採点で 正解に なる**");
  const 結 = await page.evaluate(async () => {
    const h = [...document.querySelectorAll("[id^='vq2-']")].filter((e) => /exam-workspace/.test(e.id))[0];
    const sr = h.shadowRoot;
    const 押 = (sel) => { const e = sr.querySelector(sel); if (e) { e.click(); return true; } return false; };
    const 打 = (sel, v) => {
      const e = sr.querySelector(sel);
      if (!e) return false;
      const P = e.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(e, v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };
    const 選 = (sel, v) => {
      const e = sr.querySelector(sel);
      if (!e) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(e, v);
      e.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    /* 正解を そのまま 入れる。 */
    押('[data-pick="q1|c1"]');
    押('[data-pick="q2|t1"]');
    押('[data-pickm="q3|m1"]'); 押('[data-pickm="q3|m2"]');
    打('[data-text="q4"]', "こたえ");
    打('[data-text="q5"]', "42");
    打('[data-blank="q6|0"]', "あ"); 打('[data-blank="q6|1"]', "い");
    打('[data-blank="q12|0"]', "とうきょう");
    /* 並べ替えは 正しい 順に 押す（描き直しが 入るので 1 つずつ 引き直す）。 */
    for (const id of ["o1", "o2", "o3", "o4"]) {
      const b = sr.querySelector('[data-ord="q7|' + id + '"]');
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 120));
    }
    選('[data-pairsel="q8|L1"]', "R1");
    選('[data-pairsel="q8|L2"]', "R2");
    打('[data-text="q9"]', "要点を きちんと 説明した 文です。");
    打('[data-text="q10"]', "資料の 読み取り");
    打('[data-text="q11"]', "2x+1");
    await new Promise((r) => setTimeout(r, 400));

    /* 保存された 答えを そのまま 採点へ 通す（提出の 窓は 開かない）。 */
    const ST = window.VQ2.store, G = window.VQ2.grading;
    const spec = ST.getExam("cbt-in-1");
    const qs = spec.sections[0].questions;
    /* 保存は 700ms 待ってから 走る（SAVE_MS）。待ってから 読む。 */
    await new Promise((r) => setTimeout(r, 1500));
    const 並 = (ST.mockSessions.list() || [])
      .filter((x) => x && x.mockId === "cbt-in-1" || (x.answers || []).some((a) => /^q\d+$/.test(a.questionId)));
    const sess = 並.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0]
      || (ST.mockSessions.list() || [])[0];
    const ans = (sess && sess.answers) || [];
    const g = G.gradeSession(qs, ans);
    return {
      答え: ans.map((a) => ({ q: a.questionId, v: a.value })),
      点: g.deterministicScore, 満: g.totalMax,
      内訳: g.items.map((it) => ({ q: it.questionId, t: it.type,
        correct: it.correct, score: it.score, ans: it.answerText }))
    };
  });
  const 決 = 結.内訳.filter((x) => x.correct !== null);
  console.log("     点: " + 結.点 + " / " + 結.満);
  結.内訳.forEach((x) => console.log("     " + (x.correct === true ? "○" : x.correct === false ? "×" : "…")
    + " " + x.q + " " + x.t + "  答え=" + JSON.stringify(x.ans)));
  ["q1", "q2", "q3", "q4", "q5", "q6", "q11", "q12"].forEach((qid) => {
    const it = 結.内訳.filter((x) => x.q === qid)[0];
    見(it && it.correct === true, "  " + qid + " が 正解に なる", it ? JSON.stringify(it) : "なし");
  });
  const o7 = 結.内訳.filter((x) => x.q === "q7")[0];
  見(o7 && o7.correct === true, "★ 並べ替えが 正解に なる（前は 必ず 不正解だった）",
     JSON.stringify((結.答え.filter((a) => a.q === "q7")[0] || {}).v));
  const m8 = 結.内訳.filter((x) => x.q === "q8")[0];
  見(m8 && m8.correct === true, "★ 組み合わせが 正解に なる（前は 必ず 不正解だった）",
     JSON.stringify((結.答え.filter((a) => a.q === "q8")[0] || {}).v));

  節("⑤ 赤い字（例外）");
  見(例外.length === 0, "例外が 出ていない", 例外.join(" | "));

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
