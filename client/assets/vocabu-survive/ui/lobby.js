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
import { listLocalPresets, listSharedPresets } from "../data/questions.js";
import { PALETTE, BEAN_COLORS, beanByIndex } from "./theme.js";
import { COURSES, tierOf, TIERS } from "../data/courses.js";
import { CUP_ROUNDS } from "../game/sim.js";
import { clearGhost } from "../data/ghost.js";
import { listMyCourses, getMyCourse, toDef, exportCode, importCode } from "../data/mycourse.js";
import { themeOf } from "../game/theme3d.js";
import { HATS, HAT_COLORS } from "../game/bean.js";
import { SurviveNet, createRoom, roomInfo } from "../net/client.js";
import { buildCourse } from "../game/course.js";
import { HelpCard } from "./hud.js";

const MODES = [
  { key: "race", label: "レース", desc: "先に ゴールした 人が 勝ち", ready: true },
  { key: "timeattack", label: "タイムアタック", desc: "1 人で 記録に 挑む", ready: true },
  { key: "survival", label: "サバイバル", desc: "落ちたら 脱落。最後まで 残った 人が 勝ち", ready: true },
  { key: "quizrush", label: "クイズラッシュ", desc: "100 秒で 門を 多く 通った 人が 勝ち", ready: true },
  { key: "team", label: "チーム戦", desc: "2 組に 分かれて 組の 合計で 勝ち", ready: true },
  /* ★ 勝ち抜きは **ひとり用だけ**。
     対戦で やるには 部屋が ラウンドを またいで 顔ぶれを 覚え、
     全員の 端末が 同じ 「誰が 落ちたか」を 持つ 必要が ある。
     いまの 部屋は 1 試合で 終わる 作りなので、
     そこを 無理に 通すと レースの 通信まで 危うく する（要件 18）。 */
  { key: "cup", label: "勝ち抜き", desc: "3 本 走って 下から 落ちる（ひとり用）", ready: true, solo: true }
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
    this.isHost = false;
    this.net = null;
    /* 門に 出る 問題の 出どころ。kind: "" = 内蔵 / mine / public / official */
    this.qz = { kind: "", id: "", owner: 0, name: "内蔵の 単語" };
    /* かぶりもの（見た目だけ。速さには 一切 効かない） */
    this.hat = "none";
    this.hatColor = 0;
    this.recScope = "all";   /* 記録の 範囲: all / week / friends */

    this._restore();
    this.el = this._build();
  }

  _restore() {
    try {
      const raw = JSON.parse(localStorage.getItem(PICK_KEY) || "{}");
      if (typeof raw.course === "number") this.courseIndex = Math.max(0, Math.min(COURSES.length - 1, raw.course));
      if (raw.mode) this.mode = raw.mode;
      if (typeof raw.color === "number") this.me.colorIndex = raw.color % BEAN_COLORS.length;
      if (raw.recScope === "week" || raw.recScope === "friends" || raw.recScope === "all") this.recScope = raw.recScope;
      if (raw.hat) this.hat = String(raw.hat);
      if (typeof raw.hatColor === "number") this.hatColor = raw.hatColor % HAT_COLORS.length;
      if (raw.qz && typeof raw.qz === "object") {
        this.qz = {
          kind: String(raw.qz.kind || ""), id: String(raw.qz.id || ""),
          owner: (raw.qz.owner | 0) || 0, name: String(raw.qz.name || "内蔵の 単語")
        };
      }
      this.volume = typeof raw.volume === "number" ? raw.volume : 0.7;
      this.musicOn = raw.music !== false;
      this.invertY = !!raw.invert;
    } catch (e) { this.volume = 0.7; this.musicOn = true; this.invertY = false; }
    try { this.quality = localStorage.getItem("vq.survive.tier.v1") || "auto"; } catch (e) { this.quality = "auto"; }
    try { this.ghostOn = localStorage.getItem("vq.survive.ghost.on.v1") !== "0"; } catch (e) { this.ghostOn = true; }
    try {
      const v = localStorage.getItem("vq.survive.calm.v1");
      this.calmOn = v === "1" ? true : (v === "0" ? false
        : !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    } catch (e) { this.calmOn = false; }
  }
  _save() {
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({
        course: this.courseIndex, mode: this.mode, color: this.me.colorIndex,
        volume: this.volume, music: this.musicOn, invert: this.invertY, qz: this.qz,
        hat: this.hat, hatColor: this.hatColor, recScope: this.recScope
      }));
    } catch (e) {}
  }

  /* ── 記録 ───────────────────────────────────────────────────────
     ★ 自己ベストは **手元**に ある（試合が 終わるたび 書いている）ので
       通信を 待たずに すぐ 出す。上位は 届いてから 足す。 */
  _renderRecord(c) {
    const el = this.recordEl;
    el.textContent = "";
    let best = 0;
    try { best = Number(localStorage.getItem("vq.survive.best.v1:" + c.id) || 0) || 0; } catch (e) {}

    /* 自己ベストは **手元に ある**ので 通信を 待たずに すぐ 出す。 */
    const 頭 = h("div", { class: "vs-lb-rec-top" },
      h("span", { class: "vs-lb-rec-lab", text: "自己ベスト" }),
      h("strong", { class: "vs-lb-rec-v vs-mono", text: best > 0 ? fmtTime(best) : "—" }));
    /* どの 範囲の 順位を 見るか */
    const タブ = h("div", { class: "vs-lb-rec-tabs", role: "tablist", "aria-label": "記録の 範囲" });
    for (const [k, lab] of [["all", "全体"], ["week", "今週"], ["friends", "友だち"]]) {
      タブ.appendChild(h("button", {
        class: "vs-lb-rec-tab", type: "button", role: "tab", "data-sc": k,
        "aria-selected": this.recScope === k ? "true" : "false",
        onclick: () => { this.recScope = k; this._save(); this._renderRecord(c); }
      }, lab));
    }
    頭.appendChild(タブ);
    el.appendChild(頭);

    const key = c.id + "|" + this.recScope;
    const box = this._lbCache[key];
    const 表 = h("div", { class: "vs-lb-rec-board" });
    if (box === undefined) {
      表.appendChild(h("p", { class: "vs-lb-note", text: "読み込み中…" }));
      this._loadBoard(c.id, this.recScope);
    } else if (box === null) {
      表.appendChild(h("p", { class: "vs-lb-note", text: "読み込み中…" }));
    } else if (box.err) {
      表.appendChild(h("p", { class: "vs-lb-note", text: box.err }));
    } else if (!box.rows.length) {
      表.appendChild(h("p", { class: "vs-lb-note",
        text: this.recScope === "week" ? "今週は まだ 誰も 走っていません。"
          : this.recScope === "friends" ? "友だちの 記録は まだ ありません。"
          : "まだ 誰も 走っていません。" }));
    } else {
      for (const r of box.rows.slice(0, 5)) 表.appendChild(this._recRow(r, box.meId));
    }
    /* ★ **自分が 何位かを 必ず 出す。**
       上位 5 人だけ だと、ほとんどの 人は 自分が どこに いるか 分からない。 */
    if (box && box.me && !(box.rows || []).some((r) => r.id === box.me.id)) {
      表.appendChild(h("div", { class: "vs-lb-rec-gap", text: "⋯" }));
      表.appendChild(this._recRow(box.me, box.meId));
    }
    el.appendChild(表);
  }

  _recRow(r, meId) {
    return h("div", {
      class: "vs-lb-rec-row",
      "data-me": String(r.id) === String(meId) ? "1" : "0"
    },
      h("span", { class: "vs-lb-rec-no vs-mono", text: String(r.rank) }),
      h("span", { class: "vs-lb-rec-who", text: r.name || "—" }),
      h("span", { class: "vs-lb-rec-v vs-mono", text: fmtTime(r.bestMs / 1000) }));
  }

  async _loadBoard(id, scope) {
    const key = id + "|" + scope;
    this._lbCache[key] = null;   /* 二重に 取りに 行かない */
    try {
      const base = String(window.VQ_API_BASE || "").replace(/\/+$/, "");
      const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
      /* 友だちの 中での 順位は 札が 無いと 出せない。断りを 先に 出す。 */
      if (scope === "friends" && !tk) {
        this._lbCache[key] = { err: "ログインすると 友だちの 中での 順位が 出ます。", rows: [], me: null };
      } else {
        const q = scope === "week" ? "?period=week" : scope === "friends" ? "?scope=friends" : "";
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(base + "/api/survive/leaderboard/" + encodeURIComponent(id) + q, {
          headers: tk ? { Authorization: "Bearer " + tk } : {}, signal: ctrl.signal
        });
        clearTimeout(to);
        const d = await r.json();
        this._lbCache[key] = {
          rows: (d && d.rows) || [], me: (d && d.me) || null,
          meId: d && d.me ? d.me.id : "", splits: (d && d.splits) || []
        };
        /* サーバが 覚えている 区間の 記録を 手元へ 写す
           （端末を 変えても 「どこで 遅れたか」が 出る ように）。
           ★ 手元に 何か あれば 触らない。手元の ほうが 新しい ことが ある。 */
        if (d && Array.isArray(d.splits) && d.splits.length) {
          try {
            if (!localStorage.getItem("vq.survive.splits.v1:" + id)) {
              localStorage.setItem("vq.survive.splits.v1:" + id,
                JSON.stringify(d.splits.map((v) => Math.round(v) / 1000)));
            }
          } catch (e) {}
        }
      }
    } catch (e) { this._lbCache[key] = { rows: [], me: null, err: "記録を 読めませんでした。" }; }
    if (COURSES[this.courseIndex] && COURSES[this.courseIndex].id === id && this.recScope === scope) {
      this._renderRecord(COURSES[this.courseIndex]);
    }
  }

  /** あそび方を 出す（ロビーの ? から。試合の 最初にも 出る） */
  _showHelp() {
    if (!this._help) {
      this._help = new HelpCard(() => {});
      this.el.appendChild(this._help.el);
    }
    this._help.show();
  }

  _setQuality(k) {
    this.quality = k;
    try { localStorage.setItem("vq.survive.tier.v1", k); } catch (e) {}
    if (this.app && this.app.setQuality) this.app.setQuality(k);
    this._render();
  }
  _setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.app && this.app.audio) this.app.audio.setVolume(this.volume);
    this._save();
  }
  _setMusic(on) {
    this.musicOn = !!on;
    if (this.app && this.app.audio) this.app.audio.setMusic(this.musicOn);
    this._save(); this._render();
  }
  _setCalm(on) {
    this.calmOn = !!on;
    try { localStorage.setItem("vq.survive.calm.v1", on ? "1" : "0"); } catch (e) {}
    /* 画質と 同じで **次の 試合から**。いま 動いている 場は 触らない。 */
    if (this.app && this.app.setQuality) { try { this.app.setQuality(this.quality); } catch (e) {} }
    this._render();
  }
  _setGhost(on) {
    this.ghostOn = !!on;
    try { localStorage.setItem("vq.survive.ghost.on.v1", on ? "1" : "0"); } catch (e) {}
    this._render();
  }
  async _clearGhost() {
    const c = COURSES[this.courseIndex];
    this.ghostClearBtn.disabled = true;
    try { await clearGhost(c.id); } catch (e) {}
    this.ghostClearBtn.textContent = "消しました";
    setTimeout(() => {
      this.ghostClearBtn.disabled = false;
      this.ghostClearBtn.textContent = "この コースの 記録を 消す";
    }, 1600);
  }

  _setInvert(on) {
    this.invertY = !!on;
    if (this.app) this.app.invertY = this.invertY;
    this._save(); this._render();
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

    /* ── かぶりもの（要件 ③ 見た目）───────────────────────────────
       ★ **速さにも 当たりにも 効かせない。**
         効かせると 「この 帽子が 強い」に なり、見た目を 選ぶ 楽しみが 消える。
       ★ 色は 走る人の 色とは 別。走る人の 色は 対戦で だぶらせない が、
         かぶりものは だぶっても かまわない（誰が 誰かは 体の 色で 分かる）。 */
    this.hatRow = h("div", { class: "vs-lb-hats", role: "radiogroup", "aria-label": "かぶりもの" });
    for (const ht of HATS) {
      this.hatRow.appendChild(h("button", {
        class: "vs-lb-hat", type: "button", role: "radio", "data-hat": ht.key,
        "aria-label": ht.name, title: ht.name,
        onclick: () => this._setHat(ht.key)
      }, ht.name));
    }
    this.hatColorRow = h("div", { class: "vs-lb-hatcolors", role: "radiogroup", "aria-label": "かぶりものの 色" });
    for (let i = 0; i < HAT_COLORS.length; i++) {
      const c = HAT_COLORS[i];
      const b = h("button", {
        class: "vs-lb-hatc", type: "button", role: "radio",
        "aria-label": c.name, title: c.name, "data-hc": String(i),
        onclick: () => this._setHatColor(i)
      });
      b.style.background = c.hex;
      this.hatColorRow.appendChild(b);
    }
    /* ★ 名札の 印は **別に する**。門の 問題と 同じ 印に すると、
       画面の 中で どちらを 指しているのか 分からなく なる（検査でも 取り違えた）。 */
    this.hatName = h("b", { class: "vs-lb-hat-nm", text: "なし" });
    this.hatEl = h("details", { class: "vs-lb-hatbox" },
      h("summary", null, h("span", { text: "かぶりもの: " }), this.hatName),
      h("div", { class: "vs-lb-qz-body" }, this.hatRow,
        h("div", { class: "vs-lb-lab", text: "色" }), this.hatColorRow,
        h("p", { class: "vs-lb-note", text: "見た目だけです。速さは 変わりません。" })));

    this.friendsEl = h("div", { class: "vs-lb-friends" });
    /* ★ 印を 1 つ 足す。案内文は 画面に いくつも あるので、
       「いちばん 最初の .vs-lb-note」で 友だちの 欄を 指すのは もう 効かない。 */
    this.friendsNote = h("p", { class: "vs-lb-note vs-lb-friendnote", text: "読み込み中…" });

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
    /* コースごとの 記録（自分の 自己ベスト ＋ みんなの 上位） */
    this.recordEl = h("div", { class: "vs-lb-record" });
    this._lbCache = Object.create(null);

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
    /* 自分で 作った コース。作る 画面へ 行く 口と、走る ための 一覧。
       ★ 名前は **editBtn**。makeBtn は もう「部屋を 作る」で 使われて いて、
         同じ 名前に すると 後から 作った ほうに 上書きされて 消える。 */
    this.editBtn = h("button", {
      class: "vs-btn is-sm is-ghost", type: "button",
      onclick: () => { if (this.app && this.app.goEditor) this.app.goEditor(); }
    }, "コースを 作る");
    this.mineEl = h("div", { class: "vs-lb-mine", "aria-label": "自分で 作った コース" });
    /* みんなで あそぶ */
    this.codeInput = h("input", {
      class: "vs-lb-code", type: "text", inputmode: "latin", maxlength: "6",
      placeholder: "あいことば", "aria-label": "あいことば", autocomplete: "off", spellcheck: "false"
    });
    this.makeBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._makeRoom() }, "部屋を 作る");
    this.joinBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._joinRoom() }, "入る");
    this.leaveBtn = h("button", { class: "vs-btn is-sm is-ghost vs-hide", type: "button", onclick: () => this._leaveRoom() }, "部屋を 出る");
    this.netNote = h("p", { class: "vs-lb-note" });
    this.onlineEl = h("div", { class: "vs-lb-online" },
      h("div", { class: "vs-lb-onrow" }, this.makeBtn, this.codeInput, this.joinBtn),
      this.leaveBtn, this.netNote);

    /* ── 見た目と 音の 設定（要件 25 / 27）───────────────────────────
       ★ 「自動」を 既定に する。端末を 測って 決めた 段が 入る。
         手で 選べる ように するのは、測り違いが 必ず ある から。 */
    this.qualityRow = h("div", { class: "vs-lb-quality", role: "radiogroup", "aria-label": "画質" });
    for (const [k, lab] of [["auto", "自動"], ["low", "低"], ["medium", "中"], ["high", "高"], ["ultra", "最高"]]) {
      this.qualityRow.appendChild(h("button", {
        class: "vs-lb-q", type: "button", role: "radio", "data-q": k,
        onclick: () => this._setQuality(k)
      }, lab));
    }
    this.volInput = h("input", {
      class: "vs-lb-range", type: "range", min: "0", max: "100", step: "5",
      "aria-label": "音の 大きさ",
      oninput: (e) => this._setVolume(Number(e.target.value) / 100)
    });
    this.musicBtn = h("button", {
      class: "vs-lb-toggle", type: "button", "aria-pressed": "true",
      onclick: () => this._setMusic(!this.musicOn)
    }, "曲を 鳴らす");
    this.invertBtn = h("button", {
      class: "vs-lb-toggle", type: "button", "aria-pressed": "false",
      onclick: () => this._setInvert(!this.invertY)
    }, "上下を 逆に");
    /* ゴースト。自己ベストの 走りと 並んで 走る。 */
    /* 動きを 減らす。酔いやすい 人 向け。**次の 試合から** 効く。 */
    this.calmBtn = h("button", {
      class: "vs-lb-toggle", type: "button", "aria-pressed": "false",
      onclick: () => this._setCalm(!this.calmOn)
    }, "画面の ゆれを 減らす");
    this.ghostBtn = h("button", {
      class: "vs-lb-toggle", type: "button", "aria-pressed": "true",
      onclick: () => this._setGhost(!this.ghostOn)
    }, "ベストと 走る");
    this.ghostClearBtn = h("button", {
      class: "vs-btn is-sm is-ghost", type: "button",
      onclick: () => this._clearGhost()
    }, "この コースの 記録を 消す");
    this.settingsEl = h("details", { class: "vs-lb-settings" },
      h("summary", null, "設定（画質・音）"),
      h("div", { class: "vs-lb-set-body" },
        h("div", { class: "vs-lb-lab", text: "画質" }), this.qualityRow,
        h("div", { class: "vs-lb-lab", text: "音の 大きさ" }), this.volInput,
        h("div", { class: "vs-lb-togglerow" }, this.musicBtn, this.invertBtn, this.ghostBtn, this.calmBtn),
        h("div", { class: "vs-lb-togglerow" }, this.ghostClearBtn),
        h("p", { class: "vs-lb-note", text: "画質は 次の 試合から 変わります。" }),
        h("p", { class: "vs-lb-note",
          text: "「ベストと 走る」は ひとりの ときだけ。自己ベストを 更新すると 走りを 覚え直します。" })));

    /* ── 門に 出る 問題（要件 12・自分の 単語で 遊べる ように）─────────
       ★ **ひとり用と 対戦で できる ことが 違う。**
         自分の 単語帳は 自分の 端末に しか ない ので、相手からは 引けない。
         そのまま 対戦に 使うと 自分だけ 自分の 単語・相手は 内蔵の 単語に なり、
         「同じ 問題で 競っている」ことに ならない。だから 対戦では 選べなく する。 */
    this.qzName = h("b", { class: "vs-lb-qz-nm", text: this.qz.name || "内蔵の 単語" });
    this.qzList = h("div", { class: "vs-lb-qz-list", role: "radiogroup", "aria-label": "門に 出る 問題" });
    this.qzNote = h("p", { class: "vs-lb-note", text: "読み込み中…" });
    this.qzEl = h("details", { class: "vs-lb-qz" },
      h("summary", null, h("span", { text: "門の 問題: " }), this.qzName),
      h("div", { class: "vs-lb-qz-body" }, this.qzList, this.qzNote));

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
        h("div", { class: "vs-lb-headbtns" },
          h("button", {
            class: "vs-lb-x", type: "button", "aria-label": "あそび方",
            title: "あそび方", onclick: () => this._showHelp()
          }, "?"),
          h("button", { class: "vs-lb-x", type: "button", "aria-label": "閉じる", onclick: () => this.onExit() }, "✕"))),
      h("div", { class: "vs-lb-grid" },
        /* 左 */
        h("section", { class: "vs-card vs-lb-me", "aria-label": "あなた" },
          h("div", { class: "vs-lb-merow" }, this.avatarEl,
            h("div", null, this.nameEl, h("div", { class: "vs-lb-st" },
              h("i", { class: "vs-lb-dot" }), h("span", { text: "オンライン" })))),
          h("div", { class: "vs-lb-lab", text: "色" }), this.colorRow,
          this.hatEl,
          h("div", { class: "vs-lb-lab", text: "友だち" }),
          this.friendsNote, this.friendsEl),
        /* 中 */
        h("section", { class: "vs-card vs-lb-course", "aria-label": "コース" },
          this.previewEl, this.recordEl, this.tierRow, this.courseList),
        /* 右 */
        h("section", { class: "vs-card vs-lb-right", "aria-label": "参加者" },
          h("div", { class: "vs-lb-lab", text: "遊び方" }), this.modeRow,
          h("div", { class: "vs-lb-lab", text: "門に 出る 問題" }), this.qzEl,
          h("div", { class: "vs-lb-lab", text: "人数（相手が いなければ ボット）" }), this.botRow,
          h("div", { class: "vs-lb-lab", text: "いま 集まっている 人" }), this.partyEl,
          this.roomEl,
          h("div", { class: "vs-lb-lab", text: "自分の コース" }),
          h("div", { class: "vs-lb-minerow" }, this.editBtn), this.mineEl,
          h("div", { class: "vs-lb-lab", text: "みんなで あそぶ" }), this.onlineEl,
          this.settingsEl,
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
  /* 一覧を 作り直す。中で しか 呼ばない。 */
  _renderQuiz() {
    const 対戦中 = !!(this.net && this.roomId);
    this.qzList.textContent = "";
    const 行 = (q, 使える, 添え) => {
      const えらばれている = (this.qz.kind || "") === (q.kind || "") &&
        String(this.qz.id || "") === String(q.id || "") &&
        (this.qz.owner | 0) === (q.owner | 0);
      const b = h("button", {
        class: "vs-lb-qz-it", type: "button", role: "radio",
        "aria-checked": えらばれている ? "true" : "false",
        disabled: !使える,
        onclick: () => { if (使える) this._setQuiz(q); }
      }, h("span", { class: "vs-lb-qz-l", text: q.name }),
         添え ? h("span", { class: "vs-lb-qz-s", text: 添え }) : null);
      this.qzList.appendChild(b);
    };

    行({ kind: "", id: "", owner: 0, name: "内蔵の 単語" }, true, "いつでも 使える 英単語 80");

    const mine = this._qzMine || [];
    if (mine.length) {
      this.qzList.appendChild(h("div", { class: "vs-lb-qz-h", text: "あなたの 単語帳" }));
      for (const q of mine) {
        行(q, !対戦中, 対戦中 ? "対戦では 使えません" : q.words + " 語");
      }
    }
    const shared = (this._qzOfficial || []).concat(this._qzPublic || []);
    if (shared.length) {
      this.qzList.appendChild(h("div", { class: "vs-lb-qz-h", text: "みんなの 単語帳（対戦でも 使えます）" }));
      for (const q of shared) 行(q, true, q.kind === "official" ? "公式" : "公開");
    }

    this.qzName.textContent = this.qz.name || "内蔵の 単語";
    if (!mine.length && !shared.length) {
      this.qzNote.textContent = "使える 単語帳が まだ ありません。プリセットを 作ると ここに 出ます。";
    } else if (対戦中 && this.qz.kind === "mine") {
      this.qzNote.textContent = "対戦では あなたの 単語帳を 使えません（相手の 端末から 引けない ため）。内蔵の 単語で 始めます。";
    } else if (対戦中 && !this.isHost) {
      this.qzNote.textContent = "対戦の 問題は 部屋主が 選びます。";
    } else {
      this.qzNote.textContent = "自分の 単語帳を 選ぶと、門の 問題が その 単語に なります。";
    }
    for (const b of this.qzList.children) {
      if (対戦中 && !this.isHost && b.tagName === "BUTTON") b.disabled = true;
    }
  }

  _setQuiz(q) {
    this.qz = { kind: q.kind || "", id: String(q.id || ""), owner: (q.owner | 0) || 0, name: String(q.name || "内蔵の 単語") };
    this._save();
    if (this.net && this.roomId && this.isHost && this.net.setPreset) {
      /* 自分の 単語帳は 対戦へ 送らない（送っても サーバが 断る） */
      this.net.setPreset(this.qz.kind === "mine" ? { kind: "", id: "", owner: 0, name: "" } : this.qz);
    }
    try { this.qzEl.open = false; } catch (e) {}
    this._render();
  }

  /** 自分で 作った コースの 一覧。**対戦では 使えない**（相手が 持っていない）。 */
  async _loadMine() {
    let list = [];
    try { list = await listMyCourses(); } catch (e) { list = []; }
    this._mine = list;
    this._renderMine();
  }
  _renderMine() {
    if (!this.mineEl) return;
    /* ★ 対戦でも 使える ように なった（部屋主が 合言葉ごと 配る）。
       押せないのは **部屋主で ない とき**だけ。 */
    const 対戦中 = !!(this.net && this.roomId) && !this.isHost;
    this.mineEl.textContent = "";
    const list = this._mine || [];
    if (!list.length) {
      this.mineEl.appendChild(h("p", { class: "vs-lb-note", text: "まだ ありません。「コースを 作る」から。" }));
      return;
    }
    /* いま 部屋へ 配っている もの（部屋主）／配られて いる もの（そのほか） */
    const 配名 = this._myCourse ? this._myCourse.name : (this._roomHasCourse ? this._roomCourseName : "");
    if (this.net && this.roomId && 配名) {
      this.mineEl.appendChild(h("p", { class: "vs-lb-note vs-lb-sharing",
        text: "いま 部屋で 使う コース: " + 配名 }));
    }
    for (const c of list.slice(0, 12)) {
      this.mineEl.appendChild(h("button", {
        class: "vs-lb-mineb", type: "button", disabled: 対戦中,
        title: 対戦中 ? "部屋主だけが えらべます" : c.name,
        onclick: async () => {
          if (対戦中) return;
          const got = await getMyCourse(c.id);
          if (!got) return;
          /* 部屋の 中なら **みんなに 配って** 部屋主として 始める */
          if (this.net && this.roomId && this.isHost) {
            /* ★ 知らせは **消えない ところ**へ 出す。
               netNote は 部屋の 知らせが 来る たびに 書き換わる ので、
               「配りました」は すぐ 消えて 誰も 読めない。 */
            this._myCourse = got;
            this.net.setCourse(got.id, exportCode(got), got.name);
            this._render();
            return;
          }
          this.onPlay({
            courseId: got.id, courseDef: toDef(got),
            mode: this.mode === "cup" ? "race" : this.mode,
            bots: this.mode === "timeattack" ? 0 : this.botCount,
            myName: this.me.name, myColor: this.me.colorIndex,
            myHat: this.hat, myHatColor: this.hatColor,
            presetKind: this.qz.kind || "", presetId: this.qz.id || "", presetOwner: this.qz.owner || 0,
            players: [], seed: 1
          });
        }
      }, h("span", { class: "vs-lb-mineb-n", text: c.name }),
         h("span", { class: "vs-lb-mineb-m", text: (c.sections || []).length + " 区画" })));
    }
    if (対戦中) {
      this.mineEl.appendChild(h("p", { class: "vs-lb-note",
        text: "自作コースは 部屋主だけが えらべます。" }));
    } else if (this.net && this.roomId) {
      this.mineEl.appendChild(h("p", { class: "vs-lb-note",
        text: "えらぶと みんなへ 配ります（合言葉ごと 送るので、相手は 持っていなくても 走れます）。" }));
    }
  }

  async _loadPresets() {
    this._qzMine = listLocalPresets();
    this._renderQuiz();
    const shared = await listSharedPresets();
    this._qzOfficial = shared.official || [];
    this._qzPublic = shared.public || [];
    /* 選んで いた ものが 消えて いたら 内蔵へ 戻す（無い 単語帳のまま 始めない） */
    if (this.qz.kind === "mine" && !this._qzMine.some((q) => String(q.id) === String(this.qz.id))) {
      this.qz = { kind: "", id: "", owner: 0, name: "内蔵の 単語" }; this._save();
    }
    this._renderQuiz();
  }

  _setHat(key) {
    this.hat = String(key || "none"); this._save(); this._render();
    if (this.net && this.net.setHat) this.net.setHat(this.hat, this.hatColor);
  }
  _setHatColor(i) {
    this.hatColor = i % HAT_COLORS.length; this._save(); this._render();
    if (this.net && this.net.setHat) this.net.setHat(this.hat, this.hatColor);
  }

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
    if (this.net && this.roomId) {
      if (!this.isHost) { this.netNote.textContent = "部屋主だけが 始められます。"; return; }
      /* コースの 長さは サーバの 検算に 使う。ここで 一度 組み立てて 測る。
         ★ 自作コースを 配って いる ときは **その 長さ**を 送る。
           作り置きの 長さを 送ると 検算が ずれて、
           正しく ゴールした 人が「あり得ない」と 断られる。 */
      const 自作 = this._myCourse;
      const def = 自作 ? toDef(自作) : c;
      let len = 0;
      try {
        if (!this._lenCache) this._lenCache = {};
        const key = def.id;
        if (this._lenCache[key] === undefined) {
          this._lenCache[key] = Math.round(buildCourse(def).length);
        }
        len = this._lenCache[key] || 0;
      } catch (e) { len = 0; }
      this.net.setCourse(def.id, 自作 ? exportCode(自作) : "", 自作 ? 自作.name : "");
      this.net.setMode(this.mode);
      if (this.net.setPreset) {
        this.net.setPreset(this.qz.kind === "mine" || !this.qz.kind
          ? { kind: "", id: "", owner: 0, name: "" } : this.qz);
      }
      this.net.start(len);
      this.netNote.textContent = "始めます…";
      return;
    }
    /* 勝ち抜きは 3 本。**同じ 難しさの 中から** 選ぶ
       （急に 難しく なると 「腕でなく 運」に なる）。
       選び方は 種から 決めるので、同じ コースなら いつも 同じ 3 本。 */
    let cup = null;
    if (this.mode === "cup") {
      const t = tierOf(this.courseIndex);
      const 候補 = [];
      for (let i = t.from; i <= t.to && i < COURSES.length; i++) 候補.push(COURSES[i].id);
      const courses = [c.id];
      let 種 = ((this.courseIndex + 1) * 2654435761) >>> 0;
      let 守 = 0;
      while (courses.length < CUP_ROUNDS && 守++ < 200) {
        種 = (種 * 1664525 + 1013904223) >>> 0;
        const id = 候補[種 % Math.max(1, 候補.length)];
        if (id && courses.indexOf(id) < 0) courses.push(id);
      }
      /* 難しさの 段に コースが 足りない ときは 同じ ものを 使う */
      while (courses.length < CUP_ROUNDS) courses.push(c.id);
      cup = { round: 1, rounds: CUP_ROUNDS, courses, bots: null };
    }

    this.onPlay({
      courseId: c.id,
      mode: this.mode,
      cup,
      presetKind: this.qz.kind || "",
      presetId: this.qz.id || "",
      presetOwner: this.qz.owner || 0,
      /* 勝ち抜きは 落とし合う 遊びなので **相手が 要る**。
         0 人で 始めると 1 本目で いきなり 優勝に なって 何も 起きない。 */
      bots: this.mode === "timeattack" ? 0
        : (this.mode === "cup" ? Math.max(3, this.botCount) : this.botCount),
      myName: this.me.name,
      myColor: this.me.colorIndex,
      myHat: this.hat,
      myHatColor: this.hatColor,
      players: this.party.filter((p) => p.id !== this.me.id),
      seed: (Date.now() / 1000) | 0
    });
  }

  /* ── みんなで あそぶ ─────────────────────────────────────────── */
  _netHandlers() {
    return {
      onRoom: (room) => {
        if (!room) return;
        this.roomId = room.roomId || this.roomId;
        this.isHost = String(room.hostId) === String(this.net && this.net.you);
        this.party = (room.players || []).map((p) => ({
          id: p.id, name: p.name, colorIndex: p.colorIndex,
          hat: p.hat || "none", hatColor: p.hatColor | 0,
          ready: p.ready, online: p.online
        }));
        /* 自分の 行は 自分の ものへ 揃える */
        const mine = this.party.find((p) => p.id === (this.net && this.net.you));
        if (mine) { this.me.id = mine.id; this.me.colorIndex = mine.colorIndex; this.me.ready = mine.ready; this.ready = mine.ready; }
        this._roomCourseName = room.courseName || "";
        this._roomHasCourse = !!room.hasCourse;
        const idx = COURSES.findIndex((c) => c.id === room.courseId);
        if (idx >= 0 && !this.isHost) this.courseIndex = idx;
        if (room.mode && !this.isHost) this.mode = room.mode;
        /* ★ 入った ばかりの 自分は サーバ側では "なし" に なっている。
             一度だけ 自分の かぶりものを 知らせる（毎回 送ると 部屋の 知らせが 往復する）。 */
        if (mine && !this._hatSent && (this.hat !== "none" || this.hatColor !== 0)) {
          this._hatSent = true;
          if (this.net && this.net.setHat) this.net.setHat(this.hat, this.hatColor);
        }
        this.netNote.textContent = this.isHost
          ? "あなたが 部屋主です。全員が 準備 OK に なったら スタート。"
          : "部屋主が 始めるのを 待っています。";
        this._render();
      },
      onGo: (m) => {
        /* サーバの 合図で 全員 同時に 始める */
        const idx = COURSES.findIndex((c) => c.id === m.courseId);
        /* ★ 自作コースは **合言葉で 届く**。必ず 洗ってから 組み立てる
           （importCode の 中で 洗う）。読めなければ 作り置きへ 落ちる。 */
        let def = null;
        if (m.courseCode) {
          const got = importCode(m.courseCode, m.courseId || "my:room");
          if (got) { got.name = m.courseName || got.name; def = toDef(got); }
        }
        this.onPlay({
          courseDef: def,
          courseId: (def && def.id) || m.courseId || COURSES[Math.max(0, idx)].id,
          mode: m.mode || this.mode,
          bots: 0,
          myName: this.me.name, myColor: this.me.colorIndex,
          myHat: this.hat, myHatColor: this.hatColor,
          players: (m.room && m.room.players ? m.room.players : []).filter((p) => p.id !== this.net.you),
          seed: m.seed || 1,
          net: this.net,
          startAt: m.startAt
        });
      },
      onState: (st) => {
        if (st.error) this.netNote.textContent = "通信: " + st.error;
        else if (!st.connected && this.roomId) this.netNote.textContent = "つながりが 切れました。入り直しています…";
      }
    };
  }

  async _makeRoom() {
    this.netNote.textContent = "部屋を 作っています…";
    try {
      const c = COURSES[this.courseIndex];
      const d = await createRoom({ courseId: c.id, mode: this.mode, max: 8 });
      this.roomId = d.roomId;
      this._connect(d.wsUrl);
      this.codeInput.value = d.roomId;
    } catch (e) {
      this.netNote.textContent = "作れませんでした: " + String(e && e.message || e);
    }
  }

  async _joinRoom() {
    const code = String(this.codeInput.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length < 4) { this.netNote.textContent = "あいことばを 入れてください。"; return; }
    this.netNote.textContent = "入っています…";
    try {
      const d = await roomInfo(code);
      this.roomId = code;
      this._connect(d.wsUrl);
    } catch (e) {
      this.netNote.textContent = "入れませんでした: " + String(e && e.message || e);
    }
  }

  _connect(wsUrl) {
    if (this.net) { try { this.net.close(); } catch (e) {} }
    const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
    this.net = new SurviveNet(this._netHandlers());
    this.net.connect(wsUrl, tk);
    this.leaveBtn.classList.remove("vs-hide");
    this._render();
  }

  _leaveRoom() {
    if (this.net) { try { this.net.close(); } catch (e) {} }
    this.net = null; this.roomId = ""; this.isHost = false; this.party = []; this._hatSent = false;
    this.leaveBtn.classList.add("vs-hide");
    this.netNote.textContent = "";
    this._render();
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

    this._renderRecord(c);

    for (let i = 0; i < this.courseCards.length; i++) {
      this.courseCards[i].setAttribute("aria-selected", i === this.courseIndex ? "true" : "false");
    }
    for (const b of this.tierRow.children) {
      b.setAttribute("aria-selected", b.getAttribute("data-tier") === tier.key ? "true" : "false");
    }
    /* ★ ひとり用の 遊び方は 部屋の 中では 押せなく する。
       押せてしまうと 「始めたのに 自分だけ 別の 遊び」に なる。 */
    if (this.net && this.roomId) {
      const now = MODES.filter((x) => x.key === this.mode)[0];
      if (now && now.solo) { this.mode = "race"; this._save(); }
    }
    for (const b of this.modeRow.children) {
      const k = b.getAttribute("data-mode");
      b.setAttribute("aria-checked", k === this.mode ? "true" : "false");
      const m = MODES.filter((x) => x.key === k)[0];
      b.disabled = !!(m && m.solo && this.net && this.roomId);
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

    for (const b of this.qualityRow.children) {
      b.setAttribute("aria-checked", b.getAttribute("data-q") === this.quality ? "true" : "false");
    }
    if (this.volInput.value !== String(Math.round(this.volume * 100))) {
      this.volInput.value = String(Math.round(this.volume * 100));
    }
    this.musicBtn.setAttribute("aria-pressed", this.musicOn ? "true" : "false");
    this.musicBtn.textContent = this.musicOn ? "曲を 鳴らす" : "曲を 止める";
    this.invertBtn.setAttribute("aria-pressed", this.invertY ? "true" : "false");

    if (this.qzList) this._renderQuiz();
    if (this.mineEl) this._renderMine();
    if (this.hatRow) {
      for (const b of this.hatRow.children) {
        b.setAttribute("aria-checked", b.getAttribute("data-hat") === this.hat ? "true" : "false");
      }
      for (const b of this.hatColorRow.children) {
        b.setAttribute("aria-checked", Number(b.getAttribute("data-hc")) === this.hatColor ? "true" : "false");
      }
      const ht = HATS.filter((x) => x.key === this.hat)[0];
      this.hatName.textContent = ht ? ht.name : "なし";
    }
    if (this.ghostBtn) this.ghostBtn.setAttribute("aria-pressed", this.ghostOn ? "true" : "false");
    if (this.calmBtn) this.calmBtn.setAttribute("aria-pressed", this.calmOn ? "true" : "false");

    this.roomEl.textContent = "";
    if (this.roomId) {
      this.roomEl.appendChild(h("div", { class: "vs-lb-roomid" },
        h("span", { class: "vs-lb-roomlab", text: "あいことば" }),
        h("strong", { class: "vs-mono", text: this.roomId })));
    }
  }

  async enter() {
    /* 覚えていた 音の 設定を 効かせる */
    if (this.app && this.app.audio) {
      try { this.app.audio.setVolume(this.volume); this.app.audio.setMusic(this.musicOn); } catch (e) {}
    }
    if (this.app) this.app.invertY = this.invertY;
    this._render();
    /* 名前と アバターを 本体から 借りる */
    try {
      const n = document.querySelector("#appTabBar .app-v2-user-name, #appV2UserName");
      if (n && n.textContent.trim()) { this.me.name = n.textContent.trim().slice(0, 16); }
    } catch (e) {}
    this._render();
    this._loadFriends();
    this._loadPresets();
    this._loadMine();
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
    /* ★ 「先に 部屋を 作ってください」と 突き放さない。
       部屋が 無ければ **こちらで 作ってから** 誘う。 */
    try {
      if (!this.roomId) {
        this.friendsNote.textContent = "部屋を 作っています…";
        const c = COURSES[this.courseIndex];
        const d = await createRoom({ courseId: c.id, mode: this.mode, max: 8 });
        this.roomId = d.roomId;
        this.codeInput.value = d.roomId;
        this._connect(d.wsUrl);
      }
      this.friendsNote.textContent = f.name + " を 誘っています…";
      const base = String(window.VQ_API_BASE || "").replace(/\/+$/, "");
      const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
      const r = await fetch(base + "/api/survive/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify({ userId: f.id, roomId: this.roomId })
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.ok) throw new Error((d && d.message) || ("HTTP " + r.status));
      this.friendsNote.textContent = d.sent
        ? (f.name + " に 通知を 送りました。あいことば " + this.roomId)
        : (d.message || (f.name + " には 今日は これ以上 送れません。"));
    } catch (e) {
      this.friendsNote.textContent = "誘えませんでした: " + String(e && e.message || e);
    }
  }

  /** 外から あいことばを 渡されて 入る（通知を 押した とき） */
  async joinByCode(code) {
    this.codeInput.value = String(code || "").toUpperCase().slice(0, 6);
    await this._joinRoom();
  }
}

function rgb(a) { return "rgb(" + Math.round(a[0] * 255) + "," + Math.round(a[1] * 255) + "," + Math.round(a[2] * 255) + ")"; }
function fmtTime(s) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
}

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
.vs-lb-headbtns{ display:flex; gap:7px; }
.vs-lb-x{ width:36px; height:36px; border-radius:11px; background:rgba(255,255,255,.07);
  border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.75); font-size:14px; }
.vs-lb-x:hover{ background:rgba(255,255,255,.14); }
.vs-lb-grid{ flex:1; display:grid; grid-template-columns: 264px minmax(0,1fr) 300px; gap:12px; min-height:0; }
.vs-card{ background:${PALETTE.panel}; border:1px solid ${PALETTE.line}; border-radius:18px;
  padding:14px; overflow:auto; min-height:0; }
/* ★ 明暗の 差が 4.49:1 で **わずかに 足りなかった**（要 4.5:1）。
   10.5px の 小さな 文字なので、うすいと 本当に 読めない。 */
.vs-lb-lab{ font-size:10.5px; font-weight:800; letter-spacing:.10em; color:rgba(243,245,255,.60);
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
.vs-lb-record{ display:flex; align-items:baseline; gap:7px; flex-wrap:wrap;
  padding:0 2px 10px; font-size:12px; color:rgba(243,245,255,.62); }
.vs-lb-rec-lab{ font-size:10.5px; font-weight:800; letter-spacing:.06em; color:rgba(243,245,255,.60); }
.vs-lb-rec-v{ font-size:13px; color:${PALETTE.amber}; font-weight:800; }
.vs-lb-rec-who{ font-size:11px; color:rgba(243,245,255,.5); }
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
.vs-lb-cc-no{ font-size:10px; color:rgba(243,245,255,.60); font-weight:800; }
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
/* 4.39:1 → 明るく する（遊び方の 説明。ここが 読めないと 何の 遊びか 分からない） */
.vs-lb-mode-d{ font-size:10.5px; color:rgba(243,245,255,.66); }
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
.vs-lb-online{ display:flex; flex-direction:column; gap:7px; }
.vs-lb-onrow{ display:flex; gap:6px; align-items:center; }
.vs-lb-code{ flex:1; min-width:0; height:34px; padding:0 10px; border-radius:9px;
  background:rgba(255,255,255,.07); border:1px solid ${PALETTE.line}; color:${PALETTE.ink};
  font-size:13px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.vs-lb-code::placeholder{ letter-spacing:.02em; font-weight:400; color:rgba(243,245,255,.55); }
.vs-lb-roomid{ margin-top:9px; display:flex; align-items:center; justify-content:space-between;
  padding:8px 11px; border-radius:10px; background:rgba(255,255,255,.06); font-size:13px; }
.vs-lb-roomlab{ font-size:10.5px; color:rgba(243,245,255,.5); }
.vs-lb-rec-top{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.vs-lb-rec-tabs{ display:flex; gap:3px; margin-left:auto; }
.vs-lb-rec-tab{ padding:3px 9px; border-radius:999px; border:1px solid ${PALETTE.line};
  background:transparent; color:rgba(243,245,255,.62); font:inherit; font-size:11px; cursor:pointer; }
.vs-lb-rec-tab[aria-selected="true"]{ border-color:${PALETTE.mint}; color:#fff;
  background:rgba(90,230,190,.14); font-weight:700; }
.vs-lb-rec-board{ display:flex; flex-direction:column; gap:2px; }
.vs-lb-rec-row{ display:flex; align-items:baseline; gap:8px; padding:3px 7px; border-radius:7px;
  font-size:12px; color:rgba(243,245,255,.82); }
.vs-lb-rec-row[data-me="1"]{ background:rgba(90,230,190,.14); color:#fff; font-weight:700; }
.vs-lb-rec-no{ flex:0 0 auto; width:20px; text-align:right; color:rgba(243,245,255,.5); }
.vs-lb-rec-row[data-me="1"] .vs-lb-rec-no{ color:${PALETTE.mint}; }
.vs-lb-rec-gap{ font-size:11px; color:rgba(243,245,255,.35); padding-left:9px; line-height:1; }
.vs-lb-sharing{ color:${PALETTE.mint} !important; font-weight:700; }
.vs-lb-minerow{ display:flex; gap:6px; margin-bottom:5px; }
.vs-lb-mine{ display:flex; flex-direction:column; gap:3px; max-height:150px; overflow-y:auto; }
.vs-lb-mineb{ display:flex; align-items:baseline; gap:8px; width:100%; text-align:left;
  padding:6px 9px; border-radius:9px; border:1px solid ${PALETTE.line};
  background:rgba(255,255,255,.03); color:rgba(243,245,255,.9);
  font:inherit; font-size:12.5px; cursor:pointer; }
.vs-lb-mineb:hover:not(:disabled){ background:rgba(255,255,255,.08); }
.vs-lb-mineb:disabled{ opacity:.42; cursor:default; }
.vs-lb-mineb-n{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-mineb-m{ flex:0 0 auto; font-size:10.5px; color:rgba(243,245,255,.62); }
.vs-lb-hatbox{ margin:8px 0 2px; border:1px solid ${PALETTE.line}; border-radius:12px;
  background:rgba(255,255,255,.03); }
.vs-lb-hatbox summary{ list-style:none; cursor:pointer; padding:8px 11px; font-size:12px;
  color:rgba(243,245,255,.7); display:flex; align-items:center; gap:4px; }
.vs-lb-hatbox summary::-webkit-details-marker{ display:none; }
.vs-lb-hatbox summary::after{ content:"▸"; margin-left:auto; opacity:.5; }
.vs-lb-hatbox[open] summary::after{ content:"▾"; }
.vs-lb-hats{ display:flex; flex-wrap:wrap; gap:4px; }
.vs-lb-hat{ padding:5px 9px; border-radius:999px; border:1px solid ${PALETTE.line};
  background:transparent; color:rgba(243,245,255,.8); font:inherit; font-size:12px; cursor:pointer; }
.vs-lb-hat:hover{ background:rgba(255,255,255,.06); }
.vs-lb-hat[aria-checked="true"]{ border-color:${PALETTE.mint}; background:rgba(90,230,190,.14);
  color:#fff; font-weight:700; }
.vs-lb-hatcolors{ display:flex; flex-wrap:wrap; gap:5px; }
.vs-lb-hatc{ width:22px; height:22px; border-radius:50%; border:2px solid transparent;
  cursor:pointer; padding:0; }
.vs-lb-hatc[aria-checked="true"]{ border-color:#fff; box-shadow:0 0 0 2px rgba(0,0,0,.45); }
.vs-lb-qz{ margin:0 0 4px; border:1px solid ${PALETTE.line}; border-radius:12px;
  background:rgba(255,255,255,.03); }
.vs-lb-qz summary{ list-style:none; cursor:pointer; padding:9px 12px; font-size:13px;
  color:rgba(243,245,255,.72); display:flex; align-items:center; gap:4px; }
.vs-lb-qz summary::-webkit-details-marker{ display:none; }
.vs-lb-qz summary::after{ content:"▸"; margin-left:auto; opacity:.5; }
.vs-lb-qz[open] summary::after{ content:"▾"; }
.vs-lb-qz-nm, .vs-lb-hat-nm{ color:${PALETTE.mint}; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-qz-body{ padding:0 8px 8px; }
.vs-lb-qz-list{ max-height:210px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; }
.vs-lb-qz-h{ font-size:11px; font-weight:800; letter-spacing:.04em; color:rgba(243,245,255,.60);
  padding:8px 4px 2px; }
.vs-lb-qz-it{ display:flex; align-items:baseline; gap:8px; width:100%; text-align:left;
  padding:7px 10px; border-radius:9px; border:1px solid transparent; background:transparent;
  color:rgba(243,245,255,.86); font:inherit; font-size:13px; cursor:pointer; }
.vs-lb-qz-it:hover:not(:disabled){ background:rgba(255,255,255,.06); }
.vs-lb-qz-it[aria-checked="true"]{ border-color:${PALETTE.mint}; background:rgba(90,230,190,.12); }
.vs-lb-qz-it:disabled{ opacity:.4; cursor:default; }
.vs-lb-qz-l{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* 3.94:1 → 明るく する（「20 語」「対戦では 使えません」の 添え書き） */
.vs-lb-qz-s{ flex:0 0 auto; font-size:11px; color:rgba(243,245,255,.68); }
.vs-lb-settings{ margin-top:14px; border-top:1px solid ${PALETTE.line}; padding-top:10px; }
.vs-lb-settings summary{ font-size:12px; font-weight:800; color:rgba(243,245,255,.62);
  cursor:pointer; list-style:none; padding:4px 0; }
.vs-lb-settings summary::-webkit-details-marker{ display:none; }
.vs-lb-settings summary::before{ content:"▸ "; }
.vs-lb-settings[open] summary::before{ content:"▾ "; }
.vs-lb-set-body{ padding-top:4px; }
.vs-lb-quality{ display:flex; gap:4px; flex-wrap:wrap; }
.vs-lb-q{ height:28px; padding:0 10px; border-radius:8px; font-size:11.5px; font-weight:700;
  background:rgba(255,255,255,.06); border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.7); }
/* ★ 白文字 × 明るい 紫は 3.03:1 しか なかった。
   **文字を 濃く する**（背景の 色は 選ばれている 印なので 変えない）。 */
.vs-lb-q[aria-checked="true"]{ background:${PALETTE.violet}; color:#11132a; border-color:transparent; }
.vs-lb-range{ width:100%; accent-color:${PALETTE.mint}; }
.vs-lb-togglerow{ display:flex; gap:5px; margin-top:9px; flex-wrap:wrap; }
.vs-lb-toggle{ height:28px; padding:0 11px; border-radius:8px; font-size:11.5px; font-weight:700;
  background:rgba(255,255,255,.06); border:1px solid ${PALETTE.line}; color:rgba(243,245,255,.6); }
.vs-lb-toggle[aria-pressed="true"]{ background:rgba(55,224,176,.18); border-color:${PALETTE.mint};
  color:${PALETTE.mint}; }
.vs-lb-actions{ display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.vs-lb-actions .vs-btn{ width:100%; }

/* ★ 並べ枠の 中の 箱は 既定で **中身より 小さく ならない**（min-width:auto）。
   そのままだと 360px の 端末で 箱が 枠から 6px はみ出して 右端が 切れる。
   ここを 0 に して はじめて 縮む。 */
.vs-lb-grid > *{ min-width: 0; }

@media (max-width: 1080px){
  .vs-lb-grid{ grid-template-columns: 1fr 300px; }
  /* ★ ここで まるごと 消していた。
     消すと **色も かぶりものも 友だちも スマホから 触れなく なる**（実機の 幅で 気づいた）。
     幅が 足りないのは 横に 並べる ときだけ なので、下へ 回して 残す。 */
  .vs-lb-me{ grid-column: 1 / -1; }
  /* 名前と 状態は 本体の 画面にも 出ている ので、狭い ときは 省く */
  .vs-lb-me .vs-lb-merow{ display:none; }
}
@media (max-width: 780px){
  .vs-lb-grid{ grid-template-columns: 1fr; overflow:auto; }
  .vs-lb-right{ order:-1; }
  .vs-lb-me{ order:1; }
  .vs-lb-courses{ grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
  .vs-lb-preview{ min-height:130px; }
  /* 狭い ときは 中の 縦スクロールを やめて、画面ごと 流す。
     箱の 中を 別々に 動かすと 「下に まだ ある」ことに 気づけない。 */
  .vs-lb-right, .vs-lb-course, .vs-lb-me{ overflow:visible; max-height:none; }
}
`;
