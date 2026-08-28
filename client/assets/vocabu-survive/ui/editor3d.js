/* ══════════════════════════════════════════════════════════════════════════
   コースを 作る（立体）

   指摘: **実際の プレイ画面から 3D で 置いていく 形に した ほうが いい。**

   なので:
     ・遊ぶ ときと 同じ 絵の 中に コースが 建っている
     ・回して・寄って・見回して、**置きたい 所を 直に つつく**
     ・区画は 後ろへ 継ぎ足す（形が いつも 走れる ように）
     ・仕掛けは 床を つついた 場所に そのまま 落ちる
     ・置く たび 走れるかを 測って ○/× を 出す（vqsurvivegap と 同じ ものさし）

   ★ **自由に 何でも 置ける ように しない。**
     置き方を 自由に すると 跳べない コースが いくらでも 作れて しまい、
     作った 人が 自分の コースを 走れない。
     「区画の 列」という 骨は 残したまま、置き場だけ 立体に する。
   ══════════════════════════════════════════════════════════════════════════ */
import { h } from "./shell.js";
import { PALETTE } from "./theme.js";
import { THEME_NAMES, themeOf } from "../game/theme3d.js";
import { buildCourse } from "../game/course.js";
import { M, registerCourseMeshes } from "../game/meshes.js";
import { analyzeCourse, 越えられる隙間, 越えられる段差 } from "../game/analyze.js";
import { Renderer } from "../engine/renderer.js";
import { ThirdPersonCamera } from "../engine/camera.js";
import { m4, v3, clamp } from "../engine/math.js";
import { topOf } from "../game/physics.js";
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

const 既定 = {
  path: { len: 22, w: 12 }, ice: { len: 20, w: 10 }, bridge: { len: 22, w: 3.2 },
  gap: { len: 8 }, ramp: { len: 20, dy: 4, w: 10 }, turn: { len: 20, dx: 10, w: 11 },
  conveyor: { len: 20, w: 10, speed: 3.5, cz: -1, cx: 0 },
  stones: { count: 5, gap: 4, spread: 1.6, bob: 0.6 },
  movers: { count: 4, gap: 4.2, ax: 4, period: 3.4, stagger: 0.5 },
  gate: { limit: 12, gw: 7 }, checkpoint: { w: 12 }
};

export class Editor3DScreen {
  constructor(opt) {
    this.app = opt.app;
    this.onPlay = opt.onPlay || (() => {});
    this.onExit = opt.onExit || (() => {});
    this.title = "コースを 作る";
    this.course = newCourse();
    this.sel = 1;
    this.tool = "";          /* 置こうと している 仕掛け（空 = えらぶだけ） */
    this.built = null;
    this._t = 0;
    this._mat = m4.create();
    this._need = true;       /* 建て直しが 要るか */
    this.el = this._build();
  }

  /* ══ 画面 ══════════════════════════════════════════════════════════ */
  _build() {
    this.canvas = h("canvas", { class: "vs-e3-cv", "aria-label": "作っている コース" });

    this.nameInput = h("input", {
      class: "vs-e3-name", type: "text", maxlength: "40", "aria-label": "コースの 名前",
      oninput: (e) => { this.course.name = e.target.value.slice(0, 40); }
    });
    this.saveBtn = h("button", { class: "vs-btn is-sm is-mint", type: "button", onclick: () => this._save() }, "保存");
    this.playBtn = h("button", { class: "vs-btn is-sm", type: "button", onclick: () => this._play() }, "試しに 走る");

    /* 区画の 帯（上から 下へ の 並びを 横に 並べる） */
    this.stripEl = h("div", { class: "vs-e3-strip", role: "listbox", "aria-label": "区画の 並び" });

    /* 足す 区画 */
    this.addRow = h("div", { class: "vs-e3-add", role: "group", "aria-label": "区画を 足す" });
    for (const k of SECTION_KINDS) {
      if (k.固) continue;
      this.addRow.appendChild(h("button", {
        class: "vs-e3-addb", type: "button", "data-add": k.t,
        onclick: () => this._add(k.t)
      }, "＋ " + k.名));
    }

    /* 置く 仕掛け */
    this.obsRow = h("div", { class: "vs-e3-obs", role: "radiogroup", "aria-label": "置く 仕掛け" });
    this.obsRow.appendChild(h("button", {
      class: "vs-e3-ob", type: "button", role: "radio", "data-tool": "",
      onclick: () => this._setTool("")
    }, "手（えらぶ）"));
    for (const o of OBS_KINDS) {
      this.obsRow.appendChild(h("button", {
        class: "vs-e3-ob", type: "button", role: "radio", "data-tool": o.t,
        onclick: () => this._setTool(o.t)
      }, o.名));
    }

    this.propEl = h("div", { class: "vs-e3-prop", "aria-label": "えらんだ 区画" });
    this.checkEl = h("div", { class: "vs-e3-check", role: "status", "aria-live": "polite" });
    this.hintEl = h("p", { class: "vs-e3-hint" });

    /* 風景 */
    this.themeRow = h("div", { class: "vs-e3-themes", role: "radiogroup", "aria-label": "風景" });
    for (const t of THEME_NAMES) {
      const b = h("button", {
        class: "vs-e3-theme", type: "button", role: "radio", "data-th": t,
        "aria-label": THEME_LABEL[t] || t, title: THEME_LABEL[t] || t,
        onclick: () => { this.course.theme = t; this._need = true; this._render(); }
      }, THEME_LABEL[t] || t);
      const dot = document.createElement("i");
      dot.className = "vs-e3-tdot";
      const th = themeOf(t);
      dot.style.background = "rgb(" + th.sky.horizon.map((v) => Math.round(v * 255)).join(",") + ")";
      b.insertBefore(dot, b.firstChild);
      this.themeRow.appendChild(b);
    }

    /* 受け渡しと 手持ち */
    this.codeInput = h("input", {
      class: "vs-e3-code", type: "text", "aria-label": "合言葉",
      placeholder: "VS1… を 貼ると 読み込めます", autocomplete: "off", spellcheck: "false"
    });
    this.copyBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._copy() }, "合言葉を 作る");
    this.loadBtn = h("button", { class: "vs-btn is-sm is-ghost", type: "button", onclick: () => this._loadCode() }, "読み込む");
    this.codeNote = h("p", { class: "vs-e3-note" });
    this.minesEl = h("div", { class: "vs-e3-mine", "aria-label": "作った コース" });

    this.sideEl = h("aside", { class: "vs-e3-side" },
      this.propEl,
      h("div", { class: "vs-e3-lab", text: "走れるか" }), this.checkEl,
      h("div", { class: "vs-e3-lab", text: "風景" }), this.themeRow,
      h("div", { class: "vs-e3-lab", text: "受け渡し（合言葉）" }),
      h("div", { class: "vs-e3-coderow" }, this.copyBtn, this.loadBtn),
      this.codeInput, this.codeNote,
      h("div", { class: "vs-e3-lab", text: "作った コース" }), this.minesEl);

    return h("div", { class: "vs-e3" },
      this.canvas,
      h("header", { class: "vs-e3-top" },
        h("h1", { class: "vs-e3-title" }, "コースを 作る"),
        this.nameInput,
        h("div", { class: "vs-e3-topbtns" }, this.playBtn, this.saveBtn,
          h("button", {
            class: "vs-lb-x", type: "button", "aria-label": "ロビーへ 戻る",
            onclick: () => this.onExit()
          }, "✕"))),
      this.sideEl,
      h("footer", { class: "vs-e3-bottom" },
        this.hintEl,
        h("div", { class: "vs-e3-lab", text: "区画（走る 順）" }), this.stripEl,
        h("div", { class: "vs-e3-rows" },
          h("div", { class: "vs-e3-col" }, h("div", { class: "vs-e3-lab", text: "区画を 足す" }), this.addRow),
          h("div", { class: "vs-e3-col" }, h("div", { class: "vs-e3-lab", text: "仕掛けを 置く（床を つつく）" }), this.obsRow))));
  }

  /* ══ 立体 ══════════════════════════════════════════════════════════ */
  _glOn() {
    if (this.renderer || this._glFailed) return;
    try {
      const s = Object.assign({}, (this.app && this.app.settings) || {}, { drawDistance: 260 });
      const R = new Renderer(this.canvas, s);
      this.renderer = R;
      registerCourseMeshes(R);
      this.cam = new ThirdPersonCamera();
      /* ★ 初めは **斜め 上から**。近すぎると コースの 中に 潜って
         「どこを 作っているのか」が 分からない（実写で 気づいた）。 */
      this.cam.wantDistance = 38;
      this.cam.maxDistance = 160;
      this.cam.minDistance = 5;
      this.cam.wantPitch = 0.86;
      this.cam.pitchMax = 1.45;
      this.cam.height = 0;
      this.focus = [0, 2, -30];
      this.cam.snap(this.focus, 0);
      this._bindPointer();
    } catch (e) {
      this._glFailed = true;
      try { this.canvas.style.display = "none"; } catch (_) {}
      console.warn("[VocabuSurvive] 作る 画面の 立体を 出せません:", e && e.message);
    }
  }

  _bindPointer() {
    const cv = this.canvas;
    let down = false, moved = 0, lx = 0, ly = 0, pan = false;
    const 押 = (e) => {
      down = true; moved = 0; lx = e.clientX; ly = e.clientY;
      pan = e.button === 1 || e.button === 2 || e.shiftKey;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const 動 = (e) => {
      if (!down) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pan) this._pan(dx, dy);
      else if (this.cam) this.cam.rotate(dx, dy);
    };
    const 離 = (e) => {
      if (!down) return;
      down = false;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      /* ★ **引きずった ときは 置かない。** 見回すたびに 物が 増えると 使えない。 */
      if (moved < 6) this._pick(e);
    };
    cv.addEventListener("pointerdown", 押);
    cv.addEventListener("pointermove", 動);
    cv.addEventListener("pointerup", 離);
    cv.addEventListener("pointercancel", () => { down = false; });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.cam) this.cam.zoom(e.deltaY);
    }, { passive: false });
  }

  /** 画面を 平行に 動かす（見ている 点を ずらす）。 */
  _pan(dx, dy) {
    if (!this.cam) return;
    const k = this.cam.distance * 0.0022;
    const cy = Math.cos(this.cam.yaw), sy = Math.sin(this.cam.yaw);
    /* 右向き = (cy, 0, -sy)。前向きの 水平 = (-sy, 0, -cy)。 */
    this.focus[0] += (-cy * dx + sy * dy) * k;
    this.focus[2] += (sy * dx + cy * dy) * k;
  }

  /** 画面の 点から 光線を 作り、床に 当たった 場所を 返す。 */
  _rayAt(clientX, clientY) {
    const R = this.renderer, cam = this.cam;
    if (!R || !cam || !this.built) return null;
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const aspect = r.width / r.height;
    const tan = Math.tan(cam.fov / 2);
    /* 目 → 狙う点 の 向き（camera._place と 同じ 決まり） */
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const fwd = [-sy * cp, -sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ];
    const d = [
      fwd[0] + right[0] * nx * tan * aspect + up[0] * ny * tan,
      fwd[1] + right[1] * nx * tan * aspect + up[1] * ny * tan,
      fwd[2] + right[2] * nx * tan * aspect + up[2] * ny * tan
    ];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= L; d[1] /= L; d[2] /= L;
    return this._march([cam.pos[0], cam.pos[1], cam.pos[2]], d);
  }

  /* 光線を 進めて **床の 面**を 探す。
     ★ world.ray は 使えない。あれは カメラが 壁に 潜らない ため の もので、
       長さを いくら 渡しても **64 回しか** 試さない（400m なら 6m 飛ばし）。
       薄い 床は そのまま 跨いで しまい、どこも 当たらなく なる（実測）。
     ここでは 高さの 差の 符号が 変わった ところを 探し、そこを 挟み撃ちに する。 */
  _march(from, d) {
    const w = this.built.world;
    const tmp = [];
    const 面 = (x, z) => {
      w.near(x, z, 1.6, tmp);
      let top = null;
      for (const s2 of tmp) {
        if (!s2.solid || !s2.enabled) continue;
        const v = topOf(s2, x, z, 0.3);
        if (v === null) continue;
        if (top === null || v > top) top = v;
      }
      return top;
    };
    const MAX = 420, STEP = 0.6;
    let prevT = 0, prevGap = null;
    for (let t = STEP; t <= MAX; t += STEP) {
      const x = from[0] + d[0] * t, y = from[1] + d[1] * t, z = from[2] + d[2] * t;
      const top = 面(x, z);
      if (top === null) { prevGap = null; prevT = t; continue; }
      const gap = y - top;
      if (gap <= 0) {
        /* 跨いだ。前の 点との 間を 挟み撃ち。 */
        let lo = prevGap === null ? t - STEP : prevT, hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          const mx = from[0] + d[0] * mid, my = from[1] + d[1] * mid, mz = from[2] + d[2] * mid;
          const mt = 面(mx, mz);
          if (mt === null || my - mt > 0) lo = mid; else hi = mid;
        }
        return {
          x: from[0] + d[0] * hi, y: from[1] + d[1] * hi, z: from[2] + d[2] * hi
        };
      }
      prevGap = gap; prevT = t;
    }
    return null;
  }

  /** つついた 所の 区画を 探す（走る 向きの 距離で 見る）。 */
  _sectionAt(z) {
    const at = this.built && this.built.sectionAt;
    if (!at) return -1;
    for (let i = 0; i + 1 < at.length; i++) {
      const a = at[i].z, b = at[i + 1].z;
      if (z <= a && z >= b) return i;
    }
    return -1;
  }

  _pick(e) {
    const p = this._rayAt(e.clientX, e.clientY);
    if (!p) { this.hintEl.textContent = "床の 上を つついて ください。"; return; }
    const i = this._sectionAt(p.z);
    if (i < 0) return;
    if (!this.tool) { this.sel = i; this._render(); return; }
    /* 仕掛けを その場に 落とす */
    const sec = this.course.sections[i];
    if (!sec || sec.t === "finish" || sec.t === "start" || sec.t === "gate" || sec.t === "checkpoint") {
      this.hintEl.textContent = "この 区画には 仕掛けを 置けません。";
      return;
    }
    if (!sec.obs) sec.obs = [];
    if (sec.obs.length >= 4) { this.hintEl.textContent = "この 区画は もう 4 つ です。"; return; }
    const at = this.built.sectionAt;
    const dz = Math.max(0, Math.min(40, Math.round((at[i].z - p.z) * 10) / 10));
    const dx = Math.max(-12, Math.min(12, Math.round((p.x - at[i].cx) * 10) / 10));
    const o = OBS_KINDS.filter((x) => x.t === this.tool)[0];
    const q = Object.assign({ t: this.tool, dz }, o ? o.既 : {});
    if (Math.abs(dx) > 0.4) q.dx = dx;
    sec.obs.push(q);
    this.sel = i;
    this._need = true;
    this.hintEl.textContent = (o ? o.名 : this.tool) + " を 置きました（" + (i + 1) + " 番目・" + dz + "m）。";
    this._render();
  }

  _setTool(t) {
    this.tool = t || "";
    for (const b of this.obsRow.children) {
      b.setAttribute("aria-checked", b.getAttribute("data-tool") === this.tool ? "true" : "false");
    }
    this.hintEl.textContent = this.tool
      ? "床を つつくと そこへ 置きます。"
      : "床を つつくと その 区画を えらびます。引きずると 見回し、車輪で 寄り引き。";
  }

  /* ══ 区画 ══════════════════════════════════════════════════════════ */
  _add(t) {
    const s = Object.assign({ t }, 既定[t] || {});
    const fin = this.course.sections.findIndex((x) => x.t === "finish");
    const at = fin < 0 ? this.course.sections.length : fin;
    this.course.sections.splice(at, 0, s);
    this.sel = at;
    this._need = true;
    this._render();
    this._lookAtSel();
  }
  _remove(i) {
    const s = this.course.sections[i];
    if (!s || s.t === "start" || s.t === "finish") return;
    this.course.sections.splice(i, 1);
    this.sel = Math.max(1, Math.min(this.sel, this.course.sections.length - 1));
    this._need = true;
    this._render();
  }
  _move(i, d) {
    const a = this.course.sections;
    const j = i + d;
    if (j < 1 || j >= a.length - 1) return;
    if (a[i].t === "start" || a[i].t === "finish") return;
    const t = a[i]; a[i] = a[j]; a[j] = t;
    this.sel = j;
    this._need = true;
    this._render();
  }
  /** えらんだ 区画の 上へ 視点を 運ぶ。 */
  _lookAtSel() {
    if (!this.built || !this.built.sectionAt) return;
    const at = this.built.sectionAt;
    const i = Math.max(0, Math.min(at.length - 2, this.sel));
    const a = at[i], b = at[i + 1] || at[i];
    this.focus[0] = (a.cx + b.cx) / 2;
    this.focus[1] = (a.y + b.y) / 2 + 1.5;
    this.focus[2] = (a.z + b.z) / 2;
  }

  /* ══ 走れるか ══════════════════════════════════════════════════════ */
  _rebuild() {
    try {
      this.built = buildCourse(toDef(this._clean()));
      if (this.renderer) this.built.applySky(this.renderer);
      return true;
    } catch (e) {
      this.built = null;
      return false;
    }
  }
  _clean() {
    const c = Object.assign({}, this.course);
    c.sections = cleanSections(this.course.sections)
      .filter((s) => s.t !== "start" && s.t !== "finish");
    c.sections.unshift({ t: "start", w: 18, len: 16 });
    c.sections.push({ t: "finish" });
    return c;
  }
  _check() {
    this.checkEl.textContent = "";
    const c = this.built;
    if (!c) {
      this.checkEl.appendChild(h("p", { class: "vs-e3-bad", text: "組み立てられません。" }));
      return;
    }
    let a = null;
    try { a = analyzeCourse(c); } catch (e) { a = null; }
    const 門 = c.gates.length, 中 = c.checkpoints.length;
    const 行 = (t, よ) => this.checkEl.appendChild(
      h("p", { class: よ ? "vs-e3-good" : "vs-e3-bad", text: (よ ? "○ " : "× ") + t }));
    行("長さ " + Math.round(c.length) + "m", c.length >= 60);
    行("クイズの 門 " + 門 + " つ", 門 >= 1);
    行("中間地点 " + 中 + " つ", 中 >= 1);
    if (a) {
      行("いちばん 広い すきま " + a.gap.toFixed(1) + "m（跳べるのは " + a.gapMax + "m）", a.gap <= a.gapMax);
      行("いちばん 高い 段差 " + a.step.toFixed(1) + "m（上れるのは " + 越えられる段差 + "m）", a.step <= 越えられる段差);
      if (a.far > 0) 行("板から 板へ " + a.far.toFixed(1) + "m（届くのは " + 越えられる隙間 + "m）", a.far <= 越えられる隙間);
    }
    this._ok = !!(a && a.ok && c.length >= 60 && 門 >= 1 && 中 >= 1);
    if (!this._ok) {
      this.checkEl.appendChild(h("p", { class: "vs-e3-note",
        text: "× が 残っていても 走れます。ただし 途中で 進めなく なる かも。" }));
    }
    /* 立体でも 分かる ように 色を 変える */
    this.el.setAttribute("data-ok", this._ok ? "1" : "0");
  }

  /* ══ 保存・受け渡し ════════════════════════════════════════════════ */
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
    try {
      this.codeInput.select();
      await navigator.clipboard.writeText(code);
      this.codeNote.textContent = "写しました。貼って 渡せます。";
    } catch (e) { this.codeNote.textContent = "上の 文字を まるごと 渡してください。"; }
  }
  _loadCode() {
    const c = importCode(this.codeInput.value, MY_PREFIX + "i" + Math.random().toString(36).slice(2, 8));
    if (!c) { this.codeNote.textContent = "読めませんでした。VS1 から 始まる 文字を 貼ってください。"; return; }
    this.course = c;
    this.sel = 1;
    this._need = true;
    this.codeNote.textContent = "読み込みました。保存すると 残ります。";
    this._render();
    this._lookAtSel();
  }
  async _loadMine() {
    const list = await listMyCourses();
    this.minesEl.textContent = "";
    if (!list.length) {
      this.minesEl.appendChild(h("p", { class: "vs-e3-note", text: "まだ ありません。" }));
      return;
    }
    for (const c of list) {
      this.minesEl.appendChild(h("div", { class: "vs-e3-mrow" },
        h("button", {
          class: "vs-e3-mname", type: "button",
          onclick: async () => {
            const got = await getMyCourse(c.id);
            if (got) { this.course = got; this.sel = 1; this._need = true; this._render(); this._lookAtSel(); }
          }
        }, c.name),
        h("span", { class: "vs-e3-mmeta", text: (c.sections || []).length + " 区画" }),
        h("button", {
          class: "vs-e3-ib is-del", type: "button", "aria-label": c.name + " を 消す", title: "消す",
          onclick: async () => { await deleteMyCourse(c.id); this._loadMine(); }
        }, "✕")));
    }
  }

  /* ══ 描き直す ══════════════════════════════════════════════════════ */
  _render() {
    if (this.nameInput.value !== this.course.name) this.nameInput.value = this.course.name;
    for (const b of this.themeRow.children) {
      b.setAttribute("aria-checked", b.getAttribute("data-th") === this.course.theme ? "true" : "false");
    }
    if (this._need) { this._rebuild(); this._need = false; }

    /* 区画の 帯 */
    this.stripEl.textContent = "";
    const a = this.course.sections;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      const k = SECTION_KINDS.filter((x) => x.t === s.t)[0];
      const 固 = !!(k && k.固);
      const b = h("button", {
        class: "vs-e3-chip", type: "button", role: "option", "data-i": String(i),
        "aria-selected": i === this.sel ? "true" : "false",
        onclick: () => { this.sel = i; this._render(); this._lookAtSel(); }
      }, h("span", { class: "vs-e3-chip-n vs-mono", text: String(i + 1) }),
         h("span", { class: "vs-e3-chip-k", text: k ? k.名 : s.t }),
         (s.obs && s.obs.length) ? h("span", { class: "vs-e3-chip-o", text: "◆" + s.obs.length }) : null);
      if (固) b.setAttribute("data-fixed", "1");
      this.stripEl.appendChild(b);
    }

    /* えらんだ 区画 */
    this.propEl.textContent = "";
    const s = a[this.sel];
    if (s) {
      const k = SECTION_KINDS.filter((x) => x.t === s.t)[0];
      const 固 = !!(k && k.固);
      this.propEl.appendChild(h("div", { class: "vs-e3-ph" },
        h("h2", { class: "vs-e3-ph-t", text: (k ? k.名 : s.t) + "（" + (this.sel + 1) + " 番目）" }),
        固 ? null : h("span", { class: "vs-e3-ph-b" },
          h("button", { class: "vs-e3-ib", type: "button", "aria-label": "前へ", title: "前へ",
            onclick: () => this._move(this.sel, -1) }, "◀"),
          h("button", { class: "vs-e3-ib", type: "button", "aria-label": "後ろへ", title: "後ろへ",
            onclick: () => this._move(this.sel, 1) }, "▶"),
          h("button", { class: "vs-e3-ib is-del", type: "button", "aria-label": "この 区画を 消す", title: "消す",
            onclick: () => this._remove(this.sel) }, "✕"))));
      for (const [名, key, lo, hi, st] of (FIELDS[s.t] || [])) {
        const v = s[key] === undefined ? lo : s[key];
        const out = h("span", { class: "vs-e3-fv vs-mono", text: String(v) });
        this.propEl.appendChild(h("div", { class: "vs-e3-field" },
          h("span", { class: "vs-e3-fn", text: 名 }),
          h("input", {
            class: "vs-lb-range", type: "range", min: String(lo), max: String(hi), step: String(st),
            value: String(v), "aria-label": 名,
            oninput: (e) => {
              s[key] = Number(e.target.value);
              out.textContent = String(s[key]);
              this._need = true;
              this._rebuild(); this._need = false;
              this._check();
            }
          }), out));
      }
      if (s.t === "path" || s.t === "ice") {
        this.propEl.appendChild(h("button", {
          class: "vs-lb-toggle", type: "button", "aria-pressed": s.wall ? "true" : "false",
          onclick: () => { s.wall = !s.wall; this._need = true; this._render(); }
        }, "落ちない ふちを 付ける"));
      }
      /* この 区画に 置いた 仕掛け */
      if (s.obs && s.obs.length) {
        this.propEl.appendChild(h("div", { class: "vs-e3-lab", text: "置いた 仕掛け" }));
        const box = h("div", { class: "vs-e3-olist" });
        for (let j = 0; j < s.obs.length; j++) {
          const q = s.obs[j];
          const nm = OBS_KINDS.filter((x) => x.t === q.t)[0];
          box.appendChild(h("div", { class: "vs-e3-orow" },
            h("span", { class: "vs-e3-on", text: (nm ? nm.名 : q.t) + " " + (q.dz || 0) + "m" }),
            h("button", {
              class: "vs-e3-ib is-del", type: "button", "aria-label": "消す",
              onclick: () => { s.obs.splice(j, 1); this._need = true; this._render(); }
            }, "✕")));
        }
        this.propEl.appendChild(box);
      }
    }

    this._check();
  }

  /* ══ 毎コマ ════════════════════════════════════════════════════════ */
  tick(dt) {
    const R = this.renderer;
    if (!R || !R.gl || !this.built) return;
    this._t += dt;
    const sz = R.resize();
    if (sz.w < 4 || sz.h < 4) return;
    this.cam.update(dt, this.focus, 0, sz.w / Math.max(1, sz.h));
    R.shadowCenter[0] = this.focus[0];
    R.shadowCenter[1] = this.focus[1];
    R.shadowCenter[2] = this.focus[2];
    R.shadowRadius = 34;
    R.begin(this.cam);
    this.built.draw(R, this._t);

    /* えらんでいる 区画を 光らせる */
    const at = this.built.sectionAt;
    if (at && at[this.sel] && at[this.sel + 1]) {
      /* ★ **床を 塗りつぶさない。** 塗ると 何が 置いて あるか 見えなく なる。
         区画の 始めと 終わりに 細い 帯を 立て、上に 印を 浮かせる。 */
      const a = at[this.sel], b = at[this.sel + 1];
      const pulse = 0.5 + Math.sin(this._t * 3) * 0.3;
      const col = [0.36, 0.92, 0.76, 1];
      for (const p of [a, b]) {
        m4.compose(this._mat, p.cx, p.y + 0.45, p.z, 0, 26, 0.9, 0.34);
        R.draw(M.slab, this._mat, col, pulse * 0.8, 0.55, 0, 0, 26);
      }
      const cx = (a.cx + b.cx) / 2, cz = (a.z + b.z) / 2, cy = (a.y + b.y) / 2;
      const bob = Math.sin(this._t * 2.2) * 0.35;
      m4.compose(this._mat, cx, cy + 5.2 + bob, cz, this._t * 1.2, 1.5, 2.4, 1.5);
      R.draw(M.cone, this._mat, col, pulse, 0.5, 0, 0, 2.4);
    }
    R.end(dt);
  }

  async enter(arg) {
    if (arg && arg.course) { this.course = arg.course; this.sel = 1; }
    this._glOn();
    this._need = true;
    this._setTool("");
    this._render();
    this._lookAtSel();
    this._loadMine();
  }
  exit() {
    if (this.renderer) { try { this.renderer.destroy(); } catch (e) {} this.renderer = null; }
  }
  resize() {}
}

export const EDITOR3D_CSS = `
.vs-e3{ position:absolute; inset:0; overflow:hidden; background:${PALETTE.bgDeep}; }
.vs-e3-cv{ position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }

.vs-e3-top{ position:absolute; left:0; right:0; top:0; z-index:5;
  display:flex; align-items:center; gap:10px; padding:10px 12px; pointer-events:none; }
.vs-e3-top > *{ pointer-events:auto; }
.vs-e3-title{ margin:0; font-size:15px; font-weight:750; white-space:nowrap;
  padding:6px 12px; border-radius:var(--vs-r-full); background:var(--vs-surface);
  border:1px solid var(--vs-line); }
.vs-e3-name{ flex:0 1 300px; height:32px; padding:0 11px; border-radius:var(--vs-r-sm);
  border:1px solid var(--vs-line); background:var(--vs-surface); color:var(--vs-ink);
  font:inherit; font-size:13px; }
.vs-e3-topbtns{ margin-left:auto; display:flex; align-items:center; gap:6px; }

.vs-e3-side{ position:absolute; right:12px; top:62px; bottom:214px; z-index:4; width:284px;
  overflow-y:auto; padding:11px 13px; border-radius:var(--vs-r-md);
  background:var(--vs-surface); border:1px solid var(--vs-line); }
.vs-e3-lab{ font-size:10.5px; font-weight:650; letter-spacing:.08em;
  color:var(--vs-ink-sub); margin:9px 0 4px; }
.vs-e3-ph{ display:flex; align-items:center; gap:8px; }
.vs-e3-ph-t{ margin:0; font-size:14px; font-weight:750; }
.vs-e3-ph-b{ margin-left:auto; display:flex; gap:3px; }
.vs-e3-ib{ width:24px; height:24px; border-radius:var(--vs-r-xs); border:1px solid ${PALETTE.line};
  background:transparent; color:var(--vs-ink); font:inherit; font-size:10px; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; padding:0; }
.vs-e3-ib:hover{ background:var(--vs-surface-3); }
.vs-e3-ib.is-del:hover{ background:var(--vs-danger-bg); color:var(--vs-danger-text); }
.vs-e3-field{ display:flex; align-items:center; gap:8px; margin:4px 0; }
.vs-e3-fn{ flex:0 0 auto; width:5.4em; font-size:11.5px; color:var(--vs-ink-sub); }
.vs-e3-field .vs-lb-range{ flex:1 1 auto; }
.vs-e3-fv{ flex:0 0 auto; width:3.1em; text-align:right; font-size:12px; font-weight:650; }
.vs-e3-olist{ display:flex; flex-direction:column; gap:2px; }
.vs-e3-orow{ display:flex; align-items:center; gap:6px; font-size:11.5px; }
.vs-e3-on{ flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-e3-check{ display:flex; flex-direction:column; gap:1px; }
.vs-e3-good{ margin:0; font-size:11.5px; color:var(--vs-good-text); }
.vs-e3-bad{ margin:0; font-size:11.5px; color:var(--vs-danger-text); font-weight:650; }
.vs-e3-note{ margin:3px 0 0; font-size:11px; color:var(--vs-ink-sub); line-height:1.7; }
.vs-e3-themes{ display:flex; flex-wrap:wrap; gap:4px; }
.vs-e3-theme{ display:inline-flex; align-items:center; gap:5px; padding:4px 10px 4px 7px;
  border-radius:var(--vs-r-full); border:1px solid ${PALETTE.line}; background:transparent;
  color:var(--vs-ink); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-e3-theme[aria-checked="true"]{ background:var(--vs-surface-3); color:var(--vs-ink);
  font-weight:650; border-width:2px; }
.vs-e3-tdot{ width:9px; height:9px; border-radius:50%; flex:0 0 auto;
  box-shadow:inset 0 0 0 1px var(--vs-line); }
.vs-e3-coderow{ display:flex; gap:6px; margin-bottom:5px; }
.vs-e3-code{ width:100%; height:30px; padding:0 9px; border-radius:var(--vs-r-xs);
  border:1px solid var(--vs-line); background:var(--vs-surface-2); color:var(--vs-ink);
  font:inherit; font-size:11px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.vs-e3-mine{ display:flex; flex-direction:column; gap:3px; }
.vs-e3-mrow{ display:flex; align-items:center; gap:6px; }
.vs-e3-mname{ flex:1 1 auto; text-align:left; padding:5px 8px; border-radius:var(--vs-r-xs);
  border:1px solid transparent; background:transparent; color:var(--vs-ink); font:inherit;
  font-size:12px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vs-e3-mname:hover{ background:var(--vs-surface-2); }
.vs-e3-mmeta{ flex:0 0 auto; font-size:10.5px; color:var(--vs-ink-sub); }

.vs-e3-bottom{ position:absolute; left:12px; right:308px; bottom:12px; z-index:3;
  padding:9px 12px 11px; border-radius:var(--vs-r-md);
  background:var(--vs-surface); border:1px solid var(--vs-line); }
.vs-e3-hint{ margin:0 0 5px; font-size:11.5px; color:${PALETTE.mint}; min-height:1.2em; }
.vs-e3-strip{ display:flex; gap:4px; overflow-x:auto; padding-bottom:4px; }
.vs-e3-chip{ flex:0 0 auto; display:flex; align-items:center; gap:5px;
  padding:5px 9px; border-radius:var(--vs-r-sm); cursor:pointer; font:inherit; font-size:11.5px;
  border:1px solid var(--vs-line); background:var(--vs-surface-2); color:var(--vs-ink); }
.vs-e3-chip:hover{ background:var(--vs-surface-3); }
.vs-e3-chip[aria-selected="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft); color:var(--vs-accent-text); font-weight:650; }
.vs-e3-chip[data-fixed="1"]{ opacity:.72; }
.vs-e3-chip-n{ font-size:10px; color:var(--vs-ink-sub); }
.vs-e3-chip-o{ font-size:10px; color:var(--vs-danger-text); }
.vs-e3-rows{ display:flex; gap:12px; margin-top:6px; flex-wrap:wrap; }
.vs-e3-col{ flex:1 1 260px; min-width:0; }
.vs-e3-add, .vs-e3-obs{ display:flex; flex-wrap:wrap; gap:4px; }
.vs-e3-addb{ padding:4px 9px; border-radius:var(--vs-r-full); border:1px dashed var(--vs-line-strong);
  background:transparent; color:var(--vs-ink); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-e3-addb:hover{ background:var(--vs-surface-3); border-style:solid; }
.vs-e3-ob{ padding:4px 9px; border-radius:var(--vs-r-full); border:1px solid var(--vs-line);
  background:transparent; color:var(--vs-ink); font:inherit; font-size:11.5px; cursor:pointer; }
.vs-e3-ob:hover{ background:var(--vs-surface-3); }
.vs-e3-ob[aria-checked="true"]{ border-color:var(--vs-accent); background:var(--vs-accent-soft);
  color:var(--vs-ink); font-weight:650; }

@media (max-width: 1000px){
  .vs-e3-side{ right:10px; top:56px; bottom:auto; max-height:44%; width:min(260px,46%); }
  .vs-e3-bottom{ right:10px; left:10px; }
  .vs-e3-name{ flex:1 1 auto; }
}
`;
