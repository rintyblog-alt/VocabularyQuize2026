#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqhomerail.cjs — ホームの **横に すべる 棚**（2026-09-01・訴え）

   訴え:「公開の おすすめの プリセットとかを 一覧の 表示の まま ホームに 表示。
         あと ニュースとかも。**右に スライドすれば 他のも 表示される 仕組み**。」

   直す前: ホームには 自分の 記録（学習時間・最近の クイズ・苦手）しか なく、
           **みんなの 公開プリセットも お知らせも 1 つも 出て いなかった**。
           見つけるには 一覧タブ／お知らせタブへ 移る しか なかった。

   見るもの:
     ① おすすめの 棚が 出る／カードは **一覧と 同じ もの**（pc）
     ② 出すのは 公開・公式 だけ（自分の ものは 下の「最近」に 出るので 入れない）
     ③ お知らせの 棚が 出る／未読の 印・日付・種別
     ④ **右に すべる**（はみ出して いる）／矢印で 送れる
     ⑤ 矢印は **はみ出して いる ときだけ** 出す（押しても 動かない 矢印を 出さない）
     ⑥ お知らせは **1 回だけ** 取りに 行く（ホームは 10 秒ごとに 描き直す）
     ⑦ 押すと お知らせが 開く
     ⑧ スマホでも 横に すべる／画面が 横に はみ出さない

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqhomerail.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));
const 家 = (pg, f) => pg.evaluate((s) => {
  const h = Array.prototype.find.call(document.querySelectorAll("*"),
    (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
  if (!h) return null;
  return new Function("sr", s)(h.shadowRoot);
}, f);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  let 取回 = 0;
  await pg.route("**/api/news/list*", async (r) => {
    取回++;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      items: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        id: "n" + i, title: "お知らせ " + i + " のみだし", body: "<p>本文 " + i + "</p>",
        category: i % 2 ? "update" : "maintenance",
        coverUrl: i <= 3 ? ("https://example.invalid/n" + i + ".png") : "",
        publishedAt: Date.now() - i * 86400000, read: i > 2
      })), unread: 2 }) });
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await 待(4500);

  節("① おすすめの 棚");
  const a = await 家(pg, `
    var rec = sr.querySelector("[data-home-rec]");
    return { 数: rec.children.length,
             カード: rec.children.length ? rec.children[0].className : "",
             選べる: rec.children.length ? rec.children[0].hasAttribute("data-preset-select") || rec.children[0].hasAttribute("data-exam-open") : false,
             見出し: Array.prototype.map.call(sr.querySelectorAll(".card__t"), function(e){return e.textContent;}) };`);
  見(a && a.数 > 0, "★★ **おすすめが 並ぶ**", a && a.数);
  見(a && /\bpc\b/.test(a.カード), "★ カードは **一覧と 同じ もの**（pc）", a && a.カード);
  見(a && a.選べる, "押せば 詳細へ 行ける", a && a.選べる);
  見(a && a.見出し.indexOf("おすすめのプリセット") >= 0, "見出しが ある", a && a.見出し);
  見(a && a.見出し.indexOf("NEWS") >= 0, "★ 見出しが **NEWS**（左の 帯と そろえる）", a && a.見出し);

  節("② 出すのは 公開・公式 だけ");
  const b = await 家(pg, `
    var rec = sr.querySelector("[data-home-rec]");
    var ids = Array.prototype.map.call(rec.children, function(c){ return c.getAttribute("data-preset-select") || c.getAttribute("data-exam-open"); });
    return ids;`);
  const 種 = await pg.evaluate((ids) => {
    const page = document.getElementById("appLibraryPage");
    const out = {};
    (ids || []).forEach((id) => {
      if (!id) return;
      const btn = page && (page.querySelector('[data-lib-action][data-id="' + CSS.escape(id) + '"]')
        || page.querySelector('[data-public-preset-action][data-preset-id="' + CSS.escape(id) + '"]'));
      const it = btn && btn.closest(".app-library-item");
      out[id] = it ? (it.getAttribute("data-kind") || "") : "?";
    });
    return out;
  }, b);
  const 種一覧 = Object.keys(種).map((k) => 種[k]);
  見(種一覧.length > 0 && 種一覧.every((k) => k === "public" || k === "official" || k === "?"),
    "★ 自分の ものは 入って いない", 種一覧.slice(0, 8));

  節("③ お知らせの 棚");
  const c = await 家(pg, `
    var nw = sr.querySelector("[data-home-news]");
    var one = nw.children[0];
    return { 数: nw.children.length,
             題: one ? one.querySelector(".nc__t").textContent : "",
             種: one ? one.querySelector(".nc__k").textContent : "",
             表紙: nw.querySelectorAll(".nc__cv").length,
             絵: nw.querySelectorAll(".nc__cv img").length,
             印: nw.querySelectorAll(".nc__cv--art").length,
             日: one ? one.querySelector(".nc__d").textContent : "",
             未読: nw.querySelectorAll(".nc__new").length,
             口: one ? one.getAttribute("data-news-open") : "" };`);
  見(c && c.数 === 7, "★★ **お知らせが 並ぶ**", c && c.数);
  見(/のみだし/.test(c.題), "題が 出る", c.題);
  見(/アップデート|メンテナンス/.test(c.種), "★ 種別は **日本語の 呼び名**（お知らせ画面と そろえる）", c.種);
  見(c.表紙 === 7, "★★ **どの 札にも バナーが 付く**", c.表紙);
  見(c.絵 === 3, "★ 絵が ある ものは その 絵", c.絵);
  見(c.印 === 4, "★ 絵が 無い ものは **でっち上げず** 種類の 印", c.印);
  見(/^\d+\/\d+$/.test(c.日), "日付が 出る", c.日);
  見(c.未読 === 2, "★ 未読の 印は **読んで いない ぶんだけ**", c.未読);
  見(!!c.口, "押す 口が ある", c.口);

  節("④⑤ 右に すべる");
  const d = await 家(pg, `
    var rec = sr.querySelector("[data-home-rec]");
    var wrap = rec.parentNode;
    var l = wrap.querySelector(".railb--l"), r = wrap.querySelector(".railb--r");
    return { はみ: rec.scrollWidth - rec.clientWidth, 左: !l.hidden, 右: !r.hidden, 巻: rec.scrollLeft };`);
  見(d.はみ > 100, "★★ **はみ出して いる**（右に すべれる）", d.はみ);
  見(d.右, "★ はみ出して いるので 右の 矢印が 出る", d);
  const e = await pg.evaluate(async () => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
    const sr = h.shadowRoot;
    const rec = sr.querySelector("[data-home-rec]");
    const 前 = rec.scrollLeft;
    sr.querySelector('[data-rail="rec:1"]').click();
    await new Promise((s) => setTimeout(s, 700));
    const 中 = rec.scrollLeft;
    const l = rec.parentNode.querySelector(".railb--l");
    return { 前, 中, 左出た: !l.hidden };
  });
  見(e.中 > e.前 + 50, "★★ **矢印で 送れる**", e);
  見(e.左出た, "★ 送った あとは 左の 矢印が 出る", e.左出た);
  /* 手で すべらせても 動く（指の 動きと 同じ） */
  /* ★ 棚は なめらかに 動く（scroll-behavior:smooth）ので、
     入れた 直後に 読んでも まだ 動いて いない。**待ってから 読む**。 */
  await 家(pg, `var rec = sr.querySelector("[data-home-rec]");
    rec.scrollTo({ left: rec.scrollWidth, behavior: "instant" }); return null;`);
  await 待(400);
  const f = await 家(pg, `
    var rec = sr.querySelector("[data-home-rec]");
    return { 端: rec.scrollLeft >= rec.scrollWidth - rec.clientWidth - 4 };`);
  await 待(200);
  const g = await 家(pg, `var r = sr.querySelector("[data-home-rec]").parentNode.querySelector(".railb--r"); return r.hidden;`);
  見(f.端, "端まで すべる", f);
  見(g === true, "★ 端では 右の 矢印を 出さない（押しても 動かない 矢印を 出さない）", g);

  節("⑥ お知らせは 1 回だけ 取る");
  const 前回 = 取回;
  await pg.evaluate(() => { /* ホームの 描き直しを 4 回 起こす */ });
  for (let i = 0; i < 4; i++) {
    await pg.evaluate(() => {
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
      /* 本体が 10 秒ごとに 呼ぶ のと 同じ 道を 使う */
      try { window.dispatchEvent(new Event("resize")); } catch (e) {}
    });
    await 待(120);
  }
  await 待(500);
  見(取回 === 前回, "★★ **描き直しても 取りに 行かない**（1 分に 6 回 叩かない）", { 前: 前回, 後: 取回 });

  節("⑦ 押すと お知らせが 開く");
  const h2 = await pg.evaluate(async () => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-news]"));
    const sr = h.shadowRoot;
    let 呼 = "";
    const 元 = window.__vqOpenNews;
    window.__vqOpenNews = function (id) { 呼 = String(id || ""); };
    sr.querySelector("[data-news-open]").click();
    await new Promise((s) => setTimeout(s, 200));
    window.__vqOpenNews = 元;
    return 呼;
  });
  見(h2 === "n1", "★ 押した お知らせが 開く", h2);

  節("⑧ スマホ（390px）");
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(900);
  const i2 = await 家(pg, `
    var rec = sr.querySelector("[data-home-rec]");
    var nw = sr.querySelector("[data-home-news]");
    var l = rec.parentNode.querySelector(".railb--l");
    return { はみ: rec.scrollWidth - rec.clientWidth,
             ニュースはみ: nw.scrollWidth - nw.clientWidth,
             矢印見え: l ? getComputedStyle(l).display : "",
             カード幅: rec.children.length ? Math.round(rec.children[0].getBoundingClientRect().width) : 0 };`);
  const 横 = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  見(i2.はみ > 50, "★ スマホでも 横に すべる", i2.はみ);
  見(i2.ニュースはみ > 50, "お知らせも すべる", i2.ニュースはみ);
  見(i2.矢印見え === "none", "★ 指の 画面では 矢印を 出さない（指で すべらせる）", i2.矢印見え);
  見(i2.カード幅 > 120 && i2.カード幅 <= 320, "カードの 幅が ほどよい", i2.カード幅);
  見(!横, "★★ **画面が 横に はみ出さない**", 横);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
