/* ══════════════════════════════════════════════════════════════════════════
   結果。

   要件どおり: 順位 / 時間 / クイズ正答率 / XP / 自己ベスト
   ＋ もう一度 / ロビーへ / VocabuQuiz へ戻る。

   ★ 自己ベストは **更新した ときだけ** 目立たせる。
     毎回 出すと 何も 伝わらない。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE, beanByIndex } from "./theme.js";
import { growthOf, addXP, localXP, medalOf, nextMedal, targetsOf, MEDALS, touchStreak } from "../data/world.js";

const MEDAL = ["🥇", "🥈", "🥉"];

export class ResultPanel {
  constructor(opt) {
    this.onAgain = (opt && opt.onAgain) || (() => {});
    this.onNext = (opt && opt.onNext) || (() => {});
    this.onReview = (opt && opt.onReview) || (() => {});
    this.onLobby = (opt && opt.onLobby) || (() => {});
    this.onExit = (opt && opt.onExit) || (() => {});
    /* 音は 使う 側から 渡す（result は 音の 作りを 知らない）。 */
    this.audio = (opt && opt.audio) || null;
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
    /* 種の 育ち（世界観）。積み上がりが 見える 場所。 */
    this.growEl = h("div", { class: "vs-res-grow vs-hide" });
    /* コースに 対する 自分（記章） */
    this.medEl = h("div", { class: "vs-res-med vs-hide" });
    /* ★ 間違えた 単語。**数だけでは 学びに ならない。**
       ここは 学ぶ ための 遊びなので、何を 間違えたのかを 出す。 */
    this.missEl = h("div", { class: "vs-res-miss vs-hide" });
    /* サーバからの ひとこと（あとから 届く）。 */
    this.noteEl = h("p", { class: "vs-res-note vs-hide", role: "status" });

    return h("div", { class: "vs-res" },
      h("div", { class: "vs-res-card" },
        h("div", { class: "vs-res-head" }, this.titleEl, this.subEl),
        this.bestEl,
        this.cupEl,
        this.statsEl,
        this.medEl,
        this.growEl,
        this.noteEl,
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

  /* 濃い ボタンを 1 つに 決める。上から 順に 「いま いちばん したい こと」。 */
  _pickMain() {
    const 出 = (b) => b && !b.classList.contains("vs-hide");
    const 順 = [this.nextBtn, this.reviewBtn, this.againBtn];
    let 主 = null;
    for (const b of 順) if (!主 && 出(b)) 主 = b;
    for (const b of 順) {
      if (!b) continue;
      const 濃 = (b === 主);
      b.classList.toggle("is-mint", 濃);
      b.classList.toggle("is-ghost", !濃);
    }
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

    /* ══ 種の 育ち（2026-08-31・訴え「世界観」）══════════════════════
       ★ 1 試合の XP だけ 出しても 「で？」で 終わる。
         **積み上がって いる ことが 見える**と もう 1 本 走りたく なる。
       ★ 段が 上がった ときだけ 大きく 出す。毎回 祝うと 飽きる。 */
    {
      const 前 = localXP();
      const 後 = addXP(d.xp || 0);
      const g0 = growthOf(前), g1 = growthOf(後);
      this.growEl.textContent = "";
      this.growEl.classList.remove("vs-hide");
      /* ★ れんぞく（2026-08-31）。**1 試合 終わる たびに 1 回だけ** 進める。
         ここに 置くのは、結果の 板が 出る＝1 試合 終わった、が 確実な ため。 */
      const rn = touchStreak();
      const 上がった = g1.index > g0.index;
      /* 育った ときだけ 音を 出す。毎回 鳴らすと すぐ うるさく なる。 */
      if (上がった && this.audio && this.audio.grow) { try { this.audio.grow(); } catch (e) {} }
      this.growEl.setAttribute("data-up", 上がった ? "1" : "0");
      this.growEl.appendChild(h("div", { class: "vs-res-growtop" },
        h("span", { class: "vs-res-growl", text: 上がった ? "そだった！" : "たねの そだち" }),
        h("b", { class: "vs-res-growname", text: g1.stage.name }),
        h("span", { class: "vs-res-growxp vs-mono", text: 後 + " XP" })));
      const bar = h("div", { class: "vs-res-growbar" });
      bar.appendChild(h("i", { style: "width:" + Math.round(g1.ratio * 100) + "%" }));
      this.growEl.appendChild(bar);
      this.growEl.appendChild(h("p", { class: "vs-res-growlore",
        text: 上がった ? g1.stage.lore
          : (g1.next ? "つぎの 「" + g1.next.name + "」まで あと " + g1.toNext + " XP" : g1.stage.lore) }));
      /* れんぞく。切りたく ない ものを 1 つ 出す。 */
      if (rn.n > 0) {
        this.growEl.appendChild(h("p", { class: "vs-res-streak", "data-up": rn.伸びた ? "1" : "0" },
          h("b", { text: "れんぞく " + rn.n + " 日" }),
          h("span", { text: rn.伸びた
            ? (rn.初日 ? "　きょうから" : "　きのうから つづいています")
            : "　きょうは もう 走りました" }),
          rn.best > rn.n ? h("span", { class: "vs-res-streak-b", text: "　さいこう " + rn.best + " 日" }) : null));
      }
    }

    /* ══ 記章（2026-08-31）════════════════════════════════════════════
       ★ 「2 位」だけでは 上手い 人しか 嬉しくない。
         **コースに 対する 自分**を 出すと、ひとりでも 前へ 進める。
       ★ 取れて いない ときは 「あと 何秒」を 出す。数字が あると 次が 来る。 */
    this.medEl.textContent = "";
    if (d.courseDef && d.finished) {
      const m = medalOf(d.courseDef, d.time);
      const nx = nextMedal(d.courseDef, d.time);
      this.medEl.classList.remove("vs-hide");
      this.medEl.setAttribute("data-m", m || "none");
      const 名 = m ? (MEDALS.filter((x) => x.key === m)[0] || {}).name : "";
      /* 記章の 音。**初めて 取った ときだけ**（毎回 鳴らすと 意味が 薄れる）。 */
      if (m && d.medalIsNew && this.audio && this.audio.medal) {
        try { this.audio.medal(m === "gold" ? 3 : (m === "silver" ? 2 : 1)); } catch (e) {}
      }
      this.medEl.appendChild(h("div", { class: "vs-res-medtop" },
        h("i", { class: "vs-res-medal", "data-m": m || "none" }),
        h("b", { class: "vs-res-medname", text: m ? 名 + " 記章" : "記章まで あと少し" }),
        nx ? h("span", { class: "vs-res-medgap vs-mono",
          /* ★ 「次の 金 まで −4.3 秒」は **足すのか 引くのか 読めない**。
             タイムの 話なので 「縮める」と 書く（2026-08-31）。 */
          text: nx.name + "まで あと " + nx.diff.toFixed(1) + " 秒 縮める" }) : null));
      const g = targetsOf(d.courseDef);
      const row = h("div", { class: "vs-res-medrow" });
      for (const mm of MEDALS.slice().reverse()) {
        const 済 = m === "gold" ? true : m === "silver" ? (mm.key !== "gold")
          : m === "bronze" ? (mm.key === "bronze") : false;
        row.appendChild(h("span", { class: "vs-res-medt", "data-m": mm.key, "data-got": 済 ? "1" : "0" },
          h("i", null), h("span", { class: "vs-mono", text: fmt(g[mm.key]) })));
      }
      this.medEl.appendChild(row);
    } else this.medEl.classList.add("vs-hide");

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
    this.note("");
    this._missed = ms;
    if (this.reviewBtn) this.reviewBtn.classList.toggle("vs-hide", ms.length < 2 || !!(d.cup && d.cup.next));
    /* ★ 濃い ボタンは **1 つだけ**（2026-08-31）。
       直す前は 「間違えた 単語で もう一度」と 「もう一度」が
       どちらも 濃い 緑で 並び、どちらを 押せば いいのか 分からなかった
       （実写で 確認）。この 遊びは 覚える ための ものなので、
       間違えた 単語が ある ときは **そちらを 主**に する。
       次の ラウンドが ある ときは それが 主。 */
    this._pickMain();

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

  /** あとから 届いた ひとこと。 */
  note(text) {
    if (!this.noteEl) return;
    this.noteEl.textContent = String(text || "");
    this.noteEl.classList.toggle("vs-hide", !text);
  }

  hide() { this.el.removeAttribute("data-on"); this.note(""); }
}

function fmt(s) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
}

export const RESULT_CSS = `
/* ── 記章 ─────────────────────────────────────────────────────────── */
.vs-res-med{ margin:10px 0 0; padding:11px 13px; border-radius:var(--vs-r-md);
  background:var(--vs-surface-2); border:1px solid var(--vs-line); }
.vs-res-med[data-m="gold"]{ border-color:#e8c05a; background:rgba(232,192,90,.12); }
.vs-res-med[data-m="silver"]{ border-color:#b9c0cf; }
.vs-res-med[data-m="bronze"]{ border-color:#c58a5a; }
.vs-res-medtop{ display:flex; align-items:center; gap:9px; }
.vs-res-medal{ width:16px; height:16px; border-radius:50%; background:var(--vs-surface-3);
  box-shadow:inset 0 -3px 5px rgba(0,0,0,.30); flex:0 0 auto; }
.vs-res-medal[data-m="bronze"]{ background:#c58a5a; }
.vs-res-medal[data-m="silver"]{ background:#b9c0cf; }
.vs-res-medal[data-m="gold"]{ background:#e8c05a; box-shadow:inset 0 -3px 5px rgba(0,0,0,.30), 0 0 12px rgba(232,192,90,.8); }
.vs-res-medname{ font-size:15px; font-weight:750; }
.vs-res-medgap{ margin-left:auto; font-size:11.5px; color:var(--vs-ink-sub); }
.vs-res-medrow{ display:flex; gap:12px; margin-top:8px; }
.vs-res-medt{ display:inline-flex; align-items:center; gap:5px; font-size:11px; opacity:.42; }
.vs-res-medt[data-got="1"]{ opacity:1; }
.vs-res-medt > i{ width:9px; height:9px; border-radius:50%; }
.vs-res-medt[data-m="bronze"] > i{ background:#c58a5a; }
.vs-res-medt[data-m="silver"] > i{ background:#b9c0cf; }
.vs-res-medt[data-m="gold"] > i{ background:#e8c05a; }

/* ── 種の 育ち ─────────────────────────────────────────────────────── */
.vs-res-grow{ margin:10px 0 2px; padding:11px 13px; border-radius:var(--vs-r-md);
  background:var(--vs-surface-2); border:1px solid var(--vs-line); }
.vs-res-grow[data-up="1"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); }
.vs-res-growtop{ display:flex; align-items:baseline; gap:8px; }
.vs-res-growl{ font-size:11px; font-weight:650; letter-spacing:.08em; color:var(--vs-ink-sub); }
.vs-res-grow[data-up="1"] .vs-res-growl{ color:var(--vs-accent-text); }
.vs-res-growname{ font-size:17px; font-weight:800; }
.vs-res-growxp{ margin-left:auto; font-size:11.5px; color:var(--vs-ink-sub); }
.vs-res-growbar{ position:relative; height:6px; margin:8px 0 6px; border-radius:var(--vs-r-full);
  background:var(--vs-surface-3); overflow:hidden; }
.vs-res-growbar > i{ position:absolute; left:0; top:0; height:100%; border-radius:var(--vs-r-full);
  background:var(--vs-accent); transition:width .5s cubic-bezier(.2,1,.3,1); }
.vs-res-growlore{ font-size:11.5px; line-height:1.7; color:var(--vs-ink-sub); }
.vs-res-streak{ margin-top:6px; font-size:12px; color:var(--vs-ink); }
.vs-res-streak[data-up="1"] b{ color:var(--vs-accent-text); }
.vs-res-streak span{ font-size:11px; color:var(--vs-ink-sub); }
.vs-res-streak-b{ opacity:.8; }

.vs-res-note{ margin:6px 0 0; padding:7px 10px; border-radius:var(--vs-r-sm); font-size:11.5px;
  line-height:1.7; color:var(--vs-gold);
  background:var(--vs-gold-bg); border:1px solid var(--vs-gold); }

.vs-res-miss{ margin:8px 0 2px; padding:9px 11px; border-radius:var(--vs-r-md);
  border:1px solid var(--vs-danger); background:var(--vs-danger-bg); }
.vs-res-misses{ display:flex; flex-direction:column; gap:3px; max-height:120px; overflow-y:auto; }
.vs-res-miss1{ display:flex; align-items:baseline; gap:6px; font-size:12.5px; flex-wrap:wrap; }
.vs-res-mq{ font-weight:650; color:var(--vs-ink); }
.vs-res-marrow{ color:var(--vs-ink-sub); }
.vs-res-ma{ color:var(--vs-good-text); font-weight:650; }
.vs-res-my{ font-size:11px; color:var(--vs-danger-text); }

.vs-res-cup{ margin:8px 0 4px; padding:10px 12px; border-radius:var(--vs-r-md);
  border:1px solid var(--vs-line); background:var(--vs-sunken); }
.vs-res-cupbar{ display:flex; gap:6px; margin-bottom:8px; }
.vs-res-cupdot{ width:24px; height:24px; border-radius:50%; display:inline-flex;
  align-items:center; justify-content:center; font-size:12px; font-weight:650;
  border:1px solid var(--vs-line); color:var(--vs-ink-sub); }
.vs-res-cupdot[data-st="done"]{ background:var(--vs-good-bg); color:var(--vs-good-text); border-color:var(--vs-good); }
.vs-res-cupdot[data-st="now"]{ background:var(--vs-accent); color:var(--vs-accent-ink); border-color:var(--vs-accent); }
.vs-res-cuprow{ display:flex; gap:8px; align-items:baseline; font-size:12px; padding:2px 0; }
.vs-res-cuplab{ flex:0 0 auto; width:86px; color:var(--vs-ink-sub); }
.vs-res-cupv{ flex:1 1 auto; color:var(--vs-ink); }
.vs-res-cuprow[data-out="1"] .vs-res-cupv{ color:var(--vs-danger-text); }

.vs-res-spwrap{ margin:10px 0 2px; }
.vs-res-splab{ font-size:11px; font-weight:650; letter-spacing:.05em;
  color:var(--vs-ink-sub); margin:0 0 5px; }
.vs-res-splits{ display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
.vs-res-sp{ flex:0 0 auto; min-width:74px; padding:6px 9px; border-radius:var(--vs-r-sm);
  border:1px solid var(--vs-line); background:var(--vs-sunken);
  display:flex; flex-direction:column; gap:1px; }
.vs-res-spn{ font-size:10px; color:var(--vs-ink-sub); }
.vs-res-spt{ font-size:14px; font-weight:650; color:var(--vs-ink); }
.vs-res-spd{ font-size:11px; font-weight:650; color:var(--vs-danger-text); }
.vs-res-spd[data-good="1"]{ color:var(--vs-good-text); }

.vs-res{ position:absolute; inset:0; z-index:9; display:none;
  align-items:center; justify-content:center;
  background:var(--vs-surface);
  padding: calc(16px + var(--vs-safe-t)) 16px calc(16px + var(--vs-safe-b)); }
.vs-res[data-on="1"]{ display:flex; animation: vsFade .28s ease both; }
@keyframes vsFade{ from{opacity:0} to{opacity:1} }
.vs-res-card{
  width:min(620px,100%); max-height:100%; overflow:auto;
  background:var(--vs-surface); border:1px solid var(--vs-line);
  border-radius:var(--vs-r-xl); padding:24px 22px;
  box-shadow:var(--vs-sh-modal);
  animation: vsPop .34s cubic-bezier(.2,1.1,.3,1) both;
}
@keyframes vsPop{ from{ transform:translateY(18px) scale(.97); opacity:0 } to{ transform:none; opacity:1 } }
.vs-res-head{ text-align:center; margin-bottom:14px; }
.vs-res-title{ font-size:clamp(28px,6vw,44px); font-weight:750; letter-spacing:-.002em; }
.vs-res-title[data-rank="1"]{ color:${PALETTE.amber}; }
.vs-res-sub{ font-size:13px; color:var(--vs-ink-sub); margin-top:4px; }
.vs-res-best{
  margin:0 auto 14px; width:fit-content; padding:7px 16px; border-radius:var(--vs-r-full);
  background:var(--vs-accent-soft);
  border:1px solid var(--vs-accent); font-size:13px; font-weight:650; color:var(--vs-accent-text);
}
.vs-res-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:16px; }
.vs-res-stat{ background:var(--vs-surface-2); border:1px solid var(--vs-line);
  border-radius:var(--vs-r-md); padding:10px 8px; text-align:center; display:flex; flex-direction:column; gap:2px; }
.vs-res-sl{ font-size:10.5px; color:var(--vs-ink-sub); font-weight:700; letter-spacing:.05em; }
.vs-res-sv{ font-size:19px; font-weight:750; }
.vs-res-ss{ font-size:10px; color:var(--vs-ink-sub); }
.vs-res-listwrap{ max-height:210px; overflow:auto; margin-bottom:16px;
  border-radius:var(--vs-r-md); border:1px solid var(--vs-line); }
.vs-res-list{ list-style:none; }
.vs-res-row{ display:flex; align-items:center; gap:9px; padding:9px 12px; font-size:13px;
  border-bottom:1px solid var(--vs-line-subtle); }
.vs-res-row:last-child{ border-bottom:0; }
.vs-res-row[data-me="1"]{ background:var(--vs-accent-soft); font-weight:650; }
.vs-res-row[data-team="a"]{ border-left:3px solid var(--vq-chart-3, #e0628d); }
.vs-res-row[data-team="b"]{ border-left:3px solid var(--vq-chart-6, #6389f4); }
.vs-res-no{ width:18px; text-align:right; color:var(--vs-ink-sub); }
.vs-res-dot{ width:10px; height:10px; border-radius:50%; }
.vs-res-nm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-res-tm{ color:var(--vs-ink-sub); font-size:12px; }
.vs-res-btns{ display:flex; gap:9px; flex-wrap:wrap; justify-content:center; }
@media (max-width: 560px){
  .vs-res-stats{ grid-template-columns:repeat(2,1fr); }
  .vs-res-card{ padding:18px 14px; }
  .vs-res-btns .vs-btn{ flex:1 1 45%; }
  /* ★ 縦の スマホでも **押す ところを 貼り付ける**（2026-08-31）。
     成績・記章・育ち・間違えた 単語・一覧 と 縦に 長い ので、
     「もう一度」は 画面の 下に 隠れて いた。走る たびに 指で 探すのは 良くない。
     横向き（高さ 520px 未満）には 前から 入れて いたのに 縦を 忘れて いた。 */
  .vs-res-btns{ position:sticky; bottom:-18px; margin-top:10px;
    padding:10px 0 6px; background:var(--vs-surface);
    box-shadow:0 -12px 16px -10px var(--vs-surface); }
}
/* ★ 横向きの スマホ（高さ 390px）は **順位しか 見えなかった**
   （実写で 確認）。中は 流せるが、結果を 見るのに 何度も 指を 動かすのは 良くない。
   詰めて、成績と 記章と 育ちが **一目で 入る**ように する。 */
@media (max-height: 520px){
  .vs-res{ padding: calc(8px + var(--vs-safe-t)) 12px calc(8px + var(--vs-safe-b)); }
  .vs-res-card{ width:min(860px,100%); padding:12px 14px; }
  .vs-res-head{ margin-bottom:8px; }
  .vs-res-title{ font-size:24px; }
  .vs-res-sub{ font-size:11.5px; }
  .vs-res-stats{ grid-template-columns:repeat(4,1fr); gap:6px; }
  .vs-res-stat{ padding:7px 8px; }
  .vs-res-sv{ font-size:17px; }
  .vs-res-med, .vs-res-grow{ margin:7px 0 0; padding:8px 11px; }
  .vs-res-medrow, .vs-res-growbar{ margin-top:5px; }
  .vs-res-medname, .vs-res-growname{ font-size:14px; }
  .vs-res-listwrap{ max-height:96px; }
  /* ★ 押す ところは **必ず 見えている**。
     流さないと 届かない ボタンは 「無い」のと 同じ。 */
  .vs-res-btns{ position:sticky; bottom:-12px; margin-top:9px;
    padding:8px 0 4px; background:var(--vs-surface);
    box-shadow:0 -10px 14px -8px var(--vs-surface); }
  .vs-res-btns .vs-btn{ --_h:34px; font-size:12.5px; }
  .vs-res-best{ margin:6px auto; }
}
`;
