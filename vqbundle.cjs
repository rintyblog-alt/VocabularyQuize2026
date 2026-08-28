#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqbundle.cjs — client/ の 部品を つないで js-src/bundle-core.*.js を 作る。

   なぜ 要るか（2026-08-19）:
     bundle-core は **手でつないで** いた。作り方が どこにも 無いので、
       ・部品を 1 つ足したいだけで 全部を 貼り直すことになる
       ・貼り忘れると **黙って 動かない**（読み込まれないだけなので 誰も気づかない）
     実際 いまの束には /core/store/idb.js が **2 回** 入っている。

   使い方:
     node vqbundle.cjs            作り直す（js-src と client/js の両方）
     node vqbundle.cjs --見るだけ  中身は変えず、違いだけ出す

   作ったあとは **必ず** node vqrehash.cjs（名前を変えないと 誰にも届かない）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { execFileSync } = require("child_process");

const 見るだけ = process.argv.includes("--見るだけ");
const 根 = __dirname;
const CLIENT = path.join(根, "client");

/* ── 並び。ここが 唯一の 決めどころ ───────────────────────────
   前のものが 後のものに 使われる（VQB / VQW を 先に 作る）ので 順番は 大事。
   ★ runtime.js だけは そのまま つながない。**文字列にして 埋める**
     （AR App の iframe の 中へ 差し込むため）。 */
const 並び = [
  "/vq-wake.js",
  "/design/color.js", "/design/seed.js", "/design/font-families.js",
  "/design/font-pairs.js", "/design/derive.js", "/design/constraints.js",
  "/design/layout-grammar.js", "/design/layout-diversity.js", "/design/layout-resolve.js",
  "/design/gate.js", "/design/ir.js", "/design/preview.js",
  "/design/render-vqslides.js", "/design/pipeline.js", "/design/doc-theme.js",
  "/core/ir/types.js", "/core/ir/ids.js", "/core/ir/hash.js", "/core/ir/walk.js",
  "/core/ir/project.js", "/core/ir/snapshot.js",
  "/core/ops/types.js", "/core/ops/apply.js", "/core/ops/guard.js", "/core/ops/decompose.js",
  "/core/selector/resolve.js", "/core/selector/ask.js",
  "/core/validate/common.js", "/core/validate/placeholder.js", "/core/validate/math.js",
  "/core/validate/numbers.js", "/core/validate/formula.js", "/core/validate/docs.js",
  "/core/validate/sheets.js", "/core/validate/slides.js", "/core/validate/doctype.js",
  "/core/report/render.js",
  "/core/doctype/schema.js", "/core/doctype/registry.js", "/core/doctype/fallback.js",
  "/core/doctype/exam.js", "/core/doctype/extract.js", "/core/doctype/generate.js",
  "/core/pipeline/repair.js", "/core/pipeline/edit.js", "/core/pipeline/generate.js",
  "/core/math/parse.js", "/core/math/svg.js", "/core/math/spec.js",
  "/core/md/render.js",
  "/core/ar/track.js",
  "/core/geo/draw.js", "/core/geo/more.js", "/core/geo/sci.js",
  "/core/store/idb.js",      /* 大きいものを 端末の IndexedDB へ */
  "/core/store/cloud.js",    /* 会話を サーバへ（2026-08-19） */
  "/core/scan/mode.js",      /* スキャンモード（2026-08-20） */
  /* 型（できあいの ひな型）。Lumi は これに 文字を 入れるだけ（2026-08-20） */
  "/core/kata/base.js", "/core/kata/play.js", "/core/kata/learn.js",
  "/core/kata/tool.js", "/core/kata/index.js",
  /* Feed まわり（2026-08-20） */
  "/core/feed/badge.js",   /* 公式マーク（2026-08-20） */
  "/core/feed/art.js",     /* お知らせに 添える 絵 48 種（2026-08-20） */
  "/core/feed/video.js",   /* 動画の 再生バー（Feed と News で 同じもの・2026-08-20） */
  /* 読み上げの 声の 一覧（2026-08-26）。**サーバの TTS_VOICES が 決めどころ**で、
     ここは その 受け皿と 控え。設定・声えらび・Lumi が これを 読む。 */
  "/core/tts/voices.js",
  /* 読み上げ原稿の タグ（2026-08-26）。会話文の 男女・感情・速さを
     原稿の 中の [ ] で 指す。編集画面・読み上げ・検査が 同じ ここを 読む。 */
  "/core/tts/script.js",
  /* Workplace へ 入れる SVG を **清める**（2026-08-28）。
     AI が 出した 絵を そのまま 入れるので、入れる前に 必ず 通す。 */
  "/core/wp/svg.js",
  /* 参考資料（自由に使える絵）を 探して 取り込む（2026-08-28）。
     4 つの 画面が 同じ ここを 使う（出どころの 出し忘れを 防ぐ）。 */
  "/core/wp/stock.js",
  /* 4 画面 共通の 見た目の 型（2026-08-28）。Slides しか 持っていなかった
     ものを Docs / Sheets / Forms へも 広げる。増やすのは ここだけ。 */
  "/core/wp/theme.js",
  /* 4 画面 共通の 数式（2026-08-28）。Docs にしか 無かったものを 全部へ。 */
  "/core/wp/math.js",
  "/core/board/store.js",
  "/core/board/play.js",     /* 板を 上から下まで 解説する（2026-08-19） */
  "@runtime",                /* ← /core/board/runtime.js を 文字列にして 埋める */
  "/core/board/app.js",
  "/core/board/ui.js"
];

/* 同じものを 2 回 入れない（前は idb.js が 2 回 入っていた） */
{
  const 見た = new Set(), 重複 = [];
  for (const f of 並び) { if (見た.has(f)) 重複.push(f); 見た.add(f); }
  if (重複.length) { console.error("並びに 同じものが あります: " + 重複.join(", ")); process.exit(1); }
}

function 読む(相対) {
  const p = path.join(CLIENT, 相対.replace(/^\//, ""));
  if (!fs.existsSync(p)) { console.error("ありません: " + 相対); process.exit(1); }
  return fs.readFileSync(p, "utf8");
}

const 束 = [];
for (const f of 並び) {
  if (f === "@runtime") {
    const 中 = 読む("/core/board/runtime.js");
    束.push("/* ───────── /core/board/runtime-embed.js ───────── */\n"
      + "(function(root){\n  \"use strict\";\n  var VQB = root.VQB || (root.VQB = {});\n"
      + "  /* AR App の 中で 使う 土台 API。**中身を そのまま 文字列で 持つ。** */\n"
      + "  VQB.RUNTIME = " + JSON.stringify(中) + ";\n"
      + "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n");
    continue;
  }
  束.push("/* ───────── " + f + " ───────── */\n" + 読む(f) + "\n");
}
const 中身 = 束.join("\n");

/* ── 出す先。名前の 指紋は 中身から 作る ───────────────────── */
const 指紋 = crypto.createHash("sha256").update(Buffer.from(中身, "utf8")).digest("hex").slice(0, 10);
const 出src = path.join(根, "js-src", "bundle-core." + 指紋 + ".js");

const 前 = fs.readdirSync(path.join(根, "js-src")).filter((x) => /^bundle-core\.[0-9a-f]{10}\.js$/.test(x));
const 同じ = 前.length === 1 && 前[0] === path.basename(出src);
console.log("部品 " + 並び.length + " 本 → " + 中身.length.toLocaleString() + " 字");
console.log("圧縮前: " + (前[0] || "(無し)") + " → " + path.basename(出src) + (同じ ? "（変わらず）" : ""));
if (見るだけ) process.exit(0);

/* ① 圧縮前を 置き換える */
for (const x of 前) if (x !== path.basename(出src)) fs.unlinkSync(path.join(根, "js-src", x));
fs.writeFileSync(出src, 中身, "utf8");

/* ② esbuild で 圧縮して client/js へ。名前は いまの参照のまま置き、
      指紋の付け替えは vqrehash.cjs に任せる（参照も同時に直るので）。 */
const html = fs.readFileSync(path.join(CLIENT, "index.html"), "utf8");
const 参照 = /\/js\/(bundle-core\.[0-9a-f]{10}\.js)/.exec(html);
if (!参照) { console.error("index.html が bundle-core を 指していません。"); process.exit(1); }
const 出先 = path.join(CLIENT, "js", 参照[1]);
const 仮 = path.join(require("os").tmpdir(), "vqbundle-" + 指紋 + ".js");
execFileSync("npx", ["esbuild", 出src, "--minify", "--target=es2020", "--outfile=" + 仮],
  { cwd: 根, stdio: ["ignore", "ignore", "inherit"] });
fs.copyFileSync(仮, 出先);
fs.unlinkSync(仮);
console.log("圧縮後: client/js/" + 参照[1] + " ← " + fs.statSync(出先).size.toLocaleString() + " バイト");
console.log("\n★ 続けて  node vqrehash.cjs  を 走らせること（名前を 変えないと 誰にも 届きません）。");
