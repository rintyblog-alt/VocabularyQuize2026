/* ══════════════════════════════════════════════════════════════════════════
   つり。**水辺で できる こと**を 作る。

   訴え の 芯（Rinty さん）:「素材も 集められるように」。
   世界の 17% は 水なのに、水では 何も できなかった（泳ぐ だけ）。

   ★ 遊びは **2 回 押す**。1 回目で 投げ、かかった ときに もう一度。
     押しっぱなしで 取れると 作業に なる。待つ 時間が あるから 当たりが 嬉しい。
   ★ 待ち時間は 竿の 効きで 短く なる。良い 竿を 作る 理由に する。
   ★ 何が つれるかは **水の 風土**で 決まる。海と 沼と 雪原で 違う。
   ══════════════════════════════════════════════════════════════════════════ */

/* 風土ごとに つれる もの。[id, 重み] */
export const つれる = {
  shore: [["sakana", 40], ["oo_sakana", 14], ["kai", 22], ["ryuuboku", 10], ["shinju", 3], ["shio", 11]],
  beach: [["sakana", 40], ["oo_sakana", 14], ["kai", 22], ["ryuuboku", 10], ["shinju", 3]],
  meadow: [["sakana", 52], ["oo_sakana", 12], ["ryuuboku", 20], ["kusa", 16]],
  forest: [["sakana", 46], ["oo_sakana", 12], ["ryuuboku", 24], ["eda", 18]],
  swamp: [["doro_uo", 46], ["sakana", 18], ["doro", 24], ["hikari_koke", 12]],
  snow: [["kouri_uo", 44], ["sakana", 20], ["kouri", 26], ["gin_seki", 6]],
  highland: [["sakana", 40], ["oo_sakana", 16], ["ishi", 26], ["dou_seki", 8]],
  volcano: [["hi_uo", 40], ["yougan", 30], ["iou", 20], ["hi_no_kesshou", 6]],
  crystal: [["hikari_uo", 38], ["suishou_ao", 26], ["hikari_koke", 20], ["suishou_murasaki", 10]],
  ruin: [["sakana", 34], ["kinzoku_kuzu", 28], ["kohaku_ban", 14], ["furui_kagi", 6]],
  desert: [["sakana", 40], ["suna", 30], ["gaseki", 16], ["hone", 10]]
};

export class Fishing {
  constructor(o) {
    this.terr = o.terrain;
    this.inv = o.inventory;
    this.onLog = o.onLog || function () {};
    /** null ／ {段: "投げた"|"かかった", t, 待, 風} */
    this.状 = null;
  }

  /** 立って いる ところの そばに 水が あるか。あれば その 風土。 */
  水べ(x, z) {
    /* ★ 輪を 1 本だけ 見ると **岸に 立って いるのに 見つからない**
       （実測: 3.0m 先が 水でも 3.2m の 輪では 外れた）。
       近い 輪と 遠い 輪の 2 本、12 方向。 */
    for (const r of [1.8, 3.4]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const t = this.terr.at(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (t.water) return t.biome;
      }
    }
    return "";
  }

  /** 竿を 持って いるか（道具の 型が rod）。効きを 返す（0＝持って いない）。 */
  竿(ITEM) {
    const id = this.inv.equip.tool;
    const it = ITEM[id];
    if (!it || it.型 !== "rod") return 0;
    return it.効き || 1;
  }

  /** 1 回目：投げる。 */
  投げる(風, 効) {
    if (this.状) return { ok: false, 訳: "もう 投げて います。" };
    /* 良い 竿ほど 早く かかる（4.2 秒 → 1.4 秒） */
    const 待 = 1.2 + Math.random() * (3.4 - Math.min(2.0, 効 * 0.28));
    this.状 = { 段: "投げた", t: 0, 待, 風: 風 || "meadow", 効 };
    return { ok: true };
  }

  /** 毎コマ。かかった／逃げた を 返す。 */
  update(dt) {
    const s = this.状;
    if (!s) return null;
    s.t += dt;
    if (s.段 === "投げた" && s.t >= s.待) {
      s.段 = "かかった"; s.t = 0;
      /* ★ 合わせる 猶予。短すぎると スマホで 押せない（実測で 0.8 は 無理）。 */
      s.猶 = 1.5;
      return { かかった: true };
    }
    if (s.段 === "かかった" && s.t >= s.猶) {
      this.状 = null;
      return { にげた: true };
    }
    return null;
  }

  /** 2 回目：あげる。 */
  あげる() {
    const s = this.状;
    if (!s) return { ok: false, 訳: "まだ 投げて いません。" };
    if (s.段 !== "かかった") {
      this.状 = null;
      return { ok: false, 訳: "早すぎた。逃げられた。" };
    }
    const 表 = つれる[s.風] || つれる.meadow;
    let 計 = 0;
    for (const [, w] of 表) 計 += w;
    let r = Math.random() * 計, 何 = 表[0][0];
    for (const [id, w] of 表) { r -= w; if (r <= 0) { 何 = id; break; } }
    /* 良い 竿ほど たまに 2 匹 */
    const 数 = (Math.random() < Math.min(0.34, s.効 * 0.045)) ? 2 : 1;
    this.状 = null;
    const 余 = this.inv.add(何, 数);
    return { ok: true, 何, 数: 数 - 余, 余 };
  }

  やめる() { this.状 = null; }
}
