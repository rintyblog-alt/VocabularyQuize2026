/* ══════════════════════════════════════════════════════════════════════════
   vqdmscroll.cjs — DM が **必ず いちばん下**に 来るかを 実物で 見る。

   訴え（2026-08-29）:「DM で、必ず メッセージが 毎回 最下部に くるように」

   なぜ 来ていなかったか（読んで 分かった 2 つ）:
     ① 描き直しは .sheet の innerHTML を まるごと 入れ替える。
        便りの 入れ物は 毎回 新しい 箱で scrollTop は 0。
        「下へ」の 印が 立っている ときしか 寄せていなかったので、
        既読を 付けた・相手が 読んだ などの **ついでの 描き直し**の たびに
        いちばん 上へ 飛んでいた。
     ② 絵は 描いたあとに 届く。高さが 増えるので 寄せ直しが 要る。

   見るところ:
     ① 開いた ときに いちばん下
     ② 送った あとも いちばん下
     ③ **ついでの 描き直し**（既読など）でも いちばん下の まま
     ④ 上へ 動かして いても、新しい 便りが 来たら いちばん下へ
     ⑤ 「前のやりとりを読む」では **いま 読んでいる ところが 動かない**

   使い方: VQ_BASE=<dev> node vqdmscroll.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("✓ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 160) : "")); }
  else { 落++; console.log("✗ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 240) : "")); }
};
const j = (r) => r.json();
async function 作る(名) {
  /* ★ ニックネームは **ログイン ID**。同じ ものは 二度 使えない
     （最初 "dmA" で 走らせて LOGIN_ID_TAKEN に なり、その先が
       SESSION_INVALID に 見えて 遠回りした）。毎回 別の 名前に する。 */
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 999);
  名 = (名 + 印).slice(0, 14);
  const mail = "vqdms" + 印 + "@gmail.com";
  let r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: 名, password: "Passw0rd!z3" }) }).then(j);
  let v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  let c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 160));
  return { token: c.token, uid: c.user && c.user.id, nickname: 名 };
}
/* 登録は 続けて 叩くと はじかれる ことが ある。少し 待って 数回 試す。 */
async function 作る何度か(名) {
  let 訳 = "";
  for (let i = 0; i < 4; i++) {
    try { return await 作る(名); }
    catch (e) { 訳 = String(e && e.message); await new Promise((s) => setTimeout(s, 1500 * (i + 1))); }
  }
  throw new Error(訳);
}
async function api(path, token, opts = {}) {
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const r = await fetch(BASE + path, { method: opts.method || "GET", headers: h,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

(async () => {
  const A = await 作る何度か("dmA");
  await new Promise((s) => setTimeout(s, 1500));
  const B = await 作る何度か("dmB");
  /* 相互フォローに して 上限を 外す（3 件で 止まらない ように） */
  const f1 = await api("/api/follow/toggle", A.token, { method: "POST", body: { targetUserId: B.uid } });
  const f2 = await api("/api/follow/toggle", B.token, { method: "POST", body: { targetUserId: A.uid } });
  console.log("フォロー:", f1.status, f2.status);

  /* 便りを たくさん 入れて、はみ出す 長さに する */
  let tid = "";
  for (let i = 1; i <= 62; i++) {
    const 送 = i % 2 ? A : B;
    const r = await api("/api/dm/send", 送.token, { method: "POST",
      body: tid ? { threadId: tid, body: "ためしの 便り " + i }
                : { userId: B.uid, body: "ためしの 便り " + i } });
    if (i === 1 && r.status !== 200) { console.log("送れない:", r.status, JSON.stringify(r.j).slice(0, 200)); }
    if (i === 1 && r.status === 200) console.log("1 通目:", JSON.stringify(r.j).slice(0, 160));
    if (r.j && r.j.message && r.j.message.threadId) tid = r.j.message.threadId;
    if (!tid && r.j && r.j.threadId) tid = r.j.threadId;
  }
  if (!tid) {
    const l = await api("/api/dm/threads", A.token);
    tid = ((l.j.threads || [])[0] || {}).id || "";
  }
  console.log("部屋:", tid);

  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1200, height: 760 } });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, A.token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqDM, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });

  const 位置 = () => page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".msgs"));
    if (!器) return { 無い: true };
    const m = 器.shadowRoot.querySelector(".msgs");
    return { top: Math.round(m.scrollTop), 高: Math.round(m.scrollHeight),
             見え: Math.round(m.clientHeight),
             下端: (m.scrollHeight - m.scrollTop - m.clientHeight) <= 48,
             はみ出す: m.scrollHeight > m.clientHeight + 40 };
  });

  /* ── ① 開いた ときに いちばん下 ── */
  await page.evaluate((t) => window.__vqDM.開く(t), tid);
  await page.waitForTimeout(4000);
  const 状 = await page.evaluate(() => window.__vqDM.状態());
  console.log("DM の 状態:", JSON.stringify(状));
  let p = await 位置();
  console.log("開いた 直後:", JSON.stringify(p));
  見(!p.無い, "DM が 開いた");
  見(状 && 状.便り >= 20, "便りが 読み込めた（" + (状 && 状.便り) + " 件）", 状);
  見(p.はみ出す, "① 便りが 画面から はみ出している（試す 意味が ある）", p);
  見(p.下端, "① 開いた ときに いちばん下", p);

  /* ── ③ ついでの 描き直しでも 下の まま ── */
  await page.waitForTimeout(4000);          /* 巡回・既読で 何度か 描き直る */
  p = await 位置();
  console.log("しばらく 待った あと:", JSON.stringify(p));
  見(p.下端, "③ ついでの 描き直しでも いちばん下の まま", p);

  /* ── ② 送った あとも 下 ── */
  await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".msgs"));
    const ta = 器.shadowRoot.querySelector("textarea");
    if (ta) { ta.value = "いま 送った 便り"; ta.dispatchEvent(new Event("input", { bubbles: true })); }
    const btn = 器.shadowRoot.querySelector('[data-a="send"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2500);
  p = await 位置();
  console.log("送った あと:", JSON.stringify(p));
  見(p.下端, "② 送った あとも いちばん下", p);

  /* ── ④ 上へ 動かして いても、新しい 便りが 来たら 下へ ── */
  await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".msgs"));
    器.shadowRoot.querySelector(".msgs").scrollTop = 0;
  });
  await page.waitForTimeout(300);
  const 上 = await 位置();
  見(!上.下端, "④ いったん 上へ 動かした", 上);
  await api("/api/dm/send", B.token, { method: "POST", body: { threadId: tid, body: "相手からの 新しい 便り" } });
  await page.waitForTimeout(7000);          /* 巡回が 拾うのを 待つ */
  p = await 位置();
  console.log("新しい 便りの あと:", JSON.stringify(p));
  見(p.下端, "④ 新しい 便りが 来たら いちばん下へ", p);

  /* ── ⑤ 「前のやりとりを読む」で いま 読んでいる ところが 動かない ── */
  const 前ボタン = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".msgs"));
    return !!器.shadowRoot.querySelector('[data-a="more"]');
  });
  if (前ボタン) {
    /* まず 上まで 動かして、その ボタンが 見える ところへ */
    await page.evaluate(() => {
      const 器 = Array.from(document.querySelectorAll("*")).find(
        (e) => e.shadowRoot && e.shadowRoot.querySelector(".msgs"));
      器.shadowRoot.querySelector(".msgs").scrollTop = 0;
    });
    await page.waitForTimeout(300);
    const 前 = await 位置();
    await page.evaluate(() => {
      const 器 = Array.from(document.querySelectorAll("*")).find(
        (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="more"]'));
      器.shadowRoot.querySelector('[data-a="more"]').click();
    });
    await page.waitForTimeout(2500);
    const 後 = await 位置();
    console.log("前のやりとりを読む:", JSON.stringify({ 前: 前, 後: 後 }));
    見(後.高 > 前.高, "⑤ 前の やりとりが 増えた", { 前: 前.高, 後: 後.高 });
    /* いま 読んでいた ところが 動かない ＝ 増えた ぶん だけ 下へ ずれている */
    const ずれ = Math.abs((後.top - 前.top) - (後.高 - 前.高));
    見(ずれ <= 60, "⑤ **いま 読んでいる ところが 動かない**（ずれ " + ずれ + "px）", { ずれ: ずれ });
    見(!後.下端, "⑤ いちばん下へ 飛ばされていない", 後);
  } else {
    見(true, "⑤ （前の やりとりが 無いので 見送り）");
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));
  await b.close();
  console.log(`\n通った ${済} ／ 落ち ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
