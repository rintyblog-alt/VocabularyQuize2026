/* ══════════════════════════════════════════════════════════════════════
   Learning Workspace V2 — 性能測定（§37）
   ・すべて実測。推測値は出さない。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const os = require("os");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&vq2=all", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => { const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b) { b.click(); return true; } return false; });
    if (!c) break; await pg.waitForTimeout(300);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

const rows = [];
function rec(name, value, unit, note) { rows.push({ name, value, unit, note: note || "" }); }

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await login(pg);

  /* ── 画面の初期表示 ── */
  for (const [label, fn] of [
    ["Preset Studio 初期表示", "window.VQ2.open.presetStudio({})"],
    ["Quick Mock 初期表示", "window.VQ2.open.quickMock({})"]
  ]) {
    const ms = await pg.evaluate(async (src) => {
      const t = performance.now();
      // eslint-disable-next-line no-eval
      eval(src);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = performance.now() - t;
      document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
      document.body.style.overflow = "";
      return Math.round(out);
    }, fn);
    rec(label, ms, "ms");
  }

  /* ── 大きなプリセットでの操作 ── */
  const big = await pg.evaluate(async () => {
    const S = window.VQ2.schema, V = window.VQ2.validate, ST = window.VQ2.store;
    const mk = (i) => S.emptyQuestion({
      prompt: "問題 " + i + " の本文です。", topic: "単元" + (i % 8),
      choices: [
        { id: "c1", label: "A", text: "選択肢1-" + i, explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢2-" + i, explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢3-" + i, explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢4-" + i, explanation: "", isCorrect: false }]
    });
    const out = {};
    for (const n of [50, 200]) {
      const p = S.emptyPreset({ name: n + "問プリセット", questions: Array.from({ length: n }, (_, i) => mk(i)) });
      let t = performance.now();
      const issues = V.validatePresetForSave(p);
      out["validate" + n] = Math.round(performance.now() - t);
      t = performance.now();
      const r = ST.savePreset(p);
      out["save" + n] = Math.round(performance.now() - t);
      out["saveOk" + n] = r.ok;
      t = performance.now();
      window.VQ2.adapter.presetToV1(p);
      out["toV1_" + n] = Math.round(performance.now() - t);
      if (r.ok) ST.deletePreset(r.preset.id);
      out["issues" + n] = issues.length;
    }
    /* Undo / Redo */
    const p = S.emptyPreset({ name: "履歴", questions: Array.from({ length: 200 }, (_, i) => mk(i)) });
    const h = new window.VQ2.History(p);
    let t = performance.now();
    for (let i = 0; i < 30; i++) { const c = JSON.parse(JSON.stringify(h.current())); c.questions[i].prompt = "編集" + i; h.push(c, "編集"); }
    out.history30 = Math.round(performance.now() - t);
    t = performance.now();
    for (let i = 0; i < 30; i++) h.undo();
    out.undo30 = Math.round(performance.now() - t);
    return out;
  });
  rec("50問プリセットの検証", big.validate50, "ms");
  rec("50問プリセットの保存（V1ミラー込み）", big.save50, "ms");
  rec("200問プリセットの検証", big.validate200, "ms");
  rec("200問プリセットの保存（V1ミラー込み）", big.save200, "ms");
  rec("200問プリセットの V1 変換", big.toV1_200, "ms");
  rec("Undo 履歴 30 段の記録（200問）", big.history30, "ms");
  rec("Undo 30 回", big.undo30, "ms");

  /* ── 配点調整 ── */
  const alloc = await pg.evaluate(() => {
    const MB = window.VQ2.mockBuilder;
    const mkDraft = (n) => ({
      title: "計測", sections: [{ name: "s", questions: Array.from({ length: n }, (_, i) => ({
        id: "q" + i, type: "multiple_choice", question: "問" + i, points: 1,
        choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }] })) }],
      answerKey: Array.from({ length: n }, (_, i) => ({ id: "q" + i, answer: "a" }))
    });
    const out = {};
    for (const n of [20, 100]) {
      const spec = MB.fromDraft(mkDraft(n), { totalPoints: 100 });
      const t = performance.now();
      const r = MB.finalize(spec);
      out["alloc" + n] = Math.round(performance.now() - t);
      out["ok" + n] = r.ok;
    }
    return out;
  });
  rec("配点調整＋検証（20問／100点）", alloc.alloc20, "ms", alloc.ok20 ? "収束" : "不可");
  rec("配点調整＋検証（100問／100点）", alloc.alloc100, "ms", alloc.ok100 ? "収束" : "不可");

  /* ── 紙面の生成と検査 ── */
  const pdf = await pg.evaluate(async () => {
    const S = window.VQ2.schema, MB = window.VQ2.mockBuilder;
    const mkDraft = (n) => ({
      title: "紙面計測", subject: "日本史", durationMinutes: 50, totalScore: 100,
      sections: [{ name: "大問1", questions: Array.from({ length: n }, (_, i) => ({
        id: "q" + i, type: "multiple_choice", question: "設問 " + i + " の本文です。ここに問題文が入ります。",
        points: 1, choices: [{ id: "a", text: "選択肢1" }, { id: "b", text: "選択肢2" },
                              { id: "c", text: "選択肢3" }, { id: "d", text: "選択肢4" }] })) }],
      answerKey: Array.from({ length: n }, (_, i) => ({ id: "q" + i, answer: "a", explanation: "解説です。" }))
    });
    const out = {};
    for (const n of [10, 40]) {
      const spec = MB.finalize(MB.fromDraft(mkDraft(n), { totalPoints: 100, paper: S.defaultPaper() })).spec;
      let t = performance.now();
      const plan = window.VQ2.layout.buildPlan(spec);
      out["plan" + n] = Math.round(performance.now() - t);
      t = performance.now();
      const html = window.VQ2.pdfRenderer.buildHtml(spec, plan, { bookletId: "question-booklet" });
      out["html" + n] = Math.round(performance.now() - t);
      out["bytes" + n] = html.length;
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;left:-9999px;width:900px;height:1300px";
      document.body.appendChild(f);
      t = performance.now();
      await window.VQ2.pdfRenderer.renderToIframe(f, html);
      out["render" + n] = Math.round(performance.now() - t);
      t = performance.now();
      const res = window.VQ2.inspector.inspect(f, spec, plan);
      out["inspect" + n] = Math.round(performance.now() - t);
      out["pages" + n] = res.summary.pageCount;
      out["issues" + n] = res.issues.length;
      document.body.removeChild(f);
    }
    return out;
  });
  rec("LayoutPlan 生成（10問）", pdf.plan10, "ms");
  rec("紙面 HTML 生成（10問）", pdf.html10, "ms", pdf.bytes10 + " バイト");
  rec("紙面の描画（10問）", pdf.render10, "ms", pdf.pages10 + " ページ");
  rec("紙面の検査（10問）", pdf.inspect10, "ms", pdf.issues10 + " 件の指摘");
  rec("紙面 HTML 生成（40問）", pdf.html40, "ms", pdf.bytes40 + " バイト");
  rec("紙面の描画（40問）", pdf.render40, "ms", pdf.pages40 + " ページ");
  rec("紙面の検査（40問）", pdf.inspect40, "ms", pdf.issues40 + " 件の指摘");

  /* ── デジタル受験の初期表示 ── */
  const exam = await pg.evaluate(async () => {
    const S = window.VQ2.schema, MB = window.VQ2.mockBuilder;
    const spec = MB.finalize(MB.fromDraft({
      title: "受験計測", durationMinutes: 50, totalScore: 100,
      sections: [{ name: "大問1", questions: Array.from({ length: 20 }, (_, i) => ({
        id: "q" + i, type: "multiple_choice", question: "設問 " + i,
        points: 1, choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }] })) }],
      answerKey: Array.from({ length: 20 }, (_, i) => ({ id: "q" + i, answer: "a" }))
    }, { totalPoints: 100, paper: S.defaultPaper() })).spec;
    const plan = window.VQ2.layout.buildPlan(spec);
    const t = performance.now();
    window.VQ2.open.exam({ spec, plan, manifest: window.VQ2.layout.buildManifest(spec, plan, null) });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const first = Math.round(performance.now() - t);
    await new Promise((r) => setTimeout(r, 2500));
    const host = document.getElementById("vq2-exam-workspace");
    const root = host && host.shadowRoot.querySelector(".vq2-root");
    const paperReady = !!(root && root.querySelector("#examPaper iframe"));
    const t2 = performance.now();
    const inp = root.querySelector("[data-pick]");
    if (inp) inp.click();
    await new Promise((r) => requestAnimationFrame(r));
    const answer = Math.round(performance.now() - t2);
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    return { first, paperReady, answer };
  });
  rec("デジタル受験の初期表示（20問）", exam.first, "ms", exam.paperReady ? "問題冊子の描画あり" : "描画なし");
  rec("解答の記録と自動保存の反映", exam.answer, "ms");

  /* ── 採点 ── */
  const grade = await pg.evaluate(() => {
    const S = window.VQ2.schema, G = window.VQ2.grading;
    const qs = Array.from({ length: 100 }, (_, i) => S.emptyQuestion({
      id: "q" + i, prompt: "問" + i, points: 1,
      choices: [{ id: "a", label: "A", text: "正", explanation: "", isCorrect: true },
                { id: "b", label: "B", text: "誤", explanation: "", isCorrect: false }] }));
    const answers = qs.map((q, i) => ({ questionId: q.id, value: { choiceId: i % 3 ? "a" : "b" }, timeMs: 1000 + i }));
    let t = performance.now();
    const r = G.gradeSession(qs, answers);
    const grading = Math.round(performance.now() - t);
    t = performance.now();
    G.aggregate(qs, r.items);
    const agg = Math.round(performance.now() - t);
    return { grading, agg, score: r.deterministicScore };
  });
  rec("決定論的採点（100問）", grade.grading, "ms", grade.score + " 点");
  rec("集計（100問）", grade.agg, "ms");

  /* ── モデルの常駐状況（Bridge から実測） ── */
  let models = null;
  try {
    const res = await fetch("http://127.0.0.1:17891/status");
    models = await res.json();
  } catch (e) {}

  await browser.close();

  console.log("\n══ Learning Workspace V2 性能実測 ══");
  console.log("機種: " + os.cpus().length + " コア / メモリ " + (os.totalmem() / 1e9).toFixed(0) + "GB / 空き "
    + (os.freemem() / 1e9).toFixed(1) + "GB");
  console.log("");
  console.log("| 項目 | 実測 | 備考 |");
  console.log("|---|---:|---|");
  rows.forEach((r) => console.log("| " + r.name + " | " + r.value + " " + r.unit + " | " + r.note + " |"));

  if (models && models.resources) {
    console.log("\n── Bridge の状態（実測） ──");
    console.log(JSON.stringify(models.resources, null, 1).slice(0, 800));
  }
  if (models) {
    const list = Array.isArray(models.models) ? models.models
      : (models.models && typeof models.models === "object" ? Object.values(models.models) : []);
    if (list.length) {
      console.log("\n── モデル ──");
      list.forEach((m) => console.log("  " + (m.name || m.id || m.ref || "?")
        + " loaded=" + (m.loaded ? "yes" : "no")
        + (m.sizeVram ? " " + (m.sizeVram / 1e9).toFixed(1) + "GB" : "")));
    }
    if (models.orchestrator) console.log("\n── Orchestrator ──\n " + JSON.stringify(models.orchestrator).slice(0, 400));
  }
  console.log("\n測定にかかった時間: " + Math.round((Date.now() - t0) / 1000) + " 秒");
})().catch((e) => { console.error("計測エラー:", e); process.exit(1); });
