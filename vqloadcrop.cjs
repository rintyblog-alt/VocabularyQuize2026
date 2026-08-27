/* アイコンだけを大きく撮る（見比べやすくするため） */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 700 },
    deviceScaleFactor: 3 })).newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display","none","important"); }
    });
    const s = document.getElementById("authBootSplash");
    s.classList.remove("hidden","liquid-fade-out");
    s.style.setProperty("display","flex","important");
  });
  await pg.waitForTimeout(2600);
  const el = await pg.$("#authBootSplash .vqload-mark");
  await el.screenshot({ path: "shots/loading/icon-idle.png" });
  /* 描いている途中も */
  await pg.evaluate(() => {
    const s = document.getElementById("authBootSplash");
    s.querySelectorAll("*").forEach((e) => { e.style.animation = "none"; e.offsetHeight; e.style.animation = ""; });
  });
  await pg.waitForTimeout(560);
  await el.screenshot({ path: "shots/loading/icon-drawing.png" });
  await b.close();
})();
