/* 音声問題（原稿と声）

   決めたこと:
   ・**原稿（script）が本体で、音声ファイルは作り方の一つ**
   ・AI には原稿だけ書かせる（架空の音声 URL を作らせない）
   ・声は 問題 → プリセット → 言語ごとの既定 の順で決まる
   ・鳴らす手立てが無い端末では、音声形式を配分に入れない */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability"
].map((f) => "domain/" + f + ".js"));
const M = VQ2.qmodel, P = VQ2.qplan, A = VQ2.answerability;

function codes(list) { return (list || []).map((i) => i.code); }

group("1. 問題モデルが原稿と声を持つ");
{
  test("script をそのまま持つ", () => {
    const q = M.normalize({ type: "audio_choice", prompt: "聞いて答えなさい。", script: "The bus leaves at nine." });
    assertEq(q.script, "The bus leaves at nine.");
  });
  test("入れ子の audio.script も受けて、入れ子は残さない", () => {
    const q = M.normalize({ type: "audio_choice", prompt: "…", audio: { script: "Hello.", voice: "kokoro:af_heart", speed: 1.2 } });
    assertEq(q.script, "Hello.");
    assertEq(q.voice, "kokoro:af_heart");
    assertEq(q.speed, 1.2);
    assertEq(q.audio, undefined);
  });
  test("速さは 0.5〜2 に収める", () => {
    assertEq(M.normalize({ type: "audio_choice", prompt: "…", speed: 9 }).speed, 2);
    assertEq(M.normalize({ type: "audio_choice", prompt: "…", speed: 0.1 }).speed, 0.5);
  });
  test("声を指定しなければ持たない（プリセットの設定が効くように）", () => {
    const q = M.normalize({ type: "audio_choice", prompt: "…", script: "x" });
    assertEq(q.voice, undefined);
    assertEq(q.speed, undefined);
  });
  test("原稿の長さに上限がある", () => {
    const q = M.normalize({ type: "audio_choice", prompt: "…", script: "あ".repeat(5000) });
    assert(q.script.length <= 2000, String(q.script.length));
  });
  test("何度通しても同じ", () => {
    const a = M.normalize({ type: "audio_choice", prompt: "…", audio: { script: "Hi.", speed: 1.5 } });
    const b = M.normalize(a);
    assertEq(JSON.stringify(a), JSON.stringify(b));
  });
}

group("2. 原稿があれば「音声なし」で止めない");
{
  const listen = {
    type: "audio_choice", prompt: "音声を聞いて答えなさい。", script: "The library closes at six.",
    choices: [{ id: "c1", text: "5 時", isCorrect: false }, { id: "c2", text: "6 時", isCorrect: true }], points: 2
  };
  test("原稿つきリスニングは保存の検証を通る", () => {
    const r = M.validateQuestion(M.normalize(listen), "q");
    assert(codes(r).indexOf("missingAudio") < 0, codes(r).join(","));
  });
  test("原稿も音声も無いと止める", () => {
    const bad = M.normalize(Object.assign({}, listen, { script: "" }));
    assert(codes(M.validateQuestion(bad, "q")).indexOf("missingAudio") >= 0);
  });
  test("書き取りは正解の文があれば通る（音声ファイルは要らない）", () => {
    const q = M.normalize({ type: "dictation", prompt: "聞こえたとおりに書きなさい。", correctAnswer: "This is a pen." });
    assert(codes(M.validateQuestion(q, "q")).indexOf("missingAudio") < 0);
  });
  test("hasAudioSource は原稿でも音声ファイルでも真になる", () => {
    assertEq(M.hasAudioSource(M.normalize({ type: "audio_choice", prompt: "…", script: "a" })), true);
    assertEq(M.hasAudioSource(M.normalize({ type: "audio_choice", prompt: "…",
      media: [{ kind: "audio", src: "data:audio/wav;base64,AA" }] })), true);
    assertEq(M.hasAudioSource(M.normalize({ type: "audio_choice", prompt: "…" })), false);
  });
}

group("3. 試験モードでも鳴らせる（原稿を落とさない）");
{
  test("書き取りは、正解を消す前に原稿へ写す", () => {
    const q = M.normalize({ type: "dictation", prompt: "書きなさい。", correctAnswer: "This is a pen." });
    const v = M.stripAnswersStrict(q);
    assertEq(v.correctAnswer, undefined);
    assertEq(v.script, "This is a pen.");
  });
  test("リスニングの原稿は残る（音を作るのに要る）", () => {
    const q = M.normalize({ type: "audio_choice", prompt: "…", script: "Hello there.",
      choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] });
    assertEq(M.stripAnswersStrict(q).script, "Hello there.");
  });
}

group("4. AI の出力から原稿を取り込む");
{
  test("script / audioScript / transcript のどれでも受ける", () => {
    ["script", "audioScript", "transcript"].forEach((k) => {
      const raw = { type: "audio_choice", question: "聞いて答えなさい。",
        choices: [{ text: "5 時" }, { text: "6 時" }], correctAnswer: "6 時" };
      raw[k] = "It closes at six.";
      const q = P.fromAi(raw, {});
      assertEq(q && q.script, "It closes at six.", k);
    });
  });
  test("原稿つきリスニングは、解けるかの検査も通る", () => {
    const q = P.fromAi({ type: "audio_choice", question: "聞いて答えなさい。", script: "It closes at six.",
      choices: [{ text: "5 時" }, { text: "6 時" }], correctAnswer: "6 時" }, {});
    const r = A.checkAnswerable(q);
    assertEq(r.ok, true, codes(r.issues).join(","));
  });
}

group("5. 原稿が無い音声問題は、そのまま出さない（§24）");
{
  const noScript = { type: "audio_choice", question: "音声を聞いて答えなさい。",
    choices: [{ text: "5 時" }, { text: "6 時" }, { text: "7 時" }], correctAnswer: "6 時" };
  test("原稿の無いリスニングは、音の要らない形式へ寄せる", () => {
    const q = P.fromAi(noScript, {});
    assertEq(q.type, "multiple_choice_single", q.type);
  });
  test("何を何へ寄せたかを残す（黙って変えない）", () => {
    const q = P.fromAi(noScript, {});
    assert(q.__conversion, "寄せた記録が無い");
    assertEq(q.__conversion.originalType, "audio_choice");
    assert(/原稿/.test(q.__conversion.reason), q.__conversion.reason);
  });
  test("寄せたあとは解ける", () => assertEq(A.checkAnswerable(P.fromAi(noScript, {})).ok, true));
  test("原稿があれば寄せない", () => {
    const q = P.fromAi(Object.assign({}, noScript, { script: "It closes at six." }), {});
    assertEq(q.type, "audio_choice");
    assertEq(q.__conversion, undefined);
  });
  test("書き取りは寄せない（正解の文が原稿になる）", () => {
    const q = P.fromAi({ type: "dictation", question: "書きなさい。", correctAnswer: "This is a pen." }, {});
    assertEq(q.type, "dictation");
  });
  test("音声穴埋めは、原稿が無ければふつうの穴埋めになる", () => {
    const q = P.fromAi({ type: "audio_fill_blank", question: "空欄を埋めなさい。【　】",
      blanks: [{ answer: "six" }] }, {});
    assertEq(q.type, "fill_blank", q.type);
  });
}

group("6. 原稿に答えを混ぜない（そのまま音になる）");
{
  const base = {
    type: "audio_choice", prompt: "聞いて答えなさい。", points: 2,
    choices: [{ id: "c1", text: "9 時", isCorrect: true }, { id: "c2", text: "10 時" }]
  };
  test("解説が混ざった原稿は知らせる", () => {
    const q = M.normalize(Object.assign({}, base,
      { script: "A: 何時に開きますか。B: 9 時です。「9 時」が正解です。" }));
    const r = A.checkAnswerable(q);
    assert(codes(r.issues).indexOf("scriptLeaksAnswer") >= 0, codes(r.issues).join(","));
  });
  test("知らせるだけで、問題は捨てない（直せる）", () => {
    const q = M.normalize(Object.assign({}, base, { script: "B: 正解は 9 時です。" }));
    assertEq(A.checkAnswerable(q).ok, true);
  });
  test("ふつうの会話は知らせない", () => {
    const q = M.normalize(Object.assign({}, base, { script: "A: 何時に開きますか。B: 9 時です。" }));
    assert(codes(A.checkAnswerable(q).issues).indexOf("scriptLeaksAnswer") < 0);
  });
  test("英語の言い回しでも拾う", () => {
    const q = M.normalize(Object.assign({}, base, { script: "It opens at nine. The correct answer is nine." }));
    assert(codes(A.checkAnswerable(q).issues).indexOf("scriptLeaksAnswer") >= 0);
  });
  test("AI へ「解説を混ぜるな」と伝える", () => {
    const plan = P.planMix({ count: 6, style: "manual", types: ["audio_choice", "multiple_choice_single"], canSpeak: true });
    assert(P.promptFor(plan, {}).indexOf("正解・解説・補足を混ぜないで") >= 0);
  });
}

group("7. 配分：鳴らせる端末でだけ音声形式を出す");
{
  const TYPES = ["audio_choice", "multiple_choice_single"];
  test("鳴らせないときは音声形式を外し、理由を残す", () => {
    const plan = P.planMix({ count: 10, style: "manual", types: TYPES, canSpeak: false });
    assertEq(plan.items.some((i) => i.type === "audio_choice"), false);
    assert(plan.notes.some((n) => n.indexOf("音を出せない") >= 0), plan.notes.join(" / "));
  });
  test("鳴らせるときは音声形式が残る", () => {
    const plan = P.planMix({ count: 10, style: "manual", types: TYPES, canSpeak: true });
    assertEq(plan.items.some((i) => i.type === "audio_choice"), true);
  });
  test("教材に音声があるときは、端末に関係なく使える", () => {
    const plan = P.planMix({ count: 10, style: "manual", types: TYPES, hints: { audio: true } });
    assertEq(plan.items.some((i) => i.type === "audio_choice"), true);
  });
  test("音声を含む配分では、原稿を書く指示が出る", () => {
    const plan = P.planMix({ count: 10, style: "manual", types: TYPES, canSpeak: true });
    const p = P.promptFor(plan, {});
    assert(p.indexOf("script") >= 0, "script の指示が無い");
    assert(p.indexOf("音声ファイルの URL は書かないで") >= 0, "URL 禁止の指示が無い");
  });
  test("音声を含まない配分では、その指示を書かない（指示を薄めない）", () => {
    const plan = P.planMix({ count: 10, style: "manual", types: ["multiple_choice_single", "word_input"] });
    assert(P.promptFor(plan, {}).indexOf("音声ファイルの URL は書かないで") < 0);
  });
}

report("音声問題（原稿と声）");
