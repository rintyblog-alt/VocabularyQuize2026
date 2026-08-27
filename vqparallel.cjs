/* 並列にして本当に速くなるのかを実測する。

   「同時に 2 本流せば 2 倍速い」とは限らない。
   モデルは 1 台の GPU/メモリ帯域を分け合うので、
   1 本あたりが遅くなって差し引きゼロ、ということが普通にある。
   config の注意書きにも「エンジンが並列で回せる数より大きくすると共倒れ」とある。

   だから **入れる前に測る**。同じ依頼を
     ・1 本ずつ 2 回（直列）
     ・2 本まとめて 1 回（並列）
   で流し、合計の壁時計時間を比べる。

   実行: node vqparallel.cjs [繰り返し回数（既定 2）]
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const REPEAT = Number(process.argv[2] || 2);
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
    setV(document.getElementById("authLoginNickname"), "para");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

/* 同じ大きさの依頼を n 本、直列 or 並列で流す */
async function measure(pg, mode, doc) {
  return pg.evaluate(async ({ mode, doc }) => {
    const AI = VQ2.ai, MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun;
    const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: doc, pageCount: 1 }];
    const p = MC.plan({
      title: "並列の計測", subject: "歴史", grade: "H3",
      durationMinutes: 50, totalPoints: 60, sectionCount: 2, questionCount: 6,
      types: { multiple_choice_single: true, true_false: true, short_answer: true },
      difficulty: "mixed", allowExternalKnowledge: false, requireSources: true
    });
    const reqs = MC.requestsOf(p, { batchSize: 3 }).slice(0, 2);
    const query = "ドルヴァス朝 三部会 ザルカンド条約 羊毛 リューン 歴史";
    const one = (r) => AI.generateQuestions({
      prompt: MR.promptFor(r, { title: p.title, sourceOnly: true, requireSources: true, avoid: [] }),
      attachments: att, includedAttachmentIds: ["a1"], retrievalQuery: query,
      sourceOnly: true, requireEvidence: true, count: r.slots.length,
      skipDocumentAnalysis: true
    }).then((x) => ({ ok: true, n: (x.questions || []).length }))
      .catch((e) => ({ ok: false, why: String((e && e.userMessage) || (e && e.message)).slice(0, 60) }));

    const t0 = performance.now();
    let out;
    if (mode === "serial") {
      out = [];
      for (const r of reqs) out.push(await one(r));
    } else {
      out = await Promise.all(reqs.map(one));
    }
    return {
      ms: Math.round(performance.now() - t0),
      made: out.reduce((a, x) => a + (x.n || 0), 0),
      fails: out.filter((x) => !x.ok).map((x) => x.why)
    };
  }, { mode, doc });
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  const cap = await pg.evaluate(() => ({
    max: VQ2.ai.MAX_CONCURRENT, running: VQ2.ai.runningCount ? VQ2.ai.runningCount() : null
  }));
  console.log(`\n══ 並列にすると速くなるか（3 問 × 2 本）══`);
  console.log(`  クライアントの同時実行上限: ${cap.max}`);

  const rows = { serial: [], parallel: [] };
  for (let i = 0; i < REPEAT; i++) {
    for (const mode of ["serial", "parallel"]) {
      const r = await measure(pg, mode, DOC);
      rows[mode].push(r);
      console.log(`  ${i + 1} 回目 ${mode === "serial" ? "直列" : "並列"}: `
        + `${Math.round(r.ms / 1000)}秒 / ${r.made}問`
        + (r.fails.length ? ` / 失敗 ${r.fails.join(" | ")}` : ""));
    }
  }

  const avg = (a) => Math.round(a.reduce((x, y) => x + y.ms, 0) / a.length);
  const s = avg(rows.serial), p = avg(rows.parallel);
  const madeS = rows.serial.reduce((a, x) => a + x.made, 0);
  const madeP = rows.parallel.reduce((a, x) => a + x.made, 0);
  console.log(`\n══ まとめ ══`);
  console.log(`  直列: 平均 ${Math.round(s / 1000)}秒（合計 ${madeS} 問）`);
  console.log(`  並列: 平均 ${Math.round(p / 1000)}秒（合計 ${madeP} 問）`);
  const gain = s > 0 ? (s / p) : 0;
  console.log(`  速さの比: ${gain.toFixed(2)} 倍`);
  console.log(gain >= 1.25
    ? "  → 並列にする価値がある（1.25 倍以上）"
    : "  → **並列にしても速くならない。** 入れないこと（共倒れになるだけ）");

  fs.mkdirSync(path.join(__dirname, "artifacts", "parallel"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "artifacts", "parallel", "result.json"),
    JSON.stringify({ rows, serialMs: s, parallelMs: p, gain }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
