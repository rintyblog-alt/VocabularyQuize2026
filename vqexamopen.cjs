/* ══════════════════════════════════════════════════════════════════════════
   vqexamopen.cjs — **試験の 始めかた**（表紙 → 記入 → 開始）を 本物の 画面で 見る

   訴え（2026-08-30・Rinty さん）
     「最初 開いたら、表紙に 年組番氏名、受験番号が ある場合には それを
       右の 解答欄に 用意して、それを 記入した後に、下に 開始ボタン。
       それを 押したら、試験が スタートし、1 枚目は 表示したまま、
       新たに その後の 問題が 最初から 最後まで 表示するように しよう」

   見るのは:
     ① 開いた ときは **表紙の 段**（時計も 提出も 出さない）
     ② 右に 年組番氏名・受験番号の 欄が 出る
     ③ 全部 埋まるまで「開始する」は 押せない
     ④ 押すと 始まり、問題と 解答欄が 出る（時計が 動きだす）
     ⑤ 書いた ことは 覚えていて、紙面へ 渡る

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamopen.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const j = (r) => r.json().catch(() => ({}));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};
async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "eo" + 印 + "@gmail.com", gradePrefix: "H2", nickname: ("o" + 印).slice(0,14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 250)));
  await page.addInitScript((t) => { localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("vq.tour.v1", JSON.stringify({ home:1,preset:1,feed:1,dm:1,insight:1 })); }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.mockCompiler),
    null, { timeout: 60000 });
  /* 受験の 画面は **影の DOM**の 中に 立つ。そこまで 潜る 道具を 用意する。 */
  await page.evaluate(() => {
    window.__深 = function (sel) {
      var out = [];
      function 掘る(root) {
        try { root.querySelectorAll(sel).forEach(function (x) { out.push(x); }); } catch (e) {}
        try { root.querySelectorAll("*").forEach(function (el) { if (el.shadowRoot) 掘る(el.shadowRoot); }); } catch (e) {}
      }
      掘る(document);
      return out;
    };
    window.__文 = function () {
      var t = "";
      function 掘る(root) {
        try { root.querySelectorAll("*").forEach(function (el) {
          if (el.shadowRoot) { t += " " + (el.shadowRoot.textContent || ""); 掘る(el.shadowRoot); } }); } catch (e) {}
      }
      掘る(document);
      return (document.body.innerText + " " + t).replace(/\s+/g, " ");
    };
  });

  節("① 開いた ときは 表紙の 段");
  const 開 = await page.evaluate(async () => {
    const V = window.VQ2, MC = V.mockCompiler, AG = V.aigen, L = V.layout;
    const p = MC.plan({ title: "第1回 模試", subject: "情報", durationMinutes: 60, totalPoints: 40,
      sectionCount: 2, questionCount: 4, types: { multiple_choice_single: true },
      difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
    const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
    const filled = {};
    qs.forEach((q, i) => { filled[q.id] = AG.toClientShape({ id: "x" + i, type: "single_choice",
      question: "最も 適当な ものを 選べ。" + i, choices: ["あ","い","う","え"], answer: "あ",
      explanation: "①正解。" }, i); });
    const sp = MC.assemble(p, filled, {}).spec;
    sp.layout = { layoutMode: "common-test", answerSheetMode: "common-test-mark", outputEngine: "current" };
    sp.cover = { examName: "第1回 模試", subject: "情報", subjectDetail: "情報Ⅰ",
      pageCount: 8, studentFields: ["年","組","番","氏名"] };
    window.__sp = sp;
    V.examWorkspace.open({ spec: sp, plan: L.buildPlan(sp) });
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.__文();
    const b2 = window.__深('[data-act="exam-start"]')[0] || null;
    const 本 = window.__深(".vq2-body")[0];
    return { 文: t.slice(0, 400), 本体: 本 ? (本.textContent || "").replace(/\s+/g, " ") : "",
             欄: window.__深("[data-exm]").map((x) => x.getAttribute("data-exm")),
             開始: !!b2,
             押せる: b2 ? !b2.disabled : null,
             /* 受験の 画面の 中だけを 見る（ほかの 画面の 字を 拾わない）。 */
             時計: (function () { var w = window.__深(".vq2-head")[0];
               return w ? /残り \d|\d\d:\d\d/.test(w.textContent || "") : false; })(),
             提出: (function () { var w = window.__深(".vq2-head")[0];
               return w ? /提出/.test(w.textContent || "") : false; })() };
  });
  見(開.開始 === true, "★「開始する」が 出る");
  見(開.時計 === false, "★ まだ 時計は 動かさない", 開.時計);
  見(開.提出 === false, "★ まだ 提出も 出さない", 開.提出);
  見(/受験する人/.test(開.本体 || ""), "表紙の 段だと 分かる（「受験する人」の 見出し）",
     (開.本体 || "").slice(0, 60));

  節("①b 左右が 重ならない（訴え「右側の解答欄が少し被ってしまってる」）");
{
  const 幅 = await page.evaluate(() => {
    const L = window.__深("#paperPane")[0], R = window.__深("#answerPane")[0];
    if (!L || !R) return { なし: true };
    const a = L.getBoundingClientRect(), b = R.getBoundingClientRect();
    return { 左: { x: Math.round(a.left), 右端: Math.round(a.right), 幅: Math.round(a.width) },
             右: { x: Math.round(b.left), 右端: Math.round(b.right), 幅: Math.round(b.width) },
             被り: Math.round(a.right - b.left),
             紙: (() => { const p2 = window.__深("#examPaper")[0];
               return p2 ? Math.round(p2.getBoundingClientRect().height) : 0; })() };
  });
  見(!幅.なし, "左右の 枠が どちらも ある", 幅);
  見(!幅.なし && 幅.被り <= 1, "★ 左の 紙面に 右の 欄が 被らない", "被り " + 幅.被り + "px");
  見(!幅.なし && 幅.右.幅 >= 380 && 幅.右.幅 <= 460, "★ 右の 幅は 解いている ときと 同じ（420px）", 幅.右.幅 + "px");
  見(!幅.なし && 幅.左.幅 > 200, "★ 左に 紙面の 幅が 残る", 幅.左.幅 + "px");
  見(!幅.なし && 幅.紙 > 100, "★ 紙面の 高さが つぶれない", 幅.紙 + "px");
}

節("② 右に 記入の 欄");
  見(JSON.stringify(開.欄) === JSON.stringify(["年","組","番","氏名","受験番号"]),
     "★ 年組番氏名 ＋ 受験番号", 開.欄);

  節("③ 埋まるまで 押せない");
  見(開.押せる === false, "★ 空のうちは 押せない", 開.押せる);
  const 途中 = await page.evaluate(() => {
    const el = window.__深('[data-exm="氏名"]')[0];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "松代 倫");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const b2 = window.__深('[data-act="exam-start"]')[0];
    return b2 ? !b2.disabled : null;
  });
  見(途中 === false, "★ 1 つだけでは まだ 押せない", 途中);
  const 全埋 = await page.evaluate(() => {
    const v = { "年":"2", "組":"A", "番":"7", "氏名":"松代 倫", "受験番号":"12345678" };
    Object.keys(v).forEach((k) => {
      const el = window.__深('[data-exm="' + k + '"]')[0];
      if (!el) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v[k]);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const b2 = window.__深('[data-act="exam-start"]')[0];
    return b2 ? !b2.disabled : null;
  });
  見(全埋 === true, "★ 全部 埋めると 押せる", 全埋);

  節("④ 押すと 始まる");
  const 後 = await page.evaluate(async () => {
    window.__深('[data-act="exam-start"]')[0].click();
    await new Promise((r) => setTimeout(r, 1200));
    const t = window.__文();
    var w = window.__深(".vq2-head")[0];
    return { 開始: window.__深('[data-act="exam-start"]').length > 0,
             提出: w ? /提出/.test(w.textContent || "") : false,
             解答欄: window.__深("[data-pick],[data-pickm],[data-blank],[data-text],[data-ord],[data-pairsel]").length > 0,
             文: t.slice(0, 300) };
  });
  見(後.開始 === false, "★「開始する」は 消える");
  見(後.提出 === true, "★ 提出が 出る（試験が 始まった）");
  見(後.解答欄 === true, "★ 右に 解答欄が 出る");

  節("⑤ 書いた ことを 覚えていて、紙面へ 渡る");
  const 紙 = await page.evaluate(() => {
    const V = window.VQ2, L = V.layout, R = V.pdfRenderer;
    const sp = window.__sp;
    const plan = L.buildPlan(sp);
    /* 受験の 画面が 覚えた 値を 取り出す（作りものでは なく 本物の 保存先から）。 */
    let 受 = null;
    try {
      const raw = localStorage.getItem("vq2.mockSessions.v1") || "[]";
      const ss = JSON.parse(raw);
      const s2 = (Array.isArray(ss) ? ss : []).filter((x) => x && x.examinee)[0];
      受 = s2 ? s2.examinee : null;
    } catch (e) {}
    if (!受) return { 覚えた: false };
    const a = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
    const h = String(R.buildHtml(sp, plan, { bookletId: a.id, examinee: 受 }));
    return { 覚えた: true, 値: 受,
             氏名: /ms-nv">松代 倫</.test(h) || /nb-v">松代 倫</.test(h),
             番号: (h.match(/ms-o is-on/g) || []).length };
  });
  見(紙.覚えた === true, "★ 書いた ことを 覚えている", 紙.値);
  見(紙.氏名 === true, "★ 解答用紙に 氏名が 入る");
  見(紙.番号 === 8, "★ 受験番号の 丸が 塗られる", 紙.番号);

  見(例外.length === 0, "例外が 出ていない", 例外);
  await b.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("ERR", String(e && e.message || e)); process.exit(1); });
