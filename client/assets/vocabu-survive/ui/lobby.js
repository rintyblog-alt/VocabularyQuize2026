/* ══════════════════════════════════════════════════════════════════════════
   ロビー。

   要件どおり:
     自分（名前・アバター・状態）／友だち／パーティ／招待／
     準備／退出／開始／コースの下見／遊び方えらび

   置き方:
     左 … 自分と 友だち
     中 … コースえらび（30 本）と 下見
     右 … いま 集まっている 人 と 開始

   1 人でも 遊べる（要件）。相手が いない ときは ボットが 入る。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE, BEAN_COLORS, beanByIndex } from "./theme.js";
import { COURSES, tierOf, TIERS } from "../data/courses.js";
import { themeOf } from "../game/theme3d.js";

const MODES = [
  { key: "race", label: "レース", desc: "先に ゴールした 人が 勝ち", ready: true },
  { key: "timeattack", label: "タイムアタック", desc: "1 人で 記録に 挑む", ready: true },
  { key: "survival", label: "サバイバル", desc: "落ちたら 脱落", ready: false },
  { key: "quizrush", label: "クイズラッシュ", desc: "門を 多く 通った 人が 勝ち", ready: false }
];

const PICK_KEY = "vq.survive.pick.v1";

export class LobbyScreen {
  constructor(opt) {
    this.app = opt.app;
    this.settings = opt.settings;
    this.onPlay = opt.onPlay || (() => {});
    this.onExit = opt.onExit || (() => {});
    this.title = "VocabuSurvive ロビー";

    this.courseIndex = 0;
    this.mode = "race";
    this.ready = false;
    this.party = [];        /* {id,name,colorIndex,ready,online} */
    this.friends = [];
    this.me = { id: "me", name: "あなた", colorIndex: 0, ready: false, online: true };
    this.roomId = "";
    this.net = null;

    this._restore();
    this.el = this._build();
  }

  _restore() {
    try {
      const raw = JSON.parse(localStorage.getItem(PICK_KEY) || "{}");
      if (typeof raw.course === "number") this.courseIndex = Math.max(0, Math.min(COURSES.length - 1, raw.course));
      if (raw.mode) this.mode = raw.mode;
      if (typeof raw.color === "number") this.me.colorIndex = raw.color % BEAN_COLORS.length;
    } catch (e) {}
  }
  _save() {
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({
        course: this.courseIndex, mode: this.mode, color: this.me.colorIndex
      }));
    } catch (e) {}
  }

  /* ── 組み立て ─────────────────────────────────────────────────── */
  _build() {
    /* 自分 */
    this.avatarEl = h("div", { class: "vs-lb-av", role: "img" });
    this.nameEl = h("div", { class: "vs-lb-nm", text: this.me.name });
    this.colorRow = h("div", { class: "vs-lb-colors", role: "radiogroup", "aria-label": "色を選ぶ" });
    for (let i = 0; i < BEAN_COLORS.length; i++) {
      const c = BEAN_COLORS[i];
      const b = h("button", {
        class: "vs-lb-color", type: "button", role: "radio",
        "aria-label": c.name, title: c.name,
        onclick: () => this._setColor(i)
      });
      b.style.background = c.hex;
      this.colorRow.appendChild(b);
    }

    this.friendsEl = h("div", { class: "vs-lb-friends" });
    this.friendsNote = h("p", { class: "vs-lb-note", text: "読み込み中…" });

    /* コース */
    this.tierRow = h("div", { class: "vs-lb-tiers", role: "tablist", "aria-label": "難しさ" });
    for (const t of TIERS) {
      this.tierRow.appendChild(h("button", {
        class: "vs-lb-tier", type: "button", role: "tab", "data-tier": t.key,
        onclick: () => this._jumpTier(t)
      }, t.label));
    }
    this.courseList = h("div", { class: "vs-lb-courses", role: "listbox", "aria-label": "コース" });
    this.courseCards = [];
    for (let i = 0; i < COURSES.length; i++) {
      const c = COURSES[i];
      const card = this._courseCard(c, i);
      this.courseCards.push(card);
      this.courseList.appendChild(card);
    }

    this.previewEl = h("div", { class: "vs-lb-preview" });

    /* 遊び方 */
    this.modeRow = h("div", { class: "vs-lb-modes", role: "radiogroup", "aria-label": "遊び方" });
    for (const m of MODES) {
      const b = h("button", {
        class: "vs-lb-mode", type: "button", role: "radio", "data-mode": m.key,
        disabled: !m.ready,
        onclick: () => { if (m.ready) { this.mode = m.key; this._save(); this._render(); } }
      }, h("span", { class: "vs-lb-mode-l", text: m.label }),
         h("span", { class: "vs-lb-mode-d", text: m.ready ? m.desc : "準備中" }));
      this.modeRow.appendChild(b);
    }

    /* 集まっている 人 */
    this.partyEl = h("div", { class: "vs-lb-party" });
    this.roomEl = h("div", { class: "vs-lb-room" });
    this.readyBtn = h("button", {
      class: "vs-btn is-mint vs-lb-ready", type: "button",
      onclick: () => this._toggleReady()
    }, "準備 OK");
    this.startBtn = h("button", {
      class: "vs-btn vs-lb-start", type: "button",
      onclick: () => this._start()
    }, "スタート");
    this.botRow = h("div", { class: "vs-lb-bots" });
    this.botCount = 3;
    for (const n of [0, 1, 3, 5, 7]) {
      this.botRow.appendChild(h("button", {
        class: "vs-lb-bot", type: "button", "data-n": String(n),
        onclick: () => { this.botCount = n; this._render(); }
      }, n === 0 ? "1人で" : (n + 1) + "人"));
    }

    return h("div", { class: "vs-lobby" },
      h("header", { class: "vs-lb-head" },
        h("h1", { class: "vs-lb-title" }, "VocabuSurvive"),
        h("button", { class: "vs-lb-x", type: "button", "aria-label": "閉じる", onclick: () => this.onExit() }, "✕")),
      h("div", { class: "vs-lb-grid" },
        /* 左 */
        h("section", { class: "vs-card vs-lb-me", "aria-label": "あなた" },
          h("div", { class: "vs-lb-merow" }, this.avatarEl,
            h("div", null, this.nameEl, h("div", { class: "vs-lb-st" },
              h("i", { class: "vs-lb-dot" }), h("span", { text: "オンライン" })))),
          h("div", { class: "vs-lb-lab", text: "色" }), this.colorRow,
          h("div", { class: "vs-lb-lab", text: "友だち" }),
          this.friendsNote, this.friendsEl),
        /* 中 */
        h("section", { class: "vs-card vs-lb-course", "aria-label": "コース" },
          this.previewEl, this.tierRow, this.courseList),
        /* 右 */
        h("section", { class: "vs-card vs-lb-right", "aria-label": "参加者" },
          h("div", { class: "vs-lb-lab", text: "遊び方" }), this.modeRow,
          h("div", { class: "vs-lb-lab", text: "人数（相手が いなければ ボット）" }), this.botRow,
          h("div", { class: "vs-lb-lab", text: "いま 集まっている 人" }), this.partyEl,
          this.roomEl,
          h("div", { class: "vs-lb-actions" }, this.readyBtn, this.startBtn))));
  }

  _courseCard(c, i) {
    const th = themeOf(c.theme);
    const sw = h("i", { class: "vs-lb-cc-sw" });
    sw.style.background = "linear-gradient(135deg," + rgb(th.sky.top) + "," + rgb(th.floor) + ")";
    const dots = h("span", { class: "vs-lb-cc-diff", "aria-label": "難しさ " + c.difficulty });
    for (let k = 0; k < 10; k++) {
      const d = h("i", { class: "vs-lb-cc-d" });
      if (k < c.difficulty) d.setAttribute("data-on", "1");
      dots.appendChild(d);
    }
    const card = h("button", {
      class: "vs-lb-cc", type: "button", role: "option", "data-i": String(i),
      onclick: () => { this.courseIndex = i; this._save(); this._render(); }
    }, sw,
      h("span", { class: "vs-lb-cc-body" },
        h("span", { class: "vs-lb-cc-no vs-mono", text: String(i + 1).padStart(2, "0") }),
        h("span", { class: "vs-lb-cc-nm", text: c.name }),
        dots));
    return card;
  }

  /* ── 動き ─────────────────────────────────────────────────────── */
  _setColor(i) { this.me.colorIndex = i; this._save(); this._render(); if (this.net && this.net.setColor) this.net.setColor(i); }
  _toggleReady() {
    this.ready = !this.ready;
    this.me.ready = this.ready;
    if (this.net && this.net.setReady) this.net.setReady(this.ready);
    this._render();
  }
  _jumpTier(t) {
    const card = this.courseCards[t.from];
    if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    this.courseIndex = t.from; this._save(); this._render();
  }
  _start() {
    const c = COURSES[this.courseIndex];
    this.onPlay({
      courseId: c.id,
      mode: this.mode,
      bots: this.mode === "timeattack" ? 0 : this.botCount,
      myName: this.me.name,
      myColor: this.me.colorIndex,
      players: this.party.filter((p) => p.id !== this.me.id),
      seed: (Date.now() / 1000) | 0
    });
  }

  _render() {
    const c = COURSES[this.courseIndex];
    const th = themeOf(c.theme);
    const tier = tierOf(this.courseIndex);

    /* 下見 */
    this.previewEl.textContent = "";
    this.previewEl.style.background =
      "linear-gradient(160deg," + rgb(th.sky.top) + " 0%," + rgb(th.sky.horizon) + " 58%," + rgb(th.floor) + " 100%)";
    this.previewEl.appendChild(h("div", { class: "vs-lb-pv-in" },
      h("span", { class: "vs-chip", text: tier.label }),
      h("h2", { class: "vs-lb-pv-nm", text: c.name }),
      h("p", { class: "vs-lb-pv-core", text: c.core }),
      h("div", { class: "vs-lb-pv-meta" },
        h("span", { text: "目安 " + Math.round(c.estimatedDuration / 60 * 10) / 10 + " 分" }),
        h("span", { text: "難しさ " + c.difficulty + " / 10" }),
        h("span", { text: c.recommendedPlayers[0] + "〜" + c.recommendedPlayers[1] + " 人" }))));

    for (let i = 0; i < this.courseCards.length; i++) {
      this.courseCards[i].setAttribute("aria-selected", i === this.courseIndex ? "true" : "false");
    }
    for (const b of this.tierRow.children) {
      b.setAttribute("aria-selected", b.getAttribute("data-tier") === tier.key ? "true" : "false");
    }
    for (const b of this.modeRow.children) {
      b.setAttribute("aria-checked", b.getAttribute("data-mode") === this.mode ? "true" : "false");
    }
    for (const b of this.botRow.children) {
      b.setAttribute("aria-pressed", Number(b.getAttribute("data-n")) === this.botCount ? "true" : "false");
    }
    for (let i = 0; i < this.colorRow.children.length; i++) {
      this.colorRow.children[i].setAttribute("aria-checked", i === this.me.colorIndex ? "true" : "false");
    }
    const bean = beanByIndex(this.me.colorIndex);
    this.avatarEl.style.background = bean.hex;
    this.avatarEl.setAttribute("aria-label", this.me.name + "（" + bean.name + "）");
    this.nameEl.textContent = this.me.name;

    /* 集まっている 人 */
    const rows = [this.me].concat(this.party.filter((p) => p.id !== this.me.id));
    this.partyEl.textContent = "";
    for (const p of rows) {
      const dot = h("i", { class: "vs-lb-pdot" });
      dot.style.background = beanByIndex(p.colorIndex).hex;
      this.partyEl.appendChild(h("div", { class: "vs-lb-prow", "data-ready": p.ready ? "1" : "0" },
        dot, h("span", { class: "vs-lb-pnm", text: p.name }),
        h("span", { class: "vs-lb-pst", text: p.ready ? "準備 OK" : "待機中" })));
    }
    if (this.botCount > 0 && rows.length < 8) {
      const n = Math.min(this.botCount, 8 - rows.length);
      for (let i = 0; i < n; i++) {
        const dot = h("i", { class: "vs-lb-pdot" });
        dot.style.background = beanByIndex(this.me.colorIndex + 1 + i).hex;
        this.partyEl.appendChild(h("div", { class: "vs-lb-prow", "data-bot": "1" },
          dot, h("span", { class: "vs-lb-pnm", text: "ボット " + (i + 1) }),
          h("span", { class: "vs-lb-pst", text: "CPU" })));
      }
    }

    this.readyBtn.textContent = this.ready ? "準備を やめる" : "準備 OK";
    this.readyBtn.className = "vs-btn vs-lb-ready " + (this.ready ? "is-ghost" : "is-mint");
    this.startBtn.disabled = false;

    this.roomEl.textContent = "";
    if (this.roomId) {
      this.roomEl.appendChild(h("div", { class: "vs-lb-roomid" },
        h("span", { class: "vs-lb-roomlab", text: "あいことば" }),
        h("strong", { class: "vs-mono", text: this.roomId })));
    }
  }

  async enter() {
    this._render();
    /* 名前と アバターを 本体から 借りる */
    try {
      const n = document.querySelector("#appTabBar .app-v2-user-name, #appV2UserName");
      if (n && n.textContent.trim()) { this.me.name = n.textContent.trim().slice(0, 16); }
    } catch (e) {}
    this._render();
    this._loadFriends();
  }
  exit() {}
  resize() {}

  async _loadFriends() {
    this.friendsEl.textContent = "";
    try {
      const base = (window.VQ_API_BASE || "").replace(/\/+$/, "");
      const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
      if (!tk) { this.friendsNote.textContent = "ログインすると 友だちを 誘えます。"; return; }
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(base + "/api/survive/friends", {
        headers: { Authorization: "Bearer " + tk }, signal: ctrl.signal
      });
      clearTimeout(to);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      this.friends = (d && d.friends) || [];
      if (!this.friends.length) {
        this.friendsNote.textContent = "まだ 友だちが いません。フォローすると ここに 出ます。";
        return;
      }
      this.friendsNote.textContent = "";
      for (const f of this.friends) {
        const dot = h("i", { class: "vs-lb-fdot", "data-on": f.online ? "1" : "0" });
        this.friendsEl.appendChild(h("div", { class: "vs-lb-frow" },
          dot, h("span", { class: "vs-lb-fnm", text: f.name }),
          h("button", {
            class: "vs-btn is-sm is-ghost", type: "button",
            onclick: () => this._invite(f)
          }, "招待")));
      }
    } catch (e) {
      this.friendsNote.textContent = "友だちの 一覧を 読めませんでした。1 人でも 遊べます。";
    }
  }

  async _invite(f) {
    if (this.net && this.net.invite) { this.net.invite(f.id); return; }
    this.friendsNote.textContent = f.name + " を 誘うには 先に 部屋を 作ってください。";
  }
}

function rgb(a) { return "rgb(" + Math.round(a[0] * 255) + "," + Math.round(a[1] * 255) + "," + Math.round(a[2] * 255) + ")"; }

export const LOBBY_CSS = `
.vs-lobby{ position:absolute; inset:0; display:flex; flex-direction:column;
  background:
    radial-gradient(120% 90% at 12% -10%, rgba(91,140,255,.18), transparent 60%),
    radial-gradient(120% 90% at 92% 8%, rgba(167,123,255,.16), transparent 62%),
    ${PALETTE.bg};
  padding: calc(14px + var(--vs-safe-t)) calc(16px + var(--vs-safe-r)) calc(14px + var(--vs-safe-b)) calc(16px + var(--vs-safe-l));
  overflow:hidden; }
.vs-lb-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex:0 0 auto; }
.vs-lb-title{ font-size:clamp(19px,3.4vw,26px); font-weight:900; letter-spacing:-.02em;
  background:linear-gradient(96deg,#ffd66b,#ff8fb1 40%,#8fb8ff 78%,#6ef0cf);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
@supports not ((-webkit-background-clip:text) or (background-clip:text)){ .vs-lb-title{ color:#ffd66b; -webkit-text-fill-color:currentColor; } }
.vs-lb-x{ width:36px; height:36px; border-radius:11px; background:rgba(255,255,255,.07);
  border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.75); font-size:14px; }
.vs-lb-grid{ flex:1; display:grid; grid-template-columns: 264px minmax(0,1fr) 300px; gap:12px; min-height:0; }
.vs-card{ background:${PALETTE.panel}; border:1px solid ${PALETTE.line}; border-radius:18px;
  padding:14px; overflow:auto; min-height:0; }
.vs-lb-lab{ font-size:10.5px; font-weight:800; letter-spacing:.10em; color:rgba(243,245,255,.48);
  margin:14px 0 7px; }
.vs-lb-lab:first-child{ margin-top:0; }
.vs-lb-merow{ display:flex; align-items:center; gap:11px; }
.vs-lb-av{ width:46px; height:46px; border-radius:14px; flex:0 0 auto;
  box-shadow: inset 0 -6px 12px rgba(0,0,0,.18); }
.vs-lb-nm{ font-size:15px; font-weight:800; }
.vs-lb-st{ display:flex; align-items:center; gap:5px; font-size:11px; color:rgba(243,245,255,.55); margin-top:2px; }
.vs-lb-dot{ width:7px; height:7px; border-radius:50%; background:${PALETTE.good}; }
.vs-lb-colors{ display:grid; grid-template-columns:repeat(8,1fr); gap:5px; }
.vs-lb-color{ aspect-ratio:1; border-radius:9px; border:2px solid transparent; }
.vs-lb-color[aria-checked="true"]{ border-color:#fff; transform:scale(1.06); }
.vs-lb-note{ font-size:11.5px; color:rgba(243,245,255,.5); line-height:1.7; }
.vs-lb-friends{ display:flex; flex-direction:column; gap:5px; }
.vs-lb-frow{ display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:10px;
  background:rgba(255,255,255,.05); font-size:12.5px; }
.vs-lb-fdot{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.24); }
.vs-lb-fdot[data-on="1"]{ background:${PALETTE.good}; }
.vs-lb-fnm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.vs-lb-preview{ border-radius:15px; min-height:168px; padding:16px; display:flex; align-items:flex-end;
  position:relative; overflow:hidden; margin-bottom:12px; }
.vs-lb-pv-in{ position:relative; z-index:1; text-shadow:0 2px 14px rgba(4,6,20,.7); }
.vs-lb-pv-nm{ font-size:clamp(20px,3.4vw,30px); font-weight:900; margin:6px 0 4px; }
.vs-lb-pv-core{ font-size:12.5px; color:rgba(255,255,255,.86); max-width:44em; line-height:1.6; }
.vs-lb-pv-meta{ display:flex; gap:12px; margin-top:8px; font-size:11px; color:rgba(255,255,255,.78); }
.vs-lb-tiers{ display:flex; gap:5px; flex-wrap:wrap; margin-bottom:9px; }
.vs-lb-tier{ height:28px; padding:0 11px; border-radius:999px; font-size:11.5px; font-weight:700;
  background:rgba(255,255,255,.06); border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.66); }
.vs-lb-tier[aria-selected="true"]{ background:${PALETTE.amber}; color:#231702; border-color:transparent; }
.vs-lb-courses{ display:grid; grid-template-columns:repeat(auto-fill,minmax(184px,1fr)); gap:7px; }
.vs-lb-cc{ display:flex; align-items:stretch; gap:0; border-radius:12px; overflow:hidden;
  background:rgba(255,255,255,.05); border:1.5px solid transparent; text-align:left; }
.vs-lb-cc[aria-selected="true"]{ border-color:${PALETTE.amber}; background:rgba(255,176,32,.12); }
.vs-lb-cc-sw{ width:8px; flex:0 0 auto; }
.vs-lb-cc-body{ padding:8px 10px; display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
.vs-lb-cc-no{ font-size:10px; color:rgba(243,245,255,.42); font-weight:800; }
.vs-lb-cc-nm{ font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-cc-diff{ display:flex; gap:2px; margin-top:3px; }
.vs-lb-cc-d{ width:8px; height:3px; border-radius:2px; background:rgba(255,255,255,.14); }
.vs-lb-cc-d[data-on="1"]{ background:${PALETTE.amber}; }

.vs-lb-modes{ display:flex; flex-direction:column; gap:5px; }
.vs-lb-mode{ display:flex; flex-direction:column; align-items:flex-start; gap:1px;
  padding:8px 11px; border-radius:11px; background:rgba(255,255,255,.05);
  border:1.5px solid transparent; text-align:left; }
.vs-lb-mode[aria-checked="true"]{ border-color:${PALETTE.mint}; background:rgba(55,224,176,.12); }
.vs-lb-mode[disabled]{ opacity:.4; }
.vs-lb-mode-l{ font-size:13px; font-weight:800; }
.vs-lb-mode-d{ font-size:10.5px; color:rgba(243,245,255,.52); }
.vs-lb-bots{ display:flex; gap:5px; flex-wrap:wrap; }
.vs-lb-bot{ height:30px; padding:0 12px; border-radius:9px; font-size:12px; font-weight:700;
  background:rgba(255,255,255,.06); border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.7); }
.vs-lb-bot[aria-pressed="true"]{ background:${PALETTE.blue}; color:#fff; border-color:transparent; }
.vs-lb-party{ display:flex; flex-direction:column; gap:4px; }
.vs-lb-prow{ display:flex; align-items:center; gap:8px; padding:6px 9px; border-radius:10px;
  background:rgba(255,255,255,.05); font-size:12.5px; }
.vs-lb-prow[data-ready="1"]{ background:rgba(55,224,176,.14); }
.vs-lb-prow[data-bot="1"]{ opacity:.62; }
.vs-lb-pdot{ width:9px; height:9px; border-radius:50%; }
.vs-lb-pnm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-pst{ font-size:10.5px; color:rgba(243,245,255,.5); }
.vs-lb-roomid{ margin-top:9px; display:flex; align-items:center; justify-content:space-between;
  padding:8px 11px; border-radius:10px; background:rgba(255,255,255,.06); font-size:13px; }
.vs-lb-roomlab{ font-size:10.5px; color:rgba(243,245,255,.5); }
.vs-lb-actions{ display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.vs-lb-actions .vs-btn{ width:100%; }

@media (max-width: 1080px){
  .vs-lb-grid{ grid-template-columns: 1fr 300px; }
  .vs-lb-me{ display:none; }
}
@media (max-width: 780px){
  .vs-lb-grid{ grid-template-columns: 1fr; grid-template-rows:auto auto; overflow:auto; }
  .vs-lb-right{ order:-1; }
  .vs-lb-courses{ grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
  .vs-lb-preview{ min-height:130px; }
}
`;
