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
     ・CONTRACT-NOTE: このファイルは §0 の「700 行で分ける」を超えている。
       §11 の「漏れなく」（動画 2 系統 + 静止画 + 音声 + GIF + 字幕 +
       プロジェクト + EDL + 進捗/中止/wakeLock/共有）を 1 つの入口に
       揃えるのが今回の担当範囲で、分割先（export/render.js や
       export/mux/adapter.js）は他の担当のファイルになるため作らなかった。
       次に触る人が分けるなら境目はここ:
         §10-§12（stage / renderAt / mixAudio / loadMuxer）→ export/render.js
         §13-§15（runPrecise / runRealtime / renderStills）→ export/encode.js
       公開の export（§16）だけを このファイルに残せば 400 行を切る。
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
// 尺の数え方は core/schema.js が持つ物を借りる（下で再輸出する）
import { projectDuration } from "../core/schema.js";

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
 * タイムラインの終わり（秒）。書き出す範囲の上限であり、presets の推薦にも使う。
 * 実装は core/schema.js の物をそのまま使い、ここからも出し直す
 * （2 つ持つと「尺」の数え方が黙って食い違う。export と presets は
 *  ここから import するだけで済むよう再輸出しておく）。
 */
export { projectDuration };

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
const BAD_CHARS = /[\\/:*?"<>|]/g;
/** 制御文字。source に生の制御文字を残さないよう実行時に組む */
const CTRL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, "g");
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * プロジェクト名をファイル名の部品に直す（禁止文字は除去・空白は _）。
 * @param {*} s @returns {string}
 */
export function sanitizeName(s) {
  let t = String(s === undefined || s === null ? "" : s);
  try { t = t.normalize("NFC"); } catch (_e) { /* 古い実装では そのまま */ }
  // 空白（改行・タブ・全角空白も含む）を先に _ へ。後にすると
  // "行1\n行2" が "行1行2" と繋がって語が混ざる。
  t = t.replace(/\s+/g, "_").replace(BAD_CHARS, "").replace(CTRL_CHARS, "").replace(/_{2,}/g, "_");
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

/* ── 10. 描く支度（compositor / sources は動的に読む） ─────────── */

/** 進捗の窓口。100ms ごとに必ず呼ぶ（契約は「200ms 以内ごと」） */
function makeProgress(onProgress, frames) {
  const cb = typeof onProgress === "function" ? onProgress : null;
  const t0 = nowMs();
  let last = 0;
  return function tick(p, info, force) {
    if (!cb) return;
    const now = nowMs();
    if (!force && now - last < 100) return;
    last = now;
    const pr = clamp(finite(p, 0), 0, 1);
    const el = now - t0;
    const etaMs = pr > 0.002 && pr < 1 ? Math.max(0, Math.round(el / pr - el)) : null;
    const base = { frame: 0, frames, etaMs, stage: "prepare", elapsedMs: Math.round(el) };
    try { cb(pr, Object.assign(base, info || {})); } catch (e) { L.warn("onProgress が投げました", e); }
  };
}

/** 画面が寝ないようにする（出来なければ黙って諦める。契約書 §11.8） */
async function acquireWakeLock() {
  try {
    const n = globalThis.navigator;
    if (n && n.wakeLock && typeof n.wakeLock.request === "function") {
      return await n.wakeLock.request("screen");
    }
  } catch (_e) { /* 許可されない / 対応していないだけ */ }
  return null;
}

function releaseWakeLock(s) {
  try { if (s && typeof s.release === "function") s.release(); } catch (_e) { /* 既に外れている */ }
}

/** 描画先の canvas。realtime は captureStream が要るので DOM の canvas を選ぶ */
function createCanvas(w, h, needDom) {
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === "function") {
    const c = doc.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  if (!needDom && typeof globalThis.OffscreenCanvas === "function") return new globalThis.OffscreenCanvas(w, h);
  throw new ExportError("描画先の canvas を用意できませんでした（この環境では書き出せません）", "NO_CANVAS");
}

let evalMod = null;
/** core/eval.js（在れば使う。無ければ compositor に任せる） */
async function loadEval() {
  if (evalMod !== null) return evalMod;
  try { evalMod = await import("../core/eval.js"); } catch (_e) { evalMod = false; }
  return evalMod;
}

/**
 * 合成の一式を作る。opts で渡されていれば それを借りる（プレビューの物を
 * 使い回せば素材の decode をやり直さずに済む）。
 * 注意: canvas / compositor を借りると **大きさが書き出しの解像度に変わる**。
 * 借りた側（ui）は書き出しの後にプレビューを描き直すこと。
 */
async function makeStage(project, plan, opts) {
  const o = opts || {};
  const w = Math.max(2, Math.round(finite(plan.width, 1920)));
  const h = Math.max(2, Math.round(finite(plan.height, 1080)));
  const needDom = plan.mode === "realtime";
  const canvas = o.canvas || createCanvas(w, h, needDom);
  if (o.canvas && (canvas.width !== w || canvas.height !== h)) {
    try { canvas.width = w; canvas.height = h; } catch (e) { L.warn("借りた canvas の大きさを変えられません", e); }
  }
  let compositor = o.compositor || null;
  let ownComp = false;
  if (!compositor) {
    let mod;
    try { mod = await import("../engine/compositor.js"); }
    catch (e) { throw new ExportError("合成器（engine/compositor.js）を読み込めませんでした", "NO_CANVAS", e); }
    const make = pick(mod, ["createCompositor", "default"]);
    if (!make) throw new ExportError("createCompositor が見つかりませんでした", "NO_CANVAS");
    compositor = make(canvas, { preferGL: true });
    ownComp = true;
  }
  try { if (typeof compositor.resize === "function") compositor.resize(w, h); }
  catch (e) { L.warn("resize に失敗", e); }

  let sources = o.sources || null;
  let ownSrc = false;
  if (!sources) {
    let mod;
    try { mod = await import("../engine/sources.js"); }
    catch (e) { throw new ExportError("素材の供給（engine/sources.js）を読み込めませんでした", "NO_CANVAS", e); }
    const make = pick(mod, ["createSourcePool", "default"]);
    if (!make) throw new ExportError("createSourcePool が見つかりませんでした", "NO_CANVAS");
    sources = make({ storage: o.storage || null, project });
    ownSrc = true;
  } else if (typeof sources.setProject === "function") {
    try { sources.setProject(project); } catch (e) { L.warn("setProject に失敗", e); }
  }

  return {
    canvas, compositor, sources, width: w, height: h,
    dispose() {
      if (ownSrc && sources && typeof sources.dispose === "function") {
        try { sources.dispose(); } catch (_e) { /* 後片付けで落ちない */ }
      }
      if (ownComp && compositor && typeof compositor.dispose === "function") {
        try { compositor.dispose(); } catch (_e) { /* 同上 */ }
      }
    },
  };
}

/**
 * 1 フレームを確実に描く。
 * sources.seekExact でフレームを合わせてから compositor.renderFrame（契約書 §5）。
 */
async function renderAt(stage, project, t, signal) {
  throwIfAborted(signal);
  const s = stage.sources;
  if (s && typeof s.prepare === "function") {
    try { await s.prepare(t, { lookahead: 0, mode: "export" }); }
    catch (e) { L.warn("prepare に失敗（続けます）", e); }
  }
  const ev = await loadEval();
  if (ev && typeof ev.clipsAt === "function" && s && typeof s.seekExact === "function") {
    let list = [];
    try { list = ev.clipsAt(project, t) || []; } catch (e) { L.warn("clipsAt に失敗", e); }
    for (const r of list) {
      if (!r || !r.clip) continue;
      const k = r.clip.kind;
      if (k !== "video" && k !== "compound") continue;
      try { await s.seekExact(r); }
      catch (e) { L.warn("seekExact に失敗（前の絵で続けます）", e); }
    }
  }
  throwIfAborted(signal);
  await stage.compositor.renderFrame(project, t, {
    sources: s, quality: 1, overlays: false, forExport: true,
  });
}

/** canvas → Blob（OffscreenCanvas と DOM canvas の両方） */
async function canvasBlob(canvas, type, quality) {
  if (canvas && typeof canvas.convertToBlob === "function") {
    return await canvas.convertToBlob({ type, quality });
  }
  if (canvas && typeof canvas.toBlob === "function") {
    return await new Promise((res, rej) => {
      canvas.toBlob((b) => (b ? res(b) : rej(new ExportError("画像に変換できませんでした", "NO_IMAGE"))), type, quality);
    });
  }
  throw new ExportError("画像に変換できませんでした（canvas.toBlob が在りません）", "NO_IMAGE");
}

function normImageType(t) {
  const s = String(t || "image/png").toLowerCase();
  if (s === "jpeg" || s === "jpg" || s === "image/jpg") return "image/jpeg";
  if (s === "png") return "image/png";
  if (s === "webp") return "image/webp";
  if (s === "image/jpeg" || s === "image/png" || s === "image/webp") return s;
  return "image/png";
}

/* ── 11. 音（mixdown → wav / Opus） ───────────────────────────── */

/** engine/audio/mix.js の renderMixdown を呼ぶ（失敗しても映像は諦めない） */
async function mixAudio(project, plan, opts, warnings, tick) {
  if (plan.audio === "none") return null;
  let mod;
  try { mod = await import("../engine/audio/mix.js"); }
  catch (e) {
    warnings.push("音声の合成器（engine/audio/mix.js）を読み込めませんでした（無音で書き出します）");
    L.warn("mix.js 無し", e);
    return null;
  }
  const fn = pick(mod, ["renderMixdown", "default"]);
  if (!fn) {
    warnings.push("renderMixdown が見つかりませんでした（無音で書き出します）");
    return null;
  }
  try {
    // CONTRACT-NOTE: 契約書 §4 の renderMixdown は範囲の開始を受け取らない。
    // range/start も一緒に渡し、無視された（= 全体が返った）場合は
    // 下の pickAudioWindow で切り出す。どちらの実装でも音がずれない。
    return await fn(project, {
      sampleRate: plan.sampleRate,
      duration: plan.duration,
      start: plan.range.start,
      range: plan.range,
      onProgress: (p) => tick(0.02 + 0.12 * clamp(finite(p, 0), 0, 1), { stage: "audio" }),
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    warnings.push(`音声の合成に失敗しました（無音で書き出します）: ${msgOf(e)}`);
    return null;
  }
}

/**
 * mixdown の返り値から「書き出す範囲」の見本位置を決める。
 * 全体尺が返ってきた場合だけ range.start 分ずらす。
 */
function pickAudioWindow(buffer, plan) {
  const sr = Math.max(1, Math.round(finite(buffer.sampleRate, plan.sampleRate)));
  const len = Math.max(0, Math.round(finite(buffer.length, 0)));
  const need = Math.round(plan.duration * sr);
  const offset = (len > need + Math.round(0.25 * sr) && plan.range.start > 0)
    ? Math.round(plan.range.start * sr) : 0;
  const startSample = clampInt(offset, 0, len);
  const endSample = clampInt(startSample + (need > 0 ? need : len), startSample, len);
  return { startSample, endSample, sampleRate: sr };
}

/**
 * AudioBuffer を AudioEncoder へ少しずつ流す装置（背圧つき）。
 * 20ms ごとに f32-planar で渡す。timestamp は書き出しの頭を 0 とする。
 */
function makeAudioFeeder(buffer, enc, win, signal) {
  const sr = win.sampleRate;
  const ch = clampInt(finite(buffer.numberOfChannels, 1), 1, 2);
  const block = Math.max(128, Math.round(sr * 0.02));
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let pos = win.startSample;
  return {
    get done() { return pos >= win.endSample; },
    /** rel 秒（書き出しの頭から）まで流す。Infinity で最後まで */
    async upTo(rel) {
      const limit = rel === Infinity
        ? win.endSample
        : Math.min(win.endSample, win.startSample + Math.ceil(Math.max(0, rel) * sr));
      while (pos < limit) {
        throwIfAborted(signal);
        const n = Math.min(block, limit - pos);
        const planar = new Float32Array(n * ch);
        for (let c = 0; c < ch; c++) planar.set(chans[c].subarray(pos, pos + n), c * n);
        const ad = new globalThis.AudioData({
          format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: ch,
          timestamp: Math.round(((pos - win.startSample) / sr) * 1e6), data: planar,
        });
        try { enc.encode(ad); } finally { ad.close(); }
        pos += n;
        await drain(enc, MAX_QUEUE * 4, signal);
      }
    },
  };
}

/** encodeQueueSize が引くまで待つ（背圧。詰まったまま無限には待たない） */
async function drain(encoder, limit, signal) {
  let guard = 0;
  while (encoder && finite(encoder.encodeQueueSize, 0) > limit) {
    throwIfAborted(signal);
    await sleep(4);
    if (++guard > 5000) {
      L.warn("符号化の待ち行列が引きません（先へ進みます）");
      break;
    }
  }
}

/* ── 12. muxer の受け口 ───────────────────────────────────────── */

/**
 * export/mux/{mp4,webm}.js を読んで、addVideoChunk / addAudioChunk / finalize の
 * 3 つに揃えた小さな窓口を返す。
 * CONTRACT-NOTE: 契約書 §5 は muxer の関数名を定めていないので、
 * 在りそうな名前を順に探す。見つからなければ MUXER_API で throw。
 */
async function loadMuxer(container, cfg) {
  const path = container === "mp4" ? "./mux/mp4.js" : "./mux/webm.js";
  let mod;
  try { mod = await import(path); }
  catch (e) {
    throw new ExportError(`${container} の muxer（export/mux/${container}.js）を読み込めませんでした`, "NO_MUXER", e);
  }
  const names = container === "mp4"
    ? ["createMp4Muxer", "createMP4Muxer", "createMuxer", "default"]
    : ["createWebmMuxer", "createWebMMuxer", "createMuxer", "default"];
  const make = pick(mod, names);
  if (!make) throw new ExportError(`${container} の muxer に ${names[0]}() が在りません`, "MUXER_API");
  const m = make(cfg);
  if (!m || typeof m !== "object") throw new ExportError(`${container} の muxer を作れませんでした`, "MUXER_API");
  const mime = MIME[container];
  return {
    video(chunk, meta) {
      callAny(m, ["addVideoChunk", "addVideo", "writeVideoChunk"], [chunk, meta], "映像の受け口");
    },
    audio(chunk, meta) {
      callAny(m, ["addAudioChunk", "addAudio", "writeAudioChunk"], [chunk, meta], "音声の受け口");
    },
    async finish() {
      const r = await callAny(m, ["finalize", "finish", "close", "toBlob"], [], "finalize");
      return toBlob(r, mime);
    },
  };
}

/** muxer が返した物（Blob / バイト列 / {blob} / 配列）を Blob に揃える */
function toBlob(r, mime) {
  if (!r) throw new ExportError("muxer が空を返しました", "MUXER_API");
  if (typeof Blob !== "undefined" && r instanceof Blob) return r;
  if (r.blob && typeof Blob !== "undefined" && r.blob instanceof Blob) return r.blob;
  if (r instanceof ArrayBuffer || ArrayBuffer.isView(r)) return new Blob([r], { type: mime });
  if (Array.isArray(r)) return new Blob(r, { type: mime });
  if (r.buffer) return new Blob([r.buffer], { type: mime });
  throw new ExportError("muxer の返り値を読めませんでした", "MUXER_API");
}

/* ── 13. mode:"precise"（WebCodecs） ─────────────────────────── */

/** その解像度で通りそうな候補を並べる（4K は level を上げる） */
function videoConfigsFor(plan) {
  const px = plan.width * plan.height;
  const common = {
    width: plan.width, height: plan.height,
    bitrate: plan.videoBitrate, framerate: plan.fps,
    latencyMode: "quality",
  };
  const out = [];
  if (plan.codec === "avc") {
    const first = px > 1920 * 1088 ? CODEC_STRINGS.avcHigh : CODEC_STRINGS.avc;
    const second = px > 1920 * 1088 ? CODEC_STRINGS.avc : CODEC_STRINGS.avcHigh;
    out.push(Object.assign({ codec: first, avc: { format: "avc" } }, common));
    out.push(Object.assign({ codec: second, avc: { format: "avc" } }, common));
    out.push(Object.assign({ codec: "avc1.42E01E" }, common)); // Baseline（古い端末の最後の砦）
  } else if (plan.codec === "vp9") {
    out.push(Object.assign({ codec: CODEC_STRINGS.vp9 }, common));
    out.push(Object.assign({ codec: CODEC_STRINGS.vp8 }, common));
  } else if (plan.codec === "av1") {
    out.push(Object.assign({ codec: CODEC_STRINGS.av1 }, common));
    out.push(Object.assign({ codec: CODEC_STRINGS.vp9 }, common));
  } else {
    out.push(Object.assign({ codec: CODEC_STRINGS.vp8 }, common));
  }
  return out;
}

async function runPrecise(project, plan, opts, warnings, tick) {
  const signal = opts.signal;
  const VE = globalThis.VideoEncoder;
  if (typeof VE !== "function" || typeof globalThis.VideoFrame !== "function") {
    throw new ExportError("この端末は WebCodecs に対応していません", "NO_ENCODER");
  }
  tick(0.01, { stage: "prepare" }, true);

  let vconf = null;
  for (const c of videoConfigsFor(plan)) {
    try {
      const r = await VE.isConfigSupported(c);
      if (r && r.supported) { vconf = r.config || c; break; }
    } catch (_e) { /* 次の候補へ */ }
  }
  if (!vconf) {
    throw new ExportError(`この端末では ${plan.width}x${plan.height} の ${plan.codec} を符号化できません`, "NO_ENCODER");
  }

  const stage = await makeStage(project, plan, opts);
  /** @type {any[]} */
  const errs = [];
  let venc = null, aenc = null, mux = null;
  try {
    const buffer = await mixAudio(project, plan, opts, warnings, tick);
    throwIfAborted(signal);

    const AE = globalThis.AudioEncoder;
    const wantAudio = !!buffer && typeof AE === "function" && typeof globalThis.AudioData === "function";
    const win = buffer ? pickAudioWindow(buffer, plan) : null;
    const achannels = buffer ? clampInt(finite(buffer.numberOfChannels, 2), 1, 2) : 0;
    let aconf = null;
    if (wantAudio) {
      const cand = {
        codec: plan.container === "mp4" ? CODEC_STRINGS.aac : CODEC_STRINGS.opus,
        sampleRate: win.sampleRate, numberOfChannels: achannels,
        bitrate: plan.audioBitrate || 192000,
      };
      try {
        const sup = await AE.isConfigSupported(cand);
        if (sup && sup.supported) aconf = sup.config || cand;
      } catch (_e) { /* 下で warnings に積む */ }
      if (!aconf) warnings.push("この端末では音声を符号化できませんでした（無音で書き出します）");
    } else if (buffer) {
      warnings.push("AudioEncoder が無いので無音で書き出します");
    }

    mux = await loadMuxer(plan.container, {
      width: plan.width, height: plan.height, fps: plan.fps,
      videoCodec: vconf.codec, videoBitrate: plan.videoBitrate,
      audioCodec: aconf ? aconf.codec : null,
      sampleRate: aconf ? aconf.sampleRate : 0,
      numberOfChannels: aconf ? aconf.numberOfChannels : 0,
      audioBitrate: aconf ? aconf.bitrate : 0,
      duration: plan.duration,
    });

    venc = new VE({
      output: (chunk, meta) => { try { mux.video(chunk, meta); } catch (e) { errs.push(e); } },
      error: (e) => errs.push(e),
    });
    venc.configure(vconf);

    let feeder = null;
    if (aconf) {
      aenc = new AE({
        output: (chunk, meta) => { try { mux.audio(chunk, meta); } catch (e) { errs.push(e); } },
        error: (e) => errs.push(e),
      });
      aenc.configure(aconf);
      feeder = makeAudioFeeder(buffer, aenc, win, signal);
    }

    const frameUs = Math.round(1e6 / plan.fps);
    const keyEvery = Math.max(1, Math.round(plan.fps * KEY_INTERVAL));
    for (let i = 0; i < plan.frames; i++) {
      throwIfAborted(signal);
      if (errs.length) throw errs[0];
      const rel = frameStart(i, plan.fps);
      await renderAt(stage, project, plan.range.start + rel, signal);
      const frame = new globalThis.VideoFrame(stage.canvas, {
        timestamp: Math.round(rel * 1e6), duration: frameUs,
      });
      try { venc.encode(frame, { keyFrame: i % keyEvery === 0 }); }
      finally { frame.close(); }
      await drain(venc, MAX_QUEUE, signal);
      if (feeder) await feeder.upTo(rel + 0.5);
      tick(0.15 + 0.8 * ((i + 1) / plan.frames), { frame: i + 1, stage: "video" });
    }

    if (feeder) await feeder.upTo(Infinity);
    tick(0.96, { frame: plan.frames, stage: "mux" }, true);
    await venc.flush();
    if (aenc) await aenc.flush();
    if (errs.length) throw errs[0];
    const blob = await mux.finish();
    tick(0.99, { frame: plan.frames, stage: "finalize" }, true);
    return { blob, mime: blob.type || plan.mime, frames: plan.frames };
  } finally {
    try { if (venc && venc.state !== "closed") venc.close(); } catch (_e) { /* 既に閉じている */ }
    try { if (aenc && aenc.state !== "closed") aenc.close(); } catch (_e) { /* 同上 */ }
    stage.dispose();
  }
}

/* ── 14. mode:"realtime"（MediaRecorder） ────────────────────── */

function waitFrame(fps) {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === "function") return new Promise((res) => raf(() => res()));
  return sleep(Math.max(1, Math.round(1000 / (finite(fps, 30) || 30))));
}

async function runRealtime(project, plan, opts, warnings, tick, caps0) {
  const signal = opts.signal;
  const MR = globalThis.MediaRecorder;
  if (typeof MR !== "function") {
    throw new ExportError("この端末は MediaRecorder に対応していません", "NO_RECORDER");
  }
  const caps = caps0 || await capabilities();
  const mime = pickRecorderMime(caps.mediaRecorder, plan);
  if (!mime) throw new ExportError("録画できる形式が見つかりませんでした", "NO_RECORDER");
  if (mime.indexOf(plan.container) < 0) {
    warnings.push(`${plan.container} で録れないので ${mime.indexOf("webm") >= 0 ? "webm" : "mp4"} にしました`);
  }
  tick(0.02, { stage: "prepare" }, true);

  const stage = await makeStage(project, plan, opts);
  let rec = null, engine = opts.audioEngine || null, dest = null;
  try {
    if (typeof stage.canvas.captureStream !== "function") {
      throw new ExportError("canvas.captureStream に対応していないので実時間録画ができません", "NO_RECORDER");
    }
    const stream = stage.canvas.captureStream(plan.fps);
    if (plan.audio !== "none") {
      if (engine && engine.ctx && typeof engine.ctx.createMediaStreamDestination === "function") {
        try {
          dest = engine.ctx.createMediaStreamDestination();
          const from = engine.master || null;
          if (from && typeof from.connect === "function") from.connect(dest);
          for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
        } catch (e) {
          dest = null;
          warnings.push(`音声を録れませんでした（無音で書き出します）: ${msgOf(e)}`);
        }
      } else {
        warnings.push("音の engine（audioEngine）が渡されていないので無音で書き出します");
      }
    }

    /** @type {Blob[]} */
    const chunks = [];
    rec = new MR(stream, {
      mimeType: mime,
      videoBitsPerSecond: plan.videoBitrate || undefined,
      audioBitsPerSecond: plan.audioBitrate || undefined,
    });
    rec.ondataavailable = (e) => { if (e && e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res, rej) => {
      rec.onstop = () => res();
      rec.onerror = (e) => rej(new ExportError(`録画が止まりました: ${msgOf(e && e.error)}`, "NO_RECORDER", e));
    });
    rec.start(250);

    if (dest && engine) {
      try {
        if (typeof engine.setProject === "function") engine.setProject(project);
        if (typeof engine.prepare === "function") await engine.prepare(plan.range.start);
        if (typeof engine.start === "function") engine.start(plan.range.start);
      } catch (e) { warnings.push(`音の再生を始められませんでした: ${msgOf(e)}`); }
    }

    const t0 = nowMs();
    let frames = 0;
    for (;;) {
      throwIfAborted(signal);
      const el = (nowMs() - t0) / 1000;
      const t = plan.range.start + Math.min(el, plan.duration);
      await renderAt(stage, project, t, signal);
      frames++;
      tick(0.02 + 0.95 * clamp(el / plan.duration, 0, 1), { frame: frames, stage: "video" });
      if (el >= plan.duration) break;
      await waitFrame(plan.fps);
    }

    tick(0.98, { frame: frames, stage: "finalize" }, true);
    try { if (rec.state !== "inactive") rec.stop(); } catch (_e) { /* 既に止まっている */ }
    await stopped;
    for (const tr of stream.getTracks()) { try { tr.stop(); } catch (_e) { /* 同上 */ } }
    if (chunks.length === 0) throw new ExportError("録画の中身が空でした", "NO_RECORDER");
    const blob = new Blob(chunks, { type: mime });
    return { blob, mime, frames };
  } finally {
    try { if (rec && rec.state !== "inactive") rec.stop(); } catch (_e) { /* 同上 */ }
    if (engine && typeof engine.stop === "function") { try { engine.stop(); } catch (_e) { /* 同上 */ } }
    if (dest) { try { dest.disconnect(); } catch (_e) { /* 同上 */ } }
    stage.dispose();
  }
}

/* ── 15. 静止画の連番（最後の砦にもなる） ─────────────────────── */

/**
 * 範囲の絵を連番で作る。枚数が多すぎるときは間引く（メモリで落ちない方を採る）。
 * @returns {Promise<{filename:string,blob:Blob,frame:number,time:number}[]>}
 */
async function renderStills(project, plan, opts, warnings, tick, type) {
  const o = opts || {};
  const cap = clampInt(finite(o.maxStills, 600), 1, 3000);
  const step = plan.frames > cap ? Math.ceil(plan.frames / cap) : 1;
  if (step > 1) warnings.push(`静止画は ${step} フレームおきに書き出します（枚数が多すぎるため）`);
  const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  const base = sanitizeName(project && project.name) || "無題のプロジェクト";
  const quality = clamp(finite(o.quality, 0.92), 0.1, 1);
  const stage = await makeStage(project, plan, opts);
  const out = [];
  try {
    for (let i = 0; i < plan.frames; i += step) {
      throwIfAborted(o.signal);
      const rel = plan.frames === 1 ? 0 : frameStart(i, plan.fps);
      await renderAt(stage, project, plan.range.start + rel, o.signal);
      const blob = await canvasBlob(stage.canvas, type, quality);
      out.push({
        filename: `${base}_${String(i).padStart(5, "0")}.${ext}`,
        blob, frame: i, time: round3(plan.range.start + rel),
      });
      tick(0.05 + 0.9 * ((i + 1) / plan.frames), { frame: i + 1, stage: "still" });
    }
  } finally {
    stage.dispose();
  }
  return out;
}

/* ── 16. 公開の入口 ───────────────────────────────────────────── */

/** 実際に出来た mime から容器を言い当てる（realtime は希望と違う物が出る） */
function containerOfMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.indexOf("mp4") >= 0 || m.indexOf("quicktime") >= 0) return "mp4";
  if (m.indexOf("webm") >= 0 || m.indexOf("matroska") >= 0) return "webm";
  if (m.indexOf("wav") >= 0) return "wav";
  if (m.indexOf("gif") >= 0) return "gif";
  if (m.indexOf("jpeg") >= 0) return "jpeg";
  if (m.indexOf("png") >= 0) return "png";
  return null;
}

/**
 * 動画の書き出し（契約書 §5）。
 * @param {any} project
 * @param {Object} [opts] planExport の opts +
 *   onProgress(p, {frame,frames,etaMs,stage}) / signal / strict /
 *   canvas / compositor / sources / storage / audioEngine
 * @returns {Promise<{blob:Blob, mime:string, filename:string, frames:number,
 *   mode:string, warnings:string[], plan:Object, stills?:Array, audio?:Blob|null}>}
 */
export async function exportVideo(project, opts) {
  const o = opts || {};
  const plan = planExport(project, o);
  const warnings = plan.warnings.slice();
  const tick = makeProgress(o.onProgress, plan.frames);
  throwIfAborted(o.signal);
  tick(0, { stage: "prepare" }, true); // 押した瞬間に画面が反応するように

  const done = (r) => {
    const container = containerOfMime(r.mime) || plan.container;
    return {
      blob: r.blob,
      mime: r.mime || plan.mime,
      filename: buildFilename(project, {
        container, height: plan.height, label: o.filenameLabel, at: o.at,
      }),
      frames: finite(r.frames, plan.frames),
      mode: r.mode || plan.mode,
      warnings,
      plan,
      stills: r.stills || null,
      audio: r.audio === undefined ? null : r.audio,
    };
  };

  // 動画以外の道（音声のみ / GIF / 静止画）
  if (plan.mode === "audio") {
    const blob = await exportAudio(project, Object.assign({}, o, {
      range: plan.range,
      format: plan.container === "webm" ? "webm" : "wav",
      onProgress: (p) => tick(clamp(finite(p, 0), 0, 1), { stage: "audio" }),
      warningsOut: warnings,
    }));
    tick(1, { stage: "done" }, true);
    return done({ blob, mime: blob.type || plan.mime, frames: 0, mode: "audio" });
  }
  if (plan.mode === "gif") {
    const r = await runGif(project, plan, o);
    tick(1, { stage: "done" }, true);
    return done(Object.assign({ mode: "gif" }, r));
  }
  if (plan.mode === "still") {
    const type = normImageType(o.type || (plan.container === "jpeg" ? "image/jpeg" : "image/png"));
    const stills = await renderStills(project, plan, o, warnings, tick, type);
    tick(1, { stage: "done" }, true);
    return done({
      blob: stills[0] ? stills[0].blob : new Blob([], { type }),
      mime: type, frames: stills.length, mode: "still", stills,
    });
  }

  const wake = await acquireWakeLock();
  try {
    const caps = await capabilities();
    let order = plan.mode === "realtime" ? ["realtime", "precise"] : ["precise", "realtime"];
    if (order[0] === "precise" && !caps.preciseAvailable) {
      for (const n of caps.notes) warnings.push(n);
      order = ["realtime", "precise"];
    }
    if (o.strict) order = [plan.mode];

    let last = null;
    for (const m of order) {
      try {
        const r = m === "precise"
          ? await runPrecise(project, plan, o, warnings, tick)
          : await runRealtime(project, plan, o, warnings, tick, caps);
        tick(1, { frame: r.frames, stage: "done" }, true);
        return done(Object.assign({ mode: m }, r));
      } catch (e) {
        if (isAbort(e)) throw e;
        if (o.strict) throw e;
        last = e;
        warnings.push(`${m === "precise" ? "高精度（WebCodecs）" : "実時間（録画）"}の書き出しに失敗しました: ${msgOf(e)}`);
        L.warn(`${m} 失敗`, e);
      }
    }

    // どちらも駄目 → 手ぶらで帰さない（静止画の連番 + 音声）
    warnings.push("動画にできなかったので、静止画の連番と音声で書き出しました");
    try {
      const stills = await renderStills(project, plan, o, warnings, tick, "image/png");
      let audio = null;
      if (plan.audio !== "none") {
        try {
          audio = await exportAudio(project, Object.assign({}, o, {
            range: plan.range, format: "wav", onProgress: null, warningsOut: warnings,
          }));
        } catch (e) { warnings.push(`音声も書き出せませんでした: ${msgOf(e)}`); }
      }
      tick(1, { frame: stills.length, stage: "done" }, true);
      return done({
        blob: audio || (stills[0] ? stills[0].blob : new Blob([], { type: "image/png" })),
        mime: audio ? "audio/wav" : "image/png",
        frames: stills.length, mode: "stills", stills, audio,
      });
    } catch (e2) {
      if (isAbort(e2)) throw e2;
      throw new ExportError(`書き出せませんでした: ${msgOf(last || e2)}`, "FAILED", last || e2);
    }
  } finally {
    releaseWakeLock(wake);
  }
}

/**
 * 今のフレームを 1 枚（契約書 §5 / §11.2）。
 * @param {any} project @param {number} time 秒
 * @param {{width?:number,height?:number,type?:string,quality?:number,signal?:any,
 *   canvas?:any,compositor?:any,sources?:any,storage?:any}} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportStill(project, time, opts) {
  const o = opts || {};
  const warnings = [];
  const size = resolveSize(project, o, warnings);
  const total = projectDuration(project);
  const t = clamp(finite(time, 0), 0, Math.max(0, total));
  const type = normImageType(o.type);
  const stage = await makeStage(project, { width: size.width, height: size.height, mode: "still" }, o);
  try {
    await renderAt(stage, project, t, o.signal);
    return await canvasBlob(stage.canvas, type, clamp(finite(o.quality, 0.92), 0.1, 1));
  } finally {
    stage.dispose();
  }
}

/**
 * 音だけ（契約書 §5 / §11.3）。wav か webm(Opus)。
 * 契約どおり返り値は Blob なので、劣化（Opus が使えず wav にした等）を
 * 知りたい呼び出し側は `warningsOut: []` を渡すと そこへ積まれる。
 * @param {any} project
 * @param {{format?:string,container?:string,range?:Object,sampleRate?:number,
 *   audioBitrate?:number,onProgress?:Function,signal?:any,warningsOut?:string[]}} [opts]
 * @returns {Promise<Blob>}
 */
export async function exportAudio(project, opts) {
  const o = opts || {};
  const warnings = Array.isArray(o.warningsOut) ? o.warningsOut : [];
  const range = resolveRange(project, o);
  const fmt = String(o.format || o.container || "wav").toLowerCase();
  const plan = {
    mode: "audio",
    audio: "include",
    container: fmt === "webm" || fmt === "opus" ? "webm" : "wav",
    range,
    duration: round3(range.end - range.start),
    sampleRate: clampInt(
      finite(o.sampleRate, finite(project && project.settings && project.settings.sampleRate, 48000)),
      8000, 192000,
    ),
    audioBitrate: clampInt(normBitrate(o.audioBitrate) || 192000, 32000, 512000),
  };
  const tick = makeProgress(o.onProgress, 0);
  tick(0.01, { stage: "audio" }, true);
  const buffer = await mixAudio(project, plan, o, warnings, tick);
  if (!buffer || typeof buffer.getChannelData !== "function") {
    throw new ExportError("音を作れませんでした（素材に音が無いか、合成器が使えません）", "NO_AUDIO");
  }
  const win = pickAudioWindow(buffer, plan);
  if (plan.container === "webm") {
    try {
      const blob = await encodeAudioWebm(buffer, plan, win, o);
      tick(1, { stage: "done" }, true);
      return blob;
    } catch (e) {
      if (isAbort(e)) throw e;
      warnings.push(`Opus で書き出せなかったので wav にしました: ${msgOf(e)}`);
      L.warn("opus 失敗", e);
    }
  }
  const blob = encodeWav(buffer, win);
  tick(1, { stage: "done" }, true);
  return blob;
}

/** AudioEncoder(Opus) + webm muxer で音だけの webm を作る */
async function encodeAudioWebm(buffer, plan, win, opts) {
  const AE = globalThis.AudioEncoder;
  if (typeof AE !== "function" || typeof globalThis.AudioData !== "function") {
    throw new ExportError("AudioEncoder が在りません", "NO_ENCODER");
  }
  const ch = clampInt(finite(buffer.numberOfChannels, 2), 1, 2);
  const cand = {
    codec: CODEC_STRINGS.opus, sampleRate: win.sampleRate,
    numberOfChannels: ch, bitrate: plan.audioBitrate,
  };
  const sup = await AE.isConfigSupported(cand);
  if (!sup || !sup.supported) throw new ExportError("Opus で符号化できません", "NO_ENCODER");
  const conf = sup.config || cand;
  const mux = await loadMuxer("webm", {
    width: 0, height: 0, fps: 0, videoCodec: null, audioOnly: true,
    audioCodec: conf.codec, sampleRate: conf.sampleRate,
    numberOfChannels: conf.numberOfChannels, audioBitrate: conf.bitrate,
    duration: plan.duration,
  });
  const errs = [];
  const enc = new AE({
    output: (c, m) => { try { mux.audio(c, m); } catch (e) { errs.push(e); } },
    error: (e) => errs.push(e),
  });
  try {
    enc.configure(conf);
    const feeder = makeAudioFeeder(buffer, enc, win, opts.signal);
    await feeder.upTo(Infinity);
    await enc.flush();
    if (errs.length) throw errs[0];
    return await mux.finish();
  } finally {
    try { if (enc.state !== "closed") enc.close(); } catch (_e) { /* 既に閉じている */ }
  }
}

/** GIF（export/gif.js に任せる。契約書 §11.4） */
async function runGif(project, plan, opts) {
  let mod;
  try { mod = await import("./gif.js"); }
  catch (e) { throw new ExportError("GIF の書き出し（export/gif.js）が在りません", "NO_GIF", e); }
  const fn = pick(mod, ["exportGif", "encodeGif", "default"]);
  if (!fn) throw new ExportError("export/gif.js に exportGif() が在りません", "NO_GIF");
  const blob = await fn(project, Object.assign({}, opts, {
    width: plan.width, height: plan.height, fps: plan.fps,
    range: plan.range, frames: plan.frames,
  }));
  return { blob: toBlob(blob, MIME.gif), mime: "image/gif", frames: plan.frames };
}

/**
 * GIF を書き出す（exportVideo の container:"gif" と同じ）。
 * @param {any} project @param {Object} [opts] @returns {Promise<Object>}
 */
export async function exportGif(project, opts) {
  return await exportVideo(project, Object.assign({}, opts, { container: "gif" }));
}

/**
 * 連番の静止画（契約書 §11.2）。ZIP は作らず 1 枚ずつ返す。
 * @param {any} project @param {Object} [opts]
 * @returns {Promise<{filename:string,blob:Blob,frame:number,time:number}[]>}
 */
export async function exportStillSequence(project, opts) {
  const o = Object.assign({}, opts, { container: "png", sequence: true });
  const plan = planExport(project, o);
  const warnings = plan.warnings.slice();
  const tick = makeProgress(o.onProgress, plan.frames);
  const type = normImageType(o.type);
  const out = await renderStills(project, plan, o, warnings, tick, type);
  tick(1, { frame: out.length, stage: "done" }, true);
  return out;
}

/** .vqstudio（契約書 §11.6）。実体は export/project-file.js が持つ */
export async function exportProject(project, opts) {
  let mod;
  try { mod = await import("./project-file.js"); }
  catch (e) { throw new ExportError("プロジェクトの書き出し（export/project-file.js）が在りません", "NO_PROJECT_FILE", e); }
  const fn = pick(mod, ["exportProject", "packProject", "default"]);
  if (!fn) throw new ExportError("export/project-file.js に exportProject() が在りません", "NO_PROJECT_FILE");
  return await fn(project, opts || {});
}

/** .vqstudio の読み込み（契約書 §5） */
export async function importProject(blob, opts) {
  let mod;
  try { mod = await import("./project-file.js"); }
  catch (e) { throw new ExportError("プロジェクトの読み込み（export/project-file.js）が在りません", "NO_PROJECT_FILE", e); }
  const fn = pick(mod, ["importProject", "unpackProject", "default"]);
  if (!fn) throw new ExportError("export/project-file.js に importProject() が在りません", "NO_PROJECT_FILE");
  return await fn(blob, opts || {});
}

/**
 * 出来た物を利用者へ渡す（共有が在れば共有・無ければダウンロード）。
 * 契約書 §11.8 の「完了後の共有 / ダウンロード」。DOM が無ければ false。
 * @param {Blob} blob @param {string} filename @returns {Promise<boolean>}
 */
export async function deliver(blob, filename) {
  if (!blob) return false;
  const name = sanitizeName(filename) ? filename : "export.bin";
  const nav = globalThis.navigator;
  try {
    const F = globalThis.File;
    if (nav && typeof nav.share === "function" && typeof F === "function") {
      const file = new F([blob], name, { type: blob.type || "application/octet-stream" });
      if (typeof nav.canShare !== "function" || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: name });
        return true;
      }
    }
  } catch (e) {
    if (isAbort(e)) return false; // 利用者が共有を閉じただけ
    L.warn("共有できませんでした（ダウンロードに落ちます）", e);
  }
  const doc = globalThis.document;
  const URLc = globalThis.URL;
  if (!doc || !URLc || typeof URLc.createObjectURL !== "function") return false;
  const url = URLc.createObjectURL(blob);
  try {
    const a = doc.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    doc.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => { try { URLc.revokeObjectURL(url); } catch (_e) { /* 解放済み */ } }, 10000);
  }
  return true;
}
