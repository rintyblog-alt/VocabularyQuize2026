/**
 * PlayerManager.js — Remote player state management
 */

export class PlayerManager {
  constructor() {
    /** @type {Map<string, { id, nick, score, hp, progress, state, x, y, z, rotY, connected, finished }>} */
    this.players = new Map();
    this.localId = null;
  }

  setLocalId(id) {
    this.localId = id;
  }

  /**
   * Full sync from server snapshot
   */
  syncAll(snapshot) {
    const players = snapshot?.players || snapshot;
    if (!players || typeof players !== "object") return;

    const incoming = Array.isArray(players) ? players : Object.values(players);
    const incomingIds = new Set();

    for (const p of incoming) {
      const id = String(p.id || p.playerId || p.userId || "");
      if (!id) continue;
      incomingIds.add(id);

      let entry = this.players.get(id);
      if (!entry) {
        entry = {
          id,
          nick: p.nick || p.nickname || p.displayName || "Player",
          score: 0,
          hp: 3,
          progress: 0,
          state: "idle",
          x: 0, y: 0, z: 0,
          rotY: 0,
          connected: true,
          finished: false
        };
        this.players.set(id, entry);
      }

      // Merge
      if (p.nick != null || p.nickname != null) entry.nick = p.nick || p.nickname || entry.nick;
      if (p.score != null) entry.score = Number(p.score);
      if (p.hp != null) entry.hp = Number(p.hp);
      if (p.progress != null) entry.progress = Number(p.progress);
      if (p.state != null) entry.state = p.state;
      if (p.connected != null) entry.connected = p.connected;
      if (p.finished != null) entry.finished = p.finished;

      const s = p.state3d || p;
      if (s.x != null) entry.x = Number(s.x);
      if (s.y != null) entry.y = Number(s.y);
      if (s.z != null) entry.z = Number(s.z);
      if (s.rotY != null) entry.rotY = Number(s.rotY);
    }

    // Remove disconnected players not in snapshot
    for (const [id] of this.players) {
      if (!incomingIds.has(id)) {
        this.players.get(id).connected = false;
      }
    }
  }

  /**
   * Update a single remote player position
   */
  updatePlayer(id, pos) {
    const entry = this.players.get(String(id));
    if (!entry) return;
    if (pos.x != null) entry.x = Number(pos.x);
    if (pos.y != null) entry.y = Number(pos.y);
    if (pos.z != null) entry.z = Number(pos.z);
    if (pos.rotY != null) entry.rotY = Number(pos.rotY);
    if (pos.state != null) entry.state = pos.state;
  }

  /**
   * Get sorted ranking (progress desc, score desc)
   */
  getRanking() {
    return [...this.players.values()]
      .filter(p => p.connected)
      .sort((a, b) => {
        if (b.progress !== a.progress) return b.progress - a.progress;
        return b.score - a.score;
      });
  }

  getPlayer(id) {
    return this.players.get(String(id)) || null;
  }

  getLocal() {
    return this.localId ? this.getPlayer(this.localId) : null;
  }

  clear() {
    this.players.clear();
  }
}
