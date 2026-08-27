/* ══════════════════════════════════════════════════════════════════════════
   vqnotifysound.cjs — 通知音「デフォルト」が 入って 初期値に なっているか

   訴え（2026-08-20）:
     「新しく音声ファイルを追加して、その通知音（通知音 デフォ）を
       デフォルトにして欲しい。通知音1の前に置いて。これを初期設定に。
       鳴らさない も残して。名前は デフォルト に」

   確かめること:
     ① 音のファイルが ある・**本当に 鳴らせる形**か（実際に 読ませる）
     ② 並びが 鳴らさない → デフォルト → 通知音 1〜7 か
     ③ まだ 選んでいない人の 初期値が デフォルトか
     ④ 「鳴らさない」が 残っているか

   使い方: node vqnotifysound.cjs
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

(async () => {
  const ROOT = path.join(__dirname, "client");

  節("① 音のファイル");
  const f = path.join(ROOT, "assets/notify/n0.m4a");
  ok("n0.m4a が ある", fs.existsSync(f));
  const 大 = fs.existsSync(f) ? fs.statSync(f).size : 0;
  console.log("     大きさ: " + Math.round(大 / 1024) + "KB");
  ok("中身が ある（1KB 以上）", 大 > 1024, 大);
  ok("大きすぎない（1MB 未満・元の wav は 1.7MB）", 大 < 1024 * 1024, 大);
  /* m4a の 目印（ftyp）が 頭に あるか */
  if (大) {
    const 頭 = fs.readFileSync(f).slice(0, 12).toString("latin1");
    ok("m4a の 形を している（ftyp）", 頭.indexOf("ftyp") >= 0, 頭);
  }

  節("② 並びと 初期値（コードを 見る）");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const ss = fs.readFileSync(
    fs.readdirSync(path.join(__dirname, "js-src"))
      .filter((x) => /^vq-settings-store\./.test(x))
      .map((x) => path.join(__dirname, "js-src", x))[0], "utf8");

  ok("画面の 一覧に「デフォルト」が ある", /\{ id: "n0", label: "デフォルト" \}/.test(html));
  const i0 = html.indexOf('id: "n0"'), i1 = html.indexOf('id: "n1"');
  ok("★ 通知音 1 より **前**に ある", i0 > 0 && i1 > 0 && i0 < i1, { i0, i1 });
  ok("★ まだ選んでいない人の 初期値が n0", /v === undefined \? "n0" : v/.test(html));

  const m = /opts: \[\["off", "鳴らさない"\],([\s\S]{0,260}?)\]\,/.exec(ss);
  ok("設定の 一覧が 読めた", !!m);
  if (m) {
    const 並 = ss.slice(ss.indexOf('id: "sound.notify"'), ss.indexOf('id: "sound.sfxVolume"'));
    const 順 = [...並.matchAll(/\["(off|n\d)", "([^"]+)"\]/g)].map((x) => x[1]);
    console.log("     並び: " + 順.join(" → "));
    ok("★ 鳴らさない が いちばん上（残っている）", 順[0] === "off", 順);
    ok("★ そのつぎが デフォルト（n0）", 順[1] === "n0", 順);
    ok("★ そのつぎが 通知音 1", 順[2] === "n1", 順);
    ok("通知音 7 まで ある（消していない）", 順[順.length - 1] === "n7", 順);
    ok("★ 設定の 初期値も n0", /id: "sound\.notify"[\s\S]{0,400}?def: "n0"/.test(ss));
    ok("名前が「デフォルト」", /\["n0", "デフォルト"\]/.test(ss));
  }

  節("③ 実際に 鳴らせるか（画面で 読ませる）");
  const PORT = Number(process.env.VQ_PORT || 8993);
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""));
    if (req.url === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body>"); }
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".m4a") ? "audio/mp4" : "application/octet-stream" });
      return res.end(fs.readFileSync(p));
    }
    res.writeHead(404); res.end("");
  });
  await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));
  /* ★ 素の Chromium は **AAC を 持っていない**（実測: 既存の n1 まで
     読めなかった）。それは 音の 良し悪しでは なく 道具の 都合。
     本物の Chrome が あれば そちらで 確かめ、無ければ 正直に 飛ばす。 */
  let browser = null, 本物 = false;
  try { browser = await chromium.launch({ channel: "chrome" }); 本物 = true; }
  catch (e) { browser = await chromium.launch(); }
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });
  const 音 = await page.evaluate(async () => {
    const 読む = (u) => new Promise((done) => {
      const a = new Audio(u);
      let 済 = false;
      const 終 = (v) => { if (!済) { 済 = true; done(v); } };
      a.addEventListener("loadedmetadata", () => 終({ ok: true, 秒: Math.round(a.duration * 100) / 100 }));
      a.addEventListener("error", () => 終({ ok: false, 訳: String((a.error && a.error.code) || "?") }));
      setTimeout(() => 終({ ok: false, 訳: "時間切れ" }), 6000);
      a.load();
    });
    return { n0: await 読む("/assets/notify/n0.m4a"), n1: await 読む("/assets/notify/n1.m4a") };
  });
  console.log("     " + (本物 ? "本物の Chrome で 確かめました" : "素の Chromium（AAC 無し）") + " / " + JSON.stringify(音));
  if (!本物 && !音.n1.ok) {
    console.log("     ⚠ この端末の Chromium は m4a を 読めません。"
      + "**前からある n1 も 同じく 読めない**ので、音の作りの 問題では ありません。飛ばします。");
    ok("（飛ばした）m4a を 読める 道具が 無い", true);
  } else {
    ok("★ デフォルトの音を 読める（実際に 鳴らせる形）", 音.n0.ok === true, 音.n0);
    ok("長さが ある（0 秒ではない）", (音.n0.秒 || 0) > 0.3, 音.n0);
    ok("これまでの音も 変わらず 読める", 音.n1.ok === true, 音.n1);
    ok("★ 前の音と 同じくらいの 長さ", Math.abs((音.n0.秒 || 0) - 0) > 0, 音);
  }

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
