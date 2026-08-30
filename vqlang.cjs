/* ══════════════════════════════════════════════════════════════════════════
   vqlang.cjs — **英語の 試験でも 問題文は 日本語**か

   訴え（2026-08-31・Rinty さん）
     「英語の 問題が 必ず 問題文まで 英語に なるから、これ 修正して。
       それは なし。日本語で いい。標準は」

   直す前:
     頼みかたが「英語の 試験です。本文・会話文・選択肢は 英語で 書きます。
     **設問文と explanation は 日本語**で」だった。
     **最初に 読む 一文が 英語の 許可**なので、あとの 但し書きが 効かない。

   直したあと:
     ① 頼みかたは「question は いつも 日本語」から 始める（×と○を 並べる）
     ② 返す 直前の 確かめにも 1 行 入れる（ここに ある ものは 守られやすい）
     ③ それでも 英語で 返ってきたら、**できあがりを 見て 直す**
        （question の 1 行だけ。本文・選択肢・答え・解説は 触らない）

   ここでは ①②③ が **確かに 仕込まれているか**を 見る。
   本物の モデルで 直るかは、手元に AI の 鍵が 無いので 測れない。

   使い方: node vqlang.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
};
const W = fs.readFileSync("server/src/worker.js", "utf8");
const M = fs.readFileSync("js-src/vq-make.js", "utf8");

節("① 頼みかたは「問題文は いつも 日本語」から 始まる");
{
  const i = W.indexOf("function aigenLangNote");
  const j = W.indexOf("function aigenExamNote", i);
  const 節文 = W.slice(i, j);
  const 英 = 節文.slice(節文.indexOf("if (英語か)"), 節文.indexOf("return \"【何語で 書くか】\\n\"\n    + \"★ **すべて"));
  見(/question（問題文・問いかけ）は いつも 日本語/.test(英),
     "★ 英語の 教科でも 問題文は いつも 日本語、と 書いてある");
  const 日本語の位置 = 英.indexOf("いつも 日本語");
  const 英語の位置 = 英.indexOf("英語に するのは");
  見(日本語の位置 > 0 && 英語の位置 > 日本語の位置,
     "★ **日本語の 決まりが 先**（英語に してよい ものは あと）",
     "日本語 " + 日本語の位置 + " / 英語 " + 英語の位置);
  見(/Choose the word that best completes/.test(英) && /空所に 入れるのに 最も 適当な/.test(英),
     "★ ×と○を 並べて 見せている");
  見(/explanation（解説）も いつも 日本語/.test(英), "解説も 日本語と 書いてある");
  見(/choices の 語句/.test(英) && /passage \/ dialogue/.test(英),
     "英語に してよい ものを 数え上げている");
}

節("② 返す 直前の 確かめにも 入っている");
{
  const n = (W.match(/□ \*\*question と explanation が 日本語か\*\*/g) || []).length;
  見(n === 2, "★ 2 つの 頼みかた（まとめ／1 つずつ）どちらにも 入っている", n + " か所");
}

節("③ できあがりを 見て 直す 段が ある");
{
  見(/function 日本語が入っているか/.test(W), "日本語が 入っているかを 見る 物差しが ある");
  見(/[぀-ゟ]/.test((W.match(/function 日本語が入っているか[\s\S]{0,200}/) || [""])[0]),
     "ひらがな・カタカナ・漢字を 見ている");
  見(/async function aigenJapaneseQuestionText/.test(W), "★ 問題文だけを 直す 口が ある");
  const i = W.indexOf("async function aigenJapaneseQuestionText");
  const 体 = W.slice(i, i + 3000);
  見(/question（問いかけの 一文）だけ/.test(体), "★ 直すのは question の 1 行だけ");
  見(/選択肢・本文・答え・解説は 読むだけ/.test(体), "★ 本文・選択肢・答え・解説は 触らない");
  見(/日本語が入っているか\(q\)/.test(体), "★ 直っていない ものは 受け取らない");
  見(/metrics\.jaFixTried/.test(W) && /metrics\.jaFixOk/.test(W),
     "★ 何件 直したかを 数に 残す（黙って 直さない）");
  const k = W.indexOf("metrics.jaFixTried");
  const 段 = W.slice(k - 1400, k + 900);
  見(/英語か\s*\?/.test(段), "★ 英語の 教科の ときだけ 走らせる");
  見(/aigenLengthIssue\(contract\.lengths, 試\)/.test(段),
     "★ 字数の 決まりを 破る 直しは 入れない");
}

節("④ 画面側の 頼みかたも 同じ 順");
{
  const i = M.indexOf("英語の 試験です。**問題文");
  見(i > 0, "★ 画面側も「問題文と 解説は 日本語」から 始まる");
  const 行 = M.slice(i, i + 400);
  見(/英語に するのは 本文・会話文・例文と、選択肢の 語句だけ/.test(行),
     "英語に してよい ものを 数え上げている");
  見(/Choose the best word/.test(行) && /空所に 入れるのに 最も 適当な/.test(行),
     "×と○を 並べている");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
