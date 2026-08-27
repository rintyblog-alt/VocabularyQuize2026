/* ══════════════════════════════════════════════════════════════════════════
   通信。

   考え方（要件 19〜21）:
     ・**自分は 自分の 端末で 動かす**（client prediction）。
       サーバの 返事を 待って 動かすと 反応が 鈍くて 遊べない。
     ・サーバが 「あり得ない」と 言ったら **その場で 直す**（reconciliation）。
     ・ほかの 人は **110ms 遅らせて 補間**する。
       遅らせないと、届いた 瞬間に カクッと 飛ぶ。
     ・切れても 試合は 続く。戻ったら 入り直す（自動で 3 回まで）。
   ══════════════════════════════════════════════════════════════════════════ */
import { C2S, S2C, SEND_INTERVAL, INTERP_DELAY_MS } from "./proto.js";
import { lerp, clamp } from "../engine/math.js";

export class SurviveNet {
  constructor(opt) {
    opt = opt || {};
    this.onRoom = opt.onRoom || (() => {});
    this.onGo = opt.onGo || (() => {});
    this.onGate = opt.onGate || (() => {});
    this.onFinish = opt.onFinish || (() => {});
    this.onEnd = opt.onEnd || (() => {});
    this.onFix = opt.onFix || (() => {});
    this.onState = opt.onState || (() => {});   /* つながり具合 */

    this.ws = null;
    this.you = "";
    this.room = null;
    this.questions = null;
    this.connected = false;
    this.closing = false;
    this.retries = 0;
    this.ping = 0;
    this._url = "";
    this._sendAcc = 0;
    this._seq = 0;
    /* 相手の 位置の 控え。id → [{t,x,y,z,yaw,...}, …] */
    this.buf = new Map();
    this._pingTimer = 0;
    this._offset = 0;    /* サーバの 時計との ずれ */
  }

  /** @param {string} url ws:// … @param {string} token */
  connect(url, token) {
    this.closing = false;
    this._url = url + (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token || "");
    this._open();
    return this;
  }

  _open() {
    try {
      this.ws = new WebSocket(this._url);
    } catch (e) {
      this.onState({ connected: false, error: String(e && e.message || e) });
      this._retry();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this.retries = 0;
      this.onState({ connected: true });
      this._startPing();
    };
    this.ws.onmessage = (ev) => this._onMessage(ev.data);
    this.ws.onclose = () => {
      this.connected = false;
      this._stopPing();
      this.onState({ connected: false });
      if (!this.closing) this._retry();
    };
    this.ws.onerror = () => { /* close が 続けて 来る */ };
  }

  _retry() {
    if (this.closing || this.retries >= 3) return;
    this.retries++;
    const wait = 400 * Math.pow(2, this.retries - 1);
    setTimeout(() => { if (!this.closing) this._open(); }, wait);
  }

  close() {
    this.closing = true;
    this._stopPing();
    try { if (this.ws) this.ws.close(1000); } catch (e) {}
    this.ws = null;
    this.connected = false;
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      this.send({ t: C2S.PING, ts: Date.now() });
    }, 2500);
  }
  _stopPing() { if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = 0; } }

  send(o) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; }
  }

  _onMessage(raw) {
    let m = null;
    try { m = JSON.parse(String(raw || "")); } catch (e) { return; }
    if (!m || !m.t) return;
    switch (m.t) {
      case S2C.WELCOME:
        this.you = String(m.you || "");
        this.room = m.room || null;
        if (m.questions) this.questions = m.questions;
        this.onRoom(this.room);
        break;
      case S2C.ROOM:
        this.room = m.room || this.room;
        this.onRoom(this.room);
        break;
      case S2C.GO:
        this.room = m.room || this.room;
        this.questions = m.questions || this.questions;
        this._offset = (m.startAt || Date.now()) - Date.now();
        this.onGo(m);
        break;
      case S2C.SNAP:
        this._onSnap(m);
        break;
      case S2C.GATE: this.onGate(m); break;
      case S2C.PGATE: this.onGate(m); break;
      case S2C.FIN: this.onFinish(m); break;
      case S2C.END: this.onEnd(m); break;
      case S2C.FIX: this.onFix(m); break;
      case S2C.PONG: this.ping = Math.max(0, Date.now() - (m.ts || Date.now())); break;
      case S2C.ERR: this.onState({ connected: this.connected, error: m.msg || m.code }); break;
      default: break;
    }
  }

  _onSnap(m) {
    const now = performance.now();
    for (const p of (m.ps || [])) {
      if (p.id === this.you) continue;
      let a = this.buf.get(p.id);
      if (!a) { a = []; this.buf.set(p.id, a); }
      a.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, st: p.st, pr: p.pr, cp: p.cp, rank: p.rank, fin: p.fin });
      /* 古い ものは 捨てる（1 秒ぶんで 十分） */
      while (a.length > 2 && now - a[0].t > 1000) a.shift();
    }
  }

  /**
   * ほかの 人の 「いま 見せるべき 位置」を 返す。
   * 110ms 遅らせた 時刻の 前後 2 つを 混ぜる。
   */
  sample(id, out) {
    const a = this.buf.get(id);
    if (!a || !a.length) return null;
    const want = performance.now() - INTERP_DELAY_MS;
    if (a.length === 1 || want <= a[0].t) { return copy(a[0], out); }
    for (let i = 1; i < a.length; i++) {
      if (a[i].t >= want) {
        const p = a[i - 1], q = a[i];
        const k = clamp((want - p.t) / Math.max(1, q.t - p.t), 0, 1);
        out = out || {};
        out.x = lerp(p.x, q.x, k); out.y = lerp(p.y, q.y, k); out.z = lerp(p.z, q.z, k);
        out.yaw = lerpAngle(p.yaw, q.yaw, k);
        out.g = q.g; out.st = q.st; out.pr = q.pr; out.cp = q.cp; out.rank = q.rank; out.fin = q.fin;
        return out;
      }
    }
    /* 届いていない ぶんは いちばん 新しい ものを そのまま（外挿は しない。
       外挿すると 壁を すり抜けた ように 見える） */
    return copy(a[a.length - 1], out);
  }

  /* ── 送る ─────────────────────────────────────────────────────── */
  /** 毎フレーム 呼ぶ。中で 20Hz に 間引く。 */
  tick(dt, localPlayer) {
    if (!this.connected || !localPlayer) return;
    this._sendAcc += dt;
    if (this._sendAcc < SEND_INTERVAL) return;
    this._sendAcc = 0;
    this._seq++;
    const p = localPlayer;
    this.send({
      t: C2S.INPUT, seq: this._seq,
      s: {
        x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw),
        g: p.grounded ? 1 : 0, st: p.stunned > 0 ? 1 : 0,
        pr: r1(p.progress), cp: p.checkpoint, rs: p.respawns
      }
    });
  }

  setReady(v) { this.send({ t: C2S.READY, v: !!v }); }
  setColor(v) { this.send({ t: C2S.COLOR, v: v | 0 }); }
  setCourse(id) { this.send({ t: C2S.COURSE, id: String(id) }); }
  setMode(v) { this.send({ t: C2S.MODE, v: String(v) }); }
  setHat(key, colorIndex) { this.send({ t: C2S.HAT, v: String(key || "none"), c: colorIndex | 0 }); }
  setPreset(q) {
    this.send({
      t: C2S.PRESET,
      kind: q && q.kind ? String(q.kind) : "",
      id: q && q.id ? String(q.id) : "",
      owner: (q && q.owner) | 0,
      name: q && q.name ? String(q.name).slice(0, 80) : ""
    });
  }
  start(courseLength) { this.send({ t: C2S.START, length: courseLength || 0 }); }
  sendAnswer(gateIndex, pick) { this.send({ t: C2S.GATE, g: gateIndex | 0, a: pick | 0 }); }
  sendFinish() { this.send({ t: C2S.FINISH }); }
}

function copy(s, out) {
  out = out || {};
  out.x = s.x; out.y = s.y; out.z = s.z; out.yaw = s.yaw;
  out.g = s.g; out.st = s.st; out.pr = s.pr; out.cp = s.cp; out.rank = s.rank; out.fin = s.fin;
  return out;
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function r2(v) { return Math.round(v * 100) / 100; }
function r1(v) { return Math.round(v * 10) / 10; }

/* ── 部屋を 作る／入る（HTTP の ほう）────────────────────────────── */
function base() {
  try { return String(window.VQ_API_BASE || "").replace(/\/+$/, ""); } catch (e) { return ""; }
}
function tok() {
  try { return typeof window._authGetToken === "function" ? String(window._authGetToken() || "") : ""; } catch (e) { return ""; }
}

export async function createRoom(opt) {
  const t = tok();
  if (!t) throw new Error("ログインが 必要です。");
  const r = await fetch(base() + "/api/survive/room", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
    body: JSON.stringify(opt || {})
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.ok) throw new Error((d && d.message) || ("HTTP " + r.status));
  return d;
}

export async function roomInfo(roomId) {
  const r = await fetch(base() + "/api/survive/room/" + encodeURIComponent(roomId), {
    headers: tok() ? { Authorization: "Bearer " + tok() } : {}
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.ok) throw new Error((d && d.message) || ("HTTP " + r.status));
  return d;
}

export { C2S, S2C };
