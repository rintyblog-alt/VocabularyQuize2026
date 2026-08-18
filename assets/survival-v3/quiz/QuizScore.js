/**
 * QuizScore.js — Score calculation & real-time ranking
 */

export class QuizScore {
  constructor() {
    /** @type {Map<string, { id, nick, score, correct, total, answered }>} */
    this.players = new Map();
    this.localId = null;
  }

  setLocalId(id) { this.localId = id; }

  initPlayers(playerList) {
    this.players.clear();
    for (const p of playerList) {
      const id = String(p.id || p.userId || "");
      this.players.set(id, {
        id,
        nick: p.nick || p.nickname || "Player",
        score: 0,
        correct: 0,
        total: 0,
        answered: false
      });
    }
  }

  /**
   * Calculate score for a correct answer
   * @param {number} remainingTime - seconds remaining out of 15
   */
  calculateScore(remainingTime) {
    return 100 + Math.floor((remainingTime / 15) * 50);
  }

  /**
   * Record an answer result
   */
  recordResult(playerId, correct, remainingTime = 0) {
    const entry = this.players.get(String(playerId));
    if (!entry) return 0;
    entry.total++;
    entry.answered = true;
    if (correct) {
      const pts = this.calculateScore(remainingTime);
      entry.score += pts;
      entry.correct++;
      return pts;
    }
    return 0;
  }

  /** Reset answered flag for new round */
  resetAnswered() {
    for (const p of this.players.values()) {
      p.answered = false;
    }
  }

  /**
   * Get sorted ranking
   */
  getRanking() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        ...p,
        rank: i + 1,
        isMe: p.id === this.localId
      }));
  }

  getLocal() {
    return this.localId ? this.players.get(this.localId) : null;
  }

  getMyRank() {
    const ranking = this.getRanking();
    const idx = ranking.findIndex(p => p.isMe);
    return idx >= 0 ? idx + 1 : ranking.length;
  }
}
