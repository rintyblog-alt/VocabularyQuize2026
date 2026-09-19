/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/preview-math.test.mjs — プレビュー上の算数（ui/preview.js）

   ★ 何を固定するか
     ① 画面 ↔ プロジェクトの座標変換（往復して元に戻る・ズームとパンを織り込む）
     ② 箱の計算（scale 1 = contain / x,y = 割合 / クロップは「その場で切り落とす」）
     ③ 回転した箱の local ↔ 世界の往復、基準点（anchor）が中心でない場合
     ④ ハンドルの当たり判定（角が辺より先・指は 28px・クロップ窓・本体）
     ⑤ 値の丸め（clampTransform が **入力を書き換えない**・部分 patch のまま返す）
     ⑥ 引いた先からの寸法（比率保持・中心基準・下限）とクロップの比率固定
     ⑦ 整列ガイドの選び方（一番近い候補・範囲外は null）

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026/studio && npm test
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/preview-math.test.mjs

   ★ 注意
     ui/preview.js は import しただけでは DOM を触らない（触るのは
     `createPreview()` の中だけ）。だから Node で読める。ここが崩れると
     この試験が真っ先に落ちる = 見張りにもなっている。
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  makeView, projectToStage, stageToProject,
  clipBox, boxToStage, boxPoint, boxLocal, handlePoints, hitHandle,
  clampTransform, resizeFromHandle, cropFromHandle, ratioCrop,
  alignSnap, fillScaleFor, normalizeAngle, snapAngle,
  PREVIEW_MODES, GRID_MODES, HANDLE_IDS, ZOOM_MIN, ZOOM_MAX, HANDLE_HIT_TOUCH
} from "../src/ui/preview.js";

/** だいたい同じ（px の丸めを見ない） */
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≒ ${b} ではない`);
const nearPt = (p, x, y, eps = 1e-6) => { near(p.x, x, eps); near(p.y, y, eps); };

/** 試験用の Resolved（preview は r.transform と r.asset だけ見る） */
function res(tr, asset) {
  return {
    asset: asset === undefined ? { width: 1920, height: 1080 } : asset,
    transform: Object.assign({ x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0.5, anchorY: 0.5 }, tr || {})
  };
}

/* ── ① 見え方と座標変換 ─────────────────────────────────────── */

test("makeView: 合わせる（fit）は余白を引いた分で収める", () => {
  const v = makeView({ vw: 800, vh: 600, projW: 1920, projH: 1080, pad: 10, fit: true });
  /* 横で決まる: (800-20)/1920 = 0.40625、縦は (600-20)/1080 = 0.537 */
  near(v.fitZoom, 780 / 1920);
  near(v.zoom, 780 / 1920);
  /* 収めた絵は画面の真ん中 */
  near(v.offsetX + v.projW * v.scale / 2, 400);
  near(v.offsetY + v.projH * v.scale / 2, 300);
});

test("makeView: 手で決めた倍率は 10%〜800% に収まる", () => {
  const a = makeView({ vw: 800, vh: 600, projW: 1920, projH: 1080, zoom: 99 });
  near(a.zoom, ZOOM_MAX);
  const b = makeView({ vw: 800, vh: 600, projW: 1920, projH: 1080, zoom: 0.0001 });
  near(b.zoom, ZOOM_MIN);
});

test("makeView: パンは中心をずらすだけ", () => {
  const v = makeView({ vw: 800, vh: 600, projW: 1000, projH: 500, zoom: 1, panX: 40, panY: -20 });
  near(v.offsetX, 800 / 2 + 40 - 500);
  near(v.offsetY, 600 / 2 - 20 - 250);
});

test("projectToStage / stageToProject: 往復して元に戻る", () => {
  const v = makeView({ vw: 900, vh: 500, projW: 1920, projH: 1080, zoom: 0.37, panX: 13, panY: -29 });
  for (const [x, y] of [[0, 0], [1920, 1080], [960, 540], [-100, 2000]]) {
    const s = projectToStage(x, y, v);
    const back = stageToProject(s.x, s.y, v);
    nearPt(back, x, y, 1e-9);
  }
  /* 中央は画面の中央 + パン */
  const c = projectToStage(960, 540, v);
  nearPt(c, 900 / 2 + 13, 500 / 2 - 29, 1e-9);
});

test("座標変換: view が壊れていても落ちない（scale 0 は 1 扱い）", () => {
  nearPt(projectToStage(10, 20, null), 10, 20);
  nearPt(stageToProject(10, 20, { scale: 0, offsetX: 0, offsetY: 0 }), 10, 20);
  nearPt(projectToStage(NaN, undefined, { scale: 2, offsetX: 5, offsetY: 5 }), 5, 5);
});

/* ── ② 箱の計算（契約: scale 1 = contain）──────────────────── */

test("clipBox: 同じ比率なら scale 1 で画面いっぱい", () => {
  const b = clipBox(res(), 1920, 1080);
  near(b.w, 1920); near(b.h, 1080);
  near(b.cx, 960); near(b.cy, 540);
  near(b.k, 1);
  near(b.vw, 1920); near(b.vh, 1080);
});

test("clipBox: 縦素材は横プロジェクトに **収まる**（はみ出さない）", () => {
  const b = clipBox(res(null, { width: 1080, height: 1920 }), 1920, 1080);
  near(b.k, 1080 / 1920);
  near(b.h, 1080);            // 縦がぴったり
  near(b.w, 1080 * (1080 / 1920));
  assert.ok(b.w < 1920);
});

test("clipBox: 素材の寸法が分からなければ画面の寸法で代用する", () => {
  const b = clipBox(res(null, null), 1280, 720);
  near(b.w, 1280); near(b.h, 720);
});

test("clipBox: x / y は画面の幅・高さに対する割合（中心が原点）", () => {
  const b = clipBox(res({ x: 0.25, y: -0.5 }), 1920, 1080);
  near(b.cx, 1920 * 0.75);
  near(b.cy, 0);
});

test("clipBox: scale は scaleX / scaleY に掛かる（二重掛けしない）", () => {
  const b = clipBox(res({ scale: 2, scaleX: 1.5, scaleY: 0.5 }), 1920, 1080);
  near(b.w, 1920 * 3);
  near(b.h, 1080 * 1);
});

test("clipBox: クロップは窓（v*）で表し、w / h は変えない", () => {
  const b = clipBox(res({ crop: { l: 0.25, t: 0.1, r: 0.25, b: 0 } }), 1920, 1080);
  near(b.w, 1920);                   // クロップ前の寸法はそのまま
  near(b.crop.w, 0.5);
  near(b.vx, 1920 * 0.25);
  near(b.vw, 1920 * 0.5);
  near(b.vy, 1080 * 0.1);
  near(b.vh, 1080 * 0.9);
});

test("clipBox: クロップの合計は 98% で止まる（全部消えない）", () => {
  const b = clipBox(res({ crop: { l: 0.6, t: 0, r: 0.6, b: 0 } }), 1000, 1000);
  near(b.crop.l + b.crop.r, 0.98, 1e-9);
  assert.ok(b.crop.w > 0);
});

test("clipBox: anchor は回転・拡大の中心（位置ではない）", () => {
  const b = clipBox(res({ anchorX: 0, anchorY: 1 }), 1920, 1080);
  near(b.cx, 960); near(b.cy, 540);              // 位置は動かない
  near(b.px, 960 - 1920 / 2);                    // 中心だけ左下へ
  near(b.py, 540 + 1080 / 2);
});

test("clipBox: rotate は rad で読み、rotateDeg からも組める", () => {
  near(clipBox(res({ rotate: Math.PI / 2 }), 100, 100).rot, Math.PI / 2);
  near(clipBox({ asset: null, transform: { rotateDeg: 90 } }, 100, 100).rot, Math.PI / 2, 1e-12);
});

test("boxToStage: 寸法は拡大率を掛けるだけ・位置は変換に従う", () => {
  const v = makeView({ vw: 400, vh: 300, projW: 1000, projH: 500, zoom: 0.4 });
  const b = boxToStage(clipBox(res(null, { width: 1000, height: 500 }), 1000, 500), v);
  near(b.w, 1000 * 0.4);
  near(b.h, 500 * 0.4);
  nearPt({ x: b.cx, y: b.cy }, 200, 150);
});

/* ── ③ local ↔ 世界 ─────────────────────────────────────────── */

test("boxPoint / boxLocal: 回転していても往復する", () => {
  const box = { cx: 300, cy: 200, w: 120, h: 60, rot: 0.7, px: 300, py: 200 };
  for (const [lx, ly] of [[0, 0], [60, 30], [-60, -30], [17, -4]]) {
    const w = boxPoint(box, lx, ly);
    const l = boxLocal(box, w.x, w.y);
    nearPt(l, lx, ly, 1e-9);
  }
});

test("boxPoint: 90 度回すと右下の角が左下へ回る（y 下向き = 時計回り）", () => {
  const box = { cx: 100, cy: 50, w: 40, h: 20, rot: Math.PI / 2, px: 100, py: 50 };
  nearPt(boxPoint(box, 20, 10), 100 - 10, 50 + 20, 1e-9);
});

test("boxPoint: 回転中心が中心でなくても角の位置は変わらない（回転 0）", () => {
  const box = { cx: 100, cy: 50, w: 40, h: 20, rot: 0, px: 80, py: 50 };
  nearPt(boxPoint(box, -20, -10), 80, 40, 1e-9);
});

test("handlePoints: 8 点 + 回転 + 中心が揃う", () => {
  const box = { cx: 100, cy: 50, w: 40, h: 20, rot: 0, px: 100, py: 50 };
  const p = handlePoints(box, { gap: 30 });
  nearPt(p.nw, 80, 40); nearPt(p.ne, 120, 40);
  nearPt(p.se, 120, 60); nearPt(p.sw, 80, 60);
  nearPt(p.n, 100, 40); nearPt(p.s, 100, 60);
  nearPt(p.w, 80, 50); nearPt(p.e, 120, 50);
  nearPt(p.center, 100, 50);
  nearPt(p.rotate, 100, 10);
  for (const id of HANDLE_IDS) assert.ok(p[id], `${id} が無い`);
});

test("handlePoints: crop を頼むとクロップ窓の角を返す", () => {
  const v = makeView({ vw: 1920, vh: 1080, projW: 1920, projH: 1080, zoom: 1, pad: 0 });
  const b = boxToStage(clipBox(res({ crop: { l: 0.5, t: 0, r: 0, b: 0 } }), 1920, 1080), v);
  const p = handlePoints(b, { crop: true, rotate: false });
  near(p.nw.x, 960);            // 左半分を切ったので左端は真ん中
  near(p.ne.x, 1920);
});

/* ── ④ 当たり判定 ───────────────────────────────────────────── */

const RECT = { cx: 100, cy: 50, w: 40, h: 20, rot: 0 };

test("hitHandle: 角 → 辺 → 中心 → 本体 → 外の順に答える", () => {
  assert.equal(hitHandle(80, 40, RECT, { size: 8 }), "nw");
  assert.equal(hitHandle(120, 60, RECT, { size: 8 }), "se");
  assert.equal(hitHandle(100, 40, RECT, { size: 8 }), "n");
  assert.equal(hitHandle(120, 50, RECT, { size: 8 }), "e");
  assert.equal(hitHandle(100, 50, RECT, { size: 4, center: true }), "center");
  assert.equal(hitHandle(100, 50, RECT, { size: 4 }), "body");
  assert.equal(hitHandle(400, 400, RECT, { size: 8 }), null);
});

test("hitHandle: 回転ハンドルは箱の上（gap のぶん離れた所）", () => {
  /* 箱の上辺は y=40。gap 30 なら回転ハンドルは y=10 */
  assert.equal(hitHandle(100, 10, RECT, { size: 8, gap: 30 }), "rotate");
  assert.equal(hitHandle(100, 16, RECT, { size: 8, gap: 30 }), "rotate");
  assert.equal(hitHandle(100, 10, RECT, { size: 8, gap: 30, rotate: false }), null);
});

test("hitHandle: 角は辺より先に取る（重なっても迷わない）", () => {
  /* 幅 10 の箱では 角と辺の当たりが重なる。角が勝つこと */
  const small = { cx: 0, cy: 0, w: 10, h: 10, rot: 0 };
  assert.equal(hitHandle(-5, -5, small, { size: 12 }), "nw");
});

test("hitHandle: 指は 28px の当たり判定（少し外しても掴める）", () => {
  assert.equal(hitHandle(80 + 20, 40 + 20, RECT, { size: HANDLE_HIT_TOUCH }), "nw");
  assert.equal(hitHandle(80, 40, RECT, { size: 2 }), "nw");
  assert.equal(hitHandle(86, 46, RECT, { size: 2 }), "body");
});

test("hitHandle: 回転した箱でも角を取れる", () => {
  const r = { cx: 100, cy: 50, w: 40, h: 20, rot: Math.PI / 2 };
  /* 90 度回した nw（local -20,-10）は (110, 30) */
  assert.equal(hitHandle(110, 30, r, { size: 6 }), "nw");
  assert.equal(hitHandle(80, 40, r, { size: 6 }), null);
});

test("hitHandle: handles:false なら本体だけ見る（クリップを拾う用）", () => {
  assert.equal(hitHandle(80, 40, RECT, { handles: false }), "body");
  assert.equal(hitHandle(200, 200, RECT, { handles: false }), null);
});

test("hitHandle: crop:true は窓の中だけを本体とする", () => {
  const b = { cx: 100, cy: 50, w: 40, h: 20, rot: 0, vx: 20, vy: 0, vw: 20, vh: 20 };
  assert.equal(hitHandle(110, 50, b, { size: 3, crop: true }), "body");
  assert.equal(hitHandle(85, 50, b, { size: 3, crop: true }), null);
});

test("hitHandle: 左上指定（x,y）でも同じに読める", () => {
  assert.equal(hitHandle(80, 40, { x: 80, y: 40, w: 40, h: 20 }, { size: 6 }), "nw");
  assert.equal(hitHandle(0, 0, { x: 0, y: 0, w: 0, h: 0 }, {}), null);
  assert.equal(hitHandle(0, 0, null, {}), null);
});

/* ── ⑤ 値の丸め ─────────────────────────────────────────────── */

test("clampTransform: 在るキーだけ丸め、入力は書き換えない", () => {
  const src = { x: 99, scale: 999, rotate: 540, crop: { l: 0.6, r: 0.6, t: 0, b: 0 }, mystery: "そのまま" };
  const out = clampTransform(src);
  assert.equal(src.x, 99, "入力が書き換わっている");
  assert.equal(src.crop.l, 0.6, "入力の crop が書き換わっている");
  assert.equal(out.x, 4);
  assert.equal(out.scale, 10);
  assert.equal(out.rotate, 180);
  near(out.crop.l + out.crop.r, 0.98, 1e-9);
  assert.equal(out.mystery, "そのまま");
  assert.ok(!("y" in out), "渡していない y を作ってはいけない（部分 patch）");
});

test("clampTransform: 角度は (-180, 180]、拡大は 1% 〜 1000%", () => {
  assert.equal(clampTransform({ rotate: 370 }).rotate, 10);
  assert.equal(clampTransform({ rotate: -190 }).rotate, 170);
  assert.equal(clampTransform({ rotate: 180 }).rotate, 180);
  assert.equal(clampTransform({ scaleX: 0 }).scaleX, 0.01);
  assert.equal(clampTransform({ scaleY: 1e9 }).scaleY, 10);
});

test("clampTransform: 基準点は 0..1、反転は真偽値、壊れた入力は {}", () => {
  assert.equal(clampTransform({ anchorX: 9 }).anchorX, 1);
  assert.equal(clampTransform({ anchorY: -9 }).anchorY, 0);
  assert.equal(clampTransform({ flipH: 1 }).flipH, true);
  assert.deepEqual(clampTransform(null), {});
  assert.deepEqual(clampTransform([1, 2]), {});
});

test("normalizeAngle / snapAngle: 15 度刻みへ吸着する", () => {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(-360), 0);
  assert.equal(snapAngle(7), 0);
  assert.equal(snapAngle(8), 15);
  assert.equal(snapAngle(172), 165);
  assert.equal(snapAngle(178), 180);
  assert.equal(snapAngle(44, 90), 0);
});

/* ── ⑥ 引いた先からの寸法・クロップ ────────────────────────── */

test("resizeFromHandle: 角は掴んだ側だけ伸びる", () => {
  const s = resizeFromHandle({ w: 100, h: 50 }, "se", { x: 100, y: 50 });
  near(s.w, 150); near(s.h, 75);
});

test("resizeFromHandle: 辺は片方の軸だけ動く", () => {
  const s = resizeFromHandle({ w: 100, h: 50 }, "w", { x: -100, y: 999 });
  near(s.w, 150); near(s.h, 50);
});

test("resizeFromHandle: Shift（比率保持）は変化の大きい軸に合わせる", () => {
  const s = resizeFromHandle({ w: 100, h: 50 }, "se", { x: 100, y: 0 }, { aspect: true });
  near(s.w, 150); near(s.h, 75);
  near(s.w / s.h, 2);
});

test("resizeFromHandle: Alt（中心基準）は倍で伸びる", () => {
  const s = resizeFromHandle({ w: 100, h: 50 }, "se", { x: 100, y: 50 }, { fromCenter: true });
  near(s.w, 200); near(s.h, 100);
});

test("resizeFromHandle: 裏返しても下限で止まる", () => {
  const s = resizeFromHandle({ w: 100, h: 50 }, "se", { x: -9999, y: -9999 }, { min: 10 });
  near(s.w, 10); near(s.h, 10);
  assert.deepEqual(resizeFromHandle({ w: 100, h: 50 }, "nope", { x: 0, y: 0 }), { w: 100, h: 50 });
});

test("cropFromHandle: 掴んだ辺だけ動き、反対側は残る", () => {
  const c = cropFromHandle({ l: 0, t: 0, r: 0, b: 0 }, "w", { x: 0, y: 0 }, { w: 100, h: 50 });
  near(c.l, 0.5); near(c.r, 0); near(c.t, 0); near(c.b, 0);
});

test("cropFromHandle: 窓が消えない（最低 4%）", () => {
  const c = cropFromHandle({ l: 0, t: 0, r: 0.9, b: 0 }, "w", { x: 9999, y: 0 }, { w: 100, h: 50, min: 0.04 });
  assert.ok(1 - c.l - c.r >= 0.039, `窓が ${1 - c.l - c.r} まで潰れている`);
});

test("cropFromHandle: 比率固定は反対の軸を直す", () => {
  const c = cropFromHandle({ l: 0, t: 0, r: 0, b: 0 }, "e", { x: 0, y: 0 }, { w: 100, h: 50, ratio: 1 });
  const pxW = (1 - c.l - c.r) * 100, pxH = (1 - c.t - c.b) * 50;
  near(pxW, 50, 1e-6);
  near(pxH, 50, 1e-6);
});

test("ratioCrop: 16:9 を 9:16 にすると左右が落ちる", () => {
  const c = ratioCrop(9 / 16, 1920, 1080);
  near(c.t, 0); near(c.b, 0);
  near(c.l, c.r);
  near((1 - c.l - c.r) * 1920 / 1080, 9 / 16, 1e-9);
});

test("ratioCrop: 16:9 を 2.35:1 にすると上下が落ちる / 同じ比率なら何もしない", () => {
  const c = ratioCrop(2.35, 1920, 1080);
  near(c.l, 0); near(c.r, 0);
  assert.ok(c.t > 0);
  assert.deepEqual(ratioCrop(16 / 9, 1920, 1080), { l: 0, t: 0, r: 0, b: 0 });
  assert.deepEqual(ratioCrop(0, 1920, 1080), { l: 0, t: 0, r: 0, b: 0 });
});

test("fillScaleFor: 画面を覆う最小の倍率", () => {
  const b = clipBox(res(null, { width: 1080, height: 1920 }), 1920, 1080);
  const s = fillScaleFor(b, 1920, 1080);
  near(s, 1920 / b.w, 1e-9);
  assert.ok(b.w * s >= 1920 - 1e-6 && b.h * s >= 1080 - 1e-6);
});

/* ── ⑦ 整列ガイド ───────────────────────────────────────────── */

test("alignSnab: 一番近い候補を選び、範囲外なら null", () => {
  const got = alignSnap([10, 20, 30], [{ v: 22, kind: "center" }, { v: 33, kind: "clip" }], 5);
  assert.equal(got.kind, "center");
  near(got.delta, 2);
  near(got.line, 22);
  assert.equal(alignSnap([10], [{ v: 100 }], 5), null);
  assert.equal(alignSnap([], [{ v: 1 }], 5), null);
  assert.equal(alignSnap(null, null, 5), null);
});

test("alignSnap: 同じ距離なら先に見つけた方（並びで決まる = 毎回同じ）", () => {
  const got = alignSnap([10], [{ v: 12, kind: "a" }, { v: 8, kind: "b" }], 5);
  assert.equal(got.kind, "a");
});

test("alignSnap: 壊れた候補は飛ばす", () => {
  const got = alignSnap([10, NaN], [{ v: NaN }, {}, { v: 11, kind: "frame" }], 5);
  assert.equal(got.kind, "frame");
});

/* ── 契約の見張り ───────────────────────────────────────────── */

test("export した名前と値の並びが契約どおり", () => {
  assert.deepEqual(PREVIEW_MODES.slice(), ["select", "crop", "mask", "text", "chroma-pick", "pan"]);
  assert.deepEqual(GRID_MODES.slice(), ["none", "thirds", "grid9"]);
  assert.deepEqual(HANDLE_IDS.slice(), ["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
  assert.equal(ZOOM_MIN, 0.1);
  assert.equal(ZOOM_MAX, 8);
  assert.equal(HANDLE_HIT_TOUCH, 28);
});

test("import しただけでは DOM を要らない（Node で読めている事の証明）", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof makeView, "function");
});
