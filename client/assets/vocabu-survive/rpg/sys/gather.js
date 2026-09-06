/* ══════════════════════════════════════════════════════════════════════════
   採る。世界に 落ちて いる ものを 拾い、木や 岩を 叩いて 取る。

   ★ 採った ことは **世界の 側に 覚えて おく**（chunk は 種から 作り直される ので、
     採った ものが 出し入れの たびに 生え直すと 意味が 消える）。
     覚えるのは 「採った ところ」だけ（tx,tz）。軽い。
   ★ 木・岩は **時間が 経つと 戻る**（切り尽くして 遊べなく ならない ように）。
   ══════════════════════════════════════════════════════════════════════════ */
import { TILE } from "../world/terrain.js";
import { ITEM } from "../data/items.js";
import { hash2 } from "../world/noise.js";

/* 何回 叩けば 取れるか（道具の 効きで 減る） */
const 硬さ = { tree: 3, rock: 4, plant: 1, pickup: 1 };
/* 戻るまでの 秒 */
const 戻り = { tree: 240, rock: 300, plant: 90, pickup: 0 };

export class Gather {
  constructor(o) {
    this.terr = o.terrain;
    this.inv = o.inventory;
    this.seed = o.seed | 0;
    /** "tx,tz" → 取った 時刻（ms）。 */
    this.取った = new Map();
    /** いま 叩いて いる ところ */
    this.叩き = null;
    this.onGet = o.onGet || function () {};
    this.onMiss = o.onMiss || function () {};
  }

  key(tx, tz) { return tx + "," + tz; }

  /** まだ 生えて いるか */
  ある(tx, tz, kind, now) {
    const t = this.取った.get(this.key(tx, tz));
    if (t === undefined) return true;
    const 秒 = 戻り[kind] === undefined ? 180 : 戻り[kind];
    if (!秒) return false;
    return (now - t) > 秒 * 1000;
  }

  /** 取った ことに する */
  取る(tx, tz, now) { this.取った.set(this.key(tx, tz), now); }

  /**
   * その 場所の いちばん 近い 採れる ものを 探す。
   * props は chunkmgr が 持って いる 区画の props。
   */
  近くの(chunks, px, pz, 半径) {
    const R = 半径 === undefined ? 3.2 : 半径;
    let best = null, bd = R * R;
    const now = Date.now();
    for (const c of chunks.live.values()) {
      if (!c.近い) continue;
      const P = c.props;
      const 見る = (list, kind) => {
        for (const e of list) {
          const dx = e[0] - px, dz = e[2] - pz;
          const d = dx * dx + dz * dz;
          if (d >= bd) continue;
          const tx = Math.round(e[0] / TILE), tz = Math.round(e[2] / TILE);
          if (!this.ある(tx, tz, kind, now)) continue;
          bd = d; best = { kind, e, tx, tz, d: Math.sqrt(d), chunk: c };
        }
      };
      見る(P.資源, "pickup");
      見る(P.木, "tree");
      見る(P.岩, "rock");
      見る(P.草, "plant");
    }
    return best;
  }

  /** 何が 取れるか（見せる ため） */
  何が(target) {
    if (!target) return "";
    if (target.kind === "pickup") return target.e[3];
    if (target.kind === "tree") return "ki";
    if (target.kind === "rock") return "ishi";
    if (target.kind === "plant") return "kusa";
    return "";
  }

  /**
   * 叩く／拾う。
   * @returns {null|{取れた:string,数:number,残:number,終:boolean}}
   */
  hit(target, 道具, 道具型, now) {
    if (!target) return null;
    const k = this.key(target.tx, target.tz);
    const 要 = 硬さ[target.kind] || 2;
    /* 合う 道具なら 早い */
    const 合う =
      (target.kind === "tree" && 道具型 === "axe") ||
      (target.kind === "rock" && 道具型 === "pick") ||
      (target.kind === "plant" && 道具型 === "sickle") ||
      (target.kind === "pickup");
    const 力 = Math.max(0.34, (合う ? (道具 || 1) : (道具 || 1) * 0.34));
    if (!this.叩き || this.叩き.k !== k) this.叩き = { k, 進: 0 };
    this.叩き.進 += 力;
    const 残 = Math.max(0, 要 - this.叩き.進);
    if (残 > 0) return { 取れた: "", 数: 0, 残, 終: false };

    /* 取れた */
    this.叩き = null;
    this.取る(target.tx, target.tz, now);
    const out = this._もらう(target, 合う);
    return { 取れた: out.id, 数: out.n, 残: 0, 終: true, おまけ: out.おまけ };
  }

  _もらう(target, 合う) {
    const r = hash2(target.tx, target.tz, this.seed + 991);
    const r2 = hash2(target.tx, target.tz, this.seed + 1223);
    let id = this.何が(target);
    let n = 1;
    let おまけ = null;
    if (target.kind === "tree") { n = 2 + Math.floor(r * 3); if (r2 < 0.22) おまけ = ["eda", 1 + Math.floor(r2 * 6)]; }
    else if (target.kind === "rock") { n = 2 + Math.floor(r * 3); if (r2 < 0.18) おまけ = ["tetsu_seki", 1]; }
    else if (target.kind === "plant") { n = 1 + Math.floor(r * 2); }
    else { n = 1 + Math.floor(r * 2); }
    if (合う) n = Math.round(n * 1.4);
    /* 入れる */
    const 余 = this.inv.add(id, n);
    if (余 > 0) this.onMiss(id, 余);
    if (おまけ) {
      const 余2 = this.inv.add(おまけ[0], おまけ[1]);
      if (余2 > 0) this.onMiss(おまけ[0], 余2);
    }
    this.onGet(id, n - 余, おまけ);
    return { id, n: n - 余, おまけ };
  }

  toJSON() { return { 取った: Array.from(this.取った.entries()) }; }
  load(j) {
    if (!j || !Array.isArray(j.取った)) return;
    this.取った = new Map(j.取った);
  }
}
