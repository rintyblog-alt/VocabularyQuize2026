/* ══════════════════════════════════════════════════════════════════════
   tests/clock.test.mjs — 再生の時計と Transport の試験（契約書 §4）

   rAF も AudioContext も DOM も Node には無いので、
   engine/playback.js は **全部注入できる形**にしてある:
     ・`createClock({ now })`    … now（秒）を注入
     ・`createTransport({ now, raf, caf, ... })` … 壁時計と rAF を注入
   ここで見るのは
     ① 時計（注入した now で進む・rate・sync のドリフト補正）
     ② 純関数（clampRate / wrapTime / pickQualityStep / measuredFps）
     ③ Transport の筋（play の順番・範囲ループ・終端 end・コマ送り・
        負 rate の seekExact・擦りの間引き・二重 dispose）
   絵が本当に出るかはブラウザ側（selftest.html と通し試験）で見る。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createClock, createTransport, clampRate, wrapTime, measuredFps,
  pickQualityStep, snapStep, stepUp, stepDown, qualityOf,
  RATE_MIN, RATE_MAX, DRIFT_TOL, DRIFT_SNAP, QUALITY_STEPS, FRAME_WINDOW
} from "../src/engine/playback.js";
import { createStore } from "../src/core/store.js";
import { newProject, newTrack, newClip, newAsset } from "../src/core/schema.js";
import { frameDur, snapFrame } from "../src/core/time.js";

/* ── 道具 ──────────────────────────────────────────────────────── */

/** 注入する壁時計（秒）と rAF の代役。frame() で 1 枚ずつ進める */
function makeEnv(step) {
  const dt = step === undefined ? 1 / 60 : step;
  let t = 0, seq = 1;
  const queue = [];
  return {
    get t() { return t; },
    now: () => t,
    raf(fn) { const id = seq++; queue.push({ id, fn }); return id; },
    caf(id) { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); },
    advance(sec) { t += sec === undefined ? dt : sec; },
    /** 壁時計を進めて、溜まっている rAF を流す（= 1 フレーム） */
    frame(sec) {
      this.advance(sec);
      const list = queue.splice(0, queue.length);
      for (const q of list) q.fn(t * 1000);
    },
    frames(n, sec) { for (let i = 0; i < n; i++) this.frame(sec); },
    get pending() { return queue.length; }
  };
}

function makeCompositor() {
  const calls = [];
  return {
    backend: "2d", calls,
    renderFrame(project, time, opts) {
      calls.push({ time, quality: opts && opts.quality, mode: opts && opts.mode });
    },
    resize() {}, grabPixels() { return null; }, stats() { return {}; }, dispose() {}
  };
}

function makeSources() {
  const log = [];
  return {
    log,
    setProject(p) { log.push(["setProject", p && p.id]); },
    prepare(t, o) { log.push(["prepare", t, o && o.mode]); return Promise.resolve(); },
    acquire() { return { kind: "empty", el: null, width: 0, height: 0, ready: false }; },
    seekExact(r) { log.push(["seekExact", r && r.sourceTime]); return Promise.resolve({ kind: "video", ready: true }); },
    textCanvas() { return null; },
    releaseUnused(t) { log.push(["releaseUnused", t]); },
    unlock() { log.push(["unlock"]); },
    stats() { return {}; }, dispose() { log.push(["dispose"]); }
  };
}

/** AudioEngine の代役。ctx.currentTime は 手で進める */
function makeAudio(opts) {
  const o = opts || {};
  const log = [];
  const ctx = { currentTime: o.ctx === undefined ? 100 : o.ctx, state: "running", resume() { log.push(["resume"]); } };
  return {
    ctx, master: null, log,
    setProject(p) { log.push(["setProject", p && p.id]); },
    prepare(t) { log.push(["prepare", t]); },
    start(t) { log.push(["start", t]); },
    stop() { log.push(["stop"]); },
    seek(t) { log.push(["seek", t]); },
    setMasterVolume() {}, meter() { return { peak: 0, rms: 0 }; },
    dispose() {}
  };
}

/** 動画 1 本のプロジェクト（尺 = dur 秒） */
function makeProject(dur, opts) {
  const o = opts || {};
  const as = newAsset({ kind: "video", name: "a.mp4", duration: dur, width: 640, height: 360, fps: 30, hasAudio: true });
  const clip = newClip("video", { assetId: as.id, start: 0, duration: dur, in: 0, out: dur });
  const track = newTrack("video", { clips: [clip] });
  return newProject(Object.assign({
    assets: [as], tracks: [track], settings: { width: 640, height: 360, fps: 30 }
  }, o.project || {}));
}

function makeTransport(opts) {
  const o = opts || {};
  const env = o.env || makeEnv();
  const store = createStore(o.project || makeProject(o.dur === undefined ? 10 : o.dur));
  const compositor = makeCompositor();
  const sources = makeSources();
  const audio = o.audio === null ? null : (o.audio || makeAudio());
  const tr = createTransport({
    store, compositor, sources, audio,
    fps: 30, now: env.now, raf: (fn) => env.raf(fn), caf: (id) => env.caf(id)
  });
  return { env, store, compositor, sources, audio, tr };
}

const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

/* ══ ① 時計 ═══════════════════════════════════════════════════════ */

test("createClock: 注入した now で time が進む（start / stop / set）", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });

  assert.equal(c.time, 0);
  assert.equal(c.running, false);

  c.start(2);
  assert.equal(c.time, 2);                 // 壁時計が進む前は そのまま
  assert.equal(c.running, true);
  env.advance(0.5);
  assert.ok(near(c.time, 2.5));
  env.advance(0.5);
  assert.ok(near(c.time, 3));

  const at = c.stop();
  assert.ok(near(at, 3));
  assert.equal(c.running, false);
  env.advance(10);
  assert.ok(near(c.time, 3), "止めたら壁時計が進んでも動かない");

  /* set は「動いたまま位置だけ変える」= 再生中の seek */
  c.start();
  assert.ok(near(c.time, 3), "start() を引数なしで呼んだら今の時刻から");
  c.set(7);
  assert.ok(near(c.time, 7));
  env.advance(0.25);
  assert.ok(near(c.time, 7.25));
});

test("createClock: setRate は今の時刻を保ったまま速さを変える（負も）", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.start(0);
  env.advance(1);
  assert.ok(near(c.time, 1));

  c.setRate(2);
  assert.ok(near(c.time, 1), "速さを変えた瞬間に時刻は飛ばない");
  env.advance(1);
  assert.ok(near(c.time, 3));

  c.setRate(0.25);
  env.advance(2);
  assert.ok(near(c.time, 3.5));

  /* 負 = 逆再生。時刻は戻る */
  c.setRate(-1);
  assert.equal(c.rate, -1);
  env.advance(1);
  assert.ok(near(c.time, 2.5));
  env.advance(0.5);
  assert.ok(near(c.time, 2));

  /* 数でない物は無視（時計は止めない） */
  c.setRate(NaN);
  assert.equal(c.rate, -1);
});

test("createClock: 0.05s 以下のずれは直さない（揺れ止め）", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.start(0);
  env.advance(1);
  const before = c.time;
  const d = c.sync(1 + DRIFT_TOL * 0.8);         // 許す範囲のずれ
  assert.ok(Math.abs(d) <= DRIFT_TOL);
  assert.ok(near(c.time, before), "許容内では時刻を動かさない");
  assert.equal(c.pending, 0, "補正も始めない");
});

test("createClock: sync のドリフト補正は単調に寄り、振動しない（遅れ）", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.start(0);
  const lag = 0.2;                               // 音が 0.2 秒先に居る
  const audioAt = () => env.t + lag;

  const errs = [];
  const times = [];
  for (let i = 0; i < 200; i++) {
    env.advance(1 / 60);
    c.sync(audioAt());
    times.push(c.time);
    errs.push(audioAt() - c.time);
  }

  /* ① 行き過ぎない（符号が反転しない = 振動しない） */
  for (const e of errs) assert.ok(e >= -1e-9, "音を追い越してはいけない: " + e);
  /* ② 単調に縮む */
  for (let i = 1; i < errs.length; i++) {
    assert.ok(errs[i] <= errs[i - 1] + 1e-9, `${i} 枚目で差が広がった: ${errs[i - 1]} → ${errs[i]}`);
  }
  /* ③ 時刻そのものは前へ進み続ける（絵が巻き戻らない） */
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] >= times[i - 1] - 1e-9, "時刻が巻き戻った");
  }
  /* ④ 1 秒あれば許容内へ入っている（0.25 秒の時定数の一次遅れ） */
  assert.ok(errs[59] < lag * 0.5, "1 秒で半分以上詰まっていない: " + errs[59]);
  assert.ok(errs[errs.length - 1] <= DRIFT_TOL + 1e-9, "最後まで寄り切らない: " + errs[errs.length - 1]);
});

test("createClock: 進みすぎ（音より先）でも逆走せずに寄る", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.start(0.2);                                  // 時計が 0.2 秒先に居る
  const audioAt = () => env.t;

  const errs = [], times = [];
  for (let i = 0; i < 200; i++) {
    env.advance(1 / 60);
    c.sync(audioAt());
    times.push(c.time);
    errs.push(c.time - audioAt());               // 先行している量
  }
  for (const e of errs) assert.ok(e >= -1e-9, "音を下回ってはいけない（行き過ぎ）: " + e);
  for (let i = 1; i < errs.length; i++) {
    assert.ok(errs[i] <= errs[i - 1] + 1e-9, "差が広がった");
  }
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] >= times[i - 1] - 1e-9, "寄せている間に時刻が巻き戻った");
  }
  assert.ok(errs[errs.length - 1] <= DRIFT_TOL + 1e-9);
});

test("createClock: 1 秒を超える差は『別の位置』なので合わせ直す", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.start(0);
  env.advance(0.1);
  c.sync(50 + DRIFT_SNAP);                       // 音が別の所へ飛んだ
  assert.ok(near(c.time, 50 + DRIFT_SNAP), "飛んだ先へ合わせる");
  assert.equal(c.pending, 0, "滑らかに寄せる対象にしない");
});

test("createClock: 止まっている時計と壊れた値では sync が何もしない", () => {
  const env = makeEnv();
  const c = createClock({ now: env.now });
  c.set(4);
  assert.equal(c.sync(9), 0, "止まっている時計は音に付いていかない");
  assert.ok(near(c.time, 4));
  c.start(4);
  assert.equal(c.sync(NaN), 0);
  assert.equal(c.sync(undefined), 0);
  assert.ok(near(c.time, 4));
});

test("createClock: now を注入しなくても落ちない（既定は壁時計）", () => {
  const c = createClock();
  c.start(1);
  assert.ok(Number.isFinite(c.time));
  assert.ok(c.time >= 1);
  c.stop();
});

/* ══ ② 純関数 ═════════════════════════════════════════════════════ */

test("clampRate は 0.25〜4、負は逆再生、0 は『止める』", () => {
  assert.equal(clampRate(1), 1);
  assert.equal(clampRate(4), RATE_MAX);
  assert.equal(clampRate(9), RATE_MAX);
  assert.equal(clampRate(0.1), RATE_MIN);
  assert.equal(clampRate(-1), -1);
  assert.equal(clampRate(-99), -RATE_MAX);
  assert.equal(clampRate(-0.01), -RATE_MIN, "小さい値は下限へ（向きは保つ）");
  assert.equal(clampRate(0), 0, "ちょうど 0 だけが『止める』");
  assert.equal(clampRate(-0.00001), 0, "0 と見分けが付かない値も止める");
  assert.equal(clampRate(NaN), 1);
  assert.equal(clampRate(undefined), 1);
  assert.equal(clampRate("2"), 2, "文字でも数に読めれば通す（UI の value）");
});

test("wrapTime: 範囲の折返し（前向き）", () => {
  const R = { start: 2, end: 5, loop: true, rate: 1 };
  assert.deepEqual(wrapTime(3, R), { time: 3, wrapped: false, ended: false });
  assert.deepEqual(wrapTime(1, R), { time: 2, wrapped: true, ended: false });
  assert.deepEqual(wrapTime(5, R), { time: 2, wrapped: true, ended: false });
  /* 行き過ぎた分は残す（折り返しでカクつかせない） */
  const w = wrapTime(5.5, R);
  assert.ok(near(w.time, 2.5));
  assert.equal(w.wrapped, true);
  /* 2 周分飛んでも範囲の中へ入る */
  assert.ok(near(wrapTime(11.5, R).time, 2.5));
});

test("wrapTime: ループ無しは終端で ended", () => {
  const R = { start: 2, end: 5, loop: false, rate: 1 };
  assert.deepEqual(wrapTime(4.99, R), { time: 4.99, wrapped: false, ended: false });
  assert.deepEqual(wrapTime(5, R), { time: 5, wrapped: false, ended: true });
  assert.deepEqual(wrapTime(7, R), { time: 5, wrapped: false, ended: true });
});

test("wrapTime: 逆再生は start で折り返す / 止まる", () => {
  const back = { start: 2, end: 5, loop: true, rate: -1 };
  assert.deepEqual(wrapTime(3, back), { time: 3, wrapped: false, ended: false });
  assert.deepEqual(wrapTime(2, back), { time: 5, wrapped: true, ended: false });
  assert.ok(near(wrapTime(1.5, back).time, 4.5));
  assert.deepEqual(wrapTime(6, back), { time: 5, wrapped: true, ended: false });

  const once = { start: 2, end: 5, loop: false, rate: -1 };
  assert.deepEqual(wrapTime(2, once), { time: 2, wrapped: false, ended: true });
  assert.deepEqual(wrapTime(0, once), { time: 2, wrapped: false, ended: true });
});

test("wrapTime: 範囲が無い（空・in>out）なら ended", () => {
  assert.deepEqual(wrapTime(0, { start: 0, end: 0 }), { time: 0, wrapped: false, ended: true });
  assert.deepEqual(wrapTime(3, { start: 5, end: 1 }), { time: 5, wrapped: false, ended: true });
  assert.deepEqual(wrapTime(3, {}), { time: 0, wrapped: false, ended: true });
  assert.equal(wrapTime(NaN, { start: 1, end: 4 }).time, 1);
});

test("measuredFps: 間隔（秒）の平均の逆数。変な値は数えない", () => {
  assert.equal(measuredFps([1 / 60, 1 / 60, 1 / 60]), 60);
  assert.equal(measuredFps([1 / 30, 1 / 30]), 30);
  assert.equal(measuredFps([]), 0);
  assert.equal(measuredFps(null), 0);
  assert.equal(measuredFps([0, -1, 5]), 0, "0・負・1 秒超は除く（タブが隠れていた等）");
  assert.equal(measuredFps([1 / 60, 3]), 60);
});

test("snapStep / stepUp / stepDown / qualityOf", () => {
  assert.deepEqual(QUALITY_STEPS.slice(), [0.25, 0.5, 1]);
  assert.equal(snapStep(1), 1);
  assert.equal(snapStep(0.3), 0.25);
  assert.equal(snapStep(0.9), 1);
  assert.equal(snapStep(0), 1);
  assert.equal(snapStep(NaN, 0.5), 0.5);
  assert.equal(stepDown(1), 0.5);
  assert.equal(stepDown(0.5), 0.25);
  assert.equal(stepDown(0.25), 0.25, "下げ切りは そのまま");
  assert.equal(stepUp(0.25), 0.5);
  assert.equal(stepUp(1), 1, "上げ切りは そのまま");
  assert.equal(qualityOf("full"), 1);
  assert.equal(qualityOf("half"), 0.5);
  assert.equal(qualityOf("quarter"), 0.25);
  assert.equal(qualityOf("auto", 0.5), 0.5, "auto は呼ぶ側の今の値");
  assert.equal(qualityOf(undefined, 1), 1);
});

test("pickQualityStep: 落ちてきたら下げ、余裕が続けば上げる", () => {
  const slow = new Array(FRAME_WINDOW).fill(80);      // 30fps の予算 33ms を大きく超える
  const fast = new Array(FRAME_WINDOW).fill(3);
  const okay = new Array(FRAME_WINDOW).fill(25);

  assert.equal(pickQualityStep(slow, { fps: 30, current: 1 }).quality, 0.5);
  assert.equal(pickQualityStep(slow, { fps: 30, current: 0.5 }).quality, 0.25);
  assert.equal(pickQualityStep(slow, { fps: 30, current: 0.25 }).quality, 0.25);
  assert.equal(pickQualityStep(fast, { fps: 30, current: 0.25 }).quality, 0.5);
  assert.equal(pickQualityStep(fast, { fps: 30, current: 1 }).quality, 1);
  assert.equal(pickQualityStep(okay, { fps: 30, current: 0.5 }).quality, 0.5, "予算の中なら動かさない");

  /* 落ち着くまでは上げない（ちらつき止め） */
  assert.equal(pickQualityStep(fast, { fps: 30, current: 0.5, canUp: false }).quality, 0.5);
  /* 枚数が足りないうちは動かさない */
  assert.equal(pickQualityStep([80, 80, 80], { fps: 30, current: 1 }).quality, 1);
  assert.equal(pickQualityStep(fast.slice(0, 20), { fps: 30, current: 0.25 }).quality, 0.25,
    "上げるには 30 枚そろえる");
  /* auto 以外は設定どおり（自動で動かさない） */
  assert.equal(pickQualityStep(slow, { fps: 30, current: 1, previewQuality: "full" }).quality, 1);
  assert.equal(pickQualityStep(fast, { fps: 30, current: 1, previewQuality: "quarter" }).quality, 0.25);
  assert.equal(pickQualityStep(null, { fps: 30, current: 0.5 }).quality, 0.5);
});

/* ══ ③ Transport ══════════════════════════════════════════════════ */

test("createTransport: store が無ければ作れない（黙って壊れない）", () => {
  assert.throws(() => createTransport({}), /store/);
  assert.throws(() => createTransport(), /store/);
});

test("play は 音 → 素材 → rAF の順に始め、time が進む", () => {
  const { env, store, compositor, sources, audio, tr } = makeTransport({ dur: 10 });
  const times = [];
  tr.on("time", (p) => times.push(p));

  assert.equal(tr.playing, false);
  assert.equal(tr.play(), true);
  assert.equal(tr.playing, true);

  /* 順番: unlock（iOS）→ audio.start → sources.prepare。rAF はまだ動いていない */
  assert.deepEqual(sources.log[0], ["unlock"]);
  assert.deepEqual(audio.log[0], ["start", 0]);
  assert.equal(sources.log[1][0], "prepare");
  assert.equal(sources.log[1][2], "play");
  assert.equal(compositor.calls.length, 0, "play() の中では描かない（rAF の中で描く）");

  env.frames(6);
  assert.ok(compositor.calls.length >= 6, "rAF ごとに描く");
  assert.ok(tr.time > 0.05 && tr.time < 0.2, "時計が進む: " + tr.time);
  assert.ok(near(store.view.playhead, tr.time, 1e-3), "store.view.playhead も付いてくる");
  assert.ok(times.length >= 6);
  assert.equal(times[times.length - 1].playing, true);
  assert.ok("fps" in times[times.length - 1], "実測 fps を payload に載せる");
  assert.equal(times[times.length - 1].fps, 60, "60 枚/秒で回したら 60");
  assert.equal(compositor.calls[0].mode, "play");
  assert.equal(compositor.calls[0].quality, 1);

  /* pause で rAF も音も止まる */
  const states = [];
  tr.on("state", (s) => states.push(s));
  tr.pause();
  assert.equal(tr.playing, false);
  assert.equal(env.pending, 0, "rAF を取り消す");
  assert.ok(audio.log.some((x) => x[0] === "stop"));
  assert.ok(states.length >= 1 && states[states.length - 1].playing === false);
  const stopped = tr.time;
  env.frames(10);
  assert.equal(tr.time, stopped, "止めた後は進まない");
  tr.dispose();
});

test("音が鳴っていれば ctx.currentTime が主時計（ずれたら滑らかに寄る）", () => {
  const env = makeEnv();
  const audio = makeAudio({ ctx: 100 });
  const { tr } = makeTransport({ env, audio, dur: 10 });
  tr.play();
  /* 音は 壁時計より少し速く進む = 0.2 秒分のずれを作る */
  for (let i = 0; i < 60; i++) {
    audio.ctx.currentTime += 1 / 60;
    env.frame();
  }
  assert.ok(near(tr.time, 1, 0.01), "ずれが無ければ壁時計と同じ: " + tr.time);

  audio.ctx.currentTime += 0.3;                  // 音が飛んだ（decode の遅れ等）
  const before = tr.time;
  env.frame();
  assert.ok(tr.time - before < 0.1, "一気に飛ばさない（滑らかに寄せる）");
  for (let i = 0; i < 90; i++) { audio.ctx.currentTime += 1 / 60; env.frame(); }
  const media = audio.ctx.currentTime - 100;     // 音のメディア時刻
  assert.ok(Math.abs(media - tr.time) <= DRIFT_TOL + 1e-3, "最後は音に乗る: " + (media - tr.time));
  tr.dispose();
});

test("音が止まっていれば（ctx が suspended）壁時計で進む", () => {
  const env = makeEnv();
  const audio = makeAudio({ ctx: 0 });
  const { tr } = makeTransport({ env, audio, dur: 10 });
  tr.play();
  audio.ctx.state = "suspended";                 // ctx の時計は動かない
  env.frames(60);
  assert.ok(near(tr.time, 1, 0.02), "音に引きずられて止まらない: " + tr.time);
  tr.dispose();
});

test("ctx の時計が固まったら（Safari の suspend）壁時計へ戻る", () => {
  const env = makeEnv();
  const audio = makeAudio({ ctx: 10 });
  const { tr } = makeTransport({ env, audio, dur: 10 });
  tr.play();
  /* state は running のまま currentTime だけ止まる（一番厄介な壊れ方） */
  env.frames(30);
  assert.ok(tr.time > 0.3, "音に引きずられて固まらない: " + tr.time);
  const t0 = tr.time;
  env.frames(30);
  assert.ok(tr.time - t0 > 0.4, "その後も壁時計で進む: " + (tr.time - t0));
  tr.dispose();
});

test("設定の previewQuality を変えたら拾う", async () => {
  const { store, tr } = makeTransport({ dur: 10 });
  assert.equal(tr.quality, 1);
  store.replace(makeProject(10, { project: { settings: { previewQuality: "quarter" } } }), "画質");
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(tr.quality, 0.25);
  tr.dispose();
});

test("範囲（イン・アウト）のループは折り返し、ループ無しは end で止まる", () => {
  const { env, tr, audio } = makeTransport({ dur: 10 });
  tr.setRange(1, 1.5);
  tr.setLoop(true);
  tr.seek(1.4);
  tr.play();
  assert.ok(near(tr.time, 1.4, 1e-6));

  env.frames(12);                                 // 0.2 秒 = out を越える
  assert.ok(tr.time >= 1 && tr.time < 1.5, "範囲の中へ折り返す: " + tr.time);
  assert.equal(tr.playing, true, "ループ中は止まらない");
  assert.ok(audio.log.filter((x) => x[0] === "start").length >= 2, "折返しで音も打ち直す");

  /* ループを切ると out で終わる */
  const ends = [];
  tr.on("end", (e) => ends.push(e));
  tr.setLoop(false);
  tr.seek(1.45);
  if (!tr.playing) tr.play();
  env.frames(12);
  assert.equal(tr.playing, false, "終端で止まる");
  assert.equal(ends.length, 1);
  assert.equal(ends[0].at, "tail");
  assert.ok(near(ends[0].time, 1.5, 1e-6), "out 点で止める: " + ends[0].time);
  tr.dispose();
});

test("末尾まで行くと end を出して止まり、もう一度 play すると頭から", () => {
  const { env, tr } = makeTransport({ dur: 0.5 });
  const ends = [];
  tr.on("end", (e) => ends.push(e));
  tr.seek(0.45);
  tr.play();
  env.frames(10);
  assert.equal(tr.playing, false);
  assert.equal(ends.length, 1);
  assert.ok(near(tr.time, 0.5, 1e-6));

  tr.play();
  assert.equal(tr.playing, true);
  assert.ok(tr.time < 0.05, "終端で押したら頭から: " + tr.time);
  tr.dispose();
});

test("何も無いプロジェクトでは play しないで end を出す", () => {
  const store = createStore(newProject({ settings: { fps: 30 } }));
  const env = makeEnv();
  const ends = [];
  const tr = createTransport({
    store, compositor: makeCompositor(), sources: makeSources(), audio: null,
    now: env.now, raf: (f) => env.raf(f), caf: (i) => env.caf(i)
  });
  tr.on("end", (e) => ends.push(e));
  assert.equal(tr.play(), false);
  assert.equal(tr.playing, false);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].empty, true);
  tr.dispose();
});

test("stepFrame は fps 基準で 1 フレーム。再生中なら止めてから動く", () => {
  const { env, tr, store } = makeTransport({ dur: 10 });
  const f = frameDur(30);
  tr.seek(1);
  assert.ok(near(tr.stepFrame(1), 1 + f));
  assert.ok(near(tr.stepFrame(1), 1 + 2 * f));
  assert.ok(near(tr.stepFrame(-1), 1 + f));
  assert.ok(near(store.view.playhead, 1 + f));

  /* 端では止まる（負の時刻を作らない） */
  tr.seek(0);
  assert.equal(tr.stepFrame(-1), 0);

  tr.play();
  env.frames(3);
  tr.stepFrame(1);
  assert.equal(tr.playing, false, "コマ送りは再生を止める（NLE の作法）");
  assert.ok(near(tr.time, snapFrame(tr.time, 30)), "フレーム境界に乗る");
  tr.dispose();
});

test("seek(t,{scrub}) は quality を落として seekExact を使い、最後の値を必ず反映する", async () => {
  const { tr, sources, compositor } = makeTransport({ dur: 10 });
  tr.seek(2, { scrub: true });
  tr.seek(3, { scrub: true });
  tr.seek(4.5, { scrub: true });                  // 最後の値
  await new Promise((r) => setTimeout(r, 60));    // rafThrottle（Node では 16ms）
  await new Promise((r) => setTimeout(r, 60));

  const seeks = sources.log.filter((x) => x[0] === "seekExact");
  assert.ok(seeks.length >= 1, "scrub は seekExact を通る");
  assert.ok(compositor.calls.length >= 1);
  const last = compositor.calls[compositor.calls.length - 1];
  assert.ok(near(last.time, 4.5), "最後に擦った位置が出る: " + last.time);
  assert.equal(last.mode, "scrub");
  assert.equal(last.quality, 0.5, "擦っている間は画質を 1 段落とす");
  assert.ok(compositor.calls.length < 4, "1 フレーム 1 回に間引く: " + compositor.calls.length);
  tr.dispose();
});

test("setRate は 0.25〜4（負も）。0 は止める合図", () => {
  const { env, tr } = makeTransport({ dur: 20 });
  assert.equal(tr.rate, 1);
  assert.equal(tr.setRate(2), 2);
  tr.play();
  env.frames(30);                                 // 0.5 秒 × 2 倍
  assert.ok(near(tr.time, 1, 0.03), "2 倍で進む: " + tr.time);

  assert.equal(tr.setRate(99), RATE_MAX);
  assert.equal(tr.setRate(0.01), RATE_MIN);
  assert.equal(tr.setRate(0), RATE_MIN, "0 では rate を変えない");
  assert.equal(tr.playing, false, "0 は『止める』（K キー）");
  tr.dispose();
});

test("負の rate は逆再生（seekExact で戻る）。音は鳴らさない", () => {
  const { env, tr, sources, audio } = makeTransport({ dur: 10 });
  tr.seek(5);
  tr.setRate(-1);
  assert.equal(tr.rate, -1);
  tr.play();
  assert.ok(!audio.log.some((x) => x[0] === "start"), "逆再生では音を出さない（§4 に速度の口が無い）");
  env.frames(12);
  assert.ok(tr.time < 5 && tr.time > 4.5, "時刻が戻る: " + tr.time);
  assert.ok(sources.log.some((x) => x[0] === "seekExact"), "逆再生は seekExact 頼み（§13.6）");

  /* 先頭まで戻ると end（頭側） */
  const ends = [];
  tr.on("end", (e) => ends.push(e));
  tr.seek(0.02);
  if (!tr.playing) tr.play();
  env.frames(10);
  assert.equal(tr.playing, false);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].at, "head");
  assert.ok(near(ends[0].time, 0, 1e-6));
  tr.dispose();
});

test("playReverse は 負の rate にして再生を始める（ui/transport.js が探す口）", () => {
  const { tr, env } = makeTransport({ dur: 10 });
  tr.seek(4);
  assert.equal(tr.playReverse(), true);
  assert.equal(tr.rate, -1);
  assert.equal(tr.playing, true);
  env.frames(6);
  assert.ok(tr.time < 4);
  tr.dispose();
});

test("stop は止めてイン点へ戻す", () => {
  const { env, tr } = makeTransport({ dur: 10 });
  tr.setRange(2, 6);
  tr.seek(4);
  tr.play();
  env.frames(6);
  tr.stop();
  assert.equal(tr.playing, false);
  assert.ok(near(tr.time, 2), "イン点へ戻す: " + tr.time);

  tr.setRange(null, null);
  tr.seek(3);
  tr.stop();
  assert.equal(tr.time, 0, "イン点が無ければ先頭へ");
  tr.dispose();
});

test("setRange は逆さに渡されても正し、store.view にも出る", () => {
  const { tr, store } = makeTransport({ dur: 10 });
  assert.deepEqual(tr.setRange(5, 2), { in: 2, out: 5 });
  assert.equal(store.view.inPoint, 2);
  assert.equal(store.view.outPoint, 5);
  assert.deepEqual(tr.setRange(null, null), { in: null, out: null });
  assert.equal(store.view.inPoint, null);

  /* 画面側が view を直に動かした時も付いてくる（ui/timeline が先に setView する） */
  store.setView({ inPoint: 1, outPoint: 3 });
  assert.deepEqual(tr.range, { in: 1, out: 3 });
  tr.dispose();
});

test("落ちてきたら quality を下げる（auto のとき）", () => {
  const env = makeEnv();
  const store = createStore(makeProject(30));
  const sources = makeSources();
  /* 描画に 90ms かかる合成器（30fps の予算 33ms の 2.7 倍） */
  const compositor = {
    backend: "2d", calls: [],
    renderFrame(p, t, o) { this.calls.push(o && o.quality); env.advance(0.09); },
    resize() {}, dispose() {}
  };
  const tr = createTransport({
    store, compositor, sources, audio: null, fps: 30,
    now: env.now, raf: (f) => env.raf(f), caf: (i) => env.caf(i)
  });
  tr.play();
  assert.equal(tr.quality, 1);
  env.frames(20, 0.01);
  assert.equal(tr.quality, 0.5, "12 枚そろった所で 1 段下げる");
  env.frames(20, 0.01);
  assert.equal(tr.quality, 0.25, "まだ重ければもう 1 段");
  env.frames(20, 0.01);
  assert.equal(tr.quality, 0.25, "これ以上は下げない");
  assert.equal(compositor.calls[compositor.calls.length - 1], 0.25, "落とした画質で描く");
  tr.dispose();
});

test("previewQuality が auto 以外なら自動で動かさない", () => {
  const env = makeEnv();
  const store = createStore(makeProject(30, { project: { settings: { previewQuality: "half" } } }));
  const compositor = {
    backend: "2d", calls: [],
    renderFrame(p, t, o) { this.calls.push(o && o.quality); env.advance(0.09); },
    resize() {}, dispose() {}
  };
  const tr = createTransport({
    store, compositor, sources: makeSources(), audio: null, fps: 30,
    now: env.now, raf: (f) => env.raf(f), caf: (i) => env.caf(i)
  });
  assert.equal(tr.quality, 0.5, "設定の値から始まる");
  tr.play();
  env.frames(40, 0.01);
  assert.equal(tr.quality, 0.5, "重くても設定を勝手に変えない");
  tr.dispose();
});

test("再生中に project が変わったら素材と音を組み直す", async () => {
  const { env, store, sources, audio, tr } = makeTransport({ dur: 10 });
  tr.play();
  env.frames(6);
  const before = audio.log.filter((x) => x[0] === "start").length;

  store.replace(makeProject(8), "差し替え");
  await new Promise((r) => setTimeout(r, 40));    // rafThrottle 越し

  assert.ok(sources.log.some((x) => x[0] === "setProject"), "sources.setProject を通す");
  assert.ok(audio.log.some((x) => x[0] === "setProject"), "audio.setProject を通す");
  assert.ok(audio.log.filter((x) => x[0] === "start").length > before, "音は組み直す");
  assert.equal(tr.playing, true, "再生は続く");
  tr.dispose();
});

test("尺が縮んで今の位置が外に出たら中へ戻す", async () => {
  const { store, tr } = makeTransport({ dur: 10 });
  tr.seek(9);
  store.replace(makeProject(3), "短くした");
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(tr.time <= 3 + 1e-6, "尺の中へ: " + tr.time);
  tr.dispose();
});

test("on は time/state/end だけ。返り値で解除できる", () => {
  const { env, tr } = makeTransport({ dur: 10 });
  let n = 0;
  const off = tr.on("time", () => { n++; });
  assert.equal(typeof off, "function");
  tr.play();
  env.frames(3);
  const got = n;
  assert.ok(got >= 3);
  off();
  env.frames(3);
  assert.equal(n, got, "解除したら来ない");

  const noop = tr.on("そんな物", () => {});
  assert.equal(typeof noop, "function");
  assert.doesNotThrow(() => noop());
  assert.equal(typeof tr.on("time", null), "function", "関数でなければ黙って空振り");
  tr.dispose();
});

test("購読者が投げても再生は止まらない", () => {
  const { env, tr } = makeTransport({ dur: 10 });
  tr.on("time", () => { throw new Error("わざと"); });
  tr.play();
  assert.doesNotThrow(() => env.frames(5));
  assert.equal(tr.playing, true);
  assert.ok(tr.time > 0);
  tr.dispose();
});

test("dispose は rAF・購読・音を止め、二度呼んでも平気", () => {
  const { env, store, tr, audio, sources } = makeTransport({ dur: 10 });
  let times = 0;
  tr.on("time", () => { times++; });
  tr.play();
  env.frames(4);
  const seen = times;

  assert.equal(tr.dispose(), true);
  assert.equal(tr.disposed, true);
  assert.equal(tr.playing, false);
  assert.equal(env.pending, 0, "rAF を残さない");
  assert.ok(audio.log.some((x) => x[0] === "stop"), "音は必ず止める");
  assert.ok(!sources.log.some((x) => x[0] === "dispose"), "借り物（sources）は壊さない");

  env.frames(5);
  assert.equal(times, seen, "dispose 後は知らせない");

  /* dispose 後の操作は黙って何もしない */
  assert.equal(tr.play(), false);
  assert.equal(tr.pause(), false);
  assert.equal(tr.playing, false);
  assert.doesNotThrow(() => tr.seek(3));
  assert.doesNotThrow(() => tr.stepFrame(1));
  assert.doesNotThrow(() => tr.setRate(2));
  assert.doesNotThrow(() => tr.setLoop(true));
  assert.doesNotThrow(() => tr.setRange(1, 2));
  assert.doesNotThrow(() => store.setView({ playhead: 5 }));  // 購読を外してある
  assert.equal(tr.dispose(), true, "二重 dispose に耐える");
});

test("compositor / sources / audio が無くても時刻は動く（部品が未着でも画面を殺さない）", () => {
  const env = makeEnv();
  const store = createStore(makeProject(10));
  const tr = createTransport({
    store, compositor: null, sources: null, audio: null, fps: 30,
    now: env.now, raf: (f) => env.raf(f), caf: (i) => env.caf(i)
  });
  tr.play();
  env.frames(30);
  assert.ok(near(tr.time, 0.5, 0.03), "時計だけは進む: " + tr.time);
  assert.ok(near(store.view.playhead, tr.time, 1e-3));
  assert.deepEqual(tr.stats().range, { in: null, out: null });
  tr.dispose();
});

test("起こした時に store.view を取り込む（開き直しの復元）", () => {
  const env = makeEnv();
  const store = createStore(makeProject(10));
  store.setView({ playhead: 3, inPoint: 2, outPoint: 6 });
  const tr = createTransport({
    store, compositor: makeCompositor(), sources: makeSources(), audio: null, fps: 30,
    now: env.now, raf: (f) => env.raf(f), caf: (i) => env.caf(i)
  });
  assert.ok(near(tr.time, 3));
  assert.deepEqual(tr.range, { in: 2, out: 6 });
  tr.dispose();
});
