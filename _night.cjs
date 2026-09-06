const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);
  await pg.evaluate(()=>{ const r=window.__rpg;
    for(let d=40;d<3000;d+=40) for(let a=0;a<12;a++){
      const x=Math.cos(a/12*6.283)*d, z=Math.sin(a/12*6.283)*d;
      const t=r.terr.at(x,z);
      if(t.biome==="meadow"&&!t.water){ r.player.pos[0]=x;r.player.pos[2]=z;r.player.pos[1]=t.h+1;
        r.cam.snap(r.player.pos,0.9); return; } } });
  for (const [h,名] of [[5.4,"夜明け"],[12,"真昼"],[18.2,"夕暮れ"],[23,"真夜中"]]) {
    await pg.evaluate((hh)=>{ window.__rpg.time = hh; }, h);
    await 待(2600);
    await pg.screenshot({path:SP+"/t-"+Math.round(h*10)+".jpg", type:"jpeg", quality:80});
    console.log(名, h, JSON.stringify(await pg.evaluate(()=>({夜:+window.__rpg.combat.夜.toFixed(2), 敵:window.__rpg.combat.list.length}))));
  }
  /* 天気 */
  const w = await pg.evaluate(()=>{ const r=window.__rpg;
    return { 天気: r.weather && r.weather.いま ? r.weather.いま : (r.weather&&r.weather.種), 鍵: Object.keys(r.weather||{}) }; });
  console.log("天気:", JSON.stringify(w));
  await b.close();
})();
