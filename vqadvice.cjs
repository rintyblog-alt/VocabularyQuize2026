/* クイズ結果の「分析」に出る AI の助言を確かめる。
   この端末の AI に繋がっていない状態では「生成できませんでした。」が出ること。 */
const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/quiz",{recursive:true});
const DEEP = `(sel) => { const out=[]; const walk=(r)=>{ r.querySelectorAll("*").forEach(el=>{ if(el.matches(sel)) out.push(el); if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const d of [{n:"PC",w:1440,h:950,m:false},{n:"スマホ",w:390,h:844,m:true}]) {
  const pg = await (await b.newContext({viewport:{width:d.w,height:d.h},deviceScaleFactor:2,isMobile:d.m,hasTouch:d.m})).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,140)));
  await pg.goto("http://127.0.0.1:8791/?vq2=all&vqdev=1&cb="+Date.now(), {waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(4200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

    /* この端末の AI は繋いでいない状態にする */
    localStorage.removeItem("vq.chat.localai.v1");
  });
  await pg.waitForTimeout(1500);
  console.log("\n== "+d.n+" ==");
  const opened = await pg.evaluate(()=>{
    if(!window.VQ2 || !VQ2.resultView) return "resultView なし";
    const now=Date.now();
    const items=[
      {questionId:"q1",answered:true,correct:true,score:1,maxScore:1,elapsedMs:9000},
      {questionId:"q2",answered:true,correct:false,score:0,maxScore:1,elapsedMs:14000},
      {questionId:"q3",answered:true,correct:false,score:0,maxScore:1,elapsedMs:11000},
      {questionId:"q4",answered:true,correct:true,score:1,maxScore:1,elapsedMs:8000}
    ];
    VQ2.resultView.open({ result: {
      id:"r-test", presetId:"p1", presetName:"政治経済 第1章", finishedAt: now,
      elapsedMs: 42000, items: items,
      aggregate: { byTopic: { "民主政治":{total:3,correct:1}, "人権":{total:1,correct:1} },
                   byDifficulty:{}, byType:{} },
      behavior: { note:"" }
    }});
    return "ok";
  });
  ok(d.n+"：結果画面が開く", opened==="ok", opened);
  await pg.waitForTimeout(900);
  const toAnalysis = await pg.evaluate(`(() => { const deep=${DEEP};
    const t = deep('[data-rvtab="analysis"]')[0]; if(!t) return false; t.click(); return true; })()`);
  ok(d.n+"：分析タブへ行ける", toAnalysis);
  await pg.waitForTimeout(1200);
  const card = await pg.evaluate(`(() => { const deep=${DEEP};
    const e = deep("[data-advice]")[0];
    return e ? { txt: e.innerText.replace(/\\s+/g," ").trim(), first: e === deep(".vq2-q")[0].firstElementChild } : null; })()`);
  ok(d.n+"：助言の枠が分析の一番上にある", !!card && card.first, JSON.stringify(card));
  /* 出どころを正直に書いているか。
     AI が書いたなら「AI からの助言」、この端末の AI が使えず数字から作ったなら
     「結果から出した助言」。どちらでもよいが、**どちらか一方は必ず書いてある**こと。
     どこから来た文なのか分からないまま見せるのがいちばんまずい。 */
  const src = !!card && (card.txt.indexOf("AI からの助言")>=0 || card.txt.indexOf("結果から出した助言")>=0);
  ok(d.n+"：助言の出どころが書いてある", src, card&&card.txt.slice(0,70));
  ok(d.n+"：出どころと説明が食い違っていない",
     !card || (card.txt.indexOf("AI からの助言")>=0
       ? card.txt.indexOf("この端末の中だけで作っています")>=0
       : card.txt.indexOf("この結果の数字だけで作っています")>=0),
     card&&card.txt.slice(0,90));
  /* 落ち着くまで待つ（考えている間は判定しない）。最長 55 秒。 */
  let after = "";
  for (let i=0;i<55;i++) {
    after = await pg.evaluate(`(() => { const deep=${DEEP};
      const e = deep("[data-advice]")[0]; return e ? e.innerText.replace(/\\s+/g," ").trim() : ""; })()`);
    if (after.indexOf("考えています")<0 && after.indexOf("読み込んでいます")<0) break;
    await pg.waitForTimeout(1000);
  }
  const failed = after.indexOf("生成できませんでした。")>=0;
  const body = after.replace("AI からの助言 この端末の中だけで作っています","").trim();
  console.log("     状態:", failed ? "生成できず" : "生成できた", "／", body.slice(0,70));
  ok(d.n+"：考えっぱなしにならない", after.indexOf("考えています")<0, after.slice(0,60));
  if (failed) {
    ok(d.n+"：作れないときは そう伝える", true);
    ok(d.n+"：作り話を出さない", body.length<80, String(body.length));
    ok(d.n+"：もう一度ためせる", await pg.evaluate(`(() => { const deep=${DEEP};
      return deep('[data-act="advice-retry"]').length>0; })()`));
  } else {
    ok(d.n+"：助言の中身が出る", body.length>10, String(body.length));
    ok(d.n+"：無い数を作っていない",
       !/[0-9]+\s*(点|問中)/.test(body) || /4\s*問|2\s*問|50|0\.7|0\.7\s*分/.test(body), body.slice(0,80));
    ok(d.n+"：作れたときは やり直しを出さない", await pg.evaluate(`(() => { const deep=${DEEP};
      return deep('[data-act="advice-retry"]').length===0; })()`));
  }
  await pg.screenshot({path:"shots/quiz/"+d.n+"-助言.png"});
  ok(d.n+"：画面の失敗が出ていない", errs.length===0, errs.join(" / "));
  await pg.context().close();
  }
  await b.close();
  console.log("\n合格 "+pass+" / 不合格 "+fail);
  process.exit(fail?1:0);
})();
