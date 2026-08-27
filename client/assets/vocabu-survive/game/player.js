/* ══════════════════════════════════════════════════════════════════════════
   走る人の 動き。

   ★ **決まった 間隔（60 分の 1 秒）で しか 進めない。**
     画面が 何 Hz でも 同じ 結果に なる。これが 無いと
     「120Hz の 端末だけ 速い」が 起きるし、サーバの 検算とも 合わない。

   気持ちよさの ために 入れてある もの:
     ・コヨーテ時間 … 端から 落ちた 直後でも 少しだけ 跳べる
     ・先押し受付 … 着地の 少し前に 押した 跳びを 覚えておく
     ・空中の 効き … 空でも すこし 曲がれる（ただし 地上より 弱い）
     ・飛び込み … 前へ 突っ込む。着地で 転がる。当たり判定が 低くなる
     ・よろけ … ぶつかると 少しの 間 操作が 効かない
   ══════════════════════════════════════════════════════════════════════════ */
import { clamp, damp, angleDelta, TAU } from "../engine/math.js";
import { testSolid, TOUCH } from "./physics.js";

export const STEP = 1 / 60;

export const TUNE = {
  radius: 0.40,
  half: 0.36,             /* 胴の 半分（全高 = half*2 + radius*2 = 1.52） */
  maxSpeed: 8.2,
  accel: 48,
  airAccel: 19,
  friction: 32,
  airDrag: 0.6,
  gravity: -26,
  fallBoost: 1.45,        /* 落ちる ときは 重力を 増す（跳びが きびきびする） */
  jumpVel: 10.2,
  jumpCut: 0.45,          /* 途中で 離したら 上向きの 速さを 削る */
  coyote: 0.11,
  buffer: 0.13,
  turnRate: 15,
  maxSlope: 0.60,         /* これより 立った 面には 乗れない（法線の Y） */
  diveSpeed: 10.5,
  diveTime: 0.24,
  diveRecover: 0.62,
  stepUp: 0.42,           /* この 高さまでは 自動で 上る */
  pushOut: 1.0,
  stunTime: 0.55
};

let _pid = 1;

export class Player {
  constructor(opt) {
    opt = opt || {};
    this.id = opt.id || ("p" + (_pid++));
    this.name = opt.name || "";
    this.colorIndex = opt.colorIndex || 0;
    this.isLocal = !!opt.isLocal;

    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0;
    this.grounded = false;
    this.groundNy = 1;
    this.groundSolid = null;
    this.coyote = 0;
    this.buffer = 0;
    this.stunned = 0;
    this.dive = 0;          /* >0 … 飛び込み中 */
    this.diveCool = 0;
    this.jumpHeld = false;
    /* ★ 「押すのを やめたら 低く 跳ぶ」は **自分で 跳んだ ときだけ**。
       これを 全部の 上向きに 掛けると、トランポリンも 打ち上げも
       弾きも 毎フレーム 9% ずつ 削られる。
       実際 トランポリンが 4.8m → 1.79m に なっていた（2026-08-28 実測）。 */
    this.jumping = false;

    /* 進み具合 */
    this.checkpoint = 0;
    this.spawn = { x: 0, y: 1, z: 0, yaw: 0 };
    this.respawns = 0;
    this.finished = false;
    this.finishTime = 0;
    this.progress = 0;        /* コースに 沿った 距離 */
    this.gatePassed = 0;
    this.quizCorrect = 0;
    this.quizWrong = 0;
    this.rank = 0;
    this.penalty = 0;         /* クイズを 外したときの 減速の 残り 秒 */
    this.boost = 0;           /* 加速の 残り 秒 */

    this._near = [];
    this._lastTouch = null;
    this.events = [];         /* この step で 起きたこと（音・演出が 読む） */
  }

  reset(spawn) {
    this.spawn = Object.assign({ x: 0, y: 1, z: 0, yaw: 0 }, spawn || {});
    this.x = this.spawn.x; this.y = this.spawn.y; this.z = this.spawn.z;
    this.yaw = this.spawn.yaw || 0;
    this.vx = this.vy = this.vz = 0;
    this.grounded = false; this.coyote = 0; this.buffer = 0;
    this.stunned = 0; this.dive = 0; this.diveCool = 0;
    this.checkpoint = 0; this.respawns = 0;
    this.finished = false; this.finishTime = 0; this.progress = 0;
    this.gatePassed = 0; this.quizCorrect = 0; this.quizWrong = 0;
    this.penalty = 0; this.boost = 0;
    this.events.length = 0;
  }

  respawnAt(cp) {
    this.x = cp.x; this.y = cp.y; this.z = cp.z;
    this.yaw = cp.yaw || this.yaw;
    this.vx = this.vy = this.vz = 0;
    this.stunned = 0; this.dive = 0; this.grounded = false;
    this.respawns++;
    this.events.push({ t: "respawn" });
  }

  /** ぶつかった ときの 弾き。stun は 秒。 */
  knock(ix, iy, iz, stun) {
    this.vx += ix; this.vy += iy; this.vz += iz;
    this.stunned = Math.max(this.stunned, stun === undefined ? TUNE.stunTime : stun);
    this.grounded = false;
    this.jumping = false;
    this.dive = 0;
    this.events.push({ t: "hit", power: Math.hypot(ix, iy, iz) });
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  /** カプセルの 中心の 高さ（当たり用） */
  get centerY() { return this.y + TUNE.radius + TUNE.half; }

  /**
   * 1 歩 進める。**必ず dt = STEP で 呼ぶこと。**
   * @param {{mx:number, mz:number, jump:boolean, jumpDown:boolean, dive:boolean}} input
   *        mx/mz は 世界の 向きの 進みたい 方向（大きさ 0〜1）
   * @param {import("./physics.js").World} world
   */
  step(input, world) {
    const dt = STEP;
    this.events.length = 0;
    const T = TUNE;

    if (this.stunned > 0) this.stunned = Math.max(0, this.stunned - dt);
    if (this.diveCool > 0) this.diveCool = Math.max(0, this.diveCool - dt);
    if (this.penalty > 0) this.penalty = Math.max(0, this.penalty - dt);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);

    const canControl = this.stunned <= 0 && this.dive <= 0 && !this.finished;

    /* ── 望みの 向き ── */
    let mx = input ? (input.mx || 0) : 0;
    let mz = input ? (input.mz || 0) : 0;
    let mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }

    /* ── 飛び込み ── */
    if (canControl && input && input.dive && this.diveCool <= 0 && (this.grounded || this.coyote > 0 || this.vy < 2)) {
      this.dive = T.diveTime + T.diveRecover;
      this.diveCool = 0.85;
      const dx = mag > 0.1 ? mx : -Math.sin(this.yaw);
      const dz = mag > 0.1 ? mz : -Math.cos(this.yaw);
      const l = Math.hypot(dx, dz) || 1;
      this.vx = (dx / l) * T.diveSpeed;
      this.vz = (dz / l) * T.diveSpeed;
      if (this.grounded) this.vy = 3.6;
      this.grounded = false;
      this.events.push({ t: "dive" });
    }
    if (this.dive > 0) this.dive = Math.max(0, this.dive - dt);

    /* ── 横の 速さ ── */
    const speedCap = T.maxSpeed * (this.penalty > 0 ? 0.55 : 1) * (this.boost > 0 ? 1.34 : 1);
    if (canControl && mag > 0.02) {
      const a = (this.grounded ? T.accel : T.airAccel) * dt;
      this.vx += mx * a;
      this.vz += mz * a;
      /* 向きは なめらかに 追う */
      const want = Math.atan2(-mx, -mz);
      this.yaw += angleDelta(this.yaw, want) * (1 - Math.exp(-T.turnRate * dt));
    } else if (this.grounded && this.dive <= 0) {
      /* 摩擦 */
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 1e-4) {
        const drop = Math.min(sp, T.friction * dt * (this.groundFriction || 1));
        this.vx -= (this.vx / sp) * drop;
        this.vz -= (this.vz / sp) * drop;
      }
    } else if (!this.grounded) {
      const k = Math.exp(-T.airDrag * dt);
      this.vx *= k; this.vz *= k;
    }
    /* 上限 */
    {
      const sp = Math.hypot(this.vx, this.vz);
      const cap = this.dive > T.diveRecover ? T.diveSpeed * 1.05 : speedCap;
      if (sp > cap) { const k = cap / sp; this.vx *= k; this.vz *= k; }
    }

    /* ── 跳ぶ ── */
    if (input && input.jump) this.buffer = T.buffer;
    if (this.buffer > 0) this.buffer = Math.max(0, this.buffer - dt);
    if (this.grounded) this.coyote = T.coyote;
    else if (this.coyote > 0) this.coyote = Math.max(0, this.coyote - dt);

    if (this.buffer > 0 && this.coyote > 0 && canControl) {
      this.vy = T.jumpVel;
      this.grounded = false;
      this.jumping = true;
      this.coyote = 0; this.buffer = 0;
      this.events.push({ t: "jump" });
    }
    /* 押し続けていなければ 上りを 削る（高さを 調整できる）。
       **自分で 跳んだ ぶんにしか 効かない。** */
    const held = !!(input && input.jumpDown);
    if (this.jumping && (this.vy <= 0 || this.grounded)) this.jumping = false;
    if (this.jumping && !held && this.vy > 0) this.vy -= this.vy * T.jumpCut * dt * 12;

    /* ── 重力 ── */
    const g = T.gravity * (this.vy < 0 ? T.fallBoost : 1);
    this.vy += g * dt;
    if (this.vy < -46) this.vy = -46;

    /* ── 動く 足場に 連れて行かれる ── */
    if (this.groundSolid && this.groundSolid.enabled) {
      const s = this.groundSolid;
      this.x += s.dx; this.z += s.dz;
      if (s.dy > 0) this.y += s.dy;
      if (s.dry) {
        /* 回る 板の 上。中心から の 距離ぶん 円を 描いて 動く。 */
        const rx = this.x - s.x, rz = this.z - s.z;
        const c = Math.cos(s.dry), si = Math.sin(s.dry);
        this.x = s.x + rx * c + rz * si;
        this.z = s.z - rx * si + rz * c;
        this.yaw -= s.dry;
      }
      if (s.conveyor) { this.x += s.conveyor.x * dt; this.z += s.conveyor.z * dt; }
    }

    /* ── 進める → 押し戻す ── */
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    this.groundSolid = null;
    this.grounded = false;
    this.groundNy = 1;
    this.groundFriction = 1;
    this._lastTouch = null;

    this._resolve(world, dt);

    /* ── 落ちた ── */
    if (this.y < world.killY) this.events.push({ t: "fell" });

    return this.events;
  }

  /** 何度か 押し戻して 重なりを 消す */
  _resolve(world, dt) {
    const T = TUNE;
    const r = T.radius, hh = this.dive > T.diveRecover ? T.half * 0.42 : T.half;
    for (let iter = 0; iter < 4; iter++) {
      const cy = this.y + r + hh;
      world.near(this.x, this.z, r + 2.2, this._near);
      let moved = false;
      for (const s of this._near) {
        if (!s.enabled) continue;
        const hit = testSolid(s, this.x, cy, this.z, r, hh);
        if (!hit) continue;
        this._touch(s, hit);
        if (!s.solid) continue;

        /* ── 低い 段は 上る ────────────────────────────────────
           これが 無いと 0.2m の 出っ張りでも 足が 止まる。
           実際 トランポリン（高さ 0.2m）の 横に ぶつかって
           跳ねられ なかった（2026-08-28 実測）。
           条件: 立っている / 立ちかけ ＆ 相手の 上面が すぐ そこ。 */
        if (hit.ny <= T.maxSlope && s.type !== 2 /* RAMP */
            && (this.grounded || this.coyote > 0 || this.vy <= 0.5)) {
          const topY = s.y + s.hy;
          const rise = topY - this.y;
          if (rise > 0.005 && rise <= T.stepUp) {
            this.y = topY + 0.002;
            this.grounded = true;
            this.groundNy = 1;
            this.groundSolid = s;
            this.groundFriction = s.friction;
            if (this.vy < 0) this.vy = 0;
            moved = true;
            continue;
          }
        }

        const d = hit.depth * T.pushOut;
        if (d <= 0) continue;
        this.x += hit.nx * d;
        this.y += hit.ny * d;
        this.z += hit.nz * d;
        moved = true;
        /* 速さの うち 面へ 向かう ぶんを 消す */
        const vn = this.vx * hit.nx + this.vy * hit.ny + this.vz * hit.nz;
        if (vn < 0) {
          this.vx -= hit.nx * vn;
          this.vy -= hit.ny * vn;
          this.vz -= hit.nz * vn;
        }
        if (hit.ny > T.maxSlope) {
          this.grounded = true;
          this.groundNy = hit.ny;
          this.groundSolid = s;
          this.groundFriction = s.friction;
          if (this.vy < 0) this.vy = 0;
        } else if (hit.ny < -0.5 && this.vy > 0) {
          this.vy = 0;   /* 天井に 頭を ぶつけた */
        }
      }
      if (!moved) break;
    }
  }

  /** 触った ときの ふるまい */
  _touch(s, hit) {
    if (s.touch === TOUCH.NONE) return;
    if (this._lastTouch === s) return;
    this._lastTouch = s;
    if (s.touch === TOUCH.DEADLY) {
      this.events.push({ t: "deadly", solid: s });
    } else if (s.touch === TOUCH.BOUNCE) {
      if (hit.ny > 0.3) {
        this.vy = 15.5 * (s.power || 1);
        this.grounded = false;
        this.jumping = false;
        this.events.push({ t: "bounce", power: s.power || 1 });
      }
    } else if (s.touch === TOUCH.PUSH) {
      const p = (s.power || 1);
      /* ★ hit.n は **外へ 押し出す 向き**。
         ここに マイナスを 付けると 中へ 押し込む ことに なり、
         直後の 押し戻しで 速さが 丸ごと 消える（実測で 0 に なっていた）。
         さらに、走って きた 勢いを **先に 消す**。足すだけだと
         8.2m/s で 突っ込んだ 人は +9 を 足しても 0.8 しか 残らない。 */
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) { this.vx -= hit.nx * vn; this.vz -= hit.nz * vn; }
      this.knock(hit.nx * 9 * p, 6.2 * p, hit.nz * 9 * p, TUNE.stunTime);
    } else if (s.touch === TOUCH.SLIP) {
      this.groundFriction = 0.08;
    }
  }

  /** サーバへ 送る／サーバが 検算する ための 最小限 */
  snapshot() {
    return {
      x: this.x, y: this.y, z: this.z,
      vx: this.vx, vy: this.vy, vz: this.vz,
      yaw: this.yaw, g: this.grounded ? 1 : 0,
      cp: this.checkpoint, pr: this.progress,
      st: this.stunned > 0 ? 1 : 0, dv: this.dive > 0 ? 1 : 0,
      fin: this.finished ? 1 : 0
    };
  }
  applySnapshot(s) {
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.vx = s.vx || 0; this.vy = s.vy || 0; this.vz = s.vz || 0;
    this.yaw = s.yaw || 0;
    this.grounded = !!s.g;
    if (s.cp !== undefined) this.checkpoint = s.cp;
    if (s.pr !== undefined) this.progress = s.pr;
    this.stunned = s.st ? 0.2 : 0;
    this.dive = s.dv ? 0.2 : 0;
    this.finished = !!s.fin;
  }
}

/* ── 何 歩 進めるか（画面の 速さに 依らない）─────────────────────────── */
export class FixedStepper {
  constructor(maxCatchUp) {
    this.acc = 0;
    this.max = maxCatchUp || 5;   /* 一度に 進める 上限。これが 無いと
                                      タブを 戻した 瞬間に 数百歩 進んで 飛ぶ */
    this.alpha = 0;               /* 見た目の 補間に 使う 端数 */
  }
  /** @returns {number} 進める 歩数 */
  advance(dt) {
    this.acc += Math.min(0.25, dt);
    let n = 0;
    while (this.acc >= STEP && n < this.max) { this.acc -= STEP; n++; }
    if (this.acc > STEP * this.max) this.acc = 0;   /* 追いつけないぶんは 捨てる */
    this.alpha = this.acc / STEP;
    return n;
  }
}
