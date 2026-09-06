const { chromium } = require("playwright");
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
const 待=m=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch({args:["--use-gl=angle","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1200,height:820}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await pg.goto("http://127.0.0.1:8791/index.html",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("appSurvivePage"),null,{timeout:60000});
  await pg.evaluate(() => { const f=()=>{ document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e=document.getElementById(id); if(e){e.classList.add("hidden"); e.style.display="none";} } }; f(); setInterval(f,150); });
  await 待(2500);
  const r = await pg.evaluate(()=>{
    const H = window.VQHELP;
    const ids = H.ARTICLES.map(a=>a.id);
    const 新 = ["survive-rpg","survive-rpg-gather","survive-rpg-build","survive-rpg-cave","survive-rpg-town","survive-rpg-story"];
    const 無 = 新.filter(i=>!ids.includes(i));
    /* 絵が 実在するか */
    const imgs = [];
    for (const a of H.ARTICLES) for (const bl of a.body||[]) if (bl.t==="img") imgs.push(bl.src);
    return { 記事: H.ARTICLES.length, 新, 無, 絵: Array.from(new Set(imgs)) };
  });
  console.log("記事", r.記事, "足りない", r.無);
  /* 絵が 200 で 返るか */
  let ng=0;
  for (const src of r.絵) {
    const res = await pg.evaluate(async (s)=>{ const q=await fetch("/help/img/"+s); return q.status; }, src);
    if (res!==200) { ng++; console.log("  絵が 無い:", src, res); }
  }
  console.log("絵", r.絵.length, "NG", ng);
  /* 画面で 開く */
  const 開 = await pg.evaluate(async ()=>{
    if (window.__vqHelp && window.__vqHelp.open) { window.__vqHelp.open("survive-rpg-build"); return "open(id)"; }
    return Object.keys(window).filter(k=>/help/i.test(k)).join(",");
  });
  console.log("開きかた:", 開);
  await 待(1500);
  await pg.screenshot({path:SP+"/help-rpg.png"});
  await b.close();
})();
