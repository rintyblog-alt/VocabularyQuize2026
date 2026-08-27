/* ══════════════════════════════════════════════════════════════════════
   採点エンジンの単体テスト（Quiz 採点 / Mock 採点 / Result 集計）
   ══════════════════════════════════════════════════════════════════════ */
import {
  installLocalStorage, installLocation, loadV2,
  group, test, assert, assertEq, assertDeep, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js", "domain/grading.js"
]);
const S = VQ2.schema, G = VQ2.grading;

function q(o) {
  return Object.assign({
    id: "q1", type: "multiple_choice_single", prompt: "問", points: 10,
    choices: [
      { id: "a", text: "正", isCorrect: true },
      { id: "b", text: "誤1", isCorrect: false },
      { id: "c", text: "誤2", isCorrect: false }
    ]
  }, o || {});
}

/* ══════════════════════════════════════════════════════════════════ */
group("1. 答案の正規化");

test("全角英数を半角に揃える", () => {
  assertEq(G.normalizeAnswer("ＡＢＣ１２３"), "abc123");
});
test("全角空白を半角にして詰める", () => {
  assertEq(G.normalizeAnswer("　あ　い　"), "あ い");
});
test("大小文字を無視する", () => {
  assertEq(G.normalizeAnswer("Tokyo"), G.normalizeAnswer("TOKYO"));
});
test("句読点を無視する設定が効く", () => {
  assertEq(G.normalizeAnswer("東京、大阪。", { ignorePunctuation: true }), "東京大阪");
});
test("空白を完全に無視する設定が効く", () => {
  assertEq(G.normalizeAnswer("a b c", { ignoreSpace: true }), "abc");
});
test("数値を文中から取り出せる", () => {
  assertEq(G.parseNumber("約 3,000 円"), 3000);
  assertEq(G.parseNumber("−12.5"), -12.5);
  assertEq(G.parseNumber("数値なし"), null);
});

/* ══════════════════════════════════════════════════════════════════ */
group("2. 決定論的採点：単一選択・正誤");

test("正解を選べば満点", () => {
  const r = G.gradeDeterministic(q(), { choiceId: "a" });
  assertEq(r.correct, true); assertEq(r.score, 10);
});
test("不正解なら 0 点", () => {
  const r = G.gradeDeterministic(q(), { choiceId: "b" });
  assertEq(r.correct, false); assertEq(r.score, 0);
});
test("文字列そのままの回答も受け付ける", () => {
  assertEq(G.gradeDeterministic(q(), "a").correct, true);
});
test("正誤問題を採点できる", () => {
  const tf = q({ type: "true_false", choices: [
    { id: "t", text: "○", isCorrect: true }, { id: "f", text: "×", isCorrect: false }
  ]});
  assertEq(G.gradeDeterministic(tf, "t").correct, true);
  assertEq(G.gradeDeterministic(tf, "f").correct, false);
});

/* ══════════════════════════════════════════════════════════════════ */
group("3. 決定論的採点：複数選択（部分点）");

const multi = q({ type: "multiple_choice_multiple", points: 10, choices: [
  { id: "a", text: "正1", isCorrect: true },
  { id: "b", text: "正2", isCorrect: true },
  { id: "c", text: "誤1", isCorrect: false },
  { id: "d", text: "誤2", isCorrect: false }
]});

test("全部正しく選べば満点", () => {
  const r = G.gradeDeterministic(multi, ["a", "b"]);
  assertEq(r.correct, true); assertEq(r.score, 10);
});
test("片方だけなら半分の部分点", () => {
  const r = G.gradeDeterministic(multi, ["a"]);
  assertEq(r.correct, false); assertEq(r.score, 5); assertEq(r.detail.partial, true);
});
test("誤答を混ぜると減点される", () => {
  const r = G.gradeDeterministic(multi, ["a", "b", "c"]);
  assertEq(r.correct, false); assertEq(r.score, 5);
});
test("誤答だけなら 0 点（負にはならない）", () => {
  const r = G.gradeDeterministic(multi, ["c", "d"]);
  assertEq(r.score, 0);
});

/* ══════════════════════════════════════════════════════════════════ */
group("4. 決定論的採点：短答・数値・数式");

test("表記ゆれを吸収して正解にする", () => {
  const sa = q({ type: "short_answer", choices: [], correctAnswer: "大化の改新", acceptedAnswers: ["大化改新"] });
  assertEq(G.gradeDeterministic(sa, "大化の改新").correct, true);
  assertEq(G.gradeDeterministic(sa, " 大化改新 ").correct, true);
  assertEq(G.gradeDeterministic(sa, "壬申の乱").correct, false);
});
test("英単語の大小文字を無視する", () => {
  const sa = q({ type: "short_answer", choices: [], correctAnswer: "Meiji" });
  assertEq(G.gradeDeterministic(sa, "meiji").correct, true);
  assertEq(G.gradeDeterministic(sa, "ｍｅｉｊｉ").correct, true);
});
test("空の回答は不正解", () => {
  const sa = q({ type: "short_answer", choices: [], correctAnswer: "答" });
  assertEq(G.gradeDeterministic(sa, "   ").correct, false);
});
test("数値問題を許容誤差つきで採点できる", () => {
  const n = q({ type: "numeric", choices: [], correctAnswer: "3.14", tolerance: 0.01 });
  assertEq(G.gradeDeterministic(n, "3.14").correct, true);
  assertEq(G.gradeDeterministic(n, "3.145").correct, true);
  assertEq(G.gradeDeterministic(n, "3.2").correct, false);
});
test("誤差指定が無ければ完全一致のみ", () => {
  const n = q({ type: "numeric", choices: [], correctAnswer: "100" });
  assertEq(G.gradeDeterministic(n, "100").correct, true);
  assertEq(G.gradeDeterministic(n, "100.1").correct, false);
});
test("数値でない回答を数値問題の正解にしない", () => {
  const n = q({ type: "numeric", choices: [], correctAnswer: "5" });
  assertEq(G.gradeDeterministic(n, "たくさん").correct, false);
});
test("数式は定義済みの同値表現とだけ照合する", () => {
  const f = q({ type: "formula", choices: [], correctAnswer: "2x+1", acceptedAnswers: ["1+2x"] });
  assertEq(G.gradeDeterministic(f, "2x + 1").correct, true);
  assertEq(G.gradeDeterministic(f, "1 + 2x").correct, true);
  assertEq(G.gradeDeterministic(f, "2(x)+1").correct, false, "未定義の表現を正解にした");
});

/* ══════════════════════════════════════════════════════════════════ */
group("5. 決定論的採点：空欄補充・並び替え・組み合わせ");

test("空欄ごとの部分点を出す", () => {
  const fb = q({ type: "fill_blank", points: 6, choices: [], blanks: [
    { answer: "645" }, { answer: "中大兄皇子", acceptedAnswers: ["天智天皇"] }, { answer: "蘇我" }
  ]});
  assertEq(G.gradeDeterministic(fb, ["645", "天智天皇", "藤原"]).score, 4);
  assertEq(G.gradeDeterministic(fb, ["645", "中大兄皇子", "蘇我"]).correct, true);
});
test("並び替えは位置一致数で部分点を出す", () => {
  const o = q({ type: "ordering", points: 8, choices: [], correctAnswer: ["a", "b", "c", "d"] });
  assertEq(G.gradeDeterministic(o, ["a", "b", "c", "d"]).correct, true);
  assertEq(G.gradeDeterministic(o, ["a", "b", "d", "c"]).score, 4);
  assertEq(G.gradeDeterministic(o, ["d", "c", "b", "a"]).score, 0);
});
test("組み合わせは対応の一致数で部分点を出す", () => {
  const m = q({ type: "matching", points: 9, choices: [], correctAnswer: { l1: "r1", l2: "r2", l3: "r3" } });
  assertEq(G.gradeDeterministic(m, { l1: "r1", l2: "r2", l3: "r3" }).correct, true);
  assertEq(G.gradeDeterministic(m, { l1: "r1", l2: "r3", l3: "r2" }).score, 3);
});

/* ══════════════════════════════════════════════════════════════════ */
group("6. 未回答の判定");

test("空文字・空配列・null・空オブジェクトはすべて未回答", () => {
  [null, undefined, "", "   ", [], {}, { text: "" }, [""], [null]].forEach((v) => {
    assert(G.isUnanswered(v), "未回答と判定されなかった: " + JSON.stringify(v));
  });
});
test("0 という回答は未回答ではない", () => {
  assertEq(G.isUnanswered("0"), false);
  assertEq(G.isUnanswered({ text: "0" }), false);
});
test("選択済みは未回答ではない", () => {
  assertEq(G.isUnanswered({ choiceId: "a" }), false);
  assertEq(G.isUnanswered(["a"]), false);
});

/* ══════════════════════════════════════════════════════════════════ */
group("7. セッション採点");

const qs = [
  q({ id: "q1", points: 10 }),
  q({ id: "q2", points: 10 }),
  q({ id: "q3", type: "short_answer", choices: [], correctAnswer: "答", points: 10 }),
  q({ id: "q4", type: "long_answer", choices: [], points: 20,
      scoringRubric: { items: [
        { id: "r1", description: "根拠を挙げている", points: 10, criterionId: "thinking_judgment_expression" },
        { id: "r2", description: "用語が正しい", points: 10, criterionId: "knowledge_skill" }
      ]}})
];

test("客観問題だけで採点が確定し、記述は保留になる", () => {
  const r = G.gradeSession(qs, [
    { questionId: "q1", value: "a" },
    { questionId: "q2", value: "b" },
    { questionId: "q3", value: "答" }
    /* q4 未回答 */
  ]);
  assertEq(r.deterministicScore, 20);
  assertEq(r.totalMax, 50);
  assertEq(r.correctCount, 2);
  assertEq(r.wrongCount, 1);
  assertEq(r.unansweredCount, 1);
  assertEq(r.pendingCount, 0, "未回答の記述を AI 採点へ回した");
  assertEq(r.complete, true);
});

test("記述に回答があれば AI 採点へ回す（コードで点をつけない）", () => {
  const r = G.gradeSession(qs, [
    { questionId: "q1", value: "a" },
    { questionId: "q4", value: "記述の回答です" }
  ]);
  assertEq(r.pendingCount, 1);
  assertEq(r.complete, false);
  const it = r.items.find((i) => i.questionId === "q4");
  assertEq(it.score, null, "AI 採点前なのに点がついている");
  assertEq(it.requiresReview, true);
});

test("回答時間・変更回数・後で確認が保持される", () => {
  const r = G.gradeSession(qs, [
    { questionId: "q1", value: "a", timeMs: 12000, changeCount: 2, flagged: true }
  ]);
  const it = r.items.find((i) => i.questionId === "q1");
  assertEq(it.timeMs, 12000); assertEq(it.changeCount, 2); assertEq(it.flagged, true);
});

/* ══════════════════════════════════════════════════════════════════ */
group("8. AI 補助採点の取り込み");

const essayQ = qs[3];

test("Rubric の内訳合計を得点として採用する（AI の合計を信用しない）", () => {
  const r = G.applyAiGrade(null, essayQ, {
    score: 999,                                    /* でたらめな合計 */
    rubricBreakdown: [
      { rubricItemId: "r1", awarded: 8, reason: "根拠が2つ" },
      { rubricItemId: "r2", awarded: 6, reason: "用語に誤り1" }
    ],
    confidence: 0.9, scoringReason: "…"
  });
  assertEq(r.score, 14);
  assert(r.adjustments.length > 0, "食い違いを黙って通した");
});

test("配点上限を超える採点を補正する", () => {
  const r = G.applyAiGrade(null, essayQ, {
    rubricBreakdown: [{ rubricItemId: "r1", awarded: 50 }, { rubricItemId: "r2", awarded: 0 }],
    confidence: 0.9
  });
  assertEq(r.score, 10);
  assert(r.adjustments.some((a) => a.includes("上限")), JSON.stringify(r.adjustments));
});

test("低信頼の採点は自動確定しない", () => {
  const r = G.applyAiGrade(null, essayQ, {
    rubricBreakdown: [{ rubricItemId: "r1", awarded: 10 }, { rubricItemId: "r2", awarded: 10 }],
    confidence: 0.4
  });
  assertEq(r.requiresReview, true);
  assertEq(r.autoConfirmed, false);
});

test("高信頼で内訳が整合していれば自動確定する", () => {
  const r = G.applyAiGrade(null, essayQ, {
    score: 20,
    rubricBreakdown: [{ rubricItemId: "r1", awarded: 10 }, { rubricItemId: "r2", awarded: 10 }],
    confidence: 0.95
  });
  assertEq(r.score, 20);
  assertEq(r.autoConfirmed, true);
});

test("AI が requiresReview を立てたら尊重する", () => {
  const r = G.applyAiGrade(null, essayQ, {
    rubricBreakdown: [{ rubricItemId: "r1", awarded: 10 }, { rubricItemId: "r2", awarded: 10 }],
    confidence: 0.99, requiresReview: true
  });
  assertEq(r.requiresReview, true);
});

test("採点根拠と不足要素が構造化されて残る", () => {
  const r = G.applyAiGrade(null, essayQ, {
    rubricBreakdown: [{ rubricItemId: "r1", awarded: 5, reason: "根拠が1つのみ" }],
    scoringReason: "根拠の数が足りません", missingElements: ["史料からの引用"],
    strengths: ["用語は正確"], confidence: 0.8
  });
  assertEq(r.scoringReason, "根拠の数が足りません");
  assertDeep(r.missingElements, ["史料からの引用"]);
  assertEq(r.rubricBreakdown[0].reason, "根拠が1つのみ");
});

test("得点の手直しは履歴を残す", () => {
  const item = { questionId: "q4", score: 10, maxScore: 20, requiresReview: true };
  G.overrideScore(item, 16, "根拠として認められる記述があった", "user");
  assertEq(item.score, 16);
  assertEq(item.requiresReview, false);
  assertEq(item.overridden, true);
  assertEq(item.history.length, 1);
  assertEq(item.history[0].from, 10);
  assertEq(item.history[0].to, 16);
});

test("手直しでも配点の範囲を超えない", () => {
  const item = { questionId: "q4", score: 10, maxScore: 20 };
  G.overrideScore(item, 999);
  assertEq(item.score, 20);
  G.overrideScore(item, -5);
  assertEq(item.score, 0);
});

/* ══════════════════════════════════════════════════════════════════ */
group("9. 集計");

test("観点別が配点比で按分される", () => {
  const questions = [
    q({ id: "q1", points: 10, criterionAllocation: [
      { criterionId: "knowledge_skill", points: 10 },
      { criterionId: "thinking_judgment_expression", points: 0 }]}),
    q({ id: "q2", points: 20, criterionAllocation: [
      { criterionId: "knowledge_skill", points: 5 },
      { criterionId: "thinking_judgment_expression", points: 15 }]})
  ];
  const items = [
    { questionId: "q1", answered: true, correct: true, score: 10, maxScore: 10 },
    { questionId: "q2", answered: true, correct: false, score: 10, maxScore: 20 }   /* 50% */
  ];
  const agg = G.aggregate(questions, items);
  assertEq(agg.byCriterion.knowledge_skill.max, 15);
  assertEq(agg.byCriterion.knowledge_skill.score, 12.5);          /* 10 + 5*0.5 */
  assertEq(agg.byCriterion.thinking_judgment_expression.max, 15);
  assertEq(agg.byCriterion.thinking_judgment_expression.score, 7.5);
});

test("単元別・形式別・難易度別に分かれる", () => {
  const questions = [
    q({ id: "q1", topic: "古代", difficulty: "easy", points: 10 }),
    q({ id: "q2", topic: "古代", difficulty: "hard", points: 10 }),
    q({ id: "q3", topic: "中世", difficulty: "hard", type: "short_answer", choices: [], points: 10 })
  ];
  const items = [
    { questionId: "q1", answered: true, correct: true, score: 10, maxScore: 10 },
    { questionId: "q2", answered: true, correct: false, score: 0, maxScore: 10 },
    { questionId: "q3", answered: false, correct: false, score: 0, maxScore: 10 }
  ];
  const agg = G.aggregate(questions, items);
  assertEq(agg.byTopic["古代"].count, 2);
  assertEq(agg.byTopic["古代"].rate, 0.5);
  assertEq(agg.byTopic["中世"].unanswered, 1);
  assertEq(agg.byDifficulty.hard.count, 2);
  assertEq(agg.byType.short_answer.count, 1);
  assertEq(agg.total.score, 10);
  assertEq(agg.total.max, 30);
});

test("観点別配点が無ければ観点の満点は 0（偽の内訳を作らない）", () => {
  const questions = [q({ id: "q1", points: 10 })];
  const items = [{ questionId: "q1", answered: true, correct: true, score: 10, maxScore: 10 }];
  const agg = G.aggregate(questions, items);
  assertEq(agg.byCriterion.knowledge_skill.max, 0);
  assertEq(agg.byCriterion.knowledge_skill.rate, null);
});

/* ══════════════════════════════════════════════════════════════════ */
group("10. 行動の観測（参考分析）");

test("時間をかけすぎた誤答と、早すぎた誤答を分けられる", () => {
  const items = [
    { questionId: "q1", answered: true, correct: true, timeMs: 30000 },
    { questionId: "q2", answered: true, correct: true, timeMs: 30000 },
    { questionId: "q3", answered: true, correct: false, timeMs: 120000 },  /* 中央値の4倍 */
    { questionId: "q4", answered: true, correct: false, timeMs: 5000 }     /* 中央値の1/6 */
  ];
  const b = G.behaviorSignals([], items);
  assertEq(b.slowAndWrong.length, 1);
  assertEq(b.slowAndWrong[0].questionId, "q3");
  assertEq(b.fastAndWrong.length, 1);
  assertEq(b.fastAndWrong[0].questionId, "q4");
});

test("回答変更と未回答が記録される", () => {
  const items = [
    { questionId: "q1", answered: true, correct: false, changeCount: 3, timeMs: 1000 },
    { questionId: "q2", answered: false, correct: false, timeMs: 0 }
  ];
  const b = G.behaviorSignals([], items);
  assertEq(b.answerChanged.length, 1);
  assertEq(b.answerChanged[0].changeCount, 3);
  assertDeep(b.unanswered, ["q2"]);
});

test("態度を得点化していない（注記が必ず付く）", () => {
  const b = G.behaviorSignals([], []);
  assert(b.note.includes("学習態度の評価ではありません"), b.note);
  assertEq(b.score, undefined, "態度に点をつけている");
});


/* ══════════════════════════════════════════════════════════════════════
   採点基準（Rubric）— これが無いと AI 採点そのものが行われない
   ══════════════════════════════════════════════════════════════════════ */
group("採点基準の下敷き");

test("記述の既定基準は合計が配点とぴったり一致する", () => {
  [1, 3, 5, 8, 10, 12, 20, 50].forEach((p) => {
    ["long_answer", "essay", "english_writing", "source_analysis"].forEach((t) => {
      const r = S.defaultRubric(t, p);
      const sum = r.items.reduce((a, x) => a + x.points, 0);
      assertEq(sum, p, t + " / " + p + " 点で合計 " + sum);
      assert(r.items.length >= 1, "基準が空");
      r.items.forEach((x) => {
        assert(x.description.length > 0, "説明が空");
        assert(x.points >= 0, "配点が負");
        assert(["knowledge_skill", "thinking_judgment_expression"].indexOf(x.criterionId) >= 0, "観点が不正");
      });
    });
  });
});

test("配点 1 点でも基準を作れる（項目を減らして合わせる）", () => {
  const r = S.defaultRubric("essay", 1);
  assertEq(r.items.reduce((a, x) => a + x.points, 0), 1);
});

test("配点を変えても比率を保って合計を合わせ直す", () => {
  const base = S.defaultRubric("essay", 10);
  const re = S.rescaleRubric(base, 25);
  assertEq(re.items.reduce((a, x) => a + x.points, 0), 25);
  assertEq(re.items.length, base.items.length);
  assert(re.items[0].points >= re.items[2].points, "比率が逆転した");
});

test("既定の基準を付けた記述問題は保存時に弾かれない", () => {
  const V = VQ2.validate;
  const question = {
    id: "q1", schemaVersion: 2, type: "long_answer", prompt: "説明しなさい",
    choices: [], correctAnswer: "", acceptedAnswers: [], explanation: "",
    difficulty: "normal", topic: "", tags: [], points: 6,
    scoringRubric: S.defaultRubric("long_answer", 6),
    estimatedSeconds: 300, sourceReferences: [], requiresReview: false,
    validationIssues: [], createdBy: "ai"
  };
  const issues = V.validatePresetForSave({
    id: "p1", schemaVersion: 2, name: "T", description: "", visibility: "private",
    questions: [question], settings: {}
  }, {});
  const rubricErr = issues.filter((i) => i.severity === "error" && /Rubric|採点基準/.test(i.message));
  assertDeep(rubricErr, [], JSON.stringify(rubricErr));
});

test("採点基準があれば AI 採点の内訳が得点になる（AI の合計は信用しない）", () => {
  const question = q({
    type: "long_answer", points: 6, choices: [],
    scoringRubric: S.defaultRubric("long_answer", 6)
  });
  const ids = question.scoringRubric.items.map((r) => r.id);
  const applied = G.applyAiGrade({ maxScore: 6 }, question, {
    score: 6,                                   /* AI は満点と言っている */
    rubricBreakdown: [
      { rubricItemId: ids[0], awarded: 2, reason: "内容は触れている" },
      { rubricItemId: ids[1], awarded: 0, reason: "根拠が無い" }
    ],
    confidence: 0.9, scoringReason: "根拠が示されていない"
  });
  assertEq(applied.score, 2, "内訳の合計ではなく AI の合計を採用している");
  assertEq(applied.correct, false);
  assert(applied.adjustments.length > 0, "食い違いを伝えていない");
});

test("採点基準の配点上限を超えた採点は補正され、確認が必要になる", () => {
  const question = q({ type: "essay", points: 10, choices: [], scoringRubric: S.defaultRubric("essay", 10) });
  const ids = question.scoringRubric.items.map((r) => r.id);
  const cap = question.scoringRubric.items[0].points;
  const applied = G.applyAiGrade({ maxScore: 10 }, question, {
    score: 99,
    rubricBreakdown: [{ rubricItemId: ids[0], awarded: 999, reason: "満点" }],
    confidence: 0.95
  });
  assertEq(applied.score, cap, "上限で止めていない");
  assertEq(applied.requiresReview, true, "補正したのに確認を求めていない");
});

process.exit(report("採点エンジン") > 0 ? 1 : 0);
