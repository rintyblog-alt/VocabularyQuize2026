/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/heads.js — タイムラインの「トラックの頭」

   ★ 何をする所か
     タイムラインの左端に、トラック 1 本ぶきに 1 行を並べる。
     種類アイコン・名前（ダブルクリックで改名）・ミュート / ソロ / ロック /
     表示・音量つまみ（音トラック）・高さ変更の掴み・トラックメニュー、
     そして「＋映像 / ＋音 / ＋文字 / ＋調整レイヤー」の追加口を持つ。
     並べ替え（上下ドラッグ）もここ。

   ★ なぜこの形か
     ・**行の縦位置は view.metrics() が唯一の出所**。timeline/view.js が
       クリップを置いた y と 1px でも違うと、頭と盤面がずれて全部嘘になる。
       だから自分では数えず、metrics().rows（上が先頭・y と h つき）を写す。
       metrics が無い器（view がまだ無い / 古い）でだけ、契約書 §13.5 と
       view.js と同じ寸法で控えの計算をする。
     ・行 1 本 = DOM 1 個。render() は「見た目に関わる値を並べた短い文字列
       （sig）」を作り、前回と同じなら DOM を 1 つも触らない（view.js と同じ作法）。
     ・#tlHeads は view.js が `scrollTop` を書いて盤面と縦を合わせてくる
       **受け身の側**。ただし頭の列でホイールを回す人も居るので、こちらの
       スクロールも盤面へ返す（両方向。同じ値なら scroll は発火しないので
       無限往復にはならない）。
     ・widgets.js は app.js から渡されない（`createTrackHeads({store,els,view})`）。
       静的 import すると widgets.js がまだ無い時にこのファイルごと落ちるので、
       **動的 import で後から拾う**。拾えなければ自前の小さなメニューで代替する
       （メニューが出ないだけで、画面は成立させる）。

   ★ 触るときの注意
     ・ここは store を読んで `dispatch` するだけ。project を直に書かない。
     ・トラックの色は **契約書 §1 の Track に枝が無い**（保存すると
       normalizeProject に捨てられる）。メニューの「色」は
       そのトラックのクリップの色ラベル（clip.label）をまとめて変える意味にした。
       CONTRACT-NOTE: 見た目の意図（行を色で見分ける）は CSS 側で
       `.vqs-tlhead[data-kind]` から出せるので、保存できない物を増やさない。
     ・幅は CSS の仕事。こちらは `data-compact` と `--vqs-tlheads-w` を
       置くだけにしてある（モバイル 44px / デスクトップ 176px）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch, deepClone, rafThrottle } from "../../core/util.js";
import { warn } from "../../core/log.js";

/* ── 寸法（view.js と同じ数値。控えの計算にだけ使う）───────────────── */
const RULER_H = 28, RULER_H_MOBILE = 24;
const ROW_H = 72, ROW_H_MOBILE = 56, ROW_GAP = 3;
const H_MIN = 32, H_MAX = 240;            // 高さ変更の範囲（ops は 28..400 まで許す）
const MOBILE_W = 1024;                     // これ未満は「詰めた」見た目
const HEADS_W = "176px", HEADS_W_COMPACT = "44px";
/** 色ラベルの候補（interact.js と同じ並び。揃えないと見た目が食い違う） */
const LABELS = ["#4f8cff", "#31c48d", "#f0b429", "#f2643d", "#a78bfa", "#94a3b8"];
const HEIGHTS = [["小", 48], ["中", 72], ["大", 112]];

/** 種類 → アイコン名 / 予備の文字 / 日本語の呼び名 */
const KIND = {
  video: { icon: "video", glyph: "▣", label: "映像" },
  audio: { icon: "audio", glyph: "♪", label: "音声" },
  overlay: { icon: "text", glyph: "T", label: "文字" },
  adjust: { icon: "adjust", glyph: "◐", label: "調整" }
};
const ADD_ORDER = [["video", "＋映像"], ["audio", "＋音"], ["overlay", "＋文字"], ["adjust", "＋調整レイヤー"]];

/* ── 小道具 ────────────────────────────────────────────────────────── */
const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("tl-heads", k, e); return undefined; }
}
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) { if (attrs[k] != null) n.setAttribute(k, String(attrs[k])); }
  return n;
}
function px(n) { return Math.round(finite(n, 0) * 10) / 10 + "px"; }

/**
 * アイコン。widgets.icon が在ればそれを、無ければ文字で代替する
 * （真っ白にしない事が最優先。文字も CSS で隠して良い）。
 */
function iconEl(W, name, glyph) {
  const made = tryCall(W, "icon", [name]);
  if (made && made.nodeType === 1) return made;
  const s = el("span", "vqs-tlicon vqs-tlicon--text", { "aria-hidden": "true", "data-icon": name });
  s.textContent = glyph || "";
  return s;
}
/** ツールチップ。widgets.tooltip が在れば預け、無ければ title で済ます */
function tip(W, node, text, key) {
  const full = key ? text + " (" + key + ")" : text;
  node.setAttribute("aria-label", text);
  if (key) node.setAttribute("data-key", key);
  if (has(W, "tooltip")) { tryCall(W, "tooltip", [node, full]); return; }
  node.title = full;
}

/**
 * メニューの控え。widgets.menu が無い時だけ使う小さな一覧。
 * 入れ子（items）は「見出し + 中身」に潰して 1 段で出す。
 * @returns {{close:Function}}
 */
function fallbackMenu(anchor, items) {
  const host = document.getElementById("menuHost") || document.body;
  const box = el("div", "vqs-tlmenu", { role: "menu", "data-test": "tl-fallback-menu" });
  box.style.cssText = "position:fixed;z-index:70;min-width:180px;max-height:70vh;overflow:auto";
  const flat = [];
  for (const it of items || []) {
    if (!it) continue;
    if (Array.isArray(it.items)) { flat.push({ heading: it.label }); for (const s of it.items) flat.push(s); }
    else flat.push(it);
  }
  for (const it of flat) {
    if (!it) continue;
    if (it.separator) { box.appendChild(el("hr", "vqs-tlmenu__sep")); continue; }
    if (it.heading) { const h = el("div", "vqs-tlmenu__head"); h.textContent = it.heading; box.appendChild(h); continue; }
    const b = el("button", "vqs-tlmenu__item", { type: "button", role: "menuitem" });
    b.textContent = (it.checked ? "✓ " : "") + String(it.label == null ? "" : it.label);
    if (it.color) b.style.setProperty("--vqs-tlmenu-dot", String(it.color));
    if (it.disabled) b.disabled = true;
    b.addEventListener("click", () => { close(); if (has(it, "onSelect")) tryCall(it, "onSelect", []); });
    box.appendChild(b);
  }
  host.appendChild(box);
  try {
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, bottom: 8 };
    const w = box.offsetWidth || 180, h = box.offsetHeight || 120;
    const vw = globalThis.innerWidth || 800, vh = globalThis.innerHeight || 600;
    box.style.left = px(clamp(r.left, 6, Math.max(6, vw - w - 6)));
    box.style.top = px(r.bottom + h > vh - 6 ? Math.max(6, r.top - h - 4) : r.bottom + 4);
  } catch (_e) { box.style.left = "8px"; box.style.top = "8px"; }
  let live = true;
  function close() {
    if (!live) return;
    live = false;
    document.removeEventListener("pointerdown", onOut, true);
    document.removeEventListener("keydown", onKey, true);
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  function onOut(e) { if (!box.contains(e.target)) close(); }
  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
  setTimeout(() => {
    if (!live) return;
    document.addEventListener("pointerdown", onOut, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  return { close };
}

/* ══ 本体 ═════════════════════════════════════════════════════════════ */

/**
 * トラックの頭を立ち上げる。
 * @param {{store:Object, els?:Object, view?:Object, widgets?:Object}} deps
 * @returns {{render:Function, dispose:Function}}
 */
export function createTrackHeads(deps) {
  const store = deps && deps.store;
  const src = (deps && deps.els) || {};
  const view = (deps && deps.view) || null;
  const root = src.tlHeads || src.heads || document.getElementById("tlHeads");
  if (!store || !root) {
    warn("tl-heads", "store か #tlHeads が無いので頭を出さない");
    return { render() { }, dispose() { } };
  }

  /** widgets は後から来ても良い（無い間は控えで動く） */
  let W = (deps && deps.widgets) || null;
  if (!W) {
    import("../widgets.js").then((m) => { W = m; if (!dead) rebuild(); }).catch(() => { /* 無ければ控えで進む */ });
  }
  const openMenu = (anchor, items) => (has(W, "menu") ? tryCall(W, "menu", [anchor, items]) : fallbackMenu(anchor, items));
  const say = (msg, kind) => { if (has(W, "toast")) tryCall(W, "toast", [msg, { kind: kind || "info" }]); };

  /* ── 組み立て（#tlHeads の中身はこちらの物） ─────────────────── */
  root.textContent = "";
  root.style.position = root.style.position || "relative";
  root.style.overflowX = "hidden";
  root.style.overflowY = "auto";
  const inner = el("div", "vqs-tlheads__inner");
  inner.style.cssText = "position:relative;width:100%";
  const rowsLayer = el("div", "vqs-tlheads__rows");
  rowsLayer.style.cssText = "position:absolute;left:0;right:0;top:0";
  const gutter = el("div", "vqs-tlheads__gutter", { "data-test": "tl-heads-gutter" });
  gutter.style.cssText = "position:absolute;left:0;right:0;top:0;display:flex;align-items:center";
  const dropLine = el("div", "vqs-tlheads__dropline", { "aria-hidden": "true" });
  dropLine.style.cssText = "position:absolute;left:0;right:0;height:2px;display:none;pointer-events:none;z-index:5";
  const addBar = el("div", "vqs-tlheads__add", { "data-test": "tl-heads-add" });
  addBar.style.cssText = "position:sticky;bottom:0;display:flex;align-items:center;gap:4px;z-index:6";
  rowsLayer.append(gutter, dropLine);
  inner.append(rowsLayer, addBar);
  root.appendChild(inner);

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const recs = new Map();       // trackId → { el, sig, parts }
  let compact = false;
  let dead = false;
  let editing = null;           // 改名中の trackId（その行は描き替えない）
  let drag = null;              // 並べ替え / 高さ変更の途中
  let syncing = false;          // 縦スクロールの往復止め
  let lastGeom = { rows: [], rulerH: RULER_H, contentH: 0 };

  /* ══ 計算 ══════════════════════════════════════════════════════ */
  const project = () => store.project || {};
  const tracks = () => { const t = project().tracks; return Array.isArray(t) ? t : []; };
  const trackById = (id) => tracks().find((t) => t && t.id === id) || null;
  const fpsOf = () => finite((project().settings || {}).fps, 30);

  function isMobile() {
    const w = globalThis.innerWidth || 1024;
    const m = tryCall(view, "metrics");
    if (m && typeof m.mobile === "boolean") return m.mobile;
    return w < MOBILE_W;
  }

  /**
   * 行の縦位置。**view.metrics() を写すのが本筋**。
   * 無い時だけ view.js と同じ規則（配列の後ろ = 上）で数える。
   */
  function geometry() {
    const m = tryCall(view, "metrics");
    if (m && Array.isArray(m.rows) && m.rows.length) {
      const rows = [];
      for (const r of m.rows) {
        const tr = trackById(r.trackId);
        if (!tr) continue;
        rows.push({ track: tr, id: r.trackId, kind: r.kind || tr.kind || "video", index: finite(r.index, 0), y: finite(r.y, 0), h: finite(r.h, ROW_H) });
      }
      if (rows.length) {
        const last = rows[rows.length - 1];
        return { rows, rulerH: finite(m.rulerH, RULER_H), contentH: Math.max(finite(m.contentH, 0), last.y + last.h + 16) };
      }
    }
    const list = tracks();
    const mob = isMobile();
    const base = mob ? ROW_H_MOBILE : ROW_H;
    const rows = [];
    let y = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const tr = list[i];
      if (!tr || !tr.id) continue;
      const raw = finite(tr.height, 0);
      const h = raw > 0 ? clamp(mob ? Math.min(raw, 64) : raw, 28, H_MAX) : base;
      rows.push({ track: tr, id: tr.id, kind: tr.kind || "video", index: i, y, h });
      y += h + ROW_GAP;
    }
    return { rows, rulerH: mob ? RULER_H_MOBILE : RULER_H, contentH: Math.max(y + 16, 40) };
  }

  /* ══ 操作（すべて store 経由） ═════════════════════════════════ */
  function send(type, payload, opts) {
    try { return store.dispatch(type, payload, opts); }
    catch (e) {
      say((e && e.message) || "操作できませんでした", "error");
      warn("tl-heads", type, e);
      return null;
    }
  }
  function patchTrack(trackId, patch, opts) {
    return send("track.update", { trackId, patch }, opts || { label: "トラック" });
  }
  function toggleFlag(tr, key) {
    const next = !tr[key];
    /* ソロは 1 本だけ立てる（Premiere と同じ。複数立てると「何が鳴るか」が読めない） */
    if (key === "solo" && next) {
      store.batch("ソロ", (d) => {
        for (const t of tracks()) {
          if (!t || !t.id) continue;
          const want = t.id === tr.id;
          if (!!t.solo !== want) d("track.update", { trackId: t.id, patch: { solo: want } });
        }
      });
      return;
    }
    patchTrack(tr.id, { [key]: next }, { label: key === "muted" ? "ミュート" : key === "locked" ? "ロック" : key === "hidden" ? "表示" : "ソロ" });
  }
  function selectTrackClips(tr) {
    const ids = (Array.isArray(tr.clips) ? tr.clips : []).map((c) => c && c.id).filter(Boolean);
    try { store.select(ids, { trackId: tr.id }); } catch (e) { warn("tl-heads", "select", e); }
    if (!ids.length) say("このトラックにクリップがありません", "warn");
  }
  function paintLabels(tr, color) {
    const clips = Array.isArray(tr.clips) ? tr.clips : [];
    if (!clips.length) { say("このトラックにクリップがありません", "warn"); return; }
    try {
      store.batch("色ラベル", (d) => {
        for (const c of clips) { if (c && c.id) d("clip.update", { clipId: c.id, patch: { label: color } }); }
      });
    } catch (e) { say((e && e.message) || "色を変えられませんでした", "error"); }
  }
  function addTrack(kind, index) {
    const r = send("track.add", index === undefined ? { kind } : { kind, index }, { label: "トラック追加" });
    if (r) say((KIND[kind] || {}).label + "トラックを追加しました", "ok");
    return r;
  }
  function duplicateTrack(tr) {
    const clips = (Array.isArray(tr.clips) ? tr.clips : []).map((c) => { try { return deepClone(c); } catch (_e) { return null; } }).filter(Boolean);
    let base = 0;
    for (const c of clips) base = Math.min(base === 0 && clips.length ? finite(c.start, 0) : base, finite(c.start, 0));
    if (!clips.length) base = 0;
    try {
      store.batch("トラックを複製", (d) => {
        const made = d("track.add", {
          kind: tr.kind, index: finite(tracksIndexOf(tr), 0) + 1,
          name: (tr.name || "") + " のコピー", height: finite(tr.height, 72),
          muted: !!tr.muted, locked: false, hidden: !!tr.hidden, solo: false,
          volume: finite(tr.volume, 1), pan: finite(tr.pan, 0)
        });
        const trackId = made && (made.trackId || made.id);
        if (!trackId || !clips.length) return;
        /* id は付け直させる（同じ id が 2 つ在ると不変条件が壊れる） */
        const specs = clips.map((c) => { const q = deepClone(c); delete q.id; delete q.linkedId; return q; });
        d("timeline.paste", { clips: specs, trackId, at: base, mode: "overwrite" });
      });
      say("トラックを複製しました", "ok");
    } catch (e) { say((e && e.message) || "複製できませんでした", "error"); }
  }
  function tracksIndexOf(tr) { return tracks().findIndex((t) => t && t.id === tr.id); }
  function removeTrack(tr) {
    const n = (Array.isArray(tr.clips) ? tr.clips : []).length;
    const r = send("track.remove", { trackId: tr.id }, { label: "トラック削除" });
    /* 確認ダイアログではなく取消つきの合図（契約書 §13.5 の作法） */
    if (r) say("「" + (tr.name || "トラック") + "」を削除しました" + (n ? "（クリップ " + n + " 個）" : "") + " — Ctrl+Z で取消", "info");
  }
  function renameTrack(tr, name) {
    const v = String(name == null ? "" : name).trim();
    if (!v || v === tr.name) return;
    patchTrack(tr.id, { name: v }, { label: "名前" });
  }
  function askRename(tr) {
    const rec = recs.get(tr.id);
    if (rec && rec.parts && rec.parts.name && !compact) { beginEdit(tr, rec); return; }
    if (has(W, "openSheet") || has(W, "openModal")) {
      const wrap = el("div", "vqs-tlhead__renamebox");
      const input = el("input", "vqs-tlhead__renameinput", { type: "text", value: tr.name || "", "aria-label": "トラック名" });
      wrap.appendChild(input);
      const open = has(W, "openSheet") ? "openSheet" : "openModal";
      const handle = tryCall(W, open, [{
        title: "トラック名", content: wrap, height: "auto",
        actions: [
          { label: "やめる", onSelect: () => handle && handle.close && handle.close() },
          { label: "決める", primary: true, onSelect: () => { renameTrack(tr, input.value); if (handle && handle.close) handle.close(); } }
        ]
      }]);
      setTimeout(() => { try { input.focus(); input.select(); } catch (_e) { /* noop */ } }, 60);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { renameTrack(tr, input.value); if (handle && handle.close) handle.close(); } });
      return;
    }
    const v = globalThis.prompt ? globalThis.prompt("トラック名", tr.name || "") : null;
    if (v != null) renameTrack(tr, v);
  }
  function askVolume(tr) {
    if (!has(W, "slider") || !(has(W, "openSheet") || has(W, "openModal"))) return;
    const wrap = el("div", "vqs-tlhead__volbox");
    const s = tryCall(W, "slider", [{
      label: "音量", min: 0, max: 2, step: 0.01, value: finite(tr.volume, 1), center: 1, unit: "×",
      onInput: (v) => patchTrack(tr.id, { volume: clamp(finite(v, 1), 0, 4) }, { label: "音量", coalesce: true })
    }]);
    if (s && s.nodeType === 1) wrap.appendChild(s);
    const open = has(W, "openSheet") ? "openSheet" : "openModal";
    tryCall(W, open, [{ title: (tr.name || "トラック") + " の音量", content: wrap, height: "auto" }]);
  }

  /* ══ メニュー ══════════════════════════════════════════════════ */
  function trackMenu(anchor, tr) {
    const idx = tracksIndexOf(tr);
    const kind = tr.kind || "video";
    const items = [];
    items.push({ label: "名前を変更", onSelect: () => askRename(tr) });
    if (kind !== "audio") items.push({ label: tr.hidden ? "表示する" : "隠す", checked: !!tr.hidden, onSelect: () => toggleFlag(tr, "hidden") });
    if (kind !== "adjust") items.push({ label: tr.muted ? "ミュート解除" : "ミュート", checked: !!tr.muted, onSelect: () => toggleFlag(tr, "muted") });
    if (kind === "audio") items.push({ label: tr.solo ? "ソロ解除" : "ソロ", checked: !!tr.solo, onSelect: () => toggleFlag(tr, "solo") });
    items.push({ label: tr.locked ? "ロック解除" : "ロック", checked: !!tr.locked, onSelect: () => toggleFlag(tr, "locked") });
    if (kind === "audio" && has(W, "slider")) items.push({ label: "音量…", onSelect: () => askVolume(tr) });
    items.push({ separator: true });
    items.push({ label: "上に追加", onSelect: () => addTrack(kind, idx + 1) });
    items.push({ label: "下に追加", onSelect: () => addTrack(kind, Math.max(0, idx)) });
    items.push({ label: "複製", onSelect: () => duplicateTrack(tr) });
    items.push({ label: "削除", disabled: !!tr.locked, onSelect: () => removeTrack(tr) });
    items.push({ separator: true });
    items.push({ label: "このトラックを全選択", onSelect: () => selectTrackClips(tr) });
    items.push({ label: "色", items: LABELS.map((c) => ({ label: c, color: c, onSelect: () => paintLabels(tr, c) })) });
    items.push({ label: "高さ", items: HEIGHTS.map(([nm, h]) => ({ label: nm, checked: Math.abs(finite(tr.height, 72) - h) < 2, onSelect: () => patchTrack(tr.id, { height: h }, { label: "高さ" }) })) });
    return openMenu(anchor, items);
  }
  function addMenu(anchor) {
    return openMenu(anchor, ADD_ORDER.map(([kind, label]) => ({ label, onSelect: () => addTrack(kind) })));
  }

  /* ══ 行の組み立て ══════════════════════════════════════════════ */
  function buildRow(row) {
    const tr = row.track;
    const meta = KIND[row.kind] || KIND.video;
    const node = el("div", "vqs-tlhead", {
      "data-track-id": tr.id, "data-kind": row.kind, "data-test": "tl-head", role: "group",
      "aria-label": meta.label + "トラック " + (tr.name || "")
    });
    node.style.cssText = "position:absolute;left:0;right:0;box-sizing:border-box";

    const grip = el("div", "vqs-tlhead__grip", { role: "button", tabindex: "0", "data-test": "tl-head-grip" });
    grip.appendChild(iconEl(W, "grip", "⋮⋮"));
    tip(W, grip, "ドラッグで並べ替え（↑↓ キーでも）");

    const kindBtn = el("button", "vqs-tlhead__kind", { type: "button", "data-test": "tl-head-kind" });
    kindBtn.appendChild(iconEl(W, meta.icon, meta.glyph));
    tip(W, kindBtn, meta.label + "トラック — メニュー");

    const body = el("div", "vqs-tlhead__body");
    const name = el("div", "vqs-tlhead__name", { tabindex: "0", "data-test": "tl-head-name" });
    const ctl = el("div", "vqs-tlhead__ctl");
    const parts = { grip, kindBtn, name, ctl, btn: {}, vol: null, menu: null };

    /* 印のボタン（種類で意味の無い物は出さない） */
    const defs = [];
    if (row.kind !== "audio") defs.push(["hidden", "eye", "眼", "表示 / 非表示"]);
    if (row.kind !== "adjust") defs.push(["muted", "volume", "♪", "ミュート"]);
    if (row.kind === "audio") defs.push(["solo", "solo", "S", "ソロ（このトラックだけ鳴らす）"]);
    defs.push(["locked", "lock", "鍵", "ロック（編集させない）"]);
    for (const [key, icon, glyph, text] of defs) {
      const b = el("button", "vqs-tlhead__btn vqs-tlhead__btn--" + key, { type: "button", "data-act": key, "data-test": "tl-head-" + key });
      b.appendChild(iconEl(W, icon, glyph));
      tip(W, b, text);
      b.addEventListener("click", (e) => { e.stopPropagation(); toggleFlag(trackById(tr.id) || tr, key); });
      parts.btn[key] = b;
      ctl.appendChild(b);
    }
    /* 音量つまみ（音トラックだけ）。
       CONTRACT-NOTE: widgets.slider は「見出し付きの 1 行」を返す部品で、
       72px の行に名前と 3 つのボタンと一緒には収まらない。ここは素の
       range（CSS で化粧できる・44px 規則も CSS で満たせる）にし、
       細かい調整はメニューの「音量…」から widgets.slider で出す。 */
    if (row.kind === "audio") {
      const v = el("input", "vqs-tlhead__vol", {
        type: "range", min: "0", max: "2", step: "0.01", "data-test": "tl-head-volume", "aria-label": "音量"
      });
      v.value = String(clamp(finite(tr.volume, 1), 0, 2));
      v.addEventListener("input", () => {
        patchTrack(tr.id, { volume: clamp(finite(parseFloat(v.value), 1), 0, 4) }, { label: "音量", coalesce: true });
      });
      v.addEventListener("pointerdown", (e) => e.stopPropagation());
      v.addEventListener("dblclick", (e) => { e.stopPropagation(); v.value = "1"; patchTrack(tr.id, { volume: 1 }, { label: "音量" }); });
      parts.vol = v;
      ctl.appendChild(v);
    }

    const menuBtn = el("button", "vqs-tlhead__menu", { type: "button", "data-test": "tl-head-menu" });
    menuBtn.appendChild(iconEl(W, "more", "⋯"));
    tip(W, menuBtn, "トラックメニュー");
    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); trackMenu(menuBtn, trackById(tr.id) || tr); });
    parts.menu = menuBtn;

    const grab = el("div", "vqs-tlhead__resize", { "data-test": "tl-head-resize", role: "separator", "aria-label": "高さを変える", tabindex: "-1" });
    grab.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:" + (isTouch() ? 14 : 8) + "px;cursor:row-resize;touch-action:none";

    if (compact) {
      /* 詰めた見た目（幅 44px）: 種類アイコンだけ。他は全部メニューへ。 */
      node.append(kindBtn, grab);
      kindBtn.addEventListener("click", (e) => { e.stopPropagation(); trackMenu(kindBtn, trackById(tr.id) || tr); });
      /* 状態は点で見せる（CSS が :after で描けるように属性だけ置く） */
    } else {
      body.append(name, ctl);
      node.append(grip, kindBtn, body, menuBtn, grab);
      kindBtn.addEventListener("click", (e) => { e.stopPropagation(); trackMenu(kindBtn, trackById(tr.id) || tr); });
      name.addEventListener("dblclick", (e) => { e.stopPropagation(); beginEdit(trackById(tr.id) || tr, recs.get(tr.id)); });
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); beginEdit(trackById(tr.id) || tr, recs.get(tr.id)); }
      });
      grip.addEventListener("keydown", (e) => {
        const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;   // 上へ = 配列の後ろへ
        if (!dir) return;
        e.preventDefault();
        const i = tracksIndexOf(trackById(tr.id) || tr);
        const n = tracks().length;
        send("track.reorder", { trackId: tr.id, index: clamp(i + dir, 0, n - 1) }, { label: "並べ替え" });
        setTimeout(() => { const r2 = recs.get(tr.id); if (r2 && r2.parts.grip) try { r2.parts.grip.focus(); } catch (_e) { /* noop */ } }, 0);
      });
      grip.addEventListener("pointerdown", (e) => startReorder(e, tr.id));
    }
    node.addEventListener("click", () => { try { store.select([], { trackId: tr.id }); } catch (_e) { /* noop */ } });
    node.addEventListener("contextmenu", (e) => { e.preventDefault(); trackMenu(node, trackById(tr.id) || tr); });
    grab.addEventListener("pointerdown", (e) => startResize(e, tr.id));
    if (compact) node.addEventListener("pointerdown", (e) => startReorder(e, tr.id, true));

    return { el: node, parts, sig: "" };
  }

  /* ── 改名（その場で input に差し替える） ────────────────────── */
  function beginEdit(tr, rec) {
    if (!tr || !rec || !rec.parts.name || editing) return;
    editing = tr.id;
    const holder = rec.parts.name;
    const input = el("input", "vqs-tlhead__nameinput", { type: "text", "aria-label": "トラック名", value: tr.name || "" });
    holder.textContent = "";
    holder.appendChild(input);
    try { input.focus(); input.select(); } catch (_e) { /* noop */ }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      editing = null;
      const v = input.value;
      input.remove();
      if (ok) renameTrack(trackById(tr.id) || tr, v);
      render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  /* ── 高さ変更 ────────────────────────────────────────────────── */
  function startResize(e, trackId) {
    const tr = trackById(trackId);
    if (!tr || tr.locked || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const row = lastGeom.rows.find((r) => r.id === trackId);
    drag = { mode: "resize", trackId, y0: e.clientY, h0: finite(row && row.h, finite(tr.height, 72)), h: 0, pid: e.pointerId, node: e.currentTarget };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    root.classList.add("vqs-tlheads--resizing");
    e.currentTarget.addEventListener("pointermove", onResizeMove);
    e.currentTarget.addEventListener("pointerup", endResize);
    e.currentTarget.addEventListener("pointercancel", endResize);
  }
  const pushHeight = rafThrottle(() => {
    if (!drag || drag.mode !== "resize" || !drag.h) return;
    patchTrack(drag.trackId, { height: drag.h }, { label: "高さ", coalesce: true });
  });
  function onResizeMove(e) {
    if (!drag || drag.mode !== "resize") return;
    e.preventDefault();
    drag.h = Math.round(clamp(drag.h0 + (e.clientY - drag.y0), H_MIN, H_MAX));
    pushHeight();
  }
  function endResize(e) {
    const node = drag && drag.node;
    if (node) {
      node.removeEventListener("pointermove", onResizeMove);
      node.removeEventListener("pointerup", endResize);
      node.removeEventListener("pointercancel", endResize);
      try { node.releasePointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    }
    root.classList.remove("vqs-tlheads--resizing");
    if (drag && drag.mode === "resize" && drag.h) patchTrack(drag.trackId, { height: drag.h }, { label: "高さ" });
    drag = null;
    render();
  }

  /* ── 並べ替え（上下ドラッグ） ───────────────────────────────── */
  function startReorder(e, trackId, needHold) {
    if (e.button > 0 || drag) return;
    const tr = trackById(trackId);
    if (!tr) return;
    const node = e.currentTarget;
    const begin = () => {
      drag = { mode: "order", trackId, y: e.clientY, slot: -1, pid: e.pointerId, node, armed: true };
      const rec = recs.get(trackId);
      if (rec) rec.el.classList.add("vqs-tlhead--lifted");
      root.classList.add("vqs-tlheads--ordering");
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (_e) { /* iOS には無い */ }
    };
    e.stopPropagation();
    if (!needHold) e.preventDefault();
    try { node.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    node.addEventListener("pointermove", onOrderMove);
    node.addEventListener("pointerup", endOrder);
    node.addEventListener("pointercancel", endOrder);
    if (needHold) {
      /* 詰めた見た目では行全体が掴み所。長押し 320ms で並べ替えに入る
         （契約書 §13.5。すぐ入るとタップでメニューが出せない） */
      drag = { mode: "hold", trackId, y: e.clientY, pid: e.pointerId, node, timer: setTimeout(() => { if (drag && drag.mode === "hold") { drag = null; begin(); } }, 320) };
    } else begin();
  }
  function onOrderMove(e) {
    if (!drag) return;
    if (drag.mode === "hold") {
      if (Math.abs(e.clientY - drag.y) > 8) { clearTimeout(drag.timer); const n = drag.node; drag = null; cleanupOrder(n, e); }
      return;
    }
    if (drag.mode !== "order") return;
    e.preventDefault();
    drag.y = e.clientY;
    const rows = lastGeom.rows;
    const from = rows.findIndex((r) => r.id === drag.trackId);
    if (from < 0) return;
    const rect = root.getBoundingClientRect();
    const cy = e.clientY - rect.top + (root.scrollTop || 0) - lastGeom.rulerH;
    let slot = 0;
    for (const r of rows) { if (cy >= r.y + r.h / 2) slot++; }
    slot = clamp(slot, 0, rows.length - 1);
    drag.slot = slot > from ? slot - 1 : slot;
    const target = rows[clamp(drag.slot, 0, rows.length - 1)];
    dropLine.style.display = "block";
    dropLine.style.top = px(lastGeom.rulerH + (drag.slot <= from ? target.y - 1 : target.y + target.h - 1));
  }
  function endOrder(e) {
    const node = drag && drag.node;
    if (drag && drag.mode === "hold") { clearTimeout(drag.timer); const id = drag.trackId; drag = null; cleanupOrder(node, e); const tr = trackById(id); if (tr) trackMenu((recs.get(id) || {}).el || root, tr); return; }
    if (drag && drag.mode === "order") {
      const rows = lastGeom.rows;
      const from = rows.findIndex((r) => r.id === drag.trackId);
      const to = drag.slot;
      const rec = recs.get(drag.trackId);
      if (rec) rec.el.classList.remove("vqs-tlhead--lifted");
      if (to >= 0 && to !== from) {
        /* 画面の並び（上が先頭）→ 配列の添字（後ろが上）へ読み替える */
        const index = clamp(rows.length - 1 - to, 0, rows.length - 1);
        send("track.reorder", { trackId: drag.trackId, index }, { label: "並べ替え" });
      }
    }
    drag = null;
    cleanupOrder(node, e);
    render();
  }
  function cleanupOrder(node, e) {
    dropLine.style.display = "none";
    root.classList.remove("vqs-tlheads--ordering");
    if (!node) return;
    node.removeEventListener("pointermove", onOrderMove);
    node.removeEventListener("pointerup", endOrder);
    node.removeEventListener("pointercancel", endOrder);
    try { if (e) node.releasePointerCapture(e.pointerId); } catch (_e) { /* noop */ }
  }

  /* ══ 描く ══════════════════════════════════════════════════════ */
  function renderAddBar() {
    addBar.textContent = "";
    if (compact) {
      const b = el("button", "vqs-tlhead__addbtn vqs-tlhead__addbtn--menu", { type: "button", "data-test": "tl-head-add" });
      b.appendChild(iconEl(W, "plus", "＋"));
      tip(W, b, "トラックを追加");
      b.addEventListener("click", () => addMenu(b));
      addBar.appendChild(b);
      return;
    }
    for (const [kind, label] of ADD_ORDER) {
      const meta = KIND[kind] || KIND.video;
      const b = el("button", "vqs-tlhead__addbtn", { type: "button", "data-kind": kind, "data-test": "tl-head-add-" + kind });
      b.appendChild(iconEl(W, "plus", "＋"));
      const t = el("span", "vqs-tlhead__addlabel");
      t.textContent = label;
      b.appendChild(t);
      tip(W, b, label + "トラックを足す");
      b.addEventListener("click", () => addTrack(kind));
      addBar.appendChild(b);
    }
  }

  function renderGutter() {
    if (gutter.childNodes.length) return;
    const t = el("span", "vqs-tlheads__gutterlabel");
    t.textContent = "トラック";
    gutter.appendChild(t);
  }

  function render() {
    if (dead) return;
    const mob = isMobile();
    if (mob !== compact) { compact = mob; rebuild(); return; }
    const g = geometry();
    lastGeom = g;
    const rulerH = g.rulerH;
    gutter.style.height = px(rulerH);
    rowsLayer.style.height = px(rulerH + g.contentH);
    inner.style.minHeight = px(rulerH + g.contentH);
    addBar.style.marginTop = px(rulerH + g.contentH);
    root.setAttribute("data-compact", compact ? "1" : "0");
    root.style.setProperty("--vqs-tlheads-w", compact ? HEADS_W_COMPACT : HEADS_W);

    const seen = new Set();
    const selTrack = (store.selection || {}).trackId || null;
    for (const row of g.rows) {
      seen.add(row.id);
      let rec = recs.get(row.id);
      if (!rec) { rec = buildRow(row); recs.set(row.id, rec); rowsLayer.appendChild(rec.el); }
      const tr = row.track;
      const sig = [
        row.kind, row.index, Math.round(row.y), Math.round(row.h), tr.name || "",
        tr.muted ? 1 : 0, tr.solo ? 1 : 0, tr.locked ? 1 : 0, tr.hidden ? 1 : 0,
        Math.round(finite(tr.volume, 1) * 100), selTrack === row.id ? 1 : 0,
        (Array.isArray(tr.clips) ? tr.clips.length : 0)
      ].join("|");
      if (sig === rec.sig) continue;
      rec.sig = sig;
      rec.el.style.top = px(rulerH + row.y);
      rec.el.style.height = px(row.h);
      rec.el.setAttribute("data-index", String(row.index));
      rec.el.classList.toggle("vqs-tlhead--muted", !!tr.muted);
      rec.el.classList.toggle("vqs-tlhead--solo", !!tr.solo);
      rec.el.classList.toggle("vqs-tlhead--locked", !!tr.locked);
      rec.el.classList.toggle("vqs-tlhead--hidden", !!tr.hidden);
      rec.el.classList.toggle("vqs-tlhead--current", selTrack === row.id);
      rec.el.classList.toggle("vqs-tlhead--short", row.h < 44);
      if (rec.parts.name && editing !== row.id) rec.parts.name.textContent = tr.name || "";
      for (const key in rec.parts.btn) {
        const b = rec.parts.btn[key];
        const on = !!tr[key];
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.classList.toggle("is-on", on);
      }
      if (rec.parts.vol && document.activeElement !== rec.parts.vol) {
        const v = String(clamp(finite(tr.volume, 1), 0, 2));
        if (rec.parts.vol.value !== v) rec.parts.vol.value = v;
      }
    }
    /* 消えたトラックの行を外す */
    recs.forEach((rec, id) => {
      if (seen.has(id)) return;
      if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      recs.delete(id);
    });
    if (!g.rows.length) {
      inner.setAttribute("data-empty", "1");
    } else inner.removeAttribute("data-empty");
  }

  function rebuild() {
    recs.forEach((rec) => { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); });
    recs.clear();
    renderGutter();
    renderAddBar();
    render();
  }

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const onStore = (ev) => {
    if (dead) return;
    const kind = ev && ev.kind;
    if (kind === "view") return;           // 横の話はこちらに関係しない
    render();
  };
  const unsubscribe = store.subscribe ? store.subscribe(onStore) : null;

  /* 頭の列でホイールを回した時、盤面の縦も合わせる（view.js は逆向きを担う） */
  const onHeadScroll = () => {
    if (dead || syncing) return;
    const scroller = src.tlScroll || document.getElementById("tlScroll");
    if (!scroller) return;
    const y = root.scrollTop || 0;
    if (Math.abs((scroller.scrollTop || 0) - y) < 1) return;
    syncing = true;
    try { scroller.scrollTop = y; } catch (_e) { /* noop */ }
    syncing = false;
  };
  root.addEventListener("scroll", onHeadScroll, { passive: true });

  const onResize = rafThrottle(() => { if (!dead) render(); });
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("resize", onResize, { passive: true });
  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(onResize);
    try { ro.observe(root); } catch (_e) { ro = null; }
  }

  function dispose() {
    dead = true;
    root.removeEventListener("scroll", onHeadScroll);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (onResize.cancel) onResize.cancel();
    if (pushHeight.cancel) pushHeight.cancel();
    if (ro) { try { ro.disconnect(); } catch (_e) { /* noop */ } }
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    recs.forEach((rec) => { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); });
    recs.clear();
    if (inner.parentNode) inner.parentNode.removeChild(inner);
  }

  /* ── 初回（#app が hidden の間は測れないので次の枠でもう一度） ── */
  compact = isMobile();
  rebuild();
  const firstTimer = setTimeout(() => { if (!dead) render(); }, 240);
  const disposeAll = () => { clearTimeout(firstTimer); dispose(); };

  return { render, dispose: disposeAll };
}
