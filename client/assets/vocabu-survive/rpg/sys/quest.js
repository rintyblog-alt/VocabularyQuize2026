/* ══════════════════════════════════════════════════════════════════════════
   物語の 進み。**いま 何を すれば いいか**を いつでも 1 行で 出す。

   ★ 迷わせない。これが いちばん 大事。
   ★ 節は 順番。飛ばせない（飛ばせると 物語が 崩れる）。
   ★ 進みは **その場で 数える**（持ちものを 見る・倒した 数を 数える）。
     途中で 保存しない ので、ずれない。
   ══════════════════════════════════════════════════════════════════════════ */
import { CHAPTERS, 全節, 主の居場所 } from "../data/story.js";
import { ITEM, 名 } from "../data/items.js";
import { ENEMIES } from "../data/enemies.js";

export class Quest {
  constructor(o) {
    this.inv = o.inventory;
    this.build = o.build;
    this.combat = o.combat;
    this.i = 0;                        /* いま 何節目 */
    this.倒した = Object.create(null); /* enemyId → 数 */
    this.行った = new Set();           /* biome */
    this.作った = Object.create(null);
    this.言葉 = 0;
    this.終わった = false;
    this.onClear = o.onClear || function () {};
    this.onChapter = o.onChapter || function () {};
  }

  get 節() { return 全節[this.i] || null; }
  get 章() {
    const s = this.節;
    if (!s) return null;
    return CHAPTERS.find((c) => c.id === s.章) || null;
  }

  /* ── 外から 教えて もらう ─────────────────────────────────── */
  倒した報告(enemyId) { this.倒した[enemyId] = (this.倒した[enemyId] || 0) + 1; this.見る(); }
  行った報告(biome) { if (!this.行った.has(biome)) { this.行った.add(biome); this.見る(); } }
  作った報告(itemId, n) { this.作った[itemId] = (this.作った[itemId] || 0) + (n || 1); this.見る(); }
  言葉報告(正) { if (正) { this.言葉++; this.見る(); } }

  /** いまの 節の 進み。{今, 要, 済} */
  進み() {
    const s = this.節;
    if (!s) return { 今: 0, 要: 1, 済: true };
    const y = s.やる;
    if (y.型 === "集") {
      let 今 = 0, 要 = 0;
      for (const k in y.何) { 要 += y.何[k]; 今 += Math.min(y.何[k], this.inv.count(k)); }
      return { 今, 要, 済: 今 >= 要 };
    }
    if (y.型 === "作") {
      const 今 = Math.min(y.数, (this.作った[y.何] || 0) + this.inv.count(y.何));
      return { 今, 要: y.数, 済: 今 >= y.数 };
    }
    if (y.型 === "建") {
      let 今 = 0;
      for (const m of this.build.区.values()) for (const o of m.values()) if (o.id === y.何) 今++;
      return { 今: Math.min(y.数, 今), 要: y.数, 済: 今 >= y.数 };
    }
    if (y.型 === "倒") {
      const 今 = Math.min(y.数, this.倒した[y.誰] || 0);
      return { 今, 要: y.数, 済: 今 >= y.数 };
    }
    if (y.型 === "行") {
      const 済 = this.行った.has(y.先);
      return { 今: 済 ? 1 : 0, 要: 1, 済 };
    }
    if (y.型 === "言") {
      return { 今: Math.min(y.数, this.言葉), 要: y.数, 済: this.言葉 >= y.数 };
    }
    return { 今: 0, 要: 1, 済: false };
  }

  /** 済んで いれば 進める。
     ★ **入れ子に しない**（2026-09-02）。
       礼を 渡す ＝ 持ちものが 変わる ＝ また ここが 呼ばれる。
       止めないと 節が 一気に 最後まで 進み、持ちものが 礼で 埋まる
       （実測: 1 回の 採取で 36 節 すべて 済んで 枠が 満杯に なった）。 */
  見る() {
    if (this._中) return null;
    if (this.終わった) return null;
    const s = this.節;
    if (!s) return null;
    const p = this.進み();
    if (!p.済) return null;
    this._中 = true;
    try { return this._進める(s); } finally { this._中 = false; }
  }

  _進める(s) {
    /* 礼を 渡す */
    const 礼 = [];
    for (const k in (s.礼 || {})) {
      const 余 = this.inv.add(k, s.礼[k]);
      礼.push([k, s.礼[k] - 余]);
    }
    if (s.経) this.combat.加経(s.経);
    const 前章 = s.章;
    /* 最後を 超えない（超えると 進みの 数え方が 壊れる） */
    this.i = Math.min(全節.length, this.i + 1);
    const 次 = this.節;
    this.onClear(s, 礼);
    if (!次) { this.終わった = true; }
    else if (次.章 !== 前章) this.onChapter(this.章);
    return { 節: s, 礼 };
  }

  /** いま 何を すれば いいか（1 行） */
  いまの一行() {
    if (this.終わった) return "物語は終わった。ここから先は、好きに歩いていい。";
    const s = this.節;
    if (!s) return "";
    const y = s.やる, p = this.進み();
    if (y.型 === "集") {
      const 足 = [];
      for (const k in y.何) {
        const 要 = y.何[k], 今 = this.inv.count(k);
        if (今 < 要) 足.push(名(k) + " " + 今 + "/" + 要);
      }
      return "集める … " + (足.length ? 足.join("、") : "そろった");
    }
    if (y.型 === "作") return "作る … " + 名(y.何) + " " + p.今 + "/" + p.要;
    if (y.型 === "建") return "建てる … " + 名(y.何) + " " + p.今 + "/" + p.要;
    if (y.型 === "倒") {
      const D = ENEMIES[y.誰];
      return "倒す … " + (D ? D.名 : y.誰) + " " + p.今 + "/" + p.要;
    }
    if (y.型 === "行") return "行く … " + (y.名 || y.先);
    if (y.型 === "言") return "言葉に答える … " + p.今 + "/" + p.要;
    return s.題;
  }

  /** 目印を 出す 場所（あれば） */
  目印() {
    const s = this.節;
    if (!s) return null;
    if (s.やる.型 === "行") return { 型: "biome", 先: s.やる.先, 名: s.やる.名 };
    if (s.やる.型 === "倒" && 主の居場所[s.やる.誰]) {
      return { 型: "biome", 先: 主の居場所[s.やる.誰], 名: ENEMIES[s.やる.誰].名 + "のいる土地" };
    }
    return null;
  }

  toJSON() {
    return { i: this.i, 倒した: this.倒した, 行った: Array.from(this.行った),
             作った: this.作った, 言葉: this.言葉, 終: this.終わった };
  }
  load(j) {
    if (!j) return;
    this.i = Math.max(0, Math.min(全節.length, j.i | 0));
    this.倒した = j.倒した || Object.create(null);
    this.行った = new Set(j.行った || []);
    this.作った = j.作った || Object.create(null);
    this.言葉 = j.言葉 | 0;
    this.終わった = !!j.終;
  }
}
