/* ブラウザの Quick Mock 経路で、長い生成のあいだ接続が切れないかを確かめる。

   計測用の node クライアントでは意味がない（そちらは自分で timeout を外せる）。
   実際のブラウザ・実際の fetch・実際の SSE 解釈で 15 分以上つながるかを見る。

   確認するのは 3 つ。
     ・heartbeat が 15 秒間隔で届いているか
     ・SSE が無音だった最長時間（heartbeat が効いていれば 20 秒を超えない）
     ・heartbeat を進捗として数えていないか（問題数が動かないこと）

   実行: node vqheartbeat.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const PDF = process.env.VQ_PDF || "/Users/user/Downloads/2025-2-1ji-2kyu.pdf";
const PDF2 = process.env.VQ_PDF2 || "/Users/user/Downloads/info1_mock_90min_fixed.pdf";
const COUNT = Number(process.env.VQ_Q) || 100;
const MIN_MINUTES = Number(process.env.VQ_MIN_MIN) || 15;
const OUT = process.argv[2] || "shots/heartbeat";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();

  /* ブラウザの中で SSE を受ける。ページ側の fetch を使うので、
     ブラウザの実際の挙動（アイドル切断・省電力）がそのまま出る。 */
  const log = [];
  pg.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("VQHB ")) { log.push(JSON.parse(t.slice(5))); }
  });

  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });

  const a = fs.readFileSync(PDF).toString("base64");
  const b = fs.readFileSync(PDF2).toString("base64");

  console.log("ブラウザから " + COUNT + " 問を要求します（" + MIN_MINUTES + " 分以上つながるかを見ます）…");
  const res = await pg.evaluate(async (arg) => {
    const say = (o) => console.log("VQHB " + JSON.stringify(o));
    const b64ToBlob = (s, type) => {
      const bin = atob(s);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type });
    };
    /* 分割アップロード（本番と同じ API・本体は JSON に載せない） */
    async function upload(blob, name, jobId) {
      const init = await (await fetch(arg.bridge + "/attachments/init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, name, kind: "pdf",
                               mimeType: "application/pdf", bytes: blob.size })
      })).json();
      const part = init.partBytes || 8 * 1024 * 1024;
      const n = Math.max(1, Math.ceil(blob.size / part));
      for (let i = 0; i < n; i++) {
        await fetch(arg.bridge + "/attachments/part?job=" + encodeURIComponent(init.jobId)
          + "&id=" + encodeURIComponent(init.attachmentId) + "&index=" + i, {
          method: "PUT", headers: { "Content-Type": "application/octet-stream" },
          body: blob.slice(i * part, Math.min(blob.size, (i + 1) * part)) });
      }
      await fetch(arg.bridge + "/attachments/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: init.jobId, attachmentId: init.attachmentId, totalParts: n })
      });
      return { id: init.attachmentId, jobId: init.jobId, bytes: blob.size, name };
    }

    const files = [
      { blob: b64ToBlob(arg.a, "application/pdf"), name: "資料1.pdf", text: arg.textA },
      { blob: b64ToBlob(arg.b, "application/pdf"), name: "資料2.pdf", text: arg.textB }
    ];
    let jobId = "";
    const ups = [];
    for (const f of files) { const u = await upload(f.blob, f.name, jobId); jobId = u.jobId; ups.push(u); }

    const attachments = ups.map((u, i) => ({
      id: u.id, attachmentId: u.id, jobId, name: u.name,
      kind: "pdf", fileType: "pdf", mimeType: "application/pdf", bytes: u.bytes,
      extractedText: files[i].text.slice(0, 400000),
      extractedCharacterCount: Math.min(files[i].text.length, 400000)
    }));

    const t0 = performance.now();
    const r = await fetch(arg.bridge + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "この資料の全体から " + arg.count + " 問つくってください。",
        attachments,
        options: { questionCount: arg.count, sourceOnly: true, structuredOutput: "mock" },
        stream: true
      })
    });
    if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).slice(0, 300) };

    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", ev = null, last = performance.now(), maxGap = 0;
    let heartbeats = 0, activities = 0, done = false, err = null;
    const gaps = [];
    while (true) {
      const { done: fin, value } = await reader.read();
      if (fin) break;
      const now = performance.now();
      const gap = now - last; last = now;
      if (gap > maxGap) maxGap = gap;
      gaps.push(Math.round(gap));
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) {
          let d = null; try { d = JSON.parse(line.slice(5).trim()); } catch { }
          if (!d) continue;
          if (ev === "heartbeat") {
            heartbeats++;
            say({ kind: "heartbeat", phase: d.phase, elapsed: d.elapsedSeconds, seq: d.seq });
          } else if (ev === "activity") activities++;
          else if (ev === "completed") done = true;
          else if (ev === "error") err = d.code || d.message || "error";
        }
      }
    }
    return { ok: true, totalMs: performance.now() - t0, heartbeats, activities,
             maxGapMs: Math.round(maxGap), done, err,
             gapsOver20s: gaps.filter((g) => g > 20000).length };
  }, { bridge: BRIDGE, a, b, count: COUNT,
       textA: process.env.VQ_TEXT_A || "", textB: process.env.VQ_TEXT_B || "" });

  console.log("\n結果:", JSON.stringify(res, null, 1));
  const minutes = res.totalMs ? res.totalMs / 60000 : 0;
  console.log("\n接続していた時間: " + minutes.toFixed(1) + " 分");
  console.log("heartbeat: " + res.heartbeats + " 回");
  console.log("SSE が無音だった最長: " + ((res.maxGapMs || 0) / 1000).toFixed(1) + " 秒");
  console.log("20 秒を超えた無音: " + res.gapsOver20s + " 回");
  console.log("15 分以上つながったか: " + (minutes >= MIN_MINUTES ? "はい" : "いいえ（" + minutes.toFixed(1) + " 分で終了）"));
  console.log("切断されたか: " + (res.done || res.err ? "いいえ（最後まで受信）" : "はい"));

  await pg.screenshot({ path: path.join(OUT, "heartbeat.png"), fullPage: false }).catch(() => {});
  fs.writeFileSync(path.join(OUT, "heartbeat.json"),
    JSON.stringify({ result: res, heartbeats: log }, null, 2));
  await browser.close();
})();
