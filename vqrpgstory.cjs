#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqrpgstory.cjs — 物語を **最初から 最後まで** 実際に 通す。

   ★ 表の 上で「通れる」ことは vqrpgdata.cjs で 見た。
     ここでは **本物の 仕組みを 動かして**、36 節が 順に 済むかを 見る。
     どこかで 止まれば、そこが 誰もが 詰まる ところ。
   ★ 遊ぶ 人の 代わりに、節が 求める ことを その場で 満たす
     （素材を 入れる・敵を 倒す・行った ことに する）。
     これは「ずる」だが、**進行の 仕組みが 正しいか**を 見る のが 目的。

   使い方: node vqrpgstory.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
let ok = 0, ng = 0; const 落ち = [];
const 見 = (c, t, d) => { if (c) { ok++; } else { ng++; 落ち.push(t + (d !== undefined ? " → " + JSON.stringify(d) : "")); } };

(async () => {
  const 基 = "./client/assets/vocabu-survive/rpg/";
  const { Terrain } = await import(基 + "world/terrain.js");
  const { Inventory } = await import(基 + "sys/inventory.js");
  const { Build } = await import(基 + "sys/build.js");
  const { Combat } = await import(基 + "sys/combat.js");
  const { Quest } = await import(基 + "sys/quest.js");
  const { Craft } = await import(基 + "sys/craft.js");
  const { 全節 } = await import(基 + "data/story.js");
  const { ITEM } = await import(基 + "data/items.js");

  const t = new Terrain(20260902);
  /* ★ ここで 見るのは **物語の 筋**。持ちものの 枠（36）で 詰まると
     筋の 良し悪しが 分からなく なる ので、枠は 広く 取る。
     枠の 足りなさは 遊ぶ 側の 都合（たからばこに しまえる）。 */
  const inv = new Inventory(240);
  const build = new Build({ terrain: t, inventory: inv });
  const combat = new Combat({ terrain: t, seed: 1, inventory: inv, settings: {} });
  const quest = new Quest({ inventory: inv, build, combat });
  const craft = new Craft({ inventory: inv, build, quest });

  console.log("物語を 通します（" + 全節.length + " 節）\n");
  let 前 = -1, 回 = 0;
  const 経路 = [];
  while (!quest.終わった && quest.i < 全節.length && 回 < 400) {
    回++;
    const s = quest.節;
    if (!s) break;
    if (quest.i === 前) {
      /* 進まない → 詰まった */
      見(false, "節 " + s.id + "「" + s.題 + "」で 止まった", { 一行: quest.いまの一行(), 進み: quest.進み() });
      break;
    }
    前 = quest.i;
    const y = s.やる;
    /* 節が 求める ことを 満たす */
    if (y.型 === "集") for (const k in y.何) inv.add(k, y.何[k]);
    else if (y.型 === "作") { inv.add(y.何, y.数); quest.作った報告(y.何, y.数); }
    else if (y.型 === "建") {
      inv.add(y.何, y.数);
      /* 同じ ところへ 置くと 2 つ目から 断られる。節ごとに ずらす。 */
      for (let i = 0; i < y.数; i++) build.置く(y.何, (回 * 12) + i * 4, 5, 0, 0);
    } else if (y.型 === "倒") for (let i = 0; i < y.数; i++) quest.倒した報告(y.誰);
    else if (y.型 === "行") quest.行った報告(y.先);
    else if (y.型 === "言") for (let i = 0; i < y.数; i++) quest.言葉報告(true);
    /* ★ 「◯◯報告」の 中でも 進む ことが ある（作った報告 → 見る）。
       だから **見る() の 戻り値では なく、節が 進んだか**で 見る。 */
    quest.見る();
    const 進んだ = quest.i > 前;
    経路.push(quest.i + " " + s.題 + (進んだ ? "" : "  ★進まなかった"));
    if (!進んだ) { 見(false, "節 " + s.id + " が 済まない", { 進み: quest.進み(), 一行: quest.いまの一行() }); break; }
  }
  for (const l of 経路) console.log("  " + l);
  console.log("");
  見(quest.i >= 全節.length, "★★ **36 節 すべて 通った**", { 進んだ: quest.i, 全: 全節.length });
  見(quest.終わった, "★ 物語が 終わる", quest.終わった);
  見(combat.lv >= 10, "★ 段位が 上がる", { lv: combat.lv, exp: combat.exp });
  見(inv.used() > 0, "★ 礼が 手に 入って いる", inv.used());
  /* 礼が ちゃんと 入って いるか（いくつか 抜き取り） */
  見(inv.count("ougon_no_ha") >= 1, "★ 章の 礼（黄金の葉）が 入る", inv.count("ougon_no_ha"));
  見(inv.count("sekai_no_kakera") >= 1, "★ 最後の 礼（世界のかけら）が 入る", inv.count("sekai_no_kakera"));

  console.log("─".repeat(32));
  console.log("  ok " + ok + " / NG " + ng + "　段位 " + combat.lv + "　経験 " + combat.exp);
  if (ng) { for (const l of 落ち) console.log("   - " + l); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
