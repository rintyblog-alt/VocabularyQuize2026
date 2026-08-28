/* ══════════════════════════════════════════════════════════════════════════
   vqcloudstudio.cjs — **画面の中の 生成の 道**（VQ2.ai.generatePreset）を
   本物の AI で 走らせて、問題文が 入っているかを 見る。

   訴え（2026-08-29）:「プリセットのクラウド。生成時に必ず問題文が空になる」
   サーバは 正しい（vqcloudreal.cjs で 確認ずみ）。ここは その先、
   台帳 → toClientShape → draftToQuestions の 道を 実物で 通す。

   使い方: node vqcloudstudio.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const j = (r) => r.json();
const fs = require("fs"), os = require("os"), path = require("path");
const 控 = path.join(os.tmpdir(), "vqstudio-token-" + Buffer.from(BASE).toString("hex").slice(0, 12) + ".txt");

async function 入る() {
  if (process.env.VQ_TOKEN) return process.env.VQ_TOKEN;
  /* ★ 毎回 登録すると 登録の 回数制限に かかる。前の 札を 使い回す。 */
  try {
    const t = fs.readFileSync(控, "utf8").trim();
    if (t) {
      const me = await fetch(BASE + "/api/auth/me", { headers: { Authorization: "Bearer " + t } });
      if (me.ok) { console.log("（前の 札を 使う）"); return t; }
    }
  } catch (e) {}
  const mail = "vqstudio" + Date.now() + "@gmail.com";
  const pw = "Passw0rd!" + Math.random().toString(36).slice(2, 8);
  let r = await fetch(BASE + "/api/auth/register/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: "studiotest", password: pw })
  }).then(j);
  r = await fetch(BASE + "/api/auth/register/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode })
  }).then(j);
  r = await fetch(BASE + "/api/auth/register/consent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: r.registrationSession,
      agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" })
  }).then(j);
  if (!r.token) throw new Error("token が返らない: " + JSON.stringify(r).slice(0, 200));
  try { fs.writeFileSync(控, r.token, { mode: 0o600 }); } catch (e) {}
  return r.token;
}

(async () => {
  const token = await 入る();
  const b = await chromium.launch();
  const page = await b.newPage();
  const 記 = [];
  page.on("console", (m) => { const t = m.text(); if (/error|失敗|空/i.test(t)) 記.push(t.slice(0, 200)); });
  await page.addInitScript((tk) => {
    try { localStorage.setItem("vq.auth.token", tk); } catch (e) {}
    try { localStorage.setItem("authToken", tk); } catch (e) {}
    try { localStorage.setItem("vq_token", tk); } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.ai && window.VQ2.aigen, null, { timeout: 60000 });

  /* 認証の 持ち方を 実物から 調べる */
  const 鍵 = await page.evaluate(() => {
    const o = {};
    try { o.availableSync = !!(window.VQ2.aigen.availableSync && window.VQ2.aigen.availableSync()); } catch (e) { o.err = String(e); }
    try { o.keys = Object.keys(localStorage).filter((k) => /token|auth/i.test(k)); } catch (e) {}
    return o;
  });
  console.log("鍵の様子:", JSON.stringify(鍵));

  const r = await page.evaluate(async (引) => {
    const tk = 引.tk, ASK = 引.ask, N = 引.n;
    /* authHeader が 見ている置き場が 分からないので、fetch を 包んで 必ず 付ける。 */
    const of_ = window.fetch;
    window.fetch = function (u, o) {
      o = o || {};
      const h = new Headers(o.headers || {});
      if (!h.has("Authorization")) h.set("Authorization", "Bearer " + tk);
      return of_(u, Object.assign({}, o, { headers: h }));
    };
    try {
      const res = await window.VQ2.ai.generatePreset({
        instruction: ASK, count: N
      });
      const data = (res && res.structured) || null;
      const qs = (data && data.questions) || [];
      const drafted = window.VQ2.draft.draftToQuestions({ questions: qs });
      return {
        ok: true, cloud: !!(res && res.__cloud), 件数: qs.length,
        生空: qs.filter((q) => !String(q.question || "").trim()).length,
        取込空: drafted.filter((q) => !String(q.prompt || "").trim()).length,
        型: drafted.map((q) => q.type),
        生: qs.slice(0, 2).map((q) => ({ keys: Object.keys(q), question: q.question, type: q.type })),
        取込: drafted.slice(0, 3).map((q) => ({ prompt: String(q.prompt||"").slice(0,40), type: q.type, choices: (q.choices || []).length }))
      };
    } catch (e) {
      return { ok: false, err: String((e && (e.userMessage || e.message)) || e) };
    }
  }, { tk: token, ask: process.env.VQ_ASK || "日本の 都道府県の 県庁所在地について 4択で 3問",
       n: Number(process.env.VQ_N || 3) });

  console.log(JSON.stringify(r, null, 2));
  if (記.length) console.log("画面の 訴え:", 記.slice(0, 5));
  await b.close();

  let 落 = 0;
  const 見 = (ok, 名) => { console.log((ok ? "✓ " : "✗ ") + 名); if (!ok) 落++; };
  見(r.ok, "生成が 通った" + (r.ok ? "" : "：" + r.err));
  if (r.ok) {
    見(r.件数 > 0, "問題が 返った（" + r.件数 + " 問）");
    見(r.生空 === 0, "生の 問題文が 全部 入っている（空 " + r.生空 + " 件）");
    見(r.取込空 === 0, "取り込んだ あとも 全部 入っている（空 " + r.取込空 + " 件）");
  }
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
