const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"bb"+印+"@gmail.com",gradePrefix:"H2",nickname:"b"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const 暗 = process.argv[2] !== "light";
  const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  pg.on("pageerror",e=>console.log("ERR",String(e.message).slice(0,140)));
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(3200);
  await pg.evaluate((d)=>{document.documentElement.setAttribute("data-theme-mode",d?"dark":"light");document.documentElement.setAttribute("data-theme",d?"dark":"light");},暗);
  /* 実機（iPhone）の 安全領域を 入れて 測る。black-translucent なので
     時計・ホームインジケータの ぶんは こちらの 責任。 */
  await pg.evaluate(()=>{document.documentElement.style.setProperty("--vq-sat","59px");
    document.documentElement.style.setProperty("--vq-sab","34px");window.dispatchEvent(new Event("resize"));});
  await pg.evaluate(()=>{["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(600);
  const m = await pg.evaluate(()=>{
    const h=document.getElementById("vqMobBar"); if(!h||!h.shadowRoot) return {なし:true};
    const r=h.shadowRoot;
    const bar=r.querySelector(".bar"), t=r.querySelector(".t"), on=r.querySelector(".t.on");
    const mk=r.querySelector(".t.mk .circle"), lb=r.querySelector(".lb");
    const rr=(e)=>{const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),l:Math.round(b.left),b:Math.round(window.innerHeight-b.bottom)};};
    const cs=getComputedStyle(bar);
    return { 器: rr(h), 島: rr(bar), 角: cs.borderTopLeftRadius, ぼかし: cs.backdropFilter,
             地: cs.backgroundColor, 影: cs.boxShadow.slice(0,60),
             項目: r.querySelectorAll(".t").length, 札: r.querySelectorAll(".lb").length,
             札の字: Array.from(r.querySelectorAll(".lb")).map(x=>x.textContent),
             丸: mk?rr(mk):null, いま: on?on.getAttribute("aria-label"):"",
             面: on?getComputedStyle(on,"::before").opacity:"",
             器は素通り: getComputedStyle(h).pointerEvents,
             島は押せる: cs.pointerEvents,
             絵の幅: Math.round(r.querySelector(".ms").getBoundingClientRect().width) };
  });
  console.log(JSON.stringify(m));
  await pg.screenshot({path: 暗?"_bar.png":"_bar_l.png"});
  await br.close();
})();
