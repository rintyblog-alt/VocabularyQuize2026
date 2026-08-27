/**
 * QuizResult.js — Final ranking display for quiz battle
 */
import { ResultUI } from "../ui/ResultUI.js";

export class QuizResult {
  constructor(container) {
    this.container = container;
    this.resultUI = new ResultUI(container);
  }

  /**
   * Show quiz result
   * @param {{ ranking, myRank }} data from QuizScore
   */
  show(data) {
    this.resultUI.show({
      ranking: data.ranking.map(p => ({
        nick: p.nick,
        score: p.score,
        correct: p.correct,
        total: p.total,
        isMe: p.isMe
      })),
      myRank: data.myRank,
      cleared: data.myRank === 1
    });
  }

  on(event, fn) {
    this.resultUI.on(event, fn);
  }

  dispose() {
    this.resultUI.dispose();
  }
}
