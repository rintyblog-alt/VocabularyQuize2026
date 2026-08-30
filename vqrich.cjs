/* ══════════════════════════════════════════════════════════════════════════
   vqrich.cjs — **数式・数学記号**と **文字の 飾り（<u> など）**が 紙に 出るか

   訴え（2026-08-30・Rinty さん）
     「数式、数学記号に 対応させてないよな？
       下線部、棒線部、波線なども <u>タグが 丸見えで 反映されてないし」

   分かった こと（直す前）:
     ★ 数式は **一度も 出たことが なかった。**
       紙面は spec.__math という 表を 見る 作りだったのに、
       **その 表を 作る ところが どこにも 無かった**（読む側 だけ あった）。
     ★ <u> <b> <sub> <sup> は esc を 通って **文字として 丸見え**だった。

   決めたこと:
     ★ 紙面は 別の 窓（about:blank）。KaTeX の CSS も 書体も 届かないので、
       数式は **SVG に して 埋め込む**（書体が 要らない）。
     ★ 札は **決めた ものだけ** 戻す。知らない 札は そのまま
       （勝手に 消すと 中身が 消える）。
     ★ 組めない 式は 消さず、書いてあった まま 出す。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqrich.cjs
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

(async () => {
  console.log("測る先:", BASE);
  const b = await chromium.launch();
  const page = await b.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.pdfRenderer && window.VQM),
    null, { timeout: 60000 });

  const 紙 = (問1, 問2) => page.evaluate(async ([a, b2]) => {
    const V = window.VQ2, MC = V.mockCompiler, L = V.layout, R = V.pdfRenderer, AG = V.aigen;
    await R.数式の用意();
    const pl = MC.plan({ seed: "rich", title: "t", subject: "数学", durationMinutes: 60,
      totalPoints: 20, sectionCount: 1, questionCount: 2, types: { multiple_choice_single: true },
      difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
    const qs = pl.sections.reduce((x, s) => x.concat(s.questions), []);
    const f = {};
    qs.forEach((q, i) => { f[q.id] = AG.toClientShape({ id: "x" + i, type: "single_choice",
      question: i === 0 ? a : b2, choices: ["あ", "い", "う", "え"], answer: "あ", explanation: "e" }, i); });
    const sp = MC.assemble(pl, f, {}).spec;
    sp.cover = { examName: "t", subject: "数学" };
    const plan = L.buildPlan(sp);
    const bk = (plan.booklets || []).filter((x) => x.kind === "question")[0];
    return String(R.buildHtml(sp, plan, { bookletId: bk.id })).replace(/<style[\s\S]*?<\/style>/g, "");
  }, [問1, 問2]);

  節("① 数式・数学記号");
  {
    const h = await 紙("$x^2+2x+1$ を 因数分解せよ。また $\\frac{1}{2}$ と $\\sqrt{3}$ を 比べよ。",
                       "\\( \\int_0^1 x\\,dx \\) と \\[ \\sum_{k=1}^{n} k = \\frac{n(n+1)}{2} \\] を 示せ。");
    const svg = (h.match(/class="vqm/g) || []).length;
    見(svg >= 5, "★ 数式が SVG に なる（$…$ ／ \\(…\\) ／ \\[…\\]）", svg + " 個");
    見(!/\$x\^2/.test(h), "★ 生の $x^2+2x+1$ は 残らない");
    見(!/\\frac|\\sqrt|\\int|\\sum/.test(h.replace(/<svg[\s\S]*?<\/svg>/g, "")),
       "★ \\frac \\sqrt \\int \\sum も 残らない");
    見(/class="vqm vqm-b"/.test(h) || /vqm-b/.test(h), "★ \\[…\\] は 別行立て（中央）に なる");
    /* 組めない 式は 消さない。 */
    const h2 = await 紙("$\\これは組めない{{{$ を 見る。", "ふつうの 文。");
    見(/組めない/.test(h2), "★ 組めない 式は 消さず そのまま 出す");
  }

  節("② 文字の 飾り（札）");
  {
    const h = await 紙("<u>下線部</u>と<b>太字</b>と<i>斜体</i>、H<sub>2</sub>O、x<sup>2</sup>。",
                       "<mark>波線</mark>と<strong>強い</strong>と<em>強調</em>、<br>改行も。");
    見(/class="ub">下線部</.test(h), "★ <u> が 下線に なる");
    見(/<b>太字<\/b>/.test(h), "★ <b> が 太字に なる");
    見(/<i>斜体<\/i>/.test(h), "★ <i> が 斜体に なる");
    見(/<sub>2<\/sub>/.test(h), "★ <sub> が 下付きに なる（H₂O）");
    見(/<sup>2<\/sup>/.test(h), "★ <sup> が 上付きに なる（x²）");
    見(/class="ub is-wave">波線</.test(h), "★ <mark> が 波線に なる");
    見(/<b>強い<\/b>/.test(h) && /<i>強調<\/i>/.test(h), "★ <strong> <em> も 効く");
    見(/改行も/.test(h) && /<br>/.test(h), "★ <br> が 改行に なる");
    見(!/&lt;u&gt;|&lt;b&gt;|&lt;sub&gt;|&lt;mark&gt;/.test(h), "★ 札が 文字として 丸見えに ならない");
  }

  節("③ 印の 書きかた");
  {
    const h = await 紙("**太字**と~~波線~~と__下線__。", "H_{2}O と x^{2}。");
    見(/<b>太字<\/b>/.test(h), "★ **太字**");
    見(/class="ub is-wave">波線</.test(h), "★ ~~波線~~");
    見(/class="ub">下線</.test(h), "★ __下線__");
    見(/<sub>2<\/sub>/.test(h) && /<sup>2<\/sup>/.test(h), "★ _{2} ^{2} も 効く");
    見(!/\*\*太字\*\*|~~波線~~|__下線__/.test(h), "★ 印が そのまま 残らない");
  }

  節("④ 知らない 札は 消さない");
  {
    const h = await 紙("<blink>知らない札</blink>の 中身。", "ふつうの 文。");
    見(/知らない札/.test(h), "★ 中身は 消えない（黙って 落とさない）");
  }

  節("⑤ 選択肢・語群の 質（AI への 頼み）");
  {
    const fs = require("fs");
    const w = fs.readFileSync("server/src/worker.js", "utf8");
    const m = fs.readFileSync("js-src/vq-make.js", "utf8");
    見(/難しめ と 言われた ときの 選択肢/.test(w), "★ 難しめの ときの 選択肢の 決まりが ある");
    見(/正解と \*\*1 か所だけ\*\*違う/.test(w), "★ 誤答は 正解と 1 か所だけ 違う");
    見(/明らかに おかしい 行動/.test(w), "★ 極端な 選択肢を 禁じている");
    見(/選択肢どうしを 見比べて 決まる/.test(w), "★ 見比べないと 決まらないように させる");
    見(/空欄の 数 ＋ 2 以上/.test(w), "★ 語群は 空欄より 2 つ以上 多く");
    見(/本文（150〜400 字）を materials の passage で 付けて/.test(m),
       "★ 試験づくりが 語群問題を **数まで 名指し**で 頼む");
    見(/data-a="wb"/.test(m), "★ 画面で「本文＋語群うめ」を 選べる");
  }

  見(例外.length === 0, "例外が 出ていない", 例外);
  await b.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("ERR", String(e && e.message || e)); process.exit(1); });
