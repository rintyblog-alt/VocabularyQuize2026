/* ══════════════════════════════════════════════════════════════════════
   engine/gl/context.js — WebGL2 の一式（プログラム・テクスチャ・FBO の世話）

   ★ 何をする所か
     createGL(canvas) が GLCtx を返す。compositor はこれ 1 つだけを相手にし、
     生の gl 呼び出しを自分で書かない。ここが面倒を全部引き受ける:
       ・program は **key で覚える**（毎フレーム compile したら即死する）
       ・uniform の場所と型を覚え、name から適切な uniform*() を選ぶ
       ・テクスチャと FBO を **プールして使い回す**（毎フレーム new は禁物）
       ・iOS の最大テクスチャ寸法を見て、超える素材は縮めて上げる
       ・コンテキスト喪失（webglcontextlost）を捕まえ、作り直せる形にする

   ★ なぜこの形か
     ・WebGL2 が無い端末（古い Android / 一部の iOS）では **null を返す**。
       呼ぶ側（compositor）は 2d に落ちる。ここで throw すると起動が死ぬ。
     ・program(key,…) が key ベースなのは、喪失から戻ったときに「同じ key で
       もう一度作れば元に戻る」ようにするため。喪失時は覚えた物を全部捨てる。
     ・float テクスチャは使わない（互換性優先。契約書 §4 の割り切り）。
     ・uv は **左上原点**（shaders.js と対の約束）。uploadSource は flipY:false、
       canvas 宛ての描画は uModel で Y を反転する（projection() が面倒を見る）。
       FBO 宛ては反転しない（FBO の texel 0 行目 = 画像の上）。

   ★ 触るときの注意
     ・公開メソッドは lost / disposed のとき **黙って no-op か null** を返す。
       例外を投げると再生ループが止まる（戻れなくなる）。
     ・program の compile 失敗は 1 度目だけ throw（ログ付き）。同じ key の
       2 度目は null + 警告（毎フレーム throw させない）。
     ・drawQuad は uTex/uTexB/uLut/uMask を 0/1/2/3 に固定で割り当てる。
     ・texture()/fbo() で借りた物は release…()/releaseFbo() で必ず返す。
       返さなくても壊れないが、プールが効かず GPU メモリが増える。
   ══════════════════════════════════════════════════════════════════════ */
"use strict";

import { scope } from "../../core/log.js";
import { VS_QUAD, fsCopy, TEXTURE_UNITS } from "./shaders.js";

const L = scope("gl");

/** 単位四角 [0,1]^2 → クリップ空間（FBO 宛て。上下はそのまま） */
export const MODEL_FBO = Object.freeze([2, 0, 0, 0, 2, 0, -1, -1, 1]);
/** 単位四角 [0,1]^2 → クリップ空間（canvas 宛て。Y を反転する） */
export const MODEL_SCREEN = Object.freeze([2, 0, 0, 0, -2, 0, -1, 1, 1]);

/**
 * 描画先に合う投影行列（列優先の mat3）。
 * compositor は `mat3Mul(projection(target), 変形行列)` を uModel に入れる。
 * @param {{fb?:any}|null} target null = canvas
 * @returns {Float32Array}
 */
export function projection(target) {
  return new Float32Array(target ? MODEL_FBO : MODEL_SCREEN);
}

/**
 * 列優先 mat3 の掛け算（a * b）。純関数なので Node で試験できる。
 * @param {ArrayLike<number>} a @param {ArrayLike<number>} b @returns {Float32Array}
 */
export function mat3Mul(a, b) {
  const o = new Float32Array(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    }
  }
  return o;
}

/**
 * mat3 を点に当てる（w で割る。当たり判定や吸着の計算にも使う）。
 * @param {ArrayLike<number>} m @param {number} x @param {number} y
 * @returns {[number, number]}
 */
export function applyMat3(m, x, y) {
  const w = m[2] * x + m[5] * y + m[8];
  const k = Math.abs(w) < 1e-9 ? 1 : w;
  return [(m[0] * x + m[3] * y + m[6]) / k, (m[1] * x + m[4] * y + m[7]) / k];
}

/** 単位行列（列優先 mat3） */
export function mat3Identity() { return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); }

/** 行番号付きのソース（compile 失敗のログを読める形にする） */
function numbered(src) {
  return String(src || "").split("\n")
    .map((l, i) => `${String(i + 1).padStart(3, " ")}| ${l}`).join("\n");
}

/**
 * WebGL2 の一式を作る。**WebGL2 が使えなければ null**（2d に落ちる合図）。
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{alpha?:boolean, premultiplied?:boolean, desynchronized?:boolean,
 *          powerPreference?:string}} [opts]
 * @returns {object|null}
 */
export function createGL(canvas, opts) {
  const o = opts || {};
  if (!canvas || typeof canvas.getContext !== "function") {
    L.warn("createGL: canvas が無い");
    return null;
  }
  const alpha = o.alpha !== false;
  const premultiplied = o.premultiplied === true;
  /** @type {WebGL2RenderingContext|null} */
  let gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha,
      premultipliedAlpha: premultiplied,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      desynchronized: o.desynchronized !== false,
      powerPreference: o.powerPreference || "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    L.warn("webgl2 の取得で例外", e);
    gl = null;
  }
  if (!gl) {
    L.warn("WebGL2 が使えない端末（compositor は 2d に落ちる）");
    return null;
  }

  const limits = Object.freeze({
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0 || 2048,
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) | 0 || 2048,
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) | 0 || 8,
    maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS) | 0 || 8,
  });

  /* ── 覚えておく物（喪失したら全部捨てる） ─────────────────── */
  const programs = new Map();          // key → WebGLProgram
  const failedKeys = new Set();        // compile に失敗した key
  const uniLocs = new Map();           // program → { name: location }
  const uniTypes = new Map();          // program → { name: GLenum }
  const liveTex = new Set();           // 生きているテクスチャ（stats / dispose 用）
  const texPool = new Map();           // 寸法の印 → Tex[]
  const liveFbo = new Set();
  const fboPool = new Map();
  const lostCbs = new Set();
  const restoredCbs = new Set();
  const state = { lost: false, disposed: false, draws: 0 };
  let quadVao = null;
  let quadVbo = null;
  let scratchA = null;                 // 素材を縮めるときの作業場
  let scratchB = null;

  /* ── 喪失と復帰 ───────────────────────────────────────────── */
  function forgetAll() {
    programs.clear(); failedKeys.clear();
    uniLocs.clear(); uniTypes.clear();
    liveTex.clear(); texPool.clear();
    liveFbo.clear(); fboPool.clear();
    quadVao = null; quadVbo = null;
  }
  function handleLost(ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    state.lost = true;
    forgetAll();   /* GL の物は全部無効。key で作り直せるので捨てて良い */
    L.warn("WebGL のコンテキストを失った（復帰を待つ）");
    for (const fn of lostCbs) { try { fn(); } catch (e) { L.error("onLost で例外", e); } }
  }
  function handleRestored() {
    state.lost = false;
    initObjects();
    L.log("WebGL のコンテキストが戻った");
    for (const fn of restoredCbs) { try { fn(); } catch (e) { L.error("onRestored で例外", e); } }
  }
  if (typeof canvas.addEventListener === "function") {
    canvas.addEventListener("webglcontextlost", handleLost, false);
    canvas.addEventListener("webglcontextrestored", handleRestored, false);
  }

  /** 四角 1 枚の VBO/VAO（aPos は location 0 に固定するので 1 個で足りる） */
  function initObjects() {
    quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }
  initObjects();

  /** 今 GL を触って良いか */
  function ok() { return !state.lost && !state.disposed; }

  /* ── プログラム ───────────────────────────────────────────── */
  function compile(type, src, key) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh) || "(ログ無し)";
      gl.deleteShader(sh);
      const kind = type === gl.VERTEX_SHADER ? "頂点" : "断片";
      throw new Error(`program(${key}): ${kind}シェーダの compile に失敗\n${info}\n${numbered(src)}`);
    }
    return sh;
  }

  /**
   * key で覚えるプログラム。1 度目の失敗は **ログ付きで throw**、
   * 同じ key の 2 度目は null + 警告（毎フレーム throw させない）。
   */
  function program(key, vsSrc, fsSrc) {
    if (!ok()) return null;
    const k = String(key);
    const hit = programs.get(k);
    if (hit) return hit;
    if (failedKeys.has(k)) {
      L.warn(`program(${k}): 前に失敗した組み合わせなので諦める`);
      return null;
    }
    let vs = null, fs = null, p = null;
    try {
      vs = compile(gl.VERTEX_SHADER, vsSrc, k);
      fs = compile(gl.FRAGMENT_SHADER, fsSrc, k);
      p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "aPos");   /* VAO を 1 個で済ませるため */
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(p) || "(ログ無し)";
        throw new Error(`program(${k}): link に失敗\n${info}`);
      }
    } catch (e) {
      failedKeys.add(k);
      if (p) gl.deleteProgram(p);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      throw e;
    }
    /* 成功したら shader 本体は要らない（program が持っている） */
    gl.detachShader(p, vs); gl.detachShader(p, fs);
    gl.deleteShader(vs); gl.deleteShader(fs);
    programs.set(k, p);
    return p;
  }

  /* ── uniform ──────────────────────────────────────────────── */
  /** 場所を 1 度だけ引いて覚える（getUniformLocation は毎フレーム呼ぶには重い） */
  function uniforms(prog) {
    if (!prog || !ok()) return Object.create(null);
    const hit = uniLocs.get(prog);
    if (hit) return hit;
    const locs = Object.create(null);
    const types = Object.create(null);
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) | 0;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      const loc = gl.getUniformLocation(prog, info.name);
      if (!loc) continue;
      const base = info.name.replace(/\[0\]$/, "");
      locs[base] = loc;
      types[base] = info.type;
      if (base !== info.name) { locs[info.name] = loc; types[info.name] = info.type; }
    }
    uniLocs.set(prog, locs);
    uniTypes.set(prog, types);
    return locs;
  }

  /** {tex, unit} の tex は Tex でも生の WebGLTexture でも受ける */
  function rawTex(t) {
    if (!t) return null;
    return t.tex !== undefined ? t.tex : t;
  }

  function bindUnit(unit, tex) {
    const u = Math.max(0, Math.min(3, unit | 0));
    gl.activeTexture(gl.TEXTURE0 + u);
    gl.bindTexture(gl.TEXTURE_2D, rawTex(tex));
    return u;
  }

  /**
   * 型は **実際の GL の型**（getActiveUniform）で決める。
   * CONTRACT-NOTE: 契約書は「name から型を推測」と書いてあるが、それだと
   *   float[16]（uCurveRGB）と mat4 がどちらも「長さ 16」で見分けられない。
   *   実型が分かる場所が在るのだからそれを使い、分からないときだけ
   *   名前と長さで推測する（結果は契約と同じで、事故が減るだけ）。
   */
  function setOne(loc, type, name, v) {
    if (v === null || v === undefined) return;
    if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Float32Array) &&
        (v.unit !== undefined || v.tex !== undefined)) {
      gl.uniform1i(loc, bindUnit(v.unit !== undefined ? v.unit : 0, v.tex));
      return;
    }
    if (typeof v === "boolean") { gl.uniform1i(loc, v ? 1 : 0); return; }
    if (typeof v === "number") {
      const isInt = type === gl.INT || type === gl.BOOL || type === gl.UNSIGNED_INT ||
        type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE || type === gl.SAMPLER_3D ||
        type === gl.SAMPLER_2D_ARRAY;
      if (isInt) gl.uniform1i(loc, v | 0); else gl.uniform1f(loc, v);
      return;
    }
    const a = v instanceof Float32Array ? v : Array.isArray(v) ? new Float32Array(v) : null;
    if (!a) { L.warn(`setUniforms: ${name} に知らない形の値`); return; }
    switch (type) {
      case gl.FLOAT_VEC2: gl.uniform2fv(loc, a); return;
      case gl.FLOAT_VEC3: gl.uniform3fv(loc, a); return;
      case gl.FLOAT_VEC4: gl.uniform4fv(loc, a); return;
      case gl.FLOAT_MAT2: gl.uniformMatrix2fv(loc, false, a); return;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, a); return;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, a); return;
      case gl.FLOAT: gl.uniform1fv(loc, a); return;
      case gl.INT: case gl.BOOL: gl.uniform1iv(loc, new Int32Array(a)); return;
      case gl.INT_VEC2: gl.uniform2iv(loc, new Int32Array(a)); return;
      case gl.INT_VEC3: gl.uniform3iv(loc, new Int32Array(a)); return;
      case gl.INT_VEC4: gl.uniform4iv(loc, new Int32Array(a)); return;
      default: break;
    }
    /* 型が分からないとき（起きないはずだが黙って外さない） */
    if (a.length === 9 && /model|mat/i.test(name)) gl.uniformMatrix3fv(loc, false, a);
    else if (a.length === 16 && /model|mat/i.test(name)) gl.uniformMatrix4fv(loc, false, a);
    else if (a.length === 2) gl.uniform2fv(loc, a);
    else if (a.length === 3) gl.uniform3fv(loc, a);
    else if (a.length === 4) gl.uniform4fv(loc, a);
    else gl.uniform1fv(loc, a);
  }

  /** name → 値 の一覧を詰める。使われていない uniform は黙って飛ばす */
  function setUniforms(prog, values) {
    if (!prog || !values || !ok()) return;
    const locs = uniforms(prog);
    const types = uniTypes.get(prog) || Object.create(null);
    for (const name in values) {
      const loc = locs[name];
      if (!loc) continue;
      setOne(loc, types[name], name, values[name]);
    }
  }

  /* ── テクスチャ（プールして使い回す） ─────────────────────── */
  const FILTERS = { nearest: gl.NEAREST, linear: gl.LINEAR };
  const WRAPS = { clamp: gl.CLAMP_TO_EDGE, repeat: gl.REPEAT, mirror: gl.MIRRORED_REPEAT };

  function texSig(w, h, filter, wrap) { return `${w}x${h}|${filter}|${wrap}`; }

  /**
   * 空のテクスチャを借りる（RGBA8。float は使わない = 互換性優先）。
   * 返すときは releaseTexture(tex)。
   */
  function texture(o) {
    if (!ok()) return null;
    const a = o || {};
    const width = Math.max(1, Math.min(limits.maxTextureSize, Math.floor(a.width || 1)));
    const height = Math.max(1, Math.min(limits.maxTextureSize, Math.floor(a.height || 1)));
    const filter = a.filter === "nearest" ? "nearest" : "linear";
    const wrap = a.wrap === "repeat" ? "repeat" : a.wrap === "mirror" ? "mirror" : "clamp";
    const sig = texSig(width, height, filter, wrap);
    const pool = texPool.get(sig);
    if (pool && pool.length > 0) {
      const reused = pool.pop();
      reused.pooled = false;
      return reused;
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FILTERS[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FILTERS[filter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAPS[wrap]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAPS[wrap]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const out = {
      tex: t, width, height, filter, wrap, sig,
      scale: 1, flipY: false, pooled: false, stale: false,
      sourceWidth: width, sourceHeight: height, lutSize: 0, tiles: null,
    };
    liveTex.add(out);
    return out;
  }

  /** 借りたテクスチャを返す（次の同じ寸法の要求で使い回される） */
  function releaseTexture(t) {
    if (!t || t.pooled || !ok() || !liveTex.has(t)) return;
    t.pooled = true;
    t.stale = false;
    const pool = texPool.get(t.sig);
    if (pool) pool.push(t); else texPool.set(t.sig, [t]);
  }

  /** 本当に捨てる（寸法が変わって使い道が無くなった物） */
  function destroyTexture(t) {
    if (!t || !liveTex.has(t)) return;
    liveTex.delete(t);
    const pool = texPool.get(t.sig);
    if (pool) { const i = pool.indexOf(t); if (i >= 0) pool.splice(i, 1); }
    if (ok() && t.tex) gl.deleteTexture(t.tex);
    t.tex = null;
  }

  /** 素材の寸法（video / image / canvas / ImageBitmap / ImageData / VideoFrame） */
  function sourceSize(s) {
    if (!s || typeof s !== "object") return [0, 0];
    const w = s.videoWidth || s.naturalWidth || s.displayWidth || s.width || 0;
    const h = s.videoHeight || s.naturalHeight || s.displayHeight || s.height || 0;
    return [Math.floor(w), Math.floor(h)];
  }

  /** 最大寸法に収まる大きさと縮小率（iOS は 4096 の端末が在る） */
  function fitSize(w, h) {
    const m = limits.maxTextureSize;
    const big = Math.max(w, h);
    if (big <= m || big <= 0) return { width: Math.max(1, w), height: Math.max(1, h), scale: 1 };
    const scale = m / big;
    return {
      width: Math.max(1, Math.floor(w * scale)),
      height: Math.max(1, Math.floor(h * scale)),
      scale,
    };
  }

  /** 縮小用の作業 canvas（OffscreenCanvas が在ればそれを使う） */
  function makeScratch() {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(2, 2);
    if (typeof document !== "undefined" && document.createElement) return document.createElement("canvas");
    return null;
  }
  function scratchOf(which, w, h) {
    let c = which === "a" ? scratchA : scratchB;
    if (!c) { c = makeScratch(); if (which === "a") scratchA = c; else scratchB = c; }
    if (!c) return null;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }

  /** 大きすぎる素材を縮める。ImageData は 1 度 canvas に置いてから縮める */
  function shrink(src, sw, sh, fit) {
    let from = src;
    if (typeof ImageData !== "undefined" && src instanceof ImageData) {
      const full = scratchOf("a", sw, sh);
      if (!full) return null;
      const fc = full.getContext("2d");
      if (!fc) return null;
      fc.putImageData(src, 0, 0);
      from = full;
    }
    const small = scratchOf("b", fit.width, fit.height);
    if (!small) return null;
    const sc = small.getContext("2d");
    if (!sc) return null;
    sc.clearRect(0, 0, fit.width, fit.height);
    try {
      sc.drawImage(from, 0, 0, sw, sh, 0, 0, fit.width, fit.height);
    } catch (e) {
      L.warn("素材を縮められなかった", e);
      return null;
    }
    return small;
  }

  /**
   * 素材を GPU に上げる。tex を渡すと寸法が同じなら中身だけ差し替える。
   * ・最大寸法を超える素材は縮めて上げ、縮小率を `tex.scale` に入れる
   * ・まだ 1 フレームも来ていない <video> は前の絵を残して `tex.stale = true`
   *   （tex が無いときは null。呼ぶ側はその層を飛ばせる）
   */
  function uploadSource(tex, source, o) {
    if (!ok()) return null;
    const flipY = !!(o && o.flipY);
    const [sw, sh] = sourceSize(source);
    const notReady = !source || sw <= 0 || sh <= 0 ||
      (source.readyState !== undefined && source.readyState < 2);
    if (notReady) {
      if (tex) { tex.stale = true; return tex; }
      L.warn("uploadSource: 素材がまだ読めない（この層は飛ばす）");
      return null;
    }
    const fit = fitSize(sw, sh);
    const up = fit.scale < 1 ? shrink(source, sw, sh, fit) : source;
    if (!up) return tex || null;

    let t = tex;
    if (!t || t.width !== fit.width || t.height !== fit.height) {
      if (t) destroyTexture(t);
      t = texture({ width: fit.width, height: fit.height, filter: "linear", wrap: "clamp" });
      if (!t) return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY ? 1 : 0);
    /* シェーダは straight alpha で計算するので、上げる絵も premultiply しない
       （canvas 側の premultipliedAlpha とは別の話。ここを合わせると縁が濁る） */
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, up);
    } catch (e) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      t.stale = true;
      L.warn("uploadSource: texImage2D が拒んだ（前の絵を使う）", e);
      return t;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    t.scale = fit.scale;
    t.flipY = flipY;
    t.stale = false;
    t.sourceWidth = sw;
    t.sourceHeight = sh;
    return t;
  }

  /**
   * 3D LUT を 2D のタイルに展開して上げる。
   * cubeData: { size, data }（data は 0..1 の Float32Array/配列 か 0..255 の Uint8Array。
   *            成分は 3 か 4。並びは r が最速 = .cube と同じ）
   * 形が合わないときは **理由の分かる Error を投げる**（黙って変な色にしない）。
   */
  function uploadLUT(cubeData) {
    if (!ok()) return null;
    const cube = cubeData && cubeData.data ? cubeData : { size: 0, data: cubeData };
    const data = cube.data;
    if (!data || typeof data.length !== "number") {
      throw new Error("uploadLUT: data が無い（{ size, data } を渡す）");
    }
    let size = Math.round(cube.size || 0);
    let comps = 0;
    for (const c of [3, 4]) {
      if (size > 0 && data.length === size * size * size * c) { comps = c; break; }
    }
    if (comps === 0 && size <= 0) {
      for (const c of [3, 4]) {
        const n = Math.round(Math.cbrt(data.length / c));
        if (n > 1 && n * n * n * c === data.length) { size = n; comps = c; break; }
      }
    }
    if (comps === 0 || size < 2 || size > 64) {
      throw new Error(`uploadLUT: 寸法が合わない（size=${cube.size} 長さ=${data.length}）`);
    }
    const byte = data instanceof Uint8Array || data instanceof Uint8ClampedArray;
    const tilesX = Math.ceil(Math.sqrt(size));
    const tilesY = Math.ceil(size / tilesX);
    const width = size * tilesX;
    const height = size * tilesY;
    const px = new Uint8Array(width * height * 4);
    for (let b = 0; b < size; b++) {
      const cx = (b % tilesX) * size;
      const cy = Math.floor(b / tilesX) * size;
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const si = (r + g * size + b * size * size) * comps;
          const di = ((cy + g) * width + (cx + r)) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const v = data[si + ch];
            px[di + ch] = byte ? v : Math.max(0, Math.min(255, Math.round(v * 255)));
          }
          px[di + 3] = 255;
        }
      }
    }
    const t = texture({ width, height, filter: "linear", wrap: "clamp" });
    if (!t) return null;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindTexture(gl.TEXTURE_2D, null);
    t.lutSize = size;
    t.tiles = [tilesX, tilesY];
    return t;   /* compositor は uLutSize = t.lutSize, uLutTiles = t.tiles を詰める */
  }

  /* ── FBO とピンポン（毎フレーム作らない） ─────────────────── */
  function fbo(w, h) {
    if (!ok()) return null;
    const width = Math.max(1, Math.min(limits.maxTextureSize, Math.floor(w || 1)));
    const height = Math.max(1, Math.min(limits.maxTextureSize, Math.floor(h || 1)));
    const sig = `${width}x${height}`;
    const pool = fboPool.get(sig);
    if (pool && pool.length > 0) {
      const reused = pool.pop();
      reused.pooled = false;
      return reused;
    }
    const t = texture({ width, height, filter: "linear", wrap: "clamp" });
    if (!t) return null;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fb);
      destroyTexture(t);
      throw new Error(`fbo(${width}x${height}): 作れなかった（status=0x${status.toString(16)}）`);
    }
    const out = { fb, tex: t, width, height, sig, pooled: false };
    liveFbo.add(out);
    return out;
  }

  /** 借りた FBO を返す */
  function releaseFbo(f) {
    if (!f || f.pooled || !ok() || !liveFbo.has(f)) return;
    f.pooled = true;
    const pool = fboPool.get(f.sig);
    if (pool) pool.push(f); else fboPool.set(f.sig, [f]);
  }

  function destroyFbo(f) {
    if (!f || !liveFbo.has(f)) return;
    liveFbo.delete(f);
    const pool = fboPool.get(f.sig);
    if (pool) { const i = pool.indexOf(f); if (i >= 0) pool.splice(i, 1); }
    if (ok() && f.fb) gl.deleteFramebuffer(f.fb);
    destroyTexture(f.tex);
    f.fb = null;
  }

  /**
   * 効果チェーン用の 2 枚組。
   * read() が今の絵、write() が描き込み先。描いたら swap() で入れ替える。
   * 使い終わったら必ず release()（プールに戻る）。
   */
  function pingpong(w, h) {
    if (!ok()) return null;
    const a = fbo(w, h);
    const b = fbo(w, h);
    if (!a || !b) { if (a) releaseFbo(a); if (b) releaseFbo(b); return null; }
    let flip = 0;
    let freed = false;
    return {
      read: () => (flip ? b : a),
      write: () => (flip ? a : b),
      swap: () => { flip = flip ? 0 : 1; },
      release: () => {
        if (freed) return;
        freed = true;
        releaseFbo(a);
        releaseFbo(b);
      },
    };
  }

  /* ── 描画 ─────────────────────────────────────────────────── */
  /** 手で出来る合成だけ（screen/multiply… は fsBlend のシェーダでやる） */
  function setBlend(mode) {
    const m = String(mode || "normal").toLowerCase();
    if (m === "none" || m === "off" || m === "replace") { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (m === "add" || m === "lighter") {
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      return;
    }
    if (m === "premultiplied") {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return;
    }
    if (m !== "normal" && m !== "source-over") {
      L.warn(`drawQuad: blend "${m}" は固定機能では出せない（normal にする。fsBlend を使う）`);
    }
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * 四角 1 枚を描く。textures は [uTex, uTexB, uLut, uMask] の順（単位 0..3 固定）。
   * uModel を渡さなければ描画先いっぱいに描く（Y の向きも合わせる）。
   */
  function drawQuad(prog, o) {
    if (!prog || !ok() || !quadVao) return;
    const a = o || {};
    const target = a.target || null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const vw = target ? target.width : canvas.width;
    const vh = target ? target.height : canvas.height;
    gl.viewport(0, 0, vw, vh);
    if (a.clear) {
      const c = Array.isArray(a.clear) ? a.clear : [0, 0, 0, 0];
      gl.clearColor(c[0] || 0, c[1] || 0, c[2] || 0, c[3] === undefined ? 0 : c[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    setBlend(a.blend);
    gl.useProgram(prog);
    const locs = uniforms(prog);
    /* テクスチャ単位は契約どおり 0=uTex 1=uTexB 2=uLut 3=uMask に固定 */
    const list = a.textures || [];
    for (const name in TEXTURE_UNITS) {
      const unit = TEXTURE_UNITS[name];
      bindUnit(unit, list[unit] || null);
      if (locs[name]) gl.uniform1i(locs[name], unit);
    }
    const values = a.uniforms || {};
    if (locs.uModel && values.uModel === undefined) setOne(locs.uModel, gl.FLOAT_MAT3, "uModel", projection(target));
    if (locs.uRes && values.uRes === undefined) gl.uniform2f(locs.uRes, vw, vh);
    if (locs.uFlip && values.uFlip === undefined) gl.uniform2f(locs.uFlip, 0, 0);
    setUniforms(prog, values);
    gl.bindVertexArray(quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    state.draws++;
  }

  /** テクスチャを 1 枚そのまま写す（拡縮・最終出力・下げ描きに使う） */
  function blit(tex, target, o) {
    if (!ok() || !tex) return;
    const a = o || {};
    let p = null;
    try {
      p = program("__blit", VS_QUAD, fsCopy());
    } catch (e) {
      L.error("blit: 複写プログラムが作れない", e);
      return;
    }
    if (!p) return;
    drawQuad(p, {
      target,
      blend: a.blend || "normal",
      clear: a.clear,
      textures: [tex, null, null, null],
      uniforms: {
        uOpacity: a.opacity === undefined ? 1 : a.opacity,
        uTexRes: [tex.width || 1, tex.height || 1],
        uFlip: [a.flipX ? 1 : 0, a.flipY ? 1 : 0],
      },
    });
  }

  /** 描画先の大きさを変える（DPR は呼ぶ側が決める） */
  function resize(w, h) {
    const m = limits.maxTextureSize;
    const W = Math.max(1, Math.min(m, Math.floor(w || 1)));
    const H = Math.max(1, Math.min(m, Math.floor(h || 1)));
    if (Math.floor(w) > m || Math.floor(h) > m) {
      L.warn(`resize: ${Math.floor(w)}x${Math.floor(h)} は上限 ${m} を超えるので縮めた`);
    }
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    return { width: canvas.width, height: canvas.height };
  }

  function stats() {
    let pooledTex = 0;
    for (const arr of texPool.values()) pooledTex += arr.length;
    let pooledFbo = 0;
    for (const arr of fboPool.values()) pooledFbo += arr.length;
    return {
      textures: liveTex.size, fbos: liveFbo.size, programs: programs.size,
      draws: state.draws, pooledTextures: pooledTex, pooledFbos: pooledFbo,
      failed: failedKeys.size, lost: state.lost, disposed: state.disposed,
    };
  }

  function onLost(fn) {
    if (typeof fn !== "function") return () => {};
    lostCbs.add(fn);
    return () => lostCbs.delete(fn);
  }
  function onRestored(fn) {
    if (typeof fn !== "function") return () => {};
    restoredCbs.add(fn);
    return () => restoredCbs.delete(fn);
  }

  function dispose() {
    if (state.disposed) return;
    if (typeof canvas.removeEventListener === "function") {
      canvas.removeEventListener("webglcontextlost", handleLost, false);
      canvas.removeEventListener("webglcontextrestored", handleRestored, false);
    }
    if (!state.lost) {
      for (const f of [...liveFbo]) destroyFbo(f);
      for (const t of [...liveTex]) destroyTexture(t);
      for (const p of programs.values()) gl.deleteProgram(p);
      if (quadVao) gl.deleteVertexArray(quadVao);
      if (quadVbo) gl.deleteBuffer(quadVbo);
    }
    forgetAll();
    lostCbs.clear();
    restoredCbs.clear();
    scratchA = null;
    scratchB = null;
    state.disposed = true;
  }

  /** @type {object} 契約書 §4 の GLCtx */
  const ctx = {
    gl, canvas, limits,
    get lost() { return state.lost; },
    get disposed() { return state.disposed; },
    program, uniforms, setUniforms,
    texture, releaseTexture, destroyTexture,
    uploadSource, uploadLUT, fitSize,
    fbo, releaseFbo, destroyFbo, pingpong,
    drawQuad, blit, resize, stats,
    projection, mat3Mul, applyMat3, mat3Identity,
    onLost, onRestored, dispose,
  };
  return ctx;
}
