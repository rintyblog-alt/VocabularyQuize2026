/* 1 回目と 2 回目で 何が違うかを 測る。
   ・端末に溜めている量（localStorage）
   ・主スレッドが 塞がる時間
   2 回目が重いなら、**溜めたものを 読み直す処理**が犯人。 */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 8);
const 見張り = () => {
  window.__C = { 塞ぎ: [], 起動終: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration >= 50) window.__C.塞ぎ.push(Math.round(e.duration)); })
    .observe({ type: "longtask", buffered: true }); } catch (e) {}
  const 見る = () => { const b = document.body;
    if (!b) { requestAnimationFrame(見る); return; }
    if (!b.classList.contains("auth-booting")) { window.__C.起動終 = performance.now(); return; }
    const mo = new MutationObserver(() => { if (!document.body.classList.contains("auth-booting")) { window.__C.起動終 = performance.now(); mo.disconnect(); } });
    mo.observe(b, { attributes: true, attributeFilter: ["class"] }); };
  見る();
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(見張り);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  console.log(`■ CPU ${CPU} 倍遅く\n`);
  for (const 回 of [1, 2, 3]) {
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "commit", timeout: 300000 });
    await page.waitForFunction(() => window.__C && window.__C.起動終, null, { timeout: 300000 }).catch(() => {});
    const 使え = Date.now() - t0;
    await page.waitForTimeout(9000);
    const d = await page.evaluate(() => {
      const c = window.__C;
      let 量 = 0, 件 = 0; const 大物 = [];
      try { for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); const v = localStorage.getItem(k) || "";
        量 += k.length + v.length; 件++;
        if (v.length > 20000) 大物.push([Math.round(v.length / 1024), k]);
      } } catch (e) {}
      大物.sort((a, x) => x[0] - a[0]);
      return { 塞ぎ回: c.塞ぎ.length, 塞ぎ合計: c.塞ぎ.reduce((a, x) => a + x, 0), 最長: c.塞ぎ.length ? Math.max(...c.塞ぎ) : 0,
               量, 件, 大物: 大物.slice(0, 8) };
    });
    console.log(`  ${回}回目  使えるまで ${String(使え).padStart(6)}ms  塞がり ${(d.塞ぎ合計 / 1000).toFixed(1)}秒（${d.塞ぎ回}回・最長${(d.最長 / 1000).toFixed(1)}秒）` +
                `  端末の保存 ${(d.量 / 1048576).toFixed(2)}MB / ${d.件} 件`);
    if (回 === 3 && d.大物.length) { console.log("     ↳ 大きい保存:"); d.大物.forEach(([k, n]) => console.log(`        ${String(k).padStart(6)}KB  ${n}`)); }
  }
  await b.close();
})();
