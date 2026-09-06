const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:900,height:560}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier=high&seed=20260902",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:45000});
  await pg.waitForTimeout(2500);
  // 岩の 前に 立つ
  const r = await pg.evaluate(()=>{
    const R=window.__rpg;
    for (const c of R.chunks.live.values()){
      if(c.props && c.props.岩 && c.props.岩.length){
        const k=c.props.岩[0];
        R.player.pos[0]=k[0]+3; R.player.pos[2]=k[2]+3; R.player.pos[1]=R.terr.height(k[0]+3,k[2]+3);
        R.cam.snap(R.player.pos, Math.atan2(-3,-3));
        return {x:k[0],z:k[2],s:k[3]};
      }
    }
    return null;
  });
  console.log("岩:",JSON.stringify(r));
  await pg.waitForTimeout(2200);
  await pg.screenshot({path:SP+"/cull-on.png"});
  await pg.evaluate(()=>{ const R=window.__rpg.renderer, g=R.gl;
    const orig = R.end.bind(R);
    R.end = function(dt){ g.disable(g.CULL_FACE); orig(dt); g.disable(g.CULL_FACE); };
  });
  await pg.waitForTimeout(2200);
  await pg.screenshot({path:SP+"/cull-off.png"});
  await b.close();
})();
