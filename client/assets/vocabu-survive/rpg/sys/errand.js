/* ══════════════════════════════════════════════════════════════════════════
   町の 依頼。物語とは 別に、**いつでも 受けられる 仕事**。

   ★ 決まりで 作る（手で 書かない）。土地・素材・敵の 組み合わせで
     いくらでも 出せる ので、物語を 終えても やる ことが 残る。
   ★ 難しさは **段位**に 合わせる。始めたばかりの 人に 竜を 頼まない。
   ★ 受けられるのは **同時に 3 つ**まで。並べすぎると どれも 進まない。
   ★ 期限は 置かない（すきま時間で 遊ぶ 人が 損を する）。
   ══════════════════════════════════════════════════════════════════════════ */
import { ITEM, ITEM_IDS, 名 as item名 } from "../data/items.js";
import { ENEMIES } from "../data/enemies.js";
import { RECIPES } from "../data/recipes.js";
import { hash2 } from "../world/noise.js";
import { BIOMES } from "../world/biome.js";

const 上限 = 3;

/* 依頼に 出す 素材（採れる ものだけ） */
const 素材候補 = (() => {
  const set = new Set();
  for (const k in BIOMES) for (const i of BIOMES[k].取れる) set.add(i);
  return Array.from(set);
})();

export class Errands {
  constructor(o) {
    this.inv = o.inventory;
    this.combat = o.combat;
    this.seed = o.seed | 0;
    /** 受けて いる 依頼 */

    this.受 = [];
    this.済 = 0;
    this.onDone = o.onDone || function () {};
  }

  /** その 町・その 人が 出す 依頼（種と 位置から 決め打ち）。 */
  出す(town, npc, n) {
    const 数 = n || 3;
    const out = [];
    for (let i = 0; i < 数; i++) {
      const r = (k) => hash2(Math.round(npc.x), Math.round(npc.z), this.seed + i * 97 + k);
      out.push(this._作る(npc, r, i));
    }
    return out;
  }

  _作る(npc, r, i) {
    const lv = Math.max(1, this.combat.lv);
    const 型 = npc.役 === "hunter" ? "倒" : (npc.役 === "smith" ? "作" : (r(1) < 0.5 ? "集" : (r(2) < 0.5 ? "倒" : "作")));
    const id = npc.id + "_e" + i;
    if (型 === "集") {
      const it = 素材候補[Math.floor(r(3) * 素材候補.length) % 素材候補.length];
      const 数 = 4 + Math.floor(r(4) * 8) + Math.floor(lv * 0.6);
      return { id, 型, 何: it, 数, 礼金: Math.round((ITEM[it].値 * 数) * 1.5) + 10, 経: 6 + 数,
        文: "「" + item名(it) + "を " + 数 + " 個、集めてきてほしい。」", 主: npc.名 };
    }
    if (型 === "倒") {
      /* 段位で 出せる 敵を 絞る */
      const 使える = Object.keys(ENEMIES).filter((k) => !ENEMIES[k].主 && ENEMIES[k].位 <= Math.min(3, Math.floor(lv / 6)));
      const list = 使える.length ? 使える : ["slime_green"];
      const e = list[Math.floor(r(5) * list.length) % list.length];
      const 数 = 3 + Math.floor(r(6) * 5);
      return { id, 型, 何: e, 数, 礼金: Math.round(ENEMIES[e].経 * 数 * 1.2) + 12, 経: ENEMIES[e].経 * 2,
        文: "「" + ENEMIES[e].名 + "が " + 数 + " 体ばかり 出て、困って いる。」", 主: npc.名 };
    }
    /* 作る */
    const 作れる = RECIPES.filter((x) => ITEM[x.出] && (ITEM[x.出].種 === "material" || ITEM[x.出].種 === "food" || ITEM[x.出].種 === "potion"));
    const rc = 作れる[Math.floor(r(7) * 作れる.length) % 作れる.length];
    const 数 = 1 + Math.floor(r(8) * 3);
    return { id, 型, 何: rc.出, 数, 礼金: Math.round(ITEM[rc.出].値 * 数 * 2.2) + 14, 経: 10 + 数 * 4,
      文: "「" + item名(rc.出) + "を " + 数 + " つ 作って くれないか。」", 主: npc.名 };
  }

  受ける(e) {
    if (this.受.length >= 上限) return { ok: false, 訳: "同時に 受けられるのは " + 上限 + " つ までです。" };
    if (this.受.some((x) => x.id === e.id)) return { ok: false, 訳: "もう 受けて います。" };
    this.受.push(Object.assign({}, e, { 進: 0, 受けた: Date.now() }));
    return { ok: true };
  }

  やめる(id) {
    const i = this.受.findIndex((x) => x.id === id);
    if (i >= 0) this.受.splice(i, 1);
  }

  /** 敵を 倒した ことを 伝える */
  倒した(enemyId) {
    for (const e of this.受) if (e.型 === "倒" && e.何 === enemyId) e.進++;
  }
  作った(itemId, n) {
    for (const e of this.受) if (e.型 === "作" && e.何 === itemId) e.進 += (n || 1);
  }

  /** 済んで いるか（集める は 持ちものを 見る） */
  進み(e) {
    if (e.型 === "集") return Math.min(e.数, this.inv.count(e.何));
    return Math.min(e.数, e.進);
  }
  済んだ(e) { return this.進み(e) >= e.数; }

  /** 渡す（済んで いれば 礼を 受け取る） */
  渡す(id) {
    const i = this.受.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, 訳: "その依頼を 受けて いません。" };
    const e = this.受[i];
    if (!this.済んだ(e)) return { ok: false, 訳: "まだ 終わって いません。" };
    if (e.型 === "集") {
      if (!this.inv.remove(e.何, e.数)) return { ok: false, 訳: "持ちものが 足りません。" };
    }
    this.inv.add("kin_ka", e.礼金);
    this.combat.加経(e.経);
    this.受.splice(i, 1);
    this.済++;
    this.onDone(e);
    return { ok: true, 金: e.礼金, 経: e.経 };
  }

  文(e) {
    const 今 = this.進み(e);
    const 何 = e.型 === "倒" ? (ENEMIES[e.何] ? ENEMIES[e.何].名 : e.何) : item名(e.何);
    return 何 + " " + 今 + " / " + e.数;
  }

  toJSON() { return { 受: this.受, 済: this.済 }; }
  load(j) { if (!j) return; this.受 = Array.isArray(j.受) ? j.受 : []; this.済 = j.済 | 0; }
}
