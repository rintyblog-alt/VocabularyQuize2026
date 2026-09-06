/* standalone を 模して、下端の ずれが 埋まるかを 見る */
const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"gp"+印+"@gmail.com",gradePrefix:"H2",nickname:"gp"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:793},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  /* iOS の 実測を 模す: 安全領域 59/34、実画面 852、innerHeight 793 → ずれ 59 */
  await pg.evaluate(()=>{
    const de=document.documentElement;
    de.style.setProperty("--vq-sat","59px");
    de.style.setProperty("--vq-sab","34px");
    de.style.setProperty("--vq-vh-gap","59px");   /* standalone を 模す */
    window.dispatchEvent(new Event("resize"));
  });
  await pg.waitForTimeout(900);
  const o=await pg.evaluate(()=>{
    const R=(e)=>{const b=e.getBoundingClientRect();return {上:Math.round(b.top),下:Math.round(b.bottom),高:Math.round(b.height)};};
    const h=document.getElementById("vqMobBar"), s=document.getElementById("vqScreens");
    const bar=h.shadowRoot.querySelector(".bar");
    return {
      "innerHeight（iOS が 言う 高さ）": innerHeight,
      "実画面（lvh 相当）": innerHeight+59,
      "器 #vqMobBar": R(h), "島 .bar": R(bar), "#vqScreens": R(s),
      "島の 下端は 実画面の 下から": (innerHeight+59) - Math.round(bar.getBoundingClientRect().bottom),
      "器の 下端は 実画面の 下から": (innerHeight+59) - Math.round(h.getBoundingClientRect().bottom),
      "vqScreens の 下端は 実画面の 下から": (innerHeight+59) - Math.round(s.getBoundingClientRect().bottom)
    };
  });
  console.log(JSON.stringify(o,null,1));
  await br.close();
})();
