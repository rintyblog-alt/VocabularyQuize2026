/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/waveform.js — クリップに敷く「音の波形」

   ★ 何をする所か
     素材の音を decodeAudioData で開き、**1024 サンプル毎の min/max を交互に
     詰めた Float32Array**（= peaks）を作る。作った物は persist の putPeaks に
     保存して次回は読むだけにする。draw() はその peaks から、頼まれた素材区間
     [from, to] を CapCut 風の左右対称な塗りつぶし波形として canvas に描く。

   ★ なぜこの形か
     ・波形は「毎フレーム描く物」ではなく「一度作って何度も描く物」。だから
       重い decode（数百 ms〜数秒）と軽い描画（1ms 未満）を完全に分ける。
     ・peaks の単位は **1024 サンプル**に固定（契約書 §担当書）。時刻との対応は
       `duration / buckets` で出す。こうすると peaks の中に sampleRate を
       埋め込まずに済み、IndexedDB に素の Float32Array のまま置ける
       （putPeaks(assetId, Float32Array) の形を変えずに済む）。
       便宜のため、こちらが返す配列には vqDuration / vqBucket / vqSampleRate を
       付けておく（保存では消えるので、読み戻した時は asset.duration から復元する）。
     ・decodeAudioData は容器（mp4/webm）を途中で切れないので **分割デコードは
       できない**。代わりに「peaks を作る計算」を分割して進捗を出し、
       長尺でも main thread を数秒占有しないようにした（CONTRACT-NOTE）。
     ・同時に 2 つ decode すると端末が詰まる（特に iOS）。1 件ずつ。

   ★ 触るときの注意
     ・音を持たない素材（image / hasAudio===false）は **null**。呼び出し側は
       null なら波形の場所を空けるだけにする（例外を投げない）。
     ・draw() は渡された canvas の画素寸法（canvas.width/height）をそのまま
       使う。DPR の掛け算は呼び出し側（view.js）の仕事。
     ・AudioContext をここで作るが `resume()` はしない（音を鳴らす所ではない）。
       engine/audio/graph.js の ctx を deps で渡せば、そちらを使い回す。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite } from "../../core/util.js";
import { warn } from "../../core/log.js";

const BUCKET = 1024;            // 契約: 1024 サンプル毎に min/max
const CHUNK_SAMPLES = 1 << 21;  // 1 回の計算で触るサンプル数（約 2M ≒ 40ms）
const MAX_COL_STEPS = 48;       // 1 画素列あたりで見る bucket の上限（間引き）

/* ── 純粋な計算 ───────────────────────────────────────────────── */

/** その素材は音を持つか（持たないなら peaks を作らない） */
export function hasAudio(asset) {
  if (!asset || typeof asset !== "object") return false;
  if (asset.kind === "image") return false;
  if (asset.kind === "audio") return true;
  return asset.hasAudio !== false;
}

/** peaks の bucket 数 */
export function bucketCount(peaks) {
  return peaks && peaks.length ? (peaks.length >> 1) : 0;
}

/** peaks 1 bucket あたりの秒数。duration が付いていなければ引数で補う */
export function secPerBucket(peaks, fallbackDuration) {
  const n = bucketCount(peaks);
  if (!n) return 0;
  const sr = finite(peaks && peaks.vqSampleRate, 0);
  if (sr > 0) return BUCKET / sr;
  const d = finite(peaks && peaks.vqDuration, 0) || finite(fallbackDuration, 0);
  return d > 0 ? d / n : 0;
}

/**
 * AudioBuffer → peaks。**分割して回すための世代器**（yield 毎に進捗を返す）。
 * 全チャンネルの min/max をまとめる（モノラルに潰さず、包絡だけを残す）。
 * @param {AudioBuffer} buf
 * @returns {Generator<number, Float32Array, void>}
 */
export function* peaksFrom(buf) {
  const channels = Math.max(1, buf.numberOfChannels | 0);
  const len = buf.length | 0;
  const n = Math.max(1, Math.ceil(len / BUCKET));
  const out = new Float32Array(n * 2);
  const data = [];
  for (let c = 0; c < channels; c++) data.push(buf.getChannelData(c));

  let i = 0;
  while (i < n) {
    const until = Math.min(n, i + Math.max(1, Math.floor(CHUNK_SAMPLES / BUCKET)));
    for (; i < until; i++) {
      const s0 = i * BUCKET;
      const s1 = Math.min(len, s0 + BUCKET);
      let lo = 0, hi = 0;
      for (let c = 0; c < channels; c++) {
        const d = data[c];
        for (let s = s0; s < s1; s++) {
          const v = d[s];
          if (v < lo) lo = v; else if (v > hi) hi = v;
        }
      }
      out[i * 2] = lo;
      out[i * 2 + 1] = hi;
    }
    if (i < n) yield i / n;
  }
  return out;
}

/* ── 本体 ─────────────────────────────────────────────────────── */

/**
 * @typedef {Object} Waveform
 * @property {(asset:Object, opts?:Object)=>Promise<Float32Array|null>} peaks
 * @property {(canvas:HTMLCanvasElement, peaks:Float32Array|null, opts?:Object)=>void} draw
 * @property {(asset:Object)=>Promise<void>} prefetch
 * @property {()=>Object} stats
 * @property {()=>void} dispose
 */

/**
 * 波形工房を作る。
 * @param {{storage?:Object|null, ctx?:AudioContext|null}} [deps]
 * @returns {Waveform}
 */
export function createWaveform(deps) {
  const storage = (deps && deps.storage) || null;
  /** assetId → { state:"loading"|"ready"|"failed", data, promise } */
  const cache = new Map();
  const counts = { decoded: 0, loaded: 0, failed: 0, drawn: 0 };
  let audioCtx = (deps && deps.ctx) || null;
  let ownCtx = false;
  let chain = Promise.resolve();   // decode は 1 件ずつ
  let pending = 0;
  let alive = true;

  function getCtx() {
    if (audioCtx) return audioCtx;
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    try {
      if (OAC) { audioCtx = new OAC(1, 1, 44100); ownCtx = true; return audioCtx; }
    } catch (_e) { /* 次の手へ */ }
    try {
      if (AC) { audioCtx = new AC(); ownCtx = true; return audioCtx; }
    } catch (_e) { /* 無ければ諦める */ }
    return null;
  }

  /** 旧 Safari のコールバック形も飲む decodeAudioData */
  function decode(ctx, ab) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (b) => { if (!settled) { settled = true; resolve(b); } };
      const ng = (e) => { if (!settled) { settled = true; reject(e || new Error("音を開けません")); } };
      let ret = null;
      try { ret = ctx.decodeAudioData(ab, ok, ng); } catch (e) { ng(e); return; }
      if (ret && typeof ret.then === "function") ret.then(ok, ng);
    });
  }

  async function blobOf(asset) {
    if (!storage || typeof storage.getAssetBlob !== "function") return null;
    const key = asset && asset.storage && asset.storage.key;
    if (!key) return null;
    try { return await storage.getAssetBlob(key); } catch (_e) { return null; }
  }

  function tag(arr, asset, sampleRate) {
    if (!arr) return arr;
    try {
      arr.vqBucket = BUCKET;
      arr.vqSampleRate = finite(sampleRate, 0) || 0;
      arr.vqDuration = finite(asset && asset.duration, 0);
    } catch (_e) { /* Float32Array に属性が付かない環境は時間を duration から出す */ }
    return arr;
  }

  async function loadSaved(asset) {
    if (!storage || typeof storage.getPeaks !== "function") return null;
    try {
      const raw = await storage.getPeaks(asset.id);
      if (!raw || !raw.length) return null;
      const arr = raw instanceof Float32Array ? raw : new Float32Array(raw);
      counts.loaded++;
      return tag(arr, asset, 0);
    } catch (_e) { return null; }
  }

  async function build(asset, onProgress) {
    const ctx = getCtx();
    if (!ctx) return null;
    const blob = await blobOf(asset);
    if (!blob) return null;
    let ab = null;
    try { ab = await blob.arrayBuffer(); } catch (_e) { return null; }
    let buf = null;
    try { buf = await decode(ctx, ab); } catch (e) { warn("waveform", "decode 失敗 " + asset.id, e); return null; }
    if (!buf || !buf.length) return null;

    /* peaks の計算は分割して回す（長尺で画面が固まらないように） */
    const gen = peaksFrom(buf);
    for (;;) {
      const step = gen.next();
      if (step.done) {
        counts.decoded++;
        return tag(step.value, asset, buf.sampleRate);
      }
      if (typeof onProgress === "function") { try { onProgress(clamp(step.value, 0, 1)); } catch (_e) { /* noop */ } }
      if (!alive) return null;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  /* ── 公開: peaks ────────────────────────────────────────────── */
  function peaks(asset, opts) {
    if (!alive || !hasAudio(asset)) return Promise.resolve(null);
    const id = String(asset.id || "");
    if (!id) return Promise.resolve(null);
    const rec = cache.get(id);
    if (rec && rec.state === "ready") return Promise.resolve(rec.data);
    if (rec && rec.state === "failed") return Promise.resolve(null);
    if (rec && rec.promise) return rec.promise;

    const onProgress = opts && opts.onProgress;
    const fresh = { state: "loading", data: null, promise: null };
    cache.set(id, fresh);
    pending++;
    /* decode は 1 件ずつ（chain に並べる） */
    fresh.promise = chain.then(async () => {
      let data = await loadSaved(asset);
      if (!data && alive) {
        data = await build(asset, onProgress);
        if (data && storage && typeof storage.putPeaks === "function") {
          try { await storage.putPeaks(id, data); } catch (e) { warn("waveform", "peaks を保存できません", e); }
        }
      }
      const cur = cache.get(id);
      if (cur === fresh) {
        fresh.data = data;
        fresh.state = data ? "ready" : "failed";
        fresh.promise = null;
      }
      if (!data) counts.failed++;
      return data;
    }).catch((e) => {
      warn("waveform", "peaks 失敗", e);
      const cur = cache.get(id);
      if (cur === fresh) { fresh.state = "failed"; fresh.promise = null; }
      counts.failed++;
      return null;
    }).finally(() => { pending--; });
    chain = fresh.promise.catch(() => null);
    return fresh.promise;
  }

  /* ── 公開: 描く ─────────────────────────────────────────────── */
  /**
   * @param {HTMLCanvasElement} canvas 画素寸法は呼び出し側が決める
   * @param {Float32Array|null} pk
   * @param {{from?:number,to?:number,height?:number,color?:string,gain?:number,
   *          duration?:number,dpr?:number,center?:boolean}} [opts]
   */
  function draw(canvas, pk, opts) {
    if (!canvas || typeof canvas.getContext !== "function") return;
    const o = opts || {};
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = clamp(finite(o.dpr, 1), 0.5, 3);
    const w = canvas.width / dpr;
    const h = finite(o.height, 0) > 0 ? finite(o.height, 0) : canvas.height / dpr;
    if (!(w > 0) || !(h > 0)) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w + 1, h + 1);
    const color = o.color || "rgba(150,214,255,.82)";
    const mid = h / 2;

    const n = bucketCount(pk);
    if (!n) {
      /* 音が無い / まだ作れていない: 中心線だけ引く（場所が空いて見えないように） */
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(0, mid - 0.5, w, 1);
      ctx.globalAlpha = 1;
      return;
    }

    const sec = secPerBucket(pk, o.duration);
    const from = Math.max(0, finite(o.from, 0));
    const to = Math.max(from + 1e-3, finite(o.to, from + 1));
    const gain = clamp(finite(o.gain, 1), 0, 8);
    let i0 = sec > 0 ? from / sec : 0;
    let i1 = sec > 0 ? to / sec : n;
    i0 = clamp(i0, 0, n - 1);
    i1 = clamp(i1, i0 + 1e-6, n);
    const span = i1 - i0;

    const cols = Math.max(1, Math.round(w));
    const top = new Float32Array(cols);
    const bot = new Float32Array(cols);
    for (let x = 0; x < cols; x++) {
      const a = i0 + (x / cols) * span;
      const b = i0 + ((x + 1) / cols) * span;
      let k0 = Math.floor(a), k1 = Math.max(k0 + 1, Math.ceil(b));
      if (k1 > n) k1 = n;
      const stride = Math.max(1, Math.floor((k1 - k0) / MAX_COL_STEPS));
      let lo = 0, hi = 0;
      for (let k = k0; k < k1; k += stride) {
        const v0 = pk[k * 2], v1 = pk[k * 2 + 1];
        if (v0 < lo) lo = v0;
        if (v1 > hi) hi = v1;
      }
      top[x] = clamp(hi * gain, 0, 1);
      bot[x] = clamp(-lo * gain, 0, 1);
    }

    /* 左右対称の塗りつぶし（上の輪郭 → 下の輪郭を逆向きに戻して 1 本の path） */
    ctx.beginPath();
    ctx.moveTo(0, mid - top[0] * mid);
    for (let x = 1; x < cols; x++) ctx.lineTo(x, mid - top[x] * mid);
    for (let x = cols - 1; x >= 0; x--) ctx.lineTo(x, mid + bot[x] * mid);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    counts.drawn++;
  }

  /* ── 公開: 先読み・統計・破棄 ────────────────────────────────── */
  async function prefetch(asset) {
    if (!alive) return;
    try { await peaks(asset); } catch (_e) { /* 先読みの失敗は黙る */ }
  }

  function stats() {
    let ready = 0, failed = 0;
    cache.forEach((r) => { if (r.state === "ready") ready++; else if (r.state === "failed") failed++; });
    return {
      assets: cache.size, ready, failed, pending,
      decoded: counts.decoded, loaded: counts.loaded, drawn: counts.drawn,
      bucket: BUCKET
    };
  }

  function clear(assetId) {
    if (!assetId) { cache.clear(); return; }
    cache.delete(String(assetId));
  }

  function dispose() {
    alive = false;
    cache.clear();
    if (ownCtx && audioCtx && typeof audioCtx.close === "function" && audioCtx.state !== "closed") {
      try { audioCtx.close(); } catch (_e) { /* noop */ }
    }
    audioCtx = null;
  }

  return { peaks, draw, prefetch, stats, clear, dispose };
}
