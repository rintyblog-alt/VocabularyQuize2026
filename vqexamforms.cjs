/* ══════════════════════════════════════════════════════════════════════════
   vqexamforms.cjs — **出す 形式ぜんぶが 右の 解答欄と 解答用紙に 出るか**

   訴え（2026-08-30・Rinty さん）
     「並び替え問題、組み合わせ問題、選べという問題なんだけど、
       全て空欄になってしまってる。右の解答側が。
       出す形式の全てを右側の解答欄、そして解答用紙に対応させないと」

   真因:
     組み立て（MC.assemble）が 運ぶのは 選択肢・空欄・語群だけだった。
     **並べる 語・対応の 左右・分ける 箱・うめる 表は 丸ごと 捨てて**いた。
     しかも 並べ替え・組み合わせは NEEDS_CHOICES に 入っていないので、
     AI が choices に 入れて 返した 中身も その場で 空に されていた。
     出す ものが 無いので、紙も 右の 解答欄も 空に なる。

   見るのは（画面を 使わず、器の 通り道だけを 測る）:
     ① AI の 返事 → 組み立て で 中身が 残る
     ② 紙（問題冊子）に 出る
     ③ 解答用紙に 欄が 出る
     ④ 採点が 通る（正解で 満点・違う 並びで 0 点）

   使い方: node vqexamforms.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer,
      G = VQ2.grading, AG = VQ2.aigen;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 320) : "")); }
};
const 本体 = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");

/* AI が 返しそうな 形（サーバの 呼び名で・文字列の 配列で）。 */
function AIの返事(type, i) {
  const b = { id: "x" + i, explanation: "①正解。②言い過ぎ。③逆。④足りない。" };
  if (type === "ordering") return Object.assign(b, { type: "reorder",
    question: "次の できごとを 古い 順に 並べよ。",
    choices: ["大化の改新", "壬申の乱", "平城京遷都", "墾田永年私財法"],
    answer: ["大化の改新", "壬申の乱", "平城京遷都", "墾田永年私財法"] });
  if (type === "matching") return Object.assign(b, { type: "matching",
    question: "人物と 事績を 組み合わせよ。",
    answer: [["中大兄皇子", "大化の改新"], ["桓武天皇", "平安京遷都"], ["聖武天皇", "大仏造立"]] });
  if (type === "multiple_choice_single") return Object.assign(b, { type: "single_choice",
    question: "最も 適当な ものを 選べ。", choices: ["あ", "い", "う", "え"], answer: "あ" });
  if (type === "true_false") return Object.assign(b, { type: "true_false",
    question: "正しければ 正、誤りなら 誤と 答えよ。", answer: true });
  if (type === "fill_blank") return Object.assign(b, { type: "fill_blank",
    question: "本文の 【ア】・【イ】 に 入る 語を 答えよ。", answer: ["母集団", "標本"] });
  if (type === "numeric") return Object.assign(b, { type: "numeric_input",
    question: "数で 答えよ。", answer: "7" });
  if (type === "short_answer") return Object.assign(b, { type: "text_input",
    question: "ひとことで 答えよ。", answer: "こたえ" });
  return Object.assign(b, { type: "free_text", question: "40 字以内で 説明せよ。",
    answer: "本文の とおり。", modelAnswer: "本文の とおり。",
    rubric: [{ description: "根拠", points: 3 }] });
}

function 試験(形式ら) {
  const types = {}; 形式ら.forEach((t) => { types[t] = true; });
  const p = MC.plan({ title: "形式ぜんぶ", subject: "日本史探究", durationMinutes: 50,
    totalPoints: 形式ら.length * 10, sectionCount: 1, questionCount: 形式ら.length,
    types: types, difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  const filled = {};
  qs.forEach((q, i) => { filled[q.id] = AG.toClientShape(AIの返事(q.type, i), i); });
  const out = MC.assemble(p, filled, {});
  const sp = out.spec;
  sp.cover = { examName: "形式ぜんぶ", subject: "日本史探究" };
  return { out, sp, 全: sp.sections.reduce((a, s) => a.concat(s.questions), []) };
}

const 形式ら = ["multiple_choice_single", "true_false", "fill_blank", "short_answer",
                "numeric", "ordering", "matching", "long_answer"];

節("① AI の 返事 → 組み立て で 中身が 残る");
const { out, sp, 全 } = 試験(形式ら);
見(out.accepted === 形式ら.length, "全部 受かる",
   out.accepted + " / " + 形式ら.length + "（捨てた: "
   + JSON.stringify((out.rejected || []).map((x) => x.reasons.map((y) => y.code))) + "）");
{
  const o = 全.filter((q) => q.type === "ordering")[0];
  const m = 全.filter((q) => q.type === "matching")[0];
  const c = 全.filter((q) => q.type === "multiple_choice_single")[0];
  const f = 全.filter((q) => q.type === "fill_blank")[0];
  見(!!o && (o.orderItems || []).length === 4, "★ 並べ替え：並べる語が 4 つ 残る",
     o && (o.orderItems || []).length);
  見(!!o && (o.correctOrder || []).length === 4, "★ 並べ替え：正しい 順も 残る",
     o && (o.correctOrder || []).length);
  見(!!m && m.pairs && (m.pairs.left || []).length === 3 && (m.pairs.right || []).length === 3,
     "★ 組み合わせ：左右 3 つずつ 残る",
     m && m.pairs && ((m.pairs.left || []).length + "/" + (m.pairs.right || []).length));
  見(!!m && m.correctAnswer && Object.keys(m.correctAnswer).length === 3,
     "★ 組み合わせ：対応も 残る", m && JSON.stringify(m.correctAnswer));
  見(!!c && (c.choices || []).length === 4, "選択：選択肢が 4 つ", c && (c.choices || []).length);
  見(!!f && (f.blanks || []).length === 2, "穴埋め：空欄が 2 つ", f && (f.blanks || []).length);
}

節("② 問題冊子に 出る");
const plan = L.buildPlan(sp);
const 問冊 = (plan.booklets || []).filter((x) => x.kind === "question")[0];
const h = 本体(String(R.buildHtml(sp, plan, { bookletId: 問冊.id })));
{
  const 種 = 問冊.blocks.map((b) => b.type);
  見(種.indexOf("order-bank") >= 0, "★ 並べ替えの 語が 紙に 出る", 種.join(","));
  見(種.indexOf("match-pairs") >= 0, "★ 組み合わせの 左右が 紙に 出る");
  見(h.indexOf("大化の改新") >= 0, "並べる 語の 中身が 出る");
  見(h.indexOf("中大兄皇子") >= 0 && h.indexOf("平安京遷都") >= 0, "対応の 左右の 中身が 出る");
}

節("③ 解答用紙に 欄が 出る");
{
  const 解 = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
  const a = 本体(String(R.buildHtml(sp, plan, { bookletId: 解.id })));
  const 欄 = (a.match(/data-question="/g) || []).length;
  見(欄 >= 形式ら.length, "★ 形式の 数だけ 欄が 出る", 欄 + " 欄 / " + 形式ら.length + " 問");
  形式ら.forEach((t) => {
    const q = 全.filter((x) => x.type === t)[0];
    見(!!q && a.indexOf('data-question="' + q.id + '"') >= 0, "　" + t + " の 欄が ある");
  });
}

節("④ 採点が 通る");
{
  const o = 全.filter((q) => q.type === "ordering")[0];
  const m = 全.filter((q) => q.type === "matching")[0];
  見(G.gradeSession([o], [{ questionId: o.id, value: o.correctOrder }]).items[0].score === o.points,
     "★ 並べ替え：正しい 順で 満点", o.points);
  見(G.gradeSession([o], [{ questionId: o.id, value: o.correctOrder.slice().reverse() }]).items[0].score < o.points,
     "★ 並べ替え：逆に すると 減る");
  見(G.gradeSession([m], [{ questionId: m.id, value: m.correctAnswer }]).items[0].score === m.points,
     "★ 組み合わせ：正しい 対応で 満点", m.points);
  const 崩 = {}; Object.keys(m.correctAnswer).forEach((k, i, ks) => {
    崩[k] = m.correctAnswer[ks[(i + 1) % ks.length]]; });
  見(G.gradeSession([m], [{ questionId: m.id, value: 崩 }]).items[0].score < m.points,
     "★ 組み合わせ：ずらすと 減る");
}

節("⑤ 受験の 右側（CBT）に 押せる ものが 出る");
{
  /* 画面を 立てずに、器が 持っている データだけで 判定する。
     右の 解答欄は これらを 読んで 札・選び・欄を 作る。 */
  const 見立て = {
    multiple_choice_single: (q) => (q.choices || []).length >= 2,
    true_false: (q) => (q.choices || []).length === 2,
    fill_blank: (q) => (q.blanks || []).length >= 1,
    short_answer: (q) => true,
    numeric: (q) => true,
    ordering: (q) => (q.orderItems || []).length >= 2,
    matching: (q) => !!(q.pairs && (q.pairs.left || []).length >= 2 && (q.pairs.right || []).length >= 2),
    long_answer: (q) => true
  };
  形式ら.forEach((t) => {
    const q = 全.filter((x) => x.type === t)[0];
    const ok = !!q && 見立て[t](q);
    見(ok, "★ " + t + "：右の 解答欄に 出す 中身が ある",
       q ? JSON.stringify({ 選: (q.choices || []).length, 空: (q.blanks || []).length,
             並: (q.orderItems || []).length,
             対: q.pairs ? (q.pairs.left || []).length : 0 }) : "設問なし");
  });
  /* 打ち込み欄へ 落ちる（＝作れなかった）ものが 無いこと。 */
  const 落ちる = 形式ら.filter((t) => { const q = 全.filter((x) => x.type === t)[0];
    return !q || !見立て[t](q); });
  見(落ちる.length === 0, "★ 打ち込み欄へ 落ちる 形式が 1 つも 無い", 落ちる);
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
