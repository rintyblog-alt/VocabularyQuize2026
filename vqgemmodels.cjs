/* ══════════════════════════════════════════════════════════════════════════
   vqgemmodels.cjs — 作問に使う Gemini のモデル（2026-08-13）

   なぜ足したか:
     Gemini の枠は **プロジェクト × モデル**ごとに別（実測で確認）。
     並べた数だけ 1 日に呼べる回数が増える。ところが 2 つしか使っていなかった。

   ここで守りたいこと:
     ① 作問に使うモデルが 4 つ並んでいる（減らすと 1 日の回数がそのまま減る）
     ② **落第したモデルを入れていない**（実測で落ちたものを戻さない）
     ③ 同じモデルを 2 回並べていない（重ねても枠は増えない）
     ④ 環境変数で差し替えられる（コードを触らずに足せる）

   実測（本番と同じ道 /api/aigen/questions で 10 問 × 2 題材）:
     gemini-3.5-flash-lite          20/20 ・  7 秒 ・ 3,699  ← 基準
     gemini-3.1-flash-lite-preview  20/20 ・  8 秒 ・ 3,205  ← 足した
     gemini-flash-lite-latest       20/20 ・  8 秒 ・ 4,060
     gemma-4-26b-a4b-it             20/20 ・ 53 秒          ← 遅すぎ
     gemma-4-31b-it                 10/20 ・ 86 秒          ← 落第
     gemini-2.5-flash-lite           1/20                   ← 落第
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const SRC = path.join(__dirname, "server", "src", "worker.js");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = fs.readFileSync(SRC, "utf8");

/* 作問に使う並びだけを取り出す（Quick Chat の並びとは別もの）。 */
const m = src.match(/const pool = \[model,[\s\S]{0,400}?\]\.filter\([^)]*\)[^;]*;/);
if (!m) { console.log("  ✗ Gemini の並びが見つかりません"); process.exit(1); }
const block = m[0];
const models = [...block.matchAll(/\|\| "([^"]+)"/g)].map((x) => x[1]);

console.log("\n① 4 つ並んでいる（減らすと 1 日の回数が減る）");
{
  /* model 本体 + ALT1..ALT3 で 4 つ */
  ok("控えのモデルが 3 つある（ALT1/ALT2/ALT3）", models.length === 3,
    "見つかったのは " + models.length + " つ: " + models.join(", "));
  ok("ALT3 が入っている", /GEMINI_MODEL_ALT3/.test(block));
  ok("ALT3 の既定が gemini-3.1-flash-lite-preview",
    models.indexOf("gemini-3.1-flash-lite-preview") >= 0, models.join(", "));
}

console.log("\n② 実測で落第したモデルを入れていない");
{
  /* 入れると 1 日の回数は増えるが、問題が作れないので意味が無い。
     しかも遅いものは利用者を待たせる。 */
  const 落第 = [
    ["gemini-2.5-flash-lite", "20 問中 1 問しか作れなかった"],
    ["gemma-4-31b-it", "20 問中 10 問・86 秒"],
    ["gemma-4-26b-a4b-it", "品質は良いが 53 秒（基準の 7 倍）"]
  ];
  for (const [name, why] of 落第) {
    ok("入れていない: " + name + "（" + why + "）", models.indexOf(name) < 0);
  }
  /* 1 日 20 回しか無い Flash 系（Lite でないもの）を入れていないこと。 */
  const flashNotLite = models.filter((x) => /flash/.test(x) && !/lite/.test(x));
  ok("1 日 20 回しか無い Flash（Lite でない）を入れていない",
    flashNotLite.length === 0, flashNotLite.join(", "));
  ok("Pro 系を入れていない（無料枠 0 回）",
    models.filter((x) => /pro/i.test(x)).length === 0);
}

console.log("\n③ 同じモデルを重ねていない（重ねても枠は増えない）");
{
  ok("控えの 3 つに重複が無い", new Set(models).size === models.length, models.join(", "));
  /* 並びを作るところで、同じ名前を 1 つにまとめていること。
     環境変数で同じ値を入れられたときの保険。 */
  ok("同じ名前は 1 つにまとめている（filter が残っている）",
    /\]\.filter\(\(m, i, a\) => m && a\.indexOf\(m\) === i\)/.test(block));
}

console.log("\n④ コードを触らずに差し替えられる");
{
  for (const n of ["GEMINI_MODEL_ALT1", "GEMINI_MODEL_ALT2", "GEMINI_MODEL_ALT3"]) {
    ok(n + " で差し替えられる", new RegExp("env\\?\\." + n).test(block));
  }
  /* 始める位置をずらしていること。固定だと先頭のバケツだけ先に尽きる。 */
  ok("毎回ちがうモデルから始める（先頭へ偏らせない）",
    /const startAt = Math\.floor\(Date\.now\(\) \/ 1000\) % pool\.length;/.test(src));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
