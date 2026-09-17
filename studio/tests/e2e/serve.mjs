/* 小さな静的配信（試験用）。repo のルートをそのまま配る。 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const ROOT = new URL("../../../", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4"
};

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
      const s = await stat(file);
      if (s.isDirectory()) { res.writeHead(404); res.end("dir"); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Cross-Origin-Opener-Policy": "same-origin"
      });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found: " + req.url);
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

if (process.argv[1] && process.argv[1].endsWith("serve.mjs")) {
  const { port } = await serve(Number(process.env.PORT || 8123));
  console.log("http://127.0.0.1:" + port + "/studio/");
}
