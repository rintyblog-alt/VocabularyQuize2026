/* ══════════════════════════════════════════════════════════════════════════
   studio/src/engine/canvas2d.js — 2d 互換の合成器（WebGL が無い/喪失した時の道）

   ★ 何をする所か
     `createCompositor2D(canvas)` が engine/compositor.js と **同じ API** の
     Compositor を返す（契約書 §4）。WebGL2 が使えない端末、WebGL の文脈を
     失った後、`preferGL:false` で作られた時に ここが表に出る。
     出来る事は Canvas2D の地力まで:
       変形 / 不透明度 / クロップ / blend（globalCompositeOperation）/
       マスク（rect・ellipse・polygon を clip() で。ぼかしは無理）/
       crossfade・dip・slide 程度の遷移 / 文字 / 図形 /
       ctx.filter が **効く**なら明るさ系の grade まで。
     出来ない物（chroma / fx / LUT / カーブ / ホイール / マスクのぼかし…）は
     捨てるだけでなく `stats().missing` に名前を並べて申告する。黙って劣化
     させると「Safari だと色が違う」を誰も追えなくなる。

   ★ なぜこの形か
     ・**ctx.filter は Safari に無い**（契約書 §13.2）。しかも文字列は受け取る
       のに効かない。だから「在るか」ではなく core/caps.js と同じ**画素で試す**
       方法で実行時に確かめ、駄目なら grade を諦めて申告する。
     ・幾何（層 1 枚の大きさ・位置）は WebGL 版と **1 か所**に集めたい。
       ここに置いて compositor.js が import する（逆向きにすると循環参照に
       なる。compositor.js は fallback のために ここを import するので）。
     ・遷移は「同じトラックの隣」を要る。eval.js は重なりを許さない設計
       （A の尾 0→0.5 / B の頭 0.5→1）なので、**相手は その時刻には居ない**。
       相手を素材の外まで伸ばして引き直す `resolvePartner()` を共有する。
     ・quality < 1 のときは 内部の小さい canvas に描いて 最後に引き伸ばす。
       画素数が減るので filter と blend が素直に速くなる（2d の唯一の効く手）。

   ★ 触るときの注意
     ・`layerBox()` の約束は ui/inspector/transform.js の `frameFit()` /
       `shownSize()` と **必ず一致させる**（scale 1 = contain、x/y は画面幅
       高さに対する割合で中心が原点、crop 後の窓は中央に残る）。片方だけ
       直すと「数値と絵が合わない」になる。
     ・例外は握りつぶさない。層 1 枚の失敗は その層を飛ばして warnOnce する
       （契約書 §4 の「例外で真っ黒にしない」）。
     ・`console` は呼ばない（core/log.js の scope 経由）。

   CONTRACT-NOTE (1): 契約書 §4 は 2d の申告例を `missing:["chroma","mask"]`
     と書くが、rect/ellipse/polygon のマスクは clip() で本当に出せるので
     出している。申告するのは 出せなかった物だけ（"mask.feather" 等）。
     「出来ない事の一覧」は嘘を書かない方が値打ちが在る。
   CONTRACT-NOTE (2): fx と遷移の 2d フォールバックは registry / TRANSITIONS
     側が持つ約束（共通規約）なので、こちらは **呼び口だけ**用意して在れば
     使う: `entry.apply2d(ctx, opts)`（`draw2d` / `fallback2d` / `render2d`
     という名前でも受ける）。opts は
       { ctx, canvas, w, h, params, time, p, a, b, opacity }
     （a/b は遷移の元/先の canvas）。無い物は 自前の crossfade へ落として申告。
   CONTRACT-NOTE (3): `engine/text.js` / `engine/shapes.js` は契約どおりに使うが
     **動的 import** にした。静的にすると 隣が 1 つ未着なだけで合成器が読み込め
     ず、プレビューが丸ごと消える（app.js は import の失敗を飲むだけ）。
     読めるまでの数フレームと 読めない端末では 図形は自前の最小実装で描き、
     文字は `missing:["text"]` として申告する。
   CONTRACT-NOTE (4): 共通前提は「1 ファイル 700 行で分割」だが、分割先
     （engine/2d/*.js）は担当外で新規作成できない。章立て（§A〜§D）で読める
     ようにして 1 ファイルに収めた。§A の幾何は WebGL 版と共有する所なので、
     分けるなら まず §A を engine/geometry.js へ出すのが素直。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clipsAt, resolveClip } from "../core/eval.js";
import { clamp, clamp01, finite } from "../core/util.js";
import { assetById } from "../core/schema.js";
import { scope } from "../core/log.js";

const L = scope("engine2d");

/* engine/text.js と engine/shapes.js は **遅延**で読む（CONTRACT-NOTE (3)）。
   契約どおりの道具だが、静的 import にすると 隣が 1 つ未着なだけで
   合成器ごと読み込めなくなり、プレビューが真っ黒になる。読めたら次の
   フレームから本物を使い、読めるまで（と読めない時）は自前の保険で描く。 */
let TEXT = null, SHAPES2 = null;
try {
  import("./text.js").then((m) => { TEXT = m; }).catch((e) => { L.warn("text.js が読めません", e); });
  import("./shapes.js").then((m) => { SHAPES2 = m; }).catch(() => { /* 自前の図形で描く */ });
} catch (_e) { /* 動的 import すら無い環境（試験など）。自前で描く */ }

/** clip.blend → globalCompositeOperation（契約書 §1 の並び順） */
export const BLEND_2D = Object.freeze({
  normal: "source-over", add: "lighter", screen: "screen", multiply: "multiply",
  overlay: "overlay", softlight: "soft-light", difference: "difference",
  lighten: "lighten", darken: "darken"
});

/** 画質の段（契約書 §4）。これ以外の値は近い段へ寄せる */
export const QUALITY_STEPS = Object.freeze([0.25, 0.5, 1]);

/* ══ §A 共有の小道具（WebGL 版も import する）═══════════════════════ */

/**
 * quality を 0.25 / 0.5 / 1 のどれかへ寄せる。
 * @param {number|string|undefined} q 数 か "full"|"half"|"quarter"|"auto"
 * @param {number} [fallback=1]
 * @returns {number}
 */
export function snapQuality(q, fallback) {
  const def = finite(fallback, 1);
  if (typeof q === "string") {
    if (q === "full") return 1;
    if (q === "half") return 0.5;
    if (q === "quarter") return 0.25;
    return def;                                  // "auto" は呼ぶ側が決める
  }
  const n = finite(q, def);
  if (!(n > 0)) return def;
  let best = QUALITY_STEPS[0], bd = Infinity;
  for (const s of QUALITY_STEPS) {
    const d = Math.abs(Math.log(n / s));         // 比で近い方（0.3 は 0.25 側）
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * 出力の寸法を決める。canvas の裏の大きさが 真（resize() で合わせてある）。
 * 0 や未設定なら project.settings に頼る。内部で描く大きさは quality 倍。
 * @param {Object} project
 * @param {number} cw canvas.width
 * @param {number} ch canvas.height
 * @param {number|string} [quality]
 * @returns {{W:number,H:number,w:number,h:number,q:number}}
 */
export function outSize(project, cw, ch, quality) {
  const s = (project && project.settings) || {};
  const W = Math.max(2, Math.round(finite(cw, 0) || finite(s.width, 1920)));
  const H = Math.max(2, Math.round(finite(ch, 0) || finite(s.height, 1080)));
  const q = snapQuality(quality, 1);
  return { W, H, w: Math.max(2, Math.round(W * q)), h: Math.max(2, Math.round(H * q)), q };
}

/**
 * 層 1 枚の「画面に出る箱」。単位は出力 px。
 *
 * 約束（ui/inspector/transform.js と同一。勝手に変えない）:
 *   ・scale 1 = 素材を画面に **収めた**（contain）大きさ
 *   ・transform.x / y = 画面の幅 / 高さに対する割合。0 = 中央・+ は右と下
 *   ・crop で残った窓は **中央に残る**（整列ボタンの計算がこれを前提にしている）
 *   ・anchorX / anchorY は **回転と拡大の中心**（位置ではない）
 * @param {Object} r Resolved（core/eval.js）
 * @param {number} outW @param {number} outH 出力 px
 * @param {number} srcW @param {number} srcH 素材 px（不明なら 0 を渡す）
 * @returns {{w:number,h:number,cx:number,cy:number,px:number,py:number,
 *            rot:number,flipH:boolean,flipV:boolean,k:number,
 *            crop:{l:number,t:number,w:number,h:number}}}
 */
export function layerBox(r, outW, outH, srcW, srcH) {
  const tr = (r && r.transform) || {};
  const cr = tr.crop || {};
  const cw = clamp01(finite(cr.w, 1 - finite(cr.l, 0) - finite(cr.r, 0)));
  const chh = clamp01(finite(cr.h, 1 - finite(cr.t, 0) - finite(cr.b, 0)));
  let aw = finite(srcW, 0), ah = finite(srcH, 0);
  if (!(aw > 0) || !(ah > 0)) { aw = outW; ah = outH; }
  const k = Math.min(outW / aw, outH / ah);            // scale 1 = contain
  const sx = finite(tr.scaleX, 1) * finite(tr.scale, 1);
  const sy = finite(tr.scaleY, 1) * finite(tr.scale, 1);
  const w = Math.max(1e-3, aw * k * Math.max(1e-4, cw) * Math.abs(sx || 1));
  const h = Math.max(1e-3, ah * k * Math.max(1e-4, chh) * Math.abs(sy || 1));
  const cx = outW * (0.5 + finite(tr.x, 0));
  const cy = outH * (0.5 + finite(tr.y, 0));
  return {
    w, h, cx, cy,
    px: cx + (clamp01(finite(tr.anchorX, 0.5)) - 0.5) * w,   // 回転・拡大の中心
    py: cy + (clamp01(finite(tr.anchorY, 0.5)) - 0.5) * h,
    rot: finite(tr.rotate, 0),                               // eval は rad で返す
    flipH: !!tr.flipH, flipV: !!tr.flipV, k,
    crop: { l: clamp01(finite(cr.l, 0)), t: clamp01(finite(cr.t, 0)), w: Math.max(1e-4, cw), h: Math.max(1e-4, chh) }
  };
}

/**
 * 「画面を覆う（cover）」箱。ぼかし背景に使う。
 * @param {number} outW @param {number} outH @param {number} srcW @param {number} srcH
 * @returns {{w:number,h:number,cx:number,cy:number}}
 */
export function coverBox(outW, outH, srcW, srcH) {
  let aw = finite(srcW, 0), ah = finite(srcH, 0);
  if (!(aw > 0) || !(ah > 0)) { aw = outW; ah = outH; }
  const k = Math.max(outW / aw, outH / ah);
  return { w: aw * k, h: ah * k, cx: outW / 2, cy: outH / 2 };
}

/**
 * 遷移の相手（同じトラックの隣）を、その時刻に **居なくても**引き直す。
 *
 * eval.js は重なりを許さない（A の尾で p 0→0.5、B の頭で p 0.5→1）ので、
 * 遷移中に要る「もう 1 枚」は必ず自分の尺の外に居る。そこで
 *   ・時刻は相手の尺の中へ丸める（= 端の絵）
 *   ・素材が続いているなら、はみ出した分だけ **素材時刻を伸ばす**
 *     （NLE の「遷移は隣の素材を食う」の振る舞い。足りなければ端で止まる）
 * @param {Object} project @param {Object} r 自分の Resolved
 * @param {number} time タイムライン秒 @param {number} fps
 * @returns {Object|null} Resolved（transition は null に落としてある）
 */
export function resolvePartner(project, r, time, fps) {
  const tr = r && r.transition;
  if (!tr || !tr.otherClipId || !r.track) return null;
  const clips = Array.isArray(r.track.clips) ? r.track.clips : [];
  let c = null;
  for (let i = 0; i < clips.length; i++) {
    if (clips[i] && String(clips[i].id) === String(tr.otherClipId)) { c = clips[i]; break; }
  }
  if (!c) return null;
  const f = Math.max(1, finite(fps, 30));
  const dur = Math.max(0, finite(c.duration, 0));
  const local = finite(time, 0) - finite(c.start, 0);
  const inside = clamp(local, 0, Math.max(0, dur - 0.5 / f));
  const asset = assetById(project, c.assetId);
  const out = resolveClip(c, finite(c.start, 0) + inside, {
    fps: f, asset, track: r.track, trackIndex: finite(r.trackIndex, -1), pool: null
  });
  if (!out) return null;
  const over = local - inside;
  if (Math.abs(over) > 1e-6 && asset) {
    const k = c.kind;
    if (k === "video" || k === "audio" || k === "compound") {
      const sp = Math.abs(finite(out.speed, 1)) || 1;
      const lim = Math.max(0, finite(asset.duration, 0));
      const d = over * sp * (c.reverse ? -1 : 1);
      out.sourceTime = clamp(finite(out.sourceTime, 0) + d, 0, lim);
    }
  }
  out.transition = null;          // 相手を さらに遷移として扱わない（無限に潜る）
  return out;
}

/**
 * 遷移の A（前）と B（後）を並べる。相手が居なければ背景との遷移。
 * @param {Object} r @param {Object|null} partner
 * @returns {{a:Object|null,b:Object|null,p:number}}
 */
export function transitionPair(r, partner) {
  const tr = r.transition;
  const p = clamp01(finite(tr && tr.p, 0));
  if (tr && tr.role === "out") return { a: r, b: partner, p };
  return { a: partner, b: r, p };
}

/** canvas を 1 枚作る（DOM が無い所では OffscreenCanvas） */
export function makeCanvas(w, h) {
  const W = Math.max(1, Math.round(finite(w, 1))), H = Math.max(1, Math.round(finite(h, 1)));
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(W, H);
  throw new Error("canvas を作れません（document も OffscreenCanvas も在りません）");
}

/** ctx.filter が **効く**か（文字列を受け取るだけの Safari を弾く。§13.2） */
let filterProbe = null;
export function ctxFilterWorks() {
  if (filterProbe !== null) return filterProbe;
  filterProbe = false;
  try {
    const cv = makeCanvas(2, 2);
    const ctx = cv.getContext("2d");
    if (!ctx || !("filter" in ctx)) return false;
    const src = makeCanvas(2, 2);
    const s = src.getContext("2d");
    s.fillStyle = "#ff0000"; s.fillRect(0, 0, 2, 2);
    ctx.filter = "invert(1)";
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    const d = ctx.getImageData(0, 0, 1, 1).data;
    filterProbe = d[0] < 80 && d[1] > 170 && d[2] > 170;   // 赤 → 水色
  } catch (_e) { filterProbe = false; }
  return filterProbe;
}

/* ══ §B 文字と図形（canvas を 1 枚もらう。WebGL 版も同じ道を通る）══ */

/** 名前の候補から関数を 1 本選ぶ（隣の担当が名前を変えても拾えるように） */
export function pickFn(ns, names) {
  if (!ns) return null;
  for (const n of names) {
    const v = ns[n];
    if (typeof v === "function") return v;
  }
  if (typeof ns.default === "function") return ns.default;
  return null;
}

/**
 * 文字クリップの canvas（engine/text.js に委ねる。契約書 §4）。
 * @returns {HTMLCanvasElement|null}
 */
export function textCanvasFor(r, w, h, fps) {
  const fn = pickFn(TEXT, ["renderText"]);
  if (!fn || !r.text) return null;
  const cv = fn(r.text, {
    width: w, height: h, time: finite(r.localTime, 0),
    duration: finite(r.duration, 0), dpr: 1, fps: finite(fps, 30),
    style: r.text.style, layout: r.text.layout, anim: r.text.anim
  });
  return cv && cv.width ? cv : null;
}

/**
 * 図形クリップの canvas。engine/shapes.js → engine/text.js → 自前 の順に試す。
 * @returns {HTMLCanvasElement|null}
 */
export function shapeCanvasFor(r, w, h) {
  const spec = r.shape;
  if (!spec) return null;
  const fn = pickFn(SHAPES2, ["renderShape", "drawShape", "shapeCanvas"]) ||
    pickFn(TEXT, ["renderShape", "drawShape"]);
  if (fn) {
    try {
      const cv = fn(spec, { width: w, height: h, time: finite(r.localTime, 0), duration: finite(r.duration, 0), dpr: 1 });
      if (cv && cv.width) return cv;
    } catch (e) { L.warn("shapes.js が描けなかったので自前で描きます", e); }
  }
  return renderShapeFallback(spec, w, h);
}

/**
 * 図形の最小実装（engine/shapes.js が無くても図形が消えないための保険）。
 * 契約書 §1 ShapeSpec の 6 種。w/h は画面に対する割合。
 * @returns {HTMLCanvasElement}
 */
export function renderShapeFallback(spec, W, H) {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const s = spec || {};
  const w = clamp(finite(s.w, 0.3), 0.001, 4) * W;
  const h = clamp(finite(s.h, 0.2), 0.001, 4) * H;
  const cx = W / 2, cy = H / 2;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const st = s.stroke || {};
  const sw = Math.max(0, finite(st.width, 0)) * Math.min(W, H) / 1080 * 4;
  ctx.fillStyle = typeof s.fill === "string" ? s.fill : "#ffffff";
  ctx.strokeStyle = typeof st.color === "string" ? st.color : "#000000";
  ctx.lineWidth = sw;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const type = String(s.type || "rect");
  ctx.beginPath();
  if (type === "ellipse") {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (type === "triangle") {
    ctx.moveTo(cx, y0); ctx.lineTo(x0 + w, y0 + h); ctx.lineTo(x0, y0 + h); ctx.closePath();
  } else if (type === "line") {
    ctx.moveTo(x0, cy); ctx.lineTo(x0 + w, cy);
    ctx.lineWidth = Math.max(sw, Math.max(1, h * 0.12));
    ctx.strokeStyle = typeof s.fill === "string" ? s.fill : "#ffffff";
    ctx.stroke();
    return cv;
  } else if (type === "arrow") {
    const hy = h * 0.32, hx = w * 0.32;
    ctx.moveTo(x0, cy - hy / 2); ctx.lineTo(x0 + w - hx, cy - hy / 2);
    ctx.lineTo(x0 + w - hx, y0); ctx.lineTo(x0 + w, cy);
    ctx.lineTo(x0 + w - hx, y0 + h); ctx.lineTo(x0 + w - hx, cy + hy / 2);
    ctx.lineTo(x0, cy + hy / 2); ctx.closePath();
  } else if (type === "star") {
    const n = 5, ro = Math.min(w, h) / 2, ri = ro * 0.42;
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const rr = i % 2 ? ri : ro;
      const px = cx + Math.cos(a) * rr * (w / Math.min(w, h)), py = cy + Math.sin(a) * rr * (h / Math.min(w, h));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    const rad = Math.min(clamp(finite(s.radius, 0), 0, 1) * Math.min(w, h) / 2, Math.min(w, h) / 2);
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, rad);
    else ctx.rect(x0, y0, w, h);
  }
  ctx.fill();
  if (sw > 0) ctx.stroke();
  return cv;
}

/* ══ §C grade → ctx.filter（明るさ系まで）══════════════════════════ */

/**
 * ColorGrade を filter 文字列にする。出せなかった項目は miss へ名前を入れる。
 * @param {Object|null} g @param {Set<string>} miss @param {number} scale 出力の縮尺（ぼかし px 用）
 * @returns {string} "none" か filter 文字列
 */
export function gradeFilter(g, miss, scale) {
  if (!g) return "none";
  const parts = [];
  const num = (k) => finite(g[k], 0);
  const ex = num("exposure"), ct = num("contrast"), sa = num("saturation");
  const hu = num("hue"), fa = num("fade"), dn = num("denoise"), vi = num("vibrance");
  if (Math.abs(ex) > 1e-3) parts.push("brightness(" + clamp(1 + ex, 0, 4).toFixed(3) + ")");
  if (Math.abs(ct) > 1e-3 || Math.abs(fa) > 1e-3) {
    parts.push("contrast(" + clamp(1 + ct - fa * 0.6, 0, 4).toFixed(3) + ")");
  }
  if (Math.abs(sa) > 1e-3 || Math.abs(vi) > 1e-3) {
    parts.push("saturate(" + clamp(1 + sa + vi * 0.5, 0, 4).toFixed(3) + ")");
  }
  if (Math.abs(hu) > 1e-3) parts.push("hue-rotate(" + (hu * 360).toFixed(1) + "deg)");
  if (fa > 1e-3) parts.push("opacity(" + clamp(1 - fa * 0.25, 0.2, 1).toFixed(3) + ")");
  if (dn > 1e-3) parts.push("blur(" + (dn * 3 * Math.max(0.25, finite(scale, 1))).toFixed(2) + "px)");
  /* 2d では出せない物を申告（契約書 §4） */
  for (const k of ["temperature", "tint", "highlights", "shadows", "whites", "blacks", "sharpen", "vignette", "grain"]) {
    if (Math.abs(num(k)) > 1e-3) miss.add("grade." + k);
  }
  if (g.lut) miss.add("grade.lut");
  if (g.curves && hasCurve(g.curves)) miss.add("grade.curves");
  if (hasWheel(g.wheels)) miss.add("grade.wheels");
  if (Array.isArray(g.hsl) && g.hsl.some((b) => b && (finite(b.h, 0) || finite(b.s, 0) || finite(b.l, 0)))) miss.add("grade.hsl");
  return parts.length ? parts.join(" ") : "none";
}

/** カーブが恒等でないか */
export function hasCurve(c) {
  if (!c) return false;
  for (const k of ["rgb", "r", "g", "b", "luma"]) {
    const pts = c[k];
    if (!Array.isArray(pts) || pts.length < 2) continue;
    for (const p of pts) {
      if (!Array.isArray(p)) continue;
      if (Math.abs(finite(p[0], 0) - finite(p[1], 0)) > 1e-3) return true;
    }
    if (pts.length > 2) return true;
  }
  return false;
}
/** ホイールが中立でないか */
export function hasWheel(w) {
  if (!w) return false;
  for (const k in w) {
    const a = w[k];
    if (Array.isArray(a) && a.some((v) => Math.abs(finite(v, 0)) > 1e-3)) return true;
  }
  return false;
}

/* ══ §D 本体 ══════════════════════════════════════════════════════ */

/**
 * 2d の合成器（契約書 §4 の Compositor と同じ形）。
 * @param {HTMLCanvasElement} canvas
 * @param {{reason?:string, missing?:string[]}} [opts] 落ちてきた理由（stats に出す）
 * @returns {Object} Compositor
 */
export function createCompositor2D(canvas, opts) {
  if (!canvas) throw new Error("createCompositor2D: canvas が要ります");
  const o = opts || {};
  let ctx = null;
  try { ctx = canvas.getContext("2d", { alpha: false }); }
  catch (_e) { ctx = null; }
  if (!ctx) { try { ctx = canvas.getContext("2d"); } catch (_e) { ctx = null; } }
  if (!ctx) throw new Error("2d の文脈を作れません（この canvas は既に別の文脈を持っています）");

  const canFilter = ctxFilterWorks();
  const missing = new Set(Array.isArray(o.missing) ? o.missing : []);
  missing.add("chroma");
  missing.add("fx");
  missing.add("mask.feather");
  if (!canFilter) missing.add("grade");
  const warned = new Set();
  const warnings = [];
  const st = {
    ms: 0, avg: 0, frames: 0, layers: 0, draws: 0, q: 1,
    reason: String(o.reason || (o.missing ? "webgl 無し" : "")) || "2d 指定"
  };
  /** 内部の描き場（quality < 1 のときだけ使う） */
  let buf = null, bctx = null;
  /** 遷移用の 2 枚 */
  let tA = null, tB = null;
  const textCache = [];   // 文字/図形の canvas を少しだけ使い回す

  function warnOnce(key, ...args) {
    if (warned.has(key)) return;
    warned.add(key);
    if (warnings.length < 40) warnings.push(key);
    L.warn(key, ...args);
  }

  /** quality に合わせた描き場を返す */
  function stage(W, H, w, h) {
    if (w === W && h === H) { bctx = ctx; return ctx; }
    if (!buf || buf.width !== w || buf.height !== h) {
      buf = makeCanvas(w, h);
      bctx = buf.getContext("2d", { alpha: false }) || buf.getContext("2d");
    }
    return bctx;
  }

  /** 遷移で使う 1 枚（透明。層 1 枚を丸ごと描く） */
  function scratch(which, w, h) {
    let c = which === 0 ? tA : tB;
    if (!c || c.width !== w || c.height !== h) {
      c = makeCanvas(w, h);
      if (which === 0) tA = c; else tB = c;
    }
    const cc = c.getContext("2d");
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalAlpha = 1; cc.globalCompositeOperation = "source-over";
    if (cc.filter !== undefined) cc.filter = "none";
    cc.clearRect(0, 0, w, h);
    return { canvas: c, ctx: cc };
  }

  /** 素材（video/image/canvas）を取る */
  function sourceFor(r, sources, w, h, fps, mode) {
    const kind = r.kind;
    if (kind === "text") {
      const cv = cached(r, "t", w, h, () => textCanvasFor(r, w, h, fps));
      if (!cv) { warnOnce("text", "engine/text.js が使えません"); missing.add("text"); return null; }
      return { el: cv, w: cv.width, h: cv.height, full: true };
    }
    if (kind === "shape") {
      const cv = cached(r, "s", w, h, () => shapeCanvasFor(r, w, h));
      if (!cv) return null;
      return { el: cv, w: cv.width, h: cv.height, full: true };
    }
    if (!sources || typeof sources.acquire !== "function") {
      warnOnce("sources", "SourcePool が渡されていません");
      return null;
    }
    let s = null;
    try { s = sources.acquire(r, { mode: mode || "play" }); }
    catch (e) { warnOnce("acquire:" + r.kind, e); return null; }
    if (!s || s.kind === "empty" || !s.el) return null;
    const el = s.el;
    const sw = finite(s.width, 0) || finite(el.videoWidth, 0) || finite(el.naturalWidth, 0) || finite(el.width, 0);
    const sh = finite(s.height, 0) || finite(el.videoHeight, 0) || finite(el.naturalHeight, 0) || finite(el.height, 0);
    if (!(sw > 0) || !(sh > 0)) return null;
    if (s.ready === false) return null;
    return { el, w: sw, h: sh, full: false };
  }

  /** 文字/図形の canvas を 6 枚だけ使い回す（同じ時刻で 2 回呼ばれる時に効く） */
  function cached(r, tag, w, h, make) {
    const id = (r.clip && r.clip.id) || "?";
    const key = tag + "|" + id + "|" + w + "x" + h + "|" + finite(r.localTime, 0).toFixed(4) +
      "|" + (r.text ? r.text.content + "|" + JSON.stringify(r.text.style || {}) : JSON.stringify(r.shape || {}));
    for (const e of textCache) if (e.key === key) return e.cv;
    let cv = null;
    try { cv = make(); } catch (e) { warnOnce("render:" + tag, e); return null; }
    if (!cv) return null;
    textCache.push({ key, cv });
    if (textCache.length > 6) textCache.shift();
    return cv;
  }

  /** マスクで clip する（層の中心が原点・大きさ w×h の座標系で呼ぶ） */
  function clipMask(c, m, w, h) {
    const type = String(m.type || "rect");
    if (type === "linear" || type === "radial") { missing.add("mask." + type); return false; }
    if (finite(m.feather, 0) > 1e-3) missing.add("mask.feather");
    c.beginPath();
    if (type === "polygon") {
      const pts = Array.isArray(m.points) ? m.points : [];
      if (pts.length < 3) return false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i] || [];
        const x = (clamp01(finite(p[0], 0)) - 0.5) * w, y = (clamp01(finite(p[1], 0)) - 0.5) * h;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
    } else {
      const mw = Math.max(1e-3, finite(m.w, 0.5)) * w * (1 + finite(m.expand, 0));
      const mh = Math.max(1e-3, finite(m.h, 0.5)) * h * (1 + finite(m.expand, 0));
      const mx = (clamp01(finite(m.x, 0.5)) - 0.5) * w, my = (clamp01(finite(m.y, 0.5)) - 0.5) * h;
      const rot = finite(m.rotate, 0);
      c.save();
      c.translate(mx, my); c.rotate(rot);
      if (type === "ellipse") c.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      else c.rect(-mw / 2, -mh / 2, mw, mh);
      c.restore();
    }
    if (m.invert) {
      /* 反転は「全体 − 形」。even-odd で外枠を足して抜く */
      c.rect(-w * 4, -h * 4, w * 8, h * 8);
      c.clip("evenodd");
    } else {
      c.clip();
    }
    return true;
  }

  /**
   * 層 1 枚を描く。
   * @param {CanvasRenderingContext2D} c 描き先
   * @param {Object} r Resolved @param {Object} src sourceFor の結果
   * @param {number} w @param {number} h 出力 px
   * @param {{blend?:boolean, alpha?:number}} [how]
   */
  function drawLayer(c, r, src, w, h, how) {
    const box = layerBox(r, w, h, src.full ? w : src.w, src.full ? h : src.h);
    const alpha = clamp01(how && how.alpha !== undefined ? how.alpha : finite(r.opacity, 1));
    if (!(alpha > 0.002)) return;
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = (how && how.blend === false)
      ? "source-over" : (BLEND_2D[String(r.blend || "normal")] || "source-over");
    if (c.filter !== undefined) {
      const f = canFilter ? gradeFilter(r.color, missing, 1) : "none";
      c.filter = f;
      if (!canFilter && r.color) missing.add("grade");
    } else if (r.color) { missing.add("grade"); }
    /* 回転と拡大は基準点まわり → 中心へ移動 → 反転 */
    c.translate(box.px, box.py);
    c.rotate(box.rot);
    c.translate(box.cx - box.px, box.cy - box.py);
    if (box.flipH || box.flipV) c.scale(box.flipH ? -1 : 1, box.flipV ? -1 : 1);
    if (r.mask) clipMask(c, r.mask, box.w, box.h);
    if (r.chroma) missing.add("chroma");
    const sx = box.crop.l * src.w, sy = box.crop.t * src.h;
    const sw = Math.max(1, box.crop.w * src.w), sh = Math.max(1, box.crop.h * src.h);
    try {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(src.el, sx, sy, sw, sh, -box.w / 2, -box.h / 2, box.w, box.h);
    } catch (e) {
      warnOnce("drawImage:" + r.kind, e);        // 読み込み途中の video などは飛ばす
    }
    if (r.fx && r.fx.length) apply2dFx(c, r, box, w, h);   // 層の上に重ねる物（在れば）
    c.restore();
    st.draws++;
  }

  /** fx の 2d フォールバックが在れば呼ぶ（無ければ名前を申告するだけ） */
  function apply2dFx(c, r, box, w, h) {
    for (const f of r.fx) {
      const reg = fxEntry(f.type);
      const fn = reg ? pickFn(reg, ["apply2d", "draw2d", "fallback2d", "render2d"]) : null;
      if (!fn) { missing.add("fx." + f.type); continue; }
      try { fn(c, { ctx: c, canvas: null, w, h, box, params: f.params, time: finite(r.localTime, 0), opacity: finite(r.opacity, 1) }); }
      catch (e) { warnOnce("fx2d:" + f.type, e); missing.add("fx." + f.type); }
    }
  }
  /** FX_REGISTRY を触るのは 2d でもここだけ（未読込でも落ちないように遅延） */
  let fxReg = null;
  function fxEntry(type) {
    if (fxReg === null) {
      fxReg = {};
      try {
        /* 静的 import を増やさないため、在れば globalThis 経由で受け取る。
           通常は compositor.js が setFxRegistry() で渡す。 */
        fxReg = (o.fxRegistry && typeof o.fxRegistry === "object") ? o.fxRegistry : {};
      } catch (_e) { fxReg = {}; }
    }
    return fxReg && fxReg[type] ? fxReg[type] : null;
  }

  /** 遷移（crossfade / dip / slide。それ以外は crossfade へ落として申告） */
  function drawTransition(c, r, partner, src, w, h, fps, sources, mode, project) {
    const pair = transitionPair(r, partner);
    const type = String((r.transition && r.transition.type) || "crossfade");
    const p = pair.p;
    const A = pair.a, B = pair.b;
    const sa = A ? (A === r ? src : sourceFor(A, sources, w, h, fps, mode)) : null;
    const sb = B ? (B === r ? src : sourceFor(B, sources, w, h, fps, mode)) : null;
    const ca = sa ? scratch(0, w, h) : null;
    const cb = sb ? scratch(1, w, h) : null;
    if (ca && A) drawLayer(ca.ctx, A, sa, w, h, { blend: false });
    if (cb && B) drawLayer(cb.ctx, B, sb, w, h, { blend: false });
    const reg = trEntry(type);
    const fn = reg ? pickFn(reg, ["apply2d", "draw2d", "fallback2d", "render2d"]) : null;
    c.save();
    c.globalCompositeOperation = BLEND_2D[String(r.blend || "normal")] || "source-over";
    if (fn) {
      try {
        fn(c, {
          ctx: c, canvas: null, w, h, p,
          a: ca ? ca.canvas : null, b: cb ? cb.canvas : null,
          params: (r.transition && r.transition.params) || {}, time: finite(r.localTime, 0)
        });
        c.restore(); st.draws++;
        return;
      } catch (e) { warnOnce("tr2d:" + type, e); }
    }
    if (type === "slide" || type === "slideLeft" || type === "whipPan" || type === "push") {
      if (ca) { c.globalAlpha = 1; c.drawImage(ca.canvas, -w * p, 0); }
      if (cb) { c.globalAlpha = 1; c.drawImage(cb.canvas, w * (1 - p), 0); }
    } else if (type === "dip" || type === "dipToBlack" || type === "dipToWhite" || type === "fadeToBlack") {
      const white = type === "dipToWhite";
      if (p < 0.5) {
        if (ca) { c.globalAlpha = 1; c.drawImage(ca.canvas, 0, 0); }
        c.globalAlpha = clamp01(p * 2);
      } else {
        if (cb) { c.globalAlpha = 1; c.drawImage(cb.canvas, 0, 0); }
        c.globalAlpha = clamp01((1 - p) * 2);
      }
      c.globalCompositeOperation = "source-over";
      c.fillStyle = white ? "#ffffff" : "#000000";
      c.fillRect(0, 0, w, h);
    } else {
      if (type !== "crossfade" && type !== "fade" && type !== "dissolve") missing.add("transition." + type);
      if (ca) { c.globalAlpha = 1; c.drawImage(ca.canvas, 0, 0); }
      if (cb) { c.globalAlpha = clamp01(p); c.drawImage(cb.canvas, 0, 0); }
    }
    c.restore();
    st.draws++;
  }
  let trReg = null;
  function trEntry(type) {
    if (trReg === null) trReg = (o.transitions && typeof o.transitions === "object") ? o.transitions : {};
    return trReg && trReg[type] ? trReg[type] : null;
  }

  /** 調整レイヤー（そこまでの合成結果に filter を掛ける） */
  function drawAdjust(c, r, w, h) {
    if (!canFilter) { missing.add("adjust"); return; }
    const f = gradeFilter(r.color, missing, 1);
    if (r.fx && r.fx.length) for (const x of r.fx) missing.add("fx." + x.type);
    if (f === "none") return;
    const s = scratch(0, w, h);
    s.ctx.drawImage(c.canvas, 0, 0);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = clamp01(finite(r.opacity, 1));
    c.globalCompositeOperation = "source-over";
    c.filter = f;
    if (r.mask) {
      c.translate(w / 2, h / 2);
      clipMask(c, r.mask, w, h);
      c.translate(-w / 2, -h / 2);
    }
    c.drawImage(s.canvas, 0, 0);
    c.restore();
    st.draws++;
  }

  /** 背景（色 / 画像 / ぼかし） */
  function drawBackground(c, project, list, sources, w, h, fps, mode) {
    const s = (project && project.settings) || {};
    const bg = s.background || {};
    const type = String(bg.type || "color");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    if (c.filter !== undefined) c.filter = "none";
    c.fillStyle = typeof bg.color === "string" ? bg.color : "#000000";
    c.fillRect(0, 0, w, h);
    if (type === "color") return;
    if (type === "image" && bg.assetId) {
      const a = assetById(project, bg.assetId);
      if (a && sources && typeof sources.acquire === "function") {
        try {
          const fake = { kind: "image", clip: { id: "__bg", kind: "image", assetId: bg.assetId }, assetId: bg.assetId, asset: a, sourceTime: 0, localTime: 0, duration: 0, visible: true };
          const src = sources.acquire(fake, { mode: mode || "play" });
          if (src && src.el) {
            const cb = coverBox(w, h, finite(src.width, 0) || src.el.width, finite(src.height, 0) || src.el.height);
            c.drawImage(src.el, cb.cx - cb.w / 2, cb.cy - cb.h / 2, cb.w, cb.h);
            return;
          }
        } catch (e) { warnOnce("bg.image", e); }
      }
      missing.add("background.image");
      return;
    }
    /* blur: 一番下の絵をぼかして敷く。ctx.filter が無ければ拡大だけ */
    const base = list.find((x) => x && x.visible && x.kind !== "adjust");
    if (!base) return;
    const src = sourceFor(base, sources, w, h, fps, mode);
    if (!src) return;
    const cb = coverBox(w, h, src.full ? w : src.w, src.full ? h : src.h);
    c.save();
    if (c.filter !== undefined && canFilter) {
      c.filter = "blur(" + Math.max(2, finite(bg.blur, 40) * Math.min(w, h) / 1080).toFixed(1) + "px) brightness(0.8)";
    } else { missing.add("background.blur"); c.globalAlpha = 0.6; }
    try { c.drawImage(src.el, cb.cx - cb.w / 2, cb.cy - cb.h / 2, cb.w, cb.h); }
    catch (e) { warnOnce("bg.blur.draw", e); }
    c.restore();
  }

  /* ── 契約の形 ─────────────────────────────────────────────────── */
  const api = {
    backend: "2d",
    get canvas() { return canvas; },

    resize(w, h) {
      const W = Math.max(2, Math.round(finite(w, 0))), H = Math.max(2, Math.round(finite(h, 0)));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
    },

    /**
     * 1 フレーム描く（契約書 §4）。同じ time で 2 回呼ばれたら 2 回描く。
     * @returns {Promise<void>|void}
     */
    renderFrame(project, time, options) {
      const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const op = options || {};
      const sizes = outSize(project, canvas.width, canvas.height, op.quality);
      const fps = Math.max(1, finite(project && project.settings && project.settings.fps, 30));
      const mode = op.mode || (op.forExport ? "export" : "play");
      const c = stage(sizes.W, sizes.H, sizes.w, sizes.h);
      st.q = sizes.q;
      let list = [];
      try { list = clipsAt(project, time, { fps }) || []; }
      catch (e) { warnOnce("clipsAt", e); list = []; }
      try { drawBackground(c, project, list, op.sources, sizes.w, sizes.h, fps, mode); }
      catch (e) { warnOnce("background", e); }
      st.layers = 0;
      for (const r of list) {
        if (!r) continue;
        try {
          if (!r.visible) continue;                       // hidden / opacity 0 は飛ばす
          if (r.kind === "adjust") { drawAdjust(c, r, sizes.w, sizes.h); st.layers++; continue; }
          const src = sourceFor(r, op.sources, sizes.w, sizes.h, fps, mode);
          if (!src) continue;
          st.layers++;
          if (r.transition) {
            const partner = resolvePartner(project, r, time, fps);
            drawTransition(c, r, partner, src, sizes.w, sizes.h, fps, op.sources, mode, project);
          } else {
            c.setTransform(1, 0, 0, 1, 0, 0);
            drawLayer(c, r, src, sizes.w, sizes.h);
          }
        } catch (e) {
          warnOnce("layer:" + ((r.clip && r.clip.id) || "?"), e);   // 1 枚の失敗で全部を黒にしない
        }
      }
      /* 小さく描いていたら canvas へ引き伸ばす */
      if (c !== ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        if (ctx.filter !== undefined) ctx.filter = "none";
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(buf, 0, 0, sizes.w, sizes.h, 0, 0, sizes.W, sizes.H);
      }
      st.ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      st.avg = st.frames ? st.avg * 0.85 + st.ms * 0.15 : st.ms;
      st.frames++;
      if (op.forExport) return Promise.resolve();
      return undefined;
    },

    /** 現在の canvas を ImageData で（静止画書き出し用） */
    grabPixels() {
      const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
      return ctx.getImageData(0, 0, w, h);
    },

    stats() {
      return {
        backend: "2d", ms: Math.round(st.ms * 100) / 100, avgMs: Math.round(st.avg * 100) / 100,
        frames: st.frames, layers: st.layers, draws: st.draws, quality: st.q,
        width: canvas.width, height: canvas.height,
        ctxFilter: canFilter, reason: st.reason,
        missing: Array.from(missing).sort(), warnings: warnings.slice()
      };
    },

    /** fx / 遷移の 2d フォールバックを後から渡す口（compositor.js が使う） */
    setRegistries(fx, transitions) {
      if (fx && typeof fx === "object") fxReg = fx;
      if (transitions && typeof transitions === "object") trReg = transitions;
    },

    dispose() {
      buf = bctx = tA = tB = null;
      textCache.length = 0;
    }
  };
  return api;
}
