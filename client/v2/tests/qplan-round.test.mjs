/* 出題形式の配分を、回ごとに配る

   なぜ配るのか（実測・2026-08-04・ローカル Qwen3-VL-30B）:
     1 回の依頼で複数の形式を頼むと、モデルはほぼ 1 形式へ寄せる。
       「単語入力3 / 空欄2 / 並び替え2 / カード1 / 記述1 / 組合せ1」→ 単語入力 10 問
       「4択4 / 単語3 / 空欄1 / …」→ 短答 12 問
     1 問ずつ名指ししても直らなかった（単一形式の指定まで崩れた）。
     一方、**1 形式だけを頼めば、そのとおりに作る**。

   そこでモデルと戦わず、1 回の依頼へ入れる形式を 1〜2 種類へ絞り、
   回をまたいで配る。**全体の配分は変えない**。ここではその性質を確かめる。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan"
].map((f) => "domain/" + f + ".js"));

const QPL = VQ2.qplan;

/* 配り切るまで回す。回ごとの中身を返す。 */
function dealAll(plan, size) {
  const rounds = [];
  let pool = plan;
  for (let i = 0; i < 50 && pool; i++) {
    const r = QPL.take(pool, size);
    if (!r.plan) break;
    rounds.push(r.plan);
    pool = r.rest;
  }
  return rounds;
}
function totalOf(items) { return items.reduce((a, i) => a + i.count, 0); }
function countByType(rounds) {
  const o = {};
  rounds.forEach((r) => r.items.forEach((i) => { o[i.type] = (o[i.type] || 0) + i.count; }));
  return o;
}

/* ══════════════════════════════════════════════════════════════ */
group("1. 配っても全体は変わらない");

const plan20 = QPL.planMix({ count: 20, style: "wide", subject: "日本史" });

test("全体で 20 問のまま", () => {
  const rounds = dealAll(plan20, 5);
  assertEq(totalOf(rounds.flatMap((r) => r.items)), 20);
});

test("形式ごとの数も変わらない", () => {
  const before = {};
  plan20.items.forEach((i) => { before[i.type] = i.count; });
  const after = countByType(dealAll(plan20, 5));
  Object.keys(before).forEach((t) => {
    assertEq(after[t], before[t], t + " の数が変わっています");
  });
});

test("勝手な形式を足さない", () => {
  const known = new Set(plan20.items.map((i) => i.type));
  Object.keys(countByType(dealAll(plan20, 5))).forEach((t) => {
    assert(known.has(t), "頼んでいない形式が増えています: " + t);
  });
});

/* ══════════════════════════════════════════════════════════════ */
group("2. 1 回に入れる形式を絞る");

test("1 回あたりの形式は 3 種類まで", () => {
  /* 上限は 2 種類。ただし数を優先して足すことがあるので、3 までは許す。
     8 種類を 1 回で頼むのが問題だったので、そこを見る。 */
  dealAll(plan20, 5).forEach((r, i) => {
    assert(r.items.length <= 3, `回 ${i + 1} が ${r.items.length} 形式です: ${r.summary}`);
  });
});

test("1 回の問題数は頼んだ数どおり", () => {
  const rounds = dealAll(plan20, 5);
  rounds.slice(0, -1).forEach((r, i) => {
    assertEq(totalOf(r.items), 5, `回 ${i + 1}`);
  });
});

test("回の数は、全体 ÷ 1 回の数（増えない）", () => {
  assertEq(dealAll(plan20, 5).length, 4);
});

/* ══════════════════════════════════════════════════════════════ */
group("3. 端の場合");

test("形式が 1 つだけなら、そのまま配る", () => {
  const one = QPL.planMix({ count: 8, style: "manual", types: ["true_false"] });
  const rounds = dealAll(one, 5);
  rounds.forEach((r) => {
    assertEq(r.items.length, 1);
    assertEq(r.items[0].type, "true_false");
  });
  assertEq(totalOf(rounds.flatMap((r) => r.items)), 8);
});

test("1 回の数が全体より大きくても壊れない", () => {
  const small = QPL.planMix({ count: 3, style: "wide" });
  const r = QPL.take(small, 10);
  assertEq(totalOf(r.plan.items), 3);
  assertEq(r.rest, null);
});

test("空の配分を渡しても落ちない", () => {
  const r = QPL.take({ items: [] }, 5);
  assertEq(r.plan, null);
  assertEq(r.rest, null);
});

test("1 問ずつでも配り切れる", () => {
  const rounds = dealAll(plan20, 1);
  assertEq(totalOf(rounds.flatMap((r) => r.items)), 20);
  rounds.forEach((r) => assertEq(r.items.length, 1));
});

/* ══════════════════════════════════════════════════════════════ */
group("4. 依頼文");

test("配った内訳が、そのまま依頼文に出る", () => {
  const r = QPL.take(plan20, 5);
  const text = QPL.promptFor(r.plan, { sourceOnly: true });
  r.plan.items.forEach((i) => {
    assert(text.indexOf(i.type) >= 0, i.type + " が依頼文に出ていません");
  });
});

test("形式が 1 つだけの回では、1 問ずつの割り当てを書かない", () => {
  /* 同じ行が並ぶだけで、長くなるほど守られにくくなる
     （実測: 正誤だけ 8 問の指定が、並べたとたんに 4 択へ化けた）。 */
  const one = QPL.planMix({ count: 8, style: "manual", types: ["true_false"] });
  const text = QPL.promptFor(one, {});
  assertEq(text.indexOf("【1 問ずつの割り当て】"), -1, "単一形式なのに並べています");
});

test("落としやすい欄は名指しで言う", () => {
  /* 実測で「並べ替えの items が空」「カードの back が無い」が続いたので、
     その形式を頼む回だけ、名指しで書くようにした。 */
  const re = QPL.planMix({ count: 4, style: "manual", types: ["ordering"] });
  const t1 = QPL.promptFor(re, {});
  assert(t1.indexOf("items に") >= 0, "並べ替えの注意が出ていません");

  const fc = QPL.planMix({ count: 4, style: "manual", types: ["flashcard"] });
  const t2 = QPL.promptFor(fc, {});
  assert(t2.indexOf("back") >= 0, "カードの注意が出ていません");
});

test("関係ない形式のときは、その注意を出さない", () => {
  /* 全部に注意書きを付けると効きが薄まる。 */
  const tf = QPL.planMix({ count: 4, style: "manual", types: ["true_false"] });
  const t = QPL.promptFor(tf, {});
  assertEq(t.indexOf("並べ替えは items"), -1, "関係ない注意が出ています");
  assertEq(t.indexOf("カードは front"), -1, "関係ない注意が出ています");
});

process.exit(report("出題形式を回ごとに配る") ? 1 : 0);
