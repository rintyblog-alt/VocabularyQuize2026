/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/gif.test.mjs — GIF エンコーダを Node だけで確かめる（契約書 §8）

   ★ 何をする所か
     export/gif.js の
       ①LZW（既知の入力 → 手で計算した既知のバイト列）
       ②中央値分割（n 色以下・全画素に最近色が在る）
       ③GIF 全体（先頭 6 バイトが GIF89a・末尾が 0x3B・構造・画素の復元）
     を見る。

   ★ なぜこの形か
     ・GIF が壊れていても、ブラウザは «壊れた画像» としか言わない。
       どのバイトがおかしいかを言えるのは この試験だけ。
     ・**復号器は試験側に別に書く**（mux-webm.test.mjs と同じ作法）。
       書き手の解釈で書いた物を同じ解釈で読み直しても丸しか付かない。
       ここでは GIF89a の仕様だけを見て素朴に読み、画素まで戻して比べる。

   ★ 触るときの注意
     ・`cd /home/user/VocabularyQuize2026 && node --test studio/tests/gif.test.mjs`
     ・乱数は「種を固定した自前の線形合同」だけ使う（毎回同じ絵になる）。
   ══════════════════════════════════════════════════════════════════════════ */

import test from "node:test";
import assert from "node:assert/strict";

import createDefault, {
  createGIFEncoder, exportGif,
  medianCut, nearestColor, colorHistogram, createPaletteMapper,
  lzwEncode, lzwBlocks, subBlocks, quantizeFrame, diffRect,
  gifHeaderBytes, graphicControlExtBytes, netscapeLoopExtBytes, imageDescriptorBytes,
  flattenPalette, paletteBits, concatBytes,
  GIF_SIGNATURE, GIF_TRAILER, MAX_COLORS,
} from "../src/export/gif.js";

/* ── 小道具 ────────────────────────────────────────────────────── */

const hex = (u8) => Array.from(u8).map((b) => b.toString(16).padStart(2, "0")).join(" ");
function eqBytes(got, want, msg) {
  assert.deepEqual(Array.from(got), want, `${msg || "バイト列"} / 実際は [${hex(got)}]`);
}
const asciiOf = (u8, from, len) => String.fromCharCode(...Array.from(u8.subarray(from, from + len)));

/** 種を固定した擬似乱数（毎回同じ絵を作るため） */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** 縞・円・雑音の混ざった RGBA を作る（色数を指定できる） */
function makeFrame(w, h, seed, shift = 0) {
  const r = rng(seed);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.hypot(x - w / 2 - shift, y - h / 2);
      data[i] = (x * 4 + shift * 8) & 0xff;
      data[i + 1] = (y * 6) & 0xff;
      data[i + 2] = d < w / 3 ? 220 : Math.floor(r() * 64);
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** 単色で塗った RGBA */
function solidFrame(w, h, rgb, alpha = 255) {
  const data = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    data[p * 4] = rgb[0]; data[p * 4 + 1] = rgb[1]; data[p * 4 + 2] = rgb[2]; data[p * 4 + 3] = alpha;
  }
  return { width: w, height: h, data };
}

/* ── 試験側の LZW 復号器（書き手とは別に書く）──────────────────── */

function lzwDecode(bytes, minCodeSize, expectMax) {
  const clear = 1 << minCodeSize, end = clear + 1;
  let codeSize = minCodeSize + 1;
  let table = [];
  const resetTable = () => {
    table = [];
    for (let i = 0; i < clear; i++) table.push([i]);
    table.push(null); table.push(null);   // clear / end の席
    codeSize = minCodeSize + 1;
  };
  resetTable();
  const out = [];
  let bitPos = 0, prev = null;
  const read = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = bytes[(bitPos >> 3)];
      if (byte === undefined) return -1;
      v |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return v;
  };
  for (let guard = 0; guard < (expectMax || 1 << 22); guard++) {
    const code = read();
    if (code < 0) throw new Error("LZW: ビットが足りません");
    if (code === clear) { resetTable(); prev = null; continue; }
    if (code === end) return out;
    let entry;
    if (code < table.length && table[code]) entry = table[code];
    else if (prev !== null) entry = table[prev].concat([table[prev][0]]);
    else throw new Error(`LZW: 未知の符号 ${code}`);
    for (const v of entry) out.push(v);
    if (prev !== null) {
      table.push(table[prev].concat([entry[0]]));
      if (table.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = code;
  }
  throw new Error("LZW: 終端が来ません");
}

/* ── 試験側の GIF 読み器（素朴に・仕様どおりに読む）────────────── */

function readGif(b) {
  assert.equal(asciiOf(b, 0, 6), "GIF89a", "先頭は GIF89a");
  const u16 = (at) => b[at] | (b[at + 1] << 8);
  const width = u16(6), height = u16(8);
  const packed = b[10];
  const gctBits = (packed & 7) + 1;
  let p = 13;
  let gct = null;
  if (packed & 0x80) {
    const n = 1 << gctBits;
    gct = [];
    for (let i = 0; i < n; i++) gct.push([b[p + i * 3], b[p + i * 3 + 1], b[p + i * 3 + 2]]);
    p += n * 3;
  }
  const frames = [];
  const app = [];
  let gce = null;
  for (;;) {
    const marker = b[p];
    if (marker === GIF_TRAILER) { p++; break; }
    if (marker === 0x21) {
      const label = b[p + 1];
      if (label === 0xf9) {
        assert.equal(b[p + 2], 4, "画像制御拡張の大きさは 4");
        gce = {
          disposal: (b[p + 3] >> 2) & 7,
          transparent: !!(b[p + 3] & 1),
          delayCs: u16(p + 4),
          index: b[p + 6],
        };
        assert.equal(b[p + 7], 0, "画像制御拡張の終端は 0");
        p += 8;
      } else if (label === 0xff) {
        const n = b[p + 2];
        const name = asciiOf(b, p + 3, n);
        p += 3 + n;
        const sub = [];
        while (b[p]) { const len = b[p]; sub.push(...Array.from(b.subarray(p + 1, p + 1 + len))); p += 1 + len; }
        p++;
        app.push({ name, data: sub });
      } else {
        // 知らない拡張は飛ばす
        p += 2;
        while (b[p]) p += 1 + b[p];
        p++;
      }
      continue;
    }
    assert.equal(marker, 0x2c, `画像記述子が来るはず（実際は 0x${(marker || 0).toString(16)} at ${p}）`);
    const left = u16(p + 1), top = u16(p + 3), w = u16(p + 5), h = u16(p + 7);
    const ipacked = b[p + 9];
    p += 10;
    let lct = null;
    if (ipacked & 0x80) {
      const n = 1 << ((ipacked & 7) + 1);
      lct = [];
      for (let i = 0; i < n; i++) lct.push([b[p + i * 3], b[p + i * 3 + 1], b[p + i * 3 + 2]]);
      p += n * 3;
    }
    const minCodeSize = b[p++];
    const data = [];
    while (b[p]) { const len = b[p]; data.push(...Array.from(b.subarray(p + 1, p + 1 + len))); p += 1 + len; }
    p++;
    const indices = lzwDecode(new Uint8Array(data), minCodeSize, w * h + 64);
    assert.equal(indices.length, w * h, `復号した画素数（${left},${top} の ${w}×${h}）`);
    frames.push({ left, top, w, h, minCodeSize, indices, gce, lct });
    gce = null;
  }
  assert.equal(p, b.length, "末尾 0x3B の後に余分なバイトが無い");
  return { width, height, gct, frames, app };
}

/** 差分フレームを重ねて «その時見えている絵» を作る（廃棄方法 1 前提） */
function composite(gif) {
  const canvas = new Uint8Array(gif.width * gif.height).fill(0);
  const shots = [];
  for (const f of gif.frames) {
    assert.equal(f.gce && f.gce.disposal, 1, "廃棄方法は 1（そのまま残す）");
    assert.equal(f.gce.transparent, false, "透明色は使わない（契約書 §11-4）");
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        canvas[(f.top + y) * gif.width + (f.left + x)] = f.indices[y * f.w + x];
      }
    }
    shots.push(canvas.slice());
  }
  return shots;
}

/* ══ 1. LZW ═══════════════════════════════════════════════════════ */

test("lzwEncode: 手で計算した既知の入力 → 既知のバイト列", () => {
  /* minCodeSize=2 → clear=4 end=5 最初の空き=6 符号長=3。
     入力 [1,1,1,1,1,2] の符号は
       clear(4) 1 6 6 2 end(5)
     で、符号長は 4 つ目を出した «後» に 4bit へ上がるので
       4@3 1@3 6@3 6@3 2@4 5@4 = 20bit → 3 バイト。
     LSB 詰めで 0x8C 0x2D 0x05。 */
  eqBytes(lzwEncode([1, 1, 1, 1, 1, 2], 2), [0x8c, 0x2d, 0x05], "LZW の既知出力");
});

test("lzwEncode: 空と 1 個（clear と end だけは必ず出る）", () => {
  // clear(4)@3 + end(5)@3 = 0b101_100 = 0x2C（6bit を LSB 詰め）
  eqBytes(lzwEncode([], 2), [0x2c], "空の入力");
  // clear(4)@3 + 3@3 + end(5)@3 = 9bit → 0x5C 0x01
  eqBytes(lzwEncode([3], 2), [0x5c, 0x01], "1 個の入力");
  assert.deepEqual(lzwDecode(lzwEncode([], 2), 2, 8), [], "空は空に戻る");
  assert.deepEqual(lzwDecode(lzwEncode([3], 2), 2, 8), [3], "1 個は 1 個に戻る");
});

test("lzwEncode: 復号すると元に戻る（符号長の上げ方が復号器と揃っている）", () => {
  const r = rng(7);
  for (const [min, colors, len] of [[2, 4, 500], [4, 16, 3000], [8, 256, 20000]]) {
    const src = new Uint8Array(len);
    for (let i = 0; i < len; i++) src[i] = Math.floor(r() * colors);
    const back = lzwDecode(lzwEncode(src, min), min, len + 64);
    assert.deepEqual(back, Array.from(src), `min=${min} colors=${colors} の往復`);
  }
});

test("lzwEncode: 辞書が満杯になる長さでも壊れない（4096 で clear を入れ直す）", () => {
  // 乱数だと辞書が伸びにくいので «伸び続ける» 並びを作る
  const len = 120000;
  const src = new Uint8Array(len);
  const r = rng(11);
  for (let i = 0; i < len; i++) src[i] = Math.floor(r() * 256);
  const bytes = lzwEncode(src, 8);
  assert.deepEqual(lzwDecode(bytes, 8, len + 4096), Array.from(src), "4096 を越えても往復する");
});

test("subBlocks: 255 バイトごとに割って 0 で終える", () => {
  eqBytes(subBlocks(new Uint8Array(0)), [0], "空は終端だけ");
  eqBytes(subBlocks(new Uint8Array([1, 2, 3])), [3, 1, 2, 3, 0], "3 バイト");
  const big = subBlocks(new Uint8Array(300).fill(9));
  assert.equal(big[0], 255, "1 つ目は 255 バイト");
  assert.equal(big[256], 45, "2 つ目は 45 バイト");
  assert.equal(big[big.length - 1], 0, "終端は 0");
  assert.equal(big.length, 300 + 2 + 1, "長さ = 中身 + 個数の 2 バイト + 終端");
});

test("lzwBlocks: 先頭に最小符号長が付く", () => {
  const b = lzwBlocks([1, 1, 1, 1, 1, 2], 2);
  assert.equal(b[0], 2, "最小符号長");
  assert.equal(b[1], 3, "小ブロックの長さ");
  eqBytes(b.subarray(2, 5), [0x8c, 0x2d, 0x05], "中身は lzwEncode と同じ");
  assert.equal(b[b.length - 1], 0, "終端");
});

/* ══ 2. 量子化（中央値分割）════════════════════════════════════════ */

test("colorHistogram: 色ごとの数を数える（平らな RGB でも RGBA でも）", () => {
  const h1 = colorHistogram([10, 20, 30, 10, 20, 30, 1, 2, 3], { stride: 3 });
  assert.equal(h1.keys.length, 2, "2 色");
  assert.equal(h1.counts[h1.keys.indexOf((10 << 16) | (20 << 8) | 30)], 2, "同じ色は数が増える");
  const h2 = colorHistogram(new Uint8Array([9, 9, 9, 255, 9, 9, 9, 255]), { stride: 4 });
  assert.equal(h2.keys.length, 1, "RGBA の α は数えない");
});

test("medianCut: n 色以下・決定的・全画素に最近色が在る", () => {
  const f = makeFrame(48, 32, 3);
  const pal = medianCut(f.data, 32, { stride: 4, step: 1 });
  assert.ok(pal.length > 1 && pal.length <= 32, `色数は 1..32（実際 ${pal.length}）`);
  for (const c of pal) {
    assert.equal(c.length, 3, "[r,g,b] の 3 つ組");
    for (const v of c) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `0..255 の整数（${v}）`);
  }
  // 決定的（同じ入力なら同じパレット）
  assert.deepEqual(medianCut(f.data, 32, { stride: 4, step: 1 }), pal, "2 回呼んでも同じ");

  // 全画素に «最近色» が在る（= nearestColor が必ず範囲内の添字を返す）
  const mapper = createPaletteMapper(pal);
  let worst = 0;
  for (let p = 0; p < 48 * 32; p++) {
    const i = p * 4;
    const idx = mapper.index(f.data[i], f.data[i + 1], f.data[i + 2]);
    assert.ok(idx >= 0 && idx < pal.length, "添字がパレットの中");
    const c = pal[idx];
    const d = Math.hypot(f.data[i] - c[0], f.data[i + 1] - c[1], f.data[i + 2] - c[2]);
    if (d > worst) worst = d;
  }
  assert.ok(worst < 110, `一番遠い画素でも そこそこ近い（実際 ${worst.toFixed(1)}）`);
});

test("medianCut: 色が n 以下ならその色をそのまま返す", () => {
  const px = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 0]];
  const pal = medianCut(px, 16);
  assert.equal(pal.length, 3, "3 色しか無いので 3 色");
  const has = (c) => pal.some((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]);
  assert.ok(has([255, 0, 0]) && has([0, 255, 0]) && has([0, 0, 255]), "元の色がそのまま在る");
});

test("medianCut: 256 色を超えて頼まれても 256 色まで / 単色でも 1 色返す", () => {
  const f = makeFrame(64, 64, 5);
  assert.ok(medianCut(f.data, 1000, { stride: 4 }).length <= MAX_COLORS, "上限 256");
  assert.deepEqual(medianCut([[7, 7, 7], [7, 7, 7]], 8), [[7, 7, 7]], "単色");
  assert.deepEqual(medianCut([], 8), [[0, 0, 0]], "空でも 1 色は返す（呼び出し側が落ちない）");
});

test("nearestColor: 一番近い色の添字（平らなパレットでも三つ組でも）", () => {
  const pal = [[0, 0, 0], [255, 255, 255], [255, 0, 0]];
  assert.equal(nearestColor(pal, [250, 10, 10]), 2, "赤");
  assert.equal(nearestColor(pal, [10, 10, 10]), 0, "黒");
  assert.equal(nearestColor(pal, 240, 240, 240), 1, "白（引数 3 つでも）");
  assert.equal(nearestColor(new Uint8Array([0, 0, 0, 255, 255, 255]), [200, 200, 200]), 1, "平らなパレット");
  assert.throws(() => nearestColor([], [0, 0, 0]), /palette が空/, "空のパレットは throw");
});

test("quantizeFrame: 添字は全部パレットの中・α は背景に潰れる", () => {
  const pal = medianCut(makeFrame(32, 24, 9).data, 16, { stride: 4 });
  const mapper = createPaletteMapper(pal);
  const f = makeFrame(32, 24, 9);
  for (const dither of [false, true]) {
    const idx = quantizeFrame(f.data, 32, 24, mapper, { dither });
    assert.equal(idx.length, 32 * 24, "画素数");
    for (const v of idx) assert.ok(v < pal.length, "添字がパレットの中");
  }
  // 半透明の白を黒い背景に重ねると灰色になる（透明色を使わないので）
  const half = solidFrame(4, 4, [255, 255, 255], 128);
  const gray = createPaletteMapper([[0, 0, 0], [128, 128, 128], [255, 255, 255]]);
  const idx = quantizeFrame(half.data, 4, 4, gray, { dither: false, background: "#000000" });
  assert.ok(Array.from(idx).every((v) => v === 1), "灰色（添字 1）になる");
  assert.throws(() => quantizeFrame(new Uint8Array(4), 4, 4, gray, {}), /画素が足りません/);
});

test("diffRect: 変わった所の最小外接矩形", () => {
  const a = new Uint8Array(5 * 4).fill(0);
  const b = a.slice();
  assert.equal(diffRect(null, b, 5, 4).w, 5, "prev が無ければ全面");
  assert.equal(diffRect(a, b, 5, 4), null, "同じなら null");
  b[1 * 5 + 2] = 9; b[2 * 5 + 3] = 9;
  assert.deepEqual(diffRect(a, b, 5, 4), { x: 2, y: 1, w: 2, h: 2 }, "2×2 の矩形");
});

/* ══ 3. ブロックのバイト列 ════════════════════════════════════════ */

test("gifHeaderBytes: GIF89a + 画面記述子 + 色表", () => {
  const h = gifHeaderBytes({ width: 3, height: 258, palette: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] });
  assert.equal(asciiOf(h, 0, 6), GIF_SIGNATURE, "先頭 6 バイト");
  eqBytes(h.subarray(6, 10), [3, 0, 2, 1], "幅と高さは 16bit little endian");
  assert.equal(h[10], 0x80 | 1, "色表在り・2bit（4 色）");
  assert.equal(h[11], 0, "背景色の添字");
  assert.equal(h[12], 0, "画素の縦横比");
  eqBytes(h.subarray(13), [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0], "色表は 4 色ぶん（余りは 0）");
  const noPal = gifHeaderBytes({ width: 1, height: 1 });
  assert.equal(noPal.length, 13, "色表無しなら 13 バイト");
  assert.equal(noPal[10], 0, "色表の旗は立たない");
});

test("netscapeLoopExtBytes: 無限ループの 19 バイト", () => {
  const b = netscapeLoopExtBytes(0);
  eqBytes(b.subarray(0, 3), [0x21, 0xff, 0x0b], "拡張導入子とラベルと長さ");
  assert.equal(asciiOf(b, 3, 11), "NETSCAPE2.0", "名前");
  eqBytes(b.subarray(14), [0x03, 0x01, 0x00, 0x00, 0x00], "回数 0（無限）と終端");
  eqBytes(netscapeLoopExtBytes(3).subarray(16, 18), [3, 0], "3 回ループ");
});

test("graphicControlExtBytes: 表示時間は 1/100 秒・透明色は既定で無し", () => {
  const b = graphicControlExtBytes({ delayMs: 83.3, disposal: 1 });
  eqBytes(b, [0x21, 0xf9, 0x04, 0x04, 8, 0, 0, 0x00], "83.3ms → 8cs・廃棄方法 1・透明無し");
  const t = graphicControlExtBytes({ delayCs: 300, disposal: 2, transparentIndex: 7 });
  assert.equal(t[3], (2 << 2) | 1, "廃棄方法 2 + 透明色在り");
  eqBytes(t.subarray(4, 7), [44, 1, 7], "300cs と透明色の添字");
});

test("imageDescriptorBytes: 位置と大きさ", () => {
  eqBytes(imageDescriptorBytes({ left: 2, top: 3, width: 4, height: 5 }),
    [0x2c, 2, 0, 3, 0, 4, 0, 5, 0, 0x00], "ローカル色表無し");
  const withLct = imageDescriptorBytes({ left: 0, top: 0, width: 1, height: 1, localPalette: [[1, 1, 1], [2, 2, 2]] });
  assert.equal(withLct[9], 0x80 | 1, "ローカル色表在り・4 色ぶん");
  assert.equal(withLct.length, 10 + 12, "色表 4 色 × 3 バイト");
});

test("paletteBits / flattenPalette: GIF は 2..8bit しか許さない", () => {
  assert.equal(paletteBits(1), 2, "1 色でも 2bit");
  assert.equal(paletteBits(3), 2);
  assert.equal(paletteBits(5), 3);
  assert.equal(paletteBits(256), 8);
  assert.equal(paletteBits(1000), 8, "上限 8bit");
  assert.equal(flattenPalette([[1, 2, 3]]).length, 12, "2bit ぶん（4 色）に膨らむ");
  eqBytes(concatBytes([new Uint8Array([1]), new Uint8Array([2, 3])]), [1, 2, 3], "concatBytes");
});

/* ══ 4. GIF 全体 ══════════════════════════════════════════════════ */

test("createGIFEncoder: 先頭は GIF89a・末尾は 0x3B・構造が読める", () => {
  const enc = createGIFEncoder({ width: 24, height: 16, fps: 10, dither: false, quality: 1, learnFrames: 2 });
  enc.addFrame(makeFrame(24, 16, 1), { delayMs: 100 });
  enc.addFrame(makeFrame(24, 16, 1, 3), { delayMs: 100 });
  enc.addFrame(makeFrame(24, 16, 1, 6), { delayMs: 100 });
  const b = enc.finalizeBytes();

  assert.equal(asciiOf(b, 0, 6), "GIF89a", "先頭 6 バイトは GIF89a");
  assert.equal(b[b.length - 1], GIF_TRAILER, "末尾は 0x3B");

  const gif = readGif(b);
  assert.equal(gif.width, 24);
  assert.equal(gif.height, 16);
  assert.ok(gif.gct && gif.gct.length >= 4, "グローバル色表が在る");
  assert.equal(gif.app.length, 1, "アプリ拡張は NETSCAPE だけ");
  assert.equal(gif.app[0].name, "NETSCAPE2.0");
  assert.deepEqual(gif.app[0].data, [1, 0, 0], "無限ループ");
  assert.equal(gif.frames.length, 3, "3 枚");
  for (const f of gif.frames) {
    assert.equal(f.gce.delayCs, 10, "100ms → 10cs");
    assert.equal(f.lct, null, "ローカル色表は使わない（グローバルを使い回す）");
    assert.ok(f.left + f.w <= 24 && f.top + f.h <= 16, "矩形が画面の中");
  }
  assert.equal(enc.state(), "finalized");
  assert.equal(enc.stats().frames, 3);
});

test("createGIFEncoder: 復号した画素がだいたい元の絵（量子化の誤差だけ）", () => {
  const w = 32, h = 24;
  const f = makeFrame(w, h, 21);
  const enc = createGIFEncoder({ width: w, height: h, fps: 10, dither: false, quality: 1 });
  enc.addFrame(f, { delayMs: 100 });
  const gif = readGif(enc.finalizeBytes());
  const shot = composite(gif)[0];
  let worst = 0, sum = 0;
  for (let p = 0; p < w * h; p++) {
    const c = gif.gct[shot[p]];
    const i = p * 4;
    const d = Math.hypot(f.data[i] - c[0], f.data[i + 1] - c[1], f.data[i + 2] - c[2]);
    sum += d;
    if (d > worst) worst = d;
  }
  assert.ok(sum / (w * h) < 12, `平均の誤差が小さい（実際 ${(sum / (w * h)).toFixed(2)}）`);
  assert.ok(worst < 60, `一番外れた画素でも許せる（実際 ${worst.toFixed(1)}）`);
});

test("createGIFEncoder: 差分最適化 — 変わった所だけの矩形になる", () => {
  const w = 40, h = 20;
  const base = solidFrame(w, h, [10, 10, 10]);
  const moved = solidFrame(w, h, [10, 10, 10]);
  // (5,4)-(8,6) の 4×3 だけ白にする
  for (let y = 4; y <= 6; y++) {
    for (let x = 5; x <= 8; x++) {
      const i = (y * w + x) * 4;
      moved.data[i] = 250; moved.data[i + 1] = 250; moved.data[i + 2] = 250;
    }
  }
  const enc = createGIFEncoder({ width: w, height: h, fps: 10, dither: false, quality: 1, learnFrames: 2 });
  enc.addFrame(base, { delayMs: 100 });
  enc.addFrame(moved, { delayMs: 100 });
  const gif = readGif(enc.finalizeBytes());
  assert.equal(gif.frames.length, 2, "2 枚");
  assert.deepEqual(
    { left: gif.frames[0].left, top: gif.frames[0].top, w: gif.frames[0].w, h: gif.frames[0].h },
    { left: 0, top: 0, w: w, h: h }, "1 枚目は全面");
  assert.deepEqual(
    { left: gif.frames[1].left, top: gif.frames[1].top, w: gif.frames[1].w, h: gif.frames[1].h },
    { left: 5, top: 4, w: 4, h: 3 }, "2 枚目は変わった所だけ");
  // 重ねた結果が 2 枚目の絵と合う
  const shots = composite(gif);
  const white = gif.gct.findIndex((c) => c[0] > 200);
  assert.ok(white >= 0, "白がパレットに在る");
  assert.equal(shots[1][6 * w + 7], white, "白い所は白");
  assert.notEqual(shots[1][0], white, "外は元のまま");
});

test("createGIFEncoder: まったく同じ絵はフレームを増やさず表示時間を延ばす", () => {
  const f = solidFrame(8, 8, [30, 60, 90]);
  const enc = createGIFEncoder({ width: 8, height: 8, fps: 10, dither: false, quality: 1, learnFrames: 1 });
  enc.addFrame(f, { delayMs: 100 });
  enc.addFrame(f, { delayMs: 100 });
  enc.addFrame(f, { delayMs: 100 });
  const gif = readGif(enc.finalizeBytes());
  assert.equal(gif.frames.length, 1, "1 枚だけ");
  assert.equal(gif.frames[0].gce.delayCs, 30, "300ms ぶんの表示時間");
  assert.equal(enc.stats().skipped, 2, "2 枚は書かずに済んだ");
});

test("createGIFEncoder: 1/100 秒に丸めても総尺がずれない（fps 12）", () => {
  const w = 8, h = 8;
  // パレットを渡して «毎フレーム必ず絵が変わる» ようにする（差分でまとめられないため）
  const enc = createGIFEncoder({
    width: w, height: h, fps: 12, dither: false, quality: 1,
    palette: [[0, 0, 0], [255, 255, 255]],
  });
  const n = 12;
  for (let i = 0; i < n; i++) {
    enc.addFrame(solidFrame(w, h, i % 2 ? [255, 255, 255] : [0, 0, 0]), { delayMs: 1000 / 12 });
  }
  const gif = readGif(enc.finalizeBytes());
  const total = gif.frames.reduce((s, f) => s + f.gce.delayCs, 0);
  assert.equal(gif.frames.length, n, "12 枚");
  assert.equal(total, 100, "1 秒ぶん = 100cs（8cs 固定だと 96cs になってずれる）");
  assert.ok(gif.frames.some((f) => f.gce.delayCs === 9), "丸め誤差を送った 9cs が混ざる");
});

test("createGIFEncoder: ループ回数・色数・ディザの指定が効く", () => {
  const f = makeFrame(16, 16, 33);
  const enc = createGIFEncoder({ width: 16, height: 16, fps: 10, loop: 5, colors: 8, dither: true, quality: 1 });
  enc.addFrame(f, { delayMs: 100 });
  const gif = readGif(enc.finalizeBytes());
  assert.ok(enc.palette().length <= 8, "8 色まで");
  assert.deepEqual(gif.app[0].data, [1, 5, 0], "5 回ループ");
  assert.equal(gif.frames[0].minCodeSize, 3, "8 色 → 最小符号長 3");
  for (const v of gif.frames[0].indices) assert.ok(v < 8, "添字は 8 色の中");
});

test("createGIFEncoder: 大きさ違い・finalize 済み・空などの間違いは明確に throw", () => {
  assert.throws(() => createGIFEncoder({ width: 0, height: 10 }), /width \/ height/, "大きさ無しは作れない");
  const enc = createGIFEncoder({ width: 8, height: 8, learnFrames: 1, quality: 1 });
  assert.throws(() => enc.addFrame(makeFrame(9, 8, 1), {}), /大きさが違います/, "別の大きさ");
  assert.throws(() => enc.addFrame({ width: 8, height: 8, data: new Uint8Array(4) }, {}), /RGBA が足りません/);
  assert.throws(() => enc.addFrame(null, {}), /ImageData 風/);
  const empty = createGIFEncoder({ width: 4, height: 4 });
  assert.throws(() => empty.finalizeBytes(), /1 枚も入っていません/, "1 枚も無いのに finalize");
  enc.addFrame(solidFrame(8, 8, [1, 2, 3]), { delayMs: 100 });
  enc.finalizeBytes();
  assert.throws(() => enc.addFrame(solidFrame(8, 8, [4, 5, 6]), {}), /finalize 済み/);
  enc.dispose();
  assert.throws(() => enc.bytes(), /dispose 済み/);
});

test("createGIFEncoder: bytes() は途中でも «見られる GIF» を返す", () => {
  const enc = createGIFEncoder({
    width: 8, height: 8, fps: 10, quality: 1,
    palette: [[200, 0, 0], [0, 200, 0]],
  });
  enc.addFrame(solidFrame(8, 8, [200, 0, 0]), { delayMs: 100 });
  const draft = enc.bytes();
  assert.equal(asciiOf(draft, 0, 6), "GIF89a");
  assert.equal(draft[draft.length - 1], GIF_TRAILER, "下書きにも末尾が付く");
  assert.equal(readGif(draft).frames.length, 1);
  enc.addFrame(solidFrame(8, 8, [0, 200, 0]), { delayMs: 100 });
  assert.equal(readGif(enc.finalizeBytes()).frames.length, 2, "その後も足せる");
});

test("createGIFEncoder: 平らな RGBA でも受ける / Blob でも出せる", () => {
  const enc = createGIFEncoder({ width: 4, height: 4, fps: 10, quality: 1, learnFrames: 1 });
  enc.addFrame(solidFrame(4, 4, [9, 9, 9]).data, { delayMs: 100 });   // ImageData 風でない
  const blob = enc.finalize();
  assert.equal(blob.type, "image/gif", "MIME");
  assert.ok(blob.size > 20, "中身が在る");
});

test("default export は createGIFEncoder / exportGif も在る（exporter.js が探す名前）", () => {
  assert.equal(typeof createDefault, "function");
  assert.equal(createDefault, createGIFEncoder, "default は createGIFEncoder");
  assert.equal(typeof exportGif, "function", "exporter.js の runGif が探す名前");
});
