/* ══════════════════════════════════════════════════════════════════════════
   描く。

   ここだけが WebGL を 知っている。ゲーム側は 「この形を ここへ この色で」と
   言うだけ。まとめ描き・視界の外を捨てる・LOD・影は 全部 ここが やる。

   1 フレームの 流れ:
     begin(カメラ) → draw(…) を 何度でも → end()

   draw は **積むだけ**。end で 形ごとに まとめて 1 回ずつ 描く。
   ══════════════════════════════════════════════════════════════════════════ */
import { createContext, Program, DynamicBuffer, createShadowTarget } from "./gl.js";
import { MAIN_VS, MAIN_FS, SHADOW_VS, SHADOW_FS, SKY_VS, SKY_FS } from "./shaders.js";
import { m4, v3 } from "./math.js";

/* 1 つ分の 並び（float 24 個 = 96 バイト）:
   0-15 行列 / 16-19 色 / 20-23 (自ら光る, 縁, 縞, 揺れ) */
export const STRIDE_F = 24;
const STRIDE_B = STRIDE_F * 4;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} settings boot/caps.js の settingsFor() の 戻り
   */
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.gl = createContext(canvas, { antialias: (settings.msaa | 0) > 0 });
    if (!this.gl) throw new Error("WEBGL_UNAVAILABLE");
    const gl = this.gl;
    this.isGL2 = !!gl.__isGL2;
    this.hasInstancing = !!gl.__hasInstancing;

    this.progMain = new Program(gl, MAIN_VS, MAIN_FS, "main");
    this.progShadow = new Program(gl, SHADOW_VS, SHADOW_FS, "shadow");
    this.progSky = new Program(gl, SKY_VS, SKY_FS, "sky");

    /* 空の 三角形 1 枚（画面いっぱい） */
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.meshes = new Map();       /* id → {lods:[{vbo,ibo,count,type,bound}], batches:[…]} */
    this.shadow = null;
    if (settings.shadow) {
      this.shadow = createShadowTarget(gl, settings.shadowSize);
      if (!this.shadow) this.settings = Object.assign({}, settings, { shadow: false });
    }

    /* 使い回す 一時もの（毎フレーム 作らない） */
    this._viewProj = m4.create();
    this._invViewProj = m4.create();
    this._shadowMat = m4.create();
    this._tmpM = m4.create();
    this._tmpV = m4.create();
    this._eye = v3.create();
    this._planes = new Float32Array(24);
    this._camPos = v3.create();

    this.stats = { draws: 0, instances: 0, culled: 0, tris: 0, meshes: 0 };
    this.time = 0;
    this.sky = {
      top: [0.36, 0.62, 0.94], horizon: [0.75, 0.87, 0.98], ground: [0.30, 0.40, 0.48],
      sun: [1.0, 0.95, 0.82]
    };
    this.light = { dir: v3.create(-0.42, -0.78, -0.46), color: [1.06, 1.02, 0.94] };
    v3.normalize(this.light.dir, this.light.dir);
    this.ambTop = [0.36, 0.42, 0.52];
    this.ambBottom = [0.20, 0.20, 0.24];
    this.fog = { color: [0.75, 0.87, 0.98], near: settings.drawDistance * 0.45, far: settings.drawDistance };
    this.shadowCenter = v3.create(0, 0, 0);
    this.shadowRadius = 34;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this._sized = { w: 0, h: 0 };
  }

  /* ── 形を 登録する ─────────────────────────────────────────────────
     lods は 粗い順ではなく **細かい順**（近い順）に 渡す。 */
  addMesh(id, lods) {
    const gl = this.gl;
    const list = Array.isArray(lods) ? lods : [lods];
    const built = list.map((m) => {
      const inter = new Float32Array(m.position.length / 3 * 8);
      for (let i = 0, v = 0; i < m.position.length; i += 3, v += 8) {
        inter[v] = m.position[i]; inter[v + 1] = m.position[i + 1]; inter[v + 2] = m.position[i + 2];
        inter[v + 3] = m.normal[i]; inter[v + 4] = m.normal[i + 1]; inter[v + 5] = m.normal[i + 2];
        inter[v + 6] = m.uv[(i / 3) * 2]; inter[v + 7] = m.uv[(i / 3) * 2 + 1];
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW);
      return {
        vbo, ibo, count: m.index.length,
        type: (m.index instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        bound: m.bound
      };
    });
    const entry = {
      id, lods: built,
      /* LOD ごとの 積み場 */
      buckets: built.map(() => ({ data: new Float32Array(STRIDE_F * 64), n: 0, buf: null }))
    };
    this.meshes.set(id, entry);
    this.stats.meshes = this.meshes.size;
    return entry;
  }

  hasMesh(id) { return this.meshes.has(id); }

  /* ── 1 フレーム ─────────────────────────────────────────────────── */

  resize() {
    const gl = this.gl, c = this.canvas;
    const s = this.settings;
    const cssW = c.clientWidth | 0, cssH = c.clientHeight | 0;
    /* ★ 隠れている ときは **触らない**。
       clientWidth が 0 の ときに 作り直すと 1×1 に 縮み、
       戻ってきた とき 1 フレーム 潰れた 絵が 出る。
       （タブを 切り替える・引き出しを 開く たびに 起きる） */
    if (cssW < 2 || cssH < 2) {
      return { w: this._sized.w || c.width, h: this._sized.h || c.height, cssW: cssW || 1, cssH: cssH || 1 };
    }
    let ratio = Math.min(s.dpr, s.pixelRatio * s.dpr);
    let w = Math.round(cssW * ratio), h = Math.round(cssH * ratio);
    /* 画素の 上限。大きい画面ほど 効く。 */
    const px = w * h;
    if (px > s.maxPixels) {
      const k = Math.sqrt(s.maxPixels / px);
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this._sized.w = w; this._sized.h = h;
    gl.viewport(0, 0, w, h);
    return { w, h, cssW, cssH };
  }

  /** 視錐台の 6 面を viewProj から 取り出す */
  _extractPlanes(m) {
    const p = this._planes;
    const rows = [
      [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],   /* 左 */
      [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],   /* 右 */
      [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],   /* 下 */
      [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],   /* 上 */
      [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],  /* 手前 */
      [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]]   /* 奥 */
    ];
    for (let i = 0; i < 6; i++) {
      const r = rows[i];
      const l = Math.hypot(r[0], r[1], r[2]) || 1;
      p[i * 4] = r[0] / l; p[i * 4 + 1] = r[1] / l; p[i * 4 + 2] = r[2] / l; p[i * 4 + 3] = r[3] / l;
    }
  }

  _inFrustum(x, y, z, r) {
    const p = this._planes;
    for (let i = 0; i < 6; i++) {
      if (p[i * 4] * x + p[i * 4 + 1] * y + p[i * 4 + 2] * z + p[i * 4 + 3] < -r) return false;
    }
    return true;
  }

  /**
   * @param {{viewProj:Float32Array, pos:Float32Array}} cam
   */
  begin(cam) {
    m4.copy(this._viewProj, cam.viewProj);
    m4.invert(this._invViewProj, this._viewProj);
    v3.copy(this._camPos, cam.pos);
    this._extractPlanes(this._viewProj);
    for (const e of this.meshes.values()) for (const b of e.buckets) b.n = 0;
    this.stats.draws = 0; this.stats.instances = 0; this.stats.culled = 0; this.stats.tris = 0;
  }

  /**
   * 積む。
   * @param {string} id      形の 名前
   * @param {Float32Array} mat 4x4
   * @param {number[]|Float32Array} color rgba
   * @param {number} emissive 自ら光る 0〜1
   * @param {number} rim      縁の 強さ 0〜1
   * @param {number} stripe   縞の 細かさ（0 で 無し）
   * @param {number} sway     揺れ（0 で 無し）
   * @param {number} scaleHint 当たり判定用の 大きさ（LOD と 視界判定に 使う）
   */
  draw(id, mat, color, emissive = 0, rim = 0.16, stripe = 0, sway = 0, scaleHint = 1) {
    const e = this.meshes.get(id);
    if (!e) return false;
    const x = mat[12], y = mat[13], z = mat[14];
    const r = e.lods[0].bound.r * scaleHint;
    if (!this._inFrustum(x, y, z, r)) { this.stats.culled++; return false; }
    const cp = this._camPos;
    const d = Math.hypot(x - cp[0], y - cp[1], z - cp[2]);
    if (d - r > this.settings.drawDistance) { this.stats.culled++; return false; }

    /* LOD。近い順に 入っているので 遠いほど 後ろへ。 */
    let li = 0;
    if (e.lods.length > 1) {
      const t = d / Math.max(1, this.settings.drawDistance);
      li = t > 0.42 ? Math.min(e.lods.length - 1, 2) : (t > 0.16 ? Math.min(e.lods.length - 1, 1) : 0);
    }
    const b = e.buckets[li];
    const need = (b.n + 1) * STRIDE_F;
    if (need > b.data.length) {
      const bigger = new Float32Array(Math.max(need, b.data.length * 2));
      bigger.set(b.data); b.data = bigger;
    }
    const o = b.n * STRIDE_F;
    b.data.set(mat, o);
    b.data[o + 16] = color[0]; b.data[o + 17] = color[1];
    b.data[o + 18] = color[2]; b.data[o + 19] = color.length > 3 ? color[3] : 1;
    b.data[o + 20] = emissive; b.data[o + 21] = rim; b.data[o + 22] = stripe; b.data[o + 23] = sway;
    b.n++;
    return true;
  }

  _bindMeshAttrs(prog, lod, withNormal) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, lod.vbo);
    const ap = prog.attr("a_pos");
    if (ap >= 0) { gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(ap, 0); }
    if (withNormal) {
      const an = prog.attr("a_nor");
      if (an >= 0) { gl.enableVertexAttribArray(an); gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribDivisor(an, 0); }
      const au = prog.attr("a_uv");
      if (au >= 0) { gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 32, 24); gl.vertexAttribDivisor(au, 0); }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lod.ibo);
  }

  _bindInstanceAttrs(prog, bucket, wantColor) {
    const gl = this.gl;
    if (!bucket.buf) bucket.buf = new DynamicBuffer(gl, gl.ARRAY_BUFFER, STRIDE_B * 64);
    bucket.buf.upload(bucket.data, bucket.n * STRIDE_B);
    gl.bindBuffer(gl.ARRAY_BUFFER, bucket.buf.buffer);
    const names = ["a_m0", "a_m1", "a_m2", "a_m3"];
    for (let i = 0; i < 4; i++) {
      const a = prog.attr(names[i]);
      if (a < 0) continue;
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE_B, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    if (wantColor) {
      const ac = prog.attr("a_color");
      if (ac >= 0) { gl.enableVertexAttribArray(ac); gl.vertexAttribPointer(ac, 4, gl.FLOAT, false, STRIDE_B, 64); gl.vertexAttribDivisor(ac, 1); }
    }
    const apm = prog.attr("a_params");
    if (apm >= 0) { gl.enableVertexAttribArray(apm); gl.vertexAttribPointer(apm, 4, gl.FLOAT, false, STRIDE_B, 80); gl.vertexAttribDivisor(apm, 1); }
  }

  _disableAll(prog) {
    const gl = this.gl;
    for (const n of ["a_pos", "a_nor", "a_uv", "a_m0", "a_m1", "a_m2", "a_m3", "a_color", "a_params"]) {
      const a = prog.attr(n);
      if (a >= 0) { gl.vertexAttribDivisor(a, 0); gl.disableVertexAttribArray(a); }
    }
  }

  /** 影の 向きの 行列を 作る。プレイヤーの 周りだけを 焼く。 */
  _updateShadowMat(center, radius) {
    const L = this.light.dir;
    const eye = this._eye;
    v3.set(eye, center[0] - L[0] * radius * 2.2, center[1] - L[1] * radius * 2.2, center[2] - L[2] * radius * 2.2);
    const up = (Math.abs(L[1]) > 0.98) ? [0, 0, 1] : [0, 1, 0];
    m4.lookAt(this._tmpV, eye, center, up);
    m4.ortho(this._tmpM, -radius, radius, -radius, radius, 0.1, radius * 5.0);
    m4.multiply(this._shadowMat, this._tmpM, this._tmpV);
  }

  end(dt) {
    const gl = this.gl;
    this.time += (dt || 0);

    /* ── 影を 焼く ── */
    if (this.settings.shadow && this.shadow) {
      this._updateShadowMat(this.shadowCenter, this.shadowRadius);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb);
      gl.viewport(0, 0, this.shadow.size, this.shadow.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      /* 影は 裏面を 焼く。自分の 面に 出る しま模様が 消える。 */
      gl.cullFace(gl.FRONT);
      const p = this.progShadow.use();
      p.uMat4("u_shadowMat", this._shadowMat).u1f("u_time", this.time);
      for (const e of this.meshes.values()) {
        for (let li = 0; li < e.lods.length; li++) {
          const b = e.buckets[li];
          if (!b.n) continue;
          this._bindMeshAttrs(p, e.lods[li], false);
          this._bindInstanceAttrs(p, b, false);
          gl.drawElementsInstanced(gl.TRIANGLES, e.lods[li].count, e.lods[li].type, 0, b.n);
        }
      }
      this._disableAll(p);
      gl.cullFace(gl.BACK);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this._sized.w, this._sized.h);
    }

    /* ── 空 ── */
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    {
      const p = this.progSky.use();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      const a = p.attr("a_pos");
      if (a >= 0) { gl.enableVertexAttribArray(a); gl.vertexAttribDivisor(a, 0); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
      p.uMat4("u_invViewProj", this._invViewProj)
        .u3v("u_camPos", this._camPos)
        .u3v("u_top", this.sky.top).u3v("u_horizon", this.sky.horizon)
        .u3v("u_ground", this.sky.ground).u3v("u_sunColor", this.sky.sun)
        .u3v("u_sunDir", this.light.dir)
        .u1f("u_time", this.time)
        .u1f("u_clouds", this.settings.clouds ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (a >= 0) gl.disableVertexAttribArray(a);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    /* ── 本体 ── */
    const p = this.progMain.use();
    p.uMat4("u_viewProj", this._viewProj)
      .uMat4("u_shadowMat", this._shadowMat)
      .u3v("u_lightDir", this.light.dir)
      .u3v("u_lightColor", this.light.color)
      .u3v("u_ambTop", this.ambTop)
      .u3v("u_ambBottom", this.ambBottom)
      .u3v("u_camPos", this._camPos)
      .u3v("u_fogColor", this.fog.color)
      .u2f("u_fogRange", this.fog.near, this.fog.far)
      .u1f("u_time", this.time)
      .u1f("u_shadowOn", (this.settings.shadow && this.shadow) ? 1 : 0)
      .u1f("u_shadowTexel", this.shadow ? 1 / this.shadow.size : 0);
    if (this.shadow) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
      p.u1i("u_shadowMap", 0);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const e of this.meshes.values()) {
      for (let li = 0; li < e.lods.length; li++) {
        const b = e.buckets[li];
        if (!b.n) continue;
        const lod = e.lods[li];
        this._bindMeshAttrs(p, lod, true);
        this._bindInstanceAttrs(p, b, true);
        gl.drawElementsInstanced(gl.TRIANGLES, lod.count, lod.type, 0, b.n);
        this.stats.draws++;
        this.stats.instances += b.n;
        this.stats.tris += (lod.count / 3) * b.n;
      }
    }
    this._disableAll(p);
    gl.disable(gl.BLEND);
  }

  clearColor(r, g, b) { this.gl.clearColor(r, g, b, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); }

  destroy() {
    const gl = this.gl;
    try {
      for (const e of this.meshes.values()) {
        for (const l of e.lods) { gl.deleteBuffer(l.vbo); gl.deleteBuffer(l.ibo); }
        for (const b of e.buckets) if (b.buf) b.buf.destroy();
      }
      this.meshes.clear();
      if (this.shadow) { gl.deleteFramebuffer(this.shadow.fb); gl.deleteTexture(this.shadow.tex); }
      gl.deleteBuffer(this.skyBuf);
      this.progMain.destroy(); this.progShadow.destroy(); this.progSky.destroy();
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (e) {}
    this.gl = null;
  }
}
