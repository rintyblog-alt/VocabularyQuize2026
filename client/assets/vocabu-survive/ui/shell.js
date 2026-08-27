/* ══════════════════════════════════════════════════════════════════════════
   影の DOM の 器と、画面の 出し入れ。

   ここが VocabuSurvive の 唯一の 「外との 境目」。
   本体の CSS も 本体の JS も この 中には 入って来られない。

   画面（screen）の 決まりごと:
     ・el   … 中身の 要素（vs-screen の 子）
     ・enter(arg) … 出るとき。await できる。
     ・exit()      … 引っ込むとき
     ・resize()    … 大きさが 変わったとき
     ・tick(dt)    … 毎フレーム 要るときだけ
   ══════════════════════════════════════════════════════════════════════════ */
import { CSS } from "./theme.js";

export class Shell {
  /** @param {HTMLElement} host 置き場（本体の DOM） */
  constructor(host) {
    this.host = host;
    this.mountEl = document.createElement("div");
    this.mountEl.className = "vq-survive-host";
    this.mountEl.style.cssText = "position:absolute;inset:0;overflow:hidden;";
    host.appendChild(this.mountEl);

    this.root = this.mountEl.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = CSS;
    this.root.appendChild(st);

    this.container = document.createElement("div");
    this.container.className = "vs-root";
    this.root.appendChild(this.container);

    /** @type {Map<string, any>} */
    this.screens = new Map();
    this.current = "";
    this._ro = null;
    this._raf = 0;
    this._last = 0;
    this._tickers = new Set();
    this._destroyed = false;
    this._size = { w: 0, h: 0 };

    /* 読み上げ用の 生放送欄。画面が 変わったことを 伝える。 */
    this.live = document.createElement("div");
    this.live.className = "vs-sr";
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    this.container.appendChild(this.live);

    this._observeSize();
  }

  _observeSize() {
    const on = () => {
      const w = this.mountEl.clientWidth, h = this.mountEl.clientHeight;
      if (w === this._size.w && h === this._size.h) return;
      this._size.w = w; this._size.h = h;
      for (const s of this.screens.values()) { if (s.resize) { try { s.resize(w, h); } catch (e) {} } }
    };
    if (typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver(on);
      this._ro.observe(this.mountEl);
    } else {
      this._onWin = on;
      window.addEventListener("resize", on);
    }
    on();
  }

  get size() { return this._size; }

  /** 画面を 登録する。el は 自動で 包む。 */
  register(name, screen) {
    const wrap = document.createElement("section");
    wrap.className = "vs-screen";
    wrap.setAttribute("data-screen", name);
    wrap.setAttribute("aria-hidden", "true");
    /* 隠れている 間は 中の ボタンを 触れなくする（読み上げの 迷子を 防ぐ） */
    wrap.inert = true;
    if (screen.el) wrap.appendChild(screen.el);
    this.container.appendChild(wrap);
    screen.wrap = wrap;
    screen.shell = this;
    this.screens.set(name, screen);
    return screen;
  }

  get(name) { return this.screens.get(name); }

  /** 画面を 切り替える。前の画面の exit を 待ってから 出す。 */
  async show(name, arg) {
    if (this._destroyed) return;
    if (this.current === name) {
      const s = this.screens.get(name);
      if (s && s.enter) { try { await s.enter(arg); } catch (e) { console.error("[VocabuSurvive] enter", e); } }
      return;
    }
    const prev = this.screens.get(this.current);
    const next = this.screens.get(name);
    if (!next) { console.warn("[VocabuSurvive] 画面が ありません: " + name); return; }

    if (prev) {
      prev.wrap.setAttribute("data-on", "0");
      prev.wrap.setAttribute("aria-hidden", "true");
      prev.wrap.inert = true;
      if (prev.exit) { try { await prev.exit(); } catch (e) { console.error("[VocabuSurvive] exit", e); } }
      if (prev.tick) this._tickers.delete(prev);
    }
    this.current = name;
    next.wrap.setAttribute("data-on", "1");
    next.wrap.setAttribute("aria-hidden", "false");
    next.wrap.inert = false;
    if (next.resize) { try { next.resize(this._size.w, this._size.h); } catch (e) {} }
    if (next.enter) { try { await next.enter(arg); } catch (e) { console.error("[VocabuSurvive] enter", e); } }
    if (next.tick) this._tickers.add(next);
    this._ensureLoop();
    if (next.title) this.announce(next.title);
  }

  announce(text) { try { this.live.textContent = String(text || ""); } catch (e) {} }

  _ensureLoop() {
    if (this._raf || this._destroyed) return;
    if (!this._tickers.size) return;
    this._last = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const step = (now) => {
      if (this._destroyed) { this._raf = 0; return; }
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      for (const s of this._tickers) {
        try { s.tick(dt, now); } catch (e) { console.error("[VocabuSurvive] tick", e); }
      }
      this._raf = this._tickers.size ? requestAnimationFrame(step) : 0;
    };
    this._raf = requestAnimationFrame(step);
  }

  /** 画面の 外から 毎フレーム 呼びたい ものを 足す（試合の 進みなど） */
  addTicker(obj) { this._tickers.add(obj); this._ensureLoop(); }
  removeTicker(obj) { this._tickers.delete(obj); }

  destroy() {
    this._destroyed = true;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._tickers.clear();
    for (const s of this.screens.values()) {
      try { if (s.destroy) s.destroy(); } catch (e) {}
    }
    this.screens.clear();
    if (this._ro) { try { this._ro.disconnect(); } catch (e) {} this._ro = null; }
    if (this._onWin) { try { window.removeEventListener("resize", this._onWin); } catch (e) {} this._onWin = null; }
    try { this.mountEl.remove(); } catch (e) {}
  }
}

/* ── 小さな 作り手 ────────────────────────────────────────────────────
   innerHTML を 使わない。外から 来る 文字（あだ名・コース名）を
   そのまま 入れられるようにするため。 */
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k === "text") e.textContent = String(v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") e.innerHTML = v;   /* 自分で 書いた 固定の 印だけ */
      else e.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    e.appendChild(typeof k === "string" || typeof k === "number" ? document.createTextNode(String(k)) : k);
  }
  return e;
}

/** 図（svg）を 作る。h と 同じ 使い方。 */
export function svg(tag, attrs, ...kids) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v !== null && v !== undefined && v !== false) e.setAttribute(k, String(v)); }
  for (const k of kids) if (k) e.appendChild(k);
  return e;
}
