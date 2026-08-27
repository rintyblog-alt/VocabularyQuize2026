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
  await pg.waitForTimeout(1200);
  await pg.evaluate(()=>{ const btn=document.querySelector('[data-app-tab="library"]'); if(btn) btn.click(); });
  await pg.waitForTimeout(2600);
  await pg.evaluate(`(() => { const deep=${DEEP};
    const bs = deep("button").filter(b=>(b.innerText||"").trim()==="開始"); if(bs.length) bs[0].click(); })()`);
  await pg.waitForTimeout(2800);
  await pg.screenshot({path:"shots/quiz/"+d.n+"-v2-未回答.png"});
  // 選択肢を 1 つ押す
  const picked = await pg.evaluate(`(() => { const deep=${DEEP};
    const c = deep(".vq2-choice"); if(!c.length) return {n:0}; c[1].click();
    return {n:c.length}; })()`);
  await pg.waitForTimeout(900);
  const state = await pg.evaluate(`(() => { const deep=${DEEP};
    const cs = deep(".vq2-choice");
    const box = deep(".vq2-qbox")[0];
    const q = deep(".vq2-q")[0];
    return { choices: cs.length,
      picked: cs.filter(c=>c.className.indexOf("is-picked")>=0).length,
      wrongGreen: cs.filter(c=>c.className.indexOf("is-correct")>=0).length,
      boxW: box? Math.round(box.getBoundingClientRect().width):0,
      qW: q? Math.round(q.getBoundingClientRect().width):0,
      choiceH: cs[0]? Math.round(cs[0].getBoundingClientRect().height):0,
      progN: (deep(".vq2-prog-n")[0]||{innerText:""}).innerText.trim() }; })()`);
  console.log(d.n, JSON.stringify(state));
  await pg.screenshot({path:"shots/quiz/"+d.n+"-v2-選択後.png"});
  // 答え合わせ
  await pg.evaluate(`(() => { const deep=${DEEP};
    const b = deep('[data-act="check"]')[0]; if(b) b.click(); })()`);
  await pg.waitForTimeout(1000);
  const fb = await pg.evaluate(`(() => { const deep=${DEEP};
    const cs = deep(".vq2-choice");
    return { chip: (deep(".vq2-chip,.vq2-badge").map(x=>x.innerText.trim()).filter(t=>/正解|不正解/.test(t))[0]||""),
      correctMarked: cs.filter(c=>/is-correct/.test(c.className)).length,
      hasExpl: deep(".vq2-card").length>0 }; })()`);
  console.log(d.n,"答え合わせ:",JSON.stringify(fb));
  await pg.screenshot({path:"shots/quiz/"+d.n+"-v2-答え合わせ.png"});
  // 次の問題でキーボード（C）
  /* 隠れている認証画面にも「次へ」があるので、出題画面のボタンだけを見る */
  const nx = await pg.evaluate(`(() => { const deep=${DEEP};
    const b = deep('[data-act="next"]')[0]; if(b){b.click(); return true;} return false; })()`);
  console.log(d.n,"次へ:",nx);
  await pg.waitForTimeout(1200);
  await pg.keyboard.press("c");
  await pg.waitForTimeout(700);
  const kb = await pg.evaluate(`(() => { const deep=${DEEP};
    const cs = deep(".vq2-choice");
    const i = cs.findIndex(c=>/is-picked/.test(c.className));
    return { pickedIndex: i, label: i>=0 ? cs[i].querySelector(".vq2-choice-l").innerText.trim() : "" }; })()`);
  console.log(d.n,"キーC:",JSON.stringify(kb));
  await pg.context().close();
  }
  await b.close();
})();
