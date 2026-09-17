/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/minimap.js — タイムライン全体図（#tlMinimap）

   ★ 何をする所か
     編集の全体を高さ 28px の帯 1 本に縮めて描く。クリップは小さな色帯、
     印（マーカー）は上端の点、イン〜アウトは下端の線、再生位置は縦線。
     いま見ている範囲を枠で囲み、帯を叩く / 擦ると表示範囲がそこへ動く。

   ★ なぜこの形か
     ・**canvas 1 枚**。クリップ 1 個に DOM を割ると、全体図のためだけに
       数百の要素が増えて、肝心のタイムラインが遅くなる。
     ・**再生位置は動かさない**。全体図は「どこを見るか」の道具で、
       ここで seek すると（せっかく止めた場所を失って）事故になる。
       動かすのは表示範囲だけ（= view.scrollTo）。
     ・枠の中を掴んだら**相対で動かす**（枠が指の下で跳ねない）。外を叩いた時だけ
       その位置を中心に飛ぶ。DaVinci / CapCut の全体図と同じ手触り。
     ・モバイルでも出す（全体把握に効く）。28px は触り所としては小さいので、
       当たり判定は canvas の外（親要素の余白）まで広げず、代わりに
       「叩いた所へ飛ぶ」を許して 1 回の操作で済むようにしている。

   ★ 触るときの注意
     ・尺の出所は `max(projectDuration, 見えている右端)`。見えている範囲より
       短い尺で割ると枠が帯からはみ出して嘘になる。
     ・色は CSS 変数から読む（tokens.css がまだ無くても fallback で描く）。
     ・touch-action は自分が作った canvas にだけ inline で入れる。指で擦った時に
       ページが動くと全体図は使えないが、共有の器には触らない。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, rafThrottle, cssVar } from "../../core/util.js";
import { projectDuration } from "../../core/schema.js";
import { warn } from "../../core/log.js";

const H = 28;                  // 帯の高さ（契約どおり）
const PAD_Y = 4;               // 上下の余白（枠の線を描く場所）
const MIN_LANE = 2;            // 1 トラックの最小の厚み
const MIN_CLIP_W = 1.5;        // 短いクリップも 1px は見えるように
const DPR_MAX = 2;             // 契約書 §13.5（DPR は最大 2）

/** 種類ごとの色（clip.label が在ればそちらが勝つ） */
const KIND_VAR = {
  video: ["--vqs-clip-video", "#4f8cff"],
  image: ["--vqs-clip-image", "#3aa7ff"],
  audio: ["--vqs-clip-audio", "#31c48d"],
  text: ["--vqs-clip-text", "#a78bfa"],
  shape: ["--vqs-clip-shape", "#94a3b8"],
  adjust: ["--vqs-clip-adjust", "#f0b429"],
  compound: ["--vqs-clip-compound", "#f2643d"]
};

const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("tl-minimap", k, e); return undefined; }
}

/**
 * 全体図を立ち上げる。
 * @param {{store:Object, view?:Object, els?:Object}} deps
 * @returns {{render:Function, dispose:Function}}
 */
export function createMinimap(deps) {
  const store = deps && deps.store;
  const view = (deps && deps.view) || null;
  const root = ((deps && deps.els) || {}).tlMinimap || document.getElementById("tlMinimap");
  if (!store || !root) {
    warn("tl-minimap", "store か #tlMinimap が無いので全体図を出さない");
    return { render() { }, dispose() { } };
  }

  /* ── 器 ───────────────────────────────────────────────────────── */
  root.textContent = "";
  root.style.position = root.style.position || "relative";
  root.style.setProperty("--vqs-tlmini-h", H + "px");
  const canvas = document.createElement("canvas");
  canvas.className = "vqs-tlmini__canvas";
  canvas.setAttribute("data-test", "tl-minimap-canvas");
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-label", "全体図（表示範囲を動かす）");
  canvas.setAttribute("tabindex", "0");
  /* 指で擦った時にページが動くと全体図は使えない（契約書 §13.4）。
     自分が作った要素なので、ここだけ inline で止める。 */
  canvas.style.cssText = "display:block;width:100%;height:" + H + "px;touch-action:none;cursor:pointer";
  root.appendChild(canvas);

  /* ── 状態 ─────────────────────────────────────────────────────── */
  let dead = false;
  let dragMode = null;          // null | "grab"
  let grabOffset = 0;           // 掴んだ時の「枠の左端から指まで」の秒数
  let last = { w: 0, h: H, dpr: 1 };
  /** 直前に描いた寸法（当たり判定と描画で同じ数を使う） */
  let box = { w: 1, span: 1, t0: 0, t1: 1 };

  const P = () => store.project || {};
  const Vw = () => store.view || {};

  /** view から今の px/秒 と 見ている範囲を読む（view が無くても落ちない） */
  function look() {
    const m = tryCall(view, "metrics") || null;
    const zoom = finite(m && m.zoom, finite(view && view.zoom, finite(Vw().zoom, 80)));
    const z = zoom > 0 ? zoom : 80;
    const scrollX = finite(m && m.scrollX, finite(view && view.scrollX, finite(Vw().scrollX, 0)));
    const viewW = finite(m && m.viewW, 0) || (root.clientWidth || 800);
    const t0 = scrollX / z;
    return { z, t0, t1: t0 + viewW / z, viewW };
  }

  /** 表示範囲の左端をその秒に合わせる（再生位置は触らない） */
  function scrollToTime(t) {
    const L = look();
    const x = Math.max(0, t) * L.z;
    if (has(view, "scrollTo")) tryCall(view, "scrollTo", [x]);
    else if (has(view, "setScrollX")) tryCall(view, "setScrollX", [x]);
    else { try { store.setView({ scrollX: x }); } catch (e) { warn("tl-minimap", "scrollX", e); } }
    render();
  }

  /* ══ 描く ══════════════════════════════════════════════════════ */
  function colorOf(clip) {
    const lab = clip && typeof clip.label === "string" && /^#[0-9a-fA-F]{3,8}$/.test(clip.label) ? clip.label : "";
    if (lab) return lab;
    const v = KIND_VAR[(clip && clip.kind) || "video"] || KIND_VAR.video;
    return cssVar(v[0], v[1]);
  }

  function render() {
    if (dead) return;
    const w = Math.max(1, Math.floor(root.clientWidth || canvas.clientWidth || 0));
    if (!w) return;                                  // まだ画面に出ていない
    const h = Math.max(12, Math.round(finite(canvas.clientHeight, H) || H));
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, DPR_MAX);
    if (last.w !== w || last.h !== h || last.dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      last = { w, h, dpr };
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const project = P();
    const L = look();
    /* 尺は「素材の終わり」と「見ている右端」の大きい方（枠がはみ出さないように） */
    const span = Math.max(1, projectDuration(project), L.t1);
    box = { w, span, t0: L.t0, t1: L.t1 };
    const toX = (t) => clamp(finite(t, 0) / span, 0, 1) * w;

    const bg = cssVar("--vqs-tl-mini-bg", "");
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }

    /* ── クリップ（トラックごとの薄い段。下が V1・上が後ろのレイヤー）── */
    const tracks = Array.isArray(project.tracks) ? project.tracks : [];
    const avail = Math.max(MIN_LANE, h - PAD_Y * 2);
    const n = Math.max(1, tracks.length);
    const step = avail / n;
    const laneH = Math.max(MIN_LANE, step - (step > 3 ? 1 : 0));
    ctx.globalAlpha = 1;
    for (let i = tracks.length - 1; i >= 0; i--) {
      const tr = tracks[i];
      if (!tr) continue;
      /* 画面と同じ並び（配列の後ろ = 上）で段を割り当てる */
      const slot = tracks.length - 1 - i;
      const y = PAD_Y + slot * step;
      const dim = tr.hidden || tr.muted ? 0.4 : 1;
      for (const c of (Array.isArray(tr.clips) ? tr.clips : [])) {
        if (!c) continue;
        const x0 = toX(c.start);
        const x1 = toX(finite(c.start, 0) + Math.max(0, finite(c.duration, 0)));
        ctx.globalAlpha = dim;
        ctx.fillStyle = colorOf(c);
        ctx.fillRect(x0, y, Math.max(MIN_CLIP_W, x1 - x0), laneH);
      }
    }
    ctx.globalAlpha = 1;

    /* ── 印（上端）と 章（下端）── */
    for (const m of (Array.isArray(project.markers) ? project.markers : [])) {
      if (!m) continue;
      ctx.fillStyle = typeof m.color === "string" && m.color ? m.color : cssVar("--vqs-tl-marker", "#ffd666");
      ctx.fillRect(Math.round(toX(m.t)) - 1, 0, 2, 3);
    }
    for (const c of (Array.isArray(project.chapters) ? project.chapters : [])) {
      if (!c) continue;
      ctx.fillStyle = cssVar("--vqs-tl-chapter", "rgba(255,214,102,.9)");
      ctx.fillRect(Math.round(toX(c.t)) - 1, h - 3, 2, 3);
    }

    /* ── イン〜アウト（下端の線）── */
    const ip = finite(Vw().inPoint, -1), op = finite(Vw().outPoint, -1);
    if (ip >= 0 && op > ip) {
      ctx.fillStyle = cssVar("--vqs-tl-range", "rgba(79,140,255,.55)");
      ctx.fillRect(toX(ip), h - 2, Math.max(1, toX(op) - toX(ip)), 2);
    }

    /* ── 見ていない所を薄く伏せる → 枠 ── */
    const fx0 = toX(L.t0), fx1 = toX(L.t1);
    ctx.fillStyle = cssVar("--vqs-tl-mini-veil", "rgba(8,10,14,.46)");
    if (fx0 > 0) ctx.fillRect(0, 0, fx0, h);
    if (fx1 < w) ctx.fillRect(fx1, 0, w - fx1, h);
    const accent = cssVar("--vqs-accent", "#4f8cff");
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    /* 枠が細くなり過ぎると掴めないので、見た目だけ 6px 確保する */
    const fw = Math.max(6, fx1 - fx0);
    const fl = clamp(fx0, 0, Math.max(0, w - fw));
    ctx.strokeRect(fl + 0.5, 0.5, Math.max(1, fw - 1), h - 1);
    ctx.fillStyle = cssVar("--vqs-tl-mini-frame", "rgba(79,140,255,.14)");
    ctx.fillRect(fl, 0, fw, h);

    /* ── 再生位置（一番上に描く）── */
    const px = Math.round(toX(finite(Vw().playhead, 0))) + 0.5;
    ctx.strokeStyle = cssVar("--vqs-tl-playhead", "#ff4d4f");
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();

    canvas.setAttribute("aria-valuemin", "0");
    canvas.setAttribute("aria-valuemax", String(Math.round(span)));
    canvas.setAttribute("aria-valuenow", String(Math.round(L.t0)));
    canvas.setAttribute("aria-valuetext", Math.round(L.t0) + " 秒から " + Math.round(L.t1) + " 秒を表示中");
  }
  const renderSoon = rafThrottle(render);

  /* ══ 触る ══════════════════════════════════════════════════════ */
  function timeAt(clientX) {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    return clamp((finite(clientX, 0) - r.left) / w, 0, 1) * box.span;
  }
  function onDown(e) {
    if (e.button > 0) return;
    e.preventDefault();
    const t = timeAt(e.clientX);
    const width = Math.max(0.05, box.t1 - box.t0);
    if (t >= box.t0 && t <= box.t1) grabOffset = t - box.t0;   // 枠の中 → 相対で動かす
    else { grabOffset = width / 2; scrollToTime(t - grabOffset); }
    dragMode = "grab";
    canvas.classList.add("is-dragging");
    try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
  }
  function onMove(e) {
    if (dragMode !== "grab") return;
    e.preventDefault();
    scrollToTime(timeAt(e.clientX) - grabOffset);
  }
  function onUp(e) {
    dragMode = null;
    canvas.classList.remove("is-dragging");
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_e) { /* noop */ }
  }
  /** 鍵盤でも動かせるように（全体図は「見る所」を選ぶ道具なので ←→ で 1 画面） */
  function onKey(e) {
    const width = Math.max(0.05, box.t1 - box.t0);
    let d = 0;
    if (e.key === "ArrowLeft") d = -width / 4;
    else if (e.key === "ArrowRight") d = width / 4;
    else if (e.key === "PageUp") d = -width;
    else if (e.key === "PageDown") d = width;
    else if (e.key === "Home") { e.preventDefault(); scrollToTime(0); return; }
    else return;
    e.preventDefault();
    scrollToTime(box.t0 + d);
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("keydown", onKey);
  /* WebKit の 2 本指ジェスチャは preventDefault しないとページが拡縮する（§13.4） */
  const stopGesture = (e) => { try { e.preventDefault(); } catch (_e) { /* noop */ } };
  canvas.addEventListener("gesturestart", stopGesture);
  canvas.addEventListener("gesturechange", stopGesture);

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const onStore = () => { if (!dead) renderSoon(); };
  const unsubscribe = store.subscribe ? store.subscribe(onStore) : null;
  const onResize = rafThrottle(() => { if (!dead) render(); });
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("resize", onResize, { passive: true });
  let ro = null;
  if (typeof ResizeObserver === "function") { ro = new ResizeObserver(onResize); try { ro.observe(root); } catch (_e) { ro = null; } }

  /* 初回は #app が hidden で幅 0 のことが在るので、次の枠でもう一度測る */
  render();
  const firstTimer = setTimeout(() => { if (!dead) render(); }, 240);

  function dispose() {
    dead = true;
    clearTimeout(firstTimer);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("keydown", onKey);
    canvas.removeEventListener("gesturestart", stopGesture);
    canvas.removeEventListener("gesturechange", stopGesture);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (renderSoon.cancel) renderSoon.cancel();
    if (onResize.cancel) onResize.cancel();
    if (ro) { try { ro.disconnect(); } catch (_e) { /* noop */ } }
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    canvas.remove();
  }

  return { render, dispose };
}
