const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  pg.on("console", m=>{ if(m.type()==="error") console.log("err:", m.text().slice(0,300)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,2500));
  console.log(JSON.stringify(await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.inv.add("tetsu_rod",1); r.inv.wear("tetsu_rod");
    let 場=null;
    for(let d=60; d<5000 && !場; d+=40) for(let a=0;a<24 && !場;a++){
      const x=Math.cos(a/24*6.283)*d, z=Math.sin(a/24*6.283)*d;
      const t=r.terr.at(x,z); if(t.water) continue;
      for(let k=0;k<8;k++){ const bb=k/8*6.283;
        if(r.terr.at(x+Math.cos(bb)*3.0, z+Math.sin(bb)*3.0).water){ 場={x,z,h:t.h}; break; } }
    }
    r.player.pos[0]=場.x; r.player.pos[2]=場.z; r.player.pos[1]=r.terr.height(場.x,場.z)+0.5;
    await new Promise(s=>setTimeout(s,900));
    return { 場, fishあり:!!r.fish, 直:r.fish? r.fish.水べ(場.x,場.z):"-", tick値:r.水べ,
             泳:r.player.swimming, 洞:!!r.洞窟, 竿:r.竿の効き, y:r.player.pos[1] };
  })));
  await b.close();
})();
