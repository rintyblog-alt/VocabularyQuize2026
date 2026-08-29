/* ══════════════════════════════════════════════════════════════════════════
   vqmodalin.cjs — **窓が 開くときの 動き**が 決めてあるかを 実物で 見る。

   訴え（2026-08-29）:
     「アプリ全部で 言えることなんだけど、モーダルを 開く時にも
       アニメーションを 入れて欲しい。
       既存の モーダルは 閉じる時のみに アニメーションを 入れてるだけ」

   ★ 数えかたを 3 回 変えた。理由:
     ・getAnimations() は **走っている 動きしか** 返さない。
     ・窓の 多くは 「いま 見ていない 画面(.view)」の 中に 眠っていて、
       親ごと display:none。走らせようが 無い。
     → だから **走らせずに**、「開いた 姿の とき どんな 動きが 決めてあるか」を
       getComputedStyle の animation-name / transition で 読む。
       これは display:none でも 正しく 読める。

   使い方: VQ_BASE=<dev> node vqmodalin.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("✓ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; console.log("✗ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 300) : "")); }
};
const j = (r) => r.json();
async function 作る() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 999);
  let r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqmi" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("mi" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  let v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  let c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

(async () => {
  const token = await 作る();
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1180, height: 900 } });
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  /* 1.4MB の vq-ds.css は media="print" で 遅れて 当たる。当たるまで 待つ。 */
  await page.waitForFunction(() => {
    const l = document.getElementById("vq-ds");
    return l && l.media === "all";
  }, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });

  const 表 = await page.evaluate(async () => {
    const 待ち = (ms) => new Promise((s) => setTimeout(s, ms));
    const 読む = (el) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      const 名 = String(c.animationName || "none");
      const 長 = String(c.animationDuration || "0s");
      const t名 = String(c.transitionProperty || "none");
      const t長 = String(c.transitionDuration || "0s");
      return {
        動き: 名 !== "none" && !/^0s(,\s*0s)*$/.test(長) ? 名 + " " + 長 : "",
        移り: t名 !== "none" && !/^0s(,\s*0s)*$/.test(t長) ? t名 + " " + t長 : ""
      };
    };
    const 候補 = [
      ["quizExitOverlay", ".sheet"], ["appFeedEditorOverlay", ".sheet"],
      ["appFollowListOverlay", ".sheet"], ["appProfileAvatarLightbox", "img,.sheet"],
      ["appFeedMenuOverlay", ".sheet"], ["appFeedReportOverlay", ".sheet"],
      ["appProfileEditOverlay", ".sheet"], ["presetOverlay", ".sheet"],
      ["settingsOverlay", ".settings-fullsheet"], ["timeOverlay", ".sheet"],
      ["updateOverlay", ".sheet"], ["insightsOverlay", ".sheet"],
      ["notifyOverlay", ".sheet"], ["searchOverlay", ".sheet"],
      ["appQreditOverlay", ".sheet"], ["appQreditCardOverlay", ".app-qredit-card-shell,.app-qredit-card-onboarding"],
      ["appQodOverlay", ".sheet,.app-qredit-card-shell"], ["appCheckoutOverlay", ".sheet"],
      ["presetEngineOverlay", ".app-preset-engine-sheet,.app-preset-engine-panel"],
      ["presetPublishOverlay", ".app-preset-publish-sheet,.app-preset-publish-panel"],
      ["scanGenOverlay", ".scan-gen-sheet"], ["appNewsEditorOverlay", ".sheet"],
      ["chatSettingsOverlay", ".sheet"], ["skillsOverlay", ".sheet,.skills-panel"],
      ["vqBoardOverlay", ".sheet,.vqboard-panel"], ["sedeUsageModalOverlay", ".sheet,.ui-modal-card"],
      ["maintenanceOverlay", ".maintenance-card"]
    ];
    const out = [];
    for (const [id, sel] of 候補) {
      const ov = document.getElementById(id);
      if (!ov) { out.push({ id, 無い: true }); continue; }
      const 元 = ov.className, 元s = ov.getAttribute("style") || "";
      /* 「開いた 姿」に して 読むだけ。走らせない。 */
      ov.classList.remove("hidden");
      ov.classList.add("is-open", "open");
      await 待ち(20);
      const 幕 = 読む(ov), 札 = 読む(ov.querySelector(sel) || ov.firstElementChild);
      out.push({ id, 幕, 札 });
      ov.className = 元; ov.setAttribute("style", 元s);
    }
    return out;
  });

  console.log("\n════ 開いた 姿で 決まっている 動き ════");
  const なし = [];
  表.forEach((x) => {
    if (x.無い) { console.log("  ―     " + x.id + "（この 画面には 無い）"); return; }
    const 幕 = x.幕 || {}, 札 = x.札 || {};
    const ok = !!(幕.動き || 幕.移り || 札.動き || 札.移り);
    console.log((ok ? "  動く " : "  ×    ") + x.id.padEnd(24)
      + " 幕[" + (幕.動き || 幕.移り || "―") + "] 札[" + (札.動き || 札.移り || "―") + "]");
    if (!ok) なし.push(x.id);
  });
  見(なし.length === 0, "本体の 窓は すべて 開くときの 動きが 決めてある", なし);

  /* ── 影の DOM の 窓は 実際に 開けて、走っている 動きを 見る ── */
  await page.evaluate(() => { document.body.setAttribute("data-app-tab", "inbox"); });
  await page.waitForTimeout(5000);
  const 影動き = async (開ける, 探す, 名) => {
    await page.evaluate(開ける);
    await page.waitForTimeout(40);
    const r = await page.evaluate((sel) => {
      const h = Array.from(document.querySelectorAll("*")).find(
        (e) => e.shadowRoot && e.shadowRoot.querySelector(sel));
      if (!h) return { 無い: true };
      const el = h.shadowRoot.querySelector(sel);
      return { 動: (el.getAnimations ? el.getAnimations() : []).map((a) => ({
        名: a.animationName || a.transitionProperty || "?",
        長: a.effect && a.effect.getTiming ? Math.round(a.effect.getTiming().duration || 0) : 0
      })).filter((x) => x.長 > 0) };
    }, 探す);
    if (r.無い) { 見(false, 名 + " が 見つからない"); return; }
    見(r.動.length > 0, 名 + " は 開くときに 動く", r.動);
  };
  console.log("\n════ 影の DOM の 窓（実際に 開けて 見る）════");
  await 影動き(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="menu"]'));
    if (h) h.shadowRoot.querySelector('[data-a="menu"]').click();
  }, ".menu", "投稿の ⋯ の 品書き");
  await 影動き(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="mn-report"]'));
    if (h) h.shadowRoot.querySelector('[data-a="mn-report"]').click();
  }, ".ped-w", "報告の 窓");
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="rp-cancel"]'));
    if (h) h.shadowRoot.querySelector('[data-a="rp-cancel"]').click();
  });
  await page.waitForTimeout(400);
  await 影動き(() => { try { window.__vqOpenSettings && window.__vqOpenSettings(); } catch (e) {} },
    ".modal", "アプリ設定の 窓");

  await b.close();
  console.log(`\n通った ${済} ／ 落ち ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
