/* ══════════════════════════════════════════════════════════════════════════
   vqliveguard.cjs
     ① ログイン画面では 本物の Lumi が 起動しない
     ② 特定の言葉を聞き取ったら **必ず** 帯に返事が出る（音が鳴らなくても）
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); } };
const 節 = (t) => console.log("\n■ " + t);

async function 場(b, ログイン) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free" } }) }));
  await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ hasPin: true, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) }));
  await ctx.addInitScript((ロ) => {
    try {
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
      if (ロ) {
        localStorage.setItem("app.auth.token.v1", "t");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      }
    } catch (e) {}
    window.__SRたち = [];
    function にせSR() {
      this.lang = "ja-JP"; this.continuous = true; this.interimResults = false;
      this.onresult = null; this.onerror = null; this.onend = null;
      this.start = () => {}; this.stop = () => {};
      window.__SRたち.push(this);
    }
    window.SpeechRecognition = にせSR; window.webkitSpeechRecognition = にせSR;
    window.__聞こえたことにする = (t) => {
      const r = window.__SRたち[window.__SRたち.length - 1];
      if (!r || !r.onresult) return "認識器が無い";
      r.onresult({ resultIndex: 0, results: [[{ transcript: t }]] });
      return "流した";
    };
  }, ログイン);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
  return { ctx, page };
}

(async () => {
  const b = await chromium.launch();
  try {
    節("① ログイン画面では 本物の Lumi が 起動しない");
    {
      const { ctx, page } = await 場(b, false);
      await page.waitForTimeout(7000);
      const d = await page.evaluate(() => {
        const L = window.__vqLive;
        const 前 = L && L.isOn ? L.isOn() : null;
        try { L.open(); } catch (e) {}
        return { 呼ぶ前: 前, 呼んだあと: L && L.isOn ? L.isOn() : null,
                 ログイン画面が出ている: !!(document.getElementById("vqNewAuth") &&
                   getComputedStyle(document.getElementById("vqNewAuth")).display !== "none") ||
                   document.body.classList.contains("auth-gate-open") };
      });
      console.log("     " + JSON.stringify(d));
      ok("ログイン画面が出ている", d.ログイン画面が出ている, d);
      ok("open() を呼んでも 起動しない", d.呼んだあと === false || d.呼んだあと === null, d);
      await ctx.close();
    }

    節("② 聞き取れたら 必ず 帯に返事が出る");
    {
      const { ctx, page } = await 場(b, true);
      await page.waitForFunction(() => {
        const h = document.getElementById("vqLumiTour");
        return h && getComputedStyle(h).display !== "none";
      }, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const h = document.getElementById("vqLumiTour");
        const go = h && h.shadowRoot && h.shadowRoot.querySelector(".go");
        if (go) go.click();
      });
      await page.waitForTimeout(2000);
      /* 音を鳴らせない状況を作る（AudioContext を潰す）＝音に頼れない端末 */
      await page.evaluate(() => { try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) {} });
      await page.evaluate(() => window.__聞こえたことにする("ヘイルミ"));
      await page.waitForTimeout(700);
      const 直後 = await page.evaluate(() => {
        const h = document.getElementById("vqLumiTour");
        const t = h && h.shadowRoot && h.shadowRoot.querySelector(".hint");
        return t ? (t.textContent || "").trim() : "";
      });
      console.log("     聞き取った直後の帯: " + JSON.stringify(直後));
      /* 「聞こえたよ」→ すぐ 返事の文で 上書きされる。
         大事なのは **音に頼らず 何か返ってくること**なので、どちらでも通す。 */
      ok("聞き取ったら 帯に 反応が出る（音に頼らない）",
         /聞こえたよ/.test(直後) || (直後.length > 3 && !/^$/.test(直後)), 直後);
      await page.waitForTimeout(6000);
      const 返事 = await page.evaluate(() => {
        const h = document.getElementById("vqLumiTour");
        const t = h && h.shadowRoot && h.shadowRoot.querySelector(".hint");
        const s = window.__vqLumiTour.状態();
        return { 帯: t ? (t.textContent || "").trim() : "", 段: s.段 };
      });
      console.log("     しばらく後: " + JSON.stringify(返事));
      ok("次の段へ進んでいる", 返事.段 > 0, 返事);
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
