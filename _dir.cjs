const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(2500);
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const r=window.__rpg;
    r.cam.snap(r.player.pos, 0);
    const P=r.player.pos.slice();
    const 目=r.cam.pos ? r.cam.pos.slice() : (r.cam.eye? r.cam.eye.slice():null);
    const keys=Object.keys(r.cam);
    return { yaw:r.cam.yaw, P, 目, keys };
  })));
  await b.close();
})();
