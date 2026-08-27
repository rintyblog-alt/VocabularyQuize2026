/* ══════════════════════════════════════════════════════════════════════════
   自分で 走る 人（ボット）。

   2 つの 役目:
     ① 1 人で 遊ぶ ときの 相手
     ② **30 コースが 本当に 越えられるかの 自動検査**（要件 36）

   ここが 賢くないと 検査の 意味が 無い。実際、最初の 版は
   30 本中 4 本しか 通せず、しかも 「コースが 悪い」のか
   「ボットが 下手」なのか 区別できなかった（2026-08-28）。

   いま 入れて ある 考え:
     ① **跳ぶ 前に 着地する 場所を 探す。** 無ければ 跳ばずに 待つ。
        （消える 板・落ちる 板・動く 板は 待てば 戻ってくる）
     ② **危ない ものが 通り過ぎるのを 待つ。**
        回る 棒・振り子・押す 壁・時間の 門 は 待てば 必ず 空く。
     ③ 熱い 床（動かない 危険）は **横へ よける。**
     ④ 進まなく なったら 下がって 入り直す。

   ★ 乱数は 種から。同じ 種なら 何度でも 同じ 走り。
   ══════════════════════════════════════════════════════════════════════════ */
import { TUNE, STEP } from "./player.js";
import { topOf, TOUCH, testSolid } from "./physics.js";
import { mulberry32, clamp } from "../engine/math.js";

export const BOT_LEVELS = {
  easy:    { look: 3.0, wobble: 1.30, speed: 0.80, mistake: 0.12, care: 0.55, wait: 0.5 },
  normal:  { look: 3.8, wobble: 0.80, speed: 0.90, mistake: 0.06, care: 0.80, wait: 0.8 },
  hard:    { look: 4.6, wobble: 0.40, speed: 0.97, mistake: 0.02, care: 0.95, wait: 1.0 },
  perfect: { look: 5.2, wobble: 0.00, speed: 1.00, mistake: 0.00, care: 1.00, wait: 1.0 }
};

/* 走り跳びで 届く 距離（vqsurviveplay.cjs の 実測 5.88m）。
   余裕を 見て 5.2m までを 狙う。 */
/* 走り跳びの 飛距離は 実測 5.88m（縁から）。
   探すのは **足元から** なので、乗っている 台の 半径ぶん 先まで 見る。
   届くかどうかは 下の 「要る速さ」で 別に 見るので、広く 探して よい。 */
const JUMP_REACH = 6.6;
const JUMP_UP = 1.7;        /* 跳んで 上がれる 段差 */
const PLAN_EVERY = 3;       /* 何 歩に 1 回 探し直すか */

export class Bot {
  constructor(player, course, opt) {
    opt = opt || {};
    this.p = player;
    this.course = course;
    this.level = BOT_LEVELS[opt.level] || BOT_LEVELS.normal;
    this.rnd = mulberry32(((opt.seed || 1) >>> 0) || 1);
    this.input = { mx: 0, mz: 0, jump: false, jumpDown: false, dive: false };
    this.wobblePhase = this.rnd() * 6.28;
    this.sideBias = (this.rnd() - 0.5) * 2;
    this.stuck = 0;
    this.lastProgress = -1;
    this.jumpHold = 0;
    this.waitFor = 0;          /* 待っている 残り 秒 */
    this.target = null;        /* {x,z,y} 狙っている 着地点 */
    this.backing = 0;
    this.runup = 0;
    this._near = [];
    this._tick = 0;
    this.reason = "";          /* いま 何を しているか（検査で 読む） */
  }

  /* その (x,z) の 足場の 高さ。fromY より 上がりすぎている ものは 見ない。 */
  ground(x, z, fromY) {
    const w = this.course.world;
    w.near(x, z, 2.2, this._near);
    let best = null;
    for (const s of this._near) {
      const top = topOf(s, x, z, TUNE.radius * 0.55);
      if (top === null) continue;
      if (top > fromY + JUMP_UP + 0.6) continue;   /* 高すぎて 乗れない */
      if (top < fromY - 14) continue;              /* 深すぎ */
      if (best === null || top > best) best = top;
    }
    return best;
  }

  /**
   * いま 進んでいる 先で、床の **真ん中**へ 寄る ための 横ずれを 返す。
   *
   * 細い 道（幅 1.4〜1.8m）は 中心線が くねっているので、
   * 中心線だけを 追うと 端から 落ちる。実際 c18 で 92 回 落ちた。
   */
  centering(dirx, dirz, dist) {
    const p = this.p;
    const rx = -dirz, rz = dirx;
    let 左 = 0, 右 = 0;
    for (let lat = 0.5; lat <= 2.5; lat += 0.5) {
      const gL = this.ground(p.x + dirx * dist - rx * lat, p.z + dirz * dist - rz * lat, p.y);
      if (gL !== null && Math.abs(gL - p.y) < 1.0) 左 = lat; else break;
    }
    for (let lat = 0.5; lat <= 2.5; lat += 0.5) {
      const gR = this.ground(p.x + dirx * dist + rx * lat, p.z + dirz * dist + rz * lat, p.y);
      if (gR !== null && Math.abs(gR - p.y) < 1.0) 右 = lat; else break;
    }
    /* ★ 広い 床では 何もしない。
       広い所で 寄せると まっすぐ 進まなく なり、
       全体の 通過率が 13→10 に 落ちた（2026-08-28 実測）。
       効かせるのは **どちらかの 端が 1.5m 以内**の ときだけ。 */
    if (左 >= 2.0 && 右 >= 2.0) return 0;
    return (右 - 左) * 0.5;
  }

  /**
   * その 向き dist 先が **壁で ふさがって いる**か。
   *
   * 床の 切れ目（edgeDistance）とは 別。回る 棒の 芯の 柱・
   * 押し出す 壁の 箱・門の 柱 などは 「床は ある が 通れない」。
   * これを 見ていなかったので、道の 真ん中に 立つ 柱の 前で
   * 永久に 足踏みしていた（c06 / c21 で 実測）。
   */
  blocked(dirx, dirz, dist) { return this.blockedTop(dirx, dirz, dist) !== null; }

  /**
   * ふさいでいる ものの **上面の 高さ**を 返す（無ければ null）。
   * 高さが 分かれば 「跳んで 乗る」か 「回り込む」かを 選べる。
   * これが 無かった ので、床から 1m の ローラーの 前で
   * 左右に よけ続けて 一歩も 進めなかった（c16 で 実測）。
   */
  blockedTop(dirx, dirz, dist) {
    const p = this.p, w = this.course.world;
    const px = p.x + dirx * dist, pz = p.z + dirz * dist;
    const cy = p.y + TUNE.radius + TUNE.half;
    w.near(px, pz, 2.6, this._near);
    let top = null;
    for (const s of this._near) {
      if (!s.enabled || !s.solid) continue;
      const t2 = topOf(s, px, pz, TUNE.radius);
      if (t2 !== null && t2 - p.y <= TUNE.stepUp) continue;   /* 段は 自動で 上る */
      if (!testSolid(s, px, cy, pz, TUNE.radius + 0.12, TUNE.half)) continue;
      const h = (t2 === null) ? 1e9 : t2;
      if (top === null || h > top) top = h;
    }
    return top;
  }

  /** ふさがって いたら 左右へ 振って 空いている 向きを 返す。無ければ null。 */
  steerAround(dirx, dirz) {
    const 距離 = 1.7;
    if (!this.blocked(dirx, dirz, 距離)) return null;
    const 角 = [0.34, -0.34, 0.68, -0.68, 1.05, -1.05, 1.45, -1.45];
    /* 前に 選んだ 向きを 少し ひいきする（左右に 迷って 止まらない ため） */
    if (this._steerSign) 角.sort((a, b) => (Math.sign(a) === this._steerSign ? -1 : 1) - (Math.sign(b) === this._steerSign ? -1 : 1));
    for (const a of 角) {
      const c = Math.cos(a), s2 = Math.sin(a);
      const nx = dirx * c - dirz * s2, nz = dirx * s2 + dirz * c;
      if (!this.blocked(nx, nz, 距離)) {
        this._steerSign = Math.sign(a) || 1;
        return { x: nx, z: nz };
      }
    }
    return null;
  }

  /** 目の前の 危険が **跳べば 越えられる 高さ**か。越えられるなら 上面を 返す。 */
  lowThreatTop(dirx, dirz) {
    const p = this.p, w = this.course.world;
    const px = p.x + dirx * 2.0, pz = p.z + dirz * 2.0;
    w.near(px, pz, 3.0, this._near);
    let top = null;
    for (const s of this._near) {
      if (!s.enabled || s.touch !== TOUCH.PUSH) continue;
      const t2 = topOf(s, px, pz, TUNE.radius + 0.4);
      if (t2 === null) continue;
      if (t2 - p.y > 1.55) return null;   /* 高すぎる。跳んでも 当たる */
      if (top === null || t2 > top) top = t2;
    }
    return top;
  }

  /** そこが 危ない（触ると 戻される）か */
  deadlyAt(x, z, y) {
    const w = this.course.world;
    w.near(x, z, 2.2, this._near);
    for (const s of this._near) {
      if (!s.enabled || s.touch !== TOUCH.DEADLY) continue;
      const top = topOf(s, x, z, TUNE.radius * 0.6, true);
      if (top !== null && Math.abs(top - y) < 2.4) return true;
    }
    return false;
  }

  /**
   * 危ない ものに ぶつからずに 進めるか。
   *
   * ★ 「いま そこに 棒が あるか」で 見ては いけない。
   *   棒は 回っている。近づくと 見え、離れると 消えるので
   *   **その場で 前後に 揺れるだけ**に なる（実際 そうなった。
   *   c01 で 40 秒 以上 同じ 所を 行ったり来たり していた）。
   *
   *   仕掛けは 全部 「通し時間 t の 関数」なので、
   *   **着く ころの 時刻へ 進めて 当たりを 見る**ことが できる。
   *   見たあとは 必ず 元の 時刻へ 戻す。
   */
  threatAhead(dirx, dirz, tNow) {
    const p = this.p, C = this.course;
    const cy = p.y + TUNE.radius + TUNE.half;
    /* 見る 相手を 絞る（近くの 動く 危険だけ） */
    const cand = [];
    for (const o of C.obstacles) {
      if (o.kind !== "spinner" && o.kind !== "hammer" && o.kind !== "pushwall"
          && o.kind !== "timedgate" && o.kind !== "roller") continue;
      const d2 = (o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z);
      if (d2 > 18 * 18) continue;
      cand.push(o);
    }
    if (!cand.length) return false;

    /* ★ 見るのは **すぐ 目の前だけ**（1.2〜3.2m）。
       6m 先まで 見ると、7m 先に ある 回る 棒の せいで
       いつまでも 近づけない（実際 c01 で 一歩も 進めなかった）。
       止まるのに 要る 距離は 8.2m/s から 約 1.1m。3.2m 見れば 足りる。 */
    const v = clamp(p.speed + 2.0, 4.0, TUNE.maxSpeed);
    let 当たる = false;
    for (let d = 1.2; d <= 3.2 && !当たる; d += 0.5) {
      const tau = d / v;
      const px = p.x + dirx * d, pz = p.z + dirz * d;
      for (const o of cand) {
        o.update(tNow + tau);
        for (const s of o.solids) {
          if (!s.enabled) continue;
          const 危険 = (s.touch === TOUCH.PUSH) || (o.kind === "timedgate" && s.solid);
          if (!危険) continue;
          if (testSolid(s, px, cy, pz, TUNE.radius + 0.30, TUNE.half + 0.10)) { 当たる = true; break; }
        }
        if (当たる) break;
      }
    }
    /* 必ず 元へ 戻す。戻さないと 当たり判定が ずれる。 */
    for (const o of cand) o.update(tNow);
    return 当たる;
  }

  /**
   * 前の 縁までの 距離。床が 続いている 間は 大きな 値を 返す。
   *
   * ★ これが 無いと 「4m 先に 床が 無い」と 分かった 瞬間に 跳んで しまい、
   *   **縁の 4m 手前から 跳ぶ**ことに なる。実際 それで 4.2m の 隙間を
   *   11m/s で 跳んで 0.1m 足りずに 落ちていた（2026-08-28 実測）。
   */
  edgeDistance(dirx, dirz, maxD) {
    const p = this.p;
    const lim = maxD || 6.5;
    for (let d = 0.4; d <= lim; d += 0.3) {
      const g = this.ground(p.x + dirx * d, p.z + dirz * d, p.y);
      if (g === null || g < p.y - 0.9) return d;
      if (this.deadlyAt(p.x + dirx * d, p.z + dirz * d, g)) return d;
    }
    return 1e9;
  }

  /** 近くの 「時間で 動く 仕掛け」を 集める。落ちる 板は 除く（時間の 関数では ない）。 */
  _movers() {
    const p = this.p, C = this.course;
    const out = [];
    for (const o of C.obstacles) {
      if (!o.moving) continue;
      if (o.kind === "faller") continue;     /* 状態を 持つので 進めては いけない */
      const dx = o.x - p.x, dz = o.z - p.z;
      if (dx * dx + dz * dz > 26 * 26) continue;
      out.push(o);
    }
    return out;
  }

  /**
   * 前に 進める 着地点を 探す。無ければ null。
   *
   * ★ **着く ころの 姿**で 探す。
   *   消える 板・動く 板は 「いま ある」ことに 意味が ない。
   *   跳んでいる 0.5 秒の 間に 消える 板を 狙うと 必ず 落ちる。
   */
  findLanding(dirx, dirz, prog, tNow, 縁まで) {
    const p = this.p, C = this.course;
    /* ★ **いま 立っている 台の 上**は 候補に しない。
       前は 自分の 足場の 前の へりを 「行き先」に 選び、
       そこまで 走って そのまま 落ちていた（c07 の とび石で 実測）。
       縁より 手前は 跳ぶ 意味が 無い。 */
    const 最短 = (縁まで !== undefined && 縁まで < 1e8) ? Math.max(1.2, 縁まで + 0.6) : 1.2;
    const rx = -dirz, rz = dirx;     /* 右向き */
    let best = null, bestScore = -1e9;
    const movers = (tNow !== undefined) ? this._movers() : [];
    const v = clamp(p.speed + 2.0, 5.0, TUNE.maxSpeed);
    for (let d = 最短; d <= JUMP_REACH; d += 0.5) {
      if (movers.length) {
        /* 跳んで 着くまでの 見込み時間 */
        const tau = d / v + 0.18;
        for (const o of movers) o.update(tNow + tau);
      }
      for (let k = 0; k < 11; k++) {
        const lat = [0, 1.2, -1.2, 2.4, -2.4, 3.6, -3.6, 4.8, -4.8, 6.0, -6.0][k];
        const x = p.x + dirx * d + rx * lat;
        const z = p.z + dirz * d + rz * lat;
        const g = this.ground(x, z, p.y);
        if (g === null) continue;
        if (g - p.y > JUMP_UP) continue;
        if (this.deadlyAt(x, z, g)) continue;
        const np = C.progressOf(x, z);
        /* ★ 横へ よけるだけの 一歩も 認める。
           熱い 床が 道を ふさぐ コース（c19）では、
           「前へ 1.2m 以上 進む 所」だけに 絞ると 逃げ道が 消える。 */
        if (np <= prog + 0.8) continue;
        /* ★ **一番 近い** 着地点を 選ぶ。
           「前へ 進む ほど 良い」に すると、手前の 石を 飛び越して
           その 先の 石を 狙い、間の 谷に 落ちる（実際 c07 で そうなった）。
           遠い ほど 大きく 減点する。 */
        const score = -d * 2.2 - Math.abs(lat) * 0.45 - Math.max(0, g - p.y) * 0.8
                      + Math.min(3, (np - prog)) * 0.5;
        if (score > bestScore) { bestScore = score; best = { x, z, y: g, d, lat, gain: np - prog }; }
      }
    }
    /* 必ず 元の 時刻へ 戻す。戻さないと 当たり判定が ずれる。 */
    if (movers.length) for (const o of movers) o.update(tNow);
    return best;
  }

  decide(t) {
    const p = this.p, L = this.level, C = this.course;
    const inp = this.input;
    inp.jump = false; inp.dive = false;
    this._tick++;

    if (p.finished) { inp.mx = 0; inp.mz = 0; inp.jumpDown = false; this.reason = "ゴール"; return inp; }

    const prog = C.progressOf(p.x, p.z);
    const ahead = C.pointAt(prog + L.look + p.speed * 0.30);
    let tx = ahead.x - p.x, tz = ahead.z - p.z;
    const len0 = Math.hypot(tx, tz) || 1;
    let dirx = tx / len0, dirz = tz / len0;

    /* ── 進まなく なったか ──────────────────────────────────────
       ★ **自分で 止まっている ぶんは 数えない。**
         時間の 門が 開くのを 待つ・棒が 通り過ぎるのを 待つ、は
         正しい ふるまい。ここを 数えると 「詰まり回復」が 割り込んで
         横へ 逃げたり 跳んだりし、待てなく なる。
         実際 c15（時計仕掛けの門）が これで 通れなく なっていた。 */
    const 自分で止まっている = (this.reason === "待つ" || this.reason === "危ない"
      || this.reason === "減速" || this.reason === "助走" || this.reason === "行き先なし");
    if (自分で止まっている) this.stuck = 0;
    else if (this.lastProgress >= 0 && Math.abs(prog - this.lastProgress) < 0.015) this.stuck += STEP;
    else this.stuck = 0;
    this.lastProgress = prog;

    /* ── 空の 上に いる ── */
    if (!p.grounded) {
      const aim = this.target;
      if (aim) {
        const ax = aim.x - p.x, az = aim.z - p.z;
        const al = Math.hypot(ax, az) || 1;
        /* 狙いを 通り過ぎそうなら 空中でも 逆へ 入れて 減らす */
        const 近づく = (p.vx * ax + p.vz * az) / al;
        if (al < 1.2 && 近づく > 3.5) { inp.mx = -(ax / al) * 0.8; inp.mz = -(az / al) * 0.8; }
        else { inp.mx = (ax / al) * L.speed; inp.mz = (az / al) * L.speed; }
      } else {
        inp.mx = dirx * L.speed; inp.mz = dirz * L.speed;
      }
      inp.jumpDown = this.jumpHold > 0;
      if (this.jumpHold > 0) this.jumpHold--;
      this.reason = "空中";
      return inp;
    }

    this.target = null;

    /* ── 危ない ものが 通り過ぎるのを 待つ ── */
    /* ── 危ない ものを 待つ／跳んで 越す ────────────────────────────
       ★ 「跳んで 越す」は **この 分岐の 中**で 判断する。
         前は 下の ほうに 書いていたが、待ちの 分岐が先に return するので
         **一度も 実行されて いなかった**（c06 で 60 秒 待ち続けた）。 */
    const 危ない = (this.waitFor > 0) || (L.care > 0.3 && this.threatAhead(dirx, dirz, t));
    if (危ない) {
      if (this.waitFor > 0) this.waitFor -= STEP;
      else this.waitFor = 0.10 * L.wait;
      this.waitTotal = (this.waitTotal || 0) + STEP;
      /* 低い 棒なら 跳んで 越す（跳びの 高さ 2.0m > 棒の 上 1.22m）。
         3 本 腕の 速い 棒は 待っても なかなか 空かない。 */
      if (p.grounded && this.waitTotal > 0.40 && this.lowThreatTop(dirx, dirz) !== null) {
        inp.jump = true; this.jumpHold = 16; inp.jumpDown = true;
        inp.mx = dirx * L.speed; inp.mz = dirz * L.speed;
        this.waitFor = 0; this.waitTotal = 0;
        this.reason = "跳んで越す";
        return inp;
      }
      /* ずっと 空かない なら 横へ ずれて 見る（腕の 短い 所を 狙う） */
      if (this.waitTotal > 2.4) {
        const rx2 = -dirz, rz2 = dirx;
        const sgn = this.sideBias >= 0 ? 1 : -1;
        inp.mx = rx2 * sgn * 0.8; inp.mz = rz2 * sgn * 0.8;
        if (this.waitTotal > 4.0) { this.sideBias = -this.sideBias; this.waitTotal = 2.0; }
        this.reason = "横へ";
        return inp;
      }
      inp.mx = 0; inp.mz = 0;
      inp.jumpDown = false;
      this.reason = "待つ";
      return inp;
    }
    this.waitTotal = 0;

    /* ── 前に 床が **切れ目なく** 続いているか ──────────────────────
       ★ 1 点だけ 見ては いけない。4m 先に とび石が あると
         「床が ある」と 見えて、その 手前の 隙間に そのまま 落ちる。
         実際 c07（とび石）で 78 回 落ちていた（2026-08-28 実測）。
         **縁までの 距離**を 測って、止まれる 余裕が あるかで 決める。 */
    /* ★ 滑る 床（氷）では 止まるのに 何倍も かかる。
       ふつうの 摩擦 32 に 対して 氷は 0.06×32 ≒ 2。
       同じ 距離で 判断すると 必ず 落ちる。 */
    const 滑り = (p.groundFriction === undefined || p.groundFriction >= 1) ? 1
      : clamp(1 / Math.max(0.05, p.groundFriction), 1, 7);
    const 止まれる距離 = (1.1 + p.speed * 0.17) * 滑り;
    const 縁まで = this.edgeDistance(dirx, dirz, 7.0);

    if (縁まで > 止まれる距離) {
      /* ふつうに 走れる。ただし **床の 真ん中へ 寄せる**。 */
      this.wobblePhase += STEP * 1.3;
      const wob = Math.sin(this.wobblePhase) * L.wobble * Math.min(2.6, ahead.w * 0.20);
      const rx = -dirz, rz = dirx;
      const 寄せ = (this._tick % 2 === 0)
        ? (this._center = this.centering(dirx, dirz, Math.min(3.0, 1.4 + p.speed * 0.16)))
        : (this._center || 0);
      const c2 = clamp(寄せ * 0.55, -0.9, 0.9);
      let ax = dirx + rx * (wob * 0.16 * this.sideBias + c2);
      let az = dirz + rz * (wob * 0.16 * this.sideBias + c2);
      /* 前を ふさぐ ものが あるか（2 コマに 1 回 見る） */
      if (this._tick % 2 === 1) {
        this._blockTop = this.blockedTop(dirx, dirz, 1.7);
        this._steer = (this._blockTop !== null) ? this.steerAround(dirx, dirz) : null;
      }
      inp.jumpDown = false;
      if (this._blockTop !== null && this._blockTop - p.y <= 1.65) {
        /* 跳べば 乗れる 高さ（跳びの 高さ 2.0m）。まっすぐ 行って 跳ぶ。 */
        if (p.grounded) { inp.jump = true; this.jumpHold = 16; inp.jumpDown = true; }
        ax = dirx; az = dirz;
        this.reason = "乗り越す";
      } else if (this._steer) {
        ax = this._steer.x; az = this._steer.z; this.reason = "よける";
      } else {
        this.reason = "走る";
      }
      inp.mx = ax * L.speed;
      inp.mz = az * L.speed;
      this.noWay = 0;
    } else {
      /* 跳ぶ／よける／待つ */
      {
        const gs0 = p.groundSolid, go0 = gs0 && gs0.owner;
        this._urgent = !!(go0 && (go0.kind === "faller" || go0.kind === "blinker"));
      }
      const landing = (this._tick % PLAN_EVERY === 0 || !this._lastLanding)
        ? this.findLanding(dirx, dirz, prog, t, 縁まで) : this._lastLanding;
      this._lastLanding = landing;
      if (landing) {
        this.target = landing;
        const ax = landing.x - p.x, az = landing.z - p.z;
        const al = Math.hypot(ax, az) || 1;
        const ux = ax / al, uz = az / al;
        inp.mx = ux * L.speed;
        inp.mz = uz * L.speed;

        /* 縁までの 距離を **細かく** 測る（跳ぶ 場所を 決めるため） */
        const 縁 = this.edgeDistance(ux, uz, Math.min(6.5, al + 0.6));
        const 縁から着地まで = Math.max(0, al - Math.min(縁, al));
        /* 滞空 0.70 秒（実測）。余裕を 見て 0.66 で 割る。
           上へ 上がる ぶんは 滞空が 減るので さらに 割り引く。 */
        const 上り = Math.max(0, landing.y - p.y);
        const 滞空 = 0.66 - 上り * 0.11;
        const 要る速さ = 縁から着地まで <= 1.2 ? 0 : (縁から着地まで / Math.max(0.24, 滞空));
        const 足りる = p.speed >= 要る速さ * 0.96;
        /* 跳ぶのは **縁の すぐ 手前**。1 コマ ぶんの 余裕。 */
        const 跳ぶ距離 = 0.5 + p.speed * 0.055;

        /* ★ いま 立っている 足場が **崩れる／消える** なら 減速しない。
           落ちる 板は 0.36 秒で 落ちる。止まって 狙いを 定めている 間に
           足元が 無くなる（c22 で 159 回 落ちた）。 */
        const gs = p.groundSolid, go = gs && gs.owner;
        /* ★ 「小さい 足場も 急ぐ」も 試したが、動く 板の 上でも 減速しなく なり
           行き過ぎて 落ちる ように なった（通過 18→17）。崩れる ものだけに 絞る。 */
        const 急ぐ = !!(go && (go.kind === "faller" || go.kind === "blinker"));

        /* ★ 速すぎても 落ちる。狙いを 飛び越して しまう。
           必要な 速さの 1.3 倍を 超えていたら **手を 離して 減速**する
           （摩擦 32m/s² なので すぐ 落ちる）。 */
        const 速すぎ = !急ぐ && 要る速さ > 0 && p.speed > 要る速さ * 1.30 && 縁 > 0.7;
        if (速すぎ) {
          inp.mx = 0; inp.mz = 0;
          inp.jumpDown = false;
          this.reason = "減速";
          return inp;
        }

        if ((縁 <= 跳ぶ距離 || (急ぐ && 縁 <= 跳ぶ距離 + 0.8)) && 足りる) {
          inp.jump = true;
          /* 押し続ける 長さで 高さが 決まる。近いほど 短く。 */
          this.jumpHold = Math.round(clamp(縁から着地まで * 2.8 + 上り * 6, 4, 16));
          this.runup = 0;
          this.reason = "跳ぶ";
        } else if (縁 <= 跳ぶ距離 && !足りる) {
          /* 速さが 足りない。下がって 走り直す。 */
          if (this.runup <= 0) this.runup = 0.55;
          this.reason = "助走";
        } else if (this.runup > 0) {
          this.runup -= STEP;
          inp.mx = -ux * 0.95; inp.mz = -uz * 0.95;
          this.reason = "助走";
        } else {
          this.reason = "縁へ";
        }
        inp.jumpDown = this.jumpHold > 0;
        if (this.jumpHold > 0) this.jumpHold--;
      } else if (this._urgent) {
        /* ★ いま 立っている 板が **消える／落ちる**のに 行き先が 無い。
           待っても 足元が 無くなる だけ なので、
           **少し あとの 時刻**で もう一度 探して、あれば 跳ぶ。
           それでも 無ければ 中心線の 先へ 跳ぶ（何も しないより まし）。 */
        let 逃げ = null;
        for (const 先 of [0.35, 0.7, 1.1]) {
          逃げ = this.findLanding(dirx, dirz, prog, t + 先, 縁まで);
          if (逃げ) break;
        }
        const ax = 逃げ ? (逃げ.x - p.x) : dirx * 4;
        const az = 逃げ ? (逃げ.z - p.z) : dirz * 4;
        const al = Math.hypot(ax, az) || 1;
        inp.mx = (ax / al) * L.speed; inp.mz = (az / al) * L.speed;
        if (p.grounded) { inp.jump = true; this.jumpHold = 16; }
        inp.jumpDown = this.jumpHold > 0;
        if (this.jumpHold > 0) this.jumpHold--;
        this.reason = 逃げ ? "先を読んで跳ぶ" : "とにかく跳ぶ";
      } else {
        /* 行き先が 無い。**跳ばない。** 待てば 板が 戻ってくる。
           ただし ずっと 戻ってこない ことも あるので、
           長引いたら 少し 下がって 別の 角度から 見る。 */
        this.noWay = (this.noWay || 0) + STEP;
        if (this.noWay > 3.0) {
          inp.mx = -dirx * 0.9; inp.mz = -dirz * 0.9;
          if (this.noWay > 4.2) { this.noWay = 0; this.sideBias = -this.sideBias; }
        } else {
          inp.mx = -dirx * 0.20; inp.mz = -dirz * 0.20;
        }
        inp.jumpDown = false;
        this.reason = "行き先なし";
      }
    }

    /* ── 詰まりの 立て直し ── */
    if (this.stuck > 1.1) {
      const rx = -dirz, rz = dirx;
      const s = this.sideBias >= 0 ? 1 : -1;
      inp.mx = rx * s * 0.95 + dirx * 0.35;
      inp.mz = rz * s * 0.95 + dirz * 0.35;
      if (this.stuck > 1.6) { inp.jump = true; this.jumpHold = 14; inp.jumpDown = true; }
      if (this.stuck > 2.6) { this.sideBias = -this.sideBias; this.stuck = 0.6; }
      this.reason = "詰まり回復";
    }

    /* ── たまに しくじる ── */
    if (L.mistake > 0 && this.rnd() < L.mistake * STEP * 4) { inp.mx *= 0.2; inp.mz *= 0.2; }
    return inp;
  }
}
