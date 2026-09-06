/* **本物の アプリの 道**で さがすを 開く。lab では 通らない ところを 見る。 */
const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const BASE="http://127.0.0.1:8791"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=angle","--enable-unsafe-swiftshader"]});
  const mob = process.argv[2]==="mobile";
  const pg = await (await b.newContext({viewport:{width:mob?390:1200,height:mob?844:780},deviceScaleFactor:mob?2:1})).newPage();
  const 例外=[], err=[];
  pg.on("pageerror", e=>例外.push(String(e.message).slice(0,200)));
  pg.on("console", m=>{ if(m.type()==="error") err.push(m.text().slice(0,200)); });
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f=()=>{ document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash","vqInstall"]) {
      const e=document.getElementById(id); if(e){e.classList.add("hidden"); e.style.display="none";} } }; f(); setInterval(f,150); });
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1","1"); } catch(e){} });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, {timeout:120000, polling:250});
  await pg.waitForFunction(() => { const h=document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, {timeout:120000, polling:250});
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, {timeout:40000});
  await 待(2000);
  console.log("ロビー まで OK");
  /* さがす を 選んで はじめる */
  await pg.evaluate(()=>{ const sr=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    sr.querySelector(".vs-lb-way.is-rpg").click(); });
  await 待(1500);
  await pg.evaluate(()=>{ const sr=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    sr.querySelector(".vs-lb-start").click(); });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "rpg", null, {timeout:90000});
  console.log("さがす 画面へ");
  await 待(9000);
  const st = await pg.evaluate(()=>{
    const app = window.VocabuSurvive.__app;
    const sc = app.shell.get("rpg");
    return { ready: !!sc.ready, 世界: sc.worldName, 種: sc.seed,
             区画: sc.chunks ? sc.chunks.live.size : -1,
             面: sc.renderer ? (sc.renderer.stats.tris|0) : -1,
             板: sc.canvas ? [sc.canvas.width, sc.canvas.height] : null,
             hud: !!(sc.hud && sc.hud.el && sc.hud.el.isConnected) };
  });
  console.log("状態:", JSON.stringify(st));
  await pg.screenshot({path:SP+"/app-rpg"+(mob?"-m":"")+".png"});
  /* 歩いて みる */
  await pg.evaluate(async ()=>{
    const sc = window.VocabuSurvive.__app.shell.get("rpg");
    for (let i=0;i<240;i++){ sc.player.update(1/60,{x:0.4,y:0.9}, sc.cam.yaw, false, true); await new Promise(s=>setTimeout(s,8)); }
  });
  await 待(1500);
  const st2 = await pg.evaluate(()=>{
    const sc = window.VocabuSurvive.__app.shell.get("rpg");
    return { 位置: sc.player.pos.map(Math.round), 風: sc.terr.at(sc.player.pos[0], sc.player.pos[2]).biome,
             区画: sc.chunks.live.size, 面: sc.renderer.stats.tris|0 };
  });
  console.log("歩いた:", JSON.stringify(st2));
  await pg.screenshot({path:SP+"/app-rpg2"+(mob?"-m":"")+".png"});
  /* ロビーへ 戻る → もう一度 入る（2 回目が 黒く ならないか） */
  await pg.evaluate(()=>window.VocabuSurvive.__app.goLobby());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, {timeout:30000});
  await 待(1500);
  await pg.evaluate(()=>{ const sr=document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    sr.querySelector(".vs-lb-start").click(); });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "rpg", null, {timeout:90000});
  await 待(7000);
  const st3 = await pg.evaluate(()=>{
    const sc = window.VocabuSurvive.__app.shell.get("rpg");
    const gl = sc.renderer && sc.renderer.gl;
    return { ready: !!sc.ready, 面: sc.renderer? (sc.renderer.stats.tris|0):-1,
             文脈: !!gl, 失った: !!(gl && gl.isContextLost && gl.isContextLost()) };
  });
  console.log("2 回目:", JSON.stringify(st3));
  await pg.screenshot({path:SP+"/app-rpg3"+(mob?"-m":"")+".png"});
  console.log("例外", 例外.length, 例外.slice(0,4));
  console.log("error", err.length, err.slice(0,4));
  await b.close();
})();
