const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/preset",{recursive:true});
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const d of [{n:"PC",w:1440,h:950,m:false},{n:"スマホ",w:390,h:844,m:true}]) {
  const pg = await (await b.newContext({viewport:{width:d.w,height:d.h},deviceScaleFactor:2,isMobile:d.m,hasTouch:d.m})).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,140)));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb="+Date.now(), {waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(4000);
  const hide=()=>pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

  });
  await hide(); await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{ const b=document.querySelector('[data-app-tab="library"]'); if(b) b.click(); });
  await pg.waitForTimeout(2600); await hide(); await pg.waitForTimeout(500);
  console.log("\n== "+d.n+" ==");
  const info = await pg.evaluate(()=>{
    const r=document.getElementById("vqScreens").shadowRoot;
    const cards=r.querySelectorAll(".qc");
    const c0=cards[0];
    return { cards: cards.length,
      banners: r.querySelectorAll(".qc__ban").length,
      icons: r.querySelectorAll(".qc__ico").length,
      blankBan: r.querySelectorAll(".qc__ban.is-blank").length,
      banBg: c0? getComputedStyle(c0.querySelector(".qc__ban")).backgroundColor : "",
      icoTxt: c0? c0.querySelector(".qc__ico").innerText.trim() : "",
      icoBox: c0? (()=>{const a=c0.getBoundingClientRect(),b=c0.querySelector(".qc__ico").getBoundingClientRect();
        return { inside: b.left>=a.left-1 && b.right<=a.right+1 && b.bottom<=a.bottom+1, h:Math.round(b.height) };})() : null,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) };
  });
  console.log("   ", JSON.stringify(info));
  ok(d.n+"：プリセットが並ぶ", info.cards>0, String(info.cards));
  ok(d.n+"：全部にバナーが付く", info.banners===info.cards);
  ok(d.n+"：全部にアイコンが付く", info.icons===info.cards);
  ok(d.n+"：未設定のバナーは白", info.banBg==="rgb(255, 255, 255)", info.banBg);
  ok(d.n+"：アイコンは頭文字で置く", info.icoTxt.length===1, info.icoTxt);
  ok(d.n+"：アイコンがカードから出ない", !!info.icoBox && info.icoBox.inside, JSON.stringify(info.icoBox));
  ok(d.n+"：横にはみ出さない", info.overflow<=1, String(info.overflow));
  ok(d.n+"：画面の失敗が出ていない", errs.length===0, errs.join(" / "));
  await pg.screenshot({path:"shots/preset/"+d.n+"-プリセット.png"});
  await pg.context().close();
  }
  await b.close();
  console.log("\n合格 "+pass+" / 不合格 "+fail);
  process.exit(fail?1:0);
})();
