const { chromium } = require("playwright");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext()).newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => { const s=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    s(document.getElementById("authLoginGrade"),"H3");s(document.getElementById("authLoginNickname"),"tester");
    s(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click(); });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(async () => {
    const AI = window.VQ2.ai;
    const att = [{ id:"a1", name:"資料.txt", kind:"document", text:"812年 ドルヴァス朝が成立した。839年 ザルカンド条約。", pageCount:1 }];
    const out = { single:null, concurrent:null };
    try { const x = await AI.generateQuestions({ prompt:"次の設問を1問作ってください。問題文・正解・解説・選択肢2つ以上。id: p1-1", attachments:att, sourceOnly:true, count:1 });
      out.single = { ok:true, n:(x.questions||[]).length }; }
    catch(e){ out.single = { ok:false, msg:String(e&&e.message), user:String(e&&e.userMessage||"") }; }
    /* 2件同時に投げる */
    const mk = (i) => AI.generateQuestions({ prompt:"設問を1問。id: p1-"+i, attachments:att, sourceOnly:true, count:1 });
    const res = await Promise.allSettled([mk(1), mk(2)]);
    out.concurrent = res.map(r => r.status==="fulfilled" ? {ok:true,n:(r.value.questions||[]).length}
      : {ok:false,msg:String(r.reason&&r.reason.message),user:String(r.reason&&r.reason.userMessage||"")});
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
