/* ══════════════════════════════════════════════════════════════════════════
   VocabuSurvive — 入口

   本体からは これだけを 触る:
     window.VocabuSurvive.open(置き場)   … 開く
     window.VocabuSurvive.close()        … 閉じる（後始末も する）
     window.VocabuSurvive.state()        … いまの ようす（検査用）

   置き場の 中は **影の DOM**。本体の CSS も JS も 入って来られない。
   ══════════════════════════════════════════════════════════════════════════ */
import { Shell } from "./ui/shell.js";
import { CSS } from "./ui/theme.js";
import { LoadingScreen, LOADING_CSS } from "./boot/loading.js";
import { settingsFor, measure } from "./boot/caps.js";
import { VERSION, BUILD_DATE } from "./version.js";

const LOG = "[VocabuSurvive]";

class App {
  constructor() {
    this.shell = null;
    this.container = null;
    this.audio = null;
    this.settings = null;
    this.caps = null;
    this.opened = false;
    this.screenName = "";
    this._loadPromise = null;
    this._modules = null;
    this._err = "";
  }

  /* ── 開く ─────────────────────────────────────────────────────────── */
  async open(container, opts) {
    if (this.opened && this.container === container) return this;
    if (this.opened) this.close();
    this.container = container;
    this.opened = true;
    this._err = "";

    this.caps = measure();
    const forced = (opts && opts.tier) || readSavedTier();
    this.settings = settingsFor(forced);

    this.shell = new Shell(container);
    /* 画面ごとの CSS を 後ろから 足す */
    addCss(this.shell.root, LOADING_CSS);

    const loading = new LoadingScreen({
      settings: this.settings,
      onStart: () => this._startFromLoading()
    });
    this.shell.register("loading", loading);
    await this.shell.show("loading");
    this.screenName = "loading";

    /* 裏で 残りを 読む。START は もう 押せる。 */
    this._loadPromise = this._loadRest(loading);
    return this;
  }

  async _loadRest(loading) {
    /* ★ ここは **本当に やっている 仕事**を 順に 出す。
       束は 1 本なので 「読み込み中」は もう 終わっている。
       嘘の 進み具合を 出すくらいなら 出さない ほうが よい。 */
    const steps = [
      ["音を 用意しています", async () => {
        const m = await import("./audio/audio.js");
        this.audio = new m.Audio3();
        /* さわった ときに 開ける（iPhone は それまで 鳴らせない） */
        const open = () => { try { this.audio.unlock(); } catch (e) {} };
        this._audioOpen = open;
        window.addEventListener("pointerdown", open, { once: true, capture: true });
        window.addEventListener("keydown", open, { once: true, capture: true });
        return m;
      }],
      ["コースを 読み込んでいます", () => import("./data/courses.js")],
      ["ロビーを 用意しています", () => import("./ui/lobby.js")],
      ["通信の 準備をしています", () => import("./net/client.js")],
      ["試合の 仕組みを 読み込んでいます", () => import("./game/match.js")],
      ["問題を 先に 取っています", async () => {
        const q = await import("./data/questions.js");
        /* 通信が 遅くても ここで 待たない。控えは すでに 手元に ある。 */
        try { q.fetchQuestions({ count: 8, seed: 1 }).then((r) => { this._warmQuestions = r; }).catch(() => {}); } catch (e) {}
        return q;
      }]
    ];
    const mods = {};
    const keys = ["audio", "courses", "lobby", "net", "match", "questions"];
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      loading.setProgress(i / steps.length, label);
      try {
        mods[keys[i]] = await fn();
      } catch (e) {
        console.error(LOG, "読み込み失敗:", label, e);
        this._err = String(e && e.message || e);
        mods[keys[i]] = null;
      }
      /* 1 つずつ 画面を 描かせる。まとめて 読むと 題字の 動きが 止まる。 */
      await nextFrame();
    }
    this._modules = mods;
    try { await this._registerScreens(mods); } catch (e) { console.error(LOG, e); this._err = String(e && e.message || e); }
    loading.setProgress(1, "準備できました");
    return mods;
  }

  async _registerScreens(mods) {
    if (mods.lobby && mods.lobby.LobbyScreen) {
      addCss(this.shell.root, mods.lobby.LOBBY_CSS || "");
      /* あそび方の 札は ロビーと 試合の 両方で 使う。CSS は HUD 側に ある。 */
      try {
        const hud = await import("./ui/hud.js");
        addCss(this.shell.root, hud.HUD_CSS || "");
      } catch (e) {}
      const lobby = new mods.lobby.LobbyScreen({
        settings: this.settings,
        app: this,
        onPlay: (cfg) => this.startMatch(cfg),
        onExit: () => this.backToQuiz()
      });
      this.shell.register("lobby", lobby);
    }
    if (mods.match && mods.match.MatchScreen) {
      addCss(this.shell.root, mods.match.MATCH_CSS || "");
      const match = new mods.match.MatchScreen({
        settings: this.settings,
        app: this,
        onQuit: () => this.goLobby(),
        onAgain: (cfg) => this.startMatch(cfg)
      });
      this.shell.register("match", match);
    }
  }

  async _startFromLoading() {
    if (this._loadPromise) { try { await this._loadPromise; } catch (e) {} }
    await this.goLobby();
  }

  /** 通知や URL から 「この あいことばで 入って」と 言われた とき */
  async joinRoom(code) {
    if (this._loadPromise) { try { await this._loadPromise; } catch (e) {} }
    await this.goLobby();
    const lb = this.shell && this.shell.get("lobby");
    if (lb && lb.joinByCode) { try { await lb.joinByCode(code); } catch (e) { console.error(LOG, e); } }
  }

  async goLobby() {
    if (!this.shell) return;
    if (this.audio) { try { this.audio.startMusic("calm"); } catch (e) {} }
    if (this.shell.get("lobby")) { this.screenName = "lobby"; await this.shell.show("lobby"); }
    else { this.screenName = "loading"; await this.shell.show("loading"); }
  }

  /** 画質を 変える。**次の 試合から** 効く（いま 動いている 場は 触らない）。 */
  setQuality(t) {
    saveTier(t);
    this.settings = settingsFor(t);
    /* 画面へも 伝える（次に 作る 描き手が 使う） */
    for (const name of ["match", "lobby"]) {
      const sc = this.shell && this.shell.get(name);
      if (sc) sc.settings = this.settings;
    }
    return this.settings.tier;
  }

  async startMatch(cfg) {
    if (!this.shell || !this.shell.get("match")) { await this.goLobby(); return; }
    this.screenName = "match";
    if (this.audio) { try { this.audio.unlock(); this.audio.startMusic("run"); } catch (e) {} }
    await this.shell.show("match", cfg);
  }

  backToQuiz() {
    /* VocabuQuiz の ホームへ 戻す。本体の 関数へ 橋渡し。 */
    try {
      if (typeof window.__vqSurviveExit === "function") { window.__vqSurviveExit(); return; }
      const btn = document.querySelector('#appTabBar [data-app-tab="home"]');
      if (btn) btn.click();
    } catch (e) {}
  }

  /* ── 閉じる ───────────────────────────────────────────────────────── */
  close() {
    if (!this.opened) return;
    this.opened = false;
    this.screenName = "";
    if (this.audio) { try { this.audio.destroy(); } catch (e) {} this.audio = null; }
    if (this._audioOpen) {
      try {
        window.removeEventListener("pointerdown", this._audioOpen, true);
        window.removeEventListener("keydown", this._audioOpen, true);
      } catch (e) {}
      this._audioOpen = null;
    }
    if (this.shell) { try { this.shell.destroy(); } catch (e) {} this.shell = null; }
    this.container = null;
    this._loadPromise = null;
  }

  state() {
    return {
      version: VERSION, build: BUILD_DATE,
      opened: this.opened, screen: this.screenName,
      tier: this.settings ? this.settings.tier : "",
      autoTier: this.caps ? this.caps.tier : "",
      webgl2: this.caps ? this.caps.webgl2 : false,
      mobile: this.caps ? this.caps.mobile : false,
      loaded: this._modules ? Object.keys(this._modules).filter((k) => !!this._modules[k]) : [],
      error: this._err
    };
  }
}

/* ── 手伝い ───────────────────────────────────────────────────────────── */
function addCss(shadowRoot, css) {
  if (!css) return;
  const st = document.createElement("style");
  st.textContent = css;
  shadowRoot.appendChild(st);
}
function nextFrame() {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
    else setTimeout(r, 16);
  });
}
const TIER_KEY = "vq.survive.tier.v1";
function readSavedTier() {
  try { return localStorage.getItem(TIER_KEY) || "auto"; } catch (e) { return "auto"; }
}
export function saveTier(t) {
  try { localStorage.setItem(TIER_KEY, String(t || "auto")); } catch (e) {}
}

/* ── 外へ 出す ────────────────────────────────────────────────────────── */
const app = new App();

const api = {
  version: VERSION,
  build: BUILD_DATE,
  open: (container, opts) => app.open(container, opts),
  close: () => app.close(),
  state: () => app.state(),
  setTier: (t) => { saveTier(t); return t; },
  setQuality: (t) => app.setQuality(t),
  /* 通知を 押した ときの 入口。本体が これを 呼ぶ。 */
  joinRoom: (code) => app.joinRoom(code),
  /* 検査で 中を 見たいとき用。ふだんは 使わない。 */
  __app: app
};

try {
  if (typeof window !== "undefined") {
    window.VocabuSurvive = api;
    window.dispatchEvent(new CustomEvent("vq-survive-ready", { detail: { version: VERSION } }));
  }
} catch (e) {}

export default api;
export { App, CSS };
