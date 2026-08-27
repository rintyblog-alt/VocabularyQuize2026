/* 三本線が全ページで出るか、実際のブラウザで見る（モバイル幅）。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/burger", { recursive: true });
const TABS = ["home","inbox","news","insight","library","notifications","settings"];
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2 })).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,140)));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    /* この機能は v2 レイアウト前提 */
    document.body.setAttribute("data-ui-v2","1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

  });
  await pg.waitForTimeout(600);

  for (const t of TABS) {
    await pg.evaluate((tab)=>{ document.body.setAttribute("data-app-tab", tab); }, t);
    await pg.waitForTimeout(450);
    const r = await pg.evaluate(() => {
      const host = document.getElementById("vqTopbar");
      if (!host) return { host:false };
      const sr = host.shadowRoot;
      const bar = sr && sr.querySelector(".bar");
      const ico = sr && sr.querySelector('[data-tb="menu"]');
      const q   = sr && sr.querySelector("[data-tb-q]");
      const ava = sr && sr.querySelector('[data-tb="profile"]');
      const bb = bar ? bar.getBoundingClientRect() : null;
      const ib = ico ? ico.getBoundingClientRect() : null;
      const vis = (e) => e ? getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > .05 : false;
      return { host:true, display:getComputedStyle(host).display,
               only:host.classList.contains("vqtb-only"),
               barW: bb?Math.round(bb.width):0, icoW: ib?Math.round(ib.width):0,
               icoVisible: ib ? ib.width>10 && ib.height>10 : false,
               qVisible: vis(q), avaVisible: vis(ava) };
    });
    const full = (t==="home"||t==="library");
    console.log("[" + t.padEnd(13) + "] " + JSON.stringify(r));
    ok(t+"：三本線が出ている", r.host && r.display!=="none" && r.icoVisible, JSON.stringify(r));
    if (!full) ok(t+"：三本線だけ（検索とアバターは出さない）", !r.qVisible && !r.avaVisible && r.barW<=60, JSON.stringify(r));
    await pg.screenshot({ path: "shots/burger/" + t + ".png" });
  }
  ok("JS エラーなし", errs.length===0, errs.join(" / "));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
