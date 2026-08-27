#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqbanner.cjs — 表紙（バナー）と 文字が 重なっていないかを **実測**する

   ★ 訴え（2026-08-27）
     「プロフィール画面の 文字、プリセット詳細画面の プリセット名が
       スマホだと バナーと かぶってしまってる 少しだけ。はみ出てる感じ。
       必ず バナーに 一切 被らないように 少し 下げてもらってもいい？」

   ★ やりかた
     ・本物の CSS を そのまま 取り出して 使う（書き写さない）。
       - プリセット詳細 … js-src/vq2-app.*.js の SHELL_CSS
       - プロフィール   … js-src/vq-feed.*.js の CSS 配列
     ・本物と 同じ 組み立ての HTML を 置いて、
       **表紙の 下端**と **文字の 上端**を getBoundingClientRect で 測る。
     ・文字の 上端 ≥ 表紙の 下端 なら 合格。顔／アイコンは かぶってよい。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const 根 = __dirname;
let OK = 0, NG = 0;
function ok(n, m) { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); }
function ng(n, m) { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); }

function 探す(前) {
  const f = fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith(前) && x.endsWith(".js"));
  if (!f) throw new Error("見つからない: " + 前);
  return fs.readFileSync(path.join(根, "js-src", f), "utf8");
}

/* SHELL_CSS（1 本の 文字列）を そのまま 取り出す */
function shellCss() {
  const s = 探す("vq2-app.");
  const i = s.indexOf("var SHELL_CSS =");
  if (i < 0) throw new Error("SHELL_CSS が 無い");
  const j = s.indexOf("\n", s.indexOf('";', i));
  return eval(s.slice(i, j).replace(/^var SHELL_CSS =/, "").replace(/;\s*$/, ""));
}

/* vq-feed の CSS は 配列 var CSS = [ ... ].join("") */
function feedCss() {
  const s = 探す("vq-feed.");
  const i = s.indexOf("var CSS = [");
  if (i < 0) throw new Error("vq-feed の CSS が 無い");
  /* 対応する ] を 数えて 取る */
  let d = 0, j = i;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === "[") d++;
    else if (c === "]") { d--; if (d === 0) { j++; break; } }
    else if (c === '"') { j++; while (j < s.length && !(s[j] === '"' && s[j - 1] !== "\\")) j++; }
  }
  const arr = eval(s.slice(i + "var CSS = ".length, j));
  return arr.join("");
}

/* ── 測る 中身 ─────────────────────────────────────────────────── */
const 長い名前 = "中学3年 理科 総まとめ 光と音と力のはたらき 完全版";
const 短い名前 = "英単語";

function 詳細HTML(名前, mobile) {
  return '<div class="vq2-root is-sheet vq2-pd' + (mobile ? " is-mobile" : "") + '">'
    + '<div class="vq2-pd-head" data-pat="plain" data-probe="banner">'
    + '<div class="vq2-pd-kinds"><span class="vq2-pd-kind">公開プリセット</span></div>'
    + "</div>"
    + '<div class="vq2-pd-id"><span class="vq2-pd-icon is-emoji" data-probe="face">📘</span>'
    + '<div class="vq2-pd-name"><div class="vq2-pd-t" data-probe="title">' + 名前 + "</div>"
    + '<div class="vq2-pd-by" data-probe="by">つくった人 · @rinty</div></div></div>"'
    + "</div>";
}

function プロフHTML(名前) {
  return '<div class="pf">'
    + '<div class="pf-cover" data-probe="banner"></div>'
    + '<div class="pf-head"><span class="pf-ava" data-probe="face">R</span>'
    + '<div class="pf-id"><div class="pf-name"><h1 data-probe="title">' + 名前 + "</h1></div>"
    + '<div class="pf-at" data-probe="by">@rinty_0401 · 高3</div></div>'
    + '<div class="pf-btns"><button class="btn btn--secondary">編集</button></div></div>'
    + "</div>";
}

(async () => {
  const SC = shellCss(), FC = feedCss();
  const browser = await chromium.launch();
  const 幅一覧 = [320, 360, 390, 414, 768, 1024];

  async function 測る(css, html, w, mobile) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box;margin:0;padding:0}'
      + "html,body{width:100%}</style><style>" + css + "</style>"
      + '<div id="probe-host" style="width:100%">' + html + "</div>");
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const g = (k) => {
        const e = document.querySelector('[data-probe="' + k + '"]');
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, h: b.height, w: b.width };
      };
      return { banner: g("banner"), title: g("title"), by: g("by"), face: g("face") };
    });
    await page.close();
    return r;
  }

  console.log("── ① プリセット詳細（vq2-pd）─────────────────────────");
  for (const w of 幅一覧) {
    const mobile = w < 880;
    for (const [ラベル, 名前] of [["短い名前", 短い名前], ["長い名前", 長い名前]]) {
      /* .vq2-root は position:absolute/fixed なので、測るために 静的に 落とす */
      const css = SC + "\n.vq2-root{position:static !important;transform:none !important;"
        + "max-height:none !important;height:auto !important;width:100% !important;overflow:visible !important;}";
      const r = await 測る(css, 詳細HTML(名前, mobile), w, mobile);
      if (!r.banner || !r.title) { ng(`pd ${w}px ${ラベル}`, "測れなかった"); continue; }
      const 差 = Math.round((r.title.top - r.banner.bottom) * 10) / 10;
      const n = `pd ${w}px ${ラベル}`;
      if (差 >= 0) ok(n, `名前の上端は 表紙の ${差}px 下`);
      else ng(n, `名前が 表紙に ${-差}px かぶっている`);
      /* 見た目の 芯は「顔／アイコンは 表紙に またがる」。直しすぎて 平らに
         なっていないことも 同時に 見る（かぶりを 消すだけなら 通ってしまう）。 */
      if (r.face) {
        const 乗 = Math.round((r.banner.bottom - r.face.top) * 10) / 10;
        const 下 = Math.round((r.face.bottom - r.banner.bottom) * 10) / 10;
        if (乗 >= 20 && 下 > 0) ok(n + " 顔", `表紙に ${乗}px またがる`);
        else ng(n + " 顔", `またがりが 足りない（上 ${乗}px / 下 ${下}px）`);
      }
    }
  }

  console.log("── ② プロフィール（pf）───────────────────────────────");
  for (const w of 幅一覧) {
    for (const [ラベル, 名前] of [["短い名前", "りんと"], ["長い名前", "りんと・ばぶばぶ・でぃべろっぱー"]]) {
      const r = await 測る(FC, プロフHTML(名前), w, w < 640);
      if (!r.banner || !r.title) { ng(`pf ${w}px ${ラベル}`, "測れなかった"); continue; }
      const 差 = Math.round((r.title.top - r.banner.bottom) * 10) / 10;
      const n = `pf ${w}px ${ラベル}`;
      if (差 >= 0) ok(n, `名前の上端は 表紙の ${差}px 下`);
      else ng(n, `名前が 表紙に ${-差}px かぶっている`);
      /* 見た目の 芯は「顔／アイコンは 表紙に またがる」。直しすぎて 平らに
         なっていないことも 同時に 見る（かぶりを 消すだけなら 通ってしまう）。 */
      if (r.face) {
        const 乗 = Math.round((r.banner.bottom - r.face.top) * 10) / 10;
        const 下 = Math.round((r.face.bottom - r.banner.bottom) * 10) / 10;
        if (乗 >= 20 && 下 > 0) ok(n + " 顔", `表紙に ${乗}px またがる`);
        else ng(n + " 顔", `またがりが 足りない（上 ${乗}px / 下 ${下}px）`);
      }
    }
  }

  await browser.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
