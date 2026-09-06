/* ══════════════════════════════════════════════════════════════════════════
   WebGL の 面倒だけを ここに 閉じ込める。

   ・WebGL2 を 先に 試し、無ければ WebGL1 ＋ 拡張で 落とす。
     （instancing と VAO は WebGL1 だと 拡張。呼び方が 変わるので ここで 吸収）
   ・shader の 作り損ないは **黙って 落とさない**。行番号つきで 投げる。
   ・uniform の 場所は 1 回 引いて 覚える（毎フレーム 引くと 遅い）。
   ══════════════════════════════════════════════════════════════════════════ */

/** WebGL1 の 拡張を WebGL2 と 同じ 呼び名に 揃えた 包み */
function wrapGL1(gl) {
  const inst = gl.getExtension("ANGLE_instanced_arrays");
  const vao = gl.getExtension("OES_vertex_array_object");
  gl.getExtension("OES_element_index_uint");
  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("WEBGL_depth_texture");
  gl.__isGL2 = false;
  gl.__hasInstancing = !!inst;
  gl.__hasVAO = !!vao;
  if (inst) {
    gl.drawArraysInstanced = inst.drawArraysInstancedANGLE.bind(inst);
    gl.drawElementsInstanced = inst.drawElementsInstancedANGLE.bind(inst);
    gl.vertexAttribDivisor = inst.vertexAttribDivisorANGLE.bind(inst);
  }
  if (vao) {
    gl.createVertexArray = vao.createVertexArrayOES.bind(vao);
    gl.bindVertexArray = vao.bindVertexArrayOES.bind(vao);
    gl.deleteVertexArray = vao.deleteVertexArrayOES.bind(vao);
  }
  return gl;
}

/**
 * 文脈を 作る。作れなければ null（呼ぶ側が 2D の 逃げ道へ 行く）。
 * @param {HTMLCanvasElement} canvas
 * @param {{antialias?:boolean, alpha?:boolean, powerPreference?:string}} opt
 */
export function createContext(canvas, opt = {}) {
  const attrs = {
    alpha: opt.alpha === true,
    antialias: opt.antialias !== false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: opt.powerPreference || "high-performance",
    failIfMajorPerformanceCaveat: false,
    desynchronized: true
  };
  let gl = null;
  try { gl = canvas.getContext("webgl2", attrs); } catch (e) {}
  if (gl) {
    gl.__isGL2 = true;
    gl.__hasInstancing = true;
    gl.__hasVAO = true;
    /* 深さの 精度を 稼ぐ拡張（あれば）*/
    try { gl.getExtension("EXT_color_buffer_float"); } catch (e) {}
    try { gl.__aniso = gl.getExtension("EXT_texture_filter_anisotropic"); } catch (e) {}
    return gl;
  }
  try { gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs); } catch (e) {}
  if (!gl) return null;
  return wrapGL1(gl);
}

/**
 * 画素の 傾き（dFdx/dFdy）が 使えるか を 見て、shader の 頭に 付ける 文字を 返す。
 *
 * ★ ここで 2 回 はまった（2026-08-31・実測）:
 *   ① WebGL2 では OES_standard_derivatives は getExtension で **null** を 返す。
 *      「無い」と 判断して #extension を 外すと、#ifdef が 立たず
 *      **静かに 効かなく なる**（丸めた 法線の ままに 戻る）。
 *   ② かと いって WebGL2 でも、shader が ESSL1（#version を 書かない）なら
 *      dFdx は **拡張を 立てないと 呼べない**
 *      （'dFdx' : no matching overloaded function found）。
 *   → 正解は 「WebGL2 でも #extension を 書く」。
 *     本当に 使えるかは **作ってみて 通ったか**で 決める（renderer 側）。
 *     #extension は ふつうの 文より 前に 置く。ここで まとめて 作る。
 */
export const DERIV_HEADER =
  "#extension GL_OES_standard_derivatives : enable\n#define VS_DERIV 1\n";

export function derivHeader(gl) {
  if (gl.__isGL2) return DERIV_HEADER;
  let ok = false;
  try { ok = !!gl.getExtension("OES_standard_derivatives"); } catch (e) { ok = false; }
  return ok ? DERIV_HEADER : "";
}

/* ── shader ───────────────────────────────────────────────────────────── */

function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    const lines = src.split("\n").map((l, i) => String(i + 1).padStart(4, " ") + " | " + l);
    /* 怒られた 行の 前後だけを 出す。全文だと 読めない。 */
    const m = /:(\d+):/.exec(log);
    let excerpt = lines.slice(0, 12).join("\n");
    if (m) {
      const n = Number(m[1]) - 1;
      excerpt = lines.slice(Math.max(0, n - 4), n + 5).join("\n");
    }
    gl.deleteShader(sh);
    throw new Error("[VocabuSurvive] shader 作り損ない (" + name + "):\n" + log + "\n" + excerpt);
  }
  return sh;
}

export class Program {
  /**
   * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
   * @param {string} vs 頂点
   * @param {string} fs 画素
   * @param {string} name 名前（怒られたとき 分かるように）
   */
  constructor(gl, vs, fs, name = "prog") {
    this.gl = gl;
    this.name = name;
    const v = compile(gl, gl.VERTEX_SHADER, vs, name + ".vs");
    const f = compile(gl, gl.FRAGMENT_SHADER, fs, name + ".fs");
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || "";
      gl.deleteProgram(p);
      throw new Error("[VocabuSurvive] program 繋ぎ損ない (" + name + "): " + log);
    }
    this.program = p;
    this._u = Object.create(null);
    this._a = Object.create(null);
    /* 使える名前を 先に 全部 引いておく（実行中に 引かない） */
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      if (!info) continue;
      const nm = info.name.replace(/\[0\]$/, "");
      this._u[nm] = gl.getUniformLocation(p, info.name);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      if (!info) continue;
      this._a[info.name] = gl.getAttribLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.program); return this; }
  attr(n) { const v = this._a[n]; return v === undefined ? -1 : v; }
  loc(n) { return this._u[n] || null; }
  u1f(n, x) { const l = this._u[n]; if (l) this.gl.uniform1f(l, x); return this; }
  u1i(n, x) { const l = this._u[n]; if (l) this.gl.uniform1i(l, x); return this; }
  u2f(n, x, y) { const l = this._u[n]; if (l) this.gl.uniform2f(l, x, y); return this; }
  u3f(n, x, y, z) { const l = this._u[n]; if (l) this.gl.uniform3f(l, x, y, z); return this; }
  u4f(n, x, y, z, w) { const l = this._u[n]; if (l) this.gl.uniform4f(l, x, y, z, w); return this; }
  u3v(n, a) { const l = this._u[n]; if (l) this.gl.uniform3fv(l, a); return this; }
  u4v(n, a) { const l = this._u[n]; if (l) this.gl.uniform4fv(l, a); return this; }
  uMat4(n, a) { const l = this._u[n]; if (l) this.gl.uniformMatrix4fv(l, false, a); return this; }
  destroy() { try { this.gl.deleteProgram(this.program); } catch (e) {} this.program = null; }
}

/* ── buffer ───────────────────────────────────────────────────────────── */

export function makeBuffer(gl, target, data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, usage || gl.STATIC_DRAW);
  return b;
}

/** 使い回す 動的 buffer。大きさが 足りなければ 倍に して 作り直す。 */
export class DynamicBuffer {
  constructor(gl, target, initialBytes) {
    this.gl = gl;
    this.target = target;
    this.capacity = Math.max(256, initialBytes | 0);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(target, this.buffer);
    gl.bufferData(target, this.capacity, gl.DYNAMIC_DRAW);
  }
  /** @param {ArrayBufferView} view 先頭から count バイトを 送る */
  upload(view, bytes) {
    const gl = this.gl;
    const n = bytes === undefined ? view.byteLength : bytes;
    gl.bindBuffer(this.target, this.buffer);
    if (n > this.capacity) {
      this.capacity = 1 << Math.ceil(Math.log2(n));
      gl.bufferData(this.target, this.capacity, gl.DYNAMIC_DRAW);
    }
    /* subarray で 「送る分だけ」に 切る。全部 送ると 無駄が 大きい。 */
    const sub = (n === view.byteLength) ? view
      : new Uint8Array(view.buffer, view.byteOffset, n);
    gl.bufferSubData(this.target, 0, sub);
  }
  destroy() { try { this.gl.deleteBuffer(this.buffer); } catch (e) {} this.buffer = null; }
}

/* ── 影を 焼く ための 入れ物 ───────────────────────────────────────────── */

/**
 * 深さだけを 描く 入れ物。WebGL2 は DEPTH_COMPONENT24、
 * WebGL1 は WEBGL_depth_texture が あれば 同じ、無ければ 色に 詰める。
 */
export function createShadowTarget(gl, size) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const isGL2 = !!gl.__isGL2;
  if (isGL2) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, size, size, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  if (isGL2) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    try { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); } catch (e) {}
    return null;
  }
  return { fb, tex, size };
}

/** 1×1 の 白。texture が 無いときの 差し替え。 */
export function whiteTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}
