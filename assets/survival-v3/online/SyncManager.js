/**
 * SyncManager.js — WebSocket send/receive, interpolation, lag compensation
 */

export class SyncManager {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;
    this._callbacks = {};
    this._pingInterval = null;
    this._sendInterval = null;
    this._positionBuffer = null;
    this._connected = false;
  }

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }

  _emit(event, data) {
    for (const fn of (this._callbacks[event] || [])) fn(data);
  }

  /**
   * Connect to WebSocket
   */
  async connect(wsUrl, { password, token, nickname } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(wsUrl, window.location.origin);
      if (token) url.searchParams.set("token", token);

      this.ws = new WebSocket(url.toString());

      this.ws.onopen = () => {
        this._connected = true;
        // Hello handshake
        this.send({ type: "hello", pw: password || "", nick: nickname || "" });
        // Start ping
        this._pingInterval = setInterval(() => {
          if (this._connected) this.send({ type: "ping", ts: Date.now() });
        }, 15000);
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const type = msg.type || msg.t;
          if (type) this._emit(type, msg);
        } catch (_) {}
      };

      this.ws.onerror = () => {
        this._emit("error", { message: "WebSocket error" });
      };

      this.ws.onclose = () => {
        this._connected = false;
        this._stopPing();
        this._emit("close", {});
      };
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Start sending position at regular intervals
   * @param {() => object} getPosition - function that returns current position
   * @param {number} intervalMs - send interval (default 60ms)
   */
  startPositionSync(getPosition, intervalMs = 60) {
    this.stopPositionSync();
    this._sendInterval = setInterval(() => {
      const pos = getPosition();
      if (pos) this.send({ type: "position", ...pos, ts: Date.now() });
    }, intervalMs);
  }

  stopPositionSync() {
    if (this._sendInterval) {
      clearInterval(this._sendInterval);
      this._sendInterval = null;
    }
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  disconnect() {
    this.stopPositionSync();
    this._stopPing();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this._connected = false;
  }

  isConnected() {
    return this._connected && this.ws?.readyState === WebSocket.OPEN;
  }
}
