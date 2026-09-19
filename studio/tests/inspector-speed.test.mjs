/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/inspector-speed.test.mjs
   インスペクタ「速度」タブと「変形」タブの **純ロジック**の試験。

   ここで試すのは DOM に触らない export だけ:
     speed.js  … normRamp / rampIntegral / rampDuration / speedToY / yToSpeed /
                 scalePreset / rampToPoints / pointsToRamp / shapeMean /
                 shapeDuration / curveToShape / RAMP_PRESETS
     transform.js … frameFit / cropForRatio
     project.js   … sizeForStep / CAPTION_PRESETS
   画面の組み立て（createXxxPanel）は document が要るので Node では試せない。
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SPEED_MIN, SPEED_MAX, RAMP_PRESETS,
  normRamp, rampIntegral, rampDuration,
  speedToY, yToSpeed, scalePreset, rampToPoints, pointsToRamp,
  shapeMean, shapeDuration, curveToShape
} from "../src/ui/inspector/speed.js";
import { frameFit, cropForRatio } from "../src/ui/inspector/transform.js";
import { sizeForStep, CAPTION_PRESETS, DEFAULTS_KEYS } from "../src/ui/inspector/project.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≒ ${b} でない`);

/* ── normRamp ───────────────────────────────────────────────────── */

test("normRamp: t で並べ替え・重複を潰し・壊れた点を捨てる", () => {
  const out = normRamp([
    { t: 2, v: 2 }, { t: 0, v: 1 }, { t: 2, v: 3 },
    { t: -1, v: 1 }, { t: 1, v: 0 }, { t: 1, v: NaN }, null, 5
  ]);
  /* 負の t は 0 へ寄せられ、t=0 が 2 つになるので後の 1 つに潰れる。
     v が 0 / NaN の点と object でない要素は捨てる */
  assert.equal(out.length, 2);
  assert.equal(out[0].t, 0);
  assert.equal(out[1].t, 2);
  assert.equal(out[1].v, 3);          // 同じ t は後から来た方が残る
});

test("normRamp: ramp でないものは空配列", () => {
  assert.deepEqual(normRamp(null), []);
  assert.deepEqual(normRamp(undefined), []);
  assert.deepEqual(normRamp("1,2"), []);
});

/* ── rampIntegral ───────────────────────────────────────────────── */

test("rampIntegral: ramp が無ければ 1 倍（∫ = t）", () => {
  near(rampIntegral(null, 3), 3);
  near(rampIntegral([], 0.5), 0.5);
});

test("rampIntegral: 一定 2 倍なら ∫ = 2t", () => {
  const ramp = [{ t: 0, v: 2 }, { t: 10, v: 2 }];
  near(rampIntegral(ramp, 0), 0);
  near(rampIntegral(ramp, 3), 6);
  near(rampIntegral(ramp, 10), 20);
});

test("rampIntegral: 両端の外側は端の値で一定", () => {
  const ramp = [{ t: 1, v: 2 }, { t: 2, v: 2 }];
  near(rampIntegral(ramp, 1), 2);     // 0..1 は v=2 のまま
  near(rampIntegral(ramp, 3), 6);     // 2..3 も v=2 のまま
});

test("rampIntegral: 線形に上がる区間は台形の面積", () => {
  const ramp = [{ t: 0, v: 1 }, { t: 2, v: 3 }];
  near(rampIntegral(ramp, 2), (1 + 3) / 2 * 2);     // = 4
  near(rampIntegral(ramp, 1), (1 + 2) / 2 * 1);     // = 1.5
});

test("rampIntegral: 負の t は 0 と同じ", () => {
  near(rampIntegral([{ t: 0, v: 2 }, { t: 5, v: 2 }], -3), 0);
});

/* ── rampDuration ───────────────────────────────────────────────── */

test("rampDuration: ramp が無ければ素材の尺そのまま", () => {
  near(rampDuration(null, 4), 4);
});

test("rampDuration: 一定 2 倍なら尺は半分", () => {
  near(rampDuration([{ t: 0, v: 2 }, { t: 100, v: 2 }], 4), 2, 1e-4);
});

test("rampDuration: 一定 0.5 倍なら尺は倍", () => {
  near(rampDuration([{ t: 0, v: 0.5 }, { t: 100, v: 0.5 }], 4), 8, 1e-4);
});

test("rampDuration と rampIntegral は逆向き（往復して元へ戻る）", () => {
  for (const preset of RAMP_PRESETS) {
    const ramp = scalePreset(preset.points, 6);
    const span = rampIntegral(ramp, 6);
    const back = rampDuration(ramp, span);
    near(back, 6, 1e-3);
  }
});

/* ── 対数の縦軸 ─────────────────────────────────────────────────── */

test("speedToY: 1 倍はちょうど真ん中、両端は 0 と 1", () => {
  near(speedToY(1), 0.5, 1e-9);
  near(speedToY(SPEED_MIN), 0);
  near(speedToY(SPEED_MAX), 1);
});

test("yToSpeed / speedToY は往復する（小数 2 桁の丸めの範囲で）", () => {
  for (const v of [0.1, 0.25, 0.5, 1, 2, 4, 10]) {
    near(yToSpeed(speedToY(v)), v, 0.01);
  }
});

test("speedToY / yToSpeed は範囲の外を渡しても壊れない", () => {
  near(speedToY(1000), 1);
  near(speedToY(0), 0);
  assert.ok(yToSpeed(-5) >= SPEED_MIN);
  assert.ok(yToSpeed(9) <= SPEED_MAX);
});

/* ── プリセットと点の変換 ───────────────────────────────────────── */

test("RAMP_PRESETS: すべて t が 0..1・v が 0 より大きい・2 点以上", () => {
  assert.ok(RAMP_PRESETS.length >= 5);
  for (const p of RAMP_PRESETS) {
    assert.ok(p.id && p.label, "id と label が要る");
    assert.ok(p.points.length >= 2, `${p.id} は 2 点以上`);
    for (const q of p.points) {
      assert.ok(q.t >= 0 && q.t <= 1, `${p.id}: t=${q.t} が 0..1 の外`);
      assert.ok(q.v > 0, `${p.id}: v=${q.v} が 0 以下`);
    }
    /* t は昇順であってほしい（scalePreset が並べ替えるが、書き間違いを見つける） */
    for (let i = 1; i < p.points.length; i++) assert.ok(p.points[i].t >= p.points[i - 1].t, `${p.id}: t が昇順でない`);
  }
});

test("scalePreset: t の割合をクリップの尺へ伸ばす", () => {
  const ramp = scalePreset([{ t: 0, v: 1 }, { t: 0.5, v: 2 }, { t: 1, v: 1 }], 8);
  assert.deepEqual(ramp.map((p) => p.t), [0, 4, 8]);
});

test("rampToPoints: ramp が無ければ 1 倍の水平線", () => {
  const pts = rampToPoints(null, 5);
  assert.equal(pts.length, 2);
  near(pts[0][0], 0);
  near(pts[1][0], 1);
  near(pts[0][1], 0.5, 1e-9);
});

test("rampToPoints: 端が足りない ramp には 0 と 1 の点を足す", () => {
  const pts = rampToPoints([{ t: 2, v: 2 }, { t: 3, v: 2 }], 5);
  near(pts[0][0], 0);
  near(pts[pts.length - 1][0], 1);
});

test("pointsToRamp → rampToPoints が往復する", () => {
  const src = [[0, 0.2], [0.4, 0.8], [1, 0.5]];
  const ramp = pointsToRamp(src, 10);
  assert.deepEqual(ramp.map((p) => p.t), [0, 4, 10]);
  const back = rampToPoints(ramp, 10);
  assert.equal(back.length, 3);
  for (let i = 0; i < 3; i++) {
    near(back[i][0], src[i][0], 1e-6);
    near(back[i][1], src[i][1], 0.01);
  }
});

test("pointsToRamp: {x,y} の形でも読める", () => {
  const ramp = pointsToRamp([{ x: 0, y: 0.5 }, { x: 1, y: 1 }], 4);
  assert.equal(ramp.length, 2);
  near(ramp[0].v, 1, 0.01);
  near(ramp[1].v, SPEED_MAX, 0.01);
});

/* ── transform.js の寸法計算 ────────────────────────────────────── */

const project = (w, h) => ({ settings: { width: w, height: h } });

test("frameFit: scale 1 は素材を画面に収める（contain）", () => {
  const fit = frameFit(project(1920, 1080), {}, { width: 1080, height: 1920 });
  near(fit.k, 1080 / 1920);                       // 縦が先に当たる
  near(fit.dispH, 1080);                          // 高さがちょうど画面いっぱい
  assert.ok(fit.dispW < fit.W, "横には余白が残る");
});

test("frameFit: 素材の寸法が分からなければ画面と同じと見なす", () => {
  const fit = frameFit(project(1920, 1080), {}, null);
  near(fit.k, 1);
  near(fit.dispW, 1920);
  near(fit.dispH, 1080);
});

test("frameFit: rotation 90 の素材は縦横を入れ替えて考える", () => {
  const fit = frameFit(project(1080, 1920), {}, { width: 1920, height: 1080, rotation: 90 });
  near(fit.aw, 1080);
  near(fit.ah, 1920);
  near(fit.k, 1);
});

test("cropForRatio: 横長の素材を 9:16 にすると左右が削られる", () => {
  const fit = frameFit(project(1080, 1920), {}, { width: 1920, height: 1080 });
  const crop = cropForRatio(fit, 9 / 16);
  assert.ok(crop.l > 0 && crop.r > 0, "左右が削られる");
  near(crop.t, 0);
  near(crop.b, 0);
  /* 残った窓の比が 9:16 になっている */
  const keptAR = (fit.aw * (1 - crop.l - crop.r)) / (fit.ah * (1 - crop.t - crop.b));
  near(keptAR, 9 / 16, 1e-6);
});

test("cropForRatio: 縦長の素材を 16:9 にすると上下が削られる", () => {
  const fit = frameFit(project(1920, 1080), {}, { width: 1080, height: 1920 });
  const crop = cropForRatio(fit, 16 / 9);
  assert.ok(crop.t > 0 && crop.b > 0, "上下が削られる");
  near(crop.l, 0);
  const keptAR = (fit.aw * (1 - crop.l - crop.r)) / (fit.ah * (1 - crop.t - crop.b));
  near(keptAR, 16 / 9, 1e-6);
});

test("cropForRatio: 比が同じなら何も削らない", () => {
  const fit = frameFit(project(1920, 1080), {}, { width: 1920, height: 1080 });
  assert.deepEqual(cropForRatio(fit, 16 / 9), { l: 0, t: 0, r: 0, b: 0 });
});

/* ── project.js の解像度 ────────────────────────────────────────── */

test("sizeForStep: 横長は高さ、縦長は幅を段に合わせる", () => {
  assert.deepEqual(sizeForStep("16:9", 1080), { w: 1920, h: 1080 });
  assert.deepEqual(sizeForStep("16:9", 2160), { w: 3840, h: 2160 });
  assert.deepEqual(sizeForStep("9:16", 1080), { w: 1080, h: 1920 });
  assert.deepEqual(sizeForStep("1:1", 720), { w: 720, h: 720 });
});

test("sizeForStep: 知らない比率でも 16:9 として扱い、壊れない", () => {
  assert.deepEqual(sizeForStep("なんとか", 720), { w: 1280, h: 720 });
});

test("CAPTION_PRESETS: id が重複せず、size と color を持つ", () => {
  const ids = new Set();
  for (const p of CAPTION_PRESETS) {
    assert.ok(!ids.has(p.id), `id ${p.id} が重複`);
    ids.add(p.id);
    assert.ok(p.style.size > 0);
    assert.match(p.style.color, /^#[0-9a-fA-F]{6}$/);
  }
  assert.ok(ids.has("plain"), "既定の plain が要る");
});

test("DEFAULTS_KEYS: vqstudio の名前空間を使う", () => {
  for (const k of Object.keys(DEFAULTS_KEYS)) {
    assert.match(DEFAULTS_KEYS[k], /^vqstudio\./);
  }
});

/* ── 形（0..1）から尺を出す（ramp を当てる前の見積もり）─────────── */

test("shapeMean: 一定 2 倍の形の平均は 2、1 倍なら 1", () => {
  near(shapeMean([{ t: 0, v: 2 }, { t: 1, v: 2 }]), 2);
  near(shapeMean([{ t: 0, v: 1 }, { t: 1, v: 1 }]), 1);
});

test("shapeMean: 0→1 で 1 倍から 3 倍へ上がる形の平均は 2（台形）", () => {
  near(shapeMean([{ t: 0, v: 1 }, { t: 1, v: 3 }]), 2);
});

test("shapeDuration: 素材 6 秒を平均 2 倍で使えば尺は 3 秒", () => {
  near(shapeDuration([{ t: 0, v: 2 }, { t: 1, v: 2 }], 6), 3);
});

test("shapeDuration の尺へ形を伸ばした ramp は、ちょうど素材を使い切る", () => {
  for (const preset of RAMP_PRESETS) {
    const span = 7.5;
    const D = shapeDuration(preset.points, span);
    const ramp = scalePreset(preset.points, D);
    /* ramp の最後の点がクリップの端に一致する（平らな尾が出ない） */
    near(ramp[ramp.length - 1].t, D, 1e-6);
    /* その尺ぶん再生すると素材をちょうど span 秒使う */
    near(rampIntegral(ramp, D), span, 1e-4);
    /* rampDuration で逆算しても同じ尺になる */
    near(rampDuration(ramp, span), D, 1e-3);
  }
});

test("curveToShape: [[x,y]] を 0..1 の形にする（1 倍は真ん中の y）", () => {
  const shape = curveToShape([[0, 0.5], [1, 0.5]]);
  assert.equal(shape.length, 2);
  near(shape[0].v, 1, 0.01);
  near(shape[1].t, 1);
});

test("curveToShape: 点が足りなければ 1 倍の水平線にする", () => {
  const shape = curveToShape([[0.3, 0.9]]);
  assert.equal(shape.length, 2);
  near(shape[0].v, 1, 0.01);
  near(shape[1].v, 1, 0.01);
});
