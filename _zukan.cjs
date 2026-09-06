const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad"; const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1000,height:700}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(2500);
  const r = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    for (const id of ["ki","ishi","kusa","sakana","tetsu_sword","gin_helm","pan","b_ki_wall","kin_ka","book_kotoba"]) r.inv.add(id,1);
    await new Promise(s=>setTimeout(s,300));
    r.倒した種.add("slime_midori"); r.倒した種.add("kiba_usagi");
    r.hud.開く("quest"); r.hud._図 = true; r.hud.描く窓();
    await new Promise(s=>setTimeout(s,300));
    return { 見: r.見つけた.size, 倒: r.倒した種.size,
             枠: r.hud.paneEl.querySelectorAll(".rh-it").length,
             未: r.hud.paneEl.querySelectorAll(".rh-it.is-un").length,
             字: r.hud.paneEl.textContent.slice(0,80) };
  });
  console.log(JSON.stringify(r));
  await pg.screenshot({path:SP+"/zukan.png"});
  await b.close();
})();
