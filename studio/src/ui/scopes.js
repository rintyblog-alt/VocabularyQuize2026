/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/scopes.js — 波形・ヒストグラム・ベクトルスコープ（映像の計測器）

   ★ 何をする所か
     プレビューの今の 1 枚（`compositor.grabPixels()` の ImageData）を読んで、
     DaVinci Resolve のカラーページ下段に相当する計測器を **自前で canvas に描く**所。
       ・ヒストグラム（RGB 重ね / 輝度）
       ・波形（輝度 or RGB パレード）
       ・ベクトルスコープ（色相と彩度の散らばり）
       ・白飛び・黒潰れの警告（割合の表示＋ゼブラの斜線）

   ★ なぜこの形か
     ・**計算と描画を分けた**。`histogram` / `waveformRows` / `vectorPoints` /
       `clipStats` / `downsample` は DOM も canvas も触らない純関数で、
       `{width,height,data}` の形（ImageData でも手作りの object でも）を受ける。
       こうしておくと Node で試験できる（studio/tests/scopes.test.mjs）。
     ・**毎フレームは描かない**。1920×1080 の ImageData を 60 回/秒 読むと
       プレビューが落ちるので 6fps に間引き、さらに **幅 256 まで間引いて**
       数える（stride で飛ばすので、元の 200 万画素を全部触らない）。
     ・見えていない間は数えない（`visibilitychange` と `offsetParent`）。
       タブが寝ている時に grabPixels を呼ぶと iOS で固まる事がある。
     ・色は `styles/tokens.css` の CSS 変数を第一に、無ければ既定の色で描く
       （CSS 担当がまだ書いていない間も真っ黒にならないこと）。

   ★ 触るときの注意
     ・`compositor.grabPixels()` は **合成後**（= 色補正の後）の画素。
       「補正前」を見たいときは色を無効化してから呼ぶ（色パネル側の仕事）。
     ・canvas の高さは CSS（`.vqs-scope__canvas`）で決めてほしい。
       まだ高さが無い（0 の）ときだけ inline で 168px を入れて自立する。
     ・触り所は 44px 以上（種類の切り替えボタン）。`touch-action` は CSS 側で。

   CONTRACT-NOTE: 契約書は `createScopes({ compositor, els })` だけを定めている。
     `els.scopes`（無ければ `els.scopeHost`）が在ればそこへ自分を入れる。
     無ければ `el` を返すだけなので、呼び出し側が好きな所へ append できる。
     `store` と `widgets` は任意（在れば「比率」表示や toast に使う）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch, cssVar } from "../core/util.js";
import { warn } from "../core/log.js";

/* ══ 0. 定数 ══════════════════════════════════════════════════════ */

/** Rec.709 の輝度係数（波形・ヒストグラムの「輝度」はこれ） */
export const LUMA_709 = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });

/** 計算に使う幅（これ以上は間引く）。256 は「1 列 = 1 画素」で波形が素直に出る幅 */
export const CALC_WIDTH = 256;
/** 描き直す間隔（ms）。6fps */
export const TICK_MS = 166;
/** 白飛び・黒潰れと見なす境目（8bit） */
export const CLIP_HIGH = 250;
export const CLIP_LOW = 5;
/** これを超えたら警告を出す（画素の割合） */
export const CLIP_WARN_RATIO = 0.002;

/** 出せる種類（UI の並び順） */
export const SCOPE_KINDS = Object.freeze([
  { id: "hist", label: "ヒスト RGB", hint: "ヒストグラム（R/G/B 重ね）" },
  { id: "histLuma", label: "ヒスト 輝度", hint: "ヒストグラム（輝度）" },
  { id: "wave", label: "波形", hint: "波形（輝度）" },
  { id: "parade", label: "パレード", hint: "波形（RGB パレード）" },
  { id: "vector", label: "ベクトル", hint: "ベクトルスコープ" }
]);

/** 知らない名前で呼ばれても近い物へ寄せる（呼び出し側に分岐を書かせない） */
const KIND_ALIAS = Object.freeze({
  histogram: "hist", rgb: "hist", histrgb: "hist",
  luma: "histLuma", histluma: "histLuma", brightness: "histLuma",
  waveform: "wave", waveluma: "wave",
  rgbparade: "parade", waverGB: "parade", waverbg: "parade",
  vectorscope: "vector", vec: "vector"
});

/** @returns {string} SCOPE_KINDS の id */
export function normalizeKind(kind) {
  const s = String(kind == null ? "" : kind);
  if (SCOPE_KINDS.some((k) => k.id === s)) return s;
  const a = KIND_ALIAS[s.toLowerCase()];
  return a || "hist";
}

/* ══ 1. 純粋な計算（DOM を触らない・Node で試験できる）═══════════ */

/** 8bit の RGB から Rec.709 輝度（0..255） */
export function lumaOf(r, g, b) {
  return LUMA_709.r * r + LUMA_709.g * g + LUMA_709.b * b;
}

/** ImageData でも手作りの object でも受ける（試験しやすさのため） */
function readImage(img) {
  const w = Math.max(0, Math.floor(finite(img && img.width, 0)));
  const h = Math.max(0, Math.floor(finite(img && img.height, 0)));
  const data = img && img.data;
  if (!w || !h || !data || typeof data.length !== "number" || data.length < w * h * 4) return null;
  return { width: w, height: h, data };
}

/**
 * 幅 targetW まで間引く（最近傍）。**元の画素を全部は触らない**のが肝。
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} [targetW=256]
 * @returns {{width:number,height:number,data:Uint8ClampedArray}|null}
 */
export function downsample(img, targetW) {
  const src = readImage(img);
  if (!src) return null;
  const tw = Math.max(1, Math.floor(finite(targetW, CALC_WIDTH)));
  if (src.width <= tw) return { width: src.width, height: src.height, data: src.data };
  const sw = tw;
  const sh = Math.max(1, Math.round((src.height * sw) / src.width));
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / sh));
    const rowIn = sy * src.width * 4;
    const rowOut = y * sw * 4;
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / sw));
      const i = rowIn + sx * 4;
      const o = rowOut + x * 4;
      out[o] = src.data[i];
      out[o + 1] = src.data[i + 1];
      out[o + 2] = src.data[i + 2];
      out[o + 3] = src.data[i + 3];
    }
  }
  return { width: sw, height: sh, data: out };
}

/**
 * ヒストグラム（R/G/B と輝度）。
 * @param {Object} img ImageData 相当
 * @param {{bins?:number, targetW?:number}} [o]
 * @returns {{bins:number,r:Uint32Array,g:Uint32Array,b:Uint32Array,luma:Uint32Array,
 *            max:number,maxLuma:number,total:number}|null}
 */
export function histogram(img, o) {
  const opt = o || {};
  const small = downsample(img, opt.targetW);
  if (!small) return null;
  const bins = clamp(Math.floor(finite(opt.bins, 256)), 2, 256);
  const r = new Uint32Array(bins);
  const g = new Uint32Array(bins);
  const b = new Uint32Array(bins);
  const luma = new Uint32Array(bins);
  const d = small.data;
  const n = small.width * small.height;
  const k = (bins - 1) / 255;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const R = d[i];
    const G = d[i + 1];
    const B = d[i + 2];
    r[Math.round(R * k)]++;
    g[Math.round(G * k)]++;
    b[Math.round(B * k)]++;
    luma[Math.round(lumaOf(R, G, B) * k)]++;
  }
  let max = 0;
  let maxLuma = 0;
  for (let i = 0; i < bins; i++) {
    if (r[i] > max) max = r[i];
    if (g[i] > max) max = g[i];
    if (b[i] > max) max = b[i];
    if (luma[i] > maxLuma) maxLuma = luma[i];
  }
  return { bins, r, g, b, luma, max, maxLuma, total: n };
}

/**
 * 波形（縦が明るさ・横が画面の横位置）。
 * 返す配列は `cols * rows` の度数（[col * rows + row]、row 0 が **暗い**側）。
 * @param {Object} img
 * @param {{cols?:number, rows?:number, channels?:"luma"|"rgb"}} [o]
 * @returns {{cols:number,rows:number,channels:string,total:number,max:number,
 *            luma:Uint32Array|null,r:Uint32Array|null,g:Uint32Array|null,b:Uint32Array|null}|null}
 */
export function waveformRows(img, o) {
  const opt = o || {};
  /* 下限を 2 まで許すのは試験（小さな絵）のため。画面からは 48 以上で呼ぶ */
  const cols = clamp(Math.floor(finite(opt.cols, CALC_WIDTH)), 2, 1024);
  const rows = clamp(Math.floor(finite(opt.rows, 128)), 2, 512);
  const small = downsample(img, cols);
  if (!small) return null;
  const rgb = String(opt.channels || "luma") === "rgb";
  const size = cols * rows;
  const luma = rgb ? null : new Uint32Array(size);
  const r = rgb ? new Uint32Array(size) : null;
  const g = rgb ? new Uint32Array(size) : null;
  const b = rgb ? new Uint32Array(size) : null;
  const d = small.data;
  const kr = (rows - 1) / 255;
  let max = 0;
  const bump = (arr, col, v) => {
    const row = Math.round(v * kr);
    const at = col * rows + row;
    const n = ++arr[at];
    if (n > max) max = n;
  };
  for (let y = 0; y < small.height; y++) {
    const base = y * small.width * 4;
    for (let x = 0; x < small.width; x++) {
      /* 間引いた幅と cols がずれても（元が 256 未満のとき）列に収める */
      const col = small.width === cols ? x : Math.min(cols - 1, Math.floor((x * cols) / small.width));
      const i = base + x * 4;
      const R = d[i];
      const G = d[i + 1];
      const B = d[i + 2];
      if (rgb) { bump(r, col, R); bump(g, col, G); bump(b, col, B); }
      else bump(luma, col, lumaOf(R, G, B));
    }
  }
  return { cols, rows, channels: rgb ? "rgb" : "luma", total: small.width * small.height, max, luma, r, g, b };
}

/* ベクトルスコープの色差（Rec.709 の Cb/Cr を -0.5..0.5 で持つ） */
const CB = Object.freeze({ r: -0.1146, g: -0.3854, b: 0.5 });
const CR = Object.freeze({ r: 0.5, g: -0.4542, b: -0.0458 });

/** 8bit RGB → {u,v}（-0.5..0.5 くらい。原点が無彩色） */
export function toChroma(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  return { u: CB.r * R + CB.g * G + CB.b * B, v: CR.r * R + CR.g * G + CR.b * B };
}

/** 目安の的（R / Yl / G / Cy / B / Mg の 75% 彩度位置）。描画と試験で使う */
export const VECTOR_TARGETS = Object.freeze([
  { name: "R", rgb: [191, 0, 0] }, { name: "Yl", rgb: [191, 191, 0] },
  { name: "G", rgb: [0, 191, 0] }, { name: "Cy", rgb: [0, 191, 191] },
  { name: "B", rgb: [0, 0, 191] }, { name: "Mg", rgb: [191, 0, 191] }
].map((t) => {
  const c = toChroma(t.rgb[0], t.rgb[1], t.rgb[2]);
  return Object.freeze({ name: t.name, u: c.u, v: c.v, rgb: Object.freeze(t.rgb) });
}));

/** 肌色の目安線（この向きに人の肌が乗る）。角度（ラジアン・u軸から反時計） */
export const SKIN_ANGLE = (() => {
  const c = toChroma(232, 168, 136);
  return Math.atan2(c.v, c.u);
})();

/**
 * ベクトルスコープ。`size × size` の度数の盤（中心が無彩色）を返す。
 * 名前は契約どおり `vectorPoints` だが、点の羅列ではなく **密度の盤**を返す
 * （36000 点の配列を毎回作るより軽く、描くのも数えるのも素直）。
 * @param {Object} img
 * @param {{size?:number, targetW?:number, gain?:number}} [o]
 * @returns {{size:number,grid:Uint32Array,max:number,total:number,gain:number}|null}
 */
export function vectorPoints(img, o) {
  const opt = o || {};
  const small = downsample(img, opt.targetW);
  if (!small) return null;
  const size = clamp(Math.floor(finite(opt.size, 192)), 16, 512);
  /* gain=1 で「彩度 ±0.5（= 100% の色）」が縁に来る */
  const gain = clamp(finite(opt.gain, 1), 0.1, 8);
  const grid = new Uint32Array(size * size);
  const d = small.data;
  const n = small.width * small.height;
  const half = (size - 1) / 2;
  let max = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const c = toChroma(d[i], d[i + 1], d[i + 2]);
    const x = Math.round(half + c.u * gain * 2 * half);
    const y = Math.round(half - c.v * gain * 2 * half);   // 上が +Cr（赤側）
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const at = y * size + x;
    const v = ++grid[at];
    if (v > max) max = v;
  }
  return { size, grid, max, total: n, gain };
}

/**
 * 白飛び・黒潰れの割合（ゼブラの警告に使う）。
 * どれか 1 つの色が上限（下限）に張り付いた画素を数える。
 * @param {Object} img
 * @param {{high?:number, low?:number, targetW?:number}} [o]
 * @returns {{total:number,high:number,low:number,highPct:number,lowPct:number}|null}
 */
export function clipStats(img, o) {
  const opt = o || {};
  const small = downsample(img, opt.targetW);
  if (!small) return null;
  const hi = clamp(finite(opt.high, CLIP_HIGH), 1, 255);
  const lo = clamp(finite(opt.low, CLIP_LOW), 0, 254);
  const d = small.data;
  const n = small.width * small.height;
  let high = 0;
  let low = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const R = d[i];
    const G = d[i + 1];
    const B = d[i + 2];
    if (R >= hi || G >= hi || B >= hi) high++;
    if (R <= lo && G <= lo && B <= lo) low++;
  }
  const total = Math.max(1, n);
  return { total: n, high, low, highPct: high / total, lowPct: low / total };
}

/* ══ 2. 描く（canvas。ここから DOM を触る）════════════════════════ */

const DPR_MAX = 2;
/** CSS がまだ無いときに自立するための高さ */
const FALLBACK_H = 168;

const el = (tag, cls, text) => {
  const n = document.createElement(tag || "div");
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};

/** 色を CSS 変数から（無ければ既定） */
const C = {
  bg: () => cssVar("--vqs-scope-bg", "rgba(8,10,14,.92)"),
  grid: () => cssVar("--vqs-scope-grid", "rgba(233,238,245,.14)"),
  ink: () => cssVar("--vqs-scope-ink", "rgba(233,238,245,.62)"),
  r: () => cssVar("--vqs-scope-r", "rgba(255,86,86,.85)"),
  g: () => cssVar("--vqs-scope-g", "rgba(86,255,140,.85)"),
  b: () => cssVar("--vqs-scope-b", "rgba(96,150,255,.9)"),
  luma: () => cssVar("--vqs-scope-luma", "rgba(226,238,255,.9)"),
  warn: () => cssVar("--vqs-warn", "#ffb020"),
  bad: () => cssVar("--vqs-danger", "#ff4d4f")
};

/** ゼブラ（斜線）の塗りを作る。作れない環境では単色で代替 */
function zebraFill(ctx, color) {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d");
    if (!g) return color;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-2, 10);
    g.lineTo(10, -2);
    g.moveTo(2, 14);
    g.lineTo(14, 2);
    g.stroke();
    const pat = ctx.createPattern(c, "repeat");
    return pat || color;
  } catch (e) { return color; }
}

/** 目盛り（0 / 25 / 50 / 75 / 100 IRE 相当）を引く */
function drawGrid(ctx, w, h, opts) {
  const o = opts || {};
  ctx.save();
  ctx.strokeStyle = C.grid();
  ctx.lineWidth = 1;
  ctx.fillStyle = C.ink();
  ctx.font = "9px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(h - (i / 4) * h) + 0.5;
    ctx.globalAlpha = i === 0 || i === 4 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (o.labels !== false) {
      ctx.globalAlpha = 0.8;
      ctx.fillText(String(i * 25), 2, clamp(y, 6, h - 6));
    }
  }
  ctx.restore();
}

/** ヒストグラムを描く */
function paintHistogram(ctx, w, h, hist, lumaOnly) {
  const bins = hist.bins;
  const bw = w / bins;
  drawGrid(ctx, w, h, { labels: false });
  const draw = (arr, color, max) => {
    const top = Math.max(1, max);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < bins; i++) {
      /* 上位が飛び抜けるので √ で圧縮する（プロ機と同じ見え方） */
      const v = Math.sqrt(arr[i] / top);
      const y = h - v * (h - 2);
      ctx.lineTo(i * bw, y);
      ctx.lineTo((i + 1) * bw, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  if (lumaOnly) {
    ctx.globalAlpha = 0.9;
    draw(hist.luma, C.luma(), hist.maxLuma);
  } else {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.72;
    draw(hist.r, C.r(), hist.max);
    draw(hist.g, C.g(), hist.max);
    draw(hist.b, C.b(), hist.max);
  }
  ctx.restore();
}

/** 波形・パレードを 1 枚の ImageData に焼いて拡大して貼る（点を 1 個ずつ描くと遅い） */
function paintWaveform(ctx, w, h, wf, zebra) {
  const cols = wf.cols;
  const rows = wf.rows;
  const panes = wf.channels === "rgb" ? 3 : 1;
  const off = document.createElement("canvas");
  off.width = cols * panes;
  off.height = rows;
  const og = off.getContext("2d");
  if (!og) return;
  const img = og.createImageData(off.width, rows);
  const px = img.data;
  const top = Math.max(1, wf.max);
  const put = (arr, pane, tint) => {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const n = arr[c * rows + r];
        if (!n) continue;
        /* 度数は √ で圧縮（1 画素しか無い所も見えるように） */
        const a = clamp(Math.sqrt(n / top) * 1.35, 0.06, 1);
        const x = pane * cols + c;
        const y = rows - 1 - r;                    // 上が明るい側
        const o = (y * off.width + x) * 4;
        px[o] = tint[0];
        px[o + 1] = tint[1];
        px[o + 2] = tint[2];
        px[o + 3] = Math.round(a * 255);
      }
    }
  };
  if (panes === 3) {
    put(wf.r, 0, [255, 90, 90]);
    put(wf.g, 1, [90, 235, 130]);
    put(wf.b, 2, [110, 160, 255]);
  } else {
    put(wf.luma, 0, [226, 238, 255]);
  }
  og.putImageData(img, 0, 0);

  drawGrid(ctx, w, h, { labels: true });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, off.width, rows, 0, 0, w, h);
  ctx.restore();

  if (panes === 3) {
    ctx.save();
    ctx.strokeStyle = C.grid();
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = Math.round((w * i) / 3) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (zebra) paintZebra(ctx, w, h, zebra);
}

/** 白飛び・黒潰れの帯（ゼブラ） */
function paintZebra(ctx, w, h, z) {
  const band = Math.max(4, Math.round(h * 0.045));
  ctx.save();
  if (z.high) {
    ctx.fillStyle = zebraFill(ctx, C.bad());
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, w, band);
  }
  if (z.low) {
    ctx.fillStyle = zebraFill(ctx, C.b());
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, h - band, w, band);
  }
  ctx.restore();
}

/** ベクトルスコープ */
function paintVector(ctx, w, h, vs) {
  const size = vs.size;
  const R = Math.min(w, h) / 2 - 8;
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  /* 円と十字 */
  ctx.strokeStyle = C.grid();
  ctx.lineWidth = 1;
  for (const k of [1, 0.75, 0.5, 0.25]) {
    ctx.globalAlpha = k === 1 ? 1 : 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();
  /* 肌色の目安線 */
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = C.warn();
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(SKIN_ANGLE) * R, cy - Math.sin(SKIN_ANGLE) * R);
  ctx.stroke();
  ctx.setLineDash([]);
  /* 的（R/Yl/G/Cy/B/Mg） */
  ctx.globalAlpha = 0.9;
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of VECTOR_TARGETS) {
    const x = cx + t.u * 2 * R * vs.gain;
    const y = cy - t.v * 2 * R * vs.gain;
    ctx.strokeStyle = C.ink();
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = C.ink();
    ctx.fillText(t.name, x, y - 11);
  }
  ctx.restore();

  /* 密度の盤を ImageData に焼いて貼る（色は位置＝色相そのもの） */
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const og = off.getContext("2d");
  if (!og) return;
  const img = og.createImageData(size, size);
  const px = img.data;
  const top = Math.max(1, vs.max);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = vs.grid[y * size + x];
      if (!n) continue;
      const a = clamp(Math.sqrt(n / top) * 1.4, 0.08, 1);
      /* 位置から色相を作る（見た目がベクトルスコープらしくなる） */
      const u = (x - half) / half;
      const v = -(y - half) / half;
      const ang = Math.atan2(v, u);
      const sat = clamp(Math.hypot(u, v), 0, 1);
      const rgb = hueRgb(ang, 0.35 + 0.65 * sat);
      const o = (y * size + x) * 4;
      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
      px[o + 3] = Math.round(a * 255);
    }
  }
  og.putImageData(img, 0, 0);
  ctx.save();
  ctx.drawImage(off, 0, 0, size, size, cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
}

/** 角度（u,v の向き）→ 見た目の色。ベクトルスコープの盤の着色に使う */
function hueRgb(ang, k) {
  /* Cr（上）が赤、-Cr が水色。色相環を u,v の向きに合わせて回す */
  const deg = ((ang * 180) / Math.PI + 360) % 360;
  const hue = (450 - deg) % 360;                 // 上（90°）を赤（0°）に
  const c = clamp(k, 0, 1);
  const f = (n) => {
    const kk = (n + hue / 60) % 6;
    return Math.round(255 * (1 - c * Math.max(0, Math.min(kk, 4 - kk, 1))));
  };
  return [f(5), f(3), f(1)];
}

/* ══ 3. 部品として組む ════════════════════════════════════════════ */

/**
 * 計測器の一式。
 * @param {{compositor?:Object, els?:Object, store?:Object, widgets?:Object,
 *          kind?:string, tickMs?:number}} o
 * @returns {{el:HTMLElement, setKind:Function, update:Function, dispose:Function,
 *            get kind:string, get running:boolean, setRunning:Function}}
 */
export function createScopes(o) {
  const opt = o || {};
  const compositor = opt.compositor || null;
  const els = opt.els || {};
  const tickMs = clamp(finite(opt.tickMs, TICK_MS), 60, 2000);
  const KEY = "vqstudio.scopes.kind";

  const root = el("div", "vqs-scope");
  root.setAttribute("data-test", "scopes");

  /* 種類の切り替え（44px 以上・横に流せる） */
  const kinds = el("div", "vqs-scope__kinds");
  kinds.setAttribute("role", "group");
  kinds.setAttribute("aria-label", "計測器の種類");
  kinds.style.display = "flex";
  kinds.style.overflowX = "auto";
  kinds.style.flexWrap = "nowrap";
  const kindBtns = new Map();
  for (const k of SCOPE_KINDS) {
    const b = el("button", "vqs-scope__kind", k.label);
    b.type = "button";
    b.title = k.hint;
    b.setAttribute("data-value", k.id);
    b.setAttribute("data-test", "scope-kind-" + k.id);
    if (isTouch()) { b.style.minHeight = "44px"; b.style.minWidth = "44px"; }
    b.addEventListener("click", () => setKind(k.id));
    kindBtns.set(k.id, b);
    kinds.append(b);
  }
  const pause = el("button", "vqs-scope__pause", "止める");
  pause.type = "button";
  pause.title = "計測を止める（電池と熱の節約）";
  pause.setAttribute("data-test", "scope-pause");
  if (isTouch()) { pause.style.minHeight = "44px"; pause.style.minWidth = "44px"; }
  pause.addEventListener("click", () => setRunning(!state.running));
  kinds.append(pause);

  const canvas = el("canvas", "vqs-scope__canvas");
  canvas.setAttribute("data-test", "scope-canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";

  const chips = el("div", "vqs-scope__warn");
  chips.setAttribute("data-test", "scope-warn");
  const chipHigh = el("span", "vqs-scope__chip vqs-scope__chip--high", "白飛び —");
  const chipLow = el("span", "vqs-scope__chip vqs-scope__chip--low", "黒潰れ —");
  const note = el("span", "vqs-scope__note", "");
  chips.append(chipHigh, chipLow, note);

  root.append(kinds, canvas, chips);
  const host = els.scopes || els.scopeHost || null;
  if (host && typeof host.append === "function") host.append(root);

  const state = {
    kind: normalizeKind(opt.kind || readKind()),
    running: true,
    dead: false,
    timer: 0,
    lastAt: 0,
    size: { w: 0, h: 0, dpr: 0 },
    failed: false,
    io: null
  };

  function readKind() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function writeKind(k) {
    try { localStorage.setItem(KEY, k); } catch (e) { /* 使えない環境は覚えないだけ */ }
  }

  function paintKinds() {
    for (const [id, b] of kindBtns) {
      const on = id === state.kind;
      b.classList.toggle("vqs-scope__kind--on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    pause.textContent = state.running ? "止める" : "動かす";
    pause.setAttribute("aria-pressed", state.running ? "false" : "true");
    root.classList.toggle("vqs-scope--paused", !state.running);
  }

  /** 今 描ける状態か（見えていない間は数えない） */
  function visible() {
    if (state.dead || !state.running) return false;
    try { if (document.visibilityState === "hidden") return false; } catch (e) { /* noop */ }
    if (!root.isConnected) return false;
    if (root.offsetParent === null && root.getClientRects().length === 0) return false;
    return true;
  }

  /** canvas の実寸を合わせる（CSS が高さを決めていなければ自前で持つ） */
  function fit() {
    const w = Math.max(32, Math.floor(root.clientWidth || canvas.clientWidth || 0));
    if (!w) return null;
    let h = Math.round(finite(canvas.clientHeight, 0));
    if (!h) {
      canvas.style.height = FALLBACK_H + "px";
      h = FALLBACK_H;
    }
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, DPR_MAX);
    if (state.size.w !== w || state.size.h !== h || state.size.dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      state.size = { w, h, dpr };
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /** 画素を貰う（無ければ穏やかに諦める） */
  function grab() {
    if (!compositor || typeof compositor.grabPixels !== "function") return null;
    try {
      const img = compositor.grabPixels();
      return readImage(img) ? img : null;
    } catch (e) {
      if (!state.failed) { state.failed = true; warn("scopes", "grabPixels が使えなかった", e); }
      return null;
    }
  }

  function setChip(node, label, pct, bad) {
    if (pct === null) { node.textContent = label + " —"; node.classList.remove("vqs-scope__chip--on"); return; }
    node.textContent = label + " " + (pct * 100).toFixed(pct > 0.1 ? 0 : 1) + "%";
    node.classList.toggle("vqs-scope__chip--on", !!bad);
  }

  /** 1 回描く（間引きは呼ぶ側） */
  function draw() {
    const box = fit();
    if (!box) return;
    const ctx = box.ctx;
    ctx.clearRect(0, 0, box.w, box.h);
    const bg = C.bg();
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, box.w, box.h); }

    const img = grab();
    if (!img) {
      ctx.save();
      ctx.fillStyle = C.ink();
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.failed ? "映像を読めませんでした" : "プレビューを再生すると出ます", box.w / 2, box.h / 2);
      ctx.restore();
      setChip(chipHigh, "白飛び", null);
      setChip(chipLow, "黒潰れ", null);
      return;
    }

    const cs = clipStats(img, { targetW: CALC_WIDTH });
    const z = cs ? { high: cs.highPct > CLIP_WARN_RATIO, low: cs.lowPct > CLIP_WARN_RATIO } : null;
    if (cs) {
      setChip(chipHigh, "白飛び", cs.highPct, z.high);
      setChip(chipLow, "黒潰れ", cs.lowPct, z.low);
    }

    try {
      if (state.kind === "hist" || state.kind === "histLuma") {
        const hist = histogram(img, { targetW: CALC_WIDTH });
        if (hist) paintHistogram(ctx, box.w, box.h, hist, state.kind === "histLuma");
        if (z) paintZebra(ctx, box.w, box.h, z);
      } else if (state.kind === "wave" || state.kind === "parade") {
        const rows = clamp(Math.round(box.h * state.size.dpr), 48, 256);
        const wf = waveformRows(img, { cols: CALC_WIDTH, rows, channels: state.kind === "parade" ? "rgb" : "luma" });
        if (wf) paintWaveform(ctx, box.w, box.h, wf, z);
      } else {
        const vs = vectorPoints(img, { targetW: CALC_WIDTH, size: clamp(Math.round(Math.min(box.w, box.h) * state.size.dpr), 64, 256) });
        if (vs) paintVector(ctx, box.w, box.h, vs);
      }
    } catch (e) {
      warn("scopes", "描けなかった", e);
    }
    note.textContent = "";
  }

  /** 間引いた描き直し（6fps） */
  function tick(force) {
    if (!visible() && !force) return;
    const now = Date.now();
    if (!force && now - state.lastAt < tickMs - 8) return;
    state.lastAt = now;
    draw();
  }

  function startTimer() {
    if (state.timer || state.dead) return;
    state.timer = setInterval(() => tick(false), tickMs);
  }
  function stopTimer() {
    if (!state.timer) return;
    clearInterval(state.timer);
    state.timer = 0;
  }

  const onVis = () => {
    if (state.dead) return;
    if (document.visibilityState === "hidden") stopTimer();
    else if (state.running) { startTimer(); tick(true); }
  };
  document.addEventListener("visibilitychange", onVis);

  /* 画面に入ったときだけ動かす（在る環境では） */
  if (typeof IntersectionObserver === "function") {
    try {
      state.io = new IntersectionObserver((list) => {
        const on = list.some((r) => r.isIntersecting);
        if (on && state.running) { startTimer(); tick(true); }
        else if (!on) stopTimer();
      });
      state.io.observe(root);
    } catch (e) { state.io = null; }
  }

  function setKind(kind) {
    const k = normalizeKind(kind);
    if (k === state.kind) return k;
    state.kind = k;
    writeKind(k);
    paintKinds();
    tick(true);
    return k;
  }
  function setRunning(on) {
    state.running = !!on;
    paintKinds();
    if (state.running) { startTimer(); tick(true); }
    else stopTimer();
    return state.running;
  }

  paintKinds();
  if (state.running) startTimer();
  /* 最初の 1 枚は「次の枠」で（append される前に描くと寸法が 0 になる） */
  const first = requestAnimationFrame(() => tick(true));

  return {
    el: root,
    setKind,
    setRunning,
    /** 外から「今の枠を見せて」と言われたとき（6fps に間引く） */
    update() { tick(false); },
    /** 今すぐ描き直す（比較ボタンのような、間引くと困る所から） */
    refresh() { tick(true); },
    get kind() { return state.kind; },
    get running() { return state.running; },
    dispose() {
      state.dead = true;
      stopTimer();
      cancelAnimationFrame(first);
      document.removeEventListener("visibilitychange", onVis);
      if (state.io) { try { state.io.disconnect(); } catch (e) { /* noop */ } state.io = null; }
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
