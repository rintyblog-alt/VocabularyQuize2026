/* 問題データ → TeX ソース → PDF が、画面と同じ道すじで通るかを確かめる。

   Typst と別に TeX を持つ理由は **縦書き**。
   Typst は縦組みを持っていないので、国語の紙面はこちらでしか作れない。
   だから「横書きが組める」だけでなく「縦書きも組める」ことまで見る。

   実行: node vqtex.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "artifacts", "tex");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

function makeSpec() {
  const q = (id, type, prompt, extra) => Object.assign({
    id, type, prompt, points: 5, difficulty: "standard",
    explanation: "資料のとおり。", sourceReferences: []
  }, extra || {});
  return {
    id: "tex-spec", title: "1学期期末考査", subject: "日本史探究", grade: "H3",
    durationMinutes: 50, totalPoints: 40, ownerId: "tex",
    sections: [
      { id: "s1", number: 1, name: "律令国家の成立", score: 20,
        instructions: "次の問いに答えなさい。",
        questions: [
          q("q1", "multiple_choice_single", "大化の改新が始まった年として正しいものを一つ選びなさい。", {
            choices: [{ id: "c1", text: "645年", isCorrect: true }, { id: "c2", text: "701年" },
                      { id: "c3", text: "710年" }, { id: "c4", text: "743年" }] }),
          q("q2", "true_false", "大宝律令は 701 年に完成した。", {
            choices: [{ id: "c1", text: "正しい", isCorrect: true }, { id: "c2", text: "誤っている" }] }),
          q("q3", "fill_blank", "743年の【　】により、開墾地の永久私有が認められた。", {
            blanks: [{ id: "b1", label: "1", answer: "墾田永年私財法", acceptedAnswers: [] }] }),
          /* 組版を壊しにいく文字。ここが素通りすると、問題文が命令として動く。 */
          q("q4", "short_answer", "特殊文字 # $ % & _ { } ~ ^ \\ を含む設問です。", { correctAnswer: "答え" })
        ] },
      { id: "s2", number: 2, name: "摂関政治と国風文化", score: 20,
        instructions: "次の問いに答えなさい。",
        questions: [
          q("q5", "long_answer", "遣唐使の停止が文化に与えた影響を、80 字程度で説明しなさい。", {
            points: 10, correctAnswer: "国風文化が育った。", expectedChars: 80,
            scoringRubric: { items: [
              { id: "r1", description: "遣唐使の停止に触れている", points: 4, criterionId: "knowledge_skill" },
              { id: "r2", description: "国風文化の特徴に触れている", points: 6, criterionId: "thinking_judgment_expression" }
            ] } }),
          q("q6", "ordering", "次の出来事を古い順に並べなさい。", {
            orderItems: [{ id: "i1", text: "平城京へ遷都", order: 1 },
                         { id: "i2", text: "平安京へ遷都", order: 2 },
                         { id: "i3", text: "遣唐使の停止", order: 3 }],
            correctOrder: ["i1", "i2", "i3"] }),
          q("q7", "matching", "用語と意味を結びなさい。", {
            pairs: { left: [{ id: "L1", text: "摂政" }, { id: "L2", text: "関白" }],
                     right: [{ id: "R1", text: "幼い天皇の代行" }, { id: "R2", text: "成人天皇の補佐" }],
                     correct: { L1: "R1", L2: "R2" } } })
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
    setV(document.getElementById("authLoginNickname"), "tex");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  console.log("\n══ TeX の用意 ══");
  const cap = await pg.evaluate(async () => {
    const P = window.__vqLocalAI;
    if (!P) return { err: "Bridge が読み込まれていません" };
    const r = await fetch(P.url() + "/tex/capability", { headers: { Authorization: "Bearer " + P.token() } });
    return await r.json();
  });
  console.log(`  使える: ${cap.available} / 版: ${cap.version || "—"} ${cap.reason ? "（" + cap.reason + "）" : ""}`);
  ok("TeX が使える", cap.available === true, cap.reason || "");
  ok("出荷するコードに TeX Renderer が入っている",
     await pg.evaluate(() => !!(window.VQ2 && VQ2.texRenderer && VQ2.texEscape)));

  /* 文章がそのまま命令にならないこと。ここが破れると何を組んでも危ない。 */
  console.log("\n══ 文章が命令にならないか ══");
  const esc = await pg.evaluate(() => {
    const E = VQ2.texEscape;
    return {
      backslash: E.txt("\\newpage"),
      brace: E.txt("a{b}c"),
      dollar: E.txt("100$ & 5%"),
      audit: E.audit("\\write18{rm -rf /}").ok,
      auditOk: E.audit("\\vqAna{ア}").ok
    };
  });
  ok("バックスラッシュが命令にならない", esc.backslash.indexOf("\\newpage") < 0, esc.backslash);
  ok("波括弧が閉じ括弧にならない", esc.brace === "a\\{b\\}c", esc.brace);
  ok("$ と % と & が潰れる", esc.dollar === "100\\$ \\& 5\\%", esc.dollar);
  ok("危ない命令を含むソースは通さない", esc.audit === false);
  ok("ふつうのソースは通す", esc.auditOk === true);

  /* 横書き・縦書きの両方で、3 点そろって PDF になるか。 */
  const CASES = [
    { name: "横書き（定期考査）", family: "school-exam-standard", vertical: false },
    { name: "共通テスト風", family: "common-test-style", vertical: false },
    { name: "縦書き（国語）", family: "school-exam-standard", vertical: true }
  ];
  for (const c of CASES) {
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ spec, c }) => {
      const TR = VQ2.texRenderer, LG = VQ2.layoutGrammar, LPF = VQ2.layoutProfiles, P = window.__vqLocalAI;
      if (!TR || !LG) return { err: "texRenderer / layoutGrammar が読み込まれていません" };
      let out;
      try {
        const sem = LG.buildSemanticPlan(spec, {
          rng: LPF.rng(c.family + "|tex"), documentFamily: c.family, subject: null, cover: false
        });
        if (c.vertical) sem.writingDirection = "vertical";
        out = TR.buildAll(spec, sem, { showExplanation: true });
        if (!out.ok) return { err: "ソースを作れません: "
          + ((out.questionPaper && out.questionPaper.message) || "理由なし") };
      } catch (e) { return { err: "ソースを作れません: " + String(e && e.message).slice(0, 140) }; }

      const parts = [["questionPaper", "問題冊子"], ["answerSheet", "解答用紙"], ["answerKey", "模範解答"]];
      const res = [];
      for (const [k, label] of parts) {
        const rr = await fetch(P.url() + "/tex/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + P.token() },
          body: JSON.stringify({ source: out[k].source, assets: out.assets || [] })
        });
        const j = await rr.json();
        res.push({
          id: k, label, ok: !!j.ok,
          pages: (j.report && j.report.pageCount) || 0,
          bytes: j.pdfBase64 ? Math.round(j.pdfBase64.length * 0.75) : 0,
          ms: (j.report && j.report.durationMs) || 0,
          errors: ((j.report && j.report.errors) || []).slice(0, 2).map((e) => e.message)
        });
      }
      return { parts: res, srcChars: out.questionPaper.source.length,
               /* 「tate」という語が入っているかでは足りない。実測（2026-08-04）で、
                  jsarticle に tate を渡しても紙面は横書きのままだった。
                  **縦組みのクラスが選ばれていること**を見る。 */
               cls: (out.questionPaper.source.match(/\\documentclass\[[^\]]*\]\{([a-z]+)\}/) || [])[1] || "",
               hasGeometry: out.questionPaper.source.indexOf("geometry") >= 0 };
    }, { spec: makeSpec(), c });

    const sec = Math.round((Date.now() - t0) / 1000);
    console.log(`\n══ ${c.name}  ${sec}秒 ══`);
    if (r.err) { console.log("  " + r.err); ok(`${c.name}：組版が通る`, false, r.err); continue; }
    r.parts.forEach((p) => console.log(`  ${p.label}: ${p.ok ? "OK" : "NG"} / ${p.pages} ページ / `
      + `${Math.round(p.bytes / 1024)} KB / ${p.ms}ms` + (p.errors.length ? " / " + p.errors.join(" | ") : "")));
    r.parts.forEach((p) => ok(`${c.name}：${p.label}が組める`, p.ok && p.bytes > 0,
      p.errors.join(" | ")));
    if (c.vertical) {
      ok("縦組みのクラスで組んでいる", r.cls === "utarticle", "実際は " + r.cls);
      /* geometry を入れると本文が紙の外へ出た（実測）。入れないことまでを条件にする。 */
      ok("縦組みでは geometry を使わない", r.hasGeometry === false);
      ok("縦組みでも全ページ出ている", (r.parts[0] || {}).pages >= 1, String((r.parts[0] || {}).pages));
    } else {
      ok(`${c.name}：横組みのクラスで組んでいる`, r.cls === "jsarticle", "実際は " + r.cls);
    }
    fs.writeFileSync(path.join(OUT, c.family + (c.vertical ? "-tate" : "") + ".json"),
      JSON.stringify(r, null, 2));
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n記録: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
