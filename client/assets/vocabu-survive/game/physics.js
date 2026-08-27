/* ══════════════════════════════════════════════════════════════════════════
   当たりと 重力。

   考え方:
     ・世界は 「箱（Y 回りに 回せる）」と 「筒」の 集まり。
       坂は 箱を 傾けた ものではなく **専用の 型**にする
       （傾いた 箱に カプセルを 当てると 端で 引っかかる）。
     ・走る人は 立てた カプセル。
     ・押し戻しは 縦と 横を 分けて 解く。まとめて 解くと
       壁を 走っているだけで 上へ 押し上げられる。

   動く 足場:
     解いた あとに 「乗っている 相手」を 覚えておいて、
     次の フレームで **相手の 動いた分を 足す**。これをしないと
     動く 板の 上で 置いていかれる。

   ★ ここは **決まった 順で 決まった 答えを 出す**。
     乱数も 時計も 使わない。サーバと 同じ 答えに ならないと 意味がない。
   ══════════════════════════════════════════════════════════════════════════ */
import { clamp } from "../engine/math.js";

export const SOLID = {
  BOX: 0,       /* 直方体（Y 回りの 回転あり） */
  CYL: 1,       /* 立った 筒 */
  RAMP: 2       /* 坂（+Z 方向に 上る。ry で 向きを 変える） */
};

/** 触ったときの ふるまい */
export const TOUCH = {
  NONE: 0,
  DEADLY: 1,    /* 落ちる／死ぬ → 中間地点へ */
  BOUNCE: 2,    /* 跳ねる */
  PUSH: 3,      /* 弾く（ハンマー・バンパー） */
  SLIP: 4       /* 滑る（氷） */
};

let _uid = 1;

/**
 * 当たりの ある もの 1 つ。
 * 位置・向きは 毎フレーム 書き換えてよい（仕掛けが 動かす）。
 */
export class Solid {
  constructor(opt) {
    this.id = opt.id || ("s" + (_uid++));
    this.type = opt.type === undefined ? SOLID.BOX : opt.type;
    this.x = opt.x || 0; this.y = opt.y || 0; this.z = opt.z || 0;
    /* 箱: 半分の 大きさ / 筒: hx=半径, hy=高さの半分 / 坂: hx,hy,hz */
    this.hx = opt.hx === undefined ? 0.5 : opt.hx;
    this.hy = opt.hy === undefined ? 0.5 : opt.hy;
    this.hz = opt.hz === undefined ? 0.5 : opt.hz;
    this.ry = opt.ry || 0;
    /* 動いた分（前フレームからの 差）。乗っている人へ 渡す。 */
    this.dx = 0; this.dy = 0; this.dz = 0;
    this.dry = 0;
    this._px = this.x; this._py = this.y; this._pz = this.z; this._pry = this.ry;
    this.touch = opt.touch || TOUCH.NONE;
    this.power = opt.power === undefined ? 1 : opt.power;   /* 跳ね・弾きの 強さ */
    this.friction = opt.friction === undefined ? 1 : opt.friction;
    this.conveyor = opt.conveyor || null;   /* {x, z} 秒あたり */
    this.solid = opt.solid !== false;       /* false なら すり抜ける（判定だけ） */
    this.tag = opt.tag || "";
    this.owner = opt.owner || null;         /* 仕掛け本体への 戻り道 */
    this.enabled = opt.enabled !== false;
  }

  /** 1 フレームの 終わりに 呼ぶ。動いた分を 記録する。 */
  commit() {
    this.dx = this.x - this._px; this.dy = this.y - this._py; this.dz = this.z - this._pz;
    this.dry = this.ry - this._pry;
    this._px = this.x; this._py = this.y; this._pz = this.z; this._pry = this.ry;
  }

  /** おおまかな 判定用の 半径 */
  get radius() {
    if (this.type === SOLID.CYL) return Math.hypot(this.hx, this.hy);
    return Math.hypot(this.hx, this.hy, this.hz);
  }
}

/* ── 一番 近い 点を 探す ───────────────────────────────────────────────
   立った カプセル（中心 cx,cy,cz・半径 r・胴の 半分 hh）と
   1 つの 形の 当たりを 見る。
   返り: 押し戻す 向きと 深さ、当たった 高さ。無ければ null。 */

const _out = { nx: 0, ny: 0, nz: 0, depth: 0, py: 0, px: 0, pz: 0 };

function boxTest(s, cx, cy, cz, r, hh) {
  /* 箱の 中の 座標へ 移す */
  const c = Math.cos(-s.ry), si = Math.sin(-s.ry);
  const rx = cx - s.x, rz = cz - s.z;
  const lx = rx * c - rz * si;
  const lz = rx * si + rz * c;
  const ly = cy - s.y;

  /* カプセルの 芯は (lx, lz) に 立つ 縦の 線分 [ly-hh, ly+hh]。
     箱の 高さ [-hy, hy] と 一番 近い 高さを 探す。 */
  const segLo = ly - hh, segHi = ly + hh;
  const boxLo = -s.hy, boxHi = s.hy;
  let ny0;
  if (segHi < boxLo) ny0 = segHi;
  else if (segLo > boxHi) ny0 = segLo;
  else ny0 = clamp(0, segLo, segHi);   /* 重なっている: 箱の 中心の 高さに 近い所 */
  const qy = clamp(ny0, boxLo, boxHi);

  const qx = clamp(lx, -s.hx, s.hx);
  const qz = clamp(lz, -s.hz, s.hz);

  let dx = lx - qx, dy = ny0 - qy, dz = lz - qz;
  let d2 = dx * dx + dy * dy + dz * dz;

  if (d2 > r * r) return null;

  let nx, ny, nz, depth;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; nz = dz / d;
    depth = r - d;
  } else {
    /* 中に 入り込んだ: 一番 近い 面へ 押し出す */
    const ex = s.hx - Math.abs(lx), ey = s.hy - Math.abs(ny0), ez = s.hz - Math.abs(lz);
    if (ex <= ey && ex <= ez) { nx = lx < 0 ? -1 : 1; ny = 0; nz = 0; depth = ex + r; }
    else if (ey <= ez) { nx = 0; ny = ny0 < 0 ? -1 : 1; nz = 0; depth = ey + r; }
    else { nx = 0; ny = 0; nz = lz < 0 ? -1 : 1; depth = ez + r; }
  }
  /* 世界の 向きへ 戻す */
  const c2 = Math.cos(s.ry), s2 = Math.sin(s.ry);
  _out.nx = nx * c2 - nz * s2;
  _out.nz = nx * s2 + nz * c2;
  _out.ny = ny;
  _out.depth = depth;
  _out.px = s.x + (qx * c2 - qz * s2);
  _out.pz = s.z + (qx * s2 + qz * c2);
  _out.py = s.y + qy;
  return _out;
}

function cylTest(s, cx, cy, cz, r, hh) {
  const dx = cx - s.x, dz = cz - s.z;
  const horiz = Math.hypot(dx, dz);
  const segLo = cy - hh, segHi = cy + hh;
  const boxLo = s.y - s.hy, boxHi = s.y + s.hy;
  let ny0;
  if (segHi < boxLo) ny0 = segHi;
  else if (segLo > boxHi) ny0 = segLo;
  else ny0 = clamp(s.y, segLo, segHi);
  const qy = clamp(ny0, boxLo, boxHi);
  const qh = Math.min(horiz, s.hx);
  const ux = horiz > 1e-6 ? dx / horiz : 1, uz = horiz > 1e-6 ? dz / horiz : 0;
  const qx = s.x + ux * qh, qz = s.z + uz * qh;
  let ex = cx - qx, ey = ny0 - qy, ez = cz - qz;
  const d2 = ex * ex + ey * ey + ez * ez;
  if (d2 > r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    _out.nx = ex / d; _out.ny = ey / d; _out.nz = ez / d; _out.depth = r - d;
  } else {
    const eh = s.hx - horiz, ev = s.hy - Math.abs(ny0 - s.y);
    if (ev <= eh) { _out.nx = 0; _out.ny = (ny0 < s.y) ? -1 : 1; _out.nz = 0; _out.depth = ev + r; }
    else { _out.nx = ux; _out.ny = 0; _out.nz = uz; _out.depth = eh + r; }
  }
  _out.px = qx; _out.py = qy; _out.pz = qz;
  return _out;
}

/* 坂。ローカルで -hz 側が 低く、+hz 側が 高い。上面は 平面。 */
function rampTest(s, cx, cy, cz, r, hh) {
  const c = Math.cos(-s.ry), si = Math.sin(-s.ry);
  const rx = cx - s.x, rz = cz - s.z;
  const lx = rx * c - rz * si;
  const lz = rx * si + rz * c;
  const ly = cy - s.y;
  if (lx < -s.hx - r || lx > s.hx + r) return null;
  if (lz < -s.hz - r || lz > s.hz + r) return null;
  /* 上面の 高さ（ローカル） */
  const t = clamp((lz + s.hz) / (2 * s.hz), 0, 1);
  const top = -s.hy + t * (2 * s.hy);
  /* 面の 法線（ローカル）*/
  const slope = (2 * s.hy) / (2 * s.hz);
  const nl = Math.hypot(1, slope);
  const nyL = 1 / nl, nzL = -slope / nl;
  /* カプセルの 下端 */
  const foot = ly - hh;
  const dist = (foot - top) * nyL;   /* 面からの 距離（おおよそ） */
  if (dist > r) return null;
  /* ★ 坂は **上の 面だけ**の 形。下に 潜っている ときに 当てると
     何メートルも 一気に 押し上げて しまう（＝瞬間移動）。
     面の 近くに いる ときだけ 当てる。坂の 端は コース側で
     壁を 足して 塞ぐ。 */
  if (foot < top - r * 1.4) return null;
  const depth = r - dist;
  if (depth <= 0) return null;
  const c2 = Math.cos(s.ry), s2 = Math.sin(s.ry);
  _out.nx = (0 * c2 - nzL * s2);
  _out.nz = (0 * s2 + nzL * c2);
  _out.ny = nyL;
  _out.depth = depth;
  _out.px = cx; _out.py = s.y + top; _out.pz = cz;
  return _out;
}

export function testSolid(s, cx, cy, cz, r, hh) {
  if (!s.enabled) return null;
  if (s.type === SOLID.CYL) return cylTest(s, cx, cy, cz, r, hh);
  if (s.type === SOLID.RAMP) return rampTest(s, cx, cy, cz, r, hh);
  return boxTest(s, cx, cy, cz, r, hh);
}

/* ── 世界 ─────────────────────────────────────────────────────────────
   形が 増えると 総当たりが 効かなくなるので、**格子**に 割って 持つ。
   コースは 細長いので Z を 主に 切る。 */
export class World {
  constructor(opt) {
    this.solids = [];
    this.gravity = (opt && opt.gravity) || -26;
    this.killY = (opt && opt.killY) !== undefined ? opt.killY : -28;
    this.cell = (opt && opt.cell) || 12;
    this.grid = new Map();
    this._dirty = true;
    /* 動くものは 格子に 入れず 毎回 見る（数が 少ないので 十分） */
    this.movers = [];
  }

  add(solid, moving) {
    this.solids.push(solid);
    if (moving) { solid.__moving = true; this.movers.push(solid); }
    else this._dirty = true;
    return solid;
  }

  clear() { this.solids.length = 0; this.movers.length = 0; this.grid.clear(); this._dirty = true; }

  _key(ix, iz) { return ix * 8192 + iz; }

  build() {
    this.grid.clear();
    for (const s of this.solids) {
      if (s.__moving) continue;
      const r = s.radius;
      const x0 = Math.floor((s.x - r) / this.cell), x1 = Math.floor((s.x + r) / this.cell);
      const z0 = Math.floor((s.z - r) / this.cell), z1 = Math.floor((s.z + r) / this.cell);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this._key(ix, iz);
          let a = this.grid.get(k);
          if (!a) { a = []; this.grid.set(k, a); }
          a.push(s);
        }
      }
    }
    this._dirty = false;
  }

  /** 近くに ある ものを out へ 集める（新しい 配列を 作らない） */
  near(x, z, r, out) {
    out.length = 0;
    if (this._dirty) this.build();
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.grid.get(this._key(ix, iz));
        if (!a) continue;
        for (const s of a) { if (out.indexOf(s) < 0) out.push(s); }
      }
    }
    for (const s of this.movers) {
      if (!s.enabled) continue;
      const d = Math.abs(s.x - x) + Math.abs(s.z - z);
      if (d < r + s.radius + this.cell) out.push(s);
    }
    return out;
  }

  /** 動く ものの 「動いた分」を 確定させる（毎フレーム 最後に） */
  commitMovers() { for (const s of this.movers) s.commit(); }

  /**
   * 光線。カメラが 壁に 潜らないように するためだけ の 粗いもの。
   * @returns {number} 当たった 距離。当たらなければ -1
   */
  ray(from, dir, maxDist) {
    const step = 0.35;
    const n = Math.min(64, Math.ceil(maxDist / step));
    const tmp = [];
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * maxDist;
      const x = from[0] + dir[0] * t, y = from[1] + dir[1] * t, z = from[2] + dir[2] * t;
      this.near(x, z, 1.2, tmp);
      for (const s of tmp) {
        if (!s.solid || !s.enabled) continue;
        if (s.tag === "ghost") continue;
        const hit = testSolid(s, x, y, z, 0.22, 0.01);
        if (hit) return t;
      }
    }
    return -1;
  }
}
