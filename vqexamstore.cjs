/* ══════════════════════════════════════════════════════════════════════════
   vqexamstore.cjs — 試験を **プリセットの 一種**に した（器の 統合）

   これまで 試験は vq2.mocks.v1 という 別の 置き場に あった。そのせいで
     ・一覧に 並ばない（一覧は プリセットの DOM から 作られる）
     ・公開・共有できない ・編集の 画面が 使えない
     ・お気に入り・検索・絞り込みが 効かない
   中身は もともと 問題の 集まりで、プリセットと 同じ もの。
   違うのは「大問」「表紙」「解答用紙」だけ。→ preset.exam へ 寄せた。

   ここで 見るのは:
     ① 保存して 読み戻すと **中身が 1 つも 変わらない**
     ② プリセットとして 一覧・検索・お気に入り・公開が 効く
     ③ 昔の 置き場から **取りこぼさず 引っ越す**（元は 消さない）
     ④ 紙面・受験・採点が これまでどおり 通る
     ⑤ 壊れた 中身で 落ちない

   使い方: node vqexamstore.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};

/* 試験を 1 つ こしらえる（AI は 使わない。決定論層だけ） */
function 試験を作る(root, id, o) {
  o = o || {};
  const MC = root.VQ2.mockCompiler;
  const p = MC.plan({
    title: o.title || "期末考査", subject: o.subject || "日本史探究",
    durationMinutes: 50, totalPoints: o.totalPoints || 60,
    sectionCount: o.sectionCount || 2, questionCount: o.questionCount || 6,
    types: { multiple_choice_single: true, short_answer: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false
  });
  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => {
    filled[q.id] = q.type === "multiple_choice_single"
      ? { question: "問" + q.number + "の本文", type: q.type, answer: "あ", explanation: "かいせつ",
          choices: [{ text: "あ" }, { text: "い" }, { text: "う" }, { text: "え" }] }
      : { question: "問" + q.number + "の本文", type: q.type, answer: "こたえ" + q.number,
          explanation: "かいせつ" };
  }));
  const a = MC.assemble(p, filled, {});
  a.spec.id = id;
  a.spec.cover = { examName: o.title || "期末考査", subject: o.subject || "日本史探究",
    examDate: "2026年8月30日", instructions: ["解答は解答用紙へ。"],
    studentFields: ["年", "組", "番", "氏名"] };
  return a.spec;
}
const 全問 = (sp) => sp.sections.reduce((a, s) => a.concat(s.questions), []);

/* ══ ① 行って 帰って 変わらない ══════════════════════════════ */
{
  節("① 保存して 読み戻すと 中身が 変わらない");
  const root = 器();
  const ST = root.VQ2.store;
  const 元 = 試験を作る(root, "ex1");
  const r = ST.saveExam(元, {});
  見(r.ok, "保存できた", r.message || "");
  const 戻 = ST.getExam("ex1");
  見(!!戻, "読み戻せた");
  if (戻) {
    見(戻.title === 元.title, "題名", 戻.title);
    見(戻.sections.length === 元.sections.length, "大問の 数",
       戻.sections.length + " / " + 元.sections.length);
    見(全問(戻).length === 全問(元).length, "設問の 数",
       全問(戻).length + " / " + 全問(元).length);
    見(戻.totalPoints === 元.totalPoints, "満点", 戻.totalPoints);
    見(戻.durationMinutes === 元.durationMinutes, "試験時間", 戻.durationMinutes);
    見(戻.answerBindings.length === 元.answerBindings.length, "解答欄の 数",
       戻.answerBindings.length);
    見(!!戻.cover && 戻.cover.examName === 元.cover.examName, "表紙");
    /* ★ 設問の 中身が 1 つも 欠けず、1 つも 書き換わっていないこと。
       （プリセットの 帳簿ぶん questionNumber だけは 保存のときに 足される。
         これは 一覧・並べ替えが 使う もので、試験の 中身では ない。） */
    const 帳簿 = { questionNumber: 1 };
    const 欠 = [], 違 = [];
    全問(元).forEach((q, i) => {
      const w = 全問(戻)[i] || {};
      Object.keys(q).forEach((k) => {
        if (!(k in w)) 欠.push(q.id + "." + k);
        else if (JSON.stringify(q[k]) !== JSON.stringify(w[k])) 違.push(q.id + "." + k);
      });
    });
    見(欠.length === 0, "★ 設問の 鍵が 1 つも 欠けない", 欠.join(","));
    見(違.length === 0, "★ 設問の 中身が 1 つも 書き換わらない", 違.join(","));
    const 増 = [];
    全問(戻).forEach((w, i) => {
      const q = 全問(元)[i] || {};
      Object.keys(w).forEach((k) => { if (!(k in q) && !帳簿[k]) 増.push(w.id + "." + k); });
    });
    見(増.length === 0, "勝手な 鍵が 足されない（帳簿ぶんを 除く）", 増.join(","));
    /* 大問と 設問の 対応が 崩れていない。 */
    const 対 = 戻.sections.map((s) => s.questions.map((q) => q.id).join("+")).join(" | ");
    const 元対 = 元.sections.map((s) => s.questions.map((q) => q.id).join("+")).join(" | ");
    見(対 === 元対, "大問と 設問の 対応", 対);
    /* 解答欄が 設問を 正しく 指している。 */
    const ids = {}; 全問(戻).forEach((q) => { ids[q.id] = 1; });
    見(戻.answerBindings.every((b2) => ids[b2.questionId]), "解答欄が 実在する 設問を 指す");
  }
}

/* ══ ② プリセットとして 扱える ══════════════════════════════ */
{
  節("② プリセットとして 一覧・検索・お気に入り・公開が 効く");
  const root = 器();
  const ST = root.VQ2.store, L = root.VQ2.library;
  ST.saveExam(試験を作る(root, "ex1", { title: "日本史 期末", subject: "日本史探究" }), {});
  ST.saveExam(試験を作る(root, "ex2", { title: "地理 実力テスト", subject: "地理総合" }), {});
  ST.savePreset({ id: "pr1", schemaVersion: root.VQ2.schema.SCHEMA_VERSION, name: "英単語",
    description: "", visibility: "private",
    questions: [{ id: "q1", type: "short_answer", prompt: "apple", explanation: "" }] }, {});

  const 全 = ST.listPresets();
  見(全.length === 3, "一覧に 試験も プリセットも 並ぶ", 全.map((x) => x.id).join(","));
  const 試 = ST.listExams();
  見(試.length === 2, "試験だけ 取り出せる", 試.map((x) => x.id).join(","));
  見(!ST.isExam(ST.getPreset("pr1")), "ふつうの プリセットは 試験では ない");
  見(ST.getExam("pr1") === null, "ふつうの プリセットを 試験として 読まない");

  /* 一覧の 仕組み（絞り込み・検索・並べ替え）に そのまま 乗る。 */
  if (L) {
    const 札 = 全.map((x) => ({
      id: x.id, title: x.name, subject: (x.exam && x.exam.subject) || "",
      questionCount: (x.questions || []).length, tags: [], visibility: x.visibility,
      isOwnedByCurrentUser: true, isOfficial: false, updatedAt: x.updatedAt
    }));
    見(L.applyFilters(札, { tab: "mine" }).length === 3, "「マイプリセット」に 出る");
    見(L.applyFilters(札, { search: "日本史" }).length === 1, "検索で 引ける",
       L.applyFilters(札, { search: "日本史" }).map((x) => x.id).join(","));
    見(L.counts(札).all === 3, "件数が 数えられる");
  }

  /* 公開に できる（これが できなかったのが 統合の いちばんの 動機）。 */
  const p2 = ST.getPreset("ex1");
  p2.visibility = "public";
  const w = ST.savePreset(p2, {});
  見(w.ok, "公開に できる", w.message || "");
  見(ST.getPreset("ex1").visibility === "public", "公開の 印が 残る");
  見(ST.isExam(ST.getPreset("ex1")), "公開しても 試験の ままで いる");
}

/* ══ ③ 引っ越し ══════════════════════════════════════════════ */
{
  節("③ 昔の 置き場（vq2.mocks.v1）から 引っ越す");
  const root = 器();
  const ST = root.VQ2.store;
  /* 引っ越しは listExams の 中で 走るので、先に 昔の ぶんを 置いておく。 */
  const 昔1 = 試験を作る(root, "old1", { title: "去年の 期末" });
  const 昔2 = 試験を作る(root, "old2", { title: "去年の 実力テスト", sectionCount: 3, questionCount: 9 });
  ST.mocks.put({ id: "old1", kind: "mock", title: 昔1.title, spec: 昔1 });
  ST.mocks.put({ id: "old2", kind: "mock", title: 昔2.title, spec: 昔2 });
  見(ST.mocks.list().length === 2, "昔の 置き場に 2 件");

  const 試 = ST.listExams();
  見(試.length === 2, "引っ越して 2 件とも 出る", 試.map((x) => x.id + ":" + x.name).join(", "));
  const m1 = ST.getExam("old1");
  見(!!m1 && 全問(m1).length === 全問(昔1).length, "設問の 数が 合う",
     m1 ? 全問(m1).length : "なし");
  const m2 = ST.getExam("old2");
  見(!!m2 && m2.sections.length === 3, "大問の 数が 合う", m2 ? m2.sections.length : "なし");
  見(!!m2 && m2.cover && m2.cover.examName === "去年の 実力テスト", "表紙も 引っ越す");
  見(ST.mocks.list().length === 2, "★ 昔の ぶんは **消さない**（戻せるように）");
  /* 2 度 走らせても 増えない。 */
  ST.migrateExams();
  見(ST.listExams().length === 2, "2 度 走らせても 増えない", ST.listExams().length);
}

/* ══ ④ 紙面・受験・採点が 通る ═══════════════════════════════ */
{
  節("④ 紙面・採点が これまでどおり 通る");
  const root = 器();
  const ST = root.VQ2.store, L = root.VQ2.layout, R = root.VQ2.pdfRenderer, G = root.VQ2.grading;
  ST.saveExam(試験を作る(root, "ex1"), {});
  const spec = ST.getExam("ex1");
  let plan = null, html = "";
  try { plan = L.buildPlan(spec); html = String(R.buildHtml(spec, plan, { bookletId: "question-booklet" })); }
  catch (e) { 見(false, "紙面を 組めた", String((e && e.message) || e)); }
  if (html) {
    見(true, "紙面を 組めた", html.length + " 字");
    見(/期末考査/.test(html), "表紙に 題名が 出る");
    見(/大問|第一問|一/.test(html), "大問が 出る");
    const 冊 = (plan.booklets || []).map((b) => b.kind);
    見(冊.indexOf("answer-sheet") >= 0, "解答用紙が ある", 冊.join(","));
  }
  /* 採点も 通る（決定論の ぶんだけ）。 */
  const qs = 全問(spec);
  const 答 = qs.map((q) => ({ questionId: q.id, value: q.choices && q.choices.length
    ? (q.choices.find((c) => c.isCorrect) || {}).id : q.correctAnswer, timeMs: 1000 }));
  let g = null;
  try { g = G.gradeSession(qs, 答); } catch (e) { 見(false, "採点できた", String((e && e.message) || e)); }
  if (g) {
    見(true, "採点できた", g.deterministicScore + " / " + g.totalMax);
    見(g.totalMax === spec.totalPoints, "満点が 一致", g.totalMax + " / " + spec.totalPoints);
  }
}

/* ══ ⑤ 壊れた ものでも 落ちない ══════════════════════════════ */
{
  節("⑤ 壊れた 中身でも 落ちない");
  const root = 器();
  const ST = root.VQ2.store;
  見(ST.examOf(null) === null, "null は null");
  見(ST.examOf({}) === null, "空の オブジェクトは null");
  見(ST.examOf({ exam: { sections: [] } }) === null, "大問が 0 なら null");
  /* 設問を 指しているのに 実体が 無い ときは、その 大問を 出さない。 */
  const 欠 = ST.examOf({ id: "x", name: "壊れ", questions: [{ id: "q1", type: "short_answer" }],
    exam: { sections: [{ id: "s1", number: 1, questionIds: ["q1"] },
                       { id: "s2", number: 2, questionIds: ["nope"] }] } });
  見(!!欠 && 欠.sections.length === 1, "実体の 無い 大問は 出さない", 欠 ? 欠.sections.length : "null");
  見(!!欠 && 欠.sections[0].questions.length === 1, "残った 大問は そのまま");
  見(ST.saveExam(null, {}).ok === false, "壊れた 試験は 保存しない");
  見(ST.saveExam({ sections: [] }, {}).ok === false, "大問 0 の 試験も 保存しない");
  見(ST.getExam("いない") === null, "無い id は null");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
