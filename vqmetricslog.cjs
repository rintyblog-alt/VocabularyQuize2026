/* Bridge の記録が、必要なものを残し、残してはいけないものを残さないかを確かめる。

   確かめること:
     ・工程ごとの内訳（stages）が metrics.jsonl に残る  ← これまで消えていた
     ・失敗した依頼も、どこで落ちたかが残る
     ・依頼者は短いハッシュだけ（生の ID・メールアドレスを書かない）
     ・本文・添付・認証トークンを書かない
     ・大きくなったら世代を送る（無限に増えない）

   実行: node vqmetricslog.cjs
   前提: Bridge が動いていること（./local-ai/scripts/start-open.sh）
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const LOGDIR = path.join(os.homedir(), "Library", "Application Support", "VocabuQuiz", "Logs");
const METRICS = path.join(LOGDIR, "metrics.jsonl");
const BRIDGE = path.join(LOGDIR, "bridge.log");
const BASE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";

/* 実際に送る文。ログへ漏れていないかを、この文字列で探す。 */
const SECRET_TEXT = "ヒミツの合言葉ズワルバ" + crypto.randomBytes(3).toString("hex");
const OWNER_ID = "test-user-" + crypto.randomBytes(4).toString("hex") + "@example.com";

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push({ name, detail: detail || "" }); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }
function tailLines(file, n) {
  if (!fs.existsSync(file)) return [];
  const all = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  return all.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/* Bridge のトークンは Config/bridge-tokens.json にある。
   読むだけで、値は画面にもログにも出さない。 */
function token() {
  if (process.env.VQ_BRIDGE_TOKEN) return process.env.VQ_BRIDGE_TOKEN;
  try {
    const p = path.join(os.homedir(), "Library", "Application Support", "VocabuQuiz", "Config", "bridge-tokens.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const list = Array.isArray(j.tokens) ? j.tokens : [];
    const t = list[list.length - 1];
    return typeof t === "string" ? t : (t && (t.token || t.value)) || "";
  } catch { return ""; }
}

(async () => {

/* ══ 0) 準備 ══ */
const before = { metrics: fs.existsSync(METRICS) ? fs.statSync(METRICS).size : 0 };

section("Bridge へ 1 件流す");
const tk = token();
let sent = false;
try {
  const res = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, tk ? { Authorization: "Bearer " + tk } : {}),
    body: JSON.stringify({
      requestId: "req-metricstest-" + Date.now(),
      conversationId: "conv-metricstest",
      messageId: "msg-metricstest",
      message: SECRET_TEXT + " とは何ですか。ひとことで。",
      thinkingLevel: "fast",
      ownerId: OWNER_ID,
      plan: "free",
      attachments: [], conversationContext: [],
      options: { language: "ja" }
    })
  });
  if (!res.ok) { console.log(`  （Bridge が ${res.status} を返しました。記録の中身だけ確かめます）`); }
  else { await res.text(); sent = true; console.log("  送信して最後まで受け取りました"); }
} catch (e) {
  console.log(`  （Bridge へ届きませんでした: ${e.message}。記録の中身だけ確かめます）`);
}

/* SSE の受信が終わってもファイル書き込みが一瞬遅れることがある */
await new Promise((r) => setTimeout(r, 1200));

/* ══ 1) 工程ごとの内訳が残るか ══ */
section("工程ごとの内訳（これまで消えていたもの）");
{
  ok("metrics.jsonl ができている", fs.existsSync(METRICS), METRICS);
  const rows = tailLines(METRICS, 5);
  const mine = rows.filter((r) => r && r.stages);
  ok("stages を持つ行がある", mine.length > 0, `直近5行: ${JSON.stringify(rows.map((r) => Object.keys(r || {}).join("/")))}`);
  if (mine.length) {
    const r = mine[mine.length - 1];
    ok("工程名と所要時間が入っている",
       Array.isArray(r.stages) && r.stages.every((s) => typeof s.stage === "string" && typeof s.ms === "number"),
       JSON.stringify((r.stages || []).slice(0, 3)));
    ok("合計時間が入っている", typeof r.totalMs === "number", String(r.totalMs));
    ok("順番待ち時間が入っている", typeof r.queuedMs === "number", String(r.queuedMs));
    console.log(`     工程: ${(r.stages || []).map((s) => s.stage + " " + s.ms + "ms").slice(0, 6).join(" / ")}`);
  }
  if (sent) ok("送ったぶん metrics.jsonl が増えた",
               fs.statSync(METRICS).size > before.metrics,
               `${before.metrics} → ${fs.existsSync(METRICS) ? fs.statSync(METRICS).size : 0}`);
}

/* ══ 2) 依頼者は短いハッシュだけ ══ */
section("依頼者の記録（生の ID を書かないこと）");
{
  const both = [METRICS, BRIDGE].filter((f) => fs.existsSync(f));
  const text = both.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  ok("生の利用者 ID がログに無い", !text.includes(OWNER_ID), "OWNER_ID がそのまま書かれています");
  ok("メールアドレスの形が metrics.jsonl に無い",
     !/[\w.+-]+@[\w-]+\.[\w.]+/.test(fs.existsSync(METRICS) ? fs.readFileSync(METRICS, "utf8") : ""),
     "@ を含む文字列が見つかりました");

  const rows = tailLines(METRICS, 5).filter((r) => r && r.owner);
  if (rows.length) {
    const w = rows[rows.length - 1].owner;
    ok("依頼者は 8 文字の 16 進", /^[0-9a-f]{8}$/.test(w), String(w));
    const want = crypto.createHash("sha256").update(OWNER_ID).digest("hex").slice(0, 8);
    if (sent) ok("送った ID のハッシュと一致する", w === want, `${w} / 期待 ${want}`);
  } else {
    console.log("  （owner を持つ行がまだありません。Bridge 再起動後に取り直してください）");
  }
}

/* ══ 3) 本文・添付・トークンを書かない ══ */
section("書いてはいけないもの");
{
  const files = [METRICS, BRIDGE].filter((f) => fs.existsSync(f));
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    ok(`${path.basename(f)} に会話本文が無い`, !text.includes(SECRET_TEXT));
    ok(`${path.basename(f)} に Bearer トークンが無い`, !/Bearer\s+[A-Za-z0-9._-]{10,}/.test(text));
    if (tk) ok(`${path.basename(f)} に Bridge トークンそのものが無い`, !text.includes(tk));
  }
}

/* ══ 4) 世代送り（無限に増えないこと） ══ */
section("世代送り");
{
  /* 実ファイルは触らない。一時ファイルで同じ規則を確かめる。 */
  const tmp = path.join(os.tmpdir(), "vqrot-" + crypto.randomBytes(4).toString("hex"), "t.log");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  const MAX = 5 * 1024 * 1024;
  fs.writeFileSync(tmp, "x".repeat(MAX + 10));

  /* server.mjs の rotateIfBig と同じ手順 */
  const KEEP = 2;
  for (let i = KEEP; i >= 1; i--) {
    const from = i === 1 ? tmp : `${tmp}.${i - 1}`;
    const to = `${tmp}.${i}`;
    if (i === KEEP) { try { fs.rmSync(to, { force: true }); } catch {} }
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  fs.appendFileSync(tmp, "new\n");
  ok("大きくなったら .1 へ送られる", fs.existsSync(tmp + ".1"));
  ok("新しいファイルは小さい", fs.statSync(tmp).size < 100, String(fs.statSync(tmp).size));
  ok("実装と同じ上限（5MB・2世代）を使っている",
     /MAX_LOG_BYTES = 5 \* 1024 \* 1024/.test(fs.readFileSync(path.join(__dirname, "local-ai", "src", "server.mjs"), "utf8")) &&
     /KEEP_GENERATIONS = 2/.test(fs.readFileSync(path.join(__dirname, "local-ai", "src", "server.mjs"), "utf8")));
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

console.log(`\n══ まとめ ══`);
console.log(`  合格 ${pass} / 不合格 ${fail}`);
if (failures.length) {
  console.log("  不合格の中身:");
  failures.forEach((f) => console.log(`    - ${f.name}${f.detail ? " — " + f.detail : ""}`));
}
process.exit(fail ? 1 : 0);

})().catch((e) => { console.error(e); process.exit(1); });
