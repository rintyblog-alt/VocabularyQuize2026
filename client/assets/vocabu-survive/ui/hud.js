/* ══════════════════════════════════════════════════════════════════════════
   遊んでいる 間に 出る もの。

   要件どおり: 時計・順位・人・コース名・中間地点
   ＋ 合図（3・2・1・GO）と、門の 前の 予告。

   決めごと:
     ・**毎フレーム 文字を 書き換えない。** 変わった ときだけ 書く。
       60Hz で textContent を 触ると それだけで 描きが 詰まる。
     ・順位表は 8 行 固定。作り直さず 中身だけ 差し替える。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "./shell.js";
import { PALETTE, beanByIndex } from "./theme.js";

/* あそびかたの 印。**絵で 分かる**ように する。形は 3 つだけ。 */
function svgIcon(kind) {
  const box = { viewBox: "0 0 24 24", width: "26", height: "26", "aria-hidden": "true" };
  const line = (d, w) => svg("path", { d, fill: "none", stroke: "currentColor",
    "stroke-width": String(w || 2), "stroke-linecap": "round", "stroke-linejoin": "round" });
  if (kind === "stick") {
    return svg("svg", box,
      svg("circle", { cx: "12", cy: "12", r: "8.5", fill: "none", stroke: "currentColor",
        "stroke-width": "1.6", "stroke-dasharray": "3 3" }),
      svg("circle", { cx: "14.5", cy: "10", r: "3.4", fill: "currentColor" }));
  }
  if (kind === "jump") {
    return svg("svg", box, line("M12 20V6"), line("M7 11l5-5 5 5"), line("M5 21h14", 2.2));
  }
  /* ★ 「走る」の 印を 忘れて いて、机の上では **門の 印が 出ていた**
     （実写で 気づいた）。4 つの キーの 形に する。 */
  if (kind === "wasd") {
    const k = (x, y) => svg("rect", { x: String(x), y: String(y), width: "6", height: "6", rx: "1.6",
      fill: "none", stroke: "currentColor", "stroke-width": "1.7" });
    return svg("svg", box, k(9, 3), k(2.5, 11), k(9, 11), k(15.5, 11));
  }
  /* 門 */
  return svg("svg", box, line("M4 8h16", 2.2), line("M6 8v12"), line("M18 8v12"),
    line("M3 6h18", 2.2), line("M9.5 13.5h5"));
}

/* ── 操作の 説明 ─────────────────────────────────────────────────────
   ★ **初めて 遊ぶ 人は 何を 押せば よいか 分からない。**
     3D の 遊びは 走り方が 分からないだけで 「壊れている」に 見える。
     最初の 1 回だけ 出し、以後は ロビーの ？ から 見られる ように する。 */
const HELP_KEY = "vq.survive.helpseen.v1";

/* 遊び方の 見せ名。**レースは 出さない**（ふつうの ときに 札は 要らない）。 */
const MODE_LABEL = {
  survival: "サバイバル",
  quizrush: "クイズラッシュ",
  timeattack: "タイムアタック",
  team: "チーム戦",
  cup: "勝ち抜き"
};

export class HelpCard {
  constructor(onClose) {
    this.onClose = onClose || (() => {});
    this.el = this._build();
  }
  _row(k, t) {
    const keys = h("span", { class: "vs-help-keys" });
    for (const x of k) keys.appendChild(h("kbd", { class: "vs-help-k", text: x }));
    return h("div", { class: "vs-help-row" }, keys, h("span", { class: "vs-help-t", text: t }));
  }
  /* 大きな 3 つ。**絵で 分かる**ように 印を 付ける。 */
  _big(印, 見出し, 中身) {
    return h("div", { class: "vs-help-big" },
      h("span", { class: "vs-help-ic", "aria-hidden": "true" }, 印),
      h("div", { class: "vs-help-bt" },
        h("b", { text: 見出し }),
        h("span", { text: 中身 })));
  }
  _build() {
    /* ★ 作り直した（2026-08-31・訴え「細かい UI や UX も 含めて」）。
       直す前は **3 列 ＋ 20 行の 表**だった。初めての 人が いちばん
       読みたくない ものを、いちばん 最初に 出していた（実写で 確認）。
       ★ 決めごと:
         ・**その 端末の 操作だけ** 出す（指の 人に W A S D は 要らない）
         ・大きく 3 つ。走る・跳ぶ・答える。それ以外は 遊べば 分かる
         ・世界の 一行を 添える。ここが 何の 遊びかを 先に 言う
         ・くわしい 表は 「もっと」で 開く（消しては いない） */
    const 触 = (() => {
      try { return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window; }
      catch (e) { return false; }
    })();

    const 走 = 触
      ? this._big(svgIcon("stick"), "走る", "左下を なぞる（押した 場所に 棒が 出ます）")
      : this._big(svgIcon("wasd"), "走る", "W A S D ／ 左の 棒（ゲームパッド）");
    const 跳 = 触
      ? this._big(svgIcon("jump"), "跳ぶ", "右下の 大きい ボタン。長く 押すと 高く")
      : this._big(svgIcon("jump"), "跳ぶ", "Space。長く 押すと 高く（Shift で 飛び込み）");
    const 答 = this._big(svgIcon("gate"), "答える",
      触 ? "門の 前で 札が 出ます。走りながら 押せます"
         : "門の 前で 札が 出ます。1〜4 の キーでも 選べます");

    /* くわしい 表（たたんで おく）。消すと 「ゲームパッドが 使える」
       ことが どこにも 書いて いない 状態に なる。 */
    const 机 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "キーボード / マウス / ゲームパッド" }),
      this._row(["W", "A", "S", "D"], "走る"),
      this._row(["Space"], "跳ぶ（長く押すと 高く）"),
      this._row(["Shift"], "飛び込み（前へ 突っ込む）"),
      this._row(["Q", "E"], "カメラを 回す"),
      this._row(["ドラッグ"], "カメラを 回す"),
      this._row(["1", "2", "3", "4"], "クイズに 答える"),
      this._row(["左の 棒"], "走る（ゲームパッド）"),
      this._row(["A", "B"], "跳ぶ・飛び込み（ゲームパッド）"),
      this._row(["右の 棒"], "カメラを 回す（ゲームパッド）"));
    const 指 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "スマホ / タブレット" }),
      this._row(["左下"], "押した 場所に 棒が 出る → 走る"),
      this._row(["右下 ⬆"], "跳ぶ"),
      this._row(["右下 ↩"], "飛び込み"),
      this._row(["なぞる"], "カメラを 回す"),
      this._row(["札を 押す"], "クイズに 答える"));
    const 決 = h("div", { class: "vs-help-col" },
      h("h4", { class: "vs-help-h", text: "決まりごと" }),
      h("p", { class: "vs-help-p", text: "正解すると 少しの 間 速くなり、外すと 少し 遅くなります。" }),
      h("p", { class: "vs-help-p", text: "落ちても 中間地点から やり直せます（サバイバルは 3 回まで）。" }),
      h("p", { class: "vs-help-p", text: "門は 走りながら 答えられます。止まりません。" }));

    return h("div", { class: "vs-help", role: "dialog", "aria-label": "あそびかた" },
      h("div", { class: "vs-help-card" },
        h("p", { class: "vs-help-lead", text: "ことばの 種を 運んで、大樹まで。" }),
        h("h3", { class: "vs-help-title", text: "あそびかた" }),
        h("div", { class: "vs-help-bigs" }, 走, 跳, 答),
        h("p", { class: "vs-help-key1", text: "ことばの 門を 通らないと 先へ 進めません。" }),
        h("details", { class: "vs-help-more" },
          h("summary", { text: "くわしい 操作" }),
          h("div", { class: "vs-help-grid" }, 机, 指, 決)),
        h("button", {
          class: "vs-btn vs-help-go", type: "button",
          onclick: () => this.hide()
        }, "はじめる")));
  }
  show() { this.el.setAttribute("data-on", "1"); this.open = true; }
  hide() {
    this.el.removeAttribute("data-on");
    this.open = false;
    try { localStorage.setItem(HELP_KEY, "1"); } catch (e) {}
    try { this.onClose(); } catch (e) {}
  }
  static seen() {
    try { return localStorage.getItem(HELP_KEY) === "1"; } catch (e) { return false; }
  }
}

export class HUD {
  constructor() {
    this._last = Object.create(null);
    this.rows = [];
    this.el = this._build();
  }

  _build() {
    this.timeEl = h("span", { class: "vs-hud-time vs-mono", text: "0:00" });
    this.rankNum = h("span", { class: "vs-hud-rank-n vs-mono", text: "–" });
    this.rankOf = h("span", { class: "vs-hud-rank-of", text: "/ –" });
    this.courseEl = h("span", { class: "vs-hud-course", text: "" });
    this.cpEl = h("span", { class: "vs-hud-cp", text: "" });
    this.progFill = h("i", { class: "vs-hud-progfill" });
    this.progMe = h("i", { class: "vs-hud-progme" });

    this.list = h("ol", { class: "vs-hud-list", "aria-label": "順位" });
    for (let i = 0; i < 8; i++) {
      const dot = h("i", { class: "vs-hud-dot" });
      const nm = h("span", { class: "vs-hud-nm" });
      const pc = h("span", { class: "vs-hud-pc vs-mono" });
      const li = h("li", { class: "vs-hud-row" }, h("span", { class: "vs-hud-no vs-mono" }), dot, nm, pc);
      li.style.display = "none";
      this.rows.push({ li, dot, nm, pc, no: li.firstChild });
      this.list.appendChild(li);
    }

    /* ★ 遊び方の 札 と 遊び方ごとの 計器（2026-08-31）。
       サバイバル＝残機、クイズラッシュ＝通った 門。
       レース／タイムアタックでは **出さない**（要らない ものは 置かない）。 */
    this.modeEl = h("span", { class: "vs-hud-mode vs-hide" });
    this.meterEl = h("div", { class: "vs-hud-meter vs-hide", role: "status" });
    this.meterIcon = h("span", { class: "vs-hud-mi", "aria-hidden": "true" });
    this.meterText = h("span", { class: "vs-hud-mt" });
    this.meterEl.appendChild(this.meterIcon);
    this.meterEl.appendChild(this.meterText);

    /* 組（チーム戦）の 点。ふだんは 出さない。 */
    this.teamEl = h("div", { class: "vs-hud-team vs-hide", role: "status" });
    this.teamA = h("span", { class: "vs-hud-tv vs-mono" });
    this.teamB = h("span", { class: "vs-hud-tv vs-mono" });
    this.teamEl.appendChild(h("span", { class: "vs-hud-tn", text: "レッド" }));
    this.teamEl.appendChild(this.teamA);
    this.teamEl.appendChild(h("span", { class: "vs-hud-td", text: "—" }));
    this.teamEl.appendChild(this.teamB);
    this.teamEl.appendChild(h("span", { class: "vs-hud-tn is-b", text: "ブルー" }));

    this.bigEl = h("div", { class: "vs-hud-big", "aria-live": "assertive" });
    this.toastEl = h("div", { class: "vs-hud-toast" });
    /* ══ ★ 出来事の 記録（2026-09-01・訴え）════════════════════════════
       訴え「ログを PC なら 左下に 表示して ほしい。落ちたとか、ゴールしたとか、
             チェックポイント 追加したとか なら ね」

       いま 出来事は toast（2.2 秒で 消える 帯）でしか 出て いない。
       目を 離した 隙に 誰が 落ちたのか・誰が ゴールしたのかが **残らない**。
       ★ 消えない 記録を **左下**に 積む。新しいものが 下。
       ★ 出すのは **PC だけ**。指で 遊ぶ ときは 左下は 走る 棒の 場所なので
         重ねると 押せなく なる（過去に 観戦の 帯で 同じ 失敗を している）。 */
    this.logEl = h("ol", { class: "vs-hud-log", "aria-label": "できごと", "aria-live": "polite" });
    /* ゴーストとの 差。**時間**で 出す（「あと 何 m」より 分かりやすい）。 */
    this.ghostEl = h("div", { class: "vs-hud-ghost vs-hide vs-mono" });

    /* ── 観戦の 帯（脱落した あと）──────────────────────────────────
       ★ **「結果を 見る」を 必ず 出す。** 見たくない 人を 閉じ込めない。 */
    this.specName = h("b", { class: "vs-spec-nm" });
    this.specPrev = h("button", { class: "vs-spec-b", type: "button", "aria-label": "前の 人" }, "◀");
    this.specNext = h("button", { class: "vs-spec-b", type: "button", "aria-label": "次の 人" }, "▶");
    this.specEnd = h("button", { class: "vs-spec-e", type: "button" }, "結果を 見る");
    this.specEl = h("div", { class: "vs-spec vs-hide", role: "status" },
      h("span", { class: "vs-spec-l", text: "観戦中" }),
      this.specPrev, this.specName, this.specNext, this.specEnd);

    /* ★ 置き方を 変えた（2026-08-31・訴え「モバイルの 最適化」）。
       前は 時計の 下に コース名、その 下に 進みの 帯、右上から 順位表 が
       降りてきて、390px の 縦では **3 つが 重なっていた**（実写で 確認）。
         ① 進みの 帯を **画面の いちばん 上**へ（端から 端まで の 細い 線）
         ② 時計・仕組みの ボタン・順位 を **同じ 1 行**に
         ③ コース名と 中間は その 下の 1 行（順位表の 左端まで で 切る）
       これで どの 幅でも 重ならない。 */
    this.topEl = h("div", { class: "vs-hud-top" },
      h("div", { class: "vs-hud-timebox" }, this.timeEl),
      h("div", { class: "vs-hud-rank" }, this.rankNum, this.rankOf));
    this.metaEl = h("div", { class: "vs-hud-meta" }, this.modeEl, this.courseEl, this.cpEl);
    /* ★ 速さの 線（2026-08-31・訴え「グラフィック」）。
       走っている 手ざわりが 弱かった。画面の 端から 中心へ 走る 線を
       速さに 合わせて 出す。**立体では 描かない**（板 1 枚で 済むので
       描き回数も 面の数も 増えない）。 */
    this.rushEl = h("div", { class: "vs-hud-rush", "aria-hidden": "true" });

    return h("div", { class: "vs-hud" },
      this.rushEl,
      h("div", { class: "vs-hud-prog" }, this.progFill, this.progMe),
      this.topEl,
      this.meterEl,
      this.metaEl,
      this.ghostEl,
      this.specEl,
      this.teamEl,
      this.list,
      this.logEl,
      this.bigEl,
      this.toastEl
    );
  }

  setCourse(name, tier) {
    if (this._last.course === name) return;
    this._last.course = name;
    this.courseEl.textContent = name;
  }

  /** 秒 → 0:00.0 */
  _fmt(s) {
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
  }

  update(state) {
    /* 速さの 線。0.02 きざみで しか 触らない（毎コマ 書き換えると 重い）。 */
    if (this.rushEl) {
      const k = Math.max(0, Math.min(1, state.rush || 0));
      const q = Math.round(k * 50) / 50;
      if (q !== this._last.rush) {
        this._last.rush = q;
        this.rushEl.style.opacity = String(q * 0.38);
        this.rushEl.setAttribute("data-on", q > 0.02 ? "1" : "0");
      }
    }

    /* 時計。
       ★ クイズラッシュだけ **減っていく**（100 秒で 打ち切る 遊びなので、
         増える 数字を 出しても 何秒 残って いるか 分からない）。 */
    const 減 = state.left !== null && state.left !== undefined;
    const t = this._fmt(Math.max(0, 減 ? state.left : state.time));
    if (t !== this._last.t) { this._last.t = t; this.timeEl.textContent = t; }
    const 急 = 減 && state.left <= 10 ? "1" : "0";
    if (急 !== this._last.hurry) { this._last.hurry = 急; this.timeEl.setAttribute("data-hurry", 急); }

    /* 遊び方の 札。コース名の 前に 置く。 */
    const md = state.mode || "race";
    const mk = md + "|" + (state.cup || "");
    if (mk !== this._last.mode) {
      this._last.mode = mk;
      const 名 = (MODE_LABEL[md] || "") + (state.cup ? " " + state.cup : "");
      this.modeEl.textContent = 名;
      this.modeEl.classList.toggle("vs-hide", !名);
      this.meterEl.setAttribute("data-mode", md);
      this._meterKind = "";      /* 中身を 作り直させる */
      this._last.meter = undefined;
    }

    /* 遊び方ごとの 計器（残機 / 通った 門）。 */
    if (state.lives !== null && state.lives !== undefined) {
      this._meter("lives", state.lives, state.maxLives || 3);
      const mt = "残り " + (state.alive || 0) + " 人";
      if (mt !== this._last.meter) { this._last.meter = mt; this.meterText.textContent = mt; }
      if (this.meterEl.classList.contains("vs-hide")) this.meterEl.classList.remove("vs-hide");
    } else if (md === "quizrush") {
      this._meter("gate");
      const mt = "門 " + (state.correct | 0);
      if (mt !== this._last.meter) { this._last.meter = mt; this.meterText.textContent = mt; }
      if (this.meterEl.classList.contains("vs-hide")) this.meterEl.classList.remove("vs-hide");
    } else if (!this.meterEl.classList.contains("vs-hide")) this.meterEl.classList.add("vs-hide");

    /* 順位 */
    const r = state.rank ? String(state.rank) : "–";
    if (r !== this._last.r) { this._last.r = r; this.rankNum.textContent = r; }
    const of = "/ " + state.total;
    if (of !== this._last.of) { this._last.of = of; this.rankOf.textContent = of; }

    /* 中間地点 */
    const cp = state.checkpoints > 0 ? ("中間 " + state.checkpoint + " / " + state.checkpoints) : "";
    if (cp !== this._last.cp) { this._last.cp = cp; this.cpEl.textContent = cp; }

    /* 進み */
    const pct = Math.round(state.pct * 1000) / 10;
    if (pct !== this._last.pct) {
      this._last.pct = pct;
      this.progFill.style.width = pct + "%";
      this.progMe.style.left = pct + "%";
    }

    /* ゴーストとの 差 */
    const gd = state.ghost;
    if (gd === null || gd === undefined) {
      if (!this.ghostEl.classList.contains("vs-hide")) this.ghostEl.classList.add("vs-hide");
      this._last.ghost = undefined;
    } else {
      if (this.ghostEl.classList.contains("vs-hide")) this.ghostEl.classList.remove("vs-hide");
      /* 0.1 秒 きざみ。もっと 細かく すると 数字が 落ち着かず 読めない。 */
      const v = Math.round(gd * 10) / 10;
      if (v !== this._last.ghost) {
        this._last.ghost = v;
        this.ghostEl.textContent = "ベスト " + (v <= 0 ? "-" : "+") + Math.abs(v).toFixed(1);
        this.ghostEl.setAttribute("data-good", v <= 0 ? "1" : "0");
      }
    }

    /* 組の 点 */
    if (state.teams) {
      if (this.teamEl.classList.contains("vs-hide")) this.teamEl.classList.remove("vs-hide");
      const key = state.teams[0] + "|" + state.teams[1];
      if (key !== this._last.team) {
        this._last.team = key;
        this.teamA.textContent = String(state.teams[0]);
        this.teamB.textContent = String(state.teams[1]);
        this.teamEl.setAttribute("data-lead", state.teams[0] === state.teams[1] ? "" : (state.teams[0] > state.teams[1] ? "a" : "b"));
      }
    } else if (!this.teamEl.classList.contains("vs-hide")) this.teamEl.classList.add("vs-hide");

    /* 一覧 */
    const rows = state.standings || [];
    for (let i = 0; i < this.rows.length; i++) {
      const R = this.rows[i], d = rows[i];
      if (!d) { if (R.li.style.display !== "none") R.li.style.display = "none"; continue; }
      if (R.li.style.display === "none") R.li.style.display = "";
      /* ★ 右の 値は 遊び方で 変える（2026-08-31）。
         クイズラッシュの 勝ち負けは **正解した 門の 数**で 決まる のに、
         進んだ 割合を 出して いた。順位表と 勝ち負けが 食い違って いた。 */
      const 副 = state.mode === "quizrush" ? ("門 " + (d.correct | 0))
        : d.eliminated ? "脱落"
        : d.finished ? "GOAL"
        : (Math.round(d.pct * 100) + "%");
      const key = d.rank + "|" + d.name + "|" + 副 + "|" + (d.finished ? 1 : 0);
      if (R._key === key) continue;
      R._key = key;
      R.no.textContent = String(d.rank);
      R.nm.textContent = d.name;
      R.pc.textContent = 副;
      R.li.setAttribute("data-out", d.eliminated ? "1" : "0");
      R.dot.style.background = beanByIndex(d.colorIndex).hex;
      /* 組が ある ときは 名前の 前に 組の 色の 帯を 出す */
      R.li.setAttribute("data-team", d.team === 0 ? "a" : (d.team === 1 ? "b" : ""));
      R.li.setAttribute("data-me", d.me ? "1" : "0");
      R.li.setAttribute("data-fin", d.finished ? "1" : "0");
    }
  }

  /**
   * 計器の 絵。**作り直すのは 種類が 変わった ときだけ。**
   * @param {"lives"|"gate"} kind
   */
  _meter(kind, n, max) {
    if (this._meterKind !== kind || (kind === "lives" && this._livesMax !== max)) {
      this._meterKind = kind;
      this.meterIcon.textContent = "";
      this._hearts = [];
      if (kind === "lives") {
        this._livesMax = max; this._livesN = -1;
        for (let i = 0; i < max; i++) {
          const el = svg("svg", { viewBox: "0 0 24 24", width: "14", height: "14",
            class: "vs-hud-heart", "aria-hidden": "true" },
            svg("path", { fill: "currentColor",
              d: "M12 20.8 4.2 13c-2.2-2.2-2-5.8.5-7.6 2-1.5 4.8-1 6.4 1l.9 1.2.9-1.2c1.6-2 4.4-2.5 6.4-1 2.5 1.8 2.7 5.4.5 7.6z" }));
          this._hearts.push(el);
          this.meterIcon.appendChild(el);
        }
      } else {
        this.meterIcon.appendChild(svg("svg", { viewBox: "0 0 24 24", width: "15", height: "15",
          "aria-hidden": "true" },
          svg("path", { d: "M3 6h18M4 8h16M6 8v12M18 8v12M9.5 13.5h5", fill: "none",
            stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" })));
      }
    }
    if (kind !== "lives" || this._livesN === n) return;
    this._livesN = n;
    for (let i = 0; i < this._hearts.length; i++) {
      this._hearts[i].setAttribute("data-off", i < n ? "0" : "1");
    }
  }

  /** 真ん中の 大きな 文字（3 / 2 / 1 / GO! / ゴール!） */
  big(text, kind) {
    this.bigEl.textContent = text || "";
    this.bigEl.setAttribute("data-kind", kind || "");
    if (text) {
      this.bigEl.setAttribute("data-on", "1");
      /* 動きを 出し直す（同じ 文字が 続いても） */
      this.bigEl.style.animation = "none";
      void this.bigEl.offsetWidth;
      this.bigEl.style.animation = "";
    } else this.bigEl.removeAttribute("data-on");
  }

  /** 観戦の 帯を 出す。name だけ 渡すと 名前の 入れ替えに なる。 */
  spectate(name, onStep, onEnd) {
    this.specName.textContent = String(name || "");
    if (onStep) {
      this.specPrev.onclick = () => onStep(-1);
      this.specNext.onclick = () => onStep(1);
    }
    if (onEnd) this.specEnd.onclick = () => onEnd();
    this.specEl.classList.remove("vs-hide");
  }
  spectateOff() { this.specEl.classList.add("vs-hide"); }

  toast(text, kind) {
    const el = h("div", { class: "vs-toast", "data-kind": kind || "", text });
    this.toastEl.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 2200);
  }

  /* ══ 出来事を 左下へ 積む（2026-09-01）════════════════════════════════
     @param {string} text  出来事
     @param {string} kind  "" | "good" | "bad" | "me"（自分の こと）
     @param {number} t     経過秒（あれば 頭に 時刻を 付ける）
     ★ **消さない。** 消える 記録は 記録では ない。
       ただし 溜まり すぎると 画面を 覆うので **直近 8 件**まで。 */
  log(text, kind, t) {
    if (!this.logEl || !text) return;
    const 時 = (typeof t === "number" && isFinite(t)) ? this._fmt(Math.max(0, t)) : "";
    const li = h("li", { class: "vs-log-row", "data-kind": kind || "" },
      h("span", { class: "vs-log-t vs-mono", text: 時 }),
      h("span", { class: "vs-log-x", text: String(text) }));
    this.logEl.appendChild(li);
    while (this.logEl.children.length > 8) this.logEl.removeChild(this.logEl.firstChild);
  }
  /** 試合の 始めに からに する（前の 試合の 記録を 持ち越さない）。 */
  logClear() { if (this.logEl) this.logEl.textContent = ""; }
}

export const HUD_CSS = `
/* ★ 観戦の 帯（2026-08-31 に 直した）:
     ① 指の 跳ぶ ボタンと **重なって 「結果を 見る」が 押せなかった**（実写）
     ② 板の ほかの ものは 透ける 面なのに ここだけ 不透明で 浮いていた
   → 操作盤の 上へ 逃がし、見た目も 板に 合わせる。 */
.vs-spec{ position:absolute; left:50%; transform:translateX(-50%);
  bottom:calc(78px + var(--vs-safe-b) + var(--vs-spec-lift, 0px)); width:max-content; max-width:96%;
  padding:5px 8px 5px 12px; border-radius:var(--vs-r-full); pointer-events:auto;
  display:flex; align-items:center; gap:8px; font-size:13px;
  background:var(--vs-hud-panel); color:var(--vs-ink); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
/* うすい 灰では 明るい 面の 上で 3.63:1 しか 出なかった（実測）。 */
.vs-spec-l{ color:var(--vs-ink); opacity:.86; font-size:12px; }
.vs-spec-nm{ min-width:5em; text-align:center; font-weight:650; }
.vs-spec-b{ width:26px; height:26px; border-radius:50%; border:1px solid var(--vs-line);
  background:transparent; color:var(--vs-ink); font:inherit; font-size:11px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; padding:0; }
.vs-spec-b:hover{ background:var(--vs-surface-3); }
.vs-spec-e{ height:26px; padding:0 12px; border-radius:var(--vs-r-full); border:1px solid var(--vs-line);
  background:var(--vs-surface-2); color:var(--vs-ink); font:inherit; font-size:12px;
  font-weight:700; cursor:pointer; }
.vs-spec-e:hover{ background:var(--vs-surface-3); }

/* ★ **幅を 中身に 合わせる。** 親が 縦積みの 箱なので、
   放っておくと 横いっぱいに 伸びて 画面を 横切る 帯に なる（実写で 気づいた）。 */
.vs-hud-ghost{ position:absolute; left:calc(var(--vs-hud-x) + var(--vs-safe-l));
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 26px);
  width:max-content; max-width:60%;
  padding:3px 10px; border-radius:var(--vs-r-full);
  font-size:13px; font-weight:650; letter-spacing:.02em;
  background:var(--vs-surface); color:var(--vs-danger-text); border:1px solid var(--vs-line); }
.vs-hud-ghost[data-good="1"]{ color:var(--vs-good-text); }

/* ══ 板（HUD）の 置き方 2026-08-31 ══════════════════════════════════
   決めごと（重ならない ための 唯一の 表）:
     上端  … 進みの 帯（端から 端まで・高さ 4px）
     1 行目 … 左 時計 ／ 中 仕組みの ボタン（match.js が 置く） ／ 右 順位
     2 行目 … コース名 と 中間（右は 順位表の 手前で 切る）
     右    … 順位表（1 行目の 下から）
   数字は すべて --vs-hud-* に 出す。ここを 直せば 全部 動く。 */
.vs-hud{ position:absolute; inset:0; pointer-events:none; z-index:4;
  --vs-hud-x: 14px;
  --vs-hud-top: calc(10px + var(--vs-safe-t));
  --vs-hud-row: 38px;
  --vs-hud-list-w: 176px;
  padding: calc(12px + var(--vs-safe-t)) calc(var(--vs-hud-x) + var(--vs-safe-r)) calc(12px + var(--vs-safe-b)) calc(var(--vs-hud-x) + var(--vs-safe-l)); }

/* ① 進みの 帯 … 画面の いちばん 上。端から 端まで。 */
.vs-hud-prog{ position:absolute; left:0; right:0; top:var(--vs-safe-t); height:4px;
  background:rgba(255,255,255,.14); overflow:visible; }
.vs-hud-progfill{ position:absolute; left:0; top:0; height:100%; width:0%;
  background:var(--vs-accent); transition:width .18s linear;
  box-shadow:0 0 10px var(--vs-accent); }
.vs-hud-progme{ position:absolute; top:50%; width:10px; height:10px; margin:-5px 0 0 -5px;
  border-radius:50%; background:#fff; box-shadow:0 0 0 2px var(--vs-accent), 0 2px 6px rgba(0,0,0,.5);
  transition:left .18s linear; }

/* 速さの 線。中心は 空けて、端だけに 出す。 */
/* ★ 強すぎた（2026-08-31・実写）。明るい 風景（お菓子・氷）では
   画面ぜんぶが 斜めの 縞に なり、コースが 見えなく なっていた。
     ・濃さを 半分 以下に
     ・中心の 空きを 26% → 42% へ（真ん中は 触らない）
     ・線を 細く・間を 広く（縞では なく 「流れ」に する） */
.vs-hud-rush{
  position:absolute; inset:-12%; opacity:0; pointer-events:none;
  background: repeating-conic-gradient(from 0deg at 50% 50%,
    rgba(255,255,255,0) 0deg, rgba(255,255,255,.42) .18deg, rgba(255,255,255,0) 2.6deg);
  -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 42%, #000 92%);
          mask-image: radial-gradient(circle at 50% 50%, transparent 42%, #000 92%);
  transition: opacity .2s linear;
  mix-blend-mode: screen;
}
.vs-hud-rush[data-on="1"]{ animation: vsRush 1.1s linear infinite; }
@keyframes vsRush{ from{ transform:rotate(0deg) scale(1); } to{ transform:rotate(1.5deg) scale(1.04); } }
@media (prefers-reduced-motion:reduce){ .vs-hud-rush{ display:none; } }

/* ② 1 行目 */
.vs-hud-top{ position:absolute; left:calc(var(--vs-hud-x) + var(--vs-safe-l));
  right:calc(var(--vs-hud-x) + var(--vs-safe-r)); top:var(--vs-hud-top);
  display:flex; align-items:center; justify-content:space-between; gap:12px; }
.vs-hud-timebox{
  display:inline-flex; align-items:center; height:var(--vs-hud-row); padding:0 14px; border-radius:var(--vs-r-md);
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
}
.vs-hud-time{ font-size:20px; font-weight:650; letter-spacing:.01em; font-variant-numeric:tabular-nums; }
.vs-hud-rank{ display:flex; align-items:baseline; gap:4px; height:var(--vs-hud-row);
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  border-radius:var(--vs-r-md); padding:0 13px; align-items:center; }
/* ★ 順位の 数字は 主色（--vs-accent）だった。**明るい 見た目では
   白い 板の 上で 2.9:1** しか 出ない（実測）。
   主色は 「面の 色」であって 「字の 色」では ない。
   字の ための 色（--vs-accent-text）へ 変える。 */
.vs-hud-rank-n{ font-size:26px; font-weight:750; line-height:1; color:var(--vs-accent-text); }
.vs-hud-rank-of{ font-size:12px; color:var(--vs-ink-sub); }

/* ③ 2 行目（コース名 と 中間）。**順位表の 手前で 切る。** */
/* ★ コース名と 中間は **立体の 上に 直に 置いて いた**。
   影を 付けても、下に 来る 絵で 読めたり 読めなかったり する
   （明るい 見た目では 明暗 3.48:1 まで 落ちた。実測）。
   小さな 面を 敷いて **どの 絵の 上でも 同じ 読みやすさ**に する。 */
.vs-hud-meta{ position:absolute; left:calc(var(--vs-hud-x) + var(--vs-safe-l));
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 6px);
  max-width:calc(100% - var(--vs-hud-list-w) - var(--vs-hud-x) * 3);
  display:inline-flex; gap:9px; font-size:11.5px; color:var(--vs-ink);
  white-space:nowrap; overflow:hidden;
  padding:2px 9px; border-radius:var(--vs-r-full);
  background:var(--vs-hud-panel); border:1px solid var(--vs-line-subtle);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
.vs-hud-cp{ opacity:.82; }
/* 遊び方の 札。コース名より 先に 読ませたいので 色を 付ける。 */
.vs-hud-mode{ font-weight:750; color:var(--vs-accent-text); letter-spacing:.02em; }
/* 遊び方ごとの 計器（残機／通った 門）。ふだんは 1 行目の 真ん中。
   ★ はじめは 時計と 順位の あいだに 並べて いた。
     ところが **指で 遊ぶ ときは やめる／全画面の ボタンが
     そこへ 逃げてくる**（vs-sys）ので、6 人 走ると 重なって
     残機が ボタンの 下に 隠れた（390px の 実写で 確認）。
     指の ときと 狭い ときは 2 行目の 下へ 降ろす。 */
.vs-hud-meter{ position:absolute; left:50%; transform:translateX(-50%);
  top:var(--vs-hud-top);
  display:inline-flex; align-items:center; gap:7px; height:var(--vs-hud-row);
  padding:0 12px; border-radius:var(--vs-r-md); color:var(--vs-ink);
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
/* 指の 操作盤が 出ている ときは 左へ 寄せて 2 行目の 下に 積む。
   組の 点と 同じ 段（この 2 つは 同時に 出ない）。 */
.vs-match[data-touch="1"] .vs-hud .vs-hud-meter,
.vs-match[data-touch="1"] .vs-hud .vs-hud-team{
  left:calc(var(--vs-hud-x) + var(--vs-safe-l)); transform:none;
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 30px);
  height:auto; padding:3px 10px; font-size:12px; }
.vs-match[data-touch="1"] .vs-hud .vs-hud-mt{ font-size:12px; }
.vs-match[data-touch="1"] .vs-hud .vs-hud-ghost{
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 58px); }
.vs-hud-mi{ display:inline-flex; align-items:center; gap:3px; color:var(--vs-accent-text); }
.vs-hud-mt{ font-size:13px; font-weight:650; font-variant-numeric:tabular-nums; }
/* 減った 残機は **消さずに 空の 形で 残す**（いくつ あったかが 分かる）。 */
.vs-hud-heart{ color:var(--vq-danger, #e0628d); transition:opacity .18s linear, transform .18s ease; }
.vs-hud-heart[data-off="1"]{ opacity:.26; transform:scale(.82); }
/* 残り 10 秒を 切ったら 時計を 赤く。**色だけに 頼らない**ので 一緒に 脈打たせる。 */
.vs-hud-time[data-hurry="1"]{ color:var(--vq-danger, #e0628d); animation:vsHurry 1s ease-in-out infinite; }
@keyframes vsHurry{ 0%,100%{ opacity:1; } 50%{ opacity:.55; } }
@media (prefers-reduced-motion:reduce){ .vs-hud-time[data-hurry="1"]{ animation:none; } }
/* 脱落した 人は 薄く。まだ 走って いる 人と 見分ける。 */
.vs-hud-row[data-out="1"]{ opacity:.5; }
.vs-hud-course{ font-weight:700; overflow:hidden; text-overflow:ellipsis; }

.vs-hud-team{ position:absolute; left:50%; transform:translateX(-50%);
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 8px);
  display:inline-flex; align-items:center; gap:8px;
  padding:5px 13px; border-radius:var(--vs-r-full); background:var(--vs-surface);
  border:1px solid var(--vs-line); font-size:13px; }
.vs-hud-tn{ font-size:10.5px; font-weight:650; letter-spacing:.06em; color:var(--vq-chart-3, #e0628d); }
.vs-hud-tn.is-b{ color:var(--vq-chart-6, #6389f4); }
.vs-hud-tv{ font-size:17px; font-weight:750; }
.vs-hud-td{ color:var(--vs-ink-sub); font-size:11px; }
.vs-hud-team[data-lead="a"] .vs-hud-tv:first-of-type{ color:var(--vq-chart-3, #e0628d); }
.vs-hud-team[data-lead="b"] .vs-hud-tv:last-of-type{ color:var(--vq-chart-6, #6389f4); }
.vs-hud-row[data-team="a"]{ border-left:3px solid var(--vq-chart-3, #e0628d); }
.vs-hud-row[data-team="b"]{ border-left:3px solid var(--vq-chart-6, #6389f4); }
.vs-hud-list{ position:absolute; right:calc(var(--vs-hud-x) + var(--vs-safe-r));
  top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 8px);
  list-style:none; display:flex; flex-direction:column; gap:3px;
  min-width:var(--vs-hud-list-w); width:var(--vs-hud-list-w); }
.vs-hud-row{ display:flex; align-items:center; gap:7px; height:26px; padding:0 9px;
  border-radius:var(--vs-r-xs); background:var(--vs-surface); border:1px solid var(--vs-line-subtle);
  font-size:12px; color:var(--vs-ink); }
.vs-hud-row[data-me="1"]{ background:var(--vs-accent-soft); border-color:var(--vs-accent); font-weight:650; }
.vs-hud-row[data-fin="1"]{ opacity:.72; }
.vs-hud-no{ width:14px; text-align:right; color:var(--vs-ink-sub); font-size:11px; }
.vs-hud-dot{ width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
.vs-hud-nm{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-hud-pc{ font-size:11px; color:var(--vs-ink-sub); }

/* ★ 合図の 数字は **どんな 背景でも 読める**ように する（2026-08-31）。
   溶岩や 雪の 明るい 背景では 影だけ では 消える（実写で 確認）。
   細い 縁取り ＋ 濃い 影の 2 段。 */
.vs-hud-big{
  position:absolute; left:50%; top:38%; transform:translate(-50%,-50%);
  font-size:clamp(48px,13vw,132px); font-weight:800; letter-spacing:-.03em;
  color:#fff;
  -webkit-text-stroke: 3px rgba(6,8,24,.55);
  paint-order: stroke fill;
  text-shadow:0 6px 0 rgba(6,8,24,.45), 0 14px 40px rgba(0,0,0,.65), 0 0 26px rgba(0,0,0,.5);
  opacity:0; pointer-events:none;
}
.vs-hud-big[data-on="1"]{ animation: vsBig .9s cubic-bezier(.2,1.1,.3,1) both; }
.vs-hud-big[data-kind="go"]{ color:${PALETTE.mint}; }
.vs-hud-big[data-kind="goal"]{ color:${PALETTE.amber}; font-size:clamp(34px,8vw,88px); }
@keyframes vsBig{
  0%{ opacity:0; transform:translate(-50%,-50%) scale(1.8); }
  30%{ opacity:1; transform:translate(-50%,-50%) scale(1); }
  75%{ opacity:1; }
  100%{ opacity:0; transform:translate(-50%,-50%) scale(.92); }
}
.vs-hud-toast{ position:absolute; left:50%; bottom:calc(96px + var(--vs-safe-b)); transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:6px; }
.vs-toast{
  padding:7px 16px; border-radius:var(--vs-r-full); font-size:13px; font-weight:700;
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); color:var(--vs-ink);
  animation: vsToast 2.2s ease both;
}
.vs-toast[data-kind="good"]{ background:var(--vs-good-bg); color:var(--vs-good-text); border-color:var(--vs-good); }
.vs-toast[data-kind="bad"]{ background:var(--vs-danger-bg); color:var(--vs-danger-text); border-color:var(--vs-danger); }
@keyframes vsToast{ 0%{opacity:0;transform:translateY(10px)} 12%{opacity:1;transform:none}
  80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }

/* ── できごとの 記録（左下・PC だけ）─────────────────────────────────
   ★ 指で 遊ぶ ときは 左下に 走る 棒が 出る。重ねると 棒が 押せなく なる
     ので、**狭い 画面と 指の 端末では 出さない**（下の @media）。
   ★ 観戦の 帯（画面の 下の 真ん中）とは 高さを 変えて ぶつからない ように。 */
.vs-hud-log{
  position:absolute; left:14px; bottom:calc(18px + var(--vs-safe-b));
  margin:0; padding:0; list-style:none;
  display:flex; flex-direction:column; gap:3px;
  width:min(320px, 34vw); pointer-events:none;
}
.vs-log-row{
  display:flex; align-items:baseline; gap:7px;
  padding:4px 9px; border-radius:8px;
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  color:var(--vs-ink); font-size:11.5px; line-height:1.5;
  animation: vsLogIn .22s ease both;
}
.vs-log-t{ flex:0 0 auto; font-size:10.5px; opacity:.62; }
.vs-log-x{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-log-row[data-kind="good"]{ border-color:var(--vs-good); color:var(--vs-good-text); }
.vs-log-row[data-kind="bad"]{ border-color:var(--vs-danger); color:var(--vs-danger-text); }
.vs-log-row[data-kind="me"]{ border-color:${PALETTE.amber}; }
@keyframes vsLogIn{ from{opacity:0; transform:translateX(-8px)} to{opacity:1; transform:none} }
@media (prefers-reduced-motion:reduce){ .vs-log-row{ animation:none; } }
/* ★ 狭い 画面／指で 触る 端末では 出さない（走る 棒の 場所）。 */
@media (max-width: 900px){ .vs-hud-log{ display:none; } }
@media (pointer: coarse){ .vs-hud-log{ display:none; } }

/* ── 操作の 説明 ─────────────────────────────────────────────────── */
.vs-help{ position:absolute; inset:0; z-index:11; display:none;
  align-items:center; justify-content:center;
  background:var(--vs-surface);
  padding: calc(14px + var(--vs-safe-t)) 14px calc(14px + var(--vs-safe-b)); }
.vs-help[data-on="1"]{ display:flex; }
.vs-help-card{ width:min(760px,100%); max-height:100%; overflow:auto;
  background:var(--vs-hud-panel); border:1px solid var(--vs-line);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  border-radius:var(--vs-r-lg); padding:20px; text-align:center;
  box-shadow:var(--vs-sh-raised); }
.vs-help-lead{ font-size:11.5px; font-weight:700; letter-spacing:.08em;
  color:${PALETTE.amber}; margin-bottom:4px; }
.vs-help-title{ font-size:22px; font-weight:750; margin-bottom:14px; }
/* 大きな 3 つ */
.vs-help-bigs{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; text-align:left; }
.vs-help-big{ display:flex; align-items:center; gap:11px; padding:12px 13px;
  border-radius:var(--vs-r-md); background:var(--vs-surface-2); border:1px solid var(--vs-line); }
.vs-help-ic{ flex:0 0 auto; width:42px; height:42px; border-radius:var(--vs-r-sm);
  display:inline-flex; align-items:center; justify-content:center;
  background:var(--vs-accent-soft); color:var(--vs-accent-text); }
.vs-help-bt{ display:flex; flex-direction:column; gap:2px; min-width:0; }
.vs-help-bt b{ font-size:14.5px; font-weight:750; }
.vs-help-bt span{ font-size:11.5px; line-height:1.6; color:var(--vs-ink-sub); }
.vs-help-key1{ margin:12px 0 4px; font-size:13.5px; font-weight:650; }
/* ★ 「はじめる」は **必ず 見えている**（2026-08-31）。
   「くわしい 操作」を 開くと 板が 伸び、320/390/430 と 横向きでは
   ボタンが 画面の 1000px 下に 行って いた（実測）。
   初めて 遊ぶ 人が いちばん 最初に 見る 板なので、ここで 詰まると
   そのまま 閉じられる。板の 下に 貼り付ける。 */
.vs-help-go{ position:sticky; bottom:0; z-index:1; margin-top:4px;
  padding-top:10px; padding-bottom:10px;
  box-shadow:0 -14px 18px -10px var(--vs-surface), 0 0 0 12px var(--vs-surface); }
.vs-help-more{ margin:8px 0 14px; text-align:left; }
.vs-help-more summary{ cursor:pointer; list-style:none; font-size:12px; font-weight:650;
  color:var(--vs-ink-sub); padding:6px 0; }
.vs-help-more summary::-webkit-details-marker{ display:none; }
.vs-help-more summary::before{ content:"▸ "; }
.vs-help-more[open] summary::before{ content:"▾ "; }
@media (max-width: 700px){
  .vs-help-bigs{ grid-template-columns:1fr; gap:7px; }
  .vs-help-big{ padding:9px 11px; gap:9px; }
  .vs-help-ic{ width:36px; height:36px; }
}
.vs-help-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; text-align:left; margin-bottom:16px; }
.vs-help-col{ background:var(--vs-surface-2); border-radius:var(--vs-r-md); padding:12px; }
.vs-help-h{ font-size:11.5px; font-weight:650; letter-spacing:.06em; color:${PALETTE.amber}; margin-bottom:8px; }
.vs-help-row{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.vs-help-keys{ display:flex; gap:3px; flex:0 0 auto; }
.vs-help-k{ display:inline-flex; align-items:center; justify-content:center;
  min-width:22px; height:22px; padding:0 5px; border-radius:var(--vs-r-xs); font-family:inherit;
  background:var(--vs-surface-3); font-size:10.5px; font-weight:650; }
.vs-help-t{ font-size:12px; color:var(--vs-ink); }
.vs-help-p{ font-size:12px; color:var(--vs-ink-sub); line-height:1.8; margin-bottom:4px; }
@media (max-width: 700px){
  .vs-help-grid{ grid-template-columns:1fr; }
  .vs-help-card{ padding:14px; }
}

/* ★ 大きな 画面（2560px など）では 板が **小さすぎて 見えない**
   （実写で 確認）。数字を 1 か所で 上げる。 */
@media (min-width: 1800px){
  .vs-hud{ --vs-hud-x:22px; --vs-hud-top: calc(16px + var(--vs-safe-t));
    --vs-hud-row:48px; --vs-hud-list-w:220px; }
  .vs-hud-time{ font-size:26px; }
  .vs-hud-rank-n{ font-size:34px; }
  .vs-hud-rank-of{ font-size:14px; }
  .vs-hud-meta{ font-size:14px; padding:3px 12px; }
  .vs-hud-row{ height:30px; font-size:14px; padding:0 11px; }
  .vs-hud-no{ font-size:13px; width:17px; }
  .vs-hud-pc{ font-size:13px; }
  .vs-hud-dot{ width:11px; height:11px; }
  .vs-hud-prog{ height:6px; }
}

/* 狭い 画面。**数字を 1 か所で 変える**（位置は 上の 表が 自分で 追う）。 */
@media (max-width: 640px){
  .vs-hud{ --vs-hud-x:10px; --vs-hud-row:34px; --vs-hud-list-w:138px; }
  /* ★ 組（チーム戦）の 点が **順位表の 上に 重なって いた**（実写で 確認）。
     狭い 画面では 真ん中に 置けない ので、左へ 寄せて 2 行目の 下に 積む。
     ゴーストとの 差も 同じ 列に 来る ので さらに 下へ。 */
  .vs-hud-team, .vs-hud-meter{ left:calc(var(--vs-hud-x) + var(--vs-safe-l)); transform:none;
    top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 30px);
    max-width:calc(100% - var(--vs-hud-list-w) - var(--vs-hud-x) * 3);
    height:auto; padding:3px 9px; font-size:12px; }
  .vs-hud-tv{ font-size:14px; }
  .vs-hud-mt{ font-size:12px; }
  .vs-hud-ghost{ top:calc(var(--vs-hud-top) + var(--vs-hud-row) + 58px); }
  .vs-hud-row{ height:23px; font-size:11px; padding:0 7px; }
  .vs-hud-rank-n{ font-size:22px; }
  .vs-hud-time{ font-size:17px; }
  .vs-hud-timebox{ padding:0 11px; }
  .vs-hud-rank{ padding:0 10px; }
  .vs-hud-nm{ font-size:11px; }
  /* 縦の スマホは 4 人ぶんまで。それ以上は 画面を 塞ぐ。 */
  .vs-hud-list .vs-hud-row:nth-child(n+6){ display:none !important; }
}
@media (max-height: 460px){
  .vs-hud{ --vs-hud-top: calc(7px + var(--vs-safe-t)); --vs-hud-row:32px; }
  .vs-hud-big{ top:32%; }
  .vs-hud-list .vs-hud-row:nth-child(n+7){ display:none !important; }
}
`;
