#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivetheme.cjs — **明るい 見た目でも 暗い 見た目でも** 読めるか。

   2026-08-31 の 朝 6 時、本体の 見た目が 自動で ライトへ 切り替わった とたん、
   それまで 通って いた 検査が 落ちた。**片方でしか 見て いなかった。**
   出た もの:
     ・透ける 板を 明暗の 計算が 読み落として いた（color-mix の 書き方）
     ・コース名が 立体の 上に 直に 置かれ 3.48:1
     ・観戦の 帯の うすい 灰が 3.63:1
     ・下見の 文字が 本体の 字の 色を 継ぎ、明るい 空の 上で 沈む
   同じ 見落としを 二度と しない ため に、**両方 まわして 数で 見る**。

   使い方: node vqsurvivetheme.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 190) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 300) : "")); }
};

/* 画面の 中で 使う 道具（明暗の 比を 出す）。 */
const 道具 = () => {
  /* rgb() と color(srgb ...) の 両方を 受ける。color-mix は 後者に なる。 */
  window.__解 = (c) => {
    const s = String(c || "");
    let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])];
    return null;
  };
  window.__重 = (上, 下) => [0, 1, 2].map((i) => 上[i] * 上[3] + 下[i] * (1 - 上[3])).concat([1]);
  window.__背 = (e, 地) => {
    let 下 = 地.slice(); const 鎖 = []; let x = e;
    while (x) { 鎖.push(x); x = (x.parentElement) || (x.getRootNode && x.getRootNode().host) || null; }
    for (let i = 鎖.length - 1; i >= 0; i--) {
      const c = window.__解(getComputedStyle(鎖[i]).backgroundColor);
      if (c && c[3] > 0) 下 = window.__重(c, 下);
    }
    return 下;
  };
  window.__比 = (sel, root, 地) => {
    const e = root.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e);
    const f0 = window.__解(cs.color) || [255, 255, 255, 1];
    const b = window.__背(e, 地 || [11, 16, 32, 1]);
    const f = f0[3] < 1 ? window.__重(f0, b) : f0;
    const L = (v) => { const a = [0, 1, 2].map((i) => { const x = v[i] / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
    const l1 = L(f), l2 = L(b);
    const 比 = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { 比: Math.round(比 * 100) / 100, 字: cs.color, 背: cs.backgroundColor,
             px: parseFloat(cs.fontSize) || 0 };
  };
};

/* 見る ところ。**遊びの 最中に 目に 入る もの**だけ。 */
const 走行の的 = [
  [".vs-hud-time", "時計"], [".vs-hud-rank-n", "順位"], [".vs-hud-course", "コース名"],
  [".vs-hud-cp", "中間"], [".vs-hud-nm", "名前"], [".vs-quiz-q", "問題"],
  [".vs-quiz-opt", "選択肢"], [".vs-quiz-key", "番号"], [".vs-spec-l", "観戦"]
];
/* ★ 下見の 帯（.vs-lb-preview）は ここでは 測れない。
   背景が **絵（gradient）**なので getComputedStyle の backgroundColor は 透明。
   下に 何が あるかを この 道具では 知れず、下の 白い 板を 地と して しまう。
   代わりに 「濃くする 1 枚が 背景に 入って いるか」を 別に 見る（下の ⑤）。 */
const ロビーの的 = [
  [".vs-lb-mode-l", "遊び方"],
  [".vs-lb-mode-d", "遊び方の 説明"], [".vs-lb-lab", "小見出し"],
  [".vs-lb-note", "添え書き"], [".vs-lb-jrn-lore", "そだちの 一言"],
  [".vs-lb-cc-nm", "コース名"], [".vs-lb-tier", "地方の 札"]
];

(async () => {
  console.log("測る先:", BASE);
  for (const 明暗 of ["light", "dark"]) {
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    const pg = await ctx.newPage();
    const 例外 = [];
    pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
    await pg.evaluate((m) => { document.documentElement.setAttribute("data-theme-mode", m); }, 明暗);
    await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
      for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
        const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
    await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
    await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
    await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
    await 待(1600);
    await pg.evaluate(道具);

    節((明暗 === "light" ? "明るい" : "暗い") + " 見た目 — ロビー");
    /* 下見と 一覧が 見える ように 窓を 開ける。 */
    await pg.evaluate(() => { const lb = window.VocabuSurvive.__app.shell.get("lobby"); lb._openPane("course"); });
    await 待(700);
    const ロ = await pg.evaluate((的) => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const 地 = window.__解(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
      const 出 = {};
      for (const [sel, 名] of 的) 出[名] = window.__比(sel, r, 地);
      return 出;
    }, ロビーの的);
    for (const [名, v] of Object.entries(ロ)) {
      if (!v) continue;
      /* 18px 以上（または 14px 太字）は 3:1 で 良い（WCAG の 大きい 文字）。 */
      const 要 = v.px >= 18 ? 3.0 : 4.5;
      見(v.比 >= 要, 明暗 + " ロビー: " + 名 + " が " + 要 + ":1 以上",
         { 比: v.比, px: v.px, 字: v.字 });
    }

    節((明暗 === "light" ? "明るい" : "暗い") + " 見た目 — 走っている 間");
    await pg.evaluate(() => { const lb = window.VocabuSurvive.__app.shell.get("lobby"); lb._openPane(""); });
    await 待(300);
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 90000 });
    await 待(4200);
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      ms.quiz.ask({ prompt: "abandon", tag: "ことばの 門", choices: ["見捨てる", "褒めたたえる", "たしかめる", "組み立てる"], answer: 0 }, 12);
      ms.hud.spectate("ミント", () => {}, () => {});
    });
    await 待(700);
    await pg.evaluate(道具);
    const 走 = await pg.evaluate((的) => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      /* 板は 立体の 上に 出る。地は **その 場面の 平均**では 測れないので、
         いちばん 厳しい 側（真っ白 と 真っ黒）の 両方で 見る。 */
      const 出 = {};
      for (const [sel, 名] of 的) {
        const w = window.__比(sel, r, [255, 255, 255, 1]);
        const b = window.__比(sel, r, [0, 0, 0, 1]);
        if (!w || !b) continue;
        出[名] = { 白地: w.比, 黒地: b.比, px: w.px, 字: w.字 };
      }
      return 出;
    }, 走行の的);
    for (const [名, v] of Object.entries(走)) {
      const 要 = v.px >= 18 ? 3.0 : 4.5;
      /* ★ 立体の 上に 出る ものは **どんな 絵の 上でも** 読めないと いけない。
         白い 地でも 黒い 地でも 足りる ことを 見る。 */
      見(Math.min(v.白地, v.黒地) >= 要,
         明暗 + " 走行: " + 名 + " が どんな 絵の 上でも " + 要 + ":1 以上", v);
    }
    節((明暗 === "light" ? "明るい" : "暗い") + " 見た目 — 下見の 帯（絵の 上の 文字）");
    {
      /* 絵の 上の 文字は **見た目に よらず 白**で、下を 濃くする 1 枚が
         背景に 入って いる ことを 見る（明暗の 比では 測れない ため）。 */
      const 帯 = await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        lb._openPane("course");
        const p = r.querySelector(".vs-lb-preview");
        const t = r.querySelector(".vs-lb-pv-nm");
        const c = r.querySelector(".vs-lb-pv-core");
        const out = { 背: p ? getComputedStyle(p).backgroundImage : "",
                      名: t ? getComputedStyle(t).color : "",
                      文: c ? getComputedStyle(c).color : "" };
        lb._openPane("");
        return out;
      });
      見(/linear-gradient/.test(帯.背) && (帯.背.match(/linear-gradient/g) || []).length >= 2,
        明暗 + ": 下見の 帯に **濃くする 1 枚**が 入っている", 帯.背.slice(0, 80));
      見(/255,\s*255,\s*255/.test(帯.名), 明暗 + ": 下見の 名前は 見た目に よらず 白", 帯.名);
      見(/255,\s*255,\s*255/.test(帯.文), 明暗 + ": 下見の 一言も 白", 帯.文);
    }

    見(例外.length === 0, 明暗 + ": 例外 0 件", 例外.slice(0, 3));
    await browser.close();
  }

  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
