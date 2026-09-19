/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/view.js — タイムラインの「見せる」担当

   ★ 何をする所か
     store（契約書 §3）を読んで、下段のタイムラインを DOM に描く。
     目盛り（ルーラー）・トラック行・クリップの箱・フィルムストリップ・波形・
     キーフレームの菱形・遷移の印・再生ヘッド・吸着線・範囲選択の枠・
     ドラッグ中の影（ghost）まで、**見た目に関する事だけ**を持つ。
     触り方（ドラッグ・ピンチ・右クリック）は timeline/interact.js（C2 担当）。

   ★ なぜこの形か
     ・**クリップ 1 個 = DOM 要素 1 個。再描画で作り直さない。**
       clipId → 要素の Map を持ち、消えた物だけ remove する。数百クリップで
       innerHTML を作り直すと、選択状態も canvas も全部捨てる事になり、
       スクロールの度に画面が白くなる（体感で即座に分かるほど遅い）。
     ・要素の更新は「見た目に関わる値だけを並べた短い文字列（sig）」を作り、
       前回と同じなら **DOM を 1 つも触らない**。これで render() 全体を
       クリップ 200 個・トラック 8 本で 16ms 以内に収める。
     ・横位置は `transform: translateX()` だけで動かす（left を書くと毎回
       レイアウトが起きる）。再生ヘッドは 1 本の絶対配置要素で、動かす時に
       他を一切触らない。
     ・ルーラーは **画面幅ぶんの canvas を 1 枚**だけ持ち、スクロール量を
       translateX で打ち消して描き直す。目盛りを DOM にすると長編で数万個の
       要素が生まれて死ぬ。
     ・仮想化: 表示範囲 ±1 画面から外れたクリップは中身（フィルムストリップ /
       波形）を外し、軽い見た目（.vqs-clip--lite）に落とす。箱そのものは
       残す（作り直しの方が高い）。
     ・座標の約束（ここを間違えると全部ずれる）:
         timeToX / xToTime / trackRect / clipRect / setSnapLine / setMarquee
           … **内容座標**（#tlScroll の中身の原点から。トラックは y = ルーラー高から）
         hitTest / yToTrack
           … **画面座標**（PointerEvent の clientX/clientY をそのまま渡せる）
             内容座標で渡したい時は第 3 引数に { space: "content" }。

   ★ 触るときの注意
     ・ここは store を **読むだけ**。編集は必ず interact.js → store.dispatch。
       例外は view（playhead/zoom/scrollX）の保存で、これは undo に積まれない
       物なので store.setView で書き戻す（契約書 §3）。
     ・DOM の読み（scrollLeft / clientWidth）は render の先頭で 1 回だけ。
       以降は書くだけ（layout thrash を避ける）。
     ・まだ書かれていない部品（filmstrip / waveform / persist）が欠けても
       画面は成立させる。色帯と中心線で代替する。
     ・寸法（ルーラー高・行高・掴み代）は inline style で決め打ちする。
       hitTest が同じ数値で計算するので、CSS 側で height を上書きすると
       当たり判定がずれる（CSS 担当への申し送り事項）。
     ・組み立てに要る最小限の position だけ inline で入れてある（CSS が
       まだ無くても箱が並ぶように）。色・角丸・影・文字は全て CSS 側の
       仕事で、inline は付けていないので自由に上書きできる。

   CONTRACT-NOTE: このファイルは 700 行を超えている（作法は「超えたら分割」）。
     担当ファイルが view / filmstrip / waveform の 3 つに限定されており、
     分割先（ruler.js / clip-el.js）を作ると「担当外のファイルを作らない」
     という上位の約束を破るため、こちらを残した。分けるなら
     ①ルーラー描画 ②クリップ要素の組み立て ③座標と当たり判定 の 3 つが
     切れ目で、依存は view → ruler / clip-el の一方向で済む。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch, rafThrottle, cssVar } from "../../core/util.js";
import { toTC } from "../../core/time.js";
import { warn } from "../../core/log.js";
import { projectDuration, assetById } from "../../core/schema.js";
import { createFilmstrip } from "./filmstrip.js";
import { createWaveform } from "./waveform.js";

/* ── 決め打ちの寸法（hitTest と共有するのでここが唯一の出所） ───────── */
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 800;
export const ZOOM_DEFAULT = 80;
const ROW_H = 72, ROW_H_MOBILE = 56, ROW_GAP = 3, ROW_MIN = 28, ROW_MAX = 240;
const RULER_H = 28, RULER_H_MOBILE = 24;
const HANDLE_W = 12, HANDLE_W_TOUCH = 18;
/* 当たり判定は見た目より広く取る（行高 56px × 24px で 44px 規則を満たす。
   見た目まで 44px にすると短いクリップが掴み代で埋まって動かせない） */
const HANDLE_HIT = 12, HANDLE_HIT_TOUCH = 24;
const TRANS_MIN_W = 14, KEY_BAND = 14, TRANS_BAND = 16;
const TAIL_SEC = 2;          // 末尾に足す余白（秒）
const MEDIA_THROTTLE = 120;  // 中身（帯・波形）の作り直しを間引く間隔(ms)
const MEDIA_W_QUANT = 48;    // 幅の量子化。これ未満の変化では作り直さない
const MAX_KEYS = 40;         // 1 クリップに描く菱形の上限
const LABEL_MIN_PX = 64;     // タイムコードを出すのに要る間隔

/** 目盛りの段階（契約: 0.1 / 0.5 / 1 / 5 / 10 / 30 / 1m …） */
export const TICK_STEPS = Object.freeze([0.1, 0.5, 1, 5, 10, 30, 60, 300, 600, 1800, 3600]);

/* ══ 純粋な計算（DOM を触らない。試験できる形にしておく） ══════════════ */

/**
 * ズーム（px/秒）から目盛りの間隔（秒）を選ぶ。
 * 「ラベルが最低 minPx 離れる一番細かい段階」を採る。
 * @param {number} pxPerSec @param {number} [minPx=64] @returns {number}
 */
export function pickTickStep(pxPerSec, minPx) {
  const z = Math.max(0.01, finite(pxPerSec, ZOOM_DEFAULT));
  const need = Math.max(8, finite(minPx, LABEL_MIN_PX));
  for (let i = 0; i < TICK_STEPS.length; i++) {
    if (TICK_STEPS[i] * z >= need) return TICK_STEPS[i];
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/** 目盛りの細かい線の間隔。入らなければ 0（描かない） */
export function pickSubStep(step, pxPerSec) {
  const z = Math.max(0.01, finite(pxPerSec, ZOOM_DEFAULT));
  const div = step >= 60 ? 6 : step >= 10 ? 5 : step >= 1 ? 5 : 5;
  const sub = step / div;
  return sub * z >= 6 ? sub : 0;
}

/**
 * 目盛りの文字。細かい段階では「秒.小数」、粗い段階では mm:ss / h:mm:ss。
 * @param {number} t @param {number} step @param {number} fps @returns {string}
 */
export function tickLabel(t, step, fps) {
  const n = finite(t, 0);
  if (step < 1) {
    const s = Math.floor(n);
    const f = Math.round((n - s) * 10);
    return n < 60 ? `${s}.${f}` : toTC(n, fps, { compact: true });
  }
  if (step < 60) return toTC(n, fps, { compact: true }).replace(/\.\d+$/, "");
  const m = Math.round(n / 60);
  return m % 60 === 0 && m >= 60 ? `${m / 60}h` : `${m}m`;
}

/** 文字列から安定した色相（グループ帯・代替色） */
export function hueOf(s) {
  const src = String(s == null ? "" : s);
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h % 360;
}

/** クリップに出す小さな印（速度・音量・効果…）。多すぎると読めないので 4 つまで */
export function clipBadges(clip) {
  const out = [];
  const sp = finite(clip.speed, 1);
  if (Math.abs(sp - 1) > 0.001) out.push(["speed", (sp < 10 ? sp.toFixed(sp % 1 ? 1 : 0) : Math.round(sp)) + "×"]);
  if (clip.reverse) out.push(["reverse", "逆"]);
  if (clip.muteAudio) out.push(["mute", "消音"]);
  else if (Math.abs(finite(clip.volume, 1) - 1) > 0.01) out.push(["volume", Math.round(finite(clip.volume, 1) * 100) + "%"]);
  if (Array.isArray(clip.fx) && clip.fx.length) out.push(["fx", "効果" + clip.fx.length]);
  if (clip.color) out.push(["color", "色"]);
  if (clip.mask) out.push(["mask", "マスク"]);
  if (clip.chroma && clip.chroma.enabled !== false) out.push(["chroma", "背景"]);
  if (clip.stabilize) out.push(["stabilize", "手ブレ"]);
  return out.slice(0, 4);
}

/** keys（§2）から菱形を打つ clip ローカル秒を集める */
export function keyTimes(clip) {
  const keys = clip && clip.keys;
  if (!keys || typeof keys !== "object") return [];
  const seen = new Set();
  const out = [];
  for (const path of Object.keys(keys)) {
    const list = keys[path];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const t = finite(list[i] && list[i].t, 0);
      const q = Math.round(t * 1000);
      if (seen.has(q)) continue;
      seen.add(q);
      out.push({ t, path, index: i });
      if (out.length >= MAX_KEYS) return out;
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/* ══ 小道具 ══════════════════════════════════════════════════════════ */

function div(cls) { const d = document.createElement("div"); d.className = cls; return d; }
function px(n) { return Math.round(n * 10) / 10 + "px"; }

/* ══ 本体 ════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} TimelineView
 * @property {()=>void} render
 * @property {(trackId:string)=>void} renderTrack
 * @property {(clipId:string)=>void} invalidate
 * @property {(t:number)=>number} timeToX
 * @property {(x:number)=>number} xToTime
 * @property {(y:number, opts?:Object)=>string|null} yToTrack
 * @property {(trackId:string)=>Object|null} trackRect
 * @property {(clipId:string)=>Object|null} clipRect
 * @property {(pxPerSec:number, opts?:Object)=>void} setZoom
 * @property {(x:number)=>void} scrollTo
 * @property {(t:number, opts?:Object)=>void} scrollToTime
 * @property {()=>void} fitToWindow
 * @property {(clipId:string)=>void} ensureVisible
 * @property {(t:number)=>void} setPlayhead
 * @property {(x:number|null)=>void} setSnapLine
 * @property {(rect:Object|null)=>void} setMarquee
 * @property {(ghost:Object|Object[]|null)=>void} setGhost
 * @property {(x:number, y:number, opts?:Object)=>Object} hitTest
 * @property {()=>void} dispose
 */

/**
 * タイムラインの描画を起こす。
 * @param {{store:Object, els:Object, media?:Object}} deps
 *   els = { scroll:#tlScroll, ruler:#tlRuler, tracks:#tlTracks, playhead:#tlPlayhead,
 *           snapLine:#tlSnapLine, marquee:#tlMarquee, heads:#tlHeads }
 *   （app.js は els をまとめて渡すので tlScroll 等の名前でも受け取れるようにする）
 * @returns {TimelineView}
 */
export function createTimelineView(deps) {
  const store = deps && deps.store;
  const src = (deps && deps.els) || {};
  const media = (deps && deps.media) || {};
  const els = {
    scroll: src.scroll || src.tlScroll,
    ruler: src.ruler || src.tlRuler,
    tracks: src.tracks || src.tlTracks,
    playhead: src.playhead || src.tlPlayhead,
    snapLine: src.snapLine || src.tlSnapLine,
    marquee: src.marquee || src.tlMarquee,
    heads: src.heads || src.tlHeads
  };
  if (!store || !els.scroll || !els.tracks) {
    throw new Error("timeline/view: store と #tlScroll / #tlTracks が要ります");
  }

  /* ── 部品（欠けても動く） ────────────────────────────────────── */
  const storage = media.storage || null;
  let strips = null, waves = null;
  try { strips = createFilmstrip({ storage }); } catch (e) { warn("tl-view", "filmstrip を起こせません", e); }
  try { waves = createWaveform({ storage, ctx: media.audioCtx || null }); } catch (e) { warn("tl-view", "waveform を起こせません", e); }

  /* ── 状態 ───────────────────────────────────────────────────── */
  const clipRecs = new Map();   // clipId → { el, p:{…}, sig, mediaKey, waveKey, x, w, rowId, lite }
  const rowRecs = new Map();    // trackId → { el, clips, y, h, kind }
  const vp = { left: 0, top: 0, w: 800, h: 320 };
  const geom = { contentW: 800, contentH: 200, dur: 0 };
  let rows = [];
  let zoom = clamp(finite(store.view && store.view.zoom, ZOOM_DEFAULT), ZOOM_MIN, ZOOM_MAX);
  let playheadT = finite(store.view && store.view.playhead, 0);
  let tcText = "";
  let mobile = false;
  let applying = false;         // store.setView の反射を止める
  let dead = false;
  let mediaTimer = 0;
  let emptyEl = null;
  /** render 1 回ぶんの素材索引（assetId → asset）。assetById の線形探索を避ける */
  let assetIndex = new Map();
  function assetOf(id) {
    if (!id) return null;
    const a = assetIndex.get(id);
    return a !== undefined ? a : assetById(store.project || {}, id);
  }

  /* ── 重ねる層を用意（ghost と ルーラー canvas はこちらで作る） ───── */
  const ghostLayer = div("vqs-tl-ghosts");
  ghostLayer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:4";
  els.tracks.appendChild(ghostLayer);
  const rulerCanvas = document.createElement("canvas");
  rulerCanvas.className = "vqs-tl-rulercanvas";
  rulerCanvas.style.cssText = "position:absolute;left:0;top:0;display:block;pointer-events:none";
  if (els.ruler) {
    els.ruler.style.position = "sticky";
    els.ruler.style.top = "0";
    els.ruler.style.zIndex = "6";
    els.ruler.appendChild(rulerCanvas);
  }
  els.tracks.style.position = "relative";
  /* #tlScroll は「中身より狭い窓」でなければならない。CSS がまだ無い / overflow を
     visible のままにしていると scrollLeft が効かず、盤面が動かない。
     ここは見た目ではなく仕組みなので、足りなければ最小限だけ補う。 */
  try {
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(els.scroll) : null;
    if (cs) {
      if (cs.position === "static") els.scroll.style.position = "relative";
      if (cs.overflowX === "visible") { els.scroll.style.overflowX = "auto"; els.scroll.style.overflowY = "auto"; }
    } else { els.scroll.style.position = els.scroll.style.position || "relative"; }
  } catch (_e) { /* 読めない器では触らない */ }
  if (els.playhead) { els.playhead.style.position = "absolute"; els.playhead.style.top = "0"; els.playhead.style.zIndex = "8"; }
  if (els.snapLine) { els.snapLine.style.position = "absolute"; els.snapLine.style.top = "0"; els.snapLine.style.zIndex = "7"; }
  if (els.marquee) { els.marquee.style.position = "absolute"; els.marquee.style.zIndex = "9"; }

  /* ── 寸法 ───────────────────────────────────────────────────── */
  function rulerH() { return mobile ? RULER_H_MOBILE : RULER_H; }
  function handleW() { return isTouch() || mobile ? HANDLE_W_TOUCH : HANDLE_W; }
  function handleHit() { return isTouch() || mobile ? HANDLE_HIT_TOUCH : HANDLE_HIT; }
  function rowHeightOf(track) {
    const base = mobile ? ROW_H_MOBILE : ROW_H;
    const h = finite(track && track.height, 0);
    if (!(h > 0)) return base;
    return clamp(mobile ? Math.min(h, 64) : h, ROW_MIN, ROW_MAX);
  }

  /** 波形を敷く高さ。音クリップは全面、映像は下の帯だけ（CapCut 式） */
  function waveBandH(clip, rowH) {
    if (clip.kind === "audio") return Math.max(12, rowH - 14);
    return Math.max(10, Math.min(22, Math.round(rowH * 0.3)));
  }

  /* ── 座標 ───────────────────────────────────────────────────── */
  function timeToX(t) { return finite(t, 0) * zoom; }
  function xToTime(x) { return zoom > 0 ? finite(x, 0) / zoom : 0; }
  function toContent(clientX, clientY) {
    const r = els.scroll.getBoundingClientRect();
    return { x: finite(clientX, 0) - r.left + vp.left, y: finite(clientY, 0) - r.top + vp.top, local: finite(clientY, 0) - r.top };
  }
  function toClient(x, y) {
    const r = els.scroll.getBoundingClientRect();
    return { x: finite(x, 0) - vp.left + r.left, y: finite(y, 0) - vp.top + r.top };
  }

  /* ── DOM の読みはここだけ ───────────────────────────────────── */
  function readViewport() {
    const s = els.scroll;
    vp.left = s.scrollLeft || 0;
    vp.top = s.scrollTop || 0;
    vp.w = s.clientWidth || vp.w;
    vp.h = s.clientHeight || vp.h;
    mobile = (s.clientWidth || 1024) < 1024 || (globalThis.innerWidth || 1024) < 1024;
  }

  /* ── 行の配置を計算（配列の後ろ = 上のレイヤー → 画面では上に出す） ── */
  function layout() {
    const project = store.project || {};
    const list = Array.isArray(project.tracks) ? project.tracks : [];
    assetIndex = new Map();
    for (const a of (Array.isArray(project.assets) ? project.assets : [])) {
      if (a && a.id) assetIndex.set(a.id, a);
    }
    rows = [];
    let y = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const track = list[i];
      if (!track || !track.id) continue;
      const h = rowHeightOf(track);
      rows.push({ track, id: track.id, index: i, kind: track.kind || "video", y, h });
      y += h + ROW_GAP;
    }
    geom.dur = projectDuration(project);
    geom.contentH = Math.max(y + 16, 40);
    const tail = Math.max(TAIL_SEC, vp.w / Math.max(1, zoom) * 0.5);
    geom.contentW = Math.max(vp.w, (geom.dur + tail) * zoom);
    return rows;
  }

  function rowById(trackId) {
    for (const r of rows) if (r.id === trackId) return r;
    return null;
  }
  function rowAtContentY(cy) {
    const y = finite(cy, 0) - rulerH();
    for (const r of rows) if (y >= r.y - ROW_GAP && y < r.y + r.h + ROW_GAP) return r;
    return null;
  }

  /* ══ ルーラー ══════════════════════════════════════════════════ */
  function drawRuler() {
    if (!els.ruler) return;
    const h = rulerH();
    const w = Math.max(1, Math.ceil(vp.w));
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 3);
    if (rulerCanvas.width !== Math.round(w * dpr) || rulerCanvas.height !== Math.round(h * dpr)) {
      rulerCanvas.width = Math.round(w * dpr);
      rulerCanvas.height = Math.round(h * dpr);
      rulerCanvas.style.width = w + "px";
      rulerCanvas.style.height = h + "px";
    }
    rulerCanvas.style.transform = "translateX(" + px(vp.left) + ")";
    const ctx = rulerCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const project = store.project || {};
    const fps = finite(project.settings && project.settings.fps, 30);
    const view = store.view || {};
    const ink = cssVar("--vqs-tl-ruler-ink", "rgba(233,238,245,.62)");
    const inkDim = cssVar("--vqs-tl-ruler-dim", "rgba(233,238,245,.22)");
    const accent = cssVar("--vqs-accent", "#4f8cff");

    /* イン〜アウトの範囲を先に敷く */
    const ip = finite(view.inPoint, -1), op = finite(view.outPoint, -1);
    if (ip >= 0 && op > ip) {
      ctx.fillStyle = cssVar("--vqs-tl-range", "rgba(79,140,255,.18)");
      const x0 = timeToX(ip) - vp.left, x1 = timeToX(op) - vp.left;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }

    const step = pickTickStep(zoom);
    const sub = pickSubStep(step, zoom);
    const t0 = xToTime(vp.left), t1 = xToTime(vp.left + w);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "alphabetic";

    if (sub > 0) {
      ctx.fillStyle = inkDim;
      const s0 = Math.floor(t0 / sub) * sub;
      for (let t = s0; t <= t1; t += sub) {
        if (t < 0) continue;
        const x = Math.round(timeToX(t) - vp.left) + 0.5;
        ctx.fillRect(x, h - 5, 1, 4);
      }
    }
    ctx.fillStyle = ink;
    const m0 = Math.floor(t0 / step) * step;
    for (let t = m0; t <= t1; t += step) {
      if (t < -1e-6) continue;
      const x = Math.round(timeToX(t) - vp.left) + 0.5;
      ctx.fillRect(x, h - 10, 1, 9);
      ctx.fillText(tickLabel(t, step, fps), x + 4, h - 13);
    }

    /* 章の印（下の細い四角）→ マーカーの旗（上） */
    const chapters = Array.isArray(project.chapters) ? project.chapters : [];
    for (const c of chapters) {
      const x = Math.round(timeToX(finite(c && c.t, 0)) - vp.left);
      if (x < -8 || x > w + 8) continue;
      ctx.fillStyle = cssVar("--vqs-tl-chapter", "rgba(255,214,102,.9)");
      ctx.fillRect(x - 1, h - 4, 3, 4);
    }
    const markers = Array.isArray(project.markers) ? project.markers : [];
    for (const mk of markers) {
      const x = Math.round(timeToX(finite(mk && mk.t, 0)) - vp.left);
      if (x < -12 || x > w + 12) continue;
      const col = (mk && mk.color) || accent;
      ctx.fillStyle = col;
      ctx.fillRect(x - 0.5, 2, 1.5, h - 4);
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x + 9, 5.5);
      ctx.lineTo(x, 9);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ══ クリップの要素 ════════════════════════════════════════════ */
  function makeClipEl() {
    const el = div("vqs-clip");
    el.setAttribute("data-test", "clip");
    const p = {
      el,
      media: div("vqs-clip__media"),
      wave: div("vqs-clip__wave"),
      label: div("vqs-clip__label"),
      name: document.createElement("span"),
      badges: div("vqs-clip__badges"),
      hl: div("vqs-clip__handle vqs-clip__handle--l"),
      hr: div("vqs-clip__handle vqs-clip__handle--r"),
      keys: null, transIn: null, transOut: null, group: null, hatch: null, fadeIn: null, fadeOut: null
    };
    p.name.className = "vqs-clip__name";
    p.hl.dataset.handle = "L";
    p.hr.dataset.handle = "R";
    p.hl.setAttribute("aria-hidden", "true");
    p.hr.setAttribute("aria-hidden", "true");
    p.label.append(p.name, p.badges);
    el.style.cssText = "position:absolute;left:0;top:0;overflow:hidden;box-sizing:border-box;contain:layout paint";
    p.media.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none";
    p.wave.style.cssText = "position:absolute;left:0;right:0;bottom:0;overflow:hidden;pointer-events:none";
    p.label.style.cssText = "position:absolute;left:0;right:0;top:0;pointer-events:none";
    p.hl.style.cssText = "position:absolute;left:0;top:0;bottom:0;touch-action:none";
    p.hr.style.cssText = "position:absolute;right:0;top:0;bottom:0;touch-action:none";
    el.append(p.media, p.wave, p.label, p.hl, p.hr);
    return p;
  }

  /** 要る時だけ子を作る（無駄な要素を 200 個作らない） */
  const PART_CSS = {
    keys: "position:absolute;left:0;right:0;bottom:0;height:" + KEY_BAND + "px;pointer-events:none",
    transIn: "position:absolute;left:0;top:0;height:" + TRANS_BAND + "px",
    transOut: "position:absolute;right:0;top:0;height:" + TRANS_BAND + "px",
    group: "position:absolute;left:0;right:0;top:0;height:3px;pointer-events:none",
    hatch: "position:absolute;inset:0;pointer-events:none",
    fadeIn: "position:absolute;left:0;top:0;bottom:0;pointer-events:none",
    fadeOut: "position:absolute;right:0;top:0;bottom:0;pointer-events:none"
  };
  function ensurePart(p, key, cls, parent) {
    if (p[key]) return p[key];
    const e = div(cls);
    if (PART_CSS[key]) e.style.cssText = PART_CSS[key];
    (parent || p.el).appendChild(e);
    p[key] = e;
    return e;
  }
  function dropPart(p, key) {
    const e = p[key];
    if (e && e.parentNode) e.parentNode.removeChild(e);
    p[key] = null;
  }

  function clipName(clip, asset) {
    if (clip.name) return String(clip.name);
    if (clip.kind === "text" && clip.text && clip.text.content) return String(clip.text.content).slice(0, 40);
    if (asset && asset.name) return String(asset.name);
    return { video: "映像", image: "画像", audio: "音声", text: "テキスト", shape: "図形", adjust: "調整", compound: "まとめ" }[clip.kind] || "クリップ";
  }

  function classFor(clip, selected, lite, tiny) {
    let c = "vqs-clip vqs-clip--" + (clip.kind || "video");
    if (selected) c += " vqs-clip--selected";
    if (lite) c += " vqs-clip--lite";
    if (tiny) c += " vqs-clip--tiny";
    if (clip.locked) c += " vqs-clip--locked";
    if (clip.hidden) c += " vqs-clip--hidden";
    if (clip.muteAudio) c += " vqs-clip--muted";
    if (clip.groupId) c += " vqs-clip--grouped";
    if (clip.linkedId) c += " vqs-clip--linked";
    if (clip.source && clip.source.by === "ai") c += " vqs-clip--ai";
    return c;
  }

  /**
   * 1 クリップを更新する。sig が同じなら DOM を 1 つも触らない。
   */
  function updateClip(clip, row, selected, visible) {
    let rec = clipRecs.get(clip.id);
    if (!rec) {
      rec = { p: makeClipEl(), sig: "", mediaKey: "", waveKey: "", x: 0, w: 0, rowId: row.id, lite: true };
      rec.p.el.dataset.clipId = clip.id;
      clipRecs.set(clip.id, rec);
    }
    const p = rec.p;
    const x = timeToX(clip.start);
    const w = Math.max(2, finite(clip.duration, 0) * zoom);
    const tiny = w < 26;
    const lite = !visible;
    const badges = clipBadges(clip);
    const keys = row.h >= 44 && w >= 28 && !tiny ? keyTimes(clip) : [];
    const fadeIn = finite(clip.audioFade && clip.audioFade.in, 0);
    const fadeOut = finite(clip.audioFade && clip.audioFade.out, 0);
    const tIn = clip.transitionIn, tOut = clip.transitionOut;
    const asset = clip.assetId ? assetOf(clip.assetId) : null;
    const name = clipName(clip, asset);
    const selKey = (store.selection && store.selection.keyframe) || null;
    const keySel = selKey && selKey.clipId === clip.id ? String(selKey.path) + "#" + selKey.index : "";
    const sig = [
      Math.round(x * 10), Math.round(w * 10), Math.round(row.y), row.h, row.id,
      clip.kind, selected ? 1 : 0, lite ? 1 : 0, tiny ? 1 : 0,
      clip.locked ? 1 : 0, clip.hidden ? 1 : 0, clip.groupId || "", clip.label || "",
      name, keySel, badges.map((b) => b[1]).join(","),
      keys.length ? keys.map((k) => Math.round(k.t * 100)).join(".") : "",
      tIn ? tIn.type + Math.round(finite(tIn.duration, 0) * 100) : "",
      tOut ? tOut.type + Math.round(finite(tOut.duration, 0) * 100) : "",
      Math.round(fadeIn * 100), Math.round(fadeOut * 100),
      clip.assetId || "", clip.muteAudio ? 1 : 0, clip.linkedId ? 1 : 0,
      clip.source && clip.source.by === "ai" ? 1 : 0
    ].join("|");

    rec.x = x; rec.w = w; rec.rowId = row.id; rec.lite = lite; rec.h = row.h;
    rec.clip = clip;
    rec.asset = asset;
    if (rec.sig === sig) return rec;
    rec.sig = sig;

    /* 位置と大きさ（transform だけで動かす） */
    p.el.style.transform = "translateX(" + px(x) + ")";
    p.el.style.width = px(w);
    p.el.style.height = px(row.h);
    p.el.className = classFor(clip, selected, lite, tiny);
    p.el.dataset.trackId = row.id;
    p.el.dataset.kind = clip.kind || "video";
    if (clip.label) p.el.style.setProperty("--vqs-clip-label", String(clip.label));
    else p.el.style.removeProperty("--vqs-clip-label");
    p.el.setAttribute("aria-label", name);

    /* 掴み代（モバイルは太く）と波形の帯の高さ */
    const hw = Math.min(handleW(), Math.max(4, w / 3));
    p.hl.style.width = px(hw);
    p.hr.style.width = px(hw);
    p.wave.style.height = px(waveBandH(clip, row.h));

    /* 名前と印 */
    if (p.name.textContent !== name) p.name.textContent = name;
    const bsig = badges.map((b) => b[1]).join(",");
    if (p.badgeSig !== bsig) {
      p.badgeSig = bsig;
      p.badges.textContent = "";
      for (const [k, text] of badges) {
        const s = document.createElement("span");
        s.className = "vqs-clip__badge";
        s.dataset.badge = k;
        s.textContent = text;
        p.badges.appendChild(s);
      }
    }

    /* グループの帯・ロック/非表示の斜線 */
    if (clip.groupId) {
      const g = ensurePart(p, "group", "vqs-clip__group");
      g.style.background = "hsl(" + hueOf(clip.groupId) + " 80% 60%)";
    } else dropPart(p, "group");
    if (clip.locked || clip.hidden) ensurePart(p, "hatch", "vqs-clip__hatch");
    else dropPart(p, "hatch");

    /* 音のフェード（三角） */
    if (fadeIn > 0) ensurePart(p, "fadeIn", "vqs-clip__fade vqs-clip__fade--in").style.width = px(Math.min(w / 2, fadeIn * zoom));
    else dropPart(p, "fadeIn");
    if (fadeOut > 0) ensurePart(p, "fadeOut", "vqs-clip__fade vqs-clip__fade--out").style.width = px(Math.min(w / 2, fadeOut * zoom));
    else dropPart(p, "fadeOut");

    /* 遷移の印（隣との境界の小さな四角） */
    if (tIn) {
      const e = ensurePart(p, "transIn", "vqs-clip__trans vqs-clip__trans--in");
      e.style.width = px(Math.max(TRANS_MIN_W, Math.min(w / 2, finite(tIn.duration, 0.5) * zoom)));
      e.dataset.trans = "in";
      e.title = "遷移: " + (tIn.type || "crossfade");
    } else dropPart(p, "transIn");
    if (tOut) {
      const e = ensurePart(p, "transOut", "vqs-clip__trans vqs-clip__trans--out");
      e.style.width = px(Math.max(TRANS_MIN_W, Math.min(w / 2, finite(tOut.duration, 0.5) * zoom)));
      e.dataset.trans = "out";
      e.title = "遷移: " + (tOut.type || "crossfade");
    } else dropPart(p, "transOut");

    /* キーフレームの菱形 */
    if (keys.length) {
      const host = ensurePart(p, "keys", "vqs-clip__keys");
      host.textContent = "";
      for (const k of keys) {
        const d = div("vqs-clip__key" + (selKey && selKey.clipId === clip.id && selKey.path === k.path && selKey.index === k.index ? " vqs-clip__key--sel" : ""));
        d.style.cssText = "position:absolute;left:-4px;bottom:3px;width:8px;height:8px";
        /* 45 度回して菱形にする（CSS が無くても菱形に見えるように） */
        d.style.transform = "translateX(" + px(clamp(k.t * zoom, 0, w)) + ") rotate(45deg)";
        d.dataset.keyPath = k.path;
        d.dataset.keyIndex = String(k.index);
        host.appendChild(d);
      }
      rec.keys = keys;
    } else { dropPart(p, "keys"); rec.keys = null; }


    /* 中身（帯・波形）は仮想化して別便で入れる */
    if (lite) {
      p.media.textContent = "";
      p.wave.textContent = "";
      rec.mediaKey = "";
      rec.waveKey = "";
    }
    return rec;
  }

  /* ══ 中身（フィルムストリップ・波形）の差し込み ═════════════════ */
  function scheduleMedia() {
    if (mediaTimer || dead) return;
    mediaTimer = setTimeout(() => { mediaTimer = 0; pumpMedia(); }, MEDIA_THROTTLE);
  }

  function pumpMedia() {
    if (dead) return;
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    clipRecs.forEach((rec, id) => {
      if (rec.lite || !rec.clip) return;
      const clip = rec.clip, asset = rec.asset;
      const w = Math.max(24, Math.ceil(rec.w / MEDIA_W_QUANT) * MEDIA_W_QUANT);
      const h = Math.max(18, Math.round(rec.h));
      const from = finite(clip.in, 0), to = finite(clip.out, from + finite(clip.duration, 1));

      /* ① 映像の帯 */
      const wantStrip = strips && asset && (asset.kind === "video" || asset.kind === "image") && clip.kind !== "audio";
      if (wantStrip) {
        const key = [asset.id, Math.round(from * 100), Math.round(to * 100), w, h].join("|");
        if (rec.mediaKey !== key) {
          rec.mediaKey = key;
          strips.strip(asset, { from, to, width: w, height: h, priority: 0 }).then((cv) => {
            if (dead || !cv || rec.mediaKey !== key || !rec.p.el.isConnected) return;
            cv.style.width = "100%";
            cv.style.height = "100%";
            rec.p.media.textContent = "";
            rec.p.media.appendChild(cv);
          }).catch((e) => warn("tl-view", "帯を作れません " + id, e));
        }
      } else if (rec.mediaKey) { rec.mediaKey = ""; rec.p.media.textContent = ""; }

      /* ② 音の波形 */
      const wantWave = waves && asset && asset.kind !== "image" && asset.hasAudio !== false && !clip.muteAudio;
      if (wantWave) {
        const waveH = waveBandH(clip, h);
        const key = [asset.id, Math.round(from * 100), Math.round(to * 100), w, waveH].join("|");
        if (rec.waveKey !== key) {
          rec.waveKey = key;
          waves.peaks(asset).then((pk) => {
            if (dead || rec.waveKey !== key || !rec.p.el.isConnected) return;
            if (!pk) { rec.p.wave.textContent = ""; return; }
            let cv = rec.p.wave.firstElementChild;
            if (!cv || cv.tagName !== "CANVAS") {
              cv = document.createElement("canvas");
              cv.style.width = "100%";
              cv.style.height = "100%";
              cv.style.display = "block";
              rec.p.wave.textContent = "";
              rec.p.wave.appendChild(cv);
            }
            cv.width = Math.round(w * dpr);
            cv.height = Math.round(waveH * dpr);
            waves.draw(cv, pk, {
              from, to, height: waveH, dpr, duration: finite(asset.duration, 0),
              gain: clamp(finite(clip.volume, 1), 0.05, 4),
              color: cssVar("--vqs-tl-wave", "rgba(150,214,255,.82)")
            });
          }).catch((e) => warn("tl-view", "波形を作れません " + id, e));
        }
      } else if (rec.waveKey) { rec.waveKey = ""; rec.p.wave.textContent = ""; }
    });
    prefetchNear();
  }

  /** 画面の外に居るクリップの素材を、空いた時に少しだけ温めておく */
  function prefetchNear() {
    const seen = new Set();
    let budget = 4;
    clipRecs.forEach((rec) => {
      if (budget <= 0 || !rec.lite || !rec.asset || seen.has(rec.asset.id)) return;
      seen.add(rec.asset.id);
      budget--;
      if (strips && rec.asset.kind !== "audio") { try { strips.prefetch(rec.asset); } catch (_e) { /* noop */ } }
      if (waves && rec.asset.hasAudio !== false) { try { waves.prefetch(rec.asset); } catch (_e) { /* noop */ } }
    });
  }

  /* ══ 行とクリップの差分更新 ════════════════════════════════════ */
  function renderRow(row, seen, selIds) {
    let rr = rowRecs.get(row.id);
    if (!rr) {
      const el = div("vqs-tl-row");
      el.setAttribute("data-test", "tl-row");
      el.dataset.trackId = row.id;
      el.style.position = "absolute";
      el.style.left = "0";
      const bg = div("vqs-tl-row__bg");
      bg.style.cssText = "position:absolute;inset:0;pointer-events:none";
      const clips = div("vqs-tl-row__clips");
      clips.style.cssText = "position:absolute;inset:0";
      el.append(bg, clips);
      els.tracks.appendChild(el);
      rr = { el, clips, sig: "" };
      rowRecs.set(row.id, rr);
    }
    const t = row.track;
    const sig = [row.y, row.h, geom.contentW | 0, row.kind, t.name || "", t.locked ? 1 : 0, t.hidden ? 1 : 0, t.muted ? 1 : 0, t.solo ? 1 : 0].join("|");
    if (rr.sig !== sig) {
      rr.sig = sig;
      rr.el.style.transform = "translateY(" + px(row.y) + ")";
      rr.el.style.height = px(row.h);
      rr.el.style.width = px(geom.contentW);
      rr.el.className = "vqs-tl-row vqs-tl-row--" + row.kind
        + (t.locked ? " vqs-tl-row--locked" : "") + (t.hidden ? " vqs-tl-row--hidden" : "")
        + (t.muted ? " vqs-tl-row--muted" : "") + (t.solo ? " vqs-tl-row--solo" : "");
    }

    /* 縦の可視判定（行ごと。外れた行のクリップは中身を持たない） */
    const rowTop = row.y + rulerH(), rowBot = rowTop + row.h;
    const vTop = vp.top - vp.h, vBot = vp.top + vp.h * 2;
    const rowVisible = rowBot > vTop && rowTop < vBot;
    const xMin = vp.left - vp.w, xMax = vp.left + vp.w * 2;

    const clips = Array.isArray(t.clips) ? t.clips : [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip || !clip.id) continue;
      seen.add(clip.id);
      const x = timeToX(clip.start), w = Math.max(2, finite(clip.duration, 0) * zoom);
      const visible = rowVisible && x + w > xMin && x < xMax;
      const rec = updateClip(clip, row, selIds.has(clip.id), visible);
      if (rec.p.el.parentNode !== rr.clips) rr.clips.appendChild(rec.p.el);
    }
    return rr;
  }

  function render() {
    if (dead) return;
    readViewport();
    layout();

    /* 器の大きさ（ここだけは書く） */
    els.tracks.style.width = px(geom.contentW);
    els.tracks.style.height = px(geom.contentH);
    if (els.ruler) {
      els.ruler.style.height = px(rulerH());
      els.ruler.style.width = px(geom.contentW);
    }
    ghostLayer.style.width = px(geom.contentW);
    ghostLayer.style.height = px(geom.contentH);
    if (els.playhead) els.playhead.style.height = px(rulerH() + geom.contentH);
    if (els.snapLine) els.snapLine.style.height = px(rulerH() + geom.contentH);
    if (els.heads) {
      els.heads.style.setProperty("--vqs-tl-ruler-h", px(rulerH()));
      els.heads.style.setProperty("--vqs-tl-row-gap", ROW_GAP + "px");
    }

    const sel = (store.selection && store.selection.clipIds) || [];
    const selIds = new Set(Array.isArray(sel) ? sel : []);
    const seen = new Set();
    const keepRows = new Set();
    for (const row of rows) { keepRows.add(row.id); renderRow(row, seen, selIds); }

    /* 消えた物だけ外す */
    rowRecs.forEach((rr, id) => {
      if (keepRows.has(id)) return;
      if (rr.el.parentNode) rr.el.parentNode.removeChild(rr.el);
      rowRecs.delete(id);
    });
    clipRecs.forEach((rec, id) => {
      if (seen.has(id)) return;
      if (rec.p.el.parentNode) rec.p.el.parentNode.removeChild(rec.p.el);
      clipRecs.delete(id);
    });

    /* トラックが無い時の案内 */
    if (!rows.length) {
      if (!emptyEl) {
        emptyEl = div("vqs-tl-empty");
        emptyEl.setAttribute("data-test", "tl-empty");
        emptyEl.textContent = "素材をここへ置くと編集が始まります";
        els.tracks.appendChild(emptyEl);
      }
    } else if (emptyEl) { if (emptyEl.parentNode) emptyEl.parentNode.removeChild(emptyEl); emptyEl = null; }

    drawRuler();
    setPlayhead(playheadT);
    scheduleMedia();
  }

  function renderTrack(trackId) {
    if (dead) return;
    const row = rowById(trackId);
    if (!row) { render(); return; }
    const sel = (store.selection && store.selection.clipIds) || [];
    renderRow(row, new Set(), new Set(Array.isArray(sel) ? sel : []));
    scheduleMedia();
  }

  function invalidate(clipId) {
    const rec = clipRecs.get(clipId);
    if (!rec) { render(); return; }
    rec.sig = ""; rec.mediaKey = ""; rec.waveKey = "";
    const row = rowById(rec.rowId);
    if (row) renderTrack(row.id); else render();
  }

  /* ══ 再生ヘッド・吸着線・選択枠・影 ════════════════════════════ */
  function setPlayhead(t) {
    playheadT = finite(t, 0);
    if (!els.playhead) return;
    els.playhead.style.transform = "translateX(" + px(timeToX(playheadT)) + ")";
    const project = store.project || {};
    const tc = toTC(playheadT, finite(project.settings && project.settings.fps, 30), { compact: true });
    if (tc !== tcText) { tcText = tc; els.playhead.dataset.tc = tc; }
  }

  /**
   * 吸着線を出す。
   * @param {number|null} x 内容座標の px（契約書の形）
   * @param {Object|{unit:"time"}} [hit] 第 2 引数が在る時は x を **秒** と読む
   *   （interact.js は `setSnapLine(t, hit)` と秒で呼ぶ。px と秒を間違えると
   *    線が 1/80 の位置に出て「壊れている」ように見えるので、両方飲む）
   */
  function setSnapLine(x, hit) {
    if (!els.snapLine) return;
    if (x == null || !Number.isFinite(Number(x))) {
      els.snapLine.classList.add("hidden");
      els.snapLine.removeAttribute("data-snap");
      return;
    }
    const asTime = hit !== undefined && hit !== null;
    const cx = asTime ? timeToX(Number(x)) : Number(x);
    els.snapLine.style.transform = "translateX(" + px(cx) + ")";
    els.snapLine.classList.remove("hidden");
    if (hit && hit.kind) els.snapLine.dataset.snap = String(hit.kind);
  }

  function setMarquee(rect) {
    if (!els.marquee) return;
    if (!rect) { els.marquee.classList.add("hidden"); return; }
    const x = finite(rect.x, 0), y = finite(rect.y, 0);
    els.marquee.style.left = px(x);
    els.marquee.style.top = px(y);
    els.marquee.style.width = px(Math.max(0, finite(rect.w, 0)));
    els.marquee.style.height = px(Math.max(0, finite(rect.h, 0)));
    els.marquee.classList.remove("hidden");
  }

  /**
   * ドラッグ中の影。次の 3 通りを飲む（呼ぶ側を直さなくて済むように）:
   *   setGhost({ trackId, start, duration, label })            … 1 個
   *   setGhost([{…}, {…}])                                      … 複数
   *   setGhost({ mode, valid, dup, items:[{clipId,trackId,start,duration,dy}] })
   *                                                             … interact.js の形
   */
  function setGhost(ghost) {
    ghostLayer.textContent = "";
    if (!ghost) return;
    const wrap = !Array.isArray(ghost) ? ghost : null;
    const list = Array.isArray(ghost) ? ghost
      : (Array.isArray(ghost.items) ? ghost.items : (Array.isArray(ghost.clips) ? ghost.clips : [ghost]));
    let mod = "";
    if (wrap) {
      if (wrap.mode) mod += " vqs-tl-ghost--" + String(wrap.mode).replace(/[^a-z0-9-]/gi, "");
      if (wrap.valid === false) mod += " vqs-tl-ghost--invalid";
      if (wrap.dup) mod += " vqs-tl-ghost--dup";
      if (wrap.lifted) mod += " vqs-tl-ghost--lifted";
    }
    for (const g of list) {
      if (!g) continue;
      const row = g.trackId ? rowById(g.trackId) : null;
      const x = Number.isFinite(Number(g.x)) ? Number(g.x) : timeToX(finite(g.start, 0));
      const w = Number.isFinite(Number(g.w)) ? Number(g.w) : Math.max(2, finite(g.duration, 0) * zoom);
      const y = (row ? row.y : Math.max(0, finite(g.y, 0) - rulerH())) + finite(g.dy, 0);
      const h = row ? row.h : finite(g.h, mobile ? ROW_H_MOBILE : ROW_H);
      const e = div("vqs-tl-ghost" + (g.invalid || g.valid === false ? " vqs-tl-ghost--invalid" : "") + mod);
      if (g.clipId) e.dataset.ghostFor = String(g.clipId);
      e.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
      e.style.transform = "translate(" + px(x) + "," + px(y) + ")";
      e.style.width = px(w);
      e.style.height = px(h);
      if (g.label) {
        const l = div("vqs-tl-ghost__label");
        l.textContent = String(g.label);
        e.appendChild(l);
      }
      ghostLayer.appendChild(e);
    }
  }

  /* ══ ズーム・スクロール ════════════════════════════════════════ */
  function anchorTime() {
    const x = timeToX(playheadT);
    if (x >= vp.left && x <= vp.left + vp.w) return playheadT;
    return xToTime(vp.left + vp.w / 2);
  }

  function writeView(partial) {
    if (!store.setView) return;
    applying = true;
    try { store.setView(partial); } catch (e) { warn("tl-view", "setView", e); }
    applying = false;
  }

  function scrollTo(x) {
    const max = Math.max(0, geom.contentW - vp.w);
    const nx = clamp(finite(x, 0), 0, max);
    els.scroll.scrollLeft = nx;
    vp.left = nx;
    rulerCanvas.style.transform = "translateX(" + px(nx) + ")";
    drawRuler();
    writeView({ scrollX: nx });
  }

  function setZoom(pxPerSec, opts) {
    const z = clamp(finite(pxPerSec, ZOOM_DEFAULT), ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(z - zoom) < 1e-6) return;
    const o = opts || {};
    const at = Number.isFinite(Number(o.anchorTime)) ? Number(o.anchorTime) : anchorTime();
    const ax = Number.isFinite(Number(o.anchorX)) ? Number(o.anchorX) : (timeToX(at) - vp.left);
    zoom = z;
    writeView({ zoom: z });
    render();
    scrollTo(at * z - ax);
  }

  function scrollToTime(t, opts) {
    const center = !opts || opts.center !== false;
    const x = timeToX(t);
    scrollTo(center ? x - vp.w / 2 : x - Math.min(80, vp.w * 0.2));
  }

  function fitToWindow() {
    readViewport();
    const dur = Math.max(1, geom.dur || projectDuration(store.project || {}) || 10);
    const z = clamp((Math.max(160, vp.w) - 24) / (dur * 1.04), ZOOM_MIN, ZOOM_MAX);
    setZoom(z, { anchorTime: 0, anchorX: 0 });
    scrollTo(0);
  }

  function ensureVisible(clipId) {
    const rec = clipRecs.get(clipId);
    if (!rec) return;
    const pad = Math.min(64, vp.w * 0.15);
    if (rec.x < vp.left + pad) scrollTo(rec.x - pad);
    else if (rec.x + rec.w > vp.left + vp.w - pad) scrollTo(rec.x + rec.w - vp.w + pad);
    const row = rowById(rec.rowId);
    if (row) {
      const top = row.y + rulerH();
      if (top < vp.top) els.scroll.scrollTop = Math.max(0, top - rulerH());
      else if (top + row.h > vp.top + vp.h) els.scroll.scrollTop = top + row.h - vp.h + 8;
    }
  }

  /* ══ 当たり判定（画面座標を受ける） ════════════════════════════ */
  function trackRect(trackId) {
    const row = rowById(trackId);
    if (!row) return null;
    return { x: 0, y: row.y + rulerH(), w: geom.contentW, h: row.h, trackId: row.id, kind: row.kind };
  }

  function clipRect(clipId) {
    const rec = clipRecs.get(clipId);
    if (!rec) return null;
    const row = rowById(rec.rowId);
    return { x: rec.x, y: (row ? row.y : 0) + rulerH(), w: rec.w, h: row ? row.h : rec.h, clipId, trackId: rec.rowId };
  }

  function yToTrack(y, opts) {
    const space = (opts && opts.space) || "client";
    const cy = space === "content" ? finite(y, 0) : toContent(0, y).y;
    const row = rowAtContentY(cy);
    return row ? row.id : null;
  }

  function nearMarker(t) {
    const project = store.project || {};
    const list = Array.isArray(project.markers) ? project.markers : [];
    const tol = 8 / Math.max(1, zoom);
    let best = null, bd = tol;
    for (const m of list) {
      const d = Math.abs(finite(m && m.t, 0) - t);
      if (d <= bd) { bd = d; best = m; }
    }
    return best ? best.id : null;
  }

  /**
   * @param {number} x @param {number} y
   * @param {{space?:"client"|"content"}} [opts]
   * @returns {{kind:string, clipId:string|null, trackId:string|null, t:number,
   *            x:number, y:number, local:number, handle?:string,
   *            transition?:string, keyframe?:Object, markerId?:string|null}}
   */
  function hitTest(x, y, opts) {
    const space = (opts && opts.space) || "client";
    let cx, cy, localY;
    if (space === "content") { cx = finite(x, 0); cy = finite(y, 0); localY = cy - vp.top; }
    else { const p = toContent(x, y); cx = p.x; cy = p.y; localY = p.local; }
    const t = xToTime(cx);
    const base = { kind: "empty", clipId: null, trackId: null, t, x: cx, y: cy, local: 0 };

    /* ルーラーは sticky なので「画面の上端から rulerH まで」で見る */
    if (localY >= 0 && localY < rulerH()) {
      return Object.assign(base, { kind: "ruler", markerId: nearMarker(t) });
    }
    const row = rowAtContentY(cy);
    if (!row) return base;
    base.trackId = row.id;

    const clips = Array.isArray(row.track.clips) ? row.track.clips : [];
    let hit = null;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (!c) continue;
      const cx0 = timeToX(c.start), cx1 = cx0 + Math.max(2, finite(c.duration, 0) * zoom);
      if (cx >= cx0 - 1 && cx <= cx1 + 1) { hit = { clip: c, x0: cx0, x1: cx1 }; break; }
      if (cx0 > cx) break;               // start 昇順（契約書 §1 の不変条件）
    }
    if (!hit) return base;

    const clip = hit.clip;
    const w = hit.x1 - hit.x0;
    const inRow = cy - (row.y + rulerH());
    base.clipId = clip.id;
    base.local = clamp(t - finite(clip.start, 0), 0, finite(clip.duration, 0));

    /* ① キーフレームの菱形（下の帯） */
    if (row.h >= 44 && inRow > row.h - KEY_BAND) {
      const keys = keyTimes(clip);
      const tol = 9;
      for (const k of keys) {
        if (Math.abs(hit.x0 + k.t * zoom - cx) <= tol) {
          return Object.assign(base, { kind: "keyframe", keyframe: { clipId: clip.id, path: k.path, index: k.index } });
        }
      }
    }
    /* ② 遷移の印（上の帯） */
    if (inRow < TRANS_BAND) {
      const dIn = clip.transitionIn ? Math.max(TRANS_MIN_W, Math.min(w / 2, finite(clip.transitionIn.duration, 0.5) * zoom)) : 0;
      const dOut = clip.transitionOut ? Math.max(TRANS_MIN_W, Math.min(w / 2, finite(clip.transitionOut.duration, 0.5) * zoom)) : 0;
      if (dIn && cx - hit.x0 <= dIn) return Object.assign(base, { kind: "transition", transition: "in" });
      if (dOut && hit.x1 - cx <= dOut) return Object.assign(base, { kind: "transition", transition: "out" });
    }
    /* ③ トリムハンドル（掴める幅は見た目より広い） */
    const hw = Math.min(handleHit(), Math.max(4, w / 3));
    /* handle / edge の両方を入れる（呼ぶ側の語彙が "L/R" と "in/out" で分かれている） */
    if (cx - hit.x0 <= hw) return Object.assign(base, { kind: "handleL", handle: "L", edge: "in" });
    if (hit.x1 - cx <= hw) return Object.assign(base, { kind: "handleR", handle: "R", edge: "out" });
    return Object.assign(base, { kind: "clip" });
  }

  /* ══ 外からの変化を拾う ════════════════════════════════════════ */
  const onScroll = rafThrottle(() => {
    if (dead) return;
    const s = els.scroll;
    vp.left = s.scrollLeft || 0;
    vp.top = s.scrollTop || 0;
    rulerCanvas.style.transform = "translateX(" + px(vp.left) + ")";
    if (els.heads) { try { els.heads.scrollTop = vp.top; } catch (_e) { /* 動かない器なら放っておく */ } }
    drawRuler();
    /* 仮想化のやり直し（中身の出し入れ） */
    const sel = (store.selection && store.selection.clipIds) || [];
    const selIds = new Set(Array.isArray(sel) ? sel : []);
    for (const row of rows) renderRow(row, new Set(), selIds);
    scheduleMedia();
    writeView({ scrollX: vp.left });
  });
  els.scroll.addEventListener("scroll", onScroll, { passive: true });

  const onStore = (ev) => {
    if (dead) return;
    const kind = ev && ev.kind;
    if (kind === "view") {
      if (applying) return;
      const v = store.view || {};
      const z = clamp(finite(v.zoom, zoom), ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(z - zoom) > 1e-6) { setZoom(z); return; }
      if (Number.isFinite(v.playhead) && Math.abs(v.playhead - playheadT) > 1e-6) setPlayhead(v.playhead);
      if (Number.isFinite(v.scrollX) && Math.abs(v.scrollX - vp.left) > 0.5) scrollTo(v.scrollX);
      return;
    }
    render();
  };
  const unsubscribe = store.subscribe ? store.subscribe(onStore) : null;

  const onResize = rafThrottle(() => { if (!dead) render(); });
  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(onResize);
    try { ro.observe(els.scroll); } catch (_e) { ro = null; }
  }
  /* window が無い環境（selftest の器や Node の煙試験）でも起こせるように守る */
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("resize", onResize, { passive: true });
  }

  /* ══ 片付け ════════════════════════════════════════════════════ */
  function dispose() {
    dead = true;
    if (mediaTimer) { clearTimeout(mediaTimer); mediaTimer = 0; }
    clearTimeout(firstTimer);
    els.scroll.removeEventListener("scroll", onScroll);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (onScroll.cancel) onScroll.cancel();
    if (onResize.cancel) onResize.cancel();
    if (ro) { try { ro.disconnect(); } catch (_e) { /* noop */ } }
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    clipRecs.forEach((rec) => { if (rec.p.el.parentNode) rec.p.el.parentNode.removeChild(rec.p.el); });
    clipRecs.clear();
    rowRecs.forEach((rr) => { if (rr.el.parentNode) rr.el.parentNode.removeChild(rr.el); });
    rowRecs.clear();
    if (ghostLayer.parentNode) ghostLayer.parentNode.removeChild(ghostLayer);
    if (rulerCanvas.parentNode) rulerCanvas.parentNode.removeChild(rulerCanvas);
    if (emptyEl && emptyEl.parentNode) emptyEl.parentNode.removeChild(emptyEl);
    if (strips && strips.dispose) { try { strips.dispose(); } catch (_e) { /* noop */ } }
    if (waves && waves.dispose) { try { waves.dispose(); } catch (_e) { /* noop */ } }
  }

  /* ── 初回 ─────────────────────────────────────────────────────
     app.js は `show("editor")` の **前に** 部品を起こす（= この時点では
     #app が hidden で clientWidth が 0）。なので次のフレームともう一度
     測り直す。ResizeObserver が在る端末では二重になるが、render は
     差分更新なので 2 回目はほぼ何もしない。 */
  readViewport();
  render();
  const firstTimer = setTimeout(() => { if (!dead) render(); }, 240);
  onResize();

  return {
    render, renderTrack, invalidate,
    timeToX, xToTime, yToTrack, trackRect, clipRect,
    setZoom, get zoom() { return zoom; }, scrollTo, scrollToTime, fitToWindow, ensureVisible,
    setPlayhead, setSnapLine, setMarquee, setGhost, hitTest, dispose,
    /* 追補（interact / heads / minimap が要るもの。契約の上位互換） */
    toContent, toClient,
    /* interact.js が探す別名。ここに在れば向こうは控えの計算に落ちない */
    get pxPerSec() { return zoom; },
    get scrollX() { return vp.left; },
    setPxPerSec: (v) => setZoom(v),
    setScrollX: (x) => scrollTo(x),
    centerOn: (t) => scrollToTime(t, { center: true }),
    timeAtClientX: (clientX) => xToTime(toContent(clientX, 0).x),
    /** 行の画面座標（interact.js の trackAtY / trackGap 判定用） */
    trackRects: () => {
      const r = els.scroll.getBoundingClientRect();
      const base = r.top - vp.top + rulerH();
      return rows.map((row) => {
        const rr = rowRecs.get(row.id);
        return {
          trackId: row.id, kind: row.kind,
          top: base + row.y, bottom: base + row.y + row.h, height: row.h,
          left: r.left, right: r.right, el: rr ? rr.el : null
        };
      });
    },
    get rulerHeight() { return rulerH(); },
    get handleWidth() { return handleW(); },
    get handleHitWidth() { return handleHit(); },
    hitTestContent: (x, y) => hitTest(x, y, { space: "content" }),
    metrics: () => ({
      contentW: geom.contentW, contentH: geom.contentH, duration: geom.dur,
      rulerH: rulerH(), rowGap: ROW_GAP, zoom, playhead: playheadT, mobile,
      scrollX: vp.left, scrollY: vp.top, viewW: vp.w, viewH: vp.h,
      rows: rows.map((r) => ({ trackId: r.id, kind: r.kind, y: r.y, h: r.h, index: r.index }))
    }),
    stats: () => ({
      clips: clipRecs.size, rows: rowRecs.size,
      filmstrip: strips && strips.stats ? strips.stats() : null,
      waveform: waves && waves.stats ? waves.stats() : null
    })
  };
}
