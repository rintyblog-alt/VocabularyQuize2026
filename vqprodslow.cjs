/* 本番を **利用者の回線条件**で開いて、1 回目 / 2 回目 を測る（読むだけ）。 */
const { chromium } = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MBPS = 引("--mbps", 1.2), CPU = 引("--cpu", 4);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(() => {
    window.__S = {};
    const 見る = () => {
      const bd = document.body;
      if (!bd) { requestAnimationFrame(見る); return; }
      if (!bd.classList.contains("auth-booting")) { window.__S.起動終 = performance.now(); return; }
      const mo = new MutationObserver(() => {
        if (!document.body.classList.contains("auth-booting")) { window.__S.起動終 = performance.now(); mo.disconnect(); }
      });
      mo.observe(bd, { attributes: true, attributeFilter: ["class"] });
    };
    見る();
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120,
    downloadThroughput: MBPS * 1024 * 1024 / 8, uploadThroughput: 0.5 * 1024 * 1024 / 8 });
  console.log(`■ ${先}  回線 ${MBPS}Mbps・往復 240ms / CPU ${CPU} 倍遅く\n`);
  for (const 回 of [1, 2]) {
    await page.goto(先, { waitUntil: "commit", timeout: 300000 });
    await page.waitForFunction(() => window.__S && window.__S.起動終, null, { timeout: 300000 }).catch(() => {});
    /* ★ ここで次へ進むと、まだ落とし終えていないものが 次の回に回り、
       「2 回目のほうが 網から取る量が多い」という 嘘の数字になる（実際になった）。
       読み終わり（load）＋ 落ち着くまで 待ってから 次へ行く。 */
    await page.waitForLoadState("load", { timeout: 300000 }).catch(() => {});
    await page.waitForFunction(() => {
      const es = performance.getEntriesByType("resource");
      const t = performance.now();
      return es.length > 20 && es.every((e) => e.responseEnd > 0) && t - Math.max(...es.map((e) => e.responseEnd)) > 2500;
    }, null, { timeout: 300000, polling: 500 }).catch(() => {});
    const d = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] || {};
      const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
      let 網 = 0, 溜 = 0, 件 = 0;
      for (const e of performance.getEntriesByType("resource")) {
        件++; const t = e.transferSize || 0, dz = e.decodedBodySize || 0;
        if (t === 0 && dz > 0) 溜 += dz; else 網 += t;
      }
      return { 描画: Math.round(fp ? fp.startTime : 0), 起動終: Math.round(window.__S.起動終 || 0),
               網: 網 + (n.transferSize || 0), 溜, 件: 件 + 1 };
    });
    console.log(`  ${回}回目  初描画 ${String(d.描画).padStart(6)}ms   使えるまで ${String(d.起動終).padStart(6)}ms` +
                `   網から ${(d.網 / 1048576).toFixed(2)}MB   溜めから ${(d.溜 / 1048576).toFixed(2)}MB   ${d.件} 件`);
  }
  await b.close();
})();
