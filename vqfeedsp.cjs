/* スマホ幅の Feed を見る。 */
const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/feedsp",{recursive:true});
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true })).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,140)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil:"domcontentloaded" });
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1", t), TOKEN);
  await pg.reload({ waitUntil:"domcontentloaded" });
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    document.body.setAttribute("data-app-tab","inbox");});
  await pg.waitForTimeout(2600);
  await pg.screenshot({ path:"shots/feedsp/01.png" });

  const m = await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const g=(s)=>{const e=r.querySelector(s); if(!e)return null;const b=e.getBoundingClientRect();
      return {w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),left:Math.round(b.left)};};
    const wrap=r.querySelector(".wrap");
    /* はみ出している要素 */
    const over=[];
    r.querySelectorAll("*").forEach(e=>{
      const b=e.getBoundingClientRect();
      if(b.width>0 && (b.right>window.innerWidth+1 || b.left<-1))
        over.push({cls:(e.className&&e.className.toString&&e.className.toString().slice(0,34))||e.tagName,
                   l:Math.round(b.left), rt:Math.round(b.right)});
    });
    /* 下のナビと重なっていないか */
    const nav=document.querySelector('.app-tabs, .app-bottom-nav, [class*="bottom"]');
    const nb=nav?nav.getBoundingClientRect():null;
    const last=r.querySelector(".post:last-child");
    return { wrap:g(".wrap"), col:g(".col"), tabs:g(".tabs"), comp:g(".comp"),
             acts:g(".acts"), attbar:g(".attbar"),
             over:over.slice(0,6),
             navTop: nb?Math.round(nb.top):null,
             lastPostBottom: last?Math.round(last.getBoundingClientRect().bottom):null,
             docOverflow: Math.max(0, document.documentElement.scrollWidth-document.documentElement.clientWidth) };
  });
  console.log(JSON.stringify(m,null,1));
  console.log("JS エラー:", errs.length?errs.join(" / "):"なし");
  await b.close();
})();
