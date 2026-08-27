/* Quick Mock が形式レジストリとつながっているか（契約 Phase 1 の穴の回帰テスト）

   別のエージェントが「疑って検証」して見つかった穴（2026-08-05）:
     ① 出題形式のチェックが 5 つの決め打ちで、レジストリ（94 形式）と切れていた。
     ② 指示文の読み取りが自前の 4 語表（正誤・選択・記述・短答）で、
        「空欄補充を4問」「英文並べ替えを5問」を読めなかった。
        さらに mixFromSettings が、選んだ形式を粗い 4 語へ潰していた。
     ③ 文書形式のセレクトは 8 件すべて「（準備中）」が付かないのに、
        既定の組み合わせでは HTML 紙面に一切効かない（動くふり）。

   ここは **直す前は必ず赤になる** ように書いてある。
   （赤の確認方法は報告に書いた。実装を戻して実際に赤を見ている。）

   偶然の合格を避けるため、
     ・件数だけでなく「その形式 ID が入っていること」を名指しで見る
     ・配分は「合計」ではなく「形式ごとの実際の個数」を数える
     ・効かない組み合わせは、効く組み合わせと**対で**見る
   ようにしてある。 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, assertDeep, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  "mock-builder", "mock-compiler", "draft", "flags"
].map((f) => "domain/" + f + ".js"));

/* pdf 層（layoutProfiles / layoutGrammar）も読む。③ の判定に要る。 */
new Function(readFileSync(join(V2, "pdf/templates.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-grammar.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-profiles.js"), "utf8")).call(globalThis);

/* quick-mock.js は画面用の IIFE。読み込みに要る最小限だけを置く。
   （中身は使わない。純関数だけを VQ2.quickMock から取り出して確かめる） */
const noop = () => "";
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };
VQ2.ui = {
  esc: (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  icon: noop, button: noop, field: noop, mount: noop, on: noop, badge: noop, statusChip: noop,
  AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);

const QM = VQ2.quickMock, Q = VQ2.qtypes, C = VQ2.capability, MC = VQ2.mockCompiler;
const QM_SRC = readFileSync(join(V2, "ui/quick-mock.js"), "utf8");

/* ══════════════════════════════════════════════════════════════════
   ① 出題形式のチェックがレジストリ由来か
   ══════════════════════════════════════════════════════════════════ */
group("1. 出題形式はレジストリ（capability）から作る");

test("候補は capability.forAi({mock:true}) と同じ（決め打ちの 5 つではない）", () => {
  const ids = QM._mockTypeIds();
  assertDeep(ids, C.forAi({ mock: true }), "capability の答えと違う一覧を出している");
  assert(ids.length >= 90, "候補が " + ids.length + " 件しかない（紙に出せるのは 94 形式）");
});

test("紙に出せる形式が名指しで入っている（穴埋め・並べ替え・組み合わせ・分類）", () => {
  const ids = QM._mockTypeIds();
  ["fill_blank", "ordering", "reorder_english", "matching", "classification",
   "translate_ja", "kanji_input", "essay"].forEach((id) => {
    assert(ids.indexOf(id) >= 0, id + " が選べない（契約 §2 では紙に出せる）");
  });
});

test("紙に出せない操作（音・タップ・めくり）は入らない", () => {
  const ids = QM._mockTypeIds();
  ["audio_choice", "dictation", "flashcard", "image_point", "image_label"].forEach((id) => {
    assert(ids.indexOf(id) < 0, id + " が試験の候補に入っている（紙では操作できない）");
  });
});

test("分類ごとにまとまっていて、分類名もレジストリのもの", () => {
  const groups = QM._typeGroups({});
  assert(groups.length >= 8, "分類が " + groups.length + " しかない");
  const total = groups.reduce((a, g) => a + g.types.length, 0);
  assertEq(total, QM._mockTypeIds().length, "分類に入れ損ねた形式がある");
  groups.forEach((g) => {
    const cat = Q.category(g.id);
    assert(cat, "レジストリに無い分類 " + g.id);
    assertEq(g.label, cat.label, g.id + " の分類名がレジストリと違う");
  });
  /* 同じ形式が 2 つの分類に出ない（重複して数えない） */
  const seen = {};
  groups.forEach((g) => g.types.forEach((t) => {
    assert(!seen[t.id], t.id + " が 2 か所に出ている");
    seen[t.id] = 1;
  }));
});

test("画面に出す名前はレジストリの短い名前（内部 ID のままにしない）", () => {
  const groups = QM._typeGroups({});
  groups.forEach((g) => g.types.forEach((t) => {
    assertEq(t.label, Q.get(t.id).shortName, t.id + " の表示名が違う");
    assert(!/_/.test(t.label), t.id + " が内部 ID のまま出ている");
  }));
});

test("古い保存データ（5 つのキーだけ）が壊れない・選択が消えない", () => {
  const old = { multiple_choice_single: true, true_false: true, short_answer: true,
                long_answer: true, source_analysis: false };
  const groups = QM._typeGroups(old);
  const on = {};
  groups.forEach((g) => g.types.forEach((t) => { if (t.on) on[t.id] = 1; }));
  assertDeep(Object.keys(on).sort(),
    ["long_answer", "multiple_choice_single", "short_answer", "true_false"],
    "古い保存データのチェックが変わっている");
});

test("レジストリから消えた形式でも、オンなら画面から消さない", () => {
  const groups = QM._typeGroups({ audio_choice: true });
  const all = groups.reduce((a, g) => a.concat(g.types.map((t) => t.id)), []);
  assert(all.indexOf("audio_choice") >= 0, "オンにしてある形式が画面から消えた");
});

test("既定でオンの形式は今までどおり（保存データの互換）", () => {
  assert(/types: \{ multiple_choice_single: true, true_false: true, short_answer: true, long_answer: true, source_analysis: false \}/
    .test(QM_SRC), "既定の 5 形式が変わっている");
});

test("チェックの並びは分類ごとに折り畳んで出す（94 個を素で並べない）", () => {
  const groups = QM._typeGroups({ multiple_choice_single: true });
  const html = QM._typesPickerHtml(groups, (k) => k === "qtype:choice");
  /* 開いている分類の中身だけが出ている＝素で 94 個並べていない */
  const boxes = (html.match(/data-type="/g) || []).length;
  assertEq(boxes, groups.filter((g) => g.id === "choice")[0].types.length,
    "閉じている分類の中身まで並べている（" + boxes + " 個）");
  assert(html.indexOf('data-acc="qtype:text"') > 0, "分類の見出しが出ていない");
  assert(html.indexOf("全 " + QM._mockTypeIds().length + " 種類") > 0, "使える形式の数を出していない");
});

/* ══════════════════════════════════════════════════════════════════
   ② 指示文の読み取りと、形式を潰さない配分
   ══════════════════════════════════════════════════════════════════ */
group("2. 指示文の読み取りは共有の日本語解釈（qtypes / blueprint）へ寄せる");

test("「空欄補充を4問、正誤を4問」を形式ごとの個数として読む（契約 §5）", () => {
  const r = QM._parseTypeRequest("空欄補充を4問、正誤を4問つくってください");
  assertDeep(r.typeDistribution, [{ type: "fill_blank", count: 4 }, { type: "true_false", count: 4 }]);
  assertEq(r.counts.fill_blank, 4);
  assertEq(r.counts.true_false, 4);
});

test("4 語に無い形式も読む（英作文並べ替え・和訳入力・組み合わせ）", () => {
  assertEq(QM._parseTypeRequest("英作文並べ替えを5問").counts.reorder_english, 5,
    "並べ替えを読めていない");
  assertEq(QM._parseTypeRequest("和訳入力を3問").counts.translate_ja, 3,
    "和訳入力を読めていない");
  assertEq(QM._parseTypeRequest("組み合わせを2問").counts.matching, 2,
    "組み合わせを読めていない");
});

test("読み取ったことは黙って使わない（notes に残す）", () => {
  const r = QM._parseTypeRequest("空欄補充を4問、正誤を4問");
  assert(r.notes.length >= 2, "notes に残していない: " + JSON.stringify(r.notes));
  assert(r.notes.join("").indexOf("穴埋め") >= 0, "何を読んだのか分かる形になっていない");
});

test("「〜は使わないで」は要求として読まない", () => {
  const r = QM._parseTypeRequest("並べ替えは使わないで、空欄補充を4問");
  assertEq(r.counts.fill_blank, 4);
  assertEq(r.counts.ordering, undefined, "打ち消された形式を要求として読んでいる");
});

test("画面のチェックを 4 形式へ潰さない（mixFromSettings の退行）", () => {
  /* 画面で穴埋め・並べ替え・組み合わせを選んだときの配分。
     潰していた頃は short_answer / multiple_choice へ化けていた。 */
  const mix = QM._resolveTypeMix(6, { fill_blank: 1, ordering: 1, matching: 1 }, QM._parseTypeRequest(""));
  assertDeep(Object.keys(mix.mix).sort(), ["fill_blank", "matching", "ordering"],
    "選んだ形式が別の形式へ化けている: " + JSON.stringify(mix.mix));
  assertEq(mix.mix.fill_blank + mix.mix.ordering + mix.mix.matching, 6);
  const seq = QM._spreadTypes(6, mix.mix);
  assertEq(seq.length, 6);
  assertEq(seq.filter((t) => t === "ordering").length, 2, "並べ替えが 2 問にならない");
});

test("指示文の個数は画面のチェックより優先し、形式 ID のまま渡す", () => {
  const req = QM._parseTypeRequest("空欄補充を4問、正誤を4問");
  const mix = QM._resolveTypeMix(8, { multiple_choice_single: 1, long_answer: 1 }, req);
  assertEq(mix.mix.fill_blank, 4, JSON.stringify(mix.mix));
  assertEq(mix.mix.true_false, 4, JSON.stringify(mix.mix));
  assert(mix.conflicts.length >= 2, "画面で選んでいない形式を黙って採用している");
});

test("指定が画面の形式を埋め尽くしても、粗い 4 語が紛れ込まない", () => {
  const req = QM._parseTypeRequest("穴埋めを3問");
  const mix = QM._resolveTypeMix(10, { fill_blank: 1 }, req);
  Object.keys(mix.mix).forEach((t) => {
    assert(Q.get(t), t + " は形式レジストリに無い（粗い 4 語が混ざっている）: " + JSON.stringify(mix.mix));
  });
  assertEq(Object.keys(mix.mix).reduce((a, k) => a + mix.mix[k], 0), 10);
});

test("古い呼び出し（粗い 4 語）は今までどおり 4 語で返る（後方互換・契約 §3）", () => {
  const req = QM._parseTypeRequest("全問記述式でお願いします");
  const mix = QM._resolveTypeMix(10, { multiple_choice: 1 }, req);
  assertEq(mix.mix.descriptive, 10, JSON.stringify(mix.mix));
});

group("2b. 形式ごとの個数を「試験の枠」まで届ける（契約 §5）");

/* mock-compiler が作る枠（ExamPlan）。ここに指示文の個数が効かないと、
   画面でいくら読み取れても紙には出ない。 */
function planOf(types, over) {
  return MC.plan(Object.assign({
    title: "T", totalPoints: 100, sectionCount: 2, questionCount: 8,
    types: types, difficulty: "mixed"
  }, over || {}));
}
function typeCount(plan) {
  const c = {};
  plan.sections.forEach((s) => s.questions.forEach((q) => { c[q.type] = (c[q.type] || 0) + 1; }));
  return c;
}

test("「空欄補充を4問、正誤を4問」が枠の形式そのものになる", () => {
  const ui = { multiple_choice_single: true, short_answer: true, long_answer: true };
  const plan = planOf(ui);
  const before = typeCount(plan);
  assertEq(before.fill_blank, undefined, "前提が崩れている（頼む前から穴埋めがある）");
  const r = QM._applyTypeDistribution(plan, QM._parseTypeRequest("空欄補充を4問、正誤を4問").typeDistribution, ui);
  const after = typeCount(plan);
  assertEq(after.fill_blank, 4, JSON.stringify(after));
  assertEq(after.true_false, 4, JSON.stringify(after));
  assertEq(r.changed > 0, true);
  assertDeep(r.applied, [{ type: "fill_blank", count: 4 }, { type: "true_false", count: 4 }]);
});

test("枠を書き換えても、配点・番号・ID・設問数は 1 つも変わらない", () => {
  const ui = { multiple_choice_single: true, short_answer: true };
  const plan = planOf(ui);
  const key = (p) => JSON.stringify(p.sections.map((s) => ({
    points: s.points,
    q: s.questions.map((x) => [x.id, x.number, x.points, x.difficulty])
  })));
  const before = key(plan);
  const r = QM._applyTypeDistribution(plan, [{ type: "ordering", count: 3 }], ui);
  assertEq(r.changed, 3, "並べ替え 3 問に届いていない");
  assertEq(typeCount(plan).ordering, 3);
  assertEq(key(plan), before, "配点・番号・ID・難易度のどれかを動かしている");
  assertEq(plan.totalQuestions, 8);
  assertEq(plan.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + q.points, 0), 0),
    plan.totalPoints, "満点が合わなくなった");
});

test("記述系へ変えたら解答の目安字数も付け替える", () => {
  const ui = { multiple_choice_single: true };
  const plan = planOf(ui);
  QM._applyTypeDistribution(plan, [{ type: "essay", count: 2 }], ui);
  const essays = [];
  plan.sections.forEach((s) => s.questions.forEach((q) => { if (q.type === "essay") essays.push(q); }));
  assertEq(essays.length, 2);
  essays.forEach((q) => assert(q.expectedChars >= 40, "論述なのに目安字数が無い: " + q.expectedChars));
});

test("総数に収まらない指定は、黙って切らずに理由を残す", () => {
  const ui = { multiple_choice_single: true };
  const plan = planOf(ui, { questionCount: 4 });
  const r = QM._applyTypeDistribution(plan, [{ type: "fill_blank", count: 9 }], ui);
  assertEq(typeCount(plan).fill_blank, 4, "枠を超えて入れている");
  assert(r.notes.length > 0, "入りきらなかったことを黙っている");
});

test("指示が無ければ枠を 1 つも動かさない", () => {
  const ui = { multiple_choice_single: true, short_answer: true };
  const plan = planOf(ui);
  const before = JSON.stringify(plan);
  const r = QM._applyTypeDistribution(plan, QM._parseTypeRequest("日本史から作って").typeDistribution, ui);
  assertEq(r.changed, 0);
  assertEq(JSON.stringify(plan), before, "頼まれていないのに枠を書き換えている");
});

/* ══════════════════════════════════════════════════════════════════
   ③ 文書形式の「動くふり」をやめる
   ══════════════════════════════════════════════════════════════════ */
group("3. 効かない組み合わせは、効かないと言う");

const uiLayout = (over) => Object.assign({
  outputEngine: "current", layoutMode: "current", answerSheetMode: "current",
  documentFamily: "auto", subjectLayout: "auto", layoutSeed: ""
}, over || {});

test("既定（出力エンジン current ＋ 紙面デザイン current）では効かないと言う", () => {
  const e = QM._layoutEffect(uiLayout({ documentFamily: "mock-exam" }));
  assertEq(e.chosen, true);
  assertEq(e.effective, false, "効かないのに「効く」と言っている");
  assert(e.note.indexOf("紙面は変わりません") >= 0, "何が起きないのかを言っていない: " + e.note);
});

test("教科レイアウトだけを選んだときも同じ", () => {
  assertEq(QM._layoutEffect(uiLayout({ subjectLayout: "mathematics" })).effective, false);
});

test("紙面デザインを選べば効く（＝いつも「効かない」と言うわけではない）", () => {
  const ready = VQ2.layoutProfiles.LAYOUT_MODES.filter((m) => m.ready && m.profileId)[0];
  assert(ready, "用意できている紙面デザインが 1 つも無い");
  const e = QM._layoutEffect(uiLayout({ documentFamily: "mock-exam", layoutMode: ready.id }));
  assertEq(e.effective, true, "効く組み合わせまで「効かない」と言っている");
  assertEq(e.note, "");
});

test("Typst / TeX を選べば効く（文書形式から組み直すため）", () => {
  ["typst", "tex"].forEach((eng) => {
    const e = QM._layoutEffect(uiLayout({ documentFamily: "workbook", outputEngine: eng }));
    assertEq(e.effective, true, eng + " で効かないと言っている");
  });
});

test("何も選んでいなければ、余計な断りを出さない", () => {
  const e = QM._layoutEffect(uiLayout());
  assertEq(e.chosen, false);
  assertEq(e.note, "");
});

test("8 つの文書形式すべてで、既定の組み合わせでは効かないと言う", () => {
  const ids = VQ2.layoutGrammar.DOCUMENT_FAMILY_IDS;
  assertEq(ids.length, 8, "文書形式の数が変わった");
  ids.forEach((id) => {
    assertEq(QM._layoutEffect(uiLayout({ documentFamily: id })).effective, false,
      id + " だけ「効く」と言っている");
  });
});

test("「効きません」の断りが画面の文言として実在する", () => {
  assert(QM.LAYOUT_NO_EFFECT_NOTE.indexOf("紙面は変わりません") >= 0);
  assert(QM_SRC.indexOf("LAYOUT_NO_EFFECT_NOTE") > 0);
  /* 設定欄・要約・選び直した瞬間の 3 か所で言う（1 か所だと見落とす） */
  assert(/statusChip\("warning", "効きません"\)/.test(QM_SRC), "設定欄に断りを出していない");
  assert(/この組み合わせでは紙面は変わりません/.test(QM_SRC), "要約に断りを出していない");
  assert(/app\.toast\(LAYOUT_NO_EFFECT_NOTE/.test(QM_SRC), "選び直した瞬間に何も言っていない");
});

process.exit(report("Quick Mock × 形式レジストリ／紙面の正直さ") ? 1 : 0);
