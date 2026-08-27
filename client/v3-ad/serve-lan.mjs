/* v3-ad だけを LAN へ配る小さなサーバ（開発視聴用）。
   広告ページ以外は配らない。Ollama / Bridge には触れない。 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = join(fileURLToPath(import.meta.url), "..");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8" };
createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const target = normalize(join(HERE, p));
  if (!target.startsWith(HERE)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": MIME[extname(target)] || "application/octet-stream",
                         "Cache-Control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(8799, "0.0.0.0", () => console.log("v3-ad LAN server on :8799"));
