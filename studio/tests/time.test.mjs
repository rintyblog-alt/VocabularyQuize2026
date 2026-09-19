/* ══════════════════════════════════════════════════════════════════════
   tests/time.test.mjs — core/time.js の試験（node --test）

   ここが狂うと「書き出すとフレームが 1 枚抜ける」「クリップの端が 1 フレーム
   短い」「タイムコード欄に打ち直すと位置がずれる」という、後から原因を
   突き止めるのが最も面倒な壊れ方をする。だから
   ・snapFrame が冪等（何度通しても動かない）
   ・frameIndex ⇄ frameStart の往復
   ・toTC ⇄ fromTC の往復
   を 30 / 29.97 / 23.976 / 25 / 60 の全部で回す。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FPS, TIMECODE_RE,
  frameDur, snapFrame, frameIndex, frameStart,
  toTC, fromTC, clampRange, overlap, humanDuration, nearest,
} from "../src/core/time.js";

/** 実際に来る fps（契約書 §1: Asset.fps は 29.97 のような小数も来る） */
const FPS_LIST = [30, 29.97, 23.976, 25, 24, 50, 59.94, 60];

/* ── frameDur ───────────────────────────────────────────────── */

test("frameDur: 壊れた fps は既定 30 に落ちる", () => {
  assert.equal(frameDur(30), 1 / 30);
  assert.equal(frameDur(29.97), 1 / 29.97);
  assert.equal(frameDur(0), 1 / DEFAULT_FPS);
  assert.equal(frameDur(-5), 1 / DEFAULT_FPS);
  assert.equal(frameDur(NaN), 1 / DEFAULT_FPS);
  assert.equal(frameDur(Infinity), 1 / DEFAULT_FPS);
  assert.equal(frameDur(undefined), 1 / DEFAULT_FPS);
  for (const f of FPS_LIST) assert.ok(Number.isFinite(frameDur(f)));
});

/* ── snapFrame ──────────────────────────────────────────────── */

test("snapFrame: floor ではなく round", () => {
  assert.ok(Math.abs(snapFrame(0.1, 30) - 0.1) < 1e-12);
  // 3.48 フレーム → 3（近い方）
  assert.equal(snapFrame(3.48 / 30, 30), 3 / 30);
  // 3.6 フレーム → 4（floor なら 3 になってしまう所）
  assert.equal(snapFrame(3.6 / 30, 30), 4 / 30);
  assert.equal(snapFrame(0, 30), 0);
  assert.equal(snapFrame(NaN, 30), 0);
  assert.equal(snapFrame(-0.5 / 30, 30), 0, "境界は上へ寄せる（round half up）");
});

test("snapFrame: 1e-6 の誤差を吸う（冪等）", () => {
  for (const fps of FPS_LIST) {
    for (let i = 0; i < 400; i++) {
      const t = i / fps;
      const a = snapFrame(t, fps);
      const b = snapFrame(a, fps);
      assert.equal(b, a, `fps=${fps} i=${i} が冪等でない`);
      assert.ok(Math.abs(a - t) < 1e-9, `fps=${fps} i=${i} でフレームが動いた`);
      // わずかに下振れした値も同じフレームへ戻る
      assert.equal(snapFrame(t - 1e-9, fps), a, `fps=${fps} i=${i} の下振れ`);
      assert.equal(snapFrame(t + 1e-9, fps), a, `fps=${fps} i=${i} の上振れ`);
    }
  }
});

test("snapFrame: 結果は必ずフレーム境界", () => {
  for (const fps of FPS_LIST) {
    for (const t of [0.3333, 1.777, 12.3456, 0.0001, 99.99]) {
      const s = snapFrame(t, fps);
      const i = s * fps;
      assert.ok(Math.abs(i - Math.round(i)) < 1e-6, `fps=${fps} t=${t}`);
      assert.ok(Math.abs(s - t) <= frameDur(fps) / 2 + 1e-9, "半フレーム以上動かさない");
    }
  }
});

/* ── frameIndex / frameStart ────────────────────────────────── */

test("frameIndex / frameStart: 往復して番号が動かない", () => {
  for (const fps of FPS_LIST) {
    for (const i of [0, 1, 2, 7, 29, 30, 31, 100, 1799, 1800, 12345, 100000]) {
      assert.equal(frameIndex(frameStart(i, fps), fps), i, `fps=${fps} i=${i}`);
    }
  }
});

test("frameIndex: 境界は floor（そのフレームが始まった所）", () => {
  assert.equal(frameIndex(0, 30), 0);
  assert.equal(frameIndex(1 / 30 - 1e-9, 30), 1, "1e-6 フレーム分は吸って次へ");
  assert.equal(frameIndex(1 / 30 + 1e-9, 30), 1);
  assert.equal(frameIndex(1.5 / 30, 30), 1, "フレームの真ん中はまだ 1");
  assert.equal(frameIndex(2 / 30, 30), 2);
  assert.equal(frameIndex(1, 30), 30);
  assert.equal(frameIndex(NaN, 30), 0);
  assert.equal(frameStart(2.4, 30), 2 / 30, "番号は整数に丸める");
  assert.equal(frameStart(NaN, 30), 0);
});

/* ── toTC / fromTC ──────────────────────────────────────────── */

test("toTC: HH:MM:SS:FF（non-drop frame）", () => {
  assert.equal(toTC(0, 30), "00:00:00:00");
  assert.equal(toTC(83.4, 30), "00:01:23:12");
  assert.equal(toTC(1, 30), "00:00:01:00");
  assert.equal(toTC(1 - 1e-9, 30), "00:00:01:00", "誤差でフレームを落とさない");
  assert.equal(toTC(3661.5, 30), "01:01:01:15");
  assert.equal(toTC(-1, 30), "-00:00:01:00");
  assert.equal(toTC(NaN, 30), "00:00:00:00");
  // 29.97 は「30 フレームで 1 秒」と数える（NDF なので実時間より進む）
  assert.equal(toTC(1, 29.97), "00:00:00:29");
  assert.equal(toTC(30 / 29.97, 29.97), "00:00:01:00");
  assert.equal(toTC(24 / 23.976, 23.976), "00:00:01:00");
  assert.equal(toTC(1, 23.976), "00:00:00:23");
});

test("toTC: compact と ms", () => {
  assert.equal(toTC(83.44, 30, { compact: true }), "1:23.4");
  assert.equal(toTC(0, 30, { compact: true }), "0:00.0");
  assert.equal(toTC(3723.02, 30, { compact: true }), "1:02:03.0");
  assert.equal(toTC(3723.05, 30, { compact: true }), "1:02:03.1", "0.05 は上へ丸める");
  assert.equal(toTC(83.456, 30, { compact: true, ms: true }), "1:23.456");
  assert.equal(toTC(83.456, 30, { ms: true }), "00:01:23.456");
  assert.equal(toTC(-83.456, 30, { ms: true }), "-00:01:23.456");
  assert.equal(toTC(3661.5, 30, { ms: true }), "01:01:01.500");
});

test("fromTC: 区切りの数で意味が変わる", () => {
  assert.equal(fromTC("83", 30), 83);
  assert.equal(fromTC("1:23", 30), 83);
  assert.equal(fromTC("00:01:23", 30), 83);
  assert.ok(Math.abs(fromTC("00:01:23:12", 30) - 83.4) < 1e-9);
  assert.ok(Math.abs(fromTC("1:23.4", 30) - 83.4) < 1e-9);
  assert.ok(Math.abs(fromTC("1:23,4", 30) - 83.4) < 1e-9, "小数点は , でも読む");
  assert.equal(fromTC("-1:23", 30), -83);
  assert.equal(fromTC("  1:23  ", 30), 83, "前後の空白は捨てる");
  // drop frame の ";" は読めるが NDF として扱う（契約書外なので同じ値になる）
  assert.equal(fromTC("00:01:23;12", 30), fromTC("00:01:23:12", 30));
  // 29.97 は名目 30 で数えてから実 fps で秒に戻す
  assert.ok(Math.abs(fromTC("00:00:01:00", 29.97) - 30 / 29.97) < 1e-9);
});

test("fromTC: 読めないものは null（0 に飛ばさない）", () => {
  for (const bad of ["", " ", "abc", "1:2:3:4:5", "::", "1:", ".5", "1.2.3", "１:２３", null, undefined, 83, {}]) {
    assert.equal(fromTC(/** @type {any} */ (bad), 30), null, `fromTC(${String(bad)})`);
  }
});

test("toTC ⇄ fromTC: 往復しても文字列が変わらない", () => {
  for (const fps of FPS_LIST) {
    for (const t of [0, 0.5, 1, 1.001, 12.345, 83.4, 599.99, 3661.5, 7322.25]) {
      const tc = toTC(t, fps);
      const back = fromTC(tc, fps);
      assert.ok(back !== null, `fps=${fps} t=${t} の ${tc} が読めない`);
      assert.equal(toTC(back, fps), tc, `fps=${fps} t=${t} の往復`);
      // 戻した秒はそのフレームの先頭（半フレーム以上ずれない）
      assert.ok(Math.abs(back - t) <= frameDur(fps) + 1e-9, `fps=${fps} t=${t} のずれ`);
      // ms 形式も往復する
      const tcMs = toTC(t, fps, { ms: true });
      assert.equal(toTC(fromTC(tcMs, fps), fps, { ms: true }), tcMs, `ms 往復 ${tcMs}`);
    }
  }
});

test("toTC ⇄ fromTC: フレーム番号が 1 つも抜けない", () => {
  for (const fps of [30, 29.97, 23.976]) {
    for (let i = 0; i < 300; i++) {
      const t = frameStart(i, fps);
      const back = fromTC(toTC(t, fps), fps);
      assert.equal(frameIndex(/** @type {number} */ (back), fps), i, `fps=${fps} i=${i}`);
    }
  }
});

test("TIMECODE_RE: 形だけの判定に使える", () => {
  assert.ok(TIMECODE_RE.test("00:01:23:12"));
  assert.ok(TIMECODE_RE.test("1:23.4"));
  assert.ok(TIMECODE_RE.test("83"));
  assert.ok(!TIMECODE_RE.test("abc"));
  assert.ok(!TIMECODE_RE.test("1:2:3:4:5"));
  assert.ok(!TIMECODE_RE.global, "g 付きだと lastIndex で結果が揺れるので付けない");
});

/* ── 範囲 ───────────────────────────────────────────────────── */

test("clampRange", () => {
  const r = { start: 1, end: 5 };
  assert.equal(clampRange(0, r), 1);
  assert.equal(clampRange(3, r), 3);
  assert.equal(clampRange(9, r), 5);
  assert.equal(clampRange(NaN, r), 1);
  assert.equal(clampRange(3, { start: 5, end: 1 }), 3, "逆さでも扱う");
  assert.equal(clampRange(3, undefined), 3, "範囲が無ければそのまま");
  assert.equal(clampRange(NaN, undefined), 0);
  assert.equal(clampRange(3, { start: 2 }), 2, "end 無しは start に潰れる");
});

test("overlap: 重なり秒", () => {
  assert.equal(overlap(0, 4, 2, 6), 2);
  assert.equal(overlap(0, 4, 4, 6), 0, "端で接するだけは 0");
  assert.equal(overlap(0, 4, 5, 6), 0);
  assert.equal(overlap(0, 10, 2, 3), 1, "内包");
  assert.equal(overlap(2, 3, 0, 10), 1);
  assert.equal(overlap(4, 0, 6, 2), 2, "端が逆さでも正す");
  assert.equal(overlap(NaN, 4, 2, 6), 2);
  assert.ok(overlap(0, 1, 0, 1) === 1);
  for (const v of [overlap(0, 4, 2, 6), overlap(0, 1, 5, 6)]) assert.ok(v >= 0);
});

/* ── 人向けの表示 ───────────────────────────────────────────── */

test("humanDuration", () => {
  assert.equal(humanDuration(83), "1分23秒");
  assert.equal(humanDuration(23), "23秒");
  assert.equal(humanDuration(60), "1分");
  assert.equal(humanDuration(3600), "1時間");
  assert.equal(humanDuration(3723), "1時間2分3秒");
  assert.equal(humanDuration(3660), "1時間1分");
  assert.equal(humanDuration(0), "0秒");
  assert.equal(humanDuration(0.4), "0.4秒");
  assert.equal(humanDuration(0.04), "0.04秒", "MIN_CLIP を 0 秒と言わない");
  assert.equal(humanDuration(NaN), "0秒");
  assert.equal(humanDuration(-83), "-1分23秒");
  assert.equal(humanDuration(59.6), "1分", "繰り上がって 60秒 にならない");
});

/* ── 吸着 ───────────────────────────────────────────────────── */

test("nearest: 最も近い値（ビート吸着）", () => {
  const beats = [0, 0.5, 1.0, 1.5, 2.0, 4.0];
  assert.equal(nearest(beats, 0.6), 0.5);
  assert.equal(nearest(beats, 0.76), 1.0);
  assert.equal(nearest(beats, -5), 0);
  assert.equal(nearest(beats, 99), 4.0);
  assert.equal(nearest(beats, 1.5), 1.5);
  assert.equal(nearest(beats, 0.75), 0.5, "真ん中は手前（先に見つけた方）");
  assert.equal(nearest([], 1), null);
  assert.equal(nearest(null, 1), null);
  assert.equal(nearest(beats, NaN), 0);
  assert.equal(nearest([3], 100), 3);
  // maxDist より遠ければ吸着しない
  assert.equal(nearest(beats, 3.0, { maxDist: 0.2 }), null);
  assert.equal(nearest(beats, 2.1, { maxDist: 0.2 }), 2.0);
  assert.equal(nearest(beats, 2.1, { maxDist: 0.05 }), null);
  // 昇順でない配列は sorted:false で
  assert.equal(nearest([4, 0, 2], 1.9, { sorted: false }), 2);
  // 二分探索と総当たりが必ず一致する
  const rnd = [];
  let acc = 0;
  for (let i = 0; i < 200; i++) { acc += 0.1 + (i % 7) * 0.03; rnd.push(Number(acc.toFixed(4))); }
  for (let k = 0; k < 500; k++) {
    const t = (k / 500) * (acc + 1) - 0.5;
    const fast = nearest(rnd, t);
    const slow = nearest(rnd, t, { sorted: false });
    assert.equal(fast, slow, `t=${t}`);
  }
});
