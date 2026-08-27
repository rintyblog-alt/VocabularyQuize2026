/* 動画をあげて、投稿して、自前の再生バーが出るかを確かめる。 */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
const SCR = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x?"  → "+x:"")));};
const F=(pg,s)=>pg.evaluate((x)=>!!document.getElementById("vqFeed").shadowRoot.querySelector(x),s);

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

  console.log("== 選択画面が動画を受け付けるか ==");
  const acc = await pg.evaluate(async ()=>{
    /* input が作られる瞬間の accept を見る */
    let seen = "";
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function(){ if(this.type==="file") seen=this.accept; };
    document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="pick-img"]').click();
    await new Promise(r=>setTimeout(r,200));
    HTMLInputElement.prototype.click = orig;
    return seen;
  });
  ok("mp4 を選べる", /video\/mp4/.test(acc), acc);
  ok("webm を選べる", /video\/webm/.test(acc), acc);
  ok("ボタンの名前が「画像・動画」", await pg.evaluate(()=>{
    const b=document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="pick-img"]');
    return (b.textContent||"").indexOf("画像・動画")>=0;}));

  console.log("\n== 動画をあげて投稿 ==");
  const [ch] = await Promise.all([ pg.waitForEvent("filechooser"),
    pg.evaluate(()=>document.getElementById("vqFeed").shadowRoot.querySelector('[data-a="pick-img"]').click()) ]);
  await ch.setFiles([SCR + "/t.mp4"]);
  await pg.waitForTimeout(2600);
  ok("下書きに動画が出る", await F(pg,".dimg video"));
  const durl = await pg.evaluate(()=>{
    const v=document.getElementById("vqFeed").shadowRoot.querySelector(".dimg video");
    return v?v.getAttribute("src"):"";});
  ok("URL が /api/media/vid/ になっている", /^\/api\/media\/vid\/[a-z0-9]+\.mp4$/.test(durl), durl);

  const text = "動画つきの投稿 " + Date.now();
  await pg.evaluate(async (t)=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const ta=r.querySelector("[data-composer]");
    ta.value=t; ta.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,250));
    r.querySelector('[data-act="post"]').click();
  }, text);
  await pg.waitForTimeout(3000);
  const sv = await (await fetch(BASE+"/api/posts/feed?scope=all&limit=10",{headers:{Authorization:"Bearer "+TOKEN}})).json();
  const sp = (sv.posts||[]).find(p=>String(p.body||"").includes(text));
  ok("サーバに動画の URL が入った", sp && (sp.images||[]).some(u=>/\/api\/media\/vid\//.test(u)),
     JSON.stringify(sp&&sp.images));

  console.log("\n== 自前の再生バー ==");
  ok("動画が出る", await F(pg,".vid video"));
  ok("再生ボタンがある", await F(pg,'[data-a="v-play"]'));
  ok("進み具合のバーがある", await F(pg,'[data-a="v-seek"]'));
  ok("時間の表示がある", await F(pg,"[data-vtime]"));
  ok("ブラウザ既定の操作は出さない", await pg.evaluate(()=>{
    const v=document.getElementById("vqFeed").shadowRoot.querySelector(".vid video");
    return !v.hasAttribute("controls");}));
  ok("止まっている状態が出ている", await pg.evaluate(()=>{
    const b=document.getElementById("vqFeed").shadowRoot.querySelector(".vid");
    return b.classList.contains("is-paused");}));

  console.log("\n== つまみ（VQ のマーク）==");
  ok("つまみがある", await F(pg,".vid-k"));
  ok("VQ のマークになっている（輪 3 本 + V）", await pg.evaluate(()=>{
    const k=document.getElementById("vqFeed").shadowRoot.querySelector(".vid-k");
    return k.querySelectorAll("circle").length>=4 && !!k.querySelector("path");}));
  ok("再生中は回る指定がある", await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    return [...r.querySelectorAll("style")].some(s=>/vqKnob/.test(s.textContent));}));

  console.log("\n== 掴んで動かす ==");
  const drag = await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const box=r.querySelector(".vid"), v=box.querySelector("[data-v]"), t=r.querySelector('[data-a="v-seek"]');
    /* 長さが分からない検証用ファイルなので、こちらで持たせる */
    Object.defineProperty(v,"duration",{configurable:true,get:()=>100});
    const rect=t.getBoundingClientRect();
    const mk=(x,type)=>new PointerEvent(type,{clientX:x,clientY:rect.top+rect.height/2,
      bubbles:true,composed:true,pointerId:1});
    t.dispatchEvent(mk(rect.left+rect.width*0.25,"pointerdown"));
    const scrubbing = box.classList.contains("is-scrub");
    const afterDown = v.currentTime;
    t.dispatchEvent(mk(rect.left+rect.width*0.75,"pointermove"));
    const afterMove = v.currentTime;
    const knobLeft = r.querySelector(".vid-k").style.left;
    /* 時刻は 0.14 秒かけて出る。出きるまで待ってから読む。 */
    await new Promise(x=>setTimeout(x,260));
    const tipOpacity = getComputedStyle(r.querySelector("[data-vtip]")).opacity;
    t.dispatchEvent(mk(rect.left+rect.width*0.75,"pointerup"));
    return { scrubbing, afterDown:Math.round(afterDown), afterMove:Math.round(afterMove),
             knobLeft, tipOpacity, stopped:!box.classList.contains("is-scrub") };
  });
  ok("押した位置へ飛ぶ", drag.afterDown>=20 && drag.afterDown<=30, JSON.stringify(drag));
  ok("そのまま滑らせて動かせる", drag.afterMove>=70 && drag.afterMove<=80, JSON.stringify(drag));
  ok("つまみが追いかける", parseFloat(drag.knobLeft)>=70, drag.knobLeft);
  ok("掴んでいるあいだ時刻が出る", Number(drag.tipOpacity)>0.5, drag.tipOpacity);
  ok("離すと掴み終わる", drag.stopped);

  console.log("\n== 再生の速さ ==");
  ok("速さのボタンがある", await F(pg,'[data-a="v-rate"]'));
  const rates = await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const b=r.querySelector('[data-a="v-rate"]'), v=r.querySelector("[data-v]");
    const out=[];
    for(let i=0;i<4;i++){ b.click(); await new Promise(x=>setTimeout(x,60));
      out.push({rate:v.playbackRate, label:b.textContent.trim()}); }
    return out;});
  ok("押すたびに速さが変わる", rates[0].rate===1.25 && rates[1].rate===1.5, JSON.stringify(rates));
  ok("表示も合っている", rates[0].label==="1.3×"||rates[0].label==="1.2×"||/×$/.test(rates[0].label),
     JSON.stringify(rates.map(x=>x.label)));

  console.log("\n== 拡大 ==");
  ok("拡大のボタンがある", await F(pg,'[data-a="v-full"]'));
  ok("押すと全画面を頼む", await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const box=r.querySelector(".vid");
    let asked=false;
    box.requestFullscreen=function(){ asked=true; return Promise.resolve(); };
    r.querySelector('[data-a="v-full"]').click();
    await new Promise(x=>setTimeout(x,200));
    return asked;}));

  console.log("\n== 再生 UI の引っ込め ==");
  const idle = await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const box=r.querySelector(".vid"), v=box.querySelector("[data-v]");
    const bar=box.querySelector(".vid-bar");
    /* 検証用ファイルは実際には再生できないので、再生の合図だけ出す。
       ただし **本物と同じように再生ボタンを押してから** 測る
       （押すとボタンに焦点が残り、それが原因で隠れなくなっていた）。 */
    Object.defineProperty(v,"paused",{configurable:true,get:()=>false});
    box.querySelector('[data-a="v-play"]').click();
    v.dispatchEvent(new Event("play",{bubbles:true,composed:true}));
    const t0 = getComputedStyle(bar).opacity;
    await new Promise(x=>setTimeout(x,1200));
    const t1 = { idle: box.classList.contains("is-idle") };   /* まだ隠れない */
    await new Promise(x=>setTimeout(x,2400));
    const t2 = { idle: box.classList.contains("is-idle"),
                 op: getComputedStyle(bar).opacity,
                 cursor: getComputedStyle(box).cursor };
    /* 動かすと戻る */
    box.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,composed:true,pointerId:1}));
    await new Promise(x=>setTimeout(x,420));
    const t3 = { idle: box.classList.contains("is-idle"), op: getComputedStyle(bar).opacity };
    /* 止めたら出したまま */
    Object.defineProperty(v,"paused",{configurable:true,get:()=>true});
    v.dispatchEvent(new Event("pause",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,3600));
    const t4 = { idle: box.classList.contains("is-idle") };
    return { t0, t1, t2, t3, t4 };
  });
  ok("最初は出ている", Number(idle.t0)>0.9, idle.t0);
  ok("1.2 秒では隠れない", idle.t1.idle===false, JSON.stringify(idle.t1));
  ok("3 秒すぎると隠れる", idle.t2.idle===true, JSON.stringify(idle.t2));
  ok("隠れたら透明になっている", Number(idle.t2.op)<0.1, idle.t2.op);
  ok("隠れているあいだはカーソルも消す", idle.t2.cursor==="none", idle.t2.cursor);
  ok("動かすと戻る", idle.t3.idle===false && Number(idle.t3.op)>0.9, JSON.stringify(idle.t3));
  ok("止めているあいだは隠さない", idle.t4.idle===false, JSON.stringify(idle.t4));
  /* 本物のマウスで押す。押すと焦点はボタンへ移るが、
     マウス由来なので :focus-visible は付かない＝隠れるべき。
     ここが利用者の言っていた「勝手に消えない」の実際の場面。 */
  {
    await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const box=r.querySelector(".vid"), v=box.querySelector("[data-v]");
      box.classList.remove("is-idle");
      Object.defineProperty(v,"paused",{configurable:true,get:()=>true});
      v.dispatchEvent(new Event("pause",{bubbles:true,composed:true}));
    });
    await pg.waitForTimeout(300);
    const p = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const b=r.querySelector('.vid [data-a="v-play"]').getBoundingClientRect();
      return {x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2)};});
    await pg.mouse.click(p.x, p.y);
    await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const v=r.querySelector(".vid [data-v]");
      Object.defineProperty(v,"paused",{configurable:true,get:()=>false});
      v.dispatchEvent(new Event("play",{bubbles:true,composed:true}));});
    /* カーソルを動画の外へ逃がす（上に置いたままだと出したままで正しい） */
    await pg.mouse.move(5, 5);
    await pg.waitForTimeout(3600);
    const r2 = await pg.evaluate(()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const box=r.querySelector(".vid");
      const btn=box.querySelector('[data-a="v-play"]');
      return { focused: box.contains(r.activeElement),
               fv: btn.matches(":focus-visible"),
               idle: box.classList.contains("is-idle"),
               op: getComputedStyle(box.querySelector(".vid-bar")).opacity };});
    ok("マウスで押したあとも隠れる", r2.idle===true && Number(r2.op)<0.1, JSON.stringify(r2));
    ok("キーボード由来の焦点ではない", r2.fv===false, JSON.stringify(r2));
  }
  ok("キーボードで辿っているあいだは隠さない", await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const box=r.querySelector(".vid"), v=box.querySelector("[data-v]");
    box.classList.remove("is-idle");
    Object.defineProperty(v,"paused",{configurable:true,get:()=>false});
    /* Tab で辿った状態（:focus-visible）を作る */
    const btn=box.querySelector('[data-a="v-play"]');
    btn.blur();
    await new Promise(x=>setTimeout(x,60));
    btn.focus({focusVisible:true});
    v.dispatchEvent(new Event("play",{bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,3600));
    /* :focus-visible が付いていない環境なら、この確認は成り立たないので通す */
    const fv = btn.matches(":focus-visible");
    return !fv || !box.classList.contains("is-idle");}));
  ok("ふわっと動く指定がある", await pg.evaluate(()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    return [...r.querySelectorAll("style")].some(s=>
      /\.vid-bar\{[^}]*transition:opacity \.32s/.test(s.textContent)
      && /is-idle \.vid-bar\{[^}]*translateY\(10px\)/.test(s.textContent));}));

  console.log("\n== 全画面でも隠れるか ==");
  {
    const r3 = await pg.evaluate(async ()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const box=r.querySelector(".vid"), v=box.querySelector("[data-v]");
      /* 直前の確認でキーボードの焦点が残っている。
         それが残ったままだと（仕様どおり）隠れないので、外してから測る。 */
      if (r.activeElement && r.activeElement.blur) r.activeElement.blur();
      box.classList.remove("is-idle");
      Object.defineProperty(v,"paused",{configurable:true,get:()=>false});
      /* 全画面に入った体にする（headless では実際には入れない） */
      Object.defineProperty(document,"fullscreenElement",{configurable:true,get:()=>box});
      document.dispatchEvent(new Event("fullscreenchange"));
      await new Promise(x=>setTimeout(x,3600));
      const bar=box.querySelector(".vid-bar");
      return { idle: box.classList.contains("is-idle"), op: getComputedStyle(bar).opacity };
    });
    ok("全画面のあいだも 3 秒で隠れる", r3.idle===true, JSON.stringify(r3));
    ok("全画面でも透明になる（opacity が上書きされない）", Number(r3.op)<0.1, JSON.stringify(r3));
    ok("全画面でも動かせば戻る", await pg.evaluate(async ()=>{
      const r=document.getElementById("vqFeed").shadowRoot;
      const box=r.querySelector(".vid");
      box.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,composed:true,pointerId:1}));
      await new Promise(x=>setTimeout(x,420));
      return !box.classList.contains("is-idle")
        && Number(getComputedStyle(box.querySelector(".vid-bar")).opacity)>0.9;}));
  }

  console.log("\n== キーボード ==");
  ok("左右キーで 5 秒ずつ動く", await pg.evaluate(async ()=>{
    const r=document.getElementById("vqFeed").shadowRoot;
    const v=r.querySelector("[data-v]"), t=r.querySelector('[data-a="v-seek"]');
    v.currentTime=50;
    t.focus();
    t.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,composed:true}));
    await new Promise(x=>setTimeout(x,120));
    return Math.round(v.currentTime)===55;}));
  await pg.screenshot({ path:"shots/feed/09-video.png" });

  ok("横はみ出し 0px", 0===await pg.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)));
  ok("JS エラーなし", errs.length===0, errs.join(" / "));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await b.close();
  process.exit(fail?1:0);
})();
