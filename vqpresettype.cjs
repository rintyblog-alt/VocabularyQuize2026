/* プリセット自動作成が、**頼んだ形式どおりに作るか**を実 AI で確かめる。

   長いあいだ「何を頼んでも 4 択」になっていた。配分を先に決める作りへ変えたので、
   本当に効いているかを、実際に作らせて数える。

   見るのは 4 つ。
     ① 4 択禁止 … 1 問も 4 択が出ないか
     ② 5 形式以上 … 実際に 5 種類そろうか
     ③ 特定形式のみ … その形式だけになるか
     ④ 特定形式を除外 … 除いた形式が出ないか
   そのうえで、できたものが **保存でき・受験でき・採点できる**かまで見る。

   実行: node vqpresettype.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "artifacts", "preset-type");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* 実際の教材に近い分量（約 2,000 字）。
   サーバは「1 問あたり 120 字」を目安に資料の量を見ており、
   10〜12 問を頼むなら 1,200〜1,440 字は要る。
   ここを小さくすると、形式の話へ入る前に「資料が足りない」で止まる（実際にそうなった）。 */
const DOC = fs.readFileSync(path.join(__dirname, "tmp_exam_build", "nihonshi-large.txt"), "utf8");

const CASES = [
  { name: "4 択禁止・10 問", count: 10, exclude: ["multiple_choice_single"],
    check: (types) => ({ ok: !types.multiple_choice_single, note: "4 択 " + (types.multiple_choice_single || 0) + " 問" }) },
  { name: "5 形式以上・12 問", count: 12, style: "wide",
    check: (types) => ({ ok: Object.keys(types).length >= 5, note: Object.keys(types).length + " 形式" }) },
  { name: "正誤だけ・8 問", count: 8, types: ["true_false"],
    check: (types) => ({ ok: Object.keys(types).every((t) => t === "true_false"), note: Object.keys(types).join("/") }) },
  { name: "記述を除外・10 問", count: 10, exclude: ["long_answer", "essay"],
    check: (types) => ({ ok: !types.long_answer && !types.essay, note: Object.keys(types).join("/") }) }
];

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "ptype");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  console.log("\n══ プリセット自動作成：頼んだ形式どおりに作るか ══");
  const runs = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const t0 = Date.now();
    /* check は関数なのでブラウザへ渡せない。渡すのは値だけにする。 */
    const cc = { name: c.name, count: c.count, style: c.style, types: c.types, exclude: c.exclude };
    const r = await pg.evaluate(async ({ c, doc, first }) => {
      const AI = VQ2.ai, QPL = VQ2.qplan, QM = VQ2.qmodel, V = VQ2.validate, EV = VQ2.evaluator, ST = VQ2.store;
      const att = [{ id: "a1", name: "資料.txt", kind: "text", extractedText: doc, pageCount: 1 }];

      /* **画面と同じ道すじ**：全体の配分を 1 回だけ決め、5 問ずつの回に配って作る。
         1 回で全部作らせるのは製品の動きではない（preset-studio は BATCH = 5）。
         ここを合わせないと、製品がやっていないことを測ることになる。 */
      const BATCH = 5;
      const plan = QPL.planMix({
        count: c.count,
        style: c.types && c.types.length ? "manual" : (c.style || "auto"),
        types: c.types || [],
        exclude: c.exclude || [],
        subject: "日本史", sourceOnly: true
      });

      let pool = plan;
      const raw = [];
      let err = null;
      const done = [];
      let round = 0;
      while (raw.length < c.count && round < Math.ceil(c.count / BATCH) + 2) {
        round++;
        const n = Math.min(BATCH, c.count - raw.length);
        const got = QPL.take(pool, n);
        const sub = got.plan; pool = got.rest;
        if (!sub) break;
        let prompt = "添付した資料だけを使って、高校生向けの問題を作ってください。\n\n"
          + "この回では " + n + " 問だけ作ってください。\n\n"
          + QPL.promptFor(sub, { sourceOnly: true });
        if (done.length) {
          prompt += "\n\nすでに次の問題を作ってあります。**同じ内容の問題は作らないでください**。\n"
            + done.slice(-20).map((t, i) => (i + 1) + ". " + String(t).slice(0, 60)).join("\n");
        }
        try {
          const res = await AI.generatePreset({
            instruction: prompt, attachments: att, sourceOnly: true,
            count: n, skipDocumentAnalysis: !(first && round === 1)
          });
          const d = res.structured && res.structured.questions ? res.structured
            : (res.structured && res.structured.data) || {};
          const qs = Array.isArray(d.questions) ? d.questions : [];
          qs.slice(0, n).forEach((q) => { raw.push(q); done.push(q.question || q.prompt || ""); });
        } catch (e) {
          err = String((e && e.userMessage) || (e && e.message));
          break;
        }
      }
      if (err && !raw.length) return { err, planned: plan.items.map((x) => x.type + ":" + x.count) };
      const res = { usage: null };

      /* 画面と同じ取り込み（形式を正し、解けない形へは寄せる） */
      const imported = [];
      const importErrors = [];
      raw.forEach((q) => {
        const r2 = QPL.fromAi(q, { sourceOnly: true });
        if (!r2 || r2.error) {
          /* 何が来て落ちたのかまで残す。理由の文だけでは直せない。 */
          importErrors.push(((r2 && r2.error) || "不明")
            + "【" + String(q && q.questionType || q && q.type || "?") + " / "
            + Object.keys(q || {}).slice(0, 10).join(",") + "】");
          return;
        }
        imported.push(r2.question || r2);
      });

      const types = {};
      imported.forEach((q) => { const t = q && q.type; if (t) types[t] = (types[t] || 0) + 1; });

      /* 保存 → 受験 → 採点 まで通るか。
         **手で組み立てない。** 画面と同じ作り方（schema.emptyPreset）を使う。
         自前で作ると schemaVersion などが抜け、製品ではなくテストの落ち度で失敗する。 */
      const S = VQ2.schema;
      const preset = S.emptyPreset({
        name: "形式の確認", ownerId: ST.currentOwnerId(),
        questions: imported.map((q) => { try { return QM.normalize(q); } catch (e) { return q; } })
      });
      let saved = false, savedErr = "";
      try {
        const issues = V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true });
        const errs = issues.filter((x) => x.severity === "error");
        saved = errs.length === 0;
        savedErr = errs.slice(0, 2).map((x) => x.code + "@" + x.path).join(", ");
        if (saved) ST.savePreset(preset);
      } catch (e) { savedErr = String(e && e.message); }

      /* **解けるか・点をつけられるか。**
         「正解を入れたら満点」を測るには形式ごとに正解の形を組み立てる必要があり、
         そこを自前で書くと、テスト側のバグを製品のバグと取り違える。
         製品が実際に使っている判定（answerability）をそのまま使う。 */
      const A = VQ2.answerability;
      let gradable = 0, graded = 0;
      preset.questions.forEach((q) => {
        try {
          const c = A.check(q);
          gradable++;
          if (c && c.answerable && c.scorable) graded++;
        } catch (e) { gradable++; }
      });

      return {
        planned: plan.items.map((x) => x.type + ":" + x.count),
        got: raw.length, imported: imported.length, types,
        importErrors: importErrors.slice(0, 3),
        saved, savedErr, gradable, graded,
        usage: res.usage || null
      };
    }, { c: cc, doc: DOC, first: i === 0 });

    const ms = Date.now() - t0;
    runs.push(Object.assign({ name: c.name, ms }, r));
    console.log(`\n  ${i + 1}/${CASES.length} ${c.name}  ${Math.round(ms / 1000)}秒`);
    if (r.err) { console.log(`     失敗: ${r.err}`); ok(c.name, false, r.err); continue; }
    console.log(`     決めた内訳: ${r.planned.join(" / ")}`);
    console.log(`     できた: ${r.imported} 問  内訳 ${JSON.stringify(r.types)}`);
    if (r.importErrors.length) console.log(`     取り込めなかった理由: ${r.importErrors.join(" / ")}`);
    const v = c.check(r.types);
    ok(c.name + "：頼んだ形式どおり", v.ok, v.note);
    ok(c.name + "：頼んだ数まで作る", r.imported >= Math.ceil(c.count * 0.7),
       r.imported + " / " + c.count + " 問");
    ok(c.name + "：保存できる", r.saved, r.savedErr);
    ok(c.name + "：解けて点をつけられる", r.gradable > 0 && r.graded === r.gradable,
       r.graded + " / " + r.gradable + " 問");
  }

  /* 4 択に寄っていないか、全体でも見る */
  const all = runs.filter((r) => r.types).reduce((a, r) => {
    Object.keys(r.types).forEach((t) => { a[t] = (a[t] || 0) + r.types[t]; }); return a;
  }, {});
  const total = Object.values(all).reduce((a, b) => a + b, 0);
  const mc = all.multiple_choice_single || 0;
  console.log(`\n  全体の内訳（${total} 問）: ${JSON.stringify(all)}`);
  ok("全体として 4 択へ寄っていない", total > 0 && mc / total < 0.5,
     `4 択 ${mc} / ${total} 問（${total ? Math.round((mc / total) * 100) : 0}%）`);
  ok("形式が 5 種類以上そろう", Object.keys(all).length >= 5, Object.keys(all).length + " 形式");

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ runs, all }, null, 2));
  console.log(`記録: ${path.join(OUT, "result.json")}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
