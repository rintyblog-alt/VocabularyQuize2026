/* ══════════════════════════════════════════════════════════════════════════
   試合の 中身（絵が 無くても 動く 部分）。

   ★ ここが **唯一の 正**。
     画面も、自動検査も、サーバの 検算も 全部 これを 通す。
     別々に 書くと 「検査は 通るのに 遊ぶと 詰む」が 必ず 起きる。

   することは 6 つ:
     ① 仕掛けを 進める
     ② 風を 当てる
     ③ 走る人を 1 歩 進める
     ④ 起きたこと（落ちた・触れた・門・中間地点・ゴール）を 拾う
     ⑤ 順位を 付ける
     ⑥ 制限時間を 見る
   ══════════════════════════════════════════════════════════════════════════ */
import { STEP, Player, TUNE } from "./player.js";
import { GATE_STATE } from "./gate.js";
import { testSolid } from "./physics.js";

export const PHASE = {
  COUNTDOWN: "countdown",
  RUNNING: "running",
  FINISHED: "finished"
};

/* 遊び方（要件 18）。**レースが 本命**。ほかは その 上に 足した もの。 */
export const MODE = {
  RACE: "race",             /* 先に ゴールした 人が 勝ち */
  TIMEATTACK: "timeattack", /* 1 人で 記録に 挑む（中身は レースと 同じ） */
  SURVIVAL: "survival",     /* 落ちたら 脱落。最後まで 残った 人が 勝ち */
  QUIZRUSH: "quizrush"      /* 制限時間内に 門を 多く 通った 人が 勝ち */
};

export class Sim {
  /**
   * @param {import("./course.js").Course} course
   * @param {{timeLimit?:number, countdown?:number}} opt
   */
  constructor(course, opt) {
    opt = opt || {};
    this.course = course;
    this.players = [];
    this.time = 0;                 /* 試合の 通し時間（秒）。仕掛けは これで 動く */
    this.raceTime = 0;             /* 合図の あとの 時間 */
    this.phase = PHASE.COUNTDOWN;
    this.countdown = opt.countdown === undefined ? 3.2 : opt.countdown;
    this.timeLimit = opt.timeLimit === undefined ? 300 : opt.timeLimit;
    this.mode = opt.mode || MODE.RACE;
    /* 脱落した 人（サバイバル）。id の 集まり。 */
    this.eliminated = new Set();
    /* ★ サバイバルの 残り。1 回で 終わりに すると **8 秒で 決着した**（実測）。
       3 回 落ちるまで 続ける。落ちるたび 中間地点へ 戻る。 */
    this.lives = opt.lives === undefined ? 3 : opt.lives;
    this.events = [];              /* 音・演出へ 渡す */
    this.finishOrder = [];
    this._near = [];
    this.localId = "";
    /* 門の ようす（人ごと）。鍵は playerId + "|" + gateIndex */
    this.gateState = new Map();
    this.onGateEnter = null;       /* (player, gate) → 出題を 頼む */
    this.autoGate = 0;             /* >0 … 検査用。この 秒で 勝手に 開く */
  }

  add(player) { this.players.push(player); return player; }

  start() {
    const C = this.course;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const sp = C.spawns[i % Math.max(1, C.spawns.length)] || { x: 0, y: 1, z: -3, yaw: 0 };
      p.reset({ x: sp.x, y: sp.y + 0.3, z: sp.z, yaw: 0 });
      p.slot = i;
      p.lives = this.mode === MODE.SURVIVAL ? this.lives : 0;
      p.eliminated = false;
    }
    this.time = 0; this.raceTime = 0;
    this.phase = PHASE.COUNTDOWN;
    this.finishOrder.length = 0;
    this.gateState.clear();
    return this;
  }

  gateKey(p, g) { return p.id + "|" + g.index; }
  gateStateOf(p, g) { return this.gateState.get(this.gateKey(p, g)) || null; }
  setGate(p, g, st) {
    this.gateState.set(this.gateKey(p, g), st);
    if (p.id === this.localId) g.state = st.state;
  }

  /**
   * 1 歩。**必ず STEP 秒ぶん。**
   * @param {Map<string,object>} inputs playerId → 入力
   */
  step(inputs) {
    this.events.length = 0;
    const C = this.course;

    if (this.phase === PHASE.COUNTDOWN) {
      this.time += STEP;
      this.countdown -= STEP;
      C.update(this.time);
      if (this.countdown <= 0) {
        this.phase = PHASE.RUNNING;
        this.events.push({ t: "go" });
      }
      return this.events;
    }
    if (this.phase === PHASE.FINISHED) return this.events;

    this.time += STEP;
    this.raceTime += STEP;

    /* ① 仕掛け */
    C.update(this.time);

    for (const p of this.players) {
      /* ★ 通信で 位置が 来る 人は ここでは 動かさない。
         こちらでも 動かすと、届いた 位置と ぶつかって 震える。 */
      if (p.remote) { p.progress = C.progressOf(p.x, p.z); continue; }
      if (p.finished) { p.step({ mx: 0, mz: 0 }, C.world); continue; }
      const inp = (inputs && inputs.get(p.id)) || { mx: 0, mz: 0 };

      /* ★ 門の 幕は **人ごとに 固さが 違う**（自分が 答えたか どうか）。
         World は 全員 共通なので、その 人が 動く 直前に 切り替える。
         これを 忘れると 「誰かが 答えたら 全員 通れる」に なる。 */
      this.applySolidityFor(p);

      /* ② 風 */
      const wind = C.windFor(p.x, p.y, p.z);
      if (wind.x || wind.z) {
        p.vx += wind.x * STEP;
        p.vz += wind.z * STEP;
      }

      /* ③ 1 歩 */
      const evs = p.step(inp, C.world);

      /* ④ 起きたこと */
      let respawn = false;
      for (const e of evs) {
        if (e.t === "fell" || e.t === "deadly") respawn = true;
        else if (e.t === "bounce") {
          this.events.push({ t: "bounce", p });
          const tr = e.solid && e.solid.owner;
          if (tr && tr.bump) tr.bump();
        } else if (e.t === "jump") this.events.push({ t: "jump", p });
        else if (e.t === "hit") this.events.push({ t: "hit", p, power: e.power });
        else if (e.t === "dive") this.events.push({ t: "dive", p });
      }

      /* 触れている ものを 見る（門・中間地点・ゴール・落ちる板） */
      this._scan(p);

      if (respawn) {
        if (this.mode === MODE.SURVIVAL && !p.finished) {
          p.lives = Math.max(0, (p.lives | 0) - 1);
          if (p.lives > 0) {
            /* まだ 残っている。中間地点へ 戻す。 */
            p.respawnAt(C.respawnPoint(p.checkpoint, p.slot || 0));
            this.events.push({ t: "respawn", p, lives: p.lives });
          } else {
            /* ★ 残り 0。**脱落**。早く 落ちるほど 下位。 */
            this.eliminated.add(p.id);
            p.finished = true;
            p.eliminated = true;
            p.finishTime = this.raceTime;
            const 残り = this.players.filter((q) => !q.finished).length;
            p.rank = 残り + 1;
            this.events.push({ t: "eliminated", p, left: 残り });
          }
        } else {
          const cp = C.respawnPoint(p.checkpoint, p.slot || 0);
          p.respawnAt(cp);
          this.events.push({ t: "respawn", p });
        }
      }

      p.progress = C.progressOf(p.x, p.z);
    }

    /* ⑤ 順位 */
    this._rank();

    /* ⑥ おしまいの 条件 */
    if (this.raceTime >= this.timeLimit) {
      this.phase = PHASE.FINISHED;
      this.events.push({ t: "timeup" });
    } else if (this.players.length && this.players.every((p) => p.finished)) {
      this.phase = PHASE.FINISHED;
      this.events.push({ t: "allfinished" });
    } else if (this.mode === MODE.SURVIVAL && this.players.length > 1
               && this.players.filter((p) => !p.finished).length <= 1) {
      /* 残り 1 人 に なったら 終わり。その 人が 1 位。 */
      const 勝 = this.players.find((p) => !p.finished);
      if (勝) { 勝.finished = true; 勝.rank = 1; 勝.finishTime = this.raceTime; }
      this.phase = PHASE.FINISHED;
      this.events.push({ t: "lastone", p: 勝 || null });
    }
    return this.events;
  }

  _scan(p) {
    const C = this.course;
    const w = C.world;
    w.near(p.x, p.z, TUNE.radius + 3.4, this._near);
    const cy = p.y + TUNE.radius + TUNE.half;
    for (const s of this._near) {
      if (!s.enabled) continue;
      const ob = s.owner;
      if (!ob) continue;

      if (ob.kind === "faller" && s === ob.s) {
        const hit = testSolid(s, p.x, cy, p.z, TUNE.radius, TUNE.half);
        if (hit && hit.ny > 0.5) ob.touched();
        continue;
      }
      if (s.tag === "checkpoint") {
        const hit = testSolid(s, p.x, cy, p.z, TUNE.radius, TUNE.half);
        if (hit && ob.index > p.checkpoint) {
          p.checkpoint = ob.index;
          ob.reached = true;
          this.events.push({ t: "checkpoint", p, index: ob.index });
        }
        continue;
      }
      if (s.tag === "finish") {
        const hit = testSolid(s, p.x, cy, p.z, TUNE.radius, TUNE.half);
        if (hit && !p.finished) {
          p.finished = true;
          p.finishTime = this.raceTime;
          this.finishOrder.push(p);
          p.rank = this.finishOrder.length;
          this.events.push({ t: "finish", p, rank: p.rank });
        }
        continue;
      }
      if (s.tag === "gatetrigger") {
        const hit = testSolid(s, p.x, cy, p.z, TUNE.radius, TUNE.half);
        if (!hit) continue;
        let st = this.gateStateOf(p, ob);
        if (!st) {
          st = { state: GATE_STATE.ASKING, at: this.raceTime, answered: false };
          this.gateState.set(this.gateKey(p, ob), st);
          if (p.id === this.localId) ob.state = GATE_STATE.ASKING;
          this.events.push({ t: "gate-ask", p, gate: ob });
          if (this.onGateEnter) { try { this.onGateEnter(p, ob); } catch (e) {} }
        }
        /* 検査用: 一定時間で 勝手に 開ける */
        if (this.autoGate > 0 && !st.answered && this.raceTime - st.at >= this.autoGate) {
          this.answerGate(p, ob, true);
        }
        /* 時間切れ */
        if (!st.answered && this.raceTime - st.at >= ob.limit) {
          this.answerGate(p, ob, null);
        }
        continue;
      }
      /* 門の 幕。自分の ぶんだけ 固い。 */
      if (s.tag === "gate") {
        const st = this.gateStateOf(p, ob);
        /* 幕の 固さは 「その 人が 答えたか」で 決まる。
           ただし World は 全員 共通なので、**自分の 番の 直前に** 切り替える。
           （下の applySolidityFor が 毎歩 呼ばれる） */
        continue;
      }
    }
  }

  /** その 人が 動く 前に、門の 幕を その 人の 状態へ 合わせる。 */
  applySolidityFor(p) {
    for (const g of this.course.gates) {
      const st = this.gateStateOf(p, g);
      const open = !!(st && st.answered);
      g.curtain.enabled = !open && g.open < 0.72;
    }
  }

  /**
   * 答えを 入れる。
   * @param {boolean|null} correct  true 正解 / false 不正解 / null 時間切れ
   */
  answerGate(p, g, correct) {
    const st = this.gateStateOf(p, g) || { at: this.raceTime };
    if (st.answered) return;
    st.answered = true;
    st.correct = correct;
    st.state = correct === true ? GATE_STATE.CORRECT
      : (correct === false ? GATE_STATE.WRONG : GATE_STATE.TIMEOUT);
    this.gateState.set(this.gateKey(p, g), st);
    p.gatePassed++;
    if (correct === true) { p.quizCorrect++; p.boost = 3.0; }
    else { p.quizWrong++; p.penalty = correct === null ? 3.4 : 2.6; }
    if (p.id === this.localId) g.resolve(st.state);
    this.events.push({ t: "gate-answer", p, gate: g, correct });
  }

  _rank() {
    if (this.mode === MODE.QUIZRUSH) {
      /* ★ クイズラッシュは **正解した 門の 数**が 先。同じなら 進んだ 距離。 */
      const rows = this.players.slice().sort((a, b) =>
        (b.quizCorrect - a.quizCorrect) || (b.progress - a.progress));
      for (let i = 0; i < rows.length; i++) rows[i].rank = i + 1;
      return;
    }
    const rest = this.players.filter((p) => !p.finished);
    rest.sort((a, b) => b.progress - a.progress);
    const base = this.finishOrder.length;
    for (let i = 0; i < rest.length; i++) rest[i].rank = base + i + 1;
  }

  /** 全員の 進み（画面の 順位表 用） */
  standings() {
    const rows = this.players.map((p) => ({
      id: p.id, name: p.name, colorIndex: p.colorIndex,
      rank: p.rank, progress: p.progress, finished: p.finished,
      finishTime: p.finishTime, checkpoint: p.checkpoint,
      correct: p.quizCorrect, wrong: p.quizWrong, respawns: p.respawns,
      eliminated: !!p.eliminated, lives: p.lives | 0,
      pct: this.course.length > 0 ? Math.min(1, p.progress / this.course.length) : 0
    }));
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }
}
