/* ══════════════════════════════════════════════════════════════════════
   Phase A 単体テスト
   ・Schema Validation / Legacy Preset Adapter / MockSpec Validation
   ・Score Allocator / Criterion Allocation / AnswerBinding
   ・Session State Machine / Feature Flags / Store（分離・競合・容量）
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, ROOT,
  group, test, assert, assertEq, assertDeep, assertThrows,
  hasError, errorCodes, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2();
const S = VQ2.schema, V = VQ2.validate, A = VQ2.adapter, SA = VQ2.scoreAllocator, F = VQ2.flags, ST = VQ2.store;

/* V3 から、「まだ書いていない」は保存では止めず、**出題・公開の直前**で止める。
   作りはじめた瞬間に画面じゅうが要修正になり、手が止まっていたため。
   保護そのものは無くしていない。止める場所を移しただけなので、
   ここでは「出題の直前は止まる」「編集中は要修正にしない」の両方を確かめる。 */
const PLAY = { requireAnswerable: true, requireRubric: true };


/* ────────────────────────────────────────────────────────────────
   ヘルパ：最小の正しい MockSpec を組み立てる
   ──────────────────────────────────────────────────────────────── */
function mkQuestion(o) {
  return Object.assign({
    id: "q1", schemaVersion: 2, sectionId: "s1", number: 1,
    type: "multiple_choice_single", prompt: "問題文", explanation: "解説",
    choices: [
      { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false }
    ],
    correctAnswer: null, acceptedAnswers: [],
    difficulty: "normal", topic: "", tags: [], points: 10, estimatedSeconds: 60,
    sourceReferences: [], requiresReview: false, validationIssues: [],
    answerBindingId: "b1"
  }, o || {});
}
function mkSpec(o) {
  const q1 = mkQuestion({ id: "q1", number: 1, answerBindingId: "b1", points: 60 });
  const q2 = mkQuestion({ id: "q2", number: 2, answerBindingId: "b2", points: 40 });
  return Object.assign({
    id: "mock1", schemaVersion: 2, ownerId: "local",
    title: "テスト試験", subject: "日本史", grade: "高3", audience: "高校3年",
    durationMinutes: 50, totalPoints: 100, instructions: "",
    sourceMode: "source-only", sourceReferences: [],
    paper: S.defaultPaper(),
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: 100, questions: [q1, q2] }],
    answerBindings: [
      { id: "b1", questionId: "q1", number: "1", inputType: "multiple_choice_single", points: 60 },
      { id: "b2", questionId: "q2", number: "2", inputType: "multiple_choice_single", points: 40 }
    ]
  }, o || {});
}

/* ══════════════════════════════════════════════════════════════════
   1. Schema Validation
   ══════════════════════════════════════════════════════════════════ */
group("1. Schema Validation");

test("正しい Preset は error 0 件", () => {
  const p = S.emptyPreset({ name: "テスト", questions: [mkQuestion()] });
  const issues = V.validatePresetForSave(p);
  assertEq(V.errorsOf(issues).length, 0, "error: " + JSON.stringify(errorCodes(issues)));
});

test("必須項目の欠落を検出する", () => {
  const issues = S.validatePreset({ id: "p1" }, []);
  assert(hasError(issues, "required"), "required が出ていない");
});

test("未知の問題形式を拒否する", () => {
  const p = S.emptyPreset({ name: "x", questions: [mkQuestion({ type: "telepathy" })] });
  assert(hasError(V.validatePresetForSave(p), "enum"), "enum が出ていない");
});

test("Schema version が新しすぎるデータを拒否する", () => {
  const p = S.emptyPreset({ name: "x", schemaVersion: 99, questions: [mkQuestion()] });
  assert(hasError(V.validatePresetForSave(p), "schemaVersion"));
});

test("Question ID の重複を検出する", () => {
  const p = S.emptyPreset({ name: "x", questions: [mkQuestion({ id: "dup" }), mkQuestion({ id: "dup" })] });
  assert(hasError(V.validatePresetForSave(p), "duplicateQuestionId"));
});

test("Choice ID の重複を検出する", () => {
  const q = mkQuestion({ choices: [
    { id: "c1", text: "a", isCorrect: true }, { id: "c1", text: "b", isCorrect: false }
  ]});
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p), "duplicateChoiceId"));
});

test("正解が 1 つも無い選択問題を、出題の直前に止める", () => {
  const q = mkQuestion({ choices: [
    { id: "c1", text: "a", isCorrect: false }, { id: "c2", text: "b", isCorrect: false }
  ]});
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p, PLAY), "noCorrectChoice"), "出題の直前に止まらない");
  assert(!hasError(V.validatePresetForSave(p), "noCorrectChoice"), "編集中に要修正にしている");
});

test("単一選択で正解が複数あるものを拒否する", () => {
  const q = mkQuestion({ choices: [
    { id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b", isCorrect: true }
  ]});
  assert(hasError(V.validatePresetForSave(S.emptyPreset({ name: "x", questions: [q] })), "tooManyCorrect"));
});

test("選択肢が 1 件しかない四択問題を、出題の直前に止める", () => {
  const q = mkQuestion({ choices: [{ id: "c1", text: "a", isCorrect: true }] });
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p, PLAY), "choiceCount"), "出題の直前に止まらない");
  assert(!hasError(V.validatePresetForSave(p), "choiceCount"), "編集中に要修正にしている");
});

test("空白だけの問題文を、出題の直前に止める", () => {
  const q = mkQuestion({ prompt: "   " });
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p, PLAY), "emptyPrompt"), "出題の直前に止まらない");
  assert(!hasError(V.validatePresetForSave(p), "emptyPrompt"), "編集中に要修正にしている");
});

test("問題文そのものが無いものを、出題の直前に止める", () => {
  const q = mkQuestion({ prompt: "" });
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p, PLAY), "emptyPrompt"), "出題の直前に止まらない");
  assert(!V.validatePresetForSave(p).some((i) => i.severity === "error"), "編集中に要修正にしている");
});


test("空の正解（記述以外）を、出題の直前に止める", () => {
  const q = mkQuestion({ type: "short_answer", choices: [], correctAnswer: "", acceptedAnswers: [] });
  const p = S.emptyPreset({ name: "x", questions: [q] });
  assert(hasError(V.validatePresetForSave(p, PLAY), "emptyAnswer"), "出題の直前に止まらない");
  assert(!hasError(V.validatePresetForSave(p), "emptyAnswer"), "編集中に要修正にしている");
});

test("負の配点を拒否する", () => {
  const q = mkQuestion({ points: -5 });
  assert(hasError(V.validatePresetForSave(S.emptyPreset({ name: "x", questions: [q] })), "min"));
});

test("同じ本文の選択肢が 2 つあるものを拒否する", () => {
  const q = mkQuestion({ choices: [
    { id: "c1", text: "同じ", isCorrect: true }, { id: "c2", text: "同じ", isCorrect: false }
  ]});
  assert(hasError(V.validatePresetForSave(S.emptyPreset({ name: "x", questions: [q] })), "duplicateChoiceText"));
});

/* ══════════════════════════════════════════════════════════════════
   2. SourceReference
   ══════════════════════════════════════════════════════════════════ */
group("2. SourceReference");

test("ページ番号があるのに資料が特定できない出典を拒否する", () => {
  const q = mkQuestion({ sourceReferences: [{ id: "s1", sourceType: "pdf", page: 3 }] });
  assert(hasError(V.validatePresetForSave(S.emptyPreset({ name: "x", questions: [q] })), "orphanSource"));
});

test("正しい出典は通る", () => {
  const q = mkQuestion({ sourceReferences: [
    { id: "s1", sourceType: "pdf", sourceName: "プリント.pdf", page: 3, excerpt: "…", confidence: 0.9, verified: true }
  ]});
  assertEq(V.errorsOf(V.validatePresetForSave(S.emptyPreset({ name: "x", questions: [q] }))).length, 0);
});

test("画像由来の region を検証する（座標系が必須）", () => {
  const bad = [];
  S.validateSourceReference({ id: "s1", sourceType: "image", sourceName: "a.png",
    region: { page: 1, x: 0, y: 0, width: 10, height: 10 } }, "sr", bad);
  assert(hasError(bad, "required"), "coordinateSystem の欠落を見逃した");
  const good = [];
  S.validateSourceReference({ id: "s1", sourceType: "image", sourceName: "a.png",
    region: { page: 1, x: 0, y: 0, width: 10, height: 10, coordinateSystem: "normalized" } }, "sr", good);
  assertEq(V.errorsOf(good).length, 0);
});

test("幅・高さが 0 の領域を拒否する", () => {
  const out = [];
  S.validateSourceReference({ id: "s1", sourceType: "image", sourceName: "a.png",
    region: { page: 1, x: 0, y: 0, width: 0, height: 10, coordinateSystem: "normalized" } }, "sr", out);
  assert(hasError(out, "range"));
});

test("pageEnd < pageStart を拒否する", () => {
  const out = [];
  S.validateSourceReference({ id: "s1", sourceType: "pdf", sourceName: "a.pdf", pageStart: 5, pageEnd: 2 }, "sr", out);
  assert(hasError(out, "range"));
});

/* ══════════════════════════════════════════════════════════════════
   3. Legacy Preset Adapter
   ══════════════════════════════════════════════════════════════════ */
group("3. Legacy Preset Adapter");

const presetDir = join(ROOT, "assets", "presets");
const presetFiles = readdirSync(presetDir).filter((f) => f.endsWith("_import.json"));

/* 本体は「cards が空なら words を読む」。実効的な出題元はそちらに合わせる。 */
function effectiveList(v1) {
  return (Array.isArray(v1.cards) && v1.cards.length) ? v1.cards : (v1.words || []);
}

test("実データの V1 プリセットを 3 本とも V2 へ変換できる", () => {
  assert(presetFiles.length >= 3, "テスト対象のプリセットが足りません");
  for (const f of presetFiles) {
    const v1 = JSON.parse(readFileSync(join(presetDir, f), "utf8"));
    const v2 = A.presetToV2(v1);
    assertEq(v2.schemaVersion, 2, f);
    assert(v2.questions.length > 0, f + ": 問題が 0 件");
    assertEq(v2.questions.length, effectiveList(v1).length, f + ": 問題数が合わない");
  }
});

test("cards を持つプリセットは往復で cards の内容が保たれる", () => {
  let checked = 0;
  for (const f of presetFiles) {
    const v1 = JSON.parse(readFileSync(join(presetDir, f), "utf8"));
    if (!(Array.isArray(v1.cards) && v1.cards.length)) continue;
    const back = A.presetToV1(A.presetToV2(v1));
    assertEq(back.cards.length, v1.cards.length, f + ": カード数");
    for (let i = 0; i < v1.cards.length; i++) {
      const a = v1.cards[i], b = back.cards[i];
      assertEq(b.id, a.id, f + ` card[${i}].id`);
      assertEq(b.front, a.front, f + ` card[${i}].front`);
      assertEq(b.back, a.back, f + ` card[${i}].back`);
      assertEq(b.explanation, a.explanation, f + ` card[${i}].explanation`);
      assertDeep(b.choices, a.choices, f + ` card[${i}].choices`);
      assertEq(b.correctIndex, a.correctIndex, f + ` card[${i}].correctIndex`);
      assertDeep(b.tags, a.tags, f + ` card[${i}].tags`);
      assertEq(b.questionKind, a.questionKind, f + ` card[${i}].questionKind`);
    }
    checked++;
  }
  assert(checked >= 2, "cards を持つプリセットが足りません: " + checked);
});

test("words だけのプリセットは往復で words の内容が保たれ、cards を勝手に生やさない", () => {
  let checked = 0;
  for (const f of presetFiles) {
    const v1 = JSON.parse(readFileSync(join(presetDir, f), "utf8"));
    if (Array.isArray(v1.cards) && v1.cards.length) continue;
    const back = A.presetToV1(A.presetToV2(v1));
    assert(!(back.cards && back.cards.length), f + ": cards を勝手に作った");
    assertEq(back.words.length, v1.words.length, f + ": words 数");
    for (let i = 0; i < v1.words.length; i++) {
      const a = v1.words[i], b = back.words[i];
      assertEq(b.id, a.id, f + ` word[${i}].id`);
      assertEq(b.word, a.word, f + ` word[${i}].word`);
      assertEq(b.meaning, a.meaning, f + ` word[${i}].meaning`);
      assertDeep(b.mcq, a.mcq, f + ` word[${i}].mcq`);
      assertDeep(b.meta, a.meta, f + ` word[${i}].meta`);
      assertEq(b.explanation, a.explanation, f + ` word[${i}].explanation`);
      assertDeep(b.tags, a.tags, f + ` word[${i}].tags`);
    }
    checked++;
  }
  assert(checked >= 1, "words だけのプリセットが見つかりません");
});

test("実データ 3 本すべてで、往復後の差分が 0 件（id が無い取り込み用ファイルを除く）", () => {
  for (const f of presetFiles) {
    const v1 = JSON.parse(readFileSync(join(presetDir, f), "utf8"));
    let diffs = A.roundTripDiff(v1);
    /* 取り込み用 JSON には id が無いものがある。V2 は id を必須にするので
       ここでの id 付与だけは避けられない。それ以外の差分は 0 でなければならない。 */
    if (v1.id === undefined) diffs = diffs.filter((d) => d.path !== "id");
    assertEq(diffs.length, 0, f + ": 差分 " + JSON.stringify(diffs.slice(0, 4)));
  }
});

/* 本体（client/index.html の normalizeCardEntry）が実際に適用する足切り。
   ここを通らないカードは V1 側で黙って消える。 */
function v1Accepts(card) {
  const id = Number(card && card.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const front = String((card && (card.front ?? card.word)) ?? "").trim();
  const back = String((card && (card.back ?? card.meaning)) ?? "").trim();
  return !!(front && back);
}

test("V2 で作ったプリセットが V1 側で 1 枚も消えない", () => {
  const p = S.emptyPreset({
    name: "V2 で作成",
    questions: [
      mkQuestion({ id: S.newId("q"), prompt: "問1" }),
      mkQuestion({ id: S.newId("q"), prompt: "問2" }),
      mkQuestion({ id: S.newId("q"), prompt: "問3" })
    ]
  });
  const v1 = A.presetToV1(p);
  assertEq(v1.cards.length, 3, "カード数");
  const kept = v1.cards.filter(v1Accepts);
  assertEq(kept.length, 3, "V1 が受け付けたカード: " + JSON.stringify(v1.cards.map((c) => ({ id: c.id, back: c.back }))));
  assertEq(v1.words.filter(v1Accepts).length, 3, "words 側");
});

test("V2 の文字列 ID が正の整数へ振り直される", () => {
  const p = S.emptyPreset({ name: "x", questions: [
    mkQuestion({ id: "q_abc_def" }), mkQuestion({ id: "q_ghi_jkl" })
  ]});
  const ids = A.presetToV1(p).cards.map((c) => c.id);
  ids.forEach((id) => assert(Number.isInteger(id) && id > 0, "整数でない ID: " + id));
  assertEq(new Set(ids).size, 2, "ID が重複した");
});

test("既存の数値 ID は振り直されない", () => {
  const v1 = { id: "p", name: "n", cards: [
    { id: 7, front: "f7", back: "b7" }, { id: 3, front: "f3", back: "b3" }
  ]};
  const back = A.presetToV1(A.presetToV2(v1));
  assertDeep(back.cards.map((c) => c.id), [7, 3]);
});

test("数値 ID と文字列 ID が混ざっても衝突しない", () => {
  const v2 = A.presetToV2({ id: "p", name: "n", cards: [{ id: 1, front: "f", back: "b" }] });
  v2.questions.push(mkQuestion({ id: "q_new_one" }), mkQuestion({ id: "q_new_two" }));
  const ids = A.presetToV1(v2).cards.map((c) => c.id);
  assertEq(new Set(ids).size, 3, "ID が重複: " + ids);
  assert(ids.indexOf(1) >= 0, "既存 ID 1 が失われた");
});

test("記述式（正答なし）でも V1 に残る", () => {
  const q = mkQuestion({ id: S.newId("q"), type: "long_answer", choices: [],
    correctAnswer: null, acceptedAnswers: [], explanation: "根拠を2つ挙げられていれば可。",
    scoringRubric: { items: [
      { id: "r1", description: "根拠", points: 1, criterionId: "thinking_judgment_expression" }
    ]}, points: 1 });
  const v1 = A.presetToV1(S.emptyPreset({ name: "x", questions: [q] }));
  assertEq(v1.cards.length, 1);
  assert(v1Accepts(v1.cards[0]), "V1 に捨てられる: " + JSON.stringify(v1.cards[0]));
  assertEq(v1.cards[0].back, "根拠を2つ挙げられていれば可。", "解説の1行目が使われていない");
});

test("解説も正答も無い記述式には形式名を入れる（内容を捏造しない）", () => {
  const q = mkQuestion({ id: S.newId("q"), type: "essay", choices: [],
    correctAnswer: null, acceptedAnswers: [], explanation: "" });
  const v1 = A.presetToV1(S.emptyPreset({ name: "x", questions: [q] }));
  assertEq(v1.cards[0].back, "（記述式）");
  assert(v1Accepts(v1.cards[0]));
});

test("選択問題は正解の本文が back になる", () => {
  const q = mkQuestion({ id: S.newId("q"), choices: [
    { id: "c1", label: "A", text: "正しい答え", explanation: "", isCorrect: true },
    { id: "c2", label: "B", text: "誤り", explanation: "", isCorrect: false }
  ]});
  const v1 = A.presetToV1(S.emptyPreset({ name: "x", questions: [q] }));
  assertEq(v1.cards[0].back, "正しい答え");
});

test("元に無かった項目を空の既定値で生やさない", () => {
  const bare = { name: "最小", cards: [{ id: 1, front: "f", back: "b" }] };
  const back = A.presetToV1(A.presetToV2(bare));
  assertEq(back.description, undefined, "description を生やした");
  assertEq(back.visibility, undefined, "visibility を生やした");
  assertEq(back.subjects, undefined, "subjects を生やした");
  assertEq(back.modes, undefined, "modes を生やした");
});

test("V2 で値を入れた項目は書き戻される", () => {
  const bare = { name: "最小", cards: [{ id: 1, front: "f", back: "b" }] };
  const v2 = A.presetToV2(bare);
  v2.description = "V2 で書いた説明";
  v2.visibility = "public";
  const back = A.presetToV1(v2);
  assertEq(back.description, "V2 で書いた説明");
  assertEq(back.visibility, "public");
});

test("V1 固有フィールド（switch / diagram）が往復で失われない", () => {
  const v1 = {
    id: "p", name: "n", cards: [{
      id: 1, front: "f", back: "b", frontFormat: "text", backFormat: "text",
      questionKind: "vocabu", switch: { prompt: "p", answer: "a" },
      diagram: { kind: "triangle", a: 3 }, aiPrompt: "描いて"
    }]
  };
  const back = A.presetToV1(A.presetToV2(v1));
  assertDeep(back.cards[0].switch, v1.cards[0].switch);
  assertDeep(back.cards[0].diagram, v1.cards[0].diagram);
  assertEq(back.cards[0].aiPrompt, v1.cards[0].aiPrompt);
});

test("変換した V1 プリセットが V2 の検証を error なしで通る", () => {
  for (const f of presetFiles) {
    const v1 = JSON.parse(readFileSync(join(presetDir, f), "utf8"));
    const v2 = A.presetToV2(v1);
    const issues = V.validatePresetForSave(v2);
    assertEq(V.errorsOf(issues).length, 0, f + ": " + JSON.stringify(errorCodes(issues).slice(0, 5)));
  }
});

test("すでに V2 のものは二重変換されない", () => {
  const v2 = S.emptyPreset({ name: "x", questions: [mkQuestion()] });
  const again = A.presetToV2(v2);
  assertEq(again.questions.length, 1);
  assertEq(again.questions[0].id, "q1", "ID が書き換えられた");
});

test("words しか無い古い形式も読める", () => {
  const v1 = { id: "p", name: "n", words: [
    { id: 1, word: "apple", meaning: "りんご", mcq: { choices: ["りんご", "みかん"], correctIndex: 0 } }
  ]};
  const v2 = A.presetToV2(v1);
  assertEq(v2.questions.length, 1);
  assertEq(v2.questions[0].type, "multiple_choice_single");
  assertEq(v2.questions[0].choices[0].isCorrect, true);
});

test("正解が示されていない選択肢問題に、勝手な正解を作らない", () => {
  const v1 = { id: "p", name: "n", cards: [
    { id: 1, front: "f", back: "b", choices: ["a", "b", "c"] }   /* correctIndex 無し */
  ]};
  const v2 = A.presetToV2(v1);
  assertEq(v2.questions[0].choices.filter((c) => c.isCorrect).length, 0, "正解を捏造した");
  assert(hasError(V.validatePresetForSave(v2, { requireAnswerable: true }), "noCorrectChoice"),
    "出題の直前に捕まえられていない");
});

/* ── 見た目（アイコン・バナー）───────────────────────────────── */

const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";

test("アイコンとバナーが V1 との往復で保たれる", () => {
  const p = S.emptyPreset({ name: "見た目つき", questions: [] });
  p.appearance = { icon: "📘", iconImage: "", banner: PNG1 };
  const v1 = A.presetToV1(p);
  assertEq(v1.appearance.icon, "📘");
  assertEq(v1.appearance.banner, PNG1);
  const back = A.presetToV2(v1);
  assertEq(back.appearance.icon, "📘");
  assertEq(back.appearance.banner, PNG1);
});

test("見た目を設定していないプリセットに、空の appearance を生やさない", () => {
  const v1 = { id: "p", name: "n", cards: [{ id: 1, front: "f", back: "b" }] };
  const v2 = A.presetToV2(v1);
  const out = A.presetToV1(v2);
  assert(!("appearance" in out), "空の appearance を書き出した: " + JSON.stringify(out.appearance));
});

test("外部 URL の画像は受け付けない", () => {
  const p = S.emptyPreset({ name: "外部画像", questions: [] });
  p.appearance = { icon: "", iconImage: "", banner: "https://example.com/b.png" };
  assert(hasError(V.validatePresetForSave(p), "imageNotEmbedded"), "外部 URL を通した");
  /* 変換でも落とす */
  assertEq(A.presetToV2({ id: "p", name: "n", cards: [], appearance: { banner: "https://x/y.png" } }).appearance.banner, "");
});

test("大きすぎる画像は保存させない（数字つきで伝える）", () => {
  const p = S.emptyPreset({ name: "重い画像", questions: [] });
  p.appearance = { icon: "", iconImage: "", banner: "data:image/jpeg;base64," + "A".repeat(800 * 1024) };
  const issues = V.validatePresetForSave(p);
  assert(hasError(issues, "imageTooLarge"), "上限を超えた画像を通した");
  const msg = issues.filter((i) => i.code === "imageTooLarge")[0].message;
  assert(/KB/.test(msg), "大きさを数字で伝えていない: " + msg);
});

/* ══════════════════════════════════════════════════════════════════
   4. MockSpec Validation
   ══════════════════════════════════════════════════════════════════ */
group("4. MockSpec Validation");

test("正しい MockSpec は error 0 件", () => {
  const issues = V.validateMockSpecForSave(mkSpec());
  assertEq(V.errorsOf(issues).length, 0, JSON.stringify(errorCodes(issues)));
});

test("配点合計が満点と違うものを拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[1].points = 30;      /* 60 + 30 = 90 ≠ 100 */
  s.answerBindings[1].points = 30;
  s.sections[0].points = 90;
  assert(hasError(V.validateMockSpecForSave(s), "totalScoreMismatch"));
});

test("大問小計が問題の合計と違うものを拒否する", () => {
  const s = mkSpec();
  s.sections[0].points = 999;
  assert(hasError(V.validateMockSpecForSave(s), "sectionSumMismatch"));
});

test("問題番号の欠番を検出する", () => {
  const s = mkSpec();
  s.sections[0].questions[1].number = 3;       /* 1, 3 → 2 が欠番 */
  assert(hasError(V.validateMockSpecForSave(s), "missingNumber"));
});

test("問題番号の重複を検出する", () => {
  const s = mkSpec();
  s.sections[0].questions[1].number = 1;
  assert(hasError(V.validateMockSpecForSave(s), "duplicateNumber"));
});

test("AnswerBinding が欠けている問題を拒否する", () => {
  const s = mkSpec();
  delete s.sections[0].questions[1].answerBindingId;
  assert(hasError(V.validateMockSpecForSave(s), "required") || hasError(V.validateMockSpecForSave(s), "missingAnswerBinding"));
});

test("存在しない AnswerBinding を指す問題を拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[1].answerBindingId = "nope";
  assert(hasError(V.validateMockSpecForSave(s), "danglingAnswerBinding"));
});

test("問題の無い AnswerBinding を拒否する", () => {
  const s = mkSpec();
  s.answerBindings.push({ id: "b9", questionId: "q99", number: "9", inputType: "short_answer", points: 0 });
  assert(hasError(V.validateMockSpecForSave(s), "orphanAnswerBinding"));
});

test("AnswerBinding ID の重複を検出する", () => {
  const s = mkSpec();
  s.answerBindings[1].id = "b1";
  assert(hasError(V.validateMockSpecForSave(s), "duplicateBindingId"));
});

test("回答欄の配点が問題の配点と違うものを拒否する", () => {
  const s = mkSpec();
  s.answerBindings[0].points = 5;
  assert(hasError(V.validateMockSpecForSave(s), "bindingPointsMismatch"));
});

test("回答欄の形式が問題の形式と違うものを拒否する", () => {
  const s = mkSpec();
  s.answerBindings[0].inputType = "essay";
  assert(hasError(V.validateMockSpecForSave(s), "bindingTypeMismatch"));
});

test("試験では 0 点問題を拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[0].points = 0;
  s.sections[0].questions[1].points = 100;
  s.answerBindings[0].points = 0; s.answerBindings[1].points = 100;
  s.sections[0].points = 100;
  assert(hasError(V.validateMockSpecForSave(s), "zeroPoints"));
});

test("記述式に Rubric が無いものを試験では拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[1].type = "long_answer";
  s.sections[0].questions[1].choices = [];
  s.answerBindings[1].inputType = "long_answer";
  assert(hasError(V.validateMockSpecForSave(s), "missingRubric"));
});

test("Rubric の合計が配点と違うものを拒否する", () => {
  const s = mkSpec();
  const q = s.sections[0].questions[1];
  q.type = "long_answer"; q.choices = [];
  q.scoringRubric = { items: [
    { id: "r1", description: "観点1", points: 10, criterionId: "thinking_judgment_expression" }
  ]};                                          /* 10 ≠ 40 */
  s.answerBindings[1].inputType = "long_answer";
  assert(hasError(V.validateMockSpecForSave(s), "rubricSumMismatch"));
});

test("紙面設定が無いものを拒否する", () => {
  const s = mkSpec(); delete s.paper;
  assert(hasError(V.validateMockSpecForSave(s), "required"));
});

test("custom 用紙でサイズ指定が無いものを拒否する", () => {
  const s = mkSpec();
  s.paper.size = "custom";
  assert(hasError(V.validateMockSpecForSave(s), "required"));
});

/* ══════════════════════════════════════════════════════════════════
   5. 観点別評価（Criterion Allocation）
   ══════════════════════════════════════════════════════════════════ */
group("5. Criterion Allocation");

test("観点別合計が配点と違うものを拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[0].criterionAllocation = [
    { criterionId: "knowledge_skill", points: 10 },
    { criterionId: "thinking_judgment_expression", points: 10 }
  ];                                            /* 20 ≠ 60 */
  assert(hasError(V.validateMockSpecForSave(s), "criterionSumMismatch"));
});

test("同じ観点が 2 回出てくるものを拒否する", () => {
  const s = mkSpec();
  s.sections[0].questions[0].criterionAllocation = [
    { criterionId: "knowledge_skill", points: 30 },
    { criterionId: "knowledge_skill", points: 30 }
  ];
  assert(hasError(V.validateMockSpecForSave(s), "duplicateCriterion"));
});

test("未定義の観点を拒否する（主体的に取り組む態度は正式得点にしない）", () => {
  const out = [];
  S.validateCriterionAllocation([{ criterionId: "attitude", points: 10 }], "ca", out);
  assert(hasError(out, "enum"));
});

test("seedCriterionAllocation は配点と一致する割り当てを作る", () => {
  const s = SA.seedCriterionAllocation(mkSpec());
  s.sections[0].questions.forEach((q) => {
    const sum = q.criterionAllocation.reduce((a, b) => a + b.points, 0);
    assertEq(sum, q.points, "問題 " + q.id);
  });
  assertEq(V.errorsOf(V.validateMockSpecForSave(s)).length, 0);
});

test("記述式は思考・判断・表現に重く配分される", () => {
  const s = mkSpec();
  s.sections[0].questions[0].type = "essay";
  const seeded = SA.seedCriterionAllocation(s);
  const ca = seeded.sections[0].questions[0].criterionAllocation;
  const think = ca.find((c) => c.criterionId === "thinking_judgment_expression").points;
  const know = ca.find((c) => c.criterionId === "knowledge_skill").points;
  assert(think > know, `思考 ${think} <= 知識 ${know}`);
});

/* ══════════════════════════════════════════════════════════════════
   6. Score Allocator
   ══════════════════════════════════════════════════════════════════ */
group("6. Score Allocator");

function specWithN(n, target, per) {
  const questions = [], bindings = [];
  for (let i = 0; i < n; i++) {
    questions.push(mkQuestion({ id: "q" + (i + 1), number: i + 1, answerBindingId: "b" + (i + 1),
      points: per === undefined ? 1 : per }));
    bindings.push({ id: "b" + (i + 1), questionId: "q" + (i + 1), number: String(i + 1),
      inputType: "multiple_choice_single", points: per === undefined ? 1 : per });
  }
  return mkSpec({
    totalPoints: target,
    sections: [{ id: "s1", number: 1, title: "大問1", points: 0, questions }],
    answerBindings: bindings
  });
}

test("20 問を 100 点へ配分できる（割り切れる）", () => {
  const r = SA.allocate(specWithN(20, 100), { targetTotal: 100 });
  assert(r.ok, JSON.stringify(r.issues));
  const total = r.spec.sections[0].questions.reduce((a, q) => a + q.points, 0);
  assertEq(total, 100);
});

test("7 問を 100 点へ配分できる（割り切れない）", () => {
  const r = SA.allocate(specWithN(7, 100), { targetTotal: 100 });
  assert(r.ok, JSON.stringify(r.issues));
  const pts = r.spec.sections[0].questions.map((q) => q.points);
  assertEq(pts.reduce((a, b) => a + b, 0), 100);
  assert(pts.every((p) => Number.isInteger(p)), "整数でない配点がある: " + pts);
  assert(pts.every((p) => p >= 1), "0 点以下の問題がある: " + pts);
});

test("3 問を 100 点へ配分すると 34/33/33 になる", () => {
  const r = SA.allocate(specWithN(3, 100), { targetTotal: 100 });
  assert(r.ok);
  const pts = r.spec.sections[0].questions.map((q) => q.points).sort((a, b) => b - a);
  assertDeep(pts, [34, 33, 33]);
});

test("1〜60 問 × 満点 10〜300 の全組み合わせで必ず合計が一致する", () => {
  let checked = 0;
  for (let n = 1; n <= 60; n++) {
    for (const target of [10, 50, 100, 120, 150, 200, 300]) {
      if (target < n) continue;                 /* 1 問 1 点未満は作れない */
      const r = SA.allocate(specWithN(n, target), { targetTotal: target });
      assert(r.ok, `n=${n} target=${target}: ${JSON.stringify(r.issues)}`);
      const pts = r.spec.sections[0].questions.map((q) => q.points);
      assertEq(pts.reduce((a, b) => a + b, 0), target, `n=${n} target=${target}`);
      assert(pts.every((p) => Number.isInteger(p) && p >= 1), `n=${n} target=${target}: ${pts}`);
      checked++;
    }
  }
  assert(checked > 300, "検査した組み合わせが少なすぎます: " + checked);
});

test("問題数が満点を超える場合は不可能として報告する（満点を勝手に変えない）", () => {
  const r = SA.allocate(specWithN(120, 100), { targetTotal: 100 });
  assertEq(r.ok, false);
  assert(hasError(r.issues, "cannotReachTotal"), JSON.stringify(r.issues));
  assertEq(r.spec.totalPoints, 100, "満点が書き換えられた");
});

test("全問 3 点固定で 100 点にできないことを説明つきで報告する（§18 の例）", () => {
  const s = specWithN(20, 100, 3);
  s.sections[0].questions.forEach((q) => { q.lockedPoints = true; });
  const r = SA.allocate(s, { targetTotal: 100 });
  assertEq(r.ok, false);
  assert(hasError(r.issues, "allLocked"), JSON.stringify(r.issues));
  const msg = r.issues.find((i) => i.code === "allLocked").message;
  assert(msg.includes("60") && msg.includes("100"), "実際の数字が説明に入っていない: " + msg);
});

test("固定配点は保護され、残りだけが再配分される", () => {
  const s = specWithN(5, 100);
  s.sections[0].questions[0].points = 40;
  s.sections[0].questions[0].lockedPoints = true;
  const r = SA.allocate(s, { targetTotal: 100 });
  assert(r.ok, JSON.stringify(r.issues));
  assertEq(r.spec.sections[0].questions[0].points, 40, "固定配点が動いた");
  assertEq(r.spec.sections[0].questions.reduce((a, q) => a + q.points, 0), 100);
});

test("固定配点の合計が満点を超える場合を報告する", () => {
  const s = specWithN(3, 100);
  s.sections[0].questions.forEach((q) => { q.points = 50; q.lockedPoints = true; });
  const r = SA.allocate(s, { targetTotal: 100 });
  assertEq(r.ok, false);
  assert(hasError(r.issues, "allLocked") || hasError(r.issues, "lockedOverflow"));
});

test("上限を指定すると上限を超えない", () => {
  const r = SA.allocate(specWithN(10, 100), { targetTotal: 100, maximumPoints: 15 });
  assert(r.ok, JSON.stringify(r.issues));
  const pts = r.spec.sections[0].questions.map((q) => q.points);
  assert(pts.every((p) => p <= 15), "上限を超えた: " + pts);
  assertEq(pts.reduce((a, b) => a + b, 0), 100);
});

test("下限を指定すると下限を下回らない", () => {
  const r = SA.allocate(specWithN(10, 100), { targetTotal: 100, minimumPoints: 5 });
  assert(r.ok, JSON.stringify(r.issues));
  const pts = r.spec.sections[0].questions.map((q) => q.points);
  assert(pts.every((p) => p >= 5), "下限を下回った: " + pts);
});

test("上限が厳しすぎて満点へ届かない場合を報告する", () => {
  const r = SA.allocate(specWithN(10, 100), { targetTotal: 100, maximumPoints: 5 });
  assertEq(r.ok, false);
  assert(hasError(r.issues, "cannotReachTotal"));
  const msg = r.issues.find((i) => i.code === "cannotReachTotal").message;
  assert(msg.includes("50"), "到達可能な上限が説明に入っていない: " + msg);
});

test("難しい問題ほど高い配点になる", () => {
  const s = specWithN(4, 100);
  s.sections[0].questions[0].difficulty = "hard";
  s.sections[0].questions[0].points = undefined;
  s.sections[0].questions.slice(1).forEach((q) => { q.difficulty = "easy"; q.points = undefined; });
  const r = SA.allocate(s, { targetTotal: 100 });
  assert(r.ok);
  const pts = r.spec.sections[0].questions.map((q) => q.points);
  assert(pts[0] > pts[1], `hard ${pts[0]} <= easy ${pts[1]}`);
});

test("記述式は選択式より高い配点になる", () => {
  const s = specWithN(4, 100);
  s.sections[0].questions.forEach((q) => { q.points = undefined; });
  s.sections[0].questions[0].type = "essay";
  const r = SA.allocate(s, { targetTotal: 100 });
  assert(r.ok);
  const pts = r.spec.sections[0].questions.map((q) => q.points);
  assert(pts[0] > pts[1], `essay ${pts[0]} <= choice ${pts[1]}`);
});

test("配分後に大問小計・回答欄・観点別がすべて同期される", () => {
  const s = SA.seedCriterionAllocation(specWithN(9, 100));
  const r = SA.allocate(s, { targetTotal: 100 });
  assert(r.ok, JSON.stringify(r.issues));
  const issues = V.validateMockSpecForSave(r.spec);
  assertEq(V.errorsOf(issues).length, 0, JSON.stringify(errorCodes(issues)));
});

test("Rubric も配点の変化に追随する", () => {
  const s = specWithN(2, 100);
  const q = s.sections[0].questions[0];
  q.type = "long_answer"; q.choices = [];
  q.scoringRubric = { items: [
    { id: "r1", description: "観点1", points: 1, criterionId: "knowledge_skill" },
    { id: "r2", description: "観点2", points: 1, criterionId: "thinking_judgment_expression" }
  ]};
  const r = SA.allocate(s, { targetTotal: 100 });
  assert(r.ok);
  const rq = r.spec.sections[0].questions[0];
  assertEq(rq.scoringRubric.items.reduce((a, i) => a + i.points, 0), rq.points, "Rubric 合計が配点と合わない");
});

test("小数配点も許可すれば合計が一致する", () => {
  const r = SA.allocate(specWithN(3, 10), { targetTotal: 10, integerOnly: false });
  assert(r.ok, JSON.stringify(r.issues));
  const total = r.spec.sections[0].questions.reduce((a, q) => a + q.points, 0);
  assert(Math.abs(total - 10) < 1e-6, "合計 " + total);
});

test("変更点が changed に記録される", () => {
  const r = SA.allocate(specWithN(4, 100), { targetTotal: 100 });
  assert(r.ok);
  assert(r.changed.length > 0, "変更が記録されていない");
  assert(r.changed.every((c) => c.questionId && typeof c.to === "number"));
});

test("allocateIntegers 単体：合計は常に一致し、下限・上限を守る", () => {
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + (trial % 12);
    const mins = Array.from({ length: n }, (_, i) => 1 + (i % 3));
    const maxs = mins.map((m) => m + 5 + (trial % 7));
    const weights = Array.from({ length: n }, (_, i) => 1 + ((trial + i) % 5));
    const lo = mins.reduce((a, b) => a + b, 0), hi = maxs.reduce((a, b) => a + b, 0);
    const total = lo + (trial % Math.max(1, hi - lo + 1));
    const got = SA.allocateIntegers(total, weights, mins, maxs);
    assert(got !== null, `trial ${trial}: 配分できなかった total=${total} lo=${lo} hi=${hi}`);
    assertEq(got.reduce((a, b) => a + b, 0), total, `trial ${trial}`);
    got.forEach((v, i) => {
      assert(v >= mins[i] && v <= maxs[i], `trial ${trial}: ${v} が [${mins[i]},${maxs[i]}] の外`);
      assert(Number.isInteger(v), `trial ${trial}: 整数でない ${v}`);
    });
  }
});

test("allocateIntegers は不可能な要求に null を返す", () => {
  assertEq(SA.allocateIntegers(5, [1, 1], [10, 10], [20, 20]), null);
  assertEq(SA.allocateIntegers(100, [1, 1], [1, 1], [2, 2]), null);
});

/* ══════════════════════════════════════════════════════════════════
   7. Session State Machine
   ══════════════════════════════════════════════════════════════════ */
group("7. Session State Machine");

test("Quiz の正しい遷移が通る", () => {
  const s = { state: "created" };
  S.transition("quiz", s, "ready");
  S.transition("quiz", s, "in_progress");
  S.transition("quiz", s, "paused");
  S.transition("quiz", s, "in_progress");
  S.transition("quiz", s, "submitting");
  S.transition("quiz", s, "grading");
  S.transition("quiz", s, "completed");
  assertEq(s.state, "completed");
  assertEq(s.stateHistory.length, 7);
});

test("Quiz の不正な遷移を拒否する", () => {
  assertThrows(() => S.transition("quiz", { state: "created" }, "completed"));
  assertThrows(() => S.transition("quiz", { state: "completed" }, "in_progress"));
  assertThrows(() => S.transition("quiz", { state: "ready" }, "grading"));
});

test("Mock の正しい遷移が通る", () => {
  const s = { state: "created" };
  ["preparing", "ready", "in_progress", "submitting", "deterministic_grading", "ai_grading", "reviewing", "completed"]
    .forEach((to) => S.transition("mock", s, to));
  assertEq(s.state, "completed");
});

test("Mock の不正な遷移を拒否する", () => {
  assertThrows(() => S.transition("mock", { state: "created" }, "in_progress"));
  assertThrows(() => S.transition("mock", { state: "ai_grading" }, "in_progress"));
  assertThrows(() => S.transition("mock", { state: "completed" }, "reviewing"));
});

test("時間切れからでも採点はできる", () => {
  const s = { state: "expired" };
  S.transition("quiz", s, "submitting");
  assertEq(s.state, "submitting");
});

test("同じ状態への再設定は無害", () => {
  const s = { state: "in_progress" };
  S.transition("quiz", s, "in_progress");
  assertEq(s.state, "in_progress");
});

test("提出に失敗したら解答へ戻せる（二重送信防止の後始末）", () => {
  const s = { state: "submitting" };
  S.transition("quiz", s, "in_progress");
  assertEq(s.state, "in_progress");
});

/* ══════════════════════════════════════════════════════════════════
   8. Feature Flags
   ══════════════════════════════════════════════════════════════════ */
group("8. Feature Flags");

test("既定はすべて ON（入れた時点で使える）", () => {
  const all = F.all();
  assert(Object.values(all).every((v) => v === true), JSON.stringify(all));
});

test("全部 OFF にすれば V1 の動作へ戻せる", () => {
  F.setAll(false);
  const off = F.all();
  assert(Object.values(off).every((v) => v === false), JSON.stringify(off));
  F.setAll(true);
  assert(Object.values(F.all()).every((v) => v === true), "戻せない");
});

test("個別に ON/OFF できる", () => {
  F.set("presetStudioV2", true);
  assertEq(F.isOn("presetStudioV2"), true);
  F.set("presetStudioV2", false);
  assertEq(F.isOn("presetStudioV2"), false);
});

test("未知のフラグ名を拒否する", () => {
  assertThrows(() => F.set("nonexistentFlag", true));
});

test("親が OFF なら子も OFF になる", () => {
  const n = F._normalize({ quickMockV2: false, quickMockPdfEngine: true, quickMockDigitalExam: true });
  assertEq(n.quickMockPdfEngine, false);
  assertEq(n.quickMockDigitalExam, false);
});

test("親が ON なら子を ON にできる", () => {
  const n = F._normalize({ quickMockV2: true, quickMockPdfEngine: true });
  assertEq(n.quickMockPdfEngine, true);
});

test("一括 ON / 一括 OFF が効く", () => {
  F.setAll(true);
  assert(Object.values(F.all()).every((v) => v === true));
  F.setAll(false);
  assert(Object.values(F.all()).every((v) => v === false));
});

/* ══════════════════════════════════════════════════════════════════
   9. Store（データ分離 / 競合 / 容量）
   ══════════════════════════════════════════════════════════════════ */
group("9. Store");

test("検証を通らないデータは保存されない", () => {
  const bad = S.emptyPreset({ name: "", questions: [] });
  const r = ST.savePreset(bad);
  assertEq(r.ok, false);
  assertEq(r.error, "VALIDATION");
});

test("保存すると revision が上がる", () => {
  const p = S.emptyPreset({ id: "p_rev", name: "テスト", questions: [mkQuestion()] });
  const r1 = ST.savePreset(p);
  assert(r1.ok, JSON.stringify(r1.issues));
  assertEq(r1.revision, 1);
  const r2 = ST.savePreset(r1.preset, { baseRevision: 1 });
  assert(r2.ok);
  assertEq(r2.revision, 2);
});

test("古い revision による上書きを検出して止める", () => {
  const p = S.emptyPreset({ id: "p_conf", name: "テスト", questions: [mkQuestion()] });
  ST.savePreset(p);                                    /* revision 1 */
  const cur = ST.getPreset("p_conf");
  ST.savePreset(cur, { baseRevision: 1 });             /* revision 2 */
  const stale = ST.savePreset(cur, { baseRevision: 1 });
  assertEq(stale.ok, false);
  assertEq(stale.error, "CONFLICT");
  assertEq(stale.currentRevision, 2);
});

test("他利用者のプリセットは読み出しに含まれない", () => {
  const list = ST._readAll(ST.KEYS.presets);
  list.unshift({ id: "p_other", ownerId: "someone_else", name: "他人", schemaVersion: 2, questions: [], revision: 1 });
  ST._writeAll(ST.KEYS.presets, list);
  assert(!ST.listPresets({ includeLegacy: false }).some((p) => p.id === "p_other"), "他人のデータが見えている");
});

test("他利用者のプリセットは上書きできない", () => {
  const r = ST.savePreset({ id: "p_other", schemaVersion: 2, name: "乗っ取り", questions: [mkQuestion()], revision: 1 });
  assertEq(r.ok, false);
  assertEq(r.error, "FORBIDDEN");
});

test("他利用者のプリセットは削除できない", () => {
  assertEq(ST.deletePreset("p_other").error, "FORBIDDEN");
});

test("保存すると V1 側にも映る（既存 Quiz が読める）", () => {
  const p = S.emptyPreset({ id: "p_mirror", name: "ミラー", questions: [mkQuestion()] });
  const r = ST.savePreset(p);
  assert(r.ok);
  assertEq(r.mirroredToV1, "ok");
  const v1 = ST._readAll(ST.LEGACY_PRESETS_KEY).find((x) => x.id === "p_mirror");
  assert(v1, "V1 に映っていない");
  assert(Array.isArray(v1.cards) && v1.cards.length === 1, "cards が作られていない");
  assert(Array.isArray(v1.words) && v1.words.length === 1, "words が作られていない");
});

test("V2 で削除しても V1 のデータは消さない", () => {
  ST.deletePreset("p_mirror");
  assert(ST._readAll(ST.LEGACY_PRESETS_KEY).some((x) => x.id === "p_mirror"), "V1 のデータまで消えた");
});

test("既存の V1 プリセットが一覧に出る", () => {
  const legacy = ST._readAll(ST.LEGACY_PRESETS_KEY);
  legacy.push({ id: "p_legacy_only", name: "旧のみ", cards: [{ id: 1, front: "f", back: "b" }] });
  ST._writeAll(ST.LEGACY_PRESETS_KEY, legacy);
  const found = ST.listPresets().find((p) => p.id === "p_legacy_only");
  assert(found, "旧プリセットが一覧に出ない");
  assertEq(found.__source, "legacy");
  assertEq(found.schemaVersion, 2);
});

test("下書きの保存・復元・破棄ができる", () => {
  ST.saveDraft("preset", "d1", { name: "編集中" }, { cursor: 3 });
  const d = ST.loadDraft("preset", "d1");
  assert(d, "下書きが読めない");
  assertEq(d.payload.name, "編集中");
  assertEq(d.meta.cursor, 3);
  ST.clearDraft("preset", "d1");
  assertEq(ST.loadDraft("preset", "d1"), null);
});

test("保存に成功したら下書きは自動で消える", () => {
  const p = S.emptyPreset({ id: "p_draft", name: "下書き付き", questions: [mkQuestion()] });
  ST.saveDraft("preset", "p_draft", p);
  assert(ST.loadDraft("preset", "p_draft"), "前提が崩れている");
  ST.savePreset(p);
  assertEq(ST.loadDraft("preset", "p_draft"), null, "保存後も下書きが残っている");
});

test("AIUsageEvent を記録できる", () => {
  const r = ST.recordUsage({ eventType: "preset_generation", modelCalls: 5, questionCount: 10, durationMs: 30000 });
  assert(r.ok);
  assert(r.record.estimatedComputeUnits > 0);
  const sum = ST.usageSummary();
  assert(sum.byType.preset_generation.events >= 1);
});

test("未知の eventType は記録しない", () => {
  assertEq(ST.recordUsage({ eventType: "mining_bitcoin" }).ok, false);
});

test("通常の会話と重い生成が区別して集計される", () => {
  ST.recordUsage({ eventType: "chat_message", modelCalls: 1, durationMs: 2000 });
  ST.recordUsage({ eventType: "mock_generation", modelCalls: 20, pageCount: 30, compileAttempts: 2, durationMs: 180000 });
  const s = ST.usageSummary();
  assert(s.byType.mock_generation.computeUnits > s.byType.chat_message.computeUnits * 5,
    "重い生成が軽い会話と区別できていない");
});

test("保存領域が満杯なら、握りつぶさずに失敗を返す", () => {
  const saved = globalThis.localStorage;
  installLocalStorage(1024);                        /* 1KB しかない */
  const big = S.emptyPreset({ id: "p_big", name: "大", questions: [] });
  big.questions = Array.from({ length: 200 }, (_, i) => mkQuestion({ id: "q" + i, prompt: "x".repeat(200) }));
  const r = ST.savePreset(big);
  assertEq(r.ok, false, "満杯なのに成功を返した");
  assert(r.error === "STORAGE_FULL" || r.error === "VALIDATION", "error=" + r.error);
  globalThis.localStorage = saved;
});


/* ══════════════════════════════════════════════════════════════════════
   10. プリセットごとの AI 会話（保存しても閉じても消さない）
   ══════════════════════════════════════════════════════════════════════ */
group("10. AI 会話の保存");

test("保存した会話は読み直せる", () => {
  const chat = [
    { role: "user", text: "20 問作って" },
    { role: "ai", log: [{ kind: "step", text: "論点を洗い出しています" },
                        { kind: "done", text: "20 問できました" }], text: "", error: null }
  ];
  assert(ST.saveChat("p_chat1", chat).ok, "保存に失敗");
  const back = ST.loadChat("p_chat1");
  assertEq(back.length, 2);
  assertEq(back[0].text, "20 問作って");
  assertEq(back[1].log.length, 2);
  assertEq(back[1].log[1].text, "20 問できました");
});

test("プリセットを保存しても会話は消えない", () => {
  const p = S.emptyPreset({ id: "p_chat2", name: "会話つき" });
  p.questions = [S.emptyQuestion({
    prompt: "問", choices: [
      { id: "c1", label: "A", text: "正", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "誤", explanation: "", isCorrect: false }
    ]
  })];
  ST.saveChat("p_chat2", [{ role: "user", text: "作って" }]);
  const r = ST.savePreset(p);
  assert(r.ok, JSON.stringify(r));
  assertEq(ST.loadChat("p_chat2").length, 1, "保存で会話が消えた");
});

test("会話は別の利用者から見えない", () => {
  ST.saveChat("p_chat3", [{ role: "user", text: "ひみつ" }]);
  localStorage.setItem("app.auth.profile.v1", JSON.stringify({ uid: "someone-else" }));
  assertEq(ST.loadChat("p_chat3").length, 0, "他人の会話が見えている");
  localStorage.removeItem("app.auth.profile.v1");
  assertEq(ST.loadChat("p_chat3").length, 1, "自分の会話が読めない");
});

test("会話が長くなっても、直近のやり取りは必ず残る", () => {
  const chat = [];
  for (let i = 0; i < 400; i++) chat.push({ role: "user", text: "発言 " + i });
  chat.push({ role: "ai", log: [{ kind: "done", text: "最後の行" }], text: "", error: null });
  assert(ST.saveChat("p_chat4", chat).ok);
  const back = ST.loadChat("p_chat4");
  assert(back.length <= ST.CHAT_LIMITS.turns, "上限を超えた: " + back.length);
  assertEq(back[back.length - 1].log[0].text, "最後の行", "直近が落ちている");
});

test("1 回の生成のログが多すぎても保存は壊れない", () => {
  const log = [];
  for (let i = 0; i < 2000; i++) log.push({ kind: "step", text: "行 " + i });
  assert(ST.saveChat("p_chat5", [{ role: "ai", log: log, text: "", error: null }]).ok);
  const back = ST.loadChat("p_chat5");
  assert(back[0].log.length <= ST.CHAT_LIMITS.logsPerTurn, back[0].log.length);
  assertEq(back[0].log[back[0].log.length - 1].text, "行 1999", "直近のログが落ちている");
});


/* ══ 自動保存が人の書きかけを消さない（2026-08-05）════════════════
   下書きの置き場は、以前は種類に関係なく先頭 30 件だけを残していた。
   試験の自動保存は生成のたびに走るので、プリセットを書きかけのまま
   試験を数回作ると、**書きかけが押し出されて消えていた**。
   人が書いたものと自動保存を、同じ枠で競わせない。 */
group("下書きの置き場：自動保存が人の書きかけを消さない");
{
  const S = VQ2.store;
  test("自動保存を 40 回走らせても、書きかけのプリセットは残る", () => {
    S.saveDraft("preset", "keep-me", { title: "書きかけの単語帳" });
    for (let i = 0; i < 40; i++) S.saveDraft("mock", "auto-" + i, { n: i });
    const got = S.loadDraft("preset", "keep-me");
    assert(got, "人が書いた下書きが自動保存に押し出されて消えました");
    assertEq(got.payload.title, "書きかけの単語帳");
  });
  test("同じ種類の古い自動保存は、枠を超えたら消えてよい", () => {
    const mocks = S.listDrafts("mock");
    assert(mocks.length <= 12, "同じ種類の枠が効いていません: " + mocks.length);
    assert(mocks.length > 0, "全部消えてしまいました");
  });
  test("新しく保存したものは必ず残る", () => {
    S.saveDraft("mock", "newest", { n: 999 });
    const got = S.loadDraft("mock", "newest");
    assert(got, "いま保存したものが残っていません");
  });
  test("別の種類を何件足しても、ほかの種類は減らない", () => {
    S.saveDraft("preset", "p2", { title: "二つ目" });
    const before = S.listDrafts("preset").length;
    for (let i = 0; i < 20; i++) S.saveDraft("exam", "e" + i, { n: i });
    assertEq(S.listDrafts("preset").length, before, "別の種類に押し出されました");
  });
}

process.exit(report("Phase A ドメイン層") > 0 ? 1 : 0);
