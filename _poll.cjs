/* 裏の タブが 本当に 静かに なるかを **数えて** 確かめる。 */
const { chromium } = require("playwright");
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({viewport:{width:1100,height:760}});
  const pg = await ctx.newPage();
  const 数 = {};
  pg.on("request", r => { const u=r.url();
    const m = u.match(/\/api\/(call\/state|dm\/sync|notif[a-z\/]*|flags\/effective)/);
    if (m) 数[m[1]] = (数[m[1]]||0)+1; });
  await pg.goto("http://127.0.0.1:8791/index.html",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("appSurvivePage"),null,{timeout:60000});
  await 待(2000);
  const 取 = ()=>JSON.parse(JSON.stringify(数));
  const a = 取();
  console.log("── 表の まま 60 秒 ──");
  await 待(60000);
  const b1 = 取();
  for (const k of new Set([...Object.keys(a),...Object.keys(b1)])) console.log("   "+k.padEnd(18), (b1[k]||0)-(a[k]||0), "回/分");
  /* 裏へ */
  console.log("── 裏に 回して 60 秒 ──");
  await pg.evaluate(()=>{ Object.defineProperty(document,"hidden",{get:()=>true,configurable:true});
    Object.defineProperty(document,"visibilityState",{get:()=>"hidden",configurable:true});
    document.dispatchEvent(new Event("visibilitychange")); });
  const c = 取();
  await 待(60000);
  const d = 取();
  for (const k of new Set([...Object.keys(c),...Object.keys(d)])) console.log("   "+k.padEnd(18), (d[k]||0)-(c[k]||0), "回/分");
  await b.close();
})();
