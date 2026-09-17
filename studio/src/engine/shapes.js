/* ══════════════════════════════════════════════════════════════════════════
   engine/shapes.js — 図形を canvas に焼く所（矩形・円・矢印・吹き出し…）

   ★ 何をする所か
     契約書 §1 の ShapeSpec を受け取り、**1 枚の canvas**（画面と同じ寸法・
     透明背景）に図形を描いて返す。合成器はテクスチャ 1 枚として扱うだけ。
       renderShape(shapeSpec, { width, height, time, duration }) -> canvas
       SHAPE_PRESETS … 矩形/円/三角/矢印/線/星/吹き出し/ハイライトバー ほか
       shapePath(ctx, type, box, spec) … 道だけ作る（マスクにも使い回せる）

   ★ なぜこの形か
     ・engine/text.js と **同じ約束**（device px で計算・canvas を使い回す・
       影とぼかしは canvas の影機能で作る）にした。2 つの間で単位が違うと
       「文字と図形を並べたら太さが合わない」事故が起きる。
     ・道（path）を型ごとの関数に分け、塗り/縁/影/グローは 1 箇所で回す。
       型を足すのが 1 関数で済み、見栄えの規則が全型で揃う。
     ・engine/text.js を import しない。片方が壊れたときに両方消えるのを
       避ける（canvas2d.js は 2 つを別々に動的 import している）。

   ★ 触るときの注意
     ・`w`/`h` は **画面に対する割合**（契約書 §1）。px ではない。
     ・`stroke.width` は「短辺 1080 のときの px」。`min(W,H)/1080` を掛ける。
     ・`SHAPE_PRESETS` は中まで凍っている。写しを取ってから書き換える。

   CONTRACT-NOTE (1): `core/schema.js` の `SHAPE_TYPES` は
     rect/ellipse/triangle/arrow/line/star の 6 種だけなので、"bubble"（吹き出し）
     と "bar"（ハイライトバー）は **保存すると rect に落ちる**。統合担当へ:
     SHAPE_TYPES に "bubble" と "bar" を足してほしい（落ちても角丸の矩形として
     出るので破綻はしない）。同じ理由で spec.x/y/rotate/anim 等の追加キーも
     正規化で消える。消えても既定（中央・回転なし・アニメなし）で描く。
   CONTRACT-NOTE (2): 縁の太さの基準は `min(W,H)/1080`。engine/canvas2d.js の
     `renderShapeFallback` は同じ式に **×4** している（あちらは shapes.js が
     読めない時だけの保険なので合わせない。太さの真はこちら）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, clamp01, finite, lerp, hexToRgba, EASE } from "../core/util.js";
import { scope } from "../core/log.js";

const L = scope("shapes");

/* ══ §0 定数 ═══════════════════════════════════════════════════════ */

/** 太さの基準になる短辺（engine/text.js の REF_SHORT_SIDE と同じ） */
export const REF_SHORT_SIDE = 1080;
/** ループアニメの 1 周（秒。engine/text.js と揃える） */
export const LOOP_PERIOD = 1.6;
/** 「遠くに描いて影だけ落とす」逃がし距離（§13.2: ctx.filter は Safari に無い） */
const FAR = 20000;

/** 描ける型（契約の 6 種 + 拡張。CONTRACT-NOTE (1)） */
export const SHAPE_TYPES_EXT = Object.freeze([
  "rect", "ellipse", "triangle", "arrow", "line", "star",
  "bubble", "bar", "ring", "diamond", "pentagon", "hexagon",
  "heart", "cross", "chevron", "burst"
]);

/* ══ §1 canvas（使い回し）と色の小道具 ════════════════════════════ */

function newCanvas(w, h) {
  const W = Math.max(1, Math.round(finite(w, 1))), H = Math.max(1, Math.round(finite(h, 1)));
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(W, H);
  throw new Error("canvas を作れません（document も OffscreenCanvas も在りません）");
}

/* 枚数の決め方は engine/text.js の同じ所と揃える（理由もそちらに書いた）:
   engine/canvas2d.js の 6 枚 cache と衝突しないのは 7 枚以上。ただし大きい
   canvas を何枚も持つと iOS の canvas 予算に当たるので、総画素の予算で決める。 */
const POOL_BUDGET_PX = 12e6, POOL_MAX_SIZES = 3;
function poolSizeFor(area) { return clamp(Math.floor(POOL_BUDGET_PX / Math.max(1, area)), 2, 8); }
/** @type {Map<string,{list:any[],next:number}>} */
const pool = new Map();

/**
 * プールから canvas を 1 枚借りる。
 * @param {number} w @param {number} h @returns {any}
 */
export function acquireShapeCanvas(w, h) {
  const W = Math.max(1, Math.round(finite(w, 1))), H = Math.max(1, Math.round(finite(h, 1)));
  const key = W + "x" + H;
  let slot = pool.get(key);
  if (!slot) {
    if (pool.size >= POOL_MAX_SIZES) pool.delete(pool.keys().next().value);
    slot = { list: [], next: 0 };
    pool.set(key, slot);
  }
  let cv;
  if (slot.list.length < poolSizeFor(W * H)) { cv = newCanvas(W, H); slot.list.push(cv); }
  else {
    cv = slot.list[slot.next % slot.list.length];
    slot.next = (slot.next + 1) % slot.list.length;
  }
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  return cv;
}

/** プールを捨てる */
export function clearShapeCache() { pool.clear(); }

/** "#rrggbbaa" を canvas が必ず解る形へ（8 桁 hex は古い WebKit が読めない） */
function cssColor(v) {
  if (typeof v !== "string" || !v) return "#ffffff";
  const c = hexToRgba(v);
  if (!c) return v;                                // "rgba(...)" や色名はそのまま
  const to255 = (x) => Math.round(clamp01(x) * 255);
  return "rgba(" + to255(c[0]) + "," + to255(c[1]) + "," + to255(c[2]) + "," + clamp01(c[3]).toFixed(3) + ")";
}
/** 色の α（0 なら描かない判断に使う） */
function alphaOf(v) {
  const c = hexToRgba(typeof v === "string" ? v : "");
  return c ? c[3] : 1;
}

/* ══ §2 道（path）══════════════════════════════════════════════════ */

/** 角丸の道（ctx.roundRect は Safari 16 以降にしか無い） */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(finite(r, 0), Math.min(w, h) / 2));
  ctx.beginPath();
  if (rr <= 0.01) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** 正 n 角形（頂点は真上から時計回り） */
function polygon(ctx, cx, cy, rx, ry, n, rot) {
  ctx.beginPath();
  const k = Math.max(3, Math.round(n));
  for (let i = 0; i < k; i++) {
    const a = -Math.PI / 2 + finite(rot, 0) + (i * Math.PI * 2) / k;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** 星（points 個の角・inner は内側の半径比） */
function star(ctx, cx, cy, rx, ry, points, inner) {
  const n = Math.max(3, Math.round(finite(points, 5)));
  const ir = clamp(finite(inner, 0.42), 0.05, 0.98);
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const k = i % 2 ? ir : 1;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * 型ごとの道を ctx に作る（塗りも縁も呼ぶ側の仕事）。マスクにも使える。
 * @param {any} ctx 2d context
 * @param {string} type SHAPE_TYPES_EXT のどれか
 * @param {{x:number,y:number,w:number,h:number}} b 外接の箱（px）
 * @param {Object} [spec] ShapeSpec（radius / points / tail / thickness を見る）
 * @returns {boolean} 塗れる道を作れたか（line は false = 縁だけで描く）
 */
export function shapePath(ctx, type, b, spec) {
  const s = spec || {};
  const x = b.x, y = b.y, w = Math.max(0.5, b.w), h = Math.max(0.5, b.h);
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;
  const rad = clamp01(finite(s.radius, 0)) * (Math.min(w, h) / 2);
  switch (String(type)) {
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      return true;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(cx, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      ctx.closePath();
      return true;
    case "star":
      star(ctx, cx, cy, rx, ry, s.points, s.inner);
      return true;
    case "burst":
      star(ctx, cx, cy, rx, ry, finite(s.points, 12), finite(s.inner, 0.74));
      return true;
    case "diamond":
      polygon(ctx, cx, cy, rx, ry, 4, 0);
      return true;
    case "pentagon":
      polygon(ctx, cx, cy, rx, ry, 5, 0);
      return true;
    case "hexagon":
      polygon(ctx, cx, cy, rx, ry, 6, 0);
      return true;
    case "ring": {
      const t = clamp(finite(s.thickness, 0.22), 0.02, 0.95);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, cy, rx * (1 - t), ry * (1 - t), 0, 0, Math.PI * 2);
      return true;                                 // 塗りは "evenodd" で
    }
    case "cross": {
      const t = clamp(finite(s.thickness, 0.32), 0.05, 1) * Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.moveTo(cx - t, y); ctx.lineTo(cx + t, y);
      ctx.lineTo(cx + t, cy - t); ctx.lineTo(x + w, cy - t);
      ctx.lineTo(x + w, cy + t); ctx.lineTo(cx + t, cy + t);
      ctx.lineTo(cx + t, y + h); ctx.lineTo(cx - t, y + h);
      ctx.lineTo(cx - t, cy + t); ctx.lineTo(x, cy + t);
      ctx.lineTo(x, cy - t); ctx.lineTo(cx - t, cy - t);
      ctx.closePath();
      return true;
    }
    case "arrow": {
      const hx = clamp(finite(s.head, 0.34), 0.05, 0.9) * w;   // 矢の頭の長さ
      const sh = clamp(finite(s.shaft, 0.42), 0.05, 1) * h;    // 軸の太さ
      ctx.beginPath();
      ctx.moveTo(x, cy - sh / 2);
      ctx.lineTo(x + w - hx, cy - sh / 2);
      ctx.lineTo(x + w - hx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(x + w - hx, y + h);
      ctx.lineTo(x + w - hx, cy + sh / 2);
      ctx.lineTo(x, cy + sh / 2);
      ctx.closePath();
      return true;
    }
    case "chevron": {
      const t = clamp(finite(s.thickness, 0.3), 0.05, 1) * w;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + t, y);
      ctx.lineTo(x + w, cy); ctx.lineTo(x + t, y + h);
      ctx.lineTo(x, y + h); ctx.lineTo(x + w - t, cy);
      ctx.closePath();
      return true;
    }
    case "heart": {
      const k = h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, y + h);
      ctx.bezierCurveTo(cx - w * 0.78, cy + k * 0.1, cx - w * 0.5, y - k * 0.42, cx, y + h * 0.28);
      ctx.bezierCurveTo(cx + w * 0.5, y - k * 0.42, cx + w * 0.78, cy + k * 0.1, cx, y + h);
      ctx.closePath();
      return true;
    }
    case "bar": {
      /* ハイライトバー（蛍光ペン）。角は必ず丸める */
      roundRect(ctx, x, y, w, h, finite(s.radius, 0) > 0 ? rad : h / 2);
      return true;
    }
    case "bubble": {
      /* 吹き出し。尾は既定で下の左寄り（CapCut の既定と同じ向き） */
      const at = String(s.tailAt || (s.tail && s.tail.at) || "bl");
      const tw = clamp(finite((s.tail && s.tail.w) || s.tailW, 0.16), 0.02, 0.6) * w;
      const th = clamp(finite((s.tail && s.tail.h) || s.tailH, 0.22), 0.02, 0.8) * h;
      const r = Math.max(2, finite(s.radius, 0) > 0 ? rad : Math.min(w, h) * 0.22);
      const bh = Math.max(2, h - th);
      roundRect(ctx, x, y, w, bh, r);
      /* 尾を本体にくっつける（同じ path に足す＝塗りが 1 つに繋がる） */
      const bx = at === "br" ? x + w - r - tw * 1.6 : (at === "b" ? cx - tw / 2 : x + r + tw * 0.4);
      ctx.moveTo(bx, y + bh - 1);
      ctx.lineTo(bx + tw, y + bh - 1);
      ctx.lineTo(bx + (at === "br" ? 0 : tw * 0.35), y + bh + th);
      ctx.closePath();
      return true;
    }
    case "line":
      return false;                                // 縁（stroke）だけで描く
    case "rect":
    default:
      roundRect(ctx, x, y, w, h, rad);
      return true;
  }
}

/* ══ §3 アニメ（engine/text.js と同じ約束: p=1 が素の状態）════════ */

const eOut = EASE.out;
const TAU = Math.PI * 2;

function sanitize(o) {
  const s = o && typeof o === "object" ? o : {};
  /* -0 は 0 へ（比較と cache 鍵の罠を避ける。engine/text.js と同じ約束） */
  const n = (v, d, lo, hi) => { const x = clamp(finite(v, d), lo, hi); return x === 0 ? 0 : x; };
  return {
    opacity: n(s.opacity, 1, 0, 1),
    dx: n(s.dx, 0, -8, 8), dy: n(s.dy, 0, -8, 8),
    scale: n(s.scale, 1, 0, 20), scaleX: n(s.scaleX, 1, 0, 20), scaleY: n(s.scaleY, 1, 0, 20),
    rotate: n(s.rotate, 0, -3600, 3600),
    clip: n(s.clip, 1, 0, 1),
    clipDir: ["l", "r", "t", "b"].indexOf(s.clipDir) >= 0 ? s.clipDir : "l",
    dash: n(s.dash, 1, 0, 1)
  };
}

function def(name, kinds, fn) {
  const wrapped = (p, i, n) => {
    const q = clamp01(finite(p, 1));
    let out = null;
    try { out = fn(q, Math.max(0, finite(i, 0)), Math.max(1, finite(n, 1))); }
    catch (e) { L.warn("図形のアニメが投げました", name, e); }
    return sanitize(out);
  };
  return Object.freeze({ name, label: name, kinds: Object.freeze(kinds.slice()), fn: wrapped });
}

/**
 * 図形のアニメ一覧。`fn(p,i,n) -> { opacity,dx,dy,scale,rotate,clip,dash }`。
 * **p=1 が素の状態**（入りは 0→1、出しは 1→0）。ループは 0..1 の循環。
 * dx/dy は図形の箱の短辺に対する比。
 */
export const SHAPE_ANIMS = Object.freeze({
  none: def("なし", ["in", "out", "loop"], () => ({})),
  fade: def("ふわっと", ["in", "out"], (p) => ({ opacity: eOut(p) })),
  popIn: def("ぽん", ["in", "out"], (p) => ({
    opacity: clamp01(p * 3), scale: lerp(0.2, 1, eOut(p))
  })),
  growW: def("横に伸びる", ["in", "out"], (p) => ({ scaleX: Math.max(0.001, eOut(p)) })),
  growH: def("縦に伸びる", ["in", "out"], (p) => ({ scaleY: Math.max(0.001, eOut(p)) })),
  wipeL: def("左から出る", ["in", "out"], (p) => ({ clip: eOut(p), clipDir: "l" })),
  wipeR: def("右から出る", ["in", "out"], (p) => ({ clip: eOut(p), clipDir: "r" })),
  wipeU: def("下から出る", ["in", "out"], (p) => ({ clip: eOut(p), clipDir: "b" })),
  drawLine: def("線を描く", ["in", "out"], (p) => ({ dash: eOut(p) })),
  slideL: def("左から", ["in", "out"], (p) => ({ opacity: clamp01(p * 2.5), dx: -(1 - eOut(p)) * 1.2 })),
  slideR: def("右から", ["in", "out"], (p) => ({ opacity: clamp01(p * 2.5), dx: (1 - eOut(p)) * 1.2 })),
  spinIn: def("回って出る", ["in", "out"], (p) => ({
    opacity: eOut(p), rotate: -(1 - eOut(p)) * 180, scale: lerp(0.3, 1, eOut(p))
  })),
  pulse: def("脈打つ", ["loop"], (p) => ({ scale: 1 + 0.07 * Math.sin(p * TAU) })),
  float: def("浮く", ["loop"], (p) => ({ dy: -0.08 * Math.sin(p * TAU) })),
  spin: def("回り続ける", ["loop"], (p) => ({ rotate: p * 360 })),
  blink: def("点滅", ["loop"], (p) => ({ opacity: 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(p * TAU)) })),
  breathe: def("呼吸", ["loop"], (p) => ({ scale: 1 + 0.04 * Math.sin(p * TAU), opacity: 0.85 + 0.15 * Math.cos(p * TAU) }))
});

/** 名簿の id 一覧 */
export const SHAPE_ANIM_IDS = Object.freeze(Object.keys(SHAPE_ANIMS));

/** 名簿から 1 つ引く（知らない名前は none。保存が新しくても再生は止めない） */
function entry(type) {
  return SHAPE_ANIMS[typeof type === "string" ? type : ""] || SHAPE_ANIMS.none;
}

/**
 * 図形の今の状態（入り/出し/ループを重ねた物）。
 * @param {Object} anim { in:{type,duration}, out:{...}, loop:{type,speed} }
 * @param {number} time clip ローカル秒 @param {number} duration clip の尺
 * @returns {{opacity:number,dx:number,dy:number,scale:number,scaleX:number,scaleY:number,rotate:number,clip:number,clipDir:string,dash:number}}
 */
export function shapeAnimState(anim, time, duration) {
  const a = anim && typeof anim === "object" ? anim : {};
  const ai = a.in || {}, ao = a.out || {}, al = a.loop || {};
  const t = finite(time, 0);
  /* 尺が来なかったときは「十分長い」として扱う（0 扱いにすると入りと出しが
     両方 0 秒に潰れてアニメが消える）。engine/text.js と同じ約束。 */
  const dur = finite(duration, 0) > 0 ? finite(duration, 0) : 3600;
  let inDur = clamp(finite(ai.duration, 0), 0, 600);
  let outDur = clamp(finite(ao.duration, 0), 0, 600);
  if (!ai.type || ai.type === "none") inDur = 0;
  if (!ao.type || ao.type === "none") outDur = 0;
  if (inDur + outDur > dur && inDur + outDur > 0) {
    const k = dur / (inDur + outDur);
    inDur *= k; outDur *= k;
  }
  const inP = inDur > 0 ? clamp01(t / inDur) : 1;
  const outP = outDur > 0 ? 1 - clamp01((t - (dur - outDur)) / outDur) : 1;
  const speed = clamp(finite(al.speed, 1), 0.05, 10);
  const cyc = (Math.max(0, t) * speed) / LOOP_PERIOD;
  const list = [
    entry(ai.type).fn(inP, 0, 1),
    entry(ao.type).fn(outP, 0, 1),
    entry(al.type).fn(cyc - Math.floor(cyc), 0, 1)
  ];
  const out = sanitize({});
  for (const s of list) {
    out.opacity *= s.opacity;
    out.dx += s.dx; out.dy += s.dy;
    out.scale *= s.scale; out.scaleX *= s.scaleX; out.scaleY *= s.scaleY;
    out.rotate += s.rotate;
    out.dash = Math.min(out.dash, s.dash);
    if (s.clip < out.clip) { out.clip = s.clip; out.clipDir = s.clipDir; }
  }
  return sanitize(out);
}

/* ══ §4 描く（renderShape）════════════════════════════════════════ */

/**
 * 図形を 1 枚の canvas に焼く（契約書 §4-5）。
 * 返す canvas は **使い回し**なので、次に呼ぶ前に使い終わること。
 * @param {Object} shapeSpec 契約書 §1 の ShapeSpec（+ 任意の x/y/rotate/anim）
 * @param {{width:number,height:number,time?:number,duration?:number,dpr?:number,
 *          anim?:Object,opacity?:number}} opts
 * @returns {any} canvas
 */
export function renderShape(shapeSpec, opts) {
  const s = shapeSpec && typeof shapeSpec === "object" ? shapeSpec : {};
  const o = opts || {};
  const dpr = clamp(finite(o.dpr, 1), 0.25, 2);
  const W = Math.max(1, Math.round(Math.max(1, finite(o.width, 1920)) * dpr));
  const H = Math.max(1, Math.round(Math.max(1, finite(o.height, 1080)) * dpr));

  const cv = acquireShapeCanvas(W, H);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d の context を取れません（図形を描けません）");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.setLineDash([]);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if ("filter" in ctx) ctx.filter = "none";
  ctx.clearRect(0, 0, W, H);

  const type = String(s.type || "rect");
  const unit = Math.min(W, H) / REF_SHORT_SIDE;    // 太さの基準（CONTRACT-NOTE (2)）
  const bw = clamp(finite(s.w, 0.3), 0.001, 4) * W;
  const bh = clamp(finite(s.h, 0.2), 0.001, 4) * H;
  const cx = clamp(finite(s.x, 0.5), -2, 3) * W;
  const cy = clamp(finite(s.y, 0.5), -2, 3) * H;
  const box = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };

  const st = s.stroke || {};
  const strokePx = Math.max(0, finite(st.width, 0)) * unit;
  const strokeCol = cssColor(st.color || "#000000");
  const fillCol = s.gradient ? null : cssColor(s.fill || "#ffffff");
  const hasFill = alphaOf(s.fill || "#ffffff") > 0.004 || !!s.gradient;
  const hasStroke = strokePx > 0.01 && alphaOf(st.color || "#000000") > 0.004;

  const anim = o.anim || s.anim || null;
  const A = shapeAnimState(anim, finite(o.time, 0), finite(o.duration, 0));
  if (A.opacity <= 0.002) return cv;

  /* 変形（図形の中心が軸） */
  const short = Math.max(1, Math.min(bw, bh));
  const rot = (finite(s.rotate, 0) + A.rotate) * Math.PI / 180;
  const sx = A.scale * A.scaleX, sy = A.scale * A.scaleY;
  ctx.save();
  ctx.translate(cx + A.dx * short, cy + A.dy * short);
  if (Math.abs(rot) > 1e-4) ctx.rotate(rot);
  ctx.scale(Math.abs(sx) < 1e-4 ? 1e-4 : sx, Math.abs(sy) < 1e-4 ? 1e-4 : sy);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = clamp01(A.opacity * clamp01(finite(o.opacity, 1)) * clamp01(finite(s.opacity, 1)));

  if (A.clip < 0.999) {
    const c = clamp01(A.clip);
    const pad = Math.max(bw, bh);
    ctx.beginPath();
    if (A.clipDir === "r") ctx.rect(box.x + bw * (1 - c), box.y - pad, bw * c + 1, bh + pad * 2);
    else if (A.clipDir === "t") ctx.rect(box.x - pad, box.y, bw + pad * 2, bh * c + 1);
    else if (A.clipDir === "b") ctx.rect(box.x - pad, box.y + bh * (1 - c), bw + pad * 2, bh * c + 1);
    else ctx.rect(box.x - pad, box.y - pad, (bw * c + 1) + pad, bh + pad * 2);
    ctx.clip();
  }

  /* 塗り方（グラデは箱の中で角度どおりに） */
  let paint = fillCol;
  if (s.gradient) {
    const g = s.gradient;
    const a = finite(g.angle, 0) * Math.PI / 180;
    const r = (Math.abs(Math.cos(a)) * bw + Math.abs(Math.sin(a)) * bh) / 2;
    try {
      const gr = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r,
        cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      gr.addColorStop(0, cssColor(g.from || "#ffffff"));
      gr.addColorStop(1, cssColor(g.to || "#000000"));
      paint = gr;
    } catch (_e) { paint = cssColor(s.fill || "#ffffff"); }
  }

  const fillable = type !== "line";
  const evenOdd = type === "ring";

  /* ① 影（自分の形の影だけを画面に落とす） */
  const sh = s.shadow || null;
  if (sh && alphaOf(sh.color || "#000000") > 0.004) {
    const bl = Math.max(0, finite(sh.blur, 0)) * unit;
    const ox = finite(sh.x, 0) * unit, oy = finite(sh.y, 0) * unit;
    if (bl > 0 || Math.abs(ox) > 0.01 || Math.abs(oy) > 0.01) {
      shadowOnly(cssColor(sh.color || "#000000"), bl, ox, oy, () => paintBody("#000000", "#000000"));
    }
  }

  /* ② 本体（塗り → 縁） */
  paintBody(paint, strokeCol);

  /* ③ グロー（形の外に光を足す） */
  const gl = s.glow || null;
  if (gl && Math.max(0, finite(gl.blur, 0)) > 0 && alphaOf(gl.color || "#ffffff") > 0.004) {
    const gpx = Math.max(0, finite(gl.blur, 0)) * unit;
    const gc = cssColor(gl.color || "#ffffff");
    shadowOnly(gc, gpx, 0, 0, () => paintBody("#000000", "#000000"));
    shadowOnly(gc, gpx * 0.5, 0, 0, () => paintBody("#000000", "#000000"));
  }

  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  return cv;

  /** 塗りと縁を 1 回描く（影・グローでも同じ形を使い回す） */
  function paintBody(fp, sp) {
    if (type === "line") {
      /* 線は「縁だけ」。太さは stroke.width、無ければ箱の高さから決める */
      const th = strokePx > 0.01 ? strokePx : Math.max(1.5 * unit, bh * 0.28);
      const len = bw * clamp01(A.dash);
      ctx.beginPath();
      ctx.moveTo(box.x, cy);
      ctx.lineTo(box.x + len, cy);
      ctx.lineWidth = th;
      ctx.lineCap = String(s.cap || "round") === "butt" ? "butt" : "round";
      ctx.strokeStyle = hasStroke ? sp : (typeof fp === "string" ? fp : sp);
      if (Array.isArray(s.dashPattern) && s.dashPattern.length) {
        ctx.setLineDash(s.dashPattern.map((v) => Math.max(0.5, finite(v, 4) * unit)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const ok = shapePath(ctx, type, box, s);
    if (!ok) return;
    if (hasFill) {
      ctx.fillStyle = fp;
      if (evenOdd) ctx.fill("evenodd"); else ctx.fill();
    }
    if (hasStroke) {
      ctx.lineWidth = strokePx;
      ctx.strokeStyle = sp;
      ctx.lineJoin = "round";
      if (A.dash < 0.999) {
        /* 「線を描く」アニメ: 周長を測れないので破線の長さで近似する */
        const per = (bw + bh) * 2;
        ctx.setLineDash([per * clamp01(A.dash), per]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** 影だけを画面に落とす（CTM の倍率を打ち消す。engine/text.js と同じ技） */
  function shadowOnly(color, blurPx, ox, oy, draw) {
    if (Math.abs(sx) < 0.05) return;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(0, blurPx);
    ctx.shadowOffsetX = FAR * Math.cos(rot) + ox;
    ctx.shadowOffsetY = FAR * Math.sin(rot) + oy;
    ctx.translate(-FAR / sx, 0);
    draw();
    ctx.restore();
  }
}

/* ══ §5 プリセット（SHAPE_PRESETS）════════════════════════════════ */

function deepFreeze(v) {
  if (!v || typeof v !== "object" || Object.isFrozen(v)) return v;
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return Object.freeze(v);
}

/** プリセット 1 つ（shape は ShapeSpec の完成品・anim は推奨） */
function preset(id, label, shape, anim, tags) {
  return deepFreeze({
    id, label, name: label, tags: (tags || []).slice(),
    shape: Object.assign({
      type: "rect", fill: "#ffffff", stroke: { width: 0, color: "#000000" },
      radius: 0, w: 0.3, h: 0.2
    }, shape || null),
    anim: Object.assign({
      in: { type: "none", duration: 0 }, out: { type: "none", duration: 0 },
      loop: { type: "none", speed: 1 }
    }, anim || null)
  });
}

/**
 * 図形のプリセット（矩形/円/三角/矢印/線/星/吹き出し/ハイライトバー ほか）。
 * `SHAPE_PRESETS[id] = { id, label, shape, anim, tags }`。中まで凍っている。
 * @type {Object<string,{id:string,label:string,name:string,tags:string[],shape:Object,anim:Object}>}
 */
export const SHAPE_PRESETS = Object.freeze({
  rect: preset("rect", "矩形", {
    type: "rect", fill: "#ffffffee", radius: 0.08, w: 0.34, h: 0.2
  }, { in: { type: "popIn", duration: 0.3 } }, ["basic"]),

  rectOutline: preset("rectOutline", "枠（線だけ）", {
    type: "rect", fill: "#ffffff00", stroke: { width: 6, color: "#ffffff" }, radius: 0.06, w: 0.4, h: 0.26
  }, { in: { type: "wipeL", duration: 0.35 } }, ["basic", "frame"]),

  circle: preset("circle", "円", {
    type: "ellipse", fill: "#ff3b5cdd", w: 0.22, h: 0.22
  }, { in: { type: "popIn", duration: 0.32 }, loop: { type: "breathe", speed: 0.7 } }, ["basic"]),

  ring: preset("ring", "丸枠", {
    type: "ring", fill: "#ffd24d", w: 0.26, h: 0.26, thickness: 0.16
  }, { in: { type: "spinIn", duration: 0.45 } }, ["basic", "frame"]),

  triangle: preset("triangle", "三角", {
    type: "triangle", fill: "#ffe100", w: 0.2, h: 0.18
  }, { in: { type: "popIn", duration: 0.3 } }, ["basic"]),

  arrow: preset("arrow", "矢印", {
    type: "arrow", fill: "#ff5f2e", w: 0.34, h: 0.16, head: 0.36, shaft: 0.44
  }, { in: { type: "slideL", duration: 0.34 }, loop: { type: "float", speed: 0.9 } }, ["basic", "point"]),

  line: preset("line", "線", {
    type: "line", fill: "#ffffff", stroke: { width: 8, color: "#ffffff" }, w: 0.5, h: 0.04
  }, { in: { type: "drawLine", duration: 0.4 } }, ["basic", "divider"]),

  dashLine: preset("dashLine", "破線", {
    type: "line", fill: "#ffffff", stroke: { width: 6, color: "#ffffffcc" },
    w: 0.5, h: 0.04, dashPattern: [18, 14]
  }, { in: { type: "drawLine", duration: 0.5 } }, ["divider"]),

  star: preset("star", "星", {
    type: "star", fill: "#ffd24d", w: 0.2, h: 0.2, points: 5, inner: 0.42
  }, { in: { type: "spinIn", duration: 0.4 }, loop: { type: "pulse", speed: 0.8 } }, ["basic", "deco"]),

  burst: preset("burst", "爆発（強調）", {
    type: "burst", fill: "#ff2d4f", stroke: { width: 6, color: "#ffffff" },
    w: 0.3, h: 0.3, points: 14, inner: 0.72
  }, { in: { type: "popIn", duration: 0.28 }, loop: { type: "spin", speed: 0.15 } }, ["deco", "ad"]),

  bubble: preset("bubble", "吹き出し", {
    type: "bubble", fill: "#ffffffee", stroke: { width: 0, color: "#000000" },
    radius: 0.3, w: 0.44, h: 0.24, tail: { at: "bl", w: 0.16, h: 0.26 }
  }, { in: { type: "popIn", duration: 0.34 }, out: { type: "popIn", duration: 0.2 } }, ["talk"]),

  bubbleDark: preset("bubbleDark", "吹き出し（黒）", {
    type: "bubble", fill: "#14161cee", stroke: { width: 3, color: "#ffffff55" },
    radius: 0.3, w: 0.44, h: 0.24, tail: { at: "br", w: 0.16, h: 0.26 }
  }, { in: { type: "popIn", duration: 0.34 } }, ["talk"]),

  bar: preset("bar", "ハイライトバー", {
    type: "bar", fill: "#ffe14d99", w: 0.5, h: 0.09
  }, { in: { type: "growW", duration: 0.32 } }, ["emphasis", "text"]),

  barSolid: preset("barSolid", "帯（下地）", {
    type: "bar", fill: "#111827dd", radius: 0.2, w: 0.7, h: 0.14
  }, { in: { type: "wipeL", duration: 0.3 } }, ["emphasis", "text"]),

  underline: preset("underline", "下線", {
    type: "bar", fill: "#ff3b5c", w: 0.36, h: 0.025
  }, { in: { type: "growW", duration: 0.28 } }, ["emphasis", "text"]),

  diamond: preset("diamond", "菱形", {
    type: "diamond", fill: "#8ef6ff", w: 0.2, h: 0.2
  }, { in: { type: "spinIn", duration: 0.4 } }, ["deco"]),

  hexagon: preset("hexagon", "六角形", {
    type: "hexagon", fill: "#59e0ff", stroke: { width: 4, color: "#062733" }, w: 0.22, h: 0.24
  }, { in: { type: "popIn", duration: 0.32 } }, ["deco"]),

  heart: preset("heart", "ハート", {
    type: "heart", fill: "#ff5fa2", w: 0.2, h: 0.18
  }, { in: { type: "popIn", duration: 0.3 }, loop: { type: "pulse", speed: 1.2 } }, ["deco", "kids"]),

  cross: preset("cross", "十字", {
    type: "cross", fill: "#ffffff", w: 0.16, h: 0.16, thickness: 0.34
  }, { in: { type: "spinIn", duration: 0.36 } }, ["deco"]),

  chevron: preset("chevron", "山形（進む）", {
    type: "chevron", fill: "#ffd24d", w: 0.14, h: 0.18, thickness: 0.34
  }, { in: { type: "slideL", duration: 0.3 }, loop: { type: "float", speed: 1.2 } }, ["point"]),

  spotlight: preset("spotlight", "丸い強調（穴あき風）", {
    type: "ring", fill: "#000000aa", w: 0.5, h: 0.5, thickness: 0.06
  }, { in: { type: "fade", duration: 0.3 } }, ["emphasis"]),

  frame16: preset("frame16", "額縁", {
    type: "rect", fill: "#ffffff00", stroke: { width: 14, color: "#ffffff" }, radius: 0.02, w: 0.92, h: 0.86
  }, { in: { type: "fade", duration: 0.4 } }, ["frame"])
});

/** プリセットの id 一覧 */
export const SHAPE_PRESET_IDS = Object.freeze(Object.keys(SHAPE_PRESETS));

/**
 * プリセットの ShapeSpec の **写し**（凍っていない物）を返す。
 * @param {string} id @returns {Object}
 */
export function presetShape(id) {
  const p = SHAPE_PRESETS[String(id || "")];
  const src = p ? p.shape : { type: "rect", fill: "#ffffff", stroke: { width: 0, color: "#000000" }, radius: 0, w: 0.3, h: 0.2 };
  const out = Object.assign({}, src);
  for (const k of ["stroke", "shadow", "glow", "gradient", "tail"]) {
    if (out[k] && typeof out[k] === "object") out[k] = Object.assign({}, out[k]);
  }
  if (Array.isArray(out.dashPattern)) out.dashPattern = out.dashPattern.slice();
  return out;
}
