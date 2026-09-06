/* Ban が 端から 端まで 効くか（サーバ ＋ 画面）*/
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
let pass=0, fail=0;
const ok=(n,c,x)=>{ c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,180):""))); };
const D1=(sql)=>execSync(`cd server/.local-run/echo && npx wrangler d1 execute vocabuquiz_auth --local --command ${JSON.stringify(sql)} 2>&1 | grep -c "executed successfully"`,{encoding:"utf8"}).trim();
(async()=>{
  const 印=Date.now().toString(36); const H={"Content-Type":"application/json"};
  const a=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:"bt"+印+"@gmail.com",gradePrefix:"H2",nickname:"bt"+印,password:"Passw0rd!z3"})}).then(j);
  const b=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:a.challengeId,code:a.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:b.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const T=c.token;
  const me=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+T}}).then(j);
  const uid=String((me.user||me).id||"");
  console.log("試す人: uid="+uid);

  console.log("\n① Ban する 前");
  ok("/api/auth/me の accountStatus は 空", me.accountStatus === null || me.accountStatus === undefined, me.accountStatus);
  const 前=await fetch(BASE+"/api/qredit/summary",{headers:{Authorization:"Bearer "+T}});
  ok("ふつうの API は 通る（200）", 前.status===200, 前.status);

  console.log("\n② Ban を 書く（管理画面と 同じ 表・同じ 値）");
  D1(`INSERT INTO user_status (user_id, state, reason_category, reason_text, suspend_until, scope, notified, changed_by, changed_at, deleted_at) VALUES ('${uid}','banned','spam','試し','','login_blocked',0,'test','2026-09-05T00:00:00Z','') ON CONFLICT(user_id) DO UPDATE SET state='banned', scope='login_blocked', reason_category='spam'`);
  const me2=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+T}}).then(j);
  ok("★/api/auth/me が 止まって いる ことを 知らせる", !!(me2.accountStatus && me2.accountStatus.blocked), me2.accountStatus);
  ok("  状態は banned", me2.accountStatus && me2.accountStatus.state === "banned", me2.accountStatus && me2.accountStatus.state);
  ok("  区分も 返る", me2.accountStatus && me2.accountStatus.reason === "spam", me2.accountStatus && me2.accountStatus.reason);
  for (const [m,p] of [["GET","/api/qredit/summary"],["POST","/api/preset/save"],["POST","/api/aigen/questions"],["GET","/api/feed/timeline"]]) {
    const r=await fetch(BASE+p,{method:m,headers:{Authorization:"Bearer "+T,"Content-Type":"application/json"},body:m==="POST"?"{}":undefined});
    const t=await r.clone().json().catch(()=>({}));
    ok("  "+m+" "+p+" が 423 ACCOUNT_BANNED", r.status===423 && t.code==="ACCOUNT_BANNED", r.status+" "+(t.code||""));
  }

  console.log("\n③ 画面（開いたら 止まる・合言葉が 消える）");
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:793},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  const errs=[]; pg.on("pageerror",e=>errs.push(String(e.message).slice(0,120)));
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},T);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(6000);
  const 出た=await pg.evaluate(()=>{
    const h=document.getElementById("vqBanned");
    if(!h) return {なし:true};
    return {開いている:h.getAttribute("data-open")==="1",
      題:(h.shadowRoot&&h.shadowRoot.querySelector("h1")||{}).textContent||"",
      札:Array.from((h.shadowRoot||h).querySelectorAll(".tag")).map(e=>e.textContent),
      合言葉:localStorage.getItem("app.auth.token.v1"),
      印:document.documentElement.getAttribute("data-vq-banned")};});
  ok("★停止の 1 枚が 出る", 出た.開いている===true, 出た);
  ok("  見出しが 出る", /ご利用いただけません/.test(出た.題||""), 出た.題);
  ok("  区分の 札が 出る", (出た.札||[]).some(x=>/迷惑行為/.test(x)), 出た.札);
  ok("★合言葉が 消える（＝ ログアウト）", !出た.合言葉, 出た.合言葉);
  ok("  html に 印が 付く", 出た.印==="1", 出た.印);
  ok("  画面の 例外 0 件", errs.length===0, errs);

  console.log("\n④ Ban を 解く と 元に 戻る");
  D1(`UPDATE user_status SET state='active', scope='' WHERE user_id='${uid}'`);
  const me3=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+T}}).then(j);
  ok("accountStatus が 空に 戻る", me3.accountStatus===null||me3.accountStatus===undefined, me3.accountStatus);
  const 後=await fetch(BASE+"/api/qredit/summary",{headers:{Authorization:"Bearer "+T}});
  ok("API も 通るように 戻る", 後.status===200, 後.status);

  await br.close();
  console.log("\n─────────────\n通過 "+pass+" / 失敗 "+fail);
  process.exit(fail?1:0);
})();
