const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, isMobile:true, userAgent: devices["iPhone 13"].userAgent });
  const pg = await ctx.newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,3000));
  console.log(JSON.stringify(await pg.evaluate(async ()=>{
    const r=window.__rpg; r.inv.add("ki",5);
    const out=[];
    for (const k of ["inv","craft","build","quest"]) {
      r.hud.開く(k); await new Promise(s=>setTimeout(s,260));
      for (const e of r.hud.paneEl.querySelectorAll("button")) {
        const b=e.getBoundingClientRect();
        if (b.width>0 && (b.width<40||b.height<40)) out.push([k, e.className, e.textContent.trim().slice(0,14), Math.round(b.width)+"x"+Math.round(b.height)]);
      }
    }
    r.hud.開く("");
    return out;
  }),null,1));
  await b.close();
})();
