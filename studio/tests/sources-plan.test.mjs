/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/sources-plan.test.mjs — 素材プール（engine/sources.js）の
   純関数の試験

   ★ 何を固定するか（ここが崩れると「絵が来ない / iOS で落ちる」に直結する）
     ① planAssignment … <video> の割当
        容量不足で溢れた分は static（静止フレーム）へ / 先読みより「今」が強い /
        同じ優先度なら近い方が強い / 同素材の同位置は 1 本を共有 /
        持っている物の使い回し（同 clip → 同素材）/ 空きが無い時は LRU で追い出す /
        本数を減らした直後の溢れ（slot >= capacity）は無条件で返す
     ② shouldSeek … 同じ位置への seek は省略（既定は半フレーム）
     ③ shouldResync … 0.08s 超のずれ + 0.5s のクールダウン
     ④ planResize … 巨大画像の縮小率（拡大はしない・縦横比を保つ）
     ⑤ sourceFrameIndex / seekTargetFor … 量子化は **素材の fps**、
        書き込む値はフレームの中央（契約書 §13.3）
     ⑥ collectNeeds … 今の clip と 1.5 秒以内に出る clip を並べる
        （audio トラック・hidden は見ない / 先読みの素材時刻は in 点）
     ⑦ capacityFor / assetFpsOf … 本数（iOS 2 / それ以外 4）と fps の当て方
     ⑧ createSourcePool … DOM の無い所でも **契約どおりの口が全部在り、
        呼んでも落ちない**（絵は出ないが例外も投げない = 書き出しが止まらない）

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026/studio && npm test
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/sources-plan.test.mjs
     （DOM を要る所（<video> / ImageBitmap）は Node で動かせないので
      selftest.html の担当。ここは判断だけを見る）
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createSourcePool,
  planAssignment, collectNeeds, shouldSeek, shouldResync, planResize,
  sourceFrameIndex, seekTargetFor, capacityFor, assetFpsOf,
  POOL_DESKTOP, POOL_IOS, PLAY_DRIFT, RESYNC_COOLDOWN, SHARE_TOL,
  MAX_IMAGE_SIZE, LOOKAHEAD, PRIO_NOW, PRIO_SOON, EMPTY_SOURCE
} from "../src/engine/sources.js";

/* ── 試験用の小道具 ─────────────────────────────────────────────── */

/** need を 1 つ作る（欠けている所は planAssignment の既定に任せる） */
const need = (clipId, assetId, at, prio, sourceTime) => {
  const n = { clipId, assetId, at, prio };
  if (sourceTime !== undefined) n.sourceTime = sourceTime;
  return n;
};
/** 今 持っている <video> 1 本 */
const held = (slot, clipId, assetId, lastUsed, sourceTime) =>
  ({ slot, clipId, assetId, lastUsed, sourceTime: sourceTime === undefined ? 0 : sourceTime });
/** assign を clipId → slot の表にする */
const slotOf = (plan) => {
  const m = {};
  for (const a of plan.assign) m[a.clipId] = a.slot;
  return m;
};

/* ══ ① planAssignment ═══════════════════════════════════════════ */

test("planAssignment: 容量に収まるなら全部に <video> が行く", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW), need("c2", "B", 0, PRIO_NOW)],
    capacity: 4, current: [], time: 0
  });
  assert.equal(plan.capacity, 4);
  assert.deepEqual(plan.still, []);
  assert.equal(plan.assign.length, 2);
  assert.equal(plan.slots.length, 2);
  /* 空き枠は小さい番号から使う（試験と実装で並びを揃えるため） */
  assert.deepEqual(plan.slots.map((s) => s.slot), [0, 1]);
  assert.deepEqual(slotOf(plan), { c1: 0, c2: 1 });
  assert.equal(plan.evict.length, 0);
  assert.equal(plan.idle.length, 0);
});

test("planAssignment: 容量不足 — 溢れた clip は still（静止フレーム代替）", () => {
  const plan = planAssignment({
    needs: [
      need("c1", "A", 0, PRIO_NOW), need("c2", "B", 0, PRIO_NOW), need("c3", "C", 0, PRIO_NOW)
    ],
    capacity: 2, current: [], time: 0
  });
  assert.equal(plan.slots.length, 2, "2 本しか持たない");
  assert.equal(plan.still.length, 1, "1 つは静止フレームで代替する");
  /* 同じ優先度・同じ距離なら assetId → clipId の順で決まる（揺れない） */
  assert.deepEqual(plan.still, ["c3"]);
  assert.deepEqual(slotOf(plan), { c1: 0, c2: 1 });
});

test("planAssignment: capacity 0 なら全部 still（<video> を 1 本も持たない）", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW), need("c2", "B", 0, PRIO_NOW)],
    capacity: 0, current: [], time: 0
  });
  assert.deepEqual(plan.slots, []);
  assert.deepEqual(plan.assign, []);
  assert.deepEqual(plan.still, ["c1", "c2"]);
});

test("planAssignment: 先読みより「今 見えている物」が強い", () => {
  const plan = planAssignment({
    needs: [need("ahead", "F", 1.2, PRIO_SOON), need("now", "N", 0, PRIO_NOW)],
    capacity: 1, current: [], time: 0
  });
  assert.deepEqual(slotOf(plan), { now: 0 });
  assert.deepEqual(plan.still, ["ahead"]);
});

test("planAssignment: 同じ優先度なら **先に要る**（距離が近い）方を採る", () => {
  const plan = planAssignment({
    needs: [need("far", "X", 0.9, PRIO_SOON), need("near", "Y", 0.3, PRIO_SOON)],
    capacity: 1, current: [], time: 0
  });
  assert.deepEqual(slotOf(plan), { near: 0 });
  assert.deepEqual(plan.still, ["far"]);
  assert.equal(plan.assign[0].dist, 0.3, "距離は at - time で測る");
});

test("planAssignment: at は time との差で見る（time が進んでも判断は同じ）", () => {
  const plan = planAssignment({
    needs: [need("a", "A", 10.4, PRIO_SOON), need("b", "B", 10.1, PRIO_SOON)],
    capacity: 1, current: [], time: 10
  });
  assert.deepEqual(slotOf(plan), { b: 0 });
  assert.equal(plan.assign[0].dist, 10.1 - 10);
});

test("planAssignment: 同素材の同位置は 1 本を共有する", () => {
  const plan = planAssignment({
    needs: [need("p", "A", 0, PRIO_NOW, 3), need("q", "A", 0, PRIO_NOW, 3 + SHARE_TOL / 2)],
    capacity: 1, current: [], time: 0
  });
  assert.equal(plan.slots.length, 1, "<video> は 1 本で足りる");
  assert.deepEqual(plan.still, [], "共有できるので誰も溢れない");
  assert.deepEqual(slotOf(plan), { p: 0, q: 0 });
  assert.equal(plan.assign[0].shared, true);
  assert.deepEqual(plan.shared, [{ assetId: "A", slot: 0, clipIds: ["p", "q"] }]);
  assert.deepEqual(plan.slots[0].clipIds, ["p", "q"]);
});

test("planAssignment: 同素材でも位置が離れていれば共有できない", () => {
  const plan = planAssignment({
    needs: [need("p", "A", 0, PRIO_NOW, 3), need("q", "A", 0, PRIO_NOW, 3.5)],
    capacity: 1, current: [], time: 0
  });
  assert.equal(plan.slots.length, 1);
  assert.deepEqual(plan.still, ["q"], "1 本しか無いので後ろは静止フレーム");
  assert.deepEqual(slotOf(plan), { p: 0 });
  assert.deepEqual(plan.shared, []);
});

test("planAssignment: shareTol 0 なら 完全に同じ位置だけ共有する", () => {
  const same = planAssignment({
    needs: [need("p", "A", 0, 2, 3), need("q", "A", 0, 2, 3)],
    capacity: 2, current: [], time: 0, shareTol: 0
  });
  assert.equal(same.slots.length, 1);
  const off = planAssignment({
    needs: [need("p", "A", 0, 2, 3), need("q", "A", 0, 2, 3.001)],
    capacity: 2, current: [], time: 0, shareTol: 0
  });
  assert.equal(off.slots.length, 2, "位置が違えば 2 本要る");
});

test("planAssignment: 持っている <video> は 同じ clip → 同じ素材 の順で使い回す", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW, 1), need("c2", "B", 0, PRIO_NOW, 1)],
    capacity: 2, time: 0,
    current: [held(0, "cOld", "B", 5, 1), held(1, "c1", "A", 3, 1)]
  });
  assert.deepEqual(slotOf(plan), { c1: 1, c2: 0 }, "c1 は自分の枠に居座り、c2 は同素材 B を貰う");
  assert.equal(plan.evict.length, 0, "使い回せたので誰も追い出さない");
  for (const s of plan.slots) assert.equal(s.reused, true);
});

test("planAssignment: 同素材が 2 本在るなら 位置の近い方を使い回す", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW, 10)],
    capacity: 2, time: 0,
    current: [held(0, "x", "A", 9, 0.5), held(1, "y", "A", 1, 9.9)]
  });
  assert.deepEqual(slotOf(plan), { c1: 1 }, "10 秒に近い方（9.9）を使う");
  assert.equal(plan.idle.length, 1);
  assert.equal(plan.idle[0].slot, 0, "余った方は idle（releaseUnused が始末する）");
});

test("planAssignment: 空き枠が無ければ LRU（いちばん古い物）を追い出す", () => {
  const plan = planAssignment({
    needs: [need("c3", "C", 0, PRIO_NOW)],
    capacity: 2, time: 0,
    current: [held(0, "c1", "A", 1, 0), held(1, "c2", "B", 9, 0)]
  });
  assert.equal(plan.evict.length, 1);
  assert.deepEqual(plan.evict[0], { slot: 0, clipId: "c1", assetId: "A", why: "lru" });
  assert.deepEqual(slotOf(plan), { c3: 0 }, "空いた枠をそのまま使う");
  assert.deepEqual(plan.idle, [{ slot: 1, clipId: "c2", assetId: "B" }]);
});

test("planAssignment: lastUsed が並んだら小さい番号から追い出す（揺れない）", () => {
  const plan = planAssignment({
    needs: [need("c3", "C", 0, PRIO_NOW)],
    capacity: 2, time: 0,
    current: [held(1, "c2", "B", 7, 0), held(0, "c1", "A", 7, 0)]
  });
  assert.equal(plan.evict[0].slot, 0);
});

test("planAssignment: 要る物が在るのに空きも追い出せる物も無ければ still", () => {
  const plan = planAssignment({
    needs: [need("now1", "A", 0, PRIO_NOW), need("now2", "B", 0, PRIO_NOW), need("soon", "C", 1, PRIO_SOON)],
    capacity: 2, time: 0,
    current: [held(0, "now1", "A", 1, 0), held(1, "now2", "B", 2, 0)]
  });
  assert.deepEqual(plan.still, ["soon"]);
  assert.equal(plan.evict.length, 0, "今 使っている物を先読みのために壊さない");
});

test("planAssignment: 本数を減らした直後の溢れ（slot >= capacity）は無条件で返す", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW)],
    capacity: 2, time: 0,
    current: [held(0, "c1", "A", 5, 0), held(2, "c9", "Z", 9, 0), held(3, "c8", "Y", 9, 0)]
  });
  const over = plan.evict.filter((e) => e.why === "over").map((e) => e.slot).sort();
  assert.deepEqual(over, [2, 3], "iOS で 4 本 → 2 本に絞った時にここが効く");
  assert.deepEqual(slotOf(plan), { c1: 0 });
});

test("planAssignment: slot 番号が無い / 衝突する current も番号を振り直す", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 0, PRIO_NOW), need("c2", "B", 0, PRIO_NOW)],
    capacity: 2, time: 0,
    current: [{ clipId: "c1", assetId: "A" }, { clipId: "c2", assetId: "B" }]
  });
  assert.deepEqual(slotOf(plan), { c1: 0, c2: 1 });
  assert.equal(plan.evict.length, 0);
});

test("planAssignment: 同じ clipId が 2 回来たら強い方を残す（重複で枠を食わない）", () => {
  const plan = planAssignment({
    needs: [need("c1", "A", 1.4, PRIO_SOON), need("c1", "A", 0, PRIO_NOW)],
    capacity: 2, current: [], time: 0
  });
  assert.equal(plan.assign.length, 1);
  assert.equal(plan.assign[0].prio, PRIO_NOW);
  assert.equal(plan.assign[0].dist, 0);
});

test("planAssignment: image の need は <video> を食わない / 壊れた形は黙って捨てる", () => {
  const plan = planAssignment({
    needs: [
      { clipId: "img", assetId: "P", kind: "image", at: 0, prio: PRIO_NOW },
      { clipId: "vid", assetId: "V", kind: "video", at: 0, prio: PRIO_NOW },
      { clipId: "", assetId: "V", at: 0, prio: 2 },
      { assetId: "", clipId: "x", at: 0, prio: 2 },
      null
    ],
    capacity: 2, current: [], time: 0
  });
  assert.deepEqual(slotOf(plan), { vid: 0 });
  assert.deepEqual(plan.still, []);
});

test("planAssignment: 引数無しでも落ちない（既定は POOL_DESKTOP）", () => {
  const plan = planAssignment();
  assert.equal(plan.capacity, POOL_DESKTOP);
  assert.deepEqual(plan.assign, []);
  assert.deepEqual(plan.still, []);
});

/* ══ ② shouldSeek ══════════════════════════════════════════════ */

test("shouldSeek: 同じ位置なら省略する（同じフレームの中も省略）", () => {
  assert.equal(shouldSeek(1.5, 1.5, { fps: 30 }), false);
  assert.equal(shouldSeek(1.5, 1.5 + 0.4 / 30, { fps: 30 }), false, "半フレーム未満は同じ絵");
  assert.equal(shouldSeek(1.5, 1.5 + 0.6 / 30, { fps: 30 }), true);
});

test("shouldSeek: しきい値は素材の fps で変わる（60fps は厳しくなる）", () => {
  const d = 0.6 / 30;                                  // 30fps では seek が要る差
  assert.equal(shouldSeek(0, d, { fps: 30 }), true);
  assert.equal(shouldSeek(0, d, { fps: 60 }), true);
  assert.equal(shouldSeek(0, 0.4 / 60, { fps: 60 }), false);
  assert.equal(shouldSeek(0, 0.4 / 60, { fps: 30 }), false);
});

test("shouldSeek: eps を渡せば上書きできる / fps 無しは 1ms", () => {
  assert.equal(shouldSeek(0, 0.5, { eps: 1 }), false);
  assert.equal(shouldSeek(0, 0.002), true);
  assert.equal(shouldSeek(0, 0.0005), false);
});

test("shouldSeek: まだ読めていない（NaN/undefined）なら打つしかない", () => {
  assert.equal(shouldSeek(NaN, 1, { fps: 30 }), true);
  assert.equal(shouldSeek(undefined, 1, { fps: 30 }), true);
  assert.equal(shouldSeek(null, 0, { fps: 30 }), true, "null は 0 ではなく「不明」として扱う");
});

/* ══ ③ shouldResync（mode:"play" の打ち直し）════════════════════ */

test("shouldResync: ずれが 0.08s 以内なら打ち直さない", () => {
  assert.equal(shouldResync({ current: 1, target: 1 + PLAY_DRIFT - 0.001, now: 100, lastAt: 0 }), false);
  assert.equal(shouldResync({ current: 1, target: 1 + PLAY_DRIFT + 0.001, now: 100, lastAt: 0 }), true);
  assert.equal(shouldResync({ current: 1 + 0.2, target: 1, now: 100, lastAt: 0 }), true, "遅れも進みも同じ");
});

test("shouldResync: 打ちすぎ防止に 0.5 秒のクールダウンが効く", () => {
  const far = { current: 0, target: 5 };
  assert.equal(shouldResync({ ...far, now: 10, lastAt: 10 - RESYNC_COOLDOWN + 0.01 }), false);
  assert.equal(shouldResync({ ...far, now: 10, lastAt: 10 - RESYNC_COOLDOWN }), true, "ちょうど経ったら打つ");
  assert.equal(shouldResync({ ...far, now: 10 }), true, "一度も打っていなければ すぐ打つ");
  assert.equal(shouldResync({ ...far, now: 10, lastAt: 9, cooldown: 2 }), false, "cooldown は上書きできる");
});

test("shouldResync: 読めていない video は打ち直さない（打つ先が無い）", () => {
  assert.equal(shouldResync({ current: NaN, target: 3, now: 10, lastAt: 0 }), false);
  assert.equal(shouldResync({}), false);
});

test("shouldResync: drift も上書きできる（書き出し前の追い込みで使う）", () => {
  assert.equal(shouldResync({ current: 0, target: 0.05, now: 1, lastAt: -10, drift: 0.01 }), true);
  assert.equal(shouldResync({ current: 0, target: 0.05, now: 1, lastAt: -10, drift: 0.2 }), false);
});

/* ══ ④ planResize（巨大画像の縮小率）═══════════════════════════ */

test("planResize: 4096 を超える長辺だけ縮める（縦横比はそのまま）", () => {
  const r = planResize(8000, 4000, MAX_IMAGE_SIZE);
  assert.equal(r.resized, true);
  assert.equal(r.width, 4096);
  assert.equal(r.height, 2048);
  assert.equal(r.scale, 4096 / 8000);
});

test("planResize: 縦長も長辺で判断する", () => {
  const r = planResize(3000, 9000);
  assert.equal(r.height, MAX_IMAGE_SIZE);
  assert.equal(r.width, Math.round(3000 * (MAX_IMAGE_SIZE / 9000)));
  assert.ok(r.scale < 1);
});

test("planResize: 小さい絵は拡大しない（scale 1・resized false）", () => {
  assert.deepEqual(planResize(1920, 1080), { width: 1920, height: 1080, scale: 1, resized: false });
  assert.deepEqual(planResize(4096, 4096), { width: 4096, height: 4096, scale: 1, resized: false });
});

test("planResize: max を渡せば静止フレーム用の小さい寸法も出せる", () => {
  const r = planResize(1920, 1080, 1280);
  assert.equal(r.width, 1280);
  assert.equal(r.height, 720);
});

test("planResize: 極端に細長くても 1px 未満にしない / 寸法不明は 0 を返す", () => {
  const r = planResize(20000, 3, 4096);
  assert.equal(r.width, 4096);
  assert.equal(r.height, 1, "0 にすると canvas を作れない");
  assert.deepEqual(planResize(0, 0), { width: 0, height: 0, scale: 1, resized: false });
  assert.deepEqual(planResize(NaN, 100), { width: 0, height: 0, scale: 1, resized: false });
});

/* ══ ⑤ 量子化（素材 fps）と seek の行き先 ═══════════════════════ */

test("sourceFrameIndex: 素材の fps で丸める（浮動小数の端数に負けない）", () => {
  assert.equal(sourceFrameIndex(0, 30), 0);
  assert.equal(sourceFrameIndex(1 / 30, 30), 1, "1/30*30 = 0.9999… に引っ掛からない");
  assert.equal(sourceFrameIndex(2 / 30 - 1e-9, 30), 2);
  assert.equal(sourceFrameIndex(1, 29.97), 29);
  assert.equal(sourceFrameIndex(-5, 30), 0, "負の時刻は 0 に張り付く");
});

test("seekExact が書く値はフレームの **中央**（契約書 §13.3）", () => {
  assert.equal(seekTargetFor(0, 30), 0.5 / 30);
  assert.equal(seekTargetFor(1 / 30, 30), 1.5 / 30);
  /* 同じフレームの中のどこを指しても行き先は同じ = 無駄な seek が消える */
  assert.equal(seekTargetFor(1 / 30 + 0.9 / 30, 30), 1.5 / 30);
  assert.equal(shouldSeek(seekTargetFor(1 / 30, 30), seekTargetFor(1 / 30 + 0.9 / 30, 30), { fps: 30 }), false);
});

test("seekTargetFor: 素材 fps が 60 ならプロジェクト 30 とは別の位置へ行く", () => {
  assert.notEqual(seekTargetFor(0.5, 60), seekTargetFor(0.5, 30));
  assert.equal(seekTargetFor(0.5, 60), 30.5 / 60);
  assert.equal(seekTargetFor(0.5, 0), 15.5 / 30, "fps 不明は 30 で丸める（落ちない）");
});

test("assetFpsOf: 素材の fps を最優先・無ければプロジェクト fps・最後は 30", () => {
  assert.equal(assetFpsOf({ fps: 29.97 }, 30), 29.97);
  assert.equal(assetFpsOf({ fps: 0 }, 24), 24);
  assert.equal(assetFpsOf(null, 60), 60);
  assert.equal(assetFpsOf(null, 0), 30);
  assert.equal(assetFpsOf({ fps: 100000 }, 25), 25, "壊れた値は信じない");
});

test("capacityFor: iOS は 2 本・それ以外は 4 本・max で上書きできる", () => {
  assert.equal(capacityFor({ ios: true }), POOL_IOS);
  assert.equal(capacityFor({ ios: false }), POOL_DESKTOP);
  assert.equal(capacityFor({ ios: true, max: 1 }), 1);
  assert.equal(capacityFor({ max: 0 }), 0);
  assert.equal(capacityFor(), POOL_DESKTOP, "Node（UA 無し）では iOS ではない");
});

/* ══ ⑥ collectNeeds（先読みの材料）══════════════════════════════ */

/** 試験用の project（video / image / 音のトラック） */
function proj() {
  return {
    settings: { fps: 30, width: 1920, height: 1080 },
    assets: [
      { id: "av", kind: "video", duration: 20, width: 1920, height: 1080, fps: 30 },
      { id: "ai", kind: "image", duration: 0, width: 400, height: 300 }
    ],
    tracks: [
      {
        id: "t1", kind: "video", clips: [
          { id: "cl1", kind: "video", assetId: "av", start: 0, duration: 4, in: 2, out: 6, speed: 1 },
          { id: "cl2", kind: "video", assetId: "av", start: 5, duration: 3, in: 10, out: 13, speed: 1 },
          { id: "cl3", kind: "image", assetId: "ai", start: 20, duration: 2 }
        ]
      },
      {
        id: "t2", kind: "audio", clips: [
          { id: "ca1", kind: "video", assetId: "av", start: 0, duration: 4, in: 0, out: 4 }
        ]
      }
    ]
  };
}

test("collectNeeds: 今 見えている clip は prio 2・素材時刻は in + 経過", () => {
  const needs = collectNeeds(proj(), 1);
  assert.equal(needs.length, 1);
  assert.equal(needs[0].clipId, "cl1");
  assert.equal(needs[0].prio, PRIO_NOW);
  assert.equal(needs[0].at, 1);
  assert.equal(needs[0].dist, 0);
  assert.ok(Math.abs(needs[0].sourceTime - 3) < 1e-9, "in:2 + 1 秒 = 3");
  assert.equal(needs[0].kind, "video");
});

test("collectNeeds: 1.5 秒以内に出る clip は prio 1・素材時刻は in 点", () => {
  const needs = collectNeeds(proj(), 3.8);
  const ids = needs.map((n) => n.clipId);
  assert.deepEqual(ids, ["cl1", "cl2"], "今の物が先、先読みは後ろ");
  const soon = needs[1];
  assert.equal(soon.prio, PRIO_SOON);
  assert.equal(soon.at, 5);
  assert.ok(Math.abs(soon.dist - 1.2) < 1e-9);
  assert.equal(soon.sourceTime, 10, "in 点に置いておく");
});

test("collectNeeds: 先読みの窓の外は拾わない（lookahead は変えられる）", () => {
  assert.deepEqual(collectNeeds(proj(), 3.4).map((n) => n.clipId), ["cl1"], "1.6 秒先はまだ");
  assert.deepEqual(collectNeeds(proj(), 3.4, { lookahead: 2 }).map((n) => n.clipId), ["cl1", "cl2"]);
  assert.deepEqual(collectNeeds(proj(), 3.4, { lookahead: 0 }).map((n) => n.clipId), ["cl1"]);
  assert.equal(LOOKAHEAD, 1.5);
});

test("collectNeeds: clip の終わりは含まない（境目で 2 つ出さない）", () => {
  const at4 = collectNeeds(proj(), 4);
  assert.deepEqual(at4.map((n) => n.clipId), ["cl2"], "4.0 は cl1 の外・cl2 の先読み");
  assert.equal(at4[0].prio, PRIO_SOON);
  const at5 = collectNeeds(proj(), 5);
  assert.deepEqual(at5.map((n) => n.clipId), ["cl2"]);
  assert.equal(at5[0].prio, PRIO_NOW);
});

test("collectNeeds: audio トラックの映像 clip は要らない（音は engine/audio の担当）", () => {
  for (const n of collectNeeds(proj(), 1)) assert.notEqual(n.clipId, "ca1");
});

test("collectNeeds: hidden なトラック / clip は見ない", () => {
  const p = proj();
  p.tracks[0].hidden = true;
  assert.deepEqual(collectNeeds(p, 1), []);
  const p2 = proj();
  p2.tracks[0].clips[0].hidden = true;
  assert.deepEqual(collectNeeds(p2, 1).map((n) => n.clipId), []);
});

test("collectNeeds: image も拾う（先にデコードするため）が kind で区別できる", () => {
  const needs = collectNeeds(proj(), 20.5);
  assert.equal(needs.length, 1);
  assert.equal(needs[0].kind, "image");
  assert.equal(needs[0].assetId, "ai");
  assert.equal(needs[0].sourceTime, 0, "画像に素材時刻は無い");
});

test("collectNeeds: 文字・図形・素材の無い clip は素材を要らない", () => {
  const p = proj();
  p.tracks.push({
    id: "t3", kind: "overlay", clips: [
      { id: "tx", kind: "text", start: 0, duration: 4, text: { content: "あ" } },
      { id: "sh", kind: "shape", start: 0, duration: 4 },
      { id: "nv", kind: "video", assetId: "", start: 0, duration: 4 }
    ]
  });
  assert.deepEqual(collectNeeds(p, 1).map((n) => n.clipId), ["cl1"]);
});

test("collectNeeds: overlay トラック（PiP）は拾う — 重ね合わせでも素材は要る", () => {
  const p = proj();
  p.tracks.push({
    id: "t4", kind: "overlay", clips: [
      { id: "pip", kind: "video", assetId: "av", start: 0, duration: 4, in: 0, out: 4, speed: 1 }
    ]
  });
  const ids = collectNeeds(p, 1).map((n) => n.clipId).sort();
  assert.deepEqual(ids, ["cl1", "pip"]);
});

test("collectNeeds: speed 2 の clip は素材時刻が倍で進む（eval.js と同じ規則）", () => {
  const p = proj();
  p.tracks[0].clips[0].speed = 2;
  p.tracks[0].clips[0].out = 10;
  const n = collectNeeds(p, 1)[0];
  assert.ok(Math.abs(n.sourceTime - 4) < 1e-9, "in:2 + 1 秒 × 2 = 4");
});

test("collectNeeds: 壊れた project でも落ちない（空を返す）", () => {
  assert.deepEqual(collectNeeds(null, 0), []);
  assert.deepEqual(collectNeeds({}, 0), []);
  assert.deepEqual(collectNeeds({ tracks: [null, { clips: null }] }, 0), []);
});

/* ══ ⑦ 通し: collectNeeds → planAssignment ═════════════════════ */

test("通し: 同じ素材を 2 つの clip が同時に使う所は <video> 1 本で足りる", () => {
  const p = proj();
  /* cl1 と pip が同じ素材・同じ位置を要る（in も start も同じ） */
  p.tracks.push({
    id: "t4", kind: "overlay", clips: [
      { id: "pip", kind: "video", assetId: "av", start: 0, duration: 4, in: 2, out: 6, speed: 1 }
    ]
  });
  const needs = collectNeeds(p, 1);
  const plan = planAssignment({ needs, capacity: capacityFor({ ios: true }), current: [], time: 1 });
  assert.equal(plan.slots.length, 1, "iOS の 2 本のうち 1 本で済む");
  assert.deepEqual(plan.still, []);
  assert.deepEqual(plan.shared[0].clipIds, ["cl1", "pip"]);
});

test("通し: iOS 2 本で 3 つ重なると 1 つは静止フレームになる", () => {
  const p = proj();
  p.assets.push({ id: "av2", kind: "video", duration: 20, fps: 30 });
  p.assets.push({ id: "av3", kind: "video", duration: 20, fps: 30 });
  p.tracks.push({
    id: "t4", kind: "overlay", clips: [
      { id: "pipA", kind: "video", assetId: "av2", start: 0, duration: 4, in: 0, out: 4, speed: 1 }
    ]
  });
  p.tracks.push({
    id: "t5", kind: "overlay", clips: [
      { id: "pipB", kind: "video", assetId: "av3", start: 0, duration: 4, in: 0, out: 4, speed: 1 }
    ]
  });
  const needs = collectNeeds(p, 1);
  assert.equal(needs.length, 3);
  const plan = planAssignment({ needs, capacity: POOL_IOS, current: [], time: 1 });
  assert.equal(plan.slots.length, 2);
  assert.equal(plan.still.length, 1);
  assert.equal(plan.assign.length + plan.still.length, 3, "誰も忘れられていない");
});

test("EMPTY_SOURCE は凍結されている（毎フレーム返す共有の物）", () => {
  assert.equal(EMPTY_SOURCE.kind, "empty");
  assert.equal(EMPTY_SOURCE.ready, false);
  assert.equal(Object.isFrozen(EMPTY_SOURCE), true);
});

/* ══ ⑧ 器そのもの（DOM が無い Node でも落ちない事だけを見る）════════ */

test("createSourcePool: 契約書 §4 の口が全部在る", () => {
  const pool = createSourcePool({ storage: null, project: proj(), fps: 30 });
  for (const k of ["setProject", "prepare", "acquire", "seekExact", "textCanvas",
    "releaseUnused", "stats", "dispose", "unlock"]) {
    assert.equal(typeof pool[k], "function", k + " が無い");
  }
  pool.dispose();
});

test("createSourcePool: DOM の無い所では絵を出さないが 例外も投げない", async () => {
  const pool = createSourcePool({ storage: null, project: proj(), fps: 30, max: 2 });
  const resolved = {
    kind: "video", assetId: "av", clip: { id: "cl1", kind: "video", assetId: "av", start: 0 },
    localTime: 1, sourceTime: 3, speed: 1, reverse: false
  };
  await pool.prepare(1, { lookahead: 1.5, mode: "scrub" });
  const src = pool.acquire(resolved, { mode: "scrub" });
  assert.equal(src.kind, "empty", "<video> を作れないので empty");
  assert.equal(src.ready, false);
  const exact = await pool.seekExact(resolved);
  assert.equal(exact.kind, "empty");
  assert.equal(pool.textCanvas(resolved), null, "engine/text.js が未着なら null");
  assert.equal(await pool.unlock(), true);
  pool.releaseUnused(1);
  const st = pool.stats();
  assert.equal(st.capacity, 2);
  assert.equal(st.videos, 0);
  assert.ok(st.misses >= 1, "出せなかった回数を数えている");
  assert.equal(typeof st.seekMs, "number");
  assert.equal(typeof st.hits, "number");
  pool.dispose();
});

test("createSourcePool: 文字・図形は担当外なので null を返す（合成器が自分で描く）", () => {
  const pool = createSourcePool({ project: proj() });
  assert.equal(pool.acquire({ kind: "text", clip: { id: "tx", kind: "text" } }, { mode: "play" }), null);
  assert.equal(pool.acquire({ kind: "shape", clip: { id: "sh", kind: "shape" } }, { mode: "play" }), null);
  pool.dispose();
});

test("createSourcePool: setProject で素材が消えても掴んだままにしない", () => {
  const pool = createSourcePool({ project: proj() });
  pool.setProject({ settings: { fps: 30 }, assets: [], tracks: [] });
  assert.equal(pool.stats().videos, 0);
  pool.releaseUnused(0);
  pool.dispose();
  /* dispose の後に呼ばれても落ちない（app.js の後片付けは順番が揺れる） */
  pool.releaseUnused(0);
  assert.equal(pool.acquire({ kind: "video", assetId: "av", clip: { id: "c", kind: "video", assetId: "av" } }).kind, "empty");
  pool.dispose();
});

test("createSourcePool: project 無しで作っても prepare が落ちない", async () => {
  const pool = createSourcePool();
  await pool.prepare(0, { lookahead: 1.5, mode: "play" });
  assert.equal(pool.stats().videos, 0);
  pool.dispose();
});

test("planAssignment は入力を書き換えない（純関数である事の担保）", () => {
  const needs = [need("c1", "A", 0, PRIO_NOW, 1), need("c2", "A", 0, PRIO_NOW, 9)];
  const current = [held(0, "c1", "A", 3, 1)];
  const snapNeeds = JSON.stringify(needs), snapCurrent = JSON.stringify(current);
  planAssignment({ needs, current, capacity: 1, time: 0 });
  assert.equal(JSON.stringify(needs), snapNeeds);
  assert.equal(JSON.stringify(current), snapCurrent);
});
