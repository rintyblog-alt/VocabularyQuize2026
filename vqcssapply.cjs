/* 描画を止めない形にした CSS が、**Chromium でも WebKit(Safari) でも**
   ちゃんと当たるかを見る。当たらないと 画面が 素のまま出る。 */
const pw = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8991);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("    ✅ " + n); } else { fail++; console.log("    ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")); } };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}
(async () => {
  const srv = await serve();
  for (const 名 of ["chromium", "webkit"]) {
    const b = await pw[名].launch();
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    console.log("\n  ■ " + 名);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(6000);
    const d = await page.evaluate(() => {
      const 一覧 = Array.from(document.querySelectorAll('link[rel="stylesheet"][href^="/css/"]'))
        .map((l) => ({ id: l.id || "(無名)", media: l.media, 効いてる: l.sheet ? l.sheet.cssRules.length : -1 }));
      let 当 = 0; for (const ss of Array.from(document.styleSheets)) { try { 当 += ss.cssRules.length; } catch (e) {} }
      const b2 = getComputedStyle(document.body);
      return { 一覧, 当, 地: b2.backgroundColor, 字: b2.color, 書体: b2.fontFamily.slice(0, 30) };
    });
    const 止まったまま = d.一覧.filter((x) => x.media === "print");
    ok(`CSS が 全部 all に戻っている（print のまま: ${止まったまま.length} 枚）`, 止まったまま.length === 0, 止まったまま);
    ok(`当たっている規則が 9000 以上（${d.当}）`, d.当 > 9000, d.当);
    ok(`body に 地色が付いている（${d.地}）`, d.地 !== "rgba(0, 0, 0, 0)" && d.地 !== "", d.地);
    await b.close();
  }
  srv.close();
  console.log("\n" + "═".repeat(50));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  console.log("═".repeat(50));
  process.exit(fail ? 1 : 0);
})();
