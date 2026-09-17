/* ══════════════════════════════════════════════════════════════════════
   core/store.js — 状態の一箇所（project・取消履歴・選択・表示状態）

   ★ 何をする所か
     契約書 §3 の `createStore(project) -> Store`。編集中の project を 1 つ持ち、
     **全ての編集を core/ops.js の op 経由**で当て、取消履歴（スナップショット
     方式・上限 120）・選択・表示状態をまとめて面倒見る。DOM も async も触らない。

   ★ なぜこの形か
     ・**clone は 1 dispatch につき 1 回だけ**。project を複製 → op に書き換えさせ
       → 成功したら「元の object をそのまま履歴へ積む」（履歴用にもう 1 枚複製
       するとドラッグ中に数 MB の複製が毎フレーム 2 回走って落ちる）。ゆえに
       **store.project を外から書き換えてはいけない**（§3 の注記どおり。凍結は
       しない = app.js が updatedAt を触る）。op が throw したら複製を捨てるだけ
       なので、元の状態は無傷（巻き戻し処理が要らない）。
     ・履歴の 1 件は「その op の **直前**の {project, selection}」。今の状態は
       present として別に持ち、undo は present と履歴 1 枚の入れ替えで済ませる。
     ・asset.analysis は数千点の配列。120 枚分複製すると iPhone の上限に当たるので
       **参照で共有**する（差し替えのみ・in-place で書き換えない約束つき。嫌なら
       createStore(p, { shareAnalysis:false })）。
     ・subscribe は同期通知。通知中に来た変更は **キューに入れて後で流す**（UI は
       「描画中に選択を直す」を平気でやる。再入させると履歴が入れ子になって取消
       が壊れる）。後回しになった呼びは undefined を返す。
     ・ops.js はまだ無いことがある（担当が別）。静的 import だと 1 つ欠けただけで
       store ごと落ちるので **動的 import を await せずに**始める。

   ★ 触るときの注意
     ・project / selection / view を直に書き換えない。selection と view は
       **凍結済み**（間違いがその場で TypeError になる）。
     ・op の中から dispatch しない（op は draft を書き換える純関数）。
     ・batch は取引。中の op が 1 つでも throw したら **丸ごと巻き戻る**。
     ・合体（coalesce）は「同 type・同じ相手・120ms 以内」。追加/削除/分割の
       ように 1 回で意味が完結する op は合体しない。
   ══════════════════════════════════════════════════════════════════════ */

import { deepClone, finite, clamp, clampInt } from "./util.js";
import { warn, error } from "./log.js";
import { MIN_CLIP, normalizeProject } from "./schema.js";

/* ── 0. 定数（契約書 §3）───────────────────────────────────────── */

export const HISTORY_LIMIT = 120;          // 取消履歴の上限
export const COALESCE_MS = 120;           // 同種の連続操作を 1 単位に合体させる時間
/** view.tool に入れて良い値（契約書 §7.4 の V/A/T + 補助） */
export const TOOLS = Object.freeze(["select", "ripple", "razor", "hand", "slip", "roll", "zoom"]);

/* 合体しない op。「1 回で意味が完結する（= 押した回数だけ取り消したい）」物を
   type の最後の語で弾くので、まだ無い op にも効く。
   CONTRACT-NOTE: 指示の文面は「clip.split や clip.add は合体しない」。clip.remove
   を合体させると「3 つ消した」が取消 1 回で戻ってしまい同じ理屈で困るので、
   動詞で括る形にした（指示の上位互換）。 */
const NO_COALESCE_VERBS = new Set(("add remove split duplicate paste insert overwrite group ungroup " +
  "detachAudio link unlink make enter flatten rippleDelete import reorder reorderFx addFx removeFx " +
  "freeze reverse magneticClose replace").split(" "));
/** 動詞では括れない例外（type 丸ごとで弾く） */
export const NO_COALESCE_TYPES = new Set(["clip.split", "clip.add", "subtitle.import"]);

/* 履歴に出す日本語の見出し。"<type> <日本語>" を | で並べただけ（行数を食わない
   ように圧縮してある。無い type は type 名をそのまま出す）。 */
const LABELS = Object.freeze(Object.fromEntries(
  ("asset.add 素材を追加|asset.remove 素材を削除|asset.update 素材を更新|track.add トラックを追加|track.remove トラックを削除|" +
   "track.update トラックを変更|track.reorder トラックを並べ替え|clip.add クリップを追加|clip.remove クリップを削除|clip.update クリップを変更|" +
   "clip.move クリップを移動|clip.trim トリム|clip.split 分割|clip.duplicate 複製|clip.rippleDelete 詰めて削除|clip.slip スリップ|" +
   "clip.roll ロール|clip.reorder 並べ替え|clip.group グループ化|clip.ungroup グループ解除|clip.detachAudio 音声を分離|" +
   "clip.link 映像と音声を結合|clip.setSpeed 速度を変更|clip.setSpeedRamp 速度ランプ|clip.freeze フリーズ|clip.reverse 逆再生|" +
   "clip.setTransform 変形|clip.setColor カラー|clip.setMask マスク|clip.setChroma クロマキー|clip.setText テキスト|" +
   "clip.setShape 図形|clip.addFx 効果を追加|clip.removeFx 効果を削除|clip.updateFx 効果を調整|clip.reorderFx 効果を並べ替え|" +
   "clip.setTransition トランジション|clip.removeTransition トランジションを削除|key.add キーフレームを追加|key.remove キーフレームを削除|" +
   "key.update キーフレームを変更|key.moveAll キーフレームを移動|marker.add マーカーを追加|marker.remove マーカーを削除|" +
   "marker.update マーカーを変更|chapter.add チャプターを追加|chapter.remove チャプターを削除|settings.update 設定を変更|" +
   "subtitle.import 字幕を読み込み|project.rename 名前を変更|timeline.paste 貼り付け|timeline.insert 挿入|" +
   "timeline.overwrite 上書き|timeline.magneticClose 隙間を詰める|compound.make まとめる|compound.enter 中に入る|" +
   "compound.flatten ばらす|project.replace 差し替え|batch まとめて編集"
  ).split("|").map((e) => [e.slice(0, e.indexOf(" ")), e.slice(e.indexOf(" ") + 1)])
));
/* 表示名の持ち主は **ops.js の opLabel（OP_LABELS）**。読めていればそちらを正とし、
   ops.js が知らない見出し（"batch" 等）だけ上の表で補う（表が 2 つ在ると食い違う）。
   @param {string} type @returns {string} */
export function opLabel(type) {
  const t = typeof type === "string" ? type : "";
  if (opsLabelFn) { const s = opsLabelFn(t); if (s && s !== t) return s; }
  return Object.prototype.hasOwnProperty.call(LABELS, t) ? LABELS[t] : (t || "編集");
}
/** store 自身の落ち方（op の失敗は ops.js の OpError がそのまま飛ぶ） */
export class StoreError extends Error {
  /** @param {string} message @param {string} [code] @param {Object} [detail] */
  constructor(message, code, detail) {
    super(message);
    this.name = "StoreError";
    this.code = code || "store";
    this.detail = detail || null;
  }
}

/* ── 1. op の台帳（ops.js が在れば束ねる）──────────────────────── */

/**
 * 使える op の表。ops.js が読めたら中身をここへ流し込む。試験や拡張から直に
 * 足せる（`OPS["x.y"] = (draft, payload, ctx) => ...`）。
 * @type {Record<string, (draft:Object, payload:Object, ctx:Object)=>any>}
 */
export const OPS = Object.create(null);
let opsPromise = null, opsLabelFn = null;
/** ops.js の読み込み（1 回だけ・失敗しても解決する）。@returns {Promise<Object>} */
export function opsReady() {
  if (!opsPromise) {
    opsPromise = import("./ops.js").then((mod) => {
      const table = mod && (mod.OPS || mod.default);
      if (mod && typeof mod.opLabel === "function") opsLabelFn = mod.opLabel;
      if (table && typeof table === "object") registerOps(table);
      else warn("store", "ops.js に OPS が無い（op は登録されない）");
      return OPS;
    }, (e) => {
      warn("store", "ops.js を読めない（op は登録されない）", e && e.message ? e.message : e);
      return OPS;
    });
  }
  return opsPromise;
}
/** op を足す（同名は上書き）。@param {Object} table @returns {number} 足した数 */
export function registerOps(table) {
  let n = 0;
  for (const k of Object.keys(table || {})) {
    if (typeof table[k] === "function") { OPS[k] = table[k]; n++; }
    else warn("store", `op "${k}" が関数ではない`);
  }
  return n;
}

opsReady();   // 読み込みだけ先に始める（await しない = 循環 import でも固まらない）

/* ── 2. 小道具 ─────────────────────────────────────────────────── */

const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const arrOf = (v) => (Array.isArray(v) ? v : []);
const byT = (a, b) => finite(a && a.t, 0) - finite(b && b.t, 0);
/** view の数値の範囲（clamp に Infinity を渡すと util 側で 1 に落ちるので有限で） */
const VIEW_LIM = { playhead: [0, 1e9], zoom: [0.001, 4000], scrollX: [0, 1e9] };
const VIEW_KEYS = new Set(["playhead", "zoom", "scrollX", "inPoint", "outPoint", "tool", "followPlayhead"]);
/** 選択を凍結して返す（外から書き換えたら その場で TypeError になる） */
function freezeSelection(clipIds, trackId, keyframe) {
  return Object.freeze({
    clipIds: Object.freeze(clipIds.slice()),
    trackId: trackId == null ? null : String(trackId),
    keyframe: keyframe ? Object.freeze({ clipId: String(keyframe.clipId),
      path: String(keyframe.path), index: clampInt(keyframe.index, 0, 1e9) }) : null
  });
}
function sameSelection(a, b) {
  if (a === b) return true;
  if (a.trackId !== b.trackId || a.clipIds.length !== b.clipIds.length) return false;
  for (let i = 0; i < a.clipIds.length; i++) if (a.clipIds[i] !== b.clipIds[i]) return false;
  const x = a.keyframe, y = b.keyframe;
  if (!x || !y) return !x && !y;
  return x.clipId === y.clipId && x.path === y.path && x.index === y.index;
}
/** clip の id → clip（compound の中も深さ 2 まで見る） */
function clipMapOf(project, into, depth) {
  const map = into || new Map();
  for (const tr of arrOf(project && project.tracks)) {
    for (const c of arrOf(tr && tr.clips)) {
      if (!c || typeof c !== "object") continue;
      map.set(String(c.id), c);
      if (depth < 2 && c.kind === "compound" && c.compound) clipMapOf(c.compound, map, depth + 1);
    }
  }
  return map;
}
function trackIdsOf(project) {
  const s = new Set();
  for (const tr of arrOf(project && project.tracks)) if (tr && tr.id != null) s.add(String(tr.id));
  return s;
}

/**
 * project を複製する。shareAnalysis のとき asset.analysis は **参照のまま**引き
 * 継ぐ（数千点の配列を履歴 120 枚分複製しないため）。structuredClone が在れば
 * それを使う（util.deepClone が中で選ぶ）。
 */
function cloneProject(project, shareAnalysis) {
  if (!shareAnalysis) return deepClone(project);
  const assets = arrOf(project && project.assets);
  const held = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (!a || typeof a !== "object" || !a.analysis || typeof a.analysis !== "object") continue;
    held.push([i, a.analysis]);
    a.analysis = null;                // 複製の対象から外す（finally で必ず戻す）
  }
  let out;
  try {
    out = deepClone(project);
  } finally {
    for (const [i, an] of held) {
      assets[i].analysis = an;
      const copy = out && arrOf(out.assets)[i];
      if (copy) copy.analysis = an;   // 複製側も同じ物を指す（読むだけの約束）
    }
  }
  return out;
}

/* ── 3. 軽い整合（dispatch の度に走る。重い normalize は使わない）───────
   契約書 §1 の不変条件のうち「engine が毎フレーム頼る所」だけを直す。並びが既に
   正しければ何も書かないので、普通の dispatch は O(クリップ数) の読みで終わる。 */

/** keys の配列を t 昇順・重複なしに（既にそうなら触らない） */
function tidyKeys(list) {
  let ok = true;
  for (let i = 0; i < list.length && ok; i++) {
    const k = list[i];
    if (!k || typeof k !== "object" || !Number.isFinite(Number(k.t))) ok = false;
    else if (i > 0 && Number(list[i - 1].t) >= Number(k.t)) ok = false;
  }
  if (ok) return;
  const clean = [];
  for (const k of list) {
    if (!k || typeof k !== "object") continue;
    const t = typeof k.t === "number" ? k.t : Number(k.t);
    if (!Number.isFinite(t)) continue;  // 読めない t は捨てる（schema.normalize と同じ）
    k.t = t < 0 ? 0 : t;
    clean.push(k);
  }
  clean.sort((a, b) => a.t - b.t);
  const out = [];
  for (const k of clean) {            // 同じ t は後の勝ち
    if (out.length && Math.abs(out[out.length - 1].t - k.t) < 1e-6) out[out.length - 1] = k;
    else out.push(k);
  }
  list.length = 0;
  for (const k of out) list.push(k);
}
/** 遷移の尺を「隣と重ねられる長さ」に収める（契約書 §1-3） */
function fitTransition(clip, field, neighbour) {
  const tr = clip[field];
  if (tr === null || tr === undefined) return;
  if (typeof tr !== "object") { clip[field] = null; return; }
  const d = finite(tr.duration, 0);
  if (d <= 0) { tr.duration = 0; return; }
  let max = clip.duration;
  if (neighbour) {
    const gap = field === "transitionIn"
      ? clip.start - (neighbour.start + neighbour.duration)
      : neighbour.start - (clip.start + clip.duration);
    if (gap <= 1e-6) max = Math.min(max, neighbour.duration);
  }
  tr.duration = d > max ? max : d;
}
function tidyClips(clips, depth) {
  for (let i = clips.length - 1; i >= 0; i--) if (!clips[i] || typeof clips[i] !== "object") clips.splice(i, 1);
  for (const c of clips) {
    c.start = Math.max(0, finite(c.start, 0));
    c.duration = Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP));
  }
  let sorted = true;
  for (let i = 1; i < clips.length; i++) if (clips[i - 1].start > clips[i].start + 1e-9) { sorted = false; break; }
  if (!sorted) {                      // 同じ start は元の順を保つ（安定並べ替え）
    const at = new Map(clips.map((c, i) => [c, i]));
    clips.sort((a, b) => (a.start - b.start) || (at.get(a) - at.get(b)));
  }
  /* 重なりは「前を縮める」— schema.normalizeProject と同じ規則にしておく（store と
     normalize で結果が違うと、保存して開き直した瞬間に絵が変わる）。MIN_CLIP まで
     縮めても足りない分は残す（消すのは op の仕事）。 */
  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1], cur = clips[i];
    if (prev.start + prev.duration > cur.start + 1e-6) prev.duration = Math.max(MIN_CLIP, cur.start - prev.start);
  }
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    fitTransition(c, "transitionIn", clips[i - 1] || null);
    fitTransition(c, "transitionOut", clips[i + 1] || null);
    const keys = c.keys;
    if (keys && typeof keys === "object") {
      for (const path of Object.keys(keys)) {
        const list = keys[path];
        if (!Array.isArray(list)) { delete keys[path]; continue; }
        tidyKeys(list);
        if (list.length === 0) delete keys[path];
      }
    }
    if (depth < 2 && c.kind === "compound" && c.compound) {
      for (const tr of arrOf(c.compound.tracks)) {
        if (!tr || typeof tr !== "object") continue;
        if (!Array.isArray(tr.clips)) tr.clips = [];
        tidyClips(tr.clips, depth + 1);
      }
    }
  }
}
function tidyProject(draft, at) {
  if (!draft || typeof draft !== "object") return;
  if (!Array.isArray(draft.tracks)) draft.tracks = [];
  for (const tr of draft.tracks) {    // tidyClips が深さ 2 までの compound も見る
    if (!tr || typeof tr !== "object") continue;
    if (!Array.isArray(tr.clips)) tr.clips = [];
    tidyClips(tr.clips, 0);
  }
  if (Array.isArray(draft.markers)) draft.markers.sort(byT);
  if (Array.isArray(draft.chapters)) draft.chapters.sort(byT);
  draft.updatedAt = at;
}

/* ── 4. 本体 ───────────────────────────────────────────────────── */

/**
 * 編集状態の入れ物を作る（契約書 §3）。
 * @param {Object} [project] 初期の project（normalize して取り込む）
 * @param {Object} [opts] { ops, now, historyLimit, coalesceMs, normalize, shareAnalysis }
 * @returns {Object} Store
 */
export function createStore(project, opts) {
  const o = plain(opts);
  const nowFn = typeof o.now === "function" ? o.now : Date.now;
  const fixedOps = o.ops && typeof o.ops === "object" ? o.ops : null;
  const limit = clampInt(o.historyLimit === undefined ? HISTORY_LIMIT : o.historyLimit, 1, 100000);
  const coalesceMs = Math.max(0, finite(o.coalesceMs, COALESCE_MS));
  const shareAnalysis = o.shareAnalysis !== false;
  const doNormalize = o.normalize !== false;
  /** 今の状態。project は「書き換えない値」として扱う */
  let present = { project: intake(project), selection: freezeSelection([], null, null) };
  let view = Object.freeze({
    /* zoom は「1 秒 = 何 px」。1 だと 1 画面に 20 分入ってしまい、
       目盛りが分刻みになって編集できない（実測で確認）。
       80px/秒 を既定にする（ui/timeline/view.js の ZOOM_DEFAULT と同じ）。 */
    playhead: 0, zoom: 80, scrollX: 0, inPoint: null, outPoint: null,
    tool: "select", followPlayhead: true
  });
  /** 履歴（entry.snapshot = その op の直前の状態）・通知待ちの列・購読者 */
  const undoStack = [], redoStack = [], queued = [], subs = new Set();
  let notifying = 0, draining = false, dirtyFlag = false, disposed = false;
  let batchDepth = 0, batchState = null;

  function intake(p) {
    if (!doNormalize) return deepClone(p) || {};
    try { return normalizeProject(p); }
    catch (e) {
      warn("store", "normalizeProject が失敗したので複製だけで取り込む", e && e.message);
      return deepClone(p) || {};
    }
  }

  /* ── 通知（同期）と再入防止のキュー ─────────────────────────── */

  function emit(events) {
    if (events.length && subs.size) {
      notifying++;
      try {
        /* 1 つの購読者の事故で編集全体を止めない（error は常に出る） */
        for (const ev of events) for (const fn of Array.from(subs)) {
          try { fn(ev); } catch (e) { error("store", "subscribe の中で例外", e); }
        }
      } finally { notifying--; }
    }
    if (notifying === 0) drain();      // 通知の中で溜まった変更をここで流す
  }
  function drain() {
    if (draining || queued.length === 0) return;
    draining = true;
    try {
      for (let n = 0; queued.length; n++) {
        if (n > 2000) {               // 互いに呼び合う購読者を止める最後の砦
          error("store", `通知の中の変更が止まらない（残り ${queued.length} 件を捨てる）`);
          queued.length = 0;
          break;
        }
        const job = queued.shift();
        try { job(); } catch (e) { error("store", "通知後に流した変更が失敗", e); }
      }
    } finally { draining = false; }
  }
  /** 破棄済みなら黙って止め、通知中なら後回しにする入口（後回しは undefined） */
  function guard(name, fn) {
    return function (...args) {
      if (disposed) { warn("store", `破棄済みの store に ${name} が来た（無視する）`); return undefined; }
      if (notifying === 0) return fn.apply(null, args);
      queued.push(() => {
        try { fn.apply(null, args); } catch (e) { error("store", `後回しにした ${name} が失敗`, e); }
      });
      return undefined;
    };
  }

  /* ── 履歴 ───────────────────────────────────────────────────── */

  function coalescable(type) {
    if (NO_COALESCE_TYPES.has(type)) return false;
    const i = type.lastIndexOf(".");
    return !NO_COALESCE_VERBS.has(i >= 0 ? type.slice(i + 1) : type);
  }

  /* 同じ相手への連続だけ合体させる（A を動かして 100ms 後に B を動かしたのを
     1 単位にすると B だけ取り消せなくなる） */
  function coalesceKey(payload) {
    const p = plain(payload), parts = [];
    for (const k of ["clipId", "trackId", "assetId", "fxId", "markerId", "chapterId", "path", "id"]) {
      if (p[k] !== undefined && p[k] !== null) parts.push(k + ":" + String(p[k]));
    }
    if (Array.isArray(p.clipIds)) parts.push("clipIds:" + p.clipIds.join(","));
    return parts.join("|");
  }
  function pushHistory(entry) {
    redoStack.length = 0;
    const top = undoStack[undoStack.length - 1];
    if (top && entry.canCoalesce && top.canCoalesce && top.type === entry.type &&
        top.key === entry.key && entry.at - top.at <= coalesceMs) {
      top.at = entry.at;              // 直前の 1 件に吸収（= 取消 1 回で両方戻る）
      return;
    }
    undoStack.push(entry);
    while (undoStack.length > limit) undoStack.shift();
  }
  function step(from, to, op) {
    const entry = from.pop();
    if (!entry) return false;
    const selBefore = present.selection;
    to.push({
      type: entry.type, at: entry.at, label: entry.label, key: entry.key, canCoalesce: false,
      snapshot: { project: present.project, selection: selBefore }
    });
    present = { project: entry.snapshot.project, selection: entry.snapshot.selection };
    dirtyFlag = true;
    const events = [{ kind: "project", op, detail: { label: entry.label, type: entry.type } }];
    if (present.selection !== selBefore) {
      events.push({ kind: "selection", op, detail: { selection: present.selection } });
    }
    emit(events);
    return true;
  }

  /* ── 選択 ───────────────────────────────────────────────────── */

  /** 選択が勝手に変わったときの通知（消えた clip を外した等） */
  const autoSelEvent = (sel) => ({ kind: "selection", op: "auto", detail: { reason: "removed", selection: sel } });

  /** 消えた clip / track / keyframe を選択から落とす（同じなら同じ参照） */
  function cleanSelection(p, sel) {
    if (!sel.clipIds.length && !sel.trackId && !sel.keyframe) return sel;
    const map = clipMapOf(p, null, 0);
    const ids = sel.clipIds.filter((id) => map.has(id));
    let trackId = sel.trackId;
    if (trackId && !trackIdsOf(p).has(trackId)) trackId = null;
    let kf = sel.keyframe;
    if (kf) {
      const c = map.get(kf.clipId);
      const list = c && c.keys && typeof c.keys === "object" ? c.keys[kf.path] : null;
      if (!Array.isArray(list) || kf.index >= list.length) kf = null;
    }
    if (ids.length === sel.clipIds.length && trackId === sel.trackId && kf === sel.keyframe) return sel;
    return freezeSelection(ids, trackId, kf);
  }
  function applySelect(clipIds, sOpts) {
    const so = plain(sOpts);
    const list = clipIds == null ? [] : (Array.isArray(clipIds) ? clipIds : [clipIds]);
    const known = clipMapOf(present.project, null, 0);
    const wanted = [];
    for (const raw of list) {
      const id = String(raw == null ? "" : raw);
      if (!id || wanted.indexOf(id) >= 0) continue;
      if (known.has(id)) wanted.push(id);
      else warn("store", `選べない clip id "${id}"（project に無い）`);
    }
    const cur = present.selection;
    let ids = so.toggle || so.additive ? cur.clipIds.slice() : wanted;
    if (so.toggle) {
      for (const id of wanted) { const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); else ids.push(id); }
    } else if (so.additive) {
      for (const id of wanted) if (ids.indexOf(id) < 0) ids.push(id);
    }
    let trackId = cur.trackId;
    if ("trackId" in so) {
      const t = so.trackId == null ? null : String(so.trackId);
      trackId = t && trackIdsOf(present.project).has(t) ? t : null;
    }
    /* 選択から外れた clip のキーフレーム選択は指す先が無い */
    const kf = cur.keyframe && ids.indexOf(cur.keyframe.clipId) < 0 ? null : cur.keyframe;
    const next = freezeSelection(ids, trackId, kf);
    if (sameSelection(cur, next)) return cur;
    present = { project: present.project, selection: next };
    emit([{ kind: "selection", op: "select", detail: { selection: next } }]);
    return next;
  }
  function applySelectKeyframe(ref) {
    const cur = present.selection;
    let kf = null;
    if (ref != null) {
      const r = plain(ref);
      const clipId = String(r.clipId == null ? "" : r.clipId);
      const path = String(r.path == null ? "" : r.path);
      if (!clipId || !path) { warn("store", "selectKeyframe に clipId / path が無い"); return cur; }
      if (!clipMapOf(present.project, null, 0).has(clipId)) { warn("store", `clip "${clipId}" が無い`); return cur; }
      kf = { clipId, path, index: clampInt(r.index, 0, 1e9) };
    }
    const next = freezeSelection(cur.clipIds, cur.trackId, kf);
    if (sameSelection(cur, next)) return cur;
    present = { project: present.project, selection: next };
    emit([{ kind: "selection", op: "selectKeyframe", detail: { selection: next } }]);
    return next;
  }

  /* ── 表示状態（履歴に積まない）───────────────────────────────── */

  function applyView(partial) {
    const p = plain(partial);
    const next = Object.assign({}, view);
    const changed = {};
    let any = false;
    const put = (k, v) => { if (next[k] !== v) { next[k] = v; changed[k] = v; any = true; } };
    for (const k of ["playhead", "zoom", "scrollX"]) {
      if (k in p) put(k, clamp(finite(p[k], view[k]), VIEW_LIM[k][0], VIEW_LIM[k][1]));
    }
    for (const k of ["inPoint", "outPoint"]) {
      if (k in p) put(k, p[k] == null ? null : Math.max(0, finite(p[k], 0)));
    }
    if ("followPlayhead" in p) put("followPlayhead", !!p.followPlayhead);
    if ("tool" in p) {
      const t = String(p.tool == null ? "" : p.tool);
      if (TOOLS.indexOf(t) >= 0) put("tool", t);
      else warn("store", `知らない道具 "${t}" は無視した`);
    }
    for (const k of Object.keys(p)) if (!VIEW_KEYS.has(k)) warn("store", `view に "${k}" は無い`);
    /* イン・アウトが逆さに来たら入れ替える（ドラッグで普通に起きる） */
    if (next.inPoint !== null && next.outPoint !== null && next.inPoint > next.outPoint) {
      const a = next.inPoint;
      next.inPoint = next.outPoint; next.outPoint = a;
      changed.inPoint = next.inPoint; changed.outPoint = next.outPoint; any = true;
    }
    if (!any) return view;
    view = Object.freeze(next);
    emit([{ kind: "view", op: "setView", detail: changed }]);
    return view;
  }

  /* ── dispatch / batch ───────────────────────────────────────── */

  function makeCtx(type) {
    const st = present.project && present.project.settings;
    return {
      type, selection: present.selection, view, playhead: view.playhead,
      fps: clamp(finite(st && st.fps, 30), 1, 240), now: nowFn(), batch: batchDepth > 0
    };
  }
  function lookup(type) {
    const t = typeof type === "string" ? type : "";
    const op = t ? (fixedOps || OPS)[t] : null;
    if (typeof op !== "function") throw new StoreError(`知らない操作です: "${t}"`, "unknown-op", { type: t });
    return op;
  }
  function applyDispatch(type, payload, dOpts) {
    const op = lookup(type);
    const load = payload === undefined || payload === null ? {} : payload;
    if (batchDepth > 0) return applyInBatch(type, op, load);
    const base = present.project;
    const draft = cloneProject(base, shareAnalysis);
    const at = nowFn();
    /* op が throw したら draft を捨てるだけ。base は一度も触っていないので
       「元に戻す」処理は要らない（だから速い）。 */
    const result = op(draft, load, makeCtx(type));
    tidyProject(draft, at);
    const selBefore = present.selection;
    const nextSel = cleanSelection(draft, selBefore);
    const od = plain(dOpts);
    pushHistory({
      type, at, key: coalesceKey(load),
      label: typeof od.label === "string" && od.label ? od.label : opLabel(type),
      canCoalesce: od.coalesce === undefined ? coalescable(type) : !!od.coalesce,
      snapshot: { project: base, selection: selBefore }
    });
    present = { project: draft, selection: nextSel };
    dirtyFlag = true;
    const events = [{ kind: "project", op: type, detail: { label: opLabel(type), payload: load, result } }];
    if (nextSel !== selBefore) events.push(autoSelEvent(nextSel));
    emit(events);
    return result;
  }

  /* batch の中は 1 枚の draft を直に書き換える。op が throw したらその batch は
     丸ごと巻き戻す（取引と同じ扱い。fn が catch しても同じ）。 */
  function applyInBatch(type, op, load) {
    const st = batchState;
    try {
      const result = op(present.project, load, makeCtx(type));
      tidyProject(present.project, st.at);
      st.types.push(type);
      st.changed = true;
      const sel = cleanSelection(present.project, present.selection);
      if (sel !== present.selection) present = { project: present.project, selection: sel };
      return result;
    } catch (e) {
      if (!st.aborted) st.aborted = e;
      throw e;
    }
  }
  function runBatch(label, fn) {
    if (typeof fn !== "function") throw new StoreError("batch(label, fn) の fn が関数ではない", "bad-arg");
    if (batchDepth > 0) {               // 入れ子も 1 単位（深さを数えるだけ）
      batchDepth++;
      try { return fn(localDispatch); } finally { batchDepth--; }
    }
    const base = present.project, selBase = present.selection;
    const draft = cloneProject(base, shareAnalysis);
    const st = { at: nowFn(), types: [], changed: false, aborted: null };
    batchState = st;
    batchDepth = 1;
    present = { project: draft, selection: selBase };   // 途中でも store.project は読める
    let out, done = false;
    try {
      out = fn(localDispatch);
      done = true;
    } finally {                         // fn が throw / 中の op が失敗 → 丸ごと捨てる
      batchDepth = 0;
      batchState = null;
      if (!done || st.aborted || !st.changed) present = { project: base, selection: selBase };
    }
    if (st.aborted) throw st.aborted;   // fn が握りつぶしても巻き戻す
    if (!st.changed) return out;        // 何も当てなかったら履歴も通知も作らない
    const nextSel = cleanSelection(draft, selBase);
    const name = typeof label === "string" && label ? label : opLabel("batch");
    pushHistory({
      type: st.types.length === 1 ? st.types[0] : "batch",
      at: st.at, label: name, key: "", canCoalesce: false,
      snapshot: { project: base, selection: selBase }
    });
    present = { project: draft, selection: nextSel };
    dirtyFlag = true;
    const events = [{ kind: "project", op: "batch", detail: { label: name, types: st.types.slice() } }];
    if (nextSel !== selBase) events.push(autoSelEvent(nextSel));
    emit(events);
    return out;
  }
  /** batch の fn へ渡す dispatch（batch を抜けた後に呼ばれても動く） */
  function localDispatch(type, payload, dOpts) {
    if (disposed) { warn("store", "破棄済みの store に batch の dispatch が来た"); return undefined; }
    return applyDispatch(type, payload, dOpts);
  }
  function applyReplace(next, label) {
    const base = present.project, selBase = present.selection;
    const p = intake(next);
    pushHistory({
      type: "project.replace", at: nowFn(), key: "", canCoalesce: false,
      label: typeof label === "string" && label ? label : opLabel("project.replace"),
      snapshot: { project: base, selection: selBase }
    });
    const sel = cleanSelection(p, selBase);
    present = { project: p, selection: sel };
    dirtyFlag = true;
    const events = [{ kind: "project", op: "replace", detail: { label } }];
    if (sel !== selBase) events.push(autoSelEvent(sel));
    emit(events);
    return p;
  }

  /* ── 外向きの形（契約書 §3）─────────────────────────────────── */

  return {
    get project() { return present.project; },       // **直接書き換えない**（履歴が壊れる）
    get selection() { return present.selection; },   // { clipIds, trackId, keyframe }（凍結済み）
    get view() { return view; },                     // §3 の表示状態（凍結済み）
    get dirty() { return dirtyFlag; },               // markClean() から変わったか（自動保存用）
    get disposed() { return disposed; },
    markClean() { dirtyFlag = false; return false; },
    /** 変更の通知を受ける（同期）。fn({kind,op,detail}) / 返り値で解除 */
    subscribe(fn) {
      if (typeof fn !== "function") throw new StoreError("subscribe(fn) の fn が関数ではない", "bad-arg");
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    /** dispatch(type, payload, {label?,coalesce?}) → op の返り値。失敗時は無変化で throw */
    dispatch: guard("dispatch", applyDispatch),
    /** batch(label, (d) => ...) で 1 取消単位。入れ子も 1 単位。throw で全部巻き戻す */
    batch: guard("batch", runBatch),
    undo: guard("undo", () => step(undoStack, redoStack, "undo")),
    redo: guard("redo", () => step(redoStack, undoStack, "redo")),
    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },
    /** 古い順の [{label, at, type}]（取消できる分だけ） */
    history() { return undoStack.map((e) => ({ label: e.label, at: e.at, type: e.type })); },
    /** select(ids|id|null, {additive,toggle,trackId}) — project に無い id は落ちる */
    select: guard("select", applySelect),
    /** selectKeyframe({clipId,path,index} | null) */
    selectKeyframe: guard("selectKeyframe", applySelectKeyframe),
    /** 表示状態を更新（履歴には積まない・通知は kind:"view"） */
    setView: guard("setView", applyView),
    /** project を丸ごと差し替える（1 取消単位）。読み込み直後は markClean() を */
    replace: guard("replace", applyReplace),
    /** project の深い複製（保存・書き出しへ渡す用） */
    snapshot() { return deepClone(present.project); },
    /** JSON.stringify(store) でも保存形式が出るように */
    toJSON() { return deepClone(present.project); },
    /** 履歴だけ捨てる（プロジェクトを開き直した直後などに） */
    clearHistory() { undoStack.length = 0; redoStack.length = 0; return true; },
    /** 使い終わり。購読と履歴を手放す（以後の変更は警告して何もしない） */
    dispose() {
      disposed = true;
      subs.clear();
      queued.length = 0;
      undoStack.length = redoStack.length = 0;
      batchDepth = 0;
      batchState = null;
      return true;
    }
  };
}
