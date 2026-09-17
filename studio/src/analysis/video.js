/* ══════════════════════════════════════════════════════════════════════
   analysis/video.js — 映像から「自動編集が使える特徴」を取り出す所

   ★ 何をする所か / なぜこの形か
     素材の <video>（や画像）を小さな gray/RGB のフレーム列へ落とし（sampleFrames）、
     ショット境界・動き・ピント・明るさ・彩度・手ぶれ・顔・最良区間 を出す。出た物は
     契約書 §1 の `asset.analysis` にそのまま入る形。ブラウザ API（video/canvas）が
     要るのは sampleFrames と detectFaces だけで、判定の中身は全て pure 関数
     （frames を受けて数を返す）に切り出した。そうしないと Node の試験で 1 行も
     確かめられず、静かに壊れたまま AI 自動編集が狂う。フレームは 64px 級まで縮めて
     から見る（欲しいのは「どこで切れたか」「動いているか」で細部ではない）。rgb は
     RGBA ではなく 3 バイト詰め（64x36 でも 4 バイト持つと 100 フレームで約 1MB 増え、
     モバイルでは効く）。ショット境界は 1 つの指標で必ず誤る（フラッシュ・パン・
     フェード）ので 8x8x8 ヒストグラム交差 + 輝度差 + エッジ密度差の重み付き和にする。

   ★ 触るときの注意
     ・pure 関数に DOM を持ち込まない（試験が死ぬ）。curve は 0..1 に正規化し NaN を
       外へ出さない（真っ黒・1 フレームでも 0）。NaN は transform や書き出しフレーム数
       まで伝染して原因が分からなくなる。
     ・CONTRACT-NOTE: §6 の detectScenes は `(videoEl, opts)` だが、試験できる形にする
       ため frames でも videoEl でも受ける（videoEl のときだけ Promise。`await
       detectScenes(x, o)` ならどちらも同じ）。detectFaces も seek が要るので Promise。
     ・CONTRACT-NOTE: Frame に w/h を足した（契約書は t/gray/rgb だけ）。エッジ密度・
       ラプラシアン・移動量は 2 次元の並びが要る。無ければ正方形と見なして推す。
     ・CONTRACT-NOTE: curve の返り値は §1 の形（`{hz, values}`）。詰め替え無しで
       index.js が analysis へ入れられるようにした。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, clamp01, finite } from "../core/util.js";

/** @typedef {{t:number, gray:Uint8Array, rgb:Uint8Array, w?:number, h?:number}} Frame */
/** @typedef {{hz:number, values:number[]}} Curve */
/** @typedef {{start:number, end:number, score:number}} Shot */
/* ── 0. 形をそろえる小道具（すべて pure） ──────────────────── */

/** ショット判定の重み（合計で割るので比だけが意味を持つ） */
export const SCENE_WEIGHTS = { hist: 0.55, luma: 0.30, edge: 0.15 };

/** 0..∞ を 0..1 へ寄せる飽和曲線（k が「0.5 になる点」）。負/NaN は 0 */
export function soften(x, k = 0.1) {
  const v = finite(x, 0);
  return v <= 0 ? 0 : v / (v + (finite(k, 0.1) || 0.1));
}

/** 中止用の例外（DOMException が無い環境でも name だけは揃える） */
export function abortError(msg = "解析を中止した") { const e = new Error(msg); e.name = "AbortError"; return e; }
/** signal が立っていたら投げる（握りつぶさず呼び出し側に返す） */
export function throwIfAborted(signal) { if (signal && signal.aborted) throw abortError(); }

/** frame の縦横。w/h が無ければ gray の長さから正方形と見なして推す */
export function frameDims(frame) {
  const n = frame && frame.gray ? frame.gray.length : 0;
  if (!n) return { w: 0, h: 0 };
  const w = Number.isFinite(frame.w) && frame.w > 0 ? Math.round(frame.w) : 0,
    h = Number.isFinite(frame.h) && frame.h > 0 ? Math.round(frame.h) : 0;
  if (w && h && w * h <= n) return { w, h };  // 素直に信じる道
  if (w) return { w, h: Math.max(1, Math.floor(n / w)) };
  const side = Math.max(1, Math.round(Math.sqrt(n)));
  return { w: side, h: Math.max(1, Math.floor(n / side)) };
}

/** フレーム間隔（秒）の代表値。中央値を採る（seek のぶれに強い）。既定 0.25 */
export function frameInterval(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return 0.25;
  const d = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = finite(frames[i].t, 0) - finite(frames[i - 1].t, 0);
    if (dt > 1e-6) d.push(dt);
  }
  if (!d.length) return 0.25;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

/** frames のサンプリング周波数（curve.hz に入れる値） */
export function curveHz(frames) { const dt = frameInterval(frames); return dt > 0 ? 1 / dt : 0; }

/** curve を作る（値は必ず有限・0..1。NaN を外へ出さないための関所） */
export function makeCurve(values, hz) {
  const f = finite(hz, 0), vs = Array.isArray(values) ? values.map((v) => clamp01(finite(v, 0))) : [];
  return { hz: vs.length && f > 0 ? f : 0, values: vs }; // 空なら hz も 0（curveDuration と揃える）
}

/** 8x8x8 の RGB ヒストグラム（合計 1 に正規化。rgb は 3 バイト詰め） */
export function histogramRGB(rgb, bins = 8) {
  const b = Math.round(clamp(finite(bins, 8), 2, 16));
  const out = new Float32Array(b * b * b);
  const n = rgb && rgb.length >= 3 ? Math.floor(rgb.length / 3) : 0;
  if (!n) return out;
  for (let i = 0, o = 0; i < n; i++, o += 3) out[(((rgb[o] * b) >> 8) * b + ((rgb[o + 1] * b) >> 8)) * b + ((rgb[o + 2] * b) >> 8)] += 1;
  for (let k = 0; k < out.length; k++) out[k] /= n;
  return out;
}

/** ヒストグラム交差（1 = 同じ / 0 = 全く別）。長さ違いは短い方まで */
export function histIntersection(a, b) {
  if (!a || !b || !a.length || !b.length) return 1;
  let s = 0;
  for (let i = 0, n = Math.min(a.length, b.length); i < n; i++) s += Math.min(a[i], b[i]);
  return clamp01(s);
}

/** エッジ密度 0..1（勾配の大きさが thr を超えた画素の割合。Sobel まで要らない） */
export function edgeDensity(gray, w, h, thr = 28) {
  if (!gray || !(w > 1) || !(h > 1)) return 0;
  const t = Math.max(1, finite(thr, 28));
  let hit = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++, n++) {
      if (Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]) > t) hit++;
    }
  }
  return n ? hit / n : 0;
}

/** ラプラシアンの分散（ピントの目安。ぼけると小さくなる） */
export function laplacianVar(gray, w, h) {
  if (!gray || !(w > 2) || !(h > 2)) return 0;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++, n++) {
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += v; sum2 += v * v;
    }
  }
  return n ? Math.max(0, sum2 / n - (sum / n) * (sum / n)) : 0;
}

/** 平均輝度 0..255 */
export function meanU8(a) {
  if (!a || !a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/** 画素ごとの差の平均 0..255（長さ違いは短い方まで） */
export function meanAbsDiffU8(a, b) {
  if (!a || !b || !a.length || !b.length) return 0;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}

/** 平均彩度 0..1（HSV の S。真っ黒は 0） */
export function satMeanRGB(rgb) {
  const n = rgb && rgb.length >= 3 ? Math.floor(rgb.length / 3) : 0;
  if (!n) return 0;
  let s = 0;
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mx > 0) s += (mx - (r < g ? (r < b ? r : b) : (g < b ? g : b))) / mx;
  }
  return clamp01(s / n);
}

/**
 * ショット判定に使う特徴（毎フレーム作り直すと倍遅い）。明るさ・彩度・ピントは各
 * curve が直に計算するのでここでは作らない（作ると detectScenes が laplacianVar を
 * 全フレームぶん余分に回す）。rgb 無しの Frame は hist を **null** にする（零
 * ヒストグラム同士の交差は 0 = 別の絵と読まれ、全フレームが境界になってしまう）。
 */
export function frameFeatures(frame) {
  const { w, h } = frameDims(frame);
  const rgb = frame && frame.rgb ? frame.rgb : null;
  return { w, h, hist: rgb && rgb.length >= 3 ? histogramRGB(rgb) : null,
           edge: edgeDensity(frame && frame.gray, w, h) };
}
/* ── 1. フレームを取る（DOM を触るのはこの節だけ） ───────────── */

const raf = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== "function") throw new Error("canvas が無い環境では映像を解析できない");
  const c = doc.createElement("canvas"); c.width = w; c.height = h; return c;
}

/**
 * CanvasImageSource（video/image/bitmap/canvas）を 1 フレームへ落とす。
 * canvas を渡すと作り直さない（sampleFrames が使い回す）。
 * @param {*} source @param {{size?:number,t?:number,width?:number,height?:number,canvas?:*}} [opts]
 * @returns {Frame}
 */
export function frameFromSource(source, opts = {}) {
  const size = Math.max(8, Math.round(finite(opts.size, 64)));
  const sw = finite(opts.width, 0) || finite(source && (source.videoWidth || source.naturalWidth || source.width), 0);
  const sh = finite(opts.height, 0) || finite(source && (source.videoHeight || source.naturalHeight || source.height), 0);
  if (!(sw > 0) || !(sh > 0)) throw new Error("映像の大きさが取れない（まだ読み込めていない）");
  const w = size, h = Math.max(4, Math.round((size * sh) / sw));
  const ctx = (opts.canvas || makeCanvas(w, h)).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d コンテキストが取れない");
  ctx.drawImage(source, 0, 0, w, h);
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch (e) { throw new Error(`画素を読めない（別オリジンの素材かもしれない）: ${(e && e.message) || e}`); }
  const n = w * h, gray = new Uint8Array(n), rgb = new Uint8Array(n * 3);
  for (let i = 0, o = 0, q = 0; i < n; i++, o += 4, q += 3) {
    const r = data[o], g = data[o + 1], b = data[o + 2];
    rgb[q] = r; rgb[q + 1] = g; rgb[q + 2] = b;
    gray[i] = (r * 77 + g * 150 + b * 29) >> 8;   // BT.601 の整数近似
  }
  return { t: finite(opts.t, 0), w, h, gray, rgb };
}

/** 購読をまとめて張り、まとめて外す小道具（外し忘れると消えた素材を触って落ちる） */
function bind(target, map) {
  const keys = Object.keys(map);
  if (target) for (const k of keys) target.addEventListener(k, map[k]);
  return () => { if (target) for (const k of keys) target.removeEventListener(k, map[k]); };
}

/** メタデータ待ち（尺と大きさが分かるまで） */
function waitMetadata(videoEl, signal) {
  if (finite(videoEl.readyState, 0) >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const end = (err) => { clearTimeout(timer); offEl(); offSig(); if (err) reject(err); else resolve(); };
    const offEl = bind(videoEl, { loadedmetadata: () => end(), error: () => end(new Error("素材を読み込めない（形式が非対応か壊れている）")) });
    const offSig = bind(signal, { abort: () => end(abortError()) });
    const timer = setTimeout(() => end(new Error("素材の読み込みが 15 秒で終わらない")), 15000);
    if (signal && signal.aborted) end(abortError());
  });
}

/**
 * 1 フレーム分の seek（契約書 §13.3 の手順をここ 1 箇所へ集める）。
 * 待ち切れないときは今出ている絵で進む（解析は 1 枚外しても死なない）。
 */
export function seekFrame(videoEl, t, opts = {}) {
  const timeout = Math.max(120, finite(opts.timeout, 1200)), signal = opts.signal || null;
  // 既にその位置に居るとき（detectFaces が同じ時刻をもう一度見る）は seeked が来ない
  if (Math.abs(finite(videoEl.currentTime, -1) - t) < 1e-4 && finite(videoEl.readyState, 0) >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true; clearTimeout(timer); offEl(); offSig(); if (err) reject(err); else resolve();
    };
    const onSeeked = () => {   // seeked の直後はまだ前のフレームが出ている事がある（§13.3）
      if (typeof videoEl.requestVideoFrameCallback === "function") {
        try { videoEl.requestVideoFrameCallback(() => finish()); return; } catch (_e) { /* 下の rAF へ */ }
      }
      raf(() => raf(() => finish()));
    };
    const offEl = bind(videoEl, { seeked: onSeeked, error: () => finish(new Error("seek に失敗した（素材が壊れている）")) });
    const offSig = bind(signal, { abort: () => finish(abortError()) });
    const timer = setTimeout(() => finish(), timeout);
    if (signal && signal.aborted) { finish(abortError()); return; }
    try { videoEl.currentTime = t; }
    catch (e) { finish(new Error(`currentTime を動かせない: ${(e && e.message) || e}`)); }
  });
}

/**
 * 等間隔にフレームを取る。
 * @param {HTMLVideoElement} videoEl
 * @param {{hz?:number,size?:number,signal?:*,onProgress?:Function,timeout?:number}} [opts]
 * @returns {Promise<Frame[]>}
 */
export async function sampleFrames(videoEl, opts = {}) {
  const o = opts || {};
  if (!videoEl) throw new Error("sampleFrames: videoEl が無い");
  throwIfAborted(o.signal);
  await waitMetadata(videoEl, o.signal);
  const dur = finite(videoEl.duration, 0);
  if (!(dur > 0)) throw new Error("素材の尺が分からない（duration が無い）");
  const vw = finite(videoEl.videoWidth, 0), vh = finite(videoEl.videoHeight, 0);
  if (!(vw > 0) || !(vh > 0)) throw new Error("映像の大きさが取れない（音だけの素材かもしれない）");
  const hz = clamp(finite(o.hz, 4), 0.2, 30);
  const w = Math.max(8, Math.round(finite(o.size, 64))), h = Math.max(4, Math.round((w * vh) / vw));
  // 枚数は「枚数」と「総バイト」の両方で抑える（1 枚 = gray 1B + rgb 3B。size を
  // 上げると二乗で効く）。上限に当たったら **間隔を広げる**: step を 1/hz に固定すると
  // 長い素材は先頭 count/hz 秒で枚数が尽き、その先を一切見ないまま終わる
  const budget = Math.max(8, Math.floor((64 * 1024 * 1024) / Math.max(1, w * h * 4)));
  const count = Math.round(clamp(Math.floor(dur * hz), 1, Math.min(2000, budget)));
  const step = dur / count;
  const canvas = makeCanvas(w, h);
  try { videoEl.pause(); } catch (_e) { /* 止められなくても seek は効く */ }
  const frames = [];
  for (let i = 0; i < count; i++) {
    throwIfAborted(o.signal);
    // +0.5 の中心寄せは外へ漏らさない（§13.3）。記録するのは実際の currentTime。
    const want = Math.min(Math.max(0, dur - 1e-3), (i + 0.5) * step);
    await seekFrame(videoEl, want, { signal: o.signal, timeout: o.timeout });
    frames.push(frameFromSource(videoEl, { size: w, t: finite(videoEl.currentTime, want), canvas }));
    // 進捗で落ちない（呼ぶ側の描画が投げても解析は続ける）
    if (typeof o.onProgress === "function") try { o.onProgress((i + 1) / count, { stage: "frames", index: i, count }); } catch (_e) { /* 無視 */ }
  }
  return frames;
}
/* ── 2. ショット境界（pure） ──────────────────────────────── */

function diffFeatures(a, b, fa, fb, weights) {
  const W = weights || SCENE_WEIGHTS;
  const hasHist = !!(fa.hist && fb.hist);   // 片方でも色が無ければ重みごと落とす
  const hist = hasHist ? clamp01(1 - histIntersection(fa.hist, fb.hist)) : 0;
  const luma = clamp01(meanAbsDiffU8(a.gray, b.gray) / 255);
  const edge = clamp01(Math.abs(fa.edge - fb.edge));
  const wh = hasHist ? finite(W.hist, 0) : 0, wl = finite(W.luma, 0), we = finite(W.edge, 0);
  const sum = wh + wl + we || 1;
  return { score: clamp01((hist * wh + luma * wl + edge * we) / sum), hist, luma, edge };
}

/** 2 枚の差 0..1（内訳も返す。説明と試験のため） */
export function sceneDiff(prev, cur, weights = SCENE_WEIGHTS) {
  if (!prev || !cur || !prev.gray || !cur.gray) return { score: 0, hist: 0, luma: 0, edge: 0 };
  return diffFeatures(prev, cur, frameFeatures(prev), frameFeatures(cur), weights);
}

/** 隣り合うフレームの差の列（長さ = frames.length - 1） */
export function sceneDiffs(frames, weights = SCENE_WEIGHTS) {
  if (!Array.isArray(frames) || frames.length < 2) return [];
  const out = [];
  let fa = frameFeatures(frames[0]);
  for (let i = 1, fb = null; i < frames.length; i++) {
    fb = frameFeatures(frames[i]);
    out.push(diffFeatures(frames[i - 1], frames[i], fa, fb, weights).score); fa = fb;
  }
  return out;
}

/**
 * 差の列から境界を拾う（フェードの扱いの中心・pure）。warm（threshold の 45%）以上が
 * 続く塊の中で、**threshold を超える連なりごとに 1 本**出す（1 枚なら "cut"、複数枚に
 * 渡れば "fade"）。強い所が無い塊は合計が fadeSum を超えた時だけ 1 本のフェード。
 * 塊ごとに重心 1 本だと、パンや手持ちで warm が続く素材で本物のカットが数秒ずれ、
 * 2 回目以降のカットが消える（だから強い所だけ別に拾う）。
 * @returns {{index:number,score:number,kind:"cut"|"fade"}[]} index は「index と index+1 の間」
 */
export function boundariesFromDiffs(diffs, opts = {}) {
  const threshold = clamp(finite(opts.threshold, 0.28), 0.02, 1);
  const warm = threshold * clamp(finite(opts.warmRatio, 0.45), 0.05, 1);
  const fadeSum = Math.max(threshold, finite(opts.fadeSum, threshold * 1.5));
  const d = Array.isArray(diffs) ? diffs.map((v) => clamp01(finite(v, 0))) : [];
  const out = [];
  /** [from,to] の重心（差で重み付け）。全部 0 なら真ん中 */
  const centerOf = (from, to) => {
    let sum = 0, wsum = 0;
    for (let k = from; k <= to; k++) { sum += d[k]; wsum += d[k] * k; }
    return sum > 0 ? Math.round(clamp(wsum / sum, from, to)) : Math.round((from + to) / 2);
  };
  let i = 0;
  while (i < d.length) {
    if (d[i] < warm) { i++; continue; }
    let j = i, peak = 0, sum = 0, strong = 0;
    while (j < d.length && d[j] >= warm) { sum += d[j]; if (d[j] > peak) peak = d[j]; j++; }
    for (let k = i; k < j; k++) {          // 強い変化は連なりごとに 1 本ずつ
      if (d[k] < threshold) continue;
      let e = k, sub = d[k], mx = d[k];
      while (e + 1 < j && d[e + 1] >= threshold) { e++; sub += d[e]; if (d[e] > mx) mx = d[e]; }
      out.push({ index: centerOf(k, e), score: clamp01(Math.max(mx, Math.min(1, sub))), kind: e > k ? "fade" : "cut" });
      strong++; k = e;
    }
    // 弱い変化しか無い塊（本当のフェード・ディゾルブ）は合計で判断して 1 本
    if (!strong && j - i > 1 && sum >= fadeSum) out.push({ index: centerOf(i, j - 1), score: clamp01(Math.max(peak, Math.min(1, sum))), kind: "fade" });
    i = j;
  }
  return out;
}

/** minShot 未満のショットを隣（境界の弱い側）へ併合する（pure） */
export function mergeShortShots(shots, minShot = 0.6) {
  const out = (Array.isArray(shots) ? shots : []).map((s) => ({
    start: finite(s && s.start, 0), end: finite(s && s.end, 0), score: clamp01(finite(s && s.score, 0)) }));
  const m = Math.max(0, finite(minShot, 0.6));
  if (m <= 0 || out.length < 2) return out;
  let guard = 0;
  while (out.length > 1 && guard++ < 4000) {
    let k = -1, dmin = Infinity;
    for (let i = 0, d = 0; i < out.length; i++) {
      d = out[i].end - out[i].start;
      if (d < m && d < dmin) { dmin = d; k = i; }
    }
    if (k < 0) break;
    const prev = k > 0 ? out[k - 1] : null, next = k < out.length - 1 ? out[k + 1] : null;
    if (prev && (!next || out[k].score <= next.score)) { prev.end = out[k].end; out.splice(k, 1); }
    else if (next) { next.start = out[k].start; next.score = out[k].score; out.splice(k, 1); }
    else break;
  }
  return out;
}

/**
 * ショット境界を出す。frames（pure）でも videoEl（Promise）でも受ける。
 * score は「そのショットを始めた境界の強さ」（先頭は 0）。
 * @returns {Shot[]|Promise<Shot[]>}
 */
export function detectScenes(framesOrVideo, opts = {}) {
  if (!Array.isArray(framesOrVideo)) { // CONTRACT-NOTE: §6 の (videoEl, {hz,threshold,onProgress}) 形
    return sampleFrames(framesOrVideo, { hz: finite(opts.hz, 4), size: finite(opts.size, 64),
      timeout: opts.timeout, signal: opts.signal, onProgress: opts.onProgress })
      .then((fs) => detectScenes(fs, opts));
  }
  const frames = framesOrVideo;
  if (!frames.length) return [];
  const dt = frameInterval(frames), t0 = finite(frames[0].t, 0);
  const tEnd = Math.max(t0 + dt, finite(frames[frames.length - 1].t, t0) + dt);
  if (frames.length === 1) return [{ start: t0, end: tEnd, score: 0 }];
  const shots = [];
  let start = t0, score = 0;
  for (const b of boundariesFromDiffs(sceneDiffs(frames, opts.weights), opts)) {
    const t = finite(frames[Math.min(frames.length - 1, b.index + 1)].t, start);
    if (t <= start + 1e-6 || t >= tEnd) continue;
    shots.push({ start, end: t, score });
    start = t; score = b.score;
  }
  shots.push({ start, end: tEnd, score });
  return mergeShortShots(shots, finite(opts.minShot, 0.6));
}
/* ── 3. 各種 curve と手ぶれ（すべて pure・0..1） ─────────────── */

/** 動きの強さ。画素差の平均を飽和曲線で 0..1 に（k=0.08 → 8% 差で 0.5） */
export function motionCurve(frames, opts = {}) {
  const hz = curveHz(frames), k = finite(opts.k, 0.08), vs = [0];   // 0 番は下で 1 番に上書きする
  if (!Array.isArray(frames) || !frames.length) return makeCurve([], hz);
  for (let i = 1; i < frames.length; i++) vs.push(soften(meanAbsDiffU8(frames[i - 1].gray, frames[i].gray) / 255, k));
  if (vs.length > 1) vs[0] = vs[1]; // 先頭を 0 にすると「頭は必ず静止」と誤解される
  return makeCurve(vs, hz);
}

/** ピント。ラプラシアン分散の飽和（k=500 → 自然画の「普通」で 0.5 前後） */
export function sharpnessCurve(frames, opts = {}) {
  const k = finite(opts.k, 500);
  return makeCurve((Array.isArray(frames) ? frames : []).map((f) => {
    const { w, h } = frameDims(f); return soften(laplacianVar(f && f.gray, w, h), k);
  }), curveHz(frames));
}

/** 明るさ 0..1（平均輝度 / 255） */
export function brightnessCurve(frames) {
  return makeCurve((Array.isArray(frames) ? frames : []).map((f) => meanU8(f && f.gray) / 255), curveHz(frames));
}

/** 彩度 0..1（HSV の S の平均） */
export function saturationCurve(frames) {
  return makeCurve((Array.isArray(frames) ? frames : []).map((f) => satMeanRGB(f && f.rgb)), curveHz(frames));
}

/** フレーム間の並行移動を推す（SAD の局所探索）。cur(y+dy,x+dx) ≈ prev(y,x) の (dx,dy) */
export function estimateShift(prevGray, curGray, w, h, radius = 3, stride = 1) {
  if (!prevGray || !curGray || !(w > 0) || !(h > 0)) return { dx: 0, dy: 0, sad: 0 };
  const R = Math.round(clamp(finite(radius, 3), 0, 16)), st = Math.max(1, Math.round(finite(stride, 1)));
  let best = { dx: 0, dy: 0, sad: Infinity };
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let sum = 0, n = 0;
      for (let y = Math.max(0, -dy), y1 = Math.min(h, h - dy), x1 = Math.min(w, w - dx), r0 = 0, r1 = 0; y < y1; y += st) {
        r0 = y * w; r1 = (y + dy) * w;
        for (let x = Math.max(0, -dx); x < x1; x += st) { sum += Math.abs(prevGray[r0 + x] - curGray[r1 + x + dx]); n++; }
      }
      if (!n) continue;
      const sad = sum / n + (Math.abs(dx) + Math.abs(dy)) * 0.15; // 同点なら動かない方を選ぶ
      if (sad < best.sad) best = { dx, dy, sad };
    }
  }
  return Number.isFinite(best.sad) ? best : { dx: 0, dy: 0, sad: 0 };
}

/**
 * 手ぶれの強さ 0..1（pure・スカラー）。移動量の 2 階差分を見るので、
 * 滑らかなパンは 0 に近く、往復する揺れだけが大きくなる。
 */
export function shakeScore(frames, opts = {}) {
  if (!Array.isArray(frames) || frames.length < 3) return 0;
  const { w, h } = frameDims(frames[0]);
  const R = Math.max(1, Math.round(finite(opts.radius, 3))), sh = [];
  const st = Math.max(1, Math.round(Math.sqrt((w * h) / 4096))); // 大きい絵は間引く
  for (let i = 1; i < frames.length; i++) sh.push(estimateShift(frames[i - 1].gray, frames[i].gray, w, h, R, st));
  let acc = 0, n = 0;
  for (let i = 1; i < sh.length; i++, n++) acc += Math.hypot(sh[i].dx - sh[i - 1].dx, sh[i].dy - sh[i - 1].dy);
  return n ? clamp01(soften(acc / n / R, finite(opts.k, 0.6))) : 0;
}
/* ── 4. 顔（FaceDetector が在れば使う。無ければ null） ────────── */

/**
 * 顔を探す。肌色ヒューリスティクスは誤爆が多いので入れない（契約どおり）。
 * @returns {Promise<{t:number,boxes:number[][]}[]|null>} boxes は 0..1 の [x,y,w,h]
 */
export async function detectFaces(videoEl, times, opts = {}) {
  const FD = globalThis.FaceDetector;
  if (typeof FD !== "function" || !videoEl) return null;
  let det;   // API が在っても作れない環境がある
  try { det = new FD({ maxDetectedFaces: Math.round(clamp(finite(opts.maxFaces, 8), 1, 32)), fastMode: true }); } catch (_e) { return null; }
  const vw = finite(videoEl.videoWidth, 0) || 1, vh = finite(videoEl.videoHeight, 0) || 1;
  const out = [];
  for (const t of (Array.isArray(times) ? times : []).map((v) => finite(v, 0))) {
    throwIfAborted(opts.signal);
    try {
      await seekFrame(videoEl, t, { signal: opts.signal, timeout: opts.timeout });
      const boxes = [];
      for (const f of (await det.detect(videoEl)) || []) {
        const b = f && f.boundingBox;
        if (b) boxes.push([clamp01(b.x / vw), clamp01(b.y / vh), clamp01(b.width / vw), clamp01(b.height / vh)]);
      }
      out.push({ t: finite(videoEl.currentTime, t), boxes });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      return out.length ? out : null; // 途中で使えなくなったら分かる範囲だけ返す
    }
  }
  return out;
}
/* ── 5. 最良区間（pure） ───────────────────────────────── */

/** 区間の点の重み（罰則も正の値で書き、score から引く） */
export const RANGE_WEIGHTS = { motion: 0.22, sharp: 0.30, expo: 0.16, sat: 0.06, face: 0.18, cut: 0.28, shake: 0.16 };

/** curve から t の値を線形補間で読む（無ければ fallback） */
export function sampleCurve(curve, t, fallback = null) {
  const vs = curve && Array.isArray(curve.values) ? curve.values : null;
  if (!vs || !vs.length) return fallback;
  const hz = finite(curve.hz, 0);
  if (!(hz > 0)) return finite(vs[0], 0);
  const x = clamp(finite(t, 0) * hz, 0, vs.length - 1), i = Math.floor(x);
  const a = finite(vs[i], 0), b = finite(vs[Math.min(vs.length - 1, i + 1)], a);
  return a + (b - a) * (x - i);
}

/** curve の [a,b] の平均（無ければ fallback） */
export function meanCurve(curve, a, b, fallback = null) {
  const vs = curve && Array.isArray(curve.values) ? curve.values : null;
  if (!vs || !vs.length) return fallback;
  const hz = finite(curve.hz, 0) > 0 ? finite(curve.hz, 0) : 1;
  const lo = Math.min(finite(a, 0), finite(b, 0)), hi = Math.max(finite(a, 0), finite(b, 0));
  const steps = Math.round(clamp((hi - lo) * hz, 1, 512));
  let sum = 0, n = 0;
  for (let i = 0, v = null; i <= steps; i++) {
    v = sampleCurve(curve, lo + ((hi - lo) * i) / steps, null);
    if (v !== null) { sum += v; n++; }
  }
  return n ? sum / n : fallback;
}

/** curve が覆う秒数 */
export function curveDuration(curve) {
  const vs = curve && Array.isArray(curve.values) ? curve.values : null;
  if (!vs || !vs.length) return 0;
  return finite(curve.hz, 0) > 0 ? vs.length / finite(curve.hz, 0) : 0;
}

/** analysis から素材の尺を推す（duration / scenes / curve の最大） */
export function analysisDuration(analysis) {
  const A = analysis && typeof analysis === "object" ? analysis : {}, scenes = Array.isArray(A.scenes) ? A.scenes : [];
  return Math.max(finite(A.duration, 0), scenes.length ? finite(scenes[scenes.length - 1].end, 0) : 0,
    curveDuration(A.motion), curveDuration(A.sharp), curveDuration(A.bright), curveDuration(A.sat));
}

/** ショットの切れ目の時刻（先頭は境界ではないので外す） */
export function sceneBoundaries(analysis) {
  const scenes = analysis && Array.isArray(analysis.scenes) ? analysis.scenes : [];
  return scenes.slice(1).map((sc) => finite(sc.start, 0));
}

/** 区間に入った顔サンプルのうち顔が写っていた割合（faces が無ければ null） */
export function faceRatio(faces, a, b) {
  if (!Array.isArray(faces) || !faces.length) return null;
  let n = 0, hit = 0;
  for (const f of faces) {
    const t = finite(f && f.t, NaN);
    if (!Number.isFinite(t) || t < a - 1e-9 || t > b + 1e-9) continue;
    n++;
    if (f.boxes && f.boxes.length) hit++;
  }
  return n ? hit / n : 0;
}

function shakeOf(A, lo, hi) {
  if (typeof A.shake === "number") return clamp01(finite(A.shake, 0));
  if (A.shake && Array.isArray(A.shake.values)) return meanCurve(A.shake, lo, hi, null);
  return null;
}

/** 動きは「そこそこ多い」が最良。多すぎる（画面が壊れている）ものは落とす */
function motionTerm(m) {
  const v = clamp01(m);
  return v <= 0.6 ? v / 0.6 : clamp01(1 - (v - 0.6) * 0.8);
}

function buildWhy(lo, hi, plus, notes) {
  const good = plus.length ? plus.slice(0, 3).join("・") : "目立った特徴は無いが無難";
  return `${lo.toFixed(1)}〜${hi.toFixed(1)}s: ${good}${notes.length ? `（${notes.slice(0, 2).join("・")}）` : ""}`;
}

/**
 * 区間 [a,b] の点数（pure）。使える指標だけで平均し、罰則を引く。
 * @returns {{score:number, why:string, terms:Object}}
 */
export function scoreRange(analysis, a, b, opts = {}) {
  const W = Object.assign({}, RANGE_WEIGHTS, opts.weights || null);
  const A = analysis && typeof analysis === "object" ? analysis : {};
  const lo = Math.min(finite(a, 0), finite(b, 0)), hi = Math.max(finite(a, 0), finite(b, 0));
  const terms = {}, plus = [], notes = [];
  let acc = 0, wsum = 0;
  const add = (key, value, label) => {
    if (value === null || value === undefined) return;
    const v = clamp01(value), w = finite(W[key], 0);
    terms[key] = v; acc += v * w; wsum += w;
    if (v >= 0.6 && label) plus.push(label);          // 「なぜ」に出す褒め言葉
  };
  const mot = meanCurve(A.motion, lo, hi, null);
  add("motion", mot === null ? null : motionTerm(mot), "動きがある");
  add("sharp", meanCurve(A.sharp, lo, hi, null), "ピントが良い");
  const br = meanCurve(A.bright, lo, hi, null);
  add("expo", br === null ? null : 1 - Math.abs(br - 0.5) * 2, "明るさがちょうど良い");
  const sat = meanCurve(A.sat, lo, hi, null);
  add("sat", sat === null ? null : clamp01(sat / 0.6), "色が乗っている");
  add("face", faceRatio(A.faces, lo, hi), "顔が映っている");
  let score = wsum > 0 ? acc / wsum : 0;
  const bounds = sceneBoundaries(A);
  const cuts = bounds.filter((t) => t > lo + 0.08 && t < hi - 0.08).length;
  if (cuts > 0) { score -= finite(W.cut, 0) * Math.min(1, cuts); notes.push(`ショット境界を ${cuts} 回跨ぐ`); }
  else if (bounds.length) plus.push("ショット境界を跨がない");
  const shake = shakeOf(A, lo, hi);
  if (shake !== null && shake > 0.35) { score -= finite(W.shake, 0) * shake; notes.push("手ぶれが強い"); }
  if (br !== null && (br < 0.18 || br > 0.88)) notes.push(br < 0.18 ? "暗い" : "白飛びしている");
  return { score: clamp01(score), why: buildWhy(lo, hi, plus, notes), terms };
}

/**
 * 一番おいしい範囲を選ぶ（pure）。移動窓で scoreRange を最大化する。
 * @param {*} analysis @param {{want?:number, in?:number, out?:number, weights?:Object}} [opts]
 * @returns {{in:number,out:number,score:number,why:string}}
 */
export function pickBestRange(analysis, opts = {}) {
  const A = analysis && typeof analysis === "object" ? analysis : {};
  const lo0 = Math.max(0, finite(opts.in, 0));
  const hi0 = Number.isFinite(opts.out) && opts.out > lo0 ? opts.out : Math.max(lo0, analysisDuration(A));
  const span = hi0 - lo0;
  if (!(span > 0)) return { in: lo0, out: lo0, score: 0, why: "解析できる長さが無いので範囲を選べない" };
  const want = clamp(finite(opts.want, 3), 0.04, span);
  const hz = Math.max(finite(A.motion && A.motion.hz, 0), finite(A.sharp && A.sharp.hz, 0), 2);
  const step = Math.max(span / 240, 1 / hz);
  let best = null;
  for (let a = lo0, r = null; a <= hi0 - want + 1e-9; a += step) {
    r = scoreRange(A, a, a + want, opts);
    if (!best || r.score > best.score) best = { in: a, out: a + want, score: r.score, why: r.why };
  }
  if (!best) { const r = scoreRange(A, lo0, lo0 + want, opts); best = { in: lo0, out: lo0 + want, score: r.score, why: r.why }; }
  return { in: best.in, out: best.out, score: clamp01(best.score), why: best.why };
}

/**
 * 見せ場を複数拾う（契約書 §1 の highlights の形・pure）。
 * @returns {{start:number,end:number,score:number,why:string}[]}
 */
export function pickHighlights(analysis, opts = {}) {
  const A = analysis && typeof analysis === "object" ? analysis : {};
  const dur = analysisDuration(A);
  if (!(dur > 0)) return [];
  const count = Math.round(clamp(finite(opts.count, 5), 1, 40));
  const want = clamp(finite(opts.want, Math.min(3, dur)), 0.2, dur);
  const hz = Math.max(finite(A.motion && A.motion.hz, 0), finite(A.sharp && A.sharp.hz, 0), 2);
  const step = Math.max(dur / 160, 1 / hz);
  const cands = [];
  for (let a = 0, r = null; a + want <= dur + 1e-9; a += step) {
    r = scoreRange(A, a, a + want, opts); cands.push({ start: a, end: a + want, score: r.score, why: r.why });
  }
  cands.sort((x, y) => y.score - x.score);
  const gap = Math.max(0, finite(opts.minGap, want * 0.6)), out = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (!out.some((o) => c.start < o.end + gap && o.start < c.end + gap)) out.push(c);
  }
  out.sort((x, y) => x.start - y.start);
  return out;
}
/* ── 6. LLM へ渡す一言（pure） ──────────────────────────── */

/**
 * 「12 ショット / 動き強め / 明るい / 顔あり / 5.2s 付近が最良」の形に縮める。
 * LLM に素材の尺やフレームを書かせない（§6）ので、渡すのはこの要約だけ。
 */
export function summarizeForLLM(analysis, opts = {}) {
  const maxChars = Math.round(clamp(finite(opts.maxChars, 400), 40, 4000));
  const A = analysis && typeof analysis === "object" ? analysis : {};
  const dur = analysisDuration(A), parts = [];
  if (dur > 0) parts.push(`尺 ${dur.toFixed(1)}s`);
  parts.push(`${(Array.isArray(A.scenes) ? A.scenes : []).length} ショット`);
  // 値 → 日本語の一言（高い / 低い / 中くらい）。閾値は画面の文言と揃えてある
  const band = (curve, hi, hiTxt, lo, loTxt, midTxt) => {
    const v = meanCurve(curve, 0, dur, null);
    if (v !== null) parts.push(v > hi ? hiTxt : v < lo ? loTxt : midTxt);
  };
  band(A.motion, 0.6, "動き強め", 0.3, "動き少なめ", "動き普通");
  band(A.bright, 0.62, "明るい", 0.25, "暗い", "明るさ標準");
  band(A.sharp, 0.5, "ピント良好", 0.5, "ややぼけ", "ややぼけ");
  band(A.sat, 0.45, "色鮮やか", 0.45, "色控えめ", "色控えめ");
  if (Array.isArray(A.faces)) parts.push(A.faces.some((f) => f && f.boxes && f.boxes.length) ? "顔あり" : "顔なし");
  const shake = shakeOf(A, 0, dur);
  if (shake !== null && shake > 0.45) parts.push("手ぶれ強い");
  if (A.beats && Number.isFinite(A.beats.bpm)) parts.push(`BPM ${Math.round(A.beats.bpm)}`);
  if (Array.isArray(A.silence) && A.silence.length) parts.push(`無音 ${A.silence.length} 箇所`);
  const best = dur > 0 ? pickBestRange(A, { want: Math.min(3, dur) }) : null;
  if (best && best.out > best.in) parts.push(`${((best.in + best.out) / 2).toFixed(1)}s 付近が最良`);
  const s = parts.join(" / ");
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}
