/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/compositor.js — 1 フレームを合成する心臓部（契約書 §4）

   ★ 何をする所か
     `createCompositor(canvas, { preferGL })` が Compositor を返す。
     `renderFrame(project, time, { sources, quality, forExport })` を呼ぶと
     その時刻の絵が canvas に出る。**プレビューと書き出しは同じこの道**を通る
     （別実装を持たせない。持たせると必ず食い違う）。
     段取りは契約書 §4 のとおり:
       1. 出力解像度 = settings.width/height × quality。背景（色/ぼかし/画像）
       2. eval.clipsAt を **下から上**へ。adjust トラックはそこまでの合成結果に効果
       3. 各層: sources.acquire → fsLayer（crop→mask→chroma→grade→fx 1 段目）
          → 残りの fx は fsEffect で FBO ピンポン → transform 付き四角形で親へ blend
       4. 遷移中は A と B をそれぞれ層として FBO に描き、fsTransition で混ぜる
       5. text/shape は engine/text.js の canvas をテクスチャにして同じ道
       6. 最後に canvas へ blit（forExport なら readPixels できる状態で await 可能）

   ★ なぜこの形か
     ・**全部 FBO の中で組み立ててから 最後に 1 回だけ canvas へ移す**。
       adjust トラック（下の合成結果に効果）と 遷移（2 枚を混ぜる）は
       「描いた物をもう 1 度読む」必要が在り、canvas に直接描くと出来ない。
     ・FBO の中身は **事前乗算（premultiplied alpha）**で持つ。半透明の層を
       重ねる時に色が濁らない唯一の作法。fx / 遷移に渡す時は直値へ戻す
       （fxApply を書く人が素直に書けるように）。
     ・複雑な blend（overlay / softlight / difference / lighten / darken）は
       GL の固定機能では出せないので、**親の写しを 1 枚取ってシェーダで混ぜる**。
       add / screen / multiply / normal は blendFunc で足りるので写しを取らない。
     ・層は「画面に出る大きさ」の FBO に一度描いてから transform 付きで親へ置く。
       効果が素材の向きで掛かる（契約どおり）し、拡大時も粗くならない。
     ・**失敗しても真っ黒にしない**。層 1 枚の例外はその層を飛ばして warnOnce。
       WebGL が無い / 文脈を失った時は canvas2d.js の互換品へ自動で移る
       （backend が "2d" に変わり、落ちた機能名が stats().missing に並ぶ）。
     ・同じ time で 2 回呼ばれたら 2 回描く（キャッシュしない = 契約）。ただし
       FBO・プログラム・テクスチャの器は使い回す（毎フレーム作ると必ず落ちる）。

   ★ 共通規約（A7/A8/A14/A15 と一致させる約束。ここでも守る）
     ・WebGL2 / GLSL ES 3.00。各ソースの 1 行目が "#version 300 es"。
     ・頂点シェーダは共通 1 本（shaders.js の VS_QUAD）。aPos は **0..1 の単位
       四角形**、`vUv = mix(aPos, 1-aPos, uFlip)`、
       `gl_Position = vec4((uModel*vec3(aPos,1))).xy, 0, 1)`。
     ・テクスチャ単位: 0=uTex(主) 1=uTexB(副/遷移先) 2=uLut 3=uMask（+ 自前の 4=uCurve）。
     ・共通 uniform: uRes / uTexRes / uTime / uOpacity / uP / uGrade*。
     ・効果は `vec4 fxApply(vec4 c, vec2 uv)` を、遷移は `vec4 trApply(vec2 uv, float p)`
       を 1 個ずつ提供する。効果の追加 uniform は `uFx_<paramKey>`。
     ・色は sRGB のまま扱う（linear 変換はしない）。

   ★ 触るときの注意
     ・**テクスチャの向きの約束**: この合成器では どのテクスチャも
       「v=0 が絵の上」。素材（video/canvas）は元から上が先なので、FBO へ描く時は
       y を反転せず、**canvas へ出す時だけ**反転する（modelMatrix の flipY）。
       ここを崩すと上下が逆さまになる（一番よく在る事故）。
     ・幾何（scale 1 = contain, x/y は割合・中心原点, crop 後は中央）は
       ui/inspector/transform.js と一致させる。→ canvas2d.js §A に集約。
     ・`console` は呼ばない（core/log.js の scope 経由）。

   CONTRACT-NOTE (1): `engine/gl/context.js` `engine/gl/shaders.js`
     `engine/transitions.js` `engine/fx/registry.js` は契約どおりに使うが、
     **動的 import** で読む。静的 import にすると 4 つのうち 1 つが未着なだけで
     合成器ごと読み込めず、プレビューが丸ごと消える（app.js は import の失敗を
     記録して null を持つだけ）。読めたら次のフレームからプログラムを組み直して
     本物を使い、読めない間は この中の既定シェーダ（共通規約どおりの
     VS_QUAD / fsLayer / fsEffect / fsTransition / 自前の遷移 8 種）で描く。
     shaders.js が `fsLayer` / `fsEffect` / `fsTransition` / `VS_QUAD` を出して
     いれば **そちらを優先**する（関数なら差し込む GLSL を引数で渡す）。
   CONTRACT-NOTE (2): 契約書 §4 の grade は「shaders.js が uniform 名を決める」
     とあるので、shaders.js が `GRADE_GLSL`（+ 任意で `setGrade(set, grade)`）を
     出していればそれを使い、無ければ この中の `uGrade*` 一式を使う。
     カーブだけは規約に単位が無いので **単位 4 の `uCurve`（256x1 の表）**を
     自前拡張として足した（規約が固定しているのは 0〜3 番だけ）。
   CONTRACT-NOTE (3): 遷移は eval.js の約束（A の尾で p 0→0.5、B の頭で
     p 0.5→1、重なりは無い）に合わせ、**その時刻に居ない相手**を
     canvas2d.js の `resolvePartner()` で引き直す（素材が続いていれば
     素材時刻を伸ばし、足りなければ端の絵で止める = NLE の作法）。
   CONTRACT-NOTE (4): 700 行の上限を超えている。分割先（engine/gl/*.js）は
     担当外で新規作成できないため、章立て（§A〜§H）で 1 ファイルに収めた。
     分けるなら §B（既定シェーダ）→ gl/shaders.js、§C（小さな GL 層）→
     gl/context.js が素直で、呼び口はこのままで済む。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clipsAt } from "../core/eval.js";
import { clamp, clamp01, finite, hexToRgba } from "../core/util.js";
import { scope } from "../core/log.js";
import {
  createCompositor2D, layerBox, coverBox, outSize, snapQuality, resolvePartner,
  transitionPair, textCanvasFor, shapeCanvasFor, pickFn, makeCanvas, hasCurve, hasWheel
} from "./canvas2d.js";

const L = scope("engine");

/* ══ §A 隣の部品（遅延読み込み。CONTRACT-NOTE (1)）═══════════════ */

let GLCTX = null, SH = null, TRMOD = null, FXMOD = null;
/** 隣が読めた回数。増えたらプログラムを組み直す合図 */
let siblingRev = 0;

(function loadSiblings() {
  const take = (p, set) => {
    try {
      p.then((m) => { set(m); siblingRev++; }).catch(() => { /* 未着。既定で描く */ });
    } catch (_e) { /* noop */ }
  };
  try {
    take(import("./gl/context.js"), (m) => { GLCTX = m; });
    take(import("./gl/shaders.js"), (m) => { SH = m; });
    take(import("./transitions.js"), (m) => { TRMOD = m; });
    take(import("./fx/registry.js"), (m) => { FXMOD = m; });
  } catch (_e) { /* 動的 import が無い環境。既定で描く */ }
})();

/** 名前の候補から表（オブジェクト）を 1 つ選ぶ */
function pickObj(ns, names) {
  if (!ns) return null;
  for (const n of names) {
    const v = ns[n];
    if (v && typeof v === "object") return v;
  }
  return null;
}
/** 名前の候補から文字列を 1 つ選ぶ */
function pickStr(ns, names) {
  if (!ns) return null;
  for (const n of names) {
    const v = ns[n];
    if (typeof v === "string" && v.length > 8) return v;
  }
  return null;
}
/** 短い文字列ハッシュ（プログラムの鍵に使う。衝突しても組み直すだけ） */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ══ §B 既定シェーダ（共通規約どおり。shaders.js が在ればそちら）══ */

/** 共通の頂点シェーダ（規約の VS_QUAD と同じ形） */
export const VS_QUAD_DEFAULT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform mat3 uModel;
uniform vec2 uFlip;
void main() {
  vUv = mix(aPos, vec2(1.0) - aPos, clamp(uFlip, 0.0, 1.0));
  gl_Position = vec4((uModel * vec3(aPos, 1.0)).xy, 0.0, 1.0);
}
`;

/** どのフラグメントにも付く頭（単位の割当と共通 uniform） */
const FS_HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 oColor;
uniform sampler2D uTex;
uniform sampler2D uTexB;
uniform sampler2D uLut;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform vec2 uTexRes;
uniform float uTime;
uniform float uOpacity;
uniform float uP;
const vec3 VQ_LUMA = vec3(0.2126, 0.7152, 0.0722);
float luma(vec3 c) { return dot(c, VQ_LUMA); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float vqNoise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

/** カラーグレード一式（shaders.js が GRADE_GLSL を出していればそちらを使う） */
export const GRADE_GLSL_DEFAULT = `
uniform int   uGradeOn;
uniform vec4  uGradeBasic;
uniform vec2  uGradeWB;
uniform vec4  uGradeTone;
uniform vec4  uGradeMisc;
uniform vec2  uGradeSharp;
uniform vec3  uGradeLift;
uniform vec3  uGradeGamma;
uniform vec3  uGradeGain;
uniform vec3  uGradeOffset;
uniform vec2  uGradeLut;
uniform float uGradeCurve;
uniform sampler2D uCurve;
uniform int   uGradeHslN;
uniform vec4  uGradeHslA[6];
uniform float uGradeHslB[6];
vec3 vqLut(vec3 c, float sz) {
  vec3 cc = clamp(c, 0.0, 1.0);
  float ss = 1.0 / sz;
  float sp = ss / sz;
  float si = sp * (sz - 1.0);
  float zs = min(cc.b * sz, sz - 1.0);
  float z0 = floor(zs);
  float u0 = z0 * ss + sp * 0.5 + cc.r * si;
  float u1 = min(z0 + 1.0, sz - 1.0) * ss + sp * 0.5 + cc.r * si;
  return mix(texture(uLut, vec2(u0, cc.g)).rgb, texture(uLut, vec2(u1, cc.g)).rgb, zs - z0);
}
vec3 vqWheels(vec3 c) {
  c = c * (1.0 + uGradeGain) + uGradeOffset + uGradeLift * (1.0 - clamp(c, 0.0, 1.0));
  return pow(max(c, 0.0), max(vec3(0.05), 1.0 - uGradeGamma));
}
vec3 vqTone(vec3 c) {
  float y = luma(c);
  c += uGradeTone.x * smoothstep(0.5, 1.0, y) * 0.5;
  c += uGradeTone.y * smoothstep(0.5, 0.0, y) * 0.5;
  c += uGradeTone.z * smoothstep(0.7, 1.0, y) * 0.4;
  c += uGradeTone.w * smoothstep(0.3, 0.0, y) * 0.4;
  return c;
}
vec4 gradeApply(vec4 col, vec2 uv) {
  if (uGradeOn == 0) return col;
  vec3 c = col.rgb;
  c *= pow(2.0, uGradeBasic.x * 2.0);
  c.r += uGradeWB.x * 0.15; c.b -= uGradeWB.x * 0.15;
  c.g += uGradeWB.y * 0.10; c.b -= uGradeWB.y * 0.05;
  c = (c - 0.5) * (1.0 + uGradeBasic.y) + 0.5;
  c = vqTone(c);
  c = vqWheels(c);
  c = mix(vec3(luma(c)), c, 1.0 + uGradeBasic.z);
  if (abs(uGradeBasic.w) > 0.001) {
    vec3 h = rgb2hsv(clamp(c, 0.0, 1.0));
    c = mix(vec3(luma(c)), c, 1.0 + uGradeBasic.w * (1.0 - h.y));
  }
  if (abs(uGradeMisc.x) > 0.0005) {
    vec3 h = rgb2hsv(clamp(c, 0.0, 1.0));
    h.x = fract(h.x + uGradeMisc.x);
    c = hsv2rgb(h);
  }
  for (int i = 0; i < 6; i++) {
    if (i >= uGradeHslN) break;
    vec4 b = uGradeHslA[i];
    float lsh = uGradeHslB[i];
    if (abs(b.z) < 0.0005 && abs(b.w) < 0.0005 && abs(lsh) < 0.0005) continue;
    vec3 h = rgb2hsv(clamp(c, 0.0, 1.0));
    float d = abs(fract(h.x - b.x + 0.5) - 0.5);
    float wg = 1.0 - smoothstep(max(0.01, b.y) * 0.5, max(0.02, b.y), d);
    if (wg <= 0.002) continue;
    h.x = fract(h.x + b.z * wg);
    h.y = clamp(h.y * (1.0 + b.w * wg), 0.0, 1.0);
    h.z = clamp(h.z * (1.0 + lsh * wg), 0.0, 1.0);
    c = hsv2rgb(h);
  }
  if (uGradeCurve > 0.5) {
    vec3 m = vec3(
      texture(uCurve, vec2(clamp(c.r, 0.0, 1.0), 0.5)).r,
      texture(uCurve, vec2(clamp(c.g, 0.0, 1.0), 0.5)).g,
      texture(uCurve, vec2(clamp(c.b, 0.0, 1.0), 0.5)).b);
    float y0 = luma(m);
    c = m + (texture(uCurve, vec2(clamp(y0, 0.0, 1.0), 0.5)).a - y0);
  }
  if (uGradeLut.y > 1.5) c = mix(c, vqLut(c, uGradeLut.y), clamp(uGradeLut.x, 0.0, 1.0));
  c = mix(c, c * 0.82 + 0.13, clamp(uGradeMisc.y, 0.0, 1.0));
  if (uGradeMisc.z > 0.001) {
    float v = 1.0 - smoothstep(0.25, 0.8, length(uv - 0.5) * 1.3);
    c *= mix(1.0, v, clamp(uGradeMisc.z, 0.0, 1.0));
  }
  if (uGradeMisc.w > 0.001) {
    c += (vqNoise(uv * uRes + uTime * 61.0) - 0.5) * uGradeMisc.w * 0.25;
  }
  return vec4(c, col.a);
}
`;

/** マスクとクロマキー（layer だけが使う） */
const MASK_GLSL = `
uniform int uMaskType;
uniform vec4 uMaskRect;
uniform vec3 uMaskOpt;
uniform int uMaskInvert;
uniform int uMaskN;
uniform vec2 uMaskPts[24];
uniform int uChromaOn;
uniform vec3 uChromaKey;
uniform vec3 uChromaSet;
float maskAt(vec2 uv) {
  if (uMaskType == 0) return 1.0;
  float f = max(0.0015, uMaskOpt.y * 0.5);
  vec2 hw = max(vec2(0.002), uMaskRect.zw * 0.5 * (1.0 + uMaskOpt.z));
  float s = sin(-uMaskOpt.x), co = cos(-uMaskOpt.x);
  vec2 d0 = uv - uMaskRect.xy;
  vec2 p = vec2(d0.x * co - d0.y * s, d0.x * s + d0.y * co);
  float m = 1.0;
  if (uMaskType == 1) {
    vec2 d = abs(p) - hw;
    m = 1.0 - smoothstep(-f, f, max(d.x, d.y));
  } else if (uMaskType == 2) {
    m = 1.0 - smoothstep(-f * 2.0, f * 2.0, length(p / hw) - 1.0);
  } else if (uMaskType == 3) {
    bool inside = false;
    float best = 1e9;
    for (int i = 0; i < 24; i++) {
      if (i >= uMaskN) break;
      vec2 a = uMaskPts[i];
      vec2 b = uMaskPts[(i + 1) >= uMaskN ? 0 : (i + 1)];
      if (((a.y > uv.y) != (b.y > uv.y)) &&
          (uv.x < (b.x - a.x) * (uv.y - a.y) / (b.y - a.y + 1e-9) + a.x)) inside = !inside;
      vec2 e = b - a, w = uv - a;
      best = min(best, length(w - e * clamp(dot(w, e) / max(1e-9, dot(e, e)), 0.0, 1.0)));
    }
    m = 1.0 - smoothstep(-f, f, inside ? -best : best);
  } else if (uMaskType == 4) {
    float t = p.y / max(0.002, hw.y * 2.0) + 0.5;
    m = 1.0 - smoothstep(0.5 - f * 2.0 - 0.002, 0.5 + f * 2.0 + 0.002, t);
  } else {
    m = 1.0 - smoothstep(1.0 - f * 2.0 - 0.002, 1.0 + f * 2.0, length(p / hw));
  }
  if (uMaskInvert == 1) m = 1.0 - m;
  return clamp(m, 0.0, 1.0);
}
vec4 chromaApply(vec4 col) {
  if (uChromaOn == 0) return col;
  float ky = luma(uChromaKey), cy = luma(col.rgb);
  vec2 kuv = vec2(uChromaKey.r - ky, uChromaKey.b - ky);
  vec2 cuv = vec2(col.r - cy, col.b - cy);
  float d = length(cuv - kuv);
  float sim = max(0.002, uChromaSet.x * 0.8);
  float sm = max(0.0005, uChromaSet.y * 0.6);
  float a = smoothstep(sim, sim + sm, d);
  float sp = clamp(1.0 - d / max(0.002, sim * 2.0), 0.0, 1.0) * uChromaSet.z;
  return vec4(mix(col.rgb, vec3(luma(col.rgb)), sp), col.a * a);
}
`;

/** 効果を差し込まない時の素通し */
const FX_IDENTITY = `vec4 fxApply(vec4 c, vec2 uv) { return c; }`;

/**
 * 層 1 枚のフラグメント（crop→（先鋭化/ノイズ取り）→chroma→grade→fx 1 段目→mask）。
 * @param {string} fxGlsl 差し込む GLSL（fxApply を定義する物）
 * @param {string} gradeGlsl grade 一式
 * @returns {string}
 */
export function fsLayerDefault(fxGlsl, gradeGlsl) {
  return FS_HEAD + (gradeGlsl || GRADE_GLSL_DEFAULT) + MASK_GLSL + `
uniform vec4 uCrop;
` + (fxGlsl || FX_IDENTITY) + `
void main() {
  vec2 suv = uCrop.xy + clamp(vUv, 0.0, 1.0) * uCrop.zw;
  vec4 c = texture(uTex, suv);
  if (uGradeOn == 1 && (uGradeSharp.x > 0.002 || uGradeSharp.y > 0.002)) {
    vec2 ts = 1.0 / max(vec2(2.0), uTexRes);
    vec3 b = (texture(uTex, suv + vec2(ts.x, 0.0)).rgb + texture(uTex, suv - vec2(ts.x, 0.0)).rgb
            + texture(uTex, suv + vec2(0.0, ts.y)).rgb + texture(uTex, suv - vec2(0.0, ts.y)).rgb) * 0.25;
    c.rgb = mix(c.rgb, b, clamp(uGradeSharp.y, 0.0, 1.0));
    c.rgb = c.rgb + (c.rgb - b) * uGradeSharp.x * 2.0;
  }
  c = chromaApply(c);
  c = gradeApply(c, vUv);
  c = fxApply(c, vUv);
  float a = clamp(c.a * maskAt(vUv) * clamp(uOpacity, 0.0, 1.0), 0.0, 1.0);
  oColor = vec4(clamp(c.rgb, 0.0, 8.0) * a, a);
}
`;
}

/** 2 段目以降の効果（FBO ピンポン）。入力は事前乗算なので直値へ戻して渡す */
export function fsEffectDefault(fxGlsl) {
  return FS_HEAD + (fxGlsl || FX_IDENTITY) + `
void main() {
  vec4 c = texture(uTex, clamp(vUv, 0.0, 1.0));
  c.rgb = c.a > 0.002 ? c.rgb / c.a : c.rgb;
  c = fxApply(c, vUv);
  float a = clamp(c.a * clamp(uOpacity, 0.0, 1.0), 0.0, 1.0);
  oColor = vec4(clamp(c.rgb, 0.0, 8.0) * a, a);
}
`;
}

/** 遷移（uTex = 遷移元 A、uTexB = 遷移先 B。どちらも事前乗算） */
export function fsTransitionDefault(trGlsl) {
  return FS_HEAD + (trGlsl || BUILTIN_TR.crossfade) + `
void main() {
  vec4 c = trApply(clamp(vUv, 0.0, 1.0), clamp(uP, 0.0, 1.0));
  oColor = c * clamp(uOpacity, 0.0, 1.0);
}
`;
}

/** 層 FBO を親へ置く（単純な合成。blendFunc で足りる blend のとき） */
const FS_DRAW = FS_HEAD + `
void main() {
  oColor = texture(uTex, clamp(vUv, 0.0, 1.0)) * clamp(uOpacity, 0.0, 1.0);
}
`;

/** 固定機能で出せない blend（親の写しを読んで自分で混ぜる） */
const FS_BLEND = FS_HEAD + `
uniform int uBlend;
vec3 vqBlend(vec3 d, vec3 s, int m) {
  if (m == 1) return max(d, s);
  if (m == 2) return min(d, s);
  if (m == 3) return abs(d - s);
  if (m == 4) return mix(2.0 * d * s, 1.0 - 2.0 * (1.0 - d) * (1.0 - s), step(0.5, d));
  if (m == 5) {
    vec3 dd = mix(((16.0 * d - 12.0) * d + 4.0) * d, sqrt(max(d, 0.0)), step(0.25, d));
    return mix(d - (1.0 - 2.0 * s) * d * (1.0 - d), d + (2.0 * s - 1.0) * (dd - d), step(0.5, s));
  }
  return s;
}
void main() {
  vec4 s = texture(uTex, clamp(vUv, 0.0, 1.0)) * clamp(uOpacity, 0.0, 1.0);
  float sa = clamp(s.a, 0.0, 1.0);
  vec3 sc = sa > 0.002 ? s.rgb / sa : vec3(0.0);
  vec4 d = texture(uTexB, gl_FragCoord.xy / max(vec2(1.0), uRes));
  vec3 dc = d.a > 0.002 ? d.rgb / d.a : vec3(0.0);
  vec3 b = vqBlend(clamp(dc, 0.0, 1.0), clamp(sc, 0.0, 1.0), uBlend);
  oColor = vec4(b * sa, sa);
}
`;

/** 写し（uStraight=1 なら直値・不透明にして canvas 用にする） */
const FS_BLIT = FS_HEAD + `
uniform int uStraight;
void main() {
  vec4 c = texture(uTex, clamp(vUv, 0.0, 1.0));
  if (uStraight == 1) oColor = vec4(c.a > 0.002 ? c.rgb / c.a : c.rgb, 1.0);
  else oColor = c;
}
`;

/** 分離ガウスぼかし（背景のぼかしに使う） */
const FS_BLUR = FS_HEAD + `
uniform vec2 uDir;
void main() {
  vec4 s = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float x = float(i);
    float w = exp(-(x * x) / 16.0);
    s += texture(uTex, clamp(vUv + uDir * x, 0.0, 1.0)) * w;
    wsum += w;
  }
  oColor = s / max(0.0001, wsum);
}
`;

/** 単色（背景色・dip 用） */
const FS_FILL = FS_HEAD + `
uniform vec4 uFill;
void main() { oColor = vec4(uFill.rgb * uFill.a, uFill.a); }
`;

/**
 * 自前の遷移（transitions.js が未着でも 8 種は動く）。
 * どれも `vec4 trApply(vec2 uv, float p)` 1 個だけを定義する（共通規約）。
 */
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
  return vec4(mix(c.rgb, vec3(k), k), max(c.a, k));
}`,
  slide: `vec4 trApply(vec2 uv, float p) {
  return (uv.x + p <= 1.0) ? texture(uTex, uv + vec2(p, 0.0))
                           : texture(uTexB, uv - vec2(1.0 - p, 0.0));
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
  float n = vqNoise(vec2(floor(uv.y * 48.0), floor(uTime * 24.0)));
  vec2 o = vec2((n - 0.5) * 0.14 * k, 0.0);
  float m = smoothstep(0.3, 0.7, p);
  vec4 c = mix(texture(uTex, clamp(uv + o, 0.0, 1.0)), texture(uTexB, clamp(uv - o, 0.0, 1.0)), m);
  float r = mix(texture(uTex, clamp(uv + o * 1.8, 0.0, 1.0)).r,
                texture(uTexB, clamp(uv - o * 1.8, 0.0, 1.0)).r, m);
  c.r = mix(c.r, r, k * 0.8);
  return c;
}`
});

/** 遷移名 → 自前の実装（無い名前は crossfade へ落とす） */
const TR_ALIAS = Object.freeze({
  crossfade: "crossfade", fade: "crossfade", dissolve: "crossfade", cut: "cut",
  dip: "dipToBlack", dipToBlack: "dipToBlack", fadeToBlack: "dipToBlack",
  dipToWhite: "dipToWhite", flash: "dipToWhite",
  slide: "slide", push: "slide", slideLeft: "slide", whipPan: "whipPan",
  zoomIn: "zoomIn", zoom: "zoomIn", wipe: "wipe", glitch: "glitch"
});

/** blend 名 → 固定機能で出せるか / シェーダの番号 */
const BLEND_SHADER = Object.freeze({ lighten: 1, darken: 2, difference: 3, overlay: 4, softlight: 5 });

/* ══ §C 小さな GL 層（プログラム / FBO / テクスチャ / 行列）════════ */

/** 文脈の属性。preserveDrawingBuffer は「書き出しで読める」ための保険 */
const GL_ATTRS = Object.freeze({
  alpha: false, depth: false, stencil: false, antialias: false,
  premultipliedAlpha: false, preserveDrawingBuffer: true,
  powerPreference: "high-performance", failIfMajorPerformanceCaveat: false
});

/** マスク種別 → シェーダの番号（MASK_GLSL と合わせる） */
const MASK_TYPE_N = Object.freeze({ rect: 1, ellipse: 2, polygon: 3, linear: 4, radial: 5 });

/** 何も無い層の代わりに使う 1x1 透明。遷移の片側が無い時に要る */
function makeEmptyTex(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  texParams(gl);
  return t;
}
function texParams(gl) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** 文脈を取る（gl/context.js に任せられるなら任せる） */
function getGL(canvas, preferGL) {
  if (!preferGL) return null;
  const mk = pickFn(GLCTX, ["createGLContext", "createContext", "createGL", "makeContext", "getGL"]);
  if (mk) {
    try {
      const r = mk(canvas, GL_ATTRS);
      const gl = r && (r.gl || (r.drawingBufferWidth !== undefined ? r : null));
      if (gl && typeof gl.createProgram === "function") return gl;
    } catch (e) { L.warn("gl/context.js が文脈を作れませんでした（自分で作ります）", e); }
  }
  try { return canvas.getContext("webgl2", GL_ATTRS) || null; }
  catch (e) { L.warn("webgl2 を作れません", e); return null; }
}

function compileShader(gl, type, src, tag) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = String(gl.getShaderInfoLog(sh) || "").slice(0, 400);
    gl.deleteShader(sh);
    throw new Error("シェーダを組めません（" + tag + "）: " + info);
  }
  return sh;
}

/**
 * プログラムを 1 本作る。uniform は **実物を数えて**型ごとに覚える
 * （fx が勝手に足した uFx_* も これで型どおりに渡せる）。
 */
function makeProgram(gl, vsSrc, fsSrc, tag) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, tag + ":vs");
  let fs = null;
  try { fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, tag + ":fs"); }
  catch (e) { gl.deleteShader(vs); throw e; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = String(gl.getProgramInfoLog(prog) || "").slice(0, 400);
    gl.deleteProgram(prog);
    throw new Error("シェーダを繋げません（" + tag + "）: " + info);
  }
  const u = new Map();
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const loc = gl.getUniformLocation(prog, info.name);
    if (!loc) continue;
    u.set(String(info.name).replace(/\[\d+\]$/, ""), { loc, type: info.type, size: info.size });
  }
  return { prog, u, tag };
}

/** 値を数の並びへ（#rrggbb も読む。足りない分は 0 で埋める） */
function flatten(v, n) {
  if (typeof v === "string") {
    const c = hexToRgba(v);
    if (c) return n === 4 ? c : [c[0], c[1], c[2]].slice(0, n);
    return new Array(n).fill(0);
  }
  if (typeof v === "number") return new Array(n).fill(finite(v, 0));
  if (typeof v === "boolean") return new Array(n).fill(v ? 1 : 0);
  if (v && (Array.isArray(v) || v.length !== undefined)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (Array.isArray(x)) { for (const y of x) out.push(finite(y, 0)); }
      else out.push(finite(x, 0));
    }
    while (out.length % n !== 0 || out.length === 0) out.push(0);
    return out;
  }
  return new Array(n).fill(0);
}
function num1(v) {
  if (typeof v === "number") return finite(v, 0);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return finite(v[0], 0);
  return 0;
}

/** uniform を型どおりに渡す。無い名前は黙って捨てる（fx の任意 uniform 用） */
function setUniform(gl, p, name, v) {
  const e = p.u.get(name);
  if (!e || v === undefined || v === null) return false;
  const T = e.type;
  if (T === gl.FLOAT) {
    if (e.size > 1) gl.uniform1fv(e.loc, flatten(v, 1));
    else gl.uniform1f(e.loc, num1(v));
  } else if (T === gl.INT || T === gl.BOOL || T === gl.SAMPLER_2D ||
             T === gl.SAMPLER_CUBE || T === gl.UNSIGNED_INT) {
    if (e.size > 1) gl.uniform1iv(e.loc, flatten(v, 1).map((x) => Math.round(x)));
    else gl.uniform1i(e.loc, Math.round(num1(v)));
  } else if (T === gl.FLOAT_VEC2) { gl.uniform2fv(e.loc, flatten(v, 2)); }
  else if (T === gl.FLOAT_VEC3) { gl.uniform3fv(e.loc, flatten(v, 3)); }
  else if (T === gl.FLOAT_VEC4) { gl.uniform4fv(e.loc, flatten(v, 4)); }
  else if (T === gl.INT_VEC2 || T === gl.BOOL_VEC2) { gl.uniform2iv(e.loc, flatten(v, 2).map((x) => Math.round(x))); }
  else if (T === gl.INT_VEC3 || T === gl.BOOL_VEC3) { gl.uniform3iv(e.loc, flatten(v, 3).map((x) => Math.round(x))); }
  else if (T === gl.INT_VEC4 || T === gl.BOOL_VEC4) { gl.uniform4iv(e.loc, flatten(v, 4).map((x) => Math.round(x))); }
  else if (T === gl.FLOAT_MAT3) { gl.uniformMatrix3fv(e.loc, false, flatten(v, 9)); }
  else if (T === gl.FLOAT_MAT4) { gl.uniformMatrix4fv(e.loc, false, flatten(v, 16)); }
  else return false;
  return true;
}

/**
 * 単位四角形（0..1）を「箱」へ写す 3x3（列優先）。
 * flipY のときだけ y を反転する（= canvas へ出す最後の 1 回）。§ 触るときの注意
 */
export function modelMatrix(box, tw, th, flipY) {
  const c = Math.cos(finite(box.rot, 0)), s = Math.sin(finite(box.rot, 0));
  const w = finite(box.w, tw), h = finite(box.h, th);
  const ox = finite(box.cx, tw / 2) - w / 2, oy = finite(box.cy, th / 2) - h / 2;
  const px = finite(box.px, finite(box.cx, tw / 2)), py = finite(box.py, finite(box.cy, th / 2));
  const ax = w * c, bx = -h * s, tx = c * (ox - px) - s * (oy - py) + px;
  const ay = w * s, by = h * c, ty = s * (ox - px) + c * (oy - py) + py;
  const sx = 2 / Math.max(1, tw), sy = (flipY ? -2 : 2) / Math.max(1, th);
  return new Float32Array([
    ax * sx, ay * sy, 0,
    bx * sx, by * sy, 0,
    tx * sx - 1, ty * sy + (flipY ? 1 : -1), 1
  ]);
}
/** 描き先いっぱいの箱 */
export function fullBox(w, h) {
  return { w, h, cx: w / 2, cy: h / 2, px: w / 2, py: h / 2, rot: 0, flipH: false, flipV: false };
}

/** FBO の貸し出し箱（大きさが同じ物を使い回す。毎フレーム作らない） */
function makeFboPool(gl) {
  let idle = [];
  let made = 0;
  function create(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    texParams(gl);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok !== gl.FRAMEBUFFER_COMPLETE) {
      try { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); } catch (_e) { /* noop */ }
      throw new Error("描き場（FBO " + w + "x" + h + "）を作れません: 0x" + ok.toString(16));
    }
    made++;
    return { w, h, tex, fb, free: false };
  }
  return {
    acquire(w, h) {
      const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
      for (let i = 0; i < idle.length; i++) {
        if (idle[i].w === W && idle[i].h === H) {
          const f = idle.splice(i, 1)[0];
          f.free = false;
          return f;
        }
      }
      return create(W, H);
    },
    release(f) {
      if (!f || f.free) return;
      f.free = true;
      idle.push(f);
    },
    /** 余った器を少しだけ捨てる（解像度を変えた後に溜まるのを防ぐ） */
    sweep(keep) {
      const k = Math.max(4, finite(keep, 8));
      while (idle.length > k) {
        const f = idle.shift();
        try { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); } catch (_e) { /* noop */ }
      }
    },
    forget() { idle = []; },
    disposeAll() {
      for (const f of idle) {
        try { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); } catch (_e) { /* noop */ }
      }
      idle = [];
    },
    stats() { return { idle: idle.length, made }; }
  };
}

/* ══ §D 合成器の本体 ═══════════════════════════════════════════════ */

/** 2d へ落ちた時に「出せなくなった物」として申告する名前 */
const MISSING_ON_2D = Object.freeze(["chroma", "fx", "mask.feather", "grade.curves", "grade.wheels", "grade.lut"]);
/** 調整レイヤー用の素の transform */
const IDENT_TRANSFORM = Object.freeze({
  x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateDeg: 0,
  anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false,
  crop: Object.freeze({ l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 })
});

const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

/**
 * 合成器を作る（契約書 §4）。WebGL2 が使えなければ そのまま 2d の互換品を返す。
 * @param {HTMLCanvasElement} canvas
 * @param {{preferGL?:boolean}} [options]
 * @returns {Object} Compositor
 */
export function createCompositor(canvas, options) {
  if (!canvas) throw new Error("createCompositor: canvas が要ります");
  const o = options || {};
  const preferGL = o.preferGL !== false;
  const gl = getGL(canvas, preferGL);
  if (!gl) {
    L.warn("WebGL2 が使えないので 2d の合成器で描きます");
    return createCompositor2D(canvas, {
      reason: preferGL ? "WebGL2 が使えません" : "preferGL:false",
      missing: MISSING_ON_2D.slice()
    });
  }

  /* ── 状態 ─────────────────────────────────────────────────────── */
  let fb2d = null;                       // 2d へ落ちた後の代役
  let lost = false, lostAt = 0, lostCount = 0, hardFails = 0;
  let pool = null, vao = null, quadBuf = null, emptyTex = null;
  let texCache = new WeakMap();          // 素材の要素 → {tex,w,h,once}
  const canvasRegs = new Map();          // 文字/図形の clipId → {key,tex,w,h}
  const curves = new Map();              // カーブの鍵 → {tex}
  const luts = new Map();                // LUT の id → {tex,size} | null
  const progs = new Map();
  let progRev = -1;
  const missing = new Set(), warned = new Set(), warnings = [];
  const maxTex = Math.max(2048, finite(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096));
  const st = {
    ms: 0, avg: 0, frames: 0, layers: 0, draws: 0, q: 1, autoQ: 1,
    slow: 0, fast: 0, auto: true, texUploads: 0
  };

  function warnOnce(key, ...args) {
    if (warned.has(key)) return;
    warned.add(key);
    if (warnings.length < 60) warnings.push(key);
    L.warn(key, ...args);
  }

  /* ── 起こす / 片付ける ────────────────────────────────────────── */
  function init() {
    pool = makeFboPool(gl);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    emptyTex = makeEmptyTex(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    blendNormal();
    gl.clearColor(0, 0, 0, 1);
  }
  function dropGpuState() {
    progs.clear();
    curves.clear();
    luts.clear();
    canvasRegs.clear();
    texCache = new WeakMap();
    if (pool) pool.forget();
    progRev = -1;
    vao = quadBuf = emptyTex = null;
  }

  function onLost(ev) {
    try { ev.preventDefault(); } catch (_e) { /* noop */ }
    lost = true; lostCount++; lostAt = nowMs();
    dropGpuState();
    missing.add("webgl(文脈喪失)");
    warnOnce("webgl.lost", "WebGL の文脈を失いました（" + lostCount + " 回目）");
    if (lostCount >= 3) degrade("WebGL の文脈を 3 回失いました");
  }
  function onRestored() {
    if (fb2d) return;
    try {
      init();
      lost = false; lostAt = 0;
      missing.delete("webgl(文脈喪失)");
      L.log("WebGL の文脈が戻りました");
    } catch (e) { degrade("文脈が戻っても作り直せませんでした: " + (e && e.message)); }
  }
  if (typeof canvas.addEventListener === "function") {
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
  }

  /**
   * 2d の互換品へ移る。canvas 1 枚に文脈は 1 種類しか作れないので、
   * DOM に居るなら **同じ属性の canvas を差し替える**（居ないなら内部の 1 枚）。
   * 差し替えると 呼び側が持っている参照は古くなるので `compositor.canvas` を見る事。
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
          try { if (canvas.getAttribute && canvas.getAttribute(a) !== null) repl.setAttribute(a, canvas.getAttribute(a)); }
          catch (_e) { /* noop */ }
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
    const list = MISSING_ON_2D.concat(Array.from(missing));
    try { fb2d = createCompositor2D(target, { reason: "webgl → 2d: " + reason, missing: list }); }
    catch (e) { L.error("2d の合成器も作れません", e); return null; }
    try {
      fb2d.setRegistries(pickObj(FXMOD, ["FX_REGISTRY", "REGISTRY", "FX"]),
        pickObj(TRMOD, ["TRANSITIONS", "REGISTRY"]));
    } catch (_e) { /* 無くても描ける */ }
    L.warn("2d の合成器へ移りました: " + reason);
    try { disposeGL(); } catch (_e) { /* noop */ }
    return fb2d;
  }

  function disposeGL() {
    for (const p of progs.values()) { try { gl.deleteProgram(p.prog); } catch (_e) { /* noop */ } }
    progs.clear();
    for (const c of curves.values()) { try { gl.deleteTexture(c.tex); } catch (_e) { /* noop */ } }
    curves.clear();
    for (const e of canvasRegs.values()) { try { gl.deleteTexture(e.tex); } catch (_e) { /* noop */ } }
    canvasRegs.clear();
    luts.clear();
    if (pool) pool.disposeAll();
    try { if (vao) gl.deleteVertexArray(vao); } catch (_e) { /* noop */ }
    try { if (quadBuf) gl.deleteBuffer(quadBuf); } catch (_e) { /* noop */ }
    try { if (emptyTex) gl.deleteTexture(emptyTex); } catch (_e) { /* noop */ }
    vao = quadBuf = emptyTex = null;
    texCache = new WeakMap();
  }

  /* ── 描く道具 ─────────────────────────────────────────────────── */
  function blendNormal() {
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);      // 事前乗算どうしの重ね
  }
  function blendFor(mode) {
    gl.blendEquation(gl.FUNC_ADD);
    if (mode === "add") gl.blendFunc(gl.ONE, gl.ONE);
    else if (mode === "screen") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else if (mode === "multiply") gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else blendNormal();
  }
  function bind(target, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  function clearTo(r, g, b, a) {
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function draw(p, uniforms, texes) {
    gl.useProgram(p.prog);
    gl.bindVertexArray(vao);
    if (texes) {
      for (let i = 0; i < texes.length; i++) {
        const unit = texes[i][0];
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texes[i][1] || emptyTex);
      }
    }
    for (const k in uniforms) setUniform(gl, p, k, uniforms[k]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    st.draws++;
  }
  /** 共通 uniform の下敷き（単位の割当は規約どおり固定） */
  function baseU(w, h, texW, texH, time) {
    return {
      uTex: 0, uTexB: 1, uLut: 2, uMask: 3, uCurve: 4,
      uRes: [w, h], uTexRes: [texW, texH], uTime: finite(time, 0),
      uOpacity: 1, uP: 0, uFlip: [0, 0], uModel: modelMatrix(fullBox(w, h), w, h, false)
    };
  }

  /* ── プログラム（隣が読めたら組み直す）─────────────────────── */
  function vsSrc() { return pickStr(SH, ["VS_QUAD", "VS", "VERT"]) || VS_QUAD_DEFAULT; }
  function gradeSrc() { return pickStr(SH, ["GRADE_GLSL", "GRADE_SRC", "GRADE"]) || GRADE_GLSL_DEFAULT; }

  /** shaders.js の builder を試し、駄目なら自前の既定を使う */
  function buildFs(kind, inject) {
    const fn = pickFn(SH, kind === "layer" ? ["fsLayer"] : kind === "effect" ? ["fsEffect"] : ["fsTransition"]);
    if (fn) {
      const opt = { fx: inject, transition: inject, glsl: inject, grade: gradeSrc(), kind };
      for (const args of [[opt], [inject], [inject, gradeSrc()]]) {
        try {
          const s = fn.apply(null, args);
          if (typeof s === "string" && s.indexOf("#version") === 0) return s;
        } catch (_e) { /* 次の呼び方を試す */ }
      }
      warnOnce("shaders." + kind, "shaders.js の " + kind + " を呼べないので既定のシェーダを使います");
    }
    const str = pickStr(SH, kind === "layer" ? ["FS_LAYER"] : kind === "effect" ? ["FS_EFFECT"] : ["FS_TRANSITION"]);
    if (str && str.indexOf("#version") === 0) {
      const ph = ["//__FX__", "/*__FX__*/", "//__INJECT__", "/*FX*/"].find((x) => str.indexOf(x) >= 0);
      if (ph) return str.replace(ph, inject || FX_IDENTITY);
      if (!inject) return str;
    }
    if (kind === "layer") return fsLayerDefault(inject, gradeSrc());
    if (kind === "effect") return fsEffectDefault(inject);
    return fsTransitionDefault(inject);
  }

  function prog(key, make) {
    if (progRev !== siblingRev) {
      for (const p of progs.values()) { try { gl.deleteProgram(p.prog); } catch (_e) { /* noop */ } }
      progs.clear();
      progRev = siblingRev;
    }
    let p = progs.get(key);
    if (p) return p;
    p = make();
    progs.set(key, p);
    return p;
  }
  const pDraw = () => prog("draw", () => makeProgram(gl, vsSrc(), FS_DRAW, "draw"));
  const pBlend = () => prog("blend", () => makeProgram(gl, vsSrc(), FS_BLEND, "blend"));
  const pBlit = () => prog("blit", () => makeProgram(gl, vsSrc(), FS_BLIT, "blit"));
  const pBlur = () => prog("blur", () => makeProgram(gl, vsSrc(), FS_BLUR, "blur"));
  const pFill = () => prog("fill", () => makeProgram(gl, vsSrc(), FS_FILL, "fill"));

  /* ── 効果 / 遷移の GLSL を取る ────────────────────────────────── */
  function fxSource(f) {
    const type = String((f && f.type) || "");
    if (!type) return null;
    const reg = pickObj(FXMOD, ["FX_REGISTRY", "REGISTRY", "FX"]);
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
    if (typeof g !== "string" || g.indexOf("fxApply") < 0) {
      missing.add("fx." + type);
      warnOnce("fxglsl2:" + type, "効果 " + type + " が fxApply を出していません");
      return null;
    }
    return { src: g, key: type + "#" + hash(g) };
  }
  function trSource(type) {
    const t = String(type || "crossfade");
    const reg = pickObj(TRMOD, ["TRANSITIONS", "REGISTRY"]);
    const e = reg ? reg[t] : null;
    let g = e && (e.glsl || e.frag || e.fs || e.shader || e.code || e.trApply || e.gl);
    if (typeof g === "function") {
      try { g = g((e && e.params) || {}, { type: t }); } catch (err) { warnOnce("trglsl:" + t, err); g = null; }
    }
    if (typeof g === "string" && g.indexOf("trApply") >= 0) return { src: g, key: t + "#" + hash(g) };
    const name = TR_ALIAS[t];
    if (!name) {
      missing.add("transition." + t);
      warnOnce("tr:" + t, "遷移 " + t + " が無いので crossfade で代えます");
    }
    return { src: BUILTIN_TR[name || "crossfade"], key: "builtin:" + (name || "crossfade") };
  }
  /** 効果の任意 uniform（規約: uFx_<paramKey>。遷移は uTr_ も受ける） */
  function paramU(params, u, alsoTr) {
    const ps = params && typeof params === "object" ? params : null;
    if (!ps) return u;
    for (const k in ps) {
      u["uFx_" + k] = ps[k];
      if (alsoTr) u["uTr_" + k] = ps[k];
    }
    return u;
  }

  /* ── テクスチャ ───────────────────────────────────────────────── */
  function uploadEl(el, w, h, always) {
    let e = texCache.get(el);
    try {
      if (!e) {
        e = { tex: gl.createTexture(), w: 0, h: 0, once: false };
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        texParams(gl);
        texCache.set(el, e);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
      }
      if (e.once && !always) return e.tex;
      if (e.w === w && e.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, el);
      else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
        e.w = w; e.h = h;
      }
      e.once = true;
      st.texUploads++;
      return e.tex;
    } catch (err) {
      warnOnce("upload", err);      // 読み込み途中の video などは この 1 枚を飛ばす
      return null;
    }
  }
  /** 文字/図形の canvas は clip ごとに 1 枚のテクスチャを使い回す */
  function canvasTex(id, key, make) {
    let e = canvasRegs.get(id);
    if (e && e.key === key) return e;
    let cv = null;
    try { cv = make(); } catch (err) { warnOnce("render:" + id, err); return null; }
    if (!cv || !cv.width) return null;
    if (!e) {
      if (canvasRegs.size > 24) {
        const first = canvasRegs.keys().next().value;
        const old = canvasRegs.get(first);
        try { if (old && old.tex) gl.deleteTexture(old.tex); } catch (_e) { /* noop */ }
        canvasRegs.delete(first);
      }
      e = { key: "", tex: null, w: 0, h: 0 };
      canvasRegs.set(id, e);
    }
    const tex = uploadEl(cv, cv.width, cv.height, true);
    if (!tex) return null;
    e.key = key; e.tex = tex; e.w = cv.width; e.h = cv.height;
    return e;
  }
