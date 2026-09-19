/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/scopes.test.mjs — 計測器（ui/scopes.js）の純関数の試験

   ★ 何を固定するか
     ① 間引き（downsample）… 幅 256 へ落とす時の寸法と最近傍の選び方
     ② 輝度の係数（Rec.709）… 白 = 255・緑が一番重い
     ③ ヒストグラム … 総数が画素数と合う・黒は 0 番・白は最後の階級
     ④ 波形 … 列と行の向き（row 0 が暗い側）・RGB パレードの中身
     ⑤ ベクトルスコープ … 無彩色は中心に集まる・赤は上（+Cr）側へ出る
     ⑥ 白飛び・黒潰れの割合（ゼブラの根拠）
     ⑦ 種類の名前寄せ（normalizeKind）… 知らない名前でも落ちない

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/scopes.test.mjs
     （DOM を使わない関数だけを試す。描画は selftest.html の担当）
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  downsample, lumaOf, histogram, waveformRows, vectorPoints, clipStats,
  toChroma, normalizeKind, VECTOR_TARGETS, SCOPE_KINDS, LUMA_709, CALC_WIDTH
} from "../src/ui/scopes.js";

/** 試験用の ImageData 相当（fn(x,y) が [r,g,b] か [r,g,b,a] を返す） */
function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y) || [0, 0, 0];
      const o = (y * w + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { width: w, height: h, data };
}
const solid = (w, h, c) => img(w, h, () => c);
/** 度数の総和 */
const sum = (a) => a.reduce((m, v) => m + v, 0);

/* ── ① 間引き ───────────────────────────────────────────────────── */

test("downsample: 目標より小さい絵はそのまま（複製しない）", () => {
  const src = solid(4, 3, [10, 20, 30]);
  const out = downsample(src, 256);
  assert.equal(out.width, 4);
  assert.equal(out.height, 3);
  assert.equal(out.data, src.data, "同じ配列を使い回す（余計な複製をしない）");
});

test("downsample: 幅を落とすと縦横比を保つ", () => {
  const src = solid(1920, 1080, [128, 128, 128]);
  const out = downsample(src, CALC_WIDTH);
  assert.equal(out.width, 256);
  assert.equal(out.height, Math.round((1080 * 256) / 1920));
  assert.equal(out.height, 144);
  assert.equal(out.data.length, 256 * 144 * 4);
});

test("downsample: 最近傍（左半分が赤・右半分が青なら境目を跨がない）", () => {
  const src = img(8, 2, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]));
  const out = downsample(src, 4);
  assert.equal(out.width, 4);
  assert.equal(out.height, 1);
  const at = (i) => [out.data[i * 4], out.data[i * 4 + 1], out.data[i * 4 + 2]];
  assert.deepEqual(at(0), [255, 0, 0]);
  assert.deepEqual(at(1), [255, 0, 0]);
  assert.deepEqual(at(2), [0, 0, 255]);
  assert.deepEqual(at(3), [0, 0, 255]);
});

test("downsample: 壊れた入力は null（呼び出し側が諦められるように）", () => {
  assert.equal(downsample(null), null);
  assert.equal(downsample({ width: 0, height: 0, data: new Uint8ClampedArray(0) }), null);
  assert.equal(downsample({ width: 4, height: 4, data: new Uint8ClampedArray(8) }), null, "data が足りない");
});

/* ── ② 輝度 ─────────────────────────────────────────────────────── */

test("lumaOf: Rec.709（白は 255・緑が一番重い）", () => {
  assert.equal(Math.round(lumaOf(255, 255, 255)), 255);
  assert.equal(lumaOf(0, 0, 0), 0);
  assert.ok(lumaOf(0, 255, 0) > lumaOf(255, 0, 0));
  assert.ok(lumaOf(255, 0, 0) > lumaOf(0, 0, 255));
  assert.ok(Math.abs(LUMA_709.r + LUMA_709.g + LUMA_709.b - 1) < 1e-6);
});

/* ── ③ ヒストグラム ─────────────────────────────────────────────── */

test("histogram: 黒一色は 0 番の階級に全部入る", () => {
  const h = histogram(solid(16, 8, [0, 0, 0]));
  assert.equal(h.bins, 256);
  assert.equal(h.total, 128);
  assert.equal(h.r[0], 128);
  assert.equal(h.luma[0], 128);
  assert.equal(sum(Array.from(h.g)), 128);
  assert.equal(h.max, 128);
});

test("histogram: 白一色は最後の階級・総数は画素数と合う", () => {
  const h = histogram(solid(10, 10, [255, 255, 255]));
  assert.equal(h.r[255], 100);
  assert.equal(h.g[255], 100);
  assert.equal(h.b[255], 100);
  assert.equal(h.luma[255], 100);
  assert.equal(sum(Array.from(h.luma)), 100);
});

test("histogram: 色ごとに別の山（赤だけ明るい絵）", () => {
  const h = histogram(solid(4, 4, [255, 0, 0]));
  assert.equal(h.r[255], 16);
  assert.equal(h.g[0], 16);
  assert.equal(h.b[0], 16);
  /* 輝度は 0.2126 × 255 ≒ 54 */
  const peak = Array.from(h.luma).findIndex((v) => v > 0);
  assert.equal(peak, Math.round(lumaOf(255, 0, 0)));
});

test("histogram: bins を減らせる（16 階級でも総数は保つ）", () => {
  const h = histogram(img(8, 8, (x) => [x * 32, x * 32, x * 32]), { bins: 16 });
  assert.equal(h.bins, 16);
  assert.equal(sum(Array.from(h.luma)), 64);
  assert.equal(h.luma[0], 8, "x=0 の列（黒）が 8 画素");
});

/* ── ④ 波形 ─────────────────────────────────────────────────────── */

test("waveformRows: 列は画面の横位置・row 0 は暗い側", () => {
  /* 左半分が黒・右半分が白（縦 4） */
  const wf = waveformRows(img(8, 4, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255])), { cols: 8, rows: 8 });
  assert.equal(wf.cols, 8);
  assert.equal(wf.rows, 8);
  assert.equal(wf.channels, "luma");
  assert.equal(wf.total, 32);
  assert.equal(wf.luma[0 * 8 + 0], 4, "左の列は一番下（暗い）に 4 画素");
  assert.equal(wf.luma[0 * 8 + 7], 0);
  assert.equal(wf.luma[7 * 8 + 7], 4, "右の列は一番上（明るい）に 4 画素");
  assert.equal(wf.max, 4);
  assert.equal(wf.r, null);
});

test("waveformRows: RGB パレードは 3 本を別に数える", () => {
  const wf = waveformRows(solid(4, 4, [255, 0, 0]), { cols: 4, rows: 4, channels: "rgb" });
  assert.equal(wf.channels, "rgb");
  assert.equal(wf.luma, null);
  assert.equal(wf.r[0 * 4 + 3], 4, "R は一番上");
  assert.equal(wf.g[0 * 4 + 0], 4, "G は一番下");
  assert.equal(wf.b[0 * 4 + 0], 4);
  assert.equal(sum(Array.from(wf.r)), 16);
});

test("waveformRows: 元が cols より細くても列に収める", () => {
  const wf = waveformRows(solid(4, 2, [128, 128, 128]), { cols: 16, rows: 8 });
  assert.equal(wf.cols, 16);
  assert.equal(sum(Array.from(wf.luma)), 8, "画素数は 4×2");
  /* 4 画素幅を 16 列へ広げる → 0,4,8,12 列にだけ入る */
  const cols = [];
  for (let c = 0; c < 16; c++) {
    let n = 0;
    for (let r = 0; r < 8; r++) n += wf.luma[c * 8 + r];
    if (n) cols.push(c);
  }
  assert.deepEqual(cols, [0, 4, 8, 12]);
});

/* ── ⑤ ベクトルスコープ ─────────────────────────────────────────── */

test("toChroma: 無彩色は原点（u=v=0）", () => {
  for (const v of [0, 64, 128, 255]) {
    const c = toChroma(v, v, v);
    assert.ok(Math.abs(c.u) < 1e-9, "u=" + c.u);
    assert.ok(Math.abs(c.v) < 1e-9, "v=" + c.v);
  }
});

test("vectorPoints: 灰色一色は中心の 1 マスに集まる", () => {
  const vs = vectorPoints(solid(8, 8, [120, 120, 120]), { size: 33 });
  assert.equal(vs.size, 33);
  assert.equal(vs.total, 64);
  assert.equal(vs.max, 64);
  const half = (33 - 1) / 2;
  assert.equal(vs.grid[half * 33 + half], 64, "中心（16,16）に全部");
  assert.equal(sum(Array.from(vs.grid)), 64);
});

test("vectorPoints: 赤は上（+Cr）側・青は下側へ出る", () => {
  const size = 65;
  const half = (size - 1) / 2;
  const cell = (vs) => {
    for (let i = 0; i < vs.grid.length; i++) if (vs.grid[i]) return { x: i % size, y: Math.floor(i / size) };
    return null;
  };
  const red = cell(vectorPoints(solid(4, 4, [255, 0, 0]), { size }));
  const blue = cell(vectorPoints(solid(4, 4, [0, 0, 255]), { size }));
  assert.ok(red.y < half, "赤は中心より上");
  assert.ok(blue.y > half, "青は中心より下");
  assert.ok(blue.x > half, "青は中心より右（+Cb）");
});

test("VECTOR_TARGETS: 6 色が揃い、補色が反対側に来る", () => {
  assert.equal(VECTOR_TARGETS.length, 6);
  const by = {};
  for (const t of VECTOR_TARGETS) by[t.name] = t;
  for (const [a, b] of [["R", "Cy"], ["G", "Mg"], ["B", "Yl"]]) {
    assert.ok(Math.abs(by[a].u + by[b].u) < 1e-6, a + "/" + b + " の u が反対");
    assert.ok(Math.abs(by[a].v + by[b].v) < 1e-6, a + "/" + b + " の v が反対");
  }
  assert.ok(by.R.v > 0 && by.B.v < 0);
});

/* ── ⑥ 白飛び・黒潰れ ───────────────────────────────────────────── */

test("clipStats: 白飛びと黒潰れの割合", () => {
  /* 16 画素のうち 4 が白・4 が黒・残りは中間 */
  const src = img(4, 4, (x, y) => {
    const i = y * 4 + x;
    if (i < 4) return [255, 255, 255];
    if (i < 8) return [0, 0, 0];
    return [128, 128, 128];
  });
  const cs = clipStats(src);
  assert.equal(cs.total, 16);
  assert.equal(cs.high, 4);
  assert.equal(cs.low, 4);
  assert.ok(Math.abs(cs.highPct - 0.25) < 1e-9);
  assert.ok(Math.abs(cs.lowPct - 0.25) < 1e-9);
});

test("clipStats: 1 色だけ張り付いても白飛び（暗部は 3 色揃って初めて黒潰れ）", () => {
  const onlyRed = clipStats(solid(2, 2, [255, 10, 10]));
  assert.equal(onlyRed.high, 4);
  assert.equal(onlyRed.low, 0);
  const darkBlue = clipStats(solid(2, 2, [0, 0, 40]));
  assert.equal(darkBlue.low, 0, "青だけ残っている所は潰れていない");
  assert.equal(clipStats(solid(2, 2, [2, 2, 2])).low, 4);
});

test("clipStats: 境目は opts で動かせる", () => {
  const src = solid(2, 2, [200, 200, 200]);
  assert.equal(clipStats(src).high, 0);
  assert.equal(clipStats(src, { high: 199 }).high, 4);
});

/* ── ⑦ 種類の名前 ───────────────────────────────────────────────── */

test("normalizeKind: 別名も知らない名前も落ちない", () => {
  assert.equal(normalizeKind("hist"), "hist");
  assert.equal(normalizeKind("histogram"), "hist");
  assert.equal(normalizeKind("waveform"), "wave");
  assert.equal(normalizeKind("rgbparade"), "parade");
  assert.equal(normalizeKind("vectorscope"), "vector");
  assert.equal(normalizeKind("Luma"), "histLuma");
  assert.equal(normalizeKind(""), "hist");
  assert.equal(normalizeKind(undefined), "hist");
  assert.equal(normalizeKind("知らない"), "hist");
  for (const k of SCOPE_KINDS) assert.equal(normalizeKind(k.id), k.id);
});
