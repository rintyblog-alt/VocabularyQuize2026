/* ══════════════════════════════════════════════════════════════════════
   ui/widgets.js — 画面の共通部品（契約書 §7.3）

   ★ 何をする所か
     シート・ダイアログ・トースト・メニュー・スライダー・色・カーブ…
     **他の UI 全部がここだけを使う**。ここが落ちると画面が全部死ぬので、
     この中では「外の物が無くても動く」ことを最優先にしている。

   ★ なぜこの形か
     ・見た目は CSS クラス任せ（`vqs-` 接頭辞）。この JS は骨組みだけ作る。
       CSS がまだ無い段階でも指で押せるように、**構造だけの控えの CSS** を
       <head> の先頭へ 1 回だけ差し込む（先頭に入れるので styles/widgets.css が
       後から必ず勝つ）。
     ・DOM は `createElement` + `textContent` で素直に作る。
       **innerHTML にユーザーの文字を入れない**（プロジェクト名・素材名が
       そのまま入る場所なので、ここを崩すと全部崩れる）。
     ・触るのは Pointer Events + `setPointerCapture` に一本化。
       `pointercancel`（iOS は電話・通知で普通に来る）で必ず状態を戻す。
     ・`icons.js` / `caps.js` / `log.js` は **動的 import**。並行して書かれていて
       まだ無い・壊れている可能性があるが、widgets は絶対に落とせない。

   ★ 触るときの注意
     ・CONTRACT-NOTE（返り値）: 契約書 §7.3 は `slider`/`segmented`/`colorField` 等が
       `HTMLElement` を返すと書き、依頼書は `{el,set,destroy}` を返すと書いていて
       食い違う。実物（ui/inspector/index.js の `tryW`、ui/mobile.js）は
       **「Node が返る」か「.el に Node が入る」かの両方**を見ているので、
       ここでは **根の要素そのものに `el`(自分自身) / `set` / `destroy` / `update` /
       `vqsSet` を生やして返す**。どちらの書き方でも通る。
       `vqsSet(v, mixed)` は inspector の `writeInto` 用の別名。
     ・CONTRACT-NOTE（行数）: 共通前提の「700 行で分割」を超えるが、担当は
       このファイル 1 本だけ（他人のファイルを作らない約束）なので 1 本に収めた。
       節の見出し（── 数字 ──）で切ってあるので、後で機械的に分割できる。
     ・`onCommit` は依頼書の名前。実物の呼び側は `onChange` を渡してくるので
       **両方受ける**。同じく `onSelect`/`onClick`、`value`/`id` も両方見る。
   ══════════════════════════════════════════════════════════════════════ */

/* ── 0. 外の物は「在れば使う」（動的 import・落ちない）───────────────── */

/** @type {{icon?:Function}|null} */
let ICONS = null;
/** @type {{haptic?:Function, caps?:Function, guardGestures?:Function}|null} */
let CAPS = null;
/** @type {{warn?:Function}|null} */
let LOG = null;

/* 読めたら使う。読めなくても黙って控えで進む（console は使わない約束）。 */
try {
  import("./icons.js").then((m) => { if (m && typeof m.icon === "function") ICONS = m; }).catch(() => { });
  import("../core/caps.js").then((m) => { CAPS = m || null; }).catch(() => { });
  import("../core/log.js").then((m) => { LOG = m || null; }).catch(() => { });
} catch (e) { /* import() が無い器（古い Safari）でも先へ進む */ }

/** 困った事を残す（log.js が在ればそこへ。無ければ黙る） */
function note(msg, err) {
  if (LOG && typeof LOG.warn === "function") {
    try { LOG.warn("widgets", msg, err && err.message ? err.message : err); } catch (e) { /* noop */ }
  }
}

/** 呼び側の関数で例外が出ても widgets は死なない */
function call(fn, ...args) {
  if (typeof fn !== "function") return undefined;
  try { return fn(...args); } catch (e) { note("呼び側で例外", e); return undefined; }
}

/* ── 1. 小さな道具 ─────────────────────────────────────────────── */

const DOC = typeof document !== "undefined" ? document : null;

/** @returns {HTMLElement} */
function mk(tag, cls, text) {
  const n = DOC.createElement(tag || "div");
  if (cls) n.className = cls;
  if (text !== undefined && text !== null && text !== "") n.textContent = String(text);
  return n;
}

/** 押せる物（type を必ず付ける。form の中で勝手に submit しないため） */
function mkBtn(cls, text, aria) {
  const b = mk("button", cls, text);
  b.type = "button";
  if (aria) b.setAttribute("aria-label", aria);
  touchable(b);
  return b;
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** 端末が指か（caps が無い段階でも自力で見る） */
function isTouch() {
  if (CAPS && typeof CAPS.caps === "function") {
    try { return !!CAPS.caps().touch; } catch (e) { /* 下へ */ }
  }
  if (typeof navigator === "undefined") return false;
  return (navigator.maxTouchPoints || 0) > 0 || (typeof window !== "undefined" && "ontouchstart" in window);
}

/** 触り所を 44px 以上に（CSS がまだ無くても指で押せること＝契約書 §13.4） */
function touchable(node) {
  if (node && node.style && isTouch()) { node.style.minHeight = "44px"; node.style.minWidth = "44px"; }
  return node;
}

/** listener をまとめて外せる袋 */
function binder() {
  const bag = [];
  return {
    on(t, ev, fn, opt) {
      if (!t || !t.addEventListener) return;
      t.addEventListener(ev, fn, opt);
      bag.push(() => { try { t.removeEventListener(ev, fn, opt); } catch (e) { /* noop */ } });
    },
    add(undo) { if (typeof undo === "function") bag.push(undo); },
    off() { while (bag.length) { const u = bag.pop(); try { u(); } catch (e) { /* noop */ } } }
  };
}

/**
 * 返り値の作法をここ 1 箇所に集める（CONTRACT-NOTE 参照）。
 * 根の要素に el/set/destroy/update/vqsSet を生やして返す。
 * @template {HTMLElement} T
 * @param {T} node
 * @param {{set?:Function, destroy?:Function, update?:Function}} api
 * @returns {T}
 */
function pack(node, api) {
  const a = api || {};
  try {
    node.el = node;
    if (a.set) {
      node.set = a.set;
      node.vqsSet = (v, mixed) => { try { a.set(v, mixed); } catch (e) { note("set", e); } };
    }
    if (a.update) node.update = a.update;
    node.destroy = () => { try { if (a.destroy) a.destroy(); } catch (e) { note("destroy", e); } };
  } catch (e) { note("pack", e); }
  return node;
}

/** 文字列 or {value,label} or {id,label} or [value,label] を {value,label,...} に揃える */
function normItem(it, i) {
  if (it === null || it === undefined) return { value: String(i), label: "" };
  if (Array.isArray(it)) return { value: it[0], label: it[1] === undefined ? String(it[0]) : String(it[1]) };
  if (typeof it === "object") {
    const v = it.value !== undefined ? it.value : (it.id !== undefined ? it.id : i);
    return Object.assign({}, it, { value: v, label: it.label === undefined ? String(v) : String(it.label) });
  }
  return { value: it, label: String(it) };
}

/** 数を見せる文字にする */
function fmtVal(v, o) {
  const c = o || {};
  if (typeof c.format === "function") { const r = call(c.format, v); if (r !== undefined && r !== null) return String(r); }
  const p = c.precision === undefined || c.precision === null
    ? (Math.abs(num(c.step, 1)) >= 1 ? 0 : 2)
    : clamp(num(c.precision, 1) | 0, 0, 6);
  let s = num(v, 0).toFixed(p);
  if (p > 0) s = s.replace(/\.?0+$/, "") || "0";
  return s + (c.unit ? String(c.unit) : "");
}

/* ── 2. 控えの CSS（構造だけ・styles/widgets.css が後から勝つ）──────── */

const BASE_CSS = `
.vqs-host{position:fixed;inset:0;pointer-events:none;z-index:60}
.vqs-host>*{pointer-events:auto}
.vqs-veil{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.vqs-sheet{position:absolute;left:0;right:0;bottom:0;max-height:92dvh;display:flex;flex-direction:column;
  background:#15181d;color:#e8ecf1;border-radius:14px 14px 0 0;box-shadow:0 -8px 32px rgba(0,0,0,.5);
  padding-bottom:env(safe-area-inset-bottom,0px);will-change:transform;touch-action:none}
.vqs-sheet__grip,.vqs-sheet__grab{flex:0 0 auto;height:28px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:grab}
.vqs-sheet__grip i,.vqs-sheet__grab i{display:block;width:44px;height:4px;border-radius:2px;background:#5a626d}
.vqs-sheet__head,.vqs-modal__head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:2px 12px 8px}
.vqs-sheet__title,.vqs-modal__title{flex:1 1 auto;font-weight:700;font-size:15px}
.vqs-sheet__body,.vqs-modal__body{flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 12px 10px}
.vqs-sheet__acts,.vqs-modal__acts{flex:0 0 auto;display:flex;gap:8px;justify-content:flex-end;padding:8px 12px 12px}
.vqs-modal{position:absolute;inset:0;display:grid;place-items:center;padding:16px}
.vqs-modal__panel{display:flex;flex-direction:column;width:min(92vw,560px);max-height:88dvh;
  background:#15181d;color:#e8ecf1;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.55)}
.vqs-act{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #2c323b;background:#1d2229;color:#e8ecf1;font-size:14px}
.vqs-act--primary{background:#2f6df6;border-color:#2f6df6;color:#fff}
.vqs-act--danger{background:#c8353a;border-color:#c8353a;color:#fff}
#toastHost{display:flex;flex-direction:column-reverse;align-items:center;justify-content:flex-end;gap:8px;
  padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}
.vqs-toast{display:flex;align-items:center;gap:10px;max-width:min(92vw,520px);padding:10px 14px;border-radius:10px;
  background:#22272e;color:#e8ecf1;box-shadow:0 6px 24px rgba(0,0,0,.45);font-size:14px}
.vqs-toast--error{background:#5a1d20}.vqs-toast--warn{background:#5a4318}.vqs-toast--ok{background:#1d4a2c}
.vqs-toast__act{min-height:36px;padding:0 10px;border-radius:8px;border:1px solid #4a525d;background:transparent;color:inherit;font-weight:700}
.vqs-menu{position:absolute;min-width:180px;max-height:70dvh;overflow:auto;padding:6px;border-radius:10px;
  background:#1b2027;color:#e8ecf1;box-shadow:0 10px 32px rgba(0,0,0,.5)}
.vqs-menu__item{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:0 10px;border:0;border-radius:8px;
  background:transparent;color:inherit;font-size:14px;text-align:left}
.vqs-menu__item--danger{color:#ff8a8f}
.vqs-menu__item--disabled{opacity:.45}
.vqs-menu__label{flex:1 1 auto}
.vqs-menu__sk,.vqs-menu__key{opacity:.55;font-size:12px}
.vqs-menu__sep{height:1px;margin:4px 6px;background:#2c323b}
.vqs-slider{display:flex;align-items:center;gap:8px;min-height:44px}
.vqs-slider__label{flex:0 0 auto;font-size:12px;opacity:.8}
.vqs-slider__wrap{position:relative;flex:1 1 auto;min-width:0}
.vqs-slider__rail{position:relative;display:block;width:100%;height:44px;touch-action:none}
.vqs-slider__rail::before{content:"";position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;border-radius:2px;background:#333a44}
.vqs-slider__fill{position:absolute;top:50%;height:4px;margin-top:-2px;border-radius:2px;background:#2f6df6}
.vqs-slider__knob{position:absolute;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.vqs-slider__center{position:absolute;top:50%;width:2px;height:12px;margin-top:-6px;background:#7a8492}
.vqs-slider__bubble{position:absolute;bottom:100%;transform:translateX(-50%);padding:2px 6px;border-radius:6px;
  background:#0c0f13;font-size:12px;white-space:nowrap;opacity:0;pointer-events:none}
.vqs-slider--dragging .vqs-slider__bubble{opacity:1}
.vqs-slider__val{flex:0 0 auto;min-width:3.5em;text-align:right;font-size:12px;font-variant-numeric:tabular-nums}
.vqs-numdrag{display:flex;align-items:center;gap:6px;min-height:44px}
.vqs-numdrag__label{font-size:12px;opacity:.8;cursor:ew-resize;touch-action:none;user-select:none}
.vqs-numdrag__input{width:5.5em;min-height:36px;border-radius:8px;border:1px solid #2c323b;background:#12161b;color:inherit;
  padding:0 6px;font-variant-numeric:tabular-nums}
.vqs-color{display:flex;align-items:center;gap:8px;position:relative}
.vqs-color__swatch,.vqs-color__sw{width:44px;height:28px;border-radius:6px;border:1px solid #3a424e}
.vqs-color__hex{width:8em;min-height:36px;border-radius:8px;border:1px solid #2c323b;background:#12161b;color:inherit;padding:0 6px}
.vqs-color__pop,.vqs-picker{position:absolute;z-index:1;top:calc(100% + 6px);left:0;width:232px;padding:10px;border-radius:10px;
  background:#1b2027;box-shadow:0 10px 32px rgba(0,0,0,.5)}
.vqs-color__sv,.vqs-picker__sv{position:relative;height:132px;border-radius:8px;touch-action:none}
.vqs-color__cursor,.vqs-picker__dot{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6)}
.vqs-color__bar{position:relative;height:20px;margin-top:10px;border-radius:10px;touch-action:none}
.vqs-color__bar-knob{position:absolute;top:50%;width:14px;height:24px;margin:-12px 0 0 -7px;border-radius:4px;border:2px solid #fff}
.vqs-seg{display:inline-flex;gap:2px;padding:2px;border-radius:10px;background:#12161b}
.vqs-seg__item,.vqs-seg__btn{min-height:40px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:#aeb6c1;font-size:13px}
.vqs-seg__item--on,.vqs-seg__btn--on{background:#2f6df6;color:#fff}
.vqs-toggle{display:flex;align-items:center;gap:10px;min-height:44px}
.vqs-toggle__label{flex:1 1 auto;font-size:14px}
.vqs-toggle__switch,.vqs-toggle__box{flex:0 0 auto;width:48px;height:28px;border-radius:14px;border:0;background:#333a44;position:relative}
.vqs-toggle__switch i,.vqs-toggle__box i{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .14s}
.vqs-toggle--on .vqs-toggle__switch,.vqs-toggle--on .vqs-toggle__box{background:#2f6df6}
.vqs-toggle--on .vqs-toggle__switch i,.vqs-toggle--on .vqs-toggle__box i{left:23px}
.vqs-stepper{display:flex;align-items:center;gap:6px}
.vqs-stepper__btn{width:44px;min-height:44px;border-radius:8px;border:1px solid #2c323b;background:#1d2229;color:inherit;font-size:18px}
.vqs-stepper__input{width:4.5em;min-height:36px;text-align:center;border-radius:8px;border:1px solid #2c323b;background:#12161b;color:inherit}
.vqs-select,.vqs-field__input,.vqs-field__area,.vqs-textfield__el,.vqs-textarea__el,.vqs-select__el{width:100%;min-height:44px;border-radius:8px;border:1px solid #2c323b;
  background:#12161b;color:inherit;padding:0 8px;font-size:15px}
.vqs-field__area,.vqs-textarea__el{min-height:88px;padding:8px;resize:vertical}
.vqs-field,.vqs-textfield,.vqs-textarea{display:flex;flex-direction:column;gap:4px;margin:6px 0}
.vqs-field__label,.vqs-textfield__label,.vqs-textarea__label{font-size:12px;opacity:.8}
.vqs-tabs{display:flex;gap:4px;overflow-x:auto}
.vqs-tab{min-height:40px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:#aeb6c1;font-size:13px;white-space:nowrap}
.vqs-tab--on{color:#fff;border-bottom-color:#2f6df6}
.vqs-acc__head{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;border:0;background:transparent;color:inherit;font-size:14px;text-align:left}
.vqs-acc__body{display:none;padding:2px 0 8px}
.vqs-acc__sec--open>.vqs-acc__body,.vqs-acc--open>.vqs-acc__body{display:block}
.vqs-curve{position:relative;width:100%;aspect-ratio:1/1;max-height:220px;touch-action:none}
.vqs-curve svg{display:block;width:100%;height:100%}
.vqs-kfrow{display:flex;align-items:center;gap:8px;min-height:44px}
.vqs-kfrow__label{flex:0 0 auto;font-size:12px;opacity:.8}
.vqs-kfrow__track{position:relative;flex:1 1 auto;height:28px;border-radius:6px;background:#12161b}
.vqs-kfrow__key{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border:0;padding:0;
  background:#e8ecf1;transform:rotate(45deg);border-radius:2px}
.vqs-kfrow__key--on{background:#2f6df6}
.vqs-kfrow__btn{flex:0 0 auto;width:44px;min-height:44px;border:0;background:transparent;color:inherit}
.vqs-ring{display:inline-block}
.vqs-spinner,.vqs-spin{display:inline-block;width:20px;height:20px;border-radius:50%;border:2px solid #3a424e;border-top-color:#2f6df6;animation:vqs-spin .8s linear infinite}
@keyframes vqs-spin{to{transform:rotate(360deg)}}
.vqs-meter{position:relative;height:6px;border-radius:3px;background:#12161b;overflow:hidden}
.vqs-meter__fill{position:absolute;left:0;top:0;bottom:0;background:#3ecb7a}
.vqs-tip{position:absolute;z-index:1;padding:4px 8px;border-radius:6px;background:#0c0f13;color:#e8ecf1;font-size:12px;white-space:nowrap}
.vqs-tip__sk{opacity:.6;margin-left:6px}
.vqs-dropzone--over,.vqs-drop--over{outline:2px dashed #2f6df6;outline-offset:-4px}
.vqs-ico--text{display:inline-flex;align-items:center;justify-content:center;min-width:1.25em;font-size:13px}
.vqs-flash{animation:vqs-flash .09s steps(2,end) 2}
@keyframes vqs-flash{50%{filter:brightness(1.9)}}
@media (prefers-reduced-motion:reduce){.vqs-spinner{animation-duration:2s}.vqs-flash{animation:none}}
`;

let cssDone = false;
/** 控えの CSS を <head> の**先頭**へ 1 回だけ（後の styles/widgets.css が勝つ） */
function ensureCss() {
  if (cssDone || !DOC || !DOC.head) return;
  cssDone = true;
  try {
    if (DOC.getElementById("vqs-widgets-base")) return;
    const s = DOC.createElement("style");
    s.id = "vqs-widgets-base";
    s.textContent = BASE_CSS;
    DOC.head.insertBefore(s, DOC.head.firstChild);
  } catch (e) { note("控えの CSS を入れられなかった", e); }
}

/* ── 3. 置き場（#sheetHost 等）と重なりの札 ───────────────────────── */

/**
 * 置き場を返す（無ければ作って body へ足す。順番 = 重なり順）
 * @param {string} hostId
 * @returns {HTMLElement|null}
 */
export function host(hostId) {
  if (!DOC) return null;
  ensureCss();
  const id = String(hostId || "sheetHost");
  let n = DOC.getElementById(id);
  if (!n) {
    n = mk("div", "vqs-host");
    n.id = id;
    n.setAttribute("data-test", id);
    try { DOC.body.appendChild(n); } catch (e) { return null; }
  }
  if (!n.classList.contains("vqs-host")) n.classList.add("vqs-host");
  return n;
}

/** #sheetHost 等へ入れる小道具 */
export function mount(hostId, el) {
  const h = host(hostId);
  if (!h || !el) return null;
  h.appendChild(el);
  return el;
}

/** 置き場を空にする（中の destroy も呼ぶ） */
export function clearHost(hostId) {
  const h = DOC ? DOC.getElementById(String(hostId || "")) : null;
  if (!h) return;
  const kids = Array.prototype.slice.call(h.children);
  for (const k of kids) {
    if (typeof k.destroy === "function") { try { k.destroy(); } catch (e) { /* noop */ } }
    try { k.remove(); } catch (e) { /* noop */ }
  }
}

/* Esc は「一番上の層」だけが受ける（重ねても正しく 1 枚ずつ閉じる） */
const layers = [];
let escBound = false;
function pushLayer(layer) {
  layers.push(layer);
  if (escBound || !DOC) return;
  escBound = true;
  DOC.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !layers.length) return;
    const top = layers[layers.length - 1];
    if (top && top.dismissable === false) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (top) call(top.close, "esc");
  }, true);
}
function popLayer(layer) {
  const i = layers.lastIndexOf(layer);
  if (i >= 0) layers.splice(i, 1);
}

/** 焦点を中へ閉じ込める（modal 用）。返り値で解除 */
function trapFocus(el) {
  const b = binder();
  const prev = DOC && DOC.activeElement;
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const list = () => Array.prototype.slice.call(el.querySelectorAll(sel)).filter((n) => n.offsetParent !== null || n === DOC.activeElement);
  b.on(el, "keydown", (ev) => {
    if (ev.key !== "Tab") return;
    const items = list();
    if (!items.length) { ev.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const cur = DOC.activeElement;
    if (ev.shiftKey && (cur === first || !el.contains(cur))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (cur === last || !el.contains(cur))) { ev.preventDefault(); first.focus(); }
  });
  /* 外から焦点が飛び込んで来たら引き戻す */
  b.on(DOC, "focusin", (ev) => {
    if (!el.isConnected) return;
    if (!el.contains(ev.target)) {
      const items = list();
      if (items.length) items[0].focus();
    }
  }, true);
  setTimeout(() => {
    const items = list();
    const target = el.querySelector("[autofocus]") || items[0] || el;
    try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (e2) { /* noop */ } }
  }, 0);
  return () => {
    b.off();
    if (prev && typeof prev.focus === "function" && prev.isConnected) {
      try { prev.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
  };
}

/* ── 4. アイコン（icons.js が在れば線画・無ければ小さな文字）─────────── */

/** 文字での代替（画面が空白にならないことが目的） */
const ICON_TEXT = {
  close: "×", check: "✓", chevron: "›", "chevron-down": "⌄", "chevron-up": "⌃",
  plus: "＋", minus: "−", undo: "↶", redo: "↷", play: "▶", pause: "⏸",
  trash: "🗑", copy: "⧉", cut: "✂", split: "⌗", keyframe: "◆", menu: "⋯",
  home: "⌂", export: "⤓", ai: "✦", volume: "♪", eye: "◉", lock: "🔒",
  search: "⌕", settings: "⚙", warn: "⚠", info: "i", error: "!", ok: "✓",
  grab: "≡", color: "◐", text: "T", image: "▣", video: "▷", audio: "♫"
};

/**
 * アイコン。icons.js が在ればそれ、無ければ小さな文字で代替する。
 * @param {string} name
 * @returns {Element}
 */
export function icon(name) {
  const key = String(name || "");
  if (ICONS && typeof ICONS.icon === "function") {
    try {
      const g = ICONS.icon(key);
      if (g && g.nodeType === 1) return g;
    } catch (e) { /* 文字へ落ちる */ }
  }
  const sp = mk("span", "vqs-ico vqs-ico--text", ICON_TEXT[key] || (key ? key.slice(0, 1) : "•"));
  sp.setAttribute("aria-hidden", "true");
  return sp;
}

/* ── 5. 触覚（caps.js の haptic へ一本化）───────────────────────── */

/**
 * 触覚。iOS には振動が無いので **必ず視覚の合図を添える**（契約書 §13.4）。
 * @param {number} [ms]
 * @param {HTMLElement} [visualEl] 明滅させる要素
 */
export function vibrate(ms, visualEl) {
  const d = clamp(num(ms, 8), 1, 200);
  if (CAPS && typeof CAPS.haptic === "function") {
    try { CAPS.haptic(d, visualEl || null); return; } catch (e) { /* 下へ */ }
  }
  /* caps.js がまだ無いときの控え（同じ作法: 振動 + 60ms の明滅） */
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(d);
  } catch (e) { /* noop */ }
  if (visualEl && visualEl.classList) {
    visualEl.classList.add("vqs-flash");
    setTimeout(() => { try { visualEl.classList.remove("vqs-flash"); } catch (e) { /* noop */ } }, 90);
  }
}

/* ── 6. ジェスチャ（Pointer Events + setPointerCapture）─────────────
   pointercancel（iOS は通知・電話で普通に来る）で必ず状態を戻すのが要点。 */

/**
 * ドラッグ。返り値は解除関数。
 * @param {HTMLElement} el
 * @param {{onStart?:Function,onMove?:Function,onEnd?:Function,threshold?:number,
 *          passive?:boolean,button?:number}} o
 * @returns {()=>void}
 */
export function drag(el, o) {
  const c = o || {};
  if (!el) return () => { };
  const b = binder();
  let id = null;
  let x0 = 0;
  let y0 = 0;
  let lx = 0;
  let ly = 0;
  let live = false;
  const thr = num(c.threshold, 0);

  const info = (ev) => ({
    x: ev.clientX, y: ev.clientY,
    dx: ev.clientX - x0, dy: ev.clientY - y0,
    mx: ev.clientX - lx, my: ev.clientY - ly,
    ev
  });

  b.on(el, "pointerdown", (ev) => {
    if (id !== null) return;
    if (ev.button !== undefined && ev.button > num(c.button, 0)) return;
    id = ev.pointerId;
    x0 = lx = ev.clientX;
    y0 = ly = ev.clientY;
    live = thr <= 0;
    try { el.setPointerCapture(id); } catch (e) { /* 取れなくても続ける */ }
    if (live) call(c.onStart, info(ev));
    /* preventDefault は「掴んだ後」に置く（ここで止めないと iOS が画面を引っ張る） */
    if (c.passive !== true && ev.cancelable) ev.preventDefault();
  }, { passive: false });

  b.on(el, "pointermove", (ev) => {
    if (ev.pointerId !== id) return;
    if (!live) {
      if (Math.abs(ev.clientX - x0) < thr && Math.abs(ev.clientY - y0) < thr) return;
      live = true;
      call(c.onStart, info(ev));
    }
    if (c.passive !== true && ev.cancelable) ev.preventDefault();
    call(c.onMove, info(ev));
    lx = ev.clientX;
    ly = ev.clientY;
  }, { passive: false });

  const finish = (ev, cancelled) => {
    if (ev.pointerId !== id) return;
    const i = info(ev);
    i.cancelled = !!cancelled;
    try { el.releasePointerCapture(id); } catch (e) { /* noop */ }
    id = null;
    if (live) { live = false; call(c.onEnd, i); }
  };
  b.on(el, "pointerup", (ev) => finish(ev, false));
  b.on(el, "pointercancel", (ev) => finish(ev, true));
  b.on(el, "lostpointercapture", (ev) => { if (ev.pointerId === id) finish(ev, true); });

  return () => b.off();
}

/**
 * 長押し（既定 320ms・8px 動いたら破棄＝契約書 §13.5 の作法）。
 * @returns {()=>void} 解除
 */
export function longPress(el, fn, o) {
  const c = o || {};
  if (!el) return () => { };
  const ms = num(c.ms, 320);
  const move = num(c.move, 8);
  const b = binder();
  let timer = null;
  let sx = 0;
  let sy = 0;
  let id = null;
  const kill = () => { if (timer) { clearTimeout(timer); timer = null; } id = null; };
  b.on(el, "pointerdown", (ev) => {
    if (id !== null) return;
    id = ev.pointerId;
    sx = ev.clientX;
    sy = ev.clientY;
    timer = setTimeout(() => {
      timer = null;
      vibrate(12, el);
      call(fn, ev);
    }, ms);
  }, { passive: true });
  b.on(el, "pointermove", (ev) => {
    if (ev.pointerId !== id || !timer) return;
    if (Math.abs(ev.clientX - sx) > move || Math.abs(ev.clientY - sy) > move) kill();
  }, { passive: true });
  b.on(el, "pointerup", kill, { passive: true });
  b.on(el, "pointercancel", kill, { passive: true });
  b.on(el, "contextmenu", (ev) => { if (isTouch()) ev.preventDefault(); });
  return () => { kill(); b.off(); };
}

/**
 * ピンチ（2 本指）。WebKit の gesture* も塞ぐ（契約書 §13.4）。
 * onPinch({scale, delta, cx, cy, phase}) phase = "start"|"move"|"end"
 * @returns {()=>void} 解除
 */
export function pinch(el, o) {
  const c = o || {};
  if (!el) return () => { };
  const b = binder();
  const pts = new Map();
  let base = 0;
  let last = 1;
  const dist = () => {
    const a = Array.from(pts.values());
    if (a.length < 2) return 0;
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  const center = () => {
    const a = Array.from(pts.values());
    if (a.length < 2) return { cx: 0, cy: 0 };
    return { cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
  };
  b.on(el, "pointerdown", (ev) => {
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2) {
      base = dist();
      last = 1;
      const k = center();
      call(c.onPinch, { scale: 1, delta: 1, cx: k.cx, cy: k.cy, phase: "start" });
    }
  }, { passive: true });
  b.on(el, "pointermove", (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size < 2 || base <= 0) return;
    if (ev.cancelable) ev.preventDefault();
    const d = dist();
    if (d <= 0) return;
    const scale = d / base;
    const k = center();
    call(c.onPinch, { scale, delta: last > 0 ? scale / last : 1, cx: k.cx, cy: k.cy, phase: "move" });
    last = scale;
  }, { passive: false });
  const drop = (ev) => {
    if (!pts.has(ev.pointerId)) return;
    const had = pts.size >= 2;
    pts.delete(ev.pointerId);
    if (had && pts.size < 2) {
      call(c.onPinch, { scale: last, delta: 1, cx: 0, cy: 0, phase: "end" });
      base = 0;
      last = 1;
    }
  };
  b.on(el, "pointerup", drop, { passive: true });
  b.on(el, "pointercancel", drop, { passive: true });
  if (CAPS && typeof CAPS.guardGestures === "function") {
    try { b.add(CAPS.guardGestures(el)); } catch (e) { /* 下の控えへ */ }
  } else {
    const stop = (ev) => ev.preventDefault();
    ["gesturestart", "gesturechange", "gestureend"].forEach((n) => b.on(el, n, stop, { passive: false }));
  }
  return () => { pts.clear(); b.off(); };
}

/* ── 7. 重ねる物: シート / ダイアログ ───────────────────────────── */

/** actions を並べる（[{label,primary,danger,onClick|onSelect,close:false}]） */
function actionsRow(cls, actions, closeFn) {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) return null;
  const row = mk("div", cls);
  for (const a of list) {
    if (!a) continue;
    const b = mkBtn("vqs-act vqs-btn"
      + (a.primary ? " vqs-act--primary vqs-btn--primary" : "")
      + (a.danger ? " vqs-act--danger vqs-btn--danger" : ""), String(a.label || ""));
    if (a.id) b.setAttribute("data-action", String(a.id));
    if (a.disabled) b.disabled = true;
    b.addEventListener("click", () => {
      const fn = a.onClick || a.onSelect || a.action;
      const r = call(fn);
      if (a.close !== false && r !== false) call(closeFn, a.id || "action");
    });
    row.append(b);
  }
  return row;
}

/** content が文字列でも Node でも関数でも受ける（文字列は textContent） */
function contentNode(content) {
  if (content === null || content === undefined) return mk("div", "vqs-sheet__empty");
  if (typeof content === "function") { const r = call(content); return contentNode(r === undefined ? "" : r); }
  if (content.nodeType === 1 || content.nodeType === 11) return content;
  if (content.el && content.el.nodeType === 1) return content.el;
  return mk("div", "vqs-text", String(content));
}

/** height → CSS の高さ（"half"|"full"|"auto"|数値 px|CSS 文字列） */
function sheetHeight(h) {
  if (h === undefined || h === null || h === "auto") return null;
  if (typeof h === "number" && Number.isFinite(h)) return Math.max(80, h) + "px";
  const s = String(h);
  if (s === "half") return "50dvh";
  if (s === "full") return "92dvh";
  if (s === "third") return "34dvh";
  return s;
}

/**
 * モバイルのボトムシート。掴み棒で下げて閉じる・背面暗幕・Esc・safe-area。
 * @param {{title?:string, content?:any, height?:any, actions?:Array,
 *          onClose?:Function, dismissable?:boolean, hostId?:string, className?:string}} o
 * @returns {{close:Function, el:HTMLElement}}
 */
export function openSheet(o) {
  const c = o || {};
  const h = host(c.hostId || "sheetHost");
  const b = binder();
  const veil = mk("div", "vqs-veil vqs-veil--sheet");
  const el = mk("div", "vqs-sheet" + (c.className ? " " + c.className : ""));
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("data-test", "sheet");
  const hh = sheetHeight(c.height);
  if (hh) el.style.height = hh;

  /* 掴み棒（ここを下へ引くと閉じる） */
  const grab = mk("div", "vqs-sheet__grip vqs-sheet__grab");
  grab.setAttribute("aria-hidden", "true");
  grab.append(mk("i"));
  el.append(grab);

  if (c.title) {
    const head = mk("div", "vqs-sheet__head");
    const t = mk("div", "vqs-sheet__title", String(c.title));
    t.id = "vqs-sheet-t-" + Math.random().toString(36).slice(2, 8);
    el.setAttribute("aria-labelledby", t.id);
    const x = mkBtn("vqs-sheet__close", "", "閉じる");
    x.append(icon("close"));
    x.addEventListener("click", () => close("close"));
    head.append(t, x);
    el.append(head);
  }

  const body = mk("div", "vqs-sheet__body");
  body.append(contentNode(c.content));
  el.append(body);

  const acts = actionsRow("vqs-sheet__acts", c.actions, (r) => close(r));
  if (acts) el.append(acts);

  let closed = false;
  const layer = { close: (r) => close(r), dismissable: c.dismissable !== false, el };

  function close(reason) {
    if (closed) return;
    closed = true;
    popLayer(layer);
    b.off();
    el.classList.remove("vqs-sheet--on");
    el.classList.add("vqs-sheet--out");
    veil.classList.remove("vqs-veil--on");
    veil.classList.add("vqs-veil--out");
    const rm = () => { try { el.remove(); } catch (e) { /* noop */ } try { veil.remove(); } catch (e) { /* noop */ } };
    setTimeout(rm, 180);
    call(c.onClose, reason === undefined ? "close" : reason);
  }

  if (c.dismissable !== false) b.on(veil, "pointerdown", () => close("veil"));

  /* 掴み棒のドラッグ（1/3 より下 or 速く振り下げたら閉じる） */
  let startY = 0;
  let dy = 0;
  let t0 = 0;
  b.add(drag(grab, {
    onStart: (i) => { startY = i.y; dy = 0; t0 = nowMs(); el.classList.add("vqs-sheet--dragging"); },
    onMove: (i) => {
      dy = Math.max(0, i.y - startY);
      el.style.transform = "translate3d(0," + dy + "px,0)";
      veil.style.opacity = String(Math.max(0.15, 1 - dy / 420));
    },
    onEnd: (i) => {
      el.classList.remove("vqs-sheet--dragging");
      const dt = Math.max(1, nowMs() - t0);
      const v = dy / dt;   /* px/ms */
      const limit = Math.max(80, el.getBoundingClientRect().height / 3);
      if (!i.cancelled && (dy > limit || v > 0.7)) { close("swipe"); return; }
      el.style.transform = "";
      veil.style.opacity = "";
    }
  }));

  h.append(veil, el);
  /* 実物の CSS は translate3d(0,100%) から `--on` で出て来るので、
     入れた次の frame で必ず付ける（付け忘れると画面の外に居たままになる） */
  requestAnimationFrame(() => { el.classList.add("vqs-sheet--in", "vqs-sheet--on"); veil.classList.add("vqs-veil--on"); });
  pushLayer(layer);
  return { close, el, body };
}

/**
 * ダイアログ（焦点を閉じ込める）。
 * @param {{title?:string, content?:any, actions?:Array, width?:any,
 *          onClose?:Function, dismissable?:boolean, hostId?:string, className?:string}} o
 * @returns {{close:Function, el:HTMLElement}}
 */
export function openModal(o) {
  const c = o || {};
  const h = host(c.hostId || "modalHost");
  const b = binder();
  const veil = mk("div", "vqs-veil vqs-veil--modal");
  /* 実物の CSS は「.vqs-modal = 画面いっぱいの入れ物 / .vqs-modal__panel = 箱」。
     panel に `--on` が付かないと opacity:0 のままなので、次の frame で必ず付ける。 */
  const wrap = mk("div", "vqs-modal" + (c.className ? " " + c.className : ""));
  const el = mk("div", "vqs-modal__panel");
  wrap.append(el);
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("data-test", "modal");
  el.tabIndex = -1;
  if (c.width !== undefined && c.width !== null) {
    const w = typeof c.width === "number" ? c.width : parseFloat(c.width);
    if (Number.isFinite(w) && w >= 760) el.classList.add("vqs-modal__panel--wide");
    el.style.width = typeof c.width === "number" ? "min(92vw," + c.width + "px)" : String(c.width);
  }

  const head = mk("div", "vqs-modal__head");
  const t = mk("div", "vqs-modal__title", String(c.title || ""));
  t.id = "vqs-modal-t-" + Math.random().toString(36).slice(2, 8);
  el.setAttribute("aria-labelledby", t.id);
  const x = mkBtn("vqs-modal__close", "", "閉じる");
  x.append(icon("close"));
  x.addEventListener("click", () => close("close"));
  head.append(t, x);
  if (c.dismissable === false) x.remove();
  el.append(head);

  const body = mk("div", "vqs-modal__body");
  body.append(contentNode(c.content));
  el.append(body);

  const acts = actionsRow("vqs-modal__acts", c.actions, (r) => close(r));
  if (acts) el.append(acts);

  let closed = false;
  let release = null;
  const layer = { close: (r) => close(r), dismissable: c.dismissable !== false, el };

  function close(reason) {
    if (closed) return;
    closed = true;
    popLayer(layer);
    b.off();
    if (release) { try { release(); } catch (e) { /* noop */ } release = null; }
    wrap.classList.remove("vqs-modal--on");
    veil.classList.remove("vqs-veil--on");
    try { wrap.remove(); } catch (e) { /* noop */ }
    try { veil.remove(); } catch (e) { /* noop */ }
    call(c.onClose, reason === undefined ? "close" : reason);
  }

  if (c.dismissable !== false) b.on(veil, "pointerdown", () => close("veil"));
  h.append(veil, wrap);
  requestAnimationFrame(() => { wrap.classList.add("vqs-modal--on"); veil.classList.add("vqs-veil--on"); });
  release = trapFocus(el);
  pushLayer(layer);
  return { close, el, body };
}

/* ── 8. トースト（取消つきも作れること）─────────────────────────── */

/* CONTRACT-NOTE: toast の並べ方は styles/layout.css の `#toastHost` が持っている
   （flex の column-reverse）。だから **包みを作らず直下へ入れる**。
   包みを挟むと layout.css の並びが効かなくなる。 */
function toastStack() { return host("toastHost"); }

/**
 * トースト。`action` を渡せば「取消つき」になる（契約書 §13.5 の削除はこれ）。
 * @param {string} msg
 * @param {{kind?:string, ms?:number, action?:{label?:string,onClick?:Function}|Function,
 *          actionLabel?:string, onClose?:Function}} [o]
 * @returns {{close:Function, el:HTMLElement}}
 */
export function toast(msg, o) {
  const c = o || {};
  const s = toastStack();
  const kind = String(c.kind || "info");
  const el = mk("div", "vqs-toast vqs-toast--" + kind);
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.setAttribute("data-test", "toast");
  el.append(icon(kind === "error" ? "error" : (kind === "warn" ? "warn" : (kind === "ok" ? "ok" : "info"))));
  el.append(mk("span", "vqs-toast__msg", String(msg === undefined || msg === null ? "" : msg)));

  let timer = null;
  let closed = false;
  function close(reason) {
    if (closed) return;
    closed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    el.classList.remove("vqs-toast--on");
    el.classList.add("vqs-toast--out");
    setTimeout(() => { try { el.remove(); } catch (e) { /* noop */ } }, 180);
    call(c.onClose, reason === undefined ? "timeout" : reason);
  }

  const act = typeof c.action === "function" ? { label: c.actionLabel || "取消", onClick: c.action } : c.action;
  if (act) {
    const b = mkBtn("vqs-toast__act", String(act.label || c.actionLabel || "取消"));
    b.addEventListener("click", () => { call(act.onClick || act.onSelect); close("action"); });
    el.append(b);
  }

  /* 触っている間は消さない（取消を押す時間を奪わない） */
  const ms = Math.max(600, num(c.ms, act ? 4000 : 2600));
  const arm = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => close("timeout"), ms); };
  el.addEventListener("pointerenter", () => { if (timer) { clearTimeout(timer); timer = null; } });
  el.addEventListener("pointerleave", arm);
  if (s) s.append(el); else return { close: () => { }, el };
  requestAnimationFrame(() => el.classList.add("vqs-toast--on"));
  arm();
  return { close, el };
}

/* ── 9. メニュー（右クリック・…ボタン。入れ子つき）───────────────── */

/** anchor から画面座標の箱を得る（要素でも {x,y} でも event でも） */
function anchorRect(a) {
  if (!a) return { left: 8, top: 8, right: 8, bottom: 8, width: 0, height: 0 };
  if (typeof a.getBoundingClientRect === "function") {
    const r = a.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }
  const x = num(a.clientX !== undefined ? a.clientX : a.x, 8);
  const y = num(a.clientY !== undefined ? a.clientY : a.y, 8);
  return { left: x, top: y, right: x, bottom: y, width: 0, height: 0 };
}

/** 画面の中へ押し込む */
function placeNear(el, rect, o) {
  const c = o || {};
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  el.style.visibility = "hidden";
  el.style.left = "0px";
  el.style.top = "0px";
  const w = el.offsetWidth || 200;
  const hgt = el.offsetHeight || 200;
  let x = c.side === "right" ? rect.right : rect.left;
  let y = c.side === "right" ? rect.top : rect.bottom + 4;
  if (x + w > vw - 8) x = Math.max(8, (c.side === "right" ? rect.left - w : vw - w - 8));
  if (y + hgt > vh - 8) y = Math.max(8, rect.top - hgt - 4);
  el.style.left = Math.round(clamp(x, 8, Math.max(8, vw - w - 8))) + "px";
  el.style.top = Math.round(clamp(y, 8, Math.max(8, vh - hgt - 8))) + "px";
  el.style.visibility = "";
}

/**
 * メニュー。items = [{label,icon,shortcut,danger,disabled,onSelect,sub,sep}]
 * @param {HTMLElement|{x:number,y:number}|PointerEvent} anchorEl
 * @param {Array} items
 * @param {{side?:string, onClose?:Function}} [o]
 * @returns {{close:Function, el:HTMLElement}}
 */
export function menu(anchorEl, items, o) {
  const c = o || {};
  const h = host("menuHost");
  const b = binder();
  const el = mk("div", "vqs-menu");
  el.setAttribute("role", "menu");
  el.setAttribute("data-test", "menu");
  const list = Array.isArray(items) ? items : [];
  /** @type {{close:Function}|null} */
  let subOpen = null;
  let closed = false;

  const layer = { close: (r) => close(r), dismissable: true, el };

  function close(reason) {
    if (closed) return;
    closed = true;
    popLayer(layer);
    if (subOpen) { call(subOpen.close); subOpen = null; }
    b.off();
    try { el.remove(); } catch (e) { /* noop */ }
    call(c.onClose, reason === undefined ? "close" : reason);
  }

  const btns = [];
  for (const raw of list) {
    if (!raw) continue;
    if (raw === "-" || raw.sep || raw.separator) { el.append(mk("div", "vqs-menu__sep")); continue; }
    const it = raw;
    const cls = "vqs-menu__item"
      + (it.danger ? " vqs-menu__item--danger" : "")
      + (it.disabled ? " vqs-menu__item--disabled" : "")
      + (it.sub ? " vqs-menu__item--sub" : "")
      + (it.checked ? " vqs-menu__item--on" : "");
    const btn = mkBtn(cls, "");
    btn.setAttribute("role", "menuitem");
    if (it.disabled) btn.disabled = true;
    btn.append(it.icon ? icon(it.icon) : mk("span", "vqs-menu__ico"));
    btn.append(mk("span", "vqs-menu__label", String(it.label === undefined ? "" : it.label)));
    if (it.shortcut) btn.append(mk("span", "vqs-menu__sk vqs-menu__key", String(it.shortcut)));
    if (it.sub) btn.append(icon("chevron"));

    const openSub = () => {
      if (subOpen) { call(subOpen.close); subOpen = null; }
      const sub = Array.isArray(it.sub) ? it.sub : call(it.sub) || [];
      subOpen = menu(btn, sub, { side: "right", onClose: () => { subOpen = null; } });
      if (subOpen && subOpen.el) subOpen.el.classList.add("vqs-menu--sub");
    };

    btn.addEventListener("click", (ev) => {
      if (it.disabled) return;
      ev.stopPropagation();
      if (it.sub) { openSub(); return; }
      const keep = call(it.onSelect || it.onClick || it.action, it);
      if (keep !== false && it.keepOpen !== true) close("select");
    });
    if (it.sub) btn.addEventListener("pointerenter", () => { if (!isTouch()) openSub(); });
    el.append(btn);
    if (!it.disabled) btns.push(btn);
  }
  if (!list.length) el.append(mk("div", "vqs-menu__item vqs-menu__item--disabled", "項目がありません"));

  h.append(el);
  placeNear(el, anchorRect(anchorEl), { side: c.side });

  /* 外を触ったら閉じる（この pointerdown より後の物だけを見る） */
  setTimeout(() => {
    if (closed) return;
    b.on(DOC, "pointerdown", (ev) => {
      if (el.contains(ev.target)) return;
      if (subOpen && subOpen.el && subOpen.el.contains(ev.target)) return;
      close("outside");
    }, true);
    b.on(window, "resize", () => close("resize"));
    b.on(window, "scroll", () => close("scroll"), true);
  }, 0);

  /* 上下キーで選べること（デスクトップの作法） */
  b.on(el, "keydown", (ev) => {
    if (!btns.length) return;
    const i = btns.indexOf(DOC.activeElement);
    if (ev.key === "ArrowDown") { ev.preventDefault(); btns[(i + 1 + btns.length) % btns.length].focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  if (btns.length && !isTouch()) setTimeout(() => { try { btns[0].focus({ preventScroll: true }); } catch (e) { /* noop */ } }, 0);

  pushLayer(layer);
  return { close, el };
}

/* ── 10. 確認 / 入力（Promise を返す）──────────────────────────── */

/**
 * 確認。`Promise<boolean>`。
 * @param {{title?:string,message?:string,danger?:boolean,okLabel?:string,cancelLabel?:string}} o
 * @returns {Promise<boolean>}
 */
export function confirm(o) {
  const c = o || {};
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; resolve(!!v); };
    const body = mk("div", "vqs-confirm");
    if (c.message) body.append(mk("p", "vqs-confirm__msg", String(c.message)));
    const m = openModal({
      title: c.title || "確認",
      content: body,
      className: "vqs-modal--confirm",
      width: 400,
      onClose: () => fin(false),
      actions: [
        { id: "cancel", label: c.cancelLabel || "やめる", onClick: () => fin(false) },
        { id: "ok", label: c.okLabel || "はい", primary: !c.danger, danger: !!c.danger, onClick: () => fin(true) }
      ]
    });
    /* onClose が false を入れるので、押した後の close でも値は変わらない */
    void m;
  });
}

/**
 * 1 行入力。`Promise<string|null>`（やめたら null）。
 * @param {{title?:string,label?:string,value?:string,placeholder?:string,okLabel?:string,multiline?:boolean}} o
 * @returns {Promise<string|null>}
 */
export function prompt(o) {
  const c = o || {};
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; resolve(v); };
    const f = c.multiline
      ? textArea({ label: c.label, value: c.value, placeholder: c.placeholder })
      : textField({ label: c.label, value: c.value, placeholder: c.placeholder });
    const input = f.querySelector("input, textarea");
    if (input) input.setAttribute("autofocus", "autofocus");
    const ok = () => fin(input ? String(input.value) : "");
    if (input && !c.multiline) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); ok(); m.close("enter"); }
      });
    }
    const m = openModal({
      title: c.title || "入力",
      content: f,
      className: "vqs-modal--prompt",
      width: 420,
      onClose: () => fin(null),
      actions: [
        { id: "cancel", label: "やめる", onClick: () => fin(null) },
        { id: "ok", label: c.okLabel || "決定", primary: true, onClick: ok }
      ]
    });
  });
}

/* ── 11. 値の部品: slider / numberDrag / stepper ─────────────────── */

/**
 * スライダー。中央スナップ（center 指定時 ±2% 吸着）・値のふきだし・
 * ダブルタップで既定へ・44px。
 * @param {{label?:string,min?:number,max?:number,step?:number,value?:number,center?:number,
 *          unit?:string,format?:Function,precision?:number,defaultValue?:number,
 *          onInput?:Function,onCommit?:Function,onChange?:Function}} o
 * @returns {HTMLElement & {el:HTMLElement,set:Function,destroy:Function}}
 */
export function slider(o) {
  const c = o || {};
  ensureCss();
  const min = num(c.min, 0);
  const max0 = num(c.max, 100);
  const max = max0 > min ? max0 : min + 1;
  const span = max - min;
  const step = Math.abs(num(c.step, span / 100)) || span / 100;
  const hasCenter = c.center !== undefined && c.center !== null;
  const center = hasCenter ? clamp(num(c.center, min), min, max) : null;
  const def = num(c.defaultValue, hasCenter ? center : num(c.value, min));
  const commit = c.onCommit || c.onChange;

  const el = mk("div", "vqs-slider" + (hasCenter ? " vqs-slider--centered" : ""));
  if (c.label) el.append(mk("span", "vqs-slider__label", String(c.label)));
  const wrap = mk("div", "vqs-slider__wrap");
  const rail = mk("div", "vqs-slider__rail");
  rail.style.touchAction = "none";          /* CSS が無くても指で擦れること */
  rail.setAttribute("role", "slider");
  rail.tabIndex = 0;
  rail.setAttribute("aria-label", String(c.label || "値"));
  const fill = mk("div", "vqs-slider__fill");
  const knob = mk("div", "vqs-slider__knob");
  const bubble = mk("div", "vqs-slider__bubble");
  rail.append(fill, knob, bubble);
  if (hasCenter) {
    const cm = mk("div", "vqs-slider__center");
    cm.style.left = ((center - min) / span * 100) + "%";
    rail.append(cm);
  }
  wrap.append(rail);
  const out = mk("span", "vqs-slider__val vqs-slider__num");
  out.setAttribute("data-value", "");
  el.append(wrap, out);
  touchable(el);

  let value = clamp(num(c.value, min), min, max);

  function quantize(v) {
    let x = clamp(v, min, max);
    x = min + Math.round((x - min) / step) * step;
    /* 中央スナップ（±2%）— 吸い付いたら触覚 + 明滅（iOS は振動が無い） */
    if (hasCenter && Math.abs(x - center) <= span * 0.02) x = center;
    return clamp(x, min, max);
  }

  let snapped = false;
  function paint() {
    const p = (value - min) / span;
    fill.style.width = (p * 100) + "%";
    knob.style.left = (p * 100) + "%";
    bubble.style.left = (p * 100) + "%";
    const t = fmtVal(value, c);
    bubble.textContent = t;
    out.textContent = t;
    rail.setAttribute("aria-valuemin", String(min));
    rail.setAttribute("aria-valuemax", String(max));
    rail.setAttribute("aria-valuenow", String(value));
    rail.setAttribute("aria-valuetext", t);
  }

  function setValue(v, mixed, emit) {
    if (mixed) { out.textContent = "—"; el.classList.add("vqs-field--mixed"); return; }
    el.classList.remove("vqs-field--mixed");
    const nv = quantize(num(v, value));
    const changed = nv !== value;
    value = nv;
    if (hasCenter) {
      const atC = value === center;
      el.classList.toggle("vqs-slider--atcenter", atC);
      if (atC && !snapped) { snapped = true; vibrate(8, knob); }
      if (!atC) snapped = false;
    }
    paint();
    void changed;
    if (emit) call(c.onInput, value);
  }

  const fromX = (x) => {
    const r = rail.getBoundingClientRect();
    const w = Math.max(1, r.width);
    return min + clamp((x - r.left) / w, 0, 1) * span;
  };

  const b = binder();
  /* 「擦った」のか「軽く叩いた」のかを分ける（擦り終わりを 2 度叩きと数えないため） */
  let moved = false;
  b.add(drag(rail, {
    onStart: (i) => { moved = false; el.classList.add("vqs-slider--dragging"); setValue(fromX(i.x), false, true); },
    onMove: (i) => { if (Math.abs(i.dx) > 6 || Math.abs(i.dy) > 6) moved = true; setValue(fromX(i.x), false, true); },
    onEnd: () => { el.classList.remove("vqs-slider--dragging"); call(commit, value); }
  }));

  /* ダブルタップ / ダブルクリックで既定へ。
     初期値を -1e9 にしてあるのは、**読み込み直後**（performance.now() がまだ小さい）に
     1 回目の叩きを 2 度叩きと数えて勝手に既定へ戻さないため。 */
  let lastTap = -1e9;
  b.on(rail, "pointerup", () => {
    if (moved) { lastTap = -1e9; return; }
    const t = nowMs();
    if (t - lastTap < 300) { setValue(def, false, true); call(commit, value); vibrate(10, knob); lastTap = -1e9; }
    else lastTap = t;
  }, { passive: true });
  b.on(el, "dblclick", () => { setValue(def, false, true); call(commit, value); });

  /* キーボード（デスクトップ） */
  b.on(rail, "keydown", (ev) => {
    const big = ev.shiftKey ? 10 : 1;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); setValue(value - step * big, false, true); call(commit, value); }
    else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); setValue(value + step * big, false, true); call(commit, value); }
    else if (ev.key === "Home") { ev.preventDefault(); setValue(min, false, true); call(commit, value); }
    else if (ev.key === "End") { ev.preventDefault(); setValue(max, false, true); call(commit, value); }
  });

  paint();
  return pack(el, {
    set: (v, mixed) => setValue(v, mixed, false),
    destroy: () => b.off()
  });
}

/**
 * 数値（ラベルを掴んで振ると増減 + 直接入力）。
 * @param {{label?:string,value?:number,min?:number,max?:number,step?:number,precision?:number,
 *          unit?:string,onInput?:Function,onCommit?:Function,onChange?:Function}} o
 */
export function numberDrag(o) {
  const c = o || {};
  ensureCss();
  const min = num(c.min, -1e9);
  const max = num(c.max, 1e9);
  const step = Math.abs(num(c.step, 1)) || 1;
  const prec = c.precision === undefined ? (step >= 1 ? 0 : 2) : clamp(num(c.precision, 2) | 0, 0, 6);
  const commit = c.onCommit || c.onChange;

  const el = mk("div", "vqs-numdrag");
  const lab = mk("span", "vqs-numdrag__label", String(c.label || ""));
  lab.style.touchAction = "none";
  if (c.label) lab.title = "左右に振ると増減・ダブルクリックで既定へ";
  const inp = mk("input", "vqs-numdrag__input");
  inp.type = "text";
  inp.inputMode = "decimal";
  inp.autocomplete = "off";
  inp.spellcheck = false;
  inp.setAttribute("aria-label", String(c.label || "数値"));
  el.append(lab, inp);
  if (c.unit) el.append(mk("span", "vqs-numdrag__unit", String(c.unit)));
  touchable(el);

  let value = clamp(num(c.value, 0), min, max);
  const def = value;
  const show = () => { inp.value = value.toFixed(prec).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };

  function setValue(v, mixed, emit) {
    if (mixed) { inp.value = ""; inp.placeholder = "—"; el.classList.add("vqs-field--mixed"); return; }
    el.classList.remove("vqs-field--mixed");
    if (inp.placeholder === "—") inp.placeholder = "";
    value = clamp(num(v, value), min, max);
    show();
    if (emit) call(c.onInput, value);
  }

  const b = binder();
  let base = 0;
  b.add(drag(lab, {
    threshold: 2,
    onStart: () => { base = value; el.classList.add("vqs-numdrag--dragging"); },
    onMove: (i) => {
      /* 1px = step。Shift で 10 倍、Alt で 1/10（プロ機の作法） */
      const k = i.ev && i.ev.shiftKey ? 10 : (i.ev && i.ev.altKey ? 0.1 : 1);
      setValue(base + i.dx * step * k, false, true);
    },
    onEnd: () => { el.classList.remove("vqs-numdrag--dragging"); call(commit, value); }
  }));
  b.on(inp, "input", () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) call(c.onInput, clamp(v, min, max));
  });
  b.on(inp, "change", () => { setValue(parseFloat(inp.value), false, true); call(commit, value); });
  b.on(inp, "keydown", (ev) => {
    if (ev.key === "ArrowUp") { ev.preventDefault(); setValue(value + step * (ev.shiftKey ? 10 : 1), false, true); call(commit, value); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); setValue(value - step * (ev.shiftKey ? 10 : 1), false, true); call(commit, value); }
    else if (ev.key === "Enter") { setValue(parseFloat(inp.value), false, true); call(commit, value); }
  });
  b.on(lab, "dblclick", () => { setValue(def, false, true); call(commit, value); });

  show();
  return pack(el, { set: (v, mixed) => setValue(v, mixed, false), destroy: () => b.off() });
}

/**
 * ステッパー（− 値 ＋）。
 * @param {{label?:string,value?:number,min?:number,max?:number,step?:number,unit?:string,
 *          onChange?:Function,onInput?:Function}} o
 */
export function stepper(o) {
  const c = o || {};
  ensureCss();
  const min = num(c.min, -1e9);
  const max = num(c.max, 1e9);
  const step = Math.abs(num(c.step, 1)) || 1;
  const el = mk("div", "vqs-stepper");
  if (c.label) el.append(mk("span", "vqs-stepper__label", String(c.label)));
  const dec = mkBtn("vqs-stepper__btn", "", "減らす");
  dec.append(icon("minus"));
  const inp = mk("input", "vqs-stepper__input");
  inp.type = "text";
  inp.inputMode = "numeric";
  inp.setAttribute("aria-label", String(c.label || "数"));
  const inc = mkBtn("vqs-stepper__btn", "", "増やす");
  inc.append(icon("plus"));
  el.append(dec, inp, inc);
  if (c.unit) el.append(mk("span", "vqs-stepper__unit", String(c.unit)));

  let value = clamp(num(c.value, 0), min, max);
  const emit = c.onChange || c.onInput;
  const show = () => { inp.value = String(value); };
  function setValue(v, mixed, fire) {
    if (mixed) { inp.value = ""; inp.placeholder = "—"; return; }
    value = clamp(num(v, value), min, max);
    show();
    if (fire) call(emit, value);
  }
  const b = binder();
  b.on(dec, "click", () => { setValue(value - step, false, true); vibrate(6, dec); });
  b.on(inc, "click", () => { setValue(value + step, false, true); vibrate(6, inc); });
  b.on(inp, "change", () => setValue(parseFloat(inp.value), false, true));
  show();
  return pack(el, { set: (v, mixed) => setValue(v, mixed, false), destroy: () => b.off() });
}

/* ── 12. 色（見本 + 自前 HSV ピッカー + 16 進入力）────────────────── */

/** "#rgb" / "#rrggbb" / "#rrggbbaa" / "rgb()" / "rgba()" → {r,g,b,a} 0..255,0..1 */
export function parseColor(str) {
  const s = String(str === undefined || str === null ? "" : str).trim();
  if (!s) return { r: 255, g: 255, b: 255, a: 1 };
  const m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(/[\s,\/]+/).filter((x) => x !== "");
    return {
      r: clamp(num(p[0], 255) | 0, 0, 255),
      g: clamp(num(p[1], 255) | 0, 0, 255),
      b: clamp(num(p[2], 255) | 0, 0, 255),
      a: p.length > 3 ? clamp(num(p[3], 1), 0, 1) : 1
    };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

/** {r,g,b,a} → "#rrggbb" か "#rrggbbaa" */
export function toHex(c, withAlpha) {
  const h = (v) => clamp(Math.round(num(v, 0)), 0, 255).toString(16).padStart(2, "0");
  const base = "#" + h(c.r) + h(c.g) + h(c.b);
  if (!withAlpha || num(c.a, 1) >= 1) return base;
  return base + h(num(c.a, 1) * 255);
}

/** RGB(0..255) → HSV(h 0..360, s 0..1, v 0..1) */
export function rgbToHsv(r, g, b) {
  const R = clamp(num(r, 0), 0, 255) / 255;
  const G = clamp(num(g, 0), 0, 255) / 255;
  const B = clamp(num(b, 0), 0, 255) / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === R) h = 60 * (((G - B) / d) % 6);
    else if (mx === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx > 0 ? d / mx : 0, v: mx };
}

/** HSV → RGB(0..255) */
export function hsvToRgb(h, s, v) {
  const H = ((num(h, 0) % 360) + 360) % 360;
  const S = clamp(num(s, 0), 0, 1);
  const V = clamp(num(v, 0), 0, 1);
  const c = V * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = V - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (H < 60) { r = c; g = x; }
  else if (H < 120) { r = x; g = c; }
  else if (H < 180) { g = c; b = x; }
  else if (H < 240) { g = x; b = c; }
  else if (H < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/**
 * 色。見本を押すと自前の HSV ピッカーが開く（`<input type=color>` は
 * iOS で見た目が揃わないので使わない）。16 進の直接入力もできる。
 * @param {{value?:string,onInput?:Function,onCommit?:Function,onChange?:Function,alpha?:boolean,label?:string}} o
 */
export function colorField(o) {
  const c = o || {};
  ensureCss();
  const useA = !!c.alpha;
  const commit = c.onCommit || c.onChange;
  let rgba = parseColor(c.value === undefined ? "#ffffff" : c.value);
  let hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);

  const el = mk("div", "vqs-color");
  if (c.label) el.append(mk("span", "vqs-color__label", String(c.label)));
  const sw = mkBtn("vqs-color__swatch vqs-color__sw", "", (c.label ? c.label + "の" : "") + "色を選ぶ");
  const hex = mk("input", "vqs-color__hex");
  hex.type = "text";
  hex.autocomplete = "off";
  hex.spellcheck = false;
  hex.setAttribute("aria-label", "16 進の色");
  hex.setAttribute("data-value", "");
  el.append(sw, hex);

  const pop = mk("div", "vqs-color__pop vqs-picker");
  pop.hidden = true;
  const sv = mk("div", "vqs-color__sv vqs-picker__sv");
  const cur = mk("div", "vqs-color__cursor vqs-picker__dot");
  sv.append(cur);
  const hue = mk("div", "vqs-color__bar vqs-color__bar--hue vqs-picker__hue");
  hue.style.background = "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
  const hueK = mk("div", "vqs-color__bar-knob");
  hue.append(hueK);
  pop.append(sv, hue);
  let alp = null;
  let alpK = null;
  if (useA) {
    alp = mk("div", "vqs-color__bar vqs-color__bar--alpha vqs-picker__alphabar");
    alpK = mk("div", "vqs-color__bar-knob");
    alp.append(alpK);
    pop.append(alp);
  }
  el.append(pop);

  function paint() {
    const css = "rgba(" + rgba.r + "," + rgba.g + "," + rgba.b + "," + num(rgba.a, 1).toFixed(3) + ")";
    sw.style.background = css;
    if (DOC.activeElement !== hex) hex.value = toHex(rgba, useA);
    sv.style.background = "linear-gradient(to top,#000,rgba(0,0,0,0)),"
      + "linear-gradient(to right,#fff,hsl(" + Math.round(hsv.h) + ",100%,50%))";
    cur.style.left = (hsv.s * 100) + "%";
    cur.style.top = ((1 - hsv.v) * 100) + "%";
    hueK.style.left = (hsv.h / 360 * 100) + "%";
    if (alp) {
      alp.style.background = "linear-gradient(to right,rgba(" + rgba.r + "," + rgba.g + "," + rgba.b + ",0),rgb(" + rgba.r + "," + rgba.g + "," + rgba.b + "))";
      alpK.style.left = (clamp(num(rgba.a, 1), 0, 1) * 100) + "%";
    }
  }

  function push(fire) {
    paint();
    if (fire) call(c.onInput, toHex(rgba, useA), Object.assign({}, rgba));
  }
  function fromHsv(fire) {
    const t = hsvToRgb(hsv.h, hsv.s, hsv.v);
    rgba = { r: t.r, g: t.g, b: t.b, a: num(rgba.a, 1) };
    push(fire);
  }

  const b = binder();
  const ratio = (elx, x) => {
    const r = elx.getBoundingClientRect();
    return clamp((x - r.left) / Math.max(1, r.width), 0, 1);
  };
  b.add(drag(sv, {
    onStart: pick, onMove: pick,
    onEnd: () => call(commit, toHex(rgba, useA))
  }));
  function pick(i) {
    const r = sv.getBoundingClientRect();
    hsv.s = clamp((i.x - r.left) / Math.max(1, r.width), 0, 1);
    hsv.v = 1 - clamp((i.y - r.top) / Math.max(1, r.height), 0, 1);
    fromHsv(true);
  }
  b.add(drag(hue, {
    onStart: (i) => { hsv.h = ratio(hue, i.x) * 360; fromHsv(true); },
    onMove: (i) => { hsv.h = ratio(hue, i.x) * 360; fromHsv(true); },
    onEnd: () => call(commit, toHex(rgba, useA))
  }));
  if (alp) {
    b.add(drag(alp, {
      onStart: (i) => { rgba.a = ratio(alp, i.x); push(true); },
      onMove: (i) => { rgba.a = ratio(alp, i.x); push(true); },
      onEnd: () => call(commit, toHex(rgba, useA))
    }));
  }
  b.on(hex, "change", () => {
    rgba = parseColor(hex.value);
    hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
    push(true);
    call(commit, toHex(rgba, useA));
  });
  b.on(sw, "click", () => {
    pop.hidden = !pop.hidden;
    el.classList.toggle("vqs-color__pop--open", !pop.hidden);
    if (!pop.hidden) paint();
  });
  /* 外を触ったら閉じる */
  b.on(DOC, "pointerdown", (ev) => {
    if (pop.hidden) return;
    if (el.contains(ev.target)) return;
    pop.hidden = true;
    el.classList.remove("vqs-color__pop--open");
  }, true);

  paint();
  return pack(el, {
    set: (v, mixed) => {
      if (mixed) { hex.value = ""; hex.placeholder = "—"; el.classList.add("vqs-field--mixed"); return; }
      el.classList.remove("vqs-field--mixed");
      rgba = parseColor(v);
      hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
      paint();
    },
    destroy: () => b.off()
  });
}

/* ── 13. 選ぶ部品: segmented / toggle / select / tabs ─────────────── */

/** @param {{items?:Array,value?:any,onChange?:Function,label?:string}} o */
export function segmented(o) {
  const c = o || {};
  ensureCss();
  const el = mk("div", "vqs-seg");
  el.setAttribute("role", "radiogroup");
  if (c.label) el.setAttribute("aria-label", String(c.label));
  const items = (Array.isArray(c.items) ? c.items : []).map(normItem);
  let value = c.value;
  const btns = [];
  const b = binder();
  for (const it of items) {
    const btn = mkBtn("vqs-seg__item vqs-seg__btn", it.icon ? "" : it.label, it.label);
    if (it.icon) { btn.append(icon(it.icon)); if (it.label) btn.append(mk("span", "vqs-seg__lb", it.label)); }
    btn.setAttribute("role", "radio");
    btn.setAttribute("data-value", String(it.value));
    if (it.disabled) btn.disabled = true;
    b.on(btn, "click", () => {
      if (it.disabled) return;
      value = it.value;
      paint();
      vibrate(6, btn);
      call(c.onChange, value, it);
    });
    el.append(btn);
    btns.push({ btn, it });
  }
  function paint() {
    for (const x of btns) {
      const on = String(x.it.value) === String(value);
      x.btn.classList.toggle("vqs-seg__item--on", on);
      x.btn.classList.toggle("vqs-seg__btn--on", on);
      x.btn.setAttribute("aria-checked", on ? "true" : "false");
    }
  }
  paint();
  return pack(el, { set: (v) => { value = v; paint(); }, destroy: () => b.off() });
}

/** @param {{label?:string,value?:boolean,onChange?:Function,hint?:string}} o */
export function toggle(o) {
  const c = o || {};
  ensureCss();
  const el = mk("div", "vqs-toggle");
  if (c.label) el.append(mk("span", "vqs-toggle__label", String(c.label)));
  const sw = mkBtn("vqs-toggle__switch vqs-toggle__box", "", String(c.label || "切り替え"));
  sw.setAttribute("role", "switch");
  sw.append(mk("i"));
  el.append(sw);
  let value = !!c.value;
  const paint = () => {
    el.classList.toggle("vqs-toggle--on", value);
    sw.setAttribute("aria-checked", value ? "true" : "false");
  };
  const b = binder();
  b.on(sw, "click", () => { value = !value; paint(); vibrate(8, sw); call(c.onChange, value); });
  paint();
  return pack(el, {
    set: (v, mixed) => { value = !!v; paint(); el.classList.toggle("vqs-field--mixed", !!mixed); },
    destroy: () => b.off()
  });
}

/** @param {{items?:Array,value?:any,onChange?:Function,label?:string}} o */
export function select(o) {
  const c = o || {};
  ensureCss();
  /* 選択は **native select**（iOS の輪っかが出るので指で確実に選べる） */
  const sel = mk("select", "vqs-select vqs-select__el");
  sel.setAttribute("aria-label", String(c.label || "選択"));
  const items = (Array.isArray(c.items) ? c.items : []).map(normItem);
  for (const it of items) {
    const op = mk("option", "", it.label);
    op.value = String(it.value);
    if (it.disabled) op.disabled = true;
    sel.append(op);
  }
  if (c.value !== undefined && c.value !== null) sel.value = String(c.value);
  touchable(sel);
  const b = binder();
  b.on(sel, "change", () => {
    const it = items.find((x) => String(x.value) === sel.value);
    call(c.onChange, it ? it.value : sel.value, it);
  });
  if (!c.label) return pack(sel, { set: (v, mixed) => { if (!mixed) sel.value = String(v); }, destroy: () => b.off() });
  const el = mk("div", "vqs-field");
  el.append(mk("span", "vqs-field__label", String(c.label)), sel);
  return pack(el, {
    set: (v, mixed) => { if (mixed) { el.classList.add("vqs-field--mixed"); return; } el.classList.remove("vqs-field--mixed"); sel.value = String(v); },
    destroy: () => b.off()
  });
}

/** @param {{items?:Array,value?:any,onChange?:Function}} o */
export function tabs(o) {
  const c = o || {};
  ensureCss();
  const el = mk("nav", "vqs-tabs");
  el.setAttribute("role", "tablist");
  const items = (Array.isArray(c.items) ? c.items : []).map(normItem);
  let value = c.value !== undefined ? c.value : (items[0] && items[0].value);
  const btns = [];
  const b = binder();
  for (const it of items) {
    const btn = mkBtn("vqs-tab", "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("data-value", String(it.value));
    if (it.icon) btn.append(icon(it.icon));
    if (it.label) btn.append(mk("span", "vqs-tab__label", it.label));
    if (it.disabled) btn.disabled = true;
    b.on(btn, "click", () => { value = it.value; paint(); call(c.onChange, value, it); });
    el.append(btn);
    btns.push({ btn, it });
  }
  function paint() {
    for (const x of btns) {
      const on = String(x.it.value) === String(value);
      x.btn.classList.toggle("vqs-tab--on", on);
      x.btn.setAttribute("aria-selected", on ? "true" : "false");
      x.btn.tabIndex = on ? 0 : -1;
    }
  }
  paint();
  return pack(el, { set: (v) => { value = v; paint(); }, destroy: () => b.off() });
}

/* ── 14. 入力: textField / textArea ─────────────────────────────── */

function makeTextish(tag, cls, o) {
  const c = o || {};
  ensureCss();
  /* 実物の CSS は .vqs-textfield / .vqs-textarea（__label / __el）の名前で来るので
     自分の名前（.vqs-field 系）と **両方** 付けておく（どちらの CSS でも整う） */
  const kind = tag === "textarea" ? "vqs-textarea" : "vqs-textfield";
  const el = mk("div", "vqs-field " + kind);
  if (c.label) el.append(mk("span", "vqs-field__label " + kind + "__label", String(c.label)));
  const inp = mk(tag, cls + " " + kind + "__el vqs-input");
  if (tag === "input") inp.type = c.type || "text";
  inp.value = c.value === undefined || c.value === null ? "" : String(c.value);
  if (c.placeholder) inp.placeholder = String(c.placeholder);
  if (c.rows && tag === "textarea") inp.rows = num(c.rows, 4);
  if (c.maxLength) inp.maxLength = num(c.maxLength, 500);
  inp.autocomplete = c.autocomplete || "off";
  inp.spellcheck = !!c.spellcheck;
  inp.setAttribute("aria-label", String(c.label || c.placeholder || "入力"));
  el.append(inp);
  touchable(inp);
  const b = binder();
  b.on(inp, "input", () => call(c.onInput, inp.value));
  b.on(inp, "change", () => call(c.onCommit || c.onChange, inp.value));
  return pack(el, {
    set: (v, mixed) => {
      if (mixed) { inp.value = ""; inp.placeholder = "—"; el.classList.add("vqs-field--mixed"); return; }
      el.classList.remove("vqs-field--mixed");
      if (c.placeholder) inp.placeholder = String(c.placeholder);
      inp.value = v === undefined || v === null ? "" : String(v);
    },
    destroy: () => b.off()
  });
}

/** @param {{label?:string,value?:string,placeholder?:string,onInput?:Function}} o */
export function textField(o) { return makeTextish("input", "vqs-field__input", o); }
/** @param {{label?:string,value?:string,placeholder?:string,rows?:number,onInput?:Function}} o */
export function textArea(o) { return makeTextish("textarea", "vqs-field__area", o); }

/* ── 15. 入れ物: accordion / splitter ──────────────────────────── */

/** @param {{sections?:Array<{title:string,content:any,open?:boolean,id?:string}>, single?:boolean}} o */
export function accordion(o) {
  const c = o || {};
  ensureCss();
  const el = mk("div", "vqs-acc");
  const list = Array.isArray(c.sections) ? c.sections : [];
  const secs = [];
  const b = binder();
  for (const s of list) {
    if (!s) continue;
    const sec = mk("div", "vqs-acc__sec");
    if (s.id) sec.setAttribute("data-section", String(s.id));
    const head = mkBtn("vqs-acc__head", "");
    head.append(icon("chevron-down"), mk("span", "vqs-acc__title", String(s.title || "")));
    const body = mk("div", "vqs-acc__body");
    body.append(contentNode(s.content));
    sec.append(head, body);
    const setOpen = (on) => {
      sec.classList.toggle("vqs-acc__sec--open", !!on);
      sec.classList.toggle("vqs-acc--open", !!on);
      head.setAttribute("aria-expanded", on ? "true" : "false");
      body.style.display = on ? "" : "none";
    };
    setOpen(!!s.open);
    b.on(head, "click", () => {
      const on = !sec.classList.contains("vqs-acc__sec--open");
      if (c.single && on) for (const x of secs) x.setOpen(false);
      setOpen(on);
    });
    el.append(sec);
    secs.push({ sec, setOpen });
  }
  return pack(el, {
    set: (id) => { for (const x of secs) x.setOpen(x.sec.getAttribute("data-section") === String(id)); },
    destroy: () => b.off()
  });
}

/**
 * 分割線。onDrag(delta, phase) を呼ぶだけ（幅を決めるのは呼び側）。
 * @param {{dir?:string,onDrag?:Function,onEnd?:Function}} o
 */
export function splitter(o) {
  const c = o || {};
  ensureCss();
  const dir = c.dir === "h" || c.dir === "horizontal" ? "h" : "v";
  const el = mk("div", "vqs-splitter vqs-splitter--" + dir);
  el.setAttribute("role", "separator");
  el.setAttribute("aria-orientation", dir === "v" ? "vertical" : "horizontal");
  el.tabIndex = 0;
  el.style.touchAction = "none";
  if (isTouch()) { if (dir === "v") el.style.minWidth = "16px"; else el.style.minHeight = "16px"; }
  const b = binder();
  b.add(drag(el, {
    onStart: () => { el.classList.add("vqs-splitter--dragging"); call(c.onDrag, 0, "start"); },
    onMove: (i) => call(c.onDrag, dir === "v" ? i.dx : i.dy, "move"),
    onEnd: (i) => {
      el.classList.remove("vqs-splitter--dragging");
      const d = dir === "v" ? i.dx : i.dy;
      call(c.onDrag, d, "end");
      call(c.onEnd, d);
    }
  }));
  b.on(el, "keydown", (ev) => {
    const k = dir === "v" ? { less: "ArrowLeft", more: "ArrowRight" } : { less: "ArrowUp", more: "ArrowDown" };
    if (ev.key === k.less) { ev.preventDefault(); call(c.onDrag, -16, "key"); }
    else if (ev.key === k.more) { ev.preventDefault(); call(c.onDrag, 16, "key"); }
  });
  return pack(el, { destroy: () => b.off() });
}

/* ── 16. カーブ（イージング共用・点の追加/削除/移動・タッチ対応）────── */

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const n = DOC.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

/**
 * カーブ編集。points は 0..1 の正規化座標 [{x,y}]（左下 0,0 / 右上 1,1）。
 * mode: "smooth"（既定・なめらか）/ "linear"（直線）。
 * @param {{points?:Array,onChange?:Function,onCommit?:Function,mode?:string,readonly?:boolean}} o
 */
export function curveEditor(o) {
  const c = o || {};
  ensureCss();
  const mode = c.mode === "linear" ? "linear" : "smooth";
  const el = mk("div", "vqs-curve");
  el.style.touchAction = "none";
  const svg = svgEl("svg", { class: "vqs-curve__svg", viewBox: "0 0 100 100", preserveAspectRatio: "none" });
  svg.setAttribute("aria-label", "カーブの編集");
  const grid = svgEl("g", { class: "vqs-curve__grid vqs-curve__guides" });
  for (let i = 1; i < 4; i++) {
    grid.append(svgEl("line", { x1: i * 25, y1: 0, x2: i * 25, y2: 100, stroke: "#2c323b", "stroke-width": 0.5 }));
    grid.append(svgEl("line", { x1: 0, y1: i * 25, x2: 100, y2: i * 25, stroke: "#2c323b", "stroke-width": 0.5 }));
  }
  const path = svgEl("path", { class: "vqs-curve__line", fill: "none", stroke: "#2f6df6", "stroke-width": 2 });
  const dots = svgEl("g", { class: "vqs-curve__dots" });
  svg.append(grid, path, dots);
  el.append(svg);

  /** @type {Array<{x:number,y:number}>} */
  let pts = (Array.isArray(c.points) && c.points.length >= 2 ? c.points : [{ x: 0, y: 0 }, { x: 1, y: 1 }])
    .map((p) => ({ x: clamp(num(p && p.x, 0), 0, 1), y: clamp(num(p && p.y, 0), 0, 1) }))
    .sort((a, b2) => a.x - b2.x);

  const X = (p) => p.x * 100;
  const Y = (p) => (1 - p.y) * 100;

  function buildPath() {
    if (!pts.length) return "";
    let d = "M " + X(pts[0]).toFixed(2) + " " + Y(pts[0]).toFixed(2);
    if (mode === "linear" || pts.length === 2) {
      for (let i = 1; i < pts.length; i++) d += " L " + X(pts[i]).toFixed(2) + " " + Y(pts[i]).toFixed(2);
      return d;
    }
    /* Catmull-Rom → 3 次ベジエ（自前。外部ライブラリは禁止） */
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = X(p1) + (X(p2) - X(p0)) / 6;
      const c1y = Y(p1) + (Y(p2) - Y(p0)) / 6;
      const c2x = X(p2) - (X(p3) - X(p1)) / 6;
      const c2y = Y(p2) - (Y(p3) - Y(p1)) / 6;
      d += " C " + c1x.toFixed(2) + " " + c1y.toFixed(2) + "," + c2x.toFixed(2) + " " + c2y.toFixed(2)
        + "," + X(p2).toFixed(2) + " " + Y(p2).toFixed(2);
    }
    return d;
  }

  const b = binder();
  let dragIdx = -1;

  function paint() {
    path.setAttribute("d", buildPath());
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    pts.forEach((p, i) => {
      /* 見た目 4 / 当たり判定は透明な大きい丸（指で掴めること） */
      const hit = svgEl("circle", { class: "vqs-curve__hit", cx: X(p), cy: Y(p), r: 9, fill: "transparent" });
      const dot = svgEl("circle", { class: "vqs-curve__pt", cx: X(p), cy: Y(p), r: 3.5, fill: "#fff" });
      hit.setAttribute("data-index", String(i));
      dots.append(hit, dot);
    });
  }

  function emit(fire) {
    paint();
    if (fire) call(c.onChange, pts.map((p) => ({ x: p.x, y: p.y })), mode);
  }

  const toLocal = (x, y) => {
    const r = svg.getBoundingClientRect();
    return {
      x: clamp((x - r.left) / Math.max(1, r.width), 0, 1),
      y: 1 - clamp((y - r.top) / Math.max(1, r.height), 0, 1)
    };
  };

  function nearest(px, py) {
    let best = -1;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) { bd = d; best = i; }
    });
    return { i: best, d: bd };
  }

  if (!c.readonly) {
    b.add(drag(svg, {
      onStart: (i) => {
        const l = toLocal(i.x, i.y);
        const n = nearest(l.x, l.y);
        if (n.d <= 0.07) { dragIdx = n.i; return; }
        /* 空いた所を触ったら点を足す */
        const np = { x: l.x, y: l.y };
        pts.push(np);
        pts.sort((a, b2) => a.x - b2.x);
        dragIdx = pts.indexOf(np);
        vibrate(8, el);
        emit(true);
      },
      onMove: (i) => {
        if (dragIdx < 0) return;
        const l = toLocal(i.x, i.y);
        const p = pts[dragIdx];
        if (!p) return;
        /* 両端は x を動かさない（時間軸の 0 と 1 は固定） */
        if (dragIdx === 0) p.x = 0;
        else if (dragIdx === pts.length - 1) p.x = 1;
        else {
          const lo = pts[dragIdx - 1].x + 0.001;
          const hi = pts[dragIdx + 1].x - 0.001;
          p.x = clamp(l.x, Math.min(lo, hi), Math.max(lo, hi));
        }
        p.y = l.y;
        emit(true);
      },
      onEnd: () => {
        dragIdx = -1;
        call(c.onCommit || c.onChange, pts.map((p) => ({ x: p.x, y: p.y })), mode);
      }
    }));
    /* 長押し / ダブルタップで点を消す（両端は残す） */
    const removeAt = (ev) => {
      const l = toLocal(ev.clientX, ev.clientY);
      const n = nearest(l.x, l.y);
      if (n.d > 0.07) return;
      if (n.i <= 0 || n.i >= pts.length - 1) return;
      pts.splice(n.i, 1);
      vibrate(12, el);
      emit(true);
      call(c.onCommit || c.onChange, pts.map((p) => ({ x: p.x, y: p.y })), mode);
    };
    b.add(longPress(svg, removeAt, { ms: 420 }));
    b.on(svg, "dblclick", removeAt);
  }

  paint();
  return pack(el, {
    set: (next) => {
      if (!Array.isArray(next) || next.length < 2) return;
      pts = next.map((p) => ({ x: clamp(num(p && p.x, 0), 0, 1), y: clamp(num(p && p.y, 0), 0, 1) })).sort((a, b2) => a.x - b2.x);
      paint();
    },
    destroy: () => b.off()
  });
}

/* ── 17. キーフレームの行 ──────────────────────────────────────── */

/**
 * キーフレームの行。keys は秒の配列（または {time} の配列）。
 * @param {{label?:string,keys?:Array,time?:number,duration?:number,
 *          onAdd?:Function,onRemove?:Function,onSeek?:Function,onToggle?:Function}} o
 * @returns {HTMLElement & {el:HTMLElement,update:Function,destroy:Function}}
 */
export function keyframeRow(o) {
  const c = o || {};
  ensureCss();
  const el = mk("div", "vqs-kfrow");
  const lab = mk("span", "vqs-kfrow__label vqs-kfrow__name", String(c.label || ""));
  const prev = mkBtn("vqs-kfrow__btn", "‹", "前のキーフレームへ");
  const dot = mkBtn("vqs-kfrow__btn vqs-kfrow__dot", "", (c.label || "この値") + "のキーフレームを打つ／外す");
  dot.append(icon("keyframe"));
  const next = mkBtn("vqs-kfrow__btn", "›", "次のキーフレームへ");
  const track = mk("div", "vqs-kfrow__track");
  el.append(lab, prev, dot, next, track);

  let keys = [];
  let time = num(c.time, 0);
  let dur = num(c.duration, 0);

  const normKeys = (list) => (Array.isArray(list) ? list : [])
    .map((k) => (typeof k === "number" ? k : num(k && (k.time !== undefined ? k.time : k.t), NaN)))
    .filter((t) => Number.isFinite(t))
    .sort((a, b2) => a - b2);

  const span = () => {
    const m = keys.length ? keys[keys.length - 1] : 0;
    return Math.max(0.001, dur > 0 ? dur : Math.max(m, time) * 1.1 || 1);
  };
  const atNow = () => keys.some((t) => Math.abs(t - time) < 0.001);

  const b = binder();
  /* キーの listener は paint ごとに作り直すので別の袋に入れる（溜めない） */
  let kb = binder();
  function paint() {
    kb.off();
    kb = binder();
    while (track.firstChild) track.removeChild(track.firstChild);
    const s = span();
    for (const t of keys) {
      const k = mk("button", "vqs-kfrow__key" + (Math.abs(t - time) < 0.001 ? " vqs-kfrow__key--on" : ""));
      k.type = "button";
      k.style.left = (clamp(t / s, 0, 1) * 100) + "%";
      k.title = t.toFixed(2) + " 秒";
      k.setAttribute("aria-label", t.toFixed(2) + " 秒のキーフレーム");
      kb.on(k, "click", () => call(c.onSeek, t));
      kb.add(longPress(k, () => call(c.onRemove, t), { ms: 420 }));
      track.append(k);
    }
    dot.classList.toggle("vqs-kfrow__dot--on", atNow());
    dot.setAttribute("aria-pressed", atNow() ? "true" : "false");
  }

  b.on(dot, "click", () => {
    vibrate(8, dot);
    if (typeof c.onToggle === "function") { call(c.onToggle, time, atNow()); return; }
    if (atNow()) call(c.onRemove, time);
    else call(c.onAdd, time);
  });
  b.on(prev, "click", () => {
    const list = keys.filter((t) => t < time - 0.001);
    if (list.length) call(c.onSeek, list[list.length - 1]);
  });
  b.on(next, "click", () => {
    const t = keys.find((x) => x > time + 0.001);
    if (t !== undefined) call(c.onSeek, t);
  });

  keys = normKeys(c.keys);
  paint();
  return pack(el, {
    update: (st) => {
      const s = st || {};
      if (s.keys !== undefined) keys = normKeys(s.keys);
      if (s.time !== undefined) time = num(s.time, time);
      if (s.duration !== undefined) dur = num(s.duration, dur);
      paint();
    },
    set: (st) => { if (st && typeof st === "object") { if (st.keys) keys = normKeys(st.keys); if (st.time !== undefined) time = num(st.time, time); } else { time = num(st, time); } paint(); },
    destroy: () => { kb.off(); b.off(); }
  });
}

/* ── 18. 進み具合: progressRing / spinner / meterBar ─────────────── */

/**
 * 輪の進み具合（0..1）。
 * @param {{value?:number,size?:number,label?:string,thickness?:number}} o
 * @returns {HTMLElement & {el:HTMLElement,set:Function}}
 */
export function progressRing(o) {
  const c = o || {};
  ensureCss();
  const size = clamp(num(c.size, 44), 16, 400);
  const w = clamp(num(c.thickness, Math.max(3, size / 11)), 1, size / 2);
  const r = (size - w) / 2;
  const len = 2 * Math.PI * r;
  const el = mk("div", "vqs-ring");
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.setAttribute("role", "progressbar");
  const svg = svgEl("svg", { class: "vqs-ring__svg", viewBox: "0 0 " + size + " " + size, width: size, height: size });
  svg.append(svgEl("circle", { class: "vqs-ring__track", cx: size / 2, cy: size / 2, r, fill: "none", stroke: "#2c323b", "stroke-width": w }));
  const arc = svgEl("circle", {
    class: "vqs-ring__fill",
    cx: size / 2, cy: size / 2, r, fill: "none", stroke: "#2f6df6", "stroke-width": w,
    "stroke-linecap": "round", "stroke-dasharray": len.toFixed(2),
    transform: "rotate(-90 " + (size / 2) + " " + (size / 2) + ")"
  });
  svg.append(arc);
  el.append(svg);
  const text = mk("span", "vqs-ring__text vqs-ring__label");
  if (c.label !== false) el.append(text);

  let value = clamp(num(c.value, 0), 0, 1);
  function paint() {
    arc.setAttribute("stroke-dashoffset", (len * (1 - value)).toFixed(2));
    const pct = Math.round(value * 100);
    text.textContent = pct + "%";
    el.setAttribute("aria-valuenow", String(pct));
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", "100");
  }
  paint();
  return pack(el, { set: (v) => { value = clamp(num(v, 0), 0, 1); paint(); } });
}

/** 回るしるし（読み込み中） */
export function spinner(o) {
  ensureCss();
  const c = o || {};
  const el = mk("span", "vqs-spinner vqs-spin");
  if (c.size) { el.style.width = num(c.size, 20) + "px"; el.style.height = num(c.size, 20) + "px"; }
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", String(c.label || "読み込み中"));
  return pack(el, { destroy: () => { try { el.remove(); } catch (e) { /* noop */ } } });
}

/** 横棒のメーター（0..1）。音量・容量などに使う */
export function meterBar(o) {
  const c = o || {};
  ensureCss();
  const el = mk("div", "vqs-meter");
  const fill = mk("div", "vqs-meter__fill");
  el.append(fill);
  el.setAttribute("role", "meter");
  let value = clamp(num(c.value, 0), 0, 1);
  const paint = () => {
    fill.style.width = (value * 100) + "%";
    el.setAttribute("aria-valuenow", value.toFixed(3));
    el.classList.toggle("vqs-meter--hot", value > 0.92);
  };
  paint();
  return pack(el, { set: (v) => { value = clamp(num(v, 0), 0, 1); paint(); } });
}

/* ── 19. ツールチップ / 受け皿 ──────────────────────────────────── */

/**
 * ツールチップ（短絡キーも出せる）。指の端末では長押しで出す。
 * @returns {()=>void} 解除
 */
export function tooltip(el, text, o) {
  const c = o || {};
  if (!el) return () => { };
  ensureCss();
  const label = String(text === undefined || text === null ? "" : text);
  /* 器が壊れていても最低限 title で伝わること */
  try { el.title = label + (c.shortcut ? " (" + c.shortcut + ")" : ""); } catch (e) { /* noop */ }
  const b = binder();
  let tip = null;
  function show() {
    if (tip || !label) return;
    const h = host("menuHost");
    if (!h) return;
    tip = mk("div", "vqs-tip", label);
    if (c.shortcut) tip.append(mk("span", "vqs-tip__sk vqs-tip__key", String(c.shortcut)));
    tip.setAttribute("role", "tooltip");
    h.append(tip);
    placeNear(tip, anchorRect(el), {});
  }
  function hide() {
    if (!tip) return;
    try { tip.remove(); } catch (e) { /* noop */ }
    tip = null;
  }
  b.on(el, "pointerenter", () => { if (!isTouch()) show(); });
  b.on(el, "pointerleave", hide);
  b.on(el, "pointerdown", hide);
  b.on(el, "focus", show);
  b.on(el, "blur", hide);
  b.add(longPress(el, () => { show(); setTimeout(hide, 1600); }, { ms: 500 }));
  b.add(hide);
  return () => b.off();
}

/**
 * ファイルの受け皿（ドラッグ＆ドロップ）。
 * @param {HTMLElement} el
 * @param {{onFiles?:Function, accept?:string|Array}} o
 * @returns {()=>void} 解除
 */
export function dropZone(el, o) {
  const c = o || {};
  if (!el) return () => { };
  ensureCss();
  const accept = Array.isArray(c.accept)
    ? c.accept
    : (typeof c.accept === "string" && c.accept ? c.accept.split(",").map((s) => s.trim()).filter(Boolean) : null);

  const ok = (f) => {
    if (!accept || !accept.length) return true;
    const type = String(f.type || "").toLowerCase();
    const name = String(f.name || "").toLowerCase();
    return accept.some((a) => {
      const p = String(a).toLowerCase();
      if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
      if (p.startsWith(".")) return name.endsWith(p);
      return type === p;
    });
  };

  const b = binder();
  let depth = 0;
  const over = (on) => { el.classList.toggle("vqs-dropzone--over", on); el.classList.toggle("vqs-drop--over", on); };
  b.on(el, "dragenter", (ev) => { ev.preventDefault(); depth++; over(true); });
  b.on(el, "dragover", (ev) => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy"; });
  b.on(el, "dragleave", (ev) => { ev.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) over(false); });
  b.on(el, "drop", (ev) => {
    ev.preventDefault();
    depth = 0;
    over(false);
    const dt = ev.dataTransfer;
    const all = dt && dt.files ? Array.prototype.slice.call(dt.files) : [];
    const files = all.filter(ok);
    const rejected = all.length - files.length;
    if (rejected > 0) toast(rejected + " 個は扱えない形式でした", { kind: "warn" });
    if (files.length) call(c.onFiles, files, ev);
  });
  el.classList.add("vqs-dropzone");
  b.add(() => el.classList.remove("vqs-dropzone", "vqs-dropzone--over"));
  return () => b.off();
}

/* ── 20. まとめ（呼び側が 1 個の物として持ちたい時用）──────────────── */

/** widgets 全部を 1 個の object で（ui/app.js は module をそのまま渡すので保険） */
export const widgets = {
  openSheet, openModal, toast, menu, confirm, prompt,
  slider, numberDrag, stepper, colorField, segmented, toggle, select, tabs,
  textField, textArea, accordion, splitter, curveEditor, keyframeRow,
  progressRing, spinner, meterBar, tooltip, dropZone,
  longPress, pinch, drag, vibrate, icon, mount, clearHost, host,
  parseColor, toHex, rgbToHsv, hsvToRgb
};

export default widgets;
