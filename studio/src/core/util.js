/* ══════════════════════════════════════════════════════════════════════
   core/util.js — 土台の小道具箱（数・色・関数の間引き・環境判定）

   ★ 何をする所か
     VQ Studio の全層（core / engine / export / analysis / ai / ui）が使う
     「どこにも属さない小さな道具」だけを置く。ここは **誰にも依存しない**。
     time.js も log.js も import しない（依存の向きの最下点。契約書 §0）。

   ★ なぜこの形か
     ・数は入口で必ず有限化する。NaN が 1 つ混ざると、その後の変形行列・
       音量・書き出しフレーム数まで黙って全部 NaN になり、画面が真っ黒に
       なるだけで原因が分からない。だから clamp / lerp 系は Number.isFinite
       を見て既定へ落とす（throw しない。毎フレーム呼ばれる所で例外を投げて
       も再生が止まるだけで得が無い）。
     ・色は "#rrggbb" の文字列が保存形式（契約書 §1）の正。計算のときだけ
       0..1 の配列に開き、開けなければ null を返して既定色へ戻させる。
     ・イージングは素の数式だけで書く（GLSL 側へ同じ式を移せるように）。
     ・間引き（throttle/debounce/rafThrottle）は返り値に .cancel() を付ける。
       画面を捨てるときに止められないと、消えた DOM を触って落ちる。

   ★ 触るときの注意
     ・export を消す / 名前を変えると 全モジュールが壊れる（契約書 §3）。
     ・DOM を前提にする関数（cssVar / nextFrame / isTouch 等）は Node の
       試験からも呼ばれる。無い物は throw せず 既定値を返すこと。
     ・deepClone は保存形式（JSON 相当 + Date/Map/Set/バイト列）が通れば良い。
       Blob や DOM は **複製せず参照を共有**する（素材の実体は persist が持つ）。
   ══════════════════════════════════════════════════════════════════════ */

/* ── 0. 有限化（全ての数の入口） ───────────────────────────────── */

/**
 * 有限な数に落とす。NaN / Infinity / 数でない物は fallback。
 * @param {*} v
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function finite(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : (Number.isFinite(fallback) ? fallback : 0);
}

/**
 * min..max に収める。v が NaN なら min、±Infinity なら端へ寄せる。
 * min > max で渡されても入れ替えて扱う（UI の数値入力で逆さに来ることがある）。
 * @param {*} v @param {number} [min=0] @param {number} [max=1] @returns {number}
 */
export function clamp(v, min = 0, max = 1) {
  const a0 = Number.isFinite(min) ? min : 0;
  const b0 = Number.isFinite(max) ? max : 1;
  const lo = a0 <= b0 ? a0 : b0;
  const hi = a0 <= b0 ? b0 : a0;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return lo;
  if (n === Infinity) return hi;
  if (n === -Infinity) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

/** 0..1 に収める（不透明度・比率で多用するので別名を用意） */
export function clamp01(v) { return clamp(v, 0, 1); }

/** 整数に丸めて min..max に収める */
export function clampInt(v, min, max) { return Math.round(clamp(v, min, max)); }

/** 線形補間。t は clamp しない（外挿を使う所があるため）。値は必ず有限。 */
export function lerp(a, b, t) {
  const x = finite(a, 0), y = finite(b, 0), u = finite(t, 0);
  return x + (y - x) * u;
}

/** lerp の逆。a===b のときは 0（0 除算を作らない）。clamp はしない。 */
export function inverseLerp(a, b, v) {
  const x = finite(a, 0), y = finite(b, 0), n = finite(v, 0);
  const d = y - x;
  if (d === 0) return 0;
  return (n - x) / d;
}

/**
 * 範囲の読み替え。clampOut=true で出力側の範囲に収める。
 * @param {number} v @param {number} a1 @param {number} a2 @param {number} b1
 * @param {number} b2 @param {boolean} [clampOut=false]
 */
export function mapRange(v, a1, a2, b1, b2, clampOut = false) {
  const out = lerp(b1, b2, inverseLerp(a1, a2, v));
  return clampOut ? clamp(out, b1, b2) : out;
}

/* ── 1. id ─────────────────────────────────────────────────────── */

let uidSeq = 0;

function randomChars(n) {
  const c = globalThis.crypto;
  let s = "";
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(n);
    c.getRandomValues(buf);
    for (let i = 0; i < n; i++) s += (buf[i] % 36).toString(36);
    return s;
  }
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/**
 * 契約書 §1 の id を作る。`uid("cl")` → "cl_m1x2y3001abc"。
 * 時刻 + 連番 + 乱数。連番が入るので 同じミリ秒で大量に作っても衝突しない。
 * @param {string} [prefix="id"]
 * @returns {string}
 */
export function uid(prefix = "id") {
  const p = String(prefix == null ? "" : prefix).replace(/[^A-Za-z0-9]+$/, "") || "id";
  uidSeq = (uidSeq + 1) % 46656; // 36^3
  const t = Date.now().toString(36);
  const c = uidSeq.toString(36).padStart(3, "0");
  return `${p}_${t}${c}${randomChars(3)}`;
}

/* ── 2. 複製 ───────────────────────────────────────────────────── */

const hasStructuredClone = typeof structuredClone === "function";

/** 複製してはいけない（複製しても意味が無い）実体か */
function isSharedRef(v) {
  const g = globalThis;
  return (
    (g.Blob && v instanceof g.Blob) ||                 // File も Blob の子
    (g.ImageBitmap && v instanceof g.ImageBitmap) ||
    (g.AudioBuffer && v instanceof g.AudioBuffer) ||
    (g.VideoFrame && v instanceof g.VideoFrame) ||
    (g.MediaStream && v instanceof g.MediaStream) ||
    (g.Node && v instanceof g.Node) ||                 // DOM
    (g.Window && v === g.window)
  );
}

/**
 * structuredClone が使えないときの再帰複製（本体）。
 * Date / RegExp / Map / Set / ArrayBuffer / TypedArray / DataView / 配列 /
 * 素のオブジェクト を扱い、循環参照も保つ。class の実体は prototype を
 * 引き継がない（保存形式に class は入れない約束なので それで足りる）。
 * 試験から直に叩けるよう export してある。
 * @template T @param {T} v @param {Map<any,any>} [seen] @returns {T}
 */
export function deepCloneRecursive(v, seen) {
  if (v === null || typeof v !== "object") return v; // 関数もそのまま返す
  const memo = seen || new Map();
  if (memo.has(v)) return memo.get(v);
  if (isSharedRef(v)) return v;

  if (v instanceof Date) return /** @type {any} */ (new Date(v.getTime()));
  if (v instanceof RegExp) {
    const r = new RegExp(v.source, v.flags);
    r.lastIndex = v.lastIndex;
    return /** @type {any} */ (r);
  }
  if (typeof SharedArrayBuffer !== "undefined" && v instanceof SharedArrayBuffer) {
    return v; // 共有が目的の物は共有したまま渡す
  }
  if (v instanceof ArrayBuffer) return /** @type {any} */ (v.slice(0));
  if (ArrayBuffer.isView(v)) {
    if (typeof DataView !== "undefined" && v instanceof DataView) {
      const buf = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
      return /** @type {any} */ (new DataView(buf));
    }
    // TypedArray: 同じ種類で値ごと複製（buffer は共有しない）
    const Ctor = /** @type {any} */ (v).constructor;
    return /** @type {any} */ (new Ctor(/** @type {any} */ (v)));
  }
  if (v instanceof Map) {
    const out = new Map();
    memo.set(v, out);
    for (const [k, val] of v) out.set(deepCloneRecursive(k, memo), deepCloneRecursive(val, memo));
    return /** @type {any} */ (out);
  }
  if (v instanceof Set) {
    const out = new Set();
    memo.set(v, out);
    for (const val of v) out.add(deepCloneRecursive(val, memo));
    return /** @type {any} */ (out);
  }
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    memo.set(v, out);
    for (let i = 0; i < v.length; i++) out[i] = deepCloneRecursive(v[i], memo);
    return /** @type {any} */ (out);
  }
  const out = {};
  memo.set(v, out);
  for (const k of Object.keys(v)) out[k] = deepCloneRecursive(v[k], memo);
  return /** @type {any} */ (out);
}

/**
 * 深い複製。structuredClone を優先し、使えない環境・複製できない値（関数や
 * DOM が混ざった等）では再帰複製へ落ちる。store の履歴（契約書 §3）が毎回
 * 呼ぶので速い道を先に試す。
 * @template T @param {T} v @returns {T}
 */
export function deepClone(v) {
  if (hasStructuredClone) {
    try {
      return structuredClone(v);
    } catch (_e) {
      // DataCloneError（関数 / DOM / Proxy 等）。機能は落とさず再帰版で続ける。
      return deepCloneRecursive(v);
    }
  }
  return deepCloneRecursive(v);
}

/* ── 3. 関数の間引き ───────────────────────────────────────────── */

const nowMs = () =>
  (globalThis.performance && typeof globalThis.performance.now === "function")
    ? globalThis.performance.now()
    : Date.now();

const rafImpl = typeof globalThis.requestAnimationFrame === "function"
  ? globalThis.requestAnimationFrame.bind(globalThis)
  : (cb) => setTimeout(() => cb(nowMs()), 16);
const cafImpl = typeof globalThis.cancelAnimationFrame === "function"
  ? globalThis.cancelAnimationFrame.bind(globalThis)
  : (id) => clearTimeout(id);

/**
 * 先頭は即時、以後 ms ごとに最後の引数で 1 回だけ呼ぶ。
 * @template {(...a:any[])=>any} F @param {F} fn @param {number} [ms=100]
 * @returns {F & { cancel(): void }}
 */
export function throttle(fn, ms = 100) {
  const wait = Math.max(0, finite(ms, 100));
  let last = -Infinity, timer = null, args = null, self = null;
  const fire = () => {
    timer = null;
    last = nowMs();
    const a = args; args = null;
    if (a) fn.apply(self, a);
  };
  const wrapped = function (...a) {
    args = a; self = this;
    const rest = wait - (nowMs() - last);
    if (rest <= 0) { if (timer) { clearTimeout(timer); timer = null; } fire(); return; }
    if (!timer) timer = setTimeout(fire, rest);
  };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; args = null; };
  return /** @type {any} */ (wrapped);
}

/**
 * 最後の呼び出しから ms 静かになってから 1 回呼ぶ。
 * @template {(...a:any[])=>any} F @param {F} fn @param {number} [ms=200]
 * @returns {F & { cancel(): void, flush(): void }}
 */
export function debounce(fn, ms = 200) {
  const wait = Math.max(0, finite(ms, 200));
  let timer = null, args = null, self = null;
  const fire = () => {
    timer = null;
    const a = args; args = null;
    if (a) fn.apply(self, a);
  };
  const wrapped = function (...a) {
    args = a; self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, wait);
  };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; args = null; };
  wrapped.flush = () => { if (timer) { clearTimeout(timer); fire(); } };
  return /** @type {any} */ (wrapped);
}

/**
 * 1 フレームに 1 回へ間引く（タイムラインのドラッグ・スクロール用）。
 * rAF が無い環境（Worker / Node）では 16ms の setTimeout で代用する。
 * @template {(...a:any[])=>any} F @param {F} fn
 * @returns {F & { cancel(): void }}
 */
export function rafThrottle(fn) {
  let id = null, pending = false, args = null, self = null;
  const tick = () => {
    pending = false; id = null;
    const a = args; args = null;
    if (a) fn.apply(self, a);
  };
  const wrapped = function (...a) {
    args = a; self = this;
    if (pending) return;
    pending = true;
    id = rafImpl(tick);
  };
  wrapped.cancel = () => {
    if (pending && id !== null) cafImpl(id);
    pending = false; id = null; args = null;
  };
  return /** @type {any} */ (wrapped);
}

/**
 * 1 回だけ実行し、以後は最初の結果を返す（初期化・警告の 1 回出し用）。
 * @template {(...a:any[])=>any} F @param {F} fn @returns {F}
 */
export function once(fn) {
  let done = false, value;
  return /** @type {any} */ (function (...a) {
    if (!done) { done = true; value = fn.apply(this, a); }
    return value;
  });
}

/** 次の 1 フレームを待つ */
export function nextFrame() {
  return new Promise((resolve) => { rafImpl(() => resolve(undefined)); });
}

/** ms 待つ */
export function sleep(ms) {
  const t = Math.max(0, finite(ms, 0));
  return new Promise((resolve) => { setTimeout(resolve, t); });
}

/* ── 4. 並び・まとめ ───────────────────────────────────────────── */

const identity = (x) => x;

function keyOf(item, keyFn) {
  const k = (keyFn || identity)(item);
  if (typeof k === "number") return Number.isFinite(k) ? k : 0;
  if (typeof k === "string") return k;
  return finite(k, 0);
}

/**
 * 昇順の配列 arr に対し、x を入れられる最も左の位置を返す（Python の
 * bisect_left）。「key < x」の要素の個数。空配列は 0。
 * キーフレームやビート列の探索に使うので O(log n)。
 * @param {any[]} arr @param {number|string} x
 * @param {(item:any)=>number|string} [keyFn]
 * @returns {number}
 */
export function bisect(arr, x, keyFn) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const target = typeof x === "string" ? x : finite(x, 0);
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyOf(arr[mid], keyFn) < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * bisect の右版（同じキーの並びの後ろ側）。「key <= x」の要素の個数。
 * @param {any[]} arr @param {number|string} x
 * @param {(item:any)=>number|string} [keyFn] @returns {number}
 */
export function bisectRight(arr, x, keyFn) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const target = typeof x === "string" ? x : finite(x, 0);
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (target < keyOf(arr[mid], keyFn)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * 昇順を保ったまま挿入する（同じキーは後ろへ = 入れた順が残る）。
 * clip や Keyframe の配列（契約書 §1 不変条件 1・4）を崩さないための道具。
 * arr を直に書き換え、入れた位置を返す。
 * @param {any[]} arr @param {any} item
 * @param {(item:any)=>number|string} [keyFn] @returns {number}
 */
export function sortedInsert(arr, item, keyFn) {
  const i = bisectRight(arr, keyOf(item, keyFn), keyFn);
  arr.splice(i, 0, item);
  return i;
}

/**
 * fn(item) の値でまとめる。Object.groupBy と同じ形（prototype 無しの素の
 * オブジェクト・キーは文字列）を返すので `g["video"]` でも
 * `Object.entries(g)` でも使える。
 * @template T @param {T[]} arr @param {(item:T,i:number)=>any} fn
 * @returns {Record<string, T[]>}
 */
export function groupBy(arr, fn) {
  const out = Object.create(null);
  if (!arr) return out;
  let i = 0;
  for (const item of arr) {
    const k = String(fn ? fn(item, i) : item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
    i++;
  }
  return out;
}

/* ── 5. 見せ方（文字列） ───────────────────────────────────────── */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/**
 * 12345678 → "11.8 MB"。1024 刻み。負や壊れた値は "0 B"。
 * @param {number} n @param {number} [digits] 既定は大きさで変える
 */
export function formatBytes(n, digits) {
  let v = finite(n, 0);
  if (v <= 0) return "0 B";
  let u = 0;
  while (v >= 1024 && u < BYTE_UNITS.length - 1) { v /= 1024; u++; }
  const d = digits === undefined ? (u === 0 ? 0 : v < 10 ? 1 : v < 100 ? 1 : 0) : clampInt(digits, 0, 3);
  return `${v.toFixed(d)} ${BYTE_UNITS[u]}`;
}

/**
 * 秒 → "1:23"（1 時間以上は "1:02:03"）。負は "-1:23"。
 * decimals を 1..3 にすると "1:23.4" のように小数を足す。
 * 端数の繰り上がりで "1:60" にならないよう、整数化してから割る。
 * @param {number} sec @param {{decimals?:number}} [opts]
 * @returns {string}
 */
export function formatDuration(sec, opts) {
  const dec = clampInt(opts && opts.decimals, 0, 3);
  const n = finite(sec, 0);
  const sign = n < 0 ? "-" : "";
  const scale = Math.pow(10, dec);
  const total = Math.round(Math.abs(n) * scale);
  const whole = Math.floor(total / scale);
  const frac = total - whole * scale;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const tail = dec > 0 ? "." + String(frac).padStart(dec, "0") : "";
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, "0")}:${ss}${tail}`;
  return `${sign}${m}:${ss}${tail}`;
}

/** HTML 文字列へ差し込む前の逃がし（ui/* が innerHTML を使う所で必須） */
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── 6. 色 ─────────────────────────────────────────────────────── */

/**
 * "#rrggbb" → [r,g,b]（各 0..1）。"#rgb" "#rgba" "#rrggbbaa" も読む
 * （契約書 §1 の shadow.color は "#0008" のような 4 桁で来る）。
 * 読めなければ **null**（呼び出し側が既定色へ戻せるように。throw しない）。
 * @param {string} hex @returns {[number,number,number]|null}
 */
export function hexToRgb(hex) {
  const rgba = hexToRgba(hex);
  return rgba ? [rgba[0], rgba[1], rgba[2]] : null;
}

/** hexToRgb の α 付き。[r,g,b,a]（各 0..1）。読めなければ null。
 * @param {string} hex @returns {[number,number,number,number]|null} */
export function hexToRgba(hex) {
  if (typeof hex !== "string") return null;
  let s = hex.trim();
  if (s.charCodeAt(0) === 35) s = s.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(s)) return null;
  let r, g, b, a = 255;
  if (s.length === 3 || s.length === 4) {
    r = parseInt(s[0] + s[0], 16); g = parseInt(s[1] + s[1], 16); b = parseInt(s[2] + s[2], 16);
    if (s.length === 4) a = parseInt(s[3] + s[3], 16);
  } else if (s.length === 6 || s.length === 8) {
    r = parseInt(s.slice(0, 2), 16); g = parseInt(s.slice(2, 4), 16); b = parseInt(s.slice(4, 6), 16);
    if (s.length === 8) a = parseInt(s.slice(6, 8), 16);
  } else {
    return null;
  }
  return [r / 255, g / 255, b / 255, a / 255];
}

function hex2(v) {
  const n = clampInt(Math.round(clamp01(v) * 255), 0, 255);
  return n.toString(16).padStart(2, "0");
}

/**
 * [r,g,b]（0..1）または (r,g,b) → "#rrggbb"。範囲外は丸めて収める。
 * @param {number|number[]} r @param {number} [g] @param {number} [b]
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const a = Array.isArray(r) ? r : [r, g, b];
  return `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
}

/**
 * 色の補間（キーフレームの色・グラデーション用）。t は 0..1 に収める。
 * sRGB 値のまま線形に混ぜる（CSS / CapCut と同じ見え方。ガンマ補正込みの
 * 混色は「正しい」が既存の見た目と食い違うので v1 では採らない）。
 * 片方が読めなければ もう片方を、両方駄目なら "#000000"。
 * @param {string} a @param {string} b @param {number} t @returns {string}
 */
export function hexLerp(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  if (!ca && !cb) return "#000000";
  if (!ca) return rgbToHex(/** @type {any} */ (cb));
  if (!cb) return rgbToHex(ca);
  const u = clamp01(t);
  return rgbToHex([
    ca[0] + (cb[0] - ca[0]) * u,
    ca[1] + (cb[1] - ca[1]) * u,
    ca[2] + (cb[2] - ca[2]) * u,
  ]);
}

/* ── 7. イージング ─────────────────────────────────────────────── */

/* 3 次ベジェ（CSS の cubic-bezier と同じ定義。両端は (0,0) と (1,1) 固定）。
   B(u) = 3(1-u)²u·p1 + 3(1-u)u²·p2 + u³  */
function bez1d(u, p1, p2) {
  const v = 1 - u;
  return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
}
function bez1dSlope(u, p1, p2) {
  const v = 1 - u;
  return 3 * v * v * p1 + 6 * v * u * (p2 - p1) + 3 * u * u * (1 - p2);
}

/* x（0..1）から媒介変数 u を解く。Newton 法 4 回で寄せ、残りを二分で
   詰める。x の制御点を 0..1 に縛ってあるので Bx(u) は単調増加 →
   枠（lo,hi）による二分が常に効く。Newton の各回でも枠を締めるので、
   Newton が外れた時点から二分がそのまま続きを引き継げる。

   CONTRACT-NOTE: 指示は「二分 8 回程度」。普通の曲線は Newton が先に返るので
   実際は 0〜数回だが、Bx の傾きが端で 0 になる形（x 制御点が両方 0 等）では
   Newton が 1 歩も進めず枠が 0..1 のまま残り、8 回では値が 0.5% ずれた（実測
   5.2e-3）。そこで **枠が 1e-9 まで詰まるか 32 回**で打ち切る形にした。 */
function solveBezierU(x, p1x, p2x) {
  let lo = 0, hi = 1, u = x;
  for (let i = 0; i < 4; i++) {
    const e = bez1d(u, p1x, p2x) - x;
    if (Math.abs(e) < 1e-9) return u;
    if (e > 0) hi = u; else lo = u;
    const d = bez1dSlope(u, p1x, p2x);
    if (!(Math.abs(d) > 1e-6)) break;
    const next = u - e / d;
    if (!(next > lo && next < hi)) break;
    u = next;
  }
  for (let i = 0; i < 32 && hi - lo > 1e-9; i++) {
    u = (lo + hi) / 2;
    const e = bez1d(u, p1x, p2x) - x;
    if (Math.abs(e) < 1e-9) return u;
    if (e > 0) hi = u; else lo = u;
  }
  return (lo + hi) / 2;
}

/**
 * イージング関数の一覧（契約書 §2 の Keyframe.ease と同じ名前）。
 * どれも f(0)=0, f(1)=1 の単調な関数（hold だけは階段）。
 */
export const EASE = {
  /** そのまま */
  linear: (t) => clamp01(t),
  /** ゆっくり始まる（3 次） */
  in: (t) => { const u = clamp01(t); return u * u * u; },
  /** ゆっくり終わる */
  out: (t) => { const u = 1 - clamp01(t); return 1 - u * u * u; },
  /** 両端ゆっくり */
  inout: (t) => {
    const u = clamp01(t);
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  },
  /** 次のキーまで値を保つ（階段。動画編集の "hold" キーフレーム） */
  hold: (t) => (clamp01(t) >= 1 ? 1 : 0),
  /**
   * CSS の cubic-bezier(p1x,p1y,p2x,p2y) 相当の関数を作る。
   * x の制御点は 0..1 に縛る（縛らないと x が単調でなくなり逆関数が定まらない）。
   * y は 0..1 の外へ出しても良い（跳ねる動きを作れる）。
   * @param {number} p1x @param {number} p1y @param {number} p2x @param {number} p2y
   * @returns {(t:number)=>number}
   */
  cubicBezier(p1x, p1y, p2x, p2y) {
    const ax = clamp01(p1x), bx = clamp01(p2x);
    const ay = finite(p1y, 0), by = finite(p2y, 0);
    if (ax === ay && bx === by) return EASE.linear; // 直線は解かずに済ませる
    return (t) => {
      const x = clamp01(t);
      if (x === 0 || x === 1) return x;
      return bez1d(solveBezierU(x, ax, bx), ay, by);
    };
  },
};

/* CONTRACT-NOTE: 契約書 §3 の一覧では `easeFns` という名前で載っている。
   §2 の Keyframe.ease と同じ語で呼べる方が読みやすいので本体は `EASE` に
   置き、`easeFns` を同じ物への別名として export する（どちらで import
   しても動く）。 */
export const easeFns = EASE;

/**
 * Keyframe の ease（と bezier のときの bez）から関数を引く。
 * core/eval.js の sampleKey から呼ぶための一本化。
 * 知らない名前は linear へ落とす（保存形式が新しくても再生は止めない）。
 * @param {string} [ease] @param {number[]} [bez]
 * @returns {(t:number)=>number}
 */
export function easeFor(ease, bez) {
  if (ease === "bezier") {
    const b = Array.isArray(bez) ? bez : [];
    return EASE.cubicBezier(
      finite(b[0], 0.25), finite(b[1], 0.1), finite(b[2], 0.25), finite(b[3], 1)
    );
  }
  const f = ease && Object.prototype.hasOwnProperty.call(EASE, ease) ? EASE[ease] : null;
  return typeof f === "function" && ease !== "cubicBezier" ? f : EASE.linear;
}

/* ── 8. 環境（無い物は false / 既定値。Node でも落ちない） ─────── */

const env = { ios: null, touch: null, safari: null };

function ua() {
  try {
    const n = globalThis.navigator;
    return n && typeof n.userAgent === "string" ? n.userAgent : "";
  } catch (_e) { return ""; }
}

/**
 * iOS / iPadOS か。iPadOS 13 以降は UA が Mac を名乗るので、
 * "MacIntel + 触れる" も iOS 扱いにする（契約書 §4 の同時再生本数の制限は
 * iPad でも同じように当たるため）。
 */
export function isIOS() {
  if (env.ios === null) {
    const s = ua();
    let macTouch = false;
    try {
      const n = globalThis.navigator;
      macTouch = !!n && n.platform === "MacIntel" && (n.maxTouchPoints || 0) > 1;
    } catch (_e) { macTouch = false; }
    env.ios = /iPad|iPhone|iPod/.test(s) || macTouch;
  }
  return env.ios;
}

/** 触れる端末か（当たり判定を 44px にするか等の判断に使う） */
export function isTouch() {
  if (env.touch === null) {
    let v = false;
    try {
      const n = globalThis.navigator;
      v = ("ontouchstart" in globalThis) || (!!n && (n.maxTouchPoints || 0) > 0);
    } catch (_e) { v = false; }
    env.touch = v;
  }
  return env.touch;
}

/** Safari（Chrome/Edge/Firefox の iOS 版は除く）。書き出しの当たり外れが違う */
export function isSafari() {
  if (env.safari === null) {
    const s = ua();
    env.safari = /Safari/.test(s) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//.test(s);
  }
  return env.safari;
}

/**
 * CSS 変数（styles/tokens.css）を読む。DOM が無ければ fallback。
 * name は "--vq-bg" でも "vq-bg" でも良い。
 * @param {string} name @param {string} [fallback=""] @returns {string}
 */
export function cssVar(name, fallback = "") {
  const raw = String(name == null ? "" : name).trim();
  const key = raw.startsWith("--") ? raw : `--${raw}`;
  try {
    const doc = globalThis.document;
    const root = doc && doc.documentElement;
    if (!root || typeof globalThis.getComputedStyle !== "function") return fallback;
    const v = globalThis.getComputedStyle(root).getPropertyValue(key);
    return v && v.trim() ? v.trim() : fallback;
  } catch (_e) {
    return fallback;
  }
}
