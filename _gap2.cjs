const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"g2"+印+"@gmail.com",gradePrefix:"H2",nickname:"g2"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:793},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{document.documentElement.style.setProperty("--vq-sab","34px");window.dispatchEvent(new Event("resize"));
    ["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(900);
  const 送る=async()=>{for(let i=0;i<3;i++){await pg.evaluate(()=>{const f=(r)=>{for(const e of r.querySelectorAll("*")){if(e.shadowRoot)f(e.shadowRoot);if(e.scrollHeight>e.clientHeight+8)e.scrollTop=e.scrollHeight;}};f(document);window.scrollTo(0,document.body.scrollHeight);});await pg.waitForTimeout(350);}};
  const 見る=async(名)=>{
    await 送る();
    const o=await pg.evaluate(()=>{
      const h=document.getElementById("vqMobBar");const bar=h.shadowRoot.querySelector(".bar");
      const s=document.getElementById("vqScreens");
      const 島上=Math.round(bar.getBoundingClientRect().top), 島下=Math.round(bar.getBoundingClientRect().bottom);
      // 送り切った あと、いちばん 下に ある 中身
      /* いま 出ている 画面の 中身だけを 見る（#vqScreens の .wrap、なければ main） */
      let 最下=0, 誰="";
      const 根 = (s&&getComputedStyle(s).display!=="none"&&s.shadowRoot)
        ? s.shadowRoot.querySelector(".wrap") : document.querySelector("main");
      const 見=(root)=>{ if(!root) return; for(const e of root.querySelectorAll("*")){
        if(e.shadowRoot)見(e.shadowRoot);
        if(e.checkVisibility&&!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
        const b=e.getBoundingClientRect(); if(b.width<8||b.height<8)continue;
        const 字=Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim());
        if(!字)continue;
        if(b.bottom>最下){最下=Math.round(b.bottom);誰=(e.className&&String(e.className).split(" ")[0]||e.tagName)+" "+(e.textContent||"").trim().slice(0,14);}
      }};
      見(根);
      const 使っている = s&&getComputedStyle(s).display!=="none" ? "#vqScreens" : "main";
      const wrap = s&&s.shadowRoot?s.shadowRoot.querySelector(".wrap"):null;
      return {器:使っている, 画面高:innerHeight, 島の上:島上, 島の下:島下,
        中身のいちばん下:最下, 誰,
        "★島の 下端と 中身の 下端の 差（0 に 近いほど 隙間なし）":島下-最下,
        "島の 下の 空き":Math.round(innerHeight-島下),
        "vqs-pb": s?s.style.getPropertyValue("--vqs-pb"):"—",
        "wrap の 下余白": wrap?getComputedStyle(wrap).paddingBottom:"—",
        "vqs-pbc": s?s.style.getPropertyValue("--vqs-pbc"):"—",
        "main の 下余白": (()=>{const m=document.querySelector("main");return m?getComputedStyle(m).paddingBottom:"—";})()};
    });
    console.log("── "+名+"  "+JSON.stringify(o));
  };
  await 見る("ホーム");
  for(const t of ["library","insight","news"]){
    await pg.evaluate((t)=>{const b=document.querySelector('.app-tab-btn[data-app-tab="'+t+'"]');if(b)b.click();},t);
    await pg.waitForTimeout(1700); await 見る(t);
  }
  await br.close();
})();
