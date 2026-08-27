/* ══════════════════════════════════════════════════════════════════════════
   vqbootlook.cjs — **読み込みの最中**に 起動の 1 枚が ちゃんと出ているかを見る。

   本体の CSS を「描画を止めない」形にしたので、危ないのは 完成後ではなく
   **途中**。CSS が届く前の一瞬に、素のままの画面が 見えてしまわないか。

   見ること:
     ① 最初の描画の時点で、起動の 1 枚が 画面いっぱいに 出ている
     ② その 1 枚が 白紙ではない（決めた地色になっている）
     ③ 1 枚の裏の中身（.app）が 見えていない
     ④ 出来上がりの見た目は 従来と同じ（vqsplit が別に見る）
   使い方: node vqbootlook.cjs [--mbps 1.2]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");
const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MBPS = 引("--mbps", 1.2), CPU = 引("--cpu", 4);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8989);
const 出力 = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/bootlook";
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); } };
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
      const h = { "Content-Type": 種, "Cache-Control": "no-store" };
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("br")) {
        let z = 圧控.get(p);
        if (!z) { z = zlib.brotliCompressSync(生, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }); 圧控.set(p, z); }
        h["Content-Encoding"] = "br"; h["Content-Length"] = z.length; rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}
(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  fs.rmSync(出力, { recursive: true, force: true }); fs.mkdirSync(出力, { recursive: true });
  try {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120,
      downloadThroughput: MBPS * 1024 * 1024 / 8, uploadThroughput: 0.5 * 1024 * 1024 / 8 });
    console.log(`■ 回線 ${MBPS}Mbps / CPU ${CPU} 倍遅く\n`);
    const t0 = Date.now();
    page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 300000 }).catch(() => {});
    /* 最初に何かが描かれた瞬間を掴む */
    await page.waitForFunction(() => performance.getEntriesByType("paint").some((x) => x.name === "first-contentful-paint"),
      null, { timeout: 300000 }).catch(() => {});
    const 描画 = Date.now() - t0;
    const d = await page.evaluate(() => {
      const sp = document.getElementById("authBootSplash");
      const r = sp ? sp.getBoundingClientRect() : null;
      const cs = sp ? getComputedStyle(sp) : null;
      const app = document.querySelector(".app");
      const ar = app ? app.getBoundingClientRect() : null;
      const acs = app ? getComputedStyle(app) : null;
      /* CSS が いくつ 当たっているか（届いていない link は 数えない） */
      let 当 = 0;
      for (const ss of Array.from(document.styleSheets)) { try { 当 += ss.cssRules.length; } catch (e) {} }
      return {
        枚: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        地: cs ? cs.backgroundImage.slice(0, 60) : "", 表示: cs ? cs.display : "",
        中身見えてる: !!(app && acs.display !== "none" && ar.height > 10),
        規則: 当, 描画済: performance.getEntriesByType("paint").map((x) => Math.round(x.startTime))
      };
    });
    /* 書体の到着を待たせない（待つと 30 秒で 打ち切られる） */
    await page.screenshot({ path: path.join(出力, "1-最初の描画.png"), timeout: 8000, animations: "disabled" }).catch(() => console.log("  （画は撮れず・先へ進む）"));
    console.log(`  最初の描画: ${描画}ms（この時点で 当たっている CSS 規則 ${d.規則}）`);
    ok("最初の描画の時点で 起動の 1 枚が 画面いっぱいに出ている",
       !!(d.枚 && d.枚.w >= 420 && d.枚.h >= 900) && d.表示 === "flex", d);
    ok("その 1 枚に 地色が付いている（白紙でない）", /gradient/.test(d.地), d.地);
    ok("裏の中身（.app）は 見えていない", d.中身見えてる === false, d.中身見えてる);

    /* 出来上がりまで待って もう一枚 */
    await page.waitForFunction(() => {
      const e = document.getElementById("authBootSplash");
      return e && (e.classList.contains("hidden") || getComputedStyle(e).display === "none");
    }, null, { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const 使え = Date.now() - t0;
    await page.screenshot({ path: path.join(出力, "2-使えるようになった.png"), timeout: 15000, animations: "disabled" }).catch(() => console.log("  （画は撮れず）"));
    const e2 = await page.evaluate(() => {
      let 当 = 0; for (const ss of Array.from(document.styleSheets)) { try { 当 += ss.cssRules.length; } catch (e) {} }
      const b2 = getComputedStyle(document.body);
      return { 規則: 当, 地: b2.backgroundColor, 字: b2.color };
    });
    console.log(`  使えるまで: ${使え}ms（CSS 規則 ${e2.規則} / 地 ${e2.地}）`);
    ok("出来上がりでは CSS が 全部 当たっている（9000 規則以上）", e2.規則 > 9000, e2.規則);
    console.log("\n  画: " + 出力);
  } finally { await b.close(); srv.close(); }
  console.log("\n" + "═".repeat(56));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(56));
  process.exit(fail ? 1 : 0);
})();
