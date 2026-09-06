/* Quick Mock 耐久試験（夜間 Hardening）

   満点・問数・形式・資料の組み合わせを変えて試験を作り、
   配点の一致・回答欄の対応・重複・解答不能・受験までの受け渡しを確かめる。

   使い方:
     node vq3mock.cjs                 # 既定 8 件
     node vq3mock.cjs --n 2           # 動作確認用
     node vq3mock.cjs --out artifacts/v3-overnight/test-results/mock.json */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const N = Number(arg("n", 8));
const OUT = arg("out", "artifacts/v3-overnight/test-results/mock.json");
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
  /* ★ vq2-app（3.3MB）は 起動が 終わってから 読む。決まった 秒数で 待つと
     大きく なった とたんに 落ちる（2026-09-03 に 実際に 落ちた）。
     **在るか どうかで 待つ。** */
  await pg.waitForFunction(
    () => !!(window.VQ2 && window.VQ2.mockBuilder && window.VQ2.validate
             && window.VQ2.schema && window.VQ2.store),
    { timeout: 60000 });
}

const BASE = [
  "645年、中大兄皇子と中臣鎌足は蘇我氏を倒し、大化の改新を始めた。",
  "701年に大宝律令が完成し、律令国家の仕組みが整った。",
  "710年、都を平城京へ移した。班田収授法により6歳以上の男女に口分田が与えられた。",
  "743年の墾田永年私財法により、開墾地の永久私有が認められた。",
  "794年、桓武天皇は都を平安京へ移した。摂関政治は藤原道長のころ最盛期を迎えた。",
  "1185年、源頼朝は守護と地頭を置いた。1232年に御成敗式目が定められた。"
];
function docs(n, pages) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let t = "";
    for (let p = 1; p <= pages; p++) t += "[p." + p + "] 第" + (i + 1) + "回\n" + BASE.map((b) => "・" + b).join("\n") + "\n";
    out.push({ id: "d" + i, name: "教材" + (i + 1) + ".pdf", kind: "pdf", pageCount: pages, extractedText: t });
  }
  return out;
}

/* 満点・問数・形式・資料量の組み合わせ。最後の 1 件は無理な条件。 */
const CASES = [
  { name: "小テスト 20点/6問 選択のみ",   total: 20,  sections: 2, per: 3, docs: docs(1, 1), written: false },
  { name: "小テスト 50点/10問 記述あり",  total: 50,  sections: 2, per: 5, docs: docs(1, 2), written: true },
  { name: "定期 100点/20問 記述あり",     total: 100, sections: 4, per: 5, docs: docs(2, 2), written: true },
  { name: "定期 100点/30問 選択多め",     total: 100, sections: 5, per: 6, docs: docs(2, 3), written: false },
  { name: "複数PDF 100点/20問",           total: 100, sections: 4, per: 5, docs: docs(4, 3), written: true },
  { name: "長文資料 100点/12問",          total: 100, sections: 3, per: 4, docs: docs(3, 6), written: true },
  { name: "小問多め 50点/24問",           total: 50,  sections: 4, per: 6, docs: docs(2, 2), written: false },
  /* 満点より設問が多い＝1 問 1 点未満になる無理な条件。落ちずに伝わるかを見る。 */
  { name: "無理な条件 5点/20問",          total: 5,   sections: 4, per: 5, docs: docs(1, 1), written: false, impossible: true }
];

function pctl(arr, p) {
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

  console.log(`\n══ Quick Mock 耐久試験（${Math.min(N, CASES.length)} 件）══`);

  let lastSpecId = null;
  for (let i = 0; i < Math.min(N, CASES.length); i++) {
    const c = CASES[i];
    const t0 = Date.now();

    const r = await pg.evaluate(async ({ c }) => {
      const MB = window.VQ2.mockBuilder, V = window.VQ2.validate, S = window.VQ2.schema, ST = window.VQ2.store;
      const MUST = "\n【1 問ごとに必ず書くこと】問題文／正解／解説／選択問題は選択肢 2 つ以上"
        + "／根拠にした資料の箇所\n";
      const sections = [], keys = [], rounds = [];
      const per = Math.min(6, c.per);
      for (let k = 1; k <= c.sections; k++) {
        const rt0 = Date.now();
        try {
          const res = await window.VQ2.ai.generateMock({
            instruction: "添付した資料だけを根拠に、高校生向けの試験を作ってください。" + MUST
              + (c.written ? "記述問題も混ぜてください。" : "選択式と短答だけで作ってください。")
              + "【この回で作るもの】大問" + k + " だけを " + per + " 問、"
              + Math.round(c.total / c.sections) + " 点で作ってください。"
              + "**この大問だけ**を sections に 1 つ返してください。",
            attachments: c.docs, sourceOnly: true, count: per, skipDocumentAnalysis: k > 1
          });
          const d = res.structured && res.structured.sections ? res.structured
            : (res.structured && res.structured.data ? res.structured.data : null);
          const secs = d && Array.isArray(d.sections) ? d.sections : [];
          let qs = secs.reduce((a, x) => a.concat(x.questions || []), []);
          if (qs.length > per) qs = qs.slice(0, per);
          const keep = new Set(qs.map((q) => String(q.id)));
          if (qs.length) {
            sections.push({ name: "大問" + k, score: Math.round(c.total / c.sections), questions: qs });
            keys.push(...(d.answerKey || []).filter((x) => keep.has(String(x.id))));
          }
          rounds.push({ k, n: qs.length, ms: Date.now() - rt0 });
        } catch (e) {
          rounds.push({ k, n: 0, ms: Date.now() - rt0, err: String((e && (e.userMessage || e.message)) || e) });
        }
      }
      if (!sections.length) return { ok: false, why: "1 大問も作れなかった", rounds };

      const spec0 = MB.fromDraft({ sections, answerKey: keys }, {
        title: c.name, totalPoints: c.total, durationMinutes: 50, sourceMode: "source-only",
        ownerId: ST.currentOwnerId()
      });
      const rep = MB.repairSpec(spec0, { requireSources: true });
      const fin = MB.finalize(rep.spec);
      const spec = fin.spec;
      const qs = spec.sections.reduce((a, s) => a.concat(s.questions), []);

      /* 回答欄との対応 */
      const bindings = spec.answerBindings || [];
      const byId = {}; bindings.forEach((b) => { byId[b.id] = b; });
      const unbound = qs.filter((q) => !byId[q.answerBindingId]).length;
      const mismatched = qs.filter((q) => byId[q.answerBindingId] && byId[q.answerBindingId].questionId !== q.id).length;
      const orphanBindings = bindings.filter((b) => !qs.some((q) => q.id === b.questionId)).length;

      /* 解答不能（受験画面で解答欄を作れない） */
      const unanswerable = qs.filter((q) => {
        if (!S.hasChoices(q.type)) return false;
        if (q.type === "matching" || q.type === "ordering") return false;
        return (q.choices || []).filter((x) => String(x.text || "").trim()).length < 2;
      }).length;

      const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[。、．，？?！!「」（）()]/g, "");
      const prompts = qs.map((q) => norm(q.prompt));
      const dupPrompts = prompts.length - new Set(prompts).size;
      const ids = qs.map((q) => q.id);
      const dupIds = ids.length - new Set(ids).size;

      /* 保存 → 受験へ引き渡し */
      let saved = null, examOk = null;
      if (fin.ok) {
        const rec = ST.mocks.put({ id: spec.id, kind: "mock", title: spec.title, spec });
        saved = rec.ok;
        const back = ST.mocks.get(spec.id);
        examOk = !!(back && back.spec && back.spec.sections && back.spec.sections.length === spec.sections.length);
      }

      return {
        ok: true, rounds,
        sections: spec.sections.length, questions: qs.length,
        totalPoints: qs.reduce((a, q) => a + q.points, 0), wantedPoints: c.total,
        pointsMatch: qs.reduce((a, q) => a + q.points, 0) === c.total,
        zeroPoint: qs.filter((q) => !q.points).length,
        unbound, mismatched, orphanBindings, unanswerable, dupPrompts, dupIds,
        withAnswer: qs.filter((q) => (q.choices || []).some((x) => x.isCorrect) || String(q.correctAnswer || "").trim()).length,
        withExplanation: qs.filter((q) => String(q.explanation || "").trim()).length,
        withSource: qs.filter((q) => (q.sourceReferences || []).length).length,
        types: qs.reduce((a, q) => { a[q.type] = (a[q.type] || 0) + 1; return a; }, {}),
        repaired: rep.fixed.length, remainingAudit: rep.audit.total, blocking: rep.audit.blocking,
        saveOk: fin.ok, saved, examOk,
        errs: V.errorsOf(fin.issues).map((e) => e.code),
        specId: spec.id
      };
    }, { c });

    const ms = Date.now() - t0;
    runs.push(Object.assign({ i: i + 1, name: c.name, ms }, r));
    /* 受験と紙面は「保存できた試験」でしか通せない。
       保存が通らなかった回（無理な条件など）の id を掴むと、
       あとで ST.mocks.get が空を返して、製品ではなく試験のほうが落ちる。 */
    if (r.ok && r.specId && r.saved === true) lastSpecId = r.specId;

    if (!r.ok) note("failed", `${i + 1} 件目「${c.name}」が失敗: ${r.why}`);
    else {
      if (!c.impossible && !r.pointsMatch) note("points", `${i + 1} 件目で合計 ${r.totalPoints} 点（指定 ${r.wantedPoints} 点）`);
      if (r.unbound) note("binding", `${i + 1} 件目で回答欄の無い設問が ${r.unbound} 件`);
      if (r.mismatched) note("binding", `${i + 1} 件目で回答欄の対応が食い違う設問が ${r.mismatched} 件`);
      if (r.orphanBindings) note("binding", `${i + 1} 件目で宙に浮いた回答欄が ${r.orphanBindings} 件`);
      if (r.unanswerable) note("unanswerable", `${i + 1} 件目で解答欄を作れない設問が ${r.unanswerable} 件`);
      if (r.dupIds) note("dup-id", `${i + 1} 件目で設問 ID が ${r.dupIds} 件重複`);
      if (r.dupPrompts) note("dup-prompt", `${i + 1} 件目で問題文の重複が ${r.dupPrompts} 件`);
      if (r.questions && r.withAnswer !== r.questions) note("no-answer", `${i + 1} 件目で正解の無い設問が ${r.questions - r.withAnswer} 件`);
      if (r.saveOk && r.saved === false) note("save", `${i + 1} 件目を保存できなかった`);
      if (r.saveOk && r.examOk === false) note("handover", `${i + 1} 件目を受験へ渡せない`);
      if (c.impossible && r.saveOk && r.zeroPoint) note("impossible", `無理な条件で 0 点の設問が ${r.zeroPoint} 件できた`);
    }

    console.log(`  ${i + 1}/${Math.min(N, CASES.length)} ${c.name} — ${Math.round(ms / 1000)}秒 `
      + (r.ok
          ? `${r.sections}大問 ${r.questions}問 ${r.totalPoints}/${r.wantedPoints}点 `
            + `正解${r.withAnswer} 解説${r.withExplanation} 出典${r.withSource} `
            + `修復${r.repaired} 残不備${r.remainingAudit} `
            + (r.saveOk ? "保存OK" : "保存NG:" + [...new Set(r.errs)].join(","))
          : "NG: " + r.why));
  }

  /* ── 受験 → 提出 → 結果（最後に作った試験で通す）── */
  console.log("\n── 受験から結果まで ──");
  let examFlow = null;
  if (lastSpecId) {
    examFlow = await pg.evaluate(async (id) => {
      const ST = window.VQ2.store, G = window.VQ2.grading, S = window.VQ2.schema;
      const rec = ST.mocks.get(id);
      if (!rec) return { ok: false, why: "保存した試験が見つからない" };
      const spec = rec.spec;
      const qs = spec.sections.reduce((a, s) => a.concat(s.questions), []);
      /* 全部それらしく答える */
      const answers = qs.map((q) => {
        if ((q.choices || []).length) return { questionId: q.id, value: { choiceId: q.choices[0].id } };
        if (S.isAiGraded(q.type)) return { questionId: q.id, value: { text: "資料に基づいて説明します。" } };
        return { questionId: q.id, value: { text: String(q.correctAnswer || "答") } };
      });
      const graded = G.gradeSession(qs, answers);
      const agg = G.aggregate(qs, graded.items);
      return {
        ok: true, questions: qs.length,
        answered: graded.items.filter((x) => x.answered).length,
        deterministic: graded.items.filter((x) => x.method !== "pending-ai" && x.method !== "unanswered").length,
        pendingAi: graded.pendingCount,
        score: graded.deterministicScore, max: graded.totalMax,
        aggTotal: agg.total.max,
        maxMatches: graded.totalMax === spec.totalPoints
      };
    }, lastSpecId);
    if (!examFlow.ok) note("exam", "受験の流れを通せない: " + examFlow.why);
    else {
      if (examFlow.answered !== examFlow.questions) note("exam", `全問答えたのに ${examFlow.questions - examFlow.answered} 問が未回答扱い`);
      if (!examFlow.maxMatches) note("exam", `採点の満点 ${examFlow.max} が試験の満点と違う`);
      console.log(`  ${examFlow.questions} 問に解答 → 採点 ${examFlow.score}/${examFlow.max} 点`
        + `（コード採点 ${examFlow.deterministic} 問 / AI 採点待ち ${examFlow.pendingAi} 問）`);
    }
  } else {
    console.log("  保存できた試験が無いため未実施");
    note("exam", "保存できた試験が無いため受験の流れは未実施");
  }

  /* ── 紙面（組み込みレンダラ）── */
  console.log("\n── 紙面 ──");
  let paper = null;
  if (lastSpecId) {
    paper = await pg.evaluate((id) => {
      const ST = window.VQ2.store, L = window.VQ2.layout, TPL = window.VQ2.templates;
      const rec = ST.mocks.get(id);
      if (!rec) return { ok: false, why: "保存した試験が見つからない" };
      const plan = L.buildPlan(rec.spec, {});
      const eng = TPL.engineStatus();
      /* buildPlan が返すのは pages ではなく booklets（問題冊子・解答用紙・解答解説）。
         plan.pages を数えても常に null になる。 */
      const booklets = (plan.booklets || []).map((b) => b.kind + ":" + (b.blocks || []).length);
      return { ok: true, booklets, blocks: (plan.booklets || []).reduce((a, b) => a + (b.blocks || []).length, 0),
               warnings: (plan.warnings || []).length,
               templateVersion: plan.templateVersion,
               builtin: eng.builtin.available, typst: eng.typst.available, latex: eng.latex.available };
    }, lastSpecId);
    if (!paper.ok) {
      console.log(`  紙面を確かめられない: ${paper.why}`);
      note("paper", "紙面を確かめられない: " + paper.why);
    } else {
      console.log(`  組み込みレンダラ: ${paper.builtin ? "使える" : "使えない"}`
        + ` / Typst: ${paper.typst ? "あり" : "未導入"} / LaTeX: ${paper.latex ? "あり" : "未導入"}`
        + `\n  冊子: ${paper.booklets.join(" / ")}（全 ${paper.blocks} ブロック・注意 ${paper.warnings} 件）`);
      if (!paper.builtin) note("paper", "組み込みレンダラが使えない");
      if (!paper.blocks) note("paper", "紙面のブロックが 1 つも組めていない");
    }
  } else {
    console.log("  保存できた試験が無いため未実施");
    note("paper", "保存できた試験が無いため紙面は未実施");
  }

  const ok = runs.filter((r) => r.ok);
  const times = runs.map((r) => r.ms);
  const uiErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));
  const totalQ = ok.reduce((a, r) => a + r.questions, 0);

  const summary = {
    startedAt: started.toISOString(), finishedAt: new Date().toISOString(),
    cases: runs.length, success: ok.length, failed: runs.length - ok.length,
    totalQuestions: totalQ,
    msP50: pctl(times, 0.5), msP95: pctl(times, 0.95),
    pointsMatchCases: ok.filter((r) => r.pointsMatch).length,
    unanswerableTotal: ok.reduce((a, r) => a + r.unanswerable, 0),
    bindingProblems: ok.reduce((a, r) => a + r.unbound + r.mismatched + r.orphanBindings, 0),
    answerRate: totalQ ? Math.round((ok.reduce((a, r) => a + r.withAnswer, 0) / totalQ) * 1000) / 10 : 0,
    explanationRate: totalQ ? Math.round((ok.reduce((a, r) => a + r.withExplanation, 0) / totalQ) * 1000) / 10 : 0,
    sourceRate: totalQ ? Math.round((ok.reduce((a, r) => a + r.withSource, 0) / totalQ) * 1000) / 10 : 0,
    saveableCases: ok.filter((r) => r.saveOk).length,
    examFlow, paper, uiConsoleErrors: uiErrors, pageErrors, problems, runs
  };

  console.log("\n══ まとめ ══");
  console.log(`  成功        : ${ok.length} / ${runs.length}（作った設問 ${totalQ} 問）`);
  console.log(`  所要        : p50 ${Math.round(summary.msP50 / 1000)}秒 / p95 ${Math.round(summary.msP95 / 1000)}秒`);
  console.log(`  満点が一致  : ${summary.pointsMatchCases} / ${ok.length} 件`);
  console.log(`  解答欄なし  : ${summary.unanswerableTotal} 問 / 回答欄の不整合: ${summary.bindingProblems} 件`);
  console.log(`  正解 ${summary.answerRate}% / 解説 ${summary.explanationRate}% / 出典 ${summary.sourceRate}%`);
  console.log(`  保存できた  : ${summary.saveableCases} / ${ok.length} 件`);
  console.log(`  Console err : ${uiErrors.length} 件 / pageerror ${pageErrors.length} 件`);
  console.log(`  問題        : ${problems.length} 件`);
  problems.slice(0, 20).forEach((p) => console.log(`    - [${p.kind}] ${p.detail}`));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n記録: ${OUT}`);

  await browser.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
