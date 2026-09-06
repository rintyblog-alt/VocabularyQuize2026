const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:660}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(2500);
  const r = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.inv.add("tetsu_rod",1); r.inv.wear("tetsu_rod");
    /* 水べを 探す */
    let 場=null;
    for(let d=60; d<5000 && !場; d+=40) for(let a=0;a<24 && !場;a++){
      const x=Math.cos(a/24*6.283)*d, z=Math.sin(a/24*6.283)*d;
      const t=r.terr.at(x,z); if(t.water) continue;
      for(let k=0;k<8;k++){ const bb=k/8*6.283;
        if(r.terr.at(x+Math.cos(bb)*3.0, z+Math.sin(bb)*3.0).water){ 場={x,z,biome:t.biome, yaw:bb+Math.PI}; break; } }
    }
    if(!場) return {err:"水べなし"};
    r.player.pos[0]=場.x; r.player.pos[2]=場.z; r.player.pos[1]=r.terr.height(場.x,場.z)+0.5;
    r.cam.snap(r.player.pos, 場.yaw);
    await new Promise(s=>setTimeout(s,900));
    const 前 = { 水べ: r.水べ, 効き: r.竿の効き };
    /* 10 回 つる */
    const 取 = {};
    for (let i=0;i<10;i++){
      r._tapAct = true;                        /* 投げる */
      await new Promise(s=>setTimeout(s,60));
      /* かかるまで 待つ */
      let n=0;
      while (r.fish.状 && r.fish.状.段 !== "かかった" && n++ < 400) await new Promise(s=>setTimeout(s,16));
      if (!r.fish.状) continue;
      r._tapAct = true;                        /* あげる */
      await new Promise(s=>setTimeout(s,120));
    }
    for (const s of r.inv.slots) if (s) 取[s.id]=(取[s.id]||0)+s.数;
    return { 場, 前, 取 };
  });
  console.log(JSON.stringify(r,null,1));
  await 待(600);
  await pg.screenshot({path:SP+"/fish.png"});
  await b.close();
})();
