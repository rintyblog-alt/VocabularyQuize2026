/* 実際に キーと マウスで 動くかを 測る（合成の 入力では なく、本物の 出来事）。 */
const { chromium } = require("playwright");
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:600}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
  await 待(3000);

  const 位 = () => pg.evaluate(()=>window.__rpg.player.pos.slice());
  const 向 = () => pg.evaluate(()=>+window.__rpg.cam.yaw.toFixed(3));

  /* ① キーボード W */
  const a0 = await 位();
  await pg.keyboard.down("w"); await 待(1200); await pg.keyboard.up("w");
  await 待(300);
  const a1 = await 位();
  console.log("W を 1.2 秒:", Math.hypot(a1[0]-a0[0], a1[2]-a0[2]).toFixed(2)+"m");

  /* ② キーが 入って いるか */
  console.log("keys:", JSON.stringify(await pg.evaluate(()=>{
    const k=window.__rpg.input.keys; const o={}; for(const n in k) if(k[n]) o[n]=1; return o; })));

  /* ③ マウスで 見回す */
  const y0 = await 向();
  await pg.mouse.move(450,300); await pg.mouse.down();
  for(let i=0;i<20;i++){ await pg.mouse.move(450+i*10,300); await 待(16); }
  await pg.mouse.up(); await 待(300);
  const y1 = await 向();
  console.log("マウスで 引っぱった:", "yaw", y0, "→", y1, (Math.abs(y1-y0)>0.05?"◯ 回った":"× 回らない"));

  /* ④ どの 要素が 受け取って いるか */
  console.log("画面の 真ん中に あるもの:", await pg.evaluate(()=>{
    const e=document.elementFromPoint(450,300);
    let s=[], x=e; while(x && s.length<4){ s.push(x.className||x.tagName); x=x.parentElement; }
    return s.join(" < ");
  }));
  await b.close();
})();
