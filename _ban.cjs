/* Ban が 実際に 効くかを 端から 端まで 確かめる */
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const a=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"bn"+印+"@gmail.com",gradePrefix:"H2",nickname:"bn"+印,password:"Passw0rd!z3"})}).then(j);
  const b=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:a.challengeId,code:a.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:b.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const T=c.token;
  const me=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+T}}).then(j);
  const uid=String((me.user||me).id||"");
  console.log("uid =", uid, " token =", String(T).slice(0,12)+"…");
  const 道 = ["/api/auth/me","/api/user/notifications","/api/presets/mine","/api/insight/overview","/api/qredit/summary","/api/notifications/list"];
  const 叩く = async(名)=>{
    console.log("── "+名);
    for(const p of 道){
      const r=await fetch(BASE+p,{headers:{Authorization:"Bearer "+T}});
      let code=""; try{ const t=await r.clone().json(); code=t&&t.code?" "+t.code:""; }catch(e){}
      console.log("   "+String(r.status).padEnd(4)+p+code);
    }
  };
  await 叩く("ban する 前");
  require("fs").writeFileSync("/tmp/_ban.json", JSON.stringify({uid,token:T}));
  console.log("\n→ /tmp/_ban.json に 控えた。次に D1 へ banned を 書いて もう一度 叩く。");
})();
