#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveworld.cjs — 世界観と 風景の 揃いを 数で 見る。

   訴え（2026-08-31）「ゲームの 世界観を つける」

   ★ 世界観は 文章なので **抜けても 気づけない**。
     「9 つの 風景には あるが 1 つだけ 無い」が いちばん 起きやすい。
     ここで **全部 揃っているか**を 機械が 数える。

   見るもの:
     ① 地方（REGIONS）が 難しさの 段（TIERS）と 1 対 1
     ② 風景 10 種 すべてに 色の 調整・床の 目地・曲が ある
     ③ 育ちの 段が 昇順で、XP から 正しく 引ける
     ④ 画面（読み込み・ロビー・結果）に 実際に 出ている

   使い方: node vqsurviveworld.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 180) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 300) : "")); }
};

/* ── 部品を そのまま 読む（画面を 立てずに 済む ぶん 速い）── */
const 根 = __dirname;
const tmp = path.join(os.tmpdir(), "vqsw-" + process.pid + ".mjs");
fs.writeFileSync(tmp, `
export * as W from "${根}/client/assets/vocabu-survive/data/world.js";
export { TIERS, COURSES } from "${根}/client/assets/vocabu-survive/data/courses.js";
export { THEMES, THEME_NAMES } from "${根}/client/assets/vocabu-survive/game/theme3d.js";
export { buildCourse } from "${根}/client/assets/vocabu-survive/game/course.js";
export { COURSE_BY_ID } from "${根}/client/assets/vocabu-survive/data/courses.js";
export { MOOD_KEYS, hasMood } from "${根}/client/assets/vocabu-survive/audio/audio.js";
`);
const out = path.join(os.tmpdir(), "vqsw-" + process.pid + ".bundle.mjs");
execFileSync("npx", ["esbuild", tmp, "--bundle", "--format=esm", "--outfile=" + out], { stdio: "pipe" });

(async () => {
  /* localStorage が 無い 場所でも 落ちない ことも ここで 見る。 */
  const M = await import("file://" + out);
  const W = M.W, TIERS = M.TIERS, THEMES = M.THEMES, THEME_NAMES = M.THEME_NAMES;

  節("① 地方と 難しさの 段");
  見(W.REGIONS.length === TIERS.length, "地方の 数が 段の 数と 同じ",
     { 地方: W.REGIONS.length, 段: TIERS.length });
  const 欠け = TIERS.filter((t) => !W.REGIONS.some((r) => r.key === t.key)).map((t) => t.key);
  見(欠け.length === 0, "★ すべての 段に 地方が ある", 欠け);
  const 迷子 = W.REGIONS.filter((r) => !TIERS.some((t) => t.key === r.key)).map((r) => r.key);
  見(迷子.length === 0, "段に 無い 地方が 無い", 迷子);
  見(W.REGIONS.every((r) => r.name && r.short && r.lore && r.hint),
     "地方に 名前・略称・由来・手引きが 揃っている");
  見(W.REGIONS.every((r) => r.lore.length >= 10 && r.lore.length <= 60),
     "由来は 1 行（10〜60 字）", W.REGIONS.map((r) => r.lore.length));

  節("② 風景 10 種の 揃い");
  見(THEME_NAMES.length === 10, "風景が 10 種", THEME_NAMES.length);
  const 調なし = THEME_NAMES.filter((k) => !THEMES[k].grade);
  見(調なし.length === 0, "★ すべての 風景に 色の 調整（grade）", 調なし);
  const 目地なし = THEME_NAMES.filter((k) => !THEMES[k].grid || THEMES[k].grid.length !== 4);
  見(目地なし.length === 0, "★ すべての 風景に 床の 目地（grid）", 目地なし);
  const 曲なし = THEME_NAMES.filter((k) => !M.hasMood(k));
  見(曲なし.length === 0, "★ すべての 風景に 曲がある", 曲なし);
  const 同じ調 = {};
  for (const k of THEME_NAMES) {
    const sig = JSON.stringify(THEMES[k].grade);
    (同じ調[sig] = 同じ調[sig] || []).push(k);
  }
  const 重なり = Object.values(同じ調).filter((a) => a.length > 1);
  見(重なり.length === 0, "★ 色の 調整が 風景ごとに 違う（使い回しが ない）", 重なり);

  節("②' 地方の 目印（landmark）");
  {
    /* ★ 目印は **1 つでも 抜けると その 風景だけ 場所の 名前が 無い**に なる。
       実際に コースを 組んで、飾りの 中に 大きな ものが 入るかを 数で 見る。 */
    const 抜け = [], 小さい = [];
    for (const id of ["c01", "c03", "c05", "c08", "c10", "c11", "c13", "c19", "c30"]) {
      const def = M.COURSE_BY_ID[id];
      if (!def) continue;
      const c = M.buildCourse(def);
      /* 目印は コースの 外（横 60m 以上）に ある 大きな もの。 */
      const 大 = c.decor.filter((d) => d.lm);
      if (!大.length) 抜け.push(id + "/" + def.theme);
      else {
        const 最大 = Math.max(...大.map((d) => Math.max(d.sx, d.sy, d.sz)));
        if (最大 < 16) 小さい.push(id + ":" + Math.round(最大));
      }
    }
    見(抜け.length === 0, "★ どの 風景にも 大きな 目印が 建つ", 抜け);
    見(小さい.length === 0, "目印が 遠くからも 見える 大きさ（16m 以上）", 小さい);

    /* 目印が コースの 上に かぶって いない ことも 見る（走りの 邪魔に なる）。 */
    const かぶり = [];
    for (const id of ["c01", "c13", "c30"]) {
      const def = M.COURSE_BY_ID[id];
      const c = M.buildCourse(def);
      for (const d of c.decor) {
        if (!d.lm) continue;
        const p = c.pointAt(c.progressOf(d.x, d.z));
        if (Math.abs(d.x - p.x) < 26) かぶり.push(id + " x=" + Math.round(d.x) + " 道=" + Math.round(p.x));
      }
    }
    見(かぶり.length === 0, "★ 目印が コースの 上に かぶって いない", かぶり.slice(0, 4));
  }

  節("③ 種の 育ち");
  const G = W.GROWTH;
  見(G.length >= 6, "段が 6 つ 以上", G.length);
  let 昇順 = true;
  for (let i = 1; i < G.length; i++) if (G[i].at <= G[i - 1].at) 昇順 = false;
  見(昇順, "★ 必要な XP が 昇順", G.map((g) => g.at));
  見(W.growthOf(0).stage.key === G[0].key, "0 XP は 最初の 段");
  見(W.growthOf(G[1].at).stage.key === G[1].key, "ちょうどの XP で 次の 段へ");
  見(W.growthOf(1e9).next === null, "いちばん 上では 次が 無い");
  const r = W.growthOf(Math.floor((G[1].at + G[2].at) / 2));
  見(r.ratio > 0 && r.ratio < 1, "途中の 進み具合が 0〜1", r.ratio);
  見(G[1].at <= 200, "最初の 段は すぐ 来る（1〜2 試合）", G[1].at);

  節("③' れんぞく（毎日 走った 日数）");
  {
    /* ★ 日付は **日本時間**。UTC で 数えると 朝 9 時に 日が 変わり、
       「昨日 走ったのに 切れた」に なる。時計を ずらして 確かめる。 */
    const 日 = 86400000;
    const 基 = Date.UTC(2026, 7, 31, 3, 0, 0);   /* JST 12:00 */
    見(W.今日(基) === "2026-08-31", "★ 日付は 日本時間で 数える", W.今日(基));
    /* JST の 深夜 0:30（= UTC 前日 15:30）も 同じ 日に なる */
    見(W.今日(Date.UTC(2026, 7, 30, 15, 30)) === "2026-08-31",
       "★ 日本の 深夜も その日 扱い（UTC で 数えない）", W.今日(Date.UTC(2026, 7, 30, 15, 30)));

    /* ★ node には 置き場が 無い。**見送らずに 作る**。
       見送ると 「日付の 数えかた」という いちばん 間違えやすい ところが
       一度も 試されない（実際 最初は 見送りに なって いた）。 */
    if (typeof globalThis.localStorage === "undefined") {
      const mem = Object.create(null);
      globalThis.localStorage = {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; }
      };
    }
    {
      try { localStorage.removeItem("vq.survive.streak.v1"); } catch (e) {}
      const a = W.touchStreak(基);
      見(a.n === 1 && a.初日 === true, "はじめて 走ったら 1 日目", a);
      const b = W.touchStreak(基 + 3600000);
      見(b.n === 1 && b.伸びた === false, "★ 同じ 日に 何回 走っても 1 日", b);
      const c = W.touchStreak(基 + 日);
      見(c.n === 2, "次の 日に 走ったら 2 日目", c);
      const d = W.touchStreak(基 + 日 * 3);
      見(d.n === 1, "★ 2 日 空いたら 1 から", d);
      見(d.best === 2, "★ 最高は 残る（積み上げた ものを 消さない）", d);
      const e = W.streak(基 + 日 * 3);
      見(e.今日 === true, "その日 走った ことが 分かる", e);
      const f = W.streak(基 + 日 * 9);
      見(f.n === 0 && f.best === 2, "しばらく 空くと 0 に 戻る（最高は 残る）", f);
      try { localStorage.removeItem("vq.survive.streak.v1"); } catch (e2) {}
    }
  }

  節("④ 画面に 出ているか");
  if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
    見(true, "本番なので 画面の 確かめは 見送り");
  } else {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const pg = await ctx.newPage();
    const 例外 = [];
    pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
    await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
      for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
        const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
    await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
    const 読 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const t = r.querySelector(".vs-load-tag");
      return t ? t.textContent : "";
    });
    見(読.indexOf("種") >= 0 && 読.indexOf("大樹") >= 0, "★ 読み込み画面に 世界の 一行", 読);
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
    await new Promise((s) => setTimeout(s, 1500));
    const ロ = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const t = r.querySelectorAll(".vs-lb-tier");
      return { 地方: r.querySelector(".vs-lb-pv-rg") ? r.querySelector(".vs-lb-pv-rg").textContent : "",
               由来: r.querySelector(".vs-lb-pv-lore") ? r.querySelector(".vs-lb-pv-lore").textContent : "",
               段の札: Array.from(t).map((x) => x.textContent) };
    });
    見(ロ.地方.length > 0, "★ 下見に 地方の 名前", ロ.地方);
    見(ロ.由来.length > 8, "★ 下見に 由来の 一行", ロ.由来);
    見(ロ.段の札.length === TIERS.length, "段の 札が 地方の 名前に なっている", ロ.段の札);
    見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 2));
    await browser.close();
  }

  try { fs.unlinkSync(tmp); fs.unlinkSync(out); } catch (e) {}
  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
