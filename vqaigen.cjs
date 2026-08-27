/* ══════════════════════════════════════════════════════════════════════
   Workers AI 側の出題を、Mac（Bridge）と同じ採点基準で測る（開発環境のみ）

   ケースは bench/cases.json をそのまま使う。同じ物差しで比べないと、
   「速くなった」だけを見て品質の低下に気づけない。

   見るもの（vqbench と同じ）:
     ・問題数が指定どおりか
     ・許した形式だけか／禁じた形式が出ていないか
     ・内訳（配分）が指定どおりか
     ・正答・解説が付いているか
     ・矛盾・未対応で AI を呼ばずに止まるか
     ・時間・AI 呼び出し回数・neurons（費用の単位）

   使い方:
     node vqaigen.cjs                 … 既定の 8 ケース
     node vqaigen.cjs --all           … 資料なしの全ケース
     node vqaigen.cjs --case A1-reorder-10
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs"); const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf("--case"); return i >= 0 ? argv[i + 1] : null; })();
const ALL = argv.indexOf("--all") >= 0;
const DEFAULT_CASES = ["A1-reorder-10", "A1b-reorder-alias", "A2-fill-10", "A4-errcorr-10",
                       "B1-mixed-12", "C3-no-choices", "D3-count-10", "G1-contradiction"];

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}

/* サーバ側の形式名 → ベンチの語彙。呼び名の違いで合否が変わらないようにする。 */
const TO_BENCH = {
  reorder: "reorder", fill_blank: "fill_blank", error_correction: "error_correction",
  single_choice: "single_choice", multi_choice: "multi_choice", true_false: "true_false",
  text_input: "text_input", free_text: "free_text", matching: "matching",
  classification: "classification"
};

function scoreOne(cs, res) {
  const exp = cs.expected || {};
  const issues = [];
  let score = 100;
  const qs = Array.isArray(res.questions) ? res.questions : [];
  const engines = qs.map((q) => TO_BENCH[q.type] || q.type);

  /* 矛盾・未対応は「作らないのが正解」 */
  if (/contradiction|unsupported/.test(cs.id)) {
    const okStop = res.status === "contradictory" || res.status === "unsupported";
    if (!okStop) { score = 0; issues.push("止まるべきところで作ってしまった（" + res.status + "）"); }
    if ((res.metrics && res.metrics.aiCalls) > 0) { score -= 30; issues.push("AI を呼んでしまった"); }
    return { score: Math.max(0, score), issues };
  }

  if (exp.totalQuestions != null && qs.length !== exp.totalQuestions) {
    score -= 25; issues.push(`問題数 ${qs.length} / ${exp.totalQuestions}`);
  }
  if (Array.isArray(exp.allowedEngines) && exp.allowedEngines.length) {
    const bad = engines.filter((e) => exp.allowedEngines.indexOf(e) < 0);
    if (bad.length) { score -= 30; issues.push("許していない形式: " + Array.from(new Set(bad)).join(",")); }
  }
  if (Array.isArray(exp.forbiddenEngines) && exp.forbiddenEngines.length) {
    const bad = engines.filter((e) => exp.forbiddenEngines.indexOf(e) >= 0);
    if (bad.length) { score -= 30; issues.push("禁止形式が出た: " + Array.from(new Set(bad)).join(",")); }
  }
  if (exp.exactEngineDistribution) {
    const got = {}; engines.forEach((e) => { got[e] = (got[e] || 0) + 1; });
    const want = exp.exactEngineDistribution;
    const same = Object.keys(want).every((k) => got[k] === want[k])
      && Object.keys(got).every((k) => want[k] === got[k]);
    if (!same) { score -= 30; issues.push("配分ちがい 期待 " + JSON.stringify(want) + " / 実際 " + JSON.stringify(got)); }
  }
  if (exp.correctAnswerRequired) {
    const n = qs.filter((q) => q.answer === undefined || q.answer === null || q.answer === "").length;
    if (n) { score -= 18; issues.push("正答なし " + n + " 問"); }
  }
  if (exp.explanationRequired) {
    const n = qs.filter((q) => !q.explanation || !String(q.explanation).trim()).length;
    if (n) { score -= 18; issues.push("解説なし " + n + " 問"); }
  }
  const b = cs.budget || {};
  const ms = (res.metrics && res.metrics.totalMs) || 0;
  if (b.maxTotalDurationMs && ms > b.maxTotalDurationMs) {
    issues.push(`時間超過 ${Math.round(ms / 1000)}s > ${Math.round(b.maxTotalDurationMs / 1000)}s`);
  }
  if (b.maxAiCalls && (res.metrics && res.metrics.aiCalls) > b.maxAiCalls) {
    issues.push(`呼び出し超過 ${res.metrics.aiCalls} > ${b.maxAiCalls}`);
  }
  return { score: Math.max(0, score), issues };
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "bench", "cases.json"), "utf8"));
  const all = Array.isArray(raw) ? raw : (raw.cases || []);
  let cases = all.filter((c) => c.profile !== "doc" && !/^S/.test(c.id));
  if (ONLY) cases = all.filter((c) => c.id === ONLY);
  else if (!ALL) cases = cases.filter((c) => DEFAULT_CASES.indexOf(c.id) >= 0);

  const nick = "gen" + Date.now().toString(36).slice(-6);
  let token = "";
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  token = reg.data.token || "";
  if (!token) {
    /* 登録の入口が 3 段（メール確認つき）に変わっている場合はそちらで作る。
       開発版だけ devCode が返るので、実際のメールは要らない。 */
    const a = await api("POST", "/api/auth/register/start",
      { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevGen#2026a" });
    const b = await api("POST", "/api/auth/register/verify",
      { challengeId: a.data.challengeId, code: a.data.devCode });
    const c = await api("POST", "/api/auth/register/consent",
      { registrationSession: b.data.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    token = c.data.token || "";
  }
  if (!token) { console.error("検証アカウントを作れません:", reg.data); process.exit(1); }

  /* 提供元とモデルを指定できるようにする。**採点はまったく同じもの**を使う。
     物差しを変えて比べると、速さの違いか採点の違いかが分からなくなる。 */
  const PROVIDER = process.env.VQ_PROVIDER || "";
  const MODEL = process.env.VQ_MODEL || "";
  const TARGET = (PROVIDER || "workers") + (MODEL ? " / " + MODEL : "");
  console.log(`ケース ${cases.length} 件（${TARGET}・${BASE}）\n`);
  const rows = [];
  /* 1 分あたりの字数上限を踏まないよう、ケースの間に間隔を置ける。
     踏むと「品質の失敗」と区別が付かなくなり、比較そのものが濁る。 */
  const GAP = Math.max(0, parseInt(process.env.VQ_GAP || "0", 10) || 0);
  let firstCase = true;
  for (const cs of cases) {
    if (!firstCase && GAP) await new Promise((r) => setTimeout(r, GAP));
    firstCase = false;
    const t0 = Date.now();
    const r = await api("POST", "/api/aigen/questions",
      { prompt: cs.prompt, ...(PROVIDER ? { provider: PROVIDER } : {}), ...(MODEL ? { model: MODEL } : {}) }, token);
    const wall = Date.now() - t0;
    if (r.status !== 200 || !r.data.ok) {
      console.log(`  ${cs.id.padEnd(22)}… 実行できず  ${JSON.stringify(r.data).slice(0, 150)}`);
      rows.push({ id: cs.id, group: cs.group, score: 0, ms: wall, calls: 0, neurons: 0, n: 0, issues: ["実行できず"] });
      continue;
    }
    const d = r.data;
    const s = scoreOne(cs, d);
    const m = d.metrics || {};
    rows.push({ id: cs.id, group: cs.group, score: s.score, ms: m.totalMs || wall,
                calls: m.aiCalls || 0, neurons: Math.round(m.neurons || 0),
                tin: m.tokensIn || 0, tout: m.tokensOut || 0, cut: m.truncated || 0,
                by: m.byProvider || {}, model: m.model || "",
                n: (d.questions || []).length, first: m.firstResultMs || 0, issues: s.issues });
    const mark = s.score >= 90 && !s.issues.length ? "合格" : (s.score >= 90 ? "合格*" : "不合格");
    console.log(`  ${cs.id.padEnd(22)}… ${mark}  ${String(s.score).padStart(3)}点`
      + `  ${String(Math.round((m.totalMs || wall) / 1000)).padStart(3)}s`
      + `  ${String((d.questions || []).length).padStart(2)}問`
      + `  AI${m.aiCalls || 0}回`
      + `  ${(m.tokensIn || 0) + (m.tokensOut || 0)}字`
      + ((m.truncated || 0) ? `  切れ${m.truncated}` : "")
      + (s.issues.length ? "  ← " + s.issues.join(" / ") : ""));
    /* 足りなかったときの理由を分ける。ここが無いと
       **枠切れで止まった**のと**質が足りない**のが同じ見た目になり、
       モデルの優劣を取り違える（実際に取り違えかけた）。 */
    if (s.issues.length) {
      if (d.blocked) console.log(`      止まった: ${d.blocked} ${d.blockedMessage || ""}`);
      if (m.rejected) {
        console.log(`      捨てた ${m.rejected} 問 … ` + Object.entries(m.rejectReasons || {})
          .sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(" / "));
      }
      console.log(`      周回 ${m.rounds || 0} / 呼び出し ${m.aiCalls || 0}`
        + `   内訳 ${JSON.stringify(d.madeByType || {})}`);
    }
  }

  const okN = rows.filter((r) => r.score >= 90 && !r.issues.length).length;
  const avg = Math.round(rows.reduce((a, r) => a + r.score, 0) / Math.max(1, rows.length));
  const times = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => times.length ? Math.round(times[Math.min(times.length - 1, Math.floor(times.length * q))] / 1000) : 0;
  console.log("\n══ まとめ ══");
  console.log(`  合格 ${okN} / ${rows.length}   平均 ${avg} 点`);
  console.log(`  1 件あたり p50 ${p(0.5)}s / p95 ${p(0.95)}s`);
  const calls = rows.reduce((a, r) => a + r.calls, 0);
  const tin = rows.reduce((a, r) => a + r.tin, 0), tout = rows.reduce((a, r) => a + r.tout, 0);
  console.log(`  AI 呼び出し 合計 ${calls} 回`);
  console.log(`  neurons 合計 ${rows.reduce((a, r) => a + r.neurons, 0)}（無料枠 10,000/日）`);
  console.log(`  字数 合計 入${tin} / 出${tout}   1 回あたり ${calls ? Math.round((tin + tout) / calls) : 0}`);
  console.log(`  途中で切れた回 ${rows.reduce((a, r) => a + r.cut, 0)} 回`);
  /* 「1 日に何本作れるか」は、ここまでの実測がそのまま答えになる。
     枠を回数で割るだけ。推測を混ぜない。 */
  const perCase = calls / Math.max(1, rows.length);
  if (perCase) console.log(`  1 件あたり ${perCase.toFixed(1)} 回 → 回数枠 1,000/日 なら 約${Math.floor(1000 / perCase)} 本/日`);
  const first = rows.filter((r) => r.first).map((r) => r.first).sort((a, b) => a - b);
  if (first.length) console.log(`  最初の 1 問まで p50 ${Math.round(first[Math.floor(first.length / 2)] / 1000)}s`);
  fs.mkdirSync(path.join(__dirname, "artifacts", "bench"), { recursive: true });
  const tag = ((PROVIDER || "workersai") + "-" + (MODEL || "default")).replace(/[^a-z0-9.-]+/gi, "_");
  fs.writeFileSync(path.join(__dirname, "artifacts", "bench", tag + "-latest.json"),
    JSON.stringify({ target: TARGET, rows, okN, avg, calls, tin, tout }, null, 1));
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
