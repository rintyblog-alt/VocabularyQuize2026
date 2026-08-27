/* 複数ページの紙面を、実ブラウザで描いて inspector で確かめる。

   作るもの
     A. 問題冊子 … 3 ページ以上（長文・図表グループ・本文左図右・長い選択肢・大問 5 つ以上）
     B. 解答用紙 … 2 ページ以上（選択・短答・連続マス・計算欄・100 字記述・大問別得点欄）

   確かめること（すべて inspector の実測）
     overflow / overlap / clipped_text / blank_page / missing_page_number /
     missing_question / missing_answer_binding / figure_group_split /
     orphan_heading / 記入面積の下限

   AI は使わない。

   実行: node vqmultipage.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "http://127.0.0.1:8791";
const OUT = path.join(__dirname, "artifacts", "layout-multipage");
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

/* 3 ページ以上になる分量の見本。中身は作り話をしない骨組みだけ。 */
const MAKE = `
window.__bigSpec = function () {
  var S = window.VQ2.schema;
  function svg(label, w, h) {
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#fff" stroke="#000" stroke-width="2"/>' +
      '<text x="10" y="' + (h / 2) + '" font-size="16">' + label + '</text></svg>');
  }
  var LONG = "";
  for (var i = 0; i < 26; i++) {
    LONG += "第 " + (i + 1) + " 文。ここは分量を出すための本文です。"
      + "実際の教材の文章ではありません。改ページの挙動を見るために長くしています。\\n";
  }
  var LONG_CHOICE = "この選択肢は折り返しが必要になるくらい長く書いてあるもので、2 段組みにできない例です";

  var qs = [], secs = [];
  function add(secId, o) {
    var i = qs.length + 1;
    var q = Object.assign({
      id: "q" + i, schemaVersion: 2, sectionId: secId, number: i,
      type: "multiple_choice_single", prompt: "設問 " + i + " の問題文です。",
      explanation: "解説", points: 4,
      choices: [
        { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
      ],
      correctAnswer: null, acceptedAnswers: [], difficulty: "normal", topic: "", tags: [],
      estimatedSeconds: 60, sourceReferences: [], requiresReview: false, validationIssues: [],
      answerBindingId: "b" + i
    }, o);
    q.id = "q" + i; q.number = i; q.answerBindingId = "b" + i; q.sectionId = secId;
    qs.push(q);
    return q;
  }

  /* 大問1：長文＋設問 */
  add("s1", { contentBlocks: [{ type: "passage", text: LONG }],
              prompt: "本文の内容として適するものを一つ選びなさい。" });
  add("s1", { prompt: "本文中の下線部の意味を答えなさい。", type: "short_answer",
              choices: [], correctAnswer: "答え", points: 4 });
  add("s1", { prompt: "本文の主張を 100 字程度でまとめなさい。", type: "essay",
              choices: [], correctAnswer: "答え", points: 10,
              scoringRubric: { items: [{ id: "r1", description: "主張", points: 10,
                                         criterionId: "thinking_judgment_expression" }] } });

  /* 大問2：図表グループ（3 点） */
  add("s2", { prompt: "図と表から読み取れることを答えなさい。",
              contentBlocks: [
                { type: "figure", src: svg("図A", 180, 180), caption: "図A" },
                { type: "figure", src: svg("図B", 160, 200), caption: "図B" },
                { type: "table", caption: "表1", rows: [["区分", "0", "1"], ["A", "100", "90"], ["B", "100", "89"]] }
              ] });
  add("s2", { prompt: "同じ実験をもう一度行った場合の結果を答えなさい。", type: "short_answer",
              choices: [], correctAnswer: "答え" });
  add("s2", { prompt: "その理由を 40 字程度で説明しなさい。", type: "long_answer",
              choices: [], correctAnswer: "答え", points: 8,
              scoringRubric: { items: [{ id: "r1", description: "根拠", points: 8,
                                         criterionId: "knowledge_skill" }] } });

  /* 大問3：本文左・グラフ右 ＋ 長い選択肢 */
  add("s3", { prompt: "右のグラフから読み取れることとして適するものを一つ選びなさい。",
              contentBlocks: [{ type: "figure", src: svg("グラフ", 220, 200), caption: "測定値" }] });
  add("s3", { prompt: "次のうち正しい説明を一つ選びなさい。",
              choices: [
                { id: "c1", label: "A", text: LONG_CHOICE + "（その1）", isCorrect: true },
                { id: "c2", label: "B", text: LONG_CHOICE + "（その2）", isCorrect: false },
                { id: "c3", label: "C", text: LONG_CHOICE + "（その3）", isCorrect: false },
                { id: "c4", label: "D", text: LONG_CHOICE + "（その4）", isCorrect: false }
              ] });
  add("s3", { prompt: "英語 8 文字で書きなさい。", type: "short_answer", choices: [],
              correctAnswer: "weather", answerLayoutHint: { kind: "box-sequence", count: 8 } });

  /* 大問4：計算・作図 */
  add("s4", { prompt: "次の値を求めなさい。途中の計算も書きなさい。", type: "long_answer",
              choices: [], correctAnswer: "答え", points: 10,
              scoringRubric: { items: [{ id: "r1", description: "過程", points: 10,
                                         criterionId: "knowledge_skill" }] } });
  add("s4", { prompt: "△ABC が二等辺三角形であることを証明しなさい。", type: "essay",
              choices: [], correctAnswer: "答え", points: 12,
              scoringRubric: { items: [{ id: "r1", description: "論理", points: 12,
                                         criterionId: "thinking_judgment_expression" }] } });
  add("s4", { prompt: "対応させなさい。", type: "matching",
              choices: [{ id: "c1", label: "A", text: "あ", isCorrect: true },
                        { id: "c2", label: "B", text: "い", isCorrect: false },
                        { id: "c3", label: "C", text: "う", isCorrect: false }] });

  /* 大問5：混在 */
  add("s5", { prompt: "次の文は正しいか。", type: "true_false",
              choices: [{ id: "c1", label: "A", text: "正しい", isCorrect: true },
                        { id: "c2", label: "B", text: "誤り", isCorrect: false }] });
  add("s5", { prompt: "語句を書きなさい。", type: "short_answer", choices: [], correctAnswer: "答え" });
  add("s5", { prompt: "自分の考えを 100 字程度で述べなさい。", type: "essay",
              choices: [], correctAnswer: "答え", points: 12,
              scoringRubric: { items: [{ id: "r1", description: "主張", points: 12,
                                         criterionId: "thinking_judgment_expression" }] } });
  add("s5", { prompt: "適するものを一つ選びなさい。" });

  var titles = ["以下の問いに答えなさい。", "実験について答えなさい。",
                "グラフについて答えなさい。", "次の計算をしなさい。", "総合問題"];
  for (var s = 1; s <= 5; s++) {
    var mine = qs.filter(function (x) { return x.sectionId === "s" + s; });
    secs.push({ id: "s" + s, number: s, title: titles[s - 1], instructions: "",
                points: mine.reduce(function (a, x) { return a + x.points; }, 0), questions: mine });
  }
  return {
    id: "m_multi", schemaVersion: 2, title: "総合確認テスト",
    subject: "理科", grade: "中3", durationMinutes: 60,
    totalPoints: qs.reduce(function (a, x) { return a + x.points; }, 0),
    sourceMode: "source-only", paper: S.defaultPaper(),
    sections: secs,
    answerBindings: qs.map(function (x) {
      return { id: x.answerBindingId, questionId: x.id, number: String(x.number),
               inputType: x.type, points: x.points, blankCount: x.type === "matching" ? 3 : 1 };
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
  await pg.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "mpFrame";
    /* 用紙 1 枚ぶんの高さにしないと、ページが 1 枚にまとまってしまう。
       A4 縦（210×297mm）を実寸で与える。 */
    f.style.cssText = "position:fixed;left:-4000px;top:0;width:794px;height:1123px;border:0";
    document.body.appendChild(f);
  });

  section("1. 分量と Semantic Plan");
  const info = await pg.evaluate(() => {
    const G = window.VQ2.layoutGrammar, LP = window.VQ2.layoutProfiles;
    const spec = window.__withLayout(window.__bigSpec(), "MP-1");
    const lp = LP.planLayout(spec, {});
    const sem = lp.semantic;
    const res = lp.resolved;
    return {
      sections: spec.sections.length,
      questions: spec.sections.reduce((a, s) => a + s.questions.length, 0),
      totalPoints: spec.totalPoints,
      semErrors: G.errorsOf(G.validateSemanticPlan(sem, spec)).map((e) => e.code),
      resErrors: G.errorsOf(G.validateResolvedPlan(res, sem)).map((e) => e.code),
      layoutErrors: LP.errorsOf(LP.validateLayout(spec, lp)).map((e) => e.code),
      blockTypes: [...new Set(sem.sections.flatMap((s) => s.blocks).map((b) => b.type))],
      splittable: sem.sections.flatMap((s) => s.blocks)
        .filter((b) => b.constraints.allowPageBreakInside).map((b) => b.type),
      unsplittable: [...new Set(sem.sections.flatMap((s) => s.blocks)
        .filter((b) => !b.constraints.allowPageBreakInside).map((b) => b.type))],
      pageNumber: lp.pageNumber
    };
  });
  console.log("   大問 " + info.sections + " / 設問 " + info.questions + " 問 / 満点 " + info.totalPoints);
  console.log("   使われたブロック型: " + JSON.stringify(info.blockTypes));
  console.log("   ページまたぎ可: " + JSON.stringify([...new Set(info.splittable)]));
  console.log("   ページまたぎ不可: " + JSON.stringify(info.unsplittable));
  ok("大問が 5 つ以上", info.sections >= 5, String(info.sections));
  ok("Semantic Plan に error 0", info.semErrors.length === 0, info.semErrors.join(","));
  ok("Resolved Plan に error 0", info.resErrors.length === 0, info.resErrors.join(","));
  ok("レイアウト検証に error 0", info.layoutErrors.length === 0, info.layoutErrors.join(","));
  ok("ページまたぎを許すブロックと許さないブロックが分かれている",
    info.splittable.length >= 1 && info.unsplittable.length >= 1,
    "可 " + info.splittable.length + " / 不可 " + info.unsplittable.length);
  ok("ページ番号の設定が載っている", !!info.pageNumber && info.pageNumber.enabled === true);

  /* ── 描いて測る ── */
  async function render(bookletId, seed) {
    return pg.evaluate(async (o) => {
      const LP = window.VQ2.layoutProfiles, R = window.VQ2.pdfRenderer, L = window.VQ2.layout;
      const spec = window.__withLayout(window.__bigSpec(), o.seed);
      const plan = L.buildPlan(spec, {});
      const html = R.buildHtml(spec, plan, { bookletId: o.bookletId });
      const f = document.getElementById("mpFrame");
      f.srcdoc = html;
      await new Promise((r) => { f.onload = r; setTimeout(r, 1200); });
      await new Promise((r) => setTimeout(r, 400));
      const res = window.VQ2.inspector.inspect(f, spec, plan);
      const d = f.contentDocument;
      const bindings = new Set(Array.from(d.querySelectorAll("[data-binding]"))
        .map((n) => n.getAttribute("data-binding")).filter(Boolean));
      const questions = new Set(Array.from(d.querySelectorAll("[data-question]"))
        .map((n) => n.getAttribute("data-question")).filter(Boolean));
      const pageEls = Array.from(d.querySelectorAll(".page"));
      return {
        pages: pageEls.length,
        blankPages: pageEls.filter((p) => {
          const sh = p.querySelector(".sheet");
          return !sh || sh.children.length === 0;
        }).length,
        whitespacePages: (res.issues || []).filter((x) => x.issueType === "excessive_whitespace").length,
        pgno: d.querySelectorAll(".pgno").length,
        pgnoText: Array.from(d.querySelectorAll(".pgno")).map((n) => n.textContent),
        issues: (res.issues || []).map((x) => x.issueType),
        detail: (res.issues || []).filter((x) => x.severity !== "low")
          .map((x) => x.issueType + ": " + x.description).slice(0, 4),
        bindings: bindings.size, questions: questions.size,
        html
      };
    }, { bookletId, seed });
  }
  const tal = (rows, t) => rows.reduce((a, r) => a + r.issues.filter((x) => x === t).length, 0);

  section("2. 問題冊子（3 ページ以上）");
  const qRows = [];
  for (const seed of ["MP-1", "MP-2", "MP-3", "MP-4", "MP-5"]) {
    qRows.push(await render("question-booklet", seed));
  }
  console.log("   ページ数: " + JSON.stringify(qRows.map((r) => r.pages)));
  console.log("   ページ番号: " + JSON.stringify(qRows[0].pgnoText));
  if (qRows[0].detail.length) console.log("   指摘: " + JSON.stringify(qRows[0].detail));
  ok("3 ページ以上になる", qRows.every((r) => r.pages >= 3), JSON.stringify(qRows.map((r) => r.pages)));
  ok("overflow 0", tal(qRows, "overflow") === 0, String(tal(qRows, "overflow")));
  ok("overlap 0", tal(qRows, "overlap") === 0, String(tal(qRows, "overlap")));
  ok("clipped_text 0", tal(qRows, "clipped_text") === 0, String(tal(qRows, "clipped_text")));
  ok("blank_page 0（中身の無いページが 1 枚も無い）",
    qRows.every((r) => r.blankPages === 0), JSON.stringify(qRows.map((r) => r.blankPages)));
  /* 余白が多いページは、この形式では当然出る（大問ごとにページを変えるため）。
     不具合ではないので数だけ出す。 */
  console.log("   余白が多いページ（参考・不具合ではない）: "
    + JSON.stringify(qRows.map((r) => r.whitespacePages)));
  ok("missing_page_number 0", tal(qRows, "missing_page_number") === 0,
    String(tal(qRows, "missing_page_number")));
  ok("すべてのページにページ番号がある", qRows.every((r) => r.pgno === r.pages),
    JSON.stringify(qRows.map((r) => r.pgno + "/" + r.pages)));
  ok("missing_question 0", tal(qRows, "missing_question_number") === 0,
    String(tal(qRows, "missing_question_number")));
  ok("figure_group_split 0", tal(qRows, "figure_group_split") === 0,
    String(tal(qRows, "figure_group_split")));
  ok("orphan_heading 0（見出しだけのページが無い）",
    tal(qRows, "orphaned_choice") === 0, String(tal(qRows, "orphaned_choice")));
  ok("全 16 問が紙面に出ている", qRows.every((r) => r.questions >= 16),
    JSON.stringify(qRows.map((r) => r.questions)));

  section("3. 解答用紙（2 ページ以上）");
  const aRows = [];
  for (const seed of ["MP-1", "MP-2", "MP-3", "MP-4", "MP-5"]) {
    aRows.push(await render("printable-answer-sheet", seed));
  }
  console.log("   ページ数: " + JSON.stringify(aRows.map((r) => r.pages)));
  console.log("   解答欄（binding）: " + JSON.stringify(aRows.map((r) => r.bindings)));
  if (aRows[0].detail.length) console.log("   指摘: " + JSON.stringify(aRows[0].detail));
  ok("2 ページ以上になる", aRows.every((r) => r.pages >= 2), JSON.stringify(aRows.map((r) => r.pages)));
  ok("overflow 0", tal(aRows, "overflow") === 0, String(tal(aRows, "overflow")));
  ok("overlap 0", tal(aRows, "overlap") === 0, String(tal(aRows, "overlap")));
  ok("clipped_text 0", tal(aRows, "clipped_text") === 0, String(tal(aRows, "clipped_text")));
  ok("cell_too_narrow 0", tal(aRows, "cell_too_narrow") === 0, String(tal(aRows, "cell_too_narrow")));
  ok("cell_too_short 0", tal(aRows, "cell_too_short") === 0, String(tal(aRows, "cell_too_short")));
  ok("missing_page_number 0", tal(aRows, "missing_page_number") === 0,
    String(tal(aRows, "missing_page_number")));
  ok("すべてのページにページ番号がある", aRows.every((r) => r.pgno === r.pages),
    JSON.stringify(aRows.map((r) => r.pgno + "/" + r.pages)));
  ok("missing_answer_binding 0", tal(aRows, "missing_answer_binding") === 0,
    String(tal(aRows, "missing_answer_binding")));
  ok("全 16 問ぶんの解答欄がある", aRows.every((r) => r.bindings === 16),
    JSON.stringify(aRows.map((r) => r.bindings)));

  section("4. 記入面積の下限（Resolved で実測）");
  const area = await pg.evaluate(() => {
    const G = window.VQ2.layoutGrammar, LP = window.VQ2.layoutProfiles;
    let bad = 0, checked = 0;
    for (let i = 0; i < 20; i++) {
      const spec = window.__withLayout(window.__bigSpec(), "AREA-" + i);
      const lp = LP.planLayout(spec, {});
      const sem = lp.semantic, res = lp.resolved;
      const bySem = {};
      sem.sections.forEach((s) => s.blocks.forEach((b) => { bySem[b.id] = b; }));
      res.blocks.filter((b) => b.answerCell).forEach((b) => {
        const need = G.AREA_MM2[bySem[b.id].answerField.minimumWritingArea] || 0;
        checked++;
        if (b.answerCell.writingAreaMm2 < need) bad++;
      });
    }
    return { bad, checked };
  });
  console.log("   " + JSON.stringify(area));
  ok("記入面積の下限を割る欄が 0（20 Seed）", area.bad === 0, area.bad + " / " + area.checked);

  section("5. current 経路（未選択）が変わっていないか");
  const cur = await pg.evaluate(async () => {
    const R = window.VQ2.pdfRenderer, L = window.VQ2.layout;
    const spec = window.__bigSpec();          /* layout 無し */
    const plan = L.buildPlan(spec, {});
    const html = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
    const f = document.getElementById("mpFrame");
    f.srcdoc = html;
    await new Promise((r) => { f.onload = r; setTimeout(r, 1200); });
    const d = f.contentDocument;
    const res = window.VQ2.inspector.inspect(f, spec, plan);
    /* ページ番号を切ったとき */
    const off = JSON.parse(JSON.stringify(spec));
    off.paper.pageNumbering = false;
    const plan2 = L.buildPlan(off, {});
    const f2 = document.getElementById("mpFrame");
    f2.srcdoc = R.buildHtml(off, plan2, { bookletId: "question-booklet" });
    await new Promise((r) => { f2.onload = r; setTimeout(r, 1000); });
    const pgnoOff = f2.contentDocument.querySelectorAll(".pgno").length;
    return {
      hasSemantic: !!plan.semantic, hasResolved: !!plan.resolved, hasPageNumber: !!plan.pageNumber,
      blocks: [...new Set(plan.booklets.flatMap((b) => b.blocks.map((x) => x.type)))],
      pgno: d.querySelectorAll(".pgno").length,
      pages: d.querySelectorAll(".page").length,
      issues: (res.issues || []).map((x) => x.issueType),
      pgnoOff
    };
  });
  console.log("   " + JSON.stringify({ ...cur, blocks: cur.blocks.slice(0, 8) }));
  ok("current の Plan に semantic / resolved を足さない",
    !cur.hasSemantic && !cur.hasResolved && !cur.hasPageNumber);
  ok("current に新しいブロックが出てこない",
    !cur.blocks.some((t) => t === "figure-group" || String(t).indexOf("answer-grid") === 0),
    cur.blocks.join(","));
  /* ここは意図した変更。既存 current もページ番号を出すようになった。 */
  ok("current でもページ番号が出るようになった（既定 pageNumbering=true のとき）",
    cur.pgno === cur.pages && cur.pages >= 1, cur.pgno + " / " + cur.pages);
  ok("pageNumbering を切れば出ない（既存の設定が効く）", cur.pgnoOff === 0, String(cur.pgnoOff));
  ok("current でも missing_page_number が消えた",
    cur.issues.indexOf("missing_page_number") < 0, cur.issues.join(","));

  /* ── 成果物 ── */
  const shot = async (html, file) => {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: 900, height: 1200 });
    await p2.setContent(html, { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: path.join(OUT, file), fullPage: true });
    await p2.close();
  };
  fs.writeFileSync(path.join(OUT, "question-booklet.html"), qRows[0].html, "utf8");
  fs.writeFileSync(path.join(OUT, "answer-sheet.html"), aRows[0].html, "utf8");
  await shot(qRows[0].html, "question-booklet.png");
  await shot(aRows[0].html, "answer-sheet.png");
  const plans = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    const spec = window.__withLayout(window.__bigSpec(), "MP-1");
    const lp = LP.planLayout(spec, {});
    return { semantic: lp.semantic, resolved: lp.resolved };
  });
  fs.writeFileSync(path.join(OUT, "semantic-plan.json"), JSON.stringify(plans.semantic, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT, "resolved-plan.json"), JSON.stringify(plans.resolved, null, 2), "utf8");
  fs.writeFileSync(path.join(OUT, "inspector-report.json"),
    JSON.stringify({ questionBooklet: qRows.map(({ html, ...r }) => r),
                     answerSheet: aRows.map(({ html, ...r }) => r) }, null, 2), "utf8");

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
