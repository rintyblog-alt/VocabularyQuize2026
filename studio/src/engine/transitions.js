/* ══════════════════════════════════════════════════════════════════════
   engine/transitions.js — 遷移（トランジション）の登録表

   ★ 何をする所か
     クリップの境目で 2 枚（A=遷移元 / B=遷移先）を混ぜる「見た目の型」を
     ここに **表** として並べる。1 件ごとに
       ・GLSL の関数 1 個（`vec4 trApply(vec2 uv, float p)`）
       ・canvas2d の代替（`draw2d`。無理な物は null）
       ・調整つまみの申告（`params`）
     を持つ。gl も DOM も触らない **純データ**なので Node の試験で全部検められる。

   ★ なぜこの形か
     ・compositor は `TRANSITIONS[type].glsl` を shaders.js の `fsTransition()` に
       差し込むだけで良い（テクスチャ単位 0=uTex=A / 1=uTexB=B は共通規約）。
     ・canvas2d（WebGL が無い端末）は `draw2d` を呼ぶ。両方を 1 件の中に置くので
       「片方だけ直して食い違う」事故が起きない。
     ・**p は 0..1 で単調。p=0 で完全に A、p=1 で完全に B**。ここを外すと編集結果が
       破綻するので、GLSL も 2d も `trBody()` / `mk2d()` が端の 2 行を機械的に
       付ける（手書きに任せない）。試験はその 2 行の存在を見る。

   ★ 触るときの注意
     ・glsl の中で使う補助関数は **すべて自前**（`tr_` 接頭辞）。shaders.js の
       CHUNKS には依存しない（chunk の名前が変わっても遷移は壊れない）。
     ・sampler は `uTex` と `uTexB` だけ。texture() 以外の取り方はしない。
     ・derivative（dFdx/dFdy/fwidth）は使わない。for の上限は必ず定数。
     ・追加 uniform は規約どおり `uFx_<paramKey>`（compositor の fillParams が
       clip.transitionIn/Out.params からそのまま詰める）。
     ・**params が空の時 uniform は 0 で来る**（ops は既定値を埋めない）。だから
       GLSL 側は `tr_par(uFx_x, 既定)` で「0 なら既定」に読み替える。そのため
       どの param も `min > 0` にしてある（0 は「未指定」の意味に予約）。
       UI から明示的に既定を入れたいときは `fillTransitionParams()` を使う。
     ・色は sRGB のまま（v1 の割り切り）。linear 変換はしない。

   CONTRACT-NOTE: 共通前提の「1 ファイル 700 行で分割」を超えるが、担当外の
     ファイルを作れないので 1 枚に収めた。中身は「GLSL 断片 → 組み立て →
     2d 道具 → 表」の 4 段で、行数のほとんどは表（1 件 = 数行）である。
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

/* ══ §1 GLSL の断片（全部 tr_ 接頭辞。衝突しない）═══════════════════ */

/** どの遷移にも足す土台。uRes / uTexRes は fsTransition が宣言済み */
const G_BASE = `
float tr_ar(){ vec2 r = uRes.y > 1.0 ? uRes : uTexRes; return r.y > 1.0 ? max(1.0, r.x) / max(1.0, r.y) : 1.0; }
float tr_px(){ vec2 r = uRes.y > 1.0 ? uRes : uTexRes; return r.y > 1.0 ? 1.0 / max(1.0, r.y) : 0.002; }
bool tr_in(vec2 u){ return u.x >= 0.0 && u.x <= 1.0 && u.y >= 0.0 && u.y <= 1.0; }
vec4 tr_a(vec2 u){ return texture(uTex, clamp(u, 0.0, 1.0)); }
vec4 tr_b(vec2 u){ return texture(uTexB, clamp(u, 0.0, 1.0)); }
float tr_par(float v, float d){ return v > 0.0 ? v : d; }
float tr_ease(float x, float k){ return mix(x, smoothstep(0.0, 1.0, x), clamp(k, 0.0, 1.0)); }
float tr_bump(float x){ return sin(clamp(x, 0.0, 1.0) * 3.14159265); }
float tr_hash21(vec2 q){ vec3 h = fract(vec3(q.xyx) * vec3(443.897, 441.423, 437.195)); h += dot(h, h.yzx + 19.19); return fract((h.x + h.y) * h.z); }
vec2 tr_cen(vec2 u){ return (u - 0.5) * vec2(tr_ar(), 1.0); }
float tr_rad(vec2 u){ float a = tr_ar(); return length(tr_cen(u)) / (0.5 * sqrt(1.0 + a * a)); }
`;

/** 追加の断片（本文が名前を呼んでいたら自動で足す） */
const G_PARTS = [
  {
    fns: ["tr_rot"], src: `
vec2 tr_rot(vec2 u, float ang, float sc){
  float a = tr_ar();
  vec2 q = (u - 0.5) * vec2(a, 1.0) / max(0.05, sc);
  float c = cos(ang), s = sin(ang);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  return q / vec2(a, 1.0) + 0.5;
}
` },
  {
    fns: ["tr_blurA", "tr_blurB"], src: `
vec4 tr_blurA(vec2 u, float r){
  if (r <= 0.0) return tr_a(u);
  vec2 k = vec2(1.0 / max(0.2, tr_ar()), 1.0) * r;
  vec4 s = tr_a(u);
  for (int i = 0; i < 12; i++) {
    float f = (float(i) + 0.5) / 12.0;
    float ang = float(i) * 2.39996323;
    s += tr_a(u + vec2(cos(ang), sin(ang)) * sqrt(f) * k);
  }
  return s / 13.0;
}
vec4 tr_blurB(vec2 u, float r){
  if (r <= 0.0) return tr_b(u);
  vec2 k = vec2(1.0 / max(0.2, tr_ar()), 1.0) * r;
  vec4 s = tr_b(u);
  for (int i = 0; i < 12; i++) {
    float f = (float(i) + 0.5) / 12.0;
    float ang = float(i) * 2.39996323;
    s += tr_b(u + vec2(cos(ang), sin(ang)) * sqrt(f) * k);
  }
  return s / 13.0;
}
` },
  {
    fns: ["tr_dirA", "tr_dirB"], src: `
vec4 tr_dirA(vec2 u, vec2 d){
  vec4 s = vec4(0.0);
  for (int i = 0; i < 9; i++) { s += tr_a(u + d * ((float(i) - 4.0) / 4.0)); }
  return s / 9.0;
}
vec4 tr_dirB(vec2 u, vec2 d){
  vec4 s = vec4(0.0);
  for (int i = 0; i < 9; i++) { s += tr_b(u + d * ((float(i) - 4.0) / 4.0)); }
  return s / 9.0;
}
` },
  {
    fns: ["tr_noise"], src: `
float tr_noise(vec2 u){
  vec2 i = floor(u), f = fract(u);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = tr_hash21(i), b = tr_hash21(i + vec2(1.0, 0.0));
  float c = tr_hash21(i + vec2(0.0, 1.0)), d = tr_hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
` },
  {
    fns: ["tr_cell", "tr_cellId"], src: `
vec2 tr_cellN(float n){ return max(vec2(2.0), vec2(n * tr_ar(), n)); }
vec2 tr_cell(vec2 u, float n){ vec2 m = tr_cellN(n); return (floor(u * m) + 0.5) / m; }
vec2 tr_cellId(vec2 u, float n){ return floor(u * tr_cellN(n)); }
` },
  {
    fns: ["tr_hsv"], src: `
vec3 tr_hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, clamp(s, 0.0, 1.0));
}
` },
];

/** GLSL の float 表記（"1" ではなく "1.0" にする。int と混ぜると GLSL が拒む） */
function F(n) {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  const s = String(v);
  return s.indexOf(".") >= 0 || s.indexOf("e") >= 0 ? s : s + ".0";
}

/**
 * 遷移 1 件の GLSL を組む。
 * ・端（p=0 / p=1）の 2 行は **ここが機械的に付ける**（手書きの取りこぼしを無くす）
 * ・本文が呼んでいる tr_* の断片を自動で連れてくる
 * @param {string} body @param {{key:string}[]} params
 * @returns {string}
 */
function trBody(body, params) {
  const text = String(body || "").trim();
  let pre = G_BASE;
  for (let pass = 0; pass < 2; pass++) {
    for (const part of G_PARTS) {
      if (pre.indexOf(part.src) >= 0) continue;
      const hay = text + pre;
      if (part.fns.some((f) => hay.indexOf(f + "(") >= 0)) pre += part.src;
    }
  }
  const us = (params || []).map((p) => `uniform float uFx_${p.key};`).join("\n");
  const lines = text.split("\n").map((l) => "  " + l.trim()).join("\n");
  return [
    pre.trim(), us, "",
    "vec4 trApply(vec2 uv, float p) {",
    "  float t = clamp(p, 0.0, 1.0);",
    "  if (t <= 0.0) return tr_a(uv);",
    "  if (t >= 1.0) return tr_b(uv);",
    lines,
    "}", "",
  ].filter((s) => s !== null).join("\n");
}
