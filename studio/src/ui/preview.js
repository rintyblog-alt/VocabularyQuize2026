/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/preview.js — プレビュー上の操作（プログラムモニタ）

   ★ 何をする所か
     `#previewCanvas` は compositor が描く（絵そのもの）。この所は その上に重ねる
       ・`#previewOverlay`（canvas）… 変形ハンドル・整列ガイド・セーフエリア・
         グリッド・クロップ枠・マスクの形・色吸いの照準
       ・`#previewHud`（DOM）… モード切替・表示切替・ズーム操作・数値の表示・
         文字の直接編集（IME を通すので DOM でなければならない）
     を受け持ち、Premiere のプログラムモニタ / CapCut のプレビューに当たる
     「画面の上で直に触る」操作を全部ここで面倒見る。

   ★ なぜこの形か
     ・**overlay は「画面（= #previewWrap）と同じ寸法」**で持ち、描くときの座標は
       常に「wrap の左上を原点とした CSS px（= stage 座標）」にした。stage を
       ズームで大きくしても overlay の裏面は画面の大きさのままなので、800% でも
       ハンドルの線が太らず、裏面が 15000px になって iOS が落ちることも無い。
       （index.html では overlay は #previewStage の中に在る。ズームの器から
       出したいので、初期化で **#previewWrap へ移す**。id は変えない）
     ・座標変換・当たり判定・値の丸めは **DOM を触らない純関数**として export し、
       `studio/tests/preview-math.test.mjs` で固定した。画面の中の算数が
       一番壊れやすく、一番試験しやすい。
     ・**rAF で回し続けない**。描くのは「変わった時」だけ（`invalidate()`）。
       再生中は 選択クリップの箱が前フレームと変わった時だけ描き直す
       （動いていなければ 1 枚も描かない）。
     ・掴んでいる間の書き込みは `clip.setTransform` の **coalesce**（store 側で
       120ms 以内の同種が 1 取消にまとまる）。キーフレームが在る path を掴んだ
       ときだけは 生の値を書くと見た目と合わなくなるので、離した時に
       **playhead へキーを 1 打ちする**（`store.batch` で 1 取消）。
     ・寸法の約束（scale 1 = contain, x/y = 画面に対する割合, rotate = 度）は
       engine/canvas2d.js の `layerBox()` と同じ計算を **ここにも置いた**。
       import しない理由は CONTRACT-NOTE (2)。

   ★ 触るときの注意
     ・`#previewStage` の位置と寸法（ズーム/パン）は ここが inline style で決める。
       CSS 側（styles/preview.css）は `.vqs-stage` に left/top/width/height を
       書かないこと（inline が勝つので黙って効かなくなる）。
     ・触り所はモバイルで 28px（`HANDLE_HIT_TOUCH`）、ボタンは 44px 以上。
     ・`touch-action:none` は本来 CSS の仕事だが、これが無いと iOS で
       ページごとピンチズームしてしまうので **機能として** inline でも入れる
       （§13.4 の「唯一の手」= touch-action + 非 passive の preventDefault +
       gesturestart/change/end の preventDefault）。
     ・widgets / transport / compositor は **無いことが在る**（並行作業）。
       全部「在れば使う」で呼ぶ。無くても画面は出る。

   CONTRACT-NOTE (1): 契約書 §7.3 の widgets は未着のことが在るので、
     `toast / menu / openSheet / segmented / slider / icon` は
     「在れば使い、無ければ自前の最小の代替」にした（画面が真っ白にならない事を
     優先）。widgets が揃った後も呼び方は変えなくて良い。
   CONTRACT-NOTE (2): 箱の計算は engine/canvas2d.js の `layerBox()` と同じ約束
     （scale 1 = contain / x,y = 画面に対する割合・中心が原点 / crop は「その場で
     切り落とす」）。**import せず写した**のは、canvas2d.js が top-level await で
     engine/text.js 等を動的 import しており、Node の試験から import すると
     DOM の無い所で待たされるから。約束が変わったら `clipBox()` だけ直す。
   CONTRACT-NOTE (3): 2 本指の扱いは 契約書に無いので次で調停した。
     select モードで **選択中の箱の中**から始まった 2 本指 → クリップの拡大回転。
     それ以外の 2 本指 → 画面のズーム/パン。一度決めたら離すまで変えない
     （§13.5 の「ジェスチャは 1 つの調停役が持つ」に倣う）。
   CONTRACT-NOTE (4): 1 ファイル 700 行の掟を超えている。分割先
     （ui/preview/*.js）は担当外で作れないため、§0〜§9 の章立てで 1 ファイルに
     収めた（core/eval.js・core/ops.js と同じ事情）。統合担当が分けるときは
     §1（純粋な算数）と §4（描画）が そのまま切り出せる。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, clamp01, finite, isTouch, cssVar } from "../core/util.js";
import { scope } from "../core/log.js";
import { clipsAt, resolveClip, sampleClipPath } from "../core/eval.js";
import { findClip, assetById, defaultMask, MASK_TYPES } from "../core/schema.js";

const L = scope("preview");

/* ══ §0 定数 ══════════════════════════════════════════════════════ */

/** 触れるモード（契約どおり） */
export const PREVIEW_MODES = Object.freeze(["select", "crop", "mask", "text", "chroma-pick", "pan"]);
/** グリッドの出し方 */
export const GRID_MODES = Object.freeze(["none", "thirds", "grid9"]);
/** ハンドルの名前（描く順・当たり判定の優先順） */
export const HANDLE_IDS = Object.freeze(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
/** 角と辺の符号（local の向き） */
const HANDLE_SIGN = Object.freeze({
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
  se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0]
});
/** 反対側（掴んでいない側 = 動かさない側） */
const HANDLE_OPPOSITE = Object.freeze({
  nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e"
});

export const ZOOM_MIN = 0.1;           // 10%
export const ZOOM_MAX = 8;             // 800%
export const ZOOM_STEPS = Object.freeze([0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]);
/** ハンドルの当たり判定の半径（見た目は 6px 前後） */
export const HANDLE_HIT = 12;
export const HANDLE_HIT_TOUCH = 28;    // モバイル（指）
/** 回転ハンドルの「箱の上からの距離」（stage px） */
export const ROTATE_GAP = 30;
/** 整列ガイドが効く距離（stage px） */
export const SNAP_PX = 7;
/** 変形の丸め */
export const SCALE_MIN = 0.01, SCALE_MAX = 10, POS_LIMIT = 4;
/** 画面に出す最小の箱（stage px） */
const MIN_BOX_PX = 10;
/** 長押しの時間 */
const LONGPRESS_MS = 450;
/** 二重タップと見なす間隔 / 距離 */
const DOUBLE_MS = 320, DOUBLE_PX = 26;
/** セーフエリア（動作 / 文字） */
const SAFE_ACTION = 0.9, SAFE_TITLE = 0.8;
/** クロップの比率の選択肢 */
export const CROP_RATIOS = Object.freeze([
  { id: "free", label: "自由", r: 0 }, { id: "1:1", label: "1:1", r: 1 },
  { id: "9:16", label: "9:16", r: 9 / 16 }, { id: "16:9", label: "16:9", r: 16 / 9 },
  { id: "4:5", label: "4:5", r: 4 / 5 }, { id: "4:3", label: "4:3", r: 4 / 3 },
  { id: "3:4", label: "3:4", r: 3 / 4 }, { id: "2.35:1", label: "2.35:1", r: 2.35 }
]);
/** キーフレームを見る path（掴んだ物 → path） */
const KEY_PATHS = Object.freeze({
  x: "transform.x", y: "transform.y", scaleX: "transform.scaleX",
  scaleY: "transform.scaleY", rotate: "transform.rotate"
});
const DEG = 180 / Math.PI, RAD = Math.PI / 180;
const LS_KEY = "vqstudio.preview.guides";

/* ══ §1 純粋な算数（DOM を触らない・試験する所）═══════════════════ */

/**
 * 画面（wrap）とプロジェクトから「見え方」を作る。
 * stage 座標 = wrap の左上を原点とした CSS px。
 * @param {{vw:number,vh:number,projW:number,projH:number,zoom?:number,
 *          panX?:number,panY?:number,pad?:number,fit?:boolean}} o
 * @returns {{projW:number,projH:number,scale:number,offsetX:number,offsetY:number,
 *            vw:number,vh:number,zoom:number,fitZoom:number,panX:number,panY:number}}
 */
export function makeView(o) {
  const s = o || {};
  const vw = Math.max(1, finite(s.vw, 1)), vh = Math.max(1, finite(s.vh, 1));
  const projW = Math.max(1, finite(s.projW, 1920)), projH = Math.max(1, finite(s.projH, 1080));
  const pad = Math.max(0, finite(s.pad, 12));
  const fitZoom = clamp(Math.min((vw - pad * 2) / projW, (vh - pad * 2) / projH), 0.02, ZOOM_MAX);
  const zoom = s.fit ? fitZoom : clamp(finite(s.zoom, fitZoom), ZOOM_MIN, ZOOM_MAX);
  const panX = finite(s.panX, 0), panY = finite(s.panY, 0);
  return {
    projW, projH, vw, vh, zoom, fitZoom, panX, panY,
    scale: zoom,
    offsetX: vw / 2 + panX - projW * zoom / 2,
    offsetY: vh / 2 + panY - projH * zoom / 2
  };
}

/**
 * プロジェクト座標（出力 px）→ stage 座標（画面の CSS px）。
 * @param {number} x @param {number} y @param {Object} view
 * @returns {{x:number,y:number}}
 */
export function projectToStage(x, y, view) {
  const v = view || {};
  const k = finite(v.scale, 1) || 1;
  return { x: finite(v.offsetX, 0) + finite(x, 0) * k, y: finite(v.offsetY, 0) + finite(y, 0) * k };
}

/**
 * stage 座標 → プロジェクト座標（`projectToStage` の逆）。
 * @param {number} x @param {number} y @param {Object} view
 * @returns {{x:number,y:number}}
 */
export function stageToProject(x, y, view) {
  const v = view || {};
  const k = finite(v.scale, 1) || 1;
  return { x: (finite(x, 0) - finite(v.offsetX, 0)) / k, y: (finite(y, 0) - finite(v.offsetY, 0)) / k };
}

/**
 * Resolved 1 個の「画面に出る箱」（単位 = プロジェクト px）。
 * engine/canvas2d.js の `layerBox()` と同じ約束（CONTRACT-NOTE (2)）。
 *   ・scale 1 = 素材を画面に収めた（contain）大きさ
 *   ・x / y = 画面の幅・高さに対する割合（0 = 中央）
 *   ・w / h は **クロップ前**。見えている窓は v* で表す
 * @param {Object} r Resolved（core/eval.js）
 * @param {number} projW @param {number} projH
 * @param {{srcW?:number,srcH?:number}} [opts] 素材寸法を外から渡したいとき
 * @returns {{w:number,h:number,cx:number,cy:number,px:number,py:number,rot:number,
 *            flipH:boolean,flipV:boolean,k:number,
 *            crop:{l:number,t:number,r:number,b:number,w:number,h:number},
 *            vx:number,vy:number,vw:number,vh:number}}
 */
export function clipBox(r, projW, projH, opts) {
  const o = opts || {};
  const tr = (r && r.transform) || {};
  const cr = tr.crop || {};
  const W = Math.max(1, finite(projW, 1920)), H = Math.max(1, finite(projH, 1080));
  const a = (r && r.asset) || null;
  let aw = finite(o.srcW, finite(a && a.width, 0)), ah = finite(o.srcH, finite(a && a.height, 0));
  if (!(aw > 0) || !(ah > 0)) { aw = W; ah = H; }
  const k = Math.min(W / aw, H / ah);
  const sx = finite(tr.scaleX, 1) * finite(tr.scale, 1);
  const sy = finite(tr.scaleY, 1) * finite(tr.scale, 1);
  const w = Math.max(1e-3, aw * k * (Math.abs(sx) || 1));
  const h = Math.max(1e-3, ah * k * (Math.abs(sy) || 1));
  const cx = W * (0.5 + finite(tr.x, 0)), cy = H * (0.5 + finite(tr.y, 0));
  let l = clamp01(finite(cr.l, 0)), rr = clamp01(finite(cr.r, 0));
  let t = clamp01(finite(cr.t, 0)), b = clamp01(finite(cr.b, 0));
  if (l + rr > 0.98) { const q = 0.98 / (l + rr); l *= q; rr *= q; }
  if (t + b > 0.98) { const q = 0.98 / (t + b); t *= q; b *= q; }
  const cw = Math.max(1e-4, 1 - l - rr), ch = Math.max(1e-4, 1 - t - b);
  return {
    w, h, cx, cy,
    px: cx + (clamp01(finite(tr.anchorX, 0.5)) - 0.5) * w,
    py: cy + (clamp01(finite(tr.anchorY, 0.5)) - 0.5) * h,
    rot: finite(tr.rotate, finite(tr.rotateDeg, 0) * RAD),
    flipH: !!tr.flipH, flipV: !!tr.flipV, k,
    crop: { l, t, r: rr, b, w: cw, h: ch },
    vx: l * w, vy: t * h, vw: cw * w, vh: ch * h
  };
}

/**
 * 箱をプロジェクト px から stage px へ（拡大率は等方なので寸法は掛けるだけ）。
 * @param {Object} box @param {Object} view @returns {Object}
 */
export function boxToStage(box, view) {
  const b = box || {}, k = finite((view || {}).scale, 1) || 1;
  const c = projectToStage(finite(b.cx, 0), finite(b.cy, 0), view);
  const p = projectToStage(finite(b.px, 0), finite(b.py, 0), view);
  const crop = b.crop || { l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 };
  return {
    cx: c.x, cy: c.y, px: p.x, py: p.y,
    w: finite(b.w, 0) * k, h: finite(b.h, 0) * k,
    rot: finite(b.rot, 0), flipH: !!b.flipH, flipV: !!b.flipV, crop,
    vx: finite(b.vx, 0) * k, vy: finite(b.vy, 0) * k,
    vw: finite(b.vw, 0) * k, vh: finite(b.vh, 0) * k
  };
}

/** 箱の回転中心からの控え（中心 − 回転中心） */
function boxDelta(box) {
  return { dx: finite(box.cx, 0) - finite(box.px, finite(box.cx, 0)), dy: finite(box.cy, 0) - finite(box.py, finite(box.cy, 0)) };
}

/**
 * 箱の local 座標（中心からの px・回転前）→ 世界座標（同じ単位）。
 * @param {Object} box @param {number} lx @param {number} ly @returns {{x:number,y:number}}
 */
export function boxPoint(box, lx, ly) {
  const b = box || {}, rot = finite(b.rot, 0);
  const c = Math.cos(rot), s = Math.sin(rot);
  const d = boxDelta(b);
  const ax = d.dx + finite(lx, 0), ay = d.dy + finite(ly, 0);
  return {
    x: finite(b.px, finite(b.cx, 0)) + ax * c - ay * s,
    y: finite(b.py, finite(b.cy, 0)) + ax * s + ay * c
  };
}

/**
 * 世界座標 → 箱の local 座標（`boxPoint` の逆）。
 * @param {Object} box @param {number} x @param {number} y @returns {{x:number,y:number}}
 */
export function boxLocal(box, x, y) {
  const b = box || {}, rot = finite(b.rot, 0);
  const c = Math.cos(rot), s = Math.sin(rot);
  const d = boxDelta(b);
  const rx = finite(x, 0) - finite(b.px, finite(b.cx, 0));
  const ry = finite(y, 0) - finite(b.py, finite(b.cy, 0));
  return { x: rx * c + ry * s - d.dx, y: -rx * s + ry * c - d.dy };
}

/**
 * ハンドルの位置（stage px）。
 * @param {Object} box stage 座標の箱
 * @param {{rotate?:boolean,gap?:number,crop?:boolean}} [opts]
 * @returns {Object} { nw:{x,y}, …, rotate:{x,y}, center:{x,y} }
 */
export function handlePoints(box, opts) {
  const o = opts || {}, b = box || {};
  const useCrop = !!o.crop;
  const hw = (useCrop ? finite(b.vw, finite(b.w, 0)) : finite(b.w, 0)) / 2;
  const hh = (useCrop ? finite(b.vh, finite(b.h, 0)) : finite(b.h, 0)) / 2;
  /* クロップ窓は箱の中で偏っているので、その中心をずらす */
  let ox = 0, oy = 0;
  if (useCrop) {
    ox = finite(b.vx, 0) + finite(b.vw, 0) / 2 - finite(b.w, 0) / 2;
    oy = finite(b.vy, 0) + finite(b.vh, 0) / 2 - finite(b.h, 0) / 2;
  }
  const out = {};
  for (const id of HANDLE_IDS) {
    const sg = HANDLE_SIGN[id];
    out[id] = boxPoint(b, ox + sg[0] * hw, oy + sg[1] * hh);
  }
  out.center = boxPoint(b, ox, oy);
  if (o.rotate !== false) out.rotate = boxPoint(b, ox, oy - hh - Math.max(8, finite(o.gap, ROTATE_GAP)));
  return out;
}

/**
 * ハンドルの当たり判定。座標も rect も **同じ単位**（stage px）で渡す。
 * rect は `{cx,cy,w,h,rot,px,py}`（中心指定）か `{x,y,w,h,rotate}`（左上指定）。
 * @param {number} x @param {number} y @param {Object} rect
 * @param {{size?:number,rotate?:boolean,center?:boolean,edges?:boolean,
 *          body?:boolean,gap?:number,crop?:boolean,handles?:boolean}} [opts]
 * @returns {string|null} "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"rotate"|"center"|"body"|null
 */
export function hitHandle(x, y, rect, opts) {
  const o = opts || {};
  const b = normRect(rect);
  if (!b) return null;
  if (o.handles === false) return hitBody(x, y, b, o);
  const size = Math.max(4, finite(o.size, HANDLE_HIT));
  const pts = handlePoints(b, { rotate: o.rotate !== false, gap: o.gap, crop: !!o.crop });
  const near = (p) => p && Math.abs(finite(x, 0) - p.x) <= size && Math.abs(finite(y, 0) - p.y) <= size;
  if (o.rotate !== false && near(pts.rotate)) return "rotate";
  for (const id of HANDLE_IDS) {
    const sg = HANDLE_SIGN[id];
    if (sg[0] !== 0 && sg[1] !== 0 && near(pts[id])) return id;     // 角が先
  }
  if (o.edges !== false) {
    for (const id of HANDLE_IDS) {
      const sg = HANDLE_SIGN[id];
      if ((sg[0] === 0 || sg[1] === 0) && near(pts[id])) return id;
    }
  }
  if (o.center && near(pts.center)) return "center";
  return hitBody(x, y, b, o);
}

/** 箱の中身（見えている窓）に入っているか。ハンドルを見ないときはここだけ使う */
function hitBody(x, y, b, o) {
  if (o.body === false) return null;
  const l = boxLocal(b, finite(x, 0), finite(y, 0));
  const hw = (o.crop ? finite(b.vw, b.w) : b.w) / 2, hh = (o.crop ? finite(b.vh, b.h) : b.h) / 2;
  let ox = 0, oy = 0;
  if (o.crop) {
    ox = finite(b.vx, 0) + finite(b.vw, 0) / 2 - finite(b.w, 0) / 2;
    oy = finite(b.vy, 0) + finite(b.vh, 0) / 2 - finite(b.h, 0) / 2;
  }
  const inside = Math.abs(l.x - ox) <= hw + 0.5 && Math.abs(l.y - oy) <= hh + 0.5;
  return inside ? "body" : null;
}

/** rect の 2 通りの書き方を 1 つに揃える（無効なら null） */
function normRect(rect) {
  const r = rect;
  if (!r || typeof r !== "object") return null;
  const w = finite(r.w, 0), h = finite(r.h, 0);
  if (!(w > 0) || !(h > 0)) return null;
  const hasCenter = r.cx !== undefined && r.cx !== null;
  const cx = hasCenter ? finite(r.cx, 0) : finite(r.x, 0) + w / 2;
  const cy = hasCenter ? finite(r.cy, 0) : finite(r.y, 0) + h / 2;
  const rot = r.rot !== undefined ? finite(r.rot, 0) : finite(r.rotate, 0);
  return {
    cx, cy, w, h, rot,
    px: r.px !== undefined && r.px !== null ? finite(r.px, cx) : cx,
    py: r.py !== undefined && r.py !== null ? finite(r.py, cy) : cy,
    vx: finite(r.vx, 0), vy: finite(r.vy, 0),
    vw: finite(r.vw, w), vh: finite(r.vh, h),
    crop: r.crop || { l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 }
  };
}

/** 角度を (-180, 180] の度に揃える @param {number} deg @returns {number} */
export function normalizeAngle(deg) {
  let d = finite(deg, 0) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d === 0 ? 0 : d;
}

/** 15 度刻みへ吸着（step を渡せば任意） @param {number} deg @param {number} [step=15] */
export function snapAngle(deg, step) {
  const s = Math.abs(finite(step, 15)) || 15;
  return normalizeAngle(Math.round(finite(deg, 0) / s) * s);
}

/**
 * 変形の値を丸める（**部分 patch のまま**返すので ops へ そのまま渡せる）。
 * 在るキーだけ丸め、知らないキーはそのまま写す。入力は書き換えない。
 * @param {Object} t transform か その一部
 * @returns {Object}
 */
export function clampTransform(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return {};
  const o = {};
  for (const k in t) if (Object.prototype.hasOwnProperty.call(t, k)) o[k] = t[k];
  if ("x" in o) o.x = clamp(finite(o.x, 0), -POS_LIMIT, POS_LIMIT);
  if ("y" in o) o.y = clamp(finite(o.y, 0), -POS_LIMIT, POS_LIMIT);
  for (const k of ["scale", "scaleX", "scaleY"]) {
    if (k in o) o[k] = clamp(finite(o[k], 1), SCALE_MIN, SCALE_MAX);
  }
  if ("rotate" in o) o.rotate = normalizeAngle(o.rotate);
  if ("anchorX" in o) o.anchorX = clamp01(finite(o.anchorX, 0.5));
  if ("anchorY" in o) o.anchorY = clamp01(finite(o.anchorY, 0.5));
  if ("flipH" in o) o.flipH = !!o.flipH;
  if ("flipV" in o) o.flipV = !!o.flipV;
  if (o.crop && typeof o.crop === "object") {
    const c = o.crop;
    let l = clamp(finite(c.l, 0), 0, 0.98), r = clamp(finite(c.r, 0), 0, 0.98);
    let tp = clamp(finite(c.t, 0), 0, 0.98), b = clamp(finite(c.b, 0), 0, 0.98);
    if (l + r > 0.98) { const q = 0.98 / (l + r); l *= q; r *= q; }
    if (tp + b > 0.98) { const q = 0.98 / (tp + b); tp *= q; b *= q; }
    o.crop = { l, t: tp, r, b };
  }
  return o;
}

/**
 * ハンドルを引いた先から **新しい寸法**を出す（位置合わせは呼ぶ側）。
 * local は「掴んだ箱の local 座標（中心からの px・回転前）」。
 * @param {{w:number,h:number}} box0 掴んだ時の寸法
 * @param {string} handle @param {{x:number,y:number}} local
 * @param {{aspect?:boolean,fromCenter?:boolean,min?:number}} [opts]
 * @returns {{w:number,h:number}}
 */
export function resizeFromHandle(box0, handle, local, opts) {
  const o = opts || {};
  const w0 = Math.max(1e-3, finite((box0 || {}).w, 1)), h0 = Math.max(1e-3, finite((box0 || {}).h, 1));
  const sg = HANDLE_SIGN[handle];
  const min = Math.max(1e-3, finite(o.min, MIN_BOX_PX));
  if (!sg) return { w: w0, h: h0 };
  const lx = finite((local || {}).x, 0), ly = finite((local || {}).y, 0);
  let w = w0, h = h0;
  if (sg[0] !== 0) w = o.fromCenter ? 2 * sg[0] * lx : sg[0] * lx + w0 / 2;
  if (sg[1] !== 0) h = o.fromCenter ? 2 * sg[1] * ly : sg[1] * ly + h0 / 2;
  if (o.aspect) {
    /* 比率保持: 変化の大きい軸に合わせる（角は両軸、辺は掴んだ軸） */
    const rw = sg[0] !== 0 ? w / w0 : 1, rh = sg[1] !== 0 ? h / h0 : 1;
    const r = Math.abs(rw - 1) >= Math.abs(rh - 1) ? rw : rh;
    w = w0 * r; h = h0 * r;
  }
  return { w: Math.max(min, w), h: Math.max(min, h) };
}

/**
 * クロップのハンドルを引いた先から新しい `crop`（0..1 の割合）を出す。
 * local は 箱の local 座標（中心からの px・回転前）、w/h は **クロップ前**の寸法。
 * @param {{l:number,t:number,r:number,b:number}} crop0
 * @param {string} handle @param {{x:number,y:number}} local
 * @param {{w:number,h:number,ratio?:number,min?:number}} box
 * @returns {{l:number,t:number,r:number,b:number}}
 */
export function cropFromHandle(crop0, handle, local, box) {
  const c0 = crop0 || {}, bx = box || {};
  const w = Math.max(1e-3, finite(bx.w, 1)), h = Math.max(1e-3, finite(bx.h, 1));
  const minF = clamp(finite(bx.min, 0.04), 0.01, 0.5);
  const sg = HANDLE_SIGN[handle];
  let l = clamp(finite(c0.l, 0), 0, 0.98), r = clamp(finite(c0.r, 0), 0, 0.98);
  let t = clamp(finite(c0.t, 0), 0, 0.98), b = clamp(finite(c0.b, 0), 0, 0.98);
  if (!sg) return { l, t, r, b };
  const u = clamp01((finite((local || {}).x, 0) + w / 2) / w);   // 0..1（左から）
  const v = clamp01((finite((local || {}).y, 0) + h / 2) / h);   // 0..1（上から）
  if (sg[0] < 0) l = clamp(u, 0, 1 - r - minF);
  if (sg[0] > 0) r = clamp(1 - u, 0, 1 - l - minF);
  if (sg[1] < 0) t = clamp(v, 0, 1 - b - minF);
  if (sg[1] > 0) b = clamp(1 - v, 0, 1 - t - minF);
  const ratio = finite(bx.ratio, 0);
  if (ratio > 0) {
    /* 見えている窓（px）の縦横比を ratio に合わせる。掴んだ軸を正として反対を直す */
    const cw = 1 - l - r, ch = 1 - t - b;
    const pxW = cw * w, pxH = ch * h;
    if (sg[0] !== 0) {
      const wantH = clamp((pxW / ratio) / h, minF, 1);
      const cy = t + ch / 2, half = wantH / 2;
      t = clamp(cy - half, 0, 1 - minF); b = clamp(1 - (t + wantH), 0, 1 - t - minF);
    } else {
      const wantW = clamp((pxH * ratio) / w, minF, 1);
      const cx = l + cw / 2, half = wantW / 2;
      l = clamp(cx - half, 0, 1 - minF); r = clamp(1 - (l + wantW), 0, 1 - l - minF);
    }
  }
  return { l, t, r, b };
}

/**
 * 比率から `crop` を出す（「9:16 に切り抜く」用）。中央を残す。
 * @param {number} ratio 幅/高さ @param {number} w @param {number} h クロップ前の px
 * @returns {{l:number,t:number,r:number,b:number}}
 */
export function ratioCrop(ratio, w, h) {
  const rr = finite(ratio, 0);
  if (!(rr > 0) || !(w > 0) || !(h > 0)) return { l: 0, t: 0, r: 0, b: 0 };
  const cur = w / h;
  if (Math.abs(cur - rr) < 1e-6) return { l: 0, t: 0, r: 0, b: 0 };
  if (cur > rr) { const keep = (h * rr) / w, cut = (1 - keep) / 2; return { l: cut, t: 0, r: cut, b: 0 }; }
  const keep = (w / rr) / h, cut = (1 - keep) / 2;
  return { l: 0, t: cut, r: 0, b: cut };
}

/**
 * 整列ガイド。動かしている点の候補と、揃える先の候補を突き合わせる。
 * @param {number[]} moving 動いている座標（同じ軸の値。例: 左端/中心/右端）
 * @param {Array<{v:number,kind?:string}>} targets 揃える先
 * @param {number} tol 許容（同じ単位）
 * @returns {{delta:number,line:number,kind:string}|null}
 */
export function alignSnap(moving, targets, tol) {
  const lim = Math.abs(finite(tol, SNAP_PX));
  let best = null;
  const ms = Array.isArray(moving) ? moving : [];
  const ts = Array.isArray(targets) ? targets : [];
  for (const m of ms) {
    if (!Number.isFinite(m)) continue;
    for (const t of ts) {
      const v = finite(t && t.v, NaN);
      if (!Number.isFinite(v)) continue;
      const d = v - m;
      if (Math.abs(d) > lim) continue;
      if (!best || Math.abs(d) < Math.abs(best.delta)) best = { delta: d, line: v, kind: (t && t.kind) || "edge" };
    }
  }
  return best;
}

/**
 * 「画面を埋める」倍率。クロップ後の窓が画面を覆う最小の倍率。
 * @param {Object} box clipBox の返り値 @param {number} projW @param {number} projH
 * @returns {number}
 */
export function fillScaleFor(box, projW, projH) {
  const b = box || {}, cw = Math.max(1e-4, finite(b.crop && b.crop.w, 1)), ch = Math.max(1e-4, finite(b.crop && b.crop.h, 1));
  const w = Math.max(1e-3, finite(b.w, 1)), h = Math.max(1e-3, finite(b.h, 1));
  const need = Math.max(finite(projW, 1) / (w * cw), finite(projH, 1) / (h * ch));
  return clamp(need, SCALE_MIN, SCALE_MAX);
}

/** マスクの uv（0..1・素材全体）→ 箱の local px */
function maskToLocal(m, box) {
  return { x: (finite(m.x, 0.5) - 0.5) * finite(box.w, 0), y: (finite(m.y, 0.5) - 0.5) * finite(box.h, 0) };
}

/* ══ §2 小道具（DOM・widgets の「在れば使う」）═══════════════════ */

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
function btn(cls, label, title, onClick, testId) {
  const b = mk("button", cls, label);
  b.type = "button";
  if (title) { b.title = title; b.setAttribute("aria-label", title); }
  if (testId) b.setAttribute("data-test", testId);
  b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); onClick(ev); });
  return b;
}
/** widgets の関数を「在れば」取る（CONTRACT-NOTE (1)） */
/** 見せる / 隠す（`.hidden` が未定義でも効くように inline も添える） */
function showEl(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
  el.style.display = on ? "" : "none";
}
function wfn(widgets, name) {
  return widgets && typeof widgets[name] === "function" ? widgets[name].bind(widgets) : null;
}
function readGuides() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(LS_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    /* 覚えた値も検める（手で書き換えられた localStorage を信じない） */
    return {
      safe: !!o.safe, center: !!o.center,
      grid: GRID_MODES.indexOf(String(o.grid)) >= 0 ? String(o.grid) : "none"
    };
  } catch (_e) { return null; }
}
function writeGuides(o) {
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(LS_KEY, JSON.stringify(o)); }
  catch (_e) { /* プライベートモードでは黙って諦める */ }
}

/* ══ §3 本体 ═════════════════════════════════════════════════════ */

/**
 * プレビュー上の操作を起こす（契約書 §7）。
 * @param {{store:Object, els:Object, compositor?:Object, transport?:Object, widgets?:Object}} deps
 * @returns {{render:Function, setMode:Function, mode:string, fit:Function,
 *            setZoom:Function, setGuides:Function, dispose:Function}}
 */
export function createPreview(deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.subscribe !== "function") throw new Error("createPreview: store が必要です");
  const els = d.els || {};
  const compositor = d.compositor || null;
  const transport = d.transport || null;
  const widgets = d.widgets || null;

  const wrap = els.previewWrap || document.getElementById("previewWrap");
  const stage = els.previewStage || document.getElementById("previewStage");
  const overlay = els.previewOverlay || document.getElementById("previewOverlay");
  const hud = els.previewHud || document.getElementById("previewHud");
  if (!wrap) L.warn("#previewWrap が無い（プレビュー操作は出せない）");

  const ctx2d = overlay && typeof overlay.getContext === "function" ? overlay.getContext("2d") : null;
  const toast = (m, o) => { const f = wfn(widgets, "toast"); if (f) { try { f(m, o); return; } catch (_e) { /* noop */ } } L.warn(m); };

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const st = {
    mode: "select",
    zoomMode: "fit",            // "fit" | "manual"
    zoom: 1, panX: 0, panY: 0,
    view: makeView({ vw: 1, vh: 1, projW: 1920, projH: 1080, fit: true }),
    rect: null,                 // wrap の画面上の位置（pointer → stage 用）
    dpr: 1,
    playing: false,
    time: 0,
    spaceDown: false,
    guides: Object.assign({ safe: false, grid: "none", center: false }, readGuides() || {}),
    cropRatio: "free",
    lastBoxKey: "",
    dirty: false,
    rafId: 0,
    disposed: false
  };
  const drag = {
    kind: null, handle: null, clipId: null,
    start: null, box0: null, boxS0: null, t0: null, crop0: null, mask0: null,
    live: null, keyed: false, moved: false, wrote: false, guides: [], pointIndex: -1,
    pinch: null, pixels: null, pan0: null, angle0: 0, pivotS: null, downOnSel: false
  };
  const pointers = new Map();
  let longTimer = 0, unsubs = [];
  let lastTap = { t: 0, x: 0, y: 0 };      // 前に「動かさずに離した」所
  let pendingTap = null;                   // 今押している所（離す時に確定）

  /* ══ §4 見え方（ズーム・パン・寸法）════════════════════════════ */

  function settings() { const p = store.project || {}; return p.settings || {}; }
  function fps() { return finite(settings().fps, 30) || 30; }

  function measure() {
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    st.rect = r;
    st.dpr = Math.min(2, Math.max(1, finite(globalThis.devicePixelRatio, 1)));
    const s = settings();
    st.view = makeView({
      vw: r.width, vh: r.height,
      projW: finite(s.width, 1920), projH: finite(s.height, 1080),
      zoom: st.zoom, panX: st.panX, panY: st.panY,
      pad: r.width < 480 ? 6 : 14,
      fit: st.zoomMode === "fit"
    });
    st.zoom = st.view.zoom;
    clampPan();
    applyLayout();
  }

  /** パンの行き過ぎを止める（画面の半分までは逃がす = 端も触れる） */
  function clampPan() {
    const v = st.view;
    const limX = Math.max(v.vw * 0.5, (v.projW * v.scale - v.vw) / 2 + 24);
    const limY = Math.max(v.vh * 0.5, (v.projH * v.scale - v.vh) / 2 + 24);
    st.panX = clamp(st.panX, -limX, limX);
    st.panY = clamp(st.panY, -limY, limY);
    st.view = makeView({
      vw: v.vw, vh: v.vh, projW: v.projW, projH: v.projH,
      zoom: st.zoom, panX: st.panX, panY: st.panY, pad: v.vw < 480 ? 6 : 14,
      fit: st.zoomMode === "fit"
    });
  }

  function applyLayout() {
    const v = st.view;
    if (stage) {
      const s = stage.style;
      s.position = "absolute";
      s.left = Math.round(v.offsetX) + "px";
      s.top = Math.round(v.offsetY) + "px";
      s.width = Math.round(v.projW * v.scale) + "px";
      s.height = Math.round(v.projH * v.scale) + "px";
      s.margin = "0";
    }
    if (overlay) {
      const w = Math.max(1, Math.round(v.vw * st.dpr)), h = Math.max(1, Math.round(v.vh * st.dpr));
      if (overlay.width !== w) overlay.width = w;
      if (overlay.height !== h) overlay.height = h;
      const s = overlay.style;
      s.position = "absolute"; s.left = "0"; s.top = "0";
      s.width = Math.round(v.vw) + "px"; s.height = Math.round(v.vh) + "px";
      s.pointerEvents = "none";
    }
    syncZoomLabel();
  }

  /** 画面に収める（契約の `fit()`） */
  function fit() {
    st.zoomMode = "fit"; st.panX = 0; st.panY = 0;
    measure(); invalidate(); return st.view.zoom;
  }
  /** 倍率を決める（契約の `setZoom(z)`）。中心は画面の中心 */
  function setZoom(z, anchor) {
    const before = st.view;
    const next = clamp(finite(z, 1), ZOOM_MIN, ZOOM_MAX);
    if (anchor && Number.isFinite(anchor.x)) {
      /* 指（カーソル）の下の絵を動かさない */
      const p = stageToProject(anchor.x, anchor.y, before);
      st.zoomMode = "manual"; st.zoom = next;
      measure();
      const after = projectToStage(p.x, p.y, st.view);
      st.panX += anchor.x - after.x; st.panY += anchor.y - after.y;
      measure();
    } else {
      st.zoomMode = "manual"; st.zoom = next; measure();
    }
    invalidate();
    return st.view.zoom;
  }
  /** 100% と「合わせる」を行き来（ダブルタップ） */
  function toggleZoom(anchor) {
    if (st.zoomMode === "fit" || Math.abs(st.zoom - st.view.fitZoom) < 1e-3) setZoom(1, anchor);
    else fit();
  }

  /* ══ §5 選択と箱 ══════════════════════════════════════════════ */

  function selectedIds() {
    const s = store.selection || {};
    return Array.isArray(s.clipIds) ? s.clipIds : [];
  }
  function primaryId() { const ids = selectedIds(); return ids.length ? ids[ids.length - 1] : null; }

  /** その時刻の Resolved を全部（下 → 上） */
  function resolvedNow() {
    try { return clipsAt(store.project, st.time, { fps: fps() }) || []; }
    catch (e) { L.warn("clipsAt が失敗", e && e.message); return []; }
  }

  /** clipId から Resolved を 1 個（居なければ null） */
  function resolvedOf(clipId) {
    if (!clipId) return null;
    const f = findClip(store.project, clipId);
    if (!f) return null;
    const asset = f.clip.assetId ? assetById(store.project, f.clip.assetId) : null;
    try { return resolveClip(f.clip, st.time, { fps: fps(), asset, track: f.track }); }
    catch (e) { L.warn("resolveClip が失敗", e && e.message); return null; }
  }

  /** 触れる主役（選択の最後）の {clip, resolved, box(project px), boxS(stage px)} */
  function target() {
    const id = primaryId();
    if (!id) return null;
    const r = resolvedOf(id);
    if (!r) return null;
    const f = findClip(store.project, id);
    if (!f || !f.clip) return null;
    const v = st.view;
    const box = clipBox(r, v.projW, v.projH);
    return { id, clip: f.clip, track: f.track, r, box, boxS: boxToStage(box, v) };
  }

  function hitSize() { return isTouch() || st.view.vw < 720 ? HANDLE_HIT_TOUCH : HANDLE_HIT; }

  /* ══ §6 描画（overlay canvas。必要な時だけ）════════════════════ */

  /* 色は tokens.css を第一に。**毎回 getComputedStyle を読むと描画が重い**ので
     1.5 秒だけ覚える（テーマを切り替えても次の描画で追いつく）。 */
  const COL_DEF = [
    ["frame", "--vqs-pv-frame", "rgba(233,238,245,.28)"],
    ["sel", "--vqs-accent", "#4f8cff"],
    ["handle", "--vqs-pv-handle", "#ffffff"],
    ["guide", "--vqs-pv-guide", "rgba(233,238,245,.20)"],
    ["safe", "--vqs-pv-safe", "rgba(255,214,102,.55)"],
    ["snap", "--vqs-pv-snap", "#ff4dd8"],
    ["veil", "--vqs-pv-veil", "rgba(6,8,12,.62)"],
    ["mask", "--vqs-pv-mask", "#56ff8c"]
  ];
  let colCache = null, colAt = 0;
  function colors() {
    const now = Date.now();
    if (colCache && now - colAt < 1500) return colCache;
    const o = {};
    for (const [k, name, def] of COL_DEF) o[k] = cssVar(name, def);
    colCache = o; colAt = now;
    return o;
  }
  const COL = {
    frame: () => colors().frame, sel: () => colors().sel, handle: () => colors().handle,
    guide: () => colors().guide, safe: () => colors().safe, snap: () => colors().snap,
    veil: () => colors().veil, mask: () => colors().mask
  };

  function invalidate() {
    if (st.disposed) return;
    st.dirty = true;
    if (st.rafId) return;
    st.rafId = requestAnimationFrame(() => { st.rafId = 0; if (st.dirty) draw(); });
  }

  function draw() {
    st.dirty = false;
    if (!ctx2d || !overlay) return;
    const v = st.view, c = ctx2d;
    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.clearRect(0, 0, v.vw + 2, v.vh + 2);
    const a = projectToStage(0, 0, v), b = projectToStage(v.projW, v.projH, v);
    const fr = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };

    drawGuides(c, fr);
    /* 枠（プロジェクトの外周） */
    c.save(); c.strokeStyle = COL.frame(); c.lineWidth = 1;
    c.strokeRect(fr.x + 0.5, fr.y + 0.5, Math.max(1, fr.w - 1), Math.max(1, fr.h - 1)); c.restore();

    const alpha = st.playing && !drag.kind ? 0.34 : 1;
    const tg = target();
    if (tg) {
      if (st.mode === "crop") drawCrop(c, tg, alpha);
      else if (st.mode === "mask") drawMask(c, tg, alpha);
      else drawSelection(c, tg, alpha);
    }
    /* 選択が複数なら 主役以外にも薄い枠 */
    const ids = selectedIds();
    if (ids.length > 1) {
      c.save(); c.globalAlpha = 0.45 * alpha; c.strokeStyle = COL.sel(); c.lineWidth = 1;
      for (const id of ids) {
        if (tg && id === tg.id) continue;
        const r = resolvedOf(id); if (!r) continue;
        outline(c, boxToStage(clipBox(r, v.projW, v.projH), v), true);
        c.stroke();
      }
      c.restore();
    }
    drawSnapLines(c);
    if (st.mode === "chroma-pick" && drag.kind === "chroma" && drag.live) drawPickMark(c, drag.live);
  }

  /** 箱の輪郭を path に（crop = 見えている窓） */
  function outline(c, boxS, useCrop) {
    const pts = handlePoints(boxS, { rotate: false, crop: !!useCrop });
    c.beginPath();
    c.moveTo(pts.nw.x, pts.nw.y); c.lineTo(pts.ne.x, pts.ne.y);
    c.lineTo(pts.se.x, pts.se.y); c.lineTo(pts.sw.x, pts.sw.y);
    c.closePath();
    return pts;
  }

  function drawGuides(c, fr) {
    const g = st.guides;
    c.save();
    c.lineWidth = 1;
    if (g.grid === "thirds" || g.grid === "grid9") {
      const n = g.grid === "thirds" ? 3 : 9;
      c.strokeStyle = COL.guide();
      c.beginPath();
      for (let i = 1; i < n; i++) {
        const x = Math.round(fr.x + fr.w * i / n) + 0.5, y = Math.round(fr.y + fr.h * i / n) + 0.5;
        c.moveTo(x, fr.y); c.lineTo(x, fr.y + fr.h);
        c.moveTo(fr.x, y); c.lineTo(fr.x + fr.w, y);
      }
      c.stroke();
    }
    if (g.center) {
      c.strokeStyle = COL.guide();
      c.setLineDash([5, 5]);
      const cx = Math.round(fr.x + fr.w / 2) + 0.5, cy = Math.round(fr.y + fr.h / 2) + 0.5;
      c.beginPath();
      c.moveTo(cx, fr.y); c.lineTo(cx, fr.y + fr.h);
      c.moveTo(fr.x, cy); c.lineTo(fr.x + fr.w, cy);
      c.stroke();
      c.setLineDash([]);
    }
    if (g.safe) {
      c.strokeStyle = COL.safe();
      c.setLineDash([6, 4]);
      for (const k of [SAFE_ACTION, SAFE_TITLE]) {
        const w = fr.w * k, h = fr.h * k;
        c.strokeRect(Math.round(fr.x + (fr.w - w) / 2) + 0.5, Math.round(fr.y + (fr.h - h) / 2) + 0.5, Math.round(w), Math.round(h));
      }
      c.setLineDash([]);
    }
    c.restore();
  }

  function drawSelection(c, tg, alpha) {
    const boxS = drag.kind && drag.live && drag.live.boxS ? drag.live.boxS : tg.boxS;
    const size = hitSize();
    c.save();
    c.globalAlpha = alpha;
    /* 掴んでいる間に元の位置を薄く残す（どれだけ動いたか分かる） */
    if (drag.kind && drag.live && drag.live.boxS) {
      c.save(); c.globalAlpha = 0.25 * alpha; c.setLineDash([4, 4]);
      c.strokeStyle = COL.sel(); c.lineWidth = 1;
      outline(c, tg.boxS, false); c.stroke(); c.restore();
    }
    c.strokeStyle = COL.sel(); c.lineWidth = 1.6;
    const pts = outline(c, boxS, false);
    c.stroke();
    /* クロップが在るなら 見えている窓も出す */
    const cr = boxS.crop || {};
    if (finite(cr.l, 0) + finite(cr.t, 0) + finite(cr.r, 0) + finite(cr.b, 0) > 1e-4) {
      c.save(); c.globalAlpha = 0.6 * alpha; c.setLineDash([3, 3]); c.lineWidth = 1;
      outline(c, boxS, true); c.stroke(); c.restore();
    }
    /* 回転ハンドル（再生中は薄いまま描く = 位置は見えるが邪魔しない） */
    const rp = handlePoints(boxS, { rotate: true, gap: ROTATE_GAP });
    c.beginPath(); c.moveTo(pts.n.x, pts.n.y); c.lineTo(rp.rotate.x, rp.rotate.y);
    c.strokeStyle = COL.sel(); c.lineWidth = 1; c.stroke();
    dot(c, rp.rotate.x, rp.rotate.y, Math.max(5, size * 0.24), true);
    /* 8 点 */
    for (const id of HANDLE_IDS) {
      const p = pts[id];
      const corner = HANDLE_SIGN[id][0] !== 0 && HANDLE_SIGN[id][1] !== 0;
      square(c, p.x, p.y, corner ? Math.max(7, size * 0.3) : Math.max(6, size * 0.26));
    }
    /* 中心（回転・拡大の基準 = anchor で決まる px,py） */
    const ctr = { x: finite(boxS.px, boxS.cx), y: finite(boxS.py, boxS.cy) };
    c.save(); c.strokeStyle = COL.handle(); c.lineWidth = 1.4; c.globalAlpha = 0.85 * alpha;
    c.beginPath();
    c.moveTo(ctr.x - 7, ctr.y); c.lineTo(ctr.x + 7, ctr.y);
    c.moveTo(ctr.x, ctr.y - 7); c.lineTo(ctr.x, ctr.y + 7);
    c.stroke(); c.restore();
    c.restore();
  }

  function drawCrop(c, tg, alpha) {
    const boxS = drag.kind && drag.live && drag.live.boxS ? drag.live.boxS : tg.boxS;
    c.save();
    c.globalAlpha = alpha;
    /* 外側を暗く（画面全体 − 見えている窓） */
    c.save();
    c.beginPath();
    c.rect(0, 0, st.view.vw, st.view.vh);
    const pts = handlePoints(boxS, { rotate: false, crop: true });
    c.moveTo(pts.nw.x, pts.nw.y); c.lineTo(pts.sw.x, pts.sw.y);
    c.lineTo(pts.se.x, pts.se.y); c.lineTo(pts.ne.x, pts.ne.y);
    c.closePath();
    c.fillStyle = COL.veil(); c.fill("evenodd");
    c.restore();
    /* クロップ前の輪郭（どこまで戻せるか） */
    c.save(); c.globalAlpha = 0.5 * alpha; c.setLineDash([4, 4]); c.lineWidth = 1;
    c.strokeStyle = COL.frame(); outline(c, boxS, false); c.stroke(); c.restore();
    /* 窓の枠と 3 分割の線 */
    c.strokeStyle = COL.handle(); c.lineWidth = 1.6;
    outline(c, boxS, true); c.stroke();
    c.save(); c.globalAlpha = 0.35 * alpha; c.lineWidth = 1; c.strokeStyle = COL.handle();
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      const p1 = lerpPt(pts.nw, pts.ne, t), p2 = lerpPt(pts.sw, pts.se, t);
      const q1 = lerpPt(pts.nw, pts.sw, t), q2 = lerpPt(pts.ne, pts.se, t);
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y);
      c.moveTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.stroke();
    }
    c.restore();
    const size = hitSize();
    for (const id of HANDLE_IDS) {
      const q = pts[id];
      const corner = HANDLE_SIGN[id][0] !== 0 && HANDLE_SIGN[id][1] !== 0;
      if (corner) corner7(c, q, Math.max(9, size * 0.34));
      else square(c, q.x, q.y, Math.max(6, size * 0.24));
    }
    c.restore();
  }

  function drawMask(c, tg, alpha) {
    const m = drag.kind && drag.live && drag.live.mask ? drag.live.mask : (tg.r.mask || null);
    const boxS = tg.boxS;
    c.save(); c.globalAlpha = alpha;
    c.strokeStyle = COL.sel(); c.lineWidth = 1; c.setLineDash([4, 4]);
    outline(c, boxS, false); c.stroke(); c.setLineDash([]);
    if (!m) { c.restore(); return; }
    const type = String(m.type || "rect");
    const ctr = maskToLocal(m, boxS);
    const hw = Math.abs(finite(m.w, 0.5)) * finite(boxS.w, 0) / 2;
    const hh = Math.abs(finite(m.h, 0.5)) * finite(boxS.h, 0) / 2;
    const rot = finite(m.rotateDeg, finite(m.rotate, 0) * DEG) * RAD;
    const cs0 = Math.cos(rot), sn0 = Math.sin(rot);
    /* マスクの local（回転前・中心が原点）→ stage px */
    const P = (lx, ly) => boxPoint(boxS, ctr.x + lx * cs0 - ly * sn0, ctr.y + lx * sn0 + ly * cs0);
    c.strokeStyle = COL.mask(); c.lineWidth = 1.8;
    if (type === "ellipse" || type === "radial") {
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48 * Math.PI * 2;
        const p = P(Math.cos(t) * hw, Math.sin(t) * hh);
        if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.closePath(); c.stroke();
    } else if (type === "polygon") {
      const pts = Array.isArray(m.points) ? m.points : [];
      if (pts.length >= 2) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i] || [];
          const p = boxPoint(boxS, (finite(q[0], 0.5) - 0.5) * boxS.w, (finite(q[1], 0.5) - 0.5) * boxS.h);
          if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.closePath(); c.stroke();
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i] || [];
          const p = boxPoint(boxS, (finite(q[0], 0.5) - 0.5) * boxS.w, (finite(q[1], 0.5) - 0.5) * boxS.h);
          dot(c, p.x, p.y, drag.pointIndex === i ? 7 : 5, true);
        }
      }
    } else if (type === "linear") {
      const len = Math.max(finite(boxS.w, 0), finite(boxS.h, 0));
      const p1 = P(-len, 0), p2 = P(len, 0);
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
      /* 向きの矢（マスクが残す側） */
      const tip = P(0, -Math.max(24, hh * 0.4));
      const base = P(0, 0);
      c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(tip.x, tip.y); c.stroke();
      dot(c, tip.x, tip.y, 6, true);
    } else {
      c.beginPath();
      const a = P(-hw, -hh), b = P(hw, -hh), e = P(hw, hh), f = P(-hw, hh);
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(e.x, e.y); c.lineTo(f.x, f.y);
      c.closePath(); c.stroke();
    }
    if (type !== "polygon") {
      /* 4 点 + 回転 + 中心 + ぼかし幅 */
      if (type !== "linear") {
        for (const s of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const q = P(s[0] * hw, s[1] * hh);
          square(c, q.x, q.y, 7);
        }
      }
      const rp = P(0, -hh - ROTATE_GAP);
      dot(c, rp.x, rp.y, 6, true);
      const cp = P(0, 0); dot(c, cp.x, cp.y, 5, true);
      const fdist = hh + clamp01(finite(m.feather, 0)) * finite(boxS.h, 0);
      const fp = P(0, fdist);
      c.save(); c.globalAlpha = 0.7 * alpha; c.setLineDash([3, 3]); c.strokeStyle = COL.mask();
      c.beginPath(); c.moveTo(cp.x, cp.y); c.lineTo(fp.x, fp.y); c.stroke(); c.restore();
      dot(c, fp.x, fp.y, 6, false);
    }
    if (m.invert) {
      c.save(); c.globalAlpha = 0.8 * alpha; c.fillStyle = COL.mask();
      c.font = "600 11px system-ui, -apple-system, sans-serif";
      const p = P(0, -hh - ROTATE_GAP - 14);
      c.textAlign = "center"; c.fillText("反転", p.x, p.y); c.restore();
    }
    c.restore();
  }

  function drawSnapLines(c) {
    if (!drag.guides || !drag.guides.length) return;
    c.save();
    c.strokeStyle = COL.snap(); c.lineWidth = 1; c.setLineDash([]);
    for (const g of drag.guides) {
      c.beginPath();
      if (g.axis === "x") { const x = Math.round(g.at) + 0.5; c.moveTo(x, 0); c.lineTo(x, st.view.vh); }
      else { const y = Math.round(g.at) + 0.5; c.moveTo(0, y); c.lineTo(st.view.vw, y); }
      c.stroke();
    }
    c.restore();
  }

  function drawPickMark(c, live) {
    const p = live.at || null;
    if (!p) return;
    c.save();
    c.strokeStyle = COL.handle(); c.lineWidth = 1.5;
    c.beginPath(); c.arc(p.x, p.y, 14, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(p.x - 22, p.y); c.lineTo(p.x - 6, p.y);
    c.moveTo(p.x + 6, p.y); c.lineTo(p.x + 22, p.y);
    c.moveTo(p.x, p.y - 22); c.lineTo(p.x, p.y - 6);
    c.moveTo(p.x, p.y + 6); c.lineTo(p.x, p.y + 22);
    c.stroke(); c.restore();
  }

  function dot(c, x, y, r, fill) {
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = COL.handle(); c.fill(); }
    c.strokeStyle = fill ? "rgba(6,8,12,.75)" : COL.handle();
    c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  function square(c, x, y, s) {
    const h = s / 2;
    c.save();
    c.fillStyle = COL.handle(); c.strokeStyle = "rgba(6,8,12,.75)"; c.lineWidth = 1.5;
    c.beginPath(); c.rect(Math.round(x - h), Math.round(y - h), Math.round(s), Math.round(s));
    c.fill(); c.stroke(); c.restore();
  }
  function corner7(c, p, s) {
    c.save();
    c.strokeStyle = COL.handle(); c.lineWidth = 3.5; c.lineCap = "butt";
    c.beginPath();
    c.moveTo(p.x - s / 2, p.y); c.lineTo(p.x + s / 2, p.y);
    c.moveTo(p.x, p.y - s / 2); c.lineTo(p.x, p.y + s / 2);
    c.stroke(); c.restore();
  }
  function lerpPt(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

  /* ══ §7 HUD（DOM）════════════════════════════════════════════ */

  const ui = {
    own: [], readout: null, zoomLabel: null, modeBar: null, guideBar: null, zoomBar: null,
    cropBar: null, maskBar: null, loupe: null, editor: null, anchor: null
  };

  function buildHud() {
    if (!hud) return;
    hud.style.pointerEvents = "none";
    const add = (e) => { hud.appendChild(e); ui.own.push(e); return e; };

    /* モード（左上） */
    const modes = mk("div", "vqs-pv-bar vqs-pv-bar--modes");
    modes.setAttribute("data-test", "pv-modes");
    modes.style.pointerEvents = "auto";
    const MODE_LABEL = { select: "選択", crop: "クロップ", mask: "マスク", text: "文字", "chroma-pick": "色を吸う", pan: "手のひら" };
    for (const id of PREVIEW_MODES) {
      const b = btn("vqs-pv-chip", MODE_LABEL[id] || id, MODE_LABEL[id], () => setMode(st.mode === id && id !== "select" ? "select" : id), "pv-mode-" + id);
      b.dataset.mode = id;
      modes.appendChild(b);
    }
    ui.modeBar = add(modes);

    /* 表示切替（右上） */
    const gbar = mk("div", "vqs-pv-bar vqs-pv-bar--guides");
    gbar.setAttribute("data-test", "pv-guides");
    gbar.style.pointerEvents = "auto";
    gbar.appendChild(btn("vqs-pv-chip", "セーフ", "セーフエリアの表示", () => setGuides({ safe: !st.guides.safe }), "pv-guide-safe"));
    gbar.appendChild(btn("vqs-pv-chip", "グリッド", "グリッド（なし → 3 分割 → 9 分割）", () => {
      const i = GRID_MODES.indexOf(st.guides.grid);
      setGuides({ grid: GRID_MODES[(i + 1) % GRID_MODES.length] });
    }, "pv-guide-grid"));
    gbar.appendChild(btn("vqs-pv-chip", "中心線", "中心線の表示", () => setGuides({ center: !st.guides.center }), "pv-guide-center"));
    ui.guideBar = add(gbar);

    /* ズーム（右下） */
    const zbar = mk("div", "vqs-pv-bar vqs-pv-bar--zoom");
    zbar.style.pointerEvents = "auto";
    zbar.appendChild(btn("vqs-pv-iconbtn", "−", "縮小", () => stepZoom(-1), "pv-zoom-out"));
    const lab = btn("vqs-pv-chip vqs-pv-chip--zoom", "100%", "倍率を選ぶ", (ev) => openZoomMenu(ev.currentTarget), "pv-zoom-label");
    ui.zoomLabel = lab;
    zbar.appendChild(lab);
    zbar.appendChild(btn("vqs-pv-iconbtn", "＋", "拡大", () => stepZoom(1), "pv-zoom-in"));
    zbar.appendChild(btn("vqs-pv-chip", "合わせる", "画面に合わせる", () => fit(), "pv-zoom-fit"));
    ui.zoomBar = add(zbar);

    /* クロップの棚 */
    const cb = mk("div", "vqs-pv-bar vqs-pv-bar--crop hidden");
    cb.setAttribute("data-test", "pv-crop-bar");
    cb.style.pointerEvents = "auto";
    const seg = wfn(widgets, "segmented");
    if (seg) {
      try {
        cb.appendChild(seg({
          items: CROP_RATIOS.map((r) => ({ value: r.id, label: r.label })),
          value: st.cropRatio,
          onChange: (v) => { st.cropRatio = String(v || "free"); invalidate(); }
        }));
      } catch (_e) { cb.appendChild(ratioChips()); }
    } else cb.appendChild(ratioChips());
    cb.appendChild(btn("vqs-pv-btn vqs-pv-btn--primary", "9:16 に切り抜く", "縦画面に切り抜く", () => applyRatioCrop(9 / 16), "pv-crop-apply916"));
    cb.appendChild(btn("vqs-pv-btn", "元に戻す", "クロップを解除", () => applyRatioCrop(0), "pv-crop-reset"));
    ui.cropBar = add(cb);

    /* マスクの棚 */
    const mb = mk("div", "vqs-pv-bar vqs-pv-bar--mask hidden");
    mb.setAttribute("data-test", "pv-mask-bar");
    mb.style.pointerEvents = "auto";
    const LABEL = { rect: "矩形", ellipse: "楕円", polygon: "多角形", linear: "直線", radial: "放射" };
    for (const t of MASK_TYPES) {
      mb.appendChild(btn("vqs-pv-chip", LABEL[t] || t, LABEL[t], () => setMaskType(t), "pv-mask-" + t));
    }
    mb.appendChild(btn("vqs-pv-chip", "反転", "マスクを反転", () => toggleMaskInvert(), "pv-mask-invert"));
    mb.appendChild(btn("vqs-pv-chip", "ぼかし", "ぼかし幅を数値で", () => openFeatherSheet(), "pv-mask-feather"));
    ui.maskBar = add(mb);

    /* 数値の表示（掴んでいる間だけ） */
    const ro = mk("div", "vqs-pv-readout hidden");
    ro.setAttribute("data-test", "pv-readout");
    ui.readout = add(ro);

    /* 色吸いの拡大鏡 */
    const lo = mk("div", "vqs-pv-loupe hidden");
    lo.setAttribute("data-test", "pv-loupe");
    lo.appendChild(mk("i", "vqs-pv-loupe__sw"));
    lo.appendChild(mk("span", "vqs-pv-loupe__hex", "#000000"));
    ui.loupe = add(lo);

    /* 文脈メニューの仮アンカー（menu(anchorEl, …) に渡す） */
    const an = mk("div", "vqs-pv-anchor");
    an.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
    ui.anchor = add(an);

    syncHud();
    /* CSS（styles/preview.css）がまだ無い間も読める形に置く。
       **CSS が position を決めていれば何もしない**（CSS 担当が主）。 */
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fallbackPlace);
    else fallbackPlace();
  }

  /** 位置を CSS が決めていない部品だけ inline で置く（一度だけ） */
  function fallbackPlace() {
    if (st.disposed) return;
    const place = [
      [ui.modeBar, "top:8px;left:8px"],
      [ui.guideBar, "top:8px;right:8px"],
      [ui.zoomBar, "bottom:8px;right:8px"],
      [ui.cropBar, "bottom:8px;left:50%;transform:translateX(-50%)"],
      [ui.maskBar, "bottom:8px;left:50%;transform:translateX(-50%)"],
      [ui.readout, "top:0;left:0"],
      [ui.loupe, "top:0;left:0"]
    ];
    for (const [el, css] of place) {
      if (!el) continue;
      let pos = "";
      try { pos = globalThis.getComputedStyle ? getComputedStyle(el).position : ""; } catch (_e) { pos = ""; }
      if (pos && pos !== "static") continue;
      el.style.cssText += ";position:absolute;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 16px);" + css;
      /* CSS が未着の間も触り所を 44px 以上に（§7.2 の約束） */
      for (const b of el.querySelectorAll("button")) {
        b.style.minWidth = "44px"; b.style.minHeight = "44px";
      }
    }
    /* セーフエリア（iOS）。CSS が触っていない時だけ足す */
    for (const el of [ui.modeBar, ui.guideBar]) {
      if (el && el.style.position === "absolute") el.style.top = "calc(8px + env(safe-area-inset-top))";
    }
    showEl(ui.readout, false);
    showEl(ui.loupe, false);
    showEl(ui.cropBar, st.mode === "crop");
    showEl(ui.maskBar, st.mode === "mask");
  }

  function ratioChips() {
    const box = mk("div", "vqs-pv-chips");
    for (const r of CROP_RATIOS) {
      const b = btn("vqs-pv-chip", r.label, "比率 " + r.label, () => {
        st.cropRatio = r.id;
        for (const n of box.children) n.classList.toggle("vqs-pv-chip--on", n === b);
        invalidate();
      }, "pv-crop-ratio-" + r.id);
      if (r.id === st.cropRatio) b.classList.add("vqs-pv-chip--on");
      box.appendChild(b);
    }
    return box;
  }

  function syncHud() {
    if (!hud) return;
    if (ui.modeBar) {
      for (const b of ui.modeBar.children) b.classList.toggle("vqs-pv-chip--on", b.dataset && b.dataset.mode === st.mode);
    }
    if (ui.guideBar) {
      const ch = ui.guideBar.children;
      if (ch[0]) ch[0].classList.toggle("vqs-pv-chip--on", !!st.guides.safe);
      if (ch[1]) {
        ch[1].classList.toggle("vqs-pv-chip--on", st.guides.grid !== "none");
        ch[1].textContent = st.guides.grid === "grid9" ? "9 分割" : st.guides.grid === "thirds" ? "3 分割" : "グリッド";
      }
      if (ch[2]) ch[2].classList.toggle("vqs-pv-chip--on", !!st.guides.center);
    }
    showEl(ui.cropBar, st.mode === "crop");
    showEl(ui.maskBar, st.mode === "mask");
    syncZoomLabel();
  }

  function syncZoomLabel() {
    if (!ui.zoomLabel) return;
    const pct = Math.round(st.view.zoom * 100);
    ui.zoomLabel.textContent = pct + "%" + (st.zoomMode === "fit" ? "（合わせる）" : "");
  }

  function showReadout(lines, at) {
    if (!ui.readout) return;
    ui.readout.textContent = "";
    for (const s of lines) ui.readout.appendChild(mk("span", "vqs-pv-readout__cell", s));
    showEl(ui.readout, true);
    if (at) {
      ui.readout.style.left = Math.round(clamp(at.x, 8, Math.max(8, st.view.vw - 8))) + "px";
      ui.readout.style.top = Math.round(clamp(at.y, 8, Math.max(8, st.view.vh - 8))) + "px";
    }
  }
  function hideReadout() { showEl(ui.readout, false); }

  function stepZoom(dir) {
    const cur = st.view.zoom;
    if (dir > 0) {
      for (const z of ZOOM_STEPS) if (z > cur + 1e-4) return setZoom(z);
      return setZoom(ZOOM_MAX);
    }
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < cur - 1e-4) return setZoom(ZOOM_STEPS[i]);
    return setZoom(ZOOM_MIN);
  }
  function openZoomMenu(anchorEl) {
    const menu = wfn(widgets, "menu");
    const items = [{ label: "画面に合わせる", onSelect: () => fit() }].concat(
      ZOOM_STEPS.map((z) => ({ label: Math.round(z * 100) + "%", onSelect: () => setZoom(z) }))
    );
    if (menu) { try { menu(anchorEl, items); return; } catch (_e) { /* 下へ */ } }
    toggleZoom(null);
  }

  /* ══ §8 操作（pointer の調停役）══════════════════════════════ */

  /** client 座標 → stage 座標 */
  function toStage(ev) {
    const r = st.rect || (wrap ? wrap.getBoundingClientRect() : null);
    if (!r) return { x: 0, y: 0 };
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onDown(ev) {
    if (st.disposed || !wrap) return;
    if (ev.button !== undefined && ev.button > 1) return;       // 右クリックは menu へ
    /* HUD（ボタン・文字入力欄）の上は そちらに任せる。ここで選択を触ると
       「合わせる を押したら選択が消える」になる */
    if (hud && ev.target && ev.target !== hud && hud.contains(ev.target)) return;
    st.rect = wrap.getBoundingClientRect();
    const p = toStage(ev);
    pointers.set(ev.pointerId, p);
    try { wrap.setPointerCapture(ev.pointerId); } catch (_e) { /* noop */ }

    if (pointers.size === 2 && !drag.pinch) { startTwoFinger(); return; }
    if (pointers.size > 1) return;                               // 3 本目以降は無視

    closeEditor(false);                 // 打ちかけを捨てずに閉じる
    /* 二重タップ */
    const now = Date.now();
    const isDouble = now - lastTap.t < DOUBLE_MS &&
      Math.abs(p.x - lastTap.x) < DOUBLE_PX && Math.abs(p.y - lastTap.y) < DOUBLE_PX;
    pendingTap = { t: now, x: p.x, y: p.y };
    lastTap = { t: 0, x: 0, y: 0 };         // 1 回使ったら消す（3 連打で暴れない）

    if (isDouble) {
      if (st.mode === "mask" && removePolyPointAt(p)) return;
      if (st.mode === "text" || (st.mode === "select" && isTextAt(p))) { openEditorAt(p); return; }
      toggleZoom(p);
      return;
    }
    if (st.spaceDown || st.mode === "pan" || (ev.button === 1)) { beginPan(ev, p); return; }
    if (st.mode === "chroma-pick") { beginPick(ev, p); return; }

    armLongPress(p);
    const tg = target();
    /* この指を置いた時点で「既に選ばれている箱の中」か（2 本指の調停に使う） */
    drag.downOnSel = !!(tg && !tg.clip.locked &&
      hitHandle(p.x, p.y, tg.boxS, { handles: false, body: true }) === "body");
    if (st.mode === "crop" && tg) { if (beginCrop(ev, p, tg)) return; }
    if (st.mode === "mask" && tg) { if (beginMask(ev, p, tg)) return; }
    if (st.mode === "select" || st.mode === "text") {
      if (tg && beginTransform(ev, p, tg)) return;
      /* 箱の外 → そこに在るクリップを選ぶ（無ければ選択解除） */
      const hit = pickClipAt(p);
      if (hit) {
        store.select([hit], { additive: !!(ev.shiftKey || ev.metaKey) });
        const t2 = target();
        if (t2) beginTransform(ev, p, t2);
        return;
      }
      if (!ev.shiftKey) store.select([]);
      return;
    }
    beginPan(ev, p);
  }

  function onMove(ev) {
    if (st.disposed) return;
    if (!pointers.has(ev.pointerId) && !drag.kind) return;
    const p = toStage(ev);
    pointers.set(ev.pointerId, p);
    if (drag.pinch) { updateTwoFinger(); return; }
    if (!drag.kind) return;
    if (!drag.moved) {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { drag.moved = true; cancelLongPress(); }
    }
    const mods = { shift: !!ev.shiftKey, alt: !!ev.altKey, meta: !!(ev.metaKey || ev.ctrlKey) };
    if (drag.kind === "pan") { updatePan(p); return; }
    if (drag.kind === "chroma") { updatePick(p); return; }
    if (drag.kind === "crop") { updateCrop(p, mods); return; }
    if (drag.kind === "mask" || drag.kind === "maskPoint" || drag.kind === "maskFeather" || drag.kind === "maskRotate" || drag.kind === "maskScale") { updateMask(p, mods); return; }
    updateTransform(p, mods);
  }

  function onUp(ev) {
    if (st.disposed) return;
    pointers.delete(ev.pointerId);
    try { if (wrap.hasPointerCapture && wrap.hasPointerCapture(ev.pointerId)) wrap.releasePointerCapture(ev.pointerId); } catch (_e) { /* noop */ }
    cancelLongPress();
    /* 動かさずに離した時だけ「タップ」として覚える */
    if (pendingTap && !drag.moved && !drag.pinch) lastTap = pendingTap;
    pendingTap = null;
    if (drag.pinch) { if (pointers.size < 2) endTwoFinger(); return; }
    if (!drag.kind) return;
    if (drag.kind === "chroma") { commitPick(); return; }
    if (drag.kind === "pan") { drag.kind = null; if (wrap) wrap.classList.remove("vqs-pv--grabbing"); return; }
    commitDrag();
  }

  function onCancel(ev) {
    pointers.delete(ev.pointerId);
    cancelLongPress();
    pendingTap = null;
    if (drag.pinch) { endTwoFinger(); return; }
    if (!drag.kind) return;
    /* 取り消し: 掴む前の値へ戻す（live 書き込み済みなら 1 回書き戻す） */
    if (drag.t0 && drag.clipId && drag.wrote) applyTransform(drag.t0.patch0, false);
    resetDrag();
    invalidate();
  }

  function resetDrag() {
    drag.kind = null; drag.handle = null; drag.live = null; drag.guides = [];
    drag.moved = false; drag.keyed = false; drag.wrote = false; drag.pointIndex = -1;
    drag.pinch = null; drag.pixels = null; drag.downOnSel = false;
    hideReadout();
    showEl(ui.loupe, false);
    if (wrap) wrap.classList.remove("vqs-pv--grabbing");
  }

  /* ── 変形（移動・拡大・回転）───────────────────────────────── */

  function beginTransform(ev, p, tg) {
    const size = hitSize();
    const h = hitHandle(p.x, p.y, tg.boxS, { size, rotate: true, center: false, body: true });
    if (!h) return false;
    if (tg.clip.locked) { toast("このクリップは鍵が掛かっています", { kind: "warn" }); return true; }
    const eff = effectiveTransform(tg);
    drag.kind = h === "rotate" ? "rotate" : (h === "body" ? "move" : "scale");
    drag.handle = h === "body" || h === "rotate" ? null : h;
    drag.clipId = tg.id;
    drag.start = p;
    drag.box0 = tg.box;
    drag.boxS0 = tg.boxS;
    drag.t0 = eff;
    drag.moved = false; drag.wrote = false;
    /* keyed = その値にキーが在る（生の値を書いても見た目が動かない）
       CONTRACT-NOTE: transform.scale だけにキーが在る場合は scaleX を書けば
       効くので keyed に数えない（patchFor が scale の標本値で割る）。 */
    drag.keyed = hasKeys(tg.clip, drag.kind === "rotate" ? ["rotate"] : (drag.kind === "move" ? ["x", "y"] : ["scaleX", "scaleY"]));
    if (drag.kind === "rotate") {
      /* 回転は layerBox と同じ **回転中心**（anchor で決まる px,py）まわり */
      const piv = { x: finite(tg.boxS.px, tg.boxS.cx), y: finite(tg.boxS.py, tg.boxS.cy) };
      drag.angle0 = Math.atan2(p.y - piv.y, p.x - piv.x);
      drag.pivotS = piv;
    }
    drag.live = { boxS: tg.boxS, t: Object.assign({}, eff.t) };
    invalidate();
    return true;
  }

  /** 掴んだ時点の「効いている値」（scale は scaleX/scaleY に織り込んだ姿） */
  function effectiveTransform(tg) {
    const tr = tg.r.transform || {};
    const raw = tg.clip.transform || {};
    const local = finite(tg.r.localTime, 0);
    let scaleK = 1;
    try { scaleK = finite(sampleClipPath(tg.clip, "transform.scale", local, finite(raw.scale, 1)), 1) || 1; }
    catch (_e) { scaleK = finite(raw.scale, 1) || 1; }
    return {
      t: {
        x: finite(tr.x, 0), y: finite(tr.y, 0),
        sx: finite(tr.scaleX, 1), sy: finite(tr.scaleY, 1),
        rotate: finite(tr.rotateDeg, finite(tr.rotate, 0) * DEG)
      },
      scaleK,
      scaleKeyed: keyList(tg.clip, "transform.scale").length > 0,
      patch0: {
        x: finite(raw.x, 0), y: finite(raw.y, 0),
        scale: finite(raw.scale, 1), scaleX: finite(raw.scaleX, 1), scaleY: finite(raw.scaleY, 1),
        rotate: finite(raw.rotate, 0)
      }
    };
  }

  function keyList(clip, path) {
    const k = clip && clip.keys;
    const l = k && typeof k === "object" ? k[path] : null;
    return Array.isArray(l) ? l : [];
  }
  function hasKeys(clip, names) {
    for (const n of names) if (keyList(clip, KEY_PATHS[n] || n).length) return true;
    return false;
  }

  function updateTransform(p, mods) {
    const tg = targetFor(drag.clipId);
    if (!tg) return;
    const v = st.view, k = v.scale || 1;
    const t0 = drag.t0.t;
    const next = Object.assign({}, t0);
    drag.guides = [];

    if (drag.kind === "move") {
      let dx = (p.x - drag.start.x) / k, dy = (p.y - drag.start.y) / k;   // プロジェクト px
      if (mods.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      next.x = t0.x + dx / v.projW;
      next.y = t0.y + dy / v.projH;
      /* Shift は「軸を固定」なので、整列吸着は掛けない（固定した軸が動く） */
      if (!mods.shift) {
        const snapped = applyAlign(next, tg);
        next.x = snapped.x; next.y = snapped.y;
      }
    } else if (drag.kind === "rotate") {
      const a = Math.atan2(p.y - drag.pivotS.y, p.x - drag.pivotS.x);
      let deg = t0.rotate + (a - drag.angle0) * DEG;
      if (mods.shift) deg = snapAngle(deg, 15);
      next.rotate = normalizeAngle(deg);
    } else {
      const local = boxLocal(drag.boxS0, p.x, p.y);
      const size = resizeFromHandle(drag.boxS0, drag.handle, local, {
        aspect: !!mods.shift, fromCenter: !!mods.alt, min: MIN_BOX_PX
      });
      const w0 = drag.boxS0.w || 1, h0 = drag.boxS0.h || 1;
      next.sx = clamp(t0.sx * (size.w / w0), SCALE_MIN, SCALE_MAX);
      next.sy = clamp(t0.sy * (size.h / h0), SCALE_MIN, SCALE_MAX);
      if (!mods.alt) {
        /* 掴んでいない側を動かさない: 反対のハンドルの世界座標を合わせる */
        const opp = HANDLE_OPPOSITE[drag.handle];
        const sg = HANDLE_SIGN[opp];
        const fixed = boxPoint(drag.boxS0, sg[0] * w0 / 2, sg[1] * h0 / 2);
        const probe = boxFor(tg, next);
        const probeS = boxToStage(probe, v);
        const now = boxPoint(probeS, sg[0] * probeS.w / 2, sg[1] * probeS.h / 2);
        next.x += (fixed.x - now.x) / k / v.projW;
        next.y += (fixed.y - now.y) / k / v.projH;
      }
    }
    const box = boxFor(tg, next);
    drag.live = { t: next, boxS: boxToStage(box, v) };
    if (!drag.keyed) applyTransform(patchFor(next), true);
    showTransformReadout(next, box, p);
    invalidate();
  }

  /** 候補の transform で箱を作り直す（当たり判定・整列に使う） */
  function boxFor(tg, t) {
    const fake = {
      asset: tg.r.asset,
      transform: {
        x: t.x, y: t.y, scale: 1, scaleX: t.sx, scaleY: t.sy,
        rotate: finite(t.rotate, 0) * RAD,
        anchorX: finite((tg.clip.transform || {}).anchorX, 0.5),
        anchorY: finite((tg.clip.transform || {}).anchorY, 0.5),
        crop: (tg.r.transform || {}).crop || null
      }
    };
    return clipBox(fake, st.view.projW, st.view.projH);
  }

  /** 移動中の整列ガイド（画面の端・中心・他クリップ） */
  function applyAlign(next, tg) {
    const v = st.view, k = v.scale || 1;
    const box = boxFor(tg, next);
    const bs = boxToStage(box, v);
    const pts = handlePoints(bs, { rotate: false });
    const xs = [pts.nw.x, pts.ne.x, pts.sw.x, pts.se.x];
    const ys = [pts.nw.y, pts.ne.y, pts.sw.y, pts.se.y];
    const ctr = boxPoint(bs, 0, 0);
    const movingX = [Math.min.apply(null, xs), ctr.x, Math.max.apply(null, xs)];
    const movingY = [Math.min.apply(null, ys), ctr.y, Math.max.apply(null, ys)];
    const o0 = projectToStage(0, 0, v), o1 = projectToStage(v.projW, v.projH, v);
    const tx = [{ v: o0.x, kind: "frame" }, { v: (o0.x + o1.x) / 2, kind: "center" }, { v: o1.x, kind: "frame" }];
    const ty = [{ v: o0.y, kind: "frame" }, { v: (o0.y + o1.y) / 2, kind: "center" }, { v: o1.y, kind: "frame" }];
    for (const r of resolvedNow()) {
      if (!r.clip || r.clip.id === tg.id) continue;
      const ob = boxToStage(clipBox(r, v.projW, v.projH), v);
      const op = handlePoints(ob, { rotate: false });
      const oxs = [op.nw.x, op.ne.x, op.sw.x, op.se.x], oys = [op.nw.y, op.ne.y, op.sw.y, op.se.y];
      const oc = boxPoint(ob, 0, 0);
      tx.push({ v: Math.min.apply(null, oxs), kind: "clip" }, { v: oc.x, kind: "clip" }, { v: Math.max.apply(null, oxs), kind: "clip" });
      ty.push({ v: Math.min.apply(null, oys), kind: "clip" }, { v: oc.y, kind: "clip" }, { v: Math.max.apply(null, oys), kind: "clip" });
    }
    const out = { x: next.x, y: next.y };
    const sx = alignSnap(movingX, tx, SNAP_PX);
    const sy = alignSnap(movingY, ty, SNAP_PX);
    if (sx) { out.x += sx.delta / k / v.projW; drag.guides.push({ axis: "x", at: sx.line, kind: sx.kind }); }
    if (sy) { out.y += sy.delta / k / v.projH; drag.guides.push({ axis: "y", at: sy.line, kind: sy.kind }); }
    return out;
  }

  /** 候補の値 → ops に渡す patch（scale は正規化する） */
  function patchFor(t) {
    const p = { x: t.x, y: t.y, rotate: normalizeAngle(t.rotate) };
    if (drag.t0.scaleKeyed) {
      const kk = drag.t0.scaleK || 1;
      p.scaleX = t.sx / kk; p.scaleY = t.sy / kk;
    } else {
      p.scale = 1; p.scaleX = t.sx; p.scaleY = t.sy;
    }
    return clampTransform(p);
  }

  function applyTransform(patch, coalesce) {
    if (!drag.clipId) return;
    try {
      store.dispatch("clip.setTransform", { clipId: drag.clipId, patch }, { label: "変形", coalesce: !!coalesce });
      drag.wrote = true;
    } catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
  }

  function showTransformReadout(t, box, at) {
    const lines = [];
    if (drag.kind === "move") {
      lines.push("X " + (t.x * 100).toFixed(1) + "%", "Y " + (t.y * 100).toFixed(1) + "%");
    } else if (drag.kind === "rotate") {
      lines.push(normalizeAngle(t.rotate).toFixed(1) + "°");
    } else {
      lines.push(Math.round(box.w) + " × " + Math.round(box.h) + " px",
        "横 " + Math.round(t.sx * 100) + "% / 縦 " + Math.round(t.sy * 100) + "%");
    }
    if (drag.keyed) lines.push("キーを打つ");
    showReadout(lines, { x: at.x + 16, y: at.y + 16 });
  }

  function commitDrag() {
    const tg = targetFor(drag.clipId);
    if (!drag.moved || !tg || !drag.live) { resetDrag(); invalidate(); return; }
    if (drag.kind === "crop") { commitCrop(); return; }
    if (String(drag.kind).indexOf("mask") === 0) { commitMask(); return; }
    const t = drag.live.t;
    if (drag.keyed) writeKeys(tg, t);
    else applyTransform(patchFor(t), true);
    resetDrag();
    invalidate();
  }

  /**
   * キーフレームが在る path は 生の値ではなく **playhead へ 1 打ち**する
   * （1 取消）。which を渡さなければ 掴み方から決める。
   * @param {Object} tg @param {Object} t 候補の値 @param {string[]} [which]
   */
  function writeKeys(tg, t, which) {
    const local = finite(tg.r.localTime, 0);
    const kk = drag.t0 && drag.t0.scaleK ? drag.t0.scaleK : 1;
    const names = Array.isArray(which) && which.length ? which
      : (drag.kind === "move" ? ["x", "y"] : (drag.kind === "rotate" ? ["rotate"] : ["scaleX", "scaleY"]));
    const val = {
      x: clamp(finite(t.x, 0), -POS_LIMIT, POS_LIMIT),
      y: clamp(finite(t.y, 0), -POS_LIMIT, POS_LIMIT),
      scaleX: clamp(finite(t.sx, 1) / kk, SCALE_MIN, SCALE_MAX),
      scaleY: clamp(finite(t.sy, 1) / kk, SCALE_MIN, SCALE_MAX),
      rotate: normalizeAngle(t.rotate)
    };
    const set = names.map((n) => [KEY_PATHS[n] || n, val[n]]).filter((e) => Number.isFinite(e[1]));
    if (!set.length) return;
    try {
      store.batch("変形（キー）", (dp) => {
        for (const [path, v] of set) dp("key.add", { clipId: tg.id, path, t: local, v });
      });
    } catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
  }

  function targetFor(id) {
    if (!id) return null;
    const t = target();
    if (t && t.id === id) return t;
    const r = resolvedOf(id);
    const f = findClip(store.project, id);
    if (!r || !f) return null;
    const box = clipBox(r, st.view.projW, st.view.projH);
    return { id, clip: f.clip, track: f.track, r, box, boxS: boxToStage(box, st.view) };
  }

  /* ── クロップ ─────────────────────────────────────────────── */

  function beginCrop(ev, p, tg) {
    const h = hitHandle(p.x, p.y, tg.boxS, { size: hitSize(), rotate: false, center: false, body: true, crop: true });
    if (!h) return false;
    if (tg.clip.locked) { toast("このクリップは鍵が掛かっています", { kind: "warn" }); return true; }
    drag.kind = "crop"; drag.handle = h === "body" ? null : h;
    drag.clipId = tg.id; drag.start = p; drag.box0 = tg.box; drag.boxS0 = tg.boxS;
    drag.crop0 = Object.assign({ l: 0, t: 0, r: 0, b: 0 }, (tg.clip.transform || {}).crop || {});
    drag.live = { boxS: tg.boxS, crop: drag.crop0 };
    drag.moved = false; drag.wrote = false; drag.keyed = false;
    invalidate();
    return true;
  }

  function updateCrop(p, mods) {
    const tg = targetFor(drag.clipId);
    if (!tg) return;
    const ratioId = st.cropRatio;
    const found = CROP_RATIOS.find((r) => r.id === ratioId);
    const ratio = mods.shift ? 0 : (found ? found.r : 0);
    let crop;
    if (!drag.handle) {
      /* 窓ごと動かす（切り抜く場所を変える） */
      const local = boxLocal(drag.boxS0, p.x, p.y);
      const start = boxLocal(drag.boxS0, drag.start.x, drag.start.y);
      const du = (local.x - start.x) / (drag.boxS0.w || 1);
      const dv = (local.y - start.y) / (drag.boxS0.h || 1);
      const c0 = drag.crop0;
      const cw = 1 - c0.l - c0.r, ch = 1 - c0.t - c0.b;
      const nl = clamp(c0.l + du, 0, 1 - cw), nt = clamp(c0.t + dv, 0, 1 - ch);
      crop = { l: nl, t: nt, r: 1 - nl - cw, b: 1 - nt - ch };
    } else {
      const local = boxLocal(drag.boxS0, p.x, p.y);
      crop = cropFromHandle(drag.crop0, drag.handle, local, {
        w: drag.boxS0.w, h: drag.boxS0.h, ratio, min: 0.04
      });
    }
    drag.live = { crop, boxS: cropBoxS(tg, crop) };
    applyCrop(crop, true);
    const b = drag.live.boxS;
    showReadout([
      "切り抜き " + Math.round(b.vw / (st.view.scale || 1)) + " × " + Math.round(b.vh / (st.view.scale || 1)) + " px",
      "左 " + (crop.l * 100).toFixed(1) + "% 上 " + (crop.t * 100).toFixed(1) + "%"
    ], { x: p.x + 16, y: p.y + 16 });
    invalidate();
  }

  function cropBoxS(tg, crop) {
    const fake = { asset: tg.r.asset, transform: Object.assign({}, tg.r.transform, { crop }) };
    return boxToStage(clipBox(fake, st.view.projW, st.view.projH), st.view);
  }

  function applyCrop(crop, coalesce) {
    try {
      store.dispatch("clip.setTransform", { clipId: drag.clipId, patch: clampTransform({ crop }) },
        { label: "クロップ", coalesce: !!coalesce });
      drag.wrote = true;
    } catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
  }
  function commitCrop() {
    if (drag.live && drag.live.crop) applyCrop(drag.live.crop, true);
    resetDrag(); invalidate();
  }

  /** 比率で切り抜く / 戻す（HUD のボタン） */
  function applyRatioCrop(ratio) {
    const tg = target();
    if (!tg) { toast("クリップを選んでください", { kind: "warn" }); return; }
    const crop = ratio > 0 ? ratioCrop(ratio, tg.box.w, tg.box.h) : { l: 0, t: 0, r: 0, b: 0 };
    try {
      store.dispatch("clip.setTransform", { clipId: tg.id, patch: clampTransform({ crop }) },
        { label: ratio > 0 ? "切り抜く" : "クロップを戻す" });
    } catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
    invalidate();
  }

  /* ── マスク ───────────────────────────────────────────────── */

  function maskHandles(tg, m) {
    const boxS = tg.boxS;
    const ctr = maskToLocal(m, boxS);
    const hw = Math.abs(finite(m.w, 0.5)) * finite(boxS.w, 0) / 2;
    const hh = Math.abs(finite(m.h, 0.5)) * finite(boxS.h, 0) / 2;
    const rot = finite(m.rotateDeg, finite(m.rotate, 0) * DEG) * RAD;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (lx, ly) => boxPoint(boxS, ctr.x + lx * cs - ly * sn, ctr.y + lx * sn + ly * cs);
    return {
      P, hw, hh, rot,
      center: P(0, 0), rotate: P(0, -hh - ROTATE_GAP), feather: P(0, hh + clamp01(finite(m.feather, 0)) * finite(boxS.h, 0)),
      corners: { nw: P(-hw, -hh), ne: P(hw, -hh), se: P(hw, hh), sw: P(-hw, hh) }
    };
  }

  function beginMask(ev, p, tg) {
    let m = tg.r.mask || (tg.clip.mask ? tg.clip.mask : null);
    if (!m) {                                    // マスクが無ければ その場で作る
      const base = defaultMask();
      try { store.dispatch("clip.setMask", { clipId: tg.id, mask: base }, { label: "マスクを追加" }); }
      catch (e) { toast(String(e && e.message || e), { kind: "error" }); return true; }
      const t2 = targetFor(tg.id);
      if (!t2) return true;
      tg = t2; m = t2.r.mask || base;
    }
    const size = hitSize();
    const H = maskHandles(tg, m);
    const near = (q) => q && Math.abs(p.x - q.x) <= size && Math.abs(p.y - q.y) <= size;
    drag.clipId = tg.id; drag.start = p; drag.box0 = tg.box; drag.boxS0 = tg.boxS;
    drag.mask0 = Object.assign({}, m, { points: (Array.isArray(m.points) ? m.points : []).map((q) => [finite(q[0], 0), finite(q[1], 0)]) });
    drag.live = { mask: drag.mask0 };
    drag.moved = false; drag.wrote = false; drag.keyed = false; drag.pointIndex = -1;
    const type = String(m.type || "rect");

    if (type === "polygon") {
      const pts = drag.mask0.points;
      for (let i = 0; i < pts.length; i++) {
        const q = boxPoint(tg.boxS, (pts[i][0] - 0.5) * tg.boxS.w, (pts[i][1] - 0.5) * tg.boxS.h);
        if (near(q)) { drag.kind = "maskPoint"; drag.pointIndex = i; invalidate(); return true; }
      }
      /* 頂点でない所 → 一番近い辺に足す（16 まで） */
      if (pts.length < 16) { insertPolyPoint(tg, p); return true; }
      drag.kind = "mask"; return true;
    }
    if (near(H.rotate)) {
      drag.kind = "maskRotate";
      drag.angle0 = Math.atan2(p.y - H.center.y, p.x - H.center.x);
      drag.pivotS = H.center;
      invalidate(); return true;
    }
    if (near(H.feather)) { drag.kind = "maskFeather"; invalidate(); return true; }
    for (const id of ["nw", "ne", "se", "sw"]) {
      if (near(H.corners[id])) { drag.kind = "maskScale"; drag.handle = id; invalidate(); return true; }
    }
    drag.kind = "mask";      // 中を掴んで移動
    invalidate();
    return true;
  }

  function insertPolyPoint(tg, p) {
    const pts = drag.mask0.points.slice();
    const loc = boxLocal(tg.boxS, p.x, p.y);
    const uv = [loc.x / (tg.boxS.w || 1) + 0.5, loc.y / (tg.boxS.h || 1) + 0.5];
    if (pts.length < 3) pts.push(uv);
    else {
      let best = 0, bd = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const d = segDist(uv, a, b);
        if (d < bd) { bd = d; best = i; }
      }
      pts.splice(best + 1, 0, uv);
    }
    setMask({ points: pts }, "頂点を足す", false);
    resetDrag();
    invalidate();
  }
  /**
   * 多角形の頂点を二重タップで消す（3 つ未満にはしない）。
   * @param {{x:number,y:number}} p stage 座標 @returns {boolean} 消したか
   */
  function removePolyPointAt(p) {
    const tg = target();
    const m = tg && tg.clip.mask;
    if (!tg || !m || String(m.type) !== "polygon") return false;
    const pts = Array.isArray(m.points) ? m.points : [];
    if (pts.length <= 3) return false;
    const size = hitSize();
    for (let i = 0; i < pts.length; i++) {
      const q = boxPoint(tg.boxS, (finite(pts[i][0], 0.5) - 0.5) * tg.boxS.w, (finite(pts[i][1], 0.5) - 0.5) * tg.boxS.h);
      if (Math.abs(p.x - q.x) <= size && Math.abs(p.y - q.y) <= size) {
        const next = pts.slice();
        next.splice(i, 1);
        drag.clipId = tg.id;
        setMask({ points: next }, "頂点を消す", false);
        resetDrag();
        invalidate();
        return true;
      }
    }
    return false;
  }

  function segDist(p, a, b) {
    const ax = finite(a[0], 0), ay = finite(a[1], 0), bx = finite(b[0], 0), by = finite(b[1], 0);
    const ex = bx - ax, ey = by - ay;
    const t = clamp01((ex * (p[0] - ax) + ey * (p[1] - ay)) / (ex * ex + ey * ey || 1e-9));
    const dx = p[0] - (ax + ex * t), dy = p[1] - (ay + ey * t);
    return Math.hypot(dx, dy);
  }

  function updateMask(p, mods) {
    const tg = targetFor(drag.clipId);
    if (!tg) return;
    const m0 = drag.mask0, boxS = drag.boxS0;
    const patch = {};
    if (drag.kind === "mask") {
      const s = boxLocal(boxS, drag.start.x, drag.start.y), l = boxLocal(boxS, p.x, p.y);
      patch.x = clamp(finite(m0.x, 0.5) + (l.x - s.x) / (boxS.w || 1), -2, 3);
      patch.y = clamp(finite(m0.y, 0.5) + (l.y - s.y) / (boxS.h || 1), -2, 3);
    } else if (drag.kind === "maskPoint") {
      const l = boxLocal(boxS, p.x, p.y);
      const pts = m0.points.map((q) => [q[0], q[1]]);
      if (drag.pointIndex >= 0 && drag.pointIndex < pts.length) {
        pts[drag.pointIndex] = [clamp(l.x / (boxS.w || 1) + 0.5, -2, 3), clamp(l.y / (boxS.h || 1) + 0.5, -2, 3)];
      }
      patch.points = pts;
    } else if (drag.kind === "maskRotate") {
      const a = Math.atan2(p.y - drag.pivotS.y, p.x - drag.pivotS.x);
      let deg = finite(m0.rotate, 0) + (a - drag.angle0) * DEG;
      if (mods.shift) deg = snapAngle(deg, 15);
      patch.rotate = normalizeAngle(deg);
    } else if (drag.kind === "maskFeather") {
      const rot = finite(m0.rotate, 0) * RAD;
      const l = boxLocal(boxS, p.x, p.y);
      const ctr = maskToLocal(m0, boxS);
      const dy = (l.x - ctr.x) * -Math.sin(rot) + (l.y - ctr.y) * Math.cos(rot);
      const hh = Math.abs(finite(m0.h, 0.5)) * finite(boxS.h, 0) / 2;
      patch.feather = clamp01((Math.abs(dy) - hh) / (finite(boxS.h, 1) || 1));
    } else if (drag.kind === "maskScale") {
      const rot = finite(m0.rotate, 0) * RAD;
      const ctr = maskToLocal(m0, boxS);
      const l = boxLocal(boxS, p.x, p.y);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const lx = (l.x - ctr.x) * cs + (l.y - ctr.y) * sn;
      const ly = -(l.x - ctr.x) * sn + (l.y - ctr.y) * cs;
      const w = Math.max(0.01, Math.abs(lx) * 2 / (boxS.w || 1));
      const h = Math.max(0.01, Math.abs(ly) * 2 / (boxS.h || 1));
      if (mods.shift) {
        const r = Math.max(w / Math.max(1e-4, finite(m0.w, 0.5)), h / Math.max(1e-4, finite(m0.h, 0.5)));
        patch.w = clamp(finite(m0.w, 0.5) * r, 0.01, 4);
        patch.h = clamp(finite(m0.h, 0.5) * r, 0.01, 4);
      } else { patch.w = clamp(w, 0.01, 4); patch.h = clamp(h, 0.01, 4); }
    }
    drag.live = { mask: Object.assign({}, m0, patch) };
    setMask(patch, "マスク", true);
    const mm = drag.live.mask;
    showReadout([
      "位置 " + (finite(mm.x, 0.5) * 100).toFixed(0) + "%, " + (finite(mm.y, 0.5) * 100).toFixed(0) + "%",
      "大きさ " + (finite(mm.w, 0.5) * 100).toFixed(0) + "% × " + (finite(mm.h, 0.5) * 100).toFixed(0) + "%",
      "角度 " + normalizeAngle(finite(mm.rotate, 0)).toFixed(0) + "° / ぼかし " + (clamp01(finite(mm.feather, 0)) * 100).toFixed(0) + "%"
    ], { x: p.x + 16, y: p.y + 16 });
    invalidate();
  }

  function commitMask() {
    if (drag.live && drag.live.mask) {
      const m = drag.live.mask;
      setMask({ x: m.x, y: m.y, w: m.w, h: m.h, rotate: m.rotate, feather: m.feather, points: m.points }, "マスク", true);
    }
    resetDrag(); invalidate();
  }

  function setMask(patch, label, coalesce) {
    const id = drag.clipId || primaryId();
    if (!id) return;
    try { store.dispatch("clip.setMask", { clipId: id, mask: patch }, { label: label || "マスク", coalesce: !!coalesce }); }
    catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
  }

  function setMaskType(type) {
    const tg = target();
    if (!tg) { toast("クリップを選んでください", { kind: "warn" }); return; }
    const cur = tg.clip.mask || defaultMask();
    const patch = { type };
    if (type === "polygon" && (!Array.isArray(cur.points) || cur.points.length < 3)) {
      const x = finite(cur.x, 0.5), y = finite(cur.y, 0.5);
      const w = Math.abs(finite(cur.w, 0.5)) / 2, h = Math.abs(finite(cur.h, 0.5)) / 2;
      patch.points = [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
    }
    try { store.dispatch("clip.setMask", { clipId: tg.id, mask: patch }, { label: "マスクの形" }); }
    catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
    setMode("mask");
    invalidate();
  }
  function toggleMaskInvert() {
    const tg = target();
    if (!tg || !tg.clip.mask) { toast("マスクがありません", { kind: "warn" }); return; }
    try { store.dispatch("clip.setMask", { clipId: tg.id, mask: { invert: !tg.clip.mask.invert } }, { label: "マスクを反転" }); }
    catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
    invalidate();
  }
  function openFeatherSheet() {
    const tg = target();
    if (!tg || !tg.clip.mask) { toast("マスクがありません", { kind: "warn" }); return; }
    const sheet = wfn(widgets, "openSheet"), slider = wfn(widgets, "slider");
    if (!sheet || !slider) {
      const cur = clamp01(finite(tg.clip.mask.feather, 0));
      const next = clamp01(cur + 0.05 > 1 ? 0 : cur + 0.05);
      try { store.dispatch("clip.setMask", { clipId: tg.id, mask: { feather: next } }, { label: "ぼかし" }); }
      catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
      invalidate();
      return;
    }
    const body = mk("div", "vqs-pv-sheet");
    body.appendChild(slider({
      label: "ぼかし", min: 0, max: 100, step: 1, unit: "%",
      value: clamp01(finite(tg.clip.mask.feather, 0)) * 100,
      onInput: (v) => {
        try { store.dispatch("clip.setMask", { clipId: tg.id, mask: { feather: clamp01(finite(v, 0) / 100) } }, { label: "ぼかし", coalesce: true }); }
        catch (_e) { /* noop */ }
        invalidate();
      }
    }));
    body.appendChild(slider({
      label: "広げる", min: -50, max: 100, step: 1, unit: "%",
      value: finite(tg.clip.mask.expand, 0) * 100,
      onInput: (v) => {
        try { store.dispatch("clip.setMask", { clipId: tg.id, mask: { expand: clamp(finite(v, 0) / 100, -0.9, 4) } }, { label: "広げる", coalesce: true }); }
        catch (_e) { /* noop */ }
        invalidate();
      }
    }));
    try { sheet({ title: "マスクのぼかし", content: body, height: 0.34 }); } catch (_e) { /* noop */ }
  }

  /* ── クロマキーの色吸い ───────────────────────────────────── */

  function beginPick(ev, p) {
    drag.kind = "chroma"; drag.start = p; drag.clipId = primaryId(); drag.moved = false;
    drag.pixels = grabPixels();
    updatePick(p);
  }
  function grabPixels() {
    if (!compositor || typeof compositor.grabPixels !== "function") return null;
    try {
      const img = compositor.grabPixels();
      return img && img.data && img.width ? img : null;
    } catch (e) { L.warn("grabPixels が使えない", e && e.message); return null; }
  }
  function colorAt(p) {
    const img = drag.pixels;
    if (!img) return null;
    const pr = stageToProject(p.x, p.y, st.view);
    const ix = Math.round(clamp(pr.x / st.view.projW, 0, 0.999999) * img.width);
    const iy = Math.round(clamp(pr.y / st.view.projH, 0, 0.999999) * img.height);
    const i = (Math.min(img.height - 1, iy) * img.width + Math.min(img.width - 1, ix)) * 4;
    const d = img.data;
    if (i < 0 || i + 2 >= d.length) return null;
    return { r: d[i], g: d[i + 1], b: d[i + 2] };
  }
  function updatePick(p) {
    const col = colorAt(p);
    drag.live = { at: p, color: col };
    if (ui.loupe && col) {
      const hex = "#" + [col.r, col.g, col.b].map((n) => ("0" + (n & 255).toString(16)).slice(-2)).join("");
      showEl(ui.loupe, true);
      ui.loupe.style.left = Math.round(clamp(p.x + 18, 8, Math.max(8, st.view.vw - 120))) + "px";
      ui.loupe.style.top = Math.round(clamp(p.y - 44, 8, Math.max(8, st.view.vh - 48))) + "px";
      const sw = ui.loupe.firstChild, tx = ui.loupe.lastChild;
      if (sw && sw.style) sw.style.background = hex;
      if (tx) tx.textContent = hex;
    }
    invalidate();
  }
  function commitPick() {
    const id = drag.clipId, col = drag.live && drag.live.color;
    if (!id) { toast("クリップを選んでください", { kind: "warn" }); resetDrag(); invalidate(); return; }
    if (!col) {
      toast(compositor ? "画素を読めませんでした（画面の外かもしれません）" : "合成器がありません", { kind: "warn" });
      resetDrag(); invalidate(); return;
    }
    try {
      store.dispatch("clip.setChroma", {
        clipId: id,
        chroma: { key: [col.r / 255, col.g / 255, col.b / 255], enabled: true }
      }, { label: "クロマキーの色" });
      toast("色を取りました", { kind: "ok", ms: 1200 });
    } catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
    resetDrag();
    setMode("select");
    invalidate();
  }

  /* ── ズーム / パン ───────────────────────────────────────── */

  function beginPan(ev, p) {
    drag.kind = "pan"; drag.start = p; drag.pan0 = { x: st.panX, y: st.panY };
    if (st.zoomMode === "fit") { st.zoomMode = "manual"; st.zoom = st.view.zoom; }
    if (wrap) wrap.classList.add("vqs-pv--grabbing");
  }
  function updatePan(p) {
    st.panX = drag.pan0.x + (p.x - drag.start.x);
    st.panY = drag.pan0.y + (p.y - drag.start.y);
    measure(); invalidate();
  }

  function startTwoFinger() {
    cancelLongPress();
    const ps = Array.from(pointers.values());
    if (ps.length < 2) return;
    const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1;
    const ang = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
    /* CONTRACT-NOTE (3) の調停。**1 本目を置いた時に選ばれていた**箱の中
       だけをクリップ変形にする（同じ指で選ばれたばかりの物は数えない）。 */
    const tg = target();
    const insideSel = !!drag.downOnSel && st.mode === "select" && tg && !tg.clip.locked;
    if (drag.kind && drag.kind !== "pan") { if (drag.wrote || drag.kind === "crop") commitDrag(); else resetDrag(); }
    if (insideSel) {
      const eff = effectiveTransform(tg);
      drag.pinch = {
        what: "clip", dist, ang, mid, clipId: tg.id,
        t0: eff.t, keyed: hasKeys(tg.clip, ["x", "y", "scaleX", "scaleY", "rotate"])
      };
      drag.t0 = eff; drag.clipId = tg.id; drag.boxS0 = tg.boxS; drag.box0 = tg.box;
      drag.kind = "pinchClip"; drag.keyed = drag.pinch.keyed; drag.moved = true;
    } else {
      if (st.zoomMode === "fit") { st.zoomMode = "manual"; st.zoom = st.view.zoom; }
      drag.pinch = { what: "view", dist, mid, zoom0: st.zoom, pan0: { x: st.panX, y: st.panY } };
      drag.kind = "pinchView";
    }
    invalidate();
  }

  function updateTwoFinger() {
    const ps = Array.from(pointers.values());
    if (ps.length < 2 || !drag.pinch) return;
    const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1;
    const g = drag.pinch;
    if (g.what === "view") {
      const z = clamp(g.zoom0 * (dist / g.dist), ZOOM_MIN, ZOOM_MAX);
      st.zoom = z; st.zoomMode = "manual";
      st.panX = g.pan0.x + (mid.x - g.mid.x);
      st.panY = g.pan0.y + (mid.y - g.mid.y);
      measure();
      invalidate();
      return;
    }
    const tg = targetFor(g.clipId);
    if (!tg) return;
    const ang = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
    const v = st.view, k = v.scale || 1;
    const f = dist / g.dist;
    const next = {
      x: g.t0.x + (mid.x - g.mid.x) / k / v.projW,
      y: g.t0.y + (mid.y - g.mid.y) / k / v.projH,
      sx: clamp(g.t0.sx * f, SCALE_MIN, SCALE_MAX),
      sy: clamp(g.t0.sy * f, SCALE_MIN, SCALE_MAX),
      rotate: normalizeAngle(g.t0.rotate + (ang - g.ang) * DEG)
    };
    drag.live = { t: next, boxS: boxToStage(boxFor(tg, next), v) };
    if (!drag.keyed) applyTransform(patchFor(next), true);
    showReadout([
      "X " + (next.x * 100).toFixed(1) + "% / Y " + (next.y * 100).toFixed(1) + "%",
      "拡大 " + Math.round(next.sx * 100) + "%", normalizeAngle(next.rotate).toFixed(1) + "°"
    ], { x: mid.x + 14, y: mid.y + 14 });
    invalidate();
  }

  function endTwoFinger() {
    const g = drag.pinch;
    if (g && g.what === "clip" && drag.live && drag.live.t) {
      const tg = targetFor(g.clipId);
      if (tg) {
        if (drag.keyed) writeKeys(tg, drag.live.t, ["x", "y", "scaleX", "scaleY", "rotate"]);
        else applyTransform(patchFor(drag.live.t), true);
      }
    }
    resetDrag();
    invalidate();
  }

  function onWheel(ev) {
    if (!wrap) return;
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      st.rect = wrap.getBoundingClientRect();
      const p = toStage(ev);
      const f = Math.exp(-ev.deltaY * 0.0022);
      setZoom(clamp(st.view.zoom * f, ZOOM_MIN, ZOOM_MAX), p);
      return;
    }
    /* 画面より絵が大きい時だけホイールで動かす（そうでなければページに譲る） */
    const v = st.view;
    const over = v.projW * v.scale > v.vw + 1 || v.projH * v.scale > v.vh + 1;
    if (!over) return;
    ev.preventDefault();
    if (st.zoomMode === "fit") { st.zoomMode = "manual"; st.zoom = v.zoom; }
    if (ev.shiftKey) st.panX -= ev.deltaY; else { st.panX -= ev.deltaX; st.panY -= ev.deltaY; }
    measure(); invalidate();
  }

  /* ── 長押し → 文脈メニュー ───────────────────────────────── */

  function armLongPress(p) {
    cancelLongPress();
    longTimer = setTimeout(() => {
      longTimer = 0;
      if (drag.moved || drag.pinch) return;
      openContextMenu(p);
    }, LONGPRESS_MS);
  }
  function cancelLongPress() { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } }

  function openContextMenu(p) {
    if (drag.kind && !drag.moved) resetDrag();     // 掴みかけを持ったままメニューを出さない
    const tg = target();
    const items = [];
    if (tg) {
      items.push(
        { label: "画面に合わせる", onSelect: () => presetTransform("fit") },
        { label: "画面を埋める", onSelect: () => presetTransform("fill") },
        { label: "元の大きさ", onSelect: () => presetTransform("actual") },
        { label: "変形をリセット", onSelect: () => presetTransform("reset") },
        { label: "9:16 に切り抜く", onSelect: () => applyRatioCrop(9 / 16) },
        { label: "クロップを編集", onSelect: () => setMode("crop") },
        { label: "マスクを編集", onSelect: () => setMode("mask") },
        { label: "クロマキーの色を吸う", onSelect: () => setMode("chroma-pick") },
        { label: "複製", onSelect: () => runOp("clip.duplicate", { clipId: tg.id }, "複製") },
        { label: "削除", danger: true, onSelect: () => runOp("clip.remove", { clipId: tg.id }, "削除") }
      );
    } else {
      items.push(
        { label: "画面に合わせる（表示）", onSelect: () => fit() },
        { label: "100%", onSelect: () => setZoom(1) },
        { label: "セーフエリア", onSelect: () => setGuides({ safe: !st.guides.safe }) },
        { label: "グリッド", onSelect: () => setGuides({ grid: st.guides.grid === "none" ? "thirds" : "none" }) }
      );
    }
    const menu = wfn(widgets, "menu");
    if (menu && ui.anchor) {
      ui.anchor.style.left = Math.round(p.x) + "px";
      ui.anchor.style.top = Math.round(p.y) + "px";
      try { menu(ui.anchor, items); return; } catch (_e) { /* 下へ */ }
    }
    const sheet = wfn(widgets, "openSheet");
    if (sheet) {
      const box = mk("div", "vqs-pv-sheet");
      const inst = { close: null };
      for (const it of items) {
        box.appendChild(btn("vqs-pv-btn" + (it.danger ? " vqs-pv-btn--danger" : ""), it.label, it.label, () => {
          if (inst.close) { try { inst.close(); } catch (_e) { /* noop */ } }
          it.onSelect();
        }));
      }
      try { const h = sheet({ title: "プレビュー", content: box, height: 0.5 }); inst.close = h && h.close; } catch (_e) { /* noop */ }
    }
  }

  function runOp(type, payload, label) {
    try { store.dispatch(type, payload, { label }); }
    catch (e) { toast(String(e && e.message || e), { kind: "error" }); }
    invalidate();
  }

  function presetTransform(kind) {
    const tg = target();
    if (!tg) return;
    let patch = null;
    if (kind === "reset") patch = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, crop: { l: 0, t: 0, r: 0, b: 0 } };
    else if (kind === "fit") patch = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1 };
    else if (kind === "actual") patch = { x: 0, y: 0, scale: clamp(1 / (tg.box.k || 1), SCALE_MIN, SCALE_MAX), scaleX: 1, scaleY: 1 };
    else if (kind === "fill") {
      const base = clipBox({ asset: tg.r.asset, transform: Object.assign({}, tg.r.transform, { scale: 1, scaleX: 1, scaleY: 1 }) }, st.view.projW, st.view.projH);
      patch = { x: 0, y: 0, scale: fillScaleFor(base, st.view.projW, st.view.projH), scaleX: 1, scaleY: 1 };
    }
    if (!patch) return;
    runOp("clip.setTransform", { clipId: tg.id, patch: clampTransform(patch) }, "変形");
  }

  /* ── クリップを拾う（箱の外を押した時）───────────────────── */

  function pickClipAt(p) {
    const v = st.view;
    const list = resolvedNow();
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (!r.clip || r.clip.hidden) continue;
      if (String(r.kind) === "adjust") continue;
      const bs = boxToStage(clipBox(r, v.projW, v.projH), v);
      if (hitHandle(p.x, p.y, bs, { handles: false, body: true, crop: true }) === "body") return r.clip.id;
    }
    return null;
  }
  function isTextAt(p) {
    const v = st.view;
    const list = resolvedNow();
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (!r.clip || String(r.clip.kind) !== "text") continue;
      const bs = boxToStage(clipBox(r, v.projW, v.projH), v);
      if (hitHandle(p.x, p.y, bs, { handles: false, body: true }) === "body") return r.clip.id;
    }
    return null;
  }

  /* ══ §9 文字の直接編集（IME を通すので DOM）═════════════════ */

  function openEditorAt(p) {
    let id = isTextAt(p);
    if (!id) {
      const tg = target();
      id = tg && String(tg.clip.kind) === "text" ? tg.id : null;
    }
    if (!id) { toast("文字クリップを二重タップしてください", { kind: "warn" }); return; }
    store.select([id]);
    const tg = targetFor(id);
    if (!tg || !hud) return;
    closeEditor(true);
    const spec = tg.clip.text || {};
    const style = spec.style || {};
    const layout = spec.layout || {};
    const boxS = tg.boxS;
    const ta = mk("textarea", "vqs-pv-textedit");
    ta.setAttribute("data-test", "pv-text-edit");
    ta.value = String(spec.content === undefined || spec.content === null ? "" : spec.content);
    ta.spellcheck = false;
    ta.setAttribute("aria-label", "文字を編集");
    const maxW = clamp(finite(layout.maxWidth, 0.8), 0.05, 1);
    const w = Math.max(60, finite(boxS.w, 0) * maxW);
    /* text.style.size は「プロジェクト px」。画面へは拡大率を掛けるだけ */
    const fontPx = Math.max(8, finite(style.size, 64) * (st.view.scale || 1));
    const lines = Math.max(1, ta.value.split("\n").length);
    const lh = clamp(finite(layout.lineHeight, 1.25), 0.8, 3);
    const h = Math.max(fontPx * lh * lines + 8, 32);
    const ctr = boxPoint(boxS, 0, 0);
    let cx = ctr.x, cy = ctr.y;
    const align = String(layout.align || "center"), vAlign = String(layout.vAlign || "middle");
    if (align === "left") cx = ctr.x - (finite(boxS.w, 0) * maxW) / 2 + w / 2;
    if (align === "right") cx = ctr.x + (finite(boxS.w, 0) * maxW) / 2 - w / 2;
    if (vAlign === "top") cy = ctr.y - finite(boxS.h, 0) / 2 + h / 2 + 8;
    if (vAlign === "bottom") cy = ctr.y + finite(boxS.h, 0) / 2 - h / 2 - 8;
    ta.style.cssText = [
      "position:absolute", "pointer-events:auto", "box-sizing:border-box",
      "left:" + Math.round(cx - w / 2) + "px", "top:" + Math.round(cy - h / 2) + "px",
      "width:" + Math.round(w) + "px", "height:" + Math.round(h) + "px",
      "font-size:" + Math.round(Math.max(10, fontPx)) + "px",
      "line-height:" + lh, "text-align:" + (align === "left" || align === "right" ? align : "center"),
      "transform:rotate(" + finite(boxS.rot, 0) + "rad)", "transform-origin:50% 50%"
    ].join(";");
    hud.appendChild(ta);
    const state = { composing: false, id, orig: ta.value, last: ta.value };
    ui.editor = { el: ta, state };
    ta.addEventListener("compositionstart", () => { state.composing = true; });
    ta.addEventListener("compositionend", () => { state.composing = false; });
    ta.addEventListener("input", () => {
      ta.style.height = Math.max(32, ta.scrollHeight + 2) + "px";
      if (!state.composing) commitText(false);      // 確定済みの分だけ流す
    });
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        ta.value = state.orig; state.last = null;
        commitText(true); closeEditor(true); return;
      }
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); closeEditor(false); return; }
      ev.stopPropagation();                          // 短絡キーへ漏らさない
    });
    ta.addEventListener("blur", () => { closeEditor(false); });
    setTimeout(() => { try { ta.focus(); ta.select(); } catch (_e) { /* noop */ } }, 0);
  }

  /**
   * 入力欄の中身を store へ流す。
   * @param {boolean} force IME の途中でも書く（閉じる時は必ず force）
   * @param {Object} [ed] 対象の入力欄（閉じる途中でも渡せるように）
   */
  function commitText(force, ed) {
    const e = ed || ui.editor;
    if (!e || !e.el) return;
    if (e.state.composing && !force) return;
    const v = e.el.value;
    if (v === e.state.last) return;                  // 同じ値を書き続けない
    e.state.last = v;
    try { store.dispatch("clip.setText", { clipId: e.state.id, text: { content: v } }, { label: "文字", coalesce: true }); }
    catch (err) { toast(String(err && err.message || err), { kind: "error" }); }
  }
  /** 入力欄を閉じる。silent = 書かずに捨てる（既に流し込み済みの分は残る） */
  function closeEditor(silent) {
    const e = ui.editor;
    if (!e) return;
    ui.editor = null;                                // 再入（blur → close）を止める
    if (!silent) commitText(true, e);
    try { if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el); } catch (_e) { /* noop */ }
    invalidate();
  }

  /* ══ §10 外向きの口と配線 ════════════════════════════════════ */

  function setMode(mode) {
    const m = PREVIEW_MODES.indexOf(String(mode)) >= 0 ? String(mode) : "select";
    if (m === st.mode) { syncHud(); return st.mode; }
    if (drag.kind) { if (drag.wrote) commitDrag(); else resetDrag(); }
    closeEditor(false);
    st.mode = m;
    lastTap = { t: 0, x: 0, y: 0 };
    pendingTap = null;
    if (wrap) {
      wrap.setAttribute("data-mode", m);
      wrap.style.cursor = m === "pan" ? "grab" : (m === "chroma-pick" ? "crosshair" : "");
    }
    if (m === "mask") {
      const tg = target();
      if (tg && !tg.clip.mask) {
        try { store.dispatch("clip.setMask", { clipId: tg.id, mask: defaultMask() }, { label: "マスクを追加" }); }
        catch (_e) { /* 鍵が掛かっている等。黙って諦める */ }
      }
    }
    syncHud();
    invalidate();
    return st.mode;
  }

  /** 表示の切替（セーフ・グリッド・中心線）。localStorage に覚える */
  function setGuides(patch) {
    const p = patch || {};
    if ("safe" in p) st.guides.safe = !!p.safe;
    if ("grid" in p) st.guides.grid = GRID_MODES.indexOf(String(p.grid)) >= 0 ? String(p.grid) : "none";
    if ("center" in p) st.guides.center = !!p.center;
    writeGuides(st.guides);
    /* セーフエリアは project にも在る（契約書 §1）。在れば合わせる */
    try {
      const s = settings();
      if ("safe" in p && !!s.showSafeArea !== st.guides.safe) {
        store.dispatch("settings.update", { patch: { showSafeArea: st.guides.safe } }, { label: "セーフエリア" });
      }
    } catch (_e) { /* settings.update が無くても表示は効く */ }
    syncHud();
    invalidate();
    return Object.assign({}, st.guides);
  }

  /** 再生中の追従（箱が変わった時だけ描く） */
  function boxKey() {
    const tg = target();
    if (!tg) return "";
    const b = tg.box;
    return [Math.round(b.cx), Math.round(b.cy), Math.round(b.w), Math.round(b.h), Math.round(b.rot * 1000)].join(",");
  }
  function onTime(t) {
    st.time = finite(t, 0);
    if (!st.playing) { invalidate(); return; }
    const k = boxKey();
    if (k !== st.lastBoxKey) { st.lastBoxKey = k; invalidate(); }
  }

  /* ── 配線 ─────────────────────────────────────────────────── */

  function wire() {
    if (!wrap) return;
    /* 触り方の下地（§13.4: これが無いと iOS でページごと拡大する） */
    wrap.style.touchAction = "none";
    try {
      const cs = globalThis.getComputedStyle ? getComputedStyle(wrap) : null;
      if (cs && cs.position === "static") wrap.style.position = "relative";
      if (cs && cs.overflow === "visible") wrap.style.overflow = "hidden";
    } catch (_e) { wrap.style.position = wrap.style.position || "relative"; }
    /* overlay は「画面と同じ寸法」で持つので stage の外へ出す（頭の説明の通り） */
    if (overlay && overlay.parentNode !== wrap) {
      /* HUD より **前**に挿す（後ろに挿すとハンドルの線がボタンの上に乗る） */
      try { wrap.insertBefore(overlay, hud && hud.parentNode === wrap ? hud : null); }
      catch (_e) { try { wrap.appendChild(overlay); } catch (_e2) { /* noop */ } }
    }
    if (overlay) overlay.classList.add("vqs-pv-overlay");
    if (hud) hud.classList.add("vqs-pv-hud");

    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); unsubs.push(() => el.removeEventListener(ev, fn, opt)); };
    on(wrap, "pointerdown", onDown);
    on(wrap, "pointermove", onMove);
    on(wrap, "pointerup", onUp);
    on(wrap, "pointercancel", onCancel);
    on(wrap, "lostpointercapture", (ev) => { pointers.delete(ev.pointerId); });
    on(wrap, "wheel", onWheel, { passive: false });
    on(wrap, "contextmenu", (ev) => {
      if (isTouch()) return;
      ev.preventDefault();
      st.rect = wrap.getBoundingClientRect();
      openContextMenu(toStage(ev));
    });
    on(wrap, "dragstart", (ev) => ev.preventDefault());
    /* iOS だけの 2 本指ズーム（§13.4） */
    for (const g of ["gesturestart", "gesturechange", "gestureend"]) on(wrap, g, (ev) => ev.preventDefault());
    /* touchmove を非 passive で止める（ページのスクロールに奪われない） */
    on(wrap, "touchmove", (ev) => {
      if (hud && ev.target && ev.target !== hud && hud.contains(ev.target)) return;   // 棚は横に流せるまま
      if (ev.cancelable) ev.preventDefault();
    }, { passive: false });

    const onKeyDown = (ev) => {
      if (ev.code === "Space" && !isEditing(ev.target)) { st.spaceDown = true; if (wrap) wrap.classList.add("vqs-pv--pannable"); }
    };
    const onKeyUp = (ev) => {
      if (ev.code === "Space") { st.spaceDown = false; if (wrap) wrap.classList.remove("vqs-pv--pannable"); }
    };
    on(globalThis, "keydown", onKeyDown);
    on(globalThis, "keyup", onKeyUp);
    on(globalThis, "blur", () => { st.spaceDown = false; });

    /* 大きさの変化 */
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => { measure(); invalidate(); });
      try { ro.observe(wrap); unsubs.push(() => ro.disconnect()); } catch (_e) { /* noop */ }
    } else {
      on(globalThis, "resize", () => { measure(); invalidate(); });
    }

    /* store */
    const off = store.subscribe((e) => {
      if (!e) return;
      if (e.kind === "view") { const v = store.view || {}; st.time = finite(v.playhead, st.time); }
      if (e.kind === "project") measure();
      invalidate();
    });
    if (typeof off === "function") unsubs.push(off);

    /* transport（無いことが在る） */
    if (transport && typeof transport.on === "function") {
      try {
        /* engine/playback.js は `{time, playing, ...}` を渡す。数値で来ても読める形に */
        const offT = transport.on("time", (t) => onTime(
          typeof t === "number" ? t : finite(t && t.time, finite(transport.time, st.time))
        ));
        if (typeof offT === "function") unsubs.push(offT);
        const offS = transport.on("state", (s2) => {
          st.playing = s2 && typeof s2.playing === "boolean" ? s2.playing : !!transport.playing;
          if (wrap) wrap.classList.toggle("vqs-pv--playing", st.playing);
          st.lastBoxKey = boxKey();
          invalidate();
        });
        if (typeof offS === "function") unsubs.push(offS);
      } catch (e) { L.warn("transport の購読に失敗", e && e.message); }
    }
  }

  function isEditing(el) {
    if (!el || !el.tagName) return false;
    const t = String(el.tagName).toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || el.isContentEditable === true;
  }

  /* ── 起こす ───────────────────────────────────────────────── */

  st.time = finite((store.view || {}).playhead, 0);
  st.guides.safe = st.guides.safe || !!settings().showSafeArea;
  buildHud();
  wire();
  measure();
  invalidate();

  return {
    /** 1 枚描き直す（app.js が compositor の後に呼ぶ） */
    render() { if (!st.disposed) { measure(); draw(); } },
    setMode,
    get mode() { return st.mode; },
    fit,
    setZoom,
    setGuides,
    /** 今の見え方（試験・検収用。書き換えないこと） */
    get view() { return st.view; },
    dispose() {
      if (st.disposed) return true;
      st.disposed = true;
      if (st.rafId) { cancelAnimationFrame(st.rafId); st.rafId = 0; }
      cancelLongPress();
      closeEditor(true);
      for (const f of unsubs) { try { f(); } catch (_e) { /* noop */ } }
      unsubs = [];
      pointers.clear();
      resetDrag();
      for (const e of ui.own) { try { if (e.parentNode) e.parentNode.removeChild(e); } catch (_e) { /* noop */ } }
      ui.own = [];
      if (ctx2d) { try { ctx2d.setTransform(1, 0, 0, 1, 0, 0); ctx2d.clearRect(0, 0, overlay.width, overlay.height); } catch (_e) { /* noop */ } }
      if (wrap) { wrap.removeAttribute("data-mode"); wrap.style.cursor = ""; }
      return true;
    }
  };
}

export default createPreview;
