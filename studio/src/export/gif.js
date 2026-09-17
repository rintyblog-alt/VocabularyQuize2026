/* ══════════════════════════════════════════════════════════════════════════
   studio/src/export/gif.js — GIF89a を自前で書くエンコーダ（契約書 §11-4）

   ★ 何をする所か
     ImageData（canvas の RGBA）を 1 枚ずつ受け取り、そのまま再生できる
     アニメーション GIF のバイト列を組む。構造は
       "GIF89a" → 画面記述子 → グローバル色表 → NETSCAPE ループ拡張
       →（画像制御拡張 → 画像記述子 → LZW 圧縮した画素）× 枚数 → 0x3B。
     外部依存ゼロ・ビルド無し。Node でもそのまま回る（Blob 無しでも
     finalizeBytes() が使える）。

   ★ なぜこの形か
     ・GIF は「256 色まで」「圧縮は LZW だけ」という 1987 年の形式なので、
       ブラウザの API では作れない（canvas は GIF を吐けない）。
       量子化と LZW を自分で書くのが唯一の道。
     ・量子化は **中央値分割（median cut）**。NeuQuant は速いが乱数と
       学習率で結果が揺れる。中央値分割は **決定的**（同じ入力 → 同じバイト列）
       なので tests/gif.test.mjs で押さえられる。
     ・パレットは **最初の数フレームから 1 つだけ学んで使い回す**
       （グローバル色表）。フレーム毎にローカル色表を持たせると
       ①ファイルが 768 バイト × 枚数 太る ②色がチラつく。
     ・**透明色は使わない**（契約書 §11-4）。α は背景色に重ねて潰す。
       透明にすると「前の絵が残る」演出と差分更新が干渉して、
       半透明の素材で必ず汚れが出る。
     ・差分最適化: 直前フレームと画素の添字が同じ所は書かない。
       変わった所の **最小外接矩形** だけを、廃棄方法 1（そのまま残す）で
       重ね書きする。静止した絵は数十分の 1 になる。
       まったく同じ絵なら **フレームを増やさず直前の表示時間を延ばす**。

   ★ 触るときの注意
     ・LZW の符号長を増やす所（emit の後で `next > maxcode` を見る）は
       1 命令ずれると復号器と食い違って「途中から砂嵐」になる。
       Kevin Weiner 版と同じ «出した後で・足す前に見る» 順を守る。
       理屈は tests/gif.test.mjs の復号器（別に書いてある）が見張っている。
     ・低レベル（medianCut / nearestColor / lzwEncode / *Bytes）は試験のために
       export している。署名を変えると tests/gif.test.mjs が落ちる。
     ・パレットは最初の `learnFrames`（既定 3）枚だけから学ぶので、
       **冒頭が単色の動画では後から出る色が潰れる**。そういう素材は
       learnFrames を増やすか、`palette` に自分で決めた色を渡す
       （学習を丸ごと飛ばせる）。1 枚が 100 万画素を超える時は記憶を守るため
       学習を 1 枚に落とす。
     ・遅延は **1/100 秒（centisecond）刻み**しか書けない。fps 12（83.3ms）は
       8cs にしか落ちないので、累積時刻から毎回引き算して丸め誤差を
       次のフレームへ送る（総尺がずれないようにする）。
     ・DOM を触るのは exportGif() だけ（engine/* は動的 import）。
       createGIFEncoder より上は純粋なので Node で試験できる。
     ・bytes() は «途中を覗く» 口だが、覗いてもパレットの学習は進めない
       （覗いた分は捨てる写しとして組む）。ここで学習を確定させると
       «下書きを 1 回見ただけで後から出る色が全部潰れる» ので、
       encodeInto() / assemble() は積み先とパレットを引数で取る形にしてある。
     ・CONTRACT-NOTE: 契約書 §0 の «1 ファイル 700 行» を 270 行ほど超えている。
       担当の割り当てが この 1 ファイルなので今は分けない（他人のファイルを
       作らない規約が優先）。次に触る人が分けるなら境目はここ:
         §2-§3（medianCut / nearestColor / quantizeFrame）→ export/gif-quant.js
         §4（lzwEncode / subBlocks）→ export/gif-lzw.js
       §5 以降（バイト列と createGIFEncoder と exportGif）だけ残せば 400 行を切る。
     ・CONTRACT-NOTE: exporter.js の runGif() は gif.js の
       `exportGif(project, opts)` を探して «Blob を返す» 事だけを期待している
       （契約書 §11-4 は関数名を決めていない）。そこで契約の
       createGIFEncoder と 併せて exportGif も出し、default は
       createGIFEncoder にしてある。
   ══════════════════════════════════════════════════════════════════════════ */

import { scope } from "../core/log.js";
import { clamp, clampInt, finite, hexToRgb } from "../core/util.js";

const L = scope("gif");

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** 先頭の 6 バイト（GIF87a では NETSCAPE 拡張が読まれないので 89a 固定） */
export const GIF_SIGNATURE = "GIF89a";
/** 末尾の 1 バイト */
export const GIF_TRAILER = 0x3b;
/** 拡張ブロックの導入子 */
export const EXT_INTRODUCER = 0x21;
/** 画像記述子の導入子 */
export const IMAGE_SEPARATOR = 0x2c;
/** 画像制御拡張 / アプリ拡張のラベル */
export const GCE_LABEL = 0xf9;
export const APP_LABEL = 0xff;
/** 色表の上限 */
export const MAX_COLORS = 256;
/** LZW の符号の上限（12bit） */
export const MAX_LZW_CODE = 4096;
/** 1 枚あたりの画素数がこれを超えたら学習フレームを 1 枚に落とす（記憶を守る） */
export const BIG_FRAME_PIXELS = 1000000;

/* ── 1. バイト列の小道具 ───────────────────────────────────────── */

/** @param {Uint8Array[]} list @returns {Uint8Array} */
export function concatBytes(list) {
  let n = 0;
  for (const b of list) n += b ? b.length : 0;
  const out = new Uint8Array(n);
  let at = 0;
  for (const b of list) { if (b && b.length) { out.set(b, at); at += b.length; } }
  return out;
}

/** 16bit little endian（GIF の数値は全部これ） */
function u16(n) {
  const v = clampInt(finite(n, 0), 0, 65535);
  return [v & 0xff, (v >> 8) & 0xff];
}

function ascii(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** 色表の大きさ（2^bits）に必要なビット数。GIF は 2..8 しか許さない */
export function paletteBits(len) {
  const n = clampInt(finite(len, 2), 1, MAX_COLORS);
  let bits = 1;
  while ((1 << bits) < n) bits++;
  return clampInt(bits, 2, 8);
}

/** [r,g,b] の並び → 2^bits × 3 バイトの色表（余りは 0 で埋める） */
export function flattenPalette(palette) {
  const p = palette || [];
  const bits = paletteBits(p.length);
  const out = new Uint8Array((1 << bits) * 3);
  for (let i = 0; i < p.length && i < (1 << bits); i++) {
    const c = p[i] || [0, 0, 0];
    out[i * 3] = clampInt(finite(c[0], 0), 0, 255);
    out[i * 3 + 1] = clampInt(finite(c[1], 0), 0, 255);
    out[i * 3 + 2] = clampInt(finite(c[2], 0), 0, 255);
  }
  return out;
}

/**
 * "#rrggbb" / [r,g,b](0..255) / {color:"#rrggbb"} / null → [r,g,b]（0..255 の整数）。
 * object も受けるのは、呼び出し側が契約書 §1 の
 * `settings.background = { type, color, assetId, blur }` をそのまま渡しても
 * 黙って黒にならないようにするため（α を潰す色がずれると «背景が黒い GIF» になる）。
 */
function toRgb255(v, fallback) {
  if (Array.isArray(v) && v.length >= 3) {
    return [clampInt(finite(v[0], 0), 0, 255), clampInt(finite(v[1], 0), 0, 255), clampInt(finite(v[2], 0), 0, 255)];
  }
  if (typeof v === "string") {
    const f = hexToRgb(v);
    if (f) return [Math.round(f[0] * 255), Math.round(f[1] * 255), Math.round(f[2] * 255)];
  }
  if (v && typeof v === "object" && (typeof v.color === "string" || Array.isArray(v.color))) {
    return toRgb255(v.color, fallback);
  }
  return fallback ? fallback.slice() : [0, 0, 0];
}

/* ── 2. 量子化（中央値分割）───────────────────────────────────── */

const packRgb = (r, g, b) => (r << 16) | (g << 8) | b;
const unpackRgb = (k) => [(k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff];

/**
 * 画素の並びを «色 → 出現数» の表にする。
 * pixels は次のどれでも受ける:
 *   ・[[r,g,b], ...]（配列の配列）
 *   ・平らな Uint8Array / 数の配列（既定は 3 バイト刻み。RGBA は stride:4）
 * @param {ArrayLike<any>} pixels
 * @param {{stride?:number, step?:number}} [opts]
 * @returns {{keys:number[], counts:number[]}} keys は 24bit に詰めた色（昇順）
 */
export function colorHistogram(pixels, opts) {
  const o = opts || {};
  const step = Math.max(1, Math.round(finite(o.step, 1)));
  const map = new Map();
  const add = (r, g, b) => {
    const k = packRgb(clampInt(finite(r, 0), 0, 255), clampInt(finite(g, 0), 0, 255), clampInt(finite(b, 0), 0, 255));
    map.set(k, (map.get(k) || 0) + 1);
  };
  const src = pixels || [];
  const len = src.length || 0;
  if (len && (Array.isArray(src[0]) || (src[0] && typeof src[0] === "object"))) {
    for (let i = 0; i < len; i += step) {
      const c = src[i];
      if (!c) continue;
      add(c[0], c[1], c[2]);
    }
  } else {
    // 刻みが指定されていなければ 3 と見る（4 でしか割れないときだけ RGBA と見る）
    let stride = Math.round(finite(o.stride, 0));
    if (stride !== 3 && stride !== 4) stride = (len % 3 !== 0 && len % 4 === 0) ? 4 : 3;
    for (let i = 0; i + 2 < len; i += stride * step) add(src[i], src[i + 1], src[i + 2]);
  }
  const keys = Array.from(map.keys()).sort((a, b) => a - b);   // 入力順に依らせない
  const counts = keys.map((k) => map.get(k));
  return { keys, counts };
}

/** 箱（色空間の直方体）の範囲と重みを数える */
function makeBox(order, keys, counts, lo, hi) {
  let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, count = 0;
  for (let i = lo; i < hi; i++) {
    const k = keys[order[i]];
    const r = (k >> 16) & 0xff, g = (k >> 8) & 0xff, b = k & 0xff;
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    count += counts[order[i]];
  }
  const rr = rmax - rmin, gr = gmax - gmin, br = bmax - bmin;
  const range = Math.max(rr, gr, br);
  // 分ける順は «重み × 広がり» の大きい箱から（誤差の大きい所を先に割る）
  return { lo, hi, count, range, channel: rr >= gr && rr >= br ? 0 : (gr >= br ? 1 : 2), priority: count * range };
}

/**
 * 中央値分割で n 色以下のパレットを作る。**決定的**（乱数を使わない）。
 * @param {ArrayLike<any>} pixels colorHistogram と同じ形
 * @param {number} n 欲しい色数（1..256）
 * @param {{stride?:number, step?:number}} [opts]
 * @returns {number[][]} [[r,g,b], ...]（明るさ昇順。1 色以上必ず返す）
 */
export function medianCut(pixels, n, opts) {
  const want = clampInt(finite(n, MAX_COLORS), 1, MAX_COLORS);
  const { keys, counts } = colorHistogram(pixels, opts);
  if (!keys.length) return [[0, 0, 0]];
  if (keys.length <= want) return keys.map(unpackRgb).sort(byLuma);

  const order = new Int32Array(keys.length);
  for (let i = 0; i < keys.length; i++) order[i] = i;
  const boxes = [makeBox(order, keys, counts, 0, keys.length)];

  while (boxes.length < want) {
    let bi = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.hi - b.lo < 2 || b.range <= 0) continue;
      if (b.priority > best) { best = b.priority; bi = i; }
    }
    if (bi < 0) break;                      // これ以上割れない（色が足りない）
    const box = boxes[bi];
    const ch = box.channel;
    // 広がりの一番大きい軸で並べ、重みの半分の所で割る
    const sub = Array.prototype.slice.call(order.subarray(box.lo, box.hi));
    const shift = ch === 0 ? 16 : (ch === 1 ? 8 : 0);
    sub.sort((x, y) => {
      const a = (keys[x] >> shift) & 0xff, b = (keys[y] >> shift) & 0xff;
      return a !== b ? a - b : keys[x] - keys[y];   // 同値は色で並べて決定的に
    });
    order.set(sub, box.lo);
    const half = box.count / 2;
    let acc = 0, cut = box.lo;
    for (let i = box.lo; i < box.hi - 1; i++) {
      acc += counts[order[i]];
      cut = i + 1;
      if (acc >= half) break;
    }
    if (cut <= box.lo) cut = box.lo + 1;
    if (cut >= box.hi) cut = box.hi - 1;
    boxes.splice(bi, 1,
      makeBox(order, keys, counts, box.lo, cut),
      makeBox(order, keys, counts, cut, box.hi));
  }

  const out = boxes.map((box) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = box.lo; i < box.hi; i++) {
      const k = keys[order[i]], c = counts[order[i]];
      r += ((k >> 16) & 0xff) * c; g += ((k >> 8) & 0xff) * c; b += (k & 0xff) * c;
      w += c;
    }
    if (!w) return [0, 0, 0];
    return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
  });
  return out.sort(byLuma);
}

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
function byLuma(a, b) {
  const d = luma(a) - luma(b);
  if (d) return d;
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}

/**
 * パレットの中で一番近い色の添字。距離は RGB の二乗和（重み無し）。
 * @param {number[][]|ArrayLike<number>} palette [[r,g,b],...] か 平らな 3 バイト刻み
 * @param {number[]|number} rgb [r,g,b] か r（そのときは g,b も渡す）
 * @param {number} [g] @param {number} [b]
 * @returns {number} 添字（0 以上）
 */
export function nearestColor(palette, rgb, g, b) {
  const flat = !Array.isArray(rgb) ? [finite(rgb, 0), finite(g, 0), finite(b, 0)] : rgb;
  const r0 = clampInt(finite(flat[0], 0), 0, 255);
  const g0 = clampInt(finite(flat[1], 0), 0, 255);
  const b0 = clampInt(finite(flat[2], 0), 0, 255);
  const p = palette || [];
  const triples = p.length > 0 && Array.isArray(p[0]);
  const count = triples ? p.length : Math.floor((p.length || 0) / 3);
  if (!count) throw new Error("nearestColor: palette が空です");
  let bi = 0, bd = Infinity;
  for (let i = 0; i < count; i++) {
    const c = triples ? p[i] : null;
    const pr = triples ? c[0] : p[i * 3];
    const pg = triples ? c[1] : p[i * 3 + 1];
    const pb = triples ? c[2] : p[i * 3 + 2];
    const dr = r0 - pr, dg = g0 - pg, db = b0 - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; if (!d) break; }
  }
  return bi;
}

/**
 * パレット引きに記憶を付けた物（同じ色を何万回も総当たりしないため）。
 * palette は **[[r,g,b], ...] の形だけ**（medianCut の返り）。平らなバイト列を
 * 渡したい時は 3 つずつに組み直してから渡す。
 * @param {number[][]} palette
 * @returns {{palette:number[][], flat:Uint8Array, index:(r:number,g:number,b:number)=>number}}
 */
export function createPaletteMapper(palette) {
  const list = (palette || []).map((c) => [
    clampInt(finite(c && c[0], 0), 0, 255), clampInt(finite(c && c[1], 0), 0, 255), clampInt(finite(c && c[2], 0), 0, 255),
  ]);
  if (!list.length) list.push([0, 0, 0]);
  const cache = new Map();
  return {
    palette: list,
    flat: flattenPalette(list),
    /** @param {number} r @param {number} g @param {number} b @returns {number} */
    index(r, g, b) {
      const k = packRgb(r, g, b);
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      const i = nearestColor(list, r, g, b);
      if (cache.size > 65536) cache.clear();   // 記憶が太りすぎない所で捨てる
      cache.set(k, i);
      return i;
    },
  };
}

/* ── 3. フレーム → 添字の並び（誤差拡散つき）──────────────────── */

/**
 * RGBA の 1 枚をパレットの添字に落とす。dither で Floyd–Steinberg。
 * α は background に重ねて潰す（契約書 §11-4「透明色は使わない」）。
 * @param {ArrayLike<number>} rgba @param {number} width @param {number} height
 * @param {{palette:number[][], index:Function}} mapper createPaletteMapper の返り
 * @param {{dither?:boolean, background?:number[]}} [opts]
 * @returns {Uint8Array} width*height の添字
 */
export function quantizeFrame(rgba, width, height, mapper, opts) {
  const o = opts || {};
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const need = w * h * 4;
  if (!rgba || rgba.length < need) {
    throw new Error(`quantizeFrame: 画素が足りません（${w}×${h} には ${need} バイト必要・実際は ${rgba ? rgba.length : 0}）`);
  }
  const dither = !!o.dither;
  const bg = toRgb255(o.background, [0, 0, 0]);
  const pal = mapper.palette;
  const out = new Uint8Array(w * h);
  // 誤差は «今の行» と «次の行» の 2 本だけ持つ（両端に 1 画素の余白）
  let cur = dither ? new Float32Array((w + 2) * 3) : null;
  let nxt = dither ? new Float32Array((w + 2) * 3) : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] / 255;
      let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (a < 1) { r = r * a + bg[0] * (1 - a); g = g * a + bg[1] * (1 - a); b = b * a + bg[2] * (1 - a); }
      if (dither) {
        const e = (x + 1) * 3;
        r = clamp(r + cur[e], 0, 255); g = clamp(g + cur[e + 1], 0, 255); b = clamp(b + cur[e + 2], 0, 255);
      }
      const ri = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
      const gi = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      const bi = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
      const idx = mapper.index(ri, gi, bi);
      out[y * w + x] = idx;
      if (!dither) continue;
      const c = pal[idx];
      const er = r - c[0], eg = g - c[1], eb = b - c[2];
      spread(cur, (x + 2) * 3, er, eg, eb, 7 / 16);      // 右
      spread(nxt, x * 3, er, eg, eb, 3 / 16);            // 左下
      spread(nxt, (x + 1) * 3, er, eg, eb, 5 / 16);      // 下
      spread(nxt, (x + 2) * 3, er, eg, eb, 1 / 16);      // 右下
    }
    if (dither) {
      const t = cur; cur = nxt; nxt = t;
      nxt.fill(0);
    }
  }
  return out;
}

function spread(buf, at, er, eg, eb, k) {
  buf[at] += er * k; buf[at + 1] += eg * k; buf[at + 2] += eb * k;
}

/**
 * 直前のフレームと変わった所の最小外接矩形。
 * prev が無ければ全面、まったく同じなら null。
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function diffRect(prev, next, width, height) {
  const w = Math.round(width), h = Math.round(height);
  if (!prev) return { x: 0, y: 0, w, h };
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let dirty = false;
    for (let x = 0; x < w; x++) {
      if (prev[row + x] !== next[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        dirty = true;
      }
    }
    if (dirty) { if (y < minY) minY = y; maxY = y; }
  }
  if (maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 矩形の中だけ切り出す */
function cropIndices(idx, width, rect) {
  if (rect.x === 0 && rect.y === 0 && rect.w === width) return idx.subarray(0, rect.w * rect.h);
  const out = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    const from = (rect.y + y) * width + rect.x;
    out.set(idx.subarray(from, from + rect.w), y * rect.w);
  }
  return out;
}

/* ── 4. LZW（可変ビット長・クリアコード・辞書リセット）─────────── */

/**
 * GIF の LZW 圧縮。返るのは **符号の並びだけ**（最小符号長のバイトも
 * 255 バイトごとの小ブロックも付かない。付けるのは lzwBlocks）。
 * @param {ArrayLike<number>} indices パレットの添字
 * @param {number} minCodeSize 2..8
 * @returns {Uint8Array}
 */
export function lzwEncode(indices, minCodeSize) {
  const min = clampInt(finite(minCodeSize, 8), 2, 8);
  const clearCode = 1 << min;
  const endCode = clearCode + 1;
  const out = [];
  let acc = 0, accBits = 0;
  let codeSize = min + 1;
  let maxCode = (1 << codeSize) - 1;
  let next = clearCode + 2;
  let dict = new Map();

  const emit = (code) => {
    acc |= (code & 0xfff) << accBits;
    accBits += codeSize;
    while (accBits >= 8) { out.push(acc & 0xff); acc >>= 8; accBits -= 8; }
    // 「出した後・足す前」に見る（復号器の符号長の上げ方と揃える）
    if (next > maxCode && codeSize < 12) { codeSize++; maxCode = (1 << codeSize) - 1; }
  };
  const reset = () => {
    // クリアコードは **今の符号長で** 出してから戻す（復号器も同じ順で読む）
    emit(clearCode);
    codeSize = min + 1;
    maxCode = (1 << codeSize) - 1;
    next = clearCode + 2;
    dict = new Map();
  };

  emit(clearCode);
  const n = indices ? indices.length : 0;
  if (n) {
    let prefix = indices[0] & 0xff;
    for (let i = 1; i < n; i++) {
      const k = indices[i] & 0xff;
      const key = (prefix << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next < MAX_LZW_CODE) {
        dict.set(key, next);
        next++;
      } else {
        // 辞書が満杯（next は 4096 = 符号長も既に 12）。クリアして最初から。
        // ここを忘れると長い GIF が «途中から砂嵐» になる
        reset();
      }
      prefix = k;
    }
    emit(prefix);
  }
  emit(endCode);
  if (accBits > 0) out.push(acc & 0xff);
  return new Uint8Array(out);
}

/** 255 バイトごとの小ブロックに割る（末尾に 0 の終端を付ける） */
export function subBlocks(bytes) {
  const src = bytes || new Uint8Array(0);
  const blocks = Math.ceil(src.length / 255);
  const out = new Uint8Array(src.length + blocks + 1);
  let at = 0, from = 0;
  while (from < src.length) {
    const n = Math.min(255, src.length - from);
    out[at++] = n;
    out.set(src.subarray(from, from + n), at);
    at += n; from += n;
  }
  out[at++] = 0;
  return out.subarray(0, at);
}

/** 画像データ部（最小符号長 + 小ブロック + 終端）を丸ごと作る */
export function lzwBlocks(indices, minCodeSize) {
  const min = clampInt(finite(minCodeSize, 8), 2, 8);
  return concatBytes([new Uint8Array([min]), subBlocks(lzwEncode(indices, min))]);
}

/* ── 5. 各ブロックのバイト列 ───────────────────────────────────── */

/**
 * "GIF89a" + 論理画面記述子（+ グローバル色表）。
 * @param {{width:number, height:number, palette?:number[][]|null,
 *          background?:number, aspect?:number}} opts
 * @returns {Uint8Array}
 */
export function gifHeaderBytes(opts) {
  const o = opts || {};
  const w = clampInt(finite(o.width, 1), 1, 65535);
  const h = clampInt(finite(o.height, 1), 1, 65535);
  const pal = o.palette || null;
  const bits = pal ? paletteBits(pal.length) : 1;
  const packed = pal ? (0x80 | ((bits - 1) & 0x07)) : 0x00;
  const head = [
    ...ascii(GIF_SIGNATURE),
    ...u16(w), ...u16(h),
    packed,
    clampInt(finite(o.background, 0), 0, 255),
    clampInt(finite(o.aspect, 0), 0, 255),
  ];
  return pal ? concatBytes([new Uint8Array(head), flattenPalette(pal)]) : new Uint8Array(head);
}

/**
 * NETSCAPE2.0 のループ拡張。loop=0 は無限。
 * @param {number} [loop=0] @returns {Uint8Array}
 */
export function netscapeLoopExtBytes(loop) {
  const n = clampInt(finite(loop, 0), 0, 65535);
  return concatBytes([
    new Uint8Array([EXT_INTRODUCER, APP_LABEL, 0x0b]),
    ascii("NETSCAPE2.0"),
    new Uint8Array([0x03, 0x01, ...u16(n), 0x00]),
  ]);
}

/**
 * 画像制御拡張（表示時間と廃棄方法）。
 * delayCs が在ればそれを、無ければ delayMs を 1/100 秒に丸めて使う。
 * @param {{delayMs?:number, delayCs?:number, disposal?:number,
 *          transparentIndex?:number, userInput?:boolean}} [opts]
 * @returns {Uint8Array}
 */
export function graphicControlExtBytes(opts) {
  const o = opts || {};
  const cs = o.delayCs !== undefined
    ? clampInt(finite(o.delayCs, 0), 0, 65535)
    : clampInt(Math.round(finite(o.delayMs, 0) / 10), 0, 65535);
  const disposal = clampInt(finite(o.disposal, 1), 0, 3);
  const tIdx = Math.round(finite(o.transparentIndex, -1));
  const hasT = tIdx >= 0 && tIdx <= 255;
  const packed = ((disposal & 0x07) << 2) | (o.userInput ? 0x02 : 0) | (hasT ? 0x01 : 0);
  return new Uint8Array([
    EXT_INTRODUCER, GCE_LABEL, 0x04, packed, ...u16(cs), hasT ? tIdx : 0, 0x00,
  ]);
}

/**
 * 画像記述子（どこに何を重ねるか）。localPalette を渡すとローカル色表も付く。
 * @param {{left?:number, top?:number, width:number, height:number,
 *          interlace?:boolean, localPalette?:number[][]|null}} opts
 * @returns {Uint8Array}
 */
export function imageDescriptorBytes(opts) {
  const o = opts || {};
  const lp = o.localPalette || null;
  const bits = lp ? paletteBits(lp.length) : 1;
  const packed = (lp ? 0x80 : 0) | (o.interlace ? 0x40 : 0) | (lp ? ((bits - 1) & 0x07) : 0);
  const head = new Uint8Array([
    IMAGE_SEPARATOR,
    ...u16(o.left), ...u16(o.top),
    ...u16(Math.max(1, finite(o.width, 1))), ...u16(Math.max(1, finite(o.height, 1))),
    packed,
  ]);
  return lp ? concatBytes([head, flattenPalette(lp)]) : head;
}

/* ── 6. createGIFEncoder（契約書 §11-4 の入口）─────────────────── */

/** ImageData 風（{width,height,data}）か 平らな RGBA を取り出す */
function readFrame(image, w, h) {
  let data = null, iw = w, ih = h;
  if (image && (image.data || image.buffer !== undefined) && image.length === undefined) {
    data = image.data;
    if (Number.isFinite(image.width) && image.width > 0) iw = Math.round(image.width);
    if (Number.isFinite(image.height) && image.height > 0) ih = Math.round(image.height);
  } else if (image && image.length !== undefined) {
    data = image;
  }
  if (!data || data.length === undefined) {
    throw new Error("addFrame: ImageData 風（{width,height,data}）か RGBA の並びを渡してください");
  }
  if (iw !== w || ih !== h) {
    throw new Error(`addFrame: 大きさが違います（この GIF は ${w}×${h}・渡されたのは ${iw}×${ih}）。同じ大きさで描いてから渡してください`);
  }
  if (data.length < w * h * 4) {
    throw new Error(`addFrame: RGBA が足りません（${w}×${h} には ${w * h * 4} バイト必要・実際は ${data.length}）`);
  }
  return data;
}

/**
 * GIF エンコーダを作る（契約書 §11-4）。
 * @param {{width:number, height:number, fps?:number, loop?:number,
 *          dither?:boolean, quality?:number, colors?:number,
 *          learnFrames?:number, background?:string|number[],
 *          palette?:number[][]|null}} opts
 * @returns {{addFrame:Function, finalize:Function, finalizeBytes:Function,
 *            bytes:Function, dispose:Function, state:Function, stats:Function,
 *            palette:Function, mime:string}}
 */
export function createGIFEncoder(opts) {
  const o = opts || {};
  const width = clampInt(finite(o.width, 0), 0, 65535);
  const height = clampInt(finite(o.height, 0), 0, 65535);
  if (width < 1 || height < 1) throw new Error("createGIFEncoder: width / height に 1 以上の数が要ります");
  const fps = clamp(finite(o.fps, 12), 1, 50);
  const loop = clampInt(finite(o.loop, 0), 0, 65535);
  const dither = o.dither !== false;
  // quality は «何画素ごとに色を見るか»。1 = 全部見る（遅い・綺麗）
  const step = clampInt(finite(o.quality, 10), 1, 30);
  const colors = clampInt(finite(o.colors, MAX_COLORS), 2, MAX_COLORS);
  const background = toRgb255(o.background, [0, 0, 0]);
  const bigFrame = width * height > BIG_FRAME_PIXELS;
  const learnFrames = bigFrame ? 1 : clampInt(finite(o.learnFrames, 3), 1, 16);
  const defaultDelayMs = 1000 / fps;
  const mime = "image/gif";

  const st = {
    phase: "open",
    frames: [],      // { delayMs, body }
    pending: [],     // 学習中に溜めた { data:Uint8Array(RGBA の写し), delayMs }
    samples: [],     // 学習用の画素（Uint8Array・RGB 3 バイト刻み）
    mapper: null,
    prev: null,
    file: null,
    addedMs: 0,
    skipped: 0,
    written: 0,
  };

  if (o.palette && o.palette.length) st.mapper = createPaletteMapper(o.palette);

  function assertOpen(who) {
    if (st.phase === "disposed") throw new Error(`${who}: この GIF エンコーダは dispose 済みです`);
    if (st.phase === "finalized") throw new Error(`${who}: この GIF エンコーダは finalize 済みです`);
  }

  /** 学習用に間引いた画素を溜める（α は背景に重ねてから） */
  function collect(data) {
    const n = width * height;
    const keep = Math.ceil(n / step);
    const buf = new Uint8Array(keep * 3);
    let at = 0;
    for (let p = 0; p < n; p += step) {
      const i = p * 4;
      const a = data[i + 3] / 255;
      if (a >= 1) { buf[at] = data[i]; buf[at + 1] = data[i + 1]; buf[at + 2] = data[i + 2]; }
      else {
        buf[at] = Math.round(data[i] * a + background[0] * (1 - a));
        buf[at + 1] = Math.round(data[i + 1] * a + background[1] * (1 - a));
        buf[at + 2] = Math.round(data[i + 2] * a + background[2] * (1 - a));
      }
      at += 3;
    }
    st.samples.push(buf.subarray(0, at));
  }

  /** 溜めた学習用の画素を 1 本に繋ぐ（1 枚だけなら写しを作らない） */
  function joinSamples() {
    return st.samples.length === 1 ? st.samples[0] : concatBytes(st.samples);
  }

  /** 学習していないパレットを作る（本番の学習には触らない） */
  function learnMapper() {
    return createPaletteMapper(medianCut(joinSamples(), colors, { stride: 3, step: 1 }));
  }

  /** 積み先（下書き用に «捨てる» 物を作れるようにしてある） */
  function newSink() { return { frames: [], prev: null, skipped: 0, written: 0 }; }

  /** 溜めた画素からグローバルパレットを決め、待っていたフレームを書く */
  function learnAndFlush() {
    if (!st.mapper) {
      st.mapper = learnMapper();
      st.samples = [];
    }
    const wait = st.pending;
    st.pending = [];
    for (const f of wait) encodeOne(f.data, f.delayMs);
  }

  /**
   * 1 枚を «添字 → 差分矩形 → LZW» に落として sink に積む。
   * sink と mapper を引数で取るのは bytes() が「本番を汚さない下書き」を
   * 組めるようにするため（下の bytes() の注意書きを見ること）。
   */
  function encodeInto(sink, mapper, data, delayMs) {
    const idx = quantizeFrame(data, width, height, mapper, { dither, background });
    let rect = diffRect(sink.prev, idx, width, height);
    if (!rect) {
      // 前と同じ絵。フレームを増やさず前の表示時間を延ばす（一番小さくなる）
      if (sink.frames.length) {
        sink.frames[sink.frames.length - 1].delayMs += delayMs;
        sink.skipped++;
        sink.prev = idx;
        return;
      }
      rect = { x: 0, y: 0, w: width, h: height };   // 1 枚目は必ず書く
    }
    const min = paletteBits(mapper.palette.length);
    const body = concatBytes([
      imageDescriptorBytes({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }),
      lzwBlocks(cropIndices(idx, width, rect), min),
    ]);
    sink.frames.push({ delayMs, body });
    sink.written += body.length;
    sink.prev = idx;
  }

  function encodeOne(data, delayMs) { encodeInto(st, st.mapper, data, delayMs); }

  /**
   * 1 枚足す。
   * @param {{width?:number,height?:number,data:ArrayLike<number>}|ArrayLike<number>} image
   * @param {{delayMs?:number}} [frameOpts]
   */
  function addFrame(image, frameOpts) {
    assertOpen("addFrame");
    const data = readFrame(image, width, height);
    const delayMs = clamp(finite(frameOpts && frameOpts.delayMs, defaultDelayMs), 0, 655350);
    st.addedMs += delayMs;
    if (st.mapper) { encodeOne(data, delayMs); return; }
    // まだ学習中。写しを取って溜める（呼び出し側が canvas を使い回しても平気に）
    const copy = new Uint8Array(width * height * 4);
    copy.set(data.subarray ? data.subarray(0, copy.length) : Array.prototype.slice.call(data, 0, copy.length));
    collect(copy);
    st.pending.push({ data: copy, delayMs });
    if (st.pending.length >= learnFrames) learnAndFlush();
  }

  /** 1 本のバイト列を組む（下書きにも finalize にも使う） */
  function assemble(frames, palette) {
    const pal = palette && palette.length ? palette : [[0, 0, 0], [255, 255, 255]];
    const parts = [gifHeaderBytes({ width, height, palette: pal })];
    parts.push(netscapeLoopExtBytes(loop));
    // 遅延は 1/100 秒しか書けないので、累積時刻の引き算で丸め誤差を送る
    let accMs = 0, accCs = 0;
    for (const f of frames) {
      accMs += f.delayMs;
      const cs = clampInt(Math.round(accMs / 10) - accCs, 0, 65535);
      accCs += cs;
      parts.push(graphicControlExtBytes({ delayCs: cs, disposal: 1 }), f.body);
    }
    parts.push(new Uint8Array([GIF_TRAILER]));
    return concatBytes(parts);
  }

  function finalizeBytes() {
    if (st.phase === "disposed") throw new Error("finalizeBytes: この GIF エンコーダは dispose 済みです");
    if (st.phase !== "finalized") {
      if (st.pending.length) learnAndFlush();
      if (!st.frames.length) throw new Error("finalizeBytes: GIF に 1 枚も入っていません（addFrame を先に呼んでください）");
      st.file = assemble(st.frames, st.mapper ? st.mapper.palette : null);
      st.phase = "finalized";
      st.pending = [];
      st.prev = null;
    }
    return st.file;
  }

  function finalize() {
    const b = finalizeBytes();
    if (typeof Blob !== "function") throw new Error("finalize: この環境に Blob が無いので finalizeBytes() を使ってください");
    return new Blob([b], { type: mime });
  }

  /**
   * 途中でも «見られる GIF» を返す（末尾の 0x3B まで付く）。
   * ★ ここで learnAndFlush() を呼んではいけない。呼ぶと «下書きを覗いた» だけで
   *   グローバルパレットが確定してしまい、まだ来ていないフレームの色が
   *   全部潰れる（冒頭が単色の動画では下書きを 1 回見ただけで真っ黒な GIF に
   *   なる）。下書きは **捨てる写し** として組み、本番の学習には触らない。
   */
  function bytes() {
    if (st.phase === "disposed") throw new Error("bytes: この GIF エンコーダは dispose 済みです");
    if (st.phase === "finalized") return st.file || new Uint8Array(0);
    if (!st.pending.length) return assemble(st.frames, st.mapper ? st.mapper.palette : null);
    const mapper = st.mapper || learnMapper();       // st.mapper には代入しない
    const draft = newSink();
    for (const f of st.pending) encodeInto(draft, mapper, f.data, f.delayMs);
    return assemble(st.frames.concat(draft.frames), mapper.palette);
  }

  function dispose() {
    st.phase = "disposed";
    st.frames = []; st.pending = []; st.samples = [];
    st.prev = null; st.file = null; st.mapper = null;
  }

  return {
    addFrame, finalize, finalizeBytes, bytes, dispose,
    /** 学習済みのパレット（まだ学習前は null） */
    palette() { return st.mapper ? st.mapper.palette.map((c) => c.slice()) : null; },
    state() { return st.phase; },
    stats() {
      return {
        phase: st.phase, width, height, fps,
        frames: st.frames.length, skipped: st.skipped,
        pending: st.pending.length,
        colors: st.mapper ? st.mapper.palette.length : 0,
        durationMs: Math.round(st.addedMs), bytesWritten: st.written,
      };
    },
    mime,
  };
}

/* ── 7. exportGif（exporter.js からの入口）─────────────────────── */

function pickFn(mod, names) {
  if (!mod) return null;
  for (const n of names) if (typeof mod[n] === "function") return mod[n];
  return null;
}

/** 借りられる物は借りる（プレビューの compositor を使い回す。契約書 §12-1） */
async function makeRig(project, width, height, o) {
  const doc = globalThis.document;
  let canvas = o.canvas || null;
  if (!canvas) {
    if (doc && typeof doc.createElement === "function") canvas = doc.createElement("canvas");
    else if (typeof globalThis.OffscreenCanvas === "function") canvas = new globalThis.OffscreenCanvas(width, height);
    else throw new Error("GIF: 描画先の canvas を用意できません（この環境では書き出せません）");
  }
  try { canvas.width = width; canvas.height = height; } catch (e) { L.warn("canvas の大きさを変えられません", e); }

  let compositor = o.compositor || null, ownComp = false;
  if (!compositor) {
    const mod = await import("../engine/compositor.js");
    const make = pickFn(mod, ["createCompositor", "default"]);
    if (!make) throw new Error("GIF: createCompositor が見つかりません");
    compositor = make(canvas, { preferGL: true });
    ownComp = true;
  }
  try { if (typeof compositor.resize === "function") compositor.resize(width, height); }
  catch (e) { L.warn("compositor.resize に失敗", e); }

  let sources = o.sources || null, ownSrc = false;
  if (!sources) {
    const mod = await import("../engine/sources.js");
    const make = pickFn(mod, ["createSourcePool", "default"]);
    if (!make) throw new Error("GIF: createSourcePool が見つかりません");
    sources = make({ storage: o.storage || null, project });
    ownSrc = true;
  } else if (typeof sources.setProject === "function") {
    try { sources.setProject(project); } catch (e) { L.warn("sources.setProject に失敗", e); }
  }

  return {
    canvas, compositor, sources,
    dispose() {
      if (ownSrc && typeof sources.dispose === "function") { try { sources.dispose(); } catch (_e) { /* 後片付けで落ちない */ } }
      if (ownComp && typeof compositor.dispose === "function") { try { compositor.dispose(); } catch (_e) { /* 同上 */ } }
    },
  };
}

/** canvas から ImageData を取る（compositor.grabPixels が在ればそちら） */
function grabPixels(rig, width, height) {
  if (typeof rig.compositor.grabPixels === "function") {
    const img = rig.compositor.grabPixels();
    if (img && img.data) return img;
  }
  const ctx = rig.canvas.getContext ? rig.canvas.getContext("2d") : null;
  if (ctx && typeof ctx.getImageData === "function") return ctx.getImageData(0, 0, width, height);
  throw new Error("GIF: 画素を読み出せません（compositor.grabPixels も getImageData も在りません）");
}

/**
 * プロジェクトの一部を GIF にする（exporter.js の container:"gif" の実体）。
 * 進捗・中止は exporter と同じ作法（onProgress(p, info) / signal）。
 * @param {any} project
 * @param {{width?:number, height?:number, fps?:number, frames?:number,
 *          range?:{start:number,end:number}, loop?:number, dither?:boolean,
 *          quality?:number, colors?:number, background?:string|number[]|Object,
 *          onProgress?:Function, signal?:any,
 *          canvas?:any, compositor?:any, sources?:any, storage?:any}} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportGif(project, opts) {
  const o = opts || {};
  const width = clampInt(finite(o.width, 480), 1, 4096);
  const height = clampInt(finite(o.height, 270), 1, 4096);
  const fps = clamp(finite(o.fps, 12), 1, 50);
  const start = Math.max(0, finite(o.range && o.range.start, 0));
  const end = Math.max(start, finite(o.range && o.range.end, start + 3));
  const frames = clampInt(finite(o.frames, Math.round((end - start) * fps)) || 1, 1, 100000);
  const signal = o.signal || null;
  const onProgress = typeof o.onProgress === "function" ? o.onProgress : null;
  const aborted = () => {
    if (signal && signal.aborted) {
      const e = new Error("書き出しを中止しました");
      e.name = "AbortError";
      throw e;
    }
  };

  aborted();
  // core/eval.js は «この時刻に見えるクリップ» を教えてくれる（無くても描ける）
  let ev = null;
  try { ev = await import("../core/eval.js"); } catch (_e) { ev = null; }
  const rig = await makeRig(project, width, height, o);
  const enc = createGIFEncoder({
    width, height, fps, loop: o.loop, dither: o.dither !== false,
    quality: o.quality, colors: o.colors, background: o.background,
  });
  try {
    for (let i = 0; i < frames; i++) {
      aborted();
      const t = start + i / fps;
      const s = rig.sources;
      if (s && typeof s.prepare === "function") {
        try { await s.prepare(t, { lookahead: 0, mode: "export" }); }
        catch (e) { L.warn("prepare に失敗（続けます）", e); }
      }
      if (s && typeof s.seekExact === "function" && ev && typeof ev.clipsAt === "function") {
        try {
          for (const r of ev.clipsAt(project, t) || []) {
            if (r && r.clip && (r.clip.kind === "video" || r.clip.kind === "compound")) await s.seekExact(r);
          }
        } catch (e) { L.warn("seekExact に失敗（前の絵で続けます）", e); }
      }
      await rig.compositor.renderFrame(project, t, { sources: s, quality: 1, overlays: false, forExport: true });
      enc.addFrame(grabPixels(rig, width, height), { delayMs: 1000 / fps });
      if (onProgress) {
        try { onProgress((i + 1) / frames, { frame: i + 1, frames, stage: "encode", time: t }); }
        catch (e) { L.warn("onProgress が投げました", e); }
      }
    }
    return enc.finalize();
  } finally {
    enc.dispose();
    rig.dispose();
  }
}

export default createGIFEncoder;
