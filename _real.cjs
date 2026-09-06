/* 実機（standalone・innerHeight が 59px 短い）を そっくり 模して 測る */
const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"rl"+印+"@gmail.com",gradePrefix:"H2",nickname:"rl"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  /* iOS の standalone: 画面 852 だが innerHeight は 793 */
  const ctx=await br.newContext({viewport:{width:393,height:793},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript((t)=>{
    localStorage.setItem("app.auth.token.v1",t); localStorage.setItem("app.auth.mode.v1","user");
    /* standalone に 見せる ＋ 実画面 852 */
    try{Object.defineProperty(navigator,"standalone",{get:()=>true});}catch(e){}
    try{Object.defineProperty(screen,"height",{get:()=>852});Object.defineProperty(screen,"availHeight",{get:()=>852});}catch(e){}
  },c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(4000);
  await pg.evaluate(()=>{document.documentElement.setAttribute("data-theme-mode","dark");
    document.documentElement.style.setProperty("--vq-sat","59px");
    document.documentElement.style.setProperty("--vq-sab","34px");
    ["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(1200);
  const o=await pg.evaluate(()=>{
    const 実 = 852;
    const R=(e)=>{const b=e.getBoundingClientRect();return {上:Math.round(b.top),下:Math.round(b.bottom),下からの空き:実-Math.round(b.bottom)};};
    const h=document.getElementById("vqMobBar"), s=document.getElementById("vqScreens");
    const bar=h&&h.shadowRoot?h.shadowRoot.querySelector(".bar"):null;
    return {
      "innerHeight": innerHeight, "実画面": 実,
      "--vq-vh-gap": getComputedStyle(document.documentElement).getPropertyValue("--vq-vh-gap").trim(),
      "器 #vqMobBar": h?R(h):null, "器の bottom(inline)": h?h.style.bottom:"—",
      "島 .bar": bar?R(bar):null,
      "#vqScreens": s?R(s):null, "画面の器の bottom(inline)": s?s.style.bottom:"—"
    };
  });
  console.log(JSON.stringify(o,null,1));
  await pg.screenshot({path:"_real.png"});
  await br.close();
})();
