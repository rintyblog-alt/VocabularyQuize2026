/* ══════════════════════════════════════════════════════════════════════
   tests/analysis-audio.test.mjs — analysis/audio.js の試験（node --test）

   ここは自動編集（無音カット・ビート合わせ・ダッキング・見せ場選び）の土台で、
   狂っても画面には何も出ず「なぜか間が悪い動画」だけが出てくる。だから
   **合成波を自分で作って数で押さえる**:
     ・440Hz サイン（純音。RMS は必ず -3.01dBFS）
     ・440Hz 矩形（倍音が在る = 純音より声に近いが声では無い）
     ・無音区間を挟んだトーン（無音の端を ±50ms で当てられるか）
     ・120BPM のクリック列（BPM を ±2 で当て、最初のクリックに位相が合うか）
     ・白色雑音（決定論の乱数。拍も声も「無い」と言えるか）
     ・声らしい合成音（倍音 + フォルマント + 音節の揺れ。声だけが閾値を越えるか）
   併せて「値域と NaN 無し」「長さ 0 の入力で落ちない」を全部の口で確かめる。
   NaN は 秒 → フレーム → 書き出し枚数 まで伝染して原因が分からなくなるので、
   ここで止める。
   ══════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_FLOOR, dbFromAmp, ampFromDb, nextPow2, hannWindow,
  toMono, readAudio, decimateMono, fft,
  rmsCurve, kWeight, loudnessCurve, silenceThreshold, detectSilence,
  speechFeatures, detectSpeech, onsetCurve, onsetEnvelope, detectBeats,
  energyBands, findMusicDrops, beatTimes, buildBeatGrid, snapToBeat,
  summarizeForLLM, summarizeAudioForLLM,
} from "../src/analysis/audio.js";

const SR = 48000;

/* ── 合成波を作る道具（試験が揺れないよう乱数も決定論） ────────── */

/** 契約書 §6 が受ける形（AudioBuffer の代わり）。channels は Float32Array の配列 */
function makeBuf(channels, sampleRate = SR) {
  const chans = channels.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c)));
  return {
    sampleRate, length: chans[0] ? chans[0].length : 0, numberOfChannels: chans.length,
    getChannelData: (i) => chans[i],
  };
}
const mono = (x, sr = SR) => makeBuf([x], sr);
const zeros = (dur, sr = SR) => new Float32Array(Math.round(dur * sr));

function sine(dur, freq, amp = 1, sr = SR) {
  const x = zeros(dur, sr);
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}
function square(dur, freq, amp = 1, sr = SR) {
  const x = zeros(dur, sr);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / sr) >= 0 ? amp : -amp;
  return x;
}
/** mulberry32（種を固定した乱数。Math.random を使うと試験が日替わりで落ちる） */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(dur, amp = 0.35, sr = SR, seed = 1) {
  const r = rng(seed), x = zeros(dur, sr);
  for (let i = 0; i < x.length; i++) x[i] = amp * (r() * 2 - 1);
  return x;
}
function cat(...parts) {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
/** 2kHz の減衰バーストを bpm 間隔で並べたクリック列（メトロノーム） */
function clicks(dur, bpm, offset = 0.3, sr = SR) {
  const x = zeros(dur, sr), period = 60 / bpm, len = Math.round(0.01 * sr);
  for (let t = offset; t < dur; t += period) {
    const at = Math.round(t * sr);
    for (let k = 0; k < len; k++) {
      const i = at + k;
      if (i < x.length) x[i] += Math.sin((2 * Math.PI * 2000 * k) / sr) * Math.exp(-k / (0.003 * sr));
    }
  }
  return x;
}
/**
 * 声らしい合成音: 倍音列 × フォルマント 4 本 × 4.2Hz の音節揺れ + 子音の雑音。
 * 純音や矩形波と違って **倍音が密に詰まり、音節ごとに音量が揺れる**（= 声の手掛かり）。
 * 作るのが重いので、試験からは下の VOICE を切り出して使い回す。
 */
const FORMANTS = [[520, 90, 1], [1500, 130, 0.5], [2600, 180, 0.28], [3500, 250, 0.12]];
function voice(dur, sr = SR, seed = 7) {
  const r = rng(seed), x = zeros(dur, sr);
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const f0 = 118 + 14 * Math.sin(2 * Math.PI * 0.7 * t) + 5 * Math.sin(2 * Math.PI * 5.3 * t);
    let v = 0;
    for (let h = 1; h * f0 < 6500; h++) {
      const f = f0 * h;
      let g = 0;
      for (const [fc, bw, a] of FORMANTS) { const u = (f - fc) / bw; g += a / (1 + u * u); }
      if (g / h > 0.002) v += (g / h) * Math.sin(2 * Math.PI * f * t + ((h * h * 0.7) % 6.283));
    }
    const gate = Math.max(0, Math.sin(2 * Math.PI * 4.2 * t));
    const burst = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 4.2 * t - 0.9)), 14);
    x[i] = 0.42 * (v * (0.2 + 0.8 * Math.pow(gate, 0.6)) * 0.5 + 0.35 * (r() * 2 - 1) * burst);
  }
  return x;
}
const VOICE = voice(3.2);
/** VOICE の頭から dur 秒（同じ物を作り直すと試験が数秒遅くなる） */
const voiceOf = (dur) => VOICE.slice(0, Math.round(dur * SR));

/* ── 共通の見張り ─────────────────────────────────────────── */

function allFinite(arr, label) {
  for (let i = 0; i < arr.length; i++) {
    assert.ok(Number.isFinite(arr[i]), `${label}[${i}] が有限でない: ${arr[i]}`);
  }
}
function inRange(arr, lo, hi, label) {
  allFinite(arr, label);
  for (let i = 0; i < arr.length; i++) {
    assert.ok(arr[i] >= lo && arr[i] <= hi, `${label}[${i}] = ${arr[i]} が ${lo}..${hi} の外`);
  }
}
const meanOf = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return arr.length ? s / arr.length : 0; };

/* ── 0. dB と小道具 ───────────────────────────────────────── */

test("dBFS: 0 振幅は下限で止まる（-Infinity を外へ出さない）", () => {
  assert.equal(dbFromAmp(0), DB_FLOOR);
  assert.equal(dbFromAmp(NaN), DB_FLOOR);
  assert.ok(Math.abs(dbFromAmp(1) - 0) < 1e-6);
  assert.ok(Math.abs(dbFromAmp(0.5) + 6.0206) < 1e-3);
  assert.ok(Math.abs(dbFromAmp(-0.5) + 6.0206) < 1e-3, "符号は見ない");
  assert.ok(Math.abs(ampFromDb(-6.0206) - 0.5) < 1e-4);
  assert.equal(ampFromDb(DB_FLOOR), 0);
  assert.ok(Number.isFinite(ampFromDb(NaN)));
});

test("nextPow2 / hannWindow", () => {
  assert.equal(nextPow2(1), 1);
  assert.equal(nextPow2(1000), 1024);
  assert.equal(nextPow2(1024), 1024);
  assert.equal(nextPow2(0), 1);
  assert.equal(nextPow2(NaN), 1);
  const w = hannWindow(8);
  assert.equal(w.length, 8);
  assert.ok(Math.abs(w[0]) < 1e-6 && Math.abs(w[7]) < 1e-6, "端は 0");
  assert.ok(w[4] > 0.9, "中央は 1 近く");
  allFinite(w, "hann");
  assert.equal(hannWindow(1)[0], 1, "長さ 1 で 0 除算しない");
});

/* ── 1. toMono / readAudio / decimateMono ─────────────────── */

test("toMono: 複数 channel は平均・写しを返す", () => {
  const l = Float32Array.from([1, 0.5, -1, 0]);
  const r = Float32Array.from([-1, 0.5, 1, 1]);
  const m = toMono(makeBuf([l, r]));
  assert.deepEqual(Array.from(m), [0, 0.5, 0, 0.5]);
  const one = Float32Array.from([0.25, -0.25]);
  const c = toMono(makeBuf([one]));
  c[0] = 99;
  assert.equal(one[0], 0.25, "返り値を書き換えても元の buffer は壊れない");
});

test("toMono: 壊れた入力でも落ちない", () => {
  assert.equal(toMono(null).length, 0);
  assert.equal(toMono(undefined).length, 0);
  assert.equal(toMono({}).length, 0);
  assert.equal(toMono(makeBuf([new Float32Array(0)])).length, 0);
  const nan = toMono(makeBuf([Float32Array.from([NaN, Infinity, 0.5])]));
  assert.deepEqual(Array.from(nan), [0, 0, 0.5], "NaN / Infinity は 0 に落ちる");
  // numberOfChannels が嘘（getChannelData が投げる）でも取れた channel で進む
  const broken = {
    sampleRate: SR, length: 3, numberOfChannels: 4,
    getChannelData: (i) => { if (i > 0) throw new Error("no such channel"); return Float32Array.from([1, 1, 1]); },
  };
  assert.deepEqual(Array.from(toMono(broken)), [1, 1, 1]);
  // 素の Float32Array もそのまま受ける（float32 に丸まるので誤差で見る）
  const raw = toMono(Float32Array.from([0.1, 0.2]));
  assert.equal(raw.length, 2);
  assert.ok(Math.abs(raw[0] - 0.1) < 1e-6 && Math.abs(raw[1] - 0.2) < 1e-6);
});

test("readAudio: 標本周波数と尺をそろえる", () => {
  const a = readAudio(mono(sine(0.5, 440, 1, 44100), 44100));
  assert.equal(a.sampleRate, 44100);
  assert.ok(Math.abs(a.duration - 0.5) < 1e-9);
  const b = readAudio(new Float32Array(2400), { sampleRate: 24000 });
  assert.equal(b.sampleRate, 24000);
  assert.ok(Math.abs(b.duration - 0.1) < 1e-9);
  const c = readAudio(mono(new Float32Array(10), NaN));
  assert.equal(c.sampleRate, 48000, "壊れた sampleRate は 48000 に落ちる");
  assert.equal(readAudio(null).duration, 0);
});

test("decimateMono: 箱平均で整数分の 1 に間引く", () => {
  const x = Float32Array.from([1, 1, 1, 1, -1, -1, -1, -1]);
  assert.deepEqual(Array.from(decimateMono(x, 4)), [1, -1]);
  assert.equal(decimateMono(x, 1), x, "factor 1 はそのまま");
  assert.equal(decimateMono(new Float32Array(0), 4).length, 0);
  // 440Hz サインを 4 分の 1 に間引いても振幅はだいたい残る（折り返しは起きない）
  const d = decimateMono(sine(0.1, 440), 4);
  assert.equal(d.length, Math.round(0.1 * SR) / 4);
  assert.ok(Math.abs(dbFromAmp(Math.sqrt(meanOf(d.map((v) => v * v)))) + 3.01) < 0.5);
});

/* ── 2. FFT（自前なので正しさを直に見る） ─────────────────── */

test("fft: 既知のサインが該当 bin に山を作る", () => {
  for (const [n, bin] of [[64, 5], [256, 17], [1024, 128]]) {
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / n);
    fft(re, im);
    let best = -1, at = -1;
    for (let b = 0; b <= n / 2; b++) {
      const m = Math.hypot(re[b], im[b]);
      if (m > best) { best = m; at = b; }
    }
    assert.equal(at, bin, `n=${n} の山が bin ${bin} に無い`);
    assert.ok(Math.abs(best - n / 2) < 1e-3, `山の高さは n/2（来たのは ${best}）`);
    // 山以外はほぼ 0（漏れ込みが無いのを確かめる）
    for (let b = 0; b <= n / 2; b++) {
      if (Math.abs(b - bin) > 1) assert.ok(Math.hypot(re[b], im[b]) < 1e-3, `n=${n} bin ${b} に漏れ`);
    }
  }
});

test("fft: 直流・線形性・パーセバル", () => {
  const n = 128;
  const re = new Float32Array(n).fill(0.5), im = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += re[i] * re[i];
  fft(re, im);
  assert.ok(Math.abs(re[0] - 0.5 * n) < 1e-4, "直流は bin 0");
  assert.ok(Math.abs(im[0]) < 1e-6);
  for (let b = 1; b < n; b++) assert.ok(Math.hypot(re[b], im[b]) < 1e-3);
  // パーセバル: Σ|x|² = (1/N) Σ|X|²
  const re2 = new Float32Array(n), im2 = new Float32Array(n);
  const r = rng(5);
  let e2 = 0;
  for (let i = 0; i < n; i++) { re2[i] = r() * 2 - 1; e2 += re2[i] * re2[i]; }
  fft(re2, im2);
  let spec = 0;
  for (let b = 0; b < n; b++) spec += re2[b] * re2[b] + im2[b] * im2[b];
  assert.ok(Math.abs(spec / n - e2) < 1e-3, `パーセバルが崩れている ${spec / n} vs ${e2}`);
});

test("fft: 壊れた長さは黙らず投げる", () => {
  assert.throws(() => fft(new Float32Array(100), new Float32Array(100)), /2 の冪/);
  assert.throws(() => fft(new Float32Array(8), new Float32Array(4)), /同じ長さ/);
  assert.throws(() => fft(null, null), /re と im/);
  const one = new Float32Array([3]), oneIm = new Float32Array(1);
  fft(one, oneIm);
  assert.equal(one[0], 3, "長さ 1 は何もしない");
  fft(new Float32Array(0), new Float32Array(0));  // 長さ 0 でも落ちない
});

/* ── 3. 音量の曲線 ────────────────────────────────────────── */

test("rmsCurve: 440Hz サインは全域 -3.01dBFS", () => {
  const c = rmsCurve(sine(1, 440), SR, { hz: 20 });
  assert.equal(c.length, 20, "1 秒 × 20Hz = 20 本");
  inRange(c, -4, -2, "rms(sine)");
  for (let i = 0; i < c.length; i++) assert.ok(Math.abs(c[i] + 3.0103) < 0.05, `frame ${i} が ${c[i]}`);
});

test("rmsCurve: 無音は下限・振幅半分で -6dB・端の窓は薄まらない", () => {
  const s = rmsCurve(zeros(0.5), SR, { hz: 20 });
  assert.equal(s.length, 10);
  for (const v of s) assert.equal(v, DB_FLOOR);
  const half = rmsCurve(sine(1, 440, 0.5), SR, { hz: 20 });
  assert.ok(Math.abs(half[0] - (-3.0103 - 6.0206)) < 0.05);
  // 尺が hop の倍数でない時も最後の窓が「在る標本だけ」で平均される
  const odd = rmsCurve(sine(0.62, 440), SR, { hz: 20 });
  assert.equal(odd.length, Math.ceil(0.62 * 20));
  assert.ok(Math.abs(odd[odd.length - 1] + 3.0103) < 0.2, "尻尾が勝手にフェードしない");
  assert.equal(rmsCurve(new Float32Array(0), SR).length, 0);
  assert.equal(rmsCurve(null, SR).length, 0);
});

test("kWeight / loudnessCurve: 高域が少し持ち上がる（相対比較に使える）", () => {
  const lo = loudnessCurve(mono(sine(2, 60, 0.5)));
  const hi = loudnessCurve(mono(sine(2, 3000, 0.5)));
  assert.ok(Array.isArray(lo.values), "§1 の形に合わせて普通の Array（typed array だと index.js が落とす）");
  assert.equal(lo.hz, 20);
  assert.equal(lo.values.length, 40);
  inRange(lo.values, -70, 0, "loudness(60Hz)");
  inRange(hi.values, -70, 0, "loudness(3kHz)");
  const mid = lo.values.length >> 1;
  assert.ok(hi.values[mid] > lo.values[mid] + 3, `高域が持ち上がっていない ${hi.values[mid]} vs ${lo.values[mid]}`);
  // 音量を下げれば値も下がる（単調）
  const quiet = loudnessCurve(mono(sine(2, 1000, 0.05)));
  const loud = loudnessCurve(mono(sine(2, 1000, 0.5)));
  assert.ok(loud.values[mid] > quiet.values[mid] + 15);
  // 直流は抜ける（high-pass）
  const dc = kWeight(new Float32Array(4800).fill(0.8), SR);
  assert.ok(Math.abs(dc[4000]) < 0.05, `直流が残っている ${dc[4000]}`);
  const empty = loudnessCurve(mono(new Float32Array(0)));
  assert.deepEqual(empty.values, []);
  assert.equal(empty.hz, 20);
});

/* ── 4. 無音（±50ms） ───────────────────────────────────── */

const SIL_SIG = cat(sine(1, 440, 0.8), zeros(0.6), sine(1, 440, 0.8), zeros(0.2), sine(0.5, 440, 0.8));

test("detectSilence: 無音の端を ±50ms で当てる", () => {
  const got = detectSilence(mono(SIL_SIG), { pad: 0 });
  assert.equal(got.length, 1, "0.2s の隙間は minDur(0.35) 未満なので拾わない");
  assert.ok(Math.abs(got[0].start - 1.0) <= 0.05, `start=${got[0].start}`);
  assert.ok(Math.abs(got[0].end - 1.6) <= 0.05, `end=${got[0].end}`);
  // minDur を下げれば短い隙間も拾う（start 昇順・重なり無し）
  const both = detectSilence(mono(SIL_SIG), { pad: 0, minDur: 0.15 });
  assert.equal(both.length, 2);
  assert.ok(Math.abs(both[1].start - 2.6) <= 0.05 && Math.abs(both[1].end - 2.8) <= 0.05);
  for (let i = 1; i < both.length; i++) assert.ok(both[i].start >= both[i - 1].end);
});

test("detectSilence: pad は内側へ詰める・relative は小さく録れた素材でも効く", () => {
  const padded = detectSilence(mono(SIL_SIG), {});
  assert.equal(padded.length, 1);
  assert.ok(Math.abs(padded[0].start - 1.08) <= 0.05, `start=${padded[0].start}`);
  assert.ok(Math.abs(padded[0].end - 1.52) <= 0.05, `end=${padded[0].end}`);
  // 全体を 1/100（-40dB）にしても同じ所を無音と言える（絶対 -38dBFS では取れない）
  const quiet = SIL_SIG.map((v) => v * 0.01);
  const rel = detectSilence(mono(quiet), { pad: 0 });
  assert.equal(rel.length, 1);
  assert.ok(Math.abs(rel[0].start - 1.0) <= 0.05 && Math.abs(rel[0].end - 1.6) <= 0.05);
  // 逆に絶対値（-38dBFS）だと、この素材は **丸ごと無音**になる。これが relative を既定にした理由
  const abs = detectSilence(mono(quiet), { pad: 0, relative: false });
  assert.equal(abs.length, 1);
  assert.ok(abs[0].end - abs[0].start > 3, `絶対値だと全部が無音になる ${JSON.stringify(abs)}`);
  assert.equal(silenceThreshold(rmsCurve(quiet, SR, { hz: 100 }), { relative: false }), -38);
  assert.ok(silenceThreshold(rmsCurve(quiet, SR, { hz: 100 }), {}) < -38, "relative は素材に合わせて下がる");
});

test("detectSilence: 端まで無音・全部無音・長さ 0", () => {
  const head = detectSilence(mono(cat(zeros(0.8), sine(1, 440, 0.8))), { pad: 0 });
  assert.equal(head.length, 1);
  assert.equal(head[0].start, 0);
  assert.ok(Math.abs(head[0].end - 0.8) <= 0.05);
  const all = detectSilence(mono(zeros(1)), { pad: 0 });
  assert.equal(all.length, 1);
  assert.ok(all[0].start === 0 && Math.abs(all[0].end - 1) <= 0.05, "無音しか無い素材は 1 本の無音");
  assert.deepEqual(detectSilence(mono(new Float32Array(0))), []);
  assert.deepEqual(detectSilence(null), []);
  for (const s of detectSilence(mono(SIL_SIG), {})) {
    assert.ok(Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  }
});

/* ── 5. 声（矩形とサインを区別する） ──────────────────────── */

const V_VOICE = voiceOf(3);
const V_SINE = sine(3, 440, 0.8);
const V_SQUARE = square(3, 440, 0.8);
const V_NOISE = noise(3, 0.4);

test("speechFeatures: 声 > 矩形 > サイン（倍音の詰まり具合で分かれる）", () => {
  const s = (x) => speechFeatures(mono(x));
  const fv = s(V_VOICE), fq = s(V_SQUARE), fs = s(V_SINE), fn = s(V_NOISE);
  for (const [f, label] of [[fv, "voice"], [fq, "square"], [fs, "sine"], [fn, "noise"]]) {
    inRange(f.score, 0, 1, `score(${label})`);
    inRange(f.zcr, 0, 1, `zcr(${label})`);
    inRange(f.flat, 0, 1, `flat(${label})`);
    inRange(f.band, 0, 1, `band(${label})`);
    inRange(f.hf, 0, 1, `hf(${label})`);
    allFinite(f.rmsDb, `rmsDb(${label})`);
    assert.ok(f.count > 0 && f.hz > 0);
  }
  const mv = meanOf(fv.score), mq = meanOf(fq.score), ms = meanOf(fs.score), mn = meanOf(fn.score);
  assert.ok(mv > mq + 0.08, `声(${mv.toFixed(3)}) が矩形(${mq.toFixed(3)}) より上でない`);
  assert.ok(mq > ms + 0.08, `矩形(${mq.toFixed(3)}) がサイン(${ms.toFixed(3)}) より上でない`);
  assert.ok(mv > mn + 0.2, `声(${mv.toFixed(3)}) が白色雑音(${mn.toFixed(3)}) より上でない`);
  // 純音は倍音が無い = 平坦度も高域比も 0 近く、矩形は倍音が在る
  assert.ok(fs.flat[20] < fq.flat[20], "サインの方が平坦度が低い（山 1 本）");
  assert.ok(fs.hf[20] < fq.hf[20] * 0.1, "サインは高域が皆無");
  assert.ok(Math.abs(fs.zcr[20] - fq.zcr[20]) < 0.01, "ゼロ交差率だけでは同じに見える（だから他の特徴が要る）");
});

test("detectSpeech: 声だけを区間にする（サイン・矩形・雑音・和音は返さない）", () => {
  const segs = detectSpeech(mono(V_VOICE));
  assert.ok(segs.length >= 1, "声が 1 区間も出ない");
  assert.ok(segs[0].conf >= 0.47 && segs[0].conf <= 1, `conf=${segs[0].conf}`);
  const covered = segs.reduce((a, s) => a + (s.end - s.start), 0);
  assert.ok(covered > 2.0, `声の被りが足りない ${covered.toFixed(2)}s / 3s`);
  assert.deepEqual(detectSpeech(mono(V_SINE)), [], "純音は声では無い");
  assert.deepEqual(detectSpeech(mono(V_SQUARE)), [], "矩形波も声では無い（サインより近いだけ）");
  assert.deepEqual(detectSpeech(mono(V_NOISE)), [], "白色雑音は声では無い");
  const chord = cat();
  const ch = zeros(3);
  for (const f of [220, 277, 330, 440]) { const t = sine(3, f, 0.25); for (let i = 0; i < ch.length; i++) ch[i] += t[i]; }
  assert.deepEqual(detectSpeech(mono(ch)), [], "和音（音楽）は声では無い");
  assert.equal(chord.length, 0);
});

test("detectSpeech: 無音・雑音に挟まれた声の位置が合う", () => {
  const sig = cat(zeros(0.7), voiceOf(2), zeros(0.7));
  const segs = detectSpeech(mono(sig));
  assert.ok(segs.length >= 1);
  const start = segs[0].start, end = segs[segs.length - 1].end;
  assert.ok(Math.abs(start - 0.7) < 0.25, `声の頭 ${start}`);
  assert.ok(Math.abs(end - 2.7) < 0.25, `声の尻 ${end}`);
  for (const s of segs) assert.ok(s.end > s.start && s.start >= 0 && s.end <= 3.4 + 1e-6);
  // 声 → 雑音 → 声 は雑音の所で切れる（音楽との弁別が目的）
  const mixed = detectSpeech(mono(cat(voiceOf(1.6), noise(1.0, 0.35), voiceOf(1.6))));
  assert.ok(mixed.length >= 2, `雑音で切れていない ${JSON.stringify(mixed)}`);
  assert.deepEqual(detectSpeech(mono(new Float32Array(0))), []);
  assert.deepEqual(detectSpeech(null), []);
});

/* ── 6. オンセット ───────────────────────────────────────── */

test("onsetCurve: クリックの位置に山が立つ・持続音では立たない", () => {
  const env = onsetEnvelope(clicks(4, 120, 0.3), SR, { fftSize: 1024, hop: 512 });
  inRange(env.values, 0, 1, "onset");
  assert.ok(Math.abs(env.hz - SR / 512) < 1e-9);
  assert.ok(Math.abs(env.t0 - 1024 / (2 * SR)) < 1e-12, "frame の時刻は窓の中心");
  const peaks = [];
  for (let i = 1; i < env.values.length - 1; i++) {
    if (env.values[i] > 0.4 && env.values[i] >= env.values[i - 1] && env.values[i] > env.values[i + 1]) peaks.push(env.t0 + i / env.hz);
  }
  assert.ok(peaks.length >= 7, `クリック 8 個に対し山が ${peaks.length} 個`);
  for (let k = 0; k < peaks.length; k++) {
    const want = 0.3 + 0.5 * k;
    assert.ok(Math.abs(peaks[k] - want) < 0.025, `${k} 個目の山 ${peaks[k].toFixed(3)} が ${want} から離れている`);
  }
  // 持続音（440Hz サイン）は立ち上がりが無い
  const steady = onsetCurve(sine(1, 440), SR);
  inRange(steady, 0, 1, "onset(sine)");
  assert.ok(Math.max(...steady) < 0.05, `持続音で山が立った ${Math.max(...steady)}`);
  assert.equal(onsetCurve(new Float32Array(0), SR).length, 0);
  assert.equal(onsetCurve(zeros(0.2), SR).length, Math.ceil((0.2 * SR) / 512), "無音でも長さは返る");
  inRange(onsetCurve(zeros(0.2), SR), 0, 1, "onset(silence)");
});

/* ── 7. 拍 ───────────────────────────────────────────────── */

test("detectBeats: 120BPM を ±2 で当て、最初のクリックに位相が合う", () => {
  const r = detectBeats(mono(clicks(12, 120, 0.3)));
  assert.ok(Math.abs(r.bpm - 120) <= 2, `bpm=${r.bpm}`);
  assert.ok(Math.abs(r.offset - 0.3) <= 0.04, `offset=${r.offset}`);
  assert.ok(r.conf > 0.5, `conf=${r.conf}`);
  assert.ok(r.times.length >= 22 && r.times.length <= 25, `拍の本数 ${r.times.length}`);
  allFinite(r.times, "times");
  for (let i = 1; i < r.times.length; i++) {
    assert.ok(Math.abs(r.times[i] - r.times[i - 1] - 0.5) < 0.01, "拍の間隔が 0.5s でない");
    assert.ok(r.times[i] > r.times[i - 1], "times は昇順");
  }
  assert.ok(r.times[0] >= 0 && r.times[r.times.length - 1] <= 12 + 1e-9);
  // 小節頭は拍の部分集合で 4 拍おき
  assert.ok(r.downbeats.length >= 5);
  for (const t of r.downbeats) assert.ok(r.times.some((x) => Math.abs(x - t) < 1e-9), `downbeat ${t} が times に無い`);
  for (let i = 1; i < r.downbeats.length; i++) {
    assert.ok(Math.abs(r.downbeats[i] - r.downbeats[i - 1] - 2.0) < 0.02, "小節が 4 拍でない");
  }
});

test("detectBeats: 90 / 150BPM と 44.1kHz でも ±2（倍・半分に化けない）", () => {
  for (const bpm of [90, 150]) {
    const r = detectBeats(mono(clicks(12, bpm, 0.3)));
    assert.ok(Math.abs(r.bpm - bpm) <= 2, `${bpm}BPM → ${r.bpm}`);
    assert.ok(Math.abs(r.offset - 0.3) <= 0.04, `${bpm}BPM の offset=${r.offset}`);
    assert.ok(r.conf > 0.5);
  }
  const r441 = detectBeats(mono(clicks(12, 120, 0.3, 44100), 44100));
  assert.ok(Math.abs(r441.bpm - 120) <= 2, `44.1kHz → ${r441.bpm}`);
  assert.ok(Math.abs(r441.offset - 0.3) <= 0.04);
  // minBpm / maxBpm の外は選ばない
  const narrow = detectBeats(mono(clicks(12, 120, 0.3)), { minBpm: 150, maxBpm: 200 });
  assert.ok(narrow.bpm >= 150 - 1e-6 && narrow.bpm <= 200 + 1e-6, `範囲外の bpm=${narrow.bpm}`);
});

test("detectBeats: 拍が無い素材は必ず低い conf（形は崩さない）", () => {
  const nz = detectBeats(mono(V_NOISE.length ? noise(12, 0.4) : new Float32Array(0)));
  assert.ok(Number.isFinite(nz.bpm) && Number.isFinite(nz.conf));
  assert.ok(nz.conf < 0.5, `白色雑音の conf が高い ${nz.conf}`);
  const silent = detectBeats(mono(zeros(5)));
  assert.deepEqual(silent, { bpm: 0, offset: 0, times: [], downbeats: [], conf: 0 }, "無音は拍なし");
  const tone = detectBeats(mono(sine(5, 440)));
  assert.ok(tone.conf < 0.6, `持続音の conf が高い ${tone.conf}`);
  for (const bad of [mono(new Float32Array(0)), null, undefined, mono(new Float32Array(64))]) {
    const r = detectBeats(bad);
    assert.equal(typeof r.bpm, "number");
    assert.ok(Array.isArray(r.times) && Array.isArray(r.downbeats));
    assert.ok(Number.isFinite(r.bpm) && Number.isFinite(r.offset) && Number.isFinite(r.conf));
  }
});

/* ── 8. 帯域エネルギーと盛り上がり ───────────────────────── */

test("energyBands: 低い音は low、高い音は high に出る", () => {
  const b = energyBands(mono(cat(sine(2, 80, 0.9), sine(2, 8000, 0.9))), { hz: 10 });
  assert.equal(b.count, 40);
  assert.ok(Math.abs(b.hz - 10) < 1e-9);
  for (const k of ["low", "mid", "high"]) inRange(b[k], 0, 1, k);
  assert.ok(b.low[10] > 0.5 && b.high[10] < 0.1, `前半 low=${b.low[10]} high=${b.high[10]}`);
  assert.ok(b.high[30] > 0.5 && b.low[30] < 0.1, `後半 low=${b.low[30]} high=${b.high[30]}`);
  const mid = energyBands(mono(sine(1, 1000, 0.9)), { hz: 10 });
  assert.ok(mid.mid[5] > 0.5, `1kHz が mid に出ない ${mid.mid[5]}`);
  const e = energyBands(mono(new Float32Array(0)));
  assert.equal(e.count, 0);
  assert.equal(e.low.length, 0);
  assert.equal(energyBands(null).count, 0);
});

test("findMusicDrops: 静かな所から低域が戻る瞬間を拾う", () => {
  const bands = energyBands(mono(cat(noise(3, 0.02), sine(3, 80, 0.9))), { hz: 10 });
  const drops = findMusicDrops(bands);
  assert.ok(drops.length >= 1, "盛り上がりが 1 つも出ない");
  assert.ok(Math.abs(drops[0].t - 3.0) < 0.35, `drop の時刻 ${drops[0].t}`);
  for (const d of drops) {
    assert.ok(Number.isFinite(d.t) && d.t >= 0);
    assert.ok(d.score > 0 && d.score <= 1);
  }
  for (let i = 1; i < drops.length; i++) assert.ok(drops[i].t > drops[i - 1].t, "t 昇順");
  // 一定の音には盛り上がりが無い
  assert.deepEqual(findMusicDrops(energyBands(mono(sine(6, 80, 0.9)), { hz: 10 })), []);
  assert.deepEqual(findMusicDrops(null), []);
  assert.deepEqual(findMusicDrops({}), []);
  assert.deepEqual(findMusicDrops(energyBands(mono(new Float32Array(0)))), []);
});

/* ── 9. 拍の格子と吸い付き ───────────────────────────────── */

const BEATS = { bpm: 120, offset: 0.25, times: [0.25, 0.75, 1.25, 1.75], downbeats: [0.25], conf: 0.9 };

test("buildBeatGrid: divide で 1 拍を割る", () => {
  assert.deepEqual(buildBeatGrid(BEATS), [0.25, 0.75, 1.25, 1.75]);
  assert.deepEqual(buildBeatGrid(BEATS, { divide: 2 }), [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const q = buildBeatGrid(BEATS, { divide: 4 });
  assert.equal(q.length, 16);
  for (let i = 1; i < q.length; i++) assert.ok(Math.abs(q[i] - q[i - 1] - 0.125) < 1e-9, "16 分が等間隔でない");
  // 時刻の配列そのもの・[{t}]・{bpm,offset} も受ける
  assert.deepEqual(buildBeatGrid([1, 0.5, 1.5]), [0.5, 1, 1.5], "昇順に直す");
  assert.deepEqual(buildBeatGrid([{ t: 0.5 }, { t: 1 }]), [0.5, 1]);
  const gen = buildBeatGrid({ bpm: 120, offset: 0, duration: 1.2 });
  assert.deepEqual(gen, [0, 0.5, 1]);
  // until で延ばす / 超えた分は捨てる
  const until = buildBeatGrid(BEATS, { until: 3 });
  assert.deepEqual(until, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]);
  assert.deepEqual(buildBeatGrid([]), []);
  assert.deepEqual(buildBeatGrid(null), []);
  assert.deepEqual(buildBeatGrid({ bpm: 0, times: [] }), []);
  assert.deepEqual(buildBeatGrid([0.4]), [0.4], "拍 1 つなら 1 つだけ");
  for (const t of buildBeatGrid(BEATS, { divide: 3 })) assert.ok(Number.isFinite(t));
});

test("snapToBeat: 近ければ吸い付き、遠ければそのまま", () => {
  assert.equal(snapToBeat(0.78, BEATS), 0.75);
  assert.equal(snapToBeat(0.7, BEATS), 0.75, "手前からも吸い付く");
  assert.equal(snapToBeat(1.0, BEATS), 1.0, "0.12s より遠いので動かさない");
  assert.equal(snapToBeat(1.1, BEATS, { max: 0.3 }), 1.25, "max を広げれば吸い付く");
  assert.equal(snapToBeat(1.0, BEATS, { max: 0.3 }), 0.75, "等距離なら手前の拍（決定論）");
  assert.equal(snapToBeat(0.25, BEATS), 0.25);
  assert.equal(snapToBeat(-5, BEATS), -5, "範囲外はそのまま");
  assert.equal(snapToBeat(0.78, BEATS.times), 0.75, "時刻の配列でも良い");
  assert.equal(snapToBeat(1.5, []), 1.5, "拍が無ければ何もしない");
  assert.equal(snapToBeat(1.5, null), 1.5);
  assert.equal(snapToBeat(NaN, BEATS), 0, "NaN は 0 扱い（0.25 は max より遠いので動かさない）");
  assert.equal(snapToBeat(NaN, BEATS, { max: 0.3 }), 0.25, "NaN + 広い max なら先頭の拍へ");
  assert.equal(snapToBeat(0.76, BEATS, { max: 0 }), 0.76, "max 0 なら動かさない");
  // 実際の解析結果に対しても冪等（2 回通しても動かない）
  const r = detectBeats(mono(clicks(6, 120, 0.3)));
  const a = snapToBeat(2.0, r), b = snapToBeat(a, r);
  assert.equal(b, a);
});

test("beatTimes: どの形でも昇順の時刻列になる", () => {
  assert.deepEqual(beatTimes(BEATS), [0.25, 0.75, 1.25, 1.75]);
  assert.deepEqual(beatTimes([2, 1, NaN, 3]), [1, 2, 3], "壊れた値は落とす");
  assert.deepEqual(beatTimes(Float32Array.from([0.5, 0.25])), [0.25, 0.5]);
  assert.deepEqual(beatTimes({}), []);
  assert.deepEqual(beatTimes({ bpm: 60, offset: 0 }, { until: 2 }), [0, 1, 2]);
});

/* ── 10. LLM への要約 ───────────────────────────────────── */

test("summarizeForLLM: 音の要点を 1 行にする", () => {
  const analysis = {
    duration: 12.3,
    loudness: loudnessCurve(mono(sine(2, 440, 0.5))),
    silence: [{ start: 1, end: 2 }, { start: 5, end: 5.6 }],
    speech: [{ start: 2, end: 6, conf: 0.8 }],
    beats: { bpm: 120.2, offset: 0.3, times: [], downbeats: [], conf: 0.7 },
    drops: [{ t: 8.2, score: 0.5 }],
  };
  const s = summarizeForLLM(analysis);
  assert.equal(typeof s, "string");
  assert.ok(s.includes("BPM 120"), s);
  assert.ok(s.includes("無音 2 箇所"), s);
  assert.ok(s.includes("声 1 区間"), s);
  assert.ok(s.includes("尺 12.3s"), s);
  assert.ok(!/NaN|undefined|Infinity/.test(s), `壊れた数が文面に出ている: ${s}`);
  assert.ok(summarizeForLLM(analysis, { maxChars: 40 }).length <= 40, "maxChars を守る");
  assert.equal(summarizeForLLM, summarizeAudioForLLM, "別名は同じ実装");
  // 自信の無い拍は「当てにならない」と言う（LLM に嘘の BPM を渡さない）
  assert.ok(summarizeForLLM({ duration: 5, beats: { bpm: 97, conf: 0.1 } }).includes("当てにならない"));
  assert.equal(summarizeForLLM(null), "音の解析結果が無い");
  assert.equal(summarizeForLLM({}), "音の解析結果が無い");
  assert.ok(!summarizeForLLM({ duration: 3, silence: [] }).includes("箇所"));
});

/* ── 11. 壊れた入力で落ちない（全部の口） ───────────────── */

test("長さ 0・1 標本・NaN 塗れの入力でも落ちず NaN を返さない", () => {
  const cases = [
    mono(new Float32Array(0)),
    mono(Float32Array.from([0.5])),
    mono(Float32Array.from(new Array(512).fill(NaN))),
    mono(Float32Array.from(new Array(512).fill(Infinity))),
    makeBuf([new Float32Array(0), new Float32Array(0)]),
    { sampleRate: 0, length: 0, numberOfChannels: 0, getChannelData: () => new Float32Array(0) },
  ];
  for (const b of cases) {
    const loud = loudnessCurve(b);
    inRange(loud.values, -70, 0, "loudness");
    allFinite(rmsCurve(toMono(b), 48000), "rms");
    for (const s of detectSilence(b)) assert.ok(Number.isFinite(s.start) && Number.isFinite(s.end));
    for (const s of detectSpeech(b)) assert.ok(Number.isFinite(s.start) && Number.isFinite(s.conf));
    inRange(onsetCurve(toMono(b), 48000), 0, 1, "onset");
    const beats = detectBeats(b);
    assert.ok(Number.isFinite(beats.bpm) && Number.isFinite(beats.offset) && Number.isFinite(beats.conf));
    allFinite(beats.times, "times");
    const bands = energyBands(b);
    for (const k of ["low", "mid", "high"]) inRange(bands[k], 0, 1, k);
    assert.ok(Array.isArray(findMusicDrops(bands)));
    assert.ok(Array.isArray(buildBeatGrid(beats)));
    assert.equal(typeof snapToBeat(1, beats), "number");
    assert.equal(typeof summarizeForLLM({ duration: 0, beats }), "string");
  }
});

test("opts が壊れていても既定へ落ちる", () => {
  const x = mono(cat(sine(0.5, 440, 0.8), zeros(0.5), sine(0.5, 440, 0.8)));
  assert.ok(rmsCurve(toMono(x), SR, { hz: NaN }).length > 0);
  assert.ok(loudnessCurve(x, { hz: -5 }).values.length > 0);
  assert.ok(Array.isArray(detectSilence(x, { thresholdDb: NaN, minDur: NaN, pad: NaN })));
  assert.ok(Array.isArray(detectSpeech(x, { threshold: NaN, minDur: -1 })));
  assert.ok(onsetCurve(toMono(x), SR, { fftSize: 7, hop: 0 }).length > 0, "2 の冪でない fftSize も丸める");
  const b = detectBeats(x, { minBpm: NaN, maxBpm: NaN, beatsPerBar: 0 });
  assert.ok(Number.isFinite(b.bpm));
  assert.ok(energyBands(x, { hz: 0, fftSize: 3 }).count > 0);
  assert.ok(Array.isArray(buildBeatGrid(BEATS, { divide: NaN })));
  assert.equal(snapToBeat(0.78, BEATS, { max: NaN }), 0.75);
});
