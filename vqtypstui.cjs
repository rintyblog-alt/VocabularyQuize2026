/* Typst Renderer を **実ブラウザ** で確かめる。

   確かめること
     1. 出荷するコードに Typst Renderer が入っている
     2. Typst は「準備中」のまま（実行環境が無いのに使えるふりをしない）
     3. 出力エンジンで Typst を選ぶと専用の欄が出る
     4. ブラウザの中で Typst ソースを作れて、中身を見られる
     5. 未対応の形式は断る（黙って別の形にしない）
     6. current 経路（未選択）は今までどおり
     7. スマホ幅ではみ出さない

   AI は使わない。Typst のコンパイルもしない（この端末には入っていない）。

   実行: node vqtypstui.cjs [http://127.0.0.1:8791]
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

/* 試験の見本をブラウザの中で作る（AI を使わない） */
const MAKE_SPEC = `
window.__mkTypstSpec = function () {
  var S = window.VQ2.schema;
  var svg = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#eee"/><text x="14" y="76" font-size="18">図</text></svg>');
  function mk(i, over) {
    var q = {
      id: "q" + i, schemaVersion: 2, sectionId: "s1", number: i,
      type: "multiple_choice_single", prompt: "設問 " + i + " の問題文です。",
      explanation: "解説", points: 5,
      choices: [
        { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
        { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false },
        { id: "c3", label: "C", text: "選択肢3", explanation: "", isCorrect: false },
        { id: "c4", label: "D", text: "選択肢4", explanation: "", isCorrect: false }
      ],
      correctAnswer: null, acceptedAnswers: [], contentBlocks: [],
      difficulty: "normal", topic: "", tags: [], estimatedSeconds: 60,
      sourceReferences: [], requiresReview: false, validationIssues: [],
      answerBindingId: "b" + i
    };
    return Object.assign(q, over || {});
  }
  var qs = [
    mk(1, { prompt: "図1のアの名前を答えなさい。", type: "short_answer", choices: [],
            correctAnswer: "葉緑体", points: 4,
            contentBlocks: [{ type: "figure", src: svg, caption: "図1 断面" }] }),
    mk(2),
    mk(3, { prompt: "理由を 40 字以内で説明しなさい。", type: "long_answer", choices: [],
            correctAnswer: "光が強いほど吸収量が増える。", points: 8 }),
    mk(4, { prompt: "特殊文字 # [ ] { } \\\\ \\" を含む問題文です。", type: "short_answer",
            choices: [], correctAnswer: "答え", points: 4 })
  ];
  var total = qs.reduce(function (a, x) { return a + x.points; }, 0);
  return {
    id: "m_typst_ui_" + Date.now(), schemaVersion: 2, title: "Typst 確認テスト",
    subject: "理科", grade: "中3", durationMinutes: 50, totalPoints: total,
    sourceMode: "source-only", instructions: "解答は解答用紙に記入すること。",
    paper: S.defaultPaper(),
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: total, questions: qs }],
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
    const V = window.VQ2;
    const TS = V && V.typstResolver, TR = V && V.typstRenderer, E = V && V.typstEscape;
    return {
      escape: !!E, resolver: !!TS, renderer: !!TR, library: !!(V && V.typstLibrary),
      libraryBytes: V && V.typstLibrary ? V.typstLibrary.source.length : 0,
      blocks: TS ? TS.SUPPORTED_BLOCKS.length : 0,
      cells: TS ? TS.SUPPORTED_CELLS.length : 0,
      unsupported: TS ? TS.capability().unsupportedBlocks.length : 0,
      features: TS ? TS.capability().features : null
    };
  });
  console.log("   " + JSON.stringify(api));
  ok("エスケープ層が入っている", api.escape);
  ok("Typst 専用 Resolver が入っている", api.resolver);
  ok("Typst Renderer が入っている", api.renderer);
  ok("Typst ライブラリ（.typ の写し）が入っている", api.library && api.libraryBytes > 20000,
     api.libraryBytes + " バイト");
  ok("専用に組めるブロックは 10 種", api.blocks === 10, String(api.blocks));
  ok("解答用紙のセルは 13 種", api.cells === 13, String(api.cells));
  ok("まだ組めないブロックは 15 種と正直に出す", api.unsupported === 15, String(api.unsupported));
  ok("縦書きは未実装と明示している", api.features && api.features.verticalWriting === false);
  ok("数式の本組みは未実装と明示している", api.features && api.features.realMath === false);

  section("2. Typst は準備中のまま（使えるふりをしない）");
  const st0 = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    return {
      typst: LP.engineStatus().typst,
      cap: LP.engineCapability("typst")
    };
  });
  console.log("   " + JSON.stringify(st0));
  ok("既定では使えない", st0.typst.available === false);
  ok("理由が日本語で出る", /[ぁ-んァ-ン一-龥]/.test(st0.typst.note), st0.typst.note);

  const gate = await pg.evaluate(() => {
    const LP = window.VQ2.layoutProfiles;
    /* 実行環境はあるが検証が通っていない状態 */
    LP.setEngineCapability("typst", { available: true, version: "0.13.1", verified: false });
    const a = LP.engineStatus().typst.available;
    /* コンパイルと検証まで通った状態 */
    LP.setEngineCapability("typst", { available: true, version: "0.13.1", verified: true });
    const b = LP.engineStatus().typst.available;
    /* 元に戻す */
    LP.setEngineCapability("typst", { available: false, reason: "テストのため戻しました" });
    const back = LP.engineStatus().typst.available;
    /* 「一度通った」は端末に残る（2026-08-04）。残らないと、画面を開くたびに
       準備中へ戻り、選べる紙面が 1 つしか無いように見えた。
       ここで残っていることを確かめてから、後の判定のために消す。 */
    const remembered = !!(JSON.parse(localStorage.getItem("vq2.engine.verified") || "{}").typst);
    localStorage.removeItem("vq2.engine.verified");
    LP.setEngineCapability("typst", { available: false, reason: "テストのため戻しました" });
    return { beforeVerify: a, afterVerify: b, back, remembered };
  });
  console.log("   " + JSON.stringify(gate));
  ok("実行環境があるだけでは使えるようにしない", gate.beforeVerify === false);
  ok("コンパイルと検証が通ってはじめて使える", gate.afterVerify === true);
  ok("戻せる", gate.back === false);
  ok("一度通ったことは端末に残る", gate.remembered === true);

  section("3. ブラウザの中で Typst ソースを作れる");
  const built = await pg.evaluate(() => {
    const V = window.VQ2;
    const spec = window.__mkTypstSpec();
    const sem = V.layoutGrammar.buildSemanticPlan(spec, { rng: V.layoutProfiles.rng("ui-1"), cover: true });
    const out = V.typstRenderer.buildAll(spec, sem, {});
    return {
      ok: out.ok,
      qBytes: out.ok ? out.questionPaper.source.length : 0,
      aBytes: out.ok ? out.answerSheet.source.length : 0,
      kBytes: out.ok ? out.answerKey.source.length : 0,
      hasLibrary: out.ok && out.questionPaper.source.indexOf("#let vq-document") >= 0,
      questionMarkers: out.ok ? (out.questionPaper.source.match(/kind: "question", id: "/g) || []).length : 0,
      answerCells: out.ok ? (out.answerSheet.source.match(/qid: "/g) || []).length : 0,
      keyRows: out.ok ? out.answerKey.rows.length : 0,
      totalPoints: out.ok ? out.answerKey.totalPoints : 0,
      cover: out.ok && out.questionPaper.bodySource.indexOf("開始の指示があるまで開かないこと") >= 0,
      audit: out.ok ? V.typstEscape.auditSource(out.questionPaper.source).ok : false,
      warnings: out.warnings || []
    };
  });
  console.log("   " + JSON.stringify(built));
  ok("3 点とも作れる", built.ok);
  ok("ライブラリが同じファイルに入っている（単体で組める形）", built.hasLibrary);
  ok("全 4 問ぶんの印が入る", built.questionMarkers === 4, String(built.questionMarkers));
  ok("解答欄が 4 つ", built.answerCells === 4, String(built.answerCells));
  ok("模範解答が 4 行", built.keyRows === 4, String(built.keyRows));
  ok("配点合計が 21 点", built.totalPoints === 21, String(built.totalPoints));
  ok("表紙を付けられる", built.cover);
  ok("外部を読む命令が入っていない", built.audit);

  section("4. 特殊文字が命令にならない");
  const esc = await pg.evaluate(() => {
    const V = window.VQ2;
    const spec = window.__mkTypstSpec();
    const sem = V.layoutGrammar.buildSemanticPlan(spec, { rng: V.layoutProfiles.rng("ui-1") });
    const body = V.typstRenderer.buildAll(spec, sem, {}).questionPaper.bodySource;
    const bare = V.typstEscape.stripStringLiterals(body);
    return {
      hasQ4: body.indexOf("特殊文字") >= 0,
      bareHasSharp: bare.indexOf("特殊文字") >= 0,
      escaped: body.indexOf('\\\\') >= 0 || body.indexOf('\\"') >= 0
    };
  });
  console.log("   " + JSON.stringify(esc));
  ok("特殊文字を含む問題文が入っている", esc.hasQ4);
  ok("問題文は文字列リテラルの中にしか出てこない", esc.bareHasSharp === false);
  ok("バックスラッシュと引用符が退避されている", esc.escaped);

  section("5. 未対応の形式は断る");
  const refuse = await pg.evaluate(() => {
    const V = window.VQ2;
    const spec = window.__mkTypstSpec();
    const sem = V.layoutGrammar.buildSemanticPlan(spec, { rng: V.layoutProfiles.rng("ui-1") });
    sem.sections[0].blocks[0].type = "timeline";
    const out = V.typstRenderer.buildAll(spec, sem, {});
    return { ok: out.ok, code: out.questionPaper.code, msg: out.questionPaper.message || "",
             madeSource: !!out.questionPaper.source, n: out.unsupported.length };
  });
  console.log("   " + JSON.stringify(refuse));
  ok("未対応が混ざると作らない", refuse.ok === false);
  ok("理由を日本語で言う", /まだ専用の組み方/.test(refuse.msg), refuse.msg);
  ok("別の形へすり替えない（ソースを作らない）", refuse.madeSource === false);

  section("6. 設定画面に Typst の欄が出る");
  await pg.evaluate(() => {
    const spec = window.__mkTypstSpec();
    /* 保存してから mockId で開く（Quick Mock はこの経路で読み込む） */
    window.VQ2.store.mocks.put({ id: spec.id, spec: spec, updatedAt: Date.now() });
    window.__typstSpecId = spec.id;
  });
  await pg.evaluate(() => window.VQ2.quickMock.open({ mockId: window.__typstSpecId }));
  await pg.waitForTimeout(1200);
  const opened = await pg.evaluate(() => {
    const host = document.getElementById("vq2-quick-mock");
    return !!(host && host.shadowRoot);
  });
  ok("Quick Mock が開く", opened);

  const panel = await pg.evaluate(async () => {
    const host = document.getElementById("vq2-quick-mock");
    const r = host.shadowRoot;
    /* mockId で開くと「編集」から始まるので、設定の画面へ移る */
    const setup = r.querySelector('[data-step="setup"]');
    if (setup) setup.click();
    await new Promise((res) => setTimeout(res, 500));
    /* 「紙面デザイン」の折りたたみを開く */
    const lay = r.querySelector('[data-fold="layout"]');
    if (lay && lay.getAttribute("aria-expanded") !== "true") lay.click();
    await new Promise((res) => setTimeout(res, 400));
    const sel = r.querySelector('select[data-key="outputEngine"]');
    if (!sel) return { found: false };
    const opts = [...sel.options].map((o) => o.value + "|" + o.text);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, "typst");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    const txt = r.textContent || "";
    return {
      found: true, opts,
      hasPanel: txt.indexOf("Typst で PDF を作る") >= 0,
      hasCover: !!r.querySelector('select[data-key="typstCover"]'),
      hasArtifacts: !!r.querySelector('input[data-key="typstQuestion"]')
        && !!r.querySelector('input[data-key="typstAnswerSheet"]')
        && !!r.querySelector('input[data-key="typstAnswerKey"]'),
      hasSourceBtn: !!r.querySelector('[data-act="typst-source"]'),
      compileBtn: (() => { const b = r.querySelector('[data-act="typst-compile"]');
                           return b ? (b.disabled ? "disabled" : "enabled") : "none"; })(),
      says準備中: txt.indexOf("準備中") >= 0
    };
  });
  console.log("   " + JSON.stringify(panel));
  ok("出力エンジンの欄がある", panel.found);
  ok("Typst は「準備中」と出る",
     (panel.opts || []).some((o) => o.indexOf("typst|") === 0 && o.indexOf("準備中") >= 0),
     (panel.opts || []).join(" / "));
  ok("Typst を選ぶと専用の欄が出る", panel.hasPanel);
  ok("表紙の有無を選べる", panel.hasCover);
  ok("生成する成果物を選べる", panel.hasArtifacts);
  ok("Typst ソースを作るボタンがある", panel.hasSourceBtn);
  /* 2026-08-04: Typst 0.15.1 を document-renderer/bin へ同梱したので、
     この端末では組める。押せることが正しい。
     「使えます」に変わるのは、実際にコンパイルと検証が通ったあと
     （engineStatus は available && verified を見る）。順序は保つ。 */
  ok("Typst があるので PDF ボタンが押せる", panel.compileBtn !== "disabled", panel.compileBtn);
  ok("準備中とはっきり出す", panel.says準備中);

  section("7. 画面から Typst ソースを作って見られる");
  const made = await pg.evaluate(async () => {
    const r = document.getElementById("vq2-quick-mock").shadowRoot;
    r.querySelector('[data-act="typst-source"]').click();
    await new Promise((res) => setTimeout(res, 700));
    const txt = r.textContent || "";
    const viewBtns = [...r.querySelectorAll('[data-act="typst-view"]')];
    let dialogHas = false;
    let where = "";
    if (viewBtns.length) {
      viewBtns[0].click();
      await new Promise((res) => setTimeout(res, 700));
      /* ダイアログは Shadow DOM の中に出る作りなので、両方を見る */
      const texts = [r.textContent || "", document.body.textContent || ""];
      const hosts = [...document.querySelectorAll("*")].filter((e) => e.shadowRoot);
      hosts.forEach((h) => texts.push(h.shadowRoot.textContent || ""));
      const hit = texts.findIndex((t) => t.indexOf("#let vq-document") >= 0
                                      || t.indexOf("#vq-question-paper(") >= 0);
      dialogHas = hit >= 0;
      where = hit >= 0 ? String(hit) : "見つからない";
    }
    return { hasResult: txt.indexOf("できたもの") >= 0, viewButtons: viewBtns.length,
             dialogHas, where };
  });
  console.log("   " + JSON.stringify(made));
  ok("画面からソースを作れる", made.hasResult);
  ok("3 点ぶんの「ソースを見る」が出る", made.viewButtons === 3, String(made.viewButtons));
  ok("ソースの中身を画面で見られる", made.dialogHas);

  section("8. current 経路（未選択）は今までどおり");
  const compat = await pg.evaluate(() => {
    const V = window.VQ2;
    const spec = window.__mkTypstSpec();
    const plan = V.layout.buildPlan(spec, {});
    const sheet = plan.booklets.find((b) => b.kind === "answer-sheet");
    const html = V.pdfRenderer.buildHtml(spec, plan, {});
    return {
      hasLayout: !!spec.layout,
      semantic: plan.semantic === undefined,
      answerBlocks: [...new Set(sheet.blocks.map((b) => b.type))],
      circled: html.indexOf("①") >= 0,
      typstInHtml: html.indexOf("vq-question-paper") >= 0
    };
  });
  console.log("   " + JSON.stringify(compat));
  ok("MockSpec に layout を足さない", compat.hasLayout === false);
  ok("計画に semantic を足さない", compat.semantic === true);
  ok("解答用紙はこれまでの作り方のまま", compat.answerBlocks.indexOf("answer-area") >= 0);
  ok("選択肢は丸数字のまま", compat.circled);
  ok("HTML に Typst のものが混ざらない", compat.typstInHtml === false);

  section("9. スマホ幅");
  await pg.setViewportSize({ width: 390, height: 780 });
  await pg.waitForTimeout(700);
  const mob = await pg.evaluate(() => {
    const r = document.getElementById("vq2-quick-mock").shadowRoot;
    const root = r.querySelector(".vq2-root");
    const w = root ? root.getBoundingClientRect().width : 0;
    let over = 0, small = 0, btns = 0;
    r.querySelectorAll('select[data-key^="typst"], [data-act^="typst"]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width > w + 2) over++;
      if (el.tagName === "BUTTON") { btns++; if (b.height < 40) small++; }
    });
    return { w, over, small, btns };
  });
  console.log("   " + JSON.stringify(mob));
  ok("横にはみ出さない", mob.over === 0, `はみ出し ${mob.over} 件`);
  ok("ボタンが小さすぎない", mob.small === 0, `${mob.btns} 個中 ${mob.small} 個が 40px 未満`);

  section("10. 画面のエラー");
  ok("JavaScript のエラーが出ていない", pageErrors.length === 0, pageErrors.slice(0, 3).join(" / "));

  await browser.close();
  console.log(`\n結果: ${pass} 通過 / ${fail} 失敗`);
  if (failures.length) { console.log("失敗:"); failures.forEach((f) => console.log("  - " + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
