const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"sh"+印+"@gmail.com",gradePrefix:"H2",nickname:"sh"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const 暗 = process.argv[2] !== "light";
  const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3200);
  await pg.evaluate((d)=>{document.documentElement.setAttribute("data-theme-mode",d?"dark":"light");},暗);
  await pg.evaluate(()=>{document.documentElement.style.setProperty("--vq-sat","59px");
    document.documentElement.style.setProperty("--vq-sab","34px");window.dispatchEvent(new Event("resize"));
    ["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(900);
  const 印を消す=async()=>{await pg.evaluate(()=>{const t=document.getElementById("__ruler");if(t)t.remove();});};
  /* 時計の 位置に 目印（実機の 時計に 見立てる） */
  await pg.evaluate(()=>{
    const d=document.createElement("div"); d.id="__ruler";
    d.style.cssText="position:fixed;left:0;top:0;right:0;height:59px;z-index:2147483647;pointer-events:none;font:700 15px/59px -apple-system,sans-serif;color:#fff;text-shadow:0 0 3px #000;padding-left:26px;";
    d.textContent="23:30"; document.body.appendChild(d);
  });
  const 撮る=async(名)=>{ await pg.screenshot({path:名, clip:{x:0,y:0,width:390,height:170}}); };
  await 撮る(暗?"_top_home.png":"_top_home_l.png");
  await pg.evaluate(()=>{const b=document.querySelector('.app-tab-btn[data-app-tab="library"]');if(b)b.click();});
  await pg.waitForTimeout(1800);
  await 撮る(暗?"_top_lib.png":"_top_lib_l.png");
  await 印を消す();
  await pg.screenshot({path: 暗?"_full.png":"_full_l.png"});
  await br.close();
})();
