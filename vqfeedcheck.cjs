/* 新しい Feed を、ログイン状態で実際に触って確かめる。
   投稿 → 返信 → いいね → 保存 を UI から行い、サーバ側にも入ったかを見る。 */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/feed", { recursive: true });
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
const F = (pg,sel)=>pg.evaluate((s)=>{const r=document.getElementById("vqFeed").shadowRoot;return !!r.querySelector(s);},sel);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e).slice(0,160)));

  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  /* ログイン状態にする */
  await pg.evaluate((t)=>localStorage.setItem("app.auth.token.v1", t), TOKEN);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-app-tab","inbox");
  });
  await pg.waitForTimeout(2200);

  console.log("== 画面が Studio 準拠になっているか ==");
  ok("vqFeed が入っている", await pg.evaluate(()=>!!document.getElementById("vqFeed")));
  ok("旧 Feed は隠れている", await pg.evaluate(()=>{
    const p=document.getElementById("appInboxPage");
    return [...p.children].filter(c=>c.id!=="vqFeed").every(c=>getComputedStyle(c).display==="none");}));
  ok("Studio のタブがある", await F(pg,'.tabs [data-tab="all"]'));
  ok("投稿欄がある", await F(pg,"[data-composer]"));
  ok("操作行がそろっている（返信/リポスト/いいね/保存/共有）",
    await F(pg,'[data-a="open"]') && await F(pg,'[data-a="repost"]')
    && await F(pg,'[data-a="like"]') && await F(pg,'[data-a="bookmark"]')
    && await F(pg,'[data-a="share"]'));
  await pg.screenshot({ path: "shots/feed/01-list.png" });

  console.log("\n== 投稿する ==");
  const text = "UI から投稿できるかの確認 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,200));
    r.querySelector('[data-act="post"]').click();
  }, text);
  await pg.waitForTimeout(2200);
  const onScreen = await pg.evaluate((t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    return (r.querySelector(".wrap").innerText||"").includes(t);}, text);
  ok("画面に出た", onScreen);
  const onServer = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",
    {headers:{Authorization:"Bearer "+TOKEN}})).json();
  const found = (onServer.posts||[]).find(p=>String(p.body||"").includes(text));
  ok("サーバにも入った", !!found, JSON.stringify((onServer.posts||[]).length));
  const pid = found ? found.id : null;

  console.log("\n== いいね ==");
  await pg.evaluate((id)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    r.querySelector('[data-a="like"][data-id="'+id+'"]').click();},pid);
  await pg.waitForTimeout(1500);
  ok("押した状態になる", await pg.evaluate((id)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    return r.querySelector('[data-a="like"][data-id="'+id+'"]').getAttribute("aria-pressed")==="true";},pid));
  let sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  let sp = (sv.posts||[]).find(p=>p.id===pid);
  ok("サーバのいいねが 1", sp && sp.likeCount===1 && sp.liked===true, JSON.stringify(sp&&{l:sp.likeCount,k:sp.liked}));

  console.log("\n== 保存 ==");
  await pg.evaluate((id)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    r.querySelector('[data-a="bookmark"][data-id="'+id+'"]').click();},pid);
  await pg.waitForTimeout(1500);
  sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  sp = (sv.posts||[]).find(p=>p.id===pid);
  ok("サーバの保存が立つ", sp && sp.bookmarked===true, JSON.stringify(sp&&{b:sp.bookmarked}));

  console.log("\n== 投稿を開く（詳細ページ）==");
  const rtext = "UI からの返信 " + Date.now();
  await pg.evaluate((id)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    r.querySelector('[data-a="open"][data-id="'+id+'"]').click();},pid);
  await pg.waitForTimeout(1600);
  ok("詳細ページへ入る", await F(pg,'[data-a="back"]'));
  ok("見出しが「ポスト」", await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const h=r.querySelector(".head h1"); return h && h.textContent.trim()==="ポスト";}));
  ok("時刻の行が出る", await F(pg,".stamp"));
  ok("返信欄がある", await F(pg,"[data-reply-input]"));
  await pg.screenshot({ path: "shots/feed/04-detail.png" });

  console.log("\n== 返信 ==");
  await pg.evaluate(async (o)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector('[data-reply-input="'+o.id+'"]');
    ta.value=o.t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,150));
    r.querySelector('[data-a="reply"][data-id="'+o.id+'"]').click();
  }, {id:pid,t:rtext});
  await pg.waitForTimeout(2000);
  const rs = await (await fetch(BASE+"/api/posts/replies?postId="+encodeURIComponent(pid),
    {headers:{Authorization:"Bearer "+TOKEN}})).json();
  ok("サーバに返信が入った", (rs.replies||[]).some(r=>String(r.body||"").includes(rtext)),
     JSON.stringify((rs.replies||[]).length));
  ok("画面にも出た", await pg.evaluate((t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    return (r.querySelector(".wrap").innerText||"").includes(t);}, rtext));
  await pg.screenshot({ path: "shots/feed/02-reply.png" });

  console.log("\n== 戻る ==");
  await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    r.querySelector('[data-a="back"]').click();});
  await pg.waitForTimeout(900);
  ok("一覧へ戻る", await F(pg,'.tabs [data-tab="all"]') && !(await F(pg,'[data-a="back"]')));

  console.log("\n== X と同じ操作がそろっているか ==");
  ok("返信 / リポスト / いいね / 保存 / 共有 の 5 つ",
    await F(pg,'[data-a="open"]') && await F(pg,'[data-a="repost"]')
    && await F(pg,'[data-a="like"]') && await F(pg,'[data-a="bookmark"]')
    && await F(pg,'[data-a="share"]'));
  ok("投稿欄が触ると開く（公開範囲が出る）", await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.dispatchEvent(new Event("focusin",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,400));
    const c=r.querySelector(".comp");
    return c && c.classList.contains("is-open")
      && getComputedStyle(r.querySelector(".comp-aud")).display!=="none";}));

  console.log("\n== 見た目 ==");
  ok("横はみ出し 0px", 0===await pg.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  ok("JS エラーなし", errs.length===0, errs.join(" / "));

  /* スマホ */
  const pg2 = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
  await pg2.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil:"domcontentloaded" });
  await pg2.evaluate((t)=>localStorage.setItem("app.auth.token.v1", t), TOKEN);
  await pg2.reload({ waitUntil:"domcontentloaded" });
  await pg2.waitForTimeout(3000);
  await pg2.evaluate(()=>{
    ["firstLaunchOverlay","vqbFlow","vqNewAuth","authGate","authBootSplash"].forEach(id=>{
      const e=document.getElementById(id); if(e){e.hidden=true;e.style.setProperty("display","none","important");}});
    document.body.classList.remove("auth-booting","auth-gate-open");
    const a=document.getElementById("app"); if(a)a.style.setProperty("display","block","important");
    document.body.setAttribute("data-app-tab","inbox");});
  await pg2.waitForTimeout(2200);
  ok("スマホ 横はみ出し 0px", 0===await pg2.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  await pg2.screenshot({ path: "shots/feed/03-mobile.png" });

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
