/* ══════════════════════════════════════════════════════════════════════
   Groq の「1 日に何回 / 1 分に何トークン」を、返事のヘッダーから読む

   上限は資料を読むより **返事に書いてある値**が正確（提供元が実際に見ている数字）。
   枠を減らさないよう、1 モデルにつき 1 回だけ・max_tokens は最小（16）で叩く。
   1 回あたりの消費は「入 20 前後 / 出 16 以下」で、1 日枠のごく一部。

   使い方: node probe_groq_limits.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const PIN = "8306", PW = "Passw0rd!vq";

/* 実際に使う候補だけ。数を増やすとそのぶん枠を使うので広げない。 */
const MODELS = [
  "openai/gpt-oss-20b",       /* 資料なしの本命（実測 1.3 秒） */
  "openai/gpt-oss-120b",      /* 難しい問題用の控え */
  "llama-3.1-8b-instant"      /* さらに軽い控え */
];

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}
const uniq = () => "vqg" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);

/* "2h59m59.5s" のような表記を秒に直す。上限が 1 日ぶんか 1 分ぶんかは、
   この戻り時間を見れば分かる（1 日なら数時間、1 分なら数十秒）。 */
function toSec(v) {
  const s = String(v || "");
  let t = 0, m;
  const re = /([\d.]+)(ms|h|m|s)/g;
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1]);
    t += m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : m[2] === "ms" ? n / 1000 : n;
  }
  return t || null;
}
const period = (sec) => sec == null ? "?" : (sec > 3600 * 3 ? "1日" : sec > 90 ? "1時間?" : "1分");

(async () => {
  const u = uniq();
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: PW } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: PIN } });
  const tk = c.j.token;
  if (!tk) { console.error("検証アカウントを作れません", a.s, b.s, c.s); process.exit(1); }

  for (const m of MODELS) {
    const r = await call("/api/ai/probe", {
      method: "POST", token: tk,
      body: {
        provider: "groq", model: m, max_tokens: 16, temperature: 0,
        response_format: null,                       /* JSON 検証で弾かれると上限が読めない */
        messages: [{ role: "user", content: "hi" }]
      }
    });
    const j = r.j;
    const L = j.limits || {};
    console.log("\n══ " + m + " ══");
    if (!j.ok && !Object.keys(L).length) {
      console.log("  読めません: " + (j.reason || "") + " " + String(j.error || "").replace(/\s+/g, " ").slice(0, 140));
      continue;
    }
    const rl = L["x-ratelimit-limit-requests"], rr = L["x-ratelimit-remaining-requests"], rs = L["x-ratelimit-reset-requests"];
    const tl = L["x-ratelimit-limit-tokens"], tr = L["x-ratelimit-remaining-tokens"], ts = L["x-ratelimit-reset-tokens"];
    console.log("  回数  上限 " + String(rl || "?").padStart(8) + " / 残り " + String(rr || "?").padStart(8)
      + "  戻るまで " + String(rs || "?").padStart(12) + "  → " + period(toSec(rs)) + "あたり");
    console.log("  字数  上限 " + String(tl || "?").padStart(8) + " / 残り " + String(tr || "?").padStart(8)
      + "  戻るまで " + String(ts || "?").padStart(12) + "  → " + period(toSec(ts)) + "あたり");
    /* 上の 4 つ以外の上限ヘッダー（1 日ぶんの字数など）も、あれば全部出す */
    const rest = Object.keys(L).filter((k) => !/^x-ratelimit-(limit|remaining|reset)-(requests|tokens)$/.test(k));
    if (rest.length) console.log("  そのほか: " + rest.map((k) => k + "=" + L[k]).join("  "));
    if (j.ok) console.log("  （この 1 回の消費: 入 " + (j.usage?.prompt_tokens ?? "?") + " / 出 " + (j.usage?.completion_tokens ?? "?") + "）");
    else console.log("  ※ 呼び出し自体は失敗: " + (j.reason || "") + " " + String(j.error || "").replace(/\s+/g, " ").slice(0, 120));
  }
})();
