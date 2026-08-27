/* VocabuSpeak — 教材の型・出題の選び方・履歴・復習

   いちばん確かめたいこと:
   ・同じ英文（Atom）から、別の出し方（Variant）を作れる
   ・まだ出していないものを先に出す
   ・同じセッションで同じものを出さない／同じ family を続けない
   ・全部出し終えたら復習へ移る（黙ってランダムへ戻らない）
   ・作った Variant が、既存の問題形式としてそのまま解ける */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "capability",
  "history", "flags", "store",
  "speak-model", "speak-select", "speak-content", "speak-history"
].map((f) => "domain/" + f + ".js"));

const SM = VQ2.speakModel, SS = VQ2.speakSelect, SH = VQ2.speakHistory;
const M = VQ2.qmodel, EV = VQ2.evaluator, A = VQ2.answerability, V = VQ2.validate;

/* 決まった順で引く乱数（テストのたびに結果が変わらないように） */
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function codes(list) { return (list || []).map((i) => i.code); }

/* ══════════════════════════════════════════════════════════════ */
group("1. レベルとカテゴリー");
{
  test("6 段階そろっている", () => assertEq(SM.LEVELS.length, 6));
  test("日本語と CEFR を並べて出せる", () => assertEq(SM.levelLabel("a2"), "初中級・A2"));
  test("レベルごとに話す速さが違う", () => {
    assert(SM.level("pre_a1").speed < SM.level("b2").speed);
  });
  test("1 段ちがいまでは近いレベルとみなす", () => {
    assertEq(SM.levelNear("a1", "a2"), true);
    assertEq(SM.levelNear("a1", "b1"), false);
  });
}

group("2. 文字をそろえて重複を見つける");
{
  test("大文字・記号・短縮形をそろえる", () => {
    assertEq(SM.normText("I'd like a coffee, please."), SM.normText("i would like a coffee please"));
  });
  test("Can't と cannot は同じ", () => {
    assertEq(SM.normText("I can't go."), SM.normText("I cannot go."));
  });
  test("意味の違う文は同じにならない", () => {
    assert(SM.normText("I like tea.") !== SM.normText("I like coffee."));
  });
  test("完全に同じ英文を見つける", () => {
    const d = SM.findDuplicates([
      { id: "a", english: "Hello.", japanese: "こんにちは。", categoryId: "c", level: "a1", familyId: "f" },
      { id: "b", english: "Hello.", japanese: "こんにちは。", categoryId: "c", level: "a1", familyId: "f" }
    ]);
    assertEq(d.exact.length, 1);
    assertEq(d.shouldRemove[0], "b");
  });
  test("記号だけ違うものも見つける", () => {
    const d = SM.findDuplicates([
      { id: "a", english: "I'd like a coffee, please.", japanese: "コーヒーをお願いします。", categoryId: "c", level: "a1", familyId: "f" },
      { id: "b", english: "I would like a coffee please", japanese: "コーヒーをお願いします。", categoryId: "c", level: "a1", familyId: "f" }
    ]);
    assertEq(d.normalized.length, 1);
  });
  test("意味が近いだけのものは消さない（言い換えとして残す）", () => {
    const d = SM.findDuplicates([
      { id: "a", english: "Can I have a coffee please", japanese: "コーヒーをください。", categoryId: "c", level: "a1", familyId: "f1" },
      { id: "b", english: "Could I have a coffee please", japanese: "コーヒーをいただけますか。", categoryId: "c", level: "a1", familyId: "f2" }
    ], { nearThreshold: 0.7 });
    assertEq(d.near.length, 1);
    assertEq(d.shouldRemove.length, 0);
    assertEq(d.shouldMergeFamily.length, 1, "family をまとめる助言が出ていない");
  });
}

group("3. 教材の検証（作り話を通さない）");
{
  const ok = SM.normalizeAtom({ id: "x1", familyId: "f", level: "a1", categoryId: "cafe",
    english: "I'd like a coffee, please.", japanese: "コーヒーをお願いします。" });
  test("ふつうの英文は通る", () => assertEq(SM.validateAtom(ok).filter((x) => x.level === "error").length, 0));
  test("英文に日本語が混ざっていたら止める", () => {
    const r = SM.validateAtom(Object.assign({}, ok, { english: "I'd like コーヒー." }));
    assert(codes(r).indexOf("japaneseInEnglish") >= 0, codes(r).join(","));
  });
  test("URL は止める（読み上げられない）", () => {
    const r = SM.validateAtom(Object.assign({}, ok, { english: "See https://example.com for more." }));
    assert(codes(r).indexOf("urlInEnglish") >= 0);
  });
  test("レベルに対して長すぎたら知らせる", () => {
    const long = SM.normalizeAtom(Object.assign({}, ok, { level: "pre_a1",
      english: "I would really like to have a large cup of hot coffee with milk and sugar today." }));
    assert(codes(SM.validateAtom(long)).indexOf("tooLong") >= 0);
  });
  test("日本語訳が無ければ知らせる（意味を選ぶ問題を作れない）", () => {
    const r = SM.validateAtom(Object.assign({}, ok, { japanese: "" }));
    assert(codes(r).indexOf("noJapanese") >= 0);
  });
}

group("4. 同じ英文から別の出し方を作る（§11）");
{
  const atom = SM.normalizeAtom({ id: "a1", familyId: "cafe_order", level: "a1", categoryId: "cafe",
    english: "I'd like a cup of coffee, please.", japanese: "コーヒーを一杯お願いします。" });

  function mk(act, content, answer) {
    return SM.normalizeVariant({ id: "a1__" + act, contentAtomId: "a1", familyId: "cafe_order",
      activityType: act, content: content, answerDefinition: answer, status: "published" });
  }
  const cases = [
    ["listening_choice", { script: atom.english, choices: [
      { id: "c1", text: "コーヒーを一杯お願いします。" }, { id: "c2", text: "紅茶をください。" },
      { id: "c3", text: "水をください。" }, { id: "c4", text: "お会計をお願いします。" }] }, "c1"],
    ["dictation", { script: atom.english }, atom.english],
    ["text_fill_blank", { text: "I'd like a cup of 【　】, please.", blanks: [{ id: "b1", answer: "coffee" }] }, null],
    ["sentence_reorder", { items: ["I'd like", "a cup", "of coffee", "please"], japanese: atom.japanese }, null],
    ["translation_to_english", { japanese: atom.japanese }, atom.english],
    ["translation_to_japanese", { english: atom.english }, atom.japanese],
    ["flashcard", { front: atom.japanese, back: atom.english }, atom.english]
  ];

  test("7 通りの出し方すべてが検証を通る", () => {
    cases.forEach(([act, c, ans]) => {
      const v = mk(act, c, ans);
      const bad = SM.validateVariant(v, atom).filter((x) => x.level === "error");
      assertEq(bad.length, 0, act + ": " + bad.map((x) => x.message).join(" / "));
    });
  });

  test("どれも既存の問題形式へ変換できる", () => {
    cases.forEach(([act, c, ans]) => {
      const q = SM.toQuestion(mk(act, c, ans), atom, {});
      assert(q, act + " が問題になりません");
      assert(VQ2.qtypes.get(q.type), act + " → 知らない形式 " + q.type);
    });
  });

  test("変換した問題は、そのまま解ける（既存の検査を通る）", () => {
    cases.forEach(([act, c, ans]) => {
      const q = M.normalize(SM.toQuestion(mk(act, c, ans), atom, {}));
      const r = A.checkAnswerable(q);
      assertEq(r.ok, true, act + ": " + codes(r.issues).join(","));
    });
  });

  test("聞く形式には原稿が入る（架空の音声 URL を作らない）", () => {
    const q = SM.toQuestion(mk("listening_choice", cases[0][1], "c1"), atom, {});
    assertEq(q.script, atom.english);
    assertEq((q.media || []).length, 0);
  });

  test("どの教材から来たかが残る（復習と履歴が辿れる）", () => {
    const q = SM.toQuestion(mk("dictation", { script: atom.english }, atom.english), atom, {});
    assertEq(q.speak.atomId, "a1");
    assertEq(q.speak.familyId, "cafe_order");
    assertEq(q.speak.activityType, "dictation");
  });

  test("同じ部品が 2 つある並べ替えは通さない（順が 1 通りに決まらない）", () => {
    const v = mk("sentence_reorder", { items: ["a cup", "a cup", "of coffee"], japanese: "…" }, null);
    assert(codes(SM.validateVariant(v, atom)).indexOf("duplicateItem") >= 0);
  });
  test("問題文に正解がそのまま出ていたら通さない", () => {
    const v = SM.normalizeVariant({ id: "v", contentAtomId: "a1", familyId: "cafe_order",
      activityType: "translation_to_english", prompt: "I'd like a cup of coffee, please.",
      content: { japanese: "コーヒーを一杯お願いします。" }, answerDefinition: "I'd like a cup of coffee, please." });
    assert(codes(SM.validateVariant(v, atom)).indexOf("answerInPrompt") >= 0);
  });
}

group("5. 声を出す形式は、できたふりをしない");
{
  test("録音できない端末では出さない", () => {
    const use = SM.usableActivities({ canRecord: false, canTranscribe: true });
    assertEq(use.indexOf("pronunciation_practice"), -1);
    assert(use.indexOf("listening_choice") >= 0);
  });
  test("聞き取りが使えないときは出さない（点を作り話さない）", () => {
    const use = SM.usableActivities({ canRecord: true, canTranscribe: false });
    assertEq(use.indexOf("shadowing"), -1);
    assertEq(use.indexOf("pronunciation_practice"), -1);
  });
  test("録音と聞き取りがそろえば出る", () => {
    const use = SM.usableActivities({ canRecord: true, canTranscribe: true });
    assert(use.indexOf("shadowing") >= 0, use.join(","));
    assert(use.indexOf("pronunciation_practice") >= 0);
  });
  test("音素の評価が無いものは「ベータ」と断る", () => {
    assertEq(SM.activityIsBeta("pronunciation_practice"), true);
    assertEq(SM.activityIsBeta("listening_choice"), false);
  });
  test("音を出せない端末では聞く形式が消える", () => {
    const use = SM.usableActivities({ canPlayAudio: false });
    assertEq(use.indexOf("listening_choice"), -1);
    assert(use.indexOf("text_fill_blank") >= 0, "文字だけの形式まで消えている");
  });
}

/* ══════════════════════════════════════════════════════════════ */
group("6. 出題の選び方（§15）");
{
  /* 3 つの family × 3 つの英文 × 4 通りの出し方 */
  const pool = [];
  ["f1", "f2", "f3"].forEach((f, fi) => {
    [1, 2, 3].forEach((n) => {
      ["listening_choice", "dictation", "text_fill_blank", "translation_to_english"].forEach((act) => {
        pool.push({ id: f + "-" + n + "__" + act, contentAtomId: f + "-" + n, familyId: f,
                    activityType: act, level: "a1", categoryId: "cafe", lessonId: "L1", difficulty: 3 });
      });
    });
  });

  test("頼んだ数だけ出る", () => {
    const r = SS.select(pool, { targetCount: 6, level: "a1", random: seeded(1) });
    assertEq(r.total, 6);
  });
  test("同じ出題を 2 回出さない（規則 2）", () => {
    const r = SS.select(pool, { targetCount: 9, level: "a1", random: seeded(2) });
    assertEq(new Set(r.items.map((x) => x.variantId)).size, r.total);
  });
  test("同じ英文を 2 回出さない（規則 3）", () => {
    const r = SS.select(pool, { targetCount: 8, level: "a1", random: seeded(3) });
    assertEq(new Set(r.items.map((x) => x.contentAtomId)).size, r.total);
  });
  test("同じ family を続けない（規則 4）", () => {
    const r = SS.select(pool, { targetCount: 6, level: "a1", random: seeded(4) });
    let run = 0;
    for (let i = 1; i < r.items.length; i++) if (r.items[i].familyId === r.items[i - 1].familyId) run++;
    assertEq(run, 0, r.items.map((x) => x.familyId).join(" "));
  });
  test("まだ出していないものが先に出る（規則 1）", () => {
    const hv = {};
    pool.slice(0, 30).forEach((v) => {
      hv[v.id] = { exerciseVariantId: v.id, seenCount: 3, correctCount: 3, incorrectCount: 0,
                   masteryLevel: 1, lastSeenAt: new Date(Date.now() - 40 * 864e5).toISOString() };
    });
    const r = SS.select(pool, { targetCount: 5, level: "a1", historyByVariant: hv, random: seeded(5) });
    r.items.forEach((it) => assert(!hv[it.variantId], "覚えた問題が先に出た: " + it.variantId));
    assert(r.items.every((x) => x.reason === "はじめての問題"), r.items.map((x) => x.reason).join(","));
  });
  test("すでに覚えたものは、未出題が残っている間は出さない（規則 6）", () => {
    const hv = { "f1-1__dictation": { exerciseVariantId: "f1-1__dictation", seenCount: 5, masteryLevel: 1,
                                      correctCount: 5, incorrectCount: 0,
                                      lastSeenAt: new Date(Date.now() - 30 * 864e5).toISOString() } };
    const r = SS.select(pool, { targetCount: 8, level: "a1", historyByVariant: hv, random: seeded(6) });
    assertEq(r.items.some((x) => x.variantId === "f1-1__dictation"), false);
  });
  test("違うレベルの問題は混ぜない", () => {
    const mixed = pool.concat([{ id: "c1__dictation", contentAtomId: "c1", familyId: "f9",
      activityType: "dictation", level: "c1", categoryId: "cafe", lessonId: "L1", difficulty: 9 }]);
    const r = SS.select(mixed, { targetCount: 8, level: "a1", random: seeded(7) });
    assertEq(r.items.some((x) => x.variantId === "c1__dictation"), false);
  });
  test("形式を絞れる", () => {
    const r = SS.select(pool, { targetCount: 5, level: "a1", activityTypes: ["dictation"], random: seeded(8) });
    assert(r.items.every((x) => x.activityType === "dictation"));
  });
  test("なぜ選んだかが必ず付く", () => {
    const r = SS.select(pool, { targetCount: 4, level: "a1", random: seeded(9) });
    assert(r.items.every((x) => x.reason && x.reason.length > 0));
  });
}

group("7. 出し尽くしたら復習へ（§16）");
{
  const small = [
    { id: "v1", contentAtomId: "a1", familyId: "f1", activityType: "dictation", level: "a1", categoryId: "cafe", lessonId: "L", difficulty: 3 },
    { id: "v2", contentAtomId: "a2", familyId: "f2", activityType: "dictation", level: "a1", categoryId: "cafe", lessonId: "L", difficulty: 3 }
  ];
  test("問題より多く頼まれたら、足りないと正直に言う", () => {
    const r = SS.select(small, { targetCount: 5, level: "a1", random: seeded(10) });
    assertEq(r.total, 2);
    assertEq(r.shortfall, 3);
    assert(r.notes.some((n) => n.indexOf("用意できませんでした") >= 0), r.notes.join(" / "));
  });
  test("水増ししない（同じものを繰り返して数を合わせない）", () => {
    const r = SS.select(small, { targetCount: 5, level: "a1", random: seeded(11) });
    assertEq(new Set(r.items.map((x) => x.variantId)).size, r.total);
  });
  test("同じ英文を別の出し方で出すときは、そう伝える", () => {
    const two = [
      { id: "v1", contentAtomId: "a1", familyId: "f1", activityType: "dictation", level: "a1", categoryId: "cafe", lessonId: "L", difficulty: 3 },
      { id: "v2", contentAtomId: "a1", familyId: "f1", activityType: "text_fill_blank", level: "a1", categoryId: "cafe", lessonId: "L", difficulty: 3 }
    ];
    const r = SS.select(two, { targetCount: 2, level: "a1", random: seeded(12) });
    assertEq(r.total, 2);
    assert(r.notes.some((n) => n.indexOf("別の出し方") >= 0), r.notes.join(" / "));
  });
  test("全部やり終えたら「復習です」と伝える", () => {
    const hv = {};
    small.forEach((v) => { hv[v.id] = { exerciseVariantId: v.id, seenCount: 2, masteryLevel: 1,
      correctCount: 2, incorrectCount: 0, lastSeenAt: new Date(Date.now() - 10 * 864e5).toISOString() }; });
    const r = SS.select(small, { targetCount: 4, level: "a1", historyByVariant: hv, random: seeded(13) });
    assert(r.notes.some((n) => n.indexOf("復習") >= 0), r.notes.join(" / "));
  });
}

group("8. セッションの進み方");
{
  const pool = [];
  ["f1", "f2"].forEach((f) => [1, 2, 3].forEach((n) =>
    ["dictation", "text_fill_blank"].forEach((act) =>
      pool.push({ id: f + n + act, contentAtomId: f + n, familyId: f, activityType: act,
                  level: "a1", categoryId: "cafe", lessonId: "L", difficulty: 3 }))));

  test("1 問ずつ選んでも、同じものが出ない", () => {
    let st = SS.emptySessionState();
    const got = [];
    for (let i = 0; i < 6; i++) {
      const r = SS.select(pool, SS.toContext(st, { targetCount: 1, level: "a1", random: seeded(20 + i) }));
      if (!r.items.length) break;
      got.push(r.items[0].variantId);
      st = SS.advance(st, r.items[0]);
    }
    assertEq(new Set(got).size, got.length, got.join(","));
  });
  test("1 問ずつでも同じ family が続かない", () => {
    let st = SS.emptySessionState();
    const fams = [];
    for (let i = 0; i < 4; i++) {
      const r = SS.select(pool, SS.toContext(st, { targetCount: 1, level: "a1", random: seeded(30 + i) }));
      if (!r.items.length) break;
      fams.push(r.items[0].familyId);
      st = SS.advance(st, r.items[0]);
    }
    let run = 0;
    for (let i = 1; i < fams.length; i++) if (fams[i] === fams[i - 1]) run++;
    assertEq(run, 0, fams.join(" "));
  });
}

/* ══════════════════════════════════════════════════════════════ */
group("9. 履歴と忘却曲線");
{
  test("1 回正解しただけでは「覚えた」にしない", () => {
    const m = SH.nextMastery(0, true, null);
    assert(m < 1, String(m));
  });
  test("間違えると下がる", () => {
    assert(SH.nextMastery(0.8, false, null) < 0.8);
  });
  test("間違えたら次は 1 日後", () => {
    const at = Date.parse(SH.nextReviewAt(0.9, false));
    assert(at - Date.now() < 2 * 864e5, SH.nextReviewAt(0.9, false));
  });
  test("覚えているほど次までの間隔が伸びる", () => {
    const a = Date.parse(SH.nextReviewAt(0.2, true));
    const b = Date.parse(SH.nextReviewAt(1, true));
    assert(b > a, a + " / " + b);
  });

  test("同じ Variant の履歴は 1 行にまとまる（増やさない）", () => {
    SH.clearAll();
    SH.record({ exerciseVariantId: "v1", contentAtomId: "a1", familyId: "f1", activityType: "dictation", correct: true });
    SH.record({ exerciseVariantId: "v1", contentAtomId: "a1", familyId: "f1", activityType: "dictation", correct: false });
    const list = SH.listHistory().filter((x) => x.exerciseVariantId === "v1");
    assertEq(list.length, 1);
    assertEq(list[0].seenCount, 2);
    assertEq(list[0].correctCount, 1);
    assertEq(list[0].incorrectCount, 1);
  });
  test("引くための索引が作れる", () => {
    const ix = SH.indexHistory();
    assert(ix.byVariant.v1, "Variant で引けない");
    assert(ix.byAtom.a1, "英文で引けない");
  });
}

group("10. 復習候補（細かいミスを全部は入れない・§35）");
{
  test("時制の誤りは高い重要度になる", () => {
    assertEq(SH.severityOf({ category: "grammar", grammarTags: ["tense"] }), "high");
  });
  test("冠詞は中くらい", () => {
    assertEq(SH.severityOf({ category: "grammar", grammarTags: ["article"] }), "medium");
  });
  test("大文字・句読点だけの違いは復習に入れない", () => {
    SH.clearAll();
    const r = SH.addReviewCandidates([
      { category: "grammar", originalContent: "i go to school.", correctedContent: "I go to school." }
    ]);
    assertEq(r.added, 0);
    assertEq(r.skipped.length, 1);
  });
  test("意味が変わる誤りは入る", () => {
    SH.clearAll();
    const r = SH.addReviewCandidates([
      { category: "grammar", grammarTags: ["tense"],
        originalContent: "I go to school yesterday.", correctedContent: "I went to school yesterday.",
        explanationJa: "yesterday があるので過去形にします。" }
    ]);
    assertEq(r.added, 1);
    assertEq(SH.listReview().length, 1);
  });
  test("同じミスを繰り返すと、重要度が上がって予定日が近づく", () => {
    SH.clearAll();
    const one = { category: "grammar", grammarTags: ["tense"],
                  originalContent: "I go to school yesterday.", correctedContent: "I went to school yesterday." };
    SH.addReviewCandidates([one]);
    SH.addReviewCandidates([one]);
    const list = SH.listReview();
    assertEq(list.length, 1, "同じミスが 2 行になっている");
    assertEq(list[0].repeatCount, 2);
  });
  test("覚えたら一覧から外れる", () => {
    SH.clearAll();
    SH.addReviewCandidates([{ category: "grammar", grammarTags: ["tense"],
      originalContent: "He go to school.", correctedContent: "He goes to school." }]);
    const id = SH.listReview()[0].id;
    let last = null;
    for (let i = 0; i < 5; i++) {
      last = SH.resolveReview(id, true);
      if (last.resolved) break;          /* 外れたあとは同じ id を引けない */
    }
    assertEq(last.resolved, true);
    assertEq(SH.listReview().length, 0);
  });
}

group("11. セッションと設定");
{
  test("始めて・終えて・一覧に出る", () => {
    SH.clearAll();
    const s = SH.startSession({ activity: "lesson", level: "a1", categoryId: "cafe", lessonId: "L1" });
    SH.finishSession(s.id, { exerciseCount: 5, correctCount: 4, listeningScore: 80 });
    const list = SH.listSessions({});
    assertEq(list.length, 1);
    assertEq(list[0].status, "completed");
    assertEq(list[0].correctCount, 4);
  });
  test("途中で閉じたものを「続きから」で拾える", () => {
    SH.clearAll();
    SH.startSession({ activity: "lesson", level: "a1", lessonId: "L2" });
    assertEq(SH.resumable().length, 1);
  });
  test("設定は既定値から始まり、変えたところだけ上書きされる", () => {
    const p = SH.savePrefs({ speed: 0.75 });
    assertEq(p.speed, 0.75);
    assertEq(p.subtitle, SH.DEFAULT_PREFS.subtitle);
  });
  test("声を出す形式は、既定では出さない（未完成のため）", () => {
    assertEq(SH.DEFAULT_PREFS.includeBeta, false);
  });
  test("音声は既定で長く残さない", () => {
    assertEq(SH.DEFAULT_PREFS.audioRetention, "immediate");
  });
}

group("12. 教材の読み込み（要るぶんだけ取りに行く）");
{
  const C = VQ2.speakContent;
  C.clearCache();
  C.preload({
    curriculum: { categories: [{ id: "cafe", name: "カフェ", groupId: "outing", levels: ["a1"] }],
                  lessons: [{ id: "L1", title: "カフェで注文", categoryId: "cafe", level: "a1" }] },
    index: { "a1/cafe": [["v1", "a1", "f1", "dictation", "L1", 3]] },
    lessons: { "a1/cafe/L1": {
      lesson: { id: "L1" },
      atoms: [{ id: "a1", familyId: "f1", level: "a1", categoryId: "cafe",
                english: "I'd like a coffee, please.", japanese: "コーヒーをお願いします。", status: "published" }],
      variants: [{ id: "v1", contentAtomId: "a1", familyId: "f1", activityType: "dictation",
                   content: { script: "I'd like a coffee, please." },
                   answerDefinition: "I'd like a coffee, please.", status: "published" }]
    } }
  });

  test("目次を読める", async () => {
    const c = await C.curriculum();
    assertEq(c.categories.length, 1);
    assertEq(c.lessons.length, 1);
  });
  test("索引から候補を集められる", async () => {
    const p = await C.pool({ level: "a1", categoryIds: ["cafe"] });
    assertEq(p.length, 1);
    assertEq(p[0].activityType, "dictation");
  });
  test("選んだものだけ本体を読み込む", async () => {
    const p = await C.pool({ level: "a1", categoryIds: ["cafe"] });
    const r = SS.select(p, { targetCount: 1, level: "a1", random: seeded(40) });
    const h = await C.hydrate(r.items);
    assertEq(h.items.length, 1);
    assertEq(h.missing.length, 0);
    assertEq(h.items[0].atom.english, "I'd like a coffee, please.");
  });
  test("読み込んだものが、そのまま解ける問題になる", async () => {
    const p = await C.pool({ level: "a1" });
    const r = SS.select(p, { targetCount: 1, level: "a1", random: seeded(41) });
    const h = await C.hydrate(r.items);
    const qs = C.toQuestions(h, {});
    assertEq(qs.questions.length, 1);
    const q = M.normalize(qs.questions[0]);
    assertEq(A.checkAnswerable(q).ok, true, codes(A.checkAnswerable(q).issues).join(","));
    /* 正しい答えで満点になる */
    const g = EV.evaluate(q, { text: "I'd like a coffee, please." });
    assertEq(g.score, g.maxScore, JSON.stringify(g));
  });
  test("見つからない教材は黙って落とさず、理由を返す", async () => {
    const h = await C.hydrate([{ variantId: "zzz", variant: { id: "zzz", level: "a1", categoryId: "cafe", lessonId: "L1" } }]);
    assertEq(h.items.length, 0);
    assertEq(h.missing.length, 1);
    assert(h.missing[0].reason.length > 0);
  });
}

report("VocabuSpeak（教材・出題・履歴・復習）");
