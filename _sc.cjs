/* ★ 「はみ出して いないか」では なく **本当に 動くか**を 測る */
const {chromium}=require("playwright");
const S=process.env.S, BASE="https://www.vocabuquiz.app";
const 待=ms=>new Promise(r=>setTimeout(r,ms));
const 影='document.querySelector("#vq2-qtype-picker").shadowRoot';
(async()=>{
 const b=await chromium.launch(); let ng=0;
 for (const [名,w,touch] of [["PC",{width:1280,height:860},false],["スマホ",{width:390,height:844},true]]) {
  const p=await b.newPage({viewport:w,deviceScaleFactor:2,isMobile:touch,hasTouch:touch});
  const err=[];p.on("pageerror",e=>err.push(String(e).slice(0,120)));
  await p.addInitScript(()=>{try{localStorage.setItem("vq.install.hide.v1","1");}catch(e){}});
  await p.goto(BASE+"/",{waitUntil:"domcontentloaded",timeout:120000});
  await p.waitForFunction(()=>!!(window.VQ2&&window.VQ2.qtypePicker),{timeout:120000});
  try{await p.click("text=スキップ",{timeout:2000});}catch(e){}
  await p.evaluate(()=>{window.VQ2.qtypePicker.open({});});
  await 待(2200);
  const 前=await p.evaluate(()=>{const r=document.querySelector("#vq2-qtype-picker").shadowRoot;
    const m=r.querySelector(".vq2-qt-main");
    return {top:m.scrollTop, sh:m.scrollHeight, ch:m.clientHeight};});
  /* 実際に 動かす（指と ホイールの 両方） */
  await p.evaluate(()=>{const r=document.querySelector("#vq2-qtype-picker").shadowRoot;
    r.querySelector(".vq2-qt-main").scrollTop=900;});
  await 待(400);
  const 後=await p.evaluate(()=>{const r=document.querySelector("#vq2-qtype-picker").shadowRoot;
    const m=r.querySelector(".vq2-qt-main");
    return {top:m.scrollTop};});
  /* ホイールでも 動くか */
  const box=await p.evaluate(()=>{const r=document.querySelector("#vq2-qtype-picker").shadowRoot;
    const b2=r.querySelector(".vq2-qt-main").getBoundingClientRect();
    return {x:b2.x+b2.width/2,y:b2.y+b2.height/2};});
  await p.mouse.move(box.x,box.y); await p.mouse.wheel(0,600); await 待(500);
  const ホ=await p.evaluate(()=>document.querySelector("#vq2-qtype-picker").shadowRoot.querySelector(".vq2-qt-main").scrollTop);
  const 巻ける = 前.sh > 前.ch + 10;
  const 動く = 後.top > 50;
  const ホ動く = ホ > 50;
  console.log(`${名}: 中身 ${前.sh}px / 枠 ${前.ch}px  ${巻ける?"✓巻ける":"★枠が伸びきっている"}  `
    + `直に ${後.top}px ${動く?"✓":"★動かない"}  ホイール ${ホ}px ${ホ動く?"✓":"★動かない"}`);
  if(!巻ける||!動く||!ホ動く){ng++;}
  await p.screenshot({path:S+"/sc-"+(touch?"m":"pc")+".png"});
  if(err.length)console.log("   例外:",err);
  await p.close();
 }
 console.log(ng?`\n★ ${ng} 件 だめ`:`\n両方 スクロールできます`);
 await b.close();process.exit(ng?1:0);
})();
