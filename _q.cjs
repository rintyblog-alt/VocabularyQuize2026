const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"q"+印+"@gmail.com",gradePrefix:"H2",nickname:"q"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3000);
  await pg.evaluate(()=>{document.documentElement.setAttribute("data-theme-mode","dark");
    document.documentElement.style.setProperty("--vq-sat","59px");document.documentElement.style.setProperty("--vq-sab","34px");
    window.dispatchEvent(new Event("resize"));
    ["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(900);
  const 見る=async(名)=>{
    const o=await pg.evaluate(()=>{
      const s=document.getElementById("vqScreens"), tb=document.getElementById("vqTopbar");
      const cs=s?getComputedStyle(s):null;
      const wrap=s&&s.shadowRoot?s.shadowRoot.querySelector(".wrap"):null;
      // ピルの 裏（y=88）に 何が あるか
      const 名前=(e)=>{let x=e.tagName.toLowerCase();if(e.id)x+="#"+e.id;const cl=((e.getAttribute&&e.getAttribute("class"))||"").split(/\s+/).filter(Boolean).slice(0,2);if(cl.length)x+="."+cl.join(".");const r=e.getRootNode();if(r&&r.host)x="«"+r.host.id+"»/"+x;return x;};
      const 一番上の中身=()=>{
        if(!wrap) return null;
        let 最小=1e9, who=null;
        for(const e of wrap.querySelectorAll("*")){
          const b=e.getBoundingClientRect();
          if(b.height<6||b.width<6) continue;
          if(b.top<最小){最小=b.top;who=名前(e)+" "+(e.textContent||"").trim().slice(0,14);}
        }
        return {上端:Math.round(最小), 誰:who};
      };
      return {
        vqScreensの表示: cs?cs.display:"（無し）",
        vqScreensの地: cs?cs.backgroundColor:"",
        vqScreensのz: cs?cs.zIndex:"",
        vqTopbarのz: tb?getComputedStyle(tb).zIndex:"",
        vqTopbarの表示: tb?getComputedStyle(tb).display:"",
        vqsPt: s?s.style.getPropertyValue("--vqs-pt"):"",
        wrapの上余白: wrap?getComputedStyle(wrap).paddingTop:"",
        一番上の中身: 一番上の中身()
      };
    });
    console.log("── "+名, JSON.stringify(o));
  };
  await 見る("ホーム");
  await pg.evaluate(()=>{const b=document.querySelector('.app-tab-btn[data-app-tab="library"]');if(b)b.click();});
  await pg.waitForTimeout(1600); await 見る("プリセット");
  await pg.evaluate(()=>{const b=document.querySelector('.app-tab-btn[data-app-tab="insight"]');if(b)b.click();});
  await pg.waitForTimeout(1600); await 見る("インサイト（旧UI）");
  await br.close();
})();
