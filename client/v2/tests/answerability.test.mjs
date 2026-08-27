/* 解けるか・点をつけられるか（V3 §20 / §21）
   ・形として正しくても、人が解けないものがある
   ・採点できない問題は出題させない
   ・**直せるものは理由を返す**（捨てるだけにしない） */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability"
].map((f) => "domain/" + f + ".js"));
const A = VQ2.answerability, P = VQ2.qplan, M = VQ2.qmodel;

/* AI の出力から 1 問つくる（実際の取り込み経路を通す） */
function make(raw) { return P.fromAi(raw, {}); }
function codes(r) { return r.issues.map((i) => i.code); }

group("1. 選択式");
{
  const ok = make({ type: "multiple_choice_single", question: "日本の首都はどこですか。",
    choices: [{ text: "東京" }, { text: "大阪" }, { text: "京都" }, { text: "札幌" }], correctIndex: 0 });
  test("ふつうの 4 択は通る", () => assertEq(A.checkAnswerable(ok).ok, true, JSON.stringify(codes(A.checkAnswerable(ok)))));

  const dup = make({ type: "multiple_choice_single", question: "正しいものはどれですか。",
    choices: [{ text: "同じ文", isCorrect: true }, { text: "同じ文" }, { text: "ちがう" }, { text: "ちがう2" }] });
  test("同じ選択肢が 2 つあるものは通さない", () => {
    const r = A.checkAnswerable(dup);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("duplicateChoice") >= 0, codes(r).join(","));
  });
}

group("2. 並べ替え（正しい順が 1 通りに決まるか）");
{
  const ok = make({ type: "ordering", question: "古い順に並べなさい。", items: ["大化の改新", "鎌倉幕府", "明治維新"] });
  test("ふつうの並べ替えは通る", () => assertEq(A.checkAnswerable(ok).ok, true));

  const amb = make({ type: "ordering", question: "順に並べなさい。", items: ["同じ", "同じ", "ちがう"] });
  test("同じ項目があると通さない（正しい順が 2 通りある）", () => {
    const r = A.checkAnswerable(amb);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("ambiguousOrder") >= 0, codes(r).join(","));
  });

  const two = make({ type: "ordering", question: "順に並べなさい。", items: ["A", "B"] });
  test("2 つだけは出題できるが、印を付ける", () => {
    const r = A.checkAnswerable(two);
    assertEq(r.ok, true);
    assert(codes(r).indexOf("onlyTwoItems") >= 0);
  });
}

group("3. 組み合わせ");
{
  const ok = make({ type: "matching", question: "対応するものを結びなさい。",
    pairs: [{ left: "日本", right: "東京" }, { left: "フランス", right: "パリ" }] });
  test("ふつうの組み合わせは通る", () => assertEq(A.checkAnswerable(ok).ok, true));

  const q = make({ type: "matching", question: "結びなさい。",
    pairs: [{ left: "A", right: "同じ" }, { left: "B", right: "同じ" }] });
  test("右が同じだと通さない（どちらでも正しくなる）", () => {
    const r = A.checkAnswerable(q);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("duplicateRight") >= 0, codes(r).join(","));
  });

  const broken = { type: "matching", engine: "matching", prompt: "結びなさい。", points: 2,
    pairs: { left: [{ id: "L1", text: "A" }, { id: "L2", text: "B" }],
             right: [{ id: "R1", text: "あ" }, { id: "R2", text: "い" }],
             correct: { L1: "R1" } } };
  test("相手がいない項目があると通さない", () => {
    const r = A.checkAnswerable(broken);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("noPartner") >= 0, codes(r).join(","));
  });
}

group("4. 記述（採点できるか）");
{
  const ok = make({ type: "long_answer", question: "光合成のしくみを説明しなさい。",
    modelAnswer: "光のエネルギーを使って二酸化炭素と水から養分をつくる。",
    rubric: [{ description: "光を使うことに触れている", points: 3 },
             { description: "二酸化炭素と水に触れている", points: 2 }], points: 5 });
  test("観点があれば通る", () => assertEq(A.checkAnswerable(ok).ok, true));
  test("採点もできる", () => assertEq(A.checkScorable(ok, {}).ok, true, JSON.stringify(codes(A.checkScorable(ok, {})))));

  const noRub = { type: "long_answer", engine: "free_text", prompt: "説明しなさい。", points: 5,
                  correctAnswer: "模範解答", scoringRubric: null };
  test("観点が無ければ通さない", () => {
    const r = A.checkAnswerable(noRub);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("noRubric") >= 0);
  });
  test("AI 採点を使わない指定なら、記述は出せない", () => {
    const r = A.checkScorable(ok, { noAiGrading: true });
    assertEq(r.ok, false);
    assert(r.issues.some((i) => i.code === "aiGradingNotAllowed"));
  });
}

group("5. 正解が問題文に出ている");
{
  const leak = make({ type: "word_input", question: "光合成とは何ですか。答えは光合成です。", correctAnswer: "光合成" });
  test("正解がそのまま書かれているものは通さない", () => {
    const r = A.checkAnswerable(leak);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("answerInPrompt") >= 0, codes(r).join(","));
  });
}

group("6. 音声・画像が要る形式");
{
  const dict = { type: "dictation", engine: "dictation", prompt: "聞こえたとおりに書きなさい。",
                 correctAnswer: "This is a pen.", points: 2 };
  /* 読み上げができるようになったので、音声ファイルの有無では止めない。
     止めるのは「読み上げる文が無い」とき。 */
  test("書き取る文があれば、音声ファイルが無くても通る", () => {
    const r = A.checkAnswerable(dict);
    assertEq(r.ok, true, codes(r).join(","));
  });
  test("書き取る文が無い書き取りは通さない", () => {
    const r = A.checkAnswerable({ type: "dictation", engine: "dictation", prompt: "書きなさい。", correctAnswer: "" });
    assertEq(r.ok, false);
    assert(codes(r).indexOf("noScript") >= 0, codes(r).join(","));
  });
  test("原稿があればリスニング選択は通る", () => {
    const r = A.checkAnswerable({ type: "audio_choice", engine: "audio_choice", prompt: "聞いて答えなさい。",
      script: "The library closes at six.", points: 2,
      choices: [{ id: "c1", text: "5 時", isCorrect: false }, { id: "c2", text: "6 時", isCorrect: true }] });
    assertEq(r.ok, true, codes(r).join(","));
  });
  test("原稿も音声も無いリスニング選択は通さない", () => {
    const r = A.checkAnswerable({ type: "audio_choice", engine: "audio_choice", prompt: "聞いて答えなさい。", points: 2,
      choices: [{ id: "c1", text: "5 時", isCorrect: false }, { id: "c2", text: "6 時", isCorrect: true }] });
    assertEq(r.ok, false);
    assert(codes(r).indexOf("noAudio") >= 0, codes(r).join(","));
  });
  const point = { type: "image_point", engine: "image_point", prompt: "位置を指しなさい。", points: 2,
                  hotspots: [{ id: "h1", shape: "circle", x: 1.4, y: 0.5, r: 0.06 }],
                  media: [{ id: "m1", kind: "image", src: "data:image/png;base64,x" }] };
  test("画像の外にある正解は通さない", () => {
    const r = A.checkAnswerable(point);
    assertEq(r.ok, false);
    assert(codes(r).indexOf("regionOutside") >= 0, codes(r).join(","));
  });
}

group("7. 採点できるか（§21）");
{
  const q = make({ type: "multiple_choice_single", question: "首都はどこ。",
    choices: [{ text: "東京", isCorrect: true }, { text: "大阪" }, { text: "京都" }, { text: "札幌" }], points: 2 });
  test("採点のしくみがある形式は通る", () => assertEq(A.checkScorable(q, {}).ok, true));
  test("配点が 0 なら通さない", () => {
    const bad = Object.assign({}, q, { points: 0 });
    assertEq(A.checkScorable(bad, {}).ok, false);
  });
  /* ── 2026-08-05 の見直し（docs/GENERATION_CONTRACT.md §2）──
     ここは以前「並び替え（ordering）は紙にできない」を例にしていた。
     しかし並び替えは**紙に出せる**（layout-grammar.js に "ordering" の
     ブロック型が実装されている）。例が間違っていただけで、
     「紙にできない操作は試験では通さない」という決まり自体は正しい。

     そこで例を、紙の上では操作そのものが成立しないもの
     （音を聞いて書き取る＝dictation）へ差し替える。
     判定の強さは変えない。あわせて、並び替えが**通る**ことも固定する
     （これが通らなくなったら §2 の対応が壊れたということ）。 */
  const dictation = make({ type: "dictation", question: "聞こえたとおりに書きなさい。",
    correctAnswer: "This is a pen." });
  test("紙にできない操作は、試験では通さない", () => {
    const r = A.checkScorable(dictation, { mock: true });
    assertEq(r.ok, false);
    assert(r.issues.some((i) => i.code === "notPrintable"),
      "notPrintable が付いていません: " + JSON.stringify(codes(r)));
  });

  const reorder = make({ type: "ordering", question: "順に並べなさい。", items: ["1", "2", "3"] });
  test("並び替えは紙に出せるので、試験でも通る（契約 §2）", () => {
    const r = A.checkScorable(reorder, { mock: true });
    assertEq(r.ok, true, JSON.stringify(codes(r)));
    assert(!r.issues.some((i) => i.code === "notPrintable"),
      "並び替えが紙にできない扱いのままです");
  });
  test("組み合わせも紙に出せる（契約 §2）", () => {
    const m = make({ type: "matching", question: "対応させなさい。",
      pairs: [{ left: "犬", right: "dog" }, { left: "猫", right: "cat" }] });
    const r = A.checkScorable(m, { mock: true });
    assert(!r.issues.some((i) => i.code === "notPrintable"),
      "組み合わせが紙にできない扱いのままです: " + JSON.stringify(codes(r)));
  });
  test("ふつうの出題では通る", () => assertEq(A.checkScorable(reorder, {}).ok, true));
}

group("8. 取り込みのときに止める（黙って通さない）");
{
  const raw = [
    { type: "multiple_choice_single", question: "首都はどこですか。",
      choices: [{ text: "東京", isCorrect: true }, { text: "大阪" }, { text: "京都" }, { text: "札幌" }] },
    { type: "ordering", question: "順に並べなさい。", items: ["同じ", "同じ", "ちがう"] },
    { type: "matching", question: "結びなさい。", pairs: [{ left: "A", right: "同じ" }, { left: "B", right: "同じ" }] }
  ];
  const r = P.importAll(raw, {});
  test("解けるものだけ残す", () => assertEq(r.questions.length, 1, JSON.stringify(r.dropped)));
  test("落とした理由が人の言葉で返る", () => {
    assertEq(r.dropped.length, 2);
    assert(r.dropped.every((d) => d.reason && !/undefined|Error/.test(d.reason)), JSON.stringify(r.dropped));
  });
  test("直せる見込みがあることも返す", () => assert(r.dropped.every((d) => d.repairable)));
  test("**全部を捨てない**", () => assert(r.questions.length > 0));
}

group("9. 保存・出題の直前にも見る");
{
  const V = VQ2.validate;
  const amb = make({ type: "ordering", question: "順に並べなさい。", items: ["同じ", "同じ", "ちがう"] });
  const soft = [];
  V.checkQuestionRules(amb, "q", soft, {});
  test("書きかけの間は指摘しない", () =>
    assert(!soft.some((i) => i.code === "ambiguousOrder"), JSON.stringify(soft.map((i) => i.code))));
  const strict = [];
  V.checkQuestionRules(amb, "q", strict, { requireAnswerable: true });
  test("出題の直前には止める", () =>
    assert(strict.some((i) => i.code === "ambiguousOrder"), JSON.stringify(strict.map((i) => i.code))));
}

report("解けるか・点をつけられるか");
