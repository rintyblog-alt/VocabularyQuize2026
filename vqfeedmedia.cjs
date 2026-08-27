/* 画像を押して大きく見る／返信のバー／返信の続き を、実ブラウザで確かめる。 */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
const SCR = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
const Q=(x)=>{
  const a=document.getElementById("vqFeed"); const b=document.getElementById("vqFeedLightbox");
  return (b&&b.shadowRoot&&b.shadowRoot.querySelector(x)) || (a&&a.shadowRoot&&a.shadowRoot.querySelector(x)) || null;};
const F=(pg,s)=>pg.evaluate((x)=>{
  const a=document.getElementById("vqFeed"); const b=document.getElementById("vqFeedLightbox");
  return !!((b&&b.shadowRoot&&b.shadowRoot.querySelector(x))||(a&&a.shadowRoot&&a.shadowRoot.querySelector(x)));},s);
const C=(pg,s)=>pg.evaluate((x)=>{
  const a=document.getElementById("vqFeed"); const b=document.getElementById("vqFeedLightbox");
  const e=(b&&b.shadowRoot&&b.shadowRoot.querySelector(x))||(a&&a.shadowRoot&&a.shadowRoot.querySelector(x));
  if(e)e.click(); return !!e;},s);

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

  console.log("== 公開範囲のピル ==");
  const pill = await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.dispatchEvent(new Event("focusin",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,400));
    const b=r.querySelector(".comp-aud b");
    if(!b) return null;
    const bb=b.getBoundingClientRect();
    const sv=b.querySelector("svg").getBoundingClientRect();
    return {h:Math.round(bb.height), w:Math.round(bb.width), icon:Math.round(sv.width)};
  });
  ok("1 行に収まっている（高さ 34px 以下）", pill && pill.h<=34, JSON.stringify(pill));
  ok("アイコンが小さい（16px 以下）", pill && pill.icon<=16, JSON.stringify(pill));

  console.log("\n== 画像を 2 枚つけて投稿 ==");
  for (let k=0;k<2;k++){
    const [ch] = await Promise.all([ pg.waitForEvent("filechooser"),
      pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="pick-img"]').click()) ]);
    await ch.setFiles([SCR + "/big.png"]);
    await pg.waitForTimeout(2200);
  }
  const text = "画像を押して拡大する確認 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,250));
    r.querySelector('[data-act="post"]').click();
  }, text);
  await pg.waitForTimeout(3000);

  console.log("\n== 押して大きく見る ==");
  /* 2 枚以上は横スワイプの並びになるので、そこから押す */
  ok("画像が押せる", await F(pg,'[data-a="zoom"]'));
  await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    /* いま作った投稿（先頭）の 1 枚目を押す */
    const post=r.querySelector(".post");
    const img=post.querySelector('[data-a="zoom"]');
    img.click();});
  await pg.waitForTimeout(700);
  ok("拡大表示が出る", await F(pg,".lb img"));
  const big = await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const lb=document.getElementById("vqFeedLightbox");
    const s=r.querySelector('[data-a="zoom"]'), l=lb.shadowRoot.querySelector(".lb img");
    return { small:Math.round(s.getBoundingClientRect().width), big:Math.round(l.getBoundingClientRect().width) };});
  ok("元より大きい", big.big > big.small, JSON.stringify(big));
  ok("枚数が出る", await F(pg,".lb-n"));
  ok("送るボタンがある", await F(pg,".lb-next"));
  await C(pg,".lb-next"); await pg.waitForTimeout(500);
  ok("次の画像へ送れる", await pg.evaluate(()=>{
    const lb=document.getElementById("vqFeedLightbox");
    return (lb.shadowRoot.querySelector(".lb-n").textContent||"").indexOf("2 /")===0;}));

  console.log("\n== 左パネルより上に出ているか ==");
  const cover = await pg.evaluate(()=>{
    const lb=document.getElementById("vqFeedLightbox");
    if(!lb) return {no:1};
    /* 左パネルの真ん中を指したとき、最前面がライトボックスかどうか */
    const bar=document.getElementById("appTabBar");
    const bb=bar?bar.getBoundingClientRect():null;
    const pt=bb?document.elementFromPoint(Math.round(bb.left+bb.width/2), Math.round(bb.top+bb.height/2)):null;
    const r=lb.getBoundingClientRect();
    return { top: pt ? (pt.id==="vqFeedLightbox"||lb.contains(pt)) : null,
             full: Math.round(r.width)===window.innerWidth && Math.round(r.height)===window.innerHeight,
             z: getComputedStyle(lb).zIndex };});
  ok("画面いっぱいに敷かれている", cover.full, JSON.stringify(cover));
  ok("左パネルの上に被さっている", cover.top===true, JSON.stringify(cover));
  await pg.screenshot({ path:"shots/feed/07-lightbox.png" });
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(500);
  ok("Esc で閉じる", !(await F(pg,".lb")));

  console.log("\n== 返信のバー ==");
  await C(pg,'[data-a="open"]');
  await pg.waitForTimeout(1800);
  const rtext = "返信のバー確認 " + Date.now();
  await pg.evaluate(async (o)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-reply-input]");
    ta.value=o; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,200));
    r.querySelector('[data-a="reply"]').click();
  }, rtext);
  await pg.waitForTimeout(2400);
  ok("返信にいいねがある", await F(pg,'[data-a="r-like"]'));
  ok("返信に保存がある", await F(pg,'[data-a="r-bookmark"]'));
  const rid = await pg.evaluate(()=>{
    const b=document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="r-like"]');
    return b?b.getAttribute("data-rid"):"";});
  await C(pg,'[data-a="r-like"]'); await pg.waitForTimeout(1600);
  ok("押した状態になる", await pg.evaluate(()=>{
    const b=document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="r-like"]');
    return b.getAttribute("aria-pressed")==="true";}));
  const pid = await pg.evaluate(()=>{
    const b=document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="r-like"]');
    return b.getAttribute("data-pid");});
  const rs = await (await fetch(BASE+"/api/posts/replies?postId="+encodeURIComponent(pid),
    {headers:{Authorization:"Bearer "+TOKEN}})).json();
  const rr = (rs.replies||[]).find(r=>r.id===rid);
  ok("サーバにも入った", rr && rr.liked===true && rr.likeCount===1, JSON.stringify(rr&&{l:rr.liked,c:rr.likeCount}));
  ok("続きの目印が返る（hasMore / nextAfter）", "hasMore" in rs && "nextAfter" in rs, JSON.stringify(Object.keys(rs)));
  await pg.screenshot({ path:"shots/feed/08-reply-actions.png" });

  ok("横はみ出し 0px", 0===await pg.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  ok("JS エラーなし", errs.length===0, errs.join(" / "));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
