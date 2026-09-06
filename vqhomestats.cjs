#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqhomestats.cjs — ホームの 4 つの 数字（2026-09-01・訴え）

   訴え:「ホーム画面の 今日の 学習、連続学習、今週の 問題数、週間正答数が
         機能して いない 気が する」

   調べた こと:
     ・数え方は **正しい**。記録を 1 行 入れると 4 つ とも 動いた（実測）。
     ・問題は **どこに 書かれて いるか**だった。
         古い クイズ  … wordPractice.analytics.sessions.v1
         いまの クイズ … vq2.learn.sessions.v1
       いまの クイズは 終わる ときに 古い ほうへ 写す（mirrorLegacy）が、
       写す前に 落ちる／写さない 道が あると **ホームだけ 0 のまま**に なる。

   直しかた: **両方 読んで、id で 重なりを 落とす。**
     片方だけを 正に すると、また 別の 道で 0 に なる。

   見るもの:
     ① 何も 無い ときは 0
     ② **いまの クイズ（V2）だけ**でも 数字が 動く
     ③ 両方に 同じ ものが ある ときは **二重に 数えない**
     ④ 古い ほうの 別記録も 足される

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqhomestats.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium } = require("playwright");
const 待=(m)=>new Promise(s=>setTimeout(s,m));
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
  const ex=[]; pg.on("pageerror",e=>ex.push(String(e.message).slice(0,140)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil:"domcontentloaded" });
  await 待(5000);
  const 読=()=>pg.evaluate(()=>{ const h=Array.prototype.find.call(document.querySelectorAll("*"),x=>x.shadowRoot&&x.shadowRoot.querySelector("[data-home-stats]"));
    const sr=h&&h.shadowRoot; return sr?(sr.querySelector("[data-home-stats]")||{}).textContent?.replace(/\s+/g," ").trim():null; });
  let 済=0, 落=0; const 落ち=[];
  const 見=(ok,名,追)=>{ if(ok){済++;console.log("  ok   "+名+(追!==undefined?"  → "+JSON.stringify(追).slice(0,180):""));}
    else{落++;落ち.push(名);console.log("  NG   "+名+(追!==undefined?"  → "+JSON.stringify(追).slice(0,240):""));} };
  const 数=(t)=>{ const m=String(t||"").match(/今日の学習(\d+)分.*?連続学習(\d+)日.*?今週の問題数(\d+)問.*?週間正答率(—|\d+%)/);
    return m?{分:+m[1],日:+m[2],問:+m[3],率:m[4]}:null; };
  const a = 数(await 読());
  console.log("\n══ ① 何も 無い とき ══");
  見(a && a.分===0 && a.問===0 && a.率==="—", "★ 0 のまま（数字を でっち上げない）", a);
  /* ② V2 だけに 書く（古い 方には 写さない） */
  await pg.evaluate(async () => {
    const now=Date.now();
    localStorage.setItem("vq2.learn.sessions.v1", JSON.stringify([{
      id:"s-v2-1", completedAt:now, localDate:new Date().toISOString().slice(0,10),
      presetId:"p1", title:"V2 の プリセット", mode:"quiz",
      questionCount:15, correctCount:12, accuracy:0.8, durationSeconds:420 }]));
    try{ window.__vqScreens.描き直す(); }catch(e){}
    await new Promise(s=>setTimeout(s,1200));
  });
  console.log("\n══ ② いまの クイズ（V2）だけ ══");
  const b2 = 数(await 読());
  見(b2 && b2.問===15, "★★ **V2 だけでも 問題数が 出る**（直す前は 0 のまま）", b2);
  見(b2 && b2.分===7, "★ 学習時間も 出る", b2 && b2.分);
  見(b2 && b2.日===1, "★ 連続学習も 数える", b2 && b2.日);
  見(b2 && b2.率==="80%", "★ 週間正答率も 出る", b2 && b2.率);
  /* ③ 両方に 同じ ものが ある（写した とき）→ 二重に 数えない */
  await pg.evaluate(async () => {
    const now=Date.now();
    localStorage.setItem("wordPractice.analytics.sessions.v1", JSON.stringify([{
      id:"vq2:s-v2-1", ts:now, date:new Date().toISOString().slice(0,10),
      presetId:"p1", presetName:"V2 の プリセット", mode:"CHOICE",
      total:15, correct:12, accuracy:0.8, durationMs:420000, wrongIds:[] }]));
    try{ window.__vqScreens.描き直す(); }catch(e){}
    await new Promise(s=>setTimeout(s,1200));
  });
  console.log("\n══ ③ 両方に 同じ ものが ある（写した とき）══");
  const c2 = 数(await 読());
  見(c2 && c2.問===15, "★★ **二重に 数えない**（30 に ならない）", c2);
  見(c2 && c2.分===7, "時間も 二重に しない", c2 && c2.分);
  /* ④ 古い方 だけの 別記録を 足す → 増える */
  await pg.evaluate(async () => {
    const now=Date.now();
    const l=JSON.parse(localStorage.getItem("wordPractice.analytics.sessions.v1")||"[]");
    l.push({ id:"old-1", ts:now, date:new Date().toISOString().slice(0,10),
      presetId:"p2", presetName:"古い ほう", mode:"CHOICE",
      total:5, correct:5, accuracy:1, durationMs:120000, wrongIds:[] });
    localStorage.setItem("wordPractice.analytics.sessions.v1", JSON.stringify(l));
    try{ window.__vqScreens.描き直す(); }catch(e){}
    await new Promise(s=>setTimeout(s,1200));
  });
  console.log("\n══ ④ 古い ほうの 別記録も 足す ══");
  const d2 = 数(await 読());
  見(d2 && d2.問===20, "★ 足し合わせる", d2);
  見(d2 && d2.率==="85%", "正答率も 合わせて 数える", d2 && d2.率);
  見(ex.length===0, "画面の 例外 0 件", ex);
  await b.close();
  console.log("\n────────────────────────────────");
  console.log("  ok "+済+" / NG "+落);
  if(落){ console.log("  落ちた: "+落ち.join(" / ")); process.exit(1); }
})();
