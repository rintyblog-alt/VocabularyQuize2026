/* 試験コンパイラが「頼んだ数」に届かない理由を、1 件ずつ突き止める。

   vqmockv2.cjs は「30 問頼んで 6 問」までしか教えてくれない。
   ここでは 1 回の依頼だけを投げて、
     ・そもそも返ってきたか（失敗なら理由）
     ・何問返ってきたか
     ・門（gate）で落ちたものは、どの規則で落ちたか
   を出す。直す場所を決めるための計測であって、合否は付けない。

   実行: node vqmockdiag.cjs [依頼の回数（既定 3）]
*/
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROUNDS = Number(process.argv[2] || 3);
const URL = "http://127.0.0.1:8791/?vqdev=1";
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

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "diag");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  console.log(`\n══ 1 依頼ずつの内訳（${ROUNDS} 回）══`);
  const out = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ text, i }) => {
      const MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun, AI = VQ2.ai;
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: text, pageCount: 1 }];
      const p = MC.plan({
        title: "内訳しらべ", subject: "歴史", grade: "H3",
        durationMinutes: 50, totalPoints: 30, sectionCount: 1, questionCount: 3,
        types: { multiple_choice_single: true, true_false: true, short_answer: true },
        difficulty: "mixed", allowExternalKnowledge: false, requireSources: true
      });
      const reqs = MC.requestsOf(p, { batchSize: 3 });
      const req = reqs[0];
      const ctx2 = {
        title: p.title, subject: p.subject, grade: p.grade,
        sourceOnly: p.sourceMode === "source-only", requireSources: p.requireSources, avoid: []
      };
      const prompt = MR.promptFor ? MR.promptFor(req, ctx2) : null;
      let res = null, err = null;
      try {
        res = await AI.generateQuestions({
          prompt: prompt || "資料から 3 問作ってください。",
          attachments: att, sourceOnly: true, count: req.slots.length,
          skipDocumentAnalysis: i > 0
        });
      } catch (e) { err = { message: String(e && e.message), user: String((e && e.userMessage) || "") }; }

      if (err) return { err, slots: req.slots.length };
      const qs = (res && Array.isArray(res.questions)) ? res.questions
        : (res && res.structured && Array.isArray(res.structured.questions)) ? res.structured.questions : [];
      /* 門で落ちた理由を数える */
      const why = {};
      const detail = [];
      req.slots.forEach((s, k) => {
        const q = qs[k];
        if (!q) { why.missing = (why.missing || 0) + 1; return; }
        const g = MC.gate(s, q, { requireSources: p.requireSources });
        if (g.ok) { why.ok = (why.ok || 0) + 1; return; }
        g.reasons.forEach((rr) => { why[rr.code] = (why[rr.code] || 0) + 1; });
        detail.push({
          slotType: s.type,
          gotType: String(q.type || ""),
          codes: g.reasons.map((rr) => rr.code),
          hasChoices: (q.choices || []).length,
          answer: String(q.answer || q.correctAnswer || "").slice(0, 30),
          srcs: (q.sourceReferences || []).length,
          srcFileNames: (q.sourceReferences || []).map((x) => String(x && x.fileName || "")).slice(0, 2)
        });
      });
      return {
        slots: req.slots.length, got: qs.length, why, detail,
        keys: res ? Object.keys(res).slice(0, 12) : [],
        promptHead: String(prompt || "").slice(0, 160)
      };
    }, { text: SAMPLE, i });
    const ms = Date.now() - t0;
    out.push(Object.assign({ ms }, r));
    console.log(`\n  ${i + 1}/${ROUNDS}  ${Math.round(ms / 1000)}秒`);
    if (r.err) { console.log(`    失敗: ${r.err.message} ${r.err.user}`); continue; }
    console.log(`    枠 ${r.slots} 問 → 返ってきた ${r.got} 問`);
    console.log(`    内訳: ${JSON.stringify(r.why)}`);
    (r.detail || []).forEach((d) => {
      console.log(`      枠=${d.slotType} 返=${d.gotType} 落ちた理由=${d.codes.join(",")}`
        + ` 選択肢${d.hasChoices} 正解「${d.answer}」 出典${d.srcs}${d.srcFileNames.length ? " " + JSON.stringify(d.srcFileNames) : ""}`);
    });
    if (i === 0) console.log(`    依頼文の冒頭: ${JSON.stringify(r.promptHead)}`);
  }

  const dir = path.join(__dirname, "artifacts", "mock-diag");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "diag.json"), JSON.stringify(out, null, 2));
  console.log(`\n記録: ${path.join(dir, "diag.json")}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
