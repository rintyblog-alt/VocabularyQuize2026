/**
 * QuizBattle.js — Entry point for 2D quiz battle mode
 */
import { QuizRoom } from "./QuizRoom.js";
import { QuizGame } from "./QuizGame.js";
import { QuizResult } from "./QuizResult.js";
import { injectQuizStyles } from "./QuizUI.js";

export class QuizBattle {
  constructor(container, { roomManager }) {
    this.container = container;
    this.room = new QuizRoom();
    this.game = null;
    this.result = null;
    this.roomManager = roomManager;
    this._localId = null;
    injectQuizStyles();
  }

  /**
   * Initialize quiz battle — bind to room manager events
   */
  init(localId) {
    this._localId = localId;

    this.roomManager.on("snapshot", (data) => {
      this.room.handleSnapshot(data);
    });

    this.roomManager.on("countdown", (data) => {
      this.room.handleCountdown(data);
    });

    this.roomManager.on("question", (data) => {
      if (!this.game) {
        this.game = new QuizGame(this.container);
        this.game.init(this.room.players, this._localId);
        this.game.on("answer", (payload) => {
          this.roomManager.sendAnswer(payload);
        });
      }
      this.game.showQuestion(data);
    });

    this.roomManager.on("result", (data) => {
      if (this.game) {
        this.game.handleResult(data);
      }
    });

    this.roomManager.on("final", (data) => {
      if (this.game) {
        this.game.hide();
        const ranking = this.game.score.getRanking();
        const myRank = this.game.score.getMyRank();
        this.result = new QuizResult(this.container);
        this.result.show({ ranking, myRank });
        this.result.on("rematch", () => {
          this.result.dispose();
          this.result = null;
          this.roomManager.sync.send({ type: "rematch" });
        });
        this.result.on("lobby", () => {
          this.dispose();
        });
      }
    });
  }

  dispose() {
    if (this.game) { this.game.dispose(); this.game = null; }
    if (this.result) { this.result.dispose(); this.result = null; }
    this.room.dispose();
  }
}
