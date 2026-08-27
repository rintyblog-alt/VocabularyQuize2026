/* 画像の添付が、選ぶ → あがる → 投稿 → 表示 まで通るか。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
const SCR = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
const F=(pg,sel)=>pg.evaluate((s)=>!!document.getElementById("vqFeed").shadowRoot.querySelector(s),sel);

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,150)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil:"domcontentloaded" });
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1", t), TOKEN);
  await pg.reload({ waitUntil:"domcontentloaded" });
  await pg.waitForTimeout(3200);
  await pg.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-app-tab","inbox");});
  await pg.waitForTimeout(2400);

  ok("画像ボタンがある", await F(pg,'[data-a="pick-img"]'));

  console.log("\n== 画像を選んであげる ==");
  const [chooser] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="pick-img"]').click())
  ]);
  await chooser.setFiles([SCR + "/t.png"]);
  await pg.waitForTimeout(2600);
  ok("下書きにサムネが出る", await F(pg,".dimg img"));
  const durl = await pg.evaluate(()=>{
    const i=document.getElementById("vqFeed").shadowRoot.querySelector(".dimg img");
    return i ? i.getAttribute("src") : "";});
  ok("URL が /api/media/ になっている", /^\/api\/media\/img\/[a-z0-9]+\.png$/.test(durl), durl);

  console.log("\n== 投稿する ==");
  const text = "画像つきの投稿 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,250));
    r.querySelector('[data-act="post"]').click();
  }, text);
  await pg.waitForTimeout(2800);
  const sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  const sp = (sv.posts||[]).find(p=>String(p.body||"").includes(text));
  ok("サーバに images が入った", sp && (sp.images||[]).length===1 && sp.images[0]===durl,
     JSON.stringify(sp && sp.images));
  ok("画面に画像が出る", await F(pg,".imgs img"));
  ok("実際に読めている（壊れていない）", await pg.evaluate(()=>{
    const i=document.getElementById("vqFeed").shadowRoot.querySelector(".imgs img");
    return !!i && i.complete && i.naturalWidth>0;}));
  await pg.screenshot({ path:"shots/feed/06-image.png" });

  console.log("\n== 外部の URL を出さないか ==");
  ok("よその URL は描かない", await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    /* 画面に出ている img はすべて自分のところ */
    return [...r.querySelectorAll(".imgs img")].every(i=>/^\/api\/media\//.test(i.getAttribute("src")||""));}));

  ok("横はみ出し 0px", 0===await pg.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  ok("JS エラーなし", errs.length===0, errs.join(" / "));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
