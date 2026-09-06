/* ══════════════════════════════════════════════════════════════════════════
   空と 光。**時刻**と **風土**で 変わる。

   ★ ここが 見た目の 8 割。形を 増やすより、光と 霧を 合わせる ほうが
     ずっと 効く（しかも ただ）。
   ★ 1 日の 流れ: 夜 → 明けがた → 朝 → 昼 → 夕 → 宵 → 夜。
   ══════════════════════════════════════════════════════════════════════════ */
import { BIOMES } from "../world/biome.js";

/* 時刻ごとの 味つけ。{空の倍率, 日の色, 強さ, 霧の倍率, 星} */
const 刻 = [
  { t: 0,  名: "真夜中", sky: [0.10, 0.12, 0.26], sun: [0.42, 0.50, 0.86], amb: 0.30, fog: [0.10, 0.12, 0.24], star: 1.0, dir: [0.30, 0.42, 0.34] },
  { t: 4.5,名: "夜明け前", sky: [0.20, 0.20, 0.38], sun: [0.66, 0.56, 0.86], amb: 0.38, fog: [0.22, 0.22, 0.36], star: 0.55, dir: [0.62, 0.18, 0.30] },
  { t: 6,  名: "朝",   sky: [0.62, 0.52, 0.62], sun: [1.00, 0.72, 0.48], amb: 0.60, fog: [0.78, 0.62, 0.56], star: 0.10, dir: [0.86, 0.16, 0.22] },
  { t: 9,  名: "午前", sky: [0.86, 0.92, 1.00], sun: [1.00, 0.96, 0.88], amb: 0.86, fog: [0.86, 0.90, 0.96], star: 0, dir: [0.48, 0.72, 0.34] },
  { t: 13, 名: "真昼", sky: [1.00, 1.00, 1.00], sun: [1.00, 0.99, 0.94], amb: 1.00, fog: [0.94, 0.96, 1.00], star: 0, dir: [0.16, 0.96, 0.20] },
  { t: 16.5,名: "午後", sky: [0.94, 0.92, 0.90], sun: [1.00, 0.94, 0.80], amb: 0.90, fog: [0.92, 0.90, 0.90], star: 0, dir: [-0.46, 0.70, 0.30] },
  { t: 18.5,名: "夕",  sky: [0.86, 0.52, 0.42], sun: [1.00, 0.58, 0.34], amb: 0.62, fog: [0.86, 0.56, 0.44], star: 0.10, dir: [-0.86, 0.16, 0.20] },
  { t: 20,  名: "宵",  sky: [0.34, 0.26, 0.46], sun: [0.74, 0.48, 0.72], amb: 0.42, fog: [0.34, 0.28, 0.44], star: 0.60, dir: [-0.60, 0.16, 0.28] },
  { t: 22,  名: "夜",  sky: [0.14, 0.15, 0.30], sun: [0.46, 0.54, 0.90], amb: 0.32, fog: [0.13, 0.15, 0.28], star: 0.95, dir: [-0.28, 0.44, 0.32] },
  { t: 24,  名: "真夜中", sky: [0.10, 0.12, 0.26], sun: [0.42, 0.50, 0.86], amb: 0.30, fog: [0.10, 0.12, 0.24], star: 1.0, dir: [0.30, 0.42, 0.34] }
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerp3(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t);
  return out;
}
function mul3(a, b, out) { out[0] = a[0] * b[0]; out[1] = a[1] * b[1]; out[2] = a[2] * b[2]; return out; }

export function 時刻の味(t) {
  const x = ((t % 24) + 24) % 24;
  let i = 0;
  while (i < 刻.length - 2 && 刻[i + 1].t <= x) i++;
  const a = 刻[i], b = 刻[i + 1];
  const u = (x - a.t) / Math.max(0.001, b.t - a.t);
  return {
    名: u < 0.5 ? a.名 : b.名,
    sky: lerp3(a.sky, b.sky, u, [0, 0, 0]),
    sun: lerp3(a.sun, b.sun, u, [0, 0, 0]),
    amb: lerp(a.amb, b.amb, u),
    fog: lerp3(a.fog, b.fog, u, [0, 0, 0]),
    star: lerp(a.star, b.star, u),
    dir: lerp3(a.dir, b.dir, u, [0, 0, 0])
  };
}

export class Sky {
  constructor(R) {
    this.R = R;
    this._tmp = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.last = "";
  }

  /** 風土と 時刻から 空・光・霧を 決める。 */
  apply(biomeId, time, settings) {
    const R = this.R;
    const B = BIOMES[biomeId] || BIOMES.meadow;
    const k = 時刻の味(time);
    const T = this._tmp;
    R.sky.top = mul3(B.空.top, k.sky, T[0]).slice();
    R.sky.horizon = mul3(B.空.horizon, k.sky, T[1]).slice();
    R.sky.ground = mul3(B.空.ground, k.sky, T[2]).slice();
    R.sky.sun = mul3(B.空.sun, k.sun, T[3]).slice();
    R.sky.stars = k.star;
    R.sky.starTint = [0.86, 0.90, 1.0];
    /* ★ 光の 向きは「**光源 → 物**」（下向き）。
       日の 向き（上向き）を そのまま 入れると 陰が 裏返る。 */
    const L = Math.hypot(k.dir[0], k.dir[1], k.dir[2]) || 1;
    R.light.dir = [-k.dir[0] / L, -k.dir[1] / L, -k.dir[2] / L];
    R.light.color = [k.sun[0] * (0.55 + k.amb * 0.75),
                     k.sun[1] * (0.55 + k.amb * 0.75),
                     k.sun[2] * (0.55 + k.amb * 0.75)];
    /* 環境光は 上と 下で 分ける（空の 色と 地面の 照り返し）。
       これが あるだけで 平らな 面でも 立体に 見える。 */
    R.ambTop = [R.sky.horizon[0] * 0.46 + 0.05, R.sky.horizon[1] * 0.46 + 0.05, R.sky.horizon[2] * 0.50 + 0.06];
    R.ambBottom = [B.col[0] * 0.30 * (0.35 + k.amb), B.col[1] * 0.30 * (0.35 + k.amb), B.col[2] * 0.30 * (0.35 + k.amb)];
    /* 霧（風土の 色と 時刻を 混ぜる） */
    const f = mul3(B.霧, k.fog, [0, 0, 0]);
    R.fog.color = f;
    const dd = (settings && settings.drawDistance) || 140;
    /* 夜と 沼は 霧を 濃く（狭く 見せて、その ぶん 軽くも する） */
    const 濃 = biomeId === "swamp" ? 0.62 : (k.star > 0.5 ? 0.74 : 1);
    R.fog.near = dd * 0.34 * 濃;
    R.fog.far = dd * 1.02 * 濃;
    this.last = k.名;
    return k;
  }
}
