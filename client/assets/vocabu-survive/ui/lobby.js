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
import { listLocalPresets, listSharedPresets, BANK_SIZE } from "../data/questions.js";
import { PALETTE, BEAN_COLORS, beanByIndex } from "./theme.js";
import { COURSES, tierOf, TIERS, dailyCourseIndex, todayKey } from "../data/courses.js";
import { CUP_ROUNDS } from "../game/sim.js";
import { clearGhost } from "../data/ghost.js";
import { listMyCourses, getMyCourse, toDef, exportCode, importCode } from "../data/mycourse.js";
import { themeOf } from "../game/theme3d.js";
import { worldName } from "../rpg/world/terrain.js";
import { HATS, HAT_COLORS } from "../game/bean.js";
import { LobbyStage } from "./lobbystage.js";
import { SurviveNet, createRoom, roomInfo } from "../net/client.js";
import { buildCourse } from "../game/course.js";
import { drawCourseMap } from "./coursemap.js";
import { HelpCard } from "./hud.js";
import { 没入したいか, 没入の好み } from "../boot/loading.js";
import * as Immersive from "./immersive.js";
import { regionOf, GATE_NAME, hatOpen, hatNeed, nextReward, growthOf, totalXP, localXP,
         medalOf, nextMedal, targetsOf, bestOf, MEDALS, streak } from "../data/world.js";

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
    this.遊び = "run";
    /* さがす（探索）の 支度。種＝世界の 番号。0 は「まだ 選んで いない」 */
    this.rpgSeed = 0;
    this.rpgList = null;          /* null＝まだ 読んで いない */
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
    /* ★ 相手の 人数と 強さは **_restore の 前**に 決める。
       _build の 中で 初期値を 入れて いた ので、覚えて いた ものを
       上書きして いた（順番の 事故）。 */
    this.botCount = 3;
    this.botLevel = "";      /* "" = おまかせ（コースの 難しさから 自動） */

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
      if (typeof raw.bots === "number") this.botCount = Math.max(0, Math.min(7, raw.bots | 0));
      if (["", "easy", "normal", "hard"].indexOf(String(raw.botLevel || "")) >= 0) this.botLevel = String(raw.botLevel || "");
      if (raw.play === "rpg" || raw.play === "run") this.遊び = raw.play;
      if (typeof raw.rpgSeed === "number") this.rpgSeed = raw.rpgSeed | 0;
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
        hat: this.hat, hatColor: this.hatColor, recScope: this.recScope,
        bots: this.botCount, botLevel: this.botLevel || "",
        play: this.遊び, rpgSeed: this.rpgSeed
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

  /* 下見の 図。組み立てた ものは 覚えて おく（30 本 建て直さない）。 */
  _drawMap(c) {
    if (!this.mapEl) return;
    try {
      if (!this._built) this._built = Object.create(null);
      if (!this._built[c.id]) this._built[c.id] = buildCourse(c);
      const box = this.mapEl.parentElement ? this.mapEl.parentElement.getBoundingClientRect() : { width: 320 };
      drawCourseMap(this.mapEl, this._built[c.id], {
        w: Math.max(160, Math.round(box.width - 28)), h: 88, pad: 6, label: false, alpha: 0.85
      });
    } catch (e) { /* 図が 出なくても 遊べる */ }
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
      /* ★ まだ 手に 入って いない ものも **並べて 見せる**（2026-08-31）。
         隠すと 「増える」ことが 分からず、走る 理由に ならない。 */
      this.hatRow.appendChild(h("button", {
        class: "vs-lb-hat", type: "button", role: "radio", "data-hat": ht.key,
        "aria-label": ht.name, title: ht.name,
        onclick: () => this._setHat(ht.key)
      }, ht.name));
    }
    /* 次の ごほうび（育ちの 一言） */
    this.rewardEl = h("p", { class: "vs-lb-reward" });
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
      h("div", { class: "vs-lb-qz-body" }, this.hatRow, this.rewardEl,
        h("div", { class: "vs-lb-lab", text: "色" }), this.hatColorRow,
        h("p", { class: "vs-lb-note", text: "見た目だけです。速さは 変わりません。" })));

    /* ★ **これまでの 成績。** サーバは ずっと 数えていたのに、
       どこにも 出して いなかった（誰も 見られない 数字だった）。 */
    this.statsEl = h("div", { class: "vs-lb-stats", "aria-label": "これまでの 成績" });

    this.friendsEl = h("div", { class: "vs-lb-friends" });
    /* ★ 印を 1 つ 足す。案内文は 画面に いくつも あるので、
       「いちばん 最初の .vs-lb-note」で 友だちの 欄を 指すのは もう 効かない。 */
    this.friendsNote = h("p", { class: "vs-lb-note vs-lb-friendnote", text: "読み込み中…" });

    /* コース */
    this.tierRow = h("div", { class: "vs-lb-tiers", role: "tablist", "aria-label": "難しさ" });
    for (const t of TIERS) {
      /* ★ 地方ごとの 進み（2026-08-31）。
         「次は どこへ 行けば いいか」が 一目で 分かる ように、
         その 地方で **記章を いくつ 取ったか**を 札に 出す。
         取って いなければ 数を 出さない（0/5 は 気持ちが 下がる）。 */
      const 数 = h("span", { class: "vs-lb-tier-n vs-mono" });
      const b = h("button", {
        class: "vs-lb-tier", type: "button", role: "tab", "data-tier": t.key,
        onclick: () => this._jumpTier(t)
      }, h("span", { text: regionOf(t.key).short }), 数);
      b.__n = 数; b.__tier = t;
      this.tierRow.appendChild(b);
    }
    this.courseList = h("div", { class: "vs-lb-courses", role: "listbox", "aria-label": "コース" });
    this.courseCards = [];
    for (let i = 0; i < COURSES.length; i++) {
      const c = COURSES[i];
      const card = this._courseCard(c, i);
      this.courseCards.push(card);
      this.courseList.appendChild(card);
    }

    /* ★ **今日の コース。** 30 本 あっても「どれを 走ろう」で 止まる。
       日付だけから 決める ので、誰が 開いても 同じ もの。
       今週の 上位表と 合わせると「今日 これで 競う」に なる。 */
    this.dailyEl = h("button", {
      class: "vs-lb-daily", type: "button",
      onclick: () => { this.courseIndex = dailyCourseIndex(); this._save(); this._render(); }
    });

    this.previewEl = h("div", { class: "vs-lb-preview" });
    /* ★ 下見に **上から 見た 形**を 出す。
       名前と 一言だけでは 「どんな コースか」が 分からず、
       30 本の 中から えらぶ 手がかりに ならない。
       組み立てた 結果は 覚えて おく（同じ コースを 何度も 建てない）。 */
    this.mapEl = h("canvas", { class: "vs-lb-map", "aria-hidden": "true" });
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

    /* さがす の 世界の 一覧 */
    this.rpgEl = h("div", { class: "vs-lb-worlds" });

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
    /* ★ 全画面の 好み（2026-08-31）。
       **できるかどうかを その場で 出す。** 端末に よっては 本当の 全画面が
       無い（iPhone の Safari）ので、「効くふり」を しない。 */
    this.fsBtn = h("button", {
      class: "vs-lb-toggle", type: "button", role: "switch",
      onclick: () => { 没入の好み(!没入したいか()); this._render(); }
    }, "全画面で 開く");
    this.fsNote = h("p", { class: "vs-lb-note" });

    /* ★ 窓を 開いた のに **たたんだ 見出しが 1 行 だけ** 出ていた
       （実写で 確認）。窓の 中では 開いた ままに する。 */
    this.settingsEl = h("div", { class: "vs-lb-settings is-open" },
      h("div", { class: "vs-lb-set-body" },
        h("div", { class: "vs-lb-lab", text: "画面" }),
        h("div", { class: "vs-lb-togglerow" }, this.fsBtn), this.fsNote,
        h("div", { class: "vs-lb-lab", text: "画質" }), this.qualityRow,
        h("div", { class: "vs-lb-lab", text: "音の 大きさ" }), this.volInput,
        h("div", { class: "vs-lb-lab", text: "その他" }),
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
    for (const n of [0, 1, 3, 5, 7]) {
      this.botRow.appendChild(h("button", {
        class: "vs-lb-bot", type: "button", "data-n": String(n),
        onclick: () => { this.botCount = n; this._save(); this._render(); }
      }, n === 0 ? "1人で" : (n + 1) + "人"));
    }
    /* ★ 相手の 強さ（2026-08-31）。
       これまで **コースの 難しさから 自動で 決めて いた**だけで、
       選べなかった。初めての 人は 難しい コースで 置いて いかれ、
       慣れた 人は やさしい コースで 張り合いが 無い。
       ★ 既定は 「おまかせ」（これまでと 同じ 動き）。 */
    this.botLvRow = h("div", { class: "vs-lb-bots", role: "radiogroup", "aria-label": "相手の 強さ" });
    for (const [k, 名] of [["", "おまかせ"], ["easy", "やさしい"], ["normal", "ふつう"], ["hard", "つよい"]]) {
      this.botLvRow.appendChild(h("button", {
        class: "vs-lb-bot", type: "button", role: "radio", "data-lv": k,
        onclick: () => { this.botLevel = k; this._save(); this._render(); }
      }, 名));
    }

    /* いま 何で 走るか（コース・遊び方）。PLAY の すぐ 上に 出す。 */
    this.pickEl = h("div", { class: "vs-lb-pickin" });
    /* ── 立体の 場面 ────────────────────────────────────────────────
       ★ ロビーが **管理画面**に なっていた（表と つまみが 並ぶだけ）。
         真ん中は 自分の キャラクターに 明け渡し、数字と つまみは 端と
         「窓」へ 逃がす。 */
    this.stageEl = h("canvas", { class: "vs-lb-stage", "aria-hidden": "true" });

    /* ── 窓（押すと 出る）────────────────────────────────────────── */
    this.panels = {};
    const 窓 = (key, 題, ...中) => {
      const body = h("div", { class: "vs-lb-pane-body" }, ...中);
      const el = h("div", {
        class: "vs-lb-pane", "data-pane": key, role: "dialog",
        "aria-label": 題, "aria-hidden": "true"
      },
        h("div", { class: "vs-lb-pane-head" },
          h("h2", { class: "vs-lb-pane-t", text: 題 }),
          h("button", {
            class: "vs-lb-x", type: "button", "aria-label": "閉じる",
            onclick: () => this._openPane("")
          }, "✕")),
        body);
      this.panels[key] = el;
      return el;
    };

    const 窓釦 = (key, 名, sub) => h("button", {
      class: "vs-lb-tile", type: "button", "data-tile": key,
      onclick: () => this._openPane(key)
    }, h("span", { class: "vs-lb-tile-n", text: 名 }),
       h("span", { class: "vs-lb-tile-s", text: sub || "" }));
    this._tile = 窓釦;

    this.tileCourse = 窓釦("course", "コース", "えらぶ");
    this.tileLook = 窓釦("look", "きせかえ", "色 と かぶりもの");
    this.tileLook.classList.add("is-keep");
    this.tileParty = 窓釦("party", "みんなで", "あいことば");
    this.tileMine = 窓釦("mine", "自分の コース", "作る・走る");

    return h("div", { class: "vs-lobby" },
      this.stageEl,
      h("div", { class: "vs-lb-vig" }),

      /* 上の 帯 */
      h("header", { class: "vs-lb-top" },
        h("button", {
          class: "vs-lb-who", type: "button", "aria-label": "これまでの 成績",
          onclick: () => this._openPane(this.pane === "stats" ? "" : "stats")
        }, this.avatarEl,
          h("div", { class: "vs-lb-whotx" }, this.nameEl,
            h("div", { class: "vs-lb-st" }, h("i", { class: "vs-lb-dot" }),
              h("span", { text: "オンライン" })))),
        this.dailyEl,
        h("div", { class: "vs-lb-topbtns" },
          h("button", {
            class: "vs-lb-x", type: "button", "aria-label": "あそび方",
            title: "あそび方", onclick: () => this._showHelp()
          }, "?"),
          h("button", {
            class: "vs-lb-x", type: "button", "aria-label": "設定",
            title: "設定", onclick: () => this._openPane("setting")
          }, "⚙"),
          h("button", { class: "vs-lb-x", type: "button", "aria-label": "閉じる", onclick: () => this.onExit() }, "✕"))),

      /* ★ 探索モードへの 入口（2026-09-02）。
         走る 遊びとは **別の 遊び**なので、遊び方の 並びには 入れない。
         「もう 1 つの 入口」として 目立つ ところに 置く。 */
      /* ★ 遊びの 入口（2026-09-02 作り直し）。
         走る 遊びと 探索は **別もの**。上に 2 枚 並べて、
         「いま どちらを 遊ぶか」を いちばん 先に 決めさせる。
         前は 遊び方の 並びに 混ぜて いて、探索が 見つからなかった。 */
      h("div", { class: "vs-lb-ways", role: "group", "aria-label": "遊びをえらぶ" },
        h("button", {
          class: "vs-lb-way is-run" + (this.遊び === "run" ? " is-on" : ""), type: "button",
          onclick: () => { this.遊び = "run"; this._save(); this._render(); }
        },
          h("span", { class: "vs-lb-way-t", text: "はしる" }),
          h("span", { class: "vs-lb-way-d", text: "コースを走って、門の問題に答える" })),
        h("button", {
          class: "vs-lb-way is-rpg" + (this.遊び === "rpg" ? " is-on" : ""), type: "button",
          onclick: () => { this.遊び = "rpg"; this._save(); this._render(); this._世界を読む(); }
        },
          h("span", { class: "vs-lb-way-k", text: "NEW" }),
          h("span", { class: "vs-lb-way-t", text: "さがす" }),
          h("span", { class: "vs-lb-way-d", text: "はてしない世界。集める・作る・建てる・戦う" }))),

      /* 左下 … これまでの 成績 */
      h("section", { class: "vs-lb-corner is-bl", "data-pane": "stats", "aria-label": "これまで" },
        h("div", { class: "vs-lb-lab", text: "これまで" }), this.statsEl),

      /* ★ 右の 帯と 右下の PLAY を **1 つの 箱**へ（2026-08-31）。
         PC では display:contents なので 何も 変わらない。
         スマホの 縦では この 箱ごと 画面の 下へ 敷き、
         **舞台（自分の キャラクター）が 常に 見える**ように する。
         前は 遊び方の 板が 舞台を 覆い、しかも 途中で 切れていた（実写）。 */
      h("div", { class: "vs-lb-bottom" },
        /* 右 … 遊び方と 記録 */
        /* ★ さがす の 支度（2026-09-02）。
           前は 「さがす」を 押した 瞬間に 世界が 始まって いて、
           **続きか 新しくか を 選べなかった**。ここで 選ばせる。 */
        h("section", { class: "vs-lb-rail is-rpg", "aria-label": "さがす の 支度" },
          h("div", { class: "vs-lb-lab", text: "世界" }), this.rpgEl),
        h("section", { class: "vs-lb-rail is-run", "aria-label": "遊び方" },
          h("div", { class: "vs-lb-lab", text: "遊び方" }), this.modeRow,
          h("div", { class: "vs-lb-lab", text: "門に 出る 問題" }), this.qzEl,
          /* ★ 人数と 強さは **横に 並べる**。縦に 積むと 帯の 下が 切れる
           （実写で 「相手の 強さ」の 見出しだけ 見えて いた）。 */
        h("div", { class: "vs-lb-two" },
          h("div", null, h("div", { class: "vs-lb-lab", text: "人数" }), this.botRow),
          h("div", null, h("div", { class: "vs-lb-lab", text: "相手の 強さ" }), this.botLvRow))),

        /* 右下 … 大きい PLAY */
        h("div", { class: "vs-lb-play" },
          h("div", { class: "vs-lb-tiles" }, this.tileCourse, this.tileLook, this.tileParty, this.tileMine),
          h("div", { class: "vs-lb-pick" }, this.pickEl),
          h("div", { class: "vs-lb-actions" }, this.readyBtn, this.startBtn))),

      /* ── 窓 ── */
      窓("course", "コースを えらぶ",
        this.previewEl, this.mapEl, this.recordEl, this.tierRow, this.courseList),
      窓("look", "きせかえ",
        h("div", { class: "vs-lb-lab", text: "色" }), this.colorRow, this.hatEl),
      窓("party", "みんなで あそぶ",
        h("div", { class: "vs-lb-lab", text: "いま 集まっている 人" }), this.partyEl,
        this.roomEl, this.onlineEl,
        h("div", { class: "vs-lb-lab", text: "友だち" }), this.friendsNote, this.friendsEl),
      窓("mine", "自分の コース",
        h("div", { class: "vs-lb-minerow" }, this.editBtn), this.mineEl),
      窓("setting", "設定", this.settingsEl),
      h("div", { class: "vs-lb-scrim", onclick: () => this._openPane("") }));
  }
  /* ══ さがす の 世界（2026-09-02）══════════════════════════════════
     しまって ある 世界を 並べ、続きから 入るか 新しく 作るかを 選ぶ。
     ★ 読むのは **押した ときだけ**。ロビーを 開く たびに
       IndexedDB を 触ると、走る だけの 人にも 待ちが 出る。 */
  async _世界を読む() {
    if (this._世界読み中) return;
    this._世界読み中 = true;
    try {
      const S = await import("../rpg/sys/save.js");
      const 種 = await S.一覧();
      const 一覧 = [];
      for (const sd of 種) {
        const j = await S.load(sd);
        if (!j) continue;
        一覧.push({ 種: sd, 見: j.見 || {}, t: j.t || 0 });
      }
      一覧.sort((a, b) => b.t - a.t);
      this.rpgList = 一覧;
      if (!this.rpgSeed && 一覧.length) this.rpgSeed = 一覧[0].種;
      this._世界を描く();
    } catch (e) { this.rpgList = []; this._世界を描く(); }
    this._世界読み中 = false;
  }

  _世界を描く() {
    const box = this.rpgEl;
    if (!box) return;
    box.textContent = "";
    if (this.遊び !== "rpg") return;
    if (this.rpgList === null) {
      box.appendChild(h("div", { class: "vs-lb-wnote", text: "読んで います…" }));
      return;
    }
    box.appendChild(h("div", { class: "vs-lb-wnote",
      text: "はてしない 土地を 歩き、集めて、作って、建てて、戦う。門の 言葉に 答えると 強くなる。" }));
    for (const w of this.rpgList) {
      const 見 = w.見 || {};
      const on = this.rpgSeed === w.種;
      const d = w.t ? new Date(w.t) : null;
      const 日 = d ? (d.getMonth() + 1) + "/" + d.getDate() : "";
      box.appendChild(h("button", {
        class: "vs-lb-world" + (on ? " is-on" : ""), type: "button",
        onclick: () => { this.rpgSeed = w.種; this._save(); this._render(); }
      },
        h("span", { class: "vs-lb-world-n", text: 見.名 || ("世界 " + w.種) }),
        h("span", { class: "vs-lb-world-d",
          text: "段位 " + (見.段 || 1) + (見.章 ? "・" + 見.章 : "") + (日 ? "・" + 日 : "") })));
    }
    if (!this.rpgList.length) {
      box.appendChild(h("div", { class: "vs-lb-wnote",
        text: "まだ 世界が ありません。新しく 作って ください。" }));
    }
    /* 新しい 世界。**名前を 先に 見せる**（同じ 種なら 同じ 世界に なる ので、
       気に入る 名前が 出るまで 押し直せる）。 */
    const 新種 = this._新種 || (this._新種 = (Date.now() ^ (Math.random() * 0x7fffffff)) & 0x7fffffff);
    /* ★ 何も 選んで いない ときは **見せて いる 新しい 世界**を そのまま 使う。
       別の 種で 始めると、名前を 見て 選んだのに 違う 世界に なる。 */
    if (!this.rpgSeed) this.rpgSeed = 新種;
    const 既存 = this.rpgList.some((w) => w.種 === this.rpgSeed);
    box.appendChild(h("button", {
      class: "vs-lb-world is-new" + (!既存 && this.rpgSeed === 新種 ? " is-on" : ""), type: "button",
      onclick: () => {
        if (this.rpgSeed === 新種) {
          /* もう 選んで いる → 名前を 振り直す */
          this._新種 = (Date.now() ^ (Math.random() * 0x7fffffff)) & 0x7fffffff;
          this.rpgSeed = this._新種;
        } else this.rpgSeed = 新種;
        this._save(); this._render();
      }
    },
      h("span", { class: "vs-lb-world-n",
        text: "あたらしい 世界: " + worldName(新種) }),
      h("span", { class: "vs-lb-world-d",
        text: !既存 && this.rpgSeed === 新種
          ? "もう一度 押すと 別の 世界に なる" : "はてしない 土地を 1 から 作る" })));
    /* 消す（選んで いる ものだけ）*/
    if (this.rpgSeed && this.rpgList.some((w) => w.種 === this.rpgSeed)) {
      box.appendChild(h("button", {
        class: "vs-lb-wdel", type: "button",
        onclick: async () => {
          const S = await import("../rpg/sys/save.js");
          await S.消す(this.rpgSeed);
          this.rpgSeed = 0; this.rpgList = null; this._save();
          this._render(); this._世界を読む();
        }
      }, "この 世界を 消す"));
    }
  }

  /* ── 窓の 開け閉め ────────────────────────────────────────────────
     ★ ロビーに 全部 並べると 管理画面に なる。
       ふだんは キャラクターだけ 見せ、要る ものだけ 前へ 出す。 */
  _openPane(key) {
    this.pane = key || "";
    for (const k in this.panels) {
      const on = k === this.pane;
      this.panels[k].setAttribute("data-on", on ? "1" : "0");
      this.panels[k].setAttribute("aria-hidden", on ? "false" : "true");
    }
    if (this.el) this.el.setAttribute("data-pane", this.pane);
    /* 開いた ときに 中身を 描き直す（閉じている 間は 触らない） */
    if (this.pane) this._render();
  }

  /* ── 立体の 場面 ──────────────────────────────────────────────── */
  _stageOn() {
    if (this.stage || this._stageFailed) return;
    /* ══ ★ **一度 使った 板は 使い回せない**（2026-09-01・訴え）════════
       訴え「2 回目以降から ロビーに 戻ると 背景が 黒く なって
             機能しなく なってしまう やばい バグが ある」

       出どころ:
         exit() で stage.destroy() → renderer.destroy() を 呼び、その 中で
         WEBGL_lose_context.loseContext() を 呼んで いる。
         **失った 文脈は その 板（canvas）に 貼り付く。**
         同じ 板へ もう一度 getContext("webgl2") を 頼んでも、
         新しい 文脈は 作られず **同じ 死んだ 文脈**が 返る。
         だから 2 回目の init() は **出来上がった ふりを して 真っ黒**に なる
         （失敗しないので 断りも 出ない＝いちばん 分かりにくい 落ちかた）。

       試合の 側は もう これを 知って いた（match._rebuild の
       「同じ 板は 使えない。失った 文脈は その 板に 貼り付いて いる」）。
       ロビーにも 同じ 手当てを 入れる。**板ごと 取り替える。** */
    if (this._stageUsed && this.stageEl) {
      try {
        const 新 = h("canvas", { class: "vs-lb-stage", "aria-hidden": "true" });
        if (this.stageEl.parentNode) this.stageEl.parentNode.replaceChild(新, this.stageEl);
        else this.stageEl.replaceWith ? this.stageEl.replaceWith(新) : null;
        this.stageEl = 新;
      } catch (e) {}
    }
    try {
      this.stage = new LobbyStage(this.stageEl, (this.app && this.app.settings) || this.settings || {});
      if (!this.stage.init()) { this._stageFailed = true; this.stage = null; return; }
      /* ★ ここで はじめて「この 板は 使った」。init に 失敗した ときは
         付けない（次に 開いた ときに もう一度 試せる ように）。 */
      this._stageUsed = true;
      this._syncStage();
    } catch (e) { this._stageFailed = true; this.stage = null; }
  }
  _syncStage() {
    if (!this.stage) return;
    try {
      this.stage.setLook(this.me.colorIndex, this.hat, this.hatColor);
      const c = COURSES[this.courseIndex];
      if (c) this.stage.setTheme(themeOf(c.theme));
    } catch (e) {}
  }
  /** 影の 器が 毎コマ 呼ぶ。 */
  tick(dt) { if (this.stage) { try { this.stage.tick(dt); } catch (e) {} } }

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
    /* ★ 記章（2026-08-31）。ひとりで 走る 理由を 「前の 自分より 速いか」
       だけに しない。取った ものは 一覧で ひと目で 分かる ように する。 */
    const med = h("i", { class: "vs-lb-cc-med" });
    const card = h("button", {
      class: "vs-lb-cc", type: "button", role: "option", "data-i": String(i),
      onclick: () => { this.courseIndex = i; this._save(); this._render(); }
    }, sw,
      h("span", { class: "vs-lb-cc-body" },
        h("span", { class: "vs-lb-cc-top" },
          h("span", { class: "vs-lb-cc-no vs-mono", text: String(i + 1).padStart(2, "0") }),
          med),
        h("span", { class: "vs-lb-cc-nm", text: c.name }),
        dots));
    card.__med = med;
    card.__course = c;
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

    /* ★ 数は **書かない。数える。**
       控えの 問題を 80 → 200 に 増やした のに ここが 80 の ままで、
       画面が 嘘を ついて いた（2026-08-31）。 */
    行({ kind: "", id: "", owner: 0, name: "内蔵の 単語" }, true,
      "いつでも 使える 英単語 " + BANK_SIZE);

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
            botLevel: this.botLevel || "",
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

  /** これまでの 成績。札が 無ければ 出さない。 */
  /* ★ たびの ようす（育ちと 7 つの 地方）。**ログインして いなくても 出す。**
     育ちも 記章も 端末に たまる ので、札が 無い 人にも 見せられる。
     数字の 成績（走った 回数・勝率）だけが サーバの もの。 */
  _drawJourney() {
    const xp = this._xp();
    const g = growthOf(xp);
    const 頭 = h("div", { class: "vs-lb-jrn" });
    頭.appendChild(h("div", { class: "vs-lb-jrn-top" },
      h("span", { class: "vs-lb-jrn-l", text: "たねの そだち" }),
      h("b", { class: "vs-lb-jrn-n", text: g.stage.name }),
      h("span", { class: "vs-lb-jrn-x vs-mono", text: xp + " XP" })));
    const bar = h("div", { class: "vs-lb-jrn-bar" });
    bar.appendChild(h("i", { style: "width:" + Math.round(g.ratio * 100) + "%" }));
    頭.appendChild(bar);
    頭.appendChild(h("p", { class: "vs-lb-jrn-lore",
      text: g.next ? ("つぎの 「" + g.next.name + "」まで あと " + g.toNext + " XP") : g.stage.lore }));
    /* れんぞく。走った 日が 続いて いる ことを 出す。 */
    {
      const r = streak();
      頭.appendChild(h("p", { class: "vs-lb-jrn-streak", "data-on": r.n > 0 ? "1" : "0" },
        r.n > 0
          ? ("れんぞく " + r.n + " 日" + (r.今日 ? "（きょうは 走りました）" : "　きょう 走ると " + (r.n + 1) + " 日目"))
          : "きょう 走ると れんぞく 1 日目"));
    }
    const 旅 = h("div", { class: "vs-lb-jrn-rgs" });
    for (const t of TIERS) {
      let 取 = 0, 全 = 0, 金 = 0;
      for (let k = t.from; k <= t.to && k < COURSES.length; k++) {
        全++;
        const m = medalOf(COURSES[k], bestOf(COURSES[k].id));
        if (m) 取++;
        if (m === "gold") 金++;
      }
      const rg = regionOf(t.key);
      旅.appendChild(h("button", {
        class: "vs-lb-jrn-rg", type: "button",
        "data-done": (取 === 全 && 全 > 0) ? "1" : "0",
        "data-all": (金 === 全 && 全 > 0) ? "1" : "0",
        title: rg.lore,
        onclick: () => { this._jumpTier(t); this._openPane("course"); }
      },
        h("span", { class: "vs-lb-jrn-rgn", text: rg.name }),
        h("span", { class: "vs-lb-jrn-rgb" }, h("i", { style: "width:" + Math.round((取 / Math.max(1, 全)) * 100) + "%" })),
        h("span", { class: "vs-lb-jrn-rgc vs-mono", text: 取 + "/" + 全 })));
    }
    頭.appendChild(旅);
    this.statsEl.appendChild(頭);
  }

  async _loadStats() {
    if (!this.statsEl) return;
    const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
    if (!tk) {
      this.statsEl.textContent = "";
      this._drawJourney();
      this.statsEl.appendChild(h("p", { class: "vs-lb-note", text: "ログインすると 走った 回数や 勝率も 残ります。" }));
      return;
    }
    let d = null;
    try {
      const base = String(window.VQ_API_BASE || "").replace(/\/+$/, "");
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(base + "/api/survive/stats", {
        headers: { Authorization: "Bearer " + tk }, signal: ctrl.signal
      });
      clearTimeout(to);
      d = await r.json();
    } catch (e) { d = null; }
    this.statsEl.textContent = "";
    const st = d && d.stats;
    this.stats = st || this.stats;

    this._drawJourney();

    if (!st) {
      this.statsEl.appendChild(h("p", { class: "vs-lb-note", text: "成績を 読めませんでした。" }));
      return;
    }
    if (!st.matches) {
      this.statsEl.appendChild(h("p", { class: "vs-lb-note", text: "まだ 1 回も 走っていません。" }));
      return;
    }
    const 率 = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const 時 = (sec) => {
      const h2 = Math.floor(sec / 3600), m2 = Math.round((sec % 3600) / 60);
      return h2 > 0 ? h2 + "時間 " + m2 + "分" : m2 + "分";
    };
    const 一 = (名, 値, 添) => this.statsEl.appendChild(h("div", { class: "vs-lb-stat" },
      h("span", { class: "vs-lb-stat-l", text: 名 }),
      h("span", { class: "vs-lb-stat-v vs-mono", text: 値 }),
      添 ? h("span", { class: "vs-lb-stat-s", text: 添 }) : null));
    一("走った", String(st.matches), "回");
    一("1 位", String(st.wins), 率(st.wins, st.matches) + "%");
    一("ゴール", String(st.finishes), 率(st.finishes, st.matches) + "%");
    一("クイズ", 率(st.correct, st.correct + st.wrong) + "%", st.correct + " / " + (st.correct + st.wrong));
    一("XP", String(st.xp), "");
    一("あそんだ 時間", 時(st.seconds), "");
    /* 自己ベストの ある コースの 数 */
    const 記 = (d.records || []).filter((r) => r.bestMs > 0).length;
    if (記) 一("記録の ある コース", String(記), "本");
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

  /* いまの XP（サーバの ぶんと 端末の ぶんの 大きい ほう）。 */
  _xp() {
    const st = this.stats || {};
    return totalXP(st.xp || 0);
  }

  _setHat(key) {
    /* ★ まだの ものは 選ばせない。ただし **押しても 何も 起きない**には
       しない。何を すれば 手に 入るかを その場で 出す。 */
    if (!hatOpen(key, this._xp())) {
      if (this.rewardEl) {
        this.rewardEl.textContent = hatNeed(key) + "（いまは まだ）";
        this.rewardEl.setAttribute("data-warn", "1");
      }
      return;
    }
    if (this.rewardEl) this.rewardEl.removeAttribute("data-warn");
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
    /* さがす は 別の 遊び。ここで 分ける。 */
    if (this.遊び === "rpg") {
      const 種 = this.rpgSeed || this._新種 || (Date.now() & 0x7fffffff);
      this.rpgSeed = 種; this._save();
      if (this.app && this.app.startRpg) this.app.startRpg({ seed: 種 });
      return;
    }
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
      botLevel: this.botLevel || "",
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
    /* いま どちらの 遊びの 支度か。CSS が これで 出し分ける。 */
    if (this.el) this.el.setAttribute("data-play", this.遊び);
    if (this.startBtn) this.startBtn.textContent = this.遊び === "rpg"
      ? (this.rpgSeed ? "つづきから" : "はじめる") : "スタート";
    this._世界を描く();
    const c = COURSES[this.courseIndex];
    const th = themeOf(c.theme);
    const tier = tierOf(this.courseIndex);

    /* 下見 */
    this.previewEl.textContent = "";
    /* ★ 下の ほうを 濃く する 1 枚を **同じ background の 中で** 上に 重ねる。
       別の 要素で 重ねると 順が ぶれる（実写で 文字の 上に 乗った）。 */
    this.previewEl.style.background =
      "linear-gradient(180deg, rgba(6,8,24,0) 26%, rgba(6,8,24,.30) 62%, rgba(6,8,24,.56) 100%),"
      + "linear-gradient(160deg," + rgb(th.sky.top) + " 0%," + rgb(th.sky.horizon) + " 58%," + rgb(th.floor) + " 100%)";
    /* ★ 地方と その 由来を 出す（2026-08-31・訴え「世界観」）。
       コース名 だけでは 「ここは どこか」が 分からない。
       物語は **1 行**。読まなくても 遊べる ように する。 */
    const 地 = regionOf(tier.key);
    this.previewEl.appendChild(h("div", { class: "vs-lb-pv-in" },
      h("div", { class: "vs-lb-pv-top" },
        h("span", { class: "vs-chip", text: tier.label }),
        h("span", { class: "vs-lb-pv-rg", text: 地.name })),
      h("h2", { class: "vs-lb-pv-nm", text: c.name }),
      h("p", { class: "vs-lb-pv-lore", text: 地.lore }),
      h("p", { class: "vs-lb-pv-core", text: c.core }),
      h("div", { class: "vs-lb-pv-meta" },
        h("span", { text: "目安 " + Math.round(c.estimatedDuration / 60 * 10) / 10 + " 分" }),
        h("span", { text: "難しさ " + c.difficulty + " / 10" }),
        h("span", { text: c.recommendedPlayers[0] + "〜" + c.recommendedPlayers[1] + " 人" })),
      /* 目標タイム。**取った ものは 光らせる。** */
      (() => {
        const b = bestOf(c.id), 取 = medalOf(c, b), g = targetsOf(c);
        const row = h("div", { class: "vs-lb-pv-med" });
        for (const m of MEDALS.slice().reverse()) {
          const 済 = 取 === "gold" ? true
            : 取 === "silver" ? (m.key !== "gold")
            : 取 === "bronze" ? (m.key === "bronze") : false;
          row.appendChild(h("span", { class: "vs-lb-pv-m", "data-m": m.key, "data-got": 済 ? "1" : "0" },
            h("i", null), h("span", { class: "vs-mono", text: fmtTime(g[m.key]) })));
        }
        return row;
      })()));

    /* 今日の コース */
    if (this.dailyEl) {
      const di = dailyCourseIndex();
      const dc = COURSES[di];
      this.dailyEl.textContent = "";
      this.dailyEl.setAttribute("aria-label", "今日の コース " + dc.name + " を えらぶ");
      this.dailyEl.setAttribute("data-on", di === this.courseIndex ? "1" : "0");
      /* ★ 狭い 画面では 「の コース」を 落とす（名前の 場所を 空ける）。
         上の 帯は 名札・札・ボタン 3 つで 詰まって いて、
         札は 84px まで 縮み **名前が 0 幅**に なっていた（390px の 実写）。 */
      this.dailyEl.appendChild(h("span", { class: "vs-lb-daily-l" },
        "今日", h("i", { class: "vs-lb-daily-l2", text: "の コース" })));
      this.dailyEl.appendChild(h("strong", { class: "vs-lb-daily-n", text: dc.name }));
      this.dailyEl.appendChild(h("span", { class: "vs-lb-daily-d", text: todayKey() }));
    }

    this._drawMap(c);
    this._renderRecord(c);

    for (let i = 0; i < this.courseCards.length; i++) {
      const card = this.courseCards[i];
      card.setAttribute("aria-selected", i === this.courseIndex ? "true" : "false");
      /* 記章。取って いなければ 何も 出さない（空の 印を 並べない）。 */
      if (card.__med && card.__course) {
        const m = medalOf(card.__course, bestOf(card.__course.id));
        card.__med.setAttribute("data-m", m || "");
        card.__med.title = m ? (MEDALS.filter((x) => x.key === m)[0] || {}).name + " 記章" : "";
      }
    }
    for (const b of this.tierRow.children) {
      b.setAttribute("aria-selected", b.getAttribute("data-tier") === tier.key ? "true" : "false");
      if (b.__n && b.__tier) {
        let 取 = 0, 全 = 0, 金 = 0;
        for (let k = b.__tier.from; k <= b.__tier.to && k < COURSES.length; k++) {
          全++;
          const m = medalOf(COURSES[k], bestOf(COURSES[k].id));
          if (m) 取++;
          if (m === "gold") 金++;
        }
        b.__n.textContent = 取 ? (取 + "/" + 全) : "";
        b.setAttribute("data-done", (取 > 0 && 取 === 全) ? "1" : "0");
        b.setAttribute("data-all", (金 > 0 && 金 === 全) ? "1" : "0");
      }
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
    /* ★ 「準備 OK」は **部屋の 中でしか 意味が ない**。
       ひとりの ときに 出すと、押さないと 始まらない ように 見える。 */
    this.readyBtn.className = "vs-btn vs-lb-ready " + (this.ready ? "is-ghost" : "is-mint")
      + (this.roomId ? "" : " vs-hide");
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
    this._syncStage();
    if (this.pickEl) {
      const m = MODES.filter((x) => x.key === this.mode)[0];
      this.pickEl.textContent = "";
      this.pickEl.appendChild(h("span", { class: "vs-lb-pick-c", text: c.name }));
      this.pickEl.appendChild(h("span", { class: "vs-lb-pick-m", text: m ? m.label : this.mode }));
      const 人 = this.roomId ? (this.party.length + " 人") : (this.botCount === 0 ? "1 人で" : (this.botCount + 1) + " 人");
      this.pickEl.appendChild(h("span", { class: "vs-lb-pick-n", text: 人 }));
    }
    /* 窓の 中の 札を 押した ままに しない（開いて いる 窓だけ 印を 付ける） */
    for (const k in this.panels) {
      const t = this.el && this.el.querySelector ? this.el.querySelector('[data-tile="' + k + '"]') : null;
      if (t) t.setAttribute("aria-expanded", this.pane === k ? "true" : "false");
    }
    if (this.hatRow) {
      const xp = this._xp();
      for (const b of this.hatRow.children) {
        const k = b.getAttribute("data-hat");
        b.setAttribute("aria-checked", k === this.hat ? "true" : "false");
        /* まだの ものは 薄く し、要る ものを 名前の 下に 出す。 */
        const 開 = hatOpen(k, xp);
        b.setAttribute("data-locked", 開 ? "0" : "1");
        b.title = 開 ? (b.getAttribute("aria-label") || "") : hatNeed(k);
      }
      /* まだの ものを 選んだ ままに しない（育ちが 戻る ことは 無いが 保険）。 */
      if (!hatOpen(this.hat, xp)) { this.hat = "none"; this._save(); }
      /* 次に 何が 手に 入るか。**走る 理由**を 1 行で 出す。 */
      if (this.rewardEl && !this.rewardEl.getAttribute("data-warn")) {
        const r = nextReward(xp);
        if (!r) this.rewardEl.textContent = "ぜんぶ 手に 入りました。";
        else {
          const 名 = r.hats.map((k) => (HATS.filter((x) => x.key === k)[0] || {}).name).filter(Boolean);
          this.rewardEl.textContent = "あと " + r.toNext + " XP で 「" + r.stage.name + "」"
            + (名.length ? "　→ " + 名.join("・") + " が 増える" : "");
        }
      }
      for (const b of this.hatColorRow.children) {
        b.setAttribute("aria-checked", Number(b.getAttribute("data-hc")) === this.hatColor ? "true" : "false");
      }
      const ht = HATS.filter((x) => x.key === this.hat)[0];
      this.hatName.textContent = ht ? ht.name : "なし";
    }
    if (this.botLvRow) {
      for (const b of this.botLvRow.children) {
        b.setAttribute("aria-checked", (b.getAttribute("data-lv") || "") === (this.botLevel || "") ? "true" : "false");
      }
    }
    if (this.fsBtn) {
      const 好 = 没入したいか();
      this.fsBtn.setAttribute("aria-pressed", 好 ? "true" : "false");
      /* 本当の 全画面が 使えるか を その場で 見て 書く。 */
      const 本 = Immersive.realOK && Immersive.realOK(
        (this.shell && this.shell.host) || null);
      this.fsNote.textContent = !好
        ? "START を 押しても 全画面に しません。"
        : (本 ? "START で 画面いっぱいに します。"
              : "この 端末は 本当の 全画面が 使えないので、器を 画面いっぱいに 広げます。");
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
    this._openPane("");
    this._stageOn();
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
    this._loadStats();
  }
  exit() {
    /* ★ 立体は **画面を 出たら 捨てる**。裏で 回し続けると
       試合の 板と GL を 取り合って 1 コマが 重く なる。 */
    if (this.stage) { try { this.stage.destroy(); } catch (e) {} this.stage = null; }
    this._openPane("");
  }
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
/* ── 遊びの 入口（2026-09-02 作り直し）── */
/* ★ 上の 帯（名前・今日のコース）と 重ならない 高さへ（2026-09-02・実写で 確認）。 */
.vs-lb-ways{position:absolute;left:50%;top:74px;transform:translateX(-50%);z-index:7;
  display:flex;gap:10px;align-items:stretch;}
.vs-lb-way{position:relative;display:flex;flex-direction:column;gap:3px;justify-content:center;
  min-width:176px;max-width:230px;padding:12px 20px 13px;border-radius:16px;cursor:pointer;text-align:left;
  border:1px solid rgba(255,255,255,.14);color:#fff;font:inherit;
  background:rgba(16,14,30,.54);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  box-shadow:0 10px 30px rgba(6,8,26,.34);
  transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s,border-color .18s;}
.vs-lb-way:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(6,8,26,.46);}
.vs-lb-way.is-on{border-color:rgba(160,200,255,.52);background:rgba(40,52,110,.62);}
.vs-lb-way.is-rpg{background:linear-gradient(135deg,rgba(46,58,120,.74),rgba(88,46,124,.68));
  border-color:rgba(150,190,255,.30);}
.vs-lb-way.is-rpg:hover{border-color:rgba(190,210,255,.55);}
/* ★ 遊びで 右の 帯を 出し分ける（2026-09-02）。
   走る 設定と さがす 設定を 同時に 出すと、どちらの 支度か 分からない。 */
.vs-lb-rail.is-rpg{display:none;}
.vs-lobby[data-play="rpg"] .vs-lb-rail.is-run{display:none;}
.vs-lobby[data-play="rpg"] .vs-lb-rail.is-rpg{display:block;}
.vs-lobby[data-play="rpg"] .vs-lb-tiles > *:not(.is-keep){display:none;}
.vs-lobby[data-play="rpg"] .vs-lb-pick{display:none;}
.vs-lobby[data-play="rpg"] .vs-lb-corner[data-pane="stats"]{display:none;}
.vs-lobby[data-play="rpg"] .vs-lb-ready{display:none;}
.vs-lb-worlds{display:flex;flex-direction:column;gap:6px;}
.vs-lb-world{display:flex;flex-direction:column;gap:2px;text-align:left;
  padding:9px 11px 10px;border-radius:12px;min-height:44px;
  border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);cursor:pointer;}
.vs-lb-world:hover{background:rgba(255,255,255,.10);}
.vs-lb-world.is-on{border-color:rgba(160,200,255,.55);background:rgba(52,66,132,.62);}
.vs-lb-world.is-new{border-style:dashed;}
.vs-lb-world-n{font:700 13px/1.35;}
.vs-lb-world-d{font:500 10.5px/1.45;color:rgba(255,255,255,.66);}
.vs-lb-wnote{font:500 11px/1.6;color:rgba(255,255,255,.6);padding:4px 2px 6px;}
.vs-lb-wdel{margin-top:4px;height:36px;border-radius:10px;font:600 11.5px/1;
  border:1px solid rgba(255,150,150,.28);background:rgba(120,40,40,.30);
  color:#FFC9C9;cursor:pointer;}
.vs-lb-wdel:hover{background:rgba(150,50,50,.42);}
.vs-lb-way-k{position:absolute;right:12px;top:9px;font:800 9px/1;letter-spacing:.2em;color:#9ED0FF;}
.vs-lb-way-t{font:750 19px/1.25;letter-spacing:.03em;}
.vs-lb-way-d{font:500 11px/1.5;color:rgba(255,255,255,.68);}
@media (max-width:900px){
  .vs-lb-ways{top:64px;gap:7px;}
  .vs-lb-way{min-width:0;flex:1 1 0;padding:9px 12px 10px;border-radius:13px;}
  .vs-lb-way-t{font-size:15px;} .vs-lb-way-d{font-size:9.5px;}
}
@media (max-width:640px){
  /* ★ 流れの 中へ 入れると **上の 帯と 重なる**（実写で 確認）。
     置いた ままで、上の 帯の 下へ 下ろす。 */
  .vs-lb-ways{top:112px;width:calc(100vw - 20px);gap:8px;}
  .vs-lb-way{padding:8px 11px 9px;border-radius:12px;max-width:none;}
  .vs-lb-way-t{font-size:14.5px;} .vs-lb-way-d{font-size:9px;line-height:1.45;}
  .vs-lb-way-k{right:8px;top:7px;font-size:8px;}
  .vs-lb-way:hover{transform:none;}
}
.vs-lb-rpg{position:absolute;left:50%;top:16px;transform:translateX(-50%);z-index:7;
  display:flex;flex-direction:column;align-items:center;gap:2px;
  padding:11px 26px 12px;border-radius:16px;cursor:pointer;text-align:center;
  border:1px solid rgba(150,190,255,.34);
  background:linear-gradient(135deg,rgba(46,58,120,.80),rgba(88,46,124,.74));
  box-shadow:0 12px 34px rgba(6,8,26,.44),inset 0 1px 0 rgba(255,255,255,.14);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  color:#fff;font:inherit;transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s;}
.vs-lb-rpg:hover{transform:translateX(-50%) translateY(-2px);
  box-shadow:0 18px 44px rgba(6,8,26,.52),inset 0 1px 0 rgba(255,255,255,.20);}
.vs-lb-rpg-k{font:800 9.5px/1 inherit;letter-spacing:.22em;color:#9ED0FF;}
.vs-lb-rpg-t{font:750 19px/1.25 inherit;letter-spacing:.02em;}
.vs-lb-rpg-d{font:500 11.5px/1.5 inherit;color:rgba(255,255,255,.72);}
@media (max-width:900px){
  .vs-lb-rpg{top:auto;bottom:calc(100% + 0px);padding:9px 18px 10px;border-radius:13px;}
  .vs-lb-rpg-t{font-size:16px;} .vs-lb-rpg-d{font-size:10.5px;}
}
@media (max-width:640px){
  .vs-lb-rpg{position:relative;left:auto;top:auto;bottom:auto;transform:none;width:100%;margin:0 0 8px;}
  .vs-lb-rpg:hover{transform:none;}
}

/* ══════════════════════════════════════════════════════════════════════════
   ロビー = **立体の 舞台 ＋ 浮いている 札**

   ★ 前は 表と つまみが 3 列に 並ぶ「管理画面」だった。
     真ん中は キャラクターに 明け渡し、要る ものだけ 端と 窓へ 置く。
   ══════════════════════════════════════════════════════════════════════════ */
.vs-lobby{ position:absolute; inset:0; overflow:hidden; background:${PALETTE.bgDeep}; }
.vs-lb-stage{ position:absolute; inset:0; width:100%; height:100%; display:block; }
.vs-lb-vig{ position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 78% at 50% 6%, transparent 42%, rgba(4,5,16,.42) 100%),
    linear-gradient(180deg, rgba(4,5,16,.52) 0%, transparent 22%, transparent 58%, rgba(4,5,16,.66) 100%); }

/* ── 上の 帯 ─────────────────────────────────────────────────────── */
.vs-lb-top{ position:absolute; left:0; right:0; top:0; z-index:3;
  display:flex; align-items:center; gap:10px; padding:12px 14px; pointer-events:none; }
.vs-lb-top > *{ pointer-events:auto; }
.vs-lb-top .vs-lb-daily{ flex:0 1 auto; min-width:0; margin:0; width:auto; max-width:40%; }
.vs-lb-who{ flex:0 0 auto; display:flex; align-items:center; gap:9px; padding:6px 14px 6px 6px;
  border-radius:var(--vs-r-full); background:var(--vs-surface); border:1px solid var(--vs-line); max-width:44%; }
/* ★ 名前は **折り返さない**。折り返すと 丸い 名札の 中で 2 行に なって つぶれる。 */
.vs-lb-whotx{ display:flex; flex-direction:column; min-width:0; }
.vs-lb-whotx .vs-lb-nm{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vs-lb-whotx .vs-lb-st{ white-space:nowrap; }
.vs-lb-topbtns{ flex:0 0 auto; margin-left:auto; display:flex; gap:6px; }

/* ── 端の 札 ─────────────────────────────────────────────────────── */
.vs-lb-corner, .vs-lb-rail{ position:absolute; z-index:3; padding:11px 13px;
  border-radius:var(--vs-r-md); background:var(--vs-surface); border:1px solid var(--vs-line); }
.vs-lb-corner.is-bl{ left:14px; bottom:14px; width:250px; }
/* ★ 高さを 決め打ちに しない。**下の PLAY の 上で 必ず 止める**
   （決め打ちだと 遊び方が 増える たびに かぶる）。 */
.vs-lb-rail{ right:14px; top:74px; bottom:272px; width:266px; overflow-y:auto; }

/* ── 右下の PLAY ─────────────────────────────────────────────────── */
.vs-lb-play{ position:absolute; right:14px; bottom:14px; z-index:4;
  display:flex; flex-direction:column; gap:8px; align-items:stretch; width:300px; }
.vs-lb-tiles{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.vs-lb-tile{ display:flex; flex-direction:column; gap:1px; text-align:left;
  padding:8px 11px; border-radius:var(--vs-r-md); cursor:pointer;
  border:1px solid var(--vs-line); background:var(--vs-surface);
  color:var(--vs-ink); font:inherit; }
.vs-lb-tile:hover{ background:var(--vs-surface-3); }
.vs-lb-tile[aria-expanded="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); color:var(--vs-accent-text); }
.vs-lb-tile-n{ font-size:12.5px; font-weight:650; }
.vs-lb-tile-s{ font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-pick{ padding:8px 12px; border-radius:var(--vs-r-md);
  background:var(--vs-surface); border:1px solid var(--vs-line); }
.vs-lb-pickin{ display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.vs-lb-pick-c{ font-size:14px; font-weight:750; color:var(--vs-ink); }
.vs-lb-pick-m{ font-size:11.5px; font-weight:650; color:var(--vs-accent-text); }
.vs-lb-pick-n{ font-size:11px; color:var(--vs-ink-sub); margin-left:auto; }

/* ── 窓 ──────────────────────────────────────────────────────────── */
.vs-lb-scrim{ position:absolute; inset:0; z-index:5; background:var(--vs-scrim);
  opacity:0; pointer-events:none; transition:opacity .16s ease; }
.vs-lobby[data-pane]:not([data-pane=""]) .vs-lb-scrim{ opacity:1; pointer-events:auto; }
.vs-lb-pane{ position:absolute; z-index:6; left:50%; top:50%;
  transform:translate(-50%,-48%) scale(.97); opacity:0; pointer-events:none;
  width:min(680px, calc(100% - 32px)); max-height:calc(100% - 96px);
  display:flex; flex-direction:column;
  border-radius:var(--vs-r-lg); background:var(--vs-surface);
  border:1px solid var(--vs-line); box-shadow:var(--vs-sh-modal);
  transition:opacity .16s ease, transform .16s ease; }
.vs-lb-pane[data-on="1"]{ opacity:1; pointer-events:auto; transform:translate(-50%,-50%) scale(1); }
.vs-lb-pane-head{ display:flex; align-items:center; gap:10px; padding:12px 14px 6px; }
.vs-lb-pane-t{ margin:0; font-size:15px; font-weight:750; }
.vs-lb-pane-head .vs-lb-x{ margin-left:auto; }
.vs-lb-pane-body{ padding:4px 14px 14px; overflow-y:auto; }

/* ★ きせかえは **走る人を 見ながら** 変えたい。
   真ん中に 出して 帳を かけると、変えた 結果が 見えない。
   左下へ 寄せ、帳も 薄く する。 */
.vs-lobby[data-pane="look"] .vs-lb-scrim{ opacity:.28; }
.vs-lb-pane[data-pane="look"]{ left:16px; top:auto; bottom:16px;
  transform:translate(0,10px) scale(.98); width:min(430px, calc(100% - 32px)); }
.vs-lb-pane[data-pane="look"][data-on="1"]{ transform:translate(0,0) scale(1); }
.vs-lb-pane[data-pane="look"] .vs-lb-colors{ gap:6px; }
.vs-lb-pane[data-pane="look"] .vs-lb-colors{ display:grid; grid-template-columns:repeat(8,1fr); gap:6px; max-width:300px; }

/* ★ PC では 何も しない。位置は これまでどおり それぞれが 決める。 */
.vs-lb-bottom{ display:contents; }

@media (max-width: 900px){
  /* ★ 狭い ときは **名札を 押した ときだけ** 出す。
     前は まるごと 消していた ので、スマホから 成績を 見られなかった。 */
  .vs-lb-corner.is-bl{ left:10px; right:10px; bottom:150px; width:auto;
    display:none; z-index:6; }
  .vs-lobby[data-pane="stats"] .vs-lb-corner.is-bl{ display:block; }
  .vs-lb-rail{ right:10px; top:66px; bottom:auto; width:min(240px, 46%); max-height:44%; }
  .vs-lb-play{ right:10px; left:10px; bottom:10px; width:auto; }
  .vs-lb-tiles{ grid-template-columns:repeat(4, 1fr); }
  .vs-lb-tile-s{ display:none; }
}

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


.vs-lobby{ position:absolute; inset:0; display:flex; flex-direction:column;
  background:var(--vs-bg);
  padding: calc(14px + var(--vs-safe-t)) calc(16px + var(--vs-safe-r)) calc(14px + var(--vs-safe-b)) calc(16px + var(--vs-safe-l));
  overflow:hidden; }
.vs-lb-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex:0 0 auto; }
.vs-lb-title{ font:var(--vq-type-heading-xl, 750 25px/1.4 inherit); letter-spacing:-.002em; color:var(--vs-ink); }
.vs-lb-headbtns{ display:flex; gap:7px; }
.vs-lb-x{ width:36px; height:36px; border-radius:var(--vs-r-sm); background:var(--vs-surface-2);
  border:1px solid ${PALETTE.line}; color:var(--vs-ink-sub); font-size:14px; }
.vs-lb-x:hover{ background:var(--vs-surface-3); }
.vs-lb-grid{ flex:1; display:grid; grid-template-columns: 264px minmax(0,1fr) 300px; gap:12px; min-height:0; }
.vs-card{ background:${PALETTE.panel}; border:1px solid ${PALETTE.line}; border-radius:var(--vs-r-lg);
  padding:14px; overflow:auto; min-height:0; }
/* ★ 明暗の 差が 4.49:1 で **わずかに 足りなかった**（要 4.5:1）。
   10.5px の 小さな 文字なので、うすいと 本当に 読めない。 */
.vs-lb-lab{ font-size:10.5px; font-weight:650; letter-spacing:.10em; color:var(--vs-ink-sub);
  margin:14px 0 7px; }
.vs-lb-lab:first-child{ margin-top:0; }
.vs-lb-merow{ display:flex; align-items:center; gap:11px; }
.vs-lb-av{ width:46px; height:46px; border-radius:var(--vs-r-md); flex:0 0 auto;
  box-shadow: inset 0 -6px 12px rgba(0,0,0,.18); }
.vs-lb-nm{ font-size:15px; font-weight:650; }
.vs-lb-st{ display:flex; align-items:center; gap:5px; font-size:11px; color:var(--vs-ink-sub); margin-top:2px; }
.vs-lb-dot{ width:7px; height:7px; border-radius:50%; background:${PALETTE.good}; }
.vs-lb-colors{ display:grid; grid-template-columns:repeat(8,1fr); gap:5px; }
.vs-lb-color{ aspect-ratio:1; border-radius:var(--vs-r-sm); border:2px solid transparent; }
.vs-lb-color[aria-checked="true"]{ border-color:var(--vs-accent); transform:scale(1.06); }
.vs-lb-note{ font-size:11.5px; color:var(--vs-ink-sub); line-height:1.7; }
.vs-lb-friends{ display:flex; flex-direction:column; gap:5px; }
.vs-lb-frow{ display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:var(--vs-r-sm);
  background:var(--vs-surface-2); font-size:12.5px; }
.vs-lb-fdot{ width:8px; height:8px; border-radius:50%; background:var(--vs-line-strong); }
.vs-lb-fdot[data-on="1"]{ background:${PALETTE.good}; }
.vs-lb-fnm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.vs-lb-preview{ border-radius:var(--vs-r-md); min-height:168px; padding:16px; display:flex; align-items:flex-end;
  position:relative; overflow:hidden; margin-bottom:12px; }
/* ★ 下見の 背景は **その 風景の 空の 色**。明るい 風景（草原・空・氷）だと
   白い 文字が 沈む（2026-08-31・ライトで 確認）。
   ★ 覆いを 別の 要素で 重ねる 手は やめた。重なる 順を 数で 決めても
     効かず、字の 影を 濃くしたら かえって にじんだ（実写で 2 回 失敗）。
   → **背景そのものを 2 枚 重ね**に する（下見を 作る ところで 入れる）。
     同じ 1 つの background なので 順が ぶれない。 */
/* ★★ 真因は 覆いでは なく **字の 色**だった（2026-08-31・3 度目で 分かった）。
   下見の 文字は 色を 決めて いなかった ので 本体の 字の 色を 継いで いた。
   明るい 見た目では それが **濃い 灰**に なり、
   風景の 明るい 空の 上で 沈む。暗い 見た目でだけ たまたま 白かった。
   → ここは 「写真の 上の 文字」なので **見た目に よらず 白**に する。
     下を 濃くする 1 枚は 背景の 中に 入れて ある。
   ★ この 中は 文字列の 中。**逆さ引用符を 書かない**（今日 2 度 やった）。 */
.vs-lb-pv-in{ position:relative; z-index:1; text-shadow:0 2px 10px rgba(4,6,20,.75), 0 1px 2px rgba(4,6,20,.5); }
.vs-lb-pv-in, .vs-lb-pv-in *{ color:#fff; }
.vs-lb-pv-lore, .vs-lb-pv-core, .vs-lb-pv-meta, .vs-lb-pv-m{ color:rgba(255,255,255,.9) !important; }
.vs-lb-pv-m[data-got="0"]{ opacity:.55; }
.vs-lb-pv-nm{ font-size:clamp(20px,3.4vw,30px); font-weight:750; margin:6px 0 4px; }
.vs-lb-pv-core{ font-size:12.5px; color:var(--vs-ink); max-width:44em; line-height:1.6; }
.vs-lb-pv-meta{ display:flex; gap:12px; margin-top:8px; font-size:11px; color:var(--vs-ink); }
.vs-lb-record{ display:flex; align-items:baseline; gap:7px; flex-wrap:wrap;
  padding:0 2px 10px; font-size:12px; color:var(--vs-ink-sub); }
.vs-lb-rec-lab{ font-size:10.5px; font-weight:650; letter-spacing:.06em; color:var(--vs-ink-sub); }
.vs-lb-rec-v{ font-size:13px; color:${PALETTE.amber}; font-weight:650; }
.vs-lb-rec-who{ font-size:11px; color:var(--vs-ink-sub); }
.vs-lb-pv-top{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.vs-lb-pv-rg{ font-size:11.5px; font-weight:700; letter-spacing:.04em;
  color:var(--vs-ink); opacity:.86; }
.vs-lb-pv-lore{ font-size:12px; line-height:1.75; color:var(--vs-ink);
  opacity:.72; margin:4px 0 2px; }
.vs-lb-tiers{ display:flex; gap:5px; flex-wrap:wrap; margin-bottom:9px; }
.vs-lb-tier{ display:inline-flex; align-items:center; gap:5px;
  height:28px; padding:0 11px; border-radius:var(--vs-r-full); font-size:11.5px; font-weight:700;
  background:var(--vs-surface-2); border:1px solid ${PALETTE.line}; color:var(--vs-ink-sub); }
.vs-lb-tier[aria-selected="true"]{ background:var(--vs-accent); color:var(--vs-accent-ink); border-color:transparent; }
.vs-lb-tier-n{ font-size:10px; opacity:.72; }
.vs-lb-tier[data-done="1"]{ border-color:#b9c0cf; }
.vs-lb-tier[data-all="1"]{ border-color:#e8c05a; box-shadow:0 0 0 1px rgba(232,192,90,.45); }
.vs-lb-courses{ display:grid; grid-template-columns:repeat(auto-fill,minmax(184px,1fr)); gap:7px; }
.vs-lb-cc{ display:flex; align-items:stretch; gap:0; border-radius:var(--vs-r-md); overflow:hidden;
  background:var(--vs-surface-2); border:1.5px solid transparent; text-align:left; }
.vs-lb-cc[aria-selected="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); }
.vs-lb-cc-sw{ width:8px; flex:0 0 auto; }
.vs-lb-cc-body{ padding:8px 10px; display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
.vs-lb-cc-no{ font-size:10px; color:var(--vs-ink-sub); font-weight:650; }
.vs-lb-cc-nm{ font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-cc-top{ display:flex; align-items:center; gap:6px; }
.vs-lb-cc-med{ width:11px; height:11px; border-radius:50%; display:none; flex:0 0 auto;
  box-shadow:inset 0 -2px 3px rgba(0,0,0,.28); }
.vs-lb-cc-med[data-m="bronze"]{ display:block; background:#c58a5a; }
.vs-lb-cc-med[data-m="silver"]{ display:block; background:#b9c0cf; }
.vs-lb-cc-med[data-m="gold"]{ display:block; background:#e8c05a; box-shadow:inset 0 -2px 3px rgba(0,0,0,.28), 0 0 8px rgba(232,192,90,.75); }
.vs-lb-pv-med{ display:flex; gap:10px; margin-top:7px; }
.vs-lb-pv-m{ display:inline-flex; align-items:center; gap:5px; font-size:11px; opacity:.42; }
.vs-lb-pv-m[data-got="1"]{ opacity:1; }
.vs-lb-pv-m > i{ width:9px; height:9px; border-radius:50%; }
.vs-lb-pv-m[data-m="bronze"] > i{ background:#c58a5a; }
.vs-lb-pv-m[data-m="silver"] > i{ background:#b9c0cf; }
.vs-lb-pv-m[data-m="gold"] > i{ background:#e8c05a; }
.vs-lb-cc-diff{ display:flex; gap:2px; margin-top:3px; }
.vs-lb-cc-d{ width:8px; height:3px; border-radius:var(--vs-r-xs); background:var(--vs-surface-3); }
.vs-lb-cc-d[data-on="1"]{ background:${PALETTE.amber}; }

.vs-lb-modes{ display:flex; flex-direction:column; gap:5px; }
/* ★ 舞台の 端に 置く ので **薄く 作る**。厚いと 6 つで 画面の 半分を 食う。 */
.vs-lb-mode{ display:flex; flex-direction:column; align-items:flex-start; gap:0;
  padding:6px 10px; border-radius:var(--vs-r-sm); background:var(--vs-surface-2);
  border:1.5px solid transparent; text-align:left; }
.vs-lb-mode[aria-checked="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); }
.vs-lb-mode[disabled]{ opacity:.4; }
.vs-lb-mode-l{ font-size:12.5px; font-weight:650; line-height:1.45; }
/* 4.39:1 → 明るく する（遊び方の 説明。ここが 読めないと 何の 遊びか 分からない） */
.vs-lb-mode-d{ font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-two{ display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:start; }
.vs-lb-two .vs-lb-lab{ margin:10px 0 5px; }
.vs-lb-bots{ display:flex; gap:5px; flex-wrap:wrap; }
.vs-lb-bots .vs-lb-bot{ padding:0 9px; font-size:11.5px; }
.vs-lb-bot{ height:30px; padding:0 12px; border-radius:var(--vs-r-sm); font-size:12px; font-weight:700;
  background:var(--vs-surface-2); border:1px solid ${PALETTE.line}; color:var(--vs-ink-sub); }
.vs-lb-bot[aria-pressed="true"]{ background:var(--vs-accent); color:var(--vs-accent-ink); border-color:transparent; }
.vs-lb-party{ display:flex; flex-direction:column; gap:4px; }
.vs-lb-prow{ display:flex; align-items:center; gap:8px; padding:6px 9px; border-radius:var(--vs-r-sm);
  background:var(--vs-surface-2); font-size:12.5px; }
.vs-lb-prow[data-ready="1"]{ background:var(--vs-good-bg); }
.vs-lb-prow[data-bot="1"]{ opacity:.62; }
.vs-lb-pdot{ width:9px; height:9px; border-radius:50%; }
.vs-lb-pnm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-pst{ font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-online{ display:flex; flex-direction:column; gap:7px; }
.vs-lb-onrow{ display:flex; gap:6px; align-items:center; }
.vs-lb-code{ flex:1; min-width:0; height:34px; padding:0 10px; border-radius:var(--vs-r-sm);
  background:var(--vs-surface-2); border:1px solid ${PALETTE.line}; color:${PALETTE.ink};
  font-size:13px; font-weight:650; letter-spacing:.14em; text-transform:uppercase; }
.vs-lb-code::placeholder{ letter-spacing:.02em; font-weight:400; color:var(--vs-ink-sub); }
.vs-lb-roomid{ margin-top:9px; display:flex; align-items:center; justify-content:space-between;
  padding:8px 11px; border-radius:var(--vs-r-sm); background:var(--vs-surface-2); font-size:13px; }
.vs-lb-roomlab{ font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-rec-top{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.vs-lb-rec-tabs{ display:flex; gap:3px; margin-left:auto; }
.vs-lb-rec-tab{ padding:3px 9px; border-radius:var(--vs-r-full); border:1px solid ${PALETTE.line};
  background:transparent; color:var(--vs-ink-sub); font:inherit; font-size:11px; cursor:pointer; }
.vs-lb-rec-tab[aria-selected="true"]{ border-color:var(--vs-accent); color:var(--vs-accent-text);
  background:var(--vs-accent-soft); font-weight:650; }
.vs-lb-rec-board{ display:flex; flex-direction:column; gap:2px; }
.vs-lb-rec-row{ display:flex; align-items:baseline; gap:8px; padding:3px 7px; border-radius:var(--vs-r-xs);
  font-size:12px; color:var(--vs-ink); }
.vs-lb-rec-row[data-me="1"]{ background:var(--vs-accent-soft); color:var(--vs-ink); font-weight:650; }
.vs-lb-rec-no{ flex:0 0 auto; width:20px; text-align:right; color:var(--vs-ink-sub); }
.vs-lb-rec-row[data-me="1"] .vs-lb-rec-no{ color:var(--vs-accent-text); }
.vs-lb-rec-gap{ font-size:11px; color:var(--vs-ink-faint); padding-left:9px; line-height:1; }
.vs-lb-sharing{ color:${PALETTE.mint} !important; font-weight:700; }
.vs-lb-map{ display:block; width:100%; height:88px; border-radius:var(--vs-r-sm);
  border:1px solid ${PALETTE.line}; background:var(--vs-surface); margin:8px 0 2px; }
.vs-lb-daily{ display:flex; align-items:baseline; gap:8px; width:100%; text-align:left;
  padding:7px 11px; margin-bottom:8px; border-radius:var(--vs-r-full); cursor:pointer;
  border:1px solid transparent; background:var(--vs-gold-bg);
  color:var(--vs-ink); font:inherit; font-size:12.5px; }
.vs-lb-daily:hover{ background:var(--vs-gold-bg); filter:brightness(1.15); }
.vs-lb-daily[data-on="1"]{ border-color:var(--vs-gold); background:var(--vs-gold-bg); }
.vs-lb-daily-l{ flex:0 0 auto; font-size:11px; font-weight:650; color:var(--vs-gold); letter-spacing:.04em; }
.vs-lb-daily-l2{ font-style:normal; }
.vs-lb-daily-n{ flex:1 1 auto; font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-daily-d{ flex:0 0 auto; font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-stats{ display:flex; flex-direction:column; gap:1px; margin-bottom:4px; }
.vs-lb-stat{ display:flex; align-items:baseline; gap:8px; font-size:12px; padding:2px 0; }
.vs-lb-stat-l{ flex:1 1 auto; color:var(--vs-ink-sub); }
.vs-lb-stat-v{ flex:0 0 auto; font-weight:650; color:var(--vs-ink); }
.vs-lb-stat-s{ flex:0 0 auto; width:4.6em; text-align:right; font-size:10.5px;
  color:var(--vs-ink-sub); }
.vs-lb-minerow{ display:flex; gap:6px; margin-bottom:5px; }
.vs-lb-mine{ display:flex; flex-direction:column; gap:3px; max-height:150px; overflow-y:auto; }
.vs-lb-mineb{ display:flex; align-items:baseline; gap:8px; width:100%; text-align:left;
  padding:6px 9px; border-radius:var(--vs-r-sm); border:1px solid ${PALETTE.line};
  background:var(--vs-sunken); color:var(--vs-ink);
  font:inherit; font-size:12.5px; cursor:pointer; }
.vs-lb-mineb:hover:not(:disabled){ background:var(--vs-surface-2); }
.vs-lb-mineb:disabled{ opacity:.42; cursor:default; }
.vs-lb-mineb-n{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-mineb-m{ flex:0 0 auto; font-size:10.5px; color:var(--vs-ink-sub); }
.vs-lb-hatbox{ margin:8px 0 2px; border:1px solid ${PALETTE.line}; border-radius:var(--vs-r-md);
  background:var(--vs-sunken); }
.vs-lb-hatbox summary{ list-style:none; cursor:pointer; padding:8px 11px; font-size:12px;
  color:var(--vs-ink-sub); display:flex; align-items:center; gap:4px; }
.vs-lb-hatbox summary::-webkit-details-marker{ display:none; }
.vs-lb-hatbox summary::after{ content:"▸"; margin-left:auto; opacity:.5; }
.vs-lb-hatbox[open] summary::after{ content:"▾"; }
.vs-lb-hats{ display:flex; flex-wrap:wrap; gap:4px; }
.vs-lb-hat{ padding:5px 9px; border-radius:var(--vs-r-full); border:1px solid ${PALETTE.line};
  background:transparent; color:var(--vs-ink); font:inherit; font-size:12px; cursor:pointer; }
.vs-lb-hat:hover{ background:var(--vs-surface-2); }
.vs-lb-hat[aria-checked="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft);
  color:var(--vs-accent-text); font-weight:650; }
/* まだ 手に 入って いない もの。**消さずに 薄く する**（増える ことが 見える）。 */
.vs-lb-hat[data-locked="1"]{ opacity:.42; border-style:dashed; }
.vs-lb-hat[data-locked="1"]::before{ content:"🔒 "; font-size:10px; }
.vs-lb-reward{ margin:8px 0 2px; font-size:11.5px; line-height:1.7; color:var(--vs-accent-text); }
.vs-lb-reward[data-warn="1"]{ color:var(--vs-danger-text); }
.vs-lb-hatcolors{ display:flex; flex-wrap:wrap; gap:5px; }
.vs-lb-hatc{ width:22px; height:22px; border-radius:50%; border:2px solid transparent;
  cursor:pointer; padding:0; }
.vs-lb-hatc[aria-checked="true"]{ border-color:var(--vs-accent); box-shadow:0 0 0 2px var(--vs-accent-soft); }
.vs-lb-qz{ margin:0 0 4px; border:1px solid ${PALETTE.line}; border-radius:var(--vs-r-md);
  background:var(--vs-sunken); }
.vs-lb-qz summary{ list-style:none; cursor:pointer; padding:9px 12px; font-size:13px;
  color:var(--vs-ink-sub); display:flex; align-items:center; gap:4px; }
.vs-lb-qz summary::-webkit-details-marker{ display:none; }
.vs-lb-qz summary::after{ content:"▸"; margin-left:auto; opacity:.5; }
.vs-lb-qz[open] summary::after{ content:"▾"; }
.vs-lb-qz-nm, .vs-lb-hat-nm{ color:var(--vs-accent-text); font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-lb-qz-body{ padding:0 8px 8px; }
.vs-lb-qz-list{ max-height:210px; overflow-y:auto; display:flex; flex-direction:column; gap:3px; }
.vs-lb-qz-h{ font-size:11px; font-weight:650; letter-spacing:.04em; color:var(--vs-ink-sub);
  padding:8px 4px 2px; }
.vs-lb-qz-it{ display:flex; align-items:baseline; gap:8px; width:100%; text-align:left;
  padding:7px 10px; border-radius:var(--vs-r-sm); border:1px solid transparent; background:transparent;
  color:var(--vs-ink); font:inherit; font-size:13px; cursor:pointer; }
.vs-lb-qz-it:hover:not(:disabled){ background:var(--vs-surface-2); }
.vs-lb-qz-it[aria-checked="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); }
.vs-lb-qz-it:disabled{ opacity:.4; cursor:default; }
.vs-lb-qz-l{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* 3.94:1 → 明るく する（「20 語」「対戦では 使えません」の 添え書き） */
.vs-lb-qz-s{ flex:0 0 auto; font-size:11px; color:var(--vs-ink-sub); }
/* ── たびの ようす ─────────────────────────────────────────────── */
.vs-lb-jrn{ margin-bottom:12px; padding:11px 12px; border-radius:var(--vs-r-md);
  background:var(--vs-surface-2); border:1px solid var(--vs-line); }
.vs-lb-jrn-top{ display:flex; align-items:baseline; gap:8px; }
.vs-lb-jrn-l{ font-size:10.5px; font-weight:650; letter-spacing:.08em; color:var(--vs-ink-sub); }
.vs-lb-jrn-n{ font-size:16px; font-weight:800; }
.vs-lb-jrn-x{ margin-left:auto; font-size:11px; color:var(--vs-ink-sub); }
.vs-lb-jrn-bar{ position:relative; height:5px; margin:7px 0 5px; border-radius:var(--vs-r-full);
  background:var(--vs-surface-3); overflow:hidden; }
.vs-lb-jrn-bar > i{ position:absolute; left:0; top:0; height:100%; background:var(--vs-accent); }
.vs-lb-jrn-lore{ font-size:11px; color:var(--vs-ink-sub); line-height:1.6; }
.vs-lb-jrn-streak{ margin-top:4px; font-size:11px; color:var(--vs-ink-sub); }
.vs-lb-jrn-streak[data-on="1"]{ color:var(--vs-accent-text); font-weight:650; }
.vs-lb-jrn-rgs{ display:flex; flex-direction:column; gap:3px; margin-top:9px; }
.vs-lb-jrn-rg{ display:flex; align-items:center; gap:8px; width:100%; text-align:left;
  padding:5px 8px; border-radius:var(--vs-r-xs); border:1px solid transparent;
  background:transparent; color:var(--vs-ink); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-lb-jrn-rg:hover{ background:var(--vs-surface-3); }
.vs-lb-jrn-rg[data-done="1"]{ border-color:#b9c0cf; }
.vs-lb-jrn-rg[data-all="1"]{ border-color:#e8c05a; }
.vs-lb-jrn-rgn{ flex:0 0 auto; min-width:7.5em; }
.vs-lb-jrn-rgb{ position:relative; flex:1 1 auto; height:4px; border-radius:var(--vs-r-full);
  background:var(--vs-surface-3); overflow:hidden; }
.vs-lb-jrn-rgb > i{ position:absolute; left:0; top:0; height:100%; background:${PALETTE.amber}; }
.vs-lb-jrn-rgc{ flex:0 0 auto; font-size:10.5px; color:var(--vs-ink-sub); }

.vs-lb-settings{ margin-top:14px; border-top:1px solid ${PALETTE.line}; padding-top:10px; }
.vs-lb-settings.is-open{ margin-top:0; border-top:0; padding-top:0; }
.vs-lb-settings summary{ font-size:12px; font-weight:650; color:var(--vs-ink-sub);
  cursor:pointer; list-style:none; padding:4px 0; }
.vs-lb-settings summary::-webkit-details-marker{ display:none; }
.vs-lb-settings summary::before{ content:"▸ "; }
.vs-lb-settings[open] summary::before{ content:"▾ "; }
.vs-lb-set-body{ padding-top:4px; }
.vs-lb-quality{ display:flex; gap:4px; flex-wrap:wrap; }
.vs-lb-q{ height:28px; padding:0 10px; border-radius:var(--vs-r-xs); font-size:11.5px; font-weight:700;
  background:var(--vs-surface-2); border:1px solid ${PALETTE.line}; color:var(--vs-ink-sub); }
/* ★ 白文字 × 明るい 紫は 3.03:1 しか なかった。
   **文字を 濃く する**（背景の 色は 選ばれている 印なので 変えない）。 */
.vs-lb-q[aria-checked="true"]{ background:var(--vs-accent); color:var(--vs-accent-ink); border-color:transparent; }
.vs-lb-range{ width:100%; accent-color:var(--vs-accent); }
.vs-lb-togglerow{ display:flex; gap:5px; margin-top:9px; flex-wrap:wrap; }
.vs-lb-toggle{ height:28px; padding:0 11px; border-radius:var(--vs-r-xs); font-size:11.5px; font-weight:700;
  background:var(--vs-surface-2); border:1px solid ${PALETTE.line}; color:var(--vs-ink-sub); }
.vs-lb-toggle[aria-pressed="true"]{ background:var(--vs-accent-soft); border-color:var(--vs-accent);
  color:var(--vs-accent-text); }
.vs-lb-actions{ display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.vs-lb-actions .vs-btn{ width:100%; }

/* ★ 並べ枠の 中の 箱は 既定で **中身より 小さく ならない**（min-width:auto）。
   そのままだと 360px の 端末で 箱が 枠から 6px はみ出して 右端が 切れる。
   ここを 0 に して はじめて 縮む。 */
.vs-lb-grid > *{ min-width: 0; }




/* ══ スマホの 縦（2026-08-31）══════════════════════════════════════
   ★ 直す前: 遊び方の 板が 舞台の 真ん中に 座り、**自分の キャラクターが
     見えない**。しかも 板が 途中で 切れて 「クイズラッシュ」が 半分（実写）。
   ★ 直しかた: 下の ものを **1 枚の 敷き**に まとめ、
     遊び方は **横に 流れる 札**へ。上は 舞台の ため に 空ける。 */
/* ★ 横向きの スマホ（高さが 低い）も 同じ 扱いに する（2026-08-31）。
   直す前は 遊び方の 帯が **上 66px から 下 272px まで**の 指定の ままで、
   高さ 390px の 画面では **52px しか 出ず**、「レース」の 途中で 切れていた
   （実写で 確認）。幅の 条件だけ 見ていて 高さを 見ていなかった。 */
@media (max-width: 560px), (max-height: 500px){
  .vs-lb-bottom{
    display:flex; flex-direction:column; gap:7px;
    position:absolute; left:0; right:0; bottom:0; z-index:4;
    padding:14px calc(10px + var(--vs-safe-r)) calc(10px + var(--vs-safe-b)) calc(10px + var(--vs-safe-l));
    /* ★ 色を 直に 書かない（2026-08-31）。明るい 見た目に すると
       白い 札の 後ろだけ 暗い 帯が 残って 不揃いに 見える。 */
    background:linear-gradient(180deg, transparent 0%,
      color-mix(in srgb, var(--vs-bg-deep) 55%, transparent) 26%,
      color-mix(in srgb, var(--vs-bg-deep) 90%, transparent) 62%);
    max-height:58%;
  }
  /* 遊び方・問題・人数 を **横 1 列**に 流す。切れない・覆わない。 */
  .vs-lb-rail{
    position:static; width:auto; max-height:none; right:auto; left:auto; top:auto; bottom:auto;
    display:flex; align-items:center; gap:7px; padding:7px 9px;
    overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
  }
  .vs-lb-rail::-webkit-scrollbar{ display:none; }
  /* ★ 右へ まだ 続く ことを 見せる。無いと 横に 流せる ことに 気づかない。 */
  .vs-lb-rail{
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%);
            mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 26px), transparent 100%);
  }
  .vs-lb-rail .vs-lb-lab{ margin:0; flex:0 0 auto; opacity:.72; }
  .vs-lb-modes{ flex-direction:row; flex-wrap:nowrap; gap:6px; }
  .vs-lb-mode{ flex:0 0 auto; white-space:nowrap; padding:6px 11px; }
  /* 「自分の コース」が 2 行に 折れて 札の 高さが 揃わなかった。 */
  .vs-lb-tile{ padding:7px 8px; }
  .vs-lb-tile-n{ font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vs-lb-mode-d{ display:none; }
  .vs-lb-bots{ flex-wrap:nowrap; }
  .vs-lb-bot{ flex:0 0 auto; }
  .vs-lb-qz{ flex:0 0 auto; margin:0; min-width:180px; }
  .vs-lb-qz-body{ display:none; }        /* 横 1 列では 開かない。窓で 選ぶ */
  .vs-lb-play{ position:static; width:auto; right:auto; left:auto; bottom:auto; }
  .vs-lb-who{ padding:4px 10px 4px 4px; }
  /* ★ いちばん 狭い 実機（320px）では 「今日の コース」が
     「今…」に なって 読めない。読めない ものは 出さない。
     （コースを えらぶ 窓の 中に 同じ ものが ある） */
  @media (max-width: 360px){ .vs-lb-top .vs-lb-daily{ display:none; } }
  /* ★ 狭い 画面では **コース名が 0 幅に つぶれて** 「今日の コース」しか
     読めなかった（390px の 実写で 確認）。日付は 縮まない 決まりに して
     いた ので、名前だけが 犠牲に なっていた。
     日付は 今日の ことなので 落として よい。名前は 落とせない。 */
  /* ★ 上の 帯は 名札・今日の 札・ボタン 3 つで 詰まって いて、
     札は 84px まで 縮み **コース名が 0 幅**に なっていた（390px の 実写）。
     文字を 削って 押し込むより、**行を 分ける**。
     空は いくらでも 空いて いる。 */
  @media (max-width: 560px){
    .vs-lb-top{ flex-wrap:wrap; row-gap:7px; }
    .vs-lb-top .vs-lb-daily{ order:3; flex:1 1 100%; max-width:none; width:auto; }
    .vs-lb-top .vs-lb-daily-d{ margin-left:auto; }
    .vs-lb-who{ max-width:56%; }
  }
  /* 窓は 下から 出る 板に する（真ん中の 小窓は 指では 使いにくい）。 */
  .vs-lb-pane{ left:0; right:0; top:auto; bottom:0; width:auto;
    max-height:82%; border-radius:var(--vs-r-lg) var(--vs-r-lg) 0 0;
    transform:translate(0,14px); }
  .vs-lb-pane[data-on="1"]{ transform:translate(0,0); }
  .vs-lb-pane[data-pane="look"]{ left:0; right:0; bottom:0; width:auto; }
  .vs-lb-pane-body{ padding-bottom:calc(14px + var(--vs-safe-b)); }
}
/* 横向きは 高さが 無い ので さらに 詰める。
   ★ コースを えらぶ 窓は 下見だけで 画面が 埋まって いた（実写）。
     横向きは **横に 広い**ので、下見と 形を 左右に 分ける。 */
@media (max-height: 520px){
  .vs-lb-preview{ min-height:96px; padding:10px 12px; margin-bottom:8px; }
  .vs-lb-pv-nm{ font-size:19px; margin:2px 0 2px; }
  .vs-lb-pv-lore{ display:none; }      /* 由来は 段の 札で 分かる */
  .vs-lb-pv-core{ font-size:11.5px; }
  .vs-lb-pv-meta{ margin-top:4px; font-size:10.5px; gap:9px; }
  .vs-lb-pv-med{ margin-top:4px; gap:8px; }
  .vs-lb-map{ height:56px; margin:4px 0 2px; }
  .vs-lb-pane-head{ padding:8px 12px 3px; }
  .vs-lb-pane-body{ padding:2px 12px 10px; }
  .vs-lb-courses{ grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:5px; }
  .vs-lb-cc-body{ padding:5px 8px; }
  .vs-lb-record{ padding-bottom:5px; font-size:11px; }
}
@media (max-height: 500px){
  .vs-lb-bottom{ max-height:66%; gap:5px; padding-top:10px; }
  .vs-lb-rail{ padding:5px 8px; }
  .vs-lb-tiles{ grid-template-columns:repeat(4,1fr); gap:5px; }
  .vs-lb-tile{ padding:6px 9px; }
  .vs-lb-pick{ padding:6px 10px; }
  .vs-lb-actions{ margin-top:0; gap:6px; }
  .vs-lb-pane{ max-height:88%; }
}

`;
