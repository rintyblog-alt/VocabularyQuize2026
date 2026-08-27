/**
 * QuizRoom.js — Room creation, joining, waiting room for quiz mode
 * Reuses LobbyUI since it shares the same flow
 */

export class QuizRoom {
  constructor() {
    this.roomId = null;
    this.isHost = false;
    this.players = [];
    this._callbacks = {};
  }

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }
  _emit(event, data) {
    for (const fn of (this._callbacks[event] || [])) fn(data);
  }

  /**
   * Handle snapshot from server — update player list
   */
  handleSnapshot(snapshot) {
    if (snapshot.players) {
      this.players = Array.isArray(snapshot.players) ? snapshot.players : Object.values(snapshot.players);
      this._emit("playersUpdated", this.players);
    }
    if (snapshot.room) {
      this.roomId = snapshot.room.roomId || this.roomId;
    }
  }

  /**
   * Handle countdown message
   */
  handleCountdown(data) {
    this._emit("countdown", data);
  }

  dispose() {
    this._callbacks = {};
  }
}
