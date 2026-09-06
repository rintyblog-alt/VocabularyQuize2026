/* ══════════════════════════════════════════════════════════════════════════
   町。安全で、人が いて、売り買いが できる。

   ★ 町は **地形から 決まる**（terrain.townAt）。だから 種が 同じなら 同じ 場所。
   ★ 中身（人・店・家）は 位置から 決め打ちで 作る。しまわない。
   ★ 町の 中では 敵が 湧かない。歩き通しの 遊びに「息つぎ」を 作る。
   ══════════════════════════════════════════════════════════════════════════ */
import { hash2 } from "../world/noise.js";
import { ITEM, ITEM_IDS } from "../data/items.js";
import { BIOMES } from "../world/biome.js";

const 名字 = ["みなみ", "きた", "ひがし", "にし", "みずうみ", "いしだ", "もり", "はら", "たに", "おか", "しお", "ゆき"];
const 名前 = ["ハル", "ナギ", "トウ", "ミオ", "レン", "コウ", "サキ", "ユキ", "ソラ", "リク", "アオ", "ヒナ"];
const 役 = [
  { id: "shop", 名: "よろず屋", 語: "「見ていきな。うちは いいものを 置いてる。」", 色: [0.86, 0.66, 0.34] },
  { id: "smith", 名: "鍛冶", 語: "「鉄は 持ってきたか。無いなら 話に ならん。」", 色: [0.56, 0.52, 0.58] },
  { id: "herb", 名: "薬師", 語: "「傷は 早いうちに。あとで 効かなくなる。」", 色: [0.44, 0.76, 0.52] },
  { id: "guide", 名: "案内", 語: "「この先の 話を 聞いていくかい。」", 色: [0.52, 0.68, 0.94] },
  { id: "hunter", 名: "狩人", 語: "「あれを 狩ってきてくれると 助かる。」", 色: [0.74, 0.46, 0.36] },
  { id: "scholar", 名: "学者", 語: "「言葉を 覚えると、読めるものが 増える。」", 色: [0.70, 0.54, 0.92] }
];

/* 店に 並ぶ もの（役ごと） */
const 品 = {
  shop: ["pan", "himo", "ita", "b_torch", "s_kusa", "shio", "seisui", "hoshi_niku"],
  smith: ["ki_axe", "ishi_pick", "dou_sword", "tetsu_pick", "tetsu_sword", "sumi", "tetsu", "dou"],
  herb: ["kusuri_ko", "kusuri_chu", "dokukeshi", "yakusou", "atatakai_kusuri", "suzushii_kusuri"],
  guide: ["furui_chizu", "book_ki", "book_ishi"],
  hunter: ["ki_bow", "washi_bane", "kawa", "hoshi_niku"],
  scholar: ["book_kotoba", "book_kusuri", "kioku_no_kusuri", "mahou_ko"]
};

export class Town {
  constructor(o) {
    this.terr = o.terrain;
    this.seed = o.seed | 0;
    this.cache = new Map();
  }

  /** その 位置の 近くの 町（無ければ null） */
  近くの(x, z) {
    const t = this.terr.nearestTown(x, z);
    if (!t) return null;
    return Object.assign(this.中身(t), { dist: t.dist });
  }

  /** 町の 中身を 作る（決め打ち） */
  中身(t) {
    if (this.cache.has(t.id)) return this.cache.get(t.id);
    const r = (n) => hash2(Math.round(t.x), Math.round(t.z), this.seed + n);
    const B = BIOMES[t.biome] || BIOMES.meadow;
    const 名 = 名字[Math.floor(r(1) * 名字.length) % 名字.length] + "の" + ["まち", "むら", "さと", "つじ"][Math.floor(r(2) * 4) % 4];
    /* 人は 3〜6 人 */
    const n = 3 + Math.floor(r(3) * 4);
    const 人 = [];
    for (let i = 0; i < n; i++) {
      const yaku = 役[Math.floor(r(10 + i) * 役.length) % 役.length];
      const a = (i / n) * Math.PI * 2 + r(20 + i) * 0.7;
      const d = 7 + r(30 + i) * 9;
      const px = t.x + Math.cos(a) * d, pz = t.z + Math.sin(a) * d;
      人.push({
        id: t.id + "_n" + i,
        名: 名前[Math.floor(r(40 + i) * 名前.length) % 名前.length] + "・" + 名字[Math.floor(r(50 + i) * 名字.length) % 名字.length],
        役: yaku.id, 役名: yaku.名, 語: yaku.語, 色: yaku.色,
        x: px, z: pz, y: this.terr.height(px, pz),
        品: (品[yaku.id] || []).slice()
      });
    }
    /* 家（見た目だけ） */
    const 家 = [];
    const hn = 4 + Math.floor(r(5) * 5);
    for (let i = 0; i < hn; i++) {
      const a = (i / hn) * Math.PI * 2 + 0.4;
      const d = 13 + r(60 + i) * 10;
      const hx = t.x + Math.cos(a) * d, hz = t.z + Math.sin(a) * d;
      家.push({ x: hx, z: hz, y: this.terr.height(hx, hz),
        w: 4 + r(70 + i) * 3, h: 3 + r(80 + i) * 2, yaw: r(90 + i) * 6.28,
        色: [0.72 - r(95 + i) * 0.2, 0.60 - r(96 + i) * 0.16, 0.46] });
    }
    const o = { id: t.id, 名, x: t.x, z: t.z, y: t.h, biome: t.biome, 半径: 26, 人, 家 };
    this.cache.set(t.id, o);
    return o;
  }

  /** 町の 中に いるか */
  中に(x, z) {
    const t = this.近くの(x, z);
    return t && t.dist < t.半径 ? t : null;
  }

  /** いちばん 近い 人（話しかける ため） */
  近くの人(town, x, z, 半径) {
    if (!town) return null;
    const R = 半径 === undefined ? 3.2 : 半径;
    let best = null, bd = R * R;
    for (const p of town.人) {
      const dx = p.x - x, dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** 買う。戻り: {ok, 訳} */
  買う(inv, itemId, 金) {
    const it = ITEM[itemId];
    if (!it) return { ok: false, 訳: "その品はありません。" };
    const 値 = Math.max(1, Math.round(it.値 * 1.6));
    if (inv.count("kin_ka") < 値) return { ok: false, 訳: "金貨が足りません（" + inv.count("kin_ka") + " / " + 値 + "）。" };
    if (inv.add(itemId, 1) > 0) return { ok: false, 訳: "持ちものがいっぱいです。" };
    inv.remove("kin_ka", 値);
    return { ok: true, 値 };
  }

  /** 売る */
  売る(inv, itemId) {
    const it = ITEM[itemId];
    if (!it) return { ok: false, 訳: "売れません。" };
    if (inv.count(itemId) < 1) return { ok: false, 訳: "持っていません。" };
    const 値 = Math.max(1, Math.floor(it.値 * 0.55));
    inv.remove(itemId, 1);
    inv.add("kin_ka", 値);
    return { ok: true, 値 };
  }
}
