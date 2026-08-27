const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/feed",{recursive:true});
const TOKEN = process.env.VQ_TOKEN || "";
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const d of [{n:"PC",w:1440,h:950,m:false},{n:"スマホ",w:390,h:844,m:true}]) {
  const pg = await (await b.newContext({viewport:{width:d.w,height:d.h},deviceScaleFactor:2,isMobile:d.m,hasTouch:d.m})).newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb="+Date.now(), {waitUntil:"domcontentloaded"});
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1",t), TOKEN);
  await pg.reload({waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(3600);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    document.body.setAttribute("data-app-tab","inbox");
  });
  await pg.waitForTimeout(3000);
  await pg.evaluate(()=>{document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());});
  await pg.waitForTimeout(600);
  const info = await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const sc=r.querySelector(".scard");
    return { cards: r.querySelectorAll(".scard").length,
      txt: sc? sc.innerText.replace(/\s+/g," ").trim().slice(0,160):"",
      stats: sc? sc.querySelectorAll(".scard-i").length:0,
      labels: sc? Array.from(sc.querySelectorAll(".scard-i > span")).map(x=>x.innerText.trim()):[],
      note: !!(sc && sc.querySelector(".scard-n")),
      h: sc? Math.round(sc.getBoundingClientRect().height):0,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) };
  });
  console.log(d.n, JSON.stringify(info,null,0));
  // 学習結果のカードまでスクロール
  await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const a=r.querySelector(".scard"); if(a) a.scrollIntoView({block:"center"});
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());
  });
  await pg.waitForTimeout(600);
  await pg.screenshot({path:"shots/feed/"+d.n+"-学習結果カード.png"});
  await pg.context().close();
  }
  await b.close();
})();
