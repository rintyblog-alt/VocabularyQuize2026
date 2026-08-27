/* ══════════════════════════════════════════════════════════════════════════
   vqboot2.cjs — 起動の内訳を **ページの中の時計**で計る。

   外から page.evaluate で覗く計り方は、本体が JS を回している間 返事が
   返らないので、「本体が暇になった時刻」まで足された値になる。
   ここでは 画面の中に見張りを仕込み、起きた瞬間の performance.now() を
   その場で控える。あとから 読み出すだけ。

   A/B: vq2-app を「あとから読む」場合と「その場で読む」場合を 続けて計る。
   使い方: node vqboot2.cjs [--cpu 4] [--mbps 12]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 4), MBPS = 引("--mbps", 12);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8977);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };
const 控え圧 = new Map();
let 差し替え = null;   /* index.html を差し替えて配るとき */

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const 種 = MIME[path.extname(p)] || "application/octet-stream";
      let 生;
      if (p === "/index.html" && 差し替え) 生 = Buffer.from(差し替え, "utf8");
      else {
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
        生 = fs.readFileSync(f);
      }
      const h = { "Content-Type": 種 };
      if (/^\/(js|css)\/[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(js|css)$/.test(p)) h["Cache-Control"] = "public, max-age=31536000, immutable";
      else if (/\.(html?|js|json|webmanifest)$/i.test(p) || !/\.[a-z0-9]+$/i.test(p)) h["Cache-Control"] = "no-store";
      else h["Cache-Control"] = "public, max-age=86400";
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("gzip")) {
        const k = p + (差し替え && p === "/index.html" ? ":alt" : "");
        let z = 控え圧.get(k); if (!z) { z = zlib.gzipSync(生, { level: 6 }); 控え圧.set(k, z); }
        h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; h["Vary"] = "Accept-Encoding";
        rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

/* 画面の中へ 先に仕込む見張り */
const 見張り = () => {
  window.__T = { 開始: performance.now() };
  const T = window.__T;
  const 見る = () => {
    const b = document.body;
    if (!b) { requestAnimationFrame(見る); return; }
    if (!T.body来た) T.body来た = performance.now();
    if (!b.classList.contains("auth-booting")) { T.起動終 = performance.now(); return; }
    const mo = new MutationObserver(() => {
      if (!document.body.classList.contains("auth-booting")) { T.起動終 = performance.now(); mo.disconnect(); }
    });
    mo.observe(b, { attributes: true, attributeFilter: ["class"] });
  };
  見る();
  document.addEventListener("DOMContentLoaded", () => { T.DCL = performance.now(); });
  addEventListener("load", () => { T.読了 = performance.now(); });
  /* vq2-app が 実際に入った時刻 */
  const iv = setInterval(() => {
    if (window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.entry) { T.vq2 = performance.now(); clearInterval(iv); }
  }, 60);
  setTimeout(() => clearInterval(iv), 40000);
};

async function 計る(b, ラベル, 二回) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.addInitScript(見張り);
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70,
    downloadThroughput: MBPS * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
  const 出 = [];
  for (const 回 of (二回 ? [1, 2] : [1])) {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 180000 });
    await page.waitForFunction(() => window.__T && window.__T.起動終 && window.__T.vq2, null, { timeout: 180000 }).catch(() => {});
    const T = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] || {};
      const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
      let 網 = 0, 溜 = 0;
      for (const e of performance.getEntriesByType("resource")) {
        if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) 溜 += e.decodedBodySize; else 網 += e.transferSize || 0;
      }
      return { ...window.__T, 描画: fp ? fp.startTime : 0, nDCL: n.domContentLoadedEventEnd || 0, 網: 網 + (n.transferSize || 0), 溜 };
    });
    const r = (x) => Math.round(x || 0);
    出.push({ 回, ...T });
    console.log(`  ${ラベル}${二回 ? `（${回}回目）` : ""}`.padEnd(30) +
      ` 初描画 ${String(r(T.描画)).padStart(5)}  DCL ${String(r(T.nDCL)).padStart(5)}` +
      `  起動おわり ${String(r(T.起動終)).padStart(5)}  vq2到着 ${String(r(T.vq2)).padStart(5)}` +
      `  網 ${(T.網 / 1048576).toFixed(2)}MB 溜 ${(T.溜 / 1048576).toFixed(2)}MB`);
  }
  await ctx.close();
  return 出;
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const 元 = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  console.log(`■ CPU ${CPU}倍遅く / 回線 ${MBPS}Mbps・70ms / gzip / 指紋つきは immutable\n`);
  try {
    差し替え = null;
    console.log("── A: vq2-app を **あとから** 読む（いまの形）");
    const A = await 計る(b, "あとから", true);

    /* B: その場で読む形に 差し替えて配る（ファイルは触らない） */
    const m = /<script id="vq2-app">[\s\S]*?<\/script>/.exec(元);
    const 道 = /var 道 = "(\/js\/vq2-app\.[0-9a-f]{10}\.js)";/.exec(元);
    if (!m || !道) throw new Error("差し替え箇所が見つかりません");
    差し替え = 元.slice(0, m.index) + `<script id="vq2-app" src="${道[1]}"></script>` + 元.slice(m.index + m[0].length);
    console.log("\n── B: vq2-app を **その場で** 読む（切り出しただけの形）");
    const B = await 計る(b, "その場で", true);

    const r = (x) => Math.round(x || 0);
    console.log("\n  ──────────────────────────────────────────────");
    console.log(`  起動おわり 初回:  あとから ${r(A[0].起動終)}ms / その場で ${r(B[0].起動終)}ms`);
    console.log(`  起動おわり 2回目: あとから ${r(A[1].起動終)}ms / その場で ${r(B[1].起動終)}ms`);
    console.log(`  vq2到着   2回目: あとから ${r(A[1].vq2)}ms / その場で ${r(B[1].vq2)}ms`);
    console.log("  ──────────────────────────────────────────────");
  } finally { await b.close(); srv.close(); }
})();
