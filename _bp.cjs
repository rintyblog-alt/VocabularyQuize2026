const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1100,height:720}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(3000);
  const r = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.combat.exp=4000; r.combat.lv=8;
    for (const t of ["cube","slab","post","wall","roof","door","window","fence","stair"]) {
      r.inv.add("b_ki_"+t, 60); r.inv.add("b_ishi_"+t, 40);
    }
    r.hud.開く("build"); r.hud._建て方="bp"; r.hud.描く窓();
    await new Promise(s=>setTimeout(s,400));
    const 行 = r.hud.paneEl.querySelectorAll(".rh-bp").length;
    const 押せる = [...r.hud.paneEl.querySelectorAll(".rh-bp button")].filter(b=>!b.disabled).length;
    return { 行, 押せる };
  });
  console.log("設計図の行:", JSON.stringify(r));
  await pg.screenshot({path:SP+"/pane-bp.png"});
  const r2 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    const BP = await import("/assets/vocabu-survive/rpg/data/blueprints.js");
    const 前 = r.build.数();
    const res = r.設計図を建てる(BP.BP.house);
    r.hud.開く("");
    return { res, 前, 後: r.build.数() };
  });
  console.log("建てた:", JSON.stringify(r2));
  await pg.evaluate(()=>{ const r=window.__rpg;
    /* 建てた ものの 真ん中を 出して、そこから 離れて 見おろす */
    let sx=0,sz=0,n=0;
    for (const m of r.build.区.values()) for (const o of m.values()){ sx+=o.x; sz+=o.z; n++; }
    const cx=sx/n, cz=sz/n;
    const yaw=0.9; /* 前は (−sin,−cos) なので これで 真ん中を 向く */
    r.player.pos[0]=cx+Math.sin(yaw)*20; r.player.pos[2]=cz+Math.cos(yaw)*20;
    r.player.pos[1]=r.terr.height(r.player.pos[0], r.player.pos[2]);
    r.cam.snap(r.player.pos, yaw);
    r.cam.pitch = -0.24; r.cam.wantPitch = -0.24;
    r.cam.distance = 26; r.cam.wantDistance = 26; r.cam.maxDistance = 40;
    r.combat.list.length = 0;
    if (r.hud) r.hud.開く("");
  });
  await pg.waitForTimeout(3000);
  await pg.screenshot({path:SP+"/bp-house.png"});
  await b.close();
})();
