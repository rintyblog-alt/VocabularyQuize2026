/* ══════════════════════════════════════════════════════════════════════════
   vqskel.cjs — 「左のパネルからホームへ移ると スケルトンがまじで長い」を測る。

   スケルトン(#vqSkeleton)は #globalLoadingOverlay を映しているだけなので、
   本当に見るべきは **誰が どれだけ長く ローディングを出しているか**。
   ここでは 出ている間ずっと、その時 走っている通信を 記録する。
   使い方: node vqskel.cjs [--遅れ 400]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");
const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const 遅れ = 引("--遅れ", 400), CPU = 引("--cpu", 2);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8791);
const 出力 = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/skel";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };
(async () => {
  const b = await chromium.launch();
  fs.rmSync(出力, { recursive: true, force: true }); fs.mkdirSync(出力, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const 走行 = [];
  await ctx.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()).pathname;
    const t0 = Date.now(); 走行.push({ u, 始: t0 });
    await new Promise((res) => setTimeout(res, 遅れ));
    const rec = 走行.find((x) => x.u === u && !x.終); if (rec) rec.終 = Date.now();
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await ctx.route("**/api/auth/me*", async (r) => {
    await new Promise((res) => setTimeout(res, 遅れ));
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テスト", plan: "free", email: "t@e.com" } }) });
  });
  await ctx.route("**/api/auth/pin/status*", async (r) => {
    await new Promise((res) => setTimeout(res, 遅れ));
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ hasPin: false, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) });
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("app.auth.token.v1", "t"); localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
    } catch (e) {}
    /* ローディングの出入りを その場で控える */
    window.__L = [];
    addEventListener("DOMContentLoaded", () => {
      const ov = document.getElementById("globalLoadingOverlay");
      if (!ov) return;
      let 出 = null;
      const 見 = () => {
        const 隠 = ov.classList.contains("hidden") || ov.classList.contains("liquid-fade-out");
        if (!隠 && 出 === null) 出 = performance.now();
        if (隠 && 出 !== null) { window.__L.push([Math.round(出), Math.round(performance.now() - 出)]); 出 = null; }
      };
      見(); new MutationObserver(見).observe(ov, { attributes: true, attributeFilter: ["class"] });
    });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  console.log(`■ API の返事に ${遅れ}ms / CPU ${CPU} 倍遅く\n`);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(9000);
  const 起動後 = await page.evaluate(() => ({ L: window.__L.slice(), skl: document.body.className.includes("vqskl-on") }));
  console.log("  起動のあいだに ローディングが出ていた回数:", 起動後.L.length);
  起動後.L.forEach(([t, d]) => console.log(`     ${String(t).padStart(6)}ms から ${String(d).padStart(5)}ms`));
  await page.screenshot({ path: path.join(出力, "1-起動直後.png"), timeout: 10000 }).catch(() => {});

  /* 左のパネルから ホームへ移る */
  console.log("\n  ── 左のパネルから ホームへ ──");
  const 押せた = await page.evaluate(() => {
    const 候補 = Array.from(document.querySelectorAll('[data-app-tab="home"], #appTabBar [data-app-tab="home"], a[href="#home"], [data-tab="home"]'))
      .filter((e) => e.getBoundingClientRect().width > 0);
    /* いったん別のタブへ行ってから 戻す（本人の操作と同じ） */
    const 他 = Array.from(document.querySelectorAll('[data-app-tab]'))
      .find((e) => e.getAttribute("data-app-tab") !== "home" && e.getBoundingClientRect().width > 0);
    if (他) 他.click();
    return { 他: !!他, 家: 候補.length };
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__L.length = 0; window.__T0 = performance.now(); });
  const t0 = Date.now();
  await page.evaluate(() => {
    const e = Array.from(document.querySelectorAll('[data-app-tab="home"]')).find((x) => x.getBoundingClientRect().width > 0);
    if (e) e.click();
  });
  /* スケルトンが 出て 消えるまで */
  await page.waitForFunction(() => document.body.classList.contains("vqskl-on"), null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(出力, "2-ホームのスケルトン.png"), timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.body.classList.contains("vqskl-on"), null, { timeout: 60000 }).catch(() => {});
  const 掛かり = Date.now() - t0;
  const 後 = await page.evaluate(() => window.__L.slice());
  console.log(`  タブ: 他=${押せた.他} / ホーム候補=${押せた.家}`);
  console.log(`  ホームへ移ってから スケルトンが消えるまで: ${掛かり}ms`);
  後.forEach(([t, d]) => console.log(`     ローディング ${String(d).padStart(5)}ms`));
  await page.screenshot({ path: path.join(出力, "3-ホーム完成.png"), timeout: 10000 }).catch(() => {});
  console.log("\n  画: " + 出力);
  await b.close();
})();
