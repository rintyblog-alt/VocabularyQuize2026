/* Admin を スマホ幅で 見て、崩れて いる ところを 数える */
const { chromium } = require("playwright");
const crypto = require("crypto");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
function base32Decode(s){const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="",out=[];for(const c of String(s).toUpperCase().replace(/=+$/,"")){const i=A.indexOf(c);if(i<0)continue;bits+=i.toString(2).padStart(5,"0");}for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);}
function totp(secret){const c=Math.floor(Date.now()/1000/30);const b=Buffer.alloc(8);b.writeUInt32BE(Math.floor(c/0x100000000),0);b.writeUInt32BE(c>>>0,4);const mac=crypto.createHmac("sha1",base32Decode(secret)).update(b).digest();const o=mac[mac.length-1]&0x0f;const bin=((mac[o]&0x7f)<<24)|(mac[o+1]<<16)|(mac[o+2]<<8)|mac[o+3];return String(bin%1000000).padStart(6,"0");}
(async()=>{
  const stamp=Date.now().toString(36);
  const email="admin@vocabuquiz.dev";
  const pw=process.env.VQ_ADMIN_PASS||("vq-admin-test-"+stamp);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const pg=await ctx.newPage();
  await pg.goto(BASE+"/admin",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(1200);
  await pg.evaluate(async([email,pw])=>{
    const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
    await fetch("/api/admin/auth/bootstrap",{method:"POST",headers:H,body:JSON.stringify({email,password:pw})});
    await fetch("/api/admin/auth/login",{method:"POST",headers:H,body:JSON.stringify({email,password:pw})});
  },[email,pw]);
  const su=await pg.evaluate(async()=>{const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
    return await (await fetch("/api/admin/auth/totp/setup",{method:"POST",headers:H,body:"{}"})).json();});
  if(su&&su.secret){const code=totp(su.secret);
    await pg.evaluate(async(code)=>{const H={"Content-Type":"application/json","X-VQ-Admin":"1"};
      await fetch("/api/admin/auth/totp/enable",{method:"POST",headers:H,body:JSON.stringify({code})});},code);}

  const 画面=["dashboard","users","providers","flags","announcements","notify","audit"];
  for(const k of 画面){
    const path = k==="dashboard" ? "/admin" : "/admin/"+k;
    await pg.goto(BASE+path,{waitUntil:"domcontentloaded"});
    await pg.waitForTimeout(2200);
    const m=await pg.evaluate(()=>{
      const de=document.documentElement;
      const 横 = de.scrollWidth - de.clientWidth;
      /* 画面より 外へ 出て いる もの */
      const はみ出し=[];
      document.querySelectorAll("*").forEach(e=>{
        const r=e.getBoundingClientRect();
        if(r.width<4||r.height<4) return;
        if(r.right > innerWidth+2 || r.left < -2){
          /* 隠して ある 引き出し（左へ どけた もの）の 中身は 数えない */
          if(e.closest && e.closest("#scSide")) return;
          const cs=getComputedStyle(e);
          if(cs.display==="none"||cs.visibility==="hidden") return;
          /* 中で 横に すべる 器の 中身は 除く */
          let p=e.parentElement, 中で流れる=false;
          while(p&&p!==document.body){ const pc=getComputedStyle(p);
            if(pc.overflowX==="auto"||pc.overflowX==="scroll"){中で流れる=true;break;} p=p.parentElement; }
          if(中で流れる) return;
          はみ出し.push((e.id?"#"+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==="string"?"."+e.className.split(" ")[0]:""))
            +" 右"+Math.round(r.right));
        }
      });
      const side=document.querySelector("aside");
      const sr=side?side.getBoundingClientRect():null;
      /* 押せる ものの 大きさ */
      const 小さい=[];
      document.querySelectorAll("button,a,select,input").forEach(e=>{
        const r=e.getBoundingClientRect(); if(r.width<4||r.height<4) return;
        const cs=getComputedStyle(e); if(cs.display==="none") return;
        /* ★ チェックボックス・ラジオは 20px で よい。**包む ラベル**が
           押しどころ なので、そちらの 高さで 見る。 */
        if(e.tagName==="INPUT" && (e.type==="checkbox"||e.type==="radio")){
          const lb=e.closest("label");
          const lh=lb?lb.getBoundingClientRect().height:0;
          if(lh<40) 小さい.push((e.id?"#"+e.id:"checkbox")+" 包む札 高"+Math.round(lh));
          return;
        }
        if(r.height<40) 小さい.push((e.id?"#"+e.id:e.tagName.toLowerCase())+" 高"+Math.round(r.height));
      });
      return {横に流れる:横, はみ出し:Array.from(new Set(はみ出し)).slice(0,6),
        サイドバー:sr?{幅:Math.round(sr.width),左:Math.round(sr.left)}:null,
        本文の幅:(()=>{const m2=document.querySelector("main");return m2?Math.round(m2.getBoundingClientRect().width):0;})(),
        小さい押しどころ:Array.from(new Set(小さい)).slice(0,5)};
    });
    console.log("── "+k);
    console.log("   横に流れる: "+m.横に流れる+"px ／ サイドバー "+JSON.stringify(m.サイドバー)+" ／ 本文 "+m.本文の幅+"px");
    if(m.はみ出し.length) console.log("   はみ出し: "+m.はみ出し.join(" / "));
    if(m.小さい押しどころ.length) console.log("   小さい押しどころ: "+m.小さい押しどころ.join(" / "));
  }
  /* ══ 引き出しの 開け閉め ══════════════════════════════════════ */
  let pass=0, fail=0;
  const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,160):"")))};
  console.log("\n══ 引き出し（スマホ）");
  await pg.goto(BASE+"/admin/users",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(2200);
  const 閉=await pg.evaluate(()=>{
    const s=document.getElementById("scSide"), b=document.getElementById("mbBackdrop");
    return {左:Math.round(s.getBoundingClientRect().left), 幕:b?b.hidden:null,
            上のバー:!!document.getElementById("mbTop"),
            題:(document.getElementById("mbTitle")||{}).textContent||""};
  });
  ok("はじめは 閉じて いる", 閉.左<=-200, 閉);
  ok("上部バーに 画面名が 出る", /ユーザー/.test(閉.題), 閉.題);
  await pg.evaluate(()=>document.getElementById("mbMenu").click());
  await pg.waitForTimeout(500);
  const 開=await pg.evaluate(()=>{
    const s=document.getElementById("scSide"), b=document.getElementById("mbBackdrop");
    return {左:Math.round(s.getBoundingClientRect().left), 幕:b?b.hidden:null,
            本文が止まる:getComputedStyle(document.body).overflow};
  });
  ok("★ハンバーガーで 開く", 開.左===0, 開);
  ok("  幕が 出る", 開.幕===false, 開);
  ok("  後ろが 動かない", 開.本文が止まる==="hidden", 開);
  /* ★ 幕は 全画面 なので 中心は 引き出しの 上。Playwright の click は
     そこを 突く ので 遮られる。要素を 直に 押す。 */
  await pg.evaluate(()=>document.getElementById("mbBackdrop").click());
  await pg.waitForTimeout(500);
  const 閉2=await pg.evaluate(()=>Math.round(document.getElementById("scSide").getBoundingClientRect().left));
  ok("幕を 押すと 閉じる", 閉2<=-200, 閉2);
  /* 中の 行き先を 押すと 閉じて 画面が 変わる */
  await pg.evaluate(()=>document.getElementById("mbMenu").click());
  await pg.waitForTimeout(400);
  const 移った=await pg.evaluate(()=>new Promise(r=>{
    const a=Array.from(document.querySelectorAll("#navList a")).find(x=>/監査/.test(x.textContent||""));
    if(!a) return r({なし:true});
    a.click();
    setTimeout(()=>r({左:Math.round(document.getElementById("scSide").getBoundingClientRect().left),
      いま:location.pathname}),700);
  }));
  ok("★行き先を 押すと 閉じて 画面も 変わる",
    移った.左<=-200 && /audit/.test(移った.いま||""), 移った);
  /* PC 幅では ずっと 見える */
  await pg.setViewportSize({width:1280,height:900});
  await pg.waitForTimeout(600);
  const pc=await pg.evaluate(()=>{
    const s=document.getElementById("scSide"), t=document.getElementById("mbTop"), b=document.getElementById("mbBackdrop");
    return {左:Math.round(s.getBoundingClientRect().left),
            上のバー:t?getComputedStyle(t).display:"—", 幕:b?b.hidden:null};
  });
  ok("PC では 出しっぱなし", pc.左===0, pc);
  ok("PC では 上部バーを 出さない", pc.上のバー==="none", pc);
  ok("PC では 幕を 出さない", pc.幕===true, pc);

  await pg.setViewportSize({width:390,height:844});
  await pg.goto(BASE+"/admin/users",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(2000);
  await pg.screenshot({path:"_adminmob.png"});
  console.log("\n─────────────\n通過 "+pass+" / 失敗 "+fail);
  await br.close();
  process.exit(fail?1:0);
})();
