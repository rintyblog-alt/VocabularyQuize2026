/* ══════════════════════════════════════════════════════════════════════════
   vqrehash.cjs — client/js・client/css のファイル名の **指紋を付け直す**。

   なぜ要るか:
     切り出したファイルは 名前の中に 中身の指紋が入っている
     （例 vq-core.4c23719c62.js）。ブラウザは この名前のものを
     **1 年 溜め込む**。だから 中身を直したのに 名前が同じままだと、
     直したものが **誰にも届かない**。
     逆に 名前さえ変えれば、確実に 全員へ届く。

   することは 3 つだけ:
     ① client/js・client/css の中を 見て、中身から 指紋を計算し直す
     ② 名前が違っていたら 付け替える（古いほうは消す）
     ③ index.html の 参照を 新しい名前へ書き換える

   使い方: node vqrehash.cjs        （直したあと 毎回）
           node vqrehash.cjs --見るだけ
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const 見るだけ = process.argv.includes("--見るだけ");
const CLIENT = path.join(__dirname, "client");
const INDEX = path.join(CLIENT, "index.html");

const existsCss = (p2) => fs.existsSync(p2) && fs.statSync(p2).isDirectory();
let html = fs.readFileSync(INDEX, "utf8");
let 変えた = 0, 見た = 0;
const 記録 = [];
/* ★ **中身が そっくり 同じ 2 本**を 見つける（2026-08-31・訴え
   「設定画面の 導線が 古い方に 戻ってる」）。

   起きていたこと（実測）:
     client/js/vq-settings.*.js の 中身が **設定ストアと 1 バイト 違わず 同じ**
     だった（55,312 バイト）。組む ときに 元を 取り違えた まま 気づかず、
     指紋が 同じに なるので この 道具が 同じ 名前へ 寄せて しまい、
     本物の 設定画面（114,916 バイト）は **一度も 配られていなかった**。
     画面には 何も 出ない。ただ window.__vqOpenSettings が 生えないので、
     設定の 入口が 昔の 画面へ 落ちるだけ。

   同じ 指紋の 2 本は **まず 間違い**なので、ここで 声を 上げる。 */
const 指紋ごと = new Map();

for (const [dir, ext] of [["js", ".js"], ["css", ".css"], ["vendor/lib", ".js"], ["vendor/lib", ".css"], ["vendor/fonts", ".woff2"]]) {
  const d = path.join(CLIENT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const m = new RegExp("^(.+)\\.([0-9a-f]{10})\\" + ext + "$").exec(f);
    if (!m) continue;
    見た++;
    /* ★ 書体などは **文字ではなく そのままの並び**で読む。
       utf8 として読むと 中身が変わってしまい、指紋も 大きさも 狂う
       （実際に 415,128 バイトが 752,075 バイトに化けた）。 */
    const 文字もの = ext === ".js" || ext === ".css";
    const 中身 = 文字もの ? fs.readFileSync(path.join(d, f), "utf8") : fs.readFileSync(path.join(d, f));
    const 指紋 = crypto.createHash("sha256")
      .update(文字もの ? Buffer.from(中身, "utf8") : 中身).digest("hex").slice(0, 10);
    const 名前 = dir + "/" + m[1] + ext;
    if (!指紋ごと.has(指紋)) 指紋ごと.set(指紋, new Set());
    指紋ごと.get(指紋).add(名前);
    if (指紋 === m[2]) continue;
    const 新名 = m[1] + "." + 指紋 + ext;
    const 旧道 = "/" + dir + "/" + f, 新道 = "/" + dir + "/" + 新名;
    /* 書体は index.html ではなく **CSS の中**から指されている。
       そちらも見て、必要なら CSS 側を書き換える（そうしないと
       名前だけ変わって 書体が 404 になる）。 */
    let cssで直した = false;
    if (!html.includes(旧道)) {
      const cssDir = path.join(CLIENT, "css");
      if (existsCss(cssDir)) {
        for (const cf of fs.readdirSync(cssDir)) {
          if (!cf.endsWith(".css")) continue;
          const cp = path.join(cssDir, cf);
          const t = fs.readFileSync(cp, "utf8");
          if (!t.includes(旧道)) continue;
          if (!見るだけ) fs.writeFileSync(cp, t.split(旧道).join(新道), "utf8");
          cssで直した = true;
        }
      }
      if (!cssで直した) {
        console.log("  ⚠ どこからも " + 旧道 + " を参照していません（そのまま）");
        continue;
      }
    }
    記録.push({ 旧: f, 新: 新名, バイト: 文字もの ? Buffer.byteLength(中身, "utf8") : 中身.length });
    if (!見るだけ) {
      fs.renameSync(path.join(d, f), path.join(d, 新名));
      if (!cssで直した) html = html.split(旧道).join(新道);
    }
    変えた++;
  }
}

if (!見るだけ && 変えた) fs.writeFileSync(INDEX, html, "utf8");

記録.forEach((r) => console.log("  " + r.旧 + "\n    → " + r.新 + "  (" + r.バイト + " バイト)"));
console.log(見るだけ ? `見ただけ: ${見た} 本中 ${変えた} 本が 付け替え待ち` : `${見た} 本中 ${変えた} 本の 指紋を 付け替えました`);

/* ★ 中身が そっくり 同じ 2 本は 組む 元の 取り違え。止める。 */
const 双子 = [...指紋ごと.values()].filter((v) => v.size >= 2).map((v) => [...v]);
if (双子.length) {
  console.error("✗ 中身が まったく 同じ ファイルが あります（組む 元の 取り違えです）:");
  双子.forEach((g) => console.error("   " + g.join("  ＝  ")));
  console.error("   → js-src の どれから 組んだかを 確かめてください。");
  process.exit(1);
}

/* 参照の食い違いが 残っていないか 最後に見る */
const 抜け = [];
for (const m of html.matchAll(/\/(js|css|vendor\/lib|vendor\/fonts)\/([A-Za-z0-9_.-]+\.[0-9a-f]{10}\.(?:js|css|woff2))/g)) {
  const f = path.join(CLIENT, m[1], m[2]);
  if (!fs.existsSync(f)) 抜け.push(m[0]);
}
if (抜け.length) { console.error("✗ index.html が 無いファイルを指しています:\n   " + [...new Set(抜け)].join("\n   ")); process.exit(1); }
console.log("参照の食い違い: なし");
