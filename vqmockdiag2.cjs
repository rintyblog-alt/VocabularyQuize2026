/* 「資料から出題できる内容が足りない」と言われる理由を切り分ける。

   試験コンパイラ（V2）の依頼は AI.generateQuestions を通る。
   この口は **資料の検索語（retrievalQuery）を渡していない**。
   一方、いま画面が使っている AI.generateMock は渡している。

   同じ資料・同じ問題数で 3 通り投げて、どれが通るかを見る。
     A) generateQuestions（いまの試験コンパイラの通り道）
     B) generateMock ＋ 検索語なし
     C) generateMock ＋ 検索語あり（いまの画面と同じ）

   実行: node vqmockdiag2.cjs
*/
const { chromium } = require("playwright");

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
    setV(document.getElementById("authLoginNickname"), "diag2");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  const CASES = ["A", "B", "C"];
  console.log("\n══ 資料が足りないと言われるのはどれか ══");
  for (const c of CASES) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ text, c }) => {
      const MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun, AI = VQ2.ai;
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: text, pageCount: 1 }];
      const p = MC.plan({
        title: "内訳しらべ", subject: "歴史", grade: "H3",
        durationMinutes: 50, totalPoints: 30, sectionCount: 1, questionCount: 3,
        types: { multiple_choice_single: true, true_false: true, short_answer: true },
        difficulty: "mixed", allowExternalKnowledge: false, requireSources: true
      });
      const req = MC.requestsOf(p, { batchSize: 3 })[0];
      const prompt = MR.promptFor(req, {
        title: p.title, subject: p.subject, grade: p.grade,
        sourceOnly: true, requireSources: true, avoid: []
      });
      const query = "ドルヴァス朝 三部会 ザルカンド条約 羊毛 リューン 歴史";
      try {
        let res;
        if (c === "A") {
          res = await AI.generateQuestions({ prompt, attachments: att, sourceOnly: true, count: 3 });
          return { ok: true, n: (res.questions || []).length };
        }
        const common = {
          instruction: prompt, attachments: att, sourceOnly: true, requireEvidence: true,
          count: 3, sectionCount: 1, includedAttachmentIds: ["a1"]
        };
        if (c === "C") common.retrievalQuery = query;
        res = await AI.generateMock(common);
        const d = res.structured && res.structured.sections ? res.structured
          : (res.structured && res.structured.data) || null;
        const n = ((d && d.sections) || []).reduce((a, s) => a + (s.questions || []).length, 0);
        return { ok: true, n };
      } catch (e) {
        return {
          ok: false, message: String(e && e.message).slice(0, 80),
          user: String((e && e.userMessage) || "").slice(0, 80),
          diag: e && e.sourceDiagnosis ? {
            code: e.sourceDiagnosis.code,
            reasons: e.sourceDiagnosis.reasons,
            evidenceCount: e.sourceDiagnosis.evidenceCount,
            contentfulCount: e.sourceDiagnosis.contentfulCount,
            contentCharacters: e.sourceDiagnosis.contentCharacters
          } : null
        };
      }
    }, { text: SAMPLE, c });
    const label = { A: "generateQuestions（いまのコンパイラ）", B: "generateMock ＋ 検索語なし",
                    C: "generateMock ＋ 検索語あり" }[c];
    console.log(`\n  ${c}) ${label}  ${Math.round((Date.now() - t0) / 1000)}秒`);
    if (r.ok) console.log(`     通った：${r.n} 問`);
    else {
      console.log(`     止まった：${r.message} / ${r.user}`);
      if (r.diag) console.log(`     内訳：${JSON.stringify(r.diag)}`);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
