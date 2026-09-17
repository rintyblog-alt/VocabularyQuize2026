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
       0..1 の循環位置で、**p=0 と p=1 が繋がる**ように作る（sin 系はそのまま
       繋がる。揺れ物は乱数なので繋ぎ目は見えない）。
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
/** 尺が分からないときに使う「十分長い」秒数（出しは出さず 入りだけ出す） */
const NO_DURATION = 3600;
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

/* 使い回しの入れ物。寸法ごとに 数枚を **順番に**回す。

   何枚が正しいか: engine/canvas2d.js は返した canvas を 6 枚まで cache に
   持つ（同じ時刻で 2 回描かれる時に効かせるため）。使い回しの周期が 7 枚
   以上なら「cache に在る canvas の中身を後から塗り替える」事故は **起き得ない**
   （7 回描いた＝cache に 7 回積んだ＝6 枚の cache からは押し出されている）。
   ただし 1920×1080 を 7 枚持つと 58MB で、iOS の canvas 予算に当たって
   画面が真っ白になる。そこで **総画素の予算**で枚数を決める:
     予算 12M px（≒48MB）÷ 1 枚の画素数、2〜8 枚に収める。
   予算に負けて 7 枚未満になる大きい canvas（1080p 以上）では
   「同じ鍵を 5〜6 回後にもう一度引かれた時だけ 1 フレーム古い絵が出る」が
   残る。これは **巻き戻しの走査でしか起きない**（再生は時刻が進むので同じ鍵を
   引き直さない。書き出しも同様。WebGL の合成器は canvas を保持しないので
   そもそも無関係）。真っ白よりは古い 1 フレームの方が軽い事故だと判断した。
   メモリが苦しい時は `clearTextCache()` を呼べば全部捨てられる。 */
const POOL_BUDGET_PX = 12e6;
const POOL_MAX_SIZES = 3;
/** その寸法を何枚まで持つか */
function poolSizeFor(area) {
  const n = Math.floor(POOL_BUDGET_PX / Math.max(1, area));
  return clamp(n, 2, 8);
}
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
  if (slot.list.length < poolSizeFor(W * H)) {
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
  /* -0 は 0 に直す（-0 は比較と cache 鍵で罠になる。0 と等しいのに
     Object.is も toFixed も別物として扱う） */
  const num = (v, d, lo, hi) => { const n = clamp(finite(v, d), lo, hi); return n === 0 ? 0 : n; };
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
 * p=0 と p=1 が繋がるように作る（波は i でずらすので i>0 では p=0 でも
 * 素の状態ではない。揺れ物は乱数なので繋ぎ目は見えない）。
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

/* ══ §7 仕様を整える・アニメを合成する ════════════════════════════ */

/** TextSpec.layout の既定（契約書 §1 / core/schema.js と同じ値） */
const DEFAULT_LAYOUT = Object.freeze({
  align: "center", vAlign: "middle", maxWidth: 0.8, lineHeight: 1.25, letterSpacing: 0
});
/** TextSpec.anim の既定 */
const DEFAULT_ANIM = Object.freeze({
  in: { type: "fadeUp", duration: 0.4 }, out: { type: "fade", duration: 0.3 },
  loop: { type: "none", speed: 1 }, unit: "all"
});

/** 入れ子（stroke/shadow/glow/gradient/bg）を潰さずに style を重ねる */
function mergeStyle(base, over) {
  if (!over || typeof over !== "object") return base;
  const out = Object.assign({}, base, over);
  for (const k of ["stroke", "shadow", "glow"]) {
    out[k] = Object.assign({}, base[k] || null, over[k] || null);
  }
  if (over.gradient) out.gradient = Object.assign({ from: "#ffffff", to: "#000000", angle: 0 }, over.gradient);
  if (over.bg) out.bg = Object.assign({ color: "#000000aa", pad: 16, radius: 12 }, over.bg);
  return out;
}

/**
 * TextSpec を「欠けの無い形」へ（描く側で毎回 finite を書かないため）。
 * @param {any} textSpec @param {any} [extra] opts 側の style/layout/anim（弱い）
 * @returns {{content:string,style:Object,layout:Object,anim:Object}}
 */
function normSpec(textSpec, extra) {
  const s = textSpec && typeof textSpec === "object" ? textSpec : {};
  const ex = extra && typeof extra === "object" ? extra : {};
  const style = mergeStyle(mergeStyle(defaultTextStyle(), ex.style), s.style);
  const layout = Object.assign({}, DEFAULT_LAYOUT, ex.layout || null, s.layout || null);
  const a0 = Object.assign({}, DEFAULT_ANIM, ex.anim || null, s.anim || null);
  const anim = {
    in: Object.assign({}, DEFAULT_ANIM.in, a0.in || null),
    out: Object.assign({}, DEFAULT_ANIM.out, a0.out || null),
    loop: Object.assign({}, DEFAULT_ANIM.loop, a0.loop || null),
    unit: ANIM_UNITS.indexOf(a0.unit) >= 0 ? a0.unit : "all"
  };
  const content = typeof s.content === "string" ? s.content
    : (typeof textSpec === "string" ? textSpec : (s.content === undefined || s.content === null ? "" : String(s.content)));
  return { content, style, layout, anim };
}

/** 名簿から 1 つ引く（知らない名前は none。保存が新しくても再生は止めない） */
function animEntry(type, kind) {
  const id = typeof type === "string" ? type : "";
  const e = TEXT_ANIMS[id];
  if (e && e.kinds.indexOf(kind) >= 0) return { id, e };
  if (e) return { id, e };                         // 種類違いでも動かす（UI の自由を残す）
  return { id: "none", e: TEXT_ANIMS.none };
}

/** 単位の細かさ（大きいほど細かい） */
const UNIT_RANK = Object.freeze({ all: 0, line: 1, word: 2, char: 3 });

/**
 * そのアニメで使える単位へ寄せる（打ち込みに "all" を渡されたら "char" にする）。
 * @param {{unitSupport:string[]}} entry @param {string} wanted @returns {string}
 */
export function resolveUnit(entry, wanted) {
  const list = (entry && entry.unitSupport) || ANIM_UNITS;
  if (list.indexOf(wanted) >= 0) return wanted;
  return list[0] || "all";
}

/** 単位ごとのずらし（i 番目がいつ始まって何秒かけるか） */
function unitSlot(i, n, total, stagger) {
  const T = Math.max(0, finite(total, 0));
  if (n <= 1 || T <= 0) return { start: 0, dur: T };
  const sp = clamp01(finite(stagger, 0.55));
  const span = T * sp;
  const dur = Math.max(T * 0.02, T * (1 - sp));
  return { start: (i / (n - 1)) * span, dur };
}

/** 0..1 の進み具合（dur=0 は階段） */
function phaseAt(t, start, dur) {
  if (!(dur > 0)) return t >= start ? 1 : 0;
  return clamp01((t - start) / dur);
}

/**
 * 状態を重ねる（移動は足し算・倍率は掛け算・切り抜きは狭い方）。
 * @param {Object[]} list @returns {AnimState}
 */
export function composeAnimStates(list) {
  const out = Object.assign({}, NEUTRAL);
  for (const raw of (Array.isArray(list) ? list : [])) {
    const s = sanitizeAnimState(raw);
    out.opacity *= s.opacity;
    out.dx += s.dx; out.dy += s.dy;
    out.scale *= s.scale; out.scaleX *= s.scaleX; out.scaleY *= s.scaleY;
    out.rotate += s.rotate;
    out.blur += s.blur;
    out.glowMul *= s.glowMul;
    out.rgbSplit = Math.max(out.rgbSplit, s.rgbSplit);
    out.hl = Math.max(out.hl, s.hl);
    out.hue += s.hue;
    if (s.clip < out.clip) { out.clip = s.clip; out.clipDir = s.clipDir; }
  }
  return sanitizeAnimState(out);
}

/**
 * 入り／出し／ループを 1 つの状態にまとめる（UI の見本からも呼べるように export）。
 * @param {Object} animSpec TextSpec.anim
 * @param {{time:number,duration:number,index?:number,count?:number,
 *          unitIndex?:Object,unitCount?:Object}} o
 * @returns {AnimState}
 */
export function textAnimState(animSpec, o) {
  const a = normSpec({ anim: animSpec }).anim;
  const opt = o || {};
  const time = finite(opt.time, 0);
  const dur = finite(opt.duration, 0) > 0 ? finite(opt.duration, 0) : 1;
  const i = Math.max(0, Math.round(finite(opt.index, 0)));
  const n = Math.max(1, Math.round(finite(opt.count, 1)));
  const plan = animPlan(a, dur);
  return stateFor(plan, time, { char: i, word: i, line: i, all: 0 },
    { char: n, word: n, line: n, all: 1 });
}

/** 3 つのアニメと尺を先に解いておく（毎文字で同じ計算をしないため） */
function animPlan(anim, duration) {
  const inA = animEntry(anim.in.type, "in");
  const outA = animEntry(anim.out.type, "out");
  const loopA = animEntry(anim.loop.type, "loop");
  const wanted = anim.unit;
  const inUnit = resolveUnit(inA.e, wanted);
  const outUnit = resolveUnit(outA.e, wanted);
  const loopUnit = resolveUnit(loopA.e, wanted);
  let inDur = clamp(finite(anim.in.duration, 0), 0, 600);
  let outDur = clamp(finite(anim.out.duration, 0), 0, 600);
  if (inA.id === "none") inDur = 0;
  if (outA.id === "none") outDur = 0;
  const room = Math.max(0, finite(duration, 0));
  if (inDur + outDur > room && inDur + outDur > 0) {
    const k = room / (inDur + outDur);
    inDur *= k; outDur *= k;
  }
  /* 描く粒（一番細かい単位）と 変形の中心（一番粗い単位） */
  const active = [];
  if (inA.id !== "none") active.push(inUnit);
  if (outA.id !== "none") active.push(outUnit);
  if (loopA.id !== "none") active.push(loopUnit);
  let fine = "line", coarse = "all";
  if (active.length) {
    fine = active[0]; coarse = active[0];
    for (const u of active) {
      if (UNIT_RANK[u] > UNIT_RANK[fine]) fine = u;
      if (UNIT_RANK[u] < UNIT_RANK[coarse]) coarse = u;
    }
    if (UNIT_RANK[fine] < UNIT_RANK.line) fine = "line";   // 行より粗くは描けない
  }
  return {
    inA, outA, loopA, inUnit, outUnit, loopUnit, inDur, outDur,
    duration: room, fine, coarse,
    loopSpeed: clamp(finite(anim.loop.speed, 1), 0.05, 10)
  };
}

/** その粒（i,n の表）での状態 */
function stateFor(plan, time, idx, cnt) {
  const pick = (u) => [Math.max(0, finite(idx[u], 0)), Math.max(1, finite(cnt[u], 1))];
  const [ii, ni] = pick(plan.inUnit);
  const [io, no] = pick(plan.outUnit);
  const [il, nl] = pick(plan.loopUnit);
  const sIn = unitSlot(ii, ni, plan.inDur, plan.inA.e.stagger);
  const inP = plan.inDur > 0 ? phaseAt(time, sIn.start, sIn.dur) : 1;
  const sOut = unitSlot(io, no, plan.outDur, plan.outA.e.stagger);
  const outP = plan.outDur > 0
    ? 1 - phaseAt(time, plan.duration - plan.outDur + sOut.start, sOut.dur) : 1;
  const cyc = (Math.max(0, time) * plan.loopSpeed) / LOOP_PERIOD;
  const loopP = cyc - Math.floor(cyc);
  return composeAnimStates([
    plan.inA.e.fn(inP, ii, ni),
    plan.outA.e.fn(outP, io, no),
    plan.loopA.e.fn(loopP, il, nl)
  ]);
}

/* ══ §8 色と形の小道具 ════════════════════════════════════════════ */

/** "#rrggbbaa" などを canvas が必ず解る形へ（8 桁 hex は古い WebKit が読めない） */
function cssColor(v, hue) {
  if (typeof v !== "string" || !v) return "#ffffff";
  const rgba = hexToRgba(v);
  if (!rgba) return v;                             // "rgba(...)" や色名はそのまま
  let r = rgba[0], g = rgba[1], b = rgba[2];
  if (finite(hue, 0) % 360 !== 0) {
    const hsl = rgbToHsl(r, g, b);
    const c = hslToRgb((hsl[0] + finite(hue, 0) / 360) % 1, hsl[1], hsl[2]);
    r = c[0]; g = c[1]; b = c[2];
  }
  const to255 = (x) => Math.round(clamp01(x) * 255);
  return "rgba(" + to255(r) + "," + to255(g) + "," + to255(b) + "," + clamp01(rgba[3]).toFixed(3) + ")";
}

/** 色の α だけ取る（影を出す/出さないの判断に使う） */
function alphaOf(v) {
  const rgba = hexToRgba(typeof v === "string" ? v : "");
  return rgba ? rgba[3] : 1;
}

function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const l = (mx + mn) / 2;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const hh = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * clamp01(s);
  const x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
  const m = l - c / 2;
  const t = hh * 6;
  let r = 0, g = 0, b = 0;
  if (t < 1) { r = c; g = x; } else if (t < 2) { r = x; g = c; }
  else if (t < 3) { g = c; b = x; } else if (t < 4) { g = x; b = c; }
  else if (t < 5) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

/** 角丸の道（ctx.roundRect は Safari 16 以降にしか無い） */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(finite(r, 0), Math.min(w, h) / 2));
  ctx.beginPath();
  if (rr <= 0.01) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/* ══ §9 描く（renderText）═════════════════════════════════════════ */

/* 「遠くに描いて影だけを画面に落とす」ための逃がし距離（device px）。
   §13.2 のとおり ctx.filter は Safari に無いので、ぼかし・グロー・影は
   すべて canvas の影機能で作る。影の offset/blur は **CTM の影響を受けない**
   ので、逃がす距離は CTM の倍率で割って打ち消す。 */
const FAR = 20000;

/**
 * 文字を 1 枚の canvas に焼く（契約書 §4）。
 * 返す canvas は **使い回し**なので、呼んだ側は次に呼ぶ前に使い終わること
 * （合成器はテクスチャに転送する / drawImage する。どちらも即座なので安全）。
 * @param {Object} textSpec 契約書 §1 の TextSpec
 * @param {{width:number,height:number,time?:number,duration?:number,
 *          dpr?:number,fps?:number,style?:Object,layout?:Object,anim?:Object,
 *          opacity?:number}} opts
 * @returns {any} HTMLCanvasElement（OffscreenCanvas の環境ではそれ）
 */
export function renderText(textSpec, opts) {
  const o = opts || {};
  const spec = normSpec(textSpec, o);
  const style = spec.style, la = spec.layout;
  const dpr = clamp(finite(o.dpr, 1), 0.25, MAX_DPR);
  const W = Math.max(1, Math.round(Math.max(1, finite(o.width, 1920)) * dpr));
  const H = Math.max(1, Math.round(Math.max(1, finite(o.height, 1080)) * dpr));

  const cv = acquireTextCanvas(W, H);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d の context を取れません（文字を描けません）");
  /* プールなので前回の設定が残っている。使う物は全部 明示的に戻す */
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.miterLimit = 2;
  if ("filter" in ctx) ctx.filter = "none";
  ctx.clearRect(0, 0, W, H);
  if (!spec.content) return cv;

  /* ── 寸法を決める（入り切らなければ 1 度だけ縮める）───────────── */
  const boxW = clamp(finite(la.maxWidth, 0.8), 0.05, 1) * W;
  const margin = Math.round(Math.min(W, H) * 0.035);
  const availH = Math.max(8, H - margin * 2);
  const hasRuby = !!style.ruby;
  let fontPx = fontPxFor(style, W, H);
  let lay = doLayout(fontPx);
  let blockH = totalH(lay, fontPx);
  if (blockH > availH || lay.w > boxW * 1.001) {
    const k = Math.min(availH / Math.max(1, blockH), lay.w > boxW ? boxW / Math.max(1, lay.w) : 1);
    fontPx = Math.max(6, fontPx * clamp(k, 0.15, 1));
    lay = doLayout(fontPx);
    blockH = totalH(lay, fontPx);
  }
  const pxScale = fontPx / Math.max(1, clamp(finite(style.size, 64), 1, 4000));
  const fontCss = fontCssFor(style, fontPx);
  const lineH = fontPx * lay.lineHeight;
  const rubyPx = hasRuby ? fontPx * 0.44 : 0;
  const rubyH = hasRuby ? rubyPx * 1.15 : 0;

  /* ── 置く場所（縦の寄せ・横の寄せ）──────────────────────────── */
  const boxL = Math.max(margin, (W - boxW) / 2);
  const boxR = Math.min(W - margin, boxL + boxW);
  let top;
  if (la.vAlign === "top") top = margin;
  else if (la.vAlign === "bottom") top = H - margin - blockH;
  else top = (H - blockH) / 2;
  top = Math.max(0, top) + rubyH;

  ctx.font = fontCss;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  /* 位置は layoutText が返した advances（= 1 文字ずつ測った送り幅）を使う。
     ここで測り直さないのは、折返しと描画で違う幅を使うと字がずれるため。 */

  /* ── 描く粒に切る ───────────────────────────────────────────── */
  /* 尺が来なかったとき（呼ぶ側が渡し忘れ・Resolved に無い）は「十分長い」と
     して扱う。0 扱いにすると 入りと出しが両方 0 秒に潰れて アニメが消える。 */
  const durOpt = finite(o.duration, 0);
  const plan = animPlan(spec.anim, durOpt > 0 ? durOpt : NO_DURATION);
  const time = finite(o.time, 0);
  const items = [];
  const lineBoxes = [];
  let charN = 0, wordN = 0;
  let blockL = Infinity, blockR = -Infinity;

  for (let li = 0; li < lay.lines.length; li++) {
    const line = lay.lines[li];
    const lineTop = top + li * lineH;
    const baseY = lineTop + lineH / 2;
    let x0;
    if (la.align === "left") x0 = boxL;
    else if (la.align === "right") x0 = boxR - line.w;
    else x0 = boxL + (boxW - line.w) / 2;
    const lb = { x: x0, y: lineTop, w: line.w, h: lineH, baseY, li, firstChar: charN, firstWord: wordN };
    lineBoxes.push(lb);
    if (line.w > 0) { blockL = Math.min(blockL, x0); blockR = Math.max(blockR, x0 + line.w); }

    /* 単語の切れ目（折返しと同じ規則＝日本語は 1 文字ずつ・英語は単語ごと） */
    const cs = line.clusters;
    const words = [];
    for (let i = 0; i < cs.length; i++) {
      if (i === 0 || canBreakBetween(cs[i - 1], cs[i])) words.push({ s: i, e: i + 1 });
      else words[words.length - 1].e = i + 1;
    }
    /* 1 文字ごとの左端 */
    const xs = new Array(cs.length + 1);
    xs[0] = x0;
    for (let i = 0; i < cs.length; i++) xs[i + 1] = xs[i] + line.advances[i];

    if (plan.fine === "char") {
      for (let i = 0; i < cs.length; i++) {
        items.push({
          text: cs[i], x: xs[i], baseY, w: line.advances[i] - (i < cs.length - 1 ? lay.letterSpacing : 0),
          li, wi: wordN + wordIndexOf(words, i), ci: charN + i, lb
        });
      }
    } else if (plan.fine === "word") {
      for (let k = 0; k < words.length; k++) {
        const wd = words[k];
        items.push({
          text: cs.slice(wd.s, wd.e).join(""), x: xs[wd.s], baseY,
          w: xs[wd.e] - xs[wd.s] - (wd.e < cs.length ? lay.letterSpacing : 0), li,
          wi: wordN + k, ci: charN + wd.s, lb
        });
      }
    } else if (line.text) {
      items.push({ text: line.text, x: x0, baseY, w: line.w, li, wi: wordN, ci: charN, lb });
    }
    charN += cs.length;
    wordN += words.length;
  }
  if (!Number.isFinite(blockL)) { blockL = boxL; blockR = boxL; }
  const blockBox = {
    x: blockL, y: top, w: Math.max(0, blockR - blockL),
    h: Math.max(lineH, lay.lines.length * lineH)
  };
  const counts = { all: 1, line: Math.max(1, lay.lines.length), word: Math.max(1, wordN), char: Math.max(1, charN) };

  /* ── 塗りと効果の下ごしらえ ─────────────────────────────────── */
  const stroke = style.stroke || {};
  const shadow = style.shadow || {};
  const glow = style.glow || {};
  const strokePx = Math.max(0, finite(stroke.width, 0)) * pxScale;
  const shadowBlurPx = Math.max(0, finite(shadow.blur, 0)) * pxScale;
  const shadowOx = finite(shadow.x, 0) * pxScale, shadowOy = finite(shadow.y, 0) * pxScale;
  const glowPx0 = Math.max(0, finite(glow.blur, 0)) * pxScale;
  const hasShadow = alphaOf(shadow.color) > 0.004 && (shadowBlurPx > 0 || Math.abs(shadowOx) > 0.01 || Math.abs(shadowOy) > 0.01);
  const karaokeColor = (style.karaoke && style.karaoke.color) || "#ffd24d";
  const baseAlpha = clamp01(finite(o.opacity, 1));
  /** グラデーションの記憶（この 1 枚の中だけ。行 + 色相で引く） */
  const gradCache = new Map();

  /* ── 背景の帯（行ごと。文字より先に敷く）─────────────────────── */
  if (style.bg) {
    const bgPad = Math.max(0, finite(style.bg.pad, 16)) * pxScale;
    const bgRad = Math.max(0, finite(style.bg.radius, 12)) * pxScale;
    const bgCol = cssColor(style.bg.color, 0);
    if (String(style.bg.mode || "line") === "block" && blockBox.w > 0) {
      const s = stateAt(0, 0, 0);
      withState(s, blockBox, () => {
        roundRectPath(ctx, blockBox.x - bgPad, blockBox.y - bgPad,
          blockBox.w + bgPad * 2, blockBox.h + bgPad * 2, bgRad);
        ctx.fillStyle = bgCol; ctx.fill();
      });
    } else {
      for (const lb of lineBoxes) {
        if (!(lb.w > 0)) continue;
        const s = stateAt(lb.firstChar, lb.firstWord, lb.li);
        withState(s, anchorBox({ lb, ci: lb.firstChar, wi: lb.firstWord, li: lb.li, x: lb.x, w: lb.w, baseY: lb.baseY }), () => {
          roundRectPath(ctx, lb.x - bgPad, lb.baseY - fontPx * 0.62 - bgPad,
            lb.w + bgPad * 2, fontPx * 1.24 + bgPad * 2, bgRad);
          ctx.fillStyle = bgCol; ctx.fill();
        });
      }
    }
  }

  /* ── 文字（影 → 縁 → グロー → 塗り）───────────────────────── */
  for (const it of items) {
    if (!it.text || !it.text.trim()) continue;    // 空白は墨が無いので描かない
    const s = stateAt(it.ci, it.wi, it.li);
    if (s.opacity <= 0.002) continue;
    withState(s, anchorBox(it), () => drawItem(it, s));
  }

  /* ── ルビ ───────────────────────────────────────────────────── */
  if (hasRuby) drawRuby();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  return cv;

  /* ───────── 以下、この 1 枚のための内部関数 ───────── */

  /** その fontPx で折り直す */
  function doLayout(px) {
    const m = makeMeasurer(fontCssFor(style, px), ctx) || null;
    return layoutText(spec.content, Object.assign({}, style, { size: px }), la, boxW,
      m || ((t) => estimateWidth(t, px)));
  }
  /** ルビの分も入れた総高 */
  function totalH(l, px) {
    return l.lines.length * px * l.lineHeight + (hasRuby ? px * 0.44 * 1.15 : 0);
  }
  /** i 文字目が何番目の単語か */
  function wordIndexOf(words, i) {
    for (let k = 0; k < words.length; k++) if (i >= words[k].s && i < words[k].e) return k;
    return 0;
  }
  /** その粒の状態 */
  function stateAt(ci, wi, li) {
    return stateFor(plan, time, { all: 0, line: li, word: wi, char: ci }, counts);
  }
  /** 変形の中心・切り抜きの箱（一番粗い単位の箱を使う） */
  function anchorBox(it) {
    if (plan.coarse === "all") return blockBox;
    if (plan.coarse === "line") return { x: it.lb.x, y: it.lb.y, w: it.lb.w, h: it.lb.h };
    return { x: it.x, y: it.lb.y, w: it.w, h: it.lb.h };
  }
  /** 状態（移動・回転・拡縮・切り抜き・不透明度）の中で fn を描く */
  function withState(s, box, fn) {
    const sx = s.scale * s.scaleX, sy = s.scale * s.scaleY;
    const ax = box.x + box.w / 2, ay = box.y + box.h / 2;
    ctx.save();
    ctx.translate(ax + s.dx * fontPx, ay + s.dy * fontPx);
    if (Math.abs(s.rotate) > 1e-4) ctx.rotate((s.rotate * Math.PI) / 180);
    const ux = Math.abs(sx) < 1e-4 ? (sx < 0 ? -1e-4 : 1e-4) : sx;
    const uy = Math.abs(sy) < 1e-4 ? (sy < 0 ? -1e-4 : 1e-4) : sy;
    if (ux !== 1 || uy !== 1) ctx.scale(ux, uy);
    ctx.translate(-ax, -ay);
    if (s.clip < 0.999) {
      const c = clamp01(s.clip);
      ctx.beginPath();
      if (s.clipDir === "r") ctx.rect(box.x + box.w * (1 - c), box.y - fontPx, box.w * c + 1, box.h + fontPx * 2);
      else if (s.clipDir === "t") ctx.rect(box.x - fontPx, box.y, box.w + fontPx * 2, box.h * c + 1);
      else if (s.clipDir === "b") ctx.rect(box.x - fontPx, box.y + box.h * (1 - c), box.w + fontPx * 2, box.h * c + 1);
      else ctx.rect(box.x, box.y - fontPx, box.w * c + 1, box.h + fontPx * 2);
      ctx.clip();
    }
    ctx.globalAlpha = clamp01(s.opacity * baseAlpha);
    try { fn(); } finally { ctx.restore(); }
  }
  /** 影だけを画面に落とす（CTM の倍率を打ち消す。§9 冒頭の説明） */
  function shadowOnly(s, color, blurPx, ox, oy, draw) {
    const sx = s.scale * s.scaleX;
    if (Math.abs(sx) < 0.05) return;               // 極小のときは諦める（座標が壊れる）
    const rad = (s.rotate * Math.PI) / 180;
    const far = FAR / sx;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(0, blurPx);
    ctx.shadowOffsetX = FAR * Math.cos(rad) + ox;
    ctx.shadowOffsetY = FAR * Math.sin(rad) + oy;
    ctx.translate(-far, 0);
    draw();
    ctx.restore();
  }
  /** 影を作るための「塗り潰した形」（縁取りも含めた輪郭） */
  function silhouette(it, sw) {
    ctx.fillStyle = "#000000";
    if (sw > 0) {
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = sw;
      ctx.strokeText(it.text, it.x, it.baseY);
    }
    ctx.fillText(it.text, it.x, it.baseY);
  }
  /** 本体の塗り（単色 / グラデ。グラデは行の箱で作るので行内で繋がる） */
  function fillPaint(it, hue) {
    const g = style.gradient;
    if (!g) return cssColor(style.color, hue);
    /* 文字単位アニメだと 1 行 40 文字 × 60fps で 2400 個/秒 作ることになる。
       行と色相が同じなら同じ物なので記憶する。 */
    const gk = it.li + "|" + hue.toFixed(1);
    const memo = gradCache.get(gk);
    if (memo !== undefined) return memo;
    const rad = (finite(g.angle, 0) * Math.PI) / 180;
    const bx = it.lb.x + it.lb.w / 2, by = it.lb.baseY;
    const r = (Math.abs(Math.cos(rad)) * Math.max(1, it.lb.w) + Math.abs(Math.sin(rad)) * fontPx * 1.2) / 2;
    let grad;
    try {
      grad = ctx.createLinearGradient(
        bx - Math.cos(rad) * r, by - Math.sin(rad) * r,
        bx + Math.cos(rad) * r, by + Math.sin(rad) * r
      );
      grad.addColorStop(0, cssColor(g.from, hue));
      grad.addColorStop(1, cssColor(g.to, hue));
    } catch (_e) { return cssColor(style.color, hue); }
    gradCache.set(gk, grad);
    return grad;
  }
  /** 1 粒を描く（順番: 影 → 縁（太→細）→ グロー → 塗り → カラオケ） */
  function drawItem(it, s) {
    ctx.font = fontCss;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const blurPx = s.blur * fontPx;
    const paint = fillPaint(it, s.hue);

    if (hasShadow) shadowOnly(s, cssColor(shadow.color, 0), shadowBlurPx, shadowOx, shadowOy, () => silhouette(it, strokePx));

    if (blurPx > 0.3) {
      /* ぼかしは「自分の色の影」で作る（ctx.filter は Safari に無い） */
      const solid = typeof paint === "string" ? paint : cssColor(style.color, s.hue);
      shadowOnly(s, solid, blurPx, 0, 0, () => silhouette(it, strokePx));
      const crisp = clamp01(1 - s.blur * 6);
      if (crisp <= 0.01) return;
      ctx.globalAlpha = ctx.globalAlpha * crisp;
    }

    if (strokePx > 0 && alphaOf(stroke.color) > 0.004) {
      ctx.strokeStyle = cssColor(stroke.color, 0);
      ctx.lineWidth = strokePx;                    // 太
      ctx.strokeText(it.text, it.x, it.baseY);
      ctx.lineWidth = strokePx * 0.55;             // 細（角の隙間を埋めて綺麗にする）
      ctx.strokeText(it.text, it.x, it.baseY);
    }

    const glowPx = glowPx0 * s.glowMul;
    if (glowPx > 0.3 && alphaOf(glow.color) > 0.004) {
      const gc = cssColor(glow.color, s.hue);
      shadowOnly(s, gc, glowPx, 0, 0, () => silhouette(it, strokePx));
      shadowOnly(s, gc, glowPx * 0.5, 0, 0, () => silhouette(it, strokePx));
    }

    if (s.rgbSplit > 0.01) {
      const d = s.rgbSplit * fontPx * 0.06;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,32,80,0.55)";
      ctx.fillText(it.text, it.x - d, it.baseY);
      ctx.fillStyle = "rgba(32,255,255,0.55)";
      ctx.fillText(it.text, it.x + d, it.baseY);
      ctx.restore();
    }

    ctx.fillStyle = paint;
    ctx.fillText(it.text, it.x, it.baseY);

    if (s.hl > 0.001) {
      /* カラオケ: 左から hl の割合だけ別の色で塗り直す */
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.x, it.baseY - fontPx, Math.max(0, it.w * clamp01(s.hl)) + 0.5, fontPx * 2);
      ctx.clip();
      ctx.fillStyle = cssColor(karaokeColor, s.hue);
      ctx.fillText(it.text, it.x, it.baseY);
      ctx.restore();
    }
  }
  /** ルビ（在れば小さく上に添える） */
  function drawRuby() {
    const pairs = rubyPairs(style.ruby);
    if (!pairs.length) return;
    const rFont = fontCssFor(Object.assign({}, style, { weight: Math.max(400, finite(style.weight, 700) - 200) }), rubyPx);
    const rMeasure = makeMeasurer(rFont, ctx) || ((t) => estimateWidth(t, rubyPx));
    for (const lb of lineBoxes) {
      const line = lay.lines[lb.li];
      if (!line || !line.text) continue;
      const s = stateAt(lb.firstChar, lb.firstWord, lb.li);
      if (s.opacity <= 0.002) continue;
      for (const pr of pairs) {
        let x = lb.x, w = lb.w;
        if (pr.base) {
          const at = line.text.indexOf(pr.base);
          if (at < 0) continue;
          const before = toClusters(line.text.slice(0, at)).length;
          const len = toClusters(pr.base).length;
          let px0 = lb.x, pw = 0;
          for (let i = 0; i < before && i < line.advances.length; i++) px0 += line.advances[i];
          for (let i = before; i < before + len && i < line.advances.length; i++) pw += line.advances[i];
          x = px0; w = pw;
        } else if (lb.li !== 0) continue;           // 文字列だけのルビは 1 行目に添える
        const rw = rMeasure(pr.text);
        withState(s, { x: lb.x, y: lb.y, w: lb.w, h: lb.h }, () => {
          ctx.font = rFont;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const ry = lb.baseY - fontPx * 0.66 - rubyPx * 0.55;
          const rx = x + (w - rw) / 2;
          if (strokePx > 0) {
            ctx.strokeStyle = cssColor(stroke.color, 0);
            ctx.lineWidth = strokePx * 0.6;
            ctx.lineJoin = "round";
            ctx.strokeText(pr.text, rx, ry);
          }
          ctx.fillStyle = cssColor(style.color, s.hue);
          ctx.fillText(pr.text, rx, ry);
        });
      }
    }
  }
}

/** style.ruby を [{base,text}] へ均す（文字列でも配列でも表でも受ける） */
function rubyPairs(ruby) {
  const out = [];
  if (!ruby) return out;
  if (typeof ruby === "string") { if (ruby.trim()) out.push({ base: "", text: ruby }); return out; }
  if (Array.isArray(ruby)) {
    for (const r of ruby) {
      if (!r) continue;
      if (typeof r === "string") { out.push({ base: "", text: r }); continue; }
      const text = typeof r.text === "string" ? r.text : (typeof r.ruby === "string" ? r.ruby : "");
      if (!text) continue;
      out.push({ base: typeof r.base === "string" ? r.base : "", text });
    }
    return out;
  }
  if (typeof ruby === "object") {
    if (typeof ruby.text === "string") return [{ base: typeof ruby.base === "string" ? ruby.base : "", text: ruby.text }];
    for (const k of Object.keys(ruby)) {
      const v = ruby[k];
      if (typeof v === "string" && v) out.push({ base: k, text: v });
    }
  }
  return out;
}

/**
 * engine/sources.js の `textCanvas(resolved, {width,height,fps,project})` 用の
 * 糖衣（CONTRACT-NOTE (2)）。Resolved から TextSpec と時刻を取り出すだけ。
 * @param {Object} resolved core/eval.js の Resolved
 * @param {Object} [opts]
 * @returns {any|null}
 */
export function textCanvas(resolved, opts) {
  const r = resolved && typeof resolved === "object" ? resolved : null;
  if (!r) return null;
  const spec = r.text && typeof r.text === "object" ? r.text
    : (typeof r.content === "string" ? r : null);
  if (!spec) return null;
  const o = opts || {};
  const clip = r.clip || {};
  return renderText(spec, {
    width: finite(o.width, 1920), height: finite(o.height, 1080),
    time: finite(r.localTime, finite(o.time, 0)),
    duration: finite(r.duration, finite(clip.duration, finite(o.duration, 0))),
    dpr: finite(o.dpr, 1), fps: finite(o.fps, 30),
    opacity: 1
  });
}

/* ══ §10 様式プリセット（TEXT_PRESETS）════════════════════════════ */

/** 中まで凍らせる（共有の名簿を書き換えられて全体が壊れるのを防ぐ） */
function deepFreeze(v) {
  if (!v || typeof v !== "object" || Object.isFrozen(v)) return v;
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return Object.freeze(v);
}

/**
 * プリセット 1 つを組む。style は **必ず TextStyle の全キー**が入るように
 * `defaultTextStyle()` へ重ねる（UI と AI が欠けを気にせず使えるように）。
 */
function preset(id, label, style, layout, anim, tags) {
  const a = Object.assign({}, DEFAULT_ANIM, anim || null);
  return deepFreeze({
    id, label, name: label,
    tags: (tags || []).slice(),
    style: mergeStyle(defaultTextStyle(), style),
    layout: Object.assign({}, DEFAULT_LAYOUT, layout || null),
    anim: {
      in: Object.assign({}, DEFAULT_ANIM.in, a.in || null),
      out: Object.assign({}, DEFAULT_ANIM.out, a.out || null),
      loop: Object.assign({}, DEFAULT_ANIM.loop, a.loop || null),
      unit: ANIM_UNITS.indexOf(a.unit) >= 0 ? a.unit : "all"
    }
  });
}

/* 影と縁の使い回し（同じ値を何度も書くと直すときに必ず 1 つ忘れる） */
const SH_NONE = { x: 0, y: 0, blur: 0, color: "#00000000" };
const SH_SOFT = { x: 0, y: 4, blur: 14, color: "#000000aa" };
const SH_HARD = { x: 0, y: 6, blur: 0, color: "#000000cc" };
const NO_GLOW = { blur: 0, color: "#ffffff" };

/**
 * CapCut 風の様式プリセット（**TextStyle の完成品 + 推奨アニメ**）。
 * `TEXT_PRESETS[id] = { id, label, style, layout, anim, tags }`。
 * 中まで凍らせてあるので、使う側は `presetStyle(id)` で写しを取る。
 * @type {Object<string,{id:string,label:string,name:string,tags:string[],style:Object,layout:Object,anim:Object}>}
 */
export const TEXT_PRESETS = Object.freeze({
  /* ── 基本 ────────────────────────────────────────────────────── */
  headline: preset("headline", "見出し", {
    font: "heavy", size: 96, weight: 900, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 6, blur: 22, color: "#000000b0" }, glow: NO_GLOW
  }, { align: "center", vAlign: "middle", maxWidth: 0.86, lineHeight: 1.16 },
    { in: { type: "popIn", duration: 0.45 }, out: { type: "fade", duration: 0.25 }, unit: "all" },
    ["title"]),

  subtitle: preset("subtitle", "字幕", {
    font: "gothic", size: 48, weight: 700, color: "#ffffff",
    stroke: { width: 5, color: "#000000" }, shadow: { x: 0, y: 2, blur: 6, color: "#00000099" }, glow: NO_GLOW
  }, { align: "center", vAlign: "bottom", maxWidth: 0.9, lineHeight: 1.28 },
    { in: { type: "fade", duration: 0.18 }, out: { type: "fade", duration: 0.14 }, unit: "all" },
    ["caption", "auto"]),

  band: preset("band", "黒帯字幕", {
    font: "gothic", size: 46, weight: 700, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: SH_NONE, glow: NO_GLOW,
    bg: { color: "#000000cc", pad: 18, radius: 8 }
  }, { align: "center", vAlign: "bottom", maxWidth: 0.88, lineHeight: 1.3 },
    { in: { type: "wipeL", duration: 0.28 }, out: { type: "fade", duration: 0.16 }, unit: "all" },
    ["caption"]),

  outline: preset("outline", "白フチ", {
    font: "heavy", size: 72, weight: 900, color: "#ffffff",
    stroke: { width: 9, color: "#111111" }, shadow: SH_HARD, glow: NO_GLOW
  }, { maxWidth: 0.86, lineHeight: 1.2 },
    { in: { type: "scalePunch", duration: 0.3 }, out: { type: "popOut", duration: 0.22 }, unit: "all" },
    ["title"]),

  impact: preset("impact", "強調（ど太字）", {
    font: "heavy", size: 112, weight: 900, color: "#fff45a",
    gradient: { from: "#fff8b0", to: "#ffb300", angle: 90 },
    stroke: { width: 12, color: "#2a1400" }, shadow: { x: 0, y: 8, blur: 0, color: "#2a1400" }, glow: NO_GLOW
  }, { maxWidth: 0.9, lineHeight: 1.1 },
    { in: { type: "scalePunch", duration: 0.26 }, out: { type: "popOut", duration: 0.2 }, unit: "char" },
    ["title", "short"]),

  /* ── 雰囲気もの ──────────────────────────────────────────────── */
  neon: preset("neon", "ネオン", {
    font: "gothic", size: 80, weight: 800, color: "#c8fbff",
    stroke: { width: 2, color: "#0b4a57" }, shadow: SH_NONE,
    glow: { blur: 34, color: "#22d3ee" }
  }, { maxWidth: 0.86, lineHeight: 1.2 },
    { in: { type: "neon", duration: 0.7 }, out: { type: "fade", duration: 0.3 }, loop: { type: "neonLoop", speed: 0.7 }, unit: "all" },
    ["night", "music"]),

  hand: preset("hand", "手書き", {
    font: "hand", size: 64, weight: 700, color: "#fffdf5",
    stroke: { width: 4, color: "#3b2a16" }, shadow: { x: 2, y: 4, blur: 6, color: "#00000077" }, glow: NO_GLOW
  }, { maxWidth: 0.82, lineHeight: 1.34 },
    { in: { type: "typewriter", duration: 0.9 }, out: { type: "fade", duration: 0.2 }, unit: "char" },
    ["vlog", "casual"]),

  news: preset("news", "ニュース", {
    font: "gothic", size: 46, weight: 700, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 2, blur: 6, color: "#000000cc" }, glow: NO_GLOW,
    bg: { color: "#0b2f6bee", pad: 16, radius: 4 }
  }, { align: "left", vAlign: "bottom", maxWidth: 0.72, lineHeight: 1.24 },
    { in: { type: "wipeL", duration: 0.32 }, out: { type: "wipeR", duration: 0.24 }, unit: "all" },
    ["news", "explainer"]),

  live: preset("live", "実況テロップ", {
    font: "heavy", size: 78, weight: 900, color: "#ffffff",
    stroke: { width: 10, color: "#1a0008" }, shadow: { x: 0, y: 7, blur: 0, color: "#c2003c" }, glow: NO_GLOW
  }, { align: "center", vAlign: "bottom", maxWidth: 0.92, lineHeight: 1.14 },
    { in: { type: "bounce", duration: 0.5 }, out: { type: "popOut", duration: 0.18 }, unit: "word" },
    ["variety", "short"]),

  quote: preset("quote", "引用", {
    font: "mincho", size: 52, weight: 400, italic: true, color: "#f4efe6",
    stroke: { width: 0, color: "#000000" }, shadow: SH_SOFT, glow: NO_GLOW
  }, { align: "center", vAlign: "middle", maxWidth: 0.72, lineHeight: 1.5, letterSpacing: 0.06 },
    { in: { type: "blurIn", duration: 0.7 }, out: { type: "fade", duration: 0.4 }, unit: "all" },
    ["cinematic"]),

  cinema: preset("cinema", "シネマ", {
    font: "mincho", size: 42, weight: 400, color: "#f7f7f7",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 2, blur: 10, color: "#000000cc" }, glow: NO_GLOW
  }, { align: "center", vAlign: "bottom", maxWidth: 0.8, lineHeight: 1.4, letterSpacing: 0.18 },
    { in: { type: "fade", duration: 0.6 }, out: { type: "fade", duration: 0.6 }, unit: "all" },
    ["cinematic"]),

  gold: preset("gold", "金", {
    font: "heavy", size: 88, weight: 900, color: "#ffe9a8",
    gradient: { from: "#fff6cf", to: "#b9791a", angle: 95 },
    stroke: { width: 6, color: "#4a2f00" }, shadow: { x: 0, y: 6, blur: 14, color: "#00000099" },
    glow: { blur: 10, color: "#ffd98a" }
  }, { maxWidth: 0.86, lineHeight: 1.16 },
    { in: { type: "zoomIn", duration: 0.5 }, out: { type: "fade", duration: 0.3 }, unit: "all" },
    ["title", "luxury"]),

  pop: preset("pop", "ポップ", {
    font: "rounded", size: 76, weight: 900, color: "#fff45a",
    stroke: { width: 9, color: "#2a1a00" }, shadow: { x: 0, y: 7, blur: 0, color: "#2a1a00" }, glow: NO_GLOW
  }, { maxWidth: 0.88, lineHeight: 1.18 },
    { in: { type: "popIn", duration: 0.5 }, out: { type: "popOut", duration: 0.24 }, loop: { type: "jelly", speed: 0.8 }, unit: "char" },
    ["kids", "variety"]),

  minimal: preset("minimal", "ミニマル", {
    font: "system", size: 54, weight: 300, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 1, blur: 4, color: "#00000066" }, glow: NO_GLOW
  }, { align: "left", vAlign: "top", maxWidth: 0.7, lineHeight: 1.36, letterSpacing: 0.2 },
    { in: { type: "fadeUp", duration: 0.5 }, out: { type: "fade", duration: 0.3 }, unit: "line" },
    ["product", "explainer"]),

  retro: preset("retro", "レトロ", {
    font: "impact", size: 92, weight: 900, color: "#ffb35c",
    stroke: { width: 4, color: "#2b0f3a" }, shadow: { x: 8, y: 8, blur: 0, color: "#ff2e88" }, glow: NO_GLOW
  }, { maxWidth: 0.88, lineHeight: 1.12, letterSpacing: 0.04 },
    { in: { type: "glitchIn", duration: 0.45 }, out: { type: "popOut", duration: 0.2 }, unit: "all" },
    ["retro", "music"]),

  glitch: preset("glitch", "グリッチ", {
    font: "impact", size: 86, weight: 900, color: "#e9fbff",
    stroke: { width: 3, color: "#001018" }, shadow: SH_NONE, glow: { blur: 12, color: "#00e0ff" }
  }, { maxWidth: 0.9, lineHeight: 1.14 },
    { in: { type: "glitchIn", duration: 0.5 }, out: { type: "fade", duration: 0.2 }, loop: { type: "glitchLoop", speed: 1.4 }, unit: "char" },
    ["game", "music"]),

  /* ── 用途もの ────────────────────────────────────────────────── */
  karaoke: preset("karaoke", "カラオケ塗り", {
    font: "gothic", size: 62, weight: 900, color: "#ffffff",
    stroke: { width: 7, color: "#10131a" }, shadow: { x: 0, y: 3, blur: 8, color: "#000000aa" }, glow: NO_GLOW,
    karaoke: { color: "#ffd24d" }
  }, { align: "center", vAlign: "bottom", maxWidth: 0.9, lineHeight: 1.26 },
    { in: { type: "karaoke", duration: 1.6 }, out: { type: "fade", duration: 0.2 }, unit: "char" },
    ["music", "caption"]),

  typewriter: preset("typewriter", "打ち込み", {
    font: "mono", size: 50, weight: 500, color: "#d8ffd0",
    stroke: { width: 0, color: "#000000" }, shadow: SH_NONE, glow: { blur: 8, color: "#37ff8b" },
    bg: { color: "#001208cc", pad: 16, radius: 6 }
  }, { align: "left", vAlign: "middle", maxWidth: 0.78, lineHeight: 1.44, letterSpacing: 0.02 },
    { in: { type: "typewriter", duration: 1.2 }, out: { type: "fade", duration: 0.2 }, loop: { type: "typeCursor", speed: 1.6 }, unit: "char" },
    ["explainer", "game"]),

  sticker: preset("sticker", "ステッカー", {
    font: "rounded", size: 58, weight: 900, color: "#1b1b1f",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 6, blur: 12, color: "#00000066" }, glow: NO_GLOW,
    bg: { color: "#ffffffee", pad: 20, radius: 999 }
  }, { maxWidth: 0.7, lineHeight: 1.2 },
    { in: { type: "popIn", duration: 0.42 }, out: { type: "popOut", duration: 0.22 }, loop: { type: "breathe", speed: 0.6 }, unit: "all" },
    ["casual", "short"]),

  caution: preset("caution", "注意", {
    font: "heavy", size: 70, weight: 900, color: "#ffe100",
    stroke: { width: 8, color: "#1b1b00" }, shadow: SH_HARD, glow: NO_GLOW,
    bg: { color: "#1b1b00cc", pad: 14, radius: 6 }
  }, { maxWidth: 0.86, lineHeight: 1.2 },
    { in: { type: "scalePunch", duration: 0.24 }, out: { type: "fade", duration: 0.18 }, loop: { type: "blink", speed: 1.4 }, unit: "all" },
    ["explainer"]),

  price: preset("price", "価格", {
    font: "heavy", size: 132, weight: 900, color: "#ff3b5c",
    gradient: { from: "#ff6a3d", to: "#ff1744", angle: 100 },
    stroke: { width: 10, color: "#ffffff" }, shadow: { x: 0, y: 10, blur: 18, color: "#00000088" }, glow: NO_GLOW
  }, { maxWidth: 0.9, lineHeight: 1.04 },
    { in: { type: "drop", duration: 0.5 }, out: { type: "popOut", duration: 0.2 }, unit: "char" },
    ["product", "ad"]),

  titleBig: preset("titleBig", "タイトル大", {
    font: "gothic", size: 150, weight: 900, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 10, blur: 30, color: "#000000aa" }, glow: NO_GLOW
  }, { maxWidth: 0.92, lineHeight: 1.02, letterSpacing: -0.02 },
    { in: { type: "riseMask", duration: 0.6 }, out: { type: "fade", duration: 0.35 }, unit: "line" },
    ["title", "cinematic"]),

  credits: preset("credits", "エンドロール", {
    font: "gothic", size: 40, weight: 500, color: "#f2f5f8",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 1, blur: 5, color: "#00000088" }, glow: NO_GLOW
  }, { align: "center", vAlign: "middle", maxWidth: 0.66, lineHeight: 1.6, letterSpacing: 0.08 },
    { in: { type: "fadeUp", duration: 0.8 }, out: { type: "fade", duration: 0.6 }, unit: "line" },
    ["ending"]),

  vlog: preset("vlog", "VLOG", {
    font: "rounded", size: 56, weight: 700, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 3, blur: 12, color: "#00000099" }, glow: NO_GLOW,
    bg: { color: "#00000055", pad: 14, radius: 14 }
  }, { align: "left", vAlign: "bottom", maxWidth: 0.76, lineHeight: 1.3 },
    { in: { type: "slideL", duration: 0.4 }, out: { type: "slideR", duration: 0.3 }, unit: "word" },
    ["vlog"]),

  whisper: preset("whisper", "細字（ささやき）", {
    font: "system", size: 44, weight: 300, color: "#eaf2ff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 1, blur: 6, color: "#00000077" }, glow: NO_GLOW
  }, { maxWidth: 0.7, lineHeight: 1.42, letterSpacing: 0.12 },
    { in: { type: "blurIn", duration: 0.8 }, out: { type: "fade", duration: 0.5 }, loop: { type: "float", speed: 0.5 }, unit: "all" },
    ["cinematic"]),

  whiteBand: preset("whiteBand", "白帯（黒字）", {
    font: "gothic", size: 50, weight: 800, color: "#14161c",
    stroke: { width: 0, color: "#000000" }, shadow: SH_NONE, glow: NO_GLOW,
    bg: { color: "#ffffffee", pad: 16, radius: 4 }
  }, { align: "center", vAlign: "bottom", maxWidth: 0.86, lineHeight: 1.26 },
    { in: { type: "wipeL", duration: 0.26 }, out: { type: "wipeR", duration: 0.2 }, unit: "all" },
    ["news", "product"]),

  redAlert: preset("redAlert", "赤強調", {
    font: "heavy", size: 84, weight: 900, color: "#ffffff",
    stroke: { width: 8, color: "#7a0014" }, shadow: { x: 0, y: 6, blur: 0, color: "#7a0014" }, glow: { blur: 16, color: "#ff2d4f" }
  }, { maxWidth: 0.88, lineHeight: 1.14 },
    { in: { type: "scalePunch", duration: 0.22 }, out: { type: "popOut", duration: 0.18 }, loop: { type: "shake", speed: 2 }, unit: "all" },
    ["variety", "short"]),

  vertical: preset("vertical", "縦書き（縦積み）", {
    font: "mincho", size: 56, weight: 600, color: "#fbf7ee", vertical: true,
    stroke: { width: 0, color: "#000000" }, shadow: { x: 2, y: 2, blur: 8, color: "#000000aa" }, glow: NO_GLOW
  }, { align: "right", vAlign: "middle", maxWidth: 0.3, lineHeight: 1.06 },
    { in: { type: "fadeDown", duration: 0.7 }, out: { type: "fade", duration: 0.3 }, unit: "char" },
    ["japanese", "cinematic"]),

  rainbow: preset("rainbow", "虹色", {
    font: "rounded", size: 82, weight: 900, color: "#ff5fa2",
    stroke: { width: 8, color: "#1a1030" }, shadow: SH_HARD, glow: NO_GLOW
  }, { maxWidth: 0.88, lineHeight: 1.16 },
    { in: { type: "popIn", duration: 0.45 }, out: { type: "popOut", duration: 0.22 }, loop: { type: "rainbow", speed: 0.5 }, unit: "char" },
    ["kids", "music"]),

  wave: preset("wave", "波打つ", {
    font: "rounded", size: 74, weight: 900, color: "#8ef6ff",
    stroke: { width: 7, color: "#062733" }, shadow: SH_HARD, glow: { blur: 8, color: "#59e0ff" }
  }, { maxWidth: 0.88, lineHeight: 1.2 },
    { in: { type: "fadeUp", duration: 0.5 }, out: { type: "fade", duration: 0.25 }, loop: { type: "wave", speed: 0.9 }, unit: "char" },
    ["kids", "music"]),

  lower: preset("lower", "名前テロップ", {
    font: "gothic", size: 44, weight: 800, color: "#ffffff",
    stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 2, blur: 8, color: "#000000aa" }, glow: NO_GLOW,
    bg: { color: "#111827dd", pad: 14, radius: 10 }
  }, { align: "left", vAlign: "bottom", maxWidth: 0.6, lineHeight: 1.24 },
    { in: { type: "slideL", duration: 0.36 }, out: { type: "slideL", duration: 0.28 }, unit: "all" },
    ["interview", "news"])
});

/** プリセットの id 一覧（UI の並び順） */
export const TEXT_PRESET_IDS = Object.freeze(Object.keys(TEXT_PRESETS));

/**
 * プリセットの TextStyle の **写し**（凍っていない物）を返す。
 * @param {string} id @returns {Object}
 */
export function presetStyle(id) {
  const p = TEXT_PRESETS[String(id || "")];
  const src = p ? p.style : defaultTextStyle();
  const out = Object.assign({}, src);
  for (const k of ["stroke", "shadow", "glow", "gradient", "bg", "karaoke"]) {
    if (out[k] && typeof out[k] === "object") out[k] = Object.assign({}, out[k]);
  }
  if (Array.isArray(out.ruby)) out.ruby = out.ruby.map((r) => Object.assign({}, r));
  return out;
}

/**
 * TextSpec にプリセットを被せた **新しい TextSpec** を返す（本文は残す）。
 * @param {Object} textSpec @param {string} id @returns {Object}
 */
export function applyPreset(textSpec, id) {
  const p = TEXT_PRESETS[String(id || "")];
  const base = normSpec(textSpec);
  if (!p) return base;
  return {
    content: base.content,
    style: presetStyle(p.id),
    layout: Object.assign({}, p.layout),
    anim: {
      in: Object.assign({}, p.anim.in), out: Object.assign({}, p.anim.out),
      loop: Object.assign({}, p.anim.loop), unit: p.anim.unit
    }
  };
}
