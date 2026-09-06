/* ══════════════════════════════════════════════════════════════════════════
   探索モードの 自分。走る・跳ぶ・泳ぐ・登る。

   ★ 地面の 高さは **その場で 引く**（地形は 状態を 持たない ので できる）。
     当たり判定の ための 形を 持たない ぶん、どこまでも 広い 世界で 歩ける。
   ★ 段差は 登れる 高さ（0.9）まで。それ以上は 壁として 止める。
   ══════════════════════════════════════════════════════════════════════════ */
import { SEA } from "./world/terrain.js";

const 走 = 9.5;         /* 走る 速さ */
const 歩 = 4.6;
const 加 = 14;
const 摩 = 11;
const 重 = 26;
const 跳力 = 9.4;
const 登れる = 1.05;

export class Player {
  constructor(terr, x, z) {
    this.terr = terr;
    this.pos = [x, terr.height(x, z) + 1, z];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.grounded = true;
    this.swimming = false;
    this.speed = 0;
    this.stamina = 100;
    this.maxStamina = 100;
    this.hp = 100;
    this.maxHp = 100;
    this.sprinting = false;
    this.bob = 0;
    this._wasGround = true;
    this.landed = false;      /* この コマで 着地したか（音・粒に 使う） */
  }

  /** @param {{x:number,y:number}} axis  @param {number} camYaw */
  /**
   * @param {{mx:number,mz:number}|{x:number,y:number}} 動 進みたい 向き。
   *   ★ `input.build(cam)` が 返す **世界の 向き**（mx, mz）を そのまま 受ける。
   *     古い 呼びかた（棒の {x,y} ＋ camYaw）も 受ける が、
   *     **その 場合の 前後は build と 同じ 向き**に そろえる。
   *     2026-09-02 まで ここが 逆で、棒を 上へ 押すと 後ろへ 進んで いた。
   */
  update(dt, 動, camYaw, jump, sprint) {
    const T = this.terr;
    /* ── 向きと 加速 ── */
    let fx, fz;
    if (動 && 動.mx !== undefined) {
      fx = 動.mx; fz = 動.mz;
    } else {
      let ax = (動 && 動.x) || 0, az = (動 && 動.y) || 0;
      const len = Math.hypot(ax, az);
      if (len > 1) { ax /= len; az /= len; }
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      /* 前 ＝ カメラの 見ている 向き。棒の 上（y が 負）が 前。 */
      const f = -az, r = ax;
      fx = -s * f + c * r;
      fz = -c * f - s * r;
    }
    const 入力 = Math.hypot(fx, fz);

    const 水 = this.pos[1] < SEA + 0.4;
    this.swimming = 水;
    this.sprinting = !!sprint && 入力 > 0.1 && this.stamina > 1 && !水;
    const 上限 = 水 ? 5.2 : (this.sprinting ? 走 : 歩);

    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 22);
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * (this.grounded ? 16 : 6));

    /* ★ 速さの 出しかた（2026-09-02 で 書き直し）。
       前は「足す → 減らす」で、釣り合った ところが 上限より ずっと 下に なり、
       走っても 2.4m/s しか 出なかった（上限は 4.6 のはず・実測）。
       いまは **行きたい 速さへ 近づける**。上限が そのまま 出て、
       コマ落ちしても 同じ 速さに なる。 */
    const 目x = 入力 > 0.001 ? (fx / Math.max(入力, 1)) * 上限 : 0;
    const 目z = 入力 > 0.001 ? (fz / Math.max(入力, 1)) * 上限 : 0;
    const 効 = this.grounded ? (入力 > 0.001 ? 加 : 摩) : (入力 > 0.001 ? 加 * 0.35 : 摩 * 0.3);
    const k = 1 - Math.exp(-効 * dt);
    this.vel[0] += (目x - this.vel[0]) * k;
    this.vel[2] += (目z - this.vel[2]) * k;
    if (入力 > 0.001) this.yaw = Math.atan2(fx, fz);
    this.speed = Math.hypot(this.vel[0], this.vel[2]);

    /* ── 跳ぶ ── */
    if (jump && (this.grounded || 水)) {
      this.vel[1] = 水 ? 5.4 : 跳力;
      this.grounded = false;
    }
    /* ── 重さ ── */
    this.vel[1] -= (水 ? 重 * 0.22 : 重) * dt;
    if (水 && this.vel[1] < -3.4) this.vel[1] = -3.4;

    /* ── 進む（壁を 見る）── */
    const nx = this.pos[0] + this.vel[0] * dt;
    const nz = this.pos[2] + this.vel[2] * dt;
    const 今地 = T.height(this.pos[0], this.pos[2]);
    const 先X = T.height(nx, this.pos[2]);
    const 先Z = T.height(this.pos[0], nz);
    /* 高すぎる 段は 止める（登れる ぶんは 通す） */
    if (先X - 今地 <= 登れる || this.pos[1] > 先X) this.pos[0] = nx; else this.vel[0] = 0;
    if (先Z - 今地 <= 登れる || this.pos[1] > 先Z) this.pos[2] = nz; else this.vel[2] = 0;
    this.pos[1] += this.vel[1] * dt;

    /* ── 固いもの（木の 幹・岩）から 押し出す ──────────────────────
       ★ 速さを 0 に せず **横へ 滑らせる**。0 に すると 木に 貼りついて
         動けなく なる（走っている 途中に 起きると 事故に 見える）。 */
    if (this.固い) {
      const 体 = 0.42;
      const 一覧 = this.固い(this.pos[0], this.pos[2]);
      for (let i = 0; i < 一覧.length; i++) {
        const o = 一覧[i];
        const dx = this.pos[0] - o[0], dz = this.pos[2] - o[1];
        const 要 = o[2] + 体;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 要 * 要 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), k = (要 - d) / d;
        this.pos[0] += dx * k; this.pos[2] += dz * k;
        /* 面に 沿って 滑る */
        const nx = dx / d, nz = dz / d;
        const 内 = this.vel[0] * nx + this.vel[2] * nz;
        if (内 < 0) { this.vel[0] -= nx * 内; this.vel[2] -= nz * 内; }
      }
      this.speed = Math.hypot(this.vel[0], this.vel[2]);
    }

    /* ── 地面 ── */
    const g = T.height(this.pos[0], this.pos[2]);
    this._wasGround = this.grounded;
    if (this.pos[1] <= g + 0.02) {
      this.pos[1] = g;
      if (this.vel[1] < 0) this.vel[1] = 0;
      this.grounded = true;
    } else this.grounded = false;
    this.landed = this.grounded && !this._wasGround;

    /* 水の 上には 浮く */
    if (水 && this.pos[1] < SEA - 1.4) { this.pos[1] = SEA - 1.4; if (this.vel[1] < 0) this.vel[1] = 0; }

    /* 上下の 揺れ（歩いている 感じ） */
    this.bob += this.speed * dt * 2.4;
  }

  get groundY() { return this.terr.height(this.pos[0], this.pos[2]); }
}
