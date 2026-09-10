/* ══════════════════════════════════════════════════════════════════════════
   vqroutes — **道の 横取りが 起きて いないか**（2026-09-10・訴え）

   訴え「ルミが 反応しなく なった。起動しなく なった。繋ぎ直しに なって しまう」

   真因: みんなで解く を 足した とき、`isLivePath` が
   `path.startsWith("/api/live/")` で その 下を 丸ごと 引き受けて いた。
   ところが **Lumi の 音声会話の 入口が `/api/live/token`**。
   こちらが 先に 拾って「そのような 口は ありません」を 返すので、
   Lumi は 札を 取れず 起動できず、繋ぎ直しを くり返して いた。

   ★ 本体（worker.js）は **前へ 出した 引き受け**を 先に 通す。
     そこが 前方一致で 名乗ると、後ろの 口が 全部 死ぬ。
     しかも **本体の 一覧には 残った まま**なので、読んでも 気づけない。

   ここでは「別ファイルが 名乗る 道」と「本体が 持って いる 道」を
   突き合わせ、飲み込まれて いる ものを 出す。

   使いかた: node vqroutes.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const 根 = __dirname;
/* ★ 注釈を 外して から 見る。外さないと **説明文に 書いた 道**を
   本物の 名乗りと 取り違える（この 検査 自身が 一度 そうなった）。 */
function 注釈を外す(s) {
  return String(s || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
}
const 本体 = 注釈を外す(fs.readFileSync(path.join(根, "server/src/worker.js"), "utf8"));

/* 本体が 持って いる 口（path === "..."） */
const 本体の道 = new Set();
for (const m of 本体.matchAll(/path === "(\/[^"]+)"/g)) 本体の道.add(m[1]);
/* 前方一致で 持って いる ものも 拾う */
const 本体の前方 = [];
for (const m of 本体.matchAll(/path\.startsWith\("(\/[^"]+)"\)/g)) 本体の前方.push(m[1]);

/* 別ファイルが 名乗る 道（isXxxPath の 中の startsWith） */
const 別 = ["server/src/live.js", "server/src/survive.js", "server/src/calls.js", "server/src/admin.js"];

/* ★ **前から 分かって いる もの**（新しい 事故と 混ぜない）。
   worker.js の /api/admin/... の 分岐は 本体に
   「ここへ 書いても 一生 呼ばれない（実際 403 CSRF が 返っていた）」と
   書いて ある **死んだ 分岐**。admin.js が 先に 引き受けるのが 正しい 姿。
   ここを 赤に したままだと 誰も 検査を 見なく なるので、分けて 出す。 */
const 前から = { "server/src/admin.js": "worker.js の admin 分岐は 本体に 「一生 呼ばれない」と 明記ずみの 死んだ 道" };
let ok = 0, ng = 0, 見送り = 0;

console.log("【道の 横取り】\n");
for (const f of 別) {
  let 生 = "";
  try { 生 = fs.readFileSync(path.join(根, f), "utf8"); } catch (e) { continue; }
  const s = 注釈を外す(生);
  const m = /export function is[A-Za-z]+Path\(path\)\s*\{([\s\S]*?)\n\}/.exec(s);
  if (!m) continue;
  const 中 = m[1];
  const 名乗り = [...中.matchAll(/path\.startsWith\("(\/[^"]+)"\)/g)].map((x) => x[1]);
  if (!名乗り.length) { console.log("  ok   " + f + "  → 前方一致で 名乗って いない"); ok++; continue; }
  /* その 前方一致に 飲み込まれる 本体の 口 */
  /* ★ 飲み込みでは ない ものを 除く: **その 道を 自分でも 持って いる**なら
     引き受けた 上で ちゃんと 返して いる（admin.js が そう）。 */
  const 飲む = [];
  for (const pre of 名乗り) {
    for (const d of 本体の道) {
      if (!d.startsWith(pre)) continue;
      if (s.indexOf('"' + d + '"') >= 0) continue;   /* 自分でも 持って いる */
      飲む.push({ pre, d });
    }
  }
  if (!飲む.length) { console.log("  ok   " + f + "  → " + 名乗り.join(" ") + "（ぶつかり なし）"); ok++; continue; }
  if (前から[f]) {
    見送り++;
    console.log("  見送り " + f + "  → " + 飲む.length + " 本。" + 前から[f]);
    continue;
  }
  ng++;
  console.log("  NG   " + f);
  飲む.slice(0, 12).forEach((x) => {
    console.log("       " + x.pre + " が **" + x.d + "** を 飲み込んで います");
  });
  console.log("       → 前方一致を やめ、自分の 道だけを 名指しで 並べる。");
}

console.log("\n────────────────────────────────");
console.log("  ok " + ok + " / NG " + ng + " / 見送り " + 見送り);
process.exit(ng ? 1 : 0);
