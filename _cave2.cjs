const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:660}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(3000);
  const r = await pg.evaluate(async ()=>{
    const R=window.__rpg;
    let c=null;
    for (let d=60; d<4000 && !c; d+=60) for (let a=0;a<10 && !c;a++){
      const x=Math.cos(a/10*6.28)*d, z=Math.sin(a/10*6.28)*d;
      const k=R.caves.近くの(x,z); if(k&&k.dist<60) c=k;
    }
    if(!c) return {err:"入口なし"};
    R.player.pos[0]=c.x; R.player.pos[2]=c.z; R.player.pos[1]=R.terr.height(c.x,c.z)+1;
    R.近くの入口=c; R.潜る();
    const 洞=R.洞窟;
    const 奥=洞.部屋[洞.部屋.length-1];
    // 奥へ 瞬間移動
    R.player.pos[0]=c.x+奥.x; R.player.pos[2]=c.z+奥.z; R.player.pos[1]=c.y+奥.y;
    R.cam.snap(R.player.pos, 0);
    await new Promise(r=>setTimeout(r,2000));
    const 出す前 = { 番人:洞.番人, 出した:洞.番人を出した, 敵:R.combat.list.length, 宝:洞.宝.開けた };
    await new Promise(r=>setTimeout(r,2500));
    const 後 = { 出した:洞.番人を出した, 敵:R.combat.list.map(e=>e.def.名), 宝:洞.宝.開けた,
                 夜:R.combat.夜, 持:R.inv.count("kin_ka") };
    return { id:洞.id, 名:洞.名, 番人:洞.番人, 中身:洞.宝.中身, 出す前, 後 };
  });
  console.log(JSON.stringify(r,null,1));
  await pg.screenshot({path:SP+"/cave2.png"});
  await b.close();
})();
