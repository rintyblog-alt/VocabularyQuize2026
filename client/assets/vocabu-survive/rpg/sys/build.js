/* ══════════════════════════════════════════════════════════════════════════
   建てる。置く・壊す・覚える。

   ★ 置き場所は **格子**（1 マス = 2）。自由に 置けると 家に ならない。
   ★ 建てた ものは **区画ごと**に しまう。歩いて 離れても 消えない。
   ★ 数に 上限（1 区画 400 個）。無いと 遊びで 埋め尽くして 落ちる。
   ★ 置いた ものは **静的バッチ**で 描く（毎フレーム 送り直さない）。
   ══════════════════════════════════════════════════════════════════════════ */
import { ITEM, 建材の型 } from "../data/items.js";
import { CK, CK_W } from "../world/chunk.js";
import { TILE } from "../world/terrain.js";

export const 格子 = 2;
/** 型 id → 人が 読む 名前（「かべ あと 12」の ように 出す） */
export function 型名(t) {
  const k = 建材の型.find((x) => x.id === t);
  return k ? k.名 : t;
}
const 上限 = 400;

export function 格子へ(v) { return Math.round(v / 格子) * 格子; }
export function 建物key(x, y, z) { return 格子へ(x) + "," + Math.round(y * 2) / 2 + "," + 格子へ(z); }

export class Build {
  constructor(o) {
    this.terr = o.terrain;
    this.inv = o.inventory;
    /** 区画key → Map(建物key → {id,x,y,z,yaw}) */
    this.区 = new Map();
    this.dirty = new Set();
    this.onChange = o.onChange || function () {};
  }

  区key(x, z) { return Math.floor(x / CK_W) + "," + Math.floor(z / CK_W); }

  /** そこに 何か あるか */
  at(x, y, z) {
    const m = this.区.get(this.区key(x, z));
    return m ? (m.get(建物key(x, y, z)) || null) : null;
  }

  /** 置ける か（重なり・数・地面） */
  置ける(itemId, x, y, z) {
    const it = ITEM[itemId];
    if (!it || it.種 !== "build") return { ok: false, 訳: "建てられるものではありません。" };
    if (this.inv.count(itemId) < 1) return { ok: false, 訳: "持っていません。" };
    if (this.at(x, y, z)) return { ok: false, 訳: "すでに何かあります。" };
    const k = this.区key(x, z);
    const m = this.区.get(k);
    if (m && m.size >= 上限) return { ok: false, 訳: "この区画にはもう建てられません。" };
    return { ok: true };
  }

  /** 置く */
  置く(itemId, x, y, z, yaw) {
    const c = this.置ける(itemId, x, y, z);
    if (!c.ok) return c;
    if (!this.inv.remove(itemId, 1)) return { ok: false, 訳: "持っていません。" };
    const k = this.区key(x, z);
    let m = this.区.get(k);
    if (!m) { m = new Map(); this.区.set(k, m); }
    const o = { id: itemId, x: 格子へ(x), y: Math.round(y * 2) / 2, z: 格子へ(z), yaw: yaw || 0 };
    /* ★ 中身を 持つ もの（2026-09-02）。表に 書いて あるだけの
       「はたけ」「たからばこ」を **本当に 使える**ように する。 */
    if (itemId === "b_farm") o.畑 = { 種: "", 蒔: 0 };
    if (itemId === "b_chest") o.箱 = [];
    m.set(建物key(x, y, z), o);
    this.dirty.add(k);
    this.onChange(k);
    return { ok: true, 物: o };
  }

  /* ══ 設計図で 建てる（2026-09-02）════════════════════════════════
     訴え「建物も あって、自分で 建物を 建てたりも できるように」。
     1 個ずつ 置く 道は 残したまま、**建物ごと** 建てる 道を 足す。

     ★ 要るものは **型**で 数える（木でも 石でも かべは かべ）。
       材料の 種類を 縛ると、手持ちが 少し 足りない だけで 建たない。
       持って いる ものから **多い 順**に 使うので、混ざった 家に なる。
     ★ 足りない ときは **1 個も 置かない**。半分だけ 建った 家を 残さない。
     ★ 地面の 高さは **建てはじめる ところ**に そろえる。
       1 個ずつ 地面に 貼ると、坂で 家が ばらばらに なる。 */

  /** その 型の 建材を 何個 持って いるか（多い 順の 一覧つき）。 */
  型の持ち(型) {
    const 出 = [];
    let 計 = 0;
    for (const id in ITEM) {
      const it = ITEM[id];
      if (!it || it.種 !== "build" || !it.型) continue;
      if (it.型 !== 型) continue;
      const n = this.inv.count(id);
      if (n > 0) { 出.push([id, n]); 計 += n; }
    }
    出.sort((a, b) => b[1] - a[1]);
    return { 計, 一覧: 出 };
  }

  /** 足りて いるか。{ok, 足りない:{型:数}, 使う:[[itemId,数]…]}
      ★ 数えかたは 建てる ときと **同じ 重なり つぶし**を 通す。
        ここだけ 多く 数えると「足りない」と 断られて 建てられない。 */
  設計図を見る(bp) {
    /* ★ 重なった ますは **後に 書いた ほうが 残る**。
       建てる 側と そろえないと、数は 合って いるのに 型が ずれ、
       材料が 余ったまま 建物に 穴が 空く（実測: 家で 12 か所 抜けた）。 */
    const 面 = new Map();
    for (const p of bp.部) 面.set(p[0] + "/" + p[1] + "/" + p[2], p[3]);
    const 要 = {};
    for (const 型 of 面.values()) 要[型] = (要[型] || 0) + 1;
    const 足りない = {};
    const 使う = [];
    for (const 型 in 要) {
      const { 計, 一覧 } = this.型の持ち(型);
      if (計 < 要[型]) { 足りない[型] = 要[型] - 計; continue; }
      let 残 = 要[型];
      for (const [id, n] of 一覧) {
        if (残 <= 0) break;
        const 取 = Math.min(n, 残);
        使う.push([id, 取, 型]); 残 -= 取;
      }
    }
    return { ok: Object.keys(足りない).length === 0, 要, 足りない, 使う };
  }

  /**
   * 建てる。x,z は 建物の 手前左の 角。y は 地面の 高さ。
   * @returns {{ok:boolean, 訳?:string, 数?:number}}
   */
  設計図で建てる(bp, x, y, z, yaw) {
    const 見 = this.設計図を見る(bp);
    if (!見.ok) {
      const 名 = Object.keys(見.足りない).map((t) => 型名(t) + " あと " + 見.足りない[t]).join("、");
      return { ok: false, 訳: "足りません: " + 名 };
    }
    /* 型ごとに 「どの 材料を 何個 使うか」を 並べて 取り出せるように する */
    const 山 = {};
    for (const [id, n, 型] of 見.使う) (山[型] || (山[型] = [])).push([id, n]);
    const 取り出す = (型) => {
      const a = 山[型];
      while (a && a.length) {
        if (a[0][1] > 0) { a[0][1]--; return a[0][0]; }
        a.shift();
      }
      return null;
    };
    /* 置く 場所が 空いて いるか（1 つでも 埋まって いたら 建てない）
       ★ 設計図の 中で **同じ ますが 2 度 出る**ことが ある
         （囲いの 角に かべと 柱が 両方 来る）。
         そのままだと 材料を 2 個 使って 1 個しか 建たない。
         後に 書いた ほうを 残す（角は 柱に なる）。 */
    const 面図 = new Map();
    const c = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
    for (const p of bp.部) {
      const ox = p[0] * 格子, oz = p[2] * 格子;
      const wx = 格子へ(x + ox * c - oz * sn);
      const wz = 格子へ(z + ox * sn + oz * c);
      const wy = Math.round((y + p[1] * 格子) * 2) / 2;
      if (this.at(wx, wy, wz)) return { ok: false, 訳: "そこには もう 何か あります。" };
      面図.set(建物key(wx, wy, wz), [wx, wy, wz, p[3]]);
    }
    const 面 = Array.from(面図.values());
    /* 区画の 上限 */
    const 数 = {};
    for (const [wx, , wz] of 面) { const k = this.区key(wx, wz); 数[k] = (数[k] || 0) + 1; }
    for (const k in 数) {
      const m = this.区.get(k);
      if ((m ? m.size : 0) + 数[k] > 上限) return { ok: false, 訳: "この 場所には もう 建てられません。" };
    }
    /* ここまで 通ったら 建てる */
    let 建 = 0;
    for (const [wx, wy, wz, 型] of 面) {
      const id = 取り出す(型);
      if (!id) continue;
      if (!this.inv.remove(id, 1)) continue;
      const k = this.区key(wx, wz);
      let m = this.区.get(k);
      if (!m) { m = new Map(); this.区.set(k, m); }
      const o = { id, x: wx, y: wy, z: wz, yaw: yaw || 0 };
      if (id === "b_farm") o.畑 = { 種: "", 蒔: 0 };
      if (id === "b_chest") o.箱 = [];
      m.set(建物key(wx, wy, wz), o);
      this.dirty.add(k);
      建++;
    }
    for (const k in 数) this.onChange(k);
    return { ok: true, 数: 建 };
  }

  /** 壊す（材料は 戻る） */
  壊す(x, y, z) {
    const k = this.区key(x, z);
    const m = this.区.get(k);
    if (!m) return { ok: false, 訳: "何もありません。" };
    const bk = 建物key(x, y, z);
    const o = m.get(bk);
    if (!o) return { ok: false, 訳: "何もありません。" };
    m.delete(bk);
    this.inv.add(o.id, 1);
    this.dirty.add(k);
    this.onChange(k);
    return { ok: true, 物: o };
  }

  /** その 区画の 建物（描く ため） */
  区の(cx, cz) {
    const m = this.区.get(cx + "," + cz);
    return m ? Array.from(m.values()) : [];
  }

  /** いちばん 近い 建物（壊す ため） */
  近くの(x, z, 半径) {
    const R = 半径 === undefined ? 3.5 : 半径;
    let best = null, bd = R * R;
    const cx = Math.floor(x / CK_W), cz = Math.floor(z / CK_W);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const m = this.区.get((cx + i) + "," + (cz + j));
        if (!m) continue;
        for (const o of m.values()) {
          const dx = o.x - x, dz = o.z - z;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = o; }
        }
      }
    }
    return best;
  }

  /** 家具が 近くに あるか（作業台・たき火 など） */
  近くに家具(x, z, id, 半径) {
    const R = 半径 === undefined ? 5 : 半径;
    const cx = Math.floor(x / CK_W), cz = Math.floor(z / CK_W);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const m = this.区.get((cx + i) + "," + (cz + j));
        if (!m) continue;
        for (const o of m.values()) {
          if (o.id !== id) continue;
          if (Math.hypot(o.x - x, o.z - z) <= R) return o;
        }
      }
    }
    return null;
  }

  /** どの 場が 使えるか（作る 画面の ため） */
  使える場(x, z) {
    const 出 = { 手: true, 台: false, 火: false, かま: false };
    if (this.近くに家具(x, z, "b_bench")) 出.台 = true;
    if (this.近くに家具(x, z, "b_fire")) { 出.火 = true; }
    /* かまど = たき火 ＋ 石の 建材が そば に ある */
    if (出.火) {
      const cx = Math.floor(x / CK_W), cz = Math.floor(z / CK_W);
      let 石 = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const m = this.区.get((cx + i) + "," + (cz + j));
        if (!m) continue;
        for (const o of m.values()) {
          const it = ITEM[o.id];
          if (it && it.硬 >= 2 && Math.hypot(o.x - x, o.z - z) <= 5) 石++;
        }
      }
      if (石 >= 4) 出.かま = true;
    }
    return 出;
  }

  数() { let n = 0; for (const m of this.区.values()) n += m.size; return n; }

  /* ══ はたけ ══════════════════════════════════════════════════
     たねを 蒔く → 時間で 育つ → 採る。実る までの 秒は たねに 書いて ある。 */
  蒔く(o, seedId, now) {
    if (!o || !o.畑) return { ok: false, 訳: "はたけではありません。" };
    if (o.畑.種) return { ok: false, 訳: "もう 何か 植わって います。" };
    const it = ITEM[seedId];
    if (!it || it.種 !== "seed") return { ok: false, 訳: "たねではありません。" };
    if (!this.inv.remove(seedId, 1)) return { ok: false, 訳: "持っていません。" };
    o.畑.種 = seedId;
    o.畑.蒔 = now;
    this.dirty.add(this.区key(o.x, o.z));
    this.onChange(this.区key(o.x, o.z));
    return { ok: true };
  }
  /** 育ち具合 0〜1 */
  育ち(o, now) {
    if (!o || !o.畑 || !o.畑.種) return 0;
    const it = ITEM[o.畑.種];
    const 秒 = (it && it.秒) || 120;
    return Math.max(0, Math.min(1, (now - o.畑.蒔) / (秒 * 1000)));
  }
  採る(o, now) {
    if (!o || !o.畑 || !o.畑.種) return { ok: false, 訳: "何も 植わって いません。" };
    if (this.育ち(o, now) < 1) return { ok: false, 訳: "まだ 育って いません。" };
    const it = ITEM[o.畑.種];
    const 実 = (it && it.実) || "kusa";
    const n = 2 + Math.floor(Math.random() * 3);
    const 余 = this.inv.add(実, n);
    /* たねも 1 つ 戻る（続けられる ように） */
    this.inv.add(o.畑.種, 1);
    o.畑.種 = ""; o.畑.蒔 = 0;
    this.dirty.add(this.区key(o.x, o.z));
    this.onChange(this.区key(o.x, o.z));
    return { ok: true, 実, 数: n - 余 };
  }

  /* ══ たからばこ ══════════════════════════════════════════════ */
  箱に入れる(o, itemId, n) {
    if (!o || !o.箱) return { ok: false, 訳: "たからばこではありません。" };
    if (o.箱.length >= 24) {
      const 同 = o.箱.find((s) => s.id === itemId);
      if (!同) return { ok: false, 訳: "たからばこが いっぱいです。" };
    }
    const 数 = Math.max(1, n || 1);
    if (!this.inv.remove(itemId, 数)) return { ok: false, 訳: "持っていません。" };
    const 同 = o.箱.find((s) => s.id === itemId);
    if (同) 同.数 += 数; else o.箱.push({ id: itemId, 数 });
    this.onChange(this.区key(o.x, o.z));
    return { ok: true };
  }
  箱から出す(o, itemId, n) {
    if (!o || !o.箱) return { ok: false, 訳: "たからばこではありません。" };
    const i = o.箱.findIndex((s) => s.id === itemId);
    if (i < 0) return { ok: false, 訳: "入って いません。" };
    const 数 = Math.min(o.箱[i].数, Math.max(1, n || 1));
    const 余 = this.inv.add(itemId, 数);
    o.箱[i].数 -= (数 - 余);
    if (o.箱[i].数 <= 0) o.箱.splice(i, 1);
    this.onChange(this.区key(o.x, o.z));
    return { ok: true, 数: 数 - 余 };
  }

  toJSON() {
    const o = {};
    for (const [k, m] of this.区) o[k] = Array.from(m.values());
    return o;
  }
  load(j) {
    this.区.clear();
    if (!j) return;
    for (const k in j) {
      const m = new Map();
      for (const o of j[k]) {
        if (!ITEM[o.id]) continue;
        m.set(建物key(o.x, o.y, o.z), o);
      }
      this.区.set(k, m);
    }
  }
}
