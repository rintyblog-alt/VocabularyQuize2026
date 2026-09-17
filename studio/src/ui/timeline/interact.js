/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/interact.js — タイムラインの「触り方」

   ★ 何をする所か
     ルーラー・クリップ・空白・トラック境界に来る **すべての入力**（マウス・
     ペン・指・ホイール・右クリック・ドロップ）を受け、次の 2 つだけに変える。
       ① 触っている間 … view（C1 の TimelineView）に **仮の絵**を描かせる
       ② 指を離した時 … **1 回だけ** store へ dispatch（= 取消 1 回で戻る）
     秒と算数（吸着・端の止め方）は snap.js に出してあるので、ここは
     「座標 → 秒」「状態遷移」「絵の指示」「op を投げる」だけを持つ。

   ★ なぜこの形か
     ・編集ソフトの価値は「掴んだ物が指に付いてくる」感触。だからドラッグ中は
       state を書き換えない（再描画も undo も起こさない）。確定は離した 1 回。
     ・pointermove は 1 フレームに何度も来る。来た値は溜めるだけにして、
       rAF で 1 フレーム 1 回だけ読む（60fps を守る）。
     ・「画面座標 → 秒」は **この場で自分で計算する**。view.timeToX が内容座標か
       画面座標かは実装次第で、混ぜると 1px ずれが積もって吸着が信用できなく
       なる。view には *絵*（setGhost / setSnapLine / setMarquee）だけを頼む。
     ・view にその関数が無くても画面が死なないよう、呼ぶ前に `has()` で確かめ、
       無ければ DOM への控えの描き方に落ちる（同僚が並行して書いているため）。
     ・指の作法は CapCut に合わせる（1 本払い = 盤面が動き再生ヘッドは中央固定、
       2 本 = ピンチ、長押し 400ms = 移動）。ここが違うと「壊れている」と見える。

   ★ 触るときの注意
     ・pointercancel / 指が増えた / 画面回転 / タブが隠れた → `abort()` で必ず
       元へ戻す。半端な ghost が残ると壊れて見える。
     ・listener は必ず `on()` 経由（dispose で全部外すため）。
     ・CSS は触らない。付けるクラスは vqs- 接頭辞のみ。

   ★ CONTRACT-NOTE（契約書に無い部分の取り決め。実物と違ったらここだけ直す）
     view（全て任意・無ければ控えの絵）:
       pxPerSec|zoom（number か ()=>number） / scrollX / timeAtClientX(x)
       hitTest(x,y) -> {kind,clipId,trackId,edge} / trackRects() -> [{trackId,top,bottom}]
       setGhost(g|null) / setSnapLine(t|null,hit) / setMarquee(rect|null)
       setPxPerSec(v)|setZoom(v) / setScrollX(px) / centerOn(t) / render()
       ghost g = { mode:"move"|"trim"|"slip", dup, lifted, edge, ripple, snap,
                   clipIds:[], items:[{clipId,fromStart,start,duration,
                                       fromTrackId,trackId,dy}] }
     dispatch する op の payload（op 名は契約書 §3。payload はここが唯一の取り決め）:
       clip.move {clipId,trackId,start}          clip.duplicate {clipId,trackId,start}
       clip.trim {clipId,edge:"in"|"out",time,ripple}   clip.roll {clipId,otherClipId,time}
       clip.slip {clipId,delta}   ※delta は in/out に足す素材秒（右へ引くと負）
       clip.split {clipId,t}      clip.remove {clipIds}   clip.rippleDelete {clipIds}
       clip.update {clipId,patch} clip.setSpeed {clipId,speed}
       clip.detachAudio {clipId}  clip.group {clipIds}    clip.ungroup {clipIds}
       clip.freeze {clipId,t}     clip.reverse {clipId}   compound.make {clipIds}
       clip.add {trackId,start,assetId}   timeline.paste {trackId,t,clips}
       track.update {trackId,patch:{height}}
     外へ出す合図（受け手は inspector / import 担当）:
       document 上の CustomEvent "vqs:clip-activate" {clipId,kind,tab}
       document 上の CustomEvent "vqs:timeline-drop" {files,trackId,t}
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { buildSnapPoints, snapTime, resolveMove, resolveTrim, resolveSlip, clipsInTimeRange } from "./snap.js";
import { clamp, finite } from "../../core/util.js";
import { snapFrame } from "../../core/time.js";
import { MIN_CLIP, clipEnd, projectDuration } from "../../core/schema.js";
import { warn } from "../../core/log.js";

/* ── 触り心地の数値（ここを変えると感触が変わる） ─────────────── */
const LONG_PRESS_MS = 400;    // 長押し → 移動モード（CapCut と同じ）
const TAP_SLOP = 8;           // これ以上動いたら「叩いた」ではない
const EDGE_MOUSE = 8;         // トリムの掴み代（マウス）
const EDGE_TOUCH = 18;        // 同（指・契約どおり 18px）
const GAP_MOUSE = 5;          // トラック境界の掴み代
const AUTOSCROLL_ZONE = 56;   // 端からこの距離で自動スクロール
const AUTOSCROLL_MAX = 1200;  // px/秒（契約どおりの上限）
const PPS_MIN = 10;           // ピンチの下限（px/秒）
const PPS_MAX = 400;          // ピンチの上限
const PPS_HARD_MAX = 4000;    // ホイール拡大の上限
const FRICTION = 0.92;        // 慣性の減衰（1 フレーム）
const BOUNCE = 0.35;          // 端での跳ね返り
const TRACK_H = [36, 240];    // トラック高さの下限・上限
const LABELS = ["#4f8cff", "#31c48d", "#f0b429", "#f2643d", "#a78bfa", "#94a3b8"];
const DRAGGING = ["pan", "pinch", "move", "trim", "roll", "slip", "scrub"];
const LOOPING = ["scrub", "move", "trim", "roll", "slip", "marquee"];

const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("tl-interact", k, e); return undefined; }
}
/** number でも ()=>number でも読む（view の作りに依らないため） */
function readNum(o, k) {
  if (!o) return NaN;
  const v = o[k];
  if (typeof v === "number") return v;
  if (typeof v === "function") { try { const r = v.call(o); return typeof r === "number" ? r : NaN; } catch (e) { return NaN; } }
  return NaN;
}
function esc(s) {
  const t = String(s);
  return (typeof CSS !== "undefined" && CSS && CSS.escape) ? CSS.escape(t) : t.replace(/["\\\]]/g, "\\$&");
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 出来なくて良い */ } }

/**
 * タイムラインの触り方を立ち上げる。
 * @param {Object} arg
 * @param {*} arg.store       core/store.js の Store
 * @param {*} [arg.view]      ui/timeline/view.js の TimelineView（無くても動く）
 * @param {Object} arg.els    app.js が配る DOM 参照（tlScroll / tlRuler / tlTracks …）
 * @param {*} [arg.transport] engine/playback.js の Transport（無ければ store.setView で代替）
 * @param {*} [arg.widgets]   ui/widgets.js（menu / toast。無ければ黙る）
 * @returns {{dispose:Function}}
 */
export function createTimelineInteraction(arg) {
  const { store, view = null, els = {}, transport = null, widgets = null } = arg || {};
  const root = els.tlScroll || els.tlTracks || null;
  if (!store || !root) { warn("tl-interact", "store か #tlScroll が無いので触り方を付けない"); return { dispose() { } }; }

  const bound = [];
  function on(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    bound.push([target, type, fn, opts]);
  }

  /** 今触っている 1 つだけの状態 */
  const G = {
    mode: "idle", pointerId: -1, touch: false, alt: false, ctrl: false, shift: false,
    startX: 0, startY: 0, x: 0, y: 0, moved: false, hit: null,
    items: [], edge: null, other: null, trackId: null, height: 0, el: null,
    dup: false, lifted: false, points: [], hitPoint: null, lineT: null,
    pinch: { d0: 1, pps0: 60, t0: 0 }, vel: 0, lastT: 0, panX: 0,
    timer: 0, loop: 0, inertia: 0, dirty: false, buzzed: 0
  };
  const pointers = new Map();
  let clipboard = [];
  let menuHandle = null;
  let dropEl = null;

  /* ══ 1. 座標と時間 ══════════════════════════════════════════ */
  const P = () => store.project || {};
  const SET = () => P().settings || {};
  const VW = () => store.view || {};
  const fps = () => Math.max(1, finite(SET().fps, 30));
  const tol = () => (G.touch ? 12 : 8);

  function pxPerSec() {
    let v = readNum(view, "pxPerSec");
    if (!(v > 0)) v = readNum(view, "zoom");
    if (!(v > 0)) v = finite(VW().zoom, 60);
    return clamp(v, 1, PPS_HARD_MAX);
  }
  /** クリップが並ぶ帯の左端（画面座標・scroll 済み） */
  function contentLeft() { return (els.tlTracks || els.tlRuler || root).getBoundingClientRect().left; }
  function viewRect() { return root.getBoundingClientRect(); }
  function timeAt(clientX) {
    const t = tryCall(view, "timeAtClientX", [clientX]);
    if (typeof t === "number" && Number.isFinite(t)) return t;
    return (clientX - contentLeft()) / pxPerSec();
  }
  const scrollable = () => root.scrollWidth > root.clientWidth + 1;
  function scrollX() {
    const v = readNum(view, "scrollX");
    if (Number.isFinite(v)) return v;
    return scrollable() ? root.scrollLeft : finite(VW().scrollX, 0);
  }
  function maxScrollX() {
    if (scrollable()) return Math.max(0, root.scrollWidth - root.clientWidth);
    return Math.max(0, projectDuration(P()) * pxPerSec() - viewRect().width * 0.5);
  }
  function setScrollX(px) {
    const v = clamp(px, -viewRect().width * 0.5, maxScrollX());
    if (has(view, "setScrollX")) tryCall(view, "setScrollX", [v]);
    else if (scrollable()) root.scrollLeft = Math.max(0, v);
    else if (has(store, "setView")) store.setView({ scrollX: v });
  }
  function setPps(v) {
    const p = clamp(v, PPS_MIN, PPS_HARD_MAX);
    if (has(view, "setPxPerSec")) tryCall(view, "setPxPerSec", [p]);
    else if (has(view, "setZoom")) tryCall(view, "setZoom", [p]);
    else if (has(store, "setView")) store.setView({ zoom: p });
    return p;
  }
  /** t を画面中央へ（モバイルの「再生ヘッド中央固定」） */
  function centerOn(t) {
    if (has(view, "centerOn")) tryCall(view, "centerOn", [t]);
    else setScrollX(t * pxPerSec() - viewRect().width * 0.5);
  }
  function seek(t, scrub) {
    const v = Math.max(0, finite(t, 0));
    if (has(transport, "seek")) tryCall(transport, "seek", [v, { scrub: scrub !== false }]);
    else if (has(store, "setView")) store.setView({ playhead: v });
  }
  const playhead = () => Math.max(0, transport && typeof transport.time === "number" ? transport.time : finite(VW().playhead, 0));
  const repaint = () => { tryCall(view, "render"); };

  /* ══ 2. 当たり判定 ══════════════════════════════════════════ */
  const clipEl = (id) => (id ? root.querySelector('[data-clip-id="' + esc(id) + '"]') : null);

  function trackRects() {
    const r = tryCall(view, "trackRects");
    if (Array.isArray(r) && r.length) return r;
    const host = els.tlTracks;
    if (!host) return [];
    let list = host.querySelectorAll(":scope > [data-track-id]");
    if (!list.length) list = host.querySelectorAll("[data-track-id]");
    const out = [];
    for (const el of list) {
      const b = el.getBoundingClientRect();
      out.push({ trackId: el.getAttribute("data-track-id"), top: b.top, bottom: b.bottom, height: b.height, el });
    }
    return out;
  }
  /** 画面 y にあるトラック。外なら一番近い物へ寄せる（掴んだまま外へ出た時用） */
  function trackAtY(cy) {
    const rs = trackRects();
    if (!rs.length) return null;
    for (const r of rs) if (cy >= r.top && cy <= r.bottom) return r;
    let best = rs[0], bd = Infinity;
    for (const r of rs) { const d = cy < r.top ? r.top - cy : cy - r.bottom; if (d < bd) { bd = d; best = r; } }
    return best;
  }
  function findClip(id) {
    for (const tr of (P().tracks || [])) for (const c of (tr.clips || [])) if (c.id === id) return { clip: c, track: tr };
    return null;
  }

  /** 画面座標 → 何を触ったか。{kind:"ruler"|"clip"|"trackGap"|"empty", clipId, trackId, edge, el} */
  function hitAt(x, y, touch) {
    const rr = els.tlRuler && els.tlRuler.getBoundingClientRect();
    if (rr && rr.width > 0 && y >= rr.top && y <= rr.bottom && x >= rr.left && x <= rr.right) return { kind: "ruler" };

    let h = null;
    const r = tryCall(view, "hitTest", [x, y]);
    if (r && typeof r === "object") {
      h = { kind: r.kind || r.type || (r.clipId || r.id ? "clip" : "empty"), clipId: r.clipId || r.id, trackId: r.trackId, edge: null };
    }
    if (!h || (h.kind === "clip" && !h.clipId)) {
      const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      const cEl = el && el.closest ? el.closest("[data-clip-id]") : null;
      const tEl = el && el.closest ? el.closest("[data-track-id]") : null;
      if (cEl) h = { kind: "clip", clipId: cEl.getAttribute("data-clip-id"), trackId: tEl && tEl.getAttribute("data-track-id"), el: cEl };
      else {
        if (!touch) for (const t of trackRects()) if (Math.abs(y - t.bottom) <= GAP_MOUSE) return { kind: "trackGap", trackId: t.trackId, el: t.el };
        h = { kind: "empty", trackId: tEl && tEl.getAttribute("data-track-id") };
      }
    }
    if (h.kind === "clip") {
      const ce = h.el || clipEl(h.clipId);
      h.el = ce || null;
      if (!h.trackId) { const f = findClip(h.clipId); if (f) h.trackId = f.track.id; }
      if (ce) {
        const b = ce.getBoundingClientRect();
        // 掴み代は幅の 1/3 まで（短いクリップが全部トリムになるのを防ぐ）
        const g = Math.min(touch ? EDGE_TOUCH : EDGE_MOUSE, b.width / 3);
        h.edge = (x - b.left <= g) ? "in" : (b.right - x <= g) ? "out" : null;
      }
    }
    return h;
  }

  /* ══ 3. 仮の絵（view があれば任せ、無ければ本物を動かして見せる） ══ */
  const painted = new Set();
  function clearPainted() {
    for (const el of painted) {
      el.style.transform = ""; el.style.opacity = ""; el.style.width = "";
      el.classList.remove("vqs-tl-ghosting", "vqs-tl-lifted");
    }
    painted.clear();
  }
  function setGhost(g) {
    if (has(view, "setGhost")) { tryCall(view, "setGhost", [g]); return; }
    clearPainted();
    if (!g || !Array.isArray(g.items)) return;
    const pps = pxPerSec();
    for (const it of g.items) {
      const el = clipEl(it.clipId);
      if (!el) continue;
      el.style.transform = "translate3d(" + ((it.start - it.fromStart) * pps) + "px," + finite(it.dy, 0) + "px,0)";
      if (g.mode === "trim") el.style.width = Math.max(2, it.duration * pps) + "px";
      el.style.opacity = g.dup ? "1" : "0.72";
      el.classList.add("vqs-tl-ghosting");
      if (g.lifted) el.classList.add("vqs-tl-lifted");
      painted.add(el);
    }
  }
  /** 吸着線。同じ位置なら描き直さない（1 フレーム 1 回の原則） */
  function setLine(t, hit) {
    if (t === G.lineT || (t !== null && G.lineT !== null && Math.abs(t - G.lineT) < 1e-6)) return;
    G.lineT = t;
    if (has(view, "setSnapLine")) { tryCall(view, "setSnapLine", [t, hit || null]); return; }
    const el = els.tlSnapLine;
    if (!el) return;
    if (t === null) { el.classList.add("hidden"); return; }
    el.style.left = (t * pxPerSec()) + "px";
    el.classList.remove("hidden");
  }
  function setMarquee(rect) {
    if (has(view, "setMarquee")) { tryCall(view, "setMarquee", [rect]); return; }
    const el = els.tlMarquee;
    if (!el) return;
    if (!rect) { el.classList.add("hidden"); el.classList.remove("vqs-tl-marquee--on"); return; }
    el.style.left = rect.x + "px"; el.style.top = rect.y + "px";
    el.style.width = rect.w + "px"; el.style.height = rect.h + "px";
    el.classList.remove("hidden"); el.classList.add("vqs-tl-marquee--on");
  }
  /** 吸着した瞬間だけ軽く震わせる（連打しない） */
  function feedback(hit) {
    if (hit) {
      setLine(hit.t, hit);
      const n = performance.now();
      if (G.touch && n - G.buzzed > 140) { G.buzzed = n; buzz(8); }
    } else setLine(null);
  }

  /* ══ 4. op を投げる（1 操作 = 1 undo） ═══════════════════════ */
  const op = (type, payload) => ({ type, payload });
  function commit(label, list) {
    const ops = (list || []).filter(Boolean);
    if (!ops.length) return null;
    try {
      if (ops.length === 1) return store.dispatch(ops[0].type, ops[0].payload);
      if (has(store, "batch")) return store.batch(label, (d) => { for (const o of ops) d(o.type, o.payload); });
      for (const o of ops) store.dispatch(o.type, o.payload);
      return null;
    } catch (e) {
      warn("tl-interact", label, e);
      tryCall(widgets, "toast", [(e && e.message) || "操作できませんでした", { kind: "error" }]);
      return null;
    }
  }
  const selected = () => ((store.selection && store.selection.clipIds) || []).slice();
  const select = (ids, o) => { if (has(store, "select")) store.select(ids, o || {}); };

  /* ══ 5. フレーム更新（rAF・1 フレーム 1 回） ═════════════════ */
  const looping = () => LOOPING.indexOf(G.mode) >= 0;
  function kick() { G.dirty = true; if (!G.loop) G.loop = requestAnimationFrame(frame); }
  function frame() {
    G.loop = 0;
    const keep = looping();
    if (G.dirty || keep) { G.dirty = false; try { update(); } catch (e) { warn("tl-interact", "update", e); abort(); return; } }
    if (keep) G.loop = requestAnimationFrame(frame);
  }
  /** ドラッグ中に端へ寄ったら自動スクロール（距離に比例・最大 1200px/s） */
  function autoScroll() {
    if (!looping()) return;
    const r = viewRect(), now = performance.now();
    const dt = G.lastT ? Math.min(0.05, (now - G.lastT) / 1000) : 0;
    G.lastT = now;
    let v = 0;
    if (G.x < r.left + AUTOSCROLL_ZONE) v = -(1 - (G.x - r.left) / AUTOSCROLL_ZONE);
    else if (G.x > r.right - AUTOSCROLL_ZONE) v = 1 - (r.right - G.x) / AUTOSCROLL_ZONE;
    if (v && dt) setScrollX(scrollX() + clamp(v, -1, 1) * AUTOSCROLL_MAX * dt);
  }
  function update() {
    autoScroll();
    if (G.mode === "scrub") doScrub();
    else if (G.mode === "move") setGhost(moveGhost());
    else if (G.mode === "trim" || G.mode === "roll") setGhost(trimGhost());
    else if (G.mode === "slip") doSlip();
    else if (G.mode === "marquee") setMarquee(box().rect);
    else if (G.mode === "trackH") { if (G.el) G.el.style.height = trackH() + "px"; }
    else if (G.mode === "pan") doPan();
    else if (G.mode === "pinch") doPinch();
  }

  /* ── 5.1 スクラブ（ルーラーを押す・擦る） ───────────────────── */
  function doScrub() {
    const s = snapTime(Math.max(0, timeAt(G.x)), G.points, { pxPerSec: pxPerSec(), tolerancePx: tol() });
    feedback(s.hit);
    seek(s.hit ? s.t : snapFrame(Math.max(0, timeAt(G.x)), fps()), true);
  }

  /* ── 5.2 移動（横 = 時間・縦 = 別トラック・吸着つき） ────────── */
  function moveGhost() {
    const tr = trackAtY(G.y);
    const same = G.items.every((it) => it.fromTrackId === G.items[0].fromTrackId);
    const to = (tr && same && tr.trackId !== G.items[0].fromTrackId) ? tr.trackId : null;
    const r = resolveMove({
      items: G.items, deltaTime: (G.x - G.startX) / pxPerSec(), toTrackId: to,
      points: G.points, pxPerSec: pxPerSec(), tolerancePx: tol(), fps: fps()
    });
    G.hitPoint = r.hit;
    feedback(r.hit);
    const dyFollow = G.y - G.startY;
    const items = r.items.map((it, i) => {
      const src = G.items[i] || {};
      const dy = (to && tr && typeof src.topAtStart === "number") ? (tr.top - src.topAtStart) : dyFollow;
      return Object.assign({}, it, { dy });
    });
    return { mode: "move", dup: G.dup, lifted: G.lifted, snap: r.hit, trackId: to, clipIds: items.map((i) => i.clipId), items };
  }
  function commitMove() {
    const g = moveGhost();
    setGhost(null); setLine(null);
    const moved = g.items.filter((it) => Math.abs(it.start - it.fromStart) > 1e-6 || it.trackId !== it.fromTrackId);
    if (!moved.length) return;
    const type = G.dup ? "clip.duplicate" : "clip.move";
    commit(G.dup ? "クリップを複製" : "クリップを移動",
      moved.map((it) => op(type, { clipId: it.clipId, trackId: it.trackId, start: it.start })));
  }

  /* ── 5.3 トリム / リップル / ロール ─────────────────────────── */
  function trimGhost() {
    const it = G.items[0];
    if (!it) return null;
    const r = resolveTrim({
      item: it, edge: G.edge, time: timeAt(G.x), other: G.other,
      points: G.points, pxPerSec: pxPerSec(), tolerancePx: tol(), fps: fps()
    });
    G.hitPoint = r.hit;
    feedback(r.hit);
    G.trimTime = r.time;
    return {
      mode: "trim", edge: G.edge, ripple: !!G.ctrl, roll: G.mode === "roll", snap: r.hit, clipIds: [it.clipId],
      items: [{ clipId: it.clipId, fromStart: it.fromStart, start: r.start, duration: r.duration, fromTrackId: it.fromTrackId, trackId: it.fromTrackId, dy: 0 }]
    };
  }
  function commitTrim() {
    const g = trimGhost();
    setGhost(null); setLine(null);
    const it = G.items[0];
    if (!g || !it) return;
    const before = G.edge === "in" ? it.fromStart : it.fromStart + it.duration;
    if (Math.abs(G.trimTime - before) < 1e-6) return;
    if (G.mode === "roll" && G.other) {
      commit("編集点をロール", [op("clip.roll", { clipId: it.clipId, otherClipId: G.other.id, time: G.trimTime })]);
      return;
    }
    commit(G.ctrl ? "詰めてトリム" : "トリム", [op("clip.trim", { clipId: it.clipId, edge: G.edge, time: G.trimTime, ripple: !!G.ctrl })]);
  }

  /* ── 5.4 スリップ（尺を保って中身をずらす） ─────────────────── */
  const slipDelta = () => resolveSlip({ item: G.items[0] || {}, deltaTime: (G.x - G.startX) / pxPerSec() }).delta;
  function doSlip() {
    const it = G.items[0];
    if (!it) return;
    setGhost({
      mode: "slip", delta: slipDelta(), clipIds: [it.clipId],
      items: [{ clipId: it.clipId, fromStart: it.fromStart, start: it.fromStart, duration: it.duration, fromTrackId: it.fromTrackId, trackId: it.fromTrackId, dy: 0 }]
    });
  }
  function commitSlip() {
    setGhost(null);
    const it = G.items[0], d = slipDelta();
    if (!it || Math.abs(d) < 1e-6) return;
    commit("スリップ", [op("clip.slip", { clipId: it.clipId, delta: d })]);
  }

  /* ── 5.5 矩形選択 ───────────────────────────────────────────── */
  function box() {
    const r = root.getBoundingClientRect();
    const x0 = Math.min(G.startX, G.x), x1 = Math.max(G.startX, G.x);
    const y0 = Math.min(G.startY, G.y), y1 = Math.max(G.startY, G.y);
    return { x0, x1, y0, y1, rect: { x: x0 - r.left + root.scrollLeft, y: y0 - r.top + root.scrollTop, w: x1 - x0, h: y1 - y0 } };
  }
  function commitMarquee() {
    const b = box();
    setMarquee(null);
    const ids = trackRects().filter((r) => r.bottom >= b.y0 && r.top <= b.y1).map((r) => r.trackId);
    select(clipsInTimeRange({ project: P(), trackIds: ids, t0: timeAt(b.x0), t1: timeAt(b.x1) }), { additive: G.shift || G.ctrl });
  }

  /* ── 5.6 トラック高さ ───────────────────────────────────────── */
  const trackH = () => clamp(G.height + (G.y - G.startY), TRACK_H[0], TRACK_H[1]);
  function commitTrackH() {
    const h = Math.round(trackH());
    if (G.el) G.el.style.height = "";
    if (!G.trackId || Math.abs(h - G.height) < 1) { repaint(); return; }
    commit("トラックの高さ", [op("track.update", { trackId: G.trackId, patch: { height: h } })]);
  }

  /* ── 5.7 モバイル: 1 本指で払う（再生ヘッドは画面中央に固定） ── */
  function panTo(t, bounced) {
    const dur = projectDuration(P());
    let v = t;
    if (v < 0) { v = 0; bounced(); }
    else if (dur > 0 && v > dur) { v = dur; bounced(); }
    seek(snapFrame(v, fps()), true);
    centerOn(v);
    return v;
  }
  function doPan() {
    const dx = G.x - G.panX;
    G.panX = G.x;
    G.vel = -dx;                                  // px/フレーム（時間が進む向きを正）
    panTo(playhead() - dx / pxPerSec(), () => { G.vel = -G.vel * BOUNCE; });
  }
  function startInertia() {
    stopInertia();
    let v = G.vel;
    const step = () => {
      v *= FRICTION;
      if (Math.abs(v) < 0.2) { G.inertia = 0; return; }
      panTo(playhead() + v / pxPerSec(), () => { v = -v * BOUNCE; });
      G.inertia = requestAnimationFrame(step);
    };
    G.inertia = requestAnimationFrame(step);
  }
  function stopInertia() { if (G.inertia) { cancelAnimationFrame(G.inertia); G.inertia = 0; } }

  /* ── 5.8 モバイル: 2 本指のピンチ（中心は 2 指の中点） ───────── */
  function twoTouch() {
    const a = [];
    for (const p of pointers.values()) if (p.touch) a.push(p);
    return a.length >= 2 ? [a[0], a[1]] : null;
  }
  function doPinch() {
    const two = twoTouch();
    if (!two) return;
    const d = Math.abs(two[0].x - two[1].x) || 1;
    const mid = (two[0].x + two[1].x) / 2;
    const pps = clamp(G.pinch.pps0 * (d / G.pinch.d0), PPS_MIN, PPS_MAX);
    setPps(pps);
    setScrollX(G.pinch.t0 * pps - (mid - viewRect().left));   // 中点の下の時刻を留める
    repaint();
  }

  /* ══ 6. 入力 ════════════════════════════════════════════════ */
  /** 素材の解析にビートが在れば吸着に混ぜる（無ければ混ぜない） */
  function beats() {
    for (const a of (P().assets || [])) {
      const b = a && a.analysis && a.analysis.beats;
      if (b && Array.isArray(b.times) && b.times.length) return b.times;
    }
    return null;
  }
  function beginSnap(excludeIds) {
    G.points = buildSnapPoints({
      project: P(), view: { pxPerSec: pxPerSec(), scrollX: scrollX(), width: viewRect().width },
      excludeClipIds: excludeIds || [], playhead: playhead(), beats: beats()
    });
    G.hitPoint = null; G.lineT = null;
  }
  /** 掴んだクリップ（複数選択ならまとめて）の掴む前の姿を覚える */
  function pickItems(clipId) {
    const sel = selected();
    const ids = (sel.indexOf(clipId) >= 0 && sel.length > 1) ? sel : [clipId];
    const items = [];
    for (const id of ids) {
      const f = findClip(id);
      if (!f) continue;
      const c = f.clip;
      const el = clipEl(id);
      const it = {
        clipId: id, fromTrackId: f.track.id, fromStart: finite(c.start, 0),
        duration: Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP)),
        topAtStart: el ? el.getBoundingClientRect().top : undefined
      };
      // 素材を持つ物だけ「あとどれだけ伸ばせるか」を秒（タイムライン尺）で添える
      if (c.kind === "video" || c.kind === "audio") {
        const a = (P().assets || []).find((x) => x.id === c.assetId);
        const D = a ? finite(a.duration, 0) : 0;
        const sp = Math.abs(finite(c.speed, 1)) || 1;
        if (D > 0) {
          it.maxDur = D / sp;
          it.headroom = Math.max(0, finite(c.in, 0)) / sp;
          it.tailroom = Math.max(0, D - finite(c.out, D)) / sp;
        }
      }
      items.push(it);
    }
    items.sort((a, b) => (a.clipId === clipId ? -1 : b.clipId === clipId ? 1 : a.fromStart - b.fromStart));
    return items;
  }
  /** 掴んだ端に接している隣のクリップ（ロール用） */
  function neighborAt(clipId, edge) {
    const f = findClip(clipId);
    if (!f) return null;
    const t = edge === "in" ? finite(f.clip.start, 0) : clipEnd(f.clip);
    for (const c of (f.track.clips || [])) {
      if (c.id === clipId) continue;
      if (Math.abs((edge === "in" ? clipEnd(c) : finite(c.start, 0)) - t) < 1e-3) return c;
    }
    return null;
  }
  function startTrim(h, roll) {
    G.items = pickItems(h.clipId);
    G.items.length = Math.min(G.items.length, 1);      // トリムは掴んだ 1 本だけ
    G.edge = h.edge;
    G.other = roll ? neighborAt(h.clipId, h.edge) : null;
    G.mode = G.other ? "roll" : "trim";
    beginSnap([h.clipId].concat(G.other ? [G.other.id] : []));
    root.classList.add("vqs-tl-trimming");
    kick();
  }

  function onDown(e) {
    if (e.button > 0) return;                          // 右・中クリックは別口
    const touch = e.pointerType === "touch";
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch });
    stopInertia();
    if (menuHandle) { tryCall(menuHandle, "close"); menuHandle = null; }

    /* 指が 2 本になった → 今の操作を捨ててピンチへ */
    if (touch && pointers.size >= 2) {
      const two = twoTouch();
      if (!two) return;
      abort(true);
      const mid = (two[0].x + two[1].x) / 2;
      G.mode = "pinch"; G.touch = true;
      G.pinch = { d0: Math.abs(two[0].x - two[1].x) || 1, pps0: pxPerSec(), t0: timeAt(mid) };
      kick();
      return;
    }
    if (G.mode !== "idle") return;

    G.pointerId = e.pointerId; G.touch = touch;
    G.alt = !!e.altKey; G.ctrl = !!(e.ctrlKey || e.metaKey); G.shift = !!e.shiftKey;
    G.startX = G.x = G.panX = e.clientX; G.startY = G.y = e.clientY;
    G.moved = false; G.dup = false; G.lifted = false; G.items = []; G.other = null;
    G.el = null; G.trackId = null; G.lastT = 0; G.vel = 0;
    try { root.setPointerCapture(e.pointerId); } catch (err) { /* 無くても良い */ }

    const h = hitAt(e.clientX, e.clientY, touch);
    G.hit = h;

    if (h.kind === "ruler") {
      G.mode = "scrub"; beginSnap([]);
      root.classList.add("vqs-tl-scrubbing");
      if (e.cancelable) e.preventDefault();
      kick(); return;
    }
    if (!touch && h.kind === "trackGap") { startTrackH(h.trackId, e); return; }

    if (h.kind === "clip" && h.clipId) {
      if (VW().tool === "razor") { commit("分割", [op("clip.split", { clipId: h.clipId, t: snapFrame(timeAt(e.clientX), fps()) })]); G.mode = "idle"; return; }
      const isSel = selected().indexOf(h.clipId) >= 0;

      if (touch) {
        /* 指: 選択中のクリップの端だけ即トリム。それ以外は長押しを待つ */
        if (isSel && h.edge) { startTrim(h, false); if (e.cancelable) e.preventDefault(); return; }
        G.mode = "pending";
        G.timer = setTimeout(() => {
          if (G.mode !== "pending") return;
          if (!isSel) select([h.clipId], { trackId: h.trackId });
          G.mode = "move"; G.lifted = true;
          G.items = pickItems(h.clipId);
          beginSnap(G.items.map((i) => i.clipId));
          root.classList.add("vqs-tl-grabbing");
          buzz(14);
          kick();
        }, LONG_PRESS_MS);
        return;
      }
      /* マウス: 端 → トリム（Alt でロール）/ Ctrl → スリップ / 他 → 移動 */
      if (h.edge) { startTrim(h, G.alt); if (e.cancelable) e.preventDefault(); return; }
      if (!isSel) select([h.clipId], { additive: G.shift || G.ctrl, trackId: h.trackId });
      G.items = pickItems(h.clipId);
      G.mode = G.ctrl ? "slipPending" : "movePending";
      return;
    }
    G.mode = touch ? "panPending" : "marqueePending";
  }
  function startTrackH(trackId, e) {
    const r = trackRects().find((x) => x.trackId === trackId);
    G.mode = "trackH"; G.trackId = trackId; G.el = r && r.el; G.height = r ? r.height : 72;
    root.classList.add("vqs-tl-resizing");
    if (e.cancelable) e.preventDefault();
  }
  /** トラック見出し側の境界からも高さを変えられるようにする（見出しの他のボタンは邪魔しない） */
  function onHeadsDown(e) {
    if (e.button > 0 || e.pointerType === "touch" || G.mode !== "idle") return;
    const r = trackRects().find((x) => Math.abs(e.clientY - x.bottom) <= GAP_MOUSE);
    if (!r) return;
    G.pointerId = e.pointerId; G.touch = false;
    G.startX = G.x = e.clientX; G.startY = G.y = e.clientY; G.moved = false;
    try { els.tlHeads.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    startTrackH(r.trackId, e);
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (G.mode === "pinch") { if (e.cancelable) e.preventDefault(); kick(); return; }
    if (e.pointerId !== G.pointerId || G.mode === "idle") return;

    G.x = e.clientX; G.y = e.clientY;
    const far = Math.abs(G.x - G.startX) > TAP_SLOP || Math.abs(G.y - G.startY) > TAP_SLOP;
    if (far) G.moved = true;

    /* 待ちの状態を、動いたら本番へ昇格させる */
    if (far) {
      if (G.mode === "pending") { clearTimeout(G.timer); G.timer = 0; G.mode = "pan"; G.panX = G.startX; }
      else if (G.mode === "panPending") { G.mode = "pan"; G.panX = G.startX; }
      else if (G.mode === "movePending") {
        G.mode = "move"; G.dup = !!e.altKey;
        beginSnap(G.items.map((i) => i.clipId));
        root.classList.add("vqs-tl-grabbing");
      } else if (G.mode === "slipPending") { G.mode = "slip"; root.classList.add("vqs-tl-grabbing"); }
      else if (G.mode === "marqueePending") G.mode = "marquee";
    }
    if (G.mode === "move") G.dup = !!e.altKey;                       // 途中で Alt でも効く
    if (G.mode === "trim" || G.mode === "roll") G.ctrl = !!(e.ctrlKey || e.metaKey);
    if (DRAGGING.indexOf(G.mode) >= 0 || G.mode === "marquee" || G.mode === "trackH") {
      if (e.cancelable && G.touch) e.preventDefault();
      kick();
    }
  }

  function onUp(e) {
    if (G.mode === "pinch") {
      pointers.delete(e.pointerId);
      if (!twoTouch()) { G.mode = "idle"; G.touch = false; repaint(); }
      return;
    }
    if (e.pointerId !== G.pointerId) { pointers.delete(e.pointerId); return; }
    pointers.delete(e.pointerId);
    clearTimeout(G.timer); G.timer = 0;
    const mode = G.mode, moved = G.moved, hit = G.hit;
    try {
      if (mode === "move") commitMove();
      else if (mode === "trim" || mode === "roll") commitTrim();
      else if (mode === "slip") commitSlip();
      else if (mode === "marquee") commitMarquee();
      else if (mode === "trackH") commitTrackH();
      else if (mode === "pan") { if (Math.abs(G.vel) > 1.2) startInertia(); }
      else if (!moved && (mode === "pending" || mode === "movePending" || mode === "slipPending")) {
        /* 動かなかった = 叩いた/押した → 選択（Ctrl/Cmd で付け外し・Shift で追加） */
        if (hit && hit.clipId) {
          const sel = selected(), additive = G.shift || G.ctrl;
          if (additive && sel.indexOf(hit.clipId) >= 0) select(sel.filter((x) => x !== hit.clipId), { additive: false });
          else select([hit.clipId], { additive, trackId: hit.trackId });
        }
      } else if (!moved && (mode === "panPending" || mode === "marqueePending")) {
        select([], { additive: false });                             // 空白を叩く → 選択解除
        if (!G.touch) seek(snapFrame(timeAt(G.x), fps()), false);
      }
    } finally { finish(); }
  }

  /** 触り終わり（絵と class を必ず戻す） */
  function finish() {
    if (G.mode === "trackH" && G.el) G.el.style.height = "";
    G.mode = "idle"; G.pointerId = -1; G.touch = false; G.moved = false;
    G.items = []; G.other = null; G.hit = null; G.points = []; G.hitPoint = null;
    G.dup = false; G.lifted = false; G.lastT = 0; G.el = null;
    clearTimeout(G.timer); G.timer = 0;
    if (G.loop) { cancelAnimationFrame(G.loop); G.loop = 0; }
    setGhost(null); setMarquee(null); setLine(null);
    clearPainted();
    root.classList.remove("vqs-tl-grabbing", "vqs-tl-scrubbing", "vqs-tl-trimming", "vqs-tl-resizing");
  }
  /** 途中で投げ出す（pointercancel / 指が増えた / 画面回転 / タブが隠れた） */
  function abort(keepPointers) {
    if (!keepPointers) pointers.clear();
    stopInertia();
    finish();
    repaint();
  }

  /* ── 6.1 ホイール ───────────────────────────────────────────── */
  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) {                       // カーソル位置を軸に拡縮
      e.preventDefault();
      const t0 = timeAt(e.clientX);
      const pps = setPps(pxPerSec() * Math.exp(-e.deltaY * 0.0022));
      setScrollX(t0 * pps - (e.clientX - viewRect().left));
      repaint();
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();                               // 横スクロール
      setScrollX(scrollX() + (e.deltaX || e.deltaY));
      repaint();
    }
    /* 修飾なしの縦は素の縦スクロールに任せる（preventDefault しない） */
  }

  /* ── 6.2 右クリックのメニュー ───────────────────────────────── */
  function menuItems(hit, t) {
    const ids = selected();
    const one = ids.length === 1 ? ids[0] : (hit && hit.clipId) || null;
    const many = ids.length ? ids : (one ? [one] : []);
    const f = one ? findClip(one) : null;
    const trackId = (hit && hit.trackId) || (f && f.track.id) || ((P().tracks || [])[0] || {}).id;
    const patch = (label, p) => commit(label, many.map((id) => op("clip.update", { clipId: id, patch: p })));
    const items = [];
    if (one) items.push(
      { label: "分割", onSelect: () => commit("分割", [op("clip.split", { clipId: one, t })]) },
      { label: "削除", onSelect: () => commit("削除", [op("clip.remove", { clipIds: many })]) },
      { label: "詰めて削除", onSelect: () => commit("詰めて削除", [op("clip.rippleDelete", { clipIds: many })]) },
      { label: "複製", onSelect: () => commit("複製", many.map((id) => { const g = findClip(id); return g ? op("clip.duplicate", { clipId: id, trackId: g.track.id, start: clipEnd(g.clip) }) : null; })) },
      { label: "コピー", onSelect: () => doCopy(many) },
      { separator: true },
      { label: "速度", items: [0.25, 0.5, 1, 2, 4].map((v) => ({ label: v === 1 ? "標準 (1x)" : v + "x", onSelect: () => commit("速度", many.map((id) => op("clip.setSpeed", { clipId: id, speed: v }))) })) },
      { label: "音量", items: [0, 0.25, 0.5, 1, 1.5, 2].map((v) => ({ label: Math.round(v * 100) + "%", onSelect: () => patch("音量", { volume: v }) })) },
      { label: "音を分離", onSelect: () => commit("音を分離", [op("clip.detachAudio", { clipId: one })]) },
      { label: ids.length > 1 ? "グループ化" : "グループ解除", onSelect: () => commit("グループ", [ids.length > 1 ? op("clip.group", { clipIds: ids }) : op("clip.ungroup", { clipIds: [one] })]) },
      { label: "フリーズ", onSelect: () => commit("フリーズ", [op("clip.freeze", { clipId: one, t })]) },
      { label: "逆再生", onSelect: () => commit("逆再生", [op("clip.reverse", { clipId: one })]) },
      { label: "複合クリップ化", onSelect: () => commit("複合クリップ", [op("compound.make", { clipIds: many })]) },
      { label: "色ラベル", items: LABELS.map((c) => ({ label: c, color: c, onSelect: () => patch("色ラベル", { label: c }) })) },
      { separator: true }
    );
    items.push({ label: "貼り付け", disabled: !clipboard.length, onSelect: () => commit("貼り付け", [op("timeline.paste", { trackId, t, clips: clipboard })]) });
    if (one) items.push({ label: "プロパティ", onSelect: () => activate(one) });
    return items;
  }
  function doCopy(ids) {
    clipboard = ids.map((id) => { const f = findClip(id); try { return f ? JSON.parse(JSON.stringify(f.clip)) : null; } catch (e) { return null; } }).filter(Boolean);
    tryCall(widgets, "toast", [clipboard.length + " 個をコピーしました", { kind: "ok" }]);
  }
  function onContextMenu(e) {
    e.preventDefault();
    if (e.pointerType === "touch") return;              // 指は長押しが担当
    const hit = hitAt(e.clientX, e.clientY, false);
    if (hit.clipId && selected().indexOf(hit.clipId) < 0) select([hit.clipId], { trackId: hit.trackId });
    if (!has(widgets, "menu")) return;
    const a = document.createElement("div");
    a.className = "vqs-tl-anchor";
    a.style.cssText = "position:fixed;width:1px;height:1px;pointer-events:none;left:" + e.clientX + "px;top:" + e.clientY + "px";
    document.body.appendChild(a);
    menuHandle = tryCall(widgets, "menu", [a, menuItems(hit, snapFrame(timeAt(e.clientX), fps()))]) || null;
    setTimeout(() => { try { a.remove(); } catch (err) { /* noop */ } }, 0);
  }

  /* ── 6.3 ダブルクリック → 詳細設定（文字なら文字編集） ───────── */
  function activate(clipId) {
    const f = findClip(clipId);
    if (!f) return;
    select([clipId], { trackId: f.track.id });
    const tab = f.clip.kind === "text" ? "text" : f.clip.kind === "audio" ? "audio" : "transform";
    try { document.dispatchEvent(new CustomEvent("vqs:clip-activate", { detail: { clipId, kind: f.clip.kind, tab } })); }
    catch (e) { warn("tl-interact", "activate", e); }
  }
  function onDblClick(e) {
    const hit = hitAt(e.clientX, e.clientY, false);
    if (hit.clipId) { e.preventDefault(); activate(hit.clipId); }
    else if (hit.kind === "ruler") seek(snapFrame(timeAt(e.clientX), fps()), false);
  }

  /* ── 6.4 素材パネル・デスクトップからのドロップ ─────────────── */
  function dropTarget(e) {
    const tr = trackAtY(e.clientY);
    return { trackId: tr ? tr.trackId : ((P().tracks || [])[0] || {}).id, t: Math.max(0, snapFrame(timeAt(e.clientX), fps())), el: tr && tr.el };
  }
  function onDragOver(e) {
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; } catch (err) { /* noop */ }
    root.classList.add("vqs-tl-dropzone");
    const d = dropTarget(e);
    if (dropEl !== d.el) {
      if (dropEl) dropEl.classList.remove("vqs-tl-droptarget");
      dropEl = d.el || null;
      if (dropEl) dropEl.classList.add("vqs-tl-droptarget");
    }
  }
  function onDragLeave() {
    root.classList.remove("vqs-tl-dropzone");
    if (dropEl) { dropEl.classList.remove("vqs-tl-droptarget"); dropEl = null; }
  }
  function onDrop(e) {
    e.preventDefault();
    onDragLeave();
    const dt = e.dataTransfer, d = dropTarget(e);
    let assetId = "";
    try { assetId = (dt && (dt.getData("application/x-vqs-asset") || dt.getData("text/plain"))) || ""; } catch (err) { assetId = ""; }
    if (/^as_/.test(assetId)) { commit("素材を置く", [op("clip.add", { trackId: d.trackId, start: d.t, assetId })]); return; }
    const files = dt && dt.files && dt.files.length ? Array.from(dt.files) : [];
    if (!files.length) return;
    // 実ファイルの取り込みは ui/import.js の仕事。置き場所と時間だけ添えて渡す
    try { document.dispatchEvent(new CustomEvent("vqs:timeline-drop", { detail: { files, trackId: d.trackId, t: d.t } })); }
    catch (err) { warn("tl-interact", "drop", err); }
  }

  /* ── 6.5 ブラウザに横スクロール・拡大を奪われないための守り ──── */
  function onTouchGuard(e) {
    if (!e.cancelable) return;
    if ((e.touches && e.touches.length >= 2) || DRAGGING.indexOf(G.mode) >= 0) e.preventDefault();
  }

  /* ══ 7. 登録 ════════════════════════════════════════════════ */
  on(root, "pointerdown", onDown);
  on(root, "pointermove", onMove);
  on(root, "pointerup", onUp);
  on(root, "pointercancel", (e) => { pointers.delete(e.pointerId); abort(pointers.size > 0); });
  on(root, "lostpointercapture", (e) => { if (e.pointerId === G.pointerId && G.mode !== "idle" && G.mode !== "pinch") abort(); });
  on(root, "wheel", onWheel, { passive: false });
  on(root, "contextmenu", onContextMenu);
  on(root, "dblclick", onDblClick);
  on(root, "dragover", onDragOver);
  on(root, "dragenter", onDragOver);
  on(root, "dragleave", onDragLeave);
  on(root, "drop", onDrop);
  on(root, "touchstart", onTouchGuard, { passive: false });
  on(root, "touchmove", onTouchGuard, { passive: false });
  on(root, "gesturestart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  on(root, "selectstart", (e) => { if (G.mode !== "idle") e.preventDefault(); });
  on(els.tlHeads, "pointerdown", onHeadsDown);
  on(els.tlHeads, "pointermove", onMove);
  on(els.tlHeads, "pointerup", onUp);
  on(els.tlHeads, "pointercancel", () => abort());
  on(window, "orientationchange", () => abort());
  on(window, "blur", () => abort());
  on(document, "visibilitychange", () => { if (document.hidden) abort(); });

  return {
    /** 触り方を全部外す（listener・rAF・タイマー・仮の絵） */
    dispose() {
      abort();
      if (menuHandle) { tryCall(menuHandle, "close"); menuHandle = null; }
      for (const b of bound) { try { b[0].removeEventListener(b[1], b[2], b[3]); } catch (e) { /* noop */ } }
      bound.length = 0;
      pointers.clear();
      clipboard = [];
    }
  };
}
