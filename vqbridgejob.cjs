/* 実際の Bridge へ HTTP で投げて、ページ解析の時間を測る（経路 D）。

   ブラウザは使わない。分割アップロード → 添付 → 生成要求までを
   本番と同じ API で通し、SSE の到着時刻をそのまま記録する。
   Bridge を VQ_TIMELINE 付きで起動しておけば、
   サーバー内部のページ別段階も同時に取れる。

   実行:
     VQ_BRIDGE=http://127.0.0.1:17891 node vqbridgejob.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
/* 生成が長いあいだ SSE が途切れることがある（100 問だと検証の 1 回が数分続く）。
   Node の fetch は「本文が 5 分止まったら切る」ので、計測用は外しておく。
   ここを外さないと、時間ではなくクライアント都合で落ちる
   （実測: UND_ERR_BODY_TIMEOUT で 100 問の回が中断した）。 */
try {
  const u = require("node:http");   /* undici は node 内蔵の非公開モジュール */
  const undici = process.binding ? null : null;
} catch { }
const { Agent, setGlobalDispatcher } = (() => {
  try { return require("undici"); } catch { return {}; }
})();
if (setGlobalDispatcher && Agent)
  setGlobalDispatcher(new Agent({ bodyTimeout: 0, headersTimeout: 0 }));

const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const PAGES = process.env.VQ_PAGES
  || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/pages";
const COUNT = Number(process.env.VQ_Q) || 10;
const PDF = process.env.VQ_PDF || "/Users/user/Downloads/biomimetics.pdf";
const PART = 8 * 1024 * 1024;
const hr = () => Number(process.hrtime.bigint()) / 1e6;

const files = fs.readdirSync(PAGES).filter((f) => /\.png$/.test(f)).sort()
  .map((f) => path.join(PAGES, f));

async function jpost(p, body) {
  const r = await fetch(BRIDGE + p, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(p + " → " + r.status + " " + t.slice(0, 200));
  return t ? JSON.parse(t) : {};
}

/* 1 ファイルを分割で上げる。ファイル本体は JSON にも base64 にもしない。
   kind は画面側（uploader.js kindOf）と同じ決め方にする。 */
async function upload(file, jobId, o) {
  o = o || {};
  const buf = fs.readFileSync(file);
  const name = o.name || path.basename(file);
  const init = await jpost("/attachments/init", {
    jobId, name, kind: o.kind || "image", mimeType: o.mimeType || "image/png",
    bytes: buf.length
  });
  const id = init.attachmentId;
  const partBytes = Number(init.partBytes) || PART;
  const parts = Math.max(1, Math.ceil(buf.length / partBytes));
  for (let i = 0; i < parts; i++) {
    const slice = buf.subarray(i * partBytes, Math.min(buf.length, (i + 1) * partBytes));
    const r = await fetch(BRIDGE + "/attachments/part?job=" + encodeURIComponent(init.jobId)
      + "&id=" + encodeURIComponent(id) + "&index=" + i, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: slice
    });
    if (!r.ok) throw new Error("part " + i + " → " + r.status + " " + (await r.text()).slice(0, 200));
  }
  await jpost("/attachments/complete", { jobId: init.jobId, attachmentId: id, totalParts: parts });
  return { id, name, bytes: buf.length, jobId: init.jobId,
           kind: o.kind || "image", mimeType: o.mimeType || "image/png" };
}

(async () => {
  const h = await (await fetch(BRIDGE + "/health")).json();
  console.log("Bridge:", JSON.stringify(h).slice(0, 200));

  /* 画面と同じ順で上げる。まず資料そのもの、次にページ画像。
     ページ画像は親（資料）へひも付ける。ここを外すと
     ページが 1 件ずつ別の資料として扱われ、本番と形が変わる。 */
  console.log("\n資料と " + files.length + " ページを分割アップロードします…");
  const tUp = hr();
  let jobId = "";
  const parent = await upload(PDF, jobId,
    { name: path.basename(PDF), kind: "pdf", mimeType: "application/pdf" });
  jobId = parent.jobId;
  process.stdout.write("P");
  const ups = [];
  for (let i = 0; i < files.length; i++) {
    const u = await upload(files[i], jobId,
      { name: path.basename(PDF) + "（" + (i + 1) + "ページ）.png" });
    ups.push(u); process.stdout.write(".");
  }
  console.log("\n  アップロード " + ((hr() - tUp) / 1000).toFixed(1) + " 秒 ／ jobId " + jobId);

  /* 要求 JSON に載せるのは置き場所だけ。本体も base64 も載せない。 */
  const attachments = [
    { id: parent.id, attachmentId: parent.id, jobId, name: parent.name,
      kind: "pdf", fileType: "pdf", mimeType: "application/pdf", bytes: parent.bytes,
      pageCount: files.length }
  ].concat(ups.map((u, i) => ({
    id: u.id, attachmentId: u.id, jobId, name: u.name,
    kind: "image", fileType: "image", mimeType: "image/png", bytes: u.bytes,
    parentAttachmentId: parent.id, pageNumber: i + 1
  })));

  console.log("\n生成を要求します（" + COUNT + " 問・資料限定）…");
  const t0 = hr();
  const body = JSON.stringify({
    message: "この資料の全ページから " + COUNT + " 問つくってください。",
    attachments,
    options: { questionCount: COUNT, sourceOnly: true, structuredOutput: "mock" },
    stream: true
  });

  /* fetch は「本文が 5 分止まったら切る」ので使わない。
     100 問だと検証の 1 回が数分かかり、時間ではなくクライアント都合で落ちた
     （実測: UND_ERR_BODY_TIMEOUT）。node:http には本文の時間制限が無い。 */
  const events = [];
  await new Promise((resolve, reject) => {
    const u = new URL(BRIDGE + "/chat/completions");
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      if (res.statusCode !== 200) {
        let t = ""; res.on("data", (d) => { t += d; });
        res.on("end", () => reject(new Error("生成要求が通りません: " + res.statusCode + " " + t.slice(0, 400))));
        return;
      }
      let buf = "", ev = null;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            let d = null; try { d = JSON.parse(line.slice(5).trim()); } catch { }
            if (!d || ev === "token") continue;      /* 本文は残さない */
            events.push({ at: +(hr() - t0).toFixed(0), ev,
                          label: (d.label || d.message || "").slice(0, 70),
                          status: d.status || null, current: d.current, total: d.total,
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
  console.log("\n総時間 " + (totalMs / 1000).toFixed(1) + " 秒 ／ SSE " + events.length + " 件\n");
  console.table(events.filter((e) => /vision|analysis|orchestrator|worker|mock|schema|revise|verify|completed|error|failed/i.test(
    (e.ev || "") + " " + (e.label || ""))).map((e) => ({ 秒: (e.at / 1000).toFixed(1), 種類: e.ev,
      見出し: e.label, 状態: e.status, 内訳: e.detail })));
  const rep = events.filter((e) => e.report).pop();
  if (rep) { console.log("\n生成の内訳:"); console.log(JSON.stringify(rep.report, null, 1)); }

  const out = process.env.VQ_OUT || "/tmp/vqbridgejob.json";
  fs.writeFileSync(out, JSON.stringify({ totalMs, events }, null, 2));
  console.log("記録:", out);
})();
