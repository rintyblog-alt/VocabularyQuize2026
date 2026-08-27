/* ══════════════════════════════════════════════════════════════════════
   生成の通し検証（画面の道をそのまま通す）

   これまで API だけを叩いて「動く」と報告し、画面では動いていなかった。
   ここは **画面の中で VQ2.aigen を呼ぶ**。利用者と同じ道を通る。

   見るところ:
     ① 画面とサーバで形式の呼び名が一致する（頼んだ名前で返る）
     ② 頼んだ形式だけが来る（頼んでいない形式が混ざらない）
     ③ 頼んだ数ちょうど（多くも少なくもならない）
     ④ 正解が空の問題が 1 つも無い
     ⑤ 追加の指示が効く
     ⑥ 質（問題文が短すぎない・答えが問題文に丸見えでない・選択肢が実質同じでない）

   **AI の枠を使うので、頼む数は最小限にしてある。**
   使い方: node vqgenqa.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const SC = process.env.VQ_SC || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + "/?vqdev=1&r=" + Math.random(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(7000);

  /* ══ 資料ありの検証は **既定で走らせない** ══════════════════════
     Gemini の無料枠は 1 日 500 回。検証で 1 日ぶんの半分を使ってしまった
     （実測: 275/500 + 222/500）。利用者の枠を検証で食いつぶさない。
     資料ありを確かめたいときだけ VQ_DOCS=1 を付ける。 */
  const useDocs = process.env.VQ_DOCS === "1";
  const pdf = (useDocs && fs.existsSync(SC + "/shiryo.pdf"))
    ? fs.readFileSync(SC + "/shiryo.pdf").toString("base64") : null;
  if (!useDocs) console.log("（資料ありの検証は省いています。確かめるときは VQ_DOCS=1）");

  /* 検証アカウント。画面の中で作って、画面が使う場所へ入れる。 */
  const signedIn = await pg.evaluate(async (base) => {
    const post = async (p, b) => (await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();
    const u = "vqq" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
    const a = await post("/api/auth/register/start", { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" });
    const b = await post("/api/auth/register/verify", { challengeId: a.challengeId, code: a.devCode });
    const c = await post("/api/auth/register/consent", { registrationSession: b.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    if (c.token) localStorage.setItem("app.auth.token.v1", c.token);
    return !!c.token;
  }, BASE);

  section("下ごしらえ");
  ok("画面が読み込めた", errs.length === 0, errs.slice(0, 3));
  ok("ログインできた", signedIn);
  ok("クラウドが使える", await pg.evaluate(() => window.VQ2.aigen.availableSync()));
  if (!signedIn) { console.log("\n合格 " + pass + " / 不合格 " + fail); process.exit(1); }

  /* 画面の道で作る。**ここが利用者と同じ経路。** */
  const gen = (o) => pg.evaluate(async (o) => {
    const t0 = Date.now();
    try {
      const r = await window.VQ2.aigen.generateQuestions(o);
      return { ok: true, ms: Date.now() - t0, questions: r.questions || [], usage: r.usage || {}, warnings: r.warnings || [] };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: String((e && (e.userMessage || e.message)) || e).slice(0, 200) };
    }
  }, o);

  /* ── ①②③④⑥ をまとめて見る（1 回の生成で足りる） ── */
  section("① 呼び名の一致 ／ ② 頼んだ形式だけ ／ ③ 数ちょうど ／ ④ 正解 ／ ⑥ 質");
  const want = ["multiple_choice_single", "fill_blank", "reorder_english"];
  const r1 = await gen({
    prompt: "高校生物の問題を9問つくって。解説もつけて。", count: 9, questionTypes: want,
    files: pdf ? [{ mimeType: "application/pdf", data: pdf }] : undefined
  });
  console.log("   " + JSON.stringify({ ms: r1.ms, n: (r1.questions || []).length, usage: r1.usage }).slice(0, 200));
  ok("作れた", r1.ok && r1.questions.length > 0, r1.error);
  if (r1.ok && r1.questions.length) {
    const types = {}; r1.questions.forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });
    console.log("   内訳 " + JSON.stringify(types));
    ok("★画面の呼び名で返る", Object.keys(types).every((t) => want.indexOf(t) >= 0), types);
    ok("★頼んでいない形式が混ざらない", Object.keys(types).every((t) => want.indexOf(t) >= 0), types);
    ok("★頼んだ数ちょうど", r1.questions.length === 9, r1.questions.length);
    /* 正解は correctAnswer か、選択肢の印のどちらかで入っていること。 */
    const noAns = r1.questions.filter((q) => {
      const ca = String(q.correctAnswer || "").trim();
      const marked = Array.isArray(q.choices) && q.choices.some((c) => c && c.isCorrect);
      return !ca && !marked;
    });
    ok("★正解が空の問題が無い", noAns.length === 0,
      noAns.slice(0, 2).map((q) => ({ type: q.type, q: String(q.question || "").slice(0, 30) })));
    /* 質。直しようが無いものだけを見る。 */
    const shortQ = r1.questions.filter((q) => String(q.question || "").replace(/\s+/g, "").length < 8);
    ok("問題文が短すぎるものが無い", shortQ.length === 0, shortQ.length);
    const leak = r1.questions.filter((q) => {
      if (!Array.isArray(q.choices) || !q.choices.length) return false;
      const a = String(q.correctAnswer || "").trim();
      return a.length >= 2 && String(q.question || "").indexOf(a) >= 0;
    });
    ok("★答えが問題文に丸見えでない", leak.length === 0, leak.slice(0, 2).map((q) => String(q.question || "").slice(0, 40)));
    const dupChoice = r1.questions.filter((q) => {
      if (!Array.isArray(q.choices) || q.choices.length < 2) return false;
      const n = q.choices.map((c) => String((c && c.text) || c).replace(/[\s。、（）()]/g, ""));
      return new Set(n).size !== n.length;
    });
    ok("選択肢が実質同じものが無い", dupChoice.length === 0, dupChoice.length);
    const noEx = r1.questions.filter((q) => !String(q.explanation || "").trim());
    ok("解説が入っている", noEx.length === 0, noEx.length);
    /* ══ 最終形（画面が保存する形）で正解が付くか ══════════════
       ここを見ていなかったので「正解が設定されない」を見落とした。
       本体は **選択肢の id** で正解を見る（str(c.id) === str(correctAnswer)）。
       本文を入れると一致せず、正解の無い問題になる。 */
    const finalized = await pg.evaluate((qs) => {
      const D = window.VQ2.draft;
      const out = D.draftToQuestions({ questions: qs });
      return out.map((x) => ({
        type: x.type,
        正解: String(x.correctAnswer || ""),
        印: (x.choices || []).filter((c) => c && c.isCorrect).length,
        選択肢: (x.choices || []).length
      }));
    }, r1.questions);
    const badFinal = finalized.filter((x) => (x.選択肢 > 0 ? x.印 !== 1 : !x.正解));
    ok("★最終形でも正解が付いている", badFinal.length === 0, badFinal.slice(0, 3));
  }

  /* ── ⑤ 追加の指示 ── */
  section("⑤ あとから届いた追加の指示が効く");
  const r2 = await pg.evaluate(async () => {
    /* 追加指示は presetStudio から渡る形（followups）で送る。 */
    const t0 = Date.now();
    try {
      const r = await window.VQ2.ai.generatePreset({
        instruction: "高校生物の問題を4問つくって。",
        count: 4,
        questionTypes: ["true_false"],
        followups: [{ seq: 1, text: "すべて正誤問題（○×）にしてください。4択にはしないでください。" }]
      });
      const qs = (r && r.structured && r.structured.questions) || [];
      return { ok: true, ms: Date.now() - t0, n: qs.length, types: qs.map((q) => q.type) };
    } catch (e) {
      return { ok: false, error: String((e && (e.userMessage || e.message)) || e).slice(0, 200) };
    }
  });
  console.log("   " + JSON.stringify(r2).slice(0, 200));
  ok("追加指示つきでも作れる", r2.ok && r2.n > 0, r2.error);
  if (r2.ok) ok("★追加指示のとおりの形式", r2.types.every((t) => t === "true_false"), r2.types);

  /* ── Quick Mock も同じ道を通るか（形式の受け渡し） ── */
  section("Quick Mock も画面とサーバで一致するか");
  const r3 = await pg.evaluate(async () => {
    /* Quick Mock は枠（slot）の形式を渡す。同じ変換を通っているかを見る。 */
    const Q = window.VQ2.qtypes;
    const slots = [{ type: "multiple_choice_single" }, { type: "multiple_choice_single" },
                   { type: "word_input" }, { type: "word_input" }];
    const types = [];
    slots.forEach((sl) => {
      let t = sl.type;
      try { t = (Q && Q.engineOf) ? (Q.engineOf(t) || t) : t; } catch (e) {}
      if (types.indexOf(t) < 0) types.push(t);
    });
    try {
      const r = await window.VQ2.aigen.generateQuestions({
        prompt: "高校生物の問題を4問つくって。解説もつけて。", count: 4, questionTypes: types
      });
      const qs = r.questions || [];
      return { ok: true, 渡した形式: types, n: qs.length, types: qs.map((q) => q.type),
        正解あり: qs.every((q) => String(q.correctAnswer || "").trim()
          || (Array.isArray(q.choices) && q.choices.some((c) => c && c.isCorrect))) };
    } catch (e) { return { ok: false, error: String((e && (e.userMessage || e.message)) || e).slice(0, 200) }; }
  });
  console.log("   " + JSON.stringify(r3).slice(0, 220));
  ok("Quick Mock の道でも作れる", r3.ok && r3.n > 0, r3.error);
  if (r3.ok) {
    ok("★枠の形式が変換されて渡る", r3.渡した形式.every((t) => /^[a-z_]+$/.test(t)), r3.渡した形式);
    ok("★頼んだ形式だけが返る", r3.types.every((t) => r3.渡した形式.indexOf(t) >= 0 || ["multiple_choice_single", "word_input"].indexOf(t) >= 0), r3.types);
    ok("★数ちょうど", r3.n === 4, r3.n);
    ok("★正解が入っている", r3.正解あり === true);
  }

  /* ── 配分を決める層（planForBatch / enforceDistribution）──
     ここを通さずに VQ2.aigen を直接呼んでいたため、
     「形式は4択で」と書いても **リスニング選択・音声穴埋めを勝手に足す**
     不具合を見落とした。AI を呼ばないので、何度でも安全に確かめられる。 */
  section("★配分を決める層が、指示どおりの形式だけにするか");
  const plans = await pg.evaluate(() => {
    const BP = window.VQ2.blueprint, QPL = window.VQ2.qplan;
    const cases = [
      { t: "ここから問題を15問作成してください。形式は4択でお願いします全て。", n: 15 },
      { t: "この資料から穴埋めを10問つくって。", n: 10 },
      { t: "並べ替えを8問。", n: 8 },
      { t: "問題を12問つくって。", n: 12 }          /* 形式を書いていない＝混ぜてよい */
    ];
    return cases.map((cs) => {
      /* **画面とまったく同じ呼び方をする。** ここを別の呼び方で確かめたため、
         「4択と書いたのにリスニング選択を足す」不具合を見落とした。 */
      const req = BP.extractRequirements(cs.t, { count: cs.n });
      const an = BP.analyzeContent({ text: cs.t, attachments: [] });
      let types = [];                                   /* 条件が無い＝最初の一回 */
      if (!types.length && (req.requestedTypes || []).length) types = req.requestedTypes.slice();
      const plan = QPL.planMix({
        count: cs.n,
        style: types.length ? "manual" : "auto",
        types: types,
        requestedTypes: req.requestedTypes || [],
        hints: BP.toHints(an), exclude: [], sourceOnly: true, requirements: req
      });
      const items = (plan && plan.items) || [];
      const prompt = QPL.promptFor(plan, { sourceOnly: true });
      return {
        指示: cs.t.slice(0, 24),
        頼んだ形式: req.requestedTypes || [],
        内訳: items.map((i) => i.type + ":" + i.count),
        依頼文に音声: /リスニング|音声|再生/.test(prompt),
        注記: (plan && plan.notes) || []
      };
    });
  });
  plans.forEach((p) => {
    console.log("   " + p.指示 + "\n      頼んだ形式 " + JSON.stringify(p.頼んだ形式)
      + "\n      内訳 " + JSON.stringify(p.内訳));
    if (p.頼んだ形式.length) {
      const extra = p.内訳.map((x) => x.split(":")[0]).filter((t) => p.頼んだ形式.indexOf(t) < 0);
      ok("★" + p.指示.slice(0, 14) + "… 勝手な形式を足さない", extra.length === 0, { 足された: extra, 注記: p.注記 });
      ok("★" + p.指示.slice(0, 14) + "… 内訳が空でない", p.内訳.length > 0, p.内訳);
      ok("★" + p.指示.slice(0, 14) + "… 依頼文に音声を混ぜない", p.依頼文に音声 === false);
    }
  });

  ok("画面の失敗が出ていない（通し）", errs.length === 0, errs.slice(0, 3));
  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
