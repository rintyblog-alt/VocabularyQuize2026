/* ══════════════════════════════════════════════════════════════════════
   Gemini が「資料あり」に本当に使えるかを、叩いて確かめる

   確かめたいのは 3 つ。資料を読んで推し量らない。
     ① PDF をそのまま渡して読めるか（割らずに 1 回で）
     ② 画像（スキャン・写真）から日本語を読めるか
     ③ JSON だけを返せるか（前置きが混ざらないか）

   枠を減らさないよう、1 つの資料につき 1 回だけ。
   Flash Lite は 1 日 500 回なので、この確かめで使うのは 2〜3 回。

   使い方: node probe_gemini.cjs <PDFのパス> <画像のパス>
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const PIN = "8306", PW = "Passw0rd!vq";
const PDF = process.argv[2], IMG = process.argv[3];

/* 資料の中に確かにある言葉。これが返事に出てくるかで「読めたか」を見る。
   1 つでも出れば読めている、では甘いので **複数**を見る。 */
const MUST = ["葉緑体", "クロロフィル", "明反応", "限定要因"];

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}

const PROMPT = [
  "添付の資料だけを読んで、高校生向けの問題を3問つくってください。",
  "**資料に書かれていないことを足してはいけません。**",
  "次の JSON だけを返してください。前置きも後書きも書かないでください。",
  '{"questions":[{"question":"","answer":"","explanation":"","quote":"資料から引用した根拠の一文"}]}'
].join("\n");

(async () => {
  const u = "vqg" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: PW } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: PIN } });
  const tk = c.j.token;
  if (!tk) { console.error("検証アカウントを作れません"); process.exit(1); }

  const cases = [];
  if (PDF && fs.existsSync(PDF)) {
    cases.push({ name: "PDF をそのまま", mimeType: "application/pdf", path: PDF });
  }
  if (IMG && fs.existsSync(IMG)) {
    cases.push({ name: "画像（スキャン風）", mimeType: "image/png", path: IMG });
  }
  cases.push({ name: "資料なし（比較用）", mimeType: null, path: null });

  for (const cs of cases) {
    const files = [];
    let mb = 0;
    if (cs.path) {
      const buf = fs.readFileSync(cs.path);
      mb = buf.length / 1024 / 1024;
      files.push({ mimeType: cs.mimeType, data: buf.toString("base64") });
    }
    const r = await call("/api/ai/probe", {
      method: "POST", token: tk,
      body: {
        provider: "gemini", model: "gemini-3.1-flash-lite",
        prompt: cs.path ? PROMPT : PROMPT + "\n（資料は添付されていません。作れないなら questions を空にしてください。）",
        files, max_tokens: 2048, temperature: 0.2,
        responseSchema: { type:"OBJECT", properties:{ questions:{ type:"ARRAY", items:{ type:"OBJECT", properties:{ question:{type:"STRING"}, answer:{type:"STRING"}, explanation:{type:"STRING"}, quote:{type:"STRING"} }, required:["question","answer"] } } }, required:["questions"] }
      }
    });
    const j = r.j;
    console.log("\n══ " + cs.name + (mb ? "（" + mb.toFixed(2) + "MB）" : "") + " ══");
    if (!j.ok) {
      console.log("  NG  " + (j.reason || "") + "  " + String(j.error || "").replace(/\s+/g, " ").slice(0, 200));
      continue;
    }
    let parsed = null;
    try { parsed = JSON.parse(j.text); } catch (e) {}
    const qs = (parsed && Array.isArray(parsed.questions)) ? parsed.questions : [];
    const whole = JSON.stringify(parsed || j.text);
    const hit = MUST.filter((w) => whole.indexOf(w) >= 0);
    console.log("  時間 " + j.ms + "ms   字数 入" + (j.usage?.prompt_tokens ?? "?") + " / 出" + (j.usage?.completion_tokens ?? "?"));
    console.log("  JSON " + (j.isJson ? "○" : "×") + "   問題 " + qs.length + " 問" + (j.truncated ? "   ※途中で切れた" : ""));
    console.log("  資料の言葉 " + hit.length + "/" + MUST.length + " 一致 … " + (hit.join("、") || "なし"));
    if (qs[0]) {
      console.log("  例: " + String(qs[0].question || "").replace(/\s+/g, " ").slice(0, 70));
      if (qs[0].quote) console.log("  根拠: " + String(qs[0].quote).replace(/\s+/g, " ").slice(0, 70));
    }
    /* 形が思ったとおりかを **必ず** 見る。ここを出していなかったので、
       「JSON は返っているのに 0 問」の理由が分からなかった。 */
    if (!qs.length) console.log("  返事の形: " + String(j.text || "").replace(/\s+/g, " ").slice(0, 300));
  }
})();
