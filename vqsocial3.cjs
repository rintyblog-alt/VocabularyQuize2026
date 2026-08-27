/* XSS 耐性・他タブの回帰・スマホ表示をまとめて確かめる。 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";

async function openTab(pg, tab) {
  await pg.evaluate((t) => { const b = document.querySelector(`[data-app-tab="${t}"]`); if (b) b.click(); }, tab);
  await pg.waitForTimeout(1600);
}

(async () => {
  const b = await chromium.launch({ headless: true });

  /* ── PC ── */
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; let alerted = false;
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 140)));
  pg.on("dialog", async (d) => { alerted = true; await d.dismiss(); });
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(4000);

  await openTab(pg, "news");
  await pg.waitForTimeout(1500);
  const xss = await pg.evaluate(async () => {
    const cards = [...document.querySelectorAll("#appNewsGrid [data-news-id]")];
    const target = cards.find((c) => /タイトル検査/.test(c.textContent || ""));
    if (!target) return { found: false, titles: cards.map((c) => (c.textContent || "").slice(0, 30)) };
    const titleEl = target.querySelector(".app-news-card-title");
    const titleHtml = titleEl ? titleEl.innerHTML : "";
    target.click();
    await new Promise((r) => setTimeout(r, 1600));
    const body = document.getElementById("appNewsDetailBody");
    return {
      found: true,
      /* 一覧のタイトル: タグが文字として出ているか（要素になっていないか） */
      titleHasImgEl: !!(titleEl && titleEl.querySelector("img")),
      titleEscaped: /&lt;img/.test(titleHtml),
      /* 詳細の本文 */
      bodyHasScriptEl: !!(body && body.querySelector("script")),
      bodyHasBoldEl: !!(body && body.querySelector("b")),
      bodyEscaped: !!(body && /&lt;script&gt;/.test(body.innerHTML)),
      bodyParas: body ? body.querySelectorAll("p").length : -1
    };
  });
  console.log("XSS 検査:", JSON.stringify(xss, null, 1), "／ alert が出たか:", alerted);

  /* 他タブの回帰 */
  const tabs = ["inbox", "notifications", "insight", "home", "library"];
  const reg = {};
  for (const t of tabs) {
    await openTab(pg, t);
    reg[t] = await pg.evaluate(() => ({
      tab: document.body.getAttribute("data-app-tab"),
      visible: [...document.querySelectorAll(".app-tab-page")]
        .filter((el) => getComputedStyle(el).display !== "none").map((el) => el.id)
    }));
  }
  console.log("タブ回帰:", JSON.stringify(reg));
  await openTab(pg, "news");
  await pg.screenshot({ path: "shots/social/pc-news.png" });
  await openTab(pg, "inbox");
  await pg.screenshot({ path: "shots/social/pc-feed.png" });

  /* 横スクロールが出ていないか */
  const pcOverflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("PC 横はみ出し:", pcOverflow, "px");
  await pg.close();

  /* ── スマホ ── */
  const iph = await b.newContext({ ...devices["iPhone 13"] });
  const mp = await iph.newPage();
  const merrs = [];
  mp.on("pageerror", (e) => merrs.push(String(e.message).slice(0, 120)));
  await mp.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await mp.waitForTimeout(4000);
  await openTab(mp, "news");
  await mp.waitForTimeout(1500);
  const m = await mp.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cards: document.querySelectorAll("#appNewsGrid [data-news-id]").length,
    gridCols: (() => { const g = document.getElementById("appNewsGrid");
      return g ? getComputedStyle(g).gridTemplateColumns : ""; })(),
    chipsScroll: (() => { const f = document.getElementById("appNewsFilters");
      return f ? getComputedStyle(f).overflowX : ""; })()
  }));
  console.log("スマホ News:", JSON.stringify(m));
  await mp.screenshot({ path: "shots/social/sp-news.png" });
  await openTab(mp, "insight");
  await mp.waitForTimeout(1200);
  const mi = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("スマホ Insight 横はみ出し:", mi, "px");
  await mp.screenshot({ path: "shots/social/sp-insight.png" });
  console.log("PC の JS エラー:", errs.length ? errs.slice(0, 4) : "なし");
  console.log("スマホの JS エラー:", merrs.length ? merrs.slice(0, 4) : "なし");
  await b.close();
})();
