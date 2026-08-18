/**
 * LobbyUI.js — Matchmaking, waiting room, countdown
 */

export class LobbyUI {
  constructor(container) {
    this.container = container;
    this.root = null;
    this._callbacks = {};
    this._build();
  }

  on(event, fn) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(fn);
  }

  _emit(event, data) {
    for (const fn of (this._callbacks[event] || [])) fn(data);
  }

  _build() {
    this.root = document.createElement("div");
    this.root.className = "sv3-lobby";
    Object.assign(this.root.style, {
      position: "absolute", inset: "0",
      background: "linear-gradient(135deg, #1a0a3e, #0a081e)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "Inter, sans-serif", color: "#fff", zIndex: "200",
      overflow: "auto", padding: "20px", boxSizing: "border-box"
    });
    this.root.innerHTML = `
      <h1 style="font-size:28px;font-weight:700;margin:0 0 24px;letter-spacing:-0.5px;">VocabuSurvival</h1>
      <div class="sv3-lobby-modes" style="display:flex;gap:12px;margin-bottom:24px;">
        <button data-mode="3d" class="sv3-mode-btn sv3-mode-active" style="${this._modeStyle(true)}">サバイバル（3D）</button>
        <button data-mode="quiz" class="sv3-mode-btn" style="${this._modeStyle(false)}">クイズバトル（2D）</button>
      </div>
      <div class="sv3-lobby-tabs" style="display:flex;gap:8px;margin-bottom:16px;">
        <button data-tab="create" class="sv3-tab-active" style="${this._tabStyle(true)}">ルーム作成</button>
        <button data-tab="join" style="${this._tabStyle(false)}">参加</button>
      </div>
      <div class="sv3-lobby-body" style="width:min(400px,90vw);">
        <div class="sv3-tab-create">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;">問題数</label>
            <select class="sv3-select-qcount" style="${this._inputStyle()}">
              <option value="10">10問</option>
              <option value="20">20問</option>
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;">定員</label>
            <select class="sv3-select-max" style="${this._inputStyle()}">
              ${[2,3,4,5,6,7,8].map(n=>`<option value="${n}">${n}人</option>`).join("")}
            </select>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;">パスワード（任意）</label>
            <input class="sv3-input-pw" type="text" maxlength="8" placeholder="なし" style="${this._inputStyle()}" />
          </div>
          <button class="sv3-btn-create" style="${this._btnStyle()}"">ルーム作成</button>
        </div>
        <div class="sv3-tab-join" style="display:none;">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;">ルームID</label>
            <input class="sv3-input-room" type="text" maxlength="6" placeholder="ABCDEF" style="${this._inputStyle()};text-transform:uppercase;" />
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px;">パスワード</label>
            <input class="sv3-input-join-pw" type="text" maxlength="8" placeholder="なし" style="${this._inputStyle()}" />
          </div>
          <button class="sv3-btn-join" style="${this._btnStyle()}">参加</button>
        </div>
      </div>
      <div class="sv3-lobby-waiting" style="display:none;text-align:center;width:min(400px,90vw);">
        <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:4px;">ルームID</div>
        <div class="sv3-room-id" style="font-size:32px;font-weight:700;letter-spacing:4px;margin-bottom:16px;"></div>
        <div class="sv3-player-list" style="margin-bottom:16px;"></div>
        <button class="sv3-btn-ready" style="${this._btnStyle()}">準備完了</button>
        <button class="sv3-btn-start" style="${this._btnStyle()};display:none;margin-top:8px;">ゲーム開始</button>
      </div>
      <div class="sv3-lobby-countdown" style="display:none;text-align:center;">
        <div class="sv3-countdown-num" style="font-size:96px;font-weight:800;opacity:0;transition:all 0.3s;"></div>
      </div>
      <div class="sv3-lobby-error" style="display:none;color:#ff5252;font-size:14px;margin-top:12px;text-align:center;"></div>
    `;
    this.container.appendChild(this.root);
    this._bindEvents();
  }

  _modeStyle(active) {
    return `padding:10px 20px;font-size:14px;font-weight:600;border-radius:10px;cursor:pointer;border:1px solid ${active?"#7c6eef":"rgba(255,255,255,0.15)"};background:${active?"rgba(92,75,232,0.3)":"rgba(255,255,255,0.08)"};color:#fff;font-family:inherit;transition:all 0.15s;`;
  }
  _tabStyle(active) {
    return `padding:8px 16px;font-size:13px;font-weight:500;border-radius:8px;cursor:pointer;border:1px solid ${active?"rgba(255,255,255,0.3)":"transparent"};background:${active?"rgba(255,255,255,0.1)":"transparent"};color:${active?"#fff":"rgba(255,255,255,0.5)"};font-family:inherit;transition:all 0.15s;`;
  }
  _inputStyle() {
    return "width:100%;padding:8px 12px;font-size:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-family:inherit;box-sizing:border-box;outline:none;";
  }
  _btnStyle() {
    return "width:100%;padding:12px;font-size:15px;font-weight:600;background:#5c4be8;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;transition:background 0.15s;";
  }

  _bindEvents() {
    // Mode tabs
    this.root.querySelectorAll(".sv3-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.root.querySelectorAll(".sv3-mode-btn").forEach(b => {
          b.style.background = "rgba(255,255,255,0.08)";
          b.style.borderColor = "rgba(255,255,255,0.15)";
        });
        btn.style.background = "rgba(92,75,232,0.3)";
        btn.style.borderColor = "#7c6eef";
        this._emit("modeSelect", { mode: btn.dataset.mode });
      });
    });

    // Create / Join tabs
    this.root.querySelectorAll(".sv3-lobby-tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        this.root.querySelectorAll(".sv3-lobby-tabs button").forEach(b => {
          const active = b.dataset.tab === tab;
          b.style.background = active ? "rgba(255,255,255,0.1)" : "transparent";
          b.style.borderColor = active ? "rgba(255,255,255,0.3)" : "transparent";
          b.style.color = active ? "#fff" : "rgba(255,255,255,0.5)";
        });
        this.root.querySelector(".sv3-tab-create").style.display = tab === "create" ? "block" : "none";
        this.root.querySelector(".sv3-tab-join").style.display = tab === "join" ? "block" : "none";
      });
    });

    // Create room
    this.root.querySelector(".sv3-btn-create").addEventListener("click", () => {
      const qcount = this.root.querySelector(".sv3-select-qcount").value;
      const max = this.root.querySelector(".sv3-select-max").value;
      const pw = this.root.querySelector(".sv3-input-pw").value.trim();
      this._emit("createRoom", { questionCount: Number(qcount), maxPlayers: Number(max), password: pw || undefined });
    });

    // Join room
    this.root.querySelector(".sv3-btn-join").addEventListener("click", () => {
      const roomId = this.root.querySelector(".sv3-input-room").value.trim().toUpperCase();
      const pw = this.root.querySelector(".sv3-input-join-pw").value.trim();
      if (!roomId) return;
      this._emit("joinRoom", { roomId, password: pw || undefined });
    });

    // Ready
    this.root.querySelector(".sv3-btn-ready").addEventListener("click", () => {
      this._emit("ready", {});
    });

    // Start
    this.root.querySelector(".sv3-btn-start").addEventListener("click", () => {
      this._emit("startGame", {});
    });

    // Hover effects
    this.root.querySelectorAll("button").forEach(btn => {
      if (btn.style.background?.includes("#5c4be8")) {
        btn.addEventListener("mouseenter", () => btn.style.background = "#7c6eef");
        btn.addEventListener("mouseleave", () => btn.style.background = "#5c4be8");
      }
    });
  }

  showWaiting(roomId, isHost) {
    this.root.querySelector(".sv3-lobby-body").style.display = "none";
    this.root.querySelector(".sv3-lobby-tabs").style.display = "none";
    this.root.querySelector(".sv3-lobby-modes").style.display = "none";
    const waiting = this.root.querySelector(".sv3-lobby-waiting");
    waiting.style.display = "block";
    this.root.querySelector(".sv3-room-id").textContent = roomId;
    this.root.querySelector(".sv3-btn-start").style.display = isHost ? "block" : "none";
  }

  updatePlayerList(players = []) {
    const list = this.root.querySelector(".sv3-player-list");
    list.innerHTML = players.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.06);border-radius:8px;margin-bottom:4px;">
        <div style="width:32px;height:32px;border-radius:50%;background:${["#ff6b9d","#7c4dff","#00d4ff","#00e676","#ffb400","#ff5252"][i%6]};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;">${(p.nick||"?")[0]}</div>
        <span style="flex:1;font-size:14px;">${p.nick || p.nickname || "Player"}</span>
        <span style="font-size:12px;color:${p.ready?"#00e676":"rgba(255,255,255,0.4)"};">${p.ready?"準備完了":"待機中"}</span>
      </div>
    `).join("");
  }

  showCountdown(num) {
    this.root.querySelector(".sv3-lobby-waiting").style.display = "none";
    const cd = this.root.querySelector(".sv3-lobby-countdown");
    cd.style.display = "block";
    const numEl = cd.querySelector(".sv3-countdown-num");
    numEl.textContent = num === 0 ? "GO!" : String(num);
    numEl.style.opacity = "0";
    numEl.style.transform = "scale(2)";
    requestAnimationFrame(() => {
      numEl.style.opacity = "1";
      numEl.style.transform = "scale(1)";
    });
  }

  showError(msg) {
    const el = this.root.querySelector(".sv3-lobby-error");
    el.style.display = "block";
    el.textContent = msg;
    setTimeout(() => { el.style.display = "none"; }, 4000);
  }

  hide() {
    if (this.root) this.root.style.display = "none";
  }

  show() {
    if (this.root) this.root.style.display = "flex";
  }

  dispose() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this._callbacks = {};
  }
}
