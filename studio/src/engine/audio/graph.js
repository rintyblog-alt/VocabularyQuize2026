/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/audio/graph.js — 音の実時間再生（契約書 §4 / §13.6）

   ★ 何をする所か
     `createAudioEngine({ storage, fps })` が AudioEngine を返す。
     タイムラインの音を **プロ機と同じ組み方**で鳴らす:

       clip 1 本 = AudioBufferSourceNode → GainNode（フェード/キー）
                   → clip の効果チェーン → StereoPannerNode
       トラック   = GainNode(入口) → トラック効果 → ダッキング用 GainNode
                   → フェーダー GainNode → StereoPannerNode → マスター
       マスター   = マスター効果 → リミッター → マスター音量 → メーター → 出口

     `engine/playback.js` が `start/stop/seek/setRate` を叩き、
     **鳴っている間は `ctx.currentTime` が主時計**（契約書 §13.6）になる。
     `mediaTime` を出しているので、playback はそれを最優先で読む。

   ★ なぜこの形か（ここは「ずれ」と「落ち」の両方が出る場所）
     ・**AudioContext は 1 つ**（契約書 §13.6）。作るのは 1 回だけで、
       最初のユーザー操作で `unlock()` → `resume()`。iOS は操作の中でしか
       鳴り始めないので、`unlock()` は **await を挟む前に**呼ぶ事。
     ・**予約はスケジューラ方式**。「今から 2 秒先まで」を 0.5 秒ごとに補充する。
       毎フレーム作ると (a) rAF が止まる裏タブで音が切れ、(b) GC が走って
       プツプツ鳴る。逆に全部を先に予約すると 1 時間の素材で数千 node になる。
       2 秒の先読みは **裏タブの setInterval が 1 秒に間引かれても間に合う**
       ように選んだ（1 秒 + 余裕）。
     ・`decodeAudioData` はメインスレッドを数百 ms 止める（契約書 §13.6）。
       だから **AudioBuffer は LRU で持つ**（合計 300MB 目安）。鳴っている物は
       捨てない（`busy`）。捨てる時は古い物から。
     ・逆再生は「逆順の AudioBuffer を作って持つ」。`playbackRate` を負に
       できないので他に道が無い。ただし長尺（120 秒超）は作らない
       （同じ大きさの写しがもう 1 本増えるため）。
     ・速度は `playbackRate`。速度ランプは **区分線形をそのまま
       `linearRampToValueAtTime` で当てる**（core/eval.js の buildSpeedMap と
       同じ形）。**ピッチは保たれない**（→ CONTRACT-NOTE (3)）。
     ・音量・パンにキーフレームやフェードが在るときは
       `setValueCurveAtTime` で曲線を丸ごと渡す。毎フレーム `gain.value` を
       書くと rAF が遅れた分だけ段差になる。
     ・ダッキングも同じ考えで、**声の loudness 包絡から作った曲線**を
       `setValueCurveAtTime` で当てる。曲線の生成は純関数 `buildDuckCurve()`
       に切り出して試験する（ここが狂うと「BGM が戻ってこない」になる）。
     ・メーターは `engine/audio/meter.js` に任せる（L/R 別の AnalyserNode）。
       欲しいと言われた所だけ作る（全トラック分を先に作ると node が倍増する）。

   ★ 触るときの注意
     ・**Node（DOM 無し）でも import できる**。AudioContext が無い環境では
       「沈黙のエンジン」を返し、全部の口が黙って何もしない（試験が
       buildDuckCurve だけを読めるようにするため）。
     ・`dispose()` は確実に: 予約中の source を全部 stop → 効果とメーターを
       dispose → `ctx.close()`。ここを省くと iOS でタブを離れても音が残る。
     ・例外は握りつぶさない。読めない素材は「その clip だけ鳴らない」で、
       他の音と画は止めない（`warn` を 1 回出す）。
     ・`project` は **読むだけ**。編集は core/ops.js の仕事。

   CONTRACT-NOTE (1): 契約書 §4 は `createAudioEngine({ storage })` だが、
     依頼は `{ storage, fps }`。fps は受けるが **音はフレームに丸めない**
     （丸めると最大 1/fps の頭切れが出る。音は秒が真実）。stats() に出すだけ。
   CONTRACT-NOTE (2): 契約書 §4 の AudioEngine に速度の口が無い。
     engine/playback.js が `audio.setRate(r)` を duck typing で探しているので
     用意した（在ると 2 倍速でも音が鳴る）。**負の速度は受けない**
     （逆再生の実時間再生は AudioBufferSourceNode では作れない）。
   CONTRACT-NOTE (3): `clip.fx` の `pitchPreserve`（速度変更でピッチを保つ）は
     実時間では **効かせられない**（Web Audio に時間伸縮が無い）。印が立って
     いる clip を鳴らす時に 1 回だけ warn を出す。書き出し（mix.js）も同じ。
   CONTRACT-NOTE (4): 遷移（transitionIn/Out）による音の交差は **かけない**。
     core/eval.js の `resolvedAudioGain` が遷移を見ていないので、ここで足すと
     プレビューと書き出し（OfflineAudioContext 側）がずれる。音の重なりは
     `audioFade` で表すのが この repo の決まり。
   CONTRACT-NOTE (5): ダッキングは **「BGM」の印（clip.fx の type:"bgm"）が
     立っている clip の在るトラック**だけに自動で当たる
     （印は ui/inspector/audio.js が付ける）。`setDuck()` で明示もできる。
     印も指定も無い時は何もしない（勝手に BGM を推測して下げない）。
     引き金（声）は `duckSource` の印が在ればその clip だけ、無ければ
     「BGM 以外の音」全部。**この取り方は engine/audio/mix.js の
     `planDucking` と揃えてある**（再生と書き出しで下がる所を一致させる）。
     ただし此処は素材の loudness 包絡を見て **声の大きさに応じて**下げ、
     mix.js は窓の中を一律 `amount` 下げるので、**深さは数 dB 違い得る**
     （時刻と対象は一致する）。完全に揃えるなら mix.js の
     `planDucking` + `duckGainAt` を此処から import して包絡の代わりに使う
     （向こうがその為に export している）。
     ai/tools.js の `autoDuck` は キーフレームを打つ別の道で、こちらとは
     喧嘩しない（あちらは音量キー、こちらは専用の GainNode）。
   CONTRACT-NOTE (6): 作法は「1 ファイル 700 行で分割」だが、分割先
     （engine/audio/scheduler.js など）は担当外で新規作成できない。
     core/eval.js・ui/inspector/audio.js・engine/audio/mix.js と同じ事情なので、
     章立てで割れる形にした: **§0〜§2 は純関数だけ**（Node で試験できる。
     tests/audio-params.test.mjs が見ている所）、**§3 だけが Web Audio を触る**。
     切り出すなら この線で割れる（§3 は §0〜§2 を import するだけになる）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, clamp01, finite } from "../../core/util.js";
import { scope } from "../../core/log.js";
import { MIN_CLIP } from "../../core/schema.js";
import { sampleClipPath, sourceTimeAt, buildSpeedMap } from "../../core/eval.js";
import { createFxChain, createAudioFx, isAudioFxType } from "./fx.js";
import { createMeter, dbFromAmp } from "./meter.js";

const L = scope("audio");

/* ══ §0. 数字（ここだけに書く）════════════════════════════════════════ */

/** 予約する先の長さ（秒）。裏タブの間引き（1 秒）に負けない値 */
export const LOOKAHEAD = 2.0;
/** 補充の間隔（秒） */
export const TICK = 0.5;
/** AudioBuffer のキャッシュの目安（バイト） */
export const CACHE_BYTES = 300 * 1024 * 1024;
/** 逆再生の写しを作る上限（秒）。これより長い素材は逆再生を諦める */
export const REVERSE_MAX_SEC = 120;
/** 音量・パンの曲線の刻み（Hz）。25ms。人には段差が聞こえない */
export const CURVE_HZ = 40;
/** 曲線の最大の点数（長い clip で配列が太るのを止める） */
export const CURVE_MAX = 20000;
/** ダッキングの包絡の刻み（Hz）。analysis/audio.js の loudness と同じ */
export const DUCK_HZ = 20;
/** ダッキングの既定（ai/tools.js の AUTO_DEFAULTS.duck と同じ値） */
export const DUCK_DEFAULTS = Object.freeze({
  amount: 0.7, attack: 0.15, release: 0.4, thresholdDb: -42, kneeDb: 8, hold: 0.12
});

/* ══ §1. ダッキングの曲線（純関数・試験する）══════════════════════════ */

/**
 * 声の loudness 包絡から BGM に当てるゲイン曲線を作る（純関数）。
 *
 * ・無音（しきい値より下）の所は **1**（下げない）。
 * ・声の上では `1 - amount` まで下がる。
 * ・下がる速さは `amount / attack`（= 指定した attack 秒で下がりきる）、
 *   戻る速さは `amount / release`（= release 秒で戻りきる）。
 *   「時定数」ではなく **直線の傾き**にしたのは、指定した秒数がそのまま
 *   耳に聞こえる時間になり、試験でも押さえられるから。
 * ・`hold` の間は戻り始めない（語の切れ目でBGMが持ち上がる耳障りを防ぐ）。
 * ・返す列は **入力と同じ刻み・同じ長さ**。`setValueCurveAtTime` にそのまま渡す。
 *
 * @param {{hz?:number, values:number[]|Float32Array}|number[]|Float32Array} loudness
 *   dBFS 相当の包絡（analysis/audio.js の `loudnessCurve` の形）
 * @param {{amount?:number, attack?:number, release?:number, thresholdDb?:number,
 *          kneeDb?:number, hold?:number, hz?:number, initial?:number}} [opts]
 *   `initial` は前の窓の終わりのゲイン（窓を継ぎ足す時に渡す。既定 1）
 * @returns {Float32Array} 0..1 のゲイン列（長さ 0 の入力には長さ 0）
 */
export function buildDuckCurve(loudness, opts) {
  const o = opts || {};
  const holder = (loudness && typeof loudness === "object" && !Array.isArray(loudness) && !ArrayBuffer.isView(loudness))
    ? loudness : null;
  const raw = holder ? holder.values : loudness;
  const src = (Array.isArray(raw) || (ArrayBuffer.isView(raw) && !(raw instanceof DataView))) ? raw : null;
  const n = src ? src.length : 0;
  const out = new Float32Array(n);
  if (!n) return out;

  const hz = clamp(finite(o.hz, finite(holder && holder.hz, DUCK_HZ)), 0.25, 1000);
  const dt = 1 / hz;
  const amount = clamp01(finite(o.amount, DUCK_DEFAULTS.amount));
  const attack = Math.max(dt / 4, finite(o.attack, DUCK_DEFAULTS.attack));
  const release = Math.max(dt / 4, finite(o.release, DUCK_DEFAULTS.release));
  const thr = finite(o.thresholdDb, DUCK_DEFAULTS.thresholdDb);
  const knee = Math.max(0.1, finite(o.kneeDb, DUCK_DEFAULTS.kneeDb));
  const hold = Math.max(0, finite(o.hold, DUCK_DEFAULTS.hold));
  /* 1 標本で動ける量（= 傾き × 刻み） */
  const down = (amount * dt) / attack;
  const up = (amount * dt) / release;

  let g = clamp01(finite(o.initial, 1));
  let holdLeft = 0;
  for (let i = 0; i < n; i++) {
    const db = finite(src[i], -120);
    /* しきい値の上でだんだん効かせる（knee dB で 0 → 1）*/
    const depth = clamp01((db - thr) / knee);
    const target = 1 - amount * depth;
    /* **今の値を先に置き、動かすのはその後**。こうすると
       「声の頭のちょうど attack 秒後に下がりきる」が標本の数と一致し、
       曲線の頭が `initial` そのものになる（窓の継ぎ目に段差が出ない）。 */
    out[i] = clamp01(g);
    if (depth > 0) holdLeft = hold;          // 声が在る間は保つ時間を張り直す
    if (target < g - 1e-9) g = Math.max(target, g - down);
    else if (holdLeft > 0) holdLeft -= dt;
    else g = Math.min(target, g + up);
  }
  return out;
}

/**
 * AudioBuffer から loudness 包絡（dBFS 相当）を作る（純関数）。
 * `asset.analysis.loudness` が無い素材でもダッキングを効かせるための代役。
 * @param {*} buffer AudioBuffer / 偽 AudioBuffer
 * @param {{hz?:number}} [opts]
 * @returns {{hz:number, values:Float32Array}}
 */
export function envelopeFromBuffer(buffer, opts) {
  const o = opts || {};
  const hz = clamp(finite(o.hz, DUCK_HZ), 1, 200);
  const sr = clamp(finite(buffer && buffer.sampleRate, 48000), 8000, 192000);
  const len = Math.max(0, Math.floor(finite(buffer && buffer.length, 0)));
  if (!len || !buffer || typeof buffer.getChannelData !== "function") return { hz, values: new Float32Array(0) };
  const nch = clamp(Math.round(finite(buffer.numberOfChannels, 1)), 1, 32);
  const chans = [];
  for (let i = 0; i < nch; i++) {
    let c = null;
    try { c = buffer.getChannelData(i); } catch (e) { c = null; }
    if (c && c.length) chans.push(c);
  }
  if (!chans.length) return { hz, values: new Float32Array(0) };
  const hop = Math.max(1, Math.round(sr / hz));
  const count = Math.max(1, Math.ceil(len / hop));
  const values = new Float32Array(count);
  for (let b = 0; b < count; b++) {
    const from = b * hop;
    const to = Math.min(len, from + hop);
    let s = 0, m = 0;
    for (const c of chans) {
      for (let i = from; i < to; i++) { const v = c[i]; if (Number.isFinite(v)) { s += v * v; m++; } }
    }
    values[b] = m ? dbFromAmp(Math.sqrt(s / m)) : -120;
  }
  return { hz, values };
}

/* ══ §2. project を読む小道具（DOM も音も触らない）════════════════════ */

const arr = (v) => (Array.isArray(v) ? v : []);
const durOf = (c) => Math.max(MIN_CLIP, finite(c && c.duration, MIN_CLIP));

/** 音を持ち得る clip か（core/eval.js の clipHasAudio と同じ判断） */
function clipHasAudio(clip, asset) {
  const k = String((clip && clip.kind) || "");
  if (k === "audio") return !!asset;
  if (k === "video") return !!asset && asset.hasAudio !== false;
  return false;
}

/** clip の静的な音量（フェードとキーは別で掛ける） */
function volumeAt(clip, local) {
  const v = sampleClipPath(clip, "volume", local, finite(clip && clip.volume, 1));
  const g = clamp(finite(v, 1), 0, 8);
  return g * fadeAt(clip, local);
}

/** audioFade の掛かり（core/eval.js の fadeGain と同じ形） */
function fadeAt(clip, local) {
  const af = (clip && clip.audioFade) || null;
  if (!af) return 1;
  const fi = Math.max(0, finite(af.in, 0));
  const fo = Math.max(0, finite(af.out, 0));
  if (fi <= 1e-4 && fo <= 1e-4) return 1;
  const dur = durOf(clip);
  const curve = String(af.curve || "linear");
  const shape = (x) => {
    const u = clamp01(x);
    if (curve === "exp") return u * u;
    if (curve === "log") return Math.sqrt(u);
    return u;
  };
  let g = 1;
  if (fi > 1e-4) g *= shape(local / fi);
  if (fo > 1e-4) g *= shape((dur - local) / fo);
  return clamp01(g);
}

/** パンの値（キー → 静的値 → 0） */
function panAt(clip, local) {
  const v = sampleClipPath(clip, "pan", local, finite(clip && clip.pan, 0));
  return clamp(finite(v, 0), -1, 1);
}

/** 音量に曲線が要るか（キー or フェード） */
function needsGainCurve(clip) {
  const keys = clip && clip.keys && clip.keys.volume;
  if (keys && keys.length) return true;
  const af = (clip && clip.audioFade) || null;
  return !!af && (finite(af.in, 0) > 1e-4 || finite(af.out, 0) > 1e-4);
}

/** 音の効果だけを取り出す（印と映像の効果は落ちる） */
function audioFxOf(clip) {
  return arr(clip && clip.fx).filter((f) => f && f.enabled !== false && isAudioFxType(f.type));
}

/** 印（bgm / duckSource / pitchPreserve）を探す */
function markerFx(clip, type) {
  return arr(clip && clip.fx).find((f) => f && String(f.type) === type && f.enabled !== false) || null;
}

/**
 * [from, to) に鳴る clip を並べる（純関数）。compound は 1 段だけ展開する。
 * @param {Object} project @param {number} from @param {number} to
 * @returns {Array<{track:Object, clip:Object, asset:Object|null, start:number,
 *                  end:number, gain:number, key:string}>}
 */
export function soundClipsInRange(project, from, to) {
  const out = [];
  const p = project || {};
  const tracks = arr(p.tracks);
  const assets = new Map();
  for (const a of arr(p.assets)) if (a && a.id) assets.set(String(a.id), a);
  const solo = tracks.some((t) => t && String(t.kind) !== "adjust" && t.solo);
  for (const track of tracks) {
    if (!track || String(track.kind) === "adjust" || track.muted) continue;
    if (solo && !track.solo) continue;
    for (const clip of arr(track.clips)) {
      if (!clip || clip.muteAudio) continue;
      const s = Math.max(0, finite(clip.start, 0));
      const e = s + durOf(clip);
      if (e <= from || s >= to) continue;
      if (String(clip.kind) === "compound") {
        /* 入れ子（深さ 2 まで）。親の速度は追わない（CONTRACT-NOTE 参照） */
        const inner = arr(clip.compound && clip.compound.tracks);
        const pg = clamp(finite(clip.volume, 1), 0, 8);
        for (const it of inner) {
          if (!it || String(it.kind) === "adjust" || it.muted) continue;
          for (const ic of arr(it.clips)) {
            if (!ic || ic.muteAudio) continue;
            const is = s + Math.max(0, finite(ic.start, 0));
            const ie = Math.min(e, is + durOf(ic));
            if (ie <= from || is >= to || ie - is <= 1e-3) continue;
            const ia = ic.assetId ? assets.get(String(ic.assetId)) || null : null;
            if (!clipHasAudio(ic, ia)) continue;
            out.push({ track, clip: ic, asset: ia, start: is, end: ie, gain: pg, key: track.id + "/" + clip.id + "/" + ic.id });
          }
        }
        continue;
      }
      const asset = clip.assetId ? assets.get(String(clip.assetId)) || null : null;
      if (!clipHasAudio(clip, asset)) continue;
      out.push({ track, clip, asset, start: s, end: e, gain: 1, key: track.id + "/" + clip.id });
    }
  }
  return out;
}

/**
 * 引き金（声）側の明示指定を探す（純関数）。`duckSource` の印
 * （ui/inspector/audio.js の「この音で自動ダッキング」）が 1 つでも在れば
 * **その clip だけ**が引き金になる。engine/audio/mix.js の planDucking ① と
 * 同じ決め方（再生と書き出しで下がる所を一致させる）。
 * @param {Object} project @returns {{params:Object}|null}
 */
export function duckSourceSpecOf(project) {
  for (const track of arr(project && project.tracks)) {
    if (!track || String(track.kind) === "adjust" || track.muted) continue;
    for (const clip of arr(track.clips)) {
      const m = markerFx(clip, "duckSource");
      if (m) return { params: m.params || {} };
    }
  }
  return null;
}

/**
 * 「どのトラックを・どれだけ・どの速さで下げるか」を決める（純関数）。
 * 対象は `bgm` の印（`params.duck === false` は除く）が付いた clip の在る
 * トラック。深さと反応は 引き金の印 → BGM の印 → 既定 の順に採る。
 * @param {Object} project
 * @param {{trackId:string, amount?:number, attack?:number, release?:number,
 *          enabled?:boolean}|null} [override] setDuck() の明示指定（印より強い）
 * @returns {{trackId:string, amount:number, attack:number, release:number,
 *            explicit:boolean}[]} 1 トラック 1 件
 */
export function duckPlanOf(project, override) {
  if (override && override.trackId && override.enabled !== false) {
    return [{
      trackId: String(override.trackId),
      amount: clamp01(finite(override.amount, DUCK_DEFAULTS.amount)),
      attack: Math.max(0.01, finite(override.attack, DUCK_DEFAULTS.attack)),
      release: Math.max(0.01, finite(override.release, DUCK_DEFAULTS.release)),
      explicit: false
    }];
  }
  const src = duckSourceSpecOf(project);
  const out = [];
  for (const track of arr(project && project.tracks)) {
    if (!track || String(track.kind) === "adjust" || track.muted) continue;
    for (const clip of arr(track.clips)) {
      const m = markerFx(clip, "bgm");
      if (!m || (m.params && m.params.duck === false)) continue;
      const p = src ? src.params : (m.params || {});
      const fb = m.params || {};
      out.push({
        trackId: String(track.id),
        amount: clamp01(finite(p.amount, finite(fb.amount, DUCK_DEFAULTS.amount))),
        attack: Math.max(0.01, finite(p.attack, finite(fb.attack, DUCK_DEFAULTS.attack))),
        release: Math.max(0.01, finite(p.release, finite(fb.release, DUCK_DEFAULTS.release))),
        explicit: !!src
      });
      break;                        // 1 トラック 1 回
    }
  }
  return out;
}

/**
 * 1 本を「素材のどこから・どれだけ」鳴らすかを決める（純関数）。
 *
 * **実時間再生（ここ）と書き出し（engine/audio/mix.js の OfflineAudioContext）で
 * 同じ数を使うために切り出した**（契約書 §13.6「再生と同じ組み立て関数を
 * 使い回す」）。別実装にすると必ずずれ、しかも「書き出した音だけ頭が切れる」
 * という最も気付きにくい形で出る。
 *
 * @param {{clip:Object, start:number, end:number}} item soundClipsInRange の 1 件
 * @param {number} at ここから鳴らす（タイムライン秒。clip の頭より前なら頭から）
 * @param {number} bufferDuration 素材（AudioBuffer）の秒数
 * @returns {{timelineAt:number, localAt:number, localEnd:number,
 *            offset:number, span:number}|null} 鳴らす物が無ければ null
 *   `offset` は AudioBuffer の中の秒（reverse なら逆順 buffer の中の位置）、
 *   `span` は **使う素材の秒数**（∫v dt。速度ランプを織り込んだ量）。
 */
export function planVoice(item, at, bufferDuration) {
  const clip = item && item.clip;
  if (!clip) return null;
  const startT = finite(item.start, 0);
  const endT = finite(item.end, 0);
  const bufDur = Math.max(0, finite(bufferDuration, 0));
  if (!bufDur) return null;
  const timelineAt = Math.max(startT, finite(at, startT));
  if (!(endT > timelineAt + 1e-4)) return null;
  const localAt = timelineAt - startT;
  const localEnd = endT - startT;
  const map = buildSpeedMap(clip);
  const srcTime = sourceTimeAt(clip, localAt);
  const offset = clamp(clip.reverse ? bufDur - srcTime : srcTime, 0, Math.max(0, bufDur - 1e-4));
  let span = Math.abs(map.at(localEnd) - map.at(localAt));
  span = Math.min(span, Math.max(0, bufDur - offset));
  if (!(span > 0.005)) return null;
  return { timelineAt, localAt, localEnd, offset, span };
}

/** clip ローカル秒での音量（キー × フェード）。mix.js も同じ物を使う */
export function clipGainAt(clip, local) { return volumeAt(clip, local); }
/** clip ローカル秒でのパン（キー → 静的値 → 0）。mix.js も同じ物を使う */
export function clipPanAt(clip, local) { return panAt(clip, local); }

/* ══ §3. AudioEngine ══════════════════════════════════════════════════ */

/** AudioContext を 1 つ作る（無い環境では null） */
function makeContext(sampleRate) {
  const AC = (typeof AudioContext === "function") ? AudioContext
    : (typeof globalThis !== "undefined" && typeof globalThis.webkitAudioContext === "function") ? globalThis.webkitAudioContext
      : null;
  if (!AC) return null;
  /* sampleRate は **指定しない**のが既定（端末の実周波数と違う値を指定すると
     内部で再標本化が入り、iOS では作れない事も在る）。 */
  try { return sampleRate ? new AC({ latencyHint: "interactive", sampleRate }) : new AC({ latencyHint: "interactive" }); }
  catch (e) { /* 古い端末は options を受けない */ }
  try { return new AC(); } catch (e) { return null; }
}

/** 音が鳴らない環境のための「沈黙のエンジン」（口だけ揃える） */
function silentEngine(reason) {
  L.warn("音を鳴らせない環境です: " + reason);
  const nop = () => {};
  return {
    ctx: null, master: null, masterBus: null, available: false, reason,
    setProject: nop, prepare: () => Promise.resolve(), start: nop, stop: nop, seek: nop,
    setMasterVolume: nop, setRate: () => 1, get mediaTime() { return null; },
    get playing() { return false; }, get rate() { return 1; },
    meter: () => null, resetMeters: nop, setDuck: nop,
    recordVoice() { throw new Error("この端末では録音を使えません（" + reason + "）"); },
    unlock: () => Promise.resolve(false),
    stats: () => ({ available: false, reason, voices: 0, cached: 0, bytes: 0 }),
    dispose: nop
  };
}

/**
 * 音のエンジンを作る（契約書 §4）。
 * @param {{storage?:Object, project?:Object, fps?:number, sampleRate?:number,
 *          lookahead?:number, tick?:number, cacheBytes?:number}} [o]
 * @returns {Object} AudioEngine
 */
export function createAudioEngine(o) {
  const opts = o || {};
  const storage = opts.storage || null;
  const fps = clamp(finite(opts.fps, 30), 1, 240);          // CONTRACT-NOTE (1)
  const lookahead = clamp(finite(opts.lookahead, LOOKAHEAD), 0.25, 10);
  const tickSec = clamp(finite(opts.tick, TICK), 0.05, 2);
  const cacheMax = Math.max(8 * 1024 * 1024, finite(opts.cacheBytes, CACHE_BYTES));
  let project = opts.project || null;

  const ctx = makeContext(opts.sampleRate);
  if (!ctx) return silentEngine("AudioContext が在りません");

  /* ── 3.1 マスター ───────────────────────────────────────────── */
  const masterBus = ctx.createGain();        // トラックはここへ入る
  const masterGain = ctx.createGain();       // マスター音量（契約書の `master`）
  let masterFx = null;
  let limiter = null;
  const limiterOn = ctx.createGain();        // リミッターを通した音
  const limiterOff = ctx.createGain();       // 素通しの音（どちらか 1 本だけ 1 倍）
  try {
    masterFx = createFxChain(ctx, arr(settings().fx));
    limiter = createAudioFx(ctx, "limiter", { ceiling: -1, release: 80 });
    masterBus.connect(masterFx.input);
    masterFx.output.connect(limiter.input);
    limiter.output.connect(limiterOn);
    masterFx.output.connect(limiterOff);
    limiterOn.connect(masterGain);
    limiterOff.connect(masterGain);
    masterGain.connect(ctx.destination);
  } catch (e) {
    L.error("マスターを組めない", e && e.message);
    try { masterBus.connect(masterGain); masterGain.connect(ctx.destination); } catch (x) { /* noop */ }
  }
  setLimiter(true);

  /* ── 3.2 状態 ───────────────────────────────────────────────── */
  /** @type {Map<string, Object>} トラック id → 卓の 1 列 */
  const strips = new Map();
  /** @type {Map<string, Object>} 鳴っている（予約済みの）声 */
  const voices = new Map();
  /** 予約済みの key（seek で捨てる） */
  const scheduled = new Set();
  /** @type {Map<string, {buf:AudioBuffer, bytes:number, at:number}>} */
  const cache = new Map();
  /** @type {Map<string, Promise>} decode 中 */
  const pending = new Map();
  /** 今鳴っている buffer の key（捨てない） */
  const busy = new Map();
  /** @type {Map<string, Object>} メーター（欲しいと言われた所だけ作る） */
  const meters = new Map();
  /** @type {Map<string, {until:number, gain:number}>} ダッキングの続き */
  const duckState = new Map();
  /** @type {Map<string, {hz:number, values:Float32Array}>} 包絡の控え */
  const envCache = new Map();

  let cacheBytes = 0;
  let lru = 0;
  let playing = false;
  let rate = 1;
  let position = 0;              // 止まっている時の位置（秒）
  let anchorCtx = 0, anchorMedia = 0;
  let timer = 0;
  let disposed = false;
  let duckOverride = null;       // setDuck() で明示された指定
  let panless = false;           // StereoPanner が無い端末
  const warned = new Set();

  function warnOnce(key, ...args) {
    if (warned.has(key)) return;
    warned.add(key);
    L.warn(...args);
  }
  function settings() {
    const s = (project && project.settings) || {};
    return (s.audio && typeof s.audio === "object") ? s.audio : {};
  }

  /* ── 3.3 時計 ───────────────────────────────────────────────── */
  function mediaNow() {
    if (!playing) return position;
    return anchorMedia + (ctx.currentTime - anchorCtx) * rate;
  }
  function ctxTimeOf(media) {
    return anchorCtx + (media - anchorMedia) / rate;
  }
  function setAnchor(t) {
    anchorMedia = Math.max(0, finite(t, 0));
    anchorCtx = ctx.currentTime;
    position = anchorMedia;
  }

  /* ── 3.4 卓の 1 列（トラック）────────────────────────────────── */
  function makePanner() {
    if (panless) return null;
    if (typeof ctx.createStereoPanner !== "function") {
      panless = true;
      warnOnce("panner", "この端末に StereoPannerNode が無いのでパンは効きません");
      return null;
    }
    try { return ctx.createStereoPanner(); } catch (e) { panless = true; return null; }
  }

  function stripFor(trackId) {
    const id = String(trackId || "master");
    if (id === "master") return null;
    let s = strips.get(id);
    if (s) return s;
    const input = ctx.createGain();
    const duck = ctx.createGain();
    const gain = ctx.createGain();
    const pan = makePanner();
    let fx = null;
    try { fx = createFxChain(ctx, []); } catch (e) { fx = null; }
    if (fx) { input.connect(fx.input); fx.output.connect(duck); }
    else input.connect(duck);
    duck.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(masterBus); }
    else gain.connect(masterBus);
    s = { id, input, fx, duck, gain, pan, out: pan || gain, fxSig: "" };
    strips.set(id, s);
    return s;
  }

  /** トラックの音量・パン・効果を project に合わせる */
  function syncStrips() {
    const tracks = arr(project && project.tracks).filter((t) => t && String(t.kind) !== "adjust");
    const solo = tracks.some((t) => t.solo);
    const alive = new Set();
    for (const t of tracks) {
      const id = String(t.id);
      alive.add(id);
      const s = stripFor(id);
      if (!s) continue;
      const on = !t.muted && (!solo || t.solo);
      s.gain.gain.value = on ? clamp(finite(t.volume, 1), 0, 8) : 0;
      if (s.pan) s.pan.pan.value = clamp(finite(t.pan, 0), -1, 1);
      if (s.fx) { try { s.fx.update(arr(t.fx)); } catch (e) { warnOnce("trackfx", "トラックの効果を組めない", e && e.message); } }
    }
    /* 消えたトラックの列を片付ける */
    for (const [id, s] of Array.from(strips.entries())) {
      if (alive.has(id)) continue;
      const m = meters.get(id);
      if (m) { try { m.dispose(); } catch (e) { /* noop */ } meters.delete(id); }
      disposeStrip(s);
      strips.delete(id);
      duckState.delete(id);
    }
  }

  function disposeStrip(s) {
    if (!s) return;
    if (s.fx) { try { s.fx.dispose(); } catch (e) { /* noop */ } }
    for (const n of [s.input, s.duck, s.gain, s.pan]) { if (n) { try { n.disconnect(); } catch (e) { /* noop */ } } }
  }

  /* ── 3.5 素材（decode と LRU）────────────────────────────────── */
  function bytesOf(buf) {
    return Math.max(1, finite(buf && buf.length, 0)) * Math.max(1, finite(buf && buf.numberOfChannels, 1)) * 4;
  }

  function evict() {
    if (cacheBytes <= cacheMax) return;
    const list = Array.from(cache.entries())
      .filter(([k]) => !busy.has(k))
      .sort((a, b) => a[1].at - b[1].at);
    for (const [k, v] of list) {
      if (cacheBytes <= cacheMax) break;
      cache.delete(k);
      envCache.delete(k);
      cacheBytes -= v.bytes;
    }
    if (cacheBytes > cacheMax) warnOnce("cache", "鳴っている音が多くてキャッシュを減らせません");
  }

  function decodeAudioData(ab) {
    return new Promise((res, rej) => {
      let done = false;
      const ok = (b) => { if (!done) { done = true; res(b); } };
      const ng = (e) => { if (!done) { done = true; rej(e instanceof Error ? e : new Error("音を復号できません")); } };
      let p = null;
      try { p = ctx.decodeAudioData(ab, ok, ng); } catch (e) { ng(e); return; }
      if (p && typeof p.then === "function") p.then(ok, ng);
    });
  }

  async function blobBytes(blob) {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    /* 古い Safari 用（Blob.arrayBuffer が無い） */
    return new Promise((res, rej) => {
      if (typeof FileReader !== "function") { rej(new Error("Blob を読めません")); return; }
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("Blob を読めません"));
      fr.readAsArrayBuffer(blob);
    });
  }

  function reverseOf(buf) {
    const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const s = buf.getChannelData(ch);
      const d = out.getChannelData(ch);
      const n = buf.length;
      for (let i = 0; i < n; i++) d[i] = s[n - 1 - i];
    }
    return out;
  }

  function put(key, buf) {
    const bytes = bytesOf(buf);
    cache.set(key, { buf, bytes, at: ++lru });
    cacheBytes += bytes;
    evict();
    return buf;
  }

  /**
   * 素材の AudioBuffer を得る（無ければ decode する）。
   * @returns {Promise<AudioBuffer|null>} 読めなければ null（その clip だけ鳴らない）
   */
  function bufferFor(asset, reverse) {
    if (!asset || !asset.id) return Promise.resolve(null);
    const base = String(asset.id);
    const key = reverse ? base + "|rev" : base;
    const hit = cache.get(key);
    if (hit) { hit.at = ++lru; return Promise.resolve(hit.buf); }
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const job = (async () => {
      if (reverse) {
        const fwd = await bufferFor(asset, false);
        if (!fwd) return null;
        if (fwd.duration > REVERSE_MAX_SEC) {
          /* 逆順の写しは元と同じ大きさを食うので長尺では作らない。
             **元の buffer を代わりに返してはいけない**（planVoice の offset は
             逆順 buffer の座標で出ているので、鳴らすと別の場所が鳴る）。
             鳴らさない方が正直な失敗。 */
          warnOnce("rev:" + base, "長い素材（" + Math.round(fwd.duration) + "秒）の逆再生は音を出しません: " + (asset.name || base));
          return null;
        }
        return put(key, reverseOf(fwd));
      }
      if (!storage || typeof storage.getAssetBlob !== "function") {
        warnOnce("nostorage", "保存庫が無いので音を読めません");
        return null;
      }
      const sk = asset.storage && asset.storage.key;
      if (!sk) { warnOnce("nokey:" + base, "素材の実体が在りません: " + (asset.name || base)); return null; }
      const blob = await storage.getAssetBlob(sk);
      if (!blob) { warnOnce("noblob:" + base, "素材を読み出せません: " + (asset.name || base)); return null; }
      const ab = await blobBytes(blob);
      const buf = await decodeAudioData(ab);
      return put(key, buf);
    })().catch((e) => {
      warnOnce("dec:" + base, "音を復号できません: " + (asset.name || base), e && e.message);
      return null;
    }).then((b) => { pending.delete(key); return b; });

    pending.set(key, job);
    return job;
  }

  /* ── 3.6 1 本を鳴らす ───────────────────────────────────────── */
  function dropVoice(key) {
    const v = voices.get(key);
    if (!v) return;
    voices.delete(key);
    /* scheduled からは **消さない**。消すと同じ窓でもう一度予約してしまう
       （予約の一覧は seek / start / 組み直しで丸ごと捨てる）。 */
    try { v.src.onended = null; } catch (e) { /* noop */ }
    try { v.src.stop(); } catch (e) { /* 既に終わっている */ }
    for (const n of [v.src, v.gain, v.pan]) { if (n) { try { n.disconnect(); } catch (e) { /* noop */ } } }
    if (v.fx) { try { v.fx.dispose(); } catch (e) { /* noop */ } }
    if (v.bufKey) {
      const c = (busy.get(v.bufKey) || 0) - 1;
      if (c > 0) busy.set(v.bufKey, c); else busy.delete(v.bufKey);
    }
  }

  function dropAllVoices() {
    for (const key of Array.from(voices.keys())) dropVoice(key);
    voices.clear();
    scheduled.clear();
    busy.clear();
  }

  /** 曲線を 1 本作る（sample(local) を CURVE_HZ で並べる） */
  function curveOf(localFrom, localTo, sample) {
    const span = Math.max(1e-4, localTo - localFrom);
    const n = clamp(Math.ceil(span * CURVE_HZ) + 1, 2, CURVE_MAX);
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = sample(localFrom + (span * i) / (n - 1));
    return c;
  }

  async function startVoice(item) {
    const clip = item.clip;
    const buf = await bufferFor(item.asset, !!clip.reverse);
    if (disposed || !playing || !buf) return;        // 予約の印は残す（読み直さない）
    if (!scheduled.has(item.key) || voices.has(item.key)) return;   // seek で捨てられた
    const now = mediaNow();
    if (item.end <= now + 0.01) return;              // decode を待つ間に過ぎた

    const plan = planVoice(item, now, buf.duration);
    if (!plan) return;
    const { timelineAt: at, localAt, localEnd, offset, span } = plan;
    const map = buildSpeedMap(clip);

    const strip = stripFor(item.track.id);
    if (!strip) return;
    if (markerFx(clip, "pitchPreserve") && Math.abs(finite(clip.speed, 1) - 1) > 1e-3) {
      warnOnce("pitchkeep", "速度を変えた音のピッチは実時間再生では保てません（CONTRACT-NOTE (3)）");
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain);
    let tail = gain;
    let fx = null;
    const fxList = audioFxOf(clip);
    if (fxList.length) {
      try { fx = createFxChain(ctx, fxList); tail.connect(fx.input); tail = fx.output; }
      catch (e) { fx = null; warnOnce("clipfx", "clip の効果を組めない", e && e.message); }
    }
    let pan = null;
    const panKeys = clip.keys && clip.keys.pan;
    if ((panKeys && panKeys.length) || Math.abs(finite(clip.pan, 0)) > 1e-3) {
      pan = makePanner();
      if (pan) { tail.connect(pan); tail = pan; }
    }
    tail.connect(strip.input);

    const when = Math.max(ctx.currentTime, ctxTimeOf(at));
    const ctxSpan = (localEnd - localAt) / rate;

    /* 音量: キーもフェードも無ければ 1 つの値で済ます（曲線は高い） */
    if (needsGainCurve(clip)) {
      const c = curveOf(localAt, localEnd, (l) => clamp(item.gain * volumeAt(clip, l), 0, 8));
      try { gain.gain.setValueCurveAtTime(c, when, Math.max(0.01, ctxSpan)); }
      catch (e) { gain.gain.value = c[0]; }
    } else {
      gain.gain.value = clamp(item.gain * volumeAt(clip, localAt), 0, 8);
    }
    /* パン */
    if (pan) {
      if (panKeys && panKeys.length) {
        const c = curveOf(localAt, localEnd, (l) => panAt(clip, l));
        try { pan.pan.setValueCurveAtTime(c, when, Math.max(0.01, ctxSpan)); }
        catch (e) { pan.pan.value = c[0]; }
      } else pan.pan.value = clamp(finite(clip.pan, 0), -1, 1);
    }
    /* 速度（ランプは区分線形をそのまま当てる） */
    const ramp = arr(clip.speedRamp);
    const rateAt = (l) => clamp(map.rateAt(l) * rate, 0.0625, 16);
    if (ramp.length >= 2) {
      try {
        src.playbackRate.setValueAtTime(rateAt(localAt), when);
        for (const pt of ramp) {
          const t = finite(pt && pt.t, -1);
          if (!(t > localAt + 1e-4) || t > localEnd) continue;
          src.playbackRate.linearRampToValueAtTime(clamp(finite(pt.v, 1) * rate, 0.0625, 16), ctxTimeOf(item.start + t));
        }
      } catch (e) { src.playbackRate.value = rateAt(localAt); }
    } else {
      src.playbackRate.value = clamp(finite(clip.speed, 1) * rate, 0.0625, 16);
    }

    const bufKey = String(item.asset.id) + (clip.reverse ? "|rev" : "");
    busy.set(bufKey, (busy.get(bufKey) || 0) + 1);
    const rec = { key: item.key, src, gain, pan, fx, bufKey, end: item.end };
    voices.set(item.key, rec);
    src.onended = () => { if (!disposed) dropVoice(item.key); };
    try { src.start(when, offset, span); }
    catch (e) {
      warnOnce("start", "音を鳴らし始められません", e && e.message);
      dropVoice(item.key);
    }
  }

  /* ── 3.7 ダッキング ─────────────────────────────────────────── */
  /** 下げる相手と反応の速さ（純関数 duckPlanOf に委ねる） */
  function duckPlan() { return duckPlanOf(project, duckOverride); }

  /** その素材の loudness 包絡（解析が在ればそれ・無ければ buffer から作る） */
  function envelopeOf(asset, reverse) {
    if (!asset) return null;
    const an = asset.analysis && asset.analysis.loudness;
    if (an && (Array.isArray(an.values) || ArrayBuffer.isView(an.values)) && an.values.length) {
      return { hz: clamp(finite(an.hz, DUCK_HZ), 1, 200), values: an.values };
    }
    const key = String(asset.id) + (reverse ? "|rev" : "");
    const got = envCache.get(key);
    if (got) return got;
    const hit = cache.get(key);
    if (!hit) return null;                       // まだ decode していない = 諦める
    const env = envelopeFromBuffer(hit.buf, { hz: DUCK_HZ });
    envCache.set(key, env);
    return env;
  }

  /**
   * [from, to) の「声の大きさ」（dBFS 相当）を DUCK_HZ で並べる。
   * 下げる相手のトラックは除く。複数の声は **大きい方**を採る。
   */
  function voiceEnvelope(from, to, skipTrackId, explicit) {
    const n = Math.max(2, Math.ceil((to - from) * DUCK_HZ));
    const values = new Float32Array(n).fill(-120);
    let any = false;
    for (const item of soundClipsInRange(project, from, to)) {
      if (String(item.track.id) === skipTrackId) continue;
      /* 明示の引き金が在るならそれだけ。無ければ「BGM 以外の音」全部
         （engine/audio/mix.js の planDucking と同じ取り方） */
      if (explicit ? !markerFx(item.clip, "duckSource") : markerFx(item.clip, "bgm")) continue;
      const env = envelopeOf(item.asset, !!item.clip.reverse);
      if (!env || !env.values.length) continue;
      const trackGain = clamp(finite(item.track.volume, 1), 0, 8);
      for (let i = 0; i < n; i++) {
        const t = from + i / DUCK_HZ;
        if (t < item.start || t >= item.end) continue;
        const local = t - item.start;
        const srcT = sourceTimeAt(item.clip, local);
        const idx = Math.round(srcT * env.hz);
        if (idx < 0 || idx >= env.values.length) continue;
        const g = item.gain * volumeAt(item.clip, local) * trackGain;
        const db = finite(env.values[idx], -120) + (g > 0 ? dbFromAmp(g) : -120);
        if (db > values[i]) { values[i] = db; any = true; }
      }
    }
    return any ? { hz: DUCK_HZ, values } : null;
  }

  /** ダッキングの曲線を窓の分だけ継ぎ足す */
  function pumpDuck(now, until) {
    const plan = duckPlan();
    if (!plan.length) return;
    for (const d of plan) {
      const strip = strips.get(d.trackId);
      if (!strip) continue;
      const st = duckState.get(d.trackId) || { until: now, gain: 1 };
      const from = Math.max(st.until, now);
      if (until - from < 0.1) continue;
      const env = voiceEnvelope(from, until, d.trackId, d.explicit);
      if (!env) {
        /* 声が無い窓は 1 に戻す（曲線を張らずに滑らかに） */
        if (st.gain < 0.999) {
          try { strip.duck.gain.setTargetAtTime(1, ctxTimeOf(from), Math.max(0.01, d.release) / 3); }
          catch (e) { strip.duck.gain.value = 1; }
        }
        duckState.set(d.trackId, { until, gain: 1 });
        continue;
      }
      const curve = buildDuckCurve(env, {
        hz: DUCK_HZ, amount: d.amount, attack: d.attack, release: d.release, initial: st.gain
      });
      try { strip.duck.gain.setValueCurveAtTime(curve, ctxTimeOf(from), (until - from) / rate); }
      catch (e) {
        /* 重なった／過去の時刻だった: 段差にならないよう今の値だけ当てる */
        try { strip.duck.gain.setTargetAtTime(curve[curve.length - 1], ctx.currentTime, 0.05); }
        catch (x) { strip.duck.gain.value = curve[curve.length - 1]; }
      }
      duckState.set(d.trackId, { until, gain: curve[curve.length - 1] });
    }
  }

  function resetDuck() {
    duckState.clear();
    for (const s of strips.values()) {
      try { s.duck.gain.cancelScheduledValues(0); } catch (e) { /* noop */ }
      s.duck.gain.value = 1;
    }
  }

  /* ── 3.8 スケジューラ ───────────────────────────────────────── */
  function pump() {
    if (disposed || !playing) return;
    const now = mediaNow();
    const until = now + lookahead;
    for (const item of soundClipsInRange(project, now - 0.05, until)) {
      if (scheduled.has(item.key)) continue;
      scheduled.add(item.key);
      startVoice(item).catch((e) => warnOnce("voice", "音を組めません", e && e.message));
    }
    pumpDuck(now, until);
    /* 終わった声の後片付け（onended が来ない端末の保険） */
    for (const [key, v] of Array.from(voices.entries())) if (v.end < now - 0.5) dropVoice(key);
  }

  function startTimer() {
    if (timer || typeof setInterval !== "function") return;
    timer = setInterval(() => { try { pump(); } catch (e) { warnOnce("pump", "予約の補充で失敗", e && e.message); } }, tickSec * 1000);
  }
  function stopTimer() {
    if (timer && typeof clearInterval === "function") clearInterval(timer);
    timer = 0;
  }

  /* ── 3.9 口（契約書 §4）─────────────────────────────────────── */
  function setLimiter(on) {
    const use = on !== false;
    limiterOn.gain.value = (limiter && use) ? 1 : 0;
    limiterOff.gain.value = (limiter && use) ? 0 : 1;
  }

  function setProject(p) {
    project = p || null;
    const s = settings();
    masterGain.gain.value = clamp(finite(s.master, 1), 0, 8);
    setLimiter(s.limiter !== false);
    if (masterFx) { try { masterFx.update(arr(s.fx)); } catch (e) { warnOnce("masterfx", "マスターの効果を組めない", e && e.message); } }
    syncStrips();
    if (playing) {
      /* 音の並びが変わったなら組み直す（変わっていなければ触らない）*/
      const sig = mixSignature();
      if (sig !== lastMixSig) {
        lastMixSig = sig;
        const t = mediaNow();
        dropAllVoices();
        resetDuck();
        setAnchor(t);
        pump();
      }
    } else lastMixSig = mixSignature();
  }

  let lastMixSig = "";
  /** 音として意味の在る所だけの指紋（無駄な組み直しを避ける） */
  function mixSignature() {
    const out = [];
    for (const t of arr(project && project.tracks)) {
      if (!t || String(t.kind) === "adjust") continue;
      out.push(t.id + ":" + (t.muted ? 1 : 0) + (t.solo ? 1 : 0) + ":" + finite(t.volume, 1) + ":" + finite(t.pan, 0) + ":" + arr(t.fx).length);
      for (const c of arr(t.clips)) {
        if (!c) continue;
        out.push([c.id, finite(c.start, 0), finite(c.duration, 0), finite(c.in, 0), finite(c.out, 0),
          finite(c.speed, 1), c.reverse ? 1 : 0, finite(c.volume, 1), c.muteAudio ? 1 : 0,
          arr(c.fx).length, (c.keys && c.keys.volume ? c.keys.volume.length : 0)].join(","));
      }
    }
    return out.join("|");
  }

  function prepare(time) {
    if (disposed) return Promise.resolve();
    const from = Math.max(0, finite(time, mediaNow()));
    const items = soundClipsInRange(project, from, from + lookahead + 2).slice(0, 12);
    return Promise.all(items.map((it) => bufferFor(it.asset, !!it.clip.reverse).catch(() => null))).then(() => undefined);
  }

  function start(time) {
    if (disposed) return;
    const t = Math.max(0, finite(time, position));
    /* iOS: 操作の中で resume する（await を挟まない）*/
    if (ctx.state === "suspended" && typeof ctx.resume === "function") { try { ctx.resume(); } catch (e) { /* noop */ } }
    dropAllVoices();
    resetDuck();
    playing = true;
    setAnchor(t);
    lastMixSig = mixSignature();
    pump();
    startTimer();
  }

  function stop() {
    if (disposed) return;
    const t = mediaNow();
    playing = false;
    position = Math.max(0, t);
    stopTimer();
    dropAllVoices();
    resetDuck();
  }

  function seek(time) {
    if (disposed) return;
    const t = Math.max(0, finite(time, 0));
    if (!playing) { position = t; return; }
    dropAllVoices();
    resetDuck();
    setAnchor(t);
    pump();
  }

  function setRate(r) {
    if (disposed) return rate;
    const want = finite(r, 1);
    if (want <= 0) { warnOnce("negrate", "逆再生の音は出せません（CONTRACT-NOTE (2)）"); return rate; }
    const next = clamp(want, 0.0625, 16);
    if (Math.abs(next - rate) < 1e-6) return rate;
    const t = mediaNow();
    rate = next;
    if (playing) { dropAllVoices(); resetDuck(); setAnchor(t); pump(); }
    return rate;
  }

  function setMasterVolume(v) {
    if (disposed) return;
    masterGain.gain.value = clamp(finite(v, 1), 0, 8);
  }

  /** 器の使い回し（30fps で呼ばれるので毎回作らない） */
  const readings = new Map();
  function meter(id) {
    if (disposed) return null;
    const key = (id === undefined || id === null || id === "") ? "master" : String(id);
    let m = meters.get(key);
    if (!m) {
      const node = key === "master" ? masterGain : (strips.get(key) ? strips.get(key).out : null);
      if (!node) return null;
      m = createMeter(ctx, node);
      meters.set(key, m);
    }
    const r = m.read();
    if (!r) return null;
    let out = readings.get(key);
    if (!out) { out = { peak: [0, 0], rms: [0, 0], clip: false }; readings.set(key, out); }
    out.peak[0] = r.peak[0]; out.peak[1] = r.peak[1];
    out.rms[0] = r.rms[0]; out.rms[1] = r.rms[1];
    out.clip = !!r.clip;
    return out;
  }
  function resetMeters() {
    for (const m of meters.values()) { try { m.reset(); } catch (e) { /* noop */ } }
  }

  /**
   * ダッキングを明示する（印よりこちらが強い）。
   * @param {{trackId:string, amount?:number, attack?:number, release?:number,
   *          enabled?:boolean}|null} o null で印に戻す
   */
  function setDuck(o2) {
    duckOverride = (o2 && o2.trackId) ? o2 : null;
    resetDuck();
  }

  /**
   * マイクから録る（契約書 §4）。**同期に handle を返す**
   * （ui/library.js が操作の中で呼び、返り値の stop() を後で待つ）。
   * @param {{trackId?:string, start?:number}} [o2]
   * @returns {{stop:Function, cancel:Function, get state:string}}
   * @throws {Error} 録音の口が無い端末（message をそのまま画面に出せる形）
   */
  function recordVoice(o2) {
    const md = (typeof navigator !== "undefined" && navigator.mediaDevices) || null;
    if (!md || typeof md.getUserMedia !== "function") {
      throw new Error("この端末では録音を使えません（マイクの口が在りません）");
    }
    if (typeof MediaRecorder !== "function") {
      throw new Error("この端末では録音を使えません（MediaRecorder が在りません）");
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""].find((m) => {
      if (!m) return true;
      try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
    });
    const info = { trackId: (o2 && o2.trackId) || null, start: Math.max(0, finite(o2 && o2.start, 0)) };
    const chunks = [];
    let stream = null, rec = null, state = "starting", stopped = false;
    let failure = null;
    let onReady = null;
    const ready = new Promise((res) => { onReady = res; });

    (async () => {
      try {
        stream = await md.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
        if (stopped) { closeStream(); state = "stopped"; onReady(); return; }
        rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.start(250);            // 250ms ごとに溜める（落ちても途中まで残る）
        state = "recording";
      } catch (e) {
        state = "error";
        const name = String((e && e.name) || "");
        failure = new Error(
          name === "NotAllowedError" || name === "SecurityError"
            ? "マイクの使用が許可されませんでした（ブラウザの設定で許可してください）"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "マイクが見付かりませんでした"
              : "録音を始められませんでした: " + ((e && e.message) || name || "原因不明")
        );
        closeStream();
      }
      onReady();
    })();

    function closeStream() {
      if (!stream) return;
      try { for (const t of stream.getTracks()) t.stop(); } catch (e) { /* noop */ }
      stream = null;
    }

    return {
      get state() { return state; },
      get info() { return info; },
      /** @returns {Promise<Blob>} 録れた音。失敗は throw（message をそのまま出せる） */
      async stop() {
        stopped = true;
        await ready;
        if (failure) throw failure;
        if (!rec) throw new Error("録音は始まっていませんでした");
        if (rec.state !== "inactive") {
          await new Promise((res) => {
            let done = false;
            const fin = () => { if (!done) { done = true; res(); } };
            rec.onstop = fin;
            try { rec.stop(); } catch (e) { fin(); }
            if (typeof setTimeout === "function") setTimeout(fin, 3000);   // 止まらない端末の保険
          });
        }
        closeStream();
        state = "stopped";
        const type = (rec && rec.mimeType) || mime || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size) throw new Error("録音が空でした（マイクの許可と入力を確かめてください）");
        return blob;
      },
      /** 捨てる（取り込まない） */
      cancel() {
        stopped = true;
        state = "canceled";
        try { if (rec && rec.state !== "inactive") rec.stop(); } catch (e) { /* noop */ }
        closeStream();
        chunks.length = 0;
      }
    };
  }

  /** iOS: ユーザー操作の中で 1 回呼ぶ（await を挟む前に） */
  function unlock() {
    if (disposed) return Promise.resolve(false);
    let p = null;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try { p = ctx.resume(); } catch (e) { p = null; }
    }
    /* 1 標本の無音を鳴らして「音を出した」事にする（iOS の作法） */
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(masterGain);
      s.start(0);
    } catch (e) { /* noop */ }
    return Promise.resolve(p).then(() => ctx.state === "running", () => false);
  }

  function stats() {
    return {
      available: true, state: ctx.state, sampleRate: ctx.sampleRate, fps,
      playing, rate, time: mediaNow(),
      voices: voices.size, scheduled: scheduled.size, tracks: strips.size,
      cached: cache.size, bytes: cacheBytes, decoding: pending.size,
      meters: meters.size, ducking: duckPlan().length, limiter: limiterOn.gain.value > 0
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopTimer();
    dropAllVoices();
    for (const m of meters.values()) { try { m.dispose(); } catch (e) { /* noop */ } }
    meters.clear();
    for (const s of strips.values()) disposeStrip(s);
    strips.clear();
    if (masterFx) { try { masterFx.dispose(); } catch (e) { /* noop */ } }
    if (limiter) { try { limiter.dispose(); } catch (e) { /* noop */ } }
    for (const n of [masterBus, masterGain, limiterOn, limiterOff]) { try { n.disconnect(); } catch (e) { /* noop */ } }
    cache.clear(); envCache.clear(); pending.clear(); busy.clear(); cacheBytes = 0;
    if (typeof ctx.close === "function" && ctx.state !== "closed") {
      try { ctx.close(); } catch (e) { /* noop */ }
    }
  }

  if (project) setProject(project);

  return {
    ctx,
    /** 契約書の `master`（= マスター音量の GainNode） */
    master: masterGain,
    /** トラックが入る所（ここへ繋げば混ざる。書き出しが使う） */
    masterBus,
    available: true,
    setProject, prepare, start, stop, seek,
    setMasterVolume, setRate, setLimiter, setDuck,
    meter, resetMeters, recordVoice, unlock, stats, dispose,
    /** 再生位置（秒）。鳴っていない／時計が止まっている時は null */
    get mediaTime() {
      if (disposed || !playing) return null;
      if (ctx.state !== undefined && ctx.state !== "running") return null;
      return mediaNow();
    },
    get playing() { return playing; },
    get rate() { return rate; },
    /** 素材 1 本の音を先に読ませる（取り込み直後に呼ぶと初回が速い） */
    warm(asset, reverse) { return bufferFor(asset, !!reverse); }
  };
}
