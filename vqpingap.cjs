/* ══════════════════════════════════════════════════════════════════════════
   vqpingap.cjs — 「ログインしたら 暗い画面のまま止まる」が 直ったかを見る。

   訴え（2026-08-18）:
     ・起動して ログインしたら ここから動かない（角の丸い箱だけの暗い画面）
     ・なんだこの変な画面は / なんか変な黒い画面が表示

   何が起きていたか:
     起動の 1 枚（#authBootSplash）は 認証（/api/auth/me）が済んだ時点で消える。
     暗証番号の確認（/api/auth/pin/status）は **そのあと** 始まっていた。
     ・vq-pin の boot() は DOMContentLoaded 待ち（この画面では 実測 3 秒前後）
     ・さらに そこから 1200ms 待ってから 確認を始めていた
     その間、出すものが決まっていないので **何も無い画面**が出る。

   ここで見ること:
     ① 起動の 1 枚が消えた時に、**暗証番号の板が もう出来上がっている**
     ② 「1 枚が消えている・板も無い」という 間抜けな時間が 1 度も無い
     ③ 直す前の作りに戻すと、その時間が ちゃんと現れる（見張りが効いている）

   使い方: node vqpingap.cjs [--cpu 2]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 2);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8981);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };
const 圧控 = new Map();
let 差し替え = null;

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
      const h = { "Content-Type": 種, "Cache-Control": "no-store" };
      if (/^(text|application\/(javascript|json))/.test(種) && String(req.headers["accept-encoding"] || "").includes("gzip")) {
        const k = p + (差し替え && p === "/index.html" ? ":alt" : "");
        let z = 圧控.get(k); if (!z) { z = zlib.gzipSync(生, { level: 6 }); 圧控.set(k, z); }
        h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; rq.writeHead(200, h); rq.end(z); return;
      }
      h["Content-Length"] = 生.length; rq.writeHead(200, h); rq.end(生);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

/* 画面の中に見張りを仕込み、起きた瞬間の時刻を その場で控える */
const 見張り = () => {
  window.__G = { 空白: [], 開始: performance.now() };
  const G = window.__G;
  const 板出た = () => {
    const p = document.getElementById("vqPin");
    if (!p || !p.shadowRoot) return false;
    if (getComputedStyle(p).display === "none") return false;
    const w = p.shadowRoot.querySelector("div");
    if (!w) return false;
    const r = w.getBoundingClientRect();
    return r.height > 200 && /暗証番号/.test(w.textContent || "");
  };
  const 枚出てる = () => {
    const e = document.getElementById("authBootSplash");
    if (!e) return false;
    const s = getComputedStyle(e);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.5;
  };
  let 前 = null;
  const 見る = () => {
    const t = performance.now();
    const 枚 = 枚出てる(), 板 = 板出た();
    if (枚 && !G.枚初) G.枚初 = t;
    if (板 && !G.板初) G.板初 = t;
    if (!枚 && G.枚初 && !G.枚終) G.枚終 = t;
    /* 「1 枚も無い・板も無い・でも まだ暗証番号を聞く途中」＝ 間抜けな時間 */
    const 空 = !枚 && !板 && !!G.枚終;
    if (空 && !前) G.空白.push({ 始: t });
    if (!空 && 前 && G.空白.length && !G.空白[G.空白.length - 1].終) G.空白[G.空白.length - 1].終 = t;
    前 = 空;
    if (t < 20000) requestAnimationFrame(見る);
  };
  requestAnimationFrame(見る);
};

async function 走らせる(b, ラベル) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u-test", nickname: "テスト", plan: "free", email: "t@example.com" } }) }));
  await ctx.route("**/api/auth/pin/status*", async (r) => {
    /* 実際の回線ぶんの間を置く（ここが 0 だと 問題が見えない） */
    await new Promise((res) => setTimeout(res, 250));
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ hasPin: true, pinVerified: false, needsPin: false, needsEmail: false, needsConsent: false }) });
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("app.auth.token.v1", "test-token");
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
    } catch (e) {}
  });
  await ctx.addInitScript(見張り);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70,
    downloadThroughput: 12 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "commit", timeout: 120000 });
  await page.waitForFunction(() => window.__G && window.__G.板初 && window.__G.枚終, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const G = await page.evaluate(() => window.__G);
  await ctx.close();
  const r = (x) => Math.round(x || 0);
  const 空白 = (G.空白 || []).map((x) => Math.round((x.終 || x.始) - x.始)).filter((x) => x > 60);
  console.log(`  [${ラベル}] 1枚が出た ${r(G.枚初)}ms / 板ができた ${r(G.板初)}ms / 1枚が消えた ${r(G.枚終)}ms` +
              `  間抜けな時間 ${空白.length ? 空白.join("+") + "ms" : "なし"}`);
  return { ...G, 空白ms: 空白.reduce((a, x) => a + x, 0) };
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const 元 = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  try {
    console.log("\n■ ① いまの作り");
    差し替え = null;
    const A = await 走らせる(b, "いま");
    ok("暗証番号の板は 1 枚が消える前に できている", A.板初 && A.枚終 && A.板初 <= A.枚終, { 板: Math.round(A.板初 || 0), 枚終: Math.round(A.枚終 || 0) });
    ok("間抜けな時間（1 枚も板も無い）が 無い", A.空白ms === 0, A.空白ms + "ms");

    console.log("\n■ ② 直す前の作りに戻して、ちゃんと落ちるか見る");
    let 旧 = 元;
    /* 札の仕組みを外す */
    const i = 旧.indexOf('<script id="vq-boothold">');
    const j = 旧.indexOf("</script>", i) + 9;
    if (i < 0) throw new Error("vq-boothold が見つかりません");
    旧 = 旧.slice(0, i) + 旧.slice(j);
    /* vq-pin を DOMContentLoaded 待ち＋1200ms 待ちへ戻す */
    const a1 = 旧.indexOf("  if (doc.body) boot();");
    if (a1 < 0) throw new Error("vq-pin の起動箇所が見つかりません");
    const a2 = 旧.indexOf("})(window);", a1);
    旧 = 旧.slice(0, a1) + '  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);\n  else boot();\n' + 旧.slice(a2);
    /* ★ 対照は **新しい覆いも外す**（2026-08-18 追記）。
       ログイン直後の覆い（覆う/外す＋120ms の見張り）を残したままだと、
       起動の経路まで そちらが守ってしまい、「直す前」でも 隙間が出ない。
       それでは 見張りとして 用をなさない。 */
    const c1 = 旧.indexOf("  /* ══ ログインした直後の 隙間を 塞ぐ（2026-08-18）");
    const c2 = 旧.indexOf("  function boot() {", c1 >= 0 ? c1 : 0);
    if (c1 >= 0 && c2 > c1) {
      旧 = 旧.slice(0, c1) + [
        "  function watch() {",
        "    var t = token();",
        "    if (t === lastToken) return;",
        "    var had = lastToken;",
        "    lastToken = t;",
        "    if (!t) { close(); return; }",
        "    if (!had) { setTimeout(function () { gate(); }, 400); return; }",
        "    gate();",
        "  }",
        ""
      ].join("\n") + 旧.slice(c2);
    }
    旧 = 旧.replace("setInterval(watch, 120);", "setInterval(watch, 800);");
    const b1 = 旧.indexOf("    if (lastToken) {\n      /* ★ 待たずに");
    if (b1 < 0) throw new Error("vq-pin の boot 中身が見つかりません");
    const b2 = 旧.indexOf("    setInterval(watch, 800);", b1);
    旧 = 旧.slice(0, b1) + "    if (lastToken) setTimeout(function () { gate(); }, 1200);\n" + 旧.slice(b2);
    差し替え = 旧;
    const B = await 走らせる(b, "直す前");
    ok("直す前は 間抜けな時間が 現れる（＝この見張りは効いている）", B.空白ms > 200 || (B.板初 && B.枚終 && B.板初 > B.枚終), { 空白: B.空白ms, 板: Math.round(B.板初 || 0), 枚終: Math.round(B.枚終 || 0) });
    console.log(`\n  縮んだ間抜けな時間: ${B.空白ms}ms → ${A.空白ms}ms`);
  } finally { await b.close(); srv.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
