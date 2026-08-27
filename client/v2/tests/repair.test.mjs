/* ══════════════════════════════════════════════════════════════════════
   検証エラーの AI 修復

   A. 検証結果   … error / warning / info への分類と各項目の中身
   B. コード別   … 触ってよいフィールドの限定
   C. 自動修復   … AI を呼ばずに直せるもの
   D. 補充       … 不足問題・欠番
   E. 全体制約   … 生成中の追加指示の遡及確認
   F. 保護       … 対象外の変更を拒否する
   G. ループ     … 最大 3 回で止まる
   H. 仕様の 12 ケース

   実行: node client/v2/tests/repair.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, assertDeep, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/repair.js",
  "domain/flags.js", "domain/store.js"
]);
const S = VQ2.schema, V = VQ2.validate, D = VQ2.draft, R = VQ2.repair;

/* ── 見本 ───────────────────────────────────────────────────────── */
let seq = 0;
function q(over) {
  seq++;
  const n = seq;
  return Object.assign({
    id: "q_" + n, schemaVersion: 2, questionNumber: n,
    type: "multiple_choice_single",
    prompt: "設問 " + n + " の問題文です。",
    explanation: "設問 " + n + " の解説です。ここに理由を書きます。",
    points: 1,
    choices: [
      { id: "c1", label: "A", text: "選択肢その一" + n, explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢その二" + n, explanation: "", isCorrect: false },
      { id: "c3", label: "C", text: "選択肢その三" + n, explanation: "", isCorrect: false },
      { id: "c4", label: "D", text: "選択肢その四" + n, explanation: "", isCorrect: false }
    ],
    correctAnswer: null, acceptedAnswers: [],
    difficulty: "normal", topic: "単元" + n, tags: [], estimatedSeconds: 60,
    sourceReferences: [], requiresReview: false, validationIssues: []
  }, over || {});
}
function preset(qs, over) {
  seq = 0;
  return Object.assign({
    id: "p_1", schemaVersion: 2, name: "テストプリセット",
    description: "範囲：第1章", ownerId: "u1",
    createdAt: "2026-07-01T00:00:00.000Z", createdBy: "u1",
    visibility: "private",
    questions: qs || [q(), q(), q()]
  }, over || {});
}
function nQ(n, f) {
  seq = 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(f ? f(q(), i) : q());
  return out;
}
const codesOf = (issues) => issues.map((i) => i.code);
const withCode = (issues, code) => issues.filter((i) => i.code === code);

/* ══════════════════════════════════════════════════════════════════ */
group("A. 検証結果");

test("error / warning / info に分かれる", () => {
  const p = preset([
    q({ prompt: "" }),                                    /* error */
    q({ explanation: "" }),                               /* info */
    q()
  ]);
  const issues = R.auditPreset(p, {});
  assert(R.bySeverity(issues, "error").length >= 1, "error がある");
  assert(R.bySeverity(issues, "info").length >= 1, "info がある");
  assertEq(withCode(issues, "missing_question_text").length, 1);
  assertEq(withCode(issues, "missing_explanation").length, 1);
});

test("各項目に必要な情報がそろっている", () => {
  const p = preset([q({ prompt: "" })]);
  const i = withCode(R.auditPreset(p, {}), "missing_question_text")[0];
  assertEq(i.questionId, "q_1", "対象問題 ID");
  assertEq(i.questionNumber, 1, "対象問題番号");
  assertEq(i.code, "missing_question_text", "エラーコード");
  assert(/[ぁ-んァ-ン一-龥]/.test(i.message), "日本語の説明: " + i.message);
  assertEq(i.aiRepairable, true, "AI 修復できるか");
  assertEq(i.manualOnly, false, "手動が必要か");
  assertDeep(i.fields, ["prompt"], "触ってよいフィールド");
  assert(typeof i.hint === "string" && i.hint.length > 0, "直し方の説明");
});

test("該当部分（抜粋）が入る", () => {
  const p = preset([q({ explanation: "" })]);
  const i = withCode(R.auditPreset(p, {}), "missing_explanation")[0];
  assert(i.excerpt.indexOf("設問 1") >= 0, i.excerpt);
});

test("直し方の無いものは manualOnly になる（黙って隠さない）", () => {
  const p = preset([q({ choices: [
    { id: "c1", text: "", isCorrect: true },
    { id: "c2", text: "い", isCorrect: false }
  ] })]);
  const issues = R.auditPreset(p, {});
  const empty = withCode(issues, "emptyChoice");
  assert(empty.length >= 1, "選択肢が空 のエラーが出る");
  assertEq(empty[0].manualOnly, true);
  assert(empty[0].hint.length > 0, "手当ての説明がある");
});

test("問題ごとにまとめられる", () => {
  const p = preset([q({ prompt: "", explanation: "" }), q()]);
  const g = R.groupByQuestion(R.auditPreset(p, {}));
  const first = g.filter((x) => x.questionId === "q_1")[0];
  assert(!!first, "q_1 のまとまりがある");
  assert(first.issues.length >= 2, first.issues.length + " 件");
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. コード別の修復範囲");

test("14 種のコードすべてに修復方針がある", () => {
  const want = ["wrong_choice_count", "multiple_correct_choices", "correct_answer_missing",
    "invalid_correct_answer", "duplicate_question", "duplicate_question_id",
    "duplicate_question_number", "missing_question_number", "missing_question_text",
    "missing_explanation", "unsupported_claim", "foreign_character_mixed",
    "question_count_shortage", "answer_orphan"];
  want.forEach((c) => {
    assert(!!R.CODES[c], "コードがある: " + c);
    const plan = R.planFor(c);
    assert(plan.ai || plan.auto || plan.backfill, c + " に直し方がある");
  });
  assertEq(want.length, 14);
});

test("wrong_choice_count は選択肢だけ", () => {
  assertDeep(R.planFor("wrong_choice_count").fields, ["choices"]);
});

test("foreign_character_mixed は問題文・解説・選択肢だけ", () => {
  assertDeep(R.planFor("foreign_character_mixed").fields, ["prompt", "explanation", "choices"]);
});

test("duplicate_question_id は AI を呼ばない", () => {
  const plan = R.planFor("duplicate_question_id");
  assertEq(plan.ai, false);
  assertEq(plan.auto, true);
  assertDeep(plan.fields, []);
});

test("question_count_shortage は補充の扱い", () => {
  assertEq(R.planFor("question_count_shortage").backfill, true);
});

test("許すフィールドは複数のエラーの和になる", () => {
  const f = R.allowedFieldsFor([
    { fields: ["choices"] }, { fields: ["explanation"] }, { fields: ["choices"] }
  ]);
  assertDeep(f.sort(), ["choices", "explanation"]);
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. AI を呼ばない自動修復");

test("内部 ID の重複は発行し直す（内容は変えない）", () => {
  const a = q(), b = q();
  b.id = a.id;
  const p = preset([a, b]);
  const issues = R.auditPreset(p, {});
  assert(withCode(issues, "duplicate_question_id").length >= 1, "重複が見つかる");
  const r = R.autoRepair(p, issues);
  const ids = r.preset.questions.map((x) => x.id);
  assertEq(new Set(ids).size, 2, "ID が別々になる");
  assertEq(r.preset.questions[0].prompt, p.questions[0].prompt, "問題文は変わらない");
  assertEq(r.preset.questions[1].prompt, p.questions[1].prompt, "問題文は変わらない");
  assertEq(r.changes[0].kind, "reissueId");
});

test("問題番号の重複は付け直す", () => {
  const p = preset([q({ questionNumber: 1 }), q({ questionNumber: 1 }), q({ questionNumber: 3 })]);
  const issues = R.auditPreset(p, {});
  assert(withCode(issues, "duplicate_question_number").length >= 1);
  const r = R.autoRepair(p, issues);
  const nums = r.preset.questions.map((x) => x.questionNumber);
  assertEq(new Set(nums).size, 3, "番号が別々になる: " + nums.join(","));
});

test("番号が無い問題には番号を付ける", () => {
  const p = preset([q(), q({ questionNumber: null }), q()]);
  const issues = R.auditPreset(p, {});
  assert(withCode(issues, "missing_question_number").length === 1);
  const r = R.autoRepair(p, issues);
  r.preset.questions.forEach((x) => assert(x.questionNumber > 0, "番号がついた"));
});

test("自動修復のあとは、そのエラーが消える", () => {
  const a = q(), b = q();
  b.id = a.id;
  const p = preset([a, b]);
  const r = R.autoRepair(p, R.auditPreset(p, {}));
  assertEq(withCode(R.auditPreset(r.preset, {}), "duplicate_question_id").length, 0);
});

/* ══════════════════════════════════════════════════════════════════ */
group("D. 不足問題の補充");

test("不足数を出せる", () => {
  const p = preset(nQ(28));
  const plan = R.shortagePlan(p, { expectedCount: 30 });
  assertEq(plan.expected, 30);
  assertEq(plan.current, 28);
  assertEq(plan.missing, 2);
  assertEq(plan.canBackfill, true);
});

test("欠番を見つけられる", () => {
  const qs = nQ(20);
  qs.splice(16, 1);                               /* 17 番を抜く */
  const p = preset(qs);
  const plan = R.shortagePlan(p, { expectedCount: 20 });
  assertDeep(plan.gaps, [17], "欠番: " + plan.gaps.join(","));
  assertEq(plan.defaultMode, "fill-gaps");
});

test("欠番が無ければ末尾へ追加", () => {
  const p = preset(nQ(28));
  assertEq(R.shortagePlan(p, { expectedCount: 30 }).defaultMode, "append");
});

test("元の条件を引き継ぐ", () => {
  const p = preset(nQ(4, (x, i) => {
    x.difficulty = "hard";
    x.topic = "単元" + (i + 1);
    return x;
  }), { subject: "理科" });
  const cond = R.backfillConditions(p, { sourceOnly: true, exclude: ["第2章"] });
  assertEq(cond.subject, "理科");
  assertEq(cond.difficulty, "hard");
  assertEq(cond.type, "multiple_choice_single");
  assertEq(cond.choiceCount, 4);
  assertEq(cond.sourceOnly, true);
  assertDeep(cond.exclude, ["第2章"]);
  assertEq(cond.existingTopics.length, 4, "既存の論点を渡す");
  assert(cond.scope.indexOf("第1章") >= 0, "範囲: " + cond.scope);
});

test("補充の指示に既存の論点が入る（重複させないため）", () => {
  const p = preset(nQ(3));
  const plan = R.shortagePlan(p, { expectedCount: 5 });
  const req = R.buildBackfillRequest(p, plan, {});
  assertEq(req.count, 2);
  assert(req.instruction.indexOf("2 問だけ") >= 0, "数を明示");
  assert(req.instruction.indexOf("既存の問題は 1 問も変えない") >= 0, "既存を守る指示");
  assert(req.instruction.indexOf("単元1") >= 0, "既存の論点が入る");
});

test("既存と同じ内容の補充は受けない", () => {
  const p = preset(nQ(3));
  const plan = R.shortagePlan(p, { expectedCount: 5 });
  const req = R.buildBackfillRequest(p, plan, {});
  const r = R.screenBackfill(p, req, [
    { prompt: "設問 1 の問題文です。", type: "multiple_choice_single",
      choices: [{ id: "a", text: "あ", isCorrect: true }, { id: "b", text: "い", isCorrect: false }] },
    { prompt: "まったく新しい論点の問題です。", type: "multiple_choice_single",
      choices: [{ id: "a", text: "あ", isCorrect: true }, { id: "b", text: "い", isCorrect: false },
                { id: "c", text: "う", isCorrect: false }, { id: "d", text: "え", isCorrect: false }] }
  ]);
  assertEq(r.accepted.length, 1, "新しいものだけ受ける");
  assertEq(r.rejected[0].reason, "duplicate");
});

test("頼んだ数より多く返ってきたら切る", () => {
  const p = preset(nQ(3));
  const plan = R.shortagePlan(p, { expectedCount: 4 });
  const req = R.buildBackfillRequest(p, plan, {});
  const mk = (i) => ({ prompt: "新しい問題 " + i, type: "short_answer", correctAnswer: "答え" });
  const r = R.screenBackfill(p, req, [mk(1), mk(2), mk(3)]);
  assertEq(req.count, 1);
  assertEq(r.accepted.length, 1);
});

test("補充した問題の内部 ID は必ず新しく発行する", () => {
  const p = preset(nQ(3));
  const r = R.applyBackfill(p, [
    { id: "q_1", prompt: "新しい問題", type: "short_answer", correctAnswer: "答え" }
  ], { numberingMode: "append" });
  const added = r.preset.questions[3];
  assert(added.id !== "q_1", "AI が返した id を使わない: " + added.id);
  assertEq(new Set(r.preset.questions.map((x) => x.id)).size, 4);
  assertEq(added.questionNumber, 4, "末尾へ追加");
});

test("欠番を埋める指定なら、その番号に入る", () => {
  const qs = nQ(5);
  qs.splice(2, 1);                                /* 3 番を抜く */
  const p = preset(qs);
  const r = R.applyBackfill(p, [{ prompt: "補充した問題", type: "short_answer", correctAnswer: "答え" }],
                            { numberingMode: "fill-gaps" });
  const nums = r.preset.questions.map((x) => x.questionNumber);
  assertDeep(nums, [1, 2, 3, 4, 5], "欠番が埋まる: " + nums.join(","));
  const filled = r.preset.questions.filter((x) => x.questionNumber === 3)[0];
  assertEq(filled.prompt, "補充した問題");
});

test("補充しても既存の問題は 1 つも変わらない", () => {
  const p = preset(nQ(3));
  const before = JSON.stringify(p.questions);
  const r = R.applyBackfill(p, [{ prompt: "新問", type: "short_answer", correctAnswer: "答え" }],
                            { numberingMode: "append" });
  assertEq(JSON.stringify(r.preset.questions.slice(0, 3)), before);
  assertEq(JSON.stringify(p.questions), before, "元データも変わらない");
});

/* ══════════════════════════════════════════════════════════════════ */
group("E. 全体制約の遡及適用");

test("追加指示から全体制約を読み取る", () => {
  const g = R.globalConstraintsFrom([
    { text: "選択肢を6個にして" },
    { text: "全問の解説を詳しくして" },
    { text: "全問を選択問題にして" }
  ]);
  assertEq(g.constraints.choiceCount, 6);
  assertEq(g.constraints.explanationDetail, true);
  assertEq(g.constraints.typeAll, "multiple_choice_single");
  assertEq(g.sources.length, 3, "どの指示から来たかを残す");
});

test("全角の数字も読める", () => {
  assertEq(R.globalConstraintsFrom([{ text: "選択肢を５つにして" }]).constraints.choiceCount, 5);
});

test("読めない指示は制約にしない（作らない）", () => {
  const g = R.globalConstraintsFrom([{ text: "もっと面白くして" }]);
  assertDeep(Object.keys(g.constraints), []);
});

test("生成済みの問題へ効いているかを見る", () => {
  const p = preset(nQ(3));
  const v = R.checkGlobalConstraints(p, { choiceCount: 6 });
  assertEq(v.length, 3, "3 問とも 4 択なので違反");
  assertEq(v[0].code, "wrong_choice_count");
  assertDeep(v[0].fields, ["choices"]);
});

test("解説が短いままなら「詳しく」に反していると出す", () => {
  const p = preset([q({ explanation: "短い解説。" })]);
  const v = R.checkGlobalConstraints(p, { explanationDetail: true });
  assertEq(v.length, 1);
  assertEq(v[0].code, "missing_explanation");
});

test("違反は修復画面で扱える形になる", () => {
  const p = preset(nQ(2));
  const issues = R.globalIssuesToAudit(R.checkGlobalConstraints(p, { choiceCount: 6 }), "追加指示");
  assertEq(issues.length, 2);
  assertEq(issues[0].severity, "error");
  assertEq(issues[0].aiRepairable, true);
  assertEq(issues[0].fromGlobal, "追加指示");
});

test("生成完了前の確認がひととおり通る", () => {
  const p = preset(nQ(3));
  const r = R.preCompletionCheck(p, { expectedCount: 5, constraints: { choiceCount: 6 } });
  assertEq(r.summary.count, 3);
  assertEq(r.summary.expected, 5);
  assertEq(r.summary.numbersContiguous, true);
  assert(r.issues.some((i) => i.code === "question_count_shortage"), "問題数");
  assert(r.issues.some((i) => i.code === "wrong_choice_count"), "選択肢数");
});

test("番号がとびとびなら連続していないと出す", () => {
  const p = preset([q({ questionNumber: 1 }), q({ questionNumber: 5 })]);
  assertEq(R.preCompletionCheck(p, {}).summary.numbersContiguous, false);
});

/* ══════════════════════════════════════════════════════════════════ */
group("F. データ保護");

test("対象外の問題への提案は落とす", () => {
  const p = preset(nQ(3));
  const issues = withCode(R.auditPreset(p, { choiceCount: 5 }), "wrong_choice_count");
  const req = R.buildRepairRequest(p, [issues[0]]);
  assertDeep(req.questionIds, ["q_1"]);
  const r = R.screenRepairProposal(p, req, [
    { sourceId: "q_1", choices: five(true) },
    { sourceId: "q_2", choices: five(true) }
  ]);
  assertEq(r.accepted.length, 1);
  assertEq(r.rejected[0].reason, "outOfScope");
});

test("許していないフィールドの変更は落とす（現在の値のまま）", () => {
  const p = preset(nQ(1));
  const issues = withCode(R.auditPreset(p, { choiceCount: 5 }), "wrong_choice_count");
  const req = R.buildRepairRequest(p, issues);
  const r = R.screenRepairProposal(p, req, [
    { sourceId: "q_1", choices: five(true), prompt: "勝手に書き換えた問題文", explanation: "勝手な解説" }
  ]);
  assertEq(r.accepted.length, 1);
  assertDeep(r.accepted[0].touched, ["choices"], "選択肢だけが変わる");
  assertEq(r.accepted[0].question.prompt, p.questions[0].prompt, "問題文は元のまま");
  assertEq(r.accepted[0].question.explanation, p.questions[0].explanation, "解説も元のまま");
});

test("保護フィールドを書き換えようとしたら落とす", () => {
  const p = preset(nQ(1));
  const issues = withCode(R.auditPreset(p, { choiceCount: 5 }), "wrong_choice_count");
  const req = R.buildRepairRequest(p, issues);
  const r = R.screenRepairProposal(p, req, [
    { sourceId: "q_1", choices: five(true), questionNumber: 99 }
  ]);
  assertEq(r.accepted.length, 0);
  assertEq(r.rejected[0].reason, "protectedField");
});

test("正解が消える提案は落とす", () => {
  const p = preset(nQ(1));
  const issues = withCode(R.auditPreset(p, { choiceCount: 5 }), "wrong_choice_count");
  const req = R.buildRepairRequest(p, issues);
  const r = R.screenRepairProposal(p, req, [{ sourceId: "q_1", choices: five(false) }]);
  assertEq(r.accepted.length, 0);
  assertEq(r.rejected[0].reason, "lostCorrect");
});

test("対象外の問題が変わっていたら適用しない", () => {
  const p = preset(nQ(3));
  const after = JSON.parse(JSON.stringify(p.questions));
  after[2].prompt = "対象外なのに変わった";
  const v = R.verifyApplication(p.questions, after, ["q_1"]);
  assertEq(v.ok, false);
  assertEq(v.violations[0].questionId, "q_3");
});

test("問題が消えていたら適用しない", () => {
  const p = preset(nQ(3));
  const after = p.questions.slice(0, 2);
  const v = R.verifyApplication(p.questions, after, ["q_1", "q_2", "q_3"]);
  assertEq(v.ok, false);
  assert(v.violations.some((x) => x.message.indexOf("消えて") >= 0));
});

test("対象の問題だけが変わっていれば通る", () => {
  const p = preset(nQ(3));
  const after = JSON.parse(JSON.stringify(p.questions));
  after[0].explanation = "直した解説";
  assertEq(R.verifyApplication(p.questions, after, ["q_1"]).ok, true);
});

/* ══════════════════════════════════════════════════════════════════ */
group("G. 修復ループ");

test("最大 3 回で止まる", () => {
  const st = R.newLoopState();
  assertEq(st.maxRounds, 3);
  const bad = [{ severity: "error" }, { severity: "error" }];
  const less = [{ severity: "error" }];
  R.loopRecord(st, bad, less);                 /* 1 回目: 2 → 1 */
  assertEq(st.stopped, false);
  R.loopRecord(st, less, [{ severity: "error" }, { severity: "error" }].slice(0, 1));
  /* 2 回目: 1 → 1（減っていない）→ 止まる */
  assertEq(st.stopped, true);
  assertEq(st.stopReason, "noProgress");
});

test("3 回使い切ったら止まる", () => {
  const st = R.newLoopState();
  const a = [{ severity: "error" }, { severity: "error" }, { severity: "error" }];
  R.loopRecord(st, a, a.slice(0, 2));
  R.loopRecord(st, a.slice(0, 2), a.slice(0, 1));
  assertEq(st.stopped, false, "2 回目までは続く");
  R.loopRecord(st, a.slice(0, 1), a.slice(0, 1).map(() => ({ severity: "error" })));
  assertEq(st.stopped, true);
  assertEq(st.round, 3);
  assert(R.loopMessage(st).indexOf("手で直して") >= 0, R.loopMessage(st));
});

test("全部直ったら止まる", () => {
  const st = R.newLoopState();
  R.loopRecord(st, [{ severity: "error" }], []);
  assertEq(st.stopped, true);
  assertEq(st.stopReason, "solved");
  assert(R.loopMessage(st).indexOf("直りました") >= 0);
});

test("止まったあとは続けられない（無限ループにしない）", () => {
  const st = R.newLoopState();
  R.loopRecord(st, [{ severity: "error" }], []);
  assertEq(R.loopCanContinue(st), false);
});

test("残ったエラーの手当てを出せる", () => {
  const guide = R.manualGuide([
    { questionId: "q_1", questionNumber: 1, code: "missing_explanation", message: "解説がありません。" }
  ]);
  assertEq(guide.length, 1);
  assert(guide[0].how.length > 0, guide[0].how);
});

/* ══════════════════════════════════════════════════════════════════ */
group("H. 仕様の 12 ケース");

function five(withCorrect) {
  return [
    { id: "c1", text: "あ", isCorrect: !!withCorrect },
    { id: "c2", text: "い", isCorrect: false },
    { id: "c3", text: "う", isCorrect: false },
    { id: "c4", text: "え", isCorrect: false },
    { id: "c5", text: "お", isCorrect: false }
  ];
}

test("1. 5 択指定なのに 4 択 → 1 択追加され、正解は維持", () => {
  const p = preset(nQ(1));
  const issues = R.auditPreset(p, { choiceCount: 5 });
  const wc = withCode(issues, "wrong_choice_count");
  assertEq(wc.length, 1);
  assertEq(wc[0].detail.expected, 5);
  assertEq(wc[0].detail.current, 4);
  const req = R.buildRepairRequest(p, wc);
  assert(req.instruction.indexOf("選択肢を 5 個") >= 0, "指示に数が入る");
  assert(req.instruction.indexOf("正解はそのまま残し") >= 0, "正解を守る指示");
  const proposed = [{ sourceId: "q_1", choices: [
    { id: "c1", text: "選択肢その一1", isCorrect: true },
    { id: "c2", text: "選択肢その二1", isCorrect: false },
    { id: "c3", text: "選択肢その三1", isCorrect: false },
    { id: "c4", text: "選択肢その四1", isCorrect: false },
    { id: "c5", text: "選択肢その五1", isCorrect: false }
  ] }];
  const r = R.screenRepairProposal(p, req, proposed);
  assertEq(r.accepted.length, 1);
  assertEq(r.accepted[0].question.choices.length, 5);
  assertEq(r.accepted[0].question.choices[0].isCorrect, true, "正解が維持される");
});

test("2. 6 択指定なのに最初の 5 問だけ 5 択 → その 5 問だけが対象", () => {
  const qs = nQ(10, (x, i) => {
    if (i < 5) x.choices = five(true);
    else x.choices = five(true).concat([{ id: "c6", text: "か", isCorrect: false }]);
    return x;
  });
  const p = preset(qs);
  const wc = withCode(R.auditPreset(p, { choiceCount: 6 }), "wrong_choice_count");
  assertEq(wc.length, 5, "最初の 5 問だけ");
  assertDeep(wc.map((i) => i.questionNumber), [1, 2, 3, 4, 5]);
  const req = R.buildRepairRequest(p, wc);
  assertDeep(req.questionIds, ["q_1", "q_2", "q_3", "q_4", "q_5"]);
  /* 6 問目以降への提案は落ちる */
  const r = R.screenRepairProposal(p, req, [{ sourceId: "q_6", choices: five(true) }]);
  assertEq(r.accepted.length, 0);
  assertEq(r.rejected[0].reason, "outOfScope");
});

test("3. 正解が複数成立 → 正解以外を誤答へ", () => {
  const p = preset([q({ choices: [
    { id: "c1", text: "あ", isCorrect: true },
    { id: "c2", text: "い", isCorrect: true },
    { id: "c3", text: "う", isCorrect: false },
    { id: "c4", text: "え", isCorrect: false }
  ] })]);
  const mc = withCode(R.auditPreset(p, {}), "multiple_correct_choices");
  assertEq(mc.length, 1);
  const req = R.buildRepairRequest(p, mc);
  assert(req.instruction.indexOf("正解は 1 つだけ") >= 0);
  const r = R.screenRepairProposal(p, req, [{ sourceId: "q_1", choices: [
    { id: "c1", text: "あ", isCorrect: true },
    { id: "c2", text: "明確に誤りの記述", isCorrect: false },
    { id: "c3", text: "う", isCorrect: false },
    { id: "c4", text: "え", isCorrect: false }
  ] }]);
  assertEq(r.accepted.length, 1);
  assertEq(r.accepted[0].question.choices.filter((c) => c.isCorrect).length, 1);
  /* 2 つ正解のままの提案は落とす */
  const bad = R.screenRepairProposal(p, req, [{ sourceId: "q_1", choices: [
    { id: "c1", text: "あ", isCorrect: true },
    { id: "c2", text: "い", isCorrect: true },
    { id: "c3", text: "う", isCorrect: false },
    { id: "c4", text: "え", isCorrect: false }
  ] }]);
  assertEq(bad.accepted.length, 0);
});

test("4. 日本語に中国語の文字 → その文字だけ直す", () => {
  const p = preset([q({ prompt: "この学习について説明しなさい。", explanation: "学习とは勉強のことです。" })]);
  const fc = withCode(R.auditPreset(p, {}), "foreign_character_mixed");
  assertEq(fc.length, 1);
  assert(fc[0].detail.chars.indexOf("习") >= 0, fc[0].detail.chars.join(""));
  assertEq(fc[0].detail.spots.length, 2, "問題文と解説の 2 か所");
  const req = R.buildRepairRequest(p, fc);
  assert(req.instruction.indexOf("その文字だけ") >= 0);

  const good = R.screenRepairProposal(p, req, [{ sourceId: "q_1",
    prompt: "この学習について説明しなさい。", explanation: "学習とは勉強のことです。" }]);
  assertEq(good.accepted.length, 1, JSON.stringify(good.rejected));
  assertEq(good.accepted[0].question.prompt, "この学習について説明しなさい。");

  /* 文章ごと書き換えたものは落とす */
  const rewrite = R.screenRepairProposal(p, req, [{ sourceId: "q_1",
    prompt: "まったく別の内容に作り直した問題文をここへ長く書きます。", explanation: "別の解説。" }]);
  assertEq(rewrite.accepted.length, 0);
  assertEq(rewrite.rejected[0].reason, "rewroteTooMuch");

  /* 直っていないものも落とす */
  const remains = R.screenRepairProposal(p, req, [{ sourceId: "q_1",
    prompt: "この学习について説明しました。", explanation: "学习とは勉強のことです。" }]);
  assertEq(remains.accepted.length, 0);
  assertEq(remains.rejected[0].reason, "foreignRemains");
});

test("4b. ハングル・キリルも見つける／日本語は誤検出しない", () => {
  assert(R.foreignCharsIn("これは한국어です").length > 0, "ハングル");
  assert(R.foreignCharsIn("これはРусскийです").length > 0, "キリル");
  assertDeep(R.foreignCharsIn("これは日本語の文章です。漢字・ひらがな・カタカナ、記号（）「」も含みます。"), []);
  assertDeep(R.foreignCharsIn("ABC 123 ＡＢＣ １２３ x^2 + y = 0"), []);
});

test("5. 30 問指定で 28 問 → 2 問だけ補充", () => {
  const p = preset(nQ(28));
  const issues = R.auditPreset(p, { expectedCount: 30 });
  const sc = withCode(issues, "question_count_shortage");
  assertEq(sc.length, 1);
  const plan = R.shortagePlan(p, { expectedCount: 30 });
  assertEq(plan.missing, 2);
  const req = R.buildBackfillRequest(p, plan, {});
  assertEq(req.count, 2);
  assertDeep(req.targetNumbers, [29, 30]);
});

test("6. 問 17 が欠番 → 欠番補充と末尾追加を選べる", () => {
  const qs = nQ(20);
  qs.splice(16, 1);
  const p = preset(qs);
  const plan = R.shortagePlan(p, { expectedCount: 20 });
  assertDeep(plan.gaps, [17]);
  assertDeep(plan.numberingModes, ["append", "fill-gaps"]);

  const fill = R.buildBackfillRequest(p, plan, { numberingMode: "fill-gaps" });
  assertDeep(fill.targetNumbers, [17]);
  const append = R.buildBackfillRequest(p, plan, { numberingMode: "append" });
  assertDeep(append.targetNumbers, [21]);
});

test("7. duplicate_id → 内容を変えず ID だけ再発行", () => {
  const a = q({ prompt: "同じ ID の問題 A" });
  const b = q({ prompt: "同じ ID の問題 B" });
  b.id = a.id;
  const p = preset([a, b]);
  const before = p.questions.map((x) => ({ prompt: x.prompt, choices: JSON.stringify(x.choices) }));
  const r = R.autoRepair(p, R.auditPreset(p, {}));
  r.preset.questions.forEach((x, i) => {
    assertEq(x.prompt, before[i].prompt, "問題文が変わらない");
    assertEq(JSON.stringify(x.choices), before[i].choices, "選択肢が変わらない");
  });
  assertEq(new Set(r.preset.questions.map((x) => x.id)).size, 2);
});

test("8. AI が対象外問題を変更 → 適用拒否", () => {
  const p = preset(nQ(3));
  const issues = withCode(R.auditPreset(p, { choiceCount: 5 }), "wrong_choice_count");
  const req = R.buildRepairRequest(p, [issues[0]]);
  const r = R.screenRepairProposal(p, req, [
    { sourceId: "q_1", choices: five(true) },
    { sourceId: "q_3", choices: five(true) }
  ]);
  assertEq(r.accepted.length, 1);
  assertEq(r.rejected.length, 1);
  assertEq(r.rejected[0].questionId, "q_3");
  /* 適用後の最終確認でも拒否できる */
  const after = JSON.parse(JSON.stringify(p.questions));
  after[2].choices = five(true);
  assertEq(R.verifyApplication(p.questions, after, ["q_1"]).ok, false);
});

test("9. AI 修復をキャンセル → 元データ不変", () => {
  const p = preset(nQ(3));
  const snapshot = JSON.stringify(p);
  const issues = R.auditPreset(p, { choiceCount: 5 });
  const req = R.buildRepairRequest(p, issues);
  R.screenRepairProposal(p, req, [{ sourceId: "q_1", choices: five(true) }]);
  R.autoRepair(p, issues);
  R.applyBackfill(p, [{ prompt: "新問", type: "short_answer", correctAnswer: "答え" }], {});
  assertEq(JSON.stringify(p), snapshot, "どれを呼んでも元データは変わらない");
});

test("10. 修復後もエラーが残る → 再検証で出る", () => {
  const p = preset([q({ choices: five(true), explanation: "" })]);
  const first = R.auditPreset(p, { choiceCount: 6 });
  assert(withCode(first, "wrong_choice_count").length === 1);
  assert(withCode(first, "missing_explanation").length === 1);
  /* 選択肢だけ直す */
  const fixed = JSON.parse(JSON.stringify(p));
  fixed.questions[0].choices = five(true).concat([{ id: "c6", text: "か", isCorrect: false }]);
  const second = R.auditPreset(fixed, { choiceCount: 6 });
  assertEq(withCode(second, "wrong_choice_count").length, 0, "選択肢は直った");
  assertEq(withCode(second, "missing_explanation").length, 1, "解説は残る");
});

test("11. 3 回修復しても失敗 → 停止して手動確認へ", () => {
  const st = R.newLoopState();
  const three = [{ severity: "error" }, { severity: "error" }, { severity: "error" }];
  const two = three.slice(0, 2), one = three.slice(0, 1);
  R.loopRecord(st, three, two);
  R.loopRecord(st, two, one);
  R.loopRecord(st, one, [{ severity: "error", code: "missing_explanation",
                           questionId: "q_1", questionNumber: 1, message: "解説がありません。" }]);
  assertEq(st.stopped, true);
  assertEq(st.round, 3);
  assertEq(st.remaining.length, 1);
  const guide = R.manualGuide(st.remaining);
  assertEq(guide.length, 1);
  assert(guide[0].how.length > 0, "手当ての説明がある");
});

test("12. 手動作成の問題も同じように直せる", () => {
  /* 手で作った問題（id の付き方が違う・番号が無い） */
  const manual = q({ id: "manual-1", questionNumber: null, choices: five(true), explanation: "" });
  const p = preset([manual]);
  const issues = R.auditPreset(p, { choiceCount: 6 });
  assertEq(withCode(issues, "wrong_choice_count").length, 1, "AI 作成と同じく検出される");
  assertEq(withCode(issues, "missing_question_number").length, 1);
  const req = R.buildRepairRequest(p, withCode(issues, "wrong_choice_count"));
  assertDeep(req.questionIds, ["manual-1"]);
  const r = R.screenRepairProposal(p, req, [{ sourceId: "manual-1",
    choices: five(true).concat([{ id: "c6", text: "か", isCorrect: false }]) }]);
  assertEq(r.accepted.length, 1);
  assertEq(r.accepted[0].question.choices.length, 6);
});

/* ══════════════════════════════════════════════════════════════════ */
group("I. その他のコード");

test("正解が選択肢の中に無い（answer_orphan）", () => {
  const p = preset([q({ correctAnswer: "どこにも無い答え" })]);
  const ao = withCode(R.auditPreset(p, {}), "answer_orphan");
  assertEq(ao.length, 1);
  assertDeep(ao[0].fields, ["choices", "correctAnswer"]);
});

test("正解が選択肢の本文と一致していれば出さない", () => {
  const p = preset([q({ correctAnswer: "選択肢その一1" })]);
  assertEq(withCode(R.auditPreset(p, {}), "answer_orphan").length, 0);
});

test("同じ内容の問題（duplicate_question）", () => {
  const p = preset([q({ prompt: "同じ問題文です。" }), q({ prompt: "同じ問題文です。" })]);
  const dq = withCode(R.auditPreset(p, {}), "duplicate_question");
  assertEq(dq.length, 1, "あとの 1 問だけ");
  assertEq(dq[0].questionNumber, 2);
  assertEq(dq[0].detail.duplicateOfNumber, 1);
});

test("記号のゆれは同じ問題とみなす", () => {
  const p = preset([q({ prompt: "これは 問題 です。" }), q({ prompt: "これは問題です" })]);
  assertEq(withCode(R.auditPreset(p, {}), "duplicate_question").length, 1);
});

test("資料限定で出典が無い（unsupported_claim）", () => {
  const p = preset(nQ(2));
  const uc = withCode(R.auditPreset(p, { sourceOnly: true }), "unsupported_claim");
  assertEq(uc.length, 2);
  assertEq(uc[0].severity, "warning");
});

test("正解が無い（correct_answer_missing）", () => {
  const p = preset([q({ choices: five(false) })]);
  assertEq(withCode(R.auditPreset(p, {}), "correct_answer_missing").length, 1);
});

test("記述式で正解が無い（invalid_correct_answer）", () => {
  const p = preset([q({ type: "short_answer", choices: [], correctAnswer: "", acceptedAnswers: [] })]);
  assertEq(withCode(R.auditPreset(p, {}), "invalid_correct_answer").length, 1);
});

test("問題数が多いときは補充の対象にしない", () => {
  const p = preset(nQ(5));
  const issues = R.auditPreset(p, { expectedCount: 3 });
  assertEq(withCode(issues, "question_count_shortage").length, 0);
  assert(withCode(issues, "question_count_over").length >= 1, "多いことは伝える");
});

test("エラーが無ければ何も出ない", () => {
  const p = preset(nQ(3));
  const issues = R.auditPreset(p, {});
  assertEq(R.bySeverity(issues, "error").length, 0, JSON.stringify(codesOf(issues)));
});

report("検証エラーの AI 修復");
