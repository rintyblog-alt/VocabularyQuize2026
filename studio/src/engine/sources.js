/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/sources.js — 素材を「その時刻の絵」にして渡す係（契約書 §4）

   ★ 何をする所か
     `createSourcePool({ storage, project, fps })` が SourcePool を返す。
     合成器（engine/compositor.js / canvas2d.js）は毎フレーム
     `acquire(resolved, { mode })` を呼び、**すぐ drawImage / texImage2D できる物**
     （`<video>` / ImageBitmap / canvas）を受け取る。書き出しと擦り（scrub）は
     `seekExact(resolved)` で「その 1 フレームが本当に来た」事まで待つ。

   ★ なぜこの形か（ここは編集ソフトで一番の地雷。理由を残す）
     ・**<video> はプール**（契約書 §4 / §13.3）。iOS は同時に生かせる本数が
       少なく、溢れると「音は出るのに絵が来ない」「タブが落ちる」になる。
       既定 4 本・iOS 2 本。足りない分は 静止フレームで代替する。
     ・割当は **pure 関数 `planAssignment()`** に切り出した。プールの割当は
       「今いちばん先に要る clip」「同じ素材の共有」「LRU」の三つが絡んで
       壊れやすい上に、DOM を持つと試験できない。だから判断だけを純関数にして
       node --test で固定し、DOM 操作（src 付け替え・pause）は その結果を
       黙って実行するだけにした。
     ・**seek は「書いて待つ」以外の道を持たない**（契約書 §13.3）:
       `currentTime = (frameIndex+0.5)/assetFps` → `seeked` → `requestVideoFrameCallback`
       を 1 回。`fastSeek()` は使わない。量子化は **素材の fps** で行う
       （プロジェクト fps で丸めると 60fps 素材と速度変更で外れる）。
       `+0.5` の中心寄せは この中だけの話で、外へは漏らさない。
     ・同じ位置への seek は **省略**する（`shouldSeek()`）。擦っている間の
       無駄な seek はデコーダを詰まらせ、体感が一気に悪くなる。
     ・`mode:"play"` は seek ではなく **再生**で合わせる。ずれが 0.08s を超えた
       時だけ `currentTime` を打ち直し、打ちすぎ防止に 0.5 秒のクールダウンを
       置く（`shouldResync()`）。毎フレーム打つと絵が固まる。
     ・音は **絶対に自分で鳴らさない**（engine/audio/graph.js の担当）。
       `muted = true` を素材ごとに何度でも念押しする。二重に鳴ると
       「書き出しと違う音」になり、原因が最も分かりにくい類の事故になる。
     ・巨大画像は最大 4096 に縮めて ImageBitmap で持つ（テクスチャ上限と
       メモリのため）。`createImageBitmap` が無い端末は `<img>` で代替。
     ・iOS の最初の再生は **ユーザー操作の中**で始めないといけないので、
       `unlock()` で全 video の play()→pause() を一度通す（await の前に
       play() を呼ぶ事が肝。await を挟むと操作の文脈が切れる）。

   ★ 触るときの注意
     ・`releaseUnused()` / `dispose()` は §13.3 の手順を省略しない:
       `pause()` → `removeAttribute("src")` → `load()` → objectURL を storage へ返す。
       どれか 1 つ抜くと iOS でメモリが戻らない。
     ・`<video>` は画面外に置くが **display:none にしない**（描画対象として
       デコードされなくなる端末が在る）。`position:absolute` + 8px + opacity:0。
     ・Resolved は eval.js の pool 使用時に **使い回される**ので、鍵として
       持ち続けてはいけない。持つのは `clip.id` と `assetId` の文字列だけ。
     ・`console` は呼ばない（core/log.js の scope 経由）。DOM の無い Node でも
       import だけは通る（試験は純関数だけを見る）。

   CONTRACT-NOTE (1): 契約書 §4 の口は `createSourcePool({ storage, project })`
     だが、ui/app.js は既に `{ storage, project, fps }` で呼んでいる（実物優先）。
     `fps` は **省略可**で、無ければ `project.settings.fps` を見る。素材側の
     量子化は素材 fps なので、この fps は「素材 fps が不明な時の最後の頼り」
     にしか使わない。
   CONTRACT-NOTE (2): 契約書 §4 の `textCanvas(resolved)` は engine/text.js への
     委譲だが その担当が未着。動的 import で在れば使い、無ければ once 警告して
     null を返す（静的 import にすると 隣 1 つの未着でプレビューが丸ごと死ぬ）。
     合成器（canvas2d.js）は自前の文字描画を持っているので実害は無い。
   CONTRACT-NOTE (3): 契約書 §4 の Source は `{kind,el,width,height,ready}`。
     ここでは静止フレーム代替を `kind:"canvas"` として返す（契約書の kind に
     在る）。壊れた素材と未読込は `kind:"empty"`（合成器は empty を飛ばす）。
   CONTRACT-NOTE (4): 共通前提は「700 行で分割」だが、分割先（engine/sources/*.js）
     は担当外で新規作成できない。章立て（§A 純関数 / §B 器 / §C video / §D 画像 /
     §E 契約の口）で読めるようにして 1 ファイルに収めた。分けるなら §A（純関数）が
     そのまま engine/sources-plan.js へ出せる形にしてある。
   CONTRACT-NOTE (5): 契約書の `acquire(resolved,{mode})` には「今 再生中か」を
     伝える口が無い。ui/app.js は 停止中の描き直しでも mode を渡さない（= "play"）
     ので、そのまま <video> を流すと 止まっているのに絵だけ先へ進む。そこで
     「要求された素材時刻が壁時計ほど進んでいない」状態が 2 回続いたら停止と見て
     pause + seek 側へ落ちる。playback.js が mode を渡すようになれば消して良い。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isIOS } from "../core/util.js";
import { sourceTimeAt } from "../core/eval.js";
import { assetById } from "../core/schema.js";
import { scope } from "../core/log.js";

const L = scope("sources");

/* engine/text.js は遅延で読む（CONTRACT-NOTE (2)） */
let TEXT = null;
try {
  import("./text.js").then((m) => { TEXT = m; }).catch(() => { /* 未着。null のまま */ });
} catch (_e) { /* 動的 import すら無い環境（Node の試験など） */ }

/* ══ 定数（契約書 §4 / §13.3 の数字はここだけに書く）═════════════════ */

/** <video> の同時本数（デスクトップ / iOS）。§13.3 */
export const POOL_DESKTOP = 4;
export const POOL_IOS = 2;
/** mode:"play" で currentTime を打ち直す ずれの境目（秒） */
export const PLAY_DRIFT = 0.08;
/** 打ち直しのクールダウン（秒）。連打でデコーダを詰まらせない */
export const RESYNC_COOLDOWN = 0.5;
/** seek を諦める時間（ms）。書き出しは長めに待つ（§13.3: 4K HEVC は 400〜1200ms） */
export const SEEK_TIMEOUT_MS = 1200;
export const SEEK_TIMEOUT_EXPORT_MS = 2000;
/** 先読みの既定（秒） */
export const LOOKAHEAD = 1.5;
/** 画像の最大辺（これを超えたら縮めて持つ） */
export const MAX_IMAGE_SIZE = 4096;
/** 静止フレーム代替の最大辺（メモリのため小さく持つ） */
export const STILL_MAX_SIZE = 1280;
/** ImageBitmap を残す本数（先読みの取り消しで毎回デコードし直さないため） */
export const IMAGE_CACHE = 8;
/** 同じ素材を 1 本の <video> で共有できる「位置の差」（秒）。1/25 相当 */
export const SHARE_TOL = 0.04;
/** プロキシ（720p 代理）を見に行く素材の大きさ。§13.3 */
export const PROXY_MIN_HEIGHT = 1081;
/** needs の優先度（collectNeeds が付ける） */
export const PRIO_NOW = 2;
export const PRIO_SOON = 1;
/** <video>.playbackRate が現実に効く範囲（外れたら seek で見せる） */
export const RATE_MIN = 0.0625;
export const RATE_MAX = 16;

/** 何も出せない時の Source（共有・凍結。呼ぶ側が書き換えない事） */
export const EMPTY_SOURCE = Object.freeze({
  kind: "empty", el: null, width: 0, height: 0, ready: false
});

const T_EPS = 1e-6;
const MEDIA_KINDS = { video: 1, image: 1 };

/* ── 小道具 ─────────────────────────────────────────────────────── */
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === undefined || v === null ? "" : String(v));
const nowMs = () => {
  const p = globalThis.performance;
  return p && typeof p.now === "function" ? p.now() : Date.now();
};

/* ══ §A 純関数（ここだけを node --test が見る）══════════════════════ */

/**
 * 素材側の fps（量子化に使う唯一の値）。§13.3
 * 素材が名乗らない時だけ プロジェクト fps に頼る。
 * @param {Object|null} asset @param {number} [projectFps=30] @returns {number}
 */
export function assetFpsOf(asset, projectFps) {
  const a = finite(asset && asset.fps, 0);
  if (a > 0.5 && a < 1000) return a;
  const p = finite(projectFps, 30);
  return p > 0.5 && p < 1000 ? p : 30;
}

/**
 * <video> を何本持つか。契約書 §13.3（iPhone 2 / デスクトップ 4）。
 * `max` を渡せば端末判定を上書きできる（書き出しの都合で削る時に使う）。
 * @param {{ios?:boolean, max?:number}} [opts] @returns {number}
 */
export function capacityFor(opts) {
  const o = opts || {};
  if (Number.isFinite(o.max)) return Math.max(0, Math.floor(o.max));
  let ios;
  if (o.ios === undefined) { try { ios = isIOS(); } catch (_e) { ios = false; } }
  else ios = !!o.ios;
  return ios ? POOL_IOS : POOL_DESKTOP;
}

/**
 * 素材時刻 → その時刻を含むフレームの番号（素材 fps で丸める。§13.3）。
 * @param {number} sourceTime @param {number} fps @returns {number}
 */
export function sourceFrameIndex(sourceTime, fps) {
  const f = finite(fps, 30) > 0 ? finite(fps, 30) : 30;
  const t = Math.max(0, finite(sourceTime, 0));
  return Math.max(0, Math.floor(t * f + 1e-6));
}

/**
 * seek で書き込む currentTime（フレームの**中央**。§13.3）。
 * 中央寄せは デコーダに「どのフレームか」を誤解させないための物で、
 * 書き出しの timestamp（i/fps）とは別。外へ漏らさない。
 * @param {number} sourceTime @param {number} fps @returns {number}
 */
export function seekTargetFor(sourceTime, fps) {
  const f = finite(fps, 30) > 0 ? finite(fps, 30) : 30;
  return (sourceFrameIndex(sourceTime, f) + 0.5) / f;
}

/**
 * seek が要るか（**同じ位置なら省略**）。
 * 既定のしきい値は 半フレーム（同じフレームの中なら絵は変わらない）。
 * @param {number} current 今の currentTime（NaN = まだ読めていない）
 * @param {number} target  行きたい素材時刻
 * @param {{fps?:number, eps?:number}} [opts]
 * @returns {boolean}
 */
export function shouldSeek(current, target, opts) {
  const o = opts || {};
  /* null/undefined は「不明」。Number(null) が 0 になる JS の癖に付き合わない
     （0 と誤解すると 頭のフレームで seek を省いて真っ黒を出す） */
  const c = current === null || current === undefined || current === "" ? NaN : Number(current);
  if (!Number.isFinite(c)) return true;              // 読めていない → 打つしかない
  const fps = finite(o.fps, 0);
  const tol = Number.isFinite(o.eps) ? Math.max(0, o.eps) : (fps > 0 ? 0.5 / fps : 1e-3);
  return Math.abs(c - finite(target, 0)) > tol;
}

/**
 * mode:"play" で currentTime を打ち直すか。
 * ずれが `drift`（既定 0.08s）を超え、かつ 前回の打ち直しから `cooldown`
 * （既定 0.5s）以上経っている時だけ true。時刻の単位は **秒**（now と lastAt は
 * 同じ単位なら何でも良い）。
 * @param {{current:number, target:number, now?:number, lastAt?:number,
 *          drift?:number, cooldown?:number}} o
 * @returns {boolean}
 */
export function shouldResync(o) {
  const p = o || {};
  const c = Number(p.current);
  if (!Number.isFinite(c)) return false;             // 打ち直す先が無い（未読込）
  const drift = Number.isFinite(p.drift) ? Math.max(0, p.drift) : PLAY_DRIFT;
  if (Math.abs(c - finite(p.target, 0)) <= drift) return false;
  const cd = Number.isFinite(p.cooldown) ? Math.max(0, p.cooldown) : RESYNC_COOLDOWN;
  const last = Number.isFinite(p.lastAt) ? p.lastAt : -Infinity;
  return !(finite(p.now, 0) - last < cd);
}

/**
 * 巨大な絵を縮める時の寸法と縮小率。長辺を `max` に収める（拡大はしない）。
 * @param {number} width @param {number} height @param {number} [max=4096]
 * @returns {{width:number, height:number, scale:number, resized:boolean}}
 */
export function planResize(width, height, max) {
  const m = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_IMAGE_SIZE;
  const w0 = Math.max(0, Math.round(finite(width, 0)));
  const h0 = Math.max(0, Math.round(finite(height, 0)));
  if (!(w0 > 0) || !(h0 > 0)) return { width: 0, height: 0, scale: 1, resized: false };
  const scale = m / Math.max(w0, h0);
  if (scale >= 1) return { width: w0, height: h0, scale: 1, resized: false };
  return {
    width: Math.max(1, Math.round(w0 * scale)),
    height: Math.max(1, Math.round(h0 * scale)),
    scale, resized: true
  };
}

/**
 * 「今 と これから `lookahead` 秒の間に要る素材」を並べる（純関数）。
 * これが `planAssignment()` の入力になる。audio トラックと hidden は見ない
 * （音は engine/audio の担当。絵の要求だけを出す）。
 * @param {Object} project @param {number} time
 * @param {{lookahead?:number, fps?:number}} [opts]
 * @returns {{clipId:string, assetId:string, kind:string, at:number, prio:number,
 *            sourceTime:number, trackId:string, dist:number}[]}
 */
export function collectNeeds(project, time, opts) {
  const o = opts || {};
  const look = Number.isFinite(o.lookahead) ? Math.max(0, o.lookahead) : LOOKAHEAD;
  const t = finite(time, 0);
  const out = [];
  for (const track of arr(project && project.tracks)) {
    if (!track || track.hidden) continue;
    if (str(track.kind) === "audio") continue;
    for (const clip of arr(track.clips)) {
      if (!clip || clip.hidden) continue;
      const kind = str(clip.kind);
      if (!MEDIA_KINDS[kind]) continue;                // 要るのは video / image だけ
      const assetId = str(clip.assetId);
      if (!assetId) continue;
      const start = finite(clip.start, 0);
      const end = start + Math.max(0, finite(clip.duration, 0));
      let at, prio, local;
      if (t >= start - T_EPS && t < end - T_EPS) { at = t; prio = PRIO_NOW; local = Math.max(0, t - start); }
      else if (start > t && start - t <= look + T_EPS) { at = start; prio = PRIO_SOON; local = 0; }
      else continue;
      out.push({
        clipId: str(clip.id), assetId, kind, at, prio,
        sourceTime: kind === "video" ? sourceTimeAt(clip, local) : 0,
        trackId: str(track.id), dist: Math.max(0, at - t)
      });
    }
  }
  out.sort(compareNeeds);
  return out;
}

/** need の強さ比べ: 優先度 → 近い順 → id（並びを決めておかないと試験が揺れる） */
function compareNeeds(a, b) {
  if (b.prio !== a.prio) return b.prio - a.prio;
  if (a.dist !== b.dist) return a.dist - b.dist;
  if (a.assetId !== b.assetId) return a.assetId < b.assetId ? -1 : 1;
  return a.clipId < b.clipId ? -1 : (a.clipId > b.clipId ? 1 : 0);
}

/**
 * <video> の割当を決める（**純関数**。DOM を触らない）。
 *
 *   ① needs を「同じ素材の同じ位置」でまとめる（= 1 本を共有できる組）
 *   ② 組を 優先度 → 先読み距離 の順に並べ、上から `capacity` 本だけ採る
 *   ③ 既に同じ clip / 同じ素材を持っている video を優先して使い回す
 *   ④ 空き枠が無ければ **LRU**（`lastUsed` の古い順）で追い出す
 *   ⑤ それでも溢れた組は `still`（静止フレームで代替。契約書 §13.3）
 *
 * @param {{needs?:Object[], capacity?:number, current?:Object[], time?:number,
 *          shareTol?:number}} input
 *   needs   = [{clipId, assetId, at, prio, sourceTime?, kind?}]
 *   current = [{slot?, clipId, assetId, lastUsed?, sourceTime?}]
 * @returns {{capacity:number, slots:Object[], assign:Object[], evict:Object[],
 *            idle:Object[], still:string[], shared:Object[]}}
 */
export function planAssignment(input) {
  const o = input || {};
  const time = finite(o.time, 0);
  const cap = Number.isFinite(o.capacity) ? Math.max(0, Math.floor(o.capacity)) : POOL_DESKTOP;
  const tol = Number.isFinite(o.shareTol) ? Math.max(0, o.shareTol) : SHARE_TOL;

  /* ① needs を整える（video だけ・assetId と clipId 必須・重複は強い方を残す） */
  const byClip = new Map();
  for (const n of arr(o.needs)) {
    if (!n) continue;
    const kind = str(n.kind);
    if (kind && kind !== "video") continue;          // image は <video> を要らない
    const clipId = str(n.clipId), assetId = str(n.assetId);
    if (!clipId || !assetId) continue;
    const item = {
      clipId, assetId,
      prio: finite(n.prio, 0),
      dist: Math.max(0, Number.isFinite(n.dist) ? n.dist : finite(n.at, time) - time),
      sourceTime: Math.max(0, finite(n.sourceTime, 0))
    };
    const prev = byClip.get(clipId);
    if (!prev || compareNeeds(item, prev) < 0) byClip.set(clipId, item);
  }

  /* ② 同素材・同位置でまとめる（位置の差が tol 以内なら 1 本で足りる） */
  const perAsset = new Map();
  for (const n of byClip.values()) {
    if (!perAsset.has(n.assetId)) perAsset.set(n.assetId, []);
    perAsset.get(n.assetId).push(n);
  }
  const groups = [];
  for (const [assetId, list] of perAsset) {
    list.sort((a, b) => (a.sourceTime - b.sourceTime) || (a.clipId < b.clipId ? -1 : 1));
    let g = null;
    for (const n of list) {
      if (!g || n.sourceTime - g.sourceTime > tol + T_EPS) {
        g = {
          key: assetId + "#" + groups.length, assetId, sourceTime: n.sourceTime,
          clipIds: [n.clipId], leader: n.clipId, prio: n.prio, dist: n.dist
        };
        groups.push(g);
      } else {
        g.clipIds.push(n.clipId);
        if (compareNeeds(n, { prio: g.prio, dist: g.dist, assetId, clipId: g.leader }) < 0) {
          g.leader = n.clipId; g.prio = n.prio; g.dist = n.dist;
        } else {
          if (n.prio > g.prio) g.prio = n.prio;
          if (n.dist < g.dist) g.dist = n.dist;
        }
      }
    }
  }
  groups.sort((a, b) => compareNeeds(
    { prio: a.prio, dist: a.dist, assetId: a.assetId, clipId: a.leader },
    { prio: b.prio, dist: b.dist, assetId: b.assetId, clipId: b.leader }
  ));

  /* ③ 今持っている物を正規化（slot 番号は 0..cap-1 の整数に押し込む） */
  const held = [];
  const usedIdx = new Set();
  for (const c of arr(o.current)) {
    if (!c) continue;
    const h = {
      slot: Number.isFinite(c.slot) ? Math.floor(c.slot) : -1,
      clipId: str(c.clipId), assetId: str(c.assetId),
      lastUsed: finite(c.lastUsed, 0),
      sourceTime: Math.max(0, finite(c.sourceTime, 0)),
      claimed: false
    };
    if (h.slot >= 0 && !usedIdx.has(h.slot)) usedIdx.add(h.slot);
    else h.slot = -1;                                  // 番号無し/衝突は後で詰める
    held.push(h);
  }
  for (const h of held) {
    if (h.slot >= 0) continue;
    let i = 0;
    while (usedIdx.has(i)) i++;
    h.slot = i; usedIdx.add(i);
  }
  /* 枠から溢れている物（本数を減らした直後など）は無条件で返す */
  const evict = [];
  const live = [];
  for (const h of held) {
    if (h.slot >= cap) evict.push({ slot: h.slot, clipId: h.clipId, assetId: h.assetId, why: "over" });
    else live.push(h);
  }

  /* ④ 採る組を決める（capacity 本だけ） */
  const wanted = groups.slice(0, cap);
  const still = [];
  for (const g of groups.slice(cap)) for (const id of g.clipIds) still.push(id);

  /* ⑤ 使い回し: 同じ clip を持つ video → 同じ素材を持つ video */
  const slots = [];
  const taken = new Set();
  const claim = (g, h, reused) => {
    taken.add(h.slot); h.claimed = true;
    slots.push({
      slot: h.slot, assetId: g.assetId, sourceTime: g.sourceTime, clipIds: g.clipIds.slice(),
      leader: g.leader, prio: g.prio, dist: g.dist, reused, prevClipId: h.clipId || null
    });
    g.slot = h.slot;
  };
  for (const g of wanted) {
    let hit = null;
    for (const h of live) {
      if (h.claimed || h.assetId !== g.assetId) continue;
      if (g.clipIds.indexOf(h.clipId) >= 0) { hit = h; break; }   // 同じ clip が最良
    }
    if (hit) claim(g, hit, true);
  }
  for (const g of wanted) {
    if (g.slot !== undefined) continue;
    let best = null;
    for (const h of live) {
      if (h.claimed || h.assetId !== g.assetId) continue;         // 同素材の使い回し
      if (!best) { best = h; continue; }
      const db = Math.abs(best.sourceTime - g.sourceTime), dh = Math.abs(h.sourceTime - g.sourceTime);
      if (dh < db || (dh === db && h.lastUsed > best.lastUsed)) best = h;
    }
    if (best) claim(g, best, true);
  }
  /* ⑥ 空き枠 → 無ければ LRU で追い出す */
  for (const g of wanted) {
    if (g.slot !== undefined) continue;
    let free = -1;
    for (let i = 0; i < cap; i++) {
      if (taken.has(i)) continue;
      if (live.some((h) => h.slot === i)) continue;
      free = i; break;
    }
    if (free >= 0) {
      taken.add(free);
      slots.push({
        slot: free, assetId: g.assetId, sourceTime: g.sourceTime, clipIds: g.clipIds.slice(),
        leader: g.leader, prio: g.prio, dist: g.dist, reused: false, prevClipId: null
      });
      g.slot = free;
      continue;
    }
    let victim = null;
    for (const h of live) {
      if (h.claimed) continue;
      if (!victim || h.lastUsed < victim.lastUsed ||
          (h.lastUsed === victim.lastUsed && h.slot < victim.slot)) victim = h;
    }
    if (!victim) { for (const id of g.clipIds) still.push(id); continue; }
    victim.claimed = true; taken.add(victim.slot);
    evict.push({ slot: victim.slot, clipId: victim.clipId, assetId: victim.assetId, why: "lru" });
    slots.push({
      slot: victim.slot, assetId: g.assetId, sourceTime: g.sourceTime, clipIds: g.clipIds.slice(),
      leader: g.leader, prio: g.prio, dist: g.dist, reused: false, prevClipId: victim.clipId || null
    });
    g.slot = victim.slot;
  }

  /* ⑦ 出力を組む */
  slots.sort((a, b) => a.slot - b.slot);
  const assign = [];
  for (const g of wanted) {
    if (g.slot === undefined) continue;
    const shared = g.clipIds.length > 1;
    for (const id of g.clipIds) {
      assign.push({
        clipId: id, assetId: g.assetId, slot: g.slot, sourceTime: g.sourceTime,
        prio: g.prio, dist: g.dist, shared, leader: id === g.leader
      });
    }
  }
  assign.sort((a, b) => (a.slot - b.slot) || (a.clipId < b.clipId ? -1 : 1));
  const idle = [];
  for (const h of live) {
    if (h.claimed || taken.has(h.slot)) continue;
    idle.push({ slot: h.slot, clipId: h.clipId, assetId: h.assetId });
  }
  const shared = slots.filter((s) => s.clipIds.length > 1)
    .map((s) => ({ assetId: s.assetId, slot: s.slot, clipIds: s.clipIds.slice() }));
  still.sort();
  return { capacity: cap, slots, assign, evict, idle, still, shared };
}

/* ══ §B 器（SourcePool 本体）════════════════════════════════════════ */

/**
 * 素材プールを作る（契約書 §4）。
 * @param {{storage?:Object|null, project?:Object|null, fps?:number,
 *          max?:number, ios?:boolean, seekTimeout?:number}} [opts]
 * @returns {Object} SourcePool
 */
export function createSourcePool(opts) {
  const o = opts || {};
  const storage = o.storage || null;
  let project = o.project || null;
  let projectFps = finite(o.fps, 0) || finite(project && project.settings && project.settings.fps, 30);
  const capacity = capacityFor({ ios: o.ios, max: o.max });
  const seekTimeout = Number.isFinite(o.seekTimeout) ? Math.max(50, o.seekTimeout) : SEEK_TIMEOUT_MS;

  /** @type {Object[]} slot の実体（必要になってから作る） */
  const slots = [];
  /** clipId → slot（prepare が置き、acquire が見る） */
  let route = new Map();
  /** 静止フレームで代替する clipId */
  let stillClips = new Set();
  /** assetId → { state, el, width, height, url, at } */
  const images = new Map();
  /** assetId → { canvas, width, height, sourceTime, at } 直近の絵（代替用） */
  const stills = new Map();
  /** 一度だけ warn する鍵 */
  const warned = new Set();
  /** 壊れている素材（二度と読みに行かない） */
  const broken = new Set();
  let disposed = false;
  let unlocked = false;
  let lastMode = "play";
  let inflight = null;                  // { t, mode, p } prepare の相乗り
  let autoPrepareAt = -Infinity;        // acquire からの取り寄せ連打を防ぐ

  const stats = {
    videos: 0, capacity, hits: 0, misses: 0,
    seekMs: 0, seeks: 0, timeouts: 0, stills: 0, evictions: 0,
    images: 0, broken: 0, unlocked: false, mode: lastMode
  };

  /** 同じ鍵では一度だけ warn する（毎フレーム呼ばれる所なので必須） */
  function warnOnce(key, ...args) {
    if (warned.has(key)) return;
    warned.add(key);
    L.warn(...args);
  }
  function markBroken(assetId, why) {
    const id = str(assetId);
    if (!id || broken.has(id)) return;
    broken.add(id);
    stats.broken = broken.size;
    warnOnce("broken:" + id, "素材を読めません（この素材は諦めます）", id, why);
  }

  /* ── 素材と URL ─────────────────────────────────────────────── */

  function assetOf(info) {
    if (info.asset) return info.asset;
    const id = info.assetId;
    if (!id) return null;
    return assetById(project, id);
  }
  function storeKeyOf(asset) {
    const s = asset && asset.storage;
    return s ? str(s.key) : "";
  }

  /**
   * <video>.src に入れる URL を借りる。1080p を超える素材は **代理（720p）**を
   * 先に見る（§13.3: 巨大 Blob の objectURL で iOS が落ちる）。書き出しは
   * 画質が要るので元を見る。
   * @returns {Promise<{url:string, kind:"proxy"|"asset", key:string}|null>}
   */
  async function urlFor(asset, mode) {
    const id = str(asset && asset.id);
    if (!id || broken.has(id)) return null;
    const big = finite(asset.height, 0) >= PROXY_MIN_HEIGHT || finite(asset.width, 0) > 1920;
    if (mode !== "export" && big && storage && typeof storage.getProxyURL === "function") {
      try {
        const u = await storage.getProxyURL(id);
        if (u) return { url: String(u), kind: "proxy", key: id };
      } catch (e) { warnOnce("proxy:" + id, "代理を読めません（元を見ます）", e); }
    }
    const key = storeKeyOf(asset);
    const kind = str(asset.storage && asset.storage.kind);
    /* CONTRACT-NOTE: storage.kind:"url" は契約書に無いが、取り込み直後の
       素材が objectURL だけを持つ形も在り得るので受ける（storage を汚さない）。 */
    if (kind === "url") {
      const u = str(asset.storage.url || key);
      return u ? { url: u, kind: "asset", key: "" } : null;
    }
    if (!key || !storage || typeof storage.getAssetURL !== "function") return null;
    try {
      const u = await storage.getAssetURL(key);
      if (!u) return null;
      return { url: String(u), kind: "asset", key };
    } catch (e) { markBroken(id, e); return null; }
  }

  function releaseURL(slot) {
    if (!slot.url) return;
    /* 代理（proxy）は storage が pin して持っている物なので返さない。
       素材の objectURL は 参照数を必ず戻す（§13.3 の後片付け）。 */
    if (slot.urlKind === "asset" && slot.urlKey && storage && typeof storage.releaseAssetURL === "function") {
      try { storage.releaseAssetURL(slot.urlKey); }
      catch (e) { warnOnce("release", "objectURL を返せませんでした", e); }
    }
    slot.url = ""; slot.urlKey = ""; slot.urlKind = "";
  }

  /* ══ §C <video> の面倒 ═══════════════════════════════════════ */

  /** 画面外の <video> を 1 本作る（DOM が無ければ null） */
  function makeVideoEl() {
    const d = globalThis.document;
    if (!d || typeof d.createElement !== "function") return null;
    let v;
    try { v = d.createElement("video"); } catch (_e) { return null; }
    /* 音は engine/audio の担当。ここは **必ず muted**（契約書 §4） */
    v.muted = true; v.defaultMuted = true; v.volume = 0;
    v.setAttribute("muted", "");
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "auto";
    v.autoplay = false;
    v.loop = false;
    try { v.disablePictureInPicture = true; } catch (_e) { /* 無い端末 */ }
    try { v.disableRemotePlayback = true; } catch (_e) { /* 同上 */ }
    /* display:none にすると デコードしない端末が在る。画面外に小さく置く */
    v.style.cssText = "position:absolute;left:-9999px;top:0;width:8px;height:8px;" +
      "opacity:0;pointer-events:none;z-index:-1";
    try { (d.body || d.documentElement).appendChild(v); } catch (_e) { /* 後で足す */ }
    return v;
  }

  /** slot を用意する（実体の <video> はここで初めて生まれる） */
  function slotAt(index) {
    let s = slots.find((x) => x.slot === index);
    if (s) return s;
    s = {
      slot: index, el: makeVideoEl(), assetId: "", clipId: "",
      url: "", urlKey: "", urlKind: "", fps: projectFps,
      ready: false, lastUsed: 0, lastSource: 0, lastResyncAt: -Infinity,
      lastWant: 0, lastWantAt: 0, stall: 0,
      wantSeek: null, seeking: false, chain: Promise.resolve(), meta: null, playing: false
    };
    slots.push(s);
    slots.sort((a, b) => a.slot - b.slot);
    stats.videos = slots.filter((x) => x.el).length;
    if (!s.el) warnOnce("nodom", "<video> を作れません（DOM の無い環境）");
    return s;
  }

  /** 絵を 1 枚控えておく（追い出す前に呼ぶ。溢れた clip の代替になる） */
  function snapshot(slot) {
    const el = slot.el;
    if (!el || !slot.assetId) return;
    const w = finite(el.videoWidth, 0), h = finite(el.videoHeight, 0);
    if (!(w > 0) || !(h > 0) || finite(el.readyState, 0) < 2) return;
    const d = globalThis.document;
    if (!d || typeof d.createElement !== "function") return;
    const fit = planResize(w, h, STILL_MAX_SIZE);
    try {
      const cv = d.createElement("canvas");
      cv.width = fit.width; cv.height = fit.height;
      const c = cv.getContext("2d");
      if (!c) return;
      c.drawImage(el, 0, 0, fit.width, fit.height);
      stills.set(slot.assetId, {
        canvas: cv, width: fit.width, height: fit.height,
        sourceTime: finite(el.currentTime, 0), at: nowMs()
      });
      while (stills.size > 6) {                       // メモリのため少しだけ持つ
        let oldest = null;
        for (const [k, v] of stills) if (!oldest || v.at < oldest[1].at) oldest = [k, v];
        if (!oldest) break;
        stills.delete(oldest[0]);
      }
    } catch (e) { warnOnce("snapshot", "静止フレームを控えられませんでした", e); }
  }

  /** §13.3 の後片付けを省略しない（pause → src 外す → load → URL を返す） */
  function detach(slot, keepStill) {
    const el = slot.el;
    if (keepStill !== false) snapshot(slot);
    if (el) {
      try { el.pause(); } catch (_e) { /* 既に止まっている */ }
      try { el.removeAttribute("src"); } catch (_e) { /* 同上 */ }
      try { el.load(); } catch (_e) { /* iOS でここを抜くとメモリが戻らない */ }
    }
    releaseURL(slot);
    slot.assetId = ""; slot.clipId = ""; slot.ready = false; slot.meta = null;
    slot.wantSeek = null; slot.playing = false; slot.lastResyncAt = -Infinity;
    slot.lastWant = 0; slot.lastWantAt = 0; slot.stall = 0;
  }

  /** src を付ける（同じ素材なら何もしない）。metadata まで待つ */
  async function attach(slot, assetId, mode) {
    if (slot.assetId === assetId && slot.url) return slot.ready || (await waitMeta(slot));
    const asset = assetById(project, assetId);
    if (!asset) { markBroken(assetId, "assets に在りません"); return false; }
    detach(slot);
    const got = await urlFor(asset, mode);
    if (!got) { markBroken(assetId, "URL を作れません"); return false; }
    if (disposed) { return false; }
    slot.assetId = assetId; slot.url = got.url; slot.urlKey = got.key; slot.urlKind = got.kind;
    slot.fps = assetFpsOf(asset, projectFps);
    const el = slot.el;
    if (!el) return false;
    try {
      el.muted = true;                                 // 念押し（契約書 §4）
      el.src = got.url;
      el.load();
    } catch (e) { markBroken(assetId, e); return false; }
    return await waitMeta(slot);
  }

  /** loadedmetadata を待つ（来なければ諦める。絵は次の機会に） */
  function waitMeta(slot) {
    const el = slot.el;
    if (!el) return Promise.resolve(false);
    if (finite(el.readyState, 0) >= 1 && finite(el.videoWidth, 0) > 0) { slot.ready = true; return Promise.resolve(true); }
    if (slot.meta) return slot.meta;
    let settled = false;
    const p = new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { el.removeEventListener("loadedmetadata", onOk); } catch (_e) { /* noop */ }
        try { el.removeEventListener("error", onErr); } catch (_e) { /* noop */ }
        clearTimeout(timer);
        settled = true;
        slot.ready = !!ok;
        resolve(!!ok);
      };
      const onOk = () => finish(true);
      const onErr = () => { markBroken(slot.assetId, "読み込みに失敗"); finish(false); };
      const timer = setTimeout(() => finish(finite(el.readyState, 0) >= 1), seekTimeout);
      try {
        el.addEventListener("loadedmetadata", onOk, { once: true });
        el.addEventListener("error", onErr, { once: true });
      } catch (_e) { finish(false); }
    });
    /* 同期で決着した（listener が付かない等）時に 済んだ promise を
       slot.meta に残すと、以後ずっと同じ返事を配って再試行できなくなる */
    slot.meta = settled ? null : p;
    p.then(() => { if (slot.meta === p) slot.meta = null; }, () => { if (slot.meta === p) slot.meta = null; });
    return p;
  }

  /** 絵が本当に来たのを確かめる（rVFC → 無ければ rAF 2 回 → 時間切れ） */
  function waitPainted(el, timeoutMs) {
    return new Promise((resolve) => {
      const d = globalThis.document;
      const hidden = !!(d && d.hidden);
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(fin, Math.max(16, timeoutMs));
      /* §13.3: requestVideoFrameCallback は **タブが隠れていると来ない** */
      if (!hidden && el && typeof el.requestVideoFrameCallback === "function") {
        try { el.requestVideoFrameCallback(() => fin()); return; }
        catch (_e) { /* 下の rAF へ落ちる */ }
      }
      const raf = globalThis.requestAnimationFrame;
      if (!hidden && typeof raf === "function") {
        try { raf(() => raf(() => fin())); return; } catch (_e) { /* noop */ }
      }
      setTimeout(fin, 24);
    });
  }

  /** currentTime を書いて "seeked" を待つ（§13.3 の唯一の手順） */
  function doSeek(slot, target, timeoutMs) {
    const el = slot.el;
    if (!el) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const t0 = nowMs();
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { el.removeEventListener("seeked", onSeeked); } catch (_e) { /* noop */ }
        try { el.removeEventListener("error", onErr); } catch (_e) { /* noop */ }
        clearTimeout(timer);
        stats.seeks++;
        stats.seekMs += Math.round(nowMs() - t0);
        if (!ok) stats.timeouts++;
        resolve(ok);
      };
      const onSeeked = () => { waitPainted(el, Math.max(120, timeoutMs / 4)).then(() => finish(true)); };
      const onErr = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);   // 諦めて直前の絵を返す
      try {
        el.addEventListener("seeked", onSeeked, { once: true });
        el.addEventListener("error", onErr, { once: true });
        if (!el.paused) { try { el.pause(); } catch (_e) { /* noop */ } slot.playing = false; }
        el.currentTime = target;
        slot.lastSource = target;
      } catch (e) { warnOnce("seek", "currentTime を書けませんでした", e); finish(false); }
    });
  }

  /**
   * seek を 1 本の列にする（同じ要素に 2 つ投げると "seeked" を取り違える）。
   * 擦っている間に溜まった要求は **最後の 1 つ**だけ実行する。
   */
  function kickSeek(slot, target, timeoutMs) {
    slot.wantSeek = target;
    if (slot.seeking) return slot.chain;
    slot.seeking = true;
    slot.chain = (async () => {
      try {
        let guard = 0;
        while (slot.wantSeek !== null && guard++ < 8 && !disposed) {
          const t = slot.wantSeek;
          slot.wantSeek = null;
          const el = slot.el;
          if (!el) break;
          if (!shouldSeek(el.currentTime, t, { fps: slot.fps })) break;   // 同位置は省略
          await doSeek(slot, t, timeoutMs);
        }
      } finally { slot.seeking = false; }
    })();
    return slot.chain;
  }

  /** slot → Source（契約書 §4 の形） */
  function sourceOf(slot) {
    const el = slot.el;
    if (!el) return EMPTY_SOURCE;
    const w = finite(el.videoWidth, 0), h = finite(el.videoHeight, 0);
    const ready = finite(el.readyState, 0) >= 2 && w > 0 && h > 0;
    return { kind: "video", el, width: w, height: h, ready };
  }

  /** 溢れた clip / 未読込の代替（直近の絵 → 無ければ empty） */
  function stillSource(assetId) {
    const s = stills.get(assetId);
    if (!s) return EMPTY_SOURCE;
    stats.stills++;
    return { kind: "canvas", el: s.canvas, width: s.width, height: s.height, ready: true };
  }

  /* ══ §D 画像（ImageBitmap で持つ）════════════════════════════ */

  async function decodeImage(blob, asset) {
    const ci = globalThis.createImageBitmap;
    if (typeof ci === "function") {
      /* 素材が寸法を名乗っていれば 1 回で縮めて decode する（メモリのため） */
      const known = planResize(finite(asset && asset.width, 0), finite(asset && asset.height, 0), MAX_IMAGE_SIZE);
      if (known.resized) {
        try {
          return await ci(blob, { resizeWidth: known.width, resizeHeight: known.height, resizeQuality: "high" });
        } catch (_e) { /* resize 付きが通らない端末 → 素で decode して縮める */ }
      }
      let bmp = await ci(blob);
      const fit = planResize(bmp.width, bmp.height, MAX_IMAGE_SIZE);
      if (!fit.resized) return bmp;
      try {
        const small = await ci(bmp, { resizeWidth: fit.width, resizeHeight: fit.height, resizeQuality: "high" });
        try { bmp.close(); } catch (_e) { /* noop */ }
        return small;
      } catch (_e) { return bmp; }                     // 縮められなくても絵は出す
    }
    /* createImageBitmap が無い端末: <img> + objectURL（release は自分で） */
    const URLc = globalThis.URL, d = globalThis.document;
    if (!URLc || !d || typeof d.createElement !== "function") throw new Error("画像を decode できません");
    const url = URLc.createObjectURL(blob);
    const img = d.createElement("img");
    img.decoding = "sync";
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("画像を読めません"));
      img.src = url;
    });
    img.__vqUrl = url;
    return img;
  }

  function dropImage(rec) {
    if (!rec || !rec.el) return;
    try { if (typeof rec.el.close === "function") rec.el.close(); } catch (_e) { /* noop */ }
    const u = rec.el && rec.el.__vqUrl;
    if (u && globalThis.URL && typeof globalThis.URL.revokeObjectURL === "function") {
      try { globalThis.URL.revokeObjectURL(u); } catch (_e) { /* noop */ }
    }
    rec.el = null; rec.state = "gone";
  }

  /** 画像を用意する（先読みで呼ぶ。同じ素材は 1 回だけ decode） */
  function ensureImage(assetId) {
    const id = str(assetId);
    if (!id || broken.has(id)) return null;
    const have = images.get(id);
    if (have && have.state !== "gone") { have.at = nowMs(); return have; }
    const rec = { state: "loading", el: null, width: 0, height: 0, at: nowMs(), p: null };
    images.set(id, rec);
    stats.images = images.size;
    rec.p = (async () => {
      try {
        const asset = assetById(project, id);
        if (!asset) throw new Error("assets に在りません");
        if (!storage || typeof storage.getAssetBlob !== "function") throw new Error("storage が在りません");
        const blob = await storage.getAssetBlob(storeKeyOf(asset));
        if (!blob) throw new Error("実体を読めません");
        const el = await decodeImage(blob, asset);
        if (disposed) { dropImage({ el }); return; }
        rec.el = el;
        rec.width = finite(el.width, 0) || finite(el.naturalWidth, 0);
        rec.height = finite(el.height, 0) || finite(el.naturalHeight, 0);
        rec.state = "ready";
      } catch (e) {
        rec.state = "error";
        markBroken(id, e);
      }
    })();
    return rec;
  }

  function imageSource(assetId) {
    const rec = images.get(str(assetId));
    if (!rec || rec.state !== "ready" || !rec.el) {
      ensureImage(assetId);
      stats.misses++;
      return EMPTY_SOURCE;
    }
    rec.at = nowMs();
    stats.hits++;
    return { kind: "image", el: rec.el, width: rec.width, height: rec.height, ready: true };
  }

  /* ══ §E 契約書 §4 の口 ═════════════════════════════════════════ */

  /** Resolved（eval.js）から要る所だけを写す。**Resolved は持ち続けない** */
  function infoOf(resolved) {
    const r = resolved || {};
    const clip = r.clip || {};
    const kind = str(r.kind || clip.kind);
    const assetId = str(r.assetId || clip.assetId);
    const start = finite(clip.start, 0);
    return {
      kind, assetId,
      clipId: str(clip.id) || ("_" + assetId),
      asset: r.asset || null,
      sourceTime: Math.max(0, finite(r.sourceTime, 0)),
      speed: finite(r.speed, 1),
      reverse: !!r.reverse,
      time: start + Math.max(0, finite(r.localTime, 0))
    };
  }

  /** clipId / assetId から今それを持っている slot を探す */
  function slotFor(info) {
    const byRoute = route.get(info.clipId);
    if (byRoute !== undefined) {
      const s = slots.find((x) => x.slot === byRoute);
      if (s && s.assetId === info.assetId) return s;
    }
    let best = null;
    for (const s of slots) {
      if (s.assetId !== info.assetId) continue;
      if (s.clipId === info.clipId) return s;
      if (!best || Math.abs(s.lastSource - info.sourceTime) < Math.abs(best.lastSource - info.sourceTime)) best = s;
    }
    return best;
  }

  /** timeout（書き出しは長めに待つ。§13.3） */
  const timeoutFor = (mode) => (mode === "export" ? Math.max(SEEK_TIMEOUT_EXPORT_MS, seekTimeout) : seekTimeout);

  function normMode(m) {
    const s = str(m);
    return s === "scrub" || s === "export" ? s : "play";
  }

  /* ── setProject ─────────────────────────────────────────────── */
  function setProject(next) {
    project = next || null;
    projectFps = finite(o.fps, 0) || finite(project && project.settings && project.settings.fps, projectFps);
    /* 消えた素材を掴んだままにしない（差し替え後の「前の絵」は事故の元） */
    for (const s of slots) {
      if (s.assetId && !assetById(project, s.assetId)) detach(s, false);
    }
    for (const [id, rec] of images) {
      if (!assetById(project, id)) { dropImage(rec); images.delete(id); }
    }
    for (const id of Array.from(stills.keys())) if (!assetById(project, id)) stills.delete(id);
    stats.images = images.size;
    route = new Map();
    stillClips = new Set();
  }

  /* ── prepare（先読み）──────────────────────────────────────── */
  /**
   * これから `lookahead` 秒の間に要る物を用意する。
   * 画像は decode を始め、video は src を付けて in 点付近へ currentTime を置く。
   * **今この瞬間に要る物だけを待つ**（先読みは待たない = 再生を止めない）。
   */
  function prepare(time, popts) {
    if (disposed) return Promise.resolve();
    const p = popts || {};
    const mode = normMode(p.mode || lastMode);
    lastMode = mode; stats.mode = mode;
    const t = finite(time, 0);
    if (inflight && inflight.mode === mode && Math.abs(inflight.t - t) < 1e-3) return inflight.p;
    const look = Number.isFinite(p.lookahead) ? Math.max(0, p.lookahead) : LOOKAHEAD;
    const run = (async () => {
      const needs = collectNeeds(project, t, { lookahead: look });
      for (const n of needs) if (n.kind === "image") ensureImage(n.assetId);
      const videoNeeds = needs.filter((n) => n.kind === "video" && !broken.has(n.assetId));
      const plan = planAssignment({
        needs: videoNeeds, capacity, time: t,
        current: slots.filter((s) => s.assetId).map((s) => ({
          slot: s.slot, clipId: s.clipId, assetId: s.assetId,
          lastUsed: s.lastUsed, sourceTime: s.lastSource
        }))
      });
      for (const e of plan.evict) {
        const s = slots.find((x) => x.slot === e.slot);
        if (s) { detach(s); stats.evictions++; }
      }
      const nextRoute = new Map();
      for (const a of plan.assign) nextRoute.set(a.clipId, a.slot);
      route = nextRoute;
      stillClips = new Set(plan.still);
      const urgent = [];
      for (const sp of plan.slots) {
        const slot = slotAt(sp.slot);
        const job = (async () => {
          const ok = await attach(slot, sp.assetId, mode);
          if (!ok || disposed) return;
          slot.clipId = sp.leader;                           // detach で消えるので attach の後
          /* 再生中で **既に持っていた** 枠は acquire の打ち直しに任せる。
             付け替えた直後の枠はここで合わせておく（1 フレーム目から正しい絵） */
          if (mode === "play" && sp.dist <= T_EPS && sp.reused) return;
          /* 先読み: in 点付近へ置いておく（ここで待っておくと入りが軽い） */
          const target = seekTargetFor(sp.sourceTime, slot.fps);
          if (shouldSeek(slot.el && slot.el.currentTime, target, { fps: slot.fps })) {
            await kickSeek(slot, target, timeoutFor(mode));
          }
        })();
        if (sp.dist <= T_EPS) urgent.push(job);
        else job.catch((e) => warnOnce("prepare:ahead", "先読みに失敗（あとで拾います）", e));
      }
      /* 画像も「今要る物」は待つ（1 フレーム目が空になるのを防ぐ） */
      for (const n of needs) {
        if (n.kind !== "image" || n.dist > T_EPS) continue;
        const rec = images.get(n.assetId);
        if (rec && rec.p) urgent.push(rec.p);
      }
      try { await Promise.all(urgent); } catch (e) { warnOnce("prepare", "用意に失敗（続けます）", e); }
    })();
    inflight = { t, mode, p: run };
    run.then(() => { if (inflight && inflight.p === run) inflight = null; },
      () => { if (inflight && inflight.p === run) inflight = null; });
    return run;
  }

  /* ── acquire（毎フレーム。同期で返す）─────────────────────── */
  /**
   * その時刻の絵を返す（**同期**。await できない所から呼ばれる）。
   * @param {Object} resolved core/eval.js の Resolved
   * @param {{mode?:"play"|"scrub"|"export"}} [aopts]
   * @returns {Object|null} Source（出せない時は kind:"empty"）
   */
  function acquire(resolved, aopts) {
    if (disposed) return EMPTY_SOURCE;
    const info = infoOf(resolved);
    if (info.kind === "image") {
      if (broken.has(info.assetId)) { stats.misses++; return EMPTY_SOURCE; }
      return imageSource(info.assetId);
    }
    if (info.kind !== "video" || !info.assetId) return null;   // 文字/図形はここの担当外
    /* 壊れた素材も「出せなかった」に数える（stats を見ている UI が気付ける） */
    if (broken.has(info.assetId)) { stats.misses++; return EMPTY_SOURCE; }
    const mode = normMode((aopts && aopts.mode) || lastMode);
    lastMode = mode; stats.mode = mode;

    const slot = slotFor(info);
    if (!slot || slot.assetId !== info.assetId) {
      /* 割当が無い（溢れた / まだ prepare していない）→ 静止フレームで代替。
         ついでに 取り寄せを一度だけ頼んでおく（連打しない） */
      const now = nowMs();
      if (!stillClips.has(info.clipId) && now - autoPrepareAt > 150) {
        autoPrepareAt = now;
        prepare(info.time, { lookahead: 0, mode }).catch(() => { /* 次の機会に */ });
      }
      stats.misses++;
      return stillSource(info.assetId);
    }
    slot.lastUsed = nowMs();
    slot.clipId = info.clipId;
    const el = slot.el;
    if (!el) { stats.misses++; return stillSource(info.assetId); }
    const fps = slot.fps || assetFpsOf(assetOf(info), projectFps);
    try { if (!el.muted) el.muted = true; } catch (_e) { /* noop */ }

    /* 時間が本当に進んでいるか（CONTRACT-NOTE (5)）。
       契約書の acquire には「再生中か」を伝える口が無く、止まっている間も
       mode:"play" で呼ばれる。要求された素材時刻が壁時計ほど進んでいなければ
       止まっていると見て、2 回続いたら pause + seek 側へ落ちる。 */
    const nowSec0 = nowMs() / 1000;
    const dtWall = slot.lastWantAt ? nowSec0 - slot.lastWantAt : 0;
    const dWant = info.sourceTime - slot.lastWant;
    slot.lastWant = info.sourceTime; slot.lastWantAt = nowSec0;
    if (dtWall > 0.03 && Math.abs(dWant) < dtWall * 0.25) slot.stall++;
    else slot.stall = 0;
    const running = slot.stall < 2;

    if (running && mode === "play" && !info.reverse && info.speed >= RATE_MIN && info.speed <= RATE_MAX) {
      /* 再生で合わせる（seek しない）。ずれた時だけ打ち直す */
      try {
        const rate = clamp(info.speed, RATE_MIN, RATE_MAX);
        if (Math.abs(finite(el.playbackRate, 1) - rate) > 1e-3) el.playbackRate = rate;
        if (el.paused && finite(el.readyState, 0) >= 2) {
          const pr = el.play();
          if (pr && typeof pr.catch === "function") {
            pr.catch((e) => warnOnce("play", "再生を始められません（unlock() を通してください）", e));
          }
          slot.playing = true;
        }
      } catch (e) { warnOnce("rate", "再生の設定に失敗", e); }
      const nowSec = nowMs() / 1000;
      if (shouldResync({
        current: el.currentTime, target: info.sourceTime,
        now: nowSec, lastAt: slot.lastResyncAt
      })) {
        try { el.currentTime = info.sourceTime; slot.lastResyncAt = nowSec; }
        catch (e) { warnOnce("resync", "currentTime を打ち直せませんでした", e); }
      }
    } else {
      /* scrub / export / 逆再生 / 極端な速度 → 静止画として合わせる。
         ここでは **待たない**（次のフレームで正しい絵になる）。
         「本当にその絵」が要る所は seekExact() を使う。 */
      if (!el.paused) { try { el.pause(); } catch (_e) { /* noop */ } slot.playing = false; }
      const target = seekTargetFor(info.sourceTime, fps);
      if (shouldSeek(el.currentTime, target, { fps })) {
        kickSeek(slot, target, timeoutFor(mode)).catch(() => { /* 次の機会に */ });
      }
    }
    slot.lastSource = finite(el.currentTime, slot.lastSource);
    const src = sourceOf(slot);
    if (src.ready) stats.hits++;
    else {
      stats.misses++;
      const alt = stills.get(info.assetId);
      if (alt) return stillSource(info.assetId);       // 前の絵で繋ぐ（真っ黒より良い）
    }
    return src;
  }

  /* ── seekExact（書き出し / 擦り）────────────────────────────── */
  /**
   * その素材時刻の絵が **本当に来る**まで待つ（契約書 §4 / §13.3）。
   * 同じ位置なら何もしない。時間切れなら直前の絵を返す（throw しない:
   * 1 フレームのために書き出し全部を落とす方が損）。
   * @param {Object} resolved @returns {Promise<Object>} Source
   */
  async function seekExact(resolved) {
    if (disposed) return EMPTY_SOURCE;
    const info = infoOf(resolved);
    if (info.kind === "image") {
      if (broken.has(info.assetId)) { stats.misses++; return EMPTY_SOURCE; }
      const rec = ensureImage(info.assetId);
      if (rec && rec.p) { try { await rec.p; } catch (_e) { /* markBroken 済み */ } }
      return imageSource(info.assetId);
    }
    if (info.kind !== "video" || !info.assetId) return EMPTY_SOURCE;
    if (broken.has(info.assetId)) { stats.misses++; return EMPTY_SOURCE; }
    const mode = normMode(lastMode === "play" ? "scrub" : lastMode);
    let slot = slotFor(info);
    if (!slot || slot.assetId !== info.assetId) {
      await prepare(info.time, { lookahead: 0, mode });
      slot = slotFor(info);
    }
    if (!slot) { stats.misses++; return stillSource(info.assetId); }
    if (slot.assetId !== info.assetId) {
      const ok = await attach(slot, info.assetId, mode);
      if (!ok) { stats.misses++; return stillSource(info.assetId); }
    }
    slot.lastUsed = nowMs();
    slot.clipId = info.clipId;
    const el = slot.el;
    if (!el) { stats.misses++; return stillSource(info.assetId); }
    if (finite(el.readyState, 0) < 1) await waitMeta(slot);
    const fps = slot.fps || assetFpsOf(assetOf(info), projectFps);
    const target = seekTargetFor(info.sourceTime, fps);
    if (!shouldSeek(el.currentTime, target, { fps })) {
      stats.hits++;
      slot.lastSource = finite(el.currentTime, target);
      const hit = sourceOf(slot);
      return hit.ready ? hit : (stills.has(info.assetId) ? stillSource(info.assetId) : hit);
    }
    await kickSeek(slot, target, timeoutFor(mode));
    slot.lastSource = finite(el.currentTime, target);
    const src = sourceOf(slot);
    if (src.ready) { stats.hits++; snapshot(slot); return src; }
    stats.misses++;
    return stills.has(info.assetId) ? stillSource(info.assetId) : src;
  }

  /* ── textCanvas（engine/text.js へ委譲）──────────────────────── */
  /**
   * 文字を焼いた canvas（契約書 §4）。engine/text.js が未着の間は null。
   * @param {Object} resolved @returns {HTMLCanvasElement|null}
   */
  function textCanvas(resolved) {
    const m = TEXT;
    const fn = m && (m.textCanvas || m.renderTextCanvas || m.textToCanvas || m.default);
    if (typeof fn !== "function") {
      warnOnce("text", "engine/text.js が未着のため文字は合成器側の簡易描画になります");
      return null;
    }
    const s = (project && project.settings) || {};
    try {
      return fn(resolved, {
        width: finite(s.width, 1920), height: finite(s.height, 1080),
        fps: projectFps, project
      }) || null;
    } catch (e) { warnOnce("textCall", "engine/text.js が投げました", e); return null; }
  }

  /* ── releaseUnused / stats / dispose ────────────────────────── */
  /**
   * その時刻に要らない物を手放す（§13.3 の後片付けを全部やる）。
   * 画像は少しだけ残す（先読みの取り消しで毎回 decode し直すと重い）。
   */
  function releaseUnused(time) {
    if (disposed) return;
    const needs = collectNeeds(project, finite(time, 0), { lookahead: LOOKAHEAD });
    const keepVideo = new Set(), keepImage = new Set();
    for (const n of needs) (n.kind === "image" ? keepImage : keepVideo).add(n.assetId);
    for (const s of slots) {
      if (!s.assetId || keepVideo.has(s.assetId)) continue;
      detach(s);                                        // 絵を控えてから外す
      stats.evictions++;
    }
    const spare = [];
    for (const [id, rec] of images) {
      if (keepImage.has(id) || rec.state === "loading") continue;
      spare.push([id, rec]);
    }
    spare.sort((a, b) => finite(a[1].at, 0) - finite(b[1].at, 0));
    while (images.size > IMAGE_CACHE && spare.length) {
      const [id, rec] = spare.shift();
      dropImage(rec);
      images.delete(id);
    }
    stats.images = images.size;
    route = new Map(Array.from(route).filter(([, sl]) => {
      const s = slots.find((x) => x.slot === sl);
      return !!(s && s.assetId);
    }));
  }

  /** UI が「重い」を知るための数（契約書 §4 + seekMs） */
  function statsOf() {
    return Object.assign({}, stats, {
      videos: slots.filter((s) => s.el && s.assetId).length,
      pool: slots.length,
      capacity,
      images: images.size,
      stillsHeld: stills.size,
      broken: broken.size,
      unlocked,
      seekMsAvg: stats.seeks ? Math.round(stats.seekMs / stats.seeks) : 0
    });
  }

  /**
   * iOS の「最初の再生はユーザー操作の中で」を通す（契約書 §4）。
   * **await の前に play() を呼ぶ**（await を挟むと操作の文脈が切れて弾かれる）。
   * @returns {Promise<boolean>}
   */
  function unlock() {
    if (disposed) return Promise.resolve(false);
    for (let i = 0; i < capacity; i++) slotAt(i);        // 本数分を先に作る
    const waits = [];
    for (const s of slots) {
      const el = s.el;
      if (!el) continue;
      try {
        el.muted = true;
        const p = el.play();
        if (p && typeof p.then === "function") {
          waits.push(p.then(() => { try { el.pause(); } catch (_e) { /* noop */ } },
            () => { /* src 無しでは弾かれる。それでも「一度触った」事に意味が在る */ }));
        } else { try { el.pause(); } catch (_e) { /* noop */ } }
      } catch (_e) { /* 弾かれても続ける */ }
    }
    unlocked = true;
    stats.unlocked = true;
    return Promise.all(waits).then(() => true, () => true);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const s of slots) {
      detach(s, false);
      const el = s.el;
      if (el && el.parentNode) { try { el.parentNode.removeChild(el); } catch (_e) { /* noop */ } }
      s.el = null;
    }
    slots.length = 0;
    for (const [, rec] of images) dropImage(rec);
    images.clear();
    stills.clear();
    route = new Map();
    stillClips = new Set();
    stats.videos = 0;
  }

  return {
    setProject, prepare, acquire, seekExact, textCanvas,
    releaseUnused, stats: statsOf, unlock, dispose,
    /** デバッグ用（selftest.html が覗く）。契約に無い物なので当てにしない */
    get capacity() { return capacity; },
    get mode() { return lastMode; }
  };
}

export default createSourcePool;
