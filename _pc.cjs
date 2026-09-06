const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:640}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);
  /* 平らな 草原で 近づいて 撮る */
  await pg.evaluate(()=>{ const r=window.__rpg;
    for(let d=40;d<3000;d+=40) for(let a=0;a<12;a++){
      const x=Math.cos(a/12*6.283)*d, z=Math.sin(a/12*6.283)*d;
      const t=r.terr.at(x,z);
      if(t.biome==="meadow"&&!t.water){ r.player.pos[0]=x;r.player.pos[2]=z;r.player.pos[1]=t.h;
        r.cam.snap(r.player.pos,0.9); r.time=10; r.cam.wantDistance=3.6; r.cam.distance=3.6;
        r.combat.list.length=0; r.combat.上限=0; return; } } });
  await 待(2600);
  await pg.screenshot({path:SP+"/pc-stand.jpg", type:"jpeg", quality:88});
  /* 歩かせて 撮る */
  await pg.evaluate(async ()=>{ const r=window.__rpg;
    for(let i=0;i<70;i++){ r.player.update(1/60,{x:0,y:-1}, r.cam.yaw, false, false); await new Promise(s=>setTimeout(s,10)); } });
  await 待(600);
  await pg.screenshot({path:SP+"/pc-walk.jpg", type:"jpeg", quality:88});
  console.log("撮った");
  await b.close();
})();
