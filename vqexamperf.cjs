/* ══════════════════════════════════════════════════════════════════════
   試験の 生成（大問 分割）を **開発版で** 実測する。

   訴え（2026-09-05・Rinty さん）:
     「試験も プリセットも 遅い。前まで こんな 遅く なかった」

   本番の 台帳（ai_jobs）で 分かった こと:
     8/30  12 ジョブ  59 秒  AI 19〜32 回  48/48 問
     9/03  12 ジョブ 1086 秒 AI  6〜10 回  20/48 問
   ai_calls が 0 の まま 300 秒 打ち切られた ものが 32 件（達成率 0%）。

   ここで 測るのは **大問を 割って 同時に 作る 道**（aigenGenerateByParts）。
   vq-make.js が 送る のと 同じ 形で 叩く。

   使い方:
     node vqexamperf.cjs before      … exports/examperf-before.json へ
     node vqexamperf.cjs after
     node vqexamperf.cjs compare
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs"); const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const LABEL = process.argv[2] || "after";
const OUTDIR = path.join(__dirname, "exports");
const OUT = path.join(OUTDIR, "examperf-" + LABEL + ".json");

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 300) }; }
  return { status: r.status, data: d || {} };
}

async function 検証アカウント() {
  const nick = "exam" + Date.now().toString(36).slice(-6);
  let r = await api("POST", "/api/auth/register",
    { gradePrefix: "H3", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  if (r.data.token) return r.data.token;
  const a = await api("POST", "/api/auth/register/start",
    { email: nick + "@gmail.com", gradePrefix: "H3", nickname: nick, password: "DevGen#2026a" });
  const b = await api("POST", "/api/auth/register/verify",
    { challengeId: a.data.challengeId, code: a.data.devCode });
  const c = await api("POST", "/api/auth/register/consent",
    { registrationSession: b.data.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "8306" });
  if (!c.data.token) { console.error("検証アカウントを作れません:", a.data, b.data, c.data); process.exit(1); }
  return c.data.token;
}

/* 大問を いくつに 割るかで 予算の 配りかたが 変わる。
   本番で 詰まったのは 大問が 多い とき（12）なので、そこを 含めて 測る。 */
const 型 = [
  { 名: "大問3・12問", 大問: 3, 問: 12 },
  { 名: "大問6・24問", 大問: 6, 問: 24 },
  { 名: "大問12・48問", 大問: 12, 問: 48 }
];
const 教科 = process.env.VQ_SUBJECT || "日本史探究";
const 形式 = ["single_choice", "fill_blank", "text_input", "free_text"];

function 注文(t) {
  const 一大問 = Math.round(t.問 / t.大問);
  const parts = [];
  for (let i = 0; i < t.大問; i++) {
    parts.push({ index: i + 1, title: "第" + (i + 1) + "問",
      theme: ["古代の 政治と 外交", "荘園と 武士の 登場", "室町の 経済", "戦国の 城下町",
              "江戸の 身分制", "享保の 改革", "開国と 条約", "明治の 殖産興業",
              "大正の 都市文化", "昭和の 恐慌", "戦後の 改革", "高度経済成長"][i % 12],
      count: 一大問 });
  }
  const plan = {};
  形式.forEach((f, i) => { plan[f] = Math.max(1, Math.round(t.問 / 形式.length)); });
  return {
    prompt: process.env.VQ_PROMPT
      || ("高校 日本史探究の 定期考査を 作ってください。"
          + "教科書の 範囲から、用語の 意味と 因果関係を 問う 設問に してください。"),
    count: t.問, questionTypes: 形式, questionPlan: plan,
    exam: true, subject: 教科, level: "標準", parts: parts, kind: "exam"
  };
}

(async () => {
  const token = await 検証アカウント();
  console.log(`試験の 生成を 測る（${BASE}）  ラベル: ${LABEL}\n`);
  const rows = [];
  for (const t of 型) {
    const t0 = Date.now();
    const r = await api("POST", "/api/aigen/questions", 注文(t), token);
    const 秒 = (Date.now() - t0) / 1000;
    const m = (r.data && r.data.metrics) || {};
    const qs = (r.data && r.data.questions) || [];
    const 行 = {
      名: t.名, 大問: t.大問, 予定: t.問, 出来: qs.length, 秒: Math.round(秒 * 10) / 10,
      AI回: m.aiCalls || 0, 入: m.tokensIn || 0, 出: m.tokensOut || 0,
      提供元: m.provider || "", モデル: m.model || "",
      止まった: !!m.subrequestLimit, 断り: String(m.lastError || "").slice(0, 90),
      status: r.status, ok: !!(r.data && r.data.ok)
    };
    rows.push(行);
    console.log(`  ${t.名.padEnd(14)}… ${String(行.秒).padStart(6)}s  `
      + `${行.出来}/${行.予定}問  AI${行.AI回}回  ${行.提供元}${行.モデル ? "/" + 行.モデル : ""}`
      + (行.断り ? "  ⚠ " + 行.断り : "") + (行.止まった ? "  ★天井" : ""));
  }
  console.log("\n══ まとめ ══");
  const 総秒 = rows.reduce((a, x) => a + x.秒, 0);
  const 総AI = rows.reduce((a, x) => a + x.AI回, 0);
  const 総出 = rows.reduce((a, x) => a + x.出来, 0);
  const 総予 = rows.reduce((a, x) => a + x.予定, 0);
  console.log(`  合計 ${Math.round(総秒)}s   AI ${総AI} 回   ${総出}/${総予} 問`
    + `（達成 ${Math.round(総出 / 総予 * 100)}%）`);
  try { fs.mkdirSync(OUTDIR, { recursive: true }); } catch (e) {}
  fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, at: new Date().toISOString(), rows }, null, 2));
  console.log(`  → ${path.relative(__dirname, OUT)}`);
})();
