/* ══════════════════════════════════════════════════════════════════════
   analysis/track.js — 被写体を追う所（自動リフレーム = 縦動画化の土台）

   ★ 何をする所か / なぜこの形か
     ① trackSubject: 最初に与えた枠を、正規化相互相関（NCC）の局所探索で次の
        フレームへ運ぶ。光学フロー（契約書 §9 で v1 の対象外）も WebGL も使わず、
        小さな gray フレーム列（analysis/video.js の Frame）だけで完結させる。
        ピラミッドは 2 段（半分の絵で粗く当てて、元の絵で ±2px 詰める）。
        これで探索が 1/4 になり、iPhone でも 4fps サンプルの素材が実用になる。
     ② autoReframeCurve: 注目点の重心を追い、指数移動平均で滑らかにし、画面の外へ
        出ないよう clamp した「切り出し窓の動き」を返す。CapCut の自動リフレームと
        同じ考え方で、結果は clip.transform（と keys）へ素直に落ちる形にした。

     どちらも **pure**（DOM も async も無い）。Node の試験で値を固定できる。

   ★ 触るときの注意
     ・conf が落ちている間は **テンプレートを更新しない**。更新し続けると、隠れた
       瞬間に背景を学習して被写体を捨てる（漂流）。ここが追跡の生死を分ける。
     ・無地（真っ黒・単色）では NCC の分母が 0 になる。0 を返して **NaN を外へ
       出さない**（NaN は transform に入ると画面が消える）。
     ・box は **0..1 の正規化座標で左上 + 大きさ**（`{x,y,w,h}`）。配列 `[x,y,w,h]`
       でも受ける（analysis/video.js の detectFaces と契約書 §1 の faces がこの形）。
     ・autoReframeCurve の scale は「素材全体を対象枠へ contain で入れた状態」を 1 と
       した拡大率。engine 側の transform.scale の意味と合わせてある。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, clamp01, finite } from "../core/util.js";
import { frameDims } from "./video.js";

/** @typedef {{x:number,y:number,w:number,h:number}} Box 0..1 の左上 + 大きさ */
/** @typedef {{t:number, box:Box, conf:number}} TrackSample */

/* ── 0. 枠の小道具 ───────────────────────────────────────── */

/**
 * box を 0..1 の `{x,y,w,h}` に揃える。配列 `[x,y,w,h]` も受ける。
 * w/h（素材の画素）を渡すと、画素で書かれた枠（1.5 を超える値）も直す。
 * @returns {Box|null} 読めなければ null（呼び出し側が既定へ戻せるように）
 */
export function normalizeBox(box, w = 0, h = 0) {
  let x, y, bw, bh;
  if (Array.isArray(box) && box.length >= 4) { x = box[0]; y = box[1]; bw = box[2]; bh = box[3]; }
  else if (box && typeof box === "object") {
    x = box.x; y = box.y;
    bw = box.w !== undefined ? box.w : box.width;
    bh = box.h !== undefined ? box.h : box.height;
  } else return null;
  x = finite(x, NaN); y = finite(y, NaN); bw = finite(bw, NaN); bh = finite(bh, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(bw) || !Number.isFinite(bh)) return null;
  if (!(bw > 0) || !(bh > 0)) return null;
  const looksPx = Math.max(x + bw, y + bh) > 1.5;
  if (looksPx && w > 0 && h > 0) { x /= w; bw /= w; y /= h; bh /= h; }
  const nx = clamp01(x), ny = clamp01(y);
  return { x: nx, y: ny, w: clamp(bw, 1e-4, 1 - nx), h: clamp(bh, 1e-4, 1 - ny) };
}

/** 枠の中心（0..1） */
export function boxCenter(box) {
  const b = normalizeBox(box);
  return b ? { x: clamp01(b.x + b.w / 2), y: clamp01(b.y + b.h / 2) } : null;
}

/** 一番大きい枠を選ぶ（顔が複数写っているときは主役を大きさで決める） */
export function largestBox(boxes) {
  let best = null, area = -1;
  for (const raw of Array.isArray(boxes) ? boxes : []) {
    const b = normalizeBox(raw);
    if (!b) continue;
    const a = b.w * b.h;
    if (a > area) { area = a; best = b; }
  }
  return best;
}

/** 画素の矩形を枠の内側へ収める（幅・高さは 2px 以上） */
function clampRect(r, w, h) {
  const bw = Math.max(2, Math.min(w, Math.round(finite(r.w, 2))));
  const bh = Math.max(2, Math.min(h, Math.round(finite(r.h, 2))));
  return { x: Math.round(clamp(finite(r.x, 0), 0, w - bw)), y: Math.round(clamp(finite(r.y, 0), 0, h - bh)), w: bw, h: bh };
}

/** 画素の矩形 → 0..1 の枠 */
function rectToBox(r, w, h) {
  return { x: clamp01(r.x / w), y: clamp01(r.y / h), w: clamp(r.w / w, 1e-4, 1), h: clamp(r.h / h, 1e-4, 1) };
}

/** 半分の絵の座標系へ（ピラミッドの上の段） */
function halfRect(r) {
  return { x: Math.floor(r.x / 2), y: Math.floor(r.y / 2), w: Math.max(2, Math.round(r.w / 2)), h: Math.max(2, Math.round(r.h / 2)) };
}

/* ── 1. 相関（pure） ─────────────────────────────────────── */

/** 2x2 平均で半分に縮める（ピラミッドの上の段を作る） */
export function halfGray(gray, w, h) {
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const g = new Uint8Array(w2 * h2);
  if (!gray || !(w > 0) || !(h > 0)) return { gray: g, w: w2, h: h2 };
  for (let y = 0; y < h2; y++) {
    const r0 = y * 2 * w, r1 = Math.min(h - 1, y * 2 + 1) * w, out = y * w2;
    for (let x = 0; x < w2; x++) {
      const x0 = x * 2, x1 = Math.min(w - 1, x0 + 1);
      g[out + x] = (gray[r0 + x0] + gray[r0 + x1] + gray[r1 + x0] + gray[r1 + x1]) >> 2;
    }
  }
  return { gray: g, w: w2, h: h2 };
}

/** 矩形を切り出す（端は縁の色で伸ばす。外に出ても落ちない） */
export function extractPatch(gray, w, h, r) {
  const out = new Float32Array(Math.max(0, r.w * r.h));
  if (!gray || !(w > 0) || !(h > 0)) return out;
  for (let y = 0; y < r.h; y++) {
    const sy = Math.min(h - 1, Math.max(0, r.y + y)) * w, row = y * r.w;
    for (let x = 0; x < r.w; x++) out[row + x] = gray[sy + Math.min(w - 1, Math.max(0, r.x + x))];
  }
  return out;
}

/** 正規化相互相関 -1..1。分母が 0（無地）のときは 0（NaN を出さない） */
export function ncc(a, b) {
  const n = Math.min(a ? a.length : 0, b ? b.length : 0);
  if (!n) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 1e-6 ? clamp(num / den, -1, 1) : 0;
}

/** rect の周り ±R を全部試して一番似ている位置を返す */
function searchBest(tpl, rect, gray, w, h, R) {
  let best = { dx: 0, dy: 0, score: -2 };
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const s = ncc(tpl, extractPatch(gray, w, h, { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }));
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  return best;
}

/* ── 2. 追跡（pure） ─────────────────────────────────────── */

/**
 * テンプレート追跡（ピラミッド 2 段 + 局所探索）。
 * @param {import("./video.js").Frame[]} frames
 * @param {{box:*, method?:"template", search?:number, minConf?:number,
 *          updateConf?:number, blend?:number}} [opts]
 *   search  … 探索半径（素材の長辺に対する割合。既定 0.12）
 *   minConf … これ未満なら枠を動かさない（見失っている間は止まる方が使える）
 *   updateConf … これ以上のときだけテンプレを更新（漂流防止の要）
 * @returns {TrackSample[]} 先頭は与えた枠そのまま（conf 1）
 */
export function trackSubject(frames, opts = {}) {
  const list = Array.isArray(frames) ? frames : [];
  if (!list.length) return [];
  const method = opts.method === undefined ? "template" : opts.method;
  if (method !== "template") throw new Error(`trackSubject: method "${method}" は未対応（template のみ）`);
  const { w, h } = frameDims(list[0]);
  const nb = normalizeBox(opts.box, w, h);
  if (!nb || !(w > 1) || !(h > 1)) {
    const fallback = nb || { x: 0.35, y: 0.35, w: 0.3, h: 0.3 };
    return list.map((f) => ({ t: finite(f && f.t, 0), box: { ...fallback }, conf: 0 }));
  }
  const search = Math.max(2, Math.round(clamp(finite(opts.search, 0.12), 0.01, 0.5) * Math.max(w, h)));
  const minConf = clamp(finite(opts.minConf, 0.35), 0, 1);
  const updateConf = clamp(finite(opts.updateConf, 0.6), 0, 1);
  const alpha = clamp(finite(opts.blend, 0.25), 0, 1);
  let rect = clampRect({ x: nb.x * w, y: nb.y * h, w: nb.w * w, h: nb.h * h }, w, h);
  const half0 = halfGray(list[0].gray, w, h);
  let tplFull = extractPatch(list[0].gray, w, h, rect);
  let tplHalf = extractPatch(half0.gray, half0.w, half0.h, halfRect(rect));
  const out = [{ t: finite(list[0].t, 0), box: rectToBox(rect, w, h), conf: 1 }];
  for (let i = 1; i < list.length; i++) {
    const g = list[i] && list[i].gray ? list[i].gray : null;
    if (!g) { out.push({ t: finite(list[i] && list[i].t, 0), box: rectToBox(rect, w, h), conf: 0 }); continue; }
    const hg = halfGray(g, w, h);
    // 粗（半分の絵）→ 密（元の絵で ±2px）
    const coarse = searchBest(tplHalf, halfRect(rect), hg.gray, hg.w, hg.h, Math.max(1, Math.ceil(search / 2)));
    const guess = clampRect({ x: rect.x + coarse.dx * 2, y: rect.y + coarse.dy * 2, w: rect.w, h: rect.h }, w, h);
    const fine = searchBest(tplFull, guess, g, w, h, 2);
    const conf = clamp01(fine.score);
    if (conf >= minConf) rect = clampRect({ x: guess.x + fine.dx, y: guess.y + fine.dy, w: rect.w, h: rect.h }, w, h);
    if (conf >= updateConf) { // 自信が在るときだけ学習する（無いときに学ぶと背景を覚える）
      const pf = extractPatch(g, w, h, rect), ph = extractPatch(hg.gray, hg.w, hg.h, halfRect(rect));
      for (let k = 0; k < tplFull.length; k++) tplFull[k] += (pf[k] - tplFull[k]) * alpha;
      for (let k = 0; k < tplHalf.length; k++) tplHalf[k] += (ph[k] - tplHalf[k]) * alpha;
    }
    out.push({ t: finite(list[i].t, 0), box: rectToBox(rect, w, h), conf });
  }
  return out;
}

/* ── 3. 自動リフレーム（pure） ───────────────────────────── */

/** "9:16" / "1.777" / 数値 → 比（w/h）。読めなければ fallback */
export function parseRatio(r, fallback = 9 / 16) {
  if (typeof r === "number" && Number.isFinite(r) && r > 0) return r;
  if (typeof r === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*[:/xX×]\s*(\d+(?:\.\d+)?)\s*$/.exec(r);
    if (m) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (a > 0 && b > 0) return a / b;
    }
    const v = parseFloat(r);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return fallback;
}

/**
 * 動いた所の重心（0..1）。差が小さすぎるときは null（＝注目点が分からない）。
 * @returns {{x:number,y:number,energy:number}|null}
 */
export function motionCentroid(prevGray, curGray, w, h, thr = 12) {
  if (!prevGray || !curGray || !(w > 1) || !(h > 1)) return null;
  const t = Math.max(1, finite(thr, 12));
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const d = Math.abs(curGray[row + x] - prevGray[row + x]);
      if (d > t) { sx += x * d; sy += y * d; sw += d; }
    }
  }
  if (!(sw > 0)) return null;
  return { x: clamp01(sx / sw / (w - 1)), y: clamp01(sy / sw / (h - 1)), energy: clamp01(sw / (w * h * 255)) };
}

/** 追跡結果 / 顔 / 点 のどれでも「注目点」に読み替える */
function pointOfSample(s) {
  if (!s || typeof s !== "object") return null;
  if (s.box || s.boxes) {
    const b = s.box ? normalizeBox(s.box) : largestBox(s.boxes);
    return b ? { x: clamp01(b.x + b.w / 2), y: clamp01(b.y + b.h / 2) } : null;
  }
  if (Number.isFinite(s.x) && Number.isFinite(s.y)) return { x: clamp01(s.x), y: clamp01(s.y) };
  return null;
}

/** focus を「フレームごとの注目点」に展開する（足りない所は直前を引き継ぐ） */
function focusPoints(frames, focus, w, h) {
  const n = frames.length;
  const out = new Array(n).fill(null);
  if (Array.isArray(focus) && focus.length) {
    // t が近いサンプルを拾う（追跡結果・顔はフレーム数と一致しない事がある）
    const samples = focus.map((s) => ({ t: finite(s && s.t, NaN), conf: Number.isFinite(s && s.conf) ? s.conf : 1, p: pointOfSample(s) }))
      .filter((s) => s.p && Number.isFinite(s.t));
    for (let i = 0; i < n; i++) {
      const t = finite(frames[i] && frames[i].t, 0);
      let near = null, dmin = Infinity;
      for (const s of samples) {
        const d = Math.abs(s.t - t);
        if (d < dmin) { dmin = d; near = s; }
      }
      out[i] = near && near.conf >= 0.1 ? near.p : null;
    }
  } else if (focus && typeof focus === "object" && !Array.isArray(focus)) {
    const p = pointOfSample(focus);
    for (let i = 0; i < n; i++) out[i] = p;
  } else if (focus !== "center") {
    // 既定: 動いた所を追う（何も無い素材では中央のまま）
    for (let i = 1; i < n; i++) {
      const c = motionCentroid(frames[i - 1] && frames[i - 1].gray, frames[i] && frames[i].gray, w, h);
      out[i] = c ? { x: c.x, y: c.y } : null;
    }
  }
  let last = null;
  for (let i = 0; i < n; i++) {
    if (out[i]) last = out[i];
    else out[i] = last;
  }
  // 頭がまだ空なら、最初に見つかった点（無ければ中央）で埋める
  const first = out.find((p) => p) || { x: 0.5, y: 0.5 };
  for (let i = 0; i < n; i++) if (!out[i]) out[i] = first;
  return out;
}

/**
 * 自動リフレームの窓の動き。
 * @param {import("./video.js").Frame[]} frames
 * @param {{targetRatio?:number|string, focus?:*, smooth?:number}} [opts]
 *   targetRatio … 出したい比（"9:16" / 0.5625 / 16/9）
 *   focus … trackSubject の結果 / detectFaces の結果 / `{x,y}` / "center" / 省略（動き）
 *   smooth … 0..0.98。大きいほどゆっくり（既定 0.8）
 * @returns {{t:number,x:number,y:number,scale:number}[]} x,y は切り出し窓の中心（0..1）
 */
export function autoReframeCurve(frames, opts = {}) {
  const list = Array.isArray(frames) ? frames : [];
  if (!list.length) return [];
  const { w, h } = frameDims(list[0]);
  const As = w > 0 && h > 0 ? w / h : 16 / 9;
  const At = parseRatio(opts.targetRatio, 9 / 16);
  const cw = clamp(Math.min(1, At / As), 0.05, 1);
  const ch = clamp(Math.min(1, As / At), 0.05, 1);
  const scale = 1 / Math.min(cw, ch);
  const alpha = 1 - clamp(finite(opts.smooth, 0.8), 0, 0.98);
  const pts = focusPoints(list, opts.focus, w, h);
  const out = [];
  let ex = null, ey = null;
  for (let i = 0; i < list.length; i++) {
    const p = pts[i] || { x: 0.5, y: 0.5 };
    // 最初の点から走り出す（0.5 から始めると頭が必ず寄っていく動きになる）
    if (ex === null) { ex = p.x; ey = p.y; }
    else { ex += (p.x - ex) * alpha; ey += (p.y - ey) * alpha; }
    out.push({
      t: finite(list[i] && list[i].t, 0),
      x: clamp(ex, cw / 2, 1 - cw / 2),
      y: clamp(ey, ch / 2, 1 - ch / 2),
      scale,
    });
  }
  return out;
}
