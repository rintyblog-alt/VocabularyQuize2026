/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/audio/fx.js — 音の効果（契約書 §4 / §13.6）

   ★ 何をする所か
     `createAudioFx(ctx, type, params)` が 1 つの効果を組み、
     `{ input, output, update(params), dispose }` を返す。clip / トラック /
     マスターの効果チェーンは `createFxChain(ctx, [FxInstance])` で束ねる。
     UI（ui/inspector/audio.js）は **`AUDIO_FX_REGISTRY` を見て並べる**。
     つまりこの表が UI との契約そのもの。綴りを変えると画面が変わる。

   ★ なぜこの形か
     ・**入口と出口は必ず GainNode**。中身を作り替えても（リバーブの
       ImpulseResponse 再合成、ピッチの表の張り替え）呼ぶ側は繋ぎ直さない。
       繋ぎ直しを外に出すと、繋ぎ替えの一瞬で音が切れる or 二重に鳴る。
     ・**外部ファイル禁止**（共通前提）。だからリバーブの ImpulseResponse は
       その場で合成する（種を固定した乱数 → 毎回同じ響き。「前と違う音に
       なった」を作らないため）。ConvolverNode の `normalize` は既定の true に
       任せる（自前で正規化すると size を変える度に音量が動く）。
     ・**ゲートとディエッサーは Web Audio に相当する node が無い**。
       AudioWorklet を使うには別ファイル（addModule）か blob URL が要り、
       共通前提と CSP の両方に触る。そこで **AnalyserNode で音量を測り、
       GainNode を setTargetAtTime で動かす**方式にした。判断は 25ms 刻み
       （= サンプル精度ではない）だが、掛かり方そのものは音のスレッドが
       滑らかに補間するので、耳に付く段差は出ない。**背後のタブでは
       setInterval が 1 秒に間引かれ、掛かりが固まる**（→ CONTRACT-NOTE (2)）。
     ・**ピッチは 2 本の遅延線を交差フェードする粒（grain）方式**。
       AudioBufferSourceNode の外では playbackRate も detune も使えないので、
       遅延時間を直線で動かして読み出し速度を変え、窓（W0+W1=1）で継ぎ目を
       隠す。原理どおり半音は合うが、**金属的な付帯音が出る**（時間伸縮を
       伴う本物の pitch shift ではない）。これは申告どおりの近似
       （→ CONTRACT-NOTE (3)）。
     ・`eq` は 5 バンドのパラメトリック、`eq3` は低中高の 3 つ。UI のプリセット
       （inspector/audio.js の AUDIO_FX_PRESETS）は `eq` に
       `{low,mid,high,midFreq}` を渡してくるので、**別名で受けて 5 バンドの
       1/3/5 に割り当てる**（→ CONTRACT-NOTE (1)）。

   ★ 触るときの注意
     ・`update()` は触っている間 何度でも来る（スライダー）。**作り直しは
       値が変わった時だけ**（sig を比べる）。毎回作り直すと音が切れる。
     ・`dispose()` は「自分が作った node だけ」を切る。input/output も自分の
       物なので切って良いが、繋ぎ先（トラックの入口）は触らない。
     ・params は **足りない物は既定で埋め、範囲外は丸める**
       （`resolveFxParams`）。UI から NaN が来ても音は出続ける事。
     ・`AUDIO_FX_REGISTRY` の各 param は **min < def < max** を必ず満たす
       （tests/audio-params.test.mjs がそこを見る。UI の中央スナップと
       「既定へ戻す」が両端に張り付くと操作できなくなるため）。

   CONTRACT-NOTE (1): 依頼書の型名に加えて別名を受ける（既に在る画面と
     プロジェクトを壊さないため）: `pitchShift`→`pitch`、`noiseGate`→`gate`、
     `eq` への `{low,mid,high,midFreq}`。登録表に出すのは正式名だけ。
   CONTRACT-NOTE (2): ゲート／ディエッサーの判断は 25ms 刻みの JS。書き出し
     （engine/audio/mix.js の OfflineAudioContext）では **タイマーが回らない**
     ので、書き出し側はこの 2 つを「掛からない」として扱うか、自前で
     `update()` を時間刻みで呼ぶ必要が在る。`fx.dynamic === true` で見分けられる。
   CONTRACT-NOTE (3): `pitch` は粒方式の近似。`AUDIO_FX_REGISTRY.pitch.approx`
     に true を立ててあるので、UI は注意書きを出せる。
   CONTRACT-NOTE (4): 作法は「1 ファイル 700 行で分割」だが、分割先
     （engine/audio/fx-builders.js など）は担当外で新規作成できない。
     章立てで割れる形にした: **§0（登録表・純関数）** / §1 小道具 /
     **§2 効果ひとつひとつ** / §3 口。UI が見るのは §0 だけなので、
     切り出すなら §2 を別ファイルへ出し、§3 の BUILDERS を import に替える。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, clamp01, finite } from "../../core/util.js";
import { scope } from "../../core/log.js";
import { ampFromDb, dbFromAmp, peakRmsOf } from "./meter.js";

const L = scope("audio-fx");

/* ══ §0. 登録表（= UI との契約）═══════════════════════════════════════ */

/** 値の刻み（渡されなければ幅から決める） */
function stepOf(min, max) {
  const span = Math.abs(max - min);
  if (span <= 2) return 0.01;
  if (span <= 40) return 0.1;
  if (span <= 400) return 1;
  return 10;
}

/**
 * パラメータ 1 本。**min < def < max** を必ず満たす事（試験が見る）。
 * @returns {{key:string,label:string,min:number,max:number,def:number,unit:string,step:number}}
 */
function P(key, label, min, max, def, unit, step) {
  return Object.freeze({
    key, label, min, max, def, unit: unit || "",
    step: step || stepOf(min, max)
  });
}

/** dB の量（±18dB・0 が中央） */
const gainDb = (key, label) => P(key, label, -18, 18, 0, "dB", 0.5);

/**
 * 効果の登録表。`{ type: { name, group, params:[{key,label,min,max,def,unit}] } }`
 * UI はこれを見て並べる（ui/inspector/audio.js の normalizeAudioFxRegistry）。
 * @type {Object<string, {name:string, group:string, params:Object[], approx?:boolean, dynamic?:boolean}>}
 */
export const AUDIO_FX_REGISTRY = Object.freeze({
  /* ── 整える ── */
  eq3: Object.freeze({
    name: "イコライザ（低中高）", group: "整える",
    params: Object.freeze([
      gainDb("low", "低音"), gainDb("mid", "中音"), gainDb("high", "高音"),
      P("midFreq", "中音の位置", 200, 6000, 1800, "Hz", 10)
    ])
  }),
  eq: Object.freeze({
    name: "イコライザ（5 バンド）", group: "整える",
    params: Object.freeze([
      gainDb("b1g", "① 低域"), P("b1f", "① 位置", 20, 400, 90, "Hz", 1),
      gainDb("b2g", "② 低中域"), P("b2f", "② 位置", 100, 1200, 300, "Hz", 5), P("b2q", "② 幅", 0.2, 8, 1, "Q", 0.05),
      gainDb("b3g", "③ 中域"), P("b3f", "③ 位置", 400, 4000, 1200, "Hz", 10), P("b3q", "③ 幅", 0.2, 8, 1, "Q", 0.05),
      gainDb("b4g", "④ 中高域"), P("b4f", "④ 位置", 1500, 9000, 4000, "Hz", 10), P("b4q", "④ 幅", 0.2, 8, 1, "Q", 0.05),
      gainDb("b5g", "⑤ 高域"), P("b5f", "⑤ 位置", 3000, 16000, 9000, "Hz", 50)
    ])
  }),
  compressor: Object.freeze({
    name: "音量をならす（コンプ）", group: "整える",
    params: Object.freeze([
      P("threshold", "掛かり始め", -60, 0, -20, "dB", 0.5),
      P("ratio", "強さ", 1, 20, 3, ":1", 0.1),
      P("attack", "反応", 0, 200, 10, "ms", 1),
      P("release", "戻り", 10, 1000, 180, "ms", 5),
      P("knee", "角の丸み", 0, 40, 6, "dB", 0.5),
      P("makeup", "持ち上げ", 0, 18, 2, "dB", 0.5)
    ])
  }),
  gate: Object.freeze({
    name: "小さい音を消す（ゲート）", group: "整える", dynamic: true,
    params: Object.freeze([
      P("threshold", "しきい値", -80, -10, -45, "dB", 0.5),
      P("attack", "開き", 0, 100, 5, "ms", 1),
      P("release", "閉じ", 10, 800, 120, "ms", 5),
      P("hold", "開いたまま保つ", 0, 500, 80, "ms", 5),
      P("range", "下げ幅", -60, 0, -24, "dB", 0.5)
    ])
  }),
  deesser: Object.freeze({
    name: "歯擦音を抑える（ディエッサー）", group: "整える", dynamic: true,
    params: Object.freeze([
      P("amount", "強さ", 0, 1, 0.4, "", 0.01),
      P("freq", "位置", 3000, 12000, 6500, "Hz", 50),
      P("threshold", "掛かり始め", -60, -6, -28, "dB", 0.5),
      P("range", "下げ幅", -24, 0, -9, "dB", 0.5)
    ])
  }),
  limiter: Object.freeze({
    name: "上を叩く（リミッター）", group: "整える",
    params: Object.freeze([
      P("ceiling", "上限", -12, 0, -1, "dB", 0.1),
      P("release", "戻り", 10, 500, 80, "ms", 5)
    ])
  }),
  lowpass: Object.freeze({
    name: "高音を切る（ローパス）", group: "整える",
    params: Object.freeze([P("freq", "境目", 500, 20000, 8000, "Hz", 10), P("q", "効き", 0.1, 8, 0.7, "Q", 0.05)])
  }),
  highpass: Object.freeze({
    name: "低音を切る（ハイパス）", group: "整える",
    params: Object.freeze([P("freq", "境目", 20, 2000, 100, "Hz", 1), P("q", "効き", 0.1, 8, 0.7, "Q", 0.05)])
  }),
  /* ── 空間 ── */
  reverb: Object.freeze({
    name: "残響（リバーブ）", group: "空間",
    params: Object.freeze([
      P("mix", "混ぜ具合", 0, 1, 0.25, "", 0.01),
      P("size", "広さ", 0, 1, 0.4, "", 0.01),
      P("damp", "落ち", 0, 1, 0.5, "", 0.01),
      P("predelay", "遅れ", 0, 200, 20, "ms", 1)
    ])
  }),
  delay: Object.freeze({
    name: "やまびこ（ディレイ）", group: "空間",
    params: Object.freeze([
      P("time", "間隔", 10, 1200, 240, "ms", 5),
      P("feedback", "繰り返し", 0, 0.95, 0.3, "", 0.01),
      P("mix", "混ぜ具合", 0, 1, 0.2, "", 0.01),
      P("tone", "明るさ", 500, 16000, 6000, "Hz", 50)
    ])
  }),
  stereoWiden: Object.freeze({
    name: "広がり（ステレオ）", group: "空間",
    params: Object.freeze([
      P("amount", "広さ", 0, 1, 0.5, "", 0.01),
      P("bass", "低音は中央に", 20, 400, 120, "Hz", 5)
    ])
  }),
  /* ── 色付け ── */
  pitch: Object.freeze({
    name: "音の高さを変える", group: "色付け", approx: true,
    params: Object.freeze([
      P("semitones", "半音", -12, 12, 0, "", 1),
      P("fine", "微調整", -50, 50, 0, "cent", 1),
      P("grain", "粒の長さ", 20, 200, 80, "ms", 5)
    ])
  }),
  distortion: Object.freeze({
    name: "歪ませる", group: "色付け",
    params: Object.freeze([
      P("drive", "強さ", 0, 1, 0.3, "", 0.01),
      P("tone", "明るさ", 0, 1, 0.5, "", 0.01),
      P("mix", "混ぜ具合", 0, 1, 0.8, "", 0.01),
      P("level", "出口の音量", -18, 6, 0, "dB", 0.5)
    ])
  })
});

/** 型の別名（CONTRACT-NOTE (1)）。登録表には出さない */
export const AUDIO_FX_ALIASES = Object.freeze({
  pitchshift: "pitch", pitchshifter: "pitch", detune: "pitch",
  noisegate: "gate", noise_gate: "gate",
  eq3band: "eq3", equalizer: "eq3", eq5: "eq",
  widen: "stereoWiden", stereowiden: "stereoWiden", stereo: "stereoWiden",
  deess: "deesser", desser: "deesser",
  comp: "compressor", compress: "compressor",
  echo: "delay", verb: "reverb", drive: "distortion", saturate: "distortion",
  lpf: "lowpass", hpf: "highpass", limit: "limiter"
});

/** パラメータの別名（値を移し替える物は map を持つ） */
const PARAM_ALIASES = Object.freeze({
  eq: Object.freeze({ low: "b1g", mid: "b3g", high: "b5g", midFreq: "b3f" }),
  eq3: Object.freeze({ b1g: "low", b3g: "mid", b5g: "high", b3f: "midFreq" }),
  pitch: Object.freeze({ pitch: "semitones", semi: "semitones", cents: "fine" }),
  gate: Object.freeze({ amount: { key: "range", map: (v) => -(6 + 54 * clamp01(v)) } }),
  limiter: Object.freeze({ threshold: "ceiling" }),
  distortion: Object.freeze({ amount: "drive" }),
  reverb: Object.freeze({ wet: "mix", room: "size" }),
  delay: Object.freeze({ wet: "mix", ms: "time" }),
  lowpass: Object.freeze({ frequency: "freq", Q: "q" }),
  highpass: Object.freeze({ frequency: "freq", Q: "q" })
});

/**
 * 型名をそろえる（大文字小文字・別名を吸収）。知らない型は "" を返す。
 * @param {string} type @returns {string}
 */
export function normalizeFxType(type) {
  const raw = String(type === undefined || type === null ? "" : type).trim();
  if (!raw) return "";
  if (Object.prototype.hasOwnProperty.call(AUDIO_FX_REGISTRY, raw)) return raw;
  const low = raw.toLowerCase();
  for (const k of Object.keys(AUDIO_FX_REGISTRY)) if (k.toLowerCase() === low) return k;
  const alias = AUDIO_FX_ALIASES[low] || AUDIO_FX_ALIASES[raw];
  return alias && AUDIO_FX_REGISTRY[alias] ? alias : "";
}

/**
 * 音の効果か（graph.js が clip.fx から音の物だけ取り出すのに使う）。
 * 映像の効果（glitch 等）と印（bgm / duckSource / pitchPreserve）は false。
 * @param {string} type @returns {boolean}
 */
export function isAudioFxType(type) {
  return !!normalizeFxType(type);
}

/** その型の既定値だけを集めた object */
export function fxParamDefaults(type) {
  const t = normalizeFxType(type);
  const out = {};
  if (!t) return out;
  for (const p of AUDIO_FX_REGISTRY[t].params) out[p.key] = p.def;
  return out;
}

/**
 * 渡された params を「既定で埋め・別名を移し・範囲に丸めた」値にする（純関数）。
 * @param {string} type @param {Object} [params]
 * @returns {Object} 登録表の key だけを持つ object
 */
export function resolveFxParams(type, params) {
  const t = normalizeFxType(type);
  const out = fxParamDefaults(t);
  if (!t) return out;
  const src = (params && typeof params === "object") ? params : {};
  const alias = PARAM_ALIASES[t] || {};
  /** 値を 1 つ入れる（登録表に無い key は捨てる） */
  const put = (key, raw) => {
    const spec = AUDIO_FX_REGISTRY[t].params.find((p) => p.key === key);
    if (!spec) return;
    out[key] = clamp(finite(raw, spec.def), spec.min, spec.max);
  };
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (Object.prototype.hasOwnProperty.call(out, k)) { put(k, v); continue; }
    const a = alias[k];
    if (!a) continue;
    if (typeof a === "string") put(a, v);
    else if (a && typeof a.map === "function") put(a.key, a.map(finite(v, 0)));
  }
  return out;
}

/* ══ §1. 小道具 ═══════════════════════════════════════════════════════ */

/** 黙って切る（既に切れている・端末差で throw する事が在る） */
function dis(n) { if (n) { try { n.disconnect(); } catch (e) { /* noop */ } } }

/** 種を固定した乱数（響きが毎回同じになるように） */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 乾いた音と濡れた音を混ぜる口（input → dry → output, wet → output） */
function wetDry(ctx, input, output) {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry); dry.connect(output); wet.connect(output);
  return {
    dry, wet,
    set(mix) { const m = clamp01(finite(mix, 0)); dry.gain.value = 1 - m; wet.gain.value = m; },
    dispose() { dis(dry); dis(wet); }
  };
}

/** 音量を追いかける（25ms 刻み。CONTRACT-NOTE (2)）*/
function follower(ctx, src, sink, onLevel) {
  let an = null, timer = 0, buf = null, bytes = null;
  try {
    an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    /* 出口へ 0 倍で繋いでおく（行き先の無い枝を止める端末が在るため） */
    if (sink) { const mute = ctx.createGain(); mute.gain.value = 0; an.connect(mute); mute.connect(sink); }
    buf = new Float32Array(an.fftSize);
    bytes = new Uint8Array(an.fftSize);
  } catch (e) {
    L.warn("音量の追いかけを作れない（効果は素通しになります）", e && e.message);
    return { dispose() { dis(an); } };
  }
  const tick = () => {
    let data = null;
    if (typeof an.getFloatTimeDomainData === "function") { an.getFloatTimeDomainData(buf); data = buf; }
    else if (typeof an.getByteTimeDomainData === "function") {
      an.getByteTimeDomainData(bytes);
      for (let i = 0; i < bytes.length; i++) buf[i] = (bytes[i] - 128) / 128;
      data = buf;
    }
    if (!data) return;
    const { rms, peak } = peakRmsOf(data);
    try { onLevel(rms, peak, ctx.currentTime); } catch (e) { /* 1 回の失敗で止めない */ }
  };
  if (typeof setInterval === "function") timer = setInterval(tick, 25);
  return {
    dispose() {
      if (timer && typeof clearInterval === "function") clearInterval(timer);
      timer = 0;
      try { src.disconnect(an); } catch (e) { /* noop */ }
      dis(an);
    }
  };
}

/* ══ §2. 効果ひとつひとつ ═════════════════════════════════════════════
   どれも build(ctx, input, output) -> { set(values), dispose() }。
   input/output は呼ぶ側（createAudioFx）が用意した GainNode。 */

function buildEq3(ctx, input, output) {
  const lo = ctx.createBiquadFilter(); lo.type = "lowshelf"; lo.frequency.value = 220;
  const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.Q.value = 0.9;
  const hi = ctx.createBiquadFilter(); hi.type = "highshelf"; hi.frequency.value = 4500;
  input.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(output);
  return {
    set(v) {
      lo.gain.value = v.low; mid.gain.value = v.mid; hi.gain.value = v.high;
      mid.frequency.value = v.midFreq;
    },
    dispose() { dis(lo); dis(mid); dis(hi); }
  };
}

function buildEq(ctx, input, output) {
  const types = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];
  const bands = types.map((t) => { const f = ctx.createBiquadFilter(); f.type = t; return f; });
  let prev = input;
  for (const b of bands) { prev.connect(b); prev = b; }
  prev.connect(output);
  return {
    set(v) {
      for (let i = 0; i < 5; i++) {
        const n = i + 1;
        bands[i].gain.value = v["b" + n + "g"];
        bands[i].frequency.value = v["b" + n + "f"];
        if (types[i] === "peaking") bands[i].Q.value = v["b" + n + "q"];
      }
    },
    dispose() { for (const b of bands) dis(b); }
  };
}

function buildCompressor(ctx, input, output) {
  const c = ctx.createDynamicsCompressor();
  const mk = ctx.createGain();
  input.connect(c); c.connect(mk); mk.connect(output);
  return {
    set(v) {
      c.threshold.value = clamp(v.threshold, -100, 0);
      c.ratio.value = clamp(v.ratio, 1, 20);
      c.attack.value = clamp(v.attack / 1000, 0, 1);
      c.release.value = clamp(v.release / 1000, 0, 1);
      c.knee.value = clamp(v.knee, 0, 40);
      mk.gain.value = ampFromDb(v.makeup);
    },
    /** 今どれだけ押さえているか（dB・負の値）。ミキサーが出せる */
    reduction() { return finite(c.reduction && c.reduction.value !== undefined ? c.reduction.value : c.reduction, 0); },
    dispose() { dis(c); dis(mk); }
  };
}

function buildGate(ctx, input, output) {
  const g = ctx.createGain();
  g.gain.value = 1;                       // 追いかけが動かない端末では「開いたまま」
  input.connect(g); g.connect(output);
  let v = fxParamDefaults("gate");
  let open = true, openedAt = -1e9;
  const fol = follower(ctx, input, output, (rms, peak, now) => {
    const db = dbFromAmp(peak);           // 峰で判断する（子音の頭を切り落とさない）
    if (db > v.threshold) { open = true; openedAt = now; }
    else if (open && db < v.threshold - 3 && now - openedAt > v.hold / 1000) open = false;
    const target = open ? 1 : ampFromDb(v.range);
    const tc = Math.max(0.001, (open ? v.attack : v.release) / 1000) / 3;
    try { g.gain.setTargetAtTime(target, now, tc); }
    catch (e) { g.gain.value = target; }
  });
  return { set(next) { v = next; }, dispose() { fol.dispose(); dis(g); } };
}

function buildDeesser(ctx, input, output) {
  const cut = ctx.createBiquadFilter();
  cut.type = "peaking"; cut.Q.value = 1.8; cut.gain.value = 0;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.Q.value = 1.2;
  input.connect(cut); cut.connect(output);
  input.connect(band);
  let v = fxParamDefaults("deesser");
  const fol = follower(ctx, band, output, (rms, peak, now) => {
    const db = dbFromAmp(peak);
    const over = db - v.threshold;
    const want = over > 0 ? Math.max(v.range, -over * (0.5 + 1.5 * v.amount)) : 0;
    try { cut.gain.setTargetAtTime(want, now, 0.012); }
    catch (e) { cut.gain.value = want; }
  });
  return {
    set(next) { v = next; cut.frequency.value = next.freq; band.frequency.value = next.freq; },
    dispose() { fol.dispose(); dis(cut); dis(band); }
  };
}

/** 上限で丸く潰す曲線（上限の下は素通し・上は tanh で天井へ漸近） */
function clipCurve(ceilAmp, n) {
  const N = n || 2048;
  const c = new Float32Array(N);
  const ceil = clamp(finite(ceilAmp, 1), 0.02, 1);
  const knee = ceil * 0.8;
  const span = Math.max(1e-4, ceil - knee);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    c[i] = x < 0 ? -y : y;
  }
  return c;
}

function buildLimiter(ctx, input, output) {
  const c = ctx.createDynamicsCompressor();
  c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.003;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = "4x";
  input.connect(c); c.connect(shaper); shaper.connect(output);
  let sig = "";
  return {
    set(v) {
      c.threshold.value = clamp(v.ceiling, -60, 0);
      c.release.value = clamp(v.release / 1000, 0.01, 1);
      const s = String(v.ceiling);
      if (s !== sig) { sig = s; shaper.curve = clipCurve(ampFromDb(v.ceiling)); }
    },
    dispose() { dis(c); dis(shaper); }
  };
}

/** ImpulseResponse をその場で合成する（外部ファイル禁止） */
function makeIR(ctx, size, damp) {
  const sr = ctx.sampleRate || 48000;
  const sec = 0.25 + 3.75 * clamp01(size);
  const len = Math.max(8, Math.round(sec * sr));
  const buf = ctx.createBuffer(2, len, sr);
  const d = clamp01(damp);
  const lpCoef = clamp(1 - Math.pow(d, 0.6) * 0.92, 0.02, 1);   // 小さい = 暗い
  const pow = 2 + 4 * d;                                        // 減衰の速さ
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    const rnd = mulberry32(0x5eed + ch * 977);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += lpCoef * ((rnd() * 2 - 1) - lp);
      out[i] = lp * Math.pow(1 - t, pow);
    }
    /* 早期反射（左右で少しずらす。これが無いと「風呂」にしか聞こえない） */
    const taps = [0.011, 0.019, 0.031, 0.047, 0.067];
    for (let k = 0; k < taps.length; k++) {
      const i = Math.round(taps[k] * (1 + ch * 0.13) * sr);
      if (i < len) out[i] += (k % 2 ? -1 : 1) * 0.35 * (1 - k * 0.15);
    }
  }
  return buf;
}

function buildReverb(ctx, input, output) {
  const mix = wetDry(ctx, input, output);
  const pre = ctx.createDelay(0.5);
  const conv = ctx.createConvolver();
  input.connect(pre); pre.connect(conv); conv.connect(mix.wet);
  let sig = "";
  return {
    set(v) {
      mix.set(v.mix);
      pre.delayTime.value = clamp(v.predelay / 1000, 0, 0.4);
      const s = v.size.toFixed(3) + "/" + v.damp.toFixed(3);
      if (s !== sig) { sig = s; try { conv.buffer = makeIR(ctx, v.size, v.damp); } catch (e) { L.warn("響きを作れない", e && e.message); } }
    },
    dispose() { dis(pre); dis(conv); mix.dispose(); }
  };
}

function buildDelay(ctx, input, output) {
  const mix = wetDry(ctx, input, output);
  const d = ctx.createDelay(2);
  const fb = ctx.createGain();
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass";
  input.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d);   // 輪の中に DelayNode が在る
  tone.connect(mix.wet);
  return {
    set(v) {
      mix.set(v.mix);
      d.delayTime.value = clamp(v.time / 1000, 0.001, 2);
      fb.gain.value = clamp01(v.feedback) * 0.95;
      tone.frequency.value = v.tone;
    },
    dispose() { dis(d); dis(fb); dis(tone); mix.dispose(); }
  };
}

function buildStereoWiden(ctx, input, output) {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const midA = ctx.createGain(); midA.gain.value = 0.5;
  const midB = ctx.createGain(); midB.gain.value = 0.5;
  const sideA = ctx.createGain(); sideA.gain.value = 0.5;
  const sideB = ctx.createGain(); sideB.gain.value = -0.5;
  const mid = ctx.createGain();
  const side = ctx.createGain();
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.Q.value = 0.7;
  const extra = ctx.createGain(); extra.gain.value = 0;      // 広げる分（0 = 素通し）
  const sum = ctx.createGain();
  const neg = ctx.createGain(); neg.gain.value = -1;
  input.connect(split);
  split.connect(midA, 0); split.connect(midB, 1);
  midA.connect(mid); midB.connect(mid);
  split.connect(sideA, 0); split.connect(sideB, 1);
  sideA.connect(side); sideB.connect(side);
  side.connect(sum);                        // 元の side（amount 0 で完全に素通し）
  side.connect(hp); hp.connect(extra); extra.connect(sum);
  mid.connect(merge, 0, 0); mid.connect(merge, 0, 1);
  sum.connect(merge, 0, 0); sum.connect(neg); neg.connect(merge, 0, 1);
  merge.connect(output);
  return {
    set(v) { extra.gain.value = clamp01(v.amount) * 1.5; hp.frequency.value = v.bass; },
    dispose() { for (const n of [split, merge, midA, midB, sideA, sideB, mid, side, hp, extra, sum, neg]) dis(n); }
  };
}

/**
 * 粒（grain）方式のピッチ変え（CONTRACT-NOTE (3)）。
 * 遅延時間を直線で動かすと読み出し速度が変わる（= 音の高さが変わる）。
 * 表が飛ぶ所で音が切れるので、半周期ずらした 2 本を窓（W0+W1=1）で交差させる。
 */
function buildPitch(ctx, input, output) {
  const d1 = ctx.createDelay(1);
  const d2 = ctx.createDelay(1);
  const w1 = ctx.createGain(); w1.gain.value = 0;   // 値は表が足す
  const w2 = ctx.createGain(); w2.gain.value = 0;
  input.connect(d1); d1.connect(w1); w1.connect(output);
  input.connect(d2); d2.connect(w2); w2.connect(output);
  d1.delayTime.value = 0; d2.delayTime.value = 0;
  let srcs = [];
  let sig = "";

  /** 1 チャンネルの表を鳴らす source を作る（loop・同時に start） */
  function table(values, param, when) {
    const buf = ctx.createBuffer(1, values.length, ctx.sampleRate);
    buf.getChannelData(0).set(values);
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(param);
    s.start(when);
    return s;
  }

  function rebuild(v) {
    for (const s of srcs) { try { s.stop(); } catch (e) { /* noop */ } dis(s); }
    srcs = [];
    const ratio = Math.pow(2, (v.semitones + v.fine / 100) / 12);
    const grain = clamp(v.grain / 1000, 0.02, 0.2);
    const sr = ctx.sampleRate || 48000;
    const n = Math.max(2, Math.round(grain * sr));
    const maxD = Math.min(0.9, Math.abs(1 - ratio) * grain);
    const up = ratio > 1;
    const D1 = new Float32Array(n), D2 = new Float32Array(n);
    const W1 = new Float32Array(n), W2 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const u2 = (u + 0.5) % 1;
      D1[i] = (up ? 1 - u : u) * maxD;      // 上げる = 遅延を減らす（速く読む）
      D2[i] = (up ? 1 - u2 : u2) * maxD;
      W1[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
      W2[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * u2);
    }
    /* 4 本を **同じ瞬間に** 始める（位相が揃っていないと継ぎ目が鳴る） */
    const when = (ctx.currentTime || 0) + 0.02;
    try {
      srcs = [
        table(D1, d1.delayTime, when), table(D2, d2.delayTime, when),
        table(W1, w1.gain, when), table(W2, w2.gain, when)
      ];
    } catch (e) {
      L.warn("ピッチの表を張れない（素通しにします）", e && e.message);
      srcs = [];
      w1.gain.value = 1; w2.gain.value = 0;   // せめて音は通す
    }
  }

  return {
    set(v) {
      const s = v.semitones + "/" + v.fine + "/" + v.grain;
      if (s === sig) return;                 // 触っている間の作り直しを抑える
      sig = s;
      rebuild(v);
    },
    dispose() {
      for (const s of srcs) { try { s.stop(); } catch (e) { /* noop */ } dis(s); }
      srcs = [];
      dis(d1); dis(d2); dis(w1); dis(w2);
    }
  };
}

/** 歪みの曲線（tanh。強さで肩の位置が動く） */
function driveCurve(drive, n) {
  const N = n || 1024;
  const c = new Float32Array(N);
  const k = 1 + 80 * Math.pow(clamp01(drive), 2);
  const norm = Math.tanh(k);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

function buildDistortion(ctx, input, output) {
  const mix = wetDry(ctx, input, output);
  const shaper = ctx.createWaveShaper();
  shaper.oversample = "4x";
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass";
  const lvl = ctx.createGain();
  input.connect(shaper); shaper.connect(tone); tone.connect(lvl); lvl.connect(mix.wet);
  let sig = "";
  return {
    set(v) {
      mix.set(v.mix);
      if (String(v.drive) !== sig) { sig = String(v.drive); shaper.curve = driveCurve(v.drive); }
      tone.frequency.value = 800 + 15000 * clamp01(v.tone);
      lvl.gain.value = ampFromDb(v.level);
    },
    dispose() { dis(shaper); dis(tone); dis(lvl); mix.dispose(); }
  };
}

function buildFilter(type) {
  return (ctx, input, output) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    input.connect(f); f.connect(output);
    return {
      set(v) { f.frequency.value = v.freq; f.Q.value = v.q; },
      dispose() { dis(f); }
    };
  };
}

/** 型 → 組み立て関数 */
const BUILDERS = {
  eq3: buildEq3, eq: buildEq, compressor: buildCompressor, gate: buildGate,
  deesser: buildDeesser, limiter: buildLimiter, lowpass: buildFilter("lowpass"),
  highpass: buildFilter("highpass"), reverb: buildReverb, delay: buildDelay,
  stereoWiden: buildStereoWiden, pitch: buildPitch, distortion: buildDistortion
};

/* ══ §3. 口（契約書 §4）═══════════════════════════════════════════════ */

/**
 * 効果 1 つを組む（契約書 §4）。
 * @param {AudioContext} ctx
 * @param {string} type AUDIO_FX_REGISTRY の型（別名も受ける）
 * @param {Object} [params]
 * @returns {{input:AudioNode, output:AudioNode, update:Function, dispose:Function,
 *            type:string, name:string, params:Object, passthrough:boolean, dynamic:boolean}}
 *   知らない型は **素通しの箱**を返す（音が消えるより良い）。
 * @throws {Error} ctx が無いとき（呼ぶ側が復帰できるように message を明確にする）
 */
export function createAudioFx(ctx, type, params) {
  if (!ctx || typeof ctx.createGain !== "function") {
    throw new Error("createAudioFx: AudioContext が要ります（ctx が null です）");
  }
  const t = normalizeFxType(type);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const def = t ? AUDIO_FX_REGISTRY[t] : null;

  if (!t || !BUILDERS[t]) {
    /* 音の効果ではない（映像の効果・印）or 知らない型 → 素通し */
    input.connect(output);
    return {
      input, output, type: String(type || ""), name: String(type || ""),
      params: {}, passthrough: true, dynamic: false,
      update() {}, dispose() { dis(input); dis(output); }
    };
  }

  let inner = null;
  try { inner = BUILDERS[t](ctx, input, output); }
  catch (e) {
    L.error("効果を作れない: " + t, e && e.message);
    input.connect(output);
    return {
      input, output, type: t, name: def.name, params: {}, passthrough: true, dynamic: false,
      update() {}, dispose() { dis(input); dis(output); }
    };
  }

  const api = {
    input, output, type: t, name: def.name,
    params: resolveFxParams(t, params),
    passthrough: false,
    dynamic: !!def.dynamic,
    /**
     * 値を入れ直す（足りない物は既定・範囲外は丸め）。
     * @param {Object} next 部分でも全部でも良い
     */
    update(next) {
      api.params = resolveFxParams(t, { ...api.params, ...(next && typeof next === "object" ? next : {}) });
      try { inner.set(api.params); } catch (e) { L.warn("値を入れられない: " + t, e && e.message); }
      return api.params;
    },
    /** コンプ／リミッターの押さえ量（dB・無い効果は 0） */
    reduction() { return inner && typeof inner.reduction === "function" ? inner.reduction() : 0; },
    dispose() {
      try { inner.dispose(); } catch (e) { /* noop */ }
      dis(input); dis(output);
    }
  };
  try { inner.set(api.params); } catch (e) { L.warn("初期値を入れられない: " + t, e && e.message); }
  return api;
}

/**
 * 効果チェーンを束ねる（clip / トラック / マスターで使い回す）。
 * `input → 効果 → … → output`。`enabled:false` と音でない型は飛ばす。
 * @param {AudioContext} ctx
 * @param {Array<{id?:string,type:string,enabled?:boolean,params?:Object}>} [instances]
 * @returns {{input:AudioNode, output:AudioNode, items:Object[], update:Function,
 *            dispose:Function, signature:string}}
 */
export function createFxChain(ctx, instances) {
  if (!ctx || typeof ctx.createGain !== "function") {
    throw new Error("createFxChain: AudioContext が要ります（ctx が null です）");
  }
  const input = ctx.createGain();
  const output = ctx.createGain();
  let items = [];
  let sig = "";

  /** 音として意味の在る物だけを取り出す（印と映像の効果は落ちる） */
  const wanted = (list) => (Array.isArray(list) ? list : [])
    .filter((f) => f && f.enabled !== false && isAudioFxType(f.type));

  const sigOf = (list) => wanted(list).map((f) => String(f.id || "") + ":" + normalizeFxType(f.type)).join("|");

  function wire() {
    dis(input);
    let prev = input;
    for (const it of items) { prev.connect(it.input); prev = it.output; }
    prev.connect(output);
  }

  function build(list) {
    for (const it of items) { try { it.dispose(); } catch (e) { /* noop */ } }
    items = [];
    for (const f of wanted(list)) {
      try { items.push(createAudioFx(ctx, f.type, f.params)); }
      catch (e) { L.warn("効果を飛ばしました: " + String(f && f.type), e && e.message); }
    }
    wire();
  }

  build(instances);
  sig = sigOf(instances);

  return {
    input, output,
    get items() { return items; },
    get signature() { return sig; },
    /**
     * 並びが同じなら値だけ入れ直す（作り直すと音が切れるため）。
     * @param {Array} list
     */
    update(list) {
      const s = sigOf(list);
      if (s !== sig) { sig = s; build(list); return true; }
      const w = wanted(list);
      for (let i = 0; i < items.length && i < w.length; i++) items[i].update(w[i].params);
      return false;
    },
    dispose() {
      for (const it of items) { try { it.dispose(); } catch (e) { /* noop */ } }
      items = [];
      dis(input); dis(output);
    }
  };
}

/** UI が一覧を作るための並び（登録表の順 = 画面の順） */
export const AUDIO_FX_TYPES = Object.freeze(Object.keys(AUDIO_FX_REGISTRY));
