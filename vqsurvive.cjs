#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvive.cjs — VocabuSurvive を 1 本に 束ねる。

   なぜ 束ねるか:
     素の ES モジュールの まま 配ると 40 本以上の 取りに行きが 起きる。
     細い回線（実測 1.2Mbps）だと それだけで 数秒 かかる。
     このアプリの 他の JS と 同じく **1 本＋指紋** に する。

   使い方:
     node vqsurvive.cjs            束ね直す
     node vqsurvive.cjs --見るだけ  大きさだけ 出す

   束ねたあとは **必ず** node vqrehash.cjs（名前を変えないと 誰にも届かない）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { execFileSync } = require("child_process");

const 見るだけ = process.argv.includes("--見るだけ");
const 根 = __dirname;
const 入口 = path.join(根, "client/assets/vocabu-survive/index.js");
const JSDIR = path.join(根, "client/js");
const INDEX = path.join(根, "client/index.html");
const 名の頭 = "vq-survive";

if (!fs.existsSync(入口)) { console.error("入口が ありません: " + 入口); process.exit(1); }

/* ① 文法を 先に 見る。壊れたまま 束ねると 画面が 真っ白に なる。 */
const 全部 = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith(".js")) 全部.push(p);
  }
})(path.join(根, "client/assets/vocabu-survive"));

let 文法NG = 0;
for (const f of 全部) {
  try {
    /* node は --check と -e を 同時に 受けない。
       .mjs に 写してから --check する（ES モジュールとして 見てもらう）。 */
    const t = path.join(require("os").tmpdir(), "vqchk-" + process.pid + ".mjs");
    fs.writeFileSync(t, fs.readFileSync(f, "utf8"));
    try { execFileSync(process.execPath, ["--check", t], { stdio: "pipe" }); }
    finally { try { fs.unlinkSync(t); } catch (_) {} }
  } catch (e) {
    console.error("文法エラー: " + path.relative(根, f));
    console.error(String(e.stderr || e.message).split("\n").slice(0, 6).join("\n"));
    文法NG++;
  }
}
if (文法NG) { console.error("\n" + 文法NG + " 本 落ちました。束ねません。"); process.exit(1); }
console.log("文法 OK: " + 全部.length + " 本");

/* ══ ②' 見た目の 文（CSS / GLSL）の 中の 注釈を 落とす ══════════════
   ★ esbuild の --minify は **文字列の 中の 注釈は 落とさない**。
     この 作りは 見た目を `...` の 中に CSS で 書き、GLSL も 同じ。
     つまり 書いた 説明が **そのまま 配られて いた**（実測 3 万字）。
     説明は 作る 人の ため の ものなので、配る ものからは 外す。
   ★ 安全の ため に 次を 守る:
     ・触るのは `export const 〇〇_CSS = ` と 〇〇_VS / 〇〇_FS の 中だけ
     ・注釈の 中に ` や ${ が あれば **触らない**（式を 壊さない）
     ・落としても 文法が 通る ことを ①で もう一度 見る
   ★ ここを 直したら 必ず 目でも 見る（node vqsurviveshot.cjs）。 */
function 説明を外す(src) {
  const 印 = /export const ([A-Za-z0-9_]*(?:CSS|_VS|_FS))\s*=\s*`/g;
  let out = "", 前 = 0, m;
  while ((m = 印.exec(src))) {
    const 始 = m.index + m[0].length;
    /* 閉じる ` を 探す。\` は 飛ばす。 */
    let i = 始;
    while (i < src.length) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "`") break;
      i++;
    }
    if (i >= src.length) break;
    const 中 = src.slice(始, i);
    let 削 = 中.replace(/\/\*[\s\S]*?\*\//g, (c) => (c.indexOf("`") >= 0 || c.indexOf("${") >= 0) ? c : "");
    /* ★ 続きの 空白を 1 つに 詰める（CSS / GLSL は 空白の 数を 見ない）。
       ★ 危ない ところは 触らない:
         ・${...} の 中（JS の 式）
         ・"..." '...' の 中（content:"▸" など）
         ・GLSL の // から 行末まで（改行を 消すと 次の 行まで 注釈に なる）
       GLSL には // の 注釈が ある ので、改行は **残す**。
       消すのは 「行の 頭の 字下げ」と 「行末の 空白」だけに する。 */
    削 = 削.split("\n").map((ln) => ln.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "")).join("\n")
           .replace(/\n{2,}/g, "\n");
    out += src.slice(前, 始) + 削;
    前 = i;
    印.lastIndex = i;
  }
  out += src.slice(前);
  return out;
}

const 掃除場 = fs.mkdtempSync(path.join(require("os").tmpdir(), "vq-survive-src-"));
(function 写す(から, へ) {
  fs.mkdirSync(へ, { recursive: true });
  for (const f of fs.readdirSync(から)) {
    const a = path.join(から, f), b = path.join(へ, f);
    const st = fs.statSync(a);
    if (st.isDirectory()) 写す(a, b);
    else if (f.endsWith(".js")) fs.writeFileSync(b, 説明を外す(fs.readFileSync(a, "utf8")));
    else fs.copyFileSync(a, b);
  }
})(path.join(根, "client/assets/vocabu-survive"), path.join(掃除場, "vocabu-survive"));
const 入口2 = path.join(掃除場, "vocabu-survive/index.js");

/* ② 束ねる */
const tmp = path.join(require("os").tmpdir(), "vq-survive-" + process.pid + ".js");
try {
  execFileSync("npx", ["esbuild", 入口2,
    "--bundle", "--minify", "--format=iife", "--target=es2020",
    /* ★ 既定の 文字の 出し方は ascii で、日本語が すべて \uXXXX に なる。
       1 字 3 バイト → **6 バイト**。画面の 文字も 世界観の 文章も 全部 倍。
       実測: これを 付けるだけで 束が 427KB → 380KB（1 割 以上）。
       出す ときの 型は application/javascript;charset=utf-8 なので 安全。 */
    "--charset=utf8",
    /* ★ charset は **既定（ascii）の まま**に する。
       utf8 に すると 生の 大きさは 219→212KB に 減るが、
       **圧縮後は 69.5→71.0KB と 逆に 増えた**（実測）。
       流れるのは 圧縮後なので ascii の ほうが 得。
       ただし 日本語は \uXXXX に なるので、検査で 探す ときは
       同じ 変換を してから 探すこと。 */
    "--global-name=__VQSurviveBundle",
    "--legal-comments=none",
    "--outfile=" + tmp], { stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  console.error("esbuild が 失敗しました:\n" + String(e.stderr || e.message));
  process.exit(1);
}
const 中身 = fs.readFileSync(tmp, "utf8");
fs.unlinkSync(tmp);
const バイト = Buffer.byteLength(中身, "utf8");
const 圧縮後 = require("zlib").gzipSync(Buffer.from(中身, "utf8")).length;
console.log("束ねた: " + (バイト / 1024).toFixed(1) + "KB（圧縮して " + (圧縮後 / 1024).toFixed(1) + "KB）");

if (見るだけ) process.exit(0);

/* ③ 古い ものを 消して 新しい 名前で 置く */
const 指紋 = crypto.createHash("sha256").update(Buffer.from(中身, "utf8")).digest("hex").slice(0, 10);
const 新名 = 名の頭 + "." + 指紋 + ".js";
let 旧名 = null;
for (const f of fs.readdirSync(JSDIR)) {
  if (new RegExp("^" + 名の頭 + "\\.[0-9a-f]{10}\\.js$").test(f)) { 旧名 = f; break; }
}
if (旧名 === 新名) { console.log("中身が 同じなので そのままです（" + 新名 + "）"); process.exit(0); }
fs.writeFileSync(path.join(JSDIR, 新名), 中身, "utf8");
if (旧名) fs.unlinkSync(path.join(JSDIR, 旧名));

/* ④ index.html の 参照を 直す */
let html = fs.readFileSync(INDEX, "utf8");
const 旧道 = 旧名 ? "/js/" + 旧名 : null;
const 新道 = "/js/" + 新名;
if (旧道 && html.includes(旧道)) {
  html = html.split(旧道).join(新道);
  fs.writeFileSync(INDEX, html, "utf8");
  console.log("index.html を 直しました: " + 旧名 + " → " + 新名);
} else if (!html.includes(新道)) {
  console.log("⚠ index.html が " + 新道 + " を 指していません。");
  console.log("  次の 1 行を 入れてください:");
  console.log('  <script>window.__VQ_SURVIVE_SRC="' + 新道 + '";</script>');
} else {
  console.log("index.html は すでに " + 新名 + " を 指しています。");
}
console.log("できました: client/js/" + 新名);
