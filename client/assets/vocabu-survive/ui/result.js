/* ══════════════════════════════════════════════════════════════════════════
   結果。

   要件どおり: 順位 / 時間 / クイズ正答率 / XP / 自己ベスト
   ＋ もう一度 / ロビーへ / VocabuQuiz へ戻る。

   ★ 自己ベストは **更新した ときだけ** 目立たせる。
     毎回 出すと 何も 伝わらない。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE, beanByIndex } from "./theme.js";

const MEDAL = ["🥇", "🥈", "🥉"];

export class ResultPanel {
  constructor(opt) {
    this.onAgain = (opt && opt.onAgain) || (() => {});
    this.onLobby = (opt && opt.onLobby) || (() => {});
    this.onExit = (opt && opt.onExit) || (() => {});
    this.el = this._build();
  }

  _build() {
    this.titleEl = h("h2", { class: "vs-res-title" });
    this.subEl = h("p", { class: "vs-res-sub" });
    this.statsEl = h("div", { class: "vs-res-stats" });
    this.listEl = h("ol", { class: "vs-res-list" });
    this.bestEl = h("div", { class: "vs-res-best vs-hide" });

    return h("div", { class: "vs-res" },
      h("div", { class: "vs-res-card" },
        h("div", { class: "vs-res-head" }, this.titleEl, this.subEl),
        this.bestEl,
        this.statsEl,
        h("div", { class: "vs-res-listwrap" }, this.listEl),
        h("div", { class: "vs-res-btns" },
          h("button", { class: "vs-btn is-mint", type: "button", onclick: () => this.onAgain() }, "もう一度"),
          h("button", { class: "vs-btn is-ghost", type: "button", onclick: () => this.onLobby() }, "ロビーへ"),
          h("button", { class: "vs-btn is-ghost", type: "button", onclick: () => this.onExit() }, "VocabuQuiz へ戻る"))));
  }

  _stat(label, value, sub) {
    return h("div", { class: "vs-res-stat" },
      h("span", { class: "vs-res-sl", text: label }),
      h("span", { class: "vs-res-sv vs-mono", text: value }),
      sub ? h("span", { class: "vs-res-ss", text: sub }) : null);
  }

  /**
   * @param {object} d
   *   rank, total, time, correct, wrong, respawns, xp, best, newBest, standings, courseName
   */
  show(d) {
    const rank = d.rank || 0;
    const medal = rank >= 1 && rank <= 3 ? MEDAL[rank - 1] : "";
    this.titleEl.textContent = d.finished
      ? (medal ? medal + " " + rank + "位" : rank + "位")
      : "ゴールできませんでした";
    this.titleEl.setAttribute("data-rank", String(rank));
    this.subEl.textContent = d.courseName + " ・ " + d.total + "人";

    const acc = (d.correct + d.wrong) > 0
      ? Math.round((d.correct / (d.correct + d.wrong)) * 100) : 0;
    this.statsEl.textContent = "";
    this.statsEl.appendChild(this._stat("タイム", d.finished ? fmt(d.time) : "—",
      d.best ? "自己ベスト " + fmt(d.best) : ""));
    this.statsEl.appendChild(this._stat("クイズ", acc + "%", d.correct + " / " + (d.correct + d.wrong)));
    this.statsEl.appendChild(this._stat("戻された", String(d.respawns), "回"));
    this.statsEl.appendChild(this._stat("XP", "+" + d.xp, ""));

    if (d.newBest) {
      this.bestEl.classList.remove("vs-hide");
      this.bestEl.textContent = "自己ベスト 更新！  " + fmt(d.time);
    } else {
      this.bestEl.classList.add("vs-hide");
    }

    this.listEl.textContent = "";
    for (const r of (d.standings || [])) {
      const dot = h("i", { class: "vs-res-dot" });
      dot.style.background = beanByIndex(r.colorIndex).hex;
      this.listEl.appendChild(h("li", { class: "vs-res-row", "data-me": r.me ? "1" : "0" },
        h("span", { class: "vs-res-no vs-mono", text: String(r.rank) }),
        dot,
        h("span", { class: "vs-res-nm", text: r.name }),
        h("span", { class: "vs-res-tm vs-mono", text: r.finished ? fmt(r.finishTime) : (Math.round(r.pct * 100) + "%") })));
    }
    this.el.setAttribute("data-on", "1");
  }

  hide() { this.el.removeAttribute("data-on"); }
}

function fmt(s) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
}

export const RESULT_CSS = `
.vs-res{ position:absolute; inset:0; z-index:9; display:none;
  align-items:center; justify-content:center;
  background:rgba(6,8,22,.72); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  padding: calc(16px + var(--vs-safe-t)) 16px calc(16px + var(--vs-safe-b)); }
.vs-res[data-on="1"]{ display:flex; animation: vsFade .28s ease both; }
@keyframes vsFade{ from{opacity:0} to{opacity:1} }
.vs-res-card{
  width:min(620px,100%); max-height:100%; overflow:auto;
  background:rgba(12,15,36,.94); border:1px solid rgba(255,255,255,.16);
  border-radius:22px; padding:24px 22px;
  box-shadow:0 24px 70px rgba(0,0,0,.5);
  animation: vsPop .34s cubic-bezier(.2,1.1,.3,1) both;
}
@keyframes vsPop{ from{ transform:translateY(18px) scale(.97); opacity:0 } to{ transform:none; opacity:1 } }
.vs-res-head{ text-align:center; margin-bottom:14px; }
.vs-res-title{ font-size:clamp(28px,6vw,44px); font-weight:900; letter-spacing:-.02em; }
.vs-res-title[data-rank="1"]{ color:${PALETTE.amber}; }
.vs-res-sub{ font-size:13px; color:rgba(243,245,255,.6); margin-top:4px; }
.vs-res-best{
  margin:0 auto 14px; width:fit-content; padding:7px 16px; border-radius:999px;
  background:linear-gradient(90deg, rgba(255,176,32,.24), rgba(55,224,176,.24));
  border:1px solid rgba(255,176,32,.5); font-size:13px; font-weight:800; color:${PALETTE.amber};
}
.vs-res-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:16px; }
.vs-res-stat{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.10);
  border-radius:13px; padding:10px 8px; text-align:center; display:flex; flex-direction:column; gap:2px; }
.vs-res-sl{ font-size:10.5px; color:rgba(243,245,255,.55); font-weight:700; letter-spacing:.05em; }
.vs-res-sv{ font-size:19px; font-weight:900; }
.vs-res-ss{ font-size:10px; color:rgba(243,245,255,.45); }
.vs-res-listwrap{ max-height:210px; overflow:auto; margin-bottom:16px;
  border-radius:13px; border:1px solid rgba(255,255,255,.10); }
.vs-res-list{ list-style:none; }
.vs-res-row{ display:flex; align-items:center; gap:9px; padding:9px 12px; font-size:13px;
  border-bottom:1px solid rgba(255,255,255,.06); }
.vs-res-row:last-child{ border-bottom:0; }
.vs-res-row[data-me="1"]{ background:rgba(255,176,32,.14); font-weight:800; }
.vs-res-no{ width:18px; text-align:right; color:rgba(243,245,255,.55); }
.vs-res-dot{ width:10px; height:10px; border-radius:50%; }
.vs-res-nm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-res-tm{ color:rgba(243,245,255,.72); font-size:12px; }
.vs-res-btns{ display:flex; gap:9px; flex-wrap:wrap; justify-content:center; }
@media (max-width: 560px){
  .vs-res-stats{ grid-template-columns:repeat(2,1fr); }
  .vs-res-card{ padding:18px 14px; }
  .vs-res-btns .vs-btn{ flex:1 1 45%; }
}
`;
