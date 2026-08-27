const { chromium } = require("playwright");
const DEEP = `(sel) => { const out=[]; const walk=(r)=>{ r.querySelectorAll("*").forEach(el=>{ if(el.matches(sel)) out.push(el); if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const mode of ["TURN","RANDOM","WRITE","SWITCH","EXAM"]) {
  const pg = await (await b.newContext({viewport:{width:1440,height:950},deviceScaleFactor:2})).newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&cb="+Date.now(), {waitUntil:"domcontentloaded"});
  await pg.waitForTimeout(4200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach(x=>x.click());
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
  });
  await pg.waitForTimeout(1800);
  const clicked = await pg.evaluate(`(() => { const deep=${DEEP};
    const t = deep("button,[role='button']").find(b=>new RegExp("${mode}\\\\s*MODE","i").test((b.innerText||"")));
    if(!t) return false; t.click(); return true; })()`);
  await pg.waitForTimeout(2600);
  // モーダル（時間選択など）が出たら最初の選択肢を押す
  await pg.evaluate(`(() => { const deep=${DEEP};
    const ok = deep("button").find(b=>/^(開始|はじめる|スタート|OK|制限なし)$/.test((b.innerText||"").trim()));
    if(ok) ok.click(); })()`);
  await pg.waitForTimeout(2200);
  const st = await pg.evaluate(()=>{
    const q=document.getElementById("viewQuiz");
    const scr=document.getElementById("vqScreens");
    const r=q?q.getBoundingClientRect():null;
    // 画面中央にあるいちばん上の要素は何か
    const top=document.elementFromPoint(window.innerWidth*0.6, window.innerHeight*0.45);
    let path=[], e=top; while(e && path.length<4){ path.push(e.id||e.className||e.tagName); e=e.parentElement; }
    return {
      legacyActive: !!document.querySelector("#viewQuiz.active"),
      quizFocus: document.body.classList.contains("quiz-focus"),
      appTab: document.body.dataset.appTab,
      screensDisplay: scr?getComputedStyle(scr).display:null,
      screensZ: scr?getComputedStyle(scr).zIndex:null,
      quizVisible: r? (r.width>0 && r.height>0):false,
      topAtCenter: path.join(" < ").slice(0,120)
    };
  });
  console.log(mode, JSON.stringify(st));
  await pg.screenshot({path:"shots/quiz/mode-"+mode+".png"});
  await pg.context().close();
  }
  await b.close();
})();
