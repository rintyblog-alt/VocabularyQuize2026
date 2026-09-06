/* ══════════════════════════════════════════════════════════════════════════
   vqcheckcheck — **検査を 検査する**（2026-09-06）

   なぜ 要るのか（実測・何ヶ月も 気づけなかった）:
     ① 検査が 読んで いる ファイルが **配られて いない** ことが ある。
        client/v2/** は 2026-08-18 で 止まって いて index.html から
        1度も 読まれて いない。そこを 測る 検査は、通っても 落ちても
        **本番と 何の 関係も 無い**。
     ② index.html から indexOf(…) で 切り出す 書きかたは、
        印が 無く なると **-1 に なり、静かに 空文字**を 返す。
        検査は 例外も 出さずに「合格」と 言う。
        13MB → 868KB の 切り出しで、この 書きかたは 全部 危ない。
     ③ そもそも 読もうと して いる ファイルが 無い。

   これは 「前は 動いてた」と 「長期間 なにも 測って いなかった」の 根。
   ここを 見張る 検査が 1本も 無かった。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const 根 = __dirname;

let 合 = 0, 否 = 0;
const 落ち = [];
function 見る(名, 良い, 追) {
  if (良い) { 合++; console.log("  ok   " + 名); }
  else { 否++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).split(",").join("\n         ") : "")); }
}

const 検査 = fs.readdirSync(根).filter(f => /^vq.*\.cjs$/.test(f) && f !== "vqcheckcheck.cjs");
console.log("══ 検査 " + 検査.length + " 本を 見ます ══\n");

/* ── ① 配られて いない ところを 測って いないか ──────────────────────── */
const HTML = fs.readFileSync(path.join(根, "client", "index.html"), "utf8");
const 配布中 = new Set();
for (const m of HTML.matchAll(/\/(js|css)\/([A-Za-z0-9_-]+\.[0-9a-f]{10}\.(?:js|css))/g)) 配布中.add(m[1] + "/" + m[2]);

/*  index.html ＋ そこから 読まれる /js /css を つないだ もの（圧縮前を 選ぶ）。
    2026-08-19 の 切り出し（13MB → 868KB）で、本体の コードは
    index.html の 外へ 出た。素の index.html だけを 見ると 何も 測れない。 */
const 束 = require("./vqsrc.cjs").丸ごと();

const 死んだ場所 = [
  { 印: /client\/v2\//, 名: "client/v2/**（2026-08-18 で 止まって いる。index.html から 読まれない）" },
];
{
  const 悪い = [];
  for (const f of 検査) {
    const s = fs.readFileSync(path.join(根, f), "utf8");
    for (const d of 死んだ場所) if (d.印.test(s)) 悪い.push(f + " → " + d.名);
  }
  見る("★ 配られて いない ところを 測って いる 検査が 無い", 悪い.length === 0, 悪い);
}

/* ── ② index.html を 切り出す 印が、いまも 在るか ────────────────────
   ★ 「index.html を 入れた 変数」に 対する indexOf だけを 見る。
     worker.js を 読んで いる ものまで 拾うと 誤検出に なる（実測）。
   ★ 注記（/* … *​/ と //）は 外して から 見る。書き置きの 例を 拾わない。 */
{
  const 悪い = [];
  const 注記を外す = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  for (const f of 検査) {
    let s = 注記を外す(fs.readFileSync(path.join(根, f), "utf8"));
    /*  index.html を 読んで いる 変数の 名を 拾う  */
    /*  ★ **どこと 突き合わせるか**を 変数ごとに 変える（ここを 間違えて いた）。
        素の index.html を 読む もの  → index.html だけ
        vqsrc の 丸ごと() を 読む もの → index.html ＋ /js /css を つないだ 束
        束の ほうが 広い ので、素の index.html だけと 比べると
        **在る ものを 無いと 言って しまう**。 */
    const 変数 = new Map();
    for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*index\.html[^;\n]*/g)) 変数.set(m[1], HTML);
    for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:require\([^)]*vqsrc[^)]*\)\.)?丸ごと\(\)/g)) 変数.set(m[1], 束);
    for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:require\([^)]*vqsrc[^)]*\)\.)?HTMLだけ\(\)/g)) 変数.set(m[1], HTML);
    if (!変数.size) continue;
    for (const [v, 干し草] of 変数) {
      const re = new RegExp(v.replace(/[$]/g, "\\$") + "\\.indexOf\\(\\s*([\"'`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1", "g");
      for (const m of s.matchAll(re)) {
        const 印 = m[2].replace(/\\(["'`\\])/g, "$1");
        if (印.length < 6) continue;
        if (干し草.includes(印)) continue;
        悪い.push(f + " の " + v + " が 探す 印が どこにも 無い: " + JSON.stringify(印.slice(0, 70)));
      }
    }
  }
  見る("★ index.html から 切り出す 印が ちゃんと 在る（-1 で 静かに 空に ならない）", 悪い.length === 0, 悪い);
}

/* ── ③ 読もうと して いる ファイルが 実在するか ────────────────────── */
{
  const 悪い = [];
  const 読み = /(?:readFileSync|existsSync)\(\s*(?:path\.join\(\s*(?:__dirname|ROOT|根)\s*,\s*)?["'`]([^"'`]+)["'`]/g;
  for (const f of 検査) {
    const s = fs.readFileSync(path.join(根, f), "utf8");
    for (const m of s.matchAll(読み)) {
      const 相対 = m[1];
      if (!/^(client|server|js-src|docs|local-ai)\//.test(相対)) continue;
      if (/\$\{|\*/.test(相対)) continue;
      if (!fs.existsSync(path.join(根, 相対))) 悪い.push(f + " → " + 相対);
    }
  }
  見る("★ 読もうと して いる ファイルが 実在する", 悪い.length === 0, 悪い);
}

/* ── ④ 指紋つきの 名前を 直に 書いて いないか（貼り直すと 死ぬ）────────── */
{
  const 悪い = [];
  for (const f of 検査) {
    const s = fs.readFileSync(path.join(根, f), "utf8");
    /*  js-src/ を 指して いる のは **正しい**（圧縮前が 本物）。
        client/js/ を 直に 指して いる ときだけ、貼り直しで 死ぬ。 */
    for (const m of s.matchAll(/["'`]client\/(js|css)\/([A-Za-z0-9_-]+\.[0-9a-f]{10}\.(?:js|css))["'`]/g)) {
      const 名 = m[1] + "/" + m[2];
      if (!配布中.has(名)) 悪い.push(f + " → " + m[0] + "（いま 配られて いない）");
    }
  }
  見る("★ 指紋つきの 名前を 直に 書いて いない（書くなら 配布中の もの）", 悪い.length === 0, 悪い);
}

/* ── ⑤ 死んだ セッションの 場所を 既定に して いないか ────────────────── */
{
  const 悪い = [];
  for (const f of 検査) {
    const s = fs.readFileSync(path.join(根, f), "utf8");
    for (const m of s.matchAll(/["'`](\/private\/tmp\/claude-[^"'`]+)["'`]/g)) {
      if (!fs.existsSync(m[1])) 悪い.push(f + " → " + m[1].slice(0, 80) + "…");
    }
  }
  見る("★ 消えた 一時の 場所を 既定に して いない", 悪い.length === 0, 悪い);
}

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否);
if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
console.log("");
process.exit(否 ? 1 : 0);
