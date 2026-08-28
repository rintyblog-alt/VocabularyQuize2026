/* ══════════════════════════════════════════════════════════════════════════
   試合の 画面。

   ここが つなぐ もの:
     コース（course.js）／中身（sim.js）／描き（renderer.js）／
     カメラ／操作／HUD／クイズ／結果／音

   1 フレームの 流れ:
     ① 溜まった 時間を 1/60 の 歩に 割る（FixedStepper）
     ② 歩の ぶんだけ sim.step()
     ③ 端数（alpha）で **見た目だけ** 補間する
     ④ カメラ → 描く → HUD

   ★ ③ が 無いと、画面が 144Hz でも 60Hz でも 同じ 歩数しか 進まないので
     カクカクに 見える。物理は 60、見た目は 画面の 速さ。
   ══════════════════════════════════════════════════════════════════════════ */
import { h } from "../ui/shell.js";
import { PALETTE, BEAN_COLORS, beanByIndex } from "../ui/theme.js";
import { Renderer } from "../engine/renderer.js";
import { ThirdPersonCamera } from "../engine/camera.js";
import { m4, v3, clamp, lerp, damp } from "../engine/math.js";
import { registerCourseMeshes, M } from "./meshes.js";
import { Particles } from "../engine/particles.js";
import { BeanVisual, registerBeanMeshes, BEAN_HEIGHT, hatByKey, HAT_COLORS } from "./bean.js";
import { buildCourse } from "./course.js";
import { Player, FixedStepper, STEP, TUNE } from "./player.js";
import { Bot } from "./bot.js";
import { Sim, PHASE, MODE, TEAMS, cupKeep } from "./sim.js";
import { GATE_STATE } from "./gate.js";
import { Input } from "./input.js";
import { TouchPad, TOUCH_CSS } from "../ui/touch.js";
import { HUD, HUD_CSS, HelpCard } from "../ui/hud.js";
import { QuizPanel, QUIZ_CSS } from "../ui/quiz.js";
import { ResultPanel, RESULT_CSS } from "../ui/result.js";
import { COURSE_BY_ID, COURSES } from "../data/courses.js";
import { fetchQuestions, localQuestions, questionsFromPairs } from "../data/questions.js";
import { GhostRecorder, GhostPlayer, loadGhost, saveGhost } from "../data/ghost.js";
import { settingsFor, measure } from "../boot/caps.js";

const BEST_KEY = "vq.survive.best.v1";
const SPLIT_KEY = "vq.survive.splits.v1";   /* コースごとの 自己ベストの 区間 */
const GHOST_KEY = "vq.survive.ghost.on.v1";  /* ゴーストを 出すか */
const GHOST_RGB = [0.62, 0.78, 0.98];        /* 青白い。走る人の 8 色 どれとも 違う。 */

export class MatchScreen {
  constructor(opt) {
    this.app = opt.app;
    this.settings = opt.settings;
    this.onQuit = opt.onQuit || (() => {});
    this.onAgain = opt.onAgain || (() => {});
    this.title = "VocabuSurvive 試合";

    this.canvas = h("canvas", { class: "vs-canvas" });
    this.plates = h("div", { class: "vs-plates", "aria-hidden": "true" });
    this.input = new Input(this.canvas);
    this.touch = new TouchPad(this.input);
    this.hud = new HUD();
    this.quiz = new QuizPanel((i, correct) => this._answer(i, correct));
    this.result = new ResultPanel({
      onAgain: () => { this.result.hide(); this.onAgain(this.cfg); },
      /* 勝ち抜きの 次の 本。cfg は 結果の 画面が 組み立てて 持っている。 */
      onNext: (next) => { this.result.hide(); this.onAgain(next); },
      /* 間違えた 単語だけで もう一度。**同じ コース・同じ 相手**で 走る。 */
      onReview: (missed) => {
        this.result.hide();
        const cfg = Object.assign({}, this.cfg, {
          reviewWords: missed.map((m) => [m.q, m.a]),
          seed: (this.cfg.seed || 1) + 4242
        });
        this.onAgain(cfg);
      },
      onLobby: () => { this.result.hide(); this.onQuit(); },
      onExit: () => { this.result.hide(); this.app.backToQuiz(); }
    });
    /* ★ 初めての 人には 操作を 見せる。合図が 始まる 前に 出す。 */
    this.help = new HelpCard(() => { try { this.input.attach(); } catch (e) {} });
    this.pauseBtn = h("button", {
      class: "vs-pause", type: "button", "aria-label": "やめる",
      onclick: () => this._confirmQuit()
    }, "✕");

    this.el = h("div", { class: "vs-match" },
      this.canvas, this.plates, this.hud.el, this.touch.el,
      this.quiz.el, this.pauseBtn, this.help.el, this.result.el);

    this.renderer = null;
    this.cam = new ThirdPersonCamera();
    this.stepper = new FixedStepper(6);
    this.sim = null;
    this.course = null;
    this.local = null;
    this.bots = [];
    this.visuals = new Map();     /* playerId → {v:BeanVisual, prev:{}, cur:{}} */
    this.inputs = new Map();
    this.questions = [];
    this.qIndex = 0;
    this.pendingGate = null;
    this.running = false;
    this._acc = 0;
    this._plateEls = new Map();
    this._tmpV = v3.create();
    this._mat = m4.create();
    this.net = null;              /* 通信（あれば） */
    /* 粒。段で 数を 変える（低い 端末では 4 分の 1）。 */
    this.fx = null;
    this._dustAcc = 0;
  }

  /* ── 出入り ─────────────────────────────────────────────────────── */
  async enter(cfg) {
    this.cfg = cfg = cfg || {};
    const courseId = cfg.courseId || "c01";
    /* ★ 自分で 作った コースは 一覧に 無い ので、**定義を そのまま** 受ける。
       id だけ 見て いた ので、作った コースを 走ると 1 本目に なっていた。 */
    const def = cfg.courseDef || COURSE_BY_ID[courseId] || COURSES[0];

    if (!this.renderer) {
      try {
        this.renderer = new Renderer(this.canvas, this.settings);
        registerCourseMeshes(this.renderer);
        registerBeanMeshes(this.renderer);
        this.fx = new Particles(Math.round(260 * (this.settings.particles || 1)));
      } catch (e) {
        console.error("[VocabuSurvive] 描けません", e);
        this._fatal(String(e && e.message || e));
        return;
      }
    }

    this.course = buildCourse(def);
    this.course.applySky(this.renderer);
    this.renderer.fog.near = this.settings.drawDistance * 0.5;
    this.renderer.fog.far = this.settings.drawDistance;
    this.renderer.shadowRadius = 22;

    /* 人を 並べる */
    /* 遊び方。クイズラッシュだけ 制限時間が 短い（100 秒で 何問 通せるか）。 */
    const mode = cfg.mode || MODE.RACE;
    const 制限 = cfg.timeLimit || (mode === MODE.QUIZRUSH ? 100 : 300);
    /* ★ 勝ち抜きの **1 本の 中身は レースそのもの**。
       Sim には race として 渡す。走りの 決まりを 変えると
       レースの 出来を 落として まで 遊び方を 増やす ことに なる（要件 18）。
       「下から 落ちていく」のは Sim の 外側（この 画面と 結果）で 決める。 */
    this.sim = new Sim(this.course, {
      timeLimit: 制限, countdown: 3.2,
      mode: mode === MODE.CUP ? MODE.RACE : mode
    });
    this.cup = cfg.cup || null;
    this.visuals.clear();
    this.bots.length = 0;
    this._splits = [];
    this._missed = [];      /* 間違えた 単語（結果で 出す） */

    /* ── ゴースト（自己ベストと 並んで 走る）──────────────────────
       ★ **対戦では 出さない。** 相手が いる ところに 半透明の 自分が
         もう 1 人 いると、どれが 相手か 分からなく なる。
       ★ 読み込みは 待たない。届いたら 途中から 出る。 */
    this.ghostRec = this.ghostRec || new GhostRecorder();
    this.ghostRec.reset();
    this.ghost = null;
    this.ghostVis = null;
    this._ghostDelta = null;
    const me = new Player({
      id: "me", name: cfg.myName || "あなた", colorIndex: cfg.myColor || 0, isLocal: true,
      hat: cfg.myHat || "none", hatColor: cfg.myHatColor | 0
    });
    this.local = me;
    this.sim.add(me);
    this.sim.localId = me.id;

    const others = Array.isArray(cfg.players) ? cfg.players : [];
    const botCount = cfg.bots === undefined ? 3 : cfg.bots;
    this.net = cfg.net || null;
    this.online = !!this.net;
    for (const o of others) {
      /* 通信の 相手は こちらでは 動かさない（位置は 送られてくる） */
      const p = new Player({
        id: o.id, name: o.name, colorIndex: o.colorIndex, remote: this.online,
        hat: o.hat || "none", hatColor: o.hatColor | 0
      });
      this.sim.add(p);
    }
    /* ★ 勝ち抜きで 2 本目 以降は **同じ 顔ぶれ**を 連れて くる。
       毎回 作り直すと 名前も 色も 変わって、誰が 残ったのか 分からなく なる。 */
    const 引き継ぎ = (cfg.cup && Array.isArray(cfg.cup.bots)) ? cfg.cup.bots : null;
    for (let i = 0; i < botCount; i++) {
      const 元 = 引き継ぎ ? 引き継ぎ[i] : null;
      const ci = 元 ? 元.colorIndex : (i + 1 + (cfg.myColor || 0)) % BEAN_COLORS.length;
      /* ボットにも かぶりものを 配る（全員 素頭だと 誰が 誰か 分かりにくい）。
         種は 番号から 決める ので、同じ 面子なら いつも 同じ 見た目に なる。 */
      const p = new Player({
        id: 元 ? 元.id : "bot" + i,
        name: 元 ? 元.name : BOT_NAMES[i % BOT_NAMES.length], colorIndex: ci,
        hat: 元 ? 元.hat : BOT_HATS[i % BOT_HATS.length],
        hatColor: 元 ? 元.hatColor : (i * 5 + 3) % HAT_COLORS.length
      });
      this.sim.add(p);
      this.bots.push(new Bot(p, this.course, {
        level: 元 ? 元.level : (cfg.botLevel || pickBotLevel(def.difficulty, i)),
        seed: 元 ? 元.seed : 7000 + i * 131,
        /* 走る 線を 均等に 分ける（団子に ならない ように） */
        lane: botCount > 1 ? (i / (botCount - 1)) * 2 - 1 : 0
      }));
    }
    for (const p of this.sim.players) {
      const bv = new BeanVisual(beanByIndex(p.colorIndex).rgb);
      bv.hat = hatByKey(p.hat);
      const hc = HAT_COLORS[(p.hatColor | 0) % HAT_COLORS.length] || HAT_COLORS[0];
      bv.hatColor = [hc.rgb[0], hc.rgb[1], hc.rgb[2], 1];
      this.visuals.set(p.id, {
        v: bv,
        prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }
      });
    }
    this.sim.start();
    this._syncVisual(true);

    /* カメラ */
    this.cam.raycast = (from, dir, max) => this.course.world.ray(from, dir, max);
    /* 動きを 減らす 設定（OS か 手で 選んだ もの）。揺れを 止める。 */
    this.cam.shakeScale = this.settings.shakeScale === undefined ? 1 : this.settings.shakeScale;
    this.cam.invertY = !!(this.app && this.app.invertY);
    this.cam.wantDistance = 8.4;
    this.cam.wantPitch = 0.34;
    this.cam.height = 1.5;
    this.cam.snap([me.x, me.y, me.z], 0);

    /* ── 問題 ──────────────────────────────────────────────────────
       ★ **待たない。** 控えを すぐ 入れて 始め、サーバの ぶんは
         届いてから 差し替える。
         前は ここで await していたので、通信が 悪いと
         合図の 前に 最大 4.5 秒 何も 起きなかった（実測で 検査が 落ちた）。 */
    this.qIndex = 0;
    const seed = (cfg.seed || 1) * 977 + 13;
    const need = this.course.gates.length + 2;
    if (this.net && this.net.questions && this.net.questions.length >= need) {
      /* 対戦中は **サーバが 配った 問題**（全員 同じ）。答えは 隠されている。 */
      this.questions = this.net.questions.slice();
    } else if (Array.isArray(cfg.reviewWords) && cfg.reviewWords.length >= 2) {
      /* ★ 間違えた 単語だけで 作る。**通信は しない**（手元に ある）。
         足りない ぶんは 控えで 埋める（4 択の 迷わせ役が 要る）。 */
      const pairs = cfg.reviewWords.filter((x) => Array.isArray(x) && x[0] && x[1]);
      const q = questionsFromPairs(pairs, need, seed);
      this.questions = q.length >= need ? q : q.concat(localQuestions(need - q.length, seed + 11));
    } else {
      this.questions = localQuestions(need, seed);
      fetchQuestions({
        count: need, presetId: cfg.presetId || "", presetKind: cfg.presetKind || "",
        presetOwner: cfg.presetOwner || 0, seed, difficulty: def.difficulty
      }).then((qs) => {
        /* まだ 1 問も 出していない ときだけ 差し替える */
        if (this.qIndex === 0 && qs && qs.length >= need) this.questions = qs;
      }).catch(() => {});
    }

    if (!this.online && this._ghostOn()) {
      loadGhost(this.course.id).then((d) => {
        if (!d || this.course.id !== (d.id || this.course.id)) return;
        const g = new GhostPlayer(d);
        if (!g.ok) return;
        this.ghost = g;
        const gv = new BeanVisual(GHOST_RGB);
        gv.dark = [GHOST_RGB[0] * 0.72, GHOST_RGB[1] * 0.72, GHOST_RGB[2] * 0.78, 1];
        gv.hat = hatByKey(cfg.myHat || "none");
        gv.hatColor = [GHOST_RGB[0], GHOST_RGB[1], GHOST_RGB[2], 1];
        this.ghostVis = gv;
      }).catch(() => {});
    }

    /* 操作 */
    this.input.attach();
    this.quiz.attach();
    const caps = measure();
    this.touch.show(caps.touch);
    this.hud.setCourse(def.name);
    this.hud.update(this._hudState());

    /* 試合の 間は 本体の 下の 帯を しまう（横向きで 跳ぶ ボタンが 切れる） */
    try { if (typeof window.__vqSurviveImmersive === "function") window.__vqSurviveImmersive(true); } catch (e) {}

    /* 初めてなら 操作の 説明を 出す（合図の 間に 読める）。
       ★ **みんなで 遊ぶ ときは 合図を 止めない。**
         ほかの 人が 待たされる。読みながら 始まる。
         1 人の ときだけ 止めて、それでも 15 秒で 勝手に 閉じる
         （閉じ方が 分からず 固まる 人を 出さない）。 */
    if (!HelpCard.seen() && !cfg.noHelp) {
      this.help.show();
      this.helpHolds = !this.online;
      if (this._helpTimer) clearTimeout(this._helpTimer);
      this._helpTimer = setTimeout(() => { try { this.help.hide(); } catch (e) {} }, 15000);
    } else {
      this.helpHolds = false;
    }

    this.running = true;
    this._acc = 0;
    this.stepper.acc = 0;
    this._lastCount = -1;
    this._done = false;
    this._saved = false;          /* 記録を 残したか（脱落と ゴールで 二重に 残さない） */
    this.spectate = null;         /* 観戦中に 見ている 人 */
    this._newBest = false; this._prevBest = 0; this._prevSplits = []; this._xp = 0;
    return this;
  }

  exit() {
    try { if (typeof window.__vqSurviveImmersive === "function") window.__vqSurviveImmersive(false); } catch (e) {}
    this._quitClose();
    if (this._helpTimer) { clearTimeout(this._helpTimer); this._helpTimer = 0; }
    this.help.hide();
    this.running = false;
    this.input.detach();
    this.quiz.detach();
    this.quiz.close();
    this.result.hide();
    this.touch.show(false);
    for (const [, el] of this._plateEls) { try { el.remove(); } catch (e) {} }
    this._plateEls.clear();
  }

  destroy() {
    this.exit();
    if (this.renderer) { try { this.renderer.destroy(); } catch (e) {} this.renderer = null; }
  }

  resize() { /* renderer.resize() を 毎フレーム 呼ぶので ここでは 何も しない */ }

  /* ── 毎フレーム ─────────────────────────────────────────────────── */
  tick(dt) {
    if (!this.running || !this.renderer || !this.renderer.gl) return;
    const sz = this.renderer.resize();

    /* ① 見回し */
    /* ゲームパッドは 出来事が 来ない ので、毎コマ 自分で 見に 行く */
    this.input.pollPad();
    const look = this.input.takeLook(dt);
    if (look.dx || look.dy) this.cam.rotate(look.dx, look.dy);
    const z = this.input.takeZoom();
    if (z) this.cam.zoom(z);

    /* ★ 操作の 説明を 読んでいる 間は 合図を 進めない。
       読んでいる うちに レースが 始まって いたら 意味が ない。 */
    if (this.help.open && this.helpHolds && this.sim.phase === PHASE.COUNTDOWN) {
      this.stepper.acc = 0;
      const sz2 = sz;
      this.cam.update(dt, [this.local.x, this.local.y, this.local.z], 0, sz2.w / Math.max(1, sz2.h));
      const R0 = this.renderer;
      R0.shadowCenter[0] = this.local.x; R0.shadowCenter[1] = this.local.y; R0.shadowCenter[2] = this.local.z;
      R0.begin(this.cam);
      this.course.draw(R0, this.sim.time);
      for (const p of this.sim.players) {
        const v = this.visuals.get(p.id);
        if (v) v.v.draw(R0, p.x, p.y, p.z, p.yaw, 1);
      }
      R0.end(dt);
      return;
    }

    /* ② 決まった 歩で 進める */
    const n = this.stepper.advance(dt);
    for (let i = 0; i < n; i++) {
      this._collectInputs();
      this._savePrev();
      this._applyRemote();
      const evs = this.sim.step(this.inputs);
      this._onEvents(evs);
    }
    if (n > 0) this._syncVisual(false);

    /* ── ゴースト。**走っている 間だけ**。 */
    if (this.sim.phase === PHASE.RUNNING && !this.local.finished) {
      this.ghostRec.sample(this.sim.raceTime, this.local, this.local.progress);
      if (this.ghost) {
        this.ghost.at(this.sim.raceTime);
        if (this.ghostVis) this.ghostVis.update(dt, {
          speed: 6, grounded: true, vy: 0, yaw: this.ghost.yaw, stunned: 0
        });
        /* いま 自分が いる ところを ゴーストは 何秒で 通ったか */
        const tg = this.ghost.timeAt(this.local.progress);
        this._ghostDelta = tg >= 0 ? this.sim.raceTime - tg : null;
      }
    }
    /* 自分の 位置を 送る（中で 20Hz に 間引く） */
    if (this.net) this.net.tick(dt, this.local);

    /* ③ 見た目の 補間 */
    const a = this.stepper.alpha;
    for (const p of this.sim.players) {
      const vis = this.visuals.get(p.id);
      if (!vis) continue;
      vis.draw = {
        x: lerp(vis.prev.x, vis.cur.x, a),
        y: lerp(vis.prev.y, vis.cur.y, a),
        z: lerp(vis.prev.z, vis.cur.z, a),
        yaw: lerpAngle(vis.prev.yaw, vis.cur.yaw, a)
      };
      vis.v.update(dt, {
        speed: p.remote ? (p.__spd || 0) : p.speed,
        grounded: p.grounded, vy: p.vy, yaw: p.yaw,
        stunned: p.stunned
      });
    }

    /* ④ カメラ。観戦中は **見ている 人**を 追う。 */
    this._spectateTick();
    const camP = this.spectate
      ? (this.sim.players.filter((q) => q.id === this.spectate.id)[0] || this.local)
      : this.local;
    const meV = this.visuals.get(camP.id);
    const target = meV && meV.draw ? meV.draw : camP;
    this.cam.update(dt, [target.x, target.y, target.z], camP.speed, sz.w / Math.max(1, sz.h));

    /* ⑤ 描く */
    const R = this.renderer;
    R.shadowCenter[0] = target.x; R.shadowCenter[1] = target.y; R.shadowCenter[2] = target.z;
    /* 走っている 間の 土ぼこり（自分と、近くの 人だけ） */
    if (this.fx && this.sim.phase === PHASE.RUNNING) {
      this._dustAcc += dt;
      if (this._dustAcc > 0.055) {
        this._dustAcc = 0;
        for (const p of this.sim.players) {
          if (!p.grounded || p.speed < 3.2) continue;
          const vis = this.visuals.get(p.id);
          const d = vis && vis.draw ? vis.draw : p;
          if (Math.hypot(d.x - this.cam.pos[0], d.z - this.cam.pos[2]) > 34) continue;
          const sp = p.speed / TUNE.maxSpeed;
          /* ★ 大きすぎると 緑の 泡が 浮いている ように 見える（実写で 確認）。
             走っている 本人の 足元だけ、小さめに。 */
          this.fx.dust(d.x, d.y, d.z, p.vx / (p.speed || 1), p.vz / (p.speed || 1),
            sp * (this.settings.particles || 1) * 0.7, this.course.palette.floorAlt);
        }
      }
      this.fx.update(dt);
    } else if (this.fx) this.fx.update(dt);

    R.begin(this.cam);
    this.course.draw(R, this.sim.time);
    for (const p of this.sim.players) {
      const vis = this.visuals.get(p.id);
      if (!vis || !vis.draw) continue;
      /* ★ チーム戦では 足元に 組の 色の 輪を 置く。
         走る人の 色は 好きに 選べる ままに したい ので、
         組は **別の 印**で 示す。 */
      if (p.team >= 0 && TEAMS[p.team]) {
        const c = TEAMS[p.team].rgb;
        m4.compose(this._mat, vis.draw.x, vis.draw.y + 0.05, vis.draw.z, this.sim.time * 0.9, 1.5, 0.5, 1.5);
        R.draw(M.ring, this._mat, [c[0], c[1], c[2], 0.85], 0.45, 0.3, 0, 0, 1.5);
      }
      vis.v.draw(R, vis.draw.x, vis.draw.y, vis.draw.z, vis.draw.yaw, 1);
    }
    /* ゴースト。**当たらない・押さない・止めない**。ただの 見た目。 */
    if (this.ghost && this.ghostVis && !this.ghost.done && this.sim.phase === PHASE.RUNNING) {
      const g = this.ghost;
      this.ghostVis.draw(R, g.x, g.y, g.z, g.yaw, 0.98);
    }
    if (this.fx) this.fx.draw(R, { ball: M.dot, slab: M.slab, ring: M.ring });
    R.end(dt);

    /* ⑥ 画面の もの */
    this.quiz.tick(dt);
    this.hud.update(this._hudState());
    this._drawPlates(sz);
    this._countdown();
  }

  /** 通信の 相手の 位置を 反映する（補間ずみ） */
  _applyRemote() {
    if (!this.net) return;
    for (const p of this.sim.players) {
      if (!p.remote) continue;
      const s = this.net.sample(p.id, this._rbuf || (this._rbuf = {}));
      if (!s) continue;
      p.x = s.x; p.y = s.y; p.z = s.z; p.yaw = s.yaw;
      p.grounded = !!s.g; p.stunned = s.st ? 0.2 : 0;
      p.progress = s.pr; p.checkpoint = s.cp;
      p.rank = s.rank || p.rank;
      if (s.fin && !p.finished) { p.finished = true; }
      /* 速さは 見た目の 足の 動きに 使うので おおよそで 出す */
      const d = this._lastRemote && this._lastRemote[p.id];
      if (d) p.__spd = Math.hypot(s.x - d.x, s.z - d.z) * 60;
      if (!this._lastRemote) this._lastRemote = {};
      this._lastRemote[p.id] = { x: s.x, z: s.z };
    }
  }

  _collectInputs() {
    this.inputs.clear();
    if (!this.local.finished && this.sim.phase === PHASE.RUNNING) {
      this.inputs.set(this.local.id, this.input.build(this.cam, this._inpBuf || (this._inpBuf = {})));
    } else {
      this.inputs.set(this.local.id, { mx: 0, mz: 0, jump: false, jumpDown: false, dive: false });
    }
    for (const b of this.bots) {
      this.inputs.set(b.p.id, this.sim.phase === PHASE.RUNNING
        ? b.decide(this.sim.time) : { mx: 0, mz: 0 });
      /* ★ どうしても 抜けられない 相手は 中間地点へ 戻す。
         同じ 所で 止まったままの 相手が いると「壊れている」ように 見える。
         人には しない（自分で 何とかする ほうが 面白い）。 */
      if (b.hopeless && !b.p.finished) {
        b.p.respawnAt(this.course.respawnPoint(b.p.checkpoint, b.p.slot || 0));
        b.noProgress = 0; b.hopeless = false; b.stuck = 0; b.lastProgress = -1;
      }
    }
    if (this.net && this.net.applyRemoteInputs) this.net.applyRemoteInputs(this.inputs, this.sim);
  }

  _savePrev() {
    for (const p of this.sim.players) {
      const vis = this.visuals.get(p.id);
      if (!vis) continue;
      vis.prev.x = vis.cur.x; vis.prev.y = vis.cur.y; vis.prev.z = vis.cur.z; vis.prev.yaw = vis.cur.yaw;
    }
  }
  _syncVisual(both) {
    for (const p of this.sim.players) {
      const vis = this.visuals.get(p.id);
      if (!vis) continue;
      vis.cur.x = p.x; vis.cur.y = p.y; vis.cur.z = p.z; vis.cur.yaw = p.yaw;
      if (both) { vis.prev.x = p.x; vis.prev.y = p.y; vis.prev.z = p.z; vis.prev.yaw = p.yaw; }
      if (!vis.draw) vis.draw = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    }
  }

  _onEvents(evs) {
    for (const e of evs) {
      if (e.t === "go") this.hud.big("GO!", "go");
      else if (e.t === "gate-ask" && e.p === this.local) this._openQuiz(e.gate);
      else if (e.t === "checkpoint" && e.p === this.local) {
        /* 区間の 記録。**通った 順に 1 回だけ** 入れる（戻されて 通り直しても 増やさない）。 */
        if (!this._splits) this._splits = [];
        if (this._splits.length < e.index) this._splits.push(Math.round(this.sim.raceTime * 100) / 100);
        /* 自己ベストの 区間と くらべて その場で 出す（あとで 結果でも 出す） */
        const 差 = this._splitDiff(this._splits.length - 1);
        /* ★ 速く なった ときだけ 「よい」色。遅い ときに 緑を 出すと 嘘に なる。 */
        this.hud.toast("中間地点 " + e.index + (差 ? "　" + 差 : ""),
          !差 || 差[0] === "-" ? "good" : "bad");
        if (this.fx) this.fx.confetti(e.p.x, e.p.y, e.p.z, 16, [this.course.palette.spring, this.course.palette.gold]);
      }
      else if (e.t === "respawn" && e.p === this.local) {
        this.hud.toast(e.lives !== undefined ? ("戻されました（残り " + e.lives + ")") : "戻されました", "bad");
        this.cam.hit(0.5);
      }
      else if (e.t === "hit") {
        if (e.p === this.local) this.cam.hit(clamp((e.power || 6) / 12, 0.3, 1));
        if (this.fx) this.fx.hit(e.p.x, e.p.y + 0.8, e.p.z, clamp((e.power || 6) / 9, 0.4, 1.4), this.course.palette.hot);
      }
      else if (e.t === "bounce" && this.fx) this.fx.boost(e.p.x, e.p.y, e.p.z, this.course.palette.spring);
      else if (e.t === "land" && this.fx) this.fx.land(e.p.x, e.p.y, e.p.z, e.power || 1, this.course.palette.floorAlt);
      else if (e.t === "respawn" && this.fx) this.fx.hit(e.p.x, e.p.y + 0.6, e.p.z, 0.7, this.course.palette.accent);
      else if (e.t === "finish") {
        if (e.p === this.local) {
          this.hud.big("ゴール!", "goal");
          /* ★ サーバへ 先に 知らせる。結果画面は そのあと 出す。
             （ここを else if に すると 結果画面が 出なくなる） */
          if (this.net) this.net.sendFinish();
          if (this.fx) {
            const P = this.course.palette;
            this.fx.confetti(e.p.x, e.p.y, e.p.z, 90, [P.gold, P.spring, P.accent, P.hot, [1, 1, 1]]);
          }
          this._finish();
        } else this.hud.toast(e.p.name + " が ゴール（" + e.rank + "位）");
      } else if (e.t === "eliminated") {
        /* サバイバル: 落ちたら 脱落。
           ★ **すぐ 結果を 出さない。** 出すと 誰が 勝ったのか 分からないまま
             終わって しまう（落ちた 瞬間に 幕が 下りる）。
             まだ 走っている 人が いれば 観戦に 入る。 */
        if (e.p === this.local) { this.hud.big("脱落…", "goal"); this._eliminatedSelf(); }
        else this.hud.toast(e.p.name + " が 脱落（残り " + e.left + " 人）", "bad");
        if (this.fx) this.fx.hit(e.p.x, e.p.y + 0.8, e.p.z, 1.2, this.course.palette.danger);
      } else if (e.t === "lastone") {
        if (e.p === this.local) this.hud.big("生き残った!", "goal");
        this._finish();
      } else if (e.t === "timeup") this._finish();
      else if (e.t === "allfinished") this._finish();
      if (this.app && this.app.audio) this.app.audio.onEvent(e, this.local);
    }
  }

  /* ── クイズ ─────────────────────────────────────────────────────── */
  _openQuiz(gate) {
    if (this.quiz.open) return;
    this.pendingGate = gate;
    const q = this.questions[this.qIndex % Math.max(1, this.questions.length)] || null;
    this.qIndex++;
    if (!q) { this.sim.answerGate(this.local, gate, true); return; }
    this._lastQ = q;
    this.quiz.ask(q, gate.limit);
  }
  _answer(i, correct) {
    const g = this.pendingGate;
    this.pendingGate = null;
    if (!g) return;
    /* ★ 対戦中は **正誤を サーバが 決める**。
       画面の 判定を そのまま 使うと、答えを 書き換えれば 全問 正解に できる。
       ただし 幕は すぐ 開ける（返事を 待つと 走りが 止まる）。
       あとで 食い違ったら サーバの 返事で 直す。 */
    this.sim.answerGate(this.local, g, i < 0 ? null : correct);
    if (this.net) this.net.sendAnswer(g.index, i);
    /* ★ **間違えた 単語を 覚えておく。**
       走り終わって「3 問 間違えた」と 数だけ 出しても、
       何を 間違えたのか 分からないと 学びに ならない。
       ここは 学ぶ ための 遊びなので、単語まで 出す。 */
    if (!correct && this._lastQ) {
      const q = this._lastQ;
      if (!this._missed) this._missed = [];
      if (!this._missed.some((x) => x.q === q.prompt)) {
        this._missed.push({
          q: String(q.prompt || ""),
          a: String((q.choices && q.choices[q.answer]) || ""),
          /* 何を えらんだか。時間切れ（-1）は 空。 */
          y: i >= 0 && q.choices ? String(q.choices[i] || "") : ""
        });
      }
    }
    this.hud.toast(correct ? "正解！ 少し 速くなる" : "不正解… 少し 遅くなる", correct ? "good" : "bad");
  }

  /** サーバの 答え合わせ。食い違ったら 直す。 */
  _netGate(m) {
    if (!m || m.g === undefined) return;
    if (m.id && m.id !== (this.net && this.net.you)) return;   /* ほかの 人の 分 */
    const g = this.course.gates[m.g];
    if (!g) return;
    const st = this.sim.gateStateOf(this.local, g);
    if (!st) return;
    const 実際 = !!m.c;
    if (st.correct === 実際) return;
    /* 直す */
    st.correct = 実際;
    if (実際) { this.local.quizCorrect++; this.local.quizWrong = Math.max(0, this.local.quizWrong - 1); this.local.boost = 3.0; this.local.penalty = 0; }
    else { this.local.quizWrong++; this.local.quizCorrect = Math.max(0, this.local.quizCorrect - 1); this.local.penalty = 2.6; this.local.boost = 0; }
    this.hud.toast(実際 ? "サーバの 判定: 正解" : "サーバの 判定: 不正解", 実際 ? "good" : "bad");
  }

  /** サーバから 「その 位置は あり得ない」と 言われた */
  _netFix(m) {
    if (!m) return;
    const p = this.local;
    p.x = m.x; p.y = m.y; p.z = m.z;
    p.vx = p.vy = p.vz = 0;
    p.progress = m.pr;
    this._syncVisual(true);
    this.hud.toast("位置を 直しました", "bad");
  }

  /* ── 合図 ───────────────────────────────────────────────────────── */
  _countdown() {
    if (this.sim.phase !== PHASE.COUNTDOWN) return;
    const c = Math.ceil(this.sim.countdown - 0.2);
    if (c !== this._lastCount && c >= 1 && c <= 3) {
      this._lastCount = c;
      this.hud.big(String(c), "count");
      if (this.app && this.app.audio) this.app.audio.beep(c);
    }
  }

  /* ── 名札 ───────────────────────────────────────────────────────── */
  _drawPlates(sz) {
    const vp = this.cam.viewProj;
    const rect = { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
    for (const p of this.sim.players) {
      let el = this._plateEls.get(p.id);
      const vis = this.visuals.get(p.id);
      if (!vis || !vis.draw) continue;
      if (p === this.local) { if (el) el.style.display = "none"; continue; }
      if (!el) {
        el = h("div", { class: "vs-plate" },
          h("i", { class: "vs-plate-dot" }), h("span", { class: "vs-plate-nm", text: p.name }));
        el.querySelector(".vs-plate-dot").style.background = beanByIndex(p.colorIndex).hex;
        this.plates.appendChild(el);
        this._plateEls.set(p.id, el);
      }
      /* 世界 → 画面 */
      const x = vis.draw.x, y = vis.draw.y + BEAN_HEIGHT + 0.35, z = vis.draw.z;
      const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (w <= 0.05) { el.style.display = "none"; continue; }
      const sx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
      const sy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
      if (sx < -1.3 || sx > 1.3 || sy < -1.3 || sy > 1.3) { el.style.display = "none"; continue; }
      const px = (sx * 0.5 + 0.5) * rect.w;
      const py = (1 - (sy * 0.5 + 0.5)) * rect.h;
      const d = Math.hypot(x - this.cam.pos[0], y - this.cam.pos[1], z - this.cam.pos[2]);
      el.style.display = "";
      el.style.transform = "translate(-50%,-100%) translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px)";
      el.style.opacity = String(clamp(1.25 - d / 70, 0.15, 1));
    }
  }

  _ghostOn() {
    try { return localStorage.getItem(GHOST_KEY) !== "0"; } catch (e) { return true; }
  }

  /* ── 区間の 記録 ─────────────────────────────────────────────────
     ★ 自己ベストの 区間は **手元にも 置く**。
       通信が 遅い ときに 「差」が 出ない のは、遊びの 手応えを 一番 損なう。 */
  _bestSplits() {
    try {
      const v = JSON.parse(localStorage.getItem(SPLIT_KEY + ":" + this.course.id) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  _splitDiff(i) {
    const b = this._bestSplits();
    if (!(b.length > i) || !this._splits || this._splits.length <= i) return "";
    const d = this._splits[i] - b[i];
    if (Math.abs(d) < 0.01) return "±0.0";
    return (d < 0 ? "-" : "+") + Math.abs(d).toFixed(1);
  }

  /* ── 結果 ───────────────────────────────────────────────────────── */
  _hudState() {
    const s = this.sim;
    const rows = s.standings().map((r) => Object.assign({}, r, { me: r.id === this.local.id }));
    return {
      time: s.phase === PHASE.COUNTDOWN ? 0 : s.raceTime,
      /* ゴーストが 居て、まだ 走って いる ときだけ 差を 出す */
      ghost: (this.ghost && !this.ghost.done && this._ghostDelta !== null) ? this._ghostDelta : null,
      teams: s.mode === MODE.TEAM ? s.teamScores() : null,
      rank: this.local.rank, total: s.players.length,
      checkpoint: this.local.checkpoint, checkpoints: this.course.checkpoints.length,
      pct: this.course.length > 0 ? clamp(this.local.progress / this.course.length, 0, 1) : 0,
      standings: rows
    };
  }

  /* ── 観戦 ────────────────────────────────────────────────────────
     脱落した あと、まだ 走っている 人を 見る。
     ★ 記録は **落ちた その 場で** 残す（見ている 途中で 抜けても 消えない）。 */
  _eliminatedSelf() {
    this._saveSelf();
    const 残り = this.sim.players.filter((q) => !q.finished && q !== this.local);
    if (!残り.length) { this._finish(); return; }
    this.spectate = { id: 残り[0].id };
    this.hud.spectate(残り[0].name, (d) => this._spectateStep(d), () => this._finish());
  }
  _spectateAlive() {
    return this.sim.players.filter((q) => !q.finished && q !== this.local);
  }
  _spectateStep(d) {
    const list = this._spectateAlive();
    if (!list.length) { this._finish(); return; }
    let i = list.findIndex((q) => q.id === (this.spectate && this.spectate.id));
    if (i < 0) i = 0;
    i = (i + (d > 0 ? 1 : -1) + list.length) % list.length;
    this.spectate = { id: list[i].id };
    this.hud.spectate(list[i].name, null, null);
  }
  /** 見ている 人が 居なく なったら 結果へ。毎コマ 呼ぶ。 */
  _spectateTick() {
    if (!this.spectate) return;
    const list = this._spectateAlive();
    if (!list.length) { this._finish(); return; }
    if (!list.some((q) => q.id === this.spectate.id)) {
      this.spectate = { id: list[0].id };
      this.hud.spectate(list[0].name, null, null);
    }
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    const p = this.local;
    /* 記録は もう 残して いる ことが ある（脱落した その 場で 残す）。
       _saveSelf は 2 回目 以降 何も しない。 */
    this._saveSelf();
    this.spectate = null;
    if (this.hud.spectateOff) this.hud.spectateOff();
    const rows = this.sim.standings().map((r) => Object.assign({}, r, { me: r.id === this.local.id }));
    if (this.app && this.app.audio) {
      try { this.app.audio.stopMusic(); this.app.audio.results(p.rank === 1); } catch (e) {}
    }
    setTimeout(() => {
      this.result.show({
        rank: p.rank, total: this.sim.players.length, finished: p.finished,
        time: p.finishTime, correct: p.quizCorrect, wrong: p.quizWrong,
        respawns: p.respawns, xp: this._xp || 0,
        best: this._newBest ? p.finishTime : (this._prevBest || 0), newBest: !!this._newBest,
        eliminated: !!p.eliminated, mode: this.sim.mode,
        teams: this.sim.mode === MODE.TEAM ? this.sim.teamScores() : null,
        myTeam: p.team,
        standings: rows, courseName: this.course.name,
        splits: (this._splits || []).slice(),
        bestSplits: this._prevSplits || [],
        missed: (this._missed || []).slice(0, 12),
        cup: this._cupResult(rows)
      });
      if (this.net && this.net.sendResult) {
        this.net.sendResult({ finished: p.finished, time: p.finishTime, rank: p.rank, xp: this._xp || 0 });
      }
    }, p.finished ? 1400 : 500);
  }

  /* ── 勝ち抜き ────────────────────────────────────────────────────
     1 本 終わるたびに 「誰が 残るか」を ここで 決める。
     ★ **順位が そのまま 残る 順**。進みや タイムで 別の 並びを 作らない
       （画面に 出ている 順位と 違うと 「なぜ 落ちたか」が 分からなく なる）。 */
  _cupResult(rows) {
    const c = this.cup;
    if (!c) return null;
    const 全 = rows.length;
    const 残す = cupKeep(全, c.round, c.rounds);
    const 並び = rows.slice().sort((a, b) => a.rank - b.rank);
    const 残る = 並び.slice(0, 残す);
    const 落ちる = 並び.slice(残す);
    const 私 = 並び.filter((r) => r.me)[0] || null;
    const 私は残る = !!(私 && 残る.some((r) => r.me));
    const 最終 = c.round >= c.rounds || 残す <= 1;

    /* 次の 本の 顔ぶれ（ボットの 素性は そのまま 連れて いく） */
    const bots = [];
    for (const r of 残る) {
      if (r.me) continue;
      const b = this.bots.filter((x) => x.p.id === r.id)[0];
      const p = this.sim.players.filter((x) => x.id === r.id)[0];
      if (!p) continue;
      bots.push({
        id: p.id, name: p.name, colorIndex: p.colorIndex, hat: p.hat, hatColor: p.hatColor,
        level: b ? b.levelKey : "normal", seed: b ? b.seed : 7000
      });
    }
    return {
      round: c.round, rounds: c.rounds, keep: 残す, total: 全,
      survivors: 残る.map((r) => ({ id: r.id, name: r.name, colorIndex: r.colorIndex, rank: r.rank })),
      out: 落ちる.map((r) => ({ id: r.id, name: r.name, colorIndex: r.colorIndex, rank: r.rank })),
      meAlive: 私は残る, last: 最終,
      /* 次の 本を 始める ための 一式（結果の 画面から そのまま 渡す） */
      next: (私は残る && !最終) ? {
        courseId: c.courses[c.round] || c.courses[c.courses.length - 1],
        mode: MODE.CUP,
        bots: bots.length,
        myName: this.cfg.myName, myColor: this.cfg.myColor,
        myHat: this.cfg.myHat, myHatColor: this.cfg.myHatColor,
        presetKind: this.cfg.presetKind, presetId: this.cfg.presetId, presetOwner: this.cfg.presetOwner,
        seed: (this.cfg.seed || 1) + c.round * 977,
        cup: { round: c.round + 1, rounds: c.rounds, courses: c.courses, bots }
      } : null
    };
  }

  /** 自分の 記録（自己ベスト・区間・ゴースト・サーバ）。**1 回だけ**。 */
  _saveSelf() {
    if (this._saved) return;
    this._saved = true;
    const p = this.local;
    const key = BEST_KEY + ":" + this.course.id;
    let best = 0;
    try { best = Number(localStorage.getItem(key) || 0) || 0; } catch (e) {}
    const newBest = p.finished && !p.eliminated && (!best || p.finishTime < best);
    /* ★ **上書きする 前に** 前の 区間を 取っておく。
       あとで 読むと 「いま 出した 走り」と 比べる ことに なって 差が 全部 0 に なる。 */
    this._prevSplits = this._bestSplits();
    if (newBest) {
      try {
        localStorage.setItem(key, String(p.finishTime));
        if (this._splits && this._splits.length) {
          localStorage.setItem(SPLIT_KEY + ":" + this.course.id, JSON.stringify(this._splits));
        }
        if (!this.online && this.ghostRec.length >= 4) {
          saveGhost(this.course.id, this.ghostRec.a.slice(), p.finishTime * 1000).catch(() => {});
        }
      } catch (e) {}
    }
    this._newBest = newBest;
    this._prevBest = best;
    const acc = (p.quizCorrect + p.quizWrong) > 0 ? p.quizCorrect / (p.quizCorrect + p.quizWrong) : 0;
    this._xp = Math.round(
      (p.finished && !p.eliminated ? 120 : 40) +
      Math.max(0, 8 - p.rank) * 24 + p.quizCorrect * 18 +
      Math.round(acc * 60) + this.course.difficulty * 12
    );
    this._saveStats({ courseId: this.course.id, rank: p.rank, time: p.finishTime,
      finished: p.finished && !p.eliminated, correct: p.quizCorrect, wrong: p.quizWrong, xp: this._xp,
      splits: (this._splits || []).slice(0, 16) });
  }

  _saveStats(row) {
    /* サーバへ。落ちても 遊びは 続く。 */
    try {
      const base = (window.VQ_API_BASE || "").replace(/\/+$/, "");
      const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken() || "") : "";
      if (!tk) return;
      fetch(base + "/api/survive/result", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify(row), keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  /** ★ 走っている 途中で ✕ を 押しても すぐ 抜けない。
      間違えて 押すと それまでの 走りが 全部 消える。 */
  _confirmQuit() {
    if (this.sim.phase === PHASE.FINISHED || !this.running) { this.onQuit(); return; }
    if (this._quitAsk) { this._quitClose(); this.onQuit(); return; }
    const box = h("div", { class: "vs-quit", role: "dialog", "aria-label": "やめますか" },
      h("div", { class: "vs-quit-card" },
        h("p", { class: "vs-quit-t", text: "この 試合を やめますか？" }),
        h("p", { class: "vs-quit-s", text: "ここまでの 走りは 記録されません。" }),
        h("div", { class: "vs-quit-btns" },
          h("button", { class: "vs-btn is-ghost", type: "button", onclick: () => this._quitClose() }, "つづける"),
          h("button", { class: "vs-btn", type: "button", onclick: () => { this._quitClose(); this.onQuit(); } }, "やめる"))));
    this._quitAsk = box;
    this.el.appendChild(box);
    /* 逃げ道: Esc でも 閉じる */
    this._quitKey = (e) => { if (e.key === "Escape") this._quitClose(); };
    window.addEventListener("keydown", this._quitKey, true);
  }
  _quitClose() {
    if (this._quitKey) { try { window.removeEventListener("keydown", this._quitKey, true); } catch (e) {} this._quitKey = null; }
    if (this._quitAsk) { try { this._quitAsk.remove(); } catch (e) {} this._quitAsk = null; }
  }

  _fatal(msg) {
    this.el.appendChild(h("div", { class: "vs-fatal" },
      h("p", { text: "この端末では 3D を 出せませんでした" }),
      h("p", { class: "vs-sub", text: msg }),
      h("button", { class: "vs-btn is-ghost", type: "button", onclick: () => this.onQuit() }, "ロビーへ")));
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ボットの かぶりもの。ばらけさせる ため 順に 配る。 */
const BOT_HATS = ["cap", "horn", "antenna", "ribbon", "party", "crown", "phones", "leafhat"];
const BOT_NAMES = ["ミント", "コーラル", "サン", "グレープ", "アクア", "ピーチ", "ベリー"];
function pickBotLevel(difficulty, i) {
  const d = difficulty || 1;
  if (d <= 2) return ["easy", "easy", "normal"][i % 3];
  if (d <= 5) return ["easy", "normal", "normal", "hard"][i % 4];
  if (d <= 8) return ["normal", "hard", "hard", "normal"][i % 4];
  return ["hard", "hard", "perfect", "hard"][i % 4];
}

export const MATCH_CSS = TOUCH_CSS + HUD_CSS + QUIZ_CSS + RESULT_CSS + `
.vs-match{ position:absolute; inset:0; overflow:hidden; background:#06081a; }
.vs-plates{ position:absolute; inset:0; pointer-events:none; z-index:5; }
.vs-plate{
  position:absolute; left:0; top:0; will-change:transform;
  display:flex; align-items:center; gap:5px; padding:2px 8px 3px;
  border-radius:999px; background:rgba(8,11,28,.62); border:1px solid rgba(255,255,255,.16);
  font-size:11px; font-weight:700; white-space:nowrap; color:#fff;
  text-shadow:0 1px 4px rgba(0,0,0,.8);
}
.vs-plate-dot{ width:7px; height:7px; border-radius:50%; }
.vs-pause{
  position:absolute; z-index:8;
  right:calc(14px + var(--vs-safe-r)); bottom:calc(14px + var(--vs-safe-b));
  width:38px; height:38px; border-radius:12px;
  background:rgba(8,11,28,.6); border:1px solid rgba(255,255,255,.16);
  color:rgba(243,245,255,.8); font-size:15px; line-height:1;
}
.vs-pause:hover{ background:rgba(8,11,28,.82); }
/* 指の 操作盤が 出ている ときは **上の 真ん中**へ 置く。
   ★ 左下は 棒（押した 場所に 出る）、右下は 跳ぶ ボタン、
     左上は 時計と コース名、右上は 順位と 一覧。
     空いているのは 上の 真ん中だけ。
     （左上・右上の どちらへ 逃がしても 重なった。390px の 実機写真で 確認） */
.vs-touch[data-on="1"] ~ .vs-pause{
  left:50%; transform:translateX(-50%);
  right:auto; bottom:auto; top:calc(10px + var(--vs-safe-t));
  width:34px; height:34px; border-radius:11px;
}
.vs-quit{ position:absolute; inset:0; z-index:10; display:flex; align-items:center; justify-content:center;
  background:rgba(6,8,22,.72); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
.vs-quit-card{ width:min(380px,90%); background:rgba(12,15,36,.96);
  border:1px solid rgba(255,255,255,.16); border-radius:18px; padding:20px; text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,.5); }
.vs-quit-t{ font-size:16px; font-weight:800; margin-bottom:6px; }
.vs-quit-s{ font-size:12px; color:rgba(243,245,255,.6); margin-bottom:16px; }
.vs-quit-btns{ display:flex; gap:9px; justify-content:center; }
.vs-fatal{
  position:absolute; inset:0; z-index:10; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:12px; text-align:center; padding:24px;
  background:rgba(6,8,22,.92);
}
`;
