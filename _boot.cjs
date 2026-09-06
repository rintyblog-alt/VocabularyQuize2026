const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", String(e.stack||e.message).slice(0,600)));
  pg.on("console", m=>{ if(m.type()==="error") console.log("err:", m.text().slice(0,400)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await new Promise(s=>setTimeout(s,8000));
  console.log(await pg.evaluate(()=>({ready: window.__rpg && window.__rpg.ready, boot: (document.getElementById("boot")||{}).textContent})));
  await b.close();
})();
