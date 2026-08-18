/**
 * QuizGame.js — Quiz game progression, timer, question display
 */
import { injectQuizStyles, createTimerSVG, updateTimerSVG } from "./QuizUI.js";
import { QuizScore } from "./QuizScore.js";

const TIME_LIMIT = 15;

export class QuizGame {
  constructor(container) {
    this.container = container;
    this.score = new QuizScore();
    this.root = null;
    this._timerInterval = null;
    this._timeRemaining = TIME_LIMIT;
    this._answered = false;
    this._selectedIndex = -1;
    this._callbacks = {};
    this._currentRound = 0;
    this._totalRounds = 0;
    this._timerSVG = null;
    this._timerCircumference = 0;
    injectQuizStyles();
  }

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }
  _emit(event, data) {
    for (const fn of (this._callbacks[event] || [])) fn(data);
  }

  init(players, localId) {
    this.score.setLocalId(localId);
    this.score.initPlayers(players);
  }

  /**
   * Show a question
   * @param {{ qid, text, choices, round, totalRounds }} data
   */
  showQuestion(data) {
    this._answered = false;
    this._selectedIndex = -1;
    this._currentRound = data.round || 0;
    this._totalRounds = data.totalRounds || 10;
    this._timeRemaining = TIME_LIMIT;
    this.score.resetAnswered();

    this._buildGameUI(data);
    this._startTimer();
  }

  _buildGameUI(data) {
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.className = "sv3q-root";
      this.container.appendChild(this.root);
    }

    const timer = createTimerSVG(60);
    this._timerSVG = timer.svg;
    this._timerCircumference = timer.circumference;

    this.root.innerHTML = "";
    this.root.style.display = "flex";

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 16px", flexShrink: "0"
    });
    header.innerHTML = `<div style="font-size:14px;font-weight:600;">問題 ${this._currentRound}/${this._totalRounds}</div>`;
    const timerWrap = document.createElement("div");
    timerWrap.appendChild(timer.svg);
    header.appendChild(timerWrap);
    this.root.appendChild(header);

    // Body (question + sidebar)
    const body = document.createElement("div");
    body.className = "sv3q-game-layout";
    Object.assign(body.style, {
      display: "flex", flex: "1", gap: "16px", padding: "0 16px 16px", overflow: "hidden"
    });

    // Main area
    const main = document.createElement("div");
    Object.assign(main.style, { flex: "1", display: "flex", flexDirection: "column", justifyContent: "center" });

    const qText = document.createElement("div");
    Object.assign(qText.style, {
      fontSize: "18px", textAlign: "center", marginBottom: "24px",
      lineHeight: "1.6", padding: "0 8px"
    });
    qText.textContent = data.text || "";
    main.appendChild(qText);

    const choices = document.createElement("div");
    Object.assign(choices.style, {
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px",
      maxWidth: "480px", margin: "0 auto", width: "100%"
    });
    (data.choices || []).forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className = "sv3q-choice";
      btn.textContent = choice;
      btn.dataset.index = i;
      btn.addEventListener("click", () => this._selectAnswer(i));
      choices.appendChild(btn);
    });
    main.appendChild(choices);
    body.appendChild(main);

    // Sidebar — ranking
    const sidebar = document.createElement("div");
    sidebar.className = "sv3q-sidebar sv3q-card";
    Object.assign(sidebar.style, {
      width: "160px", padding: "12px", flexShrink: "0", overflowY: "auto"
    });
    sidebar.innerHTML = `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px;font-weight:600;">順位</div>`;
    const rankList = document.createElement("div");
    rankList.className = "sv3q-rank-list";
    sidebar.appendChild(rankList);
    body.appendChild(sidebar);
    this.root.appendChild(body);

    this._updateRankingUI();
  }

  _selectAnswer(index) {
    if (this._answered) return;
    this._answered = true;
    this._selectedIndex = index;
    this._stopTimer();

    // Highlight selected
    const buttons = this.root.querySelectorAll(".sv3q-choice");
    buttons.forEach(btn => btn.classList.add("sv3q-choice-disabled"));
    if (buttons[index]) {
      buttons[index].style.background = "rgba(92,75,232,0.6)";
      buttons[index].style.borderColor = "#7c6eef";
    }

    this._emit("answer", {
      choiceIndex: index,
      answeredAt: Date.now(),
      remainingTime: this._timeRemaining
    });
  }

  /**
   * Handle result from server
   */
  handleResult(result) {
    const correctIndex = result.correctIndex;
    const isCorrect = this._selectedIndex === correctIndex;

    // Score
    if (isCorrect) {
      this.score.recordResult(this.score.localId, true, this._timeRemaining);
    } else {
      this.score.recordResult(this.score.localId, false);
    }

    // Update other players' scores from result
    if (result.players) {
      for (const p of (Array.isArray(result.players) ? result.players : Object.values(result.players))) {
        const id = String(p.id || p.userId || "");
        if (id && id !== this.score.localId) {
          const entry = this.score.players.get(id);
          if (entry && p.score != null) entry.score = Number(p.score);
          if (entry && p.correct != null) entry.correct = Number(p.correct);
        }
      }
    }

    // Visual feedback
    const buttons = this.root?.querySelectorAll(".sv3q-choice") || [];
    buttons.forEach((btn, i) => {
      if (i === correctIndex) {
        btn.classList.add("sv3q-choice-correct");
      } else if (i === this._selectedIndex && !isCorrect) {
        btn.classList.add("sv3q-choice-wrong");
      }
    });

    this._updateRankingUI();
    this._emit("resultShown", { correct: isCorrect });
  }

  _startTimer() {
    this._stopTimer();
    this._timeRemaining = TIME_LIMIT;
    this._timerInterval = setInterval(() => {
      this._timeRemaining = Math.max(0, this._timeRemaining - 0.1);
      if (this._timerSVG) {
        updateTimerSVG(this._timerSVG, this._timeRemaining, TIME_LIMIT, this._timerCircumference);
      }
      if (this._timeRemaining <= 0) {
        this._stopTimer();
        if (!this._answered) {
          this._answered = true;
          this._selectedIndex = -1;
          this.score.recordResult(this.score.localId, false);
          this._emit("answer", { choiceIndex: -1, answeredAt: Date.now(), remainingTime: 0 });
        }
      }
    }, 100);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  _updateRankingUI() {
    const list = this.root?.querySelector(".sv3q-rank-list");
    if (!list) return;
    const ranking = this.score.getRanking();
    list.innerHTML = ranking.map((p, i) => `
      <div style="display:flex;align-items:center;gap:4px;padding:3px 0;font-size:12px;${p.isMe?"font-weight:700;color:#ffb400;":"color:rgba(255,255,255,0.8);"}transition:all 0.3s;">
        <span style="width:14px;">${i+1}.</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nick}</span>
        <span style="font-weight:600;">${p.score}</span>
      </div>
    `).join("");
  }

  hide() {
    this._stopTimer();
    if (this.root) this.root.style.display = "none";
  }

  dispose() {
    this._stopTimer();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this._callbacks = {};
  }
}
