/* プリセット自動作成の耐久試験（夜間 Hardening）

   軽量 / 標準 / 重量 の 3 段で、実ローカルモデルに問題を作らせ、
   出来上がりの品質（Schema 適合・重複・正解欠落・出典・教材外）を数える。

   使い方:
     node vq3preset.cjs                       # 既定（軽10・標準8・重3）
     node vq3preset.cjs --light 3 --std 2 --heavy 1
     node vq3preset.cjs --out artifacts/v3-overnight/test-results/preset.json

   AI を使うので **同時に 1 本だけ** 走らせること。 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const LIGHT = Number(arg("light", 10));
const STD = Number(arg("std", 8));
const HEAVY = Number(arg("heavy", 3));
const OUT = arg("out", "artifacts/v3-overnight/test-results/preset.json");
const HIDE = "#vqNewAuth{display:none !important}";

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
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

/* 資料。教材外かどうかを測れるように、**資料にしか無い固有名詞**を仕込む。 */
const MARKERS = ["カリヤ式土器", "沼村の座", "1247年の白岩令", "ミナカタ交易路", "オオセ和議"];

function buildDocs(kind) {
  const base = [
    "645年、中大兄皇子と中臣鎌足は蘇我氏を倒し、大化の改新を始めた。",
    "701年に大宝律令が完成し、律令国家の仕組みが整った。",
    "710年、都を平城京へ移した。班田収授法により6歳以上の男女に口分田が与えられた。",
    "743年の墾田永年私財法により、開墾地の永久私有が認められた。",
    "794年、桓武天皇は都を平安京へ移した。摂関政治は藤原道長のころ最盛期を迎えた。"
  ];
  const marker = [
    "この地域では " + MARKERS[0] + " が出土しており、生活の様子を知る手がかりになる。",
    MARKERS[1] + " と呼ばれる合議の場が置かれ、地域の争いを調停していた。",
    MARKERS[2] + " は、この地方だけで通用した独自の決まりである。",
    MARKERS[3] + " を通じて、遠方の産物がもたらされた。",
    MARKERS[4] + " により、長く続いた対立が終わった。"
  ];
  if (kind === "light") {
    return [{ id: "d1", name: "授業プリント.pdf", kind: "pdf", pageCount: 1,
              extractedText: "[p.1] " + base.slice(0, 3).join("") + marker[0] }];
  }
  if (kind === "std") {
    return [
      { id: "d1", name: "古代プリント.pdf", kind: "pdf", pageCount: 2,
        extractedText: "[p.1] " + base.join("") + "\n[p.2] " + marker.slice(0, 2).join("") },
      { id: "d2", name: "板書メモ.txt", kind: "text", lineCount: 6,
        extractedText: marker.slice(2, 4).join("\n") }
    ];
  }
  /* 重量：複数教材・長文 */
  const docs = [];
  for (let i = 0; i < 5; i++) {
    let t = "";
    for (let p = 1; p <= 4; p++) {
      t += "[p." + p + "] 第" + (i + 1) + "回・" + p + "ページ\n";
      t += base.map((b) => "・" + b).join("\n") + "\n";
      t += "・" + marker[(i + p) % marker.length] + "\n";
    }
    docs.push({ id: "d" + i, name: "教材" + (i + 1) + ".pdf", kind: "pdf", pageCount: 4, extractedText: t });
  }
  return docs;
}

const CASES = {
  light: { count: 5, instruction: "添付した資料だけを根拠に、4択問題を5問作ってください。全ての選択肢に解説を付けてください。" },
  std: { count: 15, instruction: "添付した資料だけを根拠に、高校生向けの問題を15問作ってください。"
    + "4択・正誤・記述・空欄補充を混ぜ、全ての選択肢に解説と、根拠にした資料の箇所を付けてください。" },
  heavy: { count: 25, instruction: "添付した資料だけを根拠に、高校生向けの問題を25問作ってください。"
    + "4択・正誤・記述・空欄補充・並び替え・資料読み取りを混ぜ、難易度を散らし、"
    + "全ての選択肢に解説と、根拠にした資料の箇所を付けてください。" }
};

function pct(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

(async () => {
  const started = new Date();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const consoleErrors = [], pageErrors = [];
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);

  const runs = [], problems = [];
  function note(kind, detail) { problems.push({ kind, detail }); }

  const plan = [].concat(
    Array.from({ length: LIGHT }, () => "light"),
    Array.from({ length: STD }, () => "std"),
    Array.from({ length: HEAVY }, () => "heavy")
  );

  console.log(`\n══ プリセット生成 耐久試験（軽 ${LIGHT} / 標準 ${STD} / 重 ${HEAVY}）══`);

  for (let i = 0; i < plan.length; i++) {
    const kind = plan[i];
    const c = CASES[kind];
    const t0 = Date.now();

    const r = await pg.evaluate(async ({ kind, instruction, count, docs, markers }) => {
      const S = window.VQ2.schema, V = window.VQ2.validate, D = window.VQ2.draft;
      try {
        const res = await window.VQ2.ai.generatePreset({
          instruction: instruction, attachments: docs, sourceOnly: true, count: count
        });
        const data = res.structured && res.structured.questions ? res.structured
          : (res.structured && res.structured.data ? res.structured.data : null);
        if (!data || !Array.isArray(data.questions)) return { ok: false, why: "構造化結果なし" };

        const qs = D.draftToQuestions(data);
        const preset = S.emptyPreset({ name: "耐久 " + kind, questions: qs });
        const issues = V.validatePresetForSave(preset, { sourceOnly: true });
        const errs = V.errorsOf(issues);

        /* 資料にしか無い語が問題文に出ているか＝資料を読んでいる証拠 */
        const all = qs.map((q) => q.prompt + " " + (q.choices || []).map((x) => x.text).join(" ")).join(" ");
        const usedMarkers = markers.filter((m) => all.indexOf(m) >= 0);

        const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[。、．，？?！!「」（）()]/g, "");
        const prompts = qs.map((q) => norm(q.prompt));
        const dupPrompts = prompts.length - new Set(prompts).size;
        const ids = qs.map((q) => q.id);
        const dupIds = ids.length - new Set(ids).size;

        let dupChoiceQs = 0, noCorrect = 0, noChoiceExp = 0, noSource = 0, multiCorrect = 0;
        qs.forEach((q) => {
          const ch = q.choices || [];
          if (ch.length) {
            const texts = ch.map((x) => norm(x.text));
            if (texts.length !== new Set(texts).size) dupChoiceQs++;
            const cor = ch.filter((x) => x.isCorrect).length;
            if (cor === 0) noCorrect++;
            if (q.type === "multiple_choice_single" && cor > 1) multiCorrect++;
            if (ch.some((x) => !String(x.explanation || "").trim())) noChoiceExp++;
          } else if (S.isDeterministic(q.type) && !String(q.correctAnswer || "").trim()) noCorrect++;
          if (!(q.sourceReferences || []).length) noSource++;
        });

        return {
          ok: true, n: qs.length,
          types: qs.reduce((a, q) => { a[q.type] = (a[q.type] || 0) + 1; return a; }, {}),
          schemaErrors: errs.map((e) => e.code),
          dupPrompts, dupIds, dupChoiceQs, noCorrect, multiCorrect, noChoiceExp, noSource,
          requiresReview: qs.filter((q) => q.requiresReview).length,
          withExplanation: qs.filter((q) => String(q.explanation || "").trim()).length,
          usedMarkers: usedMarkers.length,
          warnings: (res.warnings || []).length
        };
      } catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
    }, { kind, instruction: c.instruction, count: c.count, docs: buildDocs(kind), markers: MARKERS });

    const ms = Date.now() - t0;
    const row = Object.assign({ i: i + 1, kind, wanted: c.count, ms }, r);
    runs.push(row);

    if (!r.ok) note("failed", `${i + 1} 件目（${kind}）が失敗: ${r.why}`);
    else {
      if (r.schemaErrors.length) note("schema", `${i + 1} 件目に保存できない問題: ${[...new Set(r.schemaErrors)].join(",")}`);
      if (r.dupIds) note("dup-id", `${i + 1} 件目で問題 ID が ${r.dupIds} 件重複`);
      if (r.noCorrect) note("no-correct", `${i + 1} 件目で正解の無い問題が ${r.noCorrect} 件`);
      if (r.multiCorrect) note("multi-correct", `${i + 1} 件目で単一選択なのに正解が複数 ${r.multiCorrect} 件`);
      if (r.dupPrompts) note("dup-prompt", `${i + 1} 件目で問題文の重複が ${r.dupPrompts} 件`);
      if (r.dupChoiceQs) note("dup-choice", `${i + 1} 件目で選択肢が重複した問題が ${r.dupChoiceQs} 件`);
    }

    console.log(`  ${String(i + 1).padStart(2)}/${plan.length} [${kind}] ${Math.round(ms / 1000)}秒 `
      + (r.ok
          ? `${r.n}/${c.count}問 解説${r.withExplanation} 出典なし${r.noSource} 正解なし${r.noCorrect} `
            + `重複${r.dupPrompts} 資料語${r.usedMarkers}/${MARKERS.length} 要確認${r.requiresReview}`
          : "NG: " + r.why));
  }

  /* ── 差分適用・Undo/Redo・自動保存・V1 互換（ドメイン層で確かめる）── */
  console.log("\n── 差分適用と保存 ──");
  const flow = await pg.evaluate(() => {
    const S = window.VQ2.schema, D = window.VQ2.draft, ST = window.VQ2.store, A = window.VQ2.adapter, V = window.VQ2.validate;
    const out = {};
    const mk = (id, text) => S.emptyQuestion({
      id, prompt: text, type: "multiple_choice_single",
      choices: [{ id: "c1", label: "A", text: "正", explanation: "○", isCorrect: true },
                { id: "c2", label: "B", text: "誤", explanation: "×", isCorrect: false }]
    });
    /* 差分：追加 2・変更 1 */
    const current = [mk("q1", "元の問題1"), mk("q2", "元の問題2")];
    const proposed = [mk("q1", "直した問題1"), mk("q2", "元の問題2"), mk("q3", "新しい問題3")];
    const diff = D.diffQuestions(current, proposed, {});
    out.changes = diff.changes.length;

    const all = D.applyDiff(current.map((q) => JSON.parse(JSON.stringify(q))), diff, { all: true });
    out.applyAll = all.questions.length;
    const one = D.applyDiff(current.map((q) => JSON.parse(JSON.stringify(q))), diff,
      { questionIds: [diff.changes[0].questionId] });
    out.applyOne = one.appliedCount;

    /* Undo / Redo */
    const h = new window.VQ2.History({ n: 0 });
    h.push({ n: 1 }, "1"); h.push({ n: 2 }, "2");
    out.undo = h.undo().n; out.redo = h.redo().n;

    /* 保存 → 競合検出 → 復元 */
    const p = S.emptyPreset({ name: "耐久保存テスト", questions: [mk("q1", "保存できる問題")] });
    const s1 = ST.savePreset(p, {});
    out.saved = s1.ok;
    const conflict = ST.savePreset(Object.assign({}, s1.preset, { name: "別の更新" }), { baseRevision: 0 });
    out.conflictDetected = conflict.error === "CONFLICT";
    ST.saveDraft("preset", p.id, p, {});
    out.draftRestored = !!(ST.loadDraft("preset", p.id) || {}).payload;

    /* V1 互換：文字列 ID・記述式・空の back でも落ちない */
    const withText = S.emptyPreset({ name: "V1 互換", questions: [
      mk("q_str", "選択式"),
      S.emptyQuestion({ id: "q_long", type: "long_answer", prompt: "記述式", choices: [],
                        points: 4, scoringRubric: S.defaultRubric("long_answer", 4) })
    ]});
    const v1 = A.presetToV1(withText);
    out.v1Cards = (v1.cards || []).length;
    out.v1AllValidIds = (v1.cards || []).every((c) => Number.isInteger(c.id) && c.id > 0);
    out.v1AllHaveFrontBack = (v1.cards || []).every((c) => String(c.front || "").trim() && String(c.back || "").trim());
    const back = A.presetToV2(v1, {});
    out.roundTripQuestions = (back.questions || []).length;
    ST.deletePreset(p.id);
    return out;
  });
  console.log(`  差分 ${flow.changes} 件 / 全適用 ${flow.applyAll} 問 / 一部適用 ${flow.applyOne} 件`);
  console.log(`  Undo ${flow.undo} → Redo ${flow.redo} / 保存 ${flow.saved ? "OK" : "NG"} / 競合検出 ${flow.conflictDetected ? "OK" : "NG"} / 下書き復元 ${flow.draftRestored ? "OK" : "NG"}`);
  console.log(`  V1 互換: ${flow.v1Cards} 枚（ID ${flow.v1AllValidIds ? "OK" : "NG"} / front+back ${flow.v1AllHaveFrontBack ? "OK" : "NG"}）→ 戻して ${flow.roundTripQuestions} 問`);

  if (!flow.saved) note("save", "プリセットを保存できない");
  if (!flow.conflictDetected) note("conflict", "競合を検出できていない");
  if (!flow.draftRestored) note("draft", "下書きを復元できない");
  if (!flow.v1AllValidIds || !flow.v1AllHaveFrontBack) note("v1", "V1 互換の条件を満たさないカードがある");
  if (flow.roundTripQuestions !== flow.v1Cards) note("v1-roundtrip", "V1 へ往復すると問題数が変わる");
  if (flow.undo !== 1 || flow.redo !== 2) note("undo", `Undo/Redo が想定と違う（${flow.undo}/${flow.redo}）`);

  /* ── まとめ ── */
  const ok = runs.filter((r) => r.ok);
  const times = ok.map((r) => r.ms);
  const totalQ = ok.reduce((a, r) => a + r.n, 0);
  const uiErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));

  const summary = {
    startedAt: started.toISOString(), finishedAt: new Date().toISOString(),
    cases: plan.length, success: ok.length, failed: plan.length - ok.length,
    totalQuestions: totalQ,
    msP50: pct(times, 0.5), msP95: pct(times, 0.95),
    schemaErrorCases: runs.filter((r) => r.ok && r.schemaErrors.length).length,
    noCorrectTotal: ok.reduce((a, r) => a + r.noCorrect, 0),
    dupPromptTotal: ok.reduce((a, r) => a + r.dupPrompts, 0),
    dupIdTotal: ok.reduce((a, r) => a + r.dupIds, 0),
    noSourceTotal: ok.reduce((a, r) => a + r.noSource, 0),
    noChoiceExpTotal: ok.reduce((a, r) => a + r.noChoiceExp, 0),
    explanationRate: totalQ ? Math.round((ok.reduce((a, r) => a + r.withExplanation, 0) / totalQ) * 1000) / 10 : 0,
    sourceRate: totalQ ? Math.round(((totalQ - ok.reduce((a, r) => a + r.noSource, 0)) / totalQ) * 1000) / 10 : 0,
    markerHitCases: ok.filter((r) => r.usedMarkers > 0).length,
    flow, uiConsoleErrors: uiErrors, pageErrors, problems, runs
  };

  console.log("\n══ まとめ ══");
  console.log(`  成功        : ${ok.length} / ${plan.length}（作った問題 ${totalQ} 問）`);
  console.log(`  所要        : p50 ${Math.round(summary.msP50 / 1000)}秒 / p95 ${Math.round(summary.msP95 / 1000)}秒`);
  console.log(`  解説あり    : ${summary.explanationRate}% / 出典あり: ${summary.sourceRate}%`);
  console.log(`  正解なし    : ${summary.noCorrectTotal} 問 / 問題文の重複: ${summary.dupPromptTotal} 問 / ID 重複: ${summary.dupIdTotal}`);
  console.log(`  資料語を使った回: ${summary.markerHitCases} / ${ok.length}`);
  console.log(`  Console err : ${uiErrors.length} 件 / pageerror ${pageErrors.length} 件`);
  console.log(`  問題        : ${problems.length} 件`);
  problems.slice(0, 20).forEach((p) => console.log(`    - [${p.kind}] ${p.detail}`));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n記録: ${OUT}`);

  await browser.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
