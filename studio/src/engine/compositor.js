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
