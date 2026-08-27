/* AI が作った問題の「出典」を、保存できる形へそろえる

   見つかった不具合（2026-08-04・実測）:
     AI は出典を { evidenceId, attachmentId, fileName, page } の形で返す。
     試験の側（mock-builder.mapSources）はこれを保存できる形へ変換していたが、
     プリセットの側（qplan.fromAi）は **生のまま入れていた**。
     そのため、出典の付いたプリセットは保存できなかった。
       required @ sourceReferences[0].id
       required @ sourceReferences[0].sourceType
       orphanSource @ sourceReferences[0]

   ここでは「変換したものが、そのまま保存できる」ことを確かめる。
   変換の実装は qplan.normSources ひとつだけにしてある（mock-builder はこれを呼ぶ）。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, assertDeep, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "mock-builder"
].map((f) => "domain/" + f + ".js"));

const QPL = VQ2.qplan, S = VQ2.schema, V = VQ2.validate, QM = VQ2.qmodel, MB = VQ2.mockBuilder;

const AI_SRC = [{ evidenceId: "e1", attachmentId: "a1", fileName: "資料.pdf", page: 3 }];

function aiQuestion(extra) {
  return Object.assign({
    questionType: "multiple_choice_single",
    question: "大化の改新が始まったのは何年か。",
    choices: [{ text: "645年", isCorrect: true }, { text: "701年", isCorrect: false }],
    explanation: "645年、乙巳の変ののちに始まった。",
    sourceReferences: AI_SRC
  }, extra || {});
}

/* ══════════════════════════════════════════════════════════════ */
group("1. 形をそろえる");

test("AI の形を、保存できる形へ変える", () => {
  const out = QPL.normSources(AI_SRC);
  assertEq(out.length, 1);
  assertEq(out[0].id, "e1");
  assertEq(out[0].sourceType, "pdf");
  assertEq(out[0].sourceName, "資料.pdf");
  assertEq(out[0].sourceId, "a1");
  assertEq(out[0].page, 3);
});

test("ファイル名が無いものは捨てる", () => {
  /* どの資料か分からない出典は、出典ではない。
     残すと「ページ番号はあるのに資料が分からない」で保存できなくなる。 */
  assertEq(QPL.normSources([{ evidenceId: "e9", page: 2 }]).length, 0);
});

test("もう保存できる形なら、そのまま通す（二度変換しない）", () => {
  const ready = [{ id: "s1", sourceType: "pdf", sourceName: "既にある.pdf", verified: true }];
  assertDeep(QPL.normSources(ready), ready);
});

test("ページが無ければ page を作らない", () => {
  const out = QPL.normSources([{ evidenceId: "e2", fileName: "a.pdf" }]);
  assertEq(out[0].page, undefined, "無いページを作っています");
});

test("おかしなページ番号は入れない", () => {
  assertEq(QPL.normSources([{ evidenceId: "e3", fileName: "a.pdf", page: 0 }])[0].page, undefined);
  assertEq(QPL.normSources([{ evidenceId: "e4", fileName: "a.pdf", page: "3" }])[0].page, undefined);
});

test("空・null でも落ちない", () => {
  assertEq(QPL.normSources(null).length, 0);
  assertEq(QPL.normSources([null, undefined]).length, 0);
});

/* ══════════════════════════════════════════════════════════════ */
group("2. 取り込みから保存まで");

test("出典つきの問題を取り込むと、保存できる形になっている", () => {
  const r = QPL.fromAi(aiQuestion(), { sourceOnly: true });
  assert(!r.error, r.error);
  const q = r.question || r;
  assertEq(q.sourceReferences[0].sourceType, "pdf");
  assert(q.sourceReferences[0].id, "id がありません");
});

test("**出典つきのプリセットが保存できる**（これが直したかったこと）", () => {
  const r = QPL.fromAi(aiQuestion(), { sourceOnly: true });
  const preset = S.emptyPreset({
    name: "出典の確認", ownerId: "u1",
    questions: [QM.normalize(r.question || r)]
  });
  const issues = V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true });
  const errs = issues.filter((i) => i.severity === "error");
  assertEq(errs.length, 0, errs.map((e) => e.code + "@" + e.path).join(", "));
  assert(V.canSave(issues), "保存できません");
});

test("出典が無い問題も、これまでどおり保存できる", () => {
  const q = aiQuestion();
  delete q.sourceReferences;
  const r = QPL.fromAi(q, {});
  const preset = S.emptyPreset({ name: "出典なし", ownerId: "u1", questions: [QM.normalize(r.question || r)] });
  assert(V.canSave(V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true })));
});

/* ══════════════════════════════════════════════════════════════ */
group("3. 試験の側と同じ結果になる");

test("試験の側の変換と、同じ形を返す", () => {
  /* 変換が 2 か所にあると、また片方だけ直り忘れる。
     mock-builder は qplan.normSources を呼ぶようにしてある。 */
  assertDeep(MB._mapSources ? MB._mapSources(AI_SRC) : QPL.normSources(AI_SRC),
             QPL.normSources(AI_SRC));
});

test("試験の仕様に取り込んでも保存できる", () => {
  const draft = {
    sections: [{
      name: "大問1", score: 10,
      questions: [{ id: "q1", question: "大化の改新は何年か。", type: "multiple_choice_single",
                    choices: [{ id: "c1", text: "645年" }, { id: "c2", text: "701年" }],
                    sourceReferences: AI_SRC }]
    }],
    answerKey: [{ id: "q1", answer: "c1", explanation: "645年である。" }]
  };
  const spec = MB.fromDraft(draft, {
    title: "確認", durationMinutes: 30, totalPoints: 10,
    sourceMode: "source-only", ownerId: "u1"
  });
  const fin = MB.finalize(MB.repairSpec(spec, { requireSources: true }).spec);
  const issues = V.validateMockSpecForSave(fin.spec);
  const errs = issues.filter((i) => i.severity === "error");
  assertEq(errs.length, 0, errs.map((e) => e.code + "@" + e.path).join(", "));
});

/* ══════════════════════════════════════════════════════════════ */
group("4. 並べ替えの項目を取りこぼさない");

/* サーバの Schema は items の中身を縛っていない（"items": {}）ので、
   返す側で名前が揺れる。実測では 3 件続けて取り込めずに捨てていた。
   名前が違うだけで捨てるのは、もったいない。 */
function reorderFrom(payload) {
  return QPL.fromAi(Object.assign({
    questionType: "ordering",
    question: "次の出来事を古い順に並べなさい。",
    explanation: "年代順に並べる。"
  }, payload), {});
}

test("文字列の配列を受ける", () => {
  const r = reorderFrom({ items: ["大化の改新", "大宝律令", "平城京"] });
  assert(!r.error, r.error);
  assertEq((r.question || r).orderItems.length, 3);
});

test("text を持つオブジェクトを受ける", () => {
  const r = reorderFrom({ items: [{ text: "A" }, { text: "B" }] });
  assert(!r.error, r.error);
  assertEq((r.question || r).orderItems.length, 2);
});

test("text 以外の名前でも受ける", () => {
  ["item", "content", "value", "label", "sentence"].forEach((k) => {
    const a = {}, b = {};
    a[k] = "い"; b[k] = "ろ";
    const r = reorderFrom({ items: [a, b] });
    assert(!r.error, k + ": " + r.error);
    assertEq((r.question || r).orderItems.length, 2, k);
  });
});

test("入れ物の名前が違っても受ける", () => {
  ["orderItems", "sequence", "steps", "choices"].forEach((k) => {
    const p = {}; p[k] = ["い", "ろ", "は"];
    const r = reorderFrom(p);
    assert(!r.error, k + ": " + r.error);
    assertEq((r.question || r).orderItems.length, 3, k);
  });
});

test("本当に足りないときは、これまでどおり断る", () => {
  assert(reorderFrom({ items: ["ひとつだけ"] }).error, "1 件しかないのに通しています");
  assert(reorderFrom({ items: [] }).error, "空なのに通しています");
  assert(reorderFrom({ items: [{ nothing: 1 }, { nothing: 2 }] }).error, "中身が無いのに通しています");
});


/* ══════════════════════════════════════════════════════════════
   頼んだ形式を、取り込みの都合で変えない（2026-08-04 実測の不具合）

   「正誤問題だけで 8 問」と頼み、モデルも true_false 8 問で返したのに、
   取り込んだあとは短答 5 問・○× 3 問になっていた。
   ○× は `correctAnswer: "正しい"` だけ返すことが多く、選択肢が 2 つ未満だと
   短答へ落とす道に流れていたため。○× の選択肢は決まっているので補えばよい。

   組み合わせも同じで、`items:[{term,meaning}]` の書き方を丸ごと捨てていた。 */
group("5. 頼んだ形式を、取り込みで変えない");

const tfFrom = (patch) => QPL.fromAi(Object.assign({
  questionType: "true_false", question: "大宝律令は 701 年に完成した。",
  explanation: "資料のとおり。", difficulty: "normal", confidence: 0.9
}, patch), {});

test("選択肢が無い ○× を、短答へ落とさない", () => {
  [{ correctAnswer: "正しい" }, { correctAnswer: "誤っている" },
   { correctAnswer: true }, { correctAnswer: "true" }, { correctAnswer: "○" }].forEach((p) => {
    const r = tfFrom(p);
    assert(!r.error, JSON.stringify(p) + ": " + r.error);
    assertEq((r.question || r).type, "true_false", JSON.stringify(p));
  });
});

test("補った ○× は、正解がちゃんと決まっている", () => {
  const y0 = tfFrom({ correctAnswer: "正しい" }); const yes = (y0.question || y0).choices || [];
  assertEq(yes.filter((c) => c.isCorrect).length, 1, JSON.stringify(yes));
  assertEq(yes.filter((c) => c.isCorrect)[0].text, "正しい");
  const n0 = tfFrom({ correctAnswer: "誤っている" }); const no = (n0.question || n0).choices || [];
  assertEq(no.filter((c) => c.isCorrect)[0].text, "誤っている");
});

test("選択肢が 2 つある ○× は、これまでどおり", () => {
  const r = tfFrom({ choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤っている" }],
                     correctAnswer: "c1" });
  assert(!r.error, r.error);
  assertEq((r.question || r).choices.filter((c) => c.isCorrect)[0].id, "c1");
});

const matchFrom = (patch) => QPL.fromAi(Object.assign({
  questionType: "matching", question: "用語と意味を結びなさい。",
  explanation: "資料のとおり。", difficulty: "normal", confidence: 0.9
}, patch), {});

test("組み合わせは、書き方が違っても受ける", () => {
  [{ pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }] },
   { items: [{ term: "A", meaning: "1" }, { term: "B", meaning: "2" }] },
   { pairs: [{ word: "A", definition: "1" }, { word: "B", definition: "2" }] },
   { pairs: [["A", "1"], ["B", "2"]] }].forEach((p) => {
    const r = matchFrom(p);
    assert(!r.error, JSON.stringify(p) + ": " + r.error);
    assertEq((r.question || r).type, "matching", JSON.stringify(p));
  });
});

test("組み合わせが本当に足りないときは、これまでどおり断る", () => {
  assert(matchFrom({ pairs: [{ left: "A", right: "1" }] }).error, "1 組でも通しています");
  assert(matchFrom({ pairs: [{ left: "A" }, { left: "B" }] }).error, "片側だけでも通しています");
  assert(matchFrom({}).error, "空でも通しています");
});


test("補った ○× に、正解の印が 2 つ付かない", () => {
  /* 実測（2026-08-04）: 補ったあとに「AI が書いた正解」を重ねて読むと、
     書き方しだいで両方に印が付き、保存できなくなっていた（8 問中 3 問）。 */
  [{ correctAnswer: "正しい" }, { correctAnswer: "誤っている" }, { correctAnswer: true },
   { correctAnswer: false }, { correctAnswer: "○" }, { correctAnswer: "×" },
   { correctAnswer: "正しい", correctAnswers: ["誤っている"] },
   { correctAnswer: true, answer: "誤っている" }].forEach((p) => {
    const r = tfFrom(p);
    assert(!r.error, JSON.stringify(p) + ": " + r.error);
    const q = r.question || r;
    assertEq(q.choices.filter((c) => c.isCorrect).length, 1, JSON.stringify(p));
  });
});

test("○× の正解が読み取れないものは、当てずっぽうで通さない", () => {
  assert(tfFrom({ correctAnswer: "" }).error, "空でも通しています");
  assert(tfFrom({ correctAnswer: "たぶん" }).error, "意味の取れない語でも通しています");
});

process.exit(report("出典の形と、並べ替えの取り込み") ? 1 : 0);
