/* ══════════════════════════════════════════════════════════════════════════
   影と 色の 決めどころ。

   GLSL は **ES 1.00 で 書く**。WebGL2 でも そのまま 通るので、
   2 種類 持たなくて 済む（持つと 必ず 片方が 腐る）。

   見た目の 方針:
     ・光は 1 本だけ。半ランバートで 影側を 潰さない。
     ・縁に 薄く 光を 乗せる（rim）。これだけで 「おもちゃ」に 見える。
     ・つやは 段にする（banded）。滑らかだと 写実に 寄って 浮く。
     ・遠くは 空の 色へ 溶かす（霧）。描く距離を 切っても 気づかれない。
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 本体（まとめ描き）───────────────────────────────────────────────── */
export const MAIN_VS = `
precision highp float;
attribute vec3 a_pos;
attribute vec3 a_nor;
attribute vec2 a_uv;
attribute vec4 a_m0;
attribute vec4 a_m1;
attribute vec4 a_m2;
attribute vec4 a_m3;
attribute vec4 a_color;
attribute vec4 a_params;   /* x=自ら光る y=縁の強さ z=縞の細かさ w=揺れ */

uniform mat4 u_viewProj;
uniform mat4 u_shadowMat;
uniform float u_time;

varying vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying vec4 v_shadowPos;

void main() {
  mat4 M = mat4(a_m0, a_m1, a_m2, a_m3);
  vec3 p = a_pos;
  /* w が 0 でなければ その場で 揺らす（旗・水草・雲）。
     頂点で やるので 追加の 描き は 要らない。 */
  if (a_params.w > 0.001) {
    float ph = M[3].x * 0.7 + M[3].z * 0.9 + u_time * 1.7;
    p.x += sin(ph) * a_params.w * (p.y + 0.5);
    p.z += cos(ph * 0.83) * a_params.w * 0.6 * (p.y + 0.5);
  }
  vec4 wp = M * vec4(p, 1.0);
  v_world = wp.xyz;
  /* 大きさが 一様でない ときも 法線が 曲がらないように、
     3x3 の 各列の 長さで 割る（逆転置の 安い代用）。 */
  vec3 s = vec3(length(M[0].xyz), length(M[1].xyz), length(M[2].xyz));
  mat3 R = mat3(M[0].xyz / max(s.x, 1e-5), M[1].xyz / max(s.y, 1e-5), M[2].xyz / max(s.z, 1e-5));
  v_nor = normalize(R * a_nor);
  v_uv = a_uv;
  v_color = a_color;
  v_params = a_params;
  v_shadowPos = u_shadowMat * wp;
  gl_Position = u_viewProj * wp;
}`;

export const MAIN_FS = `
precision mediump float;

varying vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying vec4 v_shadowPos;

uniform vec3 u_lightDir;      /* 光の 向き（正規化済み・光源→物） */
uniform vec3 u_lightColor;
uniform vec3 u_ambTop;        /* 上からの 環境光（空の 色） */
uniform vec3 u_ambBottom;     /* 下からの 跳ね返り（地面の 色） */
uniform vec3 u_camPos;
uniform vec3 u_fogColor;
uniform vec2 u_fogRange;      /* x=始まり y=終わり */
uniform sampler2D u_shadowMap;
uniform float u_shadowOn;
uniform float u_shadowTexel;

float shadowAt(vec4 sp) {
  vec3 q = sp.xyz / sp.w;
  q = q * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  /* 傾いた 面ほど 深さの ずれが 出るので 逃がしを 大きくする */
  float bias = 0.0016;
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)) * u_shadowTexel;
      float d = texture2D(u_shadowMap, q.xy + o).r;
      sum += (q.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return sum / 9.0;
}

void main() {
  vec3 N = normalize(v_nor);
  vec3 V = normalize(u_camPos - v_world);
  vec3 L = -u_lightDir;

  /* 半ランバート。影側が 真っ黒に ならない。 */
  float nl = dot(N, L) * 0.5 + 0.5;
  nl = nl * nl;

  float sh = 1.0;
  if (u_shadowOn > 0.5) sh = mix(1.0, shadowAt(v_shadowPos), 0.82);

  /* 上下で 色の 違う 環境光。地面の 照り返しが 入るだけで 立体に 見える。 */
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(u_ambBottom, u_ambTop, up);

  vec3 base = v_color.rgb;

  /* 段のある つや。3 段に 割る。 */
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 34.0);
  spec = step(0.28, spec) * 0.35 + step(0.7, spec) * 0.35;

  /* 縁の 光。輪郭が 分かれて おもちゃに 見える。 */
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * v_params.y;

  /* 縞（走路の 端・危ないところ）*/
  float stripe = 1.0;
  if (v_params.z > 0.001) {
    float t = fract((v_uv.x + v_uv.y) * v_params.z);
    stripe = mix(1.0, 0.62, step(0.5, t));
  }

  vec3 col = base * stripe * (amb + u_lightColor * nl * sh);
  col += u_lightColor * spec * sh * 0.5;
  col += base * rim;
  col += base * v_params.x;            /* 自ら光る */

  /* 霧。空へ 溶かす。 */
  float d = length(u_camPos - v_world);
  float f = clamp((d - u_fogRange.x) / max(u_fogRange.y - u_fogRange.x, 1.0), 0.0, 1.0);
  f = f * f;
  col = mix(col, u_fogColor, f);

  gl_FragColor = vec4(col, v_color.a);
}`;

/* ── 影を 焼く（深さだけ）─────────────────────────────────────────────── */
export const SHADOW_VS = `
precision highp float;
attribute vec3 a_pos;
attribute vec4 a_m0;
attribute vec4 a_m1;
attribute vec4 a_m2;
attribute vec4 a_m3;
attribute vec4 a_params;
uniform mat4 u_shadowMat;
uniform float u_time;
void main() {
  mat4 M = mat4(a_m0, a_m1, a_m2, a_m3);
  vec3 p = a_pos;
  if (a_params.w > 0.001) {
    float ph = M[3].x * 0.7 + M[3].z * 0.9 + u_time * 1.7;
    p.x += sin(ph) * a_params.w * (p.y + 0.5);
    p.z += cos(ph * 0.83) * a_params.w * 0.6 * (p.y + 0.5);
  }
  gl_Position = u_shadowMat * M * vec4(p, 1.0);
}`;

export const SHADOW_FS = `
precision mediump float;
void main() { gl_FragColor = vec4(1.0); }`;

/* ── 空 ───────────────────────────────────────────────────────────────
   画面いっぱいの 三角形 1 枚。地平・空・太陽・雲の 帯を その場で 作る。 */
export const SKY_VS = `
precision highp float;
attribute vec2 a_pos;
varying vec2 v_ndc;
void main() { v_ndc = a_pos; gl_Position = vec4(a_pos, 1.0, 1.0); }`;

export const SKY_FS = `
precision mediump float;
varying vec2 v_ndc;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_ground;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_time;
uniform float u_clouds;

/* 安い 雑音（値ノイズ）。雲の 帯 用。 */
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec4 far = u_invViewProj * vec4(v_ndc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - u_camPos);

  float h = dir.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(u_horizon, u_top, pow(clamp(h, 0.0, 1.0), 0.55));
    if (u_clouds > 0.5) {
      /* 空を 平らな 板に 写して 雲を 引き伸ばす */
      float t = 0.14 / max(h, 0.02);
      vec2 uv = dir.xz * t + vec2(u_time * 0.004, u_time * 0.002);
      float n = noise(uv * 2.2) * 0.55 + noise(uv * 5.1) * 0.3 + noise(uv * 11.0) * 0.15;
      float c = smoothstep(0.55, 0.86, n) * smoothstep(0.0, 0.22, h);
      col = mix(col, vec3(1.0), c * 0.75);
    }
  } else {
    col = mix(u_horizon, u_ground, pow(clamp(-h, 0.0, 1.0), 0.45));
  }
  /* 太陽。丸と 広がりの 2 枚。 */
  float sd = max(dot(dir, -u_sunDir), 0.0);
  col += u_sunColor * pow(sd, 900.0) * 2.2;
  col += u_sunColor * pow(sd, 12.0) * 0.16;
  gl_FragColor = vec4(col, 1.0);
}`;
