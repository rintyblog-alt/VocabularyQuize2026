const { chromium } = require("playwright");
const OUT = "client/help/img/";
const SP="/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/924447ce-dcff-4fe8-a177-a097280139fa/scratchpad";
const 待=m=>new Promise(s=>setTimeout(s,m));
const 素 = async (pg)=>{
  await pg.goto("http://127.0.0.1:8791/index.html",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("appSurvivePage"),null,{timeout:60000});
  await pg.evaluate(() => { const f=()=>{ document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewsFlash"]) {
      const e=document.getElementById(id); if(e){e.classList.add("hidden"); e.style.display="none";} } }; f(); setInterval(f,150); });
  await 待(2500);
};
(async () => {
  const b = await chromium.launch({args:["--use-gl=angle","--enable-unsafe-swiftshader"]});
  const pg = await (await b.newContext({viewport:{width:1200,height:820}})).newPage();
  pg.on("pageerror", e=>console.log("例外:", e.message));
  await 素(pg);
  /* ① 入れかたの 案内（PC） */
  await pg.evaluate(()=>{ if(window.__vqInstall && window.__vqInstall.open) window.__vqInstall.open(); });
  await 待(1800);
  await pg.screenshot({path:OUT+"install-pc.jpg", type:"jpeg", quality:84});
  console.log("① install-pc");
  /* ② スマホの 段 */
  const ok = await pg.evaluate(()=>{
    const root = document.getElementById("vqInstall");
    const sr = root && (root.shadowRoot || root);
    if(!sr) return "root なし";
    const bs = [...sr.querySelectorAll("button")].map(b=>b.textContent.trim());
    const t = [...sr.querySelectorAll("button")].find(b=>/スマホ/.test(b.textContent));
    if(t){ t.click(); return "押した"; }
    return bs.join("|").slice(0,200);
  });
  console.log("  タブ:", ok);
  await 待(1800);
  await pg.screenshot({path:OUT+"install-mobile.jpg", type:"jpeg", quality:84});
  console.log("② install-mobile");
  /* 閉じる */
  await pg.evaluate(()=>{ const r=document.getElementById("vqInstall"); if(r) r.remove(); });
  await 待(400);
  /* ③ ヘルプ記事 */
  await pg.evaluate(()=>{ window.__vqHelp.open(); });
  await 待(900);
  const 押 = await pg.evaluate(()=>{
    const root = document.getElementById("vqHelp") || document.querySelector(".vqhelp-root");
    const sr = (root && root.shadowRoot) || document;
    const a = [...sr.querySelectorAll("*")].find(e=>e.textContent && e.textContent.trim()==="建てる・設計図（さがす）");
    if(!a) return "見つからない";
    (a.closest("button")||a).click(); return "押した";
  });
  console.log("  記事:", 押);
  await 待(1400);
  await pg.screenshot({path:SP+"/help-rpg.png"});
  console.log("③ ヘルプ");
  await b.close();
})();
