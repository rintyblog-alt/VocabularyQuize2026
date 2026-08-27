/* 実際に開いて、起動のあいだに 網へ出た回数を 行き先ごとに数える（読むだけ）。 */
const { chromium } = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
const 秒 = Number(process.argv[3] || 15);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const 数 = new Map(); let 全 = 0; const 状態 = new Map();
  page.on("response", (r) => {
    const u = r.url();
    if (!/\/api\//.test(u)) return;
    const k = new URL(u).pathname;
    数.set(k, (数.get(k) || 0) + 1); 全++;
    状態.set(k, r.status());
  });
  const t0 = Date.now();
  await page.goto(先, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(秒 * 1000);
  console.log(`  ${先}  （開いてから ${秒} 秒間）`);
  console.log(`  サーバへ頼んだ回数: ${全} 回 / ${数.size} 種類`);
  const 並 = [...数.entries()].sort((a, b) => b[1] - a[1]);
  並.slice(0, 14).forEach(([u, n]) => console.log(`    ${String(n).padStart(4)} 回  [${状態.get(u)}]  ${u}`));
  const 無駄 = 並.reduce((a, [, n]) => a + Math.max(0, n - 1), 0);
  console.log(`  → うち 同じものの繰り返し: ${無駄} 回`);
  await b.close();
})();
