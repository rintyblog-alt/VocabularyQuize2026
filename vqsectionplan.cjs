/* sectionPlan() の問題数の割り振りを確かめる。

   AI もブラウザも使わない。quick-mock.js の純関数だけを取り出して回す。

   確かめること:
     ・合計が必ず指定した総問題数と一致する
     ・余りは先頭の大問から 1 問ずつ
     ・1 大問が MAX_PER_CALL を超えたら BATCH_REQUIRED として拾える

   実行: node vqsectionplan.cjs
*/
const fs = require("fs");
const path = require("path");

/* quick-mock.js は VQ2.ui などに依存する IIFE なので、まるごとは読めない。
   割り振りの部分だけを取り出して評価する（実装と同じ文字列を使う）。 */
const SRC = fs.readFileSync(path.join(__dirname, "client", "v2", "ui", "quick-mock.js"), "utf8");

function extract(name) {
  const i = SRC.indexOf("function " + name + "(");
  if (i < 0) { console.error(`× ${name}() が quick-mock.js に見つかりません`); process.exit(1); }
  /* 波括弧の対応で関数末尾を探す */
  let depth = 0, j = SRC.indexOf("{", i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === "{") depth++;
    else if (SRC[k] === "}") { depth--; if (!depth) return SRC.slice(i, k + 1); }
  }
  console.error(`× ${name}() の末尾を特定できません`);
  process.exit(1);
}

const MAX_PER_CALL = Number((SRC.match(/var MAX_PER_CALL = (\d+)/) || [])[1] || 0);
const spreadCounts = eval("(" + extract("spreadCounts") + ")");
const batchRequired = eval("(" + extract("batchRequired") + ")");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

section("指示にある例");
{
  ok("9 問 / 3 大問 → [3,3,3]", JSON.stringify(spreadCounts(9, 3)) === "[3,3,3]", JSON.stringify(spreadCounts(9, 3)));
  ok("10 問 / 3 大問 → [4,3,3]", JSON.stringify(spreadCounts(10, 3)) === "[4,3,3]", JSON.stringify(spreadCounts(10, 3)));
  ok("11 問 / 4 大問 → [3,3,3,2]", JSON.stringify(spreadCounts(11, 4)) === "[3,3,3,2]", JSON.stringify(spreadCounts(11, 4)));
}

section("合計は必ず指定と一致する");
{
  const bad = [];
  for (let total = 1; total <= 200; total++) {
    for (let n = 1; n <= 20; n++) {
      if (n > total) continue;
      const a = spreadCounts(total, n);
      if (a.length !== n) bad.push(`${total}/${n} 長さ ${a.length}`);
      const sum = a.reduce((x, y) => x + y, 0);
      if (sum !== total) bad.push(`${total}/${n} 合計 ${sum}`);
    }
  }
  ok("総当たり（総問題数 1〜200 × 大問 1〜20）で合計が一致", bad.length === 0, bad.slice(0, 3).join(" / "));
}

section("余りは先頭から 1 問ずつ");
{
  const bad = [];
  for (let total = 1; total <= 100; total++) {
    for (let n = 1; n <= 12; n++) {
      if (n > total) continue;
      const a = spreadCounts(total, n);
      const base = Math.floor(total / n), rem = total % n;
      for (let i = 0; i < n; i++) {
        const want = base + (i < rem ? 1 : 0);
        if (a[i] !== want) bad.push(`${total}/${n}[${i}] ${a[i]}≠${want}`);
      }
      /* 降順であること（先頭が一番多い） */
      for (let i = 1; i < n; i++) if (a[i] > a[i - 1]) bad.push(`${total}/${n} 順序`);
    }
  }
  ok("余りが先頭へ寄り、常に降順", bad.length === 0, bad.slice(0, 3).join(" / "));
}

section("BATCH_REQUIRED の検出");
{
  ok(`MAX_PER_CALL を読めている（${MAX_PER_CALL}）`, MAX_PER_CALL > 0, String(MAX_PER_CALL));
  const okPlan = spreadCounts(9, 3).map((c, i) => ({ number: i + 1, count: c }));
  ok("9 問 / 3 大問 は上限内", batchRequired(okPlan).length === 0, JSON.stringify(okPlan.map((p) => p.count)));

  const bigPlan = spreadCounts(30, 4).map((c, i) => ({ number: i + 1, count: c }));
  const over = batchRequired(bigPlan);
  ok("30 問 / 4 大問 は上限超えとして検出（黙って切り捨てない）",
     over.length > 0, JSON.stringify(bigPlan.map((p) => p.count)));
  ok("30 問 / 4 大問 の合計は 30 のまま（切り捨てていない）",
     bigPlan.reduce((a, p) => a + p.count, 0) === 30, String(bigPlan.reduce((a, p) => a + p.count, 0)));

  const edge = spreadCounts(MAX_PER_CALL * 3, 3).map((c, i) => ({ number: i + 1, count: c }));
  ok(`ちょうど ${MAX_PER_CALL} 問ずつは上限内`, batchRequired(edge).length === 0, JSON.stringify(edge.map((p) => p.count)));
}

section("quick-mock.js が実際にこの関数を使っているか");
{
  ok("sectionPlan() が spreadCounts を呼んでいる", /spreadCounts\(total, n\)/.test(SRC));
  ok("sectionPlan() が構成案の count を使っていない", !/x\.count \|\|/.test(SRC), "blueprint の count 参照が残っています");
  ok("sectionPlan() が構成案の points を使っていない", !/x\.points \|\|/.test(SRC), "blueprint の points 参照が残っています");
  ok("runGenerate() が BATCH_REQUIRED で止める", /BATCH_REQUIRED/.test(SRC));
  ok("Math.min(MAX_PER_CALL, ...) の切り捨てが無い", !/Math\.min\(MAX_PER_CALL/.test(SRC));
}

console.log(`\n══ まとめ ══`);
console.log(`  合格 ${pass} / 不合格 ${fail}`);
failures.forEach((f) => console.log(`    - ${f}`));
process.exit(fail ? 1 : 0);
