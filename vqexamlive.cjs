/* ══════════════════════════════════════════════════════════════════════════
   vqexamlive.cjs — **作っている 間、画面が 動き続けるか**を 測る

   訴え（2026-08-30・Rinty さん）
     「ここまでは順調なペースだったのに、いきなり動かなくなった。バーが」
     （18 / 24 問 で 止まって 見えた）

   なぜ 止まって 見えたか:
     バーは「受け取れた 問題の 数」でしか 動かなかった。
     1 回の 頼みは 数十秒〜数分 かかるので、その 間は **完全に 静止**する。
     しかも「（0 / 24 回）」は 回数では なく 中の 数を そのまま 出しており、
     いつも 0 だった。待ちの 上限も 15 分 だったので、詰まると 15 分 無反応。

   見るのは:
     ① 頼んでいる 間も「向こうで N / M 問」が 動く
     ② 経った 時間が 出る（意味の 無い「0 / 24 回」を やめた）
     ③ 1 本が 遅くても、ほかは 進む
     ④ 最後まで 行って 一覧に 入る

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamlive.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let 済 = 0, 落 = 0; const 落ち = [];
const 見た = (ok, 名, 追) => { if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0,200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0,320) : "")); } };
const { chromium } = require("playwright");
const j = (r) => r.json().catch(() => ({}));
async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "lv" + 印 + "@gmail.com", gradePrefix: "H2", nickname: ("v" + 印).slice(0,14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  return c.token;
}
(async () => {
  const tok = await 札();
  const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0,250)));
  const 仕事 = new Map(); let 番 = 0, 回 = 0;
  await page.route("**/api/aigen/questions", async (route) => {
    回++;
    const body = JSON.parse(route.request().postData() || "{}");
    const id = "job" + 回;
    const plan = body.questionPlan || null; const 内訳 = [];
    if (plan) Object.keys(plan).forEach((k) => { for (let i = 0; i < plan[k]; i++) 内訳.push(k); });
    else (body.questionTypes || ["single_choice"]).forEach((t) => 内訳.push(t));
    while (内訳.length < Math.max(1, Number(body.count) || 1)) 内訳.push(内訳[0] || "single_choice");
    仕事.set(id, { planned: Math.max(1, Number(body.count) || 1), t0: Date.now(), 内訳, 遅: 回 === 2 ? 12000 : 4000 });
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tracked: true, jobId: id, planned: 仕事.get(id).planned, status: "running" }) });
  });
  await page.route("**/api/aijob/get**", async (route) => {
    const u = new URL(route.request().url());
    const id = u.searchParams.get("jobId") || u.searchParams.get("id") || "";
    const w = 仕事.get(id); if (!w) return route.fulfill({ status: 404, body: "{}" });
    const 経 = Date.now() - w.t0, done = 経 > w.遅;
    const made = done ? w.planned : Math.floor(w.planned * Math.min(0.99, 経 / w.遅));
    const qs = [];
    for (let i = 0; i < (done ? made : 0); i++) { const t = w.内訳[i] || "single_choice"; const n = ++番;
      qs.push({ id: "q" + n, type: t, question: "最も 適当な ものを 選べ。" + n,
        choices: ["あ","い","う","え"], answer: "あ", explanation: "①正解。②言い過ぎ。③逆。④足りない。" }); }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, job: { jobId: id, type: "exam-gen",
        status: done ? "completed" : "running", planned: w.planned, made,
        progress: done ? 1 : made / w.planned, stages: [], partial: { questions: qs },
        completedAt: done ? Date.now() : 0, updatedAt: Date.now() } }) });
  });
  await page.addInitScript((t) => { localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("vq.tour.v1", JSON.stringify({ home:1,preset:1,feed:1,dm:1,insight:1 })); }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake && !!(window.VQ2 && window.VQ2.store), null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__vqMake.open({ kind: "exam" });
    window.__vqMake.表紙を入れる({ examName: "動きの 確かめ", subject: "情報" });
    document.getElementById("vqMake").shadowRoot.querySelector('[data-a="go"]').click();
  });
  await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const set = (k, v) => { const el = r.querySelector('[data-n="' + k + '"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("questionCount", 24); set("sectionCount", 6); set("totalPoints", 100);
    r.querySelector('[data-a="run"]').click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const bb = Array.from(r.querySelectorAll("button")).filter((x) => /この構成で/.test(x.textContent))[0];
    if (bb) bb.click();
  });
  const 見 = [];
  for (let i = 0; i < 45; i++) {
    const s = await page.evaluate(() => { const s = window.__vqMake.状態();
      const r = document.getElementById("vqMake").shadowRoot;
      const bn = r.querySelector(".barn"); const sub = r.querySelector(".sub");
      return { 画面: s.画面, 走: s.走っている, err: s.err,
               バー: bn ? bn.textContent.replace(/\s+/g," ").trim() : "",
               様子: sub ? sub.textContent.replace(/\s+/g," ").trim() : "" }; });
    見.push(s.画面 + " | " + s.バー + " | " + s.様子);
    if (s.画面 === "確認" || (!s.走 && s.err)) break;
    await page.waitForTimeout(700);
  }
  console.log("\n══ 画面の 動き ══"); [...new Set(見)].forEach((x) => console.log("  " + x));
  const 唯 = [...new Set(見)];
  console.log("");
  見た(唯.filter((x) => /向こうで \d+ \/ \d+ 問/.test(x)).length >= 3,
     "★ 頼んでいる 間も「向こうで N / M 問」が 動く",
     唯.filter((x) => /向こうで/.test(x)).length + " 通り");
  見た(唯.filter((x) => /（\d+ 秒）/.test(x)).length >= 3, "★ 経った 時間が 出る");
  見た(!唯.some((x) => /\d+ \/ \d+ 回/.test(x)), "★ 意味の 無い「0 / 24 回」を やめた");
  const 段 = 唯.map((x) => { const m = x.match(/(\d+) \/ 24 問/); return m ? Number(m[1]) : -1; }).filter((x) => x >= 0);
  見た(段.length >= 3 && 段[段.length - 1] >= 20, "★ 1 本が 遅くても ほかは 進む", 段);
  const fin = await page.evaluate(() => { const s = window.__vqMake.状態(); const ST = window.VQ2.store;
    return { 画面: s.画面, 保存: s.保存した, 内訳: window.__vqMake.内訳(),
             一覧: (ST.listExams ? ST.listExams() : []).map((x) => x.name) }; });
  見た(fin.画面 === "確認", "確認まで 行く", fin.画面);
  見た(fin.内訳 && fin.内訳.受けた === 24, "★ 24 問 とも 受かる", fin.内訳);
  見た(fin.保存 === true && fin.一覧.length === 1, "★ 一覧に 1 件だけ 入る", fin.一覧);
  見た(例外.length === 0, "例外が 出ていない", 例外);
  await b.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
