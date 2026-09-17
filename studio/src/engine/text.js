/* ══════════════════════════════════════════════════════════════════════════
   engine/text.js — 文字を canvas に焼く所（CapCut のテロップ相当）

   ★ 何をする所か
     契約書 §1 の TextSpec / TextStyle を受け取り、**1 枚の canvas**（画面と
     同じ寸法・透明背景）に文字を描いて返す。合成器（engine/compositor.js /
     engine/canvas2d.js）はそれをテクスチャ 1 枚として扱うだけで済む。
       renderText(spec, opts) -> canvas      … 時刻つき（入り/出/ループのアニメ込み）
       measureText(spec, opts) -> 寸法        … 当たり判定・自動縮小・見本用
       layoutText(...)        -> 行に折る     … **純関数**（Node で試験できる）
       TEXT_ANIMS / TEXT_PRESETS / FONT_STACKS … 名簿（UI と AI が名前で引く）

   ★ なぜこの形か
     ・**幅の測定を関数で受ける**（`measureFn(text)->w`）。canvas が無い Node でも
       折返しの規則を試験できる。これが無いと「見た目の要」が一切試験できない。
     ・座標は全部 **device px**（canvas の裏の大きさ）で計算し、`ctx.scale()` を
       使わない。canvas の影（shadowOffsetX/Y・shadowBlur）は **CTM の影響を
       受けない**仕様なので、拡大を CTM に任せると影とぼかしだけが狂う。
     ・影・グロー・ぼかしは全て **「遠くに描いて影だけを画面に落とす」**技で出す
       （§13.2 のとおり `ctx.filter` は Safari に無い。CSS filter は使えない）。
     ・縁取りは太→細の二重描き + `lineJoin:"round"`。1 回だけの strokeText は
       鋭角で棘が出る（極太フォント + 太縁だと目立つ）。
     ・文字単位アニメは 1 文字ずつ measure して置く。等幅前提にすると日本語と
       英数字が混ざった行で崩れる。
     ・canvas は **使い回す**（プール）。毎フレーム new すると iOS で GC が跳ねる。

   ★ 触るときの注意
     ・`layoutText` は純関数のままにする（DOM を触る物を足さない。試験が死ぬ）。
     ・`TEXT_PRESETS` は **deep freeze** してある。使う側は `presetStyle(id)` か
       `Object.assign({}, preset.style)` で写しを取る（直に書き換えると全体が壊れる）。
     ・アニメ `fn(p,i,n)` の約束: **p=1 が「素の状態」**。入りは 0→1、出しは 1→0 と
       与えるので 1 つの関数で入りと出しの両方に使える。ループだけは p が
       0..1 の循環位置（p=0 と p=1 で素の状態に戻る関数にする）。
     ・dx/dy/blur は **文字の大きさ（em）に対する比**、rotate は **度**。
       解像度を変えても見た目が変わらないようにするため。

   CONTRACT-NOTE (1): 契約書 §4 は `renderText(textSpec, { width, height, time,
     duration, dpr, fps })` としか書いていないので、**文字の大きさの基準**を
     ここで決める: `style.size` は「短辺 1080 のときの px」とし、
     実際は `size * min(width,height)/1080` を使う。こうすると
     プレビュー（半分の画質）・1080p・4K で同じ絵になる。engine/canvas2d.js の
     `renderShapeFallback` も同じ基準（`min(W,H)/1080`）なので図形と揃う。
   CONTRACT-NOTE (2): engine/sources.js の `textCanvas(resolved, {width,height,
     fps,project})` から呼ばれる形も要るので、同名の `textCanvas` も export する
     （Resolved から TextSpec を取り出して renderText に渡すだけの糖衣）。
   CONTRACT-NOTE (3): 縦書き（`style.vertical`）は `core/schema.js` の
     `normTextStyle` が落とすので **保存すると消える**。統合担当へ: TextStyle に
     `vertical` を 1 つ足してほしい。落ちても横書きに戻るだけで壊れはしない。
   CONTRACT-NOTE (4): 共通前提は「700 行で分割」だが、分割先（engine/text/*.js）は
     担当外で新規作成できない。章立て（§0〜§9）で読めるようにして 1 ファイルに
     収めた。分けるなら §2+§3（折返し）→ engine/text-layout.js が素直。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, clamp01, finite, lerp, hexToRgba, EASE } from "../core/util.js";
import { defaultTextStyle } from "../core/schema.js";
import { scope } from "../core/log.js";

const L = scope("text");

/* ══ §0 定数と型 ═══════════════════════════════════════════════════ */

/**
 * @typedef {Object} TextLine
 * @property {string} text      行の文字（行末の空白は落としてある）
 * @property {number} w         行の幅（measureFn の単位）
 * @property {string[]} clusters 書記素の配列（文字単位アニメ用）
 * @property {number[]} advances clusters と同じ長さの送り幅（字間込み）
 * @property {boolean} hard      改行文字で切れた行か（折返しではない）
 */
/**
 * @typedef {Object} AnimState
 * @property {number} opacity 0..1
 * @property {number} dx em 比（右が +）
 * @property {number} dy em 比（下が +）
 * @property {number} scale 倍率
 * @property {number} scaleX 倍率（scale に掛ける）
 * @property {number} scaleY 倍率（scale に掛ける）
 * @property {number} rotate 度
 * @property {number} blur em 比
 * @property {number} clip 0..1（見えている割合）
 * @property {"l"|"r"|"t"|"b"} clipDir clip を削る向き
 * @property {number} glowMul グローの強さの倍率
 * @property {number} rgbSplit 0..1（色ずれ）
 * @property {number} hl 0..1（カラオケの塗り分け）
 * @property {number} hue 度（色相回し）
 */

/** 文字の基準になる短辺（CONTRACT-NOTE (1)） */
export const REF_SHORT_SIDE = 1080;
/** dpr の上限（契約どおり 2。これ以上上げても見えないのに 4 倍重い） */
export const MAX_DPR = 2;
/** ループアニメの 1 周（秒）。speed=1 でこの時間 */
export const LOOP_PERIOD = 1.6;
/** アニメの適用単位（契約書 §1 TextSpec.anim.unit） */
export const ANIM_UNITS = Object.freeze(["all", "line", "word", "char"]);

/* ══ §1 書体（端末に在る物だけ。web フォントは読まない）═════════════ */

/**
 * 書体の名簿。**外部フォントを読み込まない**（契約: 依存ゼロ・オフラインで
 * 壊れない）ので、日本語が確実に出る system stack を並べてある。
 * 先頭から順に「在れば使う」ので、iOS（Hiragino）・Android（Noto）・
 * Windows（Yu Gothic / Meiryo）・mac（Hiragino）を全部並べておくのが正解。
 * @type {Object<string,{label:string,stack:string,weight?:number}>}
 */
export const FONT_STACKS = Object.freeze({
  system: {
    label: "標準",
    stack: 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif'
  },
  gothic: {
    label: "ゴシック",
    stack: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Yu Gothic UI", Meiryo, "MS PGothic", sans-serif'
  },
  mincho: {
    label: "明朝",
    stack: '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "MS PMincho", serif'
  },
  rounded: {
    label: "丸ゴシック",
    stack: '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Kosugi Maru", "Yu Gothic UI", Quicksand, sans-serif'
  },
  heavy: {
    label: "極太",
    stack: '"Hiragino Sans W8", "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Arial Black", Impact, sans-serif',
    weight: 900
  },
  impact: {
    label: "見出し（英字太）",
    stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "Hiragino Sans", "Noto Sans JP", sans-serif'
  },
  mono: {
    label: "等幅",
    stack: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Osaka-Mono", "MS Gothic", monospace'
  },
  hand: {
    label: "手書き",
    stack: '"Klee One", "Chalkboard SE", "Comic Sans MS", "Hiragino Maru Gothic ProN", "Yu Gothic UI", cursive'
  }
});

/** 書体 id の別名（古い保存・他の担当の控え名簿と噛み合わせるため） */
const FONT_ALIAS = Object.freeze({
  sans: "gothic", "sans-serif": "gothic", serif: "mincho", mincho_jp: "mincho",
  maru: "rounded", round: "rounded", bold: "heavy", black: "heavy",
  monospace: "mono", code: "mono", brush: "hand", handwrite: "hand", casual: "hand"
});

/** 名簿の id 一覧（UI の並び順） */
export const FONT_IDS = Object.freeze(Object.keys(FONT_STACKS));

/**
 * `style.font` を CSS の font-family 文字列へ。
 * 名簿に無い値は「そのまま CSS の家族名」として扱い、日本語の保険を足す
 * （利用者が手で書いた "Futura" 等を活かしつつ、日本語が豆腐にならないように）。
 * @param {string} [id]
 * @returns {string}
 */
export function resolveFontStack(id) {
  const key = typeof id === "string" ? id.trim() : "";
  if (!key) return FONT_STACKS.system.stack;
  const hit = FONT_STACKS[key] || FONT_STACKS[FONT_ALIAS[key]] ||
    FONT_STACKS[key.toLowerCase()] || FONT_STACKS[FONT_ALIAS[key.toLowerCase()]];
  if (hit) return hit.stack;
  const quoted = /[\s'"]/.test(key) && !/,/.test(key) ? '"' + key.replace(/"/g, "") + '"' : key;
  return quoted + ', "Hiragino Sans", "Noto Sans JP", sans-serif';
}

/**
 * canvas の `ctx.font` に入れる文字列。px は **device px**。
 * @param {Object} style TextStyle
 * @param {number} px 文字の大きさ（device px）
 * @returns {string}
 */
export function fontCssFor(style, px) {
  const s = style || {};
  const size = Math.max(1, finite(px, 64));
  const fam = resolveFontStack(s.font);
  const named = FONT_STACKS[s.font] || FONT_STACKS[FONT_ALIAS[String(s.font || "")]];
  const w = Math.round(clamp(finite(s.weight, (named && named.weight) || 700), 100, 1000));
  const it = s.italic ? "italic " : "";
  return it + w + " " + size.toFixed(2) + "px " + fam;
}

/* ══ §2 文字の切り方（書記素・禁則）═════════════════════════════════ */

/* 結合して 1 文字と見なす符号（濁点・異体字選択子・肌色・ZWJ の後ろ） */
function isCombining(cp) {
  return (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x20d0 && cp <= 0x20f0) || (cp >= 0x3099 && cp <= 0x309c) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    cp === 0x200d || (cp >= 0xe0020 && cp <= 0xe007f);
}

/**
 * 文字列を書記素（見た目 1 文字）の配列へ。
 * `Intl.Segmenter` は Safari 14.1 以前に無いので使わない（自前で足りる）。
 * @param {string} text
 * @returns {string[]}
 */
export function toClusters(text) {
  const s = typeof text === "string" ? text : (text === null || text === undefined ? "" : String(text));
  /** @type {string[]} */
  const out = [];
  let joinNext = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    if (out.length && (joinNext || isCombining(cp))) out[out.length - 1] += ch;
    else out.push(ch);
    joinNext = cp === 0x200d;                      // ZWJ の次は必ずくっつける
  }
  return out;
}

/** 行頭に置いてはいけない文字（句読点・閉じ括弧・小書き仮名・伸ばし棒…） */
export const NO_LINE_START = new Set(Array.from(
  "、。，．・：；？！゛゜ヽヾゝゞ々ー～〜‐－—–,.:;?!)]}）］｝〉》」』】〕〟’”»%‰°′″℃¢" +
  "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ" + "…‥"
));

/** 行末に置いてはいけない文字（開き括弧・通貨記号…） */
export const NO_LINE_END = new Set(Array.from(
  "([{（［｛〈《「『【〔‘“〝«¥$£＄￥＃#"
));

/** 空白（全角空白も折返しの目印として扱う） */
function isSpaceCluster(c) {
  return c === " " || c === "\t" || c === " " || c === "　";
}

/** 英数字などの「単語を作る」文字（ここは割らない） */
function isWordCluster(c) {
  const cp = c.codePointAt(0) || 0;
  return (cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0x00c0 && cp <= 0x02af) || (cp >= 0x0370 && cp <= 0x04ff) ||
    cp === 0x27 || cp === 0x2019;                  // ' と ’（don't を割らない）
}

/**
 * 2 つの書記素の **間で改行してよいか**（簡易の禁則処理）。
 * 日本語は原則どこでも折れる／英単語は割らない／句読点は行頭に置かない。
 * @param {string} prev 前の書記素
 * @param {string} next 次の書記素
 * @returns {boolean}
 */
export function canBreakBetween(prev, next) {
  if (!prev || !next) return false;                // 行頭・行末では折らない
  if (isSpaceCluster(next)) return false;          // 空白の前で折ると行頭が空く
  if (isSpaceCluster(prev)) return true;           // 空白の後ろは折れる
  if (NO_LINE_START.has(next[0])) return false;    // 行頭禁則
  if (NO_LINE_END.has(prev[prev.length - 1])) return false; // 行末禁則
  if (isWordCluster(prev) && isWordCluster(next)) return false; // 英単語は割らない
  return true;
}

/* ══ §3 折返し（**純関数**。ここが試験の主役）═══════════════════════ */

/** 幅を測る関数が無いときの当て推量（Node でも折返しを試験できるように） */
function estimateRatio(c) {
  const cp = c.codePointAt(0) || 0;
  if (cp === 0x20 || cp === 0x09) return 0.28;
  if (cp === 0x3000) return 1;
  if (cp < 0x80) {
    if ("iljtIf.,:;'|!`[]()".indexOf(c) >= 0) return 0.3;
    if (cp >= 0x41 && cp <= 0x5a) return 0.68;     // 英大文字
    if (cp >= 0x30 && cp <= 0x39) return 0.56;     // 数字
    if ("mwMW@".indexOf(c) >= 0) return 0.88;
    return 0.53;                                   // 英小文字ほか
  }
  if (cp >= 0xff61 && cp <= 0xff9f) return 0.5;    // 半角カタカナ
  if (cp >= 0x1f300 && cp <= 0x1faff) return 1.15; // 絵文字
  if (cp >= 0x2600 && cp <= 0x27bf) return 1.05;
  if ((cp >= 0x3000 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000) return 1;                     // 全角
  if (cp >= 0x0300 && cp <= 0x036f) return 0;      // 結合記号
  return 0.6;
}

/**
 * 幅の当て推量（measureFn が無いときの保険・Node の試験でも使う）。
 * @param {string} text @param {number} size 文字の大きさ
 * @returns {number}
 */
export function estimateWidth(text, size) {
  const px = Math.max(1, finite(size, 64));
  let w = 0;
  for (const c of toClusters(text)) w += estimateRatio(c) * px;
  return w;
}

/** measureFn を 1 本に均す（関数 / { measure } / 無し を受ける） */
function pickMeasure(m, size) {
  const fn = typeof m === "function" ? m
    : (m && typeof m.measure === "function" ? m.measure
      : (m && typeof m.measureFn === "function" ? m.measureFn : null));
  if (!fn) return (t) => estimateWidth(t, size);
  return (t) => {
    const v = fn(t);
    return Number.isFinite(v) ? Math.max(0, v) : estimateWidth(t, size);
  };
}

/**
 * 文字を行に折る。**純関数**（canvas も document も触らない）。
 *
 *   layoutText("こんにちは、世界", style, layout, 200, (t) => t.length * 20)
 *
 * @param {string} content 本文（"\n" で強制改行）
 * @param {Object} style TextStyle（size と vertical だけ見る）
 * @param {Object} layout TextSpec.layout（letterSpacing / lineHeight / vertical）
 * @param {number} maxWidthPx 折返しの幅（px。0 や 未指定は「折らない」）
 * @param {((t:string)=>number)|{measure:(t:string)=>number}} [measureFn] 幅を測る関数
 * @returns {{lines:TextLine[], w:number, h:number, size:number,
 *            lineHeight:number, letterSpacing:number, vertical:boolean}}
 */
export function layoutText(content, style, layout, maxWidthPx, measureFn) {
  const st = style || {}, la = layout || {};
  const size = Math.max(1, finite(st.size, 64));
  const lh = clamp(finite(la.lineHeight, 1.25), 0.5, 4);
  const ls = clamp(finite(la.letterSpacing, 0), -0.5, 2) * size;
  const vertical = !!(st.vertical || la.vertical || st.writingMode === "vertical" ||
    la.writingMode === "vertical");
  const measure = pickMeasure(measureFn, size);
  const limitRaw = finite(maxWidthPx, 0);
  const limit = limitRaw > 0 ? limitRaw : Infinity;
  const src = typeof content === "string" ? content
    : (content === null || content === undefined ? "" : String(content));

  /** @type {TextLine[]} */
  const lines = [];
  const paras = src.split(/\r\n|\r|\n/);

  for (let pi = 0; pi < paras.length; pi++) {
    const cl = toClusters(paras[pi]);
    const hard = pi > 0;                           // 2 行目以降は改行文字で始まった行
    if (!cl.length) { lines.push(mkLine([], [], hard)); continue; }

    /* 1 文字ずつの幅（同じ文字を何度も測らないよう先に全部測る） */
    const w = new Array(cl.length);
    const pre = new Array(cl.length + 1);
    pre[0] = 0;
    for (let i = 0; i < cl.length; i++) { w[i] = measure(cl[i]); pre[i + 1] = pre[i] + w[i]; }

    /* 行末の空白を数えない幅（空白で折返しが 1 文字早まるのを防ぐ） */
    const lineW = (a, b) => {
      let e = b;
      while (e > a && isSpaceCluster(cl[e - 1])) e--;
      return e > a ? pre[e] - pre[a] + ls * (e - a - 1) : 0;
    };

    if (vertical) {
      /* 縦書きは v1 では「縦積み」で代替（CONTRACT-NOTE (3)）。
         1 文字ずつ改行して、行の幅は 1 文字分になる。 */
      for (let i = 0; i < cl.length; i++) {
        if (isSpaceCluster(cl[i])) { lines.push(mkLine([], [], false)); continue; }
        lines.push(mkLine([cl[i]], [w[i]], i === 0 ? hard : false));
      }
      continue;
    }

    let start = 0;
    let first = true;
    while (start < cl.length) {
      /* 入る所まで伸ばす（最低 1 文字は必ず置く＝無限ループ防止） */
      let end = start + 1;
      while (end < cl.length && lineW(start, end + 1) <= limit) end++;
      if (end < cl.length) {
        /* 折れる所を後ろから探す */
        let bp = -1;
        for (let k = end; k > start; k--) {
          if (canBreakBetween(cl[k - 1], cl[k])) { bp = k; break; }
        }
        if (bp > start) end = bp;
        /* どこでも折れない（長い英単語・禁則で詰まった）＝その場で割る。
           ただし行頭に来てはいけない文字は連れて行く（ぶら下げ）。
           「行頭に句読点を置かない」だけは どんな幅でも守る。 */
        else while (end < cl.length && NO_LINE_START.has(cl[end][0])) end++;
      }
      let e = end;
      while (e > start && isSpaceCluster(cl[e - 1])) e--;   // 行末の空白は捨てる
      lines.push(mkLine(cl.slice(start, e), w.slice(start, e), first ? hard : false));
      first = false;
      start = end;
      while (start < cl.length && isSpaceCluster(cl[start])) start++; // 行頭の空白も捨てる
    }
  }

  let maxW = 0;
  for (const ln of lines) if (ln.w > maxW) maxW = ln.w;
  return {
    lines, w: maxW, h: lines.length * size * lh,
    size, lineHeight: lh, letterSpacing: ls, vertical
  };

  /** 行 1 つを組む（送り幅も一緒に持たせる＝描く側が測り直さない） */
  function mkLine(cs, ws, isHard) {
    const advances = new Array(cs.length);
    let total = 0;
    for (let i = 0; i < cs.length; i++) {
      advances[i] = ws[i] + (i < cs.length - 1 ? ls : 0);
      total += advances[i];
    }
    return { text: cs.join(""), w: Math.max(0, total), clusters: cs, advances, hard: !!isHard };
  }
}

/* ══ §4 canvas の道具（プール・幅の測定）═══════════════════════════ */

/** canvas を 1 枚作る（document が無ければ OffscreenCanvas。両方無ければ throw） */
function newCanvas(w, h) {
  const W = Math.max(1, Math.round(finite(w, 1))), H = Math.max(1, Math.round(finite(h, 1)));
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(W, H);
  throw new Error("canvas を作れません（document も OffscreenCanvas も在りません）");
}

/* 使い回しの入れ物。寸法ごとに **8 枚を順番に**回す。
   なぜ 8 枚か: engine/canvas2d.js は返した canvas を 6 枚まで cache に
   持つ（同じ時刻で 2 回描かれる時に効かせるため）。使い回しが 6 周より
   短いと「cache に在る canvas の中身を後から塗り替える」事故が起きる。 */
const POOL_PER_SIZE = 8;
const POOL_MAX_SIZES = 4;
/** @type {Map<string,{list:any[],next:number}>} */
const pool = new Map();

/**
 * プールから canvas を 1 枚借りる（中身は呼ぶ側が消す）。
 * @param {number} w @param {number} h @returns {any}
 */
export function acquireTextCanvas(w, h) {
  const W = Math.max(1, Math.round(finite(w, 1))), H = Math.max(1, Math.round(finite(h, 1)));
  const key = W + "x" + H;
  let slot = pool.get(key);
  if (!slot) {
    if (pool.size >= POOL_MAX_SIZES) {
      const oldest = pool.keys().next().value;     /* Map は挿入順＝一番古い寸法 */
      pool.delete(oldest);
    }
    slot = { list: [], next: 0 };
    pool.set(key, slot);
  }
  let cv;
  if (slot.list.length < POOL_PER_SIZE) {
    cv = newCanvas(W, H);
    slot.list.push(cv);
  } else {
    cv = slot.list[slot.next % slot.list.length];
    slot.next = (slot.next + 1) % slot.list.length;
  }
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  return cv;
}

/** プールと幅の記憶を捨てる（書体が変わった時・端末の空きが無い時の後片付け） */
export function clearTextCache() {
  pool.clear();
  widthCache.clear();
  measureCv = null; measureCtx = null;
}

/* 幅の記憶。同じ書体・同じ大きさなら 1 文字の幅は変わらない。
   1 行 30 文字を 60fps で毎フレーム測ると iOS では普通に落ちるので必須。
   書体ごとに Map を分ける（鍵に区切り文字を使わずに済む）。 */
const WIDTH_CACHE_MAX = 4000;
/** @type {Map<string,Map<string,number>>} */
const widthCache = new Map();
let measureCv = null, measureCtx = null;

/**
 * その書体で文字幅を測る関数を作る（結果は記憶する）。
 * ctx を渡せばそれを使う（描く直前に測ると font の設定が 1 回で済む）。
 * canvas が作れない環境では **null**（呼ぶ側は当て推量へ落ちる）。
 * @param {string} fontCss
 * @param {any} [ctx]
 * @returns {((t:string)=>number)|null}
 */
export function makeMeasurer(fontCss, ctx) {
  let c = ctx || null;
  if (!c) {
    try {
      if (!measureCtx) {
        measureCv = newCanvas(8, 8);
        measureCtx = measureCv.getContext("2d");
      }
      c = measureCtx;
    } catch (_e) { return null; }
  }
  if (!c || typeof c.measureText !== "function") return null;
  c.font = fontCss;
  let bag = widthCache.get(fontCss);
  if (!bag) {
    if (widthCache.size > 8) widthCache.clear();
    bag = new Map();
    widthCache.set(fontCss, bag);
  }
  const memo = bag;
  return (t) => {
    const hit = memo.get(t);
    if (hit !== undefined) return hit;
    let v = 0;
    try { v = c.measureText(t).width; } catch (_e) { v = 0; }
    if (!Number.isFinite(v)) v = 0;
    if (memo.size >= WIDTH_CACHE_MAX) memo.clear();
    memo.set(t, v);
    return v;
  };
}

/* ══ §5 寸法（measureText）═════════════════════════════════════════ */

/** style.size → 実際の px（CONTRACT-NOTE (1)） */
export function fontPxFor(style, W, H) {
  const size = clamp(finite((style || {}).size, 64), 1, 4000);
  const scale = Math.max(1, Math.min(finite(W, 1920), finite(H, 1080))) / REF_SHORT_SIDE;
  return Math.max(1, size * scale);
}

/**
 * 文字の寸法を測る（契約書 §4）。UI の当たり判定・自動縮小・見本に使う。
 * canvas が無い環境（Node）では当て推量で答える（例外にしない）。
 * @param {Object} textSpec
 * @param {{width?:number,height?:number,dpr?:number}} [opts]
 * @returns {{lines:TextLine[], w:number, h:number, fontCss:string,
 *            fontPx:number, lineHeight:number, rubyPx:number}}
 */
export function measureText(textSpec, opts) {
  const o = opts || {};
  const spec = normSpec(textSpec);
  const dpr = clamp(finite(o.dpr, 1), 0.25, MAX_DPR);
  const W = Math.max(1, Math.round(finite(o.width, 1920) * dpr));
  const H = Math.max(1, Math.round(finite(o.height, 1080) * dpr));
  const fontPx = fontPxFor(spec.style, W, H);
  const fontCss = fontCssFor(spec.style, fontPx);
  const measure = makeMeasurer(fontCss);
  const maxW = clamp(finite(spec.layout.maxWidth, 0.8), 0.05, 1) * W;
  const lay = layoutText(spec.content, Object.assign({}, spec.style, { size: fontPx }),
    spec.layout, maxW, measure);
  const rubyPx = spec.style.ruby ? fontPx * 0.44 : 0;
  return {
    lines: lay.lines, w: lay.w, h: lay.h + rubyPx * 1.15,
    fontCss, fontPx, lineHeight: lay.lineHeight, rubyPx
  };
}

/* ══ §6 アニメの名簿（TEXT_ANIMS）═════════════════════════════════ */

/** 素の状態（in/out の p=1・ループの p=0 で必ずこれに戻ること） */
const NEUTRAL = Object.freeze({
  opacity: 1, dx: 0, dy: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
  blur: 0, clip: 1, clipDir: "l", glowMul: 1, rgbSplit: 0, hl: 0, hue: 0
});

const CLIP_DIRS = new Set(["l", "r", "t", "b"]);

/**
 * アニメの返り値を必ず「有限値の揃った object」にする。
 * 壊れた値（NaN・undefined・Infinity）が 1 つでも canvas へ行くと
 * **その canvas が丸ごと描かれなくなる**（仕様: 非有限の引数は無視される）。
 * 気付きにくい事故なので入口で止める。
 * @param {any} o @returns {AnimState}
 */
export function sanitizeAnimState(o) {
  const s = o && typeof o === "object" ? o : {};
  const num = (v, d, lo, hi) => clamp(finite(v, d), lo, hi);
  return {
    opacity: num(s.opacity, 1, 0, 1),
    dx: num(s.dx, 0, -40, 40),
    dy: num(s.dy, 0, -40, 40),
    scale: num(s.scale, 1, 0, 40),
    scaleX: num(s.scaleX, 1, -40, 40),
    scaleY: num(s.scaleY, 1, -40, 40),
    rotate: num(s.rotate, 0, -3600, 3600),
    blur: num(s.blur, 0, 0, 8),
    clip: num(s.clip, 1, 0, 1),
    clipDir: CLIP_DIRS.has(s.clipDir) ? s.clipDir : "l",
    glowMul: num(s.glowMul, 1, 0, 8),
    rgbSplit: num(s.rgbSplit, 0, 0, 4),
    hl: num(s.hl, 0, 0, 1),
    hue: num(s.hue, 0, -3600, 3600)
  };
}

/* 決定論の擬似乱数（揺れ・グリッチ用）。時刻をそのまま入れると毎フレーム
   跳ねて汚いので、呼ぶ側が「段」を整数にして入れる。同じ時刻なら必ず
   同じ絵になる＝プレビューと書き出しが一致する。 */
function nz(a, b) {
  const x = Math.sin(finite(a, 0) * 12.9898 + finite(b, 0) * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
/** 跳ね返り（p=1 で 1） */
function bounceOut(p) {
  const t = clamp01(p);
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
  if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
  const u = t - 2.625 / 2.75;
  return 7.5625 * u * u + 0.984375;
}
/** 行き過ぎて戻る（p=1 で 1） */
function backOut(p) {
  const t = clamp01(p), u = t - 1, c = 1.70158;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
const eOut = EASE.out, eInOut = EASE.inout;
const TAU = Math.PI * 2;

/**
 * 名簿の 1 項目を組む。fn は **必ず**有限値の AnimState を返す形に包む。
 * @param {string} name 日本語の名前（UI にそのまま出る）
 * @param {string[]} unitSupport 使える単位（先頭が既定）
 * @param {string[]} kinds "in"|"out"|"loop"
 * @param {(p:number,i:number,n:number)=>Object} fn
 * @param {number} [stagger] 単位ごとのずらし量 0..1（既定 0.55）
 */
function defAnim(name, unitSupport, kinds, fn, stagger) {
  const wrapped = (p, i, n) => {
    const q = clamp01(finite(p, 1));
    const ni = Math.max(1, Math.round(finite(n, 1)));
    const ii = clamp(Math.round(finite(i, 0)), 0, ni - 1);
    let out = null;
    try { out = fn(q, ii, ni); } catch (e) { L.warn("アニメが投げました", name, e); out = null; }
    return sanitizeAnimState(out);
  };
  return Object.freeze({
    name, label: name, unitSupport: Object.freeze(unitSupport.slice()),
    kinds: Object.freeze(kinds.slice()),
    stagger: clamp(finite(stagger, 0.55), 0, 1), fn: wrapped
  });
}

const ALL = ["all", "line", "word", "char"];
const PER = ["char", "word", "line"];
const IO = ["in", "out"];

/**
 * 文字のアニメ一覧（契約書 §1 TextSpec.anim.type の名前）。
 *
 *   TEXT_ANIMS[id] = { name, unitSupport, kinds, stagger, fn(p, i, n) -> AnimState }
 *
 * **p=1 が素の状態**。入り（in）は 0→1、出し（out）は 1→0 を渡すので
 * 1 つの関数で両方に使える。ループ（loop）だけは p が 0..1 の循環位置で、
 * p=0 と p=1 が素の状態に戻る（繋ぎ目が見えないように）。
 * dx/dy/blur は em 比、rotate は度。
 * @type {Object<string,{name:string,label:string,unitSupport:string[],kinds:string[],stagger:number,fn:(p:number,i:number,n:number)=>AnimState}>}
 */
export const TEXT_ANIMS = Object.freeze({
  /* ── 入り／出し ─────────────────────────────────────────────── */
  none: defAnim("なし", ALL, ["in", "out", "loop"], () => NEUTRAL),
  fade: defAnim("ふわっと", ALL, IO, (p) => ({ opacity: eOut(p) })),
  fadeUp: defAnim("下からふわり", ALL, IO, (p) => ({ opacity: eOut(p), dy: (1 - eOut(p)) * 0.55 })),
  fadeDown: defAnim("上からふわり", ALL, IO, (p) => ({ opacity: eOut(p), dy: -(1 - eOut(p)) * 0.55 })),
  slideL: defAnim("左から", ALL, IO, (p) => ({ opacity: clamp01(p * 2.5), dx: -(1 - eOut(p)) * 1.6 })),
  slideR: defAnim("右から", ALL, IO, (p) => ({ opacity: clamp01(p * 2.5), dx: (1 - eOut(p)) * 1.6 })),
  slideU: defAnim("下から滑る", ALL, IO, (p) => ({ opacity: clamp01(p * 2.5), dy: (1 - eOut(p)) * 1.6 })),
  slideD: defAnim("上から滑る", ALL, IO, (p) => ({ opacity: clamp01(p * 2.5), dy: -(1 - eOut(p)) * 1.6 })),
  popIn: defAnim("ぽん", ALL, IO, (p) => ({ opacity: clamp01(p * 3), scale: 0.3 + 0.7 * backOut(p) }), 0.6),
  popOut: defAnim("ぽん（消える）", ALL, IO, (p) => ({ opacity: clamp01(p * 3), scale: 0.3 + 0.7 * backOut(p) }), 0.6),
  zoomIn: defAnim("寄る（小→大）", ALL, IO, (p) => ({ opacity: eOut(p), scale: lerp(0.42, 1, eOut(p)) })),
  zoomOut: defAnim("引く（大→小）", ALL, IO, (p) => ({ opacity: eOut(p), scale: lerp(1.7, 1, eOut(p)) })),
  typewriter: defAnim("打ち込み", PER, IO, (p) => ({ opacity: p >= 0.5 ? 1 : 0 }), 0.97),
  wipeL: defAnim("左から出る", ALL, IO, (p) => ({ clip: eOut(p), clipDir: "l" })),
  wipeR: defAnim("右から出る", ALL, IO, (p) => ({ clip: eOut(p), clipDir: "r" })),
  wipeU: defAnim("下から出る", ALL, IO, (p) => ({ clip: eOut(p), clipDir: "b" })),
  wipeD: defAnim("上から出る", ALL, IO, (p) => ({ clip: eOut(p), clipDir: "t" })),
  blurIn: defAnim("ぼけから", ALL, IO, (p) => ({ opacity: clamp01(p * 1.4), blur: (1 - eOut(p)) * 0.38 })),
  scalePunch: defAnim("ぱんち", ALL, IO, (p) => ({ opacity: clamp01(p * 4), scale: 1 + (1 - eOut(p)) * 0.45 }), 0.4),
  rollUp: defAnim("巻き上げ", ALL, IO, (p) => ({
    opacity: clamp01(p * 2), dy: (1 - eOut(p)) * 0.85,
    rotate: -(1 - eOut(p)) * 24, scaleY: lerp(0.55, 1, eOut(p))
  })),
  bounce: defAnim("跳ねる", ALL, IO, (p) => ({
    opacity: clamp01(p * 6), dy: -(1 - bounceOut(p)) * 1.4
  }), 0.6),
  drop: defAnim("落ちる", ALL, IO, (p) => ({
    opacity: clamp01(p * 6), dy: -(1 - bounceOut(p)) * 2.4, scaleY: lerp(1.3, 1, bounceOut(p))
  }), 0.6),
  neon: defAnim("ネオン点灯", ALL, IO, (p) => {
    /* 蛍光灯が点くときのちらつき。段を整数にして決定論にする */
    const table = [0, 0.85, 0.15, 1, 0.4, 1];
    const step = clamp(Math.floor(clamp01(p) * 6), 0, 5);
    const a = p >= 1 ? 1 : table[step] * (0.35 + 0.65 * p);
    return { opacity: a, glowMul: 1 + (1 - p) * 1.8 };
  }),
  glitchIn: defAnim("グリッチ", ALL, IO, (p, i) => {
    const step = Math.floor(clamp01(p) * 14);
    return {
      opacity: p > 0.08 ? 1 : 0,
      dx: (1 - p) * nz(step, i) * 0.5,
      dy: (1 - p) * nz(step + 31, i) * 0.12,
      rgbSplit: (1 - eOut(p)) * 0.9
    };
  }, 0.3),
  karaoke: defAnim("カラオケ（塗り分け）", ["char", "word"], ["in", "loop"], (p) => ({
    opacity: 1, clip: 1, hl: clamp01(p)
  }), 0.97),
  spin: defAnim("回って出る", ALL, IO, (p) => ({
    opacity: eOut(p), rotate: -(1 - eOut(p)) * 200, scale: lerp(0.4, 1, eOut(p))
  })),
  flipIn: defAnim("めくる", ALL, IO, (p) => ({
    opacity: clamp01(p * 2), scaleX: Math.max(0.02, eInOut(p))
  })),
  stretchIn: defAnim("伸びる", ALL, IO, (p) => ({
    opacity: clamp01(p * 3), scaleX: lerp(2.1, 1, eOut(p)), scaleY: lerp(0.45, 1, eOut(p))
  })),
  swingIn: defAnim("ぶらんと", ALL, IO, (p) => ({
    opacity: clamp01(p * 3), rotate: (1 - eOut(p)) * 26 * Math.cos(p * Math.PI * 2.5)
  })),
  riseMask: defAnim("下から現れる（切り抜き）", ALL, IO, (p) => ({
    clip: eOut(p), clipDir: "b", dy: (1 - eOut(p)) * 0.28
  })),
  /* ── ループ ─────────────────────────────────────────────────── */
  pulse: defAnim("脈打つ", ALL, ["loop"], (p) => ({ scale: 1 + 0.06 * Math.sin(p * TAU) })),
  breathe: defAnim("呼吸", ALL, ["loop"], (p) => ({
    scale: 1 + 0.035 * Math.sin(p * TAU), opacity: 0.86 + 0.14 * Math.cos(p * TAU)
  })),
  float: defAnim("浮く", ALL, ["loop"], (p) => ({ dy: -0.1 * Math.sin(p * TAU) })),
  wave: defAnim("波", PER, ["loop"], (p, i, n) => ({
    dy: 0.2 * Math.sin(p * TAU + (i / Math.max(1, n)) * TAU * 1.5)
  })),
  shake: defAnim("揺れる", ALL, ["loop"], (p, i) => {
    const step = Math.floor(p * 18);
    return { dx: nz(step, i) * 0.06, dy: nz(step + 7, i) * 0.06 };
  }),
  sway: defAnim("傾く", ALL, ["loop"], (p) => ({ rotate: 3.2 * Math.sin(p * TAU) })),
  jelly: defAnim("ぷるぷる", ALL, ["loop"], (p) => ({
    scaleX: 1 + 0.07 * Math.sin(p * TAU), scaleY: 1 - 0.07 * Math.sin(p * TAU)
  })),
  blink: defAnim("点滅", ALL, ["loop"], (p) => ({ opacity: 0.28 + 0.72 * (0.5 + 0.5 * Math.cos(p * TAU)) })),
  neonLoop: defAnim("ネオン明滅", ALL, ["loop"], (p) => ({
    glowMul: 1 + 0.7 * (0.5 + 0.5 * Math.sin(p * TAU * 3)),
    opacity: 0.92 + 0.08 * Math.sin(p * TAU * 3)
  })),
  rainbow: defAnim("虹色", ALL, ["loop"], (p) => ({ hue: p * 360 })),
  glitchLoop: defAnim("グリッチ（常時）", ALL, ["loop"], (p, i) => {
    const step = Math.floor(p * 20);
    const on = nz(step, 91) > 0.72;
    return on ? { dx: nz(step, i) * 0.14, rgbSplit: 0.5 } : NEUTRAL;
  }),
  typeCursor: defAnim("カーソル点滅", PER, ["loop"], (p, i, n) => (
    i === n - 1 ? { opacity: p < 0.5 ? 1 : 0.25 } : NEUTRAL
  ))
});

/** 名簿の id 一覧 */
export const TEXT_ANIM_IDS = Object.freeze(Object.keys(TEXT_ANIMS));

/**
 * 種類（in/out/loop）ごとの id 一覧（UI の選択肢用）。
 * @param {"in"|"out"|"loop"} kind @returns {string[]}
 */
export function animIdsFor(kind) {
  const k = kind === "out" || kind === "loop" ? kind : "in";
  return TEXT_ANIM_IDS.filter((id) => TEXT_ANIMS[id].kinds.indexOf(k) >= 0);
}
