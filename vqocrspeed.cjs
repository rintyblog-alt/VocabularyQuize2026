/* ══════════════════════════════════════════════════════════════════════════
   vqocrspeed.cjs — 資料の 読み取りの 速さ（2026-09-03・訴え）

   訴え「PDF や スキャンされた 画像の 読み取りが いまだに 遅い。
         必ず 時間短縮も 行なってください」

   直す前の 決まり:
     ・1 回に 送る ページ … 4（向こうの 上限は 8 なのに 半分しか 使っていない）
     ・同時に 走らせる 本数 … 3
     ・**資料ごとに 順番**（14 件 あれば 14 回 直列）

   直したあと:
     ・1 回に 送る ページ … 8
     ・同時 … 6
     ・全部の 資料の ページを **1 本の 列**にして 流す

   ★ ここは **同じ 待ち時間の 模型**を 使って、古い 割りかたと 新しい
     割りかたを 同じ 条件で 走らせて 比べる（片方だけ 有利に しない）。
     新しい ほうは **本物の 実装**（__vqMake.絵を文字にする）を 走らせる。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const j = (r) => r.json().catch(() => ({}));

/* 1 回の 読み取りに かかる 時間の 模型（ms）。実測の おおよそ。 */
const 一回のミリ秒 = 300;

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqo" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("o" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__vqMake && window.__vqMake.絵を文字にする),
    null, { timeout: 60000 });

  節("読み取りの 割りかた（同じ 待ち時間の 模型で 比べる）");
  const r = await page.evaluate(async ({ ms }) => {
    /* ── 1×1 の PNG（中身は 何でもよい。数と 割りかただけを 見る） ── */
    const 絵 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const 資料数 = 3, 頁数 = 24;               /* 3 件 × 24 ページ = 72 ページ */
    const 作 = () => {
      const 出 = [];
      for (let f = 1; f <= 資料数; f++) {
        const pi = [];
        for (let p = 1; p <= 頁数; p++) pi.push({ pageNumber: p, dataUrl: 絵 });
        出.push({ name: "資料" + f + ".pdf", mimeType: "application/pdf",
                  size: 1024, status: "ready", extractedText: "", ocrText: "",
                  pageCount: 頁数, ocr: 頁数, pageImages: pi });
      }
      return 出;
    };

    /* ── 送り口を 差し替える。数と 同時本数と 時間を 数える ── */
    const 元fetch = window.fetch;
    let 呼び = 0, いま = 0, 最大同時 = 0;
    const 枚ごと = [];
    window.fetch = function (u, o) {
      const url = String(u || "");
      if (url.indexOf("/api/scan/read") < 0) return 元fetch.apply(window, arguments);
      呼び++; いま++; 最大同時 = Math.max(最大同時, いま);
      let n = 0;
      try { n = (JSON.parse(o.body).images || []).length; } catch (e) { n = 0; }
      枚ごと.push(n);
      return new Promise((done) => setTimeout(() => {
        いま--;
        done({ status: 200, ok: true, json: () => Promise.resolve({ ok: true, text: "【p.1】読み取った 文字。" }) });
      }, ms));
    };

    /* ── ① 新しい 割りかた（本物の 実装を 走らせる）── */
    window.__vqMake.資料を入れる(作());
    const t0 = performance.now();
    const 読んだ = await window.__vqMake.絵を文字にする(function () {});
    const 新ms = performance.now() - t0;
    const 新 = { 呼び, 最大同時, 枚: 枚ごと.slice(), 読んだ: 読んだ, ms: Math.round(新ms) };

    /* ── ② 古い 割りかた（4 枚ずつ・3 本・資料ごとに 直列）を 同じ 模型で ── */
    呼び = 0; いま = 0; 最大同時 = 0; 枚ごと.length = 0;
    const 束 = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
    const 一回 = (b) => window.fetch(BASE0 + "/api/scan/read",
      { method: "POST", body: JSON.stringify({ images: b.map(() => 絵) }) })
      .then((x) => x.json()).then(() => "");
    const BASE0 = location.origin;
    const t1 = performance.now();
    const ら = 作();
    for (const f of ら) {                          /* ★ 資料ごとに 直列 */
      const bs = 束(f.pageImages, 4);              /* ★ 1 回 4 枚 */
      let 次 = 0;
      const 走 = () => (次 >= bs.length) ? Promise.resolve()
        : 一回(bs[次++]).then(走);
      const 本 = [];
      for (let k = 0; k < Math.min(3, bs.length); k++) 本.push(走());  /* ★ 3 本 */
      await Promise.all(本);
    }
    const 旧ms = performance.now() - t1;
    const 旧 = { 呼び, 最大同時, ms: Math.round(旧ms) };

    window.fetch = 元fetch;
    return { 新: 新, 旧: 旧, 全頁: 資料数 * 頁数 };
  }, { ms: 一回のミリ秒 });

  console.log("  読み取る ページ:", r.全頁, "（3 件 × 24 ページ）／ 1 回 " + 一回のミリ秒 + "ms の 模型");
  console.log("  旧: 呼び " + r.旧.呼び + " 回 ／ 同時 " + r.旧.最大同時 + " 本 ／ " + r.旧.ms + " ms");
  console.log("  新: 呼び " + r.新.呼び + " 回 ／ 同時 " + r.新.最大同時 + " 本 ／ " + r.新.ms + " ms");
  const 倍 = r.旧.ms / Math.max(1, r.新.ms);
  console.log("  ★ " + (Math.round(倍 * 100) / 100) + " 倍 速い");

  見(r.新.呼び === Math.ceil(r.全頁 / 8), "1 回に 8 ページ 送る（呼ぶ 回数が 半分）",
    { 新: r.新.呼び, 旧: r.旧.呼び });
  見(r.新.枚.every((n) => n <= 8), "1 回の 枚数は 向こうの 上限（8）を 超えない", r.新.枚.slice(0, 4));
  見(r.新.最大同時 === 6, "同時に 6 本 走る（前は 3 本）", { 新: r.新.最大同時, 旧: r.旧.最大同時 });
  見(r.新.読んだ === r.全頁, "★ ページを 1 枚も 落とさずに 読む", { 読んだ: r.新.読んだ, 全: r.全頁 });
  見(倍 >= 2, "★ 同じ 待ち時間の 模型で **2 倍 以上** 速い",
    { 旧ms: r.旧.ms, 新ms: r.新.ms, 倍: Math.round(倍 * 100) / 100 });
  /* ══ 資料を 回ごとに 分ける（同じ 箇所ばかりを 止める）══════════ */
  節("資料の 分けかた（毎回 別の ところを 渡す）");
  {
    const d = await page.evaluate(() => {
      /* 見分けの 付く 本文（1,000 段落。どこを 渡されたか 数えられる）。 */
      const 段 = [];
      for (let i = 1; i <= 1000; i++) 段.push("段落" + i + "：" + "あ".repeat(40));
      const 本文 = 段.join("\n\n");
      window.__vqMake.資料を入れる([{ name: "長い資料.pdf", mimeType: "application/pdf",
        size: 200000, status: "ready", extractedText: 本文, ocrText: "",
        pageCount: 40, ocr: 0, pageImages: null }]);
      const 出 = {};
      [1, 2, 4, 8].forEach((回) => {
        const 束 = window.__vqMake.渡す本文(回);
        出["回" + 回] = {
          数: 束.length,
          先頭: 束.map((x) => (/段落(\d+)/.exec(x) || [])[1] | 0),
          全長: 束.reduce((a, x) => a + x.length, 0),
          重なり: (function () {
            /* 同じ 段落が 2 つの かたまりに 入って いないか */
            const 見た = Object.create(null); let 重 = 0;
            束.forEach((x) => {
              const m = x.match(/段落(\d+)：/g) || [];
              m.forEach((y) => { if (見た[y]) 重++; 見た[y] = 1; });
            });
            return 重;
          })(),
          覆い: (function () {
            const 見た = Object.create(null);
            束.forEach((x) => (x.match(/段落(\d+)：/g) || []).forEach((y) => { 見た[y] = 1; }));
            return Object.keys(見た).length;
          })()
        };
      });
      return 出;
    });
    console.log("  1,000 段落の 資料を 何回に 分けるか:");
    Object.keys(d).forEach((k) => {
      console.log("   " + k + ": " + d[k].数 + " つ ／ 先頭の 段落 " + JSON.stringify(d[k].先頭)
        + " ／ 覆えた 段落 " + d[k].覆い + " ／ 重なり " + d[k].重なり);
    });
    見(d.回4.数 >= 4, "★ 4 回 頼むなら 4 つ 以上に 分ける（前は いつも 1 つ）", d.回4.数);
    見(d.回8.数 >= 8, "★ 8 回 なら 8 つ 以上", d.回8.数);
    見(d.回4.先頭.length === new Set(d.回4.先頭).size,
      "★ どの 回も 別の ところから 始まる（同じ 箇所が 続かない）", d.回4.先頭);
    見(d.回4.覆い === 1000, "★ 全部の 段落が どこかの 回に 入る（後ろが 残らない）", d.回4.覆い);
    見(d.回4.重なり === 0, "★ 同じ 段落を 2 回 渡さない", d.回4.重なり);
    /* 1 回でも、大きさの 上限（4 万字）を 超える 資料は その ぶんだけ 割れる。 */
    見(d.回1.数 >= 1 && d.回1.数 <= 2, "1 回なら 大きさの ぶんだけ（この 資料は 4.5 万字）", d.回1.数);
    見(d.回8.先頭.length === new Set(d.回8.先頭).size, "★ 8 回でも どの 回も 別の ところ", d.回8.先頭);
    見(d.回8.覆い === 1000 && d.回8.重なり === 0, "★ 8 回でも 全部 覆い、重ならない",
      { 覆い: d.回8.覆い, 重なり: d.回8.重なり });
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  await browser.close();
  console.log("\n" + "─".repeat(28));
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) { console.log("落ちたもの:"); 落ち.forEach((x) => console.log("  - " + x)); }
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("落ちました:", e && e.stack || e); process.exit(1); });
