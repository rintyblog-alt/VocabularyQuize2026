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
    return h("div", { class: "vs-touch" }, this.lookArea, this.stick, this.diveBtn, this.jumpBtn);
  }

  _bind() {
    const I = this.input;
    const stickZone = this.el;

    const start = (e) => {
      if (!this.visible) return;
      const t = e.target;
      if (t === this.jumpBtn || this.jumpBtn.contains(t)) { I.pressJump(); e.preventDefault(); return; }
      if (t === this.diveBtn || this.diveBtn.contains(t)) { I.pressDive(); e.preventDefault(); return; }
      const r = this.el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      /* 左半分 かつ 下 3 分の 2 → 棒 */
      if (this.stickId === null && x < r.width * 0.5 && y > r.height * 0.30) {
        this.stickId = e.pointerId;
        this.origin.x = x; this.origin.y = y;
        this.stick.style.left = x + "px";
        this.stick.style.top = y + "px";
        this.stick.setAttribute("data-on", "1");
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
  border:2px solid rgba(255,255,255,.30); background:rgba(10,14,34,.28);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.vs-stick-knob{
  position:absolute; width:44px; height:44px; border-radius:50%;
  background:rgba(255,255,255,.86); box-shadow:0 4px 14px rgba(0,0,0,.34);
  will-change: transform;
}
.vs-tbtn{
  position:absolute; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  color:#231702; border:0;
  background:linear-gradient(180deg,#ffc94a,${PALETTE.amber});
  box-shadow:0 5px 0 #b97400, 0 10px 22px rgba(0,0,0,.30);
  touch-action:none; user-select:none; -webkit-user-select:none;
}
.vs-tbtn:active{ transform:translateY(4px); box-shadow:0 1px 0 #b97400; }
.vs-tbtn-jump{
  width:96px; height:96px;
  right:calc(20px + var(--vs-safe-r)); bottom:calc(28px + var(--vs-safe-b));
}
.vs-tbtn-dive{
  width:66px; height:66px;
  right:calc(126px + var(--vs-safe-r)); bottom:calc(34px + var(--vs-safe-b));
  background:linear-gradient(180deg,#8fd8ff,${PALETTE.blue}); color:#04203f;
  box-shadow:0 5px 0 #2a5bb8, 0 10px 22px rgba(0,0,0,.30);
}
.vs-tbtn-dive:active{ box-shadow:0 1px 0 #2a5bb8; }
/* 横向きで 画面が 低い ときは 少し 小さく */
@media (max-height: 460px){
  .vs-tbtn-jump{ width:80px; height:80px; bottom:calc(16px + var(--vs-safe-b)); }
  .vs-tbtn-dive{ width:58px; height:58px; right:calc(108px + var(--vs-safe-r)); bottom:calc(20px + var(--vs-safe-b)); }
}
`;
