const { chromium } = require("playwright");
const SP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(3000);
  const want = (process.argv[2]||"forest,meadow,desert,snow").split(",");
  for (const w of want) {
    const r = await pg.evaluate((w)=>{
      const r=window.__rpg;
      for (let d=40; d<6000; d+=40) for (let a=0;a<12;a++){
        const x=Math.cos(a/12*6.283)*d, z=Math.sin(a/12*6.283)*d;
        const t=r.terr.at(x,z);
        if (t.biome===w && !t.water){
          r.player.pos[0]=x; r.player.pos[2]=z; r.player.pos[1]=t.h+1;
          let yaw=0.7;
          for(let a=0;a<16;a++){ const bb=a/16*6.283;
            if (r.terr.at(x-Math.sin(bb)*34, z-Math.cos(bb)*34).water) { yaw=bb; break; } }
          r.cam.snap(r.player.pos,yaw); r.時刻=0.42;
          return {biome:w,x:Math.round(x),z:Math.round(z),h:Math.round(t.h),yaw:+yaw.toFixed(2)};
        }
      }
      return null;
    }, w);
    console.log(w, JSON.stringify(r));
    if(!r) continue;
    await pg.waitForTimeout(3200);
    await pg.screenshot({path: SP+"/look-"+w+".png"});
  }
  const st = await pg.evaluate(()=>({fps:Math.round(window.__rpg.fps||0), ...(window.__rpg.R?window.__rpg.R.stats:{})}));
  console.log("stats", JSON.stringify(st));
  await b.close();
})();
