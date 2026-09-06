const { chromium, devices } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
    hasTouch:true, isMobile:true, userAgent: devices["iPhone 13"].userAgent });
  const pg = await ctx.newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);
  /* 左下を なぞる */
  await pg.touchscreen.tap(110, 700);
  await 待(200);
  const 前 = await pg.evaluate(()=>window.__rpg.player.pos.slice());
  /* 指で 引っぱる */
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:110,y:700,id:1}]});
  await 待(120);
  for (let i=0;i<40;i++){
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:110+ i*1.2, y:700-60, id:1}]});
    await 待(30);
  }
  const 棒 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const el = r.el || (r.hud && r.hud.el && r.hud.el.parentNode);
    const s = document.querySelector("#stage") || document.body;
    const 見 = [...(r.hud.el.ownerDocument.querySelectorAll("[class*=stick],[class*=pad],[class*=joy],[class*=棒]"))].map(e=>e.className);
    return { 見, 軸: r.input && r.input.axis ? {x:+r.input.axis.x.toFixed(2), y:+r.input.axis.y.toFixed(2)} : null,
             速: +r.player.speed.toFixed(2) };
  });
  await pg.screenshot({path:SP+"/touch.png"});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  const 後 = await pg.evaluate(()=>window.__rpg.player.pos.slice());
  console.log("棒:", JSON.stringify(棒));
  console.log("動いた:", Math.hypot(後[0]-前[0], 後[2]-前[2]).toFixed(2)+"m");
  await b.close();
})();
