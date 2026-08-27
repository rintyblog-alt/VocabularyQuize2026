/**
 * GameState.js — State definitions for VocabuSurvival v3
 */
export const GamePhase = {
  LOBBY: "lobby",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  QUESTION: "question",
  RESULT: "result",
  GAMEOVER: "gameover"
};

export class GameState {
  constructor() {
    this.phase = GamePhase.LOBBY;
    this.mode = "3d"; // "3d" | "2d" | "quiz"
    this.roomId = null;
    this.playerId = null;
    this.score = 0;
    this.hp = 3;
    this.progress = 0;
    this.players = new Map();
    this.currentQuestion = null;
    this.roundLogs = [];
    this.countdownValue = 0;
  }

  reset() {
    this.phase = GamePhase.LOBBY;
    this.score = 0;
    this.hp = 3;
    this.progress = 0;
    this.players.clear();
    this.currentQuestion = null;
    this.roundLogs = [];
    this.countdownValue = 0;
  }
}
