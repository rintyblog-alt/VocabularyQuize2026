/* ══════════════════════════════════════════════════════════════════════
   tests/audio-params.test.mjs — 音の「数の担保」（node --test）

   音は画面に何も出ない。狂っても「なぜか BGM が戻ってこない」「素材ごとに
   音量がばらつく」という形でしか現れず、原因を探すのが一番難しい。だから
   **AudioContext を要らない純関数だけを切り出して数で押さえる**:

     ① buildDuckCurve … 無音では 1 のまま / 声の上で 1−amount まで下がる /
        下がりきるのが ちょうど attack 秒後・戻りきるのが release 秒後 /
        値は必ず 0..1 / 窓を継ぎ足しても段差が出ない（initial）
     ② normalizeGain … 丸め（小数 3 桁）と上限（+12dB / −24dB）と
        「無音は持ち上げない」
     ③ loudnessFromBuffer … 偽 AudioBuffer（`getChannelData` を持つ object）で
        1kHz の正弦を測る。絶対値（0 LUFS 付近）と **相対の差 −6.02dB** の両方。
     ④ AUDIO_FX_REGISTRY … UI がこの表を見て並べるので、
        **min < def < max**・key の重複なし・日本語の名前が必ず在る事。
     ⑤ soundClipsInRange … ミュート / solo / 入れ子（compound）の扱い。

   ここが通っていれば「音が鳴らない」の原因は AudioContext の側に絞れる。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDuckCurve, envelopeFromBuffer, soundClipsInRange, planVoice, clipGainAt, clipPanAt,
  DUCK_HZ, DUCK_DEFAULTS, LOOKAHEAD, CACHE_BYTES
} from "../src/engine/audio/graph.js";
import {
  loudnessFromBuffer, normalizeGain, peakRmsOf, kWeightCoeffs, dbFromAmp, ampFromDb,
  DB_FLOOR, TARGET_LUFS
} from "../src/engine/audio/meter.js";
import {
  AUDIO_FX_REGISTRY, AUDIO_FX_TYPES, resolveFxParams, fxParamDefaults,
  normalizeFxType, isAudioFxType
} from "../src/engine/audio/fx.js";

const SR = 48000;

/* ── 道具（試験が揺れないよう決定論）───────────────────────────── */

/** 契約書 §6 / meter.js が受ける「偽 AudioBuffer」 */
function makeBuf(channels, sampleRate = SR) {
  const chans = channels.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c)));
  return {
    sampleRate, length: chans[0] ? chans[0].length : 0, numberOfChannels: chans.length,
    getChannelData: (i) => chans[i]
  };
}
function sine(dur, freq, amp = 1, sr = SR) {
  const x = new Float32Array(Math.round(dur * sr));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

/**
 * 「無音 → 声 → 無音」の loudness 包絡を作る（dBFS 相当・hz 刻み）。
 * @param {{hz:number, total:number, spans:[number,number][], voiceDb:number, quietDb:number}} o
 */
function envelope(o) {
  const n = Math.round(o.total * o.hz);
  const values = new Float32Array(n).fill(o.quietDb);
  for (const [a, b] of o.spans) {
    const from = Math.round(a * o.hz), to = Math.round(b * o.hz);
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) values[i] = o.voiceDb;
  }
  return { hz: o.hz, values };
}

const at = (curve, hz, sec) => curve[Math.round(sec * hz)];
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≒ ${b} (±${eps}) では無い`);

/* ══ ① ダッキングの曲線 ═══════════════════════════════════════════ */

test("buildDuckCurve: 無音の所は 1 のまま・声の上で下がる", () => {
  const hz = DUCK_HZ;
  const env = envelope({ hz, total: 4, spans: [[1, 2.5]], voiceDb: -12, quietDb: -70 });
  const c = buildDuckCurve(env, { amount: 0.8, attack: 0.2, release: 0.5, hold: 0 });

  assert.equal(c.length, env.values.length);
  for (let i = 0; i < c.length; i++) {
    assert.ok(Number.isFinite(c[i]), `NaN が出た（i=${i}）`);
    assert.ok(c[i] >= 0 && c[i] <= 1, `値域を外れた（i=${i}: ${c[i]}）`);
  }
  /* 声が始まるまでは触らない */
  for (let t = 0; t < 1; t += 0.05) near(at(c, hz, t), 1, 1e-6, `t=${t} は 1`);
  /* 声の上では下がりきっている */
  near(at(c, hz, 2.0), 0.2, 1e-6, "声の真ん中は 1−amount");
  /* 戻った後は 1 */
  near(at(c, hz, 3.5), 1, 1e-6, "声が終わって充分後は 1");
});

test("buildDuckCurve: attack / release が指定どおりの秒数で効く", () => {
  const hz = DUCK_HZ;
  const amount = 0.8, attack = 0.2, release = 0.5;
  const env = envelope({ hz, total: 4, spans: [[1, 2.5]], voiceDb: -12, quietDb: -70 });
  const c = buildDuckCurve(env, { amount, attack, release, hold: 0 });
  const floor = 1 - amount;

  /* 声の頭 + attack で ちょうど下がりきる（その 1 標本前はまだ上に居る） */
  near(at(c, hz, 1 + attack), floor, 1e-6, "attack 秒後に下がりきる");
  assert.ok(at(c, hz, 1 + attack - 1 / hz) > floor + 1e-3, "attack 秒より前は まだ下がりきっていない");
  /* 声の尾 + release で ちょうど戻りきる（その 1 標本前はまだ下に居る） */
  near(at(c, hz, 2.5 + release), 1, 1e-6, "release 秒後に戻りきる");
  assert.ok(at(c, hz, 2.5 + release - 1 / hz) < 1 - 1e-3, "release 秒より前は まだ戻っていない");
  /* 傾きは amount/attack（dB ではなく倍率の直線） */
  const slope = (at(c, hz, 1 + 0.1) - at(c, hz, 1 + 0.05)) * hz;
  near(slope, -amount / attack, 1e-6, "下がる傾き");
});

test("buildDuckCurve: hold は戻りを遅らせる / initial は窓を継げる", () => {
  const hz = DUCK_HZ;
  const env = envelope({ hz, total: 3, spans: [[0.5, 1]], voiceDb: -10, quietDb: -80 });
  const noHold = buildDuckCurve(env, { amount: 0.6, attack: 0.1, release: 0.4, hold: 0 });
  const held = buildDuckCurve(env, { amount: 0.6, attack: 0.1, release: 0.4, hold: 0.3 });
  assert.ok(at(held, hz, 1.2) < at(noHold, hz, 1.2), "hold の間は戻り始めない");
  near(at(held, hz, 1.25), 0.4, 1e-6, "hold の終わりまで下がったまま");

  /* 窓の継ぎ目: 前の窓の終わりの値から始まる */
  const cont = buildDuckCurve(envelope({ hz, total: 1, spans: [], voiceDb: -10, quietDb: -80 }),
    { amount: 0.6, attack: 0.1, release: 0.4, initial: 0.4 });
  near(cont[0], 0.4, 1e-6, "曲線の頭は initial そのまま（継ぎ目に段差を作らない）");
  near(cont[1], 0.4 + (0.6 * (1 / hz)) / 0.4, 1e-6, "そこから release の傾きで戻り始める");
  near(cont[cont.length - 1], 1, 1e-6, "窓の終わりまでに戻りきる");
});

test("buildDuckCurve: 壊れた入力で落ちない", () => {
  assert.equal(buildDuckCurve(null).length, 0);
  assert.equal(buildDuckCurve({ hz: 20, values: [] }).length, 0);
  assert.equal(buildDuckCurve(undefined, { amount: 2 }).length, 0);
  const c = buildDuckCurve([NaN, -12, null, -70, Infinity], { hz: 20, amount: 0.5 });
  assert.equal(c.length, 5);
  for (const v of c) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
  /* 素の配列でも受ける（hz は opts から） */
  assert.equal(buildDuckCurve([-70, -70, -70], { hz: 20 }).every((v) => v === 1), true);
  /* amount:0 なら何も下げない */
  const flat = buildDuckCurve(envelope({ hz: 20, total: 1, spans: [[0, 1]], voiceDb: 0, quietDb: -90 }), { amount: 0 });
  for (const v of flat) near(v, 1, 1e-6, "amount 0 は素通し");
});

test("buildDuckCurve: 既定値は ai/tools.js の autoDuck と同じ", () => {
  assert.equal(DUCK_DEFAULTS.amount, 0.7);
  assert.equal(DUCK_DEFAULTS.attack, 0.15);
  assert.equal(DUCK_DEFAULTS.release, 0.4);
  assert.ok(LOOKAHEAD >= 1, "先読みは 1 秒以上（裏タブの間引きに負けない）");
  assert.equal(CACHE_BYTES, 300 * 1024 * 1024);
});

/* ══ ② 音量そろえ ═════════════════════════════════════════════════ */

test("normalizeGain: 丸めと上限", () => {
  assert.equal(normalizeGain(-20, -14), 1.995);      // +6.02dB
  assert.equal(normalizeGain(-8, -14), 0.501);       // −6.02dB
  assert.equal(normalizeGain(-14, -14), 1);          // ちょうど
  assert.equal(normalizeGain(-60, -14), 3.981);      // +12dB で止める
  assert.equal(normalizeGain(20, -14), 0.063);       // −24dB で止める
  assert.equal(normalizeGain(-20, -14, { digits: 2 }), 2);
  assert.equal(normalizeGain(-20, -14, { digits: 0 }), 2);
  assert.equal(normalizeGain(-20, -14, { maxBoostDb: 3 }), 1.413);
  assert.equal(normalizeGain(-20), normalizeGain(-20, TARGET_LUFS), "目標の既定は −14 LUFS");
  /* 丸めの桁は必ず 3 桁以内（ops の volume がそれ以上の桁を持たない） */
  for (const m of [-30, -22.4, -17.77, -9.1, -3]) {
    const g = normalizeGain(m, -14);
    assert.equal(g, Math.round(g * 1000) / 1000);
  }
});

test("normalizeGain: 測れない値は触らない（1 を返す）", () => {
  assert.equal(normalizeGain(DB_FLOOR, -14), 1);
  assert.equal(normalizeGain(-70, -14), 1);
  assert.equal(normalizeGain(NaN, -14), 1);
  assert.equal(normalizeGain(undefined, -14), 1);
  assert.equal(normalizeGain(-Infinity, -14), 1);
});

/* ══ ③ 素材の音の大きさ ═══════════════════════════════════════════ */

test("kWeightCoeffs: BS.1770 の 48kHz 基準値と一致する", () => {
  const c = kWeightCoeffs(48000);
  near(c.shelf[0], 1.53512485958697, 1e-6, "shelf b0");
  near(c.shelf[1], -2.69169618940638, 1e-6, "shelf b1");
  near(c.shelf[2], 1.19839281085285, 1e-6, "shelf b2");
  near(c.shelf[3], -1.69065929318241, 1e-6, "shelf a1");
  near(c.shelf[4], 0.73248077421585, 1e-6, "shelf a2");
  near(c.hp[3], -1.99004745483398, 1e-6, "hp a1");
  near(c.hp[4], 0.99007225036621, 1e-6, "hp a2");
  /* 44.1kHz でも係数が変わる（表を使い回していない事の確認） */
  assert.notEqual(kWeightCoeffs(44100).shelf[0], c.shelf[0]);
});

test("loudnessFromBuffer: 峰と実効値と LUFS", () => {
  const full = loudnessFromBuffer(makeBuf([sine(3, 1000, 1)]));
  near(full.peak, 1, 1e-3, "峰は 1");
  near(full.rms, Math.SQRT1_2, 2e-3, "正弦の実効値は 1/√2");
  near(full.peakDb, 0, 0.02, "峰は 0dBFS");
  near(full.lufsApprox, 0, 1, "1kHz 全振幅は 0 LUFS 付近（BS.1770 の校正点）");
  assert.ok(full.blocks > 1, "400ms ブロックが複数取れている");

  /* 振幅を半分にすると ちょうど −6.02dB */
  const half = loudnessFromBuffer(makeBuf([sine(3, 1000, 0.5)]));
  near(half.lufsApprox - full.lufsApprox, -6.0206, 0.02, "半分は −6.02dB");
  near(half.peak, 0.5, 1e-3, "峰は 0.5");

  /* モノとデュアルモノは同じ（モノだけ 3dB 小さく揃うのを防ぐため）*/
  const st = loudnessFromBuffer(makeBuf([sine(3, 1000, 1), sine(3, 1000, 1)]));
  near(st.lufsApprox, full.lufsApprox, 0.05, "モノ = デュアルモノ");
  assert.equal(st.channels, 2);

  /* 左右で違う音でも落ちない（片側だけ鳴っている） */
  const oneSide = loudnessFromBuffer(makeBuf([sine(1, 1000, 1), new Float32Array(SR)]));
  assert.ok(oneSide.lufsApprox < full.lufsApprox, "片側だけなら小さい");
  near(oneSide.peak, 1, 1e-3, "峰は鳴っている側の値");
});

test("loudnessFromBuffer: 無音・空・壊れた入力", () => {
  const sil = loudnessFromBuffer(makeBuf([new Float32Array(SR)]));
  assert.equal(sil.peak, 0);
  assert.equal(sil.rms, 0);
  assert.ok(sil.lufsApprox <= -70, "無音は測れない扱い");
  assert.equal(normalizeGain(sil.lufsApprox, -14), 1, "無音は持ち上げない");

  for (const bad of [null, undefined, {}, makeBuf([new Float32Array(0)]), 5]) {
    const r = loudnessFromBuffer(bad);
    assert.ok(Number.isFinite(r.lufsApprox) && Number.isFinite(r.peak), "壊れた入力でも数を返す");
  }
  /* NaN を含む列でも NaN を外へ出さない */
  const nanBuf = makeBuf([Float32Array.from([0.5, NaN, -0.5, Infinity, 0.25])]);
  const r = loudnessFromBuffer(nanBuf);
  assert.ok(Number.isFinite(r.lufsApprox) && Number.isFinite(r.rms) && Number.isFinite(r.peak));

  /* Float32Array を直に渡しても良い（sampleRate は opts） */
  const raw = loudnessFromBuffer(sine(1, 1000, 1), { sampleRate: SR });
  near(raw.peak, 1, 1e-3, "素の並びも受ける");
});

test("dbFromAmp / ampFromDb は往復する", () => {
  for (const db of [-60, -24, -6, 0, 6]) near(dbFromAmp(ampFromDb(db)), db, 1e-6, "往復");
  assert.equal(dbFromAmp(0), DB_FLOOR);
  assert.equal(ampFromDb(DB_FLOOR), 0);
  assert.equal(dbFromAmp(NaN), DB_FLOOR);
});

test("peakRmsOf: メーターの計算", () => {
  const { peak, rms } = peakRmsOf(sine(0.1, 1000, 0.5));
  near(peak, 0.5, 2e-3, "峰");
  near(rms, 0.5 * Math.SQRT1_2, 3e-3, "実効値");
  assert.deepEqual(peakRmsOf([]), { peak: 0, rms: 0 });
  assert.deepEqual(peakRmsOf(null), { peak: 0, rms: 0 });
});

test("envelopeFromBuffer: 鳴っている所だけ持ち上がる", () => {
  const x = new Float32Array(SR * 2);
  for (let i = SR; i < SR * 2; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / SR);   // 後半だけ鳴る
  const env = envelopeFromBuffer(makeBuf([x]), { hz: 20 });
  assert.equal(env.hz, 20);
  assert.equal(env.values.length, 40);
  assert.ok(env.values[5] <= -119, "前半は無音");
  near(env.values[30], -3.01, 0.5, "後半は正弦の実効値（−3dBFS）");
  /* その包絡をそのまま duck に渡せる */
  const c = buildDuckCurve(env, { amount: 0.7, attack: 0.1, release: 0.2, thresholdDb: -42 });
  near(c[5], 1, 1e-9, "無音では下げない");
  near(c[35], 0.3, 1e-6, "鳴っている所では下がる");
  assert.equal(envelopeFromBuffer(null).values.length, 0);
});

/* ══ ④ 効果の登録表（UI との契約）═════════════════════════════════ */

test("AUDIO_FX_REGISTRY: 依頼された効果が全部在る", () => {
  const want = ["eq3", "eq", "compressor", "gate", "limiter", "reverb", "delay",
    "pitch", "distortion", "lowpass", "highpass", "stereoWiden", "deesser"];
  for (const t of want) assert.ok(AUDIO_FX_REGISTRY[t], `${t} が無い`);
  assert.deepEqual(AUDIO_FX_TYPES, Object.keys(AUDIO_FX_REGISTRY));
});

test("AUDIO_FX_REGISTRY: params が妥当（min < def < max）", () => {
  for (const [type, def] of Object.entries(AUDIO_FX_REGISTRY)) {
    assert.ok(def.name && /[^\x00-\x7F]/.test(def.name), `${type}: 日本語の名前が要る`);
    assert.ok(def.group, `${type}: group が要る`);
    assert.ok(Array.isArray(def.params) && def.params.length, `${type}: params が空`);
    const seen = new Set();
    for (const p of def.params) {
      const at2 = `${type}.${p.key}`;
      assert.ok(p.key && typeof p.key === "string", `${at2}: key が要る`);
      assert.ok(!seen.has(p.key), `${at2}: key が重複`);
      seen.add(p.key);
      assert.ok(p.label && typeof p.label === "string", `${at2}: label が要る`);
      assert.ok(typeof p.unit === "string", `${at2}: unit は文字列`);
      for (const k of ["min", "max", "def", "step"]) {
        assert.ok(Number.isFinite(p[k]), `${at2}: ${k} が数でない`);
      }
      assert.ok(p.min < p.def, `${at2}: min(${p.min}) < def(${p.def}) では無い`);
      assert.ok(p.def < p.max, `${at2}: def(${p.def}) < max(${p.max}) では無い`);
      assert.ok(p.step > 0 && p.step <= p.max - p.min, `${at2}: step が変（${p.step}）`);
    }
  }
});

test("fxParamDefaults / resolveFxParams: 既定で埋め・範囲に丸める", () => {
  for (const type of AUDIO_FX_TYPES) {
    const d = fxParamDefaults(type);
    const keys = AUDIO_FX_REGISTRY[type].params.map((p) => p.key);
    assert.deepEqual(Object.keys(d).sort(), keys.slice().sort(), `${type}: 既定の key が合わない`);
    /* 空で呼んでも既定と同じ / 出鱈目を渡しても範囲の中 */
    assert.deepEqual(resolveFxParams(type, {}), d);
    const wild = resolveFxParams(type, Object.fromEntries(keys.map((k) => [k, 1e9])));
    for (const p of AUDIO_FX_REGISTRY[type].params) {
      assert.ok(wild[p.key] >= p.min && wild[p.key] <= p.max, `${type}.${p.key}: 丸められていない`);
    }
    const nan = resolveFxParams(type, Object.fromEntries(keys.map((k) => [k, NaN])));
    assert.deepEqual(nan, d, `${type}: NaN は既定に戻る`);
  }
});

test("型と param の別名（既に在る画面とプロジェクトを壊さない）", () => {
  assert.equal(normalizeFxType("pitchShift"), "pitch");
  assert.equal(normalizeFxType("noiseGate"), "gate");
  assert.equal(normalizeFxType("EQ3"), "eq3");
  assert.equal(normalizeFxType("glitch"), "");
  assert.equal(normalizeFxType("bgm"), "");
  assert.equal(normalizeFxType(null), "");
  assert.equal(isAudioFxType("reverb"), true);
  assert.equal(isAudioFxType("pitchPreserve"), false);
  assert.equal(isAudioFxType("duckSource"), false);

  /* UI のプリセットは eq に {low,mid,high,midFreq} を渡してくる */
  const eq = resolveFxParams("eq", { low: -1, mid: 2.5, high: 2, midFreq: 3000 });
  assert.equal(eq.b1g, -1);
  assert.equal(eq.b3g, 2.5);
  assert.equal(eq.b5g, 2);
  assert.equal(eq.b3f, 3000);
  /* noiseGate の「強さ」は下げ幅に移る */
  const g0 = resolveFxParams("noiseGate", { amount: 0, threshold: -50 });
  const g1 = resolveFxParams("noiseGate", { amount: 1, threshold: -50 });
  assert.equal(g0.threshold, -50);
  assert.ok(g1.range < g0.range, "強くすると下げ幅が深くなる");
  assert.ok(g1.range >= -60 && g0.range <= 0);
  /* 知らない型は空（素通しの箱になる） */
  assert.deepEqual(resolveFxParams("glitch", { amount: 1 }), {});
});

test("UI のプリセットに出てくる型と key が全部受かる", () => {
  /* ui/inspector/audio.js の AUDIO_FX_PRESETS と同じ組み合わせ */
  const chains = [
    ["highpass", { freq: 90, q: 0.7 }], ["compressor", { threshold: -20, ratio: 3, attack: 8, release: 160, makeup: 3 }],
    ["eq", { low: -1, mid: 2.5, high: 2, midFreq: 3000 }], ["deesser", { amount: 0.35, freq: 6500 }],
    ["lowpass", { freq: 3200, q: 1 }], ["distortion", { drive: 0.22, tone: 0.6 }],
    ["stereoWiden", { amount: 0.55 }], ["reverb", { mix: 0.14, size: 0.45, damp: 0.5 }],
    ["delay", { time: 240, feedback: 0.3, mix: 0.2 }], ["limiter", { ceiling: -1 }],
    ["gate", { threshold: -45, attack: 5, release: 120 }], ["pitchShift", { semitones: -3 }]
  ];
  for (const [type, params] of chains) {
    const t = normalizeFxType(type);
    assert.ok(t, `${type} を受けられない`);
    const v = resolveFxParams(t, params);
    for (const [k, given] of Object.entries(params)) {
      const spec = AUDIO_FX_REGISTRY[t].params.find((p) => p.key === k);
      if (!spec) continue;                       // 別名は下で個別に見ている
      assert.equal(v[k], given, `${t}.${k}: 渡した値が丸められた`);
    }
  }
});

/* ══ ⑤ どの clip が鳴るか ═════════════════════════════════════════ */

const asset = (id, extra) => ({ id, kind: "audio", name: id, duration: 30, hasAudio: true, storage: { kind: "idb", key: "b_" + id }, ...extra });
const clip = (id, start, duration, extra) => ({
  id, kind: "audio", assetId: "as1", start, duration, in: 0, out: duration,
  speed: 1, volume: 1, ...extra
});

test("soundClipsInRange: 窓に重なる clip だけ・ミュートと solo を守る", () => {
  const project = {
    assets: [asset("as1")],
    tracks: [
      { id: "t1", kind: "audio", clips: [clip("c1", 0, 2), clip("c2", 5, 2)] },
      { id: "t2", kind: "video", volume: 1, clips: [clip("c3", 0, 4, { kind: "video" })] },
      { id: "t3", kind: "adjust", clips: [clip("c4", 0, 4)] }
    ]
  };
  const keys = (from, to) => soundClipsInRange(project, from, to).map((i) => i.clip.id).sort();
  assert.deepEqual(keys(0, 1), ["c1", "c3"], "adjust トラックは鳴らない");
  assert.deepEqual(keys(2.5, 4), ["c3"], "隙間には c1 も c2 も居ない");
  assert.deepEqual(keys(0, 10), ["c1", "c2", "c3"]);

  project.tracks[0].muted = true;
  assert.deepEqual(keys(0, 10), ["c3"], "muted なトラックは鳴らない");
  project.tracks[0].muted = false;
  project.tracks[0].clips[0].muteAudio = true;
  assert.deepEqual(keys(0, 1), ["c3"], "muteAudio な clip は鳴らない");
  project.tracks[0].clips[0].muteAudio = false;

  project.tracks[0].solo = true;
  assert.deepEqual(keys(0, 10), ["c1", "c2"], "solo が立ったら solo だけ");
  project.tracks[0].solo = false;

  /* 素材が無い / 音の無い映像は落ちる */
  project.tracks[1].clips[0].assetId = "missing";
  assert.deepEqual(keys(0, 1), ["c1"], "素材の無い clip は鳴らない");
  project.tracks[1].clips[0].assetId = "as1";
  project.assets[0].hasAudio = false;
  assert.deepEqual(keys(0, 1), ["c1"], "音を持たない映像は鳴らない（audio clip は鳴る）");
});

test("soundClipsInRange: compound を 1 段だけ展開し、親の音量を掛ける", () => {
  const project = {
    assets: [asset("as1")],
    tracks: [{
      id: "t1", kind: "video", clips: [{
        id: "cp", kind: "compound", start: 10, duration: 4, volume: 0.5,
        compound: { tracks: [{ id: "in1", kind: "audio", clips: [clip("ic1", 0, 2), clip("ic2", 2, 5)] }] }
      }]
    }]
  };
  const list = soundClipsInRange(project, 0, 30);
  assert.deepEqual(list.map((i) => i.clip.id), ["ic1", "ic2"]);
  assert.equal(list[0].start, 10, "親の start だけずれる");
  assert.equal(list[0].end, 12);
  assert.equal(list[1].end, 14, "親の尻で切られる");
  assert.equal(list[0].gain, 0.5, "親の音量が掛かる");
  assert.equal(list[0].track.id, "t1", "鳴る先は親のトラック");
  assert.ok(list[0].key !== list[1].key, "key は clip ごとに違う");
  /* 窓の外は出てこない */
  assert.equal(soundClipsInRange(project, 0, 5).length, 0);
});

test("soundClipsInRange: 壊れた project で落ちない", () => {
  for (const bad of [null, undefined, {}, { tracks: null }, { tracks: [null, {}] }]) {
    assert.deepEqual(soundClipsInRange(bad, 0, 10), []);
  }
});

/* ══ ⑥ 予約の数（再生と書き出しで同じ物を使う）════════════════════ */

const item = (clip, start, end) => ({ clip, start, end, gain: 1, track: { id: "t" }, asset: { id: "as1" }, key: "k" });

test("planVoice: 素材のどこから・どれだけ鳴らすか", () => {
  const c = clip("c", 2, 4, { in: 1, out: 5 });
  const it = item(c, 2, 6);
  /* clip の頭から */
  const a = planVoice(it, 0, 30);
  assert.deepEqual(
    { at: a.timelineAt, localAt: a.localAt, offset: a.offset, span: a.span },
    { at: 2, localAt: 0, offset: 1, span: 4 }
  );
  /* 途中から（decode を待った / seek した） */
  const b = planVoice(it, 3, 30);
  assert.equal(b.timelineAt, 3);
  assert.equal(b.localAt, 1);
  assert.equal(b.offset, 2, "素材側も 1 秒進む");
  assert.equal(b.span, 3, "残りだけ鳴らす");
  /* 速度 2 倍は素材を 2 倍使う */
  const fast = planVoice(item(clip("c", 0, 4, { in: 0, out: 8, speed: 2 }), 0, 4), 1, 30);
  assert.equal(fast.offset, 2);
  assert.equal(fast.span, 6);
  /* 逆再生は逆順 buffer の中の位置 */
  const rev = planVoice(item(clip("c", 2, 4, { in: 1, out: 5, reverse: true }), 2, 6), 2, 30);
  assert.equal(rev.offset, 25, "duration − 素材時刻（30 − 5）");
  assert.equal(rev.span, 4);
  /* 速度ランプは ∫v dt（core/eval.js の buildSpeedMap と同じ） */
  const ramp = planVoice(item(clip("c", 0, 5, { in: 0, out: 10, speedRamp: [{ t: 0, v: 1 }, { t: 2, v: 2 }, { t: 5, v: 0.5 }] }), 0, 5), 0, 30);
  near(ramp.span, (1 + 2) / 2 * 2 + (2 + 0.5) / 2 * 3, 1e-6, "台形の和");
});

test("planVoice: 素材より長い指定は素材の端で止める / 鳴らない物は null", () => {
  const short = planVoice(item(clip("c", 0, 5, { in: 0, out: 5 }), 0, 5), 0, 3);
  assert.equal(short.offset, 0);
  assert.equal(short.span, 3, "素材が 3 秒しか無ければ 3 秒");
  assert.equal(planVoice(item(clip("c", 0, 5), 0, 5), 9, 30), null, "もう過ぎている");
  assert.equal(planVoice(item(clip("c", 0, 5), 0, 5), 0, 0), null, "素材の長さが 0");
  assert.equal(planVoice(null, 0, 30), null);
  assert.equal(planVoice({}, 0, 30), null);
  /* 素材の端を越えた in でも throw しない（eval.js が張り付かせる） */
  const over = planVoice(item(clip("c", 0, 5, { in: 100, out: 105 }), 0, 5), 0, 30);
  assert.ok(over === null || (over.offset <= 30 && over.span >= 0), "端で止まる");
});

test("clipGainAt / clipPanAt: フェードとキーを同じ式で読む", () => {
  const c = clip("c", 0, 4, { volume: 0.8, audioFade: { in: 1, out: 1, curve: "linear" } });
  near(clipGainAt(c, 0), 0, 1e-9, "頭は 0");
  near(clipGainAt(c, 0.5), 0.4, 1e-9, "フェードの真ん中は半分");
  near(clipGainAt(c, 2), 0.8, 1e-9, "真ん中は素の音量");
  near(clipGainAt(c, 4), 0, 1e-9, "尻は 0");
  /* 曲線の形（core/eval.js の fadeShape と同じ） */
  const exp = clip("c", 0, 4, { volume: 1, audioFade: { in: 1, out: 0, curve: "exp" } });
  near(clipGainAt(exp, 0.5), 0.25, 1e-9, "exp は 2 乗");
  const lg = clip("c", 0, 4, { volume: 1, audioFade: { in: 1, out: 0, curve: "log" } });
  near(clipGainAt(lg, 0.25), 0.5, 1e-9, "log は √");
  /* キーフレームは静的な値より強い */
  const keyed = clip("c", 0, 4, { volume: 1, keys: { volume: [{ t: 0, v: 0, ease: "linear" }, { t: 4, v: 1, ease: "linear" }] } });
  near(clipGainAt(keyed, 2), 0.5, 1e-6, "キーの間は補間");
  /* パン */
  assert.equal(clipPanAt(clip("c", 0, 4, { pan: -0.5 }), 1), -0.5);
  assert.equal(clipPanAt(clip("c", 0, 4, {}), 1), 0);
  assert.equal(clipPanAt(clip("c", 0, 4, { pan: 9 }), 1), 1, "値域に収める");
  /* 壊れた入力 */
  assert.ok(Number.isFinite(clipGainAt(null, 0)) || clipGainAt(null, 0) === 1);
});
