/**
 * HUD.js — Score, HP, rank, progress bar (game overlay)
 */

export class HUD {
  constructor(container) {
    this.container = container;
    this.root = null;
    this._build();
  }

  _build() {
    this.root = document.createElement("div");
    this.root.className = "sv3-hud";
    Object.assign(this.root.style, {
      position: "absolute", inset: "0",
      pointerEvents: "none",
      fontFamily: "Inter, sans-serif", color: "#fff",
      zIndex: "50"
    });
    this.root.innerHTML = `
      <div class="sv3-hud-top" style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px;">
        <div class="sv3-hud-score" style="background:rgba(10,8,30,0.7);padding:6px 14px;border-radius:20px;font-size:14px;font-weight:600;">
          スコア: <span class="sv3-score-val">0</span>
        </div>
        <div class="sv3-hud-hp" style="display:flex;gap:4px;"></div>
      </div>
      <div style="padding:0 16px;">
        <div class="sv3-hud-progress-wrap" style="background:rgba(255,255,255,0.15);border-radius:6px;height:8px;overflow:hidden;">
          <div class="sv3-hud-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#ff6b9d,#ffb400);border-radius:6px;transition:width 0.3s;"></div>
        </div>
      </div>
      <div class="sv3-hud-rank" style="position:absolute;top:12px;right:16px;margin-top:40px;background:rgba(10,8,30,0.7);border-radius:12px;padding:8px 12px;min-width:120px;pointer-events:auto;"></div>
    `;
    this.container.appendChild(this.root);
    this.root.style.display = "none";
  }

  show() { this.root.style.display = "block"; }
  hide() { this.root.style.display = "none"; }

  updateScore(score) {
    this.root.querySelector(".sv3-score-val").textContent = String(score);
  }

  updateHP(hp, maxHp = 3) {
    const el = this.root.querySelector(".sv3-hud-hp");
    el.innerHTML = "";
    for (let i = 0; i < maxHp; i++) {
      const heart = document.createElement("span");
      heart.textContent = i < hp ? "❤️" : "🖤";
      heart.style.fontSize = "18px";
      el.appendChild(heart);
    }
  }

  updateProgress(progress, total = 200) {
    const pct = Math.min(100, (progress / total) * 100);
    this.root.querySelector(".sv3-hud-progress-bar").style.width = pct + "%";
  }

  /**
   * @param {Array<{ nick, score, isMe }>} ranking
   */
  updateRanking(ranking) {
    const el = this.root.querySelector(".sv3-hud-rank");
    el.innerHTML = ranking.slice(0, 8).map((p, i) => `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;${p.isMe?"font-weight:700;color:#ffb400;":"color:rgba(255,255,255,0.8);"}">
        <span style="width:16px;text-align:right;">${i+1}.</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nick||"Player"}</span>
        <span>${p.score||0}</span>
      </div>
    `).join("");
  }

  /** Flash effect for correct/incorrect */
  flash(color = "green") {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "absolute", inset: "0",
      background: color === "green" ? "rgba(60,220,100,0.25)" : "rgba(220,60,60,0.25)",
      pointerEvents: "none", zIndex: "90",
      transition: "opacity 0.4s"
    });
    this.container.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = "0"; });
    setTimeout(() => overlay.remove(), 500);
  }

  dispose() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }
}
