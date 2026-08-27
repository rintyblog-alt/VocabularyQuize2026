/* ══════════════════════════════════════════════════════════════════════
   紙面レイアウトプロファイルと、制御されたランダム配置

   A. 互換性     … 何も選ばなければ、いまの Quick Mock と同じ
   B. プロファイル … 許可された配置だけ／形式に合った解答欄
   C. ランダム   … 同じ Seed で同じ結果／違う Seed で少なくとも 1 つ変わる
   D. 解答用紙   … 形式ごとの欄・数の一致・得点の一致
   E. 回帰       … 問題番号・配点・ID がレイアウトで変わらない

   実行: node client/v2/tests/layout-profiles.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, assertDeep, report, V2 }
  from "./harness.mjs";
/* L 群で「schema.js だけを読み込んだ場面」を本当に作るために使う。 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js",
  "pdf/templates.js", "pdf/layout-profiles.js", "pdf/layout-grammar.js", "pdf/layout.js",
  /* J 群で「実際に紙が変わるか」を、組み上がった HTML で確かめるので読む。
     renderer.js は担当外（読むだけ・書き換えない）。 */
  "pdf/renderer.js"
]);
const S = VQ2.schema, LP = VQ2.layoutProfiles, L = VQ2.layout, R = VQ2.pdfRenderer;

/* ── 試験の見本 ────────────────────────────────────────────────── */
let seq = 0;
function q(over) {
  seq++;
  return Object.assign({
    id: "q" + seq, schemaVersion: 2, sectionId: "s1", number: seq,
    type: "multiple_choice_single", prompt: "設問 " + seq + " の問題文です。",
    explanation: "解説", points: 10,
    choices: [
      { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
      { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
      { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
    ],
    correctAnswer: null, acceptedAnswers: [],
    difficulty: "normal", topic: "", tags: [], estimatedSeconds: 60,
    sourceReferences: [], requiresReview: false, validationIssues: [],
    answerBindingId: "b" + seq
  }, over || {});
}
function figure(over) {
  return Object.assign({ type: "figure", src: "data:image/png;base64,AA", caption: "図1" }, over || {});
}
function mock(over) {
  seq = 0;
  const qs = (over && over.questions) || [q(), q(), q()];
  const secs = (over && over.sections) || [{
    id: "s1", number: 1, title: "大問1", instructions: "",
    points: qs.reduce((a, x) => a + x.points, 0), questions: qs
  }];
  const all = secs.flatMap((s) => s.questions);
  return Object.assign({
    id: "m1", schemaVersion: 2, title: "テスト試験", subject: "理科", grade: "中3",
    durationMinutes: 50,
    totalPoints: all.reduce((a, x) => a + x.points, 0),
    sourceMode: "source-only",
    paper: S.defaultPaper(),
    sections: secs,
    answerBindings: all.map((x) => ({
      id: x.answerBindingId, questionId: x.id, number: String(x.number),
      inputType: x.type, points: x.points, blankCount: 1
    }))
  }, over && over.spec || {});
}
function withLayout(m, layout) {
  const c = JSON.parse(JSON.stringify(m));
  c.layout = Object.assign(LP.defaultLayoutSettings(), layout);
  return c;
}
const FIGURE_MODE = { layoutMode: "school-science-figure", answerSheetMode: "grid-dense" };

/* ══════════════════════════════════════════════════════════════════ */
group("A. 互換性（何も選ばなければ、いまのまま）");

test("何も選ばないと新しいレイアウト処理へ入らない", () => {
  const m = mock();
  assert(!m.layout, "既定で layout を持ってはいけない");
  assertEq(LP.isEnabled(LP.readLayoutSettings(m)), false);
  assertEq(LP.planLayout(m, {}), null, "計画を作ってしまっている");
});

test("何も選ばないときの LayoutPlan は、これまでと同じ形のまま", () => {
  const m = mock();
  const plan = L.buildPlan(m, {});
  assertEq(plan.layoutProfile, undefined, "プロファイル情報が混ざっている");
  assertEq(plan.paper.size, "A4");
  assertEq(plan.templateId, "standard-school-exam");
  const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
  assert(sheet, "解答用紙が無い");
  /* これまでの解答用紙は answer-area ブロックで作る */
  assert(sheet.blocks.some((b) => b.type === "answer-area"), "解答用紙の作り方が変わっている");
  assert(!sheet.blocks.some((b) => String(b.type).indexOf("answer-grid") === 0), "新形式が混ざっている");
});

test("古い保存データ（layout が無い）をそのまま開ける", () => {
  const old = mock();
  delete old.layout;
  const issues = S.validateMockSpec(old, []);
  assertEq(issues.filter((i) => i.severity === "error").length, 0, JSON.stringify(issues));
  assert(L.buildPlan(old, {}), "紙面を作れない");
});

test("layoutMode = current を明示しても、新 Planner を通らない", () => {
  const m = withLayout(mock(), { layoutMode: "current", answerSheetMode: "current" });
  assertEq(LP.isEnabled(LP.readLayoutSettings(m)), false);
  const plan = L.buildPlan(m, {});
  assertEq(plan.layoutProfile, undefined);
});

test("layout を持つ MockSpec も検証を通る", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "ABC123" }, FIGURE_MODE));
  const errs = S.validateMockSpec(m, []).filter((i) => i.severity === "error");
  assertEq(errs.length, 0, JSON.stringify(errs));
});

test("知らない値は既定へ落とす（壊れた保存データで落ちない）", () => {
  const m = mock();
  m.layout = { outputEngine: "ほげ", layoutMode: "ふが", answerSheetMode: 42, layoutSeed: 7 };
  const l = LP.readLayoutSettings(m);
  assertEq(l.outputEngine, "current");
  assertEq(l.layoutMode, "current");
  assertEq(l.answerSheetMode, "current");
  assertEq(l.layoutSeed, null);
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. プロファイル");

test("問題用紙プロファイルが定義されている", () => {
  const p = LP.getProfile("school-science-figure-classic");
  assert(p, "プロファイルが無い");
  assertEq(p.documentType, "question-paper");
  ["id", "name", "documentType", "compatibleEngines", "supportedSubjects", "paper", "margins",
   "typography", "header", "sectionStyle", "subQuestionStyle", "questionFlow", "choiceLayout",
   "figureRules", "answerCellRules", "scoreArea", "studentFields", "variationRules",
   "safetyConstraints", "version"].forEach((k) => {
    assert(p[k] !== undefined, "必要な項目がありません: " + k);
  });
});

test("解答用紙プロファイルが定義されている", () => {
  const p = LP.getProfile("school-answer-grid-dense");
  assert(p, "プロファイルが無い");
  assertEq(p.documentType, "answer-sheet");
  assert(p.answerCellRules.byType.multiple_choice_single, "選択問題の欄が無い");
  assert(p.scoreArea.total.show, "合計欄が無い");
  assertDeep(p.studentFields.map((f) => f.key), ["year", "class", "no", "name"]);
});

test("小問記号は（ア）（イ）（ウ）形式", () => {
  const p = LP.getProfile("school-science-figure-classic");
  assertDeep(p.subQuestionStyle.markers.slice(0, 3), ["（ア）", "（イ）", "（ウ）"]);
});

test("大問見出しは「問1」形式", () => {
  const m = withLayout(mock(), FIGURE_MODE);
  const plan = LP.planLayout(m, {});
  assertEq(plan.sections[0].marker, "問1");
});

test("図表のある設問には、許可された配置だけが使われる", () => {
  const qs = [q({ contentBlocks: [figure()] }), q(), q()];
  const m = withLayout(mock({ questions: qs }), FIGURE_MODE);
  const allowed = LP.getProfile("school-science-figure-classic").variationRules.figureLayout;
  for (let i = 0; i < 60; i++) {
    const plan = LP.planLayout(withLayout(m, Object.assign({ layoutSeed: "S" + i }, FIGURE_MODE)), {});
    const p0 = plan.sections[0].questions[0];
    assert(allowed.indexOf(p0.figureLayout) >= 0, "許可外の配置: " + p0.figureLayout);
    assertEq(plan.sections[0].questions[1].figureLayout, null, "図が無いのに配置が決まっている");
  }
});

test("図が 1 枚しか無いのに「2 枚並べ」は選ばれない", () => {
  const qs = [q({ contentBlocks: [figure()] })];
  for (let i = 0; i < 80; i++) {
    const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "D" + i }, FIGURE_MODE));
    const p0 = LP.planLayout(m, {}).sections[0].questions[0];
    assert(p0.figureLayout !== "dual-figure", "図 1 枚で 2 枚並べを選んだ");
  }
});

/* 実画像の（ウ）は「本文と選択肢が左、グラフが右」。図表は 1 点。
   2 点以上のときは横に並べる形になるので、ここは 1 点で見る。 */
test("図を右に置くとき、本文と図が重ならない幅になる", () => {
  const qs = [q({ contentBlocks: [figure()] })];
  const prof = LP.getProfile("school-science-figure-classic");
  let sawRight = false;
  for (let i = 0; i < 120; i++) {
    const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "R" + i }, FIGURE_MODE));
    const p0 = LP.planLayout(m, {}).sections[0].questions[0];
    if (p0.figureLayout !== "figure-right" && p0.figureLayout !== "text-left-graph-right") continue;
    sawRight = true;
    assert(p0.bodyWidthPct + p0.figureWidthPct + 4 <= 100.001,
      "重なる幅になっている: " + p0.bodyWidthPct + " + " + p0.figureWidthPct);
    assert(p0.figureWidthPct <= prof.safetyConstraints.maxFigureWidthPct, "図が広すぎる");
  }
  assert(sawRight, "右配置が一度も出なかった（試行が足りない）");
});

test("長い選択肢では 2 段組みを選ばない", () => {
  const long = q({ choices: [
    { id: "c1", label: "A", text: "これはとても長い選択肢の本文であって折り返しが必要になる", isCorrect: true },
    { id: "c2", label: "B", text: "これもとても長い選択肢の本文であって折り返しが必要になる", isCorrect: false }
  ]});
  for (let i = 0; i < 60; i++) {
    const m = withLayout(mock({ questions: [long] }), Object.assign({ layoutSeed: "C" + i }, FIGURE_MODE));
    const p0 = LP.planLayout(m, {}).sections[0].questions[0];
    assertEq(p0.choiceColumns, 1, "長い選択肢で 2 段になった");
  }
});

test("使えないエンジンを指定したら、理由を付けて現在の形式へ落とす", () => {
  ["typst", "tex"].forEach((e) => {
    const r = LP.resolveEngine(e);
    assertEq(r.engine, "current");
    assertEq(r.fellBack, true);
    assert(r.reason.indexOf("準備中") >= 0, r.reason);
  });
  const r2 = LP.resolveEngine("しらないエンジン");
  assertEq(r2.engine, "current");
  assertEq(r2.fellBack, true);
});

test("Typst / TeX を選んでも、作った計画のエンジンは current のまま", () => {
  const m = withLayout(mock(), Object.assign({ outputEngine: "typst" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  assertEq(plan.engine, "current");
  assertEq(plan.requestedEngine, "typst");
  assert(plan.notices.length >= 1, "理由を伝えていない");
});

test("準備中の紙面デザインを選んだら、新 Planner を通らない", () => {
  ["school-standard", "school-english-reading", "common-test", "vertical-japanese"].forEach((mode) => {
    const m = withLayout(mock(), { layoutMode: mode });
    assertEq(LP.isEnabled(LP.readLayoutSettings(m)), false, mode + " が有効になっている");
    assertEq(LP.planLayout(m, {}), null, mode);
  });
});

test("AI おまかせは、用意できている形式から選ぶ", () => {
  const id = LP.resolveLayoutProfileId("auto", null);
  assert(id && LP.getProfile(id), "おまかせで形式を決められない");
  assertEq(LP.getProfile(id).documentType, "question-paper");
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. 制御されたランダム");

test("同じ Seed なら、まったく同じ計画になる", () => {
  const qs = [q({ contentBlocks: [figure(), figure({ caption: "図2" })] }), q(), q()];
  const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "FIXED-1" }, FIGURE_MODE));
  const a = LP.planLayout(m, {});
  const b = LP.planLayout(m, {});
  assertEq(JSON.stringify(a), JSON.stringify(b), "同じ Seed で違う計画になった");
});

test("違う Seed なら、少なくとも 1 つの variant が変わる", () => {
  const qs = [q({ contentBlocks: [figure(), figure({ caption: "図2" })] }), q(), q(), q(), q()];
  const base = mock({ questions: qs });
  const sig = (seed) => {
    const p = LP.planLayout(withLayout(base, Object.assign({ layoutSeed: seed }, FIGURE_MODE)), {});
    return JSON.stringify([p.variants, p.sections[0].questions.map((x) => [x.figureLayout, x.choiceLayout])]);
  };
  let changed = 0;
  const first = sig("SEED-0");
  for (let i = 1; i <= 20; i++) if (sig("SEED-" + i) !== first) changed++;
  assert(changed >= 1, "20 個の Seed でひとつも変わらなかった");
});

test("100 種類の Seed で、Schema 違反・欠落・重複が 0 件", () => {
  const qs = [
    q({ contentBlocks: [figure()] }),
    q({ type: "true_false", choices: [
      { id: "c1", label: "A", text: "正しい", isCorrect: true },
      { id: "c2", label: "B", text: "誤り", isCorrect: false }] }),
    q({ type: "short_answer", choices: [], correctAnswer: "答え" }),
    q({ type: "long_answer", choices: [], correctAnswer: "答え",
        scoringRubric: { items: [{ id: "r1", description: "根拠", points: 10, criterionId: "knowledge_skill" }] } }),
    q({ contentBlocks: [figure(), figure({ caption: "図2" })] })
  ];
  const base = mock({ questions: qs });
  let bad = 0;
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const m = withLayout(base, Object.assign({ layoutSeed: "N" + i }, FIGURE_MODE));
    const plan = LP.planLayout(m, {});
    if (!plan) { bad++; continue; }
    if (LP.validatePlanSchema(plan).length) bad++;
    if (LP.errorsOf(LP.validateLayout(m, plan)).length) bad++;
    /* 設問の数・ID の重複 */
    const ids = plan.sections.flatMap((s) => s.questions.map((x) => x.questionId));
    if (ids.length !== qs.length) bad++;
    if (new Set(ids).size !== ids.length) bad++;
    seen.add(JSON.stringify(plan.variants));
  }
  assertEq(bad, 0, bad + " 件で問題が出た");
  assert(seen.size >= 2, "100 個の Seed で見た目が 1 通りしか出なかった");
});

test("レイアウトを作り直しても、問題文・正解・配点・ID・番号は変わらない", () => {
  const qs = [q({ contentBlocks: [figure()] }), q(), q()];
  const base = mock({ questions: qs });
  const snapshot = JSON.stringify(base.sections);
  for (let i = 0; i < 30; i++) {
    const m = withLayout(base, Object.assign({ layoutSeed: "X" + i }, FIGURE_MODE));
    LP.planLayout(m, {});
    L.buildPlan(m, {});
  }
  assertEq(JSON.stringify(base.sections), snapshot, "問題データが書き換わった");
});

test("Seed を指定しなければ、毎回あたらしい Seed になる", () => {
  const m = withLayout(mock(), FIGURE_MODE);
  const s = new Set();
  for (let i = 0; i < 20; i++) s.add(LP.planLayout(m, {}).seed);
  assert(s.size >= 18, "Seed がほとんど同じ: " + s.size + " 通り");
});

test("乱数は Seed だけで決まる（同じ Seed → 同じ並び）", () => {
  const a = LP.rng("HELLO"), b = LP.rng("HELLO"), c = LP.rng("WORLD");
  const av = [a(), a(), a()], bv = [b(), b(), b()], cv = [c(), c(), c()];
  assertDeep(av, bv);
  assert(JSON.stringify(av) !== JSON.stringify(cv), "違う Seed で同じ並びになった");
});

/* ══════════════════════════════════════════════════════════════════ */
group("D. 解答用紙");

function sheetOf(questions, seed) {
  const m = withLayout(mock({ questions }), Object.assign({ layoutSeed: seed || "AS-1" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  return { m, plan, sheet: plan.answerSheet };
}
function rowsOf(sheet) { return sheet.sections.flatMap((s) => s.rows); }

test("選択問題は小さい記号欄になる", () => {
  const { sheet } = sheetOf([q()]);
  assertEq(rowsOf(sheet)[0].cell, "mark");
  assert(rowsOf(sheet)[0].widthMm <= 20, "選択問題の欄が大きすぎる");
});

test("正誤問題は ○× 用の小さい欄になる", () => {
  const { sheet } = sheetOf([q({ type: "true_false", choices: [
    { id: "c1", label: "A", text: "正しい", isCorrect: true },
    { id: "c2", label: "B", text: "誤り", isCorrect: false }] })]);
  assertEq(rowsOf(sheet)[0].cell, "truefalse");
});

test("短答問題は中くらいの横長欄になる", () => {
  const { sheet } = sheetOf([q({ type: "short_answer", choices: [], correctAnswer: "答え" })]);
  const r = rowsOf(sheet)[0];
  assertEq(r.cell, "short");
  assert(r.widthMm > 40 && r.widthMm < 100, "短答の欄の幅がおかしい: " + r.widthMm);
});

test("記述問題は横長の複数行になる", () => {
  const { sheet } = sheetOf([q({ type: "long_answer", choices: [], correctAnswer: "答え" })]);
  const r = rowsOf(sheet)[0];
  assertEq(r.cell, "written");
  assert(r.rows >= 3, "記述の行数が足りない: " + r.rows);
});

test("論述問題は大きい複数行の欄になる", () => {
  const { sheet } = sheetOf([q({ type: "essay", choices: [], correctAnswer: "答え" })]);
  const r = rowsOf(sheet)[0];
  assertEq(r.cell, "essay");
  assert(r.rows >= 8, "論述の行数が足りない: " + r.rows);
});

test("対応問題は空所の数だけ小さい欄が並ぶ", () => {
  const m0 = mock({ questions: [q({ type: "matching", choices: [
    { id: "c1", label: "A", text: "あ", isCorrect: true },
    { id: "c2", label: "B", text: "い", isCorrect: false },
    { id: "c3", label: "C", text: "う", isCorrect: false }] })] });
  m0.answerBindings[0].blankCount = 3;
  const plan = LP.planLayout(withLayout(m0, Object.assign({ layoutSeed: "M1" }, FIGURE_MODE)), {});
  const r = rowsOf(plan.answerSheet)[0];
  assertEq(r.cell, "matching");
  assertEq(r.cells, 3);
});

test("形式が混ざっても、問題の順番どおりに欄ができる", () => {
  const qs = [
    q(), /* 選択 */
    q({ type: "short_answer", choices: [], correctAnswer: "答え" }),
    q({ type: "essay", choices: [], correctAnswer: "答え" }),
    q({ type: "true_false", choices: [
      { id: "c1", label: "A", text: "正しい", isCorrect: true },
      { id: "c2", label: "B", text: "誤り", isCorrect: false }] })
  ];
  const { sheet } = sheetOf(qs);
  const rows = rowsOf(sheet);
  assertDeep(rows.map((r) => r.cell), ["mark", "short", "essay", "truefalse"]);
  assertDeep(rows.map((r) => r.questionNumber), [1, 2, 3, 4]);
});

test("20 問なら解答欄も 20 問ぶんできる", () => {
  const qs = Array.from({ length: 20 }, () => q());
  const { m, plan, sheet } = sheetOf(qs);
  assertEq(sheet.cellCount, 20);
  assertEq(rowsOf(sheet).length, 20);
  assertEq(LP.errorsOf(LP.validateAnswerSheet(m, sheet)).length, 0);
});

/* 実画像の得点欄は「斜線 + 満点」（⁄42 など）。
   採点者欄の文字は入っていないので、既定では出さない（設定では持てる）。 */
test("大問別の得点欄と合計欄がある", () => {
  const { sheet } = sheetOf([q(), q()]);
  assertEq(sheet.sections[0].subtotal, true);
  assertEq(sheet.scoreArea.total, true);
  const prof = LP.getProfile("school-answer-grid-dense");
  assertEq(prof.scoreArea.denominator.show, true, "満点の欄が無い");
  assertEq(prof.scoreArea.denominator.slash, true, "斜線が無い");
  assertEq(prof.scoreArea.perSection.grader, false, "採点者欄は既定では出さない");
  assert(sheet.grid, "可変グリッドが作られていない");
  assertEq(sheet.grid.blocks[0].score.denominator, 20, "大問の満点が合わない");
  assertEq(sheet.grid.total.denominator, 20, "合計の満点が合わない");
});

test("年・組・番・氏名の欄がある", () => {
  const { sheet } = sheetOf([q()]);
  assertDeep(sheet.studentFields.map((f) => f.label), ["年", "組", "番", "氏名"]);
  assertEq(sheet.studentFieldsPosition, "bottom");
});

test("解答用紙の得点合計が、試験の得点合計と一致する", () => {
  const qs = [q({ points: 10 }), q({ points: 25 }), q({ points: 15 })];
  const { m, sheet } = sheetOf(qs);
  assertEq(sheet.totalPoints, 50);
  assertEq(LP.errorsOf(LP.validateAnswerSheet(m, sheet)).length, 0);
});

test("欄が足りない／余ると検証で止まる", () => {
  const { m, sheet } = sheetOf([q(), q(), q()]);
  const short = JSON.parse(JSON.stringify(sheet));
  short.sections[0].rows.pop();
  assert(LP.errorsOf(LP.validateAnswerSheet(m, short))
    .some((e) => e.code === "answerCellCount" || e.code === "missingAnswerCell"), "不足を見逃した");
  const extra = JSON.parse(JSON.stringify(sheet));
  extra.sections[0].rows.push(JSON.parse(JSON.stringify(extra.sections[0].rows[0])));
  assert(LP.errorsOf(LP.validateAnswerSheet(m, extra))
    .some((e) => e.code === "answerCellCount" || e.code === "duplicateAnswerCell"), "余りを見逃した");
});

test("解答欄の配点が書き換わっていたら止める", () => {
  const { m, sheet } = sheetOf([q({ points: 10 })]);
  const bad = JSON.parse(JSON.stringify(sheet));
  bad.sections[0].rows[0].points = 99;
  bad.totalPoints = 99;
  const errs = LP.errorsOf(LP.validateAnswerSheet(m, bad));
  assert(errs.some((e) => e.code === "pointsChanged"), JSON.stringify(errs));
});

/* ══════════════════════════════════════════════════════════════════ */
group("E. レイアウト検証");

test("正しい計画は error 0 件で通る", () => {
  const qs = [q({ contentBlocks: [figure()] }), q(), q()];
  const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "V1" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  const errs = LP.errorsOf(LP.validateLayout(m, plan));
  assertEq(errs.length, 0, JSON.stringify(errs));
});

test("問題番号が食い違ったら止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V2" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].number = 99;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "numberMismatch"));
});

test("設問が計画から落ちていたら止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V3" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions.pop();
  const errs = LP.errorsOf(LP.validateLayout(m, plan));
  assert(errs.some((e) => e.code === "questionCount" || e.code === "missingQuestion"), JSON.stringify(errs));
});

test("図表があるのに置き場所が無ければ止める", () => {
  const m = withLayout(mock({ questions: [q({ contentBlocks: [figure()] })] }),
                       Object.assign({ layoutSeed: "V4" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureLayout = null;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "missingFigure"));
});

test("許可されていない配置を使っていたら止める", () => {
  const m = withLayout(mock({ questions: [q({ contentBlocks: [figure()] })] }),
                       Object.assign({ layoutSeed: "V5" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureLayout = "figure-diagonal";
  const errs = LP.errorsOf(LP.validateLayout(m, plan));
  assert(errs.some((e) => e.code === "variantNotAllowed" || e.code === "planSchema"), JSON.stringify(errs));
});

test("本文と図が重なる幅なら止める", () => {
  const m = withLayout(mock({ questions: [q({ contentBlocks: [figure()] })] }),
                       Object.assign({ layoutSeed: "V6" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureLayout = "figure-right";
  plan.sections[0].questions[0].bodyWidthPct = 80;
  plan.sections[0].questions[0].figureWidthPct = 40;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "overlap"));
});

test("図が用紙からはみ出す幅なら止める", () => {
  const m = withLayout(mock({ questions: [q({ contentBlocks: [figure()] })] }),
                       Object.assign({ layoutSeed: "V7" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureLayout = "figure-centered";
  plan.sections[0].questions[0].figureWidthPct = 99;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "outOfPage"));
});

test("最小フォントを下回ったら止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V8" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.paper.minimumFontSize = 6;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "fontTooSmall"));
});

test("設問が 0 問の大問（見出しの孤立）を止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V9" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions = [];
  const errs = LP.errorsOf(LP.validateLayout(m, plan));
  assert(errs.some((e) => e.code === "orphanHeading"), JSON.stringify(errs.map((x) => x.code)));
});

test("白紙になる計画を止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V10" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections.forEach((s) => { s.questions = []; });
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "blankPage"));
});

test("計画の Schema に合わない値を止める", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "V11" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.engine = "typst";                       /* 出せないエンジンが混ざった状態 */
  assert(LP.validatePlanSchema(plan).length >= 1, "Schema 違反を見逃した");
});

/* ══════════════════════════════════════════════════════════════════ */
group("F. 描画への接続（未選択なら何も変わらない）");

test("プロファイルを選ぶと、紙面の土台がプロファイルの値になる", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "B1" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const prof = LP.getProfile("school-science-figure-classic");
  assert(plan.layoutProfile, "プロファイル情報が付いていない");
  assertEq(plan.layoutProfile.layoutProfileId, prof.id);
  assertEq(plan.layoutProfile.seed, "B1");
  assertDeep(plan.paper.margins, prof.margins);
  assertEq(plan.paper.minimumFontSize, prof.typography.minimumFontSize);
  assertEq(plan.lineHeight, prof.typography.lineHeight);
});

test("解答用紙が可変グリッドのブロックで作られる", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "B2" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
  const t = sheet.blocks.map((b) => b.type);
  assert(t.indexOf("answer-grid-head") >= 0, "見出しが無い");
  assert(t.indexOf("answer-grid-block") >= 0, "大問の枠が無い");
  assert(t.indexOf("answer-grid-legend") >= 0, "配点の凡例が無い");
  assert(t.indexOf("answer-grid-foot") >= 0, "氏名欄・合計が無い");
  const blk = sheet.blocks.find((b) => b.type === "answer-grid-block");
  assertEq(blk.sectionLabel.type, "section-label");
  assertEq(blk.sectionLabel.writingMode, "vertical", "大問セルが縦書きでない");
  assertEq(blk.sectionLabel.rowSpan, blk.rows.length, "大問セルが縦に結合していない");
  assertEq(blk.score.slash, true, "得点欄に斜線が無い");
  assertEq(blk.keepTogether, true);
});

test("解答欄が、設問と 1 対 1 で対応する（同じ行にまとまっていても）", () => {
  const qs = Array.from({ length: 7 }, () => q());
  const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "B3" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
  const ANSWER = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
  const cells = sheet.blocks.filter((b) => b.type === "answer-grid-block")
    .flatMap((b) => b.rows).flatMap((r) => r.cells)
    .filter((c) => ANSWER.indexOf(c.type) >= 0);
  assertEq(cells.length, 7);
  assertDeep(cells.map((c) => c.questionId).sort(), qs.map((x) => x.id).sort());
  assertDeep(cells.map((c) => c.answerBindingId).sort(), qs.map((x) => x.answerBindingId).sort());
});

test("図表を持つ設問は、本文と図表がひとつの枠に入る（改ページで離れない）", () => {
  const qs = [q({ contentBlocks: [figure()] })];
  const base = mock({ questions: qs });
  for (let i = 0; i < 20; i++) {
    const m = withLayout(base, Object.assign({ layoutSeed: "P" + i }, FIGURE_MODE));
    const plan = L.buildPlan(m, {});
    const g = plan.booklets[0].blocks.filter((b) => b.type === "figure-group")[0];
    assert(g, "図表の枠が作られなかった（Seed " + i + "）");
    assertEq(g.keepTogether, true);
    assertEq(g.figures.length, 1);
    /* 左右に並べる形のときだけ、本文 + 図 + すきま が 100% に収まること。
       上下に積む形では本文が 100%、図の帯が別の行なので合計は見ない。 */
    if (g.groupLayout === "side") {
      assert(g.bodyWidthPct + g.figureWidthPct + 4 <= 100.001,
        "左右に並べたときに幅が 100% を超えている: " + g.bodyWidthPct + " + " + g.figureWidthPct);
    } else {
      assertEq(g.bodyWidthPct, 100);
      assert(g.figureWidthPct <= 94, "図の帯が広すぎる: " + g.figureWidthPct);
    }
  }
});

test("大問見出しと小問記号が、ブロックへ渡っている", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "MK1" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const blocks = plan.booklets[0].blocks;
  const sec = blocks.filter((b) => b.type === "instructions")[0];
  assertEq(sec.marker, "問1", "大問の見出しがプロファイルの形になっていない");
  const qs = blocks.filter((b) => b.type === "question" || b.type === "figure-pair");
  assertDeep(qs.map((b) => b.marker), ["（ア）", "（イ）", "（ウ）"]);
});

test("正解・解説も、問題用紙と同じ記号で並ぶ（採点で照合できる）", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "MK2" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const key = plan.booklets.find((b) => b.kind === "answer-key");
  const qs = key.blocks.filter((b) => b.type === "question");
  assertDeep(qs.map((b) => b.marker), ["（ア）", "（イ）", "（ウ）"]);
  assertEq(key.blocks.filter((b) => b.type === "instructions")[0].marker, "問1");
});

test("未選択なら、正解・解説の記号もこれまでどおり", () => {
  const plan = L.buildPlan(mock(), {});
  const key = plan.booklets.find((b) => b.kind === "answer-key");
  assertEq(key.blocks.filter((b) => b.type === "question")[0].marker, null);
});

test("未選択なら、見出しはこれまでどおり（marker を持たない）", () => {
  const plan = L.buildPlan(mock(), {});
  const sec = plan.booklets[0].blocks.filter((b) => b.type === "instructions")[0];
  assertEq(sec.marker, null);
  const q0 = plan.booklets[0].blocks.filter((b) => b.type === "question")[0];
  assertEq(q0.marker, null);
});

test("未選択なら figure-pair も answer-grid も出てこない", () => {
  const qs = [q({ contentBlocks: [figure()] })];
  const plan = L.buildPlan(mock({ questions: qs }), {});
  const types = plan.booklets.flatMap((b) => b.blocks.map((x) => x.type));
  assert(types.indexOf("figure-group") < 0, "未選択なのに figure-group が出た");
  assert(!types.some((t) => String(t).indexOf("answer-grid") === 0), "未選択なのに罫線型が出た");
});

/* ══════════════════════════════════════════════════════════════════
   G. 実画像に合わせた校正（1 枚目：問題用紙）
   ══════════════════════════════════════════════════════════════════ */
group("G. 問題用紙の校正（実画像 1 枚目）");

test("選択肢の記号が「1. 2. 3. 4.」（丸数字ではない）", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "G1" }, FIGURE_MODE));
  const plan = L.buildPlan(m, {});
  const ch = plan.booklets[0].blocks.filter((b) => b.type === "choices")[0];
  assertDeep(ch.choices.map((c) => c.label), ["1.", "2.", "3.", "4."]);
  assertEq(LP.getProfile("school-science-figure-classic").choiceLayout.marker, "number-dot");
});

test("未選択なら、選択肢はこれまでどおり丸数字", () => {
  const plan = L.buildPlan(mock(), {});
  const ch = plan.booklets[0].blocks.filter((b) => b.type === "choices")[0];
  assertDeep(ch.choices.map((c) => c.label), ["①", "②", "③", "④"]);
});

test("試験名は左寄せ 1 行・罫線なし・メタ行なし・氏名欄なし", () => {
  const h = LP.getProfile("school-science-figure-classic").header;
  assertEq(h.align, "left");
  assertEq(h.rule, false);
  assertEq(h.showMeta, false);
  assertEq(h.showNameBox, false);
});

test("図・図・表の 3 点は 1 つのまとまりとして横並びになる", () => {
  const qs = [q({ contentBlocks: [
    figure({ caption: "天気図記号" }),
    figure({ caption: "乾湿計" }),
    { type: "table", caption: "湿度表の一部", rows: [["乾球", "0", "1"], ["18", "100", "90"]] }
  ]})];
  const base = mock({ questions: qs });
  let sawRow = false;
  for (let i = 0; i < 40; i++) {
    const m = withLayout(base, Object.assign({ layoutSeed: "G" + i }, FIGURE_MODE));
    const p0 = LP.planLayout(m, {}).sections[0].questions[0];
    assertEq(p0.figureGroup.items.length, 3, "3 点がひとまとまりになっていない");
    assertEq(p0.figureGroup.keepTogether, true);
    if (p0.figureGroup.layout === "horizontal-centered") sawRow = true;
    /* 3 点なので「1 点だけ」の置き方は選ばれない */
    assert(p0.figureLayout !== "figure-right" && p0.figureLayout !== "text-left-graph-right",
      "3 点なのに 1 点用の置き方が選ばれた: " + p0.figureLayout);
  }
  assert(sawRow, "横並びが一度も出なかった");
});

test("表を含む 3 点なら figure-table-row を選べる", () => {
  const qs = [q({ contentBlocks: [
    figure(), figure({ caption: "図2" }),
    { type: "table", rows: [["a", "b"]] }
  ]})];
  let saw = false;
  for (let i = 0; i < 60; i++) {
    const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "T" + i }, FIGURE_MODE));
    if (LP.planLayout(m, {}).sections[0].questions[0].figureLayout === "figure-table-row") saw = true;
  }
  assert(saw, "figure-table-row が一度も選ばれなかった");
});

test("表が無ければ figure-table-row は選ばれない", () => {
  const qs = [q({ contentBlocks: [figure(), figure({ caption: "図2" })] })];
  for (let i = 0; i < 60; i++) {
    const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "U" + i }, FIGURE_MODE));
    assert(LP.planLayout(m, {}).sections[0].questions[0].figureLayout !== "figure-table-row",
      "表が無いのに表用の並べ方を選んだ");
  }
});

test("本文左・グラフ右のときは、選択肢も本文の側へ入る", () => {
  const qs = [q({ contentBlocks: [figure({ caption: "グラフ" })] })];
  let saw = false;
  for (let i = 0; i < 80 && !saw; i++) {
    const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "W" + i }, FIGURE_MODE));
    const lp = LP.planLayout(m, {});
    if (lp.sections[0].questions[0].figureLayout !== "text-left-graph-right") continue;
    saw = true;
    assertEq(lp.sections[0].questions[0].choicesInBody, true);
    const plan = L.buildPlan(m, {});
    const g = plan.booklets[0].blocks.filter((b) => b.type === "figure-group")[0];
    assert(g.choices && g.choices.length === 4, "選択肢が枠の中に入っていない");
    assertEq(g.groupLayout, "side");
    /* 枠の外に選択肢が二重に出ていないこと */
    assertEq(plan.booklets[0].blocks.filter((b) => b.type === "choices").length, 0);
  }
  assert(saw, "本文左・グラフ右が一度も出なかった");
});

test("横に並べると細くなりすぎるときは、横並びを選ばない", () => {
  const many = q({ contentBlocks: [figure(), figure(), figure(), figure()] });
  for (let i = 0; i < 60; i++) {
    const m = withLayout(mock({ questions: [many] }), Object.assign({ layoutSeed: "N" + i }, FIGURE_MODE));
    const p0 = LP.planLayout(m, {}).sections[0].questions[0];
    /* 4 点は横並びの上限（3）を超えるので、上下に積む形になる */
    assertEq(p0.figureGroup.layout, "vertical-centered", p0.figureLayout);
  }
});

test("図表がバラバラになっていたら検証で止める", () => {
  const qs = [q({ contentBlocks: [figure(), figure({ caption: "図2" })] })];
  const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "G9" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureGroup.items.pop();
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "figureGroupSplit"));
});

test("図表のまとまりが分断される設定なら止める", () => {
  const qs = [q({ contentBlocks: [figure()] })];
  const m = withLayout(mock({ questions: qs }), Object.assign({ layoutSeed: "G10" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  plan.sections[0].questions[0].figureGroup.keepTogether = false;
  assert(LP.errorsOf(LP.validateLayout(m, plan)).some((e) => e.code === "figureGroupSplit"));
});

/* ══════════════════════════════════════════════════════════════════
   H. 解答用紙の可変グリッド（実画像 2 枚目）
   ══════════════════════════════════════════════════════════════════ */
group("H. 解答用紙の可変グリッド（実画像 2 枚目）");

function gridOf(questions, seed) {
  const m = withLayout(mock({ questions }), Object.assign({ layoutSeed: seed || "H1" }, FIGURE_MODE));
  const plan = LP.planLayout(m, {});
  return { m, plan, grid: plan.answerSheet.grid };
}
const ANSWER_CELLS = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
function cellsOf(grid) {
  return (grid.blocks || []).flatMap((b) => b.rows).flatMap((r) => r.cells)
    .filter((c) => ANSWER_CELLS.indexOf(c.type) >= 0);
}

test("大問セルが縦に結合され、縦書きになる", () => {
  const { grid } = gridOf([q(), q(), q()]);
  const blk = grid.blocks[0];
  assertEq(blk.sectionLabel.type, "section-label");
  assertEq(blk.sectionLabel.writingMode, "vertical");
  assertEq(blk.sectionLabel.rowSpan, blk.rows.length);
  assertEq(blk.sectionLabel.text, "問題1");
});

test("同じ行に複数の小問が入る（1 問 1 行に固定されない）", () => {
  const qs = Array.from({ length: 9 }, () => q());   /* すべて選択＝小さい欄 */
  let sawMulti = false;
  for (let i = 0; i < 30 && !sawMulti; i++) {
    const { grid } = gridOf(qs, "M" + i);
    grid.blocks[0].rows.forEach((r) => {
      const n = r.cells.filter((c) => ANSWER_CELLS.indexOf(c.type) >= 0).length;
      if (n >= 2) sawMulti = true;
    });
  }
  assert(sawMulti, "同じ行にまとまることが一度も無かった");
});

test("横長・複数行の欄は 1 行を専有する（書く面積を削らない）", () => {
  const qs = [q(), q({ type: "long_answer", choices: [], correctAnswer: "答え" }), q()];
  for (let i = 0; i < 20; i++) {
    const { grid } = gridOf(qs, "L" + i);
    grid.blocks[0].rows.forEach((r) => {
      const kinds = r.cells.filter((c) => ANSWER_CELLS.indexOf(c.type) >= 0).map((c) => c.type);
      if (kinds.indexOf("lined-answer") >= 0) assertEq(kinds.length, 1, "記述欄が他と同じ行に入った");
    });
  }
});

test("すべての行で列数がそろう（罫線が崩れない）", () => {
  const qs = [q(), q({ type: "short_answer", choices: [], correctAnswer: "x" }),
              q({ type: "essay", choices: [], correctAnswer: "x" }), q(), q()];
  for (let i = 0; i < 40; i++) {
    const { m, grid } = gridOf(qs, "C" + i);
    grid.blocks.forEach((b) => b.rows.forEach((r) => {
      const span = r.cells.reduce((a, c) => a + (c.colSpan || 1), 0);
      assertEq(span, b.columns, "列数がそろっていない（Seed C" + i + "）");
    }));
    assertEq(LP.errorsOf(LP.validateAnswerGrid(m, grid, LP.getProfile("school-answer-grid-dense"))).length, 0);
  }
});

test("配点で罫線の太さが変わる（1点配当 / 2点配当）", () => {
  const { grid } = gridOf([q({ points: 1 }), q({ points: 2 })]);
  const cells = cellsOf(grid);
  assert(cells[0].borderWidth < cells[1].borderWidth,
    "配点で太さが変わっていない: " + cells[0].borderWidth + " / " + cells[1].borderWidth);
  assert(grid.pointLegend, "配点の凡例が無い");
  assertDeep(grid.pointLegend.labels, ["1点配当", "2点配当"]);
});

test("右端の得点欄は斜線 + 満点", () => {
  const { grid } = gridOf([q({ points: 10 }), q({ points: 30 })]);
  assertEq(grid.blocks[0].score.slash, true);
  assertEq(grid.blocks[0].score.denominator, 40);
  assertEq(grid.total.denominator, 40);
  assertEq(grid.total.slash, true);
});

test("年・組・番・氏名の欄がある（下部）", () => {
  const { grid } = gridOf([q()]);
  assertDeep(grid.studentFields.map((f) => f.label), ["年", "組", "番", "氏名"]);
  grid.studentFields.forEach((f) => assertEq(f.type, "student-field"));
});

test("使えるセルの種類だけが出てくる", () => {
  const allowed = LP.getProfile("school-answer-grid-dense").grid.cellTypes;
  const qs = [q(), q({ type: "short_answer", choices: [], correctAnswer: "x" }),
              q({ type: "essay", choices: [], correctAnswer: "x" }),
              q({ type: "matching", choices: [
                { id: "c1", label: "A", text: "あ", isCorrect: true },
                { id: "c2", label: "B", text: "い", isCorrect: false }] })];
  for (let i = 0; i < 30; i++) {
    const { grid } = gridOf(qs, "K" + i);
    grid.blocks.flatMap((b) => b.rows).flatMap((r) => r.cells).forEach((c) => {
      assert(allowed.indexOf(c.type) >= 0, "使えないセル: " + c.type);
    });
  }
});

/* ── 解答欄の形の決め方（優先順位）───────────────────────────── */
group("H2. 解答欄の形の決め方");

const AS_PROFILE = () => LP.getProfile("school-answer-grid-dense");

test("1) 利用者の指定（answerLayoutHint）がいちばん強い", () => {
  const d = LP.decideCell(
    { type: "multiple_choice_single", prompt: "問", answerLayoutHint: { kind: "box-sequence", count: 8 } },
    null, AS_PROFILE());
  assertEq(d.kind, "box-sequence");
  assertEq(d.count, 8);
  assertEq(d.source, "hint");
});

test("知らない種類の指定は受け取らない（形式から決め直す）", () => {
  const d = LP.decideCell(
    { type: "short_answer", prompt: "問", answerLayoutHint: { kind: "自由記述らんど" } },
    null, AS_PROFILE());
  assertEq(d.kind, "wide-answer");
  assertEq(d.source, "type");
});

test("2) 形式から決まる：選択 → 小さい記号欄", () => {
  assertEq(LP.decideCell({ type: "multiple_choice_single", prompt: "問" }, null, AS_PROFILE()).kind, "small-box");
  assertEq(LP.decideCell({ type: "true_false", prompt: "問" }, null, AS_PROFILE()).kind, "small-box");
});

test("2) 形式から決まる：単語 1 語 → 横長の短い欄", () => {
  assertEq(LP.decideCell({ type: "short_answer", prompt: "答えなさい" }, null, AS_PROFILE()).kind, "wide-answer");
});

test("3) 字数の指定を拾う：20 字で説明 → 複数行の記述欄", () => {
  const d = LP.decideCell({ type: "short_answer", prompt: "理由を 20 字程度で説明しなさい。" }, null, AS_PROFILE());
  assertEq(d.kind, "lined-answer");
  assertEq(d.chars, 20);
});

test("3) 全角の字数指定も読む", () => {
  const d = LP.decideCell({ type: "short_answer", prompt: "２５字以内で書きなさい。" }, null, AS_PROFILE());
  assertEq(d.kind, "lined-answer");
  assertEq(d.chars, 25);
});

test("短い字数なら記述欄へ広げない", () => {
  const d = LP.decideCell({ type: "long_answer", prompt: "8 字で答えなさい。" }, null, AS_PROFILE());
  assertEq(d.kind, "wide-answer");
});

test("複数の空所は、その数だけ欄を作る", () => {
  const d = LP.decideCell({ type: "matching", prompt: "対応させなさい", choices: [1, 2, 3] },
                          { blankCount: 3 }, AS_PROFILE());
  assertEq(d.kind, "small-box");
  assertEq(d.count, 3);
});

test("4) 迷ったら wide-answer（書ける面積を確保する側へ倒す）", () => {
  assertEq(LP.decideCell({ type: "知らない形式", prompt: "問" }, null, AS_PROFILE()).kind, "wide-answer");
});

test("answerLayoutHint は MockSpec の検証を通る", () => {
  const m = mock({ questions: [q({ answerLayoutHint: { kind: "box-sequence", count: 8 } })] });
  assertEq(S.validateMockSpec(m, []).filter((i) => i.severity === "error").length, 0);
});

test("知らない kind の answerLayoutHint は検証で弾く", () => {
  const m = mock({ questions: [q({ answerLayoutHint: { kind: "なんでもあり" } })] });
  const codes = S.validateMockSpec(m, []).filter((i) => i.severity === "error").map((i) => i.code);
  assert(codes.indexOf("enum") >= 0, codes.join(","));
});

/* ══════════════════════════════════════════════════════════════════
   I. Seed で変えてよいもの／変えてはいけないもの
   ══════════════════════════════════════════════════════════════════ */
group("I. Seed による変化（解答用紙）");

const GRID_QS = () => [
  q(), q(), q(),
  q({ type: "short_answer", choices: [], correctAnswer: "x" }),
  q({ type: "long_answer", choices: [], correctAnswer: "x" }),
  q({ type: "essay", choices: [], correctAnswer: "x" }),
  q()
];

test("同じ Seed なら、まったく同じグリッドになる", () => {
  const a = gridOf(GRID_QS(), "SAME-G").grid;
  const b = gridOf(GRID_QS(), "SAME-G").grid;
  assertEq(JSON.stringify(a), JSON.stringify(b));
});

test("違う Seed で、まとめ方・幅・すきま・行数のどれかが変わる", () => {
  const sigs = new Set();
  for (let i = 0; i < 20; i++) {
    const { grid } = gridOf(GRID_QS(), "GV" + i);
    sigs.add(JSON.stringify([
      grid.blocks[0].rows.map((r) => r.cells.length),
      grid.blocks[0].gapMm,
      cellsOf(grid).map((c) => [c.widthMm, c.rows])
    ]));
  }
  assert(sigs.size >= 2, "20 個の Seed で 1 通りしか出なかった");
});

test("Seed を変えても、番号・欄の数・対応・配点・満点は変わらない", () => {
  const qs = GRID_QS();
  const base = gridOf(qs, "FIX0").grid;
  const sig = (g) => JSON.stringify(cellsOf(g).map((c) => [c.questionId, c.answerBindingId, c.points])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
  const baseSig = sig(base);
  for (let i = 1; i < 30; i++) {
    const { m, grid } = gridOf(qs, "FIX" + i);
    assertEq(sig(grid), baseSig, "Seed で対応が変わった（FIX" + i + "）");
    assertEq(cellsOf(grid).length, qs.length);
    assertEq(grid.total.denominator, base.total.denominator);
    assertEq(LP.errorsOf(LP.validateAnswerGrid(m, grid, AS_PROFILE())).length, 0);
  }
});

test("Seed をどう振っても、記入できる面積の下限を割らない", () => {
  const qs = GRID_QS();
  const need = AS_PROFILE().safetyConstraints.minWriteAreaMm2;
  for (let i = 0; i < 40; i++) {
    const { grid } = gridOf(qs, "A" + i);
    cellsOf(grid).forEach((c) => {
      if (!need[c.type]) return;
      const w = c.widthMm != null ? c.widthMm : 150;
      assert(w * (c.heightMm || 0) * (c.rows || 1) >= need[c.type],
        "記入面積が足りない: " + c.type + " Seed A" + i);
    });
  }
});

test("記述欄の行数は増える方向にだけ動く（減らさない）", () => {
  const qs = [q({ type: "long_answer", choices: [], correctAnswer: "x" })];
  const min = AS_PROFILE().answerShapes["lined-answer"].rows;
  for (let i = 0; i < 30; i++) {
    const { grid } = gridOf(qs, "RW" + i);
    assert(cellsOf(grid)[0].rows >= min, "記述の行数が下限を割った");
  }
});

test("100 種類の Seed で、グリッドの不整合が 0 件", () => {
  const qs = GRID_QS();
  let bad = 0;
  for (let i = 0; i < 100; i++) {
    const { m, plan, grid } = gridOf(qs, "G100-" + i);
    if (LP.validatePlanSchema(plan).length) bad++;
    if (LP.errorsOf(LP.validateLayout(m, plan)).length) bad++;
    if (LP.errorsOf(LP.validateAnswerGrid(m, grid, AS_PROFILE())).length) bad++;
  }
  assertEq(bad, 0, bad + " 件で問題が出た");
});

/* ══════════════════════════════════════════════════════════════════
   F. 文書形式（Document Family）が保存と紙面に届くか

   実測（2026-08-05）で見つかった取りこぼしの回帰テスト。
     ・画面で文書形式だけを変えても layout が丸ごと null になっていた
     ・仮に書けても readLayoutSettings の返り値に無いので読み戻しで消えていた
     ・生成後にレイアウトを変えても spec.layout が古いままだった
   ══════════════════════════════════════════════════════════════════ */
group("F. 文書形式が保存と紙面に届く");

const G = VQ2.layoutGrammar;

/* 画面（Quick Mock 設定欄）の既定値。quick-mock.js の defaultSettings と同じ。 */
function uiDefaults(over) {
  return Object.assign({
    outputEngine: "current", layoutMode: "current", answerSheetMode: "current",
    documentFamily: "auto", subjectLayout: "auto", layoutSeed: ""
  }, over || {});
}

test("何も選んでいなければ layout を作らない（古い保存データと同じ形）", () => {
  assertEq(LP.uiLayoutTouched(uiDefaults()), false);
  assertEq(LP.layoutFromUiSettings(uiDefaults()), null, "既定なのに layout を作っている");
});

test("文書形式だけを選んでも layout ができる（3 つが current でも）", () => {
  const lay = LP.layoutFromUiSettings(uiDefaults({ documentFamily: "mock-exam" }));
  assert(lay, "文書形式を選んだのに layout が null");
  assertEq(lay.documentFamily, "mock-exam");
  assertEq(lay.outputEngine, "current");
  assertEq(lay.layoutMode, "current");
  assertEq(lay.answerSheetMode, "current");
});

test("教科レイアウトだけを選んでも layout ができる", () => {
  const lay = LP.layoutFromUiSettings(uiDefaults({ subjectLayout: "mathematics" }));
  assert(lay, "教科レイアウトを選んだのに layout が null");
  assertEq(lay.subjectLayout, "mathematics");
  assertEq(lay.documentFamily, null, "選んでいない文書形式が入っている");
});

test("8 つの文書形式すべてが layout に載る", () => {
  G.DOCUMENT_FAMILY_IDS.forEach((id) => {
    const lay = LP.layoutFromUiSettings(uiDefaults({ documentFamily: id }));
    assert(lay, id + " で layout が null");
    assertEq(lay.documentFamily, id, id + " が載っていない");
  });
  assertEq(G.DOCUMENT_FAMILY_IDS.length, 8, "文書形式の数が変わった");
});

test("保存して読み戻しても文書形式・教科レイアウトが消えない", () => {
  const m = mock();
  m.layout = LP.layoutFromUiSettings(uiDefaults({ documentFamily: "workbook", subjectLayout: "english" }));
  /* 保存と読み込みを模す（JSON を通す） */
  const reopened = JSON.parse(JSON.stringify(m));
  const l = LP.readLayoutSettings(reopened);
  assertEq(l.documentFamily, "workbook", "読み戻しで文書形式が消えた");
  assertEq(l.subjectLayout, "english", "読み戻しで教科レイアウトが消えた");
});

test("知らない文書形式・教科レイアウトは指定なしへ落とす（壊れた保存データで落ちない）", () => {
  const m = mock();
  m.layout = { layoutMode: "current", documentFamily: "ほげ", subjectLayout: 42 };
  const l = LP.readLayoutSettings(m);
  assertEq(l.documentFamily, null);
  assertEq(l.subjectLayout, null);
});

test("文書形式を載せた MockSpec も検証を通る", () => {
  const m = mock();
  m.layout = LP.layoutFromUiSettings(uiDefaults({ documentFamily: "certification-test",
                                                  subjectLayout: "social-studies" }));
  const errs = S.validateMockSpec(m, []).filter((i) => i.severity === "error");
  assertEq(errs.length, 0, JSON.stringify(errs));
});

test("知らない文書形式は Schema が弾く（黙って通さない）", () => {
  const m = mock();
  m.layout = Object.assign(LP.defaultLayoutSettings(), { documentFamily: "ほげ形式" });
  const errs = S.validateMockSpec(m, []);
  assert(errs.some((i) => i.path === "layout.documentFamily" && i.code === "enum"),
         "知らない文書形式が通ってしまった: " + JSON.stringify(errs));
});

test("Schema の控えの一覧は layout-grammar と一致している", () => {
  assertDeep(S.DOCUMENT_FAMILY_IDS_FALLBACK, G.DOCUMENT_FAMILY_IDS, "文書形式の控えがずれている");
  assertDeep(S.SUBJECT_LAYOUT_IDS_FALLBACK, G.SUBJECT_IDS, "教科レイアウトの控えがずれている");
  assertDeep(S.ANSWER_FAMILY_IDS_FALLBACK, G.ANSWER_FAMILY_IDS, "解答用紙ファミリーの控えがずれている");
});

test("生成後にレイアウトを変えても、問題は 1 つも作り直されない", () => {
  const m = mock();
  const before = JSON.stringify({ sections: m.sections, answerBindings: m.answerBindings,
                                  totalPoints: m.totalPoints, id: m.id, title: m.title });
  const changed = LP.applyLayoutToSpec(m, uiDefaults({ documentFamily: "quiz-sheet" }));
  assertEq(changed, true, "変更を検出できていない");
  assertEq(m.layout.documentFamily, "quiz-sheet", "spec.layout へ届いていない");
  const after = JSON.stringify({ sections: m.sections, answerBindings: m.answerBindings,
                                 totalPoints: m.totalPoints, id: m.id, title: m.title });
  assertEq(after, before, "問題・配点・ID・番号が変わっている");
});

test("同じ選択をもう一度入れても「変わった」と言わない（無駄に組み直さない）", () => {
  const m = mock();
  const ui = uiDefaults({ documentFamily: "workbook" });
  assertEq(LP.applyLayoutToSpec(m, ui), true);
  assertEq(LP.applyLayoutToSpec(m, ui), false, "同じ内容で組み直そうとしている");
});

test("既定へ戻すと layout を消す（古い保存データと同じ形へ戻る）", () => {
  const m = mock();
  LP.applyLayoutToSpec(m, uiDefaults({ documentFamily: "workbook" }));
  assert(m.layout, "前提が崩れている");
  const changed = LP.applyLayoutToSpec(m, uiDefaults());
  assertEq(changed, true);
  assertEq(m.layout, undefined, "既定へ戻したのに layout が残っている");
  const errs = S.validateMockSpec(m, []).filter((i) => i.severity === "error");
  assertEq(errs.length, 0, JSON.stringify(errs));
});

test("文書形式を選んでも、紙面デザインが current なら既存の紙面経路のまま", () => {
  /* いま HTML の Renderer は Semantic Plan を読まない（読むのは Typst / TeX）。
     文書形式だけで紙面が別物になるふりをしない、という確認。 */
  const m = mock();
  LP.applyLayoutToSpec(m, uiDefaults({ documentFamily: "mock-exam" }));
  assertEq(LP.isEnabled(LP.readLayoutSettings(m)), false);
  const plan = L.buildPlan(m, {});
  assertEq(plan.layoutProfile, undefined, "プロファイル情報が混ざっている");
});

test("文書形式は Semantic Plan へそのまま渡る", () => {
  const m = mock();
  LP.applyLayoutToSpec(m, uiDefaults({ documentFamily: "common-test-style", subjectLayout: "japanese" }));
  const set = LP.readLayoutSettings(m);
  const sem = G.buildSemanticPlan(m, { documentFamily: set.documentFamily, subject: set.subjectLayout });
  assertEq(sem.documentFamily, "common-test-style");
  assertEq(sem.subject, "japanese");
});

/* ══════════════════════════════════════════════════════════════════
   J. ready:true は「実際に紙が変わる」ものだけ（組み上がった HTML で確かめる）

   これまでの検査は「一覧の ready」と「プロファイルが自分で書いた pending」を
   突き合わせているだけだった。どちらも人が手で書いた値なので、
   Renderer の実力は 1 ミリも検査していない。

   ここでは pdf/renderer.js まで通して HTML を組み、
   rendererSupport.honored に書いた項目が **本当に紙へ出ているか** を見る。
     ・honored の項目は、すべて検査を持たなければならない（言いっぱなしを作らない）
     ・honored の項目が 1 つでも出せないなら、その紙面は ready:true にできない
     ・pending と書いた項目は、実際に出せていないことを確かめる
       （出せるようになったのに pending のままにしていないか）
   ══════════════════════════════════════════════════════════════════ */
group("J. ready:true は実際に紙が変わるものだけ（組み上がった HTML で確かめる）");

const PAPER_MM = { A4: [210, 297], B5: [182, 257], B4: [257, 364], A3: [297, 420] };
const PROBE_SEEDS = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7", "Z8", "Z9", "Z10", "Z11", "Z12"];

/* ── 見本（選択肢は 1 文字。段数の制限に引っかからないようにする）── */
let pseq = 0;
function pq(over) {
  pseq++;
  return Object.assign({
    id: "pq" + pseq, schemaVersion: 2, sectionId: "ps1", number: pseq,
    type: "multiple_choice_single", prompt: "設問 " + pseq + " の問題文です。",
    explanation: "解説", points: pseq % 2 ? 1 : 3,          /* 配点は 1 点と 3 点を混ぜる */
    choices: ["ア", "イ", "ウ", "エ"].map((t, i) => ({
      id: "pc" + pseq + i, label: t, text: t, explanation: "", isCorrect: i === 0
    })),
    correctAnswer: null, acceptedAnswers: [], difficulty: "normal", topic: "", tags: [],
    estimatedSeconds: 60, sourceReferences: [], requiresReview: false, validationIssues: [],
    answerBindingId: "pb" + pseq
  }, over || {});
}
function pmock(sections) {
  const all = sections.flatMap((s) => s.questions);
  return {
    id: "pm1", schemaVersion: 2, title: "見本試験", subject: "理科", grade: "中3",
    durationMinutes: 50, totalPoints: all.reduce((a, x) => a + x.points, 0),
    sourceMode: "source-only", paper: S.defaultPaper(), sections,
    answerBindings: all.map((x) => ({
      id: x.answerBindingId, questionId: x.id, number: String(x.number),
      inputType: x.type, points: x.points,
      /* 空所の数。対応・並び替えだけ複数にする（記号 1 つの設問を
         「空所 3 つ」にすると、まとめ書きの対象から外れてしまう）。 */
      blankCount: (x.type === "matching" || x.type === "ordering") ? 3 : 1
    }))
  };
}
function psec(n, questions) {
  return { id: "ps" + n, number: n, title: "大問" + n, instructions: "",
           points: questions.reduce((a, x) => a + x.points, 0), questions };
}
function paperSpec() { pseq = 0; return pmock([psec(1, [pq(), pq()]), psec(2, [pq()])]); }
function figureSpec(n) {
  pseq = 0;
  return pmock([psec(1, [pq({ contentBlocks: Array.from({ length: n }, (_, i) => ({
    type: "figure", src: "data:image/png;base64,AA" + i, caption: "図" + (i + 1)
  })) })])]);
}
function srcFigureSpec() {
  pseq = 0;
  return pmock([psec(1, [pq({ contentBlocks: [
    { type: "source", text: "資料の本文です。", caption: "資料1" },
    { type: "figure", src: "data:image/png;base64,AA", caption: "図1" }
  ] })])]);
}
function dialogueSpec() {
  pseq = 0;
  return pmock([psec(1, [pq({ contentBlocks: [
    { type: "dialogue", text: "A: Hello.\nB: Hi." },
    { type: "passage", text: "This is a long reading passage." }
  ] })])]);
}
const ANSWER_TYPES = ["multiple_choice_single", "true_false", "short_answer", "fill_blank",
                      "numeric", "formula", "long_answer", "essay", "english_writing",
                      "matching", "ordering"];
function sheetSpec() {
  pseq = 0;
  const marks = [pq(), pq(), pq(), pq(), pq(), pq()];      /* まとめ書きの対象になる 6 問 */
  const varied = ANSWER_TYPES.map((t) => pq({ type: t, choices: [] }));
  varied.forEach((x) => { x.sectionId = "ps2"; });
  return pmock([psec(1, marks), psec(2, varied)]);
}

/* ── 組み上げ（Renderer まで通す）── */
function splitHtml(html) {
  return { html,
           css: html.slice(html.indexOf("<style>"), html.indexOf("</style>")),
           body: html.slice(html.indexOf("<body>")) };
}
function renderPaper(profileId, spec, seed) {
  const m = JSON.parse(JSON.stringify(spec || paperSpec()));
  m.layout = Object.assign(LP.defaultLayoutSettings(), {
    layoutMode: "auto", answerSheetMode: "current",
    layoutProfileId: profileId, layoutSeed: seed || PROBE_SEEDS[0]
  });
  const plan = L.buildPlan(m, {});
  assert(plan.layoutProfile, profileId + " が紙面の計画に載っていない（前提が崩れている）");
  return Object.assign({ m, plan, lp: LP.planLayout(m, {}) },
                       splitHtml(R.buildHtml(m, plan, { bookletId: "question-booklet" })));
}
function renderSheet(answerProfileId, spec, seed) {
  const m = JSON.parse(JSON.stringify(spec || sheetSpec()));
  m.layout = Object.assign(LP.defaultLayoutSettings(), {
    layoutMode: "auto", answerSheetMode: "auto",
    layoutProfileId: "exam-standard-a4", answerSheetProfileId: answerProfileId,
    layoutSeed: seed || PROBE_SEEDS[0]
  });
  const plan = L.buildPlan(m, {});
  return Object.assign({ m, plan },
                       splitHtml(R.buildHtml(m, plan, { bookletId: "printable-answer-sheet" })));
}

/* ── 出力から値を取り出す（CSS / HTML を実際に読む）── */
function cssNum(css, re) { const m = css.match(re); return m ? Number(m[1]) : null; }
function bodyFontPt(ev) { return cssNum(ev.css, /body \{[\s\S]*?font-size: ([\d.]+)pt/); }
function bodyLineHeight(ev) { return cssNum(ev.css, /body \{[\s\S]*?line-height: ([\d.]+);/); }
function pageSizeMm(ev) {
  const m = ev.css.match(/@page \{\s*size: ([\d.]+)mm ([\d.]+)mm/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function pageMarginsMm(ev) {
  const m = ev.css.match(/@page \{[\s\S]*?margin: ([\d.]+)mm ([\d.]+)mm ([\d.]+)mm ([\d.]+)mm/);
  return m ? { top: +m[1], right: +m[2], bottom: +m[3], left: +m[4] } : null;
}
function questionGapMm(ev) { return cssNum(ev.css, /\.ch \+ \.q[\s\S]*?margin-top: ([\d.]+)mm/); }
function isMincho(ev) { return /body \{[\s\S]*?font-family: 'Hiragino Mincho/.test(ev.css); }
function choiceColumns(ev) { const m = ev.body.match(/class="ch c(\d)/); return m ? Number(m[1]) : null; }
function choiceLabels(ev) { return [...ev.body.matchAll(/class="ch-l">([^<]*)</g)].map((x) => x[1]); }
function sectionMarker(ev) { const m = ev.body.match(/class="sec-no[^"]*">([^<]*)</); return m ? m[1] : null; }
function questionMarker(ev) { const m = ev.body.match(/class="q-no">([^<]*)</); return m ? m[1] : null; }
function figWidthPct(ev) { return cssNum(ev.body, /--fig-w:([\d.]+)%/); }
function figGroupClass(ev) { const m = ev.body.match(/class="qfg([^"]*)"/); return m ? m[1].trim() : null; }
function figureCount(ev) {
  const seg = ev.body.slice(ev.body.indexOf("data-figgroup"));
  return seg.split('class="fgi"').length - 1;
}
function sheetRows(ev) {
  return [...ev.body.matchAll(/<tr style="height:([\d.]+)mm">([\s\S]*?)<\/tr>/g)].map((m) => ({
    heightMm: Number(m[1]), labels: (m[2].match(/class="agb-ql"/g) || []).length
  }));
}
function borderWidths(ev) {
  return [...new Set([...ev.body.matchAll(/border-width:([\d.]+)mm/g)].map((x) => x[1]))];
}

/* 紙面 1 つぶんの「証拠」。Seed を変えた分も持っておく（variant で変わるため）。 */
const paperEvidenceCache = {};
function paperEvidence(profileId) {
  if (paperEvidenceCache[profileId]) return paperEvidenceCache[profileId];
  const base = renderPaper(profileId, paperSpec());
  const ev = {
    profile: LP.getProfile(profileId), base,
    seeds: PROBE_SEEDS.map((s) => renderPaper(profileId, paperSpec(), s)),
    fig1: renderPaper(profileId, figureSpec(1)),
    figSeeds: (n) => PROBE_SEEDS.map((s) => renderPaper(profileId, figureSpec(n), s)),
    srcfig: renderPaper(profileId, srcFigureSpec()),
    dialogue: renderPaper(profileId, dialogueSpec())
  };
  paperEvidenceCache[profileId] = ev;
  return ev;
}
const sheetEvidenceCache = {};
function sheetEvidence(profileId) {
  if (sheetEvidenceCache[profileId]) return sheetEvidenceCache[profileId];
  const ev = { profile: LP.getProfile(profileId),
               seeds: PROBE_SEEDS.map((s) => renderSheet(profileId, sheetSpec(), s)) };
  ev.base = ev.seeds[0];
  sheetEvidenceCache[profileId] = ev;
  return ev;
}
/* 「小さめ／広い」などの言葉は、一般試験・標準の紙面と比べて判定する。 */
const STD = () => LP.getProfile("exam-standard-a4");

/* ── honored に書ける言葉と、その検査 ─────────────────────────
   ここに無い言葉は honored に書けない（言いっぱなしを作らせない）。 */
const HONORED_PROBES = {
  /* 用紙・余白 */
  "用紙・余白": (e) => paperMatches(e) ,
  "余白": (e) => marginsMatch(e),
  "B5 の用紙": (e) => paperMatches(e) && e.profile.paper.size === "B5",
  "狭い余白": (e) => marginsMatch(e) && sideMargin(e) < sideMarginOf(STD()),
  "広い余白": (e) => marginsMatch(e) && sideMargin(e) > sideMarginOf(STD()),
  "とても広い余白": (e) => marginsMatch(e) && sideMargin(e) >= 28,
  "広い左右余白": (e) => marginsMatch(e) && sideMargin(e) > sideMarginOf(STD()),
  /* 本文 */
  "本文の書体と大きさ": (e) => fontPtMatches(e) && fontFamilyMatches(e),
  "本文の大きさ": (e) => fontPtMatches(e),
  "小さめの本文": (e) => fontPtMatches(e) && e.profile.typography.basePt < STD().typography.basePt,
  "大きめの本文": (e) => fontPtMatches(e) && e.profile.typography.basePt > STD().typography.basePt,
  "大きめのゴシック本文": (e) => fontPtMatches(e) && fontFamilyMatches(e)
    && e.profile.typography.bodyFamily === "gothic"
    && e.profile.typography.basePt > STD().typography.basePt,
  /* 行間 */
  "行間": (e) => lineHeightMatches(e),
  "詰めた行間": (e) => lineHeightMatches(e) && e.profile.typography.lineHeight < STD().typography.lineHeight,
  "広い行間": (e) => lineHeightMatches(e) && e.profile.typography.lineHeight > STD().typography.lineHeight,
  "広い行間（数式が重ならない）": (e) => lineHeightMatches(e)
    && e.profile.typography.lineHeight > STD().typography.lineHeight,
  /* 設問どうしの空き */
  "設問どうしの空き": (e) => gapMatches(e),
  "設問間隔": (e) => gapMatches(e),
  "狭い設問間隔": (e) => gapMatches(e) && maxGap(e) < 8,
  "ほぼ空きなしの設問間隔": (e) => gapMatches(e) && maxGap(e) <= 3,
  "設問どうしの大きな空き": (e) => gapMatches(e) && minGap(e) >= 14,
  "設問どうしの大きな空き（＝書き込み場所）": (e) => gapMatches(e) && minGap(e) >= 14,
  "設問どうしの広い空き": (e) => gapMatches(e) && minGap(e) >= 12,
  /* 見出し */
  "見出しの体裁": (e) => headerMatches(e),
  "中央寄せの見出しと罫線": (e) => headerMatches(e)
    && e.profile.header.align !== "left" && e.profile.header.rule !== false,
  "罫線なしの見出し": (e) => headerMatches(e) && e.profile.header.rule === false,
  "科目・時間・満点の行": (e) => /class="exam-meta"/.test(e.base.body)
    && e.base.body.indexOf("試験時間") >= 0,
  "配点の表示": (e) => /class="q-pts"/.test(e.base.body),
  "大問ごとの改ページ": (e) => /page-break-before:always/.test(e.base.body),
  "「第 n 問」の見出し": (e) => sectionMarker(e.base) === "第1問",
  "小問「問 n」": (e) => questionMarker(e.base) === e.profile.subQuestionStyle.markers[0],
  "ページ番号": (e) => !!(e.base.plan.pageNumber && e.base.plan.pageNumber.enabled)
    && /pgno pgno-/.test(e.base.html),
  /* 選択肢 */
  "選択肢の記号と段数": (e) => choiceMarkerMatches(e) && choiceColumnsMatch(e),
  "選択肢の段数": (e) => choiceColumnsMatch(e),
  "選択肢の 2 段・4 段": (e) => choiceColumnsMatch(e) && observedColumns(e).indexOf(2) >= 0
    && observedColumns(e).indexOf(4) >= 0,
  "選択肢の記号（A. B. C.）": (e) => choiceMarkerMatches(e)
    && choiceLabels(e.base).slice(0, 3).join("") === "ABC",
  /* 図表 */
  "図表の置き方": (e) => figurePlacementMatches(e),
  "図形を大きく置く": (e) => figurePlacementMatches(e) && figWidthPct(e.fig1) >= 40,
  "図は横に 2 点まで": (e) => e.profile.figureRules.maxRowItems === 2
    && e.figSeeds(3).every((x) => (figGroupClass(x) || "").indexOf("is-row") < 0),
  /* 資料・会話文 */
  "大きな資料の帯": (e) => /class="src"/.test(e.srcfig.body) && figWidthPct(e.srcfig) >= 80,
  "資料と設問を同じ枠に入れる": (e) => srcInsideFrame(e.srcfig),
  "資料の見出し（キャプション）": (e) => /class="src-cap"/.test(e.srcfig.body)
    && e.srcfig.body.indexOf("資料1") >= 0,
  "会話文・長文のブロック": (e) => /class="dlg"/.test(e.dialogue.body)
    && /class="src"/.test(e.dialogue.body),
  /* 解答用紙 */
  "可変グリッド": (e) => /class="agb"/.test(e.base.body) && /<table class="agbt"/.test(e.base.body),
  "大問の枠": (e) => /class="agb-sec/.test(e.base.body),
  "大問の枠と縦書きラベル": (e) => /class="agb-sec/.test(e.base.body) && /is-vert/.test(e.base.body),
  "配点による罫線の太さ": (e) => e.profile.grid.pointBorder.enabled
    && borderWidths(e.base).length >= 2,
  "得点欄（斜線 + 満点）": (e) => /class="agb-sc"/.test(e.base.body)
    && /agb-slash/.test(e.base.body) && /agb-den/.test(e.base.body),
  "得点欄": (e) => /class="agb-sc"/.test(e.base.body),
  "氏名欄": (e) => e.profile.documentType === "answer-sheet"
    ? (/class="agf"/.test(e.base.body) && e.base.body.indexOf("氏名") >= 0)
    : /class="name-box"/.test(e.base.body),
  "背の高い記述行": (e) => tallestRowMm(e) > tallestRowMm(sheetEvidence("school-answer-grid-dense")),
  "背の高い計算欄": (e) => tallestRowMm(e) > tallestRowMm(sheetEvidence("school-answer-grid-dense")),
  "1 問 1 行": (e) => e.seeds.every((x) => sheetRows(x).every((r) => r.labels <= 1)),
  "1 行に 3 問": (e) => e.seeds.some((x) => sheetRows(x).some((r) => r.labels === 3)),
  "連続マス": (e) => /agc-seq/.test(e.base.body) && /agc-sq/.test(e.base.body),
  "英作文の罫線欄": (e) => /agc-lines/.test(e.base.body) && /agc-line/.test(e.base.body),
  "丸で囲む記号欄": (e) => e.seeds.some((x) => /agc-mark[^"]*is-circle/.test(x.body))
};

/* ── 検査の中身（出力の値と、プロファイルの宣言を突き合わせる）── */
function sideMarginOf(p) { return Math.min(p.margins.left, p.margins.right); }
function sideMargin(e) { return sideMarginOf(e.profile); }
function paperMatches(e) {
  const size = pageSizeMm(e.base);
  const want = PAPER_MM[e.profile.paper.size];
  if (!size || !want) return false;
  const [w, h] = e.profile.paper.orientation === "landscape" ? [want[1], want[0]] : want;
  return size[0] === w && size[1] === h && marginsMatch(e);
}
function marginsMatch(e) {
  const m = pageMarginsMm(e.base), p = e.profile.margins;
  return !!m && m.top === p.top && m.right === p.right && m.bottom === p.bottom && m.left === p.left;
}
function fontPtMatches(e) { return bodyFontPt(e.base) === Number(e.profile.typography.basePt.toFixed(2)); }
function fontFamilyMatches(e) { return isMincho(e.base) === (e.profile.typography.bodyFamily !== "gothic"); }
function lineHeightMatches(e) { return bodyLineHeight(e.base) === e.profile.typography.lineHeight; }
function gapMatches(e) {
  return e.seeds.every((x) => {
    const css = questionGapMm(x);
    return css !== null && css === x.plan.questionGapMm
      && css >= (e.profile.safetyConstraints.minQuestionGapMm || 0);
  });
}
function minGap(e) { return Math.min(...e.seeds.map((x) => questionGapMm(x))); }
function maxGap(e) { return Math.max(...e.seeds.map((x) => questionGapMm(x))); }
function headerMatches(e) {
  const left = /\.exam-head \{ text-align: left; \}/.test(e.base.css);
  const noRule = /\.exam-head \{ border-bottom: 0;/.test(e.base.css);
  return left === (e.profile.header.align === "left")
    && noRule === (e.profile.header.rule === false)
    && /class="exam-meta"/.test(e.base.body) === (e.profile.header.showMeta !== false)
    && /class="name-box"/.test(e.base.body) === (e.profile.header.showNameBox !== false);
}
function choiceMarkerMatches(e) {
  const marker = e.profile.choiceLayout.marker;
  const labels = choiceLabels(e.base);
  if (!labels.length) return false;
  if (marker === "alpha") return labels[0] === "A";
  if (marker === "circled") return labels[0] === "①";
  return labels[0] === "1.";
}
function observedColumns(e) {
  return [...new Set(e.seeds.map((x) => choiceColumns(x)).filter((n) => n))].sort();
}
function choiceColumnsMatch(e) {
  /* 出た段数は、その紙面が許した並べ方から出るものだけ（勝手な段数を出さない）。
     しかも Renderer に段組みの CSS（c1 / c2 / c4）が実在すること。 */
  const allowed = (e.profile.variationRules.choiceLayout || e.profile.choiceLayout.variants || [])
    .map((v) => LP.CHOICE_COLUMNS[v]).filter((n) => n);
  const seen = observedColumns(e);
  if (!seen.length) return false;
  return seen.every((n) => allowed.indexOf(n) >= 0
    && (n === 1 || new RegExp("\\.ch\\.c" + n + " \\{ column-count: " + n).test(e.base.css)));
}
function figurePlacementMatches(e) {
  return e.figSeeds(1).concat(e.figSeeds(2)).every((x) => {
    const lp = LP.planLayout(x.m, {});
    const p0 = lp.sections[0].questions[0];
    const want = p0.figureGroup.layout === "horizontal-centered" ? "is-row"
      : p0.figureGroup.layout === "side" ? "is-side" : "is-stack";
    return (figGroupClass(x) || "").indexOf(want) >= 0
      && figWidthPct(x) === p0.figureWidthPct
      && figureCount(x) === p0.figureGroup.items.length;
  });
}
function srcInsideFrame(x) {
  const frame = x.body.slice(x.body.indexOf('class="qfg'), x.body.indexOf("data-figgroup"));
  return frame.length > 0 && /class="src"/.test(frame);
}
function tallestRowMm(e) { return Math.max(...sheetRows(e.base).map((r) => r.heightMm)); }
/* 本文そのものが段に割れているか（.sheet / .page の規則だけを見る。
   選択肢の .ch.c2 は本文の段組みではないので数えない）。 */
function bodyColumnSplit(e) {
  const rules = [...e.base.css.matchAll(/\.(sheet|page|q-text)[^{}]*\{([^}]*)\}/g)];
  return rules.some((r) => /column-count|columns:/.test(r[2]))
    || /class="(sheet|page)"[^>]*column-count/.test(e.base.body);
}

/* ── pending に書ける言葉と、その検査（「まだ出せない」ことの確認）── */
const PENDING_PROBES = {
  "本文を 2 段に割る組み方（段の高さ合わせ・段またぎの禁止）": (e) =>
    /* 本文を段に割る CSS も指定も無い（選択肢の段組みは本文の段組みではない）。
       plan.columns は計算されるが、Renderer はどこでも使っていない。 */
    !bodyColumnSplit(e),
  "問題と解答欄を 1 行にそろえる表組み": (e) =>
    !/<table class="tbl"[^>]*>[\s\S]*class="q-no"/.test(e.base.body),
  "表を 2 列に分けて流すこと": (e) => !bodyColumnSplit(e),
  "表紙のページ": (e) => !/data-cover="1"/.test(e.base.body),
  "注意事項のページ": (e) => (e.base.body.match(/class="notice"/g) || []).length === 0,
  "見開きでのど側の余白を入れ替えること": (e) =>
    /* 余白は全ページで同じ値のまま（左右を入れ替える仕組みが無い） */
    !/@page :left|@page :right|@page:left|@page:right/.test(e.base.css),
  "画面受験の画面そのもの（1 問ずつの表示・進捗・見直し）": () =>
    /* 紙の紙面としては選べない＝画面も無い。組める経路が 1 つも無いことを確かめる */
    LP.resolveLayoutProfileId("digital-mock", null) === null
    && LP.resolveLayoutProfileId("auto", "digital-mock-screen") !== "digital-mock-screen"
};

/* 画面用の定義は Renderer へ通せない。証拠は「通せないこと」そのもの。 */
const NOT_RENDERABLE = { "digital-mock-screen": true };

function evidenceOf(profileId) {
  const p = LP.getProfile(profileId);
  return p.documentType === "answer-sheet" ? sheetEvidence(profileId) : paperEvidence(profileId);
}
function allModes() { return LP.LAYOUT_MODES.concat(LP.ANSWER_SHEET_MODES); }
function supportOf(profileId) {
  return ((LP.getProfile(profileId).rendererSupport || {}).current || {});
}

test("honored に書いた項目には、必ず検査がある（言いっぱなしを作らせない）", () => {
  let n = 0;
  allModes().forEach((m) => {
    if (!m.profileId) return;
    (supportOf(m.profileId).honored || []).forEach((h) => {
      assert(HONORED_PROBES[h], m.profileId + " の「" + h + "」に検査が無い");
      n++;
    });
  });
  assert(n >= 60, "検査した宣言が少なすぎる: " + n);
});

test("pending に書いた項目にも、必ず検査がある", () => {
  allModes().forEach((m) => {
    if (!m.profileId) return;
    (supportOf(m.profileId).pending || []).forEach((h) => {
      assert(PENDING_PROBES[h], m.profileId + " の「" + h + "」に検査が無い");
    });
  });
});

test("honored の項目は、組み上がった HTML に実際に出ている", () => {
  allModes().forEach((m) => {
    if (!m.profileId || NOT_RENDERABLE[m.profileId]) return;
    const e = evidenceOf(m.profileId);
    (supportOf(m.profileId).honored || []).forEach((h) => {
      assert(HONORED_PROBES[h](e), m.profileId + "：「" + h + "」と書いてあるのに紙へ出ていない");
    });
  });
});

test("pending の項目は、実際にまだ出せていない（出せるなら pending から外す）", () => {
  allModes().forEach((m) => {
    if (!m.profileId) return;
    const pend = supportOf(m.profileId).pending || [];
    if (!pend.length) return;
    const e = NOT_RENDERABLE[m.profileId] ? null : evidenceOf(m.profileId);
    pend.forEach((h) => {
      assert(PENDING_PROBES[h](e), m.profileId + "：「" + h + "」はもう出せている（pending から外すこと）");
    });
  });
});

test("ready は「宣言した項目が実際に出せるか」と一致している", () => {
  allModes().forEach((m) => {
    if (!m.profileId) return;
    const sup = supportOf(m.profileId);
    const e = NOT_RENDERABLE[m.profileId] ? null : evidenceOf(m.profileId);
    /* 実測：honored が 1 つでも出ていなければ、その紙面は出せていない */
    const honoredOk = e !== null
      && (sup.honored || []).length > 0
      && (sup.honored || []).every((h) => HONORED_PROBES[h](e));
    const canRender = honoredOk && (sup.pending || []).length === 0;
    assertEq(m.ready, canRender,
      m.id + "：一覧の ready と、実際に出せるかどうかが食い違っている"
        + "（出せない項目: " + (sup.honored || []).filter((h) => !e || !HONORED_PROBES[h](e)).join("・")
        + " / まだの項目: " + (sup.pending || []).join("・") + "）");
  });
});

test("ready な紙面は「現在の形式」と実際に違う紙になる（選んでも何も変わらない、を作らない）", () => {
  const plain = (() => {
    const m = paperSpec();
    const plan = L.buildPlan(m, {});
    return splitHtml(R.buildHtml(m, plan, { bookletId: "question-booklet" }));
  })();
  const seen = {};
  LP.LAYOUT_MODES.filter((m) => m.ready && m.profileId).forEach((m) => {
    const e = paperEvidence(m.profileId);
    assert(e.base.css !== plain.css, m.id + " は現在の形式と同じ CSS になっている");
    const key = [pageSizeMm(e.base).join("x"), JSON.stringify(pageMarginsMm(e.base)),
                 bodyFontPt(e.base), bodyLineHeight(e.base), isMincho(e.base)].join("|");
    assert(!seen[key], m.id + " は " + seen[key] + " と同じ紙面設定で出ている");
    seen[key] = m.id;
  });
});

/* ══════════════════════════════════════════════════════════════════
   K. 「AI おまかせ」で保存したものは、保存した当時の紙面で開く

   §39 の 12 レイアウトを一覧の前へ足したとき、auto の解決先（＝一覧の
   先頭にある使える紙面）が入れ替わり、保存済みの試験を開くと紙面が
   黙って変わっていた。移行も告知も無し。
   ══════════════════════════════════════════════════════════════════ */
group("K. 「AI おまかせ」で保存したものは、当時と同じ紙面で開く");

/* 12 レイアウトを足す前の「AI おまかせ」の行き先（_backup_typst_20260728 で確認）。 */
const LEGACY_AUTO_PAPER = "school-science-figure-classic";
const LEGACY_AUTO_SHEET = "school-answer-grid-dense";

function savedAuto(extra) {
  const m = mock();
  m.layout = Object.assign({
    outputEngine: "current", layoutMode: "auto", answerSheetMode: "auto",
    documentFamily: null, subjectLayout: null,
    layoutProfileId: null, answerSheetProfileId: null,   /* 当時は書かれていなかった */
    layoutSeed: "OLD-SEED", layoutPlan: null
  }, extra || {});
  return m;
}

test("紙面が書かれていない「おまかせ」の保存データは、昔と同じ紙面で開く", () => {
  const l = LP.readLayoutSettings(savedAuto());
  assertEq(l.layoutProfileId, LEGACY_AUTO_PAPER, "保存済みの紙面が勝手に変わっている");
  assertEq(l.answerSheetProfileId, LEGACY_AUTO_SHEET, "保存済みの解答用紙が勝手に変わっている");
});

test("開いたときに実際に組まれる紙も、昔と同じ", () => {
  const m = savedAuto();
  const lp = LP.planLayout(m, {});
  assert(lp, "おまかせの保存データが組めない");
  assertEq(lp.layoutProfileId, LEGACY_AUTO_PAPER);
  assertEq(lp.answerSheetProfileId, LEGACY_AUTO_SHEET);
  const plan = L.buildPlan(m, {});
  assertEq(plan.layoutProfile.layoutProfileId, LEGACY_AUTO_PAPER);
  /* 紙の実物（余白・書体）も当時のまま */
  const ev = splitHtml(R.buildHtml(m, plan, { bookletId: "question-booklet" }));
  const legacy = LP.getProfile(LEGACY_AUTO_PAPER);
  assert(ev.css.indexOf("margin: " + legacy.margins.top + "mm " + legacy.margins.right + "mm "
                        + legacy.margins.bottom + "mm " + legacy.margins.left + "mm;") >= 0,
         "余白が当時と違う");
  assert(ev.css.indexOf("line-height: " + legacy.typography.lineHeight + ";") >= 0, "行間が当時と違う");
});

test("紙面が書いてある保存データは、書いてあるとおりに開く（勝手に昔へ戻さない）", () => {
  const m = savedAuto({ layoutProfileId: "exam-math", answerSheetProfileId: "school-answer-math-work" });
  const l = LP.readLayoutSettings(m);
  assertEq(l.layoutProfileId, "exam-math");
  assertEq(l.answerSheetProfileId, "school-answer-math-work");
});

test("新しく作るときの「おまかせ」の既定は、いまの一覧の先頭のまま（別の話として分ける）", () => {
  const lay = LP.layoutFromUiSettings(uiDefaults({ layoutMode: "auto", answerSheetMode: "auto" }));
  assert(lay, "おまかせを選んだのに layout が null");
  assertEq(lay.layoutProfileId, LP.resolveLayoutProfileId("auto", null));
  assertEq(lay.layoutProfileId, "exam-standard-a4", "新規作成の既定が変わった（意図した変更か確かめること）");
  /* 新規作成は紙面 ID を必ず書いて保存する＝あとで開いても変わらない */
  const l = LP.readLayoutSettings({ layout: lay });
  assertEq(l.layoutProfileId, lay.layoutProfileId, "保存した紙面と開いた紙面が違う");
});

test("おまかせ以外で紙面が書かれていない保存データは、昔の既定を当てはめない", () => {
  const m = savedAuto({ layoutMode: "standard-exam", answerSheetMode: "grid-standard" });
  const l = LP.readLayoutSettings(m);
  assertEq(l.layoutProfileId, null, "選んだ紙面でないものを当てはめている");
  assertEq(LP.planLayout(m, {}).layoutProfileId, "exam-standard-a4", "選んだ紙面で組めていない");
});

/* ══════════════════════════════════════════════════════════════════
   L. 保存前の検証が見る ID の一覧は 1 か所から来る

   layout-profiles.js が schema.js の公開配列を push で書き換えていたので、
   検証の正しさが「読み込み順」と「layout-profiles.js が読まれること」に
   依存していた。いまは schema.js が呼ばれたときに向こうを読む。
   ══════════════════════════════════════════════════════════════════ */
group("L. 保存前の検証が見る ID の一覧は 1 か所から来る");

test("schema.js の配列は、もう書き換えられていない（push をやめた）", () => {
  /* 控えは静的な配列のまま。layout-profiles.js を読んでも増えない。 */
  const fallback = S.LAYOUT_MODE_IDS_FALLBACK;
  assert(Array.isArray(fallback), "控えの一覧が無い");
  assert(fallback !== LP.LAYOUT_MODE_IDS, "同じ配列を共有している（また書き換えられる）");
  assertDeep(fallback, LP.LAYOUT_MODE_IDS, "紙面デザインの控えがずれている");
  assertDeep(S.ANSWER_SHEET_MODE_IDS_FALLBACK, LP.ANSWER_SHEET_MODE_IDS,
             "解答用紙デザインの控えがずれている");
});

test("一覧の出どころは layout-profiles.js（画面に出る一覧と同じ ID）", () => {
  assertDeep(LP.LAYOUT_MODE_IDS, LP.LAYOUT_MODES.map((m) => m.id));
  assertDeep(LP.ANSWER_SHEET_MODE_IDS, LP.ANSWER_SHEET_MODES.map((m) => m.id));
});

test("新しい紙面を選んだ MockSpec が保存前の検証を通る（読み込み順に関係なく）", () => {
  const ids = LP.LAYOUT_MODES.map((m) => m.id);
  const asIds = LP.ANSWER_SHEET_MODES.map((m) => m.id);
  const check = (where) => {
    ids.forEach((id) => {
      const m = withLayout(mock(), { layoutMode: id, answerSheetMode: "current" });
      const errs = S.validateMockSpec(m, []).filter((i) => i.path === "layout.layoutMode");
      assertEq(errs.length, 0, where + "：" + id + " が弾かれた " + JSON.stringify(errs));
    });
    asIds.forEach((id) => {
      const m = withLayout(mock(), { layoutMode: "current", answerSheetMode: id });
      const errs = S.validateMockSpec(m, []).filter((i) => i.path === "layout.answerSheetMode");
      assertEq(errs.length, 0, where + "：" + id + " が弾かれた " + JSON.stringify(errs));
    });
  };
  check("layout-profiles.js あり");
  /* layout-profiles.js を読み込んでいない構成（schema.js だけ）でも通る */
  const keep = VQ2.layoutProfiles;
  try {
    delete VQ2.layoutProfiles;
    check("layout-profiles.js なし");
  } finally { VQ2.layoutProfiles = keep; }
});

test("schema.js だけを読み込んだ場面でも、新しい紙面 ID を通す（別レルムで確かめる）", () => {
  /* push で後付けしていたころは、この場面で新しい ID が全部弾かれた。
     いまは schema.js 自身が完全な控えを持つので、単体でも通る。 */
  const ctx = vm.createContext({ console: console });
  vm.runInContext(readFileSync(join(V2, "domain/schema.js"), "utf8"), ctx);
  const S2 = ctx.VQ2.schema;
  assert(S2, "schema.js を単体で読み込めていない");
  assert(!ctx.VQ2.layoutProfiles, "前提が崩れている（別レルムに layout-profiles.js が入っている）");
  LP.LAYOUT_MODES.forEach((m) => {
    const l = Object.assign(S2.defaultLayoutSettings(), { layoutMode: m.id });
    const out = S2.validateLayoutSettings(l, "layout", []);
    assertEq(out.filter((i) => i.path === "layout.layoutMode").length, 0,
             m.id + " が schema.js 単体で弾かれた: " + JSON.stringify(out));
  });
  LP.ANSWER_SHEET_MODES.forEach((m) => {
    const l = Object.assign(S2.defaultLayoutSettings(), { answerSheetMode: m.id });
    const out = S2.validateLayoutSettings(l, "layout", []);
    assertEq(out.filter((i) => i.path === "layout.answerSheetMode").length, 0,
             m.id + " が schema.js 単体で弾かれた: " + JSON.stringify(out));
  });
  /* 知らない ID は単体でも弾く */
  const bad = S2.validateLayoutSettings(
    Object.assign(S2.defaultLayoutSettings(), { layoutMode: "ほげ紙面" }), "layout", []);
  assert(bad.some((i) => i.path === "layout.layoutMode" && i.code === "enum"),
         "単体だと何でも通るようになっている");
});

test("知らない紙面 ID は今までどおり弾く（何でも通すようにはしない）", () => {
  const m = withLayout(mock(), { layoutMode: "current" });
  m.layout.layoutMode = "ほげ紙面";
  assert(S.validateMockSpec(m, []).some((i) => i.path === "layout.layoutMode" && i.code === "enum"),
         "知らない紙面 ID が通ってしまった");
  const m2 = withLayout(mock(), { layoutMode: "current" });
  m2.layout.answerSheetMode = "ほげ解答用紙";
  assert(S.validateMockSpec(m2, []).some((i) => i.path === "layout.answerSheetMode" && i.code === "enum"),
         "知らない解答用紙 ID が通ってしまった");
});

process.exit(report("紙面レイアウトプロファイル") ? 1 : 0);
