/* ヘルプ用の 絵を 実機の 画面から 撮る。JPEG・幅 1280（既存に そろえる）。 */
const { chromium } = require("playwright");
const OUT = "client/help/img/";
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const ctx = await b.newContext({viewport:{width:1280,height:800}});
  const pg = await ctx.newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3500);

  /* ① 世界（草原の 昼） */
  await pg.evaluate(()=>{ const r=window.__rpg;
    for(let d=40;d<3000;d+=40) for(let a=0;a<12;a++){
      const x=Math.cos(a/12*6.283)*d, z=Math.sin(a/12*6.283)*d;
      const t=r.terr.at(x,z);
      if(t.biome==="meadow"&&!t.water){ r.player.pos[0]=x;r.player.pos[2]=z;r.player.pos[1]=t.h+1;
        r.cam.snap(r.player.pos,0.9); r.time=10; return; } } });
  await 待(3000);
  await pg.screenshot({path:OUT+"rpg-world.jpg", type:"jpeg", quality:82});
  console.log("① 世界");

  /* ② 作る */
  await pg.evaluate(()=>{ const r=window.__rpg;
    for(const [id,n] of [["ki",40],["ishi",30],["kusa",25],["tetsu_kouseki",12],["dou_kouseki",10],["ita",24],["himo",8]]) r.inv.add(id,n);
    r.hud.開く("craft"); });
  await 待(700);
  await pg.screenshot({path:OUT+"rpg-craft.jpg", type:"jpeg", quality:82});
  console.log("② 作る");

  /* ③ 設計図 */
  await pg.evaluate(()=>{ const r=window.__rpg;
    for (const t of ["cube","slab","post","wall","roof","door","window","fence","stair"]) { r.inv.add("b_ki_"+t,60); r.inv.add("b_ishi_"+t,40); }
    r.combat.exp=4000; r.combat.lv=8;
    r.hud.開く("build"); r.hud._建て方="bp"; r.hud.描く窓(); });
  await 待(700);
  await pg.screenshot({path:OUT+"rpg-build.jpg", type:"jpeg", quality:82});
  console.log("③ 設計図");

  /* ④ 建てた 家 */
  await pg.evaluate(async ()=>{ const r=window.__rpg;
    const BP = await import("/assets/vocabu-survive/rpg/data/blueprints.js");
    r.hud.開く(""); r.設計図を建てる(BP.BP.bighouse);
    let sx=0,sz=0,n=0;
    for (const m of r.build.区.values()) for (const o of m.values()){ sx+=o.x; sz+=o.z; n++; }
    const cx=sx/n, cz=sz/n, yaw=0.9;
    r.player.pos[0]=cx+Math.sin(yaw)*22; r.player.pos[2]=cz+Math.cos(yaw)*22;
    r.player.pos[1]=r.terr.height(r.player.pos[0],r.player.pos[2]);
    r.cam.snap(r.player.pos,yaw); r.cam.pitch=-0.16; r.cam.wantPitch=-0.16;
    r.combat.list.length=0; });
  await 待(3000);
  await pg.screenshot({path:OUT+"rpg-house.jpg", type:"jpeg", quality:82});
  console.log("④ 家");

  /* ⑤ ほらあな */
  const c = await pg.evaluate(()=>{ const r=window.__rpg;
    for (let d=60; d<4000; d+=60) for (let a=0;a<10;a++){
      const x=Math.cos(a/10*6.28)*d, z=Math.sin(a/10*6.28)*d;
      const k=r.caves.近くの(x,z);
      if(k&&k.dist<60){ r.player.pos[0]=k.x;r.player.pos[2]=k.z;r.player.pos[1]=r.terr.height(k.x,k.z)+1;
        r.近くの入口=k; const ok=r.潜る(); r.cam.rotate(0,-0.10); return {ok,名:r.洞窟?r.洞窟.名:""}; } }
    return null; });
  await 待(3000);
  if (c && c.ok) { await pg.screenshot({path:OUT+"rpg-cave.jpg", type:"jpeg", quality:82}); console.log("⑤ ほらあな", c.名); }
  await pg.evaluate(()=>{ const r=window.__rpg; r.洞窟&&r.出る(); });

  /* ⑥ 町と 案内人 */
  const t = await pg.evaluate(async ()=>{ const r=window.__rpg;
    r.inv.add("kin_ka",80);
    for (let d=0; d<3000 && r.行った町.size<3; d+=120) for (let a=0;a<8 && r.行った町.size<3;a++){
      const x=Math.cos(a/8*6.283)*d, z=Math.sin(a/8*6.283)*d;
      const tt=r.terr.nearestTown(x,z); if(!tt||r.行った町.has(tt.id)) continue;
      r.player.pos[0]=tt.x; r.player.pos[2]=tt.z; r.player.pos[1]=r.terr.height(tt.x,tt.z)+1;
      await new Promise(s=>setTimeout(s,600));
    }
    const T=r.town.中身(r.terr.nearestTown(r.player.pos[0],r.player.pos[2]));
    const g=T.人.find(p=>p.役==="guide");
    if(g){ r.player.pos[0]=g.x+1; r.player.pos[2]=g.z+1; r.player.pos[1]=r.terr.height(g.x+1,g.z+1)+1; r.time=11; }
    await new Promise(s=>setTimeout(s,900));
    if(r.近くの人) r.hud.話す();
    return { 人: r.近くの人?r.近くの人.役:"", 町:r.行った町.size };
  });
  await 待(900);
  await pg.screenshot({path:OUT+"rpg-town.jpg", type:"jpeg", quality:82});
  console.log("⑥ 町", JSON.stringify(t));

  /* ⑦ 言葉の 問い */
  await pg.evaluate(()=>{ const r=window.__rpg; r.hud.開く(""); r.words.出す(); });
  await 待(900);
  await pg.screenshot({path:OUT+"rpg-word.jpg", type:"jpeg", quality:82});
  console.log("⑦ 言葉");

  /* ⑧ スマホ */
  const ctx2 = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  const pg2 = await ctx2.newPage();
  await pg2.goto("http://127.0.0.1:8791/rpg-lab.html?tier=low&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg2.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(4000);
  await pg2.screenshot({path:OUT+"rpg-mobile.jpg", type:"jpeg", quality:82});
  console.log("⑧ スマホ");
  await b.close();
})();
