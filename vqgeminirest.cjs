/* ══════════════════════════════════════════════════════════════════════
   枠を 使い切った **モデル × 鍵** を 休ませる（2026-09-06・訴え）

   訴え「おっそっw／途中まで 順調に 11/16 まで 行ってたのに、
         いきなり 4/16 に なって、そこから 遅く なるの？ なぜ？」

   本番の 台帳（その日）:
     gemini-3.5-flash  198 回 / エラー 177 / **枠切れ 161**
   試験は Flash 本体（1 日 20 回）を 使う 設定。朝に 尽きた あとは
   毎回 429 を 食らって から 鍵 5 本 → 控え と 巡って いた。

   ★ ここを 間違えると **1 問も 作れなく なる**（全部 休ませて しまう）。
     休ませる 判定より、**逃げ道**の ほうを 厚く 見る。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/server/src/worker.js", "utf8");
function 抜く(名) {
  const 頭 = src.indexOf("function " + 名 + "(");
  if (頭 < 0) throw new Error("見つかりません: " + 名);
  let 深 = 0;
  for (let i = src.indexOf("{", 頭); i < src.length; i++) {
    if (src[i] === "{") 深++;
    else if (src[i] === "}") { 深--; if (深 === 0) return src.slice(頭, i + 1); }
  }
}
const M = new Function([
  "const GEMINI_REST = new Map();",
  抜く("geminiRestKey"), 抜く("geminiResting"), 抜く("geminiRest"),
  "return { GEMINI_REST, geminiResting, geminiRest };"
].join("\n"))();

let 合 = 0, 否 = 0;
function 見る(名, 実, 期) {
  const a = JSON.stringify(実), b = JSON.stringify(期);
  if (a === b) { console.log("  ✓ " + 名); 合++; }
  else { console.log("  ✗ " + 名 + "\n      出た: " + a + "\n      ほしい: " + b); 否++; }
}
const 今 = 1000000;

console.log("\n══ 休ませる ══\n");
見る("はじめは 休んで いない", M.geminiResting("gemini-3.5-flash", "k1", 今), false);
{
  M.geminiRest("gemini-3.5-flash", "k1", "Quota exceeded for quota_metric ... PerDay", 今);
  見る("1 日ぶんの 枠切れ → 休む", M.geminiResting("gemini-3.5-flash", "k1", 今 + 60000), true);
  見る("★ 1 日ぶんは 長く 休む（1 時間 後も まだ）",
       M.geminiResting("gemini-3.5-flash", "k1", 今 + 60 * 60 * 1000), true);
  見る("★ **別の モデル**は 巻き添えに しない",
       M.geminiResting("gemini-3.5-flash-lite", "k1", 今 + 60000), false);
  見る("★ **別の 鍵**も 巻き添えに しない",
       M.geminiResting("gemini-3.5-flash", "k2", 今 + 60000), false);
}
{
  M.geminiRest("m2", "k1", "Quota exceeded ... PerMinute", 今);
  見る("1 分ぶんの 枠切れ → 短く 休む", M.geminiResting("m2", "k1", 今 + 30000), true);
  見る("★ 1 分ぶんは 2 分 後には 戻る", M.geminiResting("m2", "k1", 今 + 120000), false);
}
{
  M.geminiRest("m3", "k1", 'retryDelay: "42s"', 今);
  見る("書いて ある 時間に 従う（42 秒 後は まだ 休み）",
       M.geminiResting("m3", "k1", 今 + 41000), true);
  見る("その あとは 戻る", M.geminiResting("m3", "k1", 今 + 43000), false);
}
{
  M.geminiRest("m4", "k1", "何か 分からない 断り", 今);
  見る("理由が 読めなければ 短めに 休む（1 分ぶん 扱い）",
       [M.geminiResting("m4", "k1", 今 + 30000), M.geminiResting("m4", "k1", 今 + 120000)],
       [true, false]);
}

console.log("\n══ 巡回に つながって いるか ══\n");
見る("★ 休んで いる ものは 飛ばす",
     /if \(!休みを無視 && geminiResting\(m, list\[ki\], Date\.now\(\)\)\) \{ 休んだ\+\+; continue; \}/.test(src), true);
見る("★ 429 を 食らったら 休ませる",
     /if \(r\.status === 429\) \{ geminiRest\(m, list\[ki\], r\.err, Date\.now\(\)\); continue; \}/.test(src), true);
見る("★ **全部 休みなら 休みを 無視する**（1 問も 作れなく ならない）",
     /const 休みを無視 = 生きて\.length === 0;/.test(src), true);
見る("休んだ 数を 呼び出し側へ 返す（あとで 数えられる）",
     /休んだ: 休んだ/.test(src), true);

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "\n");
process.exit(否 ? 1 : 0);
