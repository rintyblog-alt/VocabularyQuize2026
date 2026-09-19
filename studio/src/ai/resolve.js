/* ══════════════════════════════════════════════════════════════════════
   ai/resolve.js — Plan（意味）を 実タイムライン（秒とフレーム）に落とす所

   ★ 何をする所か
     `resolvePlan(plan, { project, assets, beats, fps })` →
     `{ ops, summary, warnings }`。ops は core/ops.js の型どおりの
     `{type, payload}` の配列で、そのまま
     `store.batch("AI 自動編集", (d) => ops.forEach(o => d(o.type, o.payload)))`
     で当てられる（契約書 §12-4）。

   ★ なぜこの形か
     ・**秒とフレームを決めるのは この 1 か所だけ**（契約書 §6）。planner と
       LLM は「何秒くらい見せたいか」しか言わない。素材の端・最短尺・拍の位置・
       フレーム丸めが絡む計算を 2 か所に置くと、必ず片方だけ直して黙ってずれる。
     ・**pure・決定論**。乱数も Date.now も DOM も使わない。同じ入力なら必ず
       同じ ops（試験で固定できる／ユーザーが「やり直し」で驚かない）。
     ・クリップは **端をぴったり合わせて**並べる（= 隙間 0）。
       CONTRACT-NOTE: 担当の指示は「遷移の重なりを確保するため start を詰める」
       だったが、実物の core は
         ・同一トラックの clip は重なれない（ops.tidyTrack が前のクリップを
           切ってしまう。契約書 §1 の不変条件 1）
         ・core/eval.js の `transitionAt` は **隙間 1ms 以内で隣り合う**
           クリップの間に遷移を出す（重なりは要らない。`contiguous()`）
       ので、重ねると遷移が消えるどころか素材が削れる。よって「端を合わせて
       並べ、遷移は transitionIn の長さで表す」形にした（契約の意図と同じ絵が
       出る）。長さは ops/schema が `min(自分, 隣) / 2` に収める。

   ★ 触るときの注意
     ・尺は必ず `frameRound` / `frameFloor` を通す（cursor を足し算で進めるので、
       どれか 1 つが半端だと以降の全クリップがフレームから外れる）。
     ・素材の端を越えない: `out <= asset.duration`（§1-2）。越えると schema の
       validate が error を出す。`maxTl` がその見張り。
     ・テロップは overlay トラック 1 本に並べるので **重ねられない**。
       近すぎるテロップは隙間まで縮め、0.5 秒も取れないなら出さない。
     ・ops を足すときは「トラックを作る op」を必ず先に積む（clip.add は
       trackId が在る前提）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite } from "../core/util.js";
import { snapFrame, frameDur } from "../core/time.js";
import { MIN_CLIP, MAX_TRACKS, RATIOS } from "../core/schema.js";
import { pickBestRange, analysisDuration } from "../analysis/video.js";
import { roleSpec, pickTemplate, templateDefaults } from "./templates.js";

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** テロップの最短の見せ時間（契約の指定） */
export const MIN_TEXT = 1.2;
/** これより短くしか出せないテロップは出さない */
export const DROP_TEXT = 0.5;
/** 役ごとのテロップの既定の長さ（秒。隣と近ければ縮む） */
export const TEXT_WANT = Object.freeze({ title: 2.6, caption: 2, lower: 2.4, end: 1.6 });
/** 遷移の既定の長さ（秒）。crossfade 0.3 は契約の指定 */
export const TRANSITION_DUR = Object.freeze({
  cut: 0, crossfade: 0.3, whipPan: 0.25, zoomIn: 0.3, glitch: 0.2, slide: 0.3
});
/** ダッキング（声の所で BGM を下げる）の深さと前後の傾き */
export const DUCK = Object.freeze({ amount: 0.35, pre: 0.25, post: 0.35, join: 0.25, maxWindows: 12 });
/** BGM の出入り（秒） */
export const MUSIC_FADE = Object.freeze({ in: 0.8, out: 1.2 });

/** テンポの日本語（summary に出す） */
const PACING_LABEL = Object.freeze({ slow: "ゆっくり", medium: "標準テンポ", fast: "速め", beat: "ビート同期" });

/* ══ §A 小道具（pure）════════════════════════════════════════════ */

/** 素材の尺（静止画は 0 = 尺は clip 側が決める。契約書 §1） */
function assetDur(asset) {
  const a = plain(asset) || {};
  const d = finite(a.duration, 0);
  return d > 0 ? d : Math.max(0, analysisDuration(a.analysis));
}

/** 6 桁で丸める（0.30000000000000004 を保存形式へ漏らさない） */
function r6(v) { return Math.round(finite(v, 0) * 1e6) / 1e6; }

/** ops の payload の数値を丸める（**再帰**。配列も辿る） */
function roundDeep(v) {
  if (typeof v === "number") return r6(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  const o = plain(v);
  if (!o) return v;
  const out = {};
  for (const k of Object.keys(o)) out[k] = roundDeep(o[k]);
  return out;
}

/** まだ使われていない id を作る（**決定論**。uid は乱数なので使えない） */
function freeId(prefix, used) {
  let id = prefix, n = 1;
  while (used.has(id)) { n++; id = `${prefix}_${n}`; }
  used.add(id);
  return id;
}

/**
 * 拍の並びを均す（pure）。時刻は昇順・重複なし。
 * @param {*} beats { bpm, offset, times, downbeats } 相当。
 *   **時刻の配列だけ**（`analysis.beats.times` をそのまま）渡されても受ける
 *   （呼び手が 1 段掘り忘れて「音ハメにならない」と黙って外れるのを防ぐ）。
 * @returns {{bpm:number, offset:number, times:number[], downbeats:number[], period:number}|null}
 */
export function normalizeBeats(beats) {
  const b = Array.isArray(beats) ? { times: beats } : plain(beats);
  if (!b) return null;
  /* `finite(t, NaN)` は読めない値を **0 に倒す**（fallback が NaN なので 0 になる）。
     それだと "x" や null が「0 秒の拍」として残り、頭出し（最初の downbeat）と
     吸着の目安を狂わせる。ここは Number で見て、読めない物は落とす。 */
  const nums = (list) => arr(list)
    .map((t) => (typeof t === "number" ? t : typeof t === "string" && t.trim() ? Number(t) : NaN))
    .filter((t) => Number.isFinite(t) && t >= 0)
    .sort((x, y) => x - y);
  const times = nums(b.times);
  const downs = nums(b.downbeats);
  const bpm = finite(b.bpm, 0);
  let period = bpm >= 40 && bpm <= 240 ? 60 / bpm : 0;
  if (!period && times.length >= 3) {
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    gaps.sort((x, y) => x - y);
    period = gaps[Math.floor(gaps.length / 2)] || 0;
  }
  if (!times.length && !downs.length) return null;
  return { bpm, offset: finite(b.offset, 0), times, downbeats: downs, period: period > 0.05 ? period : 0.5 };
}

/**
 * t に一番近い拍（許容 tol の外なら null）。pure・二分探索。
 * @param {number[]} grid 昇順の時刻 @param {number} t @param {number} tol
 * @returns {number|null}
 */
export function nearestBeat(grid, t, tol) {
  const g = arr(grid);
  if (!g.length) return null;
  let lo = 0, hi = g.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (g[mid] < t) lo = mid + 1; else hi = mid; }
  let best = g[lo], bd = Math.abs(g[lo] - t);
  if (lo > 0 && Math.abs(g[lo - 1] - t) < bd) { best = g[lo - 1]; bd = Math.abs(g[lo - 1] - t); }
  return bd <= tol ? best : null;
}

/** 重なり/近すぎる区間をまとめる（ダッキングの窓・pure） */
export function mergeWindows(list, join) {
  const src = arr(list).map((w) => [finite(w[0], 0), finite(w[1], 0)]).filter((w) => w[1] > w[0]).sort((a, b) => a[0] - b[0]);
  const gap = Math.max(0, finite(join, 0));
  const out = [];
  for (const w of src) {
    const last = out[out.length - 1];
    if (last && w[0] <= last[1] + gap) last[1] = Math.max(last[1], w[1]);
    else out.push([w[0], w[1]]);
  }
  return out;
}

/**
 * そのクリップで「素材の音が鳴っている」タイムライン上の区間（pure）。
 * analysis.silence が在れば無音をくり抜く（無ければクリップ全体）。
 * 速度と逆再生を織り込んで素材時刻 → タイムライン時刻へ写す。
 * @param {Object} item 並べ終わったクリップ @param {Object} asset
 * @returns {number[][]} [[start,end], ...]
 */
export function audibleWindows(item, asset) {
  const it = plain(item) || {};
  const s0 = finite(it.start, 0), s1 = s0 + Math.max(0, finite(it.duration, 0));
  if (!(s1 > s0)) return [];
  const A = plain(asset) && plain(plain(asset).analysis);
  const sil = A ? arr(A.silence).map((w) => plain(w)).filter(Boolean) : [];
  if (!sil.length || str(it.kind) !== "video") return [[s0, s1]];
  const sp = Math.max(0.01, finite(it.speed, 1));
  const i0 = finite(it.in, 0), o0 = Math.max(i0, finite(it.out, i0));
  const toTl = (t) => (it.reverse ? s0 + (o0 - t) / sp : s0 + (t - i0) / sp);
  /* 無音の区間をタイムラインへ写して並べ、その隙間を「鳴っている所」とする */
  const mute = mergeWindows(sil.map((w) => {
    const a = toTl(clamp(finite(w.start, 0), i0, o0)), b = toTl(clamp(finite(w.end, 0), i0, o0));
    return [Math.min(a, b), Math.max(a, b)];
  }), 0.05);
  const out = [];
  let cur = s0;
  for (const m of mute) {
    if (m[1] <= cur + 0.05) continue;
    if (m[0] > cur + 0.05) out.push([cur, Math.min(m[0], s1)]);
    cur = Math.max(cur, m[1]);
    if (cur >= s1 - 0.05) break;
  }
  if (cur < s1 - 0.05) out.push([cur, s1]);
  return out.filter((w) => w[1] > w[0] + 0.05);
}

/**
 * 素材のどこを使うか（**pure**）。同じ素材を何度も使うときは素材を count 個の
 * 窓に割り、occ 番目の窓の中で一番良い所を選ぶ（毎回同じ絵にならない・時系列に進む）。
 * @param {Object} asset @param {string|{in:number,out:number}} pick
 * @param {number} srcWant 素材側で欲しい秒数（= タイムライン尺 × speed）
 * @param {number} occ 何本目か（0 始まり） @param {number} count その素材を使う本数
 * @returns {{in:number, out:number, why:string}}
 */
export function sourceRangeFor(asset, pick, srcWant, occ, count) {
  const dur = assetDur(asset);
  if (!(dur > 0)) return { in: 0, out: 0, why: "静止画（尺はクリップ側が決める）" };
  const w = clamp(finite(srcWant, 1), Math.min(MIN_CLIP, dur), dur);
  const p = plain(pick);
  if (p && Number.isFinite(Number(p.in)) && Number.isFinite(Number(p.out))) {
    const i0 = clamp(finite(p.in, 0), 0, Math.max(0, dur - MIN_CLIP));
    const o0 = clamp(finite(p.out, i0 + w), i0 + MIN_CLIP, dur);
    return { in: i0, out: o0, why: "指定された範囲" };
  }
  const mode = str(pick) || "auto";
  if (mode === "start") return { in: 0, out: w, why: "頭から" };
  if (mode === "end") return { in: Math.max(0, dur - w), out: dur, why: "終わりから" };

  const n = Math.max(1, Math.round(finite(count, 1)));
  const k = clamp(Math.round(finite(occ, 0)), 0, n - 1);
  const span = dur / n;
  let lo = span * k;
  let hi = Math.min(dur, lo + Math.max(span, w));
  if (mode === "auto" && n === 1) hi = Math.min(dur, Math.max(w, dur * 0.6));  // 先頭寄り
  if (hi - lo < w) lo = Math.max(0, hi - w);
  const A = plain(asset) && plain(plain(asset).analysis);
  if (A) {
    const b = pickBestRange(A, { want: w, in: lo, out: hi });
    const i0 = clamp(finite(b.in, lo), 0, Math.max(0, dur - w));
    return { in: i0, out: Math.min(dur, i0 + w), why: str(b.why) || "解析で選んだ" };
  }
  return { in: lo, out: Math.min(dur, lo + w), why: n > 1 ? `${k + 1} 本目の窓` : "未解析なので頭寄り" };
}

/* ══ §B 本体 ══════════════════════════════════════════════════════ */

/**
 * Plan → ops（契約書 §6）。**pure・決定論**。壊れた segment は捨てて warnings に残す。
 * @param {Object} plan
 * @param {{project?:Object, assets?:Array, beats?:Object|null, fps?:number,
 *   replace?:boolean}} [opts]
 * @returns {{ops:{type:string,payload:Object}[], summary:string, warnings:string[]}}
 */
export function resolvePlan(plan, opts) {
  const o = plain(opts) || {};
  const project = plain(o.project) || {};
  const settings = plain(project.settings) || {};
  const assets = arr(o.assets).length ? arr(o.assets) : arr(project.assets);
  const byId = new Map(assets.map((a) => [str(plain(a) && plain(a).id), a]));
  const P = plain(plan) || {};
  const warnings = [];
  const ops = [];

  const fps = clamp(finite(o.fps, finite(settings.fps, 30)), 1, 240);
  const frame = frameDur(fps);
  const minDur = Math.max(MIN_CLIP, frame);
  const frameRound = (t) => snapFrame(finite(t, 0), fps);
  const frameFloor = (t) => Math.floor(finite(t, 0) / frame + 1e-6) * frame;
  const planIdStr = str(P.id) || "pl_local";

  /* ── ① 比率と寸法（settings） ─────────────────────────── */
  const ratio = hasOwn(RATIOS, str(P.ratio)) ? str(P.ratio)
    : hasOwn(RATIOS, str(settings.ratio)) ? str(settings.ratio) : "16:9";
  let width = finite(settings.width, RATIOS[ratio].w);
  let height = finite(settings.height, RATIOS[ratio].h);
  if (ratio !== str(settings.ratio)) {
    if (ratio !== "custom") { width = RATIOS[ratio].w; height = RATIOS[ratio].h; }
    ops.push({ type: "settings.update", payload: { patch: { ratio, width, height } } });
  }
  /* テロップの体裁は Plan.style から（型 → textPreset。契約の Plan に体裁は無い） */
  const tpl = templateDefaults(pickTemplate({ style: str(P.style), ratio, targetDuration: finite(P.targetDuration, 30) }));

  /* ── ② 拍（BGM の頭出しと切り替え点の吸着に使う） ─────── */
  const musicPlan = plain(P.music);
  const musicAsset = musicPlan ? byId.get(str(musicPlan.assetId)) || null : null;
  if (musicPlan && !musicAsset) warnings.push(`BGM の素材 ${str(musicPlan.assetId)} が見つからないので音は敷かなかった`);
  const beats = normalizeBeats(o.beats || (musicAsset && plain(musicAsset.analysis) ? plain(musicAsset.analysis).beats : null));
  const musicDur = musicAsset ? assetDur(musicAsset) : 0;
  /* BGM の頭は「最初の downbeat」に合わせる（契約の指定）。startAt が数なら それ */
  let musicIn = 0;
  if (musicAsset) {
    if (musicPlan.startAt === "auto" || musicPlan.startAt === undefined || musicPlan.startAt === null) {
      const d0 = beats && beats.downbeats.length ? beats.downbeats[0] : (beats ? beats.offset : 0);
      musicIn = Number.isFinite(d0) && d0 > 0 && d0 < Math.min(8, musicDur * 0.5) ? d0 : 0;
    } else {
      musicIn = clamp(finite(musicPlan.startAt, 0), 0, Math.max(0, musicDur - minDur));
    }
    musicIn = frameRound(musicIn);
  }
  const pacing = ["slow", "medium", "fast", "beat"].indexOf(str(P.pacing)) >= 0 ? str(P.pacing) : "medium";
  /* 拍はタイムライン時刻へ（BGM を musicIn から鳴らすので その分ずらす） */
  const grid = beats ? beats.times.map((t) => r6(t - musicIn)).filter((t) => t >= -1e-6) : [];
  const beatMode = pacing === "beat" && grid.length > 1;
  if (pacing === "beat" && !grid.length) warnings.push("拍が分からないので等間隔で切った（音を解析すると音ハメになる）");

  /* ── ③ 素材の範囲と尺（1 段目: 何秒欲しいか） ──────────── */
  const segs = arr(P.segments);
  const occCount = new Map();
  for (const s of segs) {
    const id = str(plain(s) && plain(s).assetId);
    if (id) occCount.set(id, (occCount.get(id) || 0) + 1);
  }
  const occSeen = new Map();
  const items = [];
  for (let i = 0; i < segs.length; i++) {
    const s = plain(segs[i]);
    if (!s) { warnings.push(`${i + 1} 番目の segment が読めないので飛ばした`); continue; }
    const id = str(s.assetId);
    const asset = byId.get(id);
    if (!asset) { warnings.push(`素材 ${id || "(id 無し)"} が無いので ${i + 1} 番目を飛ばした`); continue; }
    const akind = str(plain(asset).kind);
    if (akind === "audio") { warnings.push(`${str(plain(asset).name) || id} は音の素材なので映像には並べなかった`); continue; }
    const kind = akind === "image" ? "image" : "video";
    const dur = assetDur(asset);
    if (kind === "video" && !(dur > 0)) { warnings.push(`${str(plain(asset).name) || id} の尺が分からないので飛ばした`); continue; }

    const speed = clamp(Math.abs(finite(s.speed, 1)) || 1, 0.1, 8);
    const wantTl = clamp(finite(s.want, 2), minDur, 900);
    const k = occSeen.get(id) || 0;
    occSeen.set(id, k + 1);

    const item = {
      assetId: id, kind, speed, reverse: s.reverse === true,
      transition: hasOwn(TRANSITION_DUR, str(s.transition)) ? str(s.transition) : "cut",
      text: plain(s.text), fx: arr(s.fx).map(str).filter(Boolean).slice(0, 6),
      note: str(s.note), hasAudio: kind === "video" && plain(asset).hasAudio !== false,
      in: 0, out: 0, wantTl, maxTl: Infinity, start: 0, duration: 0, why: ""
    };
    if (kind === "video") {
      const srcWant = clamp(wantTl * speed, Math.min(MIN_CLIP, dur), dur);
      const r = sourceRangeFor(asset, s.pick, srcWant, k, occCount.get(id) || 1);
      item.in = frameRound(clamp(r.in, 0, Math.max(0, dur - minDur * speed)));
      item.why = r.why;
      item.maxTl = Math.max(minDur, (dur - item.in) / speed);
      item.wantTl = Math.min(wantTl, Math.max(minDur, (r.out - r.in) / speed));
    }
    items.push(item);
  }

  /* ── ④ 並べる（2 段目: start と duration を決める。拍に吸着） ── */
  const tolBase = beats && beats.period > 0 ? Math.min(beats.period * 0.6, 0.45) : 0.25;
  let cursor = 0;
  for (const it of items) {
    let d = it.wantTl;
    if (beatMode) {
      const nb = nearestBeat(grid, cursor + d, tolBase);
      if (nb !== null) {
        const cand = frameRound(nb - cursor);
        if (cand >= Math.max(minDur, 0.25) && cand <= it.maxTl + 1e-6) d = cand;
      }
    }
    const cap = it.maxTl === Infinity ? 900 : Math.max(minDur, frameFloor(it.maxTl));
    d = Math.max(minDur, Math.min(frameRound(d), cap));
    it.start = r6(cursor);
    it.duration = r6(d);
    if (it.kind === "video") {
      const dur = assetDur(byId.get(it.assetId));
      it.out = r6(Math.min(dur, it.in + d * it.speed));
      if (!(it.out > it.in + 1e-6)) it.out = r6(Math.min(dur, it.in + Math.max(MIN_CLIP, d * it.speed)));
    }
    cursor = r6(cursor + d);
  }
  const videoEnd = cursor;
  if (!items.length) warnings.push("並べられる素材が無かった（映像は空のまま）");

  /* ── ⑤ トラックを用意（V / OL / A。空いていれば使い回す） ── */
  const usedIds = new Set();
  for (const a of assets) usedIds.add(str(plain(a) && plain(a).id));
  for (const t of arr(project.tracks)) {
    const tr = plain(t);
    if (!tr) continue;
    usedIds.add(str(tr.id));
    for (const c of arr(tr.clips)) usedIds.add(str(plain(c) && plain(c).id));
  }
  const clearing = o.replace === true;
  if (clearing) {
    const ids = [];
    for (const t of arr(project.tracks)) for (const c of arr(plain(t) && plain(t).clips)) { const id = str(plain(c) && plain(c).id); if (id) ids.push(id); }
    if (ids.length) ops.push({ type: "clip.remove", payload: { clipIds: ids, linked: true } });
  }
  const trackOps = [];
  /**
   * kind のトラックを 1 本決める（空いている物を使い、無ければ作る op を積む）。
   * トラックの上限（§3 の MAX_TRACKS）に当たったら **既にある物へ重ねる**。
   * ここで track.add が OpError を投げると batch ごと巻き戻って「AI を押したら
   * 何も起きない」になるので、先に譲る（重ねたことは warnings に残す）。
   * @returns {string|null} null = 置ける所が無い
   */
  const takeTrack = (kind, prefix) => {
    const found = arr(project.tracks).find((t) => {
      const tr = plain(t);
      return tr && str(tr.kind) === kind && !tr.locked && (clearing || !arr(tr.clips).length);
    });
    if (found) return str(plain(found).id);
    if (arr(project.tracks).length + trackOps.length >= MAX_TRACKS) {
      const any = arr(project.tracks).find((t) => plain(t) && str(plain(t).kind) === kind && !plain(t).locked);
      if (any) {
        /* clip.add は mode:"overwrite" なので、既にあるクリップは削られる/割られる。
           「重ねた」と書くと嘘になるので、上書きだと言い切る（取消 1 回で戻せる）。 */
        warnings.push(`トラックが上限（${MAX_TRACKS} 本）なので ${str(plain(any).name) || kind} に上書きした（取り消しで戻せる）`);
        return str(plain(any).id);
      }
      warnings.push(`トラックが上限（${MAX_TRACKS} 本）なので ${kind} のトラックを作れなかった`);
      return null;
    }
    const id = freeId(prefix, usedIds);
    trackOps.push({ type: "track.add", payload: { kind, id } });
    return id;
  };

  /* ── ⑥ 映像クリップ ─────────────────────────────────── */
  const grade = plain(P.grade);
  const clipOps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const spec = {
      kind: it.kind, assetId: it.assetId, start: it.start, duration: it.duration,
      name: "", speed: it.speed, reverse: it.reverse,
      source: { by: "ai", planId: planIdStr, note: it.note || it.why }
    };
    if (it.kind === "video") { spec.in = it.in; spec.out = it.out; }
    if (grade) spec.color = Object.assign({}, grade);          // 色は全クリップへ（契約の指定）
    /* fx の id は **こちらで振る**（clip.add は id を補わないので、無いまま
       保存されると keys の "fx.<id>.<param>" が指せなくなる）。乱数は使えない
       ので「何本目のクリップの何番目の効果か」から決める（決定論）。 */
    if (it.fx.length) spec.fx = it.fx.map((type, j) => ({ id: `fx_ai_${i}_${j}`, type, enabled: true, params: {} }));
    /* 遷移は「入口」にだけ付ける（隣の出口に付けると 2 重に掛かる） */
    if (i > 0 && it.transition !== "cut") {
      const want = finite(TRANSITION_DUR[it.transition], 0.3);
      const room = Math.min(it.duration, items[i - 1].duration) * 0.5;
      const d = Math.min(want, room);
      if (d > frame) spec.transitionIn = { type: it.transition, duration: r6(d), params: {} };
    }
    clipOps.push({ type: "clip.add", payload: { clip: spec, at: it.start, mode: "overwrite" } });
  }
  const videoTrackId = clipOps.length ? takeTrack("video", "tr_ai_v1") : null;
  if (clipOps.length && !videoTrackId) clipOps.length = 0;
  for (const op of clipOps) op.payload.trackId = videoTrackId;

  /* ── ⑦ テロップ（overlay 1 本に並べる。最短 1.2 秒） ──── */
  const captions = ["none", "auto", "prompt"].indexOf(str(P.captions)) >= 0 ? str(P.captions) : "auto";
  const wanted = [];
  if (captions !== "none") {
    for (const it of items) {
      const t = plain(it.text);
      if (!t || !str(t.content)) continue;
      const role = hasOwn(TEXT_WANT, str(t.role)) ? str(t.role) : "caption";
      wanted.push({ start: it.start, want: finite(TEXT_WANT[role], 2), role, content: str(t.content), emphasis: clamp(finite(t.emphasis, 0.5), 0, 1) });
    }
  }
  const endCard = plain(P.endCard);
  if (endCard && str(endCard.text)) {
    wanted.push({
      start: videoEnd, want: clamp(finite(endCard.duration, 1.6), 0.4, 20),
      role: "end", content: str(endCard.text), emphasis: 0.7
    });
  }
  wanted.sort((a, b) => a.start - b.start);
  /* テロップは overlay 1 本に並べるので重ねられない。**近すぎる後の方を落とす**
     （前の方を削ると「場面の頭の説明」が読めなくなる。残した物が隙間まで伸びる）。 */
  const kept = [];
  for (const w of wanted) {
    const prev = kept[kept.length - 1];
    if (prev && w.start - prev.start < DROP_TEXT - 1e-6) {
      warnings.push(`テロップ「${w.content.slice(0, 12)}」は前のテロップと近すぎるので出さなかった`);
      continue;
    }
    kept.push(w);
  }
  const textOps = [];
  let textEnd = 0;
  for (let i = 0; i < kept.length; i++) {
    const w = kept[i];
    const room = i + 1 < kept.length ? kept[i + 1].start - w.start : Infinity;
    let d = Math.min(w.want, room === Infinity ? w.want : room);
    if (room !== Infinity && room >= MIN_TEXT) d = Math.max(MIN_TEXT, Math.min(w.want, room));
    d = frameRound(Math.min(d, room === Infinity ? d : room));
    if (d < DROP_TEXT) { warnings.push(`テロップ「${w.content.slice(0, 12)}」は隣と近すぎるので出さなかった`); continue; }
    if (d < MIN_TEXT - 1e-6 && room !== Infinity) warnings.push(`テロップ「${w.content.slice(0, 12)}」は ${d.toFixed(1)} 秒しか出せなかった`);
    textOps.push({ type: "clip.add", payload: { clip: textClip(w, d, { height, planIdStr, preset: tpl.textPreset }), at: r6(w.start), mode: "overwrite" } });
    textEnd = Math.max(textEnd, r6(w.start + d));
  }
  const textTrackId = textOps.length ? takeTrack("overlay", "tr_ai_t1") : null;
  if (textOps.length && !textTrackId) textOps.length = 0;
  for (const op of textOps) op.payload.trackId = textTrackId;
  const timelineEnd = Math.max(videoEnd, textEnd);

  /* ── ⑧ BGM（A1 へ + ダッキング） ─────────────────────── */
  const musicOps = [];
  if (musicAsset && timelineEnd > 0) {
    const gain = clamp(finite(musicPlan.gain, 0.25), 0, 1);
    const room = Math.max(0, musicDur - musicIn);
    let d = Math.max(minDur, frameFloor(Math.min(timelineEnd, room)));
    if (room < minDur) {
      warnings.push("BGM の素材が短すぎるので敷かなかった");
    } else {
      if (room + 1e-3 < timelineEnd) warnings.push(`BGM が ${(timelineEnd - room).toFixed(1)} 秒足りない（最後は無音になる）`);
      /* 素材より長くしない。ただし **MIN_CLIP より短くもしない**（§1 不変条件 2）。
         フレームで切り下げると 1 フレームが MIN_CLIP より短い fps（30 なら
         0.0333 < 0.04）で下限を割るため、最後に minDur まで戻す。
         room >= minDur はこの枝に入る条件なので、素材の端は越えない。 */
      d = Math.max(minDur, Math.min(d, frameFloor(room)));
      const spec = {
        kind: "audio", assetId: str(musicAsset.id), start: 0, duration: r6(d),
        in: r6(musicIn), out: r6(Math.min(musicDur, musicIn + d)),
        volume: gain, name: "BGM",
        audioFade: { in: r6(Math.min(MUSIC_FADE.in, d * 0.2)), out: r6(Math.min(MUSIC_FADE.out, d * 0.3)), curve: "linear" },
        source: { by: "ai", planId: planIdStr, note: "BGM" }
      };
      /* ダッキング: 素材の音が鳴っている所だけ BGM を下げる（volume のキー） */
      if (musicPlan.duck !== false) {
        const raw = [];
        for (const it of items) if (it.hasAudio) for (const w of audibleWindows(it, byId.get(it.assetId))) raw.push(w);
        const wins = mergeWindows(raw, DUCK.join);
        if (wins.length > DUCK.maxWindows) {
          spec.volume = r6(gain * (1 - DUCK.amount * 0.5));
          warnings.push("素材の音が細かく入るので、BGM は全体を少し下げた（都度のダッキングはしていない）");
        } else if (wins.length) {
          const keys = [];
          const low = r6(gain * DUCK.amount);
          const push = (t, v) => {
            const tt = clamp(frameRound(t), 0, d);
            const last = keys[keys.length - 1];
            if (last && Math.abs(last.t - tt) <= frame / 2) { last.v = v; return; }
            if (last && tt < last.t) return;
            keys.push({ t: r6(tt), v, ease: "linear" });
          };
          push(0, gain);
          for (const w of wins) {
            push(w[0] - DUCK.pre, gain); push(w[0], low);
            push(w[1], low); push(w[1] + DUCK.post, gain);
          }
          push(d, gain);
          if (keys.length > 2) spec.keys = { volume: keys };
        }
      }
      musicOps.push({ type: "clip.add", payload: { clip: spec, at: 0, mode: "overwrite" } });
    }
  }
  const musicTrackId = musicOps.length ? takeTrack("audio", "tr_ai_a1") : null;
  if (musicOps.length && !musicTrackId) musicOps.length = 0;
  for (const op of musicOps) op.payload.trackId = musicTrackId;

  /* ── ⑨ まとめ（トラック → クリップ → テロップ → BGM の順） ── */
  const all = ops.concat(trackOps, clipOps, textOps, musicOps).map((op) => ({ type: op.type, payload: roundDeep(op.payload) }));
  /* 拍が無いのに「ビート同期」と言うと嘘になる（warnings と食い違う） */
  const sync = beatMode ? "ビート同期"
    : pacing === "beat" ? "等間隔（拍が不明）" : str(PACING_LABEL[pacing]) || "標準テンポ";
  const summary = `${clipOps.length} クリップ / ${timelineEnd.toFixed(1)} 秒 / ${sync} / テロップ ${textOps.length} 枚 / BGM ${musicOps.length ? "あり" : "なし"}`;
  return { ops: all, summary, warnings };
}

/** テロップ 1 枚を clip の仕様にする（px と位置はここで決める） */
function textClip(w, d, ctx) {
  const spec = roleSpec(ctx.preset, w.role);
  const emph = clamp(finite(w.emphasis, 0.5), 0, 1);
  const size = Math.max(12, Math.round(spec.sizeRel * finite(ctx.height, 1080) * (1 + 0.22 * emph)));
  /* 出入りのアニメは合わせて尺の 8 割まで（短いテロップで動きが終わらないのを防ぐ） */
  const room = Math.max(0.1, d * 0.8);
  const inDur = Math.min(finite(spec.anim.in.duration, 0.35), room * 0.6);
  const outDur = Math.min(finite(spec.anim.out.duration, 0.25), room - inDur);
  return {
    kind: "text", start: r6(w.start), duration: r6(d), name: w.content.slice(0, 20),
    transform: { x: spec.x, y: spec.y },
    text: {
      content: w.content,
      style: {
        font: "system", size, weight: spec.weight, color: spec.color,
        stroke: { width: Math.round(spec.stroke.width * (0.7 + 0.3 * emph)), color: spec.stroke.color },
        shadow: spec.shadow, bg: spec.bg
      },
      layout: { align: spec.align, vAlign: spec.vAlign, maxWidth: spec.maxWidth, lineHeight: 1.25, letterSpacing: 0 },
      anim: {
        in: { type: spec.anim.in.type, duration: r6(Math.max(0, inDur)) },
        out: { type: spec.anim.out.type, duration: r6(Math.max(0, outDur)) },
        loop: { type: "none", speed: 1 }, unit: "all"
      }
    },
    source: { by: "ai", planId: ctx.planIdStr, note: `テロップ（${w.role}）` }
  };
}
