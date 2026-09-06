#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqrpgdata.cjs — 探索モードの **表**を 机の上で 確かめる（ブラウザ不要・速い）。

   見るもの:
     ① もの・作りかた・敵・物語 の 数
     ② **手に 入らない ものが 無いか**（採れる／落とす／作れる の どれか）
     ③ **物語が 最後まで 通るか**（1 節でも 詰まると 誰もが そこで 止まる）
     ④ 表どうしの 食い違い（風土が 呼ぶ 敵が 居ない 等）

   使い方: node vqrpgdata.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
let ok = 0, ng = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 220) : "")); }
  else { ng++; 落ち.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); } };

(async () => {
  const 基 = "./client/assets/vocabu-survive/rpg/";
  const I = await import(基 + "data/items.js");
  const R = await import(基 + "data/recipes.js");
  const E = await import(基 + "data/enemies.js");
  const S = await import(基 + "data/story.js");
  const B = await import("./client/assets/vocabu-survive/rpg/world/biome.js");
  const F = await import("./client/assets/vocabu-survive/rpg/sys/fishing.js");
  const T = await import("./client/assets/vocabu-survive/rpg/world/terrain.js");

  節("① 数");
  const c = I.かぞえる();
  console.log("  " + Object.entries(c).map(([k, v]) => I.種類名[k] + " " + v).join(" / "));
  見(I.ITEM_IDS.length >= 300, "★★ **もの 300 種 以上**", I.ITEM_IDS.length);
  見(R.RECIPES.length >= 250, "★★ **作りかた 250 通り 以上**", R.RECIPES.length);
  見(E.ENEMY_IDS.length >= 25, "★ 敵 25 種 以上", E.ENEMY_IDS.length);
  見(B.BIOME_IDS.length >= 8, "★ 風土 8 種 以上", B.BIOME_IDS.length);
  見(S.全節.length >= 30, "★★ **物語 30 節 以上**", { 章: S.CHAPTERS.length, 節: S.全節.length });

  節("② 表どうしの つながり");
  const 無 = [];
  for (const b of B.BIOME_IDS) {
    for (const i of B.BIOMES[b].取れる) if (!I.ITEM[i]) 無.push("風土 " + b + " が 採る " + i);
    for (const e of B.BIOMES[b].出る) if (!E.ENEMIES[e]) 無.push("風土 " + b + " に 出る " + e);
  }
  for (const k in E.ENEMIES) for (const d in E.ENEMIES[k].落) if (!I.ITEM[d]) 無.push("敵 " + k + " が 落とす " + d);
  for (const r of R.RECIPES) {
    if (!I.ITEM[r.出]) 無.push("作りかた " + r.id + " が 出す " + r.出);
    for (const m in r.材) if (!I.ITEM[m]) 無.push("作りかた " + r.id + " の 材 " + m);
  }
  for (const b in F.つれる) for (const [id] of F.つれる[b]) if (!I.ITEM[id]) 無.push("つり " + b + " の " + id);
  見(無.length === 0, "★★ **表に 無い ものを 呼んで いない**", 無.slice(0, 6));

  節("③ 手に 入るか");
  const 採 = new Set(); for (const b of B.BIOME_IDS) for (const i of B.BIOMES[b].取れる) 採.add(i);
  const 落 = new Set(); for (const k in E.ENEMIES) for (const d in E.ENEMIES[k].落) 落.add(d);
  /* ★ つりも 手に 入る 道（2026-09-02）。ここを 忘れると、
     魚が「どこにも 無い もの」に 見えて 検査が 落ちる。 */
  const 釣 = new Set();
  for (const b in F.つれる) for (const [id] of F.つれる[b]) 釣.add(id);
  const 手 = (id, 深) => {
    深 = 深 || 0;
    if (深 > 8) return false;
    if (採.has(id) || 落.has(id) || 釣.has(id)) return true;
    const rs = R.作りかた[id];
    if (!rs) return false;
    return rs.some((r) => Object.keys(r.材).every((k) => 手(k, 深 + 1)));
  };
  const 孤 = I.ITEM_IDS.filter((id) => !手(id));
  見(孤.length === 0, "★★ **どの ものにも 手に 入る 道が ある**", 孤.slice(0, 8));

  節("④ 物語が 最後まで 通るか");
  const 詰 = [];
  for (const s of S.全節) {
    const y = s.やる;
    if (y.型 === "集") for (const k in y.何) if (!手(k)) 詰.push(s.id + " 集:" + k);
    if (y.型 === "作" && !R.作りかた[y.何]) 詰.push(s.id + " 作:" + y.何);
    if (y.型 === "建" && !R.作りかた[y.何]) 詰.push(s.id + " 建:" + y.何);
    if (y.型 === "行" && !B.BIOMES[y.先]) 詰.push(s.id + " 行:" + y.先);
    if (y.型 === "倒") {
      const D = E.ENEMIES[y.誰];
      if (!D) 詰.push(s.id + " 倒:" + y.誰);
      else if (D.主) { if (!S.主の居場所[y.誰]) 詰.push(s.id + " 主の 居場所が 無い:" + y.誰); }
      else if (!B.BIOME_IDS.some((b) => B.BIOMES[b].出る.indexOf(y.誰) >= 0)) 詰.push(s.id + " その敵は どこにも 出ない:" + y.誰);
    }
    for (const k in (s.礼 || {})) if (!I.ITEM[k]) 詰.push(s.id + " 礼:" + k);
  }
  見(詰.length === 0, "★★ **1 節も 詰まらない**（詰まると 誰もが そこで 止まる）", 詰.slice(0, 8));
  見(Object.keys(S.主の居場所).every((k) => E.ENEMIES[k] && E.ENEMIES[k].主), "★ 主の 居場所は 主だけ", Object.keys(S.主の居場所));

  節("⑤ 世界");
  const t = new T.Terrain(20260902);
  const 数 = {}; let 海 = 0;
  for (let i = 0; i < 6000; i++) {
    const x = (Math.random() - 0.5) * 14000, z = (Math.random() - 0.5) * 14000;
    const a = t.at(x, z); 数[a.biome] = (数[a.biome] || 0) + 1; if (a.water) 海++;
  }
  const 出た = Object.keys(数).length;
  見(出た >= 9, "★★ **どの 風土も 世界に ある**", Object.entries(数).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + Math.round(v / 60) + "%").join(" / "));
  見(海 / 6000 > 0.05 && 海 / 6000 < 0.45, "★ 海が ほどよく ある", Math.round(海 / 60) + "%");
  const t0 = Date.now();
  for (let i = 0; i < 60000; i++) t.height(i * 3.1, i * 1.7);
  const ms = Date.now() - t0;
  見(ms < 300, "★★ **高さを 引くのが 速い**（6 万回）", ms + "ms");

  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
