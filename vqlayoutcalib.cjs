/* 紙面レイアウトの校正結果を、実ブラウザで描いて確かめる。

   やること
     1. 実画像の構造を含む見本データで、問題用紙と解答用紙を組む
     2. 既存の inspector.js を **実際に通す**（推測ではなく実測）
     3. 問題用紙 20 Seed / 解答用紙 20 Seed を回す
     4. 成果物（PNG / HTML / LayoutPlan）を artifacts/layout-calibration へ出す

   AI は使わない。

   実行: node vqlayoutcalib.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "http://127.0.0.1:8791";
const OUT = path.join(__dirname, "artifacts", "layout-calibration");
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

/* 見本データ。実画像と同じ「内容」は作らない（コピーしない）。
   確かめたいのは構造なので、
     ・図・図・表の 3 点を持つ設問（横並び）
     ・グラフ 1 点を持つ設問（本文左・グラフ右）
     ・選択 / 短答 / 記述 / 論述 / 対応 / 文字ごとのマス
   を含める。 */
const MAKE = `
window.__calibSpec = function () {
  var S = window.VQ2.schema;
  function svg(label, w, h) {
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#fff" stroke="#000" stroke-width="2"/>' +
      '<text x="10" y="' + (h / 2) + '" font-size="16" fill="#000">' + label + '</text></svg>');
  }
  var qs = [];
  function add(o) {
    var i = qs.length + 1;
    qs.push(Object.assign({
      id: "q" + i, schemaVersion: 2, sectionId: o.sectionId || "s1", number: i,
      type: "multiple_choice_single", prompt: "設問 " + i + " の問題文です。",
      explanation: "解説", points: 5,
      choices: [
        { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
      ],
      correctAnswer: null, acceptedAnswers: [], difficulty: "normal", topic: "", tags: [],
      estimatedSeconds: 60, sourceReferences: [], requiresReview: false, validationIssues: [],
      answerBindingId: "b" + i
    }, o));
    qs[qs.length - 1].number = i;
    qs[qs.length - 1].id = "q" + i;
    qs[qs.length - 1].answerBindingId = "b" + i;
    return qs[qs.length - 1];
  }

  /* 大問1：図・図・表の 3 点を横並びにできる設問を含む */
  add({ prompt: "観測の記録から、天気・風向・風力を読み取りなさい。",
        contentBlocks: [
          { type: "figure", src: svg("記号", 180, 180), caption: "観測記号" },
          { type: "figure", src: svg("計器", 140, 200), caption: "計器の読み" },
          { type: "table", caption: "対応表の一部",
            rows: [["区分", "0", "1", "2"], ["A", "100", "90", "80"], ["B", "100", "89", "78"]] }
        ] });
  add({ prompt: "次のうち、正しい説明を一つ選びなさい。" });
  /* グラフ 1 点：本文左・グラフ右になりうる設問 */
  add({ prompt: "右のグラフから読み取れることとして、適するものを一つ選びなさい。",
        contentBlocks: [{ type: "figure", src: svg("グラフ", 220, 200), caption: "測定値の変化" }] });
  add({ type: "short_answer", choices: [], correctAnswer: "答え", points: 5,
        prompt: "この現象の名前を書きなさい。" });
  add({ type: "short_answer", choices: [], correctAnswer: "答え", points: 10,
        prompt: "そうなる理由を 30 字程度で説明しなさい。" });

  /* 大問2：形式を混ぜる */
  add({ sectionId: "s2", type: "true_false", points: 5, prompt: "次の文は正しいか。",
        choices: [{ id: "c1", label: "A", text: "正しい", isCorrect: true },
                  { id: "c2", label: "B", text: "誤り", isCorrect: false }] });
  add({ sectionId: "s2", type: "short_answer", choices: [], correctAnswer: "weather", points: 5,
        prompt: "英語 8 文字で書きなさい。", answerLayoutHint: { kind: "box-sequence", count: 8 } });
  add({ sectionId: "s2", type: "matching", points: 5, prompt: "対応させなさい。",
        choices: [{ id: "c1", label: "A", text: "あ", isCorrect: true },
                  { id: "c2", label: "B", text: "い", isCorrect: false },
                  { id: "c3", label: "C", text: "う", isCorrect: false }] });
  add({ sectionId: "s2", type: "long_answer", choices: [], correctAnswer: "答え", points: 10,
        prompt: "実験の結果から言えることを説明しなさい。",
        scoringRubric: { items: [{ id: "r1", description: "根拠", points: 10, criterionId: "knowledge_skill" }] } });
  add({ sectionId: "s2", type: "essay", choices: [], correctAnswer: "答え", points: 10,
        prompt: "自分の考えを述べなさい。",
        scoringRubric: { items: [{ id: "r1", description: "主張", points: 10, criterionId: "thinking_judgment_expression" }] } });
  add({ sectionId: "s2", points: 5, prompt: "適するものを一つ選びなさい。" });
  add({ sectionId: "s2", type: "short_answer", choices: [], correctAnswer: "答え", points: 5,
        prompt: "語句を書きなさい。" });

  var s1 = qs.filter(function (x) { return x.sectionId === "s1"; });
  var s2 = qs.filter(function (x) { return x.sectionId === "s2"; });
  var pts = function (a) { return a.reduce(function (t, x) { return t + x.points; }, 0); };
  return {
    id: "m_calib", schemaVersion: 2, title: "中2理科　後期中間試験",
    subject: "理科", grade: "中2", durationMinutes: 50,
    totalPoints: pts(qs), sourceMode: "source-only",
    paper: S.defaultPaper(),
    sections: [
      { id: "s1", number: 1, title: "以下の問いに答えなさい。", instructions: "", points: pts(s1), questions: s1 },
      { id: "s2", number: 2, title: "次の問いに答えなさい。", instructions: "", points: pts(s2), questions: s2 }
    ],
    answerBindings: qs.map(function (x) {
      return { id: x.answerBindingId, questionId: x.id, number: String(x.number),
               inputType: x.type, points: x.points,
               blankCount: x.type === "matching" ? 3 : 1 };
    })
  };
};
window.__withLayout = function (spec, seed) {
  var LP = window.VQ2.layoutProfiles;
  var s = JSON.parse(JSON.stringify(spec));
  s.layout = Object.assign(LP.defaultLayoutSettings(), {
    layoutMode: "school-science-figure", answerSheetMode: "grid-dense", layoutSeed: seed
  });
  return s;
};
/* 実際に描いて inspector を通す。iframe は呼び出し側が用意する。 */
window.__inspect = function (iframeId, spec, plan) {
  var f = document.getElementById(iframeId);
  return window.VQ2.inspector.inspect(f, spec, plan);
};
`;

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  const pageErrors = [];
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);
  await pg.addScriptTag({ content: MAKE });

  /* 測るための iframe を用意する（inspector は実際の DOM を測る） */
  await pg.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "calibFrame";
    f.style.cssText = "position:fixed;left:-4000px;top:0;width:900px;height:1400px;border:0";
    document.body.appendChild(f);
  });

  section("1. 構造（実画像から読み取った要素が出ているか）");
  const struct = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    /* 成果物には「複数図表の横並び」と「本文左・グラフ右」の両方を入れたい。
       どの Seed でそうなるかは決まっていないので、条件を満たす Seed を探す。
       探し方は決定論（0 から順に見る）なので、毎回同じ Seed が選ばれる。 */
    const base = window.__calibSpec();
    let seed = "CALIB-0";
    for (let i = 0; i < 200; i++) {
      const cand = window.__withLayout(base, "CALIB-" + i);
      const lp = LP.planLayout(cand, {});
      const qsAll = lp.sections.flatMap((s) => s.questions);
      const layouts = qsAll.filter((q) => q.figureGroup).map((q) => q.figureGroup.layout);
      /* 実画像の（ウ）は「本文と選択肢が左、グラフが右」。
         同じ side でも figure-right は選択肢が下へ落ちるので、
         成果物には text-left-graph-right が出ている Seed を選ぶ。 */
      const hasTextLeftGraphRight = qsAll.some((q) => q.figureLayout === "text-left-graph-right");
      /* 解答用紙側も「同じ行に複数の小問」が出ている Seed を選ぶ
         （実画像 2 枚目の要点なので、成果物に必ず入れたい） */
      const ANS = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
      const multi = (lp.answerSheet.grid.blocks || []).flatMap((b) => b.rows)
        .filter((r) => r.cells.filter((c) => ANS.indexOf(c.type) >= 0).length >= 2).length;
      if (layouts.indexOf("horizontal-centered") >= 0 && hasTextLeftGraphRight && multi >= 1) {
        seed = "CALIB-" + i;
        break;
      }
    }
    const spec = window.__withLayout(base, seed);
    const lp = LP.planLayout(spec, {});
    const plan = window.VQ2.layout.buildPlan(spec, {});
    const qb = plan.booklets.find((b) => b.kind === "question");
    const sb = plan.booklets.find((b) => b.kind === "answer-sheet");
    const html = window.VQ2.pdfRenderer.buildHtml(spec, plan, {});
    const qHtml = window.VQ2.pdfRenderer.buildHtml(spec, plan, { bookletId: "question-booklet" });
    const sHtml = window.VQ2.pdfRenderer.buildHtml(spec, plan, { bookletId: "printable-answer-sheet" });
    const ANSWER = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
    const cells = sb.blocks.filter((b) => b.type === "answer-grid-block")
      .flatMap((b) => b.rows).flatMap((r) => r.cells);
    return {
      plan: lp,
      qTypes: [...new Set(qb.blocks.map((b) => b.type))],
      sTypes: [...new Set(sb.blocks.map((b) => b.type))],
      choiceLabels: (qb.blocks.find((b) => b.type === "choices") || {}).choices?.map((c) => c.label),
      markers: qb.blocks.filter((b) => b.type === "question" || b.type === "figure-group").map((b) => b.marker),
      groupLayouts: qb.blocks.filter((b) => b.type === "figure-group").map((b) => b.groupLayout),
      figureLayouts: qb.blocks.filter((b) => b.type === "figure-group").map((b) => b.figureLayout),
      choicesInBody: qb.blocks.filter((b) => b.type === "figure-group" && b.choices).length,
      cellTypes: [...new Set(cells.filter((c) => ANSWER.indexOf(c.type) >= 0).map((c) => c.type))],
      answerCellCount: cells.filter((c) => ANSWER.indexOf(c.type) >= 0).length,
      rowSpanMax: Math.max(...sb.blocks.filter((b) => b.type === "answer-grid-block")
        .map((b) => b.sectionLabel.rowSpan)),
      colSpanMax: Math.max(...cells.map((c) => c.colSpan || 1)),
      multiPerRow: sb.blocks.filter((b) => b.type === "answer-grid-block")
        .flatMap((b) => b.rows)
        .filter((r) => r.cells.filter((c) => ANSWER.indexOf(c.type) >= 0).length >= 2).length,
      hasSlash: sb.blocks.filter((b) => b.type === "answer-grid-block").every((b) => b.score.slash),
      hasLegend: sb.blocks.some((b) => b.type === "answer-grid-legend"),
      hasFoot: sb.blocks.some((b) => b.type === "answer-grid-foot"),
      seed,
      html, qHtml, sHtml
    };
  });
  console.log("   成果物に使った Seed: " + struct.seed);
  console.log("   問題用紙のブロック: " + JSON.stringify(struct.qTypes));
  console.log("   解答用紙のブロック: " + JSON.stringify(struct.sTypes));
  console.log("   解答欄の種類: " + JSON.stringify(struct.cellTypes));

  ok("選択肢が「1. 2. 3. 4.」", JSON.stringify(struct.choiceLabels) === '["1.","2.","3.","4."]',
    JSON.stringify(struct.choiceLabels));
  ok("小問記号が（ア）（イ）（ウ）…", struct.markers[0] === "（ア）" && struct.markers[1] === "（イ）",
    JSON.stringify(struct.markers.slice(0, 3)));
  ok("複数図表がひとまとまりで横並びになる",
    struct.groupLayouts.indexOf("horizontal-centered") >= 0, JSON.stringify(struct.groupLayouts));
  ok("本文左・グラフ右の形が出る（選択肢も本文の側）",
    struct.figureLayouts.indexOf("text-left-graph-right") >= 0 && struct.choicesInBody >= 1,
    JSON.stringify(struct.figureLayouts) + " / 本文内の選択肢 " + struct.choicesInBody);
  ok("大問セルが縦に結合されている（rowSpan）", struct.rowSpanMax >= 2, String(struct.rowSpanMax));
  ok("複数列を結合した解答欄がある（colSpan）", struct.colSpanMax >= 2, String(struct.colSpanMax));
  ok("同じ行に複数の小問が入る行がある", struct.multiPerRow >= 1, String(struct.multiPerRow));
  ok("小さい記号欄がある", struct.cellTypes.indexOf("small-box") >= 0);
  ok("連続マスがある（box-sequence）", struct.cellTypes.indexOf("box-sequence") >= 0);
  ok("横長解答欄がある", struct.cellTypes.indexOf("wide-answer") >= 0);
  ok("複数行の記述欄がある", struct.cellTypes.indexOf("lined-answer") >= 0);
  ok("大問得点欄が斜線 + 満点", struct.hasSlash === true);
  ok("配点の凡例がある（1点配当 / 2点配当）", struct.hasLegend === true);
  ok("年組番氏名と合計欄がある", struct.hasFoot === true);
  ok("解答欄の数が設問の数と一致", struct.answerCellCount === 12, String(struct.answerCellCount));

  /* ── 成果物 ── */
  fs.writeFileSync(path.join(OUT, "question-paper.html"), struct.qHtml, "utf8");
  fs.writeFileSync(path.join(OUT, "answer-sheet.html"), struct.sHtml, "utf8");
  fs.writeFileSync(path.join(OUT, "layout-plan.json"), JSON.stringify(struct.plan, null, 2), "utf8");

  const shot = async (html, file, h) => {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: 900, height: h || 1300 });
    await p2.setContent(html, { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(700);
    await p2.screenshot({ path: path.join(OUT, file), fullPage: true });
    await p2.close();
  };
  await shot(struct.qHtml, "question-paper.png");
  await shot(struct.sHtml, "answer-sheet.png");

  section("2. inspector を実際に通す（問題用紙 20 Seed）");
  const insQ = await pg.evaluate(async () => {
    const LP = window.VQ2.layoutProfiles, R = window.VQ2.pdfRenderer, L = window.VQ2.layout;
    const base = window.__calibSpec();
    const rows = [];
    for (let i = 0; i < 20; i++) {
      const spec = window.__withLayout(base, "QP-" + i);
      const plan = L.buildPlan(spec, {});
      const html = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
      const f = document.getElementById("calibFrame");
      f.srcdoc = html;
      await new Promise((r) => { f.onload = r; setTimeout(r, 900); });
      await new Promise((r) => setTimeout(r, 250));
      const res = window.VQ2.inspector.inspect(f, spec, plan);
      rows.push({
        seed: "QP-" + i,
        pages: res.measurements ? res.measurements.pages.length : 0,
        issues: (res.issues || []).map((x) => x.issueType),
        high: (res.issues || []).filter((x) => x.severity === "high").length,
        medium: (res.issues || []).filter((x) => x.severity === "medium").length,
        low: (res.issues || []).filter((x) => x.severity === "low").length
      });
    }
    return rows;
  });
  const tally = (rows, t) => rows.reduce((a, r) => a + r.issues.filter((x) => x === t).length, 0);
  const kinds = [...new Set(insQ.flatMap((r) => r.issues))];
  console.log("   出た指摘: " + (kinds.length ? JSON.stringify(kinds) : "なし"));
  console.log("   ページ数: " + JSON.stringify([...new Set(insQ.map((r) => r.pages))]));
  ok("overflow 0", tally(insQ, "overflow") === 0, String(tally(insQ, "overflow")));
  ok("overlap 0", tally(insQ, "overlap") === 0, String(tally(insQ, "overlap")));
  ok("figureGroup 分断 0", tally(insQ, "figure_group_split") === 0, String(tally(insQ, "figure_group_split")));
  ok("問題番号の欠落 0", tally(insQ, "missing_question_number") === 0, String(tally(insQ, "missing_question_number")));
  ok("配点の不一致 0", tally(insQ, "points_mismatch") === 0, String(tally(insQ, "points_mismatch")));
  ok("図の読み込み失敗 0", tally(insQ, "missing_image") === 0, String(tally(insQ, "missing_image")));
  ok("小さすぎる文字 0", tally(insQ, "unreadable_font") === 0, String(tally(insQ, "unreadable_font")));
  ok("白紙ページ 0", insQ.every((r) => r.pages >= 1), JSON.stringify(insQ.map((r) => r.pages)));
  ok("20 Seed すべてで描画できた", insQ.length === 20 && insQ.every((r) => r.pages > 0));

  section("3. inspector を実際に通す（解答用紙 20 Seed）");
  const insA = await pg.evaluate(async () => {
    const R = window.VQ2.pdfRenderer, L = window.VQ2.layout;
    const base = window.__calibSpec();
    const rows = [];
    for (let i = 0; i < 20; i++) {
      const spec = window.__withLayout(base, "AS-" + i);
      const plan = L.buildPlan(spec, {});
      const html = R.buildHtml(spec, plan, { bookletId: "printable-answer-sheet" });
      const f = document.getElementById("calibFrame");
      f.srcdoc = html;
      await new Promise((r) => { f.onload = r; setTimeout(r, 900); });
      await new Promise((r) => setTimeout(r, 250));
      const res = window.VQ2.inspector.inspect(f, spec, plan);
      /* 解答欄が紙面に出ているかも、実際の DOM から数える */
      const d = f.contentDocument;
      const bindings = new Set(Array.from(d.querySelectorAll("[data-binding]"))
        .map((n) => n.getAttribute("data-binding")).filter(Boolean));
      rows.push({
        seed: "AS-" + i,
        pages: res.measurements ? res.measurements.pages.length : 0,
        issues: (res.issues || []).map((x) => x.issueType),
        bindings: bindings.size,
        cells: d.querySelectorAll(".agbt [data-question]").length
      });
    }
    return rows;
  });
  const kindsA = [...new Set(insA.flatMap((r) => r.issues))];
  console.log("   出た指摘: " + (kindsA.length ? JSON.stringify(kindsA) : "なし"));
  console.log("   解答欄の数: " + JSON.stringify([...new Set(insA.map((r) => r.cells))]));
  ok("overflow 0", tally(insA, "overflow") === 0, String(tally(insA, "overflow")));
  ok("overlap 0", tally(insA, "overlap") === 0, String(tally(insA, "overlap")));
  ok("文字の切れ 0", tally(insA, "clipped_text") === 0, String(tally(insA, "clipped_text")));
  ok("最小セル幅の違反 0", tally(insA, "cell_too_narrow") === 0, String(tally(insA, "cell_too_narrow")));
  ok("最小セル高さの違反 0", tally(insA, "cell_too_short") === 0, String(tally(insA, "cell_too_short")));
  ok("解答欄の欠落 0", tally(insA, "missing_answer_binding") === 0, String(tally(insA, "missing_answer_binding")));
  ok("すべての Seed で解答欄が 12 問ぶん出る",
    insA.every((r) => r.bindings === 12), JSON.stringify([...new Set(insA.map((r) => r.bindings))]));
  ok("白紙ページ 0", insA.every((r) => r.pages >= 1));
  ok("20 Seed すべてで描画できた", insA.length === 20 && insA.every((r) => r.pages > 0));

  fs.writeFileSync(path.join(OUT, "inspector-report.json"),
    JSON.stringify({ questionPaper: insQ, answerSheet: insA }, null, 2), "utf8");

  section("3.5 current 経路と比べる（ページ番号が入ったこと）");
  const baseIns = await pg.evaluate(async () => {
    const R = window.VQ2.pdfRenderer, L = window.VQ2.layout;
    const spec = window.__calibSpec();          /* layout を付けない＝現行の Quick Mock */
    const plan = L.buildPlan(spec, {});
    const f = document.getElementById("calibFrame");
    f.srcdoc = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
    await new Promise((r) => { f.onload = r; setTimeout(r, 1000); });
    await new Promise((r) => setTimeout(r, 300));
    const res = window.VQ2.inspector.inspect(f, spec, plan);
    const d = f.contentDocument;
    return { issues: (res.issues || []).map((x) => x.issueType),
             pgno: d.querySelectorAll(".pgno").length,
             pages: d.querySelectorAll(".page").length };
  });
  console.log("   current 経路: " + JSON.stringify(baseIns));
  /* ページ番号を入れる前は、current でも missing_page_number が出ていた。
     いまは両方で出ない。 */
  ok("current 経路でも missing_page_number が出ない",
    baseIns.issues.indexOf("missing_page_number") < 0, JSON.stringify(baseIns.issues));
  ok("current 経路でもページ番号が全ページに入る",
    baseIns.pgno === baseIns.pages && baseIns.pages >= 1,
    baseIns.pgno + " / " + baseIns.pages);

  section("4. current 経路（未選択）が変わっていないか");
  const cur = await pg.evaluate(() => {
    const spec = window.__calibSpec();
    const plan = window.VQ2.layout.buildPlan(spec, {});
    const types = plan.booklets.flatMap((b) => b.blocks.map((x) => x.type));
    const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
    const ch = plan.booklets[0].blocks.find((b) => b.type === "choices");
    const html = window.VQ2.pdfRenderer.buildHtml(spec, plan, {});
    return {
      hasLayout: !!spec.layout,
      hasProfile: !!plan.layoutProfile,
      newBlocks: types.filter((t) => t === "figure-group" || String(t).indexOf("answer-grid") === 0),
      answerBlocks: [...new Set(sheet.blocks.map((b) => b.type))],
      choiceLabels: ch ? ch.choices.map((c) => c.label) : null,
      headHasMeta: /exam-meta/.test(html),
      headHasName: /name-box/.test(html)
    };
  });
  console.log("   " + JSON.stringify(cur));
  ok("MockSpec に layout を足さない", cur.hasLayout === false);
  ok("計画にプロファイル情報が付かない", cur.hasProfile === false);
  ok("新しいブロックが出てこない", cur.newBlocks.length === 0, cur.newBlocks.join(","));
  ok("解答用紙は従来どおり answer-area", cur.answerBlocks.indexOf("answer-area") >= 0, cur.answerBlocks.join(","));
  ok("選択肢は従来どおり丸数字", JSON.stringify(cur.choiceLabels) === '["①","②","③","④"]',
    JSON.stringify(cur.choiceLabels));
  ok("見出しは従来どおり（科目行と氏名欄が出る）", cur.headHasMeta && cur.headHasName);

  section("画面のエラー");
  const real = pageErrors.filter((e) => !/ResizeObserver|Non-Error promise|Firebase 連携が無効/.test(e));
  console.log(real.length ? "   " + real.slice(0, 5).join("\n   ") : "   なし");
  ok("画面のエラーが出ていない", real.length === 0, real.slice(0, 2).join(" / "));

  await browser.close();
  console.log(`\n成果物: ${OUT}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.stack || e); process.exit(2); });
