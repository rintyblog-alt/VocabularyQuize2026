/* 1 回目に 何を どれだけ 取りに行っているかを 種類ごとに数える（読むだけ）。 */
const { chromium } = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.goto(先, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(8000);
  const d = await page.evaluate(() => {
    const es = performance.getEntriesByType("resource");
    const 種 = {};
    for (const e of es) {
      let k = e.initiatorType || "?";
      const u = e.name;
      if (/\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(u)) k = "画像";
      else if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) k = "書体";
      else if (/\.(m4a|wav|mp3)(\?|$)/i.test(u)) k = "音";
      else if (/\/api\//.test(u)) k = "API";
      else if (/\.js(\?|$)/i.test(u)) k = "JS";
      else if (/\.css(\?|$)/i.test(u) || /fonts\.googleapis/.test(u)) k = "CSS";
      種[k] = 種[k] || { 件: 0, 網: 0, 時: 0 };
      種[k].件++; 種[k].網 += e.transferSize || 0; 種[k].時 = Math.max(種[k].時, Math.round(e.responseEnd));
    }
    const 遅い = es.slice().sort((a, b) => (b.responseEnd - b.startTime) - (a.responseEnd - a.startTime)).slice(0, 10)
      .map((e) => [Math.round(e.responseEnd - e.startTime), Math.round((e.transferSize || 0) / 1024), e.name.replace(location.origin, "").slice(0, 78)]);
    const n = performance.getEntriesByType("navigation")[0] || {};
    const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
    return { 種, 遅い, 件: es.length, 描画: Math.round(fp ? fp.startTime : 0), DCL: Math.round(n.domContentLoadedEventEnd || 0), 読了: Math.round(n.loadEventEnd || 0) };
  });
  console.log(`  ${先}`);
  console.log(`  初描画 ${d.描画}ms / DCL ${d.DCL}ms / 読み終わり ${d.読了}ms / 取りに行った件数 ${d.件}`);
  console.log("\n  種類ごと:");
  Object.entries(d.種).sort((a, b) => b[1].網 - a[1].網).forEach(([k, v]) =>
    console.log(`    ${k.padEnd(6)} ${String(v.件).padStart(4)} 件  ${(v.網 / 1048576).toFixed(2)}MB  最後に届いた ${v.時}ms`));
  console.log("\n  1 件あたり 時間のかかったもの:");
  d.遅い.forEach(([t, k, u]) => console.log(`    ${String(t).padStart(5)}ms ${String(k).padStart(5)}KB  ${u}`));
  await b.close();
})();
