/* ══════════════════════════════════════════════════════════════════════
   AI Draft の取り込み・差分・適用、および Undo / Redo のテスト
   ══════════════════════════════════════════════════════════════════════ */
import {
  installLocalStorage, installLocation, loadV2,
  group, test, assert, assertEq, assertDeep, assertThrows, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js",
  "domain/grading.js", "domain/history.js"
]);
const S = VQ2.schema, V = VQ2.validate, D = VQ2.draft, History = VQ2.History;

/* Orchestrator が返す Preset Draft の形 */
function aiDraft(over) {
  return Object.assign({
    title: "日本史 確認テスト", subject: "日本史",
    questions: [{
      id: "q1", type: "multiple_choice",
      question: "大化の改新が始まった年は？",
      choices: [
        { id: "a", text: "645年", explanation: "正しい" },
        { id: "b", text: "710年", explanation: "平城京遷都の年" },
        { id: "c", text: "794年", explanation: "平安京遷都の年" }
      ],
      correctAnswer: "a",
      explanation: "645年に始まりました。",
      difficulty: "standard", confidence: "high", requiresReview: false,
      sourceReferences: [{ evidenceId: "e1", fileName: "プリント.pdf", page: 3 }]
    }]
  }, over || {});
}

/* ══════════════════════════════════════════════════════════════════ */
group("1. AI Draft → V2 Question");

test("選択問題を正しく写す", () => {
  const qs = D.draftToQuestions(aiDraft());
  assertEq(qs.length, 1);
  assertEq(qs[0].type, "multiple_choice_single");
  assertEq(qs[0].prompt, "大化の改新が始まった年は？");
  assertEq(qs[0].choices.length, 3);
  assertEq(qs[0].choices[0].isCorrect, true);
  assertEq(qs[0].choices[1].isCorrect, false);
  assertEq(qs[0].createdBy, "ai");
});

test("選択肢の解説が保たれる", () => {
  const qs = D.draftToQuestions(aiDraft());
  assertEq(qs[0].choices[1].explanation, "平城京遷都の年");
});

test("難易度と確信度が V2 の語彙へ変換される", () => {
  const qs = D.draftToQuestions(aiDraft());
  assertEq(qs[0].difficulty, "normal");           /* standard → normal */
  assertEq(qs[0].confidence, 0.9);                /* high → 0.9 */
});

test("短答問題は correctAnswer を正解文字列として扱う", () => {
  const d = aiDraft({ questions: [{
    id: "q1", type: "short_answer", question: "問", choices: [],
    correctAnswer: "大化の改新", explanation: "解説",
    difficulty: "easy", confidence: "medium", requiresReview: false
  }]});
  const qs = D.draftToQuestions(d);
  assertEq(qs[0].type, "short_answer");
  assertEq(qs[0].correctAnswer, "大化の改新");
  assertDeep(qs[0].acceptedAnswers, ["大化の改新"]);
  assertEq(qs[0].choices.length, 0);
});

test("サーバが埋めた出典だけを受け取る（fileName の無いものは捨てる）", () => {
  const d = aiDraft();
  d.questions[0].sourceReferences = [
    { evidenceId: "e1", fileName: "プリント.pdf", page: 3 },
    { evidenceId: "e9" }                            /* fileName 無し = 特定できていない */
  ];
  const qs = D.draftToQuestions(d);
  assertEq(qs[0].sourceReferences.length, 1, "特定できない出典を通した");
  assertEq(qs[0].sourceReferences[0].sourceName, "プリント.pdf");
  assertEq(qs[0].sourceReferences[0].page, 3);
  assertEq(qs[0].sourceReferences[0].verified, true);
});

test("AI の警告が ValidationIssue として残る", () => {
  const d = aiDraft();
  d.questions[0].warnings = ["資料の該当箇所を特定できていません"];
  const qs = D.draftToQuestions(d);
  assertEq(qs[0].validationIssues.length, 1);
  assertEq(qs[0].validationIssues[0].severity, "warning");
});

test("取り込んだ問題が V2 の検証を error なしで通る", () => {
  const p = S.emptyPreset({ name: "AI", questions: D.draftToQuestions(aiDraft()) });
  const issues = V.validatePresetForSave(p);
  assertEq(V.errorsOf(issues).length, 0, JSON.stringify(issues));
});

/* ══════════════════════════════════════════════════════════════════ */
group("2. 差分の検出");

const base = D.draftToQuestions(aiDraft());

test("同じ内容なら差分は 0 件", () => {
  const diff = D.diffQuestions(base, base.map((q) => JSON.parse(JSON.stringify(q))));
  assertEq(diff.changes.length, 0);
});

test("問題文の変更を検出する", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].prompt = "大化の改新が始まったのは西暦何年ですか？";
  const diff = D.diffQuestions(base, prop);
  assertEq(diff.modified, 1);
  assertEq(diff.changes[0].fields.length, 1);
  assertEq(diff.changes[0].fields[0].field, "prompt");
  assertEq(diff.changes[0].fields[0].label, "問題文");
});

test("正解の変更を選択肢の差分として検出する", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].choices[0].isCorrect = false;
  prop[0].choices[1].isCorrect = true;
  const diff = D.diffQuestions(base, prop);
  const f = diff.changes[0].fields.find((x) => x.field === "choices");
  assert(f, "選択肢の差分が出ていない");
  assert(f.summary.includes("正解が変わります"), f.summary);
});

test("選択肢の追加を件数つきで説明する", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].choices.push({ id: "d", label: "D", text: "1192年", explanation: "", isCorrect: false });
  const diff = D.diffQuestions(base, prop);
  const f = diff.changes[0].fields.find((x) => x.field === "choices");
  assert(f.summary.includes("3 個 → 4 個"), f.summary);
});

test("新しい問題を追加として検出する", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop.push(D.draftToQuestions(aiDraft({ questions: [{
    id: "q2", type: "true_false", question: "新しい問題",
    choices: [{ id: "a", text: "○" }, { id: "b", text: "×" }],
    correctAnswer: "a", explanation: "解説", difficulty: "easy",
    confidence: "medium", requiresReview: false
  }]}))[0]);
  const diff = D.diffQuestions(base, prop);
  assertEq(diff.added, 1);
  assertEq(diff.changes.find((c) => c.kind === "add").proposed.prompt, "新しい問題");
});

test("提案に含まれない既存問題を削除候補にする（自動では消さない）", () => {
  const diff = D.diffQuestions(base, []);
  assertEq(diff.removeCandidates, 1);
  assertEq(diff.changes[0].kind, "removeCandidate");
});

test("ID が変わっても問題文が同じなら同一の問題とみなす", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].id = "まったく違うID";
  prop[0].explanation = "解説を書き換えました";
  const diff = D.diffQuestions(base, prop);
  assertEq(diff.added, 0, "別の問題として扱われた");
  assertEq(diff.modified, 1);
});

test("空白の違いだけでは差分にしない", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].explanation = "  " + base[0].explanation + "  ";
  assertEq(D.diffQuestions(base, prop).changes.length, 0);
});

test("出典の増減を件数で説明する", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].sourceReferences = prop[0].sourceReferences.concat([
    { id: "s2", sourceType: "pdf", sourceName: "別プリント.pdf", page: 1, verified: true }
  ]);
  const diff = D.diffQuestions(base, prop);
  const f = diff.changes[0].fields.find((x) => x.field === "sourceReferences");
  assertEq(f.summary, "1 件 → 2 件");
});

/* もとは「1 件 → 0 件」を差分として出していた。
   だが AI へ修正を頼むと、指示したところだけを書いて残りを省いて返す。
   それを「消してほしい」と読むと、頼んでいないのに出典が消える。
   空の提案では消さない、に改めた（消すときは編集画面から手で消す）。 */
test("AI が出典を空で返しても、既にある出典は消さない", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].sourceReferences = [];
  const diff = D.diffQuestions(base, prop);
  const c = diff.changes[0];
  const f = c ? c.fields.find((x) => x.field === "sourceReferences") : null;
  assert(!f, "空の提案で出典を消そうとしている");
  const r = D.applyDiff(base, diff, { all: true });
  assertEq(r.questions[0].sourceReferences.length, 1, "出典が消えた");
});

test("解説・別解・タグも、空の提案では消さない", () => {
  const cur = JSON.parse(JSON.stringify(base));
  cur[0].explanation = "もとの解説";
  cur[0].tags = ["古代"];
  const prop = JSON.parse(JSON.stringify(cur));
  prop[0].explanation = "";
  prop[0].tags = [];
  const diff = D.diffQuestions(cur, prop);
  const r = D.applyDiff(cur, diff, { all: true });
  assertEq(r.questions[0].explanation, "もとの解説");
  assertEq(r.questions[0].tags.length, 1);
});

test("中身のある提案なら、これまでどおり書き換わる", () => {
  const cur = JSON.parse(JSON.stringify(base));
  cur[0].explanation = "もとの解説";
  const prop = JSON.parse(JSON.stringify(cur));
  prop[0].explanation = "新しい解説";
  const r = D.applyDiff(cur, D.diffQuestions(cur, prop), { all: true });
  assertEq(r.questions[0].explanation, "新しい解説");
});

/* ══════════════════════════════════════════════════════════════════ */
group("3. 適用（全体・問題単位・項目単位）");

function makeDiff() {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].prompt = "書き換えた問題文";
  prop[0].explanation = "書き換えた解説";
  prop[0].difficulty = "hard";
  prop.push(Object.assign(JSON.parse(JSON.stringify(base[0])), { id: "ai_q2", prompt: "追加された問題" }));
  return { prop, diff: D.diffQuestions(base, prop) };
}

test("全適用ですべての変更が入る（削除候補は除く）", () => {
  const { diff } = makeDiff();
  const r = D.applyDiff(base, diff, { all: true });
  assertEq(r.questions.length, 2);
  assertEq(r.questions[0].prompt, "書き換えた問題文");
  assertEq(r.questions[0].difficulty, "hard");
});

test("問題単位で適用できる", () => {
  const { diff } = makeDiff();
  const r = D.applyDiff(base, diff, { questionIds: [base[0].id] });
  assertEq(r.questions.length, 1, "指定していない追加まで入った");
  assertEq(r.questions[0].prompt, "書き換えた問題文");
  assertEq(r.partial, true);
});

test("項目単位で適用できる（問題文だけ採る）", () => {
  const { diff } = makeDiff();
  const sel = { fields: {} };
  sel.fields[base[0].id] = ["prompt"];
  const r = D.applyDiff(base, diff, sel);
  assertEq(r.questions[0].prompt, "書き換えた問題文");
  assertEq(r.questions[0].explanation, base[0].explanation, "採っていない項目まで変わった");
  assertEq(r.questions[0].difficulty, "normal", "採っていない項目まで変わった");
});

test("削除候補は明示しない限り消えない", () => {
  const diff = D.diffQuestions(base, []);
  const kept = D.applyDiff(base, diff, { all: true });
  assertEq(kept.questions.length, 1, "全適用で勝手に消えた");
  const removed = D.applyDiff(base, diff, { all: true, includeRemovals: true });
  assertEq(removed.questions.length, 0);
});

test("元の配列は書き換えられない", () => {
  const { diff } = makeDiff();
  const before = JSON.stringify(base);
  D.applyDiff(base, diff, { all: true });
  assertEq(JSON.stringify(base), before, "元の配列が破壊された");
});

test("AI が要確認とした問題は、適用後も要確認のまま", () => {
  const prop = JSON.parse(JSON.stringify(base));
  prop[0].prompt = "変更";
  prop[0].requiresReview = true;
  const diff = D.diffQuestions(base, prop);
  const r = D.applyDiff(base, diff, { all: true });
  assertEq(r.questions[0].requiresReview, true);
});

test("適用の内訳が返る", () => {
  const { diff } = makeDiff();
  const r = D.applyDiff(base, diff, { all: true });
  assert(r.applied.some((a) => a.kind === "modify"));
  assert(r.applied.some((a) => a.kind === "add"));
  assertEq(r.appliedCount, 2);
});

/* ══════════════════════════════════════════════════════════════════ */
group("4. Draft の状態");

test("8 つの状態を遷移できる", () => {
  const d = D.newDraftState();
  assertEq(d.state, "draft");
  ["generating", "draft", "reviewing", "partially_applied", "applied", "saving", "saved"].forEach((s) => {
    D.setDraftState(d, s);
    assertEq(d.state, s);
  });
});

test("未知の状態を拒否する", () => {
  assertThrows(() => D.setDraftState(D.newDraftState(), "magic"));
});

test("生成開始と終了の時刻が入る", () => {
  const d = D.newDraftState();
  D.setDraftState(d, "generating");
  assert(d.startedAt, "開始時刻が入らない");
  D.setDraftState(d, "applied");
  assert(d.finishedAt, "終了時刻が入らない");
});

/* ══════════════════════════════════════════════════════════════════ */
group("5. Undo / Redo");

test("戻す・やり直すができる", () => {
  const h = new History({ n: 0 });
  h.push({ n: 1 }, "1へ");
  h.push({ n: 2 }, "2へ");
  assertEq(h.current().n, 2);
  assertEq(h.undo().n, 1);
  assertEq(h.undo().n, 0);
  assertEq(h.canUndo(), false);
  assertEq(h.redo().n, 1);
  assertEq(h.redo().n, 2);
  assertEq(h.canRedo(), false);
});

test("戻した後に新しい変更をすると Redo は捨てられる", () => {
  const h = new History({ n: 0 });
  h.push({ n: 1 }); h.push({ n: 2 });
  h.undo();
  h.push({ n: 99 });
  assertEq(h.canRedo(), false);
  assertEq(h.current().n, 99);
});

test("同じ内容は積まない", () => {
  const h = new History({ n: 1 });
  assertEq(h.push({ n: 1 }), false);
  assertEq(h.size(), 1);
});

test("同じ対象への連続入力は 1 段にまとめる", () => {
  const h = new History({ t: "" }, { coalesceMs: 10000 });
  h.push({ t: "あ" }, "問題文", "prompt:q1");
  h.push({ t: "あい" }, "問題文", "prompt:q1");
  h.push({ t: "あいう" }, "問題文", "prompt:q1");
  assertEq(h.size(), 2, "1文字ずつ Undo 段ができている");
  assertEq(h.undo().t, "");
});

test("対象が変われば別の段になる", () => {
  const h = new History({ a: "", b: "" }, { coalesceMs: 10000 });
  h.push({ a: "x", b: "" }, "A", "a:q1");
  h.push({ a: "x", b: "y" }, "B", "b:q1");
  assertEq(h.size(), 3);
});

test("上限を超えると古いものから捨てる", () => {
  const h = new History({ n: 0 }, { limit: 5 });
  for (let i = 1; i <= 20; i++) h.push({ n: i });
  assertEq(h.size(), 5);
  assertEq(h.current().n, 20);
});

test("何が戻るかを説明できる", () => {
  const h = new History({ n: 0 });
  h.push({ n: 1 }, "問題を追加");
  assertEq(h.undoLabel(), "問題を追加");
  h.undo();
  assertEq(h.redoLabel(), "問題を追加");
});

test("プリセット全体のスナップショットを扱える", () => {
  const p = S.emptyPreset({ name: "テスト", questions: D.draftToQuestions(aiDraft()) });
  const h = new History(p);
  const edited = JSON.parse(JSON.stringify(p));
  edited.questions[0].prompt = "編集後";
  h.push(edited, "問題文を編集", "prompt:" + p.questions[0].id);
  assertEq(h.current().questions[0].prompt, "編集後");
  assertEq(h.undo().questions[0].prompt, "大化の改新が始まった年は？");
});

test("並び替えを戻せる", () => {
  const qs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const h = new History({ questions: qs });
  h.push({ questions: [{ id: "c" }, { id: "a" }, { id: "b" }] }, "並び替え");
  assertEq(h.current().questions[0].id, "c");
  assertEq(h.undo().questions[0].id, "a");
});

/* ══════════════════════════════════════════════════════════════════
   指示文からの問題数の読み取り
   ── ここを取りこぼすと分割生成が働かず、1 回で全部作らせて出力上限に当たる
   ══════════════════════════════════════════════════════════════════ */
group("5. 指示文からの問題数");

test("全角の「２０問」を読める", () => {
  assertEq(D.parseCount("ここから問題を２０問作成してください。"), 20);
});

test("半角の「20問」も読める", () => {
  assertEq(D.parseCount("4択問題を20問作ってください"), 20);
});

test("「5題」のような書き方も読める", () => {
  assertEq(D.parseCount("記述を5題お願いします"), 5);
});

test("数の指定が無ければ 0 を返す（勝手に決めない）", () => {
  assertEq(D.parseCount("難しめの問題を作ってください"), 0);
  assertEq(D.parseCount(""), 0);
});

test("あり得ない大きさは受け取らない", () => {
  assertEq(D.parseCount("問題を9999問"), 0);
});

test("分割の各回では問題数の指定を外す（毎回 20 問作らせない）", () => {
  const s = D.stripCount("ここから問題を２０問作成してください。難易度は難しめで。");
  assert(!/20|２０/.test(s), "数が残っている: " + s);
  assert(/難易度は難しめ/.test(s), "他の指示まで消している: " + s);
});

test("全角の数字は半角へ直す（選択肢の数などもそのまま伝わる）", () => {
  assertEq(D.toHalfWidth("選択肢を５つに、２０問"), "選択肢を5つに、20問");
});


/* ══════════════════════════════════════════════════════════════════
   出題する論点の取り出し
   ── 実際にモデルが混ぜてきたゴミ（表の行・選択肢の断片）で固定する
   ══════════════════════════════════════════════════════════════════ */
group("6. 出題する論点の取り出し");

const TOPIC_OUT = [
  "資料から問える論点は次のとおりです。",
  "",
  "- 1948年の憲章における健康の定義",
  "- 17歳男子の1日あたりの推奨エネルギー量",
  "* ロックポートテストの測定距離",
  "1. 睡眠不足による集中力の低下率",
  "",
  "| 項目 | 内容 |",
  "| 難易度 | 易 0 / 標準 20 |",
  "- A. 1948年の憲章で定義された「完全な身体的・社会的well-being」",
  "- ",
  "- 短い",
  "【まとめ】",
  "- 2018年の学習指導要領改訂で追加された事項",
  "- 1948年の憲章における健康の定義"
].join("\n");

test("箇条書きの行だけを論点として取り出す", () => {
  const t = D.parseTopics(TOPIC_OUT);
  assertEq(t.length, 5, JSON.stringify(t));
  assertEq(t[0], "1948年の憲章における健康の定義");
});

test("表の行を論点として拾わない", () => {
  const t = D.parseTopics(TOPIC_OUT);
  assert(!t.some((x) => x.indexOf("|") >= 0), "表の行が混ざった: " + JSON.stringify(t));
  assert(!t.some((x) => /難易度/.test(x)), "表の見出しが混ざった");
});

test("選択肢の断片を論点として拾わない", () => {
  const t = D.parseTopics(TOPIC_OUT);
  assert(!t.some((x) => /^A\./.test(x)), "選択肢が混ざった: " + JSON.stringify(t));
});

test("前置き・見出し・空・短すぎる行は捨てる", () => {
  const t = D.parseTopics(TOPIC_OUT);
  assert(!t.some((x) => /^【/.test(x)), "見出しが混ざった");
  assert(!t.some((x) => x === "短い"), "短すぎる行が混ざった");
  assert(!t.some((x) => /次のとおり/.test(x)), "前置きが混ざった");
});

test("同じ論点は 1 つにまとめる", () => {
  const t = D.parseTopics(TOPIC_OUT);
  const first = t.filter((x) => /1948年の憲章/.test(x));
  assertEq(first.length, 1, "重複した: " + JSON.stringify(first));
});

test("論点が無い出力からは何も取り出さない（作り話をしない）", () => {
  assertEq(D.parseTopics("資料が読み取れませんでした。").length, 0);
  assertEq(D.parseTopics("").length, 0);
});


/* ══════════════════════════════════════════════════════════════════════
   AI が作った記述問題に採点基準が付く（付かないと永久に未採点になる）
   ══════════════════════════════════════════════════════════════════════ */
group("AI 生成と採点基準");

test("記述形式の問題には採点基準が必ず付く", () => {
  const qs = D.draftToQuestions({
    questions: [
      { id: "q1", type: "descriptive", question: "理由を説明しなさい。", correctAnswer: "模範解答" },
      { id: "q2", type: "multiple_choice", question: "選べ",
        choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctAnswer: "a" }
    ]
  });
  assertEq(qs[0].type, "long_answer");
  assert(qs[0].scoringRubric && qs[0].scoringRubric.items.length >= 1, "採点基準が付いていない");
  assertEq(qs[0].scoringRubric.items.reduce((a, r) => a + r.points, 0), qs[0].points);
  assertEq(qs[1].scoringRubric, null, "選択式に採点基準を付けている");
});

test("AI が採点基準を出したときはそれを使い、合計だけ配点へ合わせる", () => {
  const qs = D.draftToQuestions({
    questions: [{
      id: "q1", type: "descriptive", question: "説明しなさい。",
      scoringRubric: [
        { description: "資料の語を使えている", points: 40, criterionId: "knowledge_skill" },
        { description: "理由が書けている", points: 60 }
      ]
    }]
  });
  const r = qs[0].scoringRubric;
  /* 配点 1 点に基準 2 つは入らないので、重いほうだけが残る */
  assertEq(r.items.length, 1);
  assertEq(r.items[0].description, "理由が書けている");
  assertEq(r.items.reduce((a, x) => a + x.points, 0), qs[0].points);
});

test("配点に対して基準が多すぎるときは重いものだけを残す（0 点の基準を並べない）", () => {
  const r = S.rescaleRubric({ items: [
    { id: "r1", description: "軽い", points: 1, criterionId: "knowledge_skill" },
    { id: "r2", description: "重い", points: 9, criterionId: "knowledge_skill" },
    { id: "r3", description: "中", points: 4, criterionId: "knowledge_skill" }
  ] }, 2);
  assertEq(r.items.reduce((a, x) => a + x.points, 0), 2);
  assert(r.items.every((x) => x.points >= 1), "0 点の基準が残った");
  assertDeep(r.items.map((x) => x.description), ["重い", "中"]);
});

test("説明の無い採点基準は受け取らない（空の基準で採点させない）", () => {
  const qs = D.draftToQuestions({
    questions: [{ id: "q1", type: "descriptive", question: "説明しなさい。",
                  scoringRubric: [{ description: "", points: 5 }] }]
  });
  assert(qs[0].scoringRubric.items.every((r) => r.description.length > 0), "空の基準が残った");
});


test("選択肢が足りない選択問題は短答へ落として残す（保存できなくしない）", () => {
  const qs = D.draftToQuestions({
    questions: [
      { id: "q1", type: "multiple_choice", question: "選択肢が1つしかない",
        choices: [{ id: "a", text: "ただ一つ" }], correctAnswer: "a" },
      { id: "q2", type: "multiple_choice", question: "選択肢が空だけ",
        choices: [{ id: "a", text: "" }, { id: "b", text: "  " }], correctAnswer: "" },
      { id: "q3", type: "multiple_choice", question: "まともな選択問題",
        choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctAnswer: "a" }
    ]
  });
  assertEq(qs[0].type, "short_answer");
  assertEq(qs[0].choices.length, 0);
  assertEq(qs[0].correctAnswer, "a");
  assertEq(qs[1].type, "short_answer");
  assertEq(qs[2].type, "multiple_choice_single", "まともな問題まで変えてはいけない");
  assertEq(qs[2].choices.length, 2);

  /* 保存できる状態になっていること */
  const V = VQ2.validate;
  const p = S.emptyPreset({ name: "T", questions: qs });
  const errs = V.errorsOf(V.validatePresetForSave(p, {})).filter((e) => e.code === "choiceCount");
  assertDeep(errs, [], JSON.stringify(errs));
});

process.exit(report("AI Draft / Undo・Redo") > 0 ? 1 : 0);
