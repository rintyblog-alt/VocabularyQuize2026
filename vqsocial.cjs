/* FEED / News / Insight / 通知 の移植後の確認（ブラウザ実機）。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 140)));
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(4500);

  const r = await pg.evaluate(async () => {
    const out = {};
    /* News の API 層が入っているか */
    out.newsApi = {
      load: typeof _appNewsLoad === "function",
      markRead: typeof _appNewsMarkRead === "function",
      badge: typeof _appNewsUpdateBadge === "function",
      apiBase: typeof _apiBase === "function" ? _apiBase() : null,
      localStorageLeft: !!localStorage.getItem("app_news_custom")
    };
    /* 実際に取ってみる */
    try {
      const items = await _appNewsLoad({ force: true });
      out.newsLoaded = { count: items.length, unread: _appNewsUnread,
                         first: items[0] ? { cat: items[0].category, important: items[0].important,
                                             read: items[0].read, fromApi: items[0].fromApi } : null };
    } catch (e) { out.newsLoaded = { err: String(e.message) }; }
    /* ナビ */
    const tabs = [...document.querySelectorAll("[data-app-tab]")].map((el) => ({
      tab: el.getAttribute("data-app-tab"),
      label: (el.querySelector(".app-tab-btn-label-text") || {}).textContent || "",
      tip: el.getAttribute("data-sidebar-tooltip")
    })).filter((t) => ["inbox", "news", "insight", "notifications"].includes(t.tab));
    out.nav = tabs;
    out.newsBadge = !!document.querySelector("[data-news-badge]");
    /* 自動更新の仕掛け */
    out.poll = { bound: !!window.__vqNotifAutoBound,
                 refresh: typeof _vqNotifRefreshQuiet === "function",
                 stop: typeof _vqNotifStopPolling === "function" };
    /* スキン */
    out.skin = !!document.getElementById("vq-social-skin");
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log("JS エラー:", errs.length ? errs.slice(0, 5) : "なし");
  await b.close();
})();
