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
    this.onNext = (opt && opt.onNext) || (() => {});
    this.onReview = (opt && opt.onReview) || (() => {});
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
    this.splitEl = h("div", { class: "vs-res-spwrap vs-hide" });
    this.cupEl = h("div", { class: "vs-res-cup vs-hide" });
    /* ★ 間違えた 単語。**数だけでは 学びに ならない。**
       ここは 学ぶ ための 遊びなので、何を 間違えたのかを 出す。 */
    this.missEl = h("div", { class: "vs-res-miss vs-hide" });

    return h("div", { class: "vs-res" },
      h("div", { class: "vs-res-card" },
        h("div", { class: "vs-res-head" }, this.titleEl, this.subEl),
        this.bestEl,
        this.cupEl,
        this.statsEl,
        this.missEl,
        this.splitEl,
        h("div", { class: "vs-res-listwrap" }, this.listEl),
        h("div", { class: "vs-res-btns" },
          this.nextBtn = h("button", {
            class: "vs-btn is-mint vs-hide", type: "button",
            onclick: () => { const n = this._next; this.hide(); if (n) this.onNext(n); }
          }, "次の ラウンドへ"),
          this.reviewBtn = h("button", {
            class: "vs-btn is-mint vs-hide", type: "button",
            onclick: () => { const m = this._missed; this.hide(); if (m && m.length) this.onReview(m); }
          }, "間違えた 単語で もう一度"),
          this.againBtn = h("button", { class: "vs-btn is-mint", type: "button", onclick: () => this.onAgain() }, "もう一度"),
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
    if (d.teams) {
      /* チーム戦は **組の 勝ち負け**を いちばん 大きく 出す */
      const 勝ち = d.teams[0] === d.teams[1] ? -1 : (d.teams[0] > d.teams[1] ? 0 : 1);
      const 名 = ["レッド", "ブルー"];
      this.titleEl.textContent = 勝ち < 0 ? "引き分け"
        : (勝ち === d.myTeam ? "🏆 " + 名[勝ち] + "の 勝ち！" : 名[勝ち] + "の 勝ち");
      this.titleEl.setAttribute("data-rank", 勝ち === d.myTeam ? "1" : "0");
      this.subEl.textContent = d.courseName + " ・ レッド " + d.teams[0] + " — " + d.teams[1] + " ブルー";
      this._teamDone = true;
    } else this._teamDone = false;
    if (!this._teamDone) this.titleEl.textContent = d.eliminated
      ? (rank === 1 ? "🥇 生き残った!" : rank + "位（脱落）")
      : (d.finished
        ? (medal ? medal + " " + rank + "位" : rank + "位")
        : "ゴールできませんでした");
    if (!this._teamDone) {
      this.titleEl.setAttribute("data-rank", String(rank));
      this.subEl.textContent = d.courseName + " ・ " + d.total + "人";
    }

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

    /* ── 勝ち抜き ────────────────────────────────────────────────────
       ★ 「残ったか 落ちたか」を **順位より 先に** 出す。
         勝ち抜きで 知りたいのは 何位かでは なく 「次が あるか」。 */
    this._next = null;
    this.cupEl.textContent = "";
    const cup = d.cup;
    if (cup) {
      this.cupEl.classList.remove("vs-hide");
      const 見出し = cup.last
        ? (cup.meAlive ? "🏆 優勝！" : "ここまで")
        : (cup.meAlive ? "勝ち残り！" : "ここで 敗退");
      this.titleEl.textContent = 見出し;
      this.titleEl.setAttribute("data-rank", cup.meAlive ? "1" : "0");
      this.subEl.textContent = "ラウンド " + cup.round + " / " + cup.rounds +
        "　" + d.courseName + "　" + cup.total + "人 → " + cup.keep + "人";

      this.cupEl.appendChild(h("div", { class: "vs-res-cupbar" },
        ...Array.from({ length: cup.rounds }, (_, i) => h("span", {
          class: "vs-res-cupdot",
          "data-st": i + 1 < cup.round ? "done" : (i + 1 === cup.round ? "now" : "next"),
          text: String(i + 1)
        }))));
      const 名 = (list) => list.map((r) => r.name).join("・") || "—";
      this.cupEl.appendChild(h("div", { class: "vs-res-cuprow" },
        h("span", { class: "vs-res-cuplab", text: cup.last ? "最後まで 残った" : "次へ 進む" }),
        h("span", { class: "vs-res-cupv", text: 名(cup.survivors) })));
      if (cup.out.length) {
        this.cupEl.appendChild(h("div", { class: "vs-res-cuprow", "data-out": "1" },
          h("span", { class: "vs-res-cuplab", text: "ここで 敗退" }),
          h("span", { class: "vs-res-cupv", text: 名(cup.out) })));
      }
      this._next = cup.next || null;
    } else {
      this.cupEl.classList.add("vs-hide");
    }
    if (this.nextBtn) {
      this.nextBtn.classList.toggle("vs-hide", !this._next);
      /* 次が ある ときは 「もう一度」を 引っ込める。
         押すと 勝ち抜きが 1 本目から やり直しに なって 分かりにくい。 */
      if (this.againBtn) this.againBtn.classList.toggle("vs-hide", !!this._next);
    }

    /* ── 間違えた 単語 ───────────────────────────────────────────── */
    this.missEl.textContent = "";
    const ms = d.missed || [];
    if (ms.length) {
      this.missEl.classList.remove("vs-hide");
      this.missEl.appendChild(h("div", { class: "vs-res-splab", text: "間違えた 単語 " + ms.length + " 個" }));
      const box = h("div", { class: "vs-res-misses" });
      for (const m of ms) {
        box.appendChild(h("div", { class: "vs-res-miss1" },
          h("span", { class: "vs-res-mq", text: m.q }),
          h("span", { class: "vs-res-marrow", text: "→" }),
          h("span", { class: "vs-res-ma", text: m.a }),
          m.y ? h("span", { class: "vs-res-my", text: "（えらんだ: " + m.y + "）" }) : null));
      }
      this.missEl.appendChild(box);
    } else {
      this.missEl.classList.add("vs-hide");
    }
    /* ★ **間違えた 単語だけで もう一度 走れる。**
       出して 終わりでは 覚えない。すぐ もう一度 出会える ように する。
       2 個 未満だと 4 択が 作れない ので 出さない。 */
    this._missed = ms;
    if (this.reviewBtn) this.reviewBtn.classList.toggle("vs-hide", ms.length < 2 || !!(d.cup && d.cup.next));

    /* ── 区間の 記録 ────────────────────────────────────────────────
       ★ 「どこで 遅れたか」が 分かるのが 記録の 値打ち。
         合計だけ 出しても 次に 何を 直せば よいか 分からない。
       ★ 前の ベストが 無い ときは **差を 出さない**（0 と 比べると 全部 大きく 遅れて 見える）。 */
    this.splitEl.textContent = "";
    const sp = d.splits || [], bs = d.bestSplits || [];
    if (sp.length) {
      this.splitEl.classList.remove("vs-hide");
      this.splitEl.appendChild(h("div", { class: "vs-res-splab", text: "区間" }));
      const row = h("div", { class: "vs-res-splits" });
      let 前 = 0, 前B = 0;
      for (let i = 0; i < sp.length; i++) {
        const 区間 = sp[i] - 前; 前 = sp[i];
        let 差 = null;
        if (bs.length > i) { 差 = 区間 - (bs[i] - 前B); 前B = bs[i]; }
        const c = h("div", { class: "vs-res-sp" },
          h("span", { class: "vs-res-spn", text: "中間 " + (i + 1) }),
          h("span", { class: "vs-res-spt vs-mono", text: 区間.toFixed(1) + "s" }));
        if (差 !== null) {
          c.appendChild(h("span", {
            class: "vs-res-spd vs-mono",
            "data-good": 差 <= 0 ? "1" : "0",
            text: (差 < 0 ? "-" : "+") + Math.abs(差).toFixed(1)
          }));
        }
        row.appendChild(c);
      }
      /* ゴールまでの 最後の 区間も 出す（ここで 落ちる 人が いちばん 多い） */
      if (d.finished && d.time > 前) {
        row.appendChild(h("div", { class: "vs-res-sp" },
          h("span", { class: "vs-res-spn", text: "ゴールまで" }),
          h("span", { class: "vs-res-spt vs-mono", text: (d.time - 前).toFixed(1) + "s" })));
      }
      this.splitEl.appendChild(row);
    } else {
      this.splitEl.classList.add("vs-hide");
    }

    this.listEl.textContent = "";
    for (const r of (d.standings || [])) {
      const dot = h("i", { class: "vs-res-dot" });
      dot.style.background = beanByIndex(r.colorIndex).hex;
      this.listEl.appendChild(h("li", {
        class: "vs-res-row", "data-me": r.me ? "1" : "0",
        "data-team": r.team === 0 ? "a" : (r.team === 1 ? "b" : "")
      },
        h("span", { class: "vs-res-no vs-mono", text: String(r.rank) }),
        dot,
        h("span", { class: "vs-res-nm", text: r.name }),
        h("span", { class: "vs-res-tm vs-mono",
          text: r.eliminated ? "脱落" : (r.finished ? fmt(r.finishTime) : (Math.round(r.pct * 100) + "%")) })));
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
.vs-res-miss{ margin:8px 0 2px; padding:9px 11px; border-radius:12px;
  border:1px solid rgba(255,138,151,.28); background:rgba(255,138,151,.07); }
.vs-res-misses{ display:flex; flex-direction:column; gap:3px; max-height:120px; overflow-y:auto; }
.vs-res-miss1{ display:flex; align-items:baseline; gap:6px; font-size:12.5px; flex-wrap:wrap; }
.vs-res-mq{ font-weight:800; color:#f3f5ff; }
.vs-res-marrow{ color:rgba(243,245,255,.5); }
.vs-res-ma{ color:#5ae6be; font-weight:700; }
.vs-res-my{ font-size:11px; color:rgba(255,138,151,.9); }

.vs-res-cup{ margin:8px 0 4px; padding:10px 12px; border-radius:12px;
  border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04); }
.vs-res-cupbar{ display:flex; gap:6px; margin-bottom:8px; }
.vs-res-cupdot{ width:24px; height:24px; border-radius:50%; display:inline-flex;
  align-items:center; justify-content:center; font-size:12px; font-weight:800;
  border:1px solid rgba(255,255,255,.16); color:rgba(243,245,255,.5); }
.vs-res-cupdot[data-st="done"]{ background:rgba(90,230,190,.22); color:#5ae6be; border-color:#5ae6be; }
.vs-res-cupdot[data-st="now"]{ background:#5ae6be; color:#0b1020; border-color:#5ae6be; }
.vs-res-cuprow{ display:flex; gap:8px; align-items:baseline; font-size:12px; padding:2px 0; }
.vs-res-cuplab{ flex:0 0 auto; width:86px; color:rgba(243,245,255,.5); }
.vs-res-cupv{ flex:1 1 auto; color:#f3f5ff; }
.vs-res-cuprow[data-out="1"] .vs-res-cupv{ color:rgba(255,138,151,.9); }

.vs-res-spwrap{ margin:10px 0 2px; }
.vs-res-splab{ font-size:11px; font-weight:800; letter-spacing:.05em;
  color:rgba(243,245,255,.60); margin:0 0 5px; }
.vs-res-splits{ display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
.vs-res-sp{ flex:0 0 auto; min-width:74px; padding:6px 9px; border-radius:10px;
  border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04);
  display:flex; flex-direction:column; gap:1px; }
.vs-res-spn{ font-size:10px; color:rgba(243,245,255,.5); }
.vs-res-spt{ font-size:14px; font-weight:800; color:#f3f5ff; }
.vs-res-spd{ font-size:11px; font-weight:800; color:#ff8a97; }
.vs-res-spd[data-good="1"]{ color:#5ae6be; }

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
.vs-res-ss{ font-size:10px; color:rgba(243,245,255,.62); }
.vs-res-listwrap{ max-height:210px; overflow:auto; margin-bottom:16px;
  border-radius:13px; border:1px solid rgba(255,255,255,.10); }
.vs-res-list{ list-style:none; }
.vs-res-row{ display:flex; align-items:center; gap:9px; padding:9px 12px; font-size:13px;
  border-bottom:1px solid rgba(255,255,255,.06); }
.vs-res-row:last-child{ border-bottom:0; }
.vs-res-row[data-me="1"]{ background:rgba(255,176,32,.14); font-weight:800; }
.vs-res-row[data-team="a"]{ border-left:3px solid #ff5d6e; }
.vs-res-row[data-team="b"]{ border-left:3px solid #4d9dff; }
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
