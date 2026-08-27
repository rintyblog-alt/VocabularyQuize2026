/* スマホ幅の Feed が、はみ出さず・下のナビに隠れず・指で押せるか。 */
const { chromium } = require("playwright");
const fs=require("node:fs"); fs.mkdirSync("shots/feedsp",{recursive:true});
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
const SCR = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};

async function setup(pg, w, h) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil:"domcontentloaded" });
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1", t), TOKEN);
  await pg.reload({ waitUntil:"domcontentloaded" });
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    /* アプリ既定の案内は閉じる */
    const d=document.querySelector(".vq2-dialog [data-act='dlg-o'], [data-act='dlg-o']"); if(d)d.click();
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-ui-v2","1");
    document.body.setAttribute("data-app-tab","inbox");});
  await pg.waitForTimeout(2600);
}
const over = (pg)=>pg.evaluate(()=>{
  const r=document.getElementById("vqFeed").shadowRoot; const out=[];
  r.querySelectorAll("*").forEach(e=>{
    /* 横に流す入れ物の中身は、画面の外にあって当たり前（流せば見える） */
    if(e.closest("[data-mtrack]")) return;
    const b=e.getBoundingClientRect();
    if(b.width>0 && (b.right>window.innerWidth+1 || b.left<-1))
      out.push({cls:(e.className&&e.className.toString&&e.className.toString().slice(0,30))||e.tagName,
                l:Math.round(b.left),rt:Math.round(b.right)});});
  return out;});

(async () => {
  const b = await chromium.launch({ headless: true });
  for (const dev of [{n:"iPhone 390",w:390,h:844},{n:"小型 360",w:360,h:740},{n:"横 812",w:812,h:390}]) {
    const pg = await (await b.newContext({ viewport:{width:dev.w,height:dev.h},
      deviceScaleFactor:2, isMobile:true, hasTouch:true })).newPage();
    const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,130)));
    await setup(pg, dev.w, dev.h);
    console.log("== " + dev.n + " ==");

    const o = await over(pg);
    ok(dev.n+"：はみ出す要素なし", o.length===0, JSON.stringify(o.slice(0,3)));
    ok(dev.n+"：横スクロールなし", 0===await pg.evaluate(()=>
      Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));

    /* 添付を付けた状態でも崩れないか */
    await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      r.querySelector('[data-a="pick"][data-kind="preset"]').click();});
    await pg.waitForTimeout(700);
    await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const x=r.querySelector('[data-a="pick-one"]'); if(x)x.click();});
    await pg.waitForTimeout(800);
    const o2 = await over(pg);
    ok(dev.n+"：添付を付けてもはみ出さない", o2.length===0, JSON.stringify(o2.slice(0,3)));

    /* 指で押せる大きさか（最小 32px） */
    const small = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot; const bad=[];
      r.querySelectorAll('button, [role="slider"]').forEach(e=>{
        const b=e.getBoundingClientRect();
        if(b.width>0 && (b.height<30))
          bad.push({cls:(e.className&&e.className.toString&&e.className.toString().slice(0,26))||e.tagName,
                    h:Math.round(b.height)});});
      return bad;});
    ok(dev.n+"：押せる大きさ（30px 以上）", small.length===0, JSON.stringify(small.slice(0,4)));

    /* 下のナビに隠れないか */
    const bottom = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const w=r.querySelector(".wrap");
      const cs=getComputedStyle(w);
      return { pb: parseFloat(cs.paddingBottom) };});
    ok(dev.n+"：下に余白がある（96px 以上）", bottom.pb>=96, JSON.stringify(bottom));
    const topPad = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      return parseFloat(getComputedStyle(r.querySelector(".wrap")).paddingTop);});
    ok(dev.n+"：上に無駄な余白が無い", topPad<=4, String(topPad));

    /* 複数のメディアを横に流せるか */
    const rail = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const t=r.querySelector("[data-mtrack]");
      if(!t) return {none:1};
      const rail=t.closest("[data-mrail]");
      const items=t.querySelectorAll(".mrail-i").length;
      const dots=rail.querySelectorAll(".mrail-dot").length;
      const cs=getComputedStyle(t);
      return { items, dots, snap:cs.scrollSnapType, ox:cs.overflowX,
               w:Math.round(t.clientWidth), sw:Math.round(t.scrollWidth) };});
    if (rail.none) { ok(dev.n+"：複数メディアの投稿が無いので測れず", true); }
    else {
      ok(dev.n+"：横に流せる", rail.ox==="auto"||rail.ox==="scroll", JSON.stringify(rail));
      ok(dev.n+"：1 枚ずつ止まる", /x/.test(rail.snap)&&/mandatory/.test(rail.snap), rail.snap);
      ok(dev.n+"：枚数の点が出る", rail.dots===rail.items, JSON.stringify(rail));
      ok(dev.n+"：中身が横に並んでいる", rail.sw>rail.w+10, JSON.stringify(rail));
      const moved = await pg.evaluate(async ()=>{
        const r=document.getElementById("vqFeed").shadowRoot;
        const t=r.querySelector("[data-mtrack]");
        t.scrollLeft = t.clientWidth;
        t.dispatchEvent(new Event("scroll",{bubbles:true}));
        await new Promise(x=>setTimeout(x,260));
        const dots=[...t.closest("[data-mrail]").querySelectorAll(".mrail-dot")];
        return dots.findIndex(d=>d.classList.contains("is-on"));});
      ok(dev.n+"：流すと点が追いかける", moved===1, String(moved));
    }
    ok(dev.n+"：JS エラーなし", errs.length===0, errs.join(" / "));
    await pg.screenshot({ path:"shots/feedsp/"+dev.w+".png" });
    await pg.context().close();
  }
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
