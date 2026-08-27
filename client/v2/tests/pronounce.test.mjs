/* 発音の採点

   守ること:
   ・**測れないものに点をつけない**（音素は null のまま）
   ・聞き取りが失敗／自信が低いときは、点をつけずにやり直しを勧める
   ・数字の言い方（ten thirty ↔ 10.30）で不正解にしない
   ・言えていない語を、具体的に挙げる */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  "speak-model", "pronounce"
].map((f) => "domain/" + f + ".js"));
const P = VQ2.pronounce;

/* 聞き取りの返りを組み立てる（Bridge が返す形と同じ） */
function stt(text, o) {
  o = o || {};
  const ws = text.split(/\s+/).filter(Boolean);
  const per = (o.seconds || ws.length * 0.42) / Math.max(1, ws.length);
  const words = ws.map((w, i) => ({
    word: w,
    startMs: Math.round((o.gapAt === i ? i * per + (o.gapMs || 0) / 1000 : i * per) * 1000),
    endMs: Math.round(((o.gapAt === i ? i * per + (o.gapMs || 0) / 1000 : i * per) + per) * 1000),
    confidence: o.conf === undefined ? 0.95 : o.conf
  }));
  return { ok: true, text: text, words: words, segments: [],
           audioSeconds: o.seconds || ws.length * per, processMs: 300 };
}

group("1. 語のつき合わせ");
{
  test("同じ文はすべて合う", () => {
    const a = P.align(P.wordsOf("I like coffee"), P.wordsOf("I like coffee"));
    assertEq(a.distance, 0);
    assert(a.ops.every((x) => x.kind === "ok"));
  });
  test("抜けた語が分かる", () => {
    const a = P.align(P.wordsOf("I would like a coffee"), P.wordsOf("I like a coffee"));
    const miss = a.ops.filter((x) => x.kind === "missing").map((x) => x.target);
    assertEq(miss.join(","), "would");
  });
  test("違う語が分かる", () => {
    const a = P.align(P.wordsOf("I like tea"), P.wordsOf("I like coffee"));
    const wrong = a.ops.filter((x) => x.kind === "wrong");
    assertEq(wrong.length, 1);
    assertEq(wrong[0].target, "tea");
    assertEq(wrong[0].said, "coffee");
  });
  test("余分に言った語が分かる", () => {
    const a = P.align(P.wordsOf("I like coffee"), P.wordsOf("I really like coffee"));
    assertEq(a.ops.filter((x) => x.kind === "extra").map((x) => x.said).join(","), "really");
  });
}

group("2. 数字の言い方で落とさない");
{
  test("ten thirty と 10.30 は同じ", () => {
    assertEq(P.wordsOf("The train leaves at ten thirty.").join(" "),
             P.wordsOf("The train leaves at 10.30").join(" "));
  });
  test("実際に満点になる", () => {
    const r = P.evaluate("The train leaves at ten thirty.", stt("The train leaves at 10.30"));
    assertEq(r.scored, true);
    assertEq(r.intelligibility, 100, JSON.stringify(r.wordResults));
  });
  test("six と 6 は同じ", () => assertEq(P.normWord("six"), P.normWord("6")));
}

group("3. 点のつけ方");
{
  const target = "I would like a cup of coffee please";
  test("そのまま言えたら伝わりやすさは 100", () => {
    const r = P.evaluate(target, stt(target));
    assertEq(r.intelligibility, 100);
    assert(r.overall >= 90, String(r.overall));
  });
  test("半分しか言えなければ下がる", () => {
    const r = P.evaluate(target, stt("I would like coffee"));
    assert(r.intelligibility < 70, String(r.intelligibility));
    assert(r.overall < 80, String(r.overall));
  });
  test("**音素の評価はしない**（null のまま）", () => {
    const r = P.evaluate(target, stt(target));
    assertEq(r.phonemes, null);
    assert(r.phonemeNote.indexOf("音素") >= 0, r.phonemeNote);
  });
  test("語ごとの結果が出る", () => {
    const r = P.evaluate(target, stt("I would like a cup of tea please"));
    const ng = r.wordResults.filter((w) => !w.ok);
    assertEq(ng.length, 1);
    assertEq(ng[0].word, "coffee");
    assertEq(ng[0].said, "tea");
  });
  test("言えていない語を助言に出す", () => {
    const r = P.evaluate(target, stt("I like coffee"));
    assert(r.advice.join(" ").indexOf("言えていない語") >= 0, r.advice.join(" / "));
  });
}

group("4. 流暢さ");
{
  const target = "I would like a coffee";
  test("ふつうの速さなら高い", () => {
    const r = P.evaluate(target, stt(target, { seconds: 2.0 }));
    assert(r.fluency >= 80, String(r.fluency));
  });
  test("遅すぎると下がる", () => {
    const r = P.evaluate(target, stt(target, { seconds: 8 }));
    assert(r.fluency < 70, String(r.fluency));
  });
  test("途中で止まると下がり、どこで止まったかが出る", () => {
    const r = P.evaluate(target, stt(target, { seconds: 3, gapAt: 3, gapMs: 1500 }));
    assert(r.pauses.length >= 1, JSON.stringify(r.pauses));
    assert(r.advice.join(" ").indexOf("止まりました") >= 0
        || r.advice.join(" ").indexOf("速さ") >= 0, r.advice.join(" / "));
  });
  test("1 分あたりの語数を出す", () => {
    const r = P.evaluate(target, stt(target, { seconds: 2.0 }));
    assert(r.wordsPerMinute > 60 && r.wordsPerMinute < 300, String(r.wordsPerMinute));
  });
}

group("5. 測れないときは点をつけない（§25）");
{
  test("聞き取りに失敗したら点をつけない", () => {
    const r = P.evaluate("Hello", { ok: false, reason: "聞き取りに失敗しました。" });
    assertEq(r.scored, false);
    assertEq(r.overall, null);
    assert(r.reason.length > 0);
  });
  test("録音が短すぎたら、やり直しを勧める", () => {
    const r = P.evaluate("Hello", stt("Hello", { seconds: 0.1 }));
    assertEq(r.scored, false);
    assertEq(r.retry, true);
  });
  test("自信が低いときは、発音のせいにしない", () => {
    const r = P.evaluate("I would like a coffee", stt("I would like a coffee", { conf: 0.2 }));
    assertEq(r.scored, false);
    assertEq(r.retry, true);
    assert(r.reason.indexOf("聞き取れ") >= 0, r.reason);
  });
  test("何も聞き取れなければ点をつけない", () => {
    const r = P.evaluate("Hello", { ok: true, text: "", words: [], audioSeconds: 2 });
    assertEq(r.scored, false);
  });
  test("目標が空なら点をつけない", () => {
    assertEq(P.evaluate("", stt("Hello")).scored, false);
  });
}

group("6. シャドーイング");
{
  const target = "The library opens at nine";
  test("見本と同じくらいなら高い", () => {
    const r = P.evaluateShadowing(target, stt(target, { seconds: 2.2 }),
                                  { modelSeconds: 2.2, delayMs: 0 });
    assertEq(r.scored, true);
    assert(r.timing >= 80, String(r.timing));
    assert(r.pace >= 80, String(r.pace));
  });
  test("出だしが遅れると下がり、そう伝える", () => {
    const said = stt(target, { seconds: 2.2 });
    said.words.forEach((w) => { w.startMs += 2500; w.endMs += 2500; });
    const r = P.evaluateShadowing(target, said, { modelSeconds: 2.2, delayMs: 0 });
    assert(r.timing < 70, String(r.timing));
    assert(r.advice.join(" ").indexOf("出だし") >= 0, r.advice.join(" / "));
  });
  test("見本よりゆっくりだと下がり、そう伝える", () => {
    const r = P.evaluateShadowing(target, stt(target, { seconds: 5 }),
                                  { modelSeconds: 2.2, delayMs: 0 });
    assert(r.pace < 70, String(r.pace));
    assert(r.advice.join(" ").indexOf("ゆっくり") >= 0, r.advice.join(" / "));
  });
  test("聞き取れなければシャドーイングも点をつけない", () => {
    const r = P.evaluateShadowing(target, { ok: false, reason: "x" }, { modelSeconds: 2 });
    assertEq(r.scored, false);
  });
}

report("発音の採点");
