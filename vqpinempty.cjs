/* ══════════════════════════════════════════════════════════════════════════
   vqpinempty.cjs — 「白い/黒い画面で 何も出来ない」の再現と 見張り。

   利用者の画面から取れた事実（2026-08-19）:
     中央にあるもの = vqPin、display:block、768x814、ほかの覆いは全部 none。
     ＝ **暗証番号の板が 画面いっぱいに出ているのに 中身が空**。

   なぜ起きるか:
     gate() が next() の直後に **無条件で** display:block にしていた。
     next() は はじめての人へ案内を先に見せるため いったん板を隠すので、
     st.step が決まらないまま 板だけが出る。
     view() は 知らない step に 空文字を返す → 中身ゼロの箱。

   起こしかた: needsPin の人 かつ 案内(pin)を まだ見ていない状態。
   使い方: node vqpinempty.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };

async function 試す(b, 案内を見たことにするか, ラベル) {
  const ctx = await b.newContext({ viewport: { width: 768, height: 814 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free", email: "t@e.com" } }) }));
  /* はじめて暗証番号を決める人 */
  await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ hasPin: false, pinVerified: false, needsPin: true, needsEmail: false, needsConsent: false }) }));
  await ctx.addInitScript(([見た]) => {
    try {
      localStorage.setItem("app.auth.token.v1", "t");
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
      if (見た) localStorage.setItem("vq.tour.pin.v1", "1");   /* 案内を見た扱い */
    } catch (e) {}
  }, [案内を見たことにするか]);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(9000);
  const d = await page.evaluate(() => {
    const p = document.getElementById("vqPin");
    if (!p) return { 有: false };
    const s = getComputedStyle(p), r = p.getBoundingClientRect();
    const card = p.shadowRoot ? p.shadowRoot.querySelector(".card") : null;
    const 字 = card ? (card.textContent || "").trim() : "";
    /* 画面の真ん中に 何が見えているか（利用者が実際に見るもの） */
    let 中 = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    for (let i = 0; i < 4 && 中 && 中.shadowRoot; i++) {
      const u = 中.shadowRoot.elementFromPoint(innerWidth / 2, innerHeight / 2);
      if (!u || u === 中) break; 中 = u;
    }
    /* 読める字が 画面に出ているか */
    let 読める = "";
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n, out = [];
    while ((n = w.nextNode()) && out.join("").length < 120) {
      const t = String(n.nodeValue || "").trim(); if (!t) continue;
      const pe = n.parentElement; if (!pe) continue;
      const rr = pe.getBoundingClientRect(); if (rr.width < 2 || rr.height < 2) continue;
      if (rr.bottom < 0 || rr.top > innerHeight) continue;
      const cs = getComputedStyle(pe);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < .3) continue;
      out.push(t);
    }
    /* 影の DOM の中の字も拾う */
    for (const h of document.querySelectorAll("*")) {
      if (!h.shadowRoot) continue;
      const cs = getComputedStyle(h);
      if (cs.display === "none" || Number(cs.opacity) < .3) continue;
      const t = (h.shadowRoot.textContent || "").trim();
      if (t) out.push("[" + (h.id || h.tagName) + "] " + t.slice(0, 40));
    }
    読める = out.join(" / ").slice(0, 160);
    return { 有: true, 出: s.display !== "none", w: Math.round(r.width), h: Math.round(r.height),
             中身: 字.length, 字: 字.slice(0, 36),
             中央: 中 ? (中.id ? "#" + 中.id : (typeof 中.className === "string" && 中.className ? "." + 中.className.split(" ")[0] : 中.tagName.toLowerCase())) : "-",
             読める,
             覆い他: ["authBootSplash", "globalLoadingOverlay", "vqNewAuth", "firstLaunchOverlay"]
               .filter((id) => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== "none"; }) };
  });
  await ctx.close();
  const 空の板 = d.有 && d.出 && d.中身 === 0;
  console.log(`  [${ラベル}] 板:${d.出 ? d.w + "x" + d.h : "出ていない"} 中身:${d.中身}文字 中央:${d.中央}`);
  console.log(`         読める字: ${d.読める || "（何も読めない）"}`);
  return { 空の板, ...d };
}

(async () => {
  const b = await chromium.launch();
  try {
    console.log("\n■ ① はじめて暗証番号を決める人（案内 未読）＝ 訴えの状況");
    const A = await 試す(b, false, "案内 未読");
    ok("中身ゼロの板が 画面いっぱいに出ることが 無い", !A.空の板, A);
    ok("板が出ているなら 中身がある（または そもそも出ない）", !A.出 || A.中身 > 0, A);

    console.log("\n■ ② 案内を すでに見た人");
    const B = await 試す(b, true, "案内 既読");
    ok("こちらも 中身ゼロの板が 出ない", !B.空の板, B);
    /* 板が出ていなくても、案内（チュートリアル）が出ているなら それでよい。
       いけないのは **何も読めない画面**が残ること。 */
    ok("画面に 読めるものが 出ている（真っさらで固まらない）", (B.読める || "").length > 5, B);
    ok("①でも 読めるものが 出ている", (A.読める || "").length > 5, A);
  } finally { await b.close(); }
  console.log("\n" + "═".repeat(56));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(56));
  process.exit(fail ? 1 : 0);
})();
