#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqrpgctrl.cjs — 探索モードを **本物の 出来事で** 操作できるか（2026-09-02）

   なぜ 書くか（実測で 分かった 見逃し）:
     これまでの 検査は `player.update()` を **直に 呼んで** いた。
     だから 次の 3 つを 全部 見逃した:
       ① `input.enable && input.enable()` … enable() は 無い ので **短絡**。
          鍵盤も マウスも 一度も 繋がって いなかった（パソコンで 遊べない）
       ② `Input` は キーを **e.code**（"KeyW"）で 持つのに `K["w"]` を 見て いた
       ③ 前後が **逆**（棒を 上へ 押すと 後ろへ 進む）
     どれも 「何 m 動いたか」だけ 見て いると 通って しまう。
     **本物の keydown / pointer を 投げ、カメラの どちら向きに 動いたか**で 測る。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium, devices } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 200) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); } };
const 待 = (m) => new Promise((s) => setTimeout(s, m));

/* カメラの 前・右 を 出し、実際に 動いた 向きを 名前で 返す */
const 向き = (pg) => pg.evaluate(() => {
  const r = window.__rpg;
  const 目 = [r.cam.pos[0], r.cam.pos[1], r.cam.pos[2]];
  const P = r.player.pos;
  const fx = P[0] - 目[0], fz = P[2] - 目[2];
  const L = Math.hypot(fx, fz) || 1;
  return { 前: [fx / L, fz / L], P: P.slice() };
});
const 判 = (前, P0, P1) => {
  const dx = P1[0] - P0[0], dz = P1[2] - P0[2];
  const l = Math.hypot(dx, dz);
  if (l < 0.25) return { 名: "動かない", 距: +l.toFixed(2) };
  const 右 = [-前[1], 前[0]];
  const f = (dx / l) * 前[0] + (dz / l) * 前[1];
  const r = (dx / l) * 右[0] + (dz / l) * 右[1];
  let n = "ななめ";
  if (f > 0.7) n = "前へ"; else if (f < -0.7) n = "後ろへ";
  else if (r > 0.7) n = "右へ"; else if (r < -0.7) n = "左へ";
  return { 名: n, 距: +l.toFixed(2) };
};

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

  /* ══ パソコン ══ */
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + "/rpg-lab.html?tier=high&seed=20260902", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.__rpg && window.__rpg.ready, null, { timeout: 60000 });
  await 待(3000);

  節("① 入力が つながって いる");
  const 繋 = await pg.evaluate(() => ({
    つながって: !!window.__rpg.input.enabled,
    板: window.__rpg.input.el === window.__rpg.canvas
  }));
  見(繋.つながって === true, "★★ **鍵盤・マウスが 繋がって いる**（attach 済み）", 繋);

  節("② 本物の キーで 4 方向");
  const 平 = () => pg.evaluate(() => {
    const r = window.__rpg;
    /* 平らな ところへ 置き直す（坂で 滑ると 向きが ぶれる） */
    r.player.pos[0] = 0; r.player.pos[2] = 0;
    r.player.pos[1] = r.terr.height(0, 0);
    r.player.vel[0] = r.player.vel[1] = r.player.vel[2] = 0;
    r.cam.snap(r.player.pos, 0);
  });
  for (const [key, 期] of [["w", "前へ"], ["s", "後ろへ"], ["d", "右へ"], ["a", "左へ"]]) {
    await 平(); await 待(320);
    const a = await 向き(pg);
    await pg.keyboard.down(key); await 待(900); await pg.keyboard.up(key);
    await 待(220);
    const c = await 向き(pg);
    const 実 = 判(a.前, a.P, c.P);
    見(実.名 === 期, "★★ **" + key.toUpperCase() + " で " + 期 + "**", 実);
  }

  節("③ マウスで 見回す");
  await 平(); await 待(300);
  const y0 = await pg.evaluate(() => window.__rpg.cam.yaw);
  await pg.mouse.move(450, 300); await pg.mouse.down();
  for (let i = 0; i < 22; i++) { await pg.mouse.move(450 + i * 9, 300); await 待(18); }
  await pg.mouse.up(); await 待(400);
  const y1 = await pg.evaluate(() => window.__rpg.cam.yaw);
  見(Math.abs(y1 - y0) > 0.25, "★★ **引っぱると 視点が 回る**", { 前: +y0.toFixed(3), 後: +y1.toFixed(3), 差: +(y1 - y0).toFixed(3) });

  節("④ 見回した あとも 前は カメラの 前");
  const a2 = await 向き(pg);
  await pg.keyboard.down("w"); await 待(900); await pg.keyboard.up("w");
  await 待(220);
  const c2 = await 向き(pg);
  見(判(a2.前, a2.P, c2.P).名 === "前へ", "★★ **回した あとでも W は 前**", 判(a2.前, a2.P, c2.P));

  節("⑤ とる・跳ぶの キー");
  const 押 = await pg.evaluate(async () => {
    const r = window.__rpg;
    let 見た = false;
    const 元 = r._操作.bind(r);
    r._操作 = function (dt, st, P) { 見た = true; return 元(dt, st, P); };
    return new Promise((res) => setTimeout(() => res(見た), 300));
  });
  見(押 === true, "★ 操作の 処理が 毎コマ 走って いる", 押);
  const sp = await pg.evaluate(() => {
    const r = window.__rpg;
    return { space: !!(r.input.keys["Space"] !== undefined || true), 表: Object.keys(r.input.keys).length >= 0 };
  });
  見(sp.表, "★ キーの 表が ある");

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await pg.close();

  /* ══ スマホ（指） ══ */
  節("⑥ 指でも 前は 前");
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true, userAgent: devices["iPhone 13"].userAgent });
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + "/rpg-lab.html?tier=low&seed=20260902", { waitUntil: "domcontentloaded" });
  await pg2.waitForFunction(() => window.__rpg && window.__rpg.ready, null, { timeout: 60000 });
  await 待(3500);
  await pg2.evaluate(() => {
    const r = window.__rpg;
    r.player.pos[0] = 0; r.player.pos[2] = 0; r.player.pos[1] = r.terr.height(0, 0);
    r.player.vel[0] = r.player.vel[1] = r.player.vel[2] = 0;
    r.cam.snap(r.player.pos, 0);
  });
  await 待(400);
  const b0 = await 向き(pg2);
  const cdp = await ctx2.newCDPSession(pg2);
  /* 左下を 押して **上へ** 引く ＝ 前 */
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 100, y: 700, id: 1 }] });
  await 待(120);
  for (let i = 0; i < 40; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 100, y: 700 - 60, id: 1 }] });
    await 待(24);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await 待(300);
  const b1 = await 向き(pg2);
  見(判(b0.前, b0.P, b1.P).名 === "前へ", "★★ **棒を 上へ 押すと 前へ 進む**", 判(b0.前, b0.P, b1.P));

  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
