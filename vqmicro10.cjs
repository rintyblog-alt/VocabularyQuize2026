/* Phase 10 マイクロベンチ: 1大問3問を 選択式 / 記述式 / 混合 で各1回。 */
const { chromium } = require("playwright");
const fs=require("fs"),path=require("path");
const HIDE=`#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const SAMPLE=["【ヴェルナ地方史 要点】","812年 ドルヴァス朝が成立。初代王アスカル1世が都をリューンに置いた。",
"839年 ザルカンド条約により、隣国トレーシャとの国境が現在の位置に定まった。",
"873年 アスカル3世が「三部会」を招集し、貴族・聖職者・都市代表が政策を協議した。",
"901年 ドルヴァス朝は分裂し、東西二つの王国に分かれた。",
"経済: 羊毛は西部の高地で生産され、リューンを経由して輸出された。",
"制度: 三部会は年に一度開かれ、王の課税には同意が必要とされた。"].join("\n");
const CASES=[
 {name:"A 選択式3問", form:"4択の選択問題だけを作ってください。"},
 {name:"B 記述式3問", form:"記述問題だけを作ってください。選択肢は付けないでください。"},
 {name:"C 混合3問",  form:"選択問題2問と記述問題1問を作ってください。"}];
(async()=>{
 const b=await chromium.launch();const pg=await(await b.newContext()).newPage();
 const errs=[];pg.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,90))});
 await pg.goto("http://127.0.0.1:8791/?vqdev=1",{waitUntil:"domcontentloaded"});
 await pg.addStyleTag({content:HIDE});
 await pg.waitForFunction(()=>document.getElementById("authLoginSubmitBtn"),{timeout:20000});
 await pg.evaluate(()=>{const s=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
  Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
  el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
  s(document.getElementById("authLoginGrade"),"H3");s(document.getElementById("authLoginNickname"),"tester");
  s(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click();});
 await pg.waitForFunction(()=>document.body.getAttribute("data-ui-v2")==="1",{timeout:30000});
 await pg.waitForTimeout(1500);
 const rows=[];
 for(const c of CASES){
  const t0=Date.now();
  const r=await pg.evaluate(async({SAMPLE,form})=>{
   const AI=window.VQ2.ai;
   const att=[{id:"a1",name:"資料.txt",kind:"text",extractedText:SAMPLE,pageCount:1}];
   const instruction=["添付した資料だけを根拠に、高校生向けの試験を作ってください。","",
    "【この回で作るもの】","大問1「ヴェルナ地方史」 だけを作ってください。",form,
    "設問は **ちょうど 3 問**です。2 問以下も 4 問以上も禁止です。","この大問の配点は 30 点です。",
    "**この大問だけ**を sections に 1 つ返してください。","JSON だけを返してください。"].join("\n");
   let acts=[];
   const res=await AI.generateMock({instruction,attachments:att,sourceOnly:true,count:3,sectionCount:1,
    skipDocumentAnalysis:true,onActivity:(items)=>{acts=(items||[]).map(a=>({t:a.type,s:a.status,l:String(a.label||"").slice(0,90)}))}});
   const d=res.structured&&res.structured.sections?res.structured:(res.structured&&res.structured.data?res.structured.data:null);
   const qs=((d&&d.sections)||[]).reduce((a,s)=>a.concat(s.questions||[]),[]);
   const keys={};((d&&d.answerKey)||[]).forEach(k=>{keys[String(k.id)]=k});
   const need=q=>q.type==="multiple_choice"||q.type==="true_false";
   return {questions:qs.length, types:qs.map(q=>q.type),
    choiceCounts:qs.map(q=>(q.choices||[]).length),
    missingChoices:qs.filter(q=>need(q)&&(q.choices||[]).length<2).length,
    writtenWithChoices:qs.filter(q=>!need(q)&&(q.choices||[]).length>0).length,
    orphan:((d&&d.answerKey)||[]).filter(a=>!qs.some(q=>String(q.id)===String(a.id))).length,
    missingAnswer:qs.filter(q=>!String((keys[String(q.id)]||{}).answer||"").trim()).length,
    withPrompt:qs.filter(q=>String(q.question||"").trim()).length,
    withExpl:qs.filter(q=>String((keys[String(q.id)]||{}).explanation||"").trim()).length,
    acts:acts.filter(a=>/revise|schema|mock|bind/.test(a.t))};
  },{SAMPLE,form:c.form});
  rows.push(Object.assign({name:c.name,ms:Date.now()-t0},r));
  console.log(`  ${c.name}: ${Math.round((Date.now()-t0)/1000)}秒 設問${r.questions} 形式[${r.types.join(",")}] 選択肢[${r.choiceCounts.join(",")}]`);
  console.log(`     missing_choices=${r.missingChoices} 記述に選択肢=${r.writtenWithChoices} orphan=${r.orphan} 解答欠け=${r.missingAnswer} 問題文${r.withPrompt} 解説${r.withExpl}`);
  r.acts.forEach(a=>console.log(`     [${a.t} ${a.s}] ${a.l}`));
 }
 console.log("\nConsole error:",errs.length);
 fs.writeFileSync(path.join(__dirname,"artifacts","micro10.json"),JSON.stringify(rows,null,1));
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
