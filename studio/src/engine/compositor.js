/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/compositor.js — 1 フレームを合成する心臓部（契約書 §4）

   ★ 何をする所か
     `createCompositor(canvas, { preferGL })` が Compositor を返す。
     `renderFrame(project, time, { sources, quality, forExport })` を呼ぶと
     その時刻の絵が canvas に出る。**プレビューと書き出しは同じこの道**を通る
     （別実装を持たせない。持たせると必ず食い違う）。段取りは契約書 §4 どおり:
       1. 出力解像度 = settings.width/height × quality。背景（色/ぼかし/画像）
       2. eval.clipsAt を **下から上**へ。adjust トラックはそこまでの合成結果に効果
       3. 各層: sources.acquire → fsLayer（crop→mask→chroma→grade→fx 1 段目）
          → 残りの fx は fsEffect で FBO ピンポン → transform 付き四角形で親へ
       4. 遷移中は A と B をそれぞれ層として FBO に描き、fsTransition で混ぜる
       5. text/shape は engine/text.js の canvas をテクスチャにして同じ道
       6. 最後に canvas へ blit（forExport なら readPixels できる状態で await 可能）

   ★ なぜこの形か
     ・**生の WebGL を自分で書かない**。`engine/gl/context.js` の GLCtx が
       program / texture / FBO / 喪失の面倒を全部持ち、`engine/gl/shaders.js` が
       GLSL を全部持つ（あちらの見出しに「compositor はこれ 1 つだけを相手に
       する」と書いて在る通り）。ここは **段取りだけ**に責任を持つ。
       → GLSL をこちらにも書くと「同じ効果が 2 実装」になり、必ず食い違う。
     ・色は **straight alpha**（事前乗算しない）。shaders.js の composite() /
       cropMask() がその前提で書かれている。FBO へ 1 枚だけ描くときは
       blend:"none"（置き換え）にして、半透明の縁が濁らないようにする。
     ・重ね方（blend）は 13 種。normal と add は固定機能で足りるので 1 パス、
       それ以外は `fsBlend(mode)` で「下の絵を読んで混ぜる」2 パスにする。
     ・全部 FBO の中で組み立ててから 最後に 1 回だけ canvas へ移す。
       adjust（下の合成結果に効果）と 遷移（2 枚を混ぜる）は「描いた物をもう
       1 度読む」必要が在り、canvas に直接描くと出来ない。
     ・同じ time で 2 回呼ばれたら 2 回描く（キャッシュしない = 契約）。ただし
       FBO・プログラム・テクスチャの器は使い回す（毎フレーム作ると必ず落ちる）。
     ・**失敗しても真っ黒にしない**。層 1 枚の例外はその層を飛ばして warnOnce。
       WebGL が無い / 文脈を失った時は canvas2d.js の互換品へ自動で移る
       （backend が "2d" に変わり、落ちた機能名が stats().missing に並ぶ）。

   ★ 共通規約（A7/A8/A14/A15 と一致させる約束）
     ・WebGL2 / GLSL ES 3.00。1 行目は "#version 300 es"（shaders.js が守る）。
     ・頂点シェーダは shaders.js の VS_QUAD 1 本。aPos は単位四角 [0,1]^2。
     ・テクスチャ単位: 0=uTex 1=uTexB 2=uLut 3=uMask（GLCtx.drawQuad が固定）。
     ・共通 uniform: uRes / uTexRes / uTime / uOpacity / uP。
       カラー一式の名前は **shaders.js の GRADE_UNIFORMS 表が決める**（§C）。
     ・効果は `vec4 fxApply(vec4 c, vec2 uv)`、遷移は `vec4 trApply(vec2 uv, float p)`
       を 1 個ずつ提供する。効果の追加 uniform は `uFx_<paramKey>`。
     ・色は sRGB のまま扱う（linear 変換はしない）。
     ・uv は **左上原点**。素材は flipY:false で上げ、canvas 宛ての描画だけ
       Y を反転する（GLCtx.projection() が面倒を見る）。ここを崩すと上下が
       逆さまになる（一番よく在る事故）。

   ★ 触るときの注意
     ・幾何（scale 1 = contain / x,y は割合で中心原点 / anchor は回転と拡大の
       中心 / crop はその場で切り落とす）は canvas2d.js §A の `layerBox()` に
       集約。2d の互換品と 1 か所で共有する。
     ・`console` は呼ばない（core/log.js の scope 経由）。

   CONTRACT-NOTE (1): 隣の 4 つ（gl/context.js・gl/shaders.js・transitions.js・
     fx/registry.js）は **top-level await の動的 import** で読む。静的 import に
     すると 1 つが未着・壊れているだけで合成器ごと読み込めず、プレビューが
     丸ごと消える（app.js は import の失敗を記録して null を持つだけ）。
     await で待つので「最初の数フレームだけ効果が出ない」も起きない。
     context.js か shaders.js が無ければ **2d の互換品**に落ちる（この 2 つは
     GL の道の前提。あちらが無い時に自前の GLSL を持つのは二重実装になる）。
   CONTRACT-NOTE (2): 契約書 §4 は「transform 付き四角形で親 FBO へ blend」と
     書くが、shaders.js の `fsBlend` は uTex/uTexB を **同じ vUv で**読む
     （= 2 枚とも画面いっぱいで揃っている前提）。そこで
       ・fx が 0〜1 段: fsLayer に uModel（変形）を載せて 1 パスで置く
       ・fx が 2 段以上: 素材の向きのまま FBO へ描いて fx をピンポンし、
         最後に fsCopy + uModel で置く（効果が変形の前に掛かる = 契約の意図）
     の 2 本立てにした。どちらも「変形は最後」で見た目は同じ。
   CONTRACT-NOTE (3): クロップは **その場で切り落とす**（窓を動かさない）。
     shaders.js の `cropMask(uv, uCrop, res)` が「uv は素材全体・外は alpha 0」
     なので engine 側をそれに揃えた。ui/inspector/transform.js の整列/プリセット
     は「crop 後の窓が中央に残る」前提で計算しているので、そこだけ食い違う
     （あちらの CONTRACT-NOTE が「engine が違う約束なら整列の計算だけ直せば
     済む」と書いて在る通り。統合時に UI 側を寄せてもらう）。
   CONTRACT-NOTE (4): 遷移は eval.js の約束（A の尾で p 0→0.5、B の頭で
     p 0.5→1、重なりは無い）に合わせ、**その時刻に居ない相手**を
     canvas2d.js の `resolvePartner()` で引き直す（素材が続いていれば素材時刻を
     伸ばし、足りなければ端の絵で止める = NLE の作法）。
   CONTRACT-NOTE (5): 背景色の塗りだけは GLCtx に口が無いので生の
     `gl.clear` を使う（他はすべて GLCtx 経由）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clipsAt } from "../core/eval.js";
import { clamp, clamp01, finite, hexToRgba } from "../core/util.js";
import { scope } from "../core/log.js";
import {
  createCompositor2D, layerBox, coverBox, outSize, snapQuality, resolvePartner,
  transitionPair, textCanvasFor, shapeCanvasFor, makeCanvas, hasCurve, hasWheel
} from "./canvas2d.js";

const L = scope("engine");

/* ══ §A 隣の部品（CONTRACT-NOTE (1)）═════════════════════════════ */

/** 動的 import を「待つが永久には待たない」形で（繋がらない網で固まらせない） */
async function loadOpt(path, ms) {
  let timer = null;
  try {
    return await Promise.race([
      import(path),
      new Promise((res) => { timer = setTimeout(() => res(null), ms || 4000); })
    ]);
  } catch (_e) { return null; }
  finally { if (timer) clearTimeout(timer); }
}

const [GLCTX, SH, TRMOD, FXMOD] = await Promise.all([
  loadOpt("./gl/context.js"), loadOpt("./gl/shaders.js"),
  loadOpt("./transitions.js"), loadOpt("./fx/registry.js")
]);
if (!GLCTX || !SH) L.warn("gl/context.js か gl/shaders.js が読めません（2d で描きます）");

/** LUT は使う人が居て初めて読む（起動を重くしない） */
let LUTMOD = null, lutTried = false;
function wantLutModule() {
  if (lutTried) return;
  lutTried = true;
  loadOpt("./fx/luts.js").then((m) => { LUTMOD = m; }).catch(() => { /* 無し */ });
}

/** 名前の候補から表（オブジェクト）を 1 つ選ぶ */
function pickObj(ns, names) {
  if (!ns) return null;
  for (const n of names) {
    const v = ns[n];
    if (v && typeof v === "object") return v;
  }
  return null;
}
/** FX_REGISTRY / TRANSITIONS / LUTS の引き出し（無ければ null） */
function fxRegistry() { return pickObj(FXMOD, ["FX_REGISTRY", "REGISTRY", "FX", "default"]); }
function trRegistry() { return pickObj(TRMOD, ["TRANSITIONS", "REGISTRY", "default"]); }
function lutRegistry() { return pickObj(LUTMOD, ["LUTS", "LUT_REGISTRY", "REGISTRY", "default"]); }

/** 短い文字列ハッシュ（プログラムの鍵に使う。衝突しても組み直すだけ） */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ══ §B 自前の遷移（transitions.js が未着/不足でも動く分）═════════
   どれも `vec4 trApply(vec2 uv, float p)` 1 個だけ（共通規約）。
   uTex = 遷移元 A、uTexB = 遷移先 B。shaders.js の fsTransition に差し込む。 */

export const BUILTIN_TR = Object.freeze({
  crossfade: `vec4 trApply(vec2 uv, float p) { return mix(texture(uTex, uv), texture(uTexB, uv), p); }`,
  cut: `vec4 trApply(vec2 uv, float p) { return p < 0.5 ? texture(uTex, uv) : texture(uTexB, uv); }`,
  dipToBlack: `vec4 trApply(vec2 uv, float p) {
  float k = 1.0 - abs(p - 0.5) * 2.0;
  vec4 c = p < 0.5 ? texture(uTex, uv) : texture(uTexB, uv);
  return vec4(c.rgb * (1.0 - k), max(c.a, k));
}`,
  dipToWhite: `vec4 trApply(vec2 uv, float p) {
  float k = 1.0 - abs(p - 0.5) * 2.0;
  vec4 c = p < 0.5 ? texture(uTex, uv) : texture(uTexB, uv);
  return vec4(mix(c.rgb, vec3(1.0), k), max(c.a, k));
}`,
  slide: `vec4 trApply(vec2 uv, float p) {
  return (uv.x + p <= 1.0) ? texture(uTex, uv + vec2(p, 0.0))
                           : texture(uTexB, uv - vec2(1.0 - p, 0.0));
}`,
  slideUp: `vec4 trApply(vec2 uv, float p) {
  return (uv.y + p <= 1.0) ? texture(uTex, uv + vec2(0.0, p))
                           : texture(uTexB, uv - vec2(0.0, 1.0 - p));
}`,
  whipPan: `vec4 trApply(vec2 uv, float p) {
  float k = sin(clamp(p, 0.0, 1.0) * 3.14159265);
  vec4 s = vec4(0.0);
  for (int i = 0; i < 5; i++) {
    float t = (float(i) - 2.0) * 0.03 * k;
    vec2 u2 = vec2(uv.x + t, uv.y);
    s += (u2.x + p <= 1.0) ? texture(uTex, clamp(u2 + vec2(p, 0.0), 0.0, 1.0))
                           : texture(uTexB, clamp(u2 - vec2(1.0 - p, 0.0), 0.0, 1.0));
  }
  return s / 5.0;
}`,
  zoomIn: `vec4 trApply(vec2 uv, float p) {
  vec2 a = (uv - 0.5) / max(0.05, 1.0 - p * 0.6) + 0.5;
  vec2 b = (uv - 0.5) * (1.0 + (1.0 - p) * 0.8) + 0.5;
  return mix(texture(uTex, clamp(a, 0.0, 1.0)), texture(uTexB, clamp(b, 0.0, 1.0)),
             smoothstep(0.3, 0.7, p));
}`,
  wipe: `vec4 trApply(vec2 uv, float p) {
  float e = smoothstep(p - 0.06, p + 0.06, uv.x);
  return mix(texture(uTexB, uv), texture(uTex, uv), e);
}`,
  glitch: `vec4 trApply(vec2 uv, float p) {
  float k = sin(clamp(p, 0.0, 1.0) * 3.14159265);
  float n = hash12(vec2(floor(uv.y * 48.0), floor(uTime * 24.0)));
  vec2 o = vec2((n - 0.5) * 0.14 * k, 0.0);
  float m = smoothstep(0.3, 0.7, p);
  vec4 c = mix(texture(uTex, clamp(uv + o, 0.0, 1.0)), texture(uTexB, clamp(uv - o, 0.0, 1.0)), m);
  float r = mix(texture(uTex, clamp(uv + o * 1.8, 0.0, 1.0)).r,
                texture(uTexB, clamp(uv - o * 1.8, 0.0, 1.0)).r, m);
  c.r = mix(c.r, r, k * 0.8);
  return c;
}`
});

/** 遷移名 → 自前の実装（知らない名前は crossfade へ落として申告する） */
const TR_ALIAS = Object.freeze({
  crossfade: "crossfade", fade: "crossfade", dissolve: "crossfade", cut: "cut",
  dip: "dipToBlack", dipToBlack: "dipToBlack", fadeToBlack: "dipToBlack",
  dipToWhite: "dipToWhite", flash: "dipToWhite",
  slide: "slide", push: "slide", slideLeft: "slide", slideUp: "slideUp",
  whipPan: "whipPan", zoomIn: "zoomIn", zoom: "zoomIn", wipe: "wipe", glitch: "glitch"
});

/* ══ §C カラー / マスク / クロマの uniform（名前は shaders.js が決める）══ */

/** マスク種別 → shaders.js の番号（0:rect 1:ellipse 2:polygon 3:linear 4:radial） */
const MASK_TYPE_N = Object.freeze({ rect: 0, ellipse: 1, polygon: 2, linear: 3, radial: 4 });

const CURVE_SIZE = () => (SH && SH.CURVE_SIZE) || 16;
const HSL_BANDS = () => (SH && SH.HSL_BANDS) || 6;
const MASK_POINTS = () => (SH && SH.MASK_POINTS) || 16;

/** HSL の帯域が 1 つでも動いているか */
export function hasHsl(hsl) {
  if (!Array.isArray(hsl)) return false;
  for (const b of hsl) {
    if (!b) continue;
    if (Math.abs(finite(b.h, 0)) > 1e-3 || Math.abs(finite(b.s, 0)) > 1e-3 || Math.abs(finite(b.l, 0)) > 1e-3) return true;
  }
  return false;
}

/** 制御点 → 段数ぶんの 1 次元 LUT（shaders.js の curveLut16 が在ればそれを使う） */
function curveRamp(points) {
  if (SH && typeof SH.curveLut16 === "function") return SH.curveLut16(points);
  const n = CURVE_SIZE();
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = i / (n - 1);
  return out;
}
function vec3of(a) {
  const v = Array.isArray(a) ? a : [];
  return [finite(v[0], 0), finite(v[1], 0), finite(v[2], 0)];
}
function hslNums(hsl, key, def) {
  const n = HSL_BANDS();
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = Array.isArray(hsl) ? hsl[i] : null;
    out[i] = b ? finite(b[key], def) : def;
  }
  return out;
}
function hslShift(hsl) {
  const n = HSL_BANDS();
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const b = Array.isArray(hsl) ? hsl[i] : null;
    out[i * 3] = b ? finite(b.h, 0) : 0;
    out[i * 3 + 1] = b ? finite(b.s, 0) : 0;
    out[i * 3 + 2] = b ? finite(b.l, 0) : 0;
  }
  return out;
}

/**
 * ColorGrade を GRADE_UNIFORMS の表どおりに uniform へ詰める。
 * 表に無い物は触らない = shaders.js が uniform を増やしても自動で追従する。
 * @param {Object} u 詰め先 @param {Object|null} g ColorGrade
 * @param {Object|null} lut uploadLUT が返したテクスチャ（無ければ null）
 */
export function fillGrade(u, g, lut) {
  const tbl = (SH && Array.isArray(SH.GRADE_UNIFORMS)) ? SH.GRADE_UNIFORMS : [];
  for (const d of tbl) {
    const def = Array.isArray(d.def) ? d.def.slice() : d.def;
    if (d.name === "uLutSize") { u[d.name] = lut ? finite(lut.lutSize, def) : def; continue; }
    if (d.name === "uLutTiles") { u[d.name] = lut && lut.tiles ? lut.tiles : def; continue; }
    if (!g || !d.key) { u[d.name] = def; continue; }
    const k = d.key;
    if (k.indexOf("curves.") === 0) { u[d.name] = curveRamp(g.curves ? g.curves[k.slice(7)] : null); continue; }
    if (k.indexOf("wheels.") === 0) { u[d.name] = vec3of(g.wheels ? g.wheels[k.slice(7)] : null); continue; }
    if (k === "hsl[].hue") { u[d.name] = hslNums(g.hsl, "hue", 0); continue; }
    if (k === "hsl[].range") { u[d.name] = hslNums(g.hsl, "range", 30); continue; }
    if (k === "hsl[].h,s,l") { u[d.name] = hslShift(g.hsl); continue; }
    if (k === "lut.amount") { u[d.name] = lut ? clamp01(finite(g.lut && g.lut.amount, 1)) : 0; continue; }
    u[d.name] = finite(g[k], typeof def === "number" ? def : 0);
  }
  return u;
}

/** マスクの uniform（座標は **素材の uv**。rotate は度） */
export function fillMask(u, m) {
  const n = MASK_POINTS();
  const pts = Array.isArray(m.points) ? m.points : [];
  const flat = new Float32Array(n * 2);
  const count = Math.min(n, pts.length);
  for (let i = 0; i < count; i++) {
    const p = pts[i] || [];
    flat[i * 2] = clamp(finite(p[0], 0), -4, 5);
    flat[i * 2 + 1] = clamp(finite(p[1], 0), -4, 5);
  }
  u.uMaskType = MASK_TYPE_N[String(m.type || "rect")] || 0;
  u.uMaskRect = [clamp01(finite(m.x, 0.5)), clamp01(finite(m.y, 0.5)),
    clamp(finite(m.w, 0.5), 0.002, 4), clamp(finite(m.h, 0.5), 0.002, 4)];
  u.uMaskRotate = finite(m.rotateDeg, finite(m.rotate, 0) * 180 / Math.PI);
  u.uMaskFeather = clamp(finite(m.feather, 0), 0, 1);
  u.uMaskExpand = clamp(finite(m.expand, 0), -0.9, 4);
  u.uMaskInvert = m.invert ? 1 : 0;
  u.uMaskPoints = flat;
  u.uMaskCount = count;
  u.uMaskUseTex = 0;
  u.uMaskChannel = 0;
  return u;
}

/** クロマキーの uniform（key は 0..1。0..255 で来ても直す） */
export function fillChroma(u, c) {
  let k = c.key;
  if (typeof k === "string") k = hexToRgba(k) || [0, 1, 0];
  if (!Array.isArray(k)) k = [0, 1, 0];
  const d = k.some((v) => finite(v, 0) > 1.001) ? 255 : 1;
  u.uChromaKey = [clamp01(finite(k[0], 0) / d), clamp01(finite(k[1], 1) / d), clamp01(finite(k[2], 0) / d)];
  u.uChromaSim = clamp01(finite(c.similarity, 0.4));
  u.uChromaSmooth = clamp01(finite(c.smoothness, 0.1));
  u.uChromaSpill = clamp01(finite(c.spill, 0.2));
  return u;
}

/**
 * 単位四角 [0,1]^2 を「箱」（layerBox の結果）へ写す列優先 mat3。
 * 行き先は **描画先の 0..1 の座標系**（クリップ空間への写しは
 * `GLCtx.projection(target)` を左から掛ける = Y の向きはあちらが持つ）。
 * 純関数なので Node で試験できる。
 * @param {{w:number,h:number,cx:number,cy:number,px:number,py:number,rot:number}} box
 * @param {number} tw @param {number} th 描画先 px
 * @returns {Float32Array} 列優先 mat3
 */
export function layerModel(box, tw, th) {
  const c = Math.cos(finite(box.rot, 0)), s = Math.sin(finite(box.rot, 0));
  const w = finite(box.w, tw), h = finite(box.h, th);
  const cx = finite(box.cx, tw / 2), cy = finite(box.cy, th / 2);
  const ox = cx - w / 2, oy = cy - h / 2;
  const px = finite(box.px, cx), py = finite(box.py, cy);
  const W = Math.max(1, tw), H = Math.max(1, th);
  return new Float32Array([
    (w * c) / W, (w * s) / H, 0,
    (-h * s) / W, (h * c) / H, 0,
    (c * (ox - px) - s * (oy - py) + px) / W, (s * (ox - px) + c * (oy - py) + py) / H, 1
  ]);
}

/** 効果の任意 uniform（規約: uFx_<paramKey>） */
export function fillParams(u, params) {
  if (!params || typeof params !== "object") return u;
  for (const k in params) {
    const v = params[k];
    if (typeof v === "string") {
      const c = hexToRgba(v);
      if (c) { u["uFx_" + k] = [c[0], c[1], c[2]]; continue; }
      continue;                                  // 色でない文字列は渡せない
    }
    if (typeof v === "boolean") { u["uFx_" + k] = v ? 1 : 0; continue; }
    if (typeof v === "number" || Array.isArray(v)) u["uFx_" + k] = v;
  }
  return u;
}

/* ══ §D 合成器の本体 ═══════════════════════════════════════════════ */

/** 2d へ落ちた時に「出せなくなった物」として申告する名前 */
const MISSING_ON_2D = Object.freeze(["chroma", "fx", "mask.feather", "grade.curves", "grade.wheels", "grade.lut"]);
/** 調整レイヤー用の素の transform（画面いっぱい・変形なし） */
const IDENT_TRANSFORM = Object.freeze({
  x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateDeg: 0,
  anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false,
  crop: Object.freeze({ l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 })
});

const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

/**
 * 合成器を作る（契約書 §4）。WebGL2（か gl/*.js）が使えなければ
 * そのまま canvas2d.js の互換品を返す。
 * @param {HTMLCanvasElement} canvas
 * @param {{preferGL?:boolean}} [options]
 * @returns {Object} Compositor
 */
export function createCompositor(canvas, options) {
  if (!canvas) throw new Error("createCompositor: canvas が要ります");
  const o = options || {};
  const preferGL = o.preferGL !== false;
  let G = null;
  if (preferGL && GLCTX && SH && typeof GLCTX.createGL === "function") {
    try { G = GLCTX.createGL(canvas, { alpha: false, premultiplied: false, preserveDrawingBuffer: o.preserveDrawingBuffer === true }); }
    catch (e) { L.warn("createGL が例外を投げました", e); G = null; }
  }
  if (!G) {
    const why = !preferGL ? "preferGL:false"
      : (!GLCTX || !SH) ? "gl/context.js か gl/shaders.js が読めません" : "WebGL2 が使えません";
    L.warn("2d の合成器で描きます: " + why);
    return createCompositor2D(canvas, {
      reason: why, missing: MISSING_ON_2D.slice(),
      fxRegistry: fxRegistry, transitions: trRegistry
    });
  }

  /* ── 状態 ─────────────────────────────────────────────────────── */
  let fb2d = null;                    // 2d へ落ちた後の代役
  let lost = false, lostAt = 0, lostCount = 0, hardFails = 0;
  let scene = null;                   // 今のフレームの合成先（FBO）
  let emptyTex = null;                // 1x1 透明（遷移の片側が無い時）
  let texOf = new WeakMap();          // 素材の要素/枠 → { tex }
  const canvasRegs = new Map();       // 文字/図形の clipId → { key, cv }
  const luts = new Map();             // LUT の id → Tex|null
  const srcCache = new Map();         // GLSL の文字列（毎フレーム組み立てない）
  const missing = new Set(), warned = new Set(), warnings = [];
  const st = {
    ms: 0, avg: 0, frames: 0, layers: 0, passes: 0, q: 1,
    autoQ: 1, auto: true, slow: 0, fast: 0
  };

  function warnOnce(key, ...args) {
    if (warned.has(key)) return;
    warned.add(key);
    if (warnings.length < 60) warnings.push(key);
    L.warn(key, ...args);
  }

  /* ── プログラム（GLSL は shaders.js。ここは鍵と例外の面倒だけ）── */
  function glsl(key, make) {
    let s = srcCache.get(key);
    if (s === undefined) {
      try { s = make(); } catch (e) { warnOnce("glsl:" + key, e); s = null; }
      srcCache.set(key, s);
    }
    return s;
  }
  function prog(key, make) {
    const fs = glsl(key, make);
    if (!fs) return null;
    try {
      const p = G.program(key, SH.VS_QUAD, fs);
      if (!p) { missing.add("program:" + key); return null; }
      return p;
    } catch (e) {
      warnOnce("prog:" + key, e);
      missing.add("program:" + key);
      return null;
    }
  }
  const pCopy = () => prog("copy", () => SH.fsCopy());

  /* ── 効果 / 遷移の GLSL を取る ────────────────────────────────── */
  function fxSource(f) {
    const type = String((f && f.type) || "");
    if (!type) return null;
    const reg = fxRegistry();
    const e = reg ? reg[type] : null;
    if (!e) {
      missing.add("fx." + type);
      warnOnce("fx:" + type, "効果 " + type + " が FX_REGISTRY に在りません");
      return null;
    }
    let g = e.glsl || e.frag || e.fs || e.shader || e.code || e.fxApply || e.gl || e.webgl;
    if (typeof g === "function") {
      try { g = g((f && f.params) || {}, { type }); }
      catch (err) { warnOnce("fxglsl:" + type, err); g = null; }
    }
    if (typeof g !== "string" || g.trim().length < 4) {
      missing.add("fx." + type);
      warnOnce("fxglsl2:" + type, "効果 " + type + " が GLSL（fxApply）を出していません");
      return null;
    }
    return { src: g, key: type + "#" + hash(g) };
  }
  function trSource(type) {
    const t = String(type || "crossfade");
    const reg = trRegistry();
    const e = reg ? reg[t] : null;
    let g = e && (e.glsl || e.frag || e.fs || e.shader || e.code || e.trApply || e.gl);
    if (typeof g === "function") {
      try { g = g((e && e.params) || {}, { type: t }); }
      catch (err) { warnOnce("trglsl:" + t, err); g = null; }
    }
    if (typeof g === "string" && g.trim().length > 4) return { src: g, key: t + "#" + hash(g) };
    const name = TR_ALIAS[t];
    if (!name) {
      missing.add("transition." + t);
      warnOnce("tr:" + t, "遷移 " + t + " が無いので crossfade で代えます");
    }
    return { src: BUILTIN_TR[name || "crossfade"], key: "builtin:" + (name || "crossfade") };
  }

  /* ── LUT（engine/fx/luts.js の .cube を GLCtx に上げる）─────── */
  function lutTexFor(lut) {
    if (!lut || !lut.id) return null;
    const id = String(lut.id);
    if (luts.has(id)) return luts.get(id);
    wantLutModule();
    const reg = lutRegistry();
    const e = reg ? reg[id] : null;
    let data = e && (e.cube || e.data || e.lut || null);
    if (!data && e && typeof e.get === "function") { try { data = e.get(); } catch (_x) { data = null; } }
    if (!data) {
      missing.add("grade.lut");
      warnOnce("lut:" + id, "LUT " + id + " の中身が取れません（素通しにします）");
      luts.set(id, null);
      return null;
    }
    let tex = null;
    try { tex = G.uploadLUT(data); }
    catch (err) { warnOnce("lutup:" + id, err); missing.add("grade.lut"); }
    luts.set(id, tex || null);
    return tex || null;
  }

  /* ── 素材 ─────────────────────────────────────────────────────── */
  /** 1x1 透明（遷移の相手が居ないとき。何も bind しないと黒になる） */
  function transparentTex() {
    if (emptyTex) return emptyTex;
    try {
      if (typeof ImageData !== "undefined") {
        emptyTex = G.uploadSource(null, new ImageData(1, 1), { flipY: false });
      }
    } catch (e) { warnOnce("emptyTex", e); }
    return emptyTex;
  }

  /** 要素（または枠）に紐づくテクスチャへ上げる。静止画は 1 度だけ */
  function uploadFor(key, el, always) {
    const rec = texOf.get(key) || null;
    if (rec && rec.tex && !always && finite(rec.tex.sourceWidth, 0) > 0) return rec.tex;
    const t = G.uploadSource(rec ? rec.tex : null, el, { flipY: false });
    if (!t) { texOf.delete(key); return null; }
    texOf.set(key, { tex: t });
    if (!(finite(t.sourceWidth, 0) > 0)) return null;     // まだ 1 枚も来ていない
    return t;
  }

  /** 文字/図形の canvas は clip ごとに 1 枚使い回す（テクスチャも 1 枚で済む） */
  function canvasFor(id, key, make) {
    let e = canvasRegs.get(id);
    if (e && e.key === key && e.cv) return e;
    let cv = null;
    try { cv = make(); } catch (err) { warnOnce("render:" + id, err); return null; }
    if (!cv || !cv.width) return null;
    if (!e) {
      if (canvasRegs.size >= 24) {
        const k0 = canvasRegs.keys().next().value;
        const old = canvasRegs.get(k0);
        if (old) {
          const r0 = texOf.get(old);
          if (r0 && r0.tex) { try { G.destroyTexture(r0.tex); } catch (_x) { /* noop */ } }
          texOf.delete(old);
        }
        canvasRegs.delete(k0);
      }
      e = { key: "", cv: null };
      canvasRegs.set(id, e);
    }
    e.key = key;
    e.cv = cv;
    return e;
  }

  /**
   * 層 1 枚のテクスチャを取る（text/shape は canvas 経由。契約書 §4-5）。
   * @returns {{tex:Object, sw:number, sh:number}|null}
   */
  function sourceOf(r, op, w, h, fps, project) {
    const kind = r.kind;
    const id = (r.clip && r.clip.id) || "?";
    if (kind === "text" || kind === "shape") {
      const key = kind === "text"
        ? "t|" + w + "x" + h + "|" + finite(r.localTime, 0).toFixed(4) + "|" +
          (r.text ? r.text.content : "") + "|" + JSON.stringify((r.text && r.text.style) || {})
        : "s|" + w + "x" + h + "|" + JSON.stringify(r.shape || {});
      const e = canvasFor(id, key, () => {
        const cv = kind === "text" ? textCanvasFor(r, w, h, fps, project) : shapeCanvasFor(r, w, h);
        if (!cv && kind === "text") { missing.add("text"); warnOnce("text", "engine/text.js が使えません"); }
        return cv;
      });
      if (!e) return null;
      const tex = uploadFor(e, e.cv, true);
      return tex ? { tex, sw: e.cv.width, sh: e.cv.height } : null;
    }
    const sp = op.sources;
    if (!sp || typeof sp.acquire !== "function") {
      warnOnce("sources", "SourcePool が渡されていません（素材を出せません）");
      return null;
    }
    let s = null;
    try { s = sp.acquire(r, { mode: op.mode || "play" }); }
    catch (e) { warnOnce("acquire:" + kind, e); return null; }
    if (!s || s.kind === "empty" || !s.el) {
      if (kind === "compound") missing.add("compound");
      return null;
    }
    const tex = uploadFor(s.el, s.el, s.kind !== "image");
    if (!tex) return null;
    const sw = finite(s.width, 0) || finite(tex.sourceWidth, 0) || tex.width;
    const sh = finite(s.height, 0) || finite(tex.sourceHeight, 0) || tex.height;
    return { tex, sw, sh };
  }

  /* ── 変形 → uModel ───────────────────────────────────────────── */
  /** 箱 → uModel（描画先の投影 = Y の向きを左から掛ける） */
  function modelFor(box, tw, th, target) {
    return G.mat3Mul(G.projection(target), layerModel(box, tw, th));
  }

  /** polygon の点が足りないマスクは無いものとして扱う（shaders 側で暴れる） */
  function maskUsable(m) {
    if (!m) return false;
    if (String(m.type) === "polygon") {
      const n = Array.isArray(m.points) ? m.points.length : 0;
      if (n < 3) { missing.add("mask.polygon(点が足りません)"); return false; }
    }
    return true;
  }

  /**
   * 層 1 枚を描画先へ置く（fx 0〜1 段は 1 パス、2 段以上はピンポン）。
   * @returns {boolean} 描けたか
   */
  function placeLayer(r, src0, target, w, h, time, op, blendMode, opacity, clearFirst) {
    const box = layerBox(r, w, h, src0.sw, src0.sh);
    const fxs = Array.isArray(r.fx) ? r.fx : [];
    let first = fxs.length ? fxSource(fxs[0]) : null;
    const rest = [];
    for (let i = 1; i < fxs.length; i++) {
      const s2 = fxSource(fxs[i]);
      if (s2) rest.push([s2, fxs[i]]);
    }
    const g = r.color || null;
    const lut = g && g.lut ? lutTexFor(g.lut) : null;
    const flags = {
      grade: !!g,
      curves: !!(g && hasCurve(g.curves)),
      wheels: !!(g && hasWheel(g.wheels)),
      hsl: !!(g && hasHsl(g.hsl)),
      lut: !!lut,
      chroma: !!r.chroma,
      mask: maskUsable(r.mask),
      fx: first ? first.src : null
    };
    const keyOf = () => "layer|" + (flags.grade ? "g" : "") + (flags.curves ? "c" : "") +
      (flags.wheels ? "w" : "") + (flags.hsl ? "h" : "") + (flags.lut ? "l" : "") +
      (flags.chroma ? "k" : "") + (flags.mask ? "m" : "") + "|" + (first ? first.key : "-");
    let p = prog(keyOf(), () => SH.fsLayer(flags));
    if (!p && first) {
      /* 効果の GLSL が組めないなら **その効果だけ**諦める（層ごと消さない） */
      missing.add("fx." + String(fxs[0].type));
      warnOnce("fxbuild:" + fxs[0].type, "効果 " + fxs[0].type + " の GLSL が組めないので この効果を外します");
      flags.fx = null;
      first = null;
      p = prog(keyOf(), () => SH.fsLayer(flags));
    }
    if (!p) return false;
    const u = {
      uCrop: [box.crop.l, box.crop.t, box.crop.r, box.crop.b],
      uTexRes: [finite(src0.tex.width, 2), finite(src0.tex.height, 2)],
      uTime: finite(time, 0),
      uOpacity: clamp01(finite(opacity, 1))
    };
    if (flags.grade || flags.curves || flags.wheels || flags.hsl || flags.lut) fillGrade(u, g, lut);
    if (flags.mask) fillMask(u, r.mask);
    if (flags.chroma) fillChroma(u, r.chroma);
    if (first) fillParams(u, fxs[0].params);
    const texes = [src0.tex, null, lut, null];
    const flip = [box.flipH ? 1 : 0, box.flipV ? 1 : 0];

    if (!rest.length) {
      u.uModel = modelFor(box, w, h, target);
      u.uFlip = flip;
      G.drawQuad(p, {
        target, blend: blendMode, clear: clearFirst ? [0, 0, 0, 0] : null,
        textures: texes, uniforms: u
      });
      st.passes++;
      return true;
    }
    /* fx が 2 段以上: 素材の向きのまま掛けてから置く（CONTRACT-NOTE (2)） */
    const cap = G.limits.maxTextureSize;
    const lw = Math.max(2, Math.min(cap, Math.round(box.w)));
    const lh = Math.max(2, Math.min(cap, Math.round(box.h)));
    const pp = G.pingpong(lw, lh);
    if (!pp) return false;
    G.drawQuad(p, { target: pp.write(), blend: "none", clear: [0, 0, 0, 0], textures: texes, uniforms: u });
    pp.swap();
    st.passes++;
    for (const [s2, f2] of rest) {
      const pe = prog("fx|" + s2.key, () => SH.fsEffect(s2.src));
      if (!pe) continue;
      const u2 = { uTexRes: [lw, lh], uTime: finite(time, 0), uOpacity: 1 };
      fillParams(u2, f2.params);
      G.drawQuad(pe, {
        target: pp.write(), blend: "none", clear: [0, 0, 0, 0],
        textures: [pp.read().tex, null, null, null], uniforms: u2
      });
      pp.swap();
      st.passes++;
    }
    const pc = pCopy();
    let ok = false;
    if (pc) {
      G.drawQuad(pc, {
        target, blend: blendMode, clear: clearFirst ? [0, 0, 0, 0] : null,
        textures: [pp.read().tex, null, null, null],
        uniforms: { uOpacity: 1, uTexRes: [lw, lh], uModel: modelFor(box, w, h, target), uFlip: flip }
      });
      st.passes++;
      ok = true;
    }
    pp.release();
    return ok;
  }

  /** 層 1 枚を「画面いっぱいの 1 枚」にする（遷移と複雑な blend 用） */
  function layerToFull(r, src0, w, h, time, op, opacity) {
    const f = G.fbo(w, h);
    if (!f) return null;
    if (!placeLayer(r, src0, f, w, h, time, op, "none", opacity, true)) { G.releaseFbo(f); return null; }
    return f;
  }

  /** FBO の絵を今の scene へ重ねる（固定機能で足りなければ fsBlend で 2 パス） */
  function blendOnto(f, mode, opacity) {
    const m = String(mode || "normal");
    const opa = clamp01(opacity === undefined ? 1 : opacity);
    if (m === "normal" || m === "add") {
      const pc = pCopy();
      if (!pc) return;
      G.drawQuad(pc, {
        target: scene, blend: m === "add" ? "add" : "normal",
        textures: [f.tex, null, null, null],
        uniforms: { uOpacity: opa, uTexRes: [f.width, f.height] }
      });
      st.passes++;
      return;
    }
    const pb = prog("blend|" + m, () => SH.fsBlend(m));
    const next = pb ? G.fbo(scene.width, scene.height) : null;
    if (!pb || !next) {
      missing.add("blend." + m);
      if (next) G.releaseFbo(next);
      blendOnto(f, "normal", opa);
      return;
    }
    G.drawQuad(pb, {
      target: next, blend: "none", clear: [0, 0, 0, 0],
      textures: [scene.tex, f.tex, null, null],
      uniforms: { uOpacity: opa, uTexRes: [scene.width, scene.height] }
    });
    st.passes++;
    G.releaseFbo(scene);
    scene = next;
  }

  /** 遷移（A と B を別々に描いて fsTransition で混ぜる。契約書 §4-4） */
  function drawTransition(r, src0, project, time, w, h, op, fps) {
    const tr = r.transition;
    const partner = tr.otherClipId ? resolvePartner(project, r, time, fps) : null;
    if (tr.otherClipId && !partner) warnOnce("tr.partner:" + tr.otherClipId, "遷移の相手が見つかりません");
    const pair = transitionPair(r, partner);
    let fa = null, fb = null;
    if (pair.a) {
      const sa = pair.a === r ? src0 : sourceOf(pair.a, op, w, h, fps, project);
      if (sa) fa = layerToFull(pair.a, sa, w, h, time, op, finite(pair.a.opacity, 1));
    }
    if (pair.b) {
      const sb = pair.b === r ? src0 : sourceOf(pair.b, op, w, h, fps, project);
      if (sb) fb = layerToFull(pair.b, sb, w, h, time, op, finite(pair.b.opacity, 1));
    }
    const ts = trSource(tr.type);
    const pt = prog("tr|" + ts.key, () => SH.fsTransition(ts.src));
    const out = pt ? G.fbo(w, h) : null;
    if (!out) {
      /* 遷移が組めないときは 進捗で切り替える（真っ黒より切り替えの方が良い） */
      const use = clamp01(finite(pair.p, 0)) < 0.5 ? fa : fb;
      if (use) blendOnto(use, r.blend, 1);
      if (fa) G.releaseFbo(fa);
      if (fb) G.releaseFbo(fb);
      return;
    }
    const empty = transparentTex();
    const u = { uP: clamp01(finite(pair.p, 0)), uOpacity: 1, uTime: finite(time, 0), uTexRes: [w, h] };
    fillParams(u, tr.params);
    G.drawQuad(pt, {
      target: out, blend: "none", clear: [0, 0, 0, 0],
      textures: [fa ? fa.tex : empty, fb ? fb.tex : empty, null, null], uniforms: u
    });
    st.passes++;
    blendOnto(out, r.blend, 1);
    if (fa) G.releaseFbo(fa);
    if (fb) G.releaseFbo(fb);
    G.releaseFbo(out);
  }

  /** 調整レイヤー（そこまでの合成結果に効果を掛けて上から重ねる） */
  function drawAdjust(r, w, h, time, op) {
    const rr = Object.assign({}, r, { transform: IDENT_TRANSFORM });
    const f = G.fbo(w, h);
    if (!f) return;
    const src0 = { tex: scene.tex, sw: w, sh: h };
    if (!placeLayer(rr, src0, f, w, h, time, op, "none", finite(r.opacity, 1), true)) {
      G.releaseFbo(f);
      return;
    }
    blendOnto(f, r.blend, 1);
    G.releaseFbo(f);
  }

  /** 層 1 枚（遷移・通常・複雑な blend を振り分ける） */
  function drawOne(r, project, w, h, time, op, fps) {
    const src0 = sourceOf(r, op, w, h, fps, project);
    if (!src0) return;
    st.layers++;
    if (r.transition) { drawTransition(r, src0, project, time, w, h, op, fps); return; }
    const mode = String(r.blend || "normal");
    if (mode === "normal" || mode === "add") {
      placeLayer(r, src0, scene, w, h, time, op, mode, finite(r.opacity, 1), false);
      return;
    }
    const f = layerToFull(r, src0, w, h, time, op, finite(r.opacity, 1));
    if (!f) return;
    blendOnto(f, mode, 1);
    G.releaseFbo(f);
  }

  /** 背景（色 / 画像 / ぼかし。契約書 §4-1） */
  function background(project, list, w, h, time, op, fps) {
    const s = (project && project.settings) || {};
    const bg = s.background || {};
    const type = String(bg.type || "color");
    const col = hexToRgba(typeof bg.color === "string" ? bg.color : "#000000") || [0, 0, 0, 1];
    /* 塗りつぶしは GLCtx に口が無いので ここだけ生の gl（CONTRACT-NOTE (5)） */
    const gl = G.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
    gl.viewport(0, 0, scene.width, scene.height);
    gl.clearColor(col[0], col[1], col[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (type === "color") return;

    let src0 = null;
    if (type === "image" && bg.assetId) {
      const sp = op.sources;
      if (sp && typeof sp.acquire === "function") {
        try {
          const fake = {
            kind: "image", clip: { id: "__bg", kind: "image", assetId: bg.assetId },
            assetId: bg.assetId, sourceTime: 0, localTime: 0, duration: 0, visible: true,
            transform: IDENT_TRANSFORM, opacity: 1, blend: "normal", fx: []
          };
          const got = sp.acquire(fake, { mode: op.mode || "play" });
          if (got && got.el) {
            const tex = uploadFor(got.el, got.el, false);
            if (tex) {
              src0 = {
                tex,
                sw: finite(got.width, 0) || finite(tex.sourceWidth, 0) || tex.width,
                sh: finite(got.height, 0) || finite(tex.sourceHeight, 0) || tex.height
              };
            }
          }
        } catch (e) { warnOnce("bg.image", e); }
      }
      if (!src0) { missing.add("background.image"); return; }
    } else if (type === "blur") {
      let base = null;
      for (const x of list) if (x && x.visible && x.kind !== "adjust") { base = x; break; }
      if (!base) return;
      src0 = sourceOf(base, op, w, h, fps, project);
      if (!src0) return;
    } else {
      return;
    }
    const pc = pCopy();
    if (!pc) return;
    const cover = (tw, th) => {
      const cb = coverBox(tw, th, src0.sw, src0.sh);
      return modelFor({
        w: cb.w, h: cb.h, cx: cb.cx, cy: cb.cy, px: cb.cx, py: cb.cy, rot: 0
      }, tw, th, scene);
    };
    if (type === "image") {
      G.drawQuad(pc, {
        target: scene, blend: "normal", textures: [src0.tex, null, null, null],
        uniforms: { uOpacity: 1, uTexRes: [src0.tex.width, src0.tex.height], uModel: cover(w, h) }
      });
      st.passes++;
      return;
    }
    /* ぼかし: 1/4 に落として 分離ガウスを 2 回 */
    const bw = Math.max(8, Math.round(w / 4)), bh = Math.max(8, Math.round(h / 4));
    const pp = G.pingpong(bw, bh);
    if (!pp) return;
    const cb = coverBox(bw, bh, src0.sw, src0.sh);
    G.drawQuad(pc, {
      target: pp.write(), blend: "none", clear: [0, 0, 0, 1],
      textures: [src0.tex, null, null, null],
      uniforms: {
        uOpacity: 1, uTexRes: [src0.tex.width, src0.tex.height],
        uModel: modelFor({ w: cb.w, h: cb.h, cx: cb.cx, cy: cb.cy, px: cb.cx, py: cb.cy, rot: 0 }, bw, bh, pp.write())
      }
    });
    pp.swap();
    st.passes++;
    /* 分離ガウスは 5 タップなので、半径を欲張ると縞が出る。
       小さめの半径で h→v を 2 巡させる方が同じ費用で滑らかになる。 */
    const rpx = clamp(finite(bg.blur, 40), 0, 100) / 100 * Math.min(bw, bh) * 0.09;
    for (const dir of ["h", "v", "h", "v"]) {
      const pg = prog("gauss|" + dir, () => SH.fsGauss(dir));
      if (!pg) break;
      G.drawQuad(pg, {
        target: pp.write(), blend: "none", textures: [pp.read().tex, null, null, null],
        uniforms: { uTexRes: [bw, bh], uRadius: Math.max(0.5, rpx), uOpacity: 1 }
      });
      pp.swap();
      st.passes++;
    }
    G.drawQuad(pc, {
      target: scene, blend: "none", textures: [pp.read().tex, null, null, null],
      uniforms: { uOpacity: 1, uTexRes: [bw, bh] }
    });
    st.passes++;
    pp.release();
  }

  /* ── 画質の自動追従（契約書 §4）──────────────────────────────── */
  function pickQuality(project, op) {
    const s = (project && project.settings) || {};
    if (op.quality !== undefined && op.quality !== null) { st.auto = false; return snapQuality(op.quality, 1); }
    st.auto = true;
    const pq = String(s.previewQuality || "auto");
    if (pq !== "auto") return snapQuality(pq, 1);
    return st.autoQ;
  }
  function autoTune(fps, forExport) {
    if (!st.auto || forExport) return;
    const budget = 1000 / Math.max(1, fps);
    if (st.avg > budget * 1.5) {
      st.fast = 0;
      if (++st.slow > 6) { st.autoQ = st.autoQ > 0.5 ? 0.5 : 0.25; st.slow = 0; }
    } else if (st.avg < budget * 0.45) {
      st.slow = 0;
      if (++st.fast > 45) { st.autoQ = st.autoQ < 0.5 ? 0.5 : 1; st.fast = 0; }
    } else { st.slow = 0; st.fast = 0; }
  }

  /* ── 文脈の喪失 → 2d へ ─────────────────────────────────────── */
  function dropCaches() {
    texOf = new WeakMap();
    canvasRegs.clear();
    luts.clear();
    emptyTex = null;
    scene = null;
  }
  const offLost = G.onLost(() => {
    lost = true; lostCount++; lostAt = nowMs();
    dropCaches();
    missing.add("webgl(文脈喪失)");
    warnOnce("webgl.lost", "WebGL の文脈を失いました（" + lostCount + " 回目）");
    if (lostCount >= 3) degrade("WebGL の文脈を 3 回失いました");
  });
  const offRestored = G.onRestored(() => {
    if (fb2d) return;
    lost = false; lostAt = 0;
    dropCaches();
    missing.delete("webgl(文脈喪失)");
    L.log("WebGL の文脈が戻りました");
  });

  /**
   * 2d の互換品へ移る。canvas 1 枚に文脈は 1 種類しか作れないので、
   * DOM に居るなら **同じ属性の canvas を差し替える**（居なければ内部の 1 枚）。
   * 差し替えると 呼ぶ側が持っている参照は古くなるので `compositor.canvas` を見る事。
   */
  function degrade(reason) {
    if (fb2d) return fb2d;
    let target = null;
    try {
      if (canvas.parentNode && typeof document !== "undefined" && document.createElement) {
        const repl = document.createElement("canvas");
        repl.width = Math.max(2, canvas.width || 2);
        repl.height = Math.max(2, canvas.height || 2);
        if (canvas.id) repl.id = canvas.id;
        if (canvas.className) repl.className = canvas.className;
        for (const a of ["style", "data-test", "aria-label", "role", "width", "height"]) {
          try {
            if (canvas.getAttribute && canvas.getAttribute(a) !== null) repl.setAttribute(a, canvas.getAttribute(a));
          } catch (_e) { /* noop */ }
        }
        canvas.parentNode.insertBefore(repl, canvas);
        canvas.parentNode.removeChild(canvas);
        target = repl;
      }
    } catch (e) { L.warn("canvas を差し替えられませんでした", e); target = null; }
    if (!target) {
      try { target = makeCanvas(Math.max(2, canvas.width || 2), Math.max(2, canvas.height || 2)); }
      catch (e) { L.error("2d へも移れません", e); return null; }
      missing.add("blit(canvas 差し替え不可)");
    }
    try {
      fb2d = createCompositor2D(target, {
        reason: "webgl → 2d: " + reason,
        missing: MISSING_ON_2D.concat(Array.from(missing)),
        fxRegistry: fxRegistry, transitions: trRegistry
      });
    } catch (e) { L.error("2d の合成器も作れません", e); return null; }
    L.warn("2d の合成器へ移りました: " + reason);
    try { G.dispose(); } catch (_e) { /* noop */ }
    return fb2d;
  }

  /* ══ §E 契約の形（Compositor）══════════════════════════════════ */
  const api = {
    get backend() { return fb2d ? fb2d.backend : "webgl2"; },
    /** 差し替えが起きても実物を辿れるように */
    get canvas() { return fb2d ? fb2d.canvas : canvas; },
    get gl() { return fb2d ? null : G.gl; },

    resize(w, h) {
      if (fb2d) return fb2d.resize(w, h);
      G.resize(Math.max(2, Math.round(finite(w, 0) || 2)), Math.max(2, Math.round(finite(h, 0) || 2)));
      return undefined;
    },

    /**
     * 1 フレーム合成する（契約書 §4）。同じ time で 2 回呼ばれたら 2 回描く。
     * @param {Object} project @param {number} time 秒
     * @param {{sources?:Object, quality?:number|string, overlays?:boolean,
     *          forExport?:boolean, mode?:string}} [options]
     * @returns {Promise<void>|void} forExport のときだけ await が要る
     */
    renderFrame(project, time, options) {
      if (fb2d) return fb2d.renderFrame(project, time, options);
      const op = options || {};
      const t0 = nowMs();
      if (lost || G.lost) {
        if (lostAt && nowMs() - lostAt > 2500) {
          const f = degrade("WebGL の文脈が戻りませんでした");
          if (f) return f.renderFrame(project, time, options);
        }
        return op.forExport ? Promise.resolve() : undefined;
      }
      const s = (project && project.settings) || {};
      const fps = Math.max(1, finite(s.fps, 30));
      if (!(canvas.width > 1) || !(canvas.height > 1)) {
        api.resize(finite(s.width, 1920), finite(s.height, 1080));
      }
      const sz = outSize(project, canvas.width, canvas.height, pickQuality(project, op));
      st.q = sz.q;
      st.layers = 0;
      let list = [];
      try { list = clipsAt(project, time, { fps }) || []; }
      catch (e) { warnOnce("clipsAt", e); list = []; }
      try {
        scene = G.fbo(sz.w, sz.h);
        if (!scene) throw new Error("合成先の FBO を作れません（" + sz.w + "x" + sz.h + "）");
        try { background(project, list, sz.w, sz.h, time, op, fps); }
        catch (e) { warnOnce("background", e); }
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (!r || !r.visible) continue;
          try {
            if (r.kind === "adjust") { st.layers++; drawAdjust(r, sz.w, sz.h, time, op); continue; }
            drawOne(r, project, sz.w, sz.h, time, op, fps);
          } catch (e) {
            /* 層 1 枚の失敗で真っ黒にしない（契約書 §4） */
            warnOnce("layer:" + ((r.clip && r.clip.id) || i), e);
          }
        }
        /* canvas へ（Y の反転は projection(null) が持っている） */
        G.blit(scene.tex, null, { blend: "none", clear: [0, 0, 0, 1] });
        st.passes++;
        hardFails = 0;
      } catch (e) {
        L.error("1 フレーム描けませんでした", e);
        warnOnce("frame", e);
        if (++hardFails >= 2) {
          const f = degrade("WebGL で描けません: " + (e && e.message ? e.message : e));
          if (f) return f.renderFrame(project, time, options);
        }
      } finally {
        if (scene) { G.releaseFbo(scene); scene = null; }
      }
      st.ms = nowMs() - t0;
      st.avg = st.frames ? st.avg * 0.85 + st.ms * 0.15 : st.ms;
      st.frames++;
      autoTune(fps, !!op.forExport);
      if (op.forExport) {
        try { G.gl.finish(); } catch (_e) { /* noop */ }
        return Promise.resolve();
      }
      return undefined;
    },

    /** 今の canvas を ImageData で（静止画書き出し。GL は下から並ぶので直す） */
    grabPixels() {
      if (fb2d) return fb2d.grabPixels();
      const gl = G.gl;
      const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
      const px = new Uint8ClampedArray(w * h * 4);
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer));
      } catch (e) {
        throw new Error("画素を読み出せません: " + (e && e.message ? e.message : e));
      }
      const row = w * 4;
      const tmp = new Uint8ClampedArray(row);
      for (let y = 0; y < (h >> 1); y++) {
        const a = y * row, b = (h - 1 - y) * row;
        tmp.set(px.subarray(a, a + row));
        px.set(px.subarray(b, b + row), a);
        px.set(tmp, b);
      }
      if (typeof ImageData === "undefined") return { data: px, width: w, height: h };
      return new ImageData(px, w, h);
    },

    stats() {
      if (fb2d) {
        const s2 = fb2d.stats();
        s2.missing = Array.from(new Set(s2.missing.concat(Array.from(missing)))).sort();
        s2.warnings = s2.warnings.concat(warnings);
        return s2;
      }
      const gs = G.stats ? G.stats() : {};
      return {
        backend: "webgl2",
        ms: Math.round(st.ms * 100) / 100,
        avgMs: Math.round(st.avg * 100) / 100,
        frames: st.frames, layers: st.layers,
        /* draws は 2d の互換品と同じ名前（どちらを見ても同じ物が読める） */
        draws: st.passes, passes: st.passes,
        quality: st.q, autoQuality: st.auto ? st.autoQ : null,
        width: canvas.width, height: canvas.height,
        programs: finite(gs.programs, 0), fbos: finite(gs.fbos, 0),
        gl: gs, maxTexture: G.limits ? G.limits.maxTextureSize : 0,
        lost, lostCount,
        siblings: {
          context: !!GLCTX, shaders: !!SH, transitions: !!TRMOD, fx: !!FXMOD, luts: !!LUTMOD
        },
        missing: Array.from(missing).sort(),
        warnings: warnings.slice()
      };
    },

    dispose() {
      try { if (offLost) offLost(); } catch (_e) { /* noop */ }
      try { if (offRestored) offRestored(); } catch (_e) { /* noop */ }
      if (fb2d) { try { fb2d.dispose(); } catch (_e) { /* noop */ } fb2d = null; return; }
      dropCaches();
      srcCache.clear();
      try { G.dispose(); } catch (e) { L.warn("片付けで失敗", e); }
    }
  };

  L.log("compositor: webgl2 で起きました（最大テクスチャ " +
    (G.limits ? G.limits.maxTextureSize : "?") + "）");
  return api;
}

export default createCompositor;
