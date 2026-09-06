#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveregress.cjs — **元に戻っていないか**（要件 19）。

   VocabuSurvive を 入れる 前（git の 起点）と いまとで、
   既存の 検査の 通過数を 突き合わせる。
   ★ 「いま 落ちている」だけでは 意味が ない。
     **前から 落ちていた**のか **こちらが 壊した**のかを 分ける。

   使い方:
     git worktree add /private/tmp/vqbase <起点>
     node vqsurviveregress.cjs
     （場所を 変えるなら VQ_BASE_TREE=... 。VQ_BASE は 他の 検査で
       「測る 先の URL」に 使う ので、URL なら 無視する）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
/* ★ VQ_BASE は **他の 検査では 測る 先の URL**（2026-08-31 に ぶつかった）。
   ここでは 起点の 作業木の 場所を 指す ので、URL が 入って いたら 無視する。
   ぶつからない 名前（VQ_BASE_TREE）も 見る。 */
const BASE = process.env.VQ_BASE_TREE
  || (/^https?:/i.test(process.env.VQ_BASE || "") ? "" : process.env.VQ_BASE)
  || "/private/tmp/vqbase";
const HERE = __dirname;

/* 画面を 触る 検査（サーバ不要）。重い ものは 外す。 */
const 検査 = (process.env.VQ_TESTS || "vqacc,vqnavoff,vqblank,vqcreateroute,vqcontract,vqburger,vqbottom,vqcache").split(",");

function 数を取る(out) {
  /* 「合格 N / 不合格 M」「ok N / NG M」「通過 N / 失敗 M」のどれか */
  const pats = [
    /合格\s*(\d+)\s*\/\s*不合格\s*(\d+)/,
    /ok\s*(\d+)\s*\/\s*NG\s*(\d+)/,
    /通過\s*(\d+)\s*\/\s*失敗\s*(\d+)/
  ];
  let last = null;
  for (const line of String(out).split("\n")) {
    for (const p of pats) { const m = p.exec(line); if (m) last = { ok: +m[1], ng: +m[2] }; }
  }
  return last;
}
function 走らせる(dir, name) {
  const f = dir + "/" + name + ".cjs";
  if (!fs.existsSync(f)) return null;
  try {
    const out = execFileSync(process.execPath, [f], { cwd: dir, timeout: 300000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return 数を取る(out);
  } catch (e) {
    return 数を取る(String(e.stdout || "") + String(e.stderr || ""));
  }
}

if (!fs.existsSync(BASE)) {
  console.error("起点の 作業木が ありません: " + BASE);
  console.error("  git worktree add " + BASE + " <起点のコミット>");
  process.exit(2);
}

console.log("起点: " + BASE);
console.log("いま: " + HERE + "\n");
console.log("  検査              起点        いま        判定");
console.log("  ───────────────── ─────────── ─────────── ────────");
let 悪化 = 0, 改善 = 0, 同じ = 0;
for (const t of 検査) {
  const a = 走らせる(BASE, t);
  const b = 走らせる(HERE, t);
  const f = (x) => x ? (x.ok + "/" + x.ng) : "—";
  let 判 = "—";
  if (a && b) {
    if (b.ng > a.ng) { 判 = "❌ 悪化"; 悪化++; }
    else if (b.ng < a.ng) { 判 = "✅ 改善"; 改善++; }
    else { 判 = "同じ"; 同じ++; }
  }
  console.log("  " + t.padEnd(18) + f(a).padEnd(12) + f(b).padEnd(12) + 判
    + (a && a.ng > 0 && b && b.ng === a.ng ? "（前から 落ちている）" : ""));
}
console.log("\n────────────────────────────────");
console.log("  悪化 " + 悪化 + " / 改善 " + 改善 + " / 同じ " + 同じ);
process.exit(悪化 ? 1 : 0);
