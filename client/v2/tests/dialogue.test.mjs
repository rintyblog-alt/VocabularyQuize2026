/* 会話シナリオの進行

   守ること:
   ・行き先の無い分岐があるシナリオは、始める前に止める
   ・言い方が違っても、同じ意図なら進む
   ・分からないときは **進めずに聞き返す**（勝手に進まない）
   ・**言っていないミッションを達成にしない**
   ・LLM が言ってきた意図でも、その場面に無い分岐は受けない */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  "speak-model", "dialogue"
].map((f) => "domain/" + f + ".js"));
const D = VQ2.dialogue;

/* カフェで注文する（教材と同じ形） */
function cafe() {
  return {
    id: "s1", level: "a1", categoryId: "cafe", title: "カフェで注文する",
    userRole: "お客", aiRole: "店員",
    missionGoals: [
      { id: "m1", descriptionJa: "飲み物を注文する", requiredIntentIds: ["order_drink"] },
      { id: "m2", descriptionJa: "サイズを伝える", requiredIntentIds: ["say_size"] },
      { id: "m3", descriptionJa: "「to go」と言う", requiredExpressions: ["to go"] }
    ],
    startNodeId: "n1",
    nodes: [
      { id: "n1", aiText: "Hi! What can I get for you?", japaneseTranslation: "ご注文は？",
        hint: "I'd like ...",
        expectedIntents: [{ intentId: "order_drink",
          examples: ["I'd like a coffee, please.", "Can I have a latte?", "A tea, please."],
          nextNodeId: "n2" }],
        fallbackNodeId: "n1b" },
      { id: "n1b", aiText: "Sure. What would you like to drink?", japaneseTranslation: "何を飲みますか。",
        expectedIntents: [{ intentId: "order_drink", examples: ["Coffee, please."], nextNodeId: "n2" }] },
      { id: "n2", aiText: "What size would you like?", japaneseTranslation: "サイズは？",
        expectedIntents: [{ intentId: "say_size",
          examples: ["Small, please.", "A medium one.", "Large, please."], nextNodeId: "n3" }] },
      { id: "n3", aiText: "For here or to go?", japaneseTranslation: "店内ですか持ち帰りですか。",
        expectedIntents: [
          { intentId: "say_togo", examples: ["To go, please."], nextNodeId: "n4" },
          { intentId: "say_here", examples: ["For here, please."], nextNodeId: "n4" }] },
      { id: "n4", aiText: "That will be four dollars. Have a nice day!", completionNode: true,
        expectedIntents: [] }
    ]
  };
}

group("1. 始める前に確かめる");
{
  test("ふつうのシナリオは通る", () => {
    const sc = D.normalizeScenario(cafe());
    assertEq(D.validateScenario(sc).filter((x) => x.level === "error").length, 0);
  });
  test("行き先の無い分岐があると始めない", () => {
    const bad = cafe();
    bad.nodes[0].expectedIntents[0].nextNodeId = "zzz";
    const r = D.start(bad);
    assertEq(r.ok, false);
    assert(r.message.indexOf("行き先") >= 0, r.message);
  });
  test("終わりの場面が無いと始めない", () => {
    const bad = cafe();
    bad.nodes[4].completionNode = false;
    const r = D.start(bad);
    assertEq(r.ok, false);
    assert(r.message.indexOf("終われません") >= 0, r.message);
  });
  test("どの分岐にも無い意図をミッションに書いたら止める", () => {
    const bad = cafe();
    bad.missionGoals[0].requiredIntentIds = ["nonexistent"];
    assertEq(D.start(bad).ok, false);
  });
  test("始めると 1 つ目のセリフが出る", () => {
    const s = D.start(cafe());
    assertEq(s.ok, true);
    assertEq(s.turns.length, 1);
    assertEq(s.turns[0].who, "ai");
    assert(s.turns[0].text.indexOf("What can I get") >= 0);
    assertEq(s.turns[0].japanese, "ご注文は？");
  });
}

group("2. 言い方が違っても進む");
{
  test("例文そのままなら進む", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "I'd like a coffee, please.");
    assertEq(r.matched, true);
    assertEq(r.intentId, "order_drink");
    assertEq(s.nodeId, "n2");
  });
  test("言い換えでも進む", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "Could I have a coffee?");
    assertEq(r.matched, true, JSON.stringify(r));
    assertEq(r.intentId, "order_drink");
  });
  test("短い返事でも進む", () => {
    const s = D.start(cafe());
    D.advance(s, "A tea, please.");
    const r = D.advance(s, "Small, please.");
    assertEq(r.matched, true, JSON.stringify(r));
    assertEq(r.intentId, "say_size");
  });
  test("**「please」だけでは、サイズを言ったことにしない**", () => {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    assertEq(s.nodeId, "n2");
    const r = D.advance(s, "I would like a coffee, please.");
    assertEq(r.matched, false, JSON.stringify(r));
    assertEq(s.missions.filter((m) => m.id === "m2")[0].completed, false, "サイズを言っていないのに達成になった");
  });
  test("中身のある語が合えば進む（small）", () => {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    const r = D.advance(s, "A small one, please.");
    assertEq(r.matched, true, JSON.stringify(r));
    assertEq(r.intentId, "say_size");
  });
  test("なぜその分岐にしたかが返る", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "I'd like a coffee, please.");
    assert(r.why && r.why.length > 0, JSON.stringify(r));
  });
}

group("3. 分からないときは進めずに聞き返す");
{
  test("まったく違うことを言うと進まない", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "The weather is nice today.");
    assertEq(r.matched, false, JSON.stringify(r));
    assertEq(r.state, "needs_retry");
  });
  test("聞き返しの場面へ移る（用意してあれば）", () => {
    const s = D.start(cafe());
    D.advance(s, "The weather is nice today.");
    assertEq(s.nodeId, "n1b");
    assert(s.turns[s.turns.length - 1].isFallback, JSON.stringify(s.turns.slice(-1)));
  });
  test("聞き返したあとに答えれば進む", () => {
    const s = D.start(cafe());
    D.advance(s, "The weather is nice today.");
    const r = D.advance(s, "Coffee, please.");
    assertEq(r.matched, true, JSON.stringify(r));
    assertEq(s.nodeId, "n2");
  });
  test("聞き返し先が無いときは、AI の返事を頼む", () => {
    const sc = cafe();
    delete sc.nodes[0].fallbackNodeId;
    const s = D.start(sc);
    const r = D.advance(s, "The weather is nice today.");
    assertEq(r.needsAiReply, true, JSON.stringify(r));
    assertEq(s.nodeId, "n1", "分からないのに話が進んでいる");
  });
  test("空の発話では進まない", () => {
    const s = D.start(cafe());
    assertEq(D.advance(s, "").matched, false);
  });
}

group("4. LLM が決めた意図の扱い");
{
  test("その場面にある分岐なら受ける", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "Umm something to drink maybe", { decidedIntentId: "order_drink" });
    assertEq(r.matched, true, JSON.stringify(r));
    assertEq(s.nodeId, "n2");
  });
  test("**その場面に無い分岐は受けない**（会話を作り直させない）", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "blah blah", { decidedIntentId: "say_togo" });
    assertEq(r.matched, false, JSON.stringify(r));
    assert(s.nodeId === "n1b" || s.nodeId === "n1", s.nodeId);
  });
  test("手元で決まるときは LLM の答えを待たない", () => {
    const s = D.start(cafe());
    const r = D.advance(s, "I'd like a coffee, please.", { decidedIntentId: "say_size" });
    assertEq(r.intentId, "order_drink", "LLM の指定に引きずられた");
  });
}

group("5. ミッション（言っていないものを達成にしない）");
{
  test("最初はすべて未達成", () => {
    const s = D.start(cafe());
    assertEq(s.missions.filter((m) => m.completed).length, 0);
    assertEq(s.missions.length, 3);
  });
  test("注文したら 1 つ目が立つ", () => {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    assertEq(s.missions.filter((m) => m.id === "m1")[0].completed, true);
    assertEq(s.missions.filter((m) => m.id === "m2")[0].completed, false);
  });
  test("言っていない表現のミッションは立たない", () => {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    D.advance(s, "Small, please.");
    assertEq(s.missions.filter((m) => m.id === "m3")[0].completed, false, "to go と言っていないのに達成になった");
  });
  test("実際にその表現を言えば立つ", () => {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    D.advance(s, "Small, please.");
    D.advance(s, "To go, please.");
    assertEq(s.missions.filter((m) => m.id === "m3")[0].completed, true);
  });
}

group("6. 会話の終わりとまとめ");
{
  function runAll() {
    const s = D.start(cafe());
    D.advance(s, "I'd like a coffee, please.");
    D.advance(s, "Small, please.");
    D.advance(s, "To go, please.");
    return s;
  }
  test("最後まで行くと終わる", () => {
    const s = runAll();
    assertEq(s.state, "goal_completed");
    assertEq(s.nodeId, "n4");
  });
  test("終わったあとは進まない", () => {
    const s = runAll();
    assertEq(D.advance(s, "Thanks.").ok, false);
  });
  test("まとめが出る（点はつけない）", () => {
    const s = runAll();
    const sum = D.summary(s);
    assertEq(sum.missionsDone, 3);
    assertEq(sum.missionsTotal, 3);
    assertEq(sum.turns, 3);
    assert(sum.wordsSpoken > 0, String(sum.wordsSpoken));
    assertEq(sum.score, undefined, "会話に点をつけている");
  });
  test("話した中身がそのまま残る（見返せる）", () => {
    const sum = D.summary(runAll());
    assert(sum.transcript.length >= 7, String(sum.transcript.length));
    assert(sum.transcript.some((t) => t.who === "user" && /coffee/i.test(t.text)));
  });
  test("長くなりすぎたら止める", () => {
    const sc = cafe();
    /* ずっと聞き返し続ける形にする */
    sc.nodes[1].fallbackNodeId = "n1b";
    const s = D.start(sc);
    for (let i = 0; i < 30; i++) D.advance(s, "zzz qqq");
    assert(s.turns.length <= D.MAX_TURNS + 4, String(s.turns.length));
  });
}

report("会話シナリオの進行");
