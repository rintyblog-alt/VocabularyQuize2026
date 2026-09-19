/* ══════════════════════════════════════════════════════════════════════
   engine/gl/shaders.js — GLSL を「文字列で組み立てる」所（gl は触らない）

   ★ 何をする所か
     WebGL2 / GLSL ES 3.00 のソースを作る純関数だけを置く。
     VS_QUAD（頂点は repo 全体でこの 1 本）/ CHUNKS（GLSL の断片）/
     fsLayer・fsBlend・fsTransition・fsEffect・fsCopy・fsGauss・fsScopes /
     GRADE_UNIFORMS（カラー uniform の表 = compositor との契約）。

   ★ なぜこの形か
     ・gl を触らないので **Node の試験で全部検められる**（tests/shaders.test.mjs）。
       「未定義の関数を呼んでいない」「out は 1 つ」「括弧が合う」を機械で見る。
     ・uniform の宣言文は GRADE_UNIFORMS の表から **自動生成**する。表とソースが
       食い違う事故（compositor が詰めた値が届かない）を構造的に無くすため。
     ・効果/遷移は「GLSL の関数 1 個」だけを持ち込む形。定型 main() をここが
       持つので、fx の作者は uniform と 1 関数だけ考えれば良い。
     ・色は sRGB のまま扱う（v1 の割り切り）。linear 変換はしない。srgb chunk は
       「後で必要になったときの入口」として置いてあるだけ。

   ★ 触るときの注意
     ・1 行目は必ず "#version 300 es"（前に空行を入れると GLSL が拒む）。
     ・chunk は **関数定義のみ**。uniform をこの中で宣言しない（引数で渡す）。
     ・chunk 同士は CHUNK_ORDER で前に在る物だけを呼ぶ。依存は CHUNK_DEPS に書く。
     ・関数名を GLSL 組み込み（mix/clamp/texture…）と衝突させない。
     ・テクスチャ単位は固定: 0=uTex, 1=uTexB, 2=uLut, 3=uMask。
     ・uv は **左上原点**（(0,0) が素材の左上）。context.js の uploadSource は
       flipY:false で上げ、canvas 宛ての描画で Y を反転する（対の約束）。
       こうしないと crop.t / mask の上下が裏返る。
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

/** テクスチャ単位の固定割当（契約。compositor はこの順で bind する） */
export const TEXTURE_UNITS = Object.freeze({ uTex: 0, uTexB: 1, uLut: 2, uMask: 3 });

/** どのフラグメントにも在る共通 uniform */
export const COMMON_UNIFORMS = Object.freeze([
  { name: "uRes", type: "vec2", note: "描画先の px" },
  { name: "uTexRes", type: "vec2", note: "主テクスチャの px" },
  { name: "uTime", type: "float", note: "秒" },
  { name: "uOpacity", type: "float", note: "0..1" },
  { name: "uP", type: "float", note: "遷移の進捗 0..1" },
]);

/** VS_QUAD の uniform */
export const VERTEX_UNIFORMS = Object.freeze([
  { name: "uModel", type: "mat3", note: "単位四角 [0,1]^2 → クリップ空間" },
  { name: "uFlip", type: "vec2", note: "各成分 0 or 1。uv を左右/上下に反転" },
]);

/** fsLayer が使う uniform（カラー以外）。型は compositor が詰めるときの契約 */
export const LAYER_UNIFORMS = Object.freeze([
  { name: "uCrop", type: "vec4", size: 1, note: "crop の l,t,r,b（0..1）。外は alpha 0" },
  { name: "uChromaKey", type: "vec3", size: 1 }, { name: "uChromaSim", type: "float", size: 1 },
  { name: "uChromaSmooth", type: "float", size: 1 }, { name: "uChromaSpill", type: "float", size: 1 },
  { name: "uMaskType", type: "float", size: 1, note: "0:rect 1:ellipse 2:polygon 3:linear 4:radial" },
  { name: "uMaskRect", type: "vec4", size: 1, note: "x,y,w,h" },
  { name: "uMaskRotate", type: "float", size: 1, note: "度" },
  { name: "uMaskFeather", type: "float", size: 1 }, { name: "uMaskExpand", type: "float", size: 1 },
  { name: "uMaskInvert", type: "float", size: 1, note: "0 or 1" },
  { name: "uMaskPoints", type: "vec2", size: 16, note: "polygon 用" },
  { name: "uMaskCount", type: "float", size: 1, note: "polygon の頂点数" },
  { name: "uMaskUseTex", type: "float", size: 1, note: "1 で uMask テクスチャを使う" },
  { name: "uMaskChannel", type: "float", size: 1, note: "0:alpha 1:red" },
]);

/** 1 次元カーブ LUT の段数（契約: float[16]） */
export const CURVE_SIZE = 16;
/** HSL の帯域数（契約: 6 帯域） */
export const HSL_BANDS = 6;
/** polygon マスクの頂点上限 */
export const MASK_POINTS = 16;

/* ══════════════════════════════════════════════════════════════════════
   GRADE_UNIFORMS — カラー uniform の表（**これが compositor との契約**）

   compositor は ColorGrade（契約書 §1）を見て、この表の name に値を詰める。
   ・type  … GLSL の型（"float" | "vec2" | "vec3"）
   ・size  … 配列の要素数（1 は配列でない）
   ・key   … ColorGrade 側の在処。"hsl[].h" は hsl 配列の各要素の h。
   ・def   … 何も無いときに詰める値（= 効果なし）
   uniform の宣言文はこの表から自動生成する（表と GLSL は絶対にずれない）。
   ══════════════════════════════════════════════════════════════════════ */

const RAMP16 = Object.freeze(Array.from({ length: CURVE_SIZE }, (_v, i) => i / (CURVE_SIZE - 1)));
const ZERO6 = Object.freeze([0, 0, 0, 0, 0, 0]);
const RANGE6 = Object.freeze([30, 30, 30, 30, 30, 30]);
const SHIFT6 = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** @type {ReadonlyArray<{name:string,type:string,size:number,key:(string|null),def:any}>} */
export const GRADE_UNIFORMS = Object.freeze([
  /* 数値 1 個の物（ColorGrade のキーと 1 対 1） */
  { name: "uGradeExposure", type: "float", size: 1, key: "exposure", def: 0 },
  { name: "uGradeContrast", type: "float", size: 1, key: "contrast", def: 0 },
  { name: "uGradeSaturation", type: "float", size: 1, key: "saturation", def: 0 },
  { name: "uGradeTemperature", type: "float", size: 1, key: "temperature", def: 0 },
  { name: "uGradeTint", type: "float", size: 1, key: "tint", def: 0 },
  { name: "uGradeHighlights", type: "float", size: 1, key: "highlights", def: 0 },
  { name: "uGradeShadows", type: "float", size: 1, key: "shadows", def: 0 },
  { name: "uGradeWhites", type: "float", size: 1, key: "whites", def: 0 },
  { name: "uGradeBlacks", type: "float", size: 1, key: "blacks", def: 0 },
  { name: "uGradeVibrance", type: "float", size: 1, key: "vibrance", def: 0 },
  { name: "uGradeHue", type: "float", size: 1, key: "hue", def: 0 },
  { name: "uGradeSharpen", type: "float", size: 1, key: "sharpen", def: 0 },
  { name: "uGradeDenoise", type: "float", size: 1, key: "denoise", def: 0 },
  { name: "uGradeVignette", type: "float", size: 1, key: "vignette", def: 0 },
  { name: "uGradeGrain", type: "float", size: 1, key: "grain", def: 0 },
  { name: "uGradeFade", type: "float", size: 1, key: "fade", def: 0 },
  /* カーブ（4 点の制御点 → 16 段の 1 次元 LUT。curveLut16() で作る） */
  { name: "uCurveLuma", type: "float", size: CURVE_SIZE, key: "curves.luma", def: RAMP16 },
  { name: "uCurveRGB", type: "float", size: CURVE_SIZE, key: "curves.rgb", def: RAMP16 },
  { name: "uCurveR", type: "float", size: CURVE_SIZE, key: "curves.r", def: RAMP16 },
  { name: "uCurveG", type: "float", size: CURVE_SIZE, key: "curves.g", def: RAMP16 },
  { name: "uCurveB", type: "float", size: CURVE_SIZE, key: "curves.b", def: RAMP16 },
  /* カラーホイール（lift/gamma/gain/offset は ±0.5 くらいの範囲で使う） */
  { name: "uWheelLift", type: "vec3", size: 1, key: "wheels.lift", def: [0, 0, 0] },
  { name: "uWheelGamma", type: "vec3", size: 1, key: "wheels.gamma", def: [0, 0, 0] },
  { name: "uWheelGain", type: "vec3", size: 1, key: "wheels.gain", def: [0, 0, 0] },
  { name: "uWheelOffset", type: "vec3", size: 1, key: "wheels.offset", def: [0, 0, 0] },
  /* HSL 6 帯域（hue は度・range は片側の幅・shift は h(度) s l） */
  { name: "uHslHue", type: "float", size: HSL_BANDS, key: "hsl[].hue", def: ZERO6 },
  { name: "uHslRange", type: "float", size: HSL_BANDS, key: "hsl[].range", def: RANGE6 },
  { name: "uHslShift", type: "vec3", size: HSL_BANDS, key: "hsl[].h,s,l", def: SHIFT6 },
  /* 3D LUT（テクスチャ本体は単位 2 の uLut。寸法は uploadLUT が返す） */
  { name: "uLutAmount", type: "float", size: 1, key: "lut.amount", def: 0 },
  { name: "uLutSize", type: "float", size: 1, key: null, def: 33 },
  { name: "uLutTiles", type: "vec2", size: 1, key: null, def: [6, 6] },
]);

/** 名前だけの一覧（試験と compositor の照合用） */
export const GRADE_UNIFORM_NAMES = Object.freeze(GRADE_UNIFORMS.map((u) => u.name));

/** 名前 → 定義の引き（compositor が型を見るとき用） */
export const GRADE_UNIFORM_BY_NAME = Object.freeze(
  GRADE_UNIFORMS.reduce((m, u) => { m[u.name] = u; return m; }, Object.create(null))
);

/** 効果なしの状態（compositor が「カラー無し」のときそのまま詰められる） */
export function gradeDefaults() {
  const out = Object.create(null);
  for (const u of GRADE_UNIFORMS) out[u.name] = Array.isArray(u.def) ? u.def.slice() : u.def;
  return out;
}

/**
 * 制御点（[[x,y],…] 0..1）を 16 段の 1 次元 LUT に均す。
 * CONTRACT-NOTE: 契約書には無い純関数だが、curves の uniform を作る所が
 *   無いと compositor が独自実装を持ってしまい、ここの段数（16）とずれる。
 *   gl を触らない純関数なので shaders.js に置いても試験できる。
 * @param {Array<[number,number]>|null|undefined} points
 * @returns {number[]} 長さ 16（何も無ければ恒等）
 */
export function curveLut16(points) {
  const out = new Array(CURVE_SIZE);
  const pts = Array.isArray(points)
    ? points
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))])
      .sort((a, b) => a[0] - b[0])
    : [];
  if (pts.length < 2) { for (let i = 0; i < CURVE_SIZE; i++) out[i] = i / (CURVE_SIZE - 1); return out; }
  for (let i = 0; i < CURVE_SIZE; i++) {
    const x = i / (CURVE_SIZE - 1);
    let j = 0;
    while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
    const [x0, y0] = pts[j];
    const [x1, y1] = pts[j + 1];
    const d = x1 - x0;
    const t = d <= 1e-6 ? 0 : Math.min(1, Math.max(0, (x - x0) / d));
    /* 端の外は最も近い制御点で止める（行き過ぎて色が飛ぶのを防ぐ） */
    out[i] = x <= x0 ? y0 : x >= x1 ? y1 : y0 + (y1 - y0) * t;
  }
  return out;
}

/** 恒等カーブ（16 段） */
export function identityCurve16() { return RAMP16.slice(); }

/** GRADE_UNIFORMS の 1 行を GLSL の宣言文にする */
function declOf(u) {
  return u.size > 1
    ? `uniform ${u.type} ${u.name}[${u.size}];`
    : `uniform ${u.type} ${u.name};`;
}

/* ══════════════════════════════════════════════════════════════════════
   CHUNKS — GLSL の断片（**関数定義のみ**）

   uniform はここでは宣言しない。必要な値は必ず引数で受ける。
   （こうしておくと fsLayer が「どの uniform を使ったか」を自分で決められ、
     fx/遷移の作者も好きな所から呼べる）
   ══════════════════════════════════════════════════════════════════════ */

const C_COMMON = `
/* ── 共通の小道具 ───────────────────────────────────────────── */
float lumaOf(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float lumaBt601(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 safePow(vec3 c, vec3 e){ return pow(max(c, vec3(0.0)), max(e, vec3(1e-4))); }
float hueDist(float a, float b){ float d = abs(a - b); return min(d, 360.0 - d); }
/* smoothstep は edge0 >= edge1 だと未定義なので必ずこれを通す */
float softEdge(float e0, float e1, float x){ return smoothstep(min(e0, e1 - 1e-5), max(e1, e0 + 1e-5), x); }
vec4 premul(vec4 c){ return vec4(c.rgb * c.a, c.a); }
vec4 unpremul(vec4 c){ return vec4(c.rgb / max(c.a, 1e-4), c.a); }
/* crop は「切り取り」。四角の外を alpha 0 にする（1 texel だけ滑らかに） */
float cropMask(vec2 uv, vec4 crop, vec2 res){
  vec2 s = 1.0 / max(res, vec2(2.0));
  float l = softEdge(crop.x - s.x, crop.x + s.x, uv.x);
  float r = 1.0 - softEdge(1.0 - crop.z - s.x, 1.0 - crop.z + s.x, uv.x);
  float t = softEdge(crop.y - s.y, crop.y + s.y, uv.y);
  float b = 1.0 - softEdge(1.0 - crop.w - s.y, 1.0 - crop.w + s.y, uv.y);
  return clamp(l * r * t * b, 0.0, 1.0);
}`;

const C_SRGB = `
/* ── sRGB ↔ linear（v1 では使わない。必要になったときの入口） ── */
vec3 srgbToLinear(vec3 c){ return safePow(c, vec3(2.2)); }
vec3 linearToSrgb(vec3 c){ return safePow(c, vec3(1.0 / 2.2)); }`;

const C_NOISE = `
/* ── 乱数と値ノイズ（粒子・グリッチ・遷移で使う） ─────────── */
float hash12(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 hash22(vec2 p){ return vec2(hash12(p), hash12(p + vec2(17.13, 5.71))); }
float valueNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += valueNoise(p) * a; p *= 2.02; a *= 0.5; }
  return s;
}`;

const C_BLEND = `
/* ── ブレンド（契約書 §1 の Clip.blend と対応。b=下, s=上） ── */
vec3 blendNormal(vec3 b, vec3 s){ return s; }
vec3 blendAdd(vec3 b, vec3 s){ return min(b + s, vec3(1.0)); }
vec3 blendScreen(vec3 b, vec3 s){ return vec3(1.0) - (vec3(1.0) - b) * (vec3(1.0) - s); }
vec3 blendMultiply(vec3 b, vec3 s){ return b * s; }
vec3 blendOverlay(vec3 b, vec3 s){
  return mix(2.0 * b * s, vec3(1.0) - 2.0 * (vec3(1.0) - b) * (vec3(1.0) - s), step(vec3(0.5), b));
}
vec3 blendHardLight(vec3 b, vec3 s){ return blendOverlay(s, b); }
vec3 blendSoftLight(vec3 b, vec3 s){
  vec3 d = mix(sqrt(max(b, vec3(0.0))), ((16.0 * b - vec3(12.0)) * b + vec3(4.0)) * b, step(b, vec3(0.25)));
  return mix(b + (2.0 * s - vec3(1.0)) * (d - b), b - (vec3(1.0) - 2.0 * s) * b * (vec3(1.0) - b), step(s, vec3(0.5)));
}
vec3 blendDifference(vec3 b, vec3 s){ return abs(b - s); }
vec3 blendLighten(vec3 b, vec3 s){ return max(b, s); }
vec3 blendDarken(vec3 b, vec3 s){ return min(b, s); }
vec3 blendColorDodge(vec3 b, vec3 s){ return min(vec3(1.0), b / max(vec3(1.0) - s, vec3(1e-3))); }
vec3 blendColorBurn(vec3 b, vec3 s){ return vec3(1.0) - min(vec3(1.0), (vec3(1.0) - b) / max(s, vec3(1e-3))); }
vec3 blendExclusion(vec3 b, vec3 s){ return b + s - 2.0 * b * s; }
/* 数値で選ぶ版（BLEND_MODES の並び順 = この番号） */
vec3 blendByMode(float mode, vec3 b, vec3 s){
  int m = int(mode + 0.5);
  if (m == 1) return blendAdd(b, s);
  if (m == 2) return blendScreen(b, s);
  if (m == 3) return blendMultiply(b, s);
  if (m == 4) return blendOverlay(b, s);
  if (m == 5) return blendSoftLight(b, s);
  if (m == 6) return blendDifference(b, s);
  if (m == 7) return blendLighten(b, s);
  if (m == 8) return blendDarken(b, s);
  if (m == 9) return blendHardLight(b, s);
  if (m == 10) return blendColorDodge(b, s);
  if (m == 11) return blendColorBurn(b, s);
  if (m == 12) return blendExclusion(b, s);
  return blendNormal(b, s);
}
/* 上(src) を下(base) に載せる。src.a は呼ぶ前に uOpacity を掛けておく */
vec4 composite(vec4 base, vec4 src, vec3 blended){
  float a = src.a + base.a * (1.0 - src.a);
  return vec4(mix(base.rgb, blended, src.a), clamp(a, 0.0, 1.0));
}`;

const C_GRADE = `
/* ── カラー（実用重視の簡易式。順番は fsLayer が決める） ──── */
vec3 applyExposure(vec3 c, float ev){ return c * exp2(ev); }
/* 簡易ホワイトバランス: temp は青↔橙、tint は緑↔マゼンタ */
vec3 applyWhiteBalance(vec3 c, float temp, float tint){
  return c * vec3(1.0 + 0.32 * temp + 0.08 * tint, 1.0 - 0.16 * tint, 1.0 - 0.32 * temp + 0.08 * tint);
}
/* 0.5 を中心に伸ばす（中間の明るさを動かさない） */
vec3 applyContrast(vec3 c, float k){ return (c - vec3(0.5)) * (1.0 + clamp(k, -0.95, 4.0)) + vec3(0.5); }
/* 輝度で重みを付けて明部/暗部だけ動かす */
vec3 applyHighShadow(vec3 c, float hi, float sh){
  float l = lumaOf(c);
  float wh = smoothstep(0.45, 1.0, l);
  float ws = 1.0 - smoothstep(0.0, 0.55, l);
  return c * (1.0 + hi * wh * 0.8) + vec3(sh * ws * 0.35);
}
/* 白点/黒点（レベル補正。+ で明るく） */
vec3 applyWhitesBlacks(vec3 c, float wh, float bl){
  float lo = -bl * 0.22;
  float hi = 1.0 - wh * 0.30;
  return (c - vec3(lo)) / max(hi - lo, 0.05);
}
vec3 applySaturation(vec3 c, float s){ return mix(vec3(lumaOf(c)), c, clamp(1.0 + s, 0.0, 4.0)); }
/* 眠い色ほど強く効かせる（既に濃い色は飛ばさない） */
vec3 applyVibrance(vec3 c, float v){
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float w = 1.0 - clamp(mx - mn, 0.0, 1.0);
  return mix(vec3(lumaOf(c)), c, clamp(1.0 + v * w, 0.0, 4.0));
}
/* 色相回転（feColorMatrix hueRotate と同じ行列） */
vec3 applyHueRotate(vec3 c, float deg){
  float a = radians(deg), s = sin(a), k = cos(a);
  vec3 r = vec3(0.213 + k * 0.787 - s * 0.213, 0.715 - k * 0.715 - s * 0.715, 0.072 - k * 0.072 + s * 0.928);
  vec3 g = vec3(0.213 - k * 0.213 + s * 0.143, 0.715 + k * 0.285 + s * 0.140, 0.072 - k * 0.072 - s * 0.283);
  vec3 b = vec3(0.213 - k * 0.213 - s * 0.787, 0.715 - k * 0.715 + s * 0.715, 0.072 + k * 0.928 + s * 0.072);
  return vec3(dot(c, r), dot(c, g), dot(c, b));
}
/* 褪せ（黒を持ち上げて白を抑える。フィルム風） */
vec3 applyFade(vec3 c, float f){ float k = clamp(f, 0.0, 1.0); return mix(c, c * 0.72 + vec3(0.20), k); }`;

const C_CURVES = `
/* ── カーブ（16 段の 1 次元 LUT を線形補間） ───────────────── */
float curveAt(float x, float lut[16]){
  float p = clamp(x, 0.0, 1.0) * 15.0;
  float f0 = floor(p);
  int i = int(f0);
  return mix(lut[i], lut[min(i + 1, 15)], p - f0);
}
vec3 curveRgb(vec3 c, float lut[16]){ return vec3(curveAt(c.r, lut), curveAt(c.g, lut), curveAt(c.b, lut)); }
vec3 curveSplit(vec3 c, float lr[16], float lg[16], float lb[16]){
  return vec3(curveAt(c.r, lr), curveAt(c.g, lg), curveAt(c.b, lb));
}
/* 輝度カーブは色相を動かさないよう差分で足す */
vec3 curveLumaShift(vec3 c, float lut[16]){ float l = lumaOf(c); return c + vec3(curveAt(l, lut) - l); }`;

const C_WHEELS = `
/* ── カラーホイール（lift=暗部, gamma=中間, gain=明部, offset=全体） ── */
vec3 applyWheels(vec3 c, vec3 lift, vec3 gamma, vec3 gain, vec3 offset){
  vec3 x = c + offset + lift * (vec3(1.0) - c);
  x = safePow(x, vec3(1.0) / max(vec3(1.0) + gamma, vec3(0.05)));
  return x * (vec3(1.0) + gain);
}`;

const C_HSL = `
/* ── HSL 6 帯域（hue の距離で重みを付けて h/s/l を動かす） ── */
float hue2channel(float p, float q, float t){
  float x = fract(t);
  if (x < 1.0 / 6.0) return p + (q - p) * 6.0 * x;
  if (x < 0.5) return q;
  if (x < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - x) * 6.0;
  return p;
}
vec3 rgb2hsl(vec3 c){
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float s = d <= 1e-5 ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0) + 1e-5);
  float h = 0.0;
  if (d > 1e-5){
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h = h / 6.0;
  }
  return vec3(fract(h), clamp(s, 0.0, 1.0), clamp(l, 0.0, 1.0));
}
vec3 hsl2rgb(vec3 hsl){
  if (hsl.y <= 1e-5) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(hue2channel(p, q, hsl.x + 1.0 / 3.0), hue2channel(p, q, hsl.x), hue2channel(p, q, hsl.x - 1.0 / 3.0));
}
vec3 applyHslBands(vec3 c, float centers[6], float ranges[6], vec3 shifts[6]){
  vec3 hsl = rgb2hsl(c);
  float deg = hsl.x * 360.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 6; i++){
    float w = 1.0 - smoothstep(0.0, max(ranges[i], 1.0), hueDist(deg, centers[i]));
    acc += shifts[i] * w;
  }
  hsl.x = fract(hsl.x + acc.x / 360.0);
  hsl.y = clamp(hsl.y * (1.0 + acc.y), 0.0, 1.0);
  hsl.z = clamp(hsl.z + acc.z * 0.5, 0.0, 1.0);
  return hsl2rgb(hsl);
}`;

const C_LUT = `
/* ── 3D LUT（2D タイルに展開した物を引く。寸法は uploadLUT が返す） ── */
vec2 lutCell(float slice, float size, vec2 tiles){
  vec2 t = max(tiles, vec2(1.0));
  return vec2(mod(slice, t.x), floor(slice / t.x)) / t;
}
vec3 lutLookup(sampler2D lut, vec3 c, float size, vec2 tiles){
  vec3 x = clamp(c, 0.0, 1.0);
  float last = max(size - 1.0, 1.0);
  float bz = x.b * last;
  float b0 = floor(bz);
  vec2 texel = vec2(1.0) / (vec2(max(size, 1.0)) * max(tiles, vec2(1.0)));
  vec2 inCell = (x.rg * last + vec2(0.5)) * texel;
  vec3 s0 = texture(lut, lutCell(b0, size, tiles) + inCell).rgb;
  vec3 s1 = texture(lut, lutCell(min(b0 + 1.0, last), size, tiles) + inCell).rgb;
  return mix(s0, s1, bz - b0);
}
vec3 applyLut(sampler2D lut, vec3 c, float amount, float size, vec2 tiles){
  return mix(c, lutLookup(lut, c, size, tiles), clamp(amount, 0.0, 1.0));
}`;

const C_CHROMA = `
/* ── クロマキー（YUV の色差距離。緑以外の色でも効く） ────── */
vec3 rgb2yuvKey(vec3 c){
  float y = lumaBt601(c);
  return vec3(y, (c.b - y) * 0.565, (c.r - y) * 0.713);
}
/* 0 = キー色（抜く）, 1 = 残す */
float chromaMask(vec3 c, vec3 key, float similarity, float smoothness){
  vec3 a = rgb2yuvKey(c);
  vec3 b = rgb2yuvKey(key);
  float d = distance(a.yz, b.yz);
  float lo = max(similarity, 0.0) * 0.5;
  return softEdge(lo, lo + max(smoothness, 1e-3) * 0.5, d);
}
/* 縁に残ったキー色の被り（スピル）を彩度を落として抑える */
vec4 applyChroma(vec4 c, vec3 key, float similarity, float smoothness, float spill){
  float m = chromaMask(c.rgb, key, similarity, smoothness);
  float bias = dot(c.rgb, normalize(max(key, vec3(1e-4))));
  float k = clamp(spill, 0.0, 1.0) * (1.0 - m) * smoothstep(0.15, 0.6, bias);
  vec3 rgb = mix(c.rgb, vec3(lumaOf(c.rgb)), k);
  return vec4(rgb, clamp(c.a * m, 0.0, 1.0));
}`;

const C_MASK = `
/* ── マスク（rect/ellipse/polygon/linear/radial） ──────────── */
vec2 maskLocal(vec2 uv, vec2 center, float deg){
  float a = radians(deg), s = sin(a), k = cos(a);
  vec2 p = uv - center;
  return vec2(p.x * k + p.y * s, -p.x * s + p.y * k);
}
float maskRect(vec2 uv, vec4 rect, float rot, float feather, float expand){
  vec2 hw = max(rect.zw * 0.5 + vec2(expand), vec2(1e-4));
  vec2 p = abs(maskLocal(uv, rect.xy, rot));
  float f = max(feather, 1e-4);
  float ex = 1.0 - softEdge(hw.x - f, hw.x + f, p.x);
  float ey = 1.0 - softEdge(hw.y - f, hw.y + f, p.y);
  return ex * ey;
}
float maskEllipse(vec2 uv, vec4 rect, float rot, float feather, float expand){
  vec2 r = max(rect.zw * 0.5 + vec2(expand), vec2(1e-4));
  float d = length(maskLocal(uv, rect.xy, rot) / r);
  float f = max(feather, 1e-4) / max(min(r.x, r.y), 1e-4);
  return 1.0 - softEdge(1.0 - f, 1.0 + f, d);
}
float maskLinear(vec2 uv, vec4 rect, float rot, float feather){
  float y = maskLocal(uv, rect.xy, rot).y;
  float f = max(feather, 1e-4);
  return 1.0 - softEdge(-f, f, y);
}
float maskRadial(vec2 uv, vec4 rect, float rot, float feather, float expand){
  vec2 r = max(rect.zw * 0.5 + vec2(expand), vec2(1e-4));
  float d = length(maskLocal(uv, rect.xy, rot) / r);
  return 1.0 - clamp((d - (1.0 - max(feather, 1e-4) * 4.0)) / max(feather * 4.0, 1e-4), 0.0, 1.0);
}
/* polygon は符号付き距離（内側で負）。頂点は最大 16 */
float maskPolygon(vec2 uv, vec2 pts[16], float count, float feather){
  int n = int(clamp(count, 3.0, 16.0));
  float d = 1e9, sgn = 1.0;
  for (int i = 0; i < 16; i++){
    if (i >= n) break;
    int j = i == 0 ? n - 1 : i - 1;
    vec2 a = pts[i], e = pts[j] - pts[i], w = uv - pts[i];
    float t = clamp(dot(w, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    d = min(d, length(w - e * t));
    bvec3 cond = bvec3(uv.y >= a.y, uv.y < pts[j].y, e.x * w.y > e.y * w.x);
    if (all(cond) || all(not(cond))) sgn = -sgn;
  }
  float f = max(feather, 1e-4);
  return 1.0 - softEdge(-f, f, d * sgn);
}
float maskValue(float type, vec2 uv, vec4 rect, float rot, float feather, float expand, vec2 pts[16], float count){
  float m = 1.0;
  if (type < 0.5) m = maskRect(uv, rect, rot, feather, expand);
  else if (type < 1.5) m = maskEllipse(uv, rect, rot, feather, expand);
  else if (type < 2.5) m = maskPolygon(uv, pts, count, feather);
  else if (type < 3.5) m = maskLinear(uv, rect, rot, feather);
  else m = maskRadial(uv, rect, rot, feather, expand);
  return clamp(m, 0.0, 1.0);
}
/* 焼き込んだマスク画像から読む（channel 0=alpha, 1=red） */
float maskFromTex(sampler2D t, vec2 uv, float channel){
  vec4 s = texture(t, uv);
  return clamp(mix(s.a, s.r, clamp(channel, 0.0, 1.0)), 0.0, 1.0);
}`;

const C_BLUR = `
/* ── ぼかし（分離ガウス。dir に texel * 方向を渡す） ───────── */
vec4 blurPass(sampler2D t, vec2 uv, vec2 dir, float radius){
  vec2 o1 = dir * radius * 1.3846153846;
  vec2 o2 = dir * radius * 3.2307692308;
  vec4 sum = texture(t, uv) * 0.2270270270;
  sum += (texture(t, uv + o1) + texture(t, uv - o1)) * 0.3162162162;
  sum += (texture(t, uv + o2) + texture(t, uv - o2)) * 0.0702702703;
  return sum;
}
/* 1 パスで済ませたいとき用の粗い箱ぼかし（3x3） */
vec4 boxBlur3(sampler2D t, vec2 uv, vec2 texel, float radius){
  vec4 sum = vec4(0.0);
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      sum += texture(t, uv + vec2(float(x), float(y)) * texel * radius);
    }
  }
  return sum / 9.0;
}`;

const C_SHARPEN = `
/* ── 先鋭化と簡易ノイズ除去（3x3 のバイラテラル近似） ─────── */
/* 差分だけ返す。カラー補正の後に足せるようにするため */
vec3 sharpenDelta(sampler2D t, vec2 uv, vec2 texel, float amount){
  if (amount <= 0.0) return vec3(0.0);
  vec3 c = texture(t, uv).rgb;
  vec3 s = texture(t, uv + vec2(texel.x, 0.0)).rgb + texture(t, uv - vec2(texel.x, 0.0)).rgb
         + texture(t, uv + vec2(0.0, texel.y)).rgb + texture(t, uv - vec2(0.0, texel.y)).rgb;
  return (c * 4.0 - s) * clamp(amount, 0.0, 2.0) * 0.5;
}
vec3 sharpenAt(sampler2D t, vec2 uv, vec2 texel, float amount){
  return texture(t, uv).rgb + sharpenDelta(t, uv, texel, amount);
}
vec3 denoiseAt(sampler2D t, vec2 uv, vec2 texel, float amount){
  vec3 c0 = texture(t, uv).rgb;
  if (amount <= 0.0) return c0;
  float k = clamp(amount, 0.0, 1.0);
  float sigma = mix(0.10, 0.45, k);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec3 s = texture(t, uv + vec2(float(x), float(y)) * texel).rgb;
      vec3 dd = s - c0;
      float w = exp(-dot(dd, dd) / max(sigma * sigma, 1e-5));
      acc += s * w;
      wsum += w;
    }
  }
  return mix(c0, acc / max(wsum, 1e-5), k);
}`;

const C_VIGNETTE = `
/* ── 周辺光量（+ で暗く、- で明るく） ─────────────────────── */
float vignetteAmount(vec2 uv, float amount){
  float a = clamp(amount, -1.0, 1.0);
  float d = length((uv - vec2(0.5)) * 2.0) * 0.7071068;
  float v = 1.0 - smoothstep(0.35, 1.0, d) * abs(a);
  return a >= 0.0 ? v : 2.0 - v;
}
vec3 applyVignette(vec3 c, vec2 uv, float amount){ return c * vignetteAmount(uv, amount); }`;

const C_GRAIN = `
/* ── 粒子（暗部に多めに乗せる。res は描画先 px なので拡縮で粒が変わらない） ── */
vec3 applyGrain(vec3 c, vec2 uv, float t, float amount, vec2 res){
  float k = clamp(amount, 0.0, 1.0);
  if (k <= 0.0) return c;
  float n = hash12(floor(uv * max(res, vec2(1.0))) + vec2(fract(t) * 37.0, fract(t * 0.7) * 17.0));
  float w = 1.0 - lumaOf(c) * 0.6;
  return c + vec3((n - 0.5) * k * 0.35 * w);
}`;

/** GLSL の断片（関数定義のみ）。名前は契約書の一覧どおり */
export const CHUNKS = Object.freeze({
  common: C_COMMON,
  srgb: C_SRGB,
  colorGrade: C_GRADE,
  curves: C_CURVES,
  wheels: C_WHEELS,
  hsl: C_HSL,
  lut: C_LUT,
  chroma: C_CHROMA,
  mask: C_MASK,
  blur: C_BLUR,
  sharpen: C_SHARPEN,
  vignette: C_VIGNETTE,
  grain: C_GRAIN,
  blendModes: C_BLEND,
  noise: C_NOISE,
});

/** 連結するときの順番（前の物だけを呼んで良い） */
const CHUNK_ORDER = Object.freeze([
  "common", "srgb", "noise", "blendModes", "colorGrade", "curves", "wheels",
  "hsl", "lut", "chroma", "mask", "blur", "sharpen", "vignette", "grain",
]);

/** 断片の依存（assemble が自動で足す） */
const CHUNK_DEPS = Object.freeze({
  srgb: ["common"], colorGrade: ["common"], curves: ["common"], wheels: ["common"],
  hsl: ["common"], chroma: ["common"], grain: ["common", "noise"], mask: ["common"],
  lut: [], blur: [], sharpen: [], vignette: [], blendModes: [], noise: [], common: [],
});

/** CHUNKS の名前一覧（試験と fx 作者向け） */
export const CHUNK_NAMES = Object.freeze(CHUNK_ORDER.slice());

/**
 * 断片を依存込みで並べて連結する（重複は 1 度だけ）。
 * fx / 遷移の作者がここを直接呼んで自分用のソースを作っても良い。
 * @param {string[]} names
 * @returns {string}
 */
export function glslChunks(names) {
  const want = new Set();
  const add = (n) => {
    if (!n || want.has(n) || !CHUNKS[n]) return;
    want.add(n);
    for (const d of CHUNK_DEPS[n] || []) add(d);
  };
  for (const n of Array.isArray(names) ? names : []) add(n);
  return CHUNK_ORDER.filter((n) => want.has(n)).map((n) => CHUNKS[n]).join("\n");
}

/* ══════════════════════════════════════════════════════════════════════
   ソースの組み立て
   ══════════════════════════════════════════════════════════════════════ */

const VERSION = "#version 300 es";

/**
 * 頂点シェーダは repo 全体でこれ 1 本（契約）。
 * aPos は単位四角 [0,1]^2。uModel が クリップ空間へ写す。
 * uFlip は uv の反転（x,y それぞれ 0 or 1）— clip の flipH/flipV と
 * テクスチャの上下向きの両方をここで吸収する。
 */
export const VS_QUAD = [
  VERSION,
  "precision highp float;",
  "in vec2 aPos;",
  "out vec2 vUv;",
  "uniform mat3 uModel;",
  "uniform vec2 uFlip;",
  "void main(){",
  "  vUv = mix(aPos, vec2(1.0) - aPos, clamp(uFlip, vec2(0.0), vec2(1.0)));",
  "  gl_Position = vec4((uModel * vec3(aPos, 1.0)).xy, 0.0, 1.0);",
  "}",
  "",
].join("\n");

/** フラグメントの頭（1 行目は必ず #version） */
function fsHead(extra) {
  const lines = [
    VERSION,
    "precision highp float;",
    "precision highp int;",
    "in vec2 vUv;",
    "out vec4 oColor;",
    "uniform vec2 uRes;",
    "uniform vec2 uTexRes;",
    "uniform float uTime;",
    "uniform float uOpacity;",
    "uniform float uP;",
  ];
  for (const e of extra || []) lines.push(e);
  return lines;
}

/** 空行・null を落として 1 本の文字列にする（1 行目が #version のまま） */
function join(lines) {
  return lines.filter((l) => typeof l === "string" && l.length > 0).join("\n") + "\n";
}

const YES = (v, d) => (v === undefined || v === null ? d : !!v);

/**
 * 持ち込まれた GLSL を「関数 1 個」の形に整える。
 * ・既に `<name>(` を含む定義文なら そのまま使う（uniform 宣言を連れていて良い）
 * ・本文だけなら signature で包む。本文中の `uniform …;` の行は
 *   関数の外へ追い出す（GLSL は関数内に uniform を置けない）
 * @param {string} name @param {string} signature
 * @param {string|null|undefined} src @param {string} fallbackBody
 */
function wrapFn(name, signature, src, fallbackBody) {
  const text = typeof src === "string" ? src.trim() : "";
  if (!text) return `${signature} {\n  ${fallbackBody}\n}`;
  if (new RegExp(`\\b${name}\\s*\\(`).test(text) && text.indexOf("{") >= 0) return text;
  const hoisted = [];
  const body = text.replace(/^[ \t]*uniform[^;{}]*;[ \t]*$/gm, (m) => {
    hoisted.push(m.trim());
    return "";
  }).trim();
  const head = hoisted.length > 0 ? hoisted.join("\n") + "\n" : "";
  return `${head}${signature} {\n${body}\n}`;
}

/** 効果 / 遷移が自由に呼んで良い共通関数の出所（registry の作者向け） */
export const FX_CHUNKS = Object.freeze(["common", "srgb", "noise", "blendModes", "blur", "sharpen", "vignette", "grain"]);

/**
 * 層 1 枚を描くフラグメント。
 * 適用の順番は契約どおり「透明度 → crop → mask → chroma → grade → fx」。
 * （透明度と mask は alpha の掛け算なので、色の計算と順番を入れ替えても同じ値になる）
 * @param {{grade?:boolean,curves?:boolean,wheels?:boolean,hsl?:boolean,lut?:boolean,
 *          chroma?:boolean,mask?:boolean,fx?:(string|null)}} [opts]
 * @returns {string}
 */
export function fsLayer(opts) {
  const o = opts || {};
  const grade = YES(o.grade, true);
  const curves = YES(o.curves, false);
  const wheels = YES(o.wheels, false);
  const hsl = YES(o.hsl, false);
  const lut = YES(o.lut, false);
  const chroma = YES(o.chroma, false);
  const mask = YES(o.mask, false);
  const fx = typeof o.fx === "string" && o.fx.trim().length > 0 ? o.fx : null;
  const anyColor = grade || curves || wheels || hsl || lut;

  /* uniform 宣言。カラー系は 1 つでも使うなら表ごと宣言する
     （compositor が「常に表の全部を詰める」で済むように。使われない物は
       リンク時に落ちるので費用はかからない） */
  const decl = ["uniform sampler2D uTex;", "uniform vec4 uCrop;"];
  if (lut) decl.push("uniform sampler2D uLut;");
  if (chroma) {
    decl.push("uniform vec3 uChromaKey;", "uniform float uChromaSim;",
      "uniform float uChromaSmooth;", "uniform float uChromaSpill;");
  }
  if (mask) {
    decl.push("uniform sampler2D uMask;", "uniform float uMaskType;", "uniform vec4 uMaskRect;",
      "uniform float uMaskRotate;", "uniform float uMaskFeather;", "uniform float uMaskExpand;",
      "uniform float uMaskInvert;", `uniform vec2 uMaskPoints[${MASK_POINTS}];`,
      "uniform float uMaskCount;", "uniform float uMaskUseTex;", "uniform float uMaskChannel;");
  }
  if (anyColor) for (const u of GRADE_UNIFORMS) decl.push(declOf(u));

  const need = ["common"];
  if (grade) need.push("colorGrade", "sharpen", "vignette", "grain", "noise");
  if (curves) need.push("curves");
  if (wheels) need.push("wheels");
  if (hsl) need.push("hsl");
  if (lut) need.push("lut");
  if (chroma) need.push("chroma");
  if (mask) need.push("mask");
  if (fx) need.push(...FX_CHUNKS);

  /* カラーの流れ（uniform を読むのはここだけ。順番はこの並びが全て） */
  const pipe = [];
  if (grade) {
    pipe.push("  c = applyExposure(c, uGradeExposure);",
      "  c = applyWhiteBalance(c, uGradeTemperature, uGradeTint);");
  }
  if (wheels) pipe.push("  c = applyWheels(c, uWheelLift, uWheelGamma, uWheelGain, uWheelOffset);");
  if (grade) {
    pipe.push("  c = applyContrast(c, uGradeContrast);",
      "  c = applyHighShadow(c, uGradeHighlights, uGradeShadows);",
      "  c = applyWhitesBlacks(c, uGradeWhites, uGradeBlacks);");
  }
  if (curves) {
    pipe.push("  c = curveLumaShift(c, uCurveLuma);",
      "  c = curveRgb(c, uCurveRGB);",
      "  c = curveSplit(c, uCurveR, uCurveG, uCurveB);");
  }
  if (hsl) pipe.push("  c = applyHslBands(c, uHslHue, uHslRange, uHslShift);");
  if (grade) {
    pipe.push("  c = applySaturation(c, uGradeSaturation);",
      "  c = applyVibrance(c, uGradeVibrance);",
      "  c = applyHueRotate(c, uGradeHue);");
  }
  if (lut) pipe.push("  c = applyLut(uLut, c, uLutAmount, uLutSize, uLutTiles);");
  if (grade) {
    pipe.push("  c = applyFade(c, uGradeFade);",
      "  c = applyVignette(c, uv, uGradeVignette);",
      "  c = applyGrain(c, uv, uTime, uGradeGrain, uRes);");
  }

  const body = [];
  if (anyColor) {
    body.push("vec3 gradePipeline(vec3 c, vec2 uv){", ...pipe, "  return clamp(c, 0.0, 1.0);", "}");
  }
  if (mask) {
    body.push(
      "float layerMask(vec2 uv){",
      "  float shape = maskValue(uMaskType, uv, uMaskRect, uMaskRotate, uMaskFeather, uMaskExpand, uMaskPoints, uMaskCount);",
      "  float m = mix(shape, maskFromTex(uMask, uv, uMaskChannel), clamp(uMaskUseTex, 0.0, 1.0));",
      "  return clamp(mix(m, 1.0 - m, clamp(uMaskInvert, 0.0, 1.0)), 0.0, 1.0);",
      "}");
  }
  if (fx) body.push(wrapFn("fxApply", "vec4 fxApply(vec4 c, vec2 uv)", fx, "return c;"));

  const main = ["void main(){", "  vec2 uv = vUv;", "  vec2 texel = vec2(1.0) / max(uTexRes, vec2(1.0));",
    "  float a = clamp(uOpacity, 0.0, 1.0) * cropMask(uv, uCrop, uTexRes);"];
  if (mask) main.push("  a *= layerMask(uv);");
  main.push("  vec4 c = texture(uTex, uv);");
  if (grade) main.push("  c.rgb = denoiseAt(uTex, uv, texel, uGradeDenoise);");
  if (chroma) main.push("  c = applyChroma(c, uChromaKey, uChromaSim, uChromaSmooth, uChromaSpill);");
  if (anyColor) main.push("  c.rgb = gradePipeline(c.rgb, uv);");
  if (grade) main.push("  c.rgb = clamp(c.rgb + sharpenDelta(uTex, uv, texel, uGradeSharpen), 0.0, 1.0);");
  main.push("  vec4 outColor = vec4(c.rgb, clamp(c.a * a, 0.0, 1.0));");
  if (fx) main.push("  outColor = clamp(fxApply(outColor, uv), 0.0, 1.0);");
  main.push("  oColor = outColor;", "}");

  return join([...fsHead(decl), glslChunks(need), ...body, ...main]);
}

/** blend の名前（blendByMode に渡す番号 = この並び順） */
export const BLEND_MODES = Object.freeze(["normal", "add", "screen", "multiply", "overlay",
  "softlight", "difference", "lighten", "darken", "hardlight", "colordodge", "colorburn", "exclusion"]);

const BLEND_FN = Object.freeze({
  normal: "blendNormal", add: "blendAdd", screen: "blendScreen", multiply: "blendMultiply",
  overlay: "blendOverlay", softlight: "blendSoftLight", difference: "blendDifference",
  lighten: "blendLighten", darken: "blendDarken", hardlight: "blendHardLight",
  colordodge: "blendColorDodge", colorburn: "blendColorBurn", exclusion: "blendExclusion",
});

/** 名前 → GLSL の関数名（知らない名前は null。呼ぶ側が気づけるように） */
export function blendFnName(mode) {
  const k = String(mode === undefined || mode === null ? "" : mode).toLowerCase().replace(/[\s_-]/g, "");
  return BLEND_FN[k] || null;
}

/** 名前 → blendByMode に渡す番号（知らない名前は 0 = normal） */
export function blendModeIndex(mode) {
  const k = String(mode === undefined || mode === null ? "" : mode).toLowerCase().replace(/[\s_-]/g, "");
  const i = BLEND_MODES.indexOf(k);
  return i < 0 ? 0 : i;
}

/**
 * 2 枚を合成する（uTex = 下, uTexB = 上, uOpacity = 上の不透明度）。
 * 知らない mode は normal に落とす（保存形式が古くても画面が黒くならない方を選ぶ）。
 * @param {string} mode @returns {string}
 */
export function fsBlend(mode) {
  const fn = blendFnName(mode) || "blendNormal";
  return join([
    ...fsHead(["uniform sampler2D uTex;", "uniform sampler2D uTexB;"]),
    glslChunks(["common", "blendModes"]),
    "void main(){",
    "  vec4 b = texture(uTex, vUv);",
    "  vec4 s = texture(uTexB, vUv);",
    "  s.a = clamp(s.a * clamp(uOpacity, 0.0, 1.0), 0.0, 1.0);",
    `  oColor = composite(b, s, ${fn}(clamp(b.rgb, 0.0, 1.0), clamp(s.rgb, 0.0, 1.0)));`,
    "}",
  ]);
}

/**
 * 遷移 1 段。trApply(uv, p) を差し込む（uTex = 遷移元 A, uTexB = 遷移先 B）。
 * 本文だけ渡しても良い（uniform 宣言の行は自動で外へ出す）。
 * @param {string|null} trApplyBody @returns {string}
 */
export function fsTransition(trApplyBody) {
  return join([
    ...fsHead(["uniform sampler2D uTex;", "uniform sampler2D uTexB;"]),
    glslChunks(FX_CHUNKS),
    wrapFn("trApply", "vec4 trApply(vec2 uv, float p)", trApplyBody,
      "return mix(texture(uTex, uv), texture(uTexB, uv), p);"),
    "void main(){",
    "  vec4 c = trApply(vUv, clamp(uP, 0.0, 1.0));",
    "  c.a *= clamp(uOpacity, 0.0, 1.0);",
    "  oColor = clamp(c, 0.0, 1.0);",
    "}",
  ]);
}

/**
 * 効果 1 段（FBO ピンポンの 1 パス）。fxApply(c, uv) を差し込む。
 * 追加 uniform は必ず uFx_<paramKey> という名前にする（契約）。
 * @param {string|null} fxApplyBody @returns {string}
 */
export function fsEffect(fxApplyBody) {
  return join([
    ...fsHead(["uniform sampler2D uTex;"]),
    glslChunks(FX_CHUNKS),
    wrapFn("fxApply", "vec4 fxApply(vec4 c, vec2 uv)", fxApplyBody, "return c;"),
    "void main(){",
    "  vec4 c = texture(uTex, vUv);",
    "  c.a *= clamp(uOpacity, 0.0, 1.0);",
    "  oColor = clamp(fxApply(c, vUv), 0.0, 1.0);",
    "}",
  ]);
}

/** ただの複写（blit / 画質を落とした下げ描き / 最終出力に使う） */
export function fsCopy() {
  return join([
    ...fsHead(["uniform sampler2D uTex;"]),
    "void main(){",
    "  vec4 c = texture(uTex, vUv);",
    "  oColor = vec4(c.rgb, clamp(c.a * clamp(uOpacity, 0.0, 1.0), 0.0, 1.0));",
    "}",
  ]);
}

/**
 * 分離ガウスの 1 方向（"h" 横 / "v" 縦）。半径は uRadius（px）。
 * 2 回（h → v）掛けて 1 枚のぼかしにする。
 * @param {"h"|"v"|"x"|"y"|0|1} dir @returns {string}
 */
export function fsGauss(dir) {
  const d = String(dir === undefined || dir === null ? "h" : dir).toLowerCase();
  const vert = d === "v" || d === "y" || d === "1";
  return join([
    ...fsHead(["uniform sampler2D uTex;", "uniform float uRadius;"]),
    glslChunks(["blur"]),
    "void main(){",
    "  vec2 texel = vec2(1.0) / max(uTexRes, vec2(1.0));",
    `  vec2 dir = vec2(${vert ? "0.0, 1.0" : "1.0, 0.0"}) * texel;`,
    "  oColor = blurPass(uTex, vUv, dir, max(uRadius, 0.0));",
    "}",
  ]);
}

/** 波形/ベクトル/ヒストグラムの種類 */
export const SCOPE_KINDS = Object.freeze(["histogram", "waveform", "vector"]);

/**
 * スコープ（測定器）。素材を粗い格子で読み取って数える。
 * uScopeSamples = 片辺の読み取り数（4..48）、uScopeGain = 縦の倍率。
 * CONTRACT-NOTE: 断片シェーダでは書き込み先を散らせないので「出力画素ごとに
 *   素材を数え直す」形にした。精度より軽さを取った v1 の作り。
 * @param {"histogram"|"waveform"|"vector"} kind @returns {string}
 */
export function fsScopes(kind) {
  const k = SCOPE_KINDS.indexOf(String(kind || "")) >= 0 ? String(kind) : "histogram";
  const head = fsHead(["uniform sampler2D uTex;", "uniform float uScopeSamples;", "uniform float uScopeGain;"]);
  if (k === "waveform") {
    return join([...head, glslChunks(["common"]),
      "void main(){",
      "  float n = clamp(uScopeSamples, 4.0, 64.0);",
      "  int rows = int(n);",
      "  float v = 1.0 - vUv.y;",
      "  vec3 hit = vec3(0.0);",
      "  for (int i = 0; i < 64; i++){",
      "    if (i >= rows) break;",
      "    vec3 c = clamp(texture(uTex, vec2(vUv.x, (float(i) + 0.5) / n)).rgb, 0.0, 1.0);",
      "    hit += vec3(1.0) - smoothstep(vec3(0.0), vec3(0.03), abs(c - vec3(v)));",
      "  }",
      "  oColor = vec4(clamp(hit / n * max(uScopeGain, 0.0) * 3.0, 0.0, 1.0), 1.0);",
      "}"]);
  }
  if (k === "vector") {
    return join([...head, glslChunks(["common"]),
      "void main(){",
      "  float n = clamp(uScopeSamples, 4.0, 48.0);",
      "  int side = int(n);",
      "  vec2 p = (vUv - vec2(0.5)) * 2.0;",
      "  float acc = 0.0;",
      "  for (int y = 0; y < 48; y++){",
      "    if (y >= side) break;",
      "    for (int x = 0; x < 48; x++){",
      "      if (x >= side) break;",
      "      vec3 c = clamp(texture(uTex, (vec2(float(x), float(y)) + vec2(0.5)) / n).rgb, 0.0, 1.0);",
      "      float l = lumaBt601(c);",
      "      acc += 1.0 - smoothstep(0.0, 0.06, distance(vec2((c.b - l) * 1.772, (l - c.r) * 1.402), p));",
      "    }",
      "  }",
      "  float g = clamp(acc / (n * n) * max(uScopeGain, 0.0) * 40.0, 0.0, 1.0);",
      "  oColor = vec4(vec3(g) * vec3(0.55, 1.0, 0.75), 1.0);",
      "}"]);
  }
  return join([...head, glslChunks(["common"]),
    "void main(){",
    "  float n = clamp(uScopeSamples, 4.0, 48.0);",
    "  int side = int(n);",
    "  vec3 count = vec3(0.0);",
    "  for (int y = 0; y < 48; y++){",
    "    if (y >= side) break;",
    "    for (int x = 0; x < 48; x++){",
    "      if (x >= side) break;",
    "      vec3 c = clamp(texture(uTex, (vec2(float(x), float(y)) + vec2(0.5)) / n).rgb, 0.0, 1.0);",
    "      count += vec3(1.0) - smoothstep(vec3(0.0), vec3(1.0 / 128.0), abs(c - vec3(vUv.x)));",
    "    }",
    "  }",
    "  vec3 h = clamp(count / (n * n) * max(uScopeGain, 0.0) * 24.0, 0.0, 1.0);",
    "  oColor = vec4(step(vec3(1.0 - vUv.y), h), 1.0);",
    "}"]);
}
