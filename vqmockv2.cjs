/* 試験コンパイラ（V2）を実 AI で通し、V1 で残っていた不具合が本当に直ったかを見る。

   V1 の実測（2026-07-27 耐久試験）と同じ条件で比べる:
     ・「定期 100点/30問」→ V1 は **24 問**しか作らなかった（黙って減る）
     ・満点が一致しない件があった
     ・20 問以上で 300〜590 秒

   実行:
     node vqmockv2.cjs            … V2 で 3 条件
     node vqmockv2.cjs v1         … 同じ条件を V1 で（比較用）
*/
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MODE = process.argv[2] === "v1" ? "v1" : "v2";
const OUT = path.join(__dirname, "artifacts", "mock-v2", MODE + ".json");
const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

const SAMPLE = path.join(os.tmpdir(), "vqmockv2-source.txt");
fs.writeFileSync(SAMPLE, [
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
].join("\n"), "utf8");

/* 実際の教材に近い分量の資料（約 1,500 字）。
   上の要点（約 330 字）は **わざと小さいまま残す**。
   資料が足りないときに、黙って減らさず正直に伝えられるかを見るため。 */
const BIG = path.join(__dirname, "tmp_exam_build", "verna-large.txt");

/* V1 で問題が出た条件をそのまま使う。 */
const CASES = [
  { name: "定期 100点/30問（V1 は 24 問しか作らなかった）", totalPoints: 100, sectionCount: 4, questionCount: 30, doc: "big" },
  { name: "定期 100点/20問", totalPoints: 100, sectionCount: 4, questionCount: 20, doc: "big" },
  { name: "小テスト 50点/10問", totalPoints: 50, sectionCount: 2, questionCount: 10, doc: "big" },
  /* 資料が足りない条件。**ここは「作れない」が正解**。
     黙って一般知識で埋めたり、頼んだ数を減らして「できました」と言ってはいけない。 */
  { name: "資料が足りない（330字で30問）", totalPoints: 100, sectionCount: 4, questionCount: 30,
    doc: "small", expectShortfall: true }
];

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1800);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const consoleErrors = [];
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
  await login(pg);

  const has = await pg.evaluate(() => !!(window.VQ2 && VQ2.mockCompiler && VQ2.mockCompilerRun));
  if (!has) { console.error("× VQ2.mockCompiler / mockCompilerRun がありません。node client/v2/build-v2.mjs を実行してください。"); process.exit(1); }

  const smallText = fs.readFileSync(SAMPLE, "utf8");
  const bigText = fs.readFileSync(BIG, "utf8");
  const runs = [];
  console.log(`\n══ 試験コンパイラ ${MODE.toUpperCase()} — ${CASES.length} 条件 ══`);

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const t0 = Date.now();
    const text = c.doc === "small" ? smallText : bigText;
    const r = await pg.evaluate(async ({ c, text, MODE }) => {
      const MC = window.VQ2.mockCompiler, MR = window.VQ2.mockCompilerRun;
      const AI = window.VQ2.ai, MB = window.VQ2.mockBuilder, SA = window.VQ2.scoreAllocator, V = window.VQ2.validate;
      const types = { multiple_choice_single: true, true_false: true, short_answer: true, long_answer: true };
      /* kind は schema の enum（pdf/image/docx/text/code/zip/unknown）から選ぶ。
         本文は extractedText。ここを間違えると Bridge が BAD_REQUEST を返す。 */
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: text, pageCount: 1 }];

      if (MODE === "v2") {
        const p = MC.plan({
          title: "比較テスト", subject: "歴史", grade: "H3",
          durationMinutes: 50, totalPoints: c.totalPoints,
          sectionCount: c.sectionCount, questionCount: c.questionCount,
          types, difficulty: "mixed", allowExternalKnowledge: false, requireSources: true
        });
        let first = false;
        const res = await MR.run({
          plan: p, ownerId: "v2test",
          generate: (req, cx) => AI.generateQuestions({
            prompt: cx.prompt, attachments: att, sourceOnly: true,
            count: req.slots.length, skipDocumentAnalysis: first
          }).then((x) => { first = true; return x; })
        });
        const qs = res.spec.sections.reduce((a, s) => a.concat(s.questions), []);
        return {
          planned: p.totalQuestions, made: qs.length,
          points: qs.reduce((a, q) => a + (Number(q.points) || 0), 0),
          want: c.totalPoints,
          complete: res.complete, rounds: res.rounds,
          over: res.overGenerated, rejected: res.rejected.length,
          missing: res.missing.length,
          withAnswer: qs.filter((q) => (q.choices || []).some((x) => x.isCorrect) || String(q.correctAnswer || "").trim()).length,
          withExplanation: qs.filter((q) => String(q.explanation || "").trim()).length,
          withSource: qs.filter((q) => (q.sourceReferences || []).length).length,
          saveOk: V.canSave(V.validateMockSpecForSave(res.spec)),
          /* 保存できないなら **理由まで**持ち帰る。可否だけでは直せない。 */
          saveErrors: V.validateMockSpecForSave(res.spec)
            .filter((x) => x.severity === "error")
            .slice(0, 5).map((x) => x.code + "@" + x.path),
          metrics: res.metrics,
          /* 資料が足りずに断られたなら、その内訳。null なら資料量は原因ではない。 */
          evidence: res.evidence,
          errorCodes: (res.errors || []).map((x) => x.code).slice(0, 4),
          /* 門で落ちた理由の内訳。何を直せば埋まるのかは、ここでしか分からない。 */
          rejectReasons: (res.rejected || []).reduce((a, x) => {
            (x.reasons || []).forEach((rr) => { a[rr.code] = (a[rr.code] || 0) + 1; });
            return a;
          }, {}),
          planIssues: (p.issues || []).map((x) => x.type)
        };
      }

      /* V1: 大問ごとに順番に頼む（既存の runGenerate と同じ形） */
      const per = Math.min(6, Math.max(1, Math.round(c.questionCount / c.sectionCount)));
      const sections = [], keys = [];
      let over = 0;
      for (let k = 1; k <= c.sectionCount; k++) {
        try {
          const res = await AI.generateMock({
            instruction: "添付した資料だけを根拠に高校生向けの試験を作ってください。"
              + "問題文／正解／解説／選択肢2つ以上／根拠にした資料の箇所を必ず書いてください。"
              + "【この回で作るもの】大問" + k + " だけを " + per + " 問、"
              + Math.round(c.totalPoints / c.sectionCount) + " 点で作ってください。",
            attachments: att, sourceOnly: true, count: per, skipDocumentAnalysis: k > 1
          });
          const d = res.structured && res.structured.sections ? res.structured
                  : (res.structured && res.structured.data ? res.structured.data : null);
          const secs = (d && d.sections) || [];
          let qs = secs.reduce((a, x) => a.concat(x.questions || []), []);
          if (qs.length > per) { over += qs.length - per; qs = qs.slice(0, per); }
          if (qs.length) {
            sections.push({ name: "大問" + k, questions: qs, score: Math.round(c.totalPoints / c.sectionCount) });
            const keep = {}; qs.forEach((q) => { keep[String(q.id)] = true; });
            keys.push(...((d.answerKey || []).filter((x) => keep[String(x.id)])));
          }
        } catch (e) { /* 1 大問失敗しても続ける（V1 と同じ） */ }
      }
      const spec0 = MB.fromDraft({ sections, answerKey: keys }, {
        title: "比較テスト", subject: "歴史", grade: "H3",
        durationMinutes: 50, totalPoints: c.totalPoints, sourceMode: "source-only", ownerId: "v1test"
      });
      const rep = MB.repairSpec(spec0, { requireSources: true });
      const fin = MB.finalize(rep.spec);
      const qs = fin.spec.sections.reduce((a, s) => a.concat(s.questions), []);
      return {
        planned: c.questionCount, made: qs.length,
        points: qs.reduce((a, q) => a + (Number(q.points) || 0), 0),
        want: c.totalPoints, complete: fin.ok, rounds: 1, over,
        rejected: 0, missing: Math.max(0, c.questionCount - qs.length),
        withAnswer: qs.filter((q) => (q.choices || []).some((x) => x.isCorrect) || String(q.correctAnswer || "").trim()).length,
        withExplanation: qs.filter((q) => String(q.explanation || "").trim()).length,
        withSource: qs.filter((q) => (q.sourceReferences || []).length).length,
        saveOk: V.canSave(V.validateMockSpecForSave(fin.spec)),
        saveErrors: V.validateMockSpecForSave(fin.spec)
          .filter((x) => x.severity === "error").slice(0, 5).map((x) => x.code + "@" + x.path),
        metrics: null, evidence: null, errorCodes: [], rejectReasons: {}, planIssues: []
      };
    }, { c, text, MODE });

    const ms = Date.now() - t0;
    runs.push(Object.assign({ name: c.name, ms }, r));
    console.log(`  ${i + 1}/${CASES.length} ${c.name}`);
    console.log(`      ${Math.round(ms / 1000)}秒 / 頼んだ ${r.planned} 問 → できた ${r.made} 問`
      + ` / ${r.points}点（指定 ${r.want}）`
      + ` / ${r.complete ? "完成" : "未完成"} / 保存${r.saveOk ? "OK" : "NG"}`);
    if (r.over) console.log(`      作りすぎ ${r.over} 問（使わなかった）`);
    if (r.rejected) console.log(`      受理できず ${r.rejected} 件 / やり直し ${r.rounds} 巡`
      + (r.rejectReasons && Object.keys(r.rejectReasons).length
          ? ` — 内訳 ${JSON.stringify(r.rejectReasons)}` : ""));
    if (r.planIssues.length) console.log(`      枠の指摘: ${r.planIssues.join(", ")}`);
    if (r.evidence) console.log(`      資料の量: ${r.evidence.contentCharacters}字 → 作れるのは目安 ${r.evidence.maxQuestions}問`);
    if (r.errorCodes && r.errorCodes.length) console.log(`      依頼が落ちた理由: ${r.errorCodes.join(", ")}`);
    if (!r.saveOk && r.saveErrors && r.saveErrors.length)
      console.log(`      保存できない理由: ${r.saveErrors.join(", ")}`);
  }

  /* 資料が足りない条件は「頼んだ数どおり」を求めない。求めるのは
     ①黙って埋めていないこと ②理由を持ち帰っていること ③できたぶんは残ること。 */
  const normal = runs.filter((r, i) => !CASES[i].expectShortfall);
  const shortfall = runs.filter((r, i) => CASES[i].expectShortfall);
  const okCount = normal.filter((r) => r.made === r.planned).length;
  const ptCount = runs.filter((r) => r.points === r.want).length;
  const saveCount = runs.filter((r) => r.saveOk).length;
  const times = runs.map((r) => r.ms).sort((a, b) => a - b);

  console.log(`\n══ まとめ（${MODE.toUpperCase()}）══`);
  console.log(`  頼んだ数どおり : ${okCount} / ${normal.length} 件（資料が足りる条件）`);
  console.log(`  満点が一致     : ${ptCount} / ${runs.length} 件`);
  shortfall.forEach((r) => {
    console.log(`  資料が足りない条件 : ${r.made} / ${r.planned} 問（完成と言わない: ${!r.complete ? "OK" : "NG"}`
      + ` / 理由あり: ${(r.evidence || (r.errorCodes || []).length) ? "OK" : "NG"}）`);
  });
  console.log(`  保存できた     : ${saveCount} / ${runs.length} 件`);
  console.log(`  所要 p50       : ${Math.round(times[Math.floor(times.length / 2)] / 1000)}秒`
    + ` / 最長 ${Math.round(times[times.length - 1] / 1000)}秒`);
  console.log(`  Console エラー : ${consoleErrors.length} 件`);
  consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ mode: MODE, runs, consoleErrors }, null, 2));
  console.log(`\n記録: ${OUT}`);
  await browser.close();
  /* 合否: 資料が足りる条件は頼んだ数どおり・満点一致・保存できる。
     資料が足りない条件は「頼んだ数に届かないうえで、完成と言わず、理由を持ち帰る」。 */
  const shortOk = shortfall.every((r) => r.made < r.planned && !r.complete
    && (r.evidence || (r.errorCodes || []).length));
  process.exit(okCount === normal.length && ptCount === runs.length && shortOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
