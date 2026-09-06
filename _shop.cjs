const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,2500));
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const r=window.__rpg;
    const t=r.terr.nearestTown(r.player.pos[0], r.player.pos[2]);
    if(!t) return {町なし:true, 位置:r.player.pos.map(Math.round)};
    const T=r.town.中身(t);
    const 人 = (T.人||[]).map(p=>({名:p.名, 役:p.役, 品数:(p.品||[]).length}));
    const 店 = (T.人||[]).find(p=>p.品&&p.品.length);
    if(!店) return {店なし:true, 人};
    r.inv.add("kin_ka",60);
    const 品=店.品[0];
    const 前金=r.inv.count("kin_ka"), 前品=r.inv.count(品);
    const 買=r.town.買う(r.inv, 品, 60);
    r.inv.add("ki",5);
    const 売=r.town.売る(r.inv,"ki");
    return {町:t.名||t.id, 人, 品, 買, 売, 前金, 後金:r.inv.count("kin_ka"), 前品, 後品:r.inv.count(品)};
  }),null,1));
  await b.close();
})();
