/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/toolbar.js — タイムラインの道具列（#tlToolbar）

   ★ 何をする所か
     左: ツール切替（選択 / リップル / かみそり / 手のひら）・吸着（磁石）・磁着。
     中: 分割・削除・詰めて削除・複製・コピー・貼り付け・音を分離・フリーズ・
         逆再生・速度・音量・マーカー追加（選択が要る物は無効表示）。
     右: ズーム（− ＋ 全体表示）・タイムコード・トラック高さ・波形 / サムネの
         表示切替・実測 fps。

   ★ なぜこの形か
     ・ボタンは **1 度だけ組み立て**、render() は disabled / aria-pressed / 文字だけを
       書き換える（毎回 innerHTML を作り直すと押した瞬間に押せなくなる）。
     ・**押せるかどうかは 1 か所で決める**（needOf）。「選択が無いのに押せた」
       「押したら throw した」を防ぐため、判定は store の中身だけを見る。
     ・ズーム・スクロールは view（timeline/view.js）に持たせる。持っていない器なら
       store.setView({zoom}) に落とす。両方無くても画面は出す。
     ・実測 fps の rAF は **再生中だけ**回す。表示のために電池を使い続けない。
     ・モバイルは横 1 列。並びは CSS の flex order（inline の order）で決め、
       よく使う 8 個（rank 1..8）を前に出す。DOM の並びは変えない
       （= 読み上げの順と見た目の順を別に保てる）。

   ★ 触るときの注意
     ・短絡キーの実際の割り当ては ui/shortcuts.js の仕事。ここは tooltip に
       書くだけ（食い違ったら shortcuts.js が正しい）。
       CONTRACT-NOTE: かみそりの鍵は担当票が C、契約書 §7.4 が T なので
       tooltip には「C / T」と両方出す。
     ・波形 / サムネの表示は Project にも view にも枝が無い（契約書 §1・§3）。
       CONTRACT-NOTE: #timelinePane の data-waveform / data-thumbs 属性 +
       localStorage で持ち、CSS 側で隠してもらう（保存形式を汚さない）。
     ・貼り付け用の控えはこのモジュールが持つ。他（interact.js / shortcuts.js）と
       分け合うため `vqs:clipboard` の CustomEvent を送受信する。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, rafThrottle, throttle } from "../../core/util.js";
import { toTC, fromTC, snapFrame } from "../../core/time.js";
import { projectDuration, findClip, clipEnd, MIN_CLIP } from "../../core/schema.js";
import { warn } from "../../core/log.js";
import { ZOOM_MIN, ZOOM_MAX } from "./view.js";

const MOBILE_W = 1024;
const ZOOM_STEP = 1.6;                 // − ＋ 1 回ぶん
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];
const VOLUMES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];
const HEIGHTS = [["小", 48], ["中", 72], ["大", 112]];
const TC_KEYS = { waveform: "vqstudio.tl.waveform", thumbs: "vqstudio.tl.thumbs" };

/** ツール（id, アイコン名, 予備の字, 名前, 鍵） */
const TOOLS = [
  ["select", "cursor", "選", "選択", "V"],
  ["ripple", "ripple", "詰", "リップル", "A"],
  ["razor", "razor", "切", "かみそり", "C / T"],
  ["hand", "hand", "手", "手のひら", "H"]
];

/**
 * 中列の操作。need = 押せる条件
 *   "sel" 選択が 1 つ以上 / "src" 素材を持つ選択（映像か音）/ "video" 映像の選択
 *   "split" 割れる物が在る / "paste" 控えが在る / "" いつでも
 */
const ACTS = [
  { id: "split", icon: "split", glyph: "割", label: "分割", key: "S", need: "split", rank: 1 },
  { id: "delete", icon: "trash", glyph: "×", label: "削除", key: "Delete", need: "sel", rank: 2 },
  { id: "ripple", icon: "ripple-delete", glyph: "詰", label: "詰めて削除", key: "Shift+Delete", need: "sel", rank: 3 },
  { id: "duplicate", icon: "duplicate", glyph: "複", label: "複製", key: "Ctrl+D", need: "sel", rank: 4 },
  { id: "speed", icon: "speed", glyph: "速", label: "速度", need: "src", rank: 5 },
  { id: "volume", icon: "volume", glyph: "音", label: "音量", need: "sel", rank: 6 },
  { id: "marker", icon: "marker", glyph: "印", label: "マーカー追加", key: "M", need: "", rank: 7 },
  { id: "copy", icon: "copy", glyph: "写", label: "コピー", key: "Ctrl+C", need: "sel", rank: 9 },
  { id: "paste", icon: "paste", glyph: "貼", label: "貼り付け", key: "Ctrl+V", need: "paste", rank: 10 },
  { id: "detach", icon: "detach-audio", glyph: "分", label: "音を分離", need: "video", rank: 11 },
  { id: "freeze", icon: "freeze", glyph: "静", label: "フリーズ", need: "src", rank: 12 },
  { id: "reverse", icon: "reverse", glyph: "逆", label: "逆再生", need: "src", rank: 13 }
];

/* ── 小道具（heads.js と同じ作り。共有ファイルは担当外なので持たない）── */
const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("tl-toolbar", k, e); return undefined; }
}
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) { if (attrs[k] != null) n.setAttribute(k, String(attrs[k])); }
  return n;
}
function iconEl(W, name, glyph) {
  const made = tryCall(W, "icon", [name]);
  if (made && made.nodeType === 1) return made;
  const s = el("span", "vqs-tlicon vqs-tlicon--text", { "aria-hidden": "true", "data-icon": name });
  s.textContent = glyph || "";
  return s;
}
function tip(W, node, text, key) {
  const full = key ? text + " (" + key + ")" : text;
  node.setAttribute("aria-label", text);
  if (key) node.setAttribute("data-key", key);
  if (has(W, "tooltip")) tryCall(W, "tooltip", [node, full]); else node.title = full;
}
/** widgets.menu が無い時の控え（1 段に潰して出す） */
function fallbackMenu(anchor, items) {
  const host = document.getElementById("menuHost") || document.body;
  const box = el("div", "vqs-tlmenu", { role: "menu", "data-test": "tl-fallback-menu" });
  box.style.cssText = "position:fixed;z-index:70;min-width:170px;max-height:70vh;overflow:auto";
  const flat = [];
  for (const it of items || []) {
    if (!it) continue;
    if (Array.isArray(it.items)) { flat.push({ heading: it.label }); for (const s of it.items) flat.push(s); } else flat.push(it);
  }
  for (const it of flat) {
    if (it.separator) { box.appendChild(el("hr", "vqs-tlmenu__sep")); continue; }
    if (it.heading) { const h = el("div", "vqs-tlmenu__head"); h.textContent = it.heading; box.appendChild(h); continue; }
    const b = el("button", "vqs-tlmenu__item", { type: "button", role: "menuitem" });
    b.textContent = (it.checked ? "✓ " : "") + String(it.label == null ? "" : it.label);
    b.disabled = !!it.disabled;
    b.addEventListener("click", () => { close(); tryCall(it, "onSelect", []); });
    box.appendChild(b);
  }
  host.appendChild(box);
  try {
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
    const w = box.offsetWidth || 170, h = box.offsetHeight || 120;
    const vw = globalThis.innerWidth || 800, vh = globalThis.innerHeight || 600;
    box.style.left = clamp(r.left, 6, Math.max(6, vw - w - 6)) + "px";
    box.style.top = (r.bottom + h > vh - 6 ? Math.max(6, r.top - h - 4) : r.bottom + 4) + "px";
  } catch (_e) { box.style.left = "8px"; box.style.top = "8px"; }
  let live = true;
  function close() {
    if (!live) return;
    live = false;
    document.removeEventListener("pointerdown", onOut, true);
    document.removeEventListener("keydown", onKey, true);
    box.remove();
  }
  function onOut(e) { if (!box.contains(e.target)) close(); }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
  setTimeout(() => { if (live) { document.addEventListener("pointerdown", onOut, true); document.addEventListener("keydown", onKey, true); } }, 0);
  return { close };
}
/** localStorage は private mode で投げる器も在る。読めなければ既定値。 */
function lsGet(key, dflt) {
  try { const v = globalThis.localStorage.getItem(key); return v == null ? dflt : v; } catch (_e) { return dflt; }
}
function lsSet(key, v) { try { globalThis.localStorage.setItem(key, String(v)); } catch (_e) { /* 保存できなくて良い */ } }

/* ══ 本体 ════════════════════════════════════════════════════════════ */
/**
 * @param {{store:Object, view?:Object, transport?:Object, widgets?:Object, els?:Object}} deps
 * @returns {{render:Function, dispose:Function}}
 */
export function createTimelineToolbar(deps) {
  const store = deps && deps.store;
  const view = (deps && deps.view) || null;
  const transport = (deps && deps.transport) || null;
  const root = ((deps && deps.els) || {}).tlToolbar || document.getElementById("tlToolbar");
  if (!store || !root) {
    warn("tl-toolbar", "store か #tlToolbar が無いので道具列を出さない");
    return { render() { }, dispose() { } };
  }
  let W = (deps && deps.widgets) || null;
  if (!W) import("../widgets.js").then((m) => { W = m; if (!dead) build(); }).catch(() => { /* 控えで進む */ });
  const openMenu = (a, items) => (has(W, "menu") ? tryCall(W, "menu", [a, items]) : fallbackMenu(a, items));
  const say = (msg, kind) => { if (has(W, "toast")) tryCall(W, "toast", [msg, { kind: kind || "info" }]); };

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const nodes = {};             // id → 要素
  let clipboard = [];
  let dead = false, compact = false, fpsRaf = 0, fpsShown = 0, editingTC = false;
  let disp = { waveform: lsGet(TC_KEYS.waveform, "on") !== "off", thumbs: lsGet(TC_KEYS.thumbs, "on") !== "off" };

  const P = () => store.project || {};
  const V = () => store.view || {};
  const fps = () => finite((P().settings || {}).fps, 30);
  const playhead = () => finite(V().playhead, 0);
  const selIds = () => { const s = store.selection || {}; return Array.isArray(s.clipIds) ? s.clipIds.slice() : []; };
  const found = (ids) => ids.map((id) => findClip(P(), id)).filter(Boolean);
  const hasSrc = (c) => c && (c.kind === "video" || c.kind === "audio");

  /** 今の時刻で割れるクリップ（選択が在ればその中から、無ければ全トラック） */
  function splittable() {
    const t = snapFrame(playhead(), fps());
    const ids = selIds();
    const pool = ids.length ? found(ids) : [];
    if (!ids.length) {
      for (const tr of (Array.isArray(P().tracks) ? P().tracks : [])) {
        if (!tr || tr.locked) continue;
        for (const c of (Array.isArray(tr.clips) ? tr.clips : [])) pool.push({ clip: c, track: tr });
      }
    }
    return pool.filter((f) => f && f.clip && !f.clip.locked && !f.track.locked
      && f.clip.start < t - MIN_CLIP && clipEnd(f.clip) > t + MIN_CLIP).map((f) => f.clip.id);
  }

  /** 押せるか（1 か所で決める） */
  function needOf(need) {
    const ids = selIds();
    if (need === "sel") return ids.length > 0;
    if (need === "src") return found(ids).some((f) => hasSrc(f.clip));
    if (need === "video") return found(ids).some((f) => f.clip.kind === "video" && !f.clip.linkedId);
    if (need === "paste") return clipboard.length > 0;
    if (need === "split") return splittable().length > 0;
    return true;
  }

  /* ── 実行 ─────────────────────────────────────────────────────── */
  function run(label, fn) {
    try { return store.batch(label, fn); }
    catch (e) { say((e && e.message) || "操作できませんでした", "error"); warn("tl-toolbar", label, e); return null; }
  }
  function patchSel(label, patch) {
    const ids = selIds();
    if (!ids.length) return;
    run(label, (d) => { for (const id of ids) d("clip.update", { clipId: id, patch }); });
  }
  function doSplit() {
    const ids = splittable();
    if (!ids.length) { say("再生位置に割れるクリップがありません", "warn"); return; }
    const t = snapFrame(playhead(), fps());
    run("分割", (d) => { for (const id of ids) d("clip.split", { clipId: id, t }); });
  }
  function doCopy() {
    const list = found(selIds()).map((f) => { try { return JSON.parse(JSON.stringify(f.clip)); } catch (_e) { return null; } }).filter(Boolean);
    if (!list.length) return;
    setClipboard(list, true);
    say(list.length + " 個をコピーしました", "ok");
  }
  function setClipboard(list, spread) {
    clipboard = list;
    if (spread) {
      try { document.dispatchEvent(new CustomEvent("vqs:clipboard", { detail: { clips: list, from: "tl-toolbar" } })); }
      catch (e) { warn("tl-toolbar", "clipboard", e); }
    }
    render();
  }
  function doPaste() {
    if (!clipboard.length) return;
    const trackId = (store.selection || {}).trackId || null;
    const at = snapFrame(playhead(), fps());
    run("貼り付け", (d) => d("timeline.paste", trackId ? { clips: clipboard, at, trackId } : { clips: clipboard, at }));
  }
  function doAct(id) {
    const ids = selIds();
    const t = snapFrame(playhead(), fps());
    if (id === "split") return doSplit();
    if (id === "delete") return run("削除", (d) => d("clip.remove", { clipIds: ids }));
    if (id === "ripple") return run("詰めて削除", (d) => d("clip.rippleDelete", { clipIds: ids }));
    if (id === "duplicate") return run("複製", (d) => d("clip.duplicate", { clipIds: ids }));
    if (id === "copy") return doCopy();
    if (id === "paste") return doPaste();
    if (id === "detach") return run("音を分離", (d) => {
      for (const f of found(ids)) { if (f.clip.kind === "video" && !f.clip.linkedId) d("clip.detachAudio", { clipId: f.clip.id }); }
    });
    if (id === "freeze") {
      const f = found(ids).find((x) => hasSrc(x.clip));
      if (!f) return;
      return run("フリーズ", (d) => d("clip.freeze", { clipId: f.clip.id, t: clamp(t, f.clip.start, clipEnd(f.clip)), duration: 2 }));
    }
    if (id === "reverse") return run("逆再生", (d) => d("clip.reverse", { clipIds: found(ids).filter((x) => hasSrc(x.clip)).map((x) => x.clip.id) }));
    if (id === "marker") {
      const r = run("マーカー", (d) => d("marker.add", { t }));
      if (r) say("印を付けました（" + toTC(t, fps(), { compact: true }) + "）", "ok");
      return r;
    }
    return null;
  }
  function speedMenu(anchor) {
    const ids = found(selIds()).filter((f) => hasSrc(f.clip)).map((f) => f.clip.id);
    if (!ids.length) return;
    const apply = (v) => run("速度", (d) => { for (const id of ids) d("clip.setSpeed", { clipId: id, speed: v }); });
    const items = SPEEDS.map((v) => ({ label: v === 1 ? "標準 (1×)" : v + "×", onSelect: () => apply(v) }));
    if (has(W, "slider") && (has(W, "openSheet") || has(W, "openModal"))) {
      items.push({ separator: true }, { label: "細かく設定…", onSelect: () => sheetSlider("速度", 0.1, 4, 0.05, 1, "×", (v) => apply(v)) });
    }
    return openMenu(anchor, items);
  }
  function volumeMenu(anchor) {
    if (!selIds().length) return;
    const items = VOLUMES.map((v) => ({ label: Math.round(v * 100) + "%", onSelect: () => patchSel("音量", { volume: v }) }));
    if (has(W, "slider") && (has(W, "openSheet") || has(W, "openModal"))) {
      items.push({ separator: true }, { label: "細かく設定…", onSelect: () => sheetSlider("音量", 0, 2, 0.01, 1, "×", (v) => patchSel("音量", { volume: v })) });
    }
    return openMenu(anchor, items);
  }
  /** シート + widgets.slider（無い器では呼ばない） */
  function sheetSlider(title, min, max, step, value, unit, onInput) {
    const open = has(W, "openSheet") ? "openSheet" : "openModal";
    const wrap = el("div", "vqs-tltoolbar__sheet");
    const push = throttle(onInput, 80);
    const s = tryCall(W, "slider", [{ label: title, min, max, step, value, center: value, unit, onInput: (v) => push(finite(v, value)) }]);
    if (s && s.nodeType === 1) wrap.appendChild(s);
    tryCall(W, open, [{ title, content: wrap, height: "auto" }]);
  }

  /* ── ツール・吸着・磁着 ───────────────────────────────────────── */
  function setTool(tool) { try { store.setView({ tool }); } catch (e) { warn("tl-toolbar", "tool", e); } }
  function toggleSetting(key) {
    const s = P().settings || {};
    try { store.dispatch("settings.update", { patch: { [key]: !s[key] } }, { label: key === "snap" ? "吸着" : "磁着" }); }
    catch (e) { say((e && e.message) || "切り替えられません", "error"); }
  }

  /* ── ズームとタイムコード ─────────────────────────────────────── */
  function zoomNow() {
    const z = view && typeof view.zoom === "number" ? view.zoom : finite(V().zoom, 80);
    return clamp(z, ZOOM_MIN, ZOOM_MAX);
  }
  function setZoom(z) {
    const v = clamp(z, ZOOM_MIN, ZOOM_MAX);
    if (has(view, "setZoom")) tryCall(view, "setZoom", [v]);
    else { try { store.setView({ zoom: v }); } catch (e) { warn("tl-toolbar", "zoom", e); } }
    render();
  }
  function fitAll() {
    if (has(view, "fitToWindow")) { tryCall(view, "fitToWindow"); render(); return; }
    const dur = Math.max(1, projectDuration(P()));
    const w = Math.max(160, (root.clientWidth || 800) - 24);
    setZoom(w / (dur * 1.04));
    try { store.setView({ scrollX: 0 }); } catch (_e) { /* noop */ }
  }
  function seekTo(t) {
    const v = snapFrame(Math.max(0, t), fps());
    if (has(transport, "seek")) tryCall(transport, "seek", [v, { scrub: false }]);
    else { try { store.setView({ playhead: v }); } catch (_e) { /* noop */ } }
  }
  /** タイムコードを叩いたら入力に差し替える（Premiere と同じ手触り） */
  function editTC() {
    const box = nodes.tc;
    if (!box || editingTC) return;
    editingTC = true;
    const input = el("input", "vqs-tltoolbar__tcinput", { type: "text", "aria-label": "再生位置", inputmode: "numeric", value: toTC(playhead(), fps()) });
    box.textContent = "";
    box.appendChild(input);
    try { input.focus(); input.select(); } catch (_e) { /* noop */ }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      editingTC = false;
      const v = ok ? fromTC(input.value, fps()) : null;
      input.remove();
      if (v != null) seekTo(v);
      render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }
  function heightMenu(anchor) {
    const list = Array.isArray(P().tracks) ? P().tracks : [];
    const items = HEIGHTS.map((h) => ({
      label: h[0] + "（" + h[1] + "px）",
      onSelect: () => run("トラック高さ", (d) => { for (const tr of list) { if (tr && tr.id) d("track.update", { trackId: tr.id, patch: { height: h[1] } }); } })
    }));
    return openMenu(anchor, items);
  }
  /** 波形 / サムネの表示は保存形式に枝が無いので DOM 属性 + localStorage で持つ */
  function applyDisplay() {
    const pane = document.getElementById("timelinePane") || root.parentNode;
    if (pane && pane.setAttribute) {
      pane.setAttribute("data-waveform", disp.waveform ? "on" : "off");
      pane.setAttribute("data-thumbs", disp.thumbs ? "on" : "off");
    }
    try { document.dispatchEvent(new CustomEvent("vqs:tl-display", { detail: { waveform: disp.waveform, thumbs: disp.thumbs } })); }
    catch (e) { warn("tl-toolbar", "display", e); }
  }
  function toggleDisplay(key) {
    disp[key] = !disp[key];
    lsSet(TC_KEYS[key], disp[key] ? "on" : "off");
    applyDisplay();
    render();
  }

  /* ── 実測 fps（再生中だけ測る） ───────────────────────────────── */
  function fpsLoop() {
    let last = 0, acc = 0, n = 0;
    const tick = (now) => {
      if (dead) return;
      if (last) { acc += now - last; n++; }
      last = now;
      if (n >= 20) {
        const v = Math.round(1000 / Math.max(1, acc / n));
        if (v !== fpsShown) { fpsShown = v; paintFps(); }
        acc = 0; n = 0;
      }
      fpsRaf = requestAnimationFrame(tick);
    };
    fpsRaf = requestAnimationFrame(tick);
  }
  function stopFps() { if (fpsRaf) { try { cancelAnimationFrame(fpsRaf); } catch (_e) { /* noop */ } fpsRaf = 0; } }
  function paintFps() {
    if (!nodes.fps) return;
    nodes.fps.textContent = fpsShown ? fpsShown + " fps" : "— fps";
    nodes.fps.classList.toggle("is-low", !!fpsShown && fpsShown < Math.min(30, fps()) - 4);
    nodes.fps.classList.toggle("is-idle", !fpsRaf);
  }

  /* ══ 組み立て ══════════════════════════════════════════════════ */
  function button(cls, spec) {
    const b = el("button", cls, { type: "button", "data-test": "tl-tb-" + spec.id, "data-act": spec.id });
    b.append(iconEl(W, spec.icon, spec.glyph));
    const lab = el("span", "vqs-tltoolbar__label");
    lab.textContent = spec.label;
    b.appendChild(lab);
    if (spec.rank) b.style.order = String(spec.rank);
    tip(W, b, spec.label, spec.key);
    return b;
  }

  function build() {
    root.textContent = "";
    for (const k in nodes) delete nodes[k];
    compact = (globalThis.innerWidth || 1024) < MOBILE_W;
    root.setAttribute("data-compact", compact ? "1" : "0");
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", "タイムラインの道具");
    /* 見た目は CSS の仕事。まだ誰も決めていない（display:block のまま）時だけ
       「横 1 列」という組み立ての前提を最小限だけ補う。 */
    try {
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
      if (!cs || cs.display === "block" || cs.display === "inline") {
        root.style.display = "flex";
        root.style.alignItems = "center";
      }
      if (compact && (!cs || cs.overflowX === "visible")) { root.style.overflowX = "auto"; root.style.overflowY = "hidden"; }
      if (!compact) { root.style.overflowX = ""; root.style.overflowY = ""; }
    } catch (_e) { /* 読めない器では触らない */ }

    const left = el("div", "vqs-tltoolbar__group vqs-tltoolbar__group--left");
    const mid = el("div", "vqs-tltoolbar__group vqs-tltoolbar__group--mid");
    const right = el("div", "vqs-tltoolbar__group vqs-tltoolbar__group--right");
    /* モバイルは 1 列。入れ物を作らず root に直接並べ、order で前に出す。 */
    const put = (node, box) => (compact ? root : box).appendChild(node);

    /* ① ツール（widgets.segmented が在れば預ける） */
    const segItems = TOOLS.map((t) => ({ value: t[0], label: t[3], icon: t[1], key: t[4] }));
    const seg = compact ? null : tryCall(W, "segmented", [{ items: segItems, value: V().tool || "select", onChange: (v) => setTool(String(v)) }]);
    if (seg && seg.nodeType === 1) {
      seg.classList.add("vqs-tltoolbar__tools");
      seg.setAttribute("data-test", "tl-tb-tools");
      nodes.seg = seg;
      nodes.segHost = left;
      nodes.segValue = V().tool || "select";
      left.appendChild(seg);
    } else {
      const wrap = el("div", "vqs-tltoolbar__tools vqs-tltoolbar__tools--own", { role: "radiogroup", "aria-label": "ツール", "data-test": "tl-tb-tools" });
      for (let i = 0; i < TOOLS.length; i++) {
        const t = TOOLS[i];
        const b = button("vqs-tltoolbar__tool", { id: "tool-" + t[0], icon: t[1], glyph: t[2], label: t[3], key: t[4], rank: 20 + i });
        b.setAttribute("role", "radio");
        b.addEventListener("click", () => setTool(t[0]));
        nodes["tool-" + t[0]] = b;
        (compact ? root : wrap).appendChild(b);
      }
      if (!compact) left.appendChild(wrap);
    }
    /* ② 吸着・磁着（トグルは「押した状態」が見えれば良いので icon ボタン）
       CONTRACT-NOTE: widgets.toggle は見出し付きのスイッチで、道具列の密度に
       合わないため aria-pressed のボタンにした（意味と読み上げは同じ）。 */
    for (const t of [["snap", "magnet", "磁", "吸着（磁石）", 18], ["magnet", "magnetic", "寄", "磁着（隙間を自動で詰める）", 19]]) {
      const b = button("vqs-tltoolbar__toggle", { id: t[0], icon: t[1], glyph: t[2], label: t[3], rank: t[4] });
      b.addEventListener("click", () => toggleSetting(t[0]));
      nodes[t[0]] = b;
      put(b, left);
    }

    /* ③ 中列 */
    for (const a of ACTS) {
      const b = button("vqs-tltoolbar__btn", a);
      b.addEventListener("click", () => {
        if (a.id === "speed") return speedMenu(b);
        if (a.id === "volume") return volumeMenu(b);
        return doAct(a.id);
      });
      nodes[a.id] = b;
      put(b, mid);
    }

    /* ④ 右: ズーム */
    const zOut = button("vqs-tltoolbar__btn vqs-tltoolbar__btn--zoom", { id: "zoomOut", icon: "zoom-out", glyph: "−", label: "縮小", key: "-", rank: 16 });
    zOut.addEventListener("click", () => setZoom(zoomNow() / ZOOM_STEP));
    const zIn = button("vqs-tltoolbar__btn vqs-tltoolbar__btn--zoom", { id: "zoomIn", icon: "zoom-in", glyph: "＋", label: "拡大", key: "+", rank: 15 });
    zIn.addEventListener("click", () => setZoom(zoomNow() * ZOOM_STEP));
    const zFit = button("vqs-tltoolbar__btn", { id: "fit", icon: "fit", glyph: "全", label: "全体表示", key: "Shift+Z", rank: 8 });
    zFit.addEventListener("click", fitAll);
    /* ズームつまみ。対数で割る（px/秒 は 2〜800 と幅が広く、線形だと端が使えない） */
    const zr = el("input", "vqs-tltoolbar__zoom", { type: "range", min: "0", max: "1000", step: "1", "aria-label": "ズーム", "data-test": "tl-tb-zoomrange" });
    zr.style.order = "17";
    zr.addEventListener("input", () => {
      const p = clamp(finite(parseFloat(zr.value), 500) / 1000, 0, 1);
      setZoom(ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, p));
    });
    nodes.zoomRange = zr;
    put(zOut, right); put(zr, right); put(zIn, right); put(zFit, right);

    /* ⑤ 右: タイムコード */
    const tc = el("button", "vqs-tltoolbar__tc", { type: "button", "data-test": "tl-tb-tc" });
    tc.style.order = "14";
    tip(W, tc, "再生位置（叩くと打ち込める）");
    tc.addEventListener("click", () => editTC());
    nodes.tc = tc;
    put(tc, right);

    /* ⑥ 右: トラック高さ・波形 / サムネ・実測 fps */
    const hb = button("vqs-tltoolbar__btn", { id: "height", icon: "track-height", glyph: "高", label: "トラック高さ", rank: 21 });
    hb.addEventListener("click", () => heightMenu(hb));
    nodes.height = hb;
    put(hb, right);
    const wb = button("vqs-tltoolbar__toggle", { id: "waveform", icon: "waveform", glyph: "波", label: "波形", rank: 22 });
    wb.addEventListener("click", () => toggleDisplay("waveform"));
    nodes.waveform = wb;
    put(wb, right);
    const tb = button("vqs-tltoolbar__toggle", { id: "thumbs", icon: "thumbnail", glyph: "画", label: "サムネ", rank: 23 });
    tb.addEventListener("click", () => toggleDisplay("thumbs"));
    nodes.thumbs = tb;
    put(tb, right);
    const fpsEl = el("span", "vqs-tltoolbar__fps", { "data-test": "tl-tb-fps", title: "実測の描画速度" });
    fpsEl.style.order = "24";
    nodes.fps = fpsEl;
    put(fpsEl, right);

    if (!compact) root.append(left, mid, right);
    applyDisplay();
    paintFps();
    render();
  }

  /* ══ 描く（状態だけ） ═════════════════════════════════════════ */
  function render() {
    if (dead || !nodes.fps) return;
    const s = P().settings || {};
    const tool = V().tool || "select";
    for (const t of TOOLS) {
      const b = nodes["tool-" + t[0]];
      if (!b) continue;
      const on = tool === t[0];
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("is-on", on);
    }
    /* segmented の中身は widgets の物なので、値を戻す口が無ければ作り直す
       （短絡キーでツールを変えた時に押した所が変わらないのを防ぐ） */
    if (nodes.seg && nodes.segValue !== tool) {
      if (has(nodes.seg, "setValue")) { tryCall(nodes.seg, "setValue", [tool]); nodes.segValue = tool; }
      else {
        const fresh = tryCall(W, "segmented", [{ items: TOOLS.map((t) => ({ value: t[0], label: t[3], icon: t[1] })), value: tool, onChange: (v) => setTool(String(v)) }]);
        if (fresh && fresh.nodeType === 1 && nodes.segHost) {
          fresh.classList.add("vqs-tltoolbar__tools");
          fresh.setAttribute("data-test", "tl-tb-tools");
          nodes.segHost.replaceChild(fresh, nodes.seg);
          nodes.seg = fresh;
        }
        nodes.segValue = tool;
      }
      if (nodes.seg) nodes.seg.setAttribute("data-value", tool);
    }
    for (const key of ["snap", "magnet"]) {
      const b = nodes[key];
      if (!b) continue;
      b.setAttribute("aria-pressed", s[key] ? "true" : "false");
      b.classList.toggle("is-on", !!s[key]);
    }
    for (const a of ACTS) {
      const b = nodes[a.id];
      if (!b) continue;
      const ok = needOf(a.need);
      b.disabled = !ok;
      b.setAttribute("aria-disabled", ok ? "false" : "true");
      b.classList.toggle("is-disabled", !ok);
    }
    for (const key of ["waveform", "thumbs"]) {
      const b = nodes[key];
      if (!b) continue;
      b.setAttribute("aria-pressed", disp[key] ? "true" : "false");
      b.classList.toggle("is-on", !!disp[key]);
    }
    if (nodes.zoomRange && document.activeElement !== nodes.zoomRange) {
      const p = Math.log(zoomNow() / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
      nodes.zoomRange.value = String(Math.round(clamp(p, 0, 1) * 1000));
    }
    if (nodes.tc && !editingTC) {
      const f = fps();
      nodes.tc.textContent = toTC(playhead(), f) + " / " + toTC(projectDuration(P()), f);
    }
  }
  const renderSoon = rafThrottle(render);

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const onStore = () => { if (!dead) renderSoon(); };
  const unsubscribe = store.subscribe ? store.subscribe(onStore) : null;
  const offTime = has(transport, "on") ? tryCall(transport, "on", ["time", () => renderSoon()]) : null;
  const offState = has(transport, "on") ? tryCall(transport, "on", ["state", () => {
    const playing = transport && transport.playing;
    if (playing && !fpsRaf) fpsLoop();
    else if (!playing && fpsRaf) { stopFps(); paintFps(); }
    renderSoon();
  }]) : null;
  /* 他の部品がコピーした物も貼れるようにする（控えを分け合う） */
  const onClip = (e) => {
    const d = e && e.detail;
    if (!d || d.from === "tl-toolbar" || !Array.isArray(d.clips)) return;
    setClipboard(d.clips.slice(), false);
  };
  document.addEventListener("vqs:clipboard", onClip);
  const onResize = rafThrottle(() => {
    if (dead) return;
    const want = (globalThis.innerWidth || 1024) < MOBILE_W;
    if (want !== compact) build(); else render();
  });
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("resize", onResize, { passive: true });

  build();

  function dispose() {
    dead = true;
    stopFps();
    if (renderSoon.cancel) renderSoon.cancel();
    if (onResize.cancel) onResize.cancel();
    document.removeEventListener("vqs:clipboard", onClip);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    for (const off of [offTime, offState]) { if (typeof off === "function") { try { off(); } catch (_e) { /* noop */ } } }
    root.textContent = "";
  }

  return { render, dispose };
}
