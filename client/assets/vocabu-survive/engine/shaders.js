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

/* ★ 世界の 座標は **必ず highp**（2026-08-31）。
   画素側の 既定は mediump（仮数 10 ビット）で、200m 先の 座標を
   0.1m きざみでしか 表せない。床の 目地（fract で 作る）が
   量子化に 埋もれて **1 本も 出なかった**（実測。強さ 0.9 でも 出ない）。
   影の 位置も 同じ 理由で 荒れるので ここで 揃える。 */
varying highp vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying highp vec4 v_shadowPos;

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
/* ★ 画面の 傾きから **本当の 面の 向き**を 取る（2026-08-31）。
   丸めた 箱（roundedBox）の 法線は 角の 丸みが 面の 上まで 広がっていて、
   床の 上でも N.y が 0.58〜1.0 の 間で 揺れる。そのせいで
   「上を 向いた 面だけ」の 判定が **まったく 効いて いなかった**
   （床の 目地が 1 本も 出ない。強さ 0.9 に しても 出ない ことで 分かった）。
   dFdx/dFdy から 面の 向きを 作れば 床の 上は 必ず 1.0 に なる。
   ★ 使えるかの 判断は **文脈を 見て 外で 決める**（engine/gl.js の derivHeader）。
     WebGL2 では この 拡張は 「無い」と 返るのに 傾きは 使える ので、
     shader の 中の #extension だけに 頼ると **WebGL2 で 落ちる**
     （#ifdef が 立たず、丸めた 法線の ままに 戻る。実測で ここに はまった）。
     使えない 端末では VS_DERIV が 立たず、これまでどおり 頂点の 法線。 */
precision mediump float;

/* ★ ここを mediump に すると 床の 目地が 消える（上の 説明を 参照）。 */
varying highp vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying highp vec4 v_shadowPos;

uniform vec3 u_lightDir;      /* 光の 向き（正規化済み・光源→物） */
uniform vec3 u_lightColor;
uniform vec3 u_ambTop;        /* 上からの 環境光（空の 色） */
uniform vec3 u_ambBottom;     /* 下からの 跳ね返り（地面の 色） */
uniform highp vec3 u_camPos;
uniform vec3 u_fogColor;
uniform vec2 u_fogRange;      /* x=始まり y=終わり */
uniform sampler2D u_shadowMap;
uniform float u_shadowOn;
uniform float u_shadowTexel;
uniform float u_emissiveBoost;   /* 1 を 超える 板の ときだけ 1 より 大きい */
/* ★ 床の 目地（2026-08-31）。x=一辺の 長さ(m) y=濃さ z=消え始め w=消え終わり
   これが 無いと 床が **のっぺりした 色の 面**に なり、
   走っている 速さも 段差も 目で 分からない（実写で 確認）。
   上を 向いた 面にだけ 掛ける。遠くは 消す（ちらつきを 出さない）。 */
uniform vec4 u_grid;
/* ★ 材質（2026-09-02）。**形ごとに 1 回だけ**渡す。
   1 つの 形＝1 つの 材質 なので、粒ごとに 持たせる 必要が ない
   （持たせると 1 粒 16 バイト 増え、1 万粒で 160KB／フレーム 増える）。
   x=つやの 鋭さ y=つやの 強さ z=表面の むら w=金属みの 度合い */
uniform vec4 u_mat;
/* x=葉ごしの 光 y=むらの 細かさ z=ふちの 空うつり w=未使用 */
uniform vec4 u_mat2;
/* ★ 肌（2026-09-02）。x=何マス目（0＝使わない） y=1m あたりの くり返し
   z=でこぼこの 強さ w=ざらつき（つやの 広がり） */
uniform vec4 u_mat3;
uniform sampler2D u_skin;
/* x=列 y=行 z=1/列 w=1/行 */
uniform vec4 u_skinGrid;

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

  /* ══ 肌（テクスチャ）════════════════════════════════════════════
     ★ **世界の 座標から 貼る**（三面貼り／triplanar）。
       形は その場で 作って いて 開き（UV）が 無いので、
       ふつうの 貼りかたは できない。
       上・横・前 の 3 方向から 貼って、法線で 混ぜる。
       継ぎ目が 出ず、どんな 形にも 貼れる。
     ★ アトラスなので **自分で fract して マスの 中に 収める**。
       はみ出すと 隣の 肌が にじんで 出る。
     ★ A（不透明度の 場所）に **でこぼこ**を 入れて ある。
       近くの 値との 差で 法線を ずらす ＝ 平らな 面でも 手ざわりが 出る。
       これが 「安っぽさ」を いちばん 消す。 */
  float skinL = 1.0;
  float cav = 1.0;          /* くぼみの 陰り（1＝ 陰り なし）*/
  vec3 N0 = N;
  if (u_mat3.x > 0.5 && u_skinGrid.x > 0.5) {
    vec3 an = abs(N);
    an = an / max(an.x + an.y + an.z, 0.0001);
    float sc = u_mat3.y;
    vec2 uvX = v_world.zy * sc, uvY = v_world.xz * sc, uvZ = v_world.xy * sc;
    float tileI = u_mat3.x - 1.0;
    vec2  tileO = vec2(mod(tileI, u_skinGrid.x), floor(tileI * u_skinGrid.z)) * vec2(u_skinGrid.z, u_skinGrid.w);
    /* 端が にじまない ように わずかに 内側へ */
    vec2  tileW = vec2(u_skinGrid.z, u_skinGrid.w) * 0.996;
    vec2  tileP = vec2(u_skinGrid.z, u_skinGrid.w) * 0.002;
    vec4 tX = texture2D(u_skin, tileO + tileP + fract(uvX) * tileW);
    vec4 tY = texture2D(u_skin, tileO + tileP + fract(uvY) * tileW);
    vec4 tZ = texture2D(u_skin, tileO + tileP + fract(uvZ) * tileW);
    float s1 = (tX.r * an.x + tY.r * an.y + tZ.r * an.z);
    /* ★★ くり返しを 消す（2026-09-02・実写で 必要と 分かった）★★
       1 つの 縮尺で 貼ると、地面に **同じ 輪っかが 並ぶ**のが はっきり 見える
       （前より 安っぽく なった）。
       割り切れない 別の 縮尺（0.371 倍）で もう 1 回 重ねると、
       模様が そろう までの 長さが 何十メートルにも 伸びて 目に つかない。
       上を 向いた 面が いちばん 目立つ ので、**Y の 面だけ** 重ねる
       （3 面ぶん 重ねると 見た目は 同じで 3 倍 重い）。 */
    float k2 = 0.371;
    float s2 = texture2D(u_skin, tileO + tileP + fract(uvY * k2) * tileW).r;
    float mix2 = an.y * 0.62;
    skinL = mix(s1, (s1 + s2) * 0.5, mix2) * 2.0;
    /* でこぼこ。少し ずらした ところを もう 1 回 見て 傾きを 作る。 */
    if (u_mat3.z > 0.001) {
      float e = 0.012;
      float hX = texture2D(u_skin, tileO + tileP + fract(uvX + vec2(e, 0.0)) * tileW).a;
      float hY = texture2D(u_skin, tileO + tileP + fract(uvY + vec2(0.0, e)) * tileW).a;
      float h0 = tX.a * an.x + tY.a * an.y + tZ.a * an.z;
      /* ★ くぼみの 陰り（2026-09-02）。
         低い ところ（h0 が 小さい）は 光が 入りにくい。
         画面ぜんぶを 見る SSAO では ないが、**手ざわりの 谷が 締まる**。
         もう 読んで ある 値を 使うので ただ。 */
      cav = mix(1.0, 0.45 + h0 * 1.1, clamp(u_mat3.z * 1.4, 0.0, 1.0));
      vec3 bumpD = vec3((hX - h0) * an.x + (h0 - hY) * an.y, 0.0,
                     (h0 - hX) * an.z + (hY - h0) * an.y);
      N = normalize(N0 + bumpD * u_mat3.z * 26.0);
    }
  }

  /* ══ 表面の むら（2026-09-02）════════════════════════════════════
     1 色で 塗ると 全部 プラスチックに 見える。世界の 座標で
     ゆるい 波を 掛けるだけで **岩は 岩、木は 木**に 見えはじめる。
     絵を 1 枚も 読まない ので、遅い 回線でも 増えない。 */
  if (u_mat.z > 0.001) {
    highp vec3 q = v_world * u_mat2.y;
    float n = sin(q.x * 1.7 + sin(q.z * 2.3)) * 0.5 + sin(q.y * 2.1 + q.z * 1.3) * 0.5;
    base *= 1.0 + n * u_mat.z;
  }

  /* ══ つや（2026-09-02 に 作り直し）════════════════════════════════
     直す前は **3 段に 割った トゥーン**だった。段が 見えると
     「塗った プラスチック」に 見える（Rinty さん「安っぽすぎる」）。
     いまは 実際の 反射に 近い 式（GGX）を 使う:
       ・**ざらつき（粗さ）**で つやの 広がりが 決まる
         → 磨いた 金属は 点に、岩は 広くぼんやり
       ・**ふちほど 強く 光る**（フレネル）。これが 無いと 物が 平たく 見える
       ・金属は **自分の 色**で 光り、非金属は 白で 光る
     材質ごとの 粗さは もう 入れて ある（u_mat3.w）。 */
  vec3 H = normalize(L + V);
  float rough = clamp(u_mat3.w, 0.06, 1.0);
  float ar = rough * rough;
  float NdH = max(dot(N, H), 0.0);
  float NdV = max(dot(N, V), 0.0001);
  float NdL = max(dot(N, L), 0.0);
  float dd = (NdH * NdH) * (ar * ar - 1.0) + 1.0;
  float Dg = (ar * ar) / (3.14159265 * dd * dd + 1e-5);
  float kg = ar * 0.5;
  float Gg = (NdL / (NdL * (1.0 - kg) + kg + 1e-5)) * (NdV / (NdV * (1.0 - kg) + kg + 1e-5));
  vec3  F0 = mix(vec3(0.04), base, u_mat.w);
  float FH = pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3  Fg = F0 + (1.0 - F0) * FH;
  vec3  spec3 = Dg * Gg * Fg * 0.25 / NdV;
  /* 明るすぎ 防止。段の 低い 端末でも 白飛びさせない。 */
  spec3 = min(spec3, vec3(6.0)) * u_mat.y;

  /* 縁の 光。輪郭が 分かれて おもちゃに 見える。 */
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * v_params.y;

  /* 縞（走路の 端・危ないところ）*/
  float stripe = 1.0;
  if (v_params.z > 0.001) {
    float t = fract((v_uv.x + v_uv.y) * v_params.z);
    stripe = mix(1.0, 0.62, step(0.5, t));
  }

  /* ══ 床の 目地 ═══════════════════════════════════════════════════
     世界の 座標で 引く ので、走ると 流れて **速さが 目で 分かる**。

     ★ 「どこが 床か」は **描く 側が 教える**（v_params.w が 負）。
       法線から 当てようと して 2 度 失敗した（2026-08-31・実測）:
         ① 丸めた 箱の 法線は 床の 上でも 0.58〜1.0 で 揺れる。
            N.y > 0.55 の 判定が ほとんど 通らbumpD **1 本も 出なかった**。
         ② 画素の 傾き（dFdx）で 面の 向きを 取る 手も、
            ESSL1 では 拡張が 要り、端末に よって 作れない
            （WebGL2 でも 'dFdx' : no matching overloaded function found）。
       教えて もらえば どちらも 要らない。仕掛けや 飾りに 目地が
       乗らないので 絵としても こちらが 正しい。
     ★ v_params.w は 本来 「揺れ」。**正の ときだけ 揺らす**ので、
       負を 「床の 印」に 使っても 揺れの 邪魔を しない。 */
  float grid = 1.0;
  if (u_grid.y > 0.001 && v_params.w < -0.5) {
    highp float d = length(u_camPos - v_world);
    float fade = 1.0 - clamp((d - u_grid.z) / max(1.0, u_grid.w - u_grid.z), 0.0, 1.0);
    if (fade > 0.004) {
      highp vec2 q = v_world.xz / u_grid.x;
      highp vec2 fq = abs(fract(q - 0.5) - 0.5);
      /* 目地の 線。**細すぎると 見えない**（0.055 では 4 画素で 11% しか
         暗く ならず、実写では 一本も 見えなかった）。太さは ます目の 1 割。 */
      float line = 1.0 - smoothstep(0.0, 0.10, min(fq.x, fq.y));
      /* 市松。線より こちらの ほうが 走っている 感じが 出る。 */
      highp vec2 cell = floor(q);
      float chk = mod(cell.x + cell.y, 2.0);
      /* 大きい ます目（4 倍）も 薄く 重ねる。奥行きの 目安。 */
      highp vec2 f2 = abs(fract(q * 0.25 - 0.5) - 0.5);
      float line2 = 1.0 - smoothstep(0.0, 0.026, min(f2.x, f2.y));
      grid = 1.0 + u_grid.y * fade * ((chk - 0.5) * 0.34 - max(line, line2 * 1.15) * 0.9);
    }
  }

  /* ★ 頂点ごとの 明るさ（2026-09-02）。
     v_params.z（縞の 細かさ）が **負**の ときだけ、v_uv.y を
     「その 頂点の 明るさ」として 使う。
     これで **1 つの 色で 描いた 広い 地面に むらが 出る**。
     頂点も 描く 回数も 増えない ので、ただで 質が 上がる。
     ふつうの 縞（z > 0）には 影響しない。 */
  if (v_params.z < -0.5) base *= (0.74 + v_uv.y * 0.52);

  /* 肌の 明暗と くぼみの 陰りを 色へ。1.0 が 素の 明るさ。 */
  base *= mix(1.0, skinL * cav, step(0.5, u_mat3.x));
  /* 金属は 拡散が ほとんど 無い（光を 跳ね返す だけ）。 */
  vec3 dif = base * (1.0 - u_mat.w * 0.82);
  vec3 col = dif * stripe * grid * (amb + u_lightColor * nl * sh);
  col += u_lightColor * spec3 * sh;
  /* ★ 空の 映り込み（安い IBL）。つるつるな ものほど 強く 映る。
     これが 入ると 金属と 水が 一気に 「その場に ある」ように なる。 */
  {
    vec3 Rv = reflect(-V, N);
    vec3 skyc = mix(u_ambBottom, u_ambTop, Rv.y * 0.5 + 0.5) * 2.2;
    col += F0 * skyc * (1.0 - rough) * (0.35 + FH * 0.65);
  }
  col += base * rim;

  /* 葉ごしの 光。葉・草・布は **裏から 透ける**。
     これが 無いと 木が 板の 集まりに 見える。 */
  if (u_mat2.x > 0.001) {
    float bk = pow(max(dot(V, -L), 0.0), 3.0);
    col += base * u_lightColor * bk * u_mat2.x * sh;
  }
  /* ふちの 空うつり。水・氷・磨いた 床。 */
  if (u_mat2.z > 0.001) {
    float fr = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col = mix(col, u_ambTop * 1.8 + u_lightColor * 0.24, clamp(fr * u_mat2.z, 0.0, 0.86));
  }
  /* 自ら光る。16 ビットの 板の ときは 1 を 超えて 出し、にじみに 拾わせる。
     ★ max(1.0, …) に して いたので **1 未満に 弱められなかった**。
       にじみの 無い 端末では 弱めたい ので 下限を 外す（2026-08-31）。 */
  col += base * v_params.x * u_emissiveBoost;

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
/* ★ 夜の 風景（ネオン・溶岩・決勝）は 空が **ただの 暗い 面**だった。
   星を 置くと 一気に 「場所」に なる。板も 費用も 要らない。 */
uniform float u_stars;
uniform vec3  u_starTint;
/* ★ 遠くの 地平（2026-08-31・訴え「背景に 土台が ない」「地面が ない」）。
   x=出す(0/1) y=尾根の 高さ z=とがり(0 なだらか〜1 峰) w=根もとの 高さ */
uniform vec4 u_land;
uniform vec3 u_landA;
uniform vec3 u_landB;
/* ★ 稜線の 根もとは **霧の 色**へ 溶かす（空の 色では ない）。
   根もとが 触れて いるのは 地面の 遠い 端＝霧の 色 なので、
   空の 色へ 溶かすと そこに 横一文字の 線が 出る（実写で 出た）。 */
uniform vec3 u_fogCol;

/* 安い 雑音（値ノイズ）。雲の 帯 用。 */
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

/* 街の 影（0〜1）。夜の 風景 用。
   ★ 方角を こま切れに して、こま ごとに 1 本 建てる。
     こまの 中では 高さが 変わらない ので 上が 平らな ビルに なる。
     山と 同じく **単位円の 上**を なぞる ので 継ぎ目は 出ない。 */
float city(vec2 q, float seed) {
  vec2 g = floor(q * 26.0 + seed);
  float r = hash(g);
  /* 5 本に 1 本は 空き地。ぎっしり 建てると ただの 壁に 見える。 */
  if (hash(g + 41.7) < 0.20) return 0.08;
  return 0.20 + r * 0.80;
}

/* 尾根の 高さ（0〜1）。
   ★ **方角を 円の 上の 点として 読む。** atan で 角に すると
     ±π の ところで 稜線が 縦に 割れる。
     単位円の 上を なぞる 限り 雑音は どこまでも 続く。 */
float ridge(vec2 q, float seed, float sharp) {
  /* ★ 最初は 2.3 / 5.7 / 12.5 だった。q は **単位円の 上**を 動くので、
     2.3 では 360 度 ぜんぶで 山が 2 つ しか 立たない。
     視界は その 6 分の 1 なので **ただの 緑の 帯**に 見えた（実写）。
     見える 範囲に 山が 3 つ 4 つ 入る 細かさに する。 */
  float n = noise(q * 7.0 + seed) * 0.52
          + noise(q * 16.0 + seed * 1.7) * 0.31
          + noise(q * 35.0 + seed * 2.9) * 0.17;
  float r = 1.0 - abs(n * 2.0 - 1.0);
  return mix(n, r * r, sharp);
}

void main() {
  vec4 far = u_invViewProj * vec4(v_ndc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - u_camPos);

  float h = dir.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(u_horizon, u_top, pow(clamp(h, 0.0, 1.0), 0.55));
    /* 星。方向を 格子に 割って、ます目 ごとに 1 粒 置く。
       地平の 近くは 薄く（霧に 埋もれる ほうが 自然）。 */
    if (u_stars > 0.001) {
      vec3 d3 = dir * 34.0;
      vec2 sp = vec2(d3.x + d3.z * 0.31, d3.y * 1.6 + d3.z * 0.11);
      vec2 gi = floor(sp);
      vec2 gf = fract(sp);
      float r1 = hash(gi);
      float r2 = hash(gi + 17.3);
      vec2 c2 = vec2(0.25 + r1 * 0.5, 0.25 + r2 * 0.5);
      float dd = length(gf - c2);
      /* 4 粒に 1 粒だけ。ぎっしりだと 砂に 見える。 */
      float keep = step(0.74, hash(gi + 3.1));
      /* またたき。位置ごとに 速さを 変える。 */
      float tw = 0.6 + 0.4 * sin(u_time * (1.1 + r1 * 2.2) + r2 * 6.28);
      float star = keep * tw * smoothstep(0.085, 0.0, dd);
      col += u_starTint * star * u_stars * smoothstep(0.02, 0.30, h);
    }
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

  /* ══ 遠くの 地平 ═══════════════════════════════════════════════════
     ★ 直す前は 空と 霧が ぶつかる だけで、地平の 向こうに **何も
       無かった**。どの コースも 白い 空間に 板が 浮いて 見える。
     ★ 板は 1 枚も 足さない。空を 塗る ついでに 稜線を 描く ので
       描き回数 0・面 0・霧の 影響も 受けない（いちばん 奥に 居る）。
     ★ 太陽の **あと**に 置く。先に 置くと 山の 向こうの 太陽が
       山を 突き抜けて 光る。 */
  if (u_land.x > 0.5 && h < u_land.w + u_land.y + 0.03) {
    vec2 hz = dir.xz;
    vec2 q = hz / max(length(hz), 1.0e-4);
    /* 奥（高い・霞む）→ 手前（低い・濃い）の 2 枚。
       手前を **低く** 置くのが 決めごと。逆に すると
       奥の 峰が 隠れて 1 枚に 見える。 */
    /* x が 2 なら 街（夜の 風景）、そうで なければ 山。 */
    float g2 = (u_land.x > 1.5) ? city(q, 0.0) : ridge(q, 0.0, u_land.z);
    float g1 = (u_land.x > 1.5) ? city(q * 1.62, 31.0) : ridge(q * 1.37, 7.3, u_land.z);
    float e2 = u_land.w + u_land.y * (0.24 + 0.76 * g2);
    float e1 = u_land.w + u_land.y * 0.58 * (0.20 + 0.80 * g1);
    float aa = 0.0018;
    /* ★ 下端を **べたに 塗らない。** 一色で 塗ると 稜線の 下が
       定規で 引いた ような 直線に なる（実写で 出た）。
       根もとへ 行くほど 空の 色へ 溶かすと 霞んで 見え、
       同時に 「奥行き」も 出る。 */
    float k2 = clamp((h - u_land.w) / max(e2 - u_land.w, 1.0e-4), 0.0, 1.0);
    float k1 = clamp((h - u_land.w) / max(e1 - u_land.w, 1.0e-4), 0.0, 1.0);
    vec3 c2 = mix(mix(u_landB, u_fogCol, 0.74), mix(u_landB, u_horizon, 0.34), k2);
    vec3 c1 = mix(mix(u_landA, u_fogCol, 0.48), mix(u_landA, u_horizon, 0.04), k1);
    col = mix(col, c2, smoothstep(e2 + aa, e2 - aa, h));
    col = mix(col, c1, smoothstep(e1 + aa, e1 - aa, h));
    /* 街の 上に 薄い 明かり（街あかりが 空へ 逃げる ぶん）。
       これが 無いと 夜の 街が **切り絵**に 見える。 */
    if (u_land.x > 1.5 && h > e2) {
      col += u_landB * exp(-(h - e2) * 44.0) * 0.20;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
