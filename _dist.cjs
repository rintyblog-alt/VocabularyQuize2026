const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:600,height:400}})).newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const t=window.__rpg.terr; const c={}; let 水=0, n=0;
    for(let z=-4000;z<=4000;z+=80) for(let x=-4000;x<=4000;x+=80){
      const a=t.at(x,z); n++;
      if(a.water){水++; continue;}
      c[a.biome]=(c[a.biome]||0)+1;
    }
    const out={}; for(const k in c) out[k]=+(c[k]/n*100).toFixed(1);
    return { 陸: Object.fromEntries(Object.entries(out).sort((a,b)=>b[1]-a[1])), 水:+(水/n*100).toFixed(1), 点:n };
  }),null,1));
  await b.close();
})();
