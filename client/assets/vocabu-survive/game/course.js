/* ══════════════════════════════════════════════════════════════════════════
   コースを 組み立てる。

   コースは **データ**（data/courses.js）。ここは その 読み手。
   30 本の コースが 同じ 読み手を 通るので、1 本 直せば 30 本 直る。

   並びは -Z 方向へ 伸びる。z は だんだん 小さく なる。
   区間（section）を 順に 置き、置くたびに z を 進める。

   区間の 種類:
     start      出発の 台（広い）
     path       ふつうの 床
     bridge     細い 道
     ice        滑る 床
     conveyor   運ぶ 床
     gap        何も 置かない（隙間）
     ramp       坂（登り / 下り）
     stones     とび石
     movers     動く 板を 並べる
     turn       曲がる（中心線を 横へ ずらす）
     gate       クイズの 門
     checkpoint 中間地点
     finish     ゴール

   どの 区間にも obs: [] で 仕掛けを 足せる。
   仕掛けの 座標は **その 区間の 中の 相対**（dz は 区間の 始まりから）。
   ══════════════════════════════════════════════════════════════════════════ */
import { World, Solid, SOLID, TOUCH } from "./physics.js";
import { OBSTACLES } from "./obstacle.js";
import { QuizGate } from "./gate.js";
import { themeOf } from "./theme3d.js";
import { M } from "./meshes.js";
import { m4, mulberry32, hashSeed, clamp, lerp, TAU } from "../engine/math.js";

const _m = m4.create();

export class Course {
  /**
   * @param {object} def data/courses.js の 1 本
   */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.difficulty = def.difficulty || 1;
    /* ★ this.theme は **色の 表**（中身）。飾りを 選ぶ ときに 使う
       「風景の 名前」は 別に 覚えておく。混ぜると 必ず 草原の 木に なる。 */
    this.themeName = String(def.theme || "meadow");
    this.theme = themeOf(def.theme);
    this.palette = this.theme;
    this.seed = hashSeed(def.id + "|" + (def.seed || ""));
    this.rnd = mulberry32(this.seed);

    this.world = new World({ killY: def.killY === undefined ? -22 : def.killY, cell: 14 });
    this.obstacles = [];
    this.gates = [];
    this.checkpoints = [];
    this.finish = null;
    this.decor = [];        /* 当たらない 飾り */
    this.floors = [];       /* 描く ための 床の 一覧 */
    this.path = [];         /* 中心線 {x,y,z,w,dist} */
    this.spawns = [];
    this.length = 0;
    this.fans = [];
    this.fallers = [];
    this.tramps = [];
    this.built = false;
    this._wind = { x: 0, z: 0 };
  }

  /* ── 組み立て ─────────────────────────────────────────────────────── */
  build() {
    if (this.built) return this;
    let z = 0, y = 0, cx = 0;
    const push = (x, yy, zz, w) => {
      const prev = this.path[this.path.length - 1];
      const d = prev ? prev.dist + Math.hypot(x - prev.x, zz - prev.z) : 0;
      this.path.push({ x, y: yy, z: zz, w, dist: d });
    };
    push(cx, y, z, (this.def.sections[0] && this.def.sections[0].w) || 14);

    /* ★ 区画ごとの 区切りを 覚える。
       コースを 作る 画面で「いま 選んでいる 区画は ここ」を 塗る ために 要る。 */
    this.sectionAt = [{ z: 0, cx: 0, y: 0 }];
    for (let i = 0; i < this.def.sections.length; i++) {
      const sec = this.def.sections[i];
      const r = this._section(sec, cx, y, z, i);
      cx = r.cx; y = r.y; z = r.z;
      push(cx, y, z, sec.w || 10);
      this.sectionAt.push({ z, cx, y });
    }
    this.length = this.path[this.path.length - 1].dist;
    this.endZ = z;

    this._decorate();
    this.world.build();
    this.built = true;
    return this;
  }

  _floor(x, y, z, w, d, opt) {
    opt = opt || {};
    const s = new Solid({
      type: SOLID.BOX, x, y: y - 0.3, z, hx: w / 2, hy: 0.3, hz: d / 2,
      friction: opt.friction === undefined ? 1 : opt.friction,
      conveyor: opt.conveyor || null
    });
    this.world.add(s);
    this.floors.push({ x, y, z, w, d, kind: opt.kind || "path", alt: !!opt.alt });
    if (opt.wall) {
      for (const side of [-1, 1]) {
        this.world.add(new Solid({
          type: SOLID.BOX, x: x + side * (w / 2 + 0.35), y: y + 0.7, z,
          hx: 0.35, hy: 0.7, hz: d / 2
        }));
        this.decor.push({ m: M.slab, x: x + side * (w / 2 + 0.35), y: y + 0.7, z, ry: 0,
          sx: 0.7, sy: 1.4, sz: d, c: this.palette.floorAlt, e: 0, rim: 0.2 });
      }
    }
    return s;
  }

  _addObstacle(type, o) {
    const C = type === "quizgate" ? QuizGate : OBSTACLES[type];
    if (!C) { console.warn("[VocabuSurvive] 知らない 仕掛け: " + type); return null; }
    const ob = new C(this, o);
    this.obstacles.push(ob);
    for (const s of ob.solids) this.world.add(s, ob.moving);
    if (ob.kind === "fan") this.fans.push(ob);
    if (ob.kind === "faller") this.fallers.push(ob);
    if (ob.kind === "tramp") this.tramps.push(ob);
    if (ob.kind === "quizgate") { ob.index = this.gates.length; this.gates.push(ob); }
    if (ob.kind === "checkpoint") { ob.index = this.checkpoints.length + 1; this.checkpoints.push(ob); }
    if (ob.kind === "finish") this.finish = ob;
    return ob;
  }

  _placeObs(list, cx, y, z0, len) {
    if (!list) return;
    for (const o of list) {
      const dz = o.dz === undefined ? len / 2 : o.dz;
      const opt = Object.assign({}, o);
      delete opt.t; delete opt.dz;
      opt.x = cx + (o.dx || 0);
      opt.y = y + (o.dy || 0);
      opt.z = z0 - dz;
      this._addObstacle(o.t, opt);
    }
  }

  _section(sec, cx, y, z, index) {
    const t = sec.t;
    const len = sec.len === undefined ? 16 : sec.len;
    const w = sec.w === undefined ? 11 : sec.w;
    const z0 = z;

    if (t === "start") {
      const sw = sec.w || 18, sl = sec.len || 16;
      this._floor(cx, y, z - sl / 2, sw, sl, { wall: true, kind: "start" });
      /* 出発の 並び。8 人ぶん。2 列 × 4 */
      for (let i = 0; i < 8; i++) {
        const col = i % 4, row = (i / 4) | 0;
        this.spawns.push({
          x: cx + (col - 1.5) * (sw / 5),
          y: y + 0.05,
          z: z - 2.5 - row * 3.2,
          yaw: 0
        });
      }
      this._placeObs(sec.obs, cx, y, z0, sl);
      return { cx, y, z: z - sl };
    }

    if (t === "path" || t === "bridge" || t === "ice" || t === "conveyor") {
      const fw = t === "bridge" ? (sec.w || 3.2) : w;
      const opt = { wall: !!sec.wall, kind: t, alt: !!sec.alt };
      if (t === "ice") opt.friction = 0.06;
      if (t === "conveyor") {
        const sp = sec.speed === undefined ? 3.5 : sec.speed;
        opt.conveyor = { x: (sec.cx || 0) * sp, z: (sec.cz === undefined ? -1 : sec.cz) * sp };
      }
      this._floor(cx, y, z - len / 2, fw, len, opt);
      this._placeObs(sec.obs, cx, y, z0, len);
      return { cx, y, z: z - len };
    }

    if (t === "gap") {
      this._placeObs(sec.obs, cx, y, z0, len);
      return { cx, y, z: z - len };
    }

    if (t === "ramp") {
      const dy = sec.dy === undefined ? 3 : sec.dy;
      const up = dy >= 0;
      /* 坂は ローカルの +Z が 高い。進む 向き（-Z）へ 上るには ry=π。 */
      const s = new Solid({
        type: SOLID.RAMP, x: cx, y: y + dy / 2, z: z - len / 2,
        hx: w / 2, hy: Math.abs(dy) / 2, hz: len / 2,
        ry: up ? Math.PI : 0
      });
      this.world.add(s);
      this.floors.push({ x: cx, y: y + dy / 2, z: z - len / 2, w, d: len, kind: "ramp", dy, up });
      /* 坂の 端の 壁（潜り込み 防止）。上の 端に 立てる。 */
      const topZ = up ? z - len : z;
      this.world.add(new Solid({ type: SOLID.BOX, x: cx, y: y + dy - 0.3, z: topZ + (up ? 0.4 : -0.4),
        hx: w / 2, hy: 0.35, hz: 0.4 }));
      if (sec.wall) {
        for (const side of [-1, 1]) {
          this.world.add(new Solid({ type: SOLID.BOX, x: cx + side * (w / 2 + 0.35), y: y + dy / 2 + 0.9,
            z: z - len / 2, hx: 0.35, hy: Math.abs(dy) / 2 + 1.2, hz: len / 2 }));
        }
      }
      this._placeObs(sec.obs, cx, y, z0, len);
      return { cx, y: y + dy, z: z - len };
    }

    if (t === "stones") {
      const n = sec.count || 5, gap = sec.gap === undefined ? 4.2 : sec.gap;
      this._addObstacle("stones", {
        x: cx, y: y - 0.05, z: z - gap * 0.6,
        count: n, gap, spread: sec.spread === undefined ? 3.0 : sec.spread,
        r: sec.r || 1.5, bob: sec.bob || 0
      });
      this._placeObs(sec.obs, cx, y, z0, (n + 1) * gap);
      return { cx, y, z: z - (n + 0.6) * gap };
    }

    if (t === "movers") {
      const n = sec.count || 3, gap = sec.gap === undefined ? 6 : sec.gap;
      for (let i = 0; i < n; i++) {
        this._addObstacle("mover", {
          x: cx, y: y - 0.05, z: z - (i + 1) * gap,
          w: sec.pw || 4.2, d: sec.pd || 4.2,
          ax: sec.ax === undefined ? 4.5 : sec.ax,
          az: sec.az || 0, ay: sec.ay || 0,
          period: sec.period === undefined ? 4.6 : sec.period,
          phase: i * (sec.stagger === undefined ? 0.34 : sec.stagger)
        });
      }
      this._placeObs(sec.obs, cx, y, z0, (n + 1) * gap);
      return { cx, y, z: z - (n + 1) * gap };
    }

    if (t === "turn") {
      /* 曲がる。床を 横へ 広げて 中心線を ずらす。 */
      const dx = sec.dx || 8;
      const pieces = 5;
      for (let i = 0; i < pieces; i++) {
        const u = (i + 0.5) / pieces;
        const px = cx + dx * u * u * (3 - 2 * u);
        this._floor(px, y, z - (i + 0.5) * (len / pieces), w, len / pieces + 0.6,
          { wall: !!sec.wall, kind: "path" });
      }
      this._placeObs(sec.obs, cx, y, z0, len);
      return { cx: cx + dx, y, z: z - len };
    }

    if (t === "gate") {
      /* 門の 前後に 少しだけ 床を 敷く（宙に 浮かせない） */
      const pad = sec.pad === undefined ? 9 : sec.pad;
      this._floor(cx, y, z - pad / 2, sec.w || 12, pad, { wall: sec.wall !== false, kind: "gatepad" });
      this._addObstacle("quizgate", {
        x: cx, y, z: z - pad / 2,
        w: sec.gw || 7, h: sec.gh || 4.6,
        triggerZ: sec.trigger === undefined ? 15 : sec.trigger,
        limit: sec.limit === undefined ? 12 : sec.limit
      });
      this._placeObs(sec.obs, cx, y, z0, pad);
      return { cx, y, z: z - pad };
    }

    if (t === "checkpoint") {
      const pad = sec.pad === undefined ? 8 : sec.pad;
      this._floor(cx, y, z - pad / 2, sec.w || 12, pad, { wall: true, kind: "cp" });
      this._addObstacle("checkpoint", { x: cx, y, z: z - pad / 2, w: sec.w || 11 });
      this._placeObs(sec.obs, cx, y, z0, pad);
      return { cx, y, z: z - pad };
    }

    if (t === "finish") {
      const pad = sec.pad === undefined ? 22 : sec.pad;
      this._floor(cx, y, z - pad / 2, sec.w || 18, pad, { wall: true, kind: "finish" });
      this._addObstacle("finish", { x: cx, y, z: z - 8, w: sec.w ? sec.w - 4 : 14 });
      this._placeObs(sec.obs, cx, y, z0, pad);
      return { cx, y, z: z - pad };
    }

    /* 知らない 種類は 素通り（コースが 壊れて 進めなく なるより まし） */
    console.warn("[VocabuSurvive] 知らない 区間: " + t);
    this._floor(cx, y, z - len / 2, w, len, {});
    return { cx, y, z: z - len };
  }

  /* ── 飾り（当たらない）──────────────────────────────────────────────
     ★ 風景 10 種の 差が 「空と 床の 色」だけに なって いた。
       同じ 木と 岩を どこでも 使い回して いたので、
       溶岩の 谷にも 草原の 木が 生えて いた。

     ★ **形は 増やさない。** 下の 10 個（箱・板・筒・球・輪・円すい・
       額縁・羽根・旗・柱・点）を 組み合わせて 作る。
       形を 足すと 並べ描きの まとまりが 割れて 描き回数が 増える。 */
  _decorate() {
    const rnd = mulberry32(this.seed ^ 0x9e37);
    const P = this.palette;
    const 置く = (o) => this.decor.push(o);
    const kit = DECOR_KIT[this.themeName] || DECOR_KIT.meadow;
    const n = Math.round(Math.abs(this.endZ) * 0.55);
    for (let i = 0; i < n; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const z = -rnd() * Math.abs(this.endZ);
      /* 中心線から どれくらい 離れているか を 見て 外側へ 置く */
      const p = this.pointAt(-z);
      const off = 10 + rnd() * 26;
      const x = p.x + side * off;
      const y = p.y - 1 - rnd() * 3;
      kit(置く, { x, y, z, side, off, base: p.y, rnd, P, M, TAU });
    }
  }

  /* ── 進み具合 ─────────────────────────────────────────────────────── */
  /** 距離 d の 中心線の 点 */
  pointAt(d) {
    const p = this.path;
    if (!p.length) return { x: 0, y: 0, z: 0, w: 10 };
    if (d <= 0) return p[0];
    for (let i = 1; i < p.length; i++) {
      if (p[i].dist >= d) {
        const a = p[i - 1], b = p[i];
        const t = (d - a.dist) / Math.max(1e-6, b.dist - a.dist);
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), w: lerp(a.w, b.w, t) };
      }
    }
    return p[p.length - 1];
  }

  /** 位置 → コースに 沿った 距離（0〜length） */
  progressOf(x, z) {
    const p = this.path;
    let best = 0, bestD = Infinity;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      const ax = b.x - a.x, az = b.z - a.z;
      const l2 = ax * ax + az * az;
      let t = l2 > 1e-6 ? ((x - a.x) * ax + (z - a.z) * az) / l2 : 0;
      t = clamp(t, 0, 1);
      const px = a.x + ax * t, pz = a.z + az * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < bestD) { bestD = d2; best = a.dist + (b.dist - a.dist) * t; }
    }
    return best;
  }

  /** 中間地点の 位置（戻される 先） */
  respawnPoint(cpIndex, slot) {
    if (cpIndex <= 0) {
      const s = this.spawns[(slot | 0) % Math.max(1, this.spawns.length)] || { x: 0, y: 1, z: -3, yaw: 0 };
      return { x: s.x, y: s.y + 0.4, z: s.z, yaw: 0 };
    }
    const cp = this.checkpoints[cpIndex - 1];
    if (!cp) return { x: 0, y: 1, z: -3, yaw: 0 };
    const off = ((slot | 0) % 4 - 1.5) * 2.2;
    return { x: cp.x + off, y: cp.y + 0.6, z: cp.z + 2.5, yaw: 0 };
  }

  /* ── 毎フレーム ───────────────────────────────────────────────────── */
  update(t) {
    for (const o of this.obstacles) o.update(t);
    this.world.commitMovers();
    this.t = t;
  }

  /** 風。走る人 1 人ぶん。 */
  windFor(px, py, pz) {
    this._wind.x = 0; this._wind.z = 0;
    const tmp = { x: 0, z: 0 };
    for (const f of this.fans) {
      if (f.windAt(px, py, pz, tmp)) { this._wind.x += tmp.x; this._wind.z += tmp.z; }
    }
    return this._wind;
  }

  /* ── 描く ─────────────────────────────────────────────────────────── */
  applySky(R) {
    const T = this.theme;
    R.sky.top = T.sky.top; R.sky.horizon = T.sky.horizon;
    R.sky.ground = T.sky.ground; R.sky.sun = T.sky.sun;
    R.light.dir.set(T.light);
    const l = Math.hypot(T.light[0], T.light[1], T.light[2]) || 1;
    R.light.dir[0] /= l; R.light.dir[1] /= l; R.light.dir[2] /= l;
    R.light.color = T.lightColor;
    R.ambTop = T.ambTop; R.ambBottom = T.ambBottom;
    R.fog.color = T.fog;
  }

  draw(R, t) {
    const P = this.palette;
    /* ★ 遠くに 広がる 地面。1 回の 描きで 出せる。
       これが 無いと コースが **宙に 浮いて** 見え、
       落ちた ときも 「どこへ 落ちたのか」が 分からない。
       カメラの 下へ 付いてくる ので どこまでも 続いて 見える。 */
    if (P.far) {
      const cx = R._camPos ? R._camPos[0] : 0, cz = R._camPos ? R._camPos[2] : 0;
      const y = (this.def.farY === undefined ? -26 : this.def.farY);
      m4.compose(_m, cx, y, cz, 0, 900, 1, 900);
      R.draw(M.slab, _m, P.far, 0, 0.02, 0, 0, 900);
    }
    /* 床 */
    for (const f of this.floors) {
      let c = f.alt ? P.floorAlt : P.floor;
      let stripe = 0;
      if (f.kind === "bridge") stripe = 3;
      if (f.kind === "ice") c = [0.72, 0.90, 1.0, 0.94];
      if (f.kind === "conveyor") c = P.metal;
      if (f.kind === "gatepad") c = P.floorAlt;
      if (f.kind === "cp" || f.kind === "finish" || f.kind === "start") c = P.floorAlt;
      if (f.kind === "ramp") {
        /* 坂は 傾けて 描く */
        const ang = Math.atan2(f.dy, f.d) * (f.up ? 1 : 1);
        m4.composeXYZ(_m, f.x, f.y, f.z, f.up ? -ang : ang, 0, 0,
          f.w, 0.6, Math.hypot(f.d, f.dy));
        R.draw(M.slab, _m, c, 0, 0.16, 2, 0, Math.max(f.w, f.d));
        continue;
      }
      m4.compose(_m, f.x, f.y - 0.3, f.z, 0, f.w, 0.6, f.d);
      R.draw(M.slab, _m, c, 0, 0.16, stripe, 0, Math.max(f.w, f.d));
      /* 端の 縁取り。落ちる 場所が 分かる。 */
      if (f.kind !== "start" && f.kind !== "finish") {
        for (const side of [-1, 1]) {
          m4.compose(_m, f.x + side * (f.w / 2 - 0.16), f.y + 0.02, f.z, 0, 0.32, 0.14, f.d);
          R.draw(M.slab, _m, P.accent, 0.10, 0.24, 0, 0, f.d);
        }
      }
    }
    /* 飾り */
    for (const d of this.decor) {
      const yy = d.float ? d.y + Math.sin(t * d.float + d.x * 0.3) * 0.9 : d.y;
      m4.compose(_m, d.x, yy, d.z, d.ry + (d.float ? t * 0.2 : 0), d.sx, d.sy, d.sz);
      R.draw(d.m, _m, d.c, d.e, d.rim, 0, 0, Math.max(d.sx, d.sy, d.sz));
    }
    /* 仕掛け */
    for (const o of this.obstacles) o.draw(R);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   風景ごとの 飾り

   受け取る もの: 置く(o) と { x, y, z, side, off, base, rnd, P, M, TAU }
   o の 中身   : { m 形, x, y, z, ry 向き, sx sy sz 大きさ, c 色,
                   e 光り, rim ふち, float 浮く速さ }
   ★ どの 風景も **1 か所 あたり 1〜3 個**に する。
     ここを 増やすと 遠くの 板だけで 何百個にも なり、
     並べ描きの 数が 増えて 弱い 端末で 落ちる。
   ══════════════════════════════════════════════════════════════════════════ */
const DECOR_KIT = {
  /* 草原 … まるい 木・岩・花 */
  meadow(置く, a) {
    const { x, y, z, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.45) {
      const hh = 3 + rnd() * 7;
      置く({ m: M.cyl, x, y: y + hh / 2, z, ry: 0, sx: 0.7 + rnd() * 0.5, sy: hh, sz: 0.7 + rnd() * 0.5, c: P.trunk, e: 0, rim: 0.2 });
      置く({ m: M.ball, x, y: y + hh + 1.2, z, ry: rnd() * TAU, sx: 3 + rnd() * 2, sy: 2.6 + rnd() * 1.6, sz: 3 + rnd() * 2, c: P.leaf, e: 0, rim: 0.24 });
    } else if (k < 0.75) {
      const s = 1.4 + rnd() * 3.4;
      置く({ m: M.box, x, y: y + s / 3, z, ry: rnd() * TAU, sx: s, sy: s * 0.7, sz: s, c: P.floorAlt, e: 0, rim: 0.2 });
    } else {
      /* 花。細い 茎の 上に 小さな 玉 */
      const hh = 0.8 + rnd() * 0.9;
      置く({ m: M.post, x, y: y + hh / 2, z, ry: 0, sx: 0.14, sy: hh, sz: 0.14, c: P.leaf, e: 0, rim: 0.2 });
      置く({ m: M.dot, x, y: y + hh + 0.2, z, ry: rnd() * TAU, sx: 0.6, sy: 0.5, sz: 0.6,
        c: rnd() < 0.5 ? P.accent : P.spring, e: 0.05, rim: 0.3 });
    }
  },
  /* 夕暮れ … 草原と 同じ 形だが、浮く 板を 混ぜて 空を 見せる */
  sunset(置く, a) {
    const { x, y, z, base, rnd, P, M, TAU } = a;
    if (rnd() < 0.55) return DECOR_KIT.meadow(置く, a);
    const s = 3 + rnd() * 6;
    置く({ m: M.slab, x, y: base + 8 + rnd() * 14, z, ry: rnd() * TAU,
      sx: s, sy: 0.5, sz: s * 0.7, c: P.prop, e: 0.04, rim: 0.28, float: 0.25 + rnd() * 0.4 });
  },
  /* お菓子 … 棒つきキャンディ・ドーナツ・積み木 */
  candy(置く, a) {
    const { x, y, z, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.4) {
      const hh = 3 + rnd() * 5;
      置く({ m: M.post, x, y: y + hh / 2, z, ry: 0, sx: 0.3, sy: hh, sz: 0.3, c: P.prop, e: 0, rim: 0.24 });
      置く({ m: M.ring, x, y: y + hh + 1.4, z, ry: rnd() * TAU, sx: 2.6, sy: 2.6, sz: 0.7,
        c: rnd() < 0.5 ? P.accent : P.spring, e: 0.06, rim: 0.34 });
    } else if (k < 0.72) {
      /* ドーナツの 山 */
      const s = 1.8 + rnd() * 1.6;
      for (let i = 0; i < 3; i++) {
        置く({ m: M.ring, x, y: y + 0.5 + i * 0.75, z, ry: rnd() * TAU,
          sx: s - i * 0.28, sy: s - i * 0.28, sz: 0.6, c: i % 2 ? P.gold : P.accent, e: 0.05, rim: 0.3 });
      }
    } else {
      const s = 1.2 + rnd() * 2.2;
      置く({ m: M.box, x, y: y + s / 2, z, ry: rnd() * TAU, sx: s, sy: s, sz: s, c: P.spring, e: 0.04, rim: 0.3 });
      置く({ m: M.dot, x, y: y + s + 0.5, z, ry: 0, sx: 0.8, sy: 0.8, sz: 0.8, c: P.gold, e: 0.1, rim: 0.34 });
    }
  },
  /* 氷 … 氷柱・氷塊・尖った 山 */
  ice(置く, a) {
    const { x, y, z, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.45) {
      const hh = 4 + rnd() * 12;
      置く({ m: M.cone, x, y: y + hh / 2, z, ry: rnd() * TAU,
        sx: 1.6 + rnd() * 2.4, sy: hh, sz: 1.6 + rnd() * 2.4, c: P.prop, e: 0.05, rim: 0.4 });
    } else if (k < 0.78) {
      const s = 1.6 + rnd() * 3.4;
      置く({ m: M.box, x, y: y + s / 2.4, z, ry: rnd() * TAU,
        sx: s, sy: s * 0.8, sz: s * 0.9, c: P.floorAlt, e: 0.03, rim: 0.4 });
    } else {
      /* 逆さの 氷柱（浮く） */
      const hh = 2 + rnd() * 4;
      置く({ m: M.cone, x, y: y + 12 + rnd() * 8, z, ry: Math.PI,
        sx: 1.0 + rnd(), sy: -hh, sz: 1.0 + rnd(), c: P.prop, e: 0.06, rim: 0.42, float: 0.2 + rnd() * 0.3 });
    }
  },
  /* 溶岩 … 黒い 岩柱・噴き出し・火の粉 */
  lava(置く, a) {
    const { x, y, z, base, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.45) {
      const hh = 4 + rnd() * 10;
      置く({ m: M.cyl, x, y: y + hh / 2, z, ry: rnd() * TAU,
        sx: 1.4 + rnd() * 2.2, sy: hh, sz: 1.4 + rnd() * 2.2, c: P.floorAlt, e: 0, rim: 0.2 });
      置く({ m: M.dot, x, y: y + hh + 0.4, z, ry: 0, sx: 1.4, sy: 0.7, sz: 1.4, c: P.hot, e: 0.5, rim: 0.4 });
    } else if (k < 0.72) {
      const s = 1.6 + rnd() * 3.2;
      置く({ m: M.box, x, y: y + s / 3, z, ry: rnd() * TAU, sx: s, sy: s * 0.6, sz: s, c: P.floorAlt, e: 0, rim: 0.18 });
    } else {
      /* 舞い上がる 火の粉 */
      for (let i = 0; i < 3; i++) {
        置く({ m: M.dot, x: x + (rnd() - 0.5) * 5, y: base + 2 + rnd() * 14, z: z + (rnd() - 0.5) * 5,
          ry: 0, sx: 0.5, sy: 0.5, sz: 0.5, c: rnd() < 0.5 ? P.hot : P.warn, e: 0.7, rim: 0.5, float: 0.6 + rnd() });
      }
    }
  },
  /* ネオン … 光る 柱・浮く 輪・格子の 板 */
  neon(置く, a) {
    const { x, y, z, base, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.4) {
      const hh = 6 + rnd() * 16;
      置く({ m: M.post, x, y: y + hh / 2, z, ry: 0, sx: 0.5, sy: hh, sz: 0.5, c: P.metal, e: 0, rim: 0.3 });
      置く({ m: M.post, x, y: y + hh / 2, z, ry: 0, sx: 0.22, sy: hh * 0.94, sz: 0.22,
        c: rnd() < 0.5 ? P.gateFrame : P.spring, e: 0.8, rim: 0.5 });
    } else if (k < 0.72) {
      置く({ m: M.ring, x, y: base + 5 + rnd() * 16, z, ry: rnd() * TAU,
        sx: 3 + rnd() * 4, sy: 3 + rnd() * 4, sz: 0.5,
        c: rnd() < 0.5 ? P.accent : P.gateCurtain, e: 0.6, rim: 0.5, float: 0.3 + rnd() * 0.5 });
    } else {
      const s = 2 + rnd() * 5;
      置く({ m: M.slab, x, y: base + 3 + rnd() * 10, z, ry: rnd() * TAU,
        sx: s, sy: 0.3, sz: s, c: P.metal, e: 0.1, rim: 0.4, float: 0.2 + rnd() * 0.3 });
    }
  },
  /* 森 … 高い 針葉樹・切り株・下草 */
  forest(置く, a) {
    const { x, y, z, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.6) {
      const hh = 6 + rnd() * 12;
      置く({ m: M.cyl, x, y: y + hh * 0.3, z, ry: 0, sx: 0.6, sy: hh * 0.6, sz: 0.6, c: P.trunk, e: 0, rim: 0.18 });
      /* 三段の 円すいで もみの木 */
      for (let i = 0; i < 3; i++) {
        const w = (3.4 - i * 0.8) * (0.8 + rnd() * 0.4);
        置く({ m: M.cone, x, y: y + hh * 0.45 + i * hh * 0.22, z, ry: rnd() * TAU,
          sx: w, sy: hh * 0.34, sz: w, c: P.leaf, e: 0, rim: 0.22 });
      }
    } else if (k < 0.82) {
      /* 切り株 */
      const s = 1.2 + rnd() * 1.4;
      置く({ m: M.cyl, x, y: y + 0.5, z, ry: 0, sx: s, sy: 1.0, sz: s, c: P.trunk, e: 0, rim: 0.2 });
    } else {
      /* 下草 */
      for (let i = 0; i < 3; i++) {
        置く({ m: M.blade, x: x + (rnd() - 0.5) * 4, y: y + 0.6, z: z + (rnd() - 0.5) * 4,
          ry: rnd() * TAU, sx: 0.3, sy: 1.2 + rnd(), sz: 0.3, c: P.leaf, e: 0, rim: 0.24 });
      }
    }
  },
  /* 空 … 雲・浮島・遠くの 風車 */
  sky(置く, a) {
    const { x, y, z, base, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.5) {
      /* 雲（玉の かたまり） */
      const s = 3 + rnd() * 5;
      const cy = base + 6 + rnd() * 22;
      for (let i = 0; i < 3; i++) {
        置く({ m: M.ball, x: x + (i - 1) * s * 0.7, y: cy + (rnd() - 0.5) * 1.2, z: z + (rnd() - 0.5) * 3,
          ry: 0, sx: s * (0.7 + rnd() * 0.5), sy: s * 0.5, sz: s * (0.7 + rnd() * 0.5),
          c: P.prop, e: 0.08, rim: 0.34, float: 0.12 + rnd() * 0.18 });
      }
    } else if (k < 0.8) {
      /* 浮島（板 ＋ 下に 逆さの 円すい） */
      const s = 3 + rnd() * 6;
      const cy = base - 4 - rnd() * 14;
      置く({ m: M.slab, x, y: cy, z, ry: rnd() * TAU, sx: s, sy: 0.9, sz: s * 0.8, c: P.floor, e: 0, rim: 0.24, float: 0.15 });
      置く({ m: M.cone, x, y: cy - s * 0.5, z, ry: Math.PI, sx: s * 0.7, sy: -s, sz: s * 0.6, c: P.floorAlt, e: 0, rim: 0.2, float: 0.15 });
    } else {
      置く({ m: M.ring, x, y: base + 10 + rnd() * 16, z, ry: rnd() * TAU,
        sx: 2 + rnd() * 3, sy: 2 + rnd() * 3, sz: 0.4, c: P.gold, e: 0.2, rim: 0.4, float: 0.3 + rnd() * 0.4 });
    }
  },
  /* 遺跡 … 折れた 柱・門・崩れた 石 */
  ruins(置く, a) {
    const { x, y, z, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.45) {
      /* 折れた 柱（高さが ばらばら） */
      const hh = 2 + rnd() * 11;
      置く({ m: M.cyl, x, y: y + hh / 2, z, ry: 0, sx: 1.1 + rnd() * 0.6, sy: hh, sz: 1.1 + rnd() * 0.6,
        c: P.prop, e: 0, rim: 0.24 });
      if (rnd() < 0.5) {
        置く({ m: M.box, x, y: y + hh + 0.4, z, ry: rnd() * TAU, sx: 2.2, sy: 0.7, sz: 2.2, c: P.prop, e: 0, rim: 0.24 });
      }
    } else if (k < 0.7) {
      /* 崩れかけの 門 */
      const s = 4 + rnd() * 5;
      置く({ m: M.frame, x, y: y + s / 2, z, ry: (rnd() - 0.5) * 0.5, sx: s, sy: s, sz: 0.8, c: P.prop, e: 0, rim: 0.26 });
    } else {
      const s = 1.2 + rnd() * 2.8;
      置く({ m: M.box, x, y: y + s / 3, z, ry: rnd() * TAU, sx: s, sy: s * 0.5, sz: s * 1.2, c: P.floorAlt, e: 0, rim: 0.2 });
    }
  },
  /* 闘技場 … 観客席・旗・照明 */
  arena(置く, a) {
    const { x, y, z, base, side, rnd, P, M, TAU } = a;
    const k = rnd();
    if (k < 0.5) {
      /* 段になった 観客席 */
      for (let i = 0; i < 3; i++) {
        置く({ m: M.box, x: x + side * i * 2.2, y: y + 0.6 + i * 1.2, z, ry: 0,
          sx: 2.0, sy: 1.2, sz: 7 + rnd() * 5, c: i % 2 ? P.prop : P.floorAlt, e: 0, rim: 0.22 });
      }
    } else if (k < 0.8) {
      /* 旗 */
      const hh = 5 + rnd() * 7;
      置く({ m: M.post, x, y: y + hh / 2, z, ry: 0, sx: 0.28, sy: hh, sz: 0.28, c: P.metal, e: 0, rim: 0.3 });
      置く({ m: M.flag, x: x + side * 1.1, y: y + hh - 1.0, z, ry: side > 0 ? 0 : Math.PI,
        sx: 2.2, sy: 1.4, sz: 0.2, c: rnd() < 0.5 ? P.accent : P.gateFrame, e: 0.06, rim: 0.32 });
    } else {
      /* 照明（下向きの 円すい） */
      const hh = 9 + rnd() * 8;
      置く({ m: M.post, x, y: base + hh / 2, z, ry: 0, sx: 0.3, sy: hh, sz: 0.3, c: P.metal, e: 0, rim: 0.3 });
      置く({ m: M.cone, x, y: base + hh, z, ry: Math.PI, sx: 1.8, sy: -1.6, sz: 1.8, c: P.gold, e: 0.5, rim: 0.44 });
    }
  }
};

/** コースの 定義から 作る。 */
export function buildCourse(def) { return new Course(def).build(); }
