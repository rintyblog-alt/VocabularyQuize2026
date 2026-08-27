/* ══════════════════════════════════════════════════════════════════════════
   粒（土ぼこり・跳ねた 波紋・紙吹雪・当たった 火花）。

   決めごと:
     ・**数を 先に 決めて 使い回す**（object pooling）。
       毎回 作ると ごみが 出て、それが そのまま カクつきに なる。
     ・形は すでに 登録して ある もの（球・板）を 使う。
       新しい 形を 足すと まとめ描きの 束が 増える。
     ・段（低/中/高/最高）で 数を 変える。低い 端末では 4 分の 1。
     ・当たり判定は 持たない。**見た目だけ。**
   ══════════════════════════════════════════════════════════════════════════ */
import { m4 } from "./math.js";

const _m = m4.create();

export class Particles {
  /**
   * @param {number} max いちばん 多いとき の 数
   */
  constructor(max) {
    this.max = Math.max(16, max | 0);
    this.n = 0;
    /* 1 粒あたり: x y z vx vy vz life maxLife size spin kind */
    this.x = new Float32Array(this.max);
    this.y = new Float32Array(this.max);
    this.z = new Float32Array(this.max);
    this.vx = new Float32Array(this.max);
    this.vy = new Float32Array(this.max);
    this.vz = new Float32Array(this.max);
    this.life = new Float32Array(this.max);
    this.full = new Float32Array(this.max);
    this.size = new Float32Array(this.max);
    this.spin = new Float32Array(this.max);
    this.kind = new Uint8Array(this.max);     /* 0 粒 / 1 板（紙吹雪）/ 2 輪 */
    this.col = new Float32Array(this.max * 3);
    this.grav = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
  }

  clear() { this.n = 0; }

  _add(x, y, z, vx, vy, vz, life, size, r, g, b, kind, grav, drag) {
    let i;
    if (this.n < this.max) i = this.n++;
    else {
      /* いっぱいなら いちばん 古い（残りが 少ない）ものを 使い回す */
      i = 0; let m = this.life[0];
      for (let k = 1; k < this.n; k++) if (this.life[k] < m) { m = this.life[k]; i = k; }
    }
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.full[i] = life;
    this.size[i] = size; this.spin[i] = Math.random() * 6.28;
    this.kind[i] = kind || 0;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.grav[i] = grav === undefined ? -14 : grav;
    this.drag[i] = drag === undefined ? 1.6 : drag;
    return i;
  }

  /* ── 出す ─────────────────────────────────────────────────────── */

  /** 走った あとの 土ぼこり */
  dust(x, y, z, dirx, dirz, amount, color) {
    const n = Math.max(1, Math.round(2 * amount));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, r = Math.random() * 0.4;
      this._add(
        x + Math.cos(a) * r, y + 0.06, z + Math.sin(a) * r,
        -dirx * (1 + Math.random()) + (Math.random() - 0.5) * 1.4,
        0.6 + Math.random() * 1.4,
        -dirz * (1 + Math.random()) + (Math.random() - 0.5) * 1.4,
        0.34 + Math.random() * 0.24, 0.16 + Math.random() * 0.14,
        color[0], color[1], color[2], 0, -5, 3.2);
    }
  }

  /** 着地の 波紋 */
  land(x, y, z, power, color) {
    const n = Math.max(3, Math.round(6 * power));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.28 + Math.random() * 0.4;
      const sp = 2.2 + Math.random() * 2.4 * power;
      this._add(x, y + 0.08, z, Math.cos(a) * sp, 1.0 + Math.random(), Math.sin(a) * sp,
        0.32, 0.18 + Math.random() * 0.12, color[0], color[1], color[2], 0, -9, 3.6);
    }
    /* 広がる 輪 1 つ */
    this._add(x, y + 0.05, z, 0, 0, 0, 0.30, 0.9, color[0], color[1], color[2], 2, 0, 0);
  }

  /** ぶつかった 火花 */
  hit(x, y, z, power, color) {
    const n = Math.max(5, Math.round(10 * power));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2;
      const sp = 3 + Math.random() * 5 * power;
      this._add(x, y, z,
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1.5, Math.sin(a) * Math.cos(e) * sp,
        0.42 + Math.random() * 0.26, 0.14 + Math.random() * 0.16,
        color[0], color[1], color[2], 0, -16, 1.4);
    }
  }

  /** 跳ねた（トランポリン・打ち上げ）*/
  boost(x, y, z, color) {
    for (let k = 0; k < 3; k++) {
      this._add(x, y + 0.2 + k * 0.5, z, 0, 3 + k, 0, 0.44, 1.1 + k * 0.35,
        color[0], color[1], color[2], 2, 0, 0.4);
    }
  }

  /** ゴールの 紙吹雪 */
  confetti(x, y, z, n, colors) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28;
      const c = colors[(Math.random() * colors.length) | 0];
      this._add(
        x + (Math.random() - 0.5) * 6, y + 3 + Math.random() * 5, z + (Math.random() - 0.5) * 6,
        Math.cos(a) * (1 + Math.random() * 3), 2 + Math.random() * 4, Math.sin(a) * (1 + Math.random() * 3),
        2.2 + Math.random() * 1.6, 0.22 + Math.random() * 0.16,
        c[0], c[1], c[2], 1, -6.5, 0.9);
    }
  }

  /* ── 進める ───────────────────────────────────────────────────── */
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      const k = Math.exp(-this.drag[i] * dt);
      let vx = this.vx[i] * k, vy = this.vy[i] * k + this.grav[i] * dt, vz = this.vz[i] * k;
      const x = this.x[i] + vx * dt, y = this.y[i] + vy * dt, z = this.z[i] + vz * dt;
      if (w !== i) {
        this.col[w * 3] = this.col[i * 3];
        this.col[w * 3 + 1] = this.col[i * 3 + 1];
        this.col[w * 3 + 2] = this.col[i * 3 + 2];
        this.full[w] = this.full[i]; this.size[w] = this.size[i];
        this.spin[w] = this.spin[i]; this.kind[w] = this.kind[i];
        this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i];
      }
      this.x[w] = x; this.y[w] = y; this.z[w] = z;
      this.vx[w] = vx; this.vy[w] = vy; this.vz[w] = vz;
      this.life[w] = l;
      this.spin[w] += dt * 6;
      w++;
    }
    this.n = w;
  }

  /**
   * 描く。形は すでに ある もの を 使い回す。
   * @param {import("./renderer.js").Renderer} R
   * @param {{ball:string, slab:string, ring:string}} mesh
   */
  draw(R, mesh) {
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i] / this.full[i];
      const a = Math.min(1, t * 1.8);
      const c = [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2], a];
      const k = this.kind[i];
      if (k === 2) {
        /* 広がる 輪 */
        const s = this.size[i] * (1 + (1 - t) * 3.2);
        m4.compose(_m, this.x[i], this.y[i], this.z[i], 0, s, s * 0.24, s);
        R.draw(mesh.ring, _m, c, 0.5, 0.2, 0, 0, s);
      } else if (k === 1) {
        /* 紙吹雪（薄い 板が くるくる） */
        const s = this.size[i];
        m4.composeXYZ(_m, this.x[i], this.y[i], this.z[i],
          this.spin[i], this.spin[i] * 0.7, this.spin[i] * 1.3, s, s * 0.22, s * 0.6);
        R.draw(mesh.slab, _m, c, 0.18, 0.3, 0, 0, s);
      } else {
        const s = this.size[i] * (0.5 + t * 0.5);
        m4.compose(_m, this.x[i], this.y[i], this.z[i], this.spin[i], s, s, s);
        R.draw(mesh.ball, _m, c, 0.10, 0.2, 0, 0, s);
      }
    }
  }
}
