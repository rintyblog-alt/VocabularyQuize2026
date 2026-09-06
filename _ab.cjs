const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,3500));
  const 測 = () => pg.evaluate(async ()=>{
    const t=[]; let last=performance.now();
    await new Promise(res=>{ let n=0; const f=()=>{ const now=performance.now(); t.push(now-last); last=now; n++;
      if(n<90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t.sort((a,b)=>a-b);
    return +t[Math.floor(t.length/2)].toFixed(1);
  });
  const あり = await 測();
  const 保 = await pg.evaluate(()=>{ const R=window.__rpg.renderer; window.__hold=R._skin; R._skin=null; return true; });
  await new Promise(s=>setTimeout(s,1200));
  const なし = await 測();
  await pg.evaluate(()=>{ window.__rpg.renderer._skin=window.__hold; });
  await new Promise(s=>setTimeout(s,1200));
  const あり2 = await 測();
  console.log("1 コマの 時間（中央値・ソフト描画）");
  console.log("  肌あり :", あり, "ms");
  console.log("  肌なし :", なし, "ms");
  console.log("  肌あり2:", あり2, "ms");
  const 増 = ((あり+あり2)/2 - なし) / なし * 100;
  console.log("  → 肌の 代償: +" + 増.toFixed(1) + "%");
  await b.close();
})();
