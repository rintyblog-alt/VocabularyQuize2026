"use strict";
const BASE = "http://127.0.0.1:8791"; const OUT = "exports/survive-shots/MODES-SP";
require("fs").mkdirSync(OUT, { recursive: true });
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
(async () => {
  for (const [mode, 名] of [["survival","survival"],["quizrush","quizrush"],["team","team"]]) {
    const b = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pg = await ctx.newPage();
    const 例外 = []; pg.on("pageerror", e => 例外.push(String(e.message).slice(0,140)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 40000 });
    await pg.evaluate(() => { const f=()=>{document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
      for(const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]){const e=document.getElementById(id);if(e){e.classList.add("hidden");e.style.display="none";}}};f();setInterval(f,150); });
    await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1","1"); } catch(e){} });
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 90000, polling: 250 });
    await pg.waitForFunction(() => { const h=document.querySelector("#appSurvivePage .vq-survive-host"); return !!(h&&h.shadowRoot&&h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 90000, polling: 250 });
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
    await 待(1400);
    await pg.evaluate((m) => { const r=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const lb=window.VocabuSurvive.__app.shell.get("lobby"); lb.courseIndex=0; lb.mode=m; lb.botCount=5; lb._save(); lb._render();
      r.querySelector(".vs-lb-start").click(); }, mode);
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 }).catch(()=>{});
    await 待(4500);
    await pg.screenshot({ path: `${OUT}/${名}.png` });
    const st = await pg.evaluate(() => { const ms=window.VocabuSurvive.__app.shell.get("match");
      return { mode: ms.sim.mode, 相: ms.sim.phase, 人: ms.sim.players.length, 命: ms.local.lives }; }).catch(e=>({err:String(e).slice(0,80)}));
    console.log(名, JSON.stringify(st), 例外.slice(0,2));
    await b.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
