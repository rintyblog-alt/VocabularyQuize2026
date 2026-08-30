/* ══════════════════════════════════════════════════════════════════════════
   vqdialogfig.cjs — 会話文と 図が **実物の 水準**で 組めるか

   訴え（2026-08-30・Rinty さん／共通テスト 情報Ⅰ 第2問 の 紙面を 見せて）
     「会話文も さ、この くらい ないと 共通テストとは 言えないよな？
       この くらい しっかり 入れないと さ。
       あと 資料の 図形や 図も この くらいの ものを 入れないと 意味 ないやろ」

   実物（情報Ⅰ 第2問A）:
     ・会話文 14 発言・約 700 字。太郎 と 先生。
     ・会話文の **中に** 空欄 ア。
     ・会話文の **中に** 下線部A・B（折り返す 長さ）。
     ・図1（二次元コード）・図2（入れ子の 四角＋(a)(b)(c) の 矢印＋
       「1 1 3 1 1」の 黒白の 帯）・図3（同心円＋(d)(e)(f)）。
     ・同じ 会話文に 問1〜問4 が ぶら下がる（会話文は **1 回だけ** 刷る）。

   直す前に 足りなかった もの:
     ① 会話は「4〜10 発言」としか 頼んでいなかった
     ② 折り返した 2 行目が 話し手の 下に 潜り込んでいた（1 本の 流し込み）
     ③ 図の 道具に **四角**が 無く、塗りは 灰の 模様だけ。
        入れ子の 黒白の 四角も、比の 帯も 描けなかった
     ④ 同じ 会話文でも 1 字 違えば 2 回 刷られていた

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqdialogfig.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 320) : "")); }
};

/* 実物と 同じ 密度の 会話文（14 発言）。 */
const 会話 = [
  "太郎：二次元コードって 様々なところで 使われていて、便利ですね。",
  "先生：二次元コードといっても いろいろ 種類が あるけれど、日ごろ よく 目に する ものは 日本の 企業が 考えたんだよ。",
  "太郎：すごい 発明ですね。企業だから 特許を 取ったのでしょうか。",
  "先生：もちろん。【ア】世の中で 広く 使われるように なったんだよ。",
  "太郎：どのくらいの 情報を 入れられるのでしょうか。",
  "先生：大きさにも よるけど、図1 ぐらいの 大きさで あれば、数字なら 187 文字、英小文字なら 78 文字、記号や 漢字なら 48 文字を 入れられるよ。",
  "太郎：二次元コードの 形状には どんな 特徴が あるのかな？",
  "太郎：黒白の 小さな 正方形で 構成されていて、3 か所の 隅に 二重の 少し 大きな 正方形が ありますね。",
  "先生：黒白の 小さな 正方形は セルと 言って、1 と 0 に 符号化されるんだよ。図1 の 二次元コードは 縦×横が 33×33 の セルで 構成されているけど、文字種や 文字数などによって セルの 縦と 横の 数が 変わり、それにつれて 二次元コードの 大きさも 変わるね。3 か所の 隅に ある 二重の 少し 大きな 正方形は、読み取り機に この 二次元コードが あることを 教えている 位置検出の 目印なんだ。",
  "太郎：この 二次元コードって 一部を 隠しても 正しく 読み取れるんですよね。",
  "先生：誤り訂正機能だね。工場などで 製品管理でも 使えるように、汚れや 破損などで 一部が 読み取れなくても 復元できるんだよ。読み取れない 面積の 割合によって 復元できる レベルは 4 段階 あるんだ。",
  "太郎：すごい 技術ですね。",
  "先生：そうだね。自分でも 二次元コードを 作成できるから、いろいろ 試してみたら どうかな。",
  "太郎：やってみます。"
].join("\n");

const 傍線 = [
  { marker: "A", style: "solid",
    text: "3 か所の 隅に ある 二重の 少し 大きな 正方形は、読み取り機に この 二次元コードが あることを 教えている 位置検出の 目印なんだ" },
  { marker: "B", style: "solid",
    text: "誤り訂正機能だね。工場などで 製品管理でも 使えるように、汚れや 破損などで 一部が 読み取れなくても 復元できるんだよ" }
];

/* 図2 … 入れ子の 四角（黒→白→黒）＋ (a)(b)(c) の 矢印 ＋ 1 1 3 1 1 の 帯 */
const 図2 = {
  type: "diagram", caption: "図2　位置検出の目印とその黒白の比",
  items: [
    { type: "rect", x: 3, y: 3, w: 6, h: 6, fill: "black" },
    { type: "rect", x: 4, y: 4, w: 4, h: 4, fill: "white" },
    { type: "rect", x: 5, y: 5, w: 2, h: 2, fill: "black" },
    { type: "arrow", x1: 0, y1: 10.5, x2: 3, y2: 9, label: "(b)" },
    { type: "arrow", x1: 0, y1: 6, x2: 3, y2: 6, label: "(a)" },
    { type: "arrow", x1: 6, y1: 0, x2: 6, y2: 3, label: "(c)" },
    { type: "ratiobar", x: 12, y: 8.6, w: 7, h: 0.7, parts: [1, 1, 3, 1, 1], start: "black" },
    { type: "ratiobar", x: 12, y: 6.6, w: 7, h: 0.7, parts: [1, 1, 3, 1, 1], start: "black" },
    { type: "ratiobar", x: 12, y: 4.6, w: 7, h: 0.7, parts: [1, 1, 3, 1, 1], start: "black" },
    { type: "label", x: 11.4, y: 8.9, text: "(a)", anchor: "end" },
    { type: "label", x: 11.4, y: 6.9, text: "(b)", anchor: "end" },
    { type: "label", x: 11.4, y: 4.9, text: "(c)", anchor: "end" }
  ]
};
/* 図3 … 同心円（黒→白→黒）＋ (d)(e)(f) */
const 図3 = {
  type: "diagram", caption: "図3　円形の目印",
  items: [
    { type: "circle", cx: 6, cy: 6, r: 3.2, fill: "black" },
    { type: "circle", cx: 6, cy: 6, r: 2.2, fill: "white" },
    { type: "circle", cx: 6, cy: 6, r: 1.2, fill: "black" },
    { type: "arrow", x1: 11, y1: 9.5, x2: 7.5, y2: 7.5, label: "(f)" },
    { type: "arrow", x1: 11, y1: 6, x2: 9.2, y2: 6, label: "(e)" },
    { type: "arrow", x1: 11, y1: 2.5, x2: 7.5, y2: 4.5, label: "(d)" }
  ]
};

(async () => {
  console.log("測る先:", BASE);
  const b = await chromium.launch();
  const page = await b.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.pdfRenderer && window.VQFIG),
    null, { timeout: 60000 });

  節("① 図（実物の 図2・図3 を そのまま 組む）");
  const 図 = await page.evaluate(([a, c]) => ({
    二: window.VQFIG.描く(a), 三: window.VQFIG.描く(c)
  }), [図2, 図3]);
  {
    const h = 図.二;
    const 四角 = (h.match(/<rect /g) || []).length;
    見(!/vf-miss/.test(h), "★ 図2 が 描ける（「図を 出せません」に ならない）");
    見(四角 >= 18, "★ 入れ子の 四角と 帯が 出る（rect が 並ぶ）", 四角 + " 個");
    見(/fill="#000"/.test(h) && /fill="#fff"/.test(h),
       "★ 黒と 白で 塗り分ける（灰の 模様に ならない）");
    見((h.match(/>1</g) || []).length >= 6 && (h.match(/>3</g) || []).length >= 3,
       "★ 帯の 上に 比（1 1 3 1 1）が 並ぶ",
       "1 が " + (h.match(/>1</g) || []).length + " ／ 3 が " + (h.match(/>3</g) || []).length);
    見(/marker-end="url\(#ar\)"/.test(h), "★ 引き出しの 矢印が 出る");
    見(["(a)", "(b)", "(c)"].every((k) => h.indexOf(k) >= 0), "★ (a)(b)(c) の 名前が 付く");
    見(/図2/.test(h) && /位置検出/.test(h), "★ 図の 名前（図2 …）が 付く");
  }
  {
    const h = 図.三;
    const 円 = (h.match(/<ellipse /g) || []).length;
    見(!/vf-miss/.test(h), "★ 図3 が 描ける");
    見(円 >= 3, "★ 同心円が 3 重で 出る", 円 + " 個");
    見(/fill="#000"/.test(h) && /fill="#fff"/.test(h), "★ 円も 黒白で 塗り分ける");
    見(["(d)", "(e)", "(f)"].every((k) => h.indexOf(k) >= 0), "★ (d)(e)(f) の 名前が 付く");
  }

  節("② 会話文（実物と 同じ 14 発言）");
  const 紙 = await page.evaluate(async ([会, 傍, f2, f3]) => {
    const V = window.VQ2, MC = V.mockCompiler, L = V.layout, R = V.pdfRenderer, AG = V.aigen;
    await R.数式の用意();
    const pl = MC.plan({ seed: "joho", title: "情報Ⅰ", subject: "情報", durationMinutes: 60,
      totalPoints: 30, sectionCount: 1, questionCount: 4,
      types: { multiple_choice_single: true },
      difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
    const qs = pl.sections.reduce((x, s) => x.concat(s.questions), []);
    const fill = {};
    qs.forEach((q, i) => {
      /* ★ 2 問目からは 会話文を **1 字だけ** 変える（AI は そうする）。
         それでも 1 回しか 刷られない ことを 見る。 */
      const t = i === 0 ? 会 : (i === 1 ? 会.replace("やってみます。", "やってみますね。") : 会);
      const m = [{ type: "dialogue",
                   caption: "次の 太郎さんと 先生の 会話文を 読み、問い（問1〜4）に 答えよ。",
                   text: t, underlines: 傍 }];
      if (i === 1) m.push(f2);
      if (i === 2) m.push(f3);
      fill[q.id] = AG.toClientShape({
        id: "x" + i, type: "single_choice",
        question: i === 0 ? "空欄 ア に 当てはまる 文として 最も 適当な ものを 選べ。"
                          : "下線部A の 目印について 最も 適当な ものを 選べ。",
        choices: ["そこで、使用料を 高くする ことで この 二次元コードの 価値が 上がったから",
                  "しかし、その後 特許権を 放棄して 誰でも 特許が 取れるように したから",
                  "そして、特許権を 行使して 管理を 厳密に したから",
                  "でも、特許権を 保有していても 権利を 行使しないと していたから"],
        answer: "でも、特許権を 保有していても 権利を 行使しないと していたから",
        explanation: "e", materials: m
      }, i);
    });
    const sp = MC.assemble(pl, fill, {}).spec;
    sp.cover = { examName: "情報Ⅰ", subject: "情報" };
    sp.layout = { layoutMode: "common-test", answerSheetMode: "common-test-mark",
                  outputEngine: "current", layoutSeed: "joho" };
    const plan = L.buildPlan(sp);
    const bk = (plan.booklets || []).filter((x) => x.kind === "question")[0];
    return String(R.buildHtml(sp, plan, { bookletId: bk.id })).replace(/<style[\s\S]*?<\/style>/g, "");
  }, [会話, 傍線, 図2, 図3]);
  /* 見た目を 測る ぶんは **style を 外さない**（外すと grid が 効かない）。 */
  const 紙生 = await page.evaluate(async ([会, 傍]) => {
    const V = window.VQ2, MC = V.mockCompiler, L = V.layout, R = V.pdfRenderer, AG = V.aigen;
    const pl = MC.plan({ seed: "joho2", title: "情報Ⅰ", subject: "情報", durationMinutes: 60,
      totalPoints: 10, sectionCount: 1, questionCount: 1,
      types: { multiple_choice_single: true }, difficulty: "mixed",
      allowExternalKnowledge: true, requireSources: false });
    const q = pl.sections[0].questions[0];
    const fill = {};
    fill[q.id] = AG.toClientShape({ id: "z", type: "single_choice",
      question: "会話文の 内容として 最も 適当な ものを 選べ。",
      choices: ["あ", "い", "う", "え"], answer: "あ", explanation: "e",
      materials: [{ type: "dialogue", caption: "会話文", text: 会, underlines: 傍 }] }, 0);
    const sp = MC.assemble(pl, fill, {}).spec;
    sp.cover = { examName: "情報Ⅰ", subject: "情報" };
    const plan = L.buildPlan(sp);
    const bk = (plan.booklets || []).filter((x) => x.kind === "question")[0];
    return String(R.buildHtml(sp, plan, { bookletId: bk.id }));
  }, [会話, 傍線]);

  {
    const h = 紙;
    const 枠 = (h.match(/class="dlg is-round"/g) || []).length;
    見(枠 === 1, "★ 同じ 会話文は **1 回だけ** 刷る（1 字 違っても）", 枠 + " 枠");
    見(/class="dlg-b"/.test(h), "★ 発言が 2 列に 組まれる（折り返しが 話し手の 右へ）");
    const 話 = (h.match(/class="dlg-s"/g) || []).length;
    見(話 === 14, "★ 14 発言 すべて 出る", 話 + " 発言");
    const 字 = h.replace(/<[^>]*>/g, "").length;
    見(/二次元コード/.test(h) && /33×33/.test(h) && /4 段階/.test(h),
       "★ 具体的な 数・仕組みが 会話に 残る");
    見(/class="bx[^"]*">ア</.test(h) && !/【ア】/.test(h),
       "★ 会話文の 中の 【ア】が 空欄の 枠（□ア）に なる",
       (h.match(/class="bx/g) || []).length + " 個");
    const 線 = (h.match(/class="ub[ "]/g) || []).length;
    見(線 >= 2, "★ 会話文の 中に 傍線が 2 本 引かれる", 線 + " 本");
    見(/class="ubm">A</.test(h) && /class="ubm">B</.test(h), "★ 傍線に A・B の 印が 付く");
    見((h.match(/data-question="/g) || []).length === 4, "★ 問1〜問4 が 会話文の 下に 並ぶ",
       (h.match(/data-question="/g) || []).length + " 問");
    見(/第1問/.test(h), "★ 第1問 の 大枠に 入る");
    見(/図2/.test(h) && /図3/.test(h), "★ 図2・図3 も 同じ 大問に 出る");
    見(!/vf-miss/.test(h), "★ 紙面の 図が 「出せません」に ならない");
    console.log("  参考: 会話文の 字数 " + 会話.replace(/\s/g, "").length + " 字 ／ 紙面 " + 字 + " 字");
  }

  節("③ 折り返した 2 行目が 話し手の 右へ そろう（実物の 組み）");
  {
    /* ★ ここは 見た目の 話なので **実際に 置いて 測る**。
       話し手の 幅ぶん 右から 始まっていなければ、実物の 組みでは ない。 */
    const 測 = await page.evaluate(async (html) => {
      /* 紙面は まるごと 1 枚の 文書。**style と 中身を 取り出して** 置く。
         div.innerHTML に 丸ごと 入れると <head> の style が 落ちて grid が 効かない。 */
      const 型 = (html.match(/<style[\s\S]*?<\/style>/g) || []).join("");
      const 中 = (/<body[^>]*>([\s\S]*)<\/body>/.exec(html) || [, html])[1];
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;left:-9999px;top:0;width:800px";
      d.innerHTML = 型 + 中;
      document.body.appendChild(d);
      await new Promise((z) => setTimeout(z, 120));
      const b = d.querySelector(".dlg-b");
      const st = b ? getComputedStyle(b) : null;
      const ss = Array.from(d.querySelectorAll("span.dlg-s")).map((x) => Math.round(x.getBoundingClientRect().right));
      const ts = Array.from(d.querySelectorAll("span.dlg-t")).map((x) => Math.round(x.getBoundingClientRect().left));
      /* いちばん 長い 発言（折り返す）の 高さ */
      const 高 = Math.max.apply(null, Array.from(d.querySelectorAll("span.dlg-t"))
        .map((x) => Math.round(x.getBoundingClientRect().height)));
      const 一行 = Math.min.apply(null, Array.from(d.querySelectorAll("span.dlg-t"))
        .map((x) => Math.round(x.getBoundingClientRect().height)));
      const o = { grid: st ? st.display : "", 列: st ? st.gridTemplateColumns : "",
                  話し手の右: Array.from(new Set(ss)), 中身の左: Array.from(new Set(ts)),
                  最長: 高, 一行: 一行, 発言: ss.length };
      d.remove();
      return o;
    }, 紙生);
    見(測.発言 === 14, "紙面に 14 発言 置けた", 測.発言);
    見(測.grid === "grid", "並べかたが grid（2 列）", 測.grid + " / " + 測.列);
    見(測.中身の左.length === 1, "★ どの 発言も 中身が **同じ x**から 始まる", 測.中身の左);
    見(測.話し手の右.length === 1, "★ 話し手の 列の 幅が そろう", 測.話し手の右);
    見(測.中身の左[0] >= 測.話し手の右[0] - 1,
       "★ 中身は 話し手の 右（下へ 潜り込まない）",
       "話し手の右 " + 測.話し手の右[0] + " ／ 中身の左 " + 測.中身の左[0]);
    見(測.最長 >= 測.一行 * 2, "★ 長い 発言は ちゃんと 折り返している",
       "いちばん 長い 発言 " + 測.最長 + "px ／ 1 行 " + 測.一行 + "px");
  }

  節("④ 例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3).join(" / "));

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  await b.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
