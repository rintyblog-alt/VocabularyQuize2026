/* ══════════════════════════════════════════════════════════════════════════
   コースを 自分で 作る

   考え方:
     ・**3D で つまんで 置く のは やらない。** 区画を 上から 下へ 並べる 一覧に する。
       置き方を 自由に すると「跳べない コース」が いくらでも 作れて しまい、
       作った 人が 自分の コースを 走れない。
     ・**作りながら 測る。** 区画を 足す たび、走らせずに 隙間と 段差を 数える
       （game/analyze.js。検査（vqsurvivegap）と まったく 同じ もの）。
       赤が 出ている 間は「走れない かも」と はっきり 言う。
     ・受け渡しは 合言葉 1 本。サーバは 使わない。
   ══════════════════════════════════════════════════════════════════════════ */
import { h } from "./shell.js";
import { PALETTE } from "./theme.js";
import { THEME_NAMES, themeOf } from "../game/theme3d.js";
import { buildCourse } from "../game/course.js";
import { analyzeCourse, 越えられる隙間, 越えられる段差 } from "../game/analyze.js";
import {
  SECTION_KINDS, OBS_KINDS, cleanSections, newCourse, toDef,
  listMyCourses, getMyCourse, saveMyCourse, deleteMyCourse,
  exportCode, importCode, MY_PREFIX
} from "../data/mycourse.js";

const THEME_LABEL = {
  meadow: "草原", sunset: "夕暮れ", candy: "お菓子", ice: "氷", lava: "溶岩",
  neon: "ネオン", forest: "森", sky: "空", ruins: "遺跡", arena: "闘技場"
};

/* 区画ごとに 触れる 数（名前・鍵・最小・最大・きざみ） */
const FIELDS = {
  start:      [["長さ", "len", 10, 30, 1], ["幅", "w", 10, 24, 1]],
  path:       [["長さ", "len", 8, 40, 1], ["幅", "w", 5, 20, 0.5]],
  ice:        [["長さ", "len", 8, 40, 1], ["幅", "w", 5, 20, 0.5]],
  bridge:     [["長さ", "len", 10, 40, 1], ["幅", "w", 2.2, 8, 0.2]],
  gap:        [["長さ", "len", 3, 12, 0.5]],
  ramp:       [["長さ", "len", 8, 40, 1], ["高さの 差", "dy", -12, 12, 0.5], ["幅", "w", 6, 20, 0.5]],
  turn:       [["長さ", "len", 10, 40, 1], ["横へ", "dx", -20, 20, 1], ["幅", "w", 6, 20, 0.5]],
  conveyor:   [["長さ", "len", 10, 40, 1], ["幅", "w", 6, 20, 0.5], ["速さ", "speed", -6, 6, 0.5]],
  stones:     [["数", "count", 2, 12, 1], ["間", "gap", 2.5, 5.2, 0.1], ["ばらつき", "spread", 0, 3.4, 0.1], ["上下", "bob", 0, 1.4, 0.1]],
  movers:     [["数", "count", 2, 8, 1], ["間", "gap", 3, 5.2, 0.1], ["振れ", "ax", 0, 7, 0.5], ["周期", "period", 2, 8, 0.2]],
  gate:       [["考える 秒", "limit", 6, 30, 1], ["門の 幅", "gw", 5, 14, 0.5]],
  checkpoint: [["幅", "w", 8, 20, 0.5]],
  finish:     []
};

export class EditorScreen {
  constructor(opt) {
    this.app = opt.app;
    this.onPlay = opt.onPlay || (() => {});
    this.onExit = opt.onExit || (() => {});
    this.title = "コースを 作る";
    this.course = newCourse();
    this.sel = 1;
    this.el = this._build();
  }

  /* ── 画面 ────────────────────────────────────────────────────────── */
  _build() {
    this.nameInput = h("input", {
      class: "vs-ed-name", type: "text", maxlength: "40", "aria-label": "コースの 名前",
      oninput: (e) => { this.course.name = e.target.value.slice(0, 40); }
    });
    this.themeRow = h("div", { class: "vs-ed-themes", role: "radiogroup", "aria-label": "風景" });
    for (const t of THEME_NAMES) {
      const b = h("button", {
        class: "vs-ed-theme", type: "button", role: "radio", "data-th": t,
        "aria-label": THEME_LABEL[t] || t, title: THEME_LABEL[t] || t,
        onclick: () => { this.course.theme = t; this._render(); }
      }, THEME_LABEL[t] || t);
      /* ★ 風景の 色を **枠**に 使うと、暗い 風景（ネオン・遺跡）で 枠が 消えて
         「押せる もの」に 見えなく なる（実写で 気づいた）。
         枠は いつも 同じ 薄さに して、色は 小さな 丸で 見せる。 */
      const th = themeOf(t);
      const dot = document.createElement("i");
      dot.className = "vs-ed-tdot";
      dot.style.background = "rgb(" + th.sky.horizon.map((v) => Math.round(v * 255)).join(",") + ")";
      b.insertBefore(dot, b.firstChild);
      this.themeRow.appendChild(b);
    }

    this.listEl = h("ol", { class: "vs-ed-list", "aria-label": "区画の 並び" });
    this.propEl = h("div", { class: "vs-ed-prop", "aria-label": "えらんだ 区画" });
    this.addRow = h("div", { class: "vs-ed-add", role: "group", "aria-label": "区画を 足す" });
    for (const k of SECTION_KINDS) {
      if (k.固) continue;
      this.addRow.appendChild(h("button", {
        class: "vs-ed-addb", type: "button", onclick: () => this._add(k.t)
      }, "＋ " + k.名));
    }

    /* ★ **上から 見た 図。** 数字だけ 並べても どんな コースか 分からない。
       選んでいる 区画を 光らせる ことで「いま どこを 直しているか」が 一目で 分かる。 */
    this.mapEl = h("canvas", { class: "vs-ed-map", "aria-label": "上から 見た コース" });
    this.checkEl = h("div", { class: "vs-ed-check", role: "status", "aria-live": "polite" });
    this.saveBtn = h("button", { class: "vs-btn is-mint", type: "button", onclick: () => this._save() }, "保存");
    this.playBtn = h("button", { class: "vs-btn", type: "button", onclick: () => this._play() }, "試しに 走る");
    this.codeInput = h("input", {
      class: "vs-ed-code", type: "text", "aria-label": "合言葉",
      placeholder: "VS1… を 貼ると 読み込めます", autocomplete: "off", spellcheck: "false"
    });
    this.copyBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._copy() }, "合言葉を 作る");
    this.loadBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._loadCode() }, "読み込む");
    this.codeNote = h("p", { class: "vs-lb-note" });

    this.minesEl = h("div", { class: "vs-ed-mine", "aria-label": "作った コース" });

    return h("div", { class: "vs-ed" },
      h("header", { class: "vs-ed-head" },
        h("h1", { class: "vs-ed-title" }, "コースを 作る"),
        h("div", { class: "vs-ed-headbtns" },
          this.playBtn, this.saveBtn,
          h("button", { class: "vs-lb-x", type: "button", "aria-label": "ロビーへ 戻る", onclick: () => this.onExit() }, "✕"))),
      h("div", { class: "vs-ed-grid" },
        h("section", { class: "vs-card vs-ed-left", "aria-label": "並び" },
          h("div", { class: "vs-lb-lab", text: "名前" }), this.nameInput,
          h("div", { class: "vs-lb-lab", text: "風景" }), this.themeRow,
          h("div", { class: "vs-lb-lab", text: "上から 見た ところ" }), this.mapEl,
          h("div", { class: "vs-lb-lab", text: "区画（上から 下へ 走ります）" }),
          this.listEl, this.addRow),
        h("section", { class: "vs-card vs-ed-right", "aria-label": "細かい 設定" },
          this.propEl,
          h("div", { class: "vs-lb-lab", text: "走れるか" }), this.checkEl,
          h("div", { class: "vs-lb-lab", text: "受け渡し（合言葉）" }),
          h("div", { class: "vs-ed-coderow" }, this.copyBtn, this.loadBtn),
          this.codeInput, this.codeNote,
          h("div", { class: "vs-lb-lab", text: "作った コース" }), this.minesEl)));
  }

  /* ── 区画 ────────────────────────────────────────────────────────── */
  _add(t) {
    const s = { t };
    const 既 = {
      path: { len: 22, w: 12 }, ice: { len: 20, w: 10 }, bridge: { len: 22, w: 3.2 },
      gap: { len: 8 }, ramp: { len: 20, dy: 4, w: 10 }, turn: { len: 20, dx: 10, w: 11 },
      conveyor: { len: 20, w: 10, speed: 3.5, cz: -1, cx: 0 },
      stones: { count: 5, gap: 4, spread: 1.6, bob: 0.6 },
      movers: { count: 4, gap: 4.2, ax: 4, period: 3.4, stagger: 0.5 },
      gate: { limit: 12, gw: 7 }, checkpoint: { w: 12 }
    }[t] || {};
    Object.assign(s, 既);
    /* ★ ゴールの **前**に 入れる。後ろに 入れると 走れない コースに なる。 */
    const fin = this.course.sections.findIndex((x) => x.t === "finish");
    const at = fin < 0 ? this.course.sections.length : fin;
    this.course.sections.splice(at, 0, s);
    this.sel = at;
    this._render();
  }
  _remove(i) {
    const s = this.course.sections[i];
    if (!s || s.t === "start" || s.t === "finish") return;
    this.course.sections.splice(i, 1);
    this.sel = Math.max(1, Math.min(this.sel, this.course.sections.length - 1));
    this._render();
  }
  _move(i, d) {
    const a = this.course.sections;
    const j = i + d;
    if (j < 1 || j >= a.length - 1) return;          /* スタートと ゴールは 動かさない */
    if (a[i].t === "start" || a[i].t === "finish") return;
    const t = a[i]; a[i] = a[j]; a[j] = t;
    this.sel = j;
    this._render();
  }

  /* ── 走れるか ─────────────────────────────────────────────────────
     ★ **作りながら 測る。** 走ってみて 初めて 分かる のでは 遅い。 */
  _check() {
    this.checkEl.textContent = "";
    let c = null;
    try { c = buildCourse(toDef(this._clean())); } catch (e) {
      this.checkEl.appendChild(h("p", { class: "vs-ed-bad", text: "組み立てられません: " + String(e && e.message || e) }));
      return null;
    }
    let a = null;
    try { a = analyzeCourse(c); } catch (e) { a = null; }
    const 門 = c.gates.length, 中 = c.checkpoints.length;
    const 行 = (t, よ) => this.checkEl.appendChild(h("p", { class: よ ? "vs-ed-good" : "vs-ed-bad", text: (よ ? "○ " : "× ") + t }));
    行("長さ " + Math.round(c.length) + "m", c.length >= 60);
    行("クイズの 門 " + 門 + " つ", 門 >= 1);
    行("中間地点 " + 中 + " つ", 中 >= 1);
    if (a) {
      行("いちばん 広い すきま " + a.gap.toFixed(1) + "m（跳べるのは " + a.gapMax + "m）", a.gap <= a.gapMax);
      行("いちばん 高い 段差 " + a.step.toFixed(1) + "m（上れるのは " + 越えられる段差 + "m）", a.step <= 越えられる段差);
      if (a.far > 0) 行("板から 板へ " + a.far.toFixed(1) + "m（届くのは " + 越えられる隙間 + "m）", a.far <= 越えられる隙間);
    }
    this._ok = !!(a && a.ok && c.length >= 60 && 門 >= 1 && 中 >= 1);
    try { this._drawMap(c); } catch (e) { /* 図が 描けなくても 編集は 続く */ }
    if (!this._ok) {
      this.checkEl.appendChild(h("p", { class: "vs-lb-note",
        text: "× が 残っていても 走れます。ただし 途中で 進めなく なる かも しれません。" }));
    }
    return c;
  }

  /* ── 上から 見た 図 ───────────────────────────────────────────────
     ★ 3D では 描かない。**2D で 十分**で、しかも 軽い。
       編集の たびに 3D を 建て直すと 数百 ms 止まる。 */
  _drawMap(c) {
    const cv = this.mapEl;
    if (!cv) return;
    const box = cv.parentElement ? cv.parentElement.getBoundingClientRect() : { width: 480 };
    const W = Math.max(200, Math.round(box.width - 28));
    const H = 150;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
    }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!c) return;

    /* 端から 端まで 入る ように 縮める（進む 向きは -Z なので 左→右 に 描く） */
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const f of c.floors) {
      x0 = Math.min(x0, f.x - f.w / 2); x1 = Math.max(x1, f.x + f.w / 2);
      z0 = Math.min(z0, f.z - f.d / 2); z1 = Math.max(z1, f.z + f.d / 2);
    }
    if (!(x1 > x0) || !(z1 > z0)) return;
    const pad = 8;
    const k = Math.min((W - pad * 2) / (z1 - z0), (H - pad * 2) / Math.max(8, x1 - x0));
    const px = (f) => pad + (-f.z - (-z1)) * k;          /* -Z を 右へ */
    const py = (f) => H / 2 + (f.x - (x0 + x1) / 2) * k;

    /* 選んでいる 区画の 帯 */
    const at = c.sectionAt || [];
    const sel = this.sel;
    if (at[sel] !== undefined && at[sel + 1] !== undefined) {
      const a = pad + (-at[sel].z - (-z1)) * k;
      const b = pad + (-at[sel + 1].z - (-z1)) * k;
      g.fillStyle = "rgba(90,230,190,.16)";
      g.fillRect(Math.min(a, b), 0, Math.abs(b - a), H);
    }

    const 色 = { path: "#5d7a8f", cp: "#5ae6be", finish: "#ffd84d", gate: "#7aa2ff",
      ice: "#9fd8ff", conveyor: "#c9a0ff", bridge: "#8ea0b4", ramp: "#8fb0c4", start: "#7de0b0" };
    for (const f of c.floors) {
      const w = Math.max(1.5, f.d * k), hh = Math.max(1.5, f.w * k);
      g.fillStyle = 色[f.kind] || "#5d7a8f";
      g.globalAlpha = 0.92;
      g.fillRect(px(f) - w / 2, py(f) - hh / 2, w, hh);
    }
    g.globalAlpha = 1;
    /* 仕掛けは 小さな 点 */
    for (const o of c.obstacles) {
      if (o.kind === "checkpoint" || o.kind === "finish") continue;
      g.fillStyle = "rgba(255,138,151,.9)";
      g.beginPath();
      g.arc(px(o), py(o), 2.2, 0, Math.PI * 2);
      g.fill();
    }
    /* 門と 中間地点 */
    for (const o of c.obstacles) {
      if (o.kind !== "checkpoint") continue;
      g.strokeStyle = "#5ae6be"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px(o), 4); g.lineTo(px(o), H - 4); g.stroke();
    }
    for (const gt of c.gates) {
      g.strokeStyle = "#7aa2ff"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px(gt), 10); g.lineTo(px(gt), H - 10); g.stroke();
    }
    /* 出発と ゴール */
    g.fillStyle = "#7de0b0"; g.font = "700 10px system-ui, sans-serif";
    g.fillText("出発", 4, 12);
    g.fillStyle = "#ffd84d";
    g.fillText("ゴール", W - 32, 12);
  }

  _clean() {
    const c = Object.assign({}, this.course);
    c.sections = cleanSections(this.course.sections);
    /* スタートと ゴールは 必ず 端に 1 つずつ */
    c.sections = c.sections.filter((s) => s.t !== "start" && s.t !== "finish");
    c.sections.unshift({ t: "start", w: 18, len: 16 });
    c.sections.push({ t: "finish" });
    return c;
  }

  /* ── 保存・受け渡し ───────────────────────────────────────────────── */
  async _save() {
    this.course.name = (this.nameInput.value || "").slice(0, 40) || "あたらしい コース";
    const c = this._clean();
    c.name = this.course.name;
    const r = await saveMyCourse(c, this.app && this.app.nowMs ? this.app.nowMs() : 0);
    this.saveBtn.textContent = r === true ? "保存しました" : (r === "満杯" ? "いっぱいです" : "保存できません");
    setTimeout(() => { this.saveBtn.textContent = "保存"; }, 1600);
    if (r === true) this._loadMine();
  }
  _play() {
    const c = this._clean();
    c.name = this.course.name;
    this.onPlay(toDef(c));
  }
  async _copy() {
    const code = exportCode(this._clean());
    this.codeInput.value = code;
    try { this.codeInput.select(); await navigator.clipboard.writeText(code); this.codeNote.textContent = "写しました。貼って 渡せます。"; }
    catch (e) { this.codeNote.textContent = "上の 文字を まるごと 渡してください。"; }
  }
  _loadCode() {
    const c = importCode(this.codeInput.value, MY_PREFIX + "i" + Math.random().toString(36).slice(2, 8));
    if (!c) { this.codeNote.textContent = "読めませんでした。VS1 から 始まる 文字を 貼ってください。"; return; }
    this.course = c;
    this.sel = 1;
    this.codeNote.textContent = "読み込みました。保存すると 残ります。";
    this._render();
  }

  async _loadMine() {
    const list = await listMyCourses();
    this.minesEl.textContent = "";
    if (!list.length) {
      this.minesEl.appendChild(h("p", { class: "vs-lb-note", text: "まだ ありません。" }));
      return;
    }
    for (const c of list) {
      this.minesEl.appendChild(h("div", { class: "vs-ed-mrow" },
        h("button", {
          class: "vs-ed-mname", type: "button",
          onclick: async () => {
            const got = await getMyCourse(c.id);
            if (got) { this.course = got; this.sel = 1; this._render(); }
          }
        }, c.name),
        h("span", { class: "vs-ed-mmeta", text: (c.sections || []).length + " 区画" }),
        h("button", {
          class: "vs-ed-mdel", type: "button", "aria-label": c.name + " を 消す", title: "消す",
          onclick: async () => { await deleteMyCourse(c.id); this._loadMine(); }
        }, "✕")));
    }
  }

  /* ── 描き直す ─────────────────────────────────────────────────────── */
  _render() {
    if (this.nameInput.value !== this.course.name) this.nameInput.value = this.course.name;
    for (const b of this.themeRow.children) {
      b.setAttribute("aria-checked", b.getAttribute("data-th") === this.course.theme ? "true" : "false");
    }

    this.listEl.textContent = "";
    const a = this.course.sections;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      const k = SECTION_KINDS.filter((x) => x.t === s.t)[0];
      const 固 = !!(k && k.固);
      const li = h("li", {
        class: "vs-ed-row", "data-on": i === this.sel ? "1" : "0",
        onclick: () => { this.sel = i; this._render(); }
      },
        h("span", { class: "vs-ed-rn vs-mono", text: String(i + 1) }),
        h("span", { class: "vs-ed-rk", text: (k ? k.名 : s.t) }),
        h("span", { class: "vs-ed-rm", text: 説明(s) }),
        固 ? null : h("span", { class: "vs-ed-rb" },
          h("button", { class: "vs-ed-ib", type: "button", "aria-label": "上へ", title: "上へ",
            onclick: (e) => { e.stopPropagation(); this._move(i, -1); } }, "▲"),
          h("button", { class: "vs-ed-ib", type: "button", "aria-label": "下へ", title: "下へ",
            onclick: (e) => { e.stopPropagation(); this._move(i, 1); } }, "▼"),
          h("button", { class: "vs-ed-ib is-del", type: "button", "aria-label": "消す", title: "消す",
            onclick: (e) => { e.stopPropagation(); this._remove(i); } }, "✕")));
      this.listEl.appendChild(li);
    }

    /* えらんだ 区画 */
    this.propEl.textContent = "";
    const s = a[this.sel];
    if (s) {
      const k = SECTION_KINDS.filter((x) => x.t === s.t)[0];
      this.propEl.appendChild(h("h2", { class: "vs-ed-ph", text: (k ? k.名 : s.t) + "（" + (this.sel + 1) + " 番目）" }));
      for (const [名, key, lo, hi, st] of (FIELDS[s.t] || [])) {
        const v = s[key] === undefined ? lo : s[key];
        const out = h("span", { class: "vs-ed-fv vs-mono", text: String(v) });
        const rng = h("input", {
          class: "vs-lb-range", type: "range", min: String(lo), max: String(hi), step: String(st),
          value: String(v), "aria-label": 名,
          oninput: (e) => {
            s[key] = Number(e.target.value);
            out.textContent = String(s[key]);
            this._check();
          }
        });
        this.propEl.appendChild(h("div", { class: "vs-ed-field" },
          h("span", { class: "vs-ed-fn", text: 名 }), rng, out));
      }
      if (s.t === "path" || s.t === "ice") {
        const on = !!s.wall;
        this.propEl.appendChild(h("button", {
          class: "vs-lb-toggle", type: "button", "aria-pressed": on ? "true" : "false",
          onclick: () => { s.wall = !s.wall; this._render(); }
        }, "落ちない ふちを 付ける"));
      }
      /* 仕掛け */
      if (s.t !== "finish" && s.t !== "start" && s.t !== "gate" && s.t !== "checkpoint") {
        this.propEl.appendChild(h("div", { class: "vs-lb-lab", text: "仕掛け（最大 4 つ）" }));
        const list = h("div", { class: "vs-ed-obs" });
        for (let j = 0; j < (s.obs || []).length; j++) {
          const q = s.obs[j];
          const nm = OBS_KINDS.filter((x) => x.t === q.t)[0];
          list.appendChild(h("div", { class: "vs-ed-orow" },
            h("span", { class: "vs-ed-on", text: (nm ? nm.名 : q.t) }),
            h("input", {
              class: "vs-lb-range", type: "range", min: "0", max: String(Math.max(6, (s.len || 20))),
              step: "0.5", value: String(q.dz || 0), "aria-label": (nm ? nm.名 : q.t) + " の 位置",
              oninput: (e) => { q.dz = Number(e.target.value); this._check(); }
            }),
            h("button", { class: "vs-ed-ib is-del", type: "button", "aria-label": "消す",
              onclick: () => { s.obs.splice(j, 1); this._render(); } }, "✕")));
        }
        this.propEl.appendChild(list);
        if ((s.obs || []).length < 4) {
          const sel = h("div", { class: "vs-ed-opick" });
          for (const o of OBS_KINDS) {
            sel.appendChild(h("button", {
              class: "vs-ed-ob", type: "button",
              onclick: () => {
                if (!s.obs) s.obs = [];
                s.obs.push(Object.assign({ t: o.t, dz: Math.round((s.len || 20) / 2) }, o.既));
                this._render();
              }
            }, "＋ " + o.名));
          }
          this.propEl.appendChild(sel);
        }
      }
    }

    this._check();
  }

  async enter(arg) {
    if (arg && arg.course) { this.course = arg.course; this.sel = 1; }
    this._render();
    this._loadMine();
  }
  exit() {}
  resize() {}
}

function 説明(s) {
  if (s.t === "gap") return s.len + "m";
  if (s.t === "gate") return s.limit + "秒 / 幅 " + s.gw;
  if (s.t === "checkpoint") return "幅 " + (s.w || 12);
  if (s.t === "stones") return (s.count || 5) + " 個 / 間 " + (s.gap || 4);
  if (s.t === "movers") return (s.count || 4) + " 枚 / 振れ " + (s.ax || 4);
  if (s.t === "finish") return "";
  const n = (s.obs || []).length;
  return (s.len ? s.len + "m" : "") + (s.w ? " / 幅 " + s.w : "") + (n ? " / 仕掛け " + n : "");
}

export const EDITOR_CSS = `
.vs-ed{ position:absolute; inset:0; display:flex; flex-direction:column; overflow:auto;
  padding:14px 16px 20px; }
.vs-ed-head{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.vs-ed-title{ font-size:19px; font-weight:900; margin:0; letter-spacing:.01em; }
.vs-ed-headbtns{ margin-left:auto; display:flex; align-items:center; gap:8px; }
.vs-ed-grid{ display:grid; grid-template-columns: 1fr 340px; gap:12px; align-items:start; }
.vs-ed-grid > *{ min-width:0; }
.vs-ed-name{ width:100%; height:36px; padding:0 10px; border-radius:9px;
  border:1px solid ${PALETTE.line}; background:rgba(255,255,255,.05); color:#f3f5ff;
  font:inherit; font-size:14px; }
.vs-ed-themes{ display:flex; flex-wrap:wrap; gap:4px; }
.vs-ed-theme{ display:inline-flex; align-items:center; gap:5px;
  padding:4px 10px 4px 7px; border-radius:999px; border:1px solid ${PALETTE.line};
  background:transparent; color:rgba(243,245,255,.82); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-ed-tdot{ width:9px; height:9px; border-radius:50%; flex:0 0 auto;
  box-shadow:0 0 0 1px rgba(0,0,0,.35) inset; }
.vs-ed-theme[aria-checked="true"]{ background:rgba(255,255,255,.14); color:#fff; font-weight:800;
  border-width:2px; }
.vs-ed-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px;
  max-height:44vh; overflow-y:auto; }
.vs-ed-row{ display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:9px;
  border:1px solid transparent; cursor:pointer; font-size:12.5px; }
.vs-ed-row:hover{ background:rgba(255,255,255,.05); }
.vs-ed-row[data-on="1"]{ border-color:${PALETTE.mint}; background:rgba(90,230,190,.12); }
.vs-ed-rn{ width:20px; text-align:right; color:rgba(243,245,255,.6); font-size:11px; }
.vs-ed-rk{ font-weight:800; min-width:6.5em; }
.vs-ed-rm{ flex:1 1 auto; color:rgba(243,245,255,.62); font-size:11.5px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-ed-rb{ flex:0 0 auto; display:flex; gap:2px; }
.vs-ed-ib{ width:22px; height:22px; border-radius:6px; border:1px solid ${PALETTE.line};
  background:transparent; color:rgba(243,245,255,.8); font:inherit; font-size:10px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; padding:0; }
.vs-ed-ib:hover{ background:rgba(255,255,255,.10); }
.vs-ed-ib.is-del:hover{ background:rgba(255,90,110,.24); }
.vs-ed-add{ display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.vs-ed-addb{ padding:5px 9px; border-radius:999px; border:1px dashed rgba(255,255,255,.22);
  background:transparent; color:rgba(243,245,255,.8); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-ed-addb:hover{ background:rgba(255,255,255,.07); border-style:solid; }
.vs-ed-ph{ font-size:14px; font-weight:900; margin:0 0 8px; }
.vs-ed-field{ display:flex; align-items:center; gap:8px; margin-bottom:5px; }
.vs-ed-fn{ flex:0 0 auto; width:5.6em; font-size:11.5px; color:rgba(243,245,255,.66); }
.vs-ed-field .vs-lb-range{ flex:1 1 auto; }
.vs-ed-fv{ flex:0 0 auto; width:3.2em; text-align:right; font-size:12px; font-weight:800; }
.vs-ed-obs{ display:flex; flex-direction:column; gap:3px; }
.vs-ed-orow{ display:flex; align-items:center; gap:6px; }
.vs-ed-on{ flex:0 0 auto; width:6em; font-size:11.5px; }
.vs-ed-opick{ display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; }
.vs-ed-ob{ padding:4px 8px; border-radius:999px; border:1px dashed rgba(255,255,255,.20);
  background:transparent; color:rgba(243,245,255,.76); font:inherit; font-size:11px; cursor:pointer; }
.vs-ed-ob:hover{ background:rgba(255,255,255,.07); border-style:solid; }
.vs-ed-map{ display:block; width:100%; height:150px; border-radius:10px;
  border:1px solid ${PALETTE.line}; background:rgba(8,11,24,.6); margin-bottom:4px; }
.vs-ed-check{ display:flex; flex-direction:column; gap:2px; margin-bottom:6px; }
.vs-ed-good{ margin:0; font-size:11.5px; color:#5ae6be; }
.vs-ed-bad{ margin:0; font-size:11.5px; color:#ff8a97; font-weight:700; }
.vs-ed-coderow{ display:flex; gap:6px; margin-bottom:5px; }
.vs-ed-code{ width:100%; height:32px; padding:0 9px; border-radius:8px;
  border:1px solid ${PALETTE.line}; background:rgba(255,255,255,.05); color:#f3f5ff;
  font:inherit; font-size:11.5px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.vs-ed-mine{ display:flex; flex-direction:column; gap:3px; max-height:22vh; overflow-y:auto; }
.vs-ed-mrow{ display:flex; align-items:center; gap:6px; }
.vs-ed-mname{ flex:1 1 auto; text-align:left; padding:5px 8px; border-radius:8px;
  border:1px solid transparent; background:transparent; color:#f3f5ff; font:inherit;
  font-size:12px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-ed-mname:hover{ background:rgba(255,255,255,.07); }
.vs-ed-mmeta{ flex:0 0 auto; font-size:10.5px; color:rgba(243,245,255,.6); }
.vs-ed-mdel{ flex:0 0 auto; width:22px; height:22px; border-radius:6px;
  border:1px solid ${PALETTE.line}; background:transparent; color:rgba(243,245,255,.8);
  font:inherit; font-size:10px; cursor:pointer; }
.vs-ed-mdel:hover{ background:rgba(255,90,110,.24); }

@media (max-width: 900px){
  .vs-ed-grid{ grid-template-columns: 1fr; }
  .vs-ed-list{ max-height:none; }
}
`;
