#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivealbum.cjs — **30 本 ぜんぶ**を 順に 撮る。

   検査は 「通れるか」を 数で 見て いるが、**見た目の 抜け**は 数に 出ない。
   1 本ずつ 目で 見る ため の 道具。窓は 1 つだけ 開き、コースだけ 入れ替える
   （30 回 立ち上げると 20 分 かかる）。

   使い方:
     node vqsurvivealbum.cjs                 30 本
     node vqsurvivealbum.cjs --から 0 --まで 14
     node vqsurvivealbum.cjs --幅 480 --高 300
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 撮りません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
const 引数 = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const から = Number(引数("--から", "0")), まで = Number(引数("--まで", "29"));
const 幅 = Number(引数("--幅", "520")), 高 = Number(引数("--高", "330"));
const 走 = Number(引数("--走る", "0"));
const OUT = path.resolve(引数("--出", "exports/survive-album"));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 幅, height: 高 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 140)));
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
  await 待(1500);
  /* あそびかたは 1 度で 済ませる（毎回 出ると 撮れない）。 */
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });

  const 一覧 = [];
  for (let i = から; i <= まで; i++) {
    await pg.evaluate((idx) => {
      const A = window.VocabuSurvive.__app;
      const lb = A.shell.get("lobby");
      lb.courseIndex = idx; lb.botCount = 3; lb.mode = "race";
      lb._save(); lb._render();
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    }, i);
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 }).catch(() => {});
    /* 合図の 見せ場が 終わる まで 待つ */
    await 待(3600);
    if (走 > 0) {
      await pg.evaluate(() => {
        const ms = window.VocabuSurvive.__app.shell.get("match");
        if (window.__a) clearInterval(window.__a);
        let n = 0;
        window.__a = setInterval(() => { try { ms.input.setAxis(0, -1);
          if (++n % 26 === 0) { ms.input.pressJump(); setTimeout(() => ms.input.releaseJump(), 150); } } catch (e) {} }, 50);
      });
      await 待(走 * 1000);
    }
    const 情 = await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      return { id: ms.course ? ms.course.id : "", 名: ms.course ? ms.course.name : "",
               風景: ms.course ? ms.course.themeName : "",
               描き: ms.renderer ? ms.renderer.stats.draws : -1,
               面: ms.renderer ? ms.renderer.stats.tris : -1,
               進: ms.local ? Math.round((ms.local.progress / Math.max(1, ms.course.length)) * 100) : -1 };
    }).catch(() => ({}));
    const 名 = String(i + 1).padStart(2, "0") + "-" + (情.id || "?") + "-" + (情.風景 || "?");
    await pg.screenshot({ path: `${OUT}/${名}.png` });
    一覧.push(Object.assign({ i: i + 1 }, 情));
    console.log(" ", 名, JSON.stringify(情));
    if (走 > 0) await pg.evaluate(() => { if (window.__a) clearInterval(window.__a);
      const ms = window.VocabuSurvive.__app.shell.get("match"); ms.input.setAxis(0, 0); });
    /* ロビーへ 戻す */
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.onQuit(); });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 }).catch(() => {});
    await 待(500);
  }
  fs.writeFileSync(OUT + "/一覧.json", JSON.stringify(一覧, null, 1));
  console.log("例外:", 例外.slice(0, 3), " → ", OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
