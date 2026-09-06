/* ══════════════════════════════════════════════════════════════════════════
   肌（テクスチャ）を **その場で 作る**。1 バイトも 落とさない。

   Rinty さん（2026-09-02）:「テクスチャが 安っぽすぎる。もっと リアルに」

   ★ なぜ 絵を 落とさないか:
     細い 回線が いちばんの 敵（実測 1.2Mbps）。木の 皮・岩・砂 …と
     絵を 用意すると すぐ 数 MB に なり、**開くまでが 遅く なる**。
     ここでは canvas に **数式で 描いて** GPU へ 1 枚 送る。
     512×512 の 1 枚（＝ 1MB の GPU 記憶）で 12 種類ぶん。落とすのは 0 バイト。

   ★ 作りは **1 枚の 板に 12 マス**（アトラス）。
     形ごとに 「何マス目か」を 渡すだけで 肌が 変わる。
     描く 回数は 増えない（同じ 板を 使い回す）。

   ★ 中身は 「明るさ」と 「でこぼこ」の 2 つ。
     RGB＝色のむら、A＝でこぼこの 高さ。
     でこぼこは 影の 計算に 使う（法線を ずらす）ので、
     **平らな 面でも 手ざわりが 出る**。
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 数式の 部品（canvas に 描く ための 素） ───────────────────────── */
function hash(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
/* つなぎ目の 出ない ゆらぎ（周期 p で 折り返す） */
function 巡るfbm(x, y, p, oct, s) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    const xx = ((x * f) % (p * f) + p * f) % (p * f);
    const yy = ((y * f) % (p * f) + p * f) % (p * f);
    sum += amp * noise(xx, yy, s + i * 71);
    amp *= 0.5; f *= 2;
  }
  return sum;
}
function worley(x, y, p, s) {
  let best = 9;
  const xi = Math.floor(x), yi = Math.floor(y);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ((xi + i) % p + p) % p, cy = ((yi + j) % p + p) % p;
    const px = xi + i + hash(cx, cy, s), py = yi + j + hash(cx, cy, s + 13);
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const clamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

/* ══ 12 種類の 肌 ══════════════════════════════════════════════════
   戻り値は [色のむら 0〜1, でこぼこ 0〜1]。
   ★ どれも **平均が 0.5 前後**に なるように 作る。
     そうしないと、肌を 掛けた とたん 全体が 暗く（明るく）なる。 */
const 肌 = [
  /* 0 なし（まっさら）*/
  function (u, v) { return [0.5, 0.5]; },
  /* 1 木の 皮 … 縦の 筋 ＋ 割れ目 */
  function (u, v) {
    const 筋 = 巡るfbm(u * 3.5, v * 26, 32, 4, 11);
    const 割 = Math.abs(巡るfbm(u * 5, v * 9, 32, 3, 37) - 0.5) * 2;
    const c = 0.5 + (筋 - 0.5) * 0.55 - (1 - 割) * 0.20;
    return [c, clamp(0.5 + (筋 - 0.5) * 0.9 - (1 - 割) * 0.5)];
  },
  /* 2 岩 … 粒と ひび。**ひびは 細かく**（大きい ひびは 並んで 見える） */
  function (u, v) {
    const 粒 = 巡るfbm(u * 34, v * 34, 64, 3, 3);
    const w = worley(u * 16, v * 16, 16, 5);
    const ひび = clamp(1 - Math.abs(w - 0.22) * 9);
    const c = 0.5 + (粒 - 0.5) * 0.42 - ひび * 0.12;
    return [c, clamp(0.5 + (粒 - 0.5) * 0.8 - ひび * 0.4)];
  },
  /* 3 草 … **細かい 粒だけ**（2026-09-02 に 描き直し）
     ★ 前は 低い ゆらぎ（u*4）を 混ぜて いた。それが 1〜2m の 塊に なり、
       地面に **同じ 輪が 並んで 見えた**（実写で 確認）。
       地面は 広く 見える ので、低い ゆらぎは 1 つも 入れない。
       高い 周波数だけ なら、遠くでは 溶けて 近くでは 手ざわりに なる。 */
  function (u, v) {
    const 粒 = 巡るfbm(u * 64, v * 64, 64, 2, 19);
    const 筋 = 巡るfbm(u * 30, v * 96, 96, 2, 23);
    const c = 0.5 + (粒 - 0.5) * 0.30 + (筋 - 0.5) * 0.26;
    return [c, clamp(0.5 + (粒 - 0.5) * 0.5 + (筋 - 0.5) * 0.4)];
  },
  /* 4 砂 … 細かい 粒だけ（風紋は 低い 周波数なので 外した） */
  function (u, v) {
    const 粒 = 巡るfbm(u * 72, v * 72, 72, 2, 29);
    const 細 = 巡るfbm(u * 128, v * 128, 128, 1, 31);
    const c = 0.5 + (粒 - 0.5) * 0.22 + (細 - 0.5) * 0.18;
    return [c, clamp(0.5 + (粒 - 0.5) * 0.45 + (細 - 0.5) * 0.35)];
  },
  /* 5 雪 … つぶつぶの きらめき（面の ゆらぎも 細かく） */
  function (u, v) {
    const 面 = 巡るfbm(u * 40, v * 40, 64, 2, 41);
    const きら = hash(Math.floor(u * 512), Math.floor(v * 512), 43) > 0.988 ? 1 : 0;
    const c = 0.5 + (面 - 0.5) * 0.18 + きら * 0.45;
    return [clamp(c), clamp(0.5 + (面 - 0.5) * 0.5)];
  },
  /* 6 金属 … 磨いた 筋 */
  function (u, v) {
    const 筋 = 巡るfbm(u * 90, v * 2.5, 128, 2, 53);
    const 曇 = 巡るfbm(u * 6, v * 6, 8, 3, 59);
    const c = 0.5 + (筋 - 0.5) * 0.20 + (曇 - 0.5) * 0.12;
    return [c, clamp(0.5 + (筋 - 0.5) * 0.28)];
  },
  /* 7 葉 … 葉脈のような 分かれ */
  function (u, v) {
    const 脈 = Math.abs(巡るfbm(u * 7, v * 7, 16, 4, 61) - 0.5) * 2;
    const 粒 = 巡るfbm(u * 26, v * 26, 32, 2, 67);
    const c = 0.5 + (1 - 脈) * 0.26 + (粒 - 0.5) * 0.22;
    return [clamp(c), clamp(0.5 + (1 - 脈) * 0.42 + (粒 - 0.5) * 0.3)];
  },
  /* 8 土 … 細かい でこぼこ ＋ 小さい 石つぶ */
  function (u, v) {
    const 地 = 巡るfbm(u * 44, v * 44, 64, 3, 71);
    const 石 = worley(u * 30, v * 30, 30, 73);
    const c = 0.5 + (地 - 0.5) * 0.36 + (石 < 0.10 ? 0.10 : 0);
    return [clamp(c), clamp(0.5 + (地 - 0.5) * 0.7 + (石 < 0.10 ? 0.22 : 0))];
  },
  /* 9 布 … 織り目 */
  function (u, v) {
    const 織 = (Math.sin(u * 220) * Math.sin(v * 220)) * 0.5 + 0.5;
    const 皺 = 巡るfbm(u * 5, v * 5, 8, 3, 79);
    const c = 0.5 + (織 - 0.5) * 0.14 + (皺 - 0.5) * 0.24;
    return [clamp(c), clamp(0.5 + (織 - 0.5) * 0.5 + (皺 - 0.5) * 0.4)];
  },
  /* 10 水晶 … 割れた 面 */
  function (u, v) {
    const w = worley(u * 5, v * 5, 5, 83);
    const 面 = clamp(w * 1.6);
    const c = 0.5 + (面 - 0.5) * 0.40;
    return [clamp(c), clamp(0.5 + (面 - 0.5) * 0.85)];
  },
  /* 11 木の 板 … 年輪と 節 */
  function (u, v) {
    const 年 = Math.sin((v * 7 + 巡るfbm(u * 2, v * 2, 4, 2, 89) * 3) * Math.PI * 2) * 0.5 + 0.5;
    const 節 = worley(u * 3, v * 3, 3, 97);
    const c = 0.5 + (年 - 0.5) * 0.30 - (節 < 0.12 ? 0.22 : 0);
    return [clamp(c), clamp(0.5 + (年 - 0.5) * 0.45 - (節 < 0.12 ? 0.4 : 0))];
  }
];

export const 肌の数 = 肌.length;
export const 肌名 = ["なし", "木の皮", "岩", "草", "砂", "雪", "金属", "葉", "土", "布", "水晶", "板"];

/**
 * アトラス（1 枚に 全部）を 作る。
 * @param {number} 一辺 1 マスの 大きさ（128 / 192 / 256）
 * @returns {{data:Uint8Array, w:number, h:number, 列:number, 行:number, マス:number}}
 */
export function 肌を作る(一辺) {
  const S = Math.max(32, 一辺 | 0);
  const 列 = 4, 行 = Math.ceil(肌.length / 列);
  const W = S * 列, H = S * 行;
  const out = new Uint8Array(W * H * 4);
  const 色 = new Float32Array(S * S), 凹 = new Float32Array(S * S);
  for (let k = 0; k < 肌.length; k++) {
    const ox = (k % 列) * S, oy = Math.floor(k / 列) * S;
    const f = 肌[k];
    let 和c = 0, 和b = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = f(x / S, y / S);
        const j = y * S + x;
        色[j] = r[0]; 凹[j] = r[1];
        和c += r[0]; 和b += r[1];
      }
    }
    /* ★★ マスごとに **平均を 0.5 に そろえる**（2026-09-02・実測で 必要と 分かった）★★
       肌は 色に **掛ける**ので、平均が 0.27 の 肌を 使うと その 形だけ
       45% 暗く なる（木の皮が 実際 そうだった）。
       ここで そろえて おけば、肌を 変えても **明るさは 変わらず 手ざわりだけ 変わる**。
       ちらしの 幅（コントラスト）は そのまま 残す。 */
    const 平c = 和c / (S * S) || 0.5, 平b = 和b / (S * S) || 0.5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const j = y * S + x;
        const c = clamp(0.5 + (色[j] - 平c));
        const b = clamp(0.5 + (凹[j] - 平b));
        const i = ((oy + y) * W + (ox + x)) * 4;
        const cc = Math.round(c * 255);
        out[i] = cc; out[i + 1] = cc; out[i + 2] = cc;
        out[i + 3] = Math.round(b * 255);
      }
    }
  }
  return { data: out, w: W, h: H, 列, 行, マス: S };
}
