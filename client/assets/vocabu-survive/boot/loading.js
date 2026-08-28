/* ══════════════════════════════════════════════════════════════════════════
   読み込み画面。

   要件（そのまま）:
     VOCABUSURVIVE / 立体の キャラクター / START / 読み込みの 印 / 版

   ここで やること:
     ① 立体の 場面を 1 つ 作る（本編と 同じ 描画の 土台。ここで 温める）
     ② 裏で 本編の 部品を 読み終える
     ③ START が 押せるように なる

   ★ 「押せるまで 待たせない」。読み込みが 終わる前でも START は 出す。
     押されたら そこで 待つ。待ち時間の 体感が 半分に なる。
   ══════════════════════════════════════════════════════════════════════════ */
import { h, svg } from "../ui/shell.js";
import { PALETTE, BEAN_COLORS } from "../ui/theme.js";
import { VERSION } from "../version.js";
import { Renderer } from "../engine/renderer.js";
import { ThirdPersonCamera } from "../engine/camera.js";
import * as MESH from "../engine/mesh.js";
import { m4, mulberry32, TAU, clamp } from "../engine/math.js";
import { BeanVisual, registerBeanMeshes } from "../game/bean.js";

const TITLE = "VOCABUSURVIVE";

/* ★ 題字は もとは 1 文字ずつ 虹に していたが、本体の どこにも
   そういう 表現は 無い（サイドバーの「VocabuQuiz」も ただの 文字）。
   VOCABU は 文字の 色、SURVIVE は アプリの アクセント色。 */
const TITLE_SPLIT = "VOCABU".length;
function titleColorAt(i) {
  return i < TITLE_SPLIT ? "var(--vs-ink)" : "var(--vs-accent)";
}

export class LoadingScreen {
  /**
   * @param {object} opts
   * @param {object} opts.settings caps.settingsFor() の 戻り
   * @param {(p:number)=>void} [opts.onProgress]
   * @param {()=>void} opts.onStart
   */
  constructor(opts) {
    this.settings = opts.settings;
    this.onStart = opts.onStart || (() => {});
    this.title = "VocabuSurvive 読み込み画面";
    this.progress = 0;
    this.ready = false;
    this.started = false;
    this._t = 0;
    this._renderer = null;
    this._cam = null;
    this._beans = [];
    this._mat = m4.create();
    this._glFailed = false;

    this.el = this._build();
  }

  _build() {
    const cv = h("canvas", { class: "vs-canvas", "aria-hidden": "true" });
    this.canvas = cv;

    /* 題字。1 文字ずつ 遅らせて 出す。
       ★ 色は **1 文字ずつ 直に 入れる**。
         「背景を 文字型に 切り抜く」書き方は、文字が 子要素に 入っていると
         効かない 環境が あり、**題字が 丸ごと 消えた**（2026-08-28 実測）。
         こちらなら どこでも 同じに 出る。 */
    const titleEl = h("h1", { class: "vs-load-title", "aria-label": "VocabuSurvive" });
    for (let i = 0; i < TITLE.length; i++) {
      const sp = h("span", {
        class: "vs-load-ch", "aria-hidden": "true",
        style: "animation-delay:" + (i * 42) + "ms;color:" + titleColorAt(i)
      }, TITLE[i]);
      titleEl.appendChild(sp);
    }

    this.barFill = h("i", { class: "vs-load-fill" });
    this.pctEl = h("span", { class: "vs-load-pct vs-mono", text: "0%" });
    this.stepEl = h("span", { class: "vs-load-step", text: "準備しています" });

    this.startBtn = h("button", {
      class: "vs-btn vs-load-start", type: "button",
      onclick: () => this._start()
    }, "START");
    this.startBtn.disabled = false;

    this.hintEl = h("p", { class: "vs-load-hint", text: "クイズを解きながら走る、8人までのアスレチック。" });

    const bar = h("div", {
      class: "vs-load-bar", role: "progressbar",
      "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0",
      "aria-label": "読み込み"
    }, this.barFill);
    this.barEl = bar;

    /* 上に 題字、下に START。真ん中は **キャラクターの ため に 空ける**。
       前は 全部 真ん中に 積んでいて、せっかくの 立体が 文字で 隠れていた。 */
    return h("div", { class: "vs-load" },
      cv,
      h("div", { class: "vs-load-vignette", "aria-hidden": "true" }),
      h("div", { class: "vs-load-top" },
        h("div", { class: "vs-load-badge" },
          svg("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" },
            svg("path", { d: "M12 3c2.6 2.1 4 4.6 4 7.4A4 4 0 0 1 12 15a4 4 0 0 1-4-4.6C8 7.6 9.4 5.1 12 3Z", style: "fill:var(--vs-accent)" }),
            svg("path", { d: "M12 15v6", style: "stroke:var(--vs-accent);fill:none", "stroke-width": "2", "stroke-linecap": "round" })
          ),
          h("span", { text: "VocabuQuiz" })
        ),
        titleEl,
        this.hintEl
      ),
      h("div", { class: "vs-load-bottom" },
        this.startBtn,
        h("div", { class: "vs-load-status" }, bar, h("div", { class: "vs-load-line" }, this.stepEl, this.pctEl))
      ),
      h("div", { class: "vs-load-ver vs-mono", text: "v" + VERSION })
    );
  }

  /* ── 立体の 場面 ─────────────────────────────────────────────────── */
  _initGL() {
    if (this._renderer || this._glFailed) return;
    try {
      /* 読み込み画面は 軽くする。本編の 段の 1 つ下（最低 low）。 */
      const s = Object.assign({}, this.settings, {
        drawDistance: 90,
        shadowSize: Math.min(1024, this.settings.shadowSize || 1024),
        clouds: false
      });
      const R = new Renderer(this.canvas, s);
      this._renderer = R;
      R.sky.top = [0.10, 0.12, 0.30];
      R.sky.horizon = [0.30, 0.20, 0.52];
      R.sky.ground = [0.05, 0.06, 0.16];
      R.sky.sun = [1.0, 0.72, 0.45];
      R.ambTop = [0.30, 0.28, 0.46];
      R.ambBottom = [0.14, 0.12, 0.22];
      R.fog.color = [0.16, 0.14, 0.32];
      R.fog.near = 28; R.fog.far = 86;
      R.light.dir.set([-0.38, -0.72, -0.58]);
      R.shadowRadius = 9;

      R.addMesh("vs_load_pad", [MESH.cylinder(30, 3.0, 3.2, 0.55, true), MESH.cylinder(14, 3.0, 3.2, 0.55, true)]);
      R.addMesh("vs_load_cube", [MESH.roundedBox(3, 0.16), MESH.roundedBox(1, 0.14)]);
      R.addMesh("vs_load_ring", [MESH.torus(26, 10, 0.5, 0.09), MESH.torus(12, 6, 0.5, 0.09)]);
      registerBeanMeshes(R);

      this._cam = new ThirdPersonCamera();
      this._cam.wantDistance = 9.2;   /* 台と 輪が 収まる 距離（実測で 決めた） */
      this._cam.wantPitch = 0.24;
      this._cam.height = 0.75;
      this._cam.snap([0, 0, 0], 0);

      /* 主役 1 人 ＋ 後ろで 跳ねる 3 人 */
      const rnd = mulberry32(20260828);
      this._beans = [];
      for (let i = 0; i < 4; i++) {
        const c = BEAN_COLORS[(i * 3 + 1) % BEAN_COLORS.length];
        const b = new BeanVisual(c.rgb);
        b.phase = rnd() * TAU;
        this._beans.push({
          v: b,
          x: i === 0 ? 0 : (rnd() - 0.5) * 9,
          z: i === 0 ? 0 : -3 - rnd() * 7,
          scale: i === 0 ? 1.0 : 0.62 + rnd() * 0.16,
          hop: rnd() * TAU,
          speed: 1.6 + rnd() * 1.1,
          yawSpin: i === 0 ? 0 : (rnd() - 0.5) * 0.6
        });
      }
      this._cubes = [];
      for (let i = 0; i < 26; i++) {
        this._cubes.push({
          x: (rnd() - 0.5) * 34, y: 1 + rnd() * 9, z: -4 - rnd() * 26,
          s: 0.4 + rnd() * 1.1, r: rnd() * TAU, sp: (rnd() - 0.5) * 0.8,
          c: (() => { const q = BEAN_COLORS[(rnd() * BEAN_COLORS.length) | 0].rgb; return [q[0], q[1], q[2], 1]; })(),
          bob: rnd() * TAU
        });
      }
    } catch (e) {
      /* 立体が 出せなくても 画面は 生きる（文字と START は 出る）。 */
      this._glFailed = true;
      try { this.canvas.style.display = "none"; } catch (_) {}
      console.warn("[VocabuSurvive] 読み込み画面の 立体を 出せません:", e && e.message);
    }
  }

  setProgress(p, label) {
    this.progress = clamp(p, 0, 1);
    const pct = Math.round(this.progress * 100);
    this.barFill.style.width = pct + "%";
    this.pctEl.textContent = pct + "%";
    this.barEl.setAttribute("aria-valuenow", String(pct));
    if (label) this.stepEl.textContent = label;
    if (this.progress >= 1) {
      this.ready = true;
      this.stepEl.textContent = "準備できました";
      this.el.setAttribute("data-ready", "1");
      if (this._pendingStart) { this._pendingStart = false; this._go(); }
    }
  }

  _start() {
    if (this.started) return;
    this.startBtn.disabled = true;
    if (!this.ready) {
      this._pendingStart = true;
      this.stepEl.textContent = "もう少しで 始まります";
      this.el.setAttribute("data-waiting", "1");
      return;
    }
    this._go();
  }
  _go() {
    if (this.started) return;
    this.started = true;
    this.el.setAttribute("data-go", "1");
    /* 押した 手ごたえを 見せてから 移る */
    setTimeout(() => { try { this.onStart(); } catch (e) { console.error(e); } }, 240);
  }

  async enter() {
    this.started = false;
    this._pendingStart = false;
    this.el.removeAttribute("data-go");
    this.el.removeAttribute("data-waiting");
    this.startBtn.disabled = false;
    this._initGL();
  }

  exit() {
    /* 画面を 出たら 立体は 止める（裏で 回し続けない） */
  }

  resize() { /* renderer.resize() が 毎フレーム 見るので ここでは 何もしない */ }

  tick(dt) {
    const R = this._renderer;
    if (!R || !R.gl) return;
    this._t += dt;
    const sz = R.resize();
    const cam = this._cam;
    /* ゆっくり 回りながら 見る */
    cam.wantYaw = Math.sin(this._t * 0.16) * 0.55;
    cam.update(dt, [0, 0.1, 0], 0, sz.w / Math.max(1, sz.h));
    R.shadowCenter[0] = 0; R.shadowCenter[1] = 0; R.shadowCenter[2] = 0;
    R.begin(cam);

    /* 台。キャラクターが 乗っている 床。暗いと 浮いて 見えるので 明るめ。 */
    m4.compose(this._mat, 0, -0.14, 0, this._t * 0.10, 1.16, 1.1, 1.16);
    R.draw("vs_load_pad", this._mat, [0.46, 0.50, 0.82, 1], 0, 0.34, 0, 0, 3.8);
    /* 台の 縁の 輪。台（半径 3.2）の すぐ 外を 回る 太さに する。 */
    m4.compose(this._mat, 0, -0.10, 0, -this._t * 0.35, 8.0, 2.4, 8.0);
    R.draw("vs_load_ring", this._mat, [0.36, 0.88, 0.72, 1], 0.55, 0.4, 0, 0, 4.1);

    /* 浮いている 四角 */
    for (const c of this._cubes) {
      const y = c.y + Math.sin(this._t * 0.8 + c.bob) * 0.35;
      m4.compose(this._mat, c.x, y, c.z, c.r + this._t * c.sp, c.s, c.s, c.s);
      R.draw("vs_load_cube", this._mat, c.c, 0.06, 0.30, 0, 0, c.s);
    }

    /* 走る人 */
    for (let i = 0; i < this._beans.length; i++) {
      const b = this._beans[i];
      b.hop += dt * b.speed * 2.4;
      const bounce = Math.abs(Math.sin(b.hop)) * (i === 0 ? 0.42 : 0.30);
      const vy = Math.cos(b.hop) * 6;
      b.v.update(dt, { speed: i === 0 ? 2.2 : 3.0, grounded: bounce < 0.04, vy, yaw: 0, stunned: 0 });
      const yaw = i === 0 ? Math.sin(this._t * 0.5) * 0.45 : (this._t * b.yawSpin);
      b.v.faceYaw = i === 0 ? Math.sin(this._t * 0.9) * 0.22 : 0;
      /* ★ 見せる 場面なので こちらを 向かせる（半回転） */
      b.v.draw(R, b.x, bounce, b.z, Math.PI + yaw, b.scale);
    }

    R.end(dt);
  }

  destroy() {
    if (this._renderer) { try { this._renderer.destroy(); } catch (e) {} this._renderer = null; }
  }
}

/* 読み込み画面 だけの CSS。theme の CSS へ 後ろから 足す。 */
export const LOADING_CSS = `
.vs-load{ position:absolute; inset:0; overflow:hidden; background:var(--vs-bg); }
.vs-load-vignette{
  position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 80% at 50% 8%, transparent 40%, rgba(4,5,16,.55) 100%),
    linear-gradient(180deg, rgba(4,5,16,.42) 0%, transparent 26%, transparent 62%, rgba(4,5,16,.72) 100%);
}
.vs-load-top{
  position:absolute; left:50%; top:calc(4.5vh + var(--vs-safe-t)); transform:translateX(-50%);
  width:min(720px, calc(100% - 40px));
  display:flex; flex-direction:column; align-items:center; gap:12px;
  text-align:center; pointer-events:none;
}
.vs-load-bottom{
  position:absolute; left:50%; bottom:calc(5vh + var(--vs-safe-b)); transform:translateX(-50%);
  width:min(420px, calc(100% - 40px));
  display:flex; flex-direction:column; align-items:center; gap:14px;
  text-align:center;
}
.vs-load-badge{
  display:inline-flex; align-items:center; gap:7px;
  height:30px; padding:0 14px; border-radius:var(--vs-r-full);
  background:var(--vs-surface); border:1px solid var(--vs-line-subtle);
  box-shadow:var(--vs-sh-subtle);
  font-size:12px; font-weight:650; letter-spacing:.06em; color:var(--vs-ink);
}
/* ★ 色は JS が 1 文字ずつ 入れる（上の gradientAt）。
     ここでは 形と 影だけ。切り抜きには 頼らない。 */
.vs-load-title{
  font-family: var(--vq-font-display, inherit);
  font-size:clamp(28px, 6.6vw, 58px); font-weight:750; letter-spacing:-.004em;
  line-height:1.1; margin:2px 0 0;
  display:flex; flex-wrap:wrap; justify-content:center;
  text-shadow: 0 2px 18px rgba(0,0,0,.45);
}
.vs-load-ch{
  display:inline-block;
  animation: vsDrop .62s cubic-bezier(.18,1.2,.34,1) both;
}
@keyframes vsDrop{
  from{ transform:translateY(-26px) scale(.86); opacity:0; }
  to{ transform:none; opacity:1; }
}
.vs-load-hint{
  color:var(--vs-ink-sub); font-size:clamp(12px,2.4vw,15px); max-width:34em;
  text-shadow:0 2px 10px rgba(6,8,24,.9), 0 0 22px rgba(6,8,24,.7);
}
.vs-load-start{
  min-width:212px; --_h:var(--vs-h-lg); font-size:15px; letter-spacing:.04em;
  box-shadow:var(--vs-sh-floating);
}
.vs-load[data-go="1"]{ animation: vsGo .34s ease forwards; }
@keyframes vsGo{ to{ opacity:0; transform:scale(1.04); } }
.vs-load-status{ width:min(360px,80%); display:flex; flex-direction:column; gap:7px; margin-top:6px; }
.vs-load-bar{ height:6px; border-radius:var(--vs-r-full); background:var(--vs-surface-3); overflow:hidden; }
.vs-load-fill{
  display:block; height:100%; width:0%; border-radius:var(--vs-r-full);
  background:var(--vs-accent);
  transition: width .28s cubic-bezier(.3,.8,.3,1);
}
.vs-load-line{ display:flex; justify-content:space-between; font-size:11.5px; color:var(--vs-ink-sub); }
.vs-load-ver{
  position:absolute; right:calc(14px + var(--vs-safe-r)); bottom:calc(12px + var(--vs-safe-b));
  font-size:11px; color:var(--vs-ink-faint); letter-spacing:.06em;
}
@media (max-height: 560px){
  .vs-load-hint{ display:none; }
  .vs-load-top{ top:calc(2vh + var(--vs-safe-t)); gap:6px; }
  .vs-load-bottom{ bottom:calc(2.5vh + var(--vs-safe-b)); gap:8px; }
  .vs-load-start{ --_h:var(--vs-h-md); min-width:180px; font-size:14px; }
}
@media (prefers-reduced-motion: reduce){
  .vs-load-ch, .vs-load-start, .vs-load[data-go="1"]{ animation:none !important; }
}
`;
