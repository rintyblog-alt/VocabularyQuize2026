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
    r.time = 22.5;
    r.inv.add("b_fire",1); r.inv.add("pan",3);
    r.player.hp = 30;
    r.建てるか = true; r.置くもの = "b_fire";
    r._tapAct = true;
    await new Promise(s=>setTimeout(s,500));
    r.建てるか = false;
    await new Promise(s=>setTimeout(s,800));
    const 設 = r.近くの設備 ? r.近くの設備.id : "";
    /* 敵が いる ときは 休めない */
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    const E = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const id = E.ENEMY_IDS.find(i=>!E.ENEMIES[i].主);
    r.combat.list.push(new C.Enemy(E.ENEMIES[id], r.player.pos[0]+6, r.player.pos[1], r.player.pos[2]));
    const 敵あり = r.休む();
    r.combat.list.length = 0;
    const 前hp = r.player.hp, 前時 = r.time, 前パン = r.inv.count("pan");
    const res = r.休む();
    /* 食べもの なし */
    r.inv.remove("pan", r.inv.count("pan"));
    r.time = 23;
    const 食なし = r.休む();
    return { 設, 敵あり, res, 前hp, 後hp:r.player.hp, 前時, 後時:r.time,
             パン:{前:前パン, 後:r.inv.count("pan")}, 食なし };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
