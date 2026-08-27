/* 検証エラーの AI 修復を **実ブラウザ** で確かめる。

   確かめること
     1. 出荷するコードに repair 層が入っている
     2. 検証タブが error / warning / info に分かれて出る
     3. 各項目に「問題番号・ID・コード・説明・該当部分・修復可否」が出る
     4. 4 つの操作（この問題／選択／すべて／不足補充）が出る
     5. AI を呼ばずに直せるもの（ID 再発行・番号）が直る
     6. 対象外の問題を変える提案は拒否される
     7. 保存の可否はこれまでどおり（新しい指摘で保存が止まらない）
     8. スマホ幅ではみ出さない

   AI は呼ばない（見たいのは配線と判定）。

   実行: node vqrepair.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");

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

/* エラーを仕込んだプリセットをブラウザの中で作る */
const MAKE = `
window.__mkBadPreset = function () {
  function mk(i, over) {
    var q = {
      id: "q_" + i, schemaVersion: 2, questionNumber: i,
      type: "multiple_choice_single",
      prompt: "設問 " + i + " の問題文です。",
      explanation: "設問 " + i + " の解説です。理由をここに書きます。",
      points: 1,
      choices: [
        { id: "c1", label: "A", text: "選択肢一" + i, explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢二" + i, explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢三" + i, explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢四" + i, explanation: "", isCorrect: false }
      ],
      correctAnswer: null, acceptedAnswers: [], contentBlocks: [],
      difficulty: "normal", topic: "単元" + i, tags: [], estimatedSeconds: 60,
      sourceReferences: [], requiresReview: false, validationIssues: []
    };
    return Object.assign(q, over || {});
  }
  var qs = [
    mk(1),
    mk(2, { explanation: "" }),                                  /* info */
    mk(3, { prompt: "この学习について説明しなさい。" }),          /* error: 外国語 */
    mk(4, { choices: [
      { id: "c1", text: "あ", isCorrect: true },
      { id: "c2", text: "い", isCorrect: true },
      { id: "c3", text: "う", isCorrect: false },
      { id: "c4", text: "え", isCorrect: false }
    ] }),                                                        /* error: 正解が複数 */
    mk(5, { questionNumber: null }),                             /* warning: 番号なし */
    mk(6, { choices: [
      { id: "c1", text: "", isCorrect: true },
      { id: "c2", text: "い", isCorrect: false },
      { id: "c3", text: "う", isCorrect: false },
      { id: "c4", text: "え", isCorrect: false }
    ] })                                                         /* error: 手で直すしかない */
  ];
  qs[4].id = "q_1";                                              /* error: ID 重複 */
  return {
    id: "p_repair_" + Date.now(), schemaVersion: 2,
    name: "修復テスト", description: "範囲：第1章",
    ownerId: "local", createdAt: new Date().toISOString(), createdBy: "local",
    visibility: "private", questions: qs
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
  await pg.addScriptTag({ content: MAKE });

  section("1. 出荷するコードに入っているか");
  const api = await pg.evaluate(() => {
    const R = window.VQ2 && window.VQ2.repair;
    return {
      exists: !!R,
      codes: R ? R.CODE_IDS.length : 0,
      maxRounds: R ? R.MAX_ROUNDS : 0,
      hasAiRepair: !!(window.VQ2.ai && window.VQ2.ai.repairPreset),
      hasBackfill: !!(window.VQ2.ai && window.VQ2.ai.backfillPreset)
    };
  });
  console.log("   " + JSON.stringify(api));
  ok("repair 層が入っている", api.exists);
  ok("エラーコードが 14 種ある", api.codes === 14, String(api.codes));
  ok("修復ループは最大 3 回", api.maxRounds === 3);
  ok("AI の修復呼び出しがある", api.hasAiRepair);
  ok("AI の補充呼び出しがある", api.hasBackfill);

  section("2. 検証が分類される");
  const audit = await pg.evaluate(() => {
    const R = window.VQ2.repair;
    const p = window.__mkBadPreset();
    const issues = R.auditPreset(p, { expectedCount: 8 });
    return {
      errors: R.bySeverity(issues, "error").map((i) => i.code),
      warnings: R.bySeverity(issues, "warning").map((i) => i.code),
      infos: R.bySeverity(issues, "info").map((i) => i.code),
      repairable: R.repairableIssues(issues).length,
      total: issues.length
    };
  });
  console.log("   " + JSON.stringify(audit));
  ok("外国語の混入が error", audit.errors.includes("foreign_character_mixed"));
  ok("正解が複数が error", audit.errors.includes("multiple_correct_choices"));
  ok("ID 重複が error", audit.errors.includes("duplicate_question_id"));
  ok("番号なしが warning", audit.warnings.includes("missing_question_number"));
  ok("問題数不足が warning", audit.warnings.includes("question_count_shortage"));
  ok("解説なしが info", audit.infos.includes("missing_explanation"));
  ok("直せる項目が数えられる", audit.repairable >= 5, String(audit.repairable));

  section("3. AI を呼ばずに直る");
  const auto = await pg.evaluate(() => {
    const R = window.VQ2.repair;
    const p = window.__mkBadPreset();
    const before = p.questions.map((q) => q.prompt);
    const issues = R.auditPreset(p, {});
    const r = R.autoRepair(p, issues);
    const after = R.auditPreset(r.preset, {});
    return {
      changed: r.changed,
      kinds: [...new Set(r.changes.map((c) => c.kind))],
      idsUnique: new Set(r.preset.questions.map((q) => q.id)).size === 6,
      numbersUnique: new Set(r.preset.questions.map((q) => q.questionNumber)).size === 6,
      promptsSame: JSON.stringify(r.preset.questions.map((q) => q.prompt)) === JSON.stringify(before),
      dupIdGone: after.filter((i) => i.code === "duplicate_question_id").length === 0,
      originalUntouched: new Set(p.questions.map((q) => q.id)).size === 5
    };
  });
  console.log("   " + JSON.stringify(auto));
  ok("直った", auto.changed);
  ok("内部 ID が別々になる", auto.idsUnique);
  ok("番号が別々になる", auto.numbersUnique);
  ok("問題文は 1 文字も変わらない", auto.promptsSame);
  ok("再検証で ID 重複が消える", auto.dupIdGone);
  ok("元データは変わらない", auto.originalUntouched);

  section("4. 対象外の変更を拒否する");
  const guard = await pg.evaluate(() => {
    const R = window.VQ2.repair;
    const p = window.__mkBadPreset();
    const issues = R.auditPreset(p, {}).filter((i) => i.code === "multiple_correct_choices");
    const req = R.buildRepairRequest(p, issues);
    const five = (c) => [
      { id: "c1", text: "あ", isCorrect: !!c }, { id: "c2", text: "い", isCorrect: false },
      { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }
    ];
    const r = R.screenRepairProposal(p, req, [
      { sourceId: "q_4", choices: five(true) },
      { sourceId: "q_2", choices: five(true) },
      { sourceId: "q_4", choices: five(true), questionNumber: 99 }
    ]);
    return {
      target: req.questionIds,
      accepted: r.accepted.length,
      rejectReasons: r.rejected.map((x) => x.reason)
    };
  });
  console.log("   " + JSON.stringify(guard));
  ok("対象は 1 問だけ", guard.target.length === 1 && guard.target[0] === "q_4");
  ok("対象外の提案は落ちる", guard.rejectReasons.includes("outOfScope"));
  ok("番号を書き換える提案は落ちる", guard.rejectReasons.includes("protectedField"));
  ok("正しい提案だけ残る", guard.accepted === 1, String(guard.accepted));

  section("5. 画面に検証タブが出る");
  const opened = await pg.evaluate(async () => {
    window.VQ2.presetStudio.open({ preset: window.__mkBadPreset() });
    await new Promise((r) => setTimeout(r, 900));
    const host = document.getElementById("vq2-preset-studio");
    return !!(host && host.shadowRoot);
  });
  ok("プリセット編集が開く", opened);

  const panel = await pg.evaluate(async () => {
    const r = document.getElementById("vq2-preset-studio").shadowRoot;
    const tab = r.querySelector('[data-act="ws-tab"][data-tab="verify"]');
    if (tab) tab.click();
    await new Promise((res) => setTimeout(res, 600));
    const txt = r.textContent || "";
    return {
      hasSummary: /要修正|確認|参考/.test(txt),
      hasChecks: r.querySelectorAll("[data-issue]").length,
      hasRepairAll: !!r.querySelector('[data-act="repair-all"]'),
      hasRepairSelected: !!r.querySelector('[data-act="repair-selected"]'),
      hasRepairQuestion: r.querySelectorAll('[data-act="repair-question"]').length,
      hasJump: r.querySelectorAll('[data-act="issue-jump"]').length,
      hasRevalidate: !!r.querySelector('[data-act="revalidate"]'),
      showsCode: txt.indexOf("foreign_character_mixed") >= 0,
      showsAiOk: txt.indexOf("AI 修復可") >= 0,
      showsManual: txt.indexOf("手で直す") >= 0,
      showsQuestionId: txt.indexOf("問題 ID") >= 0
    };
  });
  console.log("   " + JSON.stringify(panel));
  ok("集計が出る", panel.hasSummary);
  ok("項目を選べる", panel.hasChecks >= 5, String(panel.hasChecks));
  ok("「すべて修復」がある", panel.hasRepairAll);
  ok("「選んだ項目を修復」がある", panel.hasRepairSelected);
  ok("「この問題を修復」がある", panel.hasRepairQuestion > 0, String(panel.hasRepairQuestion));
  ok("「この問題を見る」がある", panel.hasJump > 0, String(panel.hasJump));
  ok("再検証がある", panel.hasRevalidate);
  ok("エラーコードが出る", panel.showsCode);
  ok("AI で直せるかが出る", panel.showsAiOk);
  ok("手で直すものが出る", panel.showsManual);
  ok("対象問題 ID が出る", panel.showsQuestionId);

  section("6. 選ぶと「選んだ項目」の数が変わる");
  const sel = await pg.evaluate(async () => {
    const r = document.getElementById("vq2-preset-studio").shadowRoot;
    const box = r.querySelector("[data-issue]");
    box.click();
    await new Promise((res) => setTimeout(res, 400));
    const b = r.querySelector('[data-act="repair-selected"]');
    return { label: b ? b.textContent.trim() : "", disabled: b ? b.disabled : true };
  });
  console.log("   " + JSON.stringify(sel));
  ok("選ぶと数が入る", sel.label.indexOf("（1）") >= 0, sel.label);
  ok("選ぶと押せるようになる", sel.disabled === false);

  section("7. 保存の可否はこれまでどおり");
  const save = await pg.evaluate(() => {
    const V = window.VQ2.validate, R = window.VQ2.repair;
    const p = window.__mkBadPreset();
    /* 外国語混入だけのプリセット（従来の検証では error ゼロ） */
    const clean = JSON.parse(JSON.stringify(p));
    clean.questions = [clean.questions[0], clean.questions[2]];
    clean.questions[1].id = "q_9";
    clean.questions[1].questionNumber = 2;
    return {
      oldErrors: V.errorsOf(V.validatePresetForSave(clean, {})).length,
      newErrors: R.bySeverity(R.auditPreset(clean, {}), "error").length
    };
  });
  console.log("   " + JSON.stringify(save));
  ok("従来の検証ではエラー 0（保存できる）", save.oldErrors === 0, String(save.oldErrors));
  ok("新しい検証では指摘が出る（見せるだけ）", save.newErrors > 0, String(save.newErrors));

  section("8. 不足問題の補充");
  const back = await pg.evaluate(() => {
    const R = window.VQ2.repair;
    const p = window.__mkBadPreset();
    const plan = R.shortagePlan(p, { expectedCount: 8 });
    const req = R.buildBackfillRequest(p, plan, {});
    return { missing: plan.missing, gaps: plan.gaps, count: req.count,
             keepsExisting: req.instruction.indexOf("既存の問題は 1 問も変えない") >= 0,
             hasTopics: req.instruction.indexOf("単元1") >= 0 };
  });
  console.log("   " + JSON.stringify(back));
  ok("不足数が出る", back.missing === 2, String(back.missing));
  ok("補充する数が不足数と同じ", back.count === 2, String(back.count));
  ok("既存を変えない指示が入る", back.keepsExisting);
  ok("既存の論点を渡す", back.hasTopics);

  section("9. スマホ幅");
  await pg.setViewportSize({ width: 390, height: 780 });
  await pg.waitForTimeout(700);
  const mob = await pg.evaluate(() => {
    const r = document.getElementById("vq2-preset-studio").shadowRoot;
    const root = r.querySelector(".vq2-root");
    const w = root ? root.getBoundingClientRect().width : 0;
    let over = 0, small = 0, btns = 0;
    r.querySelectorAll('[data-act^="repair-"], [data-act="issue-jump"]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width > w + 2) over++;
      btns++;
      if (b.height > 0 && b.height < 28) small++;
    });
    return { w, over, small, btns };
  });
  console.log("   " + JSON.stringify(mob));
  ok("横にはみ出さない", mob.over === 0, `はみ出し ${mob.over} 件`);
  ok("ボタンが潰れていない", mob.small === 0, `${mob.btns} 個中 ${mob.small} 個`);

  section("10. 画面のエラー");
  ok("JavaScript のエラーが出ていない", pageErrors.length === 0, pageErrors.slice(0, 3).join(" / "));

  await browser.close();
  console.log(`\n結果: ${pass} 通過 / ${fail} 失敗`);
  if (failures.length) { console.log("失敗:"); failures.forEach((f) => console.log("  - " + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
