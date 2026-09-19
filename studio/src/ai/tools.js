/* ══════════════════════════════════════════════════════════════════════
   ai/tools.js — ネット不要の「自動」道具群（契約書 §6 の auto* 一式）

   ★ 何をする所か
     ・「無音カット」「ビート合わせ」「自動リフレーム」「自動カラー」
       「音量そろえ」「ダッキング」「見せ場」「チャプター」「ズーム」
       「トランジション」「テロップ枠」「隙間詰め」「尺そろえ」「フェード」。
     ・**全部が同じ形を返す**: `{ ops, summary, warnings }`。
       ops は `[{ type, payload }]` で、呼び出し側は
       `store.batch(summary, (d) => { for (const o of ops) d(o.type, o.payload); })`
       で 1 取消単位として当てられる（ui/inspector/audio.js が既にこの形）。
     ・LLM も通信も使わない。**pure**（DOM も async も乱数も Date も無い）。
       同じ project と同じ opts なら必ず同じ ops が出る（試験で固定できる）。

   ★ なぜこの形か
     ・ops を返すだけにすると、当てる/取り消す/履歴に出すの全部を store に
       任せられる。道具が project を直に書き換えると取消が壊れる。
     ・**新しく出来るクリップの id は当てられない**（ops.js が uid で振る）。
       だから「割って真ん中を消す」を素直に書くと、消したい相手を指せない。
       ここでは **元の id だけを指し続ける形**に組み替えてある:
         後ろの無音から順に「`clip.split` で切り離す → 元の id の尻を
         `clip.trim`（ripple）で詰める」。左側は必ず元の id のままなので、
         1 本の ops 配列の中で安全に何度でも触れる（§B の要）。
     ・自動の結果は **キーフレームで表現**する（ダッキング・ズーム・リフレーム）。
       後から人が掴んで直せる形でないと「AI が勝手にやった」で終わってしまう。
     ・解析（analysis/*）が無い素材でも落ちない。できない事は warnings に
       日本語で入れて、ops は空で返す（例外は投げない＝画面が止まらない）。

   ★ 触るときの注意
     ・秒は全部タイムライン秒。素材側の秒（asset.analysis の値）は必ず
       `toTimeline()` を通してから使う（speed / reverse / in を織り込む）。
     ・キーフレームの t は **clip ローカル秒**（`toLocal()`）。
     ・`clip.setSpeed` / `clip.trim` の ripple は「後ろが付いてくる」。
       総尺を変えたくない所（autoBeatSync）は `clip.roll` を使う。
     ・返す ops は **順番に意味がある**。並べ替えると壊れる。

   CONTRACT-NOTE: 共通前提は「1 ファイル 700 行で分割」だが、分割先
     （ai/tools/*.js）は担当外なので作れない。読む人のために §A〜§G の
     章立てを入れて 1 ファイルに収めた。統合担当が分けるときは章ごとに
     切り出せば import は `../core/*` `../analysis/*` のままで動く。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, clamp01, finite } from "../core/util.js";
import { MIN_CLIP, RATIOS, clipEnd, assetById } from "../core/schema.js";
import { silenceThreshold, beatTimes, buildBeatGrid, snapToBeat } from "../analysis/audio.js";
import { pickHighlights, analysisDuration, meanCurve, histogramRGB } from "../analysis/video.js";
import { parseRatio } from "../analysis/track.js";
import { captionsToClips, autoSubtitleStyle } from "./captions.js";

/* ══ §A 小道具（この中だけの約束）════════════════════════════════ */

const EPS = 1e-6;
const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const s1 = (n) => (Math.round(finite(n, 0) * 10) / 10).toFixed(1);

/** @typedef {{type:string, payload:Object}} Op */
/** @typedef {{ops:Op[], summary:string, warnings:string[]}} ToolResult */

/** 自動道具の既定値（UI のスライダーの初期値もここを見る） */
export const AUTO_DEFAULTS = Object.freeze({
  silence: { thresholdDb: -38, minDur: 0.35, pad: 0.08, ripple: true },
  beat: { divide: 1, maxShift: 0.12 },
  reframe: { ratio: "9:16", smooth: 0.8 },
  color: { strength: 1 },
  normalize: { targetLufs: -14 },
  duck: { amount: 0.7, attack: 0.15, release: 0.4 },
  highlights: { count: 5, len: 3 },
  chapters: { minGap: 8 },
  zoom: { amount: 0.08, onBeats: true },
  transitions: { style: "soft", density: 0.3 },
  fade: { in: 0.5, out: 0.5 }
});

/** 返り値の器（全部の道具がこれを通る） */
function done(ops, summary, warnings) {
  return { ops: arr(ops), summary: str(summary), warnings: arr(warnings).filter(Boolean) };
}
/** 何もできなかったとき（例外は投げない。画面は理由だけ出す） */
function nothing(reason, warnings) {
  const w = arr(warnings).slice();
  if (reason) w.unshift(str(reason));
  return done([], str(reason) || "変更はありません", w);
}
const push = (ops, type, payload) => { ops.push({ type, payload }); };

/** 速度（ramp が在るときは平均として扱う。ramp の細部は ops.js が直す） */
function speedOf(clip) {
  const sp = Math.abs(finite(clip && clip.speed, 1));
  return sp > 0.001 ? sp : 1;
}
/** 素材秒 → タイムライン秒 */
function toTimeline(clip, srcT) {
  const sp = speedOf(clip), st = finite(clip.start, 0);
  return clip.reverse ? st + (finite(clip.out, 0) - srcT) / sp : st + (srcT - finite(clip.in, 0)) / sp;
}
/** タイムライン秒 → clip ローカル秒 */
function toLocal(clip, t) {
  return clamp(finite(t, 0) - finite(clip.start, 0), 0, Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP)));
}
/** 素材秒 → clip ローカル秒 */
function localFromSource(clip, srcT) { return toLocal(clip, toTimeline(clip, srcT)); }

/** 区間を start 昇順に整え、重なり・隙間 gap 未満を繋ぐ（pure） */
function mergeSpans(spans, gap = 0) {
  const list = arr(spans)
    .map((s) => (Array.isArray(s)
      ? { start: finite(s[0], 0), end: finite(s[1], 0) }
      : { start: finite(s && s.start, 0), end: finite(s && s.end, 0) }))
    .filter((s) => s.end > s.start + 1e-9)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + Math.max(0, gap) + 1e-9) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}
/** [0,duration] から spans を抜いた残り（= 話している所）（pure） */
export function speakingSpans(spans, duration) {
  const dur = Math.max(0, finite(duration, 0));
  const sil = mergeSpans(spans).filter((s) => s.start < dur);
  const out = [];
  let cur = 0;
  for (const s of sil) {
    const a = clamp(s.start, 0, dur), b = clamp(s.end, 0, dur);
    if (a - cur > 1e-3) out.push({ start: cur, end: a });
    cur = Math.max(cur, b);
  }
  if (dur - cur > 1e-3) out.push({ start: cur, end: dur });
  return out;
}

/* ── トラックとクリップの拾い方 ─────────────────────────────── */

const isVisualKind = (k) => k === "video" || k === "image" || k === "text" || k === "shape";
const hasAudioKind = (k) => k === "video" || k === "audio";

function trackById(project, id) {
  const want = str(id);
  if (!want) return null;
  return arr(project && project.tracks).find((t) => str(t && t.id) === want) || null;
}
function sortedClips(track) {
  return arr(track && track.clips).slice().sort((a, b) => finite(a.start, 0) - finite(b.start, 0));
}
/** 一番下（配列の先頭寄り）の映像トラック */
function mainVideoTrack(project) {
  const v = arr(project && project.tracks).filter((t) => str(t.kind) === "video" && arr(t.clips).length);
  if (!v.length) return null;
  return v.slice().sort((a, b) => arr(b.clips).length - arr(a.clips).length)[0];
}
/**
 * 触る相手を決める。`clipIds`（UI の選択）が在ればそれだけ、無ければ
 * kinds に合う全部。鍵の掛かった物は黙って外す（ops が投げるので）。
 * @returns {{track:Object, clip:Object}[]}
 */
function targetClips(project, opts, kinds) {
  const o = plain(opts) || {};
  const ids = arr(o.clipIds).length ? new Set(arr(o.clipIds).map(str))
    : (arr(o.selection).length ? new Set(arr(o.selection).map(str)) : null);
  const kindSet = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
  const trackIds = arr(o.trackIds).length ? new Set(arr(o.trackIds).map(str)) : null;
  const out = [];
  for (const track of arr(project && project.tracks)) {
    if (!track || track.locked) continue;
    if (trackIds && !trackIds.has(str(track.id))) continue;
    for (const clip of sortedClips(track)) {
      if (!clip || clip.locked) continue;
      if (ids && !ids.has(str(clip.id))) continue;
      if (kindSet && !kindSet.has(str(clip.kind))) continue;
      out.push({ track, clip });
    }
  }
  return out;
}
/** その素材の解析（無ければ null） */
function analysisOf(project, clip) {
  const a = assetById(project, str(clip && clip.assetId));
  return a && plain(a.analysis) ? a.analysis : null;
}

/* ══ §B 無音カット・隙間詰め・尺そろえ・フェード ══════════════════ */

/**
 * 音量の曲線（dBFS）から無音区間を出す（pure・analysis.silence が無い素材用）。
 * `analysis/audio.js` の detectSilence と同じ規則（閾値は相対・ヒステリシス付き）。
 * @param {{hz:number, values:number[]}|number[]} loudness
 * @param {{thresholdDb?:number, minDur?:number, pad?:number, hz?:number,
 *          hysteresis?:number, relative?:boolean}} [opts]
 * @returns {{start:number,end:number}[]} 素材秒
 */
export function silenceFromLoudness(loudness, opts = {}) {
  const o = plain(opts) || {};
  const L = plain(loudness) || {};
  const values = (Array.isArray(L.values) || ArrayBuffer.isView(L.values)) ? L.values
    : (Array.isArray(loudness) || ArrayBuffer.isView(loudness) ? loudness : null);
  const hz = finite(L.hz, 0) > 0 ? finite(L.hz, 0) : finite(o.hz, 0);
  if (!values || !values.length || !(hz > 0)) return [];
  const thr = silenceThreshold(values, { thresholdDb: finite(o.thresholdDb, -38), relative: o.relative });
  const hyst = Math.max(0, finite(o.hysteresis, 2));
  const minDur = Math.max(0, finite(o.minDur, 0.35));
  const pad = Math.max(0, finite(o.pad, 0.08));
  const dur = values.length / hz;
  const runs = [];
  let from = -1;
  for (let i = 0; i < values.length; i++) {
    const db = finite(values[i], -120);
    if (from < 0) { if (db <= thr) from = i; }
    else if (db > thr + hyst) { runs.push([from / hz, i / hz]); from = -1; }
  }
  if (from >= 0) runs.push([from / hz, dur]);
  const out = [];
  for (const [a, b] of runs) {
    if (b - a < minDur - 1e-9) continue;
    const s = clamp(a + pad, 0, dur), e = clamp(b - pad, 0, dur);
    if (e - s > 1e-4) out.push({ start: s, end: e });
  }
  return out;
}

/**
 * この clip に効く無音（素材秒）を集める。opts の指定 → 解析 → 音量曲線。
 * `padded` は「もう端を詰めてある区間か」。解析済みの `analysis.silence` は
 * detectSilence が pad を引いてあるので、既定では **二重に詰めない**
 * （opts.pad を明示したときだけ更に詰める）。
 * @returns {{spans:{start:number,end:number}[], padded:boolean}}
 */
function silenceFor(project, clip, o) {
  const assetId = str(clip.assetId);
  const given = plain(o.silence) ? (o.silence[assetId] || o.silence[str(clip.id)]) : o.silence;
  if (Array.isArray(given)) return { spans: mergeSpans(given), padded: true };
  const A = analysisOf(project, clip);
  if (!A) return { spans: [], padded: false };
  if (Array.isArray(A.silence) && A.silence.length) return { spans: mergeSpans(A.silence), padded: true };
  return { spans: silenceFromLoudness(A.loudness, o), padded: true };
}

/**
 * 無音を削って詰める（契約書 §6）。
 * 後ろの無音から順に「`clip.split` で右を切り離す → 元の id の尻を
 * `clip.trim`（ripple）で詰める」形なので、1 本の ops 配列で完結する。
 * @param {Object} project
 * @param {{clipIds?:string[], thresholdDb?:number, minDur?:number, pad?:number,
 *          ripple?:boolean, silence?:Object|Array, keepPad?:number}} [opts]
 * @returns {ToolResult}
 */
export function autoCutSilence(project, opts = {}) {
  const o = plain(opts) || {};
  const ripple = o.ripple !== false;
  const minDur = Math.max(0.05, finite(o.minDur, AUTO_DEFAULTS.silence.minDur));
  const targets = targetClips(project, o, ["video", "audio"]);
  const ops = [], warnings = [];
  let cutSec = 0, spots = 0, gone = 0;
  if (!targets.length) return nothing("無音を探せるクリップがありません");

  for (const { clip } of targets) {
    const found = silenceFor(project, clip, o);
    const src = found.spans;
    if (!src.length) continue;
    /* 端に残す余白。解析済みの区間は既に詰まっているので既定では 0 */
    const pad = o.pad !== undefined && o.pad !== null
      ? Math.max(0, finite(o.pad, AUTO_DEFAULTS.silence.pad))
      : (found.padded ? 0 : AUTO_DEFAULTS.silence.pad);
    if (clip.speedRamp) warnings.push(`「${str(clip.name) || clip.id}」は速度変化が在るので位置がずれることがあります`);
    if (str(clip.linkedId)) warnings.push(`「${str(clip.name) || clip.id}」は音が分離されています（相棒は別に処理してください）`);
    const S = finite(clip.start, 0);
    /* 素材秒 → タイムライン秒（reverse だと順が逆になるので並べ直す） */
    const spans = mergeSpans(src.map((s) => {
      const a = toTimeline(clip, s.start + pad), b = toTimeline(clip, s.end - pad);
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }), 0.02).filter((s) => s.end - s.start >= minDur - 1e-9);
    if (!spans.length) continue;

    let curEnd = clipEnd(clip);
    for (let i = spans.length - 1; i >= 0; i--) {
      const a = clamp(spans[i].start, S, curEnd), b = clamp(spans[i].end, S, curEnd);
      if (b - a < minDur - 1e-9) continue;
      const head = a - S, tail = curEnd - b;
      if (head < MIN_CLIP && tail < MIN_CLIP) {          // 丸ごと無音 → クリップを消す
        push(ops, ripple ? "clip.rippleDelete" : "clip.remove", { clipId: str(clip.id) });
        cutSec += curEnd - S; spots++; gone++; curEnd = S;
        break;
      }
      if (tail < MIN_CLIP) {                             // 末尾の無音 → 尻を詰める
        push(ops, "clip.trim", { clipId: str(clip.id), edge: "end", delta: curEnd - a, ripple });
        cutSec += curEnd - a; spots++; curEnd = a;
        continue;
      }
      if (head < MIN_CLIP) {                             // 頭の無音 → 頭を詰める
        push(ops, "clip.trim", { clipId: str(clip.id), edge: "start", delta: b - S, ripple });
        cutSec += b - S; spots++;
        continue;
      }
      /* 真ん中の無音: 右を切り離して、左（元の id）の尻を詰める */
      push(ops, "clip.split", { clipId: str(clip.id), t: b, linked: false });
      push(ops, "clip.trim", { clipId: str(clip.id), edge: "end", delta: b - a, ripple });
      cutSec += b - a; spots++; curEnd = a;
    }
  }
  if (!ops.length) return nothing("カットできる無音が見つかりませんでした", warnings);
  const tail = gone ? `（${gone} 個のクリップを削除）` : "";
  return done(ops, `無音 ${spots} か所・合計 ${s1(cutSec)} 秒をカットしました${tail}`, warnings);
}

/**
 * 隙間を詰める（`timeline.magneticClose` に寄せるだけ）。
 * @param {Object} project @param {{trackIds?:string[], from?:number}} [opts]
 * @returns {ToolResult}
 */
export function removeGaps(project, opts = {}) {
  const o = plain(opts) || {};
  const from = Math.max(0, finite(o.from, 0));
  const all = arr(project && project.tracks).filter((t) => t && !t.locked);
  const ids = arr(o.trackIds).map(str).filter(Boolean);
  const tracks = ids.length ? all.filter((t) => ids.indexOf(str(t.id)) >= 0) : all;
  if (!tracks.length) return nothing("詰められるトラックがありません");
  const ops = [];
  let closed = 0;
  for (const tr of tracks) {
    let cursor = from, gap = 0;
    for (const cl of sortedClips(tr)) {
      if (clipEnd(cl) <= from + EPS) { cursor = Math.max(cursor, clipEnd(cl)); continue; }
      if (cl.start > cursor + 1e-4) gap += cl.start - cursor;
      cursor = clipEnd(cl);
    }
    if (gap > 1e-4) { push(ops, "timeline.magneticClose", { trackId: str(tr.id), from }); closed += gap; }
  }
  if (!ops.length) return nothing("詰める隙間はありませんでした");
  return done(ops, `隙間 ${s1(closed)} 秒を詰めました`, []);
}

/**
 * 長さをそろえる。`clip.trim`（ripple）で前から順に伸縮するので
 * 重なりも隙間も出ない（後ろが付いてくる）。
 * @param {Object} project
 * @param {{clipIds?:string[], trackIds?:string[], duration?:number, ripple?:boolean}} [opts]
 * @returns {ToolResult}
 */
export function evenOut(project, opts = {}) {
  const o = plain(opts) || {};
  const explicit = arr(o.clipIds).length > 0 || arr(o.selection).length > 0 || arr(o.trackIds).length > 0;
  /* 選ばずに呼ばれたら「絵のクリップ」だけ（BGM の尺まで変えると事故になる） */
  const targets = targetClips(project, o, explicit ? ["video", "image", "audio", "text", "shape"] : ["video", "image"]);
  if (targets.length < 2) return nothing("そろえるにはクリップが 2 つ以上必要です");
  const durs = targets.map((x) => Math.max(MIN_CLIP, finite(x.clip.duration, MIN_CLIP)));
  const want = finite(o.duration, 0) > 0
    ? Math.max(MIN_CLIP, finite(o.duration, 0))
    : Math.max(MIN_CLIP, Math.round((durs.reduce((a, b) => a + b, 0) / durs.length) * 100) / 100);
  const ripple = o.ripple !== false;
  const ops = [], warnings = [];
  let n = 0;
  for (const { clip } of targets) {
    const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
    const delta = D - want;
    if (Math.abs(delta) < 1e-3) continue;
    if (delta < 0 && str(clip.assetId)) {               // 伸ばす: 素材が足りるか見る
      const asset = assetById(project, str(clip.assetId));
      const lim = asset && finite(asset.duration, 0) > 0 ? finite(asset.duration, 0) : Infinity;
      const room = Number.isFinite(lim) ? (lim - finite(clip.out, 0)) / speedOf(clip) : Infinity;
      if (room < -delta - 1e-3) warnings.push(`「${str(clip.name) || clip.id}」は素材が足りず ${s1(room)} 秒しか伸ばせません`);
    }
    push(ops, "clip.trim", { clipId: str(clip.id), edge: "end", delta, ripple });
    n++;
  }
  if (!ops.length) return nothing("既に同じ長さです", warnings);
  return done(ops, `${n} 個のクリップを ${s1(want)} 秒にそろえました`, warnings);
}

/**
 * 頭と尻にフェードを付ける。音は `audioFade`、絵は **opacity のキーフレーム**
 * （後から人が掴んで直せる形にする＝契約書 §2）。
 * clipIds を渡すとその全部の両端、渡さなければ各トラックの最初と最後だけ。
 * @param {Object} project
 * @param {{clipIds?:string[], trackIds?:string[], in?:number, out?:number,
 *          audio?:boolean, video?:boolean, curve?:string}} [opts]
 * @returns {ToolResult}
 */
export function autoFadeInOut(project, opts = {}) {
  const o = plain(opts) || {};
  const fin = Math.max(0, finite(o.in, AUTO_DEFAULTS.fade.in));
  const fout = Math.max(0, finite(o.out, AUTO_DEFAULTS.fade.out));
  if (fin <= 0 && fout <= 0) return nothing("フェードの長さが 0 です");
  const picked = targetClips(project, o, null);
  const explicit = arr(o.clipIds).length > 0 || arr(o.selection).length > 0;
  /** @type {{clip:Object, head:boolean, tail:boolean}[]} */
  const jobs = [];
  if (explicit) {
    for (const { clip } of picked) jobs.push({ clip, head: true, tail: true });
  } else {
    const byTrack = new Map();
    for (const { track, clip } of picked) {
      if (!byTrack.has(track.id)) byTrack.set(track.id, []);
      byTrack.get(track.id).push(clip);
    }
    for (const list of byTrack.values()) {
      if (!list.length) continue;
      if (list.length === 1) { jobs.push({ clip: list[0], head: true, tail: true }); continue; }
      jobs.push({ clip: list[0], head: true, tail: false });
      jobs.push({ clip: list[list.length - 1], head: false, tail: true });
    }
  }
  if (!jobs.length) return nothing("フェードを付けられるクリップがありません");
  const ops = [], warnings = [];
  let n = 0;
  for (const job of jobs) {
    const clip = job.clip;
    const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
    const a = Math.min(job.head ? fin : 0, D * 0.45);
    const b = Math.min(job.tail ? fout : 0, D * 0.45);
    if (a <= 0 && b <= 0) continue;
    const kind = str(clip.kind);
    if (o.audio !== false && hasAudioKind(kind) && !clip.muteAudio) {
      const patch = {};
      if (job.head) patch.in = a;
      if (job.tail) patch.out = b;
      if (str(o.curve)) patch.curve = str(o.curve);
      push(ops, "clip.update", { clipId: str(clip.id), patch: { audioFade: patch } });
      n++;
    }
    if (o.video !== false && isVisualKind(kind)) {
      const base = clamp01(finite(clip.opacity, 1)) || 1;
      if (a > 0) {
        push(ops, "key.add", { clipId: str(clip.id), path: "opacity", t: 0, v: 0, ease: "out" });
        push(ops, "key.add", { clipId: str(clip.id), path: "opacity", t: a, v: base, ease: "linear" });
      }
      if (b > 0) {
        push(ops, "key.add", { clipId: str(clip.id), path: "opacity", t: Math.max(a + MIN_CLIP, D - b), v: base, ease: "in" });
        push(ops, "key.add", { clipId: str(clip.id), path: "opacity", t: D, v: 0, ease: "linear" });
      }
      n++;
    }
  }
  if (!ops.length) return nothing("フェードを付けられませんでした", warnings);
  return done(ops, `${n} か所にフェード（${s1(fin)}秒 / ${s1(fout)}秒）を付けました`, warnings);
}

/* ══ §C 拍に合わせる（ビート・ズーム・トランジション）════════════ */

/**
 * 拍の格子を **タイムライン秒** で出す（pure）。
 * 音楽素材の解析（analysis.beats）を、その素材を使っているクリップの
 * 位置・速度・in を通して timeline へ写す。
 * @param {Object} project
 * @param {{musicAssetId?:string, beats?:*, divide?:number}} [opts]
 * @returns {{times:number[], bpm:number, via:"opts"|"clip"|"asset"|"none"}}
 */
export function beatGridFor(project, opts = {}) {
  const o = plain(opts) || {};
  const divide = Math.round(clamp(finite(o.divide, AUTO_DEFAULTS.beat.divide), 1, 16));
  if (Array.isArray(o.beats) && o.beats.length) {
    return { times: buildBeatGrid(beatTimes(o.beats), { divide }), bpm: 0, via: "opts" };
  }
  let assetId = str(o.musicAssetId);
  let beats = null;
  if (assetId) {
    const a = assetById(project, assetId);
    const A = a && plain(a.analysis);
    if (A && plain(A.beats)) beats = A.beats;
  }
  if (!beats) {
    for (const a of arr(project && project.assets)) {
      const A = plain(a && a.analysis);
      if (A && plain(A.beats) && finite(A.beats.bpm, 0) > 0) { assetId = str(a.id); beats = A.beats; break; }
    }
  }
  if (!plain(beats)) return { times: [], bpm: 0, via: "none" };
  const bpm = finite(beats.bpm, 0);
  /* その素材を使っている一番長いクリップを「音楽クリップ」と見る */
  let host = null;
  for (const tr of arr(project && project.tracks)) {
    for (const cl of arr(tr.clips)) {
      if (str(cl.assetId) !== assetId) continue;
      if (!host || finite(cl.duration, 0) > finite(host.duration, 0)) host = cl;
    }
  }
  const until = host ? Math.max(finite(host.out, 0), 1) : 0;
  const raw = buildBeatGrid(beats, { divide, until: until || undefined });
  if (!host) return { times: raw, bpm, via: "asset" };
  const a = finite(host.in, 0), b = finite(host.out, 0);
  const times = raw.filter((t) => t >= a - 1e-9 && t <= b + 1e-9)
    .map((t) => toTimeline(host, t))
    .filter((t) => Number.isFinite(t) && t >= -1e-9)
    .sort((x, y) => x - y);
  return { times, bpm, via: "clip" };
}

/**
 * 既にあるカットを一番近い拍へ寄せる。**総尺は変わらない**
 * （`clip.roll` = 境界だけを動かし、前後のクリップで吸収する）。
 * @param {Object} project
 * @param {{trackId?:string, musicAssetId?:string, divide?:number,
 *          maxShift?:number, beats?:*}} [opts]
 * @returns {ToolResult}
 */
export function autoBeatSync(project, opts = {}) {
  const o = plain(opts) || {};
  const maxShift = Math.max(0, finite(o.maxShift, AUTO_DEFAULTS.beat.maxShift));
  const grid = beatGridFor(project, o);
  if (!grid.times.length) return nothing("拍が分からないので合わせられません（先に音楽を解析してください）");
  const track = trackById(project, o.trackId) || mainVideoTrack(project);
  if (!track) return nothing("カットの在る映像トラックがありません");
  if (track.locked) return nothing("そのトラックは鍵が掛かっています");
  const clips = sortedClips(track).filter((c) => !c.locked);
  if (clips.length < 2) return nothing("寄せられるカットがありません（クリップが 1 つだけ）");
  const ops = [], warnings = [];
  let moved = 0, sum = 0;
  for (let i = 0; i < clips.length - 1; i++) {
    const boundary = clipEnd(clips[i]);
    if (Math.abs(clips[i + 1].start - boundary) > 1e-3) continue;   // 隣り合っていない
    const target = snapToBeat(boundary, grid.times, { max: maxShift });
    const delta = target - boundary;
    if (Math.abs(delta) < 1e-3) continue;
    push(ops, "clip.roll", { clipId: str(clips[i].id), edge: "end", delta });
    moved++; sum += Math.abs(delta);
  }
  if (!ops.length) return nothing("カットは既に拍の上にありました", warnings);
  const bpm = grid.bpm > 0 ? `・BPM ${Math.round(grid.bpm)}` : "";
  return done(ops, `${moved} か所のカットを拍へ寄せました（平均 ${s1((sum / moved) * 1000)} ミリ秒${bpm}）`, warnings);
}

/**
 * ズームの「打ち込み」（拍かカット頭で一瞬寄る）。**キーフレームで表現**する。
 * @param {Object} project
 * @param {{clipIds?:string[], amount?:number, onBeats?:boolean, hold?:number,
 *          maxPerClip?:number, musicAssetId?:string, divide?:number, beats?:*}} [opts]
 * @returns {ToolResult}
 */
export function autoZoomPunch(project, opts = {}) {
  const o = plain(opts) || {};
  const amount = clamp(finite(o.amount, AUTO_DEFAULTS.zoom.amount), 0.01, 0.6);
  const hold = clamp(finite(o.hold, 0.28), 0.08, 2);
  const maxPer = Math.round(clamp(finite(o.maxPerClip, 8), 1, 40));
  const targets = targetClips(project, o, ["video", "image"]);
  if (!targets.length) return nothing("ズームを入れられるクリップがありません");
  const onBeats = o.onBeats !== false;
  const grid = onBeats ? beatGridFor(project, o) : { times: [], bpm: 0, via: "none" };
  const ops = [], warnings = [];
  if (onBeats && !grid.times.length) warnings.push("拍が分からないのでカットの頭で寄せました");
  let punches = 0;
  for (const { clip } of targets) {
    const S = finite(clip.start, 0), E = clipEnd(clip);
    const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
    const base = Math.max(0.01, finite(clip.transform && clip.transform.scale, 1));
    let times = grid.times.filter((t) => t >= S - 1e-9 && t <= E - hold * 0.5);
    if (!times.length) times = [S];
    /* 近すぎる打ち込みは間引く（連打すると酔う） */
    const picked = [];
    for (const t of times) {
      if (picked.length >= maxPer) break;
      if (picked.length && t - picked[picked.length - 1] < hold * 1.2) continue;
      picked.push(t);
    }
    for (const t of picked) {
      const l0 = toLocal(clip, t);
      const l1 = Math.min(D, l0 + hold);
      if (l1 - l0 < 0.06) continue;
      if (l0 > 0.02) push(ops, "key.add", { clipId: str(clip.id), path: "transform.scale", t: Math.max(0, l0 - 0.04), v: base, ease: "linear" });
      push(ops, "key.add", { clipId: str(clip.id), path: "transform.scale", t: l0, v: base * (1 + amount), ease: "out" });
      push(ops, "key.add", { clipId: str(clip.id), path: "transform.scale", t: l1, v: base, ease: "inout" });
      punches++;
    }
  }
  if (!ops.length) return nothing("ズームを入れられる所がありませんでした", warnings);
  return done(ops, `${punches} か所にズーム（+${Math.round(amount * 100)}%）を入れました`, warnings);
}

/** style ごとの遷移の並び（決定論。境界の番号で回す＝乱数を使わない） */
const TRANSITION_STYLES = Object.freeze({
  soft: { types: ["crossfade"], duration: 0.4 },
  punchy: { types: ["zoomIn", "whipPan", "glitch"], duration: 0.2 }
});

/**
 * 隣り合うカットへトランジションを入れる。
 * @param {Object} project
 * @param {{trackIds?:string[], style?:"soft"|"punchy", density?:number,
 *          duration?:number, types?:string[]}} [opts]
 * @returns {ToolResult}
 */
export function autoTransitions(project, opts = {}) {
  const o = plain(opts) || {};
  const styleId = str(o.style) === "punchy" ? "punchy" : "soft";
  const style = TRANSITION_STYLES[styleId];
  const types = arr(o.types).map(str).filter(Boolean).length ? arr(o.types).map(str) : style.types;
  const density = clamp(finite(o.density, AUTO_DEFAULTS.transitions.density), 0.05, 1);
  const every = Math.max(1, Math.round(1 / density));
  const duration = Math.max(0.08, finite(o.duration, style.duration));
  const ids = arr(o.trackIds).map(str).filter(Boolean);
  const tracks = arr(project && project.tracks).filter((t) => t && !t.locked
    && (ids.length ? ids.indexOf(str(t.id)) >= 0 : str(t.kind) === "video"));
  const ops = [];
  let n = 0, k = 0;
  for (const tr of tracks) {
    const clips = sortedClips(tr).filter((c) => !c.locked);
    for (let i = 0; i < clips.length - 1; i++) {
      if (Math.abs(clips[i + 1].start - clipEnd(clips[i])) > 1e-3) continue;
      if (k++ % every !== 0) continue;
      const right = clips[i + 1];
      const room = Math.min(finite(clips[i].duration, 0), finite(right.duration, 0)) * 0.5;
      const dur = Math.max(0.08, Math.min(duration, room));
      if (dur < 0.08) continue;
      push(ops, "clip.setTransition", { clipId: str(right.id), edge: "in", type: types[n % types.length], duration: dur });
      n++;
    }
  }
  if (!ops.length) return nothing("トランジションを入れられる境界がありません");
  return done(ops, `${n} か所にトランジション（${styleId === "soft" ? "やわらか" : "強め"}）を入れました`, []);
}

/* ══ §D 絵（自動リフレーム・自動カラー）══════════════════════════ */

/**
 * 「切り出し窓の中心（素材の 0..1）」→ clip.transform（pure）。
 * scale 1 = contain・x/y は画面の幅高さに対する割合で中心が原点
 * （core/eval.js §頭 と engine/canvas2d.js の約束）。
 * @param {number} px @param {number} py
 * @param {number} sourceRatio 素材の w/h @param {number} targetRatio 画面の w/h
 * @returns {{x:number, y:number, scale:number}}
 */
export function reframeTransformAt(px, py, sourceRatio, targetRatio) {
  const As = finite(sourceRatio, 16 / 9) > 0 ? finite(sourceRatio, 16 / 9) : 16 / 9;
  const At = finite(targetRatio, 9 / 16) > 0 ? finite(targetRatio, 9 / 16) : 9 / 16;
  const cw = clamp(Math.min(1, At / As), 0.05, 1);   // 窓の幅（素材の割合）
  const ch = clamp(Math.min(1, As / At), 0.05, 1);   // 窓の高さ（素材の割合）
  const scale = 1 / Math.min(cw, ch);
  const cx = clamp(finite(px, 0.5), cw / 2, 1 - cw / 2);
  const cy = clamp(finite(py, 0.5), ch / 2, 1 - ch / 2);
  /* scale 1 の絵の見た目の幅 = ch（高さ = cw）。そこから中心をずらす */
  return { x: (0.5 - cx) * scale * ch, y: (0.5 - cy) * scale * cw, scale };
}

/** 追跡結果 / 顔 / 点 のどれでも「注目点」に読み替える（track.js と同じ規則） */
function pointOf(sample) {
  const s = plain(sample);
  if (!s) return null;
  const box = plain(s.box) || (Array.isArray(s.box) ? s.box : null);
  if (box) {
    const b = Array.isArray(box)
      ? { x: finite(box[0], 0), y: finite(box[1], 0), w: finite(box[2], 0), h: finite(box[3], 0) }
      : { x: finite(box.x, 0), y: finite(box.y, 0), w: finite(box.w, 0), h: finite(box.h, 0) };
    return { x: clamp01(b.x + b.w / 2), y: clamp01(b.y + b.h / 2) };
  }
  if (Array.isArray(s.boxes) && s.boxes.length) {
    let best = null;
    for (const q of s.boxes) {
      const b = Array.isArray(q) ? { x: finite(q[0], 0), y: finite(q[1], 0), w: finite(q[2], 0), h: finite(q[3], 0) } : plain(q);
      if (!b) continue;
      const area = finite(b.w, 0) * finite(b.h, 0);
      if (!best || area > best.area) best = { x: finite(b.x, 0), y: finite(b.y, 0), w: finite(b.w, 0), h: finite(b.h, 0), area };
    }
    if (best) return { x: clamp01(best.x + best.w / 2), y: clamp01(best.y + best.h / 2) };
  }
  if (Number.isFinite(s.x) && Number.isFinite(s.y)) return { x: clamp01(s.x), y: clamp01(s.y) };
  return null;
}

/**
 * 注目点の列（`[{t, box|boxes|x,y, conf}]`）→ 滑らかな窓の動き（pure）。
 * `analysis/track.js` の autoReframeCurve が絵から作るのと同じ形を、
 * **画素の無い所（解析結果だけ在る所）** でも作れるようにした物。
 * @param {Array} samples @param {{smooth?:number}} [opts]
 * @returns {{t:number,x:number,y:number}[]}
 */
function focusCurve(samples, opts = {}) {
  const alpha = 1 - clamp(finite(opts.smooth, AUTO_DEFAULTS.reframe.smooth), 0, 0.98);
  const list = arr(samples)
    .map((s) => ({ t: finite(s && s.t, NaN), conf: Number.isFinite(s && s.conf) ? s.conf : 1, p: pointOf(s) }))
    .filter((s) => Number.isFinite(s.t) && s.p && s.conf >= 0.1)
    .sort((a, b) => a.t - b.t);
  const out = [];
  let ex = null, ey = null;
  for (const s of list) {
    if (ex === null) { ex = s.p.x; ey = s.p.y; }
    else { ex += (s.p.x - ex) * alpha; ey += (s.p.y - ey) * alpha; }
    out.push({ t: s.t, x: ex, y: ey });
  }
  return out;
}

/**
 * 自動リフレーム（縦動画化）。窓の動きを `transform.x/y/scale` の
 * **キーフレーム**へ落とす（静止なら静的な値だけ）。
 * @param {Object} project
 * @param {{ratio?:string|number, clipIds?:string[], focus?:*, smooth?:number,
 *          curve?:Array, applyRatio?:boolean, maxKeys?:number}} [opts]
 * @returns {ToolResult}
 */
export function autoReframe(project, opts = {}) {
  const o = plain(opts) || {};
  const settings = plain(project && project.settings) || {};
  const ratioId = o.ratio === undefined || o.ratio === null ? str(settings.ratio) || AUTO_DEFAULTS.reframe.ratio : o.ratio;
  const targetRatio = typeof ratioId === "number" ? parseRatio(ratioId, 9 / 16)
    : parseRatio(str(ratioId), finite(settings.width, 1920) / Math.max(1, finite(settings.height, 1080)));
  const targets = targetClips(project, o, ["video", "image"]);
  if (!targets.length) return nothing("リフレームできる映像クリップがありません");
  const maxKeys = Math.round(clamp(finite(o.maxKeys, 120), 2, 400));
  const ops = [], warnings = [];
  /* 比率そのものを変える（「縦にして」は画面の比率も変わって初めて意味が出る）。
     CONTRACT-NOTE: core/ops.js の settings.update は schema.js の RATIOS に無い
       比率で **OpError を投げる**。道具が投げる op を混ぜると store.batch が
       丸ごと巻き戻って「何も当たらない」ので、知らない比率のときは画面の比率を
       触らず、切り出し（transform）だけ合わせて warnings で申告する。 */
  if (typeof ratioId === "string" && str(ratioId) && str(ratioId) !== str(settings.ratio) && o.applyRatio !== false) {
    if (Object.prototype.hasOwnProperty.call(RATIOS, str(ratioId))) {
      push(ops, "settings.update", { patch: { ratio: str(ratioId) } });
    } else {
      warnings.push(`「${str(ratioId)}」は選べる画面比率にないので、画面はそのままで切り出しだけ合わせました`);
    }
  }
  let moving = 0;
  for (const { clip } of targets) {
    const asset = assetById(project, str(clip.assetId));
    const aw = finite(asset && asset.width, 0), ah = finite(asset && asset.height, 0);
    const sourceRatio = aw > 0 && ah > 0 ? aw / ah : finite(settings.width, 1920) / Math.max(1, finite(settings.height, 1080));
    const A = analysisOf(project, clip);
    let curve = Array.isArray(o.curve) && o.curve.length ? o.curve.map((k) => ({ t: finite(k.t, 0), x: finite(k.x, 0.5), y: finite(k.y, 0.5) })) : null;
    if (!curve) {
      const focus = o.focus !== undefined ? o.focus : (A && Array.isArray(A.faces) ? A.faces : null);
      if (Array.isArray(focus) && focus.length) curve = focusCurve(focus, o);
      else if (plain(focus)) { const p = pointOf(focus); curve = p ? [{ t: finite(clip.in, 0), x: p.x, y: p.y }] : null; }
    }
    if (!curve || !curve.length) {
      const tf = reframeTransformAt(0.5, 0.5, sourceRatio, targetRatio);
      push(ops, "clip.setTransform", { clipId: str(clip.id), transform: { x: tf.x, y: tf.y, scale: tf.scale } });
      continue;
    }
    /* 素材秒 → clip ローカル秒。clip の外の点は捨てる */
    const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
    const pts = [];
    for (const k of curve) {
      const l = localFromSource(clip, k.t);
      if (!Number.isFinite(l)) continue;
      const last = pts[pts.length - 1];
      if (last && l <= last.l + 1e-6) continue;
      pts.push({ l, x: clamp01(k.x), y: clamp01(k.y) });
    }
    if (!pts.length) continue;
    const first = reframeTransformAt(pts[0].x, pts[0].y, sourceRatio, targetRatio);
    push(ops, "clip.setTransform", { clipId: str(clip.id), transform: { x: first.x, y: first.y, scale: first.scale } });
    /* 動きが小さい所は間引く（キーを打ちすぎると人が直せない） */
    const keys = [];
    let lastX = pts[0].x, lastY = pts[0].y, lastT = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const far = Math.abs(p.x - lastX) > 0.004 || Math.abs(p.y - lastY) > 0.004;
      const edge = i === 0 || i === pts.length - 1;
      if (!edge && (!far || p.l - lastT < 0.2)) continue;
      keys.push(p); lastX = p.x; lastY = p.y; lastT = p.l;
      if (keys.length >= maxKeys) break;
    }
    if (keys.length < 2) continue;
    for (const p of keys) {
      const tf = reframeTransformAt(p.x, p.y, sourceRatio, targetRatio);
      push(ops, "key.add", { clipId: str(clip.id), path: "transform.x", t: Math.min(p.l, D), v: tf.x, ease: "inout" });
      push(ops, "key.add", { clipId: str(clip.id), path: "transform.y", t: Math.min(p.l, D), v: tf.y, ease: "inout" });
    }
    moving++;
  }
  if (!ops.length) return nothing("リフレームする所がありませんでした", warnings);
  const label = typeof ratioId === "string" && str(ratioId) ? str(ratioId) : "指定の比率";
  return done(ops, `${targets.length} 個のクリップを ${label} に合わせました（動きを追ったのは ${moving} 個）`, warnings);
}

/* ── 自動カラー（中心は pure な autoLevels）───────────────────── */

/** 立方数（8x8x8 の RGB ヒスト = 512）かどうか。小さい数は輝度ヒストと見る */
function cubeRoot(n) {
  if (!(n >= 125)) return 0;                     // 64 以下は「64 段の輝度ヒスト」扱い
  const b = Math.round(Math.cbrt(n));
  return b * b * b === n && b >= 5 && b <= 16 ? b : 0;
}
function normalizeBins(src) {
  const n = src.length;
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = Math.max(0, finite(src[i], 0)); out[i] = v; sum += v; }
  if (!(sum > 0)) return null;
  for (let i = 0; i < n; i++) out[i] /= sum;
  return out;
}
const isBins = (v) => Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));

/**
 * ヒストグラムを読む（pure）。受ける形:
 *   ・輝度の段（`[..]` / `Float32Array`。長さ 124 以下、または立方数でない物）
 *   ・`analysis/video.js` の `histogramRGB` の 8x8x8（長さ 512 等の立方数）
 *   ・`{ luma }` / `{ r, g, b }` / `{ rgb, }` / `{ hist }`
 *   ・上のどれかの **配列**（複数フレーム → 平均）
 * @param {*} hist
 * @returns {{luma:Float64Array, r:Float64Array|null, g:Float64Array|null, b:Float64Array|null}|null}
 */
export function readHistogram(hist) {
  if (!hist) return null;
  /* 複数フレームの平均 */
  if (Array.isArray(hist) && hist.length && (isBins(hist[0]) || plain(hist[0]))) {
    const parts = hist.map(readHistogram).filter(Boolean);
    if (!parts.length) return null;
    const acc = { luma: null, r: null, g: null, b: null };
    for (const key of ["luma", "r", "g", "b"]) {
      const have = parts.filter((p) => p[key] && p[key].length);
      if (!have.length) continue;
      const n = have[0][key].length;
      const sum = new Float64Array(n);
      let used = 0;
      for (const p of have) {
        if (p[key].length !== n) continue;
        for (let i = 0; i < n; i++) sum[i] += p[key][i];
        used++;
      }
      if (used) { for (let i = 0; i < n; i++) sum[i] /= used; acc[key] = sum; }
    }
    return acc.luma ? acc : null;
  }
  /* 型付き配列は plain() にも当たるので、**段の配列を先に**見る
     （ここを逆にすると Float32Array の RGB ヒストが読めなくなる） */
  if (plain(hist) && !isBins(hist)) {
    const o = hist;
    /* analysis/video.js の Frame（`{t,w,h,gray,rgb}`・rgb は w*h*3 の **生画素**）は
       その場でヒストへ落とす。autoReframe の opts.frames は Frame 列なので、
       同じ物を autoColor に渡されても「57600 段の輝度ヒスト」と読み違えない。 */
    const fw = Math.round(finite(o.w, 0)), fh = Math.round(finite(o.h, 0));
    if (isBins(o.rgb) && fw > 0 && fh > 0 && o.rgb.length === fw * fh * 3) {
      return readHistogram(histogramRGB(o.rgb));
    }
    if (o.hist !== undefined && o.hist !== null) return readHistogram(o.hist);
    if (isBins(o.rgb)) return readHistogram(o.rgb);
    const r = isBins(o.r) ? normalizeBins(o.r) : null;
    const g = isBins(o.g) ? normalizeBins(o.g) : null;
    const b = isBins(o.b) ? normalizeBins(o.b) : null;
    let luma = null;
    const l = o.luma !== undefined ? o.luma : (o.l !== undefined ? o.l : (o.gray !== undefined ? o.gray : o.values));
    if (isBins(l)) luma = normalizeBins(l);
    else if (r && g && b && r.length === g.length && g.length === b.length) {
      /* 段ごとに輝度の重みで混ぜる（画素ごとの相関は分からないので近似） */
      const n = r.length, mix = new Float64Array(n);
      for (let i = 0; i < n; i++) mix[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
      luma = normalizeBins(mix);
    }
    return luma ? { luma, r, g, b } : null;
  }
  if (!isBins(hist) || !hist.length) return null;
  const cube = cubeRoot(hist.length);
  if (!cube) { const luma = normalizeBins(hist); return luma ? { luma, r: null, g: null, b: null } : null; }
  /* 3 次元の同時ヒスト → 各チャンネルの周辺分布 + 輝度分布 */
  const b = cube;
  const r = new Float64Array(b), g = new Float64Array(b), bl = new Float64Array(b);
  const lum = new Float64Array(b * 4);
  const center = (i) => (i + 0.5) / b;
  for (let i = 0; i < hist.length; i++) {
    const v = Math.max(0, finite(hist[i], 0));
    if (!(v > 0)) continue;
    const ri = Math.floor(i / (b * b)), gi = Math.floor(i / b) % b, bi = i % b;
    r[ri] += v; g[gi] += v; bl[bi] += v;
    const y = 0.299 * center(ri) + 0.587 * center(gi) + 0.114 * center(bi);
    lum[clamp(Math.floor(y * lum.length), 0, lum.length - 1)] += v;
  }
  const luma = normalizeBins(lum);
  return luma ? { luma, r: normalizeBins(r), g: normalizeBins(g), b: normalizeBins(bl) } : null;
}

/** 段の中心（0..1）。段の数が違っても同じ意味で読めるように */
const binCenter = (i, n) => (i + 0.5) / n;

/** 累積分布の p（0..1）に当たる明るさ */
function percentileOfBins(bins, p) {
  const want = clamp01(finite(p, 0.5));
  let acc = 0;
  for (let i = 0; i < bins.length; i++) {
    const next = acc + bins[i];
    if (next >= want - 1e-12) {
      const frac = bins[i] > 0 ? (want - acc) / bins[i] : 0.5;
      return clamp01((i + clamp01(frac)) / bins.length);
    }
    acc = next;
  }
  return 1;
}
/** 段の平均（0..1） */
function meanOfBins(bins) {
  let s = 0;
  for (let i = 0; i < bins.length; i++) s += bins[i] * binCenter(i, bins.length);
  return clamp01(s);
}

/**
 * その補正を当てたら「白飛び」「黒潰れ」がどれだけ出るかを見積もる（pure）。
 * 順番は engine/gl/shaders.js の並び（露出 → コントラスト → 白黒点）と同じ。
 * @param {Float64Array|number[]} luma 合計 1 の輝度ヒスト
 * @param {{exposure?:number, contrast?:number, whites?:number, blacks?:number}} levels
 * @returns {{blown:number, crushed:number}} 0..1 の画素の割合
 */
export function levelsClipping(luma, levels) {
  const bins = isBins(luma) ? luma : [];
  const L = plain(levels) || {};
  const ev = finite(L.exposure, 0), k = finite(L.contrast, 0);
  const lo = -finite(L.blacks, 0) * 0.22, hi = 1 - finite(L.whites, 0) * 0.30;
  const den = Math.max(hi - lo, 0.05);
  const gain = Math.pow(2, ev), c1 = 1 + clamp(k, -0.95, 4);
  let blown = 0, crushed = 0;
  for (let i = 0; i < bins.length; i++) {
    const m = Math.max(0, finite(bins[i], 0));
    if (!(m > 0)) continue;
    const v = (((binCenter(i, bins.length) * gain) - 0.5) * c1 + 0.5 - lo) / den;
    if (v >= 0.998) blown += m;
    if (v <= 0.002) crushed += m;
  }
  return { blown, crushed };
}

/**
 * ヒストグラムから「当てて良い補正」を決める（**pure・試験する所**）。
 * 返す値は ColorGrade の保存単位（−1..1。ui/inspector/color.js の scale 参照）。
 * 白飛び・黒潰れが **元より増えない**（+0.5% まで）所で止める。
 * @param {*} hist readHistogram が読める形
 * @returns {{exposure:number, contrast:number, blacks:number, whites:number, temperature:number}}
 */
export function autoLevels(hist) {
  const zero = { exposure: 0, contrast: 0, blacks: 0, whites: 0, temperature: 0 };
  const h = readHistogram(hist);
  if (!h) return zero;
  const L = h.luma;
  const lo = percentileOfBins(L, 0.005);
  const p25 = percentileOfBins(L, 0.25);
  const mid = percentileOfBins(L, 0.5);
  const p75 = percentileOfBins(L, 0.75);
  const hi = percentileOfBins(L, 0.995);
  const base = levelsClipping(L, zero);

  /* ① 白点: 一番明るい所を 0.955 へ。既に飛んでいるなら触らない */
  let whites = hi >= 0.955 ? 0 : clamp((1 - hi / 0.955) / 0.30, 0, 0.6);
  if (base.blown > 0.02) whites = 0;
  /* ② 黒点: 一番暗い所を 0 へ沈める。既に潰れているなら控える */
  const lowGuard = clamp01(1 - base.crushed / 0.02);
  let blacks = -clamp(lo / 0.22, 0, 0.5) * lowGuard;
  /* ③ 露出: 中央値を 0.46 へ */
  let exposure = mid > 0.01 ? clamp(Math.log2(0.46 / mid), -0.5, 0.5) : 0.5;
  /* ④ コントラスト: 四分位の幅が狭い（眠い）ほど足す */
  const iqr = (p75 - p25) / Math.max(hi - lo, 0.05);
  let contrast = clamp((0.30 - iqr) * 1.2, -0.15, 0.3);
  /* ⑤ 色温度: 赤と青の平均をそろえる（青かぶりなら + = 暖色へ） */
  let temperature = 0;
  if (h.r && h.b) {
    const mr = meanOfBins(h.r), mb = meanOfBins(h.b);
    const den = 0.32 * (mr + mb);
    if (den > 1e-6) temperature = clamp((mb - mr) / den, -0.35, 0.35);
  }

  /* ⑥ 上限: 飛び／潰れが元より増えるなら、増やした犯人から順に弱める */
  const margin = 0.005;
  for (let i = 0; i < 24; i++) {
    const now = levelsClipping(L, { exposure, contrast, whites, blacks });
    const overBlown = now.blown - base.blown > margin;
    const overCrushed = now.crushed - base.crushed > margin;
    if (!overBlown && !overCrushed) break;
    if (overBlown) {
      if (whites > 0.005) whites *= 0.7;
      else if (exposure > 0.005) exposure *= 0.7;
      else if (contrast > 0.005) contrast *= 0.7;
      else break;
    }
    if (overCrushed) {
      if (blacks < -0.005) blacks *= 0.7;
      else if (exposure < -0.005) exposure *= 0.7;
      else if (contrast > 0.005) contrast *= 0.7;
      else break;
    }
  }
  const r3 = (v) => Math.round(clamp(finite(v, 0), -1, 1) * 1000) / 1000;
  return { exposure: r3(exposure), contrast: r3(contrast), blacks: r3(blacks), whites: r3(whites), temperature: r3(temperature) };
}

/** 明るさの曲線から「画素のヒストの代わり」を作る（近似。warnings で申告する） */
function histFromCurve(curve, a, b) {
  const c = plain(curve);
  const values = c && (Array.isArray(c.values) || ArrayBuffer.isView(c.values)) ? c.values : null;
  const hz = finite(c && c.hz, 0);
  if (!values || !values.length || !(hz > 0)) return null;
  const bins = new Float64Array(64);
  const from = Math.max(0, Math.floor(Math.max(0, finite(a, 0)) * hz));
  const to = Math.min(values.length, Math.ceil(Math.max(0, finite(b, values.length / hz)) * hz));
  let used = 0;
  for (let i = from; i < to; i++) {
    const v = clamp01(finite(values[i], 0));
    /* 1 フレームの平均を「±0.18 に広がった画素」として置く（三角の重み） */
    const half = 0.18 * bins.length;
    const c0 = v * (bins.length - 1);
    for (let j = Math.max(0, Math.floor(c0 - half)); j <= Math.min(bins.length - 1, Math.ceil(c0 + half)); j++) {
      bins[j] += Math.max(0, 1 - Math.abs(j - c0) / half);
    }
    used++;
  }
  return used ? bins : null;
}

/**
 * 自動カラー（露出・コントラスト・白黒点・色温度）。
 * @param {Object} project
 * @param {{clipIds?:string[], strength?:number, hist?:*, histByAsset?:Object,
 *          frames?:Array}} [opts]
 * @returns {ToolResult}
 */
export function autoColor(project, opts = {}) {
  const o = plain(opts) || {};
  const strength = clamp(finite(o.strength, AUTO_DEFAULTS.color.strength), 0, 2);
  const targets = targetClips(project, o, ["video", "image"]);
  if (!targets.length) return nothing("色を直せる映像クリップがありません");
  const ops = [], warnings = [];
  let guessed = 0, n = 0;
  for (const { clip } of targets) {
    const assetId = str(clip.assetId);
    const byAsset = plain(o.histByAsset) ? (o.histByAsset[assetId] || o.histByAsset[str(clip.id)]) : null;
    let hist = byAsset || o.hist || (Array.isArray(o.frames) && o.frames.length ? o.frames : null);
    const A = analysisOf(project, clip);
    let estimated = null;
    if (!hist && A) {
      estimated = histFromCurve(A.bright, finite(clip.in, 0), finite(clip.out, 0));
      if (estimated) { hist = estimated; guessed++; }
    }
    if (!hist) continue;
    const lv = autoLevels(hist);
    /* 画素のヒストが無くて曲線から見積もった時は **半分**だけ当てる
       （見積もりは分布が細いので、そのまま当てると過補正になる） */
    const k = strength * (hist === estimated ? 0.5 : 1);
    const color = {
      exposure: Math.round(lv.exposure * k * 1000) / 1000,
      contrast: Math.round(lv.contrast * k * 1000) / 1000,
      blacks: Math.round(lv.blacks * k * 1000) / 1000,
      whites: Math.round(lv.whites * k * 1000) / 1000,
      temperature: Math.round(lv.temperature * k * 1000) / 1000
    };
    /* 彩度は「眠い素材だけ」少し足す（濃い素材を更に濃くしない） */
    if (A && A.sat) {
      const satMean = meanCurve(A.sat, finite(clip.in, 0), finite(clip.out, 0), null);
      if (satMean !== null && satMean < 0.34) color.saturation = Math.round(clamp((0.34 - satMean) * 0.8, 0, 0.2) * k * 1000) / 1000;
    }
    const biggest = Math.max.apply(null, Object.keys(color).map((k) => Math.abs(color[k])));
    if (!(biggest > 0.005)) continue;
    push(ops, "clip.setColor", { clipId: str(clip.id), color });
    n++;
  }
  if (guessed) warnings.push("画素のヒストグラムが無いので明るさの曲線から見積もりました（フレームを解析すると精度が上がります）");
  if (!ops.length) return nothing("色を直す必要はなさそうです", warnings);
  return done(ops, `${n} 個のクリップの色を自動で整えました`, warnings);
}

/* ══ §E 音（音量そろえ・ダッキング）══════════════════════════════ */

/**
 * 音量曲線（dBFS 相当）から「体感の音量」を 1 つの数にする（pure）。
 * 静かな所を捨てる **ゲート付きのエネルギー平均**（LUFS の代わりの近似）。
 * @param {{hz:number, values:number[]}|number[]} loudness
 * @param {{gate?:number, floor?:number}} [opts]
 * @returns {number|null} dBFS 相当。分からなければ null
 */
export function measureLoudness(loudness, opts = {}) {
  const o = plain(opts) || {};
  const L = plain(loudness) || {};
  const values = (Array.isArray(L.values) || ArrayBuffer.isView(L.values)) ? L.values
    : (Array.isArray(loudness) || ArrayBuffer.isView(loudness) ? loudness : null);
  if (!values || !values.length) return null;
  let peak = -Infinity;
  for (let i = 0; i < values.length; i++) { const v = finite(values[i], -120); if (v > peak) peak = v; }
  if (!Number.isFinite(peak) || peak <= -119) return null;
  const gate = Math.max(peak - Math.max(0, finite(o.gate, 30)), finite(o.floor, -60));
  let sum = 0, n = 0;
  for (let i = 0; i < values.length; i++) {
    const db = finite(values[i], -120);
    if (db < gate) continue;
    sum += Math.pow(10, db / 10); n++;
  }
  if (!n) return null;
  return 10 * Math.log10(sum / n);
}

/** BGM らしいトラック（名前 → 一番長い音トラック） */
function musicTrackOf(project) {
  const audio = arr(project && project.tracks).filter((t) => t && str(t.kind) === "audio" && arr(t.clips).length);
  if (!audio.length) return null;
  const named = audio.find((t) => /bgm|music|音楽|曲/i.test(str(t.name)));
  if (named) return named;
  const total = (t) => arr(t.clips).reduce((a, c) => a + Math.max(0, finite(c.duration, 0)), 0);
  return audio.slice().sort((a, b) => total(b) - total(a))[0];
}

/**
 * 音量をそろえる（目標 LUFS 相当へ clip.volume を合わせる）。
 * @param {Object} project
 * @param {{trackIds?:string[], clipIds?:string[], targetLufs?:number, target?:number,
 *          maxBoostDb?:number}} [opts]
 * @returns {ToolResult}
 */
export function autoNormalize(project, opts = {}) {
  const o = plain(opts) || {};
  const target = finite(o.targetLufs !== undefined ? o.targetLufs : o.target, AUTO_DEFAULTS.normalize.targetLufs);
  const maxBoost = Math.max(0, finite(o.maxBoostDb, 12));
  const targets = targetClips(project, o, ["video", "audio"]);
  if (!targets.length) return nothing("音のあるクリップがありません");
  const ops = [], warnings = [];
  const missing = [];
  let n = 0, sumDb = 0;
  for (const { track, clip } of targets) {
    if (track.muted || clip.muteAudio) continue;
    const A = analysisOf(project, clip);
    const measured = measureLoudness(A && A.loudness);
    if (measured === null) { missing.push(str(clip.name) || str(clip.id)); continue; }
    const rawDb = target - measured;
    const db = clamp(rawDb, -24, maxBoost);
    const vol = Math.round(clamp(Math.pow(10, db / 20), 0.05, 4) * 1000) / 1000;
    if (Math.abs(vol - finite(clip.volume, 1)) < 0.02) continue;
    push(ops, "clip.update", { clipId: str(clip.id), patch: { volume: vol } });
    n++; sumDb += db;
    if (rawDb > maxBoost + 0.5) warnings.push(`「${str(clip.name) || clip.id}」は小さすぎるので +${Math.round(maxBoost)}dB で止めました`);
  }
  if (missing.length) warnings.push(`${missing.length} 個のクリップは音の解析が無いので触りませんでした`);
  if (!ops.length) return nothing("音量は既にそろっています", warnings);
  return done(ops, `${n} 個のクリップの音量を ${s1(target)} LUFS 目安にそろえました（平均 ${sumDb / n >= 0 ? "+" : ""}${s1(sumDb / n)}dB）`, warnings);
}

/** その clip の「声が鳴っている区間」（タイムライン秒）を出す */
function voiceSpansOf(project, clip) {
  const S = finite(clip.start, 0), E = clipEnd(clip);
  const A = analysisOf(project, clip);
  const asset = assetById(project, str(clip.assetId));
  const srcDur = Math.max(finite(asset && asset.duration, 0), A ? analysisDuration(A) : 0, finite(clip.out, 0));
  /** @type {{start:number,end:number}[]} */
  let src = [];
  let via = "clip";
  if (A && Array.isArray(A.speech) && A.speech.length) {
    src = A.speech.filter((s) => !Number.isFinite(s && s.conf) || s.conf >= 0.4);
    via = "speech";
  } else if (A && Array.isArray(A.silence) && A.silence.length && srcDur > 0) {
    src = speakingSpans(A.silence, srcDur);
    via = "silence";
  } else {
    return { spans: [{ start: S, end: E }], via };
  }
  const spans = mergeSpans(src.map((s) => {
    const a = toTimeline(clip, finite(s.start, 0)), b = toTimeline(clip, finite(s.end, 0));
    return { start: clamp(Math.min(a, b), S, E), end: clamp(Math.max(a, b), S, E) };
  }));
  return { spans, via };
}

/**
 * BGM に **音量のキーフレーム**を打って、声の所だけ下げる（ダッキング）。
 * キーで表すので後から人が掴んで直せる（契約書 §2 の狙い）。
 * @param {Object} project
 * @param {{musicTrackId?:string, voiceTrackIds?:string[], amount?:number,
 *          attack?:number, release?:number, voiceSpans?:Array}} [opts]
 * @returns {ToolResult} v は必ず 0..1 に収まる
 */
export function autoDuck(project, opts = {}) {
  const o = plain(opts) || {};
  const amount = clamp(finite(o.amount, AUTO_DEFAULTS.duck.amount), 0.05, 0.95);
  const attack = clamp(finite(o.attack, AUTO_DEFAULTS.duck.attack), 0.02, 2);
  const release = clamp(finite(o.release, AUTO_DEFAULTS.duck.release), 0.02, 4);
  const music = trackById(project, o.musicTrackId) || musicTrackOf(project);
  if (!music) return nothing("BGM のトラックが見つかりません");
  if (music.locked) return nothing("BGM のトラックは鍵が掛かっています");
  const warnings = [];
  /* 声のトラック: 指定 → 残りの音トラックと音を持つ映像トラック */
  const ids = arr(o.voiceTrackIds).map(str).filter(Boolean);
  const voiceTracks = arr(project && project.tracks).filter((t) => {
    if (!t || str(t.id) === str(music.id) || !arr(t.clips).length) return false;
    if (ids.length) return ids.indexOf(str(t.id)) >= 0;
    return (str(t.kind) === "audio" || str(t.kind) === "video") && !t.muted;
  });
  let regions = [];
  if (Array.isArray(o.voiceSpans) && o.voiceSpans.length) regions = mergeSpans(o.voiceSpans);
  else {
    let guessed = 0, silentKinds = 0;
    for (const tr of voiceTracks) {
      for (const cl of sortedClips(tr)) {
        if (cl.muteAudio) continue;
        /* 声を持ち得ない物を「声」と見なしてはいけない（静止画の上で BGM が
           下がったままになる）。映像トラックには image / text / shape も乗る。 */
        if (!hasAudioKind(str(cl.kind))) { silentKinds++; continue; }
        const src = assetById(project, str(cl.assetId));
        if (src && src.hasAudio === false) { silentKinds++; continue; }
        const v = voiceSpansOf(project, cl);
        if (v.via === "clip") guessed++;
        regions = regions.concat(v.spans);
      }
    }
    if (guessed) warnings.push(`${guessed} 個のクリップは声の解析が無いので全体を声と見なしました`);
    if (silentKinds) warnings.push(`${silentKinds} 個のクリップは音を持たないので声として数えませんでした`);
  }
  regions = mergeSpans(regions, attack + release);
  if (!regions.length) return nothing("下げる所（声）が見つかりません", warnings);

  const ops = [];
  let n = 0;
  for (const clip of sortedClips(music)) {
    if (clip.locked) continue;
    const S = finite(clip.start, 0), E = clipEnd(clip);
    const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
    let base = finite(clip.volume, 1);
    if (base > 1) { warnings.push(`「${str(clip.name) || clip.id}」の音量が 1 を超えているので 1 として扱いました`); base = 1; }
    base = clamp01(base) || 1;
    const ducked = clamp01(base * (1 - amount));
    /** @type {{t:number, v:number, ease:string}[]} */
    const keys = [];
    for (const r of regions) {
      if (r.end <= S + 1e-6 || r.start >= E - 1e-6) continue;
      const a = Math.max(r.start, S), b = Math.min(r.end, E);
      const t1 = toLocal(clip, a), t2 = toLocal(clip, b);
      const t0 = Math.max(0, t1 - attack), t3 = Math.min(D, t2 + release);
      if (t0 > 1e-3) keys.push({ t: t0, v: base, ease: "inout" });
      keys.push({ t: t1, v: ducked, ease: "inout" });
      keys.push({ t: Math.max(t1, t2), v: ducked, ease: "inout" });
      if (t3 < D - 1e-3) keys.push({ t: t3, v: base, ease: "inout" });
      else keys.push({ t: D, v: ducked, ease: "inout" });
    }
    if (!keys.length) continue;
    /* 頭と尻を素の音量で押さえる（キーが在る path は静的な値を見なくなるので） */
    if (keys[0].t > 1e-3) keys.unshift({ t: 0, v: base, ease: "inout" });
    keys.sort((x, y) => x.t - y.t);
    let last = -1;
    for (const k of keys) {
      if (k.t - last < 1 / 120) continue;                       // 近すぎるキーは 1 つに
      last = k.t;
      push(ops, "key.add", {
        clipId: str(clip.id), path: "volume",
        t: Math.round(k.t * 1000) / 1000, v: Math.round(clamp01(k.v) * 10000) / 10000, ease: k.ease
      });
    }
    n++;
  }
  if (!ops.length) return nothing("BGM と声が重なっていません", warnings);
  return done(ops, `BGM を ${n} 個・${regions.length} か所で ${Math.round(amount * 100)}% 下げました`, warnings);
}

/* ══ §F 見せ場・チャプター・テロップ枠 ═══════════════════════════ */

/** その素材を使っている一番長いクリップ（素材秒 → タイムライン秒 の足がかり） */
function hostClipOf(project, assetId) {
  let host = null;
  for (const tr of arr(project && project.tracks)) {
    for (const cl of arr(tr.clips)) {
      if (str(cl.assetId) !== str(assetId)) continue;
      if (!host || finite(cl.duration, 0) > finite(host.duration, 0)) host = cl;
    }
  }
  return host;
}

/**
 * 見せ場を拾う（`analysis/video.js` の pickHighlights を素材から呼ぶ）。
 * ranges は **素材秒**。タイムライン上に置けるときは印（marker）の ops も返す。
 * @param {Object} project
 * @param {{assetId?:string, count?:number, len?:number, want?:number, minGap?:number}} [opts]
 * @returns {{ops:Op[], ranges:Array, summary:string, warnings:string[]}}
 */
export function autoHighlights(project, opts = {}) {
  const o = plain(opts) || {};
  const count = Math.round(clamp(finite(o.count, AUTO_DEFAULTS.highlights.count), 1, 40));
  const len = Math.max(0.2, finite(o.len !== undefined ? o.len : o.want, AUTO_DEFAULTS.highlights.len));
  let assetId = str(o.assetId);
  let asset = assetId ? assetById(project, assetId) : null;
  if (!asset) {
    asset = arr(project && project.assets).find((a) => plain(a && a.analysis) && str(a.kind) !== "audio") || null;
    assetId = str(asset && asset.id);
  }
  const A = asset && plain(asset.analysis) ? asset.analysis : null;
  if (!A) { const r = nothing("解析済みの素材がないので見せ場を選べません"); return { ops: r.ops, ranges: [], summary: r.summary, warnings: r.warnings }; }
  const ranges = pickHighlights(A, { count, want: len, minGap: finite(o.minGap, len * 0.6) });
  const warnings = [];
  const ops = [];
  if (!ranges.length) warnings.push("見せ場として選べる長さがありませんでした");
  const host = hostClipOf(project, assetId);
  if (host) {
    /* ranges は **素材の全体**から選ぶ（呼び出し側が「どこを使うか」決める材料）。
       印はタイムライン上の話なので、**その素材を使っているクリップが見ている
       範囲（in..out）** に入る見せ場だけに付ける。外の秒を素直に写すと、
       クリップの外（空っぽの所）へ印が飛ぶ。 */
    const lo = Math.min(finite(host.in, 0), finite(host.out, 0));
    const hi = Math.max(finite(host.in, 0), finite(host.out, 0));
    const tail = clipEnd(host);
    let i = 0, skipped = 0;
    for (const r of ranges) {
      const s = finite(r.start, 0);
      if (s < lo - 1e-6 || s > hi + 1e-6) { skipped++; continue; }
      const t = toTimeline(host, s);
      if (!(t >= 0) || t > tail + 1e-6) { skipped++; continue; }
      i++;
      push(ops, "marker.add", { t, name: `見せ場 ${i}`, color: "#ffcc00", note: str(r.why) });
    }
    if (skipped) warnings.push(`${skipped} か所はタイムラインで使っていない所なので印は付けませんでした`);
  } else if (ranges.length) {
    warnings.push("この素材はまだタイムラインに無いので印は付けませんでした");
  }
  const sum = ranges.length
    ? `見せ場を ${ranges.length} か所（各 ${s1(len)} 秒）選びました`
    : "見せ場が見つかりませんでした";
  return { ops, ranges, summary: sum, warnings };
}

/**
 * チャプターを打つ（カットの頭 / 印 を minGap 秒以上の間隔で拾う）。
 * 題は重なっているテロップの 1 行目（無ければ連番）。
 * @param {Object} project @param {{minGap?:number, trackId?:string, max?:number}} [opts]
 * @returns {ToolResult}
 */
export function autoChapters(project, opts = {}) {
  const o = plain(opts) || {};
  const minGap = Math.max(1, finite(o.minGap, AUTO_DEFAULTS.chapters.minGap));
  const max = Math.round(clamp(finite(o.max, 60), 1, 200));
  const track = trackById(project, o.trackId) || mainVideoTrack(project);
  if (!track) return nothing("チャプターを打てる映像トラックがありません");
  const cand = sortedClips(track).map((c) => finite(c.start, 0));
  for (const m of arr(project && project.markers)) cand.push(Math.max(0, finite(m.t, 0)));
  cand.push(0);
  cand.sort((a, b) => a - b);
  /* テロップ（text クリップ）を題に使う */
  const texts = [];
  for (const tr of arr(project && project.tracks)) {
    for (const cl of arr(tr.clips)) {
      if (str(cl.kind) !== "text") continue;
      const content = str(cl.text && cl.text.content).split("\n")[0].trim();
      if (content) texts.push({ start: finite(cl.start, 0), end: clipEnd(cl), content });
    }
  }
  const have = arr(project && project.chapters).map((c) => finite(c.t, 0));
  const ops = [];
  let last = -Infinity, n = 0;
  for (const t of cand) {
    if (t - last < minGap - 1e-6) continue;
    if (have.some((x) => Math.abs(x - t) < 0.5)) { last = t; continue; }
    last = t;
    n++;
    const hit = texts.find((x) => x.start <= t + 0.5 && x.end > t + 0.01);
    push(ops, "chapter.add", { t, title: hit ? hit.content.slice(0, 40) : `チャプター ${n}` });
    if (ops.length >= max) break;
  }
  if (!ops.length) return nothing("チャプターを打てる区切りがありませんでした");
  return done(ops, `チャプターを ${ops.length} 個打ちました（${s1(minGap)} 秒以上の間隔）`, []);
}

/** テロップの置き先（既にある overlay → 無ければ 1 本足す） */
function telopTarget(project, o, from, to) {
  const given = trackById(project, o.textTrackId || o.overlayTrackId);
  if (given) return { trackId: str(given.id), addTrack: false };
  for (const tr of arr(project && project.tracks)) {
    if (!tr || str(tr.kind) !== "overlay" || tr.locked) continue;
    const busy = arr(tr.clips).some((c) => clipEnd(c) > from + EPS && finite(c.start, 0) < to - EPS);
    if (!busy) return { trackId: str(tr.id), addTrack: false };
  }
  return { trackId: null, addTrack: true };
}

/**
 * 話の区切りごとに **空のテロップ枠**を置く（文字は人か transcribe が入れる）。
 * @param {Object} project
 * @param {{trackId?:string, textTrackId?:string, style?:Object, minDur?:number,
 *          maxDur?:number, pad?:number, silence?:Object|Array}} [opts]
 * @returns {ToolResult}
 */
export function autoTelopFromSilence(project, opts = {}) {
  const o = plain(opts) || {};
  const minDur = Math.max(MIN_CLIP, finite(o.minDur, 0.6));
  const maxDur = Math.max(minDur, finite(o.maxDur, 6));
  const source = trackById(project, o.trackId);
  const pool = source ? [source] : arr(project && project.tracks).filter((t) => t && (str(t.kind) === "audio" || str(t.kind) === "video"));
  const warnings = [];
  let spans = [];
  for (const tr of pool) {
    for (const clip of sortedClips(tr)) {
      const sil = silenceFor(project, clip, o).spans;
      if (!sil.length) continue;
      const asset = assetById(project, str(clip.assetId));
      const A = analysisOf(project, clip);
      const srcDur = Math.max(finite(asset && asset.duration, 0), A ? analysisDuration(A) : 0, finite(clip.out, 0));
      for (const s of speakingSpans(sil, srcDur)) {
        const a = toTimeline(clip, s.start), b = toTimeline(clip, s.end);
        const lo = Math.max(Math.min(a, b), finite(clip.start, 0)), hi = Math.min(Math.max(a, b), clipEnd(clip));
        if (hi - lo > 1e-3) spans.push({ start: lo, end: hi });
      }
    }
  }
  spans = mergeSpans(spans, 0.08).filter((s) => s.end - s.start >= minDur);
  if (!spans.length) return nothing("話している区間が分かりません（先に音を解析してください）", warnings);
  /* 長すぎる区間は等分して読める尺にする */
  const cut = [];
  for (const s of spans) {
    const len = s.end - s.start;
    const parts = Math.max(1, Math.ceil(len / maxDur));
    for (let i = 0; i < parts; i++) cut.push({ start: s.start + (len * i) / parts, end: s.start + (len * (i + 1)) / parts });
  }
  /* 既定は画面の寸法から決めた「読める」様式（defaultTextStyle は縁取りが 0 なので
     白い絵の上で消える。テロップは読めて初めて意味が在る） */
  const style = plain(o.style) || plain(project && project.subtitleStyle) || autoSubtitleStyle(project);
  const dest = telopTarget(project, o, cut[0].start, cut[cut.length - 1].end);
  const ops = [];
  if (dest.addTrack) {
    push(ops, "track.add", { kind: "overlay", name: str(o.name) || "テロップ" });
    warnings.push("テロップ用のトラックを 1 本足しました");
  }
  for (const s of cut) {
    const payload = {
      at: s.start, mode: "overwrite",
      clip: { kind: "text", name: "テロップ", start: s.start, duration: Math.max(MIN_CLIP, s.end - s.start), text: { content: "", style } }
    };
    if (dest.trackId) payload.trackId = dest.trackId;
    push(ops, "clip.add", payload);
  }
  return done(ops, `テロップ枠を ${cut.length} 個置きました（空の枠。文字は後から入れられます）`, warnings);
}

/**
 * 契約書 §6 の名前。字幕（captions）が在ればそれを置き、無ければ
 * 無音から空の枠を置く（変換は `ai/captions.js` に任せる）。
 * @param {Object} project
 * @param {{captions?:Array, trackId?:string, textTrackId?:string, style?:Object,
 *          maxCharsPerLine?:number, maxLines?:number, offset?:number}} [opts]
 * @returns {ToolResult}
 */
export function autoSubtitleFromSpeech(project, opts = {}) {
  const o = plain(opts) || {};
  if (!Array.isArray(o.captions) || !o.captions.length) return autoTelopFromSilence(project, o);
  const warnings = [];
  const dest = telopTarget(project, o, 0, Infinity);
  const ops = [];
  if (dest.addTrack) {
    push(ops, "track.add", { kind: "overlay", name: str(o.name) || "字幕" });
    warnings.push("字幕用のトラックを 1 本足しました");
  }
  const style = plain(o.style) || plain(project && project.subtitleStyle) || autoSubtitleStyle(project);
  const made = captionsToClips(o.captions, Object.assign({}, o, {
    style, trackId: dest.trackId || undefined, project
  }));
  for (const op of arr(made)) ops.push(op);
  if (!ops.length) return nothing("置ける字幕がありませんでした", warnings);
  return done(ops, `字幕を ${made.length} 個のクリップで置きました`, warnings);
}
