/* ══════════════════════════════════════════════════════════════════════
   vqtooldecl.cjs — 道具の宣言が **正しい形か** を 機械で 確かめる

   なぜ 要るか（2026-08-19・実測で 痛い目を見た）:
     道具の宣言を 6 つ 足したら、**Lumi が 一切 繋がらなくなった**。
     宣言の 書き方を 間違えると setup ごと 弾かれ、
     **接続そのものが 開かない**。しかも 画面には ただ
     「つなぎ直しています…」としか 出ないので、
     道具のせいだと **気づきようが ない**。

   正しい形:
     fn(名, 説明, 中身, 必須)
       ・3 番目は **properties そのもの**（{type:"object",properties:{}} では ない）
       ・型は **大文字**（STRING / ARRAY / INTEGER / NUMBER / BOOLEAN / OBJECT）
       ・array には items が 要る
       ・**入れ子の array**（array の items が array）は 通らない

   使い方: node vqtooldecl.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};

const 大文字 = ["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT"];

/* worker.js から 道具の一覧を **実際に 作らせて** 見る。
   文字を 正規表現で 探すのでは 取りこぼす。 */
function 道具たち() {
  const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  const i = src.indexOf("var fn = function (name, desc, props, req) {");
  if (i < 0) throw new Error("fn の 決めどころが 見つかりません");
  /* ★ 名前つきの 関数まで 遡る。lastIndexOf("function ") だと
     すぐ上の **名無しの関数**に 当たって 取り出せない（実測）。 */
  const 前 = src.slice(0, i).split("\n");
  let 行 = -1;
  for (let k = 前.length - 1; k >= 0; k--) {
    if (/^(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(前[k])) { 行 = k; break; }
  }
  if (行 < 0) throw new Error("囲んでいる 関数が 見つかりません");
  const 頭 = 前.slice(0, 行).join("\n").length + (行 ? 1 : 0);
  let 深 = 0, 終 = -1;
  for (let k = src.indexOf("{", 頭); k < src.length; k++) {
    if (src[k] === "{") 深++;
    else if (src[k] === "}") { 深--; if (!深) { 終 = k + 1; break; } }
  }
  if (終 < 0) throw new Error("関数の 終わりが 見つかりません");
  const 本体 = src.slice(頭, 終);
  const 名 = /function\s+([A-Za-z0-9_]+)\s*\(/.exec(本体)[1];
  /* この関数は env や 設定を 使うことがある。空の 入れ物で 呼ぶ。 */
  const 作る = new Function("env", "cfg", 本体 + "\nreturn " + 名 + "(env, cfg);");
  let 出 = null;
  for (const 引数 of [[{}, {}], [{}], []]) {
    try { 出 = 作る.apply(null, 引数); if (出) break; } catch (e) { 出 = null; }
  }
  if (!出) throw new Error("道具の一覧を 作れませんでした");
  const 並 = Array.isArray(出) ? 出 : [出];
  const 全 = [];
  並.forEach((x) => (x && x.functionDeclarations || []).forEach((f) => 全.push(f)));
  return 全;
}

function 型を見る(名, 欄, 道, 深さ) {
  if (!欄 || typeof 欄 !== "object") return;
  const t = String(欄.type || "");
  if (!t) { 悪い.push(道 + " に type が ない"); return; }
  if (大文字.indexOf(t) < 0) 悪い.push(道 + " の type が " + JSON.stringify(t) + "（大文字で 書くこと）");
  if (t === "ARRAY") {
    if (!欄.items) 悪い.push(道 + " は ARRAY なのに items が ない");
    /* ★ 入れ子の array（array の items が array）は **通る**。
       docsWrite.blocks[].rows など、前から 6 か所 使っていて 動いていた。
       ここを 落とすと 直す理由の無いものを 直すことになる。数えるだけ。 */
    else { if (String(欄.items.type || "") === "ARRAY") 入れ子++; 型を見る(名, 欄.items, 道 + "[]", 深さ + 1); }
  }
  if (t === "OBJECT" && 欄.properties) {
    for (const k in 欄.properties) 型を見る(名, 欄.properties[k], 道 + "." + k, 深さ + 1);
  }
}

let 悪い = [], 入れ子 = 0;
(function () {
  console.log("■ 道具の宣言を 実際に 作って 確かめる");
  let 全;
  try { 全 = 道具たち(); }
  catch (e) { ok("道具の一覧を 作れる", false, String(e.message)); 締め(); return; }
  ok("道具の一覧を 作れる（" + 全.length + " 個）", 全.length > 0, 全.length);

  const 名前 = 全.map((f) => f.name);
  ok("名前が 重なっていない", new Set(名前).size === 名前.length,
     名前.filter((x, i) => 名前.indexOf(x) !== i));

  /* 今回 足した 6 つが 入っているか */
  ["planAdd", "planShow", "boardBlocks", "boardMark", "boardWrite", "boardClear"]
    .forEach((n) => ok("「" + n + "」が 宣言されている", 名前.indexOf(n) >= 0));

  全.forEach((f) => {
    const p = f.parameters;
    if (!p) { 悪い.push(f.name + ": parameters が ない"); return; }
    if (String(p.type || "") !== "OBJECT")
      悪い.push(f.name + ": parameters.type が " + JSON.stringify(p.type) + "（OBJECT のはず）");
    if (!p.properties || typeof p.properties !== "object")
      悪い.push(f.name + ": properties が ない");
    /* ★ **二重包み**の 見つけかた。
       properties の 中に "type"/"properties"/"required" が 並んでいたら、
       fn の 3 番目に {type:"object",properties:{…}} を 渡している。 */
    if (p.properties && p.properties.type && p.properties.properties)
      悪い.push(f.name + ": **二重に 包んでいる**（3 番目には properties そのものを 渡す）");
    if (p.required && !Array.isArray(p.required))
      悪い.push(f.name + ": required が 並びで ない");
    for (const k in (p.properties || {})) 型を見る(f.name, p.properties[k], f.name + "." + k, 0);
    (p.required || []).forEach((k) => {
      if (!p.properties || !p.properties[k])
        悪い.push(f.name + ": required の「" + k + "」が properties に ない");
    });
  });

  /* ★ ここで 見つけたいのは 「Lumi が 繋がらなくなる 書き方」:
       ・二重包み（3 番目に {type,properties,required} を 渡した）
       ・小文字の type
       ・ARRAY なのに items が 無い
     実測 2026-08-19: この 3 つの うち 二重包み＋小文字で、
     **接続そのものが 開かなくなった**（6 つの 宣言を 足した直後）。 */
  ok("★ 形の おかしい宣言が 0（" + 悪い.length + "）", 悪い.length === 0, 悪い.slice(0, 8));
  console.log("     （入れ子の array: " + 入れ子 + " か所。これは 前から 使っていて 通る）");

  /* JSON にして 送れるか（循環や undefined が 混ざっていないか） */
  let 送れる = true, 大きさ = 0;
  try { 大きさ = JSON.stringify(全).length; } catch (e) { 送れる = false; }
  ok("そのまま 送れる（JSON にできる）", 送れる);
  ok("大きすぎない（" + Math.round(大きさ / 1024) + "KB）", 大きさ < 200000, 大きさ);
  締め();
})();

function 締め() {
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
}
