/* ══════════════════════════════════════════════════════════════════════════
   後処理（にじみ・階調・色の 調整・周辺減光）。

   訴え（2026-08-31・Rinty さん）「グラフィック。ここが 何も なってないと 詰まる」

   ★ 直す前の 絵（実写で 確認）:
       ・ネオンの コースが **ネオンに 見えない**。光る はずの 帯が ただの 青い 線。
       ・氷も 溶岩も 草原も 「同じ 平らな 面に 色を 塗った だけ」に 見える。
       ・明るい ところと 暗い ところの 差が 無い。空へ 溶けるだけ。
     絵は 出ていたが、**光っている ものが 光って いなかった**。

   ★ ここで やる こと（1 枚の 画面ぜんぶに 効く）:
       ① 場面を いったん 別の 板へ 描く（画面へ 直に 描かない）
       ② 明るい ところだけ 抜く（bright pass）
       ③ 1/4 の 大きさで 横→縦に ぼかす（安い。2 回 描くだけ）
       ④ 元の 絵に 足して、**階調・色・周辺減光**を かけて 画面へ

   ★ 速さの ために 決めた こと:
       ・ぼかしは **1/4 の 大きさ**。全画面で やると 4 倍 高い。
       ・段が low の ときは **まるごと 通さない**（前と 同じ 直描き）。
       ・板が 作れなければ ok=false。**「効いている ふり」を しない。**
       ・16 ビットの 板が 使えれば 使う（1 を 超える 明るさを 持てる＝本物の HDR）。
         使えなければ 8 ビットで、しきい値を 下げて それらしく する。

   ★ ぎざぎざ（MSAA）は 板へ 描くと 消える。WebGL2 なら 多重標本の
     renderbuffer → blitFramebuffer で 取り戻す。WebGL1 では 諦める
     （拡張が 無い。無い ものを ある ふりに しない）。
   ══════════════════════════════════════════════════════════════════════════ */
import { Program } from "./gl.js";

/* 画面いっぱいの 三角形 1 枚。四角 2 枚より 速く、継ぎ目も 出ない。 */
const FS_VS = `
precision highp float;
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/* ── ② 明るい ところだけ 抜く ─────────────────────────────────────── */
const BRIGHT_FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_threshold;   /* ここから 上を にじませる */
uniform float u_knee;        /* しきい値の まわりを なめらかに */
void main() {
  /* 4 点の 平均で 取る。1 点だと 細い 線が ちらつく。 */
  vec3 c = texture2D(u_tex, v_uv + vec2( u_texel.x,  u_texel.y)).rgb;
  c += texture2D(u_tex, v_uv + vec2(-u_texel.x,  u_texel.y)).rgb;
  c += texture2D(u_tex, v_uv + vec2( u_texel.x, -u_texel.y)).rgb;
  c += texture2D(u_tex, v_uv + vec2(-u_texel.x, -u_texel.y)).rgb;
  c *= 0.25;
  float b = max(c.r, max(c.g, c.b));
  /* しきい値の 前後を なめらかに 繋ぐ（硬いと 光の 縁が 階段に なる） */
  float k = max(1e-4, u_knee);
  float soft = clamp(b - u_threshold + k, 0.0, 2.0 * k);
  soft = soft * soft / (4.0 * k);
  float w = max(b - u_threshold, soft) / max(b, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

/* ── ③ ぼかし（横 or 縦。9 点を 5 回の 読みで）───────────────────── */
const BLUR_FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;        /* (texel,0) か (0,texel) */
void main() {
  /* 線形補間を 使って 9 点を 5 回で 読む（Gauss の 定石） */
  vec3 c = texture2D(u_tex, v_uv).rgb * 0.2270270270;
  vec2 o1 = u_dir * 1.3846153846;
  vec2 o2 = u_dir * 3.2307692308;
  c += texture2D(u_tex, v_uv + o1).rgb * 0.3162162162;
  c += texture2D(u_tex, v_uv - o1).rgb * 0.3162162162;
  c += texture2D(u_tex, v_uv + o2).rgb * 0.0702702703;
  c += texture2D(u_tex, v_uv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

/* ── ④ 合わせて 画面へ ────────────────────────────────────────────── */
const COMPOSITE_FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloom_k;      /* にじみの 強さ */
uniform float u_exposure;     /* 露出 */
uniform float u_contrast;     /* 対比 */
uniform float u_saturation;   /* 彩度 */
uniform vec3  u_lift;         /* 暗い ところの 色かぶり */
uniform vec3  u_gain;         /* 明るい ところの 色かぶり */
uniform float u_vignette;     /* 周辺減光 */
uniform float u_grain;        /* 粒子（うっすら。帯を 消す） */
uniform float u_time;
uniform vec2  u_texel;
uniform float u_sharp;        /* 輪郭を 少し 立てる */

/* ACES に 似た 曲線（安い 近似）。白飛びを 柔らかく する。 */
vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 col = texture2D(u_scene, v_uv).rgb;

  /* 輪郭を 少し 立てる（ぼかした ぶんを 引く。安い unsharp mask） */
  if (u_sharp > 0.001) {
    vec3 s = texture2D(u_scene, v_uv + vec2(u_texel.x, 0.0)).rgb
           + texture2D(u_scene, v_uv - vec2(u_texel.x, 0.0)).rgb
           + texture2D(u_scene, v_uv + vec2(0.0, u_texel.y)).rgb
           + texture2D(u_scene, v_uv - vec2(0.0, u_texel.y)).rgb;
    col += (col - s * 0.25) * u_sharp;
  }

  col += texture2D(u_bloom, v_uv).rgb * u_bloom_k;
  col *= u_exposure;
  col = tonemap(col);

  /* 色の 調整。暗部と 明部を 別々に 寄せる。 */
  col = col * u_gain + u_lift * (1.0 - col);

  /* 彩度と 対比 */
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, u_saturation);
  col = clamp((col - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  /* 周辺減光。中心から 離れるほど 落とす。 */
  if (u_vignette > 0.001) {
    vec2 d = v_uv - 0.5;
    float r = dot(d, d);
    col *= 1.0 - u_vignette * smoothstep(0.10, 0.62, r);
  }

  /* 粒。暗い ところの 帯（バンディング）を 消す ためだけ。目に 見えない 量。 */
  if (u_grain > 0.0001) {
    float n = hash(v_uv * 977.0 + fract(u_time) * 131.0) - 0.5;
    col += n * u_grain;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

/* ── 板を 1 枚 作る ───────────────────────────────────────────────── */
function makeTarget(gl, w, h, internal, format, type, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) { try { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); } catch (e) {} return null; }
  return { fb, tex, w, h };
}
function dropTarget(gl, t) {
  if (!t) return;
  try { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); } catch (e) {}
}

export class Post {
  /**
   * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
   * @param {{msaa?:number, hdr?:boolean}} [opt]
   */
  constructor(gl, opt) {
    this.gl = gl;
    this.ok = false;
    this.isGL2 = !!gl.__isGL2;
    this.msaa = Math.max(0, (opt && opt.msaa) | 0);
    this.w = 0; this.h = 0;
    this.scene = null; this.bright = null; this.blurA = null; this.blurB = null;
    this.depth = null; this.msColor = null; this.msDepth = null; this.msFb = null;
    this.hdr = false;

    /* 1 を 超える 明るさを 持てる 板が あるか。あれば 本物の にじみ。 */
    if (opt && opt.hdr !== false) {
      try {
        if (this.isGL2) {
          const f = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
          if (f) this.hdr = true;
        } else {
          const f = gl.getExtension("EXT_color_buffer_half_float");
          const t = gl.getExtension("OES_texture_half_float");
          gl.getExtension("OES_texture_half_float_linear");
          if (f && t) { this.hdr = true; this._halfType = t.HALF_FLOAT_OES; }
        }
      } catch (e) { this.hdr = false; }
    }

    try {
      this.pBright = new Program(gl, FS_VS, BRIGHT_FS, "post.bright");
      this.pBlur = new Program(gl, FS_VS, BLUR_FS, "post.blur");
      this.pComp = new Program(gl, FS_VS, COMPOSITE_FS, "post.comp");
      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.ok = true;
    } catch (e) {
      console.warn("[VocabuSurvive] 後処理を 用意できません:", e && e.message);
      this.ok = false;
    }

    /* 既定の 見た目。風景ごとに setGrade で 上書きする。 */
    this.params = {
      bloom: 0.62, threshold: 1.0, knee: 0.35,
      exposure: 1.06, contrast: 1.045, saturation: 1.10,
      lift: [0.0, 0.0, 0.012], gain: [1.0, 1.0, 1.0],
      vignette: 0.30, grain: 0.006, sharp: 0.18
    };
  }

  /** 風景ごとの 色の 調整を 入れる。無い 鍵は 触らない。 */
  setGrade(g) {
    if (!g) return;
    for (const k in g) if (g[k] !== undefined && g[k] !== null) this.params[k] = g[k];
  }

  _internal() {
    const gl = this.gl;
    if (!this.hdr) return { i: gl.RGBA, f: gl.RGBA, t: gl.UNSIGNED_BYTE };
    if (this.isGL2) return { i: gl.RGBA16F, f: gl.RGBA, t: gl.HALF_FLOAT };
    return { i: gl.RGBA, f: gl.RGBA, t: this._halfType };
  }

  /** 大きさを 合わせる。変わっていなければ 何も しない。 */
  resize(w, h) {
    if (!this.ok) return false;
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    if (w === this.w && h === this.h && this.scene) return true;
    const gl = this.gl;
    this._free();
    this.w = w; this.h = h;
    const F = this._internal();

    this.scene = makeTarget(gl, w, h, F.i, F.f, F.t, gl.LINEAR);
    if (!this.scene && this.hdr) {
      /* 16 ビットが 通らなかった。8 ビットへ 落として もう一度。 */
      this.hdr = false;
      const G = this._internal();
      this.scene = makeTarget(gl, w, h, G.i, G.f, G.t, gl.LINEAR);
    }
    if (!this.scene) { this.ok = false; return false; }

    /* 深さ。場面の 板と 同じ 大きさ。 */
    this.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, this.isGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this._free(); this.ok = false; return false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    /* ぎざぎざ 消し。WebGL2 だけ。多重標本 → blit で 場面の 板へ 移す。 */
    if (this.isGL2 && this.msaa > 0) {
      const max = gl.getParameter(gl.MAX_SAMPLES) || 0;
      const s = Math.min(this.msaa, max);
      if (s >= 2) {
        this.msFb = gl.createFramebuffer();
        this.msColor = gl.createRenderbuffer();
        this.msDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, this.hdr ? gl.RGBA16F : gl.RGBA8, w, h);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDepth);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFb);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDepth);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          try { gl.deleteFramebuffer(this.msFb); gl.deleteRenderbuffer(this.msColor); gl.deleteRenderbuffer(this.msDepth); } catch (e) {}
          this.msFb = this.msColor = this.msDepth = null;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    }

    /* にじみ用は 1/4。ここを 大きく すると 一気に 高く なる。 */
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bright = makeTarget(gl, bw, bh, F.i, F.f, F.t, gl.LINEAR);
    this.blurA = makeTarget(gl, bw, bh, F.i, F.f, F.t, gl.LINEAR);
    this.blurB = makeTarget(gl, bw, bh, F.i, F.f, F.t, gl.LINEAR);
    if (!this.bright || !this.blurA || !this.blurB) {
      /* にじみ だけ 諦める。階調と 色は 続けられる。 */
      dropTarget(gl, this.bright); dropTarget(gl, this.blurA); dropTarget(gl, this.blurB);
      this.bright = this.blurA = this.blurB = null;
    }
    return true;
  }

  /** 場面を ここへ 描く。呼んだ あと gl.viewport は こちらで 合わせる。 */
  bindScene() {
    if (!this.ok || !this.scene) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFb || this.scene.fb);
    gl.viewport(0, 0, this.w, this.h);
    return true;
  }

  _drawQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const a = prog.attr("a_pos");
    if (a >= 0) {
      gl.enableVertexAttribArray(a);
      if (gl.vertexAttribDivisor) gl.vertexAttribDivisor(a, 0);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (a >= 0) gl.disableVertexAttribArray(a);
  }

  /**
   * 画面へ 出す。
   * @param {number} outW 画面の 幅（画素）
   * @param {number} outH 画面の 高さ
   * @param {number} time 秒
   */
  present(outW, outH, time) {
    if (!this.ok || !this.scene) return false;
    const gl = this.gl;
    const P = this.params;

    /* 多重標本 → ふつうの 板へ 移す */
    if (this.msFb) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene.fb);
      gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    let bloomTex = null;
    if (this.bright && P.bloom > 0.001) {
      const bw = this.bright.w, bh = this.bright.h;
      /* ② 明るい ところを 抜く */
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bright.fb);
      gl.viewport(0, 0, bw, bh);
      const pb = this.pBright.use();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      pb.u1i("u_tex", 0)
        .u2f("u_texel", 1 / this.w, 1 / this.h)
        .u1f("u_threshold", this.hdr ? P.threshold : Math.min(P.threshold, 0.72))
        .u1f("u_knee", P.knee);
      this._drawQuad(pb);

      /* ③ 横 → 縦 */
      const pl = this.pBlur.use();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.fb);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bright.tex);
      pl.u1i("u_tex", 0).u2f("u_dir", 1 / bw, 0);
      this._drawQuad(pl);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.blurA.tex);
      pl.u2f("u_dir", 0, 1 / bh);
      this._drawQuad(pl);

      /* もう 一往復。1 回だけだと 光の 芯が 残って 汚い。 */
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.blurB.tex);
      pl.u2f("u_dir", 2 / bw, 0);
      this._drawQuad(pl);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.blurA.tex);
      pl.u2f("u_dir", 0, 2 / bh);
      this._drawQuad(pl);

      bloomTex = this.blurB.tex;
    }

    /* ④ 画面へ */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    const pc = this.pComp.use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    pc.u1i("u_scene", 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomTex || this.scene.tex);
    pc.u1i("u_bloom", 1);
    pc.u1f("u_bloom_k", bloomTex ? P.bloom : 0)
      .u1f("u_exposure", P.exposure)
      .u1f("u_contrast", P.contrast)
      .u1f("u_saturation", P.saturation)
      .u3v("u_lift", P.lift)
      .u3v("u_gain", P.gain)
      .u1f("u_vignette", P.vignette)
      .u1f("u_grain", P.grain)
      .u1f("u_sharp", P.sharp)
      .u2f("u_texel", 1 / this.w, 1 / this.h)
      .u1f("u_time", time || 0);
    this._drawQuad(pc);
    gl.activeTexture(gl.TEXTURE0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    return true;
  }

  _free() {
    const gl = this.gl;
    dropTarget(gl, this.scene); dropTarget(gl, this.bright);
    dropTarget(gl, this.blurA); dropTarget(gl, this.blurB);
    this.scene = this.bright = this.blurA = this.blurB = null;
    if (this.depth) { try { gl.deleteRenderbuffer(this.depth); } catch (e) {} this.depth = null; }
    if (this.msFb) { try { gl.deleteFramebuffer(this.msFb); } catch (e) {} this.msFb = null; }
    if (this.msColor) { try { gl.deleteRenderbuffer(this.msColor); } catch (e) {} this.msColor = null; }
    if (this.msDepth) { try { gl.deleteRenderbuffer(this.msDepth); } catch (e) {} this.msDepth = null; }
  }

  destroy() {
    this._free();
    try { this.gl.deleteBuffer(this.quad); } catch (e) {}
    try { this.pBright.destroy(); this.pBlur.destroy(); this.pComp.destroy(); } catch (e) {}
    this.ok = false;
  }
}
