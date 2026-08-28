/* ══════════════════════════════════════════════════════════════════════════
   vqcloudreal.cjs — **本物の AI で** クラウド生成（track:true）を回して、
   ふつうの生成と **同じ形の 問題**が 返るかを 突き合わせる。

   訴え（2026-08-29）:「プリセットのクラウド。生成時に必ず問題文が空になる」
   ここでは 推測せず、両方を 実際に 走らせて 中身を 見る。

   使い方: node vqcloudreal.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const j = (r) => r.json();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function 入る() {
  const mail = "vqcloudreal" + Date.now() + "@gmail.com";
  const pw = "Passw0rd!" + Math.random().toString(36).slice(2, 8);
  let r = await fetch(BASE + "/api/auth/register/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: "cloudtest", password: pw })
  }).then(j);
  if (!r.devCode) throw new Error("devCode が返らない: " + JSON.stringify(r).slice(0, 200));
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
  return r.token;
}

const 頼み = { prompt: "日本の 都道府県の 県庁所在地について 4択で 3問", count: 3 };

function 要点(q) {
  if (!q) return "（無し）";
  return JSON.stringify({
    keys: Object.keys(q),
    question: String(q.question || "").slice(0, 40),
    prompt: q.prompt === undefined ? "(未定義)" : String(q.prompt).slice(0, 40),
    type: q.type, choices: Array.isArray(q.choices) ? q.choices.length : q.choices,
    answer: JSON.stringify(q.answer || "").slice(0, 30)
  }, null, 0);
}

(async () => {
  const token = await 入る();
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  let 落 = 0;
  const 見 = (ok, 名) => { console.log((ok ? "✓ " : "✗ ") + 名); if (!ok) 落++; };

  /* ① ふつうの生成 */
  console.log("── ① ふつうの生成（track なし）");
  const a = await fetch(BASE + "/api/aigen/questions", {
    method: "POST", headers: H, body: JSON.stringify(頼み)
  }).then(j);
  console.log("  status:", a.status, " made:", a.made, " planned:", a.planned,
    " blocked:", a.blocked || "-", (a.metrics && a.metrics.lastError) ? (" lastError:" + String(a.metrics.lastError).slice(0,120)) : "");
  const q1 = (a.questions || [])[0];
  console.log("  1問目:", 要点(q1));
  見(!!(q1 && String(q1.question || "").trim()), "ふつうの生成: 問題文が 入っている");

  /* ② 台帳に載せて生成（クラウド） */
  console.log("── ② クラウド生成（track:true）");
  const b = await fetch(BASE + "/api/aigen/questions", {
    method: "POST", headers: H, body: JSON.stringify(Object.assign({}, 頼み, { track: true }))
  }).then(j);
  console.log("  受け:", JSON.stringify({ ok: b.ok, tracked: b.tracked, jobId: b.jobId, planned: b.planned }));
  見(!!b.jobId, "クラウド生成: jobId が 返る");
  if (!b.jobId) { console.log(`\n落ち ${落} 件`); process.exit(落 ? 1 : 0); }

  let job = null;
  for (let i = 0; i < 200; i++) {
    await sleep(1200);
    const g = await fetch(BASE + "/api/aijob/get?jobId=" + encodeURIComponent(b.jobId), { headers: H }).then(j);
    job = g && g.job;
    if (!job) continue;
    if (["completed", "partial", "failed", "cancelled"].includes(job.status)) break;
  }
  console.log("  台帳:", JSON.stringify({ status: job && job.status, made: job && job.made,
    planned: job && job.planned, error: job && job.error,
    partialあり: !!(job && job.partial), partial件数: (job && job.partial && (job.partial.questions || []).length) }));
  const q2 = job && job.partial && (job.partial.questions || [])[0];
  console.log("  1問目:", 要点(q2));
  見(!!q2, "クラウド生成: 台帳に 問題が 残っている");
  見(!!(q2 && String(q2.question || "").trim()), "クラウド生成: 問題文が 入っている");
  if (q1 && q2) {
    const k1 = Object.keys(q1).sort().join(","), k2 = Object.keys(q2).sort().join(",");
    見(k1 === k2, "両方の 持ち物が 同じ" + (k1 === k2 ? "" : "\n    ふつう: " + k1 + "\n    クラウド: " + k2));
  }
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.message); process.exit(1); });
