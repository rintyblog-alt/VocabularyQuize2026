/* ══════════════════════════════════════════════════════════════════════════
   vqqtypepicker.cjs — 形式一覧の印を見分けられるようにした（2026-08-13）

   もとの状態:
     カードにも分類にも絵は付いていた。足りなかったのは **印の見分け**。
     AI／部分点／画像・音声 の 3 種類が、どれも同じ薄いグレーの文字だけで、
     並んでいても何が違うのか読み取れなかった。

   変えたこと（形はそのまま）:
     ・印に絵を添える（AI=sparkle / 部分点=check / 画像・音声=image）
     ・AI だけ文字色を決まったもの（--vq-ai-text）にする

   ここで守りたいこと:
     ① **存在しないトークンを使わない**（予備値に落ちてダークで浮く）
     ② 色だけで伝えない（文字は残す）
     ③ 絵は読み上げに渡さない
     ④ 3 種類ぶん、絵が実在する
     ⑤ SHELL_CSS を触っていない
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = require("./vqsrc.cjs").丸ごと();

/* ui/qtype-editor.js の範囲（形式一覧はこの中） */
const mod = (function () {
  const a = src.indexOf("/* ───────── ui/qtype-editor.js ───────── */");
  const b = src.indexOf("/* ───────── ui/preset-studio.js ───────── */");
  return a >= 0 && b > a ? src.slice(a, b) : "";
})();

/* SHELL_CSS の中身（トークンが定義されているか調べる） */
const shellCss = (function () {
  const m = src.match(/var SHELL_CSS = "((?:[^"\\]|\\.)*)"/);
  return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
})();

const ICON_NAMES = (function () {
  const m = src.match(/var ICONS\s*=\s*\{/);
  const seg = src.slice(m.index + m[0].length, m.index + m[0].length + 9000);
  return new Set([...seg.matchAll(/(?:^|\s|,)([a-zA-Z0-9_]+)\s*:\s*['"`]/g)].map((x) => x[1]));
})();

console.log("\n① 存在しないトークンを使っていない");
{
  const cm = mod.match(/var QTP_CSS = \[([\s\S]*?)\]\.join\("\\n"\);/);
  ok("QTP_CSS がある", !!cm);
  const css = cm ? cm[1] : "";
  /* 使っている --vq-* が、SHELL_CSS に定義されているか 1 つずつ確かめる。 */
  const used = [...css.matchAll(/var\((--vq-[a-z0-9-]+)/g)].map((x) => x[1]);
  const undef = used.filter((t) => shellCss.indexOf(t + ":") < 0);
  ok("使っているトークンがすべて定義済み", undef.length === 0, "未定義: " + undef.join(", "));
  ok("トークンを 1 つ以上使っている（生の色を直書きしていない）", used.length > 0, used.join(", "));
  /* 一度書いてしまった --vq-ai-subtle が戻っていないこと。
     **注意書き（コメント）での言及は数えない。** 実際に var(...) で
     使っているかだけを見る。 */
  ok("--vq-ai-subtle（存在しない）を使っていない",
    css.indexOf("var(--vq-ai-subtle") < 0);
  ok("AI の文字色は定義済みの --vq-ai-text", /color:var\(--vq-ai-text\)/.test(css));
}

console.log("\n② 色だけで伝えていない");
{
  ok("AI の印に文字が残っている", /marks\.push\(\["LUMI AI",/.test(mod));
  /* ★ 呼び名は画面ぜんぶでそろえる。ただの「AI」だと何が作るのか伝わらず、
     絞り込みだけ「AI」だと別のものに見える（実測 2026-08-13 に指摘を受けた）。 */
  ok("絞り込みの言い方も「LUMI AI」でそろっている",
    /LUMI AI で作れるものだけ/.test(mod));
  ok("ただの「AI で作れるものだけ」が残っていない",
    !/>AI で作れるものだけ</.test(mod));
  ok("部分点の印に文字が残っている", /marks\.push\(\["部分点",/.test(mod));
  ok("画像・音声の印に文字が残っている", /marks\.push\(\["画像・音声",/.test(mod));
  /* 説明（title）も残っていること。絵と文字だけでは意味が伝わらない場合の逃げ道。 */
  ok("押さなくても意味が分かる説明が付いている", /title="' \+ esc\(m\[1\]\) \+ '"/.test(mod));
}

console.log("\n③ 絵は読み上げに渡さない");
{
  ok("印の絵に aria-hidden が付く", /vq2-qt-tagi" aria-hidden="true"/.test(mod));
}

console.log("\n④ 3 種類ぶん、絵が実在する");
{
  const m = mod.match(/var marks = \[\];[\s\S]*?supportsMedia\).*?\n/);
  const icons = m ? [...m[0].matchAll(/, "([a-z]+)", "/g)].map((x) => x[1]) : [];
  ok("3 つの印すべてに絵を指定している", icons.length === 3, icons.join(", "));
  const missing = icons.filter((n) => !ICON_NAMES.has(n));
  ok("指定した絵がすべて実在する", missing.length === 0, "無い: " + missing.join(", "));
  ok("AI は sparkle（デザインシステムの決まり）", icons[0] === "sparkle", icons[0]);
}

console.log("\n⑤ CSS の作法");
{
  ok("mount へ渡している", /css: QTP_CSS,/.test(mod));
  ok("SHELL_CSS に混ぜていない", !/var SHELL_CSS = "[^"]*vq2-qt-tagi/.test(src));
  const cm = mod.match(/var QTP_CSS = \[([\s\S]*?)\]\.join\("\\n"\);/);
  ok("height:100% を使っていない", cm && cm[1].indexOf("height:100%") < 0);
  /* もとからある .vq2-qt-tag の指定を消していないこと（地の色・角丸は残す）。 */
  ok("もとの印の指定（地の色）は残っている",
    /\.vq2-qt-tag \{[^}]*background: var\(--vq-surface-sunken\)/.test(shellCss));
}

console.log("\n⑥ もとからある絵は消していない");
{
  ok("カードの絵はそのまま", /'<span class="vq2-qt-ic">' \+ icon\(d\.icon\)/.test(mod));
  ok("分類の絵はそのまま", /icon\(c\.icon\)/.test(mod));
  ok("「すべての分類」の絵はそのまま", /icon\("list"\)/.test(mod));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
