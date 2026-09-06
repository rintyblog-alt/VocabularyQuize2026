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
    const t=r.touch;
    const rect = t.el.getBoundingClientRect();
    const root = t.el.getRootNode();
    const 当 = (root.elementFromPoint ? root.elementFromPoint(110,700) : document.elementFromPoint(110,700));
    const cs = getComputedStyle(t.el);
    return {
      visible: t.visible, rect: [rect.x|0, rect.y|0, rect.width|0, rect.height|0],
      pe: cs.pointerEvents, z: cs.zIndex, disp: cs.display, vis: cs.visibility,
      当たった: 当 ? (当.className || 当.tagName) : "なし",
      親: t.el.parentNode ? (t.el.parentNode.className||t.el.parentNode.tagName) : "",
      show関数: typeof t.show
    };
  })));
  await b.close();
})();
