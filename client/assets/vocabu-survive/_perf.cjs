const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  for (const tier of ["low","medium","high","ultra"]) {
    const pg = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
    await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier="+tier+"&seed=20260902",{waitUntil:"domcontentloaded"});
    await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
    await pg.waitForTimeout(3500);
    const s = await pg.evaluate(()=>window.__rpg.state());
    console.log(tier.padEnd(7), "三角", String(Math.round(s.draw.tris/1000)+"k").padStart(6),
      " 描く回数", String(s.draw.draws).padStart(4), " 区画", String(s.chunks.live).padStart(3),
      " 置き場", Math.round(s.draw.batchBytes/1024)+"KB");
    await pg.close();
  }
  await b.close();
})();
