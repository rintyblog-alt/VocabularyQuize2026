const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const mob = process.argv[2]==="mobile";
  const pg = await (await b.newContext({viewport:{width:mob?390:1100,height:mob?844:720},deviceScaleFactor:mob?2:1})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(3000);
  // 材料を 入れて 見ごたえを 出す
  await pg.evaluate(()=>{ const r=window.__rpg;
    for (const [id,n] of [["ki",40],["ishi",30],["kusa",25],["tetsu_kouseki",12],["dou_kouseki",10],
      ["nuno",8],["kawa",6],["ito",10],["kin_ka",30],["pan",4],["yakuso",6]]) r.inv.add(id,n);
    r.combat.exp = 900; r.combat.lv = 6;
  });
  for (const [tab,name] of [["inv","持ちもの"],["craft","作る"],["build","建てる"],["story","物語"]]) {
    const ok = await pg.evaluate((t)=>{ const r=window.__rpg;
      const btns=[...r.hud.el.querySelectorAll(".rh-tab")];
      const b=btns.find(x=>x.dataset.tab===t)||btns[["inv","craft","build","story"].indexOf(t)];
      if(!b) return false; b.click(); return true; }, tab);
    await pg.waitForTimeout(900);
    await pg.screenshot({path:SP+"/pane-"+tab+(mob?"-m":"")+".png"});
    console.log(name, ok);
  }
  await b.close();
})();
