/* ══════════════════════════════════════════════════════════════════════════
   洞窟。地下へ 潜る。**別の 世界を 作らない**（重くなる）。

   考えかた:
     ★ 洞窟は **入口（穴）と 中の 部屋**の 2 つだけ。
       入口は 地形から 決まる（ボロノイ）ので 種が 同じなら 同じ 場所。
     ★ 中は **その 洞窟だけの 小さな 世界**。区画の 出し入れは しない
       （狭いので 全部 一度に 出せる）。
     ★ 暗い。持って いる たいまつ／光ごけで 見える 範囲が 変わる。
     ★ 中でしか 採れない ものを 置く（行く 理由）。
   ══════════════════════════════════════════════════════════════════════════ */
import { worley, hash2, rng } from "./noise.js";
import { BIOMES } from "./biome.js";

/* 洞窟の 中で 採れる もの（風土ごと） */
const 中の実り = {
  meadow: ["ishi", "tetsu_seki", "hikari_koke", "kinoko_shiro"],
  forest: ["ishi", "kinoko_aka", "hikari_koke", "dou_seki"],
  desert: ["suna", "gaseki", "suishou_ki", "hone"],
  snow: ["kouri", "gin_seki", "ishi", "yuki_hana"],
  volcano: ["yougan", "hi_no_kesshou", "kuro_kou", "iou"],
  swamp: ["doro", "doku_kinoko", "hikari_koke", "yakusou"],
  highland: ["tetsu_seki", "dou_seki", "ishi", "gin_seki"],
  ruin: ["kinzoku_kuzu", "kohaku_ban", "furui_kagi", "gaseki"],
  crystal: ["suishou_ao", "suishou_murasaki", "mahou_no_su", "hikari_koke"],
  shore: ["kai", "shio", "ishi", "shinju"]
};

/* 奥の 宝（風土ごと）。まれ 以上の ものを 1 つ 必ず 入れる。 */
const 洞の宝 = {
  meadow: ["gin_sword", "kusuri_dai", "book_kusuri"],
  forest: ["gin_axeW", "ougon_no_ha", "chikara_no_kusuri"],
  desert: ["hagane_helm", "hoshi_no_suna", "hayasa_no_kusuri"],
  snow: ["gin_chest", "katasa_no_kusuri", "gin_helm"],
  swamp: ["gin_dagger", "kusuri_dai", "book_kotoba"],
  highland: ["gin_pick", "hagane_chest", "chikara_no_kusuri"],
  volcano: ["ryu_no_uroko", "hagane_sword", "book_ryu"],
  crystal: ["sekai_no_kakera", "gin_staff", "kioku_no_kusuri"],
  ruin: ["book_kotoba", "kin_ka", "gin_legs"],
  beach: ["gin_spear", "kin_ka", "kusuri_dai"]
};
/* 奥の 番人。倒すと 宝が 開く。無い 風土は 番人なし。 */
const 洞の番人 = {
  forest: "boss_mori", desert: "boss_suna",
  volcano: "boss_hi", crystal: "boss_kesshou"
};

export class Caves {
  constructor(o) {
    this.terr = o.terrain;
    this.seed = o.seed | 0;
    this.cache = new Map();
  }

  /** その 位置の 近くに 洞窟の 入口が あるか。 */
  入口(wx, wz) {
    const w = worley(wx / 260, wz / 260, this.seed ^ 0x3c9a);
    if (w.d1 > 0.10) return null;
    const cx = (w.cx + hash2(w.cx, w.cy, this.seed ^ 0x3c9a)) * 260;
    const cz = (w.cy + hash2(w.cx, w.cy, (this.seed ^ 0x3c9a) + 31)) * 260;
    const t = this.terr.at(cx, cz);
    if (t.water) return null;
    if (t.h < 3) return null;
    return { id: "cave_" + w.cx + "_" + w.cy, x: cx, z: cz, y: t.h, biome: t.biome,
             dist: Math.hypot(cx - wx, cz - wz) };
  }

  /** 近い 入口（無ければ null） */
  近くの(wx, wz) {
    let best = null;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = this.入口(wx + i * 260, wz + j * 260);
      if (c && (!best || c.dist < best.dist)) best = c;
    }
    return best;
  }



  /** 洞窟の 中身（部屋と 通路）。決め打ちで 作る。 */
  中(cave) {
    if (this.cache.has(cave.id)) return this.cache.get(cave.id);
    const r = rng((cave.x * 131 + cave.z * 977 + this.seed) | 0);
    const 部屋数 = 4 + Math.floor(r() * 5);
    const 部屋 = [];
    let x = 0, z = 0;
    for (let i = 0; i < 部屋数; i++) {
      const 半 = 7 + r() * 9;
      const 深 = -6 - i * (2 + r() * 3);
      部屋.push({ x, z, y: 深, 半, 光: r() < 0.4 });
      const a = r() * Math.PI * 2;
      const d = 半 + 8 + r() * 12;
      x += Math.cos(a) * d; z += Math.sin(a) * d;
    }
    /* 実り（採れる もの）を 置く */
    const 実 = 中の実り[cave.biome] || 中の実り.meadow;
    const 資源 = [];
    for (const p of 部屋) {
      const n = 3 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = r() * p.半 * 0.8;
        資源.push({
          x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: p.y,
          何: 実[Math.floor(r() * 実.length) % 実.length], 取った: false
        });
      }
    }
    /* ★ いちばん 奥に **宝と 番人**（2026-09-02）。
       置かないと ほらあなが「暗い 倉庫」に なる。
       奥へ 行くほど 得が ある から、暗くても 進む。 */
    const 奥 = 部屋[部屋.length - 1];
    const B = BIOMES[cave.biome] || BIOMES.meadow;
    const 宝表 = 洞の宝[cave.biome] || 洞の宝.meadow;
    const 宝 = {
      x: 奥.x, z: 奥.z, y: 奥.y, 開けた: false,
      中身: [
        [宝表[Math.floor(r() * 宝表.length) % 宝表.length], 1],
        ["kin_ka", 1 + Math.floor(r() * 3)],
        [(B.取れる || ["ishi"])[0], 4 + Math.floor(r() * 6)]
      ]
    };
    const 番人 = 洞の番人[cave.biome] || null;
    const o = { id: cave.id, 入: cave, 部屋, 資源, 宝, 番人, 番人を出した: false,
      出る: B.出る || [], 強さ: (B.強さ || 2) + 1,
      名: (BIOMES[cave.biome] ? BIOMES[cave.biome].名 : "") + "の ほらあな",
      深さ: 部屋[部屋.length - 1].y };
    this.cache.set(cave.id, o);
    return o;
  }

  /** 洞窟の 中の 地面の 高さ（部屋の 中なら その 深さ、外なら null＝壁） */
  床(中身, lx, lz) {
    let best = null, bd = 1e9;
    for (const p of 中身.部屋) {
      const d = Math.hypot(p.x - lx, p.z - lz);
      if (d > p.半) continue;
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return best.y;
    /* 部屋と 部屋の あいだの 通路（線の まわり 3.2） */
    for (let i = 0; i < 中身.部屋.length - 1; i++) {
      const a = 中身.部屋[i], b = 中身.部屋[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((lx - a.x) * dx + (lz - a.z) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (Math.hypot(px - lx, pz - lz) < 3.4) return a.y + (b.y - a.y) * t;
    }
    return null;
  }
}
