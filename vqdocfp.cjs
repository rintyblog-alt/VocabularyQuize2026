/* ══════════════════════════════════════════════════════════════════════
   資料の「同じものかどうか」の見分け方の確認（実ブラウザ・偽の Bridge）

   これまで同じ資料かどうかは **添付 ID** で見ていた。
   ID は付け直すたびに変わるので、同じ PDF を選び直しただけで
   全ページを読み直していた。しかも画面には
   「読み取り済みの資料をそのまま使いました」と出るため、
   表示と実際の動きが食い違っていた。

   ここでは中身から作った札（docFingerprint）で見分けられることを確かめる。
   Bridge は使わない（偽の接続部品を差し込んで、送られた依頼を覗く）。

   使い方: node vqdocfp.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8961);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

function serve() {
  return new Promise((res) => {
    const s = http.createServer((rq, rs) => {
      let p = decodeURIComponent(String(rq.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("x"); return; }
      rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rs);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.ai, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  /* 偽の接続部品。送られてきた依頼を控え、読み取り結果を 1 回返す。 */
  await pg.evaluate(() => {
    window.__vqSent = [];
    window.__vqLocalAI = {
      isAvailable: () => Promise.resolve({ ok: true, engine: "fake" }),
      isPaired: () => true,
      cancelGeneration: () => {},
      streamMessage: (req, on) => {
        window.__vqSent.push({
          sentDigest: (req.options && req.options.sourceDigest) || null,
          attachments: (req.attachments || []).map((a) => a.id)
        });
        on("meta", { jobId: "fake-" + window.__vqSent.length });
        /* 1 回目だけ、読み取り結果を返す（サーバは送り返した回には返さない） */
        if (!(req.options && req.options.sourceDigest)) {
          on("source_digest", { text: "【資料の要点】これは読み取り結果です。", files: [{ id: "x", name: "a.pdf" }] });
        }
        on("completed", { text: "ok" });
        return Promise.resolve({ text: "ok", structured: null, usage: null, warnings: [] });
      }
    };
  });

  const runOnce = (attachId, fp) => pg.evaluate(([id, f]) => {
    return window.VQ2.ai.run({
      task: "explanation", message: "テスト", track: false,
      attachments: [{ id: id, name: "a.pdf", kind: "document", pageCount: 3 }],
      includedAttachmentIds: [id],
      docFingerprint: f || undefined
    }).then(() => window.__vqSent[window.__vqSent.length - 1]);
  }, [attachId, fp || null]);

  section("札があるとき：同じ資料なら、添付 ID が変わっても読み直さない");
  const r1 = await runOnce("att-AAA", "d1:abc@v1+o1/docmemo-v1");
  ok("1 回目は読み取り結果を送らない（まだ無い）", r1.sentDigest === null, r1);
  const r2 = await runOnce("att-BBB", "d1:abc@v1+o1/docmemo-v1");
  ok("★添付 ID が変わっても、同じ札なら読み取り済みを送る",
    typeof r2.sentDigest === "string" && r2.sentDigest.indexOf("資料の要点") >= 0, r2);

  section("札があるとき：別の資料なら読み直す");
  const r3 = await runOnce("att-BBB", "d1:zzz@v1+o1/docmemo-v1");
  ok("★札が違えば読み直す（前の読み取りを流用しない）", r3.sentDigest === null, r3);

  section("読み取りの版が上がったら流用しない");
  const r4 = await runOnce("att-AAA", "d1:abc@v2+o1/docmemo-v1");
  ok("★版が違えば読み直す", r4.sentDigest === null, r4);

  section("札が無いとき：今までどおりの動き（後方互換）");
  await pg.evaluate(() => { window.VQ2.ai.forgetSourceDigest(); window.__vqSent = []; });
  const b1 = await runOnce("att-CCC", null);
  ok("1 回目は送らない", b1.sentDigest === null, b1);
  const b2 = await runOnce("att-CCC", null);
  ok("同じ添付 ID なら流用する", typeof b2.sentDigest === "string", b2);
  const b3 = await runOnce("att-DDD", null);
  ok("添付 ID が変われば読み直す（従来どおり）", b3.sentDigest === null, b3);

  section("壊れた読み取り結果を送りつけない");
  const weird = await pg.evaluate(() => {
    window.__vqSent = [];
    return window.VQ2.ai.run({
      task: "explanation", message: "テスト", track: false,
      attachments: [{ id: "att-EEE", name: "a.pdf" }],
      sourceDigest: { nothing: 1 }          /* text を持たないオブジェクト */
    }).then(() => window.__vqSent[0]);
  });
  ok("★text を持たないものは資料の要点として送らない", weird.sentDigest === null, weird);

  ok("画面のエラーが無い", errs.length === 0, errs.slice(0, 3));
  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
