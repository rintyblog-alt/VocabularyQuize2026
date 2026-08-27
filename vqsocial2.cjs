/* 画面から実際に操作して確かめる（内部関数を直接呼ばない）。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; const apiCalls = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 140)));
  pg.on("request", (r) => { const u = r.url(); if (/\/api\/news\//.test(u)) apiCalls.push(r.method() + " " + u.replace(BASE, "")); });

  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(4000);

  /* News タブへ移動（アプリのタブ機構をそのまま使う） */
  const moved = await pg.evaluate(() => {
    const btn = document.querySelector('[data-app-tab="news"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await pg.waitForTimeout(2500);

  const r = await pg.evaluate(() => {
    const grid = document.getElementById("appNewsGrid");
    const filters = document.getElementById("appNewsFilters");
    const cards = grid ? [...grid.querySelectorAll("[data-news-id]")] : [];
    return {
      tabOpened: document.body.getAttribute("data-app-tab"),
      newsPageVisible: !!document.getElementById("appNewsPage")
        && getComputedStyle(document.getElementById("appNewsPage")).display !== "none",
      cardCount: cards.length,
      skeletons: grid ? grid.querySelectorAll(".is-skeleton").length : -1,
      filterChips: filters ? filters.querySelectorAll("[data-news-cat]").length : -1,
      firstCard: cards[0] ? {
        title: (cards[0].querySelector(".app-news-card-title") || {}).textContent || "",
        cat: (cards[0].querySelector(".app-news-card-cat") || {}).textContent || "",
        important: !!cards[0].querySelector(".app-news-flag"),
        hasFade: cards[0].classList.contains("app-fadein")
      } : null,
      emptyText: grid && grid.querySelector(".app-news-empty")
        ? grid.querySelector(".app-news-empty").textContent.trim().slice(0, 40) : null
    };
  });
  console.log("News タブ:", JSON.stringify(r, null, 1));
  console.log("News API 呼び出し:", apiCalls.length ? apiCalls : "（なし）");

  /* 記事を開く */
  if (r.cardCount > 0) {
    await pg.evaluate(() => document.querySelector("#appNewsGrid [data-news-id]").click());
    await pg.waitForTimeout(1800);
    const d = await pg.evaluate(() => {
      const body = document.getElementById("appNewsDetailBody");
      return {
        detailShown: !document.getElementById("appNewsDetail").classList.contains("hidden"),
        title: (document.getElementById("appNewsDetailTitle") || {}).textContent || "",
        bodyParas: body ? body.querySelectorAll("p").length : -1,
        bodyHasRawHtml: body ? /<script|<img|onerror=/i.test(body.innerHTML) : null,
        linkShown: !document.getElementById("appNewsDetailLink").classList.contains("hidden")
      };
    });
    console.log("記事詳細:", JSON.stringify(d, null, 1));
    console.log("詳細の API:", apiCalls.filter((x) => /item/.test(x)));
  }
  await pg.screenshot({ path: "shots/social/news.png" });
  console.log("JS エラー:", errs.length ? errs.slice(0, 4) : "なし");
  await b.close();
})();
