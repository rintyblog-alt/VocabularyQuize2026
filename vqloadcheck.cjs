/* 新しいロード画面が、実際に描かれて・動いて・消えるかを確かめる。 */
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const openSplash = async (pg) => pg.evaluate(() => {
  ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display","none","important"); }
  });
  const s = document.getElementById("authBootSplash");
  s.classList.remove("hidden","liquid-fade-out");
  s.style.setProperty("display","flex","important");
});

(async () => {
  const browser = await chromium.launch({ headless: true });

  /* ── 1) 描かれるか ─────────────────────────────── */
  console.log("== 線が順に描かれる ==");
  {
    const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
    await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2200);
    await openSplash(pg);
    /* アニメーションを頭から流し直して、途中と最後を測る */
    const samples = await pg.evaluate(async () => {
      const root = document.getElementById("authBootSplash");
      const el = root.querySelector(".vqload-ring--a");
      const v  = root.querySelector(".vqload-v");
      root.querySelectorAll(".vqload-svg,.vqload-ring,.vqload-v,.vqload-tail")
        .forEach((e) => { e.style.animation = "none"; void e.offsetHeight; e.style.animation = ""; });
      const read = () => ({
        ring: parseFloat(getComputedStyle(el).strokeDashoffset),
        v: parseFloat(getComputedStyle(v).strokeDashoffset)
      });
      const out = [];
      out.push(read());
      await new Promise((r) => setTimeout(r, 400)); out.push(read());
      await new Promise((r) => setTimeout(r, 1400)); out.push(read());
      return out;
    });
    ok("最初は線が引かれていない", samples[0].ring > 200, JSON.stringify(samples[0]));
    ok("途中まで引かれている", samples[1].ring > 1 && samples[1].ring < samples[0].ring,
       JSON.stringify(samples[1]));
    ok("最後は引き切っている", samples[2].ring < 1, JSON.stringify(samples[2]));
    ok("V も引き切っている", samples[2].v < 1, JSON.stringify(samples[2]));
    ok("JS エラーなし", errs.length === 0, errs.join(" / "));
    await pg.context().close();
  }

  /* ── 2) 動き続けるか（止まって見えないか）─────────── */
  console.log("\n== 止まらずに動き続ける ==");
  {
    const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2200);
    await openSplash(pg);
    await pg.waitForTimeout(2600);          /* 入場が終わったあと */
    const a = await pg.screenshot(); await pg.waitForTimeout(1200);
    const b = await pg.screenshot(); await pg.waitForTimeout(1200);
    const c = await pg.screenshot();
    ok("入場後も絵が変わり続ける", Buffer.compare(a, b) !== 0 && Buffer.compare(b, c) !== 0);
    await pg.context().close();
  }

  /* ── 3) 消えるか（既存の JS 経路を壊していないか）───── */
  console.log("\n== 消え方（既存の liquid-fade-out）==");
  {
    const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2200);
    await openSplash(pg);
    await pg.waitForTimeout(800);
    const r = await pg.evaluate(async () => {
      const s = document.getElementById("authBootSplash");
      s.classList.add("liquid-fade-out");
      await new Promise((x) => setTimeout(x, 250));
      const mid = getComputedStyle(s).opacity;
      await new Promise((x) => setTimeout(x, 300));
      return { mid: parseFloat(mid), end: parseFloat(getComputedStyle(s).opacity),
               pe: getComputedStyle(s).pointerEvents };
    });
    ok("薄くなっていく", r.mid < 1, JSON.stringify(r));
    ok("最後は透明になる", r.end < 0.05, JSON.stringify(r));
    ok("消えている間は操作を受けない", r.pe === "none", r.pe);
    await pg.context().close();
  }

  /* ── 4) 動きを減らす設定 ───────────────────────── */
  console.log("\n== 動きを減らす設定 ==");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce" });
    const pg = await ctx.newPage();
    await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(2200);
    await openSplash(pg);
    await pg.waitForTimeout(600);
    const r = await pg.evaluate(() => {
      const root = document.getElementById("authBootSplash");
      const g = (s) => getComputedStyle(root.querySelector(s));
      return { ring: parseFloat(g(".vqload-ring").strokeDashoffset),
               svgAnim: g(".vqload-svg").animationName,
               textOp: g(".liquid-loading-text").opacity,
               barAnim: g(".liquid-loading-dots span").animationName };
    });
    ok("線は最初から引かれている", r.ring < 1, JSON.stringify(r));
    ok("絵は動かさない", r.svgAnim === "none", r.svgAnim);
    ok("文字はちゃんと出ている", parseFloat(r.textOp) > .9, r.textOp);
    ok("バーも動かさない", r.barAnim === "none", r.barAnim);
    const a = await pg.screenshot(); await pg.waitForTimeout(1000);
    const b = await pg.screenshot();
    ok("画面が完全に静止している", Buffer.compare(a, b) === 0);
    await ctx.close();
  }

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
