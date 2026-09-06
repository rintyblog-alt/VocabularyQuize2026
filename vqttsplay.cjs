#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqttsplay.cjs — 読み上げが **鳴るか**（2026-08-28）

   訴え:
     「iPhone だと、なぜか Apple の TTS が 流れてしまうのと、
       音声を 再生できないことが 多すぎる。iPhone も PC も。」

   ここで 見ること（Chrome と Safari の エンジン 両方で）:
     ① 用意した 声で 鳴る／最後まで 切れない
     ② 器（Audio）を 毎回 作り直していない ＝ iPhone の 鍵が 閉まらない
     ③ 鳴っている 最中に 画面を 触っても 切れない
     ④ サーバが 断ったとき **なぜ 断られたか**が 画面まで 届く
     ⑤ 「端末の声で 代用」を 切ったら Apple の声を 使わない
     ⑥ 端末の 読み上げが **何も しない** ときでも 固まらない
        （iPhone は さわりの 外で speak されると 黙って 何も しない。
          もとの 作りは ここで 約束が 返らず、画面が 固まっていた）

   本物の 出来上がり（client/js/vq2-app.*.js）を そのまま 動かす。
   通信だけ 偽物に すり替える（読み上げの 鍵は 使わない）。
   本番には 一切 触らない。
   ══════════════════════════════════════════════════════════════════════ */
const fs=require("fs"),path=require("path"),http=require("http");
const {chromium,webkit}=require("playwright");
const dir=path.join(__dirname,"client","js");
const f=fs.readdirSync(dir).find(x=>/^vq2-app\.[0-9a-f]+\.js$/.test(x));
const js=fs.readFileSync(path.join(dir,f),"utf8");
let OK=0,NG=0;
const ok=(n,m)=>{OK++;console.log("  OK  "+n+(m?" … "+m:""))};
const ng=(n,m)=>{NG++;console.log("  NG  "+n+(m?" … "+m:""))};
const 見=(n,c,m)=>c?ok(n,m):ng(n,m);

const STUB=(mode)=>`
window.__net=[];window.__spoke=[];window.__audios=0;window.__mode=${JSON.stringify(mode)};
const _A=window.Audio;window.Audio=function(){window.__audios++;return new _A(...arguments);};
window.Audio.prototype=_A.prototype;
const wav=(()=>{const 秒=1.2,r=24000,n=Math.floor(秒*r);
 const b=new ArrayBuffer(44+n*2),v=new DataView(b);
 const put=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};
 put(0,"RIFF");v.setUint32(4,36+n*2,true);put(8,"WAVEfmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,r,true);v.setUint32(28,r*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 put(36,"data");v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/9)*9000,true);return b;})();
window.fetch=function(u){const s=String((u&&u.url)||u||"");window.__net.push(s);
 if(window.__mode==="枠切れ"&&s.indexOf("/tts/speak")>=0)
   return Promise.resolve(new Response(JSON.stringify({code:"TTS_FAILED",
     message:"読み上げを用意できませんでした — 枠を使い切りました（時間をおくと戻ります）。",
     why:"枠を使い切りました（時間をおくと戻ります）"}),
     {status:503,headers:{"Content-Type":"application/json"}}));
 return Promise.resolve(new Response(wav,{status:200,
   headers:{"Content-Type":"audio/wav","X-VQ-TTS-Voice":"Kore"}}));};
if(window.speechSynthesis){const o=window.speechSynthesis.speak.bind(window.speechSynthesis);
 window.speechSynthesis.speak=function(u){const t=String(u&&u.text||"");
   if(t.trim())window.__spoke.push(t.slice(0,30));return o(u);};}
try{localStorage.setItem("app.auth.token.v1","dummy-token-0000000000000000000000");}catch(e){}
`;

(async()=>{
  const srv=http.createServer((q,s)=>{s.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
    s.end('<!doctype html><meta charset=utf-8><title>t</title><body>'
      +'<button id=go style="width:200px;height:70px">鳴らす</button>'
      +'<button id=other style="width:200px;height:70px">別の所を押す</button>');});
  await new Promise(r=>srv.listen(0,"127.0.0.1",r));
  const 港=srv.address().port;

  for(const [名,B] of [["Chrome",chromium],["Safari(WebKit)",webkit]]){
    console.log("\n── "+名+" ──");
    const b=await B.launch();
    /* ① ふつうに 鳴らす */
    let p=await b.newPage();const err=[];p.on("pageerror",e=>err.push(String(e).slice(0,140)));
    await p.goto("http://127.0.0.1:"+港+"/");
    await p.evaluate(STUB("ふつう"));
    await p.addScriptTag({content:js});
    await p.waitForTimeout(150);
    const 前=await p.evaluate(()=>window.__audios);
    await p.evaluate(()=>{window.__r=null;
      document.getElementById("go").addEventListener("click",async()=>{
        window.__t0=performance.now();
        window.__r=await window.VQ2.tts.play("これは 検査の 読み上げです。",{});
        window.__ms=Math.round(performance.now()-window.__t0);});});
    await p.click("#go");
    await p.waitForTimeout(300);
    const 途中=await p.evaluate(()=>({作った:window.__audios,鳴っている:!!document.querySelector("audio")||true}));
    /* 鳴っている 最中に 別の所を 押す（鍵開けで 切れないか） */
    await p.click("#other");
    await p.waitForTimeout(2200);
    const 後=await p.evaluate(()=>({r:window.__r,ms:window.__ms,作った:window.__audios,apple:window.__spoke}));
    見("鳴らせた",後.r&&後.r.ok===true,JSON.stringify(後.r&&後.r.reason||"")+" source="+((後.r&&後.r.source)||""));
    見("最後まで 鳴った（途中で 切れない）",後.r&&後.r.ok===true&&後.ms>=1000,後.ms+"ms");
    見("Apple の声を 使っていない",(後.apple||[]).length===0,JSON.stringify(後.apple));
    見("器を 何度も 作らない（1〜2 個まで）",後.作った-前<=2,(後.作った-前)+" 個");
    if(err.length)ng("赤い字",err.slice(0,2).join(" / "));else ok("赤い字なし");
    await p.close();

    /* ② サーバが 枠切れで 断ったとき */
    p=await b.newPage();
    await p.goto("http://127.0.0.1:"+港+"/");
    await p.evaluate(STUB("枠切れ"));
    await p.addScriptTag({content:js});
    await p.waitForTimeout(150);
    const 断=await p.evaluate(async()=>{
      const 待つ=(pr,ms)=>Promise.race([pr,new Promise(r=>setTimeout(()=>r({ok:false,固まった:true,reason:"返事が来ない"}),ms))]);
      const r=await 待つ(window.VQ2.tts.play("枠切れの ときの 検査。",{}),12000);
      return {ok:!!r.ok,固まった:!!r.固まった,source:r.source||"",note:r.note||"",reason:r.reason||"",apple:window.__spoke.slice()};
    });
    見("断られても **固まらない**（必ず返事が来る）",断.固まった!==true);
    if(断.source==="local"){
      見("断られたら 端末の声で 代わりに 読む",断.ok===true);
      見("**なぜ そうなったか**を 画面へ 出す",/枠を使い切りました/.test(断.note),断.note);
    } else {
      見("断られたことを 伝える",断.ok===false&&/枠を使い切りました/.test(断.reason),断.reason);
    }
    /* ③ 端末の声を 切ったら 落ちないか */
    const 切=await p.evaluate(async()=>{
      window.__vqSet={get:function(k){return k==="voice.deviceFallback"?false:undefined;}};
      window.__spoke=[];
      const 待つ=(pr,ms)=>Promise.race([pr,new Promise(r=>setTimeout(()=>r({ok:false,固まった:true,reason:"返事が来ない"}),ms))]);
      const r=await 待つ(window.VQ2.tts.play("端末の声を 切ったときの 検査。",{}),12000);
      return {ok:!!r.ok,固まった:!!r.固まった,reason:r.reason||"",apple:window.__spoke.slice()};
    });
    見("切ったときも **固まらない**",切.固まった!==true);
    見("切ったら Apple の声を 使わない",(切.apple||[]).length===0,JSON.stringify(切.apple));
    見("切ったときも 理由は 出す",/枠を使い切りました/.test(切.reason),切.reason);

    /* ③-b ★ 何も 決めていない ときの **既定**（2026-09-02 に 切へ）。
       Rinty さん:「システムの TTS だけは やめてね。
       普通に あの 男女の ちゃんとした 声が 鳴るように」。 */
    const 既定=await p.evaluate(async()=>{
      delete window.__vqSet;                      /* 何も 決めていない 状態 */
      window.__spoke=[];
      const 待つ=(pr,ms)=>Promise.race([pr,new Promise(r=>setTimeout(()=>r({ok:false,固まった:true}),ms))]);
      const r=await 待つ(window.VQ2.tts.play("既定の ときの 検査。",{}),12000);
      return {ok:!!r.ok,source:r.source||"",reason:r.reason||"",apple:window.__spoke.slice()};
    });
    見("★★ **既定で 端末の声を 使わない**",(既定.apple||[]).length===0&&既定.source!=="local",
       JSON.stringify({source:既定.source,apple:既定.apple}));
    見("★ 既定でも 理由は 出す",/枠を使い切りました/.test(既定.reason),既定.reason);

    /* ③-c ★ **リスニングは 設定に かかわらず 落とさない**。
       声そのものが 問題の 中身（男女の 会話・速さ）なので、
       Apple / Google の 声に すり替わると 別の 問題に なる。 */
    const 聞=await p.evaluate(async()=>{
      window.__vqSet={get:function(k){return k==="voice.deviceFallback"?true:undefined;}};  /* 入 に しても */
      window.__spoke=[];
      const 待つ=(pr,ms)=>Promise.race([pr,new Promise(r=>setTimeout(()=>r({ok:false,固まった:true}),ms))]);
      const r=await 待つ(window.VQ2.tts.playQuestion(
        {script:"A: Good morning. B: Good morning."},{}),12000);
      return {ok:!!r.ok,source:r.source||"",reason:r.reason||"",apple:window.__spoke.slice()};
    });
    見("★★ **リスニングは 端末の声へ 落とさない**（設定が 入でも）",
       (聞.apple||[]).length===0&&聞.source!=="local",
       JSON.stringify({source:聞.source,apple:聞.apple}));
    見("★ リスニングでも 理由は 出す",/枠を使い切りました|用意できません/.test(聞.reason),聞.reason);
    await p.close();

    /* ④ **iPhone で 実際に 起きる 形**を 作る:
       speechSynthesis.speak が 何も せず、onend も onerror も 出さない。
       もとの 作りだと ここで 約束が 永久に 返らず、画面は
       「音声を用意しています…」の まま 固まっていた。 */
    p=await b.newPage();
    await p.goto("http://127.0.0.1:"+港+"/");
    await p.evaluate(STUB("枠切れ"));
    const 仕込み=await p.evaluate(()=>{
      if(!window.speechSynthesis) return "speechSynthesis が 無い端末";
      try{
        Object.defineProperty(window.speechSynthesis,"speaking",{get(){return false},configurable:true});
        Object.defineProperty(window.speechSynthesis,"pending",{get(){return false},configurable:true});
      }catch(e){return "speaking を 差し替えられない: "+e.message}
      window.speechSynthesis.speak=function(){};
      window.speechSynthesis.cancel=function(){};
      return "";
    });
    if(仕込み)console.log("      （仕込み: "+仕込み+"）");
    await p.addScriptTag({content:js});
    await p.waitForTimeout(150);
    /* ★ 読み込みの **あと**に もう一度 差し替える。
       先に だけ 差し替えると、読み込みの 途中で 元に 戻ることが ある
       （WebKit で 実際に そうなった）。 */
    await p.evaluate(()=>{
      Object.defineProperty(window.speechSynthesis,"speaking",{get(){return false},configurable:true});
      Object.defineProperty(window.speechSynthesis,"pending",{get(){return false},configurable:true});
      window.speechSynthesis.speak=function(){};
      window.speechSynthesis.cancel=function(){};
    });
    const 黙=await p.evaluate(async()=>{
      const t0=performance.now();
      const 待つ=(pr,ms)=>Promise.race([pr,new Promise(r=>setTimeout(()=>r({固まった:true}),ms))]);
      const r=await 待つ(window.VQ2.tts.play("読み上げが 何も しない ときの 検査。",{}),8000);
      return {固まった:!!r.固まった,ok:!!r.ok,source:r.source||"",note:r.note||"",reason:r.reason||"",ms:Math.round(performance.now()-t0)};
    });
    見("読み上げが 何も しなくても **固まらない**",黙.固まった!==true,黙.ms+"ms");
    見("2 秒以内に 返事が 来る",黙.ms<2000,黙.ms+"ms");
    見("鳴らなかったと はっきり 言う",黙.ok===false&&黙.reason.length>0,
      JSON.stringify({ok:黙.ok,source:黙.source,note:黙.note,reason:黙.reason}));
    await p.close();
    await b.close();
  }
  srv.close();
  console.log("\n合計 OK="+OK+" NG="+NG);
  process.exit(NG?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
