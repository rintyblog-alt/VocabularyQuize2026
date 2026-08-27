/* ══════════════════════════════════════════════════════════════════════════
   vqcpu.cjs — **非力な機械**（学校の Surface 等）でどれだけ固まるかを測る。

   訴え:「学校の Surface は重すぎて Chrome ごと固まる」。
   これは 通信ではなく **JS の解析と実行**。溜めても 毎回かかる。

   測るもの:
     ・使えるまで（起動の 1 枚が しまわれるまで）
     ・**主スレッドが 50ms 以上 塞がった回数と 合計**（＝固まっている時間）
     ・いちばん長く塞がった 1 回

   使い方: node vqcpu.cjs [--cpu 20]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 20);

const 見張り = () => {
  window.__C = { 塞ぎ: [], 起動終: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration >= 50) window.__C.塞ぎ.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  } catch (e) {}
  const 見る = () => {
    const b = document.body;
    if (!b) { requestAnimationFrame(見る); return; }
    if (!b.classList.contains("auth-booting")) { window.__C.起動終 = performance.now(); return; }
    const mo = new MutationObserver(() => {
      if (!document.body.classList.contains("auth-booting")) { window.__C.起動終 = performance.now(); mo.disconnect(); }
    });
    mo.observe(b, { attributes: true, attributeFilter: ["class"] });
  };
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
  console.log(`■ CPU ${CPU} 倍遅く（学校の Surface 相当）\n`);
  const t0 = Date.now();
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 300000 });
  await page.waitForFunction(() => window.__C && window.__C.起動終, null, { timeout: 300000 }).catch(() => {});
  const 使え = Date.now() - t0;
  await page.waitForTimeout(8000);
  const d = await page.evaluate(() => {
    const c = window.__C;
    const s = c.塞ぎ.reduce((a, x) => a + x, 0);
    return { 起動終: Math.round(c.起動終), 回数: c.塞ぎ.length, 合計: s, 最長: c.塞ぎ.length ? Math.max(...c.塞ぎ) : 0,
             長い: c.塞ぎ.filter((x) => x >= 1000).sort((a, b2) => b2 - a).slice(0, 6) };
  });
  console.log(`  使えるまで ${使え}ms（画面の中の時計では ${d.起動終}ms）`);
  console.log(`  主スレッドが 塞がった: ${d.回数} 回 / 合計 ${(d.合計 / 1000).toFixed(1)} 秒 / いちばん長い 1 回 ${(d.最長 / 1000).toFixed(1)} 秒`);
  if (d.長い.length) console.log(`  1 秒以上 塞いだもの: ${d.長い.map((x) => (x / 1000).toFixed(1) + "秒").join(", ")}`);
  await b.close();
})();
