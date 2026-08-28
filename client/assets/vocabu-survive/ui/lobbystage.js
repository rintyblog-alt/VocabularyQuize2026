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
        drawDistance: 90,
        shadowSize: Math.min(1024, this.settings.shadowSize || 1024),
        clouds: false
      });
      const R = new Renderer(this.canvas, s);
      this.renderer = R;
      R.sky.sun = [1.0, 0.86, 0.62];
      R.ambTop = [0.34, 0.32, 0.50];
      R.ambBottom = [0.16, 0.14, 0.24];
      R.fog.near = 30; R.fog.far = 92;
      R.light.dir.set([-0.34, -0.74, -0.58]);
      R.shadowRadius = 8;

      R.addMesh(PAD, [MESH.cylinder(30, 2.5, 2.7, 0.6, true), MESH.cylinder(14, 2.5, 2.7, 0.6, true)]);
      R.addMesh(RING, [MESH.torus(26, 10, 0.5, 0.08), MESH.torus(12, 6, 0.5, 0.08)]);
      R.addMesh(CUBE, [MESH.roundedBox(3, 0.16), MESH.roundedBox(1, 0.14)]);
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
      this._cubes = [];
      for (let i = 0; i < 22; i++) {
        const q = BEAN_COLORS[(rnd() * BEAN_COLORS.length) | 0].rgb;
        this._cubes.push({
          x: (rnd() - 0.5) * 30, y: 1.2 + rnd() * 8, z: -6 - rnd() * 22,
          s: 0.35 + rnd() * 0.9, r: rnd() * TAU, sp: (rnd() - 0.5) * 0.7,
          c: [q[0], q[1], q[2], 1], bob: rnd() * TAU
        });
      }
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
    m4.compose(this._mat, 0, -0.10, 0, -this._t * 0.30, 6.6, 2.2, 6.6);
    R.draw(RING, this._mat, [0.38, 0.90, 0.74, 1], 0.5, 0.4, 0, 0, 3.5);

    for (const c of this._cubes) {
      const y = c.y + Math.sin(this._t * 0.7 + c.bob) * 0.32;
      m4.compose(this._mat, c.x, y, c.z, c.r + this._t * c.sp, c.s, c.s, c.s);
      R.draw(CUBE, this._mat, c.c, 0.06, 0.30, 0, 0, c.s);
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
