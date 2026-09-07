/* ══════════════════════════════════════════════════════════════════════════
   vqschema — 表の 決まりを **毎回 流さない**（2026-09-07・訴え）

   訴え「そもそも ログインできない」

   何が 起きて いたか（本番で 実測）:
     ensureDbSchema は API の ほぼ 全部の 手前で 走り、中身は
     CREATE TABLE / CREATE INDEX / 列の 追加 が **261 本**。
     守りは 入れ物（isolate）ごとに 1 回 だけ。Cloudflare は 入れ物を
     どんどん 作り直すので、冷えた 入れ物に 当たった 人は 毎回 待たされる。
     実測: ログインが 1.1 秒 → 7 秒 → 80 秒超 と 1 回おきに ばらついた。
     CPU は 0.17 秒。**ぜんぶ D1 の 往復を 待って いた 時間。**

   ここで 見る こと（本体の 中身を 読んで 確かめる。走らせない）:
     ① 入口では **署名を 1 つ 読むだけ**で 済む 道が ある
     ② 署名は **中身から 自動で** 作る（手で 上げる 決まりに しない）
     ③ 署名が 読めない ときは 安全側（全部 流す）
     ④ 流し終えたら 署名を 書く
     ⑤ 実際に 流すのは 定期実行（人を 待たせない ところ）
     ⑥ DDL の 本数（増えすぎたら 気づける ように 数える）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
let 合 = 0, 否 = 0; const 落ち = [];
const 見る = (n, c, x) => {
  if (c) { 合++; console.log("  ok   " + n + (x !== undefined ? "  → " + String(x).slice(0, 160) : "")); }
  else { 否++; 落ち.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + String(x).slice(0, 300) : "")); }
};
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
function 切る(頭) {
  const i = SRC.indexOf(頭);
  if (i < 0) return "";
  const re = /\n(?:async function |function |const |let |var )/g;
  re.lastIndex = i + 頭.length;
  const m = re.exec(SRC);
  return SRC.slice(i, m ? m.index : SRC.length);
}

console.log("\n■ 入口（ensureDbSchema）");
const F = 切る("async function ensureDbSchema(env) {");
見る("見つかる", !!F, F.length + " 字");
見る("★ 署名を **1 つ 読むだけ**の 道が ある",
  /SELECT value FROM kv_flags WHERE key = 'schema\.signature'/.test(F));
見る("★ 合って いれば **流さずに 返る**",
  /=== dbSchemaSignature\(\)[\s\S]{0,120}_dbSchemaEnsured = true;[\s\S]{0,40}return;/.test(F));
見る("★ 読めない ときは 安全側（全部 流す）", /catch \(e\) \{ \/\* 表が まだ 無い/.test(F));
見る("★ 流し終えたら 署名を 書く", /'schema\.signature'[\s\S]{0,200}dbSchemaSignature\(\)/.test(F));

console.log("\n■ 署名の 作りかた");
const G = 切る("function dbSchemaSignature() {");
見る("見つかる", !!G);
見る("★ **中身から 自動で** 作る（手で 上げない）", /String\(ensureDbSchema\)/.test(G));
見る("入れ物ごとに 1 回だけ 作る", /_dbSchemaSig\b/.test(G) && /if \(_dbSchemaSig\) return _dbSchemaSig;/.test(G));
見る("長さと 数え値の 両方を 使う（当たりにくく する）",
  /src\.length/.test(G) && /toString\(36\)/.test(G));

console.log("\n■ 実際に 流す ところ");
const S = SRC.slice(SRC.indexOf("async scheduled(controller, env, ctx) {"));
見る("★ 定期実行で ensureDbSchema を 走らせる",
  /ctx\.waitUntil\(\(async \(\) => \{[\s\S]{0,200}ensureDbSchema\(env\)/.test(S.slice(0, 3000)));
見る("失敗しても 定期実行ぜんたいを 落とさない", /catch \(err\) \{ console\.warn\("\[SCHEDULED\] schema ensure failed/.test(S.slice(0, 3000)));

console.log("\n■ DDL の 量");
{
  const n = (F.match(/CREATE TABLE|CREATE INDEX|ensureCols\(|ALTER TABLE/g) || []).length;
  見る("本数を 数えられる", n > 0, n + " 本");
  見る("★ 200 本を 超えたら 入口で 流しては いけない 量（いまも そう）", n > 200, n + " 本");
}

console.log("\n■ 入口の 呼び出しは 残って いる（自分で 直す 力を 失わない）");
見る("API の 手前で 呼ばれて いる", /stage = "schema\.ensure";[\s\S]{0,80}await ensureDbSchema\(env\)/.test(SRC));

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否);
if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
console.log("");
process.exit(否 ? 1 : 0);
