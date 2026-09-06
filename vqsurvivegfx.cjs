#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivegfx.cjs — 絵の 作りと 重さを **数で** 見る。

   訴え（2026-08-31）「重くならない、グラフィック、マップのクオリティ」

   ★ 前の 測り方では 何も 分からなかった:
     手元の Mac で 60fps に 張り付くだけ。**遅い 端末を 作って 測る。**
     ここでは CPU を 6 倍 遅く し、画素も 2 倍に して 測る。

   見るもの:
     ① 後処理（にじみ・階調）が 本当に 効いているか
     ② 弱い 端末で **動く 解像度**が 効いて コマを 守るか
     ③ 1 コマの 中央値が 目安の 中に 入るか
     ④ 描き回数・面の数が 増えすぎて いないか
     ⑤ 例外 0 件

   使い方: node vqsurvivegfx.cjs [--コース 12]
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 測りません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
const 引数 = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const コース = Number(引数("--コース", "12"));

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 300) : "")); }
};

async function 走らせる(opt) {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: opt.vp, hasTouch: !!opt.touch });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  const cdp = await ctx.newCDPSession(pg);
  if (opt.slow > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: opt.slow });
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
  await 待(1600);
  await pg.evaluate((c) => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const cc = r.querySelectorAll(".vs-lb-cc"); if (cc[c]) cc[c].click(); }, opt.course);
  await 待(700);
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 90000 });
  await 待(1200);
  await pg.evaluate(() => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const c = r.querySelector(".vs-help-card"); if (c) { const b = c.querySelectorAll("button"); if (b.length) b[b.length - 1].click(); } });
  await 待(opt.warm || 6000);

  const コマ = await pg.evaluate(() => new Promise((res) => {
    const ts = []; let n = 0, last = performance.now();
    function step(t) { ts.push(t - last); last = t; if (++n < 200) requestAnimationFrame(step); else res(ts.slice(30)); }
    requestAnimationFrame(step);
  }));
  コマ.sort((a, b) => a - b);
  const q = (v) => Math.round(コマ[Math.floor(コマ.length * v)] * 10) / 10;
  const 出 = await pg.evaluate(() => {
    const A = window.VocabuSurvive.__app, ms = A.shell.get("match");
    return { tier: A.settings.tier, 後処理: ms.renderer.postInfo(), 解像度: ms.renderer.dynInfo(),
             描き: ms.renderer.stats, 板: { w: ms.canvas.width, h: ms.canvas.height } };
  });
  await browser.close();
  return Object.assign(出, { 中央: q(0.5), p95: q(0.95), 例外 });
}

(async () => {
  console.log("測る先:", BASE, " コース:", コース);

  節("① 机の上（等倍）");
  const a = await 走らせる({ vp: { width: 1440, height: 900 }, slow: 1, course: コース });
  console.log("   ", JSON.stringify({ 中央: a.中央, p95: a.p95, 板: a.板, 描き: a.描き, 解像度: a.解像度 }));
  見(a.後処理.on, "★ 後処理が 効いている", a.後処理);
  見(a.後処理.bloom, "にじみの 板が 作れている");
  見(a.中央 <= 20, "1 コマの 中央値が 20ms 以内", a.中央);
  見(a.描き.draws <= 60, "描き回数が 60 回 以内", a.描き.draws);
  見(a.例外.length === 0, "例外 0 件", a.例外.slice(0, 2));

  節("② 弱い 端末（CPU 6 倍 遅い・スマホの 幅）");
  const b = await 走らせる({ vp: { width: 390, height: 844 }, touch: true, slow: 6, course: コース, warm: 9000 });
  console.log("   ", JSON.stringify({ 中央: b.中央, p95: b.p95, 板: b.板, 解像度: b.解像度 }));
  見(b.解像度.on, "動く 解像度が 入っている", b.解像度);
  見(b.中央 <= 42, "★ 弱い 端末でも 1 コマ 42ms 以内（24fps）", b.中央);
  見(b.例外.length === 0, "例外 0 件", b.例外.slice(0, 2));

  節("③ 動く 解像度が **本当に** 動くか（目安を わざと 厳しく する）");
  {
    /* ★ 手元の Mac では 6 倍 遅く しても 60fps に 張り付く（GPU は 速い まま）。
       それでは 「動く 解像度」が 効くか 確かめられない。
       目安を わざと 4ms（250fps）に して、仕組みが 追随するかを 見る。
       **効くふりを させない ため の 段。** */
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const pg = await ctx.newPage();
    const 例外 = [];
    pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
    await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
      for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
        const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
    await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
    await 待(1500);
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 90000 });
    await 待(1200);
    await pg.evaluate(() => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const c = r.querySelector(".vs-help-card"); if (c) { const b = c.querySelectorAll("button"); if (b.length) b[b.length - 1].click(); } });
    await 待(2500);
    const 前 = await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match");
      return { scale: ms.renderer.dyn.scale, w: ms.canvas.width, h: ms.canvas.height }; });
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.renderer.dyn.budget = 4; });
    await 待(6000);
    const 後 = await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match");
      return { scale: ms.renderer.dyn.scale, w: ms.canvas.width, h: ms.canvas.height, info: ms.renderer.dynInfo() }; });
    /* 戻す（上げるのは 遅い ので、下限に 張り付いた ままに ならない ことだけ 見る） */
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.renderer.dyn.budget = 1000 / 60; });
    await 待(15000);
    const 戻 = await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match");
      return { scale: ms.renderer.dyn.scale, w: ms.canvas.width }; });
    見(後.scale < 前.scale - 0.04, "★ 目安を 厳しく すると 画素を 減らす", { 前: 前.scale, 後: 後.scale });
    見(後.w < 前.w, "板が 実際に 小さく なる", { 前: 前.w, 後: 後.w });
    見(後.scale >= 0.62 - 1e-6, "下限（0.62）より 下げない", 後.scale);
    見(戻.scale > 後.scale, "★ 目安を 戻すと 画素も 戻る", { 底: 後.scale, 戻: 戻.scale });
    見(例外.length === 0, "例外 0 件", 例外.slice(0, 2));
    await browser.close();
  }

  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
