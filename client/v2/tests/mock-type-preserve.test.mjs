/* Quick Mock：枠が決めた出題形式が、取り込みで潰れないこと

   見つかった不具合（2026-08-05・実測 /tmp/repro-typecollapse.cjs）:
     mock-compiler が枠（slot.type）で形式を正しく決めても、その直後の
     MB.fromDraft が TYPE_MAP の 4 語（multiple_choice / true_false /
     short_answer / descriptive）以外を無条件で潰していた。

       long_answer     → short_answer
       ordering        → short_answer
       fill_blank      → short_answer
       matching        → short_answer
       source_analysis → short_answer
       （true_false だけ生存＝6 形式中 5 形式が消えた）

     quickMockCompilerV2 は既定 ON なので、これが本線。上流で何を直しても
     ここで潰れるため、「並び替えで作って」が必ず短答になっていた。

   ここでは、
     ・正式 ID（questionType）で渡した形式がそのまま残ること
     ・正式 ID が type 欄に入っていても拾えること
     ・古い粗い 4 語（multiple_choice 等）が今までどおり動くこと（後方互換）
     ・**分からない形式は黙って落とさず、warnings に理由が残ること**（§10）
   を確かめる。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "mock-builder"
].map((f) => "domain/" + f + ".js"));

const MB = VQ2.mockBuilder;

/* 1 問だけの Draft を組んで、出来上がった形式を返す。 */
function typeOf(q) {
  const draft = { sections: [{ title: "第1問", questions: [Object.assign({ id: "q1", question: "問い", points: 5 }, q)] }] };
  const r = MB.fromDraft(draft, { title: "T", totalPoints: 5 });
  const spec = r.spec || r;
  return spec.sections[0].questions[0].type;
}
function warningsOf(q) {
  const draft = { sections: [{ title: "第1問", questions: [Object.assign({ id: "q1", question: "問い", points: 5 }, q)] }] };
  const r = MB.fromDraft(draft, { title: "T", totalPoints: 5 });
  return r.warnings || [];
}

/* 紙に出す試験で使いたい形式。すべて layout-grammar にブロック型がある。 */
const KEEP = [
  "long_answer", "ordering", "fill_blank", "matching", "true_false",
  "source_analysis", "multiple_choice_single", "short_answer", "essay",
  "numeric", "word_input", "error_correction", "classification", "table_fill"
];

group("正式 ID（questionType）で渡した形式が残る");
KEEP.forEach((t) => {
  test(t + " が潰れない", () => {
    assertEq(typeOf({ questionType: t }), t, t + " が別の形式へ変わりました");
  });
});

group("正式 ID が type 欄に入っていても拾う（AI は欄を取り違える）");
["ordering", "matching", "fill_blank", "long_answer"].forEach((t) => {
  test(t + " を type 欄で渡しても残る", () => {
    assertEq(typeOf({ type: t }), t);
  });
});

group("古い粗い語彙は今までどおり（後方互換）");
test("multiple_choice → multiple_choice_single", () => {
  assertEq(typeOf({ type: "multiple_choice", choices: [{ id: "c1", text: "あ" }, { id: "c2", text: "い" }] }),
    "multiple_choice_single");
});
test("descriptive → long_answer", () => { assertEq(typeOf({ type: "descriptive" }), "long_answer"); });
test("short_answer → short_answer", () => { assertEq(typeOf({ type: "short_answer" }), "short_answer"); });
test("true_false → true_false", () => { assertEq(typeOf({ type: "true_false" }), "true_false"); });

group("分からない形式は黙って落とさない（§10）");
test("知らない形式でも取り込みは続く（1 問で全体を捨てない）", () => {
  assert(typeOf({ questionType: "no_such_type_xyz" }), "問題ごと消えました");
});
test("落とした理由が warnings に残る", () => {
  const w = warningsOf({ questionType: "no_such_type_xyz" });
  assert(w.some((x) => String(x).indexOf("no_such_type_xyz") >= 0),
    "どの形式が分からなかったのかが記録されていません: " + JSON.stringify(w));
});
test("正しい形式のときは、その警告を出さない", () => {
  const w = warningsOf({ questionType: "ordering" });
  assert(!w.some((x) => String(x).indexOf("として取り込みました") >= 0),
    "正しい形式なのに変換の警告が出ています: " + JSON.stringify(w));
});

process.exit(report("Quick Mock：出題形式が取り込みで潰れない"));
