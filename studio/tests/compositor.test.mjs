/* ══════════════════════════════════════════════════════════════════════
   tests/compositor.test.mjs — 合成器の「純粋な部分」だけの試験

   WebGL と DOM は Node で動かせないので、ここでは
     ・幾何（layerBox / modelMatrix / outSize / snapQuality）
     ・遷移の相手探し（resolvePartner / transitionPair）
     ・既定シェーダの体裁（共通規約: 1 行目が #version 300 es）
   を見る。絵が本当に出るかはブラウザ側（selftest.html と統合試験）で見る。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  layerBox, coverBox, outSize, snapQuality, resolvePartner, transitionPair,
  gradeFilter, hasCurve, hasWheel, BLEND_2D
} from "../src/engine/canvas2d.js";
import {
  layerModel, BUILTIN_TR, fillGrade, fillMask, fillChroma, fillParams, hasHsl
} from "../src/engine/compositor.js";
import { GRADE_UNIFORMS, CURVE_SIZE, HSL_BANDS, MASK_POINTS } from "../src/engine/gl/shaders.js";
import { newProject, newTrack, newClip, newAsset, defaultColorGrade } from "../src/core/schema.js";
import { clipsAt } from "../src/core/eval.js";

/** Resolved の transform の形（eval.js が返す物と同じ並び） */
function tf(patch) {
  return Object.assign({
    x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
    anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false,
    crop: { l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 }
  }, patch || {});
}
const R = (patch) => ({ transform: tf(patch), opacity: 1, blend: "normal" });

test("snapQuality は 0.25 / 0.5 / 1 の段へ寄せる", () => {
  assert.equal(snapQuality(1), 1);
  assert.equal(snapQuality(0.5), 0.5);
  assert.equal(snapQuality(0.25), 0.25);
  assert.equal(snapQuality(0.3), 0.25);
  assert.equal(snapQuality(0.9), 1);
  assert.equal(snapQuality(0.1), 0.25);       // 段より下は一番下の段
  assert.equal(snapQuality(4), 1);            // 段より上は 1 まで
  assert.equal(snapQuality("half"), 0.5);
  assert.equal(snapQuality("quarter"), 0.25);
  assert.equal(snapQuality("full"), 1);
  assert.equal(snapQuality("auto"), 1);       // auto は呼ぶ側が決める → 既定
  assert.equal(snapQuality(undefined), 1);
  assert.equal(snapQuality(null, 0.5), 0.5);
  assert.equal(snapQuality(0), 1);            // 0 は無効 → 既定
});

test("outSize は canvas の裏の大きさを真とし、quality 倍で内部を決める", () => {
  const p = newProject({ settings: { width: 1920, height: 1080 } });
  assert.deepEqual(outSize(p, 1920, 1080, 1), { W: 1920, H: 1080, w: 1920, h: 1080, q: 1 });
  assert.deepEqual(outSize(p, 1920, 1080, 0.5), { W: 1920, H: 1080, w: 960, h: 540, q: 0.5 });
  assert.deepEqual(outSize(p, 1920, 1080, 0.25), { W: 1920, H: 1080, w: 480, h: 270, q: 0.25 });
  /* canvas が未設定なら settings に頼る（resize 前に呼ばれても落ちない） */
  assert.deepEqual(outSize(p, 0, 0, 1), { W: 1920, H: 1080, w: 1920, h: 1080, q: 1 });
  /* 画面より小さい canvas（プレビュー）はその大きさで描く */
  assert.equal(outSize(p, 800, 450, 1).w, 800);
});

test("layerBox: scale 1 は contain（ui/inspector/transform.js と同じ約束）", () => {
  /* 16:9 の画面に 1:1 の素材 → 高さいっぱい・左右に余白 */
  const b = layerBox(R(), 1920, 1080, 1080, 1080);
  assert.equal(Math.round(b.w), 1080);
  assert.equal(Math.round(b.h), 1080);
  assert.equal(b.cx, 960);
  assert.equal(b.cy, 540);
  /* 縦動画を横画面へ入れても全部見える（= contain） */
  const v = layerBox(R(), 1920, 1080, 1080, 1920);
  assert.ok(v.h <= 1080 + 1e-6, "高さが画面を越えない");
  assert.equal(Math.round(v.w), 608);          // 1080 * (1080/1920)
});

test("layerBox: x/y は割合・中心が原点", () => {
  const b = layerBox(R({ x: 0.25, y: -0.5 }), 1920, 1080, 1920, 1080);
  assert.equal(b.cx, 1920 * 0.75);
  assert.equal(b.cy, 0);
});

test("layerBox: crop はその場で切り落とす（w/h はクロップ前）", () => {
  const b = layerBox(R({ crop: { l: 0.5, t: 0, r: 0, b: 0, w: 0.5, h: 1 } }), 1000, 1000, 1000, 1000);
  assert.equal(Math.round(b.w), 1000, "寸法はクロップ前");
  assert.equal(Math.round(b.h), 1000);
  assert.equal(b.cx, 500);
  assert.equal(b.crop.l, 0.5);
  assert.equal(b.crop.w, 0.5);
  /* 見えている窓は右半分（左端から 500px の所・幅 500px） */
  assert.equal(Math.round(b.vx), 500);
  assert.equal(Math.round(b.vy), 0);
  assert.equal(Math.round(b.vw), 500);
  assert.equal(Math.round(b.vh), 1000);
});

test("layerBox: scale は scaleX/scaleY に織り込まれる（二重掛けしない）", () => {
  const a = layerBox(R({ scaleX: 2 }), 1000, 1000, 1000, 1000);
  assert.equal(Math.round(a.w), 2000);
  /* eval.js は scale を 1 に固めて返す。素の clip.transform でも掛かる */
  const b = layerBox(R({ scale: 2, scaleX: 2 }), 1000, 1000, 1000, 1000);
  assert.equal(Math.round(b.w), 4000);
});

test("layerBox: anchor は回転と拡大の中心（位置は動かさない）", () => {
  const b = layerBox(R({ anchorX: 0, anchorY: 1 }), 1000, 1000, 1000, 1000);
  assert.equal(b.cx, 500, "中心は動かない");
  assert.equal(b.px, 0, "基準点は左端");
  assert.equal(b.py, 1000, "基準点は下端");
});

test("coverBox は画面を覆う（ぼかし背景用）", () => {
  const b = coverBox(1920, 1080, 1080, 1920);
  assert.ok(b.w >= 1920 - 1e-6 && b.h >= 1080 - 1e-6);
  assert.equal(b.cx, 960);
});

/** layerModel は「描画先の 0..1」へ写す（clip 空間への写しは projection が持つ） */
const atNorm = (m, u, v) => [m[0] * u + m[3] * v + m[6], m[1] * u + m[4] * v + m[7]];

test("layerModel: 画面いっぱいの箱は 0..1 へそのまま写る", () => {
  const m = layerModel({ w: 100, h: 50, cx: 50, cy: 25, px: 50, py: 25, rot: 0 }, 100, 50);
  const a = atNorm(m, 0, 0), b = atNorm(m, 1, 1);
  assert.ok(Math.abs(a[0]) < 1e-6 && Math.abs(a[1]) < 1e-6, "(0,0) → (0,0)");
  assert.ok(Math.abs(b[0] - 1) < 1e-6 && Math.abs(b[1] - 1) < 1e-6, "(1,1) → (1,1)");
});

test("layerModel: 位置と大きさ（px → 割合）", () => {
  const m = layerModel({ w: 200, h: 100, cx: 300, cy: 150, px: 300, py: 150, rot: 0 }, 400, 200);
  const a = atNorm(m, 0, 0), b = atNorm(m, 1, 1);
  assert.ok(Math.abs(a[0] - 0.5) < 1e-6, "左端は 200px = 0.5");
  assert.ok(Math.abs(a[1] - 0.5) < 1e-6, "上端は 100px = 0.5");
  assert.ok(Math.abs(b[0] - 1) < 1e-6 && Math.abs(b[1] - 1) < 1e-6, "右下は端");
});

test("layerModel: 回転は基準点まわり（90 度で縦横が入れ替わる）", () => {
  const box = { w: 100, h: 50, cx: 200, cy: 100, px: 200, py: 100, rot: Math.PI / 2 };
  const m = layerModel(box, 400, 200);
  const px = (u, v) => { const p = atNorm(m, u, v); return [p[0] * 400, p[1] * 200]; };
  const c = px(0.5, 0.5);
  assert.ok(Math.abs(c[0] - 200) < 1e-4 && Math.abs(c[1] - 100) < 1e-4, "中心は動かない");
  const e = px(1, 0.5);
  assert.ok(Math.abs(e[0] - 200) < 1e-4, "x は中心");
  assert.ok(Math.abs(e[1] - 150) < 1e-4, "y は +w/2");
});

test("layerModel: 基準点をずらすと回転の中心が動く", () => {
  const box = { w: 100, h: 100, cx: 100, cy: 100, px: 50, py: 50, rot: Math.PI };
  const m = layerModel(box, 200, 200);
  const p = atNorm(m, 0.5, 0.5);
  /* 中心 (100,100) を 基準点 (50,50) のまわりに 180 度 → (0,0) */
  assert.ok(Math.abs(p[0] * 200) < 1e-4 && Math.abs(p[1] * 200) < 1e-4, JSON.stringify(p));
});

/* ── 遷移 ─────────────────────────────────────────────────────── */
function twoClipProject(trDur) {
  return newProject({
    settings: { width: 640, height: 360, fps: 30 },
    assets: [
      newAsset({ id: "as_a", kind: "video", duration: 10, width: 640, height: 360 }),
      newAsset({ id: "as_b", kind: "video", duration: 10, width: 640, height: 360 })
    ],
    tracks: [newTrack("video", {
      id: "tr_v",
      clips: [
        newClip("video", {
          id: "cl_A", assetId: "as_a", start: 0, duration: 2, in: 0, out: 2,
          transitionOut: { type: "crossfade", duration: trDur, params: {} }
        }),
        newClip("video", { id: "cl_B", assetId: "as_b", start: 2, duration: 2, in: 1, out: 3 })
      ]
    })]
  });
}

test("resolvePartner: A の尾では相手（B）が素材を先取りして出てくる", () => {
  const p = twoClipProject(0.5);
  const list = clipsAt(p, 1.9, { fps: 30 });
  assert.equal(list.length, 1, "重なりは無い（居るのは A だけ）");
  const a = list[0];
  assert.equal(a.clip.id, "cl_A");
  assert.ok(a.transition, "遷移が乗っている");
  assert.equal(a.transition.role, "out");
  assert.equal(a.transition.otherClipId, "cl_B");
  assert.ok(a.transition.p > 0 && a.transition.p < 0.5, "A の尾は p 0→0.5: " + a.transition.p);

  const b = resolvePartner(p, a, 1.9, 30);
  assert.ok(b, "相手が引けた");
  assert.equal(b.clip.id, "cl_B");
  assert.equal(b.transition, null, "相手を さらに遷移として扱わない");
  /* B は 2.0 から始まる。1.9 は 0.1 秒手前なので in(=1) より 0.1 手前を出す */
  assert.ok(Math.abs(b.sourceTime - 0.9) < 1e-3, "素材を伸ばして 0.9 を出す: " + b.sourceTime);
});

test("resolvePartner: B の頭では相手（A）が素材を延長して出てくる", () => {
  const p = twoClipProject(0.5);
  const list = clipsAt(p, 2.1, { fps: 30 });
  const b = list[0];
  assert.equal(b.clip.id, "cl_B");
  assert.equal(b.transition.role, "in");
  assert.ok(b.transition.p > 0.5 && b.transition.p < 1, "B の頭は p 0.5→1: " + b.transition.p);
  const a = resolvePartner(p, b, 2.1, 30);
  assert.equal(a.clip.id, "cl_A");
  /* A は 0..2（素材 0..2）。2.1 は 0.1 秒はみ出すので 2.1 を出す（素材は 10 秒在る） */
  assert.ok(Math.abs(a.sourceTime - 2.1) < 1e-3, "素材を延長して 2.1: " + a.sourceTime);
});

test("resolvePartner: 素材が足りなければ端で止まる（throw しない）", () => {
  const p = newProject({
    settings: { width: 640, height: 360, fps: 30 },
    assets: [newAsset({ id: "as_s", kind: "video", duration: 2, width: 640, height: 360 })],
    tracks: [newTrack("video", {
      clips: [
        newClip("video", { id: "cl_A", assetId: "as_s", start: 0, duration: 2, in: 0, out: 2, transitionOut: { type: "crossfade", duration: 0.5, params: {} } }),
        newClip("video", { id: "cl_B", assetId: "as_s", start: 2, duration: 2, in: 0, out: 2 })
      ]
    })]
  });
  const b = clipsAt(p, 2.1, { fps: 30 })[0];
  const a = resolvePartner(p, b, 2.1, 30);
  assert.ok(a, "引けている");
  assert.ok(a.sourceTime <= 2 + 1e-6, "素材の端を越えない: " + a.sourceTime);
});

test("resolvePartner: 相手が居ない（端 / 隙間）なら null", () => {
  const p = newProject({
    settings: { width: 640, height: 360, fps: 30 },
    assets: [newAsset({ id: "as_a", kind: "video", duration: 10, width: 640, height: 360 })],
    tracks: [newTrack("video", {
      clips: [newClip("video", { id: "cl_A", assetId: "as_a", start: 0, duration: 2, in: 0, out: 2, transitionOut: { type: "crossfade", duration: 0.5, params: {} } })]
    })]
  });
  const a = clipsAt(p, 1.9, { fps: 30 })[0];
  assert.equal(a.transition.otherClipId, null, "相手は居ない（背景との遷移）");
  assert.equal(resolvePartner(p, a, 1.9, 30), null);
});

test("transitionPair: uTex は必ず前（A）・uTexB は後（B）", () => {
  const out = { transition: { role: "out", p: 0.3 } };
  const other = { id: "partner" };
  assert.deepEqual(transitionPair(out, other), { a: out, b: other, p: 0.3 });
  const into = { transition: { role: "in", p: 0.8 } };
  assert.deepEqual(transitionPair(into, other), { a: other, b: into, p: 0.8 });
  /* 相手が無いときも順番は崩れない */
  assert.deepEqual(transitionPair(out, null), { a: out, b: null, p: 0.3 });
  assert.deepEqual(transitionPair(into, null), { a: null, b: into, p: 0.8 });
});

/* ── 自前の遷移と uniform の詰め方 ───────────────────────────── */
test("自前の遷移は trApply を 1 個ずつ持つ（transitions.js が未着でも動く分）", () => {
  const want = ["crossfade", "cut", "dipToBlack", "dipToWhite", "slide", "slideUp", "whipPan", "zoomIn", "wipe", "glitch"];
  for (const k of want) {
    assert.ok(BUILTIN_TR[k], "自前の遷移に " + k + " が無い");
    assert.equal(BUILTIN_TR[k].split("vec4 trApply(").length - 1, 1, k + " の trApply は 1 個");
    assert.ok(!BUILTIN_TR[k].includes("#version"), k + " は関数だけを出す（頭は shaders.js が付ける）");
    assert.ok(BUILTIN_TR[k].includes("uTex"), k + " は uTex を読む");
  }
});

test("fillGrade は GRADE_UNIFORMS の表を全部埋める", () => {
  const u = {};
  fillGrade(u, null, null);
  for (const d of GRADE_UNIFORMS) assert.ok(u[d.name] !== undefined, d.name + " が埋まっていない");
  /* カラー無しのときは表の既定（= 効果なし）がそのまま入る */
  assert.equal(u.uGradeExposure, 0);
  assert.equal(u.uLutAmount, 0);
  assert.equal(u.uCurveRGB.length, CURVE_SIZE);
  assert.ok(Math.abs(u.uCurveRGB[CURVE_SIZE - 1] - 1) < 1e-6, "既定のカーブは恒等");
});

test("fillGrade は ColorGrade の値と curves/wheels/hsl を正しい形で渡す", () => {
  const g = Object.assign(defaultColorGrade(), {
    exposure: 0.5, contrast: -0.25, hue: 30,
    wheels: { lift: [0.1, 0.2, 0.3], gamma: [0, 0, 0], gain: [0, 0, 0], offset: [0, 0, 0] },
    hsl: [{ hue: 120, range: 20, h: 5, s: 0.3, l: -0.2 }],
    curves: { rgb: [[0, 0], [0.5, 0.9], [1, 1]], r: null, g: null, b: null, luma: null }
  });
  const u = {};
  fillGrade(u, g, null);
  assert.equal(u.uGradeExposure, 0.5);
  assert.equal(u.uGradeContrast, -0.25);
  assert.equal(u.uGradeHue, 30, "色相は度のまま渡す（shaders.js の表がそう決めている）");
  assert.deepEqual(u.uWheelLift, [0.1, 0.2, 0.3]);
  assert.equal(u.uHslHue.length, HSL_BANDS);
  assert.equal(u.uHslHue[0], 120);
  assert.equal(u.uHslRange[0], 20);
  assert.equal(u.uHslRange[1], 30, "無い帯域は既定の 30");
  assert.equal(u.uHslShift.length, HSL_BANDS * 3);
  assert.equal(u.uHslShift[0], 5);
  assert.ok(Math.abs(u.uHslShift[1] - 0.3) < 1e-6);
  assert.ok(Math.abs(u.uHslShift[2] + 0.2) < 1e-6);
  assert.equal(u.uCurveRGB.length, CURVE_SIZE);
  assert.ok(u.uCurveRGB[8] > 0.5, "中間が持ち上がっている: " + u.uCurveRGB[8]);
  /* LUT が無ければ amount は 0（素通し） */
  assert.equal(u.uLutAmount, 0);
});

test("fillMask は shaders.js の番号と度へ直す", () => {
  const u = {};
  fillMask(u, { type: "ellipse", x: 0.4, y: 0.6, w: 0.3, h: 0.2, rotateDeg: 45, feather: 0.1, invert: true, points: [] });
  assert.equal(u.uMaskType, 1, "ellipse は 1");
  assert.deepEqual(u.uMaskRect, [0.4, 0.6, 0.3, 0.2]);
  assert.equal(u.uMaskRotate, 45);
  assert.equal(u.uMaskInvert, 1);
  assert.equal(u.uMaskPoints.length, MASK_POINTS * 2);
  assert.equal(u.uMaskCount, 0);
  const v = {};
  fillMask(v, { type: "polygon", points: [[0, 0], [1, 0], [0.5, 1]], rotate: Math.PI });
  assert.equal(v.uMaskType, 2);
  assert.equal(v.uMaskCount, 3);
  assert.equal(v.uMaskPoints[4], 0.5);
  assert.ok(Math.abs(v.uMaskRotate - 180) < 1e-6, "rad しか無ければ度へ直す");
});

test("fillChroma は 0..255 で来た色も 0..1 に直す", () => {
  const u = {};
  fillChroma(u, { key: [0, 255, 0], similarity: 0.5, smoothness: 0.2, spill: 0.3 });
  assert.deepEqual(u.uChromaKey, [0, 1, 0]);
  assert.equal(u.uChromaSim, 0.5);
  const v = {};
  fillChroma(v, { key: "#00ff00", similarity: 2 });
  assert.deepEqual(v.uChromaKey, [0, 1, 0]);
  assert.equal(v.uChromaSim, 1, "範囲外は丸める");
});

test("fillParams は uFx_<paramKey> に化ける（色は vec3）", () => {
  const u = {};
  fillParams(u, { amount: 0.5, on: true, tint: "#ff0000", pos: [1, 2], name: "むり" });
  assert.equal(u.uFx_amount, 0.5);
  assert.equal(u.uFx_on, 1);
  assert.deepEqual(u.uFx_tint, [1, 0, 0]);
  assert.deepEqual(u.uFx_pos, [1, 2]);
  assert.equal(u.uFx_name, undefined, "色でない文字列は渡さない");
});

test("hasHsl は動いている帯域だけを見る", () => {
  assert.equal(hasHsl(defaultColorGrade().hsl), false);
  assert.equal(hasHsl([{ hue: 100, range: 30, h: 0, s: 0, l: 0 }]), false);
  assert.equal(hasHsl([{ hue: 100, range: 30, h: 0, s: 0.4, l: 0 }]), true);
});

/* ── 2d の申告 ───────────────────────────────────────────────── */
test("gradeFilter は出せる物だけを filter にし、残りを申告する", () => {
  const miss = new Set();
  const g = Object.assign(defaultColorGrade(), { exposure: 0.2, saturation: 0.5, vignette: 0.4, sharpen: 0.3 });
  const f = gradeFilter(g, miss, 1);
  assert.ok(f.includes("brightness("), f);
  assert.ok(f.includes("saturate("), f);
  assert.ok(miss.has("grade.vignette"), "ビネットは 2d では出せない");
  assert.ok(miss.has("grade.sharpen"));
  assert.equal(gradeFilter(null, miss, 1), "none");
});

test("カーブ・ホイールが動いているかを見分ける", () => {
  assert.equal(hasCurve(defaultColorGrade().curves), false);
  assert.equal(hasCurve({ rgb: [[0, 0], [0.5, 0.8], [1, 1]] }), true);
  assert.equal(hasWheel(defaultColorGrade().wheels), false);
  assert.equal(hasWheel({ lift: [0.1, 0, 0] }), true);
});

test("blend の対応表は契約書 §1 の 9 種すべてを持つ", () => {
  for (const m of ["normal", "add", "screen", "multiply", "overlay", "softlight", "difference", "lighten", "darken"]) {
    assert.ok(BLEND_2D[m], m + " が無い");
  }
});
