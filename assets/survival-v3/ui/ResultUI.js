/**
 * ResultUI.js — Goal, game over, ranking display
 */

export class ResultUI {
  constructor(container) {
    this.container = container;
    this.root = null;
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
   * Show final result
   * @param {{ ranking: Array<{ nick, score, correct, total, isMe }>, myRank: number, cleared: boolean }} data
   */
  show(data) {
    if (this.root) this.dispose();

    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute", inset: "0",
      background: "rgba(10,8,30,0.92)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "Inter, sans-serif", color: "#fff", zIndex: "150",
      padding: "20px", boxSizing: "border-box", overflow: "auto"
    });

    const title = data.cleared ? "ゴール！" : "ゲームオーバー";
    const titleColor = data.cleared ? "#00e676" : "#ff5252";

    this.root.innerHTML = `
      <h2 style="font-size:32px;font-weight:800;color:${titleColor};margin:0 0 8px;">${title}</h2>
      <div style="font-size:16px;color:rgba(255,255,255,0.6);margin-bottom:24px;">あなたの順位: <span style="color:#ffb400;font-weight:700;">${data.myRank}位</span></div>
      <div class="sv3-result-table" style="width:min(420px,90vw);margin-bottom:24px;">
        ${(data.ranking || []).map((p, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${p.isMe?"rgba(92,75,232,0.2)":"rgba(255,255,255,0.04)"};border-radius:10px;margin-bottom:4px;${p.isMe?"border:1px solid rgba(124,77,255,0.3);":""}">
            <div style="width:28px;font-size:${i===0?'20':'16'}px;font-weight:700;text-align:center;">${i===0?"👑":i+1}</div>
            <div style="flex:1;font-size:14px;font-weight:${p.isMe?'700':'400'};">${p.nick||"Player"}</div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:700;color:#ffb400;" class="sv3-result-score" data-target="${p.score||0}">0</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.5);">${p.correct||0}/${p.total||0} 正解</div>
            </div>
          </div>
        `).join("")}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="sv3-btn-rematch" style="padding:10px 24px;font-size:14px;font-weight:600;background:#5c4be8;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;">もう一度</button>
        <button class="sv3-btn-lobby" style="padding:10px 24px;font-size:14px;font-weight:600;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;cursor:pointer;font-family:inherit;">ロビーへ</button>
      </div>
    `;
    this.container.appendChild(this.root);

    // Score count-up animation
    this.root.querySelectorAll(".sv3-result-score").forEach(el => {
      const target = Number(el.dataset.target || 0);
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 30));
      const interval = setInterval(() => {
        current = Math.min(target, current + step);
        el.textContent = String(current);
        if (current >= target) clearInterval(interval);
      }, 30);
    });

    // Confetti for winner
    if (data.cleared || data.myRank === 1) {
      this._confetti();
    }

    // Button events
    this.root.querySelector(".sv3-btn-rematch")?.addEventListener("click", () => this._emit("rematch", {}));
    this.root.querySelector(".sv3-btn-lobby")?.addEventListener("click", () => this._emit("lobby", {}));
  }

  _confetti() {
    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute", inset: "0", pointerEvents: "none", zIndex: "1"
    });
    canvas.width = this.root.clientWidth || 400;
    canvas.height = this.root.clientHeight || 600;
    this.root.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const colors = ["#ff6b9d","#7c4dff","#00d4ff","#00e676","#ffb400","#ff5252"];
    const pieces = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: 1.5 + Math.random() * 2.5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.15
    }));

    let frame = 0;
    const animate = () => {
      if (frame > 180) { canvas.remove(); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      frame++;
      requestAnimationFrame(animate);
    };
    animate();
  }

  hide() {
    if (this.root) this.root.style.display = "none";
  }

  dispose() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this._callbacks = {};
  }
}
