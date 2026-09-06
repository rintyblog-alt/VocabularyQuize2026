"use strict";
const BASE = "http://127.0.0.1:8791"; const OUT = "exports/survive-shots/LAND";
require("fs").mkdirSync(OUT, { recursive: true });
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
const コース = Number(process.argv[2] || 0);
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 620 } });
  const pg = await ctx.newPage();
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
  await 待(1200);
  /* 風景の 代表を 1 本ずつ */
  const 選 = [{i:0,theme:"meadow"},{i:2,theme:"candy"},{i:4,theme:"forest"},{i:7,theme:"ruins"},
    {i:9,theme:"sky"},{i:10,theme:"neon"},{i:12,theme:"ice"},{i:18,theme:"lava"},{i:29,theme:"arena"}];
  console.log("風景:", 選.map(c=>c.theme).join(" / "));
  for (const c of 選) {
    await pg.evaluate((i) => { const lb=window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex=i; lb.mode="timeattack"; lb.botCount=0; lb._save(); lb._render();
      document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click(); }, c.i);
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
    await 待(4200);
    await pg.screenshot({ path: `${OUT}/${c.theme}-eye.png` });
    /* 高い ところから 見下ろす（背景に 何が あるか を 見る）。
       カメラの update を 止めてから 置く（毎コマ 上書きされる ため）。 */
    await pg.evaluate(() => { const ms=window.VocabuSurvive.__app.shell.get("match");
      ms.cam.update = function(){};
      const p = ms.local; const cv = ms.renderer.canvas;
      ms.cam.setFree([p.x + 26, p.y + 16, p.z - 34], [p.x, p.y + 2, p.z + 30], cv.width/cv.height, 58);
    });
    await 待(400);
    await pg.screenshot({ path: `${OUT}/${c.theme}.png` });
    await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
    await 待(500);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
