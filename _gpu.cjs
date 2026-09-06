const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  for (const tier of ["low","medium","high","ultra"]) {
    const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier="+tier+"&seed=20260902",{waitUntil:"domcontentloaded"});
    await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
    await new Promise(s=>setTimeout(s,3000));
    const r = await pg.evaluate(async ()=>{
      const R=window.__rpg.renderer;
      const t0=performance.now(); let n=0;
      await new Promise(res=>{const f=()=>{n++; if(performance.now()-t0<4000) requestAnimationFrame(f); else res();}; requestAnimationFrame(f);});
      return { fps:+(n/((performance.now()-t0)/1000)).toFixed(1), 面:R.stats.tris|0, 描:R.stats.draws,
               肌:R._skin? (R._skin.w+"x"+R._skin.h):"なし", 肌MB: R._skin? +(R._skin.bytes/1048576).toFixed(2):0 };
    });
    console.log(tier.padEnd(7), JSON.stringify(r));
    await pg.close();
  }
  await b.close();
})();
