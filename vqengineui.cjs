/* Quick Mock の画面から、TeX と Typst が本当に使えるかを確かめる。

   「エンジンの名前が選択肢に並んでいる」だけでは足りない。
   選んで → ソースを作って → PDF ができるところまでを、画面の操作で通す。

   併せて「要修正があっても保存でき、紙面も作れる」ことも見る。

   実行: node vqengineui.cjs
*/
const { chromium } = require("playwright");
const URL = "http://127.0.0.1:8791/?vqdev=1&vq2=all";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
let pass = 0, fail = 0; const log = [];
function ok(n, c, e) {
  if (c) { pass++; log.push("  ✓ " + n + (e ? " — " + e : "")); }
  else { fail++; log.push("  ✗ " + n + (e ? "\n      → " + e : "")); }
}
const sh = (pg, js) => pg.evaluate(new Function("return (async()=>{const root=document.getElementById('vq2-quick-mock').shadowRoot;" + js + "})()"));

/* わざと要修正を含む試験（正解が無い・配点が合わない）。 */
function brokenSpec() {
  return {
    id: "eng-" + Date.now(), schemaVersion: 2, title: "エンジン確認テスト",
    subject: "日本史", grade: "H3", durationMinutes: 50, totalPoints: 100,
    sourceMode: "free", instructions: "解答は解答用紙に記入すること。",
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: 10, questions: [
      { id: "q1", schemaVersion: 2, sectionId: "s1", number: 1, type: "multiple_choice_single",
        prompt: "大化の改新が始まった年を選びなさい。", explanation: "", points: 5,
        choices: [{ id: "c1", label: "A", text: "645年", explanation: "", isCorrect: false },
                  { id: "c2", label: "B", text: "701年", explanation: "", isCorrect: false }],
        correctAnswer: null, acceptedAnswers: [], contentBlocks: [], difficulty: "normal",
        topic: "", tags: [], estimatedSeconds: 60, sourceReferences: [], requiresReview: false,
        validationIssues: [], answerBindingId: "b1" },
      { id: "q2", schemaVersion: 2, sectionId: "s1", number: 2, type: "short_answer",
        prompt: "三世一身法が出された年を答えなさい。", explanation: "", points: 5,
        choices: [], correctAnswer: "", acceptedAnswers: [], contentBlocks: [],
        difficulty: "normal", topic: "", tags: [], estimatedSeconds: 60, sourceReferences: [],
        requiresReview: false, validationIssues: [], answerBindingId: "b2" }
    ] }],
    answerBindings: [
      { id: "b1", questionId: "q1", number: "1", inputType: "multiple_choice_single", points: 5, blankCount: 1 },
      { id: "b2", questionId: "q2", number: "2", inputType: "short_answer", points: 5, blankCount: 1 }
    ]
  };
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "engui");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
  /* わざと要修正を含む試験を保存し、その id で Quick Mock を開く（AI を使わない）。 */
  await pg.evaluate((spec) => {
    window.VQ2.store.mocks.put({ id: spec.id, spec: spec, updatedAt: Date.now() });
    window.__engSpecId = spec.id;
  }, brokenSpec());
  await pg.evaluate(() => window.VQ2.quickMock.open({ mockId: window.__engSpecId }));
  await pg.waitForFunction(() => !!document.getElementById("vq2-quick-mock"), { timeout: 20000 });
  await pg.waitForTimeout(1200);

  console.log("\n══ 出力エンジンが画面から選べるか ══");
  const opts = await sh(pg, `
    const setup = root.querySelector('[data-step="setup"]');
    if (setup) setup.click();
    await new Promise(r=>setTimeout(r,500));
    const lay = root.querySelector('[data-fold="layout"]');
    if (lay && lay.getAttribute("aria-expanded") !== "true") lay.click();
    await new Promise(r=>setTimeout(r,400));
    const sel = root.querySelector('select[data-key="outputEngine"]');
    return sel ? [...sel.options].map(o => o.value + "|" + o.text.trim()) : [];`);
  console.log("  " + JSON.stringify(opts));
  ok("出力エンジンに TeX がある", opts.some((o) => o.indexOf("tex|") === 0), opts.join(" / "));
  ok("出力エンジンに Typst がある", opts.some((o) => o.indexOf("typst|") === 0));

  /* TeX を選ぶと専用の欄が出て、capability を聞きに行く。 */
  const texPanel = await sh(pg, `
    const sel = root.querySelector('select[data-key="outputEngine"]');
    if (!sel) return { err: "エンジンの欄が無い" };
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(sel,"tex");
    sel.dispatchEvent(new Event("change",{bubbles:true}));
    await new Promise(r=>setTimeout(r,1500));
    const txt = root.textContent || "";
    return {
      hasPanel: txt.indexOf("TeX（upLaTeX）で PDF を作る") >= 0,
      hasVertical: !!root.querySelector('select[data-key="texVertical"]'),
      srcBtn: !!root.querySelector('[data-act="tex-source"]'),
      compileBtn: !!root.querySelector('[data-act="tex-compile"]'),
      says: txt.indexOf("使えます") >= 0 ? "使えます" : (txt.indexOf("準備中") >= 0 ? "準備中" : "?")
    };`);
  console.log("  " + JSON.stringify(texPanel));
  ok("TeX を選ぶと専用の欄が出る", texPanel.hasPanel);
  ok("縦書きが選べる", texPanel.hasVertical);
  ok("TeX ソースを作るボタンがある", texPanel.srcBtn);
  ok("PDF を作るボタンがある", texPanel.compileBtn);
  ok("この端末で使えると出る", texPanel.says === "使えます", texPanel.says);

  /* ── 実際に組めるところまで ── */
  console.log("\n══ 画面の操作だけで PDF まで出るか ══");
  for (const [dir, label] of [["horizontal", "横書き"], ["vertical", "縦書き"]]) {
    const r = await sh(pg, `
      const v = root.querySelector('select[data-key="texVertical"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(v, ${JSON.stringify(dir)});
      v.dispatchEvent(new Event("change",{bubbles:true}));
      await new Promise(r=>setTimeout(r,400));
      root.querySelector('[data-act="tex-source"]').click();
      await new Promise(r=>setTimeout(r,600));
      const btn = root.querySelector('[data-act="tex-compile"]');
      const disabled = btn.disabled || btn.getAttribute("aria-disabled") === "true";
      if (!disabled) btn.click();
      for (let i=0; i<60; i++) {
        await new Promise(r=>setTimeout(r,500));
        const t = root.textContent || "";
        if (t.indexOf("できました") >= 0 || t.indexOf("作れませんでした") >= 0
            || t.indexOf("通信できませんでした") >= 0) break;
      }
      const txt = root.textContent || "";
      return { disabled,
               made: txt.indexOf("問題冊子（") >= 0,
               done: txt.indexOf("できました") >= 0,
               pages: (txt.match(/できました（(\\d+) ページ）/) || [])[1] || "0" };`);
    console.log(`  ${label}: ソース ${r.made ? "作れた" : "作れず"} / 組版 ${r.done ? "OK" : "NG"} / ${r.pages} ページ`);
    ok(`${label}：TeX ソースが画面から作れる`, r.made);
    ok(`${label}：PDF ボタンが押せる`, r.disabled === false);
    ok(`${label}：画面から PDF まで出る`, r.done && Number(r.pages) > 0, r.pages + " ページ");
  }

  /* ── 要修正があっても保存でき、紙面も作れるか ── */
  console.log("\n══ 要修正を残したまま進めるか ══");
  const saved = await sh(pg, `
    const btn = [...root.querySelectorAll("button")].find(b => /保存/.test(b.textContent));
    if (!btn) return { err: "保存ボタンが見つからない" };
    btn.click();
    await new Promise(r=>setTimeout(r,900));
    /* document.body.textContent は <script> の中身まで拾う（＝ソースのコメントに
       当たって、いつでも「保存できません」が見つかる）。**見えている物だけ**を見る。 */
    const seen = [...document.querySelectorAll(".vq2-dialog, .vq2-alert, .vq2-toast, [role=dialog], [role=alert]")]
      .map(e => e.textContent || "").join(" ");
    const txt = seen + " " + (root.textContent || "");
    return { blocked: txt.indexOf("保存できません") >= 0,
             savedWithIssues: /要修正 \\d+ 件を残したまま保存しました/.test(txt) };`);
  console.log("  " + JSON.stringify(saved));
  ok("要修正があっても保存を断らない", saved.blocked === false);
  ok("残っている件数を伝えたうえで保存する", saved.savedWithIssues === true);

  const rec = await pg.evaluate((id) => {
    const r = window.VQ2.store.mocks.get(id);
    return { has: !!r, requiresReview: !!(r && r.requiresReview),
             issues: (r && r.openIssues || []).length };
  }, await pg.evaluate(() => window.__engSpecId));
  console.log("  " + JSON.stringify(rec));
  ok("保存物に「要確認」の印が残る", rec.requiresReview === true);
  ok("残っている指摘も一緒に保存される", rec.issues > 0, String(rec.issues));

  const paper = await sh(pg, `
    const p = [...root.querySelectorAll('[data-act="artifacts"]')][0]
      || [...root.querySelectorAll("button")].find(b => /紙面を作る/.test(b.textContent));
    if (!p) return { err: "紙面のボタンが見つからない" };
    p.click();
    await new Promise(r=>setTimeout(r,2500));
    const txt = root.textContent || "";
    return { blocked: txt.indexOf("紙面を作れません") >= 0,
             notice: /要修正 \\d+ 件を残したまま組んでいます/.test(txt) };`);
  console.log("  " + JSON.stringify(paper));
  ok("要修正があっても紙面を断らない", paper.blocked === false);
  ok("残したまま組んだことを紙面の画面に出す", paper.notice === true);

  ok("JavaScript のエラーが出ていない", errs.length === 0, errs.join(" / "));
  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
