/* 同じブラウザで 2 回開き、2 回目に **本当に溜めから返っているか**を
   Chromium と WebKit（Safari と同じ土台）の 両方で見る。 */
const pw = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
(async () => {
  for (const 名 of ["chromium", "webkit"]) {
    const b = await pw[名].launch();
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    console.log(`\n■ ${名}`);
    for (const 回 of [1, 2]) {
      const t0 = Date.now();
      await page.goto(先, { waitUntil: "load", timeout: 180000 });
      await page.waitForFunction(() => {
        const e = document.getElementById("authBootSplash");
        return e && (e.classList.contains("hidden") || getComputedStyle(e).display === "none");
      }, null, { timeout: 120000 }).catch(() => {});
      const 使え = Date.now() - t0;
      const d = await page.evaluate(() => {
        let 網 = 0, 溜 = 0, 溜件 = 0, 網件 = 0; const 網の大物 = [];
        for (const e of performance.getEntriesByType("resource")) {
          const t = e.transferSize || 0, dz = e.decodedBodySize || 0;
          if (t === 0 && dz > 0) { 溜 += dz; 溜件++; }
          else { 網 += t; 網件++; if (t > 50000) 網の大物.push([Math.round(t / 1024), e.name.replace(location.origin, "")]); }
        }
        const n = performance.getEntriesByType("navigation")[0] || {};
        return { 網: 網 + (n.transferSize || 0), 溜, 溜件, 網件, 網の大物: 網の大物.sort((a, b) => b[0] - a[0]).slice(0, 6) };
      });
      console.log(`  ${回}回目  使えるまで ${String(使え).padStart(5)}ms  網から ${(d.網 / 1048576).toFixed(2)}MB(${d.網件}件)  溜めから ${(d.溜 / 1048576).toFixed(2)}MB(${d.溜件}件)`);
      if (回 === 2 && d.網の大物.length) {
        console.log("     ↳ 2 回目なのに 網から取ったもの:");
        d.網の大物.forEach(([k, n2]) => console.log("        " + String(k).padStart(5) + "KB  " + n2));
      }
    }
    await b.close();
  }
})();
