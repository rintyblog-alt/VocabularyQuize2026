/**
 * QuestionUI.js — Question panel with slide-up animation
 */

export class QuestionUI {
  constructor(container) {
    this.container = container;
    this.panel = null;
    this._selectedIndex = -1;
    this._correctIndex = -1;
    this._onSelect = null;
    this._build();
  }

  _build() {
    this.panel = document.createElement("div");
    this.panel.className = "sv3-question-panel";
    Object.assign(this.panel.style, {
      position: "absolute",
      bottom: "0",
      left: "50%",
      transform: "translateX(-50%) translateY(100%)",
      width: "min(480px, 92vw)",
      background: "rgba(10,8,30,0.95)",
      borderRadius: "14px 14px 0 0",
      padding: "20px",
      transition: "transform 0.3s ease-out",
      zIndex: "100",
      fontFamily: "Inter, sans-serif",
      boxSizing: "border-box",
      pointerEvents: "auto"
    });
    this.panel.innerHTML = `
      <div class="sv3-q-text" style="color:#fff;font-size:15px;text-align:center;margin-bottom:14px;line-height:1.5;min-height:40px;"></div>
      <div class="sv3-q-choices" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
    `;
    this.container.appendChild(this.panel);
  }

  /**
   * @param {{ text, choices }} data
   * @param {(index: number) => void} onSelect
   */
  show(data, onSelect) {
    this._selectedIndex = -1;
    this._correctIndex = -1;
    this._onSelect = onSelect;

    const textEl = this.panel.querySelector(".sv3-q-text");
    textEl.textContent = data.text || "";

    const choicesEl = this.panel.querySelector(".sv3-q-choices");
    choicesEl.innerHTML = "";

    (data.choices || []).forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.textContent = choice;
      Object.assign(btn.style, {
        padding: "10px 8px",
        fontSize: "14px",
        color: "#fff",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        fontFamily: "inherit",
        lineHeight: "1.3",
        wordBreak: "break-word"
      });
      btn.addEventListener("mouseenter", () => {
        if (this._selectedIndex < 0) {
          btn.style.background = "rgba(92,75,232,0.5)";
          btn.style.borderColor = "#7c6eef";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (this._selectedIndex < 0) {
          btn.style.background = "rgba(255,255,255,0.1)";
          btn.style.borderColor = "rgba(255,255,255,0.2)";
        }
      });
      btn.addEventListener("click", () => {
        if (this._selectedIndex >= 0) return;
        this._selectedIndex = i;
        btn.style.background = "rgba(92,75,232,0.6)";
        btn.style.borderColor = "#7c6eef";
        if (this._onSelect) this._onSelect(i);
      });
      choicesEl.appendChild(btn);
    });

    // Slide up
    requestAnimationFrame(() => {
      this.panel.style.transform = "translateX(-50%) translateY(0)";
    });
  }

  /**
   * Highlight correct/incorrect answers
   */
  showResult(correctIndex, isCorrect) {
    this._correctIndex = correctIndex;
    const buttons = this.panel.querySelectorAll(".sv3-q-choices button");
    buttons.forEach((btn, i) => {
      if (i === correctIndex) {
        btn.style.background = "rgba(60,220,100,0.4)";
        btn.style.borderColor = "#3cdc64";
      } else if (i === this._selectedIndex && !isCorrect) {
        btn.style.background = "rgba(220,60,60,0.4)";
        btn.style.borderColor = "#dc3c3c";
      }
      btn.style.cursor = "default";
      btn.style.pointerEvents = "none";
    });
  }

  hide() {
    this.panel.style.transform = "translateX(-50%) translateY(100%)";
  }

  dispose() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
