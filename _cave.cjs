const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:660}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  pg.on("console", m=>{ if(m.type()==="error") console.log("err:", m.text().slice(0,200)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(3500);
  const r1 = await pg.evaluate(()=>{
    const r=window.__rpg;
    /* 入口を さがして そこへ */
    for (let d=60; d<4000; d+=60) for (let a=0;a<10;a++){
      const x=Math.cos(a/10*6.28)*d, z=Math.sin(a/10*6.28)*d;
      const c=r.caves.近くの(x,z);
      if (c && c.dist < 60) {
        r.player.pos[0]=c.x; r.player.pos[2]=c.z; r.player.pos[1]=r.terr.height(c.x,c.z)+1;
        r.cam.snap(r.player.pos,0);
        return { 見つけた:c.id, biome:c.biome, x:Math.round(c.x), z:Math.round(c.z) };
      }
    }
    return null;
  });
  console.log("入口:", JSON.stringify(r1));
  await pg.waitForTimeout(1400);
  const r2 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const 前 = r.player.pos.slice();
    const ok = r.潜る();
    return { 入れた:ok, 名: r.洞窟? r.洞窟.名 : "", 部屋: r.洞窟? r.洞窟.部屋.length:0,
             実り: r.洞窟? r.洞窟.資源.length:0, 前, 後:r.player.pos.slice(),
             床: r.terr.height(r.player.pos[0], r.player.pos[2]) };
  });
  console.log("もぐる:", JSON.stringify(r2));
  await pg.evaluate(()=>{ window.__rpg.cam.rotate(0,-0.12); });
  await pg.waitForTimeout(2500);
  await pg.screenshot({path:"/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad/cave-1.png"});
  const r3 = await pg.evaluate(()=>{
    const r=window.__rpg;
    /* 実りへ 歩く */
    const c=r.洞窟.入, g=r.洞窟.資源.find(x=>!x.取った);
    r.player.pos[0]=c.x+g.x; r.player.pos[2]=c.z+g.z;
    return { 何:g.何 };
  });
  await pg.waitForTimeout(900);
  const r4 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const 取 = r.洞窟.資源.filter(x=>x.取った).length;
    const out = r.出る();
    return { 取, 出た:out, 洞窟: !!r.洞窟, 位置: r.player.pos.map(v=>Math.round(v)) };
  });
  console.log("拾って 出る:", JSON.stringify(r4));
  await b.close();
})();
