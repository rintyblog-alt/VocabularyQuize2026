/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/audio.js — 「オーディオ」タブ（音の細かい設定）

   ★ 何をする所か
     選択クリップの音を全部ここで触る。Premiere の「オーディオクリップ
     ミキサー + エフェクトコントロール」、CapCut の「オーディオ」に当たる。
       ① 音量（dB 表示・−∞〜+12dB・キーフレーム印）・ミュート
       ② フェードイン／アウト（秒 + 曲線の形）
       ③ パン・ピッチ保持
       ④ 「音を分離」「BGM として扱う」「この音で自動ダッキング」
       ⑤ 音の効果チェーン（追加 → 並べ替え → パラメータ → on/off → 削除 +
          プリセット 5 種）
       ⑥ 波形の拡大表示（フェードの傾きを重ねて描く）
       ⑦ 音量メーター（ピークホールド 1.5 秒）
       ⑧ 「無音をカット」「音量をそろえる」「ノイズを抑える」への入口

   ★ なぜこの形か
     ・**音量は dB で見せ、保存は線形**。人の耳は対数なので、0〜4 の線形
       スライダーでは「少しだけ下げる」が触れない。+12dB = 3.98 倍 ≒ ops の
       上限 4 なので、dB の幅（−60〜+12）はモデルの幅にちょうど収まる。
       −60dB は **−∞（無音）**として扱う（0 倍）。
     ・**キーフレームが在るクリップは、静的な volume を書いても音が変わらない**
       （core/eval.js の kvNum は keys を優先する）。なので keys.volume が
       在るときは `key.add` で今の時刻のキーを置き換える（Premiere と同じ挙動）。
       黙って効かない操作を残すより、打ち替える方が正直。
     ・効果チェーンは **engine/audio/fx.js の AUDIO_FX_REGISTRY が正**。
       まだ無い／読めないことがあるので、①動的 import で待たずに始め、
       ②読めたらメニューを作り直し、③読めない間は自前の控えの表
       （FALLBACK_AUDIO_FX）で操作できるようにした。登録表の形は
       配列でも `{type: def}` の地図でも受ける（normalizeAudioFxRegistry）。
     ・効果の編集は **選択の先頭 1 クリップだけ**。チェーンは並び順に意味が
       あり、複数クリップの違う並びを 1 つの一覧で表すと嘘になる。
       プリセットと「全部外す」だけは選択全部に当てる（ここは意味が壊れない）。
     ・メーターと波形は **canvas 1 枚ずつ**。DOM で作ると要素が数百になる。
       メーターは rAF で回すが 30fps に間引く（インスペクタは主役ではない）。
     ・波形は ui/timeline/waveform.js の peaks を **使い回す**（同じ素材の
       decode を 2 度やらない）。読めなければ中心線だけ引いて場所を空ける。

   ★ 触るときの注意
     ・編集は必ず ops（store.dispatch）経由。ここは store を読むだけ。
     ・`kit.driver()` が「触っている間は間引き・離したら 1 回」を持っている。
       スライダーは必ず kit 経由で作る（生の input を足すと 1 操作 N undo になる）。
     ・engine/audio/meter.js・ai/tools.js は **無いことがある**。呼ぶ前に
       関数の有無を確かめ、無ければ穏やかに断る（画面を白くしない）。

   CONTRACT-NOTE: 「BGM として扱う」「この音で自動ダッキング」「ピッチ保持」は
     契約書 §1 の Clip に置き場が無く、core/schema.js の normClip が知らない枝を
     落とすため、**FxInstance として clip.fx に積む**形で表した
     （speed.js が "pitchPreserve" で先にやっている作法に合わせた）。
       type:"pitchPreserve" … 速度変更時にピッチを保つ
       type:"bgm"           … このクリップは BGM（params.duck = ダッキング対象）
       type:"duckSource"    … この音を検出して他を下げる
                              params:{ amount, attack, release }
     engine/audio/graph.js はこの 3 つの type を「音を作る効果ではなく印」と
     して扱えばよい（AUDIO_FX_REGISTRY に載せなくても構わない。載っていない
     type は下の効果一覧から隠す）。Clip に専用の枝が増えたら、そちらへ移す。
   CONTRACT-NOTE: 契約書 §6 の ai/tools.js に「ノイズ抑制」は無い。
     `autoDenoise` が在ればそれを呼び、無ければ **noiseGate 効果を積む**
     決定論の代替に落ちる（ネット不要・必ず何か起きる、が上位の約束）。
   CONTRACT-NOTE: このファイルは 700 行を超える（作法は「超えたら分割」）。
     切れ目は既に付けてあり、**§0〜§2（純関数・約 270 行）** と
     **§3 以降（画面）** の 2 つに割れる。依存は 画面 → 純関数 の一方向で、
     §0〜§2 は store も DOM も知らない。1 枚に置いたのは「担当ファイル以外を
     作らない」という上位の約束があるため（inspector/index.js も同じ理由で
     1200 行を超えている）。inspector/audio-math.js のような置き場を作って
     良い事になったら、§0〜§2 をそのまま切り出して
     `export * from "./audio-math.js"` を足すだけで済む形にしてある
     （mixer.js は既にここから import しているので、再輸出は必要）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el } from "./index.js";
import { clamp, finite, isTouch } from "../../core/util.js";
import { assetById, MIN_CLIP } from "../../core/schema.js";
import { warn } from "../../core/log.js";

/* ── §0. 音量の算数（純関数・DOM を知らない＝Node で試験できる）───────── */

/** モデル側の音量の上限（core/ops.js が 0..4 に丸める） */
export const GAIN_MAX = 4;
/** スライダーの下端。ここは **−∞（無音）**として扱う */
export const DB_MIN = -60;
/** スライダーの上端（+12dB ≒ 3.98 倍） */
export const DB_MAX = 12;

/**
 * 線形の増幅 → dB。0 以下は −Infinity（無音）。
 * @param {number} g @returns {number}
 */
export function gainToDb(g) {
  const v = finite(g, 1);
  if (!(v > 0)) return -Infinity;
  return 20 * Math.log10(v);
}

/**
 * dB → 線形の増幅。DB_MIN 以下は 0（無音）。
 * @param {number} db @returns {number}
 */
export function dbToGain(db) {
  const v = Number(db);
  if (!Number.isFinite(v) || v <= DB_MIN) return 0;
  return clamp(Math.pow(10, v / 20), 0, GAIN_MAX);
}

/**
 * スライダーに入れて良い dB へ丸める（NaN と ±∞ を端へ寄せる）。
 * @param {number} db @returns {number}
 */
export function clampDb(db) {
  const v = Number(db);
  if (Number.isNaN(v)) return DB_MIN;
  if (v === -Infinity) return DB_MIN;
  if (v === Infinity) return DB_MAX;
  return clamp(v, DB_MIN, DB_MAX);
}

/**
 * dB の見せ方（「−∞ dB」「+3.0 dB」「−12.5 dB」）。
 * @param {number} db @param {number} [digits] @returns {string}
 */
export function fmtDb(db, digits) {
  const d = digits === undefined ? 1 : digits;
  const v = Number(db);
  if (!Number.isFinite(v) || v <= DB_MIN) return "−∞ dB";
  const a = Math.abs(v).toFixed(d);
  return (v >= 0.05 ? "+" : v <= -0.05 ? "−" : "") + a + " dB";
}

/**
 * パンの見せ方（−1 = 左, 0 = 中央, +1 = 右）。
 * @param {number} p @returns {string}
 */
export function fmtPan(p) {
  const v = clamp(finite(p, 0), -1, 1);
  if (Math.abs(v) < 0.005) return "中央";
  return (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100);
}

/**
 * メーターの読みを `{peak:[l,r], rms:[l,r]}` に揃える。
 * engine/audio/meter.js の返り値の形が決まる前でも動くように、
 * 数値・`{peak,rms}`・`{l,r}`・`{channels:[…]}`・配列を全部飲む。
 * @param {any} v @returns {{peak:number[], rms:number[]}|null}
 */
export function normalizeMeterReading(v) {
  if (v === null || v === undefined) return null;
  const pair = (x, fallback) => {
    if (Array.isArray(x)) {
      const a = clamp(finite(x[0], 0), 0, 4);
      const b = x.length > 1 ? clamp(finite(x[1], a), 0, 4) : a;
      return [a, b];
    }
    if (typeof x === "number") { const a = clamp(finite(x, 0), 0, 4); return [a, a]; }
    if (x && typeof x === "object") {
      const a = clamp(finite(x.l !== undefined ? x.l : x.left, 0), 0, 4);
      const b = clamp(finite(x.r !== undefined ? x.r : x.right, a), 0, 4);
      return [a, b];
    }
    return fallback === undefined ? null : fallback;
  };
  if (typeof v === "number") { const p = pair(v); return { peak: p, rms: p }; }
  if (Array.isArray(v)) {
    /* [l, r] か [{peak,rms}, {peak,rms}] */
    if (v.length && v[0] && typeof v[0] === "object") {
      const l = normalizeMeterReading(v[0]);
      const r = normalizeMeterReading(v[1]) || l;
      if (!l) return null;
      return { peak: [l.peak[0], r.peak[0]], rms: [l.rms[0], r.rms[0]] };
    }
    const p = pair(v);
    return p ? { peak: p, rms: p } : null;
  }
  if (typeof v !== "object") return null;
  if (Array.isArray(v.channels)) return normalizeMeterReading(v.channels);
  const peak = pair(v.peak !== undefined ? v.peak : (v.l !== undefined || v.left !== undefined ? v : null));
  const rms = pair(v.rms !== undefined ? v.rms : v.level, peak || [0, 0]);
  if (!peak && !rms) return null;
  return { peak: peak || rms, rms: rms || peak };
}

/* ── §1. 効果の登録表（engine/audio/fx.js が正・これは控え）──────────── */

/** パラメータ 1 本の既定（min/max/step/既定値/単位） */
function param(key, label, min, max, step, def, unit) {
  return { key, label, min, max, step, def, unit: unit || "" };
}

/**
 * AUDIO_FX_REGISTRY がまだ無いときに使う控えの表。
 * type の綴りは「engine 側が素直に実装する名前」に寄せてある。
 * @type {{type:string,label:string,group:string,params:Object[]}[]}
 */
export const FALLBACK_AUDIO_FX = Object.freeze([
  { type: "highpass", label: "低音を切る（ハイパス）", group: "整える", params: [param("freq", "境目", 20, 2000, 1, 100, "Hz"), param("q", "効き", 0.1, 4, 0.05, 0.7, "")] },
  { type: "lowpass", label: "高音を切る（ローパス）", group: "整える", params: [param("freq", "境目", 500, 20000, 10, 8000, "Hz"), param("q", "効き", 0.1, 4, 0.05, 0.7, "")] },
  { type: "eq", label: "イコライザ（低中高）", group: "整える", params: [param("low", "低音", -18, 18, 0.5, 0, "dB"), param("mid", "中音", -18, 18, 0.5, 0, "dB"), param("high", "高音", -18, 18, 0.5, 0, "dB"), param("midFreq", "中音の位置", 200, 6000, 10, 1800, "Hz")] },
  { type: "compressor", label: "音量をならす（コンプ）", group: "整える", params: [param("threshold", "掛かり始め", -60, 0, 0.5, -20, "dB"), param("ratio", "強さ", 1, 20, 0.1, 3, ":1"), param("attack", "反応", 0, 200, 1, 10, "ms"), param("release", "戻り", 10, 1000, 5, 180, "ms"), param("makeup", "持ち上げ", 0, 18, 0.5, 2, "dB")] },
  { type: "gate", label: "小さい音を消す（ゲート）", group: "整える", params: [param("threshold", "しきい値", -80, -10, 0.5, -45, "dB"), param("attack", "反応", 0, 100, 1, 5, "ms"), param("release", "戻り", 10, 800, 5, 120, "ms")] },
  { type: "noiseGate", label: "ノイズを抑える", group: "整える", params: [param("amount", "強さ", 0, 1, 0.01, 0.5, ""), param("threshold", "しきい値", -80, -20, 0.5, -48, "dB")] },
  { type: "deesser", label: "歯擦音を抑える", group: "整える", params: [param("amount", "強さ", 0, 1, 0.01, 0.4, ""), param("freq", "位置", 3000, 12000, 50, 6500, "Hz")] },
  { type: "limiter", label: "上を叩く（リミッター）", group: "整える", params: [param("ceiling", "上限", -12, 0, 0.1, -1, "dB")] },
  { type: "reverb", label: "残響（リバーブ）", group: "空間", params: [param("mix", "混ぜ具合", 0, 1, 0.01, 0.2, ""), param("size", "広さ", 0, 1, 0.01, 0.4, ""), param("damp", "落ち", 0, 1, 0.01, 0.5, "")] },
  { type: "delay", label: "やまびこ（ディレイ）", group: "空間", params: [param("time", "間隔", 10, 1200, 5, 240, "ms"), param("feedback", "繰り返し", 0, 0.95, 0.01, 0.3, ""), param("mix", "混ぜ具合", 0, 1, 0.01, 0.2, "")] },
  { type: "stereoWiden", label: "広がり（ステレオ）", group: "空間", params: [param("amount", "広さ", 0, 1, 0.01, 0.5, "")] },
  { type: "distortion", label: "歪ませる", group: "色付け", params: [param("drive", "強さ", 0, 1, 0.01, 0.3, ""), param("tone", "明るさ", 0, 1, 0.01, 0.5, "")] },
  { type: "pitchShift", label: "音の高さを変える", group: "色付け", params: [param("semitones", "半音", -12, 12, 1, 0, "")] }
]);

/** 効果一覧に出さない type（音を作る効果ではなく「印」。CONTRACT-NOTE 参照） */
export const MARKER_FX_TYPES = Object.freeze(["pitchPreserve", "bgm", "duckSource"]);
/** 速度変更時にピッチを保つ印（speed.js と同じ綴り） */
export const PITCH_FX_TYPE = "pitchPreserve";
/** BGM の印 */
export const BGM_FX_TYPE = "bgm";
/** ダッキングの引き金の印 */
export const DUCK_FX_TYPE = "duckSource";

/** パラメータの一覧を整える（配列でも `{key: spec}` の地図でも受ける） */
function normalizeParams(raw) {
  const out = [];
  const one = (key, spec) => {
    const k = String(key || "").trim();
    if (!k) return;
    if (typeof spec === "number") { out.push(param(k, k, 0, 1, 0.01, spec, "")); return; }
    const s = (spec && typeof spec === "object") ? spec : {};
    const def = finite(s.def !== undefined ? s.def : (s.default !== undefined ? s.default : s.value), 0);
    let min = Number(s.min);
    let max = Number(s.max);
    if (!Number.isFinite(min)) min = Math.min(0, def);
    if (!Number.isFinite(max)) max = Math.max(1, def);
    if (max <= min) max = min + 1;
    let step = Number(s.step);
    if (!Number.isFinite(step) || step <= 0) step = (max - min) / 100;
    out.push(param(k, String(s.label || s.name || k), min, max, step, clamp(def, min, max), String(s.unit || "")));
  };
  if (Array.isArray(raw)) for (const s of raw) one(s && (s.key || s.name || s.id), s);
  else if (raw && typeof raw === "object") for (const k of Object.keys(raw)) one(k, raw[k]);
  return out;
}

/**
 * AUDIO_FX_REGISTRY を `[{type,label,group,params}]` に揃える。
 * 配列（`[{type,…}]`）と地図（`{highpass:{…}}`）の両方を受ける。
 * @param {any} raw @returns {{type:string,label:string,group:string,params:Object[]}[]}
 */
export function normalizeAudioFxRegistry(raw) {
  const out = [];
  const seen = new Set();
  const push = (type, def) => {
    const t = String(type || "").trim();
    if (!t || seen.has(t)) return;
    if (MARKER_FX_TYPES.indexOf(t) >= 0) return;         // 印は効果一覧に出さない
    seen.add(t);
    const d = (def && typeof def === "object") ? def : {};
    const params = normalizeParams(d.params !== undefined ? d.params : d.paramSpecs);
    out.push({
      type: t,
      label: String(d.label || d.title || d.name || t),
      group: String(d.group || d.category || "効果"),
      params
    });
  };
  if (Array.isArray(raw)) for (const d of raw) push(d && (d.type || d.id || d.name), d);
  else if (raw && typeof raw === "object") for (const k of Object.keys(raw)) push(k, raw[k]);
  return out;
}

/** 効果の既定パラメータ（登録表の def を集めた object） */
export function defaultFxParams(def) {
  const out = {};
  for (const p of (def && def.params) || []) out[p.key] = p.def;
  return out;
}

/**
 * プリセット（依頼書の 5 つ）。type は上の控え表の綴り。
 * 登録表に無い type は当てるときに黙って飛ばす（engine が知らない効果を
 * 積むと再生時に落ちるより、少ない方が安全）。
 */
export const AUDIO_FX_PRESETS = Object.freeze([
  {
    id: "voice", label: "声を聞き取りやすく", hint: "低音の濁りを切り、音量をならして、明瞭さを足します",
    chain: [
      { type: "highpass", params: { freq: 90, q: 0.7 } },
      { type: "compressor", params: { threshold: -20, ratio: 3, attack: 8, release: 160, makeup: 3 } },
      { type: "eq", params: { low: -1, mid: 2.5, high: 2, midFreq: 3000 } },
      { type: "deesser", params: { amount: 0.35, freq: 6500 } }
    ]
  },
  {
    id: "tightbass", label: "低音を締める", hint: "ぼやけた低音を削り、余った分を持ち上げます",
    chain: [
      { type: "highpass", params: { freq: 130, q: 0.9 } },
      { type: "eq", params: { low: -3, mid: 0.5, high: 0, midFreq: 900 } },
      { type: "compressor", params: { threshold: -16, ratio: 2.5, attack: 12, release: 140, makeup: 1.5 } }
    ]
  },
  {
    id: "phone", label: "電話風", hint: "帯域を狭め、少し歪ませます",
    chain: [
      { type: "highpass", params: { freq: 400, q: 1 } },
      { type: "lowpass", params: { freq: 3200, q: 1 } },
      { type: "distortion", params: { drive: 0.22, tone: 0.6 } },
      { type: "compressor", params: { threshold: -14, ratio: 6, attack: 3, release: 90, makeup: 4 } }
    ]
  },
  {
    id: "wide", label: "広がり", hint: "左右へ広げ、薄く残響を足します",
    chain: [
      { type: "stereoWiden", params: { amount: 0.55 } },
      { type: "reverb", params: { mix: 0.14, size: 0.45, damp: 0.5 } }
    ]
  },
  {
    id: "radio", label: "ラジオ", hint: "古いラジオのような、詰まった音にします",
    chain: [
      { type: "highpass", params: { freq: 220, q: 0.8 } },
      { type: "lowpass", params: { freq: 5200, q: 0.8 } },
      { type: "compressor", params: { threshold: -24, ratio: 8, attack: 2, release: 120, makeup: 5 } },
      { type: "distortion", params: { drive: 0.12, tone: 0.35 } }
    ]
  }
]);

/* ── §2. 波形に重ねる包絡線（純関数）───────────────────────────────── */

/**
 * フェードと音量から「音の大きさの形」を 0..1 で返す（波形に重ねて描く用）。
 * core/eval.js の fadeGain と同じ形（linear / exp / log）。
 * @param {Object} clip @param {number} local clip ローカル秒
 * @returns {number} 0..1
 */
export function fadeEnvelope(clip, local) {
  const af = (clip && clip.audioFade) || {};
  const dur = Math.max(MIN_CLIP, finite(clip && clip.duration, 0));
  const t = clamp(finite(local, 0), 0, dur);
  const fi = Math.max(0, finite(af.in, 0));
  const fo = Math.max(0, finite(af.out, 0));
  const curve = String(af.curve || "linear");
  const shape = (x) => {
    const u = clamp(x, 0, 1);
    if (curve === "exp") return u * u;
    if (curve === "log") return Math.sqrt(u);
    return u;
  };
  let g = 1;
  if (fi > 1e-4) g *= shape(t / fi);
  if (fo > 1e-4) g *= shape((dur - t) / fo);
  return clamp(g, 0, 1);
}

/* ── §3. 画面 ───────────────────────────────────────────────────────── */

const FADE_CURVE_ITEMS = [
  { value: "linear", label: "まっすぐ" },
  { value: "exp", label: "ゆっくり" },
  { value: "log", label: "素早く" }
];
/** 波形の拡大倍率の段（1 = クリップ全体） */
const ZOOM_STEPS = [1, 2, 4, 8, 16];
/** ピークホールドの長さ（依頼書） */
const PEAK_HOLD_MS = 1500;
/** メーターの描き直しの間隔（30fps） */
const METER_MS = 33;

/**
 * オーディオタブを組み立てる。
 * @param {{store:Object, widgets?:Object, clipIds:string[], audio?:Object,
 *          transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, reset:Function, dispose:Function}}
 */
export function createAudioPanel(o) {
  const store = o.store;
  const widgets = o.widgets || null;
  const ctx = o.ctx || null;
  /** AudioEngine（契約書 §4）。呼び出し側が渡さなければ ctx から拾う */
  const audio = o.audio || (ctx && ctx.audio) || null;
  const kit = createFieldKit({ store, widgets, clipIds: o.clipIds, transport: o.transport });
  const root = el("div", "vqs-aud");
  root.setAttribute("data-test", "insp-audio");

  /** 効果の登録表（読めるまでは控え） */
  let registry = normalizeAudioFxRegistry(FALLBACK_AUDIO_FX);
  let registryReal = false;
  /** 効果一覧の指紋（作り直しの判断用） */
  let chainSig = "";
  /** 波形の拡大段 */
  let zoomIndex = 0;
  let disposed = false;

  const first = () => kit.clips()[0] || null;
  const fxDef = (type) => registry.find((d) => d.type === String(type)) || null;
  /** 印（bgm 等）を除いた「音の効果」だけ */
  const soundFx = (clip) => ((clip && clip.fx) || []).filter((f) => f && MARKER_FX_TYPES.indexOf(String(f.type)) < 0);
  const markerFx = (clip, type) => ((clip && clip.fx) || []).find((f) => f && String(f.type) === type) || null;

  /* ── 3.1 音量・ミュート ──────────────────────────────────────── */
  const secLevel = kit.section({ title: "音量", id: "audio-level" });

  /** 今の音量（キーが在ればその時刻の値）を dB で読む */
  function readDb() {
    const r = kit.read((c) => {
      const keys = (c.keys && c.keys.volume) || null;
      const g = keys && keys.length ? sampleList(keys, kit.localTime(c)) : finite(c.volume, 1);
      return clampDb(gainToDb(g));
    });
    return r;
  }

  const volField = kit.sld({
    label: "音量", unit: " dB", min: DB_MIN, max: DB_MAX, step: 0.5, digits: 1, center: 0,
    get: readDb,
    onInput: (db) => applyGain(dbToGain(db))
  });
  const volRead = kit.addField(makeReadout("insp-audio-db", () => {
    const r = readDb();
    return r.mixed ? "—" : fmtDb(r.value);
  }));
  secLevel.add(kit.row({ label: "音量", field: volField, path: "volume", onReset: () => applyGain(1) }));
  secLevel.body.append(volRead.el);
  secLevel.add(kit.btnRow([
    kit.btn("−6 dB", () => nudgeDb(-6)),
    kit.btn("0 dB", () => applyGain(1), { test: "insp-audio-unity" }),
    kit.btn("+6 dB", () => nudgeDb(6)),
    kit.btn("無音", () => applyGain(0))
  ], "vqs-aud__quick"));

  const muteField = kit.tog({
    label: "ミュート",
    get: () => kit.read((c) => !!c.muteAudio),
    onChange: (v) => kit.patchAll("clip.update", { patch: { muteAudio: !!v } }, { label: "ミュート" })
  });
  secLevel.add(kit.row({ label: "ミュート", field: muteField }));
  const keyNote = el("p", "vqs-insp-note vqs-aud__keynote", "");
  secLevel.body.append(keyNote);
  root.append(secLevel.el);

  /* ── 3.2 フェード ───────────────────────────────────────────── */
  const secFade = kit.section({ title: "フェード", id: "audio-fade" });
  const fadeIn = kit.num({
    label: "フェードイン", unit: "秒", min: 0, max: 30, step: 0.05, digits: 2,
    get: () => kit.read((c) => finite(c.audioFade && c.audioFade.in, 0)),
    onInput: (v) => applyFade(["in"], v)
  });
  const fadeOut = kit.num({
    label: "フェードアウト", unit: "秒", min: 0, max: 30, step: 0.05, digits: 2,
    get: () => kit.read((c) => finite(c.audioFade && c.audioFade.out, 0)),
    onInput: (v) => applyFade(["out"], v)
  });
  const fadeCurve = kit.seg({
    label: "曲線の形", items: FADE_CURVE_ITEMS,
    get: () => kit.read((c) => String((c.audioFade && c.audioFade.curve) || "linear")),
    onChange: (v) => {
      kit.patchAll("clip.update", { patch: { audioFade: { curve: String(v) } } }, { label: "フェードの形" });
      kit.update();
      drawWave();
    }
  });
  secFade.add(kit.row({ label: "フェードイン", field: fadeIn }));
  secFade.add(kit.row({ label: "フェードアウト", field: fadeOut }));
  secFade.add(kit.row({ label: "曲線の形", field: fadeCurve, hint: "「ゆっくり」は立ち上がりが遅く、「素早く」は最初から大きくなります。" }));
  secFade.add(kit.btnRow([
    kit.btn("0.3 秒ずつ足す", () => applyFadeBoth(0.3, true), { test: "insp-audio-fade-quick" }),
    kit.btn("フェードを外す", () => applyFadeBoth(0, false))
  ]));
  root.append(secFade.el);

  /* ── 3.3 パン・ピッチ ───────────────────────────────────────── */
  const secPan = kit.section({ title: "定位とピッチ", id: "audio-pan" });
  const panField = kit.sld({
    label: "パン", min: -1, max: 1, step: 0.01, digits: 2, center: 0,
    get: () => kit.read((c) => {
      const keys = (c.keys && c.keys.pan) || null;
      return clamp(keys && keys.length ? sampleList(keys, kit.localTime(c)) : finite(c.pan, 0), -1, 1);
    }),
    onInput: (v) => applyPan(v)
  });
  const panRead = kit.addField(makeReadout("insp-audio-pan", () => {
    const r = kit.read((c) => clamp(finite(c.pan, 0), -1, 1));
    return r.mixed ? "—" : fmtPan(r.value);
  }));
  secPan.add(kit.row({ label: "パン", field: panField, path: "pan", onReset: () => applyPan(0) }));
  secPan.body.append(panRead.el);

  const pitchField = kit.tog({
    label: "速度を変えても音の高さを保つ",
    get: () => kit.read((c) => !!markerFx(c, PITCH_FX_TYPE)),
    onChange: (v) => toggleMarker(PITCH_FX_TYPE, v, {}, "ピッチ保持")
  });
  secPan.add(kit.row({ label: "ピッチ保持", field: pitchField }));
  root.append(secPan.el);

  /* ── 3.4 役割（分離・BGM・ダッキング）──────────────────────── */
  const secRole = kit.section({ title: "音の役割", id: "audio-role" });
  secRole.add(kit.btnRow([
    kit.btn("音を分離", () => detachAudio(), { title: "映像から音だけを別トラックへ出します", test: "insp-audio-detach" })
  ]));
  const bgmField = kit.tog({
    label: "BGM として扱う",
    get: () => kit.read((c) => !!markerFx(c, BGM_FX_TYPE)),
    onChange: (v) => toggleMarker(BGM_FX_TYPE, v, { duck: true }, "BGM の印")
  });
  secRole.add(kit.row({ label: "BGM", field: bgmField, hint: "BGM に印を付けると、話し声が入った所で自動的に音量が下がります。" }));

  const duckField = kit.tog({
    label: "この音で自動ダッキング",
    get: () => kit.read((c) => !!markerFx(c, DUCK_FX_TYPE)),
    onChange: (v) => {
      toggleMarker(DUCK_FX_TYPE, v, { amount: 0.65, attack: 0.08, release: 0.4 }, "自動ダッキング");
      duckAmount.el.hidden = !v;
    }
  });
  secRole.add(kit.row({ label: "ダッキング", field: duckField }));
  const duckAmount = kit.sld({
    label: "下げる量", min: 0, max: 1, step: 0.01, digits: 2, center: 0.65,
    get: () => kit.read((c) => {
      const fx = markerFx(c, DUCK_FX_TYPE);
      return clamp(finite(fx && fx.params && fx.params.amount, 0.65), 0, 1);
    }),
    onInput: (v) => kit.eachClip("下げる量", (c) => {
      const fx = markerFx(c, DUCK_FX_TYPE);
      return fx ? { type: "clip.updateFx", payload: { clipId: c.id, fxId: fx.id, params: { amount: clamp(finite(v, 0.65), 0, 1) } } } : null;
    })
  });
  secRole.body.append(duckAmount.el);
  secRole.add(kit.btnRow([
    kit.btn("他の音を自動で下げる（AI）", () => runTool("autoDuck", {}, "ダッキングを当てました"), { test: "insp-audio-autoduck" })
  ]));
  root.append(secRole.el);

  /* ── 3.5 効果チェーン ───────────────────────────────────────── */
  const secFx = kit.section({ title: "音の効果", id: "audio-fx" });
  const fxNote = el("p", "vqs-insp-note vqs-aud__fxnote", "");
  const addBtn = kit.btn("＋ 効果を追加", (ev, b) => openAddMenu(b), { cls: "vqs-btn--primary", test: "insp-audio-addfx" });
  const chainHost = el("div", "vqs-aud__chain");
  chainHost.setAttribute("data-test", "insp-audio-chain");
  secFx.body.append(kit.btnRow([addBtn]), fxNote, chainHost);
  secFx.body.append(el("p", "vqs-insp-note", "プリセット"));
  secFx.body.append(kit.btnRow(
    AUDIO_FX_PRESETS.map((p) => kit.btn(p.label, () => applyPreset(p), { title: p.hint, test: "insp-audio-preset-" + p.id })),
    "vqs-insp-presets vqs-aud__presets"
  ));
  secFx.add(kit.btnRow([
    kit.btn("効果を全部外す", () => clearFx(), { test: "insp-audio-clearfx" })
  ]));
  root.append(secFx.el);

  /* ── 3.6 波形 ───────────────────────────────────────────────── */
  const secWave = kit.section({ title: "波形", id: "audio-wave" });
  const waveBox = el("div", "vqs-aud__wavebox");
  const waveCanvas = el("canvas", "vqs-aud__wave");
  waveCanvas.setAttribute("data-test", "insp-audio-wave");
  waveBox.append(waveCanvas);
  const waveMsg = el("p", "vqs-insp-note vqs-aud__wavemsg", "");
  const zoomSeg = kit.seg({
    label: "拡大",
    items: ZOOM_STEPS.map((z, i) => ({ value: String(i), label: z === 1 ? "全体" : z + "×" })),
    get: () => ({ value: String(zoomIndex), mixed: false }),
    onChange: (v) => { zoomIndex = clamp(Math.round(finite(v, 0)), 0, ZOOM_STEPS.length - 1); zoomSeg.set(String(zoomIndex), false); drawWave(); }
  });
  secWave.body.append(waveBox, waveMsg);
  secWave.add(kit.row({ label: "拡大", field: zoomSeg, hint: "拡大したときは再生位置のまわりを見せます。薄い線はフェードの傾きです。" }));
  root.append(secWave.el);

  /* ── 3.7 メーター ───────────────────────────────────────────── */
  const secMeter = kit.section({ title: "音量メーター", id: "audio-meter" });
  const meterCanvas = el("canvas", "vqs-aud__meter");
  meterCanvas.setAttribute("data-test", "insp-audio-meter");
  meterCanvas.setAttribute("role", "img");
  meterCanvas.setAttribute("aria-label", "音量メーター");
  const meterMsg = el("p", "vqs-insp-note vqs-aud__metermsg", "");
  secMeter.body.append(meterCanvas, meterMsg);
  root.append(secMeter.el);

  /* ── 3.8 自動（AI）の入口 ──────────────────────────────────── */
  const secAuto = kit.section({ title: "自動で整える", id: "audio-auto" });
  secAuto.body.append(kit.btnRow([
    kit.btn("無音をカット", () => runTool("autoCutSilence", {}, "無音を詰めました"), { test: "insp-audio-cutsilence" }),
    kit.btn("音量をそろえる", () => runTool("autoNormalize", { target: -14 }, "音量をそろえました"), { test: "insp-audio-normalize" }),
    kit.btn("ノイズを抑える", () => denoise(), { test: "insp-audio-denoise" })
  ], "vqs-aud__auto"));
  secAuto.body.append(el("p", "vqs-insp-note", "どれも取り消せます（Ctrl+Z）。素材の解析が済んでいないときは、先に解析してから当てます。"));
  root.append(secAuto.el);

  /* ── 4. 値を当てる ──────────────────────────────────────────── */

  /** キーの一覧から t の値を線形で読む（core/eval.js と同じ考え・簡易版） */
  function sampleList(list, t) {
    if (!Array.isArray(list) || !list.length) return 1;
    if (t <= finite(list[0].t, 0)) return finite(list[0].v, 1);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const ta = finite(a.t, 0);
      const tb = finite(b.t, 0);
      if (t <= tb) {
        if (String(a.ease) === "hold" || tb - ta < 1e-9) return finite(a.v, 1);
        const u = (t - ta) / (tb - ta);
        return finite(a.v, 1) + (finite(b.v, 1) - finite(a.v, 1)) * u;
      }
    }
    return finite(list[list.length - 1].v, 1);
  }

  /**
   * 音量を当てる。キーが在るクリップは **今の時刻のキーを打ち替える**
   * （静的な volume を書いても eval はキーを優先するので効かない）。
   */
  function applyGain(g) {
    const v = clamp(finite(g, 1), 0, GAIN_MAX);
    kit.eachClip("音量", (c) => {
      const keys = (c.keys && c.keys.volume) || null;
      if (keys && keys.length) return { type: "key.add", payload: { clipId: c.id, path: "volume", t: kit.localTime(c), v } };
      return { type: "clip.update", payload: { clipId: c.id, patch: { volume: v } } };
    });
    kit.update();
  }
  function nudgeDb(delta) {
    const r = readDb();
    const base = r.mixed ? 0 : clampDb(r.value);
    applyGain(dbToGain(clampDb(base + delta)));
  }
  function applyPan(p) {
    const v = clamp(finite(p, 0), -1, 1);
    kit.eachClip("パン", (c) => {
      const keys = (c.keys && c.keys.pan) || null;
      if (keys && keys.length) return { type: "key.add", payload: { clipId: c.id, path: "pan", t: kit.localTime(c), v } };
      return { type: "clip.update", payload: { clipId: c.id, patch: { pan: v } } };
    });
    kit.update();
  }
  /**
   * フェードの秒を当てる。`sides` は ["in"] / ["out"] / 両方。
   * add=true なら今の値へ足す。クリップの尺までに収める（両方足しても
   * 尺を超えないように、片側ずつ尺で丸める＝谷になるだけで壊れない）。
   */
  function applyFade(sides, sec, add) {
    const list = Array.isArray(sides) ? sides : [sides];
    kit.eachClip("フェード", (c) => {
      const dur = Math.max(MIN_CLIP, finite(c.duration, 0));
      const patch = { audioFade: {} };
      for (const side of list) {
        const cur = finite(c.audioFade && c.audioFade[side], 0);
        const want = add ? cur + finite(sec, 0) : finite(sec, 0);
        patch.audioFade[side] = clamp(want, 0, dur);
      }
      return { type: "clip.update", payload: { clipId: c.id, patch } };
    });
    kit.update();
    drawWave();
  }
  /** イン・アウトの両方を 1 取消単位で当てる */
  function applyFadeBoth(sec, add) { applyFade(["in", "out"], sec, add); }

  /** 印の効果（bgm 等）を付ける／外す */
  function toggleMarker(type, on, params, label) {
    kit.eachClip(label || "印", (c) => {
      const cur = markerFx(c, type);
      if (on) {
        if (cur) return { type: "clip.updateFx", payload: { clipId: c.id, fxId: cur.id, enabled: true } };
        return { type: "clip.addFx", payload: { clipId: c.id, type, params: params || {} } };
      }
      if (!cur) return null;
      return { type: "clip.removeFx", payload: { clipId: c.id, fxId: cur.id } };
    });
    kit.update();
    renderChain(true);
  }

  function detachAudio() {
    const list = kit.clips().filter((c) => String(c.kind) === "video" && !c.linkedId);
    if (!list.length) { kit.toast("音を切り離せる映像クリップが選ばれていません", { kind: "info" }); return; }
    try {
      if (list.length === 1) kit.patch("clip.detachAudio", { clipId: list[0].id }, { label: "音を分離" });
      else store.batch("音を分離", (d) => { for (const c of list) d("clip.detachAudio", { clipId: c.id }); });
      kit.toast("音を別のトラックへ出しました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "音を切り離せませんでした", { kind: "error" });
    }
    kit.update();
  }

  /* ── 5. 効果チェーンの一覧 ─────────────────────────────────── */

  /** 効果の一覧の指紋（id・on/off・type・パラメータの数） */
  function sigOfChain() {
    const c = first();
    if (!c) return "none";
    return soundFx(c).map((f) => f.id + ":" + f.type + ":" + (f.enabled === false ? 0 : 1)).join("|")
      + "#" + kit.clips().length + "#" + (registryReal ? "R" : "F");
  }

  /** 一覧を作り直す（force か指紋が変わったときだけ） */
  function renderChain(force) {
    const sig = sigOfChain();
    if (!force && sig === chainSig) { return; }
    chainSig = sig;
    chainHost.textContent = "";
    const clip = first();
    if (!clip) { fxNote.textContent = "クリップを選ぶと、音の効果を足せます。"; return; }
    const many = kit.clips().length > 1;
    fxNote.textContent = many
      ? "効果の並びは先頭のクリップのものです（プリセットと「全部外す」は選択した全部に当たります）。"
      : (registryReal ? "" : "効果の一覧はまだ engine から読めていないので、控えの一覧を出しています。");
    const list = soundFx(clip);
    if (!list.length) {
      chainHost.append(el("p", "vqs-insp-note", "効果はまだありません。上の「＋ 効果を追加」かプリセットから始められます。"));
      return;
    }
    list.forEach((fx, i) => chainHost.append(fxRow(clip, fx, i, list.length)));
  }

  /** 効果 1 行（掴んで並べ替え・on/off・パラメータ・削除） */
  function fxRow(clip, fx, index, total) {
    const def = fxDef(fx.type);
    const row = el("div", "vqs-aud__fx");
    row.setAttribute("data-fx", String(fx.id));
    row.setAttribute("data-test", "insp-audio-fx-" + fx.type);
    if (fx.enabled === false) row.classList.add("vqs-aud__fx--off");

    const head = el("div", "vqs-aud__fxhead");
    const grip = el("button", "vqs-aud__grip");
    grip.type = "button";
    grip.title = "掴んで並べ替え";
    grip.setAttribute("aria-label", "並べ替え");
    grip.append(kit.icon("drag", "⋮⋮"));
    grip.style.touchAction = "none";           /* CSS 担当へ: .vqs-aud__grip{touch-action:none} */
    if (isTouch()) { grip.style.minWidth = "44px"; grip.style.minHeight = "44px"; }
    const name = el("span", "vqs-aud__fxname", (def && def.label) || String(fx.type));
    const onoff = el("button", "vqs-aud__fxonoff");
    onoff.type = "button";
    onoff.setAttribute("aria-pressed", fx.enabled === false ? "false" : "true");
    onoff.title = fx.enabled === false ? "使う" : "一時的に切る";
    onoff.append(kit.icon(fx.enabled === false ? "eye-off" : "eye", fx.enabled === false ? "○" : "●"));
    const up = smallBtn("▲", "上へ", () => moveFx(clip, fx, index - 1), index <= 0);
    const down = smallBtn("▼", "下へ", () => moveFx(clip, fx, index + 1), index >= total - 1);
    const del = el("button", "vqs-aud__fxdel");
    del.type = "button";
    del.title = "削除";
    del.setAttribute("aria-label", "この効果を削除");
    del.append(kit.icon("trash", "×"));
    for (const b of [onoff, del]) if (isTouch()) { b.style.minWidth = "44px"; b.style.minHeight = "44px"; }
    head.append(grip, name, up, down, onoff, del);
    row.append(head);

    onoff.addEventListener("click", () => {
      kit.patch("clip.updateFx", { clipId: clip.id, fxId: fx.id, enabled: fx.enabled === false }, { label: "効果の on/off" });
      renderChain(true);
    });
    del.addEventListener("click", () => {
      kit.patch("clip.removeFx", { clipId: clip.id, fxId: fx.id }, { label: "効果を削除" });
      renderChain(true);
    });
    attachDrag(grip, row, clip, fx);

    /* パラメータ（登録表が知っている物だけ。知らない効果は説明だけ出す） */
    const body = el("div", "vqs-aud__fxbody");
    const specs = (def && def.params) || [];
    if (!specs.length) {
      body.append(el("p", "vqs-insp-note", def ? "触れる項目はありません。" : "この効果の項目が分かりません（engine 側の一覧に無い type です）。"));
    }
    for (const spec of specs) {
      const f = kit.sld({
        label: spec.label, min: spec.min, max: spec.max, step: spec.step, unit: spec.unit,
        digits: spec.step >= 1 ? 0 : 2, center: spec.def,
        get: () => ({ value: clamp(finite(fxParam(clip.id, fx.id, spec.key, spec.def), spec.def), spec.min, spec.max), mixed: false }),
        onInput: (v) => {
          const payload = { clipId: clip.id, fxId: fx.id, params: {} };
          payload.params[spec.key] = clamp(finite(v, spec.def), spec.min, spec.max);
          kit.patch("clip.updateFx", payload, { label: spec.label, coalesce: true });
        }
      });
      body.append(kit.row({ label: spec.label, field: f, path: "fx." + fx.id + "." + spec.key }));
    }
    row.append(body);
    return row;
  }

  function smallBtn(text, title, onClick, off) {
    const b = el("button", "vqs-aud__fxmove", text);
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.disabled = !!off;
    if (isTouch()) { b.style.minWidth = "44px"; b.style.minHeight = "44px"; }
    b.addEventListener("click", onClick);
    return b;
  }

  /** store から今のパラメータを引く（DOM に値を持たせない） */
  function fxParam(clipId, fxId, key, fallback) {
    const c = kit.clips().find((x) => x.id === clipId) || first();
    const fx = c ? ((c.fx || []).find((f) => f && f.id === fxId) || null) : null;
    if (!fx || !fx.params) return fallback;
    const v = fx.params[key];
    return v === undefined || v === null ? fallback : v;
  }

  function moveFx(clip, fx, to) {
    const list = soundFx(clip);
    const target = clamp(Math.round(finite(to, 0)), 0, list.length - 1);
    /* soundFx は印を抜いた並びなので、本体の配列での位置へ翻訳する */
    const all = (clip.fx || []).map((f) => f.id);
    const destId = list[target] && list[target].id;
    const index = destId ? all.indexOf(destId) : all.indexOf(fx.id);
    kit.patch("clip.reorderFx", { clipId: clip.id, fxId: fx.id, index }, { label: "効果を並べ替え" });
    renderChain(true);
  }

  /** 掴んで並べ替え（Pointer Events・44px の掴み所） */
  function attachDrag(grip, row, clip, fx) {
    let startY = 0;
    let rows = [];
    let myIndex = 0;
    let height = 0;
    let dragging = false;
    const onDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      rows = Array.from(chainHost.children);
      myIndex = rows.indexOf(row);
      height = row.offsetHeight || 44;
      startY = ev.clientY;
      dragging = true;
      row.classList.add("vqs-aud__fx--drag");
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const dy = ev.clientY - startY;
      row.style.transform = "translateY(" + dy + "px)";
      const shift = Math.round(dy / Math.max(20, height));
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] === row) continue;
        const want = (i > myIndex && i <= myIndex + shift) ? -height : (i < myIndex && i >= myIndex + shift) ? height : 0;
        rows[i].style.transform = want ? "translateY(" + want + "px)" : "";
      }
    };
    const onUp = (ev) => {
      if (!dragging) return;
      dragging = false;
      const dy = (ev && ev.clientY !== undefined ? ev.clientY : startY) - startY;
      const shift = Math.round(dy / Math.max(20, height));
      for (const r of rows) r.style.transform = "";
      row.classList.remove("vqs-aud__fx--drag");
      if (shift) moveFx(clip, fx, myIndex + shift);
    };
    grip.addEventListener("pointerdown", onDown);
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  }

  /** 追加のメニュー（widgets.menu が在れば使う・無ければシート／選択） */
  function openAddMenu(anchor) {
    const clip = first();
    if (!clip) { kit.toast("先にクリップを選んでください", { kind: "info" }); return; }
    const items = registry.map((d) => ({
      label: d.label, value: d.type, group: d.group,
      onSelect: () => addFx(d), onClick: () => addFx(d)
    }));
    if (!items.length) { kit.toast("足せる効果がありません", { kind: "info" }); return; }
    if (widgets && typeof widgets.menu === "function") {
      try { widgets.menu(anchor, items); return; } catch (e) { warn("audio", "menu が使えないので一覧を出す", e); }
    }
    /* 代替: その場に一覧を出す（画面が何も起きないように見えないこと） */
    const box = el("div", "vqs-aud__addlist");
    for (const it of items) box.append(kit.btn(it.label, () => { addFx(registry.find((d) => d.type === it.value)); box.remove(); }));
    if (widgets && typeof widgets.openSheet === "function") {
      try { widgets.openSheet({ title: "効果を追加", content: box }); return; } catch (e) { /* 下へ */ }
    }
    chainHost.prepend(box);
  }

  function addFx(def) {
    const clip = first();
    if (!clip || !def) return;
    const r = kit.patch("clip.addFx", { clipId: clip.id, type: def.type, params: defaultFxParams(def) }, { label: "効果を追加" });
    if (r) kit.toast(def.label + " を足しました", { kind: "success" });
    renderChain(true);
  }

  /** プリセットを選択した全クリップへ足す（登録表に無い type は飛ばす） */
  function applyPreset(preset) {
    const list = kit.clips();
    if (!list.length) { kit.toast("先にクリップを選んでください", { kind: "info" }); return; }
    const chain = preset.chain.filter((s) => !registryReal || !!fxDef(s.type));
    const skipped = preset.chain.length - chain.length;
    if (!chain.length) { kit.toast("この端末では当てられる効果がありません", { kind: "error" }); return; }
    try {
      store.batch(preset.label, (d) => {
        for (const c of list) for (const s of chain) d("clip.addFx", { clipId: c.id, type: s.type, params: s.params });
      });
      kit.toast(preset.label + " を当てました" + (skipped ? "（" + skipped + " 個は使えないので飛ばしました）" : ""), { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "プリセットを当てられませんでした", { kind: "error" });
    }
    renderChain(true);
  }

  function clearFx() {
    const list = kit.clips();
    const jobs = [];
    for (const c of list) for (const f of soundFx(c)) jobs.push({ clipId: c.id, fxId: f.id });
    if (!jobs.length) { kit.toast("外す効果がありません", { kind: "info" }); return; }
    try {
      store.batch("効果を全部外す", (d) => { for (const j of jobs) d("clip.removeFx", j); });
      kit.toast(jobs.length + " 個の効果を外しました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "外せませんでした", { kind: "error" });
    }
    renderChain(true);
  }

  /* ── 6. 自動（ai/tools.js）────────────────────────────────────── */

  /** ai/tools.js の関数を 1 つ呼ぶ（無ければ穏やかに断る） */
  async function runTool(name, opts, okMsg) {
    const tools = (ctx && ctx.ai && ctx.ai.tools) || (ctx && ctx.tools) || null;
    const fn = tools && typeof tools[name] === "function" ? tools[name] : null;
    if (!fn) { kit.toast("この機能はまだ使えません（" + name + " が見つかりません）", { kind: "info" }); return; }
    const t = kit.toast("処理しています…", { kind: "info", ms: 8000 });
    try {
      const sel = kit.clips().map((c) => c.id);
      const res = await fn(store.project, Object.assign({
        clipIds: sel, selection: sel, storage: ctx && ctx.storage, analysis: ctx && ctx.analysis
      }, opts || {}));
      closeToast(t);
      applyToolResult(res, okMsg);
    } catch (e) {
      closeToast(t);
      kit.toast((e && e.message) || "うまくいきませんでした", { kind: "error" });
    }
  }

  /** tools の返り値（{ops,summary} / ops の配列 / 何も無し）を当てる */
  function applyToolResult(res, okMsg) {
    const ops = Array.isArray(res) ? res : (res && Array.isArray(res.ops) ? res.ops : null);
    const summary = (res && res.summary) || okMsg || "できました";
    if (ops && ops.length) {
      try {
        store.batch(summary, (d) => { for (const op of ops) d(op.type, op.payload); });
      } catch (e) {
        kit.toast((e && e.message) || "当てられませんでした", { kind: "error" });
        return;
      }
    }
    const warns = (res && res.warnings) || [];
    kit.toast(summary + (warns.length ? "（" + warns[0] + "）" : ""), { kind: "success" });
    kit.update();
    renderChain(true);
    drawWave();
  }

  function closeToast(t) {
    if (t && typeof t.close === "function") { try { t.close(); } catch (e) { /* noop */ } }
  }

  /** ノイズ抑制（tools に無ければ noiseGate 効果で代替。CONTRACT-NOTE 参照） */
  function denoise() {
    const tools = (ctx && ctx.ai && ctx.ai.tools) || null;
    if (tools && typeof tools.autoDenoise === "function") { runTool("autoDenoise", {}, "ノイズを抑えました"); return; }
    const list = kit.clips();
    if (!list.length) { kit.toast("先にクリップを選んでください", { kind: "info" }); return; }
    const def = fxDef("noiseGate") || fxDef("gate");
    if (!def) { kit.toast("この端末ではノイズ抑制が使えません", { kind: "error" }); return; }
    try {
      store.batch("ノイズを抑える", (d) => {
        for (const c of list) d("clip.addFx", { clipId: c.id, type: def.type, params: defaultFxParams(def) });
      });
      kit.toast("ノイズを抑える効果を足しました（強さは下の一覧で調整できます）", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "足せませんでした", { kind: "error" });
    }
    renderChain(true);
  }

  /* ── 7. 波形 ───────────────────────────────────────────────────── */

  /** ui/timeline/waveform.js（在れば使い回す） */
  let wave = null;
  let waveMod = null;
  let peaksCache = { id: "", data: null };

  async function ensureWave() {
    if (wave || waveMod === false) return wave;
    try {
      waveMod = await import("../timeline/waveform.js");
    } catch (e) {
      waveMod = false;
      warn("audio", "waveform.js を読めない（波形は出さない）", e);
      return null;
    }
    if (disposed) return null;
    if (waveMod && typeof waveMod.createWaveform === "function") {
      try {
        wave = waveMod.createWaveform({
          storage: (ctx && ctx.storage) || null,
          ctx: (audio && audio.ctx) || null
        });
      } catch (e) { wave = null; }
    }
    return wave;
  }

  /**
   * 波形を描く（peaks が無ければ中心線だけ）。
   * peaks の取得は非同期なので、後から始まった描画が古い描画を無効にする
   * （世代 waveGen を見る。さもないと拡大を素早く切り替えたとき前の絵が残る）。
   */
  async function drawWave() {
    if (disposed) return;
    const gen = ++waveGen;
    const clip = first();
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    const cssW = Math.max(120, waveBox.clientWidth || waveCanvas.clientWidth || 280);
    const cssH = 96;
    waveCanvas.style.width = "100%";
    waveCanvas.style.height = cssH + "px";
    waveCanvas.width = Math.round(cssW * dpr);
    waveCanvas.height = Math.round(cssH * dpr);
    const g = waveCanvas.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    if (!clip) { waveMsg.textContent = "クリップを選ぶと波形が出ます。"; return; }

    const asset = assetById(store.project, clip.assetId);
    const w = await ensureWave();
    if (disposed || gen !== waveGen) return;
    const aid = String((asset && asset.id) || "");
    let pk = peaksCache.id === aid ? peaksCache.data : null;
    if (w && asset && !pk) {
      /* waveform.js の側で decode は 1 件ずつ・結果は使い回されるので、
         まだ出来ていない間に何度呼んでも重くならない */
      let got = null;
      try { got = await w.peaks(asset); } catch (e) { got = null; }
      if (disposed || gen !== waveGen) return;
      peaksCache = { id: aid, data: got };
      pk = got;
    }

    /* 見せる素材区間（拡大時は再生位置のまわり） */
    const zoom = ZOOM_STEPS[zoomIndex] || 1;
    const inS = finite(clip.in, 0);
    const outS = Math.max(inS + 1e-3, finite(clip.out, inS + 1));
    const span = (outS - inS) / zoom;
    const rel = clamp(kit.localTime(clip) / Math.max(MIN_CLIP, finite(clip.duration, 1)), 0, 1);
    let from = inS + (outS - inS) * rel - span / 2;
    from = clamp(from, inS, Math.max(inS, outS - span));
    const to = Math.min(outS, from + span);

    if (w && typeof w.draw === "function") {
      try {
        w.draw(waveCanvas, pk, {
          from, to, dpr, height: cssH, duration: asset ? asset.duration : 0,
          color: "rgba(150,214,255,.82)", gain: clamp(finite(clip.volume, 1), 0, 4)
        });
      } catch (e) { warn("audio", "波形を描けなかった", e); }
    }
    drawEnvelope(g, clip, dpr, cssW, cssH, from, to, inS, outS);
    waveMsg.textContent = pk ? "" : (asset ? "波形を作っています（初回だけ時間がかかります）。" : "この素材の波形はありません。");
  }

  /** フェードの傾きと再生位置を重ねる（薄い線） */
  function drawEnvelope(g, clip, dpr, cssW, cssH, from, to, inS, outS) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dur = Math.max(MIN_CLIP, finite(clip.duration, 0));
    const srcSpan = Math.max(1e-6, outS - inS);
    const toLocal = (src) => clamp((src - inS) / srcSpan, 0, 1) * dur;
    g.beginPath();
    for (let x = 0; x <= cssW; x += 2) {
      const src = from + (to - from) * (x / Math.max(1, cssW));
      const env = fadeEnvelope(clip, toLocal(src));
      const y = cssH - env * (cssH - 4) - 2;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = 1.5;
    g.stroke();
    /* 再生位置 */
    const cur = inS + (kit.localTime(clip) / dur) * srcSpan;
    if (cur >= from && cur <= to) {
      const x = ((cur - from) / Math.max(1e-6, to - from)) * cssW;
      g.fillStyle = "rgba(255,120,120,.9)";
      g.fillRect(x - 0.5, 0, 1.5, cssH);
    }
  }

  /* ── 8. メーター ───────────────────────────────────────────────── */

  let meterRead = null;       // (target) => {peak:[l,r], rms:[l,r]} | null
  let meterLoading = false;
  let rafId = 0;
  let lastPaint = 0;
  /** ピークホールド（チャンネルごとに「値」と「その値になった時刻」を持つ） */
  const hold = [{ v: 0, at: 0 }, { v: 0, at: 0 }];
  /** 今どのトラックのメーターを見ているか（変わったらホールドを捨てる） */
  let meterShown = "";
  /** 波形描画の世代（古い非同期の描き込みを捨てる） */
  let waveGen = 0;

  async function ensureMeter() {
    if (meterRead || meterLoading) return;
    meterLoading = true;
    let mod = null;
    try { mod = await import("../../engine/audio/meter.js"); }
    catch (e) { mod = null; }
    if (disposed) return;
    meterRead = buildMeterReader(mod, audio);
    meterMsg.textContent = meterRead ? "" : "この環境ではメーターを出せません（再生すると音は出ます）。";
  }

  /** メーターの読み口を組み立てる（形が決まっていないので順に試す） */
  function buildMeterReader(mod, engine) {
    const target = meterTarget();
    if (mod) {
      if (typeof mod.read === "function") return (id) => normalizeMeterReading(safeCall(mod.read, [id]));
      if (typeof mod.readMeter === "function") return (id) => normalizeMeterReading(safeCall(mod.readMeter, [id]));
      if (typeof mod.createMeter === "function") {
        const inst = safeCall(mod.createMeter, [{ audio: engine, ctx: engine && engine.ctx, target }]);
        if (inst && typeof inst.read === "function") return (id) => normalizeMeterReading(safeCall(inst.read.bind(inst), [id]));
      }
    }
    if (engine && typeof engine.meter === "function") return (id) => normalizeMeterReading(safeCall(engine.meter.bind(engine), [id]));
    return null;
  }
  function safeCall(fn, args) {
    try { return fn.apply(null, args || []); } catch (e) { return null; }
  }
  /** どのトラックのメーターを見せるか（選択の 1 本目・無ければ master） */
  function meterTarget() {
    const c = first();
    if (!c) return "master";
    for (const tr of (store.project && store.project.tracks) || []) {
      if ((tr.clips || []).some((x) => x && x.id === c.id)) return tr.id;
    }
    return "master";
  }

  function tick(now) {
    rafId = 0;
    if (disposed) return;
    if (!root.isConnected) { schedule(); return; }
    if (now - lastPaint >= METER_MS) {
      lastPaint = now;
      const target = meterTarget();
      if (target !== meterShown) {
        meterShown = target;
        hold[0].v = 0; hold[0].at = now;
        hold[1].v = 0; hold[1].at = now;
      }
      paintMeter(meterRead ? meterRead(target) : null, now);
    }
    schedule();
  }
  function schedule() {
    if (disposed || rafId) return;
    if (typeof requestAnimationFrame !== "function") return;
    rafId = requestAnimationFrame(tick);
  }

  /** 横 2 本（L/R）＋ ピークホールド 1.5 秒 ＋ dB の目盛り */
  function paintMeter(reading, now) {
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    const cssW = Math.max(120, meterCanvas.clientWidth || meterCanvas.parentElement && meterCanvas.parentElement.clientWidth || 260);
    const cssH = 44;
    /* style は変わった時だけ書く（33ms ごとに書くと無駄な reflow が積む） */
    if (meterCanvas.style.width !== "100%") meterCanvas.style.width = "100%";
    if (meterCanvas.style.height !== cssH + "px") meterCanvas.style.height = cssH + "px";
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (meterCanvas.width !== pw) meterCanvas.width = pw;
    if (meterCanvas.height !== ph) meterCanvas.height = ph;
    const g = meterCanvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);

    const peak = reading ? reading.peak : [0, 0];
    /* ピークホールド 1.5 秒: 上回ったら即更新、そうでなければ 1.5 秒で今の値へ落とす */
    for (let ch = 0; ch < 2; ch++) {
      const h = hold[ch];
      if (peak[ch] >= h.v) { h.v = peak[ch]; h.at = now; }
      else if (now - h.at > PEAK_HOLD_MS) { h.v = peak[ch]; h.at = now; }
    }

    const barH = 12;
    const gap = 4;
    const top = 6;
    const xOf = (db) => ((clampDb(db) - DB_MIN) / (DB_MAX - DB_MIN)) * cssW;
    /* 目盛り */
    g.font = "9px system-ui, sans-serif";
    for (const db of [-48, -36, -24, -18, -12, -6, 0]) {
      const x = xOf(db);
      g.fillStyle = db >= 0 ? "rgba(255,120,120,.55)" : "rgba(255,255,255,.22)";
      g.fillRect(x, top, 1, barH * 2 + gap);
      g.fillStyle = "rgba(255,255,255,.45)";
      g.fillText(String(db), Math.min(cssW - 14, x + 2), cssH - 2);
    }
    for (let ch = 0; ch < 2; ch++) {
      const y = top + ch * (barH + gap);
      g.fillStyle = "rgba(255,255,255,.07)";
      g.fillRect(0, y, cssW, barH);
      const w = xOf(gainToDb(peak[ch]));
      if (w > 0) {
        const grad = g.createLinearGradient(0, 0, cssW, 0);
        grad.addColorStop(0, "#3ddc97");
        grad.addColorStop(0.72, "#7ee081");
        grad.addColorStop(0.88, "#ffd166");
        grad.addColorStop(1, "#ff6b6b");
        g.fillStyle = grad;
        g.fillRect(0, y, w, barH);
      }
      const hx = xOf(gainToDb(hold[ch].v));
      if (hx > 1) {
        g.fillStyle = hold[ch].v >= 1 ? "#ff6b6b" : "rgba(255,255,255,.9)";
        g.fillRect(hx - 1, y, 2, barH);
      }
    }
    if (!reading) {
      g.fillStyle = "rgba(255,255,255,.35)";
      g.fillText("再生すると動きます", 4, top + barH - 2);
    }
  }

  /* ── 9. 契約の形 ──────────────────────────────────────────────── */

  /** 表示の出し入れ（選択の中身で変わる物） */
  function refreshShape() {
    const clip = first();
    const kinds = kit.clips().map((c) => String(c.kind));
    const hasVideo = kinds.indexOf("video") >= 0;
    secRole.el.classList.toggle("vqs-aud--novideo", !hasVideo);
    duckAmount.el.hidden = !(clip && markerFx(clip, DUCK_FX_TYPE));
    const keyed = kit.clips().some((c) => ((c.keys && c.keys.volume) || []).length || ((c.keys && c.keys.pan) || []).length);
    keyNote.textContent = keyed
      ? "キーフレームがあるので、スライダーは「今の再生位置のキー」を書き換えます。"
      : "";
    keyNote.hidden = !keyed;
  }

  /** 値だけを読み直す「読み」の行を作る（kit.addField で update に乗せる） */
  function makeReadout(testId, text) {
    const host = el("div", "vqs-aud__readout");
    host.setAttribute("data-test", testId);
    const v = el("span", "vqs-aud__readoutv", "—");
    host.append(v);
    return { el: host, set() { v.textContent = text(); }, refresh() { v.textContent = text(); } };
  }

  /* 効果の登録表を engine から取り直す（待たない） */
  (async () => {
    try {
      const mod = await import("../../engine/audio/fx.js");
      const raw = mod && (mod.AUDIO_FX_REGISTRY || mod.default || mod.REGISTRY);
      const list = normalizeAudioFxRegistry(raw);
      if (disposed || !list.length) return;
      registry = list;
      registryReal = true;
      renderChain(true);
    } catch (e) {
      warn("audio", "engine/audio/fx.js をまだ読めない（控えの一覧で動かす）", e && e.message);
    }
  })();

  kit.update(o.clipIds);
  refreshShape();
  renderChain(true);
  drawWave();
  ensureMeter();
  schedule();

  return {
    el: root,
    update(ids) {
      kit.update(ids);
      refreshShape();
      renderChain(false);
      drawWave();
    },
    reset() {
      const jobs = [];
      for (const c of kit.clips()) {
        jobs.push({ type: "clip.update", payload: { clipId: c.id, patch: { volume: 1, pan: 0, muteAudio: false, audioFade: { in: 0, out: 0, curve: "linear" } } } });
        for (const f of soundFx(c)) jobs.push({ type: "clip.removeFx", payload: { clipId: c.id, fxId: f.id } });
      }
      if (!jobs.length) return;
      try { store.batch("音を既定へ戻す", (d) => { for (const j of jobs) d(j.type, j.payload); }); }
      catch (e) { kit.toast((e && e.message) || "戻せませんでした", { kind: "error" }); }
      kit.update();
      refreshShape();
      renderChain(true);
      drawWave();
    },
    dispose() {
      disposed = true;
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      rafId = 0;
      if (wave && typeof wave.dispose === "function") { try { wave.dispose(); } catch (e) { /* noop */ } }
      wave = null;
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
