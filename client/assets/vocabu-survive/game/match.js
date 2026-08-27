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
import { registerCourseMeshes } from "./meshes.js";
import { BeanVisual, registerBeanMeshes, BEAN_HEIGHT } from "./bean.js";
import { buildCourse } from "./course.js";
import { Player, FixedStepper, STEP, TUNE } from "./player.js";
import { Bot } from "./bot.js";
import { Sim, PHASE } from "./sim.js";
import { GATE_STATE } from "./gate.js";
import { Input } from "./input.js";
import { TouchPad, TOUCH_CSS } from "../ui/touch.js";
import { HUD, HUD_CSS } from "../ui/hud.js";
import { QuizPanel, QUIZ_CSS } from "../ui/quiz.js";
import { ResultPanel, RESULT_CSS } from "../ui/result.js";
import { COURSE_BY_ID, COURSES } from "../data/courses.js";
import { fetchQuestions, localQuestions } from "../data/questions.js";
import { settingsFor, measure } from "../boot/caps.js";

const BEST_KEY = "vq.survive.best.v1";

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
      onLobby: () => { this.result.hide(); this.onQuit(); },
      onExit: () => { this.result.hide(); this.app.backToQuiz(); }
    });
    this.pauseBtn = h("button", {
      class: "vs-pause", type: "button", "aria-label": "やめる",
      onclick: () => this._confirmQuit()
    }, "✕");

    this.el = h("div", { class: "vs-match" },
      this.canvas, this.plates, this.hud.el, this.touch.el,
      this.quiz.el, this.pauseBtn, this.result.el);

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
  }

  /* ── 出入り ─────────────────────────────────────────────────────── */
  async enter(cfg) {
    this.cfg = cfg = cfg || {};
    const courseId = cfg.courseId || "c01";
    const def = COURSE_BY_ID[courseId] || COURSES[0];

    if (!this.renderer) {
      try {
        this.renderer = new Renderer(this.canvas, this.settings);
        registerCourseMeshes(this.renderer);
        registerBeanMeshes(this.renderer);
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
    this.sim = new Sim(this.course, { timeLimit: cfg.timeLimit || 300, countdown: 3.2 });
    this.visuals.clear();
    this.bots.length = 0;
    const me = new Player({ id: "me", name: cfg.myName || "あなた", colorIndex: cfg.myColor || 0, isLocal: true });
    this.local = me;
    this.sim.add(me);
    this.sim.localId = me.id;

    const others = Array.isArray(cfg.players) ? cfg.players : [];
    const botCount = cfg.bots === undefined ? 3 : cfg.bots;
    this.net = cfg.net || null;
    this.online = !!this.net;
    for (const o of others) {
      /* 通信の 相手は こちらでは 動かさない（位置は 送られてくる） */
      const p = new Player({ id: o.id, name: o.name, colorIndex: o.colorIndex, remote: this.online });
      this.sim.add(p);
    }
    for (let i = 0; i < botCount; i++) {
      const ci = (i + 1 + (cfg.myColor || 0)) % BEAN_COLORS.length;
      const p = new Player({ id: "bot" + i, name: BOT_NAMES[i % BOT_NAMES.length], colorIndex: ci });
      this.sim.add(p);
      this.bots.push(new Bot(p, this.course, {
        level: cfg.botLevel || pickBotLevel(def.difficulty, i), seed: 7000 + i * 131
      }));
    }
    for (const p of this.sim.players) {
      this.visuals.set(p.id, {
        v: new BeanVisual(beanByIndex(p.colorIndex).rgb),
        prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }
      });
    }
    this.sim.start();
    this._syncVisual(true);

    /* カメラ */
    this.cam.raycast = (from, dir, max) => this.course.world.ray(from, dir, max);
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
    } else {
      this.questions = localQuestions(need, seed);
      fetchQuestions({
        count: need, presetId: cfg.presetId || "", seed, difficulty: def.difficulty
      }).then((qs) => {
        /* まだ 1 問も 出していない ときだけ 差し替える */
        if (this.qIndex === 0 && qs && qs.length >= need) this.questions = qs;
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

    this.running = true;
    this._acc = 0;
    this.stepper.acc = 0;
    this._lastCount = -1;
    this._done = false;
    return this;
  }

  exit() {
    try { if (typeof window.__vqSurviveImmersive === "function") window.__vqSurviveImmersive(false); } catch (e) {}
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
    const look = this.input.takeLook();
    if (look.dx || look.dy) this.cam.rotate(look.dx, look.dy);
    const z = this.input.takeZoom();
    if (z) this.cam.zoom(z);

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

    /* ④ カメラ */
    const meV = this.visuals.get(this.local.id);
    const target = meV && meV.draw ? meV.draw : this.local;
    this.cam.update(dt, [target.x, target.y, target.z], this.local.speed, sz.w / Math.max(1, sz.h));

    /* ⑤ 描く */
    const R = this.renderer;
    R.shadowCenter[0] = target.x; R.shadowCenter[1] = target.y; R.shadowCenter[2] = target.z;
    R.begin(this.cam);
    this.course.draw(R, this.sim.time);
    for (const p of this.sim.players) {
      const vis = this.visuals.get(p.id);
      if (!vis || !vis.draw) continue;
      vis.v.draw(R, vis.draw.x, vis.draw.y, vis.draw.z, vis.draw.yaw, 1);
    }
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
      else if (e.t === "checkpoint" && e.p === this.local) this.hud.toast("中間地点 " + e.index, "good");
      else if (e.t === "respawn" && e.p === this.local) { this.hud.toast("戻されました", "bad"); this.cam.hit(0.5); }
      else if (e.t === "hit" && e.p === this.local) this.cam.hit(clamp((e.power || 6) / 12, 0.3, 1));
      else if (e.t === "finish") {
        if (e.p === this.local) {
          this.hud.big("ゴール!", "goal");
          /* ★ サーバへ 先に 知らせる。結果画面は そのあと 出す。
             （ここを else if に すると 結果画面が 出なくなる） */
          if (this.net) this.net.sendFinish();
          this._finish();
        } else this.hud.toast(e.p.name + " が ゴール（" + e.rank + "位）");
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

  /* ── 結果 ───────────────────────────────────────────────────────── */
  _hudState() {
    const s = this.sim;
    const rows = s.standings().map((r) => Object.assign({}, r, { me: r.id === this.local.id }));
    return {
      time: s.phase === PHASE.COUNTDOWN ? 0 : s.raceTime,
      rank: this.local.rank, total: s.players.length,
      checkpoint: this.local.checkpoint, checkpoints: this.course.checkpoints.length,
      pct: this.course.length > 0 ? clamp(this.local.progress / this.course.length, 0, 1) : 0,
      standings: rows
    };
  }

  _finish() {
    if (this._done) return;
    this._done = true;
    const p = this.local;
    const key = BEST_KEY + ":" + this.course.id;
    let best = 0;
    try { best = Number(localStorage.getItem(key) || 0) || 0; } catch (e) {}
    const newBest = p.finished && (!best || p.finishTime < best);
    if (newBest) { try { localStorage.setItem(key, String(p.finishTime)); } catch (e) {} }
    const acc = (p.quizCorrect + p.quizWrong) > 0 ? p.quizCorrect / (p.quizCorrect + p.quizWrong) : 0;
    const xp = Math.round(
      (p.finished ? 120 : 40) +
      Math.max(0, 8 - p.rank) * 24 +
      p.quizCorrect * 18 +
      Math.round(acc * 60) +
      this.course.difficulty * 12
    );
    const rows = this.sim.standings().map((r) => Object.assign({}, r, { me: r.id === this.local.id }));
    setTimeout(() => {
      this.result.show({
        rank: p.rank, total: this.sim.players.length, finished: p.finished,
        time: p.finishTime, correct: p.quizCorrect, wrong: p.quizWrong,
        respawns: p.respawns, xp, best: newBest ? p.finishTime : best, newBest,
        standings: rows, courseName: this.course.name
      });
      if (this.net && this.net.sendResult) {
        this.net.sendResult({ finished: p.finished, time: p.finishTime, rank: p.rank, xp });
      }
      this._saveStats({ courseId: this.course.id, rank: p.rank, time: p.finishTime,
        finished: p.finished, correct: p.quizCorrect, wrong: p.quizWrong, xp });
    }, p.finished ? 1400 : 500);
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

  _confirmQuit() {
    this.onQuit();
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
.vs-fatal{
  position:absolute; inset:0; z-index:10; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:12px; text-align:center; padding:24px;
  background:rgba(6,8,22,.92);
}
`;
