/* ══════════════════════════════════════════════════════════════════════
   指定配分（typeDistribution）の壊れかたを固定する回帰テスト

   検証（2026-08-05）で、qplan-distribution.test.mjs が通っているのに
   次の 4 つが壊れていたことが分かった。ここはその 4 つだけを直接見る。

   ① 指定した形式が items に 2 行入り、頼んだ個数が **2 倍**になる
      （残りを埋める spread() が、使える形式を全部除外されたときに
        「4 択だけにする」へ落ち、その 4 択が指定済みの形式だったため）
   ② 画面のチェックボックスで選んだ形式（style:"manual" + types）が、
      typeDistribution があると **黙って捨てられる**
   ③「残りの N 問に使える形式が無かったので…」の notes が到達不能
   ④ draft.js の __converted / __conversion が保存データに残る

   実行: node client/v2/tests/qplan-distribution-repair.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "capability", "qplan", "draft"
].map((f) => "domain/" + f + ".js"));

const QPL = VQ2.qplan, DR = VQ2.draft, QT = VQ2.qtypes;

function typesOf(plan) { return plan.items.map((i) => i.type); }
function countOf(plan, type) {
  return plan.items.filter((i) => i.type === type).reduce((a, i) => a + i.count, 0);
}
function rowsOf(plan, type) { return plan.items.filter((i) => i.type === type).length; }
function totalOf(plan) { return plan.items.reduce((a, i) => a + i.count, 0); }
function notesText(plan) { return (plan.notes || []).join("\n"); }
function dupTypes(plan) {
  const seen = Object.create(null), dup = [];
  typesOf(plan).forEach((t) => { if (seen[t]) dup.push(t); seen[t] = 1; });
  return dup;
}
/* AI で作れる形式を全部。keep に挙げたものだけ残す（「ほかは全部使わない」を作る）。 */
function allAiTypesExcept(keep) {
  return QT.list({})
    .filter((d) => !d.mode && d.status === "available" && d.supportsAI)
    .map((d) => d.id)
    .filter((t) => keep.indexOf(t) < 0);
}

/* 「選択式多め」の配分表に載っている 5 形式を、1 問ずつ名指しする。
   合計 5 問なので、10 問頼むと残り 5 問は自動配分で埋めることになる。
   このとき自動配分の引き出し（MIX.choice_heavy）は指定済みで空になる。 */
const CH5 = [
  { type: "multiple_choice_single", count: 1 },
  { type: "true_false", count: 1 },
  { type: "multiple_choice_multiple", count: 1 },
  { type: "fill_blank", count: 1 },
  { type: "word_input", count: 1 }
];

/* ══════════════════════════════════════════════════════════════════ */
group("1. 指定した形式が二重に入らない（頼んだ個数が 2 倍にならない）");

test("同じ形式が items に 2 行入らない", () => {
  const plan = QPL.planMix({ count: 10, style: "choice_heavy", typeDistribution: CH5 });
  assertEq(dupTypes(plan).join(","), "", "同じ形式が 2 行あります: " + JSON.stringify(
    plan.items.map((i) => [i.type, i.count])));
});

test("1 問と指定した形式が 1 問のままである（自動配分で増えない）", () => {
  const plan = QPL.planMix({ count: 10, style: "choice_heavy", typeDistribution: CH5 });
  CH5.forEach((e) => {
    assertEq(countOf(plan, e.type), 1, e.type + " の問題数（" + plan.summary + "）");
    assertEq(rowsOf(plan, e.type), 1, e.type + " の行数（" + plan.summary + "）");
  });
  assertEq(totalOf(plan), 10, "総数（" + plan.summary + "）");
});

test("どの style でも、指定した形式が重複しない", () => {
  ["auto", "exam", "choice_heavy", "memorize", "understand", "game", "write_heavy"].forEach((style) => {
    const plan = QPL.planMix({ count: 12, style: style, typeDistribution: CH5 });
    assertEq(dupTypes(plan).join(","), "", style + " で重複: " + plan.summary);
  });
});

test("summary に同じ形式名が 2 回出ない（人が見る 1 行が壊れない）", () => {
  const plan = QPL.planMix({ count: 10, style: "choice_heavy", typeDistribution: CH5 });
  const names = plan.summary.split("・").map((s) => s.replace(/\s+\d+\s*問$/, ""));
  const seen = Object.create(null);
  names.forEach((n) => {
    assert(!seen[n], "summary に「" + n + "」が 2 回出ています: " + plan.summary);
    seen[n] = 1;
  });
});

test("promptFor が同じ形式の内訳行を 2 回書かない", () => {
  const plan = QPL.planMix({ count: 10, style: "choice_heavy", typeDistribution: CH5 });
  const text = QPL.promptFor(plan, {});
  const needle = "（questionType: multiple_choice_single）… ";
  let n = 0, at = 0;
  while ((at = text.indexOf(needle, at)) >= 0) { n++; at += needle.length; }
  assertEq(n, 1, "4 択の内訳行が " + n + " 行あります:\n" + text.slice(0, 600));
});

/* ══════════════════════════════════════════════════════════════════ */
group("2. 残りを埋めるときに、除外した形式へ落ちない");

test("使わないと言った形式へ、埋めるときに落ちない", () => {
  /* 4 択を除外したうえで、残りに使える形式を無くす。
     ここで「配分を決められなかったので 4 択だけにしました」へ落ちると、
     使わないと言った形式が入ってしまう。 */
  const keep = ["true_false"];
  const plan = QPL.planMix({
    count: 8,
    exclude: allAiTypesExcept(keep),
    typeDistribution: [{ type: "true_false", count: 4 }]
  });
  assertEq(countOf(plan, "multiple_choice_single"), 0,
    "除外した 4 択が入っています: " + plan.summary);
  assertEq(dupTypes(plan).join(","), "", "重複: " + plan.summary);
});

/* ══════════════════════════════════════════════════════════════════ */
group("3. notes と実際の中身が食い違わない（到達不能な分岐を無くす）");

test("残りに使える形式が無いときは、そう書いて、指定ぶんだけを作る", () => {
  const keep = ["true_false"];
  const plan = QPL.planMix({
    count: 8,
    exclude: allAiTypesExcept(keep),
    typeDistribution: [{ type: "true_false", count: 4 }]
  });
  assertEq(countOf(plan, "true_false"), 4, "指定した個数が動いています: " + plan.summary);
  assertEq(totalOf(plan), 4, "使えないのに埋めています: " + plan.summary);
  assert(notesText(plan).indexOf("残りの 4 問") >= 0,
    "残りを作れなかったことが書かれていません: " + notesText(plan));
});

/* ══════════════════════════════════════════════════════════════════ */
group("4. 画面で選んだ形式（manual + types）を黙って捨てない");

test("指示の個数指定を優先しつつ、残りは画面で選んだ形式で埋める", () => {
  /* preset-studio は style:"manual" + types:[…] を渡す。
     個数指定（穴埋め 4 問）は守る。残り 6 問は、画面で選んだ形式から作る。 */
  const plan = QPL.planMix({
    count: 10, style: "manual", types: ["ordering", "matching"],
    typeDistribution: [{ type: "fill_blank", count: 4 }]
  });
  assertEq(countOf(plan, "fill_blank"), 4, plan.summary);
  assertEq(totalOf(plan), 10, plan.summary);
  const used = typesOf(plan).slice().sort().join(",");
  assertEq(used, "fill_blank,matching,ordering",
    "画面で選んでいない形式が混ざっています: " + plan.summary);
});

test("画面で選んだ形式を 1 問も使えなかったときは、notes に必ず残す", () => {
  /* 個数指定だけで総数に届くので、選んだ形式の出番が無い。
     「使う形式が指定されている」と言いながら 1 問も入れない、は許さない。 */
  const plan = QPL.planMix({
    count: 4, style: "manual", types: ["ordering", "matching"],
    typeDistribution: [{ type: "fill_blank", count: 4 }]
  });
  assertEq(countOf(plan, "ordering"), 0);
  assertEq(countOf(plan, "matching"), 0);
  const t = notesText(plan);
  assert(t.indexOf(QT.label("ordering")) >= 0 && t.indexOf(QT.label("matching")) >= 0,
    "使わなかった形式の名前がありません: " + t);
  assert(t.indexOf("使っていません") >= 0, "使わなかったことが書かれていません: " + t);
});

test("画面で選んだ形式を全部使えたときは、余計な断り書きを出さない", () => {
  const plan = QPL.planMix({
    count: 10, style: "manual", types: ["ordering", "matching"],
    typeDistribution: [{ type: "fill_blank", count: 4 }]
  });
  assert(notesText(plan).indexOf("使っていません") < 0,
    "使ったのに「使っていません」と書いています: " + notesText(plan));
});

/* ══════════════════════════════════════════════════════════════════ */
group("5. 変換の一時フィールドを保存データに残さない（draft.js）");

/* 知らない形式名 → 4 択。__converted / __conversion が付く。 */
function converted1() {
  return DR.draftToQuestions({ questions: [{
    id: "1", type: "opinion_essay", question: "あなたの考えを書きなさい",
    choices: [{ id: "c1", text: "あ" }, { id: "c2", text: "い" }], correctAnswer: "c1"
  }] }, {});
}

test("前提: draftToQuestions の時点では記録が付いている", () => {
  const qs = converted1();
  assert(qs[0].__converted, "この前提が崩れたら、下の 2 件は何も見ていない");
  assert(qs[0].__conversion, "conversion が無い");
});

test("assignAppended のあと、__ 付きの一時フィールドが残らない", () => {
  const qs = converted1();
  DR.assignAppended([], qs);
  assertEq(qs[0].__converted, undefined, "__converted が保存データに残っています");
  assertEq(qs[0].__conversion, undefined, "__conversion が保存データに残っています");
  assertEq(qs[0].__order, undefined);
  assertEq(qs[0].sourceId, undefined);
  assertEq(JSON.stringify(qs).indexOf("__"), -1, "__ 付きの欄が残っています: " + JSON.stringify(qs[0]));
});

test("assignAppended は、落とす前に変換の記録を呼び出し側へ渡す（§6）", () => {
  const qs = converted1();
  const sink = [];
  DR.assignAppended([], qs, { conversions: sink });
  assertEq(sink.length, 1, "変換の記録が受け取れません");
  assertEq(sink[0].questionId, qs[0].id);
  assertEq(sink[0].conversion.originalType, "opinion_essay");
  assert(sink[0].note.indexOf("opinion_essay") >= 0, sink[0].note);
});

test("applyDiff で足した問題にも、__ 付きの一時フィールドが残らない", () => {
  const qs = converted1();
  const diff = DR.diffQuestions([], qs, {});
  const r = DR.applyDiff([], diff, { all: true });
  assertEq(r.questions.length, 1);
  assertEq(r.questions[0].__converted, undefined, "__converted が保存データに残っています");
  assertEq(r.questions[0].__conversion, undefined, "__conversion が保存データに残っています");
  assertEq(JSON.stringify(r.questions).indexOf("__"), -1,
    "__ 付きの欄が残っています: " + JSON.stringify(r.questions[0]));
});

test("applyDiff は、落とした変換の記録を戻り値で返す（§6）", () => {
  const qs = converted1();
  const diff = DR.diffQuestions([], qs, {});
  const r = DR.applyDiff([], diff, { all: true });
  assert(Array.isArray(r.conversions), "conversions が返っていません");
  assertEq(r.conversions.length, 1, "変換の記録が落ちています");
  assertEq(r.conversions[0].questionId, r.questions[0].id);
  assertEq(r.conversions[0].conversion.convertedType, "multiple_choice_single");
});

test("変換していない問題では、conversions は空のまま（何でも積まない）", () => {
  const qs = DR.draftToQuestions({ questions: [{
    id: "1", type: "true_false", question: "1 + 1 は 2 である",
    choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤り" }], correctAnswer: "c1"
  }] }, {});
  assert(!qs[0].__converted, "この問題は変換されていないこと（前提）");
  const sink = [];
  DR.assignAppended([], qs, { conversions: sink });
  assertEq(sink.length, 0, "変えていないのに記録が出ています");
  assertEq(qs[0].questionNumber, 1, "採番まで通っていること（前提）");

  const qs2 = DR.draftToQuestions({ questions: [{
    id: "1", type: "true_false", question: "1 + 1 は 2 である",
    choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤り" }], correctAnswer: "c1"
  }] }, {});
  const r = DR.applyDiff([], DR.diffQuestions([], qs2, {}), { all: true });
  assertEq(r.questions.length, 1, "問題が適用されていること（前提）");
  assertEq((r.conversions || []).length, 0, "変えていないのに記録が出ています");
});

process.exit(report("指定配分の壊れかた（回帰）") ? 1 : 0);
