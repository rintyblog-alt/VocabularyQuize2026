/* クイズ結果 → Feed への投稿画面を、実際に触って確かめる。 */
const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/feed",{recursive:true});
const TOKEN = process.env.VQ_TOKEN || "";
const DEEP = `(sel) => { const out=[]; const walk=(r)=>{ r.querySelectorAll("*").forEach(el=>{ if(el.matches(sel)) out.push(el); if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const d of [{n:"PC",w:1440,h:950,m:false},{n:"スマホ",w:390,h:844,m:true}]) {
  const pg = await (await b.newContext({viewport:{width:d.w,height:d.h},deviceScaleFactor:2,isMobile:d.m,hasTouch:d.m})).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,140)));
  await pg.goto("http://127.0.0.1:8791/?vq2=all&vqdev=1&cb="+Date.now(), {waitUntil:"domcontentloaded"});
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1",t), TOKEN);
  await pg.reload({waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(3800);
  const hide=()=>pg.evaluate(()=>{
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

  });
  await hide(); await pg.waitForTimeout(1500); await hide();
  console.log("\n== "+d.n+" ==");
  await pg.evaluate(()=>{
    const now=Date.now();
    VQ2.resultView.open({ result:{
      id:"r-share", presetId:"p1", presetName:"政治経済 第1章", subject:"政治経済",
      finishedAt: now, elapsedMs: 402000, score: 2, maxScore: 4,
      items:[{questionId:"q1",answered:true,correct:true,score:1,maxScore:1},
             {questionId:"q2",answered:true,correct:false,score:0,maxScore:1},
             {questionId:"q3",answered:true,correct:false,score:0,maxScore:1},
             {questionId:"q4",answered:true,correct:true,score:1,maxScore:1}],
      aggregate:{ byTopic:{ "民主政治":{total:3,correct:1,rate:0.33}, "人権":{total:1,correct:1,rate:1} }, byDifficulty:{}, byType:{}, byCriterion:{} },
      sectionScores:[], behavior:{note:""}
    }});
  });
  await pg.waitForTimeout(900);
  const shared = await pg.evaluate(`(() => { const deep=${DEEP};
    const b=deep('[data-act="share"]')[0]; if(!b) return false; b.click(); return true; })()`);
  ok(d.n+"：結果画面に共有の入口がある", shared);
  await pg.waitForTimeout(1200);
  const sheet = await pg.evaluate(`(() => { const deep=${DEEP};
    const items = deep("[data-item]");
    const conf = deep("[data-confirm]")[0];
    const post = deep('[data-act="post"]')[0];
    return { items: items.length,
      checked: items.filter(x=>x.checked).map(x=>x.getAttribute("data-item")),
      hasConfirm: !!conf, postDisabled: post? !!post.disabled : null,
      txt: (deep(".vq2-q")[0]||{innerText:""}).innerText.replace(/\\s+/g," ").slice(0,120) }; })()`);
  ok(d.n+"：共有画面が開く", sheet.items>0, JSON.stringify(sheet).slice(0,120));
  ok(d.n+"：既定で外へ出さない項目がある", sheet.items>sheet.checked.length, JSON.stringify(sheet.checked));
  ok(d.n+"：確認するまで投稿できない", sheet.postDisabled===true);
  await pg.screenshot({path:"shots/feed/"+d.n+"-共有画面.png"});
  await pg.evaluate(`(() => { const deep=${DEEP};
    const t=deep("[data-comment]")[0]; if(t){ t.value="民主政治をやり直す。"; t.dispatchEvent(new Event("input",{bubbles:true})); }
    const c=deep("[data-confirm]")[0]; if(c){ c.checked=true; c.dispatchEvent(new Event("change",{bubbles:true})); } })()`);
  await pg.waitForTimeout(700);
  ok(d.n+"：確認すると投稿できる", await pg.evaluate(`(() => { const deep=${DEEP};
    const p=deep('[data-act="post"]')[0]; return !!p && !p.disabled; })()`));
  await pg.evaluate(`(() => { const deep=${DEEP};
    const p=deep('[data-act="post"]')[0]; if(p) p.click(); })()`);
  await pg.waitForTimeout(2600);
  const feed = await pg.evaluate(()=>{
    const h=document.getElementById("vqFeed"); if(!h) return {mounted:false};
    const r=h.shadowRoot;
    const ta=r.querySelector("[data-composer]");
    const dc=r.querySelector(".dcard,.att,.scard");
    return { mounted:true, tab: document.body.getAttribute("data-app-tab"),
      body: ta? ta.value : "", draft: !!dc,
      draftTxt: dc? dc.innerText.replace(/\s+/g," ").trim().slice(0,90):"" };
  });
  ok(d.n+"：Feed の投稿欄へ渡る", feed.mounted && feed.tab==="inbox", JSON.stringify(feed).slice(0,110));
  ok(d.n+"：ひとことが入っている", (feed.body||"").indexOf("民主政治")>=0, feed.body);
  ok(d.n+"：結果のカードが添えられている", feed.draft, feed.draftTxt);
  await pg.screenshot({path:"shots/feed/"+d.n+"-共有後の投稿欄.png"});
  ok(d.n+"：画面の失敗が出ていない", errs.length===0, errs.join(" / "));
  await pg.context().close();
  }
  await b.close();
  console.log("\n合格 "+pass+" / 不合格 "+fail);
  process.exit(fail?1:0);
})();
