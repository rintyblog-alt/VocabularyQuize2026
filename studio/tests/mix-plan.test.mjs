/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/mix-plan.test.mjs — 書き出し用の音（engine/audio/mix.js）の
   純関数の試験

   ★ 何を固定するか（ここが崩れると「書き出した音がプレビューと違う」に直結する）
     ① planAudioEvents … 音の予定表
        速度（定数・ランプの刻み）/ 逆再生（offset は逆にした buffer の座標）/
        範囲の切り出し（頭の欠けは offset へ回す）/ フェードとキーの曲線 /
        eval.audioAt と同じ取捨（adjust・muted・solo・muteAudio・hidden）/
        素材を使い切ったら そこで切る（rate を嘘にしない）
     ② planDucking / duckGainAt … 声の所で BGM を下げる形
        （引き金の頭では下がり切っている・自分では下がらない・印の無い物は下げない）
     ③ wavBytes … RIFF/WAVE/fmt/data のバイト位置と長さ・16bit の値域
        （-1 → -32768 / +1 → +32767 / 溢れは張り付く）・8/24/32bit
     ④ planChunks … 長尺の区間分割（10 分以下は割らない・2 つ目以降に 5ms の
        助走・短すぎる切れ端は前に足す）
     ⑤ 曲線の小道具（curveAt / mulCurves / collapseCurve）と limiterCurve
     ⑥ 契約書 §4 の口が全部在ること（renderMixdown / audioBufferToWav …）

   ★ 走らせ方
     cd /home/user/VocabularyQuize2026/studio && npm test
     cd /home/user/VocabularyQuize2026 && node --test studio/tests/mix-plan.test.mjs
     （OfflineAudioContext は Node に無いので renderMixdown 自体は
      studio/selftest.html の担当。ここは「鳴らす前の計画」を見る）
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  planAudioEvents, planAudioMix, planClipEvents, planChunks,
  planDucking, duckGainAt, buildGainCurve, buildPanCurve, resolveMixRange,
  wavBytes, audioBufferToWav, limiterCurve, reverseChannels,
  curveAt, mulCurves, collapseCurve, collectAssetIds, startOffsetFor,
  markerFx, soundFxOf, clipHasAudio, renderMixdown,
  BGM_FX_TYPE, DUCK_FX_TYPE, PITCH_FX_TYPE, DUCK_DEFAULTS,
  XFADE, CHUNK_SEC, SPLIT_ABOVE, WAV_HEADER_SIZE,
  LIMITER_CEILING, LIMITER_DRIVE, DEFAULT_SAMPLE_RATE
} from "../src/engine/audio/mix.js";

/* ── 試験用の小道具 ───────────────────────────────────────────── */

/** 音の素材 1 つ */
const A = (id, duration, extra) => Object.assign({
  id, kind: "audio", name: id, mime: "audio/mp4", size: 1024,
  duration, width: 0, height: 0, hasAudio: true,
  storage: { kind: "idb", key: "blob_" + id }, createdAt: 0, analysis: null
}, extra || {});

/** 音のクリップ 1 つ（既定は 0〜4 秒・素材の 0〜4 秒・等倍） */
const C = (o) => Object.assign({
  id: "cl", name: "", assetId: "a1", kind: "audio",
  start: 0, duration: 4, in: 0, out: 4, speed: 1, reverse: false, speedRamp: null,
  volume: 1, pan: 0, muteAudio: false,
  audioFade: { in: 0, out: 0, curve: "linear" },
  fx: [], keys: {}, hidden: false, locked: false
}, o || {});

/** トラック 1 つ */
const T = (o) => Object.assign({
  id: "tr1", kind: "audio", name: "A1", height: 72,
  muted: false, locked: false, hidden: false, solo: false,
  volume: 1, pan: 0, fx: [], clips: []
}, o || {});

/** project 1 つ */
const P = (tracks, assets) => ({
  schema: 3, id: "prj_t", name: "試験",
  createdAt: 0, updatedAt: 0,
  settings: {
    width: 1920, height: 1080, fps: 30, ratio: "16:9", sampleRate: 48000,
    audio: { master: 1, limiter: true }
  },
  assets: assets || [A("a1", 30)],
  tracks, markers: [], chapters: [], subtitleStyle: null, meta: {}
});

/** 1 本だけの project（よく使う形） */
const one = (clip, trackPatch, assets) =>
  P([T(Object.assign({ clips: [C(clip)] }, trackPatch || {}))], assets);

/** 曲線を [[t,v],…] に（読みやすさのため） */
const pairs = (curve) => curve.map((p) => [p.t, p.v]);
const ids = (events) => events.map((e) => e.clipId);

/* ══ ① planAudioEvents ═════════════════════════════════════════ */

test("planAudioEvents: 等倍のクリップ 1 本は event 1 つ（契約の枝が全部在る）", () => {
  const ev = planAudioEvents(one({}));
  assert.equal(ev.length, 1);
  const e = ev[0];
  /* 契約書 §4 / 担当指示が名前で要求している枝 */
  for (const k of ["clipId", "assetId", "when", "offset", "duration", "rate",
    "reverse", "gainCurve", "pan", "trackId"]) {
    assert.ok(k in e, `${k} が無い`);
  }
  assert.equal(e.clipId, "cl");
  assert.equal(e.assetId, "a1");
  assert.equal(e.trackId, "tr1");
  assert.equal(e.trackIndex, 0);
  assert.equal(e.when, 0);
  assert.equal(e.duration, 4);
  assert.equal(e.offset, 0);
  assert.equal(e.rate, 1);
  assert.equal(e.reverse, false);
  assert.equal(e.pan, 0);
  assert.equal(e.sourceIn, 0);
  assert.equal(e.sourceOut, 4);
  assert.equal(e.sourceDuration, 4);
  assert.equal(e.segCount, 1);
  assert.deepEqual(pairs(e.gainCurve), [[0, 1], [4, 1]]);
});

test("planAudioEvents: in 点は offset に出る（when はタイムライン側）", () => {
  const ev = planAudioEvents(one({ start: 2, duration: 3, in: 5, out: 8 }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].when, 2);
  assert.equal(ev[0].offset, 5);
  assert.equal(ev[0].duration, 3);
  assert.equal(ev[0].timelineStart, 2);
});

test("planAudioEvents: 速度 2 倍 — duration は出力秒・rate は倍率", () => {
  const ev = planAudioEvents(one({ duration: 2, in: 0, out: 4, speed: 2 }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].duration, 2);          // 出力側の秒
  assert.equal(ev[0].sourceDuration, 4);    // 素材側の秒
  assert.equal(ev[0].rate, 2);
  assert.equal(ev[0].offset, 0);
});

test("planAudioEvents: 速度 0.5 倍 — 素材を半分だけ使って倍の長さ", () => {
  const ev = planAudioEvents(one({ duration: 4, in: 0, out: 2, speed: 0.5 }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].rate, 0.5);
  assert.equal(ev[0].sourceOut, 2);
  assert.equal(ev[0].duration, 4);
});

test("planAudioEvents: 速度ランプは折れ点と刻みで event に割れる（∫v dt が合う）", () => {
  const ev = planAudioEvents(one({
    duration: 4, in: 0, out: 4, speed: 1, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 2 }]
  }));
  assert.ok(ev.length > 1, "ランプは 1 本では追えないので割れているはず");
  /* 区間は隙間なく続き、素材側も切れ目なく続く */
  for (let i = 1; i < ev.length; i++) {
    assert.ok(Math.abs((ev[i - 1].when + ev[i - 1].duration) - ev[i].when) < 1e-6, "出力側に隙間");
    assert.ok(Math.abs(ev[i - 1].sourceOut - ev[i].sourceIn) < 1e-6, "素材側に隙間");
  }
  assert.equal(ev[0].when, 0);
  assert.equal(ev[0].sourceIn, 0);
  /* 各区間の rate は「素材秒 / 出力秒」（= その区間の平均倍率） */
  for (const e of ev) {
    assert.ok(Math.abs(e.rate - e.sourceDuration / e.duration) < 1e-6);
    assert.ok(e.rate >= 1 - 1e-9 && e.rate <= 2 + 1e-9, `rate が範囲外: ${e.rate}`);
  }
  /* ランプの区間は automation 用の曲線も付く（端の倍率） */
  assert.deepEqual(pairs(ev[0].rateCurve), [[0, 1], [0.5, 1.25]]);
  /* ∫v dt = 3（0→2 秒で 1→2 倍）なので t=2 での素材位置は 3 */
  const at2 = ev.find((e) => Math.abs(e.when - 2) < 1e-6);
  assert.ok(at2, "t=2 で始まる区間が在るはず");
  assert.equal(at2.sourceIn, 3);
  assert.equal(at2.rate, 2);               // ランプの後は定数 2 倍
  assert.equal(at2.rateCurve, null);
});

test("planAudioEvents: 素材を使い切ったらそこで切る（rate を嘘にしない）", () => {
  /* 8 秒のクリップだが素材は 4 秒しか無い → 前半 4 秒だけ鳴る */
  const ev = planAudioEvents(one({ duration: 8, in: 0, out: 4, speed: 1 }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].duration, 4);
  assert.equal(ev[0].rate, 1);
  assert.equal(ev[0].sourceOut, 4);
});

test("planAudioEvents: 逆再生 — offset は「逆にした buffer」の座標", () => {
  const ev = planAudioEvents(one({ duration: 2, in: 1, out: 3, reverse: true }), );
  assert.equal(ev.length, 1);
  const e = ev[0];
  assert.equal(e.reverse, true);
  assert.equal(e.sourceIn, 1);
  assert.equal(e.sourceOut, 3);
  assert.equal(e.assetDuration, 30);
  /* 素材 30 秒を逆にした buffer では、素材の 3 秒目が頭から 27 秒目 */
  assert.equal(e.offset, 27);
  assert.equal(e.rate, 1);
});

test("planAudioEvents: 逆再生 + 速度 — 出力の頭は素材の out 側", () => {
  const ev = planAudioEvents(one({ duration: 1, in: 0, out: 2, speed: 2, reverse: true }),);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].rate, 2);
  assert.equal(ev[0].sourceIn, 0);
  assert.equal(ev[0].sourceOut, 2);
  assert.equal(ev[0].offset, 30 - 2);
});

test("startOffsetFor: buffer の実長が asset.duration とずれても逆再生が合う", () => {
  const e = { reverse: true, offset: 27, assetDuration: 30 };
  assert.equal(startOffsetFor(e, { duration: 30 }), 27);
  assert.ok(Math.abs(startOffsetFor(e, { duration: 30.02 }) - 27.02) < 1e-9);
  /* 順再生は素材の秒そのままなので寄せ直さない */
  assert.equal(startOffsetFor({ reverse: false, offset: 5, assetDuration: 30 }, { duration: 31 }), 5);
});

test("planAudioEvents: 範囲の切り出し — 欠けた頭は offset に回る", () => {
  const p = one({ start: 0, duration: 10, in: 0, out: 10 });
  const ev = planAudioEvents(p, { range: { start: 3, end: 6 } });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].when, 0);           // 範囲の頭が 0
  assert.equal(ev[0].timelineStart, 3);  // 絶対のタイムライン秒
  assert.equal(ev[0].offset, 3);
  assert.equal(ev[0].duration, 3);
  assert.equal(ev[0].sourceIn, 3);
  assert.equal(ev[0].sourceOut, 6);
});

test("planAudioEvents: 範囲の切り出し — 速度が掛かっていても素材位置が合う", () => {
  const p = one({ start: 0, duration: 5, in: 0, out: 10, speed: 2 });
  const ev = planAudioEvents(p, { range: { start: 1, end: 3 } });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].when, 0);
  assert.equal(ev[0].offset, 2);        // 1 秒 × 2 倍
  assert.equal(ev[0].duration, 2);
  assert.equal(ev[0].sourceDuration, 4);
});

test("planAudioEvents: 範囲の外のクリップは出ない・跨ぐ物は切られる", () => {
  const p = P([T({
    clips: [
      C({ id: "before", start: 0, duration: 2, in: 0, out: 2 }),
      C({ id: "cross", start: 2, duration: 4, in: 0, out: 4 }),
      C({ id: "after", start: 8, duration: 2, in: 0, out: 2 })
    ]
  })]);
  const ev = planAudioEvents(p, { range: { start: 4, end: 7 } });
  assert.deepEqual(ids(ev), ["cross"]);
  assert.equal(ev[0].when, 0);
  assert.equal(ev[0].duration, 2);       // 4〜6 秒ぶんだけ
  assert.equal(ev[0].offset, 2);
});

test("planAudioEvents: フェードの曲線（linear は 2 本の直線で表せる）", () => {
  const ev = planAudioEvents(one({ audioFade: { in: 1, out: 1, curve: "linear" } }));
  assert.deepEqual(pairs(ev[0].gainCurve), [[0, 0], [1, 1], [3, 1], [4, 0]]);
});

test("planAudioEvents: フェードの曲線（exp は曲がるので点が増える・単調）", () => {
  const ev = planAudioEvents(one({ audioFade: { in: 2, out: 0, curve: "exp" } }));
  const g = ev[0].gainCurve;
  assert.ok(g.length > 4, "曲線なら 2 点では表せない");
  assert.equal(g[0].t, 0);
  assert.equal(g[0].v, 0);
  assert.equal(g[g.length - 1].v, 1);
  /* exp は u² … 半分の所で 1/4 */
  assert.ok(Math.abs(curveAt(g, 1) - 0.25) < 0.02, `半分で 0.25 のはず: ${curveAt(g, 1)}`);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].v >= g[i - 1].v - 1e-9, "単調に上がる");
});

test("planAudioEvents: フェードの曲線（log は素早く立ち上がる = √u）", () => {
  const ev = planAudioEvents(one({ audioFade: { in: 2, out: 0, curve: "log" } }));
  const g = ev[0].gainCurve;
  assert.ok(Math.abs(curveAt(g, 1) - Math.SQRT1_2) < 0.02, `半分で 0.707 のはず: ${curveAt(g, 1)}`);
});

test("planAudioEvents: 音量はトラック音量込み・キーフレームも曲線になる", () => {
  const p = one(
    { volume: 1, keys: { volume: [{ t: 0, v: 1, ease: "linear" }, { t: 4, v: 0 }] } },
    { volume: 0.5 }
  );
  const g = planAudioEvents(p)[0].gainCurve;
  /* 直線なので 2 点。トラックの 0.5 が掛かっている（二重掛け禁止の印） */
  assert.deepEqual(pairs(g), [[0, 0.5], [4, 0]]);
});

test("planAudioEvents: ease:\"hold\" の段差は潰れない", () => {
  const p = one({ keys: { volume: [{ t: 0, v: 1, ease: "hold" }, { t: 2, v: 0.25, ease: "linear" }, { t: 4, v: 1 }] } });
  const g = planAudioEvents(p)[0].gainCurve;
  assert.ok(Math.abs(curveAt(g, 1.9) - 1) < 1e-3, "段差の手前は 1 のまま");
  assert.ok(Math.abs(curveAt(g, 2) - 0.25) < 1e-3, "段差の所で落ちる");
  assert.ok(Math.abs(curveAt(g, 3) - 0.625) < 1e-2, "その後は線形");
});

test("planAudioEvents: pan はトラックのパン込み・キーが在れば panCurve が付く", () => {
  const flat = planAudioEvents(one({ pan: 0.5 }, { pan: 0.25 }))[0];
  assert.equal(flat.pan, 0.75);
  assert.equal(flat.panCurve, null);
  const keyed = planAudioEvents(one({ keys: { pan: [{ t: 0, v: -1 }, { t: 4, v: 1 }] } }))[0];
  assert.equal(keyed.pan, -1);
  assert.deepEqual(pairs(keyed.panCurve), [[0, -1], [4, 1]]);
});

test("planAudioEvents: eval.audioAt と同じ取捨（adjust・muted・muteAudio・hidden）", () => {
  const p = P([
    T({ id: "adj", kind: "adjust", clips: [C({ id: "a", kind: "adjust", assetId: null })] }),
    T({ id: "mut", muted: true, clips: [C({ id: "b" })] }),
    T({ id: "ok", clips: [C({ id: "c", muteAudio: true }), C({ id: "d", start: 4, hidden: true })] })
  ]);
  /* adjust トラックは鳴らない / muted トラックは落ちる / muteAudio も落ちる
     / hidden は **落とさない**（目を閉じただけで音は消さない） */
  assert.deepEqual(ids(planAudioEvents(p)), ["d"]);
});

test("planAudioEvents: solo が立っていたら solo のトラックだけ", () => {
  const p = P([
    T({ id: "t1", clips: [C({ id: "x" })] }),
    T({ id: "t2", solo: true, clips: [C({ id: "y" })] })
  ]);
  assert.deepEqual(ids(planAudioEvents(p)), ["y"]);
});

test("planAudioEvents: 音を持たない物は出ない（画像・文字・音無し映像）", () => {
  const p = P([
    T({ id: "v", kind: "video", clips: [C({ id: "silent", kind: "video", assetId: "v1" })] }),
    T({ id: "o", kind: "overlay", clips: [C({ id: "text", kind: "text", assetId: null })] })
  ], [A("a1", 30), Object.assign(A("v1", 30), { kind: "video", hasAudio: false })]);
  assert.deepEqual(ids(planAudioEvents(p)), []);
  /* 音を持つ映像は出る */
  const p2 = P([T({ id: "v", kind: "video", clips: [C({ id: "talk", kind: "video", assetId: "v2" })] })],
    [Object.assign(A("v2", 30), { kind: "video", hasAudio: true })]);
  assert.deepEqual(ids(planAudioEvents(p2)), ["talk"]);
});

test("planAudioEvents: audioTracks / excludeAudioTracks（BGM 抜き・特定トラックのみ）", () => {
  const p = P([
    T({ id: "t1", clips: [C({ id: "x" })] }),
    T({ id: "t2", clips: [C({ id: "y" })] })
  ]);
  assert.deepEqual(ids(planAudioEvents(p)), ["x", "y"]);
  assert.deepEqual(ids(planAudioEvents(p, { audioTracks: ["t1"] })), ["x"]);
  assert.deepEqual(ids(planAudioEvents(p, { excludeAudioTracks: ["t1"] })), ["y"]);
});

test("planAudioEvents: 並びは when 昇順（同時ならトラックの下から）", () => {
  const p = P([
    T({ id: "t1", clips: [C({ id: "late", start: 5, duration: 1, out: 1 })] }),
    T({ id: "t2", clips: [C({ id: "early", start: 0, duration: 1, out: 1 }), C({ id: "mid", start: 2, duration: 1, out: 1 })] })
  ]);
  assert.deepEqual(ids(planAudioEvents(p)), ["early", "mid", "late"]);
});

test("planAudioMix: 読めない物は警告にして続ける（黙って落とさない）", () => {
  const miss = planAudioMix(P([T({ clips: [C({ assetId: "nope" })] })], []));
  assert.equal(miss.events.length, 0);
  assert.equal(miss.warnings.length, 1);
  assert.match(miss.warnings[0], /素材/);

  const empty = planAudioMix(one({ in: 2, out: 2 }));
  assert.equal(empty.events.length, 0);
  assert.match(empty.warnings[0], /範囲が空/);

  const noAsset = planAudioMix(P([T({ clips: [C({ kind: "audio", assetId: null })] })]));
  assert.equal(noAsset.events.length, 0);
});

test("planAudioMix: pitchPreserve は未実装として申告する（穴を隠さない）", () => {
  const p = one({ speed: 2, duration: 2, fx: [{ id: "f", type: PITCH_FX_TYPE, enabled: true, params: {} }] });
  const r = planAudioMix(p);
  assert.equal(r.events[0].pitchPreserve, true);
  assert.equal(r.events[0].fx.length, 0);      // 印は効果の鎖に流さない
  assert.equal(r.holes.length, 1);
  assert.match(r.holes[0], /高さ/);
});

test("planAudioEvents: 入れ子（compound）の中の音も出る（定数速度）", () => {
  const inner = T({ id: "in1", clips: [C({ id: "inner", start: 0, duration: 4, in: 0, out: 4 })] });
  const p = P([T({
    id: "tr1", kind: "video",
    clips: [C({
      id: "cp", kind: "compound", assetId: null, start: 1, duration: 2,
      in: 0, out: 4, speed: 2, compound: { tracks: [inner] }
    })]
  })]);
  const r = planAudioMix(p);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].clipId, "inner");
  assert.equal(r.events[0].compoundId, "cp");
  assert.equal(r.events[0].when, 1);
  assert.equal(r.events[0].duration, 2);
  assert.equal(r.events[0].rate, 2);           // 外側の 2 倍が掛かる
  assert.equal(r.events[0].trackId, "tr1");    // 外側のトラックに繋ぐ
});

test("planAudioEvents: 入れ子の速度ランプ・逆再生は警告して音を入れない", () => {
  const inner = T({ id: "in1", clips: [C({ id: "inner", duration: 4, out: 4 })] });
  const p = P([T({
    kind: "video",
    clips: [C({
      id: "cp", kind: "compound", assetId: null, duration: 4, in: 0, out: 4,
      reverse: true, compound: { tracks: [inner] }
    })]
  })]);
  const r = planAudioMix(p);
  assert.equal(r.events.length, 0);
  assert.match(r.warnings[0], /入れ子/);
});

test("planClipEvents: clip 単体でも呼べる（純関数・track 無しでも落ちない）", () => {
  const ev = planClipEvents(C({ duration: 2, out: 2 }), {
    range: { start: 0, end: 2 }, asset: A("a1", 10)
  });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].trackId, "");
  assert.equal(ev[0].trackIndex, -1);
  assert.deepEqual(pairs(ev[0].gainCurve), [[0, 1], [2, 1]]);
  /* 変な入力でも throw しない（毎フレームの所ではないが、書き出しを止めない） */
  assert.deepEqual(planClipEvents(null, { range: { start: 0, end: 1 } }), []);
  assert.deepEqual(planClipEvents(C({ duration: 0 }), { range: { start: 0, end: 1 } }), []);
});

test("collectAssetIds: 重なりを畳んで decode の支度に使える", () => {
  const p = P([T({
    clips: [C({ id: "x", assetId: "a1", duration: 2, out: 2 }), C({ id: "y", assetId: "a2", start: 2, duration: 2, out: 2 })]
  })], [A("a1", 10), A("a2", 10)]);
  assert.deepEqual(collectAssetIds(planAudioEvents(p)), ["a1", "a2"]);
  assert.deepEqual(collectAssetIds(null), []);
});

/* ══ ② ダッキング ═══════════════════════════════════════════════ */

const duckProject = () => P([
  T({
    id: "music", clips: [C({
      id: "bgm", duration: 10, out: 10, volume: 0.5,
      fx: [{ id: "f1", type: BGM_FX_TYPE, enabled: true, params: { duck: true } }]
    })]
  }),
  T({
    id: "voice", clips: [C({
      id: "talk", assetId: "a2", start: 3, duration: 2, out: 2,
      fx: [{ id: "f2", type: DUCK_FX_TYPE, enabled: true, params: { amount: 0.6, attack: 0.5, release: 1 } }]
    })]
  })
], [A("a1", 30), A("a2", 30)]);

test("planDucking: 引き金（duckSource）と対象（bgm）を拾う", () => {
  const d = planDucking(duckProject());
  assert.equal(d.has, true);
  assert.deepEqual(d.targets, ["bgm"]);
  assert.equal(d.sources.length, 1);
  assert.deepEqual(d.sources[0], {
    clipId: "talk", trackId: "voice", start: 3, end: 5,
    amount: 0.6, attack: 0.5, release: 1
  });
});

test("planDucking: 印が無ければ何も起きない（既定で音を変えない）", () => {
  const d = planDucking(one({}));
  assert.equal(d.has, false);
  assert.equal(d.implicit, false);
  assert.equal(d.sources.length, 0);
  assert.equal(duckGainAt(d, 1, "cl"), 1);
});

test("planDucking: bgm の印だけでも下がる（graph.js の生ダッキングと同じ形）", () => {
  /* ui/library.js は音の取り込み時に bgm{duck:true} を積むだけ。
     これで再生（graph.js）は下げるので、書き出しも下げないと食い違う。 */
  const p = P([
    T({
      id: "music", clips: [C({
        id: "bgm", duration: 12, out: 12, volume: 0.8,
        fx: [{ id: "m", type: BGM_FX_TYPE, enabled: true, params: { duck: true, amount: 0.5, attack: 0.2, release: 0.5 } }]
      })]
    }),
    T({
      id: "voice", clips: [
        C({ id: "v1", assetId: "a2", start: 2, duration: 2, out: 2 }),
        C({ id: "v2", assetId: "a2", start: 4.2, duration: 2, out: 2 }),   // 近いので 1 つに畳まれる
        C({ id: "v3", assetId: "a2", start: 9, duration: 1, out: 1 })
      ]
    })
  ], [A("a1", 30), A("a2", 30)]);
  const d = planDucking(p);
  assert.equal(d.has, true);
  assert.equal(d.implicit, true);
  assert.deepEqual(d.targets, ["bgm"]);
  assert.deepEqual(d.targetTracks, ["music"]);
  /* 隣り合う声は attack+release 以内の隙間なので繋がる */
  assert.deepEqual(d.sources.map((x) => [x.start, x.end]), [[2, 6.2], [9, 10]]);
  assert.equal(d.sources[0].amount, 0.5);
  /* BGM だけが下がる（声は下がらない） */
  assert.ok(Math.abs(duckGainAt(d, 3, "bgm") - 0.5) < 1e-6);
  assert.equal(duckGainAt(d, 3, "v1"), 1);
  assert.equal(duckGainAt(d, 7, "bgm"), 1);
  /* gainCurve に焼き込まれる（volume 0.8 × 0.5） */
  const bgm = planAudioEvents(p).find((e) => e.clipId === "bgm");
  assert.ok(Math.abs(curveAt(bgm.gainCurve, 3) - 0.4) < 1e-6);
  assert.ok(Math.abs(curveAt(bgm.gainCurve, 7) - 0.8) < 1e-6);
});

test("planDucking: duckSource が在るときは そちらだけを引き金にする", () => {
  const p = P([
    T({ id: "music", clips: [C({ id: "bgm", duration: 12, out: 12, fx: [{ id: "m", type: BGM_FX_TYPE, enabled: true, params: { duck: true } }] })] }),
    T({ id: "voice", clips: [
      C({ id: "v1", assetId: "a2", start: 1, duration: 1, out: 1 }),
      C({ id: "v2", assetId: "a2", start: 6, duration: 1, out: 1, fx: [{ id: "s", type: DUCK_FX_TYPE, enabled: true, params: { amount: 0.9, attack: 0.1, release: 0.1 } }] })
    ] })
  ], [A("a1", 30), A("a2", 30)]);
  const d = planDucking(p);
  assert.equal(d.implicit, false);
  assert.deepEqual(d.sources.map((x) => x.clipId), ["v2"]);
  assert.equal(duckGainAt(d, 1.5, "bgm"), 1);         // 印の無い声では下がらない
  assert.ok(Math.abs(duckGainAt(d, 6.5, "bgm") - 0.1) < 1e-6);
});

test("planDucking: BGM のトラックの中の音は自分を下げる引き金にならない", () => {
  const p = P([T({
    id: "music", clips: [
      C({ id: "bgm", duration: 6, out: 6, fx: [{ id: "m", type: BGM_FX_TYPE, enabled: true, params: { duck: true } }] }),
      C({ id: "bgm2", start: 6, duration: 4, out: 4 })
    ]
  })]);
  const d = planDucking(p);
  assert.equal(d.has, false);
  assert.equal(d.sources.length, 0);
});

test("planDucking: params を省いたら ai/tools.js と同じ既定値", () => {
  const p = P([
    T({ id: "m", clips: [C({ id: "bgm", fx: [{ id: "f", type: BGM_FX_TYPE, enabled: true, params: {} }] })] }),
    T({ id: "v", clips: [C({ id: "talk", fx: [{ id: "g", type: DUCK_FX_TYPE, enabled: true, params: {} }] })] })
  ]);
  const d = planDucking(p);
  assert.equal(d.sources[0].amount, DUCK_DEFAULTS.amount);
  assert.equal(d.sources[0].attack, DUCK_DEFAULTS.attack);
  assert.equal(d.sources[0].release, DUCK_DEFAULTS.release);
});

test("duckGainAt: 引き金の頭では下がり切っている（声の頭が埋もれない）", () => {
  const d = planDucking(duckProject());
  const g = (t) => duckGainAt(d, t, "bgm");
  assert.equal(g(0), 1);
  assert.equal(g(2.5), 1);            // attack の始まり
  assert.ok(Math.abs(g(2.75) - 0.7) < 1e-6);
  assert.ok(Math.abs(g(3) - 0.4) < 1e-6);   // 声の頭で 1-0.6
  assert.ok(Math.abs(g(4) - 0.4) < 1e-6);
  assert.ok(Math.abs(g(5) - 0.4) < 1e-6);
  assert.ok(Math.abs(g(5.5) - 0.7) < 1e-6); // release の途中
  assert.equal(g(6), 1);
  assert.equal(g(9), 1);
});

test("duckGainAt: 自分では下がらない・印の無いクリップも下がらない", () => {
  const d = planDucking(duckProject());
  assert.equal(duckGainAt(d, 4, "talk"), 1);
  assert.equal(duckGainAt(d, 4, "zzz"), 1);
  /* clipId を渡さなければ「素の下げ量」（graph.js が自前で判断する道） */
  assert.ok(Math.abs(duckGainAt(d, 4) - 0.4) < 1e-6);
});

test("duckGainAt: 重なったら いちばん深い物を採る", () => {
  const d = {
    targets: ["bgm"],
    sources: [
      { clipId: "s1", start: 0, end: 4, amount: 0.3, attack: 0.1, release: 0.1 },
      { clipId: "s2", start: 2, end: 6, amount: 0.8, attack: 0.1, release: 0.1 }
    ]
  };
  assert.ok(Math.abs(duckGainAt(d, 1, "bgm") - 0.7) < 1e-6);
  assert.ok(Math.abs(duckGainAt(d, 3, "bgm") - 0.2) < 1e-6);
  assert.ok(Math.abs(duckGainAt(d, 5, "bgm") - 0.2) < 1e-6);
});

test("planAudioEvents: ダッキングは gainCurve に焼き込まれる（音量と掛け算）", () => {
  const ev = planAudioEvents(duckProject());
  const bgm = ev.find((e) => e.clipId === "bgm");
  const talk = ev.find((e) => e.clipId === "talk");
  assert.ok(bgm && talk);
  /* BGM は volume 0.5 × duck */
  assert.ok(Math.abs(curveAt(bgm.gainCurve, 0) - 0.5) < 1e-6);
  assert.ok(Math.abs(curveAt(bgm.gainCurve, 4) - 0.2) < 1e-6);
  assert.ok(Math.abs(curveAt(bgm.gainCurve, 7) - 0.5) < 1e-6);
  /* 声そのものは下がらない */
  assert.deepEqual(pairs(talk.gainCurve), [[0, 1], [2, 1]]);
});

test("buildGainCurve: from/to を切っても値は同じ（区間の切り出しがずれない）", () => {
  const clip = C({ duration: 10, out: 10, audioFade: { in: 2, out: 2, curve: "linear" } });
  const whole = buildGainCurve({ clip, track: T({}), from: 0, to: 10 });
  const part = buildGainCurve({ clip, track: T({}), from: 4, to: 6 });
  assert.ok(Math.abs(curveAt(part, 0) - curveAt(whole, 4)) < 1e-6);
  assert.ok(Math.abs(curveAt(part, 2) - curveAt(whole, 6)) < 1e-6);
  assert.equal(part[0].t, 0);
  assert.equal(part[part.length - 1].t, 2);
});

test("buildPanCurve: キーが無ければ null（毎回 曲線を作らない）", () => {
  assert.equal(buildPanCurve({ clip: C({ pan: 0.5 }), track: T({}), from: 0, to: 4 }), null);
});

/* ══ ③ wavBytes / audioBufferToWav ═════════════════════════════ */

/** ASCII を読む小道具 */
const tag = (dv, at) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));

test("wavBytes: RIFF / WAVE / fmt / data のバイト位置と長さ（16bit ステレオ）", () => {
  const n = 5;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const ab = wavBytes([L, R], 48000, 16);
  const dv = new DataView(ab);
  assert.equal(WAV_HEADER_SIZE, 44);
  assert.equal(ab.byteLength, 44 + n * 2 * 2);
  assert.equal(tag(dv, 0), "RIFF");
  assert.equal(dv.getUint32(4, true), ab.byteLength - 8);
  assert.equal(tag(dv, 8), "WAVE");
  assert.equal(tag(dv, 12), "fmt ");
  assert.equal(dv.getUint32(16, true), 16);      // fmt の中身の長さ
  assert.equal(dv.getUint16(20, true), 1);       // 1 = PCM
  assert.equal(dv.getUint16(22, true), 2);       // チャンネル数
  assert.equal(dv.getUint32(24, true), 48000);   // 標本化周波数
  assert.equal(dv.getUint32(28, true), 48000 * 2 * 2); // byte rate
  assert.equal(dv.getUint16(32, true), 2 * 2);   // block align
  assert.equal(dv.getUint16(34, true), 16);      // bit 数
  assert.equal(tag(dv, 36), "data");
  assert.equal(dv.getUint32(40, true), n * 2 * 2);
});

test("wavBytes: 16bit の値域（-1 → -32768 / +1 → +32767 / 溢れは張り付く）", () => {
  const ab = wavBytes([new Float32Array([0, 1, -1, 1.5, -1.5, 0.5, -0.5])], 48000, 16);
  const dv = new DataView(ab);
  const s = (i) => dv.getInt16(44 + i * 2, true);
  assert.equal(s(0), 0);
  assert.equal(s(1), 32767);
  assert.equal(s(2), -32768);
  assert.equal(s(3), 32767);        // +1 より上は張り付く（回り込まない）
  assert.equal(s(4), -32768);
  assert.equal(s(5), Math.round(0.5 * 0x7fff));
  assert.equal(s(6), Math.round(-0.5 * 0x8000));
  /* 全ての値が 16bit に収まる（回り込みが無い） */
  for (let i = 0; i < 7; i++) assert.ok(s(i) >= -32768 && s(i) <= 32767);
});

test("wavBytes: 標本は左右交互（インタリーブ）に並ぶ", () => {
  const ab = wavBytes([new Float32Array([1, 0]), new Float32Array([-1, 0])], 8000, 16);
  const dv = new DataView(ab);
  assert.equal(dv.getInt16(44, true), 32767);       // L[0]
  assert.equal(dv.getInt16(46, true), -32768);      // R[0]
  assert.equal(dv.getInt16(48, true), 0);           // L[1]
  assert.equal(dv.getInt16(50, true), 0);           // R[1]
});

test("wavBytes: 8 / 24 / 32bit（32bit は IEEE float の形式 3）", () => {
  const data = new Float32Array([0, 1, -1]);
  const b8 = new DataView(wavBytes([data], 44100, 8));
  assert.equal(b8.getUint16(20, true), 1);
  assert.equal(b8.getUint16(34, true), 8);
  assert.equal(b8.getUint16(32, true), 1);
  assert.equal(b8.getUint32(40, true), 3);
  assert.equal(b8.getUint8(44), 128);              // 0 は中央
  assert.equal(b8.getUint8(45), 255);
  assert.equal(b8.getUint8(46), 1);

  const b24 = new DataView(wavBytes([data], 44100, 24));
  assert.equal(b24.getUint16(34, true), 24);
  assert.equal(b24.getUint16(32, true), 3);
  assert.equal(b24.getUint32(40, true), 9);
  assert.equal(b24.buffer.byteLength, 44 + 9);
  /* 小端で -1 = 0x800000 */
  assert.equal(b24.getUint8(50), 0x00);
  assert.equal(b24.getUint8(51), 0x00);
  assert.equal(b24.getUint8(52), 0x80);

  const b32 = new DataView(wavBytes([data], 44100, 32));
  assert.equal(b32.getUint16(20, true), 3);        // IEEE float
  assert.equal(b32.getUint16(34, true), 32);
  assert.equal(b32.getUint32(28, true), 44100 * 4);
  assert.equal(b32.getFloat32(48, true), 1);
  assert.equal(b32.getFloat32(52, true), -1);
});

test("wavBytes: 知らない bit 数は 16bit に落とす・長さ違いは 0 で埋める", () => {
  const odd = new DataView(wavBytes([new Float32Array([1])], 48000, 7));
  assert.equal(odd.getUint16(34, true), 16);
  const pad = new DataView(wavBytes([new Float32Array([1, 1]), new Float32Array([1])], 48000, 16));
  assert.equal(pad.getUint32(40, true), 2 * 2 * 2);
  assert.equal(pad.getInt16(44 + 6, true), 0);     // 足りない方は 0
});

test("wavBytes: チャンネルが無い / 標本が無い", () => {
  assert.throws(() => wavBytes([], 48000, 16), /チャンネル/);
  assert.throws(() => wavBytes(null, 48000, 16), /チャンネル/);
  const nil = new DataView(wavBytes([new Float32Array(0)], 48000, 16));
  assert.equal(nil.getUint32(40, true), 0);
  assert.equal(nil.buffer.byteLength, 44);
});

test("audioBufferToWav: AudioBuffer らしい物から Blob を作る（範囲も切れる）", () => {
  const buffer = {
    sampleRate: 48000, numberOfChannels: 2, length: 4,
    getChannelData: (c) => new Float32Array([c ? -1 : 1, 0, 0, c ? 1 : -1])
  };
  const blob = audioBufferToWav(buffer, { bitDepth: 16 });
  assert.equal(blob.type, "audio/wav");
  assert.equal(blob.size, 44 + 4 * 2 * 2);
  const part = audioBufferToWav(buffer, { bitDepth: 16, startSample: 1, endSample: 3 });
  assert.equal(part.size, 44 + 2 * 2 * 2);
  assert.throws(() => audioBufferToWav(null), /AudioBuffer/);
});

/* ══ ④ planChunks ══════════════════════════════════════════════ */

test("planChunks: 10 分以下は割らない（既定）", () => {
  assert.equal(SPLIT_ABOVE, 600);
  assert.equal(CHUNK_SEC, 60);
  assert.equal(XFADE, 0.005);
  const k = planChunks(30);
  assert.equal(k.length, 1);
  assert.deepEqual(k[0], {
    index: 0, start: 0, end: 30, duration: 30, pre: 0,
    renderStart: 0, renderEnd: 30, renderDuration: 30,
    writeAt: 0, fadeIn: 0, fadeOut: 0
  });
  assert.equal(planChunks(600).length, 1);
  assert.equal(planChunks(599.9).length, 1);
});

test("planChunks: 10 分超は chunk 秒ずつに割る（隙間も重なりも無い）", () => {
  const k = planChunks(700, { chunk: 60 });
  assert.equal(k.length, 12);
  assert.equal(k[0].start, 0);
  assert.equal(k[k.length - 1].end, 700);
  for (let i = 0; i < k.length; i++) {
    assert.equal(k[i].index, i);
    if (i) assert.equal(k[i].start, k[i - 1].end, "出力の並びに隙間や重なりが在る");
  }
  const sum = k.reduce((a, c) => a + c.duration, 0);
  assert.ok(Math.abs(sum - 700) < 1e-6);
});

test("planChunks: 2 つ目以降は 5ms の助走を持つ（つなぎ目のクロスフェード）", () => {
  const k = planChunks(700, { chunk: 60 });
  assert.equal(k[0].pre, 0);
  assert.equal(k[0].fadeIn, 0);
  assert.equal(k[0].writeAt, 0);
  for (let i = 1; i < k.length; i++) {
    assert.equal(k[i].pre, XFADE);
    assert.equal(k[i].fadeIn, XFADE);
    assert.equal(k[i].renderStart, k[i].start - XFADE);
    assert.equal(k[i].writeAt, k[i].start - XFADE);
    assert.equal(k[i].renderEnd, k[i].end);
    assert.ok(Math.abs(k[i].renderDuration - (k[i].duration + XFADE)) < 1e-9);
    /* 助走は前の区間の中に入っている（= そこで混ぜられる） */
    assert.ok(k[i].renderStart >= k[i - 1].start);
    assert.ok(k[i].renderStart < k[i - 1].end);
  }
});

test("planChunks: min:0 で必ず割る・xfade も差し替えられる", () => {
  const k = planChunks(125, { chunk: 60, min: 0, xfade: 0.01 });
  assert.deepEqual(k.map((c) => [c.start, c.end]), [[0, 60], [60, 120], [120, 125]]);
  assert.equal(k[1].pre, 0.01);
  assert.equal(k[2].pre, 0.01);
});

test("planChunks: 短すぎる切れ端は 1 つ前に足す（助走だけの区間を作らない）", () => {
  const k = planChunks(120.01, { chunk: 60, min: 0 });
  assert.equal(k.length, 2);
  assert.deepEqual(k.map((c) => [c.start, c.end]), [[0, 60], [60, 120.01]]);
  assert.equal(k[1].renderEnd, 120.01);
  assert.ok(Math.abs(k[1].renderDuration - (60.01 + XFADE)) < 1e-9);
});

test("planChunks: 0 や負や滅茶苦茶な数でも 1 区間は返す（呼ぶ側が困らない）", () => {
  for (const bad of [0, -5, NaN, undefined, null, "abc"]) {
    const k = planChunks(bad);
    assert.equal(k.length, 1);
    assert.equal(k[0].start, 0);
    assert.equal(k[0].duration, 0);
  }
  /* chunk が 0 や負でも無限ループしない */
  const k = planChunks(100, { chunk: 0, min: 0 });
  assert.ok(k.length >= 1 && k.length < 1000);
  assert.ok(Math.abs(k[k.length - 1].end - 100) < 1e-6);
});

/* ══ ⑤ 曲線の小道具と limiter ══════════════════════════════════ */

test("curveAt: 区間の中は線形・外は端の値を保つ", () => {
  const c = [{ t: 1, v: 0 }, { t: 3, v: 1 }];
  assert.equal(curveAt(c, 0), 0);
  assert.equal(curveAt(c, 1), 0);
  assert.equal(curveAt(c, 2), 0.5);
  assert.equal(curveAt(c, 3), 1);
  assert.equal(curveAt(c, 9), 1);
  assert.equal(curveAt([], 1), 1);           // 空は 1（掛けても変わらない）
});

test("mulCurves: t の集合は和・値は掛け算", () => {
  const a = [{ t: 0, v: 1 }, { t: 2, v: 1 }];
  const b = [{ t: 0, v: 0 }, { t: 1, v: 1 }, { t: 2, v: 0 }];
  assert.deepEqual(pairs(mulCurves(a, b)), [[0, 0], [1, 1], [2, 0]]);
  const c = [{ t: 0, v: 0.5 }, { t: 4, v: 0.5 }];
  assert.deepEqual(pairs(mulCurves(c, b)), [[0, 0], [1, 0.5], [2, 0], [4, 0]]);
  assert.deepEqual(pairs(mulCurves([], b)), pairs(b));
});

test("collapseCurve: 直線に乗る点は捨てる・端は残す", () => {
  assert.deepEqual(
    pairs(collapseCurve([{ t: 0, v: 0 }, { t: 1, v: 0.5 }, { t: 2, v: 1 }, { t: 3, v: 1 }])),
    [[0, 0], [2, 1], [3, 1]]
  );
  assert.equal(collapseCurve([{ t: 0, v: 1 }]).length, 1);
  assert.equal(collapseCurve([{ t: 0, v: 1 }, { t: 1, v: 1 }]).length, 2);
});

test("limiterCurve: 上限を超えない・小さい音は素通り・単調・左右対称", () => {
  const curve = limiterCurve();
  assert.ok(curve instanceof Float32Array);
  assert.equal(curve.length % 2, 1, "中央（無音）を含むため奇数");
  const mid = (curve.length - 1) / 2;
  assert.equal(curve[mid], 0);
  /* WaveShaper の前後で 1/drive → drive なので、実際の値は drive 倍して見る */
  const out = (x) => {
    const u = x / LIMITER_DRIVE;
    const i = Math.round(((u + 1) / 2) * (curve.length - 1));
    return curve[Math.max(0, Math.min(curve.length - 1, i))] * LIMITER_DRIVE;
  };
  assert.ok(Math.abs(out(0.1) - 0.1) < 0.01, "小さい音は変えない");
  assert.ok(Math.abs(out(0.5) - 0.5) < 0.01);
  assert.ok(out(1) <= LIMITER_CEILING + 1e-6, `上限を超えている: ${out(1)}`);
  assert.ok(out(4) <= LIMITER_CEILING + 1e-6);
  assert.ok(out(1) > LIMITER_CEILING * 0.9, "潰しすぎない");
  /* engine/audio/fx.js の "limiter" の既定（-1dB）と同じ高さ */
  assert.ok(Math.abs(20 * Math.log10(LIMITER_CEILING) + 1) < 0.05, "上限は -1dBFS");
  /* 上限は引数で変えられる（graph.js と揃えたい人のため） */
  const low = limiterCurve(0.5);
  assert.ok(low[low.length - 1] * LIMITER_DRIVE <= 0.5 + 1e-6);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1] - 1e-9, "単調");
  for (let i = 0; i < curve.length; i++) {
    assert.ok(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-6, "左右対称");
  }
});

test("reverseChannels: 中身が逆になる・元は壊さない", () => {
  const src = new Float32Array([1, 2, 3, 4]);
  const [rev] = reverseChannels([src]);
  assert.deepEqual(Array.from(rev), [4, 3, 2, 1]);
  assert.deepEqual(Array.from(src), [1, 2, 3, 4]);
  assert.deepEqual(reverseChannels(null), []);
});

test("resolveMixRange: range → start+duration → project 全体 の順に決める", () => {
  const p = one({ start: 0, duration: 7, out: 7 });
  assert.deepEqual(resolveMixRange(p), { start: 0, end: 7, duration: 7 });
  assert.deepEqual(resolveMixRange(p, { range: { start: 2, end: 5 } }), { start: 2, end: 5, duration: 3 });
  assert.deepEqual(resolveMixRange(p, { start: 2, duration: 3 }), { start: 2, end: 5, duration: 3 });
  /* 逆さの範囲は入れ替える・負は 0 まで */
  assert.deepEqual(resolveMixRange(p, { range: { start: 5, end: 2 } }), { start: 2, end: 5, duration: 3 });
  assert.deepEqual(resolveMixRange(p, { range: { start: -3, end: 2 } }), { start: 0, end: 2, duration: 2 });
  assert.deepEqual(resolveMixRange({ tracks: [] }), { start: 0, end: 0, duration: 0 });
});

test("markerFx / soundFxOf / clipHasAudio: 印と効果の見分け", () => {
  const clip = C({
    fx: [
      { id: "1", type: PITCH_FX_TYPE, enabled: true, params: {} },
      { id: "2", type: "highpass", enabled: true, params: { freq: 100 } },
      { id: "3", type: "reverb", enabled: false, params: {} },
      { id: "4", type: BGM_FX_TYPE, enabled: true, params: { duck: true } }
    ]
  });
  assert.equal(markerFx(clip, PITCH_FX_TYPE).id, "1");
  assert.equal(markerFx(clip, DUCK_FX_TYPE), null);
  assert.deepEqual(soundFxOf(clip).map((f) => f.id), ["2"]);   // 印と切った物は流さない
  assert.equal(clipHasAudio(C({ kind: "audio" }), null), true);
  assert.equal(clipHasAudio(C({ kind: "video" }), A("v", 1, { hasAudio: true })), true);
  assert.equal(clipHasAudio(C({ kind: "video" }), A("v", 1, { hasAudio: false })), false);
  assert.equal(clipHasAudio(C({ kind: "video" }), null), false);
  assert.equal(clipHasAudio(C({ kind: "text" }), null), false);
  assert.equal(clipHasAudio(C({ kind: "compound" }), null), true);
});

/* ══ ⑥ 契約の口が揃っているか ═════════════════════════════════ */

test("契約書 §4 の口が全部在る（Node では鳴らせないので形だけ見る）", () => {
  assert.equal(typeof renderMixdown, "function");
  assert.equal(typeof planAudioEvents, "function");
  assert.equal(typeof audioBufferToWav, "function");
  assert.equal(typeof wavBytes, "function");
  assert.equal(typeof planChunks, "function");
  assert.equal(DEFAULT_SAMPLE_RATE, 48000);
});

test("renderMixdown: OfflineAudioContext が無い所では はっきり断る（黙らない）", async () => {
  await assert.rejects(
    () => renderMixdown(one({}), { sampleRate: 48000 }),
    (e) => {
      assert.match(String(e && e.message), /OfflineAudioContext|音/);
      return true;
    }
  );
});

test("renderMixdown: 中止された signal はすぐ AbortError になる", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => renderMixdown(one({}), { signal: ac.signal }),
    (e) => { assert.equal(e.name, "AbortError"); return true; }
  );
});
