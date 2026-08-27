/**
 * RoomManager.js — Room creation, joining, state management
 */
import { SyncManager } from "./SyncManager.js";

export class RoomManager {
  constructor() {
    this.sync = new SyncManager();
    this.roomId = null;
    this.isHost = false;
    this._token = null;
    this._callbacks = {};
  }

  /** Set auth token getter */
  setTokenGetter(fn) {
    this._getToken = fn;
  }

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }

  _emit(event, data) {
    for (const fn of (this._callbacks[event] || [])) fn(data);
  }

  async _fetchToken() {
    if (this._getToken) return await this._getToken();
    return null;
  }

  /**
   * Create a room
   */
  async createRoom({ password, questionCount = 10, mode = "survival" } = {}) {
    const token = await this._fetchToken();
    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ password, questionCount, mode })
    });
    const data = await res.json();
    if (!data.roomId || !data.wsUrl) throw new Error(data.error || "Failed to create room");

    this.roomId = data.roomId;
    this.isHost = true;

    await this.sync.connect(data.wsUrl, { password, token });
    this._bindSyncEvents();
    return { roomId: data.roomId, password: data.password };
  }

  /**
   * Join a room
   */
  async joinRoom({ roomId, password, nickname } = {}) {
    const token = await this._fetchToken();
    const res = await fetch("/api/room/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ roomId, password, nickname })
    });
    const data = await res.json();
    if (!data.wsUrl) throw new Error(data.error || "Failed to join room");

    this.roomId = roomId;
    this.isHost = false;

    await this.sync.connect(data.wsUrl, { password, token, nickname });
    this._bindSyncEvents();
    return { roomId };
  }

  _bindSyncEvents() {
    this.sync.on("room:snapshot", (data) => this._emit("snapshot", data));
    this.sync.on("game:question", (data) => this._emit("question", data));
    this.sync.on("game:result", (data) => this._emit("result", data));
    this.sync.on("game:final", (data) => this._emit("final", data));
    this.sync.on("game3d:player", (data) => this._emit("playerUpdate", data));
    this.sync.on("game3d:snapshot", (data) => this._emit("worldSnapshot", data));
    this.sync.on("game3d:world", (data) => this._emit("worldState", data));
    this.sync.on("countdown:start", (data) => this._emit("countdown", data));
    this.sync.on("error", (data) => this._emit("error", data));
    this.sync.on("close", () => this._emit("disconnected", {}));
  }

  setReady(ready = true) {
    this.sync.send({ type: "ready", ready });
  }

  startGame() {
    if (this.isHost) this.sync.send({ type: "start" });
  }

  sendAnswer(payload) {
    this.sync.send({ type: "answer", ...payload });
  }

  sendPosition(pos) {
    this.sync.send({ type: "position", ...pos });
  }

  leave() {
    this.sync.send({ type: "leave" });
    this.sync.disconnect();
    this.roomId = null;
    this.isHost = false;
  }

  dispose() {
    this.sync.disconnect();
    this._callbacks = {};
  }
}
