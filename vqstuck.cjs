/* 「.app が display:none のまま、覆いも無い」＝ 薄い地色の空白画面 が
   どこかで 起きないかを 通しで見る（起動 → ログイン → 暗証番号 → ホーム）。 */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const 遅れ = 引("--遅れ", 600), CPU = 引("--cpu", 2);
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/api/**", async (r) => { await new Promise((s) => setTimeout(s, 遅れ)); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await ctx.route("**/api/auth/me*", async (r) => { await new Promise((s) => setTimeout(s, 遅れ));
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free", email: "t@e.com" } }) }); });
  await ctx.route("**/api/auth/pin/status*", async (r) => { await new Promise((s) => setTimeout(s, 遅れ));
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hasPin: true, pinVerified: false, needsPin: false, needsEmail: false, needsConsent: false }) }); });
  await ctx.addInitScript(() => {
    window.__K = { 空: [], 最長: 0 };
    let 前 = false, 始 = 0;
    const 見る = () => {
      const app = document.querySelector(".app");
      const 中身無い = !app || getComputedStyle(app).display === "none" || app.getBoundingClientRect().height < 40;
      const 覆い = ["authBootSplash", "vqPinCover", "vqPin", "vqNewAuth", "firstLaunchOverlay", "globalLoadingOverlay", "vqSkeleton"]
        .some((id) => { const e = document.getElementById(id); if (!e) return false;
          const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.3 && e.getBoundingClientRect().height > 40; });
      const 空 = 中身無い && !覆い;
      const t = performance.now();
      if (空 && !前) 始 = t;
      if (!空 && 前) { const d = t - 始; if (d > 60) { window.__K.空.push(Math.round(d)); window.__K.最長 = Math.max(window.__K.最長, Math.round(d)); } }
      前 = 空;
      requestAnimationFrame(見る);
    };
    requestAnimationFrame(見る);
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  console.log(`■ API の返事に ${遅れ}ms / CPU ${CPU} 倍遅く\n`);
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(6000);
  const A = await page.evaluate(() => window.__K.最長);
  ok(`起動の間に 空白の画面が 出ない（最長 ${A}ms）`, A < 250, A);
  /* ログインする（本物と同じ順番） */
  await page.evaluate(() => {
    localStorage.setItem("app.auth.token.v1", "t"); localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
    try { document.documentElement.classList.remove("vqna-showing"); } catch (e) {}
    const h = document.getElementById("vqNewAuth"); if (h) h.style.display = "none";
    try { document.body.classList.remove("auth-gate-open", "first-launch-open"); } catch (e) {}
  });
  await page.waitForTimeout(6000);
  const B = await page.evaluate(() => window.__K.最長);
  ok(`ログイン後も 空白の画面が 出ない（最長 ${B}ms）`, B < 250, B);
  const 状態 = await page.evaluate(() => ({
    body: document.body.className.slice(0, 70),
    app: (() => { const a = document.querySelector(".app"); return a ? getComputedStyle(a).display : "無"; })(),
    覆い: document.getElementById("vqPinCover") ? getComputedStyle(document.getElementById("vqPinCover")).display : "無",
    pin: (() => { const p = document.getElementById("vqPin"); return p ? getComputedStyle(p).display : "無"; })()
  }));
  console.log("  いまの状態:", JSON.stringify(状態));
  ok("body に auth-booting が 残っていない", !/auth-booting/.test(状態.body), 状態.body);
  await b.close();
  console.log("\n" + "═".repeat(50));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  console.log("═".repeat(50));
  process.exit(fail ? 1 : 0);
})();
