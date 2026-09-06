/* 通知が 届いた その場で 鳴るか（サーバ → WebSocket → 画面）*/
const { chromium } = require("playwright");
const BASE="http://127.0.0.1:8791"; const j=r=>r.json().catch(()=>({}));
let pass=0,fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,200):"")))};
const 作る=async(名)=>{
  const 印=Date.now().toString(36)+Math.random().toString(36).slice(2,6); const H={"Content-Type":"application/json"};
  const a=await fetch(BASE+"/api/auth/register/start",{method:"POST",headers:H,body:JSON.stringify({email:名+印+"@gmail.com",gradePrefix:"H2",nickname:名+印,password:"Passw0rd!z3"})}).then(j);
  const b=await fetch(BASE+"/api/auth/register/verify",{method:"POST",headers:H,body:JSON.stringify({challengeId:a.challengeId,code:a.devCode})}).then(j);
  const c=await fetch(BASE+"/api/auth/register/consent",{method:"POST",headers:H,body:JSON.stringify({registrationSession:b.registrationSession,agreeTerms:true,agreePrivacy:true,agreeAge:true,pin:"1379"})}).then(j);
  const me=await fetch(BASE+"/api/auth/me",{headers:{Authorization:"Bearer "+c.token}}).then(j);
  return {token:c.token, uid:String((me.user||me).id||"")};
};
(async()=>{
  const A=await 作る("na"), B=await 作る("nb");
  console.log("A uid="+A.uid+" / B uid="+B.uid);
  const br=await chromium.launch();
  const ctx=await br.newContext({viewport:{width:393,height:793},isMobile:true,hasTouch:true});
  const pg=await ctx.newPage();
  const errs=[]; pg.on("pageerror",e=>errs.push(String(e.message).slice(0,140)));
  await pg.addInitScript(t=>{localStorage.setItem("app.auth.token.v1",t);localStorage.setItem("app.auth.mode.v1","user");},B.token);
  await pg.goto(BASE+"/?vqdev=1",{waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(5000);

  console.log("\n① 受け口が いる");
  const 口=await pg.evaluate(()=>({live:typeof (window.__vqNotifyLive&&window.__vqNotifyLive.受ける),
    音:typeof (window.__vqNotifyLive&&window.__vqNotifyLive.鳴らす)}));
  ok("__vqNotifyLive.受ける が ある", 口.live==="function", 口);

  console.log("\n② ★サーバから 押し出すと 画面に 届く（端から 端まで）");
  /* WebSocket が 開くのを 待つ */
  const 開いた=await pg.evaluate(()=>new Promise(r=>{
    let n=0; const t=setInterval(()=>{ n++;
      const c=window.__vqCall && window.__vqCall.状態 ? window.__vqCall.状態() : null;
      const ws=c && c.ws;
      if(ws===1 || n>40){clearInterval(t);r({ws, 待ち:n*250});}
    },250);
  }));
  ok("通話の WebSocket が つながる（ここに 相乗りする）", 開いた.ws===1, 開いた);
  /* 届いたら 拾う 用意 */
  await pg.evaluate(()=>{ window.__来た=[]; window.addEventListener("vq-notify-new",e=>window.__来た.push(e.detail)); });
  /* A が B を フォロー → B に 通知が 作られ、pushNotifyUser が 走る */
  const f=await fetch(BASE+"/api/follow/toggle",{method:"POST",
    headers:{Authorization:"Bearer "+A.token,"Content-Type":"application/json"},
    body:JSON.stringify({targetUserId:Number(B.uid)})}).then(j);
  console.log("   （フォロー: "+JSON.stringify(f).slice(0,120)+"）");
  const 届いた=await pg.evaluate(()=>new Promise(r=>{
    let n=0; const t=setInterval(()=>{ n++;
      if(window.__来た.length || n>24){clearInterval(t);r({件:window.__来た.length, 中身:window.__来た[0]||null, 待ち:n*250});}
    },250);
  }));
  ok("★フォローされた 瞬間に 画面へ 届く", 届いた.件>0, 届いた);
  if(届いた.件>0) console.log("   （"+Math.round(届いた.待ち/100)/10+" 秒で 届いた）");

  console.log("\n②b ★お知らせ（News）も その場で 届く");
  await pg.evaluate(()=>{ window.__ニュース=[]; window.addEventListener("vq-notify-new",e=>{ if(e.detail&&e.detail.type==="news.new") window.__ニュース.push(e.detail); }); });
  const KEY="vqlocaladmin-9f3a2c";
  const nid="news_test_"+Date.now().toString(36);
  /* まず 下書きで 保存 → 鳴らない ことを 見る */
  await fetch(BASE+"/api/admin/news/save",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":KEY},
    body:JSON.stringify({id:nid,title:"下書きの 試し",status:"draft",body:"まだ 公開しない"})}).then(j);
  await pg.waitForTimeout(1200);
  const 下書き=await pg.evaluate(()=>window.__ニュース.length);
  ok("下書きの 保存では 鳴らさない", 下書き===0, 下書き);
  /* 公開に する → 届く */
  await fetch(BASE+"/api/admin/news/save",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":KEY},
    body:JSON.stringify({id:nid,title:"公開の 試し",status:"published",body:"届く はず"})}).then(j);
  const ニ=await pg.evaluate(()=>new Promise(r=>{
    let n=0; const t=setInterval(()=>{ n++;
      if(window.__ニュース.length || n>24){clearInterval(t);r({件:window.__ニュース.length, 中身:window.__ニュース[0]||null, 待ち:n*250});}
    },250);
  }));
  ok("★公開した 瞬間に 画面へ 届く", ニ.件>0, ニ);
  if(ニ.件>0){
    console.log("   （"+Math.round(ニ.待ち/100)/10+" 秒で 届いた）");
    ok("  題が 渡る", ニ.中身 && ニ.中身.title==="公開の 試し", ニ.中身);
  }
  /* もう一度 公開ずみを 直す → 鳴らさない */
  await pg.evaluate(()=>{ window.__ニュース=[]; });
  await fetch(BASE+"/api/admin/news/save",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":KEY},
    body:JSON.stringify({id:nid,title:"直しただけ",status:"published",body:"鳴らない はず"})}).then(j);
  await pg.waitForTimeout(1500);
  const 直し=await pg.evaluate(()=>window.__ニュース.length);
  ok("公開ずみを 直しても 鳴らさない（何度も 鳴らない）", 直し===0, 直し);

  console.log("\n③ 押し出しを 受けたら 鳴る・知らせる");
  const 受けた=await pg.evaluate(()=>new Promise(r=>{
    let 来た=null;
    window.addEventListener("vq-notify-new",e=>{来た=e.detail;},{once:true});
    /* サーバから 来たのと 同じ 形を 流し込む */
    window.__vqNotifyLive.受ける({type:"notify.new",at:Date.now(),title:"試し",body:"届いた",tag:"t1"});
    setTimeout(()=>r({来た, 音:typeof window.__vqNotifyLive.鳴らす==="function"}),600);
  }));
  ok("受けると vq-notify-new が 飛ぶ（一覧が すぐ 変わる）", !!受けた.来た, 受けた);
  ok("  中身が 渡る", 受けた.来た && 受けた.来た.title==="試し", 受けた.来た);

  console.log("\n③b ★バナーが 画面に 出る（見て いる ときも）");
  const バ=await pg.evaluate(()=>new Promise(r=>{
    /* 前の 試しで 出た バナーが 残って いると 取り違える。先に 片づける。 */
    const h0=document.getElementById("vqNotifyBanner");
    if(h0&&h0.shadowRoot){const w=h0.shadowRoot.querySelector(".wrap"); if(w) w.innerHTML="";}
    window.__vqNotifyLive.受ける({type:"notify.new",at:Date.now()+1,title:"バナーの 試し",body:"ここに 本文",tag:"bn1"});
    setTimeout(()=>{
      const h=document.getElementById("vqNotifyBanner");
      if(!h||!h.shadowRoot) return r({なし:true});
      const b=h.shadowRoot.querySelector(".b");
      if(!b) return r({札なし:true});
      const rc=b.getBoundingClientRect();
      const cs=getComputedStyle(b);
      const 最後=h.shadowRoot.querySelectorAll(".b");
      const 対=最後[最後.length-1];
      r({出た:true, 題:(対.querySelector(".t")||{}).textContent,
         本文:(対.querySelector(".d")||{}).textContent,
         上:Math.round(rc.top), 高:Math.round(rc.height), 幅:Math.round(rc.width),
         押せる:cs.pointerEvents, 器は素通り:getComputedStyle(h).pointerEvents,
         隠れて:document.hidden});
    },400);
  }));
  ok("★画面を 見て いても バナーが 出る", バ.出た===true, バ);
  ok("  見出しが 出る", バ.題==="バナーの 試し", バ.題);
  ok("  本文も 出る", バ.本文==="ここに 本文", バ.本文);
  ok("  時計に 被らない（上の 安全領域を 避ける）", バ.上>=10, {上:バ.上});
  ok("  バナーは 押せる・まわりは 素通り", バ.押せる==="auto" && バ.器は素通り==="none", バ);
  const 消えた=await pg.evaluate(()=>new Promise(r=>{
    setTimeout(()=>{const h=document.getElementById("vqNotifyBanner");
      r(!h||!h.shadowRoot||!h.shadowRoot.querySelector(".b"));},5200);
  }));
  ok("  4.5 秒ほどで ひとりでに 消える", 消えた===true, 消えた);
  const 積み=await pg.evaluate(()=>new Promise(r=>{
    for(let i=0;i<5;i++) window.__vqNotifyLive.受ける({type:"notify.new",at:Date.now()+10+i,title:"積み"+i,tag:"st"+i});
    setTimeout(()=>{const h=document.getElementById("vqNotifyBanner");
      r(h&&h.shadowRoot?h.shadowRoot.querySelectorAll(".b").length:0);},400);
  }));
  ok("  積みすぎない（3 枚まで）", 積み<=3, {枚:積み});

  console.log("\n③c ★下部バーの 件数が バナーと 同時に 増える（本物の 通知で）");
  /* ★ 作り話の 通知で 測ると、本体の 取り直し（__vqNotif.refresh）が
     すぐ あとに 走って **正しい 数（＝ 増えて いない）**に 戻す。
     それは 正しい 動き なので、**本物の 通知**（もう 1 人が フォローする）で 測る。 */
  const C=await 作る("nc");
  await pg.evaluate(()=>{
    const h=document.getElementById("vqNotifyBanner");
    if(h&&h.shadowRoot){const w=h.shadowRoot.querySelector(".wrap"); if(w) w.innerHTML="";}
  });
  const 読む=()=>pg.evaluate(()=>{
    const h=document.getElementById("vqMobBar");
    const d=h&&h.shadowRoot?h.shadowRoot.querySelector("[data-notify]"):null;
    const el=document.getElementById("appSidebarNotifyCount");
    const bh=document.getElementById("vqNotifyBanner");
    return {島:d?String(d.textContent||"").trim():"", 島に印:d?d.classList.contains("on"):false,
            本体:el?String(el.textContent||"").trim():"",
            札:bh&&bh.shadowRoot?bh.shadowRoot.querySelectorAll(".b").length:0};
  });
  const 前数=await 読む();
  await fetch(BASE+"/api/follow/toggle",{method:"POST",
    headers:{Authorization:"Bearer "+C.token,"Content-Type":"application/json"},
    body:JSON.stringify({targetUserId:Number(B.uid)})}).then(j);
  const 後数=await pg.evaluate(()=>new Promise(r=>{
    let n=0; const t=setInterval(()=>{ n++;
      const h=document.getElementById("vqMobBar");
      const d=h&&h.shadowRoot?h.shadowRoot.querySelector("[data-notify]"):null;
      const el=document.getElementById("appSidebarNotifyCount");
      const bh=document.getElementById("vqNotifyBanner");
      const 札=bh&&bh.shadowRoot?bh.shadowRoot.querySelectorAll(".b").length:0;
      if(札>0 || n>28){clearInterval(t);
        r({島:d?String(d.textContent||"").trim():"", 島に印:d?d.classList.contains("on"):false,
           本体:el?String(el.textContent||"").trim():"", 札, 待ち:n*150});}
    },150);
  }));
  ok("★バナーが 出る", 後数.札>0, 後数);
  ok("★本体の 件数が 増える", Number(後数.本体||0)>Number(前数.本体||0), {前:前数.本体, 後:後数.本体});
  ok("★下部バーの 島にも 出る", 後数.島に印===true && Number(後数.島||0)>0, 後数);
  console.log("   （バナーと 件数が そろうまで "+Math.round(後数.待ち/100)/10+" 秒）");

  console.log("\n④ 同じ 通知は 2 回 鳴らさない");
  const 二度目=await pg.evaluate(()=>new Promise(r=>{
    let n=0; const f=()=>{n++;};
    window.addEventListener("vq-notify-new",f);
    window.__vqNotifyLive.受ける({type:"notify.new",at:1,title:"同じ",tag:"same"});
    window.__vqNotifyLive.受ける({type:"notify.new",at:1,title:"同じ",tag:"same"});
    setTimeout(()=>{window.removeEventListener("vq-notify-new",f);r(n);},500);
  }));
  ok("同じ 印は 1 回だけ", 二度目===1, 二度目);

  console.log("\n⑤ 音は **人が 選んだ もの**");
  const 音=await pg.evaluate(()=>{
    const 前=window.__vqNotifyLive.選ばれた音 ? window.__vqNotifyLive.選ばれた音() : null;
    /* 設定の 口から 選び直す */
    let 鳴らした=null;
    const 元=window.__vqNewsFlash && window.__vqNewsFlash.play;
    if (window.__vqNewsFlash) window.__vqNewsFlash.play = function(id){ 鳴らした=id; return Promise.resolve(true); };
    window.__vqNotifyLive.鳴らす();
    if (window.__vqNewsFlash && 元) window.__vqNewsFlash.play = 元;
    return {選ばれた:前, 鳴らした, 口:typeof (window.__vqNewsFlash&&window.__vqNewsFlash.play)};
  });
  ok("設定で 選んだ 音の 持ち主（__vqNewsFlash）を 使う", 音.口==="function", 音);
  ok("★選んだ 音が そのまま 鳴る", 音.鳴らした===音.選ばれた, 音);
  const 切る=await pg.evaluate(()=>{
    if (window.__vqSet && window.__vqSet.set) window.__vqSet.set("sound.notify","off");
    return {よいか:window.__vqNotifyLive.鳴らしてよいか(), 鳴った:window.__vqNotifyLive.鳴らす()};
  });
  ok("「鳴らさない」を 選ぶと 鳴らさない", 切る.よいか===false && 切る.鳴った===false, 切る);

  ok("画面の 例外 0 件", errs.length===0, errs);
  await br.close();
  console.log("\n─────────────\n通過 "+pass+" / 失敗 "+fail);
  process.exit(fail?1:0);
})();
