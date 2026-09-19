/* ══════════════════════════════════════════════════════════════════════════
   studio/src/core/caps.js — この端末で本当に使える機能を 1 度だけ調べる

   ★ なぜ要るか
     「Safari には ctx.filter が無い」「iPhone には canvas.captureStream が無い」
     のような差を **各所で推測すると必ず食い違う**。調べる所を 1 箇所にし、
     画面・書き出し・素材・音は全部この結果を見て道を選ぶ。
   ★ 大事な作法
     ・UA 文字列で機能を決めない（iOS 判定は「触り方の既定値」にだけ使う）
     ・「在るか」ではなく「効くか」を試す（ctx.filter は画素で確かめる）
     ・重い調べ物（isConfigSupported）は await 版に分ける
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

let cached = null;

/** 同期で分かる物だけ（起動直後に呼べる） */
export function probeSync() {
  if (cached) return cached;
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const ua = String(nav.userAgent || "");
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  const webkit = /^((?!chrome|android).)*safari/i.test(ua) || iOS;

  const c = {
    /* 描画 */
    webgl2: hasWebGL2(),
    ctxFilter: ctxFilterWorks(),
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    /* 書き出し */
    captureStream: canCaptureStream(),
    mediaRecorder: typeof MediaRecorder !== "undefined",
    videoEncoder: typeof VideoEncoder !== "undefined",
    audioEncoder: typeof AudioEncoder !== "undefined",
    videoDecoder: typeof VideoDecoder !== "undefined",
    /* 素材と時計 */
    rvfc: typeof HTMLVideoElement !== "undefined" &&
      !!(HTMLVideoElement.prototype && HTMLVideoElement.prototype.requestVideoFrameCallback),
    webAudio: typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined",
    offlineAudio: typeof OfflineAudioContext !== "undefined",
    /* 保存 */
    indexedDB: hasIndexedDB(),
    opfs: !!(nav.storage && nav.storage.getDirectory),
    storageEstimate: !!(nav.storage && nav.storage.estimate),
    persistStorage: !!(nav.storage && nav.storage.persist),
    /* 端末と入力 */
    iOS,
    webkit,
    touch: (nav.maxTouchPoints || 0) > 0 || "ontouchstart" in window,
    vibrate: typeof nav.vibrate === "function" && !iOS,   /* iOS は無い */
    share: typeof nav.share === "function",
    wakeLock: !!(nav.wakeLock && nav.wakeLock.request),
    fullscreen: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
    eyeDropper: typeof window !== "undefined" && "EyeDropper" in window,
    faceDetector: typeof window !== "undefined" && "FaceDetector" in window,
    mediaDevices: !!(nav.mediaDevices && nav.mediaDevices.getUserMedia),
    dpr: Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1)
  };

  /* 使う側が迷わないように「方針」まで決めて渡す */
  c.videoPoolSize = c.iOS ? 2 : 4;
  c.renderBackend = c.webgl2 ? "webgl2" : "2d";
  c.realtimeExport = c.captureStream && c.mediaRecorder;   /* iPhone では false */
  c.preciseExport = c.videoEncoder;
  c.exportAudioPath = c.audioEncoder ? "webcodecs" : (c.mediaRecorder ? "mediarecorder" : "wav");
  c.seekTimeoutMs = c.iOS ? 1500 : 1000;
  c.needsGestureGuard = c.webkit;   /* gesturestart 等を止める必要がある */

  cached = c;
  return c;
}

/** 重い調べ物も含めた完全版（書き出し画面などで await して使う） */
export async function probe() {
  const c = Object.assign({}, probeSync());
  c.mediaRecorderTypes = supportedRecorderTypes();
  c.videoCodecs = await supportedVideoCodecs();
  c.audioCodecs = await supportedAudioCodecs();
  c.mp4Export = !!(c.videoCodecs.find((x) => x.indexOf("avc1") === 0)) ||
    c.mediaRecorderTypes.some((t) => t.indexOf("video/mp4") === 0);
  c.webmExport = !!(c.videoCodecs.find((x) => x.indexOf("vp") === 0)) ||
    c.mediaRecorderTypes.some((t) => t.indexOf("video/webm") === 0);
  cached = c;
  return c;
}

export function caps() { return cached || probeSync(); }
export function resetCaps() { cached = null; }

/* ── 個別の調べ物 ─────────────────────────────────────────────── */

function hasWebGL2() {
  try {
    const cv = document.createElement("canvas");
    cv.width = 1; cv.height = 1;
    return !!cv.getContext("webgl2");
  } catch (e) { return false; }
}

/** ctx.filter は「文字列を受け取るか」ではなく「効くか」で見る（Safari は受け取るが効かない） */
function ctxFilterWorks() {
  try {
    const cv = document.createElement("canvas");
    cv.width = 2; cv.height = 2;
    const ctx = cv.getContext("2d");
    if (!ctx || !("filter" in ctx)) return false;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);
    const src = document.createElement("canvas");
    src.width = 2; src.height = 2;
    const sctx = src.getContext("2d");
    sctx.fillStyle = "#ff0000";
    sctx.fillRect(0, 0, 2, 2);
    ctx.clearRect(0, 0, 2, 2);
    ctx.filter = "invert(1)";
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    const d = ctx.getImageData(0, 0, 1, 1).data;
    /* 赤を反転したら水色（0,255,255）になるはず */
    return d[0] < 80 && d[1] > 170 && d[2] > 170;
  } catch (e) { return false; }
}

function canCaptureStream() {
  try {
    const cv = document.createElement("canvas");
    cv.width = 8; cv.height = 8;
    if (typeof cv.captureStream !== "function") return false;
    const s = cv.captureStream(1);
    const tracks = s && s.getVideoTracks ? s.getVideoTracks() : [];
    const ok = tracks.length > 0;
    tracks.forEach((t) => { try { t.stop(); } catch (e) { /* noop */ } });
    return ok;
  } catch (e) { return false; }
}

function hasIndexedDB() {
  try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (e) { return false; }
}

function supportedRecorderTypes() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return [];
  return [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4",
    "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9",
    "video/webm;codecs=vp8", "video/webm", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"
  ].filter((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
}

async function supportedVideoCodecs() {
  if (typeof VideoEncoder === "undefined" || !VideoEncoder.isConfigSupported) return [];
  const want = [
    { codec: "avc1.42001f", width: 1280, height: 720 },
    { codec: "avc1.4d0034", width: 1920, height: 1080 },
    { codec: "vp09.00.10.08", width: 1280, height: 720 },
    { codec: "vp8", width: 1280, height: 720 },
    { codec: "av01.0.04M.08", width: 1280, height: 720 }
  ];
  const out = [];
  for (const w of want) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec: w.codec, width: w.width, height: w.height,
        bitrate: 4000000, framerate: 30
      });
      if (r && r.supported) out.push(w.codec);
    } catch (e) { /* この codec は無い */ }
  }
  return out;
}

async function supportedAudioCodecs() {
  if (typeof AudioEncoder === "undefined" || !AudioEncoder.isConfigSupported) return [];
  const want = ["mp4a.40.2", "opus"];
  const out = [];
  for (const codec of want) {
    try {
      const r = await AudioEncoder.isConfigSupported({
        codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000
      });
      if (r && r.supported) out.push(codec);
    } catch (e) { /* 無い */ }
  }
  return out;
}

/** 触覚（iOS には振動が無いので、必ず視覚の合図も添える） */
export function haptic(ms, visualEl) {
  const c = caps();
  if (c.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) { /* noop */ } }
  if (visualEl && visualEl.classList) {
    visualEl.classList.add("vqs-flash");
    setTimeout(() => { try { visualEl.classList.remove("vqs-flash"); } catch (e) { /* noop */ } }, 90);
  }
}

/** WebKit のページピンチズームを止める（タイムラインの親に付ける） */
export function guardGestures(el) {
  if (!el || !caps().needsGestureGuard) return () => {};
  const stop = (ev) => { ev.preventDefault(); };
  ["gesturestart", "gesturechange", "gestureend"].forEach((n) => el.addEventListener(n, stop, { passive: false }));
  return () => ["gesturestart", "gesturechange", "gestureend"].forEach((n) => el.removeEventListener(n, stop));
}
