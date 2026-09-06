/* ══════════════════════════════════════════════════════════════════════
   解答欄の 数式パレット（2026-09-06・訴え）

   訴え「解答欄に ユーザーが 数学記号、数式を 入れられる ように して、
         数学にも しっかり 対応できる ように して」

   ★ ここは **利用者が 打った 答えを 書き換える** ところ。
     間違えると 答えが 壊れる（消える・別の ところへ 入る）。
   ★ 見るのは 2 つ:
       ① 数学の 問題の ときだけ 出す（国語の 記述欄に √ を 並べない）
       ② カーソルの ところへ 入る／選んだ 文字を 囲む
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/js-src/vq2-app.b85018b5b8.js", "utf8");

function 抜く(頭文字) {
  const 頭 = src.indexOf(頭文字);
  if (頭 < 0) throw new Error("見つかりません: " + 頭文字);
  let 深 = 0, 尾 = -1;
  for (let i = src.indexOf("{", 頭); i < src.length; i++) {
    if (src[i] === "{") 深++;
    else if (src[i] === "}") { 深--; if (深 === 0) { 尾 = i + 1; break; } }
  }
  return src.slice(頭, 尾);
}
function 定数(名) {
  const m = new RegExp("^    var " + 名 + " = [\\s\\S]*?;$", "m").exec(src);
  if (!m) throw new Error("見つかりません: " + 名);
  return m[0];
}

/* ── ① 数学の 問題か ────────────────────────────────────────── */
const 判 = new Function("VQ2", [
  定数("数学の語"), 抜く("function 数学の問題か(q) {"), "return 数学の問題か;"
].join("\n"))({ qrender: { hasMath: (s) => /\$[^$]+\$/.test(String(s || "")) } });

/* ── ② 差し込み ────────────────────────────────────────────── */
const 差 = new Function([抜く("function 差し込む(el, ins) {"), "return 差し込む;"].join("\n"))();
function 欄(v, a, b) {
  return { value: v, selectionStart: a, selectionEnd: b === undefined ? a : b,
    setSelectionRange(x) { this.selectionStart = this.selectionEnd = x; },
    focus() {}, dispatchEvent() { return true; } };
}

let 合 = 0, 否 = 0;
function 見る(名, 実, 期) {
  const a = JSON.stringify(実), b = JSON.stringify(期);
  if (a === b) { console.log("  ✓ " + 名); 合++; }
  else { console.log("  ✗ " + 名 + "\n      出た: " + a + "\n      ほしい: " + b); 否++; }
}

console.log("\n══ ① 数学の 問題の ときだけ 出す ══\n");
見る("問題文に 数式が ある", 判({ question: "二次関数 $y=x^2$ の 頂点は？" }), true);
見る("数式は 無いが 数学の 語が ある", 判({ question: "この 方程式の 解を 求めよ。" }), true);
見る("数式の 形式は それだけで 数学", 判({ question: "答えよ。", type: "formula" }), true);
見る("数値入力も 数学", 判({ question: "答えよ。", type: "numeric" }), true);
見る("★ 国語の 記述には 出さない",
     判({ question: "筆者の 主張を 160 字 以内で 説明せよ。", type: "free_text" }), false);
見る("★ 英作文にも 出さない",
     判({ question: "次の 日本語を 英語に 直しなさい。", type: "english_writing" }), false);
見る("★ 歴史にも 出さない",
     判({ question: "この 政策が 行われた 理由を 説明せよ。", type: "free_text" }), false);
見る("問題が 無くても 落ちない", 判(null), false);

console.log("\n══ ② カーソルの ところへ 入る ══\n");
{
  const e = 欄("1+", 2); 差(e, "^2");
  見る("うしろに 入る", [e.value, e.selectionStart], ["1+^2", 4]);
}
{
  const e = 欄("ab", 1); 差(e, "^2");
  見る("★ まん中に 入る（末尾に 足さない）", [e.value, e.selectionStart], ["a^2b", 3]);
}
{
  const e = 欄("", 0); 差(e, "\\sqrt{}");
  見る("囲む ものは **中へ** カーソルが 行く",
       [e.value, e.selectionStart], ["\\sqrt{}", 6]);
}
{
  const e = 欄("x", 0, 1); 差(e, "\\sqrt{}");
  見る("★ 選んだ 文字を 囲む（x → \\sqrt{x}）",
       [e.value, e.selectionStart], ["\\sqrt{x}", 8]);
}
{
  const e = 欄("2x+1", 0, 4); 差(e, "$$");
  見る("★ 選んだ 式を $…$ で 囲む", [e.value, e.selectionStart], ["$2x+1$", 6]);
}
{
  const e = 欄("a", 0, 1); 差(e, "||");
  見る("★ 絶対値で 囲む", [e.value, e.selectionStart], ["|a|", 3]);
}
{
  const e = 欄("", 0); 差(e, "$$");
  見る("何も 選んで いなければ $$ の 中へ", [e.value, e.selectionStart], ["$$", 1]);
}
{
  const e = 欄("", 0); 差(e, "\\frac{}{}");
  見る("分数は **最初の** {} の 中へ", [e.value, e.selectionStart], ["\\frac{}{}", 6]);
}
{
  const e = 欄("abc", 1, 2); 差(e, "\\pi ");
  見る("選んだ 文字を 置きかえる（囲まない 記号）",
       [e.value, e.selectionStart], ["a\\pi c", 5]);
}
{
  let 伝わった = false;
  const e = 欄("", 0); e.dispatchEvent = () => { 伝わった = true; return true; };
  差(e, "^2");
  見る("★ 本体へ 伝える（伝えないと 打ったのに 保存されない）", 伝わった, true);
}
見る("欄が 無くても 落ちない", (function () { 差(null, "^2"); return "ok"; })(), "ok");

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "\n");
process.exit(否 ? 1 : 0);
