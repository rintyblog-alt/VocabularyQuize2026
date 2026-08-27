/* 1 回の依頼で何問まとめるのが速いかを実測する。

   30 問を 3 問ずつ頼むと 10 往復。1 往復ごとに
     ・指示文の読み込み（プロンプト処理）
     ・資料の検索
     ・後始末
   がかかる。まとめる数を増やせば往復は減るが、1 回の出力が長くなり
   途中で切れる危険が増す（V1 はそれで全部失っていた）。

   **速さと取りこぼしの両方**を見て、どこが底かを決める。
   同じ問題数（12 問）を、まとめる数だけ変えて作る。

   実行: node vqbatch.cjs [3,5,8]
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SIZES = (process.argv[2] || "3,5,8").split(",").map(Number).filter(Boolean);
const TOTAL = 12;
const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const DOC = fs.readFileSync(path.join(__dirname, "tmp_exam_build", "verna-large.txt"), "utf8");

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
    setV(document.getElementById("authLoginNickname"), "batch");
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

  console.log(`\n══ 1 回にまとめる数（${TOTAL} 問を作る）══`);
  const rows = [];
  for (const size of SIZES) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ doc, size, total }) => {
      const MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun, AI = VQ2.ai;
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: doc, pageCount: 1 }];
      const p = MC.plan({
        title: "まとめる数の計測", subject: "歴史", grade: "H3",
        durationMinutes: 50, totalPoints: total * 5, sectionCount: 2, questionCount: total,
        types: { multiple_choice_single: true, true_false: true, short_answer: true },
        difficulty: "mixed", allowExternalKnowledge: false, requireSources: true
      });
      const query = "ドルヴァス朝 三部会 ザルカンド条約 羊毛 リューン 歴史";
      let calls = 0, first = true, tokens = 0;
      const res = await MR.run({
        plan: p, ownerId: "batchtest", batchSize: size, maxRounds: 2,
        generate: (req, cx) => {
          calls++;
          return AI.generateQuestions({
            prompt: cx.prompt, attachments: att, includedAttachmentIds: ["a1"],
            retrievalQuery: query, sourceOnly: true, requireEvidence: true,
            count: req.slots.length, skipDocumentAnalysis: !first
          }).then((x) => {
            first = false;
            if (x.usage && x.usage.completionTokens) tokens += x.usage.completionTokens;
            return x;
          });
        }
      });
      return {
        made: res.accepted, planned: res.planned, calls: calls, tokens: tokens,
        rejected: res.rejected.length, rounds: res.rounds,
        errors: (res.errors || []).map((e) => e.code).slice(0, 3)
      };
    }, { doc: DOC, size, total: TOTAL });
    const ms = Date.now() - t0;
    rows.push(Object.assign({ size, ms }, r));
    console.log(`\n  まとめ ${size} 問/回`);
    console.log(`    ${Math.round(ms / 1000)}秒 / できた ${r.made} 問（依頼 ${r.calls} 回・やり直し ${r.rounds} 巡）`);
    console.log(`    1 問あたり ${r.made ? Math.round(ms / 1000 / r.made) : "—"}秒`
      + ` / 受理できず ${r.rejected} 件`
      + (r.tokens ? ` / 出力 ${r.tokens} token` : ""));
    if (r.errors.length) console.log(`    依頼が落ちた理由: ${r.errors.join(", ")}`);
  }

  console.log(`\n══ まとめ ══`);
  const best = rows.filter((r) => r.made > 0).sort((a, b) => (a.ms / a.made) - (b.ms / b.made))[0];
  rows.forEach((r) => {
    console.log(`  ${r.size} 問/回: ${Math.round(r.ms / 1000)}秒 / ${r.made}問`
      + ` → 1問 ${r.made ? Math.round(r.ms / 1000 / r.made) : "—"}秒`
      + (best && best.size === r.size ? "  ← いちばん速い" : ""));
  });
  console.log("\n  ※ 速さだけで決めない。取りこぼし（受理できず・依頼が落ちた）が増えていないかも見ること。");

  fs.mkdirSync(path.join(__dirname, "artifacts", "batch"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "artifacts", "batch", "result.json"), JSON.stringify(rows, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
