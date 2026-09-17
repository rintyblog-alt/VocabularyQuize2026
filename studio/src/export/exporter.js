/* ══════════════════════════════════════════════════════════════════════
   export/exporter.js — 書き出しの司令塔（契約書 §5 / §11）

   ★ 何をする所か
     「何をどう書き出すか」を決める（planExport）→ 実際に書き出す
     （exportVideo / exportStill / exportAudio / exportSubtitles / exportEDL）
     までの入口を 1 箇所に集める。UI は ここ以外の書き出し実装を知らない。

     ・動画は 2 つの道を持つ:
         mode:"precise"  … WebCodecs（VideoEncoder）+ 自前 muxer。
                           フレームを 1 枚ずつ確実に出すので尺が正確。
         mode:"realtime" … canvas.captureStream + MediaRecorder。
                           対応は広いが「実時間」かかり、取りこぼしも在る。
       どちらも駄目な端末（古い iOS 等）では **静止画の連番 + 音声**へ落とす。
       利用者を手ぶらで帰さないのが この層の仕事。

   ★ なぜこの形か
     ・planExport を **純関数**にした。解像度の偶数丸め・fps の範囲・
       ビットレートの自動計算・範囲の収め方は「書き出す前に画面へ出す」値で、
       node の試験で固めておかないと 静かに壊れる所（契約書 §8）。
     ・engine（compositor / sources / audio）と muxer は **動的 import**。
       理由は 2 つ。(1) 書き出しを開くまで重い物を読み込まない。
       (2) 未実装の隣（export/mux/*.js 等）が在っても planExport と
       字幕書き出しは Node で試験できる（静的 import だと読み込み自体が失敗する）。
       CONTRACT-NOTE: 契約書 §5 は import の形を定めていないので、
       ここは「呼び出しの形は契約どおり・読み込みだけ遅延」にした。
     ・muxer / gif / project-file の関数名は契約書に無い（別担当）。
       在りそうな名前を順に探す小さな受け口（pick / callAny）を置き、
       見つからなければ **明確な message で throw** する。黙って無音や
       0 バイトの動画を返すより良い。
     ・失敗は握りつぶさない。ただし「音が作れない」程度は warnings に積んで
       映像だけでも渡す（書き出しが全部無駄になる方が損）。

   ★ 触るときの注意
     ・進捗は 200ms より短い間隔で必ず呼ぶ（契約書 §11.8）。重い所の前後で
       tick(..., true) を打つ。
     ・signal.aborted は各段の頭と 1 フレームごとに見る。中止時は encoder /
       recorder / VideoFrame を必ず閉じてから AbortError を投げる。
     ・VideoFrame は close() を忘れると数枚で GPU が詰まる（必ず finally）。
     ・ここに DOM の組み立て（ボタン・ダイアログ）は書かない。ui/export-*.js の仕事。
   ══════════════════════════════════════════════════════════════════════ */

import { scope } from "../core/log.js";
import { finite, clamp, clampInt, formatBytes, isIOS, sleep } from "../core/util.js";
import { frameStart } from "../core/time.js";

const L = scope("export");

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** 扱う容器。mp4/webm が動画、あとは派生の出口 */
export const CONTAINERS = ["mp4", "webm", "wav", "gif", "png", "jpeg"];

/** fps の許す範囲（契約書 §11.1 の 24〜60） */
export const FPS_MIN = 24;
export const FPS_MAX = 60;

/**
 * 1 画素 1 フレームあたりのビット数。
 * 1920*1080*30 * 0.193 ≒ 12.0Mbps（= 契約の「1080p30 で 12Mbps 目安」）。
 */
const BPP = 0.193;

/** 画質の段（契約書 §11.1 の 低/標準/高/最高） */
const QUALITY_GAIN = { low: 0.5, normal: 1, high: 1.6, max: 2.4 };

/** encodeQueueSize がこれを超えたら待つ（背圧） */
const MAX_QUEUE = 8;

/** キーフレームの間隔（秒） */
const KEY_INTERVAL = 2;

/** codec 短縮名 → WebCodecs の codec 文字列 */
export const CODEC_STRINGS = {
  avc: "avc1.640028",      // High profile / level 4.0（1080p まで）
  avcHigh: "avc1.640033",  // level 5.1（4K 用）
  vp9: "vp09.00.10.08",
  vp8: "vp8",
  av1: "av01.0.04M.08",
  aac: "mp4a.40.2",
  opus: "opus",
};

const MIME = {
  mp4: "video/mp4", webm: "video/webm", wav: "audio/wav",
  gif: "image/gif", png: "image/png", jpeg: "image/jpeg",
};
const EXT = { mp4: "mp4", webm: "webm", wav: "wav", gif: "gif", png: "png", jpeg: "jpg" };

/* ── 1. 失敗の形 ───────────────────────────────────────────────── */

/**
 * 書き出しの失敗。code で呼び出し側が分岐できる。
 * code: EMPTY_PROJECT EMPTY_RANGE BAD_FORMAT NO_CANVAS NO_ENCODER NO_RECORDER
 *       NO_MUXER MUXER_API NO_AUDIO NO_IMAGE NO_GIF NO_PROJECT_FILE FAILED
 */
export class ExportError extends Error {
  /** @param {string} message @param {string} [code] @param {any} [cause] */
  constructor(message, code = "FAILED", cause) {
    super(message);
    this.name = "ExportError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** 中止は DOMException("AbortError") に合わせる（fetch と同じ形で扱えるように） */
function abortError(msg = "書き出しを中止しました") {
  const D = globalThis.DOMException;
  if (typeof D === "function") {
    try { return new D(msg, "AbortError"); } catch (_e) { /* 古い実装 */ }
  }
  const e = new Error(msg);
  e.name = "AbortError";
  return e;
}

function isAbort(e) { return !!e && (e.name === "AbortError" || e.code === 20); }
function throwIfAborted(signal) { if (signal && signal.aborted) throw abortError(); }
function msgOf(e) { return e && e.message ? String(e.message) : String(e); }

/* ── 2. 小道具 ─────────────────────────────────────────────────── */

const nowMs = () =>
  (globalThis.performance && typeof globalThis.performance.now === "function")
    ? globalThis.performance.now() : Date.now();

/** module から在りそうな名前の関数を 1 つ拾う（別担当の命名差を吸う） */
function pick(mod, names) {
  if (!mod) return null;
  for (const n of names) if (typeof mod[n] === "function") return mod[n];
  const d = mod.default;
  if (d && typeof d === "object") for (const n of names) if (typeof d[n] === "function") return d[n];
  return null;
}

/** obj の在りそうな名前のメソッドを呼ぶ。無ければ明確に throw */
function callAny(obj, names, args, what) {
  for (const n of names) {
    if (obj && typeof obj[n] === "function") return obj[n].apply(obj, args || []);
  }
  throw new ExportError(`muxer に ${what} が在りません（${names[0]}() を期待しています）`, "MUXER_API");
}

/** 偶数に丸めて範囲に収める（符号化器は奇数の幅を嫌う） */
function evenClamp(v, lo, hi) {
  const n = clamp(Math.round(finite(v, lo)), lo, hi);
  const e = Math.round(n / 2) * 2;
  return clamp(e, lo, hi);
}

/** kbps で来た数（12000 等）を bps に直す。100kbps 未満の bps 指定は無いと見る */
function normBitrate(v) {
  const n = Math.round(finite(v, 0));
  if (n <= 0) return 0;
  return n < 100000 ? n * 1000 : n;
}

function round3(n) { return Math.round(finite(n, 0) * 1000) / 1000; }

/* ── 3. プロジェクトを測る ─────────────────────────────────────── */

/**
 * タイムラインの終わり（秒）。全トラックの clip の start+duration の最大。
 * 書き出す範囲の上限であり、presets の推薦にも使う。
 * @param {any} project @returns {number}
 */
export function projectDuration(project) {
  const tracks = project && Array.isArray(project.tracks) ? project.tracks : [];
  let end = 0;
  for (const tr of tracks) {
    if (!tr || !Array.isArray(tr.clips)) continue;
    for (const c of tr.clips) {
      if (!c) continue;
      const e = finite(c.start, 0) + Math.max(0, finite(c.duration, 0));
      if (e > end) end = e;
    }
  }
  return end;
}

/**
 * 映像/音の中身が在るか（推薦と「無音で書き出す」判断に使う）。
 * @param {any} project @returns {{visual:boolean, audio:boolean}}
 */
export function surveyMedia(project) {
  const tracks = project && Array.isArray(project.tracks) ? project.tracks : [];
  const assets = project && Array.isArray(project.assets) ? project.assets : [];
  const byId = new Map(assets.map((a) => [a && a.id, a]));
  let visual = false, audio = false;
  for (const tr of tracks) {
    if (!tr || !Array.isArray(tr.clips) || tr.hidden) continue;
    for (const c of tr.clips) {
      if (!c) continue;
      const k = c.kind;
      if (k === "video" || k === "image" || k === "text" || k === "shape" || k === "compound") visual = true;
      if (k === "audio") audio = true;
      if (k === "video" && !c.muteAudio) {
        const a = byId.get(c.assetId);
        if (!a || a.hasAudio !== false) audio = true;
      }
    }
  }
  return { visual, audio };
}

/* ── 4. planExport（純関数・試験する） ─────────────────────────── */

/** 範囲を project の尺に収める。空なら明確に throw */
function resolveRange(project, o) {
  const total = projectDuration(project);
  if (!(total > 0)) {
    throw new ExportError("プロジェクトに中身が在りません（クリップを置いてから書き出してください）", "EMPTY_PROJECT");
  }
  const r = o.range || null;
  let start = r && r.start !== undefined && r.start !== null ? finite(r.start, 0) : 0;
  let end = r && r.end !== undefined && r.end !== null ? finite(r.end, total) : total;
  if (start > end) { const t = start; start = end; end = t; }
  start = clamp(start, 0, total);
  end = clamp(end, 0, total);
  if (end - start <= 1e-6) {
    throw new ExportError("書き出す範囲が空です（イン点とアウト点を離してください）", "EMPTY_RANGE");
  }
  return { start: round3(start), end: round3(end) };
}

/** 解像度。片方だけ指定なら比率から出す。最後に必ず偶数へ */
function resolveSize(project, o, warnings) {
  const s = (project && project.settings) || {};
  const sw = evenClamp(finite(s.width, 1920), 16, 7680);
  const sh = evenClamp(finite(s.height, 1080), 16, 4320);
  const ratio = sw / sh;
  const want = (v) => (v === undefined || v === null || v === "source" ? 0 : Math.max(0, finite(v, 0)));
  let w = want(o.width), h = want(o.height);
  if (!w && !h) { w = sw; h = sh; }
  else if (!h) h = w / ratio;
  else if (!w) w = h * ratio;
  const width = evenClamp(w, 16, 7680);
  const height = evenClamp(h, 16, 4320);
  if (width * height > 3840 * 2160) {
    warnings.push("4K を超える解像度は端末によって符号化できません（失敗したら自動で実時間録画へ落ちます）");
  }
  return { width, height };
}

/** fps。24〜60 に収める（GIF だけ別の幅を許す） */
function resolveFps(project, o, warnings, mode) {
  const s = (project && project.settings) || {};
  const src = finite(s.fps, 30) > 0 ? finite(s.fps, 30) : 30;
  const raw = o.fps === undefined || o.fps === null || o.fps === "source" ? src : finite(o.fps, src);
  let fps = raw > 0 ? raw : src;
  if (mode === "gif") return round3(clamp(fps, 5, 30)); // GIF は 10/12/15 が常識（契約書 §11.4）
  if (fps < FPS_MIN) {
    warnings.push(`fps ${round3(fps)} は低すぎるので ${FPS_MIN} に上げました`);
    fps = FPS_MIN;
  } else if (fps > FPS_MAX) {
    warnings.push(`fps ${round3(fps)} は高すぎるので ${FPS_MAX} に下げました`);
    fps = FPS_MAX;
  }
  return round3(fps);
}

/**
 * 解像度と fps から映像ビットレート（bps）を出す。
 * 1080p30 ≒ 12Mbps。fps は 0.75 乗（60fps で 2 倍にはしない）。
 * @param {number} width @param {number} height @param {number} fps
 * @param {string} [quality] low|normal|high|max
 * @returns {number} bps（1kbps 単位）
 */
export function autoVideoBitrate(width, height, fps, quality) {
  const px = Math.max(256, finite(width, 1920) * finite(height, 1080));
  const f = finite(fps, 30) > 0 ? finite(fps, 30) : 30;
  const base = BPP * px * 30 * Math.pow(f / 30, 0.75);
  const gain = QUALITY_GAIN[String(quality || "normal")] || 1;
  return Math.round(clamp(base * gain, 200e3, 200e6) / 1000) * 1000;
}

/** 容器とコーデックの組み合わせを正す */
function resolveOutput(o, warnings) {
  let container = String(o.container || "auto").toLowerCase();
  let codec = String(o.codec || "auto").toLowerCase();
  if (container === "mkv" || container === "matroska") container = "webm";
  if (container === "jpg") container = "jpeg";
  if (container === "m4a" || container === "aac" || container === "mp3") {
    warnings.push(`${container} では書き出せないので wav にしました`);
    container = "wav";
  }
  if (container === "opus") container = "webm";
  if (codec === "h264" || codec === "avc1") codec = "avc";
  if (codec === "vp09") codec = "vp9";
  if (container === "auto") {
    container = (codec === "vp9" || codec === "vp8" || codec === "av1") ? "webm" : "mp4";
  }
  if (CONTAINERS.indexOf(container) < 0) {
    throw new ExportError(`知らない形式です: ${container}（${CONTAINERS.join("/")} のどれか）`, "BAD_FORMAT");
  }
  if (container === "mp4") {
    if (codec === "auto") codec = "avc";
    else if (codec === "vp9" || codec === "vp8" || codec === "av1") {
      warnings.push(`mp4 に ${codec} は入れられないので webm にしました`);
      container = "webm";
    }
  }
  if (container === "webm") {
    if (codec === "auto") codec = "vp9";
    else if (codec === "avc") {
      warnings.push("webm に H.264 は入れられないので VP9 にしました");
      codec = "vp9";
    }
  }
  if (container === "wav") codec = "pcm";
  if (container === "gif") codec = "gif";
  if (container === "png" || container === "jpeg") codec = container;
  return { container, codec };
}

/** 音の扱い。含める / 無音 / 音声のみ（契約書 §11.1） */
function resolveAudioMode(o, container) {
  if (container === "wav") return "only";
  if (container === "gif" || container === "png" || container === "jpeg") return "none";
  const a = o.audio;
  let v = typeof a === "string" ? a.toLowerCase() : a === false ? "none" : "include";
  if (v === "mute" || v === "silent" || v === "off" || v === "no") v = "none";
  if (v !== "none" && v !== "only") v = "include";
  return v;
}

/** WebCodecs が「在りそう」か（同期で分かる分だけ。確定は capabilities()） */
function preciseLikely() {
  return typeof globalThis.VideoEncoder === "function" && typeof globalThis.VideoFrame === "function";
}

/**
 * 書き出しの段取りを決める（**純関数**。DOM も await も無い）。
 * @param {any} project
 * @param {Object} [opts] range/width/height/fps/videoBitrate/audioBitrate/
 *   container/codec/mode/audio/quality/sequence/sampleRate
 * @returns {{width:number,height:number,fps:number,frames:number,
 *   range:{start:number,end:number},duration:number,mode:string,codec:string,
 *   container:string,audio:string,videoBitrate:number,audioBitrate:number,
 *   sampleRate:number,estimatedBytes:number,mime:string,warnings:string[]}}
 */
export function planExport(project, opts) {
  const o = opts || {};
  const warnings = [];
  const range = resolveRange(project, o);
  let { container, codec } = resolveOutput(o, warnings);
  const audio = resolveAudioMode(o, container);

  // 音声のみは容器を音の物へ寄せる（mp4 の音だけ = m4a は自前で作れない）
  if (audio === "only" && container !== "wav" && container !== "webm") {
    container = "wav";
    codec = "pcm";
  }

  const wantMode = String(o.mode || "auto").toLowerCase();
  let mode;
  if (container === "wav" || audio === "only") mode = "audio";
  else if (container === "gif") mode = "gif";
  else if (container === "png" || container === "jpeg") mode = "still";
  else if (wantMode === "precise" || wantMode === "realtime") mode = wantMode;
  else mode = preciseLikely() ? "precise" : "realtime";

  const size = mode === "audio" ? { width: 0, height: 0 } : resolveSize(project, o, warnings);
  const fps = mode === "audio" ? 0 : resolveFps(project, o, warnings, mode);
  const duration = round3(range.end - range.start);

  let frames = 0;
  if (mode === "still") frames = o.sequence ? Math.max(1, Math.round(duration * fps - 1e-6)) : 1;
  else if (mode !== "audio") {
    frames = Math.max(1, Math.round(duration * fps - 1e-6));
    if (duration * fps < 1) warnings.push("範囲が 1 フレームより短いので 1 枚だけ書き出します");
  }

  const videoBitrate = (mode === "audio" || mode === "still")
    ? 0
    : (normBitrate(o.videoBitrate) || autoVideoBitrate(size.width, size.height, fps, o.quality));
  let audioBitrate = 0;
  if (audio !== "none" && container !== "wav") {
    audioBitrate = clampInt(normBitrate(o.audioBitrate) || 192000, 32000, 512000);
  }
  const sampleRate = clampInt(
    finite(o.sampleRate, finite(project && project.settings && project.settings.sampleRate, 48000)),
    8000, 192000,
  );

  const plan = {
    width: size.width, height: size.height, fps, frames,
    range, duration, mode, codec, container, audio,
    videoBitrate, audioBitrate, sampleRate,
    estimatedBytes: 0,
    mime: MIME[container] || "application/octet-stream",
    warnings,
  };
  plan.estimatedBytes = estimateBytes(plan);
  if (plan.estimatedBytes > 2 * 1024 * 1024 * 1024) {
    warnings.push(`推定 ${formatBytes(plan.estimatedBytes)}。端末のメモリに乗り切らないことが在るので、範囲を分けるか画質を下げてください`);
  }
  if (container === "webm" && isIOS()) {
    warnings.push("iPhone / iPad では webm を再生できません（mp4 をおすすめします）");
  }
  return plan;
}

/** 出来上がりの大きさの目安（bytes） */
function estimateBytes(plan) {
  const dur = plan.duration;
  if (plan.mode === "audio") {
    if (plan.container === "wav") return Math.round(plan.sampleRate * 2 * 2 * dur) + 44;
    return Math.round((plan.audioBitrate || 128000) * dur / 8);
  }
  if (plan.mode === "still") return Math.round(plan.width * plan.height * 0.6 * plan.frames);
  if (plan.mode === "gif") return Math.round(plan.width * plan.height * 0.35 * plan.frames);
  return Math.round((plan.videoBitrate + plan.audioBitrate) * dur / 8 * 1.02);
}

/* ── 5. ファイル名 ─────────────────────────────────────────────── */

/** ファイル名に置けない文字（Windows / macOS / iOS の共通の最大公約数） */
const BAD_CHARS = /[\\/:*?"<>| -]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * プロジェクト名をファイル名の部品に直す（禁止文字は除去・空白は _）。
 * @param {*} s @returns {string}
 */
export function sanitizeName(s) {
  let t = String(s === undefined || s === null ? "" : s);
  try { t = t.normalize("NFC"); } catch (_e) { /* 古い実装では そのまま */ }
  t = t.replace(BAD_CHARS, "").replace(/\s+/g, "_").replace(/_{2,}/g, "_");
  t = t.replace(/^[._]+/, "").replace(/[._\s]+$/, "");
  if (t.length > 80) t = t.slice(0, 80).replace(/[._\s]+$/, "");
  if (RESERVED.test(t)) t = `_${t}`;
  return t;
}

function stampOf(at) {
  const d = at instanceof Date ? at : new Date(finite(at, Date.now()));
  const ok = Number.isFinite(d.getTime()) ? d : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${ok.getFullYear()}${p(ok.getMonth() + 1)}${p(ok.getDate())}-${p(ok.getHours())}${p(ok.getMinutes())}`;
}

/**
 * `<プロジェクト名>_<YYYYMMDD-HHmm>_<1080p>.mp4` を組む。
 * @param {any} project
 * @param {{height?:number,width?:number,container?:string,label?:string,at?:Date|number}} [opts]
 * @returns {string}
 */
export function buildFilename(project, opts) {
  const o = opts || {};
  const base = sanitizeName(project && project.name) || "無題のプロジェクト";
  const container = String(o.container || "mp4").toLowerCase();
  const h = Math.round(finite(o.height, 0));
  const label = o.label
    ? sanitizeName(o.label)
    : h > 0 ? `${h}p`
      : (container === "wav" || container === "webm") ? "audio" : "out";
  const ext = EXT[container] || sanitizeName(container) || "bin";
  return `${base}_${stampOf(o.at)}_${label || "out"}.${ext}`;
}

/* ── 6. 字幕（SRT / VTT。ほぼ純関数・試験する） ───────────────── */

/** 秒 → "00:00:01,500"（SRT）/ "00:00:01.500"（VTT） */
function subStamp(t, sep) {
  const ms = Math.max(0, Math.round(finite(t, 0) * 1000));
  const p2 = (n) => String(n).padStart(2, "0");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${p2(h)}:${p2(m)}:${p2(s)}${sep}${String(ms % 1000).padStart(3, "0")}`;
}

function cueText(clip) {
  const t = clip && clip.text && typeof clip.text.content === "string" ? clip.text.content : "";
  return t.replace(/\r\n?/g, "\n").split("\n").map((ln) => ln.replace(/[ \t]+$/, "")).join("\n").trim();
}

/**
 * text クリップから字幕の並びを作る（重なりは後ろを優先して前を詰める）。
 * @param {any} project @param {{trackId?:string}} [opts]
 * @returns {{start:number,end:number,text:string}[]}
 */
export function collectCues(project, opts) {
  const o = opts || {};
  const tracks = project && Array.isArray(project.tracks) ? project.tracks : [];
  const use = o.trackId ? tracks.filter((t) => t && t.id === o.trackId) : tracks;
  if (o.trackId && use.length === 0) {
    throw new ExportError(`字幕トラックが見つかりません: ${o.trackId}`, "BAD_FORMAT");
  }
  /** @type {{start:number,end:number,text:string}[]} */
  const cues = [];
  for (const tr of use) {
    if (!tr || !Array.isArray(tr.clips)) continue;
    for (const c of tr.clips) {
      if (!c || c.kind !== "text" || c.hidden) continue;
      const text = cueText(c);
      if (!text) continue;
      const start = Math.max(0, finite(c.start, 0));
      const end = Math.max(start + 0.1, start + Math.max(0, finite(c.duration, 0)));
      cues.push({ start, end, text });
    }
  }
  cues.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  // 重なりの始末: ほぼ同時に始まる物は 1 つに束ね、後ろに食い込む物は端を詰める
  const out = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && c.start - prev.start < 0.05) {
      prev.text = `${prev.text}\n${c.text}`;
      prev.end = Math.max(prev.end, c.end);
      continue;
    }
    const cur = { start: c.start, end: c.end, text: c.text };
    if (prev && prev.end > cur.start) {
      prev.end = cur.start;
      // 詰めたら消えてしまう物は 後ろの字幕へ合流させる（黙って落とさない）
      if (prev.end - prev.start < 0.05) {
        cur.text = `${prev.text}\n${cur.text}`;
        out.pop();
      }
    }
    out.push(cur);
  }
  return out;
}

function escapeVtt(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 字幕の本文を作る（純関数）。
 * SRT は "00:00:01,500"、VTT は "00:00:01.500" と WEBVTT の見出しが付く。
 * 改行は LF（CRLF でも読めるが、本文の \r と二重にならない方を採る）。
 * @param {any} project @param {{format?:string,trackId?:string}} [opts]
 * @returns {string}
 */
export function buildSubtitles(project, opts) {
  const o = opts || {};
  const format = String(o.format || "srt").toLowerCase();
  if (format !== "srt" && format !== "vtt") {
    throw new ExportError(`字幕の形式は srt か vtt です: ${format}`, "BAD_FORMAT");
  }
  const cues = collectCues(project, o);
  const sep = format === "srt" ? "," : ".";
  const blocks = cues.map((c, i) => {
    const time = `${subStamp(c.start, sep)} --> ${subStamp(c.end, sep)}`;
    const body = format === "vtt" ? escapeVtt(c.text) : c.text;
    return `${i + 1}\n${time}\n${body}`;
  });
  const head = format === "vtt" ? "WEBVTT\n\n" : "";
  if (blocks.length === 0) return head;
  return `${head}${blocks.join("\n\n")}\n`;
}

/**
 * 字幕ファイル（契約書 §11.5）。
 * @param {any} project @param {{format?:string,trackId?:string}} [opts] @returns {Blob}
 */
export function exportSubtitles(project, opts) {
  const o = opts || {};
  const format = String(o.format || "srt").toLowerCase();
  const text = buildSubtitles(project, o);
  const type = `${format === "vtt" ? "text/vtt" : "application/x-subrip"};charset=utf-8`;
  return new Blob([text], { type });
}

/* ── 7. EDL（編集内容の JSON。契約書 §11.7） ──────────────────── */

/**
 * 編集内容を 素材の実体抜きで書き出す（AI の再現・共有用）。
 * @param {any} project @returns {Object}
 */
export function buildEDL(project) {
  const p = project || {};
  const s = p.settings || {};
  const assets = Array.isArray(p.assets) ? p.assets : [];
  const nameOf = new Map(assets.map((a) => [a && a.id, a && a.name]));
  const num = (v, d) => round3(finite(v, d));
  return {
    kind: "vq-studio-edl",
    version: 1,
    generatedAt: new Date().toISOString(),
    project: { id: p.id || null, name: p.name || "", schema: finite(p.schema, 3) },
    settings: {
      width: finite(s.width, 1920), height: finite(s.height, 1080),
      fps: finite(s.fps, 30), ratio: s.ratio || "16:9", sampleRate: finite(s.sampleRate, 48000),
    },
    duration: round3(projectDuration(p)),
    assets: assets.map((a) => ({
      id: a && a.id, name: a && a.name, kind: a && a.kind,
      duration: num(a && a.duration, 0),
      width: finite(a && a.width, 0), height: finite(a && a.height, 0),
    })),
    tracks: (Array.isArray(p.tracks) ? p.tracks : []).map((tr) => ({
      id: tr && tr.id, kind: tr && tr.kind, name: tr && tr.name,
      muted: !!(tr && tr.muted), hidden: !!(tr && tr.hidden), volume: num(tr && tr.volume, 1),
      clips: (tr && Array.isArray(tr.clips) ? tr.clips : []).filter(Boolean).map((c) => ({
        id: c.id, kind: c.kind, name: c.name || "",
        assetId: c.assetId || null, asset: nameOf.get(c.assetId) || null,
        start: num(c.start, 0), duration: num(c.duration, 0),
        in: num(c.in, 0), out: num(c.out, 0),
        speed: num(c.speed, 1), reverse: !!c.reverse,
        volume: num(c.volume, 1), opacity: num(c.opacity, 1), blend: c.blend || "normal",
        text: c.text && typeof c.text.content === "string" ? c.text.content : null,
        transitionIn: c.transitionIn ? { type: c.transitionIn.type, duration: num(c.transitionIn.duration, 0) } : null,
        transitionOut: c.transitionOut ? { type: c.transitionOut.type, duration: num(c.transitionOut.duration, 0) } : null,
        source: c.source || null,
      })),
    })),
    markers: Array.isArray(p.markers) ? p.markers.filter(Boolean).map((m) => ({ id: m.id, t: num(m.t, 0), name: m.name || "" })) : [],
    chapters: Array.isArray(p.chapters) ? p.chapters.filter(Boolean).map((c) => ({ id: c.id, t: num(c.t, 0), title: c.title || "" })) : [],
  };
}

/** EDL を Blob で（拡張子は .json。人が読めるよう 2 空白で整える） */
export function exportEDL(project) {
  const json = JSON.stringify(buildEDL(project), null, 2);
  return new Blob([json], { type: "application/json;charset=utf-8" });
}

/* ── 8. capabilities（実際に聞いて確かめる） ──────────────────── */

const VIDEO_PROBES = [
  { id: "avc", codec: CODEC_STRINGS.avc },
  { id: "vp9", codec: CODEC_STRINGS.vp9 },
  { id: "av1", codec: CODEC_STRINGS.av1 },
  { id: "vp8", codec: CODEC_STRINGS.vp8 },
];
const AUDIO_PROBES = [
  { id: "aac", codec: CODEC_STRINGS.aac },
  { id: "opus", codec: CODEC_STRINGS.opus },
];
const RECORDER_PROBES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
  "video/webm",
  'audio/webm;codecs="opus"',
  "audio/mp4",
];

/**
 * この端末で何ができるかを **実際に聞いて**返す。
 * VideoEncoder.isConfigSupported / MediaRecorder.isTypeSupported を await する。
 * @returns {Promise<{webcodecs:{video:string[],audio:string[]},mediaRecorder:string[],
 *   preciseAvailable:boolean,containers:string[],notes:string[]}>}
 */
export async function capabilities() {
  const notes = [];
  const video = [];
  const audio = [];
  const mediaRecorder = [];

  const VE = globalThis.VideoEncoder;
  if (typeof VE === "function" && typeof VE.isConfigSupported === "function") {
    for (const p of VIDEO_PROBES) {
      try {
        const r = await VE.isConfigSupported({
          codec: p.codec, width: 1920, height: 1080, bitrate: 8e6, framerate: 30,
        });
        if (r && r.supported) video.push(p.id);
      } catch (_e) { /* 聞けない codec は無い物として扱う */ }
    }
  } else {
    notes.push("この端末は WebCodecs（VideoEncoder）に対応していません。実時間録画で書き出します");
  }

  const AE = globalThis.AudioEncoder;
  if (typeof AE === "function" && typeof AE.isConfigSupported === "function") {
    for (const p of AUDIO_PROBES) {
      try {
        const r = await AE.isConfigSupported({
          codec: p.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000,
        });
        if (r && r.supported) audio.push(p.id);
      } catch (_e) { /* 同上 */ }
    }
    if (audio.length === 0) notes.push("音声の符号化器が見つかりません（無音か wav になります）");
  }

  const MR = globalThis.MediaRecorder;
  if (typeof MR === "function" && typeof MR.isTypeSupported === "function") {
    for (const m of RECORDER_PROBES) {
      try { if (MR.isTypeSupported(m)) mediaRecorder.push(m); } catch (_e) { /* 同上 */ }
    }
  } else if (typeof MR === "function") {
    mediaRecorder.push("video/webm"); // isTypeSupported が無い実装（古い Safari）
    notes.push("MediaRecorder の対応形式を聞けませんでした（webm で試します）");
  } else {
    notes.push("この端末は MediaRecorder に対応していません");
  }

  const preciseAvailable = video.length > 0 && typeof globalThis.VideoFrame === "function";
  const containers = [];
  if (preciseAvailable && video.indexOf("avc") >= 0) containers.push("mp4");
  if (preciseAvailable && (video.indexOf("vp9") >= 0 || video.indexOf("vp8") >= 0)) containers.push("webm");
  for (const m of mediaRecorder) {
    if (m.indexOf("mp4") >= 0 && containers.indexOf("mp4") < 0) containers.push("mp4");
    if (m.indexOf("webm") >= 0 && containers.indexOf("webm") < 0) containers.push("webm");
  }
  for (const c of ["wav", "gif", "png", "jpeg"]) containers.push(c);
  if (!preciseAvailable && mediaRecorder.length === 0) {
    notes.push("動画として書き出せないので、静止画の連番と音声で書き出します");
  }
  return { webcodecs: { video, audio }, mediaRecorder, preciseAvailable, containers, notes };
}

/** 録画に使う mimeType を選ぶ（容器の希望を優先し、無ければ在る物） */
function pickRecorderMime(list, plan) {
  const want = plan.container === "webm" ? "webm" : "mp4";
  const other = want === "webm" ? "mp4" : "webm";
  const audioOnly = plan.mode === "audio";
  const pool = (list || []).filter((m) => (audioOnly ? m.indexOf("audio/") === 0 : m.indexOf("video/") === 0));
  const pref = pool.filter((m) => m.indexOf(want) >= 0);
  const alt = pool.filter((m) => m.indexOf(other) >= 0);
  return pref[0] || alt[0] || pool[0] || null;
}

/* ── 9. WAV（純粋なバイト列づくり。試験する） ─────────────────── */

function writeAscii(view, at, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i) & 0x7f);
}

/**
 * AudioBuffer → 16bit PCM の WAV。最終物なので 16bit で足りる
 * （編集の中間素材ではない。32bit float は容量が 2 倍になるだけ）。
 * @param {{sampleRate:number,numberOfChannels:number,length:number,
 *   getChannelData:(c:number)=>Float32Array}} buffer
 * @param {{startSample?:number,endSample?:number}} [sel]
 * @returns {Blob}
 */
export function encodeWav(buffer, sel) {
  if (!buffer || typeof buffer.getChannelData !== "function") {
    throw new ExportError("音のデータが在りません", "NO_AUDIO");
  }
  const o = sel || {};
  const sr = Math.max(1, Math.round(finite(buffer.sampleRate, 48000)));
  const ch = clampInt(finite(buffer.numberOfChannels, 2), 1, 8);
  const len = Math.max(0, Math.round(finite(buffer.length, 0)));
  const s0 = clampInt(finite(o.startSample, 0), 0, len);
  const s1 = clampInt(finite(o.endSample, len), s0, len);
  const n = s1 - s0;
  const bytes = 44 + n * ch * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  writeAscii(v, 0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  writeAscii(v, 8, "WAVE");
  writeAscii(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); // byte rate
  v.setUint16(32, ch * 2, true);      // block align
  v.setUint16(34, 16, true);          // bits
  writeAscii(v, 36, "data");
  v.setUint32(40, n * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let p = 44;
  for (let i = s0; i < s1; i++) {
    for (let c = 0; c < ch; c++) {
      const src = chans[c];
      const x = clamp(finite(src ? src[i] : 0, 0), -1, 1);
      v.setInt16(p, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
      p += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
