const { chromium } = require("playwright");
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(2500);
  await pg.evaluate(()=>{
    const r=window.__rpg; window.__c={down:0,move:0,up:0};
    const cv=r.canvas;
    cv.addEventListener("pointerdown",()=>window.__c.down++,true);
    cv.addEventListener("pointermove",()=>window.__c.move++,true);
    cv.addEventListener("pointerup",()=>window.__c.up++,true);
    window.__lookSum=0;
    const orig=r.cam.rotate.bind(r.cam);
    r.cam.rotate=(a,b2)=>{ window.__lookSum+=Math.abs(a); return orig(a,b2); };
  });
  await pg.mouse.move(450,300); await pg.mouse.down();
  for(let i=0;i<25;i++){ await pg.mouse.move(450+i*8,300); await 待(20); }
  await pg.mouse.up(); await 待(400);
  console.log(JSON.stringify(await pg.evaluate(()=>({
    出来事: window.__c, 回した合計: +window.__lookSum.toFixed(3),
    look: {dx: window.__rpg.input.look.dx, dy: window.__rpg.input.look.dy},
    つながって: window.__rpg.input.enabled,
    板: window.__rpg.input.el === window.__rpg.canvas
  }))));
  await b.close();
})();
