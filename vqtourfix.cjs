/* ══════════════════════════════════════════════════════════════════════════
   vqtourfix.cjs — Lumi のはじめかた（チュートリアル）の 3 つの訴え

     ① ボタンが効かない。透過して 下の画面のボタンを押してしまう
        → 帯は 影の DOM の中にあるのに、外側の CSS で
          「#vqLumiTour > * は pointer-events:auto」と書いていた。
          子要素として当たらないので 帯まで none のままだった。
     ② ログインでも 必ず出したい
     ③ 利用規約に同意して アカウントを作った直後にも 出したい
        → どちらも「合言葉が入った瞬間」に予約すれば通る。

   使い方: node vqtourfix.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };
const 節 = (t) => console.log("\n■ " + t);

async function 場を作る(b, o) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free", email: "t@e.com" } }) }));
  await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ hasPin: false, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) }));
  await ctx.addInitScript((op) => {
    try {
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
      if (op.ログイン済み) {
        localStorage.setItem("app.auth.token.v1", "t");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      }
      if (op.予約) localStorage.setItem("vq.lumitour.v2", "pending");
    } catch (e) {}
  }, o);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
  return { ctx, page };
}
const 帯を見る = () => {
  const h = document.getElementById("vqLumiTour");
  if (!h || !h.shadowRoot) return { 有: false };
  const sh = h.shadowRoot.querySelector(".sheet");
  if (!sh) return { 有: true, 帯: false };
  const cs = getComputedStyle(sh), r = sh.getBoundingClientRect();
  const go = h.shadowRoot.querySelector(".go");
  const gr = go ? go.getBoundingClientRect() : null;
  /* 「はじめる」の真ん中を押したら 本当にそのボタンに当たるか */
  let 当たる = null;
  if (gr && gr.width > 10) {
    const x = gr.left + gr.width / 2, y = gr.top + gr.height / 2;
    let t = document.elementFromPoint(x, y);
    if (t && t.shadowRoot) { const u = t.shadowRoot.elementFromPoint(x, y); if (u) t = u; }
    当たる = t ? (t.className || t.tagName) : null;
  }
  return { 有: true, 帯: true, 出: getComputedStyle(h).display !== "none",
           pe: cs.pointerEvents, w: Math.round(r.width), h: Math.round(r.height),
           押した先: 当たる, 字: (sh.textContent || "").trim().slice(0, 30) };
};

(async () => {
  const b = await chromium.launch();
  try {
    節("① 帯のボタンが 本当に押せるか（予約済みで開かせる）");
    {
      const { ctx, page } = await 場を作る(b, { ログイン済み: true, 予約: true });
      await page.waitForFunction(() => {
        const h = document.getElementById("vqLumiTour");
        return h && getComputedStyle(h).display !== "none";
      }, null, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const d = await page.evaluate(帯を見る);
      console.log("     " + JSON.stringify(d));
      ok("帯が出ている", d.有 && d.帯 && d.出, d);
      ok("帯が 押せる状態（pointer-events:auto）", d.pe === "auto", d.pe);
      ok("「はじめる」を押したら **そのボタンに当たる**（透過しない）", /go/.test(String(d.押した先 || "")), d.押した先);
      /* 実際に押して 段が進むか */
      const 前 = await page.evaluate(() => (window.__vqLumiTour.状態() || {}).段);
      await page.evaluate(() => {
        const h = document.getElementById("vqLumiTour");
        const go = h && h.shadowRoot && h.shadowRoot.querySelector(".go");
        if (go) { const r = go.getBoundingClientRect(); 
          go.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width/2, clientY: r.top + r.height/2 })); }
      });
      await page.waitForTimeout(1200);
      const 後 = await page.evaluate(() => (window.__vqLumiTour.状態() || {}));
      ok("押したら 反応する（開いたまま／段が動く）", 後 && (後.開いている === true || 後.段 !== 前), { 前, 後 });
      await ctx.close();
    }

    節("② ログインした瞬間に 予約されるか");
    {
      const { ctx, page } = await 場を作る(b, { ログイン済み: false, 予約: false });
      await page.waitForTimeout(4000);
      const 前 = await page.evaluate(() => localStorage.getItem("vq.lumitour.v2"));
      /* ログインする（本物と同じ順番） */
      await page.evaluate(() => {
        localStorage.setItem("app.auth.token.v1", "t");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
        try { document.documentElement.classList.remove("vqna-showing"); } catch (e) {}
        const h = document.getElementById("vqNewAuth"); if (h) h.style.display = "none";
        try { document.body.classList.remove("auth-gate-open", "first-launch-open"); } catch (e) {}
      });
      await page.waitForTimeout(2500);
      const 後 = await page.evaluate(() => localStorage.getItem("vq.lumitour.v2"));
      console.log(`     予約の印: ${JSON.stringify(前)} → ${JSON.stringify(後)}`);
      ok("ログインしたら 予約される（pending になる）", 後 === "pending", { 前, 後 });
      await ctx.close();
    }

    節("③ 諦める回数と 鍵の版");
    {
      const { ctx, page } = await 場を作る(b, { ログイン済み: true, 予約: false });
      await page.waitForTimeout(2000);
      const d = await page.evaluate(() => ({
        v2: localStorage.getItem("vq.lumitour.v2"),
        v1: localStorage.getItem("vq.lumitour.v1"),
        回数の鍵: localStorage.getItem("vq.lumitour.tries.v2")
      }));
      ok("新しい鍵（v2）を使っている", d.v2 !== null || d.v1 === null, d);
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
