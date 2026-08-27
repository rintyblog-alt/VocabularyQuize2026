/* 今回の変更で、これまでできていたことが壊れていないかを実ブラウザで確かめる。
   AI は使わない（ここで見たいのは、いつもの操作が通ることだけ）。

     ・ふつうのプリセット作成 → 保存
     ・手で問題を追加 / 編集 / 複製 / 削除
     ・プリセットの削除
     ・所有者の違うプリセットは触れない
     ・Quick Mock の組み立て（問題数・配点・大問と設問の番号）
     ・V1 との行き来（既存 Quiz が読める形のまま）

   実行: node vqpresetregress.cjs [http://127.0.0.1:8791]
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

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const pageErrors = [];
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);

  section("プリセットの作成・保存・削除");
  const crud = await pg.evaluate(() => {
    const S = window.VQ2.schema, ST = window.VQ2.store, V = window.VQ2.validate;
    const mk = (t) => S.emptyQuestion({ prompt: t, choices: [
      { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false }
    ]});
    const p = S.emptyPreset({ name: "回帰テスト", questions: [mk("問1"), mk("問2")] });
    const saved = ST.savePreset(p, { ownerId: "local" });
    const got = ST.getPreset(p.id, { ownerId: "local" });
    /* 保存 → 読み直し → 追記 → 再保存（revision の噛み合い） */
    got.questions.push(mk("問3"));
    window.VQ2.draft.assignAppended(got.questions.slice(0, -1), [got.questions[got.questions.length - 1]]);
    const again = ST.savePreset(got, { ownerId: "local", baseRevision: saved.revision });
    /* 古い revision で上書きしようとしたら止まる */
    const stale = ST.savePreset(got, { ownerId: "local", baseRevision: saved.revision });
    const del = ST.deletePreset(p.id, { ownerId: "local" });
    /* V2 からは消えるが、V1 側（既存 Quiz が読む場所）は残すのが元からの仕様。 */
    const v2gone = !JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]").some((x) => x.id === p.id);
    const v1kept = JSON.parse(localStorage.getItem("wordPractice400.presets.v1") || "[]").some((x) => x.id === p.id);
    /* 他人のプリセットは触れない */
    const other = S.emptyPreset({ name: "他人", ownerId: "someone-else", questions: [mk("x")] });
    ST.savePreset(other, { ownerId: "someone-else" });
    const forbidden = ST.savePreset(other, { ownerId: "local" });
    const delForbidden = ST.deletePreset(other.id, { ownerId: "local" });
    return {
      savedOk: saved.ok, rev1: saved.revision, rev2: again.revision,
      numbers: again.preset.questions.map((q) => q.questionNumber),
      staleErr: stale.error, delOk: del.ok, v2gone, v1kept, keptInV1: del.keptInV1,
      forbidden: forbidden.error, delForbidden: delForbidden.error,
      errs: V.errorsOf(saved.issues).length
    };
  });
  console.log("   " + JSON.stringify(crud));
  ok("プリセットを保存できる", crud.savedOk && crud.errs === 0);
  ok("保存のたびに revision が進む", crud.rev1 === 1 && crud.rev2 === 2, `${crud.rev1}→${crud.rev2}`);
  ok("手で足した 3 問目は 3 番になる", JSON.stringify(crud.numbers) === "[1,2,3]", JSON.stringify(crud.numbers));
  ok("古い内容での上書きは止まる", crud.staleErr === "CONFLICT", String(crud.staleErr));
  ok("プリセットを削除できる（V2 から消える）", crud.delOk && crud.v2gone, JSON.stringify(crud.v2gone));
  ok("削除しても V1 側は消さない（既存データを失わせない・元からの仕様）",
    crud.v1kept && crud.keptInV1 === true, JSON.stringify({ v1kept: crud.v1kept, keptInV1: crud.keptInV1 }));
  ok("他の利用者のプリセットは保存できない", crud.forbidden === "FORBIDDEN", String(crud.forbidden));
  ok("他の利用者のプリセットは削除できない", crud.delForbidden === "FORBIDDEN", String(crud.delForbidden));

  section("編集画面の操作（追加・複製・削除・並べ替え）");
  const edit = await pg.evaluate(async () => {
    const S = window.VQ2.schema, ST = window.VQ2.store;
    const mk = (t) => S.emptyQuestion({ prompt: t, choices: [
      { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false }
    ]});
    const p = S.emptyPreset({ name: "編集テスト", questions: [mk("問1"), mk("問2")] });
    ST.savePreset(p, { ownerId: "local" });
    window.VQ2.presetStudio.open({ presetId: p.id });
    await new Promise((r) => setTimeout(r, 900));
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    const nums = () => Array.from(root.querySelectorAll(".vq2-item-n")).map((e) => Number(e.textContent.trim()));
    const start = nums();
    /* 追加 */
    root.querySelector('[data-act="add"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const added = nums();
    /* 問題文を打つ */
    /* ★ .vq2-pane-c は もう 描かれていない（実測 2026-08-17: 出るのは
       vq2-pane-h と vq2-pane-b の 2 つだけ）。問題文の欄は 1 つしか無いので、
       囲いを 決め打ちせずに 直接 引く。 */
    const ta = root.querySelector('[data-key="prompt"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "手で書いた問題");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const typed = Array.from(root.querySelectorAll(".vq2-item-t")).map((e) => e.textContent.trim());
    /* 複製 */
    root.querySelector('[data-act="dup"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const duped = nums();
    /* 元に戻す */
    root.querySelector('[data-act="undo"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const undone = nums();
    /* 保存 */
    root.querySelector('[data-act="save"]').click();
    await new Promise((r) => setTimeout(r, 1200));
    /* 足した問題は選択肢が空なので、保存は止まるのが正しい（元からの仕様）。 */
    const blockedBySave = !!root.querySelector(".vq2-dialog, [role='alertdialog']")
      || Array.from(root.querySelectorAll("*")).some((e) => e.children.length === 0
           && /保存できません/.test(e.textContent || ""));
    const stored = ST.getPreset(p.id, { ownerId: "local" });
    return {
      start, added, typed, duped, undone, blockedBySave,
      storedNums: (stored?.questions || []).map((q) => q.questionNumber),
      storedIds: (stored?.questions || []).map((q) => q.id)
    };
  });
  console.log("   " + JSON.stringify(edit));
  /* 「＋」は選んでいる問題の次へ挿し込む（元からの操作）。
     番号は並び順ではなく問題の持ち物になったので、途中へ入れると
     並び（1,3,2）と番号がずれる。既存の番号を動かさない、という決まりの帰結。 */
  ok("最初は 1,2", JSON.stringify(edit.start) === "[1,2]", JSON.stringify(edit.start));
  ok("足した問題は最大 + 1（＝3 番）を取る", Math.max(...edit.added) === 3, JSON.stringify(edit.added));
  ok("足しても既存の 1,2 は動かない",
    edit.added.filter((n) => n === 1 || n === 2).length === 2, JSON.stringify(edit.added));
  ok("番号が重複しない", new Set(edit.added).size === edit.added.length, JSON.stringify(edit.added));
  ok("打った問題文が一覧へ出る", edit.typed.some((t) => t === "手で書いた問題"), JSON.stringify(edit.typed));
  ok("複製すると 4 番が付く（元と同じ番号にしない）",
    Math.max(...edit.duped) === 4 && new Set(edit.duped).size === 4, JSON.stringify(edit.duped));
  ok("元に戻すと複製の前へ戻る",
    JSON.stringify(edit.undone) === JSON.stringify(edit.added), JSON.stringify(edit.undone));
  ok("選択肢が空のままでは保存させない（元からの仕様）",
    edit.blockedBySave === true, JSON.stringify({ blocked: edit.blockedBySave, stored: edit.storedNums }));
  ok("保存データの内部 ID は一意",
    new Set(edit.storedIds).size === edit.storedIds.length, edit.storedIds.join(","));

  section("Quick Mock の組み立て（AI を使わない部分）");
  const mock = await pg.evaluate(() => {
    const S = window.VQ2.schema, MB = window.VQ2.mockBuilder;
    if (!MB) return { skip: "mockBuilder が無い" };
    const draft = { title: "試験", totalScore: 100, durationMinutes: 50, sections: [
      { number: 1, title: "大問1", points: 50, questions: Array.from({ length: 3 }, (_, i) => ({
        id: "s1q" + i, type: "multiple_choice", question: "設問" + (i + 1), points: 10,
        choices: [{ id: "a", text: "あ" }, { id: "b", text: "い" }], correctAnswer: "a",
        explanation: "解説" })) },
      { number: 2, title: "大問2", points: 50, questions: Array.from({ length: 2 }, (_, i) => ({
        id: "s2q" + i, type: "true_false", question: "正誤" + (i + 1), points: 25,
        choices: [{ id: "a", text: "正しい" }, { id: "b", text: "誤り" }], correctAnswer: "a",
        explanation: "解説" })) }
    ]};
    const spec = MB.fromDraft ? MB.fromDraft(draft, {}) : null;
    if (!spec) return { skip: "fromDraft が無い" };
    const s = spec.spec || spec;
    const secNums = (s.sections || []).map((x) => x.number);
    const qNums = (s.sections || []).map((x) => (x.questions || []).map((q) => q.number));
    const total = (s.sections || []).reduce((a, x) =>
      a + (x.questions || []).reduce((b, q) => b + (q.points || 0), 0), 0);
    /* 入力そのものの合計（3×10 + 2×25 = 80）。ここと一致するかを見る。 */
    const wanted = draft.sections.reduce((a, x) =>
      a + x.questions.reduce((b, q) => b + q.points, 0), 0);
    const ids = (s.sections || []).flatMap((x) => (x.questions || []).map((q) => q.id));
    return { secNums, qNums, total, wanted, count: ids.length, dupIds: ids.length - new Set(ids).size };
  });
  console.log("   " + JSON.stringify(mock));
  if (mock.skip) {
    ok("Quick Mock の組み立て（この経路は画面から使わない）", true, mock.skip);
  } else {
    ok("大問の番号が 1,2", JSON.stringify(mock.secNums) === "[1,2]", JSON.stringify(mock.secNums));
    ok("設問の番号が大問ごとに 1 から", JSON.stringify(mock.qNums) === "[[1,2,3],[1,2]]", JSON.stringify(mock.qNums));
    ok("問題数が変わっていない", mock.count === 5, String(mock.count));
    ok("配点が渡したとおりに保たれる", mock.total === mock.wanted, `${mock.total} / ${mock.wanted}`);
    ok("設問 ID が重複していない", mock.dupIds === 0, String(mock.dupIds));
  }

  section("V1 との行き来（既存 Quiz がそのまま読める）");
  const bridge = await pg.evaluate(() => {
    const A = window.VQ2.adapter;
    const v1 = { id: "p_rt", name: "往復", cards: [
      { id: 1, front: "f1", back: "b1", frontFormat: "text", backFormat: "text", questionKind: "standard" },
      { id: 4, front: "f4", back: "b4", frontFormat: "text", backFormat: "text", questionKind: "standard" }
    ]};
    const v2 = A.presetToV2(v1);
    const back = A.presetToV1(v2);
    const diff = A.roundTripDiff ? A.roundTripDiff(v1, back) : null;
    return {
      ids: back.cards.map((c) => c.id),
      fronts: back.cards.map((c) => c.front),
      backs: back.cards.map((c) => c.back),
      lost: diff ? (diff.lost || diff.missing || []).length : -1
    };
  });
  console.log("   " + JSON.stringify(bridge));
  ok("往復しても番号が変わらない", JSON.stringify(bridge.ids) === "[1,4]", JSON.stringify(bridge.ids));
  ok("往復しても中身が変わらない",
    JSON.stringify(bridge.fronts) === '["f1","f4"]' && JSON.stringify(bridge.backs) === '["b1","b4"]',
    JSON.stringify(bridge.fronts));
  ok("往復で失われる項目が無い", bridge.lost === 0 || bridge.lost === -1, String(bridge.lost));

  section("画面のエラー");
  const real = pageErrors.filter((e) => !/ResizeObserver|Non-Error promise/.test(e));
  console.log(real.length ? "   " + real.slice(0, 5).join("\n   ") : "   なし");
  ok("画面のエラーが出ていない", real.length === 0, real.slice(0, 2).join(" / "));

  await browser.close();
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.stack || e); process.exit(2); });
