const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:760}})).newPage();
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await pg.waitForTimeout(4000);
  const r = await pg.evaluate(()=>{
    const R=window.__rpg.renderer, out=[];
    for(const [id,e] of R.meshes) out.push([id, e.lods[0].count/3, e.buckets.reduce((a,b)=>a+b.n,0)]);
    // バッチ
    const bt={}; for(const h of R._batchList||[]) bt[h.meshId]=(bt[h.meshId]||0)+h.n;
    const rows=[];
    for(const [id,tri,n] of out){ const nb=(bt[id]||0); const tot=(n+nb)*tri; if(tot>0) rows.push([id,tri,n+nb,Math.round(tot)]); }
    rows.sort((a,b)=>b[3]-a[3]);
    return { 合計: R.stats.tris|0, 描き:R.stats.draws, 上位: rows.slice(0,16) };
  });
  console.log("合計 面", r.合計, "描き", r.描き);
  for(const [id,tri,n,tot] of r.上位) console.log("  "+id.padEnd(20), "面/個", String(tri).padStart(4), "個", String(n).padStart(6), "計", String(tot).padStart(8));
  await b.close();
})();
