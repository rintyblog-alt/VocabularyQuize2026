/* ══════════════════════════════════════════════════════════════════════════
   vqunderline.cjs — **傍線部・波線部**と **第n問の 大枠**

   訴え（2026-08-30・Rinty さん）
     「下線部や棒線部、波線など（棒線部①、ⅰ、A、a など 記号も 入れつつ
       複数 入れてみたり 単数でも いいし）の 問題が 1 つも 見当たらない」
     「資料に 限る話じゃなくて、表に 棒線部などを 入れたりさ」
     「共テの 場合は 第n問を 入れて 大枠に してから、そこに 問n を 入れたら」

   決めたこと:
     ★ AI に タグを 書かせない。引く 場所は **本文の 一部**（文字列）で 指させ、
       こちらが 探して 線を 引く。見つからなければ **引かない**
       （違う ところに 線を 引くと、別の 問題に なってしまう）。
     ★ 記号は ①②③ ／ ⅰⅱⅲ ／ A B C ／ a b c ／ ア イ ウ。
     ★ 線は 実線・波線・二重線。

   使い方: node vqunderline.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer, AG = VQ2.aigen;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 340) : "")); }
};
const 本体 = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");

const 本文 = "情報を 確かめる ときは、まず 出どころを 見る。次に 日付を 見る。"
  + "そのうえで、ほかの 資料と 突き合わせて、どこまでが 言えるかを 決める。";

function 試験(資料, 問数, 大問数) {
  const p = MC.plan({ title: "地理Ａ", subject: "地理", durationMinutes: 60,
    totalPoints: (大問数 || 2) * 20, sectionCount: 大問数 || 2, questionCount: 問数 || 6,
    types: { multiple_choice_single: true }, difficulty: "mixed",
    allowExternalKnowledge: true, requireSources: false });
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  const filled = {};
  qs.forEach((q, i) => {
    filled[q.id] = AG.toClientShape({
      id: "x" + i, type: "single_choice",
      question: "傍線部① と あるが、その 説明として 最も 適当な ものを 選べ。",
      choices: ["あ", "い", "う", "え"], answer: "あ", explanation: "①正解。②言い過ぎ。③逆。④足りない。",
      materials: i === 0 ? 資料 : undefined
    }, i);
  });
  const sp = MC.assemble(p, filled, {}).spec;
  sp.cover = { examName: "地理Ａ", subject: "地理" };
  sp.layout = { layoutMode: "common-test", answerSheetMode: "current", outputEngine: "current" };
  return sp;
}
function 紙(sp) {
  const plan = L.buildPlan(sp);
  const b = (plan.booklets || []).filter((x) => x.kind === "question")[0];
  return 本体(String(R.buildHtml(sp, plan, { bookletId: b.id })));
}

節("① 本文に 傍線（記号つき・複数・線の 種類）");
{
  const h = 紙(試験([{ type: "passage", text: 本文, underlines: [
    { marker: "①", style: "solid", text: "まず 出どころを 見る" },
    { marker: "②", style: "wave", text: "ほかの 資料と 突き合わせて" },
    { marker: "ⅲ", style: "double", text: "日付を 見る" }
  ] }]));
  見(/class="ub"/.test(h), "★ 実線が 引かれる");
  見(/class="ub is-wave"/.test(h), "★ 波線が 引かれる");
  見(/class="ub is-double"/.test(h), "★ 二重線が 引かれる");
  const 印 = (h.match(/class="ubm">([^<]+)<\/span>/g) || [])
    .map((x) => (x.match(/>([^<]+)</) || [])[1] || "");
  見(印.indexOf("①") >= 0 && 印.indexOf("②") >= 0 && 印.indexOf("ⅲ") >= 0,
     "★ 記号が 3 つとも 出る（①②ⅲ）", 印.join(""));
  見(h.indexOf("まず 出どころを 見る") >= 0, "本文は そのまま 残る");
}

節("② 見つからない ときは 引かない（作り話を しない）");
{
  const h = 紙(試験([{ type: "passage", text: 本文, underlines: [
    { marker: "①", style: "solid", text: "本文に 出てこない 言い換えた 文" }
  ] }]));
  見(!/class="ub"/.test(h), "★ 一致しない 指定では 線を 引かない");
  見(!/class="ubm"/.test(h), "★ 記号も 出さない");
  見(h.indexOf("情報を 確かめる") >= 0, "本文そのものは 出る");
}

節("③ 会話文にも 引ける");
{
  const 会 = "生徒A：この 資料だと どこまで 言えるのかな。\n生徒B：2020 年までは 言えるよ。";
  const h = 紙(試験([{ type: "dialogue", text: 会, underlines: [
    { marker: "a", style: "solid", text: "2020 年までは 言える" }
  ] }]));
  見(/class="dlg/.test(h), "会話文の 枠で 出る");
  見(/class="ub"/.test(h) && /class="ubm">a</.test(h), "★ 会話文にも 線と 記号");
}

節("④ 表の マスにも 引ける");
{
  const h = 紙(試験([{ type: "table", caption: "表 1　利用者", rows: [["年", "人数"], ["2018", "120"], ["2020", "180"]],
    underlines: [{ marker: "ⅰ", style: "solid", text: "人数" }, { marker: "ⅱ", style: "wave", text: "180" }] }]));
  見(/<table class="tbl"/.test(h), "★ 線の ある 表は HTML の 表で 組む（SVG では 線を 指せない）");
  見(/class="ub"/.test(h) && /class="ub is-wave"/.test(h), "★ マスの 中に 実線と 波線");
  見(/class="ubm">ⅰ</.test(h) && /class="ubm">ⅱ</.test(h), "★ 記号も 出る");
  見(h.indexOf("表 1　利用者") >= 0, "表の 見出しも 残る");
  /* 線の 無い 表は これまでどおり SVG（きれいに 組める ほう）。 */
  const h2 = 紙(試験([{ type: "table", caption: "表 2", rows: [["年", "人数"], ["2018", "120"]] }]));
  見(!/class="ub"/.test(h2), "★ 線の 無い 表には 線を 引かない",
     /<table class="tbl"/.test(h2) ? "HTML の 表" : "SVG の 表");
}

節("⑤ 第n問の 大枠（実物の 組みかた）");
{
  const h = 紙(試験([{ type: "passage", text: 本文 }], 6, 2));
  const 見出 = (h.match(/<span class="sec-no">([^<]+)<\/span>/g) || [])
    .map((x) => (x.match(/>([^<]+)</) || [])[1] || "");
  見(見出.join(" ") === "第1問 第2問", "★ 第n問が 大枠に なる", 見出.join(" "));
  見(/次の問い（問1〜3）に答えよ。/.test(h), "★「次の問い（問1〜3）に答えよ。」が 入る",
     (h.match(/次の問い（問1〜\d+）に答えよ。/g) || []).join(" / "));
  見(/class="sec-pts">（配点　\d+）/.test(h), "★「（配点 20）」が 見出しに 続く",
     (h.match(/class="sec-pts">（配点　\d+）/g) || []).join(" / "));
  見(/class="q-no">問\d+/.test(h), "★ その下に 問n が 並ぶ",
     (h.match(/class="q-no">問\d+/g) || []).slice(0, 6).join(" / "));
  /* 大問ごとに ページを 変える（実物は 第n問で 改ページ）。 */
  見(/page-break-before:always/.test(h), "★ 第2問から ページを 変える");
}

節("⑥ 設問文そのものにも 引ける");
{
  const sp = 試験([{ type: "passage", text: 本文 }]);
  const 全 = sp.sections.reduce((a, s) => a.concat(s.questions), []);
  全[0].underlines = [{ marker: "①", style: "solid", text: "最も 適当な もの" }];
  const h = 本体(String(R.buildHtml(sp, L.buildPlan(sp),
    { bookletId: (L.buildPlan(sp).booklets || []).filter((x) => x.kind === "question")[0].id })));
  見(/class="q-text"[\s\S]{0,400}class="ub"/.test(h) || /class="ub"/.test(h),
     "★ 設問文にも 線を 引ける");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
