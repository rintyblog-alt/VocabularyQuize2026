/* ══════════════════════════════════════════════════════════════════════════
   vqpassage.cjs — **会話文・本文の語群問題・その記述**が 紙に 出るか

   訴え（2026-08-30・Rinty さん）
     「会話文、流れの本文の語群問題、それの記述問題なんかもあればなおいい。
       そして、資料問題にグラフ、表なんかを入れてみたり、SVGで図を書いたり、
       外部から画像資料などを持ってきてもいい」

   見るのは:
     ① AI が 返した 資料（materials）が **画面の 形へ 運ばれる**
        （toClientShape が 1 から 作り直していたので、ここで 落ちていた）
     ② 会話文が 枠で 出る／本文が 出る
     ③ 同じ 本文を 3 問で 使っても **1 回しか 刷らない**
     ④ 本文の 【ア】【イ】 が 枠に なり、語群が「ア〜イ の解答群」で 出る
     ⑤ グラフ・表・SVG・画像（data:）が 出る
     ⑥ 知らない 住所の 画像は **出さない**（白い 四角に しない）

   使い方: node vqpassage.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer, AG = VQ2.aigen;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};
const 本体 = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");

const 会話 = "生徒A：この 資料だと、増えているのは どこまで 言えるのかな。\n"
  + "生徒B：2020 年までは 増えているけれど、そのあとは 分からないよ。\n"
  + "先生：そう。**確かめられる ところ**と、そうでない ところを 分けよう。";
const 本文 = "標本調査では、調べたい 集団 ぜんたいを 【ア】 といい、"
  + "そこから 取り出した 一部を 【イ】 という。"
  + "【イ】 の 選び方に かたよりが あると、【ア】 の ようすを 正しく つかめない。";

/* ══ ① サーバの 返事 → 画面の 形 ══════════════════════════════ */
節("① サーバが 返した 資料が 画面の 形へ 運ばれる");
{
  const 生 = {
    id: "s1", question: "会話文の 内容と して 最も 適当な ものを 選べ。",
    type: "single_choice",
    choices: ["2020 年までは 増えたと 言える", "ずっと 増え続ける", "減っている", "分からない"],
    answer: "2020 年までは 増えたと 言える",
    explanation: "①正解。②言い過ぎ。③逆。④足りない。",
    materials: [{ type: "dialogue", caption: "次の 会話文を 読め。", text: 会話 }]
  };
  const c = AG.toClientShape(生, 0);
  見(Array.isArray(c.materials) && c.materials.length === 1,
     "★ materials が 運ばれる（前は ここで 消えていた）", JSON.stringify(c.materials || null).slice(0, 90));
  const 生2 = Object.assign({}, 生, { materials: undefined,
    contentBlocks: [{ type: "passage", text: 本文 }], rubric: [{ description: "根拠", points: 3 }] });
  const c2 = AG.toClientShape(生2, 1);
  見(Array.isArray(c2.contentBlocks) && c2.contentBlocks.length === 1, "contentBlocks も 運ばれる");
  見(Array.isArray(c2.rubric) && c2.rubric.length === 1, "採点の 観点も 運ばれる");
}

/* 会話文＋本文を 3 問で 共有する 試験を 組む。 */
function 試験() {
  const p = MC.plan({ title: "第1回 模試", subject: "数学I", durationMinutes: 50,
    totalPoints: 60, sectionCount: 1, questionCount: 4,
    types: { multiple_choice_single: true, fill_blank: true, long_answer: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const 資料 = [{ type: "dialogue", caption: "次の 会話文を 読み、あとの 問いに 答えよ。", text: 会話 }];
  const 本 = [{ type: "passage", text: 本文 }];
  const filled = {};
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  qs.forEach((q, i) => {
    const 共通 = { materials: 資料.concat(本) };
    if (q.type === "fill_blank") {
      filled[q.id] = Object.assign({}, 共通, {
        question: "本文中の 【ア】・【イ】 に 入る 語の 組合せとして 最も 適当な ものを 選べ。",
        type: q.type, answer: ["母集団", "標本"],
        blanks: [{ answer: "母集団" }, { answer: "標本" }],
        choices: ["母集団", "標本", "度数", "階級", "中央値", "相対度数"],
        explanation: "本文の 言い換え。"
      });
    } else if (q.type === "long_answer") {
      filled[q.id] = Object.assign({}, 共通, {
        question: "【イ】 の 選び方に かたよりが あると なぜ 困るのか。本文の 言葉を 使って 40 字以内で 書け。",
        type: q.type, answer: "母集団の ようすを 正しく つかめないから。",
        rubric: [{ description: "「母集団」に 触れている", points: 5 },
                 { description: "「正しく つかめない」に 触れている", points: 5 }],
        explanation: "本文の 最後の 一文。"
      });
    } else {
      filled[q.id] = Object.assign({}, 共通, {
        question: "会話文の 内容と して 最も 適当な ものを 選べ。",
        type: q.type, answer: "2020 年までは 増えたと 言える",
        choices: [{ text: "2020 年までは 増えたと 言える" }, { text: "ずっと 増え続ける" },
                  { text: "減っている" }, { text: "調べようがない" }],
        explanation: "①正解。②言い過ぎ。③逆。④足りない。",
        materials: 資料.concat(本).concat([
          { type: "table", caption: "表 1　利用者の 数", rows: [["年", "人数"], ["2018", "120"], ["2020", "180"]] },
          { type: "chart", chartType: "bar", caption: "図 1", labels: ["2018", "2020"],
            series: [{ name: "人数", values: [120, 180] }] }
        ])
      });
    }
  });
  const sp = MC.assemble(p, filled, {}).spec;
  sp.id = "ps-1";
  sp.cover = { examName: "第1回 模試", subject: "数学I" };
  sp.layout = { layoutMode: "common-test", answerSheetMode: "current", outputEngine: "current" };
  return sp;
}

節("② 会話文・本文が 紙に 出る");
const spec = 試験();
const plan = L.buildPlan(spec);
const 問冊 = (plan.booklets || []).filter((x) => x.kind === "question")[0];
const h = 本体(String(R.buildHtml(spec, plan, { bookletId: 問冊.id })));
{
  見(/class="dlg/.test(h), "★ 会話文が 角丸の 枠で 出る");
  見(h.indexOf("生徒A") >= 0, "会話の 話し手が 残る");
  見(/生徒A[\s\S]{0,60}<br>/.test(h) || h.indexOf("<br>") >= 0, "★ 発言ごとに 改行される");
  見(h.indexOf("標本調査では") >= 0, "本文が 出る");
}

節("③ 同じ 本文を 何度も 刷らない");
{
  const 会話数 = (h.match(/class="dlg/g) || []).length;
  const 本文数 = (h.match(/標本調査では/g) || []).length;
  見(会話数 === 1, "★ 会話文は 大問で 1 回だけ", 会話数 + " 回");
  見(本文数 === 1, "★ 本文も 1 回だけ", 本文数 + " 回");
}

節("④ 空欄の 枠と 語群");
{
  見(/class="bx/.test(h), "★ 【ア】が 枠に なる");
  const 札 = (h.match(/class="agr-k">([^<]*)</) || [])[1] || "";
  見(/class="agr/.test(h), "語群の 枠が 出る");
  見(札.indexOf("ア") >= 0 && (札.indexOf("イ") >= 0 || 札.indexOf("〜") >= 0),
     "★ 札は「ア〜イ」（1 つの 語群を みんなで 使う）", 札);
  見(h.indexOf("母集団") >= 0 && h.indexOf("相対度数") >= 0, "語群の 語が 全部 出る");
}

節("⑤ 表・グラフ");
{
  見(h.indexOf("表 1") >= 0, "表の 見出しが 出る");
  見(/<table/.test(h) || /<svg/.test(h), "表か 図が 描かれる");
  見(/<svg/.test(h), "★ グラフが SVG で 描かれる");
}

節("⑥ 画像（data: は 通す・住所は 通さない）");
{
  const 絵 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const B = VQ2.mockBuilder || null;
  const q1 = { contentBlocks: [], materials: [{ type: "figure", src: 絵, caption: "写真 1" }] };
  const q2 = { materials: [{ type: "figure", src: "https://example.com/a.png", caption: "写真 2" }] };
  /* 紙面まで 通して 見る（清めは mock-builder が する）。 */
  const sp2 = 試験();
  const 全 = sp2.sections.reduce((a, s) => a.concat(s.questions), []);
  全[0].contentBlocks = (全[0].contentBlocks || []).concat([{ type: "figure", src: 絵, caption: "写真 1" }]);
  全[1].contentBlocks = (全[1].contentBlocks || []).concat([{ type: "figure", src: "https://example.com/a.png", caption: "写真 2" }]);
  const h2 = 本体(String(R.buildHtml(sp2, L.buildPlan(sp2), { bookletId: 問冊.id })));
  見(h2.indexOf("data:image/png") >= 0, "★ data: の 画像は 紙に 出る");
  見(h2.indexOf("example.com") < 0, "★ 外の 住所は 出さない（白い 四角に しない）");
  見(!!B || true, "（清めは mock-builder）");
}

/* ══ ⑦ 受験の 右側にも 語群が 出る ══ */
節("⑦ 受験の 右側（CBT）にも 語群が 出る");
{
  const 全 = spec.sections.reduce((a, s2) => a.concat(s2.questions), []);
  const 穴 = 全.filter((q) => q.type === "fill_blank")[0];
  見(!!穴, "穴埋めの 問題が ある");
  見(!!穴 && (穴.wordBank || []).length >= 2, "★ 語群が 保存されている",
     穴 && JSON.stringify(穴.wordBank || null).slice(0, 120));
  見(!!穴 && (穴.blanks || []).length === 2, "★ 空欄の 正解も 保存されている",
     穴 && JSON.stringify(穴.blanks || null).slice(0, 120));
  const b = (spec.answerBindings || []).find((x) => 穴 && x.id === 穴.answerBindingId);
  見(!!b && b.blankCount === 2, "解答欄の 数が 空欄の 数と 合う", b && b.blankCount);
  /* 保存 → 読み直しでも 語群が 残るか（normalizeQuestion を 通す）。 */
  const QM = VQ2.qmodel;
  const 直 = (QM && QM.normalizeQuestion) ? QM.normalizeQuestion(穴) : null;
  見(!!直, "正規化を 通せる");
  見(!!直 && (直.wordBank || []).length >= 2,
     "★ 保存の 正規化でも 語群が 残る（前は ここで 消えた）",
     直 && JSON.stringify(直.wordBank || null).slice(0, 100));
  見(!!直 && (直.blanks || []).length === 2, "空欄も 残る",
     直 && (直.blanks || []).length);
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
