/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/icons.js — 線画アイコンの一箇所（24px グリッド / stroke 1.75）

   ★ 何をする所か
     `icon(name)` で SVG 要素を、`iconHTML(name)` で同じ絵の文字列を返す。
     UI（widgets / toolbar / timeline / inspector / mobile …）は自分で SVG を
     書かず **必ずここを通す**。線の太さ・端の丸み・色の作法が 1 箇所に集まる。

   ★ なぜこの形か
     ・外部アイコン集は禁止（CDN 禁止・ビルド無し）なので自前で持つ。
     ・絵は「形の並び」の小さな配列で持ち、DOM と文字列の **両方を同じ元から**
       作る。innerHTML に頼らないので Node（試験）でも `iconHTML` が動く。
     ・色は `currentColor`。CSS 側は `color` を変えるだけで良い。
     ・`fill="none"` 固定。塗りが要る絵（再生の三角など）も線画で表す。
       CapCut/Premiere 系の落ち着いた見た目に合わせるため。

   ★ 触るときの注意
     ・**知らない名前は落とさず `dots` を返す**（画面が壊れる方が損）。
     ・名前は増やして良いが消さない。`ICON_NAMES` は正式名だけ（別名は含めない）。
     ・24 の枠に対し余白 2〜3 を残す。線が枠に触ると並べたとき不揃いに見える。
     ・`icon()` は毎回 clone を返す。呼び側が属性を足しても他に影響しない。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

/** SVG の名前空間 */
const NS = "http://www.w3.org/2000/svg";

/** 線の作法（契約書 §7.3 の「線画・24px グリッド」） */
export const ICON_GRID = 24;
export const ICON_STROKE = 1.75;

/**
 * 形の書き方（1 要素 = 1 つの形）
 *   "M…"            … <path d="…">（M / m で始まるもの）
 *   "c cx cy r"     … <circle>
 *   "r x y w h [rx]"… <rect>
 *   "l x1 y1 x2 y2" … <line>
 *   "p x,y x,y …"   … <polyline>
 * @typedef {string} Shape
 */

/* ── 絵の定義（正式名 → 形の並び）──────────────────────────────────────
   並びは契約書の一覧順。増やすときは近い仲間の隣に置く。            */
/** @type {Record<string, Shape[]>} */
const ICONS = {
  /* 再生・時間 */
  play: ["M8 5l11 7-11 7z"],
  pause: ["r 8 4 3 16 1", "r 13 4 3 16 1"],
  stop: ["r 6 6 12 12 2"],
  prev: ["M18 6l-8 6 8 6z", "l 6 6 6 18"],
  next: ["M6 6l8 6-8 6z", "l 18 6 18 18"],
  skipStart: ["M21 6l-7 6 7 6z", "M14 6l-7 6 7 6z", "l 4 5 4 19"],
  skipEnd: ["M3 6l7 6-7 6z", "M10 6l7 6-7 6z", "l 20 5 20 19"],
  loop: ["M4 11V9a4 4 0 014-4h9", "M20 13v2a4 4 0 01-4 4H7", "M14 2l3 3-3 3", "M10 22l-3-3 3-3"],

  /* 音 */
  volume: ["M4 10v4h3l4 3V7l-4 3H4z", "M16 9a4 4 0 010 6", "M18.6 6.4a8 8 0 010 11.2"],
  volumeOff: ["M4 10v4h3l4 3V7l-4 3H4z", "l 16 10 21 15", "l 21 10 16 15"],
  mic: ["M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z", "M5 11a7 7 0 0014 0", "l 12 18 12 21", "l 9 21 15 21"],

  /* 編集の道具 */
  scissors: ["c 6 18 2.4", "c 18 18 2.4", "l 8 16.4 18 5", "l 16 16.4 6 5"],
  split: ["l 12 3 12 21", "M8 8H4v8h4", "M16 8h4v8h-4"],
  trash: ["l 4 7 20 7", "M7 7l1 13h8l1-13", "M9 7V4h6v3", "l 10 11 10 17", "l 14 11 14 17"],
  copy: ["r 9 9 11 11 2", "M5 15H4V4h11v1"],
  duplicate: ["r 4 4 11 11 2", "r 9 9 11 11 2"],
  undo: ["M4 9h11a5 5 0 010 10H8", "M8 5L4 9l4 4"],
  redo: ["M20 9H9a5 5 0 000 10h7", "M16 5l4 4-4 4"],
  magnet: ["M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4H6z", "l 6 8 10 8", "l 14 8 18 8"],
  zoomIn: ["c 10.5 10.5 6.5", "l 15.2 15.2 21 21", "l 10.5 7.6 10.5 13.4", "l 7.6 10.5 13.4 10.5"],
  zoomOut: ["c 10.5 10.5 6.5", "l 15.2 15.2 21 21", "l 7.6 10.5 13.4 10.5"],
  fit: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  lock: ["r 4 11 16 10 2", "M8 11V8a4 4 0 018 0v3", "l 12 15 12 17"],
  unlock: ["r 4 11 16 10 2", "M8 11V8a4 4 0 017.5-2"],

  /* 見せる・隠す・増減 */
  eye: ["M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z", "c 12 12 2.8"],
  eyeOff: ["M4.2 8.2C2.8 9.6 2 11 2 12c0 0 3.6 6 10 6 1.6 0 3.1-.4 4.4-1",
    "M9.6 5.3A10 10 0 0112 5c6.4 0 10 6 10 6a17 17 0 01-3.1 3.7",
    "l 3 3 21 21", "M10 10a2.8 2.8 0 004 4"],
  plus: ["l 12 5 12 19", "l 5 12 19 12"],
  minus: ["l 5 12 19 12"],
  check: ["M5 13l4 4L19 7"],
  x: ["l 6 6 18 18", "l 18 6 6 18"],

  /* 向き */
  chevronLeft: ["M15 5l-7 7 7 7"],
  chevronRight: ["M9 5l7 7-7 7"],
  chevronUp: ["M5 15l7-7 7 7"],
  chevronDown: ["M5 9l7 7 7-7"],
  arrowLeft: ["l 20 12 4 12", "M10 6l-6 6 6 6"],
  arrowRight: ["l 4 12 20 12", "M14 6l6 6-6 6"],

  /* 素材の種類 */
  text: ["M5 6V4h14v2", "l 12 4 12 20", "l 9 20 15 20"],
  sticker: ["M21 11a9 9 0 10-9 10", "M12 21c5-1 9-5 9-10-5 1-9 5-9 10z", "c 9 9.5 1", "c 14.6 9 1"],
  image: ["r 3 4 18 16 2", "c 8.5 9.5 1.8", "M3 17l5-4 4 3 3-2 6 5"],
  video: ["r 3 6 13 12 2", "M16 11l5-3v8l-5-3z"],
  audio: ["c 7 17 3", "c 18 15 3", "l 10 17 10 5", "l 21 15 21 3", "M10 5l11-2"],

  /* 見た目を変える物 */
  effect: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "l 18 17 18 21", "l 16 19 20 19"],
  filter: ["M3 5h18l-7 8v6l-4-2v-4z"],
  color: ["c 12 12 8", "M12 4a8 8 0 000 16z"],
  speed: ["M4 17a9 9 0 1116 0", "l 12 13 16 9", "c 12 17 1"],
  mask: ["r 3 4 18 16 2", "c 10 12 5", "M15 7a7 7 0 010 10"],
  crop: ["M7 3v14h14", "M3 7h14v14"],
  rotate: ["M20 12a8 8 0 11-3.2-6.4", "M20 4v5h-5"],
  flip: ["l 12 3 12 21", "M9 7L4 12l5 5V7z", "M15 7l5 5-5 5V7z"],
  layers: ["M12 3l8 4.5-8 4.5-8-4.5z", "M4 12l8 4.5 8-4.5", "M4 16.5L12 21l8-4.5"],

  /* キーフレームと曲線 */
  keyframe: ["M12 4l5 8-5 8-5-8z"],
  curve: ["M4 20C10 20 8 4 20 4", "c 4 20 1.6", "c 20 4 1.6"],

  /* AI */
  wand: ["M4 20l10-10", "M14.6 3.6l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z", "l 19.4 9 19.4 13", "l 17.4 11 21.4 11"],
  sparkles: ["M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6z",
    "M18.4 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"],
  ai: ["M8 20V8.5a4 4 0 118 0V20", "l 8 14 16 14", "M19.4 3l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"],

  /* 出し入れ */
  export: ["l 12 3 12 13", "M8 7l4-4 4 4", "M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"],
  download: ["l 12 3 12 15", "M8 11l4 4 4-4", "l 4 19 20 19"],
  upload: ["l 12 21 12 9", "M8 13l4-4 4 4", "l 4 5 20 5"],

  /* 設定と案内 */
  settings: ["c 12 12 3",
    "M12 2v3M12 19v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2 12h3M19 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"],
  help: ["c 12 12 9", "M9 9.2A3 3 0 0113.6 12c-.9.7-1.6 1.3-1.6 2.6", "c 12 17.4 0.6"],
  search: ["c 10.5 10.5 6.5", "l 15.2 15.2 21 21"],

  /* 画面の作り */
  grid: ["r 3 3 7.5 7.5 1", "r 13.5 3 7.5 7.5 1", "r 3 13.5 7.5 7.5 1", "r 13.5 13.5 7.5 7.5 1"],
  ratio: ["r 3 5 18 14 2", "M8 10V8h2", "M16 14v2h-2"],
  safeArea: ["r 3 4 18 16 2", "r 7 8 10 8 1"],
  fullscreen: ["M4 9V5a1 1 0 011-1h4", "M20 9V5a1 1 0 00-1-1h-4", "M4 15v4a1 1 0 001 1h4", "M20 15v4a1 1 0 01-1 1h-4"],
  pip: ["r 3 5 18 14 2", "r 12 12 7 5 1"],

  /* 触る所 */
  menu: ["l 4 7 20 7", "l 4 12 20 12", "l 4 17 20 17"],
  dots: ["c 5 12 1.3", "c 12 12 1.3", "c 19 12 1.3"],
  drag: ["l 4 9 20 9", "l 4 15 20 15"],
  handle: ["r 9 4 6 16 3", "l 12 9 12 15"],

  /* 目印 */
  marker: ["M6 3h12l-3 5 3 5H6z", "l 6 3 6 21"],
  chapter: ["M5 4h14v16l-7-4-7 4z"],
  link: ["M10 13.5a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1", "M14 10.5a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1"],
  unlink: ["M9 15l-1 1a4 4 0 01-5.7-5.7L4 9", "M15 9l1-1a4 4 0 015.7 5.7L20 15",
    "l 12 3 12 6", "l 3 12 6 12", "l 21 12 18 12", "l 12 21 12 18"],

  /* 時間をいじる */
  freeze: ["l 12 3 12 21", "l 4.5 7.5 19.5 16.5", "l 4.5 16.5 19.5 7.5", "M9 5l3 2 3-2", "M9 19l3-2 3 2"],
  reverse: ["M20 8H8a5 5 0 000 10h3", "M11 4L7 8l4 4"],

  /* 音の細かい所 */
  mixer: ["l 6 3 6 21", "l 12 3 12 21", "l 18 3 18 21", "c 6 8 2", "c 12 15 2", "c 18 10 2"],
  eq: ["r 4 12 3 8 1", "r 10.5 7 3 13 1", "r 17 4 3 16 1"],
  compress: ["l 4 12 20 12", "M8 8l4-4 4 4", "M8 16l4 4 4-4"],
  waveform: ["l 4 9 4 15", "l 7 6 7 18", "l 10 10 10 14", "l 13 4 13 20", "l 16 8 16 16", "l 19 10 19 14"],

  /* その他 */
  camera: ["M3 8a2 2 0 012-2h2l1.6-2h6.8L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z", "c 12 12.5 3.2"],
  clock: ["c 12 12 9", "M12 7v5l4 2"],
  template: ["r 3 4 18 16 2", "l 3 9 21 9", "l 10 9 10 20"],
  folder: ["M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  star: ["M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z"],
  heart: ["M12 20S4 15.2 4 10a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.2-8 10-8 10z"],
  trendUp: ["M3 17l6-6 4 4 8-8", "M16 7h5v5"],
  warning: ["M12 4l9 16H3z", "l 12 10 12 15", "c 12 17.6 0.6"],
  info: ["c 12 12 9", "l 12 11 12 16", "c 12 8.2 0.6"],
  home: ["M4 11l8-7 8 7v8a2 2 0 01-2 2H6a2 2 0 01-2-2z", "M10 21v-6h4v6"],
  account: ["c 12 8 4", "M4 20a8 8 0 0116 0"],
  transition: ["r 2 6 9 12 1", "r 13 6 9 12 1", "M9.5 12h5", "M12.5 9.5l2.5 2.5-2.5 2.5"],
  adjust: ["l 4 7 20 7", "l 4 17 20 17", "c 10 7 2", "c 15 17 2"],
  shapes: ["r 3 12 9 9 1", "c 16.5 7.5 4.5"]
};

/* ── 別名（旧い呼び名・他の担当が使っている呼び名を取りこぼさない）──────
   widgets.js の文字代替表や export/presets.js の `icon:` に出る名前を拾う。
   CONTRACT-NOTE: 契約書の一覧には無い名前だが、実物のコードが既にこの名前で
   呼んでいるので、`dots` に落ちる前に正式名へ寄せる。                    */
/** @type {Record<string, string>} */
const ALIASES = {
  close: "x", cut: "scissors", razor: "scissors", cancel: "x", ok: "check", done: "check",
  chevron: "chevronRight", "chevron-left": "chevronLeft", "chevron-right": "chevronRight",
  "chevron-up": "chevronUp", "chevron-down": "chevronDown",
  back: "chevronLeft", forward: "chevronRight", up: "chevronUp", down: "chevronDown",
  add: "plus", remove: "minus", "delete": "trash", warn: "warning", alert: "warning",
  error: "warning", grab: "drag", more: "dots", overflow: "dots", ellipsis: "dots",
  save: "download", share: "export", music: "audio", sound: "volume", mute: "volumeOff",
  sliders: "adjust", monitor: "video", movie: "video", picture: "image", photo: "image",
  gif: "image", archive: "folder", feather: "trendUp", magic: "wand", auto: "sparkles",
  robot: "ai", user: "account", profile: "account", person: "account", logout: "arrowRight",
  gear: "settings", cog: "settings", question: "help", time: "clock", timer: "clock",
  youtube: "video", shorts: "ratio", tiktok: "audio", instagram: "camera",
  square: "grid", line: "link", x_social: "x", twitter: "x",
  opacity: "adjust", fade: "transition", anim: "sparkles", animation: "sparkles",
  keyframes: "keyframe", curves: "curve", ease: "curve", snap: "magnet",
  visible: "eye", hidden: "eyeOff", locked: "lock", unlocked: "unlock",
  fit_all: "fit", zoom_in: "zoomIn", zoom_out: "zoomOut",
  ai_wand: "wand", speedometer: "speed", volume_off: "volumeOff"
};

/** 知らない名前の行き先（画面が空かないように必ず何か出す） */
const FALLBACK = "dots";

/** 正式名の一覧（別名は含まない）。UI の一覧表示や試験が使う。 */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** 別名の一覧（参考用） */
export const ICON_ALIASES = Object.freeze(Object.keys(ALIASES));

/**
 * 名前を正式名に寄せる。無ければ `dots`。
 * @param {string} name
 * @returns {string} ICONS に必ず在る名前
 */
export function resolveIconName(name) {
  const raw = String(name == null ? "" : name).trim();
  if (!raw) return FALLBACK;
  if (ICONS[raw]) return raw;
  if (ALIASES[raw] && ICONS[ALIASES[raw]]) return ALIASES[raw];
  /* 大文字小文字・区切り違い（"zoom-in" / "ZoomIn" / "zoom in"）を吸収する */
  const flat = raw.toLowerCase().replace(/[\s_-]+/g, "");
  for (let i = 0; i < ICON_NAMES.length; i++) {
    if (ICON_NAMES[i].toLowerCase() === flat) return ICON_NAMES[i];
  }
  const alias = ICON_ALIASES.find((k) => k.toLowerCase().replace(/[\s_-]+/g, "") === flat);
  if (alias && ICONS[ALIASES[alias]]) return ALIASES[alias];
  return FALLBACK;
}

/**
 * その名前の絵を持っているか（別名も真）。
 * @param {string} name
 * @returns {boolean}
 */
export function hasIcon(name) {
  const raw = String(name == null ? "" : name).trim();
  if (!raw) return false;
  return resolveIconName(raw) !== FALLBACK || raw === FALLBACK;
}

/* ── 形 1 つを「タグ名 + 属性」に開く（DOM と文字列で共用）──────────── */

/**
 * @param {string} shape
 * @returns {{ tag: string, attrs: Record<string, string> } | null}
 */
function parseShape(shape) {
  const s = String(shape || "").trim();
  if (!s) return null;
  const head = s[0];
  if (head === "M" || head === "m") return { tag: "path", attrs: { d: s } };

  const parts = s.split(/\s+/);
  const kind = parts[0];
  const n = parts.slice(1);
  if (kind === "c" && n.length >= 3) {
    return { tag: "circle", attrs: { cx: n[0], cy: n[1], r: n[2] } };
  }
  if (kind === "r" && n.length >= 4) {
    /** @type {Record<string, string>} */
    const a = { x: n[0], y: n[1], width: n[2], height: n[3] };
    if (n[4] != null) { a.rx = n[4]; a.ry = n[4]; }
    return { tag: "rect", attrs: a };
  }
  if (kind === "l" && n.length >= 4) {
    return { tag: "line", attrs: { x1: n[0], y1: n[1], x2: n[2], y2: n[3] } };
  }
  if (kind === "p" && n.length >= 2) {
    return { tag: "polyline", attrs: { points: n.join(" ") } };
  }
  return null;
}

/* ── 文字列版（Node でも動く。文字列が要る所＝ innerHTML / template 用）── */

/** 属性値の最低限のくるみ（座標しか入らないが念のため） */
function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * アイコンの SVG を文字列で返す。
 * @param {string} name
 * @param {{ size?: number, stroke?: number, className?: string, title?: string }} [opt]
 * @returns {string} `<svg …>…</svg>`
 */
export function iconHTML(name, opt) {
  const key = resolveIconName(name);
  const o = opt || {};
  const size = Number.isFinite(o.size) && o.size > 0 ? o.size : ICON_GRID;
  const sw = Number.isFinite(o.stroke) && o.stroke > 0 ? o.stroke : ICON_STROKE;
  const cls = "vqs-icon vqs-icon--" + key + (o.className ? " " + o.className : "");

  let body = "";
  const shapes = ICONS[key];
  for (let i = 0; i < shapes.length; i++) {
    const p = parseShape(shapes[i]);
    if (!p) continue;
    let attrs = "";
    for (const k of Object.keys(p.attrs)) attrs += " " + k + '="' + esc(p.attrs[k]) + '"';
    body += "<" + p.tag + attrs + "/>";
  }
  const label = o.title
    ? '><title>' + esc(o.title) + "</title>" + body
    : ' aria-hidden="true">' + body;

  return '<svg xmlns="' + NS + '" class="' + esc(cls) + '" data-icon="' + esc(key) + '"' +
    ' viewBox="0 0 ' + ICON_GRID + " " + ICON_GRID + '" width="' + size + '" height="' + size + '"' +
    ' fill="none" stroke="currentColor" stroke-width="' + sw + '"' +
    ' stroke-linecap="round" stroke-linejoin="round" focusable="false"' +
    (o.title ? ' role="img"' : "") + label + "</svg>";
}

/* ── DOM 版（画面で使う本体）────────────────────────────────────────── */

/** 作った元を取っておき、2 度目からは clone で返す（描画のたびに組み立てない） */
const protoCache = new Map();

/**
 * 元の SVG を 1 つ組み立てる。
 * @param {string} key 正式名
 * @returns {SVGElement}
 */
function buildProto(key) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + ICON_GRID + " " + ICON_GRID);
  svg.setAttribute("width", String(ICON_GRID));
  svg.setAttribute("height", String(ICON_GRID));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(ICON_STROKE));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-icon", key);
  svg.setAttribute("class", "vqs-icon vqs-icon--" + key);

  const shapes = ICONS[key];
  for (let i = 0; i < shapes.length; i++) {
    const p = parseShape(shapes[i]);
    if (!p) continue;
    const el = document.createElementNS(NS, p.tag);
    for (const k of Object.keys(p.attrs)) el.setAttribute(k, p.attrs[k]);
    svg.appendChild(el);
  }
  return svg;
}

/**
 * アイコンを 1 つ作る。**知らない名前でも落ちない**（`dots` が出る）。
 * @param {string} name 例 "play" / "zoomIn"
 * @param {{ size?: number, stroke?: number, className?: string, title?: string }} [opt]
 *        size: px（既定 24）/ stroke: 線の太さ（既定 1.75）/
 *        className: 足す class / title: 読み上げ用の名（付けると aria-hidden を外す）
 * @returns {SVGElement}
 * @throws {Error} document が無い所（Node など）で呼んだとき。
 *         文字列が欲しいだけなら `iconHTML()` を使う。
 */
export function icon(name, opt) {
  if (typeof document === "undefined") {
    throw new Error("icons.icon() は DOM が要る。文字列なら iconHTML() を使う。");
  }
  const key = resolveIconName(name);
  let proto = protoCache.get(key);
  if (!proto) { proto = buildProto(key); protoCache.set(key, proto); }

  const el = /** @type {SVGElement} */ (proto.cloneNode(true));
  const o = opt || {};
  if (Number.isFinite(o.size) && o.size > 0) {
    el.setAttribute("width", String(o.size));
    el.setAttribute("height", String(o.size));
  }
  if (Number.isFinite(o.stroke) && o.stroke > 0) el.setAttribute("stroke-width", String(o.stroke));
  if (o.className) el.setAttribute("class", "vqs-icon vqs-icon--" + key + " " + o.className);
  if (o.title) {
    el.removeAttribute("aria-hidden");
    el.setAttribute("role", "img");
    const t = document.createElementNS(NS, "title");
    t.textContent = String(o.title);
    el.insertBefore(t, el.firstChild);
  }
  return el;
}

/**
 * ボタンの中身をアイコンに差し替える小さな助け（UI がよくやる操作）。
 * @param {Element|null} host 中身を空にして入れる先
 * @param {string} name
 * @param {{ size?: number, stroke?: number, className?: string, title?: string }} [opt]
 * @returns {SVGElement|null} 入れた物（host が無ければ null）
 */
export function setIcon(host, name, opt) {
  if (!host || typeof host.appendChild !== "function") return null;
  const svg = icon(name, opt);
  host.textContent = "";
  host.appendChild(svg);
  return svg;
}

/**
 * 形の定義そのもの（絵の一覧画面や試験が見る。書き換えても本体に影響しない複製）。
 * @param {string} name
 * @returns {string[]|null}
 */
export function iconShapes(name) {
  const key = resolveIconName(name);
  const s = ICONS[key];
  return s ? s.slice() : null;
}
