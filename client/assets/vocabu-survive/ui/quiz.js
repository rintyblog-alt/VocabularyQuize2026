/* ══════════════════════════════════════════════════════════════════════════
   クイズの 窓。

   ★ **ゲームを 止めない。** 画面の 下 3 分の 1 に 重ねるだけ。
     走りながら 読んで、走りながら 押す。
     止めると 「クイズは 邪魔もの」に なる。要件の 芯は その 逆。

   決めごと:
     ・ボタンは 大きく（要件）。指で 走りながら 押せる 大きさ。
     ・残り時間は **輪**で 見せる。数字だと 読む 手間が 増える。
     ・正解／不正解は 色 だけで 伝えない（○×の 印と 文字も 出す）。
     ・鍵盤の 1〜4 でも 選べる。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE } from "./theme.js";

export class QuizPanel {
  /** @param {(index:number)=>void} onAnswer */
  constructor(onAnswer) {
    this.onAnswer = onAnswer || (() => {});
    this.open = false;
    this.answered = false;
    this.limit = 12;
    this.left = 0;
    this.btns = [];
    this.el = this._build();
    this._key = (e) => {
      if (!this.open || this.answered) return;
      const n = "1234".indexOf(e.key);
      if (n >= 0 && this.btns[n] && !this.btns[n].disabled) { e.preventDefault(); this._pick(n); }
    };
  }

  _build() {
    this.qEl = h("p", { class: "vs-quiz-q" });
    this.tagEl = h("span", { class: "vs-quiz-tag", text: "QUIZ GATE" });
    this.ringPath = svg("circle", {
      cx: "17", cy: "17", r: "15", fill: "none", style: "stroke:var(--vs-accent)",
      "stroke-width": "3.4", "stroke-linecap": "round",
      "stroke-dasharray": "94.2", "stroke-dashoffset": "0",
      transform: "rotate(-90 17 17)"
    });
    this.ring = svg("svg", { viewBox: "0 0 34 34", width: "34", height: "34", class: "vs-quiz-ring", "aria-hidden": "true" },
      svg("circle", { cx: "17", cy: "17", r: "15", fill: "none", style: "stroke:var(--vs-line)", "stroke-width": "3.4" }),
      this.ringPath);
    this.leftEl = h("span", { class: "vs-quiz-left vs-mono", text: "" });

    const grid = h("div", { class: "vs-quiz-grid" });
    for (let i = 0; i < 4; i++) {
      const label = h("span", { class: "vs-quiz-label" });
      const key = h("kbd", { class: "vs-quiz-key", text: String(i + 1) });
      const b = h("button", { class: "vs-quiz-opt", type: "button", onclick: () => this._pick(i) }, key, label);
      b._label = label;
      this.btns.push(b);
      grid.appendChild(b);
    }
    this.grid = grid;
    this.feedEl = h("div", { class: "vs-quiz-feed", role: "status", "aria-live": "assertive" });

    return h("div", { class: "vs-quiz", role: "dialog", "aria-label": "クイズ" },
      h("div", { class: "vs-quiz-card" },
        h("div", { class: "vs-quiz-head" }, this.tagEl, this.qEl, h("div", { class: "vs-quiz-timer" }, this.ring, this.leftEl)),
        grid, this.feedEl));
  }

  attach() { window.addEventListener("keydown", this._key, true); }
  detach() { window.removeEventListener("keydown", this._key, true); }

  /**
   * @param {{prompt:string, choices:string[], answer:number, tag?:string}} q
   * @param {number} limit 秒
   */
  ask(q, limit) {
    this.q = q;
    this.limit = limit || 12;
    this.left = this.limit;
    this.answered = false;
    this.open = true;
    this.qEl.textContent = q.prompt || "";
    this.tagEl.textContent = q.tag || "QUIZ GATE";
    const cs = q.choices || [];
    for (let i = 0; i < 4; i++) {
      const b = this.btns[i];
      b.disabled = false;
      b.removeAttribute("data-state");
      b._label.textContent = cs[i] === undefined ? "" : String(cs[i]);
      b.style.display = cs[i] === undefined ? "none" : "";
    }
    this.feedEl.textContent = "";
    this.feedEl.removeAttribute("data-kind");
    this.el.setAttribute("data-on", "1");
    this._ring(1);
  }

  _ring(k) {
    const C = 94.2;
    this.ringPath.setAttribute("stroke-dashoffset", String(C * (1 - k)));
    /* ★ SVG の 属性に var() は 効かない。style で 当てる。 */
    this.ringPath.style.stroke = k < 0.25 ? "var(--vs-danger)" : (k < 0.5 ? "var(--vs-warn)" : "var(--vs-accent)");
  }

  tick(dt) {
    if (!this.open || this.answered) return;
    this.left = Math.max(0, this.left - dt);
    const k = this.left / this.limit;
    this._ring(k);
    const s = Math.ceil(this.left);
    if (s !== this._lastS) { this._lastS = s; this.leftEl.textContent = String(s); }
    if (this.left <= 0) this._pick(-1);
  }

  _pick(i) {
    if (this.answered) return;
    this.answered = true;
    const right = this.q ? this.q.answer : 0;
    const correct = i === right;
    for (let k = 0; k < 4; k++) {
      const b = this.btns[k];
      b.disabled = true;
      if (k === right) b.setAttribute("data-state", "right");
      else if (k === i) b.setAttribute("data-state", "wrong");
    }
    if (i < 0) {
      this.feedEl.textContent = "⏱ 時間切れ — 少し 遅くなります";
      this.feedEl.setAttribute("data-kind", "bad");
    } else if (correct) {
      this.feedEl.textContent = "○ 正解 — 少しの 間 速くなります";
      this.feedEl.setAttribute("data-kind", "good");
    } else {
      this.feedEl.textContent = "× 不正解 — 少し 遅くなります";
      this.feedEl.setAttribute("data-kind", "bad");
    }
    try { this.onAnswer(i, correct); } catch (e) { console.error(e); }
    setTimeout(() => this.close(), correct ? 780 : 1150);
  }

  close() {
    this.open = false;
    this.el.removeAttribute("data-on");
  }
}

export const QUIZ_CSS = `
.vs-quiz{
  position:absolute; left:0; right:0; bottom:0; z-index:7;
  display:flex; justify-content:center;
  padding: 0 calc(14px + var(--vs-safe-r)) calc(14px + var(--vs-safe-b)) calc(14px + var(--vs-safe-l));
  opacity:0; transform:translateY(18px); pointer-events:none;
  transition: opacity .22s ease, transform .22s cubic-bezier(.2,1,.3,1);
}
.vs-quiz[data-on="1"]{ opacity:1; transform:none; pointer-events:auto; }
.vs-quiz-card{
  width:min(760px, 100%);
  background:var(--vs-surface); border:1px solid var(--vs-line);
  border-radius:var(--vs-r-lg); padding:14px 16px 16px;
  box-shadow:var(--vs-sh-raised);
}
.vs-quiz-head{ display:grid; grid-template-columns:1fr auto; grid-template-rows:auto auto; gap:2px 12px; align-items:center; }
.vs-quiz-tag{ grid-column:1; font-size:10.5px; font-weight:750; letter-spacing:.16em; color:${PALETTE.amber}; }
.vs-quiz-q{ grid-column:1; font-size:clamp(16px,2.6vw,21px); font-weight:650; line-height:1.4; }
.vs-quiz-timer{ grid-column:2; grid-row:1 / span 2; position:relative; width:34px; height:34px; }
.vs-quiz-ring{ display:block; }
.vs-quiz-left{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:650; }
.vs-quiz-grid{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:12px; }
.vs-quiz-opt{
  display:flex; align-items:center; gap:10px;
  min-height:58px; padding:10px 14px; border-radius:var(--vs-r-md); text-align:left;
  background:var(--vs-surface-2); border:1.5px solid var(--vs-line);
  font-size:15px; font-weight:700; color:${PALETTE.ink};
  transition: background .12s ease, border-color .12s ease, transform .1s ease;
}
.vs-quiz-opt:hover:not([disabled]){ background:var(--vs-surface-3); }
.vs-quiz-opt:active:not([disabled]){ transform:scale(.98); }
.vs-quiz-opt:focus-visible{ outline:3px solid ${PALETTE.amber}; outline-offset:2px; }
.vs-quiz-key{
  flex:0 0 auto; width:24px; height:24px; border-radius:var(--vs-r-xs);
  display:inline-flex; align-items:center; justify-content:center;
  background:var(--vs-surface-3); font-size:11px; font-weight:650; font-family:inherit;
}
.vs-quiz-label{ flex:1; }
/* ★ 色だけで 伝えない。印を 付ける。 */
.vs-quiz-opt[data-state="right"]{ background:var(--vs-good-bg); border-color:var(--vs-good); }
.vs-quiz-opt[data-state="right"] .vs-quiz-key::after{ content:"○"; }
.vs-quiz-opt[data-state="right"] .vs-quiz-key{ background:var(--vs-good); color:var(--vs-solid-ink); font-size:13px; }
.vs-quiz-opt[data-state="wrong"]{ background:var(--vs-danger-bg); border-color:var(--vs-danger); }
.vs-quiz-opt[data-state="wrong"] .vs-quiz-key{ background:var(--vs-danger); color:var(--vs-solid-ink); font-size:13px; }
.vs-quiz-opt[data-state="wrong"] .vs-quiz-key::after{ content:"×"; }
.vs-quiz-opt[data-state] .vs-quiz-key{ font-size:0; }
.vs-quiz-feed{ margin-top:10px; min-height:18px; font-size:13px; font-weight:700; color:var(--vs-ink-sub); }
.vs-quiz-feed[data-kind="good"]{ color:${PALETTE.good}; }
.vs-quiz-feed[data-kind="bad"]{ color:${PALETTE.danger}; }
/* ★ スマホでも **2 列**。1 列に すると 札が 縦に 伸びて
   跳ぶ ボタンまで 覆う（390px の 実機写真で 確認）。
   走りながら 押せる ことが この 機能の 芯なので、
   ボタンを 隠さない ほうを 優先する。 */
@media (max-width: 560px){
  .vs-quiz-grid{ grid-template-columns:1fr 1fr; gap:6px; }
  .vs-quiz-opt{ min-height:52px; font-size:13.5px; padding:8px 10px; gap:7px; }
  .vs-quiz-key{ width:20px; height:20px; font-size:10px; }
  .vs-quiz-card{ padding:11px 11px 12px; border-radius:var(--vs-r-md); }
  .vs-quiz-feed{ margin-top:8px; font-size:12px; }
}
@media (max-width: 380px){
  .vs-quiz-opt{ min-height:46px; font-size:12.5px; }
}
@media (max-height: 460px){
  .vs-quiz-grid{ grid-template-columns:1fr 1fr; gap:6px; }
  .vs-quiz-opt{ min-height:44px; font-size:13px; }
}
`;
