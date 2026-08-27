/* 起動中に body の class / 属性が 何回 変わるかを数える。
   class が変わるたび、ブラウザは その配下すべての見た目を 計算し直す。
   要素 7,000・規則 9,000 のこの画面では 1 回が重く、回数が効く。 */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 8), 秒 = 引("--秒", 20);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(() => {
    window.__M = { body: 0, html: 0, 変化: {}, 属性: {} };
    const 見る = () => {
      if (!document.body) { requestAnimationFrame(見る); return; }
      let 前 = document.body.className;
      new MutationObserver((l) => {
        for (const m of l) {
          window.__M.body++;
          const a = m.attributeName || "?";
          window.__M.属性[a] = (window.__M.属性[a] || 0) + 1;
          if (a === "class") {
            const 今 = document.body.className;
            const 旧 = new Set(String(前).split(/\s+/).filter(Boolean));
            const 新 = new Set(String(今).split(/\s+/).filter(Boolean));
            for (const x of 新) if (!旧.has(x)) window.__M.変化["+" + x] = (window.__M.変化["+" + x] || 0) + 1;
            for (const x of 旧) if (!新.has(x)) window.__M.変化["-" + x] = (window.__M.変化["-" + x] || 0) + 1;
            前 = 今;
          }
        }
      }).observe(document.body, { attributes: true });
      new MutationObserver(() => { window.__M.html++; }).observe(document.documentElement, { attributes: true });
    };
    見る();
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 300000 });
  await page.waitForTimeout(秒 * 1000);
  const d = await page.evaluate(() => window.__M);
  const 数 = await page.evaluate(() => ({ 要素: document.querySelectorAll("*").length,
    規則: Array.from(document.styleSheets).reduce((a, s) => { try { return a + s.cssRules.length; } catch (e) { return a; } }, 0) }));
  console.log(`■ CPU ${CPU} 倍遅く / ${秒} 秒 / 要素 ${数.要素} / CSS 規則 ${数.規則}\n`);
  console.log(`  body の属性が変わった回数: ${d.body}（html: ${d.html}）`);
  console.log("  属性ごと: " + Object.entries(d.属性).sort((a, x) => x[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" / "));
  console.log("\n  ── 付け外しされた class（多い順）──");
  Object.entries(d.変化).sort((a, x) => x[1] - a[1]).slice(0, 14)
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(5)} 回  ${k}`));
  await b.close();
})();
