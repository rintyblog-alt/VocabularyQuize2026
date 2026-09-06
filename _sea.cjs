const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(()=>{
    const r=window.__rpg;
    for(let d=60; d<5000; d+=40) for(let a=0;a<24;a++){
      const x=Math.cos(a/24*6.283)*d, z=Math.sin(a/24*6.283)*d;
      const t=r.terr.at(x,z);
      if(t.water) continue;
      for(let k=0;k<16;k++){
        const bb=k/16*6.283;
        const w=r.terr.at(x-Math.sin(bb)*26, z-Math.cos(bb)*26);
        if(w.water){
          r.player.pos[0]=x; r.player.pos[2]=z; r.player.pos[1]=t.h+1;
          r.cam.snap(r.player.pos, bb); r.time=15.5;
          return {x:Math.round(x),z:Math.round(z),biome:t.biome,h:+t.h.toFixed(1),yaw:+bb.toFixed(2)};
        }
      }
    }
    return null;
  });
  console.log("海ぎわ:", JSON.stringify(r));
  await pg.waitForTimeout(3200);
  await pg.screenshot({path:SP+"/sea.png"});
  await b.close();
})();
