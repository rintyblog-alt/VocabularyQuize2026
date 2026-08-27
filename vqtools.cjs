/* ══════════════════════════════════════════════════════════════════════
   vqtools.cjs — Lumi の 道具の宣言が **形として 正しいか**

   ★ なぜ 要るか（2026-08-17・実測の事故）
     道具の説明文の 途中に **余分なカンマ**が 1 つ 入っただけで、
     続きの文が 別の引数として 読まれ、
       parameters.properties  … 文字列（本来は オブジェクト）
       parameters.required    … オブジェクト（本来は 並び）
     という 形になった。Gemini Live は 受け取った瞬間に
       close 1007 "Invalid value at setup.tools[0].function_declarations[57].parameters.properties"
     で 切る。画面からは **「Lumi が 起動してすぐ 落ちる」**としか 見えない。
   ★ 目で 読んでも 気づけない（1 文字）。**機械が 数える。**
   ★ AI は 呼ばない。worker.js を 読み込んで 形だけを 見る。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

const src = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

/* liveTools() だけを 取り出して 走らせる。worker 全体は
   Cloudflare の入れ物が 要るので 読み込めない。 */
function 取り出す(名) {
  const i = src.indexOf("function " + 名 + "(");
  if (i < 0) return null;
  let 深 = 0, j = src.indexOf("{", i), k = j;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "{") 深++;
    else if (c === "}") { 深--; if (!深) break; }
  }
  return src.slice(i, k + 1);
}

節("① liveTools() を 取り出して 走らせる");
let 道具 = null;
{
  const 本体 = 取り出す("liveTools");
  ok("liveTools が 見つかる", !!本体);
  if (本体) {
    try {
      const ctx = vm.createContext({});
      vm.runInContext(本体 + "\n__出 = liveTools();", ctx, { timeout: 8000 });
      道具 = ctx.__出;
      ok("走って 中身が 返る", Array.isArray(道具) && 道具.length > 0,
        Array.isArray(道具) ? 道具.length : typeof 道具);
    } catch (e) {
      ok("走って 中身が 返る", false, String(e.message).slice(0, 200));
    }
  }
}

if (!道具) {
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  process.exit(1);
}

const 宣言 = (道具[0] && (道具[0].functionDeclarations || 道具[0].function_declarations)) || [];

節("② 宣言の 形（ここが 崩れると Lumi は 起動して すぐ 落ちる）");
{
  ok("宣言が 1 つ以上 ある", 宣言.length > 0, 宣言.length);
  console.log("     道具の数: " + 宣言.length);

  const 悪 = [];
  const 名の重なり = {};
  宣言.forEach((f, i) => {
    const 印 = "[" + i + "] " + (f && f.name ? f.name : "（名無し）");
    if (!f || typeof f !== "object") { 悪.push(印 + ": 中身が オブジェクトでない"); return; }
    if (typeof f.name !== "string" || !f.name) 悪.push(印 + ": name が 文字列でない");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(f.name || ""))) 悪.push(印 + ": name に 使えない字");
    名の重なり[f.name] = (名の重なり[f.name] || 0) + 1;
    if (typeof f.description !== "string" || !f.description) 悪.push(印 + ": description が 文字列でない");
    const p = f.parameters;
    if (!p || typeof p !== "object" || Array.isArray(p)) { 悪.push(印 + ": parameters が オブジェクトでない"); return; }
    if (p.type !== "OBJECT") 悪.push(印 + ": parameters.type が OBJECT でない（" + p.type + "）");
    /* ★ ここが 事故の あった所。文字列が 入ると Gemini は 1007 で 切る。 */
    if (p.properties === undefined || p.properties === null
        || typeof p.properties !== "object" || Array.isArray(p.properties)) {
      悪.push(印 + ": parameters.properties が オブジェクトでない（"
        + (Array.isArray(p.properties) ? "並び" : typeof p.properties) + "）");
    }
    if (p.required !== undefined && !Array.isArray(p.required)) {
      悪.push(印 + ": parameters.required が 並びでない（" + typeof p.required + "）");
    }
    /* 引数の 1 つずつ */
    if (p.properties && typeof p.properties === "object" && !Array.isArray(p.properties)) {
      Object.keys(p.properties).forEach((k) => {
        const v = p.properties[k];
        if (!v || typeof v !== "object") { 悪.push(印 + "." + k + ": 中身が オブジェクトでない"); return; }
        if (["STRING", "NUMBER", "BOOLEAN", "ARRAY", "OBJECT", "INTEGER"].indexOf(v.type) < 0) {
          悪.push(印 + "." + k + ": type が おかしい（" + v.type + "）");
        }
        if (v.type === "ARRAY") {
          /* ★ items が ARRAY（並びの並び）も 正しい。表の行（rows）が これ。
             docsEdit / slidesEdit で 前から 使っていて、実際に 動いている。 */
          if (!v.items || typeof v.items !== "object") 悪.push(印 + "." + k + ": ARRAY に items が 無い");
          else if (["STRING", "NUMBER", "BOOLEAN", "OBJECT", "INTEGER", "ARRAY"].indexOf(v.items.type) < 0) {
            悪.push(印 + "." + k + ": items.type が おかしい（" + v.items.type + "）");
          } else if (v.items.type === "ARRAY" && (!v.items.items || typeof v.items.items !== "object")) {
            悪.push(印 + "." + k + ": 並びの並びなのに 中の items が 無い");
          } else if (v.items.type === "OBJECT"
                     && (!v.items.properties || typeof v.items.properties !== "object")) {
            悪.push(印 + "." + k + ": items が OBJECT なのに properties が 無い");
          }
        }
        if (v.enum !== undefined && !Array.isArray(v.enum)) 悪.push(印 + "." + k + ": enum が 並びでない");
      });
    }
  });
  ok("形の崩れが 1 つも 無い（" + 悪.length + " 件）", 悪.length === 0, 悪.slice(0, 10));
  const 重 = Object.keys(名の重なり).filter((k) => 名の重なり[k] > 1);
  ok("同じ名前の道具が 2 つ 無い", 重.length === 0, 重);
}

節("③ JSON にして 送れる（丸ごと 文字にできる）");
{
  let s = "";
  try { s = JSON.stringify(道具); } catch (e) { s = ""; }
  ok("JSON にできる", !!s, s ? s.length + " 字" : "できない");
  ok("NaN や undefined が 混ざっていない",
    s.indexOf("NaN") < 0 && s.indexOf("undefined") < 0,
    s.indexOf("NaN") >= 0 ? "NaN が ある" : (s.indexOf("undefined") >= 0 ? "undefined が ある" : ""));
}

節("④ 画面に 受け口が あるか（宣言だけ あって 動かない道具を 作らない）");
{
  /* ★ 丸ごと() は もともと **圧縮ずみの client/js** を返していた（2026-08-28）。
     圧縮すると `name === "x"` は `e==="x"` に なるので、この 見かたでは
     **いつも 全部 無しに 見えた**（113 件 無し ＝ 検査が 壊れていた）。
     いまは vqsrc.cjs 側で 圧縮前（js-src）を 返すよう 直してある。 */
  const 画面 = require("./vqsrc.cjs").丸ごと();
  const 無い = [];
  宣言.forEach((f) => {
    const n = String(f.name || "");
    if (!n) return;
    /* doTool0 の 振り分けに 名前が あるか */
    if (画面.indexOf('name === "' + n + '"') < 0) 無い.push(n);
  });
  ok("宣言した道具は すべて 画面に 受け口が ある（" + 無い.length + " 件 無し）",
    無い.length === 0, 無い.slice(0, 12));
}

console.log("\n合格 " + pass + " / 失敗 " + fail);
if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
process.exit(fail ? 1 : 0);
