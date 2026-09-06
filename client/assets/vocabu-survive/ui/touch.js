/* ══════════════════════════════════════════════════════════════════════════
   指の 操作盤。

   置き方（要件どおり 縦でも 横でも）:
     左下 … 丸い 棒（動く）
     右下 … 跳ぶ（大）／ 飛び込み（小）
     画面の 残り … なぞると カメラが 回る

   決めごと:
     ・棒は **押した 場所に 出る**（置き場所を 固定しない）。
       固定すると 端末の 大きさや 持ち方で 届かない。
     ・セーフエリアを 必ず 空ける（iPhone の 下の 帯・切り欠き）。
     ・押した 指の id を 覚える。**離した 指だけ**を 消す
       （まとめて 消すと 反対の 指まで 死ぬ）。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE } from "./theme.js";

/* 棒の 置き場の 目印を もう 出さない 印 */
const HOME_KEY = "vq.survive.stickhome.v1";

export class TouchPad {
  /**
   * @param {import("../game/input.js").Input} input
   */
  constructor(input) {
    this.input = input;
    this.visible = false;
    this.stickId = null;
    this.lookId = null;
    this.origin = { x: 0, y: 0 };
    this.el = this._build();
    this._bind();
  }

  _build() {
    this.stick = h("div", { class: "vs-stick", "aria-hidden": "true" },
      h("i", { class: "vs-stick-ring" }), h("i", { class: "vs-stick-knob" }));
    this.jumpBtn = h("button", {
      class: "vs-tbtn vs-tbtn-jump", type: "button",
      "aria-label": "ジャンプ"
    }, svg("svg", { viewBox: "0 0 24 24", width: "30", height: "30", "aria-hidden": "true" },
      svg("path", { d: "M12 4 6 11h4v9h4v-9h4L12 4Z", fill: "currentColor" })));
    this.diveBtn = h("button", {
      class: "vs-tbtn vs-tbtn-dive", type: "button",
      "aria-label": "飛び込み"
    }, svg("svg", { viewBox: "0 0 24 24", width: "22", height: "22", "aria-hidden": "true" },
      svg("path", { d: "M3 15h13a4 4 0 0 0 0-8H9", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" }),
      svg("path", { d: "M6 5 3 8l3 3", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" })));
    this.lookArea = h("div", { class: "vs-lookarea", "aria-hidden": "true" });
    /* ★ 棒の 出る ところの 目印（2026-08-31）。
       「押した 場所に 出る」は 良い 作りだが、**初めての 人は
       どこを 押せば いいか 分からない**（実写で 左下に 何も 無い）。
       1 度でも 動かしたら 二度と 出さない。 */
    this.homeEl = h("div", { class: "vs-stickhome", "aria-hidden": "true" },
      h("i", { class: "vs-stickhome-r" }),
      h("span", { class: "vs-stickhome-t", text: "ここを なぞって 走る" }));
    return h("div", { class: "vs-touch" }, this.lookArea, this.homeEl, this.stick, this.diveBtn, this.jumpBtn);
  }

  /* 目印を 消す。1 度 触れば もう 要らない（覚えて おく）。 */
  _hideHome() {
    if (this._homeGone) return;
    this._homeGone = true;
    try { this.homeEl.setAttribute("data-off", "1"); } catch (e) {}
    try { localStorage.setItem(HOME_KEY, "1"); } catch (e) {}
  }
  /* 手ごたえ。**無い 端末では 何も しない**（できるふりを しない）。 */
  _buzz(ms) {
    try {
      if (this._noBuzz) return;
      if (navigator && typeof navigator.vibrate === "function") navigator.vibrate(ms);
    } catch (e) { this._noBuzz = true; }
  }

  _bind() {
    const I = this.input;
    const stickZone = this.el;

    const start = (e) => {
      if (!this.visible) return;
      const t = e.target;
      if (t === this.jumpBtn || this.jumpBtn.contains(t)) { I.pressJump(); this._buzz(12); e.preventDefault(); return; }
      if (t === this.diveBtn || this.diveBtn.contains(t)) { I.pressDive(); this._buzz(8); e.preventDefault(); return; }
      const r = this.el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      /* 左半分 かつ 下 3 分の 2 → 棒 */
      if (this.stickId === null && x < r.width * 0.5 && y > r.height * 0.30) {
        this.stickId = e.pointerId;
        this.origin.x = x; this.origin.y = y;
        this.stick.style.left = x + "px";
        this.stick.style.top = y + "px";
        this.stick.setAttribute("data-on", "1");
        this._hideHome();
        this._knob(0, 0);
        e.preventDefault();
        return;
      }
      if (this.lookId === null) {
        this.lookId = e.pointerId;
        this._lx = e.clientX; this._ly = e.clientY;
      }
    };
    const move = (e) => {
      if (e.pointerId === this.stickId) {
        const r = this.el.getBoundingClientRect();
        const dx = (e.clientX - r.left) - this.origin.x;
        const dy = (e.clientY - r.top) - this.origin.y;
        const max = 52;
        const l = Math.hypot(dx, dy);
        const k = l > max ? max / l : 1;
        this._knob(dx * k, dy * k);
        I.setAxis((dx * k) / max, (dy * k) / max);
        e.preventDefault();
      } else if (e.pointerId === this.lookId) {
        I.addLook(e.clientX - this._lx, e.clientY - this._ly);
        this._lx = e.clientX; this._ly = e.clientY;
      }
    };
    const end = (e) => {
      /* ★ 離した 指だけを 消す。まとめて 消すと 反対の 指が 死ぬ。 */
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stick.removeAttribute("data-on");
        I.setAxis(0, 0);
      }
      if (e.pointerId === this.lookId) this.lookId = null;
      I.releaseJump();
    };

    stickZone.addEventListener("pointerdown", start, { passive: false });
    stickZone.addEventListener("pointermove", move, { passive: false });
    stickZone.addEventListener("pointerup", end);
    stickZone.addEventListener("pointercancel", end);
    stickZone.addEventListener("pointerleave", end);
    this.jumpBtn.addEventListener("pointerup", () => I.releaseJump());
    this.jumpBtn.addEventListener("pointercancel", () => I.releaseJump());
  }

  _knob(x, y) {
    const k = this.stick.querySelector(".vs-stick-knob");
    if (k) k.style.transform = "translate(" + (x - 22) + "px," + (y - 22) + "px)";
  }

  show(on) {
    /* 前に 動かした ことが あれば 目印は 出さない。 */
    try {
      if (localStorage.getItem(HOME_KEY) === "1") { this._homeGone = true; this.homeEl.setAttribute("data-off", "1"); }
      else if (on) { this._homeGone = false; this.homeEl.removeAttribute("data-off"); }
    } catch (e) {}

    this.visible = !!on;
    this.el.setAttribute("data-on", on ? "1" : "0");
    if (!on) { this.input.setAxis(0, 0); this.stickId = null; this.lookId = null; }
  }
}

export const TOUCH_CSS = `
.vs-touch{ position:absolute; inset:0; display:none; touch-action:none; z-index:6; }
.vs-touch[data-on="1"]{ display:block; }
.vs-lookarea{ position:absolute; inset:0; }
.vs-stick{
  position:absolute; width:0; height:0; opacity:0; transition:opacity .12s ease;
  pointer-events:none;
}
.vs-stick[data-on="1"]{ opacity:1; }
.vs-stick-ring{
  position:absolute; left:-58px; top:-58px; width:116px; height:116px; border-radius:50%;
  /* 遊んでいる 絵の 上に 置く 輪。ここだけは 下が 透けないと 走れないので
     アプリの 面の 色を **薄めて** 使う（色そのものは 本体の トークン）。 */
  border:2px solid var(--vs-line-strong);
  background:color-mix(in srgb, var(--vs-surface) 46%, transparent);
}
.vs-stick-knob{
  position:absolute; width:44px; height:44px; border-radius:50%;
  background:var(--vs-ink); box-shadow:var(--vs-sh-raised);
  will-change: transform;
}
/* 棒の 置き場の 目印。1 度 触ったら 消える。 */
.vs-stickhome{
  position:absolute; left:calc(26px + var(--vs-safe-l)); bottom:calc(34px + var(--vs-safe-b));
  width:112px; display:flex; flex-direction:column; align-items:center; gap:8px;
  pointer-events:none; opacity:.9; transition:opacity .35s ease;
}
.vs-stickhome[data-off="1"]{ opacity:0; }
.vs-stickhome-r{
  width:104px; height:104px; border-radius:50%;
  border:2px dashed var(--vs-line-strong);
  background:color-mix(in srgb, var(--vs-surface) 24%, transparent);
  animation: vsHome 2.4s ease-in-out infinite;
}
.vs-stickhome-t{
  font-size:11px; font-weight:650; color:var(--vs-ink);
  text-shadow:0 1px 6px rgba(4,6,20,.9); white-space:nowrap;
}
@keyframes vsHome{ 0%,100%{ transform:scale(1); opacity:.75; } 50%{ transform:scale(1.06); opacity:1; } }
@media (prefers-reduced-motion:reduce){ .vs-stickhome-r{ animation:none; } }

.vs-tbtn{
  position:absolute; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  color:var(--vs-accent-ink); border:0;
  background:var(--vs-accent);
  box-shadow:var(--vs-sh-floating);
  touch-action:none; user-select:none; -webkit-user-select:none;
}
.vs-tbtn:active{ transform:scale(.96); box-shadow:var(--vs-sh-raised); }
.vs-tbtn-jump{
  width:96px; height:96px;
  right:calc(20px + var(--vs-safe-r)); bottom:calc(28px + var(--vs-safe-b));
}
.vs-tbtn-dive{
  width:66px; height:66px;
  right:calc(126px + var(--vs-safe-r)); bottom:calc(34px + var(--vs-safe-b));
  background:var(--vs-surface); color:var(--vs-ink); border:1px solid var(--vs-line);
  box-shadow:var(--vs-sh-floating);
}
.vs-tbtn-dive:active{ box-shadow:var(--vs-sh-raised); }
/* 横向きで 画面が 低い ときは 少し 小さく */
@media (max-height: 460px){
  .vs-tbtn-jump{ width:80px; height:80px; bottom:calc(16px + var(--vs-safe-b)); }
  .vs-tbtn-dive{ width:58px; height:58px; right:calc(108px + var(--vs-safe-r)); bottom:calc(20px + var(--vs-safe-b)); }
}
`;
