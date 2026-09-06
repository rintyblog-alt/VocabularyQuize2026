/* ══════════════════════════════════════════════════════════════════════════
   三人称カメラ。

   要件:
     ・なめらかに 追う（time-based。フレームが 落ちても 同じ 速さ）
     ・壁の 中へ 潜らない（間に 何か あれば 手前へ 寄る）
     ・回せる（マウス / 指）
     ・速いほど 引く・跳んだら 少し 見下ろす

   注意: 追うのは **見た目の 位置**（描画用に 補間した もの）であって
   物理の 位置では ない。物理は 60Hz 固定で 進むので、そのまま 追うと
   画面が 60Hz でない 端末で 段になる。
   ══════════════════════════════════════════════════════════════════════════ */
import { m4, v3, clamp, damp, dampAngle, TAU } from "./math.js";

export class ThirdPersonCamera {
  constructor() {
    this.target = v3.create(0, 0, 0);
    this.pos = v3.create(0, 4, 8);
    this.look = v3.create(0, 0, 0);

    this.yaw = 0;             /* 水平（ラジアン） */
    this.pitch = 0.30;        /* 見下ろし */
    this.wantYaw = 0;
    this.wantPitch = 0.30;

    this.distance = 7.2;
    this.wantDistance = 7.2;
    this.minDistance = 1.6;
    this.maxDistance = 13.0;

    this.height = 1.35;       /* 狙う点を 頭の あたりへ */
    this.fov = 62 * Math.PI / 180;
    this.near = 0.14;
    this.far = 420;

    this.view = m4.create();
    this.proj = m4.create();
    this.viewProj = m4.create();

    this.shake = 0;
    this._shakeT = 0;
    this.shakeScale = 1;      /* 0 = 揺らさない */
    this._tmp = v3.create();
    /* 壁の 判定を 外から 差し込む。無ければ 何も しない。 */
    this.raycast = null;      /* (from, dir, maxDist) → 当たった距離 or -1 */
    this.pitchMin = -0.30;
    this.pitchMax = 1.10;
    this.invertY = false;
    this.sensitivity = 1.0;

    /* ══ 縦長の 画面（スマホ 縦）2026-08-31 ═══════════════════════════
       ★ 実測: 390×844 の 縦だと 縦横比 0.462。縦 62°の 画角を そのまま
         使うと **横は 31°しか 見えない**。走る人が 画面の 真ん中を 占め、
         前も 横も 見えない（実写で 確認）。
       ★ 直しかたは 2 つ 同時に:
         ① 横の 画角を 下限で 守る（縦を 広げる。Hor+ と 同じ 考え）
         ② 狙う点を 上へ ずらす → 走る人が 画面の **下 1/3** に 来て、
            上の 2/3 が 進む先に なる
       どちらか 片方だけだと 足りない（片方は 小さく 見えるだけ、
       もう 片方は 前が 見えないまま）。 */
    this.minHFov = 40 * Math.PI / 180;   /* 横は これ 以下に しない */
    this.maxVFov = 82 * Math.PI / 180;   /* 広げすぎると 歪む */
    this.lift = 0;                        /* 狙う点を 上へ（走る人が 下がる） */
    this._lift = 0;
    this.portraitLift = 1.15;
    this.portraitDist = 1.5;
    this._aspectDist = 0;
  }

  /** 見る向きを 動かす（マウスの 移動量・指の なぞり） */
  rotate(dx, dy) {
    this.wantYaw -= dx * 0.0032 * this.sensitivity;
    const s = this.invertY ? -1 : 1;
    this.wantPitch = clamp(this.wantPitch + dy * 0.0026 * this.sensitivity * s, this.pitchMin, this.pitchMax);
    if (this.wantYaw > TAU) this.wantYaw -= TAU;
    if (this.wantYaw < -TAU) this.wantYaw += TAU;
  }

  zoom(delta) {
    this.wantDistance = clamp(this.wantDistance + delta * 0.01, this.minDistance, this.maxDistance);
  }

  /** すぐ その向きへ（合図の 前・生き返り） */
  snap(targetPos, yaw) {
    v3.copy(this.target, targetPos);
    if (yaw !== undefined) { this.yaw = this.wantYaw = yaw; }
    this.pitch = this.wantPitch;
    this.distance = this.wantDistance;
    this._place(0);
  }

  /* ★ ゆれの 強さ。0 に すると まったく 揺れない。
     酔いやすい 人が いる ので、**必ず 切れる ように する**。 */
  hit(strength) {
    const k = this.shakeScale === undefined ? 1 : this.shakeScale;
    if (k <= 0) return;
    this.shake = Math.max(this.shake, strength * k);
  }

  _place(dt) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    /* 狙う点 */
    const tx = this.target[0], ty = this.target[1] + this.height + this._lift, tz = this.target[2];
    /* 望みの 目の 位置 */
    let ox = sy * cp, oy = sp, oz = cy * cp;
    let dist = this.distance;

    /* 壁に 潜らない。狙う点から 目の 方向へ 撃つ。 */
    if (this.raycast) {
      v3.set(this._tmp, ox, oy, oz);
      const d = this.raycast([tx, ty, tz], this._tmp, dist + 0.35);
      if (d >= 0) dist = Math.max(this.minDistance * 0.6, d - 0.32);
    }

    let ex = tx + ox * dist, ey = ty + oy * dist, ez = tz + oz * dist;

    if (this.shake > 0.001) {
      this._shakeT += dt * 44;
      const k = this.shake;
      ex += Math.sin(this._shakeT * 1.7) * 0.09 * k;
      ey += Math.sin(this._shakeT * 2.3 + 1.1) * 0.09 * k;
      ez += Math.cos(this._shakeT * 1.9 + 0.4) * 0.09 * k;
    }

    v3.set(this.pos, ex, ey, ez);
    v3.set(this.look, tx, ty, tz);
    m4.lookAt(this.view, this.pos, this.look, [0, 1, 0]);
  }

  /**
   * @param {number} dt 秒
   * @param {Float32Array|number[]} targetPos 追う点（足元）
   * @param {number} speed 走っている 速さ（引きの 加減に 使う）
   * @param {number} aspect 画面の 縦横比
   */
  update(dt, targetPos, speed, aspect) {
    /* 狙う点は 少し 遅れて 付いていく。ぴったりだと 硬く 見える。 */
    this.target[0] = damp(this.target[0], targetPos[0], 14, dt);
    this.target[1] = damp(this.target[1], targetPos[1], 9, dt);
    this.target[2] = damp(this.target[2], targetPos[2], 14, dt);

    this.yaw = dampAngle(this.yaw, this.wantYaw, 13, dt);
    this.pitch = damp(this.pitch, this.wantPitch, 13, dt);

    /* 縦長かどうかで 引きと 持ち上げを 変える。**急に 変えない**
       （回した 瞬間に カメラが 飛ぶと 酔う）。 */
    const 縦度 = clamp((0.95 - aspect) / 0.35, 0, 1);   /* 0.95 で 0、0.60 で 1 */
    this._lift = damp(this._lift, this.lift + this.portraitLift * 縦度, 4, dt);
    this._aspectDist = damp(this._aspectDist, this.portraitDist * 縦度, 4, dt);

    /* 速いほど 少し 引く。速さの 感じが 出る。 */
    const extra = clamp((speed - 4) * 0.16, 0, 1.5);
    this.distance = damp(this.distance, this.wantDistance + extra + this._aspectDist, 4.5, dt);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);

    this._place(dt);

    /* 速いほど 画角を 広げる。これも 速さの 感じ。 */
    let fov = this.fov + clamp((speed - 5) * 0.012, 0, 0.16);
    const a = Math.max(0.2, aspect);
    /* ★ 横の 画角の 下限を 守る。縦長の 画面で 前が 見えなく なるのを 防ぐ。 */
    const hf = 2 * Math.atan(Math.tan(fov / 2) * a);
    if (hf < this.minHFov) {
      fov = Math.min(this.maxVFov, 2 * Math.atan(Math.tan(this.minHFov / 2) / a));
    }
    this.vfov = fov;
    m4.perspective(this.proj, fov, a, this.near, this.far);
    m4.multiply(this.viewProj, this.proj, this.view);
    return this;
  }

  /**
   * 好きな 位置から 好きな 点を 見る（見せる 場面 用）。
   * ★ ふだんの update() の 状態は **壊さない**。
   *   合図が 終わったら そのまま ふつうの カメラへ 戻れる ように する。
   * @param {number[]|Float32Array} pos 目の 位置
   * @param {number[]|Float32Array} look 見る 点
   * @param {number} aspect 縦横比
   * @param {number} [fov] 画角（ラジアン）
   */
  setFree(pos, look, aspect, fov) {
    v3.set(this.pos, pos[0], pos[1], pos[2]);
    v3.set(this.look, look[0], look[1], look[2]);
    m4.lookAt(this.view, this.pos, this.look, [0, 1, 0]);
    let f = fov || this.fov;
    const a = Math.max(0.2, aspect);
    const hf = 2 * Math.atan(Math.tan(f / 2) * a);
    if (hf < this.minHFov) f = Math.min(this.maxVFov, 2 * Math.atan(Math.tan(this.minHFov / 2) / a));
    m4.perspective(this.proj, f, a, this.near, this.far);
    m4.multiply(this.viewProj, this.proj, this.view);
    return this;
  }

  /** 進みたい 向き（画面の 上 = カメラの 前）を 作る */
  forward(out) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return v3.set(out, -sy, 0, -cy);
  }
  right(out) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return v3.set(out, cy, 0, -sy);
  }
}
