const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const r=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"lg"+印+"@gmail.com",gradePrefix:"H2",nickname:"lg"+印,password:"Passw0rd!z3"})}).then(j);
  const v=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:r.challengeId,code:r.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:v.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},c.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForFunction(()=>!!document.getElementById("vqMobBar"),null,{timeout:60000}).catch(()=>{});
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{["vqLumiTour","vqTour","vqInstall","vqNewsFlash","vqPin"].forEach(id=>{const e=document.getElementById(id);if(e)e.remove();});});
  await pg.waitForTimeout(500);
  const o=await pg.evaluate(()=>{
    const h=document.getElementById("vqMobBar");const b=h.shadowRoot.querySelectorAll(".t");
    const e=b[b.length-1];const rr=e.getBoundingClientRect();
    const x=Math.round(rr.left+rr.width/2), y=Math.round(rr.top+rr.height/2);
    const 名=(el)=>el?(el.tagName.toLowerCase()+(el.id?"#"+el.id:"")+(el.className&&typeof el.className==="string"?"."+String(el.className).split(" ")[0]:"")):"—";
    const 積み=[]; let root=document;
    for(let i=0;i<8;i++){const el=root.elementFromPoint(x,y); if(!el)break; 積み.push(名(el)); if(el.shadowRoot){root=el.shadowRoot;continue;} break;}
    return {x,y,積み};
  });
  console.log("設定ボタンの 点:",JSON.stringify(o));
  await pg.mouse.move(o.x,o.y); await pg.mouse.down(); await pg.waitForTimeout(1400); await pg.mouse.up(); await pg.waitForTimeout(500);
  const 出た=await pg.evaluate(()=>!!document.getElementById("vqSafeDiag"));
  console.log("① 長押し(1.4秒) → 診断:",出た);
  if(出た){
    const 中身=await pg.evaluate(()=>{const d=document.getElementById("vqSafeDiag");return Array.from(d.querySelectorAll("b")).slice(0,4).map(b=>b.textContent);});
    console.log("   出た項目:",JSON.stringify(中身));
    await pg.evaluate(()=>{document.getElementById("vqSafeDiag").remove();});
  }
  await pg.mouse.click(o.x,o.y); await pg.waitForTimeout(800);
  console.log("② 短く 押す → 診断は 出ない:",!(await pg.evaluate(()=>!!document.getElementById("vqSafeDiag"))),
              "／ 設定が 開く:",await pg.evaluate(()=>!!(window.__vqSettingsIsOpen&&window.__vqSettingsIsOpen())));
  await br.close();
})();
