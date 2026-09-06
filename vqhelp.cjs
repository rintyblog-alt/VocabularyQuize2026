#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqhelp.cjs — ヘルプ（2026-09-01・訴え）

   訴え:「アプリの ヘルプ画面を 大改造。アプリ内の 細かい 操作までを 全て
         **画像付き込みの ヘルプ記事**を ものすごく 大量に 作成して ほしい。
         スクショは 撮った 画像を 埋め込むだけ。操作手順に 使うため 実機の
         画像を 入れる ことで ユーザーに わかりやすく 伝わる。
         使い方から **表**とかも あったり、**番号で 手順**を 作ったり。
         **検索**も 追加すれば 関連記事を フェッチして 確認も できる。」

   直す前: ヘルプらしい ものは **1 つも 無かった**。
           起動の 案内を 閉じたら、二度と 出せなかった。

   見るもの:
     ① 開く／区分と 記事が 並ぶ
     ② 記事に **番号つきの 手順・表・実機の 絵** が ある
     ③ 絵は **本当に 出る**（行き先ちがいで 割れて いない）
     ④ 検索が 効く／本文からも 当たる／2 語で 絞れる
     ⑤ 記事の 下に **関連記事**（行き止まりを 作らない）
     ⑥ パンくずで 戻れる
     ⑦ スマホ: 横に はみ出さない・区分は 横に すべる・押すところ 44px
     ⑧ 左の 帯から 開ける

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqhelp.cjs
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
const 中 = (pg, f) => pg.evaluate((s) => {
  const h = document.getElementById("vqHelp");
  if (!h || !h.shadowRoot) return null;
  return new Function("sr", s)(h.shadowRoot);
}, f);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  const 絵 = []; pg.on("response", (r) => { if (/\/help\/img\//.test(r.url())) 絵.push({ u: r.url().split("/").pop(), s: r.status() }); });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqHelp && !!window.VQHELP, null, { timeout: 25000 });

  節("① 開く／区分と 記事");
  const n = await pg.evaluate(() => window.__vqHelp.記事数());
  見(n >= 80, "★★ **記事が たくさん ある**（80 件 以上）", n);
  await pg.evaluate(() => window.__vqHelp.open());
  await 待(400);
  const a = await 中(pg, `
    return { 開: document.getElementById("vqHelp").getAttribute("data-open") === "1",
             区分: sr.querySelectorAll(".side .cat").length,
             札: sr.querySelectorAll(".card").length,
             見出し: sr.querySelector(".h1") ? sr.querySelector(".h1").textContent : "",
             探す欄: !!sr.getElementById("hp-q") };`);
  見(a && a.開, "★★ **ヘルプが 開く**");
  見(a.区分 >= 12, "区分が 並ぶ（すべて＋12）", a.区分);
  見(a.札 >= 80, "★ 記事の 札が 並ぶ", a.札);
  見(a.探す欄, "探す 欄が ある");

  節("②③ 番号・表・実機の 絵");
  await pg.evaluate(() => window.__vqHelp.open({ id: "make-exam" }));
  await 待(700);
  const b = await 中(pg, `
    var art = sr.querySelector(".art");
    return { 手順: art.querySelectorAll("ol li").length,
             表: art.querySelectorAll("table").length,
             行: art.querySelectorAll("table tbody tr").length,
             絵: Array.prototype.map.call(art.querySelectorAll("img"), function(i){return i.getAttribute("src");}),
             注意: art.querySelectorAll(".note").length,
             見出し: sr.querySelector(".h1").textContent };`);
  見(b.手順 >= 5, "★★ **番号つきの 手順**が ある", b.手順);
  見(b.表 >= 1 && b.行 >= 4, "★★ **表**が ある", { 表: b.表, 行: b.行 });
  見(b.絵.length >= 3, "★★ **実機の 絵**が 埋まって いる", b.絵);
  見(b.絵.every((s) => /^\/help\/img\//.test(s)), "絵の 置き場が そろって いる", b.絵[0]);
  見(b.注意 >= 1, "気をつける ことが 出る", b.注意);
  await 待(900);
  const 割 = 絵.filter((x) => x.s >= 400);
  見(絵.length >= 3, "絵を 取りに 行った", 絵.length);
  見(割.length === 0, "★★ **絵が 1 枚も 割れて いない**（行き先ちがい なし）", 割);
  const c = await 中(pg, `
    var im = sr.querySelectorAll(".art img");
    var out = [];
    for (var i = 0; i < im.length; i++) out.push({ w: im[i].naturalWidth, h: im[i].naturalHeight });
    return out;`);
  見(c.length > 0 && c.every((x) => x.w > 100 && x.h > 100), "★★ **絵が 本当に 表示されて いる**", c);

  節("④ 検索");
  const d = await pg.evaluate(() => ({
    公開: window.__vqHelp.探す("公開"),
    スキャン: window.__vqHelp.探す("スキャン"),
    同期: window.__vqHelp.探す("同期"),
    本文だけ: window.__vqHelp.探す("イヤホン"),
    二語: window.__vqHelp.探す("試験 公開"),
    無い: window.__vqHelp.探す("ぬりかべ")
  }));
  見(d.公開.length >= 2 && d.公開.indexOf("preset-publish") >= 0, "★ 「公開」で 当たる", d.公開.slice(0, 4));
  見(d.スキャン.indexOf("scan-attach") >= 0, "★ 「スキャン」で 当たる", d.スキャン.slice(0, 3));
  見(d.同期.indexOf("sync-how") >= 0, "「同期」で 当たる", d.同期.slice(0, 3));
  見(d.本文だけ.length >= 1, "★★ **題に 無い 言葉でも 本文から 当たる**（イヤホン）", d.本文だけ);
  見(d.二語.length >= 1 && d.二語.length < d.公開.length,
    "★★ **2 語で 絞れる**（1 語より 減る）", { 一語: d.公開.length, 二語: d.二語.length });
  見(d.無い.length === 0, "無い ものは 0 件（でっち上げない）", d.無い);
  const e = await pg.evaluate(async () => {
    const sr = document.getElementById("vqHelp").shadowRoot;
    const q = sr.getElementById("hp-q");
    q.value = "スキャン";
    q.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((s) => setTimeout(s, 400));
    return { 件: sr.querySelectorAll(".hit").length,
             印: sr.querySelectorAll(".hit mark").length,
             見出し: sr.querySelector(".h1").textContent,
             まだ打てる: sr.activeElement === q || sr.getElementById("hp-q").value === "スキャン" };
  });
  見(e.件 >= 1, "★ 打つと その場で 出る", e.件);
  見(e.印 >= 1, "★ 当たった ところに 印が 付く", e.印);
  見(e.まだ打てる, "★ 打って いる 途中で 欄が 作り直されない", e.まだ打てる);

  節("⑤⑥ 関連記事と パンくず");
  await pg.evaluate(() => window.__vqHelp.open({ id: "scan-attach" }));
  await 待(500);
  const f = await 中(pg, `
    return { 関連: Array.prototype.map.call(sr.querySelectorAll(".see-i"), function(b){return b.textContent.trim();}),
             くず: Array.prototype.map.call(sr.querySelectorAll(".crumb button"), function(b){return b.textContent.trim();}) };`);
  見(f.関連.length >= 2, "★★ **関連記事が 出る**（行き止まりに しない）", f.関連);
  見(f.くず.length >= 2, "パンくずで 戻れる", f.くず);
  const g = await pg.evaluate(async () => {
    const sr = document.getElementById("vqHelp").shadowRoot;
    sr.querySelector(".see-i").click();
    await new Promise((s) => setTimeout(s, 300));
    const 今 = window.__vqHelp.状態();
    sr.querySelectorAll(".crumb button")[0].click();
    await new Promise((s) => setTimeout(s, 300));
    return { 移: 今.id, 戻: window.__vqHelp.状態().面 };
  });
  見(!!g.移 && g.移 !== "scan-attach", "★ 関連から 移れる", g.移);
  見(g.戻 === "top", "★ パンくずで 目次へ 戻れる", g.戻);

  節("⑦ スマホ（390px）");
  await pg.evaluate(() => window.__vqHelp.open({ id: "make-exam" }));
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(600);
  const h = await pg.evaluate(() => {
    const sr = document.getElementById("vqHelp").shadowRoot;
    const im = sr.querySelector(".art img");
    const tw = sr.querySelector(".tw");
    return {
      横: document.documentElement.scrollWidth > innerWidth + 1,
      側: getComputedStyle(sr.querySelector(".side")).display,
      チップ: sr.querySelectorAll(".chip").length,
      チップすべる: (() => { const c = sr.querySelector(".chips"); return c ? c.scrollWidth - c.clientWidth : -1; })(),
      絵幅: im ? Math.round(im.getBoundingClientRect().width) : 0,
      表はみ: tw ? tw.scrollWidth - tw.clientWidth : -1,
      閉じる: Math.round(sr.querySelector('[data-a="close"]').getBoundingClientRect().height)
    };
  });
  見(!h.横, "★★ **画面が 横に はみ出さない**", h.横);
  見(h.側 === "none", "★ 狭い ときは 横の 帯を たたむ", h.側);
  見(h.チップ >= 12 && h.チップすべる > 30, "★ 区分は 横に すべる 札に なる", { 数: h.チップ, はみ: h.チップすべる });
  見(h.絵幅 > 300 && h.絵幅 <= 390, "絵が 画面に 収まる", h.絵幅);
  見(h.表はみ >= 0, "★ 表は **その 中だけ** 横に すべる（画面は 動かさない）", h.表はみ);
  見(h.閉じる >= 36, "閉じるが 押せる 大きさ", h.閉じる);
  await pg.setViewportSize({ width: 1200, height: 900 });

  節("⑧ 左の 帯から 開ける");
  await pg.evaluate(() => window.__vqHelp.close());
  await 待(300);
  const i = await pg.evaluate(async () => {
    const 潜 = (r, d) => {
      if (!r || d > 6) return null;
      const 並 = r.querySelectorAll ? r.querySelectorAll("[data-fn]") : [];
      for (const e of 並) if (e.dataset.fn === "help") return e;
      const 全 = r.querySelectorAll ? r.querySelectorAll("*") : [];
      for (const e of 全) if (e.shadowRoot) { const f2 = 潜(e.shadowRoot, d + 1); if (f2) return f2; }
      return null;
    };
    const b = 潜(document, 0);
    if (!b) return { 有: false };
    b.click();
    await new Promise((s) => setTimeout(s, 400));
    return { 有: true, 開: window.__vqHelp.状態().開 };
  });
  見(i.有, "★ 左の 帯に「ヘルプ」が ある", i);
  見(i.有 && i.開, "★★ **押すと 開く**", i);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
