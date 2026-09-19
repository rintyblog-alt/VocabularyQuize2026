/* ══════════════════════════════════════════════════════════════════════
   core/ops.js — 編集操作（op）の全部。UI も AI も必ずここを通る

   ★ 何をする所か
     ・`OPS["<type>"](draft, payload, ctx)` が **draft（project の clone）を
       直に書き換える**。DOM も async も無い純粋な関数の集まり（契約書 §3）。
     ・`applyOp(draft, type, payload, ctx)` は名前で引いて呼ぶだけの入口。
       知らない type は `OpError`。
     ・`OP_LABELS` は取消履歴とメニューに出す日本語の表示名。
     ・返り値は「直後に選択・追記したい物の id」（契約書 §12-3）。
       clip.add → `{ clipId, id }` / clip.split → `{ ids:[a,b] }` /
       track.add → `{ trackId, id }` / asset.add → `{ assetId, id }`。
       複数を相手にする op は `{ ids:[...] }` か `{ removed: n }` を返す。

   ★ なぜこの形か
     ・編集の意味（重なりをどう削るか・尺と素材範囲をどう合わせるか）が
       UI と AI の 2 か所に在ると必ず食い違う。だから **ここだけ**が
       「置く・削る・割る」の規則を知っている。UI は吸着（snap）と選択、
       AI は「どの op を何秒で呼ぶか」だけを決める。
     ・schema.js が既定値と不変条件の持ち主なので、器は必ず `newClip()` 等で
       作る。ops は器を自作しない。
     ・`normalizeProject()` を毎 op で通すと project 全体を組み立て直すので
       重い（タイムラインのドラッグで毎フレーム呼ばれる）。代わりに
       **触ったトラックだけ**を `tidyTrack()` で直す。直し方は
       schema.js の `layoutClips` / `fitTransitions` と同じ規則に揃えてある
       （食い違うと保存の往復で編集結果が動いてしまう）。

   ★ 触るときの注意
     ・op は **投げるなら書き換える前に投げる**。途中で throw すると draft が
       半端な形で残る（store はスナップショット方式なので捨てられるが、
       直に OPS を呼ぶ側のために前で検める）。
     ・秒はすべて浮動小数。フレーム丸めは UI（と key.add の t）だけが行う。
       ops が勝手に丸めると AI の計算した尺が動く。
     ・キーフレームの `t` は clip ローカル秒。区間 [k(i), k(i+1)) の補間は
       **k(i).ease** を使う（core/eval.js もこの約束で書くこと。ここの
       `sampleKeyList` が分割・トリム時の境界キーの値を出す唯一の場所）。
     ・`speedRamp` が在るときの素材範囲の換算は ∫v dt（区分線形の台形積分）。
       `speed` は ramp が無いときの定数（契約書 §2）。分割・トリムは
       この積分と その逆関数だけで書いてある。

   CONTRACT-NOTE: 共通前提は「1 ファイル 700 行を超えたら分割」だが、
     分割先（core/ops/*.js）は担当外なので新しいファイルを作れない。
     読む人のために章立て（§A〜§J）を入れて 1 ファイルに収めた。
     統合担当が分けるときは §C 以降の章ごとに切り出せば import は
     `./schema.js` `./util.js` `./time.js` のままで動く。
   ══════════════════════════════════════════════════════════════════════ */

import {
  MIN_CLIP, MAX_TRACKS, TRACK_KINDS, CLIP_KINDS, EASES, RATIOS,
  newClip, newTrack, newAsset, newMarker, newChapter,
  cloneClip, findClip, assetById, clipEnd, trackEnd,
  getPath, isKeyablePath,
  defaultTransform, defaultColorGrade, defaultMask, defaultChroma,
  defaultTextSpec, defaultTextStyle, defaultShape
} from "./schema.js";
import { uid, deepClone, clamp, finite, lerp, hexLerp, easeFor } from "./util.js";
import { snapFrame, frameDur } from "./time.js";

/* ══ §A 例外と小道具 ═══════════════════════════════════════════════ */

/**
 * 編集できなかった理由。**呼び出し側が復帰できる形**で投げる
 * （message は日本語そのまま UI に出す。detail は限界値や id）。
 */
export class OpError extends Error {
  /**
   * @param {string} message 日本語の理由
   * @param {Object} [detail] 復帰に使える情報（max / clipId 等）
   */
  constructor(message, detail) {
    super(str(message) || "編集できませんでした");
    this.name = "OpError";
    /** @type {Object|null} */
    this.detail = detail && typeof detail === "object" ? detail : null;
  }
}

const EPS = 1e-6;
/** 同じ t と見なす幅（schema.normKeys の重複判定と同じ） */
const KEY_EPS = 1e-6;
/** in/out が意味を持つ kind（schema.js の HAS_SRC と同じ） */
const HAS_SRC = { video: true, audio: true, compound: true };
/** 素材（assetId）が要る kind */
const NEEDS_ASSET = { video: true, image: true, audio: true };
/** compound の入れ子の深さ上限（契約書 §1） */
const MAX_DEPTH = 2;
/** 置き方（clip.add / move / paste 共通） */
const PLACE_MODES = ["overwrite", "insert", "fit"];

function str(v) { return typeof v === "string" ? v : (v === undefined || v === null ? "" : String(v)); }
/** 数として読めなければ NaN（util.finite は fallback へ落とすので、
    「来ていない／壊れている」を投げ分けたい所ではこちらを使う） */
function numOrNaN(v) { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : NaN; }
/** -0 を外へ出さない（表示と === 0 の比較で厄介なだけ） */
function nz(v) { return v === 0 ? 0 : v; }
function plain(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
function arr(v) { return Array.isArray(v) ? v : []; }
function bool(v, d) { return typeof v === "boolean" ? v : !!d; }
function hasSrc(clip) { return !!HAS_SRC[str(clip && clip.kind)]; }
function byStart(a, b) { return a.start - b.start; }
function byT(a, b) { return a.t - b.t; }

/** 必須の文字列（無ければ OpError） */
function need(v, what) {
  const s = str(v);
  if (!s) throw new OpError(`${what} が必要です`);
  return s;
}
/** 置き方の検め。知らない名前は既定へ落とさず投げる（呼び出しの誤りを隠さない） */
function modeOf(v, d) {
  if (v === undefined || v === null || v === "") return d || "overwrite";
  const s = str(v);
  if (PLACE_MODES.indexOf(s) < 0) throw new OpError(`mode は ${PLACE_MODES.join("/")} のどれかです（来たのは ${s}）`, { mode: s });
  return s;
}
/** payload から clipId / clipIds を拾って重複を落とす */
function idsOf(p, key) {
  const one = key ? key : "clipId";
  const many = one + "s";
  const out = [];
  const seen = new Set();
  const push = (v) => { const s = str(v); if (s && !seen.has(s)) { seen.add(s); out.push(s); } };
  if (Array.isArray(p[many])) for (const v of p[many]) push(v);
  push(p[one]);
  if (!out.length) throw new OpError(`${one} か ${many} が必要です`);
  return out;
}

/* ── ctx（op が共有する作業場）───────────────────────────────────
   ・fps … 既定は project の settings。key.add の t 丸めに使う。
   ・playhead … at を省いた op の既定位置（store が view を渡す）。
   ・touched … 触ったトラック。op の最後にここだけ整合処理を通す。
   入れ子で op を呼んでも作業場は 1 つで済むように、既に ctx なら使い回す。 */
function work(draft, ctx) {
  if (ctx && ctx.__ops === true) return ctx;
  const c = plain(ctx) || {};
  const view = plain(c.view) || {};
  const sel = plain(c.selection) || {};
  const fps = clamp(finite(c.fps, finite(plain(draft) && plain(draft.settings) ? draft.settings.fps : 30, 30)), 1, 240);
  return {
    __ops: true,
    fps,
    now: Math.round(finite(c.now, Date.now())),
    playhead: Math.max(0, finite(c.playhead !== undefined ? c.playhead : view.playhead, 0)),
    selection: sel,
    raw: c,
    touched: new Set(),
    amap: null,
    /** @param {Object} track */
    touch(track) { if (track) this.touched.add(track); }
  };
}

/** 素材表（op 1 回の間だけ持つ。asset.* の後は捨てる） */
function assetMap(draft, c) {
  if (!c.amap) {
    c.amap = new Map();
    for (const a of arr(draft && draft.assets)) if (a && a.id) c.amap.set(str(a.id), a);
  }
  return c.amap;
}
function assetFor(draft, clip, c) {
  const id = clip && clip.assetId ? str(clip.assetId) : "";
  return id ? (assetMap(draft, c).get(id) || null) : null;
}

/* ── 探す（見つからなければ OpError）──────────────────────────── */

function needTrack(draft, trackId) {
  const id = need(trackId, "trackId");
  for (const t of arr(draft && draft.tracks)) if (t && str(t.id) === id) return t;
  throw new OpError(`トラック ${id} が見つかりません`, { trackId: id });
}
function trackById(draft, trackId) {
  const id = str(trackId);
  for (const t of arr(draft && draft.tracks)) if (t && str(t.id) === id) return t;
  return null;
}
/** @returns {{clip:Object, track:Object, index:number}} */
function needClipAt(draft, clipId) {
  const id = need(clipId, "clipId");
  const found = findClip(draft, id);
  if (!found) throw new OpError(`クリップ ${id} が見つかりません`, { clipId: id });
  if (found.clip.locked) throw new OpError(`クリップ ${id} は鍵が掛かっています`, { clipId: id, locked: true });
  return found;
}
/** 鍵を見ない版（鍵の付け外し・選択・解錠に使う） */
function findClipAt(draft, clipId) {
  const id = need(clipId, "clipId");
  const found = findClip(draft, id);
  if (!found) throw new OpError(`クリップ ${id} が見つかりません`, { clipId: id });
  return found;
}

/* ══ §B 速度・素材時間の換算（∫v dt）═════════════════════════════
   速度は区分線形 v(l)（l は clip ローカル秒）。ramp が無ければ定数 speed。
   ・素材時間 = in + ∫₀^l v dl（逆再生は out − ∫）
   ・尺 → 素材量 は積分、素材量 → 尺 は その逆関数（区間ごとに 2 次式を解く）
   ramp の外側（l<0 や 最後の点より後ろ）は端の値で一定に伸ばす。こうすると
   トリムで尺を伸ばしたときに素材の消費量が飛ばない。 */

/** ramp を区間の列にする。最後の区間は t1=Infinity（端の値で一定） */
function rateSegs(clip) {
  const sp = clamp(Math.abs(finite(clip && clip.speed, 1)) || 1, 0.02, 100);
  const raw = arr(clip && clip.speedRamp)
    .map((k) => ({ t: Math.max(0, finite(k && k.t, 0)), v: clamp(Math.abs(finite(k && k.v, 1)) || 1, 0.02, 100) }))
    .sort(byT);
  const pts = [];
  for (const q of raw) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.t - q.t) <= EPS) pts[pts.length - 1] = q;
    else pts.push(q);
  }
  if (!pts.length) return [{ t0: 0, t1: Infinity, v0: sp, v1: sp }];
  const segs = [];
  if (pts[0].t > EPS) segs.push({ t0: 0, t1: pts[0].t, v0: pts[0].v, v1: pts[0].v });
  for (let i = 1; i < pts.length; i++) segs.push({ t0: pts[i - 1].t, t1: pts[i].t, v0: pts[i - 1].v, v1: pts[i].v });
  const last = pts[pts.length - 1];
  segs.push({ t0: last.t, t1: Infinity, v0: last.v, v1: last.v });
  return segs;
}

function segRate(g, t) {
  if (!Number.isFinite(g.t1) || g.t1 - g.t0 <= EPS) return g.v0;
  return lerp(g.v0, g.v1, clamp((t - g.t0) / (g.t1 - g.t0), 0, 1));
}

/** その local 秒での倍率（範囲外は端の値） */
function rateAt(clip, l) {
  const segs = rateSegs(clip);
  const t = finite(l, 0);
  if (t <= 0) return segs[0].v0;
  for (const g of segs) if (t >= g.t0 - EPS && (t <= g.t1 + EPS || !Number.isFinite(g.t1))) return segRate(g, t);
  return segs[segs.length - 1].v0;
}

/** ∫v dl を a→b（a>b でも符号付きで返す。a<0 は先頭の値で外挿） */
function integ(clip, a, b) {
  const lo = Math.min(finite(a, 0), finite(b, 0));
  const hi = Math.max(finite(a, 0), finite(b, 0));
  const sign = finite(b, 0) < finite(a, 0) ? -1 : 1;
  const segs = rateSegs(clip);
  let s = 0;
  if (lo < 0) s += segs[0].v0 * (Math.min(hi, 0) - lo);
  const from = Math.max(lo, 0);
  if (hi > from) {
    for (const g of segs) {
      const x0 = Math.max(from, g.t0);
      const x1 = Math.min(hi, Number.isFinite(g.t1) ? g.t1 : hi);
      if (!(x1 > x0 + 0)) continue;
      s += ((segRate(g, x0) + segRate(g, x1)) / 2) * (x1 - x0);
    }
  }
  return sign * s;
}

/** ∫₀^l v dl = span となる l（span<0 なら 0 より手前へ外挿） */
function invInteg(clip, span) {
  const want = finite(span, 0);
  const segs = rateSegs(clip);
  if (want <= 0) return want / segs[0].v0;   // 先頭の外側は一定
  let rem = want;
  for (const g of segs) {
    const dt = g.t1 - g.t0;
    if (!Number.isFinite(dt)) return g.t0 + rem / g.v0;
    const cap = ((g.v0 + g.v1) / 2) * dt;
    if (rem <= cap + EPS) {
      const a = (g.v1 - g.v0) / dt;            // 傾き
      let x;
      if (Math.abs(a) < 1e-9) x = rem / g.v0;
      else {
        const disc = g.v0 * g.v0 + 2 * a * rem;
        x = (Math.sqrt(Math.max(0, disc)) - g.v0) / a;
      }
      return g.t0 + clamp(x, 0, dt);
    }
    rem -= cap;
  }
  return segs[segs.length - 1].t0;
}

/** 素材側の尺の上限（分からなければ Infinity）。compound は中身の尺 */
function srcLimit(clip, asset) {
  if (clip && str(clip.kind) === "compound") {
    const tr = clip.compound && clip.compound.tracks;
    if (!Array.isArray(tr) || !tr.length) return Infinity;
    let e = 0;
    for (const t of tr) { const x = trackEnd(t); if (x > e) e = x; }
    return e > 0 ? e : Infinity;
  }
  const d = asset ? finite(asset.duration, 0) : 0;
  return d > 0 ? d : Infinity;
}

/** local 秒 → 素材秒（in/out の外へは出さない） */
function srcAt(clip, l) {
  if (!hasSrc(clip)) return 0;
  const i = Math.max(0, finite(clip.in, 0));
  const o = finite(clip.out, i);
  const used = integ(clip, 0, finite(l, 0));
  return clip.reverse ? clamp(o - used, i, o) : clamp(i + used, i, o);
}

/** その clip がタイムライン上で取れる最大の尺（素材の残りから出す） */
function maxDurOf(clip, asset) {
  if (!hasSrc(clip)) return Infinity;
  const lim = srcLimit(clip, asset);
  const i = Math.max(0, finite(clip.in, 0));
  const o = finite(clip.out, i);
  const avail = clip.reverse ? o : (Number.isFinite(lim) ? Math.max(0, lim - i) : Infinity);
  if (!Number.isFinite(avail)) return Infinity;
  return Math.max(MIN_CLIP, invInteg(clip, avail));
}

/** 頭と尻をそれぞれ どれだけ伸ばせるか（local 秒） */
function trimRoom(clip, asset) {
  if (!hasSrc(clip)) return { head: Infinity, tail: Infinity };
  const lim = srcLimit(clip, asset);
  const i = Math.max(0, finite(clip.in, 0));
  const o = finite(clip.out, i);
  const above = Number.isFinite(lim) ? Math.max(0, lim - o) : Infinity;   // out より後ろの余り
  const below = Math.max(0, i);                                          // in より前の余り
  const headSrc = clip.reverse ? above : below;
  const tailSrc = clip.reverse ? below : above;
  const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  return {
    head: Number.isFinite(headSrc) ? headSrc / rateAt(clip, 0) : Infinity,
    tail: Number.isFinite(tailSrc) ? Math.max(0, invInteg(clip, integ(clip, 0, D) + tailSrc) - D) : Infinity
  };
}

/* ══ §C キーフレームと ramp の切り分け ═══════════════════════════ */

/**
 * キー列の t での値（区間 [k(i),k(i+1)) は k(i).ease で補間）。
 * 色は #hex のまま混ぜる（util.hexLerp）。範囲外は端の値を保つ。
 * @returns {{v:number|string, ease:string, bez:number[]|null}|null}
 */
function sampleKeyList(list, t) {
  const ks = arr(list).filter((k) => plain(k) && Number.isFinite(finite(k.t, NaN)));
  if (!ks.length) return null;
  ks.sort(byT);
  const x = finite(t, 0);
  if (x <= ks[0].t + EPS) return { v: ks[0].v, ease: str(ks[0].ease) || "linear", bez: arr(ks[0].bez).length ? ks[0].bez.slice() : null };
  const last = ks[ks.length - 1];
  if (x >= last.t - EPS) return { v: last.v, ease: str(last.ease) || "linear", bez: arr(last.bez).length ? last.bez.slice() : null };
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1].t <= x) i++;
  const a = ks[i], b = ks[i + 1];
  const span = b.t - a.t;
  const f = span > EPS ? easeFor(str(a.ease) || "linear", a.bez)(clamp((x - a.t) / span, 0, 1)) : 0;
  const v = (typeof a.v === "string" || typeof b.v === "string")
    ? hexLerp(str(a.v), str(b.v), f)
    : lerp(finite(a.v, 0), finite(b.v, 0), f);
  return { v, ease: str(a.ease) || "linear", bez: arr(a.bez).length ? a.bez.slice() : null };
}

function mkKey(t, sample) {
  const k = { t: Math.max(0, finite(t, 0)), v: sample.v, ease: EASES.indexOf(str(sample.ease)) >= 0 ? str(sample.ease) : "linear" };
  if (k.ease === "bezier") k.bez = arr(sample.bez).length >= 4 ? sample.bez.slice(0, 4).map((n) => finite(n, 0)) : [0.25, 0.1, 0.25, 1];
  return k;
}

/** t 昇順・同 t は後勝ちに揃える（§1-4） */
function dedupeKeys(list) {
  const s = arr(list).slice().sort(byT);
  const out = [];
  for (const k of s) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - k.t) <= KEY_EPS) out[out.length - 1] = k;
    else out.push(k);
  }
  return out;
}

/**
 * keys を local 区間 [l0,l1] に切り、0 起点へ寄せ直す。
 * 両端に **補間値のキーを差す**ので、切っても見た目が動かない
 * （分割の左右で同じ絵が続く / トリムで急に値が飛ばない）。
 * 全部同じ値になったら 1 本に畳む（保存を太らせない）。
 */
function sliceKeys(keys, l0, l1) {
  const src = plain(keys);
  if (!src) return {};
  const out = {};
  const a = finite(l0, 0), b = finite(l1, 0);
  for (const path of Object.keys(src)) {
    const list = arr(src[path]);
    if (!list.length) continue;
    const s0 = sampleKeyList(list, a);
    const s1 = sampleKeyList(list, b);
    if (!s0 || !s1) continue;
    const res = [mkKey(0, s0)];
    for (const k of list) {
      if (!plain(k)) continue;
      const t = finite(k.t, NaN);
      if (!Number.isFinite(t)) continue;
      if (t > a + KEY_EPS && t < b - KEY_EPS) res.push(mkKey(t - a, k));
    }
    res.push(mkKey(Math.max(0, b - a), s1));
    const dd = dedupeKeys(res);
    const flat = dd.every((k) => k.v === dd[0].v && k.ease === dd[0].ease);
    out[path] = flat ? [dd[0]] : dd;
  }
  return out;
}

/** ramp を local 区間 [l0,l1] に切る。一定になったら null（speed で足りる） */
function sliceRamp(clip, l0, l1) {
  if (!arr(clip.speedRamp).length) return { ramp: null, speed: clamp(Math.abs(finite(clip.speed, 1)) || 1, 0.02, 100) };
  const a = finite(l0, 0), b = finite(l1, 0);
  const pts = [{ t: 0, v: rateAt(clip, a) }];
  for (const k of arr(clip.speedRamp)) {
    const t = Math.max(0, finite(k && k.t, 0));
    if (t > a + EPS && t < b - EPS) pts.push({ t: t - a, v: clamp(Math.abs(finite(k.v, 1)) || 1, 0.02, 100) });
  }
  pts.push({ t: Math.max(0, b - a), v: rateAt(clip, b) });
  const dd = [];
  for (const q of pts.sort(byT)) {
    const last = dd[dd.length - 1];
    if (last && Math.abs(last.t - q.t) <= EPS) dd[dd.length - 1] = q;
    else dd.push(q);
  }
  const flat = dd.every((q) => Math.abs(q.v - dd[0].v) < 1e-9);
  if (flat) return { ramp: null, speed: dd[0].v };
  return { ramp: dd, speed: clamp(Math.abs(finite(clip.speed, 1)) || 1, 0.02, 100) };
}

/* ══ §D クリップの幾何（切る・伸ばす・詰める）═════════════════════ */

/** audioFade を尺に収める（尺より長いフェードは engine で NaN の元になる） */
function fitFades(clip) {
  const af = plain(clip.audioFade);
  if (!af) { clip.audioFade = { in: 0, out: 0, curve: "linear" }; return; }
  const d = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  af.in = clamp(finite(af.in, 0), 0, d);
  af.out = clamp(finite(af.out, 0), 0, d);
}

/**
 * clip を **local 区間 [l0,l1]** だけの姿に作り替える（分割・トリム・
 * 重なりの削り・複合の展開が全部これ 1 本に乗っている）。
 *   ・l0<0 / l1>duration は「伸ばす」（素材が足りるかは呼ぶ側が見る）
 *   ・in/out は ∫v dt で付け替え、reverse なら向きを入れ替える
 *   ・ramp と keys は切って 0 起点へ寄せ、境界に補間値を差す
 *   ・start は l0 の分だけ動く（呼ぶ側が上書きして良い）
 * @param {Object} clip @param {number} l0 @param {number} l1 @param {Object|null} asset
 */
function sliceClip(clip, l0, l1, asset) {
  const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  let a = finite(l0, 0);
  let b = finite(l1, D);
  if (b - a < MIN_CLIP) b = a + MIN_CLIP;
  const moved = Math.abs(a) > EPS || Math.abs(b - D) > EPS;
  if (hasSrc(clip)) {
    const lim = srcLimit(clip, asset);
    const i0 = Math.max(0, finite(clip.in, 0));
    const o0 = finite(clip.out, i0);
    const used0 = integ(clip, 0, a);
    const used1 = integ(clip, 0, b);
    let ni, no;
    if (clip.reverse) { no = o0 - used0; ni = o0 - used1; }
    else { ni = i0 + used0; no = i0 + used1; }
    const hi = Number.isFinite(lim) ? lim : Math.max(no, o0);
    ni = clamp(ni, 0, hi);
    no = clamp(no, 0, hi);
    if (!(no > ni + EPS)) no = Math.min(hi, ni + MIN_CLIP);
    if (!(no > ni + EPS)) ni = Math.max(0, no - MIN_CLIP);
    clip.in = ni;
    clip.out = no;
  }
  if (moved) {
    const r = sliceRamp(clip, a, b);
    clip.speedRamp = r.ramp;
    clip.speed = r.speed;
    clip.keys = sliceKeys(clip.keys, a, b);
  }
  clip.start = Math.max(0, finite(clip.start, 0) + a);
  clip.duration = b - a;
  fitFades(clip);
  return clip;
}

/** 尺だけ変える（start は動かさない）。素材範囲も一緒に詰める */
function setDur(clip, d, asset) {
  const want = Math.max(MIN_CLIP, finite(d, MIN_CLIP));
  const cap = maxDurOf(clip, asset);
  const nd = Math.min(want, Number.isFinite(cap) ? Math.max(MIN_CLIP, cap) : want);
  const keep = clip.start;
  sliceClip(clip, 0, nd, asset);
  clip.start = keep;
  return clip.duration;
}

/** タイムライン上の終わりを end に合わせる（頭は動かさない） */
function cutEndTo(clip, end, asset) {
  return setDur(clip, finite(end, 0) - finite(clip.start, 0), asset);
}

/** タイムライン上の頭を start に合わせる（尻は動かさない） */
function cutStartTo(clip, start, asset) {
  const s0 = finite(clip.start, 0);
  const l0 = clamp(finite(start, 0) - s0, -Infinity, Math.max(0, finite(clip.duration, 0) - MIN_CLIP));
  sliceClip(clip, l0, finite(clip.duration, 0), asset);
  return clip.duration;
}

/** 時間を k 倍に伸縮（複合クリップの展開で速度を持ち込むときだけ使う） */
function scaleClipTime(clip, k) {
  const f = finite(k, 1);
  if (!(f > 0) || Math.abs(f - 1) < 1e-9) return clip;
  clip.duration = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP) * f);
  clip.speed = clamp((Math.abs(finite(clip.speed, 1)) || 1) / f, 0.02, 100);
  if (arr(clip.speedRamp).length) {
    clip.speedRamp = clip.speedRamp.map((q) => ({ t: Math.max(0, finite(q.t, 0) * f), v: clamp(Math.abs(finite(q.v, 1)) || 1, 0.02, 100) / f }));
  }
  const keys = plain(clip.keys);
  if (keys) {
    const out = {};
    for (const path of Object.keys(keys)) out[path] = dedupeKeys(arr(keys[path]).map((q) => Object.assign({}, q, { t: Math.max(0, finite(q.t, 0) * f) })));
    clip.keys = out;
  }
  const af = plain(clip.audioFade);
  if (af) { af.in = Math.max(0, finite(af.in, 0) * f); af.out = Math.max(0, finite(af.out, 0) * f); }
  for (const e of ["transitionIn", "transitionOut"]) {
    const tr = plain(clip[e]);
    if (tr) tr.duration = Math.max(0, finite(tr.duration, 0) * f);
  }
  fitFades(clip);
  return clip;
}

/* ── トラックの中の並べ替え・整合（tidy）───────────────────────── */

/** start 昇順（安定ソート＝同じ start は元の順） */
function sortClips(track) {
  arr(track && track.clips).sort(byStart);
  return track;
}

/**
 * 重なりを解く。**前のクリップを重なった分だけ縮める**
 * （schema.js の layoutClips と同じ規則。後ろをずらすと音楽やマーカーとの
 *   同期が黙って崩れるので、置いた場所を正しいと見なす）。
 * 縮めて MIN_CLIP を切るときだけ、後ろを MIN_CLIP だけ退かす。
 */
function fixOverlap(draft, track, c) {
  const clips = arr(track.clips);
  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1], cur = clips[i];
    const floor = prev.start + MIN_CLIP;
    if (cur.start < floor - EPS) cur.start = floor;
    const over = clipEnd(prev) - cur.start;
    if (over > EPS) cutEndTo(prev, cur.start, assetFor(draft, prev, c));
  }
  return track;
}

/** 遷移を隣との重なりに収める（§1-3。schema.fitTransition と同じ半分の規則） */
function fitTransitions(track) {
  const clips = arr(track.clips);
  for (let i = 0; i < clips.length; i++) {
    clips[i].transitionIn = fitTransition(clips[i].transitionIn, clips[i], clips[i - 1]);
    clips[i].transitionOut = fitTransition(clips[i].transitionOut, clips[i], clips[i + 1]);
  }
  return track;
}
function fitTransition(tr, self, other) {
  const o = plain(tr);
  if (!o) return null;
  const limit = (other ? Math.min(self.duration, other.duration) : self.duration) * 0.5;
  const d = Math.min(Math.max(0, finite(o.duration, 0.5)), limit);
  if (d <= EPS) return null;
  return { type: str(o.type) || "crossfade", duration: d, params: plain(o.params) ? o.params : {} };
}

/** 素材範囲と最短尺を §1-2 の形に収める（壊れた値の受け皿） */
function fixClipBounds(draft, clip, c) {
  clip.start = Math.max(0, finite(clip.start, 0));
  clip.duration = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  clip.speed = clamp(Math.abs(finite(clip.speed, 1)) || 1, 0.02, 100);
  if (hasSrc(clip)) {
    const lim = srcLimit(clip, assetFor(draft, clip, c));
    let i = Math.max(0, finite(clip.in, 0));
    let o = finite(clip.out, i + clip.duration * clip.speed);
    if (Number.isFinite(lim) && lim > 0) {
      if (i > lim - MIN_CLIP) i = Math.max(0, lim - MIN_CLIP);
      o = Math.min(o, lim);
    }
    if (!(o > i + EPS)) o = i + MIN_CLIP;
    clip.in = i;
    clip.out = o;
  }
  const keys = plain(clip.keys);
  if (keys) {
    const out = {};
    for (const path of Object.keys(keys)) {
      const dd = dedupeKeys(arr(keys[path]).filter((k) => plain(k) && Number.isFinite(finite(k.t, NaN))));
      if (dd.length) out[path] = dd;
    }
    clip.keys = out;
  } else {
    clip.keys = {};
  }
  fitFades(clip);
}

/**
 * **op の最後に通す軽い整合処理**（触ったトラックだけ）。
 * normalizeProject は project 全体を組み立て直すので毎 op には重い。
 * ここで見るのは §1 の 1・2・3・4 だけ。
 */
function tidyTrack(draft, track, c) {
  if (!track || !Array.isArray(track.clips)) return track;
  for (const cl of track.clips) fixClipBounds(draft, cl, c);
  sortClips(track);
  fixOverlap(draft, track, c);
  fitTransitions(track);
  return track;
}

/** op を包む: 作業場を用意し、終わりに触ったトラックだけ整える */
function op(fn) {
  return function runOp(draft, payload, ctx) {
    if (!plain(draft)) throw new OpError("project（draft）が object ではありません");
    const c = work(draft, ctx);
    const own = !ctx || ctx.__ops !== true;
    const r = fn(draft, plain(payload) || {}, c);
    if (own) {
      for (const tr of c.touched) tidyTrack(draft, tr, c);
      c.touched.clear();
      draft.updatedAt = c.now;
    }
    return r === undefined ? null : r;
  };
}

/* ══ §E 置く・削る・割る（clip.add / move / paste の土台）════════ */

function removeFromTrack(track, clipId) {
  const list = arr(track.clips);
  const id = str(clipId);
  for (let i = 0; i < list.length; i++) if (str(list[i].id) === id) return list.splice(i, 1)[0];
  return null;
}

/** 相棒（linkedId）の指し先を切る。消したクリップを指したままにしない */
function unlinkPartner(draft, clip) {
  if (!clip || !clip.linkedId) return;
  const found = findClip(draft, clip.linkedId);
  if (found && str(found.clip.linkedId) === str(clip.id)) found.clip.linkedId = null;
  clip.linkedId = null;
}

/** at より後ろ（start >= at）のクリップを delta だけずらす */
function shiftAfter(track, at, delta, excludeId) {
  const d = finite(delta, 0);
  if (Math.abs(d) < EPS) return 0;
  const from = finite(at, 0);
  const skip = str(excludeId);
  let n = 0;
  for (const cl of arr(track.clips)) {
    if (skip && str(cl.id) === skip) continue;
    if (cl.start >= from - EPS) { cl.start = Math.max(0, cl.start + d); n++; }
  }
  return n;
}

/** t を跨いでいるクリップを 2 つに割る（insert の前処理）。割ったら右側を返す */
function splitStraddling(draft, track, t, c, excludeId) {
  const at = finite(t, 0);
  const skip = str(excludeId);
  for (const cl of arr(track.clips).slice()) {
    if (skip && str(cl.id) === skip) continue;
    if (cl.start < at - EPS && clipEnd(cl) > at + EPS) {
      const l = at - cl.start;
      if (l >= MIN_CLIP - EPS && cl.duration - l >= MIN_CLIP - EPS) return splitOne(draft, track, cl, at, c);
      return null;
    }
  }
  return null;
}

/** [from,to) に在る既存クリップを削る／割る（overwrite の本体） */
function carve(draft, track, from, to, keepId, c) {
  const a = finite(from, 0), b = finite(to, 0);
  if (!(b > a + EPS)) return [];
  const keep = str(keepId);
  const removed = [];
  const list = arr(track.clips);
  for (let i = list.length - 1; i >= 0; i--) {
    const cl = list[i];
    if (!cl || (keep && str(cl.id) === keep)) continue;
    const s = cl.start, e = clipEnd(cl);
    if (e <= a + EPS || s >= b - EPS) continue;
    const asset = assetFor(draft, cl, c);
    if (s >= a - EPS && e <= b + EPS) {                  // 丸ごと隠れる
      list.splice(i, 1);
      unlinkPartner(draft, cl);
      removed.push(cl);
      continue;
    }
    if (s < a - EPS && e > b + EPS) {                    // 真ん中を抜く → 2 つに割る
      splitOne(draft, track, cl, b, c);                  // 右側は track に積まれる
      cutEndTo(cl, a, asset);
      continue;
    }
    if (s < a - EPS) {                                   // 頭が残る → 尻を削る
      if (a - s < MIN_CLIP - EPS) { list.splice(i, 1); unlinkPartner(draft, cl); removed.push(cl); }
      else cutEndTo(cl, a, asset);
      continue;
    }
    if (e - b < MIN_CLIP - EPS) { list.splice(i, 1); unlinkPartner(draft, cl); removed.push(cl); }
    else cutStartTo(cl, b, asset);                       // 尻が残る → 頭を削る
  }
  c.touch(track);
  return removed;
}

/** from 以降で dur が入る最初の隙間の頭（fit の本体） */
function findGap(track, from, dur, excludeId) {
  const skip = str(excludeId);
  const clips = arr(track.clips).filter((cl) => cl && (!skip || str(cl.id) !== skip)).slice().sort(byStart);
  let cand = Math.max(0, finite(from, 0));
  const d = Math.max(MIN_CLIP, finite(dur, MIN_CLIP));
  for (const cl of clips) {
    const s = cl.start, e = clipEnd(cl);
    if (e <= cand + EPS) continue;
    if (s >= cand + d - EPS) break;      // 前に十分な隙間があった
    cand = e;
  }
  return cand;
}

/** clip を track の at へ置く（mode で既存との折り合いを決める） */
function placeClip(draft, track, clip, at, mode, c) {
  const m = modeOf(mode, "overwrite");
  const start = Math.max(0, finite(at, 0));
  clip.start = start;
  arr(track.clips).push(clip);
  if (m === "insert") {
    splitStraddling(draft, track, start, c, clip.id);
    shiftAfter(track, start, clip.duration, clip.id);
  } else if (m === "fit") {
    clip.start = findGap(track, start, clip.duration, clip.id);
  } else {
    carve(draft, track, start, start + clip.duration, clip.id, c);
  }
  c.touch(track);
  return clip;
}

/**
 * clip を t（タイムライン秒）で 2 つに割る。右側の新しいクリップを返す。
 * in/out は ∫v dt で分け、ramp・keys・遷移も左右へ分配する。
 */
function splitOne(draft, track, clip, t, c) {
  const at = numOrNaN(t);
  if (!Number.isFinite(at)) throw new OpError("分割する時刻 t が要ります（秒）");
  const l = at - finite(clip.start, 0);
  const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  if (!(l >= MIN_CLIP - EPS) || !(D - l >= MIN_CLIP - EPS)) {
    throw new OpError(`ここでは割れません（左右とも ${MIN_CLIP} 秒以上必要）`, { clipId: clip.id, t: at, min: MIN_CLIP });
  }
  const asset = assetFor(draft, clip, c);
  const right = cloneClip(clip);            // 新 id・fx も振り直し・keys の fx path も付け替え
  right.groupId = clip.groupId;
  sliceClip(right, l, D, asset);            // 右: local [l,D] → start は自動で at
  right.transitionIn = null;                // 切り口は素のカット
  right.linkedId = null;
  sliceClip(clip, 0, l, asset);             // 左: local [0,l]
  clip.transitionOut = null;
  arr(track.clips).push(right);
  c.touch(track);
  return right;
}

/* ══ §F 入れ物を作る（clip / track の器）══════════════════════════ */

/** kind を当てる（assetId が在れば素材から、text/shape は枝から） */
function guessKind(spec, asset) {
  const k = str(spec.kind);
  if (k) {
    if (CLIP_KINDS.indexOf(k) < 0) throw new OpError(`知らない clip.kind です: ${k}`, { kind: k });
    return k;
  }
  if (asset) return str(asset.kind) === "audio" ? "audio" : (str(asset.kind) === "image" ? "image" : "video");
  if (plain(spec.text)) return "text";
  if (plain(spec.shape)) return "shape";
  if (plain(spec.compound)) return "compound";
  return "text";
}

/**
 * 仕様（payload.clip や貼り付けの中身）から clip を作る。
 * 器は必ず schema.newClip（既定値の持ち主はあちら）。
 * 尺と素材範囲の食い違いは ここで揃える（out だけ来た / duration だけ来た）。
 */
function buildClip(draft, spec, c) {
  const s = plain(spec) || {};
  const assetId = s.assetId === undefined || s.assetId === null ? null : str(s.assetId);
  let asset = null;
  if (assetId) {
    asset = assetMap(draft, c).get(assetId) || null;
    if (!asset) throw new OpError(`素材 ${assetId} が見つかりません`, { assetId });
  }
  const kind = guessKind(s, asset);
  if (NEEDS_ASSET[kind] && !asset) throw new OpError(`${kind} のクリップには assetId が要ります`, { kind });
  const cl = newClip(kind, s);
  if (!s.id || findClip(draft, cl.id)) cl.id = uid("cl");
  cl.kind = kind;
  cl.assetId = assetId;
  cl.start = Math.max(0, finite(s.start !== undefined ? s.start : cl.start, 0));
  if (hasSrc(cl)) {
    const lim = srcLimit(cl, asset);
    cl.in = clamp(finite(cl.in, 0), 0, Number.isFinite(lim) ? Math.max(0, lim - MIN_CLIP) : Infinity);
    if (s.duration === undefined) {
      // out（か素材の端）まで使う
      const out = s.out !== undefined ? finite(s.out, cl.out) : (Number.isFinite(lim) ? lim : finite(cl.out, cl.in + 4));
      cl.out = clamp(out, cl.in + MIN_CLIP, Number.isFinite(lim) ? lim : Infinity);
      cl.duration = Math.max(MIN_CLIP, invInteg(cl, cl.out - cl.in));
    } else {
      cl.duration = Math.max(MIN_CLIP, finite(s.duration, 4));
      if (s.out === undefined) {
        const span = integ(cl, 0, cl.duration);
        cl.out = clamp(cl.in + span, cl.in + MIN_CLIP, Number.isFinite(lim) ? lim : Infinity);
        if (Number.isFinite(lim) && cl.in + span > lim + EPS) cl.duration = Math.max(MIN_CLIP, invInteg(cl, lim - cl.in));
      } else {
        cl.out = clamp(finite(s.out, cl.out), cl.in + MIN_CLIP, Number.isFinite(lim) ? lim : Infinity);
      }
    }
  } else {
    cl.duration = Math.max(MIN_CLIP, finite(s.duration !== undefined ? s.duration : cl.duration, 4));
  }
  fitFades(cl);
  return cl;
}

/**
 * kind ごとの次のトラック名（V1 V2 … / A1 … / OL1 … / ADJ1 …）。
 *
 * CONTRACT-NOTE: 指示の文面では overlay の既定名が「T1」だったが、既に在る
 *   schema.js の `defaultTrackName()` は overlay を "OL1" と付ける。ops だけ
 *   "T1" にすると「schema が作ったトラック」と「ops が作ったトラック」で名前の
 *   付け方が食い違い、番号（OL2 の次が T3）まで狂う。そこで **接頭は schema の
 *   既定名から取り、番号だけ ops が付ける**形にした（表示名を変えたいときは
 *   schema.defaultTrackName の 1 か所を直せば両方に効く）。
 */
function nextTrackName(draft, kind) {
  const base = str(newTrack(kind).name).replace(/\d+$/, "") || "V";
  const used = new Set(arr(draft.tracks).map((t) => str(t && t.name)));
  let n = arr(draft.tracks).filter((t) => t && str(t.kind) === kind).length + 1;
  while (used.has(base + n)) n++;
  return base + n;
}

/** kind の合うトラックを 1 本足す（上限は OpError） */
function addTrack(draft, kind, partial, index) {
  if (arr(draft.tracks).length >= MAX_TRACKS) {
    throw new OpError(`トラックは ${MAX_TRACKS} 本までです`, { max: MAX_TRACKS });
  }
  const k = TRACK_KINDS.indexOf(str(kind)) >= 0 ? str(kind) : "video";
  const p = Object.assign({}, plain(partial) || {});
  delete p.clips;              // クリップは clip.* op から入れる
  delete p.kind;
  const tr = newTrack(k, p);
  if (!p.name) tr.name = nextTrackName(draft, k);
  tr.clips = [];
  const list = arr(draft.tracks);
  const at = index === undefined || index === null ? list.length : clamp(Math.round(finite(index, list.length)), 0, list.length);
  list.splice(at, 0, tr);
  return tr;
}

/** [start,end) が空いている kind のトラックを探す（無ければ null） */
function freeTrack(draft, kind, start, end, skipIds) {
  const skip = new Set(arr(skipIds).map(str));
  for (const tr of arr(draft.tracks)) {
    if (!tr || str(tr.kind) !== str(kind) || tr.locked || skip.has(str(tr.id))) continue;
    let ok = true;
    for (const cl of arr(tr.clips)) {
      if (clipEnd(cl) > start + EPS && cl.start < end - EPS) { ok = false; break; }
    }
    if (ok) return tr;
  }
  return null;
}

/** そこへ置けるトラックを用意する（空きが無ければ 1 本足す） */
function trackFor(draft, kind, start, end, c) {
  const found = freeTrack(draft, kind, start, end, null);
  if (found) return found;
  const tr = addTrack(draft, kind, null, undefined);
  c.touch(tr);
  return tr;
}

/** payload から余計な鍵を落として「clip の仕様」だけにする */
function omit(obj, keys) {
  const out = {};
  const skip = new Set(arr(keys));
  for (const k of Object.keys(plain(obj) || {})) if (!skip.has(k)) out[k] = obj[k];
  return out;
}

function assertUnlocked(track) {
  if (track && track.locked) throw new OpError(`トラック ${track.name || track.id} は鍵が掛かっています`, { trackId: track.id, locked: true });
  return track;
}

/** clip.kind を置くのに向いたトラックの kind */
function trackKindFor(kind) {
  const k = str(kind);
  if (k === "audio") return "audio";
  if (k === "text" || k === "shape") return "overlay";
  if (k === "adjust") return "adjust";
  return "video";
}

function nextClip(track, clip) {
  let best = null;
  const e = clipEnd(clip);
  for (const cl of arr(track.clips)) {
    if (cl === clip) continue;
    if (cl.start >= e - 1e-3 && (!best || cl.start < best.start)) best = cl;
  }
  return best;
}
function prevClip(track, clip) {
  let best = null;
  for (const cl of arr(track.clips)) {
    if (cl === clip) continue;
    if (clipEnd(cl) <= clip.start + 1e-3 && (!best || clipEnd(cl) > clipEnd(best))) best = cl;
  }
  return best;
}

/** キーや音フェードの「local 秒」を k 倍する（速度を変えたとき動きが付いてくる） */
function scaleLocalTimes(clip, k) {
  const f = finite(k, 1);
  if (!(f > 0) || Math.abs(f - 1) < 1e-9) return clip;
  const keys = plain(clip.keys);
  if (keys) {
    const out = {};
    for (const path of Object.keys(keys)) {
      const dd = dedupeKeys(arr(keys[path]).map((q) => Object.assign({}, q, { t: Math.max(0, finite(q.t, 0) * f) })));
      if (dd.length) out[path] = dd;
    }
    clip.keys = out;
  }
  const af = plain(clip.audioFade);
  if (af) { af.in = Math.max(0, finite(af.in, 0) * f); af.out = Math.max(0, finite(af.out, 0) * f); }
  for (const e of ["transitionIn", "transitionOut"]) {
    const tr = plain(clip[e]);
    if (tr) tr.duration = Math.max(0, finite(tr.duration, 0) * f);
  }
  return clip;
}

/* ══ §G クリップの op ═════════════════════════════════════════════ */

/**
 * clip.add … `{ trackId?, clip, at?, mode? }`
 *   mode:"overwrite"（既定）重なった既存を削る／割る
 *       "insert"           跨いだ物を割り、後続を後ろへずらす
 *       "fit"              at 以降の最初の空きへ置く
 * @returns {{clipId:string, id:string, trackId:string, start:number, duration:number}}
 */
const opClipAdd = op((draft, p, c) => {
  const spec = plain(p.clip) || omit(p, ["trackId", "at", "mode", "clip"]);
  const cl = buildClip(draft, spec, c);
  const at = p.at !== undefined ? finite(p.at, 0) : finite(cl.start, 0);
  const track = p.trackId
    ? assertUnlocked(needTrack(draft, p.trackId))
    : trackFor(draft, trackKindFor(cl.kind), at, at + cl.duration, c);
  placeClip(draft, track, cl, at, p.mode, c);
  return { clipId: cl.id, id: cl.id, trackId: track.id, start: cl.start, duration: cl.duration };
});

/**
 * clip.move … `{ clipId, trackId?, start?, mode?, ripple? }`
 * 吸着（snap）は UI の仕事。ops は渡された start に素直に置く。
 * ripple:true のときだけ、抜けた穴を後続で詰める。
 */
const opClipMove = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  const from = assertUnlocked(found.track);
  const to = p.trackId ? assertUnlocked(needTrack(draft, p.trackId)) : from;
  const start = Math.max(0, finite(p.start !== undefined ? p.start : clip.start, 0));
  const oldEnd = clipEnd(clip);
  removeFromTrack(from, clip.id);
  if (p.ripple === true) shiftAfter(from, oldEnd, -clip.duration, clip.id);
  c.touch(from);
  placeClip(draft, to, clip, start, p.mode, c);
  return { clipId: clip.id, trackId: to.id, start: clip.start, duration: clip.duration };
});

/**
 * clip.trim … `{ clipId, edge:"start"|"end", delta, ripple? }`
 *   delta > 0 は **短くする**方向（頭を削る／尻を削る）。
 *   素材の端・MIN_CLIP・隣のクリップで止まる（止まった値を applied で返す）。
 *   ripple:true なら頭側でも穴を作らず、後続が付いてくる。
 */
const opClipTrim = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = assertUnlocked(found.track);
  const edge = str(p.edge) === "start" ? "start" : "end";
  const ripple = p.ripple === true;
  const delta = finite(p.delta, 0);
  const asset = assetFor(draft, clip, c);
  const D = Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP));
  const S = finite(clip.start, 0);
  const oldEnd = S + D;
  const room = trimRoom(clip, asset);
  sortClips(track);
  let l0 = 0, l1 = D;
  if (edge === "start") {
    let lo = -room.head;
    if (!ripple) {
      const prev = prevClip(track, clip);
      const floor = prev ? clipEnd(prev) : 0;
      lo = Math.max(lo, floor - S);
    }
    const hi = D - MIN_CLIP;
    l0 = nz(hi < lo ? 0 : clamp(delta, nz(lo), hi));
  } else {
    let hi = D + room.tail;
    if (!ripple) {
      const nx = nextClip(track, clip);
      if (nx) hi = Math.min(hi, nx.start - S);
    }
    const lo = MIN_CLIP;
    l1 = nz(hi < lo ? D : clamp(D - delta, lo, hi));
  }
  sliceClip(clip, l0, l1, asset);
  if (edge === "start" && ripple) clip.start = S;
  const newEnd = clipEnd(clip);
  if (ripple) shiftAfter(track, oldEnd, newEnd - oldEnd, clip.id);
  c.touch(track);
  return {
    clipId: clip.id, edge,
    start: clip.start, duration: clip.duration, in: clip.in, out: clip.out,
    applied: nz(edge === "start" ? l0 : D - l1)
  };
});

/**
 * clip.split … `{ clipId, t, linked? }`
 * t（タイムライン秒）で 2 つに割る。in/out は speed / ramp / reverse を
 * 織り込んで分け、keys と遷移も分配する（境界には補間値のキーが入る）。
 * 相棒（linkedId）が在れば一緒に割って左右を結び直す（linked:false で止める）。
 * @returns {{ids:string[], leftId:string, rightId:string, linked:string[]|null}}
 */
const opClipSplit = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const right = splitOne(draft, found.track, found.clip, p.t, c);
  let linked = null;
  const partnerId = str(found.clip.linkedId);
  if (p.linked !== false && partnerId) {
    const pf = findClip(draft, partnerId);
    const t = finite(p.t, 0);
    if (pf && !pf.clip.locked && pf.clip.start < t - MIN_CLIP && clipEnd(pf.clip) > t + MIN_CLIP) {
      const pRight = splitOne(draft, pf.track, pf.clip, t, c);
      right.linkedId = pRight.id;
      pRight.linkedId = right.id;
      linked = [pf.clip.id, pRight.id];
    }
  }
  return { ids: [found.clip.id, right.id], leftId: found.clip.id, rightId: right.id, linked };
});

/** clip.remove … `{ clipId | clipIds, linked? }`（linked:true で相棒も消す） */
const opClipRemove = op((draft, p, c) => {
  const ids = idsOf(p);
  const queue = ids.slice();
  const done = new Set();
  let n = 0;
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    const found = findClip(draft, id);
    if (!found) continue;
    if (found.clip.locked) throw new OpError(`クリップ ${id} は鍵が掛かっています`, { clipId: id, locked: true });
    if (p.linked === true && found.clip.linkedId) queue.push(str(found.clip.linkedId));
    unlinkPartner(draft, found.clip);
    removeFromTrack(found.track, id);
    c.touch(found.track);
    n++;
  }
  return { removed: n, ids: Array.from(done) };
});

/** clip.rippleDelete … `{ clipId | clipIds }` 消した分だけ後続を詰める */
const opClipRippleDelete = op((draft, p, c) => {
  const ids = idsOf(p);
  const items = [];
  for (const id of ids) {
    const found = findClip(draft, id);
    if (!found) continue;
    if (found.clip.locked) throw new OpError(`クリップ ${id} は鍵が掛かっています`, { clipId: id, locked: true });
    items.push(found);
  }
  // 後ろから消すと、まだ触っていない前のクリップの位置が動かない
  items.sort((a, b) => b.clip.start - a.clip.start);
  let closed = 0;
  for (const it of items) {
    const end = clipEnd(it.clip);
    const d = it.clip.duration;
    unlinkPartner(draft, it.clip);
    removeFromTrack(it.track, it.clip.id);
    shiftAfter(it.track, end - EPS, -d, null);
    closed += d;
    c.touch(it.track);
  }
  return { removed: items.length, closed };
});

/**
 * clip.duplicate … `{ clipId | clipIds, at?, mode? }`
 * 1 つなら既定で「すぐ後ろへ差し込む」（後続は後ろへずれる）。
 * 複数なら選択の相対位置を保って選択の終わりの後ろへ置く。
 */
const opClipDuplicate = op((draft, p, c) => {
  const ids = idsOf(p);
  const items = ids.map((id) => needClipAt(draft, id));
  const minStart = Math.min.apply(null, items.map((x) => x.clip.start));
  const maxEnd = Math.max.apply(null, items.map((x) => clipEnd(x.clip)));
  const multi = items.length > 1;
  const mode = modeOf(p.mode, multi ? "overwrite" : "insert");
  const base = p.at !== undefined ? finite(p.at, 0) : (multi ? maxEnd : null);
  // 同じグループの物をまとめて複製したら、複製側は新しいグループにする
  const gmap = new Map();
  const out = [];
  for (const it of items) {
    assertUnlocked(it.track);
    const copy = cloneClip(it.clip);
    if (it.clip.groupId) {
      const g = str(it.clip.groupId);
      if (!gmap.has(g)) gmap.set(g, uid("grp"));
      copy.groupId = gmap.get(g);
    }
    copy.source = it.clip.source ? deepClone(it.clip.source) : null;
    const at = base === null ? clipEnd(it.clip) : base + (it.clip.start - minStart);
    placeClip(draft, it.track, copy, at, mode, c);
    out.push(copy.id);
  }
  return { ids: out, id: out[0], groups: Array.from(gmap.values()) };
});

/**
 * clip.reorder … `{ trackId?, clipId?, index?, order? }`
 * 並び替え。**尺を保ったまま先頭から詰め直す**（絵コンテ的な入れ替え）。
 * 隙間は畳まれるので、位置を保ちたいときは clip.move を使う。
 */
const opClipReorder = op((draft, p, c) => {
  const track = p.trackId ? assertUnlocked(needTrack(draft, p.trackId)) : assertUnlocked(needClipAt(draft, p.clipId).track);
  sortClips(track);
  const clips = arr(track.clips);
  if (clips.length < 2) return { trackId: track.id, order: clips.map((x) => str(x.id)) };
  let order;
  if (Array.isArray(p.order)) {
    const want = p.order.map(str);
    const have = new Set(clips.map((x) => str(x.id)));
    if (want.length !== clips.length || want.some((id) => !have.has(id)) || new Set(want).size !== want.length) {
      throw new OpError("order はトラックの全クリップ id をちょうど 1 回ずつ並べた配列です", { trackId: track.id });
    }
    order = want;
  } else {
    const id = need(p.clipId, "clipId");
    const from = clips.findIndex((x) => str(x.id) === id);
    if (from < 0) throw new OpError(`クリップ ${id} はこのトラックに在りません`, { clipId: id, trackId: track.id });
    const to = clamp(Math.round(finite(p.index, from)), 0, clips.length - 1);
    order = clips.map((x) => str(x.id));
    order.splice(to, 0, order.splice(from, 1)[0]);
  }
  const byId = new Map(clips.map((x) => [str(x.id), x]));
  let t = clips[0].start;
  for (const id of order) {
    const cl = byId.get(id);
    cl.start = t;
    t += cl.duration;
  }
  c.touch(track);
  return { trackId: track.id, order };
});

/**
 * clip.slip … `{ clipId, delta }`
 * 尺と位置を保ったまま素材側の窓（in/out）をずらす。
 * delta は **タイムライン秒**（平均倍率で素材秒へ換算する）。
 */
const opClipSlip = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  if (!hasSrc(clip)) return { clipId: clip.id, delta: 0, srcDelta: 0 };
  const asset = assetFor(draft, clip, c);
  const lim = srcLimit(clip, asset);
  const mean = (finite(clip.out, 0) - finite(clip.in, 0)) / Math.max(MIN_CLIP, clip.duration);
  let ds = finite(p.delta, 0) * (mean > 0 ? mean : 1);
  const min = -finite(clip.in, 0);
  const max = Number.isFinite(lim) ? lim - finite(clip.out, 0) : Infinity;
  ds = max < min ? 0 : clamp(ds, min, max);
  clip.in = Math.max(0, clip.in + ds);
  clip.out = clip.out + ds;
  c.touch(found.track);
  return { clipId: clip.id, delta: mean > 0 ? ds / mean : 0, srcDelta: ds, in: clip.in, out: clip.out };
});

/**
 * clip.roll … `{ clipId, delta, edge? }`
 * 隣との境界だけを動かす（全体の尺は変わらない）。
 * edge:"end"（既定）は次のクリップとの境界、"start" は前との境界。
 */
const opClipRoll = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = assertUnlocked(found.track);
  const edge = str(p.edge) === "start" ? "start" : "end";
  sortClips(track);
  const other = edge === "end" ? nextClip(track, clip) : prevClip(track, clip);
  if (!other) throw new OpError("隣にクリップがありません", { clipId: clip.id, edge });
  if (other.locked) throw new OpError("隣のクリップは鍵が掛かっています", { clipId: other.id, locked: true });
  const boundary = edge === "end" ? clipEnd(clip) : clip.start;
  const otherEdge = edge === "end" ? other.start : clipEnd(other);
  if (Math.abs(otherEdge - boundary) > 1e-3) throw new OpError("隣り合っていないので境界を動かせません", { gap: otherEdge - boundary });
  const aAsset = assetFor(draft, clip, c), bAsset = assetFor(draft, other, c);
  const ra = trimRoom(clip, aAsset), rb = trimRoom(other, bAsset);
  let d = finite(p.delta, 0);
  if (edge === "end") {
    const hi = Math.min(ra.tail, other.duration - MIN_CLIP);
    const lo = -Math.min(rb.head, clip.duration - MIN_CLIP);
    d = hi < lo ? 0 : clamp(d, lo, hi);
    cutEndTo(clip, boundary + d, aAsset);
    cutStartTo(other, boundary + d, bAsset);
  } else {
    const hi = Math.min(clip.duration - MIN_CLIP, rb.tail);
    const lo = -Math.min(ra.head, other.duration - MIN_CLIP);
    d = hi < lo ? 0 : clamp(d, lo, hi);
    cutStartTo(clip, boundary + d, aAsset);
    cutEndTo(other, boundary + d, bAsset);
  }
  c.touch(track);
  return { clipId: clip.id, otherId: other.id, edge, delta: d, boundary: boundary + d };
});

/**
 * clip.setSpeed … `{ clipId, speed, keepDuration?, ripple? }`
 * 既定は「素材の範囲を保って尺が変わる」。keepDuration:true は
 * 「尺を保って素材の使う量が変わる」（足りなければ尺も縮む）。
 * ramp は定数速度と食い合うので消す。既定で後続を詰め直す（ripple:false で止める）。
 */
const opClipSetSpeed = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = found.track;
  const raw = numOrNaN(p.speed);
  if (!Number.isFinite(raw) || raw <= 0) throw new OpError("speed は 0 より大きい数です", { speed: p.speed });
  const speed = clamp(Math.abs(raw), 0.02, 100);
  const asset = assetFor(draft, clip, c);
  const oldEnd = clipEnd(clip);
  const oldDur = Math.max(MIN_CLIP, clip.duration);
  clip.speedRamp = null;
  clip.speed = speed;
  if (hasSrc(clip)) {
    const lim = srcLimit(clip, asset);
    if (p.keepDuration === true) {
      const want = clip.duration * speed;
      if (clip.reverse) clip.in = Math.max(0, clip.out - want);
      else clip.out = Math.min(clip.in + want, Number.isFinite(lim) ? lim : clip.in + want);
      if (!(clip.out > clip.in + EPS)) clip.out = clip.in + MIN_CLIP * speed;
      clip.duration = Math.max(MIN_CLIP, invInteg(clip, clip.out - clip.in));
    } else {
      clip.duration = Math.max(MIN_CLIP, invInteg(clip, clip.out - clip.in));
    }
    scaleLocalTimes(clip, clip.duration / oldDur);
  }
  fitFades(clip);
  if (p.ripple !== false) shiftAfter(track, oldEnd, clipEnd(clip) - oldEnd, clip.id);
  c.touch(track);
  return { clipId: clip.id, speed, duration: clip.duration, in: clip.in, out: clip.out };
});

/**
 * clip.setSpeedRamp … `{ clipId, ramp: [{t,v}] | null, keepDuration?, ripple? }`
 * t は clip ローカル秒・v は倍率（区分線形）。ramp の外側は端の値で一定。
 * 既定は素材の範囲を保って尺を ∫v dt の逆算で決める。
 */
const opClipSetSpeedRamp = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = found.track;
  if (p.ramp !== null && p.ramp !== undefined && !Array.isArray(p.ramp)) {
    throw new OpError("ramp は [{t,v}] の配列か null です");
  }
  const asset = assetFor(draft, clip, c);
  const oldEnd = clipEnd(clip);
  const oldDur = Math.max(MIN_CLIP, clip.duration);
  let pts = null;
  if (Array.isArray(p.ramp) && p.ramp.length) {
    const raw = p.ramp.map((k) => {
      const o = plain(k) || {};
      const t = numOrNaN(o.t);
      const v = numOrNaN(o.v);
      if (!Number.isFinite(t) || !Number.isFinite(v) || v <= 0) throw new OpError("ramp の要素は { t:秒, v:0 より大きい倍率 } です", { point: o });
      return { t: Math.max(0, t), v: clamp(Math.abs(v), 0.02, 100) };
    }).sort(byT);
    pts = [];
    for (const q of raw) {
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.t - q.t) <= EPS) pts[pts.length - 1] = q;
      else pts.push(q);
    }
    if (pts.length < 2 || pts.every((q) => Math.abs(q.v - pts[0].v) < 1e-9)) {
      clip.speed = pts[0].v;
      pts = null;
    }
  }
  clip.speedRamp = pts;
  if (hasSrc(clip)) {
    const lim = srcLimit(clip, asset);
    if (p.keepDuration === true) {
      const span = integ(clip, 0, clip.duration);
      if (clip.reverse) clip.in = Math.max(0, clip.out - span);
      else clip.out = Math.min(clip.in + span, Number.isFinite(lim) ? lim : clip.in + span);
      if (!(clip.out > clip.in + EPS)) clip.out = clip.in + MIN_CLIP;
      clip.duration = Math.max(MIN_CLIP, invInteg(clip, clip.out - clip.in));
    } else {
      clip.duration = Math.max(MIN_CLIP, invInteg(clip, clip.out - clip.in));
    }
    scaleLocalTimes(clip, clip.duration / oldDur);
  }
  fitFades(clip);
  if (p.ripple !== false) shiftAfter(track, oldEnd, clipEnd(clip) - oldEnd, clip.id);
  c.touch(track);
  return { clipId: clip.id, ramp: clip.speedRamp ? clip.speedRamp.slice() : null, duration: clip.duration };
});

/**
 * clip.freeze … `{ clipId, t?, duration? }`
 * t（既定は再生ヘッド）の絵で止まるクリップを差し込む。後続は後ろへずれる。
 *
 * CONTRACT-NOTE: 契約書 §1 の Clip には「静止」を表す枝が無く、
 *   normalizeProject は知らない枝を落とすので独自の印は残せない。
 *   そこで **素材の窓をほぼ 0 にした低速クリップ**で表す
 *   （speed は 0.02 が下限なので duration×0.02 秒だけ素材が進む。
 *    30fps・3 秒で 2 コマ＝見た目は静止）。eval/engine はこれを
 *   普通の低速クリップとして扱えば良く、特別扱いは不要。
 */
const opClipFreeze = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = assertUnlocked(found.track);
  if (!hasSrc(clip)) throw new OpError("この種類のクリップは静止させられません", { kind: clip.kind });
  const asset = assetFor(draft, clip, c);
  const dur = Math.max(MIN_CLIP, finite(p.duration, 2));
  const t = finite(p.t !== undefined ? p.t : c.playhead, clip.start);
  const l = clamp(t - clip.start, 0, clip.duration);
  const src = srcAt(clip, l);
  const lim = srcLimit(clip, asset);
  const minSpeed = 0.02;
  let span = dur * minSpeed;
  if (Number.isFinite(lim)) span = Math.min(span, Math.max(MIN_CLIP * minSpeed, lim * 0.5));
  const inn = clamp(src, 0, Number.isFinite(lim) ? Math.max(0, lim - span) : src);
  const speed = clamp(span / dur, 0.02, 100);
  const still = newClip(clip.kind, {
    name: "静止", assetId: clip.assetId,
    start: clip.start + l, duration: dur,
    in: inn, out: inn + span, speed, reverse: false, speedRamp: null,
    muteAudio: true, volume: clip.volume,
    opacity: clip.opacity, blend: clip.blend,
    transform: deepClone(clip.transform),
    color: clip.color ? deepClone(clip.color) : null,
    mask: clip.mask ? deepClone(clip.mask) : null,
    chroma: clip.chroma ? deepClone(clip.chroma) : null,
    fx: deepClone(arr(clip.fx)).map((f) => Object.assign({}, f, { id: uid("fx") })),
    label: clip.label, groupId: clip.groupId
  });
  let at;
  if (l <= MIN_CLIP + EPS) at = clip.start;
  else if (clip.duration - l <= MIN_CLIP + EPS) at = clipEnd(clip);
  else { splitOne(draft, track, clip, clip.start + l, c); at = clip.start + l; }
  placeClip(draft, track, still, at, "insert", c);
  return { clipId: still.id, id: still.id, trackId: track.id, start: still.start, duration: still.duration };
});

/** clip.reverse … `{ clipId | clipIds, reverse? }`（省略で切り替え） */
const opClipReverse = op((draft, p, c) => {
  const ids = idsOf(p);
  const out = [];
  for (const id of ids) {
    const found = needClipAt(draft, id);
    const clip = found.clip;
    if (!hasSrc(clip)) continue;
    clip.reverse = p.reverse === undefined ? !clip.reverse : bool(p.reverse, false);
    out.push({ clipId: clip.id, reverse: clip.reverse });
    c.touch(found.track);
  }
  if (!out.length) throw new OpError("逆再生できるクリップがありません（映像か音だけ）");
  return { ids: out.map((x) => x.clipId), reverse: out[0].reverse, items: out };
});

/**
 * clip.detachAudio … `{ clipId, trackId? }`
 * 映像クリップの音だけを別トラックへ出し、linkedId で相棒にする。
 * 置き先は指定が無ければ「その範囲が空いている音トラック」、無ければ 1 本足す。
 */
const opClipDetachAudio = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = assertUnlocked(found.track);
  if (str(clip.kind) !== "video") throw new OpError("音を切り離せるのは映像クリップだけです", { kind: clip.kind });
  if (clip.linkedId) throw new OpError("このクリップの音は既に切り離されています", { clipId: clip.id, linkedId: clip.linkedId });
  const asset = assetFor(draft, clip, c);
  if (asset && asset.hasAudio === false) throw new OpError("この素材に音はありません", { assetId: clip.assetId });
  const start = clip.start, end = clipEnd(clip);
  const dest = p.trackId ? assertUnlocked(needTrack(draft, p.trackId)) : trackFor(draft, "audio", start, end, c);
  const audio = newClip("audio", {
    name: clip.name || (asset ? asset.name : ""), assetId: clip.assetId,
    start, duration: clip.duration, in: clip.in, out: clip.out,
    speed: clip.speed, reverse: clip.reverse,
    speedRamp: clip.speedRamp ? deepClone(clip.speedRamp) : null,
    volume: clip.volume, muteAudio: false,
    audioFade: deepClone(plain(clip.audioFade) || { in: 0, out: 0, curve: "linear" }),
    label: clip.label, groupId: clip.groupId,
    source: clip.source ? deepClone(clip.source) : null
  });
  // 音のキーは音側へ移す（映像側に残すと 2 重に効く）
  const keys = plain(clip.keys) || {};
  const moved = {};
  for (const path of ["volume", "pan"]) {
    if (arr(keys[path]).length) { moved[path] = deepClone(keys[path]); delete clip.keys[path]; }
  }
  audio.keys = moved;
  clip.muteAudio = true;
  audio.linkedId = clip.id;
  clip.linkedId = audio.id;
  placeClip(draft, dest, audio, start, "overwrite", c);
  c.touch(track);
  return { clipId: audio.id, id: audio.id, trackId: dest.id, videoId: clip.id };
});

/**
 * clip.link … `{ clipIds:[a,b] }` で相棒にする。
 * `{ clipId, otherId:null }`（か clipIds が 1 つ）で縁を切る。
 */
const opClipLink = op((draft, p, c) => {
  const ids = Array.isArray(p.clipIds) ? p.clipIds.map(str).filter(Boolean) : [str(p.clipId), str(p.otherId)].filter(Boolean);
  if (!ids.length) throw new OpError("clipIds（1 つで解除・2 つで結合）が必要です");
  if (ids.length === 1) {
    const found = findClipAt(draft, ids[0]);
    const had = str(found.clip.linkedId);
    unlinkPartner(draft, found.clip);
    c.touch(found.track);
    return { unlinked: had ? [ids[0], had] : [ids[0]] };
  }
  if (ids.length !== 2 || ids[0] === ids[1]) throw new OpError("結合は違う 2 つのクリップです", { ids });
  const a = findClipAt(draft, ids[0]), b = findClipAt(draft, ids[1]);
  unlinkPartner(draft, a.clip);
  unlinkPartner(draft, b.clip);
  a.clip.linkedId = b.clip.id;
  b.clip.linkedId = a.clip.id;
  c.touch(a.track);
  c.touch(b.track);
  return { linked: [a.clip.id, b.clip.id] };
});

/** clip.group … `{ clipIds, groupId? }` */
const opClipGroup = op((draft, p, c) => {
  const ids = idsOf(p);
  if (ids.length < 2) throw new OpError("グループ化には 2 つ以上のクリップが要ります", { ids });
  const gid = str(p.groupId) || uid("grp");
  for (const id of ids) {
    const found = findClipAt(draft, id);
    found.clip.groupId = gid;
    c.touch(found.track);
  }
  return { groupId: gid, ids };
});

/** clip.ungroup … `{ clipIds }` か `{ groupId }`（グループ丸ごと） */
const opClipUngroup = op((draft, p, c) => {
  const out = [];
  if (p.groupId) {
    const gid = str(p.groupId);
    for (const tr of arr(draft.tracks)) {
      for (const cl of arr(tr.clips)) if (str(cl.groupId) === gid) { cl.groupId = null; out.push(str(cl.id)); c.touch(tr); }
    }
  } else {
    for (const id of idsOf(p)) {
      const found = findClipAt(draft, id);
      found.clip.groupId = null;
      out.push(str(found.clip.id));
      c.touch(found.track);
    }
  }
  return { ids: out, removed: out.length };
});

/* ══ §H 深いマージ（clip.update と その糖衣）════════════════════ */

/** 枝が null/欠けのときに作る既定（path 丸ごとで引く） */
const BRANCH = {
  "transform": defaultTransform,
  "transform.crop": () => ({ l: 0, t: 0, r: 0, b: 0 }),
  "color": defaultColorGrade,
  "mask": defaultMask,
  "chroma": defaultChroma,
  "text": defaultTextSpec,
  "text.style": defaultTextStyle,
  "shape": defaultShape,
  "audioFade": () => ({ in: 0, out: 0, curve: "linear" }),
  "stabilize": () => ({ amount: 0, baked: false }),
  "transitionIn": () => ({ type: "crossfade", duration: 0.5, params: {} }),
  "transitionOut": () => ({ type: "crossfade", duration: 0.5, params: {} }),
  "compound": () => ({ tracks: [] }),
  "keys": () => ({}),
  "source": () => ({})
};

/** 鍵が掛かったクリップにも許す patch の鍵 */
const SAFE_ON_LOCKED = new Set(["locked", "hidden", "name", "label", "groupId"]);
/** 幾何に触る鍵（触ったら整合処理を強めに掛ける） */
const GEOM_KEYS = ["start", "duration", "in", "out", "speed", "reverse", "speedRamp"];

/**
 * **枝ごとの深いマージ**（浅いマージではない）。
 *   ・object は再帰して混ぜる（transform だけ・color だけの部分更新ができる）
 *   ・配列と null は差し替え（null は「枝を消す」＝ mask:null でマスク解除）
 *   ・元が null の枝に object を混ぜるときは **既定値の枝を作ってから**混ぜる
 *     （clip.color が null でも { color:{ exposure:.2 } } が効く）
 *   ・関数や Symbol は保存できないので OpError
 */
function mergeInto(target, patch, path, protect) {
  for (const k of Object.keys(patch)) {
    if (protect && protect.has(k) && !path) continue;
    const v = patch[k];
    const full = path ? path + "." + k : k;
    if (v === undefined) continue;
    if (v === null) { target[k] = null; continue; }
    if (Array.isArray(v)) { target[k] = deepClone(v); continue; }
    const t = typeof v;
    if (t === "function" || t === "symbol" || t === "bigint") {
      throw new OpError(`patch.${full} は保存できない値です`, { path: full });
    }
    if (t === "object") {
      const cur = target[k];
      if (!plain(cur)) target[k] = BRANCH[full] ? BRANCH[full]() : {};
      mergeInto(target[k], v, full, protect);
      continue;
    }
    target[k] = t === "number" ? finite(v, 0) : v;
  }
  return target;
}

/** fx 配列の形を保つ（id の重複と壊れた要素を直す） */
function fixFxList(owner) {
  const seen = new Set();
  owner.fx = arr(owner.fx).map((f) => {
    const o = plain(f) || {};
    let id = str(o.id) || uid("fx");
    if (seen.has(id)) id = uid("fx");
    seen.add(id);
    return { id, type: str(o.type) || "none", enabled: o.enabled === undefined ? true : !!o.enabled, params: plain(o.params) ? o.params : {} };
  });
  return owner.fx;
}

/** clip.update の本体（糖衣からも呼ぶ） */
function updateClips(draft, ids, patch, c) {
  if (!plain(patch)) throw new OpError("patch（object）が必要です");
  const keys = Object.keys(patch);
  if (patch.kind !== undefined) {
    for (const id of ids) {
      const f = findClipAt(draft, id);
      if (str(patch.kind) !== str(f.clip.kind)) throw new OpError("kind は変えられません（作り直してください）", { clipId: id, kind: patch.kind });
    }
  }
  const geom = GEOM_KEYS.some((k) => keys.indexOf(k) >= 0);
  const out = [];
  for (const id of ids) {
    const found = findClipAt(draft, id);
    const clip = found.clip;
    if (clip.locked && keys.some((k) => !SAFE_ON_LOCKED.has(k))) {
      throw new OpError(`クリップ ${id} は鍵が掛かっています`, { clipId: id, locked: true });
    }
    mergeInto(clip, patch, "", new Set(["id", "kind"]));
    fixFxList(clip);
    if (geom) fixClipBounds(draft, clip, c);
    c.touch(found.track);
    out.push(str(clip.id));
  }
  return { ids: out, clipId: out[0], changed: keys };
}

/** clip.update … `{ clipId|clipIds, patch }` */
const opClipUpdate = op((draft, p, c) => updateClips(draft, idsOf(p), plain(p.patch), c));

/** setTransform 等の糖衣: payload から「その枝の patch」を組み立てる */
function branchSugar(branch) {
  return op((draft, p, c) => {
    let v;
    if (Object.prototype.hasOwnProperty.call(p, branch)) v = p[branch];
    else if (Object.prototype.hasOwnProperty.call(p, "patch")) v = p.patch;
    else if (Object.prototype.hasOwnProperty.call(p, "value")) v = p.value;
    else v = omit(p, ["clipId", "clipIds", "patch", "value", branch]);
    if (v !== null && !plain(v)) throw new OpError(`${branch} は object か null です`, { branch });
    const patch = {};
    patch[branch] = v === null ? null : v;
    return updateClips(draft, idsOf(p), patch, c);
  });
}

/* ── 効果（fx）─────────────────────────────────────────────────── */

/** clip.addFx … `{ clipId, type, params?, index?, enabled? }` @returns {{fxId}} */
const opClipAddFx = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const spec = plain(p.fx) || p;
  const type = need(spec.type, "type（効果の種類）");
  const fx = { id: uid("fx"), type, enabled: spec.enabled === undefined ? true : !!spec.enabled, params: plain(spec.params) ? deepClone(spec.params) : {} };
  const list = arr(found.clip.fx);
  const at = p.index === undefined || p.index === null ? list.length : clamp(Math.round(finite(p.index, list.length)), 0, list.length);
  list.splice(at, 0, fx);
  found.clip.fx = list;
  fixFxList(found.clip);
  c.touch(found.track);
  return { fxId: fx.id, id: fx.id, clipId: found.clip.id, index: at };
});

/** clip.removeFx … `{ clipId, fxId }`（その効果に付いたキーも一緒に消す） */
const opClipRemoveFx = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const fxId = need(p.fxId, "fxId");
  const before = arr(found.clip.fx).length;
  found.clip.fx = arr(found.clip.fx).filter((f) => str(f.id) !== fxId);
  if (found.clip.fx.length === before) throw new OpError(`効果 ${fxId} が見つかりません`, { fxId });
  const keys = plain(found.clip.keys) || {};
  const dropped = [];
  for (const path of Object.keys(keys)) {
    const seg = path.split(".");
    if (seg[0] === "fx" && seg[1] === fxId) { delete found.clip.keys[path]; dropped.push(path); }
  }
  c.touch(found.track);
  return { fxId, removed: 1, keys: dropped };
});

/** clip.updateFx … `{ clipId, fxId, params?|patch?, enabled?, type? }` */
const opClipUpdateFx = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const fxId = need(p.fxId, "fxId");
  const fx = arr(found.clip.fx).find((f) => str(f.id) === fxId);
  if (!fx) throw new OpError(`効果 ${fxId} が見つかりません`, { fxId });
  const params = plain(p.params) || (plain(p.patch) && plain(p.patch.params)) || null;
  if (params) {
    if (!plain(fx.params)) fx.params = {};
    mergeInto(fx.params, params, "params", null);
  }
  if (p.enabled !== undefined) fx.enabled = !!p.enabled;
  if (p.type !== undefined) fx.type = need(p.type, "type");
  c.touch(found.track);
  return { fxId, clipId: found.clip.id, enabled: fx.enabled };
});

/** clip.reorderFx … `{ clipId, fxId, index }` か `{ clipId, from, to }` */
const opClipReorderFx = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const list = arr(found.clip.fx);
  if (list.length < 2) return { clipId: found.clip.id, order: list.map((f) => str(f.id)) };
  let from;
  if (p.fxId !== undefined) {
    from = list.findIndex((f) => str(f.id) === str(p.fxId));
    if (from < 0) throw new OpError(`効果 ${p.fxId} が見つかりません`, { fxId: p.fxId });
  } else {
    from = clamp(Math.round(finite(p.from, -1)), 0, list.length - 1);
  }
  const to = clamp(Math.round(finite(p.index !== undefined ? p.index : p.to, from)), 0, list.length - 1);
  list.splice(to, 0, list.splice(from, 1)[0]);
  c.touch(found.track);
  return { clipId: found.clip.id, from, to, order: list.map((f) => str(f.id)) };
});

/* ── 遷移 ──────────────────────────────────────────────────────── */

/**
 * clip.setTransition … `{ clipId, edge:"in"|"out", type?, duration?, params? }`
 * 遷移は 2 枚の重なりで作るので、**隣と自分の半分**までに自動で収める（§1-3）。
 * 同じ境界に 2 つ在ると 2 重に掛かるので、隣の向かい側は消す。
 */
const opClipSetTransition = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, track = found.track;
  const edge = str(p.edge !== undefined ? p.edge : p.at) === "in" ? "in" : "out";
  const spec = plain(p.transition) || p;
  const field = edge === "in" ? "transitionIn" : "transitionOut";
  sortClips(track);
  const other = edge === "in" ? prevClip(track, clip) : nextClip(track, clip);
  if (spec.duration !== undefined && finite(spec.duration, 0) <= 0) {
    clip[field] = null;
    c.touch(track);
    return { clipId: clip.id, edge, removed: true, duration: 0 };
  }
  const want = { type: str(spec.type) || "crossfade", duration: Math.max(0, finite(spec.duration, 0.5)), params: plain(spec.params) ? deepClone(spec.params) : {} };
  const fitted = fitTransition(want, clip, other);
  clip[field] = fitted;
  if (other) other[edge === "in" ? "transitionOut" : "transitionIn"] = null;
  c.touch(track);
  return { clipId: clip.id, edge, type: want.type, duration: fitted ? fitted.duration : 0, removed: !fitted };
});

/** clip.removeTransition … `{ clipId, edge? }`（省略で両端） */
const opClipRemoveTransition = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const edge = p.edge === undefined || p.edge === null ? null : (str(p.edge) === "in" ? "in" : "out");
  let n = 0;
  if (edge === null || edge === "in") { if (found.clip.transitionIn) n++; found.clip.transitionIn = null; }
  if (edge === null || edge === "out") { if (found.clip.transitionOut) n++; found.clip.transitionOut = null; }
  c.touch(found.track);
  return { clipId: found.clip.id, removed: n };
});

/* ══ §I キーフレームの op ═════════════════════════════════════════ */

/** その path の「今の静的な値」（キーが無いときの出発点） */
function staticValue(clip, path) {
  const v = getPath(clip, path);
  if (typeof v === "number" || typeof v === "string") return v;
  const base = newClip(str(clip.kind) || "video", {});
  base.color = defaultColorGrade();
  base.mask = defaultMask();
  base.chroma = defaultChroma();
  if (!base.text) base.text = defaultTextSpec();
  const d = getPath(base, path);
  return (typeof d === "number" || typeof d === "string") ? d : null;
}

function checkKeyPath(clip, path) {
  const s = need(path, "path");
  if (!isKeyablePath(s)) throw new OpError(`キーを打てない path です: ${s}`, { path: s });
  const seg = s.split(".");
  if (seg[0] === "fx" && !arr(clip.fx).some((f) => str(f.id) === seg[1])) {
    throw new OpError(`効果 ${seg[1]} がこのクリップに在りません`, { path: s, fxId: seg[1] });
  }
  return s;
}

function checkKeyValue(v) {
  if (typeof v === "string") {
    const s = v.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    const n = numOrNaN(s);
    if (s && Number.isFinite(n)) return n;   // JSON 往復で "1.5" になった数は通す
    throw new OpError(`v は数値か #rrggbb です（来たのは ${s}）`, { v });
  }
  const n = typeof v === "number" && Number.isFinite(v) ? v : NaN;
  if (!Number.isFinite(n)) throw new OpError("v は数値か #rrggbb です", { v });
  return n;
}

function insertKeyInto(clip, path, key) {
  if (!plain(clip.keys)) clip.keys = {};
  const list = arr(clip.keys[path]).slice();
  let hit = -1;
  for (let i = 0; i < list.length; i++) if (Math.abs(finite(list[i].t, 0) - key.t) <= KEY_EPS) { hit = i; break; }
  if (hit >= 0) list[hit] = key;
  else list.push(key);
  const dd = dedupeKeys(list);
  clip.keys[path] = dd;
  return dd.findIndex((k) => Math.abs(k.t - key.t) <= KEY_EPS);
}

/**
 * key.add … `{ clipId, path, t, v?, ease?, bez? }`
 * t は clip ローカル秒（フレームへ丸める）。同じ t は置換。
 * v を省くと **その時刻の今の値**（キーの補間値 → 静的値）を入れる。
 */
const opKeyAdd = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  const path = checkKeyPath(clip, p.path);
  const t = clamp(snapFrame(finite(p.t !== undefined ? p.t : (c.playhead - clip.start), 0), c.fps), 0, Math.max(MIN_CLIP, clip.duration));
  let v = p.v;
  if (v === undefined || v === null) {
    const cur = sampleKeyList(arr(plain(clip.keys) ? clip.keys[path] : null), t);
    v = cur ? cur.v : staticValue(clip, path);
    if (v === null || v === undefined) throw new OpError(`${path} の今の値が分からないので v を渡してください`, { path });
  }
  const ease = EASES.indexOf(str(p.ease)) >= 0 ? str(p.ease) : "linear";
  const key = { t, v: checkKeyValue(v), ease };
  if (ease === "bezier") key.bez = arr(p.bez).length >= 4 ? p.bez.slice(0, 4).map((n) => finite(n, 0)) : [0.25, 0.1, 0.25, 1];
  const index = insertKeyInto(clip, path, key);
  c.touch(found.track);
  return { clipId: clip.id, path, index, t: key.t, v: key.v, ease };
});

/** 指した 1 本のキーの位置（index か t の近さ） */
function keyIndex(list, p, fps) {
  if (p.index !== undefined && p.index !== null) {
    const i = Math.round(finite(p.index, -1));
    if (i < 0 || i >= list.length) throw new OpError(`index ${p.index} のキーが在りません`, { index: p.index, length: list.length });
    return i;
  }
  if (p.t === undefined || p.t === null) throw new OpError("t か index が必要です");
  const t = finite(p.t, 0);
  const tol = Math.max(KEY_EPS, frameDur(fps) / 2);
  let best = -1, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(finite(list[i].t, 0) - t);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || bd > tol) throw new OpError(`t=${t} の近くにキーが在りません`, { t, tol });
  return best;
}

/** key.remove … `{ clipId, path, t?|index?, all? }` */
const opKeyRemove = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  const path = need(p.path, "path");
  const keys = plain(clip.keys) || {};
  const list = arr(keys[path]);
  if (!list.length) throw new OpError(`${path} にキーが在りません`, { path });
  if (p.all === true) {
    delete clip.keys[path];
    c.touch(found.track);
    return { clipId: clip.id, path, removed: list.length };
  }
  const i = keyIndex(list, p, c.fps);
  const gone = list.splice(i, 1)[0];
  if (!list.length) delete clip.keys[path];
  c.touch(found.track);
  return { clipId: clip.id, path, removed: 1, t: finite(gone.t, 0) };
});

/** key.update … `{ clipId, path, index?|t?, v?, ease?, bez?, to? }`（to は新しい t） */
const opKeyUpdate = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  const path = checkKeyPath(clip, p.path);
  const list = arr(plain(clip.keys) ? clip.keys[path] : null);
  if (!list.length) throw new OpError(`${path} にキーが在りません`, { path });
  const i = keyIndex(list, p, c.fps);
  const key = list[i];
  if (p.v !== undefined && p.v !== null) key.v = checkKeyValue(p.v);
  if (p.ease !== undefined) {
    const ease = EASES.indexOf(str(p.ease)) >= 0 ? str(p.ease) : "linear";
    key.ease = ease;
    if (ease === "bezier") key.bez = arr(p.bez).length >= 4 ? p.bez.slice(0, 4).map((n) => finite(n, 0)) : (arr(key.bez).length >= 4 ? key.bez : [0.25, 0.1, 0.25, 1]);
    else delete key.bez;
  } else if (p.bez !== undefined && key.ease === "bezier") {
    key.bez = arr(p.bez).length >= 4 ? p.bez.slice(0, 4).map((n) => finite(n, 0)) : key.bez;
  }
  const to = p.to !== undefined ? p.to : p.newT;
  if (to !== undefined && to !== null) {
    key.t = clamp(snapFrame(finite(to, key.t), c.fps), 0, Math.max(MIN_CLIP, clip.duration));
  }
  clip.keys[path] = dedupeKeys(list);
  const index = clip.keys[path].findIndex((k) => k === key);
  c.touch(found.track);
  return { clipId: clip.id, path, index: index < 0 ? 0 : index, t: key.t, v: key.v, ease: key.ease };
});

/**
 * key.moveAll … `{ clipId, path?, delta?, scale? }`
 * t' = t*scale + delta（path 省略で全部）。尺の外へは出さない。
 */
const opKeyMoveAll = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip;
  const keys = plain(clip.keys) || {};
  const paths = p.path === undefined || p.path === null ? Object.keys(keys) : [need(p.path, "path")];
  const delta = finite(p.delta, 0);
  const scale = Math.abs(finite(p.scale, 1)) || 1;
  const hi = Math.max(MIN_CLIP, clip.duration);
  let n = 0;
  for (const path of paths) {
    const list = arr(keys[path]);
    if (!list.length) continue;
    for (const k of list) { k.t = clamp(finite(k.t, 0) * scale + delta, 0, hi); n++; }
    clip.keys[path] = dedupeKeys(list);
  }
  c.touch(found.track);
  return { clipId: clip.id, paths, moved: n, delta, scale };
});

/* ══ §J トラック・素材・印・設定・字幕・タイムライン・複合 ════════ */

/** track.add … `{ kind, index?, name?, height?, ... }` @returns {{trackId}} */
const opTrackAdd = op((draft, p, c) => {
  const kind = str(p.kind) || "video";
  if (TRACK_KINDS.indexOf(kind) < 0) throw new OpError(`知らないトラックの種類です: ${kind}`, { kind });
  const tr = addTrack(draft, kind, omit(p, ["kind", "index", "at", "clips"]), p.index !== undefined ? p.index : p.at);
  c.touch(tr);
  return { trackId: tr.id, id: tr.id, kind, name: tr.name, index: arr(draft.tracks).indexOf(tr) };
});

/** track.remove … `{ trackId }`（中のクリップも消える。相棒の縁も切る） */
const opTrackRemove = op((draft, p, c) => {
  const tr = needTrack(draft, p.trackId);
  if (tr.locked) throw new OpError("鍵の掛かったトラックは消せません", { trackId: tr.id, locked: true });
  const list = arr(draft.tracks);
  const i = list.indexOf(tr);
  const clips = arr(tr.clips).length;
  for (const cl of arr(tr.clips)) unlinkPartner(draft, cl);
  list.splice(i, 1);
  return { trackId: str(tr.id), removed: 1, clips };
});

/** track.update … `{ trackId, patch }`（clips は触らせない） */
const opTrackUpdate = op((draft, p, c) => {
  const tr = needTrack(draft, p.trackId);
  const patch = plain(p.patch) || omit(p, ["trackId"]);
  if (!plain(patch)) throw new OpError("patch（object）が必要です");
  if (patch.clips !== undefined) throw new OpError("clips は clip.* の op から触ります", { trackId: tr.id });
  if (patch.kind !== undefined && str(patch.kind) !== str(tr.kind)) throw new OpError("トラックの kind は変えられません", { trackId: tr.id });
  mergeInto(tr, patch, "", new Set(["id", "kind", "clips"]));
  fixFxList(tr);
  tr.name = str(tr.name) || nextTrackName(draft, tr.kind);
  tr.height = clamp(Math.round(finite(tr.height, 72)), 28, 400);
  tr.volume = clamp(finite(tr.volume, 1), 0, 4);
  tr.pan = clamp(finite(tr.pan, 0), -1, 1);
  c.touch(tr);
  return { trackId: str(tr.id), changed: Object.keys(patch) };
});

/** track.reorder … `{ trackId, index }` か `{ from, to }`（0 が一番下） */
const opTrackReorder = op((draft, p) => {
  const list = arr(draft.tracks);
  let from;
  if (p.trackId !== undefined) {
    const tr = needTrack(draft, p.trackId);
    from = list.indexOf(tr);
  } else {
    from = Math.round(finite(p.from, -1));
    if (from < 0 || from >= list.length) throw new OpError(`from ${p.from} のトラックが在りません`, { from: p.from });
  }
  const to = clamp(Math.round(finite(p.index !== undefined ? p.index : p.to, from)), 0, list.length - 1);
  list.splice(to, 0, list.splice(from, 1)[0]);
  return { trackId: str(list[to].id), from, to, order: list.map((t) => str(t.id)) };
});

/** asset.add … `{ asset }` か素材そのもの @returns {{assetId}} */
const opAssetAdd = op((draft, p, c) => {
  const spec = plain(p.asset) || omit(p, ["asset"]);
  const a = newAsset(spec);
  if (!spec.id || assetById(draft, a.id)) a.id = uid("as");
  arr(draft.assets).push(a);
  c.amap = null;
  return { assetId: a.id, id: a.id, kind: a.kind, name: a.name };
});

/**
 * asset.remove … `{ assetId }`
 * **その素材を使っているクリップも消す**（消した数を返す）。
 * 背景に指していたら背景も外す（無い素材を指したままだと engine が毎フレーム探す）。
 */
const opAssetRemove = op((draft, p, c) => {
  const id = need(p.assetId, "assetId");
  const list = arr(draft.assets);
  const i = list.findIndex((a) => a && str(a.id) === id);
  if (i < 0) throw new OpError(`素材 ${id} が見つかりません`, { assetId: id });
  list.splice(i, 1);
  c.amap = null;
  let clips = 0;
  const sweep = (tracks, depth) => {
    for (const tr of arr(tracks)) {
      const keep = [];
      for (const cl of arr(tr.clips)) {
        if (str(cl.assetId) === id) { unlinkPartner(draft, cl); clips++; continue; }
        if (plain(cl.compound) && depth < MAX_DEPTH) sweep(cl.compound.tracks, depth + 1);
        keep.push(cl);
      }
      if (keep.length !== arr(tr.clips).length) { tr.clips = keep; c.touch(tr); }
    }
  };
  sweep(draft.tracks, 0);
  const bg = plain(draft.settings) && plain(draft.settings.background);
  if (bg && str(bg.assetId) === id) { bg.assetId = null; if (str(bg.type) === "image") bg.type = "color"; }
  return { assetId: id, removed: 1, clips };
});

/** asset.update … `{ assetId, patch }`（解析結果の差し込みもここ） */
const opAssetUpdate = op((draft, p, c) => {
  const id = need(p.assetId, "assetId");
  const a = assetById(draft, id);
  if (!a) throw new OpError(`素材 ${id} が見つかりません`, { assetId: id });
  const patch = plain(p.patch) || omit(p, ["assetId"]);
  if (!plain(patch)) throw new OpError("patch（object）が必要です");
  const durChanged = patch.duration !== undefined;
  mergeInto(a, patch, "", new Set(["id"]));
  if (str(a.kind) === "image") a.duration = 0;
  else a.duration = Math.max(0, finite(a.duration, 0));
  c.amap = null;
  if (durChanged) {
    // 尺が縮むと out がはみ出すので、使っているトラックだけ整える
    for (const tr of arr(draft.tracks)) {
      if (arr(tr.clips).some((cl) => str(cl.assetId) === id)) c.touch(tr);
    }
  }
  return { assetId: id, changed: Object.keys(patch) };
});

/* ── 印（marker / chapter）───────────────────────────────────── */

const opMarkerAdd = op((draft, p) => {
  const m = newMarker({ t: Math.max(0, finite(p.t, 0)), name: str(p.name), color: p.color, note: str(p.note) });
  if (p.id && !arr(draft.markers).some((x) => str(x.id) === str(p.id))) m.id = str(p.id);
  arr(draft.markers).push(m);
  draft.markers.sort(byT);
  return { markerId: m.id, id: m.id, t: m.t };
});

const opMarkerRemove = op((draft, p) => {
  const id = str(p.markerId || p.id);
  const list = arr(draft.markers);
  let i = -1;
  if (id) i = list.findIndex((m) => str(m.id) === id);
  else if (p.t !== undefined) {
    const t = finite(p.t, 0);
    let bd = Infinity;
    for (let k = 0; k < list.length; k++) { const d = Math.abs(finite(list[k].t, 0) - t); if (d < bd) { bd = d; i = k; } }
    if (bd > 0.25) i = -1;
  } else throw new OpError("markerId か t が必要です");
  if (i < 0) throw new OpError("印が見つかりません", { markerId: id, t: p.t });
  const gone = list.splice(i, 1)[0];
  return { markerId: str(gone.id), removed: 1 };
});

const opMarkerUpdate = op((draft, p) => {
  const id = need(p.markerId || p.id, "markerId");
  const m = arr(draft.markers).find((x) => str(x.id) === id);
  if (!m) throw new OpError("印が見つかりません", { markerId: id });
  const patch = plain(p.patch) || omit(p, ["markerId", "id"]);
  mergeInto(m, patch, "", new Set(["id"]));
  m.t = Math.max(0, finite(m.t, 0));
  draft.markers.sort(byT);
  return { markerId: id, t: m.t };
});

const opChapterAdd = op((draft, p) => {
  const ch = newChapter({ t: Math.max(0, finite(p.t, 0)), title: str(p.title || p.name) });
  arr(draft.chapters).push(ch);
  draft.chapters.sort(byT);
  return { chapterId: ch.id, id: ch.id, t: ch.t };
});

const opChapterRemove = op((draft, p) => {
  const id = need(p.chapterId || p.id, "chapterId");
  const list = arr(draft.chapters);
  const i = list.findIndex((x) => str(x.id) === id);
  if (i < 0) throw new OpError("チャプターが見つかりません", { chapterId: id });
  list.splice(i, 1);
  return { chapterId: id, removed: 1 };
});

const opChapterUpdate = op((draft, p) => {
  const id = need(p.chapterId || p.id, "chapterId");
  const ch = arr(draft.chapters).find((x) => str(x.id) === id);
  if (!ch) throw new OpError("チャプターが見つかりません", { chapterId: id });
  mergeInto(ch, plain(p.patch) || omit(p, ["chapterId", "id"]), "", new Set(["id"]));
  ch.t = Math.max(0, finite(ch.t, 0));
  draft.chapters.sort(byT);
  return { chapterId: id, t: ch.t };
});

/* ── 設定・名前 ────────────────────────────────────────────────── */

/** settings.update … `{ patch }`（ratio だけ来たら寸法も合わせる） */
const opSettingsUpdate = op((draft, p) => {
  const patch = plain(p.patch) || omit(p, ["patch"]);
  if (!plain(patch)) throw new OpError("patch（object）が必要です");
  if (!plain(draft.settings)) draft.settings = {};
  const s = draft.settings;
  mergeInto(s, patch, "", null);
  if (patch.ratio !== undefined) {
    const r = str(s.ratio);
    if (!Object.prototype.hasOwnProperty.call(RATIOS, r)) throw new OpError(`知らない比率です: ${r}`, { ratio: r, known: Object.keys(RATIOS) });
    if (patch.width === undefined && patch.height === undefined && r !== "custom") {
      s.width = RATIOS[r].w;
      s.height = RATIOS[r].h;
    }
  }
  s.width = Math.max(2, Math.round(finite(s.width, 1920) / 2) * 2);
  s.height = Math.max(2, Math.round(finite(s.height, 1080) / 2) * 2);
  s.fps = clamp(finite(s.fps, 30), 1, 240);
  s.sampleRate = clamp(Math.round(finite(s.sampleRate, 48000)), 8000, 192000);
  if (plain(s.audio)) s.audio.master = clamp(finite(s.audio.master, 1), 0, 4);
  return { changed: Object.keys(patch), width: s.width, height: s.height, fps: s.fps, ratio: s.ratio };
});

/** project.rename … `{ name }` */
const opProjectRename = op((draft, p) => {
  const name = str(p.name !== undefined ? p.name : p.title).trim();
  if (!name) throw new OpError("プロジェクト名が空です");
  draft.name = name.slice(0, 200);
  return { name: draft.name };
});

/* ── 字幕の取り込み（SRT / VTT → text クリップ列）──────────────── */

/** "00:01:23,500" / "1:23.4" / "83" → 秒（読めなければ null） */
function parseTs(s) {
  const m = /^\s*(?:(\d{1,3}):)?(?:(\d{1,3}):)?(\d{1,3})(?:[.,](\d{1,3}))?\s*$/.exec(str(s));
  if (!m) return null;
  const h = m[1] !== undefined && m[2] !== undefined ? Number(m[1]) : 0;
  const mi = m[2] !== undefined ? Number(m[2]) : (m[1] !== undefined ? Number(m[1]) : 0);
  const sec = Number(m[3]);
  const frac = m[4] ? Number("0." + m[4]) : 0;
  const t = h * 3600 + mi * 60 + sec + frac;
  return Number.isFinite(t) ? t : null;
}

/** 字幕の飾り（タグ・実体参照）を落とす */
function cleanCueText(s) {
  return str(s)
    .replace(/\{\\[^}]*\}/g, "")        // ASS の {\an8} 等
    .replace(/<[^>]*>/g, "")            // <i> <v Name> 等
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"").replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .split("\n").map((x) => x.trim()).filter((x) => x.length).join("\n");
}

/**
 * SRT / VTT を解析する（どちらも "--> " の行を見つけて読む方式）。
 * 番号行・WEBVTT ヘッダ・NOTE/STYLE/REGION は "-->" を持たないので自然に飛ぶ。
 * @param {string} text @returns {{start:number,end:number,text:string}[]}
 */
function parseSubtitles(text) {
  const src = str(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    const k = lines[i].indexOf("-->");
    if (k < 0) continue;
    const a = parseTs(lines[i].slice(0, k));
    const rest = lines[i].slice(k + 3).trim().split(/\s+/)[0];
    const b = parseTs(rest);
    if (a === null || b === null) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const s = lines[j];
      if (!s.trim() || s.indexOf("-->") >= 0) break;
      body.push(s);
    }
    // 次のキューの番号行（SRT）が混ざったら落とす
    if (body.length > 1 && /^\d+$/.test(body[body.length - 1].trim()) && j < lines.length && lines[j].indexOf("-->") >= 0) body.pop();
    const t = cleanCueText(body.join("\n"));
    if (t) cues.push({ start: Math.min(a, b), end: Math.max(a, b), text: t });
    i = j - 1;
  }
  return cues.sort((x, y) => x.start - y.start);
}

/**
 * subtitle.import … `{ srt?|vtt?|text?, trackId?, style?, offset? }`
 * 字幕の文字列を text クリップの列にする。重なりは前のキューを詰めて解く。
 * 置き先が無ければ overlay トラック「字幕」を 1 本作る。
 */
const opSubtitleImport = op((draft, p, c) => {
  const raw = str(p.srt || p.vtt || p.text || p.content || p.data);
  if (!raw.trim()) throw new OpError("字幕の文字列が空です");
  const cues = parseSubtitles(raw);
  if (!cues.length) throw new OpError("字幕を読み取れませんでした（SRT / VTT の時刻行が見つかりません）");
  const offset = finite(p.offset, 0);
  const style = plain(p.style) || plain(draft.subtitleStyle) || defaultTextStyle();
  // 重なりを解いてから並べる（§1-1 を後で直すより、意味の在る詰め方をここで決める）
  const plan = [];
  for (const q of cues) {
    let s = Math.max(0, q.start + offset);
    let e = Math.max(s + MIN_CLIP, q.end + offset);
    const last = plan[plan.length - 1];
    if (last) {
      if (s < last.end - EPS) {
        if (last.end - last.start > MIN_CLIP * 2 && s > last.start + MIN_CLIP) last.end = s;
        else s = last.end;
      }
      if (e < s + MIN_CLIP) e = s + MIN_CLIP;
    }
    plan.push({ start: s, end: e, text: q.text });
  }
  const first = plan[0].start;
  const last = plan[plan.length - 1].end;
  let track;
  if (p.trackId) {
    track = assertUnlocked(needTrack(draft, p.trackId));
  } else {
    track = freeTrack(draft, "overlay", first, last, null) || addTrack(draft, "overlay", { name: str(p.name) || "字幕" }, undefined);
  }
  c.touch(track);
  const ids = [];
  for (const q of plan) {
    const cl = newClip("text", {
      name: q.text.split("\n")[0].slice(0, 24),
      start: q.start, duration: q.end - q.start,
      text: { content: q.text, style: deepClone(style) }
    });
    placeClip(draft, track, cl, q.start, "overwrite", c);
    ids.push(cl.id);
  }
  return { trackId: str(track.id), count: ids.length, clipIds: ids, ids, start: first, end: last };
});

/* ── タイムライン（貼り付け・差し込み・上書き・隙間詰め）───────── */

/** paste / insert / overwrite の共通の本体 */
function pasteClips(draft, p, c, forceMode) {
  const specs = arr(p.clips).length ? arr(p.clips) : (plain(p.clip) ? [p.clip] : []);
  if (!specs.length) throw new OpError("貼り付けるクリップがありません（clips が空）");
  const mode = modeOf(forceMode || p.mode, "overwrite");
  const at = Math.max(0, finite(p.at !== undefined ? p.at : c.playhead, 0));
  const built = [];
  let base = Infinity;
  for (const s of specs) {
    const spec = plain(s) || {};
    const cl = buildClip(draft, spec, c);          // 先に全部作る（駄目なら何も壊さずに投げる）
    const tr = spec.trackId ? assertUnlocked(needTrack(draft, spec.trackId))
      : (p.trackId ? assertUnlocked(needTrack(draft, p.trackId)) : null);
    const from = finite(spec.start, 0);
    built.push({ cl, tr, from });
    if (from < base) base = from;
  }
  if (!Number.isFinite(base)) base = 0;
  let span = 0;
  for (const b of built) span = Math.max(span, (b.from - base) + b.cl.duration);
  if (mode === "insert") {
    // 1 つずつ insert すると相対位置が崩れるので、**先に span だけ場所を空ける**
    const targets = new Set();
    for (const b of built) {
      if (!b.tr) b.tr = trackFor(draft, trackKindFor(b.cl.kind), at, at + span, c);
      targets.add(b.tr);
    }
    const all = p.allTracks === true ? arr(draft.tracks) : Array.from(targets);
    for (const tr of all) {
      if (tr.locked) continue;
      splitStraddling(draft, tr, at, c, null);
      shiftAfter(tr, at, span, null);
      c.touch(tr);
    }
  }
  const ids = [];
  for (const b of built) {
    const start = at + (b.from - base);
    const tr = b.tr || trackFor(draft, trackKindFor(b.cl.kind), start, start + b.cl.duration, c);
    placeClip(draft, tr, b.cl, start, mode === "insert" ? "overwrite" : mode, c);
    ids.push(b.cl.id);
  }
  return { ids, id: ids[0], clipId: ids[0], at, span, mode };
}

/** timeline.paste … `{ clips, at?, trackId?, mode? }`（相対位置を保つ） */
const opTimelinePaste = op((draft, p, c) => pasteClips(draft, p, c, null));
/** timeline.insert … 差し込み（後続を後ろへ。allTracks:true で全トラック） */
const opTimelineInsert = op((draft, p, c) => pasteClips(draft, p, c, "insert"));
/** timeline.overwrite … 上書き（重なった既存を削る／割る） */
const opTimelineOverwrite = op((draft, p, c) => pasteClips(draft, p, c, "overwrite"));

/**
 * timeline.magneticClose … `{ trackId?, from? }`
 * 隙間を詰める（trackId 省略で全トラック）。from より前は触らない。
 */
const opTimelineMagneticClose = op((draft, p, c) => {
  const tracks = p.trackId ? [assertUnlocked(needTrack(draft, p.trackId))] : arr(draft.tracks).filter((t) => !t.locked);
  const from = Math.max(0, finite(p.from, 0));
  let moved = 0, closed = 0;
  for (const tr of tracks) {
    sortClips(tr);
    let cursor = from;
    for (const cl of arr(tr.clips)) {
      if (clipEnd(cl) <= from + EPS) { cursor = Math.max(cursor, clipEnd(cl)); continue; }
      if (cl.start > cursor + EPS) { closed += cl.start - cursor; cl.start = cursor; moved++; }
      cursor = clipEnd(cl);
    }
    c.touch(tr);
  }
  return { moved, closed, tracks: tracks.map((t) => str(t.id)) };
});

/* ── 複合クリップ ──────────────────────────────────────────────── */

/** 入れ子の深さ（compound でなければ 0） */
function compoundDepth(clip) {
  if (str(clip && clip.kind) !== "compound" || !plain(clip.compound)) return 0;
  let d = 1;
  for (const tr of arr(clip.compound.tracks)) {
    for (const cl of arr(tr.clips)) d = Math.max(d, 1 + compoundDepth(cl));
  }
  return d;
}

/**
 * compound.make … `{ clipIds, name? }`
 * 選んだクリップを 1 つの複合クリップに畳む（元のトラック構成は中に残る）。
 */
const opCompoundMake = op((draft, p, c) => {
  const ids = idsOf(p);
  const items = ids.map((id) => needClipAt(draft, id));
  for (const it of items) {
    assertUnlocked(it.track);
    if (compoundDepth(it.clip) + 1 > MAX_DEPTH) throw new OpError(`入れ子が深すぎます（複合は ${MAX_DEPTH} 段まで）`, { clipId: it.clip.id, max: MAX_DEPTH });
  }
  const minStart = Math.min.apply(null, items.map((x) => x.clip.start));
  const maxEnd = Math.max.apply(null, items.map((x) => clipEnd(x.clip)));
  const span = Math.max(MIN_CLIP, maxEnd - minStart);
  // 元のトラックごとに内側トラックを作る（下からの順は tracks の順で保つ）
  const groups = [];
  for (const tr of arr(draft.tracks)) {
    const mine = items.filter((x) => x.track === tr).map((x) => x.clip);
    if (mine.length) groups.push({ tr, clips: mine });
  }
  const inner = [];
  for (const g of groups) {
    const t = newTrack(g.tr.kind, {
      name: g.tr.name, height: g.tr.height, volume: g.tr.volume, pan: g.tr.pan,
      muted: g.tr.muted, fx: deepClone(arr(g.tr.fx))
    });
    t.clips = g.clips.map((cl) => {
      const k = cloneClip(cl, { newId: false });   // id ごと持ち込む（元は消えるので重複しない）
      k.start = Math.max(0, cl.start - minStart);
      k.groupId = null;
      return k;
    });
    tidyTrack(draft, t, c);
    inner.push(t);
  }
  for (const it of items) {
    // 中に入る相棒どうしの縁は残し、外に居る相棒との縁だけ切る
    const partner = it.clip.linkedId ? findClip(draft, it.clip.linkedId) : null;
    if (partner && !items.some((x) => x.clip === partner.clip)) unlinkPartner(draft, it.clip);
    removeFromTrack(it.track, it.clip.id);
    c.touch(it.track);
  }
  const host = groups[0].tr;
  const cl = newClip("compound", {
    name: str(p.name) || "複合クリップ",
    start: minStart, duration: span,
    in: 0, out: span, speed: 1,
    compound: { tracks: inner }
  });
  placeClip(draft, host, cl, minStart, "overwrite", c);
  return { clipId: cl.id, id: cl.id, trackId: str(host.id), tracks: inner.length, clips: items.length };
});

/**
 * compound.enter … `{ clipId }`
 * **何も書き換えない**（中へ潜るのは store の view の仕事）。
 * 潜れるかどうかを検めて中身の形だけ返す。
 */
function opCompoundEnter(draft, p) {
  const payload = plain(p) || {};
  const found = findClipAt(draft, payload.clipId);
  if (str(found.clip.kind) !== "compound" || !plain(found.clip.compound)) {
    throw new OpError("複合クリップではありません", { clipId: payload.clipId });
  }
  const tracks = arr(found.clip.compound.tracks);
  return {
    clipId: str(found.clip.id), trackId: str(found.track.id),
    tracks: tracks.length,
    clips: tracks.reduce((n, t) => n + arr(t.clips).length, 0),
    duration: found.clip.duration
  };
}

/**
 * compound.flatten … `{ clipId }`
 * 複合クリップを解いて中身をタイムラインへ戻す。
 * 速度や in/out で切られていた分はそのまま反映する（見えていない所は捨てる）。
 */
const opCompoundFlatten = op((draft, p, c) => {
  const found = needClipAt(draft, p.clipId);
  const clip = found.clip, host = assertUnlocked(found.track);
  if (str(clip.kind) !== "compound" || !plain(clip.compound)) throw new OpError("複合クリップではありません", { clipId: clip.id });
  if (clip.reverse) throw new OpError("逆再生の複合クリップは展開できません（先に逆再生を戻してください）", { clipId: clip.id });
  const inner = arr(clip.compound.tracks).filter((t) => plain(t));
  if (!inner.length) throw new OpError("中身が空の複合クリップです", { clipId: clip.id });
  const S = clip.start, D = clip.duration;
  const IN = Math.max(0, finite(clip.in, 0));
  const OUT = Math.max(IN + MIN_CLIP, finite(clip.out, IN + D));
  /** 内側の秒 → タイムライン秒 */
  const toTL = (s) => S + invInteg(clip, clamp(s, IN, OUT) - IN);
  // 置き先を先に決める（トラックが足りないなら何も壊さずに投げる）
  const plan = [host];
  let extra = 0;
  for (let i = 1; i < inner.length; i++) {
    const kind = TRACK_KINDS.indexOf(str(inner[i].kind)) >= 0 ? str(inner[i].kind) : "video";
    const skip = plan.filter(Boolean).map((t) => str(t.id));
    const free = freeTrack(draft, kind, S, S + D, skip);
    plan.push(free || null);
    if (!free) extra++;
  }
  if (arr(draft.tracks).length + extra > MAX_TRACKS) {
    throw new OpError(`展開するとトラックが ${MAX_TRACKS} 本を超えます`, { max: MAX_TRACKS, need: extra });
  }
  removeFromTrack(host, clip.id);
  c.touch(host);
  const ids = [];
  const used = [];
  for (let i = 0; i < inner.length; i++) {
    const dest = plan[i] || addTrack(draft, inner[i].kind, { name: str(inner[i].name) }, undefined);
    c.touch(dest);
    used.push(str(dest.id));
    for (const raw of arr(inner[i].clips)) {
      const s0 = finite(raw.start, 0), s1 = clipEnd(raw);
      const a = Math.max(IN, s0), b = Math.min(OUT, s1);
      if (!(b > a + MIN_CLIP * 0.5)) continue;          // 見えていない部分は捨てる
      const cp = cloneClip(raw);
      const asset = assetFor(draft, cp, c);
      sliceClip(cp, a - s0, b - s0, asset);
      const t0 = toTL(a), t1 = toTL(b);
      scaleClipTime(cp, (t1 - t0) / Math.max(MIN_CLIP, cp.duration));
      cp.groupId = null;
      placeClip(draft, dest, cp, Math.max(0, t0), "overwrite", c);
      ids.push(cp.id);
    }
  }
  return { ids, removed: str(clip.id), tracks: used, clips: ids.length };
});

/* ══ §K 名簿（OPS / OP_LABELS / applyOp）═════════════════════════ */

/**
 * 編集操作の名簿。`OPS[type](draft, payload, ctx)` が draft を直に書き換える。
 * @type {Object<string, (draft:Object, payload:Object, ctx?:Object)=>*>}
 */
export const OPS = Object.freeze({
  /* クリップ */
  "clip.add": opClipAdd,
  "clip.move": opClipMove,
  "clip.trim": opClipTrim,
  "clip.split": opClipSplit,
  "clip.remove": opClipRemove,
  "clip.rippleDelete": opClipRippleDelete,
  "clip.duplicate": opClipDuplicate,
  "clip.reorder": opClipReorder,
  "clip.slip": opClipSlip,
  "clip.roll": opClipRoll,
  "clip.setSpeed": opClipSetSpeed,
  "clip.setSpeedRamp": opClipSetSpeedRamp,
  "clip.freeze": opClipFreeze,
  "clip.reverse": opClipReverse,
  "clip.detachAudio": opClipDetachAudio,
  "clip.link": opClipLink,
  "clip.group": opClipGroup,
  "clip.ungroup": opClipUngroup,
  "clip.update": opClipUpdate,
  "clip.setTransform": branchSugar("transform"),
  "clip.setColor": branchSugar("color"),
  "clip.setMask": branchSugar("mask"),
  "clip.setChroma": branchSugar("chroma"),
  "clip.setText": branchSugar("text"),
  "clip.setShape": branchSugar("shape"),
  "clip.addFx": opClipAddFx,
  "clip.removeFx": opClipRemoveFx,
  "clip.updateFx": opClipUpdateFx,
  "clip.reorderFx": opClipReorderFx,
  "clip.setTransition": opClipSetTransition,
  "clip.removeTransition": opClipRemoveTransition,
  /* キーフレーム */
  "key.add": opKeyAdd,
  "key.remove": opKeyRemove,
  "key.update": opKeyUpdate,
  "key.moveAll": opKeyMoveAll,
  /* トラック */
  "track.add": opTrackAdd,
  "track.remove": opTrackRemove,
  "track.update": opTrackUpdate,
  "track.reorder": opTrackReorder,
  /* 素材 */
  "asset.add": opAssetAdd,
  "asset.remove": opAssetRemove,
  "asset.update": opAssetUpdate,
  /* 印 */
  "marker.add": opMarkerAdd,
  "marker.remove": opMarkerRemove,
  "marker.update": opMarkerUpdate,
  "chapter.add": opChapterAdd,
  "chapter.remove": opChapterRemove,
  "chapter.update": opChapterUpdate,
  /* 全体 */
  "settings.update": opSettingsUpdate,
  "project.rename": opProjectRename,
  "subtitle.import": opSubtitleImport,
  /* タイムライン */
  "timeline.paste": opTimelinePaste,
  "timeline.insert": opTimelineInsert,
  "timeline.overwrite": opTimelineOverwrite,
  "timeline.magneticClose": opTimelineMagneticClose,
  /* 複合 */
  "compound.make": opCompoundMake,
  "compound.enter": opCompoundEnter,
  "compound.flatten": opCompoundFlatten
});

/**
 * 取消履歴・メニューに出す日本語の表示名（store.history() がこれを見せる）。
 * @type {Object<string,string>}
 */
export const OP_LABELS = Object.freeze({
  "clip.add": "追加",
  "clip.move": "移動",
  "clip.trim": "長さ調整",
  "clip.split": "分割",
  "clip.remove": "削除",
  "clip.rippleDelete": "詰めて削除",
  "clip.duplicate": "複製",
  "clip.reorder": "並べ替え",
  "clip.slip": "素材をずらす",
  "clip.roll": "境界を動かす",
  "clip.setSpeed": "速度",
  "clip.setSpeedRamp": "速度の変化",
  "clip.freeze": "静止",
  "clip.reverse": "逆再生",
  "clip.detachAudio": "音を分離",
  "clip.link": "リンク",
  "clip.group": "グループ化",
  "clip.ungroup": "グループ解除",
  "clip.update": "変更",
  "clip.setTransform": "変形",
  "clip.setColor": "カラー",
  "clip.setMask": "マスク",
  "clip.setChroma": "クロマキー",
  "clip.setText": "文字",
  "clip.setShape": "図形",
  "clip.addFx": "効果を追加",
  "clip.removeFx": "効果を削除",
  "clip.updateFx": "効果を調整",
  "clip.reorderFx": "効果の順序",
  "clip.setTransition": "トランジション",
  "clip.removeTransition": "トランジション削除",
  "key.add": "キーフレーム追加",
  "key.remove": "キーフレーム削除",
  "key.update": "キーフレーム変更",
  "key.moveAll": "キーフレーム移動",
  "track.add": "トラック追加",
  "track.remove": "トラック削除",
  "track.update": "トラック変更",
  "track.reorder": "トラック並べ替え",
  "asset.add": "素材追加",
  "asset.remove": "素材削除",
  "asset.update": "素材更新",
  "marker.add": "マーカー追加",
  "marker.remove": "マーカー削除",
  "marker.update": "マーカー変更",
  "chapter.add": "チャプター追加",
  "chapter.remove": "チャプター削除",
  "chapter.update": "チャプター変更",
  "settings.update": "設定変更",
  "project.rename": "名前の変更",
  "subtitle.import": "字幕の取り込み",
  "timeline.paste": "貼り付け",
  "timeline.insert": "差し込み",
  "timeline.overwrite": "上書き",
  "timeline.magneticClose": "隙間を詰める",
  "compound.make": "複合クリップ化",
  "compound.enter": "複合クリップを開く",
  "compound.flatten": "複合クリップを解除"
});

/**
 * op を 1 つ適用する（store.dispatch の中身）。
 * @param {Object} draft project の clone（**直に書き換わる**）
 * @param {string} type §3 の op 名
 * @param {Object} [payload]
 * @param {Object} [ctx] `{ fps, playhead, view, selection, now }`
 * @returns {*} op ごとの返り値（§12-3）
 * @throws {OpError} 知らない type / 不正な payload
 */
export function applyOp(draft, type, payload, ctx) {
  const t = str(type);
  if (!t) throw new OpError("op の type が空です");
  if (!Object.prototype.hasOwnProperty.call(OPS, t)) {
    throw new OpError(`知らない op です: ${t}`, { type: t });
  }
  return OPS[t](draft, payload, ctx);
}

/**
 * 表示名（無い op は type をそのまま返す）。
 * @param {string} type @returns {string}
 */
export function opLabel(type) {
  const t = str(type);
  return Object.prototype.hasOwnProperty.call(OP_LABELS, t) ? OP_LABELS[t] : t;
}
