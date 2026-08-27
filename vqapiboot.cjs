/* ══════════════════════════════════════════════════════════════════════════
   vqapiboot.cjs — 起動のあいだに **サーバへ何回・何を頼んでいるか**を数える。

   「dev は速いのに 本番は遅い」の切り分け用。
   dev では 未ログイン、本番では ログイン済み。やっている仕事の量が違う。
   ここでは 同じ画面を 未ログイン／ログイン済みの 両方で起動して比べる。

   返事には わざと 実際くらいの間（既定 120ms）を置く。
   0ms にすると 何回叩いても ただになるので、問題が見えない。

   使い方: node vqapiboot.cjs [--遅れ 120]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");
const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const 遅れ = 引("--遅れ", 120), CPU = 引("--cpu", 4);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8983);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };
const 圧控 = new Map();
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      const 種 = MIME[path.extname(f)] || "application/octet-stream";
      const 生 = fs.readFileSync(f);
      const h = { "Content-Type": 種 };
      h["Cache-Control"] = /^\/(js|css)\/[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(js|css)$/.test(p)
        ? "public, max-age=31536000, immutable" : "no-store";
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("gzip")) {
        let z = 圧控.get(p); if (!z) { z = zlib.gzipSync(生, { level: 6 }); 圧控.set(p, z); }
        h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

async function 計る(b, ログイン中) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const 数 = new Map(); let 合計 = 0;
  await ctx.route("**/api/**", async (r) => {
    const u = new URL(r.request().url()).pathname;
    数.set(u, (数.get(u) || 0) + 1); 合計++;
    await new Promise((res) => setTimeout(res, 遅れ));
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  if (ログイン中) {
    await ctx.route("**/api/auth/me*", async (r) => {
      const u = "/api/auth/me"; 数.set(u, (数.get(u) || 0) + 1); 合計++;
      await new Promise((res) => setTimeout(res, 遅れ));
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, user: { id: "u-test", nickname: "テスト", plan: "free", email: "t@example.com" } }) });
    });
    await ctx.route("**/api/auth/pin/status*", async (r) => {
      const u = "/api/auth/pin/status"; 数.set(u, (数.get(u) || 0) + 1); 合計++;
      await new Promise((res) => setTimeout(res, 遅れ));
      r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ hasPin: false, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) });
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.auth.token.v1", "test-token");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
        localStorage.setItem("vq.newauth.introSeen.v1", "1");
      } catch (e) {}
    });
  }
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70,
    downloadThroughput: 12 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
  /* 2 回目（溜めが効いている状態）を測る */
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(4000);
  数.clear(); 合計 = 0;
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 180000 });
  await page.waitForFunction(() => {
    const e = document.getElementById("authBootSplash");
    return e && (e.classList.contains("hidden") || getComputedStyle(e).display === "none");
  }, null, { timeout: 120000 }).catch(() => {});
  const 使え = Date.now() - t0;
  await page.waitForTimeout(6000);
  const 全 = 合計;
  await ctx.close();
  const 並 = [...数.entries()].sort((a, b) => b[1] - a[1]);
  const 重複 = 並.filter(([, n]) => n > 1);
  console.log(`\n■ ${ログイン中 ? "ログイン済み" : "未ログイン"}  使えるまで ${使え}ms  頼んだ回数 ${全} 回（${並.length} 種類）`);
  if (重複.length) {
    const 無駄 = 重複.reduce((a, [, n]) => a + (n - 1), 0);
    console.log(`   うち **同じものを 2 回以上** 頼んだのが ${重複.length} 種類 / 余分に ${無駄} 回`);
    重複.slice(0, 12).forEach(([u, n]) => console.log(`     ${String(n).padStart(3)} 回  ${u}`));
  }
  return { 使え, 全, 種類: 並.length, 無駄: 重複.reduce((a, [, n]) => a + (n - 1), 0) };
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  console.log(`■ CPU ${CPU} 倍遅く / API の返事に ${遅れ}ms の間 / 2 回目（溜めが効いた状態）`);
  try {
    const A = await 計る(b, false);
    const B = await 計る(b, true);
    console.log("\n  ──────────────────────────────────────────────");
    console.log(`  未ログイン   ${A.使え}ms / ${A.全} 回`);
    console.log(`  ログイン済み ${B.使え}ms / ${B.全} 回（余分 ${B.無駄} 回）`);
    console.log(`  差:          ${B.使え - A.使え}ms / ${B.全 - A.全} 回`);
    console.log("  ──────────────────────────────────────────────");
  } finally { await b.close(); srv.close(); }
})();
