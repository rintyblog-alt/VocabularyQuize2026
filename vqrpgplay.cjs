#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqrpgplay.cjs — 探索モードを **一本 通して 遊ぶ**（2026-09-02）

   1 つ 1 つの 部品は 別の 検査で 見て いる。ここで 見たいのは
   **つながり**: 集める → 作る → 建てる → しまう → 戦う → 買う → 続きから。
   つなぎ目は 部品の 検査では 落ちない（実際 会話の 窓と 死んだ ときの
   落ちかたは、通して 遊んで はじめて 出た）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 220) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 320) : "")); } };
const 待 = (m) => new Promise((s) => setTimeout(s, m));

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  const err = []; pg.on("console", (m) => { if (m.type() === "error") err.push(m.text().slice(0, 200)); });
  const 種 = 20260902;
  await pg.goto(BASE + "/rpg-lab.html?tier=high&seed=" + 種, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.__rpg && window.__rpg.ready, null, { timeout: 60000 });
  await 待(3000);

  節("① 集める → 作る");
  const 一 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.slots = new Array(r.inv.n).fill(null);
    /* 近くの 実りを 20 回 とる */
    let 取 = 0;
    for (let i = 0; i < 400 && 取 < 20; i++) {
      const g = r.gather.近くの ? null : null;
      if (r.狙い) { const before = r.inv.used(); r._tapAct = true;
        await new Promise((s) => setTimeout(s, 40));
        if (r.inv.used() > before) 取++;
      } else {
        r.player.pos[0] += (Math.random() - 0.5) * 8;
        r.player.pos[2] += (Math.random() - 0.5) * 8;
        r.player.pos[1] = r.terr.height(r.player.pos[0], r.player.pos[2]);
        await new Promise((s) => setTimeout(s, 40));
      }
    }
    /* ★ craft.作る は **レシピ id ＋ 立って いる 場所**（実測で 分かった）。
       もの の id を 渡すと 「その 作りかたが ありません」に なる。 */
    const R = await import("/assets/vocabu-survive/rpg/data/recipes.js");
    window.__レシピ = (出) => { const v = R.RECIPES.find((x) => x.出 === 出); return v ? v.id : ""; };
    r.inv.add("ki", 20); r.inv.add("ishi", 20); r.inv.add("eda", 20); r.inv.add("kusa", 20);
    const P = r.player.pos;
    const 場 = r.build.使える場(P[0], P[2]);
    const r1 = r.craft.作る(window.__レシピ("himo"), P[0], P[2]);
    const r2 = r.craft.作る(window.__レシピ("ki_axe"), P[0], P[2]);
    return { 取, 場, ひも: r1, おの: r2, 持: r.inv.used() };
  });
  見(一.取 >= 3, "★ 世界の ものを とれる", 一.取 + " 回");
  見(一.ひも && 一.ひも.ok, "★★ **手で 作れる**", 一.ひも);
  見(一.おの && 一.おの.ok === false, "★ 台が 要る ものは 手では 作れない", 一.おの.訳);

  節("② 作業台 → 道具 → 建てる");
  const 二 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.add("ita", 20); r.inv.add("himo", 10); r.inv.add("ki", 20);
    const P0 = r.player.pos;
    const bench = r.craft.作る(window.__レシピ("b_bench"), P0[0], P0[2]);
    r.建てるか = true; r.置くもの = "b_bench";
    r._tapAct = true;
    await new Promise((s) => setTimeout(s, 400));
    r.建てるか = false;
    const P1 = r.player.pos;
    const 場 = r.build.使える場(P1[0], P1[2]);
    const おの = r.craft.作る(window.__レシピ("ki_axe"), P1[0], P1[2]);
    r.inv.wear("ki_axe");
    return { bench, 場, おの, 装: r.inv.status(), 建数: r.build.数() };
  });
  見(二.bench && 二.bench.ok, "★ 作業台を 作れる", 二.bench);
  見(二.建数 >= 1, "★★ **建てた ものが 残る**", 二.建数 + " 個");
  見(二.場 && 二.場.台 === true, "★ そばに 立つと 台が 使える", 二.場);
  見(二.おの && 二.おの.ok, "★★ **台で 道具が 作れる**", 二.おの);
    /* ★ 木の おのの 効きは ちょうど 1.0（段の 表のとおり）。
     「1 より 大きい」で 見ると 木では 必ず 落ちる。見るのは **型が 入るか**。 */
  見(二.装 && 二.装.道具型 === "axe", "★ 道具を 身に つけると 型が 入る", 二.装);

  節("③ たからばこに しまう → 出す");
  const 三 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.add("ki", 40); r.inv.add("ita", 20); r.inv.add("himo", 10);
    const P2 = r.player.pos;
    const c = r.craft.作る(window.__レシピ("b_chest"), P2[0], P2[2]);
    r.建てるか = true; r.置くもの = "b_chest";
    r.player.pos[0] += 6;
    r._tapAct = true;
    await new Promise((s) => setTimeout(s, 400));
    r.建てるか = false;
    await new Promise((s) => setTimeout(s, 500));
    const 箱 = r.近くの設備 && r.近くの設備.箱 ? r.近くの設備 : null;
    if (!箱) return { 作: c, 箱なし: true };
    const 前 = r.inv.count("ki");
    const 入 = r.build.箱に入れる(箱, "ki", 10);
    const 中 = r.inv.count("ki");
    const 出 = r.build.箱から出す(箱, "ki", 10);
    return { 作: c, 前, 中, 後: r.inv.count("ki"), 入, 出, 箱中: (箱.箱 || []).length };
  });
  見(三.作 && 三.作.ok, "★ たからばこを 作れる", 三.作);
  見(!三.箱なし, "★ 建てた たからばこが 使える", !三.箱なし);
  見(三.中 === 三.前 - 10, "★★ **しまうと 手から 減る**", { 前: 三.前, 中: 三.中 });
  見(三.後 === 三.前, "★★ **出すと 戻る**", { 中: 三.中, 後: 三.後 });

  節("④ はたけ … 蒔く → 育つ → 採る");
  const 四 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.add("ki", 20); r.inv.add("doro", 10); r.inv.add("s_kusa", 4);
    const P3 = r.player.pos;
    const f = r.craft.作る(window.__レシピ("b_farm"), P3[0], P3[2]);
    r.建てるか = true; r.置くもの = "b_farm";
    r.player.pos[0] += 6;
    r._tapAct = true;
    await new Promise((s) => setTimeout(s, 400));
    r.建てるか = false;
    await new Promise((s) => setTimeout(s, 500));
    const 畑 = r.近くの設備 && r.近くの設備.畑 ? r.近くの設備 : null;
    if (!畑) return { 作: f, 畑なし: true };
    const 蒔 = r.build.蒔く(畑, "s_kusa", Date.now());
    const 育0 = r.build.育ち(畑, Date.now());
    const 育1 = r.build.育ち(畑, Date.now() + 1000 * 60 * 60 * 24);
    const 採 = r.build.採る(畑, Date.now() + 1000 * 60 * 60 * 24);
    return { 作: f, 蒔, 育0: +育0.toFixed(2), 育1: +育1.toFixed(2), 採 };
  });
  見(四.作 && 四.作.ok, "★ はたけを 作れる", 四.作);
  見(四.蒔 && 四.蒔.ok, "★★ **たねを 蒔ける**", 四.蒔);
  見(四.育0 < 0.2 && 四.育1 >= 1, "★ 時間で 育つ", { いま: 四.育0, 一日後: 四.育1 });
  見(四.採 && 四.採.ok, "★★ **育ったら 採れる**", 四.採);

  節("⑤ 戦う … ことばの 力");
  const 五 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.inv.add("tetsu_sword", 1); r.inv.wear("tetsu_sword");
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    const E = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    /* ★ 弱い 相手だと **1 発目で 倒れて** 2 発目が {当:false,与:0} に なる。
       ことばの 力を 比べる ときは 硬い 相手を 使う（実測で 一度 誤判定した）。 */
    const id = E.ENEMY_IDS.filter((i) => !E.ENEMIES[i].主)
      .sort((a, b) => E.ENEMIES[b].hp - E.ENEMIES[a].hp)[0];
    r.combat.list.length = 0;
    const e = new C.Enemy(E.ENEMIES[id], r.player.pos[0] + 1.2, r.player.pos[1], r.player.pos[2]);
    r.combat.list.push(e);
    const st = r.inv.status();
    const 前経 = r.combat.exp;
    r.combat.力 = 0;
    /* ばらつきが ある ので 何度か 打って 平均で 比べる */
    let 和1 = 0; for (let i = 0; i < 8; i++) 和1 += r.combat.攻める(e, st.攻, false).与;
    const 普 = 和1 / 8;
    e.hp = e.maxHp;
    r.combat.力 = 100;
    const 力 = r.combat.攻める(e, st.攻, true);
    /* 倒すまで */
    let n = 0;
    while (!e.dead && n++ < 400) r.combat.攻める(e, st.攻, false);
    return { 普: Math.round(普), 力: 力.与, 力残: r.combat.力, 倒: e.dead,
             経: r.combat.exp - 前経, 倒数: r.combat.倒した, 種: r.倒した種.size, 相手: E.ENEMIES[id].名 };
  });
  見(五.普 > 0, "★ 素直に 当たる", { 与: 五.普, 相手: 五.相手 });
  見(五.力 > 五.普 * 1.4, "★★ **ことばの 力で 一撃が 大きく なる**", { 普: 五.普, 力: 五.力 });
  見(五.力残 === 60, "★ 力を 40 使う", 五.力残);
  見(五.倒 === true && 五.経 > 0, "★★ **倒すと 経験が 入る**", { 倒: 五.倒, 経: 五.経 });
  見(五.種 >= 1, "★ ずかんに 載る", 五.種);

  節("⑥ 町で 買う・売る");
  const 六 = await pg.evaluate(async () => {
    const r = window.__rpg;
    const t = r.terr.nearestTown(r.player.pos[0], r.player.pos[2]);
    if (!t) return { 町なし: true };
    const T = r.town.中身(t);
    const 店 = T.人.find((p) => p.品 && p.品.length);
    if (!店) return { 店なし: true };
    /* ★ 高い 品を 選ぶと 金が 足りずに 落ちる（実測: 古い地図 96 金）。
       持ち金を 多めに 入れ、**いちばん 安い 品**で 見る。 */
    r.inv.add("kin_ka", 400);
    const I = await import("/assets/vocabu-survive/rpg/data/items.js");
    const 品 = 店.品.slice().sort((a, c) => (I.ITEM[a] ? I.ITEM[a].値 : 999) - (I.ITEM[c] ? I.ITEM[c].値 : 999))[0];
    const 前金 = r.inv.count("kin_ka"), 前品 = r.inv.count(品);
    const 買 = r.town.買う(r.inv, 品, r.inv.count("kin_ka"));
    const 中金 = r.inv.count("kin_ka");
    r.inv.add("ki", 5);
    const 売 = r.town.売る(r.inv, "ki");
    return { 品, 買, 売, 前金, 中金, 後金: r.inv.count("kin_ka"), 前品, 後品: r.inv.count(品) };
  });
  見(!六.町なし && !六.店なし, "★ 町に 店が ある", 六.品);
  見(六.買 && 六.買.ok, "★★ **買える**", 六.買);
  見(六.中金 < 六.前金 && 六.後品 > 六.前品, "★ 金が 減り、品が 増える", { 金: [六.前金, 六.中金], 品: [六.前品, 六.後品] });
  見(六.売 && 六.売.ok && 六.後金 > 六.中金, "★★ **売れる**", 六.売);

  節("⑦ しまう → 別の 世界 → 戻る");
  const 七 = await pg.evaluate(async (種) => {
    const r = window.__rpg;
    r.inv.add("shinju", 5);
    const 建 = r.build.数();
    const 見 = r.見つけた.size, 町 = r.行った町.size;
    await r._しまう();
    /* 別の 種で 入り直す（世界が 変わる） */
    await r.exit();
    await r.enter({ seed: 12345 });
    let n = 0; while (!r.ready && n++ < 400) await new Promise((s) => setTimeout(s, 50));
    await new Promise((s) => setTimeout(s, 1500));
    const 別 = { 名: r.worldName, 真珠: r.inv.count("shinju"), 建: r.build.数() };
    /* 元の 世界へ 戻る */
    await r.exit();
    await r.enter({ seed: 種 });
    n = 0; while (!r.ready && n++ < 400) await new Promise((s) => setTimeout(s, 50));
    await new Promise((s) => setTimeout(s, 1800));
    return { 前: { 建, 見, 町 }, 別,
      戻: { 名: r.worldName, 真珠: r.inv.count("shinju"), 建: r.build.数(),
            見: r.見つけた.size, 町: r.行った町.size } };
  }, 種);
  見(七.別.真珠 === 0, "★★ **別の 世界は 別の 持ちもの**", 七.別);
  見(七.戻.真珠 >= 5, "★★ **戻ると 持ちものが ある**", { 真珠: 七.戻.真珠 });
  見(七.戻.建 === 七.前.建, "★★ **建てた ものが 残って いる**", { 前: 七.前.建, 後: 七.戻.建 });
  見(七.戻.見 >= 七.前.見, "★ ずかんも 残る", { 前: 七.前.見, 後: 七.戻.見 });

  const 目立つ = err.filter((x) => !/ERR_CONNECTION_REFUSED|Failed to load resource|503|404/.test(x));
  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  見(目立つ.length === 0, "error 0 件", 目立つ.slice(0, 3));
  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
