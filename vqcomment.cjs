/* ══════════════════════════════════════════════════════════════════════════
   vqcomment — **注釈が 途中で 閉じて いないか**（2026-09-10）

   注釈の 中に「アスタリスク2つ ＋ スラッシュ」を 書くと
   **そこで 注釈が 閉じる**（この 説明文 自体も 一度 それで 落ちた）。
   続きが コードとして 読まれ、組み立てが 落ちる。
   2026-09-10 だけで **3 回** 踏んだ（毎回 原因の 特定に 時間が かかった）。

   この アプリは 注釈を 日本語で たくさん 書き、強調に `**...**` を 使う。
   強調の あとに 道を 続けて 書きやすい ので、機械で 止める。

   使いかた: node vqcomment.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const 根 = __dirname;
const 見る = ["js-src", "server/src"];
let 悪 = 0, 数 = 0;

function 走る(dir) {
  let 件 = [];
  try { 件 = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const f of 件) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { 走る(p); continue; }
    if (!/\.(js|cjs|mjs)$/.test(f.name)) continue;
    見張る(p);
  }
}

function 見張る(p) {
  const s = fs.readFileSync(p, "utf8");
  数++;
  /* 注釈の 始まりから 終わりまでを たどり、その 中で 終わりの 印の
     直前が アスタリスクに なって いないかを 見る。
     ここは 素朴で よい（文字列の 中まで 追わない）。
     見たいのは「書き手が 意図せず 閉じて いないか」だけ。 */
  const 行 = s.split("\n");
  let 中 = false;
  行.forEach((l, i) => {
    let j = 0;
    while (j < l.length) {
      if (!中) {
        const k = l.indexOf("/*", j);
        if (k < 0) break;
        中 = true; j = k + 2;
      } else {
        const k = l.indexOf("*/", j);
        if (k < 0) break;
        /* 直前が 「*」なら、書き手は **強調** の つもりで 書いて いる。 */
        if (k > 0 && l[k - 1] === "*" && !/^\s*\*+\/\s*$/.test(l.slice(k - 1))) {
          悪++;
          console.log("  NG  " + p.replace(根 + "/", "") + ":" + (i + 1));
          console.log("      " + l.trim().slice(0, 96));
          console.log("      → 注釈が ここで 閉じます。「**」の あとに 「/」を 続けない"
            + "（強調と 道の あいだに 空きを 入れる）。");
        }
        中 = false; j = k + 2;
      }
    }
  });
}

console.log("【注釈が 途中で 閉じて いないか】\n");
見る.forEach((d) => 走る(path.join(根, d)));
console.log("\n────────────────────────────────");
console.log("  見た " + 数 + " 本 / NG " + 悪);
process.exit(悪 ? 1 : 0);
