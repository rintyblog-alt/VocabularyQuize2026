/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/audio/meter.js — 音量メーターと音の大きさの測り（契約書 §4）

   ★ 何をする所か
     ① `createMeter(ctx, node)` … 指す AudioNode の後ろに聴診器を当て、
        `read()` で「今の峰（peak）・実効値（rms）・振り切れ（clip）」を返す。
        ミキサー（ui/mixer.js）と インスペクタ（ui/inspector/audio.js）が
        rAF で 30fps ほどで読みに来る。**読む側は値を溜めない**ので、
        ピークホールドは向こう持ち、こちらは「今の値」だけを正直に返す。
     ② `loudnessFromBuffer(audioBuffer)` … 音の素材 1 本の体感音量を測る
        （LUFS 相当・純関数）。`normalizeGain()` と組で「音量をそろえる」に使う。
     ③ `normalizeGain(lufsApprox, targetLufs)` … 目標 LUFS へ寄せる倍率（純関数）。

   ★ なぜこの形か
     ・**AnalyserNode を 2 本**（ChannelSplitter で L/R に割って）当てる。
       1 本で済ませると「左だけ割れている」が見えない。卓のメーターは
       左右別が当たり前で、そこを省くと居るはずの事故が見えなくなる。
     ・`getFloatTimeDomainData` を使う（`getByteTimeDomainData` は 8bit =
       0.4% 刻みで、−60dB 付近が全部 0 になりメーターが死ぬ）。古い端末の
       ために byte 版へ落ちる道も残す。
     ・`smoothingTimeConstant = 0`。平滑は **見せ方の話**なので UI に任せる。
       ここで平滑すると「叩いた瞬間の峰」が消えて、割れを見落とす。
     ・**clip は 1.5 秒ホールドする**。1 フレームだけ赤くしても人の目には
       映らない。これはメーターの本質なのでここで持つ（ピークホールドとは別）。
     ・**呼ばれ方が 2 通り在る**（実物優先）。契約書は `createMeter(ctx, node)`
       だが、既に在る ui/mixer.js と ui/inspector/audio.js は
       `createMeter({ audio, ctx, target })` の **1 引数**で呼び、返り値の
       `read(trackId)` に id を渡してくる。両方受ける（→ CONTRACT-NOTE (1)）。
     ・LUFS は **ITU-R BS.1770 の K 重み付け（2 段の biquad）を本物の係数で**
       通し、400ms ブロック・ゲート（絶対 −70 LUFS / 相対 −10 LU）まで実装した。
       近似と名付けているのは「真のピーク（4 倍補間）」と「サラウンドの重み」を
       省いた所だけ。数 dB の話ではなく、ここが甘いと自動の音量そろえが
       素材ごとに 3〜6dB ばらける（= 一番耳に付く失敗）。
     ・モノラルの素材は **2ch に配られて鳴る**ものとして +3.01dB 足す。
       さもないと「声だけモノで録った素材」が BGM より 3dB 小さく揃う。

   ★ 触るときの注意
     ・`read()` は **毎フレーム呼ばれる**。中で確保するのは禁止（Float32Array は
       作った時に 1 本だけ持ち、使い回す）。
     ・`dispose()` は「自分が足した枝だけ」を切る。指された node は借り物なので
       `node.disconnect()` を丸ごと呼んではいけない（本線の音が消える）。
     ・純関数（§1）は DOM も AudioContext も触らない。試験がそこだけを見る
       （tests/audio-params.test.mjs）。AudioBuffer の代わりに
       `{sampleRate, length, numberOfChannels, getChannelData(i)}` を受ける。

   CONTRACT-NOTE (1): 契約書 §4 の `createMeter(ctx, node)` に加えて
     `createMeter({ audio, ctx, target })` も受ける（既存 UI の呼び方）。
     この形では `read(trackId|"master")` が AudioEngine の `meter()` へ流れる。
     どちらで呼んでも `read()` の返りは `{peak, rms, clip}` で、peak/rms は
     `[左, 右]`（ui/inspector/audio.js の normalizeMeterReading が受ける形）。
   CONTRACT-NOTE (2): `loudnessFromBuffer` の返す `peak`/`rms` は **倍率**
     （0..1 が普通）、`lufsApprox` は **dB**。単位が混ざるので
     `peakDb`/`rmsDb` も一緒に返す。呼ぶ側で 20*log10 を書かせない。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite } from "../../core/util.js";
import { scope } from "../../core/log.js";

const L = scope("meter");

/* ══ §0. dB と倍率 ═══════════════════════════════════════════════════ */

/** これより下は「無音」。−Infinity を外へ出さないための床 */
export const DB_FLOOR = -120;
/** 振り切れと見なす倍率（0dBFS。デジタルはここが天井） */
export const CLIP_AMP = 0.999;
/** 振り切れの表示を保つ長さ（ms）。1 フレームでは人の目に映らない */
export const CLIP_HOLD_MS = 1500;
/** 自動の音量そろえの既定の目標（ai/tools.js の AUTO_DEFAULTS と同じ値） */
export const TARGET_LUFS = -14;
/** これより静かな素材は「測れなかった」として触らない */
export const MEASURE_FLOOR_LUFS = -70;

/**
 * 倍率 → dBFS。0 以下は床（−120）に落ちる。
 * @param {number} a 倍率 @returns {number} dB
 */
export function dbFromAmp(a) {
  const v = finite(a, 0);
  if (!(v > 0)) return DB_FLOOR;
  return clamp(20 * Math.log10(v), DB_FLOOR, 60);
}

/**
 * dBFS → 倍率。床より下は 0。
 * @param {number} db @returns {number} 倍率
 */
export function ampFromDb(db) {
  const v = finite(db, DB_FLOOR);
  if (v <= DB_FLOOR) return 0;
  return Math.pow(10, v / 20);
}

/* ══ §1. 純関数（試験がここを見る）═══════════════════════════════════ */

/** 素の並びか（Float32Array / 配列）。AudioBuffer は getChannelData を持つので除く */
function isRaw(v) {
  return !!v && typeof v.getChannelData !== "function"
    && (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView)));
}

/**
 * AudioBuffer / 偽 AudioBuffer / 素の並び を 1 つの形にそろえる。
 * @param {*} buf AudioBuffer 相当 / Float32Array / `{mono, sampleRate}`
 * @param {{sampleRate?:number}} [opts] 素の並びを渡す時の標本周波数（既定 48000）
 * @returns {{chans:Float32Array[], sampleRate:number, length:number, duration:number}}
 */
export function readChannels(buf, opts) {
  const o = opts || {};
  const rate = finite(buf && buf.sampleRate, finite(o.sampleRate, 48000));
  const sampleRate = clamp(rate > 0 ? rate : 48000, 8000, 192000);
  const src = buf && !isRaw(buf) && isRaw(buf.mono) ? buf.mono : buf;
  if (!src) return { chans: [], sampleRate, length: 0, duration: 0 };
  if (isRaw(src)) {
    const out = new Float32Array(src.length);
    for (let i = 0; i < out.length; i++) { const v = src[i]; out[i] = Number.isFinite(v) ? v : 0; }
    return { chans: out.length ? [out] : [], sampleRate, length: out.length, duration: out.length / sampleRate };
  }
  if (typeof src.getChannelData !== "function") return { chans: [], sampleRate, length: 0, duration: 0 };
  const len = Math.max(0, Math.floor(finite(src.length, 0)));
  const n = clamp(Math.round(finite(src.numberOfChannels, 1)), 1, 32);
  const chans = [];
  for (let i = 0; i < n; i++) {
    let c = null;
    try { c = src.getChannelData(i); } catch (e) { c = null; }   // 欠けた channel は無い物として扱う
    if (c && c.length) chans.push(c);
  }
  const length = chans.length ? Math.min(len || chans[0].length, chans[0].length) : 0;
  return { chans, sampleRate, length, duration: length / sampleRate };
}

/**
 * ITU-R BS.1770 の K 重み付け（2 段 biquad）の係数。標本周波数ごとに解析的に出す
 * （48kHz の表を他の周波数に使い回すと 44.1kHz で 0.2dB ずれる）。
 * @param {number} sampleRate
 * @returns {{shelf:number[], hp:number[]}} それぞれ [b0,b1,b2,a1,a2]
 */
export function kWeightCoeffs(sampleRate) {
  const fs = clamp(finite(sampleRate, 48000), 8000, 192000);
  /* 1 段目: 高域を +4dB 持ち上げる shelf（頭の影響の近似） */
  const G = 3.999843853973347, Q1 = 0.7071752369554196, f1 = 1681.974450955533;
  const K1 = Math.tan((Math.PI * f1) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const d1 = 1 + K1 / Q1 + K1 * K1;
  const shelf = [
    (Vh + (Vb * K1) / Q1 + K1 * K1) / d1,
    (2 * (K1 * K1 - Vh)) / d1,
    (Vh - (Vb * K1) / Q1 + K1 * K1) / d1,
    (2 * (K1 * K1 - 1)) / d1,
    (1 - K1 / Q1 + K1 * K1) / d1
  ];
  /* 2 段目: 重低音を落とす RLB high-pass */
  const Q2 = 0.5003270373238773, f2 = 38.13547087602444;
  const K2 = Math.tan((Math.PI * f2) / fs);
  const d2 = 1 + K2 / Q2 + K2 * K2;
  const hp = [1, -2, 1, (2 * (K2 * K2 - 1)) / d2, (1 - K2 / Q2 + K2 * K2) / d2];
  return { shelf, hp };
}

/**
 * biquad を 1 段通す（direct form I・新しい列を返す）。
 * @param {Float32Array|number[]} x @param {number[]} c [b0,b1,b2,a1,a2]
 * @returns {Float32Array}
 */
export function biquad(x, c) {
  const n = x ? x.length : 0;
  const out = new Float32Array(n);
  if (!n || !c) return out;
  const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(x[i]) ? x[i] : 0;
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = Number.isFinite(y) ? y : 0;
    out[i] = y1;
  }
  return out;
}

/** K 重み付けを通した列を返す（新しい列） */
export function kWeight(samples, sampleRate) {
  const c = kWeightCoeffs(sampleRate);
  return biquad(biquad(samples, c.shelf), c.hp);
}

/** チャンネルの重み（BS.1770: L/R/C は 1、サラウンドは 1.41） */
function chanWeight(i, n) {
  if (n <= 3) return 1;
  return i < 3 ? 1 : 1.41;
}

/** ブロックの平均二乗 */
function meanSquare(x, from, to) {
  let s = 0;
  for (let i = from; i < to; i++) { const v = x[i]; if (Number.isFinite(v)) s += v * v; }
  const n = to - from;
  return n > 0 ? s / n : 0;
}

/**
 * 素材 1 本の体感音量（LUFS 相当）と峰・実効値を測る（純関数・契約書 §4）。
 * K 重み付け → 400ms ブロック（100ms 刻み）→ ゲート（絶対 −70 / 相対 −10）。
 * @param {*} audioBuffer AudioBuffer / 偽 AudioBuffer / Float32Array
 * @param {{sampleRate?:number, blockSec?:number, hopSec?:number, monoBoost?:boolean}} [opts]
 * @returns {{lufsApprox:number, peak:number, rms:number, peakDb:number, rmsDb:number,
 *            duration:number, channels:number, blocks:number, gated:boolean}}
 *   `peak`/`rms` は倍率、`lufsApprox`/`peakDb`/`rmsDb` は dB。
 *   測れない（空・完全な無音）ときは dB は DB_FLOOR、倍率は 0。
 */
export function loudnessFromBuffer(audioBuffer, opts) {
  const o = opts || {};
  const { chans, sampleRate, length, duration } = readChannels(audioBuffer, o);
  const empty = {
    lufsApprox: DB_FLOOR, peak: 0, rms: 0, peakDb: DB_FLOOR, rmsDb: DB_FLOOR,
    duration: duration || 0, channels: chans.length, blocks: 0, gated: false
  };
  if (!length || !chans.length) return empty;

  /* 峰と実効値は **重み無しの生の値**（メーターと同じ物差しにする） */
  let peak = 0, sum = 0, count = 0;
  for (let ci = 0; ci < chans.length; ci++) {
    const c = chans[ci];
    for (let i = 0; i < length; i++) {
      const v = Number.isFinite(c[i]) ? c[i] : 0;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v; count++;
    }
  }
  const rms = count ? Math.sqrt(sum / count) : 0;

  /* K 重み付け → ブロックのエネルギー */
  /* 長さの違う channel は短い方に切りそろえる（偽 AudioBuffer は素の配列も在る） */
  const cut = (c) => {
    if (c.length === length) return c;
    if (typeof c.subarray === "function") return c.subarray(0, length);
    const x = new Float32Array(length);
    for (let i = 0; i < length; i++) { const v = c[i]; x[i] = Number.isFinite(v) ? v : 0; }
    return x;
  };
  const weighted = chans.map((c) => kWeight(cut(c), sampleRate));
  const blockLen = Math.max(1, Math.round(clamp(finite(o.blockSec, 0.4), 0.05, 3) * sampleRate));
  const hop = Math.max(1, Math.round(clamp(finite(o.hopSec, 0.1), 0.01, 3) * sampleRate));
  /** モノは 2ch に配られて鳴る（+3.01dB）。opts.monoBoost:false で切れる */
  const boost = (chans.length === 1 && o.monoBoost !== false) ? 2 : 1;
  /** ブロックのエネルギー（Σ 重み × 平均二乗） */
  const zs = [];
  const pushBlock = (from, to) => {
    let z = 0;
    for (let ci = 0; ci < weighted.length; ci++) z += chanWeight(ci, weighted.length) * meanSquare(weighted[ci], from, to);
    zs.push(z * boost);
  };
  if (length < blockLen) pushBlock(0, length);                    // 400ms に届かない素材は 1 ブロック
  else for (let s = 0; s + blockLen <= length; s += hop) pushBlock(s, s + blockLen);
  if (!zs.length) pushBlock(0, length);

  const lufsOf = (z) => (z > 0 ? -0.691 + 10 * Math.log10(z) : DB_FLOOR);
  /* 絶対ゲート（−70 LUFS） */
  const pass1 = zs.filter((z) => lufsOf(z) > MEASURE_FLOOR_LUFS);
  const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1);
  if (!pass1.length) {
    return { ...empty, peak, rms, peakDb: dbFromAmp(peak), rmsDb: dbFromAmp(rms), blocks: zs.length };
  }
  /* 相対ゲート（絶対ゲート後の平均から −10 LU） */
  const relThr = lufsOf(mean(pass1)) - 10;
  const pass2 = pass1.filter((z) => lufsOf(z) > relThr);
  const use = pass2.length ? pass2 : pass1;
  const lufs = clamp(lufsOf(mean(use)), DB_FLOOR, 12);
  return {
    lufsApprox: lufs, peak, rms,
    peakDb: dbFromAmp(peak), rmsDb: dbFromAmp(rms),
    duration, channels: chans.length, blocks: zs.length, gated: pass2.length !== pass1.length
  };
}

/**
 * 目標 LUFS へ寄せる倍率（純関数）。
 * ai/tools.js の autoNormalize と **同じ丸めと同じ上限**（小数 3 桁・0.05〜4 倍・
 * 持ち上げは +12dB まで・下げは −24dB まで）。片方だけ直すと
 * 「画面の数字と実際の音が違う」になるので、規則はここに 1 つだけ置く。
 * @param {number} lufsApprox 測った値（dB）
 * @param {number} [targetLufs] 目標（既定 −14）
 * @param {{maxBoostDb?:number, maxCutDb?:number, minGain?:number, maxGain?:number,
 *          digits?:number, floorLufs?:number}} [opts]
 * @returns {number} 倍率。測れない値なら 1（= 触らない）
 */
export function normalizeGain(lufsApprox, targetLufs, opts) {
  const o = opts || {};
  const measured = Number(lufsApprox);
  const target = finite(targetLufs, TARGET_LUFS);
  const floorLufs = finite(o.floorLufs, MEASURE_FLOOR_LUFS);
  if (!Number.isFinite(measured) || measured <= floorLufs) return 1;   // 無音は持ち上げない
  const maxBoost = Math.max(0, finite(o.maxBoostDb, 12));
  const maxCut = Math.max(0, finite(o.maxCutDb, 24));
  const db = clamp(target - measured, -maxCut, maxBoost);
  const minGain = Math.max(0, finite(o.minGain, 0.05));
  const maxGain = Math.max(minGain, finite(o.maxGain, 4));
  const digits = clamp(Math.round(finite(o.digits, 3)), 0, 6);
  const p = Math.pow(10, digits);
  return Math.round(clamp(Math.pow(10, db / 20), minGain, maxGain) * p) / p;
}

/**
 * 峰と実効値を 1 つの並びから測る（純関数）。read() の中身と同じ計算。
 * @param {Float32Array|number[]} data −1..1 の時間波形
 * @returns {{peak:number, rms:number}}
 */
export function peakRmsOf(data) {
  const n = data ? data.length : 0;
  if (!n) return { peak: 0, rms: 0 };
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(data[i]) ? data[i] : 0;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / n) };
}

/* ══ §2. 生のメーター（AnalyserNode を当てる）════════════════════════ */

/** 時間波形を 1 本読む（float が無い端末は byte 版へ落ちる） */
function readWave(an, buf, byteBuf) {
  if (typeof an.getFloatTimeDomainData === "function") {
    an.getFloatTimeDomainData(buf);
    return buf;
  }
  if (typeof an.getByteTimeDomainData === "function") {
    an.getByteTimeDomainData(byteBuf);
    for (let i = 0; i < byteBuf.length; i++) buf[i] = (byteBuf[i] - 128) / 128;
    return buf;
  }
  return null;
}

/**
 * メーターを 1 つ作る（契約書 §4）。
 *
 * 呼び方は 2 通り（CONTRACT-NOTE (1)）:
 *   createMeter(ctx, node)                     … node の音を測る
 *   createMeter({ audio, ctx, target, node })  … AudioEngine 越しに測る
 *
 * @param {AudioContext|{audio?:Object, ctx?:AudioContext, node?:AudioNode,
 *                       target?:string, fftSize?:number}} a
 * @param {AudioNode} [b] 測る node（第 1 引数が AudioContext のとき）
 * @param {{fftSize?:number, clipHoldMs?:number}} [c]
 * @returns {{read:Function, reset:Function, dispose:Function, node:AudioNode|null,
 *            ctx:AudioContext|null, ok:boolean}}
 *   `read(trackId)` → `{peak:[l,r], rms:[l,r], clip:boolean}` / 測れなければ null
 */
export function createMeter(a, b, c) {
  /* ── 引数の形を見分ける（AudioContext は createAnalyser を持つ）── */
  let ctx = null, node = null, o = {}, engine = null, target = "master";
  if (a && typeof a.createAnalyser === "function") {
    ctx = a; node = b || null; o = c || {};
  } else if (a && typeof a === "object") {
    o = a;
    engine = o.audio || null;
    ctx = o.ctx || (engine && engine.ctx) || null;
    node = o.node || b || null;
    target = String(o.target || o.trackId || "master") || "master";
    if (ctx && typeof ctx.createAnalyser !== "function") ctx = null;
  }

  /* ── AudioEngine 越し（node を指されていない）── */
  if (!node && engine && typeof engine.meter === "function") {
    return {
      ctx, node: null, ok: true,
      read(id) {
        const key = id === undefined || id === null || id === "" ? target : String(id);
        try { return engine.meter(key); } catch (e) { return null; }
      },
      reset() { if (typeof engine.resetMeters === "function") { try { engine.resetMeters(); } catch (e) { /* noop */ } } },
      dispose() { /* 借り物しか持っていない */ }
    };
  }

  /* ── 測れない（土台が無い）── */
  if (!ctx || !node || typeof node.connect !== "function") {
    return { ctx, node: null, ok: false, read() { return null; }, reset() {}, dispose() {} };
  }

  const fftSize = (() => {
    const want = Math.round(finite(o.fftSize, 1024));
    let n = 256;
    while (n < want && n < 4096) n *= 2;
    return n;
  })();
  const holdMs = Math.max(0, finite(o.clipHoldMs, CLIP_HOLD_MS));

  let split = null, anL = null, anR = null;
  try {
    split = ctx.createChannelSplitter(2);
    anL = ctx.createAnalyser();
    anR = ctx.createAnalyser();
    for (const an of [anL, anR]) { an.fftSize = fftSize; an.smoothingTimeConstant = 0; }
    node.connect(split);
    split.connect(anL, 0);
    split.connect(anR, 1);
  } catch (e) {
    L.warn("メーターを当てられない（音は普通に出ます）", e && e.message);
    for (const n of [split, anL, anR]) { if (n) { try { n.disconnect(); } catch (x) { /* noop */ } } }
    return { ctx, node, ok: false, read() { return null; }, reset() {}, dispose() {} };
  }

  /* 毎フレーム呼ばれるので、置き場は作った時に 1 回だけ確保する */
  const bufL = new Float32Array(fftSize);
  const bufR = new Float32Array(fftSize);
  const byteL = new Uint8Array(fftSize);
  const byteR = new Uint8Array(fftSize);
  const out = { peak: [0, 0], rms: [0, 0], clip: false, at: 0 };
  let clipAt = -1e9;
  let disposed = false;

  function nowMs() {
    if (ctx && Number.isFinite(ctx.currentTime)) return ctx.currentTime * 1000;
    return Date.now();
  }

  return {
    ctx, node, ok: true,
    /**
     * 今の値を読む。`read()` は引数を取らない（契約書）。
     * id を渡されたら AudioEngine 越しの読みと同じ形で無視して自分を返す
     * （UI が `read(trackId)` で呼んでくるため）。
     */
    read() {
      if (disposed) return null;
      const dl = readWave(anL, bufL, byteL);
      const dr = readWave(anR, bufR, byteR);
      if (!dl) return null;
      const l = peakRmsOf(dl);
      const r = dr ? peakRmsOf(dr) : l;
      out.peak[0] = l.peak; out.peak[1] = r.peak;
      out.rms[0] = l.rms; out.rms[1] = r.rms;
      const t = nowMs();
      if (l.peak >= CLIP_AMP || r.peak >= CLIP_AMP) clipAt = t;
      out.clip = t - clipAt < holdMs;
      out.at = t;
      return out;
    },
    /** 振り切れの印を消す（UI の「リセット」） */
    reset() { clipAt = -1e9; out.clip = false; },
    dispose() {
      if (disposed) return;
      disposed = true;
      /* 自分が足した枝だけを切る（node.disconnect() を丸ごと呼ぶと本線が死ぬ）*/
      try { node.disconnect(split); } catch (e) { /* 端末差で第 2 引数を取らない事が在る */ }
      for (const n of [split, anL, anR]) { try { n.disconnect(); } catch (e) { /* noop */ } }
      split = null; anL = null; anR = null;
    }
  };
}

/** 既定の読み（メーターが作れなかった時に UI が使う空の読み） */
export const EMPTY_READING = Object.freeze({ peak: [0, 0], rms: [0, 0], clip: false });
