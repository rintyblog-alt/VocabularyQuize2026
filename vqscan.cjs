/* ══════════════════════════════════════════════════════════════════════════
   vqscan.cjs — スキャンモードが **本当に 使えるか**

   訴え（2026-08-20）:
     「スキャンしてって 言っても イマイチ スキャンされてない。
       あらかじめ スキャンモードみたいなのを 作って、そこで 何枚かを
       スキャンし、PDF・写真も まとめられるといい。
       スキャンされた内容は、そこから ボードに まとめられるように。
       または ゲームにするとか。または 問題プリセットを 作成したりも。」

   芯:
     **読めたかどうかが 目で 見えること。**「読めたつもり」を なくす。

   使い方: node vqscan.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

function 読む(名) {
  const d = path.join(__dirname, process.env.VQ_MIN ? "client/js" : "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  if (!f) throw new Error(名 + " が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}
/* 1×1 の JPEG（データ URL） */
const 点 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL"
  + "DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAA"
  + "AAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

(async () => {
  節("① 部品が 束に 入っているか");
  const 束 = 読む("bundle-core");
  const ライブ = 読む("vq-live");
  ok("スキャンの部品が 束に ある", /VQSCAN/.test(束));
  ok("カメラの帯に スキャンのボタン", /data-a="scan"/.test(ライブ));
  /* ★ 圧縮すると 変数名は 変わり、日本語は \uXXXX（大文字）に なる。
     生／小文字／大文字の 3 通りで 探す（本番の中身も 確かめられるように）。 */
  const esc = (x, up) => [...x].map((c) => {
    const h = c.charCodeAt(0).toString(16).padStart(4, "0");
    return c.charCodeAt(0) < 128 ? c : "\\u" + (up ? h.toUpperCase() : h);
  }).join("");
  const ある = (s2, t) => s2.includes(t) || s2.includes(esc(t)) || s2.includes(esc(t, 1));
  ok("声からも 開ける（道具）", ある(ライブ, '"scanMode"'));
  ok("板で 動かす口が ある", ある(ライブ, "アプリ:"));
  const w = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  ok("サーバに 道具が 宣言されている", /fn\("scanMode"/.test(w));
  ok("撮れたふりを させない と 書いてある", /撮れたふりを しないでください/.test(w));

  const PORT = Number(process.env.VQ_PORT || 8992);
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><meta charset=utf-8><title>scan</title><body>");
  });
  await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    localStorage.setItem("app.auth.token.v1", "t");
    window.__送り先 = [];
    window.__板 = null; window.__アプリ = null;
    window.__vqLive = {
      板: function (t, md) { window.__板 = { t, md }; return { 出した: true }; },
      アプリ: function (t, c) { window.__アプリ = { t, c }; return Promise.resolve({ やった: 1 }); }
    };
    window.fetch = function (u, o) {
      const url = String(u || "");
      let body = {}; try { body = JSON.parse(String((o && o.body) || "{}")); } catch (e) {}
      window.__送り先.push({ url, body });
      if (url.indexOf("/api/scan/read") >= 0) {
        const 仕 = String(body.task || "");
        if (仕 === "ocr") return Promise.resolve({ ok: true, json: () => Promise.resolve({
          ok: true, text: "理科プリント\n光合成は 葉緑体で おこなわれる。", model: "gemini" }) });
        if (仕 === "board") return Promise.resolve({ ok: true, json: () => Promise.resolve({
          ok: true, text: "```markdown\n# 光合成\n\n- 葉緑体\n```" }) });
        if (仕 === "game") return Promise.resolve({ ok: true, json: () => Promise.resolve({
          ok: true, text: "```html\n<div id=g>ゲーム</div>```" }) });
      }
      if (url.indexOf("/api/aigen/questions") >= 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          ok: true, questions: [{ question: "光合成は どこで？" }, { question: "何を 出す？" }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    /* カメラは 無い（頭の無いブラウザ）。**無くても 使えること**を 確かめたい。 */
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("NotAllowedError"));
  });
  await page.addScriptTag({ content: 束 });
  await page.waitForTimeout(150);

  節("② 開く・カメラが 無くても 使える");
  const 開 = await page.evaluate(async () => {
    window.VQSCAN.開く({});
    await new Promise((r) => setTimeout(r, 400));
    const host = document.querySelector("[data-vqscan]");
    const sr = host && host.shadowRoot;
    return { 出た: !!sr,
             断り: sr ? (sr.querySelector(".nocam") || {}).textContent || "" : "",
             撮るが押せない: sr ? !!(sr.querySelector(".shot") || {}).disabled : null,
             足すがある: sr ? !!sr.querySelector("[data-add]") : false,
             読むが押せない: sr ? !!(sr.querySelector("[data-read]") || {}).disabled : null };
  });
  ok("スキャンの画面が 出る", 開.出た === true, 開);
  ok("★ カメラが 無くても 断りを 出す（黙って 死なない）", /カメラを 使えません/.test(開.断り), 開.断り);
  ok("撮るボタンは 押せなくなる", 開.撮るが押せない === true, 開);
  ok("★ それでも 写真・PDF は 足せる", 開.足すがある === true, 開);
  ok("紙が 0 枚なら 読み取れない", 開.読むが押せない === true, 開);

  節("③ 何枚でも 溜められる・消せる");
  const 枚 = await page.evaluate(async (点) => {
    for (let i = 0; i < 3; i++) window.VQSCAN._足す({ 種: "写真", 名: "紙" + (i + 1), dataUrl: 点, mime: "image/jpeg" });
    window.VQSCAN._足す({ 種: "PDF", 名: "べつの資料.pdf", dataUrl: "data:application/pdf;base64,AA==", mime: "application/pdf" });
    await new Promise((r) => setTimeout(r, 120));
    const sr = document.querySelector("[data-vqscan]").shadowRoot;
    const 前 = { 枚: window.VQSCAN.枚数(), 札: sr.querySelectorAll(".pg").length,
                 読み: (sr.querySelector("[data-read]") || {}).textContent,
                 pdf: !!sr.querySelector(".pg .pdf") };
    sr.querySelector('[data-del="1"]').click();
    await new Promise((r) => setTimeout(r, 120));
    return { 前, 後: { 枚: window.VQSCAN.枚数(), 札: sr.querySelectorAll(".pg").length } };
  }, 点);
  console.log("     " + JSON.stringify(枚));
  ok("★ 4 枚 溜まる（写真 3 + PDF 1）", 枚.前.枚 === 4 && 枚.前.札 === 4, 枚.前);
  ok("PDF も 並ぶ", 枚.前.pdf === true, 枚.前);
  ok("枚数が ボタンに 出る", /4 枚/.test(枚.前.読み || ""), 枚.前);
  ok("★ 1 枚 消せる", 枚.後.枚 === 3 && 枚.後.札 === 3, 枚.後);
  const 先 = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 500));
    const sr = document.querySelector("[data-vqscan]").shadowRoot;
    return { OCR: window.__送り先.filter((x) => x.url.indexOf("/api/scan/read") >= 0 && (x.body || {}).task === "ocr").length,
             済の印: sr.querySelectorAll(".pg .mk .ok").length };
  });
  console.log("     " + JSON.stringify(先));
  ok("★ **撮った そばから 読み始める**（押す前に もう 読めている）", 先.OCR >= 2, 先);
  ok("読めた紙に ✓ が つく", 先.済の印 >= 2, 先);

  節("④ 読み取り —— **中身が 目で 見える**");
  const 読 = await page.evaluate(async () => {
    const sr = document.querySelector("[data-vqscan]").shadowRoot;
    sr.querySelector("[data-read]").click();
    await new Promise((r) => setTimeout(r, 900));
    const 出 = window.VQSCAN.取り出す();
    return { 文: 出.文, 見出し: 出.見出し,
             画面: (sr.querySelector(".txt") || {}).textContent || "",
             行き先: [...sr.querySelectorAll("[data-go]")].map((b) => b.getAttribute("data-go")),
             OCRを何回: window.__送り先.filter((x) => x.url.indexOf("/api/scan/read") >= 0 && (x.body || {}).task === "ocr").length };
  });
  console.log("     OCR " + 読.OCRを何回 + " 回 / 見出し「" + 読.見出し + "」");
  /* ★ 先読みを 入れたので、消した紙も 1 回 読んでいることが ある。
     大事なのは **1 枚を 二度 読まない**ことと **PDF を 送らない**こと。 */
  ok("★ 1 枚を 二度 読まない（足した写真 3 枚まで）", 読.OCRを何回 <= 3 && 読.OCRを何回 >= 2, 読);
  ok("★ 残っている写真の ぶんだけ 中身が 出る",
     (読.文.match(/枚目】/g) || []).length === 2, 読.文.slice(0, 160));
  ok("★ 読めた中身が **画面に 出る**", /光合成/.test(読.画面), 読.画面.slice(0, 80));
  ok("PDF は そのまま AI へ と 断る", /PDF は そのまま/.test(読.文), 読.文.slice(0, 120));
  ok("見出しを 拾う", 読.見出し === "理科プリント", 読.見出し);
  ok("★ 行き先が 3 つ 出る", 読.行き先.join(",") === "board,quiz,game", 読.行き先);

  節("⑤ ボードにまとめる");
  const 板 = await page.evaluate(async () => {
    const sr = document.querySelector("[data-vqscan]").shadowRoot;
    sr.querySelector('[data-go="board"]').click();
    await new Promise((r) => setTimeout(r, 700));
    const 送 = window.__送り先.filter((x) => x.url.indexOf("/api/scan/read") >= 0 && (x.body || {}).task === "board").pop();
    const 資 = ((送 || {}).body || {}).images || [];
    return { 板: window.__板, 資料の数: 資.length,
             形: 資.map(function (x) { return /^data:image\//.test(String(x)) ? "image" : "?"; }),
             閉じた: !document.querySelector("[data-vqscan]") };
  });
  console.log("     " + JSON.stringify(板).slice(0, 200));
  ok("★ 板に まとめて 出す", !!(板.板 && /光合成/.test(板.板.md)), 板.板);
  ok("``` の 囲みを 外している", !!(板.板 && !/```/.test(板.板.md)), 板.板);
  ok("見出しを 引き継ぐ", !!(板.板 && 板.板.t === "理科プリント"), 板.板);
  ok("資料（写真）も 一緒に 渡す", 板.資料の数 === 2, 板);
  ok("★★ 画像を そのまま 送っている（data:image/…）",
     板.形.length > 0 && 板.形.every(function (x) { return x === "image"; }), 板.形);
  ok("★ 出したら スキャン画面は 閉じる", 板.閉じた === true, 板);

  節("⑥ 問題を作る・ゲームにする");
  const 他 = await page.evaluate(async (点) => {
    window.VQSCAN.開く({});
    await new Promise((r) => setTimeout(r, 250));
    window.VQSCAN._足す({ 種: "写真", 名: "紙", dataUrl: 点, mime: "image/jpeg" });
    const sr = document.querySelector("[data-vqscan]").shadowRoot;
    sr.querySelector("[data-read]").click();
    await new Promise((r) => setTimeout(r, 600));
    sr.querySelector('[data-go="quiz"]').click();
    await new Promise((r) => setTimeout(r, 600));
    const q = window.__送り先.filter((x) => x.url.indexOf("/api/aigen/questions") >= 0).pop();
    const 問 = { 送った: !!q, 資料: ((q || {}).body || {}).files ? q.body.files.length : 0,
                 画面: (sr.querySelector(".txt") || {}).textContent || "",
                 残すボタン: !!sr.querySelector("[data-save]") };
    const 戻 = sr.querySelector("[data-back]");
    問.戻るがある = !!戻;
    問.見えている = (sr.querySelector(".sheet .head h1") || {}).textContent || "";
    if (戻) 戻.click();
    await new Promise((r) => setTimeout(r, 200));
    問.戻ったら撮る画面 = !sr.querySelector(".sheet");
    /* もう一度 押す。同じ紙なので **読み直さない**はず。 */
    const 前回 = window.__送り先.filter((x) => x.url.indexOf("/api/scan/read") >= 0 && (x.body || {}).task === "ocr").length;
    sr.querySelector("[data-read]").click();
    await new Promise((r) => setTimeout(r, 400));
    問.読み直した = window.__送り先.filter((x) => x.url.indexOf("/api/scan/read") >= 0 && (x.body || {}).task === "ocr").length - 前回;
    sr.querySelector('[data-go="game"]').click();
    await new Promise((r) => setTimeout(r, 700));
    return { 問, ゲーム: window.__アプリ };
  }, 点);
  console.log("     " + JSON.stringify(他).slice(0, 240));
  ok("★ 問題の口へ 送る", 他.問.送った === true, 他.問);
  ok("資料を 画像のまま 渡す", 他.問.資料 === 1, 他.問);
  ok("できた問題が 画面に 出る", /光合成は どこで/.test(他.問.画面), 他.問.画面);
  ok("プリセットとして残す ボタンが 出る", 他.問.残すボタン === true, 他.問);
  ok("戻ると 撮る画面へ もどる", 他.問.戻ったら撮る画面 === true, 他.問);
  ok("★ 同じ紙なら **読み直さない**（枠と 時間を 使わない）", 他.問.読み直した === 0, 他.問);
  ok("★ ゲームも 板で 動かす", !!(他.ゲーム && /<div id=g>/.test(他.ゲーム.c)), 他.ゲーム);

  節("⑦ 例外が 出ていない");
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 3));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
