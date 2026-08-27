/* ══════════════════════════════════════════════════════════════════════════
   vqspare.cjs — 「多めに頼む数」（aigenSpare）の検査（2026-08-13）

   なぜ足したか:
     点検（review）は **数が揃ってから**走る。そこで問題が外れると足りなくなり、
     もう 1 往復まるごとかかっていた。上乗せが 1 問しか無かったのが原因。
     実測 2026-08-13: 10 問の依頼が毎回 2 回になっていた（gpt-oss-20b・2 題材とも）。

   ここで守りたいこと:
     ① 10 問なら **1 巡目で 3 問以上**多めに頼む（外れても 1 回で足りる）
     ② 多めに頼んでも **返る数は変わらない**（absorb で切っている）
     ③ 1 回の依頼が maxBatch と出力の上限を超えない（超えると JSON が切れて全損）
     ④ 外れ率が分かったら **その形式の実績**に合わせる
     ⑤ 少数（3 問以下）のときの振る舞いを変えていない
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = path.join(__dirname, "server", "src", "worker.js");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = fs.readFileSync(SRC, "utf8");

function load() {
  const grab = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(what + " が見つかりません");
    return m[0];
  };
  const code = grab(/const AIGEN_OUT_BUDGET\s*=.*?;/, "AIGEN_OUT_BUDGET")
    + "\n" + grab(/function aigenFitCount\([\s\S]*?\n\}/, "aigenFitCount")
    + "\n" + grab(/function aigenBigrams\([\s\S]*?\n\}/, "aigenBigrams")
    + "\n" + grab(/function aigenSpare\([\s\S]*?\n\}/, "aigenSpare")
    + "\nmodule.exports = { aigenSpare, aigenFitCount, aigenBigrams, AIGEN_OUT_BUDGET };";
  const sb = { module: { exports: {} }, Math, Number, String, Set };
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return sb.module.exports;
}

const { aigenSpare, aigenFitCount, aigenBigrams } = load();

/* worker.js の重複判定と同じ手順を組み立てる（norm も同じもの）。 */
const norm = (s) => String(s || "").replace(/\s+/g, "").slice(0, 60);
function looksSame(a, b) {
  const cur = aigenBigrams(norm(a));
  if (cur.size < 6) return false;
  const old = aigenBigrams(norm(b));
  let hit = 0;
  for (const g of cur) if (old.has(g)) hit++;
  return hit / Math.max(cur.size, old.size) >= 0.9;
}

console.log("\n① 1 巡目で、1 回で足りるだけ多めに頼む");
{
  /* 実測で外れていたのは 10 問中 2 問ほど。3 問以上の余裕が要る。 */
  const s10 = aigenSpare(10, undefined);
  ok("10 問 → 3 問以上多めに頼む（実測は 1 問だけで足りず 2 往復だった）",
    s10 >= 3, "spare=" + s10);
  ok("10 問 → 頼むのは 13〜16 問（増やしすぎない）",
    10 + s10 >= 13 && 10 + s10 <= 16, "ask=" + (10 + s10));

  const s20 = aigenSpare(20, undefined);
  ok("20 問 → 5 問以上多めに頼む", s20 >= 5, "spare=" + s20);

  const s30 = aigenSpare(30, undefined);
  ok("30 問 → 7 問以上多めに頼む（実測で 4 往復かかっていた）",
    s30 >= 7, "spare=" + s30);

  /* 前の作り（missing + 1）より必ず多い。ここが戻ると 2 往復に逆戻りする。 */
  for (const n of [4, 10, 20, 30, 50]) {
    ok("旧実装（+1）より多い: " + n + " 問", aigenSpare(n, undefined) > 1,
      "spare=" + aigenSpare(n, undefined));
  }
}

console.log("\n② 少数のときの振る舞いを変えていない");
{
  ok("1 問 → 3（従来どおり）", aigenSpare(1, undefined) === 3);
  ok("3 問 → 3（従来どおり）", aigenSpare(3, undefined) === 3);
  ok("境目の 4 問 → 2 以上", aigenSpare(4, undefined) >= 2, "spare=" + aigenSpare(4, undefined));
}

console.log("\n③ 出力の上限を超えない（超えると JSON が切れて 1 問も取れない）");
{
  /* 実際の形式の重さで確かめる。perQ は worker.js の値。 */
  const ENGINES = [
    ["4択", 170, 90], ["穴埋め", 130, 100], ["グラフの読み取り", 260, 40],
    ["複合問題", 260, 24], ["自由記述", 240, 50], ["表のうめ", 210, 50]
  ];
  for (const [label, perQ, maxBatch] of ENGINES) {
    let worst = 0, worstN = 0;
    for (let n = 1; n <= maxBatch; n++) {
      const ask = Math.min(maxBatch, aigenFitCount(perQ, 900), n + aigenSpare(n, undefined));
      if (ask > worst) { worst = ask; worstN = n; }
      if (ask > maxBatch) { worst = ask; worstN = n; break; }
    }
    ok(label + ": どの依頼数でも maxBatch(" + maxBatch + ") を超えない",
      worst <= maxBatch, "最大 " + worst + " 問（依頼 " + worstN + " 問のとき）");
    ok(label + ": どの依頼数でも出力の上限に収まる",
      worst <= aigenFitCount(perQ, 900), "上限 " + aigenFitCount(perQ, 900) + " / 最大 " + worst);
  }
}

console.log("\n④ 外れ率が分かったら、その形式の実績に合わせる");
{
  /* よく外れる形式は、もっと多めに頼む。 */
  const 荒い = { ok: 5, ng: 5 };   /* 半分外れる */
  const 良い = { ok: 19, ng: 1 };  /* ほとんど通る */
  ok("よく外れる形式のほうが多めに頼む",
    aigenSpare(10, 荒い) > aigenSpare(10, 良い),
    "荒い=" + aigenSpare(10, 荒い) + " / 良い=" + aigenSpare(10, 良い));
  ok("よく通る形式でも、最低 2 問は多めに頼む",
    aigenSpare(10, 良い) >= 2, "spare=" + aigenSpare(10, 良い));
  ok("外れ率 100% でも 60% 増しで止める（増やしすぎない）",
    aigenSpare(10, { ok: 0, ng: 10 }) <= 6, "spare=" + aigenSpare(10, { ok: 0, ng: 10 }));

  /* 実績が少ないうちは信用しない（1 件だけ外れても跳ね上がらせない）。 */
  ok("実績 3 件以下は使わない（1 件の外れで跳ね上がらせない）",
    aigenSpare(10, { ok: 0, ng: 1 }) === aigenSpare(10, undefined),
    "少数=" + aigenSpare(10, { ok: 0, ng: 1 }) + " / 既定=" + aigenSpare(10, undefined));
}

console.log("\n④-2 重複は上乗せの計算に混ぜない（堂々めぐりを止める）");
{
  /* 実測 2026-08-13: 数学 15 問で 100 問受け取り 69 問が重複、採用 9 問。
     重複を外れ率に混ぜると「多く頼む → もっと重複」で発散する。 */
  const 重複だらけ = { ok: 9, ng: 69, dup: 69 };
  const 本当に外れ = { ok: 9, ng: 69, dup: 0 };
  ok("重複だらけのときは上乗せを増やさない",
    aigenSpare(15, 重複だらけ) < aigenSpare(15, 本当に外れ),
    "重複=" + aigenSpare(15, 重複だらけ) + " / 外れ=" + aigenSpare(15, 本当に外れ));
  ok("重複だらけなら 20% 以下に抑える（題材が尽きている合図）",
    aigenSpare(15, 重複だらけ) <= Math.ceil(15 * 0.2),
    "spare=" + aigenSpare(15, 重複だらけ));
  ok("重複ゼロで外れが多い形式は、これまでどおり多めに頼む",
    aigenSpare(15, 本当に外れ) >= Math.ceil(15 * 0.5),
    "spare=" + aigenSpare(15, 本当に外れ));
  ok("dup が無い記録でも壊れない（古い形の metrics）",
    typeof aigenSpare(10, { ok: 8, ng: 2 }) === "number");
}

console.log("\n⑤ 呼び出し側がちゃんと使っている");
{
  ok("1 形式の依頼で aigenSpare を使っている",
    /const spare = aigenSpare\(missing, prev\);/.test(src));
  ok("複数形式の依頼でも aigenSpare を使っている",
    /missing \+ aigenSpare\(missing, metrics\.perEngine\[id\]\)/.test(src));
  ok("旧実装（missing <= 3 \\? 3 : \\(ng \\? 2 : 1\\)）が残っていない",
    !/missing <= 3 \? 3 : \(ng \? 2 : 1\)/.test(src));
  ok("旧実装（missing <= 3 \\? 2 : 1）が残っていない",
    !/missing \+ \(missing <= 3 \? 2 : 1\)/.test(src));
  /* 多めに頼んでも返る数が変わらない仕掛けが残っていること。
     ここが消えると、10 問頼んで 15 問返る事故になる。 */
  ok("頼んだ数を超えたぶんを捨てる行が残っている",
    /accepted\.filter\(\(x\) => x\.type === id\)\.length >= \(contract\.plan\[id\] \|\| 0\)\) continue;/.test(src));
  ok("重複を dup として別に数えている",
    /pe\.dup = \(pe\.dup \|\| 0\) \+ 1;/.test(src));
}

console.log("\n⑥ 頼んでいない解説で問題を捨てない");
{
  /* 実測 2026-08-13: 捨てた 175 件のうち 46 件（26%）が
     「解説が短すぎる」。しかも解説は依頼していなかった。 */
  ok("解説が必須でないときだけ、解説を外して問題は活かす",
    /if \(!contract\.explanationRequired && String\(q\.explanation \|\| ""\)\.trim\(\)\)/.test(src));
  ok("外した理由が解説のときだけ外す（他の不良は従来どおり捨てる）",
    /exWhy\.indexOf\("解説"\) === 0/.test(src));
  ok("解説が必須のときは、これまでどおり空を捨てる（質を下げない）",
    /contract\.explanationRequired && !String\(q\.explanation \|\| ""\)\.trim\(\)/.test(src));
  ok("外した数を記録している（効果を後から確かめられる）",
    /metrics\.exDropped = \(metrics\.exDropped \|\| 0\) \+ 1;/.test(src));
}

console.log("\n⑦ 作り済みを多めに見せる（重複を防ぐ）");
{
  ok("渡す数を依頼数に合わせている（上限 30）",
    /const madeCap = Math\.min\(30, Math\.max\(12, batch\)\);/.test(src));
  ok("直近 12 問固定に戻っていない",
    !/\.filter\(Boolean\)\.slice\(-12\);/.test(src));
}

console.log("\n⑧ 別の問題を「同じ」と捨てない（重複判定）");
{
  /* 実測 2026-08-13: 1 文字ずつの重なりで見ていたため、数字や語だけが
     違う別問題まで捨てていた。数学 15 問で 63 問つくって 15 問しか
     残らなかった原因。ここは **誤って捨てないこと**が最優先。 */
  const 別物 = [
    ["x+y=7、x-y=3 を解いたときの x はどれか。", "x+y=9、x-y=1 を解いたときの x はどれか。", "連立方程式の数字ちがい"],
    ["次のうち「increase」の意味はどれか。", "次のうち「decrease」の意味はどれか。", "increase と decrease"],
    ["2x+3y=12、x-y=1 のとき x の値はどれか。", "5x+2y=16、x+y=5 のとき y の値はどれか。", "係数も問う文字も違う"],
    ["次のうち「dog」の意味として正しいものはどれか。", "次のうち「cat」の意味として正しいものはどれか。", "dog と cat"],
    ["江戸幕府を開いたのは誰か。", "江戸幕府を倒したのは誰か。", "開いた と 倒した"]
  ];
  for (const [a, b, name] of 別物) {
    ok("別の問題として残る: " + name, !looksSame(a, b));
  }

  /* 本物の重複は、これまでどおり捨てられること（緩めすぎていない）。 */
  ok("言い回しだけ変えた同じ問題は捨てる",
    looksSame("次のうち「dog」の意味として正しいものはどれか。",
              "次のうち「dog」の意味として正しいのはどれか。"));
  ok("まったく同じ問題文は捨てる",
    looksSame("江戸幕府を開いた人物は誰か。", "江戸幕府を開いた人物は誰か。"));

  ok("短すぎる文は判定しない（誤爆を避ける）", !looksSame("x=1", "y=2"));

  ok("2 文字のつながりで見ている（1 文字ずつに戻っていない）",
    /const cur = aigenBigrams\(norm\(disc\)\);/.test(src)
    && !/const cur = new Set\(norm\(disc\)\.split\(""\)\);/.test(src));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
