const { chromium, devices } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:2, hasTouch:true, isMobile:true, userAgent: devices["iPhone 13"].userAgent });
  const pg = await ctx.newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,3500));
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const r=window.__rpg;
    const 取=(sel,n)=>{const e=r.el.querySelector(sel); if(!e||getComputedStyle(e).display==="none")return null;
      const b=e.getBoundingClientRect(); return {s:n||sel, x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height)};};
    const l=[取(".rh-act"),取(".vs-tbtn-jump")].filter(Boolean)
      .concat([...r.el.querySelectorAll(".rh-tab")].map(e=>{const b=e.getBoundingClientRect();
        return {s:"tab:"+e.textContent, x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};}));
    const 当=[];
    for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++){const a=l[i],c=l[j];
      const ix=Math.max(0,Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x));
      const iy=Math.max(0,Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y));
      if(ix*iy>120) 当.push([a.s,c.s,ix*iy]);}
    return {窓:[innerWidth,innerHeight], l, 当};
  }),null,1));
  await pg.screenshot({path:SP+"/land.png"});
  await b.close();
})();
