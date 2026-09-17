/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/snap.test.mjs — 吸着（ui/timeline/snap.js）の試験

   ★ 何を固定するか
     ① 候補の中身（クリップの端 / 0 秒 / 末尾 / マーカー / ビート / 再生ヘッド）
     ② 掴んでいるクリップの除外（自分自身に吸着したら移動できない）
     ③ 許容範囲（px を拡大率で秒に直す）の内と外
     ④ 同距離のときの優先順（再生ヘッドが一番強い）
     ⑤ magnet off で候補が空になること（触り方側に分岐を書かせない約束）

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/snap.test.mjs
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSnapPoints, snapTime, snapMove, nearestSnap, dedupeSnapPoints,
  visibleTimeRange, toleranceSeconds, snapPriority, snapLabel,
  DEFAULT_TOLERANCE_PX, SNAP_KIND_PRIORITY
} from "../src/ui/timeline/snap.js";

/** 試験用の最小 Project（clip は tr1 に 0-2 秒 と 5-8 秒） */
function proj(over) {
  const p = {
    settings: { snap: true, magnet: true },
    markers: [],
    tracks: [{
      id: "tr1", kind: "video", clips: [
        { id: "c1", start: 0, duration: 2 },
        { id: "c2", start: 5, duration: 3 }
      ]
    }]
  };
  return Object.assign(p, over || {});
}

/** 候補から t の配列を作る（見やすさのため） */
const times = (pts) => pts.map((p) => p.t);
/** 種類ごとの t を引く */
const ofKind = (pts, kind) => pts.filter((p) => p.kind === kind).map((p) => p.t);

/* ── ① 候補の中身 ─────────────────────────────────────────────── */

test("buildSnapPoints: クリップの端・0 秒・末尾が入り、t 昇順になる", () => {
  const pts = buildSnapPoints({ project: proj() });
  assert.deepEqual(times(pts), [0, 2, 5, 8]);
  // 0 は clipStart(c1) と zero が重なる。強い方（clipStart）が残る
  assert.equal(pts[0].kind, "clipStart");
  assert.deepEqual(ofKind(pts, "clipEnd"), [2, 8]);
  // 末尾 8 は clipEnd(c2) と end が重なるので clipEnd が残る
  assert.equal(pts[3].kind, "clipEnd");
});

test("buildSnapPoints: 空の Project でも 0 秒だけは返る", () => {
  const pts = buildSnapPoints({ project: { settings: {}, tracks: [], markers: [] } });
  assert.deepEqual(times(pts), [0]);
  assert.equal(pts[0].kind, "zero");
});

test("buildSnapPoints: Project が無くても落ちない", () => {
  assert.deepEqual(times(buildSnapPoints({})), [0]);
  assert.deepEqual(times(buildSnapPoints()), [0]);
});

test("buildSnapPoints: 再生ヘッドとマーカーが入る", () => {
  const pts = buildSnapPoints({
    project: proj({ markers: [{ id: "mk1", t: 3.5 }] }),
    playhead: 6.25
  });
  assert.deepEqual(ofKind(pts, "playhead"), [6.25]);
  assert.deepEqual(ofKind(pts, "marker"), [3.5]);
  assert.equal(pts.find((p) => p.kind === "marker").markerId, "mk1");
});

test("buildSnapPoints: markers:false でマーカーだけ切れる", () => {
  const pts = buildSnapPoints({ project: proj({ markers: [{ id: "mk1", t: 3.5 }] }), markers: false });
  assert.deepEqual(ofKind(pts, "marker"), []);
  assert.ok(times(pts).includes(5));
});

test("buildSnapPoints: 負の時刻と NaN は捨てる", () => {
  const pts = buildSnapPoints({ project: proj({ markers: [{ t: -1 }, { t: NaN }, { t: 4 }] }) });
  assert.deepEqual(ofKind(pts, "marker"), [4]);
});

/* ── ② 除外クリップ ───────────────────────────────────────────── */

test("buildSnapPoints: 掴んでいるクリップの端は候補から外れる", () => {
  const pts = buildSnapPoints({ project: proj(), excludeClipIds: ["c2"] });
  // c2（5〜8）の端が消え、0 と 2、それに全体の末尾 8（end）が残る
  assert.deepEqual(ofKind(pts, "clipStart"), [0]);
  assert.deepEqual(ofKind(pts, "clipEnd"), [2]);
  assert.deepEqual(ofKind(pts, "end"), [8]);
});

test("buildSnapPoints: 除外は Set でも文字列 1 つでも受ける", () => {
  const a = buildSnapPoints({ project: proj(), excludeClipIds: new Set(["c1"]) });
  const b = buildSnapPoints({ project: proj(), excludeClipIds: "c1" });
  assert.deepEqual(times(a), times(b));
  assert.deepEqual(ofKind(a, "clipStart"), [5]);
});

test("buildSnapPoints: 両方のクリップを掴んだら端は全部消える", () => {
  const pts = buildSnapPoints({ project: proj(), excludeClipIds: ["c1", "c2"] });
  assert.deepEqual(ofKind(pts, "clipStart"), []);
  assert.deepEqual(ofKind(pts, "clipEnd"), []);
  assert.deepEqual(times(pts), [0, 8]);   // zero と end（尺は掴んでいても変わらない）
});

/* ── ③ 許容範囲 ───────────────────────────────────────────────── */

test("snapTime: 許容範囲の内側は寄り、外側はそのまま", () => {
  const pts = buildSnapPoints({ project: proj() });
  // 100px/s・8px → 0.08 秒
  const inside = snapTime(5.05, pts, { pxPerSec: 100, tolerancePx: 8 });
  assert.equal(inside.t, 5);
  assert.equal(inside.hit.kind, "clipStart");

  const outside = snapTime(5.2, pts, { pxPerSec: 100, tolerancePx: 8 });
  assert.equal(outside.t, 5.2);          // 勝手に丸めない
  assert.equal(outside.hit, null);
});

test("snapTime: 拡大すると同じ px 許容でも秒の許容は狭くなる", () => {
  const pts = buildSnapPoints({ project: proj() });
  const wide = snapTime(5.07, pts, { pxPerSec: 100, tolerancePx: 8 });   // 0.08 秒
  const zoomed = snapTime(5.07, pts, { pxPerSec: 400, tolerancePx: 8 }); // 0.02 秒
  assert.equal(wide.t, 5);
  assert.equal(zoomed.t, 5.07);
  assert.equal(zoomed.hit, null);
});

test("snapTime: 候補が空・pxPerSec が 0 なら何もしない", () => {
  assert.deepEqual(snapTime(1.23, [], { pxPerSec: 100 }), { t: 1.23, hit: null, dist: Infinity });
  const pts = buildSnapPoints({ project: proj() });
  assert.equal(snapTime(5.01, pts, { pxPerSec: 0 }).hit, null);
  assert.equal(snapTime(5.01, pts, { pxPerSec: 100, tolerancePx: 0 }).hit, null);
});

test("toleranceSeconds: px → 秒の換算", () => {
  assert.equal(toleranceSeconds(100, 8), 0.08);
  assert.equal(toleranceSeconds(100), DEFAULT_TOLERANCE_PX / 100);
  assert.equal(toleranceSeconds(0, 8), 0);
});

/* ── ④ 優先順 ─────────────────────────────────────────────────── */

test("nearestSnap: 同距離なら再生ヘッドが勝つ", () => {
  const pts = dedupeSnapPoints([
    { t: 4.9, kind: "clipStart" },
    { t: 5.1, kind: "playhead" }
  ]);
  const hit = nearestSnap(5.0, pts);
  assert.equal(hit.point.kind, "playhead");
});

test("nearestSnap: 同距離ならビートは負ける", () => {
  const pts = [{ t: 2.9, kind: "beat" }, { t: 3.1, kind: "marker" }];
  assert.equal(nearestSnap(3.0, pts).point.kind, "marker");
});

test("nearestSnap: 距離が優先順より強い（近い方が勝つ）", () => {
  const pts = [{ t: 2.99, kind: "beat" }, { t: 3.5, kind: "playhead" }];
  assert.equal(nearestSnap(3.0, pts).point.kind, "beat");
});

test("dedupeSnapPoints: 同じ時刻は強い方だけ残る（順不同で渡しても）", () => {
  const pts = dedupeSnapPoints([
    { t: 5, kind: "beat" }, { t: 5, kind: "playhead" }, { t: 5.00001, kind: "clipStart" }
  ]);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].kind, "playhead");
});

test("優先順の表: 再生ヘッド < マーカー < クリップ端 < 端 < ビート", () => {
  assert.ok(SNAP_KIND_PRIORITY.playhead < SNAP_KIND_PRIORITY.marker);
  assert.ok(SNAP_KIND_PRIORITY.marker < SNAP_KIND_PRIORITY.clipStart);
  assert.ok(SNAP_KIND_PRIORITY.clipEnd < SNAP_KIND_PRIORITY.end);
  assert.ok(SNAP_KIND_PRIORITY.end < SNAP_KIND_PRIORITY.beat);
  assert.equal(snapPriority("しらない種類"), 9);
  assert.equal(snapLabel("playhead"), "再生ヘッド");
  assert.equal(snapLabel("nope"), "");
});

/* ── ⑤ ビート吸着 ─────────────────────────────────────────────── */

test("buildSnapPoints: ビートは配列でも {times} でも受ける", () => {
  const a = buildSnapPoints({ project: proj(), beats: [1.5, 3, 4.5] });
  const b = buildSnapPoints({ project: proj(), beats: { bpm: 120, times: [1.5, 3, 4.5] } });
  assert.deepEqual(ofKind(a, "beat"), [1.5, 3, 4.5]);
  assert.deepEqual(ofKind(b, "beat"), [1.5, 3, 4.5]);
});

test("snapTime: ビートへ吸着する（他に近い物が無いとき）", () => {
  const pts = buildSnapPoints({ project: proj(), beats: [3.0, 3.5, 4.0] });
  const hit = snapTime(3.48, pts, { pxPerSec: 100, tolerancePx: 8 });
  assert.equal(hit.t, 3.5);
  assert.equal(hit.hit.kind, "beat");
});

test("snapTime: ビートよりクリップの端が近ければ端へ", () => {
  const pts = buildSnapPoints({ project: proj(), beats: [4.95] });
  const hit = snapTime(4.99, pts, { pxPerSec: 100, tolerancePx: 8 });
  assert.equal(hit.t, 5);
  assert.equal(hit.hit.kind, "clipStart");
});

test("ビートを渡さなければビート候補は出ない", () => {
  assert.deepEqual(ofKind(buildSnapPoints({ project: proj() }), "beat"), []);
});

/* ── ⑥ magnet off ─────────────────────────────────────────────── */

test("magnet off なら候補は空（snap off でも空）", () => {
  assert.deepEqual(buildSnapPoints({ project: proj({ settings: { magnet: false, snap: true } }) }), []);
  assert.deepEqual(buildSnapPoints({ project: proj({ settings: { magnet: true, snap: false } }) }), []);
  // off のときは何を渡しても空（ビートや再生ヘッドも入らない）
  assert.deepEqual(buildSnapPoints({
    project: proj({ settings: { magnet: false } }), playhead: 1, beats: [2]
  }), []);
});

/* ── ⑦ クリップ移動（両端吸着） ───────────────────────────────── */

test("snapMove: 先頭が近ければ先頭で寄せる（尺は変わらない）", () => {
  const pts = buildSnapPoints({ project: proj(), excludeClipIds: ["c1"] });
  const r = snapMove({ start: 4.96, duration: 1, points: pts, pxPerSec: 100, tolerancePx: 8 });
  assert.equal(r.start, 5);
  assert.equal(r.edge, "start");
  assert.ok(Math.abs(r.shift - 0.04) < 1e-9);
});

test("snapMove: 末尾の方が近ければ末尾で寄せる", () => {
  const pts = buildSnapPoints({ project: proj(), excludeClipIds: ["c1"] });
  // 先頭 4.9 は 5 から 0.1 秒（許容 0.08 の外）、末尾 7.95 は 8 から 0.05 秒
  const r = snapMove({ start: 4.9, duration: 3.05, points: pts, pxPerSec: 100, tolerancePx: 8 });
  assert.equal(r.edge, "end");
  assert.ok(Math.abs(r.start - 4.95) < 1e-9);
});

test("snapMove: どちらも遠ければ動かさない", () => {
  const pts = buildSnapPoints({ project: proj() });
  const r = snapMove({ start: 3.3, duration: 0.5, points: pts, pxPerSec: 100, tolerancePx: 8 });
  assert.equal(r.start, 3.3);
  assert.equal(r.hit, null);
  assert.equal(r.edge, null);
  assert.equal(r.shift, 0);
});

test("snapMove: 0 秒より前には出さない", () => {
  const pts = [{ t: 0, kind: "zero" }];
  const r = snapMove({ start: 0.02, duration: 1, points: pts, pxPerSec: 100, tolerancePx: 8 });
  assert.equal(r.start, 0);
});

/* ── ⑧ 見えている範囲での間引き ───────────────────────────────── */

test("visibleTimeRange: 数値が揃っていなければ null（= 間引かない）", () => {
  assert.equal(visibleTimeRange(null), null);
  assert.equal(visibleTimeRange({ pxPerSec: 100 }), null);
  const r = visibleTimeRange({ pxPerSec: 100, scrollX: 0, width: 1000 }, { marginPx: 0 });
  assert.deepEqual(r, { start: 0, end: 10 });
});

test("buildSnapPoints: 画面外の候補は落ちる", () => {
  const view = { pxPerSec: 100, scrollX: 0, width: 100 };  // 余白 240px → -2.4〜3.4 秒
  const pts = buildSnapPoints({ project: proj(), view });
  assert.deepEqual(times(pts), [0, 2]);
});
