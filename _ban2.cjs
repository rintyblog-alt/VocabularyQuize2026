const BASE="http://127.0.0.1:8791";
const {uid,token}=require("/tmp/_ban.json");
(async()=>{
  console.log("── ban を D1 に 書いた あと（uid "+uid+"）");
  const 道=[["GET","/api/auth/me"],["GET","/api/user/notifications"],["GET","/api/qredit/summary"],
            ["POST","/api/preset/save"],["POST","/api/aigen/questions"],["GET","/api/feed/timeline"]];
  for(const [m,p] of 道){
    const r=await fetch(BASE+p,{method:m,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:m==="POST"?"{}":undefined});
    let code=""; try{const t=await r.clone().json(); code=t&&t.code?"  "+t.code:"";}catch(e){}
    console.log("   "+String(r.status).padEnd(4)+m.padEnd(5)+p+code);
  }
})();
