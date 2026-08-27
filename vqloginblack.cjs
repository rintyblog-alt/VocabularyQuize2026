/* ══════════════════════════════════════════════════════════════════════════
   vqloginblack.cjs — 「ログインしたら 黒い画面が出る」を 再現して 直ったか見る。

   起こしかた:
     未ログインで開く → 起動が終わる → **そこで 合言葉を入れる**（＝ログイン）
     → 見張りが気づく → 暗証番号を出すか どうか サーバへ聞く
     この 問い合わせの間、本体が 空のまま 見えていた。

   見ること:
     ① 合言葉が入ってから 暗証番号の板が出るまで、**中身が空のまま見える時間**が無い
     ② 直す前の作りに戻すと、その時間が ちゃんと現れる
   使い方: node vqloginblack.cjs [--遅れ 800]
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path"); const zlib = require("zlib");
const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const 遅れ = 引("--遅れ", 800), CPU = 引("--cpu", 2);
const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8993);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); } };
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
      let 生;
      if (p === "/index.html" && 差し替え) 生 = Buffer.from(差し替え, "utf8");
      else {
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
        生 = fs.readFileSync(f);
      }
      const 種 = MIME[path.extname(p)] || "application/octet-stream";
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
/* 画面の中に見張りを仕込む: 「覆いも板も無いのに 本体が見えている」時間を測る */
const 見張り = () => {
  window.__B = { 空: [], 印: false };
  const B = window.__B;
  let 前 = false;
  const 見る = () => {
    const t = performance.now();
    if (B.印) {
      const sp = document.getElementById("authBootSplash");
      const spOn = sp && getComputedStyle(sp).display !== "none" && Number(getComputedStyle(sp).opacity) > 0.3;
      /* ログイン直後の 専用の覆い（#vqPinCover）も 覆いとして数える */
      const cv = document.getElementById("vqPinCover");
      const cvOn = cv && getComputedStyle(cv).display !== "none" && Number(getComputedStyle(cv).opacity) > 0.3;
      const pin = document.getElementById("vqPin");
      const pinOn = pin && getComputedStyle(pin).display !== "none" &&
                    pin.shadowRoot && pin.shadowRoot.querySelector("div") &&
                    pin.shadowRoot.querySelector("div").getBoundingClientRect().height > 200;
      const 空 = !spOn && !cvOn && !pinOn;
      if (空 && !前) B.空.push({ 始: t });
      if (!空 && 前 && B.空.length && !B.空[B.空.length - 1].終) B.空[B.空.length - 1].終 = t;
      前 = 空;
    }
    requestAnimationFrame(見る);
  };
  requestAnimationFrame(見る);
};
async function 走る(b, ラベル) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u-test", nickname: "テスト", plan: "free", email: "t@example.com" } }) }));
  await ctx.route("**/api/auth/pin/status*", async (r) => {
    await new Promise((res) => setTimeout(res, 遅れ));       /* 細い回線ぶんの間 */
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ hasPin: true, pinVerified: false, needsPin: false, needsEmail: false, needsConsent: false }) });
  });
  await ctx.addInitScript(見張り);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 180000 });
  /* 起動が終わるまで待つ（未ログイン） */
  await page.waitForFunction(() => !document.body.classList.contains("auth-booting"), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1200);
  /* ここで ログインする（合言葉を入れる） */
  /* ★ 本物と同じ順番でやる。
     vq-newauth は ログインが通ると
       ① 合言葉を保存する → ② hide() で 窓を畳む（html から vqna-showing を外す）
     を **ひと続きで** 行う。localStorage を書くだけだと ②が起きず、
     「窓が閉じた瞬間を捉える」仕掛けが 試されない。 */
  const 窓が出てたか = await page.evaluate(() => document.documentElement.classList.contains("vqna-showing"));
  await page.evaluate(() => {
    window.__B.印 = true;
    localStorage.setItem("app.auth.token.v1", "test-token");
    localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
    /* ② 窓を畳む（本物の hide() と同じこと） */
    try { document.documentElement.classList.remove("vqna-showing"); } catch (e) {}
    const host = document.getElementById("vqNewAuth");
    if (host) host.style.display = "none";
    try { document.body.classList.remove("auth-gate-open", "first-launch-open"); } catch (e) {}
  });
  if (!窓が出てたか) console.log("    （注記: ログイン窓は 出ていなかった。合言葉の保存だけで試している）");
  /* 暗証番号の板が出るまで（最大 20 秒） */
  await page.waitForFunction(() => {
    const p = document.getElementById("vqPin");
    return p && p.shadowRoot && p.shadowRoot.querySelector("div") &&
           p.shadowRoot.querySelector("div").getBoundingClientRect().height > 200 &&
           getComputedStyle(p).display !== "none";
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const B = await page.evaluate(() => window.__B);
  await ctx.close();
  const 空 = (B.空 || []).map((x) => Math.round((x.終 || performance.now ? (x.終 || 0) : 0) - x.始)).filter((x) => x > 80);
  const 合 = 空.reduce((a, x) => a + x, 0);
  console.log(`  [${ラベル}] 中身が むき出しだった時間: ${合 ? 空.join("+") + "ms" : "なし"}`);
  return 合;
}
(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  const 元 = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  try {
    console.log("\n■ ① いまの作り");
    差し替え = null;
    const A = await 走る(b, "いま");
    ok("ログイン直後に 中身が むき出しになる時間が 無い", A === 0, A + "ms");

    console.log("\n■ ② 直す前の作りに戻して、ちゃんと落ちるか見る");
    const i = 元.indexOf("  /* ══ ログインした直後の 隙間を 塞ぐ（2026-08-18）");
    const j = 元.indexOf("  function boot() {", i);
    if (i < 0 || j < 0) throw new Error("差し替え箇所が見つかりません");
    const 旧watch = [
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
    ].join("\n");
    差し替え = 元.slice(0, i) + 旧watch + 元.slice(j);
    const C = await 走る(b, "直す前");
    ok("直す前は むき出しの時間が 現れる（＝この見張りは効いている）", C > 200, C + "ms");
    console.log(`\n  むき出しだった時間: ${C}ms → ${A}ms`);
  } finally { await b.close(); srv.close(); }
  console.log("\n" + "═".repeat(56));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(56));
  process.exit(fail ? 1 : 0);
})();
