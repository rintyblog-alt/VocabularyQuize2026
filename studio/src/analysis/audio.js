/* ══════════════════════════════════════════════════════════════════════
   analysis/audio.js — 音から「自動編集が使える手掛かり」を取り出す所（契約書 §6）

   ★ 何をする所か / なぜこの形か
     音量（dBFS / K 重み付け）・無音・声らしさ・立ち上がり（オンセット）・拍（BPM と
     位相）・帯域エネルギー・盛り上がり（drop）を出す。出た物はそのまま契約書 §1 の
     `asset.analysis`（loudness / silence / speech / beats）に入る形で返す。

     ・**全部 pure 関数**にした。AudioBuffer そのものではなく
       `{ sampleRate, length, numberOfChannels, getChannelData(i) }` という形だけを
       見るので、Node の試験で合成波（サイン・矩形・クリック列・白色雑音）を作って
       1 行ずつ確かめられる。ここは自動編集（無音カット・ビート合わせ・ダッキング）の
       土台で、静かに狂うと「なぜか間が悪い動画」しか出てこなくなる所だから、
       ブラウザでしか動かない書き方を持ち込まない。
     ・**FFT も自前**（`fft(re, im)`）。外部依存ゼロが契約なので、radix-2 の
       Cooley-Tukey を置いた。回転因子は長さごとに表を作って使い回す
       （漸化式で回すと 2048 点で位相が目に見えて痺れる）。
     ・重い所は先に**間引く**（decimate）。拍は 12kHz、声は 16kHz で十分で、
       48kHz のまま FFT を回すと iPhone で数十秒かかる（§13.6: decode だけで
       数百 ms 止まる世界）。間引きは「整数分の 1 の箱平均」= 折り返しも一応抑える。
     ・返す数は必ず有限。NaN を 1 つ漏らすと 秒 → フレーム → 書き出し枚数まで
       伝染して原因が分からなくなる（video.js と同じ方針）。

   ★ 触るときの注意
     ・CONTRACT-NOTE: §6 は `loudnessCurve(buf,{hz}) -> Float32Array` だが、契約書 §1 の
       `loudness` は `{hz, values}` なので **`{hz, values}`（values は普通の Array）**を
       返す。analysis/index.js の詰め替えが `Array.isArray(c.values)` を見ているため、
       Float32Array では無く Array で持つ（ここを typed array にすると loudness が
       丸ごと null に落ちる）。素の dBFS 列が欲しい時は `rmsCurve` を直に呼ぶ。
     ・CONTRACT-NOTE: `detectBeats` は拍が見つからなくても **必ずオブジェクトを返す**
       （`{bpm:0, offset:0, times:[], downbeats:[], conf:0}`）。呼ぶ側が `.bpm` で
       落ちないため。拍として信じて良いかは **`conf`** で見る（0.3 未満は使わない）。
     ・CONTRACT-NOTE: `summarizeForLLM` は video.js にも同名が在る（あちらは映像向け）。
       `export * from "./audio.js"` を index.js に足すと ESM の星取り込みが衝突して
       名前ごと消えるので、**足すなら `summarizeAudioForLLM` を使う**（同じ実装の別名を
       export してある）。
     ・CONTRACT-NOTE: 700 行を超えている（約 1000 行）。契約書 §6 の音の解析は全て
       この 1 ファイルに置く約束で、担当外のファイルは作れないため分けられなかった。
       分けるなら `audio-fft.js`（FFT と窓）/ `audio-beat.js`（拍）/ `audio-speech.js`
       （声）の 3 つで、境界は下の見出し（§2 / §6 / §8）がそのまま切れ目になる。
     ・時刻の決め方: 窓は「左寄せの敷き詰め」が基本（frame i = `[i/hz, (i+1)/hz)`）。
       無音の端がこれで ±1 フレームに収まる。窓が hop より長い物（loudness の 400ms、
       特徴量の 40ms）だけは中心を合わせる（そうしないと値が後ろへずれる）。
   ══════════════════════════════════════════════════════════════════════ */

import { bisect, clamp, clamp01, clampInt, finite } from "../core/util.js";

/** @typedef {{sampleRate:number, length:number, numberOfChannels:number, getChannelData:(i:number)=>Float32Array}} AudioLike */
/** @typedef {{start:number, end:number}} Span */
/** @typedef {{bpm:number, offset:number, times:number[], downbeats:number[], conf:number}} Beats */

/* ── 0. 数と dB の小道具（すべて pure） ─────────────────────── */

/** dBFS の下限。振幅 0 は -Infinity なのでここで止める（NaN/Infinity を外に出さない） */
export const DB_FLOOR = -120;

/** 振幅 → dBFS */
export function dbFromAmp(a) {
  const v = Math.abs(finite(a, 0));
  return v <= 1e-6 ? DB_FLOOR : clamp(20 * Math.log10(v), DB_FLOOR, 60);
}

/** dBFS → 振幅 */
export function ampFromDb(db) {
  const v = clamp(finite(db, DB_FLOOR), DB_FLOOR, 60);
  return v <= DB_FLOOR ? 0 : Math.pow(10, v / 20);
}

/** 2 の冪へ切り上げる（FFT の長さ） */
export function nextPow2(n) {
  const v = Math.max(1, Math.round(finite(n, 1)));
  let p = 1;
  while (p < v && p < (1 << 20)) p <<= 1;
  return p;
}

/**
 * 窓の間隔（標本）と、その hop から決まる **本当の frame 周波数**。
 * `sampleRate / hz` は整数で割り切れない事が多く（22050Hz で 100Hz を頼むと
 * hop 221 = 99.77Hz）、申告どおりの hz で frame 番号を秒に直すと後ろへ行くほど
 * ずれる（50 秒で 100ms 級 = 無音カットが 1 音節ぶん外れる）。時刻に直す側は
 * 必ずこちらの hz を使う。
 */
function frameStep(sampleRate, hz) {
  const hop = Math.max(1, Math.round(sampleRate / hz));
  return { hop, hz: sampleRate / hop };
}

/** 昇順に並んだ列の百分位（空なら fallback） */
function percentileOf(sorted, p, fallback = 0) {
  const n = sorted ? sorted.length : 0;
  if (!n) return fallback;
  return finite(sorted[clamp(Math.round((n - 1) * clamp01(finite(p, 0.5))), 0, n - 1)], fallback);
}

/** 山型の当てはめ 0..1（中心から width 離れると 1/e）。特徴量 → 「らしさ」の変換に使う */
function bell(x, center, width) {
  const w = Math.max(1e-6, Math.abs(finite(width, 1)));
  const u = (finite(x, 0) - finite(center, 0)) / w;
  return Math.exp(-u * u);
}

/** 区間 [from, to) の平均（範囲外は詰める。1 つも無ければ fallback） */
function meanRange(arr, from, to, fallback = 0) {
  const n = arr ? arr.length : 0;
  const a = Math.max(0, Math.min(n, Math.floor(finite(from, 0))));
  const b = Math.max(a, Math.min(n, Math.ceil(finite(to, 0))));
  let s = 0, m = 0;
  for (let i = a; i < b; i++) { const v = arr[i]; if (Number.isFinite(v)) { s += v; m++; } }
  return m ? s / m : fallback;
}

/** 最大で割って 0..1 にする（in-place）。素材の音量に依らない曲線にするため */
function normalizeMax(arr) {
  let mx = 0;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (Number.isFinite(v) && v > mx) mx = v; }
  if (!(mx > 0)) { arr.fill(0); return arr; }
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; arr[i] = Number.isFinite(v) ? clamp01(v / mx) : 0; }
  return arr;
}

/* ── 1. 入口をそろえる（AudioBuffer でも Float32Array でも受ける） ── */

/** 素の並びか（Float32Array / 配列）。AudioBuffer は getChannelData を持つので除く */
function isRawSamples(v) {
  return !!v && typeof v.getChannelData !== "function"
    && (Array.isArray(v) || (ArrayBuffer.isView(v) && typeof v.length === "number" && !(v instanceof DataView)));
}

/**
 * 音を 1 本のモノラルに落とす（契約書 §6）。AudioBuffer でも、試験用の
 * `{sampleRate,length,numberOfChannels,getChannelData}` でも、素の並びでも受ける。
 * **必ず写しを返す**（呼ぶ側が書き換えても元の AudioBuffer を壊さない）。
 * @param {AudioLike|Float32Array|number[]} buf
 * @returns {Float32Array} 壊れた値は 0 に落ちる
 */
export function toMono(buf) {
  if (!buf) return new Float32Array(0);
  if (isRawSamples(buf)) {
    const out = new Float32Array(buf.length);
    for (let i = 0; i < out.length; i++) { const v = buf[i]; out[i] = Number.isFinite(v) ? v : 0; }
    return out;
  }
  if (typeof buf.getChannelData !== "function") return new Float32Array(0);
  const len = Math.max(0, Math.floor(finite(buf.length, 0)));
  if (!len) return new Float32Array(0);
  const n = clampInt(finite(buf.numberOfChannels, 1), 1, 32);
  const chans = [];
  for (let i = 0; i < n; i++) {
    try { const c = buf.getChannelData(i); if (c && c.length) chans.push(c); } catch (_e) { /* 欠けた channel は無い物として扱う */ }
  }
  if (!chans.length) return new Float32Array(0);
  const out = new Float32Array(len);
  if (chans.length === 1) {
    const c = chans[0];
    for (let i = 0; i < len; i++) { const v = c[i]; out[i] = Number.isFinite(v) ? v : 0; }
    return out;
  }
  const k = 1 / chans.length;
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let j = 0; j < chans.length; j++) { const v = chans[j][i]; if (Number.isFinite(v)) s += v; }
    out[i] = s * k;
  }
  return out;
}

/**
 * 解析の入口。モノラル・標本周波数・尺を 1 つの形にそろえる。
 * @param {*} buf AudioBuffer / AudioLike / Float32Array / `{mono, sampleRate}`
 * @param {{sampleRate?:number}} [opts] 素の並びを渡す時の標本周波数（既定 48000）
 * @returns {{mono:Float32Array, sampleRate:number, duration:number}}
 */
export function readAudio(buf, opts = {}) {
  const o = opts || {};
  const src = buf && !isRawSamples(buf) && isRawSamples(buf.mono) ? buf.mono : buf;   // {mono,sampleRate} も受ける
  const rate = finite(buf && buf.sampleRate, finite(o.sampleRate, 48000));
  const sampleRate = clamp(rate > 0 ? rate : 48000, 8000, 192000);
  const mono = toMono(src);
  return { mono, sampleRate, duration: mono.length / sampleRate };
}

/**
 * 整数分の 1 に間引く（箱平均なので折り返しも一応抑える）。拍・声の解析を軽くするため。
 * @param {Float32Array} mono @param {number} factor 1..16
 * @returns {Float32Array}
 */
export function decimateMono(mono, factor) {
  const f = clampInt(finite(factor, 1), 1, 16);
  const n = mono && typeof mono.length === "number" ? mono.length : 0;
  if (!n) return new Float32Array(0);
  // factor 1 の Float32Array はそのまま返す（内側の hot path で写しを作らないため）。
  // 素の配列は Float32Array に直して返す（前は長さ 0 を返して中身を丸ごと捨てていた）
  if (f <= 1) return mono instanceof Float32Array ? mono : toMono(mono);
  const count = Math.floor(n / f);
  const out = new Float32Array(count);
  for (let i = 0, o = 0; i < count; i++) {
    let s = 0;
    for (let k = 0; k < f; k++, o++) { const v = mono[o]; if (Number.isFinite(v)) s += v; }
    out[i] = s / f;
  }
  return out;
}

/** 目標の標本周波数まで間引く（届かない時はそのまま） */
function decimateTo(mono, sampleRate, target) {
  const t = clamp(finite(target, 12000), 4000, 192000);
  const f = clampInt(Math.floor(sampleRate / t), 1, 16);
  return f <= 1 ? { mono, sampleRate } : { mono: decimateMono(mono, f), sampleRate: sampleRate / f };
}

/* ── 2. FFT（自前・radix-2） ───────────────────────────────── */

const twiddleCache = new Map();

/** 長さ n の回転因子表（cos/sin）。長さごとに作って使い回す */
function twiddles(n) {
  let t = twiddleCache.get(n);
  if (t) return t;
  const half = n >> 1;
  const cos = new Float64Array(half), sin = new Float64Array(half);
  for (let i = 0; i < half; i++) { const a = (-2 * Math.PI * i) / n; cos[i] = Math.cos(a); sin[i] = Math.sin(a); }
  t = { cos, sin };
  if (twiddleCache.size > 6) twiddleCache.clear();   // 表が増え続けないように
  twiddleCache.set(n, t);
  return t;
}

const hannCache = new Map();

/** Hann 窓の表（この中だけで使う。返した物を書き換えないこと） */
function hannCached(n) {
  const len = Math.max(1, Math.round(finite(n, 1)));
  let w = hannCache.get(len);
  if (w) return w;
  w = new Float32Array(len);
  if (len === 1) w[0] = 1;
  else for (let i = 0; i < len; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
  if (hannCache.size > 6) hannCache.clear();
  hannCache.set(len, w);
  return w;
}

/**
 * Hann 窓（長さごとに表を使い回す）。矩形窓だと立ち上がりの検出が滲む。
 * **外へは必ず写しを返す**: 表そのものを渡すと、呼ぶ側がうっかり書き換えた時に
 * 以降の FFT が全部静かに狂う（窓は解析の全ての口が共有している）。
 * @param {number} n @returns {Float32Array}
 */
export function hannWindow(n) { return hannCached(n).slice(); }

/**
 * その場で複素 FFT をかける（長さは 2 の冪。re / im を直に書き換える）。
 * 外部依存ゼロの契約のため自前。周波数 f の bin は `f * n / sampleRate`。
 * @param {Float32Array|Float64Array|number[]} re 実部（書き換わる）
 * @param {Float32Array|Float64Array|number[]} im 虚部（書き換わる）
 * @returns {{re:*, im:*}} 渡された物そのもの（繋げて書けるように）
 * @throws {Error} 長さが違う / 2 の冪でない時（黙って間違った値を返さない）
 */
export function fft(re, im) {
  const n = re ? re.length : 0;
  if (!re || !im) throw new Error("fft: re と im が要る");
  if (im.length !== n) throw new Error(`fft: re と im は同じ長さが要る（${n} と ${im.length}）`);
  if (n <= 1) return { re, im };
  if ((n & (n - 1)) !== 0) throw new Error(`fft: 長さは 2 の冪でなければならない（来たのは ${n}）`);
  for (let i = 1, j = 0; i < n; i++) {           // bit 反転で並べ替え
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  const { cos, sin } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * stride], s = sin[k * stride];
        const a = i + k, b = a + half;
        const vr = re[b] * c - im[b] * s, vi = re[b] * s + im[b] * c;
        const ur = re[a], ui = im[a];
        re[a] = ur + vr; im[a] = ui + vi;
        re[b] = ur - vr; im[b] = ui - vi;
      }
    }
  }
  return { re, im };
}

/**
 * 窓を 1 つ切って power spectrum（0..n/2）を書き込む。範囲外は 0 埋め。
 * @param {Float32Array} x @param {number} from 開始標本（負でも良い）
 * @param {Float32Array} re @param {Float32Array} im @param {Float32Array} win
 * @param {Float32Array} pow 長さ (n/2)+1
 */
function powerSpectrum(x, from, re, im, win, pow) {
  const n = re.length, len = x.length;
  for (let k = 0; k < n; k++) {
    const s = from + k;
    const v = s >= 0 && s < len ? x[s] : 0;
    re[k] = (Number.isFinite(v) ? v : 0) * win[k];
    im[k] = 0;
  }
  fft(re, im);
  const half = n >> 1;
  for (let b = 0; b <= half; b++) pow[b] = re[b] * re[b] + im[b] * im[b];
  return pow;
}

/* ── 3. 音量の曲線（dBFS / K 重み付け） ────────────────────── */

/**
 * RMS の曲線（dBFS）。frame i は既定で `[i/hz, (i+1)/hz)` の敷き詰め
 * （`center:true` にすると `i/hz` を中心にした窓になる）。
 * 端の欠けた窓は「在る標本だけ」で平均するので、尻尾が勝手にフェードしない。
 * @param {Float32Array|AudioLike} mono @param {number} sampleRate
 * @param {{hz?:number, win?:number, center?:boolean}} [opts] win は秒（既定 1/hz）
 * @returns {Float32Array} dBFS（-120..）。入力が空なら長さ 0
 */
export function rmsCurve(mono, sampleRate, opts = {}) {
  const o = opts || {};
  const src = mono instanceof Float32Array ? { mono, sampleRate: clamp(finite(sampleRate, 48000), 8000, 192000) } : readAudio(mono, { sampleRate });
  const x = src.mono, sr = src.sampleRate, n = x.length;
  if (!n) return new Float32Array(0);
  const hz = clamp(finite(o.hz, 20), 0.25, 1000);
  const hop = frameStep(sr, hz).hop;
  const win = Math.max(1, Math.round(clamp(finite(o.win, 1 / hz), 1 / sr, 8) * sr));
  const center = o.center === true;
  const count = Math.max(1, Math.ceil(n / hop));
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const at = i * hop;
    const from = Math.max(0, center ? Math.round(at - win / 2) : at);
    const to = Math.min(n, from + win);
    let s = 0, m = 0;
    for (let k = from; k < to; k++) { const v = x[k]; if (Number.isFinite(v)) { s += v * v; m++; } }
    out[i] = m ? dbFromAmp(Math.sqrt(s / m)) : DB_FLOOR;
  }
  return out;
}

/**
 * K 重み付けの簡易版（1 次）。重低音を落とす 1 極 high-pass +
 * 高域を少し持ち上げる 1 次シェルフ。ITU-R BS.1770 そのものではないので
 * **絶対値としての LUFS ではなく、素材どうしの相対比較に使う**。
 * @param {Float32Array} mono @param {number} sampleRate
 * @param {{hpHz?:number, shelfHz?:number, shelf?:number}} [opts]
 * @returns {Float32Array} 同じ長さの新しい列
 */
export function kWeight(mono, sampleRate, opts = {}) {
  const o = opts || {};
  const x = mono instanceof Float32Array ? mono : toMono(mono);
  const sr = clamp(finite(sampleRate, 48000), 8000, 192000);
  const out = new Float32Array(x.length);
  if (!x.length) return out;
  const a = Math.exp((-2 * Math.PI * clamp(finite(o.hpHz, 60), 10, 500)) / sr);       // high-pass の係数
  const b = Math.exp((-2 * Math.PI * clamp(finite(o.shelfHz, 1500), 200, 8000)) / sr); // シェルフの折れ点
  const g = clamp(finite(o.shelf, 0.6), 0, 4);
  let px = 0, py = 0, lp = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Number.isFinite(x[i]) ? x[i] : 0;
    const y = a * (py + v - px);          // y = a(y[-1] + x - x[-1]): 直流を抜く
    px = v; py = y;
    lp = (1 - b) * y + b * lp;            // 低域だけ残す
    out[i] = y + g * (y - lp);            // 引き算で高域成分を作って g 倍足す
  }
  return out;
}

/**
 * 音の大きさの曲線（契約書 §1 の `loudness` の形）。K 重み付け + 400ms 窓 RMS。
 * @param {AudioLike|Float32Array} buf @param {{hz?:number, win?:number, sampleRate?:number}} [opts]
 * @returns {{hz:number, values:number[]}} values は -70..0（普通の Array。§1 に合わせる）
 */
export function loudnessCurve(buf, opts = {}) {
  const o = opts || {};
  const hz = clamp(finite(o.hz, 20), 0.25, 200);
  const { mono, sampleRate } = readAudio(buf, o);
  if (!mono.length) return { hz, values: [] };
  // 返す hz は **hop から決まる本当の刻み**（sampleRate/hz が割り切れない素材で
  // 申告どおりの hz を返すと、値を秒に直す側〈ai/tools.js の無音・graph.js の
  // ダッキング〉が後ろへ行くほどずれる）
  const step = frameStep(sampleRate, hz);
  const db = rmsCurve(kWeight(mono, sampleRate, o), sampleRate, { hz, win: clamp(finite(o.win, 0.4), 0.05, 3), center: true });
  const values = new Array(db.length);
  for (let i = 0; i < db.length; i++) values[i] = clamp(finite(db[i], -70), -70, 0);
  return { hz: step.hz, values };
}

/* ── 4. 無音 ───────────────────────────────────────────────── */

/**
 * 無音の閾値（dBFS）を決める。`relative` なら全体の中位値から相対で決めるので、
 * 小さく録れた素材でも無音を見付けられる（絶対 -38dBFS だと 1 つも取れない）。
 * 無音が半分を超える素材だと中位値そのものが無音に沈むので、上側（p90）から
 * 一定量下げた値も候補にして高い方を代表値とする。
 * @param {Float32Array} curve dBFS の列 @param {{thresholdDb?:number, relative?:boolean}} [opts]
 */
export function silenceThreshold(curve, opts = {}) {
  const o = opts || {};
  const base = clamp(finite(o.thresholdDb, -38), -120, 0);
  if (o.relative === false || !curve || !curve.length) return base;
  const sorted = Float32Array.from(curve).sort();
  const ref = Math.max(percentileOf(sorted, 0.5, base), percentileOf(sorted, 0.9, base) - 18);
  // 「-38dBFS」を「声の目安 -20dBFS から 18dB 下」と読み替える
  return clamp(ref + (base + 20), -100, -12);
}

/**
 * 無音の区間を出す（契約書 §6）。
 * @param {AudioLike|Float32Array} buf
 * @param {{thresholdDb?:number, minDur?:number, pad?:number, relative?:boolean,
 *          hz?:number, hysteresis?:number, mergeGap?:number, sampleRate?:number}} [opts]
 * @returns {Span[]} start 昇順・重なり無し。`pad` の分だけ内側へ詰めてある
 */
export function detectSilence(buf, opts = {}) {
  const o = opts || {};
  const { mono, sampleRate, duration } = readAudio(buf, o);
  if (!mono.length) return [];
  const reqHz = clamp(finite(o.hz, 100), 10, 500);       // 10ms 刻み（端を ±1 フレームに収める）
  const hz = frameStep(sampleRate, reqHz).hz;            // 秒に直すのは実効 hz で（hop の丸めで後ろがずれる）
  const curve = rmsCurve(mono, sampleRate, { hz: reqHz });
  const thr = silenceThreshold(curve, o);
  const hyst = clamp(finite(o.hysteresis, 2), 0, 12);
  const minDur = Math.max(0, finite(o.minDur, 0.35));
  const pad = Math.max(0, finite(o.pad, 0.08));
  const mergeGap = Math.max(0, finite(o.mergeGap, 0.05));
  const runs = [];
  let from = -1;
  for (let i = 0; i < curve.length; i++) {
    const db = curve[i];
    if (from < 0) { if (db <= thr) from = i; }
    else if (db > thr + hyst) { runs.push([from / hz, i / hz]); from = -1; }
  }
  if (from >= 0) runs.push([from / hz, Math.min(duration, curve.length / hz)]);
  const merged = [];
  for (const r of runs) {                                 // 一発のクリックで無音が割れないように繋ぐ
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= mergeGap) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  const out = [];
  for (const [a, b] of merged) {
    if (b - a < minDur - 1e-9) continue;                  // minDur は「無音そのものの長さ」で判定
    const s = clamp(a + pad, 0, duration), e = clamp(b - pad, 0, duration);
    if (e - s > 1e-4) out.push({ start: s, end: e });     // pad で消えた区間は返さない
  }
  return out;
}

/* ── 5. スペクトルの走査（声・オンセット・帯域で使い回す） ──── */

/** 窓の本数。frame i は `[i*hop, i*hop+hop)` を代表する（左寄せの敷き詰め） */
function frameCount(len, hop) { return len > 0 ? Math.max(1, Math.ceil(len / Math.max(1, hop))) : 0; }

/**
 * 窓を順に切って power spectrum を渡す（内部用）。
 * center:true なら「その窓が代表する時間の中心」に窓を合わせる（窓 > hop の時に要る）。
 */
function eachSpectrum(x, opts, cb) {
  const fftSize = nextPow2(clamp(finite(opts.fftSize, 1024), 64, 16384));
  const hop = clampInt(finite(opts.hop, fftSize >> 1), 1, 1 << 20);
  const count = frameCount(x.length, hop);
  const re = new Float32Array(fftSize), im = new Float32Array(fftSize);
  const pow = new Float32Array((fftSize >> 1) + 1), win = hannCached(fftSize);
  for (let i = 0; i < count; i++) {
    const at = opts.center === true ? Math.round(i * hop + hop / 2 - fftSize / 2) : i * hop;
    cb(i, powerSpectrum(x, at, re, im, win, pow));
  }
  return { count, fftSize, hop };
}

/**
 * `[lo, hi)` Hz の power の合計。**上端は含めない**のが要点で、含めてしまうと
 * `lowHz` がちょうど bin の境界に乗った時（例 fftSize 2048・sampleRate 48000 で
 * lowHz 375）に low と mid が同じ bin を二重に数え、帯域どうしの釣り合いが崩れる。
 * 一番上の帯域だけは `hi` に `Infinity` を渡して Nyquist の bin まで拾う。
 */
function bandPower(pow, binHz, lo, hi) {
  const top = pow.length - 1;
  const a = Math.max(1, Math.ceil(finite(lo, 0) / binHz));
  const b = Number.isFinite(hi) ? Math.min(top, Math.ceil(hi / binHz) - 1) : top;
  let s = 0;
  for (let i = a; i <= b; i++) s += pow[i];
  return s;
}

/* ── 6. 声らしさ（ゼロ交差率 + スペクトル平坦度 + 帯域比） ──── */

/**
 * 声らしさの元になる特徴量を並べて返す（pure・試験しやすいように score も出す）。
 * 狙いは **音楽（伴奏入り）との弁別**。純音や矩形波のような合成音は「声らしさ」の
 * 点で中間に落ちる（本物の声は 倍音 + 音節ごとの揺れ が在るので上に出る）。
 * @param {AudioLike|Float32Array} buf
 * @param {{hz?:number, win?:number, targetRate?:number, sampleRate?:number}} [opts]
 * @returns {{hz:number, count:number, duration:number, sampleRate:number,
 *   rmsDb:Float32Array, zcr:Float32Array, flat:Float32Array, band:Float32Array,
 *   hf:Float32Array, score:Float32Array}}
 */
export function speechFeatures(buf, opts = {}) {
  const o = opts || {};
  const src = readAudio(buf, o);
  const z = new Float32Array(0);
  const out = { hz: clamp(finite(o.hz, 50), 5, 200), count: 0, duration: src.duration, sampleRate: src.sampleRate, rmsDb: z, zcr: z, flat: z, band: z, hf: z, score: z };
  if (!src.mono.length) return out;
  // 声は 8kHz まで見れば足りる。先に間引いて FFT の回数を落とす（§13.6）
  const dec = decimateTo(src.mono, src.sampleRate, finite(o.targetRate, 16000));
  const x = dec.mono, sr = dec.sampleRate;
  const hop = Math.max(1, Math.round(sr / out.hz));
  const fftSize = nextPow2(clamp(finite(o.win, 0.04), 0.008, 0.2) * sr);
  const binHz = sr / fftSize, nyq = sr / 2;
  const count = frameCount(x.length, hop);
  const rmsDb = new Float32Array(count), zcr = new Float32Array(count);
  const flat = new Float32Array(count), band = new Float32Array(count), hf = new Float32Array(count);
  const loHz = 100, hiHz = Math.min(8000, nyq);
  eachSpectrum(x, { fftSize, hop, center: true }, (i, pow) => {
    // 平坦度は「幾何平均 / 算術平均」。空の bin の数値雑音に振られないよう -40dB の床を敷く
    let sum = 0, m = 0;
    const a = Math.max(1, Math.ceil(loHz / binHz)), b = Math.min(pow.length - 1, Math.floor(hiHz / binHz));
    for (let k = a; k <= b; k++) { sum += pow[k]; m++; }
    if (m && sum > 0) {
      const floor = (sum / m) * 1e-4;
      let ln = 0;
      for (let k = a; k <= b; k++) ln += Math.log(pow[k] + floor);
      flat[i] = clamp01(Math.exp(ln / m) / (sum / m + floor));
    }
    const total = bandPower(pow, binHz, 50, Infinity);
    band[i] = total > 0 ? clamp01(bandPower(pow, binHz, 200, Math.min(3800, nyq)) / total) : 0;
    hf[i] = total > 0 ? clamp01(bandPower(pow, binHz, Math.min(2000, nyq * 0.5), Infinity) / total) : 0;
    // 音量とゼロ交差率は「その窓が代表する区間」から直に数える
    const from = i * hop, to = Math.min(x.length, from + hop);
    let s2 = 0, cross = 0, n = 0;
    for (let k = from; k < to; k++) {
      const v = Number.isFinite(x[k]) ? x[k] : 0;
      s2 += v * v;
      if (k > from && ((v < 0) !== (x[k - 1] < 0))) cross++;
      n++;
    }
    rmsDb[i] = n ? dbFromAmp(Math.sqrt(s2 / n)) : DB_FLOOR;
    zcr[i] = n > 1 ? cross / (n - 1) : 0;
  });
  // 声は音節ごとに音量が揺れる（伴奏や持続音は揺れない）。1 秒窓の ばらつき を見る
  const modWin = Math.max(1, Math.round(out.hz * 0.5));
  let peak = DB_FLOOR;
  for (let i = 0; i < count; i++) peak = Math.max(peak, rmsDb[i]);
  const gate = Math.max(-60, peak - 45);
  const score = new Float32Array(count);
  // 重みの比だけが意味を持つ。平坦度（倍音の詰まり具合）を主役にしたのは、
  // 純音・矩形波・単音の伴奏はゼロ交差率や帯域比だけでは声と見分けが付かないから
  const W = { zcr: 0.7, flat: 1.6, band: 0.5, hf: 0.9, mod: 0.9 };
  const wsum = W.zcr + W.flat + W.band + W.hf + W.mod;
  for (let i = 0; i < count; i++) {
    if (rmsDb[i] <= gate) { score[i] = 0; continue; }
    const mean = meanRange(rmsDb, i - modWin, i + modWin, rmsDb[i]);
    let vr = 0, m = 0;
    for (let k = Math.max(0, i - modWin); k < Math.min(count, i + modWin); k++) { const u = rmsDb[k] - mean; vr += u * u; m++; }
    const dev = m ? Math.sqrt(vr / m) : 0;
    const t = W.zcr * bell(zcr[i], 0.12, 0.22)                     // 有声 0.02 / 無声 0.4 の間
      + W.flat * bell(Math.log10(flat[i] + 1e-9), -0.92, 0.55)     // 平坦度 0.12 前後が声（純音は 0.0001・雑音は 0.6）
      + W.band * clamp01((band[i] - 0.25) / 0.45)                  // 200..3800Hz にどれだけ乗っているか
      + W.hf * bell(Math.log10(hf[i] + 1e-6), -0.92, 0.8)          // 高域が皆無（純音）でも真っ平ら（雑音）でも無い
      + W.mod * bell(dev, 7, 7);                                   // 音節ごとの揺れ（dB）。持続音は揺れない
    score[i] = clamp01(t / wsum);
  }
  out.count = count; out.hz = sr / hop;
  out.rmsDb = rmsDb; out.zcr = zcr; out.flat = flat; out.band = band; out.hf = hf; out.score = score;
  return out;
}

/**
 * 声の区間を出す（契約書 §6）。
 * @param {AudioLike|Float32Array} buf
 * @param {{threshold?:number, hysteresis?:number, minDur?:number, mergeGap?:number}} [opts]
 * @returns {{start:number, end:number, conf:number}[]}
 */
export function detectSpeech(buf, opts = {}) {
  const o = opts || {};
  const f = speechFeatures(buf, o);
  if (!f.count) return [];
  const thr = clamp(finite(o.threshold, 0.55), 0.05, 0.95);
  const exit = thr - clamp(finite(o.hysteresis, 0.08), 0, 0.4);
  const minDur = Math.max(0, finite(o.minDur, 0.25));
  const mergeGap = Math.max(0, finite(o.mergeGap, 0.25));
  const runs = [];
  let from = -1;
  for (let i = 0; i < f.count; i++) {
    if (from < 0) { if (f.score[i] >= thr) from = i; }
    else if (f.score[i] < exit) { runs.push([from, i]); from = -1; }
  }
  if (from >= 0) runs.push([from, f.count]);
  const merged = [];
  for (const r of runs) {                                  // 息継ぎで切れないように繋ぐ
    const last = merged[merged.length - 1];
    if (last && (r[0] - last[1]) / f.hz <= mergeGap) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  const out = [];
  for (const [a, b] of merged) {
    const start = a / f.hz, end = Math.min(f.duration, b / f.hz);
    if (end - start < minDur - 1e-9) continue;
    // conf は「声と見た frame だけ」の平均。繋いだ隙間まで混ぜると、区間を返した
    // のに conf が閾値を下回る（呼ぶ側が「弱い声」と読み違える）
    let s = 0, m = 0;
    for (let i = a; i < b; i++) if (f.score[i] >= exit) { s += f.score[i]; m++; }
    out.push({ start, end, conf: clamp01(m ? s / m : meanRange(f.score, a, b, 0)) });
  }
  return out;
}

/* ── 7. オンセット（スペクトラルフラックス） ────────────────── */

/**
 * 立ち上がりの強さ（スペクトラルフラックス = 正の差分だけ足す）。frame i の時刻は
 * `t0 + i/hz`（窓の中心。クリックは窓の中央に来た時が一番強く出るのでこれが素直）。
 *
 * 値は **その窓の総量で割った 0..1**。最大値で割る正規化にすると「無音の数値雑音」が
 * 1 まで膨らんで、持続音と打撃音の区別が付かなくなる（= 拍が幻覚になる）。
 * 分母には全体の最大の 2% の床を敷くので、静かな所の微細な揺れは山にならない。
 * 差は bin ではなく **1/4 オクターブの帯域**で取る。bin ごとに見ると、窓に対して
 * 周期が合っていない持続音（ただのサイン波）でも漏れ込みが bin 間で揺れて
 * 立ち上がりに見えてしまう（帯域でまとめると揺れは帯域の中で打ち消える）。
 * @param {Float32Array|AudioLike} mono @param {number} sampleRate
 * @param {{fftSize?:number, hop?:number}} [opts]
 * @returns {{values:Float32Array, hz:number, t0:number, count:number, fftSize:number, hop:number, sampleRate:number}}
 */
export function onsetEnvelope(mono, sampleRate, opts = {}) {
  const o = opts || {};
  const src = mono instanceof Float32Array ? { mono, sampleRate: clamp(finite(sampleRate, 48000), 8000, 192000) } : readAudio(mono, { sampleRate });
  const x = src.mono, sr = src.sampleRate;
  const fftSize = nextPow2(clamp(finite(o.fftSize, 1024), 64, 16384));
  const hop = clampInt(finite(o.hop, fftSize >> 1), 1, fftSize);
  const count = frameCount(x.length, hop);
  const values = new Float32Array(count), flux = new Float32Array(count), sum = new Float32Array(count);
  const bins = fftSize >> 1, binHz = sr / fftSize;
  const map = new Int32Array(bins + 1);      // bin → 1/4 オクターブの帯域
  let nb = 0;
  for (let b = 1; b <= bins; b++) {
    map[b] = Math.max(0, Math.floor(Math.log2(Math.max(1e-6, (b * binHz) / 40)) * 4));
    if (map[b] + 1 > nb) nb = map[b] + 1;
  }
  let prev = null, cur = new Float32Array(nb);
  eachSpectrum(x, { fftSize, hop }, (i, pow) => {
    cur.fill(0);
    for (let b = 1; b <= bins; b++) cur[map[b]] += Math.sqrt(pow[b]);
    let f = 0, t = 0;
    for (let k = 0; k < nb; k++) {
      t += cur[k];
      if (prev) { const d = cur[k] - prev[k]; if (d > 0) f += d; }
    }
    flux[i] = prev ? f : 0;                  // 1 枚目は比べる相手が無いので 0
    sum[i] = t;
    const swap = prev || new Float32Array(nb);
    prev = cur; cur = swap;
  });
  let mx = 0;
  for (let i = 0; i < count; i++) if (sum[i] > mx) mx = sum[i];
  const floor = mx * 0.02, tail = x.length >= fftSize ? x.length - fftSize : Infinity;
  for (let i = 0; i < count; i++) {
    // 窓が全部入っている frame だけ比べる。打ち切りで広がったスペクトルを
    // 「立ち上がり」と見間違えると、尻尾に必ず偽の山が立つ（素材が窓より
    // 短い時だけは全部見る = 短い素材でも何も出ないより良い）
    const den = Math.max(sum[i], floor);
    values[i] = den > 0 && i * hop <= tail ? clamp01(flux[i] / den) : 0;
  }
  return { values, hz: sr / hop, t0: fftSize / (2 * sr), count, fftSize, hop, sampleRate: sr };
}

/** 契約どおりの口（スペクトラルフラックスの列だけ返す） */
export function onsetCurve(mono, sampleRate, opts = {}) { return onsetEnvelope(mono, sampleRate, opts).values; }

/* ── 8. 拍（BPM と位相） ───────────────────────────────────── */

/**
 * 立ち上がり列 → 「急な所」だけ残す（移動平均を引いて半波整流 → 0..1）。
 * 最後に [1,2,1]/4 で 2 回ならす。**これが無いと端数の周期を当てられない**:
 * 山が 1 フレーム幅だと自己相関が整数 lag でしか立たず、37.5 フレーム周期
 * （150BPM）の山が 75 フレーム（75BPM）より低く見えて半分の速さに化ける。
 */
function emphasize(v, hz) {
  const w = Math.max(1, Math.round(0.4 * hz));
  const n = v.length;
  let out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = finite(v[i], 0) - meanRange(v, i - w, i + 1, 0); out[i] = d > 0 ? d : 0; }
  for (let pass = 0; pass < 2; pass++) {
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) sm[i] = (out[Math.max(0, i - 1)] + 2 * out[i] + out[Math.min(n - 1, i + 1)]) / 4;
    out = sm;
  }
  return normalizeMax(out);
}

/** 平均を引いた正規化自己相関。平均を引かないと白色雑音でも山が立ってしまう */
function autocovariance(d, maxLag) {
  const n = d.length, mean = meanRange(d, 0, n, 0);
  const out = new Float32Array(Math.max(1, maxLag + 1));
  let base = 0;
  for (let i = 0; i < n; i++) { const u = d[i] - mean; base += u * u; }
  if (!(base > 0)) return out;
  const norm = base / n;
  out[0] = 1;
  for (let l = 1; l <= maxLag && l < n; l++) {
    let s = 0;
    for (let i = 0; i + l < n; i++) s += (d[i] - mean) * (d[i + l] - mean);
    out[l] = clamp(s / (n - l) / norm, -1, 2);
  }
  return out;
}

/** 端数の lag で自己相関を読む（整数 lag だけでは ±2BPM に入らない） */
function acfAt(acf, lag) {
  if (!(lag > 0) || !acf.length) return 0;
  const i = Math.floor(lag);
  if (i >= acf.length - 1) return finite(acf[acf.length - 1], 0);
  const f = lag - i;
  return finite(acf[i], 0) * (1 - f) + finite(acf[i + 1], 0) * f;
}

/** 倍数の山も足す（2 拍・4 拍の取り違えを避ける。裏拍だけの素材にも強い） */
const COMB_W = [1, 0.6, 0.35, 0.2];
function combScore(acf, lag) {
  let s = 0;
  for (let k = 0; k < COMB_W.length; k++) s += COMB_W[k] * acfAt(acf, lag * (k + 1));
  return s;
}

/**
 * 人が拍と感じる速さの重み（log 正規・120BPM 中心）。自己相関は「半分の速さ」でも
 * 同じだけ山が立つので、これが無いと 150BPM が 75BPM に化ける（倍/半分の取り違え）。
 */
function tempoPrior(bpm, center, width) {
  const u = Math.log2(clamp(finite(bpm, 120), 1, 1000) / clamp(finite(center, 120), 40, 300)) / Math.max(0.1, finite(width, 0.7));
  return Math.exp(-0.5 * u * u);
}

/** env の frame 番号 ⇄ 時刻 */
function frameOf(env, t) { return Math.round((finite(t, 0) - env.t0) * env.hz); }

/** 包絡を端数の時刻で読む（線形補間）。丸めると周期が x.5 フレームの時に偶奇で偏る */
function sampleEnv(d, env, t) {
  const f = (finite(t, 0) - env.t0) * env.hz;
  if (!(f > -1) || f > d.length) return 0;
  const i = Math.floor(f), u = f - i;
  const a = i >= 0 && i < d.length ? d[i] : 0, b = i + 1 >= 0 && i + 1 < d.length ? d[i + 1] : 0;
  return a * (1 - u) + b * u;
}

/** 拍の位置に山が乗るずらし方を選ぶ（返り値は 0..period の「最初の拍」） */
function bestPhase(d, env, period) {
  const steps = Math.max(1, Math.round(period * env.hz));
  const last = env.t0 + (d.length - 1) / env.hz;
  let bestS = -1, bestT = env.t0;
  for (let j = 0; j < steps; j++) {
    const t0 = env.t0 + j / env.hz;
    let s = 0, m = 0;
    for (let t = t0; t <= last; t += period) { s += sampleEnv(d, env, t); m++; }
    if (m && s / m > bestS) { bestS = s / m; bestT = t0; }
  }
  let t = bestT;
  while (t >= period) t -= period;
  while (t < 0) t += period;
  return t;
}

/** 各拍を近くの山へ吸い付けて、最小二乗で period / offset を仕上げる */
function fitGrid(d, env, period, offset, duration) {
  const half = Math.max(1, Math.round((period * env.hz) / 6));
  const thr = percentileOf(Float32Array.from(d).sort(), 0.995, 1) * 0.5;
  const ks = [], ts = [];
  for (let k = 0, t = offset; t <= duration + 1e-9 && k < 20000; k++, t += period) {
    const c = frameOf(env, t);
    let bi = -1, bv = Math.max(1e-6, thr);
    for (let i = c - half; i <= c + half; i++) if (i >= 0 && i < d.length && d[i] > bv) { bv = d[i]; bi = i; }
    if (bi >= 0) { ks.push(k); ts.push(env.t0 + bi / env.hz); }
  }
  const keep = { period, offset, matched: ks.length };
  if (ks.length < 4) return keep;
  let sk = 0, st = 0;
  for (let i = 0; i < ks.length; i++) { sk += ks[i]; st += ts[i]; }
  const mk = sk / ks.length, mt = st / ks.length;
  let num = 0, den = 0;
  for (let i = 0; i < ks.length; i++) { const u = ks[i] - mk; num += u * (ts[i] - mt); den += u * u; }
  const p = den > 0 ? num / den : period;
  if (!(p > 0) || Math.abs(p - period) > period * 0.15) return keep;   // 飛び過ぎた当てはめは捨てる
  let off = mt - p * mk;
  while (off >= p) off -= p;
  while (off < 0) off += p;
  return { period: p, offset: off, matched: ks.length };
}

/**
 * 拍を見付ける（契約書 §6）。**拍が無い素材でも必ずこの形を返す**（`conf` で見る）。
 * @param {AudioLike|Float32Array} buf
 * @param {{minBpm?:number, maxBpm?:number, beatsPerBar?:number, targetRate?:number,
 *          fftSize?:number, hop?:number, sampleRate?:number}} [opts]
 * @returns {Beats} bpm / offset（最初の拍の秒）/ times / downbeats / conf 0..1
 */
export function detectBeats(buf, opts = {}) {
  const o = opts || {};
  const none = { bpm: 0, offset: 0, times: [], downbeats: [], conf: 0 };
  const src = readAudio(buf, o);
  if (!src.mono.length) return none;
  const dec = decimateTo(src.mono, src.sampleRate, finite(o.targetRate, 12000));  // 拍は低い帯域で足りる
  const env = onsetEnvelope(dec.mono, dec.sampleRate, { fftSize: finite(o.fftSize, 512), hop: finite(o.hop, 128) });
  if (env.count < 8) return none;
  let envPeak = 0;
  for (let i = 0; i < env.count; i++) if (env.values[i] > envPeak) envPeak = env.values[i];
  if (envPeak < 0.02) return none;              // 立ち上がりが 1 つも無い（無音・持続音）
  const d = emphasize(env.values, env.hz);
  const minBpm = clamp(finite(o.minBpm, 60), 20, 400), maxBpm = clamp(finite(o.maxBpm, 200), minBpm + 1, 500);
  const lagMin = Math.max(2, Math.floor((60 / maxBpm) * env.hz));
  const lagMax = Math.min(d.length - 2, Math.ceil((60 / minBpm) * env.hz));
  if (lagMax <= lagMin) return none;
  const acf = autocovariance(d, Math.min(d.length - 1, lagMax * COMB_W.length));
  const center = finite(o.tempoCenter, 120), width = finite(o.tempoWidth, 0.7);
  const rate = (L) => { const c = combScore(acf, L); return c > 0 ? c * tempoPrior((60 * env.hz) / L, center, width) : c; };
  let lag = 0, best = -Infinity;
  for (let L = lagMin; L <= lagMax; L++) { const s = rate(L); if (s > best) { best = s; lag = L; } }
  if (!(lag > 0)) return none;
  for (let L = Math.max(lagMin, lag - 1); L <= Math.min(lagMax, lag + 1); L += 0.02) {
    const s = rate(L);
    if (s > best) { best = s; lag = L; }
  }
  const fit = fitGrid(d, env, lag / env.hz, bestPhase(d, env, lag / env.hz), src.duration);
  const times = [];
  for (let t = fit.offset, k = 0; t <= src.duration + 1e-9 && k < 20000; t += fit.period, k++) times.push(t);
  // 自信 = 自己相関の山 + 拍に山が在った割合 + 拍の所が周りよりどれだけ強いか
  let hit = 0, m = 0, mx = 0;
  for (const t of times) { hit += sampleEnv(d, env, t); m++; }
  for (let i = 0; i < d.length; i++) if (d[i] > mx) mx = d[i];
  const all = meanRange(d, 0, d.length, 0);
  const punch = clamp01(((m ? hit / m : 0) - all) / Math.max(1e-6, mx - all));
  const conf = clamp01(0.55 * clamp01(acfAt(acf, lag)) + 0.15 * clamp01(fit.matched / Math.max(1, m)) + 0.3 * punch);
  const bar = clampInt(finite(o.beatsPerBar, 4), 2, 8);
  let bp = 0, bs = -1;
  for (let p = 0; p < bar; p++) {
    let s = 0, n = 0;
    for (let k = p; k < times.length; k += bar) { s += sampleEnv(d, env, times[k]); n++; }
    const v = n ? s / n : 0;
    if (v > bs * 1.15) { bs = v; bp = p; }     // 僅差は先頭の拍を小節頭とする（決定論）
  }
  const downbeats = [];
  for (let k = bp; k < times.length; k += bar) downbeats.push(times[k]);
  return { bpm: clamp(60 / fit.period, 20, 500), offset: fit.offset, times, downbeats, conf };
}

/* ── 9. 帯域エネルギーと盛り上がり ─────────────────────────── */

/**
 * 低域 / 中域 / 高域のエネルギー（契約書 §6 の energyBands）。
 * 3 本を **同じ最大値**で割るので、帯域どうしの釣り合いがそのまま残る。
 * @param {AudioLike|Float32Array} buf
 * @param {{hz?:number, fftSize?:number, lowHz?:number, highHz?:number, sampleRate?:number}} [opts]
 * @returns {{hz:number, count:number, duration:number, sampleRate:number,
 *            low:Float32Array, mid:Float32Array, high:Float32Array}} 各値 0..1
 */
export function energyBands(buf, opts = {}) {
  const o = opts || {};
  const { mono, sampleRate, duration } = readAudio(buf, o);
  const hz = clamp(finite(o.hz, 10), 0.5, 100);
  const z = new Float32Array(0);
  if (!mono.length) return { hz, count: 0, duration, sampleRate, low: z, mid: z, high: z };
  const hop = Math.max(1, Math.round(sampleRate / hz));
  const fftSize = nextPow2(clamp(finite(o.fftSize, 2048), 128, 8192));
  const binHz = sampleRate / fftSize, nyq = sampleRate / 2;
  const lowHz = clamp(finite(o.lowHz, 250), 60, 1000), highHz = clamp(finite(o.highHz, 4000), 1000, 16000);
  const count = frameCount(mono.length, hop);
  const low = new Float32Array(count), mid = new Float32Array(count), high = new Float32Array(count);
  eachSpectrum(mono, { fftSize, hop, center: true }, (i, pow) => {
    low[i] = bandPower(pow, binHz, 20, lowHz);
    mid[i] = bandPower(pow, binHz, lowHz, Math.min(highHz, nyq));
    high[i] = bandPower(pow, binHz, Math.min(highHz, nyq), Infinity);
  });
  let mx = 0;
  for (let i = 0; i < count; i++) mx = Math.max(mx, low[i], mid[i], high[i]);
  const k = mx > 0 ? 1 / mx : 0;
  for (let i = 0; i < count; i++) { low[i] = clamp01(low[i] * k); mid[i] = clamp01(mid[i] * k); high[i] = clamp01(high[i] * k); }
  return { hz: sampleRate / hop, count, duration, sampleRate, low, mid, high };
}

/**
 * 盛り上がり（drop）の候補。低域が静かな所から一気に戻る瞬間を探す。
 * 音楽の「落ちる所」に頭を合わせると自動編集が一気に見栄えする。
 * @param {ReturnType<typeof energyBands>} bands
 * @param {{win?:number, threshold?:number, minGap?:number, max?:number}} [opts]
 * @returns {{t:number, score:number}[]} t 昇順
 */
export function findMusicDrops(bands, opts = {}) {
  const o = opts || {};
  const hz = finite(bands && bands.hz, 0);
  const low = bands && bands.low, mid = bands && bands.mid, high = bands && bands.high;
  const n = low && low.length ? low.length : 0;
  if (!(hz > 0) || !n) return [];
  const w = Math.max(1, Math.round(clamp(finite(o.win, 1.2), 0.2, 8) * hz));
  const thr = clamp(finite(o.threshold, 0.18), 0.02, 1);
  const minGap = Math.max(0, finite(o.minGap, 4));
  const max = clampInt(finite(o.max, 12), 1, 64);
  // 生の値（飽和させない）で山を選ぶ。clamp01 してから選ぶと 1 が続いて時刻が前後する
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dl = meanRange(low, i, i + w, 0) - meanRange(low, i - w, i, 0);
    const dr = (meanRange(mid, i, i + w, 0) + meanRange(high, i, i + w, 0) - meanRange(mid, i - w, i, 0) - meanRange(high, i - w, i, 0)) / 2;
    raw[i] = dl * 1.6 + dr * 0.8;
  }
  const cands = [];
  for (let i = 1; i < n - 1; i++) if (raw[i] >= thr && raw[i] > raw[i - 1] && raw[i] >= raw[i + 1]) cands.push({ t: i / hz, score: clamp01(raw[i]) });
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of cands) {
    if (out.length >= max) break;
    if (out.some((x) => Math.abs(x.t - c.t) < minGap)) continue;
    out.push(c);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/* ── 10. 拍の格子と吸い付き ────────────────────────────────── */

/**
 * beats を時刻の配列に直す。detectBeats の返り値・素の時刻の配列・`[{t}]`・
 * `{bpm, offset}`（`opts.until` まで生やす）のどれでも受ける。
 * @returns {number[]} 昇順
 */
export function beatTimes(beats, opts = {}) {
  const o = opts || {};
  if (Array.isArray(beats) || (ArrayBuffer.isView(beats) && !(beats instanceof DataView))) {
    const out = [];
    for (let i = 0; i < beats.length; i++) {
      const v = beats[i];
      if (Number.isFinite(v)) out.push(v);
      else if (v && Number.isFinite(v.t)) out.push(v.t);
    }
    return out.sort((a, b) => a - b);
  }
  if (beats && Array.isArray(beats.times) && beats.times.length) return beatTimes(beats.times);
  if (beats && finite(beats.bpm, 0) > 0) {
    const period = 60 / beats.bpm;
    const until = Math.max(0, finite(o.until, finite(beats.duration, 0)));
    const out = [];
    for (let t = Math.max(0, finite(beats.offset, 0)), k = 0; t <= until + 1e-9 && k < 20000; t += period, k++) out.push(t);
    return out;
  }
  return [];
}

/**
 * 拍の格子（`divide` で 1 拍を割る。2 なら 8 分、4 なら 16 分）。
 * @param {Beats|number[]} beats @param {{divide?:number, until?:number}} [opts]
 * @returns {number[]} 昇順・重複なし
 */
export function buildBeatGrid(beats, opts = {}) {
  const o = opts || {};
  const times = beatTimes(beats, o);
  if (!times.length) return [];
  const divide = clampInt(finite(o.divide, 1), 1, 16);
  const until = Number.isFinite(o.until) ? o.until : null;
  const raw = [];
  const cut = (a, b) => { raw.push(a); for (let k = 1; k < divide; k++) raw.push(a + ((b - a) * k) / divide); };
  for (let i = 0; i < times.length - 1; i++) cut(times[i], times[i + 1]);
  const last = times[times.length - 1];
  const gap = times.length > 1 ? last - times[times.length - 2] : 0;
  cut(last, last + gap);                       // 末尾の 1 拍も同じ間隔で刻む
  if (until !== null && gap > 0) for (let t = last + gap, k = 0; t <= until + 1e-9 && k < 20000; t += gap, k++) cut(t, t + gap);
  raw.sort((a, b) => a - b);
  const out = [];
  for (const t of raw) {
    if (!Number.isFinite(t) || (until !== null && t > until + 1e-9)) continue;
    if (out.length && Math.abs(out[out.length - 1] - t) < 1e-6) continue;
    out.push(t);
  }
  return out;
}

/**
 * 近くの拍へ吸い付ける（遠ければそのまま返す）。カット位置の最後の仕上げ。
 * @param {number} t @param {Beats|number[]} beats @param {{max?:number}} [opts]
 * @returns {number}
 */
export function snapToBeat(t, beats, opts = {}) {
  const x = finite(t, 0);
  const times = beatTimes(beats, opts);
  if (!times.length) return x;
  const max = Math.max(0, finite((opts || {}).max, 0.12));
  const i = bisect(times, x);
  let best = x, bd = Infinity;
  for (const j of [i - 1, i]) {
    if (j < 0 || j >= times.length) continue;
    const d = Math.abs(times[j] - x);
    if (d < bd) { bd = d; best = times[j]; }
  }
  return bd <= max ? best : x;
}

/* ── 11. LLM へ渡す一言 ────────────────────────────────────── */

/**
 * 音の解析を 1 行に縮める（LLM に素材の尺やフレームを書かせないため・契約書 §6）。
 * 契約書 §1 の analysis（loudness / silence / speech / beats）をそのまま渡せる。
 * @param {*} analysis @param {{maxChars?:number}} [opts]
 * @returns {string}
 */
export function summarizeAudioForLLM(analysis, opts = {}) {
  const maxChars = clampInt(finite((opts || {}).maxChars, 300), 40, 4000);
  const A = analysis && typeof analysis === "object" ? analysis : {};
  const dur = Math.max(0, finite(A.duration, 0));
  const parts = [];
  if (dur > 0) parts.push(`尺 ${dur.toFixed(1)}s`);
  const lv = A.loudness && Array.isArray(A.loudness.values) ? A.loudness.values : null;
  if (lv && lv.length) {
    let s = 0, mx = -Infinity;
    for (const v of lv) { const n = finite(v, -70); s += n; if (n > mx) mx = n; }
    parts.push(`平均 ${(s / lv.length).toFixed(1)}dBFS`, `最大 ${mx.toFixed(1)}dBFS`);
  }
  const span = (list) => list.reduce((a, s) => a + Math.max(0, finite(s && s.end, 0) - finite(s && s.start, 0)), 0);
  const sil = Array.isArray(A.silence) ? A.silence : [];
  if (sil.length) parts.push(`無音 ${sil.length} 箇所 計 ${span(sil).toFixed(1)}s`);
  else if (parts.length) parts.push("無音なし");
  if (Array.isArray(A.speech)) {
    const sp = A.speech;
    if (!sp.length) parts.push("声は見付からない");
    else parts.push(`声 ${sp.length} 区間${dur > 0 ? `（全体の ${Math.round(clamp01(span(sp) / dur) * 100)}%）` : ""}`);
  }
  const b = A.beats;
  if (b && finite(b.bpm, 0) > 0) {
    parts.push(finite(b.conf, 0) >= 0.3
      ? `BPM ${Math.round(b.bpm)}（最初の拍 ${finite(b.offset, 0).toFixed(2)}s・自信 ${finite(b.conf, 0).toFixed(2)}）`
      : "拍は当てにならない（自信が低い）");
  }
  const drops = Array.isArray(A.drops) ? A.drops : [];
  if (drops.length) parts.push(`盛り上がり ${drops.slice(0, 3).map((d) => `${finite(d && d.t, 0).toFixed(1)}s`).join("・")}`);
  if (!parts.length) return "音の解析結果が無い";
  const s = parts.join(" / ");
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}

/** 契約どおりの名前（video.js の同名と衝突するので index.js では星取り込みしない） */
export const summarizeForLLM = summarizeAudioForLLM;
