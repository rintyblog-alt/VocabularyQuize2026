/* 指示された「形式ごとの個数」を守る／形式を変えたら必ず記録する
   （出題形式の共通契約 §5 / §6）

   なぜ必要か（実測・2026-08-05・vqprompt.cjs）:
     「空欄補充を4問、正誤を4問」と頼んだのに、決まった配分は
     「穴埋め2・4択2・○×2・並替1・単語入力1」だった。
     AI は配分どおりに返していて、**壊していたのは配分決定（planMix）**だった。
     planMix は style === "manual"（「〜だけ」と書いたとき）でなければ、
     指定形式を「自動配分に混ぜるときの重みを最大にする」だけの扱いにしていた。

   ここでは
     ① typeDistribution を渡したら、そのとおりに割ること
     ② 形式を別のものへ変えたときは、必ず呼び出し側へ記録が届くこと
   を固定する。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "capability", "qplan", "draft"
].map((f) => "domain/" + f + ".js"));

const QPL = VQ2.qplan, DR = VQ2.draft;

/* 「空欄補充を4問、正誤を4問」 */
const D44 = [{ type: "fill_blank", count: 4 }, { type: "true_false", count: 4 }];

function countOf(plan, type) {
  const hit = plan.items.filter((i) => i.type === type)[0];
  return hit ? hit.count : 0;
}
function totalOf(plan) { return plan.items.reduce((a, i) => a + i.count, 0); }
function notesText(plan) { return (plan.notes || []).join("\n"); }

/* ══════════════════════════════════════════════════════════════ */
group("1. 指定された個数をそのまま守る（§5）");

test("4 問 + 4 問が、そのとおりになる", () => {
  const plan = QPL.planMix({ count: 8, typeDistribution: D44 });
  assertEq(countOf(plan, "fill_blank"), 4, "空欄補充");
  assertEq(countOf(plan, "true_false"), 4, "正誤");
  assertEq(plan.items.length, 2, "頼んでいない形式が混ざっています: " + plan.summary);
  assertEq(totalOf(plan), 8);
});

test("style が manual でなくても守る（これが今回の中核）", () => {
  ["auto", "exam", "choice_heavy", "memorize"].forEach((style) => {
    const plan = QPL.planMix({ count: 8, style: style, typeDistribution: D44 });
    assertEq(countOf(plan, "fill_blank"), 4, style + " の空欄補充");
    assertEq(countOf(plan, "true_false"), 4, style + " の正誤");
  });
});

test("科目の上乗せがあっても、指定した個数は動かない", () => {
  const plan = QPL.planMix({ count: 8, subject: "social", typeDistribution: D44 });
  assertEq(countOf(plan, "fill_blank"), 4);
  assertEq(countOf(plan, "true_false"), 4);
});

test("requirements.typeDistribution からも読む（blueprint からの受け渡し）", () => {
  const plan = QPL.planMix({ count: 8, requirements: { typeDistribution: D44 } });
  assertEq(countOf(plan, "fill_blank"), 4);
  assertEq(countOf(plan, "true_false"), 4);
});

test("配分の決まりごと（同じ形式は 4 割まで）で上書きされない", () => {
  /* 8 問中 4 問は 50%。偏りの決まりに引っかかるが、
     **指定された個数のほうが優先**。偏っていることは distribution で見える。 */
  const plan = QPL.planMix({ count: 8, typeDistribution: D44 });
  assertEq(countOf(plan, "fill_blank"), 4);
  assert(plan.distribution, "distribution が付いていません");
  assert((plan.distribution.issues || []).some((i) => i.code === "sameTypeTooMany"),
    "偏っていることが見えるようになっていません");
});

test("別名（cloze など）で書かれていても正式 ID として受ける", () => {
  const plan = QPL.planMix({ count: 6, typeDistribution: [{ type: "cloze", count: 6 }] });
  assertEq(countOf(plan, "fill_blank"), 6);
});

test("同じ形式が 2 回書かれていたら足し合わせる", () => {
  const plan = QPL.planMix({
    count: 8, typeDistribution: [{ type: "fill_blank", count: 3 }, { type: "fill_blank", count: 2 }]
  });
  assertEq(countOf(plan, "fill_blank"), 5);
});

test("個数が読めないものは無視する（0 問・文字・空）", () => {
  const plan = QPL.planMix({
    count: 8,
    typeDistribution: [{ type: "fill_blank", count: 4 }, { type: "true_false", count: 0 },
                       { type: "", count: 3 }, { type: "word_input" }]
  });
  assertEq(countOf(plan, "fill_blank"), 4);
  assertEq(totalOf(plan), 8, "残りは自動で埋まるはず");
});

test("空の typeDistribution なら、これまでどおりの自動配分", () => {
  const a = QPL.planMix({ count: 10, style: "auto", typeDistribution: [] });
  const b = QPL.planMix({ count: 10, style: "auto" });
  assertEq(a.summary, b.summary, "空指定で挙動が変わっています");
});

/* ══════════════════════════════════════════════════════════════ */
group("2. 足りない分は自動で埋める（§5）");

test("合計が総数に満たない残りは、自動配分で埋まる", () => {
  const plan = QPL.planMix({ count: 10, typeDistribution: D44 });
  assertEq(totalOf(plan), 10, "総数が合っていません");
  assertEq(countOf(plan, "fill_blank"), 4, "指定した個数が動いています");
  assertEq(countOf(plan, "true_false"), 4, "指定した個数が動いています");
  assert(plan.items.length > 2, "残り 2 問が埋まっていません: " + plan.summary);
});

test("埋めるほうに、指定した形式を増やさない（4 問が 6 問にならない）", () => {
  const plan = QPL.planMix({ count: 30, typeDistribution: D44 });
  assertEq(totalOf(plan), 30);
  assertEq(countOf(plan, "fill_blank"), 4, "指定した空欄補充が増えています");
  assertEq(countOf(plan, "true_false"), 4, "指定した正誤が増えています");
});

test("指定だけで総数に届いていれば、余分な形式を足さない", () => {
  const plan = QPL.planMix({ count: 8, typeDistribution: D44 });
  assertEq(plan.items.length, 2, plan.summary);
});

test("回ごとに配っても、指定した個数は変わらない（take と組み合わせる）", () => {
  /* 実際の生成は take() で 1 回ぶんずつ切り出して頼む。
     ここで数が動くと、守ったはずの配分が結局崩れる。 */
  const plan = QPL.planMix({ count: 10, typeDistribution: D44 });
  const got = {};
  let pool = plan;
  for (let i = 0; i < 20 && pool; i++) {
    const r = QPL.take(pool, 3);
    if (!r.plan) break;
    r.plan.items.forEach((it) => { got[it.type] = (got[it.type] || 0) + it.count; });
    pool = r.rest;
  }
  assertEq(got.fill_blank, 4, "空欄補充");
  assertEq(got.true_false, 4, "正誤");
  assertEq(Object.keys(got).reduce((a, k) => a + got[k], 0), 10);
});

test("どの形式を固定したかが分かる（fixedTypes）", () => {
  const plan = QPL.planMix({ count: 10, typeDistribution: D44 });
  assert(plan.fixedTypes.indexOf("fill_blank") >= 0);
  assert(plan.fixedTypes.indexOf("true_false") >= 0);
  assertEq(plan.fixedTypes.length, 2);
});

/* ══════════════════════════════════════════════════════════════ */
group("3. 多すぎるときは減らして、減らしたことを残す（§5 / §6）");

test("合計が総数を超えたら、割合を保って収める", () => {
  const plan = QPL.planMix({ count: 6, typeDistribution: D44 });
  assertEq(totalOf(plan), 6);
  assertEq(countOf(plan, "fill_blank"), 3);
  assertEq(countOf(plan, "true_false"), 3);
});

test("減らしたことを notes に日本語で残す（黙って減らさない）", () => {
  const plan = QPL.planMix({ count: 6, typeDistribution: D44 });
  const t = notesText(plan);
  assert(t.indexOf("減らしました") >= 0, "減らした記録がありません: " + t);
  assert(t.indexOf("4→3") >= 0, "どれをいくつに減らしたかが書かれていません: " + t);
});

test("割合は保たれる（多いほうが多いまま）", () => {
  const plan = QPL.planMix({
    count: 5, typeDistribution: [{ type: "fill_blank", count: 8 }, { type: "true_false", count: 2 }]
  });
  assertEq(totalOf(plan), 5);
  assert(countOf(plan, "fill_blank") > countOf(plan, "true_false"),
    "割合が保たれていません: " + plan.summary);
});

test("総数が少なくて 0 問になった形式も、記録には残る", () => {
  const plan = QPL.planMix({
    count: 1, typeDistribution: [{ type: "fill_blank", count: 9 }, { type: "true_false", count: 1 }]
  });
  assertEq(totalOf(plan), 1);
  assert(notesText(plan).indexOf("○× 1→0 問") >= 0, "消えた形式が記録されていません: " + notesText(plan));
});

/* ══════════════════════════════════════════════════════════════ */
group("4. 使えない形式は、黙って別の形式へ変えない（§6）");

test("音を出せない端末では、指定されたリスニングを外して理由を残す", () => {
  const plan = QPL.planMix({
    count: 8, canSpeak: false,
    typeDistribution: [{ type: "audio_choice", count: 4 }, { type: "true_false", count: 4 }]
  });
  assertEq(countOf(plan, "audio_choice"), 0, "鳴らせないのに入っています");
  const t = notesText(plan);
  assert(t.indexOf("リスニング選択") >= 0 && t.indexOf("4 問") >= 0,
    "外した形式と数が書かれていません: " + t);
  assert(t.indexOf("音を出せません") >= 0, "理由が書かれていません: " + t);
  assert(t.indexOf("置き換えていません") >= 0, "無言の置き換えでないことが書かれていません: " + t);
});

test("外された形式のぶんを、同じ形式へこっそり付け替えない", () => {
  const plan = QPL.planMix({
    count: 8, canSpeak: false,
    typeDistribution: [{ type: "audio_choice", count: 4 }, { type: "true_false", count: 4 }]
  });
  /* 使える指定（正誤 4 問）はそのまま。外した 4 問は自動配分で埋める。 */
  assertEq(countOf(plan, "true_false"), 4, "使える指定まで動いています");
  assertEq(totalOf(plan), 8);
});

test("使わないと言われた形式が指定されたら、理由を書いて落とす", () => {
  const plan = QPL.planMix({ count: 8, exclude: ["fill_blank"], typeDistribution: D44 });
  assertEq(countOf(plan, "fill_blank"), 0);
  assertEq(countOf(plan, "true_false"), 4);
  assert(notesText(plan).indexOf("使わないことになっている形式です") >= 0, notesText(plan));
});

test("指定がどれも使えないときは、自動の配分に戻したと書く", () => {
  const plan = QPL.planMix({ count: 8, exclude: ["fill_blank", "true_false"], typeDistribution: D44 });
  assertEq(countOf(plan, "fill_blank"), 0);
  assertEq(countOf(plan, "true_false"), 0);
  assertEq(totalOf(plan), 8);
  assert(notesText(plan).indexOf("自動の配分にしました") >= 0, notesText(plan));
});

test("試験（紙）では、紙に出せない指定を「試験では外した」と言う", () => {
  /* 「まだ動かない」と言うと直しようがない。外した理由を取り違えない。 */
  const NP = Object.keys(VQ2.capability.NO_PAPER_ENGINES);
  const paperless = VQ2.qtypes.list({}).filter((d) =>
    !d.mode && d.status === "available" && d.supportsAI && NP.indexOf(d.engine) >= 0)[0];
  if (!paperless) return;                 /* 紙に出せない形式が無くなったら、この検査は不要 */
  const plan = QPL.planMix({
    count: 8, mode: "mock", mock: true,
    typeDistribution: [{ type: paperless.id, count: 4 }, { type: "true_false", count: 4 }]
  });
  assertEq(countOf(plan, paperless.id), 0);
  assert(notesText(plan).indexOf("紙に出せない操作です") >= 0, notesText(plan));
});

/* ══════════════════════════════════════════════════════════════ */
group("5. 取り込みで形式を変えたら converted に載せる（§6・qplan）");

test("寄せ先の表で差し替えたことが converted に載る", () => {
  /* 作図（coming_soon）→ 短文記述。これまでは黙って入れ替えていた。 */
  const r = QPL.importAll([{
    questionType: "drawing", question: "図をかきなさい", modelAnswer: "模範",
    rubric: [{ description: "観点", points: 1 }], explanation: "解説"
  }], {});
  assertEq(r.questions.length, 1);
  assertEq(r.converted.length, 1, "変換が記録されていません");
  assertEq(r.converted[0].conversion.originalType, "drawing");
  assertEq(r.converted[0].conversion.convertedType, r.questions[0].type);
  assert(r.converted[0].note.indexOf("作図") >= 0, r.converted[0].note);
});

test("選択肢が 2 未満で短答へ落としたことが converted に載る", () => {
  const r = QPL.importAll([{
    questionType: "multiple_choice_single", question: "日本の首都は？",
    choices: [{ id: "c1", text: "東京" }], correctAnswer: "東京", explanation: "解説"
  }], {});
  assertEq(r.questions.length, 1, "問題を捨ててはいけない");
  assertEq(r.questions[0].type, "short_answer");
  assertEq(r.converted.length, 1, "変換が記録されていません");
  assertEq(r.converted[0].conversion.originalType, "multiple_choice_single");
  assertEq(r.converted[0].conversion.convertedType, "short_answer");
  assertEq(r.converted[0].questionId, r.questions[0].id);
  assert(r.converted[0].note.indexOf("選択肢が 1 個") >= 0, r.converted[0].note);
});

test("形式を変えていない問題は converted に載らない", () => {
  const r = QPL.importAll([{
    questionType: "true_false", question: "1 + 1 は 2 である",
    choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤り" }],
    correctAnswer: "c1", explanation: "解説"
  }], {});
  assertEq(r.questions.length, 1);
  assertEq(r.converted.length, 0, "変えていないのに記録が出ています");
});

/* ══════════════════════════════════════════════════════════════ */
group("6. Draft の取り込みでも、変えたことを取り出せる（§6・draft）");

test("知らない形式名を 4 択にしたことが残る", () => {
  const conversions = [];
  const qs = DR.draftToQuestions({ questions: [{
    id: "1", type: "opinion_essay", question: "あなたの考えを書きなさい",
    choices: [{ id: "c1", text: "あ" }, { id: "c2", text: "い" }], correctAnswer: "c1"
  }] }, { conversions: conversions });
  assertEq(qs.length, 1);
  assert(qs[0].__converted, "記録が付いていません");
  assert(qs[0].__converted.indexOf("opinion_essay") >= 0, qs[0].__converted);
  assertEq(qs[0].__conversion.originalType, "opinion_essay");
  assertEq(qs[0].__conversion.convertedType, "multiple_choice_single");
  assertEq(conversions.length, 1, "opts.conversions へ積まれていません");
  assertEq(conversions[0].questionId, qs[0].id);
});

test("選択肢が 2 未満で短答へ落としたことが残る", () => {
  const qs = DR.draftToQuestions({ questions: [{
    id: "1", type: "multiple_choice", question: "日本の首都は？",
    choices: [{ id: "c1", text: "東京" }], correctAnswer: "東京"
  }] }, {});
  assertEq(qs[0].type, "short_answer", "これまでどおり残すこと");
  assertEq(qs[0].correctAnswer, "東京", "中身を落としてはいけない");
  assert(qs[0].__converted && qs[0].__converted.indexOf("選択肢が 1 個") >= 0, qs[0].__converted);
  assertEq(qs[0].__conversion.convertedType, "short_answer");
});

test("2 段階で変えたときは、両方の記録が残る", () => {
  const qs = DR.draftToQuestions({ questions: [{
    id: "1", type: "opinion_essay", question: "首都は？", correctAnswer: "東京"
  }] }, {});
  assertEq(qs[0].type, "short_answer");
  assert(qs[0].__converted.indexOf("opinion_essay") >= 0, "1 段目が消えています: " + qs[0].__converted);
  assert(qs[0].__converted.indexOf("選択肢") >= 0, "2 段目が消えています: " + qs[0].__converted);
  assertEq(qs[0].__conversion.previous.originalType, "opinion_essay");
});

test("collectConversions で一覧として取り出せる", () => {
  const qs = DR.draftToQuestions({ questions: [
    { id: "1", type: "multiple_choice", question: "普通の 4 択",
      choices: [{ id: "c1", text: "あ" }, { id: "c2", text: "い" }], correctAnswer: "c1" },
    { id: "2", type: "multiple_choice", question: "選択肢が 1 個",
      choices: [{ id: "c1", text: "東京" }], correctAnswer: "東京" }
  ] }, {});
  const list = DR.collectConversions(qs);
  assertEq(list.length, 1, "変えたぶんだけが載ること");
  assertEq(list[0].index, 1);
  assertEq(list[0].questionId, qs[1].id);
});

test("形式を変えていなければ、記録は付かない", () => {
  const qs = DR.draftToQuestions({ questions: [{
    id: "1", type: "true_false", question: "1 + 1 は 2 である",
    choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤り" }], correctAnswer: "c1"
  }] }, {});
  assertEq(qs[0].type, "true_false");
  assertEq(qs[0].__converted, undefined);
  assertEq(DR.collectConversions(qs).length, 0);
});

process.exit(report("指定された配分を守る／形式を変えたら記録する") ? 1 : 0);
