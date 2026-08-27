/* ══════════════════════════════════════════════════════════════════════
   一本道の確認
     AI の出力 → 取り込み → 検証 → 保存 → 受験 → 採点 → 結果 → Insight

   実際の AI は呼ばない（毎回変わるものをテストの合否にしない）。
   代わりに **AI が返す形の JSON** を入口へ入れて、そこから先が
   本当に最後までつながっているかだけを見る。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.body.classList.remove("auth-booting", "auth-gate-open");
  document.body.setAttribute("data-ui-v2", "1");
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(HIDE);
  await pg.waitForTimeout(600);

  /* ── 1. 配分を決める（AI へ丸投げしない） ── */
  const plan = await pg.evaluate(() => {
    VQ2.learning.clearAll();
    const p = VQ2.qplan.planMix({ count: 8, style: "auto", subject: "english" });
    const allowed = VQ2.capability.forAi();
    return {
      items: p.items.map((i) => ({ type: i.type, name: i.name, count: i.count })),
      total: p.items.reduce((a, i) => a + i.count, 0),
      allOk: p.items.every((i) => allowed.indexOf(i.type) >= 0),
      allowedCount: allowed.length,
      prompt: VQ2.qplan.promptFor(p, {})
    };
  });
  ok("出す形式をこちらで決めている", plan.total === 8, "合計 " + plan.total);
  ok("使える形式からしか選んでいない", plan.allOk, JSON.stringify(plan.items.map((i) => i.type)));
  ok("4 択だけにならない", new Set(plan.items.map((i) => i.type)).size >= 2,
     plan.items.map((i) => i.name + " " + i.count).join(" / "));
  ok("依頼文に形ごとの書き方が入る", /JSON|形式|問題/.test(plan.prompt));

  /* ── 2. AI が返した形を取り込む（使えない形式・壊れたものを混ぜる） ── */
  const imported = await pg.evaluate(() => {
    const raw = [
      { id: "a1", type: "multiple_choice_single", question: "次のうち正しいものは？",
        choices: [{ text: "正しい", isCorrect: true }, { text: "ちがう" }, { text: "ちがう2" }, { text: "ちがう3" }],
        explanation: "これは例です。", points: 2, topic: "関係代名詞" },
      { id: "a2", type: "short_answer", question: "空欄に入る語を書きなさい。",
        correctAnswer: "which", acceptedAnswers: ["Which"], points: 2, topic: "関係代名詞" },
      { id: "a3", type: "ordering", question: "正しい順に並べなさい。",
        items: ["I", "have", "a", "pen"], points: 3, topic: "語順" },
      /* 知らない形式 */
      { id: "a4", type: "hologram_question", question: "これは知らない形式です。" },
      /* 正解が無い */
      { id: "a5", type: "multiple_choice_single", question: "正解がない問題",
        choices: [{ text: "A" }, { text: "B" }] },
      /* 記述（AI 採点になる） */
      { id: "a6", type: "long_answer", question: "関係代名詞の働きを説明しなさい。",
        modelAnswer: "名詞を後ろから修飾し、文と文をつなぐ働きをする。", points: 5, topic: "関係代名詞" }
    ];
    const r = VQ2.qplan.importAll(raw, {});
    return {
      got: r.questions.length,
      types: r.questions.map((q) => q.type),
      dropped: r.dropped.map((d) => ({ reason: d.reason })),
      converted: (r.converted || []).map((c) => c.note)
    };
  });
  ok("使えるものだけ取り込む", imported.got >= 3, "取り込み " + imported.got);
  ok("知らない形式は理由つきで落とす",
     imported.dropped.some((d) => /知らない形式|分かりません|作れません|寄せ/.test(d.reason)),
     JSON.stringify(imported.dropped));
  ok("正解が無いものは落とす", imported.dropped.length >= 2, JSON.stringify(imported.dropped));
  ok("1 問だめでも全部を捨てない", imported.got > 0 && imported.dropped.length > 0);

  /* ── 3. 保存する（保存前の検証を通す） ── */
  const saved = await pg.evaluate(() => {
    const raw = [
      { id: "a1", type: "multiple_choice_single", question: "次のうち正しいものは？",
        choices: [{ text: "正しい", isCorrect: true }, { text: "ちがう" }, { text: "ちがう2" }, { text: "ちがう3" }],
        explanation: "例です。", points: 2, topic: "関係代名詞" },
      { id: "a2", type: "short_answer", question: "空欄に入る語を書きなさい。",
        correctAnswer: "which", points: 2, topic: "関係代名詞" },
      { id: "a3", type: "ordering", question: "正しい順に並べなさい。",
        items: ["I", "have", "a", "pen"], points: 3, topic: "語順" },
      { id: "a6", type: "long_answer", question: "関係代名詞の働きを説明しなさい。",
        modelAnswer: "名詞を後ろから修飾し、文と文をつなぐ働きをする。", points: 5, topic: "関係代名詞" }
    ];
    const r = VQ2.qplan.importAll(raw, {});
    const preset = VQ2.schema.emptyPreset({
      name: "AI が作ったプリセット", subjectId: "sub:english", questions: r.questions
    });
    const chk = VQ2.validate.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true });
    const res = VQ2.store.savePreset(preset, { ownerId: VQ2.store.currentOwnerId() });
    return {
      ok: res.ok,
      id: preset.id,
      errors: (chk.issues || []).filter((i) => i.level === "error").map((i) => i.code),
      count: preset.questions.length
    };
  });
  ok("生成したものが保存できる", saved.ok, JSON.stringify(saved.errors));
  ok("出題できる状態になっている（要修正が残らない）", saved.errors.length === 0, JSON.stringify(saved.errors));

  /* ── 4. 受験して採点する ── */
  const played = await pg.evaluate((pid) => {
    const p = VQ2.store.getPreset(pid);
    const qs = p.questions;
    /* すべて正解の答えを作る（形式ごとの答えの形をそのまま使う） */
    const answers = qs.map((q) => {
      const e = q.engine || VQ2.qtypes.engineOf(q.type);
      if (e === "single_choice") {
        const c = (q.choices || []).filter((x) => x.isCorrect)[0];
        return { questionId: q.id, value: { choiceId: c ? c.id : "" }, timeMs: 8000 };
      }
      if (e === "text_input") return { questionId: q.id, value: { text: q.correctAnswer || "" }, timeMs: 9000 };
      if (e === "reorder") return { questionId: q.id, value: { order: (q.correctOrder || []).slice() }, timeMs: 12000 };
      if (e === "free_text") return { questionId: q.id, value: { text: q.modelAnswer || "説明" }, timeMs: 30000 };
      return { questionId: q.id, value: null, timeMs: 1000 };
    });
    const graded = VQ2.evaluator.evaluateSession(qs, answers);
    const agg = VQ2.evaluator.aggregate(qs, graded.items);
    const result = {
      id: "chain_result_1", kind: "quiz", sessionId: "chain_sess_1",
      presetId: p.id, presetName: p.name, mode: "practice",
      finishedAt: new Date().toISOString(), elapsedMs: 60000,
      questionOrder: qs.map((q) => q.id), answers,
      items: graded.items, pendingAiCount: graded.pendingCount,
      score: graded.deterministicScore, maxScore: graded.totalMax,
      correctCount: graded.correctCount, wrongCount: graded.wrongCount,
      unansweredCount: graded.unansweredCount, aggregate: agg,
      questionsSnapshot: qs.map((q) => ({ id: q.id, type: q.type, subject: "英語", unit: q.topic || null }))
    };
    const put = VQ2.store.results.put(result);
    return {
      saved: put.ok,
      correct: graded.correctCount,
      wrong: graded.wrongCount,
      pending: graded.pendingCount,
      unanswered: graded.unansweredCount,
      total: qs.length,
      types: qs.map((q) => q.type),
      detail: graded.items.map((it) => ({ t: it.type, e: it.engine, a: it.answered,
                                          c: it.correct, s: it.score, m: it.method }))
    };
  }, saved.id);
  ok("解いて採点できる", played.saved);
  ok("決まった形式は自動で採点される", played.correct >= 3,
     "正解 " + played.correct + " / 不正解 " + played.wrong + " / 未回答 " + played.unanswered
     + " " + JSON.stringify(played.detail));
  ok("記述は 0 点で確定させず、採点待ちにする", played.pending === 1, "待ち " + played.pending);

  /* ── 5. Insight まで届く ── */
  const insight = await pg.evaluate(() => {
    const ss = VQ2.learning.listSessions({});
    const d = VQ2.analytics.dashboard({ range: "all" });
    const legacy = JSON.parse(localStorage.getItem(VQ2.learning.LEGACY_SESSIONS_KEY) || "[]");
    return {
      sessions: ss.length,
      pending: ss[0] ? ss[0].pendingCount : -1,
      status: ss[0] ? ss[0].status : "",
      answered: d.summary.current.answeredCount,
      types: d.types.map((t) => ({ label: t.label, n: t.answered })),
      subjects: d.subjects.map((s) => s.label),
      units: VQ2.analytics.byUnit({ range: "all" }).map((u) => u.label),
      mirrored: legacy.filter((x) => x.vq2SessionId).length
    };
  });
  ok("受験した結果が学習記録になる", insight.sessions === 1, "セッション " + insight.sessions);
  ok("採点待ちを持ったまま集計に入る", insight.pending === 1 && insight.status === "scoring", JSON.stringify(insight));
  ok("Insight の形式ごとに出る", insight.types.length >= 3, JSON.stringify(insight.types));
  ok("形式は日本語で出る", insight.types.every((t) => !/_/.test(t.label)), JSON.stringify(insight.types));
  ok("科目と単元も届く", insight.subjects.length >= 1 && insight.units.length >= 1,
     JSON.stringify(insight.subjects) + " / " + JSON.stringify(insight.units));
  ok("ホームが読む場所へも届く", insight.mirrored === 1, "行 " + insight.mirrored);

  /* ── 6. AI 採点が確定したら集計が更新される ── */
  const settled = await pg.evaluate(() => {
    const r = VQ2.store.results.list()[0];
    r.items.forEach((it) => {
      if (it.score === null || it.score === undefined) { it.score = it.maxScore; it.correct = true; it.isCorrect = true; }
    });
    r.pendingAiCount = 0;
    VQ2.store.results.put(r, { baseRevision: r.revision });
    const ss = VQ2.learning.listSessions({});
    return { sessions: ss.length, pending: ss[0].pendingCount, status: ss[0].status,
             correct: ss[0].correctCount, acc: ss[0].accuracy };
  });
  ok("採点が確定しても記録は 1 本のまま", settled.sessions === 1);
  ok("確定すると採点待ちが消える", settled.pending === 0 && settled.status === "completed", JSON.stringify(settled));
  ok("確定した分が点に入る", settled.correct === played.total, JSON.stringify(settled));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
