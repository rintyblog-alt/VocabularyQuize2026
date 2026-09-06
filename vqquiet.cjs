#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqquiet.cjs — 裏の 定期通信が **本当に 減るか** を 数えて 確かめる（2026-09-02）

   なぜ 要るか:
     2026-09-01 の 夜、本番が 351,226 回で 止まり 翌朝 9 時まで 全員が
     開けなく なった。原因は **開きっぱなしの タブ**。
     直したつもりでも、**数えないと 減ったか 分からない**（実際 朝の
     手当てだけでは 昼が 2,400〜2,900 回/時 のままだった）。

   見る こと:
     ① 裏に 回したら 止まる
     ② 2 枚 開いたら 叩くのは 1 枚だけ
     ③ 手が 止まったら 休む・触ったら 起きる
     ④ サーバの 関所が 効く（叩きすぎたら 429・でも 学ぶ道は 通る）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 200) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); } };
const 待 = (m) => new Promise((s) => setTimeout(s, m));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const pg = await ctx.newPage();
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqQuiet, null, { timeout: 30000 });

  節("① 仕掛けが 載って いる");
  const 有 = await pg.evaluate(() => ({
    ある: !!window.__vqQuiet,
    口: Object.keys(window.__vqQuiet || {}).filter((k) => k.indexOf("__") !== 0)
  }));
  見(有.ある, "★ vq-quiet が 読み込まれて いる", 有.口);

  節("② 裏に 回すと 止まる");
  const 裏 = await pg.evaluate(() => {
    const Q = window.__vqQuiet;
    Q.__触った();
    const 表 = Q.よいか({});
    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    const 裏 = Q.よいか({});
    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    return { 表, 裏 };
  });
  見(裏.表 === true && 裏.裏 === false, "★★ **裏の タブは 出さない**", 裏);

  節("③ 手が 止まったら 休む");
  const 暇 = await pg.evaluate(() => {
    const Q = window.__vqQuiet;
    Q.__放置();
    const 放置 = Q.よいか({});
    const 暇か = Q.暇か();
    Q.__触った();
    const 触った後 = Q.よいか({});
    return { 放置, 暇か, 触った後 };
  });
  見(暇.放置 === false && 暇.暇か === true, "★★ **手が 止まったら 休む**", 暇);
  見(暇.触った後 === true, "★ 触ったら すぐ 起きる", 暇.触った後);

  節("④ 2 枚 開いても 叩くのは 1 枚");
  const pg2 = await ctx.newPage();
  await pg2.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg2.waitForFunction(() => !!window.__vqQuiet, null, { timeout: 30000 });
  await 待(600);
  const 二枚 = await pg.evaluate(() => { window.__vqQuiet.__触った(); return window.__vqQuiet.よいか({}); });
  const 二枚b = await pg2.evaluate(() => { window.__vqQuiet.__触った(); return window.__vqQuiet.よいか({}); });
  見(!(二枚 && 二枚b), "★★ **2 枚 同時には 叩かない**（代表は 1 枚）", { 一枚目: 二枚, 二枚目: 二枚b });
  見(二枚 || 二枚b, "★ どちらか 1 枚は 叩く（両方 黙る と 届かない）", { 一枚目: 二枚, 二枚目: 二枚b });
  await pg2.close();

  節("⑤ サーバの 関所");
  const 関 = await pg.evaluate(async (BASE) => {
    const 出 = [];
    /* 上限は 30 回/分。超える ところまで 出す */
    for (let i = 0; i < 36; i++) {
      const r = await fetch(BASE + "/api/call/state", { cache: "no-store" }).catch(() => null);
      出.push(r ? r.status : 0);
    }
    /* 学ぶ 道は 止まらない か */
    const 学 = await fetch(BASE + "/api/public/config", { cache: "no-store" }).catch(() => null);
    return { 出, 学: 学 ? 学.status : 0 };
  }, BASE);
  const 止 = 関.出.filter((s) => s === 429).length;
  見(止 > 0, "★★ **叩きすぎたら 止める**（429 が 返る）", { 返事: 関.出, 止めた数: 止 });
  見(関.学 !== 429, "★★ **学ぶ 道は 止めない**", { config: 関.学 });

  節("⑥ 429 を 受けたら 自分から 休む");
  const 休 = await pg.evaluate(() => {
    const Q = window.__vqQuiet;
    const 前 = Q.待たされているか();
    Q.見る({ status: 429, headers: { get: () => "60" } });
    const 後 = Q.待たされているか();
    return { 前, 後 };
  });
  見(休.前 === false && 休.後 === true, "★ Retry-After を 見て 黙る", 休);

  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
