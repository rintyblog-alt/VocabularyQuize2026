/* 入って 出てを くり返して、GL の 置き場と 記憶が 増え続けないかを 見る。 */
const { chromium } = require("playwright");
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--js-flags=--expose-gc"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  const 例外=[]; pg.on("pageerror", e=>例外.push(String(e.message).slice(0,160)));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=medium&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);
  const 測 = () => pg.evaluate(async ()=>{
    if (window.gc) window.gc();
    const r=window.__rpg;
    const R=r.renderer;
    return { 形: R? R.meshes.size : -1, 束: R? R.batches.size : -1,
      束B: R? (R.stats.batchBytes|0) : -1, 区画: r.chunks? r.chunks.live.size : -1,
      記憶: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1 };
  });
  console.log("1 回目:", JSON.stringify(await 測()));
  for (let i=0;i<6;i++){
    await pg.evaluate(async ()=>{ const r=window.__rpg; await r.exit(); });
    await 待(500);
    await pg.evaluate(async ()=>{ const r=window.__rpg; await r.enter({}); });
    await pg.waitForFunction(()=>window.__rpg.ready,null,{timeout:60000});
    await 待(2200);
    console.log((i+2)+" 回目:", JSON.stringify(await 測()));
  }
  console.log("例外", 例外.length, 例外.slice(0,3));
  await b.close();
})();
