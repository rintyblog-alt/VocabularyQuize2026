const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const BASE="http://127.0.0.1:8791";
const 待=m=>new Promise(s=>setTimeout(s,m));
const 起こす = async (pg)=>{
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display="none"; } } }; f(); setInterval(f,150); });
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1","1"); } catch(e){} });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, {timeout:120000, polling:250});
  await pg.waitForFunction(() => { const h=document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, {timeout:120000, polling:250});
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, {timeout:40000});
  await 待(2500);
};
(async () => {
  const b = await chromium.launch({args:["--use-gl=angle","--enable-unsafe-swiftshader"]});
  const mob = process.argv[2]==="mobile";
  const pg = await (await b.newContext({viewport:{width:mob?390:1200,height:mob?844:780},deviceScaleFactor:mob?2:1})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await 起こす(pg);
  await pg.screenshot({path:SP+"/rl-lobby"+(mob?"-m":"")+".png"});
  console.log("ロビー 撮った");
  await pg.evaluate(()=>{ const sr=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    sr.querySelector(".vs-lb-way.is-rpg").click(); });
  await 待(1600);
  await pg.screenshot({path:SP+"/rl-lobby-rpg"+(mob?"-m":"")+".png"});
  console.log("さがす 撮った");
  await pg.evaluate(()=>{ const sr=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    sr.querySelector(".vs-lb-way.is-run").click(); });
  await 待(900);
  await pg.evaluate((m) => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.mode = "race"; lb.botCount = 3; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
  });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, {timeout:60000});
  await 待(6000);
  await pg.screenshot({path:SP+"/rl-match"+(mob?"-m":"")+".png"});
  console.log("試合 撮った");
  await b.close();
})();
