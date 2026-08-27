/* ══════════════════════════════════════════════════════════════════════════════
   アプリのアイコンを 1 枚から作り分ける

   ブラウザのタブ・iPhone のホーム画面・Android の切り抜き（maskable）で、
   必要な形がそれぞれ違う。同じ 1 枚をそのまま置くと、必ずどれかが崩れる。

     ・タブ         … 小さい。まわりの余白は邪魔。角は透過にしたい
                      （白いままだと、暗い色のタブで白い四角に見える）
     ・iPhone       … **透過が使えない**（透けた所は黒く塗られる）。必ず不透明にする
     ・Android      … 好きな形に切り抜かれる。外周 20% は削られる前提で、
                      中身を 80% に縮め、まわりを地の色で埋める
     ・共有の絵(OG) … 横長。中央にアイコンを置く

   道具は macOS 標準の sips（変換と拡大縮小）と Node だけ。追加の導入は要らない。
   PNG の書き出しと、余白の切り落とし・角の透過・地色の合成は、この中でやっている。

   使い方:
       node client/assets/icon/make-icons.mjs [元の画像.png]
       （省略時は client/assets/icon/source.png）
   ══════════════════════════════════════════════════════════════════════════════ */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] || join(HERE, "source.png"));
if (!existsSync(SRC)) {
  console.error("✗ 元の画像がありません: " + SRC);
  process.exit(1);
}

/* 地の色。アイコンの枠から実際に拾った紫の平均。
   iPhone と Android で「透けた所」を埋めるのに使う。 */
const BG = [0x9d, 0x91, 0xdc];

const TMP = mkdtempSync(join(tmpdir(), "vqicon-"));
process.on("exit", () => { try { rmSync(TMP, { recursive: true, force: true }); } catch {} });
/* 変換・拡大縮小。おしゃべりな出力は捨てる。 */
const sips = (...args) => execFileSync("/usr/bin/sips", args, { stdio: ["ignore", "ignore", "pipe"] });
/* 問い合わせ（-g）。こちらは返事を読むので、標準出力を受け取る。 */
const sipsGet = (...args) => String(execFileSync("/usr/bin/sips", args, { encoding: "utf8" }));

/* ── BMP を読む（sips が出すのは 24bit・上から下）─────────────────────────── */
function readBmp(path) {
  const b = readFileSync(path);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  let h = b.readInt32LE(22);
  const topDown = h < 0;
  h = Math.abs(h);
  const bpp = b.readUInt16LE(28) / 8;
  const stride = Math.ceil(w * bpp / 4) * 4;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = topDown ? y : (h - 1 - y);
    for (let x = 0; x < w; x++) {
      const i = off + sy * stride + x * bpp;
      const o = (y * w + x) * 4;
      out[o] = b[i + 2]; out[o + 1] = b[i + 1]; out[o + 2] = b[i]; out[o + 3] = 255;
    }
  }
  return { w, h, data: out };
}

/* ── PNG を書く（RGBA・無圧縮フィルタ）───────────────────────────────────── */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(path, { w, h, data }) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                   /* フィルタなし */
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]));
}

/* 元の画像を、指定の大きさの RGBA にして返す（拡大縮小は sips に任せる）。 */
function rasterize(srcPng, side) {
  const bmp = join(TMP, `r${side}.bmp`);
  sips("-s", "format", "bmp", "-Z", String(side), srcPng, "--out", bmp);
  return readBmp(bmp);
}

/* ── まわりの白を透かす ──────────────────────────────────────────────────
   四隅から、ほぼ白のところだけをたどって「外側」を塗り分ける。
   絵の中の白（V と Q）には外からたどり着けないので、そこは残る。 */
function cutBackground(img) {
  const { w, h, data } = img;
  const outside = new Uint8Array(w * h);
  const near = (i) => data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236;
  const stack = [0, w - 1, (h - 1) * w, h * w - 1];
  for (const s of stack) if (near(s * 4)) outside[s] = 1;
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (outside[q] || !near(q * 4)) continue;
      outside[q] = 1; stack.push(q);
    }
  }
  for (let p = 0; p < w * h; p++) if (outside[p]) data[p * 4 + 3] = 0;
  return img;
}

/* ── 透けたところを埋めて不透明にする ────────────────────────────────────
   一色で埋めると、絵のふちが縦にグラデーションしているぶん、
   角のところだけ色が浮いて **枠のように見える**。
   そこで「その行の、絵の左端／右端の色」を横へ伸ばして埋める。
   行ごとに色が変わるので、上から下までのグラデーションにそのままつながる。 */
function flattenEdgeAware(img, fallback = BG) {
  const { w, h, data } = img;
  for (let y = 0; y < h; y++) {
    /* この行で、中身が入っている左端と右端を探す */
    let L = -1, R = -1;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 200) { L = x; break; }
    for (let x = w - 1; x >= 0; x--) if (data[(y * w + x) * 4 + 3] > 200) { R = x; break; }
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const a = data[p + 3] / 255;
      if (a > 0.996) continue;
      let src = fallback;
      if (L >= 0) {
        const q = ((y * w) + (x < L ? L : (x > R ? R : (x - L < R - x ? L : R)))) * 4;
        src = [data[q], data[q + 1], data[q + 2]];
      }
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[p + c] * a + src[c] * (1 - a));
      data[p + 3] = 255;
    }
  }
  return img;
}

/* ── 地の色の板の中央に置く ──────────────────────────────────────────────── */
function centerOn(img, w, h, bg = BG) {
  const out = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    out[p * 4] = bg[0]; out[p * 4 + 1] = bg[1]; out[p * 4 + 2] = bg[2]; out[p * 4 + 3] = 255;
  }
  const ox = Math.round((w - img.w) / 2), oy = Math.round((h - img.h) / 2);
  for (let y = 0; y < img.h; y++) {
    const ty = y + oy; if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < img.w; x++) {
      const tx = x + ox; if (tx < 0 || tx >= w) continue;
      const s = (y * img.w + x) * 4, d = (ty * w + tx) * 4;
      const a = img.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) out[d + c] = Math.round(img.data[s + c] * a + out[d + c] * (1 - a));
    }
  }
  return { w, h, data: out };
}

/* ── 上端だけ、ほんの少し透かす ──────────────────────────────────────────
   角丸の四角をそのまま端まで伸ばすと、上辺が定規で引いたような直線に見える。
   いちばん上の数 % だけ薄くすると、角が丸い他のアイコンと並んだときになじむ。
   透過が使えない用途（iPhone・Android の切り抜き）には **かけない**。 */
function fadeTop(img, ratio = 0.045) {
  const { w, h, data } = img;
  const band = Math.max(1, Math.round(h * ratio));
  for (let y = 0; y < band; y++) {
    /* いちばん上を 62%、帯の下端で 100% に戻す（急に切れない） */
    const k = 0.62 + 0.38 * (y / band);
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      data[p + 3] = Math.round(data[p + 3] * k);
    }
  }
  return img;
}

/* ══ ① 紫の四角そのものの位置を測る ══════════════════════════════════════
   まわりの「ぼかし」と「影」を数えてしまうと、その分だけ小さく切れる。
   ホーム画面では四角の外側が余白として見えるので、**色のついた所だけ**を測る。
   影は灰色（R≒G≒B）なので、彩度で見分けられる。 */
const PROBE = 256;
const probe = rasterize(SRC, PROBE);
let minX = PROBE, minY = PROBE, maxX = -1, maxY = -1;
for (let y = 0; y < PROBE; y++) for (let x = 0; x < PROBE; x++) {
  const i = (y * PROBE + x) * 4;
  const r = probe.data[i], g = probe.data[i + 1], b = probe.data[i + 2];
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat > 16) {                       /* 色がついている＝四角の中 */
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const srcW = Number(sipsGet("-g", "pixelWidth", SRC).match(/pixelWidth:\s*(\d+)/)[1]);
const k = srcW / PROBE;
/* 測った枠を、元の大きさへ戻す。1px ぶん内側に寄せて、ぼかしの縁を拾わない。 */
let cx0 = Math.round(minX * k) + 1, cy0 = Math.round(minY * k) + 1;
let cw = Math.round((maxX - minX + 1) * k) - 2, ch = Math.round((maxY - minY + 1) * k) - 2;
const cs = Math.max(16, Math.min(cw, ch));            /* 正方形にそろえる */
cx0 += Math.round((cw - cs) / 2); cy0 += Math.round((ch - cs) / 2);
console.log(`元の画像 ${srcW}px / 紫の四角 ${cs}px を (${cx0}, ${cy0}) から切り出す`);

/* 切り出しは Node でやる。sips の -c は中央基準しかなく、
   四角が中央からずれている（下に影があるぶん上寄り）と、片側だけ欠ける。 */
const full = rasterize(SRC, srcW);
const sq = new Uint8Array(cs * cs * 4);
for (let y = 0; y < cs; y++) {
  const sy = Math.min(full.h - 1, Math.max(0, cy0 + y));
  for (let x = 0; x < cs; x++) {
    const sx = Math.min(full.w - 1, Math.max(0, cx0 + x));
    const s = (sy * full.w + sx) * 4, d = (y * cs + x) * 4;
    out4(sq, d, full.data, s);
  }
}
function out4(dst, d, src, s) { dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3]; }
const cropped = join(TMP, "square.png");
writePng(cropped, { w: cs, h: cs, data: sq });

/* ══ ② それぞれの用途で書き出す ══════════════════════════════════════════ */
const out = (name, img) => { writePng(join(HERE, name), img); console.log(`  ✓ ${name}  ${img.w}x${img.h}`); };

console.log("書き出し:");
/* タブ用・PWA の通常アイコン
   … 端まで塗る。角の丸みの外側だけ透過にして、暗いタブで白い四角にならないようにする。
     上端だけ、わずかに薄くしてなじませる。 */
for (const s of [16, 32, 48]) out(`favicon-${s}.png`, fadeTop(cutBackground(rasterize(cropped, s))));
for (const s of [192, 512]) out(`pwa-${s}.png`, fadeTop(cutBackground(rasterize(cropped, s))));

/* iPhone のホーム画面
   … 透過は使えない（透けた所は黒く塗られる）。端まで不透明にして、
     角の丸みの外側はその行のふちの色で埋める。丸めるのは iOS の仕事。 */
out("apple-touch-icon-180.png", flattenEdgeAware(cutBackground(rasterize(cropped, 180))));

/* Android の切り抜き … 好きな形に切られる。端まで不透明で塗る。 */
for (const s of [192, 512]) {
  out(`maskable-${s}.png`, flattenEdgeAware(cutBackground(rasterize(cropped, s))));
}

/* 共有したときの絵 */
out("og-1200x630.png", centerOn(cutBackground(rasterize(cropped, 460)), 1200, 630));

/* favicon.ico … 中身は 32px の PNG。いまのブラウザはこれを読める。
   本物の ICO 形式は、そのためだけに道具を増やす価値がないので作らない。 */
writeFileSync(join(HERE, "favicon.ico"), readFileSync(join(HERE, "favicon-32.png")));
console.log("  ✓ favicon.ico  32x32（PNG 中身）");

console.log("\nできました → client/assets/icon/");
console.log("確認: node vqicon.cjs");
