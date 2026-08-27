/* ══════════════════════════════════════════════════════════════════════
   AI が作った問題を、1 問ずつ実物で確かめる（生成の総点検）

   「作れた」と数えられていても、**解けない問題**は混ざる。
   正解が無い／選択肢に正解が入っていない／同じ選択肢が 2 つある／
   埋める場所が無い／描くと落ちる、など。

   ここでは実際に AI へ頼み、届いた問題を **画面の道**にそのまま流す。

     ① toClientShape        サーバの形 → 画面の形
     ② draftToQuestions     画面の形 → 問題（形式が化けていないかもここで見る）
     ③ checkQuestionRules   保存・出題の検証
     ④ answerability.check  人が解けるか
     ⑤ correctValueOf → evaluate   **正解を入れたら満点になるか**
     ⑥ qrender.html         実際に描けるか

   ⑤が本命。ここが通れば「正解がある・選択肢と噛み合っている」が実証できる。

   本番へは向けない。AI の枠を使うので、回しすぎないこと。
   使い方: node vqgenaudit.cjs
     VQ_PLAN='{"multiple_choice_single":4}' で内訳を変えられる
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const UI = process.env.VQ_UI || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
if (!/127\.0\.0\.1|localhost|-dev\./.test(UI)) { console.error("本番では実行しません。"); process.exit(2); }

/* 既定は 14 形式を 2 問ずつ。1 回の生成で足りる大きさにしてある。 */
const PLAN = JSON.parse(process.env.VQ_PLAN || JSON.stringify({
  multiple_choice_single: 2, multiple_choice_multiple: 2, true_false: 2, short_answer: 2,
  long_answer: 2, fill_blank: 2, ordering: 2, matching: 2, classification: 2,
  error_correction: 2, flashcard: 2, numeric: 2, table_fill: 2, composite: 1
}));
const PROMPT = process.env.VQ_PROMPT
  || "高校の保健・日本史・生物基礎から問題を作って。難易度は高2の難しめ。選択肢は迷わせて、解説は詳しく。";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}

/* 画面の中で、1 問ずつ実物にかける。 */
const AUDIT = (raw) => {
  const G = VQ2.aigen, D = VQ2.draft, M = VQ2.qmodel, V = VQ2.validate,
        A = VQ2.answerability, C = VQ2.capability, EV = VQ2.evaluator, R = VQ2.qrender, Q = VQ2.qtypes;
  return raw.map((src, i) => {
    const out = { i, asked: String(src.type || ""), defects: [] };
    const push = (t, m) => out.defects.push({ t, m });
    let q = null;
    try {
      const shaped = G.toClientShape(JSON.parse(JSON.stringify(src)), i);
      const list = D.draftToQuestions({ questions: [shaped] });
      q = list && list[0];
    } catch (e) { push("import", "取り込みで落ちた: " + (e && e.message)); }
    if (!q) { push("import", "問題にならなかった"); return out; }

    out.got = q.type;
    out.engine = q.engine || (Q.engineOf ? Q.engineOf(q.type) : "");
    if (q.__converted) push("converted", "形式が変わった: " + String(q.__converted).slice(0, 60));

    let model = null;
    try { model = M.normalize(q); } catch (e) { push("normalize", "そろえ直しで落ちた"); return out; }

    /* ③ 保存・出題の検証 */
    try {
      const issues = [];
      V.checkQuestionRules(model, "q", issues, { requireAnswerable: true, requireRubric: true });
      issues.filter((x) => x.severity === "error" || x.level === "error")
        .forEach((x) => push("validate", x.code + "：" + String(x.message || "").slice(0, 40)));
    } catch (e) { push("validate", "検証で落ちた"); }

    /* ④ 人が解けるか */
    try {
      const a = A.check(model, {});
      if (!a.ok) push("answerable", String(a.reason || "解けない").slice(0, 60));
    } catch (e) { push("answerable", "解けるかを見られなかった"); }

    /* ⑤ 正解を入れたら満点か（**ここが本命**） */
    if (Q.isAiGraded && Q.isAiGraded(model.type)) {
      out.aiGraded = true;
      if (!model.scoringRubric || !(model.scoringRubric.items || []).length) push("rubric", "採点の観点が無い");
      if (!String(model.correctAnswer || "").trim()) push("answer", "模範解答が無い");
    } else {
      let want = null;
      try { want = C.correctValueOf(model); } catch (e) {}
      if (want === null || want === undefined) push("answer", "正解を取り出せない（正解が入っていない）");
      else {
        try {
          const r = EV.evaluate(model, want);
          out.score = r ? r.score : null; out.max = r ? r.maxScore : null;
          if (!r || !r.correct || r.score !== r.maxScore) push("score", "正解を入れても満点にならない（" + (r ? r.score + "/" + r.maxScore : "採点できず") + "）");
        } catch (e) { push("score", "採点で落ちた: " + (e && e.message)); }
      }
    }

    /* 選択肢のある形式は、中身も見る */
    const ch = Array.isArray(model.choices) ? model.choices : [];
    if (ch.length) {
      const texts = ch.map((c) => String(c.text || c.label || "").replace(/\s/g, ""));
      if (ch.length < 2) push("choices", "選択肢が 2 つ未満");
      if (new Set(texts).size !== texts.length) push("choices", "同じ選択肢がある");
      if (texts.some((t) => !t)) push("choices", "空の選択肢がある");
      const right = ch.filter((c) => c.isCorrect).length;
      if (!right) push("choices", "正解の選択肢が無い");
      if (model.engine !== "multi_choice" && right > 1) push("choices", "正解が 2 つ以上ある");
      if (model.engine === "multi_choice" && right < 2) push("choices", "複数選択なのに正解が 1 つ");
    }

    /* 問題文と解説 */
    if (!String(model.prompt || "").trim() && model.engine !== "flashcard") push("prompt", "問題文が空");
    if (!String(model.explanation || "").trim()) push("explanation", "解説が空");

    /* ⑥ 実際に描けるか */
    try {
      const h = String(R.promptHtml(model, { readonly: true }) || "") + String(R.html(model, null, { readonly: true }) || "");
      if (!h.trim()) push("render", "描いても何も出ない");
      out.html = h.length;
    } catch (e) { push("render", "描くと落ちた: " + (e && e.message)); }
    return out;
  });
};

(async () => {
  console.log("頼む内訳: " + JSON.stringify(PLAN));
  const u = "vqg" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" } });
  if (!c.j.token) { console.error("検証アカウントを作れません"); process.exit(1); }

  const t0 = Date.now();
  const total = Object.values(PLAN).reduce((x, y) => x + y, 0);
  const r = await call("/api/aigen/questions", {
    method: "POST", token: c.j.token,
    body: { prompt: PROMPT, count: total, questionTypes: Object.keys(PLAN), questionPlan: PLAN }
  });
  const raw = r.j.questions || [];
  const m = r.j.metrics || {};
  console.log("時間 " + ((Date.now() - t0) / 1000).toFixed(1) + "秒 ／ できた " + raw.length + " / " + total
    + " ／ 呼び出し " + m.aiCalls + " ／ 字数 " + ((m.tokensIn || 0) + (m.tokensOut || 0))
    + " ／ 提供元 " + JSON.stringify(m.byProvider));
  if (m.rejectReasons && Object.keys(m.rejectReasons).length) console.log("落とした理由 " + JSON.stringify(m.rejectReasons));
  if (!raw.length) { console.error("1 問も作れなかったので、確かめられません。"); process.exit(1); }

  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(UI, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.VQ2 && VQ2.aigen && VQ2.draft && VQ2.qmodel
    && VQ2.validate && VQ2.answerability && VQ2.capability && VQ2.evaluator && VQ2.qrender,
    null, { timeout: 30000 });
  const res = await pg.evaluate(AUDIT, raw);
  await br.close();

  section("1 問ずつ");
  res.forEach((x) => {
    const head = "  問" + String(x.i + 1).padStart(2) + " " + (x.asked + "                ").slice(0, 24)
      + (x.got && x.got !== x.asked ? "→ " + x.got + " " : "")
      + (x.aiGraded ? "[AI採点] " : (x.score != null ? "[" + x.score + "/" + x.max + "] " : ""));
    if (!x.defects.length) console.log(head + " ok");
    else console.log(head + " ✖ " + x.defects.map((d) => d.t + ":" + d.m).join(" ／ "));
  });

  section("まとめ");
  const bucket = {};
  res.forEach((x) => x.defects.forEach((d) => { bucket[d.t] = (bucket[d.t] || 0) + 1; }));
  const clean = res.filter((x) => !x.defects.length).length;
  console.log("   不備なし " + clean + " / " + res.length + " 問");
  if (Object.keys(bucket).length) console.log("   不備の内訳 " + JSON.stringify(bucket));

  ok("★頼んだ形式のまま届く", res.every((x) => !x.defects.some((d) => d.t === "converted" || d.t === "import")),
    res.filter((x) => x.defects.some((d) => d.t === "converted" || d.t === "import")).map((x) => x.asked + "→" + x.got));
  ok("★正解が入っている", !bucket.answer, res.filter((x) => x.defects.some((d) => d.t === "answer")).map((x) => x.asked));
  ok("★正解を入れると満点になる", !bucket.score, res.filter((x) => x.defects.some((d) => d.t === "score")).map((x) => x.asked + ":" + x.score + "/" + x.max));
  ok("★選択肢に不備が無い", !bucket.choices, res.filter((x) => x.defects.some((d) => d.t === "choices")).map((x) => x.asked + ":" + x.defects.filter((d) => d.t === "choices").map((d) => d.m).join(",")));
  ok("保存・出題の検証を通る", !bucket.validate, res.filter((x) => x.defects.some((d) => d.t === "validate")).map((x) => x.asked + ":" + x.defects.filter((d) => d.t === "validate").map((d) => d.m).join(",")));
  ok("人が解ける", !bucket.answerable, res.filter((x) => x.defects.some((d) => d.t === "answerable")).map((x) => x.asked));
  ok("問題文がある", !bucket.prompt);
  ok("解説がある", !bucket.explanation, res.filter((x) => x.defects.some((d) => d.t === "explanation")).map((x) => x.asked));
  ok("実際に描ける", !bucket.render, res.filter((x) => x.defects.some((d) => d.t === "render")).map((x) => x.asked));
  ok("採点の観点がある（記述）", !bucket.rubric, res.filter((x) => x.defects.some((d) => d.t === "rubric")).map((x) => x.asked));
  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2));

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
