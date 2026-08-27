const { chromium, devices } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/social", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
async function skipIntro(pg) {
  for (let i = 0; i < 6; i++) {
    const done = await pg.evaluate(() => {
      const t = [...document.querySelectorAll("button,a")]
        .find((b) => /スキップ|はじめる|閉じる|Skip/.test((b.textContent || "").trim()));
      if (t) { t.click(); return false; }
      return true;
    });
    await pg.waitForTimeout(700);
    if (done) break;
  }
}
async function openTab(pg, t) {
  await pg.evaluate((x) => { const b = document.querySelector(`[data-app-tab="${x}"]`); if (b) b.click(); }, t);
  await pg.waitForTimeout(1600);
}
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1440, height: 950 } });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.evaluate(() => { try { localStorage.setItem("vq.onboarding_done", "1"); } catch (e) {} });
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(4500);
  await skipIntro(pg);
  /* ログインしてから見る（News はアプリ内の画面） */
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const g = document.getElementById("authLoginGrade");
    const n = document.getElementById("authLoginNickname");
    const p = document.getElementById("authLoginPassword");
    const b = document.getElementById("authLoginSubmitBtn");
    if (!g || !n || !p || !b) return false;
    setV(g, c.grade); setV(n, c.nick); setV(p, c.pw); b.click(); return true;
  }, { grade: "H3", nick: "tester", pw: "Abcd1234" });
  await pg.waitForTimeout(6000);
  await openTab(pg, "news");
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: "shots/social/pc-news.png" });
  const seen = await pg.evaluate(() => {
    const g = document.getElementById("appNewsGrid");
    const r = g ? g.getBoundingClientRect() : null;
    return { visible: !!r && r.height > 0 && r.top < innerHeight, cards: g ? g.children.length : 0 };
  });
  console.log("News 画面:", JSON.stringify(seen));
  await b.close();
})();
