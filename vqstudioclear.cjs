/* ══════════════════════════════════════════════════════════════════════════
   vqstudioclear.cjs — 作成画面の「管理画面っぽさ」を減らす（2026-08-13）

   実物（スクリーンショット）を見て特定した 4 つ:
     ① タブが 検証 / 修復 / 差分 … **開発の言葉**。高校生に「差分」は通じない
     ② 全カードに「AI が作成」  … 10 枚すべてに付く札は何も伝えていない
     ③ 形式の札に絵が無い       … 何の形式か一目で分からない
     ④ 新規で 0 問なのに「1 件の要修正」… まだ始めていないだけなのに叱られる

   構造（3 ペイン・4 タブ）は変えていない。**言葉と印だけ**を直す。
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = require("./vqsrc.cjs").丸ごと();
const studio = (function () {
  const a = src.indexOf("/* ───────── ui/preset-studio.js ───────── */");
  const b = src.indexOf("/* ───────── ui/speak.js ───────── */");
  return a >= 0 && b > a ? src.slice(a, b) : "";
})();
const ICON_NAMES = (function () {
  const m = src.match(/var ICONS\s*=\s*\{/);
  const seg = src.slice(m.index + m[0].length, m.index + m[0].length + 9000);
  return new Set([...seg.matchAll(/(?:^|\s|,)([a-zA-Z0-9_]+)\s*:\s*['"`]/g)].map((x) => x[1]));
})();

console.log("\n① タブの名前が使う人の言葉になっている");
{
  const tabs = studio.match(/return WS\.segmentedTabs\(\[([\s\S]*?)\], st\.tab,/);
  ok("タブの定義を取り出せた", !!tabs);
  const labels = tabs ? [...tabs[1].matchAll(/label: "([^"]+)"/g)].map((x) => x[1]) : [];
  ok("4 つある", labels.length === 4, labels.join(" / "));
  ok("開発の言葉が残っていない（検証・修復・差分）",
    !labels.some((l) => ["検証", "修復", "差分"].indexOf(l) >= 0), labels.join(" / "));
  ok("「差分」→「変更点」", labels.indexOf("変更点") >= 0, labels.join(" / "));
  ok("「検証」→「チェック」", labels.indexOf("チェック") >= 0, labels.join(" / "));
  ok("「修復」→「直す」", labels.indexOf("直す") >= 0, labels.join(" / "));
  ok("「問題」はそのまま", labels[0] === "問題", labels[0]);
  /* 中身の切り替えキー（id）は変えていないこと。ここを変えると保存済みの
     状態や他所からの遷移（st.tab = "verify" など）が全部壊れる。 */
  const ids = tabs ? [...tabs[1].matchAll(/id: "([a-z]+)"/g)].map((x) => x[1]) : [];
  ok("中身のキーは変えていない（questions/verify/repair/diff）",
    ids.join(",") === "questions,verify,repair,diff", ids.join(","));
}

console.log("\n② 全部に付く札は出さない");
{
  ok("混ざっているかを見る関数がある", /function mixedOrigin\(\)/.test(studio));
  ok("混ざっているときだけ「AI が作成」を出す",
    /mixedOrigin\(\) \? U\.badge\(q\.createdBy === "ai" \? "AI が作成" : "自分で作成"/.test(studio));
  /* 1 種類しか無ければ false を返すこと（作りの確認） */
  const fn = studio.match(/function mixedOrigin\(\)[\s\S]*?\n    \}/);
  ok("2 種類そろって初めて true", fn && /if \(ai && me\) return true;/.test(fn[0]));
  ok("そうでなければ false", fn && /return false;/.test(fn[0]));
  /* 無条件で出す書き方に戻っていないこと */
  ok("無条件で出す書き方に戻っていない",
    !/\+ U\.badge\(q\.createdBy === "ai" \? "AI が作成"/.test(studio));
}

console.log("\n③ 形式の札に絵が付く");
{
  ok("形式の札を作る関数がある", /function typeBadge\(type\)/.test(studio));
  ok("絵はレジストリから取っている", /\(QT && QT\.icon\) \? QT\.icon\(type\) : ""/.test(studio));
  ok("読めないときは絵無しの札に落とす", /if \(!nm\) return U\.badge\(label\);/.test(studio));
  ok("落ちない（try で囲ってある）", /catch \(e\) \{ nm = ""; \}/.test(studio));
  ok("絵は読み上げに渡さない", /vq2-tbadge-i" aria-hidden="true"/.test(studio));
  ok("カードで使っている", /\+ typeBadge\(q\.type\)/.test(studio));
  ok("形式名をここへ書き写していない", !/single_choice|fill_blank/.test(
    studio.slice(studio.indexOf("function typeBadge"), studio.indexOf("function typeBadge") + 600)));
  /* CSS は mount で足す（SHELL_CSS を触らない） */
  ok("札の CSS を mount で足している", /\.vq2-tbadge\{gap:4px;\}/.test(studio));
  ok("SHELL_CSS に混ぜていない", !/var SHELL_CSS = "[^"]*vq2-tbadge/.test(src));
}

console.log("\n④ まだ 1 問も無いときは叱らない");
{
  ok("0 問なら要修正を数えない",
    /var errs = \(st\.preset && \(st\.preset\.questions \|\| \[\]\)\.length\)\s*\n\s*\? V\.errorsOf\(st\.issues\)\.length : 0;/.test(studio));
  /* 問題があるときは、これまでどおり数えること（見逃しを作らない） */
  ok("問題があるときは これまでどおり数える", /V\.errorsOf\(st\.issues\)\.length : 0;/.test(studio));
  /* タブ側（チェック）の数は別勘定。ここは 0 問でも本来の値を出してよい
     （タブを開けば何が起きているか分かるので、隠さない）。 */
  const tabs = studio.match(/function centerTabsHtml\(\)[\s\S]*?\n    \}/);
  ok("タブ側の数は隠していない", tabs && /var errs = V\.errorsOf\(st\.issues\)\.length;/.test(tabs[0]));
}

console.log("\n⑤ 壊していないこと");
{
  ok("3 ペインのまま（構造は変えていない）", /WS\.layout\(\{/.test(studio));
  ok("下タブ（狭い画面）も残っている", /WS\.mobileBar\(/.test(studio));
  ok("段（ステップ型）の残骸が無い", !/stepLayout|stepBar|STEP_CSS/.test(studio));
  ok("難易度の札はそのまま（状態色を流用していない）",
    /U\.badge\(DIFF_LABEL\[q\.difficulty\] \|\| "標準"\)/.test(studio));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
