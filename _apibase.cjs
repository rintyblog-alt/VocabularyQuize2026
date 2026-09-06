/* ローカルの 検査が **本番を 叩いて いないか** を 数える。 */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:760}})).newPage();
  const 外 = {};
  pg.on("request", (r) => {
    const u = r.url();
    if (/vocabuquiz\.app|workers\.dev/.test(u)) {
      const k = u.replace(/\?.*/,"").slice(0,90);
      外[k] = (外[k]||0) + 1;
    }
  });
  await pg.goto("http://127.0.0.1:8791/index.html",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("appSurvivePage"),null,{timeout:60000});
  await new Promise(s=>setTimeout(s,20000));
  const base = await pg.evaluate(()=>({
    apiBase: window.VQ_API_BASE || window.__VQ_API || (window.VQ && VQ.apiBase) || "?",
    origin: location.origin
  }));
  console.log("画面が 思って いる API の 先:", JSON.stringify(base));
  const n = Object.values(外).reduce((a,b)=>a+b,0);
  console.log("本番へ 出た 回数:", n);
  for (const [k,v] of Object.entries(外).sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log("   ", v, k);
  await b.close();
})();
