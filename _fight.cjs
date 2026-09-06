const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);
  const r = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.inv.add("tetsu_sword",1); r.inv.add("tetsu_helm",1); r.inv.add("tetsu_chest",1);
    /* 身に つける */
    const 付 = [];
    for (const id of ["tetsu_sword","tetsu_helm","tetsu_chest"]) { const x=r.inv.wear(id); 付.push([id,!!x]); }
    r.combat.list.length = 0;
    r.combat.力 = 100;
    const E = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const ids = E.ENEMY_IDS.filter(i=>!E.ENEMIES[i].主).slice(0,4);
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    let k=0;
    for (const id of ids) {
      const a=(k++/ids.length)*6.283;
      const x=r.player.pos[0]-Math.sin(r.cam.yaw)*8+Math.cos(a)*3, z=r.player.pos[2]-Math.cos(r.cam.yaw)*8+Math.sin(a)*3;
      const e=new C.Enemy(E.ENEMIES[id], x, r.terr.height(x,z), z);
      r.combat.list.push(e);
    }
    await new Promise(s=>setTimeout(s,1600));
    return { 付, 装: r.inv.status? r.inv.status() : null, 敵: r.combat.list.map(e=>e.def.名), 狙: r.狙い敵?r.狙い敵.def.名:"" };
  });
  console.log(JSON.stringify(r));
  await 待(1500);
  await pg.screenshot({path:SP+"/fight.png"});
  await b.close();
})();
