/**
 * QuizUI.js — Shared UI components for quiz battle mode
 */

/** Inject quiz battle styles */
export function injectQuizStyles() {
  if (document.getElementById("sv3-quiz-styles")) return;
  const style = document.createElement("style");
  style.id = "sv3-quiz-styles";
  style.textContent = `
    .sv3q-root { position:absolute;inset:0;background:linear-gradient(135deg,#1a0a3e,#0a081e);font-family:Inter,sans-serif;color:#fff;display:flex;flex-direction:column;overflow:hidden; }
    .sv3q-card { background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:16px; }
    .sv3q-btn { padding:12px 24px;font-size:15px;font-weight:600;background:#5c4be8;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;transition:background 0.15s; }
    .sv3q-btn:hover { background:#7c6eef; }
    .sv3q-choice { padding:12px 16px;font-size:14px;color:#fff;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:10px;cursor:pointer;font-family:inherit;transition:all 0.15s;text-align:left;line-height:1.4;word-break:break-word; }
    .sv3q-choice:hover { background:rgba(92,75,232,0.5);border-color:#7c6eef; }
    .sv3q-choice-correct { background:rgba(60,220,100,0.4)!important;border-color:#3cdc64!important;cursor:default; }
    .sv3q-choice-wrong { background:rgba(220,60,60,0.4)!important;border-color:#dc3c3c!important;cursor:default; }
    .sv3q-choice-reveal { background:rgba(60,220,100,0.2)!important;border-color:#3cdc64!important;cursor:default; }
    .sv3q-choice-disabled { pointer-events:none;opacity:0.7; }
    .sv3q-timer-ring { transition:stroke-dashoffset 0.3s linear; }
    @media(max-width:640px){
      .sv3q-game-layout { flex-direction:column!important; }
      .sv3q-sidebar { max-height:120px!important;overflow-y:auto!important; }
    }
  `;
  document.head.appendChild(style);
}

/** Create circular timer SVG */
export function createTimerSVG(size = 60) {
  const r = (size - 6) / 2;
  const c = Math.PI * 2 * r;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.innerHTML = `
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>
    <circle class="sv3q-timer-arc" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#7c4dff" stroke-width="4"
      stroke-dasharray="${c}" stroke-dashoffset="0" stroke-linecap="round"
      transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
      fill="#fff" font-size="18" font-weight="700" font-family="Inter,sans-serif" class="sv3q-timer-text">15</text>
  `;
  return { svg, circumference: c, radius: r };
}

/** Update timer ring */
export function updateTimerSVG(svg, remaining, total = 15, circumference) {
  const arc = svg.querySelector(".sv3q-timer-arc");
  const text = svg.querySelector(".sv3q-timer-text");
  const pct = Math.max(0, remaining / total);
  arc.setAttribute("stroke-dashoffset", String(circumference * (1 - pct)));
  arc.setAttribute("stroke", remaining <= 3 ? "#ff5252" : "#7c4dff");
  text.textContent = Math.ceil(remaining);
  if (remaining <= 3) text.setAttribute("fill", "#ff5252");
  else text.setAttribute("fill", "#fff");
}
