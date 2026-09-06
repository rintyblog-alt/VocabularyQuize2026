/* 「前に 進む」が 本当に カメラの 前か を 測る。 */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await new Promise(s=>setTimeout(s,2500));
  console.log(JSON.stringify(await pg.evaluate(()=>{
    const r=window.__rpg;
    r.cam.snap(r.player.pos, 0);
    const 目 = r.cam.pos.slice ? r.cam.pos.slice() : [r.cam.pos[0],r.cam.pos[1],r.cam.pos[2]];
    const P0 = r.player.pos.slice();
    /* カメラの 前 = 見ている 向き（目 → 人）*/
    const fx = P0[0]-目[0], fz = P0[2]-目[2];
    const L = Math.hypot(fx,fz)||1;
    const 前 = [ +(fx/L).toFixed(2), +(fz/L).toFixed(2) ];
    const 試 = (名, ax, ay) => {
      r.player.pos[0]=P0[0]; r.player.pos[2]=P0[2]; r.player.pos[1]=P0[1];
      r.player.vel[0]=r.player.vel[1]=r.player.vel[2]=0;
      for(let i=0;i<60;i++) r.player.update(1/60,{x:ax,y:ay},0,false,false);
      const dx=r.player.pos[0]-P0[0], dz=r.player.pos[2]-P0[2];
      const l=Math.hypot(dx,dz)||1;
      /* カメラの 右 = 前を 90 度 回した もの */
      const 右 = [-前[1], 前[0]];
      const 内 = (dx/l)*前[0] + (dz/l)*前[1];
      const 横 = (dx/l)*右[0] + (dz/l)*右[1];
      let 判 = "?";
      if (内 > 0.7) 判 = "前へ"; else if (内 < -0.7) 判 = "後ろへ";
      else if (横 > 0.7) 判 = "右へ"; else if (横 < -0.7) 判 = "左へ";
      return { 名, 進んだ:+l.toFixed(2), 前と:+内.toFixed(2), 右と:+横.toFixed(2), 実際: 判 };
    };
    return { カメラの前:前,
      上: 試("棒を 上へ / W", 0, -1),
      下: 試("棒を 下へ / S", 0, 1),
      右: 試("棒を 右へ / D", 1, 0),
      左: 試("棒を 左へ / A", -1, 0) };
  }),null,1));
  await b.close();
})();
