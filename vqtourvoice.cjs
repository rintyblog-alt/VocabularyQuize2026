/* ══════════════════════════════════════════════════════════════════════════
   vqtourvoice.cjs — チュートリアルが **声を聞き取って 反応する**かを見る。

   本物の音声認識は 端末とマイクが要るので、SpeechRecognition を差し替えて
   「こう聞こえた」を流し込み、段が進むか・応答が出るかを確かめる。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); } };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free" } }) }));
    await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ hasPin: true, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) }));
    /* ★ 音声認識を 差し替える。作られたものを 窓へ出しておく。 */
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.auth.token.v1", "t");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
        localStorage.setItem("vq.newauth.introSeen.v1", "1");
      } catch (e) {}
      window.__SRたち = [];
      function にせSR() {
        this.lang = "ja-JP"; this.continuous = true; this.interimResults = false;
        this.onresult = null; this.onerror = null; this.onend = null;
        this.start = () => { this.動いてる = true; };
        this.stop = () => { this.動いてる = false; };
        window.__SRたち.push(this);
      }
      window.SpeechRecognition = にせSR;
      window.webkitSpeechRecognition = にせSR;
      /* 「こう聞こえた」を流し込む口 */
      window.__聞こえたことにする = (t) => {
        const r = window.__SRたち[window.__SRたち.length - 1];
        if (!r || !r.onresult) return "認識器がまだ無い";
        r.onresult({ resultIndex: 0, results: [[{ transcript: t }]] });
        return "流した";
      };
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => {
      const h = document.getElementById("vqLumiTour");
      return h && getComputedStyle(h).display !== "none";
    }, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1800);

    const 開いた = await page.evaluate(() => {
      const h = document.getElementById("vqLumiTour");
      return !!(h && getComputedStyle(h).display !== "none");
    });
    ok("ログインだけで チュートリアルが出た（予約が入っている）", 開いた,
       await page.evaluate(() => window.__vqLumiTour.なぜ()));
    if (!開いた) throw new Error("開かないので ここまで");

    /* 最初の画面は「はじめる／あとで」。押してから 聞き取りが始まる。 */
    await page.evaluate(() => {
      const h = document.getElementById("vqLumiTour");
      const go = h && h.shadowRoot && h.shadowRoot.querySelector(".go");
      if (go) go.click();
    });
    await page.waitForTimeout(2000);
    ok("「はじめる」を押したら 音声認識が始まる",
       await page.evaluate(() => (window.__SRたち || []).length > 0 && !!window.__SRたち[window.__SRたち.length - 1].onresult),
       await page.evaluate(() => (window.__SRたち || []).length));

    const 段を読む = () => page.evaluate(() => {
      const s = window.__vqLumiTour.状態();
      const h = document.getElementById("vqLumiTour");
      const sh = h && h.shadowRoot && h.shadowRoot.querySelector(".sheet");
      return { 段: s.段, 字: sh ? (sh.textContent || "").trim().slice(0, 40) : "" };
    });

    const 前 = await 段を読む();
    console.log("     いまの段: " + JSON.stringify(前));
    /* ① 呼びかけ */
    await page.evaluate(() => window.__聞こえたことにする("ヘイルミ"));
    await page.waitForTimeout(6000);   /* 応答の声を鳴らしてから進むので長めに待つ */
    const 後1 = await 段を読む();
    console.log("     「ヘイルミ」と言ったあと: " + JSON.stringify(後1));
    ok("① 呼びかけを 聞き取って 次へ進む", 後1.段 > 前.段, { 前, 後1 });

    /* ② 日付 */
    await page.evaluate(() => window.__聞こえたことにする("今日は何日"));
    await page.waitForTimeout(6000);   /* 応答の声を鳴らしてから進むので長めに待つ */
    const 後2 = await 段を読む();
    console.log("     「今日は何日」のあと: " + JSON.stringify(後2));
    ok("② 特定の言葉（今日/何日）で 進む", 後2.段 > 後1.段, { 後1, 後2 });

    /* ③ 関係ない言葉では 進まない */
    await page.evaluate(() => window.__聞こえたことにする("おはようございます今日はいい天気ですね"));
    await page.waitForTimeout(6000);
    const 後3 = await 段を読む();
    ok("③ 関係ない言葉では 進まない", 後3.段 === 後2.段, { 後2, 後3 });
    await ctx.close();
  } catch (e) { console.log("  ✗ " + String(e.message).slice(0, 160)); fail++; }
  finally { await b.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
