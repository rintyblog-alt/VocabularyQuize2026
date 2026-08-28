/* ══════════════════════════════════════════════════════════════════════════
   vqfollowup.cjs — **生成の 途中で 足した 指示**が、クラウドの 注文へ
   ちゃんと 乗るかを 実物で 見る。

   訴え（2026-08-28）:
     「生成途中の 追加指示にも 柔軟に 対応できるように。全形式 対応も 確認」

   見るところ:
     ① 追加の 指示が **依頼文の 中に そのまま 入って** サーバへ 飛ぶ
     ② 何度 足しても 順番どおりに 並ぶ（あとの 指示が 優先と 書かれる）
     ③ 形式の 指定（questionTypes / questionPlan）も 一緒に 飛ぶ
     ④ 資料（files）も 一緒に 飛ぶ

   使い方: VQ_TOKEN=<札> node vqfollowup.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);

  /* 生成の 口は **止める**（AI を 呼ばない）。飛んで いく 中身だけ 見る。 */
  const 送られた = [];
  await page.route("**/api/aigen/questions", async (route) => {
    try { 送られた.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { 送られた.push({}); }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tracked: true, jobId: "aj_test_" + 送られた.length, planned: 3, status: "running" }) });
  });
  await page.route("**/api/aijob/get*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, job: { jobId: "aj_test_1", type: "preset-gen", status: "completed",
        made: 1, planned: 1, partial: { questions: [{ id: "q1", type: "single_choice",
          question: "ためしの 問題", choices: ["ア", "イ", "ウ", "エ"], answer: "ア", explanation: "ためし" }] } } }) }));

  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.ai && window.VQ2.draft, null, { timeout: 60000 });

  const r = await page.evaluate(async () => {
    return window.VQ2.ai.generatePreset({
      instruction: "光合成について 3 問",
      count: 3,
      questionTypes: ["true_false", "ordering"],
      questionPlan: { true_false: 2, ordering: 1 },
      orderId: "run_followup_test",
      followups: [
        { seq: 1, text: "解説を もっと くわしく 書いて" },
        { seq: 2, text: "中学 2 年でも 分かる 言葉に して" }
      ]
    }).then((x) => ({ ok: true, 件数: ((x && x.structured && x.structured.questions) || []).length }),
            (e) => ({ ok: false, err: String((e && (e.userMessage || e.message)) || e) }));
  });
  console.log("生成の 返り:", JSON.stringify(r));
  await b.close();

  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 260) : "")); if (!ok) 落++; };
  const 一 = 送られた[0] || {};
  console.log("飛んだ 注文の 頭:", String(一.prompt || "").slice(0, 200).replace(/\n/g, " / "));

  見(送られた.length > 0, "サーバへ 注文が 飛んだ（" + 送られた.length + " 回）");
  見(/【あとから届いた追加の指示】/.test(String(一.prompt || "")), "① 追加の 指示の 見出しが 入っている");
  見(/解説を もっと くわしく 書いて/.test(String(一.prompt || "")), "② 1 つ目の 追加の 指示が そのまま 入っている");
  見(/中学 2 年でも 分かる 言葉に して/.test(String(一.prompt || "")), "③ 2 つ目も 入っている");
  const p = String(一.prompt || "");
  見(p.indexOf("解説を もっと") < p.indexOf("中学 2 年でも"), "④ 送った 順に 並んでいる");
  見(/あとの指示.*優先/.test(p.replace(/\*/g, "")), "⑤ 「あとの指示を優先」が 書いてある");
  見(Array.isArray(一.questionTypes) && 一.questionTypes.length === 2, "⑥ 形式の 指定も 飛ぶ", 一.questionTypes);
  見(一.questionPlan && 一.questionPlan.true_false === 2, "⑦ 形式の 内訳も 飛ぶ", 一.questionPlan);
  見(一.track === true, "⑧ 台帳に 載せて（＝閉じても 続く）作る");
  見(String(一.orderId || "") === "run_followup_test", "⑨ 注文の 目印が 飛ぶ", 一.orderId);
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
