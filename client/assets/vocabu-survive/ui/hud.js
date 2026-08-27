/* ══════════════════════════════════════════════════════════════════════════
   遊んでいる 間に 出る もの。

   要件どおり: 時計・順位・人・コース名・中間地点
   ＋ 合図（3・2・1・GO）と、門の 前の 予告。

   決めごと:
     ・**毎フレーム 文字を 書き換えない。** 変わった ときだけ 書く。
       60Hz で textContent を 触ると それだけで 描きが 詰まる。
     ・順位表は 8 行 固定。作り直さず 中身だけ 差し替える。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE, beanByIndex } from "./theme.js";

/* ── 操作の 説明 ─────────────────────────────────────────────────────
   ★ **初めて 遊ぶ 人は 何を 押せば よいか 分からない。**
     3D の 遊びは 走り方が 分からないだけで 「壊れている」に 見える。
     最初の 1 回だけ 出し、以後は ロビーの ？ から 見られる ように する。 */
const HELP_KEY = "vq.survive.helpseen.v1";

export class HelpCard {
  constructor(onClose) {
    this.onClose = onClose || (() => {});
    this.el = this._build();
  }
  _row(k, t) {
    const keys = h("span", { class: "vs-help-keys" });
    for (const x of k) keys.appendChild(h("kbd", { class: "vs-help-k", text: x }));
    return h("div", { class: "vs-help-row" }, keys, h("span", { class: "vs-help-t", text: t }));
  }
  _build() {
    const 机 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "キーボード / マウス" }),
      this._row(["W", "A", "S", "D"], "走る"),
      this._row(["Space"], "跳ぶ（長く押すと 高く）"),
      this._row(["Shift"], "飛び込み（前へ 突っ込む）"),
      this._row(["Q", "E"], "カメラを 回す"),
      this._row(["ドラッグ"], "カメラを 回す"),
      this._row(["1", "2", "3", "4"], "クイズに 答える"));
    const 指 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "スマホ / タブレット" }),
      this._row(["左下"], "押した 場所に 棒が 出る → 走る"),
      this._row(["右下 ⬆"], "跳ぶ"),
      this._row(["右下 ↩"], "飛び込み"),
      this._row(["なぞる"], "カメラを 回す"),
      this._row(["札を 押す"], "クイズに 答える"));
    const 遊び方 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "遊び方" }),
      h("p", { class: "vs-help-p", text: "クイズの 門を 通らないと 先へ 進めません。" }),
      h("p", { class: "vs-help-p", text: "正解すると 少しの 間 速くなり、外すと 少し 遅くなります。" }),
      h("p", { class: "vs-help-p", text: "落ちても 中間地点から やり直せます（サバイバルは 3 回まで）。" }),
      h("p", { class: "vs-help-p", text: "走りながら 読んで、走りながら 答えられます。" }));
    return h("div", { class: "vs-help", role: "dialog", "aria-label": "操作の 説明" },
      h("div", { class: "vs-help-card" },
        h("h3", { class: "vs-help-title", text: "あそび方" }),
        h("div", { class: "vs-help-grid" }, 机, 指, 遊び方),
        h("button", {
          class: "vs-btn", type: "button",
          onclick: () => this.hide()
        }, "はじめる")));
  }
  show() { this.el.setAttribute("data-on", "1"); this.open = true; }
  hide() {
    this.el.removeAttribute("data-on");
    this.open = false;
    try { localStorage.setItem(HELP_KEY, "1"); } catch (e) {}
    try { this.onClose(); } catch (e) {}
  }
  static seen() {
    try { return localStorage.getItem(HELP_KEY) === "1"; } catch (e) { return false; }
  }
}

export class HUD {
  constructor() {
    this._last = Object.create(null);
    this.rows = [];
    this.el = this._build();
  }

  _build() {
    this.timeEl = h("span", { class: "vs-hud-time vs-mono", text: "0:00" });
    this.rankNum = h("span", { class: "vs-hud-rank-n vs-mono", text: "–" });
    this.rankOf = h("span", { class: "vs-hud-rank-of", text: "/ –" });
    this.courseEl = h("span", { class: "vs-hud-course", text: "" });
    this.cpEl = h("span", { class: "vs-hud-cp", text: "" });
    this.progFill = h("i", { class: "vs-hud-progfill" });
    this.progMe = h("i", { class: "vs-hud-progme" });

    this.list = h("ol", { class: "vs-hud-list", "aria-label": "順位" });
    for (let i = 0; i < 8; i++) {
      const dot = h("i", { class: "vs-hud-dot" });
      const nm = h("span", { class: "vs-hud-nm" });
      const pc = h("span", { class: "vs-hud-pc vs-mono" });
      const li = h("li", { class: "vs-hud-row" }, h("span", { class: "vs-hud-no vs-mono" }), dot, nm, pc);
      li.style.display = "none";
      this.rows.push({ li, dot, nm, pc, no: li.firstChild });
      this.list.appendChild(li);
    }

    /* 組（チーム戦）の 点。ふだんは 出さない。 */
    this.teamEl = h("div", { class: "vs-hud-team vs-hide", role: "status" });
    this.teamA = h("span", { class: "vs-hud-tv vs-mono" });
    this.teamB = h("span", { class: "vs-hud-tv vs-mono" });
    this.teamEl.appendChild(h("span", { class: "vs-hud-tn", text: "レッド" }));
    this.teamEl.appendChild(this.teamA);
    this.teamEl.appendChild(h("span", { class: "vs-hud-td", text: "—" }));
    this.teamEl.appendChild(this.teamB);
    this.teamEl.appendChild(h("span", { class: "vs-hud-tn is-b", text: "ブルー" }));

    this.bigEl = h("div", { class: "vs-hud-big", "aria-live": "assertive" });
    this.toastEl = h("div", { class: "vs-hud-toast" });
    /* ゴーストとの 差。**時間**で 出す（「あと 何 m」より 分かりやすい）。 */
    this.ghostEl = h("div", { class: "vs-hud-ghost vs-hide vs-mono" });

    /* ── 観戦の 帯（脱落した あと）──────────────────────────────────
       ★ **「結果を 見る」を 必ず 出す。** 見たくない 人を 閉じ込めない。 */
    this.specName = h("b", { class: "vs-spec-nm" });
    this.specPrev = h("button", { class: "vs-spec-b", type: "button", "aria-label": "前の 人" }, "◀");
    this.specNext = h("button", { class: "vs-spec-b", type: "button", "aria-label": "次の 人" }, "▶");
    this.specEnd = h("button", { class: "vs-spec-e", type: "button" }, "結果を 見る");
    this.specEl = h("div", { class: "vs-spec vs-hide", role: "status" },
      h("span", { class: "vs-spec-l", text: "観戦中" }),
      this.specPrev, this.specName, this.specNext, this.specEnd);

    return h("div", { class: "vs-hud" },
      h("div", { class: "vs-hud-top" },
        h("div", { class: "vs-hud-left" },
          h("div", { class: "vs-hud-timebox" }, this.timeEl),
          h("div", { class: "vs-hud-meta" }, this.courseEl, this.cpEl)),
        h("div", { class: "vs-hud-rank" }, this.rankNum, this.rankOf)),
      h("div", { class: "vs-hud-prog" }, this.progFill, this.progMe),
      this.ghostEl,
      this.specEl,
      this.teamEl,
      this.list,
      this.bigEl,
      this.toastEl
    );
  }

  setCourse(name, tier) {
    if (this._last.course === name) return;
    this._last.course = name;
    this.courseEl.textContent = name;
  }

  /** 秒 → 0:00.0 */
  _fmt(s) {
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
  }

  update(state) {
    /* 時計 */
    const t = this._fmt(Math.max(0, state.time));
    if (t !== this._last.t) { this._last.t = t; this.timeEl.textContent = t; }

    /* 順位 */
    const r = state.rank ? String(state.rank) : "–";
    if (r !== this._last.r) { this._last.r = r; this.rankNum.textContent = r; }
    const of = "/ " + state.total;
    if (of !== this._last.of) { this._last.of = of; this.rankOf.textContent = of; }

    /* 中間地点 */
    const cp = state.checkpoints > 0 ? ("中間 " + state.checkpoint + " / " + state.checkpoints) : "";
    if (cp !== this._last.cp) { this._last.cp = cp; this.cpEl.textContent = cp; }

    /* 進み */
    const pct = Math.round(state.pct * 1000) / 10;
    if (pct !== this._last.pct) {
      this._last.pct = pct;
      this.progFill.style.width = pct + "%";
      this.progMe.style.left = pct + "%";
    }

    /* ゴーストとの 差 */
    const gd = state.ghost;
    if (gd === null || gd === undefined) {
      if (!this.ghostEl.classList.contains("vs-hide")) this.ghostEl.classList.add("vs-hide");
      this._last.ghost = undefined;
    } else {
      if (this.ghostEl.classList.contains("vs-hide")) this.ghostEl.classList.remove("vs-hide");
      /* 0.1 秒 きざみ。もっと 細かく すると 数字が 落ち着かず 読めない。 */
      const v = Math.round(gd * 10) / 10;
      if (v !== this._last.ghost) {
        this._last.ghost = v;
        this.ghostEl.textContent = "ベスト " + (v <= 0 ? "-" : "+") + Math.abs(v).toFixed(1);
        this.ghostEl.setAttribute("data-good", v <= 0 ? "1" : "0");
      }
    }

    /* 組の 点 */
    if (state.teams) {
      if (this.teamEl.classList.contains("vs-hide")) this.teamEl.classList.remove("vs-hide");
      const key = state.teams[0] + "|" + state.teams[1];
      if (key !== this._last.team) {
        this._last.team = key;
        this.teamA.textContent = String(state.teams[0]);
        this.teamB.textContent = String(state.teams[1]);
        this.teamEl.setAttribute("data-lead", state.teams[0] === state.teams[1] ? "" : (state.teams[0] > state.teams[1] ? "a" : "b"));
      }
    } else if (!this.teamEl.classList.contains("vs-hide")) this.teamEl.classList.add("vs-hide");

    /* 一覧 */
    const rows = state.standings || [];
    for (let i = 0; i < this.rows.length; i++) {
      const R = this.rows[i], d = rows[i];
      if (!d) { if (R.li.style.display !== "none") R.li.style.display = "none"; continue; }
      if (R.li.style.display === "none") R.li.style.display = "";
      const key = d.rank + "|" + d.name + "|" + Math.round(d.pct * 100) + "|" + (d.finished ? 1 : 0);
      if (R._key === key) continue;
      R._key = key;
      R.no.textContent = String(d.rank);
      R.nm.textContent = d.name;
      R.pc.textContent = d.finished ? "GOAL" : (Math.round(d.pct * 100) + "%");
      R.dot.style.background = beanByIndex(d.colorIndex).hex;
      /* 組が ある ときは 名前の 前に 組の 色の 帯を 出す */
      R.li.setAttribute("data-team", d.team === 0 ? "a" : (d.team === 1 ? "b" : ""));
      R.li.setAttribute("data-me", d.me ? "1" : "0");
      R.li.setAttribute("data-fin", d.finished ? "1" : "0");
    }
  }

  /** 真ん中の 大きな 文字（3 / 2 / 1 / GO! / ゴール!） */
  big(text, kind) {
    this.bigEl.textContent = text || "";
    this.bigEl.setAttribute("data-kind", kind || "");
    if (text) {
      this.bigEl.setAttribute("data-on", "1");
      /* 動きを 出し直す（同じ 文字が 続いても） */
      this.bigEl.style.animation = "none";
      void this.bigEl.offsetWidth;
      this.bigEl.style.animation = "";
    } else this.bigEl.removeAttribute("data-on");
  }

  /** 観戦の 帯を 出す。name だけ 渡すと 名前の 入れ替えに なる。 */
  spectate(name, onStep, onEnd) {
    this.specName.textContent = String(name || "");
    if (onStep) {
      this.specPrev.onclick = () => onStep(-1);
      this.specNext.onclick = () => onStep(1);
    }
    if (onEnd) this.specEnd.onclick = () => onEnd();
    this.specEl.classList.remove("vs-hide");
  }
  spectateOff() { this.specEl.classList.add("vs-hide"); }

  toast(text, kind) {
    const el = h("div", { class: "vs-toast", "data-kind": kind || "", text });
    this.toastEl.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 2200);
  }
}

export const HUD_CSS = `
.vs-spec{ align-self:flex-start; width:max-content; max-width:96%;
  margin:6px 0 0; padding:5px 8px 5px 12px; border-radius:999px;
  display:flex; align-items:center; gap:8px; font-size:13px;
  background:rgba(12,16,28,.72); color:#f3f5ff; border:1px solid rgba(255,255,255,.14); }
.vs-spec-l{ color:rgba(243,245,255,.55); font-size:12px; }
.vs-spec-nm{ min-width:5em; text-align:center; font-weight:800; }
.vs-spec-b{ width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,.18);
  background:transparent; color:#f3f5ff; font:inherit; font-size:11px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; padding:0; }
.vs-spec-b:hover{ background:rgba(255,255,255,.10); }
.vs-spec-e{ height:26px; padding:0 12px; border-radius:999px; border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.08); color:#f3f5ff; font:inherit; font-size:12px;
  font-weight:700; cursor:pointer; }
.vs-spec-e:hover{ background:rgba(255,255,255,.16); }

/* ★ **幅を 中身に 合わせる。** 親が 縦積みの 箱なので、
   放っておくと 横いっぱいに 伸びて 画面を 横切る 帯に なる（実写で 気づいた）。 */
.vs-hud-ghost{ align-self:flex-start; width:max-content; max-width:60%;
  margin:6px 0 0; padding:3px 10px; border-radius:999px;
  font-size:13px; font-weight:800; letter-spacing:.02em;
  background:rgba(12,16,28,.62); color:#ff9aa5; border:1px solid rgba(255,255,255,.12); }
.vs-hud-ghost[data-good="1"]{ color:#5ae6be; }

.vs-hud{ position:absolute; inset:0; pointer-events:none; z-index:4;
  padding: calc(12px + var(--vs-safe-t)) calc(14px + var(--vs-safe-r)) calc(12px + var(--vs-safe-b)) calc(14px + var(--vs-safe-l)); }
.vs-hud-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.vs-hud-left{ display:flex; flex-direction:column; gap:5px; }
.vs-hud-timebox{
  display:inline-flex; align-items:center; height:38px; padding:0 14px; border-radius:12px;
  background:rgba(8,11,28,.52); border:1px solid rgba(255,255,255,.14);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
}
.vs-hud-time{ font-size:20px; font-weight:800; letter-spacing:.01em; }
.vs-hud-meta{ display:flex; gap:10px; font-size:11.5px; color:rgba(243,245,255,.72); padding-left:3px;
  text-shadow:0 1px 6px rgba(4,6,20,.9); }
.vs-hud-course{ font-weight:700; }
.vs-hud-rank{ display:flex; align-items:baseline; gap:4px;
  background:rgba(8,11,28,.52); border:1px solid rgba(255,255,255,.14);
  border-radius:12px; padding:4px 14px 6px;
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
.vs-hud-rank-n{ font-size:30px; font-weight:900; line-height:1; color:${PALETTE.amber}; }
.vs-hud-rank-of{ font-size:12px; color:rgba(243,245,255,.6); }
.vs-hud-prog{ position:relative; margin-top:10px; height:5px; border-radius:999px;
  background:rgba(255,255,255,.16); overflow:visible; max-width:520px; }
.vs-hud-progfill{ position:absolute; left:0; top:0; height:100%; width:0%; border-radius:999px;
  background:linear-gradient(90deg,${PALETTE.mint},${PALETTE.blue}); transition:width .18s linear; }
.vs-hud-progme{ position:absolute; top:50%; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
  border-radius:50%; background:#fff; box-shadow:0 0 0 2px rgba(8,11,28,.6); transition:left .18s linear; }

.vs-hud-team{ display:inline-flex; align-items:center; gap:8px; margin-top:8px;
  padding:5px 13px; border-radius:999px; background:rgba(8,11,28,.55);
  border:1px solid rgba(255,255,255,.14); font-size:13px; }
.vs-hud-tn{ font-size:10.5px; font-weight:800; letter-spacing:.06em; color:#ff5d6e; }
.vs-hud-tn.is-b{ color:#4d9dff; }
.vs-hud-tv{ font-size:17px; font-weight:900; }
.vs-hud-td{ color:rgba(243,245,255,.62); font-size:11px; }
.vs-hud-team[data-lead="a"] .vs-hud-tv:first-of-type{ color:#ff5d6e; }
.vs-hud-team[data-lead="b"] .vs-hud-tv:last-of-type{ color:#4d9dff; }
.vs-hud-row[data-team="a"]{ border-left:3px solid #ff5d6e; }
.vs-hud-row[data-team="b"]{ border-left:3px solid #4d9dff; }
.vs-hud-list{ position:absolute; right:calc(14px + var(--vs-safe-r)); top:calc(96px + var(--vs-safe-t));
  list-style:none; display:flex; flex-direction:column; gap:3px; min-width:172px; }
.vs-hud-row{ display:flex; align-items:center; gap:7px; height:26px; padding:0 9px;
  border-radius:8px; background:rgba(8,11,28,.44); border:1px solid rgba(255,255,255,.08);
  font-size:12px; color:rgba(243,245,255,.86); }
.vs-hud-row[data-me="1"]{ background:rgba(255,176,32,.20); border-color:rgba(255,176,32,.44); font-weight:800; }
.vs-hud-row[data-fin="1"]{ opacity:.72; }
.vs-hud-no{ width:14px; text-align:right; color:rgba(243,245,255,.55); font-size:11px; }
.vs-hud-dot{ width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
.vs-hud-nm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-hud-pc{ font-size:11px; color:rgba(243,245,255,.62); }

.vs-hud-big{
  position:absolute; left:50%; top:38%; transform:translate(-50%,-50%);
  font-size:clamp(48px,13vw,132px); font-weight:900; letter-spacing:-.03em;
  color:#fff; text-shadow:0 6px 0 rgba(6,8,24,.35), 0 16px 46px rgba(0,0,0,.5);
  opacity:0; pointer-events:none;
}
.vs-hud-big[data-on="1"]{ animation: vsBig .9s cubic-bezier(.2,1.1,.3,1) both; }
.vs-hud-big[data-kind="go"]{ color:${PALETTE.mint}; }
.vs-hud-big[data-kind="goal"]{ color:${PALETTE.amber}; font-size:clamp(34px,8vw,88px); }
@keyframes vsBig{
  0%{ opacity:0; transform:translate(-50%,-50%) scale(1.8); }
  30%{ opacity:1; transform:translate(-50%,-50%) scale(1); }
  75%{ opacity:1; }
  100%{ opacity:0; transform:translate(-50%,-50%) scale(.92); }
}
.vs-hud-toast{ position:absolute; left:50%; bottom:calc(96px + var(--vs-safe-b)); transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:6px; }
.vs-toast{
  padding:7px 16px; border-radius:999px; font-size:13px; font-weight:700;
  background:rgba(8,11,28,.72); border:1px solid rgba(255,255,255,.16); color:#fff;
  animation: vsToast 2.2s ease both;
}
.vs-toast[data-kind="good"]{ background:rgba(48,180,120,.86); border-color:rgba(255,255,255,.3); }
.vs-toast[data-kind="bad"]{ background:rgba(200,60,70,.86); border-color:rgba(255,255,255,.3); }
@keyframes vsToast{ 0%{opacity:0;transform:translateY(10px)} 12%{opacity:1;transform:none}
  80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }

/* ── 操作の 説明 ─────────────────────────────────────────────────── */
.vs-help{ position:absolute; inset:0; z-index:11; display:none;
  align-items:center; justify-content:center;
  background:rgba(6,8,22,.80); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  padding: calc(14px + var(--vs-safe-t)) 14px calc(14px + var(--vs-safe-b)); }
.vs-help[data-on="1"]{ display:flex; }
.vs-help-card{ width:min(760px,100%); max-height:100%; overflow:auto;
  background:rgba(12,15,36,.96); border:1px solid rgba(255,255,255,.16);
  border-radius:20px; padding:20px; text-align:center;
  box-shadow:0 24px 70px rgba(0,0,0,.5); }
.vs-help-title{ font-size:22px; font-weight:900; margin-bottom:14px; }
.vs-help-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; text-align:left; margin-bottom:16px; }
.vs-help-col{ background:rgba(255,255,255,.05); border-radius:13px; padding:12px; }
.vs-help-h{ font-size:11.5px; font-weight:800; letter-spacing:.06em; color:${PALETTE.amber}; margin-bottom:8px; }
.vs-help-row{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.vs-help-keys{ display:flex; gap:3px; flex:0 0 auto; }
.vs-help-k{ display:inline-flex; align-items:center; justify-content:center;
  min-width:22px; height:22px; padding:0 5px; border-radius:6px; font-family:inherit;
  background:rgba(255,255,255,.14); font-size:10.5px; font-weight:800; }
.vs-help-t{ font-size:12px; color:rgba(243,245,255,.78); }
.vs-help-p{ font-size:12px; color:rgba(243,245,255,.72); line-height:1.8; margin-bottom:4px; }
@media (max-width: 700px){
  .vs-help-grid{ grid-template-columns:1fr; }
  .vs-help-card{ padding:14px; }
}

@media (max-width: 640px){
  .vs-hud-list{ min-width:132px; top:calc(84px + var(--vs-safe-t)); }
  .vs-hud-row{ height:22px; font-size:11px; }
  .vs-hud-rank-n{ font-size:24px; }
  .vs-hud-time{ font-size:17px; }
}
@media (max-height: 460px){
  .vs-hud-list{ top:calc(66px + var(--vs-safe-t)); }
  .vs-hud-big{ top:32%; }
}
`;
