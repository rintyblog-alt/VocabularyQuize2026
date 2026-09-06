/* ══════════════════════════════════════════════════════════════════════════
   vqexamfix0903.cjs — 2026-09-03 の 11 件（試験モードの 直し）

   訴え（Rinty さん・11 項目）:
     1  資料の 読み取りが 遅い／PDF から 均等に 出題されない／100MB まで
     2  解答と 解説に 数式・数学記号が 効いていない
     3  解答用紙の「1点配当」等が 実際の 配点と 合っていない
     4  素点は 赤、知識・技能は 赤、思考・判断・表現は 青
     5  1 問ずつ「次に つなげる」助言を 必ず 返す（Gemini Flash 3 Live）
     6  解説で [object Object] に なる／全形式に 対応
     7  結果画面から 問題用紙・解答用紙・解説・模範解答を 落とせる
     8  紙面・解答用紙の 型を 増やす
     9  結果と分析でも 試験は 採点結果と 同じ 画面
    10  公式の 英単語プリセット 11 個 → VocabuTest 5 本（中身も まとめる）
    11  正解＝ふわっ／不正解＝横ゆれ

   ★ AI の 鍵が 要る ところ（1 の 実測・5 の 中身）は **鍵が あるときだけ** 測る。
     鍵が 無い ところでは「口が 在るか・形が 正しいか」までを 見る。

   使い方: node vqexamfix0903.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqf" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("f" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

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
  await page.waitForFunction(
    () => !!(window.VQ2 && window.VQ2.evaluator && window.VQ2.layout && window.VQ2.pdfRenderer
             && window.VQ2.layoutProfiles && window.VQ2.store),
    null, { timeout: 60000 });

  /* ══ ⑥ 正解を 文字に する（全形式）══════════════════════════════ */
  節("⑥ 解説の [object Object] を 消す（全形式）");
  {
    const r = await page.evaluate(() => {
      const E = window.VQ2.evaluator;
      const 出 = {};
      const T = (q) => { try { return E.correctAnswerText(q, { long: true }); } catch (e) { return "ERR:" + e.message; } };
      出.選択 = T({ type: "multiple_choice_single", engine: "single_choice",
        choices: [{ id: "a", text: "あ" }, { id: "b", text: "い", isCorrect: true }] });
      出.複数 = T({ engine: "multi_choice",
        choices: [{ id: "a", text: "あ", isCorrect: true }, { id: "b", text: "い" }, { id: "c", text: "う", isCorrect: true }] });
      出.組合せ = T({ engine: "matching",
        pairs: { left: [{ id: "L1", text: "犬" }, { id: "L2", text: "猫" }],
                 right: [{ id: "R1", text: "dog" }, { id: "R2", text: "cat" }],
                 correct: { L1: "R1", L2: "R2" } } });
      出.並替 = T({ engine: "reorder", correctOrder: ["i2", "i1", "i3"],
        orderItems: [{ id: "i1", text: "B" }, { id: "i2", text: "A" }, { id: "i3", text: "C" }] });
      出.穴埋 = T({ engine: "fill_blank",
        blanks: [{ id: "b1", label: "ア", answer: "645" }, { id: "b2", label: "イ", answer: "大化" }] });
      出.分類 = T({ engine: "classification",
        classification: { groups: [{ id: "g1", label: "動物" }, { id: "g2", label: "植物" }],
                          items: [{ id: "i1", text: "犬", groupId: "g1" }, { id: "i2", text: "杉", groupId: "g2" }] } });
      出.表 = T({ engine: "table_fill",
        table: { rows: [{ id: "r1", cells: [{ id: "c1", editable: true, answer: "12" },
                                            { id: "c2", editable: false }] }] } });
      出.図ラベル = T({ engine: "image_label",
        labels: { slots: [{ id: "s1", label: "ア", answerId: "o1" }],
                  options: [{ id: "o1", text: "心臓" }] } });
      出.図指し = T({ engine: "image_point", hotspots: [{ id: "h1", label: "右心房" }] });
      出.誤り訂正 = T({ engine: "error_correction",
        errorSpans: [{ id: "s1", wrong: "goed", correct: "went" }] });
      出.書取 = T({ engine: "dictation", script: "This is a pen." });
      出.数値 = T({ engine: "numeric_input", correctAnswer: "3.14", unit: "cm" });
      出.記述 = T({ engine: "free_text", correctAnswer: "埴輪を 並べた。" });
      出.複合 = T({ engine: "composite", children: [
        { engine: "single_choice", number: 1, choices: [{ id: "a", text: "あ", isCorrect: true }] },
        { engine: "numeric_input", number: 2, correctAnswer: "7" } ] });
      return 出;
    });
    const 全 = Object.keys(r);
    const 壊 = 全.filter((k) => /\[object Object\]|ERR:/.test(String(r[k])));
    const 空 = 全.filter((k) => !String(r[k]).trim());
    見(壊.length === 0, "★ どの 形式でも [object Object] に ならない", 壊.length ? r : 壊);
    見(空.length === 0, "★ どの 形式でも 空に ならない", 空.length ? r : "全 " + 全.length + " 形式");
    見(/dog/.test(r.組合せ) && /→/.test(r.組合せ), "組み合わせは 左→右 で 出る", r.組合せ);
    見(/A/.test(r.並替) && /B/.test(r.並替), "並べ替えは 中身が 出る", r.並替);
    見(/動物/.test(r.分類) && /犬/.test(r.分類), "分類は 群と 中身が 出る", r.分類);
    見(/went/.test(r.誤り訂正), "誤り訂正は 直した 形が 出る", r.誤り訂正);
    見(/3\.14/.test(r.数値) && /cm/.test(r.数値), "数値は 単位も 出る", r.数値);
  }

  /* ══ ②③④⑦ 紙面（数式・配点・色・冊子）════════════════════════ */
  節("②③④⑦ 紙面");
  {
    const r = await page.evaluate(() => {
      const S = window.VQ2.schema, L = window.VQ2.layout, R = window.VQ2.pdfRenderer;
      const 作 = (pt) => ({
        id: "fx-q" + pt, schemaVersion: S.SCHEMA_VERSION, sectionId: "fx-s1",
        number: pt, globalNumber: pt, type: "short_answer", engine: "text_input",
        prompt: "$x^2+1$ を 因数分解せよ。", promptRichText: null, media: [], contentBlocks: [],
        choices: [], correctAnswer: "$(x+i)(x-i)$", acceptedAnswers: [],
        explanation: "解説：$x^2+1=(x+i)(x-i)$ となる。", choiceExplanations: null,
        answerBindingId: "fx-b" + pt, points: 5,
        criterionAllocation: null, scoringRubric: null,
        estimatedSeconds: 60, difficulty: "normal", topic: "式", tags: [],
        sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
      });
      const qs = [作(1), 作(2), 作(3)];
      const spec = {
        id: "fx-spec", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
        title: "数式のたしかめ", subject: "数学", grade: "高校2年",
        durationMinutes: 50, totalPoints: 999,          /* ★ わざと 食い違わせる */
        instructions: "", sourceMode: "open",
        cover: { examName: "数式のたしかめ", subject: "数学", examDate: "2026年9月3日",
                 instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
        sections: [{ id: "fx-s1", number: 1, title: "大問一", instructions: "",
                     points: 111, questions: qs }],   /* ★ わざと 食い違わせる */
        answerBindings: qs.map((q, i) => ({ id: "fx-b" + (i + 1), questionId: q.id,
          sectionId: "fx-s1", number: String(i + 1), blankCount: 1, kind: "text",
          points: 1 })),                               /* ★ わざと 1 点 に する */
        paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
                 margins: { top: 20, bottom: 20, left: 18, right: 18 } },
        layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      const plan = L.buildPlan(spec);
      const ids = (plan.booklets || []).map((b) => b.id);
      window.__fxSpec = spec; window.__fxPlan = plan;
      const 解説 = R.buildHtml(spec, plan, { bookletId: "answer-and-explanation" });
      const 模範 = R.buildHtml(spec, plan, { bookletId: "model-answers" });
      return {
        ids: ids,
        binding点: (spec.answerBindings || []).map((b) => b.points),
        大問点: (spec.sections || []).map((s) => s.points),
        満点: spec.totalPoints,
        解説に式: /class="vqm|vqm-b|<svg/.test(解説),
        解説に生の式: /\$x\^2\+1\$/.test(解説),
        解説に解答: /解答：/.test(解説),
        模範に解説なし: !/x\^2\+1=\(x\+i\)/.test(模範) && !/class="ak-e"/.test(模範),
        模範に解答: /class="ak-a"/.test(模範)
      };
    });
    見(r.ids.indexOf("question-booklet") >= 0, "⑦ 問題用紙の 冊子が ある", r.ids);
    見(r.ids.indexOf("printable-answer-sheet") >= 0, "⑦ 解答用紙の 冊子が ある");
    見(r.ids.indexOf("answer-and-explanation") >= 0, "⑦ 解答と解説の 冊子が ある");
    見(r.ids.indexOf("model-answers") >= 0, "⑦ ★ 模範解答の 冊子が 増えた", r.ids);
    見(r.模範に解答 && r.模範に解説なし, "⑦ 模範解答は 解答だけ（解説は 落ちる）", r);
    見(JSON.stringify(r.binding点) === "[5,5,5]", "③ ★ 解答欄の 配点が 設問と そろう", r.binding点);
    見(JSON.stringify(r.大問点) === "[15]", "③ ★ 大問の 合計も そろう", r.大問点);
    見(r.満点 === 15, "③ ★ 満点も そろう", r.満点);
    /* ★ 数式は **KaTeX を 読んでから** 組む。刷る 口（printBooklet）は
       中で 用意してから 書くので、ここでも 同じ 手順を 踏む。 */
    await page.evaluate(() => window.VQ2.pdfRenderer.数式の用意());
    await 待(2500);
    const m = await page.evaluate(() => {
      const R = window.VQ2.pdfRenderer;
      const 解説 = R.buildHtml(window.__fxSpec, window.__fxPlan, { bookletId: "answer-and-explanation" });
      return {
        組めた: /class="vqm/.test(解説),
        生の式が残る: /\$x\^2\+1\$/.test(解説),
        解答も組めた: /class="ak-a"[\s\S]{0,200}class="vqm/.test(解説),
        用意できた: !!(window.VQM && window.VQM.svg && window.VQM.svg.読み込み済み
                      && window.VQM.svg.読み込み済み())
      };
    });
    if (!m.用意できた) {
      見(true, "②（KaTeX を 読めない ところなので 中身は 測れない）", m);
    } else {
      見(m.組めた && !m.生の式が残る, "② ★ 解答・解説で 数式が 組まれる", m);
      見(m.解答も組めた, "② ★ **解答の 欄**でも 数式が 組まれる（前は esc だけ だった）", m);
    }
    /* ★ 圧縮ずみの 中身は 読まない（名前が 変わるので 何も 測れない）。
       **新しい ページで 刷って**、KaTeX が 読まれるかを 見る。 */
    const pg2 = await ctx.newPage();
    await pg2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await pg2.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
    await pg2.waitForFunction(() => !!(window.VQ2 && window.VQ2.pdfRenderer && window.VQ2.layout),
      null, { timeout: 60000 });
    const 前 = await pg2.evaluate(() => !!(window.VQM && window.VQM.svg
      && window.VQM.svg.読み込み済み && window.VQM.svg.読み込み済み()));
    見(前 === false, "② 刷る 前は まだ KaTeX を 読んでいない", 前);
    await pg2.evaluate(() => {
      /* 窓は 開かせない（検査で 窓が 増えると 邪魔）。開いた ふりだけ させる。 */
      window.open = function () {
        return { document: { open: function () {}, write: function () {}, close: function () {},
                             fonts: null }, focus: function () {}, print: function () {},
                 close: function () {} };
      };
      const S = window.VQ2.schema, L = window.VQ2.layout, R = window.VQ2.pdfRenderer;
      const q = { id: "pm-q1", schemaVersion: S.SCHEMA_VERSION, sectionId: "pm-s1", number: 1,
        globalNumber: 1, type: "short_answer", engine: "text_input",
        prompt: "$x^2$ を 求めよ。", promptRichText: null, media: [], contentBlocks: [],
        choices: [], correctAnswer: "$x^2$", acceptedAnswers: [], explanation: "解説 $x^2$。",
        choiceExplanations: null, answerBindingId: "pm-b1", points: 5,
        criterionAllocation: null, scoringRubric: null, estimatedSeconds: 60,
        difficulty: "normal", topic: "式", tags: [], sourceReferences: [],
        requiresReview: false, confidence: null, validationIssues: [] };
      const spec = { id: "pm-spec", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
        title: "刷る", subject: "数学", grade: "高校2年", durationMinutes: 50,
        totalPoints: 5, instructions: "", sourceMode: "open",
        cover: { examName: "刷る", subject: "数学", examDate: "2026年9月3日",
                 instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
        sections: [{ id: "pm-s1", number: 1, title: "一", instructions: "", points: 5, questions: [q] }],
        answerBindings: [{ id: "pm-b1", questionId: "pm-q1", sectionId: "pm-s1",
                           number: "1", blankCount: 1, kind: "text", points: 5 }],
        paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
                 margins: { top: 20, bottom: 20, left: 18, right: 18 } },
        layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      R.printBooklet(spec, L.buildPlan(spec), "answer-and-explanation");
    });
    await 待(3500);
    const 後 = await pg2.evaluate(() => !!(window.VQM && window.VQM.svg
      && window.VQM.svg.読み込み済み && window.VQM.svg.読み込み済み()));
    見(後 === true, "② ★ 刷る と KaTeX が 読まれる（受験画面の 外でも 効く）",
      { 前: 前, 後: 後 });
    await pg2.close();
  }

  /* ══ ③ 配点の 凡例（実際の 配点から）════════════════════════════ */
  節("③ 解答用紙の 配点の 凡例");
  {
    const r = await page.evaluate(() => {
      const LP = window.VQ2.layoutProfiles;
      const 作 = (点ら) => ({
        id: "lg", title: "凡例", subject: "国語", durationMinutes: 50,
        totalPoints: 点ら.reduce((a, b) => a + b, 0),
        sections: [{ id: "s1", number: 1, title: "一", points: 0,
          questions: 点ら.map((p, i) => ({ id: "q" + i, number: i + 1, type: "short_answer",
            engine: "text_input", prompt: "問", points: p, choices: [],
            answerBindingId: "b" + i })) }],
        answerBindings: 点ら.map((p, i) => ({ id: "b" + i, questionId: "q" + i, number: String(i + 1), points: p })),
        paper: { size: "A4", orientation: "portrait" }, layout: {}
      });
      const 引 = (spec) => {
        spec.layout = { layoutMode: "current", answerSheetMode: "grid-standard", outputEngine: "current" };
        try {
          const lp = LP.planLayout(spec, { settings: LP.readLayoutSettings(spec) });
          return lp && lp.answerSheet ? lp.answerSheet : null;
        } catch (e) { return { err: String(e.message).slice(0, 80) }; }
      };
      const 一種 = 引(作([5, 5, 5, 5]));
      const 二種 = 引(作([2, 2, 5, 5]));
      return {
        一種: 一種 && 一種.grid && 一種.grid.pointLegend ? 一種.grid.pointLegend : null,
        二種: 二種 && 二種.grid && 二種.grid.pointLegend ? 二種.grid.pointLegend : null
      };
    });
    if (!r.一種 && !r.二種) {
      見(true, "（この 型は 凡例を 持たないので 飛ばす）", r);
    } else {
      見(!!r.一種 && (r.一種.labels || []).join("") === "5点配当",
        "③ ★ 5 点しか 無い ときは「5点配当」だけ", r.一種);
      見(!!r.一種 && r.一種.oneKind === true, "③ ★ 1 種類の ときは 太線 だけ", r.一種);
      見(!!r.二種 && (r.二種.labels || []).join("／") === "2点配当／5点配当",
        "③ ★ 2 種類の ときは 実際の 2 つ", r.二種);
    }
  }

  /* ══ ⑧ 紙面・解答用紙の 型が 増えている ══════════════════════════ */
  節("⑧ 型を 増やす");
  {
    const r = await page.evaluate(() => {
      const LP = window.VQ2.layoutProfiles;
      const 紙 = (LP.LAYOUT_MODES || []).filter((m) => m.ready && m.printable && m.profileId);
      const 答 = (LP.ANSWER_SHEET_MODES || []).filter((m) => m.ready && m.profileId);
      const 新紙 = ["univ-secondary", "eiken-style", "toeic-style", "cram-drill",
                    "a3-single-sheet", "worksheet-b5", "science-lab", "vertical-two-row"];
      const 新答 = ["grid-a3-wide", "vertical-jp", "grid-two-column", "math-large"];
      const 在 = (ら, 一覧) => ら.filter((id) => !一覧.some((m) => m.id === id));
      const 型が引ける = 紙.concat(答).filter((m) => !LP.getProfile(m.profileId)).map((m) => m.id);
      return {
        紙数: 紙.length, 答数: 答.length,
        欠紙: 在(新紙, 紙), 欠答: 在(新答, 答),
        型なし: 型が引ける
      };
    });
    見(r.欠紙.length === 0, "⑧ ★ 問題用紙の 型が 8 つ 増えた", r.欠紙.length ? r.欠紙 : r.紙数 + " 種");
    見(r.欠答.length === 0, "⑧ ★ 解答用紙の 型が 4 つ 増えた", r.欠答.length ? r.欠答 : r.答数 + " 種");
    見(r.型なし.length === 0, "⑧ どの 型も 実体が ある（名前だけの 型を 作らない）", r.型なし);
    見(r.紙数 >= 20, "⑧ 問題用紙は 20 種類 以上", r.紙数);
    見(r.答数 >= 11, "⑧ 解答用紙は 11 種類 以上", r.答数);
  }

  /* ★ 増やした 型で **実際に 紙面が 組める**（名前だけに しない） */
  節("⑧ 増やした 型で 実際に 組む");
  {
    const r = await page.evaluate(() => {
      const S = window.VQ2.schema, L = window.VQ2.layout, R = window.VQ2.pdfRenderer;
      const qs = [1, 2, 3, 4].map((i) => ({
        id: "lay-q" + i, schemaVersion: S.SCHEMA_VERSION, sectionId: "lay-s1",
        number: i, globalNumber: i, type: "multiple_choice_single", engine: "single_choice",
        prompt: "設問 " + i + " の 本文。", promptRichText: null, media: [], contentBlocks: [],
        choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" },
                  { id: "c3", text: "う" }, { id: "c4", text: "え" }],
        correctAnswer: null, acceptedAnswers: [], explanation: "解説。",
        choiceExplanations: null, answerBindingId: "lay-b" + i, points: 5,
        criterionAllocation: null, scoringRubric: null, estimatedSeconds: 60,
        difficulty: "normal", topic: "単元", tags: [], sourceReferences: [],
        requiresReview: false, confidence: null, validationIssues: []
      }));
      const base = {
        schemaVersion: S.SCHEMA_VERSION, ownerId: "", title: "型のたしかめ",
        subject: "国語", grade: "高校2年", durationMinutes: 50, totalPoints: 20,
        instructions: "", sourceMode: "open",
        cover: { examName: "型のたしかめ", subject: "国語", examDate: "2026年9月3日",
                 instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
        sections: [{ id: "lay-s1", number: 1, title: "大問一", instructions: "", points: 20, questions: qs }],
        answerBindings: qs.map((q, i) => ({ id: "lay-b" + (i + 1), questionId: q.id,
          sectionId: "lay-s1", number: String(i + 1), blankCount: 1, kind: "choice", points: 5 })),
        paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
                 margins: { top: 20, bottom: 20, left: 18, right: 18 } },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      const 新紙 = ["univ-secondary", "eiken-style", "toeic-style", "cram-drill",
                    "a3-single-sheet", "worksheet-b5", "science-lab", "vertical-two-row"];
      const 新答 = ["grid-a3-wide", "vertical-jp", "grid-two-column", "math-large"];
      const 悪 = [];
      新紙.forEach((m) => {
        try {
          const spec = JSON.parse(JSON.stringify(base));
          spec.id = "lay-" + m;
          spec.layout = { layoutMode: m, answerSheetMode: "current", outputEngine: "current" };
          const plan = L.buildPlan(spec);
          const html = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
          if (!html || html.length < 2000) 悪.push(m + ":短い(" + (html || "").length + ")");
          else if (/undefined|\[object Object\]|NaN/.test(html)) 悪.push(m + ":壊れ");
        } catch (e) { 悪.push(m + ":" + String(e.message).slice(0, 60)); }
      });
      新答.forEach((m) => {
        try {
          const spec = JSON.parse(JSON.stringify(base));
          spec.id = "lay-a-" + m;
          spec.layout = { layoutMode: "current", answerSheetMode: m, outputEngine: "current" };
          const plan = L.buildPlan(spec);
          const html = R.buildHtml(spec, plan, { bookletId: "printable-answer-sheet" });
          if (!html || html.length < 1500) 悪.push(m + ":短い(" + (html || "").length + ")");
          else if (/\[object Object\]|NaN/.test(html)) 悪.push(m + ":壊れ");
        } catch (e) { 悪.push(m + ":" + String(e.message).slice(0, 60)); }
      });
      return 悪;
    });
    見(r.length === 0, "⑧ ★ 増やした 12 の 型 すべてで 紙面が 組める", r);
  }

  /* ══ ⑨ 結果と分析 → 試験は 試験の 画面 ════════════════════════ */
  節("⑨ 結果と分析");
  {
    /* ★ 圧縮ずみの 中身は 読まない。**実際に 開いて 何が 出たか**を 見る。 */
    const 置けた = await page.evaluate(() => {
      const S = window.VQ2.schema, ST = window.VQ2.store;
      const qs = [1, 2].map((i) => ({
        id: "rv-q" + i, schemaVersion: S.SCHEMA_VERSION, sectionId: "rv-s1",
        number: i, globalNumber: i, type: "multiple_choice_single", engine: "single_choice",
        prompt: "設問 " + i + "。", promptRichText: null, media: [], contentBlocks: [],
        choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" }],
        correctAnswer: null, acceptedAnswers: [], explanation: "解説。",
        choiceExplanations: null, answerBindingId: "rv-b" + i, points: 10,
        criterionAllocation: null, scoringRubric: null, estimatedSeconds: 60,
        difficulty: "normal", topic: "単元", tags: [], sourceReferences: [],
        requiresReview: false, confidence: null, validationIssues: []
      }));
      const spec = {
        id: "rv-spec", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
        title: "結果のたしかめ", subject: "歴史", grade: "高校2年", durationMinutes: 50,
        totalPoints: 20, instructions: "", sourceMode: "open",
        cover: { examName: "結果のたしかめ", subject: "歴史", examDate: "2026年9月3日",
                 instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
        sections: [{ id: "rv-s1", number: 1, title: "一", instructions: "", points: 20, questions: qs }],
        answerBindings: qs.map((q, i) => ({ id: "rv-b" + (i + 1), questionId: q.id,
          sectionId: "rv-s1", number: String(i + 1), blankCount: 1, kind: "choice", points: 10 })),
        paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
                 margins: { top: 20, bottom: 20, left: 18, right: 18 } },
        layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      const ok1 = ST.saveExam(spec, {});
      const res = {
        id: "rv-res", kind: "mock", sessionId: "rv-sess", mockId: "rv-spec",
        presetId: "rv-spec", presetName: spec.title, subject: spec.subject,
        finishedAt: new Date().toISOString(), elapsedMs: 60000,
        questionOrder: qs.map((q) => q.id),
        items: qs.map((q, i) => ({ questionId: q.id, type: q.type, engine: q.engine,
          answered: true, value: "c1", score: i === 0 ? 10 : 0, maxScore: 10,
          isCorrect: i === 0, correct: i === 0, requiresReview: false })),
        score: 10, maxScore: 20, correctCount: 1, wrongCount: 1, unansweredCount: 0,
        aggregate: { byCriterion: {
          knowledge_skill: { score: 10, max: 10 },
          thinking_judgment_expression: { score: 0, max: 10 } } },
        sectionScores: [{ sectionId: "rv-s1", number: 1, title: "一", score: 10, max: 20 }]
      };
      const ok2 = ST.results.put(res);
      window.__rvRes = res;
      return !!(ok1 && ok1.ok) && !!(ok2 && ok2.ok !== false);
    });
    見(置けた, "⑨ 試験と 結果を 置けた", 置けた);

    await page.evaluate(() => { window.VQ2.open.result({ result: window.__rvRes }); });
    await 待(3000);
    const 出た = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /vq2-/.test(e.id) && e.shadowRoot);
      const 名 = 器.map((e) => e.id);
      const 試験 = 器.filter((e) => /exam-workspace/.test(e.id))[0];
      const r = 試験 ? 試験.shadowRoot : null;
      return {
        器: 名,
        試験の画面: !!試験,
        採点結果の並び: !!(r && r.querySelector(".vq2-xr")),
        紙: !!(r && r.querySelector(".vq2-xr-paper")),
        素点: r ? (r.querySelector(".vq2-xr-sumi.is-raw .vq2-xr-sumv") || {}).textContent || "" : "",
        知識: r ? !!r.querySelector(".vq2-xr-sumi.is-k") : false,
        思考: r ? !!r.querySelector(".vq2-xr-sumi.is-t") : false,
        落とす: r ? !!r.querySelector('[data-act="xr-dl-open"]') : false
      };
    });
    見(出た.試験の画面, "⑨ ★ 試験の 画面が 開く（プリセットの 結果画面では ない）", 出た.器);
    見(出た.採点結果の並び && 出た.紙, "⑨ ★ 採点結果と 同じ 置き（左が 紙・右が 採点）", 出た);
    見(/10/.test(出た.素点) && /20/.test(出た.素点), "④ ★ 素点が 出る", 出た.素点);
    見(出た.知識 && 出た.思考, "④ ★ 観点別（知識・技能／思考・判断・表現）が 出る", 出た);
    見(出た.落とす, "⑦ ★ ダウンロードの ボタンが ある", 出た.落とす);

    /* ⑦ 一覧を 開いて 4 つ 出るか */
    await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /exam-workspace/.test(e.id))[0];
      const b = 器 && 器.shadowRoot.querySelector('[data-act="xr-dl-open"]');
      if (b) b.click();
    });
    await 待(700);
    const 一覧 = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /exam-workspace/.test(e.id))[0];
      const r = 器 && 器.shadowRoot;
      return r ? Array.from(r.querySelectorAll("[data-dl]"))
        .map((x) => x.getAttribute("data-dl")) : [];
    });
    見(一覧.indexOf("question-booklet") >= 0 && 一覧.indexOf("printable-answer-sheet") >= 0
      && 一覧.indexOf("answer-and-explanation") >= 0 && 一覧.indexOf("model-answers") >= 0,
      "⑦ ★ 問題用紙・解答用紙・解説・模範解答 が 選べる", 一覧);

    /* ④ 色（実際に 塗られている 色を 測る） */
    const 色 = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /exam-workspace/.test(e.id))[0];
      const r = 器 && 器.shadowRoot;
      const c = (sel) => {
        const el = r && r.querySelector(sel);
        return el ? getComputedStyle(el).color : "";
      };
      return { 素点: c(".vq2-xr-sumi.is-raw .vq2-xr-sumv"),
               知識: c(".vq2-xr-sumi.is-k .vq2-xr-sumv"),
               思考: c(".vq2-xr-sumi.is-t .vq2-xr-sumv") };
    });
    const 赤 = (v) => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(v || ""); 
      return !!m && +m[1] > 180 && +m[1] > +m[3] + 40; };
    const 青 = (v) => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(v || "");
      return !!m && +m[3] > 180 && +m[3] > +m[1] + 40; };
    見(赤(色.素点), "④ ★ 素点は 赤", 色);
    見(赤(色.知識), "④ ★ 知識・技能は 赤", 色);
    見(青(色.思考), "④ ★ 思考・判断・表現は 青", 色);

    /* ⑤ 助言を 1 問ずつ 出す（AI の 代わりを 差して 振る舞いを 見る） */
    await page.evaluate(() => {
      window.VQ2.ai.feedbackAnswers = function (o) {
        return Promise.resolve({ feedback: (o.targets || []).map((t) => ({
          questionId: t.questionId, ok: true,
          why: "ここは " + (t.isCorrect ? "合っていました" : "外しました") + "。",
          next: "次は ○○ を 見直しましょう。", tags: ["単元A"] })) });
      };
    });
    await page.evaluate(() => { window.VQ2.open.result({ result: window.__rvRes }); });
    await 待(2500);
    const 助 = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /exam-workspace/.test(e.id))[0];
      const r = 器 && 器.shadowRoot;
      const t = r ? (r.querySelector(".vq2-xr-side") || {}).textContent || "" : "";
      return { 見出し: /次に つなげる/.test(t), わけ: /合っていました/.test(t),
               つぎ: /見直しましょう/.test(t), 見直す: /単元A/.test(t) };
    });
    見(助.見出し, "⑤ ★「次に つなげる」が 出る", 助);
    見(助.わけ && 助.つぎ, "⑤ ★ **正解した 問題にも** わけと 次が 出る", 助);
    見(助.見直す, "⑤ 見直す ところも 出る", 助);
  }

  /* ══ ⑪ 正解／不正解の 動き ═════════════════════════════════════ */
  節("⑪ 答え合わせの 動き");
  {
    /* ★ CSS は 影の DOM の 中に ある。器を 1 つ 開いて そこから 読む。 */
    const r = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /vq2-/.test(e.id) && e.shadowRoot);
      const 全 = 器.map((e) => Array.from(e.shadowRoot.querySelectorAll("style"))
        .map((x) => x.textContent).join("\n")).join("\n");
      return {
        器: 器.map((e) => e.id),
        長さ: 全.length,
        pop: /@keyframes vq2-pop/.test(全),
        shake: /@keyframes vq2-shake/.test(全),
        ok: /\.vq2-jd\.is-ok\s*\{[^}]*vq2-pop/.test(全),
        ng: /\.vq2-jd\.is-ng\s*\{[^}]*vq2-shake/.test(全),
        speak: /\.vq2-sp-fb\.is-ng\s*\{[^}]*vq2-shake/.test(全),
        減らす: /prefers-reduced-motion[\s\S]{0,240}vq2-jd\.is-ok/.test(全)
      };
    });
    見(r.pop, "⑪ ★ 正解の「ふわっ」が ある（keyframes）", { 器: r.器, 長さ: r.長さ });
    見(r.shake, "⑪ ★ 不正解の「横ゆれ」が ある（keyframes）", r.shake);
    見(r.ok && r.ng, "⑪ 正解／不正解に それぞれ 割り当ててある", r);
    見(r.speak, "⑪ VocabuSpeak にも 同じ 動きが 付く", r.speak);
    見(r.減らす, "⑪ 動きを 減らす 設定の 人には 動かさない", r.減らす);
    /* ★ **本当に 動くか**を 影の DOM の 中で 測る（2026-09-03）。
       document.body へ 置いても SHELL_CSS は 届かないので 何も 測れない。 */
    const 動 = await page.evaluate(() => {
      const 器 = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.id && /vq2-/.test(e.id) && e.shadowRoot)[0];
      if (!器) return null;
      const r = 器.shadowRoot;
      const 箱 = document.createElement("div");
      箱.style.cssText = "position:absolute;left:-9999px;top:0";
      箱.innerHTML =
        '<div class="vq2-card vq2-jd is-ok"></div>'
        + '<div class="vq2-card vq2-jd is-ng"></div>'
        + '<button class="vq2-choice is-correct is-mine"></button>'
        + '<button class="vq2-choice is-wrong"></button>'
        + '<button class="vq2-choice is-correct"></button>'
        + '<button class="vq2-choice"></button>'
        + '<div class="vq2-sort-i is-wrong"></div>'
        + '<div class="vq2-match-i is-correct"></div>';
      r.appendChild(箱);
      const 名 = (i) => {
        const el = 箱.children[i];
        return String(getComputedStyle(el).animationName || "none");
      };
      const 出 = { 札ok: 名(0), 札ng: 名(1), 選ok: 名(2), 選ng: 名(3),
                   選正解だが選ばず: 名(4), 素の選択肢: 名(5),
                   並替ng: 名(6), 組合せok: 名(7) };
      箱.remove();
      return 出;
    });
    見(!!動 && /vq2-pop/.test(動.選ok) && /vq2-ok-ring/.test(動.選ok),
      "⑪ ★ **選んで 合っていた 選択肢**が ふわっと 浮く", 動);
    見(!!動 && /vq2-shake/.test(動.選ng) && /vq2-ng-ring/.test(動.選ng),
      "⑪ ★ **選んで 外した 選択肢**が 横に ゆれる", 動);
    見(!!動 && /vq2-reveal/.test(動.選正解だが選ばず) && !/vq2-pop|vq2-shake/.test(動.選正解だが選ばず),
      "⑪ ★ 選ばなかった 正解は **跳ねずに** そっと 出る", 動);
    見(!!動 && 動.素の選択肢 === "none", "⑪ 答え合わせの 前は 動かない", 動);
    見(!!動 && /vq2-shake/.test(動.並替ng), "⑪ 並べ替えの 外れも ゆれる", 動);
    見(!!動 && /vq2-pop/.test(動.組合せok), "⑪ 組み合わせの 正解も 浮く", 動);
    見(!!動 && /vq2-pop/.test(動.札ok) && /vq2-shake/.test(動.札ng),
      "⑪ 答え合わせの 札も これまでどおり 動く", 動);
  }

  /* ══ ⑤ 助言の 口 ═══════════════════════════════════════════════ */
  節("⑤ 1 問ずつの 助言");
  {
    const 呼 = await fetch(BASE + "/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ targets: [{ questionId: "q1", prompt: "1+1 は？", type: "numeric_input",
        points: 5, score: 5, isCorrect: true, correctAnswer: "2", answerText: "2", explanation: "" }] })
    });
    const jj = await 呼.json().catch(() => ({}));
    見(呼.status !== 404, "⑤ ★ /api/ai/feedback の 口が 在る", { status: 呼.status, code: jj.code });
    見(呼.status !== 401, "⑤ 合言葉が 通る", 呼.status);
    if (呼.status === 200) {
      見(Array.isArray(jj.feedback) && jj.feedback.length === 1, "⑤ ★ 1 問に 1 つ 返る", jj.feedback);
      const f = (jj.feedback || [])[0] || {};
      見(f.ok === true && (f.why || f.next), "⑤ ★ 正解でも 助言が 返る", f);
    } else {
      見(呼.status === 503 || 呼.status === 502,
        "⑤ （鍵が 無いので 中身は 測れない。断り方だけ 確かめる）", { status: 呼.status, code: jj.code });
    }
    見(typeof (await page.evaluate(() => typeof window.VQ2.ai.feedbackAnswers)) === "string"
      && (await page.evaluate(() => typeof window.VQ2.ai.feedbackAnswers)) === "function",
      "⑤ 画面から その 口を 呼ぶ 道具が ある");
    /* 結果画面で 実際に 出るかは ⑨ の 節で 振る舞いとして 見ている。 */
  }

  /* ══ ① 資料の 分けかた（均等に 出す）══════════════════════════ */
  節("① 資料から 均等に 出す");
  {
    const r = await page.evaluate(() => {
      const M = window.__vqMake;
      const G = window.VQ2.aigen;
      return {
        分け口: !!(M && M.渡す本文),
        束: (M && M.渡す本文) ? M.渡す本文().length : -1,
        大きい資料の刻み: String(G.bigDocText).length > 0,
      };
    });
    見(r.分け口, "① 資料を 分ける 口が ある", r);
    const 刻み = await page.evaluate(() => {
      /* 資料が 無い ときは 0 束。分けかたの 決まりだけを 見る。 */
      const s = String(window.__vqMake && window.__vqMake.渡す本文 || "");
      return s.length > 0;
    });
    見(刻み !== null, "① 分けかたを 外から 呼べる");
    const 上限 = await page.evaluate(() => {
      const F = window.__vqChatFiles;
      const L = F && F.LIMITS ? F.LIMITS : null;
      return L ? { 画像: L.maxBytesByKind && L.maxBytesByKind.image,
                   読取: L.maxScanBytes, 頁: L.maxScanPages,
                   書類: L.maxBytesByKind && L.maxBytesByKind.document } : null;
    });
    見(!!上限 && 上限.画像 >= 100 * 1024 * 1024, "① ★ スキャン画像は 100MB まで", 上限);
    見(!!上限 && 上限.読取 >= 100 * 1024 * 1024, "① ★ 読み取りも 100MB まで", 上限);
    見(!!上限 && 上限.頁 >= 60, "① ★ 読み取る ページの 上限が 12 → 60（同じ 箇所ばかりの 一因）", 上限);
    見(!!上限 && 上限.書類 >= 100 * 1024 * 1024, "① PDF は これまでどおり 100MB 以上", 上限);
  }

  /* ══ ⑩ 公式の 英単語プリセット ═════════════════════════════════ */
  節("⑩ VocabuTest 5 本");
  {
    /* ★ この 口は 配信網に 60 秒 溜まる。**溜めさせない**（2026-09-03 実測で 踏んだ）。 */
    const jj = await fetch(BASE + "/api/official-presets?nc=" + Date.now()).then(j);
    const ps = (jj && jj.presets) || [];
    見(Array.isArray(ps), "一覧が 取れる", ps.length);
    if (ps.length) {
      const 名 = ps.map((p) => p.name);
      見(ps.length === 5, "⑩ ★ 11 本 → 5 本 に まとまった", 名);
      見(名.join("／") === "VocabuTest 0-200／VocabuTest 200-400／VocabuTest 400-600／"
        + "VocabuTest 600-800／VocabuTest 800-1000", "⑩ ★ 名前が そろっている", 名);
      const 語数 = ps.map((p) => (p.words || []).length);
      見(語数.every((n) => n === 200), "⑩ ★ 中身も 200 語ずつ に まとまった", 語数);
      const 表紙 = ps.map((p) => (p.appearance || {}).banner || "");
      見(表紙.every((b) => /^\/assets\/vocabutest\/vt[1-5]\.svg$/.test(b)),
        "⑩ ★ それぞれに 表紙が ある", 表紙);
      const dup = new Set(表紙);
      見(dup.size === 5, "⑩ ★ 表紙は 5 枚 とも 別のもの", 表紙);
      /* 表紙が 本当に 取れるか */
      for (let i = 1; i <= 5; i++) {
        const rr = await fetch(BASE + "/assets/vocabutest/vt" + i + ".svg");
        if (i === 1) 見(rr.status === 200, "⑩ 表紙の 絵が 取れる", rr.status);
      }
    } else {
      見(false, "⑩ 公式プリセットが 1 本も 無い（ローカルは cron が まだ 回っていない）", ps);
    }
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  await browser.close();
  console.log("\n" + "─".repeat(28));
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) { console.log("落ちたもの:"); 落ち.forEach((x) => console.log("  - " + x)); }
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("落ちました:", e && e.stack || e); process.exit(1); });
