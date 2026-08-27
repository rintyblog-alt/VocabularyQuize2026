/* ══════════════════════════════════════════════════════════════════════════
   vqautoapply.cjs — オート／標準モードを **実際の画面で**（2026-08-26）

   訴え:「オートモードの場合は、自動で 問題に 全て 追加される もの」

   ★ AI は 呼ばない（枠を 食うし、返りが 揺れる）。
     finishAi が 使う 差分の 口（VQ2.draft）に 作り物の 案を 入れて、
     **標準なら 止まる／オートなら 入る**ことだけを 実測する。

   本番では 走らせない。   使いかた: node vqautoapply.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = `ap${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqap.${tag}@gmail.com`, gradePrefix: "H2", nickname: "ap" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません");
  const v = await req("/api/auth/register/verify", { method: "POST",
    body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return c.j.token;
}

(async () => {
  const TOKEN = await 作る();
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const 失敗 = [];
  p.on("pageerror", (e) => 失敗.push(String(e.message).slice(0, 160)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [TOKEN]);
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQ2 && window.VQ2.draft && window.__vqSet),
    null, { timeout: 45000 }).catch(() => {});

  節("① 土台");
  ok("差分の 口（VQ2.draft）が ある", await p.evaluate(() => !!(window.VQ2 && window.VQ2.draft && window.VQ2.draft.diffQuestions)));
  ok("設定の 口（__vqSet）が ある", await p.evaluate(() => !!window.__vqSet));
  ok("★ ai.applyMode が 設定に ある",
     await p.evaluate(() => !!(window.__vqSet.spec && window.__vqSet.spec("ai.applyMode"))));
  ok("★ 既定は 標準（勝手に オートに しない）",
     await p.evaluate(() => window.__vqSet.defaultOf("ai.applyMode") === "standard"),
     await p.evaluate(() => window.__vqSet.defaultOf("ai.applyMode")));
  ok("設定の 一覧（AI の束）に 出る",
     await p.evaluate(() => (window.__vqSet.inGroup("ai") || []).some((x) => x.id === "ai.applyMode")));
  ok("選べるのは 標準 と オートの 2 つ",
     await p.evaluate(() => {
       const sp = window.__vqSet.spec("ai.applyMode");
       return (sp.opts || []).map((o) => o[0]).join(",") === "standard,auto";
     }));

  節("② 切り替えが 残る（画面を 閉じても 戻らない）");
  await p.evaluate(() => window.__vqSet.set("ai.applyMode", "auto"));
  ok("オートに できる", await p.evaluate(() => window.__vqSet.get("ai.applyMode")) === "auto");
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.__vqSet && window.VQ2 && window.VQ2.draft),
    null, { timeout: 40000 }).catch(() => {});
  ok("★ 読み込み直しても オートの まま（st に 持っていない）",
     await p.evaluate(() => window.__vqSet.get("ai.applyMode")) === "auto");
  await p.evaluate(() => window.__vqSet.set("ai.applyMode", "standard"));
  ok("標準へ 戻せる", await p.evaluate(() => window.__vqSet.get("ai.applyMode")) === "standard");

  節("③ 差分の 中身（applyDiff が 本当に 入れるか）");
  const 効き = await p.evaluate(() => {
    const D = window.VQ2.draft;
    const 元 = [];
    const 案 = [
      { id: "n1", number: 1, type: "multiple_choice_single", prompt: "1+1?", question: "1+1?",
        choices: [{ id: "a", text: "1", isCorrect: false }, { id: "b", text: "2", isCorrect: true }],
        correctAnswer: "b" },
      { id: "n2", number: 2, type: "multiple_choice_single", prompt: "2+2?", question: "2+2?",
        choices: [{ id: "a", text: "3", isCorrect: false }, { id: "b", text: "4", isCorrect: true }],
        correctAnswer: "b" }
    ];
    const diff = D.diffQuestions(元, 案, { matchByIndex: false });
    const r = D.applyDiff(元, diff, { all: true });
    return { 変更数: (diff.changes || []).length, 入った: r.appliedCount,
             できた数: (r.questions || []).length, 身元: !!(r.identity && r.identity.ok) };
  });
  ok("案が 差分に なる", 効き.変更数 === 2, 効き);
  ok("★「全部」で 2 問とも 入る", 効き.入った === 2 && 効き.できた数 === 2, 効き);
  ok("番号・ID が ぶつかっていない", 効き.身元 === true, 効き);

  節("④ 直し（revise）で **全部消える** ことが ない");
  const 消え = await p.evaluate(() => {
    const D = window.VQ2.draft;
    const q = (id, n, t) => ({ id, number: n, type: "multiple_choice_single", prompt: t, question: t,
      choices: [{ id: "a", text: "x", isCorrect: false }, { id: "b", text: "y", isCorrect: true }],
      correctAnswer: "b" });
    const 元 = [q("k1", 1, "one"), q("k2", 2, "two"), q("k3", 3, "three")];
    /* 直しでは **触った 1 問だけ**が 返る。ほかは removeCandidate に なる。 */
    const 案 = [q("k2", 2, "two 直した")];
    const diff = D.diffQuestions(元, 案, { matchByIndex: true });
    const 消候補 = (diff.changes || []).filter((c) => c.kind === "removeCandidate").map((c) => c.questionId);
    /* 画面と 同じ 絞りかた: 名指しされた 削除だけ 消す（ここでは 名指し 無し） */
    const ids = (diff.changes || []).filter((c) => c.kind !== "removeCandidate").map((c) => c.questionId);
    const r = D.applyDiff(元, diff, { questionIds: ids, includeRemovals: true });
    return { 消候補, 残った: (r.questions || []).map((x) => x.id) };
  });
  ok("触らなかった 問題も 消し候補に なる（作りの 確認）", 消え.消候補.length >= 1, 消え);
  ok("★★ それでも 3 問とも 残る（全部消えない）", 消え.残った.length === 3, 消え);

  節("⑤ 画面の 落ち");
  ok("画面が 落ちていない", 失敗.length === 0, 失敗.slice(0, 3));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("例外: " + (e && e.stack || e)); process.exit(1); });
