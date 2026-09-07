/* ══════════════════════════════════════════════════════════════════════════
   vqaigendist — 形式の 内訳を **書いたとおりに** 読む（2026-09-07・訴え）

   訴え「形式を 大体 指定したら、4択25問 記述25問に なった。こう 指示したのに」
     「…50問 作成して ほしい。形式は 説明したいから、**10問4択**で
        それ以外を 記述に して ほしい。」

   何が 起きて いたか（本番の 台帳で 実測）:
     内訳の 読み取りが **「形式 → 数」の 順しか 見て いなかった**。
       「4択10問」  … 合う
       「10問4択」  … 合わない  ← 人は こちらで 書く
     内訳が 1 つも 拾えず pinned が 立たず、50 問を 2 形式へ 均等に 割って
     **25 / 25** に して いた。頼んだのは 4択 10・記述 40。

   ★ worker.js から 関数を **そのまま 取り出して** 動かす（写さない）。
     写して 持つと、本体を 直しても 検査だけ 古い ままに なる。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};

/* ── worker.js から 取り出す ───────────────────────────────────────── */
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
/* ★ 波かっこを 数えて 切ると **正規表現の {1,3} や 注記の { で 崩れる**
   （実測で 踏んだ）。worker.js は 上の 宣言が 行頭に 並ぶ ので、
   **次の 行頭の 宣言まで**を 1 つと して 切る。 */
function 切り出す(頭文字) {
  const 頭 = SRC.indexOf(頭文字);
  if (頭 < 0) throw new Error("見つかりません: " + 頭文字);
  const re = /\n(?:async function |function |const |let |var |\/\* ══)/g;
  re.lastIndex = 頭 + 頭文字.length;
  const m = re.exec(SRC);
  return SRC.slice(頭, m ? m.index : SRC.length);
}

/* ★ こちらも 行頭で 切る。波かっこを 数えると、中に 関数を 持つ 大きな
   表（AIGEN_ENGINES は 2 万字）で 行きすぎて、次の 宣言まで 飲みこむ
   （実測: AIGEN_KANJI_NUM が 二重に なった）。 */
function 定数(名) {
  return 切り出す("const " + 名 + " =");
}

/* ★ 要る ものを **全部** 取り出す。1 つでも 抜けると
   「〜 is not defined」で 落ちる（実測で 2 回 踏んだ）。 */
const 部品 = [
  "function qreditSafeInt(v, d){ const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : d; }",
  定数("AIGEN_ENGINES"),
  定数("AIGEN_CHOICE_ENGINES"),
  定数("AIGEN_UNIT"),
  定数("AIGEN_KANJI_NUM"),
  定数("AIGEN_LEN_WHO"),
  定数("AIGEN_LEN_JI"),
  定数("AIGEN_LEN_CAP"),
  定数("AIGEN_LEN_MIN"),
  定数("AIGEN_DETAIL_RE"),
  定数("AIGEN_BRIEF_RE"),
  定数("AIGEN_ENGINE_SOFT"),
  定数("AIGEN_SCRIPT_TAGS"),
  定数("AIGEN_CHOICE_MARKS"),
  定数("AIGEN_VARIANTS"),
  定数("AIGEN_ENGINE_WORDS"),
  定数("AIGEN_FREE_ENGINES"),
  切り出す("function aigenEngineNamed("),
  切り出す("function aigenVariantInText("),
  切り出す("function aigenChoiceCountIn("),
  切り出す("function aigenChoiceSpec("),
  切り出す("function aigenChoiceShape("),
  切り出す("function aigenLengthLimits("),
  切り出す("function aigenFreeSpread("),
  切り出す("function aigenParseContract("),
  "return { aigenParseContract, AIGEN_UNIT, AIGEN_ENGINE_WORDS };"
];
/* ★ 同じ ものを 2 回 入れない。切り出しが 少し 重なる ことが ある
   （AIGEN_KANJI_NUM で 実測）。先に 出た ほうを 残す。 */
const 見た = new Set();
let 本文 = 部品.filter((b) => {
  const m = /^\s*(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/.exec(b);
  if (!m) return true;
  if (見た.has(m[1])) return false;
  見た.add(m[1]);
  return true;
}).join("\n");
let 契約, 中身;
/* 追う ための 印を 差しこむ（--追 の ときだけ）。
   ★ 不具合を さがす とき だけ 使う。ふだんは 何も しない。 */
if (process.argv.indexOf("--追") >= 0) {
  本文 = 本文
    .replace("  /* ══ 同じ数を 2 つ以上の形式が指しているなら", "  console.log('  [A] reqText =', JSON.stringify(reqText));\n  console.log('  [A] 逆順の あと:', JSON.stringify(dist), JSON.stringify(distAt));\n  /* ══ 同じ数を 2 つ以上の形式が指しているなら")
    .replace("  /* 使ってよい形式。内訳の顔ぶれ", "  console.log('  [B] 重なり判定の あと:', JSON.stringify(dist));\n  /* 使ってよい形式。内訳の顔ぶれ")
    .replace("  /* 内訳が無いときは、使ってよい形式へ均等に割る", "  console.log('  [C] plan の 直前:', JSON.stringify(dist), 'count=' + count, 'rest=' + restEngine);\n  /* 内訳が無いときは、使ってよい形式へ均等に割る");
}
try { 中身 = new Function(本文)(); 契約 = 中身.aigenParseContract; }
catch (e) { console.error("取り出せません: " + e.message); process.exit(2); }

const P = (t, o) => 契約(t, o || {});

if (process.argv.indexOf("--試") >= 0) {
  const t = process.argv[process.argv.indexOf("--試") + 1] || "";
  const U = 中身.AIGEN_UNIT, W = 中身.AIGEN_ENGINE_WORDS;
  ["single_choice", "free_text", "fill_blank"].forEach((id) => {
    (W[id] || []).forEach((a) => {
      const 語 = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const 逆 = new RegExp("(\\d{1,3})\\s*" + U + "([^\\d。、\\n]{0,4})" + 語);
      const 順 = new RegExp(語 + "([^\\d。、\\n]{0,6})(\\d{1,3})\\s*" + U);
      const a1 = t.match(逆), a2 = t.match(順);
      if (a1) console.log("逆順 当たり", id, JSON.stringify(a), "→", JSON.stringify(a1[0]), "数=" + a1[1]);
      if (a2) console.log("順   当たり", id, JSON.stringify(a), "→", JSON.stringify(a2[0]), "数=" + a2[2]);
    });
  });
  console.log("契約:", JSON.stringify(契約(t, {}).plan));
  process.exit(0);
}

if (process.argv.indexOf("--語") >= 0) {
  console.log("単位:", 中身.AIGEN_UNIT);
  Object.entries(中身.AIGEN_ENGINE_WORDS).forEach(([k, v]) => console.log(k, JSON.stringify(v)));
  process.exit(0);
}

/* ══ ① 訴えの その もの ══════════════════════════════════════════ */
節("① 訴えの 文（そのまま）");
{
  const c = P("大学入試の口頭諮問で、情報Ⅰ,Ⅱの基礎的部分を聞かれるから、全範囲から均等に書かれそうな想定問題を50問作成してほしい。形式は説明したいから、10問4択でそれ以外を記述にしてほしい。よろしく");
  見(c.count === 50, "★ 総数が 50", c.count);
  見(c.plan.single_choice === 10, "★ 4択が **10 問**（25 では ない）", c.plan);
  見(c.plan.free_text === 40, "★ 記述が **40 問**（それ以外＝残り 全部）", c.plan);
  見(c.pinned === true, "★ 内訳を 決めた ものとして 扱う（勝手に 動かさない）", c.pinned);
  見(Object.values(c.plan).reduce((a, b) => a + b, 0) === 50, "合計が 50 に なる", c.plan);
}

/* ══ ② 数 → 形式 の 順（いろいろな 書きかた）══════════════════════ */
節("② 「数 → 形式」で 書いても 読める");
[
  ["10問4択、残りは記述で。全部で30問", { single_choice: 10, free_text: 20 }],
  ["全部で20問。5問を穴埋めにして、それ以外は4択で", { fill_blank: 5, single_choice: 15 }],
  ["30問。10問は正誤で、残りは短答にして", { true_false: 10, text_input: 20 }]
].forEach(([t, 期待]) => {
  const c = P(t);
  const 合 = Object.keys(期待).every((k) => c.plan[k] === 期待[k]);
  見(合, t.slice(0, 26) + "…", { 出: c.plan, 期待 });
});

/* ══ ③ これまでの 書きかたが 壊れて いない ════════════════════════ */
節("③ 「形式 → 数」も これまでどおり");
[
  ["4択10問と穴埋め5問", { single_choice: 10, fill_blank: 5 }],
  ["並べ替え4問、分類4問", { reorder: 4, classification: 4 }],
  ["4択で10問", { single_choice: 10 }]
].forEach(([t, 期待]) => {
  const c = P(t);
  const 合 = Object.keys(期待).every((k) => c.plan[k] === 期待[k]);
  見(合, t, { 出: c.plan, 期待 });
});

節("④ 総数だけ／おまかせは これまでどおり");
{
  const a = P("10問つくって");
  見(a.count === 10, "総数 10", a.count);
  見(a.pinned === false, "内訳は 決まって いない（おまかせ）", a.pinned);

  const b = P("4択と穴埋めで10問");
  見(b.count === 10, "★ 1 つの 数を 分け合う ときは 総数（20 に しない）", { count: b.count, plan: b.plan });

  const c2 = P("10問ずつ、4択と穴埋めで");
  見(c2.count === 20, "「ずつ」は 形式ごとの 数（合わせて 20）", { count: c2.count, plan: c2.plan });
}

節("⑤ 打ち消しは 内訳に しない");
{
  const a = P("20問つくって。4択は1問も作らないで");
  見(!a.plan.single_choice, "★ 「1問も作らないで」を 内訳に しない", a.plan);
  const b = P("30問。10問4択にして。記述は使わないで");
  見(b.plan.single_choice === 10, "打ち消しの ある 文でも 数は 拾える", b.plan);
  見(!b.plan.free_text, "禁止された 形式は 入らない", b.plan);
}

節("⑥ 「それ以外」だけ 書かれた とき");
{
  /* 内訳が 1 つも 無ければ 残りは 決まらない。均等割りの まま（前と 同じ）。 */
  const a = P("20問。それ以外は記述で");
  見(Object.values(a.plan).reduce((x, y) => x + y, 0) === 20, "合計は 総数の まま", a.plan);
}

console.log("\n══ まとめ ══\n  合格 " + 済 + " / 不合格 " + 落);
if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
console.log("");
process.exit(落 ? 1 : 0);
