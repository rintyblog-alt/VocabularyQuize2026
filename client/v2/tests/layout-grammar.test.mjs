/* ══════════════════════════════════════════════════════════════════════
   Layout Grammar V2

   A. 互換性        … 未指定 / current / 古い保存データ / 既存 2 プロファイル
   B. Semantic Plan … Renderer 固有の値を含まない・ID を保つ・Seed で再現
   C. 教科パック     … 7 教科の判定と優先ブロック
   D. ブロック       … 25 種の Schema と fallback
   E. Resolver      … 意味 → 実寸、記入面積の下限
   F. ページ番号     … 位置・書式・current 互換

   実行: node client/v2/tests/layout-grammar.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, assertDeep, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js",
  "pdf/templates.js", "pdf/layout-profiles.js", "pdf/layout-grammar.js", "pdf/layout.js"
]);
const S = VQ2.schema, G = VQ2.layoutGrammar, LP = VQ2.layoutProfiles, L = VQ2.layout;

/* ── 見本 ───────────────────────────────────────────────────────── */
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
const fig = (o) => Object.assign({ type: "figure", src: "data:image/png;base64,AA", caption: "図" }, o || {});
const tbl = (o) => Object.assign({ type: "table", rows: [["a", "b"], ["1", "2"]] }, o || {});

function mock(over) {
  seq = 0;
  const qs = (over && over.questions) || [q(), q(), q()];
  const secs = (over && over.sections) || [{
    id: "s1", number: 1, title: "大問1", instructions: "",
    points: qs.reduce((a, x) => a + x.points, 0), questions: qs
  }];
  const all = secs.flatMap((s) => s.questions);
  return Object.assign({
    id: "m1", schemaVersion: 2, title: "テスト",
    subject: (over && over.subject !== undefined) ? over.subject : "理科", grade: "中3",
    durationMinutes: 50, totalPoints: all.reduce((a, x) => a + x.points, 0),
    sourceMode: "source-only", paper: S.defaultPaper(), sections: secs,
    answerBindings: all.map((x) => ({
      id: x.answerBindingId, questionId: x.id, number: String(x.number),
      inputType: x.type, points: x.points, blankCount: 1
    }))
  }, (over && over.spec) || {});
}
function withLayout(m, layout) {
  const c = JSON.parse(JSON.stringify(m));
  c.layout = Object.assign(LP.defaultLayoutSettings(), layout);
  return c;
}
const MODE = { layoutMode: "school-science-figure", answerSheetMode: "grid-dense" };
const semanticOf = (m, opts) => G.buildSemanticPlan(m, Object.assign({ rng: G ? null : null }, opts || {}));

/* ══════════════════════════════════════════════════════════════════ */
group("A. 互換性");

test("layout 未指定でも Semantic Plan を作れる（経路には入らない）", () => {
  const m = mock();
  assertEq(LP.isEnabled(LP.readLayoutSettings(m)), false, "current 経路のままであること");
  const sem = G.buildSemanticPlan(m, {});
  assertEq(sem.planKind, "semantic");
  assertEq(G.errorsOf(G.validateSemanticPlan(sem, m)).length, 0);
});

test("current のときは LayoutPlan に semantic を足さない", () => {
  const plan = L.buildPlan(mock(), {});
  assertEq(plan.semantic, undefined);
  assertEq(plan.resolved, undefined);
  assertEq(plan.pageNumber, undefined);
});

test("古い保存データ（layout も answerLayoutHint も無い）で落ちない", () => {
  const old = mock();
  delete old.layout;
  const sem = G.buildSemanticPlan(old, {});
  assertEq(G.errorsOf(G.validateSemanticPlan(sem, old)).length, 0);
});

test("既存の理科プロファイルが壊れていない", () => {
  const m = withLayout(mock({ questions: [q({ contentBlocks: [fig()] }), q(), q()] }),
                       Object.assign({ layoutSeed: "K1" }, MODE));
  const plan = L.buildPlan(m, {});
  assertEq(plan.layoutProfile.layoutProfileId, "school-science-figure-classic");
  const lp = LP.planLayout(m, {});
  assertEq(LP.errorsOf(LP.validateLayout(m, lp)).length, 0);
});

test("既存の高密度解答用紙が壊れていない", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "K2" }, MODE));
  const lp = LP.planLayout(m, {});
  assert(lp.answerSheet.grid, "可変グリッドが無い");
  assertEq(LP.errorsOf(LP.validateAnswerGrid(m, lp.answerSheet.grid,
    LP.getProfile("school-answer-grid-dense"))).length, 0);
});

test("プロファイル選択時は semantic と resolved が並ぶ", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "K3" }, MODE));
  const plan = L.buildPlan(m, {});
  assert(plan.semantic, "semantic が無い");
  assert(plan.resolved, "resolved が無い");
  assertEq(plan.semantic.planKind, "semantic");
  assertEq(plan.resolved.planKind, "resolved");
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. Semantic Plan");

test("Renderer 固有の値をひとつも含まない", () => {
  const qs = [q({ contentBlocks: [fig(), fig(), tbl()] }),
              q({ type: "essay", choices: [], correctAnswer: "x" }),
              q({ type: "short_answer", choices: [], correctAnswer: "x" })];
  const sem = G.buildSemanticPlan(mock({ questions: qs }), {});
  const hits = G.findRendererValues(sem);
  assertEq(hits.length, 0, JSON.stringify(hits.slice(0, 4)));
});

test("mm / pt / % / colSpan / CSS の文字列も入っていない", () => {
  const sem = G.buildSemanticPlan(mock(), {});
  const json = JSON.stringify(sem);
  assert(!/\d+mm/.test(json), "mm の値が入っている");
  assert(!/\d+pt/.test(json), "pt の値が入っている");
  assert(!/colSpan|rowSpan|<div|class=/.test(json), "Renderer の語彙が入っている");
});

test("問題 ID と解答 Binding が保たれる", () => {
  seq = 0;
  const m = mock({ questions: [q(), q(), q(), q()] });
  const sem = G.buildSemanticPlan(m, {});
  const ids = sem.sections.flatMap((s) => s.blocks).flatMap((b) => b.sourceQuestionIds);
  const bs = sem.sections.flatMap((s) => s.blocks).flatMap((b) => b.answerBindingIds);
  assertDeep(ids, ["q1", "q2", "q3", "q4"]);
  assertDeep(bs, ["b1", "b2", "b3", "b4"]);
  assertEq(G.errorsOf(G.validateSemanticPlan(sem, m)).length, 0);
});

test("設問が抜けたら検証で止まる", () => {
  const m = mock();
  const sem = G.buildSemanticPlan(m, {});
  sem.sections[0].blocks.pop();
  assert(G.errorsOf(G.validateSemanticPlan(sem, m)).some((e) => e.code === "missingQuestion"));
});

test("許可されていない variant を入れたら止まる", () => {
  const m = mock();
  const sem = G.buildSemanticPlan(m, {});
  sem.sections[0].blocks[0].variant = "斜めに置く";
  assert(G.errorsOf(G.validateSemanticPlan(sem, m)).some((e) => e.code === "variant"));
});

test("同じ入力・同じ Seed なら、同じ Semantic Plan になる", () => {
  const m = mock({ questions: [q({ contentBlocks: [fig(), fig()] }), q(), q()] });
  const a = G.buildSemanticPlan(m, { rng: G.rng ? null : null });
  const b = G.buildSemanticPlan(m, {});
  assertEq(JSON.stringify(a), JSON.stringify(b));
});

test("プロファイル経由でも、同じ Seed なら同じ Semantic Plan", () => {
  const base = mock({ questions: [q({ contentBlocks: [fig(), fig()] }), q()] });
  const a = L.buildPlan(withLayout(base, Object.assign({ layoutSeed: "SM" }, MODE)), {}).semantic;
  const b = L.buildPlan(withLayout(base, Object.assign({ layoutSeed: "SM" }, MODE)), {}).semantic;
  assertEq(JSON.stringify(a), JSON.stringify(b));
});

test("Seed が違っても、問題の中身（ID・Binding・設問数）は変わらない", () => {
  const base = mock({ questions: [q({ contentBlocks: [fig(), fig()] }), q(), q()] });
  const sig = (seed) => {
    const s = L.buildPlan(withLayout(base, Object.assign({ layoutSeed: seed }, MODE)), {}).semantic;
    return JSON.stringify(s.sections.flatMap((x) => x.blocks)
      .map((b) => [b.sourceQuestionIds, b.answerBindingIds, b.answerField.purpose, b.answerField.count]));
  };
  const first = sig("V0");
  for (let i = 1; i < 20; i++) assertEq(sig("V" + i), first, "Seed で中身が変わった（V" + i + "）");
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. 教科ルールパック");

test("7 教科ぶんのパックがある", () => {
  assertDeep(G.SUBJECT_IDS,
    ["japanese", "english", "mathematics", "science", "social-studies", "information", "general"]);
});

test("各パックに必要な項目がそろっている", () => {
  G.SUBJECT_IDS.forEach((id) => {
    const p = G.SUBJECT_PACKS[id];
    ["allowedBlockTypes", "preferredBlockTypes", "typographyRules", "writingDirection",
     "choiceRules", "figureRules", "answerSheetRules", "pageBreakRules", "fallbackRules",
     "compatibleDocumentFamilies", "compatibleEngines", "version"].forEach((k) => {
      assert(p[k] !== undefined, id + " に " + k + " がありません");
    });
  });
});

test("教科は subject の文字から決まる", () => {
  const cases = [
    ["国語", "japanese"], ["現代文", "japanese"],
    ["English Communication III", "english"], ["英語", "english"],
    ["数学Ⅱ", "mathematics"], ["理科", "science"], ["物理基礎", "science"],
    ["日本史探究", "social-studies"], ["情報Ⅰ", "information"]
  ];
  cases.forEach(([subject, want]) => {
    const r = G.detectSubject(mock({ subject }), null);
    assertEq(r.id, want, subject + " → " + r.id);
    assertEq(r.source, "spec-subject");
  });
});

test("利用者の指定が subject より強い", () => {
  const r = G.detectSubject(mock({ subject: "理科" }), "mathematics");
  assertEq(r.id, "mathematics");
  assertEq(r.source, "explicit");
});

test("知らない教科は general へ落とす", () => {
  const r = G.detectSubject(mock({ subject: "宇宙料理学" }), null);
  assertEq(r.id, "general");
  assertEq(r.source, "fallback");
});

test("subject が空でも、中身から安全に判定する（コード問題 → 情報）", () => {
  const qs = [q({ contentBlocks: [{ type: "code", text: "print(1)" }] }),
              q({ contentBlocks: [{ type: "code", text: "for i in x:" }] })];
  const r = G.detectSubject(mock({ questions: qs, subject: "" }), null);
  assertEq(r.id, "information");
  assertEq(r.source, "content");
});

test("手がかりが弱いときは general（推測で決めない）", () => {
  const r = G.detectSubject(mock({ subject: "" }), null);
  assertEq(r.id, "general");
});

test("教科ごとに優先するブロックが違う", () => {
  assert(G.SUBJECT_PACKS.mathematics.preferredBlockTypes.indexOf("proof") >= 0);
  assert(G.SUBJECT_PACKS.english.preferredBlockTypes.indexOf("passage-with-questions") >= 0);
  assert(G.SUBJECT_PACKS["social-studies"].preferredBlockTypes.indexOf("map-question") >= 0);
  assert(G.SUBJECT_PACKS.information.preferredBlockTypes.indexOf("code-block") >= 0);
});

test("国語は選択肢の 2 段組みを許さない", () => {
  assertEq(G.SUBJECT_PACKS.japanese.choiceRules.allowTwoColumn, false);
  const vs = G.allowedVariants("choice-list", q(), G.SUBJECT_PACKS.japanese, { size: "A4" });
  assert(vs.indexOf("two-column") < 0, JSON.stringify(vs));
});

test("英語は連続マスを好む", () => {
  assertEq(G.SUBJECT_PACKS.english.answerSheetRules.preferBoxSequence, true);
  const a = G.answerSemanticFor(
    q({ type: "short_answer", choices: [], correctAnswer: "weather", prompt: "英語 8 字で書きなさい。" }),
    null, G.SUBJECT_PACKS.english);
  assertEq(a.cellKind, "box-sequence");
  assertEq(a.count, 8);
});

test("数学は記述で計算らんを好む", () => {
  const a = G.answerSemanticFor(
    q({ type: "long_answer", choices: [], correctAnswer: "x", prompt: "証明しなさい。" }),
    null, G.SUBJECT_PACKS.mathematics);
  assertEq(a.purpose, "work-area");
});

/* ══════════════════════════════════════════════════════════════════ */
group("D. Semantic Block Library");

test("25 種類以上のブロック型がある", () => {
  assert(G.BLOCK_TYPES.length >= 25, String(G.BLOCK_TYPES.length));
});

test("指定された 25 種がすべて定義されている", () => {
  ["plain-question", "choice-list", "passage", "passage-with-questions", "dialogue", "word-bank",
   "fill-in-blanks", "ordering", "matching", "figure", "figure-group", "figure-right",
   "graph-analysis", "table-analysis", "source-comparison", "map-question", "timeline",
   "experiment-procedure", "code-block", "equation-block", "proof", "calculation-area",
   "drawing-area", "short-answer", "essay"].forEach((t) => {
    assert(G.BLOCKS[t], "定義が無い: " + t);
  });
});

test("各ブロックに必要な項目がそろっている", () => {
  G.BLOCK_TYPES.forEach((t) => {
    const b = G.BLOCKS[t];
    ["type", "semanticRole", "variants", "fallbackVariant", "constraints", "version"].forEach((k) => {
      assert(b[k] !== undefined, t + " に " + k + " がありません");
    });
    ["keepTogether", "avoidBreakInside", "minimumWidth", "preferredPlacement", "allowColumns"]
      .forEach((k) => assert(b.constraints[k] !== undefined, t + ".constraints." + k + " がありません"));
    assert(b.variants.indexOf(b.fallbackVariant) >= 0, t + " の fallbackVariant が variants に無い");
    assert(G.WIDTH_HINTS.indexOf(b.constraints.minimumWidth) >= 0, t + " の minimumWidth が語彙外");
    assert(G.PLACEMENTS.indexOf(b.constraints.preferredPlacement) >= 0, t + " の placement が語彙外");
  });
});

test("ページまたぎを許すブロックと許さないブロックが分かれている", () => {
  assertEq(G.BLOCKS["passage"].constraints.allowPageBreakInside, true);
  assertEq(G.BLOCKS["essay"].constraints.allowPageBreakInside, true);
  assertEq(G.BLOCKS["figure-group"].constraints.allowPageBreakInside, false);
  assertEq(G.BLOCKS["equation-block"].constraints.allowPageBreakInside, false);
  assertEq(G.BLOCKS["calculation-area"].constraints.allowPageBreakInside, false);
});

test("図表 3 点なら figure-group が候補に出る", () => {
  const qq = q({ contentBlocks: [fig(), fig(), tbl()] });
  const cand = G.candidateBlocks(qq, G.SUBJECT_PACKS.science);
  assert(cand.indexOf("figure-group") >= 0, JSON.stringify(cand));
  assert(cand.indexOf("figure") < 0, "1 点用が混ざっている");
});

test("図表 1 点なら figure / figure-right が候補に出る", () => {
  const cand = G.candidateBlocks(q({ contentBlocks: [fig()] }), G.SUBJECT_PACKS.science);
  assert(cand.indexOf("figure") >= 0 && cand.indexOf("figure-right") >= 0, JSON.stringify(cand));
  assert(cand.indexOf("figure-group") < 0, "複数用が混ざっている");
});

test("コードを持つ設問は code-block が候補に出る", () => {
  const cand = G.candidateBlocks(q({ contentBlocks: [{ type: "code", text: "x=1" }] }),
                                 G.SUBJECT_PACKS.information);
  assert(cand.indexOf("code-block") >= 0, JSON.stringify(cand));
});

test("code-block は等幅と折り返しの制限を持つ", () => {
  const c = G.BLOCKS["code-block"].constraints;
  assertEq(c.monospace, true);
  assertEq(c.preserveLineBreaks, true);
  assert(c.maxWrapColumns >= 60);
});

test("証明の設問は proof と計算らんが候補に出る", () => {
  const cand = G.candidateBlocks(q({ prompt: "△ABC が二等辺三角形であることを証明しなさい。" }),
                                 G.SUBJECT_PACKS.mathematics);
  assert(cand.indexOf("proof") >= 0 && cand.indexOf("calculation-area") >= 0, JSON.stringify(cand));
});

test("作図の設問は drawing-area が候補に出る", () => {
  const cand = G.candidateBlocks(q({ prompt: "地図中へ記入しなさい。" }), G.SUBJECT_PACKS["social-studies"]);
  assert(cand.indexOf("drawing-area") >= 0, JSON.stringify(cand));
});

test("長い選択肢では 2 段組みが候補から外れる", () => {
  const long = q({ choices: [
    { id: "c1", label: "A", text: "とても長い選択肢の本文であって折り返しが必要になるもの", isCorrect: true },
    { id: "c2", label: "B", text: "こちらもとても長い選択肢の本文であって折り返しが必要", isCorrect: false }
  ]});
  const vs = G.allowedVariants("choice-list", long, G.SUBJECT_PACKS.general, { size: "A4" });
  assert(vs.indexOf("two-column") < 0, JSON.stringify(vs));
});

test("横に並べると細くなりすぎるなら、横並びが候補から外れる", () => {
  const many = q({ contentBlocks: [fig(), fig(), fig(), fig()] });
  const vs = G.allowedVariants("figure-group", many, G.SUBJECT_PACKS.science, { size: "A4" });
  assert(vs.indexOf("horizontal-centered") < 0, JSON.stringify(vs));
  assert(vs.length >= 1, "候補が空になった");
});

test("候補が空になっても fallbackVariant が返る", () => {
  const vs = G.allowedVariants("figure-group", q({ contentBlocks: [fig(), fig(), fig(), fig(), fig()] }),
                               G.SUBJECT_PACKS.science, { size: "B5" });
  assert(vs.length >= 1);
  assert(G.BLOCKS["figure-group"].variants.indexOf(vs[0]) >= 0, "fallback が語彙外");
});

/* ══════════════════════════════════════════════════════════════════ */
group("E. 文書ファミリーと解答用紙ファミリー");

test("8 つの文書ファミリーがある", () => {
  assertDeep(G.DOCUMENT_FAMILY_IDS,
    ["school-exam-standard", "school-exam-dense", "mock-exam", "common-test-style",
     "workbook", "quiz-sheet", "classroom-assignment", "certification-test"]);
});

test("各ファミリーに必要な項目がそろっている", () => {
  G.DOCUMENT_FAMILY_IDS.forEach((id) => {
    const f = G.DOCUMENT_FAMILIES[id];
    ["available", "paperSizes", "header", "pageNumber", "sectionStart", "density", "cover",
     "defaultAnswerFamily", "allowedBlockTypes", "pageBreak", "compatibleEngines", "version"]
      .forEach((k) => assert(f[k] !== undefined, id + " に " + k + " がありません"));
  });
});

/* 2026-08-04: Typst で 8 種すべてを実際に組み、問題冊子・解答用紙・模範解答が
   PDF になること、体裁ごとに中身が変わることを確かめたので開けた（vqtypst.cjs 36/36）。
   「開いた」という事実だけでなく、**選んだものがそのまま使われる**ことを見る。 */
test("文書の体裁は 8 種すべてが使える", () => {
  const ready = G.DOCUMENT_FAMILY_IDS.filter((id) => G.DOCUMENT_FAMILIES[id].available);
  assertDeep(ready, G.DOCUMENT_FAMILY_IDS);
});

test("選んだ文書の体裁が、そのまま使われる", () => {
  G.DOCUMENT_FAMILY_IDS.forEach((id) => {
    const sem = G.buildSemanticPlan(mock(), { documentFamily: id });
    assertEq(sem.documentFamily, id);
  });
});

/* 落とす仕組みそのものは残す。まだ開けていない解答用紙の体裁で確かめる。 */
test("準備中の体裁を選んでも、使えるものへ落ちて理由が残る", () => {
  const sem = G.buildSemanticPlan(mock(), { answerFamily: "answer-mark" });
  assertEq(sem.answerFamily, "answer-dense-grid");
  assert(sem.notices.some((n) => n.indexOf("準備中") >= 0 || n.indexOf("用意できていない") >= 0),
    JSON.stringify(sem.notices));
});

test("8 つの解答用紙ファミリーがある", () => {
  assertDeep(G.ANSWER_FAMILY_IDS,
    ["answer-dense-grid", "answer-standard-grid", "answer-written-heavy", "answer-math-work",
     "answer-english", "answer-japanese", "answer-mark", "answer-inline"]);
});

test("answer-dense-grid は既存の高密度解答用紙と結びついている", () => {
  const a = G.ANSWER_FAMILIES["answer-dense-grid"];
  assertEq(a.available, true);
  assertEq(a.profileId, "school-answer-grid-dense");
});

test("用意できている解答用紙ファミリーは answer-dense-grid だけ", () => {
  const ready = G.ANSWER_FAMILY_IDS.filter((id) => G.ANSWER_FAMILIES[id].available);
  assertDeep(ready, ["answer-dense-grid"]);
});

test("準備中の解答用紙ファミリーは fallback をたどる", () => {
  const sem = G.buildSemanticPlan(mock({ subject: "国語" }), {});
  /* 国語パックの既定は answer-japanese（準備中）→ answer-dense-grid へ落ちる */
  assertEq(sem.answerFamily, "answer-dense-grid");
  assert(sem.notices.length >= 1, "理由が残っていない");
});

test("Typst / TeX は互換エンジンに入れない（使えるふりをしない）", () => {
  G.DOCUMENT_FAMILY_IDS.forEach((id) => {
    assertDeep(G.DOCUMENT_FAMILIES[id].compatibleEngines, ["current"], id);
  });
  G.SUBJECT_IDS.forEach((id) => {
    assertDeep(G.SUBJECT_PACKS[id].compatibleEngines, ["current"], id);
  });
});

/* ══════════════════════════════════════════════════════════════════ */
group("F. Resolver（意味 → 実寸）");

function resolved(m, opts) {
  const sem = G.buildSemanticPlan(m, opts || {});
  return { sem, res: G.resolveSemanticPlan(sem, { margins: { top: 20, bottom: 20, left: 20, right: 20 } }) };
}

test("Resolved Plan にだけ mm と列が出てくる", () => {
  const { sem, res } = resolved(mock());
  assertEq(G.findRendererValues(sem).length, 0, "意味の側に実寸が漏れている");
  assert(res.grid.columns >= 1 && res.grid.mmPerCol > 0);
  assert(res.paper.widthMm === 210 && res.paper.heightMm === 297);
  assert(res.typography.basePt > 0);
});

test("同じ Semantic Plan でも、用紙が変われば実寸が変わる", () => {
  const m = mock();
  const sem = G.buildSemanticPlan(m, {});
  const a4 = G.resolveSemanticPlan(sem, { margins: { top: 20, bottom: 20, left: 20, right: 20 } });
  const semB5 = JSON.parse(JSON.stringify(sem));
  semB5.paper.size = "B5";
  const b5 = G.resolveSemanticPlan(semB5, { margins: { top: 20, bottom: 20, left: 20, right: 20 } });
  assert(a4.paper.widthMm !== b5.paper.widthMm);
  assert(a4.grid.mmPerCol !== b5.grid.mmPerCol, "1 列の幅が同じになっている");
});

test("解答欄が記入面積の下限を満たす", () => {
  const qs = [q(), q({ type: "short_answer", choices: [], correctAnswer: "x" }),
              q({ type: "essay", choices: [], correctAnswer: "x" })];
  const { sem, res } = resolved(mock({ questions: qs }));
  assertEq(G.errorsOf(G.validateResolvedPlan(res, sem)).length, 0);
  res.blocks.filter((b) => b.answerCell).forEach((b) => {
    const semB = sem.sections[0].blocks.find((x) => x.id === b.id);
    const need = G.AREA_MM2[semB.answerField.minimumWritingArea] || 0;
    assert(b.answerCell.writingAreaMm2 >= need,
      b.type + " の記入面積が足りない: " + b.answerCell.writingAreaMm2 + " / " + need);
  });
});

test("Resolved が設問の対応を変えていたら止める", () => {
  const { sem, res } = resolved(mock());
  res.blocks[0].sourceQuestionIds = ["別の問題"];
  assert(G.errorsOf(G.validateResolvedPlan(res, sem)).some((e) => e.code === "questionChanged"));
});

test("Resolved が列数を超えていたら止める", () => {
  const { sem, res } = resolved(mock());
  const b = res.blocks.find((x) => x.answerCell);
  b.answerCell.colSpan = 999;
  assert(G.errorsOf(G.validateResolvedPlan(res, sem)).some((e) => e.code === "colSpan"));
});

test("論述は複数行の欄になり、面積が大きい", () => {
  const { res } = resolved(mock({ questions: [q({ type: "essay", choices: [], correctAnswer: "x" })] }));
  const c = res.blocks.find((b) => b.answerCell).answerCell;
  assert(c.rows >= 3, "行数が足りない: " + c.rows);
  assert(c.writingAreaMm2 >= G.AREA_MM2.large, String(c.writingAreaMm2));
});

test("選択問題は小さい欄になる", () => {
  const { res } = resolved(mock({ questions: [q()] }));
  const c = res.blocks.find((b) => b.answerCell).answerCell;
  assertEq(c.cell, "small-box");
  assert(c.widthMm < 40, String(c.widthMm));
});

/* ══════════════════════════════════════════════════════════════════ */
group("G. ページ番号");

test("設定できる項目がそろっている", () => {
  const pn = G.normalizePageNumber({ enabled: true, position: "bottom-right", style: "slash",
                                     startNumber: 3, coverIncluded: true, prefix: "問題冊子", suffix: "頁" });
  assertEq(pn.position, "bottom-right");
  assertEq(pn.style, "slash");
  assertEq(pn.startNumber, 3);
  assertEq(pn.coverIncluded, true);
  assertEq(pn.prefix, "問題冊子");
  assertEq(pn.suffix, "頁");
});

test("知らない位置・書式は既定へ落とす", () => {
  const pn = G.normalizePageNumber({ position: "真ん中あたり", style: "手書き" });
  assertEq(pn.position, "bottom-center");
  assertEq(pn.style, "dash");
});

test("書式ごとの表示", () => {
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "dash" }), 1, 6), "- 1 -");
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "slash" }), 2, 6), "2 / 6");
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "plain" }), 3, 6), "3");
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "labeled" }), 4, 6), "ページ 4");
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "slash", prefix: "問題冊子" }), 1, 6),
    "問題冊子 1 / 6");
});

test("総ページ数が分からないときは「1 / ?」と書かない", () => {
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "slash" }), 1, 0), "1");
});

test("startNumber から数え始める", () => {
  assertEq(G.pageNumberText(G.normalizePageNumber({ style: "plain", startNumber: 5 }), 1, 6), "5");
});

test("文書ファミリーがページ番号の既定を持つ", () => {
  assertEq(G.DOCUMENT_FAMILIES["school-exam-standard"].pageNumber.style, "dash");
  assertEq(G.DOCUMENT_FAMILIES["quiz-sheet"].pageNumber.enabled, false);
  assertEq(G.DOCUMENT_FAMILIES["workbook"].pageNumber.coverIncluded, true);
});

test("プロファイルを選ぶと Plan にページ番号の設定が載る", () => {
  const m = withLayout(mock(), Object.assign({ layoutSeed: "PN" }, MODE));
  const plan = L.buildPlan(m, {});
  assert(plan.pageNumber, "ページ番号の設定が無い");
  assertEq(plan.pageNumber.enabled, true);
  assertEq(plan.pageNumber.style, "dash");
});

process.exit(report("Layout Grammar V2") ? 1 : 0);
