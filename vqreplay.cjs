/* Bridge が実際に Ollama へ送った最終リクエストを、そのまま再送する。

   「同じプロンプトのつもり」では突き合わせにならない。
   VQ_TIMELINE で記録した ollama.request の各項目（model / num_ctx / num_predict /
   temperature / format / system と user の指紋と文字数 / 画像の指紋とバイト数 /
   リクエスト全体のバイト数）を、直接実行と 1 項目ずつ比べる。

   画像の中身は記録に残していない（資料本文を診断情報として残さないため）。
   再送するときは、指紋の合うページ画像をこちらで読み直して添える。

   実行:
     node vqreplay.cjs diff  <timeline.jsonl>          … 記録した最終リクエストの一覧と差分
     node vqreplay.cjs send  <timeline.jsonl> <reqId>  … その 1 件を再送して時間を測る
*/
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const OLLAMA = process.env.VQ_OLLAMA || "http://127.0.0.1:11434";
const PAGES = process.env.VQ_PAGES
  || require("path").join(__dirname, "_fixtures", "pages");
const hr = () => Number(process.hrtime.bigint()) / 1e6;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

function read(file) {
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const req = new Map();
  for (const r of rows) {
    if (r.kind === "ollama.request") req.set(r.reqId, { req: r });
    else if (r.kind === "ollama.done" && req.has(r.reqId)) req.get(r.reqId).done = r;
    else if (r.kind === "ollama.firstByte" && req.has(r.reqId)) req.get(r.reqId).firstByte = r;
  }
  return { rows, req };
}

/* 手元のページ画像の指紋を作っておく。記録の imageShas と突き合わせる。 */
function pageIndex() {
  const m = new Map();
  if (!fs.existsSync(PAGES)) return m;
  for (const f of fs.readdirSync(PAGES).filter((x) => /\.(png|jpe?g)$/i.test(x))) {
    const p = path.join(PAGES, f);
    m.set(sha(fs.readFileSync(p).toString("base64")), p);
  }
  return m;
}

const FIELDS = ["purpose", "endpoint", "model", "stream", "keepAlive", "numCtx", "numPredict",
  "temperature", "topP", "topK", "seed", "hasFormat", "formatSha",
  "systemSha", "systemChars", "userSha", "userChars", "images", "requestBytes"];

function cmdDiff(file) {
  const { req } = read(file);
  const idx = pageIndex();
  console.log("記録された Ollama 生成リクエスト:", req.size, "件\n");
  const rows = [];
  for (const [id, e] of req) {
    const r = e.req, d = e.done || {};
    rows.push({
      reqId: id, purpose: r.purpose, numCtx: r.numCtx, numPredict: r.numPredict,
      temp: r.temperature, format: r.hasFormat ? "有" : "無",
      sysChars: r.systemChars, usrChars: r.userChars, 画像: r.images,
      reqKB: Math.round(r.requestBytes / 1024),
      loadMs: d.loadMs, peMs: d.promptEvalMs, evalMs: d.evalMs,
      inTok: d.promptEvalCount, outTok: d.evalCount, done: d.doneReason
    });
  }
  console.table(rows);

  /* 同じ目的の呼び出しどうしで、何が違っているか。 */
  const byPurpose = new Map();
  for (const [, e] of req) {
    const k = e.req.purpose || "?";
    if (!byPurpose.has(k)) byPurpose.set(k, []);
    byPurpose.get(k).push(e.req);
  }
  for (const [k, list] of byPurpose) {
    const varied = FIELDS.filter((f) => new Set(list.map((x) => String(x[f]))).size > 1);
    console.log("目的 " + k + "（" + list.length + " 件）ばらついた項目: "
      + (varied.length ? varied.join(", ") : "なし（全件同一）"));
  }
  const known = [...req.values()].flatMap((e) => e.req.imageShas || []).filter((s) => idx.has(s));
  console.log("\n画像の指紋が手元のページ画像と一致した件数: " + known.length);
}

async function cmdSend(file, reqId) {
  const { req } = read(file);
  const e = req.get(reqId);
  if (!e) { console.error("その reqId は記録にありません:", reqId); process.exit(2); }
  const r = e.req;
  const idx = pageIndex();
  const imgs = (r.imageShas || []).map((s) => idx.get(s)).filter(Boolean);
  if (imgs.length !== r.images) {
    console.error("画像を復元できません（記録 " + r.images + " 枚 / 見つかった " + imgs.length + " 枚）。"
      + "VQ_PAGES にそのページ画像を置いてください。");
    process.exit(2);
  }
  console.log("再送します:", JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, r[f]])), null, 0));
  console.log("※ 本文そのものは記録していないため、文字は同じ長さの伏せ字で送ります。"
    + "画像と各 option は記録どおりです。");
  const filler = (n) => "あ".repeat(Math.max(0, n));
  const messages = [];
  if (r.systemChars) messages.push({ role: "system", content: filler(r.systemChars) });
  messages.push({ role: "user", content: filler(r.userChars),
                  images: imgs.map((p) => fs.readFileSync(p).toString("base64")) });
  const body = { model: r.model, messages, stream: false, keep_alive: r.keepAlive,
                 options: { num_predict: r.numPredict, num_ctx: r.numCtx, temperature: r.temperature } };
  const t0 = hr();
  const res = await fetch(OLLAMA + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  console.log("\n再送の結果:");
  console.table([{
    wallMs: Math.round(hr() - t0),
    loadMs: Math.round((j.load_duration || 0) / 1e6),
    promptEvalMs: Math.round((j.prompt_eval_duration || 0) / 1e6),
    evalMs: Math.round((j.eval_duration || 0) / 1e6),
    inTok: j.prompt_eval_count, outTok: j.eval_count, done: j.done_reason
  }]);
  console.log("記録されていた同じ呼び出し:");
  console.table([{ wallMs: Math.round(e.done.wallMs), loadMs: e.done.loadMs,
    promptEvalMs: e.done.promptEvalMs, evalMs: e.done.evalMs,
    inTok: e.done.promptEvalCount, outTok: e.done.evalCount, done: e.done.doneReason }]);
}

const [cmd, file, arg] = process.argv.slice(2);
if (!cmd || !file) {
  console.log("使い方: node vqreplay.cjs diff <timeline.jsonl>");
  console.log("        node vqreplay.cjs send <timeline.jsonl> <reqId>");
  process.exit(2);
}
if (cmd === "diff") cmdDiff(file);
else if (cmd === "send") cmdSend(file, arg);
else { console.error("不明な命令:", cmd); process.exit(2); }
