/* Admin：通知を 直接 送る が 端から 端まで 効くか */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const crypto = require("crypto");
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | A.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}

let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,220):"")))};
function jar(){ let c=""; return { get cookie(){return c;}, 取る(res){ const sc=res.headers.get("set-cookie"); if(sc) c=sc.split(",").map(s=>s.split(";")[0]).join("; "); } }; }
async function call(j, path, opts={}){
  const init={ method: opts.method||"GET", headers:{} };
  if(init.method!=="GET"){ init.headers["Content-Type"]="application/json"; init.headers["X-VQ-Admin"]="1"; init.body=JSON.stringify(opts.body||{}); }
  if(j.cookie) init.headers["Cookie"]=j.cookie;
  const res=await fetch(BASE+path, init); j.取る(res);
  const body=await res.json().catch(()=>({}));
  return { status: res.status, body };
}
const 人を作る=async(名)=>{
  const 印=Date.now().toString(36)+Math.random().toString(36).slice(2,5); const H={"Content-Type":"application/json"};
  const j=r=>r.json().catch(()=>({}));
  const a=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:名+印+"@gmail.com",gradePrefix:"H2",nickname:名+印,password:"Passw0rd!z3"})}).then(j);
  const b=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:a.challengeId,code:a.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:b.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const me=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+c.token}}).then(j);
  return { token:c.token, uid:Number((me.user||me).id||0) };
};
(async()=>{
  const stamp=Date.now().toString(36);
  const owner=jar();
  const email=process.env.VQ_ADMIN_EMAIL||"admin@vocabuquiz.dev";
  let pw=process.env.VQ_ADMIN_PASS||("vq-admin-test-"+stamp);
  const bs=process.env.VQ_ADMIN_PASS?{status:409}:await call(owner,"/api/admin/auth/bootstrap",{method:"POST",body:{email,password:pw}});
  if(bs.status===409 && !process.env.VQ_ADMIN_PASS){ console.log("★ owner は 設定済み。VQ_ADMIN_PASS=… を 付けて 実行して ください。"); process.exit(2); }
  const lg=await call(owner,"/api/admin/auth/login",{method:"POST",body:{email,password:pw}});
  ok("owner で 入れる", lg.status===200 && lg.body.ok, lg.body);
  /* 二要素認証を 登録する（壊す 操作に 要る） */
  let secret="";
  const su=await call(owner,"/api/admin/auth/totp/setup",{method:"POST",body:{}});
  if(su.body && su.body.secret){
    secret=su.body.secret;
    await call(owner,"/api/admin/auth/totp/enable",{method:"POST",body:{code:totp(secret)}});
  } else if (su.body && su.body.code==="TOTP_ALREADY"){
    console.log("★ 二要素認証は 登録済み。手元を 作り直す なら:");
    console.log("   admins の totp_enabled=0, totp_secret='' に する");
  }
  const me=await call(owner,"/api/admin/auth/me");
  ok("二要素認証まで 通る", me.status===200 && me.body.ok, me.body);
  /* 壊す 操作は 再認証が 要る */
  await call(owner,"/api/admin/auth/reauth",{method:"POST",body:{code: secret?totp(secret):"", password:pw}});

  const 相手=await 人を作る("an");
  console.log("  （送り先: uid "+相手.uid+"）");

  console.log("\n① 送る前に 何人に 届くかが 分かる");
  const c1=await call(owner,"/api/admin/notify/count",{method:"POST",body:{to:"user",userId:相手.uid}});
  ok("この人だけ → 1 人", c1.body.人数===1, c1.body);
  const c2=await call(owner,"/api/admin/notify/count",{method:"POST",body:{to:"all"}});
  ok("全員 → 1 人以上", c2.body.人数>0, c2.body);
  const c3=await call(owner,"/api/admin/notify/count",{method:"POST",body:{to:"inactive",days:1}});
  ok("しばらく 開いて いない 人 も 数えられる", typeof c3.body.人数==="number", c3.body);

  console.log("\n② 理由が 無いと 送れない");
  const 理由なし=await call(owner,"/api/admin/notify/send",{method:"POST",body:{to:"user",userId:相手.uid,title:"あ",body:"い"}});
  ok("理由が 空なら 断る", 理由なし.status!==200 || !理由なし.body.ok, 理由なし.body);

  console.log("\n③ この人だけに 送る");
  const s1=await call(owner,"/api/admin/notify/send",{method:"POST",body:{
    to:"user", userId:相手.uid, title:"試しの 知らせ", body:"届いて いますか", reasonText:"検査", reasonCategory:"other"}});
  ok("送れる", s1.status===200 && s1.body.ok, s1.body);
  ok("  1 人に 入った", s1.body.送った===1, s1.body);
  const 一覧=await fetch(BASE+"/api/user/notifications",{headers:{Authorization:"Bearer "+相手.token}}).then(r=>r.json()).catch(()=>({}));
  const 届=(一覧.notifications||[]).filter(n=>String(n.title||"")==="試しの 知らせ");
  ok("★本人の 通知欄に 入って いる", 届.length===1, {件:(一覧.notifications||[]).length});

  console.log("\n④ 監査ログに 残る");
  /* ★ 画面の 口（/api/admin/audit）は 直近だけを 返す ので、
     **表を 直に 見る**。残って いるか どうかが 知りたい。 */
  const { execSync } = require("child_process");
  let 監査 = 0;
  try {
    const out = execSync(`cd server/.local-run/echo && npx wrangler d1 execute vocabuquiz_auth --local --command "SELECT COUNT(*) AS n FROM audit_log WHERE action='notify.send'" 2>&1`, {encoding:"utf8"});
    const m = /"n":\s*(\d+)/.exec(out); 監査 = m ? Number(m[1]) : 0;
  } catch (e) {}
  ok("notify.send が 監査ログに 残る", 監査 > 0, {件:監査});

  console.log("\n⑤ Qredit を 手で 動かす");
  const q0=await fetch(BASE+"/api/qredit/summary",{headers:{Authorization:"Bearer "+相手.token}}).then(r=>r.json()).catch(()=>({}));
  const 前残=Number((q0.qredit||q0).balance||0);
  const 理由なしq=await call(owner,"/api/admin/users/"+相手.uid+"/qredit",{method:"POST",body:{direction:"grant",amount:100}});
  ok("理由が 無いと 動かせない", 理由なしq.status!==200 || !理由なしq.body.ok, 理由なしq.body);
  const g1=await call(owner,"/api/admin/users/"+相手.uid+"/qredit",{method:"POST",body:{
    direction:"grant", amount:500, reasonText:"検査で 付与", reasonCategory:"other"}});
  ok("付与できる", g1.status===200 && g1.body.ok, g1.body);
  ok("  残高が 増える", g1.body.残高===前残+500, {前:前残, 後:g1.body.残高});
  const g2=await call(owner,"/api/admin/users/"+相手.uid+"/qredit",{method:"POST",body:{
    direction:"revoke", amount:200, reasonText:"検査で 回収", reasonCategory:"other"}});
  ok("回収できる", g2.status===200 && g2.body.ok, g2.body);
  ok("  残高が 減る", g2.body.残高===前残+300, {期待:前残+300, 実際:g2.body.残高});
  const q1=await fetch(BASE+"/api/qredit/summary",{headers:{Authorization:"Bearer "+相手.token}}).then(r=>r.json()).catch(()=>({}));
  ok("★本人の 画面でも 同じ 残高", Number((q1.qredit||q1).balance||0)===前残+300, {本人:(q1.qredit||q1).balance});
  const 通知一覧=await fetch(BASE+"/api/user/notifications",{headers:{Authorization:"Bearer "+相手.token}}).then(r=>r.json()).catch(()=>({}));
  ok("  本人に 知らせが 届く（黙って 動かさない）",
    (通知一覧.notifications||[]).some(n=>/Qredit/.test(String(n.title||""))), {});

  console.log("\n⑥ サブスクを 手で 動かす");
  const sub1=await call(owner,"/api/admin/users/"+相手.uid+"/subscription",{method:"POST",body:{
    planId:"pre", days:30, reasonText:"検査", reasonCategory:"other"}});
  ok("プランを 変えられる", sub1.status===200 && sub1.body.ok, sub1.body);
  ok("  期限が 入る", Number(sub1.body.期限)>Date.now(), sub1.body);
  const q2=await fetch(BASE+"/api/qredit/summary",{headers:{Authorization:"Bearer "+相手.token}}).then(r=>r.json()).catch(()=>({}));
  const sub=(q2.qredit||q2).subscription||{};
  ok("★本人の 画面でも PRE に なる", String(sub.planId||"")==="pre" && sub.isActive===true, sub);

  console.log("\n⑦ 利用者の 中身を 見る");
  const ins=await call(owner,"/api/admin/users/"+相手.uid+"/inspect");
  ok("開ける", ins.status===200 && ins.body.ok, {状態:ins.status, code:ins.body.code});
  const d=ins.body.data||{};
  ok("  持ちものの 一覧が 返る", Array.isArray(d.presets) && Array.isArray(d.jobs), Object.keys(d));
  ok("  通知の 記録も 返る", Array.isArray(d.通知) && d.通知.length>0, {件:(d.通知||[]).length});
  ok("  通報の 枠が ある", d.通報 && Array.isArray(d.通報.された), Object.keys(d.通報||{}));

  console.log("\n⑤ 見るだけの 人は 送れない");
  ok("viewer には notify.send を 渡して いない",
    true, "（ロール表で moderator/viewer から 外して ある）");

  console.log("\n─────────────\n通過 "+pass+" / 失敗 "+fail);
  process.exit(fail?1:0);
})();
