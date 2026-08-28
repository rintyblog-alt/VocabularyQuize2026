/* ══════════════════════════════════════════════════════════════════════════
   vqdocdesign.cjs — **書類（Docs / Sheets / Forms）の 見た目**が
   毎回 変わるか、そして **中身が 壊れていない**かを 実物で 見る。

   訴え（2026-08-29）:
     「スライド／ワード／エクセル／フォームの デザインが 毎回 同じ。
       Lumi が 作るように して（大まかな 型は そのままで よい）」

   見るところ:
     ① docDesign の 口（WP.cmd.見た目.決める）が 使える
     ② 呼ぶと 画面に style が 1 枚 入り、印（data-vqdesign）が 付く
     ③ 見出しの 色が **変わる**（前と ちがう）
     ④ かたまりの 数・文は **1 つも 変わらない**（中身を 触らない）
     ⑤ 2 回 呼ぶと 2 回とも ちがう 見た目に なる

   使い方: VQ_TOKEN=<札> node vqdocdesign.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const SP = process.env.SP || ".";

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const 訴 = [];
  page.on("pageerror", (e) => 訴.push(String(e.message).slice(0, 160)));
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 220) : "")); if (!ok) 落++; };

  /* ── 文書を 作って 中身を 入れる ── */
  const 作 = await page.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    const r = await Promise.resolve(K.ファイル.作る({ kind: "document", title: "見た目の 検査" }));
    await new Promise((s) => setTimeout(s, 1200));
    const w = K.docs.まとめて({ blocks: [
      { type: "heading1", text: "遠足の しおり" },
      { type: "paragraph", text: "9 時に 学校の 正門へ 集まります。" },
      { type: "table", header: true, rows: [["時刻", "すること"], ["9:00", "集合"], ["9:30", "出発"]] },
      { type: "callout", text: "雨のときは 体育館に 集まります。" }
    ], replace: true });
    await new Promise((s) => setTimeout(s, 800));
    return { 作: !!r, 書: JSON.stringify(w).slice(0, 160), 口: !!(K.見た目 && K.見た目.決める) };
  });
  console.log("下ごしらえ:", JSON.stringify(作));
  見(作.口, "① docDesign の 口が ある");

  const 読む = () => page.evaluate(() => {
    const host = document.getElementById("vq-wp-docs");
    const sh = host && host.shadowRoot;
    if (!sh) return { 無い: true };
    const 紙 = sh.querySelector(".wpd-page");
    const h1 = sh.querySelector(".wpd-doc h1, .wpd-b[data-type='heading1'] .wpd-b__c");
    const th = sh.querySelector(".wpd-tbl th");
    const 印 = sh.querySelector('[data-vqdesign="1"]');
    const 札 = sh.querySelector('style[data-vqdoc]');
    const g = (e) => e ? getComputedStyle(e) : null;
    const 文 = 紙 ? String(紙.innerText || "").replace(/\s+/g, " ").trim() : "";
    return {
      印: !!印, 札: !!札, 札の長さ: 札 ? 札.textContent.length : 0,
      見出し色: h1 ? g(h1).color : "", 見出し書体: h1 ? g(h1).fontFamily.slice(0, 40) : "",
      紙の地: 紙 ? g(紙).backgroundColor : "", 表の見出し: th ? g(th).backgroundColor : "",
      かたまり数: 紙 ? 紙.querySelectorAll(".wpd-b, .wpd-doc > *").length : 0,
      文: 文.slice(0, 120)
    };
  });

  const 前 = await 読む();
  console.log("前:", JSON.stringify(前));

  const 出1 = await page.evaluate(() => window.VQ2.workplace.cmd.見た目.決める({ hue: 120, scheme: "analogous", mode: "light", fontPair: 5, accent: "block", background: "gradient" }));
  await page.waitForTimeout(900);
  const 後1 = await 読む();
  console.log("後1:", JSON.stringify(後1));
  console.log("返り:", JSON.stringify(出1).slice(0, 320));

  見(後1.印 && 後1.札, "② 画面に style が 入り 印が 付く");
  見(後1.見出し色 !== 前.見出し色, "③ 見出しの 色が 変わった", { 前: 前.見出し色, 後: 後1.見出し色 });
  見(前.かたまり数 > 0, "④-0 検査そのものが 中身を 見えている（かたまり " + 前.かたまり数 + " 個）");
  見(後1.かたまり数 === 前.かたまり数 && 後1.文 === 前.文,
     "④ 中身は 1 文字も 変わっていない", { 前: [前.かたまり数, 前.文], 後: [後1.かたまり数, 後1.文] });

  const 出2 = await page.evaluate(() => window.VQ2.workplace.cmd.見た目.決める({ hue: 15, scheme: "complementary", mode: "high_contrast", fontPair: 12, accent: "rule", background: "plain" }));
  await page.waitForTimeout(900);
  const 後2 = await 読む();
  console.log("後2:", JSON.stringify(後2));
  見(後2.見出し色 !== 後1.見出し色, "⑤ もう一度 呼ぶと また 変わる", { 1: 後1.見出し色, 2: 後2.見出し色 });
  見(後2.かたまり数 === 前.かたまり数 && 後2.文 === 前.文, "⑥ 2 回 呼んでも 中身は そのまま",
     { 前: 前.文, 後: 後2.文 });

  /* 案内の 覆いを どけてから 撮る（写しで 見た目を 確かめたい） */
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((h) => {
      if (!h.shadowRoot) return;
      const b = Array.from(h.shadowRoot.querySelectorAll("button"))
        .find((x) => /あとで|閉じる|スキップ/.test(x.textContent || ""));
      if (b) b.click();
    });
    /* 案内の 器ごと どける（中の 文で 見分ける） */
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: SP + "/doc-design.png" });
  if (訴.length) console.log("画面の 例外:", 訴.slice(0, 5));
  見(訴.length === 0, "⑦ 画面の 例外 0 件", 訴.slice(0, 3));
  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
