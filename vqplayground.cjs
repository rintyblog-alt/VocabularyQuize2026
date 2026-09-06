/* ══════════════════════════════════════════════════════════════════════════
   vqplayground — プレイグラウンドが **本当に 動くか**（2026-09-07）

   なぜ 要るのか:
     何百種類を 入れる ので、1 本ずつ 手で 開いて 確かめる のは 無理。
     「一覧には 出るが 開くと 真っ白」を **入れた その日に** 捕まえる。

   やること:
     ① 左の 帯に 出る（画面の 種・サーバの 種・押した ときの 割り振り の 3 つ）
     ② index.html が 2 本とも 読んで いる
     ③ 全部の シミュを **実際に 走らせる**（はじめ → 進める 240 こま → 読み → 描く）
        NaN・例外・数値の 発散を 見る
     ④ 定義が そろって いる（題・ひとこと・学び・つまみの 範囲）
     ⑤ モバイルの 手当てが 入って いる
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const 根 = __dirname;

let 合 = 0, 否 = 0; const 落ち = [];
function 見る(名, 良い, 追) {
  if (良い) { 合++; console.log("  ok   " + 名); }
  else { 否++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
}
const 読む = (p) => fs.readFileSync(path.join(根, p), "utf8");

/* ══ ① 左の 帯 ════════════════════════════════════════════════════ */
console.log("\n■ ① 左の 帯に 出る");
const shell = require("./vqsrc.cjs").塊 ? require("./vqsrc.cjs").塊("vq-shell") : "";
const SHELL = shell || (function () {
  const d = path.join(根, "js-src");
  for (const f of fs.readdirSync(d)) if (/^vq-shell\./.test(f)) return fs.readFileSync(path.join(d, f), "utf8");
  return "";
})();
見る("画面の 種に playground が ある", /key:\s*"playground"[\s\S]{0,160}fn:playground/.test(SHELL));
見る("アイコン flask が 定義されて いる", /\bflask:\s*'/.test(SHELL));
見る("押した ときに __vqPlayground.open を 呼ぶ",
  /dataset\.fn === "playground"[\s\S]{0,220}__vqPlayground[\s\S]{0,40}open\(\)/.test(SHELL));
const ADMIN = 読む("server/src/admin.js");
見る("サーバの 種に playground が ある", /\["playground",[\s\S]{0,120}fn:playground/.test(ADMIN));
見る("すでに ある DB へ 入れ直す 一文が ある（無いと 左に 出ない）",
  /INSERT OR IGNORE INTO feature_flags[\s\S]{0,420}'playground'/.test(ADMIN));

/* ══ ② index.html ═════════════════════════════════════════════════ */
console.log("\n■ ② 配って いる");
const IDX = 読む("client/index.html");
const 土 = /\/js\/(vq-playground\.[0-9a-f]{10}\.js)/.exec(IDX);
const 中 = /\/js\/(vq-plg-sim\.[0-9a-f]{10}\.js)/.exec(IDX);
見る("index.html が vq-playground を 読む", !!土, 土 && 土[1]);
見る("index.html が vq-plg-sim を 読む", !!中, 中 && 中[1]);
見る("その ファイルが 実在する", !!土 && !!中 &&
  fs.existsSync(path.join(根, "client/js", 土[1])) && fs.existsSync(path.join(根, "client/js", 中[1])));
見る("土台が 先、中身が あと（読む 順）",
  !!土 && !!中 && IDX.indexOf(土[1]) < IDX.indexOf(中[1]));

/* ══ ③ 全部を 走らせる ════════════════════════════════════════════ */
console.log("\n■ ③ ぜんぶ 走らせる（はじめ → 240 こま → 読み → 描く）");
const 定義 = [];
{
  const g = { window: {}, console: { warn() { }, log() { } }, Math, Date, JSON, isFinite, parseFloat, parseInt, String, Number, Array, Object, Boolean };
  g.globalThis = g; g.window.VQPLG = { 足す: (d) => 定義.push(d) };
  vm.createContext(g);
  try { vm.runInContext(読む("js-src/vq-plg-sim.js"), g, { timeout: 20000 }); }
  catch (e) { console.log("  ✗ 読み込みで 落ちました: " + e.message); process.exit(1); }
}
見る("シミュレーションが 登録された", 定義.length > 0, 定義.length + " 本");

/* 描く ための 偽の 道具。呼ばれた 回数を 数え、NaN を 見つける。 */
function 偽色() {
  const c = {};
  ["暗い", "地", "沈", "枠", "薄枠", "字", "副字", "薄字", "主", "赤", "青", "緑", "橙", "紫", "桃", "青緑", "黄", "灰"]
    .forEach((k) => { c[k] = k === "暗い" ? false : "#808080"; });
  return c;
}
function NaN見(名, 引数, 悪) {
  for (const v of 引数) if (typeof v === "number" && !isFinite(v)) { 悪.push(名 + " に " + v); return; }
}
function 偽2D(悪) {
  const rec = { 回数: 0 };
  const f = (名) => function () { rec.回数++; NaN見(名, arguments, 悪); return undefined; };
  const g = {
    色: 偽色(), 幅: 800, 高: 500,
    ctx: {
      fillRect: f("fillRect"), beginPath() { }, arc: f("arc"), fill() { }, stroke() { },
      save() { }, restore() { }, roundRect: f("roundRect"), ellipse: f("ellipse"), closePath() { },
      measureText: () => ({ width: 30 }), fillText: f("fillText"), moveTo: f("moveTo"), lineTo: f("lineTo"),
      set fillStyle(v) { }, set strokeStyle(v) { }, set lineWidth(v) { }, set globalAlpha(v) { },
      set font(v) { }, set textAlign(v) { }, set textBaseline(v) { }, set lineCap(v) { }, set lineJoin(v) { },
      setLineDash() { }, setTransform() { }, clearRect() { }
    },
    整える() { }, 消す() { }, 世界: f("世界"), 格子: f("格子"),
    X: (v) => v * 10, Y: (v) => -v * 10, L: (v) => v * 10, 逆X: (v) => v / 10, 逆Y: (v) => -v / 10,
    線: f("線"), 道(点, o) { rec.回数++; (点 || []).forEach((p) => NaN見("道の点", p, 悪)); },
    円: f("円"), 四角: f("四角"), 弧: f("弧"), 矢印: f("矢印"), ばね: f("ばね"),
    文字(x, y, s, o) { rec.回数++; NaN見("文字の位置", [x, y], 悪); if (String(s).indexOf("NaN") >= 0) 悪.push("文字に NaN: " + s); },
    目盛: f("目盛")
  };
  return { g, rec };
}
function 偽3D(悪) {
  const rec = { 回数: 0 };
  const f = (名) => function () { rec.回数++; NaN見(名, arguments, 悪); };
  const h = {
    目: { 方位: 0.7, 仰角: 0.5, 距離: 6, 的: [0, 0, 0], 画角: 0.9 },
    幅: 800, 高: 500, 整える() { }, 始め() { }, 向き: f("向き"),
    箱: f("箱"), 球: f("球"), 筒: f("筒"),
    棒(a, b) { rec.回数++; NaN見("棒a", a || [], 悪); NaN見("棒b", b || [], 悪); },
    板: f("板"),
    線(点) { rec.回数++; (点 || []).forEach((p) => NaN見("線の点", p, 悪)); },
    床: f("床"),
    画面へ(p) { NaN見("画面への点", p || [], 悪); return { x: 100, y: 100 }; }
  };
  return { h, rec };
}

let 走った = 0, 壊れた = [];
定義.forEach((d) => {
  const 悪 = [];
  const c = {};
  (d.つまみ || []).forEach((t) => {
    c[t.id] = t.既定 !== undefined ? t.既定
      : t.型 === "入" ? false : t.型 === "選" ? (t.選択 && t.選択[0] ? t.選択[0][1] : null) : Number(t.最小) || 0;
  });
  const s = {};
  const 三 = d.次元 === "3d";
  const { g, rec } = 三 ? (function () { const r = 偽3D(悪); return { g: r.h, rec: r.rec }; })() : 偽2D(悪);
  const hud = 偽2D(悪).g;
  try {
    if (d.はじめ) d.はじめ(s, c, { 色: 偽色() });
    for (let i = 0; i < 240; i++) if (d.進める) d.進める(s, c, 1 / 60, { 色: 偽色() });
    if (d.読み) {
      const r = d.読み(s, c) || [];
      r.forEach((x) => {
        if (typeof x.値 === "number" && !isFinite(x.値)) 悪.push("読み『" + x.名 + "』が " + x.値);
        if (!x.名) 悪.push("読みに 名が 無い");
      });
    }
    if (d.グラフ && d.グラフ.取る) {
      const v = d.グラフ.取る(s, c);
      if (v !== null && typeof v === "number" && !isFinite(v)) 悪.push("グラフの値が " + v);
    }
    if (d.描く) d.描く(g, s, c, hud);
    /* 状態の 中に NaN が 残って いないか */
    Object.keys(s).forEach((k) => { if (typeof s[k] === "number" && !isFinite(s[k])) 悪.push("状態 " + k + " が " + s[k]); });
    if (!rec.回数) 悪.push("何も 描いて いない");
    走った++;
  } catch (e) {
    悪.push("例外: " + (e && e.message));
  }
  if (悪.length) 壊れた.push(d.id + " → " + 悪.slice(0, 3).join(" / "));
});
見る("★ 全部が 例外なく 240 こま 走る", 壊れた.length === 0, 壊れた.slice(0, 8).join("\n         "));
見る("走らせた 本数", 走った === 定義.length, 走った + " / " + 定義.length);

/* つまみを 端まで 振っても 壊れないか（いちばん 出やすい 崩れ） */
let 端壊れ = [];
定義.forEach((d) => {
  (d.つまみ || []).forEach((t) => {
    if (t.型 === "入" || t.型 === "選") return;
    [t.最小, t.最大].forEach((v) => {
      const c = {}; (d.つまみ || []).forEach((u) => {
        c[u.id] = u.既定 !== undefined ? u.既定 : u.型 === "入" ? false : u.型 === "選" ? (u.選択[0] || [])[1] : Number(u.最小) || 0;
      });
      c[t.id] = v;
      const s = {}, 悪 = [];
      const 三 = d.次元 === "3d";
      const { g } = 三 ? (function () { const r = 偽3D(悪); return { g: r.h }; })() : 偽2D(悪);
      const hud = 偽2D(悪).g;
      try {
        if (d.はじめ) d.はじめ(s, c, {});
        for (let i = 0; i < 120; i++) if (d.進める) d.進める(s, c, 1 / 60, {});
        if (d.読み) d.読み(s, c);
        if (d.描く) d.描く(g, s, c, hud);
        Object.keys(s).forEach((k) => { if (typeof s[k] === "number" && !isFinite(s[k])) 悪.push(k + "=" + s[k]); });
      } catch (e) { 悪.push("例外 " + e.message); }
      if (悪.length) 端壊れ.push(d.id + " の " + t.id + "=" + v + " → " + 悪.slice(0, 2).join("/"));
    });
  });
});
見る("★ つまみを 端まで 振っても 壊れない", 端壊れ.length === 0, 端壊れ.slice(0, 6).join("\n         "));

/* ══ ④ 定義が そろって いる ══════════════════════════════════════ */
console.log("\n■ ④ 1 つ 1 つ ちゃんと 作って ある");
const 欠け = [];
定義.forEach((d) => {
  const 무 = [];
  if (!d.題) 무.push("題");
  if (!d.ひとこと || String(d.ひとこと).length < 10) 무.push("ひとこと（10字以上）");
  if (!d.教科) 무.push("教科");
  if (!d.分野) 무.push("分野");
  if (!d.描く) 무.push("描く");
  if (!(d.学び && d.学び.length >= 3)) 무.push("学び（3つ以上）");
  if (!d.読み) 무.push("読み");
  if (!(d.つまみ && d.つまみ.length >= 1)) 무.push("つまみ");
  if (d.つまみ && d.つまみ.length > 5) 무.push("つまみが 6 つ以上（モバイルで 触れない）");
  (d.つまみ || []).forEach((t) => {
    if (!t.名) 무.push("つまみ " + t.id + " に 名");
    if (t.型 !== "入" && t.型 !== "選") {
      if (!(Number(t.最大) > Number(t.最小))) 무.push("つまみ " + t.id + " の 範囲");
      if (t.既定 < t.最小 || t.既定 > t.最大) 무.push("つまみ " + t.id + " の 既定が 範囲の 外");
    }
    if (t.型 === "選" && !(t.選択 && t.選択.length >= 2)) 무.push("つまみ " + t.id + " の 選択肢");
  });
  if (무.length) 欠け.push(d.id + " → " + 무.join(", "));
});
見る("★ そろって いない ものが 無い", 欠け.length === 0, 欠け.slice(0, 6).join("\n         "));
const id見た = {}; const 重 = [];
定義.forEach((d) => { if (id見た[d.id]) 重.push(d.id); id見た[d.id] = 1; });
見る("id が かぶって いない", 重.length === 0, 重);
const 教科数 = {};
定義.forEach((d) => { 教科数[d.教科] = (教科数[d.教科] || 0) + 1; });
見る("理科・数学・社会 の どれにも ある",
  教科数["理科"] > 0 && 教科数["数学"] > 0 && 教科数["社会"] > 0,
  Object.keys(教科数).map((k) => k + " " + 教科数[k]).join(" / "));
見る("3D の ものが ある", 定義.some((d) => d.次元 === "3d"),
  定義.filter((d) => d.次元 === "3d").length + " 本");

/* ══ ⑤ モバイル ══════════════════════════════════════════════════ */
console.log("\n■ ⑤ モバイル（訴え「PC だけでなく、モバイルにも」）");
const PG = 読む("js-src/vq-playground.js");
見る("狭い 画面で 舞台を 上・つまみを 下に 積む",
  /@media \(max-width:860px\)[\s\S]{0,400}\.stage__main\{flex-direction:column/.test(PG));
見る("押す ところが 44px 以上（狭い 画面）", /@media \(max-width:860px\)[\s\S]{0,600}\.btn\{min-height:44px/.test(PG));
見る("下端に セーフエリアを 足して いる（自分で 埋めない）",
  (PG.match(/var\(--vq-sab,0px\)/g) || []).length >= 3);
見る("横に すべらない（はみ出しは 自分の 中で）", /overflow:auto|overflow-x:auto/.test(PG) && !/overflow-x:scroll/.test(PG));
見る("指で 触れる（pointer で 受ける）", /pointerdown/.test(PG) && /pointermove/.test(PG) && /touch-action:none/.test(PG));
見る("つまんで 寄れる（2 本指）", /指\[e\.pointerId\]/.test(PG) && /Math\.hypot/.test(PG));
見る("3D が 使えない 端末に 断りを 出す", /no3d/.test(PG) && /WebGL が 使えない/.test(PG));

/* ══ ⑥ 一覧は プリセットと 同じ ════════════════════════════════════ */
console.log("\n■ ⑥ 一覧は プリセット一覧と 同じ 見た目");
見る("vq-screens の CSS を 借りて いる（写して いない）", /window\.__vqScreensCss/.test(PG));
const SCR = (function () {
  const d = path.join(根, "js-src");
  for (const f of fs.readdirSync(d)) if (/^vq-screens\./.test(f)) return fs.readFileSync(path.join(d, f), "utf8");
  return "";
})();
見る("vq-screens が CSS を 外へ 出して いる", /window\.__vqScreensCss = CSS;/.test(SCR));
["ph__title", "toolbar", "sbox", "seg", "chips", "chip", "tabs", "tab__c", "pgrid", "psec__t", "pc__ban", "pc__kind", "empty__t"]
  .forEach(() => { });
const 借りる = ["ph", "toolbar", "sbox", "seg", "chips", "tabs", "pgrid", "psec", "pc__ban", "pc__kinds", "empty"];
const 無い = 借りる.filter((k) => !new RegExp('class="' + k + '\\b|class="[^"]*\\b' + k + '\\b').test(PG));
見る("プリセットと 同じ 部品を 使って いる", 無い.length === 0, 無い);
見る("タブ・チップ・並び替え・表示切替が ある",
  /data-plg-tab/.test(PG) && /data-plg-field/.test(PG) && /data-plg-sort/.test(PG) && /data-plg-view/.test(PG));

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "　　シミュレーション " + 定義.length + " 本");
if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
console.log("");
process.exit(否 ? 1 : 0);
