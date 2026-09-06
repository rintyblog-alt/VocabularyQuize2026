const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"bx"+印+"@gmail.com",gradePrefix:"H2",nickname:"bx"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3000);
  const 測る=async(名)=>{
    const o=await pg.evaluate(()=>{
      const R=(e)=>{const b=e.getBoundingClientRect();return {上:Math.round(b.top),下:Math.round(b.bottom),高:Math.round(b.height)};};
      const s=document.getElementById("vqScreens");
      const sr=s&&s.shadowRoot;
      const wrap=sr?sr.querySelector(".wrap"):null;
      const scr=sr?sr.querySelector(".screen.on"):null;
      const cs=s?getComputedStyle(s):null;
      return {
        画面高: innerHeight,
        vqScreens: s?R(s):null,
        "  style": s?{top:s.style.top,bottom:s.style.bottom,pt:s.style.getPropertyValue("--vqs-pt"),pb:s.style.getPropertyValue("--vqs-pb")}:null,
        "  computed": cs?{position:cs.position,top:cs.top,bottom:cs.bottom,height:cs.height,overflow:cs.overflowY}:null,
        wrap: wrap?R(wrap):null,
        "  wrapのpadding": wrap?getComputedStyle(wrap).padding:null,
        screen: scr?R(scr):null,
        スクロール: s?{scrollTop:s.scrollTop,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight}:null,
        MobBar: (()=>{const b=document.getElementById("vqMobBar");return b?R(b):null;})()
      };
    });
    console.log("── "+名); console.log(JSON.stringify(o,null,1));
  };
  console.log("═══ 安全領域 なし（いまの ブラウザ）");
  await 測る("プリセット前");
  await pg.evaluate(()=>{document.documentElement.style.setProperty("--vq-sat","59px");
    document.documentElement.style.setProperty("--vq-sab","34px");window.dispatchEvent(new Event("resize"));});
  await pg.waitForTimeout(800);
  console.log("\n═══ 安全領域 59/34 を 入れた あと");
  await 測る("ホーム");
  await br.close();
})();
