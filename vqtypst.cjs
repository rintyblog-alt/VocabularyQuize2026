/* Quick Mock の紙面を Typst で本当に組めるかを、実データで確かめる。

   これまで「Typst は未導入」だった（CLI が端末に無いだけで、
   ソースを組み立てる側と Bridge の口はそろっていた）。
   CLI を入れたので、**問題 → Typst ソース → PDF** まで通るかを見る。

   テンプレートは校内テストと定期考査（見開き）など、実際に選べるものを回す。

   実行: node vqtypst.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "artifacts", "typst");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* 実際の試験に近い形（大問 2 つ・形式ちがい・配点つき）。 */
function makeSpec() {
  const q = (id, type, prompt, extra) => Object.assign({
    id, type, prompt, points: 5, difficulty: "standard",
    explanation: "資料のとおり。", sourceReferences: []
  }, extra || {});
  return {
    id: "typst-spec", title: "1学期期末考査", subject: "日本史探究", grade: "H3",
    durationMinutes: 50, totalPoints: 40, ownerId: "typst",
    sections: [
      { id: "s1", number: 1, name: "大問1　律令国家の成立", score: 20,
        instructions: "次の問いに答えなさい。",
        questions: [
          q("q1", "multiple_choice_single", "大化の改新が始まった年として正しいものを一つ選びなさい。", {
            choices: [{ id: "c1", text: "645年", isCorrect: true }, { id: "c2", text: "701年" },
                      { id: "c3", text: "710年" }, { id: "c4", text: "743年" }] }),
          q("q2", "true_false", "大宝律令は 701 年に完成した。", {
            choices: [{ id: "c1", text: "正しい", isCorrect: true }, { id: "c2", text: "誤っている" }] }),
          q("q3", "short_answer", "三世一身法が出された年を答えなさい。", { correctAnswer: "723年" }),
          q("q4", "fill_blank", "743年の【　】により、開墾地の永久私有が認められた。", {
            blanks: [{ id: "b1", label: "1", answer: "墾田永年私財法", acceptedAnswers: [] }] })
        ] },
      { id: "s2", number: 2, name: "大問2　摂関政治と国風文化", score: 20,
        instructions: "次の問いに答えなさい。",
        questions: [
          q("q5", "short_answer", "摂関政治が最も栄えたころの摂政の名を答えなさい。", { correctAnswer: "藤原道長" }),
          q("q6", "long_answer", "遣唐使の停止が文化に与えた影響を、80 字程度で説明しなさい。", {
            points: 10, correctAnswer: "中国文化の直接の流入が減り、かな文字を用いた国風文化が育った。",
            expectedChars: 80,
            scoringRubric: { items: [
              { id: "r1", description: "遣唐使の停止に触れている", points: 4, criterionId: "knowledge_skill" },
              { id: "r2", description: "国風文化の特徴に触れている", points: 6, criterionId: "thinking_judgment_expression" }
            ] } }),
          q("q7", "ordering", "次の出来事を古い順に並べなさい。", {
            orderItems: [{ id: "i1", text: "平城京へ遷都", order: 1 },
                         { id: "i2", text: "平安京へ遷都", order: 2 },
                         { id: "i3", text: "遣唐使の停止", order: 3 }],
            correctOrder: ["i1", "i2", "i3"] })
        ] }
    ]
  };
}

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
    setV(document.getElementById("authLoginNickname"), "typst");
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

  /* ── 1) Typst が使えると分かるか ── */
  const cap = await pg.evaluate(async () => {
    const P = window.__vqLocalAI;
    if (!P) return { err: "Bridge が読み込まれていません" };
    const r = await fetch(P.url() + "/typst/capability", { headers: { Authorization: "Bearer " + P.token() } });
    return await r.json();
  });
  console.log("\n══ Typst の用意 ══");
  console.log(`  使える: ${cap.available} / 版: ${cap.version || "—"} ${cap.reason ? "（" + cap.reason + "）" : ""}`);
  ok("Typst が使える", cap.available === true, cap.reason || "");
  if (!cap.available) {
    console.log("");
    log.forEach((l) => console.log(l));
    console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
    await browser.close();
    process.exit(1);
  }

  /* ── 2) テンプレートごとに、問題 → Typst → PDF が通るか ── */
  /* Quick Mock の画面で実際に選べるのは Layout Grammar の「文書形式」。
     ここが available:false だと、選んでも既定へ落とされる（＝選べるふり）。 */
  const templates = await pg.evaluate(() =>
    VQ2.layoutGrammar.DOCUMENT_FAMILY_IDS.map((id) => ({
      id, name: VQ2.layoutGrammar.DOCUMENT_FAMILIES[id].name,
      available: VQ2.layoutGrammar.DOCUMENT_FAMILIES[id].available })));
  console.log(`\n══ 選べる紙面の体裁（${templates.length} 種）══`);
  templates.forEach((t) => console.log(`  ・${t.name}（${t.id}）${t.available ? "" : " ← 準備中"}`));
  ok("紙面の体裁が選べる", templates.filter((t) => t.available).length >= 5,
     templates.filter((t) => t.available).length + " 種が使える");
  ok("定期考査の体裁が使える", templates.some((t) => t.id === "school-exam-standard" && t.available));
  ok("共通テスト型の体裁が使える", templates.some((t) => t.id === "common-test-style" && t.available));

  const TRY = templates.filter((t) => t.available).map((t) => t.id);
  for (const tid of TRY) {
    
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ spec, tid }) => {
      const TR = VQ2.typstRenderer, LG = VQ2.layoutGrammar, LPF = VQ2.layoutProfiles, P = window.__vqLocalAI;
      if (!TR || !LG) return { err: "typstRenderer / layoutGrammar が読み込まれていません" };
      /* 画面と同じ道すじ：意味の設計図（semantic）→ Typst ソース */
      let built;
      try {
        const sem = LG.buildSemanticPlan(spec, {
          rng: LPF ? LPF.rng(tid + "|semantic") : undefined,
          documentFamily: tid, subject: null,
          cover: !!(VQ2.layoutGrammar.DOCUMENT_FAMILIES[tid] || {}).cover
        });
        const outAll = TR.buildAll(spec, sem, { showExplanation: false });
        if (!outAll.ok) return { err: "ソースを作れません: "
          + ((outAll.questionPaper && outAll.questionPaper.message) || "理由なし") };
        built = { usedFamily: sem.documentFamily, parts: [
          { id: "question", label: "問題冊子", source: outAll.questionPaper.source },
          { id: "answerSheet", label: "解答用紙", source: outAll.answerSheet.source },
          { id: "answerKey", label: "模範解答", source: outAll.answerKey.source }
        ], assets: outAll.assets || [] };
      } catch (e) { return { err: "ソースを作れません: " + String(e && e.message).slice(0, 140) }; }

      const out = [];
      for (const part of built.parts) {
        const res = await fetch(P.url() + "/typst/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + P.token() },
          body: JSON.stringify({ source: part.source, assets: built.assets || [], png: false })
        });
        const j = await res.json();
        out.push({
          id: part.id, label: part.label, ok: !!j.ok,
          pages: j.report && j.report.pageCount ? j.report.pageCount : (j.pages || []).length,
          bytes: j.pdfBase64 ? Math.round(j.pdfBase64.length * 0.75) : 0,
          errors: ((j.report && j.report.errors) || []).slice(0, 2).map((e) => e.message)
        });
      }
      return { parts: out, usedFamily: built.usedFamily,
               sourceChars: built.parts.reduce((a, p) => a + p.source.length, 0) };
    }, { spec: makeSpec(), tid });

    const ms = Math.round((Date.now() - t0) / 1000);
    console.log(`\n══ ${tid}  ${ms}秒 ══`);
    if (r.err) { console.log(`  ${r.err}`); ok(`${tid}：組版が通る`, false, r.err); continue; }
    r.parts.forEach((p) => console.log(`  ${p.label}: ${p.ok ? "OK" : "NG"} / ${Math.round(p.bytes / 1024)} KB`
      + (p.errors.length ? " / " + p.errors.join(" | ") : "")));
    ok(`${tid}：問題冊子が組める`, r.parts.some((p) => p.id === "question" && p.ok && p.bytes > 0),
       JSON.stringify(r.parts.map((p) => p.id + ":" + p.ok)));
    ok(`${tid}：解答用紙が組める`, r.parts.some((p) => p.id === "answerSheet" && p.ok && p.bytes > 0),
       JSON.stringify(r.parts.map((p) => p.id + ":" + p.ok)));
    ok(`${tid}：選んだ体裁が使われる`, r.usedFamily === tid, "実際は " + r.usedFamily);
    ok(`${tid}：模範解答が組める`, r.parts.some((p) => p.id === "answerKey" && p.ok && p.bytes > 0),
       JSON.stringify(r.parts.map((p) => p.id + ":" + p.ok)));
    fs.writeFileSync(path.join(OUT, tid + ".json"), JSON.stringify(r, null, 2));
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n記録: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
