/* ══════════════════════════════════════════════════════════════════════
   仕様 §39 の 12 レイアウト ＋ §42 の自動レイアウト推奨

   J. 一覧と実体   … ready:true は「実際に紙が変わる」ものだけ
   K. 定義の中身   … 項目がそろっている／安全側の制約を破っていない
   L. 別物である   … 12 件が実際に違う紙面設定になっている
   M. 実際に組める … ready なもの全部で、計画と検証が通る
   N. 解答用紙     … 増やした解答用紙が設問と 1 対 1 で対応する
   O. 推奨（§42）  … 候補を出すだけ。決めない・作り直さない

   実行: node client/v2/tests/layout-profiles-v39.test.mjs
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
const S = VQ2.schema, LP = VQ2.layoutProfiles, L = VQ2.layout;

/* ── 試験の見本（layout-profiles.test.mjs と同じ作り）───────────── */
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

/* §39 の 12 レイアウト（この 12 件がそろっていること） */
const SPEC39 = [
  ["standard-exam",      "exam-standard-a4"],
  ["compact-exam",       "exam-compact-dense"],
  ["two-column",         "exam-two-column"],
  ["spacious-worksheet", "worksheet-spacious"],
  ["entrance-exam",      "exam-entrance-mock"],
  ["source-based-exam",  "exam-source-based"],
  ["english-test",       "exam-english"],
  ["math-test",          "exam-math"],
  ["vocabulary-test",    "test-vocabulary-table"],
  ["booklet",            "booklet-spread"],
  ["minimal-premium",    "premium-minimal"],
  ["digital-mock",       "digital-mock-screen"]
];
const READY_LAYOUT_MODES = LP.LAYOUT_MODES.filter((m) => m.ready && m.profileId);
const ANSWER_MODES = LP.ANSWER_SHEET_MODES.filter((m) => m.ready && m.profileId);
const PAPER_PROFILES = () => LP.listProfiles("question-paper");

/* ══════════════════════════════════════════════════════════════════ */
group("J. 一覧と実体（動くふりをしない）");

test("§39 の 12 レイアウトがすべて定義されている", () => {
  SPEC39.forEach(([modeId, profileId]) => {
    const mode = LP.LAYOUT_MODES.filter((m) => m.id === modeId)[0];
    assert(mode, "一覧に無い: " + modeId);
    assertEq(mode.profileId, profileId, modeId + " の実体が結び付いていない");
    assert(LP.getProfile(profileId), "プロファイルが無い: " + profileId);
  });
  assertEq(SPEC39.length, 12);
});

test("ready:true は「いまの Renderer が出せる」ものだけ", () => {
  LP.LAYOUT_MODES.concat(LP.ANSWER_SHEET_MODES).forEach((m) => {
    if (!m.profileId) return;
    const sup = (LP.getProfile(m.profileId).rendererSupport || {}).current || {};
    const pending = sup.pending || [];
    assertEq(m.ready, pending.length === 0,
      m.id + " の ready と、まだ出せないもの（" + pending.join("・") + "）が食い違っている");
  });
});

test("実体の無い選択肢を ready:true にしていない", () => {
  LP.LAYOUT_MODES.concat(LP.ANSWER_SHEET_MODES).forEach((m) => {
    if (m.id === "current" || m.id === "auto") return;     /* この 2 つは実体を持たない語 */
    if (m.ready) assert(m.profileId && LP.getProfile(m.profileId),
      m.id + " が ready なのに実体が無い");
  });
});

test("準備中の紙面は Planner を通らない（選んでも現在の形式へ落ちる）", () => {
  const pending = LP.LAYOUT_MODES.filter((m) => !m.ready && m.id !== "current" && m.id !== "auto");
  assert(pending.length >= 4, "準備中がひとつも無い（前提が変わった）");
  pending.forEach((m) => {
    const spec = withLayout(mock(), { layoutMode: m.id });
    assertEq(LP.resolveLayoutProfileId(m.id, null), null, m.id + " が解決してしまう");
    assertEq(LP.isEnabled(LP.readLayoutSettings(spec)), false, m.id + " が有効になっている");
    assertEq(LP.planLayout(spec, {}), null, m.id);
  });
});

test("準備中のものは「何が足りないか」を書いてある", () => {
  LP.LAYOUT_MODES.forEach((m) => {
    if (m.ready || !m.profileId) return;
    const sup = (LP.getProfile(m.profileId).rendererSupport || {}).current || {};
    assert((sup.pending || []).length >= 1, m.id + " に足りないものが書かれていない");
    sup.pending.forEach((p) => assert(String(p).trim().length >= 4, m.id + " の説明が短すぎる"));
    assert(String(m.note || "").length >= 10, m.id + " に画面へ出す説明が無い");
  });
});

test("画面受験は紙ではない（紙面の Planner が選べない）", () => {
  const p = LP.getProfile("digital-mock-screen");
  assertEq(p.printable, false, "紙でないことが分からない");
  assertEq(p.medium, "screen");
  assertEq(p.documentType, "screen-form", "紙の文書として扱われている");
  assertDeep(p.compatibleEngines, [], "紙に組めるふりをしている");
  const mode = LP.LAYOUT_MODES.filter((m) => m.id === "digital-mock")[0];
  assertEq(mode.printable, false);
  /* 一覧からも、明示指定からも、紙面としては選べない */
  assertEq(LP.resolveLayoutProfileId("digital-mock", null), null);
  assertEq(LP.resolveLayoutProfileId("auto", "digital-mock-screen"), "exam-standard-a4",
    "画面用の定義が紙面として通ってしまった");
  assertEq(LP.listProfiles("question-paper").filter((x) => x.id === "digital-mock-screen").length, 0);
});

test("旧 ID は今も使えないまま、置き換え先だけ分かる", () => {
  ["school-standard", "school-english-reading", "common-test"].forEach((id) => {
    const m = LP.LAYOUT_MODES.filter((x) => x.id === id)[0];
    assert(m, "旧 ID を消してしまった（保存データが読めなくなる）: " + id);
    assertEq(m.ready, false, id);
    assertEq(m.profileId, null, id);
    assertEq(m.deprecated, true, id + " が非表示になっていない");
    const to = LP.migrateLayoutMode(id);
    assert(to && LP.LAYOUT_MODES.filter((x) => x.id === to)[0].ready, id + " の置き換え先が使えない");
  });
  /* 画面の一覧からは外れる */
  const visible = LP.visibleLayoutModes().map((m) => m.id);
  assert(visible.indexOf("school-standard") < 0, "旧 ID が画面に出てしまう");
  assert(visible.indexOf("standard-exam") >= 0, "新しい紙面が画面に出ない");
  /* 読み込みでは勝手に置き換えない（黙って紙面を変えない） */
  const spec = withLayout(mock(), { layoutMode: "school-standard" });
  assertEq(LP.readLayoutSettings(spec).layoutMode, "school-standard", "勝手に置き換えている");
});

test("AI おまかせは、用意できている紙面と解答用紙から選ぶ", () => {
  const qp = LP.resolveLayoutProfileId("auto", null);
  assertEq(LP.getProfile(qp).documentType, "question-paper");
  assert(READY_LAYOUT_MODES.some((m) => m.profileId === qp), "おまかせが準備中のものを選んだ");
  const as = LP.resolveAnswerProfileId("auto", null);
  assertEq(LP.getProfile(as).documentType, "answer-sheet");
  assert(ANSWER_MODES.some((m) => m.profileId === as), "おまかせが準備中の解答用紙を選んだ");
});

test("新しい紙面を選んだ MockSpec が、保存前の検証を通る", () => {
  /* 実測（2026-08-05）：schema.js の静的な一覧に新 ID が無く、
     新しい紙面を選ぶと「使用できない値です」で 1 件も保存できなかった。 */
  LP.LAYOUT_MODES.forEach((lm) => {
    const m = withLayout(mock(), { layoutMode: lm.id });
    const errs = S.validateMockSpec(m, []).filter((i) => i.severity === "error");
    assertEq(errs.length, 0, lm.id + " が保存できない: " + JSON.stringify(errs));
  });
  LP.ANSWER_SHEET_MODES.forEach((am) => {
    const m = withLayout(mock(), { answerSheetMode: am.id });
    const errs = S.validateMockSpec(m, []).filter((i) => i.severity === "error");
    assertEq(errs.length, 0, am.id + " が保存できない: " + JSON.stringify(errs));
  });
});

test("知らない紙面 ID は、今までどおり保存前に弾く", () => {
  const m = withLayout(mock(), {});
  m.layout.layoutMode = "ほげ紙面";
  const errs = S.validateMockSpec(m, []);
  assert(errs.some((i) => i.path === "layout.layoutMode" && i.code === "enum"),
    "知らない紙面が通ってしまった: " + JSON.stringify(errs));
});

/* ══════════════════════════════════════════════════════════════════ */
group("K. 定義の中身");

const REQUIRED_KEYS = ["id", "name", "documentType", "compatibleEngines", "supportedSubjects",
  "supportedQuestionTypes", "unsupportedQuestionTypes", "rendererSupport",
  "paper", "margins", "typography", "header", "sectionStyle", "subQuestionStyle",
  "questionFlow", "choiceLayout", "figureRules", "answerCellRules", "scoreArea",
  "studentFields", "variationRules", "safetyConstraints", "version"];

test("すべてのプロファイルに、既存と同じ項目がそろっている", () => {
  LP.listProfiles().forEach((p) => {
    REQUIRED_KEYS.forEach((k) => assert(p[k] !== undefined, p.id + " に " + k + " がありません"));
    assert(/^\d+\.\d+\.\d+$/.test(p.version), p.id + " の version が形式外");
  });
  assert(LP.listProfiles().length >= 19, "プロファイルの数が足りない: " + LP.listProfiles().length);
});

test("supportedQuestionTypes は実在の形式 ID だけ", () => {
  const known = S.QUESTION_TYPES;
  LP.listProfiles().forEach((p) => {
    assert(p.supportedQuestionTypes.length >= 1, p.id + " が 1 形式も受けられない");
    p.supportedQuestionTypes.forEach((t) => {
      assert(known.indexOf(t) >= 0, p.id + " に知らない形式 ID: " + t);
    });
    Object.keys(p.unsupportedQuestionTypes).forEach((t) => {
      assert(known.indexOf(t) >= 0, p.id + " の向かない形式に知らない ID: " + t);
    });
  });
});

test("向く形式と向かない形式が重ならず、合わせると全形式になる", () => {
  const all = LP.ALL_QUESTION_TYPES;
  assertEq(all.length, 13, "形式の数が変わった（表を作り直すこと）");
  LP.listProfiles().forEach((p) => {
    const sup = p.supportedQuestionTypes, un = Object.keys(p.unsupportedQuestionTypes);
    un.forEach((t) => assert(sup.indexOf(t) < 0, p.id + " が " + t + " を両方に書いている"));
    const union = sup.concat(un).sort();
    assertDeep(union, all.slice().sort(), p.id + " が黙って落としている形式がある");
  });
});

test("向かない形式には、必ず理由が書いてある", () => {
  let withReason = 0;
  LP.listProfiles().forEach((p) => {
    Object.keys(p.unsupportedQuestionTypes).forEach((t) => {
      const r = p.unsupportedQuestionTypes[t];
      assert(typeof r === "string" && r.length >= 10, p.id + "／" + t + " の理由が無い: " + r);
      withReason++;
    });
  });
  assert(withReason >= 15, "「向かない形式」がほとんど書かれていない: " + withReason);
});

test("安全側の制約を、自分の設定で破っていない", () => {
  PAPER_PROFILES().forEach((p) => {
    const sc = p.safetyConstraints, t = p.typography, f = p.figureRules;
    assert(t.basePt >= sc.minFontPt, p.id + ": 本文が下限より小さい");
    assert(t.minimumFontSize >= sc.minFontPt, p.id + ": 最小文字が下限より小さい");
    assert(p.questionFlow.gapMmRange[0] >= sc.minQuestionGapMm,
      p.id + ": 設問の空きが下限を割っている");
    assert(p.questionFlow.gapMmRange[0] <= p.questionFlow.gapMmRange[1], p.id + ": 空きの範囲が逆");
    ["rightWidthPct", "belowWidthPct", "centeredWidthPct", "rowWidthPct", "maxWidthPct"].forEach((k) => {
      assert(f[k] <= sc.maxFigureWidthPct, p.id + ": " + k + " が図の上限を超えている");
    });
    /* 図を右に置くとき、本文と図が必ず重なる幅になっていないこと */
    if (f.variants.indexOf("figure-right") >= 0 || f.variants.indexOf("text-left-graph-right") >= 0) {
      assert(f.rightWidthPct + 4 < 100, p.id + ": 右に置くと本文の幅が残らない");
    }
    /* 選択肢の段数は Renderer が出せる 1 / 2 / 4 のいずれかで、上限も超えない */
    p.choiceLayout.variants.forEach((v) => {
      const cols = LP.CHOICE_COLUMNS[v];
      assert(cols, p.id + ": 出せない選択肢の並べ方: " + v);
      assert(cols <= sc.maxColumns, p.id + ": " + v + " が段数の上限を超えている");
    });
    /* 図の置き方は、いま組める形の中からだけ */
    p.figureRules.variants.forEach((v) => {
      assert(LP.FIGURE_LAYOUT_NEEDS[v], p.id + ": 組めない図の置き方: " + v);
    });
    /* 候補が尽きたときの受け皿を必ず持つ（持たないと検証で落ちる）。
       1 点＝下に置く／2〜3 点＝横に並べる／それ以上＝上下に積む。 */
    ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"].forEach((v) => {
      assert(p.variationRules.figureLayout.indexOf(v) >= 0,
        p.id + ": 受け皿の置き方 " + v + " を持っていない");
    });
  });
});

test("解答用紙の欄が、書ける大きさの下限を守っている", () => {
  LP.listProfiles("answer-sheet").forEach((p) => {
    const sc = p.safetyConstraints;
    assert(p.typography.basePt >= sc.minFontPt, p.id + ": 文字が下限より小さい");
    Object.keys(p.answerShapes).forEach((k) => {
      const s = p.answerShapes[k];
      assert(s.heightMm >= sc.minCellHeightMm || k === "box-sequence",
        p.id + ": " + k + " の高さが下限を割っている");
      if (k === "box-sequence") return;                 /* 連続マスは 1 マスが細くてよい */
      assert(s.widthMm >= sc.minCellWidthMm, p.id + ": " + k + " の幅が下限を割っている");
    });
    /* 記述の面積の下限を、自分の形の値で満たせること */
    const need = sc.minWriteAreaMm2 || {};
    Object.keys(need).forEach((k) => {
      const s = p.answerShapes[k];
      const w = k === "wide-answer" || k === "lined-answer" || k === "merged-answer" ? 150 : s.widthMm;
      assert(w * s.heightMm * (s.rows || 1) >= need[k],
        p.id + ": " + k + " が自分で決めた面積の下限を満たせない");
    });
  });
});

/* ══════════════════════════════════════════════════════════════════ */
group("L. 12 件が実際に違う紙面設定になっている");

test("色や名前だけでなく、紙面の作りが 2 件として同じでない", () => {
  const profiles = PAPER_PROFILES();
  const sig = (p) => JSON.stringify([
    p.paper.size, p.paper.orientation, p.paper.spread,
    p.margins, p.typography.basePt, p.typography.lineHeight, p.typography.bodyFamily,
    p.questionFlow.columns, p.questionFlow.gapMmRange,
    p.choiceLayout.variants, p.sectionStyle.marker,
    [p.figureRules.belowWidthPct, p.figureRules.rowWidthPct]
  ]);
  const seen = new Map();
  profiles.forEach((p) => {
    const s = sig(p);
    assert(!seen.has(s), "紙面の作りが同じ: " + seen.get(s) + " と " + p.id);
    seen.set(s, p.id);
  });
  assert(profiles.length >= 12, "問題用紙が 12 件に足りない: " + profiles.length);
});

test("余白・段組み・行間・設問の空きの組み合わせも重複しない", () => {
  const seen = new Map();
  PAPER_PROFILES().forEach((p) => {
    const s = JSON.stringify([p.margins, p.questionFlow.columns,
                              p.typography.lineHeight, p.questionFlow.gapMmRange]);
    assert(!seen.has(s), "余白・段・行間・空きが同じ: " + seen.get(s) + " と " + p.id);
    seen.set(s, p.id);
  });
});

test("解答用紙どうしも別物になっている", () => {
  const seen = new Map();
  LP.listProfiles("answer-sheet").forEach((p) => {
    const s = JSON.stringify([p.margins, p.grid.columns, p.grid.rowGroupMax,
                              p.grid.rowHeightMm, p.typography.basePt]);
    assert(!seen.has(s), "解答用紙の作りが同じ: " + seen.get(s) + " と " + p.id);
    seen.set(s, p.id);
  });
  assert(LP.listProfiles("answer-sheet").length >= 6, "解答用紙が増えていない");
});

/* ══════════════════════════════════════════════════════════════════ */
group("M. ready な紙面は、実際に計画が作れて検証を通る");

function mixedQuestions() {
  return [
    q({ contentBlocks: [figure()] }),
    q({ type: "true_false", choices: [
      { id: "c1", label: "A", text: "正しい", isCorrect: true },
      { id: "c2", label: "B", text: "誤り", isCorrect: false }] }),
    q({ type: "short_answer", choices: [], correctAnswer: "答え" }),
    q({ type: "long_answer", choices: [], correctAnswer: "答え" }),
    q({ type: "numeric", choices: [], correctAnswer: "12" }),
    q({ contentBlocks: [figure(), figure({ caption: "図2" }),
                        { type: "table", rows: [["a", "b"]] }] })
  ];
}

test("ready な紙面 × ready な解答用紙のすべてで、検証エラーが 0 件", () => {
  const base = mock({ questions: mixedQuestions() });
  let checked = 0;
  READY_LAYOUT_MODES.forEach((lm) => {
    ANSWER_MODES.forEach((am) => {
      ["S1", "S2", "S3"].forEach((seed) => {
        const m = withLayout(base, { layoutMode: lm.id, answerSheetMode: am.id, layoutSeed: seed });
        const plan = LP.planLayout(m, {});
        assert(plan, lm.id + " / " + am.id + " で計画が作れない");
        assertEq(LP.validatePlanSchema(plan).length, 0,
          lm.id + " / " + am.id + " の形が違う: " + JSON.stringify(LP.validatePlanSchema(plan)));
        const errs = LP.errorsOf(LP.validateLayout(m, plan));
        assertEq(errs.length, 0, lm.id + " / " + am.id + "：" + JSON.stringify(errs.slice(0, 3)));
        checked++;
      });
    });
  });
  assert(checked >= 100, "組み合わせを試せていない: " + checked);
});

test("図表が 0〜6 点でも、どの紙面でも置き場所が決まる", () => {
  READY_LAYOUT_MODES.forEach((lm) => {
    for (let n = 0; n <= 6; n++) {
      const blocks = Array.from({ length: n }, (_, i) => figure({ caption: "図" + (i + 1) }));
      const base = mock({ questions: [q({ contentBlocks: blocks })] });
      for (let i = 0; i < 8; i++) {
        const m = withLayout(base, { layoutMode: lm.id, answerSheetMode: "grid-dense",
                                     layoutSeed: "F" + n + "-" + i });
        const plan = LP.planLayout(m, {});
        const p0 = plan.sections[0].questions[0];
        if (n === 0) { assertEq(p0.figureLayout, null, lm.id); continue; }
        assert(p0.figureLayout, lm.id + " で図 " + n + " 点の置き場所が決まらない");
        assertEq(p0.figureGroup.items.length, n, lm.id + " で図がばらけた");
        const errs = LP.errorsOf(LP.validateLayout(m, plan));
        assertEq(errs.length, 0, lm.id + "／図 " + n + " 点：" + JSON.stringify(errs.slice(0, 2)));
      }
    }
  });
});

test("同じ Seed なら、どの紙面でもまったく同じ計画になる", () => {
  const base = mock({ questions: mixedQuestions() });
  READY_LAYOUT_MODES.forEach((lm) => {
    const m = withLayout(base, { layoutMode: lm.id, answerSheetMode: "grid-standard", layoutSeed: "SAME" });
    assertEq(JSON.stringify(LP.planLayout(m, {})), JSON.stringify(LP.planLayout(m, {})), lm.id);
  });
});

test("どの紙面を選んでも、問題文・配点・ID・番号は変わらない", () => {
  const base = mock({ questions: mixedQuestions() });
  const snapshot = JSON.stringify(base.sections);
  READY_LAYOUT_MODES.forEach((lm) => {
    ANSWER_MODES.forEach((am) => {
      const m = withLayout(base, { layoutMode: lm.id, answerSheetMode: am.id, layoutSeed: "K1" });
      LP.planLayout(m, {});
      L.buildPlan(m, {});
    });
  });
  assertEq(JSON.stringify(base.sections), snapshot, "問題データが書き換わった");
});

test("どの紙面でも、紙面の土台がその紙面の値になる（描画へ届く）", () => {
  const base = mock({ questions: mixedQuestions() });
  READY_LAYOUT_MODES.forEach((lm) => {
    const prof = LP.getProfile(lm.profileId);
    const m = withLayout(base, { layoutMode: lm.id, answerSheetMode: "grid-dense", layoutSeed: "B9" });
    const plan = L.buildPlan(m, {});
    assert(plan.layoutProfile, lm.id + " のプロファイル情報が付いていない");
    assertEq(plan.layoutProfile.layoutProfileId, prof.id, lm.id);
    assertDeep(plan.paper.margins, prof.margins, lm.id + " の余白が届いていない");
    assertEq(plan.paper.size, prof.paper.size, lm.id + " の用紙が届いていない");
    assertEq(plan.lineHeight, prof.typography.lineHeight, lm.id + " の行間が届いていない");
    assert(plan.questionGapMm >= prof.safetyConstraints.minQuestionGapMm, lm.id + " の空きが下限割れ");
    assert(plan.booklets[0].blocks.length >= 1, lm.id + " で本文が空");
  });
});

test("4 段の選択肢は、とても短い選択肢のときだけ", () => {
  const short = q({ choices: [
    { id: "c1", label: "A", text: "北", isCorrect: true },
    { id: "c2", label: "B", text: "南", isCorrect: false },
    { id: "c3", label: "C", text: "東", isCorrect: false },
    { id: "c4", label: "D", text: "西", isCorrect: false }] });
  const long = q({ choices: [
    { id: "c1", label: "A", text: "これはとても長い選択肢の本文であって折り返しが必要になる", isCorrect: true },
    { id: "c2", label: "B", text: "これもとても長い選択肢の本文であって折り返しが必要になる", isCorrect: false }] });
  let saw4 = false;
  for (let i = 0; i < 40; i++) {
    const a = LP.planLayout(withLayout(mock({ questions: [short] }),
      { layoutMode: "compact-exam", answerSheetMode: "current", layoutSeed: "C4-" + i }), {});
    if (a.sections[0].questions[0].choiceColumns === 4) saw4 = true;
    const b = LP.planLayout(withLayout(mock({ questions: [long] }),
      { layoutMode: "compact-exam", answerSheetMode: "current", layoutSeed: "C4-" + i }), {});
    assert(b.sections[0].questions[0].choiceColumns <= 2, "長い選択肢が 4 段になった");
  }
  assert(saw4, "短い選択肢で 4 段が一度も出なかった");
  /* 4 段を許していない紙面では出ない */
  for (let i = 0; i < 20; i++) {
    const p = LP.planLayout(withLayout(mock({ questions: [short] }),
      { layoutMode: "standard-exam", answerSheetMode: "current", layoutSeed: "C4S-" + i }), {});
    assert(p.sections[0].questions[0].choiceColumns <= 2, "標準の紙面で 4 段になった");
  }
});

/* ══════════════════════════════════════════════════════════════════ */
group("N. 増やした解答用紙");

function sheetOf(mode, questions, seed) {
  const m = withLayout(mock({ questions }), { layoutMode: "standard-exam", answerSheetMode: mode,
                                              layoutSeed: seed || "AS" });
  const plan = LP.planLayout(m, {});
  return { m, sheet: plan.answerSheet, profile: LP.getProfile(plan.answerSheetProfileId) };
}
function gridCells(grid) {
  const kinds = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
  return (grid.blocks || []).flatMap((b) => b.rows).flatMap((r) => r.cells)
    .filter((c) => kinds.indexOf(c.type) >= 0);
}

test("どの解答用紙でも、欄の数が設問の数と一致する", () => {
  const qs = mixedQuestions();
  ANSWER_MODES.forEach((am) => {
    for (let i = 0; i < 5; i++) {
      const { m, sheet, profile } = sheetOf(am.id, qs, "N" + i);
      assertEq(sheet.cellCount, qs.length, am.id);
      assertEq(LP.errorsOf(LP.validateAnswerSheet(m, sheet)).length, 0,
        am.id + "：" + JSON.stringify(LP.errorsOf(LP.validateAnswerSheet(m, sheet)).slice(0, 3)));
      if (sheet.grid) {
        assertEq(gridCells(sheet.grid).length, qs.length, am.id + " のグリッドの欄の数");
        assertEq(LP.errorsOf(LP.validateAnswerGrid(m, sheet.grid, profile)).length, 0, am.id);
      }
    }
  });
});

test("英語の解答用紙では、短答が連続マスになる", () => {
  const { sheet, profile } = sheetOf("english-boxes",
    [q({ type: "short_answer", choices: [], correctAnswer: "apple" })], "EN1");
  const cells = gridCells(sheet.grid);
  assertEq(cells[0].type, "box-sequence", "連続マスになっていない");
  assertEq(cells[0].cells, profile.boxSequenceDefaultCount, "マスの数が既定と違う");
  /* ほかの解答用紙では、これまでどおり横長の欄のまま */
  const other = sheetOf("grid-standard", [q({ type: "short_answer", choices: [], correctAnswer: "apple" })], "EN1");
  assertEq(gridCells(other.sheet.grid)[0].type, "wide-answer");
});

test("数学の解答用紙では、数値・数式が計算欄（背の高い罫線欄）になる", () => {
  const { sheet } = sheetOf("math-work", [
    q({ type: "numeric", choices: [], correctAnswer: "12" }),
    q({ type: "formula", choices: [], correctAnswer: "x=1" })
  ], "MW1");
  const cells = gridCells(sheet.grid);
  assertDeep(cells.map((c) => c.type), ["lined-answer", "lined-answer"]);
  cells.forEach((c) => assert(c.heightMm >= 16, "計算欄の高さが足りない: " + c.heightMm));
  /* 標準の解答用紙では、数値は横長の 1 行のまま */
  const other = sheetOf("grid-standard", [q({ type: "numeric", choices: [], correctAnswer: "12" })], "MW1");
  assertEq(gridCells(other.sheet.grid)[0].type, "wide-answer");
});

test("記述欄重視は、標準よりも記述の面積が大きい", () => {
  const qs = [q({ type: "long_answer", choices: [], correctAnswer: "x" })];
  const area = (mode) => {
    const c = gridCells(sheetOf(mode, qs, "WR").sheet.grid)[0];
    return (c.widthMm == null ? 150 : c.widthMm) * c.heightMm * (c.rows || 1);
  };
  assert(area("written-heavy") > area("grid-standard"), "記述欄重視のほうが狭い");
  assert(area("grid-standard") > area("mark-sheet"), "マーク中心のほうが記述を広く取っている");
});

test("マーク中心は「記述は最小限」と正直に書いてある", () => {
  const p = LP.getProfile("school-answer-mark");
  ["long_answer", "essay", "english_writing"].forEach((t) => {
    assert(p.unsupportedQuestionTypes[t], t + " について何も書いていない");
  });
  /* それでも欄そのものは作る（欄が無いと採点できないため） */
  const { m, sheet } = sheetOf("mark-sheet", [q({ type: "essay", choices: [], correctAnswer: "x" })], "MK");
  assertEq(sheet.cellCount, 1);
  assertEq(LP.errorsOf(LP.validateAnswerSheet(m, sheet)).length, 0);
});

test("解答用紙を変えても、番号・対応・配点は変わらない", () => {
  const qs = [q({ points: 4 }), q({ type: "short_answer", choices: [], correctAnswer: "x", points: 6 }),
              q({ type: "essay", choices: [], correctAnswer: "x", points: 20 })];
  const sig = (mode) => JSON.stringify(
    sheetOf(mode, qs, "P1").sheet.sections.flatMap((s) => s.rows)
      .map((r) => [r.questionId, r.answerBindingId, r.number, r.points]));
  const base = sig("grid-dense");
  ANSWER_MODES.forEach((am) => assertEq(sig(am.id), base, am.id + " で対応が変わった"));
});

/* ══════════════════════════════════════════════════════════════════ */
group("O. 自動レイアウト推奨（§42）");

function ids(rec) { return rec.candidates.map((c) => c.modeId); }

test("英単語 50 問 → 語彙（表）・2 カラム・高密度が候補に出る", () => {
  const rec = LP.recommendLayouts({ questionCount: 50, subject: "英語",
    typeCounts: { short_answer: 40, multiple_choice_single: 10 }, avgPromptChars: 12 });
  const top = ids(rec);
  ["vocabulary-test", "two-column", "compact-exam"].forEach((id) => {
    assert(top.indexOf(id) >= 0, id + " が候補に出ない: " + top.join(","));
  });
});

test("記述中心の数学 → 数学・授業プリントが候補に出る", () => {
  const rec = LP.recommendLayouts({ questionCount: 8, subject: "数学",
    typeCounts: { formula: 4, numeric: 2, long_answer: 2 }, avgPromptChars: 40 });
  const top = ids(rec);
  assertEq(top[0], "math-test", "数学がいちばんに出ない: " + top.join(","));
  assert(top.indexOf("spacious-worksheet") >= 0, "授業プリントが候補に出ない: " + top.join(","));
  /* 解答用紙も計算欄つきを勧める */
  assertEq(rec.answerCandidates[0].modeId, "math-work");
});

test("長文と資料の試験 → 入試・模試風と資料読解が候補に出る", () => {
  const rec = LP.recommendLayouts({ questionCount: 12,
    typeCounts: { source_analysis: 5, long_answer: 4, multiple_choice_single: 3 },
    avgPromptChars: 260, longPromptCount: 9 });
  const top = ids(rec);
  ["entrance-exam", "source-based-exam"].forEach((id) => {
    assert(top.indexOf(id) >= 0, id + " が候補に出ない: " + top.join(","));
  });
});

test("MockSpec からそのまま読める（形式・図表・設問文の長さを数える）", () => {
  const m = mock({ questions: [
    q({ contentBlocks: [figure(), figure({ caption: "図2" })] }),
    q({ type: "long_answer", choices: [], correctAnswer: "x",
        prompt: "あ".repeat(200) }),
    q({ contentBlocks: [figure({ caption: "図3" })] })
  ]});
  const c = LP.summarizeComposition(m);
  assertEq(c.total, 3);
  assertEq(c.figureCount, 3);
  assertEq(c.typeCounts.long_answer, 1);
  assert(c.longPromptCount >= 1, "長い設問文を数えていない");
  const rec = LP.recommendLayouts(m);
  assert(rec.candidates.length >= 1, "候補が出ない");
  assert(rec.candidates.some((x) => x.profileId === "school-science-figure-classic"),
    "図表が多いのに図表重視が出ない: " + ids(rec).join(","));
});

test("推奨しても、問題も設定も 1 つも書き換えない", () => {
  const m = mock({ questions: mixedQuestions() });
  const before = JSON.stringify(m);
  LP.recommendLayouts(m);
  LP.recommendLayouts(m, { limit: 12 });
  assertEq(JSON.stringify(m), before, "推奨で MockSpec が変わった");
  assertEq(m.layout, undefined, "推奨が勝手に紙面を決めた");
});

test("候補には理由が付き、準備中のものには注意書きが付く", () => {
  const rec = LP.recommendLayouts({ questionCount: 50, subject: "英語",
    typeCounts: { short_answer: 40, multiple_choice_single: 10 }, avgPromptChars: 12 }, { limit: 12 });
  rec.candidates.forEach((c) => {
    assert(c.reasons.length >= 1, c.modeId + " に理由が無い");
    c.reasons.forEach((r) => assert(String(r).length >= 10, c.modeId + " の理由が短い"));
    if (c.ready) assertEq(c.caveats.length, 0, c.modeId + " に不要な注意書き");
    else assert(c.caveats.length >= 1 && c.caveats[0].indexOf("現在の形式") >= 0,
      c.modeId + " の注意書きが無い: " + JSON.stringify(c.caveats));
  });
  const vocab = rec.candidates.filter((c) => c.modeId === "vocabulary-test")[0];
  assertEq(vocab.ready, false, "前提が変わった（語彙が組めるようになったならテストも直す）");
});

test("同じ入力なら、同じ順序で返る（決定論）", () => {
  const input = { questionCount: 30, typeCounts: { multiple_choice_single: 25, essay: 5 } };
  assertEq(JSON.stringify(LP.recommendLayouts(input)), JSON.stringify(LP.recommendLayouts(input)));
});

test("候補は必ず実在の紙面で、画面受験は紙の候補に出ない", () => {
  const inputs = [
    { questionCount: 50, typeCounts: { short_answer: 50 } },
    { questionCount: 8, typeCounts: { formula: 8 }, subject: "数学" },
    { questionCount: 12, typeCounts: { source_analysis: 12 }, avgPromptChars: 300 },
    { questionCount: 60, typeCounts: { multiple_choice_single: 60 } },
    { questionCount: 3, typeCounts: { essay: 3 } }
  ];
  inputs.forEach((input) => {
    const rec = LP.recommendLayouts(input, { limit: 12 });
    rec.candidates.forEach((c) => {
      assert(LP.getProfile(c.profileId), "知らない紙面を勧めた: " + c.profileId);
      assertEq(LP.getProfile(c.profileId).documentType, "question-paper", c.profileId);
      assertEq(c.printable, true, "紙でないものを紙の候補に出した: " + c.modeId);
    });
    rec.answerCandidates.forEach((c) => {
      assertEq(LP.getProfile(c.profileId).documentType, "answer-sheet", c.profileId);
    });
  });
});

process.exit(report("§39 レイアウト 12 種 ＋ §42 推奨") ? 1 : 0);
