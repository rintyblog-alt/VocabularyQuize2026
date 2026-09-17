/* ══════════════════════════════════════════════════════════════════════
   tests/eval.test.mjs — core/eval.js の試験（node --test）

   eval.js は compositor / playback / audio / export が毎フレーム呼ぶ
   **唯一の評価器**。ここが狂うと 4 つ同時に狂い、しかも「なんとなく絵が
   1 フレームずれる」「音の頭が切れる」という直しにくい形で出る。
   そこで守りたい所を先に書いておく。

   1) 速度ランプの積分が合っている（一定速・2 段・逆再生）。
      at/inverse は **往復して元に戻る**こと。ここが第一の砦。
   2) キーフレームの補間（各 ease と #hex）。区間の ease は **左のキー**。
      hold は段差。path が無ければ静的値（fallback）。
   3) 遷移の p が 0→1 に単調で、境目で 0.5 に合う（A の尾と B の頭が繋がる）。
   4) clipsAt の描画順（tracks 配列順 = 下から上）と hidden/solo/mute。
   5) 素材の端で張り付く（throw しない）。
   6) fps 丸め（端数秒で呼ばれても「その t を含むフレーム」を出す）。
   7) 返り値を持っていても壊れない（pool 無しが既定）。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveClip, clipsAt, audioAt, sampleKey, sampleClipPath,
  sourceTimeAt, buildSpeedMap, transitionAt, visibleRange,
  resolvedAudioGain, createResolvePool, detachResolved, resetEvalCaches,
} from "../src/core/eval.js";
import { newClip, newTrack, newAsset, newProject, normalizeProject } from "../src/core/schema.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function assertNear(a, b, eps = 1e-6, msg) {
  assert.ok(near(a, b, eps), msg || `${a} ≠ ${b}（許容 ${eps}）`);
}

/** 素材を持たないただの箱（正規化を通さずに eval だけを見たいときに使う） */
function clip(partial) {
  return newClip(partial && partial.kind ? partial.kind : "video",
    Object.assign({ assetId: "as_x" }, partial));
}
function track(partial, clips) {
  const t = newTrack((partial && partial.kind) || "video", partial);
  t.clips = clips || [];
  return t;
}
function project(tracks, settings) {
  return {
    schema: 3, id: "prj_t", name: "t", createdAt: 0, updatedAt: 0,
    settings: Object.assign({ fps: 30, width: 1920, height: 1080 }, settings),
    assets: [], tracks: tracks || [], markers: [], chapters: [],
    subtitleStyle: {}, meta: { aiHistory: [] }
  };
}

/* ══ §1 visibleRange / 見える見えない ═════════════════════════════ */

test("visibleRange: start と start+duration", () => {
  assert.deepEqual(visibleRange(clip({ start: 1.5, duration: 2 })), { start: 1.5, end: 3.5 });
  assert.deepEqual(visibleRange(null), { start: 0, end: 0 });
  assert.deepEqual(visibleRange({ start: -5, duration: NaN }), { start: 0, end: 0 });
});

test("resolveClip: 範囲の内なら Resolved、外なら null（末端は開区間）", () => {
  const c = clip({ start: 1, duration: 2, in: 0, out: 2 });
  const r = resolveClip(c, 1.5, { fps: 30 });
  assert.ok(r, "見えるはずの時刻で null");
  assertNear(r.localTime, 0.5);
  assert.equal(resolveClip(c, 5, { fps: 30 }), null);
  assert.equal(resolveClip(c, 0.5, { fps: 30 }), null);
  assert.ok(resolveClip(c, 1, { fps: 30 }), "頭は含む");
  assert.equal(resolveClip(c, 3, { fps: 30 }), null, "尻は含まない（次のクリップの物）");
  assert.equal(resolveClip(null, 0, { fps: 30 }), null);
});

test("resolveClip: fps でフレームへ丸める（t を含むフレームの頭）", () => {
  const c = clip({ start: 0, duration: 2, in: 0, out: 2 });
  // 30fps の 1 フレームは 1/30 秒。0.9 秒は 27 枚目（0.9 = 27/30）に乗る
  assertNear(resolveClip(c, 0.9, { fps: 30 }).localTime, 27 / 30);
  // 端数（0.9 + 半フレーム）は **同じ 27 枚目**（floor。round にすると絵が 1 枚飛ぶ）
  assertNear(resolveClip(c, 0.9 + 1 / 60, { fps: 30 }).localTime, 27 / 30);
  // 次のフレームへ入ったら進む
  assertNear(resolveClip(c, 0.9 + 1 / 30, { fps: 30 }).localTime, 28 / 30);
  // 1.999 秒は 59 枚目（= 1.9666..）に属する。round だと 2.0 になり clip が消える
  const r = resolveClip(c, 1.999, { fps: 30 });
  assert.ok(r, "1.999 秒で消えてはいけない");
  assertNear(r.localTime, 59 / 30);
  // 60fps なら刻みが細かい
  assertNear(resolveClip(c, 0.9 + 1 / 60, { fps: 60 }).localTime, 55 / 60);
  // snap:false で素の秒
  assertNear(resolveClip(c, 0.9123, { fps: 30, snap: false }).localTime, 0.9123);
});

/* ══ §2 速度ランプの積分 ═══════════════════════════════════════════ */

test("buildSpeedMap: 一定速（ramp 無し）は in + l * speed", () => {
  const m1 = buildSpeedMap(clip({ duration: 4, speed: 1 }));
  assertNear(m1.at(0), 0);
  assertNear(m1.at(2), 2);
  assertNear(m1.totalSource, 4);
  const m2 = buildSpeedMap(clip({ duration: 4, speed: 2 }));
  assertNear(m2.at(2), 4);
  assertNear(m2.totalSource, 8);
  assertNear(m2.rateAt(1), 2);
  const m3 = buildSpeedMap(clip({ duration: 4, speed: 0.5 }));
  assertNear(m3.at(4), 2);
  // 手前へ外挿（トリムで頭を伸ばすときに使う）
  assertNear(m2.at(-1), -2);
  assertNear(m2.inverse(-2), -1);
});

test("buildSpeedMap: 2 段のランプは台形の面積になる", () => {
  // 0s で 1 倍 → 2s で 3 倍（線形）→ その後は 3 倍で一定
  const c = clip({ duration: 4, speed: 1, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 3 }] });
  const m = buildSpeedMap(c);
  assertNear(m.rateAt(0), 1);
  assertNear(m.rateAt(1), 2);
  assertNear(m.rateAt(2), 3);
  assertNear(m.rateAt(3.5), 3, 1e-9, "最後の点より後ろは端の値で一定");
  // ∫₀² (1 + t) dt = 2 + 2 = 4
  assertNear(m.at(2), 4);
  // ∫₀¹ (1 + t) dt = 1 + 0.5 = 1.5
  assertNear(m.at(1), 1.5);
  // 2..4 は 3 倍一定 → 4 + 3*2 = 10
  assertNear(m.at(4), 10);
  assertNear(m.totalSource, 10);
});

test("buildSpeedMap: ランプの頭が 0 でなければ手前は先頭の値で一定", () => {
  const c = clip({ duration: 4, speed: 9, speedRamp: [{ t: 1, v: 2 }, { t: 3, v: 4 }] });
  const m = buildSpeedMap(c);
  assertNear(m.rateAt(0), 2, 1e-9, "ramp が在るなら speed は使わない（ops.js と同じ規則）");
  assertNear(m.at(1), 2);            // 0..1 は 2 倍
  assertNear(m.at(3), 2 + 6);        // 1..3 は台形 (2+4)/2*2 = 6
  assertNear(m.at(4), 8 + 4);        // 3.. は 4 倍一定
});

test("buildSpeedMap: at → inverse の往復（一定速・ランプ・多段）", () => {
  const cases = [
    clip({ duration: 4, speed: 1 }),
    clip({ duration: 4, speed: 2.5 }),
    clip({ duration: 4, speed: 0.2 }),
    clip({ duration: 6, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 3 }] }),
    clip({ duration: 6, speedRamp: [{ t: 1, v: 0.5 }, { t: 2, v: 4 }, { t: 5, v: 1 }] }),
    clip({ duration: 6, speedRamp: [{ t: 0, v: 4 }, { t: 3, v: 0.05 }] }),
  ];
  for (const c of cases) {
    const m = buildSpeedMap(c);
    for (let l = 0; l <= 6; l += 0.125) {
      const s = m.at(l);
      assertNear(m.inverse(s), l, 1e-6, `inverse(at(${l})) が戻らない`);
    }
    // 逆からも（素材量 → 尺 → 素材量）
    for (let s = 0; s <= m.totalSource; s += m.totalSource / 17) {
      assertNear(m.at(m.inverse(s)), s, 1e-6, `at(inverse(${s})) が戻らない`);
    }
  }
});

test("buildSpeedMap: 同じ clip なら作り直さない（cache）", () => {
  const c = clip({ duration: 4, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 2 }] });
  const a = buildSpeedMap(c);
  assert.equal(buildSpeedMap(c), a, "同じ地図が返るはず");
  c.speedRamp = [{ t: 0, v: 1 }, { t: 2, v: 4 }];   // ops は必ず配列ごと差し替える
  const b = buildSpeedMap(c);
  assert.notEqual(b, a, "ramp を差し替えたら作り直すはず");
  assertNear(b.rateAt(2), 4);
  resetEvalCaches();
  assert.notEqual(buildSpeedMap(c), b, "resetEvalCaches で捨てられるはず");
});

test("sourceTimeAt: in + ∫v dt。逆再生は out から戻る", () => {
  const f = clip({ duration: 2, in: 1, out: 3, speed: 1 });
  assertNear(sourceTimeAt(f, 0), 1);
  assertNear(sourceTimeAt(f, 1), 2);
  assertNear(sourceTimeAt(f, 2), 3);
  const r = clip({ duration: 2, in: 1, out: 3, speed: 1, reverse: true });
  assertNear(sourceTimeAt(r, 0), 3);
  assertNear(sourceTimeAt(r, 1), 2);
  assertNear(sourceTimeAt(r, 2), 1);
  // 2 倍速の逆再生
  const r2 = clip({ duration: 1, in: 0, out: 2, speed: 2, reverse: true });
  assertNear(sourceTimeAt(r2, 0), 2);
  assertNear(sourceTimeAt(r2, 0.5), 1);
  assertNear(sourceTimeAt(r2, 1), 0);
  // ランプ付きの逆再生
  const r3 = clip({ duration: 2, in: 0, out: 4, reverse: true, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 3 }] });
  assertNear(sourceTimeAt(r3, 0), 4);
  assertNear(sourceTimeAt(r3, 1), 4 - 1.5);
  // 静止素材（in/out が無い kind）は 0
  assert.equal(sourceTimeAt(newClip("text", {}), 1), 0);
  assert.equal(sourceTimeAt(newClip("image", { assetId: "a" }), 1), 0);
});

test("sourceTimeAt: 素材の端では張り付く（throw しない）", () => {
  // 尺 2 秒・素材は 0..1 しか無い（速度 1）→ 1 秒より後ろは 1 に張り付く
  const c = clip({ duration: 2, in: 0, out: 1, speed: 1 });
  assertNear(sourceTimeAt(c, 0.5), 0.5);
  assertNear(sourceTimeAt(c, 1.5), 1);
  assertNear(sourceTimeAt(c, 999), 1);
  assertNear(sourceTimeAt(c, -5), 0, 1e-9, "手前も in で止まる");
  // resolveClip は asset.duration でも抑える
  const asset = newAsset({ kind: "video", name: "x", duration: 0.5 });
  const r = resolveClip(clip({ duration: 2, in: 0, out: 5, speed: 1 }), 1.5, { fps: 30, asset });
  assertNear(r.sourceTime, 0.5, 1e-9, "素材尺を越えたら端で張り付く");
});

/* ══ §3 キーフレーム ═══════════════════════════════════════════════ */

test("sampleKey: path が無ければ fallback（静的値）", () => {
  assert.equal(sampleKey(null, "opacity", 1, 0.25), 0.25);
  assert.equal(sampleKey({}, "opacity", 1, 0.25), 0.25);
  assert.equal(sampleKey({ opacity: [] }, "opacity", 1, 0.25), 0.25);
  assert.equal(sampleKey({ "transform.x": [{ t: 0, v: 1 }] }, "opacity", 1, 0.25), 0.25);
  // 列そのものを渡しても読める
  assert.equal(sampleKey([{ t: 0, v: 7 }], "なんでも", 1, 0), 7);
});

test("sampleKey: 範囲の外は端の値を保つ", () => {
  const keys = { opacity: [{ t: 1, v: 0.2 }, { t: 2, v: 0.8 }] };
  assertNear(sampleKey(keys, "opacity", 0, 1), 0.2);
  assertNear(sampleKey(keys, "opacity", 1, 1), 0.2);
  assertNear(sampleKey(keys, "opacity", 2, 1), 0.8);
  assertNear(sampleKey(keys, "opacity", 99, 1), 0.8);
  assertNear(sampleKey(keys, "opacity", 1.5, 1), 0.5, 1e-9, "linear の中点");
});

test("sampleKey: 区間の ease は左のキーの物（各 ease を見る）", () => {
  const mk = (ease, bez) => ({ opacity: [{ t: 0, v: 0, ease, bez }, { t: 1, v: 1, ease: "linear" }] });
  assertNear(sampleKey(mk("linear"), "opacity", 0.5, 0), 0.5);
  assertNear(sampleKey(mk("in"), "opacity", 0.5, 0), 0.125);      // t³
  assertNear(sampleKey(mk("out"), "opacity", 0.5, 0), 0.875);
  assertNear(sampleKey(mk("inout"), "opacity", 0.5, 0), 0.5);
  assertNear(sampleKey(mk("inout"), "opacity", 0.25, 0), 4 * 0.015625);
  // hold は段差（次のキーの直前まで前の値）
  assert.equal(sampleKey(mk("hold"), "opacity", 0.001, 0), 0);
  assert.equal(sampleKey(mk("hold"), "opacity", 0.5, 0), 0);
  assert.equal(sampleKey(mk("hold"), "opacity", 0.999, 0), 0);
  assert.equal(sampleKey(mk("hold"), "opacity", 1, 0), 1);
  // bezier は端が合っていて単調
  const b = mk("bezier", [0.25, 0.1, 0.25, 1]);
  assertNear(sampleKey(b, "opacity", 0, 0), 0);
  assertNear(sampleKey(b, "opacity", 1, 0), 1);
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const v = sampleKey(b, "opacity", x, 0);
    assert.ok(v >= prev - 1e-9, `bezier が単調でない（x=${x}）`);
    prev = v;
  }
  // 知らない ease は linear へ落とす（保存形式が新しくても再生を止めない）
  assertNear(sampleKey(mk("なんだこれ"), "opacity", 0.5, 0), 0.5);
});

test("sampleKey: 3 本以上のキーで正しい区間を選ぶ（二分探索）", () => {
  const keys = { "transform.x": [{ t: 0, v: 0 }, { t: 1, v: 10 }, { t: 2, v: 10 }, { t: 4, v: 0 }] };
  assertNear(sampleKey(keys, "transform.x", 0.5, 0), 5);
  assertNear(sampleKey(keys, "transform.x", 1.5, 0), 10);
  assertNear(sampleKey(keys, "transform.x", 3, 0), 5);
  assertNear(sampleKey(keys, "transform.x", 3.5, 0), 2.5);
});

test("sampleKey: 色は #hex のまま混ぜる", () => {
  const keys = { "text.style.color": [{ t: 0, v: "#000000" }, { t: 1, v: "#ffffff" }] };
  assert.equal(sampleKey(keys, "text.style.color", 0, "#f00"), "#000000");
  assert.equal(sampleKey(keys, "text.style.color", 1, "#f00"), "#ffffff");
  assert.equal(sampleKey(keys, "text.style.color", 0.5, "#f00"), "#808080");
  // 3 桁・4 桁も読める（契約書 §1 の shadow.color は "#0008"）
  const k2 = { c: [{ t: 0, v: "#f00" }, { t: 1, v: "#00f" }] };
  assert.equal(sampleKey(k2, "c", 0.5, "#000"), "#800080");
  // hold の色は段差
  const k3 = { c: [{ t: 0, v: "#000000", ease: "hold" }, { t: 1, v: "#ffffff" }] };
  assert.equal(sampleKey(k3, "c", 0.9, "#000"), "#000000");
  assert.equal(sampleKey(k3, "c", 1, "#000"), "#ffffff");
});

test("sampleKey: 壊れたキーでも落ちない", () => {
  assert.equal(sampleKey({ a: [{ t: NaN, v: 1 }] }, "a", 0, 5), 1);
  assert.equal(sampleKey({ a: [{ t: 0 }] }, "a", 0, 5), 5, "v が無ければ fallback");
  assert.equal(sampleKey({ a: [{ t: 0, v: 0 }, { t: 0, v: 1 }] }, "a", 0, 5), 0);
  assert.equal(sampleKey(undefined, "a", 0, 5), 5);
});

test("sampleClipPath: キーが無ければ clip の静的値", () => {
  const c = clip({ duration: 2, opacity: 0.4 });
  assertNear(sampleClipPath(c, "opacity", 1), 0.4);
  c.keys = { opacity: [{ t: 0, v: 0 }, { t: 2, v: 1 }] };
  assertNear(sampleClipPath(c, "opacity", 1), 0.5);
});

test("resolveClip: キーフレームが transform / opacity / color に効く", () => {
  const c = clip({
    start: 0, duration: 2, in: 0, out: 2, opacity: 1,
    color: { exposure: 0, contrast: 0, saturation: 0, wheels: { lift: [0, 0, 0] } },
    keys: {
      opacity: [{ t: 0, v: 0 }, { t: 2, v: 1 }],
      "transform.scale": [{ t: 0, v: 1 }, { t: 2, v: 2 }],
      "color.exposure": [{ t: 0, v: 0 }, { t: 2, v: 1 }],
      "color.wheels.lift.0": [{ t: 0, v: 0 }, { t: 2, v: 0.5 }],
    }
  });
  const r = resolveClip(c, 1, { fps: 30 });
  assertNear(r.opacity, 0.5);
  assertNear(r.transform.scaleX, 1.5);
  assertNear(r.transform.scaleY, 1.5);
  assert.equal(r.transform.scale, 1, "scale は scaleX/scaleY に織り込み済みで 1");
  assertNear(r.color.exposure, 0.5);
  assertNear(r.color.wheels.lift[0], 0.25);
  assert.equal(r.color.saturation, 0);
});

test("resolveClip: color が null なら null。ただし color.* のキーが在れば組む", () => {
  const a = resolveClip(clip({ duration: 2, color: null }), 0.5, { fps: 30 });
  assert.equal(a.color, null);
  const b = resolveClip(clip({
    duration: 2, color: null,
    keys: { "color.saturation": [{ t: 0, v: 0 }, { t: 2, v: 1 }] }
  }), 1, { fps: 30 });
  assert.ok(b.color, "キーが在るのに null は困る（CONTRACT-NOTE (4)）");
  assertNear(b.color.saturation, 0.5);
  assert.equal(b.color.exposure, 0);
});

test("resolveClip: transform は合成用の値（rad・中心基準・crop 0..1）", () => {
  const c = clip({
    duration: 2,
    transform: {
      x: 0.25, y: -0.5, scale: 2, scaleX: 1.5, scaleY: 1, rotate: 90,
      anchorX: 0.5, anchorY: 0, flipH: true, flipV: false,
      crop: { l: 0.1, t: 0.2, r: 0.1, b: 0 }
    }
  });
  const r = resolveClip(c, 0.5, { fps: 30 });
  assertNear(r.transform.x, 0.25);
  assertNear(r.transform.y, -0.5);
  assertNear(r.transform.scaleX, 3);
  assertNear(r.transform.scaleY, 2);
  assertNear(r.transform.rotate, Math.PI / 2, 1e-9);
  assertNear(r.transform.rotateDeg, 90);
  assert.equal(r.transform.flipH, true);
  assert.equal(r.transform.flipV, false);
  assertNear(r.transform.anchorY, 0);
  assertNear(r.transform.crop.l, 0.1);
  assertNear(r.transform.crop.w, 0.8);
  assertNear(r.transform.crop.h, 0.8);
  // 潰れる crop は 0.98 までに留める（WebGL の四角形が消えないように）
  const c2 = clip({ duration: 2, transform: { crop: { l: 0.8, r: 0.8, t: 0, b: 0 } } });
  const r2 = resolveClip(c2, 0.5, { fps: 30 });
  assert.ok(r2.transform.crop.w > 0.01, "幅が 0 になってはいけない");
});

test("resolveClip: fx の params にキーが効く / enabled:false は落とす", () => {
  const c = clip({
    duration: 2,
    fx: [
      { id: "fx_1", type: "glitch", enabled: true, params: { amount: 0.2, seed: 7 } },
      { id: "fx_2", type: "blur", enabled: false, params: { amount: 1 } },
    ],
    keys: { "fx.fx_1.amount": [{ t: 0, v: 0 }, { t: 2, v: 1 }] }
  });
  const r = resolveClip(c, 1, { fps: 30 });
  assert.equal(r.fx.length, 1);
  assert.equal(r.fx[0].id, "fx_1");
  assertNear(r.fx[0].params.amount, 0.5);
  assert.equal(r.fx[0].params.seed, 7);
  assert.equal(resolveClip(clip({ duration: 2 }), 1, { fps: 30 }).fx.length, 0);
});

test("resolveClip: text の size / color にキーが効く", () => {
  const c = newClip("text", { start: 0, duration: 2 });
  c.text.content = "あ";
  c.text.style.size = 10;
  c.keys = {
    "text.style.size": [{ t: 0, v: 10 }, { t: 2, v: 30 }],
    "text.style.color": [{ t: 0, v: "#000000" }, { t: 2, v: "#ffffff" }],
  };
  const r = resolveClip(c, 1, { fps: 30 });
  assertNear(r.text.style.size, 20);
  assert.equal(r.text.style.color, "#808080");
  assert.equal(r.text.content, "あ");
  assert.equal(r.text.style.weight, c.text.style.weight, "他の style は そのまま");
});

test("resolveClip: mask / chroma のキーと enabled", () => {
  const c = clip({
    duration: 2,
    mask: { type: "ellipse", x: 0.5, y: 0.5, w: 0.4, h: 0.4, rotate: 0, feather: 0, invert: true },
    chroma: { key: [0, 1, 0], similarity: 0.4, smoothness: 0.1, spill: 0.2, enabled: true },
    keys: { "mask.w": [{ t: 0, v: 0.4 }, { t: 2, v: 0.8 }], "chroma.similarity": [{ t: 0, v: 0 }, { t: 2, v: 1 }] }
  });
  const r = resolveClip(c, 1, { fps: 30 });
  assert.equal(r.mask.type, "ellipse");
  assertNear(r.mask.w, 0.6);
  assert.equal(r.mask.invert, true);
  assertNear(r.chroma.similarity, 0.5);
  // enabled:false の chroma は無かったことにする
  const c2 = clip({ duration: 2, chroma: { key: [0, 1, 0], enabled: false } });
  assert.equal(resolveClip(c2, 1, { fps: 30 }).chroma, null);
  assert.equal(resolveClip(clip({ duration: 2 }), 1, { fps: 30 }).mask, null);
});

/* ══ §4 遷移 ═══════════════════════════════════════════════════════ */

test("transitionAt: 隣り合う 2 枚で p が 0 → 1 に単調（境目で 0.5）", () => {
  const a = clip({ id: "cl_a", start: 0, duration: 2, in: 0, out: 2 });
  const b = clip({ id: "cl_b", start: 2, duration: 2, in: 0, out: 2 });
  a.id = "cl_a"; b.id = "cl_b";
  a.transitionOut = { type: "crossfade", duration: 0.5, params: { soft: 1 } };
  const tr = track({ kind: "video" }, [a, b]);

  assert.equal(transitionAt(tr, a, 0.5), null, "遷移の窓の外では null");
  const s = transitionAt(tr, a, 1.5);
  assert.ok(s, "A の尾（残り 0.5 秒）から始まるはず");
  assert.equal(s.role, "out");
  assert.equal(s.type, "crossfade");
  assert.equal(s.otherClipId, "cl_b");
  assertNear(s.p, 0);
  assert.deepEqual(s.params, { soft: 1 });
  assertNear(transitionAt(tr, a, 1.75).p, 0.25);
  assertNear(transitionAt(tr, a, 2).p, 0.5, 1e-9, "A の終わり = 真ん中");
  const i0 = transitionAt(tr, b, 0);
  assert.equal(i0.role, "in");
  assert.equal(i0.otherClipId, "cl_a");
  assertNear(i0.p, 0.5, 1e-9, "B の頭 = 真ん中（A の終わりと繋がる）");
  assertNear(transitionAt(tr, b, 0.25).p, 0.75);
  assertNear(transitionAt(tr, b, 0.5).p, 1);
  assert.equal(transitionAt(tr, b, 0.75), null);

  // 全体を通して単調
  let prev = -1;
  for (const [c, base] of [[a, 0], [b, 2]]) {
    for (let t = 1.5; t <= 2.5001; t += 0.05) {
      const local = t - base;
      if (local < 0 || local >= c.duration) continue;
      const r = transitionAt(tr, c, local);
      if (!r) continue;
      assert.ok(r.p >= prev - 1e-9, `p が戻った（t=${t}）`);
      assert.ok(r.p >= 0 && r.p <= 1, `p が 0..1 の外（${r.p}）`);
      prev = r.p;
    }
  }
});

test("transitionAt: 両方が宣言していたら長い方を採る（同じ長さなら out 側）", () => {
  const a = clip({ start: 0, duration: 4, in: 0, out: 4 });
  const b = clip({ start: 4, duration: 4, in: 0, out: 4 });
  a.id = "cl_a"; b.id = "cl_b";
  a.transitionOut = { type: "crossfade", duration: 0.4, params: {} };
  b.transitionIn = { type: "whipPan", duration: 1, params: { dir: "l" } };
  const tr = track({}, [a, b]);
  const ra = transitionAt(tr, a, 3.5);
  assert.equal(ra.type, "whipPan", "長い方（B の 1 秒）が勝つ");
  assertNear(ra.p, 0.25, 1e-9, "窓は 1 秒 → 3.0 から始まる");
  const rb = transitionAt(tr, b, 0.5);
  assert.equal(rb.type, "whipPan");
  assertNear(rb.p, 0.75);
  // 同じ長さなら A（out を宣言した側）の型
  b.transitionIn.duration = 0.4;
  assert.equal(transitionAt(tr, a, 3.8).type, "crossfade");
  assert.equal(transitionAt(tr, b, 0.2).type, "crossfade");
});

test("transitionAt: 長さは自分と相手の半分までに収める（§1-3）", () => {
  const a = clip({ start: 0, duration: 4, in: 0, out: 4 });
  const b = clip({ start: 4, duration: 0.4, in: 0, out: 0.4 });
  a.id = "cl_a"; b.id = "cl_b";
  a.transitionOut = { type: "crossfade", duration: 3, params: {} };
  const tr = track({}, [a, b]);
  // 相手が 0.4 秒しか無い → 0.2 秒に縮む
  assert.equal(transitionAt(tr, a, 3.7), null);
  const r = transitionAt(tr, a, 3.9);
  assert.ok(r);
  assertNear(r.p, 0.25);
});

test("transitionAt: 相手が居ない / 隙間が在るときは背景との遷移（0→1・otherClipId=null）", () => {
  const a = clip({ start: 0, duration: 2, in: 0, out: 2 });
  a.id = "cl_a";
  a.transitionOut = { type: "crossfade", duration: 0.5, params: {} };
  const solo = track({}, [a]);
  const r = transitionAt(solo, a, 2);
  assert.equal(r.role, "out");
  assert.equal(r.otherClipId, null);
  assertNear(r.p, 1, 1e-9, "背景へ消え切る");
  assertNear(transitionAt(solo, a, 1.75).p, 0.5);
  // 1 フレームでも隙間が在れば「隣」ではない
  const far = clip({ start: 3, duration: 2, in: 0, out: 2 });
  far.id = "cl_far";
  const gapped = track({}, [a, far]);
  assert.equal(transitionAt(gapped, a, 2).otherClipId, null);
  // 頭の transitionIn は背景から現れる
  const b = clip({ start: 0, duration: 2, in: 0, out: 2 });
  b.transitionIn = { type: "fade", duration: 0.5, params: {} };
  const tr2 = track({}, [b]);
  assertNear(transitionAt(tr2, b, 0).p, 0);
  assertNear(transitionAt(tr2, b, 0.5).p, 1);
  assert.equal(transitionAt(tr2, b, 0).role, "in");
});

test("transitionAt: 長さ 0 / 壊れた宣言は null（ただのカット）", () => {
  const a = clip({ start: 0, duration: 2, in: 0, out: 2 });
  a.transitionOut = { type: "crossfade", duration: 0, params: {} };
  assert.equal(transitionAt(track({}, [a]), a, 2), null);
  a.transitionOut = { type: "crossfade", duration: NaN, params: {} };
  assert.equal(transitionAt(track({}, [a]), a, 2), null);
  assert.equal(transitionAt(null, null, 0), null);
});

test("resolveClip: track を渡せば transition が入る", () => {
  const a = clip({ start: 0, duration: 2, in: 0, out: 2 });
  const b = clip({ start: 2, duration: 2, in: 0, out: 2 });
  a.id = "cl_a"; b.id = "cl_b";
  a.transitionOut = { type: "crossfade", duration: 0.5, params: {} };
  const tr = track({}, [a, b]);
  assert.equal(resolveClip(a, 1, { fps: 30 }).transition, null, "track 無しなら null");
  // 1.75 秒は 60fps の 105 枚目（フレーム境界）。30fps だと丸めで 1.7333 になる
  const r = resolveClip(a, 1.75, { fps: 60, track: tr });
  assert.ok(r.transition);
  assert.equal(r.transition.role, "out");
  assertNear(r.transition.p, 0.25);
});

/* ══ §5 clipsAt（描画順・hidden・solo）══════════════════════════════ */

test("clipsAt: 描画順は tracks 配列順（下 → 上）", () => {
  const v1 = track({ kind: "video", name: "V1" }, [clip({ id: "c1", start: 0, duration: 4, in: 0, out: 4 })]);
  const v2 = track({ kind: "overlay", name: "V2" }, [clip({ id: "c2", start: 0, duration: 4, in: 0, out: 4 })]);
  const ad = track({ kind: "adjust", name: "A1" }, [newClip("adjust", { id: "c3", start: 0, duration: 4 })]);
  v1.clips[0].id = "c1"; v2.clips[0].id = "c2"; ad.clips[0].id = "c3";
  const p = project([v1, v2, ad]);
  const list = clipsAt(p, 1);
  assert.deepEqual(list.map((r) => r.clip.id), ["c1", "c2", "c3"]);
  assert.deepEqual(list.map((r) => r.trackIndex), [0, 1, 2]);
  assert.equal(list[2].kind, "adjust", "調整レイヤーは kind:'adjust' で混ざる");
  assert.equal(list[0].trackId, v1.id);
  assert.ok(list.every((r) => r.visible));
});

test("clipsAt: adjust トラックに乗った普通のクリップも kind:'adjust'", () => {
  const ad = track({ kind: "adjust" }, [clip({ id: "cx", start: 0, duration: 4, in: 0, out: 4 })]);
  ad.clips[0].id = "cx";
  const list = clipsAt(project([ad]), 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, "adjust");
});

test("clipsAt: hidden は絵から落ちる（track / clip の両方）", () => {
  const mk = () => track({ kind: "video" }, [clip({ start: 0, duration: 4, in: 0, out: 4 })]);
  const t1 = mk(), t2 = mk();
  t2.hidden = true;
  assert.equal(clipsAt(project([t1, t2]), 1).length, 1);
  const t3 = mk();
  t3.clips[0].hidden = true;
  assert.equal(clipsAt(project([t3]), 1).length, 0);
  // resolveClip を直に呼んだときは null ではなく visible:false
  const r = resolveClip(t3.clips[0], 1, { fps: 30 });
  assert.ok(r);
  assert.equal(r.visible, false);
});

test("clipsAt: solo が立っていたら solo のトラックだけ", () => {
  const a = track({ kind: "video" }, [clip({ id: "a", start: 0, duration: 4, in: 0, out: 4 })]);
  const b = track({ kind: "overlay" }, [clip({ id: "b", start: 0, duration: 4, in: 0, out: 4 })]);
  a.clips[0].id = "a"; b.clips[0].id = "b";
  b.solo = true;
  assert.deepEqual(clipsAt(project([a, b]), 1).map((r) => r.clip.id), ["b"]);
  b.solo = false;
  assert.equal(clipsAt(project([a, b]), 1).length, 2);
});

test("clipsAt: locked は落とさない（編集の錠で、目隠しではない）", () => {
  const t = track({ kind: "video" }, [clip({ start: 0, duration: 4, in: 0, out: 4 })]);
  t.locked = true;
  t.clips[0].locked = true;
  assert.equal(clipsAt(project([t]), 1).length, 1);
});

test("clipsAt: audio トラックと音だけの clip は絵に出ない / opacity 0 は visible:false", () => {
  const au = track({ kind: "audio" }, [newClip("audio", { assetId: "as_a", start: 0, duration: 4, in: 0, out: 4 })]);
  const vi = track({ kind: "video" }, [newClip("audio", { assetId: "as_a", start: 0, duration: 4, in: 0, out: 4 })]);
  assert.equal(clipsAt(project([au, vi]), 1).length, 0);
  const t = track({ kind: "video" }, [clip({ start: 0, duration: 4, in: 0, out: 4, opacity: 0 })]);
  const list = clipsAt(project([t]), 1);
  assert.equal(list.length, 1, "居ることは伝える（合成は飛ばせる）");
  assert.equal(list[0].visible, false);
});

test("clipsAt: fps は settings から拾い、opts.fps が勝つ", () => {
  const t = track({ kind: "video" }, [clip({ start: 0, duration: 4, in: 0, out: 4 })]);
  const p = project([t], { fps: 25 });
  assertNear(clipsAt(p, 0.5 + 1 / 100)[0].localTime, 12 / 25);
  assertNear(clipsAt(p, 0.5 + 1 / 100, { fps: 100 })[0].localTime, 51 / 100);
  // settings が壊れていても落ちない
  assert.equal(clipsAt({ tracks: [t] }, 1).length, 1);
  assert.deepEqual(clipsAt(null, 1), []);
  assert.deepEqual(clipsAt({ tracks: "だめ" }, 1), []);
});

test("clipsAt: asset を引いて Resolved に載せる", () => {
  const asset = newAsset({ kind: "video", name: "x.mp4", duration: 10, hasAudio: true });
  const t = track({ kind: "video" }, [clip({ assetId: asset.id, start: 0, duration: 4, in: 1, out: 5 })]);
  const p = project([t]);
  p.assets = [asset];
  const r = clipsAt(p, 1)[0];
  assert.equal(r.asset, asset);
  assert.equal(r.assetId, asset.id);
  assertNear(r.sourceTime, 2);
});

/* ══ §6 audioAt と増幅 ════════════════════════════════════════════ */

function audioProject() {
  const asset = newAsset({ kind: "audio", name: "bgm.m4a", duration: 30, hasAudio: true });
  const vAsset = newAsset({ kind: "video", name: "v.mp4", duration: 30, hasAudio: true });
  const silent = newAsset({ kind: "video", name: "s.mp4", duration: 30, hasAudio: false });
  const vt = track({ kind: "video" }, [
    newClip("video", { id: "v1", assetId: vAsset.id, start: 0, duration: 4, in: 0, out: 4 }),
    newClip("video", { id: "v2", assetId: silent.id, start: 4, duration: 4, in: 0, out: 4 }),
  ]);
  const at = track({ kind: "audio", volume: 0.5, pan: 0.25 }, [
    newClip("audio", { id: "a1", assetId: asset.id, start: 0, duration: 8, in: 0, out: 8, volume: 0.8 }),
  ]);
  vt.clips[0].id = "v1"; vt.clips[1].id = "v2"; at.clips[0].id = "a1";
  const p = project([vt, at]);
  p.assets = [asset, vAsset, silent];
  return p;
}

test("audioAt: 音を持つ clip だけ返る（hasAudio:false の映像は入らない）", () => {
  const p = audioProject();
  assert.deepEqual(audioAt(p, 1).map((r) => r.clip.id), ["v1", "a1"]);
  assert.deepEqual(audioAt(p, 5).map((r) => r.clip.id), ["a1"], "無音の素材は入らない");
  assert.deepEqual(audioAt(p, 9).map((r) => r.clip.id), []);
});

test("audioAt: トラック音量と pan を織り込む", () => {
  const p = audioProject();
  const a1 = audioAt(p, 1).find((r) => r.clip.id === "a1");
  assertNear(a1.trackVolume, 0.5);
  assertNear(a1.trackPan, 0.25);
  assertNear(a1.volume, 0.4, 1e-9, "clip 0.8 × track 0.5");
  assertNear(a1.pan, 0.25);
  assert.equal(a1.hasAudio, true);
  // clip の pan とトラックの pan は足して収める
  p.tracks[1].clips[0].pan = 0.9;
  assertNear(audioAt(p, 1).find((r) => r.clip.id === "a1").pan, 1);
});

test("audioAt: muted / muteAudio / solo", () => {
  const p = audioProject();
  p.tracks[1].muted = true;
  assert.deepEqual(audioAt(p, 1).map((r) => r.clip.id), ["v1"]);
  p.tracks[1].muted = false;
  p.tracks[0].clips[0].muteAudio = true;
  assert.deepEqual(audioAt(p, 1).map((r) => r.clip.id), ["a1"]);
  p.tracks[0].clips[0].muteAudio = false;
  p.tracks[1].solo = true;
  assert.deepEqual(audioAt(p, 1).map((r) => r.clip.id), ["a1"], "solo が立ったら solo だけ");
});

test("audioAt: hidden は音を消さない（目を閉じただけ）", () => {
  const p = audioProject();
  p.tracks[0].hidden = true;
  assert.deepEqual(audioAt(p, 1).map((r) => r.clip.id), ["v1", "a1"]);
  assert.equal(clipsAt(p, 1).length, 0);
});

test("audioAt: adjust トラックは音を持たない", () => {
  const ad = track({ kind: "adjust" }, [newClip("adjust", { start: 0, duration: 4 })]);
  assert.equal(audioAt(project([ad]), 1).length, 0);
});

test("resolvedAudioGain: フェード in/out・キー・トラック・外部ゲイン", () => {
  const p = audioProject();
  const c = p.tracks[1].clips[0];      // volume 0.8 / track 0.5 → 0.4
  c.audioFade = { in: 1, out: 2, curve: "linear" };
  let r = audioAt(p, 0.5).find((x) => x.clip.id === "a1");
  assertNear(resolvedAudioGain(r), 0.4 * 0.5, 1e-6, "1 秒フェードの真ん中");
  r = audioAt(p, 2).find((x) => x.clip.id === "a1");
  assertNear(resolvedAudioGain(r), 0.4, 1e-9, "フェードの外は素の音量");
  // 尻の 2 秒フェード（8 秒尺 → 7 秒で半分）
  assertNear(resolvedAudioGain(r, 7), 0.4 * 0.5, 1e-6);
  assertNear(resolvedAudioGain(r, 8), 0, 1e-9);
  // 外部ゲイン（ダッキング）
  assertNear(resolvedAudioGain(r, { time: 2, external: 0.25 }), 0.1, 1e-9);
  r.external = 0.5;
  assertNear(resolvedAudioGain(r), 0.2, 1e-9);
  r.external = 1;
  // キーフレーム
  c.keys = { volume: [{ t: 2, v: 0 }, { t: 4, v: 1 }] };
  assertNear(resolvedAudioGain(r, { localTime: 3 }), 0.5 * 0.5, 1e-6);
  // muted は 0
  r.muted = true;
  assert.equal(resolvedAudioGain(r), 0);
  assert.equal(resolvedAudioGain(null), 0);
});

test("resolvedAudioGain: フェードの形（linear / exp / log）はどれも 0→1 で単調", () => {
  for (const curve of ["linear", "exp", "log"]) {
    const c = newClip("audio", { assetId: "as_a", start: 0, duration: 4, in: 0, out: 4 });
    c.audioFade = { in: 2, out: 0, curve };
    const r = resolveClip(c, 0, { fps: 30 });
    let prev = -1;
    for (let t = 0; t <= 2.0001; t += 0.1) {
      const g = resolvedAudioGain(r, t);
      assert.ok(g >= prev - 1e-9, `${curve} が単調でない`);
      assert.ok(g >= 0 && g <= 1.0001, `${curve} が 0..1 の外（${g}）`);
      prev = g;
    }
    assertNear(resolvedAudioGain(r, 0), 0, 1e-9);
    assertNear(resolvedAudioGain(r, 2), 1, 1e-9);
  }
  // exp はゆっくり立ち上がり、log は素早い
  const mk = (curve) => {
    const c = newClip("audio", { assetId: "as_a", start: 0, duration: 4, in: 0, out: 4 });
    c.audioFade = { in: 2, out: 0, curve };
    return resolvedAudioGain(resolveClip(c, 0, { fps: 30 }), 1);
  };
  assert.ok(mk("exp") < mk("linear"));
  assert.ok(mk("log") > mk("linear"));
});

/* ══ §7 Resolved の持ち方（pool / 独立）══════════════════════════════ */

test("pool 無し（既定）: 返り値を持っていても次の呼び出しで壊れない", () => {
  const t = track({ kind: "video" }, [clip({ start: 0, duration: 4, in: 0, out: 4 })]);
  const p = project([t]);
  const a = clipsAt(p, 1)[0];
  const b = clipsAt(p, 2)[0];
  assert.notEqual(a, b);
  assertNear(a.localTime, 1);
  assertNear(b.localTime, 2);
  assert.notEqual(a.transform, b.transform);
});

test("pool 有り: 器を使い回す（同じ clip.id にしか使い回さない）", () => {
  const t = track({ kind: "video" }, [clip({ id: "cz", start: 0, duration: 4, in: 0, out: 4 })]);
  t.clips[0].id = "cz";
  const p = project([t]);
  const pool = createResolvePool();
  const a = clipsAt(p, 1, { pool })[0];
  const listA = clipsAt(p, 1, { pool });
  const b = clipsAt(p, 2, { pool })[0];
  assert.equal(a, b, "同じ record が返る（= 割り当てが起きない）");
  assert.equal(b.clip.id, "cz", "別のクリップに化けない");
  assertNear(b.localTime, 2);
  assert.equal(listA, pool.list, "配列も使い回す");
  // detachResolved で固めれば持ち出せる
  const snap = detachResolved(b);
  clipsAt(p, 3, { pool });
  assertNear(snap.localTime, 2, 1e-9, "固めた物は動かない");
  assert.notEqual(snap.transform, b.transform);
  pool.clear();
  assert.notEqual(clipsAt(p, 1, { pool })[0], a);
});

/* ══ §8 実物の project（normalize を通した往復）════════════════════ */

test("normalizeProject を通した project でも同じように読める", () => {
  const asset = newAsset({ kind: "video", name: "x.mp4", duration: 10, hasAudio: true });
  const raw = newProject({
    settings: { fps: 30 },
    assets: [asset],
    tracks: [newTrack("video", {
      clips: [
        newClip("video", { assetId: asset.id, start: 0, duration: 2, in: 0, out: 2, transitionOut: { type: "crossfade", duration: 0.5, params: {} } }),
        newClip("video", { assetId: asset.id, start: 2, duration: 2, in: 2, out: 4 }),
      ]
    })]
  });
  const p = normalizeProject(raw);
  const list = clipsAt(p, 1.8);
  assert.equal(list.length, 1);
  const r = list[0];
  assert.ok(r.transition, "遷移が読めるはず");
  assert.equal(r.transition.role, "out");
  assert.ok(r.transition.p >= 0 && r.transition.p <= 0.5);
  assertNear(r.sourceTime, 1.8);
  assert.equal(r.visible, true);
  assert.equal(r.blend, "normal");
  // 全フレーム回して NaN / 例外が出ないこと（これが毎フレームの安全網）
  for (let f = 0; f <= 120; f++) {
    const t = f / 30;
    for (const x of clipsAt(p, t)) {
      assert.ok(Number.isFinite(x.localTime), `localTime が NaN（t=${t}）`);
      assert.ok(Number.isFinite(x.sourceTime), `sourceTime が NaN（t=${t}）`);
      assert.ok(Number.isFinite(x.opacity), `opacity が NaN（t=${t}）`);
      assert.ok(Number.isFinite(x.transform.scaleX) && Number.isFinite(x.transform.rotate));
      assert.ok(Number.isFinite(x.speed) && x.speed > 0);
    }
    for (const x of audioAt(p, t)) {
      assert.ok(Number.isFinite(resolvedAudioGain(x)), `gain が NaN（t=${t}）`);
    }
  }
});

test("壊れた入力でも throw しない", () => {
  assert.equal(resolveClip({}, 0, {}), null, "尺 0 は居ない");
  assert.ok(resolveClip({ start: 0, duration: 1 }, 0), "opts 無しでも読める（fps は既定）");
  const weird = { start: "0", duration: "2", kind: "video", in: -5, out: "abc", speed: 0, speedRamp: [{}, { t: "x" }], keys: { opacity: "だめ" }, transform: "だめ" };
  const r = resolveClip(weird, 0.5, { fps: 0 });
  assert.ok(r, "読める形に落として返すはず");
  assert.ok(Number.isFinite(r.sourceTime));
  assert.ok(Number.isFinite(r.transform.scaleX));
  assert.equal(r.opacity, 1);
  assert.ok(Number.isFinite(buildSpeedMap(weird).totalSource));
  assert.ok(Number.isFinite(sourceTimeAt(weird, 1)));
});
