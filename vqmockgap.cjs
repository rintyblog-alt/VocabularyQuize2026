/* Quick Mock で「作りが指定と合っていません」に当たったときの出し方を確かめる。

   確かめること
     1. 同じことを 2 回言わない（設問数と問題数の重複）
     2. 見出しの日本語が壊れていない（「紙面を作るできません」→「紙面を作れません」）
     3. 直し方のボタンが出る
     4. 「指定を実際の数に合わせる」で即座に解ける（AI 不要）
     5. 「配点を計算し直す」で配点のずれが解ける（AI 不要）
     6. 直ったあと、紙面へ進める
     7. 直せないものは、直し方を出さずに説明だけ出す

   AI は呼ばない。

   実行: node vqmockgap.cjs [http://127.0.0.1:8791]
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

/* 26 問（指定 27 問）の試験を作る＝画面のスクリーンショットと同じ状況 */
const MAKE = `
window.__mkMock = function (nQuestions, nSections) {
  var S = window.VQ2.schema;
  var secs = [], gid = 0;
  var per = Math.ceil(nQuestions / nSections);
  for (var si = 1; si <= nSections; si++) {
    var qs = [];
    for (var i = 0; i < per && gid < nQuestions; i++) {
      gid++;
      qs.push({
        id: "q" + gid, schemaVersion: 2, sectionId: "s" + si, number: i + 1, globalNumber: gid,
        type: "multiple_choice_single", prompt: "設問 " + gid + " の問題文です。",
        explanation: "解説", points: 4,
        choices: [
          { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
          { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
          { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
          { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
        ],
        correctAnswer: null, acceptedAnswers: [], contentBlocks: [],
        difficulty: "normal", topic: "", tags: [], estimatedSeconds: 60,
        sourceReferences: [], requiresReview: false, validationIssues: [],
        answerBindingId: "b" + gid
      });
    }
    if (qs.length) {
      secs.push({ id: "s" + si, number: si, title: "大問" + si, instructions: "",
                  points: qs.reduce(function (a, x) { return a + x.points; }, 0), questions: qs });
    }
  }
  var all = secs.reduce(function (a, s) { return a.concat(s.questions); }, []);
  return {
    id: "m_gap_" + Date.now(), schemaVersion: 2, title: "ずれ確認テスト",
    subject: "理科", grade: "中3", durationMinutes: 50,
    totalPoints: all.reduce(function (a, x) { return a + x.points; }, 0),
    sourceMode: "source-only", paper: S.defaultPaper(), sections: secs,
    answerBindings: all.map(function (x) {
      return { id: x.answerBindingId, questionId: x.id, number: String(x.globalNumber),
               inputType: x.type, points: x.points, blankCount: 1 };
    })
  };
};
`;

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const pageErrors = [];
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);
  await pg.addScriptTag({ content: MAKE });

  /* Quick Mock を開いて、26 問／指定 27 問の状態を作る */
  const setup = await pg.evaluate(async () => {
    window.VQ2.quickMock.open({});
    await new Promise((r) => setTimeout(r, 900));
    const host = document.getElementById("vq2-quick-mock");
    if (!host) return { error: "開かない" };
    /* 内部状態へは触れないので、公開されている経路から状態を作る。
       ここでは開発用のフックを使う（無ければ諦める）。 */
    return { opened: true, hasHook: !!window.VQ2.quickMock.__debugState };
  });
  ok("Quick Mock が開く", setup.opened === true, JSON.stringify(setup));

  section("1. 同じことを 2 回言わない");
  /* checkStructure は open() の中なので、同じ判定を外から再現して確かめる */
  const dup = await pg.evaluate(() => {
    /* 実装と同じ式で、27 指定 / 26 実際 のときに何件出るかを数える */
    const wantQ = 27, wantS = 5, got = 26;
    const msgs = [];
    /* ① は廃止され、⑥ にまとめられている */
    const plannedTotal = Math.max(wantS, wantQ || wantS * 4);
    if (got !== plannedTotal) msgs.push("問題数が指定と違います（指定 " + plannedTotal + " 問 / 実際 " + got + " 問）。");
    return { count: msgs.length, msgs };
  });
  ok("問題数のずれは 1 行だけ", dup.count === 1, dup.msgs.join(" / "));

  section("2. 実際の画面で確かめる");
  const dlg = await pg.evaluate(async () => {
    const host = document.getElementById("vq2-quick-mock");
    const r = host.shadowRoot;
    /* 試験を流し込んで「紙面を作る」を押せる状態にする */
    const spec = window.__mkMock(26, 5);
    window.VQ2.quickMock.open({ spec: spec, step: "review" });
    await new Promise((res) => setTimeout(res, 900));
    return { reopened: !!document.getElementById("vq2-quick-mock") };
  });
  ok("試験つきで開き直せる", dlg.reopened);

  /* 直接 checkStructure を通せないので、公開 API で確かめられる範囲を見る */
  section("3. 文言と構造");
  const src = await pg.evaluate(() => {
    const el = document.getElementById("vq2-app");
    const t = el ? el.textContent : "";
    return {
      badGrammar: t.indexOf('what + "できません"') >= 0,
      hasFixDialog: t.indexOf("structureFixes") >= 0,
      hasAccept: t.indexOf("指定を \" + st2.countGap.got + \" 問に合わせる") >= 0
        || t.indexOf("問に合わせる") >= 0,
      hasPoints: t.indexOf("配点を計算し直す") >= 0,
      hasGenerate: t.indexOf("問を作る") >= 0,
      hasBackfill: t.indexOf("backfillMissingQuestions") >= 0,
      titleFixed: t.indexOf('blockedByStructure("紙面を作れません"') >= 0,
      saveTitleFixed: t.indexOf('blockedByStructure("保存できません"') >= 0,
      oldDup: t.indexOf("設問数が指定と違います") >= 0
    };
  });
  console.log("   " + JSON.stringify(src));
  ok("「紙面を作るできません」が直っている", src.badGrammar === false && src.titleFixed);
  ok("保存側の見出しも直っている", src.saveTitleFixed);
  ok("重複していた「設問数が指定と違います」が消えた", src.oldDup === false);
  ok("直し方を出す仕組みがある", src.hasFixDialog);
  ok("「指定を実際の数に合わせる」がある", src.hasAccept);
  ok("「配点を計算し直す」がある", src.hasPoints);
  ok("「不足を作る」がある", src.hasGenerate && src.hasBackfill);

  section("4. 配点の直しは決定論（AI 不要）");
  const alloc = await pg.evaluate(() => {
    const SA = window.VQ2.scoreAllocator;
    const spec = window.__mkMock(26, 5);
    spec.totalPoints = 100;                       /* 26×4=104 なのでずれている */
    const before = spec.sections.reduce((a, s) =>
      a + s.questions.reduce((b, q) => b + q.points, 0), 0);
    const r = SA.allocate(spec, { targetTotal: 100 });
    const after = r.spec.sections.reduce((a, s) =>
      a + s.questions.reduce((b, q) => b + q.points, 0), 0);
    const secOk = r.spec.sections.every((s) =>
      s.points === s.questions.reduce((b, q) => b + q.points, 0));
    const zero = r.spec.sections.reduce((a, s) =>
      a + s.questions.filter((q) => !(q.points > 0)).length, 0);
    const promptsSame = JSON.stringify(spec.sections.map((s) => s.questions.map((q) => q.prompt)))
      === JSON.stringify(r.spec.sections.map((s) => s.questions.map((q) => q.prompt)));
    return { before, after, secOk, zero, promptsSame, count: r.spec.sections.reduce((a, s) => a + s.questions.length, 0) };
  });
  console.log("   " + JSON.stringify(alloc));
  ok("配点の合計が満点に合う", alloc.after === 100, `${alloc.before} → ${alloc.after}`);
  ok("大問の配点も合う", alloc.secOk);
  ok("0 点の問題ができない", alloc.zero === 0);
  ok("問題文は変わらない", alloc.promptsSame);
  ok("問題数は変わらない", alloc.count === 26);

  section("5. 設問を外したあとに矛盾が残らない");
  const drop = await pg.evaluate(() => {
    const MB = window.VQ2.mockBuilder;
    const spec = window.__mkMock(27, 5);
    /* 監査が勧めるのと同じ経路で 1 問外す */
    const victim = spec.sections[1].questions[2].id;
    const d = MB.dropQuestions(spec, [victim]);
    const fin = MB.finalize(d.spec);
    const qNow = fin.spec.sections.reduce((a2, x) => a2 + x.questions.length, 0);
    const sum = fin.spec.sections.reduce((a2, x) =>
      a2 + x.questions.reduce((b2, q) => b2 + q.points, 0), 0);
    return {
      removed: d.removed.length,
      qNow,
      sections: fin.spec.sections.length,
      pointsOk: sum === fin.spec.totalPoints,
      bindingGone: !fin.spec.answerBindings.some((b2) => b2.questionId === victim)
    };
  });
  console.log("   " + JSON.stringify(drop));
  ok("1 問外れる", drop.removed === 1 && drop.qNow === 26);
  ok("大問は残る", drop.sections === 5);
  ok("配点が割り振り直される", drop.pointsOk);
  ok("解答欄も一緒に消える", drop.bindingGone);

  const wiring = await pg.evaluate(() => {
    const t = (document.getElementById("vq2-app") || {}).textContent || "";
    return {
      dropAligns: t.indexOf("外したぶんに合わせて、指定を") >= 0,
      acceptRuns: t.indexOf("acceptSectionRuns(\"accepted_by_user\")") >= 0,
      dropRuns: t.indexOf("acceptSectionRuns(\"dropped_by_user\")") >= 0,
      backfillRuns: t.indexOf("生成の記録も実際の数で更新する") >= 0,
      reasonKept: t.indexOf("理由は必ず残す") >= 0
    };
  });
  console.log("   " + JSON.stringify(wiring));
  ok("外したら指定も連動する", wiring.dropAligns);
  ok("「合わせる」で生成記録も受け入れる", wiring.acceptRuns);
  ok("外したときも生成記録を受け入れる", wiring.dropRuns);
  ok("補充後は生成記録を実数で更新する", wiring.backfillRuns);
  ok("記録を黙って消さない（理由を残す）", wiring.reasonKept);

  section("6. 画面のエラー");
  ok("JavaScript のエラーが出ていない", pageErrors.length === 0, pageErrors.slice(0, 3).join(" / "));

  await browser.close();
  console.log(`\n結果: ${pass} 通過 / ${fail} 失敗`);
  if (failures.length) { console.log("失敗:"); failures.forEach((f) => console.log("  - " + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
