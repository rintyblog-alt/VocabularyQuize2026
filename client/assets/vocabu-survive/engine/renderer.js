/* ══════════════════════════════════════════════════════════════════════════
   描く。

   ここだけが WebGL を 知っている。ゲーム側は 「この形を ここへ この色で」と
   言うだけ。まとめ描き・視界の外を捨てる・LOD・影は 全部 ここが やる。

   1 フレームの 流れ:
     begin(カメラ) → draw(…) を 何度でも → end()

   draw は **積むだけ**。end で 形ごとに まとめて 1 回ずつ 描く。
   ══════════════════════════════════════════════════════════════════════════ */
import { createContext, Program, DynamicBuffer, createShadowTarget, derivHeader } from "./gl.js";
import { MAIN_VS, MAIN_FS, SHADOW_VS, SHADOW_FS, SKY_VS, SKY_FS } from "./shaders.js";
import { m4, v3 } from "./math.js";
import { Post } from "./post.js";
import * as TEXGEN from "./texgen.js";

/* 1 つ分の 並び（float 24 個 = 96 バイト）:
   0-15 行列 / 16-19 色 / 20-23 (自ら光る, 縁, 縞, 揺れ) */
export const STRIDE_F = 24;

/* ★ 材質（2026-09-02）。**形ごとに 1 つ**。
   既定は 今までと 同じ 見た目に なる 値。書かない 形は 何も 変わらない。 */
const 材の既定 = { つや: 34, 強さ: 1, むら: 0, 金属: 0, 葉: 0, 細かさ: 1, 空うつり: 0,
  /* ★ 肌（2026-09-02）。0＝使わない。texgen.js の 何マス目か。
     大き＝1m あたり 何回 くり返すか。凹凸＝でこぼこの 強さ。粗＝ざらつき（つやの 広がり）。 */
  肌: 0, 大き: 1, 凹凸: 0, 粗: 0.5 };
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
    /* ★ **死んだ 板を 黙って 受けない**（2026-09-01・訴え
       「2 回目以降 ロビーに 戻ると 背景が 黒く なる」）。
       一度 loseContext() した 板へ もう一度 getContext を 頼むと、
       新しい 文脈では なく **同じ 死んだ 文脈**が 返る。
       そのまま 建てると 何も 描けないのに 断りも 出ず、真っ黒に なるだけ。
       ここで 断れば、呼んだ 側は「板を 取り替える」道へ 行ける。 */
    if (this.gl.isContextLost && this.gl.isContextLost()) {
      this.gl = null;
      throw new Error("WEBGL_CONTEXT_LOST_CANVAS");
    }
    const gl = this.gl;
    this.isGL2 = !!gl.__isGL2;
    this.hasInstancing = !!gl.__hasInstancing;

    /* ★ 画素の 傾きは **作ってみて 通ったか**で 決める（2026-08-31）。
       「使えるはず」で 進めると、通らない 端末で 画面が まるごと 出ない
       （実測: WebGL2 で dFdx が 拒まれ、3D が 一切 出なく なった）。 */
    const 頭 = derivHeader(gl);
    this.derivOK = false;
    if (頭) {
      try { this.progMain = new Program(gl, MAIN_VS, 頭 + MAIN_FS, "main"); this.derivOK = true; }
      catch (e) { this.progMain = null; }
    }
    if (!this.progMain) this.progMain = new Program(gl, MAIN_VS, MAIN_FS, "main");
    this.progShadow = new Program(gl, SHADOW_VS, SHADOW_FS, "shadow");
    this.progSky = new Program(gl, SKY_VS, SKY_FS, "sky");

    /* 空の 三角形 1 枚（画面いっぱい） */
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.meshes = new Map();
    /* 静的バッチ（一度 送ったら 置きっぱなし）。巨大な 世界を 出すため。 */
    this.batches = new Map();
    this._batchList = [];
    this._batchSeq = 0;       /* id → {lods:[{vbo,ibo,count,type,bound}], batches:[…]} */
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
    /* 肌（テクスチャ）を その場で 作る。段が low の ときは 作らない。 */
    this._skin = null;
    try { this._肌を用意(TEXGEN); } catch (e) {}
    this.time = 0;
    this.sky = {
      top: [0.36, 0.62, 0.94], horizon: [0.75, 0.87, 0.98], ground: [0.30, 0.40, 0.48],
      sun: [1.0, 0.95, 0.82],
      /* 星の 強さ（0 で 出さない）と 色。風景ごとに 変える。 */
      stars: 0, starTint: [1.0, 0.98, 0.92],
      /* ★ 遠くの 地平（2026-08-31）。null で 出さない。
         { h:尾根の 高さ, sharp:とがり, base:根もと, a:手前の 色, b:奥の 色 } */
      land: null
    };
    this.light = { dir: v3.create(-0.42, -0.78, -0.46), color: [1.06, 1.02, 0.94] };
    v3.normalize(this.light.dir, this.light.dir);
    this.ambTop = [0.36, 0.42, 0.52];
    this.ambBottom = [0.20, 0.20, 0.24];
    /* ★ 霧の 始まりを 0.45 → 0.62 へ（2026-08-31）。
       0.45 だと 遠くの 半分 以上が **白い 壁**に なり、
       地平の 向こうに 何を 置いても 見えなかった。
       終わりは drawDistance の まま なので、消える 瞬間は
       いままで どおり 完全に 霧の 色（ぱっと 消えない）。 */
    this.fog = { color: [0.75, 0.87, 0.98], near: settings.drawDistance * 0.62, far: settings.drawDistance };
    /* 床の 目地。一辺 2m・濃さ 0.10・18m から 薄れ 62m で 消える。
       風景ごとに setGrid で 変える（氷は 濃く、草原は 薄く）。 */
    this.grid = [2.0, 0.10, 18, 62];

    /* ══ 動く 解像度（2026-08-31）════════════════════════════════════
       訴え「重くならない」。

       ★ 効果（にじみ・階調・接地影・目地）を 足した ぶん、弱い 端末で
         コマが 落ちる。**画質の 段を 下げる 前に 画素を 減らす。**
         見た目の 痛みが いちばん 小さい ため。
       ★ 決めごと:
         ・直近 40 コマの **中央値**で 見る（1 コマの 山で 動かさない）
         ・0.05 きざみ。**急に 変えない**（見て 分かる）
         ・下げるのは 速い（0.5 秒に 1 段）、上げるのは 遅い（1.5 秒に 1 段）
           …上げ下げを 往復すると いちばん 汚い
         ・下限 0.62。これ以下は 文字も 読めなく なる
       ★ 実測で 効いているかを 出す（dynInfo）。**効いている ふりを しない。** */
    this.dyn = {
      on: settings.dynamicRes !== false,
      scale: 1, want: 1,
      budget: 1000 / Math.max(24, settings.targetFps || 60),
      ring: new Float32Array(40), n: 0, filled: 0,
      cool: 0, min: 0.62, max: 1, ceil: 1, ceilCool: 0,
      changes: 0, last: 0
    };
    this.shadowCenter = v3.create(0, 0, 0);
    this.shadowRadius = 34;

    /* ══ 後処理（2026-08-31）════════════════════════════════════════
       にじみ・階調・色の 調整。**low の 段では 通さない**
       （通すと 板を 2 枚 余分に 持ち、遅い 端末で 効く）。
       用意できなければ post.ok が false に なり、前と 同じ 直描きに なる。 */
    this.post = null;
    if (settings.post !== false && (settings.tier === "high" || settings.tier === "ultra"
        || settings.post === true)) {
      try {
        const p = new Post(gl, { msaa: settings.msaa | 0, hdr: settings.hdr !== false });
        if (p.ok) this.post = p; else p.destroy();
      } catch (e) { this.post = null; }
    }
    /* ★ 自ら光る ものの 強さ（2026-08-31）。**にじみが あるか**で 変える。
       ・16 ビットの 板＋にじみ … 1 を 超えて 出し、にじみに 拾わせる（2.6）
       ・にじみ だけ            … 1 のまま
       ・後処理 なし（low）      … **弱める（0.6）**
         にじんで くれない ので、そのままだと 溶岩の 海や ネオンの 帯が
         「べた塗りの 明るい 板」に なる（実写で 確認）。 */
    this.emissiveBoost = (this.post && this.post.hdr) ? 2.6 : (this.post ? 1.0 : 0.6);

    /* ══ 文脈を 失う（2026-08-31）═══════════════════════════════════
       ★ 端末は WebGL の 文脈を **取り上げる ことが ある**
         （メモリが 足りない・電源・他の タブ）。実際に 起きる。
       ★ 直す前は 失っても 何も 起きず、**絵だけ 止まって いた**
         （検査で 確認: 開いた ままで 知らせも 出ない）。
         止まった 絵を 出し続けるのは 「動いている ふり」に なる。
       ★ ここでは **失った ことを 覚えるだけ**。
         どう 見せるかは 使う 側（match）が 決める。
       ★ 元に 戻す のは やらない。板・shader・形を 全部 作り直す 必要が あり、
         中途半端に 直すと 「戻ったのに 何も 描けない」に なる。
         作り直しは 画面ごと 建て直す ほうが 確実で 短い。 */
    this.lost = false;
    this.onLost = null;
    this._onCtxLost = (e) => {
      try { e.preventDefault(); } catch (x) {}
      this.lost = true;
      if (typeof this.onLost === "function") { try { this.onLost(); } catch (x) {} }
    };
    try { canvas.addEventListener("webglcontextlost", this._onCtxLost, false); } catch (e) {}

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

  /**
   * 形に 材質を 与える。
   * @param {string} id 形の 名前
   * @param {{つや?:number,強さ?:number,むら?:number,金属?:number,葉?:number,細かさ?:number,空うつり?:number}} m
   */
  material(id, m) {
    if (!this._mats) this._mats = new Map();
    this._mats.set(id, Object.assign({}, 材の既定, m || {}));
    return this;
  }

  _材を渡す(prog, id) {
    const m = (this._mats && this._mats.get(id)) || 材の既定;
    prog.u4f("u_mat", m.つや, m.強さ, m.むら, m.金属);
    prog.u4f("u_mat2", m.葉, m.細かさ, m.空うつり, 0);
    /* 肌が 無い ときは 0 を 渡す（シェーダは 触らない） */
    prog.u4f("u_mat3", this._skin ? (m.肌 || 0) : 0, m.大き || 1, m.凹凸 || 0, m.粗 === undefined ? 0.5 : m.粗);
  }

  /* ══ 肌（テクスチャ）を その場で 作って GPU へ 1 回だけ 送る ══════
     ダウンロードは 0 バイト。段が low の ときは 作らない（塗る 量が 増える）。 */
  _肌を用意(texgen) {
    const 一辺 = this.settings.肌 | 0;
    if (!一辺 || this._skin) return;
    const gl = this.gl;
    let a = null;
    try { a = texgen.肌を作る(一辺); } catch (e) { return; }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, a.w, a.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, a.data);
    /* ★ アトラスなので **くり返しは 自前**（シェーダで fract する）。
       ここで REPEAT に すると 隣の マスが にじんで 出る。 */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* ★ 遠くの ちらつき止め（ミップマップ）。
       入れないと、遠くの 地面が 走る たびに ざわざわ する。
       アトラスなので 縮めた 段で 隣の マスが にじむ が、
       内側へ 寄せて 貼って いる ので 実写では 出ない。 */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try { gl.generateMipmap(gl.TEXTURE_2D); } catch (e) {}
    this._skin = { tex: t, 列: a.列, 行: a.行, マス: a.マス, w: a.w, h: a.h,
      bytes: a.data.length };
    this.stats.skinBytes = a.data.length;
  }

  /** 静的バッチ 1 個ぶんを 並びへ 書く。data は STRIDE_F の 倍数で 用意する。 */
  static writeInstance(data, at, mat, color, emissive, rim, stripe, sway) {
    const o = at * STRIDE_F;
    for (let i = 0; i < 16; i++) data[o + i] = mat[i];
    data[o + 16] = color[0]; data[o + 17] = color[1];
    data[o + 18] = color[2]; data[o + 19] = color.length > 3 ? color[3] : 1;
    data[o + 20] = emissive || 0; data[o + 21] = rim === undefined ? 0.16 : rim;
    data[o + 22] = stripe || 0;   data[o + 23] = sway || 0;
  }

  hasMesh(id) { return this.meshes.has(id); }

  /* ══ 静的バッチ（2026-09-02）══════════════════════════════════════
     **一度 送ったら 置きっぱなし**の 積み。巨大な 世界を 出すための 芯。

     使いかた:
       const h = R.addBatch("tile", data, {center:[x,y,z], radius:40});
       R.drawBatch(h);        毎フレーム（視界の 外なら 何も しない）
       R.dropBatch(h);        要らなく なったら

     data は STRIDE_F 個ずつ の 並び:
       行列16 ＋ 色4（rgba）＋ params4（emissive, rim, stripe, sway）
     ＝ draw() が 積むのと 同じ 形。作りかたは makeInstance() を 使う。 */
  addBatch(meshId, data, o) {
    const gl = this.gl;
    const e = this.meshes.get(meshId);
    if (!e || !data || !data.length) return null;
    const n = Math.floor(data.length / STRIDE_F);
    if (!n) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const h = {
      id: ++this._batchSeq, meshId, buf, n,
      center: (o && o.center) || [0, 0, 0],
      radius: (o && o.radius) || 50,
      bytes: data.byteLength
    };
    this.batches.set(h.id, h);
    this.stats.batchBytes = (this.stats.batchBytes || 0) + h.bytes;
    return h;
  }

  /** 視界の 中なら 今フレームの 一覧へ 入れる。戻り値は 出したか どうか。 */
  drawBatch(h) {
    if (!h || !this.batches.has(h.id)) return false;
    if (!this._inFrustum(h.center[0], h.center[1], h.center[2], h.radius)) {
      this.stats.culled += h.n;
      return false;
    }
    this._batchList.push(h);
    return true;
  }

  dropBatch(h) {
    if (!h || !this.batches.has(h.id)) return;
    try { this.gl.deleteBuffer(h.buf); } catch (e) {}
    this.batches.delete(h.id);
    this.stats.batchBytes = Math.max(0, (this.stats.batchBytes || 0) - h.bytes);
  }

  dropAllBatches() {
    for (const h of Array.from(this.batches.values())) this.dropBatch(h);
    this.batches.clear();
    this.stats.batchBytes = 0;
  }

  /* 静的バッチを 実際に 描く。通常の 積みと 同じ 決まりで 縛る。 */
  _drawBatches(prog, wantColor) {
    const gl = this.gl;
    const 外す = this._noShadow;
    for (let i = 0; i < this._batchList.length; i++) {
      const h = this._batchList[i];
      if (!wantColor && 外す && 外す.has(h.meshId)) continue;   /* 影を 焼かない 形 */
      const e = this.meshes.get(h.meshId);
      if (!e) continue;
      const lod = e.lods[0];
      if (wantColor) this._材を渡す(prog, h.meshId);
      this._bindMeshAttrs(prog, lod, wantColor);
      this._bindInstanceBuffer(prog, h.buf, wantColor);
      gl.drawElementsInstanced(gl.TRIANGLES, lod.count, lod.type, 0, h.n);
      if (wantColor) {
        this.stats.draws++;
        this.stats.instances += h.n;
        this.stats.tris += (lod.count / 3) * h.n;
      }
    }
  }

  /* ★ 影を **焼かない** 形（2026-08-31）。
     足元の 接地影・粒・遠くの 地面など、
     「影の 地図に 入ると かえって 汚く なる」ものを 外す。
     接地影は 床と ほぼ 同じ 高さなので、焼くと 自分の 影で 縞が 出る。 */
  setNoShadow(id, on) {
    if (!this._noShadow) this._noShadow = new Set();
    if (on === false) this._noShadow.delete(id); else this._noShadow.add(id);
  }

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
    let ratio = Math.min(s.dpr, s.pixelRatio * s.dpr) * (this.dyn.on ? this.dyn.scale : 1);
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
    if (this.post && this.post.ok) {
      if (!this.post.resize(w, h)) { try { this.post.destroy(); } catch (e) {} this.post = null; this.emissiveBoost = 0.6; }
    }
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
    this._batchList.length = 0;
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
    this._bindInstanceBuffer(prog, bucket.buf.buffer, wantColor);
  }

  /* ★ 生の GL 置き場から 積む（2026-09-02）。
     区画（チャンク）の 地形のように **中身が 変わらない** ものは、
     毎フレーム CPU から 送り直さない。送り直すと
     1 万個で 1MB／フレームに なり、スマホでは そこだけで 落ちる。 */
  _bindInstanceBuffer(prog, glBuffer, wantColor) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
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
      const 外す = this._noShadow;
      for (const e of this.meshes.values()) {
        if (外す && 外す.has(e.id)) continue;
        for (let li = 0; li < e.lods.length; li++) {
          const b = e.buckets[li];
          if (!b.n) continue;
          this._bindMeshAttrs(p, e.lods[li], false);
          this._bindInstanceAttrs(p, b, false);
          gl.drawElementsInstanced(gl.TRIANGLES, e.lods[li].count, e.lods[li].type, 0, b.n);
        }
      }
      this._drawBatches(p, false);
      this._disableAll(p);
      gl.cullFace(gl.BACK);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this._sized.w, this._sized.h);
    }

    /* ── ここから 先は **後処理の 板**へ 描く（用意できていれば）── */
    const 後 = this.post && this.post.ok && this.post.scene;
    if (後) {
      this.post.bindScene();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
        .u1f("u_clouds", this.settings.clouds ? 1 : 0)
        .u1f("u_stars", this.sky.stars || 0)
        .u3v("u_starTint", this.sky.starTint || [1, 1, 1]);
      const L = this.sky.land;
      p.u3v("u_fogCol", this.fog.color)
        .u4f("u_land", L ? (L.shape || 1) : 0, L ? L.h : 0, L ? (L.sharp || 0) : 0, L ? (L.base === undefined ? -0.012 : L.base) : 0)
        .u3v("u_landA", (L && L.a) || [0.5, 0.5, 0.5])
        .u3v("u_landB", (L && L.b) || [0.6, 0.6, 0.6]);
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
      .u1f("u_shadowTexel", this.shadow ? 1 / this.shadow.size : 0)
      .u1f("u_emissiveBoost", this.emissiveBoost)
      .u4f("u_grid", this.grid[0], this.grid[1], this.grid[2], this.grid[3]);
    if (this.shadow) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
      p.u1i("u_shadowMap", 0);
    }
    if (this._skin) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._skin.tex);
      p.u1i("u_skin", 1);
      p.u4f("u_skinGrid", this._skin.列, this._skin.行, 1 / this._skin.列, 1 / this._skin.行);
      gl.activeTexture(gl.TEXTURE0);
    } else {
      p.u4f("u_skinGrid", 0, 0, 0, 0);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const e of this.meshes.values()) {
      let 渡した = false;
      for (let li = 0; li < e.lods.length; li++) {
        const b = e.buckets[li];
        if (!b.n) continue;
        if (!渡した) { this._材を渡す(p, e.id); 渡した = true; }
        const lod = e.lods[li];
        this._bindMeshAttrs(p, lod, true);
        this._bindInstanceAttrs(p, b, true);
        gl.drawElementsInstanced(gl.TRIANGLES, lod.count, lod.type, 0, b.n);
        this.stats.draws++;
        this.stats.instances += b.n;
        this.stats.tris += (lod.count / 3) * b.n;
      }
    }
    this._drawBatches(p, true);
    this._disableAll(p);
    gl.disable(gl.BLEND);

    /* ── 画面へ 出す（にじみ・階調・色）── */
    if (後) this.post.present(this._sized.w, this._sized.h, this.time);
  }

  /**
   * 1 コマに かかった 時間（ミリ秒）を 渡す。必要なら 解像度を 動かす。
   * 毎コマ 呼ぶ。返り値は 変えた ときだけ true。
   */
  observeFrame(ms, dt) {
    const D = this.dyn;
    if (!D.on || !(ms > 0)) return false;
    D.ring[D.n] = ms; D.n = (D.n + 1) % D.ring.length;
    if (D.filled < D.ring.length) { D.filled++; return false; }
    /* ★ 天井の 冷ましは **毎コマ** 減らす（2026-08-31）。
       下の 判定の 中に 置いたら 0.5 秒に 1 回しか 減らず、
       12 秒の つもりが **6 分**に なっていた（実測で 戻らなかった）。 */
    D.cool -= (dt || 0.016);
    D.ceilCool = Math.max(0, (D.ceilCool || 0) - (dt || 0.016));
    if (D.ceilCool <= 0) D.ceil = D.max;
    if (D.cool > 0) return false;

    /* 中央値。並べ替えは 40 個なので 安い（1 秒に 2 回 しか 来ない）。 */
    const a = Array.prototype.slice.call(D.ring, 0, D.filled).sort((x, y) => x - y);
    const med = a[a.length >> 1];

    /* ★ 画面と 歩調を 合わせて いる（vsync）ので、**測れる 値は
       16.7 の 倍数だけ**（実測）。「余っている ぶん」は 見えない。
       だから「軽い」は 「余っている」では なく
       **「取りこぼして いない」**で 判断する。
       前は med < 目安 × 0.74 に して いて、60fps の ときも 16.7ms の ままで
       条件が 一度も 立たず、**一度 下げたら 二度と 戻らなかった**（実測）。 */
    const 重い = med > D.budget * 1.25;
    const 余裕 = med <= D.budget * 1.10;

    /* 天井。下げた 直後に すぐ 上げ直すと 上下に 往復して いちばん 汚い。
       しばらく（12 秒）は そこを 天井に し、あとで ゆっくり 戻す。 */
    const 天井 = Math.min(D.max, D.ceil === undefined ? D.max : D.ceil);

    let next = D.scale;
    if (重い) {
      next = Math.max(D.min, D.scale - 0.05);
      D.ceil = next; D.ceilCool = 12; D.cool = 0.5;
    } else if (余裕 && D.scale < 天井 - 1e-6) {
      next = Math.min(天井, D.scale + 0.05); D.cool = 1.5;
    } else { D.cool = 0.5; return false; }

    if (Math.abs(next - D.scale) < 0.001) return false;
    D.scale = next; D.changes++; D.last = med;
    /* 大きさを 変えたら 直近の 記録は 当てに ならない。数え直す。 */
    D.filled = 0; D.n = 0;
    this.resize();
    return true;
  }

  /** いま どれだけ 縮めているか。検査と 画面の 表示に 使う。 */
  dynInfo() {
    const D = this.dyn;
    return { on: !!D.on, scale: Math.round(D.scale * 100) / 100,
             ceil: Math.round((D.ceil === undefined ? D.max : D.ceil) * 100) / 100,
             budget: Math.round(D.budget * 10) / 10,
             last: Math.round(D.last * 10) / 10, changes: D.changes };
  }

  /** 床の 目地。[一辺m, 濃さ, 消え始めm, 消え終わりm] */
  setGrid(g) { if (g && g.length === 4) this.grid = g; }

  /** 風景ごとの 色の 調整。post が 無ければ 何も しない（ふりを しない）。 */
  setGrade(g) { if (this.post && this.post.ok) this.post.setGrade(g); }
  /** 後処理が 本当に 効いているか（検査と 画面の 表示に 使う）。 */
  postInfo() {
    if (!this.post || !this.post.ok) return { on: false, hdr: false, bloom: false, msaa: 0 };
    return { on: true, hdr: !!this.post.hdr, bloom: !!this.post.bright, msaa: this.post.msFb ? this.post.msaa : 0, deriv: !!this.derivOK, grid: this.grid.slice() };
  }

  clearColor(r, g, b) { this.gl.clearColor(r, g, b, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); }

  destroy() {
    try { this.dropAllBatches(); } catch (e) {}
    const gl = this.gl;
    try { if (this._onCtxLost) this.canvas.removeEventListener("webglcontextlost", this._onCtxLost, false); } catch (e) {}
    try {
      for (const e of this.meshes.values()) {
        for (const l of e.lods) { gl.deleteBuffer(l.vbo); gl.deleteBuffer(l.ibo); }
        for (const b of e.buckets) if (b.buf) b.buf.destroy();
      }
      this.meshes.clear();
      if (this.shadow) { gl.deleteFramebuffer(this.shadow.fb); gl.deleteTexture(this.shadow.tex); }
      if (this.post) { this.post.destroy(); this.post = null; }
      gl.deleteBuffer(this.skyBuf);
      this.progMain.destroy(); this.progShadow.destroy(); this.progSky.destroy();
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (e) {}
    this.gl = null;
  }
}
