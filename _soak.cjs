/* 長く 歩き回って 落ちないかを 見る。実際の 遊びに 近い 動きを させる。 */
const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width: process.argv[3]==="mobile"?390:900, height: process.argv[3]==="mobile"?844:600}})).newPage();
  const 例外=[], err=[];
  pg.on("pageerror", e=>例外.push(String(e.message).slice(0,200)));
  pg.on("console", m=>{ if(m.type()==="error") err.push(m.text().slice(0,200)); });
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier="+(process.argv[3]==="mobile"?"low":"medium")+"&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await pg.waitForTimeout(2500);
  const 秒 = Number(process.argv[2]||120);
  const r = await pg.evaluate(async (秒)=>{
    const r=window.__rpg;
    const t0=performance.now();
    let 歩=0, 攻=0, 拾=0, 潜=0, 出=0;
    const 前持 = r.inv.slots.filter(Boolean).length;
    let dir=0;
    while (performance.now()-t0 < 秒*1000) {
      /* 向きを ときどき 変えて 歩く */
      if (Math.random()<0.02) dir = Math.random()*6.283;
      r.cam.rotate((Math.random()-0.5)*0.03, 0);
      const ax = Math.sin(dir), az = Math.cos(dir);
      for (let i=0;i<3;i++) { r.player.update(1/60, {x:ax,y:az}, r.cam.yaw, Math.random()<0.01, Math.random()<0.3); 歩++; }
      /* 近くの 敵を 叩く／実りを とる */
      if (Math.random()<0.25) { const n=r.inv.slots.filter(Boolean).length; r._tapAct = true; 攻++;
        if (r.inv.slots.filter(Boolean).length>n) 拾++; }
      /* たまに 潜る */
      if (r.近くの入口 && !r.洞窟 && Math.random()<0.5) { if (r.潜る()) 潜++; }
      if (r.洞窟 && Math.random()<0.01) { if (r.出る()) 出++; }
      await new Promise(s=>setTimeout(s,16));
    }
    const P=r.player.pos;
    return { 歩, 攻, 拾, 潜, 出,
      位置: P.map(v=>Math.round(v)), 風: r.terr.at(P[0],P[2]).biome,
      段: r.combat.lv, hp: Math.round(r.player.hp), 敵: r.combat.list.length,
      持: r.inv.slots.filter(Boolean).length, 種類: new Set(r.inv.slots.filter(Boolean).map(s=>s.id)).size,
      節: r.quest.i, 章: r.quest.章 ? r.quest.章.題 : "",
      区画: r.chunks.live.size, 面: r.renderer.stats.tris|0, 描: r.renderer.stats.draws,
      前持 };
  }, 秒);
  console.log(JSON.stringify(r,null,1));
  console.log("例外", 例外.length, 例外.slice(0,5));
  console.log("error", err.length, err.slice(0,5));
  await pg.screenshot({path:SP+"/soak.png"});
  await b.close();
})();
