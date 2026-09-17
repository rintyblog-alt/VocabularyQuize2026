/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/import.js — 素材の取り込み口（左パネルの入口）

   ★ 何をする所か
     ファイル選択 / ドラッグ＆ドロップ / 貼り付け（クリップボードの画像） /
     URL から、映像・画像・音を **プロジェクトの素材（Asset）** にする所。
     やる事は毎回この順:
       ① 種類を見分ける（対応していない形式はここで日本語の理由を付けて断る）
       ② 素材の情報を読む（<video>/<audio>/Image で 尺・寸法・音の有無）
       ③ storage.putAsset で実体を保存（同じ物は保存し直さない）
       ④ store.dispatch("asset.add") で project に載せる
       ⑤ サムネを 1 枚だけ作って storage.putThumbSheet へ
       ⑥ **解析は待たない**。1 件ずつ背後で analysis/index.js の analyzeAsset を
          回し、終わった物だけ asset.update で差し込む

   ★ なぜこの形か
     ・**解析を待つと取り込みが止まる**。4K の動画 1 本で 10 秒以上待たせる事に
       なるので、④ までを速く終わらせて画面に出し、⑥ は列（queue）に積む。
       同時に走らせない（契約書 §6 の analyzeAssets と同じ理由。iOS が溺れる）。
     ・**進捗は toast ではなく細い帯**（依頼の明文）。toast は作業の邪魔になるし
       消えてしまう。左パネル（#left）の一番上に 1 本だけ帯を挿す。
     ・widgets は受け取らない（app.js が渡す引数は store/storage/analysis だけ）。
       なので**知らせたい事は event にして出す**。toast を出すのは受け手
       （ui/library.js）の仕事。
     ・objectURL は「読む為に作った物」を必ず revoke する。iOS は巨大 Blob の
       URL を放置すると落ちる（契約書 §13.3）。

   ★ 触るときの注意
     ・DOM を作るのは進捗の帯と隠した <input> だけ。素材の見た目は library.js。
     ・例外は握りつぶさない。1 件の失敗で残りを止めず、返り値の errors に理由を
       日本語で入れる（呼ぶ側が出せる形）。
     ・§10 の「大きすぎる素材」の代理（プロキシ）は **画像だけ**実装した。
       動画の再エンコードはブラウザでは重く、書き出しの道（WebCodecs）を
       取り込みで使うと iOS で取り合いになる。動画は警告だけ出す（下の NOTE）。

   CONTRACT-NOTE: 依頼の `addFiles()` の返り値 `{added, skipped, errors}` は、
     数ではなく **配列**で返す（`added:[{assetId,name}]` 等）。理由を画面に出す
     には中身が要るため。数だけ欲しい所の為に `counts` も添える。
   CONTRACT-NOTE: このファイルは 700 行を超えている。作法は「超えたら分割」だが、
     担当ファイルは library.js と import.js の 2 つだけで、切り出し先
     （ui/import-meta.js など）を作ると「担当外のファイルを作らない」という
     上位の約束を破る。分ける切れ目は ①見分け（classifyFile / proxyPlan）
     ②素材の情報読み（readMeta 一式）③本体（createImporter）の 3 つで、
     依存は ③ → ②・① の一方向にしてある。分けて良い事になったら
     ① と ② をそのまま移すだけで済む。
   CONTRACT-NOTE: 動画のプロキシ（720p の軽い代理）は v1 では作らない。
     `storage.putProxy` は在るので、作れる様になったらここへ足すだけで済む
     （`proxyPlan()` が「作るべきか」を既に返している）。今は警告文で
     「代理はまだ作れない」と正直に伝える。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { finite, clamp, formatBytes, isIOS } from "../core/util.js";
import { warn, error } from "../core/log.js";

/* ── 0. 決め事 ──────────────────────────────────────────────────── */

/** file input の accept（依頼の明文） */
export const ACCEPT = "video/*,image/*,audio/*";
/** 字幕は別の入口（library.js のテキストタブ）から呼ぶ */
export const ACCEPT_SUBTITLE = ".srt,.vtt,text/vtt";
/** これより大きいと「重い」と伝える（300MB） */
export const BIG_BYTES = 300 * 1024 * 1024;
/** これより広いと「重い」と伝える（4K = 3840×2160 を超える） */
export const BIG_PIXELS = 3840 * 2160;
/** 素材の情報を読むのを諦める時間（4K HEVC の iPhone は遅い・契約書 §13.3） */
export const META_TIMEOUT_MS = 20000;
/** サムネの横幅（px）。1 枚だけ作る */
export const THUMB_W = 320;
/** fps を測る為に眺める枚数と、諦める時間 */
const FPS_FRAMES = 6;
const FPS_TIMEOUT_MS = 420;

/** 入れ物（コンテナ）としてブラウザが開けない拡張子 → 理由を日本語で */
const HOPELESS = Object.freeze({
  mkv: "Matroska（.mkv）はブラウザが開けない入れ物です。mp4 か webm に変換してから入れてください。",
  avi: ".avi は古い入れ物で、ブラウザは再生できません。mp4 に変換してください。",
  wmv: ".wmv は Windows 専用の入れ物です。mp4 に変換してください。",
  flv: ".flv は Flash 時代の入れ物です。mp4 に変換してください。",
  rm: ".rm / .rmvb はブラウザが開けません。mp4 に変換してください。",
  rmvb: ".rm / .rmvb はブラウザが開けません。mp4 に変換してください。",
  vob: ".vob（DVD）はブラウザが開けません。mp4 に変換してください。",
  mpg: ".mpg / .mpeg（MPEG-1/2）は多くのブラウザが開けません。mp4 に変換してください。",
  mpeg: ".mpg / .mpeg（MPEG-1/2）は多くのブラウザが開けません。mp4 に変換してください。",
  heic: "HEIC / HEIF（iPhone の写真形式）は、この画面では JPEG に変換できません。端末の設定で「互換性優先」にして撮り直すか、写真アプリで JPEG として書き出してから入れてください。",
  heif: "HEIC / HEIF（iPhone の写真形式）は、この画面では JPEG に変換できません。写真アプリで JPEG として書き出してから入れてください。",
  ai: "Illustrator の .ai は読めません。PNG か SVG で書き出してください。",
  psd: "Photoshop の .psd は読めません。PNG で書き出してください。",
  tiff: ".tiff は多くのブラウザが開けません。PNG か JPEG に変換してください。",
  tif: ".tiff は多くのブラウザが開けません。PNG か JPEG に変換してください。",
  wma: ".wma は Windows 専用の音です。m4a か mp3 に変換してください。",
  aiff: ".aiff は端末次第です。m4a か wav に変換してください。"
});

/** 拡張子 → 種類（mime が空の時の頼り。iOS の一部は mime を付けてこない） */
const BY_EXT = Object.freeze({
  mp4: "video", m4v: "video", mov: "video", webm: "video", ogv: "video", mpd: "video",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image",
  svg: "image", avif: "image",
  mp3: "audio", m4a: "audio", aac: "audio", wav: "audio", ogg: "audio", oga: "audio",
  opus: "audio", flac: "audio", weba: "audio", caf: "audio"
});

/** 「開けるかもしれないが端末次第」の物に添える一言 */
const MAYBE = Object.freeze({
  mov: "HEVC（H.265）で撮られた .mov は端末次第です。真っ黒になる場合は H.264 の mp4 に変換してください。",
  flac: ".flac は端末次第です（Safari は版によって開けません）。",
  ogv: ".ogv は Safari では開けません。",
  ogg: ".ogg は Safari では開けない事があります。",
  opus: ".opus は Safari の版次第です。",
  avif: ".avif は古い端末では開けません。",
  webm: ".webm は iPhone の古い版では開けません。"
});

/* ── 1. 見分ける（ここは純関数。試験する）────────────────────────── */

/** @param {string} name @returns {string} 小文字の拡張子（無ければ ""） */
export function extOf(name) {
  const s = String(name == null ? "" : name);
  const i = s.lastIndexOf(".");
  return i > 0 && i < s.length - 1 ? s.slice(i + 1).toLowerCase() : "";
}

/**
 * ファイル 1 つの種類と「入れられるか」を決める（DOM を触らない）。
 * @param {{name?:string, type?:string, size?:number}} file
 * @returns {{kind:"video"|"image"|"audio"|null, mime:string, name:string, ext:string,
 *            reason:string|null, note:string|null}}
 *   reason が入っていたら **入れない**（その文をそのまま画面に出せる）
 */
export function classifyFile(file) {
  const f = file && typeof file === "object" ? file : {};
  const name = String(f.name || "");
  const mime = String(f.type || "").toLowerCase();
  const ext = extOf(name);
  const out = { kind: null, mime, name, ext, reason: null, note: MAYBE[ext] || null };

  if (HOPELESS[ext]) { out.reason = HOPELESS[ext]; return out; }
  if (mime.indexOf("image/heic") === 0 || mime.indexOf("image/heif") === 0) {
    out.reason = HOPELESS.heic; return out;
  }
  if (mime.indexOf("video/") === 0) out.kind = "video";
  else if (mime.indexOf("audio/") === 0) out.kind = "audio";
  else if (mime.indexOf("image/") === 0) out.kind = "image";
  else if (BY_EXT[ext]) out.kind = BY_EXT[ext];

  /* 中身が空のファイル（iOS の「iCloud にしか無い写真」がこれになる） */
  if (out.kind && finite(f.size, 0) <= 0) {
    out.reason = "中身が空でした。iCloud や外部ドライブにしか無いファイルは、先に端末へ取り込んでから入れてください。";
    return out;
  }
  if (!out.kind) {
    out.reason = name
      ? `「${name}」は映像・画像・音のどれとしても読めませんでした（種類: ${mime || "不明"}）。`
      : "映像・画像・音のファイルを選んでください。";
  }
  return out;
}

/**
 * 「重すぎる素材」の見立て（取り込む前と後の両方で使う）。
 * @param {{size?:number,width?:number,height?:number,kind?:string}} meta
 * @returns {null|{level:"warn", why:string[], message:string, proxy:boolean}}
 */
export function proxyPlan(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const size = Math.max(0, finite(m.size, 0));
  const px = Math.max(0, finite(m.width, 0)) * Math.max(0, finite(m.height, 0));
  const why = [];
  if (size > BIG_BYTES) why.push(`容量が ${formatBytes(size)} あります`);
  if (px > BIG_PIXELS) why.push(`${Math.round(finite(m.width, 0))}×${Math.round(finite(m.height, 0))} は 4K より大きいです`);
  if (!why.length) return null;
  const kind = String(m.kind || "");
  const tail = kind === "image"
    ? "軽い代理（プロキシ）を作って、編集中はそちらを見ます。"
    : "編集中の再生がつかえる事があります。今の版では動画の代理（プロキシ）はまだ作れないので、書き出しの前に読み込み直す必要はありませんが、重い時は素材を短く切るか、720p に変換した物を入れてください。";
  return { level: "warn", why, proxy: kind === "image", message: `${why.join("・")}。${tail}` };
}

/**
 * 進捗の文（帯に出す 1 行）。
 * @param {{phase:string, done:number, total:number, name?:string}} p @returns {string}
 */
export function progressText(p) {
  const s = p && typeof p === "object" ? p : {};
  const total = Math.max(0, Math.round(finite(s.total, 0)));
  const done = clamp(Math.round(finite(s.done, 0)), 0, total || 0);
  const nm = String(s.name || "");
  const head = total > 1 ? `${done + (s.phase === "done" ? 0 : 1)} / ${total} 件` : "";
  if (s.phase === "done") return total ? `${total} 件を取り込みました` : "取り込みました";
  if (s.phase === "analyze") return `${nm ? nm + " を" : ""}解析しています…`;
  const what = s.phase === "read" ? "情報を読んでいます" : s.phase === "store" ? "保存しています" : "取り込んでいます";
  return [head, nm, what].filter(Boolean).join(" · ") + "…";
}

/* ── 2. 小さな道具（DOM を触る物はここから下）───────────────────── */

const EL = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
const msgOf = (e) => String((e && (e.message || e.reason)) || e || "原因不明");
const isAbort = (e) => !!e && (e.name === "AbortError" || /中止/.test(msgOf(e)));

/** objectURL を作って、必ず返す（finally で revoke するための対） */
function lease(blob) {
  let url = "";
  try { url = URL.createObjectURL(blob); } catch (e) { url = ""; }
  return { url, free() { if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } url = ""; } } };
}

/** media 要素の 1 つのイベントを待つ（時間切れで throw） */
function waitEvent(el, ok, ms, label) {
  return new Promise((resolve, reject) => {
    let t = 0;
    const done = (fn, arg) => {
      if (t) { clearTimeout(t); t = 0; }
      el.removeEventListener(ok, hitOk);
      el.removeEventListener("error", hitErr);
      fn(arg);
    };
    const hitOk = () => done(resolve, null);
    const hitErr = () => done(reject, new Error(`${label}を読めませんでした（形式が端末で開けない可能性があります）`));
    el.addEventListener(ok, hitOk, { once: true });
    el.addEventListener("error", hitErr, { once: true });
    t = setTimeout(() => done(reject, new Error(`${label}に時間がかかりすぎました（${Math.round(ms / 1000)} 秒）`)), ms);
  });
}

/** 絵が出るまで待つ（rVFC → 無ければ rAF 2 回。契約書 §13.3 の手順） */
function waitPainted(video) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    if (typeof video.requestVideoFrameCallback === "function") {
      try { video.requestVideoFrameCallback(() => fin()); } catch (e) { /* 下へ */ }
    }
    requestAnimationFrame(() => requestAnimationFrame(fin));
    setTimeout(fin, 900);
  });
}

/** canvas に描いて Blob にする（失敗は null。落とさない） */
function toBlob(canvas, type, q) {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob !== "function") { resolve(null); return; }
      canvas.toBlob((b) => resolve(b || null), type || "image/jpeg", q === undefined ? 0.78 : q);
    } catch (e) { resolve(null); }
  });
}

/** 描ける物（video/image/bitmap）を横 w に収めて描き、Blob を返す */
async function snapshot(src, sw, sh, w) {
  const width = Math.max(16, Math.min(finite(w, THUMB_W), 1024));
  const ratio = sh > 0 ? sh / sw : 0.5625;
  const cv = EL("canvas");
  cv.width = Math.round(width);
  cv.height = Math.max(16, Math.round(width * ratio));
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  try { ctx.drawImage(src, 0, 0, cv.width, cv.height); }
  catch (e) { return null; }           // 別ドメインの素材は汚れて描けない
  return toBlob(cv, "image/jpeg", 0.78);
}

/** 音の有無を当てる（分からない時は「在る」に倒す。無音でも困らない） */
function guessHasAudio(video) {
  if (typeof video.mozHasAudio === "boolean") return video.mozHasAudio;
  if (typeof video.webkitAudioDecodedByteCount === "number") return video.webkitAudioDecodedByteCount > 0;
  const tl = video.audioTracks;
  if (tl && typeof tl.length === "number") return tl.length > 0;
  return true;
}

/** 素材の fps を測る（測れなければ 0。0 のままでも他が既定で動く） */
async function measureFps(video) {
  if (typeof video.requestVideoFrameCallback !== "function") return 0;
  const times = [];
  let stop = null;
  try {
    video.muted = true;
    const p = video.play();
    if (p && typeof p.catch === "function") await p.catch(() => {});
  } catch (e) { return 0; }
  await new Promise((resolve) => {
    const t = setTimeout(resolve, FPS_TIMEOUT_MS);
    stop = () => { clearTimeout(t); resolve(); };
    const step = (_now, meta) => {
      times.push(finite(meta && meta.mediaTime, 0));
      if (times.length >= FPS_FRAMES) { stop(); return; }
      try { video.requestVideoFrameCallback(step); } catch (e) { stop(); }
    };
    try { video.requestVideoFrameCallback(step); } catch (e) { stop(); }
  });
  try { video.pause(); } catch (e) { /* noop */ }
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0.002 && d < 0.5) gaps.push(d);
  }
  if (gaps.length < 2) return 0;
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)];
  const fps = 1 / mid;
  /* 見慣れた値へ寄せる（29.97 と 30 を取り違えると seek が外れる） */
  const known = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120];
  for (const k of known) if (Math.abs(fps - k) / k < 0.04) return k;
  return fps > 1 && fps < 240 ? Math.round(fps * 1000) / 1000 : 0;
}

/**
 * 素材の情報とサムネを読む（実体は保存前の File/Blob から直に読む）。
 * @returns {Promise<{duration:number,width:number,height:number,fps:number,
 *                    hasAudio:boolean,rotation:number,thumb:Blob|null}>}
 */
async function readMeta(blob, kind, opts) {
  const o = opts || {};
  const L = lease(blob);
  if (!L.url) throw new Error("このファイルを開けませんでした");
  try {
    if (kind === "image") return await readImageMeta(blob, L.url);
    const el = document.createElement(kind === "audio" ? "audio" : "video");
    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.src = L.url;
    try { el.load(); } catch (e) { /* noop */ }
    await waitEvent(el, "loadedmetadata", META_TIMEOUT_MS, kind === "audio" ? "音の情報" : "映像の情報");
    const duration = Number.isFinite(el.duration) ? Math.max(0, el.duration) : 0;
    const out = {
      duration,
      width: kind === "audio" ? 0 : finite(el.videoWidth, 0),
      height: kind === "audio" ? 0 : finite(el.videoHeight, 0),
      fps: 0, rotation: 0,
      hasAudio: kind === "audio" ? true : guessHasAudio(el),
      thumb: null
    };
    if (kind === "video" && out.width > 0) {
      if (o.measureFps !== false) {
        try { out.fps = await measureFps(el); } catch (e) { out.fps = 0; }
      }
      try {
        el.currentTime = Math.min(duration > 0.4 ? 0.2 : 0, Math.max(0, duration - 0.05));
        await waitEvent(el, "seeked", 4000, "先頭の絵");
        await waitPainted(el);
        out.thumb = await snapshot(el, out.width, out.height, THUMB_W);
      } catch (e) { warn("import", "サムネを作れなかった（先へ進む）", msgOf(e)); }
    }
    /* iOS は <video> を放置すると溺れる（契約書 §13.3）。ここで必ず手放す */
    try { el.pause(); } catch (e) { /* noop */ }
    try { el.removeAttribute("src"); el.load(); } catch (e) { /* noop */ }
    return out;
  } finally { L.free(); }
}

/** 画像の寸法とサムネ（EXIF の向きは createImageBitmap に任せる） */
async function readImageMeta(blob, url) {
  let bmp = null;
  try {
    if (typeof createImageBitmap === "function") {
      bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    }
  } catch (e) { bmp = null; }
  if (bmp) {
    const out = {
      duration: 0, width: finite(bmp.width, 0), height: finite(bmp.height, 0),
      fps: 0, rotation: 0, hasAudio: false,
      thumb: await snapshot(bmp, bmp.width, bmp.height, THUMB_W)
    };
    try { bmp.close(); } catch (e) { /* noop */ }
    return out;
  }
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await waitEvent(img, "load", META_TIMEOUT_MS, "画像");
  const w = finite(img.naturalWidth, 0), h = finite(img.naturalHeight, 0);
  return {
    duration: 0, width: w, height: h, fps: 0, rotation: 0, hasAudio: false,
    thumb: await snapshot(img, w, h, THUMB_W)
  };
}

/** 画像の「軽い代理」（長辺 1920 まで落とす）。作れなければ null */
async function makeImageProxy(blob) {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const w = finite(bmp.width, 0), h = finite(bmp.height, 0);
    const side = Math.max(w, h);
    if (side <= 1920) { try { bmp.close(); } catch (e) { /* noop */ } return null; }
    const k = 1920 / side;
    const cv = EL("canvas");
    cv.width = Math.max(1, Math.round(w * k));
    cv.height = Math.max(1, Math.round(h * k));
    const ctx = cv.getContext("2d");
    if (ctx) ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    try { bmp.close(); } catch (e) { /* noop */ }
    return ctx ? await toBlob(cv, "image/jpeg", 0.86) : null;
  } catch (e) { return null; }
}

/* ── 3. 本体 ────────────────────────────────────────────────────── */

/**
 * 取り込み係を作る（契約書 §7・依頼書）。
 * @param {{store:Object, storage?:Object, analysis?:Object, els?:Object,
 *          host?:HTMLElement, widgets?:Object}} o
 * @returns {Object} Importer
 */
export function createImporter(o) {
  const opts = o && typeof o === "object" ? o : {};
  const store = opts.store;
  if (!store || typeof store.dispatch !== "function") {
    throw new Error("createImporter: store が要ります");
  }
  const storage = opts.storage || null;
  const analysisMod = opts.analysis || null;
  const listeners = new Map();          // name -> Set<fn>
  const cleanups = [];
  const state = {
    busy: false, runs: 0, done: 0, total: 0, name: "", phase: "idle",
    message: "", subP: 0,
    /** assetId -> { status, p } … 解析の進み具合（library.js が見る） */
    analysis: new Map(),
    queue: [], running: false, disposed: false
  };
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  let input = null, bar = null, barFill = null, barLabel = null, barRaf = 0;

  /* ── 3.1 知らせ（受け手は library.js）─────────────────────────── */
  function on(name, fn) {
    if (typeof fn !== "function") return () => {};
    const key = String(name || "");
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => { const s = listeners.get(key); if (s) s.delete(fn); };
  }
  function emit(name, detail) {
    const s = listeners.get(String(name || ""));
    if (s) for (const fn of Array.from(s)) {
      try { fn(detail); } catch (e) { error("import", `${name} の受け手で例外`, e); }
    }
    /* 画面全体にも流す（library.js が居なくても拾える様に） */
    try { document.dispatchEvent(new CustomEvent("vqs:import-" + name, { detail })); }
    catch (e) { /* noop */ }
  }

  /* ── 3.2 進捗の帯（左パネルの一番上・toast は使わない）────────── */
  function ensureBar() {
    if (bar || state.disposed) return bar;
    const host = opts.host || (opts.els && opts.els.left) || document.getElementById("left") || document.body;
    if (!host) return null;
    bar = EL("div", "vqs-importbar");
    bar.setAttribute("data-test", "import-bar");
    bar.setAttribute("aria-live", "polite");
    bar.hidden = true;
    barFill = EL("i", "vqs-importbar__fill");
    barLabel = EL("span", "vqs-importbar__label");
    bar.appendChild(barFill);
    bar.appendChild(barLabel);
    try { host.insertBefore(bar, host.firstChild); } catch (e) { host.appendChild(bar); }
    return bar;
  }
  /** 帯の書き換えは 1 フレーム 1 回（何十件も入れた時に描画で溺れない） */
  function paintBar() {
    barRaf = 0;
    if (!ensureBar()) return;
    const show = state.busy || state.phase === "error" ||
      state.phase === "done" || state.phase === "analyze";
    bar.hidden = !show;
    bar.dataset.phase = state.phase;
    if (!show) return;
    const total = Math.max(1, state.total);
    const p = state.phase === "analyze"
      ? clamp((state.done + finite(state.subP, 0)) / total, 0, 1)
      : clamp(state.done / total, 0, 1);
    if (barFill) barFill.style.width = Math.round(p * 100) + "%";
    if (barLabel) barLabel.textContent = state.message || progressText(state);
  }
  function tickBar() {
    if (barRaf || state.disposed) return;
    barRaf = requestAnimationFrame(paintBar);
  }
  function setPhase(phase, patch) {
    state.phase = phase;
    if (patch) Object.assign(state, patch);
    tickBar();
    emit("progress", {
      phase, done: state.done, total: state.total, name: state.name,
      message: state.message || progressText(state)
    });
  }

  /* ── 3.3 1 件を素材にする ────────────────────────────────────── */
  async function addOne(blob, info, addOpts) {
    const cls = classifyFile({ name: info.name, type: info.type || blob.type, size: blob.size });
    if (cls.reason) return { ok: false, skipped: true, name: cls.name || info.name, reason: cls.reason };

    state.name = cls.name;
    setPhase("read");
    let meta;
    try {
      meta = await readMeta(blob, cls.kind, { measureFps: addOpts.measureFps });
    } catch (e) {
      if (isAbort(e)) throw e;
      const tail = cls.note ? `（${cls.note}）` : "";
      return { ok: false, name: cls.name, message: `${msgOf(e)}${tail}` };
    }
    if (cls.kind !== "audio" && !(meta.width > 0) && !(meta.duration > 0)) {
      return { ok: false, name: cls.name, message: `「${cls.name}」の中身を読めませんでした${cls.note ? `（${cls.note}）` : ""}` };
    }

    setPhase("store");
    let put = { ok: false, key: null, reason: "保存庫が在りません" };
    if (storage && typeof storage.putAsset === "function") {
      try {
        put = await storage.putAsset(blob, { name: cls.name, mime: cls.mime || blob.type, kind: cls.kind });
      } catch (e) { put = { ok: false, key: null, reason: msgOf(e) }; }
    }
    if (!put.ok) {
      return { ok: false, name: cls.name, message: `「${cls.name}」を保存できませんでした: ${put.reason || "原因不明"}` };
    }
    /* 同じ実体を指す素材が既に居たら増やさない（二重に出さない） */
    const twin = (store.project.assets || []).find((a) => a && a.storage && a.storage.key === put.key);
    if (twin && put.dedup) {
      return { ok: true, dedup: true, assetId: twin.id, name: cls.name, kind: cls.kind };
    }

    const spec = {
      kind: cls.kind, name: cls.name, mime: cls.mime || String(blob.type || ""),
      size: Math.max(0, finite(blob.size, 0)),
      duration: cls.kind === "image" ? 0 : meta.duration,
      width: meta.width, height: meta.height, fps: meta.fps,
      hasAudio: cls.kind === "image" ? false : meta.hasAudio,
      rotation: meta.rotation,
      storage: put.storage || { kind: "idb", key: put.key }
    };
    let assetId = "";
    try {
      const r = store.dispatch("asset.add", { asset: spec });
      assetId = String((r && (r.assetId || r.id)) || "");
    } catch (e) {
      return { ok: false, name: cls.name, message: `「${cls.name}」を取り込めませんでした: ${msgOf(e)}` };
    }
    if (!assetId) return { ok: false, name: cls.name, message: `「${cls.name}」の登録に失敗しました` };

    /* サムネ（1 枚だけ）。失敗しても素材は在るので進む */
    if (meta.thumb && storage && typeof storage.putThumbSheet === "function") {
      try { await storage.putThumbSheet(assetId, meta.thumb); }
      catch (e) { warn("import", "サムネを保存できなかった", msgOf(e)); }
    }
    /* 重い素材の断り書き（画像だけ代理を作る。§NOTE） */
    const plan = proxyPlan({ size: spec.size, width: spec.width, height: spec.height, kind: cls.kind });
    if (plan) {
      emit("warning", { assetId, name: cls.name, message: `「${cls.name}」: ${plan.message}`, why: plan.why });
      if (plan.proxy && storage && typeof storage.putProxy === "function") {
        makeImageProxy(blob).then((px) => {
          if (px) return storage.putProxy(assetId, px);
          return null;
        }).catch((e) => warn("import", "代理を作れなかった", msgOf(e)));
      }
    }
    if (cls.note) emit("note", { assetId, name: cls.name, message: cls.note });

    /* 置き場所が指定されていたら（タイムラインへのドロップ）その場に置く */
    if (addOpts.place) {
      try {
        store.dispatch("clip.add", {
          trackId: addOpts.trackId || undefined,
          at: Math.max(0, finite(addOpts.at, 0)),
          assetId,
          duration: cls.kind === "image" ? finite(addOpts.imageDur, 4) : undefined
        });
      } catch (e) { warn("import", "タイムラインへ置けなかった", msgOf(e)); }
    }
    queueAnalysis(assetId);
    return { ok: true, assetId, name: cls.name, kind: cls.kind };
  }

  /* ── 3.4 まとめて取り込む ────────────────────────────────────── */
  /**
   * @param {FileList|File[]|Blob[]} fileList
   * @param {{at?:number, trackId?:string, place?:boolean, silent?:boolean}} [addOpts]
   * @returns {Promise<{added:Object[], skipped:Object[], errors:Object[], counts:Object}>}
   */
  async function addFiles(fileList, addOpts) {
    const ao = addOpts && typeof addOpts === "object" ? addOpts : {};
    const files = toArray(fileList);
    const out = { added: [], skipped: [], errors: [], counts: { added: 0, skipped: 0, errors: 0 } };
    if (!files.length) {
      emit("error", { message: "入れられるファイルが見つかりませんでした" });
      return finish(out);
    }
    if (state.busy) {
      /* 取り込み中の追加は列に積まず、そのまま続ける（数を足すだけ） */
      state.total += files.length;
    } else {
      state.busy = true; state.done = 0; state.total = files.length; state.message = "";
    }
    state.runs++;
    setPhase("read");
    for (const f of files) {
      if (state.disposed) break;
      try {
        const r = await addOne(f, { name: f.name || "", type: f.type || "" }, ao);
        if (r.ok) { out.added.push(r); if (!r.dedup) out.counts.added++; else out.skipped.push({ name: r.name, reason: "同じ素材が既に在ります" }); }
        else if (r.skipped) out.skipped.push({ name: r.name, reason: r.reason });
        else out.errors.push({ name: r.name, message: r.message });
      } catch (e) {
        if (isAbort(e)) break;
        out.errors.push({ name: String(f.name || ""), message: msgOf(e) });
        error("import", "取り込みで例外", e);
      }
      state.done++;
      tickBar();
    }
    out.counts.skipped = out.skipped.length;
    out.counts.errors = out.errors.length;
    if (!ao.silent) {
      if (out.skipped.length) emit("skipped", { items: out.skipped });
      if (out.errors.length) emit("error", { items: out.errors, message: out.errors[0].message });
    }
    return finish(out);
  }
  function finish(out) {
    state.runs = Math.max(0, state.runs - 1);
    if (state.runs > 0) { emit("added", out); return out; }   // 他の取り込みが続いている
    state.busy = false;
    state.name = "";
    state.message = "";
    setPhase(out.errors.length ? "error" : "done", { done: state.total });
    /* 帯は少し残してから畳む（何が入ったか読める時間） */
    setTimeout(() => { if (!state.busy && !state.disposed) { state.phase = "idle"; state.message = ""; tickBar(); } }, 2200);
    emit("added", out);
    return out;
  }
  const toArray = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v.length === "number") return Array.prototype.slice.call(v).filter(Boolean);
    return [v];
  };

  /* ── 3.5 解析の列（1 件ずつ・背後で）────────────────────────── */
  function queueAnalysis(assetId) {
    const id = String(assetId || "");
    if (!id || !analysisMod || typeof analysisMod.analyzeAsset !== "function") {
      if (id) { state.analysis.set(id, { status: "none", p: 0 }); emit("analysis", { assetId: id, status: "none", p: 0 }); }
      return;
    }
    if (state.analysis.has(id) && state.analysis.get(id).status !== "error") return;
    state.analysis.set(id, { status: "queued", p: 0 });
    state.queue.push(id);
    emit("analysis", { assetId: id, status: "queued", p: 0 });
    runQueue();
  }
  async function runQueue() {
    if (state.running || state.disposed) return;
    state.running = true;
    try {
      while (state.queue.length && !state.disposed) {
        const id = state.queue.shift();
        const asset = (store.project.assets || []).find((a) => a && a.id === id);
        if (!asset) { state.analysis.delete(id); continue; }
        state.analysis.set(id, { status: "running", p: 0 });
        emit("analysis", { assetId: id, status: "running", p: 0 });
        try {
          const res = await analysisMod.analyzeAsset(asset, {
            storage,
            signal: abort ? abort.signal : undefined,
            onProgress: (p) => {
              const v = clamp(finite(p, 0), 0, 1);
              state.analysis.set(id, { status: "running", p: v });
              state.subP = v;
              if (!state.busy) { state.phase = "analyze"; state.name = asset.name || ""; }
              emit("analysis", { assetId: id, status: "running", p: v });
            }
          });
          if (res) {
            try { store.dispatch("asset.update", { assetId: id, patch: { analysis: res } }); }
            catch (e) { warn("import", "解析結果を書き込めなかった", msgOf(e)); }
          }
          state.analysis.set(id, { status: "done", p: 1 });
          emit("analysis", { assetId: id, status: "done", p: 1 });
        } catch (e) {
          if (isAbort(e)) { state.analysis.set(id, { status: "queued", p: 0 }); break; }
          state.analysis.set(id, { status: "error", p: 0, message: msgOf(e) });
          emit("analysis", { assetId: id, status: "error", p: 0, message: msgOf(e) });
          warn("import", `素材 ${id} の解析を諦めた`, msgOf(e));
        }
      }
    } finally {
      state.running = false;
      state.subP = 0;
      if (!state.busy && state.phase === "analyze") { state.phase = "idle"; tickBar(); }
    }
  }

  /* ── 3.6 入口いろいろ ───────────────────────────────────────── */

  /** 隠した <input type=file>（iOS で複数選べるよう multiple を必ず付ける） */
  function ensureInput() {
    if (input) return input;
    input = EL("input", "vqs-hiddenfile");
    input.type = "file";
    input.multiple = true;
    input.accept = ACCEPT;
    input.setAttribute("data-test", "import-input");
    input.hidden = true;
    document.body.appendChild(input);
    return input;
  }
  /**
   * ファイルを選んでもらう。
   * @param {{accept?:string, multiple?:boolean, at?:number, trackId?:string, place?:boolean}} [pOpts]
   * @returns {Promise<Object>} addFiles と同じ形（選ばなかった時は空）
   */
  function pickFiles(pOpts) {
    const po = pOpts && typeof pOpts === "object" ? pOpts : {};
    const el = ensureInput();
    el.accept = po.accept || ACCEPT;
    el.multiple = po.multiple === false ? false : true;
    el.value = "";
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      el.onchange = () => {
        const files = el.files;
        el.onchange = null;
        if (!files || !files.length) { done({ added: [], skipped: [], errors: [], counts: { added: 0, skipped: 0, errors: 0 } }); return; }
        addFiles(files, po).then(done, (e) => {
          emit("error", { message: msgOf(e) });
          done({ added: [], skipped: [], errors: [{ name: "", message: msgOf(e) }], counts: { added: 0, skipped: 0, errors: 1 } });
        });
      };
      /* 取り消した時は change が来ない環境が在る。窓が戻ったら諦める */
      const bail = () => setTimeout(() => done({ added: [], skipped: [], errors: [], counts: { added: 0, skipped: 0, errors: 0 } }), 900);
      window.addEventListener("focus", bail, { once: true });
      try { el.click(); } catch (e) { emit("error", { message: "ファイル選択を開けませんでした" }); done({ added: [], skipped: [], errors: [], counts: { added: 0, skipped: 0, errors: 1 } }); }
    });
  }

  /**
   * URL から取り込む（CORS で拒まれたら、その旨をはっきり伝える）。
   * @param {string} url @param {Object} [aOpts] @returns {Promise<Object>}
   */
  async function addFromURL(url, aOpts) {
    const u = String(url || "").trim();
    if (!u) { emit("error", { message: "URL を入れてください" }); return { added: [], skipped: [], errors: [{ name: "", message: "URL が空です" }], counts: { added: 0, skipped: 0, errors: 1 } }; }
    let res = null;
    try {
      res = await fetch(u, { mode: "cors", credentials: "omit", signal: abort ? abort.signal : undefined });
    } catch (e) {
      const m = `この URL から取り込めませんでした。相手のサーバが別サイトからの読み込みを許していない（CORS）か、URL が間違っている可能性があります。ファイルを一度端末に保存してから入れてください。`;
      emit("error", { message: m });
      return { added: [], skipped: [], errors: [{ name: u, message: m }], counts: { added: 0, skipped: 0, errors: 1 } };
    }
    if (!res.ok) {
      const m = `この URL は ${res.status} を返しました（${res.statusText || "取得できません"}）。`;
      emit("error", { message: m });
      return { added: [], skipped: [], errors: [{ name: u, message: m }], counts: { added: 0, skipped: 0, errors: 1 } };
    }
    let blob;
    try { blob = await res.blob(); }
    catch (e) { const m = "中身を読めませんでした（途中で切れた可能性があります）"; emit("error", { message: m }); return { added: [], skipped: [], errors: [{ name: u, message: m }], counts: { added: 0, skipped: 0, errors: 1 } }; }
    let name = "";
    try { name = decodeURIComponent(new URL(u, location.href).pathname.split("/").pop() || ""); }
    catch (e) { name = ""; }
    const file = namedFile(blob, name || "取り込んだ素材", blob.type);
    return addFiles([file], aOpts);
  }

  /** Blob に名前を付ける（File が作れない環境では Blob に名前を生やす） */
  function namedFile(blob, name, type) {
    try { return new File([blob], name, { type: type || blob.type || "" }); }
    catch (e) {
      try { blob.name = name; } catch (e2) { /* noop */ }
      return blob;
    }
  }

  /**
   * ここへ落とせる様にする（左パネル・プレビュー・一覧などに付ける）。
   * @param {HTMLElement} el @returns {Function} 外す
   */
  function dropTarget(el, dOpts) {
    if (!el || !el.addEventListener) return () => {};
    let depth = 0;
    const over = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch (x) { /* noop */ }
      el.classList.add("vqs-dropover");
    };
    const enter = (e) => { if (hasFiles(e)) { depth++; over(e); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove("vqs-dropover"); };
    const drop = (e) => {
      depth = 0;
      el.classList.remove("vqs-dropover");
      if (!e.dataTransfer) return;
      const files = collectFiles(e.dataTransfer);
      const uri = readURI(e.dataTransfer);
      if (!files.length && !uri) return;
      e.preventDefault();
      if (files.length) addFiles(files, dOpts);
      else if (uri) addFromURL(uri, dOpts);
    };
    el.addEventListener("dragenter", enter);
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    const off = () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
    cleanups.push(off);
    return off;
  }
  const hasFiles = (e) => {
    const dt = e && e.dataTransfer;
    if (!dt) return false;
    const t = dt.types;
    if (!t) return false;
    const has = (n) => (typeof t.contains === "function" ? t.contains(n) : Array.prototype.indexOf.call(t, n) >= 0);
    return has("Files") || has("text/uri-list");
  };
  /** フォルダはまとめて入れられない（理由を出す） */
  function collectFiles(dt) {
    const out = [];
    let folder = false;
    const items = dt.items;
    if (items && items.length && typeof items[0].webkitGetAsEntry === "function") {
      for (const it of Array.prototype.slice.call(items)) {
        if (it.kind !== "file") continue;
        let entry = null;
        try { entry = it.webkitGetAsEntry(); } catch (e) { entry = null; }
        if (entry && entry.isDirectory) { folder = true; continue; }
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
    if (!out.length && dt.files && dt.files.length) out.push.apply(out, Array.prototype.slice.call(dt.files));
    if (folder) emit("skipped", { items: [{ name: "フォルダ", reason: "フォルダはまとめて入れられません。中のファイルを選んでください。" }] });
    return out;
  }
  function readURI(dt) {
    try {
      const s = dt.getData("text/uri-list") || dt.getData("text/plain") || "";
      const first = String(s).split(/[\r\n]+/).find((x) => /^https?:|^data:|^blob:/.test(x.trim()));
      return first ? first.trim() : "";
    } catch (e) { return ""; }
  }

  /**
   * 貼り付け。引数に ClipboardEvent が来たらそれを読み、来なければ
   * クリップボードを自分で読む（許されない環境では頼み方を伝える）。
   * @returns {Promise<Object|null>}
   */
  async function paste(ev) {
    const dt = ev && (ev.clipboardData || ev.originalEvent && ev.originalEvent.clipboardData);
    if (dt) {
      const files = collectFiles(dt);
      const uri = files.length ? "" : readURI(dt);
      if (!files.length && !uri) return null;
      if (ev.preventDefault) ev.preventDefault();
      return files.length ? addFiles(files, {}) : addFromURL(uri, {});
    }
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || !nav.clipboard || typeof nav.clipboard.read !== "function") {
      emit("error", { message: isIOS() ? "画面を長押しして「貼り付け」を選んでください。" : "Ctrl+V（Mac は ⌘V）で貼り付けてください。" });
      return null;
    }
    try {
      const items = await nav.clipboard.read();
      const files = [];
      for (const it of items) {
        const type = (it.types || []).find((t) => String(t).indexOf("image/") === 0);
        if (!type) continue;
        const blob = await it.getType(type);
        files.push(namedFile(blob, `貼り付けた画像.${String(type).split("/")[1] || "png"}`, type));
      }
      if (!files.length) { emit("error", { message: "クリップボードに画像が在りませんでした" }); return null; }
      return addFiles(files, {});
    } catch (e) {
      emit("error", { message: "クリップボードを読む許可が得られませんでした。Ctrl+V で貼り付けてください。" });
      return null;
    }
  }

  /* ── 3.7 外から来る合図 ─────────────────────────────────────── */
  /* タイムラインへのドロップ（ui/timeline/interact.js が出す） */
  const onTlDrop = (e) => {
    const d = (e && e.detail) || {};
    const files = toArray(d.files);
    if (!files.length) return;
    addFiles(files, { place: true, at: finite(d.t, 0), trackId: d.trackId || "" });
  };
  document.addEventListener("vqs:timeline-drop", onTlDrop);
  cleanups.push(() => document.removeEventListener("vqs:timeline-drop", onTlDrop));

  /* 画面のどこで貼り付けても効く（入力欄の中は邪魔しない） */
  const onPaste = (e) => {
    const t = e && e.target;
    if (t && t.closest && t.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;
    paste(e);
  };
  document.addEventListener("paste", onPaste);
  cleanups.push(() => document.removeEventListener("paste", onPaste));

  /* ── 3.8 外向きの形 ─────────────────────────────────────────── */
  return {
    pickFiles, addFiles, addFromURL, dropTarget, paste, on,
    /** 素材の解析状況（library.js が見た目に出す）@returns {{status:string,p:number}} */
    analysisState(assetId) {
      return state.analysis.get(String(assetId || "")) || { status: "none", p: 0 };
    },
    /** 解析し直す・未解析の素材をまとめて積む */
    analyze(assetIds) {
      const list = Array.isArray(assetIds) ? assetIds : [assetIds];
      for (const id of list) {
        state.analysis.delete(String(id || ""));
        queueAnalysis(id);
      }
      return state.queue.length;
    },
    /** 取り込み中か（library.js が二重に開かせない為） */
    get busy() { return state.busy; },
    get accept() { return ACCEPT; },
    dispose() {
      state.disposed = true;
      state.queue.length = 0;
      if (abort) { try { abort.abort(); } catch (e) { /* noop */ } }
      if (barRaf) { cancelAnimationFrame(barRaf); barRaf = 0; }
      for (const f of cleanups) { try { f(); } catch (e) { /* noop */ } }
      cleanups.length = 0;
      listeners.clear();
      if (input && input.parentNode) input.parentNode.removeChild(input);
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      input = bar = barFill = barLabel = null;
      return true;
    }
  };
}
