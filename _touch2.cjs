const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
    hasTouch:true, isMobile:true, userAgent: devices["iPhone 13"].userAgent });
  const pg = await ctx.newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,3000));
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const r=window.__rpg;
    return {
      coarse: window.matchMedia("(pointer: coarse)").matches,
      touchあり: !!r.touch,
      touch板: r.touch ? !!r.touch.el.isConnected : false,
      is_touch: r.el ? r.el.classList.contains("is-touch") : "elなし",
      elある: !!r.el,
      inputある: !!r.input,
      axis: r.input && r.input.axis,
      pad: r.input && r.input.pad,
      maxTouchPoints: navigator.maxTouchPoints
    };
  })));
  await b.close();
})();
