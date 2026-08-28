/* ══════════════════════════════════════════════════════════════════════════
   vqplanask.cjs — Lumi の **段取りの 質問の 窓**を 実物で 見る。

   訴え（2026-08-28）:
     「リアルタイム音声対話の 段取りの クエスチョン画面を **かならず 最前面**に。
       UI デザインは 画像の ようなものに。全部 回答したら 直ぐに 作業を 始めて」

   見るところ:
     ① **どんな 覆いより 上**に 出る（2147483000 台の 覆いを あとから 出しても）
     ② 「質問」の 小見出し・太い 問い・**丸い チェック**・区切り線・
        黒い 丸ボタン「送信」が ある
     ③ 1 つだけの 問: 選んで 送信 ／ 同じ ものを もう一度 押すと そのまま 送る
     ④ multi の 問: **いくつでも 選べる**
     ⑤ 全部 答えたら 窓が 閉じ、答えが **順番どおり**に 返る
     ⑥ 番号キー（1〜9）でも 選べる

   使い方: node vqplanask.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const SP = process.env.SP || ".";

const 質問 = [
  { q: "何について 作りますか？",
    options: [{ label: "英単語", desc: "テストに 出る ところ" }, { label: "日本史", desc: "鎌倉〜江戸" },
              { label: "理科", desc: "生物と 化学" }] },
  { q: "どの 形式を 入れますか？", multi: true,
    options: [{ label: "4 択" }, { label: "正誤" }, { label: "穴埋め" }, { label: "並べ替え" }] },
  { q: "何問くらい？", options: [{ label: "10 問" }, { label: "20 問" }] }
];

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__vqPlanAsk === "function", null, { timeout: 60000 });

  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 220) : "")); if (!落 && !ok) {} if (!ok) 落++; };

  await page.evaluate((質問) => {
    window.__vqPlanResult = null;
    window.__vqPlanAsk("英単語の プリセットを 作る", 質問)
      .then((r) => { window.__vqPlanResult = r; });
  }, 質問);
  await page.waitForTimeout(600);

  /* ── ① あとから 出した 覆いより 上か ── */
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "vqTestOverlay";
    d.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(255,0,0,.35)";
    document.body.appendChild(d);
  });
  await page.waitForTimeout(1200);   /* 見張りが 置き直すのを 待つ */
  const 前後 = await page.evaluate(() => {
    const a = document.getElementById("vqPlanAsk");
    const o = document.getElementById("vqTestOverlay");
    const kids = Array.from(document.body.children);
    return { z: a ? a.style.zIndex : "", 位置: kids.indexOf(a), 覆い位置: kids.indexOf(o), 数: kids.length };
  });
  console.log("重なり:", JSON.stringify(前後));
  見(Number(前後.z) >= 2147483600, "① z が 覆いより 大きい", 前後.z);
  見(前後.位置 > 前後.覆い位置, "① あとから 出た 覆いより **後ろの子**（＝上）に 置き直される", 前後);

  /* ── ② 見た目 ── */
  const 見た目 = await page.evaluate(() => {
    const sr = document.getElementById("vqPlanAsk").shadowRoot;
    const g = (s) => sr.querySelector(s);
    const 送 = g('[data-role="ok"]');
    const cs = 送 ? getComputedStyle(送) : null;
    return {
      小見出し: g(".kk") ? g(".kk").textContent : "",
      問: g(".q") ? g(".q").textContent : "",
      問の太さ: g(".q") ? getComputedStyle(g(".q")).fontWeight : "",
      問の大きさ: g(".q") ? getComputedStyle(g(".q")).fontSize : "",
      丸: sr.querySelectorAll("button.o .ck").length,
      区切り: g("button.o") ? getComputedStyle(g("button.o")).borderBottomWidth : "",
      送信: 送 ? 送.textContent : "",
      送信の丸み: cs ? cs.borderRadius : "",
      送信の色: cs ? cs.backgroundColor : "",
      送信が押せる: 送 ? !送.disabled : null,
      番号: g(".n") ? g(".n").textContent : ""
    };
  });
  console.log("見た目:", JSON.stringify(見た目));
  見(見た目.小見出し === "質問", "② 「質問」の 小見出しが ある");
  見(Number(見た目.問の太さ) >= 700 && parseFloat(見た目.問の大きさ) >= 19, "② 問いが 太くて 大きい", [見た目.問の太さ, 見た目.問の大きさ]);
  見(見た目.丸 === 3, "② 丸い チェックが 選択肢の 数だけ ある", 見た目.丸);
  見(parseFloat(見た目.区切り) > 0, "② 選択肢の あいだに 区切り線", 見た目.区切り);
  見(見た目.送信 === "送信" && parseFloat(見た目.送信の丸み) >= 99, "② 丸い「送信」ボタン", [見た目.送信, 見た目.送信の丸み]);
  見(見た目.送信が押せる === false, "③ 何も 選んでいない うちは 送信できない");
  見(見た目.番号 === "1 / 3", "② 右上に 何問目か", 見た目.番号);

  await page.screenshot({ path: SP + "/planask.png" });

  /* ── ③ 1 つだけの 問。押す → 送信が 押せる → もう一度 押すと 送る ── */
  await page.click('#vqPlanAsk >> nth=0 >> css=button.o[data-i="1"]').catch(async () => {
    await page.evaluate(() => document.getElementById("vqPlanAsk").shadowRoot.querySelector('button.o[data-i="1"]').click());
  });
  await page.waitForTimeout(250);
  const 選 = await page.evaluate(() => {
    const sr = document.getElementById("vqPlanAsk").shadowRoot;
    return { 押: sr.querySelector('button.o[data-i="1"]').getAttribute("aria-pressed"),
             送信: !sr.querySelector('[data-role="ok"]').disabled };
  });
  見(選.押 === "true" && 選.送信, "③ 選ぶと 印が 付き、送信が 押せる", 選);
  await page.evaluate(() => document.getElementById("vqPlanAsk").shadowRoot.querySelector('button.o[data-i="1"]').click());
  await page.waitForTimeout(350);
  const 二 = await page.evaluate(() => {
    const sr = document.getElementById("vqPlanAsk").shadowRoot;
    return { 番号: sr.querySelector(".n").textContent, 説明: sr.querySelector(".mx") ? sr.querySelector(".mx").textContent : "" };
  });
  見(二.番号 === "2 / 3", "③ 同じ ものを もう一度 押すと そのまま 次へ", 二.番号);
  見(/いくつでも/.test(二.説明), "④ multi の 問は「いくつでも 選べます」と 出る", 二.説明);

  /* ── ④ multi: 2 つ 選んで 送信 ── */
  await page.evaluate(() => {
    const sr = document.getElementById("vqPlanAsk").shadowRoot;
    sr.querySelector('button.o[data-i="0"]').click();
    sr.querySelector('button.o[data-i="2"]').click();
  });
  await page.waitForTimeout(200);
  const 複 = await page.evaluate(() => {
    const sr = document.getElementById("vqPlanAsk").shadowRoot;
    return Array.from(sr.querySelectorAll("button.o")).map((b) => b.getAttribute("aria-pressed"));
  });
  見(複.filter((x) => x === "true").length === 2, "④ 2 つ 同時に 選べる", 複);
  await page.evaluate(() => document.getElementById("vqPlanAsk").shadowRoot.querySelector('[data-role="ok"]').click());
  await page.waitForTimeout(300);

  /* ── ⑤ 3 問目は 番号キーで 選ぶ ── */
  await page.keyboard.press("2");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  const 結 = await page.evaluate(() => ({ 答: window.__vqPlanResult, 窓: !!document.getElementById("vqPlanAsk") }));
  console.log("答え:", JSON.stringify(結.答));
  見(!結.窓, "⑤ 全部 答えたら 窓が 閉じる");
  見(Array.isArray(結.答) && 結.答.length === 3, "⑤ 3 問ぶん 返る", 結.答 && 結.答.length);
  見(結.答 && 結.答[0].答え === "日本史", "⑤ 1 問目の 答えが 正しい", 結.答 && 結.答[0]);
  見(結.答 && 結.答[1].答え === "4 択 / 穴埋め", "④ 複数選んだ 答えが まとまる", 結.答 && 結.答[1]);
  見(結.答 && 結.答[2].答え === "20 問", "⑥ 番号キーでも 選べる", 結.答 && 結.答[2]);
  見(例外.length === 0, "⑦ 画面の 例外 0 件", 例外.slice(0, 3));

  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
