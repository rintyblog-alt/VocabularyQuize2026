/* ══════════════════════════════════════════════════════════════════════
   core/eval.js — 評価器（契約書 §2）。この repo でいちばん熱い純関数。

   ★ 何をする所か
     「project と 時刻 t」から「その瞬間に何がどう見え・どう鳴るか」を出す
     **唯一の場所**。compositor / playback / audio / export が毎フレーム
     ここを呼ぶ。だから ここが間違うと 4 つ同時に間違い、ここが遅いと
     4 つ同時に重くなる。逆に ここが正しければ プレビューと書き出しは
     必ず一致する（別実装を持たせない、が この設計の眼目）。

   ★ なぜこの形か
     ・**時刻の量子化はここ 1 か所**。呼び出し側は音の時計（AudioContext）
       から来た端数だらけの秒を渡してよい。ここで「t を含むフレームの頭」へ
       floor して評価する（`frameStart(frameIndex(t))`）。round ではなく
       floor なのは、書き出しの i/fps と 再生の端数秒で **同じ絵**を出すため。
       t が既にフレーム境界なら恒等変換。`{ snap:false }` で切れる。
     ・速度は区分線形 v(l) の積分で扱う（契約書 §2）。累積和 + 二分探索。
       ops.js の §B（rateSegs / integ / invInteg）と **同じ規則**に揃えてある。
       食い違うと「分割したら絵が飛ぶ」という直しにくい不具合になる。
     ・素材の端を越えたら **張り付かせる**（throw しない）。毎フレーム呼ばれる
       所で例外を投げても再生が止まるだけで何も得が無い（util.js と同じ思想）。
     ・例外を投げるのは 引数が根本的に違うとき だけ（ここでは 1 つも投げない。
       読めない物は null / 既定値へ落とす）。

   ★ Resolved の持ち方（**どちらにしたかの明言。契約書の要求**）
     **既定は「毎回 新しい独立した Resolved を作る」**。
     `resolveClip()` / `clipsAt()` / `audioAt()` を素で呼ぶと、返った物は
     いつまで持っていても壊れない（後の呼び出しで書き換わらない）。
     毎フレームの合成で 割り当てを 0 にしたい人は `createResolvePool()` を
     作って `{ pool }` で渡す。**pool を渡したときだけ**、
       ・返る配列は pool の使い回し
       ・Resolved は clip.id ごとの record の使い回し（= 値だけ毎回上書き）
     になる。pool の record は **同じ clip.id にしか使い回さない**ので、
     持ち続けても「別のクリップの姿に化ける」ことは無い（時刻だけが進む）。
     pool を持つのは 使い回して良い所（compositor / playback の 1 フレーム）
     だけにすること。**書き出しは自分の pool を持つ**（プレビューと共有すると
     await の間に時刻を書き換えられる。契約書 §12-1 の「書き出し中もプレビュー
     を触れる」を守るため）。素の呼び出しは安全側なので、迷ったら pool 無し。
     持ち出したい 1 つだけを固めたいときは `detachResolved(r)`。

   ★ 触るときの注意
     ・transform.x/y は **画面の幅・高さに対する割合・中心が原点**（0 = 中央、
       +0.5 = 右端/下端）。px へ直すのは compositor の仕事（契約書 §4）。
     ・transform.rotate は **ラジアン**で返す（保存形式は度）。度が欲しい所は
       `rotateDeg` を見る。scale は scaleX/scaleY に **織り込み済み**で、
       返り値の `scale` は必ず 1（二重掛けを防ぐための互換の詰め物）。
     ・track.locked は **絵にも音にも効かない**（下の CONTRACT-NOTE）。
     ・速度ランプの cache は ramp 配列の **参照**で古さを見る。配列の中身だけを
       書き換える人は `resetEvalCaches()` を呼ぶこと（ops.js は必ず配列ごと
       差し替えるので、通常は要らない）。

   CONTRACT-NOTE (1): 担当指示は clipsAt で「hidden/locked/muted と solo を
     考慮」。このうち **locked は考慮した上で、描画も音も落とさない**ことにした。
     locked は「編集できない」の印で「見えない/聞こえない」ではない（Premiere も
     CapCut も同じ）。仕上げたトラックを固めるのが locked の使い道なので、
     ここで落とすと「固めたら消えた」になる。触り所の判定は ui/timeline が
     `track.locked` を直接見れば足りる（Resolved からも `track` で辿れる）。
   CONTRACT-NOTE (2): 契約書は `resolveClip(clip, timelineTime, { fps })`。
     Resolved には `transition` が在るが、遷移は **同じトラックの隣**を見ないと
     出せない。そこで opts に `track`（と `trackIndex` / `asset` / `pool`）を
     足した。渡さなければ transition は null（他は全部出る）。
   CONTRACT-NOTE (3): clip.color が null でも `color.*` のキーフレームが在れば
     既定の ColorGrade から組んで返す（null のままにしない）。ops.js の key.add
     は color が null のままでもキーを打てるので、null 固定にするとキーが黙って
     効かなくなる。`color.*` のキーも無ければ **null のまま**（契約どおり）。
   ══════════════════════════════════════════════════════════════════════ */

import {
  finite, clamp, clamp01, lerp, hexLerp, easeFor, bisectRight
} from "./util.js";
import { DEFAULT_FPS, frameIndex, frameStart } from "./time.js";
import { MIN_CLIP, defaultColorGrade, getPath } from "./schema.js";

/* ══ §A 小道具と定数 ═══════════════════════════════════════════════ */

/** 時刻の比較に使う遊び（1µs。1/1000 フレームより ずっと小さい） */
const T_EPS = 1e-6;
/** キーフレームの t の同一視（ops.js の KEY_EPS と同じ） */
const K_EPS = 1e-6;
/** 隣のクリップと「くっついている」と見る隙間（1ms。1 フレームの隙間は隙間） */
const GAP_EPS = 1e-3;
const DEG2RAD = Math.PI / 180;

/** in/out（素材側の秒）が意味を持つ kind（schema.js の HAS_SRC と同じ） */
const HAS_SRC = Object.freeze({ video: true, audio: true, compound: true });
/** 絵を持たない kind（音だけ） */
const AUDIO_ONLY = Object.freeze({ audio: true });

const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);
/** 効果が無いクリップが共有する空配列（毎フレーム [] を作らないため。凍結済み） */
const EMPTY_FX = Object.freeze([]);

const arr = (v) => (Array.isArray(v) ? v : EMPTY_ARR);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : EMPTY);
const str = (v) => (typeof v === "string" ? v : (v === undefined || v === null ? "" : String(v)));
const fpsOf = (v) => { const f = finite(v, DEFAULT_FPS); return f > 0 ? f : DEFAULT_FPS; };
const durOf = (clip) => Math.max(0, finite(clip && clip.duration, 0));
const hasSrc = (clip) => !!HAS_SRC[str(clip && clip.kind)];

/** ColorGrade の数値キー / ホイール名は既定値から引く（schema が増えても追従する） */
const CG0 = defaultColorGrade();
const COLOR_NUM = Object.freeze(Object.keys(CG0).filter((k) => typeof CG0[k] === "number"));
const WHEELS = Object.freeze(Object.keys(plain(CG0.wheels)));

/** 時刻を「その t を含むフレームの頭」へ寄せる（§A の理由） */
function quantize(t, fps, snap) {
  const n = finite(t, 0);
  if (snap === false) return n;
  return frameStart(frameIndex(n, fps), fps);
}

/* ══ §B 速度ランプ（∫v dl）══════════════════════════════════════════
   v(l) は clip ローカル秒 l の区分線形。ramp が無ければ定数 speed。
   ramp の外側（l<0 / 最後の点より後ろ）は端の値で一定に伸ばす。
   これは ops.js §B と同じ規則（合わせないと分割で絵が飛ぶ）。 */

/** ramp を区間の列にする。最後の区間は t1=Infinity */
function rateSegs(clip) {
  const sp = clamp(Math.abs(finite(clip && clip.speed, 1)) || 1, 0.02, 100);
  const raw = arr(clip && clip.speedRamp)
    .map((k) => ({
      t: Math.max(0, finite(k && k.t, 0)),
      v: clamp(Math.abs(finite(k && k.v, 1)) || 1, 0.02, 100)
    }))
    .sort((a, b) => a.t - b.t);
  const pts = [];
  for (const q of raw) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.t - q.t) <= T_EPS) pts[pts.length - 1] = q;
    else pts.push(q);
  }
  if (!pts.length) return [{ t0: 0, t1: Infinity, v0: sp, v1: sp }];
  const segs = [];
  if (pts[0].t > T_EPS) segs.push({ t0: 0, t1: pts[0].t, v0: pts[0].v, v1: pts[0].v });
  for (let i = 1; i < pts.length; i++) {
    segs.push({ t0: pts[i - 1].t, t1: pts[i].t, v0: pts[i - 1].v, v1: pts[i].v });
  }
  const last = pts[pts.length - 1];
  segs.push({ t0: last.t, t1: Infinity, v0: last.v, v1: last.v });
  return segs;
}

/** 区間内の倍率 */
function segRate(g, t) {
  if (!Number.isFinite(g.t1) || g.t1 - g.t0 <= T_EPS) return g.v0;
  return lerp(g.v0, g.v1, clamp01((t - g.t0) / (g.t1 - g.t0)));
}
/** 区間の t0 から x までの ∫v dl（台形 = 2 次式。x は区間内） */
function segArea(g, x) {
  const dx = x - g.t0;
  if (dx <= 0) return 0;
  if (!Number.isFinite(g.t1) || g.t1 - g.t0 <= T_EPS) return g.v0 * dx;
  const a = (g.v1 - g.v0) / (g.t1 - g.t0);
  return g.v0 * dx + (a * dx * dx) / 2;
}
const segT0 = (g) => g.t0;

/** ramp が同じなら作り直さない（毎フレーム呼ばれるので効く） */
const mapCache = new WeakMap();

/**
 * 速度の地図を作る（契約書 §2）。
 *   at(localTime)      … ∫₀^l v dl = **その時点までに使った素材の秒数**
 *                        （l<0 は先頭の倍率で外挿して負の値を返す）
 *   inverse(sourceAmt) … at の逆関数。`at()` が返した「使った量」を渡す
 *                        （素材の絶対時刻ではない。絶対時刻からは localTimeAt）
 *   localTimeAt(srcSec)… 素材の絶対秒 → ローカル秒（in/out と reverse を織り込む）
 *   rateAt(localTime)  … その時刻の倍率
 *   totalSource        … タイムライン尺の全体で使う素材の秒数（= at(duration)）
 *   cache              … { segs, cum, speed, ramp, duration }（覗いて良い・触らない）
 * @param {Object} clip
 * @returns {{totalSource:number, at:(l:number)=>number, inverse:(s:number)=>number,
 *            localTimeAt:(s:number)=>number, rateAt:(l:number)=>number, cache:Object}}
 */
export function buildSpeedMap(clip) {
  const c = plain(clip);
  const speed = finite(c.speed, 1);
  const ramp = Array.isArray(c.speedRamp) ? c.speedRamp : null;
  const dur = durOf(c);
  const hit = clip && typeof clip === "object" ? mapCache.get(clip) : null;
  if (hit && hit.cache.speed === speed && hit.cache.ramp === ramp && hit.cache.duration === dur) {
    return hit;
  }
  const segs = rateSegs(c);
  const cum = new Array(segs.length);
  cum[0] = 0;
  for (let i = 1; i < segs.length; i++) cum[i] = cum[i - 1] + segArea(segs[i - 1], segs[i - 1].t1);

  const at = (l) => {
    const x = finite(l, 0);
    if (x <= 0) return x * segs[0].v0;            // 先頭より手前は一定で外挿
    let i = bisectRight(segs, x, segT0) - 1;
    if (i < 0) i = 0;
    return cum[i] + segArea(segs[i], x);
  };
  const inverse = (s) => {
    const want = finite(s, 0);
    if (want <= 0) return want / segs[0].v0;
    let i = bisectRight(cum, want, null) - 1;     // cum は昇順の数値配列
    if (i < 0) i = 0;
    if (i > segs.length - 1) i = segs.length - 1;
    const g = segs[i];
    const rem = want - cum[i];
    const dt = g.t1 - g.t0;
    if (!Number.isFinite(dt) || dt <= T_EPS) return g.t0 + rem / g.v0;
    const a = (g.v1 - g.v0) / dt;
    let x;
    if (Math.abs(a) < 1e-9) x = rem / g.v0;
    else x = (Math.sqrt(Math.max(0, g.v0 * g.v0 + 2 * a * rem)) - g.v0) / a;
    return g.t0 + clamp(x, 0, dt);
  };
  const rateAt = (l) => {
    const x = finite(l, 0);
    if (x <= 0) return segs[0].v0;
    let i = bisectRight(segs, x, segT0) - 1;
    if (i < 0) i = 0;
    return segRate(segs[i], x);
  };
  const localTimeAt = (srcSec) => {
    const i0 = Math.max(0, finite(c.in, 0));
    const o0 = Math.max(i0, finite(c.out, i0));
    const s = clamp(finite(srcSec, 0), Math.min(i0, o0), Math.max(i0, o0));
    return inverse(c.reverse ? o0 - s : s - i0);
  };
  const map = {
    totalSource: at(dur),
    at, inverse, localTimeAt, rateAt,
    cache: { segs, cum, speed, ramp, duration: dur }
  };
  if (clip && typeof clip === "object") mapCache.set(clip, map);
  return map;
}

/** 速度地図の cache を捨てる（試験と「ramp を直に書き換えた」人のため） */
export function resetEvalCaches() {
  assetCache = new WeakMap();
}

/**
 * clip ローカル秒 → 素材側の秒（契約書 §2）。
 * reverse は out から in へ向かって進む。**素材の端は越えず張り付く**
 * （throw しない）。in/out が意味を持たない kind は 0。
 * @param {Object} clip @param {number} localTime @returns {number}
 */
export function sourceTimeAt(clip, localTime) {
  if (!hasSrc(clip)) return 0;
  const i0 = Math.max(0, finite(clip.in, 0));
  const o0 = Math.max(i0, finite(clip.out, i0));
  const used = buildSpeedMap(clip).at(localTime);
  return clip.reverse ? clamp(o0 - used, i0, o0) : clamp(i0 + used, i0, o0);
}

/**
 * クリップがタイムライン上で生きている範囲（秒）。
 * hidden / muted は見ない（**時間の範囲だけ**）。遷移は clip の中に収まるので
 * ここには足さない（契約書 §1-3 / schema.js fitTransition）。
 * @param {Object} clip @returns {{start:number, end:number}}
 */
export function visibleRange(clip) {
  const s = Math.max(0, finite(clip && clip.start, 0));
  return { start: s, end: s + durOf(clip) };
}

/* ══ §C キーフレームの標本化 ═══════════════════════════════════════ */

const keyT = (k) => finite(k && k.t, 0);

/** keys から path の列を引く（keys が配列なら それ自体を列として扱う） */
function keyList(keys, path) {
  if (Array.isArray(keys)) return keys.length ? keys : null;
  if (!keys || typeof keys !== "object") return null;
  const l = keys[path];
  return Array.isArray(l) && l.length ? l : null;
}

/** キー 1 本の値（読めなければ fallback） */
function keyValue(k, fallback) {
  const v = k ? k.v : undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") return v;
  return fallback;
}
/** 色として混ぜるための片側（数しか無いときは fallback の色 → 黒） */
function colorSide(v, fallback) {
  if (typeof v === "string") return v;
  return typeof fallback === "string" ? fallback : "#000000";
}

/**
 * キーフレーム列の localTime での値（契約書 §2）。
 * ・区間 [k(i), k(i+1)) の補間は **k(i).ease**（ops.js と同じ約束）。
 * ・`ease:"hold"` は段差（次のキーの直前まで値を保つ）。
 * ・値が "#hex" なら hexLerp で混ぜる。数と色が混ざったら色として扱う。
 * ・範囲の外は端の値を保つ。path が無い / 列が空なら **fallback**（= 静的値）。
 * @param {Object|Array} keys clip.keys（または キー列そのもの）
 * @param {string} path @param {number} localTime @param {number|string} fallback
 * @returns {number|string}
 */
export function sampleKey(keys, path, localTime, fallback) {
  const list = keyList(keys, path);
  if (!list) return fallback;
  const x = finite(localTime, 0);
  const n = list.length;
  if (x <= keyT(list[0]) + K_EPS) return keyValue(list[0], fallback);
  if (x >= keyT(list[n - 1]) - K_EPS) return keyValue(list[n - 1], fallback);
  let i = bisectRight(list, x, keyT) - 1;
  if (i < 0) i = 0;
  if (i > n - 2) i = n - 2;
  const a = list[i], b = list[i + 1];
  const t0 = keyT(a), t1 = keyT(b);
  const span = t1 - t0;
  const u = span > K_EPS
    ? clamp01(easeFor(str(a.ease) || "linear", a.bez)(clamp01((x - t0) / span)))
    : 0;
  if (typeof a.v === "string" || typeof b.v === "string") {
    return hexLerp(colorSide(a.v, fallback), colorSide(b.v, fallback), u);
  }
  const nf = typeof fallback === "number" ? fallback : 0;
  return lerp(finite(a.v, nf), finite(b.v, nf), u);
}

/** 数として引く（色が返ってきたら fallback） */
function kvNum(keys, path, local, fb) {
  if (!keys) return fb;
  const v = sampleKey(keys, path, local, fb);
  return typeof v === "number" ? (Number.isFinite(v) ? v : fb) : finite(v, fb);
}
/** 色として引く（数が返ってきたら fallback） */
function kvColor(keys, path, local, fb) {
  if (!keys) return fb;
  const v = sampleKey(keys, path, local, fb);
  return typeof v === "string" ? v : fb;
}

/**
 * clip の任意の path を localTime で引く（キー → 無ければ clip の静的値）。
 * 契約に無い追加。ui/inspector が「再生ヘッドでの今の値」を出すためのもの。
 * @param {Object} clip @param {string} path @param {number} localTime
 * @param {number|string} [fallback]
 * @returns {number|string|undefined}
 */
export function sampleClipPath(clip, path, localTime, fallback) {
  if (!clip || typeof clip !== "object") return fallback;
  const st = getPath(clip, path);
  const fb = (typeof st === "number" || typeof st === "string") ? st : fallback;
  return sampleKey(clip.keys, path, localTime, fb);
}

/* ══ §D 遷移（同一トラックの隣との重なり）═════════════════════════
   並んだクリップ A|B の境目に置く。長さ d の遷移は
     A の尾 [durA-d, durA] と B の頭 [0, d]
   の 2 つに分かれて住む（契約書 §1-3 が d ≤ 自分と相手の半分 と決めているのは
   入口と出口を同時に持てるようにするため = 遷移は自分の中に収まる）。
   p は **境目をまたいで 0 → 1 に単調**:
     A の尾で 0 → 0.5（role:"out"）、B の頭で 0.5 → 1（role:"in"）。
   相手が居ない（端 / 隙間の向こう）ときは 背景との遷移なので
   自分の中だけで 0 → 1（otherClipId は null）。 */

/** 遷移の器（宣言 1 つ）を読む */
function trDecl(t) {
  const o = plain(t);
  const d = Math.max(0, finite(o.duration, 0));
  if (!(d > T_EPS)) return null;
  return { type: str(o.type) || "crossfade", duration: d, params: plain(o.params) };
}

/** schema.js fitTransition と同じ上限（自分と相手の半分） */
function trLimit(self, other) {
  const ds = Math.max(MIN_CLIP, durOf(self));
  const dO = other ? Math.max(MIN_CLIP, durOf(other)) : ds;
  return Math.min(ds, dO) * 0.5;
}

/** 隣とくっついているか（隙間が 1ms 以内） */
function contiguous(left, right) {
  if (!left || !right) return false;
  const le = finite(left.start, 0) + durOf(left);
  return Math.abs(finite(right.start, 0) - le) <= GAP_EPS;
}

/**
 * 境目 1 つを決める。dir=+1 は「自分 = A, 相手 = 次」、dir=-1 は「相手 = A, 自分 = B」。
 * 両方が宣言していたら **長い方**を採る（同じ長さなら A 側 = out の宣言）。
 */
function boundaryOf(self, other, dir) {
  const joined = dir > 0 ? contiguous(self, other) : contiguous(other, self);
  const partner = joined ? other : null;
  const mine = trDecl(dir > 0 ? self.transitionOut : self.transitionIn);
  const theirs = partner ? trDecl(dir > 0 ? partner.transitionIn : partner.transitionOut) : null;
  // A 側（out を持つ方）の宣言を先に置く → 同じ長さなら A が勝つ
  const aSide = dir > 0 ? mine : theirs;
  const bSide = dir > 0 ? theirs : mine;
  let win = null;
  if (aSide && bSide) win = bSide.duration > aSide.duration + T_EPS ? bSide : aSide;
  else win = aSide || bSide;
  if (!win) return null;
  const d = Math.min(win.duration, trLimit(self, partner));
  if (!(d > T_EPS)) return null;
  return {
    d, type: win.type, params: win.params,
    otherId: partner ? str(partner.id) || null : null,
    paired: !!partner
  };
}

/**
 * その clip の localTime に遷移が掛かっているか（契約書 §2 の Resolved.transition）。
 * @param {Object|null} track 同じトラック（clips の並び順が要る）
 * @param {Object} clip @param {number} localTime
 * @returns {null|{role:"in"|"out", type:string, p:number, params:Object, otherClipId:string|null}}
 */
export function transitionAt(track, clip, localTime) {
  if (!clip || typeof clip !== "object") return null;
  const clips = arr(track && track.clips);
  let i = clips.indexOf(clip);
  if (i < 0 && clip.id) {
    const id = str(clip.id);
    for (let k = 0; k < clips.length; k++) if (clips[k] && str(clips[k].id) === id) { i = k; break; }
  }
  const dur = Math.max(MIN_CLIP, durOf(clip));
  const local = finite(localTime, 0);
  const next = i >= 0 ? clips[i + 1] || null : null;
  const prev = i >= 0 ? clips[i - 1] || null : null;

  // 出口（自分 = A）。尾の方を先に見る（尾と頭は重ならない = §1-3）
  const rb = boundaryOf(clip, next, 1);
  if (rb && local >= dur - rb.d - T_EPS) {
    const x = clamp01((local - (dur - rb.d)) / rb.d);
    return { role: "out", type: rb.type, p: rb.paired ? x * 0.5 : x, params: rb.params, otherClipId: rb.otherId };
  }
  // 入口（自分 = B）
  const lb = boundaryOf(clip, prev, -1);
  if (lb && local <= lb.d + T_EPS) {
    const x = clamp01(local / lb.d);
    return { role: "in", type: lb.type, p: lb.paired ? 0.5 + x * 0.5 : x, params: lb.params, otherClipId: lb.otherId };
  }
  return null;
}

/* ══ §E Resolved の器（pool / 新規のどちらでも同じ形）═══════════════ */

function newTransformRec() {
  return {
    x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateDeg: 0,
    anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false,
    crop: { l: 0, t: 0, r: 0, b: 0, w: 1, h: 1 }
  };
}
function newColorRec() {
  const o = {};
  for (const k of COLOR_NUM) o[k] = 0;
  o.wheels = {};
  for (const w of WHEELS) o.wheels[w] = [0, 0, 0];
  o.curves = null; o.hsl = EMPTY_ARR; o.lut = null;
  return o;
}
function newResolved() {
  return {
    clip: null, track: null, trackId: "", trackIndex: -1,
    kind: "video", assetId: null, asset: null,
    localTime: 0, sourceTime: 0, duration: 0,
    visible: false, opacity: 1, blend: "normal",
    transform: newTransformRec(), color: null, mask: null, chroma: null, fx: EMPTY_FX,
    volume: 1, pan: 0, trackVolume: 1, trackPan: 0,
    hasAudio: false, muted: false, external: 1,
    text: null, shape: null,
    speed: 1, reverse: false, transition: null,
    /* pool の使い回し用の控え（public な色/マスク等が null の間も器を捨てない） */
    _color: null, _mask: null, _chroma: null, _text: null, _fx: null
  };
}

/**
 * Resolved の使い回し置き場を作る（毎フレームの合成で割り当てを 0 にしたい人向け）。
 * `clipsAt(project, t, { pool })` のように渡す。**1 つの pool を 2 人で共有しない**
 * （書き出しとプレビューは別々に持つ。§A の「持ち方」を読むこと）。
 * @returns {{byId:Map<string,Object>, list:Object[], clear:()=>void}}
 */
export function createResolvePool() {
  const pool = {
    byId: new Map(), list: [],
    clear() { pool.byId.clear(); pool.list.length = 0; }
  };
  return pool;
}

/** pool から この clip 用の record を借りる（pool が無ければ新品） */
function recordFor(pool, clip) {
  if (!pool) return newResolved();
  const id = str(clip && clip.id) || "?";
  let r = pool.byId.get(id);
  if (!r) { r = newResolved(); pool.byId.set(id, r); }
  return r;
}
/** pool が持つ器（色・マスク等）を使い回す。pool 無しなら毎回新品 */
function scratch(r, key, make) {
  if (!r) return make();
  let v = r[key];
  if (!v) { v = make(); r[key] = v; }
  return v;
}

/**
 * Resolved を「持ち出して良い」独立した形に固める（pool 使用時の保険）。
 * 入れ子も作り直すので、後の呼び出しで書き換わらない。
 * @param {Object} r @returns {Object}
 */
export function detachResolved(r) {
  if (!r || typeof r !== "object") return r;
  const o = Object.assign({}, r);
  o._color = o._mask = o._chroma = o._text = o._fx = null;
  const t = r.transform;
  if (t) { o.transform = Object.assign({}, t); o.transform.crop = Object.assign({}, t.crop); }
  if (r.color) {
    o.color = Object.assign({}, r.color);
    o.color.wheels = {};
    for (const w of WHEELS) o.color.wheels[w] = arr(r.color.wheels && r.color.wheels[w]).slice();
  }
  if (r.mask) o.mask = Object.assign({}, r.mask);
  if (r.chroma) o.chroma = Object.assign({}, r.chroma);
  if (r.text) { o.text = Object.assign({}, r.text); o.text.style = Object.assign({}, r.text.style); }
  if (r.fx && r.fx.length) o.fx = r.fx.map((f) => Object.assign({}, f, { params: Object.assign({}, f.params) }));
  if (r.transition) o.transition = Object.assign({}, r.transition);
  return o;
}

/* ══ §F 枝ごとの解決 ═══════════════════════════════════════════════ */

const scaleOf = (v) => clamp(finite(v, 1), 0.001, 100);

function resolveTransform(out, clip, K, local) {
  const src = plain(clip.transform), cr = plain(src.crop);
  const sc = kvNum(K, "transform.scale", local, finite(src.scale, 1));
  const sx = kvNum(K, "transform.scaleX", local, finite(src.scaleX, 1));
  const sy = kvNum(K, "transform.scaleY", local, finite(src.scaleY, 1));
  out.x = kvNum(K, "transform.x", local, finite(src.x, 0));
  out.y = kvNum(K, "transform.y", local, finite(src.y, 0));
  out.scale = 1;                          // ← scaleX/scaleY に織り込み済み（二重掛け防止）
  out.scaleX = scaleOf(sc * sx);
  out.scaleY = scaleOf(sc * sy);
  out.rotateDeg = kvNum(K, "transform.rotate", local, finite(src.rotate, 0));
  out.rotate = out.rotateDeg * DEG2RAD;   // 合成は rad で行う（契約書 §2 の解決値）
  out.anchorX = finite(src.anchorX, 0.5);
  out.anchorY = finite(src.anchorY, 0.5);
  out.flipH = !!src.flipH;
  out.flipV = !!src.flipV;
  let l = clamp01(finite(cr.l, 0)), r = clamp01(finite(cr.r, 0));
  let t = clamp01(finite(cr.t, 0)), b = clamp01(finite(cr.b, 0));
  if (l + r > 0.98) { const k = 0.98 / (l + r); l *= k; r *= k; }
  if (t + b > 0.98) { const k = 0.98 / (t + b); t *= k; b *= k; }
  const c = out.crop;
  c.l = l; c.t = t; c.r = r; c.b = b; c.w = 1 - l - r; c.h = 1 - t - b;
  return out;
}

/** color.* のキーが 1 本でも在るか（clip.color が null のときだけ調べる） */
function hasColorKeys(K) {
  if (!K || typeof K !== "object" || Array.isArray(K)) return false;
  for (const p in K) if (p.charCodeAt(0) === 99 && p.indexOf("color.") === 0) return true;
  return false;
}

function resolveColor(r, clip, K, local) {
  let src = clip.color;
  if (!src || typeof src !== "object") {
    if (!hasColorKeys(K)) return null;    // 契約どおり null は null のまま
    src = CG0;                            // CONTRACT-NOTE (3)
  }
  const out = scratch(r, "_color", newColorRec);
  for (let i = 0; i < COLOR_NUM.length; i++) {
    const k = COLOR_NUM[i];
    out[k] = kvNum(K, "color." + k, local, finite(src[k], 0));
  }
  const sw = plain(src.wheels);
  for (let i = 0; i < WHEELS.length; i++) {
    const w = WHEELS[i], a = arr(sw[w]), d = out.wheels[w];
    for (let j = 0; j < 3; j++) d[j] = kvNum(K, "color.wheels." + w + "." + j, local, finite(a[j], 0));
  }
  // curves / hsl / lut はキーフレーム対象外 → 参照のまま渡す（書き換えないこと）
  out.curves = src.curves || null;
  out.hsl = Array.isArray(src.hsl) ? src.hsl : EMPTY_ARR;
  out.lut = src.lut || null;
  return out;
}

function resolveMask(r, clip, K, local) {
  const src = clip.mask;
  if (!src || typeof src !== "object") return null;
  const out = scratch(r, "_mask", () => ({}));
  out.type = str(src.type) || "rect";
  out.x = kvNum(K, "mask.x", local, finite(src.x, 0.5));
  out.y = kvNum(K, "mask.y", local, finite(src.y, 0.5));
  out.w = kvNum(K, "mask.w", local, finite(src.w, 0.5));
  out.h = kvNum(K, "mask.h", local, finite(src.h, 0.5));
  out.rotateDeg = kvNum(K, "mask.rotate", local, finite(src.rotate, 0));
  out.rotate = out.rotateDeg * DEG2RAD;
  out.feather = clamp01(kvNum(K, "mask.feather", local, finite(src.feather, 0)));
  out.expand = finite(src.expand, 0);
  out.invert = !!src.invert;
  out.points = arr(src.points);
  return out;
}

function resolveChroma(r, clip, K, local) {
  const src = clip.chroma;
  if (!src || typeof src !== "object" || src.enabled === false) return null;
  const out = scratch(r, "_chroma", () => ({}));
  out.key = arr(src.key);
  out.similarity = clamp01(kvNum(K, "chroma.similarity", local, finite(src.similarity, 0.4)));
  out.smoothness = clamp01(kvNum(K, "chroma.smoothness", local, finite(src.smoothness, 0.1)));
  out.spill = clamp01(kvNum(K, "chroma.spill", local, finite(src.spill, 0.2)));
  out.enabled = true;
  return out;
}

function resolveFx(r, clip, K, local) {
  const list = arr(clip.fx);
  if (!list.length) return EMPTY_FX;
  const out = scratch(r, "_fx", () => []);
  out.length = 0;
  for (const f of list) {
    if (!f || typeof f !== "object" || f.enabled === false) continue;
    const id = str(f.id);
    const sp = plain(f.params);
    const params = {};
    for (const k in sp) params[k] = K ? sampleKey(K, "fx." + id + "." + k, local, sp[k]) : sp[k];
    out.push({ id, type: str(f.type), enabled: true, params });
  }
  return out;
}

function resolveText(r, clip, K, local) {
  const src = clip.text;
  if (!src || typeof src !== "object") return null;
  const out = scratch(r, "_text", () => ({ style: {} }));
  const ss = plain(src.style), st = out.style;
  for (const k in ss) st[k] = ss[k];
  st.size = Math.max(1, kvNum(K, "text.style.size", local, finite(ss.size, 64)));
  st.color = kvColor(K, "text.style.color", local, str(ss.color) || "#ffffff");
  out.content = str(src.content);
  out.layout = src.layout || null;
  out.anim = src.anim || null;
  return out;
}

/* ══ §G resolveClip / clipsAt / audioAt ════════════════════════════ */

/** 素材の一覧を id → asset の Map に（project.assets の参照で cache） */
let assetCache = new WeakMap();
function assetMap(project) {
  const list = arr(project && project.assets);
  if (list === EMPTY_ARR) return null;
  const hit = assetCache.get(list);
  if (hit && hit.len === list.length) return hit.map;
  const map = new Map();
  for (const a of list) if (a && a.id) map.set(str(a.id), a);
  assetCache.set(list, { len: list.length, map });
  return map;
}

/** clip が音を持ち得るか（素材の hasAudio を見る） */
function clipHasAudio(clip, asset) {
  const k = str(clip && clip.kind);
  if (k === "audio") return true;
  if (k === "compound") return true;                 // 入れ子の中に音が在り得る
  if (k === "video") return !!asset && asset.hasAudio !== false;
  return false;
}

/**
 * 1 つの clip を timelineTime で解決する（契約書 §2）。
 * その時刻に **居なければ null**（= 見えない / 鳴らない）。
 * hidden なクリップは null ではなく `visible:false` で返す（判断は呼ぶ側に残す）。
 * @param {Object} clip
 * @param {number} timelineTime 秒
 * @param {{fps?:number, asset?:Object|null, track?:Object|null, trackIndex?:number,
 *          pool?:Object|null, snap?:boolean}} [opts]
 * @returns {Object|null} Resolved
 */
export function resolveClip(clip, timelineTime, opts) {
  if (!clip || typeof clip !== "object") return null;
  const o = opts || EMPTY;
  const fps = fpsOf(o.fps);
  const tt = quantize(timelineTime, fps, o.snap);
  const start = finite(clip.start, 0);
  const dur = durOf(clip);
  let local = tt - start;
  if (!(local > -T_EPS && local < dur - T_EPS)) return null;
  if (local < 0) local = 0;

  const track = o.track || null;
  const asset = o.asset || null;
  const K = (clip.keys && typeof clip.keys === "object" && !Array.isArray(clip.keys)) ? clip.keys : null;
  const r = recordFor(o.pool || null, clip);
  const pool = o.pool || null;
  const kind = str(clip.kind) || "video";
  const trackKind = str(track && track.kind);

  r.clip = clip;
  r.track = track;
  r.trackId = str(track && track.id);
  r.trackIndex = Number.isFinite(o.trackIndex) ? o.trackIndex : -1;
  r.kind = trackKind === "adjust" ? "adjust" : kind;   // 調整レイヤーは kind:"adjust" で混ぜる
  r.assetId = clip.assetId ? str(clip.assetId) : null;
  r.asset = asset;
  r.localTime = local;
  r.duration = dur;

  const map = buildSpeedMap(clip);
  r.speed = map.rateAt(local);
  r.reverse = !!clip.reverse;
  if (hasSrc(clip)) {
    const i0 = Math.max(0, finite(clip.in, 0));
    let o0 = Math.max(i0, finite(clip.out, i0));
    const lim = asset ? finite(asset.duration, 0) : 0;
    if (lim > 0) o0 = Math.min(o0, lim);            // 素材尺を越えたら端で張り付く
    const used = map.at(local);
    r.sourceTime = clip.reverse ? clamp(o0 - used, i0, o0) : clamp(i0 + used, i0, o0);
  } else {
    r.sourceTime = 0;
  }

  const hidden = !!clip.hidden || !!(track && track.hidden);
  r.opacity = clamp01(kvNum(K, "opacity", local, finite(clip.opacity, 1)));
  r.blend = str(clip.blend) || "normal";
  r.visible = !hidden && !AUDIO_ONLY[kind] && r.opacity > 1e-4;

  r.transform = resolveTransform(pool ? r.transform : newTransformRec(), clip, K, local);
  r.color = resolveColor(pool ? r : null, clip, K, local);
  r.mask = resolveMask(pool ? r : null, clip, K, local);
  r.chroma = resolveChroma(pool ? r : null, clip, K, local);
  r.fx = resolveFx(pool ? r : null, clip, K, local);
  r.text = resolveText(pool ? r : null, clip, K, local);
  r.shape = clip.shape || null;                     // キー対象外 → 参照のまま

  r.trackVolume = track ? clamp(finite(track.volume, 1), 0, 4) : 1;
  r.trackPan = track ? clamp(finite(track.pan, 0), -1, 1) : 0;
  const cv = clamp(kvNum(K, "volume", local, finite(clip.volume, 1)), 0, 4);
  const cp = clamp(kvNum(K, "pan", local, finite(clip.pan, 0)), -1, 1);
  r.volume = cv * r.trackVolume;                    // ← トラック音量込み（二重掛け禁止）
  r.pan = clamp(cp + r.trackPan, -1, 1);
  r.muted = !!clip.muteAudio || !!(track && track.muted);
  r.hasAudio = clipHasAudio(clip, asset);
  r.external = 1;                                   // ダッキング用の外部ゲインの置き場

  r.transition = track ? transitionAt(track, clip, local) : null;
  return r;
}

/** solo が 1 つでも立っているか（対象のトラックの中で） */
function anySolo(tracks, want) {
  for (const t of tracks) if (t && want(t) && t.solo) return true;
  return false;
}
const isVisualTrack = (t) => str(t.kind) !== "audio";
const canSoundTrack = (t) => str(t.kind) !== "adjust";

/** pool 有りなら pool の配列を空にして使い回す。無ければ新しい配列 */
function outList(pool) {
  if (!pool) return [];
  pool.list.length = 0;
  return pool.list;
}

/**
 * その時刻に描く物を **下から上**（tracks 配列順）に並べて返す（契約書 §2）。
 * ・track.hidden / clip.hidden は落とす。solo が立っていたら solo だけ。
 * ・audio トラックと 音だけの clip は絵を持たないので入らない。
 * ・adjust トラックの clip は `kind:"adjust"` として **同じ配列に混ぜて**返す
 *   （compositor はそこまでの合成結果に効果を掛ける）。
 * ・track.locked は落とさない（CONTRACT-NOTE (1)）。
 * @param {Object} project
 * @param {number} t 秒
 * @param {{fps?:number, pool?:Object|null, snap?:boolean}} [opts]
 * @returns {Object[]} Resolved[]
 */
export function clipsAt(project, t, opts) {
  const o = opts || EMPTY;
  const p = plain(project);
  const fps = fpsOf(o.fps !== undefined ? o.fps : plain(p.settings).fps);
  const tracks = arr(p.tracks);
  const amap = assetMap(p);
  const solo = anySolo(tracks, isVisualTrack);
  const out = outList(o.pool || null);
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (!track || typeof track !== "object") continue;
    if (!isVisualTrack(track) || track.hidden) continue;
    if (solo && !track.solo) continue;
    const clips = arr(track.clips);
    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci];
      if (!clip || clip.hidden || AUDIO_ONLY[str(clip.kind)]) continue;
      const asset = amap && clip.assetId ? amap.get(str(clip.assetId)) || null : null;
      const r = resolveClip(clip, t, {
        fps, asset, track, trackIndex: ti, pool: o.pool || null, snap: o.snap
      });
      if (r) out.push(r);
    }
  }
  return out;
}

/**
 * その時刻に鳴る物（契約書 §2）。track.volume / track.pan を織り込んで返す。
 * ・track.muted / clip.muteAudio は落とす。solo が立っていたら solo だけ。
 * ・hidden は **落とさない**（目を閉じただけで音を消さない。NLE の作法）。
 * ・最終的な増幅は `resolvedAudioGain(r, t)`（フェードと外部ゲイン込み）。
 * @param {Object} project @param {number} t 秒
 * @param {{fps?:number, pool?:Object|null, snap?:boolean}} [opts]
 * @returns {Object[]} Resolved[]
 */
export function audioAt(project, t, opts) {
  const o = opts || EMPTY;
  const p = plain(project);
  const fps = fpsOf(o.fps !== undefined ? o.fps : plain(p.settings).fps);
  const tracks = arr(p.tracks);
  const amap = assetMap(p);
  const solo = anySolo(tracks, canSoundTrack);
  const out = outList(o.pool || null);
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (!track || typeof track !== "object") continue;
    if (!canSoundTrack(track) || track.muted) continue;
    if (solo && !track.solo) continue;
    const clips = arr(track.clips);
    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci];
      if (!clip || clip.muteAudio) continue;
      const asset = amap && clip.assetId ? amap.get(str(clip.assetId)) || null : null;
      if (!clipHasAudio(clip, asset)) continue;
      const r = resolveClip(clip, t, {
        fps, asset, track, trackIndex: ti, pool: o.pool || null, snap: o.snap
      });
      if (r) out.push(r);
    }
  }
  return out;
}

/* ══ §H 音の増幅（フェード + キー + トラック + 外部）═══════════════ */

/** フェードの形。どれも f(0)=0, f(1)=1 の単調（契約書 §1 audioFade.curve） */
function fadeShape(curve, x) {
  const u = clamp01(x);
  if (curve === "exp") return u * u;        // ゆっくり立ち上がる
  if (curve === "log") return Math.sqrt(u); // 素早く立ち上がる
  return u;
}

/** audioFade の掛かり（in と out の両方を掛ける。食い合っても谷になるだけ） */
function fadeGain(clip, local, dur) {
  const af = plain(clip.audioFade);
  const fi = Math.max(0, finite(af.in, 0));
  const fo = Math.max(0, finite(af.out, 0));
  if (fi <= T_EPS && fo <= T_EPS) return 1;
  const curve = str(af.curve) || "linear";
  let g = 1;
  if (fi > T_EPS) g *= fadeShape(curve, local / fi);
  if (fo > T_EPS) g *= fadeShape(curve, (dur - local) / fo);
  return clamp01(g);
}

/**
 * Resolved の最終的な増幅（線形。0 = 無音）。
 * clip.volume（キーフレーム）× トラック音量 × フェード × 外部ゲイン。
 * @param {Object} resolved audioAt / resolveClip が返した物
 * @param {number|{time?:number, localTime?:number, external?:number, gain?:number, master?:number}} [t]
 *   数を渡せば **タイムライン秒**（その時刻で引き直す）。省くと resolved の時刻。
 *   `external`（= `gain`）はダッキング用の外部ゲイン。`resolved.external` でも渡せる。
 * @returns {number} 0..8
 */
export function resolvedAudioGain(resolved, t) {
  const r = resolved;
  if (!r || typeof r !== "object" || !r.clip) return 0;
  const clip = r.clip;
  let local = finite(r.localTime, 0);
  let external = finite(r.external, 1);
  let master = 1;
  if (typeof t === "number") {
    local = finite(t, 0) - finite(clip.start, 0);
  } else if (t && typeof t === "object") {
    if (typeof t.time === "number") local = finite(t.time, 0) - finite(clip.start, 0);
    else if (typeof t.localTime === "number") local = finite(t.localTime, 0);
    if (t.external !== undefined) external = finite(t.external, 1);
    else if (t.gain !== undefined) external = finite(t.gain, 1);
    if (t.master !== undefined) master = finite(t.master, 1);
  }
  if (r.muted || clip.muteAudio) return 0;
  const dur = Math.max(MIN_CLIP, durOf(clip));
  local = clamp(local, 0, dur);
  const K = (clip.keys && typeof clip.keys === "object" && !Array.isArray(clip.keys)) ? clip.keys : null;
  const cv = clamp(kvNum(K, "volume", local, finite(clip.volume, 1)), 0, 4);
  const tv = clamp(finite(r.trackVolume, 1), 0, 4);
  const g = cv * tv * fadeGain(clip, local, dur)
    * clamp(external, 0, 8) * clamp(master, 0, 8);
  return clamp(g, 0, 8);
}
