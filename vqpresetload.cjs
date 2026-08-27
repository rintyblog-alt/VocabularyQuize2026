/* 利用者と同じ量（プリセット 794 件・約 3MB）を 端末に入れて、
   起動が どれだけ塞がるかを 測る。「2 回目からガチで重い」の再現。 */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 8), 件 = 引("--件", 794);
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
  /* 1 回目: 空のまま開いて、そのあと 利用者と同じ量を 入れる */
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 300000 });
  await page.evaluate((n) => {
    const 語 = (i) => ({ q: "問題" + i + "の本文です。ある程度の長さを持たせています。", a: "答え" + i,
      choices: ["選択肢A" + i, "選択肢B" + i, "選択肢C" + i, "選択肢D" + i], hint: "手がかり" + i, tags: ["t1", "t2"] });
    const list = [];
    for (let i = 0; i < n; i++) {
      const words = []; for (let k = 0; k < 24; k++) words.push(語(i * 100 + k));
      list.push({ id: "p" + i, name: "プリセット " + i, subjectId: "english", tagIds: ["a", "b"],
        createdAt: Date.now() - i * 1000, updatedAt: Date.now() - i * 1000, words });
    }
    localStorage.setItem("wordPractice400.presets.v1", JSON.stringify(list));
  }, 件);
  const 量 = await page.evaluate(() => Math.round((localStorage.getItem("wordPractice400.presets.v1") || "").length / 1024));
  console.log(`■ CPU ${CPU} 倍遅く / プリセット ${件} 件 = ${量}KB を 端末に入れた\n`);
  for (const 回 of [2, 3]) {
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "commit", timeout: 300000 });
    await page.waitForFunction(() => window.__C && window.__C.起動終, null, { timeout: 300000 }).catch(() => {});
    const 使え = Date.now() - t0;
    await page.waitForTimeout(9000);
    const d = await page.evaluate(() => { const c = window.__C;
      return { 回数: c.塞ぎ.length, 合計: c.塞ぎ.reduce((a, x) => a + x, 0), 最長: c.塞ぎ.length ? Math.max(...c.塞ぎ) : 0 }; });
    console.log(`  ${回}回目  使えるまで ${String(使え).padStart(6)}ms  塞がり ${(d.合計 / 1000).toFixed(1)}秒（${d.回数}回・最長${(d.最長 / 1000).toFixed(1)}秒）`);
  }
  await b.close();
})();
