#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqrpgmobile.cjs — 探索モードを **指で 遊べるか**（2026-09-02）

   これを 書いた 理由:
     実機の 大きさで 触って みたら、**棒が 出ず 1mm も 動けなかった**。
     原因は 2 つ。どちらも 画面を 見る だけでは 分からない:
       ① `touch.show()` を 引数なしで 呼んで いた（visible = !!undefined = false）
       ② 指の 操作盤の CSS（TOUCH_CSS）を 探索の CSS に 入れて いなかった
          → 盤が 高さ 57px の ただの 箱に なる
     どちらも 「絵は 出て いる」ので、目では 気づけない。**触って 測る**。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium, devices } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 200) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); } };
const 待 = (m) => new Promise((s) => setTimeout(s, m));

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true, userAgent: devices["iPhone 13"].userAgent });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + "/rpg-lab.html?tier=low&seed=20260902", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.__rpg && window.__rpg.ready, null, { timeout: 60000 });
  await 待(3500);

  節("① 指の 操作盤");
  const 盤 = await pg.evaluate(() => {
    const r = window.__rpg, t = r.touch;
    if (!t) return { なし: true };
    const rc = t.el.getBoundingClientRect();
    const cs = getComputedStyle(t.el);
    return { visible: t.visible, 幅: Math.round(rc.width), 高: Math.round(rc.height),
      画面: [innerWidth, innerHeight], disp: cs.display, z: cs.zIndex,
      is_touch: r.el.classList.contains("is-touch") };
  });
  見(!盤.なし, "★ 操作盤が ある", 盤);
  見(盤.visible === true, "★★ **操作盤が 効いて いる**（show(true)）", 盤.visible);
  見(盤.高 > 700, "★★ **画面いっぱいに 広がって いる**（CSS が 効いて いる）", 盤.高 + "px / 画面 " + 盤.画面[1]);

  節("② 棒で 歩ける");
  const cdp = await ctx.newCDPSession(pg);
  const 前 = await pg.evaluate(() => window.__rpg.player.pos.slice());
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 110, y: 700, id: 1 }] });
  await 待(120);
  for (let i = 0; i < 40; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 110 + i * 1.2, y: 700 - 60, id: 1 }] });
    await 待(28);
  }
  const 走 = await pg.evaluate(() => ({
    軸: { x: +window.__rpg.input.axis.x.toFixed(2), y: +window.__rpg.input.axis.y.toFixed(2) },
    速: +window.__rpg.player.speed.toFixed(2),
    棒: window.__rpg.touch.stick.getAttribute("data-on") === "1"
  }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await 待(200);
  const 後 = await pg.evaluate(() => window.__rpg.player.pos.slice());
  const 動 = Math.hypot(後[0] - 前[0], 後[2] - 前[2]);
  見(走.棒 === true, "★ 触った ところに 棒が 出る", 走.棒);
  見(Math.hypot(走.軸.x, 走.軸.y) > 0.4, "★★ **棒が 傾きを 返す**", 走.軸);
  見(動 > 4, "★★ **指だけで 歩ける**", 動.toFixed(1) + "m");
  const 止 = await pg.evaluate(() => ({ 軸: window.__rpg.input.axis.x + window.__rpg.input.axis.y }));
  見(止.軸 === 0, "★ 指を 離すと 止まる", 止.軸);

  節("③ ボタンが 重なって いない");
  const 重 = await pg.evaluate(() => {
    const r = window.__rpg;
    const 取 = (sel) => { const e = r.el.querySelector(sel); if (!e) return null;
      const b = e.getBoundingClientRect();
      if (getComputedStyle(e).display === "none") return null;
      return { s: sel, x: b.x, y: b.y, w: b.width, h: b.height }; };
    const 一覧 = [".rh-act", ".vs-tbtn-jump", ".vs-tbtn-dive"].map(取).filter(Boolean)
      .concat([...r.el.querySelectorAll(".rh-tab")].map((e) => {
        const b = e.getBoundingClientRect(); return { s: ".rh-tab:" + e.textContent, x: b.x, y: b.y, w: b.width, h: b.height };
      }));
    const 当 = [];
    for (let i = 0; i < 一覧.length; i++) for (let j = i + 1; j < 一覧.length; j++) {
      const a = 一覧[i], c = 一覧[j];
      const ix = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
      const iy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
      if (ix * iy > 120) 当.push([a.s, c.s, Math.round(ix * iy)]);
    }
    const 小 = 一覧.filter((e) => e.w < 40 || e.h < 40).map((e) => e.s + " " + Math.round(e.w) + "x" + Math.round(e.h));
    return { 数: 一覧.length, 当, 小, 一覧: 一覧.map((e) => e.s) };
  });
  見(重.当.length === 0, "★★ **押す ところが 重なって いない**", 重.当);
  見(重.小.length === 0, "★ どの ボタンも 40px 以上", 重.小);

  節("④ 横に はみ出さない");
  const はみ = await pg.evaluate(() => ({
    体: document.body.scrollWidth, 窓: innerWidth,
    根: window.__rpg.el.scrollWidth
  }));
  見(はみ.体 <= はみ.窓 + 1 && はみ.根 <= はみ.窓 + 1, "★ 横に はみ出さない", はみ);

  節("⑤ 窓を 開いても 触れる");
  const 窓 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.add("ki", 5);
    r.hud.開く("inv");
    await new Promise((s) => setTimeout(s, 300));
    const p = r.hud.paneEl.getBoundingClientRect();
    const 出 = p.width > 0 && p.height > 0 && p.right <= innerWidth + 1 && p.bottom <= innerHeight + 1;
    const 押 = [...r.hud.paneEl.querySelectorAll("button")].map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0 && (b.width < 40 || b.height < 40)).length;
    r.hud.開く("");
    return { 出, 押, 幅: Math.round(p.width), 高: Math.round(p.height) };
  });
  見(窓.出 === true, "★ 窓が 画面に 収まる", 窓);
  見(窓.押 === 0, "★ 窓の ボタンも 40px 以上", 窓.押);

  節("⑥ 言葉の 問い・話す の 窓");
  const 問 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.words.出す();
    await new Promise((s) => setTimeout(s, 400));
    const q = r.hud.qzEl.getBoundingClientRect();
    const 小 = [...r.hud.qzEl.querySelectorAll("button")].map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height < 40).length;
    const 収 = q.width > 0 && q.right <= innerWidth + 1 && q.left >= -1;
    /* 下の ボタンと 重なって いないか */
    const act = r.el.querySelector(".rh-act").getBoundingClientRect();
    const iy = Math.max(0, Math.min(q.bottom, act.bottom) - Math.max(q.top, act.top));
    const ix = Math.max(0, Math.min(q.right, act.right) - Math.max(q.left, act.left));
    r.words.やめる && r.words.やめる();
    r.hud.問を消す();
    return { 収, 小, 重: Math.round(ix * iy), 幅: Math.round(q.width) };
  });
  見(問.収 === true, "★ 言葉の 問いが 画面に 収まる", 問);
  見(問.小 === 0, "★ 答えの ボタンが 40px 以上", 問.小);
  見(問.重 < 120, "★ 「とる」に かぶらない", 問.重);

  節("⑦ 横向き（844×390）");
  await pg.setViewportSize({ width: 844, height: 390 });
  await 待(1600);
  const 横 = await pg.evaluate(() => {
    const r = window.__rpg;
    const 取 = (sel) => { const e = r.el.querySelector(sel); if (!e) return null;
      if (getComputedStyle(e).display === "none") return null;
      const b = e.getBoundingClientRect(); return { s: sel, x: b.x, y: b.y, w: b.width, h: b.height }; };
    const 一覧 = [".rh-act", ".vs-tbtn-jump"].map(取).filter(Boolean)
      .concat([...r.el.querySelectorAll(".rh-tab")].map((e) => {
        const b = e.getBoundingClientRect(); return { s: "tab", x: b.x, y: b.y, w: b.width, h: b.height }; }));
    let 当 = 0;
    for (let i = 0; i < 一覧.length; i++) for (let j = i + 1; j < 一覧.length; j++) {
      const a = 一覧[i], c = 一覧[j];
      const ix = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
      const iy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
      if (ix * iy > 120) 当++;
    }
    const 外 = 一覧.filter((e) => e.x < -1 || e.y < -1 || e.x + e.w > innerWidth + 1 || e.y + e.h > innerHeight + 1).map((e) => e.s);
    return { 数: 一覧.length, 当, 外, 板: [r.canvas.width, r.canvas.height] };
  });
  見(横.当 === 0, "★ 横向きでも 重ならない", 横.当);
  見(横.外.length === 0, "★ 横向きでも 画面の 外へ 出ない", 横.外);
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(1200);

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await pg.screenshot({ path: (process.env.OUT || ".") + "/rpg-mobile.png" });
  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
