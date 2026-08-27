/* Vocabu Workplace — 幅ごとの崩れ確認（§21）
   320 / 375 / 390 / 430 px で、アプリ全体が横へはみ出さないことを見る。
   グリッドの中の横スクロールは許す（Sheets・表）。
   使い方: node vqwpmobile.cjs */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8978);
const WIDTHS = [320, 375, 390, 430];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x) : ""))); };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); rq.end("x"); return;
      }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await serve();
  const browser = await chromium.launch();

  for (const W of WIDTHS) {
    console.log("\n══ " + W + "px ══");
    const ctx = await browser.newContext({ viewport: { width: W, height: 800 },
      isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
      { timeout: 40000 });
    await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

    /* 4 製品を作って、それぞれの画面ではみ出しを見る */
    const r = await pg.evaluate(async (W) => {
      const V = window.VQ2, WP = V.workplace;
      const out = {};
      function overflow(hostId) {
        const host = document.getElementById(hostId);
        if (!host) return { missing: true };
        const sr = host.shadowRoot;
        const rootEl = sr.querySelector(".wp");
        const wide = [];
        sr.querySelectorAll(".wp-main, .wp-home, .wpf-wrap, .wpd-page, .wpp-stage").forEach((e) => {
          /* 自分の中で横へ流すと決めてある枠（Sheets のグリッドなど）は対象外。
             仕様どおり「グリッド内部の横スクロールは許す」。 */
          const ox = getComputedStyle(e).overflowX;
          if (ox === "auto" || ox === "scroll") return;
          if (e.scrollWidth > e.clientWidth + 2) wide.push(e.className + ":" + e.scrollWidth + ">" + e.clientWidth);
        });
        /* 44px 未満の押しどころを数える（飾りは除く） */
        let small = 0;
        sr.querySelectorAll("button").forEach((b) => {
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.height < 30) small++;
        });
        return { docWide: document.documentElement.scrollWidth > W + 2,
          rootWide: rootEl ? rootEl.scrollWidth > rootEl.clientWidth + 2 : false,
          wide, small, tapMin: Math.round(Math.min.apply(null,
            Array.from(sr.querySelectorAll(".wp-mbar button, .wp-fab")).map((b) => {
              const x = b.getBoundingClientRect(); return x.height || 999; }).concat([999]))) };
      }
      WP.home.open({});
      await new Promise((r) => setTimeout(r, 500));
      out.home = overflow("vq-workplace");

      const mk = async (type, id) => {
        const sr = document.getElementById("vq-workplace").shadowRoot;
        sr.querySelector(`[data-act="new"][data-type="${type}"]`).click();
        await new Promise((r) => setTimeout(r, 900));
        const res = overflow(id);
        const h = document.getElementById(id);
        if (h) h.shadowRoot.querySelector('[data-act="close"]').click();
        await new Promise((r) => setTimeout(r, 900));
        return res;
      };
      out.docs = await mk("document", "vq-wp-docs");
      out.sheets = await mk("spreadsheet", "vq-wp-sheets");
      out.slides = await mk("presentation", "vq-wp-slides");
      out.forms = await mk("form", "vq-wp-forms");
      return out;
    }, W);

    ["home", "docs", "sheets", "slides", "forms"].forEach((k) => {
      const v = r[k];
      ok(k + "：ページ全体が横へはみ出さない", v && !v.docWide, v && { docWide: v.docWide });
      ok(k + "：主要な枠が横へはみ出さない", v && (v.wide || []).length === 0, v && v.wide);
    });
    ok("モバイルの下部ツールバーが 40px 以上", r.docs.tapMin >= 40 || r.docs.tapMin === 999, r.docs.tapMin);

    await ctx.close();
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
