const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:800,height:520}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", String(e.message).slice(0,400)));
  pg.on("console", m=>{ const t=m.text(); if(/error|Error|WARN|GL_|shader|compile|link/i.test(t)) console.log(m.type()+":", t.slice(0,400)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await new Promise(s=>setTimeout(s,9000));
  console.log(await pg.evaluate(()=>({ready: window.__rpg&&window.__rpg.ready, 描き手: !!(window.__rpg&&window.__rpg.renderer)})));
  await b.close();
})();
