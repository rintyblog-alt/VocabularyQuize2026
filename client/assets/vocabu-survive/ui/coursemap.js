/* ══════════════════════════════════════════════════════════════════════════
   上から 見た コースの 図（2D）

   コースを 作る 画面と ロビーの 下見の 両方で 使う。
   ★ **3D では 描かない。** 図の ために 3D を 建て直すと 数百 ms 止まる。
     床・仕掛け・門・中間地点の 位置は 組み立てた 時点で 分かっている ので、
     板に 四角と 点を 打つだけで 足りる。
   ══════════════════════════════════════════════════════════════════════════ */

const 色 = {
  path: "#5d7a8f", cp: "#5ae6be", finish: "#ffd84d", gate: "#7aa2ff",
  ice: "#9fd8ff", conveyor: "#c9a0ff", bridge: "#8ea0b4", ramp: "#8fb0c4",
  start: "#7de0b0"
};

/**
 * @param {HTMLCanvasElement} cv 描く 板
 * @param {object} c buildCourse() の 返り
 * @param {{w:number,h:number,sel:number,label:boolean,alpha:number}} opt
 */
export function drawCourseMap(cv, c, opt) {
  opt = opt || {};
  const W = Math.max(80, Math.round(opt.w || cv.clientWidth || 300));
  const H = Math.max(40, Math.round(opt.h || cv.clientHeight || 120));
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
  }
  const g = cv.getContext("2d");
  if (!g) return false;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!c || !c.floors || !c.floors.length) return false;

  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of c.floors) {
    x0 = Math.min(x0, f.x - f.w / 2); x1 = Math.max(x1, f.x + f.w / 2);
    z0 = Math.min(z0, f.z - f.d / 2); z1 = Math.max(z1, f.z + f.d / 2);
  }
  if (!(x1 > x0) || !(z1 > z0)) return false;

  const pad = opt.pad === undefined ? 8 : opt.pad;
  /* 進む 向きは -Z。左→右 に なる ように 置く。 */
  const k = Math.min((W - pad * 2) / (z1 - z0), (H - pad * 2) / Math.max(8, x1 - x0));
  const px = (o) => pad + (-o.z - (-z1)) * k;
  const py = (o) => H / 2 + (o.x - (x0 + x1) / 2) * k;

  /* えらんでいる 区画の 帯 */
  const at = c.sectionAt || [];
  const sel = opt.sel;
  if (sel !== undefined && at[sel] && at[sel + 1]) {
    const a = pad + (-at[sel].z - (-z1)) * k;
    const b = pad + (-at[sel + 1].z - (-z1)) * k;
    g.fillStyle = "rgba(90,230,190,.16)";
    g.fillRect(Math.min(a, b), 0, Math.max(2, Math.abs(b - a)), H);
  }

  g.globalAlpha = opt.alpha === undefined ? 0.92 : opt.alpha;
  for (const f of c.floors) {
    const w = Math.max(1.5, f.d * k), hh = Math.max(1.5, f.w * k);
    g.fillStyle = 色[f.kind] || 色.path;
    g.fillRect(px(f) - w / 2, py(f) - hh / 2, w, hh);
  }
  g.globalAlpha = 1;

  for (const o of c.obstacles) {
    if (o.kind === "checkpoint" || o.kind === "finish") continue;
    g.fillStyle = "rgba(255,138,151,.9)";
    g.beginPath(); g.arc(px(o), py(o), Math.max(1.4, 2.2 * (H / 150)), 0, Math.PI * 2); g.fill();
  }
  for (const o of c.obstacles) {
    if (o.kind !== "checkpoint") continue;
    g.strokeStyle = 色.cp; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px(o), 3); g.lineTo(px(o), H - 3); g.stroke();
  }
  for (const gt of c.gates) {
    g.strokeStyle = 色.gate; g.lineWidth = 2;
    g.beginPath(); g.moveTo(px(gt), H * 0.12); g.lineTo(px(gt), H * 0.88); g.stroke();
  }

  if (opt.label !== false) {
    g.font = "700 10px system-ui, -apple-system, sans-serif";
    g.fillStyle = 色.start; g.fillText("出発", 4, 12);
    g.fillStyle = 色.finish; g.fillText("ゴール", W - 32, 12);
  }
  return true;
}
