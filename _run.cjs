const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const w = process.argv[2]==="mobile"?390:1200, h = process.argv[2]==="mobile"?844:760;
  const pg = await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/vocabu-survive.html",{waitUntil:"domcontentloaded"}).catch(()=>{});
  await pg.waitForTimeout(4000);
  console.log("url", pg.url(), "title", await pg.title());
  await pg.screenshot({path:SP+"/run-lobby.png"});
  await b.close();
})();
