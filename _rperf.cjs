const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
(async () => {
  const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  for (const [tier,w,h,name] of [["low",390,844,"スマホ低"],["medium",390,844,"スマホ中"],["high",1280,800,"PC高"],["ultra",1280,800,"PC最高"]]) {
    const ctx = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor: w<500?2:1});
    const pg = await ctx.newPage();
    let err=0; pg.on("pageerror", e=>{err++;console.log("例外:",e.message);});
    await pg.goto("http://127.0.0.1:8791/rpg-lab.html?tier="+tier+"&seed=20260902",{waitUntil:"domcontentloaded"});
    await pg.waitForFunction(()=>window.__rpg&&window.__rpg.ready,null,{timeout:60000});
    await pg.waitForTimeout(2500);
    // 歩きながら 測る
    const r = await pg.evaluate(async ()=>{
      const R=window.__rpg; const t0=performance.now(); let n=0; const 山=[];
      let last=performance.now();
      await new Promise(res=>{
        const id=setInterval(()=>{
          R.player.pos[0]+=1.4; R.cam.snap? null:null;
          const now=performance.now(); 山.push(now-last); last=now; n++;
          if(n>150){clearInterval(id);res();}
        }, 16);
      });
      const s=R.renderer.stats;
      山.sort((a,b)=>a-b);
      return { 面:s.tris|0, 描き:s.draws|0, 並び:s.instances|0,
               中央:Math.round(山[Math.floor(山.length/2)]), 悪い5:Math.round(山[Math.floor(山.length*0.95)]) };
    });
    console.log(name.padEnd(8), tier.padEnd(7), JSON.stringify(r), "例外", err);
    await pg.screenshot({path:SP+"/perf-"+tier+".png"});
    await ctx.close();
  }
  await b.close();
})();
