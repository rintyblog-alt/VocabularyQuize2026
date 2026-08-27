/* ══════════════════════════════════════════════════════════════════════════
   仕掛け。20 種類。

   決まりごと（守らないと 通信で ずれる）:
     ・動きは **試合の 通し時間 t（秒）だけ**で 決める。
       dt を 足し込まない。足し込むと 端末ごとに 少しずつ ずれ、
       「こっちでは 当たっていない」が 起きる。
     ・乱数は 使わない。ばらつきが 要るときは 番号（index）で ずらす。
     ・当たり（Solid）と 見た目（draw）は **同じ 値**から 作る。
       別々に 書くと 「見えているのに 当たらない」が 生まれる。

   1 つの 仕掛けは:
     solids  … World へ 入れる 当たり
     update(t) … 位置・向きを 書き換える
     draw(R) … 描く
   ══════════════════════════════════════════════════════════════════════════ */
import { Solid, SOLID, TOUCH } from "./physics.js";
import { M } from "./meshes.js";
import { m4, TAU, clamp, lerp, smoothstep } from "../engine/math.js";

const _m = m4.create();

/** 全部の 仕掛けの 親。 */
export class Obstacle {
  constructor(course, opt) {
    this.course = course;
    this.opt = opt || {};
    this.x = this.opt.x || 0;
    this.y = this.opt.y || 0;
    this.z = this.opt.z || 0;
    this.solids = [];
    this.moving = true;        /* World へ 「動くもの」として 入れるか */
    this.color = this.opt.color || course.palette.prop;
    this.accent = this.opt.accent || course.palette.accent;
    this.kind = "base";
  }
  _solid(o) { const s = new Solid(o); s.owner = this; this.solids.push(s); return s; }
  update(t) {}
  draw(R) {}
  /** 見た目 1 つ */
  _part(R, mesh, x, y, z, ry, sx, sy, sz, color, emis, rim, stripe, sway) {
    m4.compose(_m, x, y, z, ry || 0, sx, sy, sz);
    R.draw(mesh, _m, color || this.color, emis || 0, rim === undefined ? 0.18 : rim, stripe || 0, sway || 0, Math.max(sx, sy, sz));
  }
  _partXYZ(R, mesh, x, y, z, rx, ry, rz, sx, sy, sz, color, emis, rim, stripe) {
    m4.composeXYZ(_m, x, y, z, rx, ry, rz, sx, sy, sz);
    R.draw(mesh, _m, color || this.color, emis || 0, rim === undefined ? 0.18 : rim, stripe || 0, 0, Math.max(sx, sy, sz));
  }
}

/* ══ 01 動く 板 ══════════════════════════════════════════════════════════
   opt: {x,y,z, w,d, ax,az（振れ幅）, period, phase} */
export class MovingPlatform extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "mover";
    this.w = o.w || 4; this.d = o.d || 4; this.h = o.h || 0.5;
    this.ax = o.ax || 0; this.az = o.az || 0; this.ay = o.ay || 0;
    this.period = o.period || 4;
    this.phase = o.phase || 0;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: this.h / 2, hz: this.d / 2 });
  }
  update(t) {
    const a = ((t / this.period) + this.phase) * TAU;
    this.s.x = this.x + Math.sin(a) * this.ax;
    this.s.y = this.y + Math.sin(a) * this.ay;
    this.s.z = this.z + Math.sin(a) * this.az;
  }
  draw(R) {
    const s = this.s;
    this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, this.h, this.d, this.color, 0, 0.16);
    /* 縁の 印。動く ものは 目立たせる。 */
    this._part(R, M.slab, s.x, s.y + this.h / 2 + 0.02, s.z, 0, this.w * 0.86, 0.06, this.d * 0.86, this.accent, 0.25, 0.3);
  }
}

/* ══ 02 回る 棒 ══════════════════════════════════════════════════════════ */
export class Spinner extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "spinner";
    this.len = o.len || 9;
    this.arms = o.arms || 2;
    this.speed = o.speed === undefined ? 1.1 : o.speed;
    this.phase = o.phase || 0;
    this.height = o.height === undefined ? 0.9 : o.height;
    this.bars = [];
    for (let i = 0; i < this.arms; i++) {
      this.bars.push(this._solid({
        type: SOLID.BOX, x: this.x, y: this.y + this.height, z: this.z,
        hx: this.len / 2, hy: 0.32, hz: 0.32, touch: TOUCH.PUSH, power: o.power || 1
      }));
    }
    this.post = this._solid({ type: SOLID.CYL, x: this.x, y: this.y + this.height / 2, z: this.z, hx: 0.42, hy: this.height / 2 + 0.4 });
  }
  update(t) {
    const base = t * this.speed + this.phase;
    for (let i = 0; i < this.bars.length; i++) {
      this.bars[i].ry = base + (i * Math.PI) / this.arms;
    }
  }
  draw(R) {
    this._part(R, M.post, this.x, this.y + this.height / 2, this.z, 0, 0.84, this.height + 0.8, 0.84, this.course.palette.metal, 0, 0.2);
    for (const b of this.bars) {
      this._part(R, M.box, b.x, b.y, b.z, b.ry, this.len, 0.64, 0.64, this.accent, 0.05, 0.3, 6);
      /* 先の 玉。当たる 位置が 分かりやすく なる。 */
      for (const side of [-1, 1]) {
        const ex = b.x + Math.cos(b.ry) * (this.len / 2) * side;
        const ez = b.z - Math.sin(b.ry) * (this.len / 2) * side;
        this._part(R, M.ball, ex, b.y, ez, 0, 0.95, 0.95, 0.95, this.course.palette.hot, 0.12, 0.4);
      }
    }
  }
}

/* ══ 03 ハンマー（振り子）══════════════════════════════════════════════ */
export class Hammer extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "hammer";
    this.armLen = o.armLen || 5.2;
    this.pivotY = this.y + (o.pivotY || 7.0);
    this.swing = o.swing || 1.05;      /* 振れる 角（ラジアン） */
    this.period = o.period || 2.4;
    this.phase = o.phase || 0;
    this.axis = o.axis || "x";         /* 振れる 面 */
    this.head = this._solid({ type: SOLID.BOX, x: this.x, y: this.pivotY - this.armLen, z: this.z,
      hx: 1.5, hy: 1.1, hz: 1.5, touch: TOUCH.PUSH, power: o.power || 1.35 });
  }
  update(t) {
    const a = Math.sin(((t / this.period) + this.phase) * TAU) * this.swing;
    this.ang = a;
    const dx = Math.sin(a) * this.armLen;
    const dy = -Math.cos(a) * this.armLen;
    if (this.axis === "x") { this.head.x = this.x + dx; this.head.z = this.z; }
    else { this.head.z = this.z + dx; this.head.x = this.x; }
    this.head.y = this.pivotY + dy;
    this.head.ry = this.axis === "x" ? 0 : Math.PI / 2;
  }
  draw(R) {
    const h = this.head;
    /* 支点の 梁 */
    this._part(R, M.box, this.x, this.pivotY + 0.5, this.z, this.axis === "x" ? 0 : Math.PI / 2,
      5.0, 0.5, 0.9, this.course.palette.metal, 0, 0.2);
    /* 腕 */
    const mx = (this.x + h.x) / 2, my = (this.pivotY + h.y) / 2, mz = (this.z + h.z) / 2;
    const len = Math.hypot(h.x - this.x, h.y - this.pivotY, h.z - this.z);
    const rz = this.axis === "x" ? -this.ang : 0;
    const rx = this.axis === "z" ? this.ang : 0;
    this._partXYZ(R, M.box, mx, my, mz, rx, 0, rz, 0.36, len, 0.36, this.course.palette.metal, 0, 0.24);
    /* 頭 */
    this._partXYZ(R, M.box, h.x, h.y, h.z, rx, 0, rz, 3.0, 2.2, 3.0, this.course.palette.hot, 0.06, 0.34);
  }
}

/* ══ 04 扇風機（押す）══════════════════════════════════════════════════ */
export class Fan extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "fan";
    this.dir = o.dir || { x: 1, z: 0 };
    this.strength = o.strength || 16;
    this.range = o.range || 9;
    this.width = o.width || 6;
    this.on = true;
    this.cycle = o.cycle || 0;         /* >0 なら 入り切りする */
    this.duty = o.duty === undefined ? 0.6 : o.duty;
    this.moving = false;
    /* 風は 当たりでは なく **場**。押すのは course が やる。 */
    this.body = this._solid({ type: SOLID.CYL, x: this.x, y: this.y + 1.4, z: this.z, hx: 1.5, hy: 1.5 });
    this.spin = 0;
  }
  update(t) {
    this.on = this.cycle > 0 ? ((t % this.cycle) / this.cycle) < this.duty : true;
    this.spin = t * (this.on ? 12 : 1.2);
  }
  /** 風の 中に いるか。course が 呼ぶ。 */
  windAt(px, py, pz, out) {
    if (!this.on) return false;
    const dx = px - this.x, dz = pz - this.z;
    const along = dx * this.dir.x + dz * this.dir.z;
    if (along < 0 || along > this.range) return false;
    const side = Math.abs(dx * -this.dir.z + dz * this.dir.x);
    if (side > this.width / 2) return false;
    if (py < this.y - 1 || py > this.y + 5) return false;
    const fall = 1 - along / this.range;
    out.x = this.dir.x * this.strength * fall;
    out.z = this.dir.z * this.strength * fall;
    return true;
  }
  draw(R) {
    const ry = Math.atan2(this.dir.x, this.dir.z);
    this._part(R, M.cyl, this.x, this.y + 0.5, this.z, 0, 1.6, 1.0, 1.6, this.course.palette.metal, 0, 0.2);
    this._partXYZ(R, M.cyl, this.x, this.y + 1.9, this.z, Math.PI / 2, ry, 0, 3.4, 0.9, 3.4,
      this.course.palette.metal, 0, 0.22);
    /* 羽根 4 枚 */
    for (let i = 0; i < 4; i++) {
      const a = this.spin + (i * Math.PI) / 2;
      this._partXYZ(R, M.blade, this.x + this.dir.x * 0.35, this.y + 1.9, this.z + this.dir.z * 0.35,
        Math.PI / 2, ry, a, 2.7, 0.12, 0.7, this.on ? this.accent : this.course.palette.metal,
        this.on ? 0.22 : 0, 0.3);
    }
    /* 風の 筋。出ているか 見て 分かる ように。 */
    if (this.on) {
      for (let i = 0; i < 5; i++) {
        const t2 = ((this.spin * 0.35 + i * 0.2) % 1);
        const d = t2 * this.range;
        const a2 = 0.30 * (1 - t2);
        this._part(R, M.slab,
          this.x + this.dir.x * (d + 1.6), this.y + 1.9 + Math.sin(i * 2.1) * 0.9, this.z + this.dir.z * (d + 1.6),
          ry, this.width * 0.7, 0.06, 0.5, [this.accent[0], this.accent[1], this.accent[2], a2], 0.5, 0);
      }
    }
  }
}

/* ══ 05 バンパー（弾く 玉）════════════════════════════════════════════ */
export class Bumper extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "bumper";
    this.r = o.r || 1.5;
    this.bob = o.bob || 0;
    this.period = o.period || 2.2;
    this.phase = o.phase || 0;
    this.s = this._solid({ type: SOLID.CYL, x: this.x, y: this.y + this.r, z: this.z,
      hx: this.r, hy: this.r, touch: TOUCH.PUSH, power: o.power || 1.15 });
    this.pulse = 0;
  }
  update(t) {
    const a = ((t / this.period) + this.phase) * TAU;
    if (this.bob) this.s.y = this.y + this.r + Math.sin(a) * this.bob;
    this.pulse = 0.5 + 0.5 * Math.sin(a * 2);
  }
  draw(R) {
    const s = this.s, k = 1 + this.pulse * 0.06;
    this._part(R, M.ball, s.x, s.y, s.z, 0, this.r * 2 * k, this.r * 2 * k, this.r * 2 * k,
      this.course.palette.hot, 0.10 + this.pulse * 0.16, 0.42);
    this._part(R, M.ring, s.x, s.y, s.z, 0, this.r * 2.5, this.r * 0.9, this.r * 2.5,
      this.accent, 0.3 + this.pulse * 0.3, 0.4);
  }
}

/* ══ 06 トランポリン ════════════════════════════════════════════════════ */
export class Trampoline extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "tramp";
    this.r = o.r || 2.2;
    this.moving = false;
    this.s = this._solid({ type: SOLID.CYL, x: this.x, y: this.y + 0.22, z: this.z,
      hx: this.r, hy: 0.22, touch: TOUCH.BOUNCE, power: o.power || 1 });
    this.hit = 0;
  }
  update(t) { if (this.hit > 0) this.hit = Math.max(0, this.hit - 1 / 60); }
  bump() { this.hit = 0.34; }
  draw(R) {
    const s = this.s;
    const squash = 1 - this.hit * 1.4;
    this._part(R, M.cyl, s.x, s.y - 0.1, s.z, 0, this.r * 2, 0.5 * squash, this.r * 2,
      this.course.palette.spring, 0.10, 0.3);
    this._part(R, M.ring, s.x, s.y + 0.14, s.z, 0, this.r * 2.2, 0.55, this.r * 2.2,
      this.accent, 0.34, 0.42);
  }
}

/* ══ 07 落ちる 板 ══════════════════════════════════════════════════════
   乗ると 少ししてから 落ちる。時間が 経つと 戻る。 */
export class FallingPlatform extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "faller";
    this.w = o.w || 3; this.d = o.d || 3;
    this.delay = o.delay === undefined ? 0.55 : o.delay;
    this.back = o.back === undefined ? 3.6 : o.back;
    this.state = 0;    /* 0 待ち / 1 揺れ / 2 落下 / 3 戻り */
    this.tick = 0;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: 0.28, hz: this.d / 2 });
    this.shake = 0;
  }
  touched() { if (this.state === 0) { this.state = 1; this.tick = 0; } }
  update(t) {
    const dt = 1 / 60;
    if (this.state === 1) {
      this.tick += dt;
      this.shake = Math.sin(this.tick * 46) * 0.09;
      if (this.tick >= this.delay) { this.state = 2; this.tick = 0; }
    } else if (this.state === 2) {
      this.tick += dt;
      this.s.y -= (2 + this.tick * 22) * dt;
      this.s.enabled = this.s.y > this.y - 2.5;
      if (this.tick > this.back) { this.state = 3; this.tick = 0; }
    } else if (this.state === 3) {
      this.tick += dt;
      this.s.y = lerp(this.s.y, this.y, 1 - Math.exp(-7 * dt));
      this.s.enabled = true;
      if (Math.abs(this.s.y - this.y) < 0.02) { this.s.y = this.y; this.state = 0; this.shake = 0; }
    }
  }
  draw(R) {
    const s = this.s;
    if (!s.enabled && this.state === 2) return;
    const c = this.state === 1 ? this.course.palette.warn : this.color;
    this._part(R, M.slab, s.x + this.shake, s.y, s.z, 0, this.w, 0.56, this.d, c, this.state === 1 ? 0.2 : 0, 0.2);
  }
}

/* ══ 08 消える 板 ══════════════════════════════════════════════════════ */
export class BlinkPlatform extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "blinker";
    this.w = o.w || 3; this.d = o.d || 3;
    this.period = o.period || 3.0;
    this.duty = o.duty === undefined ? 0.55 : o.duty;
    this.phase = o.phase || 0;
    this.on = true;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: 0.28, hz: this.d / 2 });
  }
  update(t) {
    const u = (((t / this.period) + this.phase) % 1 + 1) % 1;
    this.on = u < this.duty;
    this.fade = this.on ? Math.min(1, (this.duty - u) * 6) : 0;
    this.s.enabled = this.on;
  }
  draw(R) {
    const s = this.s;
    const u = this.on ? 1 : 0.16;
    const c = this.on ? this.color : this.accent;
    this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, 0.5, this.d,
      [c[0], c[1], c[2], u], this.on ? 0.06 : 0.34, 0.24);
  }
}

/* ══ 09 ベルト（運ぶ 床）══════════════════════════════════════════════ */
export class Conveyor extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "conveyor";
    this.w = o.w || 6; this.d = o.d || 10;
    this.speed = o.speed === undefined ? 4 : o.speed;
    this.dir = o.dir || { x: 0, z: -1 };
    this.moving = false;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: 0.3, hz: this.d / 2,
      conveyor: { x: this.dir.x * this.speed, z: this.dir.z * this.speed } });
    this.roll = 0;
  }
  update(t) { this.roll = (t * this.speed * 0.6) % 1; }
  draw(R) {
    const s = this.s;
    this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, 0.6, this.d, this.course.palette.metal, 0, 0.16);
    /* 流れる 矢印。向きと 速さが 見て 分かる。 */
    const n = Math.max(2, Math.round(this.d / 2.2));
    for (let i = 0; i < n; i++) {
      const u = ((i / n) + this.roll * (this.dir.z < 0 || this.dir.x < 0 ? -1 : 1) + 2) % 1;
      const px = this.x + this.dir.x * (u - 0.5) * this.d;
      const pz = this.z + this.dir.z * (u - 0.5) * this.d;
      const ry = Math.atan2(this.dir.x, this.dir.z);
      this._part(R, M.cone, px, s.y + 0.34, pz, ry, 1.1, 0.9, 1.1, this.accent, 0.3, 0.3);
    }
  }
}

/* ══ 10 ローラー（回る 太い 筒）══════════════════════════════════════ */
export class Roller extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "roller";
    this.len = o.len || 8;
    this.r = o.r || 1.1;
    this.speed = o.speed === undefined ? 2.6 : o.speed;
    this.axis = o.axis || "x";
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y + this.r, z: this.z,
      hx: this.axis === "x" ? this.len / 2 : this.r,
      hy: this.r,
      hz: this.axis === "x" ? this.r : this.len / 2,
      conveyor: { x: this.axis === "x" ? 0 : 0, z: 0 } });
    this.spin = 0;
    /* 転がる 向きへ 押す */
    this.s.conveyor = this.axis === "x"
      ? { x: 0, z: (o.push === undefined ? 3.2 : o.push) }
      : { x: (o.push === undefined ? 3.2 : o.push), z: 0 };
  }
  update(t) { this.spin = t * this.speed; }
  draw(R) {
    const s = this.s;
    const ry = this.axis === "x" ? 0 : Math.PI / 2;
    this._partXYZ(R, M.cyl, s.x, s.y, s.z, 0, ry, Math.PI / 2, this.r * 2, this.len, this.r * 2,
      this.course.palette.metal, 0, 0.22);
    /* 縞。回っているのが 分かる。 */
    for (let i = 0; i < 4; i++) {
      const a = this.spin + (i * Math.PI) / 2;
      const ox = Math.cos(a) * this.r * 0.86, oy = Math.sin(a) * this.r * 0.86;
      const px = this.axis === "x" ? s.x : s.x + oy;
      const pz = this.axis === "x" ? s.z + oy : s.z;
      this._partXYZ(R, M.blade, px, s.y + (this.axis === "x" ? ox : ox), pz,
        0, ry, a, this.len * 0.98, 0.10, 0.34, this.accent, 0.18, 0.3);
    }
  }
}

/* ══ 11 押し出す 壁 ════════════════════════════════════════════════════ */
export class PushWall extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "pushwall";
    this.w = o.w || 4; this.h = o.h || 3; this.reach = o.reach || 4;
    this.dir = o.dir || { x: 1, z: 0 };
    this.period = o.period || 3.4;
    this.phase = o.phase || 0;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y + this.h / 2, z: this.z,
      hx: (Math.abs(this.dir.x) > 0.5 ? 0.5 : this.w / 2), hy: this.h / 2,
      hz: (Math.abs(this.dir.x) > 0.5 ? this.w / 2 : 0.5),
      touch: TOUCH.PUSH, power: o.power || 1.1 });
    this.out = 0;
  }
  update(t) {
    const u = (((t / this.period) + this.phase) % 1 + 1) % 1;
    /* 出るのは 速く、戻るのは ゆっくり。避けやすい リズムに なる。 */
    this.out = u < 0.22 ? smoothstep(0, 0.22, u) : (u < 0.44 ? 1 : 1 - smoothstep(0.44, 0.86, u));
    this.s.x = this.x + this.dir.x * this.out * this.reach;
    this.s.z = this.z + this.dir.z * this.out * this.reach;
  }
  draw(R) {
    const s = this.s;
    const sx = Math.abs(this.dir.x) > 0.5 ? 1.0 : this.w;
    const sz = Math.abs(this.dir.x) > 0.5 ? this.w : 1.0;
    /* 収まる 箱 */
    this._part(R, M.box, this.x - this.dir.x * 0.6, this.y + this.h / 2, this.z - this.dir.z * 0.6, 0,
      sx + 0.6, this.h + 0.4, sz + 0.6, this.course.palette.metal, 0, 0.18);
    this._part(R, M.box, s.x, s.y, s.z, 0, sx, this.h, sz,
      this.out > 0.6 ? this.course.palette.hot : this.accent, this.out * 0.16, 0.3, 4);
  }
}

/* ══ 12 時間で 開く 門 ════════════════════════════════════════════════ */
export class TimedGate extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "timedgate";
    this.w = o.w || 5; this.h = o.h || 4;
    this.period = o.period || 4;
    this.duty = o.duty === undefined ? 0.45 : o.duty;   /* 開いている 割合 */
    this.phase = o.phase || 0;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y + this.h / 2, z: this.z,
      hx: this.w / 2, hy: this.h / 2, hz: 0.4 });
    this.open = 0;
  }
  update(t) {
    const u = (((t / this.period) + this.phase) % 1 + 1) % 1;
    /* ★ duty は 「開いている 割合」。
       前は 開き始め・閉じ終わりに 0.14 ずつ 使っていたので、
       duty=0.34 だと **本当に 開いているのは 0.06**（周期 2.2 秒で 0.13 秒）。
       人も ボットも 通れない。実測で c15 が 通過不能に なっていた。
       いまは 上下する 時間を duty の 中の 3 割に 収める。 */
    const ramp = Math.min(0.12, this.duty * 0.3);
    let open;
    if (u >= this.duty) open = 0;
    else if (u < ramp) open = u / ramp;
    else if (u < this.duty - ramp) open = 1;
    else open = (this.duty - u) / ramp;
    this.open = open;
    /* 半分 上がれば もう 通れる（頭の 上に 隙間が ある） */
    this.s.enabled = this.open < 0.5;
    this.s.y = this.y + this.h / 2 + this.open * this.h;
  }
  draw(R) {
    /* 柱 */
    for (const side of [-1, 1]) {
      this._part(R, M.box, this.x + side * (this.w / 2 + 0.4), this.y + this.h / 2, this.z, 0,
        0.7, this.h + 0.6, 0.7, this.course.palette.metal, 0, 0.2);
    }
    const s = this.s;
    this._part(R, M.box, s.x, s.y, s.z, 0, this.w, this.h, 0.7,
      this.open > 0.7 ? this.course.palette.spring : this.accent, this.open * 0.2, 0.28, 5);
  }
}

/* ══ 13 中間地点 ══════════════════════════════════════════════════════ */
export class Checkpoint extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "checkpoint";
    this.index = o.index || 0;
    this.w = o.w || 10;
    this.moving = false;
    this.reached = false;
    this.glow = 0;
    /* 通り抜ける 判定だけ（当たらない） */
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y + 2, z: this.z,
      hx: this.w / 2, hy: 2.6, hz: 0.7, solid: false, tag: "checkpoint" });
  }
  update(t) { this.glow = 0.5 + 0.5 * Math.sin(t * 2.4 + this.index); }
  draw(R) {
    const c = this.reached ? this.course.palette.spring : this.accent;
    for (const side of [-1, 1]) {
      this._part(R, M.post, this.x + side * this.w / 2, this.y + 2.2, this.z, 0, 0.5, 4.4, 0.5,
        this.course.palette.metal, 0, 0.2);
      /* 旗 */
      this._part(R, M.flag, this.x + side * (this.w / 2 - 0.75 * side), this.y + 3.9, this.z, 0,
        1.5, 0.9, 0.1, c, 0.2 + this.glow * 0.2, 0.34, 0, 0.06);
    }
    this._part(R, M.box, this.x, this.y + 4.4, this.z, 0, this.w + 0.4, 0.35, 0.35,
      c, 0.25 + this.glow * 0.25, 0.4);
  }
}

/* ══ 14 ゴール ════════════════════════════════════════════════════════ */
export class Finish extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "finish";
    this.w = o.w || 12;
    this.moving = false;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y + 2.5, z: this.z,
      hx: this.w / 2, hy: 3.2, hz: 0.8, solid: false, tag: "finish" });
    this.glow = 0;
  }
  update(t) { this.glow = 0.5 + 0.5 * Math.sin(t * 3.2); }
  draw(R) {
    for (const side of [-1, 1]) {
      this._part(R, M.post, this.x + side * this.w / 2, this.y + 3, this.z, 0, 0.8, 6, 0.8,
        this.course.palette.metal, 0, 0.22);
    }
    /* 上の 帯 */
    this._part(R, M.box, this.x, this.y + 5.8, this.z, 0, this.w + 1.2, 1.0, 0.5,
      this.course.palette.gold, 0.3 + this.glow * 0.3, 0.45);
    /* 市松 */
    const n = 10;
    for (let i = 0; i < n; i++) {
      const cx = this.x - this.w / 2 + (i + 0.5) * (this.w / n);
      const c = (i % 2) ? [1, 1, 1, 1] : [0.10, 0.11, 0.18, 1];
      this._part(R, M.slab, cx, this.y + 4.9, this.z, 0, this.w / n, 0.7, 0.24, c, 0.05, 0.2);
      const c2 = (i % 2) ? [0.10, 0.11, 0.18, 1] : [1, 1, 1, 1];
      this._part(R, M.slab, cx, this.y + 4.2, this.z, 0, this.w / n, 0.7, 0.24, c2, 0.05, 0.2);
    }
  }
}

/* ══ 15 打ち上げ台 ════════════════════════════════════════════════════ */
export class LaunchPad extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "launch";
    this.r = o.r || 1.6;
    this.moving = false;
    this.s = this._solid({ type: SOLID.CYL, x: this.x, y: this.y + 0.3, z: this.z,
      hx: this.r, hy: 0.3, touch: TOUCH.BOUNCE, power: o.power || 1.7 });
    this.t = 0;
  }
  update(t) { this.t = t; }
  draw(R) {
    const s = this.s;
    this._part(R, M.cyl, s.x, s.y, s.z, 0, this.r * 2, 0.6, this.r * 2, this.course.palette.metal, 0, 0.2);
    for (let i = 0; i < 3; i++) {
      const u = ((this.t * 1.2 + i / 3) % 1);
      this._part(R, M.ring, s.x, s.y + 0.4 + u * 3.4, s.z, 0,
        this.r * 2 * (1 - u * 0.4), 0.4, this.r * 2 * (1 - u * 0.4),
        [this.course.palette.spring[0], this.course.palette.spring[1], this.course.palette.spring[2], 0.7 * (1 - u)],
        0.6, 0.3);
    }
  }
}

/* ══ 16 危ない 床（触ると 戻される）════════════════════════════════════ */
export class Hazard extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "hazard";
    this.w = o.w || 8; this.d = o.d || 8;
    this.moving = false;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: 0.35, hz: this.d / 2, solid: false, touch: TOUCH.DEADLY });
    this.t = 0;
  }
  update(t) { this.t = t; }
  draw(R) {
    const s = this.s;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.6);
    this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, 0.5, this.d,
      this.course.palette.danger, 0.18 + pulse * 0.18, 0.3, 12, 0.03);
  }
}

/* ══ 17 氷（滑る 床）══════════════════════════════════════════════════ */
export class Ice extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "ice";
    this.w = o.w || 8; this.d = o.d || 10;
    this.moving = false;
    this.s = this._solid({ type: SOLID.BOX, x: this.x, y: this.y, z: this.z,
      hx: this.w / 2, hy: 0.3, hz: this.d / 2, friction: 0.06 });
  }
  draw(R) {
    const s = this.s;
    this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, 0.6, this.d,
      [0.72, 0.90, 1.0, 0.92], 0.14, 0.5);
  }
}

/* ══ 18 細い 道 ════════════════════════════════════════════════════════ */
export class NarrowPath extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "narrow";
    this.w = o.w || 1.6; this.d = o.d || 14;
    this.wave = o.wave || 0;
    this.moving = false;
    this.parts = [];
    const n = Math.max(1, Math.round(this.d / 3.5));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const px = this.x + Math.sin(u * Math.PI * 2) * this.wave;
      const pz = this.z + (u - 0.5) * this.d;
      const s = this._solid({ type: SOLID.BOX, x: px, y: this.y, z: pz,
        hx: this.w / 2, hy: 0.3, hz: (this.d / n) / 2 + 0.1 });
      this.parts.push(s);
    }
  }
  draw(R) {
    for (const s of this.parts) {
      this._part(R, M.slab, s.x, s.y, s.z, 0, this.w, 0.6, s.hz * 2, this.color, 0, 0.24);
      /* 端の 縞 */
      for (const side of [-1, 1]) {
        this._part(R, M.slab, s.x + side * this.w / 2, s.y + 0.32, s.z, 0, 0.18, 0.12, s.hz * 2,
          this.course.palette.warn, 0.2, 0.3);
      }
    }
  }
}

/* ══ 19 とび石 ════════════════════════════════════════════════════════ */
export class SteppingStones extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "stones";
    this.count = o.count || 5;
    this.gap = o.gap === undefined ? 4.2 : o.gap;
    this.spread = o.spread || 3.0;
    this.r = o.r || 1.5;
    this.bob = o.bob || 0;
    this.moving = this.bob > 0;
    this.stones = [];
    for (let i = 0; i < this.count; i++) {
      const px = this.x + Math.sin(i * 1.7) * this.spread;
      const pz = this.z - i * this.gap;
      const s = this._solid({ type: SOLID.CYL, x: px, y: this.y, z: pz, hx: this.r, hy: 0.35 });
      s.__baseY = this.y;
      s.__i = i;
      this.stones.push(s);
    }
  }
  update(t) {
    if (!this.bob) return;
    for (const s of this.stones) s.y = s.__baseY + Math.sin(t * 1.4 + s.__i * 0.9) * this.bob;
  }
  draw(R) {
    for (const s of this.stones) {
      this._part(R, M.cyl, s.x, s.y, s.z, 0, this.r * 2, 0.7, this.r * 2, this.color, 0, 0.22);
      this._part(R, M.cyl, s.x, s.y + 0.36, s.z, 0, this.r * 1.7, 0.1, this.r * 1.7, this.accent, 0.18, 0.3);
    }
  }
}

/* ══ 20 回る 床（円盤）════════════════════════════════════════════════ */
export class Turntable extends Obstacle {
  constructor(c, o) {
    super(c, o);
    this.kind = "turntable";
    this.r = o.r || 5;
    this.speed = o.speed === undefined ? 0.5 : o.speed;
    this.s = this._solid({ type: SOLID.CYL, x: this.x, y: this.y, z: this.z, hx: this.r, hy: 0.35 });
    this.spin = 0;
  }
  update(t) { this.spin = t * this.speed; this.s.ry = this.spin; }
  draw(R) {
    const s = this.s;
    this._part(R, M.cyl, s.x, s.y, s.z, this.spin, this.r * 2, 0.7, this.r * 2, this.color, 0, 0.2);
    for (let i = 0; i < 6; i++) {
      const a = this.spin + (i * TAU) / 6;
      this._part(R, M.slab, s.x + Math.cos(a) * this.r * 0.6, s.y + 0.36, s.z + Math.sin(a) * this.r * 0.6,
        -a, this.r * 0.7, 0.1, 0.45, this.accent, 0.16, 0.3);
    }
  }
}

/* ══ 名前 → 作り手 ════════════════════════════════════════════════════ */
export const OBSTACLES = {
  mover: MovingPlatform,
  spinner: Spinner,
  hammer: Hammer,
  fan: Fan,
  bumper: Bumper,
  tramp: Trampoline,
  faller: FallingPlatform,
  blinker: BlinkPlatform,
  conveyor: Conveyor,
  roller: Roller,
  pushwall: PushWall,
  timedgate: TimedGate,
  checkpoint: Checkpoint,
  finish: Finish,
  launch: LaunchPad,
  hazard: Hazard,
  ice: Ice,
  narrow: NarrowPath,
  stones: SteppingStones,
  turntable: Turntable
};

export const OBSTACLE_NAMES = Object.keys(OBSTACLES);
