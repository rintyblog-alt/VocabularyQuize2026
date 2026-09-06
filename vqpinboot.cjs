/* ══════════════════════════════════════════════════════════════════════════
   vqpinboot.cjs — 「ログインしたら 変な画面で止まる」を そのまま再現する。

   利用者の訴え（2026-08-18）:
     ・起動して ログインしたら **ここから動かない**（暗い画面に 角の丸い箱）
     ・なんだこの変な画面は / なんか変な黒い画面が表示

   ここでは 実際の口を借りずに、サーバの返事だけ作って 同じ道を通す:
     /api/auth/me         … ログイン済みの人
     /api/auth/pin/status … 暗証番号あり・まだ通っていない
   これで 起動 → 暗証番号の板、という 利用者と同じ経路になる。

   使い方: node vqpinboot.cjs [--cpu 4] [--撮る]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 4);
const 撮る = process.argv.includes("--撮る");
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8979);
const 出力 = require("path").join(__dirname, "_fixtures", "pinboot");
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
      if (/^\/(js|css)\/[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(js|css)$/.test(p)) h["Cache-Control"] = "public, max-age=31536000, immutable";
      else h["Cache-Control"] = "no-store";
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("gzip")) {
        let z = 圧控.get(p); if (!z) { z = zlib.gzipSync(生, { level: 6 }); 圧控.set(p, z); }
        h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

const 覗く = () => {
  const 見 = (e) => {
    if (!e) return null;
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return { 出: s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > .05 && r.width > 1 && r.height > 1,
             w: Math.round(r.width), h: Math.round(r.height), op: Number(s.opacity).toFixed(2) };
  };
  const 点 = [];
  for (const x of [0.5]) for (const y of [0.2, 0.5, 0.8]) {
    let e = document.elementFromPoint(innerWidth * x, innerHeight * y);
    for (let i = 0; i < 3 && e && e.shadowRoot; i++) { const u = e.shadowRoot.elementFromPoint(innerWidth * x, innerHeight * y); if (!u || u === e) break; e = u; }
    点.push(e ? (e.id ? "#" + e.id : (typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : e.tagName.toLowerCase())) : "-");
  }
  const pin = document.getElementById("vqPin");
  let 板 = null;
  if (pin && pin.shadowRoot) {
    const w = pin.shadowRoot.querySelector("div");
    if (w) { const r = w.getBoundingClientRect(); 板 = { w: Math.round(r.width), h: Math.round(r.height), 字: (w.textContent || "").trim().slice(0, 40) }; }
  }
  const A = (window.__vqAppData && window.__vqAppData.authState) || null;
  return { 認証: (function(){ try { return (localStorage.getItem("app.auth.mode.v1")||"?") + "/" + (window.__vqAppData ? "data" : "-"); } catch(e){ return "?"; } })(),
           地: getComputedStyle(document.documentElement).backgroundColor + " / " + getComputedStyle(document.body).backgroundColor,
           body類: document.body.className.slice(0, 60),
           splash: 見(document.getElementById("authBootSplash")), pin: 見(pin), 板,
           上: [...new Set(点)].join(",") };
};

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  /* サーバの返事を作る（本物へは 一切 行かない） */
  /* ★ Playwright は **あとから登録した route が先に効く**。
     包括のものを先に登録し、細かいものを あとに登録すること。
     逆にすると 包括のほうが /api/auth/me を横取りして、
     いつまでもログインできない（実際に そうなった）。 */
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u-test", nickname: "テスト", plan: "free", email: "t@example.com" } }) }));
  await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ hasPin: true, pinVerified: false, needsPin: false, needsEmail: false, needsConsent: false }) }));
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("app.auth.token.v1", "test-token");
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
    } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on("request", (r) => { if (/\/api\//.test(r.url())) console.log("    → " + r.method() + " " + r.url().replace(/^https?:\/\/[^/]+/, "")); });
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70,
    downloadThroughput: 12 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
  if (撮る) { fs.rmSync(出力, { recursive: true, force: true }); fs.mkdirSync(出力, { recursive: true }); }

  console.log(`■ ログイン済み＋暗証番号あり で起動 / CPU ${CPU}倍遅く\n`);
  const t0 = Date.now();
  page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 120000 }).catch(() => {});
  for (let i = 0; i < 26; i++) {
    const t = Date.now() - t0;
    const d = await page.evaluate(覗く).catch(() => null);
    if (d) {
      const f = (x) => x ? (x.出 ? `${x.w}x${x.h}(${x.op})` : "－") : "無";
      console.log(String((t / 1000).toFixed(1)).padStart(5) + "s  地=" + d.地.replace(/rgba?/g, "").padEnd(26) +
        " splash:" + f(d.splash).padEnd(15) + " pin:" + f(d.pin).padEnd(15) +
        " 板:" + (d.板 ? `${d.板.w}x${d.板.h}「${d.板.字}」` : "無"));
      console.log("         上=" + d.上);
      if (撮る) await page.screenshot({ path: path.join(出力, `p-${String(t).padStart(6, "0")}.png`) });
    }
    await page.waitForTimeout(撮る ? 200 : 450);
  }
  await b.close(); srv.close();
})();
