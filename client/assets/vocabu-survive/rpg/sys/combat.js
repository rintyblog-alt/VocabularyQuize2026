/* ══════════════════════════════════════════════════════════════════════════
   敵と 戦い。

   ★ 敵は **区画に 湧く**。世界の どこにでも 湧かせると 数が 増え続けて 落ちる。
     近い 区画に だけ、上限を 決めて 湧かせる。
   ★ 遠ざかったら 消す。倒した ことは 覚えない（また 湧く）。
     ただし **主（ボス）は 覚える**（一度 倒したら もう 出ない）。
   ★ 語彙と 結ぶ: 言葉に 答えると「ことばの力」が 溜まり、強い 一撃が 出せる。
     これが VocabuQuiz の 中の RPG である 理由。
   ══════════════════════════════════════════════════════════════════════════ */
import { ENEMIES, 選ぶ } from "../data/enemies.js";
import { hash2 } from "../world/noise.js";
import { SEA } from "../world/terrain.js";

let SEQ = 0;

export class Enemy {
  constructor(def, x, y, z) {
    this.id = ++SEQ;
    this.def = def;
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.yaw = 0;
    this.state = "wander";     /* wander | chase | attack | hurt | die */
    this.t = 0;
    this.cool = 0;
    this.hurt = 0;
    this.home = [x, z];
    this.bob = Math.random() * 6.28;
    this.dead = false;
    this.fade = 0;
  }
}

export class Combat {
  constructor(o) {
    this.terr = o.terrain;
    this.seed = o.seed | 0;
    this.settings = o.settings || {};
    this.inv = o.inventory;
    this.onDrop = o.onDrop || function () {};
    this.onHitPlayer = o.onHitPlayer || function () {};
    this.onKill = o.onKill || function () {};
    /** 生きて いる 敵 */
    this.list = [];
    /** 倒した 相手の 数（物語の 終わりに 出す） */
    this.倒した = 0;
    /** 倒した 主 */
    this.倒した主 = new Set();
    this.上限 = (this.settings.tier === "low") ? 10 : (this.settings.tier === "medium" ? 16 : 24);
    this.湧き = 0;
    /* ★ 夜の 強さ（2026-09-02）。0＝昼 1＝真夜中。
       画面から 毎コマ 入れる。夜は **数も 強さも 上がる**。
       これが 無いと 昼と 夜が 見た目だけの 違いに なり、
       たき火を 建てる 理由も 宿に 泊まる 理由も 生まれない。 */
    this.夜 = 0;
    /** 洞窟の 中に いるか（中では 外の 区画に 湧かせない） */
    this.洞 = null;
    /* ことばの力（言葉に 答えると 溜まる） */
    this.力 = 0;
    this.力max = 100;
    /* 打たれた 相手を 後ろへ 押す（見た目の 手ごたえ） */
    this._押す = (e, 与) => {
      const k = Math.min(1.6, 0.25 + 与 * 0.02);
      e.pos[0] -= Math.sin(e.yaw) * k;
      e.pos[2] -= Math.cos(e.yaw) * k;
    };
    this.exp = 0;
    this.lv = 1;
  }

  /** 経験から 段位を 出す */
  _lvOf(exp) { return 1 + Math.floor(Math.pow(Math.max(0, exp) / 26, 0.62)); }

  加経(n) {
    this.exp += Math.max(0, n | 0);
    const lv = this._lvOf(this.exp);
    const 上 = lv > this.lv;
    this.lv = lv;
    return 上;
  }

  /** 言葉に 答えた ときに 呼ぶ。 */
  ことば(正しい) {
    if (正しい) this.力 = Math.min(this.力max, this.力 + 26);
    else this.力 = Math.max(0, this.力 - 8);
    return this.力;
  }

  update(dt, chunks, player, now) {
    this.湧き -= dt;
    if (this.湧き <= 0) {
      /* 夜は 早く 湧く（1.2 秒 → 0.55 秒）*/
      this.湧き = 1.2 - this.夜 * 0.65;
      if (this.洞) this._洞に湧く(player); else this._spawn(chunks, player);
    }
    const P = player.pos;
    /* ★ 巡回の 途中で 並びが **空に なる**ことが ある（2026-09-02・実測）。
       _think → onHitPlayer → 倒れる → `combat.list.length = 0`。
       後ろから 回して いても、消えた ぶんの i は そのまま 残るので
       `this.list[i]` が undefined に なり、tick ごと 落ちる。
       **死ぬ たびに 落ちる**ので 遊びに ならない（ソークで 2 回 出た）。
       いま 見て いる 相手が 消えたら、その コマは そこで やめる。 */
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e) break;
      if (e.dead) {
        e.fade += dt * 2.2;
        if (e.fade >= 1) this.list.splice(i, 1);
        continue;
      }
      /* 遠すぎたら 消す */
      const dx = e.pos[0] - P[0], dz = e.pos[2] - P[2];
      const d = Math.hypot(dx, dz);
      if (d > 120) { this.list.splice(i, 1); continue; }
      this._think(e, dt, player, d, dx, dz, now);
    }
  }

  _think(e, dt, player, d, dx, dz, now) {
    const D = e.def;
    e.t += dt;
    e.cool = Math.max(0, e.cool - dt);
    e.hurt = Math.max(0, e.hurt - dt);
    e.bob += dt * (2.6 + D.速 * 0.3);

    if (d < D.視) e.state = d < D.間 + 0.8 ? "attack" : "chase";
    else if (e.state !== "wander" && d > D.視 * 1.5) e.state = "wander";

    let mx = 0, mz = 0;
    if (e.state === "chase") { mx = -dx / (d || 1); mz = -dz / (d || 1); }
    else if (e.state === "wander") {
      const a = Math.sin(e.t * 0.4 + e.id) * 3.1;
      mx = Math.cos(a) * 0.4; mz = Math.sin(a) * 0.4;
      /* 生まれた ところから 離れすぎない */
      const hx = e.home[0] - e.pos[0], hz = e.home[1] - e.pos[2];
      const hd = Math.hypot(hx, hz);
      if (hd > 18) { mx = hx / hd; mz = hz / hd; }
    } else if (e.state === "attack") {
      /* ★ **振りかぶる 間**を 置く（2026-09-02）。
         いきなり 当たると 避けようが 無く、遊びに ならない。
         0.45 秒 前から 体が 沈む（見た目は mobs.js の e.振り）。 */
      if (e.cool <= 0 && !e.振り) { e.振り = 0.45; }
      if (e.振り > 0) {
        e.振り -= dt;
        if (e.振り <= 0) {
          e.振り = 0;
          e.cool = 1.5 / Math.max(0.4, D.速 * 0.3 + 0.7);
          /* 離れて いれば 当たらない（避けられる） */
          if (d < D.間 + 1.2) this.onHitPlayer(D.攻 * (e.攻増 || 1), D);
          else this.onMiss && this.onMiss(e);
        }
      }
    } else if (e.振り) e.振り = 0;

    const sp = D.速 * (e.state === "chase" ? 1 : 0.42) * (e.hurt > 0 ? 0.4 : 1);
    e.pos[0] += mx * sp * dt;
    e.pos[2] += mz * sp * dt;
    if (mx || mz) e.yaw = Math.atan2(mx, mz);
    /* 地面に 貼りつく */
    const g = this.terr.height(e.pos[0], e.pos[2]);
    e.pos[1] = Math.max(g, SEA - 0.6);
  }

  /** いまの 上限（夜は 5 割 増し）。 */
  get いまの上限() { return Math.round(this.上限 * (1 + this.夜 * 0.5)); }

  /* ══ 洞窟の 中に 湧かす（2026-09-02）══════════════════════════════
     ほらあなに 何も 出ないと「暗い 倉庫」に なる。
     ★ 部屋の 中にだけ 出す。通路に 出すと 逃げ道が 無い。
     ★ 外より 一段 強い ものを 選ぶ（潜る 値打ちを 作る）。 */
  _洞に湧く(player) {
    const 洞 = this.洞;
    if (!洞 || this.list.length >= Math.min(8, this.いまの上限)) return;
    const P = player.pos;
    const 部 = 洞.部屋[1 + Math.floor(Math.random() * Math.max(1, 洞.部屋.length - 1))];
    if (!部) return;
    const x = 洞.入.x + 部.x + (Math.random() - 0.5) * 部.半 * 1.2;
    const z = 洞.入.z + 部.z + (Math.random() - 0.5) * 部.半 * 1.2;
    if (Math.hypot(x - P[0], z - P[2]) < 12) return;      /* 目の前に 出さない */
    const B = { 出る: 洞.出る || [], 強さ: (洞.強さ || 2) + 1 };
    const id = 選ぶ(B, Math.random());
    const D = ENEMIES[id];
    if (!D) return;
    if (D.主 && this.倒した主.has(id)) return;
    const e = new Enemy(D, x, this.terr.height(x, z), z);
    e.洞 = true;
    this.list.push(e);
  }

  _spawn(chunks, player) {
    if (this.list.length >= this.いまの上限) return;
    const P = player.pos;
    /* 近い 区画から 1 つ 選んで、その 中の どこかへ */
    const 候補 = [];
    for (const c of chunks.live.values()) {
      const dx = c.center[0] - P[0], dz = c.center[2] - P[2];
      const d = Math.hypot(dx, dz);
      if (d > 26 && d < 96) 候補.push(c);
    }
    if (!候補.length) return;
    const c = 候補[Math.floor(Math.random() * 候補.length)];
    const x = c.center[0] + (Math.random() - 0.5) * 56;
    const z = c.center[2] + (Math.random() - 0.5) * 56;
    const t = this.terr.at(x, z);
    if (t.water) return;
    const id = 選ぶ(t.B, Math.random());
    const D = ENEMIES[id];
    if (!D) return;
    if (D.主 && this.倒した主.has(id)) return;
    const e = new Enemy(D, x, t.h, z);
    /* 夜の 個体は 硬くて 強い。見た目も mobs.js で 変える。 */
    if (this.夜 > 0.5) {
      e.夜 = true;
      e.maxHp = e.hp = Math.round(e.hp * (1 + this.夜 * 0.6));
      e.攻増 = 1 + this.夜 * 0.5;
    }
    this.list.push(e);
  }

  /** 主を そこへ 出す（物語から 呼ぶ） */
  主を出す(id, x, z) {
    const D = ENEMIES[id];
    if (!D || this.倒した主.has(id)) return null;
    if (this.list.some((e) => e.def === D)) return null;
    const e = new Enemy(D, x, this.terr.height(x, z), z);
    this.list.push(e);
    return e;
  }

  /** いちばん 近い 敵（間合いの 中） */
  近くの(px, pz, 間) {
    let best = null, bd = 間 * 間;
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.pos[0] - px, dz = e.pos[2] - pz;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 斬る。戻り: {当:bool, 与:number, 倒:bool} */
  攻める(e, 攻, 力を使う) {
    if (!e || e.dead) return { 当: false, 与: 0, 倒: false };
    let 与 = Math.max(1, 攻 - e.def.守 * 0.6);
    if (力を使う && this.力 >= 40) {
      /* ことばの 力を 使うと 守りを 抜く */
      与 = 攻 * 2.2;
      this.力 = Math.max(0, this.力 - 40);
    }
    与 = Math.round(与 * (0.9 + Math.random() * 0.25));
    e.hp -= 与;
    e.hurt = 0.32;
    e.振り = 0;
    e.state = "chase";
    /* ★ 打つと 少し 下がる（手ごたえ）。当たった 感じが 出る。 */
    if (this._押す) this._押す(e, 与);
    if (e.hp <= 0) {
      e.dead = true;
      this.倒した++;
      const 落 = this._落とす(e.def);
      const 上 = this.加経(e.def.経);
      if (e.def.主) {
        const k = Object.keys(ENEMIES).find((x) => ENEMIES[x] === e.def);
        if (k) this.倒した主.add(k);
      }
      this.onKill(e, 落, 上);
      return { 当: true, 与, 倒: true, 落, 上 };
    }
    return { 当: true, 与, 倒: false };
  }

  _落とす(D) {
    const out = [];
    for (const id in D.落) {
      const [a, b] = D.落[id];
      const n = a + Math.floor(Math.random() * (b - a + 1));
      if (n <= 0) continue;
      const 余 = this.inv.add(id, n);
      out.push([id, n - 余]);
      this.onDrop(id, n - 余);
    }
    return out;
  }

  toJSON() { return { 倒した主: Array.from(this.倒した主), exp: this.exp, lv: this.lv, 倒した: this.倒した }; }
  load(j) {
    if (!j) return;
    if (Array.isArray(j.倒した主)) this.倒した主 = new Set(j.倒した主);
    this.exp = j.exp | 0;
    this.倒した = j.倒した | 0;
    this.lv = this._lvOf(this.exp);
  }
}
