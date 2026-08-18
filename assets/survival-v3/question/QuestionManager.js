/**
 * QuestionManager.js — Question display, selection, result effects
 */
import { QuestionUI } from "../ui/QuestionUI.js";

export class QuestionManager {
  constructor() {
    this.ui = null;
    this.currentQuestion = null;
    this._onAnswer = null;
    this._onResult = null;
    this._paused = false;
  }

  /**
   * @param {HTMLElement} container
   * @param {{ onPause, onResume }} callbacks
   */
  init(container, { onPause, onResume, onSendAnswer }) {
    this.ui = new QuestionUI(container);
    this._onPause = onPause;
    this._onResume = onResume;
    this._onSendAnswer = onSendAnswer;
  }

  /**
   * Show a question (triggered by obstacle collision or server)
   * @param {{ qid, text, choices, round, totalRounds }} data
   */
  showQuestion(data) {
    this.currentQuestion = data;
    this._paused = true;
    if (this._onPause) this._onPause();

    this.ui.show(data, (choiceIndex) => {
      // User selected an answer
      if (this._onSendAnswer) {
        this._onSendAnswer({
          type: "answer",
          choiceIndex,
          answeredAt: Date.now()
        });
      }
    });
  }

  /**
   * Handle result from server
   * @param {{ correct: boolean, correctIndex: number, score?: number }} result
   * @returns {{ correct: boolean }}
   */
  handleResult(result) {
    const correct = !!result.correct;

    this.ui.showResult(result.correctIndex, correct);

    // Auto-close after 0.6s
    setTimeout(() => {
      this.ui.hide();
      this._paused = false;
      this.currentQuestion = null;
      if (this._onResume) this._onResume(correct, result);
    }, 600);

    return { correct };
  }

  isPaused() {
    return this._paused;
  }

  dispose() {
    if (this.ui) this.ui.dispose();
  }
}
