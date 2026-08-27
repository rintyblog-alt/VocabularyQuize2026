const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/quiz",{recursive:true});
const DEEP = `(sel) => { const out=[]; const walk=(r)=>{ r.querySelectorAll("*").forEach(el=>{ if(el.matches(sel)) out.push(el); if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const d of [{n:"PC",w:1440,h:950,m:false},{n:"スマホ",w:390,h:844,m:true}]) {
  const pg = await (await b.newContext({viewport:{width:d.w,height:d.h},deviceScaleFactor:2,isMobile:d.m,hasTouch:d.m})).newPage();
  pg.on("pageerror", e=>console.log("ERR", String(e).slice(0,140)));
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
  await pg.evaluate(`(() => { const deep=${DEEP};
    const t = deep("button,[role='button']").find(b=>/TURN\\s*MODE/i.test((b.innerText||"")));
    if(t) t.click(); })()`);
  await pg.waitForTimeout(2800);
  const st = await pg.evaluate(()=>{
    const p=document.getElementById("promptText");
    const pt=document.getElementById("progressText");
    const track=document.querySelector("#viewQuiz .quiz-progress-track");
    const card=document.querySelector("#viewQuiz .quiz-question-card");
    const shell=document.getElementById("vqShell");
    const r=(e)=>e?e.getBoundingClientRect():null;
    const pr=r(pt), tr=r(track);
    // 進捗の文字がチップに隠れていないか（他の要素が上にいないか）
    let covered=false;
    if(pr && pr.width){ const el=document.elementFromPoint(pr.left+pr.width/2, pr.top+pr.height/2);
      covered = !(el===pt || (pt&&pt.contains(el))); }
    return {
      promptCls: p? p.className : "",
      promptFont: p? Math.round(parseFloat(getComputedStyle(p).fontSize)) : 0,
      promptLen: p? (p.textContent||"").trim().length : 0,
      progressText: pt? pt.textContent.trim() : "",
      progressCovered: covered,
      trackW: tr? Math.round(tr.width):0,
      cardBg: card? getComputedStyle(card).backgroundColor : "",
      sidebarHidden: !shell || getComputedStyle(shell).display==="none",
      fillBg: track? getComputedStyle(document.querySelector("#viewQuiz .quiz-progress-fill")).backgroundColor : "",
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      headerH: Math.round((document.querySelector("#viewQuiz .quiz-header")||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
      chipsWrap: (function(){ const c=document.querySelector("#viewQuiz .quiz-top-chips");
        return c? getComputedStyle(c).flexWrap+"/"+getComputedStyle(c).display : ""; })(),
      exitVisible: (function(){ const e=document.querySelector("#viewQuiz .quiz-exit-btn");
        if(!e) return false; const r=e.getBoundingClientRect();
        return r.left>=0 && r.right<=window.innerWidth+1; })(),
      skinCss: !!document.getElementById("vqQuizSkinCss"),
      skinLast: (function(){ const e=document.getElementById("vqQuizSkinCss");
        if(!e) return false; const all=document.querySelectorAll("style,link[rel=stylesheet]");
        return all[all.length-1]===e; })(),
      chipRows: (function(){ const c=document.querySelectorAll("#viewQuiz .quiz-top-chips > *");
        const tops=new Set(); c.forEach(x=>tops.add(Math.round(x.getBoundingClientRect().top))); return tops.size; })()
    };
  });
  console.log(d.n, JSON.stringify(st));
  await pg.screenshot({path:"shots/quiz/"+d.n+"-旧TURN.png"});
  await pg.context().close();
  }
  await b.close();
})();
