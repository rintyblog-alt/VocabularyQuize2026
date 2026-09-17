/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/timeline/heads.js — タイムラインの「トラックの頭」

   ★ 何をする所か
     左端にトラック 1 本ごとの行を並べる。種類アイコン・名前（ダブルクリックで改名）・
     ミュート / ソロ / ロック / 表示・音量つまみ（音トラック）・高さ変更の掴み・
     トラックメニュー（上に追加 / 下に追加 / 削除 / 複製 / 全選択 / 色）・並べ替え
     （上下ドラッグ）、そして ＋映像 / ＋音 / ＋文字 / ＋調整レイヤー。

   ★ なぜこの形か
     ・**行の縦位置は view.metrics() が唯一の出所**。view.js がクリップを置いた y と
       1px でも違えば頭と盤面がずれて全部嘘になる。だから自分では数えず
       metrics().rows（上が先頭・y と h つき）を写し、metrics が無い器でだけ
       view.js と同じ寸法で控えの計算をする。
     ・行 1 本 = DOM 1 個。render() は見た目に関わる値を並べた短い文字列（sig）を
       作り、前回と同じなら DOM を 1 つも触らない（view.js と同じ作法）。
     ・#tlHeads は view.js が scrollTop を書いて縦を合わせてくる受け身の側。頭の列で
       ホイールを回す人も居るのでこちらの動きも盤面へ返す（同じ値なら scroll は
       発火しないので往復し続けない）。
     ・widgets.js は app.js から渡されない（createTrackHeads({store,els,view})）。
       静的 import すると widgets.js がまだ無い時にこのファイルごと落ちるので
       **動的 import で後から拾い**、拾えなければ自前の小さなメニューで代替する。

   ★ 触るときの注意
     ・store を読んで dispatch するだけ。project を直に書かない。幅は CSS の仕事で、
       こちらは data-compact と --vqs-tlheads-w を置くだけ（モバイル 44px）。
     ・CONTRACT-NOTE: 契約書 §1 の Track に色の枝が無い（保存すると
       normalizeProject に捨てられる）ので、メニューの「色」は そのトラックの
       クリップの色ラベル（clip.label）をまとめて変える意味にした。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch, deepClone, rafThrottle } from "../../core/util.js";
import { warn } from "../../core/log.js";

/* ── 寸法（view.js と同じ数値。控えの計算にだけ使う）───────────────── */
const RULER_H = 28, RULER_H_MOBILE = 24;
const ROW_H = 72, ROW_H_MOBILE = 56, ROW_GAP = 3;
const H_MIN = 32, H_MAX = 240;             // 高さ変更の範囲（ops は 28..400 まで許す）
const MOBILE_W = 1024;                     // これ未満は「詰めた」見た目
const HEADS_W = "176px", HEADS_W_COMPACT = "44px";   // 幅は CSS へ渡す変数の値
const HOLD_MS = 320;                       // 長押しで並べ替え（契約書 §13.5）
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

/* ── 小道具 ───────────────────────────────────────────────────────── */
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

/** アイコン。widgets.icon が在ればそれを、無ければ文字で代替（真っ白にしない） */
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
  if (has(W, "tooltip")) tryCall(W, "tooltip", [node, full]); else node.title = full;
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
    if (Array.isArray(it.items)) { flat.push({ heading: it.label }); for (const s of it.items) flat.push(s); } else flat.push(it);
  }
  for (const it of flat) {
    if (it.separator) { box.appendChild(el("hr", "vqs-tlmenu__sep")); continue; }
    if (it.heading) { const h = el("div", "vqs-tlmenu__head"); h.textContent = it.heading; box.appendChild(h); continue; }
    const b = el("button", "vqs-tlmenu__item", { type: "button", role: "menuitem" });
    b.textContent = (it.checked ? "✓ " : "") + String(it.label == null ? "" : it.label);
    if (it.color) b.style.setProperty("--vqs-tlmenu-dot", String(it.color));
    b.disabled = !!it.disabled;
    b.addEventListener("click", () => { close(); tryCall(it, "onSelect", []); });
    box.appendChild(b);
  }
  host.appendChild(box);
  try {
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
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

/* ══ 本体 ════════════════════════════════════════════════════════════ */
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
  if (!W) import("../widgets.js").then((m) => { W = m; if (!dead) rebuild(); }).catch(() => { /* 控えで進む */ });
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
  /* ルーラーと同じ高さの帯（ここが 1px 違うと行が全部ずれる） */
  const gutter = el("div", "vqs-tlheads__gutter", { "data-test": "tl-heads-gutter" });
  gutter.style.cssText = "position:absolute;left:0;right:0;top:0;display:flex;align-items:center";
  const dropLine = el("div", "vqs-tlheads__dropline", { "aria-hidden": "true" });
  dropLine.style.cssText = "position:absolute;left:0;right:0;height:2px;display:none;pointer-events:none;z-index:5";
  /* sticky なので行がいくら増えても「＋」が画面から消えない（CapCut と同じ） */
  const addBar = el("div", "vqs-tlheads__add", { "data-test": "tl-heads-add" });
  addBar.style.cssText = "position:sticky;bottom:0;display:flex;align-items:center;gap:4px;z-index:6";
  rowsLayer.append(gutter, dropLine);
  inner.append(rowsLayer, addBar);
  root.appendChild(inner);

  /* ── 状態 ──────────────────────────────────────────────────────── */
  const recs = new Map();       // trackId → { el, sig, parts }
  let compact = false;
  let dead = false;
  let editing = null;           // 改名中の trackId（その行の名前は描き替えない）
  let drag = null;              // 並べ替え / 高さ変更の途中
  let muteClick = 0;            // 並べ替え直後の click を 1 回だけ食う
  let syncing = false;          // 縦スクロールの往復止め
  let lastGeom = { rows: [], rulerH: RULER_H, contentH: 0 };

  const tracks = () => { const t = (store.project || {}).tracks; return Array.isArray(t) ? t : []; };
  const trackById = (id) => tracks().find((t) => t && t.id === id) || null;
  const indexOfTrack = (id) => tracks().findIndex((t) => t && t.id === id);

  function isMobile() {
    const m = tryCall(view, "metrics");
    if (m && typeof m.mobile === "boolean") return m.mobile;
    return (globalThis.innerWidth || 1024) < MOBILE_W;
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
        if (tr) rows.push({ track: tr, id: r.trackId, kind: r.kind || tr.kind || "video", index: finite(r.index, 0), y: finite(r.y, 0), h: finite(r.h, ROW_H) });
      }
      if (rows.length) {
        const last = rows[rows.length - 1];
        return { rows, rulerH: finite(m.rulerH, RULER_H), contentH: Math.max(finite(m.contentH, 0), last.y + last.h + 16) };
      }
    }
    const list = tracks();
    const mob = isMobile();
    const rows = [];
    let y = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const tr = list[i];
      if (!tr || !tr.id) continue;
      const raw = finite(tr.height, 0);
      const h = raw > 0 ? clamp(mob ? Math.min(raw, 64) : raw, 28, H_MAX) : (mob ? ROW_H_MOBILE : ROW_H);
      rows.push({ track: tr, id: tr.id, kind: tr.kind || "video", index: i, y, h });
      y += h + ROW_GAP;
    }
    return { rows, rulerH: mob ? RULER_H_MOBILE : RULER_H, contentH: Math.max(y + 16, 40) };
  }

  /* ══ 操作（すべて store 経由） ════════════════════════════════ */
  function send(type, payload, opts) {
    try { return store.dispatch(type, payload, opts); }
    catch (e) { say((e && e.message) || "操作できませんでした", "error"); warn("tl-heads", type, e); return null; }
  }
  const patchTrack = (trackId, patch, opts) => send("track.update", { trackId, patch }, opts || { label: "トラック" });

  function toggleFlag(tr, key) {
    const next = !tr[key];
    /* ソロは 1 本だけ立てる（複数立てると「何が鳴るか」が読めない） */
    if (key === "solo" && next) {
      try {
        store.batch("ソロ", (d) => {
          for (const t of tracks()) {
            if (!t || !t.id) continue;
            const want = t.id === tr.id;
            if (!!t.solo !== want) d("track.update", { trackId: t.id, patch: { solo: want } });
          }
        });
      } catch (e) { say((e && e.message) || "ソロにできませんでした", "error"); }
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
      store.batch("色ラベル", (d) => { for (const c of clips) { if (c && c.id) d("clip.update", { clipId: c.id, patch: { label: color } }); } });
    } catch (e) { say((e && e.message) || "色を変えられませんでした", "error"); }
  }
  function addTrack(kind, index) {
    const r = send("track.add", index === undefined ? { kind } : { kind, index }, { label: "トラック追加" });
    if (r) say(((KIND[kind] || {}).label || "") + "トラックを追加しました", "ok");
    return r;
  }
  function duplicateTrack(tr) {
    const clips = (Array.isArray(tr.clips) ? tr.clips : []).map((c) => { try { return deepClone(c); } catch (_e) { return null; } }).filter(Boolean);
    let base = Infinity;
    for (const c of clips) base = Math.min(base, finite(c.start, 0));
    if (!Number.isFinite(base)) base = 0;               // 空トラックなら 0 から
    try {
      store.batch("トラックを複製", (d) => {
        const made = d("track.add", {
          kind: tr.kind, index: indexOfTrack(tr.id) + 1,
          name: (tr.name || "トラック") + " のコピー", height: finite(tr.height, 72),
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
  function removeTrack(tr) {
    const n = (Array.isArray(tr.clips) ? tr.clips : []).length;
    /* 確認ダイアログではなく取消つきの合図（契約書 §13.5 の作法） */
    if (send("track.remove", { trackId: tr.id }, { label: "トラック削除" })) say("「" + (tr.name || "トラック") + "」を削除しました" + (n ? "（クリップ " + n + " 個）" : "") + " — Ctrl+Z で取消", "info");
  }
  function renameTrack(tr, name) {
    const v = String(name == null ? "" : name).trim();
    if (!v || v === tr.name) return;
    patchTrack(tr.id, { name: v }, { label: "名前" });
  }
  /** 改名の入口（広い行はその場で、詰めた行はシートか prompt で） */
  function askRename(tr) {
    const rec = recs.get(tr.id);
    if (rec && rec.parts.name && !compact) { beginEdit(tr, rec); return; }
    const open = has(W, "openSheet") ? "openSheet" : has(W, "openModal") ? "openModal" : null;
    if (!open) {
      const v = globalThis.prompt ? globalThis.prompt("トラック名", tr.name || "") : null;
      if (v != null) renameTrack(tr, v);
      return;
    }
    const input = el("input", "vqs-tlhead__renameinput", { type: "text", value: tr.name || "", "aria-label": "トラック名" });
    const wrap = el("div", "vqs-tlhead__renamebox");
    wrap.appendChild(input);
    const done = () => { renameTrack(tr, input.value); if (handle && handle.close) handle.close(); };
    const handle = tryCall(W, open, [{
      title: "トラック名", content: wrap, height: "auto",
      actions: [{ label: "やめる", onSelect: () => handle && handle.close && handle.close() }, { label: "決める", primary: true, onSelect: done }]
    }]);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
    setTimeout(() => { try { input.focus(); input.select(); } catch (_e) { /* noop */ } }, 60);
  }
  /** 細かい音量（widgets.slider が在るときだけ） */
  function askVolume(tr) {
    const open = has(W, "openSheet") ? "openSheet" : has(W, "openModal") ? "openModal" : null;
    if (!open || !has(W, "slider")) return;
    const wrap = el("div", "vqs-tlhead__volbox");
    const s = tryCall(W, "slider", [{ label: "音量", min: 0, max: 2, step: 0.01, value: finite(tr.volume, 1), center: 1, unit: "×",
      onInput: (v) => patchTrack(tr.id, { volume: clamp(finite(v, 1), 0, 4) }, { label: "音量", coalesce: true }) }]);
    if (s && s.nodeType === 1) wrap.appendChild(s);
    tryCall(W, open, [{ title: (tr.name || "トラック") + " の音量", content: wrap, height: "auto" }]);
  }

  /* ══ メニュー ══════════════════════════════════════════════════ */
  function trackMenu(anchor, tr) {
    if (!tr) return null;
    const i = indexOfTrack(tr.id);
    const kind = tr.kind || "video";
    const items = [{ label: "名前を変更", onSelect: () => askRename(tr) }];
    if (kind !== "audio") items.push({ label: tr.hidden ? "表示する" : "隠す", checked: !!tr.hidden, onSelect: () => toggleFlag(tr, "hidden") });
    if (kind !== "adjust") items.push({ label: tr.muted ? "ミュート解除" : "ミュート", checked: !!tr.muted, onSelect: () => toggleFlag(tr, "muted") });
    if (kind === "audio") items.push({ label: tr.solo ? "ソロ解除" : "ソロ", checked: !!tr.solo, onSelect: () => toggleFlag(tr, "solo") });
    items.push({ label: tr.locked ? "ロック解除" : "ロック", checked: !!tr.locked, onSelect: () => toggleFlag(tr, "locked") });
    if (kind === "audio" && has(W, "slider")) items.push({ label: "音量…", onSelect: () => askVolume(tr) });
    items.push(
      { separator: true },
      { label: "上に追加", onSelect: () => addTrack(kind, i + 1) },
      { label: "下に追加", onSelect: () => addTrack(kind, Math.max(0, i)) },
      { label: "複製", onSelect: () => duplicateTrack(tr) },
      { label: "削除", disabled: !!tr.locked, onSelect: () => removeTrack(tr) },
      { separator: true },
      { label: "このトラックを全選択", onSelect: () => selectTrackClips(tr) },
      { label: "色", items: LABELS.map((c) => ({ label: c, color: c, onSelect: () => paintLabels(tr, c) })) },
      { label: "高さ", items: HEIGHTS.map((h) => ({ label: h[0], checked: Math.abs(finite(tr.height, 72) - h[1]) < 2, onSelect: () => patchTrack(tr.id, { height: h[1] }, { label: "高さ" }) })) }
    );
    return openMenu(anchor, items);
  }
  const addMenu = (anchor) => openMenu(anchor, ADD_ORDER.map((a) => ({ label: a[1], onSelect: () => addTrack(a[0]) })));

  /* ══ 行の組み立て ══════════════════════════════════════════════ */
  function buildRow(row) {
    const tr = row.track;
    const meta = KIND[row.kind] || KIND.video;
    const node = el("div", "vqs-tlhead", {
      "data-track-id": tr.id, "data-kind": row.kind, "data-test": "tl-head", role: "group",
      "aria-label": meta.label + "トラック " + (tr.name || "")
    });
    node.style.cssText = "position:absolute;left:0;right:0;box-sizing:border-box";
    const kindBtn = el("button", "vqs-tlhead__kind", { type: "button", "data-test": "tl-head-kind" });
    kindBtn.appendChild(iconEl(W, meta.icon, meta.glyph));
    const name = el("div", "vqs-tlhead__name", { tabindex: "0", "data-test": "tl-head-name" });
    const grab = el("div", "vqs-tlhead__resize", { "data-test": "tl-head-resize", role: "separator", "aria-label": "高さを変える" });
    grab.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:" + (isTouch() ? 14 : 8) + "px;cursor:row-resize;touch-action:none";
    const parts = { name, kindBtn, grip: null, btn: {}, vol: null };
    if (compact) {
      /* 詰めた見た目（幅 44px）: 種類アイコンだけ。叩けばメニュー、長押しで並べ替え。 */
      tip(W, kindBtn, meta.label + "トラック — 叩くとメニュー");
      node.append(kindBtn, grab);
      node.addEventListener("pointerdown", (e) => startReorder(e, tr.id, true));
    } else {
      tip(W, kindBtn, meta.label + "トラック — メニュー");
      const grip = el("div", "vqs-tlhead__grip", { role: "button", tabindex: "0", "data-test": "tl-head-grip" });
      grip.appendChild(iconEl(W, "grip", "⋮⋮"));
      tip(W, grip, "ドラッグで並べ替え（↑↓ キーでも）");
      parts.grip = grip;
      const ctl = el("div", "vqs-tlhead__ctl");
      /* 印のボタン（種類で意味の無い物は出さない） */
      const defs = [["locked", "lock", "鍵", "ロック（編集させない）"]];
      if (row.kind === "audio") defs.unshift(["solo", "solo", "S", "ソロ（このトラックだけ鳴らす）"]);
      if (row.kind !== "adjust") defs.unshift(["muted", "volume", "♪", "ミュート"]);
      if (row.kind !== "audio") defs.unshift(["hidden", "eye", "眼", "表示 / 非表示"]);
      for (const d of defs) {
        const b = el("button", "vqs-tlhead__btn vqs-tlhead__btn--" + d[0], { type: "button", "data-act": d[0], "data-test": "tl-head-" + d[0] });
        b.appendChild(iconEl(W, d[1], d[2]));
        tip(W, b, d[3]);
        b.addEventListener("click", (e) => { e.stopPropagation(); toggleFlag(trackById(tr.id) || tr, d[0]); });
        parts.btn[d[0]] = b;
        ctl.appendChild(b);
      }
      /* 音量つまみ（音トラックだけ）。CONTRACT-NOTE: widgets.slider は「見出し付きの
         1 行」を返す部品で、72px の行に名前と 3 つのボタンと一緒には収まらない。
         ここは素の range にし、細かい調整はメニューの「音量…」から slider で出す。 */
      if (row.kind === "audio") {
        const v = el("input", "vqs-tlhead__vol", { type: "range", min: "0", max: "2", step: "0.01", "data-test": "tl-head-volume", "aria-label": "音量" });
        v.value = String(clamp(finite(tr.volume, 1), 0, 2));
        v.addEventListener("input", () => patchTrack(tr.id, { volume: clamp(finite(parseFloat(v.value), 1), 0, 4) }, { label: "音量", coalesce: true }));
        v.addEventListener("pointerdown", (e) => e.stopPropagation());
        v.addEventListener("dblclick", (e) => { e.stopPropagation(); v.value = "1"; patchTrack(tr.id, { volume: 1 }, { label: "音量" }); });
        parts.vol = v;
        ctl.appendChild(v);
      }
      const menuBtn = el("button", "vqs-tlhead__menu", { type: "button", "data-test": "tl-head-menu" });
      menuBtn.appendChild(iconEl(W, "more", "⋯"));
      tip(W, menuBtn, "トラックメニュー");
      menuBtn.addEventListener("click", (e) => { e.stopPropagation(); trackMenu(menuBtn, trackById(tr.id)); });
      const body = el("div", "vqs-tlhead__body");
      body.append(name, ctl);
      node.append(grip, kindBtn, body, menuBtn, grab);   // 掴み → 種類 → 名前と印 → ⋯
      kindBtn.addEventListener("click", (e) => { e.stopPropagation(); trackMenu(kindBtn, trackById(tr.id)); });
      name.addEventListener("dblclick", (e) => { e.stopPropagation(); beginEdit(trackById(tr.id), recs.get(tr.id)); });
      name.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); beginEdit(trackById(tr.id), recs.get(tr.id)); } });
      grip.addEventListener("keydown", (e) => {
        const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;   // 上へ = 配列の後ろへ
        if (!dir) return;
        e.preventDefault();
        const n = tracks().length;
        send("track.reorder", { trackId: tr.id, index: clamp(indexOfTrack(tr.id) + dir, 0, n - 1) }, { label: "並べ替え" });
        setTimeout(() => { const r2 = recs.get(tr.id); if (r2 && r2.parts.grip) { try { r2.parts.grip.focus(); } catch (_e) { /* noop */ } } }, 0);
      });
      grip.addEventListener("pointerdown", (e) => startReorder(e, tr.id, false));
    }
    node.addEventListener("click", () => {
      if (muteClick) { muteClick = 0; return; }
      try { store.select([], { trackId: tr.id }); } catch (_e) { /* noop */ }
    });
    node.addEventListener("contextmenu", (e) => { e.preventDefault(); trackMenu(node, trackById(tr.id)); });
    grab.addEventListener("pointerdown", (e) => startResize(e, tr.id));
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
      if (input.parentNode) input.parentNode.removeChild(input);
      if (ok) renameTrack(trackById(tr.id) || tr, v);
      render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  /* ── 高さ変更（下端の掴み） ─────────────────────────────────── */
  function startResize(e, trackId) {
    const tr = trackById(trackId);
    if (!tr || tr.locked || e.button > 0 || drag) return;
    e.preventDefault();
    e.stopPropagation();
    const row = lastGeom.rows.find((r) => r.id === trackId);
    const node = e.currentTarget;
    drag = { mode: "resize", trackId, y0: e.clientY, h0: finite(row && row.h, finite(tr.height, 72)), h: 0, node };
    try { node.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    root.classList.add("vqs-tlheads--resizing");
    node.addEventListener("pointermove", onResizeMove);
    node.addEventListener("pointerup", endResize);
    node.addEventListener("pointercancel", endResize);
  }
  const pushHeight = rafThrottle(() => {
    if (drag && drag.mode === "resize" && drag.h) patchTrack(drag.trackId, { height: drag.h }, { label: "高さ", coalesce: true });
  });
  function onResizeMove(e) {
    if (!drag || drag.mode !== "resize") return;
    e.preventDefault();
    drag.h = Math.round(clamp(drag.h0 + (e.clientY - drag.y0), H_MIN, H_MAX));
    pushHeight();
  }

  function endResize(e) {
    const d = drag;
    drag = null;
    root.classList.remove("vqs-tlheads--resizing");
    if (d && d.node) {
      d.node.removeEventListener("pointermove", onResizeMove);
      d.node.removeEventListener("pointerup", endResize);
      d.node.removeEventListener("pointercancel", endResize);
      try { d.node.releasePointerCapture(e.pointerId); } catch (_e) { /* noop */ }
      if (d.h) patchTrack(d.trackId, { height: d.h }, { label: "高さ" });
    }
    render();
  }

  /* ── 並べ替え（上下ドラッグ。詰めた行は長押しから） ─────────── */
  function startReorder(e, trackId, needHold) {
    if (e.button > 0 || drag || !trackById(trackId)) return;
    const node = e.currentTarget;
    e.stopPropagation();
    try { node.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
    node.addEventListener("pointermove", onOrderMove);
    node.addEventListener("pointerup", endOrder);
    node.addEventListener("pointercancel", endOrder);
    const begin = () => {
      drag = { mode: "order", trackId, slot: -1, node };
      const rec = recs.get(trackId);
      if (rec) rec.el.classList.add("vqs-tlhead--lifted");
      root.classList.add("vqs-tlheads--ordering");
      /* iOS に navigator.vibrate は無い（契約書 §13.4）。目の合図は CSS の
         .vqs-tlhead--lifted が受け持つので、振動は在れば嬉しい扱い。 */
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (_e) { /* noop */ }
    };
    if (!needHold) { e.preventDefault(); begin(); return; }
    drag = { mode: "hold", trackId, y: e.clientY, node, timer: setTimeout(() => { if (drag && drag.mode === "hold") { drag = null; begin(); } }, HOLD_MS) };
  }
  function onOrderMove(e) {
    if (!drag) return;
    if (drag.mode === "hold") {
      if (Math.abs(e.clientY - drag.y) > 8) { clearTimeout(drag.timer); const n = drag.node; drag = null; cleanupOrder(n, e); }
      return;
    }
    if (drag.mode !== "order") return;
    e.preventDefault();
    const rows = lastGeom.rows;
    const from = rows.findIndex((r) => r.id === drag.trackId);
    if (from < 0) return;
    const cy = e.clientY - root.getBoundingClientRect().top + (root.scrollTop || 0) - lastGeom.rulerH;
    let slot = 0;
    for (const r of rows) { if (cy >= r.y + r.h / 2) slot++; }
    drag.slot = clamp(slot > from ? slot - 1 : slot, 0, rows.length - 1);
    const target = rows[drag.slot];
    dropLine.style.display = "block";
    dropLine.style.top = px(lastGeom.rulerH + (drag.slot <= from ? target.y - 1 : target.y + target.h - 1));
  }
  function endOrder(e) {
    const d = drag;
    drag = null;
    if (d && d.mode === "hold") {
      clearTimeout(d.timer);
      cleanupOrder(d.node, e);
      const tr = trackById(d.trackId);
      const rec = recs.get(d.trackId);
      if (tr) trackMenu((rec && rec.el) || root, tr);
      return;
    }
    if (d && d.mode === "order") {
      const rows = lastGeom.rows;
      const from = rows.findIndex((r) => r.id === d.trackId);
      const rec = recs.get(d.trackId);
      if (rec) rec.el.classList.remove("vqs-tlhead--lifted");
      muteClick = 1;
      if (d.slot >= 0 && d.slot !== from) {
        /* 画面の並び（上が先頭）→ 配列の添字（後ろが上）へ読み替える */
        send("track.reorder", { trackId: d.trackId, index: clamp(rows.length - 1 - d.slot, 0, rows.length - 1) }, { label: "並べ替え" });
      }
    }
    cleanupOrder(d && d.node, e);
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

  /* ══ 描く ═════════════════════════════════════════════════════ */
  function renderChrome() {
    gutter.textContent = "";
    if (!compact) { const t = el("span", "vqs-tlheads__gutterlabel"); t.textContent = "トラック"; gutter.appendChild(t); }
    addBar.textContent = "";
    if (compact) {
      const b = el("button", "vqs-tlhead__addbtn vqs-tlhead__addbtn--menu", { type: "button", "data-test": "tl-head-add" });
      b.appendChild(iconEl(W, "plus", "＋"));
      tip(W, b, "トラックを追加");
      b.addEventListener("click", () => addMenu(b));
      addBar.appendChild(b);
      return;
    }
    for (const a of ADD_ORDER) {
      const b = el("button", "vqs-tlhead__addbtn", { type: "button", "data-kind": a[0], "data-test": "tl-head-add-" + a[0] });
      const t = el("span", "vqs-tlhead__addlabel");
      t.textContent = a[1];
      b.append(iconEl(W, "plus", "＋"), t);
      tip(W, b, a[1] + "トラックを足す");
      b.addEventListener("click", () => addTrack(a[0]));
      addBar.appendChild(b);
    }
  }

  function render() {
    if (dead) return;
    const mob = isMobile();
    if (mob !== compact) { compact = mob; rebuild(); return; }
    const g = geometry();
    lastGeom = g;
    gutter.style.height = px(g.rulerH);
    rowsLayer.style.height = px(g.rulerH + g.contentH);
    inner.style.minHeight = px(g.rulerH + g.contentH);
    addBar.style.marginTop = px(g.rulerH + g.contentH);
    root.setAttribute("data-compact", compact ? "1" : "0");
    root.style.setProperty("--vqs-tlheads-w", compact ? HEADS_W_COMPACT : HEADS_W);

    const seen = new Set();
    const selTrack = (store.selection || {}).trackId || null;
    for (const row of g.rows) {
      seen.add(row.id);
      let rec = recs.get(row.id);
      if (!rec) { rec = buildRow(row); recs.set(row.id, rec); rowsLayer.appendChild(rec.el); }
      const tr = row.track;
      const sig = [row.kind, row.index, Math.round(row.y), Math.round(row.h), tr.name || "",
        tr.muted ? 1 : 0, tr.solo ? 1 : 0, tr.locked ? 1 : 0, tr.hidden ? 1 : 0,
        Math.round(finite(tr.volume, 1) * 100), selTrack === row.id ? 1 : 0].join("|");
      if (sig === rec.sig) continue;
      rec.sig = sig;
      rec.el.style.top = px(g.rulerH + row.y);
      rec.el.style.height = px(row.h);
      rec.el.setAttribute("data-index", String(row.index));
      for (const k of ["muted", "solo", "locked", "hidden"]) rec.el.classList.toggle("vqs-tlhead--" + k, !!tr[k]);
      rec.el.classList.toggle("vqs-tlhead--current", selTrack === row.id);
      rec.el.classList.toggle("vqs-tlhead--short", row.h < 44);
      if (rec.parts.name && editing !== row.id) rec.parts.name.textContent = tr.name || "";
      for (const key in rec.parts.btn) {
        const b = rec.parts.btn[key];
        b.setAttribute("aria-pressed", tr[key] ? "true" : "false");
        b.classList.toggle("is-on", !!tr[key]);
      }
      const vol = rec.parts.vol;
      if (vol && document.activeElement !== vol) { const v = String(clamp(finite(tr.volume, 1), 0, 2)); if (vol.value !== v) vol.value = v; }
    }
    recs.forEach((rec, id) => { if (!seen.has(id)) { rec.el.remove(); recs.delete(id); } });
    if (g.rows.length) inner.removeAttribute("data-empty"); else inner.setAttribute("data-empty", "1");
  }

  function rebuild() {
    recs.forEach((rec) => rec.el.remove());
    recs.clear();
    renderChrome();
    render();
  }

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const onStore = (ev) => { if (!dead && (!ev || ev.kind !== "view")) render(); };
  const unsubscribe = store.subscribe ? store.subscribe(onStore) : null;

  /* 頭の列でホイールを回した時、盤面の縦も合わせる（逆向きは view.js が担う） */
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
  if (typeof ResizeObserver === "function") { ro = new ResizeObserver(onResize); try { ro.observe(root); } catch (_e) { ro = null; } }

  /* ── 初回（#app が hidden の間は測れないので次の枠でもう一度） ── */
  compact = isMobile();
  rebuild();
  const firstTimer = setTimeout(() => { if (!dead) render(); }, 240);
  function dispose() {
    dead = true;
    clearTimeout(firstTimer);
    root.removeEventListener("scroll", onHeadScroll);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (onResize.cancel) onResize.cancel();
    if (pushHeight.cancel) pushHeight.cancel();
    if (ro) { try { ro.disconnect(); } catch (_e) { /* noop */ } }
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    recs.forEach((rec) => rec.el.remove());
    recs.clear();
    inner.remove();
  }

  return { render, dispose };
}
