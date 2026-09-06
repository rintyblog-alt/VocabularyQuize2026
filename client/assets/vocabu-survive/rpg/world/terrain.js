/* ══════════════════════════════════════════════════════════════════════════
   地形。**位置を 入れると 高さと 風土が 返る**、それだけ。

   ★ 状態を 持たない（保存した ものを 除く）。同じ 種・同じ 位置なら
     いつ 呼んでも 同じ 答え。区画の 出し入れで 地面が ずれない ため。
   ★ 世界の 広さは **決めない**。どこまでも 続く。
     「巨大」は 区切りを 置かない ことで 作る。
   ══════════════════════════════════════════════════════════════════════════ */
import { fbm, ridge, worley, hash2, noise2 } from "./noise.js";
import { BIOMES, pickBiome } from "./biome.js";

/* 1 マスの 大きさ（世界の 単位）。小さくすると 細かいが 重い。 */
export const TILE = 2;
/* 1 区画の マス数（16×16＝256 マス）。 */
export const CHUNK = 16;
/* 区画 1 つの 世界での 大きさ */
export const CHUNK_W = TILE * CHUNK;

/* 高さの 縮尺 */
const H_SCALE = 26;
/* 海面 */
export const SEA = 1.2;

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export class Terrain {
  constructor(seed) {
    this.seed = (seed | 0) || 20260902;
    /* 引きなおしを 減らす ための 覚え（区画 1 つぶん だけ） */
    this._ck = "";
    this._cv = null;
  }

  /** 生の 起伏（0〜1）。高さと 風土の 元。 */
  _raw(wx, wz) {
    const s = this.seed * 0.0001;
    /* ★ 大陸の うねり（2026-09-02 で 広げた）。
       そのまま だと 真ん中に 集まって **海が 1 つも できない**（実測 0%）。
       広げて 端まで 使い、海・浜・高地が 出るように する。 */
    const cont = clamp01(0.5 + fbm(wx * 0.0018 + s, wz * 0.0018 - s, 4) * 1.45);
    /* 山なみ */
    const mt = ridge(wx * 0.0052 + 31.7, wz * 0.0052 - 12.3, 4);
    /* 細かい 起伏 */
    const det = fbm(wx * 0.021, wz * 0.021, 3) * 0.5 + 0.5;
    /* ★ 湿りけ・暖かさ（2026-09-02）。
       ゆらぎを そのまま 0〜1 に すると 真ん中に 集まり、
       雪原・砂漠・沼が **ほとんど 出ない**（実測: 4000 点で 雪 0・砂 0）。
       ・暖かさは **南北**で 決める（南が 暑い・北が 寒い）。
         帯に なるので「歩いて いくと 景色が 変わる」が 生まれる。
       ・湿りけは ゆらぎを 広げて、端まで 使い切る。 */
    const 帯 = 2600;                       /* 気候が 一巡りする 長さ */
    const lat = Math.sin((wz / 帯) * Math.PI);   /* −1〜1 */
    const warm = clamp01(0.5 + lat * 0.42 + (fbm(wx * 0.0024 - 63.1, wz * 0.0024, 3)) * 0.30);
    const wet = clamp01(0.5 + fbm(wx * 0.0031 + 91.2, wz * 0.0031 + 44.8, 3) * 1.30);
    /* ★ 境目の ゆらぎ（2026-09-02）。
       気候は なめらかでも、地面は **2m の ます目**で 1 つの 風土に 決まる。
       その まま だと 雪原と 草原の 境が **定規で 引いた 直線**に なり、
       近くで 見ると 階段に 見えた（実写で 確認）。
       ここで 細かい ゆらぎを 足すと 境が **入り組んだ 指**の 形に なり、
       2 つの 風土が 混ざりながら 移り変わる。
       ★ 高さには 混ぜない。混ぜると 地面が ざらつく。 */
    const j1 = noise2(wx * 0.062 + 7.3, wz * 0.062 - 4.1);
    const j2 = noise2(wx * 0.23 - 18.4, wz * 0.23 + 5.9);
    const ゆ = j1 * 0.052 + j2 * 0.022;
    return { cont, mt, det, wet: clamp01(wet + ゆ), warm: clamp01(warm - ゆ * 0.8), 素wet: wet, 素warm: warm };
  }

  /** その 場所の すべて。{h, biome, B, mountain, wet, warm, water} */
  at(wx, wz) {
    const r = this._raw(wx, wz);
    const mountain = this._mountain(r);
    const h = this._h(r, mountain);
    /* ★ 遺跡と 水晶谷は **気候では 決めない**（2026-09-02）。
       この 2 つは「見つけるもの」なので、まばらな 斑として 置く。
       気候で 決めると どこにでも あって、見つけた 意味が 消える。 */
    let biome = pickBiome(r.cont, r.wet, r.warm, mountain);
    if (h >= SEA) {
      const w1 = worley(wx / 1100, wz / 1100, this.seed ^ 0x1d3c);
      if (w1.d1 < 0.13) biome = "ruin";
      else {
        const w2 = worley(wx / 1500, wz / 1500, this.seed ^ 0x77aa);
        if (w2.d1 < 0.11) biome = "crystal";
      }
    }
    return {
      h, biome, B: BIOMES[biome],
      mountain, wet: r.wet, warm: r.warm,
      water: h < SEA
    };
  }

  _mountain(r) { return r.mt * Math.max(0, r.cont - 0.30) * 2.4; }
  _h(r, mountain) {
    /* 海は 深く、陸は 高く。cont を 曲げて 岸を はっきり させる。 */
    const land = r.cont < 0.42
      ? (r.cont / 0.42) * 0.30                       /* 海の底 → 岸 */
      : 0.30 + ((r.cont - 0.42) / 0.58) * 0.70;      /* 岸 → 内陸 */
    let h = (land * 0.86 + mountain * 0.90 + r.det * 0.09) * H_SCALE - 5.2;
    if (h < SEA + 2.4 && h > SEA - 6) h = SEA + (h - SEA) * 0.5;   /* 浜は なだらかに */
    return h;
  }

  /** 高さだけ 欲しい とき（当たり判定で 毎フレーム 呼ばれる） */
  height(wx, wz) {
    const r = this._raw(wx, wz);
    return this._h(r, this._mountain(r));
  }

  /** マスの 高さ（段になる）。地面の 見た目と 当たり判定は これで そろえる。 */
  tileHeight(tx, tz) {
    const wx = tx * TILE, wz = tz * TILE;
    return Math.round(this.height(wx + TILE * 0.5, wz + TILE * 0.5) * 2) / 2;
  }

  /** 拠点や 町が 置ける 平らな ところか。 */
  flatness(wx, wz) {
    const a = this.height(wx - 6, wz), b = this.height(wx + 6, wz);
    const c = this.height(wx, wz - 6), d = this.height(wx, wz + 6);
    const m = (a + b + c + d) / 4;
    return Math.max(Math.abs(a - m), Math.abs(b - m), Math.abs(c - m), Math.abs(d - m));
  }

  /** 町（安全地帯）の 中心か どうか。ボロノイの 芯を 使う。 */
  townAt(wx, wz) {
    const w = worley(wx / 420, wz / 420, this.seed ^ 0x5f3a);
    if (w.d1 > 0.16) return null;
    const cx = (w.cx + hash2(w.cx, w.cy, this.seed ^ 0x5f3a)) * 420;
    const cz = (w.cy + hash2(w.cx, w.cy, (this.seed ^ 0x5f3a) + 7919)) * 420;
    const t = this.at(cx, cz);
    if (t.water) return null;
    return { x: cx, z: cz, id: "town_" + w.cx + "_" + w.cy, biome: t.biome, h: t.h };
  }

  /** その 位置から いちばん 近い 町（無ければ null）。 */
  nearestTown(wx, wz) {
    let best = null, bd = 1e9;
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const t = this.townAt(wx + ox * 420, wz + oz * 420);
        if (!t) continue;
        const d = Math.hypot(t.x - wx, t.z - wz);
        if (d < bd) { bd = d; best = t; }
      }
    }
    return best ? Object.assign({ dist: bd }, best) : null;
  }
}

/** 世界の 名前（種から 決める）。同じ 種なら 同じ 名前。 */
const 冠 = ["しずかな", "はてない", "ふるい", "あおい", "ひかる", "とおい", "めぐる", "つよい", "やさしい", "ねむる"];
const 主 = ["大地", "world", "みち", "地平", "回廊", "ひろば", "うみべ", "たかみ", "はざま", "ゆめ"];
export function worldName(seed) {
  const a = 冠[Math.abs(seed | 0) % 冠.length];
  const b = 主[Math.abs((seed | 0) >> 5) % 主.length];
  return a + b;
}
