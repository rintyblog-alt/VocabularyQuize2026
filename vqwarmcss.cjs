/* 溜めが効いている 2 回目に、描画を止めない CSS が **本当に当たるか**。
   media="print" onload="this.media='all'" は、資源が 溜めから 即返ると
   onload の扱いが 変わることがあり、当たらないまま＝素の画面になる。 */
const pw = require("playwright");
const 先 = process.argv[2] || "https://www.vocabuquiz.app";
(async () => {
  for (const 名 of ["chromium", "webkit"]) {
    const b = await pw[名].launch();
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    console.log("\n■ " + 名);
    for (const 回 of [1, 2, 3]) {
      await page.goto(先, { waitUntil: "load", timeout: 180000 });
      await page.waitForTimeout(5000);
      const d = await page.evaluate(() => {
        const ls = Array.from(document.querySelectorAll('link[rel="stylesheet"][href^="/css/"]'));
        const 止 = ls.filter((l) => l.media === "print").map((l) => l.id || l.href.split("/").pop());
        let 当 = 0; for (const ss of Array.from(document.styleSheets)) { try { 当 += ss.cssRules.length; } catch (e) {} }
        let 溜 = 0, 網 = 0;
        for (const e of performance.getEntriesByType("resource")) {
          if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) 溜++; else 網++;
        }
        return { 止, 当, 溜, 網, 地: getComputedStyle(document.body).backgroundColor };
      });
      console.log(`  ${回}回目  規則 ${String(d.当).padStart(5)}  print のまま ${d.止.length} 枚  溜め${d.溜}/網${d.網}  地 ${d.地}` +
                  (d.止.length ? "  ← " + d.止.join(",") : ""));
    }
    await b.close();
  }
})();
