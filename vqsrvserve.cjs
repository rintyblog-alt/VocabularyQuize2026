/* ══════════════════════════════════════════════════════════════════════════
   vqsrvserve.cjs — VocabuSurvive の 検査で 共通に 使う 小さな 静的サーバ。
   client/ を そのまま 配る。**本番は 触らない**（ローカルのみ）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "client");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg", ".webp": "image/webp"
};
function serve(port) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404, { "Content-Type": "text/plain" }); rq.end("404 " + p); return;
      }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.on("error", rej);
    s.listen(port, "127.0.0.1", () => res(s));
  });
}
module.exports = { serve, ROOT };
