/* ══════════════════════════════════════════════════════════════════════════
   vqboot.cjs — 起動してから 使えるようになるまで、**画面に何が出ているか**を
                時間を追って記録する。「変な画面」の正体を 目で確かめるため。

   使い方:
     node vqboot.cjs              … 今の client/ を見る
     node vqboot.cjs --old        … 切り出す前（控え）を見る
     VQ_CPU=4 VQ_NET=1 node vqboot.cjs   … CPU 4 倍遅く・回線を絞る
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 旧を見る = process.argv.includes("--old");
const 控え = require("path").join(__dirname, "_fixtures", "idx.before-split.html");
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8973);
const CPU = Number(process.env.VQ_CPU || 4);
const 絞る = process.env.VQ_NET !== "0";
const 撮る = process.env.VQ_SHOT === "1";
const 出力 = require("path").join(__dirname, "_fixtures", "boot");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = 旧を見る ? "__OLD__" : "/index.html";
      if (p === "__OLD__") { rq.writeHead(200, { "Content-Type": MIME[".html"] }); fs.createReadStream(控え).pipe(rq); return; }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

const 覗く = () => {
  const el = (id) => document.getElementById(id);
  const 見え = (e) => {
    if (!e) return null;
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    const v = s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.01 && r.width > 1 && r.height > 1;
    return { 出: v, w: Math.round(r.width), h: Math.round(r.height), op: Number(s.opacity).toFixed(2), disp: s.display, vis: s.visibility };
  };
  /* 画面の真ん中の 9 点で いちばん上にある要素を拾う → 「利用者に見えているもの」 */
  const 点 = [];
  for (const x of [0.2, 0.5, 0.8]) for (const y of [0.25, 0.5, 0.75]) {
    const e = document.elementFromPoint(innerWidth * x, innerHeight * y);
    点.push(e ? (e.id ? "#" + e.id : (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : e.tagName.toLowerCase())) : "-");
  }
  /* 実際に見えている文字（利用者が読めるもの） */
  let 文字 = "";
  try {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n, out = [];
    while ((n = w.nextNode()) && out.join("").length < 200) {
      const t = String(n.nodeValue || "").trim(); if (!t) continue;
      const p = n.parentElement; if (!p) continue;
      const r = p.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const s = getComputedStyle(p); if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < .05) continue;
      out.push(t);
    }
    文字 = out.join(" / ").slice(0, 150);
  } catch (e) { 文字 = "?" + e.message; }
  return {
    地: getComputedStyle(document.body).backgroundColor,
    body類: document.body.className,
    html類: document.documentElement.className,
    splash: 見え(el("authBootSplash")), pin: 見え(el("vqPin")),
    gate: 見え(el("authGate")), first: 見え(el("firstLaunchOverlay")),
    newauth: 見え(el("vqNewAuth")),
    上: [...new Set(点)].join(","),
    文字
  };
};

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  if (絞る) await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 70, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8
  });
  if (撮る) fs.mkdirSync(出力, { recursive: true });

  console.log(`■ ${旧を見る ? "旧（全部インライン）" : "新（外へ切り出し）"} / CPU ${CPU}倍遅く / 回線 ${絞る ? "4Mbps・70ms" : "そのまま"}`);
  const t0 = Date.now();
  page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 120000 }).catch(() => {});
  const 行 = [];
  for (let i = 0; i < 40; i++) {
    const t = Date.now() - t0;
    let d = null;
    try { d = await page.evaluate(覗く); } catch (e) { d = null; }
    if (d) {
      const f = (x) => x && x.出 ? `${x.w}x${x.h}` : (x ? "－" : "無");
      行.push({ t, ...d });
      console.log(
        String((t / 1000).toFixed(1)).padStart(5) + "s  地" + String(d.地).replace("rgb", "").padEnd(16) +
        " splash:" + f(d.splash).padEnd(9) + " pin:" + f(d.pin).padEnd(9) +
        " gate:" + f(d.gate).padEnd(9) + " newauth:" + f(d.newauth).padEnd(9) +
        "\n         上=" + d.上.slice(0, 70) + "\n         字=" + (d.文字 || "（何も読めない）"));
      if (撮る) await page.screenshot({ path: path.join(出力, `${旧を見る ? "old" : "new"}-${String(t).padStart(6, "0")}.png`) });
    }
    await page.waitForTimeout(500);
  }
  await b.close(); srv.close();
})();
