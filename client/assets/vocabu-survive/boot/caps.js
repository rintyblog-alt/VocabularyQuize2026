/* ══════════════════════════════════════════════════════════════════════════
   端末の 力を 測る。

   ここで 決めた 段（低 / 中 / 高 / 最高）を 描画・仕掛けの 数・
   影の 有無が すべて 参照する。**測るのは 1 回だけ**（起動時）。

   注意（2026-08-28）:
     本体には すでに 低性能モードが ある（deviceMemory < 8 または 芯 4 以下）。
     判定を 二重に 持つと ズレるので **同じ 条件を 使う**。
   ══════════════════════════════════════════════════════════════════════════ */

/** @typedef {"low"|"medium"|"high"|"ultra"} Tier */

let _cache = null;

/* WebGL2 が 使えるか。文脈を 1 つ 作って すぐ 捨てる。
   （捨てないと 端末の 同時文脈数を 1 つ 食う） */
function probeGL() {
  const out = { webgl2: false, webgl1: false, maxTexture: 0, instancedExt: false, renderer: "" };
  let c = null;
  try {
    c = document.createElement("canvas");
    c.width = c.height = 1;
    let gl = null;
    try { gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }); } catch (e) {}
    if (gl) {
      out.webgl2 = true;
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    } else {
      try { gl = c.getContext("webgl") || c.getContext("experimental-webgl"); } catch (e) {}
      if (gl) {
        out.webgl1 = true;
        out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
        out.instancedExt = !!gl.getExtension("ANGLE_instanced_arrays");
      }
    }
    if (gl) {
      try {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) out.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
      } catch (e) {}
      /* 文脈を 手放す。これを 忘れると 端末が 溜め込む。 */
      try { const l = gl.getExtension("WEBGL_lose_context"); if (l) l.loseContext(); } catch (e) {}
    }
  } catch (e) {}
  c = null;
  return out;
}

function isMobileUA() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
  } catch (e) {}
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(String(navigator.userAgent || ""));
}

/** iPhone / iPad か（音の 事情が 違うので 別に 見る） */
export function isIOS() {
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  /* iPadOS 13 以降は Mac を 名乗る。指が 使えるかで 見分ける。 */
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * 端末を 測る。
 * @returns {{tier:Tier, webgl2:boolean, webgl1:boolean, mobile:boolean, ios:boolean,
 *            cores:number, memory:number, dpr:number, renderer:string,
 *            touch:boolean, reduceMotion:boolean, maxTexture:number}}
 */
export function measure() {
  if (_cache) return _cache;

  const gl = probeGL();
  const cores = Math.max(1, Number(navigator.hardwareConcurrency || 0) || 4);
  const memory = Number(navigator.deviceMemory || 0) || 0; /* 0 = 分からない */
  const mobile = isMobileUA();
  const ios = isIOS();
  const touch = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  let reduceMotion = false;
  try { reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
  const dpr = Math.min(3, Math.max(1, Number(window.devicePixelRatio || 1)));

  /* ── 段を 決める ──────────────────────────────────────────────
     本体の 低性能判定（memory<8 || cores<=4）を 下敷きにする。
     ただし memory は Safari が 返さない（0）ので、0 のときは
     芯の数と 指の有無だけで 決める。 */
  let tier = "medium";
  const weakByBody = (memory > 0 && memory < 8) || cores <= 4;

  if (!gl.webgl2 && !gl.webgl1) tier = "low";       /* そもそも 描けない */
  else if (!gl.webgl2) tier = "low";                 /* WebGL1 しか 無い端末は 古い */
  else if (weakByBody) tier = mobile ? "low" : "medium";
  else if (mobile) tier = cores >= 8 ? "high" : "medium";
  else tier = cores >= 12 && (memory === 0 || memory >= 16) ? "ultra" : "high";

  /* 動きを 減らす設定の 人は 1 段 落とす（揺れる仕掛けを 弱める） */
  if (reduceMotion && tier === "ultra") tier = "high";
  /* ★ 段を 下げる だけでは 足りない。**ゆれと 粒**を 抑える。
     酔いやすい 人に とっては 画質より こちらの ほうが 効く。 */

  _cache = {
    tier, webgl2: gl.webgl2, webgl1: gl.webgl1, mobile, ios, cores, memory, dpr,
    renderer: gl.renderer, touch, reduceMotion, maxTexture: gl.maxTexture
  };
  return _cache;
}

/** 段ごとの 描画の 設定。renderer と game が これだけを 見る。 */
export const PRESETS = {
  /* ★ water を low でも true に した（2026-08-31）。
     いまの 「海」は 下に 広がる 面の 上に **板を 1 枚 足すだけ**で、
     既にある まとめ描きに 入る ので 描き回数も 面の数も 増えない。
     切ると 溶岩の コースが **ただ 暗いだけ**に なり、
     弱い 端末の 人だけ 世界が 別物に なる（実写で 確認）。 */
  low:    { shadow: false, shadowSize: 0,    pixelRatio: 0.75, fog: true,  clouds: false, water: true,
            particles: 0.25, drawDistance: 90,  msaa: 0, targetFps: 30, obstacleDetail: 0, 肌: 0 },
  medium: { shadow: true,  shadowSize: 1024, pixelRatio: 1.0,  fog: true,  clouds: false, water: true,
            particles: 0.6,  drawDistance: 140, msaa: 0, targetFps: 60, obstacleDetail: 1, 肌: 128 },
  high:   { shadow: true,  shadowSize: 2048, pixelRatio: 1.0,  fog: true,  clouds: true,  water: true,
            particles: 1.0,  drawDistance: 200, msaa: 4, targetFps: 60, obstacleDetail: 2, 肌: 192 },
  ultra:  { shadow: true,  shadowSize: 2048, pixelRatio: 1.25, fog: true,  clouds: true,  water: true,
            particles: 1.4,  drawDistance: 260, msaa: 4, targetFps: 60, obstacleDetail: 2, 肌: 256 }
};

/** 手で 選んだ 段（設定画面）を 混ぜて 最終的な 設定を 返す。 */
export function settingsFor(tierOrAuto) {
  const m = measure();
  const t = (tierOrAuto && tierOrAuto !== "auto") ? tierOrAuto : m.tier;
  const p = PRESETS[t] || PRESETS.medium;
  /* 画面が 大きいほど 描く画素が 増える。上限を 掛けて 守る。 */
  const maxPixels = t === "low" ? 900000 : t === "medium" ? 1600000 : 2600000;
  /* ★ 「動きを 減らす」は **OS の 設定 だけに 任せない。**
     その 設定が ある ことを 知らない 人の ほうが 多い。
     手で 選んだ ものが あれば そちらを 優先する（"1" 減らす / "0" 減らさない）。 */
  let 減 = m.reduceMotion;
  try {
    const v = localStorage.getItem("vq.survive.calm.v1");
    if (v === "1") 減 = true; else if (v === "0") 減 = false;
  } catch (e) {}
  return Object.assign({}, p, {
    tier: t, autoTier: m.tier, maxPixels, dpr: m.dpr,
    calm: 減,
    /* 揺れの 強さ・粒の 数。減らす ときは 揺れ 0・粒 4 割。 */
    shakeScale: 減 ? 0 : 1,
    particles: (p.particles || 1) * (減 ? 0.4 : 1)
  });
}

export function reset() { _cache = null; }
