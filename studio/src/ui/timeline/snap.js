/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/snap.js — 吸着（マグネット）の頭脳。**純関数だけ**

   ★ 何をする所か
     タイムラインで指やマウスが持ってきた時刻 `t` を、「近くにある意味のある
     時刻」（再生ヘッド・隣のクリップの端・マーカー・ビート・0 秒・全体の終わり）
     へ寄せる。寄せ先の候補を作る `buildSnapPoints()`、1 点へ寄せる
     `snapTime()` / `snapMove()`、そして掴んだ物の行き先を決める
     `resolveMove/resolveTrim/resolveSlip`（§4）を持つ。
     **DOM も入力も知らない**（それは interact.js の仕事）。

   ★ なぜこの形か
     ・**DOM を一切触らない**。触り方（interact.js）は毎フレーム呼ぶので、
       ここが重いと編集の気持ち良さが即座に死ぬ。純関数なら node --test で
       境界（許容範囲・優先順・除外）を全部固定できる。
     ・候補は「px の許容範囲」で判定する。秒で持つと拡大率によって
       効き方が変わり、拡大したのに吸着が外れない（または全く効かない）
       という不快さになる。だから `tolerancePx / pxPerSec` で秒へ直す。
     ・**寄せ先は必ず 1 点**。複数を平均したり両端で別々に寄せると、
       クリップが伸び縮みして見えて信用を失う。
     ・同距離のときの勝ち負け（優先順）を表で固定する。再生ヘッドが
       一番強い（人が今見ている場所だから）。ビートは一番弱い（数が多く、
       他の吸着を全部食ってしまうため）。

   ★ 触るときの注意
     ・`kind` の文字列は UI（吸着線の色・振動の有無）と試験が見ている。
       増やすのは良いが、既存の綴りを変えない。
     ・`magnet`（または `snap`）が off のときは **候補を空にする**のが約束。
       呼び出し側に条件分岐を書かせないため（契約の意図: 触り方は単純に）。
     ・許容範囲の外なら `hit:null` を返し、`t` は **そのまま**返す。
       勝手に丸めない（フレーム丸めは core/time.js の仕事）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { finite } from "../../core/util.js";
import { clipEnd, projectDuration, MIN_CLIP } from "../../core/schema.js";

/* ── 0. 決め事 ─────────────────────────────────────────────────── */

/** 吸着先の種類（UI の見た目と試験が綴りを見る） */
export const SNAP_KINDS = Object.freeze([
  "playhead", "marker", "clipEnd", "clipStart", "zero", "end", "beat"
]);

/**
 * 同距離で競ったときの強さ（小さいほど強い）。
 * 再生ヘッド > マーカー > クリップの端 > 0/終わり > ビート。
 */
export const SNAP_KIND_PRIORITY = Object.freeze({
  playhead: 0, marker: 1, clipEnd: 2, clipStart: 2, zero: 3, end: 3, beat: 4
});

/** 同じ時刻とみなす幅（秒）。60fps の 1 フレームより十分小さい */
export const SNAP_EPS = 1e-4;

/** 既定の許容範囲（px）。モバイルは呼び出し側が 12〜14 へ広げる */
export const DEFAULT_TOLERANCE_PX = 8;

/** 種類 → 画面に出す短い日本語（吸着線の脇に出す用） */
const KIND_LABEL = Object.freeze({
  playhead: "再生ヘッド", marker: "マーカー", clipStart: "クリップの先頭",
  clipEnd: "クリップの末尾", zero: "先頭", end: "末尾", beat: "ビート"
});

/** @param {string} kind @returns {string} */
export function snapLabel(kind) {
  return KIND_LABEL[kind] || "";
}

/** @param {string} kind @returns {number} 小さいほど強い */
export function snapPriority(kind) {
  const p = SNAP_KIND_PRIORITY[kind];
  return typeof p === "number" ? p : 9;
}

/* ── 1. 見えている範囲（候補を間引くため） ─────────────────────── */

/**
 * 画面に見えている時間帯を求める。分からなければ null（= 間引かない）。
 * view は TimelineView でも `{ pxPerSec, scrollX, width }` の素の物でも良い
 * （純関数のままにするため、関数なら呼ばずに数値だけを見る）。
 * @param {*} view
 * @param {{marginPx?:number}} [opts]
 * @returns {{start:number,end:number}|null}
 */
export function visibleTimeRange(view, opts) {
  if (!view || typeof view !== "object") return null;
  const pps = numOf(view.pxPerSec) || numOf(view.zoom);
  const width = numOf(view.width) || numOf(view.viewportWidth) || numOf(view.clientWidth);
  const scrollX = numOf(view.scrollX);
  if (!(pps > 0) || !(width > 0) || scrollX === null) return null;
  const margin = Math.abs(finite(opts && opts.marginPx, 240));
  const start = (scrollX - margin) / pps;
  const end = (scrollX + width + margin) / pps;
  return { start, end };
}

/** 数値らしい物だけ取り出す（関数や NaN は null） */
function numOf(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* ── 2. 候補作り ───────────────────────────────────────────────── */

/**
 * 吸着の候補を作る。**magnet が off なら空配列**（約束）。
 *
 * @param {Object}   arg
 * @param {*}        arg.project           Project（tracks / markers / settings を見る）
 * @param {*}        [arg.view]            見えている範囲で間引く用（任意）
 * @param {string[]|Set<string>} [arg.excludeClipIds]  掴んでいるクリップ（自分自身に吸着しない）
 * @param {number|null} [arg.playhead]     再生ヘッド秒（渡さなければ project 側も見ない）
 * @param {Array|boolean} [arg.markers]    マーカー配列（省略時は project.markers、false で無効）
 * @param {Array|{times:number[]}|null} [arg.beats]  ビート（省略時は使わない）
 * @param {boolean}  [arg.includeEnds=true] 0 秒と全体の終わりを入れるか
 * @returns {{t:number,kind:string,clipId?:string,trackId?:string}[]} t 昇順・重複なし
 */
export function buildSnapPoints(arg) {
  const a = arg || {};
  const project = a.project && typeof a.project === "object" ? a.project : null;
  const settings = (project && project.settings) || {};

  // 吸着 off は候補ゼロ（呼び出し側に分岐を書かせない）
  if (settings.magnet === false || settings.snap === false) return [];

  const exclude = toIdSet(a.excludeClipIds);
  const range = visibleTimeRange(a.view);
  const out = [];
  const push = (t, kind, extra) => {
    // finite() は NaN を 0 に落とすので、ここでは素の判定で「捨てる」。
    // 壊れた値を 0 秒として混ぜると、先頭に偽の吸着点が生える。
    const v = typeof t === "number" ? t : Number(t);
    if (!Number.isFinite(v) || v < 0) return;
    if (range && (v < range.start || v > range.end)) return;
    out.push(extra ? Object.assign({ t: v, kind }, extra) : { t: v, kind });
  };

  /* 再生ヘッド（一番強い） */
  if (typeof a.playhead === "number" && Number.isFinite(a.playhead)) push(a.playhead, "playhead");

  /* クリップの端 */
  if (project) {
    const tracks = Array.isArray(project.tracks) ? project.tracks : [];
    for (const track of tracks) {
      if (!track || !Array.isArray(track.clips)) continue;
      const trackId = track.id;
      for (const clip of track.clips) {
        if (!clip || exclude.has(clip.id)) continue;
        push(clip.start, "clipStart", { clipId: clip.id, trackId });
        push(clipEnd(clip), "clipEnd", { clipId: clip.id, trackId });
      }
    }
  }

  /* マーカー（false を渡すと切れる） */
  if (a.markers !== false) {
    const src = Array.isArray(a.markers) ? a.markers : (project && Array.isArray(project.markers) ? project.markers : []);
    for (const m of src) push(typeof m === "number" ? m : (m && m.t), "marker", m && m.id ? { markerId: m.id } : null);
  }

  /* ビート（数が多いので一番弱い） */
  const beatTimes = toTimes(a.beats);
  for (const b of beatTimes) push(b, "beat");

  /* 0 秒と全体の終わり */
  if (a.includeEnds !== false) {
    push(0, "zero");
    if (project) {
      const end = projectDuration(project);
      if (end > 0) push(end, "end");
    }
  }

  return dedupeSnapPoints(out);
}

/** 配列 / Set / 単発の id を Set にする */
function toIdSet(v) {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v.filter((x) => typeof x === "string"));
  if (typeof v === "string") return new Set([v]);
  return new Set();
}

/** beats の色々な形（配列 / {times} / {beats:{times}}）を秒の配列にする */
function toTimes(v) {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "number" ? x : (x && typeof x.t === "number" ? x.t : NaN)))
      .filter((x) => Number.isFinite(x));
  }
  if (typeof v === "object") {
    if (Array.isArray(v.times)) return toTimes(v.times);
    if (v.beats) return toTimes(v.beats);
  }
  return [];
}

/**
 * t 昇順に並べ、SNAP_EPS 以内の重複を「強い方」に潰す。
 * @param {{t:number,kind:string}[]} points
 * @returns {{t:number,kind:string}[]}
 */
export function dedupeSnapPoints(points) {
  const arr = Array.isArray(points) ? points.slice() : [];
  arr.sort((a, b) => (a.t - b.t) || (snapPriority(a.kind) - snapPriority(b.kind)));
  const out = [];
  for (const p of arr) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - p.t) <= SNAP_EPS) {
      // 同じ時刻とみなす。強い方（優先順の数が小さい方）だけを残す
      if (snapPriority(p.kind) < snapPriority(last.kind)) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

/* ── 3. 寄せる ─────────────────────────────────────────────────── */

/**
 * 一番近い候補を 1 つ返す（許容範囲は見ない）。
 * 同距離なら優先順の強い方。
 * @param {number} t
 * @param {{t:number,kind:string}[]} points
 * @returns {{point:Object,dist:number}|null}
 */
export function nearestSnap(t, points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const x = finite(t, NaN);
  if (!Number.isFinite(x)) return null;
  let best = null, bestD = Infinity, bestP = 99;
  for (const p of points) {
    if (!p) continue;
    const pt = finite(p.t, NaN);
    if (!Number.isFinite(pt)) continue;
    const d = Math.abs(pt - x);
    const pr = snapPriority(p.kind);
    if (d < bestD - SNAP_EPS || (d <= bestD + SNAP_EPS && pr < bestP)) {
      best = p; bestD = d; bestP = pr;
    }
  }
  return best ? { point: best, dist: bestD } : null;
}

/**
 * 時刻を 1 点へ寄せる。許容範囲の外なら **t をそのまま**返し hit は null。
 * @param {number} t
 * @param {{t:number,kind:string}[]} points
 * @param {{pxPerSec?:number, tolerancePx?:number}} [opts]
 * @returns {{t:number, hit:Object|null, dist:number}}
 */
export function snapTime(t, points, opts) {
  const o = opts || {};
  const x = finite(t, 0);
  const pps = finite(o.pxPerSec, 0);
  const tolPx = Math.abs(finite(o.tolerancePx, DEFAULT_TOLERANCE_PX));
  if (!(pps > 0) || tolPx <= 0) return { t: x, hit: null, dist: Infinity };
  const near = nearestSnap(x, points);
  if (!near) return { t: x, hit: null, dist: Infinity };
  const tolSec = tolPx / pps;
  if (near.dist <= tolSec + SNAP_EPS) return { t: near.point.t, hit: near.point, dist: near.dist };
  return { t: x, hit: null, dist: near.dist };
}

/**
 * クリップ移動用。**先頭と末尾の両方**を候補に当てて、寄る量が少ない方で
 * クリップ全体を平行移動する（尺は絶対に変えない）。
 *
 * @param {Object} arg
 * @param {number} arg.start        寄せる前の開始秒
 * @param {number} arg.duration     クリップの尺（秒・変えない）
 * @param {{t:number,kind:string}[]} arg.points
 * @param {number} arg.pxPerSec
 * @param {number} [arg.tolerancePx=8]
 * @returns {{start:number, hit:Object|null, edge:"start"|"end"|null, shift:number}}
 */
export function snapMove(arg) {
  const a = arg || {};
  const start = finite(a.start, 0);
  const dur = Math.max(0, finite(a.duration, 0));
  const pps = finite(a.pxPerSec, 0);
  const tol = Math.abs(finite(a.tolerancePx, DEFAULT_TOLERANCE_PX));
  const none = { start, hit: null, edge: null, shift: 0 };
  if (!(pps > 0)) return none;

  const head = snapTime(start, a.points, { pxPerSec: pps, tolerancePx: tol });
  const tail = snapTime(start + dur, a.points, { pxPerSec: pps, tolerancePx: tol });
  const dHead = head.hit ? Math.abs(head.t - start) : Infinity;
  const dTail = tail.hit ? Math.abs(tail.t - (start + dur)) : Infinity;

  if (!head.hit && !tail.hit) return none;
  // 同じ寄り量なら先頭を優先（人は先頭を見て合わせているため）
  if (dHead <= dTail) {
    const s = Math.max(0, head.t);
    return { start: s, hit: head.hit, edge: "start", shift: s - start };
  }
  const s = Math.max(0, tail.t - dur);
  return { start: s, hit: tail.hit, edge: "end", shift: s - start };
}

/**
 * 許容範囲（px）を秒に直す小道具。interact.js が振動の判定にも使う。
 * @param {number} pxPerSec @param {number} [tolerancePx=8] @returns {number}
 */
export function toleranceSeconds(pxPerSec, tolerancePx) {
  const pps = finite(pxPerSec, 0);
  const tol = Math.abs(finite(tolerancePx, DEFAULT_TOLERANCE_PX));
  return pps > 0 ? tol / pps : 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. 掴んだ物の行き先（純関数）

   CONTRACT-NOTE: 契約書 §7 には「吸着」だけが書かれているが、移動・トリム・
   スリップの **算数**（吸着 → 0 秒より前に出さない → 素材の頭と尻・隣との
   最小尺で止める → フレーム丸め）も DOM を知らない純関数にできる。
   interact.js（DOM と入力）に混ぜると試験が書けず、境界（尺が MIN_CLIP を
   割る・素材の端を越える）を目で確かめるしか無くなるため、ここに置く。
   interact.js は「指の位置 → 秒」に直してからこの 3 つを呼ぶだけ。
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * lo..hi に収める。**Infinity を扱える**（util.clamp は有限しか扱わないので、
 * 「素材の尻が無限（画像・図形）」を渡すと 1 に潰れてしまう）。
 */
function span(v, lo, hi) {
  let a = typeof lo === "number" ? lo : -Infinity;
  let b = typeof hi === "number" ? hi : Infinity;
  if (a > b) { const t = a; a = b; b = t; }
  const x = typeof v === "number" && Number.isFinite(v) ? v : (Number.isFinite(a) ? a : 0);
  return x < a ? a : x > b ? b : x;
}

/** フレーム丸め（吸着が効いたときは丸めない。丸めると隣とぴったり接しなくなる） */
function roundToFrame(t, fps) {
  const f = Math.max(1, finite(fps, 30));
  return Math.round(finite(t, 0) * f) / f;
}

/**
 * @typedef {Object} DragItem
 * @property {string} clipId
 * @property {string} fromTrackId
 * @property {number} fromStart   掴む前の開始秒
 * @property {number} duration    タイムライン上の尺（秒）
 * @property {number} [headroom]  先頭をあと何秒左へ伸ばせるか（素材の頭までの余裕・タイムライン尺）
 * @property {number} [tailroom]  末尾をあと何秒右へ伸ばせるか
 * @property {number} [maxDur]    尺の上限（素材の全長 ÷ 速度。画像や図形は Infinity）
 */

/**
 * クリップ移動の答え。**尺は変えない**。複数掴んでいれば相対位置を保つ。
 *
 * @param {Object} a
 * @param {DragItem[]} a.items        掴んでいるクリップ（[0] が吸着の基準 = 指で掴んだ物）
 * @param {number} a.deltaTime        横に動いた秒数
 * @param {string|null} [a.toTrackId] 縦の移動先トラック（null なら元のまま）
 * @param {{t:number,kind:string}[]} [a.points]
 * @param {number} a.pxPerSec
 * @param {number} [a.tolerancePx=8]
 * @param {number} [a.fps=30]
 * @returns {{items:Object[], hit:Object|null, delta:number}}
 */
export function resolveMove(a) {
  const o = a || {};
  const items = Array.isArray(o.items) ? o.items : [];
  const pps = finite(o.pxPerSec, 0);
  const tol = finite(o.tolerancePx, DEFAULT_TOLERANCE_PX);
  let dt = finite(o.deltaTime, 0);
  let hit = null;

  const lead = items[0];
  if (lead && pps > 0) {
    const s = snapMove({
      start: finite(lead.fromStart, 0) + dt, duration: finite(lead.duration, 0),
      points: o.points, pxPerSec: pps, tolerancePx: tol
    });
    if (s.hit) { dt = s.start - finite(lead.fromStart, 0); hit = s.hit; }
  }
  // 掴んだ束の先頭が 0 秒より前に出ないよう、束ごとずらす
  let minStart = Infinity;
  for (const it of items) minStart = Math.min(minStart, finite(it.fromStart, 0) + dt);
  if (Number.isFinite(minStart) && minStart < 0) dt -= minStart;

  const to = typeof o.toTrackId === "string" && o.toTrackId ? o.toTrackId : null;
  const out = items.map((it) => {
    const from = finite(it.fromStart, 0);
    const raw = from + dt;
    return {
      clipId: it.clipId, fromStart: from,
      start: Math.max(0, hit ? raw : roundToFrame(raw, o.fps)),
      duration: Math.max(MIN_CLIP, finite(it.duration, MIN_CLIP)),
      fromTrackId: it.fromTrackId, trackId: to || it.fromTrackId
    };
  });
  return { items: out, hit, delta: dt };
}

/**
 * トリム（端を引く）と ロール（隣との境界を動かす）の答え。
 * `other` を渡すとロール（自分と相手の尺が入れ替わり、全体の長さは変わらない）。
 *
 * @param {Object} a
 * @param {DragItem} a.item
 * @param {"in"|"out"} a.edge
 * @param {number} a.time                指が指している秒
 * @param {{t:number,kind:string}[]} [a.points]
 * @param {number} a.pxPerSec
 * @param {number} [a.tolerancePx=8]
 * @param {number} [a.fps=30]
 * @param {{start:number,duration:number}|null} [a.other]  ロールの相手
 * @param {number} [a.minDur=MIN_CLIP]  UI 側の下限（契約書 §13.5 の MIN_TRIM_UI=0.1）。
 *   **モデルの下限（MIN_CLIP=0.04）より短くはできない**（UI ≧ モデル）
 * @returns {{start:number, duration:number, time:number, hit:Object|null, edge:string}}
 */
export function resolveTrim(a) {
  const o = a || {};
  const it = o.item || {};
  const edge = o.edge === "in" ? "in" : "out";
  const from = finite(it.fromStart, 0);
  const dur = Math.max(MIN_CLIP, finite(it.duration, MIN_CLIP));
  const end = from + dur;
  const maxDur = typeof it.maxDur === "number" ? Math.max(MIN_CLIP, it.maxDur) : Infinity;
  // 余裕が分からない（渡されない）ときは縛らない。最後の砦は core/ops.js の検算
  const head = typeof it.headroom === "number" ? Math.max(0, it.headroom) : Infinity;
  const tail = typeof it.tailroom === "number" ? Math.max(0, it.tailroom) : Infinity;
  const MIN = Math.max(MIN_CLIP, finite(o.minDur, MIN_CLIP));

  const s = snapTime(finite(o.time, 0), o.points, {
    pxPerSec: finite(o.pxPerSec, 0), tolerancePx: finite(o.tolerancePx, DEFAULT_TOLERANCE_PX)
  });
  let t = Math.max(0, s.hit ? s.t : roundToFrame(o.time, o.fps));

  let start = from, duration = dur;
  const other = o.other && typeof o.other === "object" ? o.other : null;
  if (other) {
    const oStart = finite(other.start, 0);
    const oDur = Math.max(MIN_CLIP, finite(other.duration, MIN_CLIP));
    if (edge === "in") {           // 自分の先頭 = 相手（左隣）の末尾
      t = span(t, oStart + MIN, end - MIN);
      start = t; duration = end - t;
    } else {                       // 自分の末尾 = 相手（右隣）の先頭
      t = span(t, from + MIN, oStart + oDur - MIN);
      duration = t - from;
    }
  } else if (edge === "in") {
    // 素材の頭より前へは出せない（headroom）。尺の上限（maxDur）も見る
    const lo = Math.max(0, from - head, Number.isFinite(maxDur) ? end - maxDur : 0);
    t = span(t, lo, end - MIN);
    start = t; duration = end - t;
  } else {
    const hi = Math.min(Number.isFinite(maxDur) ? from + maxDur : Infinity, end + tail);
    t = span(t, from + MIN, hi);
    duration = t - from;
  }
  duration = Math.max(MIN, duration);
  return { start: Math.max(0, start), duration, time: edge === "in" ? start : start + duration, hit: s.hit, edge };
}

/**
 * スリップ（尺を保って中身をずらす）の答え。
 * 返す `delta` は **素材側の in/out に足す秒**。指を右へ引くと中身は後ろへ
 * 送られる（= 素材の前へ戻る）ので符号が逆になる。
 *
 * @param {{item:DragItem, deltaTime:number}} a
 * @returns {{delta:number}}
 */
export function resolveSlip(a) {
  const o = a || {};
  const it = o.item || {};
  // resolveTrim と同じ約束: 余裕が分からないときは縛らない
  const head = typeof it.headroom === "number" ? Math.max(0, it.headroom) : Infinity;
  const tail = typeof it.tailroom === "number" ? Math.max(0, it.tailroom) : Infinity;
  // +0 は -0 を潰すため（-0 は JSON でも比較でも驚きの元）
  return { delta: span(-finite(o.deltaTime, 0), -head, tail) + 0 };
}

/**
 * 矩形選択の中身（時間帯 × トラック）。端が触れているだけの物は入れない。
 * @param {Object} a
 * @param {*} a.project
 * @param {string[]|Set<string>|null} [a.trackIds]  null なら全トラック
 * @param {number} a.t0 @param {number} a.t1
 * @returns {string[]} clipId
 */
export function clipsInTimeRange(a) {
  const o = a || {};
  const project = o.project && typeof o.project === "object" ? o.project : null;
  if (!project) return [];
  const only = o.trackIds == null ? null : toIdSet(o.trackIds);
  const lo = Math.min(finite(o.t0, 0), finite(o.t1, 0));
  const hi = Math.max(finite(o.t0, 0), finite(o.t1, 0));
  const out = [];
  for (const tr of (Array.isArray(project.tracks) ? project.tracks : [])) {
    if (!tr || (only && !only.has(tr.id))) continue;
    for (const c of (Array.isArray(tr.clips) ? tr.clips : [])) {
      if (!c) continue;
      if (clipEnd(c) > lo && finite(c.start, 0) < hi) out.push(c.id);
    }
  }
  return out;
}
