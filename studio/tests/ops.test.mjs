/* ══════════════════════════════════════════════════════════════════════
   tests/ops.test.mjs — core/ops.js の試験（node --test）

   ここで守りたいのは 4 つ。
   1) **不変条件**（契約書 §1）。どの op を通しても
      「同一トラックは start 昇順・重なり無し・MIN_CLIP 以上・in/out が
       素材尺の中・keys は昇順」が崩れない。崩れると engine が最後の
      フレームで止まる／音が切れるという分かりにくい形で出る。
   2) **分割とトリムの素材範囲**。speed 2 倍・reverse・speedRamp の 3 つが
      絡むと手計算と合わなくなりやすいので、値をそのまま突き合わせる。
   3) **後続の位置**（insert / overwrite / rippleDelete / 速度変更）。
      1 フレームずれると音楽との同期が黙って壊れる。
   4) **OpError で返ること**。UI は toast を出して復帰するので、
      壊れた payload で TypeError が漏れてはいけない。

   走らせ方: `cd studio && npm test`（= node --test "tests/*.test.mjs"）
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import { OPS, OP_LABELS, applyOp, opLabel, OpError } from "../src/core/ops.js";
import {
  MIN_CLIP, MAX_TRACKS,
  newProject, newAsset, findClip, assetById, clipEnd,
  validateProject, normalizeProject
} from "../src/core/schema.js";

/* ── 足場 ───────────────────────────────────────────────────────── */

const EPS = 1e-6;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/** 素材 3 つ（映像 20 秒・音 30 秒・静止画）を持つ空のプロジェクト */
function mkProject() {
  return newProject({
    assets: [
      newAsset({ id: "as_v", kind: "video", name: "v.mp4", mime: "video/mp4", duration: 20, width: 1920, height: 1080, fps: 30, hasAudio: true }),
      newAsset({ id: "as_a", kind: "audio", name: "m.m4a", mime: "audio/mp4", duration: 30, hasAudio: true }),
      newAsset({ id: "as_i", kind: "image", name: "p.png", mime: "image/png", width: 1200, height: 800 })
    ]
  });
}

const addTrack = (p, kind) => applyOp(p, "track.add", { kind }).trackId;

/** clip.add の短縮（spec の start をそのまま at に使う） */
function addClip(p, trackId, spec, mode) {
  const r = applyOp(p, "clip.add", { trackId, clip: spec, at: spec.start || 0, mode });
  return r.clipId;
}

const clipOf = (p, id) => {
  const f = findClip(p, id);
  return f ? f.clip : null;
};
const trackOf = (p, trackId) => p.tracks.find((t) => t.id === trackId);
/** そのトラックの [start, duration] の一覧（位置の確認用） */
const layout = (p, trackId) => trackOf(p, trackId).clips.map((c) => [round(c.start), round(c.duration)]);
const round = (n) => Math.round(n * 1e6) / 1e6;

/** 契約書 §1 の不変条件を全部見る（どの試験の最後でも呼べる） */
function assertInvariants(p, why) {
  const tag = why ? ` (${why})` : "";
  for (const tr of p.tracks) {
    assert.ok(Array.isArray(tr.clips), `clips が配列でない${tag}`);
    for (let i = 0; i < tr.clips.length; i++) {
      const c = tr.clips[i];
      assert.ok(Number.isFinite(c.start) && c.start >= -EPS, `start が壊れている: ${c.start}${tag}`);
      assert.ok(c.duration >= MIN_CLIP - EPS, `MIN_CLIP 未満: ${c.duration}${tag}`);
      if (i > 0) {
        const prev = tr.clips[i - 1];
        assert.ok(prev.start <= c.start + EPS, `start 昇順が崩れた${tag}`);
        assert.ok(clipEnd(prev) <= c.start + 1e-6, `重なっている: ${clipEnd(prev)} > ${c.start}${tag}`);
      }
      if (c.kind === "video" || c.kind === "audio") {
        const a = assetById(p, c.assetId);
        assert.ok(c.in >= -EPS, `in < 0${tag}`);
        assert.ok(c.out > c.in + EPS, `out <= in${tag}`);
        if (a && a.duration > 0) assert.ok(c.out <= a.duration + 1e-3, `out が素材尺を超えた: ${c.out} > ${a.duration}${tag}`);
      }
      for (const path of Object.keys(c.keys || {})) {
        const list = c.keys[path];
        for (let k = 1; k < list.length; k++) {
          assert.ok(list[k - 1].t < list[k].t - EPS / 2, `keys が昇順でない (${path})${tag}`);
        }
      }
      for (const e of ["transitionIn", "transitionOut"]) {
        if (c[e]) assert.ok(c[e].duration <= c.duration * 0.5 + 1e-6, `${e} が長すぎる${tag}`);
      }
    }
  }
  const v = validateProject(p);
  assert.equal(v.ok, true, `validateProject が怒った${tag}: ${JSON.stringify(v.errors)}`);
}

/* ══ 名簿と入口 ═══════════════════════════════════════════════════ */

test("OPS: 契約書 §3 に並ぶ op が全部在る", () => {
  const want = `asset.add asset.remove asset.update
 track.add track.remove track.update track.reorder
 clip.add clip.remove clip.update clip.move clip.trim clip.split clip.duplicate
 clip.rippleDelete clip.slip clip.roll clip.reorder clip.group clip.ungroup
 clip.detachAudio clip.link clip.setSpeed clip.setSpeedRamp clip.freeze clip.reverse
 clip.setTransform clip.setColor clip.setMask clip.setChroma clip.setText clip.setShape
 clip.addFx clip.removeFx clip.updateFx clip.reorderFx
 clip.setTransition clip.removeTransition
 key.add key.remove key.update key.moveAll
 marker.add marker.remove marker.update chapter.add chapter.remove
 settings.update subtitle.import project.rename
 timeline.paste timeline.insert timeline.overwrite timeline.magneticClose
 compound.make compound.enter compound.flatten`.split(/\s+/).filter(Boolean);
  for (const t of want) {
    assert.equal(typeof OPS[t], "function", `op ${t} が無い`);
  }
});

test("OP_LABELS: 全部の op に日本語の表示名が在る", () => {
  for (const t of Object.keys(OPS)) {
    assert.equal(typeof OP_LABELS[t], "string", `${t} の表示名が無い`);
    assert.ok(OP_LABELS[t].length > 0);
  }
  assert.equal(opLabel("clip.split"), "分割");
  assert.equal(opLabel("なにこれ"), "なにこれ");   // 知らない op は type をそのまま
});

test("applyOp: 知らない type は OpError（Error でもある）", () => {
  const p = mkProject();
  assert.throws(() => applyOp(p, "clip.explode", {}), (e) => {
    assert.ok(e instanceof OpError, "OpError でない");
    assert.ok(e instanceof Error, "Error でない");
    assert.equal(e.name, "OpError");
    assert.match(e.message, /知らない op/);
    assert.equal(e.detail.type, "clip.explode");
    return true;
  });
  assert.throws(() => applyOp(p, "", {}), OpError);
  assert.throws(() => applyOp(null, "project.rename", { name: "x" }), OpError);
});

test("OpError: 壊れた payload で TypeError を漏らさない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const cases = [
    ["clip.add", { trackId: "tr_nope", clip: { assetId: "as_v" } }],
    ["clip.add", { trackId: tr, clip: { assetId: "as_missing" } }],
    ["clip.add", { trackId: tr, clip: { assetId: "as_v" }, mode: "なにか" }],
    ["clip.split", { clipId: "cl_nope", t: 1 }],
    ["clip.trim", { clipId: "cl_nope", edge: "end", delta: 1 }],
    ["clip.update", { clipId: "cl_nope", patch: {} }],
    ["clip.update", {}],
    ["key.add", { clipId: "cl_nope", path: "opacity", t: 0, v: 1 }],
    ["track.remove", { trackId: "tr_nope" }],
    ["track.add", { kind: "なにか" }],
    ["asset.remove", { assetId: "as_nope" }],
    ["asset.update", { assetId: "as_nope", patch: {} }],
    ["project.rename", { name: "   " }],
    ["settings.update", { patch: { ratio: "3:7" } }],
    ["subtitle.import", { srt: "" }],
    ["subtitle.import", { srt: "これは字幕ではない" }],
    ["timeline.paste", { clips: [] }],
    ["compound.flatten", { clipId: "cl_nope" }],
    ["marker.remove", {}]
  ];
  for (const [type, payload] of cases) {
    assert.throws(() => applyOp(p, type, payload), OpError, `${type} が OpError を投げない`);
  }
  assertInvariants(p, "壊れた payload の後");
});

/* ══ 置く（add / overwrite / insert / fit）═══════════════════════ */

test("clip.add: overwrite は重なった既存を削る・割る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const big = addClip(p, tr, { assetId: "as_v", start: 0, duration: 10 });
  const mid = addClip(p, tr, { assetId: "as_v", in: 12, start: 4, duration: 2 }, "overwrite");
  // [0,10] の真ん中を抜いたので 3 つになる
  assert.deepEqual(layout(p, tr), [[0, 4], [4, 2], [6, 4]]);
  const left = clipOf(p, big);
  assert.ok(near(left.out, 4), `左の out が素材側も詰まっていない: ${left.out}`);
  assert.equal(clipOf(p, mid).start, 4);
  // 右側は別 id で作られ、素材の続き（6 秒目から）を指す
  const right = trackOf(p, tr).clips[2];
  assert.notEqual(right.id, big);
  assert.ok(near(right.in, 6), `右の in が飛んでいる: ${right.in}`);
  assert.ok(near(right.out, 10));
  assertInvariants(p, "overwrite");
});

test("clip.add: overwrite で丸ごと隠れた既存は消える", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 2, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 6 }, "overwrite");
  assert.deepEqual(layout(p, tr), [[0, 6]]);
  assertInvariants(p, "overwrite 全消し");
});

test("clip.add: insert は跨いだ物を割って後続を後ろへずらす", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 4, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 2, duration: 2 }, "insert");
  // [0,4] が 2 で割れ、2 より後ろは +2 される
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2], [4, 2], [6, 4]]);
  assertInvariants(p, "insert");
});

test("clip.add: fit は at 以降の最初の空きへ置く", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 10, duration: 4 });
  const id = addClip(p, tr, { assetId: "as_v", start: 1, duration: 3 }, "fit");
  assert.equal(clipOf(p, id).start, 4);   // 0..4 は埋まっているので 4 へ
  assert.deepEqual(layout(p, tr), [[0, 4], [4, 3], [10, 4]]);
  assertInvariants(p, "fit");
});

test("clip.add: trackId を省くと種類に合うトラックを用意する", () => {
  const p = mkProject();
  const a = applyOp(p, "clip.add", { clip: { assetId: "as_v", duration: 3 }, at: 0 });
  const b = applyOp(p, "clip.add", { clip: { assetId: "as_a", duration: 3 }, at: 0 });
  const t = applyOp(p, "clip.add", { clip: { kind: "text", duration: 3, text: { content: "題" } }, at: 0 });
  assert.equal(trackOf(p, a.trackId).kind, "video");
  assert.equal(trackOf(p, b.trackId).kind, "audio");
  assert.equal(trackOf(p, t.trackId).kind, "overlay");
  // 同じ所が埋まっていれば もう 1 本足す
  const a2 = applyOp(p, "clip.add", { clip: { assetId: "as_v", duration: 3 }, at: 1 });
  assert.notEqual(a2.trackId, a.trackId);
  assertInvariants(p, "トラック自動");
});

test("clip.add: 素材の尺を超える長さは素材の端で止まる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 18, duration: 10 });
  const c = clipOf(p, id);
  assert.ok(near(c.out, 20), `out=${c.out}`);
  assert.ok(near(c.duration, 2), `duration=${c.duration}`);
  assertInvariants(p, "素材の端");
});

/* ══ 分割（in/out の分配）═════════════════════════════════════════ */

test("clip.split: 素直な等速（in/out が分割点で分かれる）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 2, start: 0, duration: 4 });
  const r = applyOp(p, "clip.split", { clipId: id, t: 1.5 });
  assert.equal(r.ids.length, 2);
  assert.equal(r.ids[0], id);
  const [l, rt] = [clipOf(p, r.ids[0]), clipOf(p, r.ids[1])];
  assert.deepEqual([round(l.start), round(l.duration), round(l.in), round(l.out)], [0, 1.5, 2, 3.5]);
  assert.deepEqual([round(rt.start), round(rt.duration), round(rt.in), round(rt.out)], [1.5, 2.5, 3.5, 6]);
  assertInvariants(p, "split 等速");
});

test("clip.split: speed 2 倍は素材を倍の速さで食う", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  // in 0 / out 8 を 4 秒で流す = 2 倍速
  const id = addClip(p, tr, { assetId: "as_v", in: 0, out: 8, duration: 4, speed: 2 });
  const r = applyOp(p, "clip.split", { clipId: id, t: 1 });
  const l = clipOf(p, r.leftId), rt = clipOf(p, r.rightId);
  assert.deepEqual([round(l.duration), round(l.in), round(l.out)], [1, 0, 2]);
  assert.deepEqual([round(rt.duration), round(rt.in), round(rt.out)], [3, 2, 8]);
  assert.equal(l.speed, 2);
  assert.equal(rt.speed, 2);
  assertInvariants(p, "split 2 倍速");
});

test("clip.split: reverse は out 側から食うので左右が入れ替わる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 0, out: 8, duration: 4, speed: 2, reverse: true });
  const r = applyOp(p, "clip.split", { clipId: id, t: 1 });
  const l = clipOf(p, r.leftId), rt = clipOf(p, r.rightId);
  // 逆再生は 8 秒目から手前へ進む → 最初の 1 秒で 8→6
  assert.deepEqual([round(l.in), round(l.out)], [6, 8]);
  assert.deepEqual([round(rt.in), round(rt.out)], [0, 6]);
  assert.equal(l.reverse, true);
  assert.equal(rt.reverse, true);
  assertInvariants(p, "split reverse");
});

test("clip.split: speedRamp は ∫v dt で分け、境界の倍率を両方に差す", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 0, out: 8, duration: 4 });
  // 0 秒で 1 倍 → 4 秒で 3 倍（平均 2 倍 = 4 秒で 8 秒ぶん食う）
  applyOp(p, "clip.setSpeedRamp", { clipId: id, ramp: [{ t: 0, v: 1 }, { t: 4, v: 3 }], keepDuration: true });
  const before = clipOf(p, id);
  assert.ok(near(before.duration, 4), `ramp 後の尺: ${before.duration}`);
  assert.ok(near(before.out, 8), `ramp 後の out: ${before.out}`);

  const r = applyOp(p, "clip.split", { clipId: id, t: 2 });
  const l = clipOf(p, r.leftId), rt = clipOf(p, r.rightId);
  // ∫₀² (1 + t/2) dt = 2 + 1 = 3
  assert.deepEqual([round(l.in), round(l.out)], [0, 3]);
  assert.deepEqual([round(rt.in), round(rt.out)], [3, 8]);
  assert.deepEqual(l.speedRamp.map((q) => [round(q.t), round(q.v)]), [[0, 1], [2, 2]]);
  assert.deepEqual(rt.speedRamp.map((q) => [round(q.t), round(q.v)]), [[0, 2], [2, 3]]);
  assertInvariants(p, "split ramp");
});

test("clip.split: キーは左右へ分かれ、境界に補間値のキーが入る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  applyOp(p, "key.add", { clipId: id, path: "opacity", t: 0, v: 0 });
  applyOp(p, "key.add", { clipId: id, path: "opacity", t: 4, v: 1 });
  applyOp(p, "key.add", { clipId: id, path: "transform.scale", t: 1, v: 1 });
  applyOp(p, "key.add", { clipId: id, path: "transform.scale", t: 3, v: 2 });

  const r = applyOp(p, "clip.split", { clipId: id, t: 2 });
  const l = clipOf(p, r.leftId), rt = clipOf(p, r.rightId);
  // opacity は 0→1 の直線なので 2 秒の値は 0.5
  assert.deepEqual(l.keys.opacity.map((k) => [round(k.t), round(k.v)]), [[0, 0], [2, 0.5]]);
  assert.deepEqual(rt.keys.opacity.map((k) => [round(k.t), round(k.v)]), [[0, 0.5], [2, 1]]);
  // scale は 1 秒と 3 秒に在る → 境界（左の 2 秒 / 右の 0 秒）は 1.5
  assert.deepEqual(l.keys["transform.scale"].map((k) => [round(k.t), round(k.v)]), [[0, 1], [1, 1], [2, 1.5]]);
  assert.deepEqual(rt.keys["transform.scale"].map((k) => [round(k.t), round(k.v)]), [[0, 1.5], [1, 2], [2, 2]]);
  assertInvariants(p, "split keys");
});

test("clip.split: 遷移は左右へ分配され、切り口は素のカットになる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", start: 0, duration: 6 });
  applyOp(p, "clip.setTransition", { clipId: id, edge: "in", type: "crossfade", duration: 0.5 });
  applyOp(p, "clip.setTransition", { clipId: id, edge: "out", type: "glitch", duration: 0.5 });
  const r = applyOp(p, "clip.split", { clipId: id, t: 3 });
  const l = clipOf(p, r.leftId), rt = clipOf(p, r.rightId);
  assert.equal(l.transitionIn.type, "crossfade");
  assert.equal(l.transitionOut, null);
  assert.equal(rt.transitionIn, null);
  assert.equal(rt.transitionOut.type, "glitch");
  assertInvariants(p, "split 遷移");
});

test("clip.split: 短すぎる所では割らずに OpError", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", start: 0, duration: 1 });
  assert.throws(() => applyOp(p, "clip.split", { clipId: id, t: 0.01 }), OpError);
  assert.throws(() => applyOp(p, "clip.split", { clipId: id, t: 5 }), OpError);
  assert.throws(() => applyOp(p, "clip.split", { clipId: id }), OpError);
  assert.equal(trackOf(p, tr).clips.length, 1, "失敗したのに増えた");
  assertInvariants(p, "split 失敗");
});

test("clip.split: 相棒（linkedId）も一緒に割って左右を結び直す", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const v = addClip(p, tr, { assetId: "as_v", start: 0, duration: 6 });
  const d = applyOp(p, "clip.detachAudio", { clipId: v });
  const r = applyOp(p, "clip.split", { clipId: v, t: 3 });
  assert.ok(Array.isArray(r.linked), "相棒が割れていない");
  const vl = clipOf(p, r.leftId), vr = clipOf(p, r.rightId);
  const al = clipOf(p, r.linked[0]), ar = clipOf(p, r.linked[1]);
  assert.equal(vl.linkedId, al.id);
  assert.equal(al.linkedId, vl.id);
  assert.equal(vr.linkedId, ar.id);
  assert.equal(ar.linkedId, vr.id);
  assert.equal(d.clipId, al.id);
  assertInvariants(p, "split 相棒");
});

/* ══ トリム（端の限界）════════════════════════════════════════════ */

test("clip.trim: end を縮める・伸ばす（素材の端で止まる）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  let r = applyOp(p, "clip.trim", { clipId: id, edge: "end", delta: 1 });
  assert.ok(near(r.duration, 3) && near(r.out, 3), JSON.stringify(r));
  r = applyOp(p, "clip.trim", { clipId: id, edge: "end", delta: -5 });   // 伸ばす
  assert.ok(near(r.duration, 8) && near(r.out, 8), JSON.stringify(r));
  // 素材は 20 秒なので 20 秒で止まる
  r = applyOp(p, "clip.trim", { clipId: id, edge: "end", delta: -100 });
  assert.ok(near(r.duration, 20) && near(r.out, 20), JSON.stringify(r));
  assertInvariants(p, "trim end");
});

test("clip.trim: start は素材の頭（in=0）より前へは行けない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 0, start: 5, duration: 4 });
  const r = applyOp(p, "clip.trim", { clipId: id, edge: "start", delta: -2 });
  assert.equal(r.applied, 0, "素材が無いのに伸びた");
  const c = clipOf(p, id);
  assert.deepEqual([round(c.start), round(c.duration), round(c.in)], [5, 4, 0]);
  // in に余りが在れば伸びる
  const id2 = addClip(p, tr, { assetId: "as_v", in: 6, start: 20, duration: 4 });
  const r2 = applyOp(p, "clip.trim", { clipId: id2, edge: "start", delta: -2 });
  const c2 = clipOf(p, id2);
  assert.ok(near(r2.applied, -2));
  assert.deepEqual([round(c2.start), round(c2.duration), round(c2.in)], [18, 6, 4]);
  assertInvariants(p, "trim start");
});

test("clip.trim: MIN_CLIP より短くはならない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  applyOp(p, "clip.trim", { clipId: id, edge: "end", delta: 100 });
  assert.ok(near(clipOf(p, id).duration, MIN_CLIP), `${clipOf(p, id).duration}`);
  const id2 = addClip(p, tr, { assetId: "as_v", start: 10, duration: 4 });
  applyOp(p, "clip.trim", { clipId: id2, edge: "start", delta: 100 });
  assert.ok(near(clipOf(p, id2).duration, MIN_CLIP));
  assertInvariants(p, "trim MIN_CLIP");
});

test("clip.trim: 隣のクリップより向こうへは伸びない（ripple なし）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 6, duration: 4 });
  const r = applyOp(p, "clip.trim", { clipId: a, edge: "end", delta: -10 });
  assert.ok(near(r.duration, 6), `隣を踏んだ: ${r.duration}`);
  assert.deepEqual(layout(p, tr), [[0, 6], [6, 4]]);
  assertInvariants(p, "trim 隣");
});

test("clip.trim: ripple:true なら後続が付いてくる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 4, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 8, duration: 4 });
  applyOp(p, "clip.trim", { clipId: a, edge: "end", delta: 1, ripple: true });
  assert.deepEqual(layout(p, tr), [[0, 3], [3, 4], [7, 4]]);
  // 頭のトリムでも穴を作らない（start は動かず後ろが詰まる）
  const b = trackOf(p, tr).clips[1].id;
  applyOp(p, "clip.trim", { clipId: b, edge: "start", delta: 1, ripple: true });
  assert.deepEqual(layout(p, tr), [[0, 3], [3, 3], [6, 4]]);
  assertInvariants(p, "trim ripple");
});

test("clip.trim: ramp 付きでも素材の端で止まる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const id = addClip(p, tr, { assetId: "as_v", in: 0, out: 8, duration: 4 });
  applyOp(p, "clip.setSpeedRamp", { clipId: id, ramp: [{ t: 0, v: 1 }, { t: 4, v: 3 }], keepDuration: true });
  applyOp(p, "clip.trim", { clipId: id, edge: "end", delta: -100 });
  const c = clipOf(p, id);
  assert.ok(near(c.out, 20), `out=${c.out}`);
  // 最後の倍率 3 で 12 秒ぶん（20-8）食うので +4 秒 = 8 秒
  assert.ok(near(c.duration, 8), `duration=${c.duration}`);
  assertInvariants(p, "trim ramp");
});

/* ══ 削る・詰める ═════════════════════════════════════════════════ */

test("clip.rippleDelete: 消した分だけ後続が詰まる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  const b = addClip(p, tr, { assetId: "as_v", start: 2, duration: 3 });
  addClip(p, tr, { assetId: "as_v", start: 5, duration: 2 });
  const r = applyOp(p, "clip.rippleDelete", { clipId: b });
  assert.equal(r.removed, 1);
  assert.ok(near(r.closed, 3));
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2]]);
  assert.equal(clipOf(p, a).id, a);
  assertInvariants(p, "rippleDelete");
});

test("clip.rippleDelete: 複数でも位置が狂わない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const ids = [0, 2, 4, 6].map((s) => addClip(p, tr, { assetId: "as_v", start: s, duration: 2 }));
  applyOp(p, "clip.rippleDelete", { clipIds: [ids[0], ids[2]] });
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2]]);
  assert.equal(clipOf(p, ids[1]).start, 0);
  assert.equal(clipOf(p, ids[3]).start, 2);
  assertInvariants(p, "rippleDelete 複数");
});

test("clip.remove: 相棒の linkedId は残さない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const v = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const d = applyOp(p, "clip.detachAudio", { clipId: v });
  applyOp(p, "clip.remove", { clipId: v });
  assert.equal(clipOf(p, v), null);
  assert.equal(clipOf(p, d.clipId).linkedId, null, "宙に浮いた linkedId が残った");
  // linked:true なら相棒ごと
  const v2 = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const d2 = applyOp(p, "clip.detachAudio", { clipId: v2 });
  const r = applyOp(p, "clip.remove", { clipId: v2, linked: true });
  assert.equal(r.removed, 2);
  assert.equal(clipOf(p, d2.clipId), null);
  assertInvariants(p, "remove 相棒");
});

test("timeline.magneticClose: 隙間を詰める", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 1, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 6, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 10, duration: 2 });
  const r = applyOp(p, "timeline.magneticClose", { trackId: tr });
  assert.equal(r.moved, 3);
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2], [4, 2]]);
  assertInvariants(p, "magneticClose");
});

test("timeline.magneticClose: from より前は触らない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 8, duration: 2 });
  applyOp(p, "timeline.magneticClose", { trackId: tr, from: 4 });
  assert.deepEqual(layout(p, tr), [[0, 2], [4, 2]]);
  assertInvariants(p, "magneticClose from");
});

/* ══ 移動・複製・並べ替え ═════════════════════════════════════════ */

test("clip.move: 別トラックへ移し、元の穴は残す（ripple で詰める）", () => {
  const p = mkProject();
  const v1 = addTrack(p, "video");
  const v2 = addTrack(p, "video");
  const a = addClip(p, v1, { assetId: "as_v", start: 0, duration: 2 });
  addClip(p, v1, { assetId: "as_v", start: 2, duration: 2 });
  applyOp(p, "clip.move", { clipId: a, trackId: v2, start: 5 });
  assert.deepEqual(layout(p, v1), [[2, 2]]);
  assert.deepEqual(layout(p, v2), [[5, 2]]);
  assert.equal(findClip(p, a).track.id, v2);
  assertInvariants(p, "move");
});

test("clip.duplicate: 1 つなら直後へ差し込む・複数なら相対位置を保つ", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 2, duration: 2 });
  const r = applyOp(p, "clip.duplicate", { clipId: a });
  assert.equal(r.ids.length, 1);
  assert.notEqual(r.ids[0], a);
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2], [4, 2]]);
  assert.equal(clipOf(p, r.ids[0]).start, 2);
  assertInvariants(p, "duplicate 1 つ");

  const p2 = mkProject();
  const t2 = addTrack(p2, "video");
  const x = addClip(p2, t2, { assetId: "as_v", start: 0, duration: 2 });
  const y = addClip(p2, t2, { assetId: "as_v", start: 4, duration: 2 });
  const r2 = applyOp(p2, "clip.duplicate", { clipIds: [x, y] });
  assert.equal(r2.ids.length, 2);
  assert.deepEqual(layout(p2, t2), [[0, 2], [4, 2], [6, 2], [10, 2]]);
  assertInvariants(p2, "duplicate 複数");
});

test("clip.duplicate: グループはまとめて新しいグループになる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  const b = addClip(p, tr, { assetId: "as_v", start: 2, duration: 2 });
  const g = applyOp(p, "clip.group", { clipIds: [a, b] });
  const r = applyOp(p, "clip.duplicate", { clipIds: [a, b] });
  const copies = r.ids.map((id) => clipOf(p, id));
  assert.equal(copies[0].groupId, copies[1].groupId);
  assert.notEqual(copies[0].groupId, g.groupId);
  applyOp(p, "clip.ungroup", { groupId: g.groupId });
  assert.equal(clipOf(p, a).groupId, null);
  assert.equal(copies[0].groupId !== null, true, "複製側まで解除された");
  assertInvariants(p, "duplicate グループ");
});

test("clip.reorder: 尺を保って先頭から詰め直す", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 1 });
  const b = addClip(p, tr, { assetId: "as_v", start: 1, duration: 2 });
  const c = addClip(p, tr, { assetId: "as_v", start: 3, duration: 3 });
  const r = applyOp(p, "clip.reorder", { trackId: tr, clipId: c, index: 0 });
  assert.deepEqual(r.order, [c, a, b]);
  assert.deepEqual(layout(p, tr), [[0, 3], [3, 1], [4, 2]]);
  assert.throws(() => applyOp(p, "clip.reorder", { trackId: tr, order: [a, b] }), OpError);
  assertInvariants(p, "reorder");
});

/* ══ 速度・静止・逆再生・スリップ・ロール ═════════════════════════ */

test("clip.setSpeed: 既定は素材範囲を保って尺が変わり、後続が詰まる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 4, duration: 2 });
  const r = applyOp(p, "clip.setSpeed", { clipId: a, speed: 2 });
  assert.ok(near(r.duration, 2), JSON.stringify(r));
  const c = clipOf(p, a);
  assert.deepEqual([round(c.in), round(c.out)], [0, 4]);
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2]]);
  assertInvariants(p, "setSpeed");
});

test("clip.setSpeed: keepDuration は尺を保って素材の使う量を変える", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  applyOp(p, "clip.setSpeed", { clipId: a, speed: 2, keepDuration: true });
  const c = clipOf(p, a);
  assert.ok(near(c.duration, 4), `duration=${c.duration}`);
  assert.ok(near(c.out, 8), `out=${c.out}`);
  assertInvariants(p, "setSpeed keepDuration");
});

test("clip.setSpeed: キーは尺の伸縮に付いてくる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 0, v: 0 });
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 4, v: 1 });
  applyOp(p, "clip.setSpeed", { clipId: a, speed: 2 });   // 尺 4 → 2
  const c = clipOf(p, a);
  assert.deepEqual(c.keys.opacity.map((k) => [round(k.t), round(k.v)]), [[0, 0], [2, 1]]);
  assertInvariants(p, "setSpeed keys");
});

test("clip.setSpeedRamp: 尺は ∫v dt の逆算で決まる / null で戻る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, out: 4, duration: 4 });
  // 一定 2 倍のランプ（点が 2 つでも値が同じなら speed へ畳む）
  const r1 = applyOp(p, "clip.setSpeedRamp", { clipId: a, ramp: [{ t: 0, v: 2 }, { t: 4, v: 2 }] });
  assert.equal(r1.ramp, null, "一定のランプが畳まれていない");
  assert.equal(clipOf(p, a).speed, 2);
  assert.ok(near(clipOf(p, a).duration, 2), `${clipOf(p, a).duration}`);
  // 1 倍 → 3 倍（平均 2 倍）: 素材 4 秒ぶんを食う尺 = 0.25l²+l=4 → l≈2.4721
  const r2 = applyOp(p, "clip.setSpeedRamp", { clipId: a, ramp: [{ t: 0, v: 1 }, { t: 4, v: 3 }] });
  assert.ok(Array.isArray(r2.ramp));
  assert.ok(near(clipOf(p, a).duration, 2 * (Math.sqrt(5) - 1), 1e-4), `${clipOf(p, a).duration}`);
  applyOp(p, "clip.setSpeedRamp", { clipId: a, ramp: null });
  assert.equal(clipOf(p, a).speedRamp, null);
  assert.throws(() => applyOp(p, "clip.setSpeedRamp", { clipId: a, ramp: [{ t: 0, v: 0 }] }), OpError);
  assert.throws(() => applyOp(p, "clip.setSpeedRamp", { clipId: a, ramp: "はやく" }), OpError);
  assertInvariants(p, "setSpeedRamp");
});

test("clip.freeze: 静止クリップを差し込み、後続を後ろへ送る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  addClip(p, tr, { assetId: "as_v", start: 4, duration: 2 });
  const r = applyOp(p, "clip.freeze", { clipId: a, t: 2, duration: 3 });
  const still = clipOf(p, r.clipId);
  assert.equal(still.start, 2);
  assert.ok(near(still.duration, 3));
  assert.ok(still.out - still.in < 0.1, `静止なのに素材を食いすぎ: ${still.out - still.in}`);
  assert.ok(near(still.in, 2, 1e-3), `止める位置がずれた: ${still.in}`);
  assert.equal(still.muteAudio, true);
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 3], [5, 2], [7, 2]]);
  assertInvariants(p, "freeze");
});

test("clip.reverse: 切り替わる（素材を持たない種類は OpError）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  assert.equal(applyOp(p, "clip.reverse", { clipId: a }).reverse, true);
  assert.equal(applyOp(p, "clip.reverse", { clipId: a }).reverse, false);
  assert.equal(applyOp(p, "clip.reverse", { clipId: a, reverse: true }).reverse, true);
  const ov = addTrack(p, "overlay");
  const t = addClip(p, ov, { kind: "text", start: 0, duration: 2, text: { content: "あ" } });
  assert.throws(() => applyOp(p, "clip.reverse", { clipId: t }), OpError);
  assertInvariants(p, "reverse");
});

test("clip.slip: 尺を保って in/out がずれる（素材の端で止まる）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 5, start: 0, duration: 4 });
  applyOp(p, "clip.slip", { clipId: a, delta: 2 });
  let c = clipOf(p, a);
  assert.deepEqual([round(c.start), round(c.duration), round(c.in), round(c.out)], [0, 4, 7, 11]);
  applyOp(p, "clip.slip", { clipId: a, delta: -100 });   // 頭で止まる
  c = clipOf(p, a);
  assert.deepEqual([round(c.in), round(c.out), round(c.duration)], [0, 4, 4]);
  applyOp(p, "clip.slip", { clipId: a, delta: 100 });    // 尻で止まる
  c = clipOf(p, a);
  assert.deepEqual([round(c.in), round(c.out), round(c.duration)], [16, 20, 4]);
  assertInvariants(p, "slip");
});

test("clip.roll: 隣との境界だけが動く（全体の尺は変わらない）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 4 });
  const b = addClip(p, tr, { assetId: "as_v", in: 8, start: 4, duration: 4 });
  const r = applyOp(p, "clip.roll", { clipId: a, delta: 1 });
  assert.ok(near(r.delta, 1), JSON.stringify(r));
  assert.deepEqual(layout(p, tr), [[0, 5], [5, 3]]);
  assert.ok(near(clipOf(p, a).out, 5));
  assert.ok(near(clipOf(p, b).in, 9));
  // 隣が無ければ OpError
  assert.throws(() => applyOp(p, "clip.roll", { clipId: b, delta: 1 }), OpError);
  assertInvariants(p, "roll");
});

/* ══ 音の分離・リンク ═════════════════════════════════════════════ */

test("clip.detachAudio: 音トラックへ出して linkedId を張る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const v = addClip(p, tr, { assetId: "as_v", in: 3, start: 1, duration: 4, volume: 0.5 });
  applyOp(p, "key.add", { clipId: v, path: "volume", t: 0, v: 0 });
  applyOp(p, "key.add", { clipId: v, path: "opacity", t: 0, v: 1 });
  const r = applyOp(p, "clip.detachAudio", { clipId: v });
  const a = clipOf(p, r.clipId), vc = clipOf(p, v);
  assert.equal(trackOf(p, r.trackId).kind, "audio");
  assert.equal(a.kind, "audio");
  assert.equal(a.linkedId, v);
  assert.equal(vc.linkedId, a.id);
  assert.equal(vc.muteAudio, true);
  assert.deepEqual([round(a.start), round(a.duration), round(a.in), round(a.out)], [1, 4, 3, 7]);
  assert.equal(a.volume, 0.5);
  // 音のキーは音側へ移る（映像側には残さない）
  assert.ok(a.keys.volume, "volume キーが移っていない");
  assert.equal(vc.keys.volume, undefined);
  assert.ok(vc.keys.opacity, "映像のキーまで移った");
  // 2 回目は OpError
  assert.throws(() => applyOp(p, "clip.detachAudio", { clipId: v }), OpError);
  assertInvariants(p, "detachAudio");
});

test("clip.detachAudio: 音の無い素材・映像でないクリップは OpError", () => {
  const p = mkProject();
  applyOp(p, "asset.add", { asset: { id: "as_mute", kind: "video", duration: 10, hasAudio: false } });
  const tr = addTrack(p, "video");
  const m = addClip(p, tr, { assetId: "as_mute", start: 0, duration: 2 });
  assert.throws(() => applyOp(p, "clip.detachAudio", { clipId: m }), OpError);
  const at = addTrack(p, "audio");
  const s = addClip(p, at, { assetId: "as_a", start: 0, duration: 2 });
  assert.throws(() => applyOp(p, "clip.detachAudio", { clipId: s }), OpError);
  assertInvariants(p, "detachAudio 失敗");
});

test("clip.link: 結ぶ・解く", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const at = addTrack(p, "audio");
  const v = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  const a = addClip(p, at, { assetId: "as_a", start: 0, duration: 2 });
  applyOp(p, "clip.link", { clipIds: [v, a] });
  assert.equal(clipOf(p, v).linkedId, a);
  assert.equal(clipOf(p, a).linkedId, v);
  applyOp(p, "clip.link", { clipIds: [v] });
  assert.equal(clipOf(p, v).linkedId, null);
  assert.equal(clipOf(p, a).linkedId, null);
  assert.throws(() => applyOp(p, "clip.link", { clipIds: [v, v] }), OpError);
  assertInvariants(p, "link");
});

/* ══ 部分更新（深いマージ）════════════════════════════════════════ */

test("clip.update: 枝ごとの深いマージ（null の枝にも部分更新できる）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  assert.equal(clipOf(p, a).color, null);
  applyOp(p, "clip.update", { clipId: a, patch: { color: { exposure: 0.5 } } });
  const c1 = clipOf(p, a);
  assert.equal(c1.color.exposure, 0.5);
  assert.equal(c1.color.contrast, 0, "既定値の枝が消えた");
  assert.ok(Array.isArray(c1.color.curves.rgb), "curves が作られていない");
  // 2 度目の更新で 1 度目が消えない
  applyOp(p, "clip.update", { clipId: a, patch: { color: { contrast: 0.2 } } });
  assert.equal(clipOf(p, a).color.exposure, 0.5);
  assert.equal(clipOf(p, a).color.contrast, 0.2);
  // transform の深い枝
  applyOp(p, "clip.update", { clipId: a, patch: { transform: { crop: { l: 0.1 } } } });
  const tf = clipOf(p, a).transform;
  assert.equal(tf.crop.l, 0.1);
  assert.equal(tf.crop.r, 0);
  assert.equal(tf.scale, 1, "transform の他の枝が消えた");
  // null は枝を消す・配列は差し替え
  applyOp(p, "clip.update", { clipId: a, patch: { mask: { type: "ellipse", w: 0.3 } } });
  assert.equal(clipOf(p, a).mask.type, "ellipse");
  applyOp(p, "clip.update", { clipId: a, patch: { mask: null } });
  assert.equal(clipOf(p, a).mask, null);
  assert.throws(() => applyOp(p, "clip.update", { clipId: a, patch: { opacity: () => 1 } }), OpError);
  assert.throws(() => applyOp(p, "clip.update", { clipId: a, patch: { kind: "audio" } }), OpError);
  assertInvariants(p, "update");
});

test("clip.set* は update の糖衣（部分更新がそのまま効く）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const ov = addTrack(p, "overlay");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const t = addClip(p, ov, { kind: "text", start: 0, duration: 2, text: { content: "元の字" } });
  applyOp(p, "clip.setTransform", { clipId: a, x: 20, scale: 1.5 });
  assert.equal(clipOf(p, a).transform.x, 20);
  assert.equal(clipOf(p, a).transform.scale, 1.5);
  applyOp(p, "clip.setColor", { clipId: a, saturation: 0.3 });
  assert.equal(clipOf(p, a).color.saturation, 0.3);
  applyOp(p, "clip.setChroma", { clipId: a, chroma: { similarity: 0.7 } });
  assert.equal(clipOf(p, a).chroma.similarity, 0.7);
  assert.equal(clipOf(p, a).chroma.enabled, true);
  applyOp(p, "clip.setMask", { clipId: a, mask: { type: "ellipse" } });
  assert.equal(clipOf(p, a).mask.type, "ellipse");
  applyOp(p, "clip.setText", { clipId: t, content: "新しい字" });
  assert.equal(clipOf(p, t).text.content, "新しい字");
  assert.equal(clipOf(p, t).text.style.size, 64, "style が消えた");
  applyOp(p, "clip.setText", { clipId: t, patch: { style: { size: 90 } } });
  assert.equal(clipOf(p, t).text.style.size, 90);
  assert.equal(clipOf(p, t).text.content, "新しい字");
  const sh = addClip(p, ov, { kind: "shape", start: 4, duration: 2 });
  applyOp(p, "clip.setShape", { clipId: sh, type: "star", fill: "#ff0000" });
  assert.equal(clipOf(p, sh).shape.type, "star");
  assert.equal(clipOf(p, sh).shape.fill, "#ff0000");
  assertInvariants(p, "set*");
});

test("clip.update: 鍵の掛かったクリップは守られる（解錠だけ通る）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  applyOp(p, "clip.update", { clipId: a, patch: { locked: true } });
  assert.throws(() => applyOp(p, "clip.update", { clipId: a, patch: { opacity: 0.5 } }), OpError);
  assert.throws(() => applyOp(p, "clip.split", { clipId: a, t: 2 }), OpError);
  assert.throws(() => applyOp(p, "clip.remove", { clipId: a }), OpError);
  applyOp(p, "clip.update", { clipId: a, patch: { locked: false } });
  applyOp(p, "clip.update", { clipId: a, patch: { opacity: 0.5 } });
  assert.equal(clipOf(p, a).opacity, 0.5);
  assertInvariants(p, "locked");
});

/* ══ 効果・遷移 ═══════════════════════════════════════════════════ */

test("clip.addFx / updateFx / reorderFx / removeFx", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const f1 = applyOp(p, "clip.addFx", { clipId: a, type: "glitch", params: { amount: 0.5 } });
  const f2 = applyOp(p, "clip.addFx", { clipId: a, type: "blur", params: { radius: 4 } });
  assert.notEqual(f1.fxId, f2.fxId);
  assert.deepEqual(clipOf(p, a).fx.map((f) => f.type), ["glitch", "blur"]);
  applyOp(p, "clip.updateFx", { clipId: a, fxId: f1.fxId, params: { amount: 0.9 }, enabled: false });
  const fx1 = clipOf(p, a).fx[0];
  assert.equal(fx1.params.amount, 0.9);
  assert.equal(fx1.enabled, false);
  applyOp(p, "clip.reorderFx", { clipId: a, fxId: f1.fxId, index: 1 });
  assert.deepEqual(clipOf(p, a).fx.map((f) => f.type), ["blur", "glitch"]);
  // 効果に付いたキーは効果を消すと一緒に消える
  applyOp(p, "key.add", { clipId: a, path: `fx.${f1.fxId}.amount`, t: 0, v: 0.1 });
  assert.ok(clipOf(p, a).keys[`fx.${f1.fxId}.amount`]);
  const rm = applyOp(p, "clip.removeFx", { clipId: a, fxId: f1.fxId });
  assert.equal(rm.removed, 1);
  assert.deepEqual(rm.keys, [`fx.${f1.fxId}.amount`]);
  assert.equal(clipOf(p, a).keys[`fx.${f1.fxId}.amount`], undefined);
  assert.throws(() => applyOp(p, "clip.removeFx", { clipId: a, fxId: "fx_nope" }), OpError);
  assert.throws(() => applyOp(p, "clip.addFx", { clipId: a }), OpError);
  assertInvariants(p, "fx");
});

test("clip.setTransition: 隣と自分の半分までに自動で収まる", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const b = addClip(p, tr, { assetId: "as_v", start: 4, duration: 1 });
  const r = applyOp(p, "clip.setTransition", { clipId: a, edge: "out", type: "crossfade", duration: 3 });
  // 隣が 1 秒なので 0.5 秒まで
  assert.ok(near(r.duration, 0.5), JSON.stringify(r));
  assert.ok(near(clipOf(p, a).transitionOut.duration, 0.5));
  // 同じ境界の向かい側は消える（2 重掛けを避ける）
  applyOp(p, "clip.setTransition", { clipId: b, edge: "in", type: "glitch", duration: 0.4 });
  assert.equal(clipOf(p, a).transitionOut, null);
  assert.equal(clipOf(p, b).transitionIn.type, "glitch");
  const r2 = applyOp(p, "clip.removeTransition", { clipId: b });
  assert.equal(r2.removed, 1);
  assert.equal(clipOf(p, b).transitionIn, null);
  // duration 0 は「遷移なし」
  applyOp(p, "clip.setTransition", { clipId: a, edge: "in", duration: 0 });
  assert.equal(clipOf(p, a).transitionIn, null);
  assertInvariants(p, "transition");
});

/* ══ キーフレーム ═════════════════════════════════════════════════ */

test("key.add: t 昇順に入り、同じ t は置換される", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 2, v: 0.5 });
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 0, v: 0 });
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 3, v: 1, ease: "inout" });
  let list = clipOf(p, a).keys.opacity;
  assert.deepEqual(list.map((k) => round(k.t)), [0, 2, 3]);
  assert.equal(list[2].ease, "inout");
  const r = applyOp(p, "key.add", { clipId: a, path: "opacity", t: 2, v: 0.8 });
  list = clipOf(p, a).keys.opacity;
  assert.equal(list.length, 3, "同じ t で増えた");
  assert.equal(list[1].v, 0.8);
  assert.equal(r.index, 1);
  assertInvariants(p, "key.add");
});

test("key.add: t はフレームへ丸め、尺の外へは出ない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  const r = applyOp(p, "key.add", { clipId: a, path: "opacity", t: 1.007, v: 1 }, { fps: 30 });
  assert.ok(near(r.t, 1), `フレームに丸まっていない: ${r.t}`);
  const r2 = applyOp(p, "key.add", { clipId: a, path: "opacity", t: 99, v: 1 });
  assert.ok(r2.t <= 2 + EPS, `尺の外に出た: ${r2.t}`);
  assertInvariants(p, "key.add 丸め");
});

test("key.add: v を省くと今の値が入る（キーの補間値 → 静的値）", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4, opacity: 0.4 });
  const r1 = applyOp(p, "key.add", { clipId: a, path: "opacity", t: 0 });
  assert.ok(near(r1.v, 0.4), `静的値が拾えていない: ${r1.v}`);
  applyOp(p, "key.add", { clipId: a, path: "opacity", t: 4, v: 1 });
  const r2 = applyOp(p, "key.add", { clipId: a, path: "opacity", t: 2 });
  assert.ok(near(r2.v, 0.7), `補間値が拾えていない: ${r2.v}`);
  // 色も打てる（#hex）
  const r3 = applyOp(p, "key.add", { clipId: a, path: "color.exposure", t: 0 });
  assert.equal(r3.v, 0);
  assertInvariants(p, "key.add 値の推測");
});

test("key.add: 打てない path と壊れた v は OpError", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  assert.throws(() => applyOp(p, "key.add", { clipId: a, path: "duration", t: 0, v: 1 }), OpError);
  assert.throws(() => applyOp(p, "key.add", { clipId: a, path: "", t: 0, v: 1 }), OpError);
  assert.throws(() => applyOp(p, "key.add", { clipId: a, path: "fx.fx_nope.amount", t: 0, v: 1 }), OpError);
  assert.throws(() => applyOp(p, "key.add", { clipId: a, path: "opacity", t: 0, v: "あか" }), OpError);
  assert.throws(() => applyOp(p, "key.add", { clipId: a, path: "opacity", t: 0, v: NaN }), OpError);
  applyOp(p, "key.add", { clipId: a, path: "text.style.color", t: 0, v: "#ff0000" });
  assert.equal(clipOf(p, a).keys["text.style.color"][0].v, "#ff0000");
  assertInvariants(p, "key.add 検め");
});

test("key.remove / key.update / key.moveAll", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  applyOp(p, "key.add", { clipId: a, path: "transform.scale", t: 0, v: 1 });
  applyOp(p, "key.add", { clipId: a, path: "transform.scale", t: 1, v: 2 });
  applyOp(p, "key.add", { clipId: a, path: "transform.scale", t: 2, v: 3 });
  applyOp(p, "key.update", { clipId: a, path: "transform.scale", index: 1, v: 2.5, ease: "bezier" });
  let list = clipOf(p, a).keys["transform.scale"];
  assert.equal(list[1].v, 2.5);
  assert.equal(list[1].ease, "bezier");
  assert.equal(list[1].bez.length, 4);
  applyOp(p, "key.update", { clipId: a, path: "transform.scale", t: 2, to: 3.5 });
  list = clipOf(p, a).keys["transform.scale"];
  assert.deepEqual(list.map((k) => round(k.t)), [0, 1, 3.5]);
  const mv = applyOp(p, "key.moveAll", { clipId: a, delta: 0.5 });
  assert.equal(mv.moved, 3);
  list = clipOf(p, a).keys["transform.scale"];
  assert.deepEqual(list.map((k) => round(k.t)), [0.5, 1.5, 4]);
  const rm = applyOp(p, "key.remove", { clipId: a, path: "transform.scale", t: 1.5 });
  assert.equal(rm.removed, 1);
  assert.equal(clipOf(p, a).keys["transform.scale"].length, 2);
  applyOp(p, "key.remove", { clipId: a, path: "transform.scale", all: true });
  assert.equal(clipOf(p, a).keys["transform.scale"], undefined, "空の path が残った");
  assert.throws(() => applyOp(p, "key.remove", { clipId: a, path: "opacity", t: 0 }), OpError);
  assertInvariants(p, "key 編集");
});

/* ══ トラック ═════════════════════════════════════════════════════ */

test("track.add: kind ごとの既定名と MAX_TRACKS", () => {
  const p = mkProject();
  assert.equal(applyOp(p, "track.add", { kind: "video" }).name, "V1");
  assert.equal(applyOp(p, "track.add", { kind: "video" }).name, "V2");
  assert.equal(applyOp(p, "track.add", { kind: "audio" }).name, "A1");
  assert.equal(applyOp(p, "track.add", { kind: "overlay" }).name, "OL1");
  assert.equal(applyOp(p, "track.add", { kind: "adjust" }).name, "ADJ1");
  assert.equal(applyOp(p, "track.add", { kind: "video", name: "みだし" }).name, "みだし");
  while (p.tracks.length < MAX_TRACKS) applyOp(p, "track.add", { kind: "video" });
  assert.equal(p.tracks.length, MAX_TRACKS);
  assert.throws(() => applyOp(p, "track.add", { kind: "video" }), (e) => {
    assert.ok(e instanceof OpError);
    assert.equal(e.detail.max, MAX_TRACKS);
    return true;
  });
  assertInvariants(p, "track.add");
});

test("track.remove / update / reorder", () => {
  const p = mkProject();
  const v1 = addTrack(p, "video");
  const v2 = addTrack(p, "video");
  addClip(p, v1, { assetId: "as_v", start: 0, duration: 2 });
  addClip(p, v1, { assetId: "as_v", start: 2, duration: 2 });
  const r = applyOp(p, "track.update", { trackId: v2, patch: { name: "上", volume: 0.5, height: 120 } });
  assert.deepEqual(r.changed.sort(), ["height", "name", "volume"]);
  assert.equal(trackOf(p, v2).name, "上");
  assert.equal(trackOf(p, v2).volume, 0.5);
  assert.throws(() => applyOp(p, "track.update", { trackId: v2, patch: { clips: [] } }), OpError);
  const ro = applyOp(p, "track.reorder", { trackId: v2, index: 0 });
  assert.deepEqual(ro.order, [v2, v1]);
  const rr = applyOp(p, "track.remove", { trackId: v1 });
  assert.equal(rr.clips, 2);
  assert.equal(p.tracks.length, 1);
  assertInvariants(p, "track 編集");
});

/* ══ 素材 ═════════════════════════════════════════════════════════ */

test("asset.add / asset.remove: 使っているクリップも消えて数が返る", () => {
  const p = mkProject();
  const v1 = addTrack(p, "video");
  const v2 = addTrack(p, "video");
  const at = addTrack(p, "audio");
  addClip(p, v1, { assetId: "as_v", start: 0, duration: 2 });
  addClip(p, v1, { assetId: "as_v", start: 2, duration: 2 });
  addClip(p, v2, { assetId: "as_v", start: 0, duration: 2 });
  const keep = addClip(p, at, { assetId: "as_a", start: 0, duration: 2 });
  applyOp(p, "settings.update", { patch: { background: { type: "image", assetId: "as_v" } } });

  const r = applyOp(p, "asset.remove", { assetId: "as_v" });
  assert.equal(r.clips, 3, `連鎖して消えた数が違う: ${r.clips}`);
  assert.equal(assetById(p, "as_v"), null);
  assert.equal(trackOf(p, v1).clips.length, 0);
  assert.equal(trackOf(p, v2).clips.length, 0);
  assert.equal(clipOf(p, keep).id, keep, "関係ない素材のクリップが消えた");
  assert.equal(p.settings.background.assetId, null, "無い素材を背景に指したまま");
  assert.equal(p.settings.background.type, "color");
  assertInvariants(p, "asset.remove");
});

test("asset.remove: 相棒の linkedId も宙に浮かせない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const v = addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const d = applyOp(p, "clip.detachAudio", { clipId: v });
  applyOp(p, "asset.remove", { assetId: "as_v" });
  assert.equal(clipOf(p, v), null);
  assert.equal(clipOf(p, d.clipId), null, "同じ素材なので音も消えるはず");
  assertInvariants(p, "asset.remove 相棒");
});

test("asset.add / asset.update: id は重複させず、尺が縮んだら out も直る", () => {
  const p = mkProject();
  const r = applyOp(p, "asset.add", { asset: { id: "as_v", kind: "video", duration: 5 } });
  assert.notEqual(r.assetId, "as_v", "重複した id が入った");
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 10 });
  assert.ok(near(clipOf(p, a).out, 10));
  applyOp(p, "asset.update", { assetId: "as_v", patch: { duration: 6, name: "短くなった.mp4" } });
  assert.equal(assetById(p, "as_v").name, "短くなった.mp4");
  assert.ok(clipOf(p, a).out <= 6 + 1e-3, `out が素材尺を超えたまま: ${clipOf(p, a).out}`);
  assertInvariants(p, "asset.update");
});

test("asset.update: 解析結果を差し込める（analysis はそのまま持つ）", () => {
  const p = mkProject();
  const analysis = { version: 1, scenes: [{ start: 0, end: 2, score: 0.5 }], beats: { bpm: 120, times: [0, 0.5] } };
  applyOp(p, "asset.update", { assetId: "as_v", patch: { analysis } });
  assert.equal(assetById(p, "as_v").analysis.beats.bpm, 120);
  assert.deepEqual(assetById(p, "as_v").analysis.scenes, analysis.scenes);
  assertInvariants(p, "analysis");
});

/* ══ 印・設定・名前 ═══════════════════════════════════════════════ */

test("marker / chapter: t の昇順で持つ", () => {
  const p = mkProject();
  const m2 = applyOp(p, "marker.add", { t: 5, name: "後" });
  const m1 = applyOp(p, "marker.add", { t: 1, name: "前" });
  assert.deepEqual(p.markers.map((m) => m.t), [1, 5]);
  applyOp(p, "marker.update", { markerId: m1.markerId, patch: { t: 9, note: "動いた" } });
  assert.deepEqual(p.markers.map((m) => m.t), [5, 9]);
  assert.equal(applyOp(p, "marker.remove", { markerId: m2.markerId }).removed, 1);
  assert.equal(p.markers.length, 1);
  const c1 = applyOp(p, "chapter.add", { t: 3, title: "第 1 章" });
  applyOp(p, "chapter.add", { t: 1, title: "序" });
  assert.deepEqual(p.chapters.map((c) => c.title), ["序", "第 1 章"]);
  applyOp(p, "chapter.update", { chapterId: c1.chapterId, patch: { title: "改題" } });
  assert.equal(p.chapters[1].title, "改題");
  applyOp(p, "chapter.remove", { chapterId: c1.chapterId });
  assert.equal(p.chapters.length, 1);
  assertInvariants(p, "marker/chapter");
});

test("settings.update: ratio だけ渡したら寸法も付いてくる", () => {
  const p = mkProject();
  const r = applyOp(p, "settings.update", { patch: { ratio: "9:16" } });
  assert.deepEqual([r.width, r.height], [1080, 1920]);
  applyOp(p, "settings.update", { patch: { fps: 60, audio: { master: 0.8 } } });
  assert.equal(p.settings.fps, 60);
  assert.equal(p.settings.audio.master, 0.8);
  assert.equal(p.settings.audio.limiter, true, "audio の他の枝が消えた");
  applyOp(p, "settings.update", { patch: { width: 1001, height: 999 } });
  assert.equal(p.settings.width % 2, 0, "奇数の幅が残った");
  assert.equal(p.settings.height % 2, 0);
  applyOp(p, "settings.update", { patch: { fps: 1000 } });
  assert.equal(p.settings.fps, 240);
  assertInvariants(p, "settings");
});

test("project.rename", () => {
  const p = mkProject();
  assert.equal(applyOp(p, "project.rename", { name: "  旅の記録  " }).name, "旅の記録");
  assert.equal(p.name, "旅の記録");
  assert.throws(() => applyOp(p, "project.rename", { name: "" }), OpError);
});

/* ══ 字幕 ═════════════════════════════════════════════════════════ */

test("subtitle.import: SRT を text クリップ列にする", () => {
  const p = mkProject();
  const srt = [
    "1",
    "00:00:01,000 --> 00:00:03,000",
    "こんにちは",
    "世界",
    "",
    "2",
    "00:00:03,500 --> 00:00:05,000",
    "<i>二番目</i>",
    ""
  ].join("\n");
  const r = applyOp(p, "subtitle.import", { srt });
  assert.equal(r.count, 2);
  const tr = trackOf(p, r.trackId);
  assert.equal(tr.kind, "overlay");
  assert.equal(tr.name, "字幕");
  assert.equal(tr.clips[0].kind, "text");
  assert.equal(tr.clips[0].text.content, "こんにちは\n世界");
  assert.deepEqual([round(tr.clips[0].start), round(tr.clips[0].duration)], [1, 2]);
  assert.equal(tr.clips[1].text.content, "二番目", "タグが落ちていない");
  assert.deepEqual([round(tr.clips[1].start), round(tr.clips[1].duration)], [3.5, 1.5]);
  assertInvariants(p, "subtitle SRT");
});

test("subtitle.import: VTT（ヘッダ・NOTE・cue 設定を飛ばす）と重なりの解消", () => {
  const p = mkProject();
  const vtt = [
    "WEBVTT",
    "",
    "NOTE これは注記なので読まない",
    "",
    "cue-1",
    "00:00:00.500 --> 00:00:02.000 align:middle line:90%",
    "一つ目",
    "",
    "00:00:01.000 --> 00:00:04.000",
    "二つ目（重なっている）",
    ""
  ].join("\n");
  const r = applyOp(p, "subtitle.import", { vtt, style: { size: 48, color: "#ffee00" } });
  const tr = trackOf(p, r.trackId);
  assert.equal(r.count, 2);
  assert.equal(tr.clips[0].text.content, "一つ目");
  assert.equal(tr.clips[0].text.style.size, 48);
  assert.equal(tr.clips[0].text.style.color, "#ffee00");
  // 重なりは前を詰めて解く
  assert.ok(near(tr.clips[0].start, 0.5));
  assert.ok(near(clipEnd(tr.clips[0]), tr.clips[1].start), "重なったまま");
  assertInvariants(p, "subtitle VTT");
});

test("subtitle.import: トラック指定と offset", () => {
  const p = mkProject();
  const ov = addTrack(p, "overlay");
  const r = applyOp(p, "subtitle.import", {
    srt: "1\n00:00:00,000 --> 00:00:02,000\nあ\n",
    trackId: ov, offset: 1.5
  });
  assert.equal(r.trackId, ov);
  assert.ok(near(trackOf(p, ov).clips[0].start, 1.5));
  assertInvariants(p, "subtitle offset");
});

/* ══ タイムライン（貼り付け）══════════════════════════════════════ */

test("timeline.paste: 相対位置を保って貼る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const clips = [
    { assetId: "as_v", start: 10, duration: 2, in: 0 },
    { assetId: "as_v", start: 13, duration: 1, in: 5 }
  ];
  const r = applyOp(p, "timeline.paste", { clips, at: 4, trackId: tr });
  assert.equal(r.ids.length, 2);
  assert.deepEqual(layout(p, tr), [[4, 2], [7, 1]]);
  assert.ok(near(clipOf(p, r.ids[1]).in, 5), "素材の窓が保たれていない");
  assertInvariants(p, "paste");
});

test("timeline.insert: 先に場所を空けるので相対位置が崩れない", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 4 });
  const clips = [
    { assetId: "as_v", start: 0, duration: 1 },
    { assetId: "as_v", start: 2, duration: 1 }
  ];
  applyOp(p, "timeline.insert", { clips, at: 2, trackId: tr });
  // 元の [0,4] は 2 で割れ、右半分は span(=3) だけ後ろへ
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 1], [4, 1], [5, 2]]);
  assertInvariants(p, "insert");
});

test("timeline.overwrite: 重なった既存を削る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  addClip(p, tr, { assetId: "as_v", start: 0, duration: 6 });
  applyOp(p, "timeline.overwrite", { clips: [{ assetId: "as_v", start: 0, duration: 2 }], at: 2, trackId: tr });
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2], [4, 2]]);
  assertInvariants(p, "overwrite");
});

test("timeline.insert: allTracks は全トラックを押し下げる", () => {
  const p = mkProject();
  const v = addTrack(p, "video");
  const a = addTrack(p, "audio");
  addClip(p, v, { assetId: "as_v", start: 4, duration: 2 });
  addClip(p, a, { assetId: "as_a", start: 4, duration: 2 });
  applyOp(p, "timeline.insert", { clips: [{ assetId: "as_v", start: 0, duration: 1 }], at: 0, trackId: v, allTracks: true });
  assert.deepEqual(layout(p, v), [[0, 1], [5, 2]]);
  assert.deepEqual(layout(p, a), [[5, 2]]);
  assertInvariants(p, "insert allTracks");
});

/* ══ 複合クリップ ═════════════════════════════════════════════════ */

test("compound.make → enter → flatten で元に戻る", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", in: 0, start: 0, duration: 2 });
  const b = addClip(p, tr, { assetId: "as_v", in: 8, start: 2, duration: 2 });
  addClip(p, tr, { assetId: "as_v", start: 6, duration: 2 });

  const mk = applyOp(p, "compound.make", { clipIds: [a, b] });
  const cc = clipOf(p, mk.clipId);
  assert.equal(cc.kind, "compound");
  assert.deepEqual([round(cc.start), round(cc.duration), round(cc.in), round(cc.out)], [0, 4, 0, 4]);
  assert.equal(cc.compound.tracks.length, 1);
  assert.equal(cc.compound.tracks[0].clips.length, 2);
  assert.equal(clipOf(p, a), null, "元のクリップが残っている");
  assert.deepEqual(layout(p, tr), [[0, 4], [6, 2]]);
  assertInvariants(p, "compound.make");

  const en = applyOp(p, "compound.enter", { clipId: mk.clipId });
  assert.equal(en.tracks, 1);
  assert.equal(en.clips, 2);

  const fl = applyOp(p, "compound.flatten", { clipId: mk.clipId });
  assert.equal(fl.clips, 2);
  assert.equal(clipOf(p, mk.clipId), null);
  assert.deepEqual(layout(p, tr), [[0, 2], [2, 2], [6, 2]]);
  const back = trackOf(p, tr).clips;
  assert.ok(near(back[0].in, 0), `in が戻っていない: ${back[0].in}`);
  assert.ok(near(back[1].in, 8), `in が戻っていない: ${back[1].in}`);
  assertInvariants(p, "compound.flatten");
});

test("compound.make: 複数トラックを畳み、flatten で空きトラックへ戻す", () => {
  const p = mkProject();
  const v1 = addTrack(p, "video");
  const v2 = addTrack(p, "video");
  const a = addClip(p, v1, { assetId: "as_v", start: 0, duration: 4 });
  const b = addClip(p, v2, { assetId: "as_v", start: 1, duration: 2 });
  const mk = applyOp(p, "compound.make", { clipIds: [a, b] });
  const cc = clipOf(p, mk.clipId);
  assert.equal(cc.compound.tracks.length, 2);
  assert.equal(cc.compound.tracks[1].clips[0].start, 1, "内側の相対位置がずれた");
  assert.equal(findClip(p, mk.clipId).track.id, v1);
  const fl = applyOp(p, "compound.flatten", { clipId: mk.clipId });
  assert.equal(fl.clips, 2);
  assert.deepEqual(layout(p, v1), [[0, 4]]);
  assert.deepEqual(layout(p, v2), [[1, 2]]);
  assertInvariants(p, "compound 複数トラック");
});

test("compound: 3 段の入れ子と、複合でない clip の flatten は OpError", () => {
  const p = mkProject();
  const tr = addTrack(p, "video");
  const a = addClip(p, tr, { assetId: "as_v", start: 0, duration: 2 });
  const b = addClip(p, tr, { assetId: "as_v", start: 2, duration: 2 });
  const mk1 = applyOp(p, "compound.make", { clipIds: [a, b] });
  const c = addClip(p, tr, { assetId: "as_v", start: 4, duration: 2 });
  const mk2 = applyOp(p, "compound.make", { clipIds: [mk1.clipId, c] });   // 2 段目までは通る
  const d = addClip(p, tr, { assetId: "as_v", start: 8, duration: 2 });
  assert.throws(() => applyOp(p, "compound.make", { clipIds: [mk2.clipId, d] }), OpError);
  assert.throws(() => applyOp(p, "compound.flatten", { clipId: d }), OpError);
  assertInvariants(p, "compound 深さ");
});

/* ══ 通し（不変条件が壊れないこと）════════════════════════════════ */

test("通し: たくさん編集しても不変条件と normalize が食い違わない", () => {
  const p = mkProject();
  const v = addTrack(p, "video");
  const av = addTrack(p, "audio");
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(addClip(p, v, { assetId: "as_v", in: i, start: i * 2, duration: 2 }));
  addClip(p, av, { assetId: "as_a", start: 0, duration: 12 });

  applyOp(p, "clip.split", { clipId: ids[1], t: 3 });
  applyOp(p, "clip.trim", { clipId: ids[2], edge: "end", delta: 0.5, ripple: true });
  applyOp(p, "clip.setSpeed", { clipId: ids[3], speed: 0.5 });
  applyOp(p, "clip.reverse", { clipId: ids[4] });
  applyOp(p, "clip.setTransition", { clipId: ids[4], edge: "in", duration: 1 });
  applyOp(p, "clip.slip", { clipId: ids[5], delta: 0.3 });
  applyOp(p, "clip.detachAudio", { clipId: ids[0] });
  applyOp(p, "key.add", { clipId: ids[0], path: "transform.scale", t: 0, v: 1 });
  applyOp(p, "key.add", { clipId: ids[0], path: "transform.scale", t: 1.5, v: 1.4 });
  applyOp(p, "clip.freeze", { clipId: ids[5], t: clipOf(p, ids[5]).start + 1, duration: 1 });
  applyOp(p, "clip.duplicate", { clipId: ids[2] });
  applyOp(p, "timeline.magneticClose", { trackId: v });
  applyOp(p, "clip.add", { trackId: v, clip: { assetId: "as_v", duration: 3 }, at: 1, mode: "insert" });
  applyOp(p, "subtitle.import", { srt: "1\n00:00:00,000 --> 00:00:02,000\n字\n\n2\n00:00:02,000 --> 00:00:04,000\n幕\n" });
  assertInvariants(p, "通し");

  // normalize を通しても位置と素材範囲が動かない（= ops の整合処理が契約と同じ）
  const before = JSON.stringify(p.tracks.map((t) => t.clips.map((c) => [round(c.start), round(c.duration), round(c.in), round(c.out)])));
  const n = normalizeProject(p);
  const after = JSON.stringify(n.tracks.map((t) => t.clips.map((c) => [round(c.start), round(c.duration), round(c.in), round(c.out)])));
  assert.equal(after, before, "normalize で編集結果が動いた");
});

test("通し: op は project を壊さず、返り値は id を含む（§12-3）", () => {
  const p = mkProject();
  const tr = applyOp(p, "track.add", { kind: "video" });
  assert.equal(typeof tr.trackId, "string");
  assert.equal(tr.trackId, tr.id);
  const cl = applyOp(p, "clip.add", { trackId: tr.trackId, clip: { assetId: "as_v", duration: 4 }, at: 0 });
  assert.equal(typeof cl.clipId, "string");
  assert.equal(cl.clipId, cl.id);
  const as = applyOp(p, "asset.add", { asset: { kind: "image", name: "x.png" } });
  assert.equal(typeof as.assetId, "string");
  assert.equal(as.assetId, as.id);
  const sp = applyOp(p, "clip.split", { clipId: cl.clipId, t: 2 });
  assert.equal(sp.ids.length, 2);
  assert.ok(sp.ids.every((x) => typeof x === "string"));
  // updatedAt は op ごとに進む
  const t0 = p.updatedAt;
  applyOp(p, "project.rename", { name: "後" }, { now: t0 + 1000 });
  assert.equal(p.updatedAt, t0 + 1000);
});
