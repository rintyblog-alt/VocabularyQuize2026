/* ══════════════════════════════════════════════════════════════════════════
   持ちもの。数える・入れる・出す・装う。

   ★ 枠の 数に 上限を 置く（36）。無限に 持てると 整理する 意味が 消える。
   ★ 同じ ものは 積む（items.js の 積 まで）。
   ★ 入りきらない ぶんは **黙って 捨てない**。何個 入らなかったかを 返す。
   ══════════════════════════════════════════════════════════════════════════ */
import { ITEM } from "../data/items.js";

export const 枠数 = 36;

export class Inventory {
  constructor(n) {
    this.n = n || 枠数;
    /** {id, 数} または null */
    this.slots = new Array(this.n).fill(null);
    /** 装っている もの。部位 → itemId */
    this.equip = { weapon: "", tool: "", helm: "", chest: "", legs: "", boots: "" };
    this.listeners = [];
  }

  on(fn) { if (typeof fn === "function") this.listeners.push(fn); }
  _fire() { for (const f of this.listeners) { try { f(this); } catch (e) {} } }

  /** 何個 持っているか */
  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.数;
    return n;
  }

  /** 入れる。戻り値は **入らなかった 数**（0 なら 全部 入った）。 */
  add(id, n) {
    const it = ITEM[id];
    if (!it) return n || 0;
    let 残 = Math.max(0, Math.floor(n === undefined ? 1 : n));
    const 積 = it.積 || 1;
    /* 先に 積める ところへ */
    for (let i = 0; i < this.n && 残 > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id || s.数 >= 積) continue;
      const 入 = Math.min(積 - s.数, 残);
      s.数 += 入; 残 -= 入;
    }
    /* 空き枠へ */
    for (let i = 0; i < this.n && 残 > 0; i++) {
      if (this.slots[i]) continue;
      const 入 = Math.min(積, 残);
      this.slots[i] = { id, 数: 入 };
      残 -= 入;
    }
    if (残 !== (n === undefined ? 1 : n)) this._fire();
    return 残;
  }

  /** 出す。足りなければ **1 つも 減らさない**（半端に 使わない）。 */
  remove(id, n) {
    const 要 = Math.max(1, Math.floor(n === undefined ? 1 : n));
    if (this.count(id) < 要) return false;
    let 残 = 要;
    for (let i = 0; i < this.n && 残 > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const 出 = Math.min(s.数, 残);
      s.数 -= 出; 残 -= 出;
      if (s.数 <= 0) this.slots[i] = null;
    }
    this._fire();
    return true;
  }

  /** まとめて 足りるか */
  has(材) {
    for (const k in 材) if (this.count(k) < 材[k]) return false;
    return true;
  }
  /** まとめて 出す（足りなければ 何も しない） */
  take(材) {
    if (!this.has(材)) return false;
    for (const k in 材) this.remove(k, 材[k]);
    return true;
  }

  /** 装う。戻り値は 前に 装って いた もの（無ければ ""） */
  wear(id) {
    const it = ITEM[id];
    if (!it) return "";
    let 部 = "";
    if (it.種 === "weapon") 部 = "weapon";
    else if (it.種 === "tool") 部 = "tool";
    else if (it.種 === "armor") 部 = it.型;
    if (!部 || !(部 in this.equip)) return "";
    if (this.count(id) < 1) return "";
    const 前 = this.equip[部];
    this.equip[部] = id;
    this._fire();
    return 前;
  }
  unwear(部) {
    if (!(部 in this.equip)) return "";
    const 前 = this.equip[部];
    this.equip[部] = "";
    this._fire();
    return 前;
  }

  /** いまの 攻撃力・守り・道具の 効き */
  status() {
    const w = ITEM[this.equip.weapon];
    const t = ITEM[this.equip.tool];
    let 守 = 0;
    for (const k of ["helm", "chest", "legs", "boots"]) {
      const a = ITEM[this.equip[k]];
      if (a && a.守) 守 += a.守;
    }
    return {
      攻: w ? w.攻 : 2,
      間: w ? w.間 : 1.8,
      速: w ? w.速 : 1.0,
      守: Math.round(守 * 10) / 10,
      道具: t ? t.効き : 1,
      道具型: t ? t.型 : "",
      武器名: w ? w.名 : "素手"
    };
  }

  /** 埋まっている 枠の 数 */
  used() { let n = 0; for (const s of this.slots) if (s) n++; return n; }

  /** 並べ替え（種類 → 位 → 名前）。同じ ものは まとめる。 */
  tidy() {
    const 合 = new Map();
    for (const s of this.slots) {
      if (!s) continue;
      合.set(s.id, (合.get(s.id) || 0) + s.数);
    }
    const 順 = ["tool", "weapon", "armor", "potion", "food", "material", "build", "seed", "book", "treasure"];
    const list = Array.from(合.entries()).sort((a, b) => {
      const A = ITEM[a[0]], B = ITEM[b[0]];
      const x = 順.indexOf(A.種) - 順.indexOf(B.種);
      if (x) return x;
      if (A.位 !== B.位) return B.位 - A.位;
      return A.名.localeCompare(B.名, "ja");
    });
    this.slots = new Array(this.n).fill(null);
    for (const [id, n] of list) this.add(id, n);
    this._fire();
  }

  toJSON() { return { slots: this.slots, equip: this.equip }; }
  static fromJSON(j, n) {
    const inv = new Inventory(n);
    if (j && Array.isArray(j.slots)) {
      for (let i = 0; i < Math.min(inv.n, j.slots.length); i++) {
        const s = j.slots[i];
        inv.slots[i] = (s && ITEM[s.id]) ? { id: s.id, 数: Math.max(1, s.数 | 0) } : null;
      }
    }
    if (j && j.equip) for (const k in inv.equip) if (ITEM[j.equip[k]]) inv.equip[k] = j.equip[k];
    return inv;
  }
}
