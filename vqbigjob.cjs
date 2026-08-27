/* 30〜50 ページ相当の資料で Quick Mock を測る（ケース C）。

   10 ページの資料だけで「大量資料での性能」を判断しないための計測。
   実在する複数の PDF のテキスト層を使う（ページ解析は通らない経路）。
   ページ解析・OCR・画像処理は今回の対象外なので、そこを通さない形で測る。

   実行:
     VQ_Q=30 node vqbigjob.cjs
     VQ_DOCS="/path/a.pdf,/path/b.pdf" VQ_Q=100 node vqbigjob.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const COUNT = Number(process.env.VQ_Q) || 30;
const EXTRACT = process.env.VQ_PDFTEXT || "/tmp/pdftext";
const DOCS = (process.env.VQ_DOCS
  || "/Users/user/Downloads/2025-2-1ji-2kyu.pdf,/Users/user/Downloads/info1_mock_90min_fixed.pdf")
  .split(",").map((s) => s.trim()).filter(Boolean);
const hr = () => Number(process.hrtime.bigint()) / 1e6;

async function jpost(p, body) {
  const r = await fetch(BRIDGE + p, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(p + " → " + r.status + " " + t.slice(0, 200));
  return t ? JSON.parse(t) : {};
}

/* PDF のテキスト層をページごとに取り出す（macOS 標準の PDFKit を使う小さな実行ファイル）。 */
function pagesOf(file) {
  const out = execFileSync(EXTRACT, [file], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(out);
}

async function upload(file, jobId, o) {
  const buf = fs.readFileSync(file);
  const init = await jpost("/attachments/init", {
    jobId, name: path.basename(file), kind: o.kind, mimeType: o.mimeType, bytes: buf.length
  });
  const partBytes = Number(init.partBytes) || 8 * 1024 * 1024;
  const parts = Math.max(1, Math.ceil(buf.length / partBytes));
  for (let i = 0; i < parts; i++) {
    const slice = buf.subarray(i * partBytes, Math.min(buf.length, (i + 1) * partBytes));
    const r = await fetch(BRIDGE + "/attachments/part?job=" + encodeURIComponent(init.jobId)
      + "&id=" + encodeURIComponent(init.attachmentId) + "&index=" + i, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: slice });
    if (!r.ok) throw new Error("part " + i + " → " + r.status);
  }
  await jpost("/attachments/complete",
    { jobId: init.jobId, attachmentId: init.attachmentId, totalParts: parts });
  return { id: init.attachmentId, jobId: init.jobId, bytes: buf.length, name: path.basename(file) };
}

(async () => {
  const h = await (await fetch(BRIDGE + "/health")).json();
  console.log("Bridge open =", h.open, "／ 問題数", COUNT);

  let totalPages = 0, totalChars = 0;
  const docs = [];
  for (const f of DOCS) {
    const pages = pagesOf(f);
    const text = pages.map((p) => "（" + p.page + "ページ）\n" + p.text).join("\n\n");
    totalPages += pages.length; totalChars += text.length;
    docs.push({ file: f, pages: pages.length, text });
    console.log("  " + path.basename(f) + ": " + pages.length + " ページ / " + text.length + " 字");
  }
  console.log("合計 " + totalPages + " ページ / " + totalChars + " 字");

  let jobId = "";
  const ups = [];
  for (const d of docs) {
    const u = await upload(d.file, jobId, { kind: "pdf", mimeType: "application/pdf" });
    jobId = u.jobId;
    ups.push(Object.assign(u, { text: d.text, pages: d.pages }));
  }

  /* 端末で取り出した文章を添える（本番のテキスト PDF と同じ形）。
     ファイル本体は分割アップロード済みで、JSON には載せない。 */
  const attachments = ups.map((u) => ({
    id: u.id, attachmentId: u.id, jobId, name: u.name,
    kind: "pdf", fileType: "pdf", mimeType: "application/pdf", bytes: u.bytes,
    pageCount: u.pages,
    extractedText: u.text.slice(0, 400000),
    extractedCharacterCount: Math.min(u.text.length, 400000)
  }));

  const body = JSON.stringify({
    message: "この資料の全体から " + COUNT + " 問つくってください。",
    attachments,
    options: { questionCount: COUNT, sourceOnly: true, structuredOutput: "mock" },
    stream: true
  });

  console.log("\n生成を要求します…");
  const t0 = hr();
  const events = [];
  let heartbeats = 0, maxGap = 0, lastAt = 0;
  await new Promise((resolve, reject) => {
    const u = new URL(BRIDGE + "/chat/completions");
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      if (res.statusCode !== 200) {
        let t = ""; res.on("data", (d) => { t += d; });
        res.on("end", () => reject(new Error(res.statusCode + " " + t.slice(0, 300))));
        return;
      }
      let buf = "", ev = null;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        /* 無音の最長時間を測る。heartbeat が効いているかの実測値になる。 */
        const now = hr();
        if (lastAt) maxGap = Math.max(maxGap, now - lastAt);
        lastAt = now;
        buf += chunk;
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            let d = null; try { d = JSON.parse(line.slice(5).trim()); } catch { }
            if (!d || ev === "token") continue;
            if (ev === "heartbeat") { heartbeats++; continue; }
            events.push({ at: +(now - t0).toFixed(0), ev,
                          label: (d.label || d.message || "").slice(0, 80),
                          status: d.status || null,
                          detail: d.detail ? String(d.detail).slice(0, 200) : null,
                          report: d.report || null });
          }
        }
      });
      res.on("end", resolve);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
  const totalMs = hr() - t0;
  console.log("\n総時間 " + (totalMs / 1000).toFixed(1) + " 秒");
  console.log("heartbeat " + heartbeats + " 回 ／ SSE が無音だった最長 "
    + (maxGap / 1000).toFixed(1) + " 秒");
  console.table(events.filter((e) => /worker|schema|verify|revise|mock|error|warning/i.test(
    (e.ev || "") + (e.label || ""))).map((e) => ({ 秒: (e.at / 1000).toFixed(1),
      見出し: e.label, 状態: e.status, 内訳: e.detail })));
  const rep = events.filter((e) => e.report).pop();
  if (rep) { console.log("\n生成の内訳:"); console.log(JSON.stringify(rep.report, null, 1)); }
  fs.writeFileSync(process.env.VQ_OUT || "/tmp/vqbigjob.json",
    JSON.stringify({ totalMs, heartbeats, maxGapMs: maxGap, totalPages, totalChars, events }, null, 2));
})();
