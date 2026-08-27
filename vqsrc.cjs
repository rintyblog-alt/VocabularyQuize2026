/* ══════════════════════════════════════════════════════════════════════════
   vqsrc.cjs — 「配っているもの 全部」を 1 本の文字列にして返す。

   なぜ要るか（2026-08-18）:
     それまで client/index.html は 13MB の 1 枚ものだった。
     JS も CSS も 全部その中にあったので、テストは index.html を
     読むだけで 中身を見られた。
     いまは 大きな <script> / <style> を client/js・client/css へ
     出してある。**index.html だけを読むと 中身が見えない。**
     見えないまま「その書き方が無い」と判定すると、
     直っているのに 落ちる／壊れているのに 通る、が起きる。

   使い方:
     const { 丸ごと, HTMLだけ, 部品 } = require("./vqsrc.cjs");
     const src = 丸ごと();     // index.html ＋ 読んでいる js/css を つないだもの
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const CLIENT = path.join(__dirname, "client");
const INDEX = path.join(CLIENT, "index.html");

function HTMLだけ() { return fs.readFileSync(INDEX, "utf8"); }

/* index.html が 指している /js/ /css/ を 順番どおりに並べて返す */
function 部品() {
  const html = HTMLだけ();
  const 出 = [];
  for (const m of html.matchAll(/\/(js|css)\/([A-Za-z0-9_-]+\.[0-9a-f]{10}\.(?:js|css))/g)) {
    const f = path.join(CLIENT, m[1], m[2]);
    if (!fs.existsSync(f)) throw new Error("index.html が 無いファイルを指しています: " + m[0]);
    出.push({ 道: m[0], 実: f });
  }
  /* 同じものを 2 回 数えない */
  const 見た = new Set();
  return 出.filter((x) => (見た.has(x.道) ? false : (見た.add(x.道), true)));
}

let _控え = null, _印 = "";
/* ★ **圧縮前を 返す**（2026-08-28・実測で 踏んだ）。
   client/js/*.js は esbuild で 圧縮してある。中身を 見る検査は
   `name === "lookScreen"` のような **書いたままの 形**を 探すので、
   圧縮ずみを 渡すと **いつも 見つからない**＝ 何も 測っていないのに 通る／落ちる。
   実際に vqtools（受け口の 検査・113 件）・vqlumiusage・vqlumilog が
   ずっと 壊れていた。`塊()` は もともと js-src を 優先しているので、
   ここも そろえる。js-src に 無いものだけ 出来上がりを 読む。 */
function 圧縮前を選ぶ(道, 実) {
  const m = /\/js\/([A-Za-z0-9_-]+)\.[0-9a-f]+\.js$/.exec(道);
  if (m) {
    const 生 = 圧縮前(m[1]);
    if (生) return 生;
  }
  return fs.readFileSync(実, "utf8");
}
function 丸ごと() {
  const html = HTMLだけ();
  const 一覧 = 部品();
  const 印 = String(html.length) + ":" + 一覧.map((x) => x.道).join(",");
  if (_控え && _印 === 印) return _控え;
  const 束 = [html];
  for (const x of 一覧) 束.push("\n/* ── " + x.道 + " ── */\n" + 圧縮前を選ぶ(x.道, x.実));
  _控え = 束.join("\n");
  _印 = 印;
  return _控え;
}

/* ══ 特定のブロックだけを 取り出す ══════════════════════════════════
   前は index.html の中で
     src.slice(src.indexOf('<script id="vq-live">'), …)
   のように 切り出していた。いまは 中身が 外のファイルにあるので、
   その書き方では **空文字**が返る（indexOf が -1 になり、気づかず通る）。
   id を渡せば、インラインでも 外のファイルでも 中身を返す。 */
/* 圧縮前のソースが js-src/ にあるなら **そちらを返す**。
   client/js/*.js は esbuild で圧縮してあり、名前も中身も読めない。
   中身を検査するテストは 圧縮前を見ないと 意味が無い。 */
function 圧縮前(id) {
  const d = path.join(__dirname, "js-src");
  if (!fs.existsSync(d)) return null;
  const re = new RegExp("^" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.[0-9a-f]{10}\\.js$");
  for (const f of fs.readdirSync(d)) if (re.test(f)) return fs.readFileSync(path.join(d, f), "utf8");
  return null;
}

function 塊(id) {
  const 生 = 圧縮前(id);
  if (生) return 生;
  const html = HTMLだけ();
  /* ① 外のファイルを 指している場合 */
  const 外 = new RegExp('<(?:script|link)[^>]*id="' + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                        '"[^>]*(?:src|href)="(/(?:js|css)/[^"]+)"').exec(html);
  if (外) {
    const f = path.join(CLIENT, 外[1].replace(/^\//, ""));
    if (!fs.existsSync(f)) throw new Error("塊(" + id + "): ファイルが無い " + 外[1]);
    return fs.readFileSync(f, "utf8");
  }
  /* ② まだ index.html の中にある場合 */
  for (const tag of ["script", "style"]) {
    const 開 = new RegExp("<" + tag + "[^>]*id=\"" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\"[^>]*>").exec(html);
    if (!開) continue;
    const s0 = 開.index + 開[0].length;
    const e0 = html.indexOf("</" + tag + ">", s0);
    if (e0 < 0) throw new Error("塊(" + id + "): 閉じタグが無い");
    return html.slice(s0, e0);
  }
  throw new Error("塊(" + id + "): 見つからない");
}

module.exports = { 丸ごと, HTMLだけ, 部品, 塊, INDEX, CLIENT };

if (require.main === module) {
  const s = 丸ごと(), 一覧 = 部品();
  console.log("index.html:", Buffer.byteLength(HTMLだけ(), "utf8"), "バイト");
  console.log("つないだ部品:", 一覧.length, "本");
  console.log("合計:", Buffer.byteLength(s, "utf8"), "バイト");
}
