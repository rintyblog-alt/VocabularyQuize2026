/* ══════════════════════════════════════════════════════════════════════════
   作る。作りかたを 引いて、材料を 出して、できたものを 入れる。

   ★ **できないときは 理由を 出す。** 押しても 何も 起きない、を 作らない。
   ★ 場所（手・台・火・かま）は 建てた ものから 決まる。
   ══════════════════════════════════════════════════════════════════════════ */
import { RECIPES } from "../data/recipes.js";
import { ITEM, 名 } from "../data/items.js";

export class Craft {
  constructor(o) {
    this.inv = o.inventory;
    this.build = o.build;
    this.quest = o.quest;
    this.onMade = o.onMade || function () {};
  }

  /** いま 使える 場所 */
  場(x, z) { return this.build.使える場(x, z); }

  /** 作れる／作れない を 判定して 一覧に する */
  一覧(x, z, 絞り) {
    const 場 = this.場(x, z);
    const out = [];
    for (const r of RECIPES) {
      const it = ITEM[r.出];
      if (!it) continue;
      if (絞り && it.種 !== 絞り) continue;
      const 場OK = !!場[r.場];
      const 材OK = this.inv.has(r.材);
      out.push({
        r, item: it, 場OK, 材OK, 作れる: 場OK && 材OK,
        足りない: 材OK ? [] : Object.keys(r.材).filter((k) => this.inv.count(k) < r.材[k])
      });
    }
    /* 作れる ものを 上へ。同じなら 種類・名前で。 */
    out.sort((a, b) => {
      if (a.作れる !== b.作れる) return a.作れる ? -1 : 1;
      if (a.場OK !== b.場OK) return a.場OK ? -1 : 1;
      if (a.item.種 !== b.item.種) return a.item.種.localeCompare(b.item.種);
      return a.item.名.localeCompare(b.item.名, "ja");
    });
    return out;
  }

  /** 作る。戻り: {ok, 訳, 出, 個} */
  作る(recipeId, x, z, 回) {
    const r = RECIPES.find((v) => v.id === recipeId);
    if (!r) return { ok: false, 訳: "その作りかたがありません。" };
    const 場 = this.場(x, z);
    if (!場[r.場]) {
      const 名前 = { 台: "作業台", 火: "たき火", かま: "かまど（たき火と石の壁）" }[r.場] || r.場;
      return { ok: false, 訳: 名前 + "のそばでないと作れません。" };
    }
    const n = Math.max(1, Math.min(20, 回 || 1));
    /* n 回ぶん 足りるか */
    const 要 = {};
    for (const k in r.材) 要[k] = r.材[k] * n;
    if (!this.inv.has(要)) {
      const 足 = Object.keys(要).filter((k) => this.inv.count(k) < 要[k])
        .map((k) => 名(k) + " " + this.inv.count(k) + "/" + 要[k]);
      return { ok: false, 訳: "足りません：" + 足.join("、") };
    }
    /* 入る 余地が あるか（作った 先で こぼれない ように 先に 見る） */
    this.inv.take(要);
    const 出 = r.個 * n;
    const 余 = this.inv.add(r.出, 出);
    if (余 > 0) {
      /* 入りきらない ぶんは 材料を 戻す（半端に 消さない） */
      for (const k in 要) this.inv.add(k, 要[k]);
      this.inv.remove(r.出, 出 - 余);
      return { ok: false, 訳: "持ちものがいっぱいです。" };
    }
    if (this.quest) this.quest.作った報告(r.出, 出);
    this.onMade(r.出, 出, r);
    return { ok: true, 出: r.出, 個: 出 };
  }
}
