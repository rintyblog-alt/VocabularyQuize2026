/* 画面のスクリーンショットを撮る（Before / After の比較用）。

   実行: node vqshot.cjs <出力先ディレクトリ>
   例:   node vqshot.cjs shots/before
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = process.argv[2] || "shots/tmp";
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
fs.mkdirSync(OUT, { recursive: true });

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

async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 20000 });
}

async function shot(pg, name) {
  const p = path.join(OUT, name + ".png");
  await pg.screenshot({ path: p });
  console.log("  " + p);
}

(async () => {
  const browser = await chromium.launch();

  /* ── デスクトップ ── */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await login(pg);

  console.log("デスクトップ 1440x900");
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    window.VQ2.open.presetStudio({});
  });
  await waitHost(pg, "vq2-preset-studio");
  await pg.waitForTimeout(500);
  await shot(pg, "desktop-preset");

  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.quickMock.open({});
  });
  await waitHost(pg, "vq2-quick-mock");
  await pg.waitForTimeout(500);
  await shot(pg, "desktop-mock");

  /* 中身が入った状態（問題・検証・成果物のタブ） */
  await pg.addScriptTag({ content: MAKE_SPEC });
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    /* 保存してから id で開く（画面が読むのは保存済みの試験） */
    const spec = window.__mkSpec(12, true);
    const saved = window.VQ2.store.mocks.put({ id: spec.id, spec: spec, title: spec.title });
    window.VQ2.quickMock.open({ mockId: (saved && saved.mock ? saved.mock.id : spec.id) });
  });
  await waitHost(pg, "vq2-quick-mock");
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    const r = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
    const t = r.querySelector('[data-act="qm-tab"][data-tab="questions"]');
    if (t) t.click();
  });
  await pg.waitForTimeout(400);
  await shot(pg, "desktop-mock-questions");

  await pg.evaluate(() => {
    const r = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
    const t = r.querySelector('[data-act="qm-tab"][data-tab="verify"]');
    if (t) t.click();
  });
  await pg.waitForTimeout(400);
  await shot(pg, "desktop-mock-verify");

  await ctx.close();

  /* ── モバイル ── */
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true
  });
  const mp = await mctx.newPage();
  await login(mp);

  console.log("モバイル 390x844");
  await mp.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    window.VQ2.open.presetStudio({});
  });
  await waitHost(mp, "vq2-preset-studio");
  await mp.waitForTimeout(500);
  await shot(mp, "mobile-preset");

  await mp.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.quickMock.open({});
  });
  await waitHost(mp, "vq2-quick-mock");
  await mp.waitForTimeout(500);
  await shot(mp, "mobile-mock");

  await browser.close();
  console.log("完了");
})().catch((e) => { console.error(e); process.exit(1); });
