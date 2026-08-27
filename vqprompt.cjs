/* 指示文（プロンプト）どおりに問題ができるかを、実 AI で確かめる。

   見るのは 4 つ。
     ① 頼んだ形式が出るか（形式の遵守）
     ② 資料を付けたときに作れるか（PDF・画像・スキャン）
     ③ 問題として成り立っているか（解ける・点をつけられる・保存できる）
     ④ 整合性（問題文に答えが書いていない・正解が選択肢の中にある・重複が無い）

   画面と同じ道すじ（配分を決める → 5 問ずつ回して作る）で流す。

   実行: node vqprompt.cjs [条件番号だけ流したいとき]
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ONLY = process.argv[2] ? Number(process.argv[2]) : null;
/* dev-local.sh の lans モードでは HTTPS（自己署名）で立つ。
   どちらでも動くよう既定を https にし、VQ_BASE で上書きできるようにする。 */
const BASE = process.env.VQ_BASE || "https://127.0.0.1:8791";
const URL = BASE + "/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "artifacts", "prompt");
const DOC = fs.readFileSync(path.join(__dirname, "tmp_exam_build", "nihonshi-large.txt"), "utf8");
const PNG = path.join(__dirname, "tmp_pdfs", "p1-page.png");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* 指示文と、そこから期待できること。
   expect は「その形式が 1 問でも出ること」、forbid は「1 問も出ないこと」。 */
const CASES = [
  { name: "正誤問題だけ", prompt: "正誤問題だけで 8 問作ってください。", count: 8,
    expect: ["true_false"], onlyThese: ["true_false"], src: "text" },
  { name: "空欄補充と正誤を半々", prompt: "空欄補充を 4 問、正誤を 4 問つくってください。", count: 8,
    expect: ["fill_blank", "true_false"], src: "text" },
  { name: "4択を使わない", prompt: "4択は使わないでください。一問一答と組み合わせを中心に 8 問。", count: 8,
    expect: ["word_input"], forbid: ["multiple_choice_single"], src: "text" },
  { name: "画像の資料から", prompt: "この資料から 6 問つくってください。正誤を混ぜてください。", count: 6,
    expect: ["true_false"], src: "image" }
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
    setV(document.getElementById("authLoginNickname"), "prompt");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true          /* 自己署名証明書のため */
  })).newPage();
  await login(pg);
  const imgB64 = fs.existsSync(PNG) ? fs.readFileSync(PNG).toString("base64") : null;

  console.log("\n══ 指示どおりに作れるか（実 AI）══");
  const runs = [];
  for (let i = 0; i < CASES.length; i++) {
    if (ONLY !== null && ONLY !== i + 1) continue;
    const c = CASES[i];
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ c, doc, imgB64 }) => {
      const AI = VQ2.ai, BP = VQ2.blueprint, QPL = VQ2.qplan,
            QM = VQ2.qmodel, S = VQ2.schema, V = VQ2.validate, A = VQ2.answerability;
      const att = c.src === "image"
        ? [{ id: "a1", name: "資料.png", kind: "image", pageCount: 1, imageBase64: imgB64 }]
        : [{ id: "a1", name: "資料.txt", kind: "text", extractedText: doc, pageCount: 1 }];

      /* 画面と同じ：指示から要件を読み、配分を決める */
      const req = BP.extractRequirements(c.prompt, { count: c.count, sourceOnly: true });
      const cand = BP.candidates(req, null, {});
      const exclude = (cand.excluded || []).map((e) => e.type).concat(req.excludedTypes || []);
      const full = QPL.planMix({
        count: c.count,
        style: req.onlyRequested ? "manual" : (req.style || "auto"),
        types: req.onlyRequested ? req.requestedTypes : [],
        requestedTypes: req.requestedTypes,
        exclude, sourceOnly: true, requirements: req
      });

      const BATCH = 5;
      let pool = full, raw = [], done = [], err = null, round = 0;
      while (raw.length < c.count && round < Math.ceil(c.count / BATCH) + 2) {
        round++;
        const n = Math.min(BATCH, c.count - raw.length);
        const got = QPL.take(pool, n); const sub = got.plan; pool = got.rest;
        if (!sub) break;
        let prompt = c.prompt + "\n\nこの回では " + n + " 問だけ作ってください。\n\n"
          + QPL.promptFor(sub, { sourceOnly: true });
        if (done.length) prompt += "\n\nすでに作った問題（同じ内容にしないでください）:\n"
          + done.slice(-15).map((t, k) => (k + 1) + ". " + String(t).slice(0, 50)).join("\n");
        try {
          const res = await AI.generatePreset({
            instruction: prompt, attachments: att, sourceOnly: true, count: n,
            /* この回で作ってよい形式。サーバ側で JSON Schema の enum を絞る。
               **文章で頼むだけでは守られない**ので、ここを渡すのが要。 */
            questionTypes: sub.items.map((x) => x.type),
            skipDocumentAnalysis: round > 1
          });
          const d = res.structured && res.structured.questions ? res.structured
            : (res.structured && res.structured.data) || {};
          /* 画面と同じで、同じ問題は捨てて次の回で埋める（preset-studio の dropDuplicates）。
             ここを省くと、テストだけが重複を数えてしまう。 */
          const key = (t) => String(t || "").replace(/\s+/g, "").slice(0, 60);
          const seen = new Set(done.map(key));
          (Array.isArray(d.questions) ? d.questions : []).forEach((q) => {
            if (raw.length >= c.count) return;
            const k = key(q.question);
            if (!k || seen.has(k)) return;
            seen.add(k); raw.push(q); done.push(q.question || "");
          });
        } catch (e) { err = String((e && e.userMessage) || (e && e.message)).slice(0, 100); break; }
      }
      if (err && !raw.length) return { err, planned: full.summary };

      /* **モデルが何と書いてきたか**を、取り込む前に控える。
         取り込みで変わったのか、そもそも違う形式で返ってきたのかを分けるため。 */
      const rawTypes = {};
      raw.forEach((q) => {
        const t = String((q && (q.questionType || q.type)) || "?");
        rawTypes[t] = (rawTypes[t] || 0) + 1;
      });
      const imported = [], importErrors = [], droppedShapes = [];
      raw.forEach((q) => {
        const r2 = QPL.fromAi(q, { sourceOnly: true });
        if (!r2 || r2.error) {
          importErrors.push(r2 && r2.error);
          /* 何が来て落ちたのかを、本文を出さずに言う（鍵の名前と正解欄の値だけ）。 */
          droppedShapes.push({ keys: Object.keys(q || {}).join(","),
                               correctAnswer: String(JSON.stringify(q && q.correctAnswer)).slice(0, 40),
                               answer: String(JSON.stringify(q && q.answer)).slice(0, 40),
                               choices: Array.isArray(q && q.choices) ? q.choices.length : null });
          return;
        }
        imported.push(QM.normalize(r2.question || r2));
      });
      const types = {};
      imported.forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });

      /* 保存できるか */
      const preset = S.emptyPreset({ name: "指示の確認", ownerId: VQ2.store.currentOwnerId(), questions: imported });
      const issues = V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true });
      const errs = issues.filter((x) => x.severity === "error");

      /* 解ける・点をつけられる */
      let good = 0;
      imported.forEach((q) => { try { const k = A.check(q); if (k.answerable && k.scorable) good++; } catch (e) {} });

      /* 整合性 */
      const badAnswerInPrompt = errs.filter((x) => x.code === "answerInPrompt").length;
      const texts = imported.map((q) => String(q.prompt || "").replace(/\s+/g, ""));
      const dup = texts.length - new Set(texts).size;

      return {
        planned: full.summary, made: imported.length, types, rawTypes,
        importErrors: importErrors.filter(Boolean).slice(0, 3),
        droppedShapes: droppedShapes.slice(0, 3),
        saveOk: errs.length === 0,
        saveErrors: errs.slice(0, 3).map((x) => x.code + "@" + x.path),
        /* どの形の問題で落ちたのかを、中身を出さずに言えるようにする
           （選択肢の本文は出さない。長さと正解の印だけ）。 */
        badShapes: errs.slice(0, 3).map((x) => {
          const m = String(x.path || "").match(/questions\[(\d+)\]/);
          const q = m ? imported[Number(m[1])] : null;
          if (!q) return x.code + ":該当なし";
          return x.code + ":" + q.type + " 選択肢"
            + (q.choices || []).map((c) => String(c.text || "").length + (c.isCorrect ? "◯" : "")).join(",");
        }),
        answerable: good, dup, badAnswerInPrompt, err
      };
    }, { c, doc: DOC, imgB64 });

    const ms = Math.round((Date.now() - t0) / 1000);
    runs.push(Object.assign({ name: c.name, ms }, r));
    console.log(`\n  ${i + 1}) ${c.name}  ${ms}秒`);
    console.log(`     指示: ${c.prompt}`);
    if (r.err && !r.made) { console.log(`     失敗: ${r.err}`); ok(c.name, false, r.err); continue; }
    console.log(`     決めた配分: ${r.planned}`);
    console.log(`     できた: ${r.made} 問  内訳 ${JSON.stringify(r.types)}`);
    if (r.rawTypes) console.log(`     モデルの返答そのもの: ${JSON.stringify(r.rawTypes)}`);
    if (r.importErrors.length) console.log(`     取り込めず: ${r.importErrors.join(" / ")}`);
    if ((r.droppedShapes || []).length)
      console.log(`     落ちたものの形: ${r.droppedShapes.map((d) => JSON.stringify(d)).join(" ｜ ")}`);

    (c.expect || []).forEach((t) => {
      ok(`${c.name}：頼んだ「${t}」が出る`, (r.types[t] || 0) > 0, JSON.stringify(r.types));
    });
    (c.forbid || []).forEach((t) => {
      ok(`${c.name}：使わないと言った「${t}」が出ない`, !(r.types[t] > 0), JSON.stringify(r.types));
    });
    if (c.onlyThese) {
      ok(`${c.name}：頼んだ形式だけになる`,
         Object.keys(r.types).every((t) => c.onlyThese.indexOf(t) >= 0), JSON.stringify(r.types));
    }
    ok(`${c.name}：頼んだ数まで作る`, r.made >= Math.ceil(c.count * 0.7), `${r.made} / ${c.count} 問`);
    ok(`${c.name}：保存できる`, r.saveOk, (r.saveErrors || []).join(", ")
       + ((r.badShapes || []).length ? " ／ " + r.badShapes.join(" ｜ ") : ""));
    ok(`${c.name}：全部が解けて点をつけられる`, r.made > 0 && r.answerable === r.made,
       `${r.answerable} / ${r.made}`);
    ok(`${c.name}：問題文に答えが書かれていない`, r.badAnswerInPrompt === 0, String(r.badAnswerInPrompt));
    ok(`${c.name}：同じ問題が重複していない`, r.dup === 0, `${r.dup} 件`);
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(runs, null, 2));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
