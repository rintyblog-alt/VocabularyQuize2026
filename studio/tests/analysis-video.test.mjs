/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/analysis-video.test.mjs — 映像解析（analysis/video.js・track.js・
   index.js）の試験

   ★ 何を固定するか
     ① 人工フレーム列（無地 → 切替 → フェード / 動く四角 / ぼけ画像）に対して
        各関数が期待どおり反応すること
     ② 値域 0..1・NaN 無し（真っ黒・1 フレームだけの素材でも壊れない）
     ③ ショット境界の併合（フェードは 1 本 / minShot 未満は併合）
     ④ 追跡と自動リフレームが画面から出ない・滑らかである
     ⑤ analyzeAsset が **ブラウザ API が無い Node でも落ちない**（諦めた理由が
        warnings に入る）・version が同じなら再計算しない
     ⑥ 回帰: パンの途中のカットが重心へずれない / 塊の中の複数カットを落とさない /
        枚数の上限に当たっても素材の後半を見捨てない / gray だけの Frame で
        全フレームが境界にならない

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/analysis-video.test.mjs
     （または cd studio && npm test）
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  soften, frameDims, frameInterval, curveHz, makeCurve,
  histogramRGB, histIntersection, edgeDensity, laplacianVar, meanU8, meanAbsDiffU8, satMeanRGB,
  sceneDiff, sceneDiffs, boundariesFromDiffs, mergeShortShots, detectScenes,
  motionCurve, sharpnessCurve, brightnessCurve, saturationCurve, estimateShift, shakeScore,
  detectFaces, sampleCurve, meanCurve, curveDuration, analysisDuration, sceneBoundaries,
  faceRatio, scoreRange, pickBestRange, pickHighlights, summarizeForLLM, frameFromSource,
  sampleFrames,
} from "../src/analysis/video.js";
import {
  normalizeBox, boxCenter, largestBox, halfGray, extractPatch, ncc,
  trackSubject, parseRatio, motionCentroid, autoReframeCurve,
} from "../src/analysis/track.js";
import {
  analyzeAsset, analyzeAssets, emptyAnalysis, needsAnalysis, kindOf, ANALYSIS_VERSION, DEFAULT_WANT,
} from "../src/analysis/index.js";

/* ── 人工フレームを作る道具 ─────────────────────────────────── */

/** paint(x,y) -> [r,g,b] から 1 フレーム作る（analysis/video.js の Frame と同じ形） */
function frame(t, w, h, paint) {
  const gray = new Uint8Array(w * h), rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y) || [0, 0, 0];
      const i = y * w + x;
      rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
      gray[i] = (c[0] * 77 + c[1] * 150 + c[2] * 29) >> 8;
    }
  }
  return { t, w, h, gray, rgb };
}
const solid = (t, v, w = 32, h = 24) => frame(t, w, h, () => [v, v, v]);
/** 黒地に白い四角（追跡・動きの素） */
const square = (t, x0, y0, size = 12, w = 64, h = 64) =>
  frame(t, w, h, (x, y) => (x >= x0 && x < x0 + size && y >= y0 && y < y0 + size ? [255, 255, 255] : [0, 0, 0]));
/** 市松模様（ピントの良い絵） */
const checker = (t, cell = 2, w = 48, h = 48) =>
  frame(t, w, h, (x, y) => ((((x / cell) | 0) + ((y / cell) | 0)) % 2 ? [255, 255, 255] : [0, 0, 0]));
/** なだらかな濃淡（ぼけた絵。高い周波数が無い） */
const blurry = (t, w = 48, h = 48) =>
  frame(t, w, h, (x, y) => {
    const v = Math.round(128 + 60 * Math.sin(x / 14) * Math.cos(y / 16));
    return [v, v, v];
  });
/** 列を作る小道具（dt = 0.25 秒 = 4hz） */
const seq = (make, n, dt = 0.25) => Array.from({ length: n }, (_, i) => make(i * dt, i));

/** 全部有限か（NaN が 1 つでも混ざると自動編集が黙って壊れる） */
function allFinite(values, label) {
  for (const v of values) assert.ok(Number.isFinite(v), `${label}: 有限でない値がある (${v})`);
}
/** 0..1 に収まっているか */
function inUnit(curve, label) {
  assert.ok(Array.isArray(curve.values), `${label}: values が配列でない`);
  allFinite(curve.values, label);
  for (const v of curve.values) assert.ok(v >= 0 && v <= 1, `${label}: 0..1 の外 (${v})`);
}

/* ── ① 小道具（pure） ──────────────────────────────────────── */

test("soften: 0..1 に収まり、負と NaN は 0", () => {
  assert.equal(soften(0, 0.1), 0);
  assert.equal(soften(-5, 0.1), 0);
  assert.equal(soften(NaN, 0.1), 0);
  assert.ok(Math.abs(soften(0.1, 0.1) - 0.5) < 1e-9);
  assert.ok(soften(10, 0.1) < 1);
});

test("frameDims: w/h を信じ、無ければ正方形と見なす", () => {
  assert.deepEqual(frameDims({ gray: new Uint8Array(12), w: 4, h: 3 }), { w: 4, h: 3 });
  assert.deepEqual(frameDims({ gray: new Uint8Array(16) }), { w: 4, h: 4 });
  assert.deepEqual(frameDims(null), { w: 0, h: 0 });
});

test("frameInterval / curveHz: 中央値を採る（既定 0.25 秒）", () => {
  assert.equal(frameInterval([]), 0.25);
  assert.equal(frameInterval([{ t: 0 }, { t: 0.5 }, { t: 1 }]), 0.5);
  assert.equal(curveHz([{ t: 0 }, { t: 0.25 }, { t: 0.5 }]), 4);
});

test("makeCurve: NaN と範囲外を外へ出さない", () => {
  const c = makeCurve([NaN, -3, 0.5, 9], 4);
  assert.deepEqual(c.values, [0, 0, 0.5, 1]);
  assert.equal(c.hz, 4);
  assert.equal(makeCurve(null, NaN).hz, 0);
});

test("histogramRGB / histIntersection: 同じ絵は 1・別の絵は 0", () => {
  const a = histogramRGB(solid(0, 10).rgb), b = histogramRGB(solid(0, 250).rgb);
  assert.ok(Math.abs(histIntersection(a, a) - 1) < 1e-6);
  assert.ok(histIntersection(a, b) < 1e-6);
  let sum = 0;
  for (const v of a) sum += v;
  assert.ok(Math.abs(sum - 1) < 1e-6, "合計 1 に正規化されていない");
});

test("edgeDensity / laplacianVar: 市松 > ぼけ、無地は 0", () => {
  const ck = checker(0), bl = blurry(0), fl = solid(0, 128, 48, 48);
  assert.ok(edgeDensity(ck.gray, 48, 48) > edgeDensity(bl.gray, 48, 48));
  assert.equal(edgeDensity(fl.gray, 48, 48), 0);
  assert.ok(laplacianVar(ck.gray, 48, 48) > laplacianVar(bl.gray, 48, 48) * 10);
  assert.equal(laplacianVar(fl.gray, 48, 48), 0);
});

test("meanU8 / meanAbsDiffU8 / satMeanRGB: 端の値", () => {
  assert.equal(meanU8(solid(0, 0).gray), 0);
  assert.ok(Math.abs(meanU8(solid(0, 255).gray) - 255) <= 1);
  assert.equal(meanAbsDiffU8(solid(0, 10).gray, solid(0, 10).gray), 0);
  assert.ok(meanAbsDiffU8(solid(0, 0).gray, solid(0, 255).gray) > 250);
  assert.equal(satMeanRGB(solid(0, 128).rgb), 0);
  const red = frame(0, 8, 8, () => [255, 0, 0]);
  assert.ok(Math.abs(satMeanRGB(red.rgb) - 1) < 1e-6);
  assert.equal(satMeanRGB(solid(0, 0).rgb), 0, "真っ黒で 0 除算していない");
});

/* ── ② ショット境界 ───────────────────────────────────────── */

test("sceneDiff: 同じ絵は 0、黒 → 白は大きい", () => {
  const a = solid(0, 40), b = solid(0.25, 40), c = solid(0.5, 230);
  assert.ok(sceneDiff(a, b).score < 1e-6);
  const d = sceneDiff(b, c);
  assert.ok(d.score > 0.5, `黒→白が小さすぎる (${d.score})`);
  assert.ok(d.hist >= 0 && d.hist <= 1 && d.luma >= 0 && d.luma <= 1 && d.edge >= 0 && d.edge <= 1);
  assert.deepEqual(sceneDiff(null, b), { score: 0, hist: 0, luma: 0, edge: 0 });
});

test("boundariesFromDiffs: 1 本の山は cut、連続した中程度は 1 つの fade にまとまる", () => {
  const cut = boundariesFromDiffs([0, 0.9, 0], { threshold: 0.28 });
  assert.equal(cut.length, 1);
  assert.equal(cut[0].index, 1);
  assert.equal(cut[0].kind, "cut");
  // 中程度（0.15 前後）が続き、合計が threshold*1.5 を超える → fade 1 本
  const fade = boundariesFromDiffs([0.02, 0.15, 0.16, 0.15, 0.02], { threshold: 0.28 });
  assert.equal(fade.length, 1, "フェードが 1 本にまとまっていない");
  assert.equal(fade[0].kind, "fade");
  assert.equal(fade[0].index, 2, "重心が境界位置になっていない");
  // 単発の弱い変化は境界にしない（手ぶれ・露出のふらつきで切らない）
  assert.deepEqual(boundariesFromDiffs([0.02, 0.1, 0.02], { threshold: 0.28 }), []);
  // 強い変化が連続しても 1 本
  assert.equal(boundariesFromDiffs([0.9, 0.9, 0.9], { threshold: 0.28 }).length, 1);
});

test("mergeShortShots: minShot 未満は隣へ併合される", () => {
  const merged = mergeShortShots([
    { start: 0, end: 1, score: 0 }, { start: 1, end: 1.2, score: 0.9 },
    { start: 1.2, end: 3, score: 0.3 },
  ], 0.6);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].start, 0);
  assert.equal(merged[merged.length - 1].end, 3);
  for (const s of merged) assert.ok(s.end - s.start >= 0.6 - 1e-9);
});

test("detectScenes: 無地はショット 1 つ、切替はちょうど 2 つ", () => {
  const flat = detectScenes(seq((t) => solid(t, 120), 12));
  assert.equal(flat.length, 1);
  assert.equal(flat[0].start, 0);
  assert.ok(Math.abs(flat[0].end - 3) < 1e-9, "末尾が最後のフレーム + 1 間隔になっていない");

  const cut = detectScenes(seq((t, i) => solid(t, i < 8 ? 20 : 235), 16));
  assert.equal(cut.length, 2, "切替が 1 箇所として拾えていない");
  assert.ok(Math.abs(cut[0].end - 2) < 1e-9, `境界が 2.0s でない (${cut[0].end}）`);
  assert.equal(cut[1].start, cut[0].end, "ショットの間に隙間がある");
  assert.equal(cut[0].score, 0, "先頭ショットの score は 0（開始境界が無い）");
  assert.ok(cut[1].score > 0.5, "境界の強さが入っていない");
});

test("detectScenes: フェードは 1 本の境界にまとまる", () => {
  const ramp = [0, 0, 0, 0, 40, 80, 120, 160, 200, 240, 255, 255, 255, 255];
  const scenes = detectScenes(seq((t, i) => solid(t, ramp[i]), ramp.length));
  assert.equal(scenes.length, 2, `フェードが ${scenes.length} 本に割れた`);
  assert.ok(scenes[0].end > 0.9 && scenes[0].end < 2.6, `境界がフェードの外 (${scenes[0].end})`);
});

test("detectScenes: 短すぎるショットは併合され minShot を守る", () => {
  // 2 フレーム（0.5s）ごとに切り替わる = minShot 0.6 未満
  const scenes = detectScenes(seq((t, i) => solid(t, (i % 4) < 2 ? 20 : 235), 12), { minShot: 0.6 });
  assert.ok(scenes.length >= 1);
  for (const s of scenes) assert.ok(s.end - s.start >= 0.6 - 1e-9, `${s.end - s.start}s のショットが残った`);
  assert.equal(scenes[0].start, 0);
  assert.ok(Math.abs(scenes[scenes.length - 1].end - 3) < 1e-9);
});

test("detectScenes: 空・1 フレームでも落ちない", () => {
  assert.deepEqual(detectScenes([]), []);
  const one = detectScenes([solid(0, 0)]);
  assert.equal(one.length, 1);
  allFinite([one[0].start, one[0].end, one[0].score], "1 フレームのショット");
  assert.ok(one[0].end > one[0].start);
});

/* ── ③ curve と手ぶれ ─────────────────────────────────────── */

test("motionCurve: 静止は 0・動く四角は反応する", () => {
  const still = motionCurve(seq((t) => square(t, 10, 10), 6));
  inUnit(still, "motion(静止)");
  for (const v of still.values) assert.equal(v, 0);
  const moving = motionCurve(seq((t, i) => square(t, 10 + i * 6, 10), 6));
  inUnit(moving, "motion(動く)");
  assert.ok(moving.values[3] > 0.2, `動きが弱すぎる (${moving.values[3]})`);
  assert.equal(moving.hz, 4);
  assert.equal(moving.values.length, 6);
});

test("sharpnessCurve: 市松 > ぼけ、無地は 0", () => {
  const sharp = sharpnessCurve([checker(0)]);
  const soft = sharpnessCurve([blurry(0)]);
  const flat = sharpnessCurve([solid(0, 128, 48, 48)]);
  inUnit(sharp, "sharp(市松)");
  assert.ok(sharp.values[0] > 0.8, `市松が鮮鋭と判定されない (${sharp.values[0]})`);
  assert.ok(soft.values[0] < 0.2, `ぼけが鮮鋭扱いされている (${soft.values[0]})`);
  assert.equal(flat.values[0], 0);
});

test("brightnessCurve / saturationCurve: 端と中央", () => {
  const b = brightnessCurve([solid(0, 0), solid(0.25, 128), solid(0.5, 255)]);
  inUnit(b, "bright");
  assert.equal(b.values[0], 0);
  assert.ok(Math.abs(b.values[1] - 0.5) < 0.02);
  assert.ok(b.values[2] > 0.99);
  const s = saturationCurve([solid(0, 128), frame(0.25, 8, 8, () => [255, 0, 0])]);
  inUnit(s, "sat");
  assert.equal(s.values[0], 0);
  assert.ok(s.values[1] > 0.99);
});

test("curve は空の入力でも {hz:0, values:[]} を返す", () => {
  for (const fn of [motionCurve, sharpnessCurve, brightnessCurve, saturationCurve]) {
    const c = fn([]);
    assert.deepEqual(c.values, []);
    assert.equal(c.hz, 0);
  }
});

test("estimateShift: 平行移動を当てる", () => {
  const a = square(0, 10, 10), b = square(0.25, 12, 10);
  const s = estimateShift(a.gray, b.gray, 64, 64, 3);
  assert.equal(s.dx, 2);
  assert.equal(s.dy, 0);
  const same = estimateShift(a.gray, a.gray, 64, 64, 3);
  assert.deepEqual([same.dx, same.dy], [0, 0]);
});

test("shakeScore: 静止 0 / 滑らかなパンは低い / 往復する揺れは高い", () => {
  const still = shakeScore(seq((t) => square(t, 20, 20), 8));
  const pan = shakeScore(seq((t, i) => square(t, 10 + i, 20), 8));
  const shaky = shakeScore(seq((t, i) => square(t, 20 + (i % 2 ? 3 : 0), 20 + (i % 2 ? 0 : 2)), 8));
  for (const v of [still, pan, shaky]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
  assert.equal(still, 0);
  assert.ok(pan < 0.25, `滑らかなパンが手ぶれ扱い (${pan})`);
  assert.ok(shaky > pan + 0.2, `揺れを拾えていない (揺れ ${shaky} / パン ${pan})`);
  assert.equal(shakeScore([square(0, 0, 0)]), 0, "1 フレームで 0 を返さない");
});

test("真っ黒な素材でも全ての指標が NaN にならない", () => {
  const black = seq((t) => solid(t, 0, 32, 32), 5);
  const curves = [motionCurve(black), sharpnessCurve(black), brightnessCurve(black), saturationCurve(black)];
  for (const c of curves) inUnit(c, "真っ黒");
  assert.equal(shakeScore(black), 0);
  const scenes = detectScenes(black);
  assert.equal(scenes.length, 1);
  allFinite([scenes[0].start, scenes[0].end, scenes[0].score], "真っ黒のショット");
});

test("detectFaces: FaceDetector が無い環境では null（落ちない）", async () => {
  assert.equal(await detectFaces({ videoWidth: 640, videoHeight: 480 }, [0, 1]), null);
  assert.equal(await detectFaces(null, [0]), null);
});

/* ── ④ 最良区間・要約 ─────────────────────────────────────── */

/** 前半 4 秒は「動きもピントも無い」、後半 4 秒は「良い」8 秒の素材 */
function fakeAnalysis(over) {
  const hz = 2, n = 16;
  const at = (i, lo, hi) => (i < n / 2 ? lo : hi);
  const a = {
    version: 1,
    scenes: [{ start: 0, end: 4, score: 0 }, { start: 4, end: 8, score: 0.8 }],
    motion: { hz, values: Array.from({ length: n }, (_, i) => at(i, 0.05, 0.5)) },
    sharp: { hz, values: Array.from({ length: n }, (_, i) => at(i, 0.1, 0.9)) },
    bright: { hz, values: Array.from({ length: n }, () => 0.5) },
    sat: { hz, values: Array.from({ length: n }, () => 0.4) },
    faces: null, loudness: null, silence: [], speech: null, beats: null,
    highlights: [], duration: 8, shake: 0.1, warnings: [],
  };
  return Object.assign(a, over || null);
}

test("sampleCurve / meanCurve / curveDuration: 読み取りの基本", () => {
  const c = { hz: 2, values: [0, 0.5, 1] };
  assert.equal(sampleCurve(c, 0), 0);
  assert.equal(sampleCurve(c, 0.5), 0.5);
  assert.ok(Math.abs(sampleCurve(c, 0.25) - 0.25) < 1e-9);
  assert.equal(sampleCurve(c, 99), 1, "末尾で clamp していない");
  assert.equal(sampleCurve(null, 1, -7), -7);
  assert.ok(Math.abs(meanCurve(c, 0, 1) - 0.5) < 1e-6);
  assert.equal(curveDuration(c), 1.5);
  assert.equal(curveDuration(null), 0);
});

test("analysisDuration / sceneBoundaries / faceRatio", () => {
  assert.equal(analysisDuration(fakeAnalysis()), 8);
  assert.equal(analysisDuration(null), 0);
  assert.deepEqual(sceneBoundaries(fakeAnalysis()), [4]);
  assert.equal(faceRatio(null, 0, 1), null);
  const faces = [{ t: 0, boxes: [] }, { t: 1, boxes: [[0.1, 0.1, 0.2, 0.2]] }];
  assert.equal(faceRatio(faces, 0, 2), 0.5);
  assert.equal(faceRatio(faces, 5, 6), 0, "区間に何も無ければ 0");
});

test("scoreRange: 良い区間の方が高く、値は 0..1、why は日本語", () => {
  const A = fakeAnalysis();
  const bad = scoreRange(A, 0, 2), good = scoreRange(A, 5, 7);
  for (const r of [bad, good]) {
    assert.ok(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1, `score が範囲外 (${r.score})`);
    assert.equal(typeof r.why, "string");
    assert.ok(r.why.length > 0);
  }
  assert.ok(good.score > bad.score, "良い区間が高く出ない");
  // ショット境界を跨ぐ窓は罰則を受ける
  const across = scoreRange(A, 3, 5);
  assert.ok(across.why.includes("境界"), `境界の理由が出ない: ${across.why}`);
});

test("pickBestRange: 境界を避けて後半（動き・ピントが良い側）を選ぶ", () => {
  const A = fakeAnalysis();
  const r = pickBestRange(A, { want: 2, in: 0, out: 8 });
  allFinite([r.in, r.out, r.score], "pickBestRange");
  assert.ok(r.in >= 4 - 1e-6, `後半を選んでいない (in=${r.in})`);
  assert.ok(Math.abs(r.out - r.in - 2) < 1e-6, "want の尺になっていない");
  assert.ok(r.out <= 8 + 1e-9, "素材の外へ出た");
  assert.ok(r.score > 0 && r.score <= 1);
  assert.equal(typeof r.why, "string");
  assert.ok(r.why.includes("s:"), `why の形が違う: ${r.why}`);
});

test("pickBestRange: 解析が空・尺が 0 でも NaN を返さない", () => {
  const empty = pickBestRange({}, { want: 3 });
  allFinite([empty.in, empty.out, empty.score], "空の analysis");
  assert.equal(empty.in, 0);
  assert.equal(empty.score, 0);
  assert.ok(empty.why.length > 0);
  const tiny = pickBestRange(fakeAnalysis(), { want: 30, in: 0, out: 8 });
  assert.ok(Math.abs(tiny.out - tiny.in - 8) < 1e-9, "素材より長い want は素材の長さに収める");
});

test("pickHighlights: 重ならず・降順の点で・素材の中に収まる", () => {
  const list = pickHighlights(fakeAnalysis(), { count: 3, want: 1.5 });
  assert.ok(list.length >= 1 && list.length <= 3);
  let prevEnd = -1;
  for (const h of list) {
    allFinite([h.start, h.end, h.score], "highlight");
    assert.ok(h.start >= 0 && h.end <= 8 + 1e-9);
    assert.ok(h.start > prevEnd - 1e-9, "見せ場が重なっている");
    prevEnd = h.end;
    assert.equal(typeof h.why, "string");
  }
  assert.deepEqual(pickHighlights({}), []);
});

test("summarizeForLLM: 中身と長さの上限", () => {
  const s = summarizeForLLM(fakeAnalysis());
  assert.ok(s.includes("2 ショット"), `ショット数が無い: ${s}`);
  assert.ok(s.includes("付近が最良"), `最良の位置が無い: ${s}`);
  assert.ok(s.length <= 400);
  const cut = summarizeForLLM(fakeAnalysis(), { maxChars: 40 });
  assert.ok(cut.length <= 40, `maxChars を超えた (${cut.length})`);
  assert.ok(cut.endsWith("…"));
  const withFaces = summarizeForLLM(fakeAnalysis({ faces: [{ t: 0, boxes: [[0, 0, 0.2, 0.2]] }], beats: { bpm: 128 } }));
  assert.ok(withFaces.includes("顔あり") && withFaces.includes("BPM 128"));
  assert.equal(typeof summarizeForLLM(null), "string");
});

/* ── ⑤ 追跡と自動リフレーム（track.js） ───────────────────── */

test("normalizeBox / boxCenter / largestBox: 配列でも物でも受ける", () => {
  assert.deepEqual(normalizeBox([0.1, 0.2, 0.3, 0.4]), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assert.deepEqual(normalizeBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assert.equal(normalizeBox(null), null);
  assert.equal(normalizeBox({ x: 0, y: 0, w: 0, h: 0 }), null);
  // 画素で書かれた枠は素材の大きさで直す
  assert.deepEqual(normalizeBox([10, 20, 30, 40], 100, 200), { x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
  assert.deepEqual(boxCenter([0.2, 0.2, 0.4, 0.4]), { x: 0.4, y: 0.4 });
  assert.deepEqual(largestBox([[0, 0, 0.1, 0.1], [0, 0, 0.5, 0.5]]), { x: 0, y: 0, w: 0.5, h: 0.5 });
  assert.equal(largestBox([]), null);
});

test("halfGray / extractPatch / ncc: 相関の土台", () => {
  const f = square(0, 8, 8, 16);
  const half = halfGray(f.gray, 64, 64);
  assert.equal(half.w, 32);
  assert.equal(half.h, 32);
  assert.equal(half.gray.length, 32 * 32);
  const p = extractPatch(f.gray, 64, 64, { x: 8, y: 8, w: 4, h: 4 });
  assert.equal(p.length, 16);
  for (const v of p) assert.equal(v, 255);
  assert.ok(Math.abs(ncc(p, p) - 0) < 1e-9, "無地同士は 0（0 除算しない）");
  const a = extractPatch(f.gray, 64, 64, { x: 6, y: 6, w: 8, h: 8 });
  assert.ok(Math.abs(ncc(a, a) - 1) < 1e-6, "同じ模様の相関が 1 でない");
  assert.equal(ncc(null, null), 0);
});

test("trackSubject: 動く四角に付いていき、conf は 0..1", () => {
  const frames = seq((t, i) => square(t, 10 + i * 2, 20, 12), 8);
  const out = trackSubject(frames, { box: { x: 8 / 64, y: 18 / 64, w: 16 / 64, h: 16 / 64 } });
  assert.equal(out.length, 8);
  out.forEach((s, i) => {
    allFinite([s.t, s.conf, s.box.x, s.box.y, s.box.w, s.box.h], `track[${i}]`);
    assert.ok(s.conf >= 0 && s.conf <= 1, `conf が範囲外 (${s.conf})`);
    assert.ok(s.box.x >= 0 && s.box.x + s.box.w <= 1 + 1e-9, "枠が画面の外へ出た");
    const px = s.box.x * 64;
    assert.ok(Math.abs(px - (8 + i * 2)) <= 2, `追跡が外れた frame ${i}: x=${px}`);
  });
  assert.ok(out[7].conf > 0.8, `終盤の conf が低い (${out[7].conf})`);
});

test("trackSubject: 無地・枠なし・空でも NaN を返さない", () => {
  const black = seq((t) => solid(t, 0, 32, 32), 4);
  const out = trackSubject(black, { box: [0.3, 0.3, 0.2, 0.2] });
  for (const s of out) {
    allFinite([s.conf, s.box.x, s.box.y], "無地の追跡");
    // 枠は素材の画素へ丸める（0.3 * 32px = 9.6 → 10px）。見失った間は動かない事を見る
    assert.equal(s.box.x, out[0].box.x, "見失ったら枠を動かさない");
    assert.ok(Math.abs(s.box.x - 0.3) < 1 / 32);
  }
  assert.equal(out[1].conf, 0, "無地で conf が 0 でない");
  assert.deepEqual(trackSubject([], { box: [0, 0, 1, 1] }), []);
  const noBox = trackSubject(black, {});
  assert.equal(noBox.length, 4);
  for (const s of noBox) assert.equal(s.conf, 0);
  assert.throws(() => trackSubject(black, { box: [0, 0, 1, 1], method: "flow" }), /template/);
});

test("parseRatio: 文字でも数でも比になる", () => {
  assert.ok(Math.abs(parseRatio("9:16") - 0.5625) < 1e-9);
  assert.ok(Math.abs(parseRatio("16/9") - 16 / 9) < 1e-9);
  assert.equal(parseRatio(1.5), 1.5);
  assert.ok(Math.abs(parseRatio("ばなな", 2) - 2) < 1e-9);
});

test("motionCentroid: 動いた所に寄る・静止は null", () => {
  const a = square(0, 4, 28, 8), b = square(0.25, 40, 28, 8);
  const c = motionCentroid(a.gray, b.gray, 64, 64);
  assert.ok(c && Number.isFinite(c.x) && c.x > 0.2 && c.x < 0.8);
  assert.ok(c.energy > 0 && c.energy <= 1);
  assert.equal(motionCentroid(a.gray, a.gray, 64, 64), null);
  assert.equal(motionCentroid(null, null, 64, 64), null);
});

test("autoReframeCurve: 9:16 の窓が画面から出ず、滑らかに右へ動く", () => {
  const frames = seq((t, i) => square(t, 8 + i * 4, 24, 12), 9);
  const track = trackSubject(frames, { box: { x: 6 / 64, y: 22 / 64, w: 16 / 64, h: 16 / 64 } });
  const curve = autoReframeCurve(frames, { targetRatio: "9:16", focus: track, smooth: 0.6 });
  assert.equal(curve.length, 9);
  const cw = 0.5625;
  let prev = -1;
  for (const k of curve) {
    allFinite([k.t, k.x, k.y, k.scale], "reframe");
    assert.ok(k.x >= cw / 2 - 1e-9 && k.x <= 1 - cw / 2 + 1e-9, `窓が画面外 (${k.x})`);
    assert.ok(Math.abs(k.y - 0.5) < 1e-9, "縦は使い切るので中央のまま");
    assert.ok(Math.abs(k.scale - 1 / cw) < 1e-6, `scale が違う (${k.scale})`);
    assert.ok(k.x >= prev - 1e-9, "右へ動く被写体に対して窓が戻った");
    prev = k.x;
  }
  assert.ok(curve[8].x > curve[0].x + 0.05, "窓が追従していない");
});

test("autoReframeCurve: focus 無し（動き）/ 1 フレーム / 横長の対象でも壊れない", () => {
  const frames = seq((t, i) => square(t, 8 + i * 5, 24, 10), 6);
  const auto = autoReframeCurve(frames, { targetRatio: 0.5625 });
  assert.equal(auto.length, 6);
  assert.ok(auto[5].x > auto[0].x, "動きに追従していない");
  const one = autoReframeCurve([square(0, 10, 10)], { targetRatio: "1:1" });
  assert.equal(one.length, 1);
  allFinite([one[0].x, one[0].y, one[0].scale], "1 フレームの reframe");
  assert.equal(one[0].scale, 1, "同じ比なら拡大しない");
  const wide = autoReframeCurve(frames, { targetRatio: "16:9", focus: "center" });
  for (const k of wide) {
    assert.ok(Math.abs(k.x - 0.5) < 1e-9);
    assert.ok(k.scale >= 1);
  }
  assert.deepEqual(autoReframeCurve([], {}), []);
});

/* ── ⑥ analyzeAsset（組み立て・壊れない事） ───────────────── */

const blobStorage = () => ({
  getAssetBlob: async () => new Blob([new Uint8Array(32)], { type: "audio/mpeg" }),
});

test("emptyAnalysis / needsAnalysis / kindOf", () => {
  const a = emptyAnalysis();
  assert.equal(a.version, ANALYSIS_VERSION);
  for (const k of ["scenes", "motion", "sharp", "bright", "sat", "faces", "loudness", "silence", "speech", "beats", "highlights"]) {
    assert.ok(k in a, `${k} が無い`);
  }
  assert.equal(needsAnalysis({ analysis: a }), false);
  assert.equal(needsAnalysis({ analysis: { ...a, version: 0 } }), true);
  assert.equal(needsAnalysis({}), true);
  assert.equal(kindOf({ kind: "audio" }), "audio");
  assert.equal(kindOf({ mime: "image/png" }), "image");
  assert.equal(kindOf({ mime: "audio/mp4" }), "audio");
  assert.equal(kindOf({}), "video");
});

test("analyzeAsset: version が同じなら作り直さない（同じ物が返る）", async () => {
  const analysis = emptyAnalysis();
  const asset = { id: "as_1", kind: "video", duration: 3, analysis };
  const got = await analyzeAsset(asset, { storage: blobStorage() });
  assert.equal(got, analysis, "再計算してしまっている");
});

test("analyzeAsset: 映像 API が無い Node でも落ちず、理由が warnings に残る", async () => {
  const asset = { id: "as_2", kind: "video", duration: 4, storage: { kind: "idb", key: "k" }, hasAudio: false };
  const a = await analyzeAsset(asset, { storage: blobStorage() });
  assert.equal(a.version, ANALYSIS_VERSION);
  assert.deepEqual(a.scenes, []);
  assert.equal(a.motion, null);
  assert.ok(Array.isArray(a.warnings) && a.warnings.length >= 1, "諦めた理由が無い");
  assert.ok(a.warnings.some((w) => w.includes("映像")), a.warnings.join(" / "));
  allFinite([a.duration, a.shake], "analysis の数");
});

test("analyzeAsset: 音だけの素材でも落ちない（loudness は null のまま）", async () => {
  const asset = { id: "as_3", kind: "audio", duration: 6, storage: { kind: "idb", key: "k" }, hasAudio: true };
  const a = await analyzeAsset(asset, { storage: blobStorage() });
  assert.equal(a.version, ANALYSIS_VERSION);
  assert.equal(a.loudness, null, "Node では decode できないので null のまま");
  assert.deepEqual(a.scenes, []);
  assert.ok(a.warnings.length >= 1);
  assert.equal(a.duration, 6);
});

test("analyzeAsset: 画像でも落ちない", async () => {
  const asset = { id: "as_4", kind: "image", duration: 0, storage: { kind: "idb", key: "k" } };
  const a = await analyzeAsset(asset, { storage: blobStorage() });
  assert.equal(a.version, ANALYSIS_VERSION);
  assert.equal(a.shake, 0);
  assert.deepEqual(a.highlights, []);
});

test("analyzeAsset: 進捗は 0..1 で単調に届き、中止は AbortError", async () => {
  const seen = [];
  await analyzeAsset({ id: "as_5", kind: "video", duration: 2, storage: { kind: "idb", key: "k" }, hasAudio: false },
    { storage: blobStorage(), onProgress: (p) => seen.push(p) });
  assert.ok(seen.length >= 2);
  allFinite(seen, "progress");
  for (const p of seen) assert.ok(p >= 0 && p <= 1);
  assert.equal(seen[seen.length - 1], 1);

  const aborted = { aborted: true, addEventListener() {}, removeEventListener() {} };
  await assert.rejects(
    () => analyzeAsset({ id: "as_6", kind: "video", duration: 2 }, { signal: aborted }),
    (e) => e.name === "AbortError",
  );
  await assert.rejects(() => analyzeAsset(null), /asset/);
});

test("analyzeAssets: 1 つ失敗しても止まらない", async () => {
  const out = await analyzeAssets([
    { id: "a", kind: "audio", duration: 1, storage: { kind: "idb", key: "k" } },
    null,
  ], { storage: blobStorage() });
  assert.equal(out.length, 2);
  assert.equal(out[0].assetId, "a");
  assert.ok(out[0].analysis && out[0].analysis.version === ANALYSIS_VERSION);
  assert.equal(out[1].analysis, null);
  assert.ok(typeof out[1].error === "string" && out[1].error.length > 0);
});

test("frameFromSource: 偽の canvas で gray/rgb の詰め方を固定する", () => {
  // ブラウザの canvas は Node に無いので、getImageData だけを返す偽物を渡す
  const w = 8, h = 6, px = w * h;
  const data = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) { data[i * 4] = 255; data[i * 4 + 3] = 255; } // 真っ赤
  let drawn = 0;
  const canvas = { getContext: () => ({ drawImage: () => { drawn++; }, getImageData: () => ({ data }) }) };
  const f = frameFromSource({ width: w, height: h }, { size: w, t: 1.5, canvas });
  assert.equal(drawn, 1);
  assert.equal(f.t, 1.5);
  assert.deepEqual(frameDims(f), { w, h });
  assert.equal(f.gray.length, px);
  assert.equal(f.rgb.length, px * 3, "rgb は 3 バイト詰め（RGBA ではない）");
  assert.deepEqual([f.rgb[0], f.rgb[1], f.rgb[2]], [255, 0, 0]);
  assert.equal(f.gray[0], (255 * 77) >> 8, "BT.601 の整数近似になっていない");
  assert.ok(Math.abs(satMeanRGB(f.rgb) - 1) < 1e-6);
  assert.throws(() => frameFromSource({}, { size: 8 }), /大きさ/);
});

test("sceneDiffs: 長さはフレーム数 - 1・値は 0..1", () => {
  const frames = seq((t, i) => solid(t, i < 3 ? 10 : 240), 6);
  const d = sceneDiffs(frames);
  assert.equal(d.length, 5);
  allFinite(d, "sceneDiffs");
  for (const v of d) assert.ok(v >= 0 && v <= 1);
  assert.ok(d[2] > 0.5, "切替の所が高くない");
  assert.deepEqual(sceneDiffs([solid(0, 0)]), []);
});

/* ── ⑦ 回帰（一度やった間違いを二度としないため） ─────────────── */

test("boundariesFromDiffs: 動きが続く中のカットは位置がずれず、2 回目も落ちない", () => {
  // パン（0.15 が続く）の 6 枚目でカット。塊全体の重心で決めると index 18 付近まで
  // 流れてしまう（境界の時刻が 3 秒ずれる）ので、強い所だけを拾う事を固定する
  const pan = new Array(5).fill(0.15).concat([0.9], new Array(35).fill(0.15));
  const one = boundariesFromDiffs(pan, { threshold: 0.28 });
  assert.equal(one.length, 1, "カットが 1 本だけ出ていない");
  assert.equal(one[0].index, 5, `カットの位置がずれた (${one[0].index})`);
  assert.equal(one[0].kind, "cut");
  // 同じ塊の中に 2 回カットが在れば 2 本とも出す（1 本に潰すと後半が丸ごと 1 ショットになる）
  const two = boundariesFromDiffs([0.15, 0.15, 0.9, 0.15, 0.15, 0.15, 0.85, 0.15], { threshold: 0.28 });
  assert.deepEqual(two.map((b) => b.index), [2, 6], `2 回のカットを拾えていない: ${JSON.stringify(two)}`);
});

test("sceneDiffs: gray だけの Frame では色の重みを落とす（全フレームが境界にならない）", () => {
  const grayOnly = (t, v) => { const f = solid(t, v, 32, 24); return { t, w: f.w, h: f.h, gray: f.gray }; };
  const same = [grayOnly(0, 100), grayOnly(0.25, 100), grayOnly(0.5, 100), grayOnly(0.75, 100)];
  for (const v of sceneDiffs(same)) assert.equal(v, 0, "同じ絵なのに差が出ている（零ヒストグラム同士を別の絵と読んでいる）");
  assert.equal(detectScenes(same).length, 1, "無地の gray 列がショットに割れた");
  // 輝度だけでも本物の切替は拾える
  const cut = [grayOnly(0, 20), grayOnly(0.25, 20), grayOnly(0.5, 235), grayOnly(0.75, 235),
    grayOnly(1, 235), grayOnly(1.25, 235)];
  assert.equal(detectScenes(cut, { minShot: 0.3 }).length, 2, "gray だけだと切替を拾えない");
});

test("sampleFrames: 枚数の上限に当たっても素材の最後まで見る", async () => {
  // 偽の <video>（seek は同期で返る）と偽の canvas で、DOM 無しに枚数と時刻だけ確かめる
  const hadRaf = "requestAnimationFrame" in globalThis, hadOC = "OffscreenCanvas" in globalThis;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.px = new Uint8ClampedArray(w * h * 4); }
    getContext() { return { drawImage: () => {}, getImageData: () => ({ data: this.px }) }; }
  };
  const fakeVideo = (dur) => {
    const subs = new Map();
    let t = 0;
    return {
      readyState: 2, duration: dur, videoWidth: 640, videoHeight: 360, pause() {},
      get currentTime() { return t; },
      set currentTime(v) { t = v; for (const f of subs.get("seeked") || []) f(); },
      addEventListener(k, f) { subs.set(k, (subs.get(k) || []).concat(f)); },
      removeEventListener(k, f) { subs.set(k, (subs.get(k) || []).filter((x) => x !== f)); },
    };
  };
  try {
    // 600s を 4hz で頼むと 2400 枚。上限 2000 枚でも「先頭 500 秒だけ」にしてはいけない
    const long = await sampleFrames(fakeVideo(600), { hz: 4, size: 8 });
    assert.ok(long.length <= 2000, `枚数の上限を超えた (${long.length})`);
    assert.ok(long[long.length - 1].t > 600 * 0.95, `素材の後半を見ていない (末尾 ${long[long.length - 1].t}s)`);
    assert.ok(long[0].t < 1, `先頭を飛ばしている (${long[0].t}s)`);
    // 短い素材でも 1 枚は返る（0 枚だと呼ぶ側が「解析できない」と誤解する）
    const tiny = await sampleFrames(fakeVideo(0.1), { hz: 4, size: 8 });
    assert.equal(tiny.length, 1);
    allFinite([tiny[0].t], "短い素材のフレーム時刻");
  } finally {
    if (!hadRaf) delete globalThis.requestAnimationFrame;
    if (!hadOC) delete globalThis.OffscreenCanvas;
  }
});

test("DEFAULT_WANT: 契約書 §1 の欄をすべて作る（speech を落とすと永久に埋まらない）", () => {
  for (const k of ["scenes", "motion", "sharp", "bright", "sat", "faces",
    "loudness", "silence", "speech", "beats", "highlights"]) {
    assert.ok(DEFAULT_WANT.includes(k), `${k} が既定の want に無い（needsAnalysis は鍵の有無しか見ないので後から足せない）`);
  }
  assert.equal(needsAnalysis({ analysis: emptyAnalysis() }, ["speech"]), false);
});
