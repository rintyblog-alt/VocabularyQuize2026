const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:660}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  pg.on("console", m=>{ if(m.type()==="error") console.log("err:", m.text().slice(0,200)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(4200);
  await pg.screenshot({path:"/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad/tex-1.png"});
  console.log(JSON.stringify(await pg.evaluate(()=>window.__rpg.state().draw)));
  await b.close();
})();
