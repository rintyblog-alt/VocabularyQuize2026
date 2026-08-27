/* FEED のリスキンと通知の一括既読を、実画面で確かめる。 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
async function openTab(pg, t) {
  await pg.evaluate((x) => { const b = document.querySelector(`[data-app-tab="${x}"]`); if (b) b.click(); }, t);
  await pg.waitForTimeout(1500);
}
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 140)));
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(4000);

  await openTab(pg, "inbox");
  const feed = await pg.evaluate(() => {
    /* 実際に描かれている値を読む（CSS が効いているかを数で見る） */
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el);
      return { radius: c.borderRadius, border: c.borderColor, shadow: c.boxShadow.slice(0, 40), bg: c.backgroundColor };
    };
    const fab = document.querySelector(".app-feed-fab");
    return {
      card: probe("#appFeedList .app-feed-card") || probe(".app-feed-card"),
      chip: probe(".app-feed-filter-chip") || probe(".app-feed-chip"),
      actionBtn: probe(".app-feed-action-btn"),
      fabZ: fab ? getComputedStyle(fab).zIndex : null,
      composeShell: probe(".app-feed-compose-inline")
    };
  });
  console.log("FEED の見た目:", JSON.stringify(feed, null, 1));

  await openTab(pg, "notifications");
  const nt = await pg.evaluate(() => {
    const btn = document.getElementById("appInboxMarkAllBtn");
    return { markAllBtn: !!btn, label: btn ? btn.textContent.trim() : null,
             clickable: btn ? !btn.disabled : null };
  });
  console.log("通知:", JSON.stringify(nt));
  if (nt.markAllBtn) {
    await pg.evaluate(() => document.getElementById("appInboxMarkAllBtn").click());
    await pg.waitForTimeout(2000);
    const after = await pg.evaluate(() => ({
      label: document.getElementById("appInboxMarkAllBtn").textContent.trim(),
      badgeHidden: (() => { const b = document.querySelector("[data-news-badge]");
        return b ? b.classList.contains("hidden") : null; })()
    }));
    console.log("一括既読のあと:", JSON.stringify(after));
  }

  const ov = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("PC 横はみ出し:", ov, "px");
  await pg.close();

  /* スマホ：投稿ボタンが下部ナビと重ならないか */
  const iph = await b.newContext({ ...devices["iPhone 13"] });
  const mp = await iph.newPage();
  const merrs = [];
  mp.on("pageerror", (e) => merrs.push(String(e.message).slice(0, 120)));
  await mp.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await mp.waitForTimeout(4000);
  await openTab(mp, "inbox");
  const m = await mp.evaluate(() => {
    const fab = document.querySelector(".app-feed-fab");
    const nav = document.querySelector(".app-mobile-nav, .vq-mobile-nav, [data-mobile-nav], nav.app-bottom-nav");
    const fr = fab ? fab.getBoundingClientRect() : null;
    const nr = nav ? nav.getBoundingClientRect() : null;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fab: fr ? { bottom: Math.round(innerHeight - fr.bottom), right: Math.round(innerWidth - fr.right) } : null,
      nav: nr ? { top: Math.round(nr.top), h: Math.round(nr.height) } : null,
      overlap: (fr && nr) ? (fr.bottom > nr.top) : null
    };
  });
  console.log("スマホ FEED:", JSON.stringify(m));
  await mp.screenshot({ path: "shots/social/sp-feed.png" });
  console.log("PC の JS エラー:", errs.length ? errs.slice(0, 3) : "なし");
  console.log("スマホの JS エラー:", merrs.length ? merrs.slice(0, 3) : "なし");
  await b.close();
})();
