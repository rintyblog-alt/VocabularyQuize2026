/* ══════════════════════════════════════════════════════════════════════════
   vqperf.cjs — 「開いてから 使えるようになるまで」を 計る。

   本番と同じ条件に寄せる:
     ・gzip で配る（本番は Cloudflare が圧縮する。無圧縮で計ると 回線ばかり見て
       中身の重さが 見えない）
     ・指紋つきのファイルは immutable、index.html は no-store
       （本番の Worker と 同じ決まり）

   計るもの:
     ① 旧（全部インライン）・初回
     ② 新（外へ切り出し）・初回
     ③ 新・2 回目（同じブラウザで もう一度 開く）

   「使えるようになった」＝ 起動の 1 枚が消えて、押せるものが 画面に出た時。
   使い方: node vqperf.cjs [--cpu 4] [--mbps 12]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const zlib = require("zlib");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 4);
const MBPS = 引("--mbps", 12);
const ROOT = path.join(__dirname, "client");
const 控え = require("path").join(__dirname, "_fixtures", "idx.before-split.html");
const PORT = Number(process.env.VQ_PORT || 8975);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };

const 圧縮控え = new Map();
function 送る(rq, req, f, 種) {
  const 生 = fs.readFileSync(f);
  const 圧す = /^(text|application\/(javascript|json|manifest))/.test(種) && String(req.headers["accept-encoding"] || "").includes("gzip");
  const h = { "Content-Type": 種 };
  /* 本番の Worker と 同じ決まり */
  const p = req.__path || "";
  if (/^\/(js|css)\/[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(js|css)$/.test(p)) h["Cache-Control"] = "public, max-age=31536000, immutable";
  else if (/\.(html?|js|json|webmanifest)$/i.test(p) || !/\.[a-z0-9]+$/i.test(p)) h["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
  else h["Cache-Control"] = "public, max-age=86400";
  if (!圧す) { h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生); return 生.length; }
  let z = 圧縮控え.get(f);
  if (!z) { z = zlib.gzipSync(生, { level: 6 }); 圧縮控え.set(f, z); }
  h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; h["Vary"] = "Accept-Encoding";
  rq.writeHead(200, h); rq.end(z); return z.length;
}

let 旧を出す = false;
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      req.__path = p;
      if (p === "/") {
        if (旧を出す) { req.__path = "/index.html"; return void 送る(rq, req, 控え, MIME[".html"]); }
        p = "/index.html"; req.__path = p;
      }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      送る(rq, req, f, MIME[path.extname(f)] || "application/octet-stream");
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

/* 「使えるようになった」判定
   ・起動の 1 枚（#authBootSplash）が **一度出てから 消えた**こと
   ・押せるものが 3 つ以上 画面に出ていること
   両方そろって はじめて「使える」。片方だけだと、まだ何も無い時点で
   通ってしまう（実際に 1077ms という嘘の値が出た）。 */
const 起動の枚が出たか = () => {
  const e = document.getElementById("authBootSplash");
  if (!e) return false;
  const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return s.display !== "none" && s.visibility !== "hidden" && r.height > 40;
};
/* 「使えるようになった」＝ アプリ自身が 起動の 1 枚を しまった時。
   ボタンの数を数える方法は 使えない。この画面は 中身が 最初から HTML に
   全部書いてあるので、起動の 1 枚の 裏に ボタンが 山ほどある。
   当たり判定で数える案も、13MB の DOM では 1 回の判定が重すぎて
   計測そのものが 止まった（実測）。アプリが自分で出す合図を 使う。 */
const 使えるか = () => {
  const e = document.getElementById("authBootSplash");
  if (!e) return 0;
  if (e.classList.contains("hidden")) return 1;
  const s = getComputedStyle(e);
  return s.display === "none" ? 1 : 0;
};
/* ブラウザ自身の計測から 実際の受け取り量を読む。
   transferSize が 0 ＝ 溜めてあったものを使った（網へ出ていない）。 */
const 受け取り = () => {
  const es = performance.getEntriesByType("resource");
  let 網 = 0, 溜 = 0, 展開 = 0, 溜件 = 0;
  for (const e of es) {
    展開 += e.decodedBodySize || 0;
    if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) { 溜 += e.decodedBodySize; 溜件++; }
    else 網 += e.transferSize || 0;
  }
  const n = performance.getEntriesByType("navigation")[0];
  return { 網: 網 + (n ? n.transferSize || 0 : 0), 溜, 展開: 展開 + (n ? n.decodedBodySize || 0 : 0), 件: es.length, 溜件 };
};

async function 計る(b, url, ラベル, 二回目) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 70, downloadThroughput: MBPS * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8
  });
  const 回 = [];
  for (const 何回 of (二回目 ? [1, 2] : [1])) {
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "commit", timeout: 180000 });
    let 出た = 0, 使え = 0;
    for (let i = 0; i < 900; i++) {
      if (!出た && await page.evaluate(起動の枚が出たか).catch(() => false)) 出た = Date.now() - t0;
      if (出た) { const v = await page.evaluate(使えるか).catch(() => 0); if (v) { 使え = Date.now() - t0; break; } }
      await page.waitForTimeout(120);
    }
    const 量 = await page.evaluate(受け取り).catch(() => ({ 網: 0, 溜: 0, 展開: 0, 件: 0, 溜件: 0 }));
    const 節目 = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] || {};
      const fp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
      return { 描画: Math.round(fp ? fp.startTime : 0), DCL: Math.round(n.domContentLoadedEventEnd || 0), 読了: Math.round(n.loadEventEnd || 0) };
    }).catch(() => ({ 描画: 0, DCL: 0, 読了: 0 }));
    if (何回 === 2 && process.argv.includes("--内訳")) {
      const 内 = await page.evaluate(() => performance.getEntriesByType("resource")
        .filter((e) => (e.transferSize || 0) > 20000)
        .sort((a, b) => b.transferSize - a.transferSize).slice(0, 12)
        .map((e) => [Math.round(e.transferSize / 1024), e.name.replace(location.origin, "")]));
      console.log("    ↳ 2回目に網から来たもの:"); 内.forEach(([k, n]) => console.log("       " + String(k).padStart(6) + "KB  " + n));
    }
    回.push({ 何回, 出た, 使え, ...量, ...節目 });
  }
  await ctx.close();
  for (const r of 回) {
    console.log(`  ${ラベル}${回.length > 1 ? `（${r.何回}回目）` : ""}`.padEnd(28) +
      ` 初描画 ${String(r.描画).padStart(5)}ms  起動の1枚 ${String(r.出た).padStart(5)}ms  DCL ${String(r.DCL).padStart(6)}ms  使えるまで ${String(r.使え).padStart(6)}ms` +
      `  網から ${(r.網 / 1024 / 1024).toFixed(2)}MB  溜め ${(r.溜 / 1024 / 1024).toFixed(2)}MB(${r.溜件}件)`);
  }
  return 回;
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  console.log(`■ CPU ${CPU}倍遅く / 回線 ${MBPS}Mbps・70ms / gzip あり / 指紋つきは immutable\n`);
  try {
    旧を出す = true;
    const A = await 計る(b, `http://127.0.0.1:${PORT}/`, "旧（全部インライン）");
    旧を出す = false;
    const B = await 計る(b, `http://127.0.0.1:${PORT}/`, "新（外へ切り出し）", true);
    console.log("");
    const a = A[0], b1 = B[0], b2 = B[1];
    console.log("  ──────────────────────────────────────────────────────");
    console.log(`  初回:   ${a.使え}ms → ${b1.使え}ms   （${a.使え - b1.使え >= 0 ? "-" : "+"}${Math.abs(a.使え - b1.使え)}ms）`);
    console.log(`  二回目:  ${a.使え}ms → ${b2.使え}ms   （${a.使え - b2.使え >= 0 ? "-" : "+"}${Math.abs(a.使え - b2.使え)}ms）`);
    console.log(`  網から取った量（2回目）: ${(a.網 / 1024 / 1024).toFixed(2)}MB → ${(b2.網 / 1024 / 1024).toFixed(2)}MB`);
    console.log("  ──────────────────────────────────────────────────────");
  } finally { await b.close(); srv.close(); }
})();
