/* 本番を 同じブラウザで 2 回開き、2 回目に **網から取る量**が減ったか見る。 */
const { chromium } = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70,
    downloadThroughput: 12 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
  for (const 回 of [1, 2]) {
    const t0 = Date.now();
    await page.goto(先, { waitUntil: "commit", timeout: 180000 });
    await page.waitForFunction(() => {
      const e = document.getElementById("authBootSplash");
      return e && (e.classList.contains("hidden") || getComputedStyle(e).display === "none");
    }, null, { timeout: 120000 }).catch(() => {});
    const 使え = Date.now() - t0;
    const d = await page.evaluate(() => {
      let 網 = 0, 溜 = 0, 溜件 = 0;
      for (const e of performance.getEntriesByType("resource")) {
        if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) { 溜 += e.decodedBodySize; 溜件++; } else 網 += e.transferSize || 0;
      }
      const n = performance.getEntriesByType("navigation")[0] || {};
      const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
      return { 網: 網 + (n.transferSize || 0), 溜, 溜件, 描画: Math.round(fp ? fp.startTime : 0) };
    });
    console.log(`  ${回}回目: 初描画 ${String(d.描画).padStart(5)}ms  使えるまで ${String(使え).padStart(5)}ms` +
                `  網から ${(d.網 / 1048576).toFixed(2)}MB  溜めから ${(d.溜 / 1048576).toFixed(2)}MB(${d.溜件}件)`);
  }
  await b.close();
})();
