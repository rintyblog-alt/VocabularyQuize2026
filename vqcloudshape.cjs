/* ══════════════════════════════════════════════════════════════════════
   クラウドが返した形が、画面でその形式のまま使えるか

   **不具合のほとんどはここに出る。** サーバは「分類」を作れているのに、
   画面へ渡すところで形が食い違い、黙って短答へ落ちていた（実測 2026-08-12）。
   落ちても「作れた」と数えられるので、ログだけでは気づけない。

   やること: サーバの形式ごとの見本（worker.js の shape）を
     ① toClientShape（サーバの形 → 画面の形）
     ② draftToQuestions（画面の形 → 問題）
   に通し、**頼んだ形式のまま残ったか**を見る。

   AI は呼ばない。見本は worker.js からそのまま取り出す（手書きしない）。
   使い方: node vqcloudshape.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")));
};

/* worker.js から形式ごとの見本を取り出す。**テスト側で書き写さない**
   （書き写すと、サーバを直したときにテストだけ古いままになる）。 */
function serverSamples() {
  const s = WORKER.indexOf("/* 並べ替えの札に「言葉」が入っているか");
  const e = WORKER.indexOf("function aigenQualityIssue");
  if (s < 0 || e < 0) throw new Error("形式の一覧が見つかりません");
  const E = new Function(WORKER.slice(s, e) + "\nreturn AIGEN_ENGINES;")();
  return Object.keys(E).map((k) => ({ engine: k, label: E[k].label, sample: realistic(k, JSON.parse(E[k].shape)) }));
}

/* 見本は「形の説明」なので、中身は差し替え語のまま（正解が選択肢に無い、
   並べ替えの札が全部同じ、誤りの箇所が本文に無い…）。
   そのままだと **形の食い違いではなく中身の空っぽで落ちて**、
   何を直せばよいのか分からなくなる。中身だけ実物らしくそろえる。
   **形（キーの名前と入れ子）は見本のまま**なので、契約の検査は成り立つ。 */
function realistic(engine, s) {
  if (engine === "single_choice") s.answer = s.choices[0];
  if (engine === "multi_choice") s.answer = [s.choices[0], s.choices[1]];
  if (engine === "reorder") { s.answer = ["きょうは", "とても", "よい", "天気だ"]; s.items = s.answer.slice().reverse(); }
  if (engine === "error_correction") {
    s.question = "He go to school every day.";
    s.wrong = "go"; s.correct = "goes"; s.answer = "He goes to school every day.";
  }
  if (engine === "composite") s.question = "次の文章を読んで、あとの問いに答えなさい。（本文は省略）";
  return s;
}

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.style.setProperty("display", "none", "important"); }
  });
  document.body.classList.remove("auth-booting", "auth-gate-open");
};

/* 画面の中で、見本を 2 段（toClientShape → draftToQuestions）通す。 */
const RUN = (samples) => {
  const G = VQ2.aigen, D = VQ2.draft, Q = VQ2.qtypes, V = VQ2.validate, M = VQ2.qmodel;
  return samples.map((s) => {
    const out = { engine: s.engine, label: s.label };
    try {
      const shaped = G.toClientShape(JSON.parse(JSON.stringify(s.sample)), 0);
      out.shaped = Object.keys(shaped);
      const qs = D.draftToQuestions({ questions: [shaped] });
      const q = qs && qs[0];
      if (!q) { out.error = "問題にならなかった"; return out; }
      out.type = q.type;
      out.gotEngine = q.engine || (Q.engineOf ? Q.engineOf(q.type) : "");
      out.converted = q.__converted || "";
      /* 保存・出題の検証まで通るか（正解が入っているか、中身が空でないか）。 */
      const issues = [];
      const model = M.normalize(q);
      V.checkQuestionRules(model, "q", issues, { requireAnswerable: true, requireRubric: true });
      out.errors = issues.filter((i) => i.severity === "error" || i.level === "error").map((i) => i.code);
    } catch (e) { out.error = String((e && e.message) || e); }
    return out;
  });
};

(async () => {
  const samples = serverSamples();
  console.log("サーバの形式: " + samples.length + " 件\n");
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.VQ2 && VQ2.aigen && VQ2.draft && VQ2.qmodel, null, { timeout: 30000 });
  await pg.evaluate(HIDE);
  const res = await pg.evaluate(RUN, samples);
  await br.close();

  console.log("── 形式ごと ──");
  res.forEach((r) => {
    const line = "  " + (r.engine + "            ").slice(0, 16) + " → "
      + (r.gotEngine || "(なし)") + (r.type ? " / " + r.type : "")
      + (r.error ? "  ✖ " + r.error : "")
      + ((r.errors && r.errors.length) ? "  ✖ 検証: " + r.errors.join(",") : "")
      + (r.converted ? "  ※ " + r.converted.slice(0, 40) : "");
    console.log(line);
  });

  console.log("\n── 契約 ──");
  /* サーバの形式名 → 画面のエンジン名。同じ名前でないものだけ書く。 */
  const WANT = {
    single_choice: "single_choice", multi_choice: "multi_choice", true_false: "true_false",
    text_input: "text_input", free_text: "free_text", fill_blank: "fill_blank",
    reorder: "reorder", matching: "matching", classification: "classification",
    error_correction: "error_correction", flashcard: "flashcard",
    numeric_input: "numeric_input", table_fill: "table_fill", composite: "composite"
  };
  res.forEach((r) => {
    const want = WANT[r.engine] || r.engine;
    ok(r.label + "（" + r.engine + "）が同じ形式のまま届く",
      !r.error && r.gotEngine === want,
      { 期待: want, 実際: r.gotEngine, 変換: r.converted, error: r.error });
  });
  res.forEach((r) => {
    ok(r.label + "（" + r.engine + "）が保存・出題の検証を通る",
      !r.error && Array.isArray(r.errors) && r.errors.length === 0,
      r.errors || r.error);
  });
  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2));

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
