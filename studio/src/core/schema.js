/* ══════════════════════════════════════════════════════════════════════
   core/schema.js — 保存形式（Project）の「作る・整える・検める」

   ★ 何をする所か
     ・作る … newProject / newTrack / newClip / newAsset / default*() が
              契約書 §1 の **既定値ちょうど**の入れ物を返す。
              ops も store も ai も ui も「空の枝」を自前で書かない。
     ・整える … normalizeProject(p) が 欠けた枝を埋め・型を直し・§1 の不変条件を
              満たした **新しい** project を返す（入力は絶対に書き換えない）。
     ・検める … validateProject(p) は **直さずに** 誤りと注意を列挙するだけ。
     ・移す … migrate(p) が schema 1 / 2 を 3 へ持ち上げる。未知の未来版は throw。

   ★ なぜこの形か
     保存形式が唯一の真実（§1）なので、「既定値」と「不変条件」の解釈が 2 か所に
     在ると必ず食い違い、片方だけ直したときに黙って壊れる。だから
     **ここだけ**が既定値と不変条件を知っている。store は op の後に normalize を
     通し、UI は validate の結果を出すだけでよい。

   ★ 触るときの注意
     ・normalizeProject / validateProject は副作用なし。normalize は入力を読むだけで
       新しい object を組み立てて返す（store の undo はスナップショット方式なので、
       入力を汚すと履歴が壊れる）。
     ・normalize は **冪等**であること: normalize(normalize(p)) が deepEqual。
       直しを足したら tests/schema.test.mjs の冪等試験で必ず確かめる。
     ・normalize は **契約書に無い枝を落とす**（保存が太らないように組み立て直す）。
       Clip や Project に枝を足すときは ARCHITECTURE.md と このファイル を同時に直す。
     ・古い保存は **migrate() を先に**通す。normalize は v3 前提で、v1/v2 の古い枝
       （clip.keyframes 等）は知らないので捨ててしまう。
     ・フレーム丸めはここではしない（core/time.js の仕事。fps は settings が持つ）。
     ・色や効果の「値の範囲」は engine 側が決めるので、ここでは契約書に範囲が
       書かれている物（0..1 の割合など）だけを収める。有限数であることは必ず見る。
   ══════════════════════════════════════════════════════════════════════ */

import { uid, deepClone, clamp, finite } from "./util.js";

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** 保存形式の版。読み書きの両方でこれを見る */
export const SCHEMA_VERSION = 3;
/** クリップの最短尺（秒）。これ未満は切り上げる（§1-2） */
export const MIN_CLIP = 0.04;
/** トラックの上限。iOS の合成負荷と DOM の量が現実的に持つ線 */
export const MAX_TRACKS = 24;

/** 合成モード（§1 Clip.blend。engine/compositor.js が同じ順で持つ） */
export const BLEND_MODES = Object.freeze([
  "normal", "add", "screen", "multiply", "overlay",
  "softlight", "difference", "lighten", "darken"
]);

/** 比率 → 既定の出力寸法。h は符号化器が嫌がらないよう必ず偶数にしてある */
export const RATIOS = Object.freeze({
  "16:9":   Object.freeze({ w: 1920, h: 1080, label: "16:9 横" }),
  "9:16":   Object.freeze({ w: 1080, h: 1920, label: "9:16 縦" }),
  "1:1":    Object.freeze({ w: 1080, h: 1080, label: "1:1 正方" }),
  "4:5":    Object.freeze({ w: 1080, h: 1350, label: "4:5 SNS 縦" }),
  "4:3":    Object.freeze({ w: 1440, h: 1080, label: "4:3" }),
  "2.35:1": Object.freeze({ w: 1920, h:  816, label: "2.35:1 シネスコ" }),
  "custom": Object.freeze({ w: 1920, h: 1080, label: "自由" })
});

export const TRACK_KINDS = Object.freeze(["video", "audio", "overlay", "adjust"]);
export const CLIP_KINDS = Object.freeze(["video", "image", "audio", "text", "shape", "adjust", "compound"]);
export const EASES = Object.freeze(["linear", "in", "out", "inout", "hold", "bezier"]);
export const FADE_CURVES = Object.freeze(["linear", "exp", "log"]);
export const PREVIEW_QUALITIES = Object.freeze(["auto", "full", "half", "quarter"]);
export const MASK_TYPES = Object.freeze(["rect", "ellipse", "polygon", "linear", "radial"]);
export const SHAPE_TYPES = Object.freeze(["rect", "ellipse", "triangle", "arrow", "line", "star"]);
export const ASSET_KINDS = Object.freeze(["video", "image", "audio"]);

/** ColorGrade の数値キー（キーフレーム対象・正規化の対象） */
const COLOR_NUM = Object.freeze([
  "exposure", "contrast", "saturation", "temperature", "tint", "highlights",
  "shadows", "whites", "blacks", "vibrance", "hue", "sharpen", "denoise",
  "vignette", "grain", "fade"
]);
const WHEELS = Object.freeze(["lift", "gamma", "gain", "offset"]);
/** in/out（素材側の秒）が意味を持つ kind。image/text/shape/adjust は §1 のとおり無視 */
const HAS_SRC = Object.freeze({ video: true, audio: true, compound: true });
/** 素材（assetId）が必要な kind */
const NEEDS_ASSET = Object.freeze({ video: true, image: true, audio: true });
/** 素材が見つからないクリップを落とす先の色（§1-5 の「灰色」） */
const LOST_FILL = "#5a5a5a";
/** 入れ子（compound）の深さの上限（§1） */
const MAX_DEPTH = 2;
const EPS = 1e-6;

/* ── 1. 小道具（数と列挙の入口。壊れた値は throw せず既定へ落とす） ── */

const nowMs = () => Date.now();
/** 数として読めなければ NaN（既定へ落とすか捨てるかを呼び出し側が選べるように） */
const numOrNaN = (v) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : NaN; };
const int = (v, d) => { const n = numOrNaN(v); return Number.isFinite(n) ? Math.round(n) : d; };
const bool = (v, d) => (typeof v === "boolean" ? v : (v === undefined || v === null ? d : !!v));
const str = (v) => (typeof v === "string" ? v : (v === undefined || v === null ? "" : String(v)));
const arr = (v) => (Array.isArray(v) ? v : []);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const pick = (v, list, d) => { const s = str(v); return list.indexOf(s) >= 0 ? s : d; };
const hex = (v, d) => { const s = str(v).trim(); return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : d; };
/** 偶数の寸法へ（符号化器が奇数を嫌う）。壊れた値は既定へ */
const even = (v, d) => { const n = int(v, NaN); return Number.isFinite(n) && n >= 2 ? Math.max(2, Math.round(n / 2) * 2) : d; };
/** 0 以上の有限数 */
const pos = (v, d) => Math.max(0, finite(v, d));

/* ── 2. 既定値（default*）────────────────────────────────────────
   どれも **新しい object** を返す。共有すると 1 つのクリップを直した途端に
   他のクリップまで変わってしまう（この罠は何度も踏んだ）。 */

/** @returns {Object} §1 Clip.transform の既定 */
export function defaultTransform() {
  return {
    x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
    anchorX: 0.5, anchorY: 0.5, flipH: false, flipV: false,
    crop: { l: 0, t: 0, r: 0, b: 0 }
  };
}

/** @returns {Object} §1 ColorGrade の既定（全部 0 = 何もしない） */
export function defaultColorGrade() {
  const g = {};
  for (const k of COLOR_NUM) g[k] = 0;
  g.curves = { rgb: [[0, 0], [1, 1]], r: null, g: null, b: null, luma: null };
  g.wheels = { lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], offset: [0, 0, 0] };
  g.hsl = [{ hue: 0, range: 30, h: 0, s: 0, l: 0 }];
  g.lut = null;
  return g;
}

/** @returns {Object} §1 TextStyle の既定 */
export function defaultTextStyle() {
  return {
    font: "system", size: 64, weight: 700, italic: false,
    color: "#ffffff", gradient: null,
    stroke: { width: 0, color: "#000" },
    shadow: { x: 0, y: 4, blur: 8, color: "#0008" },
    glow: { blur: 0, color: "#fff" },
    bg: null, ruby: null
  };
}

/** @returns {Object} §1 TextSpec の既定 */
export function defaultTextSpec() {
  return {
    content: "テキスト",
    style: defaultTextStyle(),
    layout: { align: "center", vAlign: "middle", maxWidth: 0.8, lineHeight: 1.25, letterSpacing: 0 },
    anim: {
      in: { type: "fadeUp", duration: 0.4 },
      out: { type: "fade", duration: 0.3 },
      loop: { type: "none", speed: 1 },
      unit: "all"
    }
  };
}

/** @returns {Object} §1 ShapeSpec の既定 */
export function defaultShape() {
  return { type: "rect", fill: "#fff", stroke: { width: 0, color: "#000" }, radius: 0, w: 0.3, h: 0.2 };
}

/** @returns {Object} §1 Clip.mask の既定（契約に既定が書かれていないので中央の矩形） */
export function defaultMask() {
  return { type: "rect", x: 0.5, y: 0.5, w: 0.5, h: 0.5, rotate: 0, points: [], feather: 0, invert: false, expand: 0 };
}

/** @returns {Object} §1 Clip.chroma の既定（緑を抜く） */
export function defaultChroma() {
  return { key: [0, 1, 0], similarity: 0.4, smoothness: 0.1, spill: 0.2, enabled: true };
}

/** @returns {Object} §1 Project.settings の既定 */
export function defaultSettings() {
  return {
    width: RATIOS["16:9"].w, height: RATIOS["16:9"].h, fps: 30, ratio: "16:9",
    sampleRate: 48000,
    background: { type: "color", color: "#000000", assetId: null, blur: 40 },
    snap: true, magnet: true, showSafeArea: false,
    previewQuality: "auto",
    audio: { master: 1, limiter: true }
  };
}

/** トラックの既定の名前（番号は ops/track.add が付け直す） */
function defaultTrackName(kind) {
  return kind === "audio" ? "A1" : kind === "overlay" ? "OL1" : kind === "adjust" ? "ADJ1" : "V1";
}

/* ── 3. 作る（factories）────────────────────────────────────────
   partial は **深く**重ねる（配列は差し替え）。newClip("text", {text:{content:"あ"}})
   で style や anim が消えないようにするため。 */

/** partial を既定へ深く重ねる。配列と null は差し替え扱い */
function mergeDeep(base, over) {
  if (over === undefined) return base;
  if (over === null || typeof over !== "object" || Array.isArray(over)) return over;
  if (base === null || typeof base !== "object" || Array.isArray(base)) return deepClone(over);
  const out = base;
  for (const k of Object.keys(over)) out[k] = mergeDeep(out[k], over[k]);
  return out;
}

/**
 * 素材（Asset）を作る。
 * @param {Object} [partial]
 * @returns {Object} Asset
 */
export function newAsset(partial) {
  const p = plain(partial);
  const kind = pick(p.kind, ASSET_KINDS, guessAssetKind(p.mime));
  const base = {
    id: uid("as"), kind, name: "", mime: "", size: 0,
    duration: 0, width: 0, height: 0, fps: 0,
    hasAudio: kind === "audio", rotation: 0,
    storage: { kind: "idb", key: null },
    createdAt: nowMs(),
    analysis: null
  };
  const a = mergeDeep(base, p);
  a.kind = kind;
  // image の尺は 0（§1: Infinity ではない。尺は clip 側が決める）
  if (a.kind === "image") a.duration = 0;
  return a;
}

/** mime から素材の種類を当てる（kind が来ていないとき用） */
function guessAssetKind(mime) {
  const m = str(mime).toLowerCase();
  if (m.indexOf("image/") === 0) return "image";
  if (m.indexOf("audio/") === 0) return "audio";
  return "video";
}

/**
 * トラックを作る。
 * @param {"video"|"audio"|"overlay"|"adjust"} kind
 * @param {Object} [partial]
 * @returns {Object} Track
 */
export function newTrack(kind, partial) {
  const k = pick(kind, TRACK_KINDS, "video");
  const base = {
    id: uid("tr"), kind: k, name: defaultTrackName(k), height: 72,
    muted: false, locked: false, hidden: false, solo: false,
    volume: 1, pan: 0, fx: [], clips: []
  };
  const t = mergeDeep(base, plain(partial));
  t.kind = k;
  return t;
}

/**
 * クリップを作る。kind に応じて text / shape / compound の枝を用意する。
 * duration だけ渡されたとき（out 未指定）は out を in + duration*speed に合わせる。
 * 素材側の尺とタイムライン尺が最初からずれていると、engine が最後のフレームで
 * 止まる／音が切れるという分かりにくい不具合になるため。
 * @param {"video"|"image"|"audio"|"text"|"shape"|"adjust"|"compound"} kind
 * @param {Object} [partial]
 * @returns {Object} Clip
 */
export function newClip(kind, partial) {
  const k = pick(kind, CLIP_KINDS, "video");
  const p = plain(partial);
  const base = {
    id: uid("cl"), name: "", assetId: null, kind: k,
    start: 0, duration: 4,
    in: 0, out: 4,
    speed: 1, reverse: false, speedRamp: null,
    volume: 1, muteAudio: false,
    audioFade: { in: 0, out: 0, curve: "linear" },
    opacity: 1, blend: "normal",
    transform: defaultTransform(),
    mask: null, chroma: null, color: null, fx: [],
    transitionIn: null, transitionOut: null,
    text: k === "text" ? defaultTextSpec() : null,
    shape: k === "shape" ? defaultShape() : null,
    compound: k === "compound" ? { tracks: [] } : null,
    keys: {},
    stabilize: null,
    label: "#4f8cff", groupId: null,
    locked: false, hidden: false, linkedId: null, source: null
  };
  const c = mergeDeep(base, p);
  c.kind = k;
  if (HAS_SRC[k] && p.out === undefined) {
    const d = Math.max(MIN_CLIP, finite(c.duration, 4));
    const sp = Math.max(0.02, Math.abs(finite(c.speed, 1)) || 1);
    c.out = finite(c.in, 0) + d * sp;
  }
  return c;
}

/** @param {Object} [partial] @returns {Object} Marker */
export function newMarker(partial) {
  return mergeDeep({ id: uid("mk"), t: 0, name: "", color: "#ffcc00", note: "" }, plain(partial));
}

/** @param {Object} [partial] @returns {Object} Chapter */
export function newChapter(partial) {
  return mergeDeep({ id: uid("ch"), t: 0, title: "" }, plain(partial));
}

/**
 * プロジェクトを作る。**必ず妥当な（normalize 済みの）project を返す**ので、
 * 呼び出し側は そのまま store へ入れてよい。
 * @param {Object} [partial]
 * @returns {Object} Project
 */
export function newProject(partial) {
  const p = plain(partial);
  const t = nowMs();
  const base = {
    schema: SCHEMA_VERSION,
    id: uid("prj"), name: "無題のプロジェクト",
    createdAt: t, updatedAt: t,
    settings: defaultSettings(),
    assets: [], tracks: [], markers: [], chapters: [],
    subtitleStyle: defaultTextStyle(),
    meta: { aiHistory: [] }
  };
  return normalizeProject(mergeDeep(base, p));
}

/* ── 4. キーフレームの path（§2）──────────────────────────────── */

/** キーを打てる property path の一覧（fx.<fxId>.<paramKey> だけは可変なので別扱い） */
export const KEYABLE_PATHS = Object.freeze([
  "opacity", "volume", "pan",
  "transform.x", "transform.y", "transform.scale", "transform.scaleX", "transform.scaleY", "transform.rotate",
  ...COLOR_NUM.map((k) => "color." + k),
  ...WHEELS.flatMap((w) => [0, 1, 2].map((i) => `color.wheels.${w}.${i}`)),
  "mask.x", "mask.y", "mask.w", "mask.h", "mask.rotate", "mask.feather",
  "chroma.similarity", "chroma.smoothness", "chroma.spill",
  "text.style.size", "text.style.color"
]);
const KEYABLE_SET = new Set(KEYABLE_PATHS);
/** fx の param は fx の id が動くので形で見る（fx.<fxId>.<paramKey>） */
const FX_PATH_RE = /^fx\.[^.]+\.[^.]+$/;

/**
 * その path にキーフレームを打てるか（§2 の一覧 + fx.<fxId>.<paramKey>）。
 * @param {string} path @returns {boolean}
 */
export function isKeyablePath(path) {
  if (typeof path !== "string" || !path) return false;
  return KEYABLE_SET.has(path) || FX_PATH_RE.test(path);
}

/* ── 5. path で読む / 書く ───────────────────────────────────────
   通さなければならない三形（§2）:
     "transform.scale"        … 素直な入れ子
     "fx.fx_1.amount"         … 配列を id で引き、続きは params の中
     "color.wheels.lift.0"    … 配列の添字
   fx だけ特別なのは、保存形式が FxInstance の配列（順番 = 適用順）で、
   キーは順番ではなく id で指したいから。 */

const isFxInstance = (o) => !!o && typeof o === "object" && !Array.isArray(o) && !!o.params && typeof o.params === "object";
const isIndex = (s) => /^\d+$/.test(s);
const splitPath = (p) => (typeof p === "string" && p.length ? p.split(".") : null);

/** 1 段だけ降りる。見つからなければ undefined */
function step(node, seg) {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return isIndex(seg) ? node[Number(seg)] : node.find((x) => x && str(x.id) === seg);
  if (Object.prototype.hasOwnProperty.call(node, seg)) return node[seg];
  if (isFxInstance(node)) return node.params[seg];   // fx.<id>.<paramKey>
  return undefined;
}

/**
 * path の値を読む。無ければ undefined（呼び出し側が既定へ落とせるように）。
 * @param {Object} obj @param {string} path @returns {*}
 */
export function getPath(obj, path) {
  const segs = splitPath(path);
  if (!segs) return undefined;
  let node = obj;
  for (const s of segs) {
    node = step(node, s);
    if (node === undefined) return undefined;
  }
  return node;
}

/** 欠けた枝を作るときの既定（path の前半で引く） */
const BRANCH_DEFAULT = {
  "transform": defaultTransform, "color": defaultColorGrade, "mask": defaultMask,
  "chroma": defaultChroma, "text": defaultTextSpec, "text.style": defaultTextStyle,
  "shape": defaultShape, "compound": () => ({ tracks: [] })
};

/**
 * path へ値を書く（**obj を直に書き換える**。ops は draft を直すのでこれで良い）。
 * 途中の枝が無ければ既定で作る（clip.color が null でも "color.exposure" が書ける）。
 * @param {Object} obj @param {string} path @param {*} v
 * @returns {boolean} 書けたか（fx の id が無い等で辿れなければ false）
 */
export function setPath(obj, path, v) {
  const segs = splitPath(path);
  if (!segs || obj === null || typeof obj !== "object") return false;
  let node = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    let next = step(node, seg);
    if (next === undefined || next === null) {
      // 配列（fx）の途中は作れない。FxInstance は type が分からないと意味が無いので、
      // 勝手に作らず false を返して呼び出し側（ops.clip.addFx）に任せる。
      if (Array.isArray(node)) return false;
      const mk = BRANCH_DEFAULT[segs.slice(0, i + 1).join(".")];
      next = mk ? mk() : (isIndex(segs[i + 1]) ? [] : {});
      if (isFxInstance(node) && !Object.prototype.hasOwnProperty.call(node, seg)) node.params[seg] = next;
      else node[seg] = next;
    }
    node = next;
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(node)) {
    if (!isIndex(last)) return false;
    node[Number(last)] = v;
    return true;
  }
  if (node === null || typeof node !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(node, last) && isFxInstance(node)) node.params[last] = v;
  else node[last] = v;
  return true;
}

/* ── 6. 尺の計算 ───────────────────────────────────────────────── */

/** クリップの終わり（タイムライン秒） */
export function clipEnd(clip) {
  if (!clip || typeof clip !== "object") return 0;
  return finite(clip.start, 0) + pos(clip.duration, 0);
}

/** トラックの終わり。空なら 0 */
export function trackEnd(track) {
  let e = 0;
  for (const c of arr(track && track.clips)) { const x = clipEnd(c); if (x > e) e = x; }
  return e;
}

function tracksEnd(tracks) {
  let e = 0;
  for (const t of arr(tracks)) { const x = trackEnd(t); if (x > e) e = x; }
  return e;
}

/** 全トラックの最大 end。空なら 0 */
export function projectDuration(project) {
  return project && typeof project === "object" ? tracksEnd(project.tracks) : 0;
}

/** 素材側の尺（分からなければ Infinity）。compound は入れ子タイムラインの尺 */
function sourceLimit(clip, asset) {
  if (clip && clip.kind === "compound") {
    const t = clip.compound && clip.compound.tracks;
    return Array.isArray(t) && t.length ? tracksEnd(t) : Infinity;
  }
  const d = asset ? finite(asset.duration, 0) : 0;
  return d > 0 ? d : Infinity;
}

/**
 * 速度ランプの平均倍率。正確な換算は core/eval.js の buildSpeedMap が持つ。
 * ここは「あとどれだけ伸ばせるか」を UI に出すための目安なので平均で足りる。
 */
function averageSpeed(clip) {
  const base = Math.max(0.02, Math.abs(finite(clip && clip.speed, 1)) || 1);
  const r = clip && clip.speedRamp;
  if (!Array.isArray(r) || r.length < 2) return base;
  let area = 0, span = 0;
  for (let i = 1; i < r.length; i++) {
    const t0 = finite(r[i - 1] && r[i - 1].t, 0), t1 = finite(r[i] && r[i].t, 0);
    const v0 = Math.max(0.02, Math.abs(finite(r[i - 1] && r[i - 1].v, 1))), v1 = Math.max(0.02, Math.abs(finite(r[i] && r[i].v, 1)));
    const dt = t1 - t0;
    if (dt <= 0) continue;
    area += ((v0 + v1) / 2) * dt;
    span += dt;
  }
  return span > 0 ? area / span : base;
}

/**
 * 使っている素材範囲の長さ（**speed / ramp を掛けない素材側の秒**）。
 * 静止素材（image/text/shape/adjust）は時間の制約が無いので Infinity。
 * @param {Object} clip @param {Object|null} [asset] @returns {number}
 */
export function clipSourceDuration(clip, asset) {
  if (!clip || typeof clip !== "object") return 0;
  if (!HAS_SRC[str(clip.kind)]) return Infinity;
  const lim = sourceLimit(clip, asset);
  const i = pos(clip.in, 0);
  let o = finite(clip.out, i);
  if (Number.isFinite(lim)) o = Math.min(o, lim);
  return Math.max(0, o - i);
}

/**
 * タイムライン上でどこまで伸ばせるか（in/out と speed から出す限界）。
 * image 等の静止素材は Infinity。素材の尺が分からないときは今の in/out 分だけ保証する。
 * 逆再生は out から in へ向かって進むので、余っている素材は out 側の長さになる。
 * @param {Object} clip @param {Object|null} [asset] @returns {number}
 */
export function clipMaxDuration(clip, asset) {
  if (!clip || typeof clip !== "object") return 0;
  if (!HAS_SRC[str(clip.kind)]) return Infinity;
  const sp = averageSpeed(clip);
  const lim = sourceLimit(clip, asset);
  if (!Number.isFinite(lim)) return Math.max(MIN_CLIP, clipSourceDuration(clip, asset) / sp);
  const avail = clip.reverse
    ? Math.max(0, Math.min(finite(clip.out, lim), lim))
    : Math.max(0, lim - pos(clip.in, 0));
  return Math.max(MIN_CLIP, avail / sp);
}

/* ── 7. 探す ───────────────────────────────────────────────────── */

/**
 * clipId でクリップを探す（入れ子の中は見ない。compound は enter してから探す）。
 * @returns {{clip:Object, track:Object, index:number}|null}
 */
export function findClip(project, clipId) {
  const id = str(clipId);
  if (!id) return null;
  for (const track of arr(project && project.tracks)) {
    const clips = arr(track && track.clips);
    for (let i = 0; i < clips.length; i++) {
      if (clips[i] && str(clips[i].id) === id) return { clip: clips[i], track, index: i };
    }
  }
  return null;
}

/** @returns {Object|null} 素材。無ければ null */
export function assetById(project, id) {
  const key = str(id);
  if (!key) return null;
  for (const a of arr(project && project.assets)) if (a && str(a.id) === key) return a;
  return null;
}

/** @returns {Object[]} その種類のトラック（下から上の順のまま） */
export function tracksByKind(project, kind) {
  const k = str(kind);
  return arr(project && project.tracks).filter((t) => t && str(t.kind) === k);
}

/* ── 8. 複製 ───────────────────────────────────────────────────── */

/**
 * クリップを複製する。newId のとき fx の id も振り直し、
 * keys の "fx.<旧id>.*" も一緒に付け替える（忘れると複製先の効果にキーが効かない）。
 * linkedId は消す（相棒は元のクリップと繋がったままなので、複製に相手は居ない）。
 * groupId は残す（グループごと複製したいことの方が多い）。
 * @param {Object} clip @param {{newId?:boolean}} [opts] @returns {Object}
 */
export function cloneClip(clip, opts) {
  const c = deepClone(clip);
  if (!c || typeof c !== "object") return c;
  if (opts && opts.newId === false) return c;
  c.id = uid("cl");
  const map = new Map();
  for (const f of arr(c.fx)) {
    if (!f || !f.id) continue;
    const n = uid("fx");
    map.set(str(f.id), n);
    f.id = n;
  }
  if (map.size && c.keys && typeof c.keys === "object") {
    const keys = {};
    for (const p of Object.keys(c.keys)) {
      const seg = p.split(".");
      if (seg[0] === "fx" && map.has(seg[1])) { seg[1] = map.get(seg[1]); keys[seg.join(".")] = c.keys[p]; }
      else keys[p] = c.keys[p];
    }
    c.keys = keys;
  }
  c.linkedId = null;
  return c;
}

/**
 * トラックを複製する（中のクリップも複製。id は振り直す）。
 * @param {Object} track @param {{newId?:boolean}} [opts] @returns {Object}
 */
export function cloneTrack(track, opts) {
  const t = deepClone(track);
  if (!t || typeof t !== "object") return t;
  if (opts && opts.newId === false) return t;
  t.id = uid("tr");
  for (const f of arr(t.fx)) if (f && f.id) f.id = uid("fx");
  t.clips = arr(t.clips).map((c) => cloneClip(c, { newId: true }));
  return t;
}

/* ── 9. 整える（normalize）──────────────────────────────────────
   入力は読むだけ。枝を 1 つずつ組み立て直して返すので、
   契約書に無いフィールドは落ちる（保存が太らないようにする意図）。 */

/**
 * project を §1 の不変条件を満たす形へ整えて **新しい object** で返す。
 * 副作用なし・冪等（normalize(normalize(p)) は deepEqual）。
 * @param {Object} p @returns {Object} Project
 */
export function normalizeProject(p) {
  const src = plain(p);
  // id の重複は findClip / keys の指し先を壊すので、ここで振り直す
  const used = new Set();
  const uniq = (id, pfx) => { let v = str(id); if (!v || used.has(v)) v = uid(pfx); used.add(v); return v; };
  const assets = arr(src.assets).map((a) => normAsset(a, uniq));
  const amap = new Map(assets.map((a) => [a.id, a]));
  const ctx = { amap, uniq, depth: 0 };
  // 上限を超えた分は落とす（engine が持てない本数を保存形式に残しても直せない）
  const tracks = arr(src.tracks).slice(0, MAX_TRACKS).map((t) => normTrack(t, ctx));
  const meta = plain(src.meta);
  return {
    schema: SCHEMA_VERSION,
    id: str(src.id) || uid("prj"),
    name: str(src.name) || "無題のプロジェクト",
    createdAt: int(src.createdAt, 0) || nowMs(),
    updatedAt: Math.max(0, int(src.updatedAt, 0)),
    settings: normSettings(src.settings, amap),
    assets,
    tracks,
    markers: arr(src.markers).map((m) => normMarker(m, uniq)).sort(byT),
    chapters: arr(src.chapters).map((c) => normChapter(c, uniq)).sort(byT),
    subtitleStyle: normTextStyle(src.subtitleStyle),
    meta: Object.assign(deepClone(meta), { aiHistory: arr(meta.aiHistory).map((h) => deepClone(h)) })
  };
}

const byT = (a, b) => a.t - b.t;

function normMarker(m, uniq) {
  const o = plain(m);
  return { id: uniq(o.id, "mk"), t: pos(o.t, 0), name: str(o.name), color: hex(o.color, "#ffcc00"), note: str(o.note) };
}
function normChapter(c, uniq) {
  const o = plain(c);
  return { id: uniq(o.id, "ch"), t: pos(o.t, 0), title: str(o.title) };
}

function normSettings(s, amap) {
  const o = plain(s), bg = plain(o.background), au = plain(o.audio);
  let ratio = str(o.ratio) || "16:9";
  if (!Object.prototype.hasOwnProperty.call(RATIOS, ratio)) ratio = "custom";
  const base = RATIOS[ratio];
  const bgAsset = bg.assetId ? str(bg.assetId) : null;
  return {
    width: even(o.width, base.w), height: even(o.height, base.h),
    fps: clamp(finite(o.fps, 30), 1, 240),
    ratio,
    sampleRate: clamp(int(o.sampleRate, 48000), 8000, 192000),
    background: {
      type: pick(bg.type, ["color", "blur", "image"], "color"),
      color: hex(bg.color, "#000000"),
      // 無い素材を指したままだと engine が毎フレーム探して無駄なので切る
      assetId: bgAsset && amap.has(bgAsset) ? bgAsset : null,
      blur: clamp(finite(bg.blur, 40), 0, 200)
    },
    snap: bool(o.snap, true), magnet: bool(o.magnet, true), showSafeArea: bool(o.showSafeArea, false),
    previewQuality: pick(o.previewQuality, PREVIEW_QUALITIES, "auto"),
    audio: { master: clamp(finite(au.master, 1), 0, 4), limiter: bool(au.limiter, true) }
  };
}

function normAsset(a, uniq) {
  const o = plain(a), st = plain(o.storage);
  const kind = pick(o.kind, ASSET_KINDS, guessAssetKind(o.mime));
  return {
    id: uniq(o.id, "as"), kind, name: str(o.name), mime: str(o.mime),
    size: Math.max(0, int(o.size, 0)),
    duration: kind === "image" ? 0 : pos(o.duration, 0),   // §1: image は 0
    width: Math.max(0, int(o.width, 0)), height: Math.max(0, int(o.height, 0)),
    fps: pos(o.fps, 0),
    hasAudio: bool(o.hasAudio, kind === "audio"),
    rotation: [0, 90, 180, 270].indexOf(int(o.rotation, 0)) >= 0 ? int(o.rotation, 0) : 0,
    storage: { kind: pick(st.kind, ["idb", "opfs", "url", "none"], "idb"), key: st.key === undefined || st.key === null ? null : str(st.key) },
    createdAt: int(o.createdAt, 0) || nowMs(),
    // 解析結果の持ち主は analysis/* なので中身は触らない（形だけ写す）
    analysis: o.analysis && typeof o.analysis === "object" ? deepClone(o.analysis) : null
  };
}

function normTrack(t, ctx) {
  const o = plain(t);
  const kind = pick(o.kind, TRACK_KINDS, "video");
  const clips = arr(o.clips).map((c) => normClip(c, ctx));
  layoutClips(clips, ctx);   // §1-1
  fitTransitions(clips);     // §1-3
  return {
    id: ctx.uniq(o.id, "tr"), kind, name: str(o.name) || defaultTrackName(kind),
    height: clamp(int(o.height, 72), 28, 400),
    muted: bool(o.muted, false), locked: bool(o.locked, false),
    hidden: bool(o.hidden, false), solo: bool(o.solo, false),
    volume: clamp(finite(o.volume, 1), 0, 4), pan: clamp(finite(o.pan, 0), -1, 1),
    fx: normFxList(o.fx), clips
  };
}

function normClip(c, ctx) {
  const o = plain(c);
  let kind = pick(o.kind, CLIP_KINDS, "video");
  let assetId = o.assetId === undefined || o.assetId === null ? null : str(o.assetId);
  // §1-5: 素材を指せていないクリップ（assetId が無い / assets に居ない）は
  //   **消さずに** 灰色の図形へ落とす。消すと「なぜ減ったのか」が分からない。
  //   validate は落とす前の状況を報告できるので、UI は理由を出せるし、素材を
  //   入れ直してから作り直すこともできる。
  //   ＝ video/image/audio のクリップは **必ず assetId を付けて作る**こと。
  //     （newClip("video") のまま normalize へ渡すと図形になる）
  let lost = false;
  if (NEEDS_ASSET[kind]) {
    if (!assetId || !ctx.amap.has(assetId)) { lost = true; assetId = null; kind = "shape"; }
  } else if (assetId && !ctx.amap.has(assetId)) {
    assetId = null;   // 素材が要らない kind の迷子の id は落とすだけ（clip 自体は残す）
  }
  // compound の素材は入れ子のタイムラインなので assetId は持たない
  // （持たせると「素材尺」の求め方が 2 通りになり、normalize と validate が食い違う）
  if (kind === "compound") assetId = null;
  const duration = Math.max(MIN_CLIP, finite(o.duration, 4));   // §1-2: 切り上げ
  const speed = clamp(Math.abs(finite(o.speed, 1)) || 1, 0.02, 100);
  const af = plain(o.audioFade), sb = plain(o.stabilize);
  const cl = {
    id: ctx.uniq(o.id, "cl"), name: str(o.name), assetId, kind,
    start: pos(o.start, 0), duration,
    in: 0, out: 0,                       // すぐ下で素材尺を見て決める
    speed, reverse: bool(o.reverse, false), speedRamp: normRamp(o.speedRamp),
    volume: clamp(finite(o.volume, 1), 0, 4), muteAudio: bool(o.muteAudio, false),
    audioFade: { in: pos(af.in, 0), out: pos(af.out, 0), curve: pick(af.curve, FADE_CURVES, "linear") },
    opacity: clamp(finite(o.opacity, 1), 0, 1), blend: pick(o.blend, BLEND_MODES, "normal"),
    transform: normTransform(o.transform),
    mask: o.mask ? normMask(o.mask) : null,
    chroma: o.chroma ? normChroma(o.chroma) : null,
    color: o.color ? normColor(o.color) : null,
    fx: normFxList(o.fx),
    transitionIn: normTransition(o.transitionIn), transitionOut: normTransition(o.transitionOut),
    text: (kind === "text" || o.text) ? normTextSpec(o.text) : null,
    shape: (kind === "shape" || o.shape) ? normShape(lost ? null : o.shape, lost) : null,
    compound: kind === "compound" ? normCompound(o.compound, ctx) : null,
    keys: normKeys(o.keys),
    stabilize: o.stabilize ? { amount: clamp(finite(sb.amount, 0), 0, 1), baked: bool(sb.baked, false) } : null,
    label: hex(o.label, "#4f8cff"),
    groupId: o.groupId ? str(o.groupId) : null,
    locked: bool(o.locked, false), hidden: bool(o.hidden, false),
    linkedId: o.linkedId ? str(o.linkedId) : null,
    source: normSource(o.source)
  };
  // §1-2: in >= 0 / out > in / out <= 素材尺
  const asset = assetId ? ctx.amap.get(assetId) : null;
  const lim = sourceLimit(cl, asset);
  let ci = pos(o.in, 0);
  let co = finite(o.out, ci + duration * speed);   // out が無ければタイムライン尺から当てる
  if (Number.isFinite(lim) && lim > 0) {
    if (ci > lim - MIN_CLIP) ci = Math.max(0, lim - MIN_CLIP);
    co = Math.min(co, lim);
  }
  if (!(co > ci + EPS)) co = ci + MIN_CLIP;
  cl.in = ci;
  cl.out = co;
  return cl;
}

function normCompound(cp, ctx) {
  const o = plain(cp);
  // 深さ MAX_DEPTH まで整える。それより深い物は触らずに残し、validate が報告する
  if (ctx.depth >= MAX_DEPTH) return { tracks: deepClone(arr(o.tracks)) };
  const sub = { amap: ctx.amap, uniq: ctx.uniq, depth: ctx.depth + 1 };
  return { tracks: arr(o.tracks).slice(0, MAX_TRACKS).map((t) => normTrack(t, sub)) };
}

/**
 * §1-1 の不変条件（start 昇順・重なり無し）を作る。
 * 重なりは **前のクリップを重なった分だけ縮める**。後ろをずらす直し方にしないのは、
 * 後ろをずらすと それ以降の全部が動いて、音楽・マーカー・他トラックとの同期が
 * 黙って崩れるから（ユーザは「置いた場所」を正しいと思っている）。
 * 縮めると最短尺を切ってしまう時だけ、仕方なく後ろを MIN_CLIP だけ退かす
 * （クリップを消してしまうよりは良い）。
 */
function layoutClips(clips, ctx) {
  clips.sort(byStart);   // 安定ソートなので 同じ start は元の順
  for (let i = 1; i < clips.length; i++) {
    const prev = clips[i - 1], cur = clips[i];
    const floor = prev.start + MIN_CLIP;
    if (cur.start < floor - EPS) cur.start = floor;
    const over = (prev.start + prev.duration) - cur.start;
    if (over > EPS) setClipDuration(prev, cur.start - prev.start, ctx);
  }
  return clips;
}
const byStart = (a, b) => a.start - b.start;

/** 尺を変えるときは素材側の範囲も一緒に詰める（ずれると最後のフレームで静止する） */
function setClipDuration(cl, d, ctx) {
  cl.duration = Math.max(MIN_CLIP, d);
  if (!HAS_SRC[cl.kind] || cl.speedRamp) return;   // ramp 付きの換算は eval が持ち主
  const span = cl.duration * cl.speed;
  if (cl.reverse) {
    cl.in = Math.max(0, cl.out - span);            // 逆再生は out から in へ進む
  } else {
    const lim = sourceLimit(cl, cl.assetId ? ctx.amap.get(cl.assetId) : null);
    cl.out = Math.min(cl.in + span, Number.isFinite(lim) ? lim : Infinity);
  }
  if (!(cl.out > cl.in + EPS)) cl.out = cl.in + MIN_CLIP;
}

function fitTransitions(clips) {
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    c.transitionIn = fitTransition(c.transitionIn, c, clips[i - 1]);
    c.transitionOut = fitTransition(c.transitionOut, c, clips[i + 1]);
  }
}

/**
 * 遷移は 2 枚の重なりで作るので、自分と相手の **半分**までに収める（§1-3）。
 * 半分にしておけば 入口と出口の遷移を同時に持っていても食い合わない。
 */
function fitTransition(tr, self, other) {
  if (!tr) return null;
  const limit = (other ? Math.min(self.duration, other.duration) : self.duration) * 0.5;
  const d = Math.min(pos(tr.duration, 0.5), limit);
  if (d <= EPS) return null;   // 長さ 0 の遷移は ただのカット
  return { type: tr.type, duration: d, params: tr.params };
}

/** 遷移の器を整える（長さの収まりは fitTransition が clip の並びを見てから決める） */
const normTransition = (t) => (t && typeof t === "object" && !Array.isArray(t)
  ? { type: str(t.type) || "crossfade", duration: pos(t.duration, 0.5), params: normParams(t.params) }
  : null);

/** 自動編集が作った印（§1 Clip.source） */
const normSource = (s) => (s && typeof s === "object" && !Array.isArray(s)
  ? { by: str(s.by) || "ai", planId: s.planId ? str(s.planId) : null, note: str(s.note) }
  : null);

/* ── 9.1 枝ごとの正規化 ────────────────────────────────────────── */

function normTransform(t) {
  const o = plain(t), cr = plain(o.crop);
  let l = clamp(finite(cr.l, 0), 0, 1), r = clamp(finite(cr.r, 0), 0, 1);
  let tp = clamp(finite(cr.t, 0), 0, 1), b = clamp(finite(cr.b, 0), 0, 1);
  // 切り落としで幅や高さが 0 になると WebGL の四角形が潰れるので 0.98 までに留める
  if (l + r > 0.98 + EPS) { const k = 0.98 / (l + r); l *= k; r *= k; }
  if (tp + b > 0.98 + EPS) { const k = 0.98 / (tp + b); tp *= k; b *= k; }
  return {
    x: finite(o.x, 0), y: finite(o.y, 0),
    scale: clamp(finite(o.scale, 1), 0.001, 100),
    scaleX: clamp(finite(o.scaleX, 1), 0.001, 100), scaleY: clamp(finite(o.scaleY, 1), 0.001, 100),
    rotate: finite(o.rotate, 0),
    anchorX: finite(o.anchorX, 0.5), anchorY: finite(o.anchorY, 0.5),
    flipH: bool(o.flipH, false), flipV: bool(o.flipV, false),
    crop: { l, t: tp, r, b }
  };
}

const normTriple = (v, d) => { const a = Array.isArray(v) ? v : (d || []); return [finite(a[0], 0), finite(a[1], 0), finite(a[2], 0)]; };

function normCurve(pts, d) {
  if (!Array.isArray(pts)) return d;
  const out = pts.filter((q) => Array.isArray(q) && q.length >= 2)
    .map((q) => [clamp(finite(q[0], 0), 0, 1), clamp(finite(q[1], 0), 0, 1)])
    .sort((a, b) => a[0] - b[0]);
  return out.length >= 2 ? out : d;
}

function normColor(c) {
  const o = plain(c), d = defaultColorGrade(), cv = plain(o.curves), wh = plain(o.wheels);
  const g = {};
  // 値の範囲は engine（色）が決めるので、ここでは有限数であることだけを見る
  for (const k of COLOR_NUM) g[k] = finite(o[k], 0);
  g.curves = {
    rgb: normCurve(cv.rgb, d.curves.rgb), r: normCurve(cv.r, null),
    g: normCurve(cv.g, null), b: normCurve(cv.b, null), luma: normCurve(cv.luma, null)
  };
  g.wheels = {};
  for (const w of WHEELS) g.wheels[w] = normTriple(wh[w]);
  g.hsl = arr(o.hsl).slice(0, 6).map((h) => {
    const x = plain(h);
    return { hue: finite(x.hue, 0), range: clamp(finite(x.range, 30), 1, 180), h: finite(x.h, 0), s: finite(x.s, 0), l: finite(x.l, 0) };
  });
  if (!g.hsl.length) g.hsl = d.hsl;
  g.lut = o.lut && str(plain(o.lut).id) ? { id: str(o.lut.id), amount: clamp(finite(o.lut.amount, 1), 0, 1) } : null;
  return g;
}

function normMask(m) {
  const o = plain(m);
  return {
    type: pick(o.type, MASK_TYPES, "rect"),
    x: finite(o.x, 0.5), y: finite(o.y, 0.5),
    w: clamp(finite(o.w, 0.5), 0, 4), h: clamp(finite(o.h, 0.5), 0, 4),
    rotate: finite(o.rotate, 0),
    points: arr(o.points).filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [finite(q[0], 0), finite(q[1], 0)]),
    feather: clamp(finite(o.feather, 0), 0, 1),
    invert: bool(o.invert, false),
    expand: clamp(finite(o.expand, 0), -1, 1)
  };
}

function normChroma(c) {
  const o = plain(c);
  return {
    key: normTriple(o.key, [0, 1, 0]),
    similarity: clamp(finite(o.similarity, 0.4), 0, 1),
    smoothness: clamp(finite(o.smoothness, 0.1), 0, 1),
    spill: clamp(finite(o.spill, 0.2), 0, 1),
    enabled: bool(o.enabled, true)
  };
}

function normShape(s, gray) {
  const o = plain(s), st = plain(o.stroke);
  return {
    type: pick(o.type, SHAPE_TYPES, "rect"),
    fill: hex(o.fill, gray ? LOST_FILL : "#fff"),
    stroke: { width: pos(st.width, 0), color: hex(st.color, "#000") },
    radius: pos(o.radius, 0),
    w: clamp(finite(o.w, 0.3), 0, 4), h: clamp(finite(o.h, 0.2), 0, 4)
  };
}

function normTextStyle(s) {
  const o = plain(s), d = defaultTextStyle();
  const st = plain(o.stroke), sh = plain(o.shadow), gl = plain(o.glow), gr = plain(o.gradient), bg = plain(o.bg);
  return {
    font: str(o.font) || d.font,
    size: clamp(finite(o.size, d.size), 1, 4000),
    weight: clamp(int(o.weight, d.weight), 100, 1000),
    italic: bool(o.italic, false),
    color: hex(o.color, d.color),
    gradient: o.gradient ? { from: hex(gr.from, "#ffffff"), to: hex(gr.to, "#000000"), angle: finite(gr.angle, 0) } : null,
    stroke: { width: pos(st.width, 0), color: hex(st.color, "#000") },
    shadow: { x: finite(sh.x, 0), y: finite(sh.y, 4), blur: pos(sh.blur, 8), color: hex(sh.color, "#0008") },
    glow: { blur: pos(gl.blur, 0), color: hex(gl.color, "#fff") },
    bg: o.bg ? { color: hex(bg.color, "#000a"), pad: pos(bg.pad, 16), radius: pos(bg.radius, 12) } : null,
    ruby: o.ruby && typeof o.ruby === "object" ? deepClone(o.ruby) : null
  };
}

const normAnim = (a, type, dur) => {
  const o = plain(a);
  return { type: str(o.type) || type, duration: clamp(finite(o.duration, dur), 0, 10) };
};

function normTextSpec(t) {
  const o = plain(t), la = plain(o.layout), an = plain(o.anim), lp = plain(an.loop);
  return {
    content: typeof o.content === "string" ? o.content : "テキスト",
    style: normTextStyle(o.style),
    layout: {
      align: pick(la.align, ["left", "center", "right"], "center"),
      vAlign: pick(la.vAlign, ["top", "middle", "bottom"], "middle"),
      maxWidth: clamp(finite(la.maxWidth, 0.8), 0.05, 1),
      lineHeight: clamp(finite(la.lineHeight, 1.25), 0.5, 4),
      letterSpacing: clamp(finite(la.letterSpacing, 0), -0.5, 2)
    },
    anim: {
      in: normAnim(an.in, "fadeUp", 0.4),
      out: normAnim(an.out, "fade", 0.3),
      loop: { type: str(lp.type) || "none", speed: clamp(finite(lp.speed, 1), 0.05, 10) },
      unit: pick(an.unit, ["all", "char", "word", "line"], "all")
    }
  };
}

/** 効果の params は効果ごとに自由（持ち主は engine/fx）。数・文字・真偽・配列だけ通す */
function normParams(p) {
  const o = plain(p), out = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "number") out[k] = finite(v, 0);
    else if (typeof v === "string" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "number" ? finite(x, 0) : (typeof x === "string" || typeof x === "boolean" ? x : 0)));
    else if (v && typeof v === "object") out[k] = deepClone(v);
  }
  return out;
}

/** 効果の id は keys が "fx.<id>.<param>" で指すので、同じ owner の中で重複させない */
function normFxList(list) {
  const seen = new Set(), out = [];
  for (const f of arr(list)) {
    const o = plain(f);
    let id = str(o.id) || uid("fx");
    if (seen.has(id)) id = uid("fx");
    seen.add(id);
    out.push({ id, type: str(o.type) || "none", enabled: bool(o.enabled, true), params: normParams(o.params) });
  }
  return out;
}

function normRamp(r) {
  if (!Array.isArray(r) || !r.length) return null;
  const pts = r.map((k) => {
    const o = plain(k);
    return { t: pos(o.t, 0), v: clamp(Math.abs(finite(o.v, 1)) || 1, 0.02, 100) };
  }).sort(byT);
  const out = [];
  for (const q of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - q.t) <= EPS) out[out.length - 1] = q;
    else out.push(q);
  }
  return out.length ? out : null;
}

/** §1-4: keys の各配列は t 昇順・重複 t なし */
function normKeys(keys) {
  const src = plain(keys), out = {};
  for (const path of Object.keys(src)) {
    const list = [];
    for (const k of arr(src[path])) { const nk = normKey(k); if (nk) list.push(nk); }
    list.sort(byT);   // 安定ソート = 同じ t は後から来た方で潰す（最後の編集が勝つ）
    const dedup = [];
    for (const k of list) {
      const last = dedup[dedup.length - 1];
      if (last && Math.abs(last.t - k.t) <= EPS) dedup[dedup.length - 1] = k;
      else dedup.push(k);
    }
    if (dedup.length) out[path] = dedup;   // 空になった path は残さない
  }
  return out;
}

function normKey(k) {
  const o = plain(k);
  const tn = numOrNaN(o.t);
  if (!Number.isFinite(tn)) return null;   // t が読めないキーは捨てる（打ち所が無い）
  let v;
  if (typeof o.v === "string") {
    // §2: 値は数か "#rrggbb"。色として読めない文字列は補間できないので捨てる
    v = o.v.trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) return null;
  } else {
    v = numOrNaN(o.v);
    if (!Number.isFinite(v)) return null;
  }
  const ease = pick(o.ease, EASES, "linear");
  const key = { t: Math.max(0, tn), v, ease };
  if (ease === "bezier") {
    const b = arr(o.bez);
    key.bez = [clamp(finite(b[0], 0.25), 0, 1), finite(b[1], 0.1), clamp(finite(b[2], 0.25), 0, 1), finite(b[3], 1)];
  }
  return key;
}

/* ── 10. 検める（validate）──────────────────────────────────────
   **直さない。報告だけ。** 直すのは normalizeProject の仕事。
   errors  … §1 の不変条件を破っている（このまま再生/書き出しすると壊れる）
   warnings… 動くが意図と違う見込み（素材尺が未解析、知らない path 等）
   どちらも { path, msg, fix } で、fix は「どう直すか」の日本語。UI はこれを出す。 */

/**
 * @param {Object} p
 * @returns {{ok:boolean, errors:{path:string,msg:string,fix:string}[], warnings:{path:string,msg:string,fix:string}[]}}
 */
export function validateProject(p) {
  const errors = [], warnings = [];
  const E = (path, msg, fix) => errors.push({ path, msg, fix });
  const W = (path, msg, fix) => warnings.push({ path, msg, fix });
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    E("", "project が object ではない", "newProject() で作り直す");
    return { ok: false, errors, warnings };
  }
  if (int(p.schema, 0) !== SCHEMA_VERSION) {
    E("schema", `schema が ${p.schema === undefined ? "無い" : p.schema}（この版は ${SCHEMA_VERSION}）`, "migrate() を通す");
  }
  if (!str(p.id)) W("id", "project の id が無い", 'uid("prj") を振る');
  validateSettings(p.settings, E, W);

  const ids = new Set(), amap = new Map();
  if (p.assets !== undefined && !Array.isArray(p.assets)) E("assets", "assets が配列ではない", "[] にする");
  arr(p.assets).forEach((a, i) => validateAsset(a, `assets[${i}]`, { E, W, ids, amap }));

  if (p.tracks !== undefined && !Array.isArray(p.tracks)) E("tracks", "tracks が配列ではない", "[] にする");
  const tracks = arr(p.tracks);
  if (tracks.length > MAX_TRACKS) E("tracks", `トラックが ${tracks.length} 本（上限 ${MAX_TRACKS}）`, `${MAX_TRACKS} 本に収める`);
  const ctx = { E, W, ids, amap, depth: 0 };
  tracks.forEach((t, i) => validateTrack(t, `tracks[${i}]`, ctx));

  for (const [field, label] of [["markers", "marker"], ["chapters", "chapter"]]) {
    if (p[field] !== undefined && !Array.isArray(p[field])) E(field, `${field} が配列ではない`, "[] にする");
    arr(p[field]).forEach((m, i) => {
      const path = `${field}[${i}]`;
      if (!m || typeof m !== "object") { E(path, `${label} が object ではない`, "消す"); return; }
      const t = numOrNaN(m.t);
      if (!Number.isFinite(t) || t < 0) E(path + ".t", `t が不正 (${m.t})`, "0 以上の秒にする");
      if (!str(m.id)) W(path + ".id", "id が無い", "uid で振る");
    });
  }
  if (p.subtitleStyle !== undefined && (!p.subtitleStyle || typeof p.subtitleStyle !== "object")) {
    E("subtitleStyle", "subtitleStyle が object ではない", "defaultTextStyle() を入れる");
  }
  if (p.meta !== undefined && (!p.meta || typeof p.meta !== "object")) E("meta", "meta が object ではない", "{ aiHistory: [] } を入れる");
  return { ok: errors.length === 0, errors, warnings };
}

/* CONTRACT-NOTE: 契約書 §1 の不変条件の節は この検査を `validate()` と呼んでいる。
   担当の指示は `validateProject` なので そちらを正とし、§1 の名前でも呼べるように
   別名を出しておく（同じ関数。片方だけ直すことが無いように 代入で繋ぐ）。 */
export const validate = validateProject;

function validateSettings(s, E, W) {
  if (s === undefined || s === null) { E("settings", "settings が無い", "defaultSettings() を入れる"); return; }
  if (typeof s !== "object" || Array.isArray(s)) { E("settings", "settings が object ではない", "defaultSettings() を入れる"); return; }
  const w = numOrNaN(s.width), h = numOrNaN(s.height), fps = numOrNaN(s.fps), sr = numOrNaN(s.sampleRate);
  // 奇数の寸法は符号化器（WebCodecs / MediaRecorder）が拒むので誤りとして出す
  if (!Number.isFinite(w) || w < 2 || w % 2 !== 0) E("settings.width", `width が不正 (${s.width})`, "2 以上の偶数にする");
  if (!Number.isFinite(h) || h < 2 || h % 2 !== 0) E("settings.height", `height が不正 (${s.height})`, "2 以上の偶数にする");
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) E("settings.fps", `fps が不正 (${s.fps})`, "1..240 にする");
  if (!Object.prototype.hasOwnProperty.call(RATIOS, str(s.ratio))) W("settings.ratio", `比率 "${s.ratio}" は既知ではない`, '"custom" にするか RATIOS に足す');
  if (!Number.isFinite(sr) || sr < 8000) W("settings.sampleRate", `sampleRate が不正 (${s.sampleRate})`, "48000 にする");
  if (s.previewQuality !== undefined && PREVIEW_QUALITIES.indexOf(str(s.previewQuality)) < 0) {
    W("settings.previewQuality", `previewQuality "${s.previewQuality}" は不明`, '"auto" に戻す');
  }
  const bg = s.background;
  if (bg !== undefined && bg !== null) {
    if (typeof bg !== "object") E("settings.background", "background が object ではない", "{ type:'color', color:'#000000' } を入れる");
    else if (["color", "blur", "image"].indexOf(str(bg.type)) < 0) W("settings.background.type", `type "${bg.type}" は不明`, '"color" に戻す');
  }
}

function validateAsset(a, path, ctx) {
  const { E, W, ids, amap } = ctx;
  if (!a || typeof a !== "object" || Array.isArray(a)) { E(path, "asset が object ではない", "消すか newAsset() で作り直す"); return; }
  const id = str(a.id);
  if (!id) E(path + ".id", "id が無い", 'uid("as") を振る');
  else if (ids.has(id)) E(path + ".id", `id が重複している (${id})`, "新しい id を振る（normalizeProject が振り直す）");
  if (id) { ids.add(id); if (!amap.has(id)) amap.set(id, a); }   // 重複時は先の方を正とする
  const kind = str(a.kind);
  if (ASSET_KINDS.indexOf(kind) < 0) E(path + ".kind", `kind "${a.kind}" は不正`, "video / image / audio のどれかにする");
  const d = numOrNaN(a.duration);
  if (!Number.isFinite(d) || d < 0) E(path + ".duration", `duration が不正 (${a.duration})`, "0 以上の秒にする");
  else if (kind === "image" && d > 0) W(path + ".duration", "image の尺は 0 と決めている（§1）", "0 にする（尺は clip 側が持つ）");
  else if (kind !== "image" && d === 0) W(path + ".duration", "尺が 0（まだ解析していない？）", "asset.update で尺を入れる");
  if (!str(plain(a.storage).key)) W(path + ".storage.key", "素材の実体を指していない", "persist.putAsset の key を入れる");
}

function validateTrack(t, path, ctx) {
  const { E, ids } = ctx;
  if (!t || typeof t !== "object" || Array.isArray(t)) { E(path, "track が object ではない", "消すか newTrack() で作り直す"); return; }
  const id = str(t.id);
  if (!id) E(path + ".id", "id が無い", 'uid("tr") を振る');
  else if (ids.has(id)) E(path + ".id", `id が重複している (${id})`, "新しい id を振る");
  if (id) ids.add(id);
  if (TRACK_KINDS.indexOf(str(t.kind)) < 0) E(path + ".kind", `kind "${t.kind}" は不正`, TRACK_KINDS.join(" / ") + " のどれかにする");
  if (t.clips !== undefined && !Array.isArray(t.clips)) { E(path + ".clips", "clips が配列ではない", "[] にする"); return; }
  const clips = arr(t.clips);
  clips.forEach((c, i) => validateClip(c, `${path}.clips[${i}]`, ctx, clips[i - 1], clips[i + 1]));
}

function validateClip(c, path, ctx, prev, next) {
  const { E, W } = ctx;
  if (!c || typeof c !== "object" || Array.isArray(c)) { E(path, "clip が object ではない", "消すか newClip() で作り直す"); return; }
  const id = str(c.id);
  if (!id) E(path + ".id", "id が無い", 'uid("cl") を振る');
  else if (ctx.ids.has(id)) E(path + ".id", `id が重複している (${id})`, "新しい id を振る（normalizeProject が振り直す）");
  if (id) ctx.ids.add(id);
  const kind = str(c.kind);
  if (CLIP_KINDS.indexOf(kind) < 0) E(path + ".kind", `kind "${c.kind}" は不正`, CLIP_KINDS.join(" / ") + " のどれかにする");

  const start = numOrNaN(c.start), dur = numOrNaN(c.duration);
  if (!Number.isFinite(start) || start < 0) E(path + ".start", `start が不正 (${c.start})`, "0 以上の秒にする");
  if (!Number.isFinite(dur) || dur < MIN_CLIP - EPS) E(path + ".duration", `duration が ${c.duration}（最短 ${MIN_CLIP} 秒）`, `${MIN_CLIP} 秒まで切り上げる`);
  // §1-1: start 昇順・重なり無し
  if (prev && typeof prev === "object" && Number.isFinite(start)) {
    const ps = numOrNaN(prev.start);
    if (Number.isFinite(ps) && start < ps - EPS) E(path + ".start", "clip が start 昇順に並んでいない（§1-1）", "start で並べ替える");
    else if (start < clipEnd(prev) - EPS) {
      E(path + ".start", `前の clip と ${(clipEnd(prev) - start).toFixed(3)} 秒重なっている（§1-1）`, "前の clip を重なった分だけ縮める");
    }
  }
  // §1-5: 素材の在処
  const assetId = c.assetId === undefined || c.assetId === null ? null : str(c.assetId);
  const asset = assetId ? ctx.amap.get(assetId) : null;
  if (assetId && !asset) E(path + ".assetId", `素材 ${assetId} が assets に無い（§1-5）`, "素材を入れ直すか、灰色の図形へ落とす（normalizeProject がやる）");
  else if (!assetId && NEEDS_ASSET[kind]) E(path + ".assetId", `kind "${kind}" なのに素材を指していない`, "素材を指すか kind を text/shape にする");
  // §1-2: in / out / speed
  if (HAS_SRC[kind]) {
    const ci = numOrNaN(c.in), co = numOrNaN(c.out), sp = numOrNaN(c.speed);
    if (!Number.isFinite(ci) || ci < 0) E(path + ".in", `in が不正 (${c.in})`, "0 以上にする");
    if (!Number.isFinite(co) || !(co > ci)) E(path + ".out", `out (${c.out}) が in (${c.in}) を超えていない`, "out = in + duration*speed にする");
    else if (kind !== "compound" && asset && numOrNaN(asset.duration) > 0 && co > numOrNaN(asset.duration) + 1e-3) {
      E(path + ".out", `out ${co} が素材の尺 ${asset.duration} を超えている`, "素材の尺で切る");
    }
    if (!Number.isFinite(sp) || sp <= 0) E(path + ".speed", `speed が不正 (${c.speed})`, "0 より大きい倍率にする");
    else if (!c.speedRamp && Number.isFinite(co) && Number.isFinite(ci) && Number.isFinite(dur) && co - ci < dur * sp - 0.05) {
      W(path + ".out", "素材が足りない（最後のフレームで静止する）", "duration を縮めるか out を伸ばす");
    }
    if (c.speedRamp !== undefined && c.speedRamp !== null && !Array.isArray(c.speedRamp)) {
      E(path + ".speedRamp", "speedRamp が配列でも null でもない", "[{t,v}] か null にする");
    }
  }
  const op = numOrNaN(c.opacity);
  if (!Number.isFinite(op) || op < 0 || op > 1) E(path + ".opacity", `opacity が不正 (${c.opacity})`, "0..1 にする");
  if (BLEND_MODES.indexOf(str(c.blend)) < 0) E(path + ".blend", `blend "${c.blend}" は不正`, '"normal" に戻す');
  if (kind === "text" && !c.text) E(path + ".text", "kind text なのに text が無い", "defaultTextSpec() を入れる");
  if (kind === "shape" && !c.shape) E(path + ".shape", "kind shape なのに shape が無い", "defaultShape() を入れる");
  // §1-3: 遷移は隣との余裕に収まっているか
  for (const side of ["transitionIn", "transitionOut"]) {
    const tr = c[side];
    if (tr === undefined || tr === null) continue;
    if (typeof tr !== "object") { E(`${path}.${side}`, "遷移が object ではない", "null にする"); continue; }
    const other = side === "transitionIn" ? prev : next;
    const od = other && typeof other === "object" ? numOrNaN(other.duration) : NaN;
    const selfD = Number.isFinite(dur) ? dur : 0;
    const limit = (Number.isFinite(od) ? Math.min(selfD, od) : selfD) * 0.5;
    const d = numOrNaN(tr.duration);
    if (!Number.isFinite(d) || d <= 0) E(`${path}.${side}.duration`, `遷移の長さが不正 (${tr.duration})`, "0 より大きくするか null にする");
    else if (d > limit + 1e-3) E(`${path}.${side}.duration`, `遷移 ${d} 秒は隣との余裕 ${limit.toFixed(3)} 秒を超えている（§1-3）`, "余裕まで縮める");
  }
  validateKeys(c, path, ctx);
  if (c.color && Array.isArray(c.color.hsl) && c.color.hsl.length > 6) {
    W(path + ".color.hsl", `HSL 個別調整が ${c.color.hsl.length} 本（上限 6）`, "6 本に減らす");
  }
  if (c.stabilize) {
    const am = numOrNaN(c.stabilize.amount);
    if (!Number.isFinite(am) || am < 0 || am > 1) W(path + ".stabilize.amount", `amount が不正 (${c.stabilize.amount})`, "0..1 にする");
  }
  // 入れ子（§1: 深さ MAX_DEPTH まで）
  if (kind === "compound") {
    const nest = ctx.depth + 1;
    const sub = arr(c.compound && c.compound.tracks);
    if (nest > MAX_DEPTH) E(path + ".compound", `入れ子が深すぎる（上限 ${MAX_DEPTH}）`, "compound.flatten で平らにする");
    else sub.forEach((t, i) => validateTrack(t, `${path}.compound.tracks[${i}]`, { E, W, ids: ctx.ids, amap: ctx.amap, depth: nest }));
  }
}

function validateKeys(c, path, ctx) {
  const { E, W } = ctx;
  const keys = c.keys;
  if (keys === undefined || keys === null) return;
  if (typeof keys !== "object" || Array.isArray(keys)) { E(path + ".keys", "keys が object ではない", "{} にする"); return; }
  const fxIds = new Set(arr(c.fx).map((f) => str(f && f.id)));
  for (const kp of Object.keys(keys)) {
    const kpath = `${path}.keys["${kp}"]`;
    if (!isKeyablePath(kp)) W(kpath, `"${kp}" はキーを打てる path ではない（§2）`, "KEYABLE_PATHS から選ぶ");
    else if (kp.indexOf("fx.") === 0 && !fxIds.has(kp.split(".")[1])) W(kpath, `効果 ${kp.split(".")[1]} がこの clip に無い`, "key を消すか効果を足す");
    const list = keys[kp];
    if (!Array.isArray(list)) { E(kpath, "keys の値が配列ではない", "[] にする"); continue; }
    let last = -Infinity;
    list.forEach((k, i) => {
      const o = plain(k);
      const t = numOrNaN(o.t);
      if (!Number.isFinite(t)) { E(`${kpath}[${i}].t`, "t が数ではない", "clip ローカル秒を入れる"); return; }
      if (t < 0) E(`${kpath}[${i}].t`, `t が負 (${t})`, "0 以上にする");
      if (t < last - EPS) E(`${kpath}[${i}].t`, "t が昇順ではない（§1-4）", "t で並べ替える");
      else if (Math.abs(t - last) <= EPS) E(`${kpath}[${i}].t`, `t ${t} が重複している（§1-4）`, "重複を 1 つに潰す");
      last = t;
      const okV = typeof o.v === "string" ? /^#[0-9a-fA-F]{3,8}$/.test(o.v.trim()) : Number.isFinite(numOrNaN(o.v));
      if (!okV) E(`${kpath}[${i}].v`, `v が数でも #rrggbb でもない (${o.v})`, "数か 16 進の色にする");
      if (o.ease !== undefined && EASES.indexOf(str(o.ease)) < 0) W(`${kpath}[${i}].ease`, `ease "${o.ease}" は不明`, '"linear" に戻す');
      if (str(o.ease) === "bezier" && !(Array.isArray(o.bez) && o.bez.length >= 4)) W(`${kpath}[${i}].bez`, "bezier なのに bez が無い", "[.25,.1,.25,1] を入れる");
    });
  }
}

/* ── 11. 移す（migrate）────────────────────────────────────────
   古い保存形式を 3 へ持ち上げる。**落とすより残す**（読めない枝は捨てるが、
   意味が同じ枝は必ず付け替える）。最後に normalizeProject を通すので、
   migrate 自身は「名前の付け替え」と「形の組み替え」だけを考えればよい。

   v1（最初の試作）… clip.offset/len, clip.keyframes[]（path 込みの平らな配列）,
                     clip.transition（出口だけ）, clip.effect（効果 1 つ）,
                     settings.ratio 無し, markers 無し
   v2 …              clip.speedCurve（→ speedRamp）, clip.filter（→ color）,
                     asset.probe（→ analysis）, subtitleStyle/chapters/meta 無し */

/**
 * @param {Object} p 古い project
 * @returns {Object} schema 3 の project（normalize 済み）
 * @throws {Error} object でない / 未知の未来版のとき
 */
export function migrate(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("migrate: project が object ではない");
  let v = numOrNaN(p.schema);
  if (!Number.isFinite(v) || v < 1) v = 1;   // 最初期は schema を書いていなかった
  if (v > SCHEMA_VERSION) {
    throw new Error(`migrate: schema ${v} は この版（${SCHEMA_VERSION}）より新しいので読めない。VQ Studio を更新する`);
  }
  let d = deepClone(p);
  if (v < 2) d = up1to2(d);
  if (v < 3) d = up2to3(d);
  d.schema = SCHEMA_VERSION;
  return normalizeProject(d);
}

/** 寸法から比率の名前を当てる（v1 は ratio を持っていなかった） */
function ratioFor(w, h) {
  const r = w > 0 && h > 0 ? w / h : 0;
  for (const k of Object.keys(RATIOS)) {
    if (k === "custom") continue;
    const x = RATIOS[k];
    if (Math.abs(r - x.w / x.h) < 0.02) return k;
  }
  return "custom";
}

function eachClip(d, fn) {
  for (const t of arr(d && d.tracks)) for (const c of arr(t && t.clips)) if (c && typeof c === "object") fn(c);
}

function up1to2(d) {
  const s = d.settings = plain(d.settings);
  if (!s.ratio) s.ratio = ratioFor(int(s.width, 1920), int(s.height, 1080));
  if (!Array.isArray(d.markers)) d.markers = [];
  eachClip(d, (c) => {
    if (c.start === undefined && c.offset !== undefined) c.start = c.offset;
    if (c.duration === undefined && c.len !== undefined) c.duration = c.len;
    delete c.offset; delete c.len;
    if (Array.isArray(c.keyframes)) {
      const keys = plain(c.keys);
      for (const k of c.keyframes) {
        const o = plain(k);
        const path = str(o.path);
        if (!path) continue;
        if (!Array.isArray(keys[path])) keys[path] = [];
        keys[path].push({ t: o.t, v: o.v, ease: o.ease });
      }
      c.keys = keys;
      delete c.keyframes;
    }
    if (c.transition && !c.transitionOut) c.transitionOut = c.transition;
    delete c.transition;
    if (c.effect && !Array.isArray(c.fx)) c.fx = [c.effect];
    delete c.effect;
  });
  return d;
}

function up2to3(d) {
  for (const a of arr(d.assets)) {
    if (!a || typeof a !== "object") continue;
    // probe は analysis の前身。中身の形は analysis/* が version で見分ける
    if (a.probe && !a.analysis) a.analysis = a.probe;
    delete a.probe;
  }
  eachClip(d, (c) => {
    if (c.speedCurve && !c.speedRamp) c.speedRamp = c.speedCurve;
    delete c.speedCurve;
    if (c.filter && !c.color) c.color = c.filter;
    delete c.filter;
  });
  return d;
}
