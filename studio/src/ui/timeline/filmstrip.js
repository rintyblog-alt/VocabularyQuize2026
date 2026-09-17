/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/filmstrip.js — クリップに敷く「映像の帯」

   ★ 何をする所か
     素材（video / image）から一定間隔のサムネを作り、頼まれた素材区間
     [from, to] を横につないだ 1 枚の canvas にして返す。タイムラインの
     クリップはこれを敷くだけで CapCut / Premiere のあの見た目になる。

   ★ なぜこの形か
     ・Worker が使えない（映像のデコードは main thread の <video> しか道が
       無い。契約書 §4）ので **<video> を 1 本だけ**使って順に seek する。
       何本も同時に seek させると iOS では確実に固まる。だから待ち行列を
       持ち、「今見えているクリップ」を先に処理する（priority が小さい方が先）。
     ・素材ごとに 1 枚の「シート」（サムネを格子に並べた canvas）を作り置き、
       表示用の帯はそこから切り出して合成する。区間や幅が変わる度に seek し
       直すのは論外（1 回の seek が数十〜数百 ms かかる）。
     ・シートは persist の putThumbSheet に保存し、次回は読むだけにする。
       格子の寸法は asset.duration / width / height から **決め打ちで再計算
       できる**ので、寸法を別に保存しなくても読み戻せる（保存形式が増えない）。
     ・1 行に並べると長尺で canvas の最大寸法（iOS は 4096〜8192px）を超える。
       なので 12 列で折り返した格子にする。
     ・strip() は **毎回新しい canvas を返す**。同じ素材・同じ区間のクリップが
       2 つ在るとき（複製したクリップ）に canvas を共有すると、後から挿した方に
       DOM が移動して片方の帯が消える。合成自体は drawImage 数回で安いので、
       作り置きするのは「シート」だけに留める。

   ★ 触るときの注意
     ・取得に失敗しても throw しない。asset の名前から作った安定した色の帯で
       代替する（真っ黒より、素材ごとに色が違う方が編集できる）。
       音だけの素材・asset が壊れている場合だけ null（呼び出し側が波形を出す）。
     ・prefetch() の戻りは待たなくて良い（失敗も飲み込む）。
     ・dispose() は <video> と objectURL を手放す。画面を捨てる時に必ず呼ぶ。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isIOS } from "../../core/util.js";
import { warn } from "../../core/log.js";

/* ── 寸法の決め打ち（ここを変えると保存済みシートは作り直しになる） ───── */
const SHEET_H = 72;          // シート内サムネの高さ(px)。画面では 40〜56 で使う
const GRID_COLS = 12;        // 格子の列数（折り返し）
const MAX_COLS = 240;        // 1 素材あたりのサムネ枚数の上限
const MIN_INTERVAL = 0.4;    // これより細かくは作らない(秒)
const META_TIMEOUT = 9000;
const SEEK_TIMEOUT = 4000;
const MAX_STRIP_W = 2048;    // 帯 1 枚の最大幅(CSS px)。これ以上は CSS で伸ばす

/* ── 純粋な計算（試験しやすいように export しておく） ─────────────── */

/** 素材の縦横比（分からなければ 16:9）。極端な値は切る */
export function aspectOf(asset) {
  const w = finite(asset && asset.width, 0);
  const h = finite(asset && asset.height, 0);
  if (w > 0 && h > 0) return clamp(w / h, 0.25, 4);
  return 16 / 9;
}

/** サムネ 1 枚の幅(px)。偶数に丸める（drawImage のにじみを減らす） */
export function thumbWidthOf(asset) {
  const w = Math.round(SHEET_H * aspectOf(asset) / 2) * 2;
  return clamp(w, 24, 320);
}

/** 何枚作るか。duration から決め打ちで出す（保存したシートを読み戻す鍵） */
export function colsFor(duration) {
  const d = finite(duration, 0);
  if (!(d > 0)) return 1;
  return Math.round(clamp(Math.round(d / MIN_INTERVAL), 1, MAX_COLS));
}

/** i 枚目のサムネを撮る素材時刻（区間の中央を撮る） */
export function sampleTime(i, cols, duration) {
  const d = finite(duration, 0);
  const n = Math.max(1, cols);
  if (!(d > 0)) return 0;
  return clamp(((i + 0.5) / n) * d, 0, Math.max(0, d - 1e-3));
}

/** 名前から安定した色を作る（取得に失敗した時の代替色帯） */
export function bandColors(asset) {
  const src = String((asset && (asset.name || asset.id)) || "vq");
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const hue = h % 360;
  const hue2 = (hue + 24) % 360;
  return [`hsl(${hue} 34% 26%)`, `hsl(${hue2} 30% 17%)`];
}

/* ── 小道具 ───────────────────────────────────────────────────── */

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function waitEvent(el, name, ms) {
  return new Promise((resolve) => {
    let done = false;
    const ok = () => { if (!done) { done = true; cleanup(); resolve(true); } };
    const ng = () => { if (!done) { done = true; cleanup(); resolve(false); } };
    const timer = setTimeout(ng, ms);
    function cleanup() {
      clearTimeout(timer);
      el.removeEventListener(name, ok);
      el.removeEventListener("error", ng);
    }
    el.addEventListener(name, ok, { once: true });
    el.addEventListener("error", ng, { once: true });
  });
}

async function blobToBitmap(blob) {
  if (!blob) return null;
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch (_e) { /* 次の手へ */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    const ok = await waitEvent(img, "load", META_TIMEOUT);
    if (!ok) return null;
    const c = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
    c.getContext("2d").drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/* ══════════════════════════════════════════════════════════════════════════
   本体
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} Filmstrip
 * @property {(asset:Object, opts?:Object)=>Promise<HTMLCanvasElement|null>} strip
 * @property {(asset:Object)=>Promise<void>} prefetch
 * @property {(assetId:string)=>void} clear
 * @property {()=>Object} stats
 * @property {()=>void} dispose
 */

/**
 * フィルムストリップ工房を作る。
 * @param {{storage?:Object|null}} [deps] storage は core/persist.js の Storage（無くても動く）
 * @returns {Filmstrip}
 */
export function createFilmstrip(deps) {
  const storage = (deps && deps.storage) || null;
  /** assetId → { state, sheet, cols, tw, th, promise } */
  const sheets = new Map();
  /** 待ち行列（優先度の小さい物から取り出す） */
  const queue = [];
  const counts = { built: 0, loaded: 0, failed: 0, composed: 0, seeks: 0 };
  let video = null;
  let running = false;
  let alive = true;

  /* ── <video> は 1 本だけ ─────────────────────────────────────── */
  function getVideo() {
    if (video) return video;
    const v = document.createElement("video");
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.crossOrigin = "anonymous";
    /* 画面には出さないが display:none だと iOS がデコードを省くことがある */
    v.style.cssText = "position:absolute;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(v);
    video = v;
    return v;
  }

  /* ── 待ち行列（1 件ずつ） ────────────────────────────────────── */
  function enqueue(job) {
    queue.push(job);
    pump();
    return job.promise;
  }

  async function pump() {
    if (running || !alive || !queue.length) return;
    running = true;
    queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    const job = queue.shift();
    try { job.resolve(await job.run()); }
    catch (e) { counts.failed++; warn("filmstrip", job.label, e); job.resolve(null); }
    finally {
      running = false;
      if (alive && queue.length) setTimeout(pump, 0);
    }
  }

  let seq = 0;
  function task(label, priority, run) {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return enqueue({ label, priority, seq: seq++, run, resolve, promise });
  }

  /* ── 素材の URL ─────────────────────────────────────────────── */
  async function urlOf(asset) {
    if (asset && typeof asset.url === "string" && asset.url) return { url: asset.url, release: null };
    const key = asset && asset.storage && asset.storage.key;
    if (!key || !storage) return { url: "", release: null };
    /* プロキシが在ればそちらが軽い（契約書 §3 の getProxyURL） */
    if (typeof storage.getProxyURL === "function") {
      try {
        const p = await storage.getProxyURL(asset.id);
        if (p) return { url: p, release: null };
      } catch (_e) { /* 本体で作り直す */ }
    }
    if (typeof storage.getAssetURL !== "function") return { url: "", release: null };
    try {
      const url = await storage.getAssetURL(key);
      const release = typeof storage.releaseAssetURL === "function" ? () => storage.releaseAssetURL(key) : null;
      return { url: url || "", release };
    } catch (_e) { return { url: "", release: null }; }
  }

  /* ── シートを作る ───────────────────────────────────────────── */
  function sheetGeometry(asset) {
    const cols = colsFor(asset.kind === "image" ? 0 : asset.duration);
    const tw = thumbWidthOf(asset);
    const rows = Math.ceil(cols / GRID_COLS);
    return { cols, tw, th: SHEET_H, rows, w: Math.min(cols, GRID_COLS) * tw, h: rows * SHEET_H };
  }

  function drawBand(ctx, x, y, w, h, asset) {
    const [a, b] = bandColors(asset);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  async function loadSheet(asset) {
    if (!storage || typeof storage.getThumbSheet !== "function") return null;
    let raw = null;
    try { raw = await storage.getThumbSheet(asset.id); } catch (_e) { return null; }
    if (!raw) return null;
    const geo = sheetGeometry(asset);
    /* ① Blob（普通はこちら） */
    if (typeof Blob !== "undefined" && raw instanceof Blob) {
      const bmp = await blobToBitmap(raw);
      if (!bmp) return null;
      const okW = Math.abs((bmp.width || 0) - geo.w) <= geo.tw;
      const okH = Math.abs((bmp.height || 0) - geo.h) <= geo.th;
      if (!okW || !okH) return null;   // 寸法が違う = 別の設定で作った物。捨てて作り直す
      counts.loaded++;
      return bmp;
    }
    /* ② ImageBitmap[]（契約書が許している形） */
    if (Array.isArray(raw) && raw.length) {
      const c = makeCanvas(geo.w, geo.h);
      const ctx = c.getContext("2d");
      for (let i = 0; i < Math.min(raw.length, geo.cols); i++) {
        const gx = (i % GRID_COLS) * geo.tw, gy = Math.floor(i / GRID_COLS) * geo.th;
        try { ctx.drawImage(raw[i], gx, gy, geo.tw, geo.th); } catch (_e) { drawBand(ctx, gx, gy, geo.tw, geo.th, asset); }
      }
      counts.loaded++;
      return c;
    }
    return null;
  }

  async function saveSheet(asset, canvas) {
    if (!storage || typeof storage.putThumbSheet !== "function") return;
    if (typeof canvas.toBlob !== "function") return;
    const blob = await new Promise((r) => { try { canvas.toBlob(r, "image/jpeg", 0.72); } catch (_e) { r(null); } });
    if (!blob) return;
    try { await storage.putThumbSheet(asset.id, blob); } catch (e) { warn("filmstrip", "シートを保存できません", e); }
  }

  async function buildImageSheet(asset) {
    const geo = sheetGeometry(asset);
    const c = makeCanvas(geo.w, geo.h);
    const ctx = c.getContext("2d");
    drawBand(ctx, 0, 0, geo.w, geo.h, asset);
    const got = await urlOf(asset);
    if (got.url) {
      const img = new Image();
      img.src = got.url;
      const ok = await waitEvent(img, "load", META_TIMEOUT);
      if (ok) {
        ctx.clearRect(0, 0, geo.w, geo.h);
        drawCover(ctx, img, 0, 0, geo.tw, geo.th);
        counts.built++;
      }
    }
    if (got.release) { try { got.release(); } catch (_e) { /* noop */ } }
    return c;
  }

  /** 中央を切り出して枠いっぱいに敷く（cover） */
  function drawCover(ctx, src, x, y, w, h) {
    const sw = src.videoWidth || src.naturalWidth || src.width || w;
    const sh = src.videoHeight || src.naturalHeight || src.height || h;
    if (!(sw > 0) || !(sh > 0)) return;
    const s = Math.max(w / sw, h / sh);
    const dw = sw * s, dh = sh * s;
    try { ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
    catch (_e) { /* 素材が読めない瞬間は空のままにする */ }
  }

  async function buildVideoSheet(asset) {
    const geo = sheetGeometry(asset);
    const c = makeCanvas(geo.w, geo.h);
    const ctx = c.getContext("2d");
    for (let i = 0; i < geo.cols; i++) {
      const gx = (i % GRID_COLS) * geo.tw, gy = Math.floor(i / GRID_COLS) * geo.th;
      drawBand(ctx, gx, gy, geo.tw, geo.th, asset);
    }
    const got = await urlOf(asset);
    if (!got.url) return c;

    const v = getVideo();
    let misses = 0;
    try {
      v.src = got.url;
      try { v.load(); } catch (_e) { /* noop */ }
      const meta = await waitEvent(v, "loadedmetadata", META_TIMEOUT);
      if (!meta) throw new Error("メタデータを読めません");
      /* iOS は 1 度 play() を通さないと seek しても絵が来ないことがある */
      if (isIOS()) {
        try { await v.play(); } catch (_e) { /* 自動再生が拒まれても続ける */ }
        try { v.pause(); } catch (_e) { /* noop */ }
      }
      const dur = finite(v.duration, 0) > 0 ? v.duration : finite(asset.duration, 0);
      for (let i = 0; i < geo.cols; i++) {
        if (!alive) break;
        const t = sampleTime(i, geo.cols, dur);
        try { v.currentTime = t; } catch (_e) { misses++; continue; }
        counts.seeks++;
        const ok = await waitEvent(v, "seeked", SEEK_TIMEOUT);
        if (!ok) { if (++misses >= 3) break; continue; }
        const gx = (i % GRID_COLS) * geo.tw, gy = Math.floor(i / GRID_COLS) * geo.th;
        ctx.save();
        ctx.beginPath();
        ctx.rect(gx, gy, geo.tw, geo.th);
        ctx.clip();
        ctx.clearRect(gx, gy, geo.tw, geo.th);
        drawCover(ctx, v, gx, gy, geo.tw, geo.th);
        ctx.restore();
      }
      counts.built++;
    } finally {
      try { v.removeAttribute("src"); v.load(); } catch (_e) { /* noop */ }
      if (got.release) { try { got.release(); } catch (_e) { /* noop */ } }
    }
    return c;
  }

  function ensureSheet(asset, priority) {
    const rec = sheets.get(asset.id);
    if (rec && rec.state === "ready") return Promise.resolve(rec.sheet);
    if (rec && rec.promise) return rec.promise;
    const geo = sheetGeometry(asset);
    const fresh = { state: "loading", sheet: null, cols: geo.cols, tw: geo.tw, th: geo.th, promise: null };
    sheets.set(asset.id, fresh);
    fresh.promise = (async () => {
      let sheet = null;
      try { sheet = await loadSheet(asset); } catch (_e) { sheet = null; }
      if (!sheet) {
        sheet = await task("sheet:" + asset.id, finite(priority, 0), async () => {
          const made = asset.kind === "image" ? await buildImageSheet(asset) : await buildVideoSheet(asset);
          if (made) { saveSheet(asset, made); }   // 保存は待たない
          return made;
        });
      }
      const cur = sheets.get(asset.id);
      if (!cur || cur !== fresh) return sheet;
      fresh.sheet = sheet;
      fresh.state = sheet ? "ready" : "failed";
      fresh.promise = null;
      return sheet;
    })();
    return fresh.promise;
  }

  /* ── 公開: 帯を 1 枚作る ─────────────────────────────────────── */
  async function strip(asset, opts) {
    if (!alive || !asset || typeof asset !== "object") return null;
    if (asset.kind === "audio") return null;          // 音は波形担当
    const o = opts || {};
    const height = clamp(Math.round(finite(o.height, 44)), 8, 240);
    const reqW = Math.round(finite(o.width, 160));
    const width = clamp(Math.min(reqW, MAX_STRIP_W), 8, MAX_STRIP_W);
    const dur = finite(asset.duration, 0);
    let from = Math.max(0, finite(o.from, 0));
    let to = finite(o.to, from + 1);
    if (!(to > from)) to = from + Math.max(0.1, dur || 1);
    if (asset.kind === "image") { from = 0; to = 1; }

    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    const c = makeCanvas(width * dpr, height * dpr);
    c.style.width = width + "px";
    c.style.height = height + "px";
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    /* まず代替の色帯を敷く（シートが間に合わなくても形になる） */
    drawBand(ctx, 0, 0, width, height, asset);

    const sheet = await ensureSheet(asset, o.priority);
    if (!alive) return null;
    if (!sheet) return c;                              // 色帯のまま返す

    const rec = sheets.get(asset.id);
    const cols = (rec && rec.cols) || colsFor(asset.duration);
    const tw = (rec && rec.tw) || thumbWidthOf(asset);
    const th = (rec && rec.th) || SHEET_H;
    const tileW = Math.max(8, Math.round(height * (tw / th)));
    const span = to - from;
    const useDur = asset.kind === "image" ? 1 : (dur > 0 ? dur : span);

    ctx.clearRect(0, 0, width, height);
    for (let x = 0; x < width; x += tileW) {
      const t = from + ((x + tileW / 2) / width) * span;
      const i = clamp(Math.floor((t / useDur) * cols), 0, cols - 1);
      const gx = (i % GRID_COLS) * tw, gy = Math.floor(i / GRID_COLS) * th;
      const w = Math.min(tileW, width - x);
      try { ctx.drawImage(sheet, gx, gy, tw * (w / tileW), th, x, 0, w, height); }
      catch (_e) { drawBand(ctx, x, 0, w, height, asset); }
    }
    counts.composed++;
    return c;
  }

  /* ── 公開: 先読み・破棄・統計 ────────────────────────────────── */
  async function prefetch(asset) {
    if (!alive || !asset || asset.kind === "audio") return;
    try { await ensureSheet(asset, 20); } catch (_e) { /* 先読みの失敗は黙る */ }
  }

  function clear(assetId) {
    if (!assetId) { sheets.clear(); return; }
    sheets.delete(String(assetId));
  }

  function stats() {
    let ready = 0, failed = 0;
    sheets.forEach((r) => { if (r.state === "ready") ready++; else if (r.state === "failed") failed++; });
    return {
      sheets: sheets.size, ready, failed, pending: queue.length, running,
      built: counts.built, loaded: counts.loaded, composed: counts.composed, seeks: counts.seeks
    };
  }

  function dispose() {
    alive = false;
    queue.splice(0, queue.length).forEach((j) => { try { j.resolve(null); } catch (_e) { /* noop */ } });
    sheets.clear();
    if (video) {
      try { video.removeAttribute("src"); video.load(); } catch (_e) { /* noop */ }
      if (video.parentNode) video.parentNode.removeChild(video);
      video = null;
    }
  }

  return { strip, prefetch, clear, stats, dispose };
}
