/* ══════════════════════════════════════════════════════════════════════
   生成条件をユーザーが確認・修正できる（§45）／満たせないときの言い方（§46）

   なぜ要るか：指示文の日本語を規則で読むところは、直すたびに別の読み違えが出る。
   実測で出たものだけでも
     ・「AとBとCで20問」の 20 問を最後の形式の個数として読む
     ・「英訳和訳」の和訳が配分から消える
   規則を足しても完璧にはならないので、**読み取った結果を出して直させる**。

   ここで見るのは 3 つ。
     A. 解釈した条件が画面に出る（問題数・形式・個数・禁止形式・資料・範囲・難易度・解説）
     B. warnings / converted が画面へ出る（契約 §6。作られているのに誰も読んでいなかった）
     C. 直した内容が、実際の生成の条件を変える（planMix の結果が変わる）
   加えて §46 の言い方（できない理由と、次にできること）。

   実行: node client/v2/tests/condition-review.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installLocalStorage, installLocation, loadV2, V2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "capability", "qplan", "draft"
].map((f) => "domain/" + f + ".js"));

/* ui/preset-studio.js はブラウザ用。画面の部品は使う場所だけ最小に埋める。
   確認シートの中身（COND.html）は esc しか使わないので、これで本物と同じ物が出る。 */
VQ2.ui = {
  esc: (s) => String(s === undefined || s === null ? "" : s)
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  icon: () => "", button: () => "", field: () => "", empty: () => "",
  mount: () => ({}), on: () => {}, AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/preset-studio.js"), "utf8")).call(globalThis);

const PS = VQ2.presetStudio;
const C = PS && PS.condition;
const B = VQ2.blueprint, QPL = VQ2.qplan;

/* 画面と同じ道すじで条件を作る（extractRequirements → candidates → build）。 */
function read(text, opts) {
  const o = Object.assign({ count: 10 }, opts || {});
  const req = B.extractRequirements(text, o);
  const analysis = B.analyzeContent({ text: text, attachments: (o.attachments || []) });
  const cand = B.candidates(req, analysis, {});
  return {
    req,
    cand,
    cond: C.build(req, cand, {
      instruction: text,
      sources: o.sources || [],
      sourceOnly: o.sourceOnly !== false
    })
  };
}
/* 条件どおりに配分を決めさせる。preset-studio の planForBatch() と同じ順番・同じ引数。
   （読み取り → 条件で上書き → 「〜だけ」なら manual → planMix） */
function planWith(base, cond, count) {
  const req = JSON.parse(JSON.stringify(base.req));
  C.applyToReq(req, cond);
  const types = C.planTypes(cond, []);
  return QPL.planMix({
    count: count === undefined ? C.wantFor(cond, 0, 10) : count,
    style: types.length ? "manual" : "auto",
    types: types,
    requestedTypes: req.requestedTypes,
    exclude: req.excludedTypes,
    requirements: req
  });
}
function totalOf(plan) { return plan.items.reduce((a, i) => a + i.count, 0); }
function typesOf(plan) { return plan.items.map((i) => i.type); }
function rowValue(cond, key) {
  const r = C.rows(cond).filter((x) => x.key === key)[0];
  return r ? r.value : null;
}

/* ══════════════════════════════════════════════════════════════════ */
group("0. 画面を持たない部分が外へ出ている");

test("VQ2.presetStudio.condition から呼べる", () => {
  assert(C, "presetStudio.condition がありません");
  ["build", "patch", "rows", "lines", "text", "html", "ambiguity", "needsConfirm",
   "shouldConfirm", "wantFor", "applyToReq", "unavailableText", "shortfall"]
    .forEach((k) => assert(typeof C[k] === "function", k + " がありません"));
});

/* ══════════════════════════════════════════════════════════════════ */
group("A. 解釈した条件が出る");

test("問題数・形式・形式ごとの個数・禁止形式・資料・範囲・難易度・解説が並ぶ", () => {
  const { cond } = read(
    "英語教科書の12〜30ページから、空欄補充を4問、正誤を4問。4択と記述は使わないで。高校1年生向け。",
    { sources: ["英語教科書.pdf"] });
  const keys = C.rows(cond).map((r) => r.key);
  ["total", "types", "dist", "forbidden", "sources", "range", "difficulty", "explanation"]
    .forEach((k) => assert(keys.indexOf(k) >= 0, k + " の行がありません（" + keys.join(",") + "）"));
  assertEq(rowValue(cond, "total"), "8問", "問題数");
  assertEq(rowValue(cond, "range"), "12〜30ページ", "範囲");
  assertEq(rowValue(cond, "sources"), "英語教科書.pdf", "資料");
  assertEq(rowValue(cond, "difficulty"), "高校1年生", "難易度");
  assertEq(rowValue(cond, "explanation"), "あり", "解説");
});

test("形式ごとの個数が「名前 N問」で出る", () => {
  const { cond } = read("空欄補充を4問、正誤を4問つくって");
  const v = rowValue(cond, "dist");
  assert(/4問/.test(v) && v.split("／").length === 2, "形式ごとの個数：" + v);
  assertEq(C.sumDistribution(cond.typeDistribution), 8, "個数の合計");
});

test("禁止形式に、形式名とまとめての禁止（4択・記述）が両方出る", () => {
  const { cond } = read("10問。4択と記述は使わないで。");
  const v = rowValue(cond, "forbidden");
  assert(/4択/.test(v), "4択が出ていません：" + v);
  assert(/記述/.test(v), "記述が出ていません：" + v);
});

test("解説がいらないと書いてあれば「なし」と出る", () => {
  assertEq(rowValue(read("10問。解説はいりません。").cond, "explanation"), "なし");
});

test("形式の指定が無ければ「おまかせ」と正直に出す（読めたふりをしない）", () => {
  const { cond } = read("この資料から 10 問つくって");
  assertEq(rowValue(cond, "types"), "おまかせ（教材に合わせてこちらで決めます）");
});

test("画面に出る HTML に、条件の行がそのまま入っている", () => {
  const { cond } = read("英語教科書の12〜30ページから10問。4択は使わないで。", { sources: ["英語教科書.pdf"] });
  const html = C.html(cond, {});
  C.rows(cond).forEach((r) => {
    assert(html.indexOf(r.label) >= 0, r.label + " が HTML にありません");
  });
  assert(html.indexOf("12〜30ページ") >= 0, "範囲が HTML にありません");
  assert(html.indexOf('data-cond="total"') >= 0, "問題数を直す入力がありません");
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. warnings と converted が画面へ出る（契約 §6）");

test("「英訳和訳を5問」の読み替えが warnings に入り、条件に載る", () => {
  const { req, cond } = read("英訳和訳を5問つくって");
  assert(req.warnings.length > 0, "blueprint 側に warnings がありません");
  assertEq(cond.warnings.length, req.warnings.length, "warnings が条件へ渡っていません");
  assert(/合わせて/.test(cond.warnings[0]), "読み替えの説明がありません：" + cond.warnings[0]);
});

test("warnings が確認シートの HTML に出る", () => {
  const { cond } = read("英訳和訳を5問つくって");
  const html = C.html(cond, {});
  assert(html.indexOf("読み取りの注意") >= 0, "注意の見出しがありません");
  cond.warnings.forEach((w) => {
    assert(html.indexOf(VQ2.ui.esc(w)) >= 0, "warning が HTML にありません：" + w);
  });
});

test("converted（何をどう変えたか）も HTML に出る", () => {
  const { req, cond } = read("英訳和訳を5問つくって");
  assert(req.converted.length > 0, "converted がありません");
  assertEq(cond.converted.length, req.converted.length, "converted が条件へ渡っていません");
  const html = C.html(cond, {});
  assert(html.indexOf("形式ごとの個数：") >= 0, "converted の中身が HTML にありません");
});

test("読み替えがあるときは needsConfirm が立つ（黙って作りはじめない）", () => {
  assertEq(C.needsConfirm(read("英訳和訳を5問つくって").cond), true);
});

test("個数の合計が問題数に足りないことを、迷いとして出す", () => {
  const { cond } = read("20問作って。空欄補充を4問、正誤を4問。");
  const amb = C.ambiguity(cond);
  assert(amb.some((x) => /残り\s*12\s*問/.test(x)), "残りの説明がありません：" + JSON.stringify(amb));
  assert(C.html(cond, {}).indexOf("ここを確かめてください") >= 0, "強調の枠が出ていません");
});

test("形式を言っているのに読み取れなかったときは迷いとして出す", () => {
  const { cond } = read("むずかしい言い方の形式でお願いします");
  assert(C.ambiguity(cond).some((x) => /読み取れませんでした/.test(x)),
    "読み取れなかったことを言っていません：" + JSON.stringify(C.ambiguity(cond)));
});

test("迷いが無ければ needsConfirm は立たない（毎回は止めない材料）", () => {
  assertEq(C.needsConfirm(read("この資料から 10 問つくって").cond), false);
});

test("既定では毎回確認する。省く設定でも迷いがあれば必ず確認する", () => {
  const clear = read("この資料から 10 問つくって").cond;
  const messy = read("英訳和訳を5問つくって").cond;
  assertEq(C.shouldConfirm(clear, true), true, "既定は毎回確認");
  assertEq(C.shouldConfirm(clear, false), false, "迷いが無く省く設定なら止めない");
  assertEq(C.shouldConfirm(messy, false), true, "省く設定でも迷いがあれば止める");
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. 直すと生成の条件が変わる");

test("問題数を直すと、作る数がその数になる", () => {
  const base = read("この資料から20問作って。");
  assertEq(base.cond.totalQuestions, 20, "読み取り");
  assertEq(totalOf(planWith(base, base.cond)), 20, "直す前");
  const edited = C.patch(base.cond, { totalQuestions: 6 });
  assertEq(edited.totalQuestions, 6, "条件の問題数");
  assertEq(totalOf(planWith(base, edited)), 6, "直したあと");
});

test("問題数を増やしても、形式ごとの個数はそのまま守られる", () => {
  const base = read("20問作って。空欄補充を4問、正誤を4問。");
  const edited = C.patch(base.cond, { totalQuestions: 30 });
  const plan = planWith(base, edited);
  assertEq(totalOf(plan), 30, "総数（" + plan.summary + "）");
  assertEq(plan.items.filter((i) => i.type === "fill_blank")
    .reduce((a, i) => a + i.count, 0), 4, "空欄補充（" + plan.summary + "）");
});

test("問題数を、形式ごとの個数の合計より小さくしたら、合計を採ってそのことを出す", () => {
  /* どの形式を削るかをこちらで勝手に決めるのは「無言の変換」（契約 §6）。
     合計を採り、変えたことを必ず画面へ出す。 */
  const base = read("20問作って。空欄補充を4問、正誤を4問。");
  const edited = C.patch(base.cond, { totalQuestions: 3 });
  assertEq(edited.totalQuestions, 8, "合計を採っていません");
  assert(edited.notes.some((n) => /8\s*問/.test(n)), "notes がありません：" + JSON.stringify(edited.notes));
  assert(C.html(edited, {}).indexOf("問題数を 8 問にしました") >= 0, "画面に出ていません");
});

test("実際に作る数を決めるのは、直した条件（指示文の数ではない）", () => {
  const base = read("20問作って。");
  assertEq(C.wantFor(null, 20, 10), 20, "条件が無ければ指示文の数");
  assertEq(C.wantFor(C.patch(base.cond, { totalQuestions: 7 }), 20, 10), 7, "条件があればそちら");
  assertEq(C.wantFor(null, 0, 10), 10, "どちらも無ければ既定");
});

test("禁止形式へ足すと、その形式が配分から消える", () => {
  const base = read("20問作って。空欄補充を4問、正誤を4問。");
  assert(typesOf(planWith(base, base.cond)).indexOf("true_false") >= 0, "直す前に○×が居ません");
  const edited = C.patch(base.cond, { excludeTypes: ["true_false"] });
  assert(edited.excludedTypes.indexOf("true_false") >= 0, "禁止形式に入っていません");
  assertEq(typesOf(planWith(base, edited)).indexOf("true_false"), -1, "○×が残っています");
});

test("形式ごとの個数を直すと、その個数で作る", () => {
  const base = read("20問作って。空欄補充を4問、正誤を4問。");
  const edited = C.patch(base.cond, { setCount: { fill_blank: 9 } });
  const plan = planWith(base, edited);
  const n = plan.items.filter((i) => i.type === "fill_blank").reduce((a, i) => a + i.count, 0);
  assertEq(n, 9, "空欄補充の数（" + plan.summary + "）");
});

test("形式ごとの個数を 0 にすると、その指定は消える", () => {
  const base = read("空欄補充を4問、正誤を4問つくって");
  const edited = C.patch(base.cond, { setCount: { true_false: 0 } });
  assertEq(edited.typeDistribution.filter((e) => e.type === "true_false").length, 0, "行が残っています");
  assertEq(C.sumDistribution(edited.typeDistribution), 4, "残った合計");
});

test("形式を外すと、読み取り直しても復活しない（人が直したほうが正）", () => {
  const base = read("空欄補充を4問、正誤を4問つくって");
  const edited = C.patch(base.cond, { removeTypes: ["true_false"] });
  const req = JSON.parse(JSON.stringify(base.req));
  assert(req.requestedTypes.indexOf("true_false") >= 0, "読み取りには残っているはず");
  C.applyToReq(req, edited);
  assertEq(req.requestedTypes.indexOf("true_false"), -1, "外した形式が復活しています");
  assertEq(req.typeDistribution.filter((e) => e.type === "true_false").length, 0, "個数が復活しています");
});

test("形式を足すと、その形式が配分に入る", () => {
  const base = read("この資料から 10 問つくって");
  const edited = C.patch(base.cond, { addTypes: ["ordering"] });
  assert(typesOf(planWith(base, edited)).indexOf("ordering") >= 0,
    "足した形式が入っていません：" + planWith(base, edited).summary);
});

test("「この形式だけ」を外すと、ほかの形式も混ざる", () => {
  const base = read("並べ替えだけで作って");
  assertEq(base.cond.onlyRequested, true, "「だけ」が読めていません");
  const only = planWith(base, base.cond);
  assertEq(new Set(typesOf(only)).size, 1, "「だけ」なのに複数形式：" + only.summary);
  const mixed = planWith(base, C.patch(base.cond, { onlyRequested: false }));
  assert(new Set(typesOf(mixed)).size > 1, "外しても 1 形式のまま：" + mixed.summary);
});

test("禁止した形式は、要求からも個数からも同時に外れる（食い違いを残さない）", () => {
  const base = read("空欄補充を4問、正誤を4問つくって");
  const edited = C.patch(base.cond, { excludeTypes: ["fill_blank"] });
  assertEq(edited.requestedTypes.indexOf("fill_blank"), -1, "要求に残っています");
  assertEq(edited.typeDistribution.filter((e) => e.type === "fill_blank").length, 0, "個数に残っています");
});

test("個数の合計が問題数を超えたら、超えたことを notes に残す（黙って変えない）", () => {
  const base = read("この資料から 10 問つくって");
  const edited = C.patch(base.cond, { setCount: { fill_blank: 12 } });
  assertEq(edited.totalQuestions, 12, "合計に合わせていません");
  assert(edited.notes.some((n) => /12\s*問/.test(n)), "notes がありません：" + JSON.stringify(edited.notes));
  assert(C.html(edited, {}).indexOf("問題数を 12 問にしました") >= 0, "画面に出ていません");
});

/* ══════════════════════════════════════════════════════════════════ */
group("D. §46 できない理由と、次にできること");

test("使えない形式は、理由と代わりを添えて出す", () => {
  const { cond } = read("図へのラベル配置で 10 問", { requestedTypes: ["image_label"] });
  assertEq(cond.unavailable.length, 1, "使えない形式が拾えていません");
  const t = C.unavailableText(cond.unavailable[0]);
  assert(/^指定された「.+」は/.test(t), "言い方が違います：" + t);
  assert(/利用できる形式：/.test(t), "代わりが出ていません：" + t);
  assert(cond.unavailable[0].alternatives.length > 0, "代わりが空です");
});

test("理由が分からないときは「現在ご利用いただけません」と言う", () => {
  const t = C.unavailableText({ type: "x", name: "音声並び替え", reason: "いまは使えません",
                                alternatives: [{ type: "ordering", name: "英文並び替え" }] });
  assertEq(t.split("\n")[0], "指定された「音声並び替え」は現在ご利用いただけません。");
  assertEq(t.split("\n")[1], "利用できる形式：英文並び替え");
});

test("使えない形式があるうちは確認が要る（黙って別形式へ変えない）", () => {
  const { cond } = read("図へのラベル配置で 10 問", { requestedTypes: ["image_label"] });
  assertEq(C.needsConfirm(cond), true);
  assert(C.html(cond, {}).indexOf("指定された形式が使えません") >= 0, "画面に出ていません");
});

test("代わりを選ぶと、使えない形式は消え、代わりが入り、あきらめたことが残る", () => {
  const { cond } = read("図へのラベル配置で 10 問", { requestedTypes: ["image_label"] });
  const alt = cond.unavailable[0].alternatives[0].type;
  const edited = C.patch(cond, { addTypes: [alt], dropTypes: ["image_label"] });
  assertEq(edited.unavailable.length, 0, "使えない形式が残っています");
  assert(edited.requestedTypes.indexOf(alt) >= 0, "代わりが入っていません");
  assert(edited.dropped.indexOf("image_label") >= 0, "あきらめた記録がありません");
  assert(C.html(edited, {}).indexOf("使わないことにした形式") >= 0, "画面に出ていません");
});

test("頼んだ数に届かなかったときは、作成可能な数と次の 3 手を出す", () => {
  const sf = C.shortfall({ want: 10, made: 7, typeName: "英文並び替え", sourceOnly: true });
  assert(/10問作れるだけの内容を取得できませんでした。$/.test(sf.title), "言い方が違います：" + sf.title);
  assertEq(sf.body, "作成可能：7問");
  assertEq(sf.actions.map((a) => a.label).join("／"), "7問で作成／範囲を広げる／別形式を追加");
  assertEq(sf.actions.map((a) => a.id).join(","), "shortfall-accept,attach-add,shortfall-types");
});

/* ══════════════════════════════════════════════════════════════════ */
group("E. 壊れた入力でも止まらない");

test("読み取れなかったとき（req が無い）でも条件は作れる", () => {
  const cond = C.build(null, null, { instruction: "" });
  assert(C.rows(cond).length > 0, "行がありません");
  assertEq(cond.totalQuestions, 10, "既定の問題数");
});

test("問題数は 1〜500 に収める", () => {
  const cond = C.build(null, null, { instruction: "" });
  assertEq(C.patch(cond, { totalQuestions: 0 }).totalQuestions, 1);
  assertEq(C.patch(cond, { totalQuestions: 9999 }).totalQuestions, 500);
  assertEq(C.patch(cond, { totalQuestions: "あ" }).totalQuestions, 1);
});

test("ページ範囲と学年の読み取り", () => {
  assertEq(C.readPageRange("12〜30ページ").from, 12);
  assertEq(C.readPageRange("12〜30ページ").to, 30);
  assertEq(C.readPageRange("１２ページから３０ページ").to, 30);
  assertEq(C.readPageRange("40ページ以降").to, 0);
  assertEq(C.readPageRange("範囲の指定なし"), null);
  assertEq(C.readGrade("中学3年生むけ"), "中学3年生");
  assertEq(C.readGrade("高等学校二年"), "高校2年生");
  assertEq(C.readGrade("小学生でも解けるように"), "小学生");
  assertEq(C.readGrade("学年の指定なし"), "");
});

process.exit(report("生成条件の確認（§45 / §46）") ? 1 : 0);
