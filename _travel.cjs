const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:680}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.inv.add("kin_ka", 80);
    /* 3 つの 町を 見つける */
    const 見つけた=[];
    for (let d=0; d<3000 && 見つけた.length<3; d+=120) for (let a=0;a<8 && 見つけた.length<3;a++){
      const x=Math.cos(a/8*6.283)*d, z=Math.sin(a/8*6.283)*d;
      const t=r.terr.nearestTown(x,z);
      if(!t) continue;
      if(見つけた.some(k=>k.id===t.id)) continue;
      r.player.pos[0]=t.x; r.player.pos[2]=t.z; r.player.pos[1]=r.terr.height(t.x,t.z)+1;
      await new Promise(s=>setTimeout(s,700));
      if (r.いる町) 見つけた.push({id:r.いる町.id, 名:r.いる町.名});
    }
    const 一覧 = Array.from(r.行った町.values());
    /* 案内人の ところへ */
    const T = r.town.中身(r.terr.nearestTown(r.player.pos[0], r.player.pos[2]));
    const g = T.人.find(p=>p.役==="guide");
    if (g) { r.player.pos[0]=g.x+1; r.player.pos[2]=g.z+1; r.player.pos[1]=r.terr.height(g.x+1,g.z+1)+1; }
    await new Promise(s=>setTimeout(s,900));
    const 近 = r.近くの人 ? r.近くの人.役 : "";
    if (r.近くの人) r.hud.話す();
    await new Promise(s=>setTimeout(s,300));
    const 行 = r.hud.paneEl.querySelectorAll(".rh-rec").length;
    return { 見つけた, 一覧, 近, 行, 金:r.inv.count("kin_ka") };
  });
  console.log(JSON.stringify(r,null,1));
  await pg.screenshot({path:SP+"/travel.png"});
  const r2 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const 他 = Array.from(r.行った町.values()).filter(t=>!r.いる町||t.id!==r.いる町.id);
    if(!他.length) return {なし:true};
    const 前=r.player.pos.slice(), 金前=r.inv.count("kin_ka");
    const res = r.町へ帰る(他[0]);
    return { res, 前:前.map(Math.round), 後:r.player.pos.map(Math.round), 金前, 金後:r.inv.count("kin_ka"), 先:他[0].名 };
  });
  console.log("帰る:", JSON.stringify(r2));
  await b.close();
})();
