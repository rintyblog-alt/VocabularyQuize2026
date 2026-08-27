/* FEED / Insight / News の「いま」を見る。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const TABS = [["inbox","FEED"],["insight","Insight"],["news","News"],["notifications","通知"]];
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display","none","important"); }
    });
    /* 未ログインだと #app が display:none。見た目を見るために外す。
       データは空のままなので、そこは別に確かめる必要がある。 */
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const app = document.getElementById("app");
    if (app) app.style.setProperty("display", "block", "important");
  });
  for (const [tab, name] of TABS) {
    const clicked = await pg.evaluate((t) => {
      const b = document.querySelector('.app-tab-btn[data-app-tab="' + t + '"]');
      if (b) { b.click(); return true; }
      document.body.setAttribute("data-app-tab", t);
      return false;
    }, tab);
    await pg.waitForTimeout(1400);
    await pg.screenshot({ path: "shots/social/" + tab + ".png" });
    const info = await pg.evaluate((t) => {
      const page = document.querySelector("#app" + t.charAt(0).toUpperCase() + t.slice(1) + "Page")
                || document.querySelector('[data-app-page="' + t + '"]');
      const vis = page ? getComputedStyle(page).display !== "none" : false;
      const txt = page ? (page.innerText || "").replace(/\s+/g," ").slice(0,110) : "";
      return { ページ: !!page, 表示: vis, 中身: txt };
    }, tab);
    console.log(name.padEnd(9) + " tab切替=" + clicked + " " + JSON.stringify(info, null, 0).slice(0, 190));
  }
  console.log("JS エラー: " + (errs.length ? errs.slice(0,3).join(" / ") : "なし"));
  await b.close();
})();
