#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqkokugo.cjs — 国語の 試験の 型（2026-08-31・訴え）。

   訴え:「国語の 試験の 場合は、本文を 入れよう。難易度に よって 長さや
         その 内容も 変わって くる。第一問に 標準では 5 問、本文の 傍線部から
         同じ 漢字の 読みを 選ぶ 問題。本文を AI が 生成して、執筆して ほしい。
         そこに 傍線部を 入れたり して、その 本文を 問う 問題を 中心に。
         選択肢は すごい 紛らわしく したり、言い過ぎや 絶対 ないだろ って
         ものも 混ぜて いい。あと 途中に 生徒同士の 会話とか
         （A〜F くらいまで 入れて 交互に、先生とかも）」

   ★ 直す前の 作り:
     ・本文の 長さの 決まりが **150〜400 字**だった。国語は 一桁 足りない。
     ・傍線部は 書けたが「傍線部を 中心に 問う」とは 言って いなかった。
     ・漢字の 問題（第1問 問1）の 形が どこにも 無かった。
     ・選択肢は「言い過ぎを 使うな」と **禁じて** いた。
       国語では 言い過ぎ こそ 正統な 誤答の 型なので、ここだけ 外す 必要が あった。

   ここで 見るもの（AI を 使わない・文字を 数える だけ）:
     ① 難しさで 本文の 長さが 変わる
     ② 国語の ときだけ 出る（数学の ときは 出ない）
     ③ 漢字・傍線部・紛らわしい 選択肢・話し合い が 書いて ある
     ④ 話し合いを 切れる
     ⑤ 2 つの 頼み文（まとめ／形式ごと）の 両方に 入って いる

   使い方: node vqkokugo.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
function 塊(名前) {
  const 頭 = SRC.indexOf("function " + 名前 + "(");
  if (頭 < 0) throw new Error(名前 + " が ありません");
  let i = SRC.indexOf("{", 頭), d = 0, end = -1;
  for (; i < SRC.length; i++) { const c = SRC[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { end = i + 1; break; } } }
  return SRC.slice(頭, end);
}
const 前 = SRC.slice(SRC.indexOf("const AIGEN_KOKUGO_RE ="), SRC.indexOf("function aigenKokugoNote(")) + "\n";
// eslint-disable-next-line no-new-func
const aigenKokugoNote = new Function(前 + 塊("aigenKokugoNote") + "\nreturn aigenKokugoNote;")();
// eslint-disable-next-line no-new-func
const aigenKokugoLen = new Function(塊("aigenKokugoLen") + "\nreturn aigenKokugoLen;")();

節("① 難しさで 本文の 長さが 変わる");
{
  const y = aigenKokugoLen("やさしい"), h = aigenKokugoLen("標準"), m = aigenKokugoLen("難しい");
  見(y.min === 1200 && y.max === 1800, "やさしい 1200〜1800 字", y);
  見(h.min === 1800 && h.max === 2600, "標準 1800〜2600 字", h);
  見(m.min === 2600 && m.max === 3600, "難しい 2600〜3600 字", m);
  見(y.max < h.max && h.max < m.max, "★ 難しいほど 長い", [y.max, h.max, m.max]);
  見(h.min >= 1800, "★ **標準でも 1800 字 以上**（直す前の 決まりは 150〜400 字だった）", h.min);
  見(aigenKokugoLen("").min === 1800, "書いて なければ 標準");
  見(aigenKokugoLen("かんたん").min === 1200, "ひらがなの 言い方も 読む");
  見(aigenKokugoLen("むずい").min === 2600, "くだけた 言い方も 読む");
  見(y.漢字 === 4 && h.漢字 === 5, "★ 漢字の 問題は 標準 5 問（やさしいは 4 問）", [y.漢字, h.漢字]);
}

節("② 国語の ときだけ 出る");
{
  const 出 = (o) => aigenKokugoNote(o).length;
  見(出({ exam: true, subject: "国語" }) > 500, "教科が 国語 → 出る");
  見(出({ exam: true, subject: "現代文" }) > 500, "現代文 → 出る");
  見(出({ exam: true, subject: "", topic: "評論文の 読解問題を 作って" }) > 500,
    "★ 教科が 空でも **頼み文で 分かれば** 出る");
  見(出({ exam: true, subject: "数学" }) === 0, "★ 数学 → 出ない");
  見(出({ exam: true, subject: "英語" }) === 0, "英語 → 出ない");
  見(出({ exam: false, subject: "国語" }) === 0, "★ 試験モードで ない ときは 出ない（プリセットは 1 問ずつ）");
  見(出({}) === 0, "何も 無ければ 出ない");
}

節("③ 中身");
{
  const t = aigenKokugoNote({ exam: true, subject: "国語", level: "標準" });
  見(/本文を あなたが 書きます/.test(t), "★ **本文を AI が 書く**と 言えて いる");
  見(/1800〜2600 字/.test(t), "★ 標準の 長さが 数で 入る", (t.match(/\d+〜\d+ 字/) || [])[0]);
  見(/materials に \{"type":"passage"\}/.test(t), "本文の 置き場所を 指定");
  見(/question の 中に 書かない/.test(t), "問題文の 中に 書かせない");
  見(/傍線部を \*\*5〜8 か所\*\*/.test(t), "★ 傍線部を 5〜8 か所");
  見(/傍線部を 問う ものを 中心/.test(t), "★ **傍線部を 問う 問題が 中心**");
  見(/本文へ 戻らせる/.test(t), "本文を 読まないと 解けない ように する");
  見(/第1問は 漢字/.test(t) && /5 問/.test(t), "★ **第1問は 漢字 5 問**");
  見(/カタカナに 相当する 漢字を 含む もの/.test(t), "★ 共通テストと 同じ 聞きかた");
  見(/別の 漢字/.test(t), "5 問とも 別の 漢字");
  見(/言い過ぎ/.test(t) && /すり替え/.test(t) && /因果の 逆/.test(t) && /一部だけ 正しい/.test(t),
    "★ 誤答の 型が 4 つ 以上 並ぶ");
  見(/言い過ぎ・絶対に ない もの を 混ぜて よい/.test(t),
    "★★ **言い過ぎ・絶対 ない ものを 混ぜて よい**（訴えの とおり）");
  見(/国語では ここが 正統な 誤答の 型/.test(t),
    "★ ほかの 教科の 「言い過ぎ 禁止」を **国語では 外す**と 書いてある");
  見(/本文の 言葉を 使って/.test(t), "選択肢は 本文の 言葉で 書かせる");
  見(/10 の 倍数/.test(t), "記述の 字数は 10 の 倍数");
}

節("④ 生徒の 話し合い");
{
  const 入 = aigenKokugoNote({ exam: true, subject: "国語" });
  見(/生徒A〜生徒F/.test(入), "★ **生徒A〜F**", (入.match(/生徒A[^\n]*/) || [])[0]);
  見(/先生/.test(入), "先生も 入る");
  見(/同じ 人ばかり 続けない/.test(入), "★ 交互に 話す");
  見(/10〜16 発言/.test(入), "長さの 決まりが ある");
  見(/読み違い/.test(入), "★ 生徒が 読み違えて 先生が 直す 流れ");
  const 切 = aigenKokugoNote({ exam: true, subject: "国語", dialogue: false });
  見(!/生徒A〜生徒F/.test(切), "★ **切れる**（試験に よって 入れたり 入れなかったり）");
  見(/話し合いの 場面は 入れません/.test(切), "切った ことが 文に 出る");
}

節("⑤ 本物の 共通テスト国語の 組み立て");
{
  const t = aigenKokugoNote({ exam: true, subject: "国語" });
  見(/第1問 近代以降の 文章/.test(t), "★ 第1問 評論");
  見(/傍線部\(ア\)〜\(オ\)/.test(t) && /\*\*5 問\*\*/.test(t), "★ 漢字は ア〜オ の 5 問");
  見(/第2問 小説/.test(t) && /語句の 意味/.test(t), "★ 第2問 小説（語句の 意味 3 問）");
  見(/構成・展開/.test(t), "★ 構成・展開を 問う 問題");
  見(/表現/.test(t), "表現を 問う 問題");
  見(/文章を 読んだ 生徒/.test(t), "★ 「文章を 読んだ 生徒」の 場面");
  const 前2 = SRC.slice(SRC.indexOf("function aigenKokugoParts("));
  // eslint-disable-next-line no-new-func
  const P = new Function("function qreditSafeInt(v,d){const n=Math.trunc(Number(v));return Number.isFinite(n)?n:d;}\n"
    + 塊("aigenKokugoParts") + "\nreturn aigenKokugoParts;")();
  const p20 = P(20);
  見(p20.length === 4, "★ 既定の 大問は 4 つ（評論・小説・古文・漢文）", p20.map((x) => x.field));
  見(p20.reduce((a, x) => a + x.count, 0) === 20, "★ 合計が 頼んだ 数と 合う", p20.map((x) => x.count));
  見(p20.every((x) => x.count >= 1), "どの 大問も 1 問 以上", p20.map((x) => x.count));
  見(P(8).reduce((a, x) => a + x.count, 0) === 8, "8 問でも 合う", P(8).map((x) => x.count));
  見(P(40).reduce((a, x) => a + x.count, 0) === 40, "40 問でも 合う", P(40).map((x) => x.count));
  見(p20[0].topics.length >= 4 && p20[1].topics.length >= 5, "★ 大問ごとに 小問の 型が 並ぶ",
    { 第1問: p20[0].topics.length, 第2問: p20[1].topics.length });
  見(/aigenKokugoParts\(総\)/.test(SRC), "★ 国語の 試験で **既定として 使われる**");
  見(/const 国語か = !!o\.exam/.test(SRC) && /if \(!o\.parts && 国語か\)/.test(SRC),
    "★ 人が 大問を 決めて いれば そちらが 勝つ（!o.parts の ときだけ 既定を 使う）");
}

節("⑥ 頼み文へ 入って いる");
{
  /* 呼んで いる ところだけ 数える（定義の 行を 入れない）。 */
  const 呼び = (SRC.match(/^\s+aigenKokugoNote\(o\),$/gm) || []).length;
  見(呼び === 2, "★ **2 か所とも**（まとめ頼み／形式ごと頼み）", 呼び);
  見(/level: toSafeString\(body\?\.level \|\| body\?\.difficulty/.test(SRC),
    "★ 難しさを 受け取る 口が ある");
  見(/dialogue: body\?\.dialogue === false/.test(SRC), "話し合いの 入切を 受け取る 口が ある");
  見((SRC.match(/level: o\.level, dialogue: o\.dialogue/g) || []).length === 2,
    "★ 2 つの 道 とも 下まで 渡って いる",
    (SRC.match(/level: o\.level, dialogue: o\.dialogue/g) || []).length);
}

console.log("\n────────────────────────────────");
console.log("  ok " + 済 + " / NG " + 落);
if (落) console.log("  落ちた: " + 落ち.join(" / "));
process.exit(落 ? 1 : 0);
