/* ══════════════════════════════════════════════════════════════════════════
   種から 決まる ゆらぎ。

   ★ Math.random は 使わない。**同じ 種なら いつでも 同じ 世界**に なる こと。
     そうで ないと、区画を 出し入れした とき 地面の 高さが 変わって
     足元が 抜ける。保存も できない。
   ★ 速さが 命。1 区画で 数千回 呼ばれる。表引きの 勾配ノイズに する。
   ══════════════════════════════════════════════════════════════════════════ */

/** 32bit の 混ぜ（種づくりに 使う） */
export function hash32(x) {
  x |= 0; x = (x + 0x7ed55d16 + (x << 12)) | 0;
  x = (x ^ 0xc761c23c ^ (x >>> 19)) | 0;
  x = (x + 0x165667b1 + (x << 5)) | 0;
  x = ((x + 0xd3a2646c) ^ (x << 9)) | 0;
  x = (x + 0xfd7046c5 + (x << 3)) | 0;
  x = (x ^ 0xb55a4f09 ^ (x >>> 16)) | 0;
  return x;
}

/** 2 つの 整数から 0〜1。位置ごとの 決め打ちに 使う。 */
export function hash2(x, y, seed) {
  let h = hash32((x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1274126177);
  h = hash32(h);
  return ((h >>> 0) % 100000) / 100000;
}

/** 3 つから 0〜1。 */
export function hash3(x, y, z, seed) {
  let h = hash32((x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647 + (seed | 0) * 1274126177);
  h = hash32(h);
  return ((h >>> 0) % 100000) / 100000;
}

/** 決め打ちの 乱数器（列を 作りたい ときに） */
export function rng(seed) {
  let s = (seed | 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0xffffff;
  };
}

/* ── 勾配ノイズ ─────────────────────────────────────────────────────
   256 個の 向きを 先に 作って おき、位置から 引く。
   毎回 sin/cos を 呼ぶより ずっと 速い。 */
const PERM = new Uint8Array(512);
const GX = new Float32Array(256);
const GY = new Float32Array(256);
(function build() {
  const r = rng(20260902);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    GX[i] = Math.cos(a); GY[i] = Math.sin(a);
  }
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/** −1〜1 の なめらかな ゆらぎ。 */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const g00 = PERM[X + PERM[Y]];
  const g10 = PERM[X + 1 + PERM[Y]];
  const g01 = PERM[X + PERM[Y + 1]];
  const g11 = PERM[X + 1 + PERM[Y + 1]];
  const d00 = GX[g00] * xf + GY[g00] * yf;
  const d10 = GX[g10] * (xf - 1) + GY[g10] * yf;
  const d01 = GX[g01] * xf + GY[g01] * (yf - 1);
  const d11 = GX[g11] * (xf - 1) + GY[g11] * (yf - 1);
  const u = fade(xf), v = fade(yf);
  const a = d00 + u * (d10 - d00);
  const b = d01 + u * (d11 - d01);
  return a + v * (b - a);
}

/** 重ねた ゆらぎ。oct を 増やすと 細かく なるが その ぶん 遅い。 */
export function fbm(x, y, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise2(x * f, y * f);
    norm += a;
    a *= gain; f *= lac;
  }
  return sum / (norm || 1);
}

/** 尾根（山の 稜線）。谷が V 字に なり、山らしく なる。 */
export function ridge(x, y, oct = 4) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise2(x * f, y * f));
    sum += a * n * n;
    norm += a;
    a *= 0.5; f *= 2;
  }
  return sum / (norm || 1);
}

/** ボロノイ（区画わけ）。戻り: {d1, d2, cx, cy}。町や 洞窟の 種に 使う。 */
export function worley(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = xi + ox, gy = yi + oy;
      const px = gx + hash2(gx, gy, seed);
      const py = gy + hash2(gx, gy, seed + 7919);
      const dx = px - x, dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; cx = gx; cy = gy; }
      else if (d < d2) { d2 = d; }
    }
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), cx, cy };
}
