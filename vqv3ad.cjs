/* V3 広告ページの検証と撮影。

   ・?record=1&t=X&paused=1 で各シーンの静止画を撮る（PC / モバイル）
   ・JS エラーが無いこと
   ・録画の再現性（同じ t で 2 回撮って画素が一致すること）
   ・実再生での FPS

   実行: node vqv3ad.cjs [shots|fps|all]
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://127.0.0.1:8791/v3-ad/index.html";
const OUT = path.join(__dirname, "artifacts", "v3ad");
const MODE = process.argv[2] || "all";

/* 各シーンの「一番良い瞬間」を狙う */
const TIMES = [3.5, 8, 13, 18, 20.5, 26, 31, 35.5, 41, 45, 47.5, 54, 60, 63.5, 71, 75.5, 80, 84, 88.5];

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ── 静止画（PC）── */
  if (MODE === "shots" || MODE === "all") {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    console.log("\n══ 静止画（1600×900）══");
    for (const t of TIMES) {
      await pg.goto(`${BASE}?record=1&t=${t}&paused=1`, { waitUntil: "load", timeout: 30000 });
      await pg.waitForTimeout(900);
      const name = `pc-${String(t).replace(".", "_")}s.png`;
      await pg.screenshot({ path: path.join(OUT, name) });
      process.stdout.write("  " + name + "\n");
    }
    ok("PC 全時刻で JS エラーなし", errs.length === 0, errs.slice(0, 3).join(" / "));
    await ctx.close();

    /* ── モバイル ── */
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
    const mpg = await mctx.newPage();
    const merrs = [];
    mpg.on("pageerror", (e) => merrs.push(String(e).slice(0, 200)));
    console.log("\n══ 静止画（390×844）══");
    for (const t of [8, 15, 31, 44, 60, 72, 85]) {
      await mpg.goto(`${BASE}?record=1&t=${t}&paused=1`, { waitUntil: "load", timeout: 30000 });
      await mpg.waitForTimeout(900);
      const name = `sp-${String(t).replace(".", "_")}s.png`;
      await mpg.screenshot({ path: path.join(OUT, name) });
      /* 横スクロールが生まれていないか */
      const oflow = await mpg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (oflow > 2) ok(`モバイル ${t}s: 横はみ出しなし`, false, oflow + "px はみ出し");
      process.stdout.write("  " + name + "\n");
    }
    ok("モバイル全時刻で JS エラーなし", merrs.length === 0, merrs.slice(0, 3).join(" / "));
    await mctx.close();

    /* ── 再現性: 同じ t を 2 回 ── */
    console.log("\n══ 再現性 ══");
    const rctx = await browser.newContext({ viewport: { width: 800, height: 450 }, ignoreHTTPSErrors: true });
    const rpg = await rctx.newPage();
    const bufs = [];
    for (let i = 0; i < 2; i++) {
      await rpg.goto(`${BASE}?record=1&t=45&paused=1`, { waitUntil: "load", timeout: 30000 });
      await rpg.waitForTimeout(1200);
      bufs.push(await rpg.screenshot());
    }
    /* PNG のバイト一致は GPU 合成のディザで揺れる（実測 3 バイト差）。
       中身で比べる: ブラウザで両方を描いて、違う画素の割合を数える。 */
    const diffRatio = await rpg.evaluate(async ([a, b]) => {
      function load(u) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = u; }); }
      const A = await load("data:image/png;base64," + a), B = await load("data:image/png;base64," + b);
      const c1 = document.createElement("canvas"), c2 = document.createElement("canvas");
      c1.width = c2.width = A.width; c1.height = c2.height = A.height;
      const g1 = c1.getContext("2d"), g2 = c2.getContext("2d");
      g1.drawImage(A, 0, 0); g2.drawImage(B, 0, 0);
      const d1 = g1.getImageData(0, 0, A.width, A.height).data;
      const d2 = g2.getImageData(0, 0, A.width, A.height).data;
      let bad = 0;
      for (let i = 0; i < d1.length; i += 4) {
        if (Math.abs(d1[i] - d2[i]) > 2 || Math.abs(d1[i+1] - d2[i+1]) > 2 || Math.abs(d1[i+2] - d2[i+2]) > 2) bad++;
      }
      return bad / (d1.length / 4);
    }, [bufs[0].toString("base64"), bufs[1].toString("base64")]);
    ok("同じ時刻の 2 回撮影がほぼ一致（録画安定）", diffRatio < 0.0005,
       "違う画素 " + (diffRatio * 100).toFixed(4) + "%");
    await rctx.close();
  }

  /* ── FPS ── */
  if (MODE === "fps" || MODE === "all") {
    console.log("\n══ FPS（実再生 12 秒 × 3 区間）══");
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
    const pg = await ctx.newPage();
    for (const t0 of [2, 40, 79]) {
      await pg.goto(`${BASE}?record=1&t=${t0}`, { waitUntil: "load", timeout: 30000 });
      await pg.waitForTimeout(500);
      const fps = await pg.evaluate(() => new Promise((res) => {
        let n = 0; const start = performance.now();
        function f() { n++; if (performance.now() - start < 6000) requestAnimationFrame(f); else res(n / 6); }
        requestAnimationFrame(f);
      }));
      console.log(`  t=${t0}s から 6 秒: ${Math.round(fps)} fps`);
      ok(`t=${t0}s 帯で 30fps 以上`, fps >= 30, Math.round(fps) + " fps");
    }
    await ctx.close();
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n記録: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
