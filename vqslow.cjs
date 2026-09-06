/* ══════════════════════════════════════════════════════════════════════════
   vqslow.cjs — **利用者の実際の回線**で、切り出し前 / 今 を 突き合わせる。

   利用者の実測（2026-08-18）: 網から 3.16MB を取るのに 初描画まで 21,064ms
   ＝ おおよそ 1.2Mbps。ここまでの計測は 12Mbps でやっていたので
   「帯域は足りている」前提だった。細い回線では 話がまるで違う。

   使い方: node vqslow.cjs [--mbps 1.2] [--cpu 4]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");
const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MBPS = 引("--mbps", 1.2), CPU = 引("--cpu", 4);
const ROOT = path.join(__dirname, "client");
const 控え = require("path").join(__dirname, "_fixtures", "idx.before-split.html");
const PORT = Number(process.env.VQ_PORT || 8987);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const 圧控 = new Map();
let 旧を出す = false;
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      let f = path.join(ROOT, p);
      if (p === "/index.html" && 旧を出す) f = 控え;
      if (!f.startsWith(ROOT) && f !== 控え) { rq.writeHead(404); rq.end("x"); return; }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      const 種 = MIME[path.extname(f)] || "application/octet-stream";
      const 生 = fs.readFileSync(f);
      const h = { "Content-Type": 種, "Cache-Control": "no-store" };
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("br")) {
        const k = f + (旧を出す && p === "/index.html" ? ":old" : "");
        let z = 圧控.get(k);
        if (!z) { z = zlib.brotliCompressSync(生, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }); 圧控.set(k, z); }
        h["Content-Encoding"] = "br"; h["Content-Length"] = z.length; rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}
const 見張り = () => {
  window.__S = {};
  const S = window.__S;
  const 見る = () => {
    const b = document.body;
    if (!b) { requestAnimationFrame(見る); return; }
    if (!b.classList.contains("auth-booting")) { S.起動終 = performance.now(); return; }
    const mo = new MutationObserver(() => {
      if (!document.body.classList.contains("auth-booting")) { S.起動終 = performance.now(); mo.disconnect(); }
    });
    mo.observe(b, { attributes: true, attributeFilter: ["class"] });
  };
  見る();
};
async function 計る(b, ラベル) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(見張り);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120,
    downloadThroughput: MBPS * 1024 * 1024 / 8, uploadThroughput: 0.5 * 1024 * 1024 / 8 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 300000 });
  await page.waitForFunction(() => window.__S && window.__S.起動終, null, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const d = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] || {};
    const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
    let 網 = 0, 件 = 0;
    for (const e of performance.getEntriesByType("resource")) { 網 += e.transferSize || 0; 件++; }
    return { 描画: Math.round(fp ? fp.startTime : 0), 起動終: Math.round(window.__S.起動終 || 0),
             網: 網 + (n.transferSize || 0), 件: 件 + 1 };
  });
  await ctx.close();
  console.log(`  ${ラベル.padEnd(22)} 初描画 ${String(d.描画).padStart(6)}ms   使えるまで ${String(d.起動終).padStart(6)}ms   網から ${(d.網 / 1048576).toFixed(2)}MB / ${d.件} 件`);
  return d;
}
(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  console.log(`■ 回線 ${MBPS}Mbps・往復 240ms / CPU ${CPU} 倍遅く / brotli / 溜め無し（＝初回）\n`);
  try {
    旧を出す = true;  const A = await 計る(b, "今朝まで（13MB 1枚）");
    旧を出す = false; const B = await 計る(b, "いま（切り出し＋後回し）");
    console.log("\n  ──────────────────────────────────────────────");
    console.log(`  初描画:     ${A.描画}ms → ${B.描画}ms`);
    console.log(`  使えるまで: ${A.起動終}ms → ${B.起動終}ms`);
    console.log(`  網から:     ${(A.網 / 1048576).toFixed(2)}MB → ${(B.網 / 1048576).toFixed(2)}MB`);
    console.log("  ──────────────────────────────────────────────");
  } finally { await b.close(); srv.close(); }
})();
