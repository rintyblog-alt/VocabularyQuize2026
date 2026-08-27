/* ══════════════════════════════════════════════════════════════════════════
   操作。鍵盤・マウス・指。

   決めごと:
     ・**押した/離した は 溜める。** 1/60 の 歩と 画面の 描き は 別の 速さ。
       描きの ときに 「押されたか」を 見ると、速い 端末では 取りこぼす。
     ・カメラの 向きは ここでは 持たない（camera.js の 仕事）。
       ここは 「前・右・跳ぶ・飛び込み」だけを 出す。
     ・指の 操作盤は ui/touch.js が 作り、ここへ 値を 入れる。

   ★ 影の DOM の 中で 拾う。本体の 画面の 鍵盤操作と ぶつからない。
   ══════════════════════════════════════════════════════════════════════════ */

export const KEYMAP = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  dive: ["ShiftLeft", "ShiftRight"],
  camLeft: ["KeyQ"],
  camRight: ["KeyE"]
};

export class Input {
  /**
   * @param {HTMLElement} el 拾う 場所（影の DOM の 中の 板）
   */
  constructor(el) {
    this.el = el;
    this.keys = Object.create(null);
    this.axis = { x: 0, y: 0 };        /* 指の 棒 -1〜1 */
    this.jumpQueued = false;           /* 溜めた 「跳ぶ」 */
    this.jumpDown = false;
    this.diveQueued = false;
    this.look = { dx: 0, dy: 0 };      /* 見回した 量（読むと 0 に 戻る） */
    this.zoom = 0;
    this.pointerLocked = false;
    this.enabled = false;
    this.touchLook = 0;                /* 指で 見回している 指の id */
    this._binds = [];
    this._pointers = new Map();
    this._lastLook = { x: 0, y: 0 };
  }

  _on(target, type, fn, opt) {
    target.addEventListener(type, fn, opt || false);
    this._binds.push([target, type, fn, opt]);
  }

  attach() {
    if (this.enabled) return;
    this.enabled = true;
    const el = this.el;

    /* 鍵盤は window で 拾う（板に 焦点が 無くても 効く）。
       ただし 本体の 入力欄に 文字を 打っている ときは 何もしない。 */
    this._on(window, "keydown", (e) => {
      if (!this.enabled) return;
      if (this._typing()) return;
      const c = e.code;
      if (this._known(c)) { e.preventDefault(); }
      if (!this.keys[c]) {
        if (KEYMAP.jump.includes(c)) this.jumpQueued = true;
        if (KEYMAP.dive.includes(c)) this.diveQueued = true;
      }
      this.keys[c] = true;
      if (KEYMAP.jump.includes(c)) this.jumpDown = true;
    });
    this._on(window, "keyup", (e) => {
      const c = e.code;
      this.keys[c] = false;
      if (KEYMAP.jump.includes(c)) this.jumpDown = false;
    });
    this._on(window, "blur", () => { this.keys = Object.create(null); this.jumpDown = false; });

    /* マウスで 見回す。押している 間だけ。 */
    this._on(el, "pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, look: true });
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    this._on(el, "pointermove", (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      this.look.dx += e.clientX - p.x;
      this.look.dy += e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => {
      this._pointers.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    this._on(el, "pointerup", up);
    this._on(el, "pointercancel", up);
    this._on(el, "wheel", (e) => { e.preventDefault(); this.zoom += e.deltaY; }, { passive: false });
    this._on(el, "contextmenu", (e) => e.preventDefault());
    return this;
  }

  detach() {
    this.enabled = false;
    for (const [t, ty, fn, opt] of this._binds) { try { t.removeEventListener(ty, fn, opt); } catch (_) {} }
    this._binds.length = 0;
    this._pointers.clear();
    this.keys = Object.create(null);
    this.jumpDown = false;
  }

  _typing() {
    const a = document.activeElement;
    if (!a) return false;
    const t = (a.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || a.isContentEditable;
  }
  _known(c) {
    for (const k in KEYMAP) if (KEYMAP[k].includes(c)) return true;
    return false;
  }
  _any(list) { for (const c of list) if (this.keys[c]) return true; return false; }

  /** 画面の 前・右 を 世界の 向きへ 変えて 入力を 作る。 */
  build(cam, out) {
    out = out || {};
    let fx = 0, fz = 0;
    /* 鍵盤 */
    let f = 0, r = 0;
    if (this._any(KEYMAP.forward)) f += 1;
    if (this._any(KEYMAP.back)) f -= 1;
    if (this._any(KEYMAP.right)) r += 1;
    if (this._any(KEYMAP.left)) r -= 1;
    /* 指の 棒（あれば 上書きせず 足す） */
    f += -this.axis.y;
    r += this.axis.x;
    const mag = Math.hypot(f, r);
    if (mag > 1) { f /= mag; r /= mag; }

    if (mag > 0.001) {
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      /* 前 = カメラの 見ている 向き（水平） */
      fx = -sy * f + cy * r;
      fz = -cy * f - sy * r;
    }
    out.mx = fx; out.mz = fz;
    out.jump = this.jumpQueued;
    out.jumpDown = this.jumpDown || this.touchJump === true;
    out.dive = this.diveQueued;
    this.jumpQueued = false;
    this.diveQueued = false;
    return out;
  }

  /** 見回した 量を 取り出す（取ると 0 に 戻る） */
  takeLook() {
    const dx = this.look.dx, dy = this.look.dy;
    this.look.dx = 0; this.look.dy = 0;
    return { dx, dy };
  }
  takeZoom() { const z = this.zoom; this.zoom = 0; return z; }

  /* 指の 操作盤から 呼ぶ */
  setAxis(x, y) { this.axis.x = x; this.axis.y = y; }
  pressJump() { this.jumpQueued = true; this.touchJump = true; }
  releaseJump() { this.touchJump = false; }
  pressDive() { this.diveQueued = true; }
  addLook(dx, dy) { this.look.dx += dx; this.look.dy += dy; }
}
