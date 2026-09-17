/* ══════════════════════════════════════════════════════════════════════
   analysis/index.js — 素材 1 つを解析して契約書 §1 の `analysis` を組む所

   ★ 何をする所か / なぜこの形か
     `analyzeAsset(asset, {storage, want, onProgress, signal})` だけが外向きの口。
     映像は analysis/video.js、音は analysis/audio.js（別担当）へ振り分け、結果を
     契約書 §1 の形（scenes / motion / sharp / bright / sat / faces / loudness /
     silence / speech / beats / highlights）に詰めて返す。UI と ai は **この 1 つ**
     だけを呼べば良い（どの API が在る環境かを気にしなくて済む）。

     ・**途中で失敗しても落ちない**のが肝。音だけの素材・画像・壊れた素材・WebCodecs
       の無い環境でも、取れた所まで入った analysis を返し、諦めた理由を
       `warnings` に日本語で残す（握りつぶさない）。UI はこれを出せる。
     ・既に `analysis` が在り `version` が同じなら **再計算しない**（素材を読み直す
       だけで数秒かかる。取り込み直後とプロジェクトを開いた直後に二重で走る）。
     ・中止（`signal`）は素直に AbortError で抜ける。UI 側が「取り込み中に閉じた」を
       事故として出さないように、name だけは標準に合わせる。

   ★ 触るときの注意
     ・CONTRACT-NOTE: audio.js は **動的 import** で読む。まだ無い / 404 でも解析全体を
       落とさないため（静的 import だと モジュールの読み込み時点で画面が真っ白になる）。
       在れば `loudnessCurve / detectSilence / detectBeats / detectSpeech` を使う。
     ・CONTRACT-NOTE: `analysis` に契約書に無い 3 つを足した。`duration`（区間選びに
       必要）・`shake`（手ぶれ 0..1）・`warnings`（諦めた理由）。読む側は無くても
       困らない形（どれも既定値を持つ）。
     ・storage は契約書 §3 の Storage を期待するが、無い / 欠けていても動く
       （`asset.url` / `asset.blob` へ落ちる）。試験でも差し替えられる。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, clamp01, finite } from "../core/util.js";
import { warn } from "../core/log.js";
import {
  sampleFrames, frameFromSource, detectScenes, motionCurve, sharpnessCurve,
  brightnessCurve, saturationCurve, shakeScore, detectFaces, pickHighlights,
  throwIfAborted,
} from "./video.js";

// video.js / track.js の道具はここからも引ける（ai 側が import 先を迷わないように）
export * from "./video.js";
export * from "./track.js";

/** 解析結果の版。中身の作り方を変えたら上げる（上げると次に開いた時に作り直される） */
export const ANALYSIS_VERSION = 1;

/** 既定で欲しい物（契約書 §6 の want） */
export const DEFAULT_WANT = ["scenes", "motion", "sharp", "bright", "sat", "faces", "loudness", "silence", "beats", "highlights"];

const AUDIO_WANT = ["loudness", "silence", "beats", "speech"];

/** 空の analysis（全ての鍵が在る = 読む側が分岐を書かなくて済む） */
export function emptyAnalysis() {
  return {
    version: ANALYSIS_VERSION,
    scenes: [], motion: null, sharp: null, bright: null, sat: null, faces: null,
    loudness: null, silence: [], speech: null, beats: null, highlights: [],
    duration: 0, shake: 0, warnings: [],
  };
}

function normalizeWant(want) {
  const list = Array.isArray(want) && want.length ? want : DEFAULT_WANT;
  return new Set(list.map((s) => String(s)));
}

/** もう解析済みか（version が同じで、欲しい鍵が全部在る） */
export function needsAnalysis(asset, want) {
  const a = asset && asset.analysis;
  if (!a || typeof a !== "object" || a.version !== ANALYSIS_VERSION) return true;
  for (const k of normalizeWant(want)) if (!(k in a)) return true;
  return false;
}

/** asset.kind が無い/怪しい時は mime から推す */
export function kindOf(asset) {
  const k = asset && asset.kind;
  if (k === "video" || k === "image" || k === "audio") return k;
  const mime = String((asset && asset.mime) || "");
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "video";
}

function msgOf(e) { return (e && e.message) || String(e); }
function rethrowAbort(e) { if (e && e.name === "AbortError") throw e; }

function makeProgress(fn) {
  return (p, stage) => {
    if (typeof fn !== "function") return;
    try { fn(clamp01(finite(p, 0)), { stage }); } catch (_e) { /* 進捗で落ちない */ }
  };
}

/* ── 素材の場所（storage が在れば代理を優先） ─────────────── */

async function mediaURL(asset, storage) {
  if (storage) {
    // §13.3: 1080p 超の生 Blob を <video> に入れると iOS が落ちる。代理が在れば代理を見る
    try {
      if (typeof storage.getProxyURL === "function") {
        const u = await storage.getProxyURL(asset.id);
        if (u) return { url: u, key: null, owned: false };
      }
    } catch (_e) { /* 代理が無いだけ */ }
    const key = asset.storage && asset.storage.key;
    if (key && typeof storage.getAssetURL === "function") {
      const u = await storage.getAssetURL(key);
      if (u) return { url: u, key, owned: true };
    }
  }
  if (typeof asset.url === "string" && asset.url) return { url: asset.url, key: null, owned: false };
  throw new Error("素材の場所が分からない（storage も asset.url も無い）");
}

async function mediaBlob(asset, storage) {
  const key = asset.storage && asset.storage.key;
  if (storage && key && typeof storage.getAssetBlob === "function") {
    const b = await storage.getAssetBlob(key);
    if (b) return b;
  }
  if (asset.blob) return asset.blob;
  if (asset.file) return asset.file;
  throw new Error("素材の実体が取れない（storage.getAssetBlob が無い）");
}

/** 解析専用の <video> を用意する。使い終わったら必ず release()（§13.3） */
async function openVideo(asset, storage) {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== "function") throw new Error("document が無い環境では映像を解析できない");
  const { url, key, owned } = await mediaURL(asset, storage);
  const el = doc.createElement("video");
  el.preload = "auto";
  el.muted = true;
  el.defaultMuted = true;
  el.playsInline = true;
  el.crossOrigin = "anonymous";
  el.src = url;
  const release = () => {
    try { el.pause(); } catch (_e) { /* 既に止まっている */ }
    try { el.removeAttribute("src"); el.load(); } catch (_e) { /* 解放だけが目的 */ }
    if (owned && storage && typeof storage.releaseAssetURL === "function") {
      try { storage.releaseAssetURL(key); } catch (_e) { /* 参照数だけの話 */ }
    }
  };
  return { el, release };
}

/* ── フレーム列 → analysis の各欄 ───────────────────────── */

function fillFromFrames(out, frames, ctx, withScenes = true) {
  const want = ctx.want;
  if (withScenes && want.has("scenes")) out.scenes = detectScenes(frames, { threshold: ctx.threshold, minShot: ctx.minShot });
  if (want.has("motion")) out.motion = motionCurve(frames);
  if (want.has("sharp")) out.sharp = sharpnessCurve(frames);
  if (want.has("bright")) out.bright = brightnessCurve(frames);
  if (want.has("sat")) out.sat = saturationCurve(frames);
  out.shake = shakeScore(frames);
  const last = frames.length ? finite(frames[frames.length - 1].t, 0) : 0;
  out.duration = Math.max(out.duration, last);
}

/** 顔を見る時刻（多くても 24 点。1 点あたり seek が入るので増やすと重い） */
function faceTimes(frames, max = 24) {
  if (!frames.length) return [];
  const stride = Math.max(1, Math.ceil(frames.length / Math.max(1, max)));
  const out = [];
  for (let i = 0; i < frames.length; i += stride) out.push(finite(frames[i].t, 0));
  return out;
}

async function videoStage(asset, out, ctx) {
  const { el, release } = await openVideo(asset, ctx.storage);
  try {
    const frames = await sampleFrames(el, {
      hz: ctx.hz, size: ctx.size, signal: ctx.signal,
      onProgress: (p) => ctx.progress(p * 0.55, "frames"),
    });
    if (!frames.length) throw new Error("フレームが 1 枚も取れなかった");
    fillFromFrames(out, frames, ctx);
    out.duration = Math.max(out.duration, finite(el.duration, 0));
    ctx.progress(0.6, "faces");
    if (ctx.want.has("faces")) {
      out.faces = await detectFaces(el, faceTimes(frames), { signal: ctx.signal });
    }
  } finally {
    release();
  }
}

async function imageStage(asset, out, ctx) {
  if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap が無い環境では画像を解析できない");
  const bmp = await createImageBitmap(await mediaBlob(asset, ctx.storage));
  try {
    // 画像は 1 枚だけ。ショットも手ぶれも無い（尺は clip 側が決める）
    fillFromFrames(out, [frameFromSource(bmp, { size: ctx.size, t: 0 })], ctx, false);
    out.scenes = [];
    out.shake = 0;
    out.duration = Math.max(0, finite(asset.duration, 0));
  } finally {
    if (bmp && typeof bmp.close === "function") { try { bmp.close(); } catch (_e) { /* 解放だけ */ } }
  }
}

/* ── 音（analysis/audio.js が在れば使う） ────────────────── */

let audioModPromise = null;
function loadAudioModule() {
  if (!audioModPromise) audioModPromise = import("./audio.js").catch(() => null);
  return audioModPromise;
}

async function decodeAssetAudio(asset, ctx) {
  const OC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!OC && !AC) throw new Error("AudioContext が無い環境では音を解析できない");
  const ab = await (await mediaBlob(asset, ctx.storage)).arrayBuffer();
  // OfflineAudioContext を優先（出力装置を開かないので iOS でも操作なしに decode できる）
  const actx = OC ? new OC(1, 1, Math.round(clamp(finite(ctx.sampleRate, 48000), 8000, 192000))) : new AC();
  try {
    return await actx.decodeAudioData(ab);
  } finally {
    if (!OC && actx && typeof actx.close === "function") { try { actx.close(); } catch (_e) { /* 閉じ損ねても実害は無い */ } }
  }
}

/** Float32Array でも {hz,values} でも受け取って §1 の形へ */
function toLoudness(c, hz) {
  if (!c) return null;
  if (Array.isArray(c.values)) return { hz: finite(c.hz, hz) || hz, values: c.values.map((v) => finite(v, -70)) };
  const values = Array.from(c).map((v) => finite(v, -70));
  return values.length ? { hz, values } : null;
}

async function audioStage(asset, out, ctx) {
  const mod = await loadAudioModule();
  if (!mod) {
    out.warnings.push("音の解析は飛ばした（analysis/audio.js がまだ無い）");
    return;
  }
  const buf = await decodeAssetAudio(asset, ctx);
  throwIfAborted(ctx.signal);
  const want = ctx.want;
  if (want.has("loudness") && typeof mod.loudnessCurve === "function") out.loudness = toLoudness(mod.loudnessCurve(buf, { hz: 20 }), 20);
  if (want.has("silence") && typeof mod.detectSilence === "function") out.silence = mod.detectSilence(buf, {}) || [];
  if (want.has("beats") && typeof mod.detectBeats === "function") out.beats = mod.detectBeats(buf) || null;
  if (want.has("speech") && typeof mod.detectSpeech === "function") out.speech = mod.detectSpeech(buf) || null;
  out.duration = Math.max(out.duration, finite(buf && buf.duration, 0));
}

/* ── 外向きの口 ─────────────────────────────────────────── */

/**
 * 素材 1 つを解析する（契約書 §6）。
 * @param {*} asset 契約書 §1 の Asset（kind / storage / duration を見る）
 * @param {{storage?:*, want?:string[], onProgress?:Function, signal?:*, force?:boolean,
 *          hz?:number, size?:number, sampleRate?:number, threshold?:number, minShot?:number,
 *          highlightCount?:number, highlightLength?:number}} [opts]
 * @returns {Promise<*>} §1 の analysis（失敗した欄は null / [] のまま・理由は warnings）
 */
export async function analyzeAsset(asset, opts = {}) {
  if (!asset || typeof asset !== "object") throw new Error("analyzeAsset: asset が無い");
  const o = opts || {};
  throwIfAborted(o.signal);
  const want = normalizeWant(o.want);
  if (!o.force && !needsAnalysis(asset, Array.from(want))) return asset.analysis;
  const kind = kindOf(asset);
  const out = emptyAnalysis();
  out.duration = Math.max(0, finite(asset.duration, 0));
  const ctx = {
    storage: o.storage || null, want, signal: o.signal || null,
    hz: finite(o.hz, 4), size: finite(o.size, 64), sampleRate: finite(o.sampleRate, 48000),
    threshold: finite(o.threshold, 0.28), minShot: finite(o.minShot, 0.6),
    progress: makeProgress(o.onProgress),
  };
  ctx.progress(0.02, "start");
  if (kind === "video" || kind === "image") {
    try {
      await (kind === "video" ? videoStage : imageStage)(asset, out, ctx);
    } catch (e) {
      rethrowAbort(e);
      out.warnings.push(`映像の解析を諦めた: ${msgOf(e)}`);
      warn("analysis", "video stage", e);
    }
  }
  ctx.progress(0.65, "audio");
  const wantsAudio = kind !== "image" && asset.hasAudio !== false && AUDIO_WANT.some((k) => want.has(k));
  if (wantsAudio) {
    try {
      await audioStage(asset, out, ctx);
    } catch (e) {
      rethrowAbort(e);
      out.warnings.push(`音の解析を諦めた: ${msgOf(e)}`);
      warn("analysis", "audio stage", e);
    }
  }
  ctx.progress(0.95, "highlights");
  const canRank = !!(out.motion || out.sharp || out.bright || out.sat || out.scenes.length);
  if (want.has("highlights") && canRank) {
    try {
      out.highlights = pickHighlights(out, {
        count: finite(o.highlightCount, 5),
        want: finite(o.highlightLength, Math.min(3, out.duration || 3)),
      });
    } catch (e) {
      out.warnings.push(`見せ場の抽出を諦めた: ${msgOf(e)}`);
    }
  }
  ctx.progress(1, "done");
  return out;
}

/**
 * 複数の素材を順番に解析する（取り込み直後の一括。同時に走らせると iOS が溺れる）。
 * 1 つ失敗しても止めない（返り値の `error` に理由が入る）。
 * @returns {Promise<{assetId:string, analysis:*|null, error:string|null}[]>}
 */
export async function analyzeAssets(assets, opts = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    throwIfAborted(opts.signal);
    const a = list[i];
    const onProgress = typeof opts.onProgress === "function"
      ? (p, info) => opts.onProgress((i + clamp01(p)) / list.length, { ...info, assetId: a && a.id, index: i, count: list.length })
      : null;
    try {
      out.push({ assetId: a && a.id, analysis: await analyzeAsset(a, { ...opts, onProgress }), error: null });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      out.push({ assetId: a && a.id, analysis: null, error: msgOf(e) });
    }
  }
  return out;
}
