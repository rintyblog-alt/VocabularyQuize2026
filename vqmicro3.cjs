const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const SAMPLE = [
  "【ヴェルナ地方史 要点】",
  "812年 ドルヴァス朝が成立。初代王アスカル1世が都をリューンに置いた。",
  "839年 ザルカンド条約により、隣国トレーシャとの国境が現在の位置に定まった。",
  "840年 王都リューンで大市が開かれ、香辛料と羊毛の交易が本格化した。",
  "873年 アスカル3世が「三部会」を招集し、貴族・聖職者・都市代表が政策を協議した。",
  "901年 ドルヴァス朝は分裂し、東西二つの王国に分かれた。",
  "経済: 羊毛は西部の高地で生産され、リューンを経由して輸出された。",
  "文化: 三部会の記録は羊皮紙に残され、のちの法典編纂の基礎となった。",
  "制度: 三部会は年に一度開かれ、王の課税には同意が必要とされた。",
  "外交: トレーシャとは通商条約を結び、関税を相互に引き下げた。"
].join("\n");
/* 失敗した大問3と同じ条件: title/theme あり・既出リストあり・3問 */
const TITLE = "ヴェルナ地方の社会構造";
const THEME = "三部会の構成と役割 / 身分ごとの権限";
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext()).newPage();
  const errs = [];
  pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => { const s=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    s(document.getElementById("authLoginGrade"),"H3");s(document.getElementById("authLoginNickname"),"tester");
    s(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click(); });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);

  const rows = [];
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ SAMPLE, TITLE, THEME }) => {
      const AI = window.VQ2.ai;
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: SAMPLE, pageCount: 1 }];
      const instruction = [
        "添付した資料だけを根拠に、高校生向けの試験を作ってください。",
        "",
        "【この回で作るもの】",
        "大問3「" + TITLE + "」 だけを作ってください。",
        "この大問で扱うこと: " + THEME,
        "この大問では「" + THEME + "」を中心に、添付した資料に基づく問題を作ってください。",
        "設問は **ちょうど 3 問**です。2 問以下も 4 問以上も禁止です。",
        "この大問の配点は 33 点です。",
        "**この大問だけ**を sections に 1 つ返してください。他の大問は作らないでください。",
        "JSON だけを返してください。前後に説明・見出し・コードフェンスを付けないでください。",
        "",
        "すでに次の設問を作ってあります。**同じ内容の設問は作らないでください**。",
        "1. 812年に成立した王朝の名を答えよ",
        "2. ザルカンド条約が結ばれた年は"
      ].join("\n");
      let acts = [], warns = [];
      const res = await AI.generateMock({
        instruction, attachments: att, sourceOnly: true, count: 3, sectionCount: 1,
        skipDocumentAnalysis: true,
        onActivity: (items) => { acts = (items||[]).map(a=>({t:a.type,s:a.status,l:String(a.label||"").slice(0,140),d:String(a.detail||"").slice(0,160)})); },
        onWarning: (m) => { warns.push(String(m).slice(0,180)); }
      });
      const d = res.structured && res.structured.sections ? res.structured
              : (res.structured && res.structured.data ? res.structured.data : null);
      const secs = (d && d.sections) || [];
      const qs = secs.reduce((a,s)=>a.concat(s.questions||[]),[]);
      const keys = {}; ((d&&d.answerKey)||[]).forEach(k=>{keys[String(k.id)]=k;});
      return {
        instructionChars: instruction.length,
        sections: secs.length, questions: qs.length,
        withPrompt: qs.filter(q=>String(q.question||"").trim()).length,
        withChoices: qs.filter(q=>(q.choices||[]).length>=2).length,
        withAnswer: qs.filter(q=>String((keys[String(q.id)]||{}).answer||"").trim()).length,
        withExplanation: qs.filter(q=>String((keys[String(q.id)]||{}).explanation||"").trim()).length,
        titles: secs.map(s=>String(s.name||"")),
        acts: acts.filter(a=>/revise|evidence|schema|mock/.test(a.t)),
        warns: warns,
        requiresReview: qs.filter(q=>q.requiresReview).length,
        sample: qs[0] ? String(qs[0].question||"").slice(0,60) : ""
      };
    }, { SAMPLE, TITLE, THEME });
    rows.push(Object.assign({ i, ms: Date.now()-t0 }, r));
    console.log(`  ${i}/3  ${Math.round((Date.now()-t0)/1000)}秒  大問${r.sections} 設問${r.questions}  問題文${r.withPrompt} 選択肢${r.withChoices} 正解${r.withAnswer} 解説${r.withExplanation}`);
    r.acts.forEach(a=>console.log(`        [${a.t} ${a.s}] ${a.l}${a.d?" | "+a.d:""}`));
    (r.warns||[]).forEach(w=>console.log(`        warn: ${w}`));
  }
  console.log("\nConsole error:", errs.length);
  fs.writeFileSync(path.join(__dirname,"artifacts","micro3.json"), JSON.stringify(rows,null,1));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
