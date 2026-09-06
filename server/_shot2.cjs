const { chromium } = require("playwright");
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1.5 });
  const err = []; pg.on("pageerror", e => err.push(String(e.message).slice(0,120)));
  await pg.goto("https://www.vocabuquiz.app/site/news", { waitUntil: "networkidle" });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: "_prod_newslist.png" });
  await pg.goto("https://www.vocabuquiz.app/site/news/2026/09/news_v3_release", { waitUntil: "networkidle" });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: "_prod_article.png" });
  const bad = await pg.evaluate(() => Array.from(document.images).filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src));
  console.log("壊れた絵:", bad.length, bad.slice(0,3), "例外:", err);
  await br.close();
})();
