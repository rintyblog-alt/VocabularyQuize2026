/* ══════════════════════════════════════════════════════════════════════
   tests/shaders.test.mjs — engine/gl/shaders.js の試験（node --test）

   WebGL はここでは動かせない。だから「GLSL コンパイラに渡す前に機械で
   分かる事」を全部ここで潰す。実機で落ちる原因の大半はこれで消える。

   1) 1 行目が "#version 300 es"（前に空行が 1 つでも在ると GLSL が拒む）
   2) "out vec4 oColor" が ちょうど 1 つ（複数出力は契約違反）
   3) 波括弧・丸括弧の対応が取れている（文字列の切り貼りで崩れやすい）
   4) **未定義の関数を呼んでいない**（CHUNKS に定義が在る名前だけを呼ぶ）
      → fsLayer は全組合せ（2^7 = 128 通り）を総当たりで検める
   5) GRADE_UNIFORMS の全名が fsLayer のソースに現れる（compositor との契約）
   6) 関数と uniform の二重定義が無い（chunk の重複除去が効いている）
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VS_QUAD, CHUNKS, CHUNK_NAMES, glslChunks,
  fsLayer, fsBlend, fsTransition, fsEffect, fsCopy, fsGauss, fsScopes,
  GRADE_UNIFORMS, GRADE_UNIFORM_NAMES, GRADE_UNIFORM_BY_NAME, gradeDefaults,
  curveLut16, identityCurve16, CURVE_SIZE, HSL_BANDS, MASK_POINTS,
  BLEND_MODES, blendFnName, blendModeIndex, SCOPE_KINDS,
  TEXTURE_UNITS, COMMON_UNIFORMS, VERTEX_UNIFORMS, LAYER_UNIFORMS, FX_CHUNKS,
} from "../src/engine/gl/shaders.js";

/* ── GLSL ES 3.00 の組み込み（これ以外の呼び出しは定義が要る） ───── */
const TYPES = [
  "float", "int", "uint", "bool", "void",
  "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4", "uvec2", "uvec3", "uvec4",
  "bvec2", "bvec3", "bvec4", "mat2", "mat3", "mat4",
  "mat2x2", "mat2x3", "mat2x4", "mat3x2", "mat3x3", "mat3x4", "mat4x2", "mat4x3", "mat4x4",
];
const BUILTIN = new Set([
  ...TYPES,
  /* 制御構文（name( の形で引っかかるので除外する） */
  "if", "for", "while", "switch", "return", "do", "else",
  /* 数学 */
  "radians", "degrees", "sin", "cos", "tan", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt",
  "abs", "sign", "floor", "trunc", "round", "roundEven", "ceil", "fract", "mod", "modf",
  "min", "max", "clamp", "mix", "step", "smoothstep", "isnan", "isinf",
  "floatBitsToInt", "floatBitsToUint", "intBitsToFloat", "uintBitsToFloat",
  "packSnorm2x16", "unpackSnorm2x16", "packUnorm2x16", "unpackUnorm2x16",
  "packHalf2x16", "unpackHalf2x16",
  /* 幾何・行列・ベクトル */
  "length", "distance", "dot", "cross", "normalize", "faceforward", "reflect", "refract",
  "matrixCompMult", "outerProduct", "transpose", "determinant", "inverse",
  "lessThan", "lessThanEqual", "greaterThan", "greaterThanEqual", "equal", "notEqual",
  "any", "all", "not",
  /* テクスチャ */
  "textureSize", "texture", "textureProj", "textureLod", "textureOffset", "texelFetch",
  "texelFetchOffset", "textureProjOffset", "textureLodOffset", "textureProjLod",
  "textureProjLodOffset", "textureGrad", "textureGradOffset", "textureProjGrad",
  "textureProjGradOffset", "dFdx", "dFdy", "fwidth",
  /* 入口 */
  "main",
]);

/** 定義されている関数名（行頭の「型 名前(」だけを拾う） */
const DEF_RE = new RegExp(`(?:^|\\n)[ \\t]*(?:${TYPES.join("|")})[ \\t]+([A-Za-z_]\\w*)[ \\t]*\\(`, "g");
function definedFns(src) {
  const out = [];
  DEF_RE.lastIndex = 0;
  let m = DEF_RE.exec(src);
  while (m) { out.push(m[1]); m = DEF_RE.exec(src); }
  return out;
}
/** 呼んでいる名前（「名前(」の形を全部） */
function calledFns(src) {
  const out = new Set();
  const re = /([A-Za-z_]\w*)[ \t]*\(/g;
  let m = re.exec(src);
  while (m) { out.add(m[1]); m = re.exec(src); }
  return out;
}
/** CHUNKS 側に定義が在る名前（+ 生成側が自分で作る関数） */
const CHUNK_FNS = new Set([
  ...CHUNK_NAMES.flatMap((n) => definedFns(CHUNKS[n])),
  "gradePipeline", "layerMask", "fxApply", "trApply", "main",
]);

function countOf(src, needle) { return src.split(needle).length - 1; }

/** どのソースにも共通で通す検め */
function checkSource(name, src, { fragment = true } = {}) {
  assert.equal(typeof src, "string", `${name}: 文字列でない`);
  assert.ok(src.startsWith("#version 300 es\n"), `${name}: 1 行目が #version 300 es でない`);
  assert.equal(countOf(src, "#version"), 1, `${name}: #version が 1 つでない`);
  assert.equal(countOf(src, "{"), countOf(src, "}"), `${name}: 波括弧の数が合わない`);
  assert.equal(countOf(src, "("), countOf(src, ")"), `${name}: 丸括弧の数が合わない`);
  assert.equal(countOf(src, "out vec4 oColor"), fragment ? 1 : 0, `${name}: out vec4 oColor の数`);
  if (fragment) assert.ok(/precision highp float;/.test(src), `${name}: precision が無い`);
  /* JS の値が文字列に漏れていないか（テンプレートの事故を拾う） */
  for (const bad of ["undefined", "null", "NaN", "[object"]) {
    assert.ok(!src.includes(bad), `${name}: "${bad}" が漏れている`);
  }
  /* 関数の二重定義が無い */
  const defs = definedFns(src);
  assert.equal(new Set(defs).size, defs.length, `${name}: 関数が二重定義されている`);
  /* uniform の二重宣言が無い */
  const us = (src.match(/^uniform\s+\w+\s+(\w+)/gm) || []).map((s) => s.trim());
  assert.equal(new Set(us).size, us.length, `${name}: uniform が二重宣言されている`);
  /* 未定義の関数を呼んでいない */
  const known = new Set([...BUILTIN, ...defs]);
  for (const c of calledFns(src)) {
    assert.ok(known.has(c), `${name}: 定義の無い関数 ${c}() を呼んでいる`);
    if (!BUILTIN.has(c)) {
      assert.ok(CHUNK_FNS.has(c), `${name}: ${c}() は CHUNKS の外で定義されている`);
    }
  }
  return src;
}

/* ── 頂点シェーダ ───────────────────────────────────────────── */

test("VS_QUAD: 契約どおりの 1 本", () => {
  checkSource("VS_QUAD", VS_QUAD, { fragment: false });
  assert.ok(VS_QUAD.includes("in vec2 aPos;"));
  assert.ok(VS_QUAD.includes("out vec2 vUv;"));
  assert.ok(VS_QUAD.includes("uniform mat3 uModel;"));
  assert.ok(VS_QUAD.includes("uniform vec2 uFlip;"));
  assert.ok(VS_QUAD.includes("gl_Position = vec4((uModel * vec3(aPos, 1.0)).xy, 0.0, 1.0);"));
});

/* ── CHUNKS ─────────────────────────────────────────────────── */

test("CHUNKS: 契約の名前が全部在り、関数定義だけを持つ", () => {
  const want = ["common", "srgb", "colorGrade", "curves", "wheels", "hsl", "lut", "chroma",
    "mask", "blur", "sharpen", "vignette", "grain", "blendModes", "noise"];
  for (const k of want) {
    assert.equal(typeof CHUNKS[k], "string", `CHUNKS.${k} が無い`);
    assert.ok(CHUNKS[k].length > 0, `CHUNKS.${k} が空`);
    /* 断片に uniform / in / out を置かない（fsLayer 側が決めるため） */
    assert.ok(!/^\s*uniform\s/m.test(CHUNKS[k]), `CHUNKS.${k} に uniform が在る`);
    assert.ok(!/^\s*(in|out)\s+\w+\s/m.test(CHUNKS[k]), `CHUNKS.${k} に in/out が在る`);
    assert.ok(definedFns(CHUNKS[k]).length > 0, `CHUNKS.${k} に関数定義が無い`);
  }
  assert.deepEqual([...CHUNK_NAMES].sort(), want.slice().sort());
});

test("glslChunks: 依存を足し、重複させず、順番を守る", () => {
  const s = glslChunks(["grain"]);
  assert.ok(s.includes("float hash12("), "grain は noise を連れてくる");
  assert.ok(s.includes("float lumaOf("), "grain は common を連れてくる");
  assert.ok(s.indexOf("float hash12(") < s.indexOf("vec3 applyGrain("), "noise が先");
  const twice = glslChunks(["common", "common", "noise", "grain"]);
  assert.equal(countOf(twice, "float lumaOf("), 1, "common が二重");
  assert.equal(glslChunks([]), "");
  assert.equal(glslChunks(["存在しない"]), "");
  assert.equal(glslChunks(null), "");
  /* fx 作者に約束している断片は全部実在する */
  for (const n of FX_CHUNKS) assert.ok(CHUNK_NAMES.includes(n), `FX_CHUNKS の ${n} が無い`);
});

/* ── fsLayer（全組合せ） ────────────────────────────────────── */

const FLAGS = ["grade", "curves", "wheels", "hsl", "lut", "chroma", "mask"];

test("fsLayer: 128 通りの全組合せが壊れない", () => {
  for (let bits = 0; bits < (1 << FLAGS.length); bits++) {
    const o = {};
    FLAGS.forEach((f, i) => { o[f] = (bits & (1 << i)) !== 0; });
    const label = "fsLayer " + FLAGS.filter((f) => o[f]).join("+") + (bits === 0 ? "(全部 off)" : "");
    const src = checkSource(label, fsLayer(o));
    /* 使う uniform は必ず宣言されている（sampler も含めて） */
    const used = new Set(src.match(/\bu[A-Z]\w*/g) || []);
    const declared = new Set((src.match(/^uniform\s+\w+\s+(\w+)/gm) || [])
      .map((s) => s.replace(/^uniform\s+\w+\s+/, "")));
    for (const u of used) {
      if (u === "uv") continue;
      assert.ok(declared.has(u), `${label}: ${u} を宣言せずに使っている`);
    }
    /* 切った機能の関数を呼んでいない */
    if (!o.chroma) assert.ok(!src.includes("applyChroma("), `${label}: chroma を切ったのに呼んでいる`);
    if (!o.mask) assert.ok(!src.includes("layerMask("), `${label}: mask を切ったのに呼んでいる`);
    if (!o.lut) assert.ok(!src.includes("applyLut("), `${label}: lut を切ったのに呼んでいる`);
    if (!o.curves) assert.ok(!src.includes("curveRgb("), `${label}: curves を切ったのに呼んでいる`);
    if (!o.hsl) assert.ok(!src.includes("applyHslBands("), `${label}: hsl を切ったのに呼んでいる`);
    if (!o.wheels) assert.ok(!src.includes("applyWheels("), `${label}: wheels を切ったのに呼んでいる`);
  }
});

test("fsLayer: 既定は grade だけ入り、順番は契約どおり", () => {
  const src = fsLayer();
  checkSource("fsLayer()", src);
  /* 定義の位置ではなく **呼んでいる位置** で見る（chunk の定義は前に在る） */
  const pipe = src.slice(src.indexOf("vec3 gradePipeline("), src.indexOf("void main(){"));
  const at = (s) => { const i = pipe.indexOf(s); assert.ok(i >= 0, `${s} が無い`); return i; };
  assert.ok(at("applyExposure(") < at("applyWhiteBalance("), "露出 → 白バランス");
  assert.ok(at("applyWhiteBalance(") < at("applyContrast("), "白バランス → コントラスト");
  assert.ok(at("applyContrast(") < at("applyHighShadow("), "コントラスト → 明暗部");
  assert.ok(at("applyHighShadow(") < at("applyWhitesBlacks("), "明暗部 → 白黒点");
  assert.ok(at("applyWhitesBlacks(") < at("applySaturation("), "白黒点 → 彩度");
  assert.ok(at("applySaturation(") < at("applyVibrance("), "彩度 → 自然な彩度");
  assert.ok(at("applyVibrance(") < at("applyHueRotate("), "自然な彩度 → 色相");
  assert.ok(at("applyHueRotate(") < at("applyFade("), "色相 → 褪せ");
  assert.ok(at("applyFade(") < at("applyVignette("), "褪せ → 周辺光量");
  assert.ok(at("applyVignette(") < at("applyGrain("), "周辺光量 → 粒子");
  assert.ok(pipe.includes("return clamp(c, 0.0, 1.0);"), "最後に clamp していない");

  /* 適用順（透明度 → crop → mask → chroma → grade → fx）は main の中で見る */
  const full = fsLayer({ grade: true, curves: true, wheels: true, hsl: true, lut: true, chroma: true, mask: true, fx: "return c;" });
  const body = full.slice(full.indexOf("void main(){"));
  const f = (s) => { const i = body.indexOf(s); assert.ok(i >= 0, `main に ${s} が無い`); return i; };
  assert.ok(f("clamp(uOpacity") < f("cropMask(uv"), "透明度 → crop");
  assert.ok(f("cropMask(uv") < f("a *= layerMask("), "crop → mask");
  assert.ok(f("a *= layerMask(") < f("c = applyChroma("), "mask → chroma");
  assert.ok(f("c = applyChroma(") < f("gradePipeline(c.rgb"), "chroma → grade");
  assert.ok(f("gradePipeline(c.rgb") < f("fxApply(outColor"), "grade → fx");
  /* カーブ・HSL・LUT は grade の流れの中の決まった場所に入る */
  const pipe2 = full.slice(full.indexOf("vec3 gradePipeline("), full.indexOf("float layerMask("));
  const g = (s) => pipe2.indexOf(s);
  assert.ok(g("applyWheels(") < g("applyContrast("), "ホイールはコントラストより前");
  assert.ok(g("applyWhitesBlacks(") < g("curveLumaShift("), "白黒点 → カーブ");
  assert.ok(g("curveSplit(") < g("applyHslBands("), "カーブ → HSL");
  assert.ok(g("applyHslBands(") < g("applySaturation("), "HSL → 彩度");
  assert.ok(g("applyHueRotate(") < g("applyLut("), "色相 → LUT");
  assert.ok(g("applyLut(") < g("applyFade("), "LUT → 褪せ");
});

test("fsLayer: fx は本文でも関数定義でも受ける。uniform は外へ出す", () => {
  const body = "uniform float uFx_amount;\nreturn vec4(c.rgb * uFx_amount, c.a);";
  const src = checkSource("fsLayer fx(本文)", fsLayer({ fx: body }));
  assert.ok(src.includes("uniform float uFx_amount;"), "uFx_amount が宣言されていない");
  assert.ok(src.indexOf("uniform float uFx_amount;") < src.indexOf("vec4 fxApply("),
    "uniform が関数の中に残っている（GLSL が拒む）");
  assert.equal(countOf(src, "vec4 fxApply("), 1);

  const whole = "uniform float uFx_k;\nvec4 fxApply(vec4 c, vec2 uv){ return c * uFx_k; }";
  const src2 = checkSource("fsLayer fx(関数)", fsLayer({ fx: whole }));
  assert.equal(countOf(src2, "vec4 fxApply("), 1, "二重に包んでいる");

  /* 空や空白だけは「fx 無し」と同じ */
  assert.equal(fsLayer({ fx: "" }), fsLayer({}));
  assert.equal(fsLayer({ fx: "   \n " }), fsLayer({}));
  assert.ok(!fsLayer({}).includes("fxApply"));
});

test("fsLayer: undefined を渡しても既定に落ちる", () => {
  assert.equal(fsLayer({ grade: undefined }), fsLayer({}));
  assert.equal(fsLayer({ grade: null }), fsLayer({}));
  assert.equal(fsLayer(undefined), fsLayer({}));
  assert.equal(fsLayer(null), fsLayer({}));
});

/* ── GRADE_UNIFORMS（compositor との契約） ──────────────────── */

test("GRADE_UNIFORMS: 全名が fsLayer のソースに現れる", () => {
  const src = fsLayer();
  for (const u of GRADE_UNIFORMS) {
    const decl = u.size > 1 ? `uniform ${u.type} ${u.name}[${u.size}];` : `uniform ${u.type} ${u.name};`;
    assert.ok(src.includes(u.name), `${u.name} が fsLayer のソースに無い`);
    assert.ok(src.includes(decl), `${u.name} の宣言（${decl}）が無い`);
  }
  /* カラーを 1 つでも使うなら表ごと宣言する（compositor は常に全部詰められる） */
  for (const only of ["curves", "wheels", "hsl", "lut"]) {
    const s = fsLayer({ grade: false, [only]: true });
    for (const n of GRADE_UNIFORM_NAMES) assert.ok(s.includes(n), `${only} だけのとき ${n} が無い`);
  }
  /* カラーを全部切ったら 1 つも出て来ない */
  const none = fsLayer({ grade: false });
  for (const n of GRADE_UNIFORM_NAMES) assert.ok(!none.includes(n), `grade:false で ${n} が残っている`);
});

test("GRADE_UNIFORMS: 表の形が崩れていない", () => {
  assert.ok(GRADE_UNIFORMS.length >= 30, "行が少なすぎる");
  assert.equal(new Set(GRADE_UNIFORM_NAMES).size, GRADE_UNIFORM_NAMES.length, "名前が重複");
  const keys = new Set();
  for (const u of GRADE_UNIFORMS) {
    assert.match(u.name, /^u[A-Z]\w*$/, `${u.name}: 名前の作法が違う`);
    assert.ok(["float", "vec2", "vec3"].includes(u.type), `${u.name}: 知らない型 ${u.type}`);
    assert.ok(Number.isInteger(u.size) && u.size >= 1, `${u.name}: size が壊れている`);
    assert.ok("def" in u, `${u.name}: def が無い`);
    assert.equal(GRADE_UNIFORM_BY_NAME[u.name], u, `${u.name}: 引きが壊れている`);
    if (u.key) { assert.ok(!keys.has(u.key), `${u.key} が二重`); keys.add(u.key); }
  }
  /* 契約書 §1 の ColorGrade の数値キーが漏れていない */
  for (const k of ["exposure", "contrast", "saturation", "temperature", "tint", "highlights",
    "shadows", "whites", "blacks", "vibrance", "hue", "sharpen", "denoise", "vignette",
    "grain", "fade"]) {
    assert.ok(keys.has(k), `ColorGrade.${k} に対応する uniform が無い`);
  }
  for (const k of ["curves.rgb", "curves.r", "curves.g", "curves.b", "curves.luma",
    "wheels.lift", "wheels.gamma", "wheels.gain", "wheels.offset", "lut.amount"]) {
    assert.ok(keys.has(k), `ColorGrade.${k} に対応する uniform が無い`);
  }
  /* 既定値は「効果なし」であること */
  const d = gradeDefaults();
  assert.equal(d.uGradeExposure, 0);
  assert.equal(d.uGradeSaturation, 0);
  assert.equal(d.uLutAmount, 0);
  assert.deepEqual(d.uWheelLift, [0, 0, 0]);
  assert.deepEqual(d.uCurveRGB, identityCurve16());
  assert.equal(d.uCurveRGB.length, CURVE_SIZE);
  assert.equal(d.uHslShift.length, HSL_BANDS * 3);
  assert.equal(d.uHslRange.length, HSL_BANDS);
  /* 返り値は複製（呼ぶ側が書き換えても表が壊れない） */
  d.uWheelLift[0] = 9;
  assert.deepEqual(gradeDefaults().uWheelLift, [0, 0, 0]);
});

test("curveLut16: 制御点を 16 段に均す", () => {
  assert.deepEqual(curveLut16(null), identityCurve16());
  assert.deepEqual(curveLut16([[0, 0], [1, 1]]), identityCurve16());
  assert.deepEqual(curveLut16([[0.5, 0.5]]), identityCurve16(), "点が 1 つなら恒等");
  const lut = curveLut16([[0, 0], [0.5, 0.25], [1, 1]]);
  assert.equal(lut.length, CURVE_SIZE);
  assert.equal(lut[0], 0);
  assert.equal(lut[CURVE_SIZE - 1], 1);
  for (let i = 1; i < lut.length; i++) assert.ok(lut[i] >= lut[i - 1], "単調でない");
  assert.ok(lut[7] < 0.35, "中央が下がっていない");
  /* 壊れた入力でも 0..1 の 16 段を返す */
  for (const bad of [[[NaN, 0], [1, 1]], [[0, 0], [2, 5]], "x", 42, [[0]], [[0, 0], [0, 1]]]) {
    const out = curveLut16(bad);
    assert.equal(out.length, CURVE_SIZE);
    for (const v of out) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `壊れた値 ${v}`);
  }
});

/* ── 合成・遷移・効果・複写・ぼかし・スコープ ───────────────── */

test("fsBlend: 全 mode が生成できる", () => {
  for (const m of BLEND_MODES) {
    const src = checkSource(`fsBlend(${m})`, fsBlend(m));
    assert.ok(src.includes("uniform sampler2D uTexB;"), `${m}: uTexB が無い`);
    assert.ok(src.includes(blendFnName(m) + "("), `${m}: 関数を呼んでいない`);
    assert.ok(src.includes("composite("));
  }
  /* 知らない名前は normal に落ちる（保存形式が古くても黒画面にしない） */
  assert.equal(fsBlend("しらない"), fsBlend("normal"));
  assert.equal(fsBlend(null), fsBlend("normal"));
  assert.equal(blendFnName("しらない"), null);
  assert.equal(blendFnName("SoftLight"), "blendSoftLight");
  assert.equal(blendFnName("soft-light"), "blendSoftLight");
  assert.equal(blendModeIndex("normal"), 0);
  assert.equal(blendModeIndex("しらない"), 0);
  assert.equal(BLEND_MODES[blendModeIndex("multiply")], "multiply");
  /* blendByMode の番号と BLEND_MODES の並びが一致している */
  for (let i = 1; i < BLEND_MODES.length; i++) {
    assert.ok(CHUNKS.blendModes.includes(`if (m == ${i}) return ${blendFnName(BLEND_MODES[i])}(b, s);`),
      `blendByMode の ${i} 番が BLEND_MODES とずれている`);
  }
});

test("fsTransition: 既定はクロスフェード。本文も関数も受ける", () => {
  const def = checkSource("fsTransition(null)", fsTransition(null));
  assert.ok(def.includes("vec4 trApply(vec2 uv, float p)"));
  assert.ok(def.includes("mix(texture(uTex, uv), texture(uTexB, uv), p)"));
  assert.ok(def.includes("trApply(vUv, clamp(uP, 0.0, 1.0))"));
  const body = "return mix(texture(uTex, uv), texture(uTexB, uv), smoothstep(0.0, 1.0, p));";
  checkSource("fsTransition(本文)", fsTransition(body));
  const whole = "vec4 trApply(vec2 uv, float p){ return texture(uTexB, uv) * p; }";
  const s = checkSource("fsTransition(関数)", fsTransition(whole));
  assert.equal(countOf(s, "vec4 trApply("), 1);
  /* 遷移の作者に約束した共通関数が使える */
  checkSource("fsTransition(hash)", fsTransition("return vec4(vec3(hash12(uv * 100.0)), p);"));
  checkSource("fsTransition(blur)", fsTransition("return blurPass(uTex, uv, vec2(0.01, 0.0), p);"));
});

test("fsEffect: 既定は素通し。uFx_ の uniform を持ち込める", () => {
  const def = checkSource("fsEffect(null)", fsEffect(null));
  assert.ok(def.includes("vec4 fxApply(vec4 c, vec2 uv)"));
  assert.ok(def.includes("fxApply(c, vUv)"));
  const s = checkSource("fsEffect(本文)",
    fsEffect("uniform float uFx_amount;\nreturn vec4(mix(c.rgb, vec3(lumaOf(c.rgb)), uFx_amount), c.a);"));
  assert.ok(s.indexOf("uniform float uFx_amount;") < s.indexOf("vec4 fxApply("));
  assert.ok(!s.includes("uniform sampler2D uTexB;"), "効果 1 段に uTexB は要らない");
});

test("fsCopy / fsGauss / fsScopes", () => {
  const cp = checkSource("fsCopy", fsCopy());
  assert.ok(cp.includes("uOpacity"));
  const h = checkSource("fsGauss(h)", fsGauss("h"));
  const v = checkSource("fsGauss(v)", fsGauss("v"));
  assert.ok(h.includes("vec2(1.0, 0.0)"), "横方向でない");
  assert.ok(v.includes("vec2(0.0, 1.0)"), "縦方向でない");
  assert.ok(h.includes("uniform float uRadius;"));
  assert.equal(fsGauss("y"), v);
  assert.equal(fsGauss(1), v);
  assert.equal(fsGauss(undefined), h);
  for (const k of SCOPE_KINDS) {
    const s = checkSource(`fsScopes(${k})`, fsScopes(k));
    assert.ok(s.includes("uniform float uScopeSamples;"));
    assert.ok(s.includes("uniform float uScopeGain;"));
  }
  assert.equal(fsScopes("しらない"), fsScopes("histogram"));
  assert.equal(fsScopes(), fsScopes("histogram"));
  assert.deepEqual([...SCOPE_KINDS], ["histogram", "waveform", "vector"]);
});

/* ── 契約の定数 ─────────────────────────────────────────────── */

test("固定の割当と定数が契約どおり", () => {
  assert.deepEqual({ ...TEXTURE_UNITS }, { uTex: 0, uTexB: 1, uLut: 2, uMask: 3 });
  assert.equal(CURVE_SIZE, 16);
  assert.equal(HSL_BANDS, 6);
  assert.equal(MASK_POINTS, 16);
  for (const t of [COMMON_UNIFORMS, VERTEX_UNIFORMS, LAYER_UNIFORMS]) {
    for (const u of t) {
      assert.match(u.name, /^u[A-Z]\w*$/);
      assert.equal(typeof u.type, "string");
    }
  }
  /* 共通 uniform はどのフラグメントにも宣言が在る */
  for (const src of [fsLayer(), fsBlend("normal"), fsTransition(null), fsEffect(null), fsCopy(),
    fsGauss("h"), fsScopes("waveform")]) {
    for (const u of COMMON_UNIFORMS) {
      assert.ok(src.includes(`uniform ${u.type} ${u.name};`), `${u.name} の宣言が無い`);
    }
  }
  /* VS_QUAD の uniform も表と一致 */
  for (const u of VERTEX_UNIFORMS) assert.ok(VS_QUAD.includes(`uniform ${u.type} ${u.name};`));
  /* LAYER_UNIFORMS は全部 fsLayer（全機能 on）に在る */
  const full = fsLayer({ chroma: true, mask: true, lut: true });
  for (const u of LAYER_UNIFORMS) {
    const decl = u.size > 1 ? `uniform ${u.type} ${u.name}[${u.size}];` : `uniform ${u.type} ${u.name};`;
    assert.ok(full.includes(decl), `${u.name} の宣言（${decl}）が無い`);
  }
});

/* ══════════════════════════════════════════════════════════════════════
   engine/gl/context.js の「gl を触らない所」だけの試験。
   WebGL 本体は Node で動かせないので、
     ・読み込むだけで壊れない（起動時に DOM を触っていない）
     ・WebGL2 が無いときに **null を返す**（throw しない = 2d に落ちられる）
     ・行列の道具が正しい（ここが狂うと画が上下逆さまになる）
   を見る。
   ══════════════════════════════════════════════════════════════════════ */
import {
  createGL, projection, mat3Mul, applyMat3, mat3Identity, MODEL_FBO, MODEL_SCREEN,
} from "../src/engine/gl/context.js";

test("createGL: WebGL2 が無ければ null（例外は投げない）", () => {
  assert.equal(createGL(null), null);
  assert.equal(createGL({}), null);
  assert.equal(createGL({ getContext: () => null }), null);
  assert.equal(createGL({ getContext: () => { throw new Error("拒否"); } }), null);
});

test("projection: 描画先で Y の向きが変わる（左上原点の約束）", () => {
  const screen = projection(null);
  const fb = projection({ fb: {} });
  assert.deepEqual([...screen], [...MODEL_SCREEN]);
  assert.deepEqual([...fb], [...MODEL_FBO]);
  /* canvas 宛て: uv(0,0)=素材の左上 が クリップの上（y=+1）に来る */
  assert.deepEqual(applyMat3(screen, 0, 0), [-1, 1]);
  assert.deepEqual(applyMat3(screen, 1, 1), [1, -1]);
  /* FBO 宛て: 反転しない（FBO の 0 行目 = 画像の上 を保つ） */
  assert.deepEqual(applyMat3(fb, 0, 0), [-1, -1]);
  assert.deepEqual(applyMat3(fb, 1, 1), [1, 1]);
  /* 返り値は複製（書き換えても定数が壊れない） */
  screen[0] = 99;
  assert.equal(projection(null)[0], 2);
});

test("mat3Mul / applyMat3: 列優先で正しく掛かる", () => {
  const I = mat3Identity();
  assert.deepEqual([...mat3Mul(I, MODEL_SCREEN)], [...MODEL_SCREEN]);
  assert.deepEqual([...mat3Mul(MODEL_SCREEN, I)], [...MODEL_SCREEN]);
  assert.deepEqual(applyMat3(I, 0.3, 0.7), [0.3, 0.7]);
  /* 平行移動（列優先: 3 列目が移動量） */
  const move = new Float32Array([1, 0, 0, 0, 1, 0, 0.5, -0.25, 1]);
  assert.deepEqual(applyMat3(move, 0, 0), [0.5, -0.25]);
  /* 拡大 2 倍 → 移動 の合成は「移動 * 拡大」の順で掛ける */
  const scale2 = new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 1]);
  const both = mat3Mul(move, scale2);
  assert.deepEqual(applyMat3(both, 1, 1), [2.5, 1.75]);
  /* 90 度回転（列優先）。誤差は 1e-6 まで許す */
  const r = Math.PI / 2;
  const rot = new Float32Array([Math.cos(r), Math.sin(r), 0, -Math.sin(r), Math.cos(r), 0, 0, 0, 1]);
  const [x, y] = applyMat3(rot, 1, 0);
  assert.ok(Math.abs(x - 0) < 1e-6 && Math.abs(y - 1) < 1e-6, `回転が違う: ${x},${y}`);
  /* w が 0 でも壊れない（NaN を外へ出さない） */
  const bad = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 0]);
  for (const v of applyMat3(bad, 1, 1)) assert.ok(Number.isFinite(v), "NaN が漏れた");
});
