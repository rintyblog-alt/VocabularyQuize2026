/* ══════════════════════════════════════════════════════════════════════════
   engine/audio/mix.js — 書き出し用の音を作る所（契約書 §4 / §11.3 / §13.6）

   ★ 何をする所か
     `renderMixdown(project, opts)` で **OfflineAudioContext** に音を組み立て、
     1 本の AudioBuffer にして返す。`audioBufferToWav()` で .wav にもする。
     そして この所の本体は「鳴らす前の**計画**を作る純関数」である:
       planAudioEvents … いつ・どの素材の どこを・どの速さ・どの音量で鳴らすか
       planDucking     … 声の所で BGM を下げる曲線
       planChunks      … 長尺を区間に割る計画
       limiterCurve    … master limiter の形（WaveShaper の curve）
       wavBytes        … WAV のバイト列
     再生（engine/audio/graph.js）は この計画を import して **同じ規則**で
     鳴らす。契約書 §13.6 の「書き出しの音は再生と同じ組み立て関数を使い回す
     （別実装にすると必ずずれる）」を満たすのは この共有だけである。
     ★ graph.js が使う口: planAudioEvents / planAudioMix / planDucking /
       duckGainAt / buildGainCurve / limiterCurve / reverseChannels /
       curveAt / mulCurves と 各定数。

   ★ なぜこの形か
     ・**音量・パンは eval.js に決めさせる**（`resolvedAudioGain` / `sampleKey`）。
       フェード曲線もキーフレームもトラック音量も、既に eval が持っている。
       ここで式を書き直すと「プレビューと書き出しで音量が違う」になる。
       この所の仕事は「eval の点の値を **区間の曲線**に畳む」ことだけ。
     ・AudioBufferSourceNode は 1 本で区分線形の速度ランプを追えないので、
       **ランプの折れ点で event を割る**（`rate` は区間の平均倍率 =
       使う素材秒 / 出力秒。これなら区間の端で必ず同期が合う）。
       automation を使いたい人向けに `rateCurve` も一緒に載せる。
     ・`duration` は **出力（タイムライン）側の秒**にした。`start(when, offset,
       duration)` の第 3 引数は「buffer 側の秒」で、実装ごとの解釈の揺れが
       怖い。だから mix/graph は `start(when, offset)` + `stop(when+duration)`
       で止める。素材側の長さが欲しい人は `sourceDuration` を見る。
     ・master limiter は DynamicsCompressorNode ではなく **WaveShaper の
       ソフトクリップ**。compressor は実装によって先読みの遅れ（数 ms）が
       入り、映像と音がずれる／再生と書き出しで違う物になる。波形整形なら
       遅れ 0・計算も純関数（`limiterCurve`）で試験できる。
     ・長尺は OfflineAudioContext がメモリで死ぬので区間に割る。つなぎ目は
       **前の区間の尻を 5ms 重ねて線形クロスフェード**。同じ音を重ねるので
       線形（和が 1）が正しい（等パワーだと 1.41 倍に膨れる）。
     ・区間ごとに `planAudioMix` を **もう一度**呼ぶ（範囲を狭めて）。
       event の切り出し・offset・曲線の計算を 1 か所に保つため。少し余分に
       計算するが、区間の継ぎ目の算数を二重に書くより安い。

   ★ 触るときの注意
     ・`event.gainCurve` には **トラック音量が既に入っている**（eval の
       `resolvedAudioGain` がそうする）。`event.pan` にも track.pan が入る。
       トラックのノードで もう一度掛けると二重になる。トラックのノードは
       **効果（fx）専用**。
     ・`when` は「書き出す範囲の頭を 0」とした秒。絶対のタイムライン秒が
       欲しいときは `timelineStart`。
     ・`offset` は `start()` にそのまま渡す値。reverse の event は
       **素材を逆にした buffer**を前提にした座標（= assetDuration - sourceOut）。
       実際の buffer の長さが asset.duration と違うときは
       `offset + (buffer.duration - assetDuration)` で寄せ直す（下の
       `startOffsetFor()` がそれをやる）。
     ・engine は ui を import しない（契約書 §0）。so 「印」の fx の綴りは
       ui/inspector/audio.js と **同じ文字列を此処にも書いてある**。片方だけ
       変えると黙って効かなくなる（MARKER_FX_TYPES のコメント参照）。
     ・decodeAudioData は渡した ArrayBuffer を取り上げる。使い回さない。

   CONTRACT-NOTE (1): 契約書 §4 は `renderMixdown(project, { sampleRate,
     duration, onProgress, signal })`。担当指示は `{ sampleRate, range,
     onProgress, signal, storage }`。**両方受ける**（`range` → `start`+
     `duration` → project 全体 の順に決める）。export/exporter.js は
     `sampleRate / duration / start / range / audioTracks /
     excludeAudioTracks / onProgress / signal` を渡してくるので、
     そのどれも落とさない。返すのは **範囲ぶんだけ**の AudioBuffer
     （exporter の pickAudioWindow は全体尺が来た時だけずらす作りなので、
     範囲ぶんを返せばそのまま合う）。
   CONTRACT-NOTE (2): 契約書 §4 の renderMixdown は「どのトラックを混ぜるか」
     を受け取らない。§11.3 の「BGM 抜き・特定トラックのみ」を満たすため
     `audioTracks` / `excludeAudioTracks` を受ける（exporter も渡してくる）。
   CONTRACT-NOTE (3): `planAudioEvents` の返りは契約どおり **配列**。
     警告や範囲も要る所（renderMixdown / exporter）のために
     `planAudioMix()` が `{ events, warnings, range, ... }` を返す。
     `planAudioEvents = planAudioMix(...).events`。
   CONTRACT-NOTE (4): engine/audio/fx.js（トラック/クリップの音の効果）は
     まだ無い。**動的 import** で在れば使い、無ければ素通りにする
     （静的 import にすると selftest.html の mix.js 読み込みごと失敗する）。
     `pitchPreserve`（速度を変えても音の高さを保つ）は未実装で、
     `stats().holes` に申告する。
   CONTRACT-NOTE (5): 作法は「1 ファイル 700 行で分割」だが、分割先
     （engine/audio/mixdown.js など）は担当外で作れない。core/eval.js や
     ui/inspector/audio.js と同じ事情なので、章立て（§A〜§H）で読めるように
     した。§A〜§F は **純関数だけ**（Node で試験できる。tests/mix-plan.test.mjs）、
     §G〜§H が Web Audio を触る所。切り出すならこの線で割れる。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { finite, clamp, clamp01, lerp } from "../../core/util.js";
import { DEFAULT_FPS } from "../../core/time.js";
import { MIN_CLIP, projectDuration } from "../../core/schema.js";
import { buildSpeedMap, resolvedAudioGain, sampleKey } from "../../core/eval.js";
import { warn } from "../../core/log.js";

/* ══ §A 定数と小道具 ═══════════════════════════════════════════════ */

/** 書き出しの既定の標本化周波数（契約書 §1 settings.sampleRate） */
export const DEFAULT_SAMPLE_RATE = 48000;
/** 区間分割の 1 区間の長さ（秒） */
export const CHUNK_SEC = 60;
/** これより長いときだけ区間に割る（10 分。契約書 §4 の指示） */
export const SPLIT_ABOVE = 600;
/** つなぎ目のクロスフェード（秒）。短いほど良いが 1ms 未満は無意味 */
export const XFADE = 0.005;
/** 進捗を出す間隔（ms） */
export const PROGRESS_MS = 200;
/** 音量曲線を標本化する刻み（秒。50Hz） */
export const GAIN_STEP = 0.02;
/** 曲線を間引くときの許容差（これ以下の折れは捨てる） */
export const GAIN_TOL = 1e-3;
/** 速度ランプを刻む長さ（秒）。折れ点の間をこれ以下に割る */
export const RAMP_STEP = 0.5;
/* master limiter の上限（線形）。**-1dBFS**。engine/audio/fx.js の "limiter"
   の既定（ceiling:-1dB）と同じ高さにしてある（再生と書き出しで頂点を揃える）。 */
export const LIMITER_CEILING = 0.891;
/** 上限の何割から曲げ始めるか（0.9 ≒ -2dB から穏やかに） */
export const LIMITER_KNEE = 0.9;
/** WaveShaper の入力は -1..1 しか無いので、この倍率で潰して通す */
export const LIMITER_DRIVE = 4;
/** curve の点数（2048 で 16bit の段より細かい） */
export const LIMITER_CURVE_SIZE = 2048;
/** WAV の頭の大きさ（RIFF + fmt + data のヘッダ） */
export const WAV_HEADER_SIZE = 44;

/* 「音を作る効果ではなく印」の fx。綴りは ui/inspector/audio.js と同じ物を
   書いてある（engine は ui を import できない。契約書 §0 の依存の向き）。
   片方だけ変えると黙って効かなくなるので、変えるときは両方直す。 */
/** 速度を変えても音の高さを保つ印（未実装。stats().holes に出る） */
export const PITCH_FX_TYPE = "pitchPreserve";
/** BGM の印（params.duck が真ならダッキングの対象） */
export const BGM_FX_TYPE = "bgm";
/** 「この音が鳴っている所で BGM を下げる」引き金の印 */
export const DUCK_FX_TYPE = "duckSource";
/** 効果の鎖に流さない type（印なので） */
export const MARKER_FX_TYPES = Object.freeze([PITCH_FX_TYPE, BGM_FX_TYPE, DUCK_FX_TYPE]);
/** ダッキングの既定（ai/tools.js の AUTO_DEFAULTS.duck と同じ数） */
export const DUCK_DEFAULTS = Object.freeze({ amount: 0.7, attack: 0.15, release: 0.4 });

const T_EPS = 1e-6;
const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);

const arr = (v) => (Array.isArray(v) ? v : EMPTY_ARR);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : EMPTY);
const str = (v) => (typeof v === "string" ? v : (v === undefined || v === null ? "" : String(v)));
const fpsOf = (v) => { const f = finite(v, DEFAULT_FPS); return f > 0 ? f : DEFAULT_FPS; };
const r6 = (n) => Math.round(finite(n, 0) * 1e6) / 1e6;

/** 中止は DOMException("AbortError") に合わせる（exporter.js と同じ形） */
function abortError(msg = "音の合成を中止しました") {
  const D = globalThis.DOMException;
  if (typeof D === "function") {
    try { return new D(msg, "AbortError"); } catch (_e) { /* 古い実装 */ }
  }
  const e = new Error(msg);
  e.name = "AbortError";
  return e;
}
function throwIfAborted(signal) { if (signal && signal.aborted) throw abortError(); }

/** 音を鳴らし得るトラックか（adjust は効果だけの層なので鳴らない） */
const isSoundTrack = (t) => !!t && typeof t === "object" && str(t.kind) !== "adjust";
/** solo が 1 つでも立っているか（音のトラックの中で） */
function anySolo(tracks) {
  for (const t of arr(tracks)) if (isSoundTrack(t) && t && t.solo) return true;
  return false;
}
/** clip の fx から「印」を 1 つ拾う（enabled が false の物は無い扱い） */
export function markerFx(clip, type) {
  for (const f of arr(clip && clip.fx)) {
    if (f && str(f.type) === type && f.enabled !== false) return f;
  }
  return null;
}
/** 効果の鎖に流す fx だけ（印を除く） */
export function soundFxOf(owner) {
  const out = [];
  for (const f of arr(owner && owner.fx)) {
    if (!f || f.enabled === false) continue;
    if (MARKER_FX_TYPES.indexOf(str(f.type)) >= 0) continue;
    out.push(f);
  }
  return out;
}
/** clip が音を持ち得るか（eval.js の clipHasAudio と同じ規則） */
export function clipHasAudio(clip, asset) {
  const k = str(clip && clip.kind);
  if (k === "audio" || k === "compound") return true;
  if (k === "video") return !!asset && asset.hasAudio !== false;
  return false;
}
/** assets を id → asset の地図に */
function assetMapOf(project) {
  const m = new Map();
  for (const a of arr(project && project.assets)) if (a && a.id) m.set(str(a.id), a);
  return m;
}
/** id の一覧を Set に（空なら null = 絞り込み無し） */
function idSet(list) {
  const out = new Set();
  for (const v of arr(list)) { const s = str(v); if (s) out.add(s); }
  return out.size ? out : null;
}

/* ══ §B 曲線の小道具（[{t,v}] を扱う純関数）══════════════════════ */

/**
 * 折れ線の t での値（区間の外は端の値を保つ）。
 * @param {{t:number,v:number}[]} curve @param {number} t @returns {number}
 */
export function curveAt(curve, t) {
  const c = arr(curve);
  const n = c.length;
  if (!n) return 1;
  const x = finite(t, 0);
  if (x <= finite(c[0].t, 0)) return finite(c[0].v, 0);
  if (x >= finite(c[n - 1].t, 0)) return finite(c[n - 1].v, 0);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (finite(c[mid].t, 0) <= x) lo = mid; else hi = mid;
  }
  const a = c[lo], b = c[hi];
  const t0 = finite(a.t, 0), t1 = finite(b.t, 0);
  if (t1 - t0 <= T_EPS) return finite(b.v, 0);
  return lerp(finite(a.v, 0), finite(b.v, 0), (x - t0) / (t1 - t0));
}

/**
 * 2 本の折れ線を掛ける（t の集合は和。間は線形で読む）。
 * 入れ子（compound）の外側の音量を内側に掛けるのに使う。
 * @param {{t:number,v:number}[]} a @param {{t:number,v:number}[]} b
 * @returns {{t:number,v:number}[]}
 */
export function mulCurves(a, b) {
  const A = arr(a), B = arr(b);
  if (!A.length) return B.map((p) => ({ t: r6(p.t), v: finite(p.v, 0) }));
  if (!B.length) return A.map((p) => ({ t: r6(p.t), v: finite(p.v, 0) }));
  const ts = [];
  for (const p of A) ts.push(finite(p.t, 0));
  for (const p of B) ts.push(finite(p.t, 0));
  ts.sort((x, y) => x - y);
  const out = [];
  let last = NaN;
  for (const t of ts) {
    if (Number.isFinite(last) && Math.abs(t - last) <= T_EPS) continue;
    last = t;
    out.push({ t: r6(t), v: r6(curveAt(A, t) * curveAt(B, t)) });
  }
  return out;
}

/**
 * 折れ線の要らない点を捨てる（隣 2 点の直線から `tol` 以内なら消す）。
 * 定数なら 2 点、直線のフェードなら 2 点、曲がった所だけ点が残る。
 * 端の 2 点は必ず残す。
 * @param {{t:number,v:number}[]} pts @param {number} [tol]
 * @returns {{t:number,v:number}[]}
 */
export function collapseCurve(pts, tol) {
  const p = arr(pts);
  if (p.length <= 2) return p.slice();
  const eps = Math.max(0, finite(tol, GAIN_TOL));
  const out = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = out[out.length - 1], b = p[i], c = p[i + 1];
    const span = finite(c.t, 0) - finite(a.t, 0);
    const u = span > T_EPS ? (finite(b.t, 0) - finite(a.t, 0)) / span : 0;
    const want = lerp(finite(a.v, 0), finite(c.v, 0), clamp01(u));
    if (Math.abs(finite(b.v, 0) - want) > eps) out.push(b);
  }
  out.push(p[p.length - 1]);
  return out;
}

/** 時刻の一覧を昇順・重複なしにして [from, to] に収める */
function tidyTimes(times, from, to) {
  const out = [];
  const list = arr(times).map((t) => finite(t, 0)).filter((t) => t >= from - T_EPS && t <= to + T_EPS);
  list.push(from, to);
  list.sort((a, b) => a - b);
  for (const t of list) {
    const x = clamp(t, from, to);
    const last = out[out.length - 1];
    if (last !== undefined && Math.abs(last - x) <= T_EPS) continue;
    out.push(x);
  }
  if (out.length === 1) out.push(out[0]);
  return out;
}

/* ══ §C 区間分割の計画（planChunks）══════════════════════════════ */

/** 1 区間ぶんの器 */
function oneChunk(index, start, end, pre) {
  return {
    index,
    start: r6(start), end: r6(end), duration: r6(end - start),
    /** 前の区間と重ねる長さ（先頭は 0） */
    pre: r6(pre),
    /** 実際に OfflineAudioContext で作る範囲 */
    renderStart: r6(start - pre), renderEnd: r6(end),
    renderDuration: r6(end - start + pre),
    /** 出力の何秒目から書き込むか（= renderStart） */
    writeAt: r6(start - pre),
    /** 書き込みの頭で前の音と混ぜる長さ（線形クロスフェード） */
    fadeIn: r6(pre), fadeOut: 0
  };
}

/**
 * 長い音を OfflineAudioContext に優しい区間へ割る計画（純関数・試験する）。
 * ・`duration <= min`（既定 10 分）なら **割らない**（1 区間）。
 * ・2 区間目以降は頭に `xfade` 秒の助走を付ける。出力へ書くときに
 *   その助走ぶんを前の区間と線形クロスフェードすれば継ぎ目が鳴らない。
 * ・最後の切れ端が短すぎる（クロスフェードに足りない）ときは 1 つ前に足す。
 * @param {number} duration 全体の秒数
 * @param {{chunk?:number, xfade?:number, min?:number}} [opts]
 * @returns {{index:number,start:number,end:number,duration:number,pre:number,
 *   renderStart:number,renderEnd:number,renderDuration:number,
 *   writeAt:number,fadeIn:number,fadeOut:number}[]}
 */
export function planChunks(duration, opts) {
  const o = plain(opts);
  const total = Math.max(0, finite(duration, 0));
  const chunk = Math.max(0.25, finite(o.chunk, CHUNK_SEC));
  const xfade = clamp(finite(o.xfade, XFADE), 0, chunk / 4);
  const min = Math.max(0, finite(o.min, SPLIT_ABOVE));
  if (!(total > T_EPS)) return [oneChunk(0, 0, 0, 0)];
  if (total <= min + T_EPS || total <= chunk + T_EPS) return [oneChunk(0, 0, total, 0)];

  const out = [];
  const n = Math.ceil(total / chunk - T_EPS);
  for (let i = 0; i < n; i++) {
    const start = i * chunk;
    const end = Math.min(total, (i + 1) * chunk);
    if (end - start <= T_EPS) break;
    out.push(oneChunk(out.length, start, end, out.length ? xfade : 0));
  }
  /* 切れ端が短すぎると「助走だけの区間」になって継ぎ目が濁る → 前に足す */
  const tiny = Math.max(4 * xfade, 0.05);
  if (out.length > 1 && out[out.length - 1].duration < tiny) {
    const last = out.pop();
    const prev = out[out.length - 1];
    prev.end = last.end;
    prev.duration = r6(prev.end - prev.start);
    prev.renderEnd = prev.end;
    prev.renderDuration = r6(prev.renderEnd - prev.renderStart);
  }
  return out;
}

/* ══ §D ダッキング（声の所で BGM を下げる）═════════════════════ */

/** 印のパラメータを読む（欠けていたら ai/tools.js と同じ既定値） */
function duckParams(mark) {
  const pr = plain(mark && mark.params);
  return {
    amount: clamp(finite(pr.amount, DUCK_DEFAULTS.amount), 0.05, 0.95),
    attack: clamp(finite(pr.attack, DUCK_DEFAULTS.attack), 0.02, 2),
    release: clamp(finite(pr.release, DUCK_DEFAULTS.release), 0.02, 4)
  };
}

/** 重なる／近すぎる窓を 1 つに畳む（join 以内の隙間は繋げる） */
function mergeWindows(wins, join) {
  const list = wins.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const w of list) {
    const last = out[out.length - 1];
    if (last && w[0] - last[1] <= join + T_EPS) { if (w[1] > last[1]) last[1] = w[1]; }
    else out.push([w[0], w[1]]);
  }
  return out;
}

/**
 * ダッキングの計画（純関数）。
 * 対象は `bgm`（params.duck !== false）の印が付いた clip。引き金は 2 通り:
 *   ① `duckSource` の印が付いた clip（ui/inspector/audio.js の「この音で下げる」）
 *   ② ①が 1 つも無いとき … **BGM 以外の音が鳴っている所**（BGM のトラックを
 *      除く）。engine/audio/graph.js の生ダッキングが この形なので合わせた。
 *      印を付けずに BGM を入れただけ（ui/library.js は取り込み時に
 *      `bgm {duck:true}` を積む）でも 再生と書き出しで同じように下がる。
 * ②の深さ・反応は **BGM 側の印**の params から採る（graph.js と同じ）。
 * ai/tools.js の autoDuck は volume のキーフレームを焼くので ここは通らない
 * （焼いた物は eval が読む）。此処は「印だけ付けて生で下げる」道。
 *
 * CONTRACT-NOTE: graph.js の②は素材の loudness 包絡で **声の大きさに応じて**
 *   下げる（decode 済みの音が要るので純関数では出せない）。ここは窓の中を
 *   一律 `amount` だけ下げる。下げ始め／戻りの時刻と対象は一致するが、
 *   窓の中の深さは数 dB 違い得る。統合担当へ: 完全に揃えたいなら
 *   graph.js 側を `planDucking` + `duckGainAt` に寄せるのが筋（そのために
 *   この 2 つを export している）。
 * @param {Object} project
 * @param {{audioTracks?:string[]|null, excludeAudioTracks?:string[]|null}} [opts]
 * @returns {{sources:{clipId:string,trackId:string,start:number,end:number,
 *   amount:number,attack:number,release:number}[], targets:string[],
 *   targetTracks:string[], has:boolean, implicit:boolean}}
 */
export function planDucking(project, opts) {
  const o = plain(opts);
  const p = plain(project);
  const only = idSet(o.audioTracks);
  const skip = idSet(o.excludeAudioTracks);
  const solo = anySolo(p.tracks);
  const amap = assetMapOf(p);
  const sources = [];
  const targets = [];
  const targetTracks = new Set();
  let first = null;                 // ②で使う「BGM 側の印」（最初に見つけた物）
  /** ②の候補（BGM でない・音を持つ・鳴る clip の窓） */
  const maybe = [];

  for (const track of arr(p.tracks)) {
    if (!isSoundTrack(track) || track.muted) continue;
    if (solo && !track.solo) continue;
    if (only && !only.has(str(track.id))) continue;
    if (skip && skip.has(str(track.id))) continue;
    for (const clip of arr(track.clips)) {
      if (!clip || clip.muteAudio) continue;
      const start = Math.max(0, finite(clip.start, 0));
      const dur = Math.max(0, finite(clip.duration, 0));
      const bgm = markerFx(clip, BGM_FX_TYPE);
      if (bgm && plain(bgm.params).duck !== false) {
        targets.push(str(clip.id));
        targetTracks.add(str(track.id));
        if (!first) first = duckParams(bgm);
      }
      const src = markerFx(clip, DUCK_FX_TYPE);
      if (src && dur > T_EPS) {
        const pr = duckParams(src);
        sources.push({
          clipId: str(clip.id), trackId: str(track.id),
          start: r6(start), end: r6(start + dur),
          amount: pr.amount, attack: pr.attack, release: pr.release
        });
      }
      if (!bgm && dur > T_EPS) {
        const asset = clip.assetId ? amap.get(str(clip.assetId)) || null : null;
        if (clipHasAudio(clip, asset)) maybe.push({ trackId: str(track.id), w: [start, start + dur] });
      }
    }
  }

  let implicit = false;
  if (!sources.length && targets.length && first) {
    /* ② BGM 以外の音が鳴っている所（BGM のトラックの中の音は引き金にしない） */
    const wins = maybe.filter((m) => !targetTracks.has(m.trackId)).map((m) => m.w);
    for (const w of mergeWindows(wins, first.attack + first.release)) {
      sources.push({
        clipId: "", trackId: "", start: r6(w[0]), end: r6(w[1]),
        amount: first.amount, attack: first.attack, release: first.release
      });
    }
    implicit = sources.length > 0;
  }
  sources.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    sources, targets, targetTracks: Array.from(targetTracks),
    has: !!(sources.length && targets.length), implicit
  };
}

/**
 * ダッキングの外部ゲイン（1 = 下げない）。
 * 引き金の頭で **既に下がり切っている**ように attack だけ手前から落とす
 * （ai/tools.js の autoDuck と同じ形。声の頭が埋もれない）。
 * 重なったら いちばん深い物を採る。
 * @param {{sources:Array, targets:string[]}} plan @param {number} t タイムライン秒
 * @param {string} [clipId] 対象の clip（印の無い clip は下げない）
 * @returns {number} 0..1
 */
export function duckGainAt(plan, t, clipId) {
  const pl = plain(plan);
  const sources = arr(pl.sources);
  if (!sources.length) return 1;
  const id = str(clipId);
  if (id) {
    const targets = arr(pl.targets);
    if (targets.length && targets.indexOf(id) < 0) return 1;
  }
  const x = finite(t, 0);
  let g = 1;
  for (const s of sources) {
    if (id && s.clipId === id) continue;            // 自分では下がらない
    const low = 1 - s.amount;
    let v = 1;
    if (x <= s.start - s.attack || x >= s.end + s.release) continue;
    else if (x < s.start) v = lerp(1, low, (x - (s.start - s.attack)) / s.attack);
    else if (x <= s.end) v = low;
    else v = lerp(low, 1, (x - s.end) / s.release);
    if (v < g) g = v;
  }
  return clamp01(g);
}

/** ダッキングの折れ点（clip ローカル秒で返す） */
function duckBreaks(plan, clipStart, from, to) {
  const out = [];
  for (const s of arr(plain(plan).sources)) {
    for (const t of [s.start - s.attack, s.start, s.end, s.end + s.release]) {
      const l = t - clipStart;
      if (l > from + T_EPS && l < to - T_EPS) out.push(l);
    }
  }
  return out;
}

/* ══ §E 音量・パンの曲線（eval の点を区間に畳む）═══════════════ */

/** volume/pan のキーの t（clip ローカル秒）を集める */
function keyTimes(clip, path) {
  const keys = plain(clip && clip.keys);
  const list = arr(keys[path]);
  const out = [];
  for (const k of list) {
    const t = finite(k && k.t, NaN);
    if (Number.isFinite(t)) out.push(t);
    /* hold（段差）と急な折れを潰さないよう、直前にも 1 点置く */
    if (Number.isFinite(t) && t > 0) out.push(t - 1e-3);
  }
  return out;
}
const hasKeys = (clip, path) => arr(plain(clip && clip.keys)[path]).length > 0;

/**
 * clip の音量曲線（線形の増幅。トラック音量・フェード・キー・ダッキング込み）。
 * 値は eval.js の `resolvedAudioGain` から採る（= プレビューと同じ音量）。
 * @param {{clip:Object, track?:Object|null, from:number, to:number,
 *   duck?:Object|null, step?:number, tol?:number}} spec
 *   `from`/`to` は **clip ローカル秒**。返す t は `from` を 0 とした秒。
 * @returns {{t:number,v:number}[]} 2 点以上
 */
export function buildGainCurve(spec) {
  const s = plain(spec);
  const clip = plain(s.clip);
  const track = s.track ? plain(s.track) : null;
  const from = finite(s.from, 0);
  const to = Math.max(from, finite(s.to, from));
  const trackVolume = track ? clamp(finite(track.volume, 1), 0, 4) : 1;
  const duck = s.duck && arr(plain(s.duck).sources).length ? s.duck : null;
  const clipStart = Math.max(0, finite(clip.start, 0));
  const pseudo = { clip, trackVolume, muted: false };
  const at = (l) => {
    const ext = duck ? duckGainAt(duck, clipStart + l, str(clip.id)) : 1;
    return resolvedAudioGain(pseudo, { localTime: l, external: ext });
  };

  const fade = plain(clip.audioFade);
  const fi = Math.max(0, finite(fade.in, 0));
  const fo = Math.max(0, finite(fade.out, 0));
  const dur = Math.max(MIN_CLIP, Math.max(0, finite(clip.duration, 0)));
  const dks = duck ? duckBreaks(duck, clipStart, from, to) : EMPTY_ARR;

  /* 動きが無いなら 2 点で済む（BGM 以外のほとんどがここを通る） */
  if (!hasKeys(clip, "volume") && fi <= T_EPS && fo <= T_EPS && !dks.length) {
    const v = r6(at((from + to) / 2));
    return [{ t: 0, v }, { t: r6(to - from), v }];
  }

  const breaks = [];
  for (const t of keyTimes(clip, "volume")) breaks.push(t);
  if (fi > T_EPS) breaks.push(fi);
  if (fo > T_EPS) breaks.push(dur - fo);
  for (const t of dks) breaks.push(t);
  const step = Math.max(1e-3, finite(s.step, GAIN_STEP));
  const n = Math.min(200000, Math.ceil((to - from) / step));
  for (let i = 1; i < n; i++) breaks.push(from + i * step);

  const times = tidyTimes(breaks, from, to);
  const pts = times.map((t) => ({ t: r6(t - from), v: r6(at(t)) }));
  return collapseCurve(pts, finite(s.tol, GAIN_TOL));
}

/**
 * clip のパン曲線（-1..1。track.pan 込み）。キーが無ければ null。
 * @param {{clip:Object, track?:Object|null, from:number, to:number,
 *   step?:number, tol?:number}} spec
 * @returns {{t:number,v:number}[]|null}
 */
export function buildPanCurve(spec) {
  const s = plain(spec);
  const clip = plain(s.clip);
  if (!hasKeys(clip, "pan")) return null;
  const track = s.track ? plain(s.track) : null;
  const tp = track ? clamp(finite(track.pan, 0), -1, 1) : 0;
  const from = finite(s.from, 0);
  const to = Math.max(from, finite(s.to, from));
  const at = (l) => clamp(clamp(finite(sampleKey(clip.keys, "pan", l, finite(clip.pan, 0)), 0), -1, 1) + tp, -1, 1);
  const breaks = keyTimes(clip, "pan");
  const step = Math.max(1e-3, finite(s.step, GAIN_STEP));
  const n = Math.min(200000, Math.ceil((to - from) / step));
  for (let i = 1; i < n; i++) breaks.push(from + i * step);
  const pts = tidyTimes(breaks, from, to).map((t) => ({ t: r6(t - from), v: r6(at(t)) }));
  return collapseCurve(pts, 1e-3);
}

/* ══ §F 音の予定表（planAudioEvents / planAudioMix）═══════════════ */

/**
 * 書き出す範囲を決める（`range` → `start`+`duration` → project 全体）。
 * @param {Object} project
 * @param {{range?:{start?:number,end?:number}|null, start?:number, duration?:number}} [opts]
 * @returns {{start:number, end:number, duration:number}}
 */
export function resolveMixRange(project, opts) {
  const o = plain(opts);
  const total = Math.max(0, finite(projectDuration(project), 0));
  const r = plain(o.range);
  let start = 0;
  let end = total;
  const hasR = Number.isFinite(Number(r.start)) || Number.isFinite(Number(r.end));
  if (hasR) {
    start = finite(r.start, 0);
    end = Number.isFinite(Number(r.end)) ? finite(r.end, total) : total;
  } else if (finite(o.duration, 0) > 0) {
    start = finite(o.start, 0);
    end = start + finite(o.duration, 0);
  }
  if (start > end) { const t = start; start = end; end = t; }
  start = Math.max(0, start);
  end = Math.max(start, end);
  return { start: r6(start), end: r6(end), duration: r6(end - start) };
}

/** 素材側の窓（in/out。asset.duration で頭打ち。eval.resolveClip と同じ規則） */
function srcWindow(clip, asset) {
  const i0 = Math.max(0, finite(clip.in, 0));
  let o0 = Math.max(i0, finite(clip.out, i0));
  const lim = asset ? finite(asset.duration, 0) : 0;
  if (lim > 0) o0 = Math.min(o0, lim);
  return { i0, o0, lim };
}

/** 速度ランプの折れ点で [l0,l1] を割る（定数速度なら 1 区間） */
function rateSpans(clip, l0, l1, rampStep) {
  const segs = arr(buildSpeedMap(clip).cache.segs);
  const cuts = [l0, l1];
  for (const g of segs) {
    if (g.t0 > l0 + T_EPS && g.t0 < l1 - T_EPS) cuts.push(g.t0);
  }
  const pts = tidyTimes(cuts, l0, l1);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b - a <= T_EPS) continue;
    /* 区間の中で倍率が変わる（ランプ）なら細かく割る。定数なら 1 本 */
    const g = segAt(segs, a);
    const ramped = g && Number.isFinite(g.t1) && Math.abs(g.v1 - g.v0) > 1e-9;
    const step = Math.max(0.05, finite(rampStep, RAMP_STEP));
    const k = ramped ? Math.max(1, Math.ceil((b - a) / step - T_EPS)) : 1;
    for (let j = 0; j < k; j++) {
      out.push([a + ((b - a) * j) / k, a + ((b - a) * (j + 1)) / k]);
    }
  }
  return out;
}
function segAt(segs, t) {
  let hit = segs[0] || null;
  for (const g of segs) if (g.t0 <= t + T_EPS) hit = g; else break;
  return hit;
}

/**
 * clip 1 つぶんの event（純関数）。範囲の外は切り落とす。
 * @param {Object} clip
 * @param {{track?:Object|null, trackIndex?:number, asset?:Object|null,
 *   range:{start:number,end:number}, fps?:number, duck?:Object|null,
 *   rampStep?:number, warnings?:string[], depth?:number}} spec
 * @returns {Object[]} event[]
 */
export function planClipEvents(clip, spec) {
  const s = plain(spec);
  const c = plain(clip);
  const warnings = arr(s.warnings) === EMPTY_ARR ? [] : s.warnings;
  const range = plain(s.range);
  const rs = finite(range.start, 0);
  const re = Math.max(rs, finite(range.end, rs));
  const track = s.track ? plain(s.track) : null;
  const asset = s.asset || null;
  const kind = str(c.kind) || "video";

  const cs = Math.max(0, finite(c.start, 0));
  const cd = Math.max(0, finite(c.duration, 0));
  if (cd <= T_EPS) return [];
  const ts = Math.max(cs, rs);
  const te = Math.min(cs + cd, re);
  if (te - ts <= T_EPS) return [];

  if (kind === "compound") return compoundEvents(c, s, ts, te);
  if (!c.assetId) {
    warnings.push(`「${str(c.name) || str(c.id)}」に素材が無いので音は入りません`);
    return [];
  }
  const { i0, o0 } = srcWindow(c, asset);
  if (o0 - i0 <= T_EPS) {
    warnings.push(`「${str(c.name) || str(c.id)}」の素材の範囲が空です（in と out が同じ）`);
    return [];
  }
  const assetDuration = asset && finite(asset.duration, 0) > 0 ? finite(asset.duration, 0) : o0;
  const map = buildSpeedMap(c);
  const pitch = !!markerFx(c, PITCH_FX_TYPE);
  const fx = soundFxOf(c);
  const out = [];
  /* 素材を使い切る時刻。eval は「端に張り付く」（絵はそれで良い）が、
     音で張り付くと直流が残るだけなので **そこで切る**。ここで切らないと
     使い切った先の区間の rate が「残りの素材秒 / 出力秒」になって嘘になる。 */
  const lmax = map.inverse(o0 - i0);
  const tend = Math.min(te, cs + lmax);
  if (tend - ts <= T_EPS) return [];
  const spans = rateSpans(c, ts - cs, tend - cs, s.rampStep);
  for (let i = 0; i < spans.length; i++) {
    const [a, b] = spans[i];
    const dur = b - a;
    if (dur <= T_EPS) continue;
    const usedA = map.at(a);
    const usedB = map.at(b);
    let sourceIn, sourceOut;
    if (c.reverse) {
      sourceOut = clamp(o0 - usedA, i0, o0);
      sourceIn = clamp(o0 - usedB, i0, o0);
    } else {
      sourceIn = clamp(i0 + usedA, i0, o0);
      sourceOut = clamp(i0 + usedB, i0, o0);
    }
    const sourceDuration = Math.max(0, sourceOut - sourceIn);
    if (sourceDuration <= T_EPS) continue;             // 素材の端に張り付いた（無音）
    const rateCurve = rampCurveFor(map, a, b);
    out.push({
      clipId: str(c.id), assetId: str(c.assetId),
      trackId: track ? str(track.id) : "",
      trackIndex: Number.isFinite(s.trackIndex) ? s.trackIndex : -1,
      kind,
      when: r6(cs + a - rs),
      duration: r6(dur),
      timelineStart: r6(cs + a),
      offset: r6(c.reverse ? Math.max(0, assetDuration - sourceOut) : sourceIn),
      sourceIn: r6(sourceIn), sourceOut: r6(sourceOut),
      sourceDuration: r6(sourceDuration),
      assetDuration: r6(assetDuration),
      rate: r6(sourceDuration / dur),
      rateCurve,
      reverse: !!c.reverse,
      pitchPreserve: pitch,
      gainCurve: buildGainCurve({ clip: c, track, from: a, to: b, duck: s.duck }),
      pan: r6(clamp(clamp(finite(sampleKey(c.keys, "pan", a, finite(c.pan, 0)), 0), -1, 1)
        + (track ? clamp(finite(track.pan, 0), -1, 1) : 0), -1, 1)),
      panCurve: buildPanCurve({ clip: c, track, from: a, to: b }),
      fx,
      segIndex: out.length, segCount: 0
    });
  }
  for (const e of out) e.segCount = out.length;
  return out;
}

/** 速度ランプの automation 用の曲線（定数なら null。t は event ローカル秒） */
function rampCurveFor(map, a, b) {
  const segs = arr(map.cache.segs);
  const g = segAt(segs, a);
  if (!g || !Number.isFinite(g.t1) || Math.abs(g.v1 - g.v0) <= 1e-9) return null;
  return [
    { t: 0, v: r6(map.rateAt(a)) },
    { t: r6(b - a), v: r6(map.rateAt(b)) }
  ];
}

/**
 * 入れ子（compound）の中の音。定数速度・順再生のときだけ中を辿る。
 * 速度ランプや逆再生の入れ子は 時刻の写しが二重になって危ういので
 * 警告して音を入れない（黙って落とさない）。
 */
function compoundEvents(clip, spec, ts, te) {
  const warnings = spec.warnings || [];
  const inner = arr(plain(clip.compound).tracks);
  if (!inner.length) return [];
  const depth = Number.isFinite(spec.depth) ? spec.depth : 0;
  if (depth >= 2) return [];
  const segs = arr(buildSpeedMap(clip).cache.segs);
  const constant = segs.length === 1 && Math.abs(segs[0].v1 - segs[0].v0) <= 1e-9;
  if (!constant || clip.reverse) {
    warnings.push(`入れ子「${str(clip.name) || str(clip.id)}」は速度ランプ／逆再生なので中の音は入りません`);
    return [];
  }
  const rate = segs[0].v0;
  const { i0, o0 } = srcWindow(clip, null);
  const cs = Math.max(0, finite(clip.start, 0));
  const rs = finite(plain(spec.range).start, 0);
  /* 外側のタイムライン秒 → 内側の秒 */
  const toInner = (t) => i0 + (t - cs) * rate;
  const ia = clamp(toInner(ts), i0, o0);
  const ib = clamp(toInner(te), i0, o0);
  if (ib - ia <= T_EPS) return [];
  const outerGain = buildGainCurve({
    clip, track: spec.track || null, from: ts - cs, to: te - cs, duck: spec.duck
  });
  const outerPan = spec.track ? clamp(finite(plain(spec.track).pan, 0), -1, 1) : 0;
  const amap = assetMapOf({ assets: arr(plain(spec.project).assets) });
  const out = [];
  for (let ti = 0; ti < inner.length; ti++) {
    const tr = inner[ti];
    if (!isSoundTrack(tr) || tr.muted) continue;
    for (const ic of arr(tr.clips)) {
      if (!ic || ic.muteAudio) continue;
      const asset = ic.assetId ? amap.get(str(ic.assetId)) || null : null;
      if (!clipHasAudio(ic, asset)) continue;
      const kids = planClipEvents(ic, {
        track: tr, trackIndex: ti, asset, range: { start: ia, end: ib },
        fps: spec.fps, duck: null, rampStep: spec.rampStep,
        warnings, depth: depth + 1, project: spec.project
      });
      for (const e of kids) {
        /* 内側の秒 → 外側へ伸ばす（1/rate 倍）。頭は ia に合わせてある */
        const innerAt = ia + e.when;
        const when = cs + (innerAt - i0) / rate - rs;
        const dur = e.duration / rate;
        e.when = r6(when);
        e.duration = r6(dur);
        e.timelineStart = r6(when + rs);
        e.rate = r6(e.rate * rate);
        if (e.rateCurve) e.rateCurve = e.rateCurve.map((p) => ({ t: r6(p.t / rate), v: r6(p.v * rate) }));
        e.trackId = spec.track ? str(plain(spec.track).id) : e.trackId;
        /* outerGain の t は「外側の ts を 0」とした秒。この event の頭は
           外側の (when + rs) なので、その差だけ ずらして掛ける。 */
        const shift = when + rs - ts;
        e.gainCurve = mulCurves(
          e.gainCurve.map((p) => ({ t: r6(p.t / rate), v: p.v })),
          outerGain.map((p) => ({ t: r6(p.t - shift), v: p.v }))
        );
        if (e.panCurve) e.panCurve = e.panCurve.map((p) => ({ t: r6(p.t / rate), v: clamp(p.v + outerPan, -1, 1) }));
        e.pan = r6(clamp(e.pan + outerPan, -1, 1));
        e.compoundId = str(clip.id);
        out.push(e);
      }
    }
  }
  return out;
}

/**
 * 音の予定表（範囲・警告つき）。renderMixdown と graph.js が使う。
 * 拾う／落とす規則は eval.js の `audioAt` と同じ（adjust トラックは鳴らない・
 * track.muted と clip.muteAudio は落とす・solo が立っていたら solo だけ・
 * hidden は落とさない）。
 *
 * CONTRACT-NOTE: 担当指示の `fps` は受けるが **時刻の丸めには使わない**。
 *   eval.resolveClip は「t を含むフレームの頭」へ寄せる（絵はそれで正しい）が、
 *   音を 1 フレーム（30fps で 33ms）に丸めると口の動きと合わなくなる。
 *   clip.start / duration は ops が既にフレームへ吸着させているので、
 *   丸めずに使えば「フレーム境界ちょうど」かつ標本単位で正しい。
 *   `fps` は返り値に載せて（呼ぶ側の目安）、音量の標本化には使わない。
 * @param {Object} project
 * @param {{range?:Object|null, start?:number, duration?:number, fps?:number,
 *   audioTracks?:string[]|null, excludeAudioTracks?:string[]|null,
 *   rampStep?:number}} [opts]
 * @returns {{events:Object[], warnings:string[], holes:string[],
 *   range:{start:number,end:number,duration:number}, fps:number, duck:Object}}
 */
export function planAudioMix(project, opts) {
  const o = plain(opts);
  const p = plain(project);
  const fps = fpsOf(o.fps !== undefined ? o.fps : plain(p.settings).fps);
  const range = resolveMixRange(p, o);
  const warnings = [];
  const holes = [];
  const events = [];
  const duck = planDucking(p, o);
  const only = idSet(o.audioTracks);
  const skip = idSet(o.excludeAudioTracks);
  const amap = assetMapOf(p);
  const solo = anySolo(p.tracks);
  const tracks = arr(p.tracks);
  let pitch = 0;

  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (!isSoundTrack(track) || track.muted) continue;
    if (solo && !track.solo) continue;
    if (only && !only.has(str(track.id))) continue;
    if (skip && skip.has(str(track.id))) continue;
    for (const clip of arr(track.clips)) {
      if (!clip || clip.muteAudio) continue;
      const asset = clip.assetId ? amap.get(str(clip.assetId)) || null : null;
      if (!clipHasAudio(clip, asset)) continue;
      if (clip.assetId && !asset && str(clip.kind) !== "compound") {
        warnings.push(`素材が見つかりません（${str(clip.assetId)}）`);
        continue;
      }
      const got = planClipEvents(clip, {
        track, trackIndex: ti, asset, range, fps, duck: duck.has ? duck : null,
        rampStep: o.rampStep, warnings, project: p, depth: 0
      });
      for (const e of got) { if (e.pitchPreserve) pitch++; events.push(e); }
    }
  }
  events.sort((a, b) => a.when - b.when || a.trackIndex - b.trackIndex
    || (a.clipId < b.clipId ? -1 : a.clipId > b.clipId ? 1 : a.segIndex - b.segIndex));
  if (pitch) {
    holes.push(`${pitch} 個のクリップが「音の高さを保つ」指定ですが、未実装なので速度どおりの高さになります`);
  }
  return { events, warnings, holes, range, fps, duck };
}

/**
 * 契約書 §4 / 担当指示の口。`planAudioMix(...).events` と同じ。
 * @param {Object} project
 * @param {{range?:Object|null, fps?:number, start?:number, duration?:number,
 *   audioTracks?:string[]|null, excludeAudioTracks?:string[]|null,
 *   rampStep?:number}} [opts]
 * @returns {Object[]} `[{clipId, assetId, when, offset, duration, rate, reverse,
 *   gainCurve, pan, trackId, …}]`
 */
export function planAudioEvents(project, opts) {
  return planAudioMix(project, opts).events;
}

/** event が使う assetId の一覧（重複なし。decode の支度に使う） */
export function collectAssetIds(events) {
  const out = [];
  const seen = new Set();
  for (const e of arr(events)) {
    const id = str(e && e.assetId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * `start(when, offset)` に渡す offset を 実際の buffer の長さで寄せ直す。
 * 逆再生は「素材を逆にした buffer」を前提にした座標なので、decode の結果が
 * asset.duration と少し違うとずれる。
 * @param {Object} event @param {{duration?:number}|null} buffer
 * @returns {number}
 */
export function startOffsetFor(event, buffer) {
  const e = plain(event);
  const off = Math.max(0, finite(e.offset, 0));
  const len = buffer ? finite(buffer.duration, 0) : 0;
  if (!e.reverse || !(len > 0)) return off;
  const drift = len - finite(e.assetDuration, len);
  return Math.max(0, off + drift);
}

/* ══ §G WAV と limiter（純関数）═════════════════════════════════ */

/** ASCII を 4 文字ずつ書く（DataView に直接） */
function ascii(view, at, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i) & 0x7f);
}

/**
 * PCM の WAV のバイト列を自前で書く（純関数・試験する）。
 * ・16bit（既定）… 負は ×0x8000、正は ×0x7fff（-1..1 を目一杯使う作法。
 *   export/exporter.js の encodeWav と同じ丸め）。
 * ・8bit … 符号なし（0..255, 中央 128）。24bit … 3 バイト小端。
 * ・32bit … IEEE float（fmt の形式が 3 になる）。
 * ・長さの違うチャンネルは **長い方に合わせて 0 で埋める**（音を切らない）。
 * @param {ArrayLike<number>[]} channels チャンネルごとの標本（-1..1）
 * @param {number} sampleRate
 * @param {number} [bitDepth] 8 | 16 | 24 | 32
 * @returns {ArrayBuffer}
 */
export function wavBytes(channels, sampleRate, bitDepth) {
  const chans = arr(channels).filter((c) => c && typeof c.length === "number");
  if (!chans.length) throw new Error("wavBytes: チャンネルが 1 つも在りません");
  const bits = [8, 16, 24, 32].indexOf(Math.round(finite(bitDepth, 16))) >= 0
    ? Math.round(finite(bitDepth, 16)) : 16;
  const sr = Math.max(1, Math.round(finite(sampleRate, DEFAULT_SAMPLE_RATE)));
  const ch = chans.length;
  let n = 0;
  for (const c of chans) n = Math.max(n, c.length >>> 0);
  const bytesPer = bits >> 3;
  const dataBytes = n * ch * bytesPer;
  const total = WAV_HEADER_SIZE + dataBytes;
  if (total > 0xffffffff) {
    throw new Error("wavBytes: 音が長すぎて 1 つの wav に入りません（範囲を分けてください）");
  }
  let ab;
  try { ab = new ArrayBuffer(total); }
  catch (_e) { throw new Error(`wavBytes: ${total} バイトを確保できませんでした（範囲を分けてください）`); }
  const v = new DataView(ab);
  const float = bits === 32;
  ascii(v, 0, "RIFF");
  v.setUint32(4, total - 8, true);
  ascii(v, 8, "WAVE");
  ascii(v, 12, "fmt ");
  v.setUint32(16, 16, true);                    // fmt の中身の長さ
  v.setUint16(20, float ? 3 : 1, true);         // 1 = PCM / 3 = IEEE float
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * bytesPer, true);    // byte rate
  v.setUint16(32, ch * bytesPer, true);         // block align
  v.setUint16(34, bits, true);
  ascii(v, 36, "data");
  v.setUint32(40, dataBytes, true);

  let p = WAV_HEADER_SIZE;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const src = chans[c];
      const x = clamp(finite(i < src.length ? src[i] : 0, 0), -1, 1);
      if (float) { v.setFloat32(p, x, true); }
      else if (bits === 16) { v.setInt16(p, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true); }
      else if (bits === 8) { v.setUint8(p, clamp(Math.round(x * 127) + 128, 0, 255)); }
      else {
        const q = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff);
        v.setUint8(p, q & 0xff);
        v.setUint8(p + 1, (q >> 8) & 0xff);
        v.setUint8(p + 2, (q >> 16) & 0xff);
      }
      p += bytesPer;
    }
  }
  return ab;
}

/**
 * AudioBuffer → .wav の Blob（契約書 §11.3）。
 * @param {{sampleRate:number,numberOfChannels:number,length:number,
 *   getChannelData:(c:number)=>Float32Array}} audioBuffer
 * @param {{bitDepth?:number, startSample?:number, endSample?:number}} [opts]
 * @returns {Blob}
 */
export function audioBufferToWav(audioBuffer, opts) {
  const b = audioBuffer;
  if (!b || typeof b.getChannelData !== "function") {
    throw new Error("audioBufferToWav: AudioBuffer が在りません");
  }
  const o = plain(opts);
  const len = Math.max(0, Math.round(finite(b.length, 0)));
  const s0 = clamp(Math.round(finite(o.startSample, 0)), 0, len);
  const s1 = clamp(Math.round(finite(o.endSample, len)), s0, len);
  const ch = Math.max(1, Math.round(finite(b.numberOfChannels, 1)));
  const chans = [];
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    chans.push(s0 === 0 && s1 === len ? d : d.subarray(s0, s1));
  }
  const ab = wavBytes(chans, finite(b.sampleRate, DEFAULT_SAMPLE_RATE), finite(o.bitDepth, 16));
  const B = globalThis.Blob;
  if (typeof B !== "function") throw new Error("audioBufferToWav: Blob が在りません");
  return new B([ab], { type: "audio/wav" });
}

/**
 * master limiter の形（WaveShaper の curve）。純関数・試験できる。
 * 入力 u（-1..1）は `drive` 倍した物として読み、`ceiling` を超えないよう
 * tanh で寝かせる（`ceiling*knee` までは素通り＝音を変えない）。
 * 使う側は `gain(1/drive) → shaper → gain(drive)` で挟む。
 * @param {number} [ceiling] 線形の上限（既定 0.989 ≒ -0.1dBFS）
 * @param {{size?:number, drive?:number, knee?:number}} [opts]
 * @returns {Float32Array}
 */
export function limiterCurve(ceiling, opts) {
  const o = plain(opts);
  const c = clamp(finite(ceiling, LIMITER_CEILING), 0.05, 1);
  const size = Math.max(3, Math.round(finite(o.size, LIMITER_CURVE_SIZE)) | 1);
  const drive = Math.max(1, finite(o.drive, LIMITER_DRIVE));
  const knee = clamp(finite(o.knee, LIMITER_KNEE), 0.1, 1);
  const th = c * knee;
  const room = Math.max(1e-6, c - th);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u = (i / (size - 1)) * 2 - 1;
    const x = u * drive;
    const a = Math.abs(x);
    const y = a <= th ? a : th + room * Math.tanh((a - th) / room);
    out[i] = (x < 0 ? -y : y) / drive;
  }
  return out;
}

/**
 * チャンネルの中身を逆順にした新しい配列（逆再生用）。
 * @param {ArrayLike<number>[]} channels @returns {Float32Array[]}
 */
export function reverseChannels(channels) {
  const out = [];
  for (const c of arr(channels)) {
    const n = c && typeof c.length === "number" ? c.length >>> 0 : 0;
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = finite(c[n - 1 - i], 0);
    out.push(d);
  }
  return out;
}

/* ══ §H OfflineAudioContext で作る（ここだけ Web Audio を触る）═══ */

/** OfflineAudioContext を作る（webkit 付きの古い名前も見る） */
function makeOffline(channels, frames, sampleRate) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof C !== "function") {
    throw new Error("この環境には OfflineAudioContext が在りません（音は書き出せません）");
  }
  return new C(Math.max(1, channels), Math.max(1, frames), sampleRate);
}

/** decodeAudioData（Promise と callback の両方の実装に合わせる） */
function decodeAsync(ctx, ab) {
  return new Promise((res, rej) => {
    let p;
    try { p = ctx.decodeAudioData(ab, res, rej); }
    catch (e) { rej(e); return; }
    if (p && typeof p.then === "function") p.then(res, rej);
  });
}

/** 中止されたら すぐ諦めるための Promise（rendering は待たない） */
function abortRace(signal, promise) {
  if (!signal) return promise;
  return new Promise((res, rej) => {
    if (signal.aborted) { rej(abortError()); return; }
    const off = () => { try { signal.removeEventListener("abort", onAbort); } catch (_e) { /* 古い実装 */ } };
    const onAbort = () => { off(); rej(abortError()); };
    try { signal.addEventListener("abort", onAbort, { once: true }); } catch (_e) { /* 古い実装 */ }
    promise.then((v) => { off(); res(v); }, (e) => { off(); rej(e); });
  });
}

/** 進捗を 200ms ごとに出す係（同じ値は出さない・後戻りしない） */
function makeTicker(onProgress, ms) {
  const cb = typeof onProgress === "function" ? onProgress : null;
  let last = -1;
  let timer = null;
  const send = (p) => {
    if (!cb) return;
    const v = clamp01(p);
    if (v <= last + 1e-4) return;              // 後戻りも同じ値の連打もしない
    last = v;
    try { cb(v); } catch (e) { warn("mix", "onProgress が投げました", e); }
  };
  return {
    set: send,
    /** 区間の中は「経過時間からの見込み」で少しずつ進める（止まって見えない） */
    watch(from, to, estimateMs) {
      if (!cb) return;
      const t0 = Date.now();
      this.stop();
      timer = setInterval(() => {
        const u = clamp01((Date.now() - t0) / Math.max(1, estimateMs));
        send(from + (to - from) * (u * 0.95));
      }, Math.max(50, finite(ms, PROGRESS_MS)));
      if (timer && typeof timer.unref === "function") timer.unref();
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } }
  };
}

/** engine/audio/fx.js（在れば）で効果の鎖を作る。無ければ素通り */
async function loadFxKit() {
  let mod = null;
  try { mod = await import("./fx.js"); }
  catch (_e) { return null; }
  if (!mod) return null;
  const names = ["createAudioFxChain", "createFxChain", "buildAudioFxChain", "buildFxChain", "connectAudioFx"];
  for (const n of names) if (typeof mod[n] === "function") return mod[n];
  const d = mod.default;
  if (typeof d === "function") return d;
  if (d && typeof d === "object") for (const n of names) if (typeof d[n] === "function") return d[n];
  return null;
}

/** 効果の鎖を 1 本作る（作れなければ null = 素通り） */
function fxChain(kit, ctx, list, extra) {
  if (!kit || !arr(list).length) return null;
  try {
    const c = kit(ctx, list, extra || {});
    if (c && c.input && c.output) return c;
    if (c && typeof c.connect === "function") return { input: c, output: c };
  } catch (e) { warn("mix", "音の効果を組めませんでした（素通りにします）", e); }
  return null;
}

/**
 * パン（StereoPanner → Panner → 素通り の順に落ちる）。
 * 曲線は **呼ぶ側**が `applyParam(node.pan, …, when)` で当てる
 * （ここで当てると when を足した分と二重に automation が入る）。
 */
function makePanner(ctx, pan, curve) {
  const flat = !arr(curve).length && Math.abs(pan) < 1e-3;
  if (flat) return null;
  if (typeof ctx.createStereoPanner === "function") {
    const n = ctx.createStereoPanner();
    try { n.pan.value = clamp(finite(pan, 0), -1, 1); } catch (_e) { /* 古い実装 */ }
    return n;
  }
  if (typeof ctx.createPanner === "function") {
    const n = ctx.createPanner();
    try {
      n.panningModel = "equalpower";
      const x = clamp(pan, -1, 1);
      if (typeof n.positionX === "object") { n.positionX.value = x; n.positionZ.value = 1 - Math.abs(x); }
      else if (typeof n.setPosition === "function") n.setPosition(x, 0, 1 - Math.abs(x));
    } catch (e) { warn("mix", "パンを当てられませんでした", e); }
    return n;
  }
  return null;
}

/** AudioParam に定数か曲線を当てる（when を足した絶対時刻で書く） */
function applyParam(param, value, curve, lo, hi, when) {
  if (!param) return;
  const at = finite(when, 0);
  const c = arr(curve);
  if (!c.length) {
    try { param.setValueAtTime(clamp(finite(value, 0), lo, hi), Math.max(0, at)); }
    catch (_e) { param.value = clamp(finite(value, 0), lo, hi); }
    return;
  }
  try {
    param.setValueAtTime(clamp(finite(c[0].v, 0), lo, hi), Math.max(0, at + finite(c[0].t, 0)));
    for (let i = 1; i < c.length; i++) {
      param.linearRampToValueAtTime(clamp(finite(c[i].v, 0), lo, hi), Math.max(0, at + finite(c[i].t, 0)));
    }
  } catch (e) {
    warn("mix", "曲線を当てられませんでした（定数にします）", e);
    try { param.value = clamp(finite(c[0].v, 0), lo, hi); } catch (_e2) { /* 諦める */ }
  }
}

/** 素材を decode して Map に集める（順再生ぶん。逆再生は使う時に作る） */
async function decodeAssets(project, ids, spec) {
  const out = new Map(spec.buffers instanceof Map ? spec.buffers : []);
  if (spec.buffers && !(spec.buffers instanceof Map)) {
    for (const k of Object.keys(plain(spec.buffers))) out.set(k, plain(spec.buffers)[k]);
  }
  const amap = assetMapOf(project);
  const storage = spec.storage || null;
  for (const id of ids) {
    throwIfAborted(spec.signal);
    if (out.has(id)) continue;
    const asset = amap.get(id);
    if (!asset) { spec.warnings.push(`素材が見つかりません（${id}）`); continue; }
    const key = str(plain(asset.storage).key);
    try {
      let ab = null;
      if (storage && typeof storage.getAssetBlob === "function" && key) {
        const blob = await storage.getAssetBlob(key);
        if (blob && typeof blob.arrayBuffer === "function") ab = await blob.arrayBuffer();
      }
      if (!ab && storage && typeof storage.getAssetURL === "function" && key) {
        const url = storage.getAssetURL(key);
        if (url) {
          const res = await fetch(url);
          ab = await res.arrayBuffer();
          if (typeof storage.releaseAssetURL === "function") storage.releaseAssetURL(key);
        }
      }
      if (!ab) { spec.warnings.push(`「${str(asset.name) || id}」の中身を読めませんでした（無音で続けます）`); continue; }
      out.set(id, await decodeAsync(spec.decodeCtx, ab));
    } catch (e) {
      spec.warnings.push(`「${str(asset.name) || id}」の音を読めませんでした（無音で続けます）: ${e && e.message ? e.message : e}`);
    }
  }
  return out;
}

/** 逆再生用の buffer（1 度作って使い回す） */
function reversedOf(ctx, buffer, cache) {
  const hit = cache.get(buffer);
  if (hit) return hit;
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const rev = reverseChannels(chans);
  const b = ctx.createBuffer(Math.max(1, rev.length), Math.max(1, buffer.length), buffer.sampleRate);
  for (let c = 0; c < rev.length; c++) {
    if (typeof b.copyToChannel === "function") b.copyToChannel(rev[c], c);
    else b.getChannelData(c).set(rev[c]);
  }
  cache.set(buffer, b);
  return b;
}

/**
 * 1 区間ぶんの音を OfflineAudioContext で作る。
 * `events` は その区間の頭を 0 とした `when` を持っていること。
 */
async function renderWindow(spec) {
  const { events, frames, sampleRate, channels, project, buffers, revCache, fxKit, signal } = spec;
  const ctx = makeOffline(channels, frames, sampleRate);
  const settings = plain(plain(project).settings);
  const au = plain(settings.audio);

  /* 出口: master gain → limiter（要るとき）→ destination */
  const master = ctx.createGain();
  master.gain.value = clamp(finite(au.master, 1), 0, 4);
  let tail = master;
  const wantLimiter = spec.limiter !== false && au.limiter !== false;
  if (wantLimiter && typeof ctx.createWaveShaper === "function") {
    const pre = ctx.createGain();
    pre.gain.value = 1 / LIMITER_DRIVE;
    const shaper = ctx.createWaveShaper();
    shaper.curve = limiterCurve(spec.limiterCeiling, {});
    if ("oversample" in shaper) { try { shaper.oversample = "2x"; } catch (_e) { /* 古い実装 */ } }
    const post = ctx.createGain();
    post.gain.value = LIMITER_DRIVE;
    master.connect(pre); pre.connect(shaper); shaper.connect(post);
    tail = post;
  }
  tail.connect(ctx.destination);

  /* トラックごとの効果の鎖（音量とパンは event 側に入っているので触らない） */
  const trackNode = new Map();
  const nodeFor = (trackId) => {
    if (trackNode.has(trackId)) return trackNode.get(trackId);
    const track = arr(plain(project).tracks).find((t) => t && str(t.id) === trackId) || null;
    const g = ctx.createGain();
    const chain = fxChain(fxKit, ctx, soundFxOf(track), { kind: "track", track, sampleRate });
    if (chain) { g.connect(chain.input); chain.output.connect(master); }
    else g.connect(master);
    trackNode.set(trackId, g);
    return g;
  };

  let live = 0;
  for (const e of events) {
    throwIfAborted(signal);
    const base = buffers.get(str(e.assetId));
    if (!base) continue;
    const buf = e.reverse ? reversedOf(ctx, base, revCache) : base;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const when = Math.max(0, finite(e.when, 0));
    const dur = Math.max(0, finite(e.duration, 0));
    if (dur <= T_EPS) continue;
    /* 速度: 平均倍率を置き、ランプは automation で追う（§A の理由） */
    if (e.rateCurve && e.rateCurve.length > 1) applyParam(src.playbackRate, e.rate, e.rateCurve, 0.02, 100, when);
    else src.playbackRate.value = clamp(finite(e.rate, 1), 0.02, 100);

    const gain = ctx.createGain();
    applyParam(gain.gain, 1, e.gainCurve, 0, 8, when);
    src.connect(gain);
    let node = gain;
    const clipChain = fxChain(fxKit, ctx, e.fx, { kind: "clip", clipId: e.clipId, sampleRate });
    if (clipChain) { node.connect(clipChain.input); node = clipChain.output; }
    const pan = makePanner(ctx, finite(e.pan, 0), e.panCurve);
    if (pan) {
      if (pan.pan && e.panCurve) applyParam(pan.pan, e.pan, e.panCurve, -1, 1, when);
      node.connect(pan); node = pan;
    }
    node.connect(nodeFor(str(e.trackId)));
    /* duration は渡さない（実装ごとに buffer 秒／出力秒の解釈が違う）。
       出力側の秒で止める。§A の理由。 */
    src.start(when, startOffsetFor(e, buf));
    src.stop(when + dur);
    live++;
  }
  if (!live) return { buffer: null, ctx };
  const rendered = await abortRace(signal, ctx.startRendering());
  return { buffer: rendered, ctx };
}

/** 区間の音を出力へ書き込む（頭の `fadeIn` ぶんは前の音と線形で混ぜる） */
function writeInto(out, rendered, atSample, fadeSamples) {
  const ch = out.numberOfChannels;
  const n = rendered ? rendered.length : 0;
  for (let c = 0; c < ch; c++) {
    const dst = out.getChannelData(c);
    const src = rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1));
    const room = Math.min(n, dst.length - atSample);
    for (let i = 0; i < room; i++) {
      const s = finite(src[i], 0);
      if (i < fadeSamples) {
        const u = (i + 1) / (fadeSamples + 1);
        dst[atSample + i] = dst[atSample + i] * (1 - u) + s * u;
      } else dst[atSample + i] = s;
    }
  }
}

/**
 * 書き出し用の音を作る（契約書 §4）。
 * 実時間の再生（engine/audio/graph.js）と **同じ計画**（planAudioEvents）と
 * **同じ音量の式**（eval.resolvedAudioGain）を使うので、結果が一致する。
 *
 * @param {Object} project
 * @param {{sampleRate?:number, range?:{start:number,end:number}|null,
 *   start?:number, duration?:number, channels?:number, fps?:number,
 *   onProgress?:(p:number)=>void, signal?:AbortSignal|null, storage?:Object|null,
 *   buffers?:Map|Object|null, audioTracks?:string[]|null,
 *   excludeAudioTracks?:string[]|null, chunk?:number, xfade?:number,
 *   splitAbove?:number, limiter?:boolean, limiterCeiling?:number,
 *   warningsOut?:string[]|null}} [opts]
 * @returns {Promise<AudioBuffer>} 範囲ぶんの長さ（無音でも長さは在る）
 */
export async function renderMixdown(project, opts) {
  const o = plain(opts);
  const signal = o.signal || null;
  throwIfAborted(signal);
  const sampleRate = Math.max(8000, Math.round(finite(o.sampleRate,
    finite(plain(plain(project).settings).sampleRate, DEFAULT_SAMPLE_RATE))));
  const channels = clamp(Math.round(finite(o.channels, 2)), 1, 2);
  const plan = planAudioMix(project, o);
  const range = plan.range;
  const warnings = arr(o.warningsOut) === EMPTY_ARR ? [] : o.warningsOut;
  for (const w of plan.warnings) warnings.push(w);
  for (const h of plan.holes) warnings.push(h);

  const totalFrames = Math.max(1, Math.round(range.duration * sampleRate));
  const bytes = totalFrames * channels * 4;
  if (bytes > 1.5 * 1024 * 1024 * 1024) {
    throw new Error(`音が長すぎて 1 度に作れません（約 ${Math.round(bytes / 1048576)}MB）。範囲を分けて書き出してください`);
  }

  const ticker = makeTicker(o.onProgress, PROGRESS_MS);
  ticker.set(0);
  const decodeCtx = makeOffline(1, 1, sampleRate);
  const fxKit = await loadFxKit();
  const revCache = new WeakMap();
  try {
    const buffers = await decodeAssets(project, collectAssetIds(plan.events), {
      storage: o.storage || null, buffers: o.buffers || null, decodeCtx,
      warnings, signal
    });
    throwIfAborted(signal);
    ticker.set(0.1);

    const chunks = planChunks(range.duration, {
      chunk: o.chunk, xfade: o.xfade, min: o.splitAbove
    });
    /* 1 区間で済むなら そのまま返す（余分な複製をしない） */
    if (chunks.length <= 1) {
      /* 1 回で作る間も 200ms ごとに進捗を出す（実時間の 20 倍を見込み値に） */
      ticker.watch(0.1, 1, Math.max(200, range.duration * 50));
      let got;
      try {
        got = await renderWindow({
          events: plan.events, frames: totalFrames, sampleRate, channels,
          project, buffers, revCache, fxKit, signal,
          limiter: o.limiter, limiterCeiling: o.limiterCeiling
        });
      } finally { ticker.stop(); }
      ticker.set(1);
      return got.buffer || decodeCtx.createBuffer(channels, totalFrames, sampleRate);
    }

    const out = decodeCtx.createBuffer(channels, totalFrames, sampleRate);
    let speed = 0;                       // 音の秒 / 実時間 ms（見込みに使う）
    for (let i = 0; i < chunks.length; i++) {
      throwIfAborted(signal);
      const k = chunks[i];
      const startSample = Math.round(k.start * sampleRate);
      const endSample = Math.min(totalFrames, Math.round(k.end * sampleRate));
      const pre = Math.round(k.pre * sampleRate);
      const at = Math.max(0, startSample - pre);
      const frames = Math.max(1, Math.min(totalFrames - at, endSample - at));
      const rs = range.start + at / sampleRate;
      const sub = planAudioMix(project, Object.assign({}, o, {
        range: { start: rs, end: rs + frames / sampleRate },
        start: undefined, duration: undefined
      }));
      const from = 0.1 + (0.9 * i) / chunks.length;
      const to = 0.1 + (0.9 * (i + 1)) / chunks.length;
      ticker.watch(from, to, speed > 0 ? (frames / sampleRate) / speed : 1500);
      const t0 = Date.now();
      let got;
      try {
        got = await renderWindow({
          events: sub.events, frames, sampleRate, channels,
          project, buffers, revCache, fxKit, signal,
          limiter: o.limiter, limiterCeiling: o.limiterCeiling
        });
      } finally { ticker.stop(); }
      const spent = Math.max(1, Date.now() - t0);
      speed = (frames / sampleRate) / spent;
      if (got.buffer) writeInto(out, got.buffer, at, i ? pre : 0);
      ticker.set(to);
    }
    ticker.set(1);
    return out;
  } finally {
    ticker.stop();
  }
}

export default {
  renderMixdown, planAudioEvents, planAudioMix, planClipEvents, planChunks,
  planDucking, duckGainAt, buildGainCurve, buildPanCurve, resolveMixRange,
  audioBufferToWav, wavBytes, limiterCurve, reverseChannels,
  curveAt, mulCurves, collapseCurve, collectAssetIds, startOffsetFor,
  markerFx, soundFxOf, clipHasAudio
};
