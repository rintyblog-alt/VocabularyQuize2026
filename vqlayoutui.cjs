/* 紙面レイアウトプロファイルを **実ブラウザ** で確かめる。

   確かめること
     1. 出荷するコードに入っている（ビルドが通っている）
     2. Quick Mock の設定画面に「紙面デザイン」が出る
        ・出力エンジンと紙面デザインが別の欄
        ・まだ組めないものは「準備中」と出る
     3. 「レイアウトだけ再生成」で Seed だけが変わる
     4. 実際に紙面を組める（罫線型の解答用紙が出る）
     5. スマホ幅で、選択欄がはみ出さず、縦に並び、ボタンが 44px 以上

   AI は使わない（見たいのは配線と紙面の構造）。

   実行: node vqlayoutui.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
}

/* 試験の見本をブラウザ内で作る（AI を使わない） */
const MAKE_SPEC = `
window.__mkSpec = function (n, withFigure) {
  var S = window.VQ2.schema;
  var qs = [];
  for (var i = 1; i <= n; i++) {
    var t = i % 4 === 0 ? "short_answer" : (i % 5 === 0 ? "long_answer" : "multiple_choice_single");
    var q = {
      id: "q" + i, schemaVersion: 2, sectionId: "s1", number: i, type: t,
      prompt: "設問 " + i + " の問題文です。", explanation: "解説", points: 10,
      choices: t === "multiple_choice_single" ? [
        { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
      ] : [],
      correctAnswer: t === "multiple_choice_single" ? null : "答え",
      acceptedAnswers: [], difficulty: "normal", topic: "", tags: [], estimatedSeconds: 60,
      sourceReferences: [], requiresReview: false, validationIssues: [],
      answerBindingId: "b" + i
    };
    if (t === "long_answer") {
      q.scoringRubric = { items: [{ id: "r1", description: "根拠", points: 10, criterionId: "knowledge_skill" }] };
    }
    if (withFigure && i === 1) {
      q.contentBlocks = [{ type: "figure", src: "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#eee"/><text x="14" y="76" font-size="18">図</text></svg>'),
        caption: "図1 実験の装置" }];
    }
    qs.push(q);
  }
  return {
    id: "m_ui_" + Date.now(), schemaVersion: 2, title: "レイアウト確認テスト",
    subject: "理科", grade: "中3", durationMinutes: 50,
    totalPoints: qs.length * 10, sourceMode: "source-only",
    paper: S.defaultPaper(),
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: qs.length * 10, questions: qs }],
    answerBindings: qs.map(function (x) {
      return { id: x.answerBindingId, questionId: x.id, number: String(x.number),
               inputType: x.type, points: x.points, blankCount: 1 };
    })
  };
};
`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const pageErrors = [];
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);
  await pg.addScriptTag({ content: MAKE_SPEC });

  section("1. 出荷するコードに入っているか");
  const api = await pg.evaluate(() => {
    const LP = window.VQ2 && window.VQ2.layoutProfiles;
    return {
      exists: !!LP,
      profiles: LP ? Object.keys(LP.PROFILES) : [],
      engines: LP ? LP.OUTPUT_ENGINES : [],
      modes: LP ? LP.LAYOUT_MODES.map((m) => m.id) : [],
      answerModes: LP ? LP.ANSWER_SHEET_MODES.map((m) => m.id) : [],
      engineStatus: LP ? Object.keys(LP.engineStatus()).map((k) => k + ":" + LP.engineStatus()[k].available) : []
    };
  });
  console.log("   " + JSON.stringify(api));
  ok("レイアウトプロファイルが読み込まれている", api.exists);
  ok("初期プロファイル 2 種がある",
    api.profiles.indexOf("school-science-figure-classic") >= 0
    && api.profiles.indexOf("school-answer-grid-dense") >= 0, api.profiles.join(","));
  ok("出力エンジンは current / typst / tex の 3 つ",
    JSON.stringify(api.engines) === '["current","typst","tex"]', api.engines.join(","));
  ok("紙面デザインは 6 種 + おまかせ", api.modes.length === 7, api.modes.join(","));
  ok("Typst / TeX は「使えない」と正直に返す",
    api.engineStatus.indexOf("typst:false") >= 0 && api.engineStatus.indexOf("tex:false") >= 0,
    api.engineStatus.join(" "));

  section("2. 未選択なら、いまの Quick Mock と同じ");
  const compat = await pg.evaluate(() => {
    const spec = window.__mkSpec(6, true);
    const plan = window.VQ2.layout.buildPlan(spec, {});
    const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
    const types = plan.booklets.flatMap((b) => b.blocks.map((x) => x.type));
    return {
      hasLayoutField: !!spec.layout,
      hasProfileInfo: !!plan.layoutProfile,
      templateId: plan.templateId,
      answerBlocks: [...new Set(sheet.blocks.map((b) => b.type))],
      newTypes: types.filter((t) => t === "figure-pair" || String(t).indexOf("answer-grid") === 0)
    };
  });
  console.log("   " + JSON.stringify(compat));
  ok("MockSpec に layout を勝手に足さない", compat.hasLayoutField === false);
  ok("計画にプロファイル情報が混ざらない", compat.hasProfileInfo === false);
  ok("解答用紙はこれまでの作り方のまま", compat.answerBlocks.indexOf("answer-area") >= 0);
  ok("新しい部品がひとつも出てこない", compat.newTypes.length === 0, compat.newTypes.join(","));

  section("3. プロファイルを選んだとき");
  const applied = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    const spec = window.__mkSpec(8, true);
    spec.layout = Object.assign(LP.defaultLayoutSettings(), {
      layoutMode: "school-science-figure", answerSheetMode: "grid-dense", layoutSeed: "UI-TEST-1"
    });
    const lp = LP.planLayout(spec, {});
    const issues = LP.validateLayout(spec, lp);
    const plan = window.VQ2.layout.buildPlan(spec, {});
    const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
    /* 校正後は「大問ごとの枠（answer-grid-block）」で組む。
       解答欄は行の中のセルとして入るので、そこから数える。 */
    const ANSWER = ["small-box", "box-sequence", "wide-answer", "lined-answer", "merged-answer", "fixed-label"];
    const cells = sheet.blocks.filter((b) => b.type === "answer-grid-block")
      .flatMap((b) => b.rows).flatMap((r) => r.cells).filter((c) => ANSWER.indexOf(c.type) >= 0);
    const html = window.VQ2.pdfRenderer.buildHtml(spec, plan, {});
    return {
      seed: lp.seed, profile: lp.layoutProfileId, answerProfile: lp.answerSheetProfileId,
      errors: LP.errorsOf(issues).map((e) => e.code),
      margins: plan.paper.margins,
      sheetTypes: [...new Set(sheet.blocks.map((b) => b.type))],
      rowCount: cells.length,
      cellKinds: [...new Set(cells.map((c) => c.type))],
      hasSectionLabel: sheet.blocks.some((b) => b.type === "answer-grid-block" && b.sectionLabel),
      htmlHasGrid: html.indexOf("agt-sec") >= 0,
      htmlHasStudent: html.indexOf("ags-f") >= 0 && html.indexOf("氏名") >= 0,
      htmlHasTotal: html.indexOf("agtot") >= 0,
      htmlLen: html.length
    };
  });
  console.log("   " + JSON.stringify(applied));
  ok("計画に error が 0 件", applied.errors.length === 0, applied.errors.join(","));
  ok("プロファイルの余白が使われる",
    applied.margins.top === 22 && applied.margins.left === 20, JSON.stringify(applied.margins));
  ok("罫線型（可変グリッド）の解答用紙が組まれる",
    applied.sheetTypes.indexOf("answer-grid-block") >= 0 && applied.hasSectionLabel,
    applied.sheetTypes.join(","));
  ok("解答欄が 8 問ぶん", applied.rowCount === 8, String(applied.rowCount));
  ok("形式ごとに欄の種類が分かれる", applied.cellKinds.length >= 2, applied.cellKinds.join(","));
  ok("実際の HTML に罫線の表が出る", applied.htmlHasGrid);
  ok("実際の HTML に合計欄が出る", applied.htmlHasTotal);
  ok("実際の HTML に氏名欄が出る", applied.htmlHasStudent);

  section("4. Seed（同じなら同じ、違えば変わる、再生成で内容は不変）");
  const seedTest = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    const base = window.__mkSpec(6, true);
    const mk = (seed) => {
      const s = JSON.parse(JSON.stringify(base));
      s.layout = Object.assign(LP.defaultLayoutSettings(), {
        layoutMode: "school-science-figure", answerSheetMode: "grid-dense", layoutSeed: seed
      });
      return LP.planLayout(s, {});
    };
    const a = mk("SAME"), b = mk("SAME");
    const sigs = new Set();
    for (let i = 0; i < 30; i++) {
      const p = mk("S" + i);
      sigs.add(JSON.stringify([p.variants, p.sections[0].questions.map((x) => x.figureLayout)]));
    }
    const before = JSON.stringify(base.sections);
    for (let i = 0; i < 10; i++) mk("R" + i);
    return {
      same: JSON.stringify(a) === JSON.stringify(b),
      variety: sigs.size,
      contentUnchanged: JSON.stringify(base.sections) === before
    };
  });
  console.log("   " + JSON.stringify(seedTest));
  ok("同じ Seed なら同じ計画", seedTest.same);
  ok("違う Seed で見た目が変わる（30 通り試して 2 通り以上）", seedTest.variety >= 2, String(seedTest.variety));
  ok("レイアウトを作り直しても問題データは不変", seedTest.contentUnchanged);

  section("5. 設定画面（出力エンジンと紙面デザインが別の欄）");
  await pg.evaluate(() => { window.VQ2.quickMock.open({}); });
  await pg.waitForTimeout(900);
  const ui = await pg.evaluate(async () => {
    const host = document.getElementById("vq2-quick-mock");
    if (!host) return { error: "Quick Mock が開かない" };
    const root = host.shadowRoot;
    const accs = Array.from(root.querySelectorAll("[data-fold],[data-acc]"))
      .map((b) => b.getAttribute("data-fold") || b.getAttribute("data-acc"));
    const layoutAcc = root.querySelector('[data-fold="layout"]');
    if (layoutAcc) layoutAcc.click();
    await new Promise((r) => setTimeout(r, 400));
    const sel = (k) => root.querySelector('[data-key="' + k + '"]');
    const opts = (k) => sel(k) ? Array.from(sel(k).options).map((o) => o.value + "|" + o.text) : null;
    return {
      accs,
      title: Array.from(root.querySelectorAll(".vq2-wsc.is-fold .vq2-wsc-t, .vq2-acc-t strong"))
        .map((e) => e.textContent.trim()),
      engineOpts: opts("outputEngine"),
      layoutOpts: opts("layoutMode"),
      answerOpts: opts("answerSheetMode"),
      separateFields: !!sel("outputEngine") && !!sel("layoutMode") && sel("outputEngine") !== sel("layoutMode"),
      defaults: { e: sel("outputEngine") && sel("outputEngine").value,
                  l: sel("layoutMode") && sel("layoutMode").value,
                  a: sel("answerSheetMode") && sel("answerSheetMode").value }
    };
  });
  console.log("   見出し: " + JSON.stringify(ui.title));
  console.log("   エンジン: " + JSON.stringify(ui.engineOpts));
  console.log("   紙面: " + JSON.stringify(ui.layoutOpts));
  ok("「紙面デザイン」の設定欄がある", (ui.accs || []).indexOf("layout") >= 0, (ui.accs || []).join(","));
  ok("出力エンジンと紙面デザインが別の欄", ui.separateFields === true);
  ok("初期値はすべて「現在の形式」",
    ui.defaults.e === "current" && ui.defaults.l === "current" && ui.defaults.a === "current",
    JSON.stringify(ui.defaults));
  ok("Typst / TeX は「準備中」と出る",
    (ui.engineOpts || []).some((o) => /typst/.test(o) && /準備中/.test(o))
    && (ui.engineOpts || []).some((o) => /tex/.test(o) && /準備中/.test(o)),
    (ui.engineOpts || []).join(" / "));
  ok("用意できていない紙面デザインも「準備中」と出る",
    (ui.layoutOpts || []).some((o) => /school-standard/.test(o) && /準備中/.test(o)),
    (ui.layoutOpts || []).join(" / "));
  ok("用意できている「学校試験・図表重視」は準備中と書かれない",
    (ui.layoutOpts || []).some((o) => /school-science-figure\|/.test(o) && !/準備中/.test(o)),
    (ui.layoutOpts || []).filter((o) => /science/.test(o)).join(" / "));

  section("5.5 Layout Grammar V2 の設定（文書形式・教科レイアウト）");
  const lg = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-quick-mock").shadowRoot;
    const sel = (k) => root.querySelector('[data-key="' + k + '"]');
    const opts = (k) => sel(k) ? Array.from(sel(k).options).map((o) => o.value + "|" + o.text) : null;
    return {
      family: opts("documentFamily"), subject: opts("subjectLayout"),
      answerFamily: opts("answerFamilyView"),
      defaults: { f: sel("documentFamily") && sel("documentFamily").value,
                  s: sel("subjectLayout") && sel("subjectLayout").value },
      separate: !!sel("documentFamily") && !!sel("layoutMode")
        && sel("documentFamily") !== sel("layoutMode")
    };
  });
  console.log("   文書形式: " + JSON.stringify(lg.family));
  console.log("   教科: " + JSON.stringify(lg.subject));
  ok("文書形式の欄がある（8 種 + おまかせ）", (lg.family || []).length === 9, String((lg.family || []).length));
  ok("教科レイアウトの欄がある（7 種 + 自動）", (lg.subject || []).length === 8, String((lg.subject || []).length));
  ok("解答用紙ファミリーの一覧が出る（8 種）",
    (lg.answerFamily || []).length === 9, String((lg.answerFamily || []).length));
  ok("初期値はおまかせ / 自動", lg.defaults.f === "auto" && lg.defaults.s === "auto",
    JSON.stringify(lg.defaults));
  ok("文書形式と紙面デザインは別の欄", lg.separate === true);
  ok("用意できていない文書形式は「準備中」と出る",
    (lg.family || []).filter((o) => /準備中/.test(o)).length === 7,
    String((lg.family || []).filter((o) => /準備中/.test(o)).length));
  ok("用意できている school-exam-standard は準備中と書かれない",
    (lg.family || []).some((o) => /school-exam-standard\|/.test(o) && !/準備中/.test(o)),
    (lg.family || []).filter((o) => /standard/.test(o)).join(" / "));
  ok("用意できていない解答用紙ファミリーも「準備中」と出る",
    (lg.answerFamily || []).filter((o) => /準備中/.test(o)).length === 7,
    String((lg.answerFamily || []).filter((o) => /準備中/.test(o)).length));

  section("6. レイアウトだけ再生成");
  const reseed = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-quick-mock").shadowRoot;
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(root.querySelector('[data-key="layoutMode"]'), "school-science-figure");
    await new Promise((r) => setTimeout(r, 300));
    setV(root.querySelector('[data-key="answerSheetMode"]'), "grid-dense");
    await new Promise((r) => setTimeout(r, 400));
    const hasBtn = !!root.querySelector('[data-act="layout-reseed"]');
    const seedBefore = root.querySelector('[data-key="layoutSeed"]')
      ? root.querySelector('[data-key="layoutSeed"]').value : null;
    if (hasBtn) root.querySelector('[data-act="layout-reseed"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const seedAfter = root.querySelector('[data-key="layoutSeed"]')
      ? root.querySelector('[data-key="layoutSeed"]').value : null;
    const used = Array.from(root.querySelectorAll(".vq2-card")).map((e) => e.textContent.trim())
      .filter((t) => /使っている形式|図表重視|罫線型/.test(t));
    return { hasBtn, seedBefore, seedAfter, used, hasPreview: !!root.querySelector('[data-act="layout-preview"]') };
  });
  console.log("   " + JSON.stringify(reseed));
  ok("「レイアウトだけ再生成」がある", reseed.hasBtn);
  ok("押すと Seed が入る（前は空）", !reseed.seedBefore && !!reseed.seedAfter, String(reseed.seedAfter));
  ok("使っている形式を確認できる", (reseed.used || []).length >= 1, (reseed.used || []).join(" / "));
  ok("プレビューの入口がある", reseed.hasPreview);

  section("7. スマホの幅");
  const mob = await ctx.newPage();
  mob.on("pageerror", (e) => pageErrors.push("mobile: " + String(e).slice(0, 200)));
  await mob.setViewportSize({ width: 390, height: 844 });
  await login(mob);
  await mob.addScriptTag({ content: MAKE_SPEC });
  await mob.evaluate(() => { window.VQ2.quickMock.open({}); });
  await mob.waitForTimeout(900);
  const m = await mob.evaluate(async () => {
    const host = document.getElementById("vq2-quick-mock");
    const root = host.shadowRoot;
    const acc = root.querySelector('[data-fold="layout"]');
    if (acc) { acc.scrollIntoView(); acc.click(); }
    await new Promise((r) => setTimeout(r, 400));
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(root.querySelector('[data-key="layoutMode"]'), "school-science-figure");
    await new Promise((r) => setTimeout(r, 500));
    const grid = root.querySelector(".vq2-layout-grid");
    const sels = Array.from(root.querySelectorAll(".vq2-layout-grid select"));
    const btns = Array.from(root.querySelectorAll(".vq2-layout-seed-a .vq2-btn"));
    const vw = window.innerWidth;
    const r = (e) => e.getBoundingClientRect();
    return {
      vw,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : -1,
      selOut: sels.filter((s) => r(s).right > vw + 1 || r(s).left < -1).length,
      selTops: sels.map((s) => Math.round(r(s).top)),
      btnCount: btns.length,
      btnMinH: btns.length ? Math.min(...btns.map((b) => r(b).height)) : 0,
      seedBoxOut: (() => { const b = root.querySelector('[data-key="layoutSeed"]');
        return b ? (r(b).right > vw + 1 ? 1 : 0) : -1; })()
    };
  });
  console.log("   " + JSON.stringify(m));
  ok("ページが横にはみ出さない", m.docOverflow <= 0, String(m.docOverflow));
  ok("設定が縦に並ぶ（1 列）", m.gridCols === 1, String(m.gridCols));
  ok("選択欄が画面外へ出ない", m.selOut === 0, String(m.selOut));
  ok("選択欄が縦に積まれている",
    m.selTops.length >= 2 && new Set(m.selTops).size === m.selTops.length, JSON.stringify(m.selTops));
  ok("Seed の入力欄がはみ出さない", m.seedBoxOut === 0, String(m.seedBoxOut));
  ok("操作ボタンが 44px 以上", m.btnCount >= 1 && m.btnMinH >= 44, String(Math.round(m.btnMinH)));

  section("8. プレビュー（横スクロールできる）");
  const pv = await mob.evaluate(async () => {
    const root = document.getElementById("vq2-quick-mock").shadowRoot;
    /* プレビューは試験ができてから。ここでは枠だけを確かめる。 */
    const style = Array.from(root.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    return {
      hasLpvCss: /\.vq2-lpv\s*\{[^}]*overflow-x:\s*auto/.test(style),
      hasBtn: !!root.querySelector('[data-act="layout-preview"]')
    };
  });
  console.log("   " + JSON.stringify(pv));
  ok("プレビュー枠は横スクロールできる作りになっている", pv.hasLpvCss);
  ok("スマホでもプレビューの入口が出る", pv.hasBtn);

  const shot = path.join(__dirname, "artifacts", "layout-profiles");
  fs.mkdirSync(shot, { recursive: true });
  await pg.screenshot({ path: path.join(shot, "desktop.png") });
  await mob.screenshot({ path: path.join(shot, "mobile.png") });
  /* 実際に組んだ紙面も画像で残す（目で見て確かめられるように） */
  const paper = await ctx.newPage();
  await paper.setViewportSize({ width: 900, height: 1200 });
  const html = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    const spec = window.__mkSpec(10, true);
    spec.layout = Object.assign(LP.defaultLayoutSettings(), {
      layoutMode: "school-science-figure", answerSheetMode: "grid-dense", layoutSeed: "SHOT-1"
    });
    const plan = window.VQ2.layout.buildPlan(spec, {});
    return window.VQ2.pdfRenderer.buildHtml(spec, plan, {});
  });
  await paper.setContent(html, { waitUntil: "domcontentloaded" });
  await paper.waitForTimeout(600);
  await paper.screenshot({ path: path.join(shot, "paper.png"), fullPage: true });

  section("画面のエラー");
  const real = pageErrors.filter((e) => !/ResizeObserver|Non-Error promise|Firebase 連携が無効/.test(e));
  console.log(real.length ? "   " + real.slice(0, 5).join("\n   ") : "   なし");
  ok("画面のエラーが出ていない", real.length === 0, real.slice(0, 2).join(" / "));

  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.stack || e); process.exit(2); });
