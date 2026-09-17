/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/playback.js — 再生の時計と描画ループ（契約書 §4）

   ★ 何をする所か
     `createTransport({ store, compositor, sources, audio, fps })` が Transport を
     返す。**「今どの時刻か」を決める唯一の場所**で、毎 rAF で
     `compositor.renderFrame(project, time, { sources, quality })` を呼び、
     `store.setView({ playhead })` と `on("time")` で外へ知らせる。
     時計そのものは `createClock({ now })` に切り出した（**pure**。now を注入すれば
     Node で試験できる → tests/clock.test.mjs）。

   ★ なぜこの形か（ここがずれると「音と絵が合わない」になる。理由を残す）
     ・**音が鳴っていれば AudioContext.currentTime が主時計**（契約書 §13.6）。
       `performance.now()` は「描画の時計」で、音の再生位置とは別々に進む。
       絵を音に合わせるのが正しい向きなので、時計は音から読む。
     ・ただし音時刻は **飛ぶ**（decode の遅れ・ctx の suspend・素材の差し替え）。
       そこで差が `DRIFT_TOL(0.05s)` を超えた時だけ `DRIFT_GLIDE(0.25s)` かけて
       **滑らかに寄せる**。瞬間ジャンプは禁止（1 フレームだけ絵が飛ぶと
       「カクついた」に見え、原因も分からない）。0.05 以下を直さないのは
       揺れ（補正 → 行き過ぎ → 逆の補正…）を作らないため。
       補正の速さは `DRIFT_SLEW`（rate 比）で抑えるので、寄せている間も
       時刻が **逆走しない**（前へ進みながら差だけ詰める）。
     ・差が `DRIFT_SNAP(1s)` を超えたら それは「ドリフト」ではなく **別の位置**
       （音が seek された / 組み直された）なので合わせ直す。1 秒を 0.25 秒で
       寄せると 4 倍速の絵になってしまい、滑らかさの意味が無い。
     ・**擦り（scrub）は seekExact**（契約書 §4 / §13.3）。再生中の `<video>` は
       流れているので「その 1 フレーム」は来ない。連続 scrub は
       `rafThrottle`（core/util.js）で 1 フレーム 1 回に間引き、**最後の値は必ず
       反映**する（指を離した位置の絵が出ないのが一番困る）。seekExact は
       await なので、走っている間は最新の要求だけを覚えて後で追いかける。
     ・**画質は落ちてきたら下げる**（契約書 §4）。直近 30 フレームの描画時間を
       見て 1 → 0.5 → 0.25 と段を動かす。上げる方は落ち着くまで待つ
       （上げ下げを繰り返すと画質がちらついて最悪の見た目になる）。
     ・逆再生（J キー）は **seekExact の簡易実装**（契約書 §13.6:
       「逆再生はブラウザでは安くない」）。実時間で追いつかなくても
       時計は正しく戻るので、絵が間引かれるだけで済む。

   ★ 触るときの注意
     ・compositor / sources / audio は **借り物**。dispose() でそれらを壊さない
       （持ち主は ui/app.js）。ここが止めるのは rAF・購読・音の再生だけ。
     ・dispose() は何度呼んでも良い。dispose 後の呼び出しは黙って何もしない
       （終了処理の順番で先に消えることが普通に起きる）。
     ・rAF の中で throw すると再生が二度と戻らないので、外の物を呼ぶ所は
       全部 try で囲って一度だけ warn する（毎フレーム warn は害）。
     ・`console` は呼ばない（core/log.js の scope 経由）。DOM も AudioContext も
       無い Node で **import と createClock は通る**（試験がそれを見る）。

   CONTRACT-NOTE (1): 契約書 §4 の口は `createTransport({store,compositor,sources,audio})`
     だが ui/app.js は既に `fps` も渡している（実物優先）。`fps` は省略可で、
     いつも `project.settings.fps` を先に見る（設定を変えたら即効かせたい）。
     さらに試験のために `now` / `raf` / `caf` を受ける（既定は本物。注入しなければ
     振る舞いは契約書のまま）。
   CONTRACT-NOTE (2): `createClock({now})` の `now()` は **秒**を返す単調増加の
     壁時計（`performance.now()/1000` 相当）。音時刻もメディア時刻も秒なので、
     ms を混ぜると 1000 倍の事故になる。ここだけは単位を揃えた。
   CONTRACT-NOTE (3): `renderFrame` には **毎回 quality を渡す**。合成器も自前の
     自動追従を持っているが（compositor.js の autoTune）、quality を渡すと
     そちらは黙る。画質の持ち主を 1 つにしないと「下げたのに戻る」が起きる。
     `settings.previewQuality` が auto 以外の時はその値をそのまま渡す。
   CONTRACT-NOTE (4): 契約書 §4 の AudioEngine に **再生速度の口が無い**。
     なので `rate !== 1`（逆再生も）の間は音を鳴らさず、時計は performance.now
     に戻す。`audio.setRate(r)` が生えたら自動で鳴らす（duck typing）。
     音側が `audio.mediaTime`（再生位置の秒）を出すならそれを優先する。
   CONTRACT-NOTE (5): `playReverse()` は契約書に無いが ui/transport.js が
     「在れば使う」形で探しているので用意した（setRate(-x) + play() と同じ）。
   CONTRACT-NOTE (6): project が変わった時は `sources.setProject(project)` で
     組み替える（プールを作り直すと <video> を全部捨てて iOS で重い。
     実物の SourcePool が setProject で消えた素材を手放してくれる）。
     プールの持ち主は ui/app.js なので、ここでは作らないし壊さない。
   CONTRACT-NOTE (7): 共通前提は「700 行で分割」だが、分割先（engine/clock.js）は
     担当外で新規作成できない。章立て（§A 純関数 / §B 時計 / §C Transport）で
     読めるようにし、**§A と §B はそのまま engine/clock.js へ出せる形**にした
     （§C 以外は import を 1 つも増やしていない）。隣の engine/sources.js・
     engine/text.js も同じ理由で 1 ファイルに収めている。
   CONTRACT-NOTE (8): `store.view.playhead` が外から動いた時は **時計だけ**合わせ、
     描き直しはしない。止まっている間の 1 枚は ui/app.js の `requestFrame()` が
     store の変更で必ず描くので（ui/preview.js は重ねる飾りだけを描く）、
     こちらも描くと 1 フレームに 2 回描くことになる。seek() 経由なら描く。
   CONTRACT-NOTE (9): ↑の裏返しで **統合時に 1 行足してほしい所が在る**。
     `ui/app.js` の `requestFrame()` は store の変更（view も）で 1 枚描くが、
     再生中は こちらが毎フレーム `view.playhead` を動かすため、そのままでは
     1 フレームに 2 回・しかも `quality:1` で描いてしまい、画質の自動追従が
     意味を失う。`requestFrame()` の先頭に
       `if (state.parts.transport && state.parts.transport.playing) return;`
     を足せば直る（`playing` は公開している）。毎フレーム `view.playhead` を
     動かす方は落とせない（ui/timeline/view.js の再生ヘッドがそれを見ている）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, rafThrottle } from "../core/util.js";
import { snapFrame, frameDur } from "../core/time.js";
import { projectDuration } from "../core/schema.js";
import { clipsAt, audioAt } from "../core/eval.js";
import { scope } from "../core/log.js";

const L = scope("playback");

/* ══ 定数（契約書 §4 / §13.6 の数字はここだけに書く）═════════════════ */

/** setRate の範囲（契約書 §7.4 の速度）。負は逆再生 */
export const RATE_MIN = 0.25;
export const RATE_MAX = 4;

/** これ以下のずれは直さない（直すと揺れる）。秒 */
export const DRIFT_TOL = 0.05;
/** 寄せるのにかける時間（秒）。瞬間ジャンプ禁止 */
export const DRIFT_GLIDE = 0.25;
/** 補正が使える速さ（rate 比）。1 未満なら寄せている間も逆走しない */
export const DRIFT_SLEW = 0.4;
/** これを超える差は「別の位置」なので合わせ直す（秒） */
export const DRIFT_SNAP = 1;

/** プレビューの画質の段（canvas2d.js の QUALITY_STEPS と同じ値） */
export const QUALITY_STEPS = Object.freeze([0.25, 0.5, 1]);
/** 画質を決めるのに見る直近フレーム数（契約書 §4） */
export const FRAME_WINDOW = 30;
/** 画質を上げる前に置く落ち着き（秒）。ちらつき止め */
export const UP_COOLDOWN = 0.8;

/** 先読みの長さ（秒）と、打ち直す間隔（秒） */
export const LOOKAHEAD = 1.5;
export const PREPARE_EVERY = 0.35;
/** 使い終わった <video> を手放す間隔（秒。§13.3） */
export const RELEASE_EVERY = 2;

/* ══ §A 純関数（ここは Node で全部試験する）════════════════════════ */

/**
 * 数に読めれば数、読めなければ **null**。
 * `finite(v, NaN)` は 0 を返す（core/util.js の約束）ので「値が無い」を
 * 表せない。音時刻は 0 が正しい値なので、ここは null で分ける必要が在る。
 * @param {*} v @returns {number|null}
 */
function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 壁時計（**秒**）。performance が無い環境は Date で代用する */
export function defaultNow() {
  const p = globalThis.performance;
  const ms = p && typeof p.now === "function" ? p.now() : Date.now();
  return finite(ms, 0) / 1000;
}

/**
 * 再生速度を正す。0 だけは「止める」の合図（J/K/L の K）。
 * 負は逆再生（契約書 §7.4）。大きさは 0.25〜4 に収める。
 * @param {number} r @returns {number}
 */
export function clampRate(r) {
  const v = finite(r, 1);
  if (Math.abs(v) < 1e-4) return 0;
  return (v < 0 ? -1 : 1) * clamp(Math.abs(v), RATE_MIN, RATE_MAX);
}

/**
 * 画質の段へ寄せる（比で近い方。0.3 は 0.25 側）。
 * @param {number} q @param {number} [fallback] @returns {number}
 */
export function snapStep(q, fallback) {
  const def = finite(fallback, 1);
  const n = finite(q, def);
  if (!(n > 0)) return def;
  let best = QUALITY_STEPS[0], bd = Infinity;
  for (const s of QUALITY_STEPS) {
    const d = Math.abs(Math.log(n / s));
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
/** 1 段下げる（これ以上下げられなければそのまま） */
export function stepDown(q) {
  const i = QUALITY_STEPS.indexOf(snapStep(q, 1));
  return QUALITY_STEPS[Math.max(0, i - 1)];
}
/** 1 段上げる（最高ならそのまま） */
export function stepUp(q) {
  const i = QUALITY_STEPS.indexOf(snapStep(q, 1));
  return QUALITY_STEPS[Math.min(QUALITY_STEPS.length - 1, i + 1)];
}

/**
 * `settings.previewQuality` を倍率へ。"auto" と知らない値は今の値のまま。
 * @param {string} previewQuality @param {number} [fallback] @returns {number}
 */
export function qualityOf(previewQuality, fallback) {
  const s = String(previewQuality == null ? "" : previewQuality);
  if (s === "full") return 1;
  if (s === "half") return 0.5;
  if (s === "quarter") return 0.25;
  return snapStep(fallback, 1);
}

/**
 * 範囲（イン・アウト）とループの折り返しを決める **pure**。
 * 前向き（rate>=0）は end で折り返し、逆向きは start で折り返す。
 * @param {number} t 今の時刻（秒）
 * @param {{start?:number, end?:number, loop?:boolean, rate?:number}} [opts]
 * @returns {{time:number, wrapped:boolean, ended:boolean}}
 *   wrapped = 飛んだ（時計を打ち直す） / ended = 再生を終える
 */
export function wrapTime(t, opts) {
  const o = opts || {};
  const now = finite(t, 0);
  const start = Math.max(0, finite(o.start, 0));
  const end = finite(o.end, 0);
  const span = end - start;
  const loop = !!o.loop;
  const back = finite(o.rate, 1) < 0;
  /* 範囲が無い（空のプロジェクト・in>out）なら何も再生できない */
  if (!(span > 0)) return { time: start, wrapped: false, ended: true };
  if (!back) {
    if (now < start) return { time: start, wrapped: true, ended: false };
    if (now < end) return { time: now, wrapped: false, ended: false };
    if (!loop) return { time: end, wrapped: false, ended: true };
    return { time: start + (now - start) % span, wrapped: true, ended: false };
  }
  if (now > end) return { time: end, wrapped: true, ended: false };
  if (now > start) return { time: now, wrapped: false, ended: false };
  if (!loop) return { time: start, wrapped: false, ended: true };
  return { time: end - (start - now) % span, wrapped: true, ended: false };
}

/**
 * 実測 fps（フレーム間隔の平均の逆数）。間隔は **秒**。
 * 1 秒を超える間隔（タブが隠れていた等）は数えない。
 * @param {number[]} gaps @returns {number} 整数。測れなければ 0
 */
export function measuredFps(gaps) {
  const list = Array.isArray(gaps) ? gaps : [];
  let sum = 0, n = 0;
  for (let i = 0; i < list.length; i++) {
    const g = finite(list[i], 0);
    if (g > 0 && g < 1) { sum += g; n++; }
  }
  return n ? Math.round(n / sum) : 0;
}

/**
 * 直近の描画時間から画質の段を決める **pure**（契約書 §4）。
 * @param {number[]} samples 描画にかかった ms（新しいものが後ろ）
 * @param {{fps?:number, current?:number, previewQuality?:string, canUp?:boolean}} [opts]
 * @returns {{quality:number, avgMs:number, reason:string}}
 */
export function pickQualityStep(samples, opts) {
  const o = opts || {};
  const cur = snapStep(o.current, 1);
  const pq = String(o.previewQuality == null ? "auto" : o.previewQuality);
  if (pq !== "auto") return { quality: qualityOf(pq, cur), avgMs: 0, reason: "設定" };
  const list = Array.isArray(samples) ? samples : [];
  const n = list.length;
  if (n < 12) return { quality: cur, avgMs: 0, reason: "様子見" };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.max(0, finite(list[i], 0));
  const avg = sum / n;
  const budget = 1000 / clamp(finite(o.fps, 30), 1, 240);
  /* 予算の 1.35 倍を超えたら落ちている。下げる方は即決（体感が先） */
  if (avg > budget * 1.35) {
    const q = stepDown(cur);
    return { quality: q, avgMs: avg, reason: q === cur ? "下げ切り" : "重い" };
  }
  /* 上げる方は 30 枚そろえて、しかも落ち着いてから（ちらつき止め） */
  if (n >= FRAME_WINDOW && avg < budget * 0.45 && o.canUp !== false) {
    const q = stepUp(cur);
    return { quality: q, avgMs: avg, reason: q === cur ? "既に最高" : "余裕" };
  }
  return { quality: cur, avgMs: avg, reason: "そのまま" };
}

/* ══ §B 時計（pure。now を注入する）═══════════════════════════════ */

/**
 * 再生の時計（契約書 §4 の追加分）。
 *
 * ・`start(t)` で t から動き出す。`stop()` で止まった時刻を覚える。
 * ・`time` は `base + (now() - anchor) * rate + 寄せ中の補正`。
 * ・`sync(audioTime)` が音時刻との差を詰める（DRIFT_* の規則）。
 *   返り値はその時に測った差（秒。診断・試験用）。
 * ・`set(t)`（契約書に無い追加）は「動いたまま位置だけ変える」= 再生中の seek。
 *
 * @param {{now?:():number, tolerance?:number, glide?:number, snapAt?:number}} [opts]
 *   now は **秒**を返す単調増加の関数（CONTRACT-NOTE (2)）
 * @returns {Object} Clock
 */
export function createClock(opts) {
  const o = opts || {};
  const nowFn = typeof o.now === "function" ? o.now : defaultNow;
  const tol = Math.max(0, finite(o.tolerance, DRIFT_TOL));
  const glideMin = Math.max(0.01, finite(o.glide, DRIFT_GLIDE));
  const snapAt = Math.max(tol, finite(o.snapAt, DRIFT_SNAP));

  let running = false;
  let rate = 1;
  let base = 0;        // 錨を打った時のメディア時刻（秒）
  let anchor = 0;      // 錨を打った時の壁時計（秒）
  let gl = null;       // 寄せ中の補正 { amount, from, dur }

  const wall = () => finite(nowFn(), 0);
  /** 補正を除いた素の時刻 */
  const raw = (w) => (running ? base + (w - anchor) * rate : base);

  /**
   * 寄せ中の補正の当たり具合を返し、**終わっていたら base へ畳む**。
   * 畳んだ後は 0 を返す（呼ぶ側は必ず settle → raw の順に読む。
   * 逆にすると畳んだ分を二度足す／落とす）。
   */
  function settle(w) {
    if (!gl) return 0;
    const p = gl.dur > 0 ? clamp((w - gl.from) / gl.dur, 0, 1) : 1;
    if (p >= 1) { base += gl.amount; gl = null; return 0; }
    return gl.amount * p;
  }
  function read(w) {
    const add = settle(w);
    return raw(w) + add;
  }

  return {
    /** t（省略時は今の時刻）から動き出す。返り値はその時刻 */
    start(t) {
      const w = wall();
      const at = t === undefined || t === null ? read(w) : finite(t, 0);
      gl = null; base = at; anchor = w; running = true;
      return at;
    },
    /** 止める。止まった時刻を返す */
    stop() {
      const w = wall();
      const at = read(w);
      gl = null; base = at; anchor = w; running = false;
      return at;
    },
    /** 動いたまま位置だけ変える（再生中の seek）。契約書への追加 */
    set(t) {
      const w = wall();
      gl = null; base = finite(t, 0); anchor = w;
      return base;
    },
    /** 速度を変える（今の時刻は保つ）。0 も受けるが止まるのは呼ぶ側の仕事 */
    setRate(r) {
      const w = wall();
      const at = read(w);
      gl = null; base = at; anchor = w;
      if (Number.isFinite(r)) rate = r;
      return rate;
    },
    /**
     * 音時刻へ寄せる。差が tol 以下なら何もしない（揺れ止め）。
     * @param {number} audioTime 秒 @returns {number} その時の差（audio - 自分）
     */
    sync(audioTime) {
      const a = num(audioTime);
      if (!running || a === null) return 0;
      const w = wall();
      const cur = read(w);
      const d = a - cur;
      if (Math.abs(d) <= tol) return d;
      if (Math.abs(d) > snapAt) {               // ドリフトではない = 別の位置
        gl = null; base = a; anchor = w;
        return d;
      }
      /* 途中まで当てた分を畳んでから、残りの差で寄せ直す。
         毎フレーム呼ばれるので実質「時定数 glide の一次遅れ」になり、
         行き過ぎが起きない = 振動しない。 */
      if (gl) { base = cur; anchor = w; gl = null; }
      const slew = Math.max(0.02, DRIFT_SLEW * Math.max(RATE_MIN, Math.abs(rate)));
      gl = { amount: d, from: w, dur: Math.max(glideMin, Math.abs(d) / slew) };
      return d;
    },
    get time() { return read(wall()); },
    get rate() { return rate; },
    get running() { return running; },
    /** まだ当てていない補正の残り（秒）。診断と試験用 */
    get pending() {
      if (!gl) return 0;
      const p = gl.dur > 0 ? clamp((wall() - gl.from) / gl.dur, 0, 1) : 1;
      return gl.amount * (1 - p);
    }
  };
}

/* ══ §C Transport（DOM/音/rAF を触る本体）══════════════════════════ */

/** rAF の一組（無い環境は 16ms の setTimeout。cancel と対にして取る） */
function pickRaf(d) {
  if (typeof d.raf === "function") {
    return { raf: d.raf, caf: typeof d.caf === "function" ? d.caf : () => {} };
  }
  const g = globalThis;
  if (typeof g.requestAnimationFrame === "function" && typeof g.cancelAnimationFrame === "function") {
    return { raf: (fn) => g.requestAnimationFrame(fn), caf: (id) => g.cancelAnimationFrame(id) };
  }
  return { raf: (fn) => setTimeout(fn, 16), caf: (id) => clearTimeout(id) };
}

/**
 * 再生機を作る（契約書 §4）。
 * @param {{store:Object, compositor?:Object|null, sources?:Object|null,
 *          audio?:Object|null, fps?:number,
 *          now?:():number, raf?:Function, caf?:Function}} deps
 * @returns {Object} Transport
 */
export function createTransport(deps) {
  const d = deps || {};
  const store = d.store || null;
  if (!store || typeof store.setView !== "function") {
    throw new Error("createTransport: store が要ります（契約書 §3）");
  }
  const compositor = d.compositor || null;
  const sources = d.sources || null;
  const audio = d.audio || null;
  const optFps = finite(d.fps, 0);
  const nowFn = typeof d.now === "function" ? d.now : defaultNow;
  const { raf, caf } = pickRaf(d);
  const clock = createClock({ now: nowFn });

  /* ── 状態 ─────────────────────────────────────────────────── */
  let playing = false, rate = 1, loop = false, disposed = false;
  let rangeIn = null, rangeOut = null;
  let rafId = 0, selfView = 0;
  let quality = 1, measured = 0;
  let lastFrameWall = 0, lastReleaseWall = 0, lastUpAt = -Infinity;
  let prepareAt = -Infinity;
  const renderMs = [];              // 直近の描画時間（ms）
  const gaps = [];                  // 直近のフレーム間隔（秒）
  /* 音の錨: ctx 時刻 → メディア時刻の橋 */
  let audioOn = false, aAnchor = null, aLastCtx = -1, aStall = 0;
  let soundAt = NaN, soundVal = false;
  /* 擦り（seekExact は await なので、走っている間は最後の要求だけ覚える） */
  let scrubWant = null, scrubBusy = false;
  const subs = { time: new Set(), state: new Set(), end: new Set() };
  const warned = new Set();

  function warnOnce(key, ...args) {
    if (warned.has(key)) return;    // 毎フレーム warn は害しかない
    warned.add(key);
    L.warn(key, ...args);
  }
  function tryCall(o, k, args) {
    if (!o || typeof o[k] !== "function") return undefined;
    try { return o[k].apply(o, args || []); }
    catch (e) { warnOnce(k, e); return undefined; }
  }
  function push(arr, v) {
    arr.push(v);
    if (arr.length > FRAME_WINDOW) arr.shift();
  }

  /* ── project の読み口 ─────────────────────────────────────── */
  const P = () => store.project || {};
  const S = () => P().settings || {};
  const fps = () => clamp(finite(S().fps, 0) || optFps || 30, 1, 240);
  function duration() {
    try { return Math.max(0, projectDuration(P())); }
    catch (e) { warnOnce("duration", e); return 0; }
  }
  const rangeStart = () => (rangeIn == null ? 0 : Math.max(0, rangeIn));
  function rangeEnd() {
    const dur = duration();
    if (rangeOut == null) return dur;
    const out = Math.max(0, rangeOut);
    return dur > 0 ? Math.min(out, dur) : out;
  }

  /* ── 知らせる ─────────────────────────────────────────────── */
  function emit(type, payload) {
    const set = subs[type];
    if (!set || !set.size) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); }
      catch (e) { L.error("on(" + type + ") の中で例外", e); }
    }
  }
  function stateOf() {
    return {
      playing, rate, loop, quality, fps: measured,
      time: clock.time, duration: duration(),
      range: { in: rangeIn, out: rangeOut }
    };
  }
  function timePayload(t) {
    return {
      time: t, playing, rate, quality,
      fps: measured,                 // 実測 fps（UI が出す。契約書 §7.4 の右端）
      duration: duration(), loop, drift: clock.pending
    };
  }
  /** 再生ヘッドを store へ（ui/transport.js は engine が在れば setView しない） */
  function pushPlayhead(t) {
    const cur = num(store.view && store.view.playhead);
    if (cur !== null && Math.abs(cur - t) < 1e-6) return;
    selfView++;
    try { store.setView({ playhead: Math.max(0, t) }); }
    catch (e) { warnOnce("setView", e); }
    finally { selfView--; }
  }

  /* ── 音（契約書 §13.6: 鳴っていれば ctx.currentTime が主時計）── */
  function ctxOf() { return audio && audio.ctx ? audio.ctx : null; }
  function ctxTime() {
    const c = ctxOf();
    return c ? num(c.currentTime) : null;
  }
  function ctxRunning() {
    const c = ctxOf();
    if (!c) return false;
    return c.state === undefined ? true : c.state === "running";
  }
  /** 音側に速度の口が無いので、rate 1 以外は鳴らさない（CONTRACT-NOTE (4)）*/
  function audioRateOk() {
    if (rate < 0) return false;
    if (Math.abs(rate - 1) < 1e-6) return true;
    return !!(audio && typeof audio.setRate === "function");
  }
  function anchorAudio(t) {
    const c = ctxTime();
    aAnchor = c === null ? null : { ctx: c, media: finite(t, 0), rate };
    aLastCtx = -1; aStall = 0;
  }
  function startAudio(t) {
    audioOn = false; aAnchor = null; aLastCtx = -1; aStall = 0;
    if (!audio || !audioRateOk() || typeof audio.start !== "function") return;
    if (typeof audio.setRate === "function") tryCall(audio, "setRate", [rate]);
    try { audio.start(finite(t, 0)); audioOn = true; anchorAudio(t); }
    catch (e) { warnOnce("audio.start", e); audioOn = false; }
  }
  function stopAudio() {
    audioOn = false; aAnchor = null; aLastCtx = -1; aStall = 0;
    tryCall(audio, "stop");
  }
  function seekAudio(t) {
    if (!audio) return;
    if (!audioOn) { startAudio(t); return; }
    if (typeof audio.seek === "function") {
      try { audio.seek(finite(t, 0)); anchorAudio(t); return; }
      catch (e) { warnOnce("audio.seek", e); }
    }
    stopAudio(); startAudio(t);
  }
  /** その辺りに鳴る音が在るか（0.25 秒だけ覚える。毎フレーム数えない） */
  function hasSound(t) {
    if (Number.isFinite(soundAt) && Math.abs(t - soundAt) < 0.25) return soundVal;
    soundAt = t;
    try { soundVal = (audioAt(P(), t, { fps: fps() }) || []).length > 0; }
    catch (e) { warnOnce("audioAt", e); soundVal = false; }
    return soundVal;
  }
  /**
   * 主時計として使える音の位置（秒）。使えなければ null（= performance.now）。
   */
  function audioMediaTime(t) {
    if (!audioOn || !audioRateOk() || !ctxRunning()) return null;
    const given = num(audio.mediaTime);              // 音側が出すならそれが正
    if (given !== null) return given;
    const c = ctxTime();
    if (c === null || !aAnchor) return null;
    /* ctx の時計が止まっている（Safari の suspend 等）なら壁時計へ戻る */
    if (c === aLastCtx) { if (++aStall >= 3) return null; } else { aLastCtx = c; aStall = 0; }
    if (!hasSound(t)) return null;                   // 完全な無音は §13.6 の通り
    return aAnchor.media + (c - aAnchor.ctx) * aAnchor.rate;
  }

  /* ── 描く ─────────────────────────────────────────────────── */
  function paintNow(t, q, mode) {
    if (!compositor || typeof compositor.renderFrame !== "function") return;
    try {
      const p = compositor.renderFrame(P(), t, { sources, quality: q, mode: mode || "play" });
      if (p && typeof p.catch === "function") p.catch((e) => warnOnce("render", e));
    } catch (e) { warnOnce("render", e); }
  }
  /** その時刻の絵が本当に来るまで待つ（§4 seekExact / §13.3） */
  async function exactSeek(t) {
    if (!sources || typeof sources.seekExact !== "function") return;
    let list = [];
    try { list = clipsAt(P(), t, { fps: fps() }) || []; }
    catch (e) { warnOnce("clipsAt", e); return; }
    const jobs = [];
    for (const r of list) {
      if (!r || !r.visible) continue;
      /* 素材を持つ層だけ待つ（文字・図形・調整は seek が要らない）。
         画像も通す: 初回の decode を待たないと 1 枚目が空になる。 */
      const kind = r.kind || (r.clip && r.clip.kind);
      if (kind !== "video" && kind !== "image") continue;
      try {
        const p = sources.seekExact(r);
        if (p && typeof p.then === "function") jobs.push(p);
      } catch (e) { warnOnce("seekExact", e); }   // 1 枚の失敗で他を止めない
    }
    if (!jobs.length) return;
    try { await Promise.all(jobs); } catch (e) { warnOnce("seekExact.wait", e); }
  }
  async function paintExact(t, q, mode) {
    await exactSeek(t);
    if (disposed) return;
    paintNow(t, q, mode || "scrub");
  }
  /** 擦りの画質は 1 段落とす（契約書 §4: scrub 中は quality を落とす） */
  const scrubQuality = () => stepDown(quality);

  /**
   * 擦りの実行。走っている間の要求は `scrubWant` に溜め、
   * 終わったら **最後の値**でもう一度走る（指を離した位置の絵を必ず出す）。
   */
  function runScrub() {
    if (disposed || scrubBusy || scrubWant === null) return;
    const t = scrubWant;
    scrubWant = null; scrubBusy = true;
    const done = () => {
      scrubBusy = false;
      if (!disposed && scrubWant !== null) runScrub();
    };
    let p = null;
    try { p = paintExact(t, scrubQuality(), "scrub"); }
    catch (e) { warnOnce("scrub", e); }
    if (p && typeof p.then === "function") p.then(done, done); else done();
  }
  /** 連続 scrub は 1 フレーム 1 回へ間引く（core/util.js の rafThrottle）*/
  const scrubSoon = rafThrottle(() => { runScrub(); });

  /* ── 先読みと後片付け ─────────────────────────────────────── */
  function kickPrepare(t, mode, force) {
    if (!sources || typeof sources.prepare !== "function") return;
    if (!force && Math.abs(t - prepareAt) < PREPARE_EVERY) return;
    prepareAt = t;
    try {
      const p = sources.prepare(t, { lookahead: LOOKAHEAD, mode: mode || "play" });
      if (p && typeof p.catch === "function") p.catch((e) => warnOnce("prepare", e));
    } catch (e) { warnOnce("prepare", e); }
  }

  /* ── 画質の自動追従（直近 30 フレーム。契約書 §4）───────────── */
  function autoQuality() {
    const want = pickQualityStep(renderMs, {
      fps: fps(), current: quality, previewQuality: S().previewQuality,
      canUp: nowFn() - lastUpAt > UP_COOLDOWN
    });
    if (want.quality === quality) return;
    if (want.quality > quality) lastUpAt = nowFn();
    quality = want.quality;
    renderMs.length = 0;              // 段が変わったら測り直す
    L.log("画質を " + quality + " にしました（" + want.reason + " 平均 " +
      Math.round(want.avgMs) + "ms）");
    emit("state", stateOf());
  }

  /* ── rAF ループ ───────────────────────────────────────────── */
  function schedule() {
    if (rafId || disposed || !playing) return;
    rafId = raf(frame);
  }
  function cancelFrame() {
    if (!rafId) return;
    try { caf(rafId); } catch (e) { /* 既に無い */ }
    rafId = 0;
  }
  function frame() {
    rafId = 0;
    if (disposed || !playing) return;
    const w = nowFn();
    if (lastFrameWall) push(gaps, w - lastFrameWall);
    lastFrameWall = w;
    measured = measuredFps(gaps);

    /* 1. 音に合わせる（滑らかに寄せるのは clock.sync の仕事） */
    const at = audioMediaTime(clock.time);
    if (at !== null) clock.sync(at);

    /* 2. 範囲・ループ・終端 */
    const res = wrapTime(clock.time, { start: rangeStart(), end: rangeEnd(), loop, rate });
    const t = res.time;
    if (res.ended) {
      const back = rate < 0;
      clock.set(t);
      pause();                                   // 終端で止める（契約書 §4）
      emit("end", { time: t, at: back ? "head" : "tail" });
      return;
    }
    if (res.wrapped) {                           // 折り返した → 時計と音を打ち直す
      clock.start(t);
      stopAudio(); startAudio(t);
      kickPrepare(t, rate < 0 ? "scrub" : "play", true);
    }

    /* 3. 描く（逆再生は seekExact の簡易実装。§13.6） */
    if (rate < 0) {
      scrubWant = t;
      runScrub();
    } else {
      const r0 = nowFn();
      paintNow(t, quality, "play");
      push(renderMs, (nowFn() - r0) * 1000);
      autoQuality();
    }

    /* 4. 先読みと後片付け */
    kickPrepare(t, rate < 0 ? "scrub" : "play", false);
    if (w - lastReleaseWall > RELEASE_EVERY) {
      lastReleaseWall = w;
      tryCall(sources, "releaseUnused", [t]);
    }

    /* 5. 知らせて次のフレームへ */
    pushPlayhead(t);
    emit("time", timePayload(t));
    schedule();
  }

  /* ── 操作 ─────────────────────────────────────────────────── */
  function play() {
    if (disposed || playing) return playing;
    /* iOS は「操作の中」で鳴らし始めないといけない（§13.3 / §13.6）。
       await を挟む前に解錠を通す。 */
    tryCall(sources, "unlock");
    const c = ctxOf();
    if (c && c.state === "suspended") tryCall(c, "resume");

    const f = fps(), start = rangeStart(), end = rangeEnd();
    if (!(end - start > frameDur(f) * 0.5)) {    // 再生する物が無い
      emit("end", { time: clock.time, at: "tail", empty: true });
      return false;
    }
    let t = clock.time;
    if (rate >= 0 && t >= end - 1e-4) t = start;  // 終端で押したら頭から
    else if (rate < 0 && t <= start + 1e-4) t = end;
    t = clamp(t, start, end);

    playing = true;
    renderMs.length = 0; gaps.length = 0;
    lastFrameWall = 0; lastReleaseWall = nowFn(); measured = 0;
    startAudio(t);                               // 音 → 素材 → rAF（契約書 §4）
    kickPrepare(t, rate < 0 ? "scrub" : "play", true);
    clock.start(t);
    schedule();
    emit("state", stateOf());
    return true;
  }

  /**
   * 止める。`{repaint:false}` は「この後すぐ seek するので描き直さない」
   * （コマ送りが 1 コマにつき 2 回描くのを防ぐ。契約書の pause() は引数なし）。
   */
  function pause(opts) {
    if (disposed) return false;
    const was = playing;
    cancelFrame();
    const t = clock.stop();
    playing = false;
    stopAudio();
    if (!was) return false;
    /* 止めた位置を「本物のフレーム」にする（<video> は流れていた） */
    const v = snapFrame(t, fps());
    clock.set(v);
    pushPlayhead(v);
    if (!opts || opts.repaint !== false) {
      scrubWant = v;
      runScrub();
    }
    tryCall(sources, "releaseUnused", [v]);
    emit("state", stateOf());
    emit("time", timePayload(v));
    return true;
  }

  function toggle() { return playing ? pause() : play(); }

  /** 止めて イン点（無ければ先頭）へ戻す */
  function stop() {
    pause();
    seek(rangeStart(), { scrub: false });
    return true;
  }

  function seek(t, opts) {
    if (disposed) return clock.time;
    const o = opts || {};
    const f = fps();
    const hi = duration();
    const v = snapFrame(clamp(finite(t, 0), 0, hi > 0 ? hi : 0), f);
    clock.set(v);
    pushPlayhead(v);
    if (playing) {
      seekAudio(v);
      kickPrepare(v, rate < 0 ? "scrub" : "play", true);
    } else if (o.scrub) {
      scrubWant = v;
      scrubSoon();                               // 1 フレーム 1 回へ間引く
    } else {
      scrubWant = v;
      runScrub();
      tryCall(sources, "releaseUnused", [v]);
    }
    emit("time", timePayload(v));
    return v;
  }

  function stepFrame(dir) {
    if (disposed) return clock.time;
    if (playing) pause({ repaint: false });       // この直後に seek が描く
    const f = fps();
    const step = (finite(dir, 1) < 0 ? -1 : 1) * frameDur(f);
    return seek(snapFrame(clock.time, f) + step, { scrub: false });
  }

  function setRate(r) {
    if (disposed) return rate;
    const v = clampRate(r);
    if (v === 0) { pause(); return rate; }       // 0 は「止める」（K キー）
    if (v === rate) return rate;
    rate = v;
    clock.setRate(v);
    if (playing) {
      const t = clock.time;
      stopAudio(); startAudio(t);                // 速度が変われば音は組み直し
      kickPrepare(t, rate < 0 ? "scrub" : "play", true);
    }
    emit("state", stateOf());
    return rate;
  }

  /** 逆再生（CONTRACT-NOTE (5)。ui/transport.js が在れば使う） */
  function playReverse() {
    if (disposed) return false;
    setRate(-Math.abs(rate) || -1);
    if (!playing) play();
    return rate < 0;
  }

  function setLoop(v) {
    if (disposed) return loop;
    loop = !!v;
    emit("state", stateOf());
    return loop;
  }

  function setRange(a, b) {
    if (disposed) return { in: rangeIn, out: rangeOut };
    const ia = a == null ? null : Math.max(0, finite(a, 0));
    const ob = b == null ? null : Math.max(0, finite(b, 0));
    if (ia != null && ob != null && ia > ob) { rangeIn = ob; rangeOut = ia; }
    else { rangeIn = ia; rangeOut = ob; }
    /* 画面にも出す（ui/transport.js は先に setView するので普通は空振り） */
    selfView++;
    try { store.setView({ inPoint: rangeIn, outPoint: rangeOut }); }
    catch (e) { warnOnce("setView.range", e); }
    finally { selfView--; }
    emit("state", stateOf());
    return { in: rangeIn, out: rangeOut };
  }

  function on(type, fn) {
    const key = String(type);
    const set = subs[key];
    if (!set || typeof fn !== "function") {
      warnOnce("on:" + key, 'on("time"|"state"|"end", fn) だけ受けます');
      return () => {};
    }
    set.add(fn);
    return () => { set.delete(fn); };
  }

  /* ── store の変化に付いていく ─────────────────────────────── */
  /** project が変わったら素材と音を組み替える（1 フレームに 1 回へ間引く） */
  const syncProjectSoon = rafThrottle(() => {
    if (disposed) return;
    const p = P();
    tryCall(sources, "setProject", [p]);         // CONTRACT-NOTE (6)
    tryCall(audio, "setProject", [p]);
    soundAt = NaN;                               // 音の有無は測り直す
    quality = qualityOf(S().previewQuality, quality);   // 設定で変えた画質を拾う
    const end = rangeEnd();
    if (end > 0 && clock.time > end + 1e-6) { seek(end, { scrub: false }); return; }
    if (!playing) { scrubWant = clock.time; runScrub(); return; }
    const t = clock.time;
    stopAudio(); startAudio(t);                  // clip が変わった = 音は組み直し
    kickPrepare(t, rate < 0 ? "scrub" : "play", true);
  });

  let off = store.subscribe((ev) => {
    if (disposed || !ev) return;
    if (ev.kind === "project") { syncProjectSoon(); return; }
    if (ev.kind !== "view" || selfView) return;
    const det = ev.detail || {};
    if ("inPoint" in det || "outPoint" in det) {
      const v = store.view || {};
      rangeIn = v.inPoint == null ? null : Math.max(0, finite(v.inPoint, 0));
      rangeOut = v.outPoint == null ? null : Math.max(0, finite(v.outPoint, 0));
    }
    /* 外から再生ヘッドが動いた時は時計だけ合わせる（描き直しは CONTRACT-NOTE (8)）*/
    if ("playhead" in det && !playing) {
      const t = finite(det.playhead, 0);
      if (Math.abs(t - clock.time) > 1e-6) clock.set(t);
    }
  });

  /* 起こした時の view を初期値として取り込む（開き直しの復元） */
  (function intake() {
    const v = store.view || {};
    rangeIn = v.inPoint == null ? null : Math.max(0, finite(v.inPoint, 0));
    rangeOut = v.outPoint == null ? null : Math.max(0, finite(v.outPoint, 0));
    clock.set(Math.max(0, finite(v.playhead, 0)));
    quality = qualityOf(S().previewQuality, 1);
  })();

  function dispose() {
    if (disposed) return true;                   // 二重 dispose に耐える
    disposed = true;
    cancelFrame();
    playing = false;
    try { scrubSoon.cancel(); } catch (e) { /* noop */ }
    try { syncProjectSoon.cancel(); } catch (e) { /* noop */ }
    scrubWant = null; scrubBusy = false;
    try { clock.stop(); } catch (e) { /* noop */ }
    stopAudio();                                 // 音は必ず止める（鳴り続ける事故）
    try { if (off) off(); } catch (e) { /* noop */ }
    off = null;
    subs.time.clear(); subs.state.clear(); subs.end.clear();
    L.log("transport を片付けました");
    return true;
  }

  return {
    play, pause, toggle, stop,
    seek, stepFrame, setRate, setLoop, setRange,
    playReverse, on, dispose,
    get time() { return clock.time; },
    get playing() { return playing; },
    get rate() { return rate; },
    /* 契約書に無い覗き窓（selftest.html と UI の飾り用。当てにしない） */
    get loop() { return loop; },
    get quality() { return quality; },
    get measuredFps() { return measured; },
    get range() { return { in: rangeIn, out: rangeOut }; },
    get disposed() { return disposed; },
    stats() {
      return {
        playing, rate, loop, quality, fps: measured, time: clock.time,
        duration: duration(), range: { in: rangeIn, out: rangeOut },
        audioClock: audioOn && audioRateOk(), drift: clock.pending,
        frames: gaps.length, avgRenderMs: renderMs.length
          ? Math.round(renderMs.reduce((a, b) => a + b, 0) / renderMs.length * 100) / 100 : 0
      };
    }
  };
}

export default createTransport;
