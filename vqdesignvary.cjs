/* ══════════════════════════════════════════════════════════════════════
   vqdesignvary.cjs — **デザインが 毎回 同じ**に ならないかを 見る。

   訴え（2026-08-29）:
     「スライド／ワード／エクセル／フォームの デザインが 毎回 同じ。
       Lumi が 作るように して」

   何を 見るか:
     ① 10 軸を **1 つも 渡さない**（＝ LLM が 書き忘れた）とき、
        前は 軸の 先頭へ 落ちて **毎回 同じ 座標**に なっていた。
        いまは deckStart の おすすめで 埋まるので、毎回 変わる。
     ② 続けて 8 回 作っても、**同じ 座標が 出ない**。
     ③ となり合う 2 回は **4 軸 以上** ちがう。
     ④ 種を 固定すれば 同じ 結果に なる（決定的である ことは 崩さない）。

   実行: node vqdesignvary.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const R = path.join(__dirname, "client", "design") + path.sep;
/* localStorage の 代わり（この端末が 覚える ところ） */
const 箱 = {};
globalThis.localStorage = {
  getItem: (k) => (k in 箱 ? 箱[k] : null),
  setItem: (k, v) => { 箱[k] = String(v); },
  removeItem: (k) => { delete 箱[k]; }
};
["color", "seed", "font-families", "font-pairs", "derive", "constraints",
 "layout-grammar", "layout-diversity", "layout-resolve", "gate", "ir",
 "preview", "sample", "render-vqslides", "pipeline"].forEach((f) => require(R + f + ".js"));
const V = globalThis.VQD;

let ok = 0, ng = 0;
const T = (name, cond, extra) => {
  if (cond) { ok++; console.log("✅ " + name); }
  else { ng++; console.log("❌ " + name + (extra !== undefined ? " → " + JSON.stringify(extra).slice(0, 300) : "")); }
};
const 節 = (s) => console.log("\n■ " + s);

節("① 軸を 1 つも 渡さなくても 毎回 変わる");
const 座標 = [];
for (let i = 0; i < 8; i++) {
  V.pipeline.deckStart({ title: "資料 " + i, pageCount: 4,
    pages: [{ purpose: "cover" }, { purpose: "detail" }, { purpose: "detail" }, { purpose: "closing" }] });
  /* 10 軸を **何も 渡さない**（LLM が 書き忘れた ときと 同じ） */
  const r = V.pipeline.deckDesign({ layouts: [] });
  座標.push(r.使った設計.Seed);
}
console.log("  出た座標:", 座標.join("  "));
T("8 回 とも ちがう 座標", new Set(座標).size === 8, 座標);
T("先頭の値（0-0-0-0-0-0-0-0-0-0）へ 落ちていない",
  座標.every((k) => k !== "0-0-0-0-0-0-0-0-0-0"), 座標);

節("② となり合う 2 回は 4 軸 以上 ちがう");
let 近い = [];
for (let i = 1; i < 座標.length; i++) {
  const d = V.seed.ちがい(V.seed.decode(座標[i - 1]), V.seed.decode(座標[i]));
  if (d < 4) 近い.push({ 前: 座標[i - 1], 後: 座標[i], ちがい: d });
}
T("となり同士が 4 軸 以上 ちがう", 近い.length === 0, 近い);

節("③ 8 件 まとめて 見ても 重なりが 無い");
let 重なり = [];
for (let i = 0; i < 座標.length; i++)
  for (let j = i + 1; j < 座標.length; j++)
    if (座標[i] === 座標[j]) 重なり.push([i, j]);
T("同じ 座標が 2 回 出ない", 重なり.length === 0, 重なり);

節("④ 種を 固定すれば 同じ 結果（決定的である ことは 崩さない）");
const a1 = V.seed.別の座標([], 12345);
const a2 = V.seed.別の座標([], 12345);
T("同じ 種 → 同じ 座標", V.seed.encode(a1) === V.seed.encode(a2), [V.seed.encode(a1), V.seed.encode(a2)]);
const b1 = V.seed.別の座標([], 999);
T("ちがう 種 → ちがう 座標", V.seed.encode(a1) !== V.seed.encode(b1), [V.seed.encode(a1), V.seed.encode(b1)]);

節("⑤ 渡された 軸は 尊重する（おすすめで 上書きしない）");
V.pipeline.deckStart({ title: "指定あり", pageCount: 2, pages: [{ purpose: "cover" }, { purpose: "closing" }] });
const 指 = V.pipeline.deckDesign({ hue: 210, scheme: "neutral_accent", mode: "dark", layouts: [] });
const 出 = V.seed.decode(指.使った設計.Seed);
T("hue が 210 の まま", 出.hue === 210, 出);
T("mode が dark の まま", 出.mode === "dark", 出);

節("⑥ 覚えた 座標は 端末に 残る");
let 覚え = [];
try { 覚え = JSON.parse(globalThis.localStorage.getItem("vq.design.recent.v1") || "[]"); } catch (e) {}
T("直近 8 件まで 覚える", 覚え.length > 0 && 覚え.length <= 8, 覚え.length);

console.log("\n" + ok + " 件 通過 ／ " + ng + " 件 失敗");
process.exit(ng ? 1 : 0);
