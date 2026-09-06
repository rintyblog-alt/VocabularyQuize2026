/* ══════════════════════════════════════════════════════════════════════════
   ロビーの 立体の 場面

   ★ ロビーが **管理画面**に なっていた（表と つまみが 並ぶだけ）。
     遊びの ロビーは 「自分の キャラクターが 真ん中に 立っている」ところ から 始まる。
     数字と 表は 端へ 逃がし、真ん中は 立体に 明け渡す。

   ここで やること:
     ・台の 上に 自分の 走る人（色・かぶりもの そのまま）
     ・ゆっくり 回る 台と 輪、浮かぶ 四角、後ろで 跳ねる 仲間
     ・選んでいる コースの 風景の 色を 空に 使う（えらぶ たび 空気が 変わる）

   ★ 立体が 出せなくても ロビーは 生きる（板を 隠すだけ）。
   ══════════════════════════════════════════════════════════════════════════ */
import { Renderer } from "../engine/renderer.js";
import { ThirdPersonCamera } from "../engine/camera.js";
import * as MESH from "../engine/mesh.js";
import { m4, mulberry32, TAU, lerp } from "../engine/math.js";
import { BeanVisual, registerBeanMeshes, hatByKey, HAT_COLORS } from "../game/bean.js";
import { BEAN_COLORS, beanByIndex } from "./theme.js";

const PAD = "vs_lbs_pad";
const RING = "vs_lbs_ring";
const CUBE = "vs_lbs_cube";
const MOTE = "vs_lbs_mote";   /* 舞う 光の 粒 */
const PILLAR = "vs_lbs_pillar"; /* 遠くの 柱（風景の 影） */
const FLOOR = "vs_lbs_floor";  /* 下に 広がる 面 */

export class LobbyStage {
  /**
   * @param {HTMLCanvasElement} canvas 影の DOM の 中の 板
   * @param {object} settings caps.settingsFor() の 戻り
   */
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = null;
    this.failed = false;
    this._t = 0;
    this._mat = m4.create();
    this._me = null;
    this._crowd = [];
    this._cubes = [];
    /* 空の 色。コースを えらぶ たび ここへ 寄せる（急に 変えない）。 */
    this._sky = { top: [0.13, 0.14, 0.34], hor: [0.34, 0.24, 0.58], gnd: [0.06, 0.07, 0.18] };
    this._want = { top: [0.13, 0.14, 0.34], hor: [0.34, 0.24, 0.58], gnd: [0.06, 0.07, 0.18] };
    /* 走る人の 見た目 */
    this._look = { colorIndex: 0, hat: "none", hatColor: 0 };
    this._emote = 0;
  }

  init() {
    if (this.renderer || this.failed) return !!this.renderer;
    try {
      const s = Object.assign({}, this.settings, {
        drawDistance: 140,
        shadowSize: Math.min(1024, this.settings.shadowSize || 1024),
        clouds: false
      });
      const R = new Renderer(this.canvas, s);
      this.renderer = R;
      R.sky.sun = [1.0, 0.86, 0.62];
      R.ambTop = [0.34, 0.32, 0.50];
      R.ambBottom = [0.16, 0.14, 0.24];
      R.fog.near = 34; R.fog.far = 110;
      R.light.dir.set([-0.34, -0.74, -0.58]);
      R.shadowRadius = 8;

      R.addMesh(PAD, [MESH.cylinder(30, 2.5, 2.7, 0.6, true), MESH.cylinder(14, 2.5, 2.7, 0.6, true)]);
      R.addMesh(RING, [MESH.torus(26, 10, 0.5, 0.08), MESH.torus(12, 6, 0.5, 0.08)]);
      R.addMesh(CUBE, [MESH.roundedBox(3, 0.16), MESH.roundedBox(1, 0.14)]);
      R.addMesh(MOTE, [MESH.sphere(6, 4, 0.5)]);
      R.addMesh(PILLAR, [MESH.roundedBox(1, 0.10)]);
      R.addMesh(FLOOR, [MESH.cylinder(40, 0.5, 0.5, 1, true)]);
      registerBeanMeshes(R);

      this.cam = new ThirdPersonCamera();
      this.cam.wantDistance = 7.4;
      this.cam.wantPitch = 0.18;
      this.cam.height = 0.95;
      this.cam.snap([0, 0, 0], 0);

      this._me = new BeanVisual(beanByIndex(0).rgb);
      const rnd = mulberry32(0x5a17e);
      this._crowd = [];
      for (let i = 0; i < 3; i++) {
        const c = BEAN_COLORS[(i * 3 + 2) % BEAN_COLORS.length];
        const b = new BeanVisual(c.rgb);
        b.hat = hatByKey(["cap", "ribbon", "antenna"][i]);
        const hc = HAT_COLORS[(i * 4 + 2) % HAT_COLORS.length];
        b.hatColor = [hc.rgb[0], hc.rgb[1], hc.rgb[2], 1];
        this._crowd.push({
          v: b,
          x: (i - 1) * 3.6 + (rnd() - 0.5) * 0.8,
          z: -5.5 - rnd() * 2.5,
          scale: 0.66 + rnd() * 0.1,
          hop: rnd() * TAU, speed: 1.4 + rnd() * 1.0
        });
      }
      /* ══ 舞台の 飾りを 建て直す（2026-08-31）════════════════════════
         ★ 直す前は **色とりどりの 立方体が 22 個 宙に 浮いていた**。
           作りかけの 置き物に しか 見えない（実写で 確認）。
         ★ 代わりに:
             ① 下に 広がる 面（宙に 浮いて 見えない ように する）
             ② 遠くの 柱の 並び（場所が ある ように 見せる）
             ③ ゆっくり 昇る 光の 粒（動きを 出す。色は 1 系統だけ）
           **色は 散らさない。** 散らすと 何を 見れば いいか 分からない。 */
      this._motes = [];
      for (let i = 0; i < 34; i++) {
        this._motes.push({
          x: (rnd() - 0.5) * 26, y: rnd() * 14, z: -2 - rnd() * 24,
          s: 0.05 + rnd() * 0.09, sp: 0.28 + rnd() * 0.5, ph: rnd() * TAU,
          sway: 0.3 + rnd() * 0.8
        });
      }
      this._pillars = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + rnd() * 0.2;
        const r = 26 + rnd() * 12;
        this._pillars.push({
          x: Math.sin(a) * r, z: Math.cos(a) * r - 6,
          h: 5 + rnd() * 16, w: 1.0 + rnd() * 1.8, r: rnd() * 0.6
        });
      }
      /* 台の まわりの 輪。3 本を 別の 速さで 回す。 */
      this._rings = [
        { r: 6.6, y: -0.10, sp: -0.30, e: 0.5 },
        { r: 8.6, y: 0.55, sp: 0.19, e: 0.32 },
        { r: 11.0, y: -0.35, sp: -0.12, e: 0.22 }
      ];
      return true;
    } catch (e) {
      this.failed = true;
      try { this.canvas.style.display = "none"; } catch (_) {}
      console.warn("[VocabuSurvive] ロビーの 立体を 出せません:", e && e.message);
      return false;
    }
  }

  /** 走る人の 見た目を 合わせる。ロビーで 色や 帽子を 変えたら すぐ 呼ぶ。 */
  setLook(colorIndex, hat, hatColor) {
    this._look = { colorIndex: colorIndex | 0, hat: hat || "none", hatColor: hatColor | 0 };
    if (!this._me) return;
    const c = beanByIndex(this._look.colorIndex).rgb;
    this._me.color = [c[0], c[1], c[2], 1];
    this._me.dark = [c[0] * 0.62, c[1] * 0.62, c[2] * 0.62, 1];
    this._me.hat = hatByKey(this._look.hat);
    const hc = HAT_COLORS[this._look.hatColor % HAT_COLORS.length] || HAT_COLORS[0];
    this._me.hatColor = [hc.rgb[0], hc.rgb[1], hc.rgb[2], 1];
    /* 変えた ことが 分かる ように 小さく 跳ねる */
    this._emote = 0.55;
  }

  /** えらんでいる コースの 風景を 空へ。**すぐには 変えない**（目が 疲れる）。 */
  setTheme(theme) {
    if (!theme || !theme.sky) return;
    this._want.top = theme.sky.top.slice();
    this._want.hor = theme.sky.horizon.slice();
    this._want.gnd = (theme.far || theme.sky.ground || theme.floor).slice();
    /* ★ 色の 調整と 星も 合わせる（2026-08-31）。
       ここが 揃っていないと 「コースを えらぶと 空気が 変わる」の 半分しか 効かない。 */
    const R = this.renderer;
    if (R) {
      if (theme.grade && R.setGrade) R.setGrade(theme.grade);
      if (R.setGrid) R.setGrid(theme.grid || [2.5, 0.10, 20, 70]);
      R.sky.stars = theme.sky.stars || 0;
      R.sky.starTint = theme.sky.starTint || [1, 0.98, 0.92];
      R.sky.sun = theme.sky.sun || R.sky.sun;
      /* ★ 遠くの 地平（2026-08-31・訴え「背景に 土台が ない」）。
         ロビーは **いちばん 長く 見る 画面**なので こここそ 要る。
         形は すぐ 差し替え、色は 空と 同じ 速さで 寄せる
         （色だけ 飛ぶと えらび直す たび ちらつく）。 */
      const L = theme.land;
      if (L) {
        if (!R.sky.land) R.sky.land = { h: L.h, sharp: L.sharp, base: L.base, a: L.a.slice(), b: L.b.slice() };
        else { R.sky.land.h = L.h; R.sky.land.sharp = L.sharp; R.sky.land.base = L.base; }
        this._want.landA = L.a.slice();
        this._want.landB = L.b.slice();
      } else R.sky.land = null;
    }
  }

  tick(dt) {
    const R = this.renderer;
    if (!R || !R.gl) return;
    this._t += dt;
    const sz = R.resize();
    if (sz.w < 4 || sz.h < 4) return;

    /* 空を なめらかに 寄せる */
    const k = Math.min(1, dt * 3.2);
    for (const key of ["top", "hor", "gnd"]) {
      for (let i = 0; i < 3; i++) this._sky[key][i] = lerp(this._sky[key][i], this._want[key][i], k);
    }
    if (R.sky.land && this._want.landA) {
      for (let i = 0; i < 3; i++) {
        R.sky.land.a[i] = lerp(R.sky.land.a[i], this._want.landA[i], k);
        R.sky.land.b[i] = lerp(R.sky.land.b[i], this._want.landB[i], k);
      }
    }
    R.sky.top = this._sky.top;
    R.sky.horizon = this._sky.hor;
    R.sky.ground = this._sky.gnd;
    R.fog.color = this._sky.hor;

    const cam = this.cam;
    cam.wantYaw = Math.sin(this._t * 0.13) * 0.42;
    cam.update(dt, [0, 0.25, 0], 0, sz.w / Math.max(1, sz.h));
    R.shadowCenter[0] = 0; R.shadowCenter[1] = 0; R.shadowCenter[2] = 0;
    R.begin(cam);

    /* 台 */
    m4.compose(this._mat, 0, -0.16, 0, this._t * 0.08, 1.05, 1.0, 1.05);
    R.draw(PAD, this._mat, [0.52, 0.55, 0.86, 1], 0, 0.34, 0, 0, 3.2);
    /* 下に 広がる 面。これが 無いと 台が 宙に 浮いて 見える。
       ★ 120 だと 端が 地平の 下 4 度で 切れ、その 上に 空の 色の
         帯が 残った。600 まで 広げて 地平まで 届かせる（描き回数は 同じ）。 */
    m4.compose(this._mat, 0, -7.2, -4, 0, 600, 1, 600);
    R.draw(FLOOR, this._mat, [this._sky.gnd[0], this._sky.gnd[1], this._sky.gnd[2], 1], 0, 0.02, 0, -1, 600);

    /* 遠くの 柱。場所が ある ように 見せる（形は 1 種類だけ）。 */
    for (const p of this._pillars) {
      m4.compose(this._mat, p.x, -7.2 + p.h / 2, p.z, p.r, p.w, p.h, p.w);
      R.draw(PILLAR, this._mat,
        [this._sky.hor[0] * 0.55, this._sky.hor[1] * 0.55, this._sky.hor[2] * 0.62, 1], 0, 0.16, 0, 0, p.h);
    }

    /* 台の まわりの 輪 */
    for (const g of this._rings) {
      m4.compose(this._mat, 0, g.y, 0, -this._t * g.sp, g.r, 2.2, g.r);
      R.draw(RING, this._mat, [0.38, 0.90, 0.74, 1], g.e, 0.4, 0, 0, g.r * 0.5);
    }

    /* 昇る 光の 粒。**色は 1 系統だけ。** 散らすと 目が 迷う。 */
    for (const m of this._motes) {
      m.y += dt * m.sp;
      if (m.y > 15) { m.y = -1.5; m.ph = Math.random() * TAU; }
      const x = m.x + Math.sin(this._t * 0.5 + m.ph) * m.sway;
      const 明 = 0.55 + 0.45 * Math.sin(this._t * 1.7 + m.ph);
      m4.compose(this._mat, x, m.y, m.z, 0, m.s, m.s, m.s);
      R.draw(MOTE, this._mat, [1.0, 0.94, 0.80, 1], 0.8 * 明 + 0.3, 0.2, 0, 0, m.s);
    }

    /* 後ろの 仲間 */
    for (const b of this._crowd) {
      b.hop += dt * b.speed * 2.2;
      const bounce = Math.abs(Math.sin(b.hop)) * 0.28;
      b.v.update(dt, { speed: 2.4, grounded: bounce < 0.04, vy: Math.cos(b.hop) * 5, yaw: 0, stunned: 0 });
      b.v.draw(R, b.x, bounce, b.z, Math.PI + Math.sin(this._t * 0.4 + b.hop) * 0.3, b.scale);
    }

    /* 主役 */
    if (this._me) {
      if (this._emote > 0) this._emote = Math.max(0, this._emote - dt * 1.6);
      const jump = this._emote > 0 ? Math.sin((0.55 - this._emote) / 0.55 * Math.PI) * 0.5 : 0;
      this._me.update(dt, {
        speed: 0.4, grounded: jump < 0.04, vy: jump > 0 ? 3 : 0,
        yaw: 0, stunned: 0
      });
      this._me.faceYaw = Math.sin(this._t * 0.7) * 0.24;
      /* ★ ここは 見せる 場面。走る人には **こちらを 向いて** ほしいので 半回転 足す
         （bean.js を 直して 顔が 進む向き＝奥を 向くように なった ため）。 */
      this._me.draw(R, 0, jump, 0, Math.PI + Math.sin(this._t * 0.28) * 0.5, 1.18);
    }

    R.end(dt);
  }

  destroy() {
    if (this.renderer) { try { this.renderer.destroy(); } catch (e) {} this.renderer = null; }
  }
}
