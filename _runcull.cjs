const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:560}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/vocabu-survive-lab.html",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(6000);
  console.log("keys:", await pg.evaluate(()=>Object.keys(window).filter(k=>k.startsWith("__"))));
  await pg.screenshot({path:SP+"/run-0.png"});
  await b.close();
})();
