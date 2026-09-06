/* Admin 画面：新しく 足した 3 つが 画面から 使えるか */
const { chromium } = require("playwright");
const crypto = require("crypto");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,200):"")))};
function base32Decode(s){const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="",out=[];for(const c of String(s).toUpperCase().replace(/=+$/,"")){const i=A.indexOf(c);if(i<0)continue;bits+=i.toString(2).padStart(5,"0");}for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);}
function totp(secret){const c=Math.floor(Date.now()/1000/30);const b=Buffer.alloc(8);b.writeUInt32BE(Math.floor(c/0x100000000),0);b.writeUInt32BE(c>>>0,4);const mac=crypto.createHmac("sha1",base32Decode(secret)).update(b).digest();const o=mac[mac.length-1]&0x0f;const bin=((mac[o]&0x7f)<<24)|(mac[o+1]<<16)|(mac[o+2]<<8)|mac[o+3];return String(bin%1000000).padStart(6,"0");}
(async()=>{
  const stamp=Date.now().toString(36);
  const email=process.env.VQ_ADMIN_EMAIL||"admin@vocabuquiz.dev";
  const pw=process.env.VQ_ADMIN_PASS||("vq-admin-test-"+stamp);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:1280,height:900}});
  const pg=await ctx.newPage();
  const errs=[]; pg.on("pageerror",e=>errs.push(String(e.message).slice(0,140)));
  await pg.goto(BASE+"/admin",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(1500);
  /* 初期設定 → ログイン → 二要素 */
  await pg.evaluate(async([email,pw])=>{
    const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
    await fetch("/api/admin/auth/bootstrap",{method:"POST",headers:H,body:JSON.stringify({email,password:pw})});
    await fetch("/api/admin/auth/login",{method:"POST",headers:H,body:JSON.stringify({email,password:pw})});
  },[email,pw]);
  const su=await pg.evaluate(async()=>{
    const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
    const r=await fetch("/api/admin/auth/totp/setup",{method:"POST",headers:H,body:"{}"});
    return await r.json();
  });
  if(su&&su.secret){
    const code=totp(su.secret);
    await pg.evaluate(async(code)=>{
      const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
      await fetch("/api/admin/auth/totp/enable",{method:"POST",headers:H,body:JSON.stringify({code})});
    },code);
  }
  await pg.goto(BASE+"/admin",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(2500);

  console.log("\n① ナビに「通知を送る」が 出る");
  const nav=await pg.evaluate(()=>Array.from(document.querySelectorAll("#navList a,#navList span,#navList button")).map(e=>e.textContent.trim()));
  ok("ナビに 出る", nav.some(t=>t.indexOf("通知を送る")>=0), nav.slice(0,16));

  console.log("\n② 通知を送る 画面が 開く");
  await pg.goto(BASE+"/admin/notify",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(1800);
  const 部品=await pg.evaluate(()=>({
    宛先:!!document.getElementById("nfTo"), 見出し:!!document.getElementById("nfTitle"),
    本文:!!document.getElementById("nfBody"), 理由:!!document.getElementById("nfReason"),
    数える:!!document.querySelector('[data-act="nfcount"]'), 送る:!!document.querySelector('[data-act="nfsend"]')}));
  ok("宛先・見出し・本文・理由が ある", 部品.宛先&&部品.見出し&&部品.本文&&部品.理由, 部品);
  ok("「何人に届くか見る」「送る」が ある", 部品.数える&&部品.送る, 部品);
  /* 何人に 届くかを 押す */
  await pg.evaluate(()=>{const e=document.getElementById("nfTo"); if(e){e.value="all"; e.dispatchEvent(new Event("change",{bubbles:true}));}});
  await pg.click('[data-act="nfcount"]');
  await pg.waitForTimeout(1500);
  const 人数=await pg.evaluate(()=>document.getElementById("nfCount").textContent);
  ok("★押すと 人数が 出る", /\d+ 人/.test(人数), 人数);

  console.log("\n③ ユーザー詳細に Qredit と 調べが 出る");
  await pg.goto(BASE+"/admin/users",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(2000);
  const 開いた=await pg.evaluate(()=>{
    const b=document.querySelector('[data-act="open"]')||document.querySelector('[data-uid]')
      ||Array.from(document.querySelectorAll("button,a")).find(e=>/詳細|開く/.test(e.textContent||""));
    if(b){b.click();return true;} return false;});
  await pg.waitForTimeout(2200);
  const 詳細=await pg.evaluate(()=>({
    q:!!document.getElementById("qdAmt"), plan:!!document.getElementById("qdPlan"),
    why:!!document.getElementById("qdWhy"), now:(document.getElementById("qdNow")||{}).textContent||"",
    調べ:!!document.querySelector('[data-act="udinspect"]')}));
  ok("Qredit の 欄が 出る", 詳細.q&&詳細.plan&&詳細.why, 詳細);
  ok("★いまの 残高が 読める", /Qredit/.test(詳細.now), 詳細.now);
  ok("「調べる」が ある", 詳細.調べ, 詳細);
  if(詳細.調べ){
    await pg.click('[data-act="udinspect"]');
    await pg.waitForTimeout(2000);
    const 中=await pg.evaluate(()=>(document.getElementById("udInspect")||{}).textContent||"");
    ok("★押すと 手元が 出る", /プリセット|生成の記録|通知/.test(中), 中.slice(0,80));
  }

  ok("画面の 例外 0 件", errs.length===0, errs);
  await br.close();
  console.log("\n─────────────\n通過 "+pass+" / 失敗 "+fail);
  process.exit(fail?1:0);
})();
