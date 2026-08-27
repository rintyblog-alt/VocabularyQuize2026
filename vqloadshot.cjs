/* 新しいロード画面を、実際のブラウザで見る。
   起動スプラッシュ（#authBootSplash）と処理中（#globalLoadingOverlay）の両方。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = "shots/loading";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const dev of [{ n: "pc", w: 1440, h: 900 }, { n: "sp", w: 390, h: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h },
      deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });

    /* アプリ側の初期化が落ち着いてから開く。
       クラスだけ外すと JS がすぐ戻すので、インラインで表示を固定する。 */
    await pg.waitForTimeout(2500);
    await pg.evaluate(() => {
      /* 初回のオンボーディング（z 999999）がロード画面の上に出るので退ける */
      ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate"].forEach((id) => {
        const e = document.getElementById(id);
        if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
      });
      const s = document.getElementById("authBootSplash");
      s.classList.remove("hidden", "liquid-fade-out");
      s.style.setProperty("display", "flex", "important");
      /* アニメーションを頭から流し直す */
      s.querySelectorAll(".vqload-svg,.vqload-ring,.vqload-v,.vqload-tail,.vqload-sheen,.vqload-rosette,.vqload-orbit,.liquid-loading-text,.liquid-loading-sub,.liquid-loading-dots,.liquid-loading-dots span")
        .forEach((e) => { e.style.animation = "none"; e.offsetHeight; e.style.animation = ""; });
    });
    /* 途中（描いている最中）と、落ち着いたあと */
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(OUT, dev.n + "-boot-mid.png") });
    await pg.waitForTimeout(1800);
    await pg.screenshot({ path: path.join(OUT, dev.n + "-boot-idle.png") });

    /* 処理中のほう */
    await pg.evaluate(() => {
      const s = document.getElementById("authBootSplash");
      s.style.removeProperty("display");
      s.classList.add("hidden");
      const g = document.getElementById("globalLoadingOverlay");
      g.classList.remove("hidden");
      g.style.setProperty("display", "flex", "important");
      const t = document.getElementById("globalLoadingText");
      if (t) t.textContent = "試験を作っています…";
    });
    await pg.waitForTimeout(2200);
    await pg.screenshot({ path: path.join(OUT, dev.n + "-global.png") });

    /* 動いているか（2 枚の差分で見る） */
    const a = await pg.screenshot();
    await pg.waitForTimeout(900);
    const b = await pg.screenshot();
    const moving = Buffer.compare(a, b) !== 0;

    const info = await pg.evaluate(() => {
      const svg = document.querySelector("#globalLoadingOverlay .vqload-svg");
      const ring = document.querySelector("#globalLoadingOverlay .vqload-ring");
      const cs = ring ? getComputedStyle(ring) : null;
      const box = svg ? svg.getBoundingClientRect() : null;
      return {
        svg: !!svg,
        描画サイズ: box ? Math.round(box.width) + "×" + Math.round(box.height) : null,
        リボンの色: cs ? cs.stroke : null,
        横はみ出し: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      };
    });
    console.log("[" + dev.n + "] " + JSON.stringify(info) + " / 動いている: " + moving
      + " / JS エラー: " + (errs.length ? errs.join(" / ") : "なし"));
    await ctx.close();
  }
  await browser.close();
})();
