/* ══════════════════════════════════════════════════════════════════════
   V3 単体テスト
   ・Question Type Registry / 共通モデル / 採点エンジン / 形式配分
   ・「既存の 13 形式が今までと同じ点になる」ことを必ず確かめる。
     ここが崩れると、過去の答案の点が変わる。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, V2,
  group, test, assert, assertEq, assertDeep, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");

/* V3 の依存順で読み込む */
const FILES = [
  /* qtypes.js は schema.js より前。schema が形式の一覧をここから取り込む。 */
  "domain/qtypes.js", "domain/schema.js", "domain/qmodel.js",
  "domain/validate.js", "domain/adapter.js", "domain/score-allocator.js",
  "domain/grading.js", "domain/evaluator.js", "domain/qplan.js",
  "domain/draft.js", "domain/flags.js", "domain/store.js"
];
for (const f of FILES) new Function(readFileSync(join(V2, f), "utf8")).call(globalThis);
const VQ2 = globalThis.VQ2;
const S = VQ2.schema, Q = VQ2.qtypes, M = VQ2.qmodel, G = VQ2.grading, E = VQ2.evaluator, P = VQ2.qplan;

/* 実装が要る「初期 24 形式」（§4） */
const PHASE1 = [
  "multiple_choice_single", "choice_2", "true_false", "multiple_choice_multiple",
  "word_input", "fill_blank", "spelling", "numeric", "short_answer",
  "ordering", "reorder_chronology", "matching", "classification", "table_fill",
  "image_choice", "image_point", "image_label", "chart_read",
  "audio_choice", "dictation", "error_correction", "free_write_ai",
  "flashcard", "composite"
];

/* ────────────────────────────────────────────────────────────────
   1. Question Type Registry
   ──────────────────────────────────────────────────────────────── */
group("1. 形式レジストリ");

test("形式 ID が重複していない", () => {
  const ids = Q.all().map((d) => d.id);
  assertEq(new Set(ids).size, ids.length, "重複した ID があります: "
    + ids.filter((x, i) => ids.indexOf(x) !== i).join(","));
});

test("すべての形式が実在するエンジンを指している", () => {
  const engines = new Set(Q.ENGINES.map((e) => e.id));
  const bad = Q.all().filter((d) => !engines.has(d.engine));
  assertEq(bad.length, 0, "未知のエンジン: " + bad.map((d) => d.id + "→" + d.engine).join(","));
});

test("すべての形式が実在する分類を指している", () => {
  const cats = new Set(Q.CATEGORIES.map((c) => c.id));
  const bad = Q.all().filter((d) => !cats.has(d.category)
    || d.altCategories.some((c) => !cats.has(c)));
  assertEq(bad.length, 0, "未知の分類: " + bad.map((d) => d.id).join(","));
});

test("初期 24 形式がすべて登録され、使える状態になっている", () => {
  const missing = PHASE1.filter((id) => !Q.get(id));
  assertEq(missing.length, 0, "未登録: " + missing.join(","));
  const notReady = PHASE1.filter((id) => Q.get(id).status !== "available");
  assertEq(notReady.length, 0, "使えない状態: " + notReady.join(","));
});

test("形式は 100 種類以上ある", () => {
  assert(Q.all().length >= 100, "いまは " + Q.all().length + " 種類しかありません");
});

test("既存 13 形式の ID がそのまま残っている（保存データの移行が要らない）", () => {
  const missing = S.QUESTION_TYPES.filter((t) => !Q.get(t));
  assertEq(missing.length, 0, "消えた形式: " + missing.join(","));
});

test("既存 13 形式の決定論／AI 採点の別が変わっていない", () => {
  const diff = S.QUESTION_TYPES.filter((t) => S.isDeterministic(t) !== Q.isDeterministic(t));
  /* long_answer 系は schema でも qtypes でも AI 採点。ずれていたら実装の食い違い。 */
  assertEq(diff.length, 0, "食い違い: " + diff.join(","));
});

test("知らない形式でも落ちず、準備中として返る", () => {
  const d = Q.getOrUnknown("nope_nope");
  assertEq(d.unknown, true);
  assertEq(Q.isAvailable("nope_nope"), false);
  assertEq(Q.engineOf("nope_nope"), null);
});

test("旧い呼び名から正式な ID を引ける", () => {
  assertEq(Q.canonicalId("mcq"), "multiple_choice_single");
  assertEq(Q.canonicalId("cloze"), "fill_blank");
  assertEq(Q.canonicalId("tf"), "true_false");
});

test("検索は名前・短縮名・説明のどれでも当たる", () => {
  assert(Q.search("並べ替え").length >= 5);
  assert(Q.search("リスニング").length >= 3);
  assertEq(Q.search("ぜったいにないことば").length, 0);
});

test("準備中の形式は「使えるものだけ」に出てこない", () => {
  const list = Q.list({ availableOnly: true });
  assertEq(list.filter((d) => d.status === "coming_soon").length, 0);
});

test("おすすめは科目と目的で変わる", () => {
  const en = Q.recommended({ subject: "english" }).map((d) => d.id);
  const ma = Q.recommended({ subject: "math" }).map((d) => d.id);
  assert(en.indexOf("spelling") >= 0, "英語に spelling が出ません");
  assert(ma.indexOf("numeric") >= 0, "数学に numeric が出ません");
  assert(JSON.stringify(en) !== JSON.stringify(ma));
});

test("試験モードでは自己申告のカードを使えない", () => {
  assertEq(Q.allowedInMode("flashcard", "mock"), false);
  assertEq(Q.allowedInMode("multiple_choice_single", "mock"), true);
});

test("同じ ID を二重に登録できない", () => {
  let threw = false;
  try { Q.register({ id: "multiple_choice_single", name: "x", category: "choice", engine: "single_choice" }); }
  catch (e) { threw = true; }
  assertEq(threw, true);
});

/* ────────────────────────────────────────────────────────────────
   2. 共通モデル
   ──────────────────────────────────────────────────────────────── */
group("2. 共通モデル");

test("正規化は何度通しても同じ結果になる", () => {
  for (const t of PHASE1) {
    const a = M.normalize(M.empty(t));
    const b = M.normalize(a);
    assertEq(JSON.stringify(a), JSON.stringify(b), t + " が安定しません");
  }
});

test("初期 24 形式の空の問題を作れる", () => {
  for (const t of PHASE1) {
    const q = M.empty(t);
    assertEq(q.type, t);
    assertEq(q.engine, Q.engineOf(t), t + " のエンジンがずれています");
  }
});

test("空の問題は「正解を作らない」（偽の正解を置かない）", () => {
  const q = M.empty("multiple_choice_single");
  assertEq(q.choices.filter((c) => c.isCorrect).length, 0);
  const f = M.empty("fill_blank");
  assertEq(f.blanks[0].answer, "");
});

test("V1 のカードを取り込める", () => {
  const q = M.migrateLegacyQuestion({
    id: 7, front: "問題文", back: "こたえ",
    choices: ["あ", "い", "う", "え"], correctIndex: 2, explanation: "解説"
  });
  assertEq(q.type, "multiple_choice_single");
  assertEq(q.questionNumber, 7);
  assertEq(q.choices[2].isCorrect, true);
  assertEq(q.choices.filter((c) => c.isCorrect).length, 1);
});

test("正解が示されていない V1 カードに、勝手な正解を作らない", () => {
  const q = M.migrateLegacyQuestion({ id: 1, front: "x", choices: ["あ", "い"] });
  assertEq(q.choices.filter((c) => c.isCorrect).length, 0);
});

test("旧 V2 の数値問題（tolerance が問題の直下）を引き継ぐ", () => {
  const q = M.normalize({ type: "numeric", points: 5, correctAnswer: "10", tolerance: 0.5 });
  assertEq(q.scoringRule.tolerance, 0.5);
  assertEq(q.tolerance, 0.5);
});

test("RichContent は HTML を実行させない", () => {
  const h = M.RC.toHtml({ blocks: [{ t: "p", runs: [{ text: '<img src=x onerror="alert(1)">' }] }] });
  assert(h.indexOf("<img") < 0, "生の <img> が出ています: " + h);
  assert(h.indexOf("&lt;img") >= 0);
});

test("RichContent は javascript: の画像を捨てる", () => {
  const h = M.RC.toHtml({ blocks: [{ t: "image", src: "javascript:alert(1)" }] });
  assertEq(h.indexOf("javascript:"), -1);
});

test("RichContent は知らない節点を捨てる", () => {
  const rc = M.RC.coerce({ blocks: [{ t: "script", text: "bad" }, { t: "p", runs: ["ok"] }] });
  assertEq(rc.blocks.length, 1);
  assertEq(rc.blocks[0].t, "p");
});

test("軽い記法を読める", () => {
  const h = M.RC.toHtml(M.RC.fromText("**太**と__下__\n- 一\n- 二"));
  assert(h.indexOf("<strong>太</strong>") >= 0);
  assert(h.indexOf("<u>下</u>") >= 0);
  assert(h.indexOf("<li>一</li>") >= 0);
});

test("外の画像アドレスは通すが、危ないものは通さない", () => {
  assertEq(M.safeSrc("https://example.com/a.png", "image"), "https://example.com/a.png");
  assertEq(M.safeSrc("data:image/png;base64,AAA", "image"), "data:image/png;base64,AAA");
  assertEq(M.safeSrc("data:text/html,<script>", "image"), "");
  assertEq(M.safeSrc("javascript:alert(1)", "image"), "");
});

test("複合大問は小問へ展開できる", () => {
  const c = M.normalize({
    type: "composite", context: "本文",
    children: [
      { id: "k1", type: "multiple_choice_single", points: 4, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] },
      { id: "k2", type: "short_answer", points: 6, correctAnswer: "x" }
    ]
  });
  assertEq(c.points, 10, "大問の配点は小問の合計");
  const leaves = M.flatten([c]);
  assertEq(leaves.length, 2);
  assertEq(leaves[0].groupId, c.id);
  assertEq(M.countQuestions([c]), 2);
});

test("大問の中に大問は入れられない（検証で止める）", () => {
  const c = M.normalize({ type: "composite", context: "x", children: [{ type: "composite", context: "y", children: [] }] });
  const out = M.validateQuestion(c, "q", [], { strict: true });
  assert(out.some((i) => i.code === "nestedComposite"), JSON.stringify(out.map((i) => i.code)));
});

test("準備中の形式は保存させない", () => {
  const out = M.validateQuestion(M.normalize({ type: "drawing", prompt: "x" }), "q", [], { strict: true });
  assert(out.some((i) => i.code === "comingSoonType"));
});

test("知らない形式は保存させない", () => {
  const out = M.validateQuestion({ type: "zzz", prompt: "x" }, "q", [], { strict: true });
  assert(out.some((i) => i.code === "unknownType"));
});

test("正解の無い形式は保存させない", () => {
  const cases = [
    ["multiple_choice_single", "noCorrect"],
    ["classification", "itemNoGroup"],
    ["matching", "emptyPairItem"],
    ["table_fill", "cellNoAnswer"],
    ["error_correction", "noCorrection"],
    ["image_point", "missingImage"]
  ];
  for (const [t, code] of cases) {
    const out = M.validateQuestion(M.empty(t), "q", [], { strict: true });
    assert(out.some((i) => i.code === code), t + " で " + code + " が出ません: "
      + out.map((i) => i.code).join(","));
  }
});

test("AI 採点の記述は採点基準が無いと保存できない", () => {
  const q = M.normalize({ type: "free_write_ai", prompt: "x", points: 10 });
  const out = M.validateQuestion(q, "q", [], { strict: true });
  assert(out.some((i) => i.code === "noRubric"));
});

test("採点基準の合計が配点と合わないと保存できない", () => {
  const q = M.normalize({
    type: "long_answer", prompt: "x", points: 10,
    scoringRubric: { items: [{ id: "r1", description: "a", points: 3 }] }
  });
  const out = M.validateQuestion(q, "q", [], { strict: true });
  assert(out.some((i) => i.code === "rubricSum"));
});

test("試験へ出すときは正解を落とす", () => {
  const q = M.normalize({
    type: "multiple_choice_single", prompt: "x", points: 5, explanation: "解説だよ",
    choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }]
  });
  const s = JSON.stringify(M.stripAnswersStrict(q));
  assertEq(s.indexOf("isCorrect"), -1);
  assertEq(s.indexOf("解説だよ"), -1);
});

test("ドラッグ式の穴埋めは、正解を落としても語群が残る", () => {
  const q = M.normalize({ type: "fill_blank_drag", prompt: "x", blanks: [{ answer: "あ" }, { answer: "い" }] });
  const s = M.stripAnswersStrict(q);
  assertEq(s.wordBank.length, 2);
  assertEq(s.blanks[0].answer, undefined);
});

/* ────────────────────────────────────────────────────────────────
   3. 採点エンジン
   ──────────────────────────────────────────────────────────────── */
group("3. 採点エンジン");

function ev(qRaw, answer) { return E.evaluate(M.normalize(qRaw), answer); }

test("既存 13 形式は、これまでの採点と 1 点も変わらない", () => {
  const cases = [
    [{ type: "multiple_choice_single", points: 10, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] }, { choiceId: "c1" }],
    [{ type: "multiple_choice_single", points: 10, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] }, { choiceId: "c2" }],
    [{ type: "true_false", points: 4, choices: [{ id: "c1", text: "正", isCorrect: true }, { id: "c2", text: "誤" }] }, "c1"],
    [{ type: "multiple_choice_multiple", points: 9, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b", isCorrect: true }, { id: "c3", text: "c" }] }, ["c1"]],
    [{ type: "multiple_choice_multiple", points: 9, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b", isCorrect: true }, { id: "c3", text: "c" }] }, ["c1", "c3"]],
    [{ type: "short_answer", points: 5, correctAnswer: "ＡＢＣ" }, { text: "abc" }],
    [{ type: "short_answer", points: 5, correctAnswer: "あ", acceptedAnswers: ["い"] }, { text: "い" }],
    [{ type: "numeric", points: 5, correctAnswer: "10", tolerance: 0.5 }, { text: "10.3" }],
    [{ type: "numeric", points: 5, correctAnswer: "10", tolerance: 0.5 }, { text: "12" }],
    [{ type: "formula", points: 3, correctAnswer: "x＋1", acceptedAnswers: ["x+1"] }, { text: "x + 1" }],
    [{ type: "fill_blank", points: 6, blanks: [{ answer: "あ" }, { answer: "い" }, { answer: "う" }] }, ["あ", "x", "う"]],
    [{ type: "ordering", points: 8, choices: [{ id: "a", text: "1", order: 1 }, { id: "b", text: "2", order: 2 }, { id: "c", text: "3", order: 3 }, { id: "d", text: "4", order: 4 }], correctAnswer: ["a", "b", "c", "d"] }, ["a", "c", "b", "d"]],
    [{ type: "matching", points: 6, correctAnswer: { L1: "R1", L2: "R2", L3: "R3" } }, { L1: "R1", L2: "R3", L3: "R3" }]
  ];
  const bad = [];
  for (const [q, a] of cases) {
    const before = G.gradeDeterministic(q, a);
    const after = E.evaluate(M.normalize(q), a);
    if (before.correct !== after.isCorrect || Math.abs((before.score || 0) - (after.score || 0)) > 0.011) {
      bad.push(q.type + " 旧=" + before.score + "/" + before.correct + " 新=" + after.score + "/" + after.isCorrect);
    }
  }
  assertEq(bad.length, 0, bad.join(" ／ "));
});

test("分類：合った数だけ部分点が付く", () => {
  const q = {
    type: "classification", points: 8,
    classification: {
      groups: [{ id: "g1", label: "A" }, { id: "g2", label: "B" }],
      items: [{ id: "t1", text: "1", groupId: "g1" }, { id: "t2", text: "2", groupId: "g2" },
              { id: "t3", text: "3", groupId: "g1" }, { id: "t4", text: "4", groupId: "g2" }]
    }
  };
  assertEq(ev(q, { items: { t1: "g1", t2: "g2", t3: "g1", t4: "g2" } }).score, 8);
  assertEq(ev(q, { items: { t1: "g1", t2: "g2", t3: "g2", t4: "g1" } }).score, 4);
  assertEq(ev(q, { items: { t1: "g2", t2: "g1", t3: "g2", t4: "g1" } }).score, 0);
});

test("表：ますごとに部分点、配点の指定があればそれに従う", () => {
  const q = {
    type: "table_fill", points: 10,
    table: { columns: [{ text: "年" }, { text: "こと" }], rows: [
      { cells: [{ text: "1868" }, { editable: true, answer: "明治維新", points: 7 }] },
      { cells: [{ text: "1889" }, { editable: true, answer: "憲法発布", points: 3 }] }] }
  };
  assertEq(ev(q, { cells: { r1c2: "明治維新", r2c2: "違う" } }).score, 7);
  assertEq(ev(q, { cells: { r1c2: "違う", r2c2: "憲法発布" } }).score, 3);
  assertEq(ev(q, { cells: { r1c2: "明治維新", r2c2: "憲法発布" } }).score, 10);
});

test("画像内の位置：円・四角・多角形のどれでも判定できる", () => {
  const img = [{ kind: "image", src: "/a.png" }];
  const circ = { type: "image_point", points: 5, media: img, hotspots: [{ id: "h1", shape: "circle", x: 0.5, y: 0.5, r: 0.1 }] };
  assertEq(ev(circ, { points: [{ x: 0.55, y: 0.52 }] }).isCorrect, true);
  assertEq(ev(circ, { points: [{ x: 0.9, y: 0.9 }] }).isCorrect, false);
  const rect = { type: "image_point", points: 5, media: img, hotspots: [{ id: "h1", shape: "rect", x: 0.2, y: 0.2, width: 0.2, height: 0.2, tolerance: 0 }] };
  assertEq(ev(rect, { points: [{ x: 0.3, y: 0.3 }] }).isCorrect, true);
  assertEq(ev(rect, { points: [{ x: 0.5, y: 0.3 }] }).isCorrect, false);
  const poly = { type: "image_point", points: 5, media: img,
    hotspots: [{ id: "h1", shape: "poly", points: [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 0.4 }, { x: 0, y: 0.4 }] }] };
  assertEq(ev(poly, { points: [{ x: 0.2, y: 0.2 }] }).isCorrect, true);
  assertEq(ev(poly, { points: [{ x: 0.6, y: 0.6 }] }).isCorrect, false);
});

test("間違い探し：見つけた数だけ点が入り、誤った指摘は減る", () => {
  const q = {
    type: "spot_difference", points: 6, media: [{ kind: "image", src: "/a.png" }],
    settings: { multiPoint: true },
    scoringRule: { penaltyForWrong: 1 },
    hotspots: [{ id: "h1", shape: "circle", x: 0.2, y: 0.2, r: 0.05 },
               { id: "h2", shape: "circle", x: 0.8, y: 0.8, r: 0.05 }]
  };
  assertEq(ev(q, { points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] }).score, 6);
  assertEq(ev(q, { points: [{ x: 0.2, y: 0.2 }] }).score, 3);
  assertEq(ev(q, { points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }] }).score, 0);
});

test("ラベル配置：合った数だけ部分点", () => {
  const q = {
    type: "image_label", points: 4, media: [{ kind: "image", src: "/a.png" }],
    labels: { slots: [{ id: "s1", x: 0.3, y: 0.3, answerId: "lb1" }, { id: "s2", x: 0.7, y: 0.7, answerId: "lb2" }],
              bank: [{ id: "lb1", text: "核" }, { id: "lb2", text: "膜" }] }
  };
  assertEq(ev(q, { slots: { s1: "lb1", s2: "lb2" } }).score, 4);
  assertEq(ev(q, { slots: { s1: "lb1", s2: "lb1" } }).score, 2);
});

test("書き取り：語ごとに部分点が付き、抜けた語が分かる", () => {
  const q = { type: "dictation", points: 10, media: [{ kind: "audio", src: "/a.m4a" }],
              correctAnswer: "I have been to Kyoto twice" };
  const full = ev(q, { text: "I have been to Kyoto twice" });
  assertEq(full.score, 10);
  const part = ev(q, { text: "I have been to Kyoto" });
  assert(part.score > 0 && part.score < 10, "部分点になりません: " + part.score);
  assert(part.missedCriteria.indexOf("twice") >= 0, "抜けた語が返りません: " + JSON.stringify(part.missedCriteria));
});

test("誤文訂正：直した数だけ部分点", () => {
  const q = { type: "error_correction", points: 4, prompt: "He don't like it and she are ok.",
              errorSpans: [{ id: "e1", wrong: "don't", correct: "doesn't" }, { id: "e2", wrong: "are", correct: "is" }] };
  assertEq(ev(q, { spans: { e1: "doesn't", e2: "is" } }).score, 4);
  assertEq(ev(q, { spans: { e1: "doesn't", e2: "are" } }).score, 2);
});

test("キーワード採点：入っていた数で部分点", () => {
  const q = { type: "keyword_input", points: 6, correctAnswer: "参勤交代",
              scoringRule: { mode: "keyword", keywords: ["参勤交代", "財政", "負担"], keywordThreshold: 3 } };
  assertEq(ev(q, { text: "参勤交代で財政の負担が増えた" }).score, 6);
  const part = ev(q, { text: "参勤交代があった" });
  assertEq(part.score, 2);
  assertDeep(part.missedCriteria, ["財政", "負担"]);
});

test("表記ゆれ：似ていれば正解、遠ければ部分点", () => {
  const q = { type: "fuzzy_input", points: 5, correctAnswer: "necessary" };
  assertEq(ev(q, { text: "necessary" }).isCorrect, true);
  assertEq(ev(q, { text: "neccessary" }).isCorrect, true);
  const far = ev(q, { text: "necesry" });
  assert(far.isCorrect === false);
});

test("漢字で書く指定：かなだけの答えは正解にしない", () => {
  const q = { type: "kanji_input", points: 3, correctAnswer: "大化の改新" };
  assertEq(ev(q, { text: "たいかのかいしん" }).isCorrect, false);
  assertEq(ev(q, { text: "大化の改新" }).isCorrect, true);
});

test("読み仮名：ひらがなとカタカナを区別しない", () => {
  const q = { type: "reading_input", points: 3, correctAnswer: "せんもん" };
  assertEq(ev(q, { text: "センモン" }).isCorrect, true);
});

test("数値：単位が必要なときは、値だけなら満点にしない", () => {
  const q = { type: "numeric", points: 5, correctAnswer: "12",
              scoringRule: { unit: "cm", unitRequired: true } };
  assertEq(ev(q, { text: "12cm" }).isCorrect, true);
  const noUnit = ev(q, { text: "12" });
  assertEq(noUnit.isCorrect, false);
  assert(noUnit.score > 0, "値は合っているので 0 点にはしません");
});

test("記述は点を付けず、保留にする（0 点にも満点にもしない）", () => {
  const q = { type: "free_write_ai", points: 10,
              scoringRubric: { items: [{ id: "r1", description: "x", points: 10 }] } };
  const r = ev(q, { text: "それなりの長さの答えを書きました。" });
  assertEq(r.score, null);
  assertEq(r.isCorrect, null);
  assertEq(r.requiresManualReview, true);
});

test("記述の字数の条件は、コードで測って先に伝える", () => {
  const q = { type: "free_write_ai", points: 10, settings: { minLength: 50 },
              scoringRubric: { items: [{ id: "r1", description: "x", points: 10 }] } };
  const r = ev(q, { text: "短い" });
  assert(r.feedback.indexOf("50") >= 0, r.feedback);
});

test("カードの印は自己申告だと明示する", () => {
  const r = ev({ type: "flashcard", points: 1, card: { front: "a", back: "b" } }, { mark: "known" });
  assertEq(r.score, 1);
  assert(r.feedback.indexOf("自己申告") >= 0 || r.feedback.indexOf("自分で付けた") >= 0);
});

test("複合大問は小問の合計になる", () => {
  const c = {
    type: "composite", context: "本文",
    children: [
      { id: "k1", type: "multiple_choice_single", points: 4, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] },
      { id: "k2", type: "short_answer", points: 6, correctAnswer: "x" }
    ]
  };
  assertEq(ev(c, { children: { k1: { choiceId: "c1" }, k2: { text: "x" } } }).score, 10);
  assertEq(ev(c, { children: { k1: { choiceId: "c2" }, k2: { text: "x" } } }).score, 6);
});

test("知らない形式でも落ちず、採点を保留にする（0 点にしない）", () => {
  const r = E.evaluate(M.normalize({ type: "zzz_unknown", points: 3 }), { text: "x" });
  assertEq(r.score, null);
  assertEq(r.requiresManualReview, true);
});

test("正解が設定されていない問題を、勝手に不正解にしない", () => {
  const r = ev({ type: "word_input", points: 3 }, { text: "なにか" });
  assertEq(r.score, null);
  assertEq(r.requiresManualReview, true);
});

test("未回答は 0 点（保留にはしない）", () => {
  const r = ev({ type: "classification", points: 5,
                 classification: { groups: [{ id: "g1", label: "A" }], items: [{ id: "t1", text: "x", groupId: "g1" }] } }, null);
  assertEq(r.score, 0);
  assertEq(r.method, "unanswered");
});

test("形式ごとに「空」の形が違っても、未回答を正しく見分ける", () => {
  const cases = [
    ["classification", { items: {} }, true],
    ["classification", { items: { t1: "g1" } }, false],
    ["image_point", { points: [] }, true],
    ["image_point", { points: [{ x: 0.1, y: 0.1 }] }, false],
    ["table_fill", { cells: { a: "  " } }, true],
    ["table_fill", { cells: { a: "x" } }, false],
    ["flashcard", {}, true],
    ["flashcard", { mark: "known" }, false]
  ];
  for (const [t, v, want] of cases) {
    assertEq(E.isUnanswered(M.empty(t), v), want, t + " " + JSON.stringify(v));
  }
});

test("セッション採点は、複合大問を小問へほどいて数える", () => {
  const qs = [M.normalize({
    id: "g1", type: "composite", context: "本文",
    children: [
      { id: "k1", type: "multiple_choice_single", points: 4, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] },
      { id: "k2", type: "short_answer", points: 6, correctAnswer: "x" }
    ]
  })];
  const res = E.evaluateSession(qs, [{ questionId: "g1", value: { children: { k1: { choiceId: "c1" }, k2: { text: "y" } } }, timeMs: 1000 }]);
  assertEq(res.items.length, 2, "小問の数だけ記録が要ります");
  assertEq(res.deterministicScore, 4);
  assertEq(res.totalMax, 10);
  assertEq(res.items[0].groupId, "g1");
});

test("集計に形式別・答え方別・大問別が出る", () => {
  const qs = [
    M.normalize({ id: "q1", type: "multiple_choice_single", points: 5, choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b" }] }),
    M.normalize({ id: "q2", type: "word_input", points: 5, correctAnswer: "x" })
  ];
  const res = E.evaluateSession(qs, [
    { questionId: "q1", value: { choiceId: "c1" } },
    { questionId: "q2", value: { text: "y" } }
  ]);
  const agg = E.aggregate(qs, res.items);
  assert(agg.byType.multiple_choice_single, "形式別がありません");
  assertEq(agg.byType.multiple_choice_single.label, "4択");
  assert(agg.byEngine.single_choice, "答え方別がありません");
  assertEq(agg.total.score, 5);
});

/* ────────────────────────────────────────────────────────────────
   4. 形式の配分と AI 出力の取り込み
   ──────────────────────────────────────────────────────────────── */
group("4. 出題形式の配分");

test("配分の合計は、頼んだ問題数とぴったり合う", () => {
  for (const style of ["auto", "choice_heavy", "write_heavy", "memorize", "understand", "exam", "game"]) {
    for (const n of [1, 3, 7, 10, 25, 100]) {
      const plan = P.planMix({ count: n, style: style });
      assertEq(plan.total, n, style + " × " + n + " 問で合計が合いません");
    }
  }
});

test("完全自動の配分は 4 択だけにならない", () => {
  const plan = P.planMix({ count: 10, style: "auto" });
  assert(plan.items.length >= 4, "形式が " + plan.items.length + " 種類しかありません");
  const mc = plan.items.filter((i) => i.type === "multiple_choice_single")[0];
  assert(!mc || mc.count <= 5, "4 択が多すぎます: " + (mc && mc.count));
});

test("教材に画像が無ければ、画像の問題を頼まない", () => {
  const plan = P.planMix({ count: 20, style: "auto", subject: "science", hints: { longText: true } });
  assertEq(plan.items.filter((i) => Q.get(i.type).supportsMedia
    && P.NEEDS[i.type] === "images").length, 0, plan.summary);
});

test("資料限定で教材のことが分からないときは、図表の問題を頼まない", () => {
  const plan = P.planMix({ count: 10, style: "auto", sourceOnly: true });
  assertEq(plan.items.filter((i) => i.type === "chart_read").length, 0, plan.summary);
});

test("形式を自分で指定したら、その形式だけになる", () => {
  const plan = P.planMix({ count: 6, style: "manual", types: ["flashcard", "word_input"] });
  assertEq(plan.total, 6);
  assertEq(plan.items.every((i) => ["flashcard", "word_input"].indexOf(i.type) >= 0), true);
});

test("除外した形式は入らない", () => {
  const plan = P.planMix({ count: 10, style: "choice_heavy", exclude: ["multiple_choice_single"] });
  assertEq(plan.items.filter((i) => i.type === "multiple_choice_single").length, 0);
});

test("同じ形式の上限を守る", () => {
  const plan = P.planMix({ count: 12, style: "auto", maxPerType: 2 });
  assertEq(plan.items.every((i) => i.count <= 2), true, plan.summary);
});

test("頼み文には形式ごとの返し方が入る", () => {
  const plan = P.planMix({ count: 10, style: "auto" });
  const t = P.promptFor(plan, { sourceOnly: true });
  assert(t.indexOf("questionType") >= 0);
  assert(t.indexOf("reasonForType") >= 0);
  assert(t.indexOf("sourceReferences") >= 0, "資料限定なのに根拠の指示がありません");
});

test("AI の出力を形式ごとに取り込める", () => {
  const r = P.importAll([
    { questionType: "ordering", question: "順に並べなさい", items: ["一", "二", "三"] },
    { questionType: "classification", question: "分けなさい", groups: ["A", "B"], items: [{ text: "x", group: "A" }, { text: "y", group: "B" }] },
    { questionType: "matching", question: "結びなさい", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] },
    { questionType: "table_fill", question: "埋めなさい", table: { columns: ["列1", "列2"], rows: [{ cells: ["固定", { answer: "こたえ" }] }] } },
    { questionType: "error_correction", question: "He don't go.", errors: [{ wrong: "don't", correct: "doesn't" }] },
    { questionType: "flashcard", front: "表", back: "裏" },
    { questionType: "mcq", question: "4 択です", choices: ["あ", "い", "う", "え"], correctAnswer: "あ" }
  ]);
  assertEq(r.dropped.length, 0, JSON.stringify(r.dropped));
  assertEq(r.questions.length, 7);
  assertDeep(r.questions.map((q) => q.engine),
    ["reorder", "classification", "matching", "table_fill", "error_correction", "flashcard", "single_choice"]);
});

test("正解が分からない AI の出力は、理由をつけて捨てる", () => {
  const r = P.importAll([
    { questionType: "multiple_choice_single", question: "x", choices: ["a", "b"], correctAnswer: "zzz" },
    { questionType: "word_input", question: "x" },
    { questionType: "totally_unknown", question: "x" }
  ]);
  assertEq(r.questions.length, 0);
  assertEq(r.dropped.length, 3);
  assert(r.dropped.every((d) => d.reason), "理由が付いていません");
});

test("選択肢が足りない選択問題は、捨てずに短答へ落とす", () => {
  const r = P.importAll([{ questionType: "multiple_choice_single", question: "x", choices: ["あ"], correctAnswer: "あ" }]);
  assertEq(r.questions.length, 1);
  assertEq(r.questions[0].engine, "text_input");
});

test("資料限定では、根拠の無い問題を通さない", () => {
  const list = [{ questionType: "mcq", question: "x", choices: ["a", "b"], correctAnswer: "a" }];
  assertEq(P.importAll(list, { sourceOnly: false }).questions.length, 1);
  assertEq(P.importAll(list, { sourceOnly: true }).questions.length, 0);
  const withSrc = [{ questionType: "mcq", question: "x", choices: ["a", "b"], correctAnswer: "a",
                     sourceReferences: [{ id: "s1", sourceType: "pdf", sourceName: "資料.pdf", page: 3 }] }];
  assertEq(P.importAll(withSrc, { sourceOnly: true }).questions.length, 1);
});

test("AI がまだ作れない形式を指定してきたら、近い形式へ寄せる（§15）", () => {
  /* 作図はまだ使えない。捨てずに記述へ寄せ、中身は残す。 */
  const r = P.importAll([{ questionType: "drawing", question: "図をかきなさい" }]);
  assertEq(r.questions.length, 1);
  assertEq(r.questions[0].engine, "free_text");
  assertEq(r.questions[0].prompt, "図をかきなさい");
  /* 寄せ先が決まっていない形式は、黙って壊れた問題にせず落とす。 */
  const r2 = P.importAll([{ questionType: "map_color", question: "色を塗りなさい" }]);
  assertEq(r2.questions.length, 0);
});

test("組み合わせは、中身が空だと出題させない", () => {
  const out = M.validateQuestion(M.empty("matching"), "q", [], { strict: true });
  assert(out.some((i) => i.code === "emptyPairItem"), out.map((i) => i.code).join(","));
});

test("頼んだ配分と、できたものの差が分かる", () => {
  const plan = P.planMix({ count: 4, style: "manual", types: ["ordering", "flashcard"] });
  const r = P.importAll([{ questionType: "ordering", question: "x", items: ["a", "b"] }]);
  const c = P.compare(plan, r.questions);
  assertEq(c.ok, false);
  assert(c.summary.indexOf("足りません") >= 0, c.summary);
});

test("複合大問も AI から取り込める", () => {
  const r = P.importAll([{
    questionType: "composite", instruction: "次を読んで答えなさい", context: "英文の本文",
    children: [
      { questionType: "mcq", question: "内容一致", choices: ["a", "b"], correctAnswer: "a", points: 4 },
      { questionType: "word_input", question: "語句", correctAnswer: "x", points: 6 }
    ]
  }]);
  assertEq(r.questions.length, 1);
  assertEq(r.questions[0].children.length, 2);
  assertEq(r.questions[0].points, 10);
});

/* ────────────────────────────────────────────────────────────────
   5. 保存できるか（いちばん大事）
   ・形式を足しても、保存前の検証で「使用できない値です」にならないこと。
   ・ここが崩れると、新しい形式で作った問題が 1 問も保存できない。
   ──────────────────────────────────────────────────────────────── */
group("5. 新しい形式が保存できる");

const V = VQ2.validate, ST = VQ2.store;

/* 形式ごとに「中身の入った、正しい問題」を作る。 */
function filled(typeId) {
  const q = M.empty(typeId);
  q.prompt = "テスト用の問題文";
  q.explanation = "解説";
  const e = Q.engineOf(typeId);
  if (e === "single_choice" || e === "image_choice" || e === "audio_choice" || e === "true_false") {
    q.choices.forEach((c, i) => { c.text = "選択肢" + (i + 1); c.isCorrect = i === 0; });
    if (e === "image_choice") q.choices.forEach((c) => { c.image = "data:image/png;base64,AAA"; });
    if (e === "audio_choice") q.media = [{ id: "m1", kind: "audio", src: "data:audio/mp4;base64,AAA" }];
  } else if (e === "multi_choice") {
    q.choices.forEach((c, i) => { c.text = "選択肢" + (i + 1); c.isCorrect = i < 2; });
  } else if (e === "text_input" || e === "numeric_input") {
    q.correctAnswer = e === "numeric_input" ? "12" : "こたえ";
    if ((q.scoringRule || {}).mode === "keyword") q.scoringRule.keywords = ["こたえ"];
  } else if (e === "fill_blank") {
    q.blanks.forEach((b, i) => { b.answer = "答" + (i + 1); if ((q.settings || {}).blankMode === "select") b.options = [{ id: "o1", text: "答" + (i + 1) }, { id: "o2", text: "ちがう" }]; });
    if ((q.settings || {}).hasContext) q.context = "本文";
    if (Q.engineOf(typeId) === "fill_blank" && (q.settings || {}).requireSource) q.context = "本文";
  } else if (e === "reorder") {
    q.orderItems.forEach((it, i) => { it.text = "項目" + (i + 1); });
  } else if (e === "matching") {
    q.pairs.left.forEach((l, i) => { l.text = "左" + (i + 1); });
    q.pairs.right.forEach((r, i) => { r.text = "右" + (i + 1); });
  } else if (e === "classification") {
    q.classification.groups.forEach((g, i) => { g.label = "組" + (i + 1); });
    q.classification.items.forEach((it, i) => { it.text = "項目" + (i + 1); it.groupId = q.classification.groups[i % 2].id; });
  } else if (e === "table_fill") {
    q.table.columns.forEach((c, i) => { c.text = "列" + (i + 1); });
    q.table.rows.forEach((r) => r.cells.forEach((c) => { if (c.editable) c.answer = "答"; else c.text = "固定"; }));
  } else if (e === "image_point") {
    q.media = [{ id: "m1", kind: "image", src: "data:image/png;base64,AAA" }];
    q.hotspots.forEach((h) => { h.label = "ここ"; });
  } else if (e === "image_label") {
    q.media = [{ id: "m1", kind: "image", src: "data:image/png;base64,AAA" }];
    q.labels.bank.forEach((b, i) => { b.text = "ラベル" + (i + 1); });
  } else if (e === "chart_read") {
    q.chart.categories = ["1970", "1980", "1990"];
    q.chart.series = [{ id: "s1", name: "系列1", values: [1, 2, 3] }];
    if ((q.settings || {}).answerKind === "numeric") q.correctAnswer = "2";
    else q.choices.forEach((c, i) => { c.text = "選択肢" + (i + 1); c.isCorrect = i === 0; });
  } else if (e === "dictation") {
    q.media = [{ id: "m1", kind: "audio", src: "data:audio/mp4;base64,AAA" }];
    q.correctAnswer = "I have a pen";
  } else if (e === "error_correction") {
    q.prompt = "He don't go.";
    q.errorSpans = [{ id: "e1", wrong: "don't", correct: "doesn't", acceptedAnswers: [] }];
  } else if (e === "free_text") {
    q.points = 10;
    q.scoringRubric = { items: [{ id: "r1", description: "観点", points: 10 }] };
    if ((q.settings || {}).aiGrading === false || (q.settings || {}).quoteFromContext) {
      q.context = "本文"; q.correctAnswer = "抜き出し";
    }
    if ((q.settings || {}).requireSource || (q.settings || {}).hasContext) q.context = "本文";
    if (typeId === "summarize" || typeId === "case_study" || typeId === "evidence_explain"
        || typeId === "source_analysis" || typeId === "quote_evidence") q.context = "本文";
  } else if (e === "flashcard") {
    q.card = { front: "表", back: "裏" };
  } else if (e === "composite") {
    q.context = "共通の資料";
    q.children = [filled("multiple_choice_single")];
    q.children[0].points = 5;
  }
  return M.normalize(q);
}

test("使えるすべての形式が、保存前の検証を通る", () => {
  const bad = [];
  Q.list({ availableOnly: true }).forEach((d) => {
    if (d.mode) return;                        /* 解き方であって問題ではない */
    let q;
    try { q = filled(d.id); } catch (e) { bad.push(d.id + ": 作れない(" + e.message + ")"); return; }
    const preset = { id: "p_" + d.id, schemaVersion: 2, name: "確認", questions: [q] };
    const issues = V.validatePresetForSave(preset, {});
    const errs = issues.filter((i) => i.severity === "error");
    if (errs.length) bad.push(d.id + ": " + errs.slice(0, 2).map((i) => i.code + "(" + i.message.slice(0, 26) + ")").join(" / "));
  });
  assertEq(bad.length, 0, "\n  " + bad.slice(0, 12).join("\n  "));
});

test("形式の名前が「使用できない値です」で弾かれない", () => {
  const out = [];
  S.validateQuestion(M.normalize({ type: "classification", prompt: "x" }), "q", out);
  assertEq(out.filter((i) => i.code === "enum" && i.path === "q.type").length, 0,
    JSON.stringify(out.map((i) => i.code)));
});

test("新しい形式のプリセットを実際に保存できる", () => {
  const preset = {
    id: "p_save_v3", schemaVersion: 2, name: "V3 保存の確認", visibility: "private",
    questions: [filled("classification"), filled("ordering"), filled("flashcard"),
                filled("table_fill"), filled("free_write_ai")]
  };
  const r = ST.savePreset(preset, {});
  assertEq(r.ok, true, r.message || JSON.stringify((r.issues || []).slice(0, 3)));
  const back = ST.getPreset("p_save_v3");
  assertEq(back.questions.length, 5);
  assertEq(back.questions[0].type, "classification");
});

test("旧 13 形式の判定は変えていない（過去のプリセットが保存できなくならない）", () => {
  assertDeep(S.LEGACY_QUESTION_TYPES.slice().sort(), [
    "english_writing", "essay", "fill_blank", "formula", "long_answer",
    "matching", "multiple_choice_multiple", "multiple_choice_single", "numeric",
    "ordering", "short_answer", "source_analysis", "true_false"
  ]);
  const legacy = {
    id: "p_legacy", schemaVersion: 2, name: "旧", questions: [{
      id: "q1", schemaVersion: 2, type: "multiple_choice_single", prompt: "x",
      choices: [{ id: "c1", label: "A", text: "a", explanation: "", isCorrect: true },
                { id: "c2", label: "B", text: "b", explanation: "", isCorrect: false }],
      correctAnswer: null, acceptedAnswers: [], explanation: "", difficulty: "normal",
      topic: "", tags: [], points: 1, estimatedSeconds: 60, sourceReferences: [],
      requiresReview: false, validationIssues: []
    }]
  };
  const errs = V.validatePresetForSave(legacy, {}).filter((i) => i.severity === "error");
  assertEq(errs.length, 0, JSON.stringify(errs));
});

/* ────────────────────────────────────────────────────────────────
   6. 作りはじめた問題を「要修正」だらけにしない
   ・ここが崩れると、形式を選んだ瞬間に画面が赤くなって手が止まる。
   ──────────────────────────────────────────────────────────────── */
group("6. 編集中は要修正にしない");

function errsOf(q, opts) {
  const issues = V.validatePresetForSave(
    { id: "p", schemaVersion: 2, name: "n", questions: [q] }, opts || {});
  return issues.filter((i) => i.severity === "error" && i.path !== "questions");
}

test("形式を選んだ直後、どの形式も要修正にならない", () => {
  const bad = [];
  Q.list({ availableOnly: true }).forEach((d) => {
    if (d.mode) return;
    const e = errsOf(M.empty(d.id));
    if (e.length) bad.push(d.id + ": " + [...new Set(e.map((i) => i.code))].join(","));
  });
  assertEq(bad.length, 0, "\n  " + bad.slice(0, 10).join("\n  "));
});

test("問題文だけ書いた状態でも要修正にならない", () => {
  const bad = [];
  Q.list({ availableOnly: true }).forEach((d) => {
    if (d.mode) return;
    const q = M.empty(d.id);
    q.prompt = "問題文";
    const e = errsOf(q);
    if (e.length) bad.push(d.id + ": " + [...new Set(e.map((i) => i.code))].join(","));
  });
  assertEq(bad.length, 0, "\n  " + bad.slice(0, 10).join("\n  "));
});

test("書きかけの問題は 1 行だけ伝える（指摘の山にしない）", () => {
  const issues = V.validatePresetForSave(
    { id: "p", schemaVersion: 2, name: "n", questions: [M.empty("matching")] }, {});
  const perQ = issues.filter((i) => String(i.path).indexOf("questions[0]") === 0);
  assertEq(perQ.length, 1, JSON.stringify(perQ.map((i) => i.code)));
  assertEq(perQ[0].code, "notWrittenYet");
  assertEq(perQ[0].severity, "info");
});

test("記述の採点基準は、作った時点で配点と合っている", () => {
  ["long_answer", "essay", "english_writing", "free_write_ai", "explain_reason", "summarize"].forEach((t) => {
    const q = M.empty(t);
    const sum = (q.scoringRubric.items || []).reduce((a, r) => a + r.points, 0);
    assertEq(sum, q.points, t + " の採点基準の合計が配点と合いません");
  });
});

test("出題の直前は、そろっていない問題をきちんと止める", () => {
  const q = M.empty("multiple_choice_single");
  q.prompt = "問題文";
  assertEq(errsOf(q).length, 0, "編集中は止めない");
  assert(errsOf(q, { requireAnswerable: true, requireRubric: true }).length > 0, "出題の直前は止める");
});

test("矛盾しているものは、編集中でも要修正のまま", () => {
  /* 正解が 2 つある単一選択（書いてあるのに食い違っている） */
  const q1 = M.normalize({
    type: "multiple_choice_single", prompt: "x", points: 5,
    choices: [{ id: "c1", text: "a", isCorrect: true }, { id: "c2", text: "b", isCorrect: true }]
  });
  assert(errsOf(q1).some((i) => i.code === "tooManyCorrect"), JSON.stringify(errsOf(q1).map((i) => i.code)));
  /* 存在しない項目を指す並び順 */
  const q2 = M.normalize({
    type: "reorder_words", prompt: "x", points: 5,
    orderItems: [{ id: "i1", text: "a" }, { id: "i2", text: "b" }],
    correctOrder: ["i1", "i9"]
  });
  assert(errsOf(q2).some((i) => i.code === "orderUnknownId"), JSON.stringify(errsOf(q2).map((i) => i.code)));
  /* 準備中の形式 */
  const q3 = M.normalize({ type: "drawing", prompt: "x" });
  assert(errsOf(q3).some((i) => i.code === "comingSoonType"));
});

/* ────────────────────────────────────────────────────────────────
   7. 記述の採点は「内容」で見る
   ・長くて丁寧なだけの答案に点が付かないこと。
   ・短くても内容が合っていれば点になること。
   ──────────────────────────────────────────────────────────────── */
group("7. 記述は内容で採点する");

const WRITE_Q = M.normalize({
  type: "long_answer", prompt: "参勤交代が大名に与えた影響を、経済面から説明しなさい。", points: 10,
  correctAnswer: "参勤交代により大名は江戸と領地を往復する費用を負担した。江戸屋敷の維持費もかかり、藩の財政が圧迫された。",
  scoringRubric: { items: [{ id: "r1", description: "x", points: 10 }] }
});

test("短くても内容が合っていれば、要点が見つかる", () => {
  const c = E.contentCheck(WRITE_Q, "参勤交代の費用と江戸屋敷の維持費で藩の財政が圧迫された。");
  assert(c.coverage >= 0.5, "被覆 " + c.coverage + " / " + JSON.stringify(c.points.map((p) => p.found)));
});

test("長くて丁寧でも、中身が違えば要点は見つからない", () => {
  const long = "私は歴史がとても好きです。江戸時代はとても長く続いた平和な時代で、多くの人々が"
    + "さまざまな暮らしをしていました。文化も大きく発展し、今に伝わるものがたくさんあります。"
    + "調べれば調べるほど興味深く、これからも学んでいきたいと思っています。";
  const c = E.contentCheck(WRITE_Q, long);
  assertEq(c.found, 0, JSON.stringify(c.points.map((p) => p.found)));
  assert(c.length > 100, "長さは十分ある（長さでは点にしない）");
});

test("必須キーワードが指定されていれば、それを要点にする", () => {
  const q = M.normalize({
    type: "keyword_input", prompt: "x", points: 6,
    scoringRule: { mode: "keyword", keywords: ["参勤交代", "財政"] }
  });
  const c = E.contentCheck(q, "参勤交代のせいで財政が苦しくなった");
  assertEq(c.total, 2);
  assertEq(c.found, 2);
});

test("採点基準が無くても、模範解答から内容の基準を作れる", () => {
  const r = S.defaultRubric("long_answer", 10, { modelAnswer: WRITE_Q.correctAnswer });
  assert(r.items.length >= 2, JSON.stringify(r.items));
  assertEq(r.items.reduce((a, b) => a + b.points, 0), 10, "合計が配点と合わない");
  assert(r.items.every((i) => i.description.indexOf("に触れている") >= 0),
    "内容の基準になっていない: " + JSON.stringify(r.items.map((i) => i.description)));
});

test("AI が中身と食い違う点を付けたら、確認を促す", () => {
  const wrong = "私は歴史が好きです。とても長い時代でした。文化も発展しました。";
  /* 中身が無いのに満点 */
  const hi = E.crossCheckGrade(WRITE_Q, wrong, { score: 10, maxScore: 10 });
  assertEq(hi.requiresReview, true, JSON.stringify(hi.notes));
  /* 中身はあるのに 0 点 */
  const ok2 = "参勤交代により大名は江戸と領地を往復する費用を負担し、江戸屋敷の維持費もかかって藩の財政が圧迫された。";
  const lo = E.crossCheckGrade(WRITE_Q, ok2, { score: 0, maxScore: 10 });
  assertEq(lo.requiresReview, true, JSON.stringify(lo.notes));
  /* 合っているときは口を出さない */
  const fine = E.crossCheckGrade(WRITE_Q, ok2, { score: 9, maxScore: 10 });
  assertEq(fine.requiresReview, false, JSON.stringify(fine.notes));
});

test("本文の丸写しを見分けられる", () => {
  const q = M.normalize({
    type: "own_words", prompt: "自分の言葉で説明しなさい", points: 10,
    context: "参勤交代により大名は江戸と領地を往復する費用を負担し、藩の財政が圧迫された。",
    correctAnswer: "参勤交代の費用で藩の財政が苦しくなった。",
    scoringRubric: { items: [{ id: "r1", description: "x", points: 10 }] }
  });
  const copied = E.contentCheck(q, "参勤交代により大名は江戸と領地を往復する費用を負担し、藩の財政が圧迫された。");
  assert(copied.verbatim >= 0.8, "写しを見分けられない: " + copied.verbatim);
  const own = E.contentCheck(q, "行き来にお金がかかって、藩の財布が苦しくなったということです。");
  assert(own.verbatim < 0.5, "自分の言葉を写し扱いしている: " + own.verbatim);
});

process.exit(report("V3 形式レジストリ・共通モデル・採点・配分・保存・編集中の指摘・記述の採点"));
