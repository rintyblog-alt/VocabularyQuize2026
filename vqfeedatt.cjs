/* 添付（プリセット / 試験）が実際に付いて、投稿され、カードとして出るか。 */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
const F=(pg,sel)=>pg.evaluate((s)=>!!document.getElementById("vqFeed").shadowRoot.querySelector(s),sel);

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,150)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil:"domcontentloaded" });
  /* ログイン＋手元のプリセットと試験を用意（テスト専用の名前空間へ書く） */
  await pg.evaluate((t)=>{
    localStorage.setItem("app.auth.token.v1", t);
  }, TOKEN);
  await pg.reload({ waitUntil:"domcontentloaded" });
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    /* 手元のプリセットと試験を 1 件ずつ置く */
    const ST = window.VQ2 && window.VQ2.store;
    /* 試験は手元に無いので 1 件だけ置く（プリセットは既にあるものを使う） */
    if (ST && ST.mocks && ST.mocks.put) ST.mocks.put({ id:"mock_test1", spec:{
      title:"検証用の期末考査", subject:"日本史", totalPoints:100, durationMinutes:50,
      sections:[{questions:[{},{}]},{questions:[{},{}]}] } });
    document.body.setAttribute("data-app-tab","inbox");
  });
  await pg.waitForTimeout(2400);

  console.log("== 添付の入口 ==");
  ok("プリセットのボタンがある", await F(pg,'[data-a="pick"][data-kind="preset"]'));
  ok("試験のボタンがある", await F(pg,'[data-a="pick"][data-kind="mock"]'));

  console.log("\n== プリセットを添付して投稿 ==");
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="pick"][data-kind="preset"]').click());
  await pg.waitForTimeout(700);
  ok("選ぶシートが出る", await F(pg,".pick-c"));
  ok("手元のプリセットが並ぶ", await F(pg,'[data-a="pick-one"]'));
  const picked = await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const b=r.querySelector('[data-a="pick-one"]');
    const id=b.getAttribute("data-id");
    const name=(b.querySelector(".att-t")||{}).textContent||"";
    b.click(); return {id,name};
  });
  await pg.waitForTimeout(700);
  ok("投稿欄に添付が出る", await F(pg,'[data-a="drop-card"]'));
  const ptext = "プリセットを添付する確認 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,200));
    r.querySelector('[data-act="post"]').click();
  }, ptext);
  await pg.waitForTimeout(2600);
  let sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  let sp = (sv.posts||[]).find(p=>String(p.body||"").includes(ptext));
  ok("サーバに preset カードが入った", sp && sp.cardType==="preset" && sp.card && sp.card.presetId===picked.id,
     JSON.stringify(sp && {t:sp.cardType, id:sp.card&&sp.card.presetId, want:picked.id}));
  ok("選んだ名前と一致する", sp && sp.card && sp.card.name===picked.name,
     JSON.stringify(sp&&sp.card&&{got:sp.card.name, want:picked.name}));
  ok("問題数が 0 でない（実体から数えている）", sp && sp.card && sp.card.itemCount>0,
     JSON.stringify(sp&&sp.card&&sp.card.itemCount));
  ok("画面にカードが出る", await F(pg,'[data-a="open-preset"]'));

  console.log("\n== 試験を添付して投稿 ==");
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="pick"][data-kind="mock"]').click());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="pick-one"][data-id="mock_test1"]').click());
  await pg.waitForTimeout(700);
  const mtext = "試験を添付する確認 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,200));
    r.querySelector('[data-act="post"]').click();
  }, mtext);
  await pg.waitForTimeout(2600);
  sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  sp = (sv.posts||[]).find(p=>String(p.body||"").includes(mtext));
  ok("サーバに mock カードが入った", sp && sp.cardType==="mock" && sp.card && sp.card.mockId==="mock_test1",
     JSON.stringify(sp && {t:sp.cardType, c:sp.card}));
  ok("問題数・満点も入った", sp && sp.card && sp.card.questionCount===4 && sp.card.totalPoints===100,
     JSON.stringify(sp&&sp.card&&{q:sp.card.questionCount,p:sp.card.totalPoints}));
  ok("画面にカードが出る", await F(pg,'[data-a="open-mock"]'));
  await pg.screenshot({ path:"shots/feed/05-attach.png" });

  console.log("\n== 添付をやめられるか ==");
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="pick"][data-kind="preset"]').click());
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="pick-one"]').click());
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot
    .querySelector('[data-a="drop-card"]').click());
  await pg.waitForTimeout(600);
  ok("添付が外れる", !(await F(pg,'[data-a="drop-card"]')));

  ok("横はみ出し 0px", 0===await pg.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  ok("JS エラーなし", errs.length===0, errs.join(" / "));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
