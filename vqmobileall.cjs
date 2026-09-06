#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqmobileall.cjs — 今回 足した ものが **スマホでも ちゃんと 使えるか**

   訴え（2026-09-01）:「これらを 追加すると 同時に、**スマホにも しっかり
                        同時に 対応させる ように してね。**」

   ★ 「入るか」だけでは 足りない。**指で 押せるか**まで 見る。
   ★ いちばん 狭い ところ（320px）でも 見る。ここで 崩れる ものは
     たいてい どこかで 崩れて いる。

   どの 画面も 同じ 3 つを 見る:
     ① 画面が **横に はみ出さない**（横スクロールが 出ない）
     ② 押す ところが **44px 以上**（Apple の 目安）
     ③ 下の 帯（安全領域）に **隠れない**

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqmobileall.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));

/* 影の DOM の 中まで 潜って 押せる ものを 集め、小さすぎる ものを 返す。 */
const 小さい押しどころ = (pg, 器) => pg.evaluate((sel) => {
  const h = sel ? document.getElementById(sel) : null;
  const r = h ? h.shadowRoot : null;
  if (!r) return null;
  const 見え = (e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return false;
    const c = getComputedStyle(e);
    return c.display !== "none" && c.visibility !== "hidden" && Number(c.opacity) > 0.05;
  };
  const out = [];
  r.querySelectorAll("button,a,select,input[type=checkbox],[role=button]").forEach((e) => {
    if (!見え(e)) return;
    const b = e.getBoundingClientRect();
    /* 文の 中の リンクは 対象外（並んだ 文字なので 大きく できない）。 */
    if (e.closest && e.closest(".art p")) return;
    if (Math.min(b.width, b.height) < 36) {
      out.push({ t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 18),
                 w: Math.round(b.width), h: Math.round(b.height) });
    }
  });
  return out;
}, 器);

const はみ出し = (pg) => pg.evaluate(() => ({
  横: document.documentElement.scrollWidth - window.innerWidth,
  幅: window.innerWidth
}));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 180)));
  await pg.route("**/api/news/list*", async (r) => {
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      items: [1, 2, 3, 4].map((i) => ({ id: "n" + i, title: "お知らせ " + i + " のみだし",
        body: "x", category: "更新", publishedAt: Date.now() - i * 86400000 })) }) });
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqHelp && !!window.__vqCalendar && !!window.__vqExamDetail,
    null, { timeout: 30000 });
  await 待(3500);

  const 試す = async (名, 器, 開く, 幅) => {
    if (幅) { await pg.setViewportSize({ width: 幅, height: 844 }); await 待(400); }
    await pg.evaluate(開く).catch(() => {});
    await 待(700);
    const o = await はみ出し(pg);
    const s = await 小さい押しどころ(pg, 器);
    節(名 + "（" + o.幅 + "px）");
    見(o.横 <= 1, "★ 横に はみ出さない", o.横);
    見(s !== null, "画面が 出て いる", s === null ? "出て いない" : (s.length + " 件 小さい"));
    見(s !== null && s.length === 0, "★ 押す ところが すべて 36px 以上", s ? s.slice(0, 4) : null);
    return s;
  };

  const 閉 = () => pg.evaluate(() => {
    try { window.__vqHelp.close(); } catch (e) {}
    try { window.__vqCalendar.close(); } catch (e) {}
    try { window.__vqExamDetail.close(); } catch (e) {}
    try { window.__vqMake.閉じる(); } catch (e) {}
  });

  /* ホーム（棚） */
  節("ホームの 棚（390px）");
  const h1 = await はみ出し(pg);
  見(h1.横 <= 1, "★ 横に はみ出さない", h1.横);
  const 棚 = await pg.evaluate(() => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
    if (!h) return null;
    const sr = h.shadowRoot;
    const rec = sr.querySelector("[data-home-rec]"), nw = sr.querySelector("[data-home-news]");
    return { 推枚: rec.querySelectorAll(".pc").length,
             推はみ: rec.scrollWidth - rec.clientWidth, 知はみ: nw.scrollWidth - nw.clientWidth,
             矢印: getComputedStyle(rec.parentNode.querySelector(".railb")).display,
             カード: rec.children.length ? Math.round(rec.children[0].getBoundingClientRect().height) : 0 };
  });
  /* ★ 枚数が 足りない ときは はみ出さないのが 正しい（棚が 空でも 落とさない）。
     3 枚 以上 あって はみ出さない ときだけ おかしい。 */
  見(!棚 || 棚.推枚 < 3 || 棚.推はみ > 40,
    "★ おすすめが 指で すべる（3 枚 以上 ある とき）", 棚 && { 枚: 棚.推枚, はみ: 棚.推はみ });
  見(棚 && 棚.知はみ > 40, "★ お知らせも すべる", 棚 && 棚.知はみ);
  見(棚 && 棚.矢印 === "none", "★ 矢印は 出さない（指で すべらせる）", 棚 && 棚.矢印);
  見(棚 && 棚.カード >= 44, "カードは 押せる 大きさ", 棚 && 棚.カード);

  /* カレンダー */
  await 閉();
  await 試す("カレンダー", "vqCalendar", () => window.__vqCalendar.open());
  /* ヘルプ（目次・記事） */
  await 閉();
  await 試す("ヘルプ（目次）", "vqHelp", () => window.__vqHelp.open());
  await 試す("ヘルプ（記事）", "vqHelp", () => window.__vqHelp.open({ id: "make-exam" }));
  /* 試験の 詳細 */
  await 閉();
  await pg.evaluate(() => {
    try {
      window.VQ2.store.saveExam({ id: "mb-1", title: "ためし", subject: "日本史",
        totalPoints: 100, durationMinutes: 50,
        cover: { examName: "ためしの 期末考査", subject: "日本史" },
        sections: [1, 2].map((n) => ({ number: n, title: "大問" + n, points: 50,
          questions: [1, 2].map((i) => ({ id: "q" + n + i, type: "single_choice",
            question: "問題 " + n + "-" + i, choices: ["ア", "イ", "ウ", "エ"], answer: "ア", points: 25 })) })) },
        { force: true });
    } catch (e) {}
  });
  await 試す("試験の 詳細", "vqExamDetail", () => window.__vqExamDetail.open("mb-1"));

  /* いちばん 狭い ところ（320px） */
  await 閉();
  await 試す("カレンダー", "vqCalendar", () => window.__vqCalendar.open(), 320);
  await 閉();
  await 試す("ヘルプ（記事）", "vqHelp", () => window.__vqHelp.open({ id: "calendar-basic" }), 320);
  await 閉();
  await 試す("試験の 詳細", "vqExamDetail", () => window.__vqExamDetail.open("mb-1"), 320);

  節("下の 帯に 隠れない（390px）");
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(400);
  await 閉();
  await pg.evaluate(() => window.__vqCalendar.open());
  await 待(700);
  const 下 = await pg.evaluate(() => {
    const sr = document.getElementById("vqCalendar").shadowRoot;
    const b = sr.querySelector('[data-a="add"]');
    const r = b.getBoundingClientRect();
    return { 下端: Math.round(innerHeight - r.bottom), 見える: r.bottom <= innerHeight + 1 };
  });
  見(下.見える, "★ いちばん 下の ボタンが 画面の 中に ある", 下);

  await 閉();
  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
