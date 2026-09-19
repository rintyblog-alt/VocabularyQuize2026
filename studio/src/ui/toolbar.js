/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/toolbar.js — 上段（#topbar）の配線

   ★ 何をする所か
     index.html に既に在る上段の器（#btnHome / #projectName / #saveState /
     #btnUndo / #btnRedo / #toolGroup / #btnRatio / #btnQuality / #btnAi /
     #btnExport / #btnAccount）に中身と振る舞いを入れる所。
     足すのは「…」（畳んだ物の置き場）と「オフライン」の札の 2 つだけで、
     **器そのものは作らない**（id は契約書 §7 で固定）。

   ★ なぜこの形か
     ・器は index.html の物なので `textContent = ""` で消さない。消すと
       data-test が消えて通し試験が落ちる。中身だけ入れて、render() は
       disabled / aria-pressed / 文字を書き換える。
     ・名前の打ち込みは **確定してから** ops に流す（1 文字ごとに
       `project.rename` を流すと自動保存が毎打鍵で走り、取消履歴も
       1 文字ずつになる）。600ms 黙ったら、または Enter / 焦点が外れたら確定。
       CONTRACT-NOTE: ui/app.js は attachStore で `#projectName.oninput` に
       1 文字ごとの dispatch を入れている。ここが受け持つので **その口を外す**
       （`oninput = null`）。app.js 側は値の初期化だけが残る。
     ・保存の札（#saveState）は ui/app.js も書く（markSaving）。取り合うと
       「保存できません」が「未保存」に戻って原因が消える。そこで
       **他人が書いた文字は正**として MutationObserver で拾い、こちらは
       project が変わった時だけ書き直す。オフラインの案内は札を奪わず
       隣に別の札を出す。
     ・狭いときは「…」へ畳む。優先度は依頼どおり
       **書き出し > AI > 取消 > その他**（その他 = 道具・比率・画質）。
       畳むかどうかは決め打ちの幅ではなく **実測**（scrollWidth）で決める。
       器の幅は分割線のドラッグでも変わるので、閾値では合わない。
     ・アカウントの中身（登録・ログイン・パスワード変更の画面）は
       ui/auth-screen.js と ui/settings.js の持ち物。ここは
       `onAction("account", 目的)` で渡すだけ。ただし **ログアウト**だけは
       auth を直に触る（確認を出してから）。渡す先が無くても効くように。

   ★ 触るときの注意
     ・短絡キーの割り当ては ui/shortcuts.js が正。ここは tooltip に書くだけ。
     ・比率を変えた後の「収め直す」は transport.js にも同じ物が在る
       （共有の置き場が担当に無い）。直すときは **両方**直す。
     ・onAction は ui/app.js の onTopbarAction。今 受けるのは
       "ai" / "export" / "account" / "settings" / "home" / "import" / "tool"。
       ここから増やしたい物（"save"）は app.js が受けるまで何も起きないので、
       押しても壊れない形にしてある。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, rafThrottle, debounce, formatBytes } from "../core/util.js";
import { RATIOS, assetById } from "../core/schema.js";
import { warn } from "../core/log.js";

const NAME_COMMIT_MS = 600;            // 打ち込みが止まってから確定するまで
const HOLD_MS = 450;                   // 長押しで履歴一覧
const ESTIMATE_MS = 30000;             // 保存容量を測り直す間隔

/** 道具（id, アイコン, 予備の字, 名前, 鍵）。鍵の実体は shortcuts.js */
const TOOLS = [
  ["select", "cursor", "選", "選択", "V"],
  ["ripple", "ripple", "詰", "リップル", "A"],
  ["razor", "razor", "切", "かみそり", "C / T"],
  ["hand", "hand", "手", "手のひら", "H"]
];

/** プレビュー画質（契約書 §1 settings.previewQuality） */
const QUALITIES = [["auto", "自動"], ["full", "フル"], ["half", "1/2"], ["quarter", "1/4"]];

/** 先に畳む順（= 優先度の低い順）。書き出しは畳まない */
const COLLAPSE_ORDER = ["quality", "ratio", "tools", "redo", "undo", "ai"];

/** #saveState の文字 → 状態の名前（CSS が色を決められるように） */
const SAVE_STATES = [
  ["保存済み", "ok"], ["保存中", "saving"], ["未保存", "dirty"],
  ["保存できません", "error"], ["保存に失敗", "error"]
];

/* ── 小道具（共有ファイルは担当外なので各自が持つ）──────────────── */
const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("topbar", k, e); return undefined; }
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
  const s = el("span", "vqs-tbicon vqs-tbicon--text", { "aria-hidden": "true", "data-icon": name });
  s.textContent = glyph || "";
  return s;
}
function tip(W, node, text, key) {
  const full = key ? text + " (" + key + ")" : text;
  node.setAttribute("aria-label", text);
  if (key) node.setAttribute("data-key", key);
  if (has(W, "tooltip")) tryCall(W, "tooltip", [node, full]); else node.title = full;
}
/** widgets.menu がまだ無い器のための控え */
function fallbackMenu(anchor, items) {
  const host = document.getElementById("menuHost") || document.body;
  const box = el("div", "vqs-tbmenu", { role: "menu", "data-test": "tb-fallback-menu" });
  box.style.cssText = "position:fixed;z-index:70;min-width:200px;max-height:70vh;overflow:auto";
  for (const it of items || []) {
    if (!it) continue;
    if (it.separator) { box.appendChild(el("hr", "vqs-tbmenu__sep")); continue; }
    const tag = it.disabled && !has(it, "onSelect") ? "div" : "button";
    const b = el(tag, "vqs-tbmenu__item", tag === "button" ? { type: "button", role: "menuitem" } : null);
    b.textContent = (it.checked ? "✓ " : "") + String(it.label == null ? "" : it.label);
    if (tag === "button") {
      b.disabled = !!it.disabled;
      b.addEventListener("click", () => { close(); tryCall(it, "onSelect", []); });
    }
    box.appendChild(b);
  }
  host.appendChild(box);
  try {
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
    const w = box.offsetWidth || 200, h = box.offsetHeight || 140;
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

/* ── 純粋な計算（試験できる形で外に出す）───────────────────────── */

/**
 * 保存の札の文字 → 状態の名前。知らない文字は "info"。
 * @param {string} text @returns {"ok"|"saving"|"dirty"|"error"|"info"}
 */
export function saveStateOf(text) {
  const s = String(text == null ? "" : text);
  for (const [needle, name] of SAVE_STATES) if (s.indexOf(needle) >= 0) return name;
  return "info";
}

/**
 * 比率を変えたあと「収め直す」ときの倍率（transport.js と同じ式）。
 * 合成器は枠に収めた状態を scale=1 とするので、枠いっぱいにする比を返す。
 * @param {number} fw @param {number} fh @param {number} sw @param {number} sh
 * @returns {number}
 */
export function coverScale(fw, fh, sw, sh) {
  const a = finite(fw, 0), b = finite(fh, 0), c = finite(sw, 0), d = finite(sh, 0);
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) return 1;
  const k = (a * d) / (b * c);
  return Math.max(k, 1 / k);
}

/**
 * 「…」へ畳む個数から、畳まれた物の名前を並べる（試験用に純粋な形で）。
 * @param {number} n @returns {string[]}
 */
export function collapsedIds(n) {
  return COLLAPSE_ORDER.slice(0, clamp(Math.round(finite(n, 0)), 0, COLLAPSE_ORDER.length));
}

/* ══ 本体 ════════════════════════════════════════════════════════════ */
/**
 * @param {{store:Object, els?:Object, widgets?:Object, auth?:Object,
 *          onAction?:Function, app?:Object}} deps
 * @returns {{render:Function, dispose:Function}}
 */
export function createTopbar(deps) {
  const store = deps && deps.store;
  const els = (deps && deps.els) || {};
  const auth = (deps && deps.auth) || null;
  const app = (deps && deps.app) || null;
  const onAction = has(deps, "onAction") ? deps.onAction : () => { };
  const root = els.topbar || document.getElementById("topbar");
  if (!store || !root) {
    warn("topbar", "store か #topbar が無いので上段を配線しない");
    return { render() { }, dispose() { } };
  }
  let W = (deps && deps.widgets) || null;
  if (!W) import("./widgets.js").then((m) => { W = m; if (!dead) build(); }).catch(() => { /* 控えで進む */ });
  const openMenu = (a, items) => (has(W, "menu") ? tryCall(W, "menu", [a, items]) : fallbackMenu(a, items));
  const say = (msg, kind) => { if (has(W, "toast")) tryCall(W, "toast", [msg, { kind: kind || "info" }]); };

  /* ── 器（index.html の物を借りる）────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const ui = {
    home: $("btnHome"), name: els.projectName || $("projectName"), save: $("saveState"),
    undo: $("btnUndo"), redo: $("btnRedo"), tools: $("toolGroup"),
    ratio: $("btnRatio"), quality: $("btnQuality"),
    ai: $("btnAi"), export: $("btnExport"), account: $("btnAccount")
  };
  const made = {};                       // ここで作る物（… / オフライン札 / 道具）

  let dead = false, compact = false, collapsed = 0;
  let editingName = false, externalSave = "", myLabel = "";
  let holdTimer = 0, estimateAt = 0, storageInfo = null;
  let toolNodes = {}, toolSeg = null, toolSegValue = "", avatarKey = "", lastSig = "";

  /* 借りた器（index.html の物）に付けた手は **必ず外す**。外さないと
     プロジェクトを開き直して上段を作り直したときに二重に効く
     （取消ボタン 1 回で 2 手戻る、という直しにくい壊れ方をする）。 */
  const bag = [];
  function on(node, type, fn, opts) {
    if (!node || !has(node, "addEventListener")) return;
    node.addEventListener(type, fn, opts);
    bag.push([node, type, fn, opts]);
  }
  function offAll() {
    for (const [node, type, fn, opts] of bag) {
      try { node.removeEventListener(type, fn, opts); } catch (_e) { /* noop */ }
    }
    bag.length = 0;
  }

  const P = () => store.project || {};
  const S = () => P().settings || {};
  const V = () => store.view || {};
  const online = () => (globalThis.navigator ? globalThis.navigator.onLine !== false : true);
  const authState = () => (auth && auth.state ? auth.state : { status: "anon", user: null });

  /* ── プロジェクト名 ───────────────────────────────────────────── */
  function commitName(force) {
    const input = ui.name;
    if (!input) return;
    const want = String(input.value || "").trim();
    const cur = String(P().name || "");
    if (!want) { input.value = cur; return; }        // 空は認めない（op が throw する）
    if (want === cur) return;
    try { store.dispatch("project.rename", { name: want }, { label: "名前の変更" }); }
    catch (e) {
      say((e && e.message) || "名前を変えられませんでした", "error");
      if (force) input.value = cur;
    }
  }
  const commitSoon = debounce(() => commitName(false), NAME_COMMIT_MS);
  function bindName() {
    const input = ui.name;
    if (!input) return;
    /* CONTRACT-NOTE: app.js が入れた 1 打鍵ごとの dispatch を外す（上参照） */
    try { input.oninput = null; } catch (_e) { /* noop */ }
    input.value = String(P().name || "無題のプロジェクト");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    on(input, "focus", () => { editingName = true; root.setAttribute("data-naming", "1"); });
    on(input, "input", () => { editingName = true; commitSoon(); });
    on(input, "blur", () => {
      editingName = false;
      root.removeAttribute("data-naming");
      if (commitSoon.cancel) commitSoon.cancel();
      commitName(true);
    });
    on(input, "keydown", (e) => {
      e.stopPropagation();                            // 短絡キーに食われないように
      if (e.key === "Enter") { e.preventDefault(); if (commitSoon.cancel) commitSoon.cancel(); commitName(true); try { input.blur(); } catch (_e) { /* noop */ } }
      else if (e.key === "Escape") { e.preventDefault(); input.value = String(P().name || ""); try { input.blur(); } catch (_e) { /* noop */ } }
    });
  }

  /* ── 保存の札とオフライン ─────────────────────────────────────── */
  function paintSave() {
    const node = ui.save;
    if (!node) return;
    const text = externalSave || (store.dirty ? "未保存" : "保存済み");
    if (node.textContent !== text) { myLabel = text; node.textContent = text; }
    node.setAttribute("data-state", saveStateOf(text));
    const off = !online();
    if (made.offline) {
      made.offline.hidden = !off;
      made.offline.style.display = off ? "" : "none";
    }
    node.setAttribute("title", off
      ? "オフラインです。編集はこの端末に保存されています。"
      : "自動保存の状態");
  }
  /** app.js（や誰か）が書いた文字は正として受ける */
  function watchSave() {
    const node = ui.save;
    if (!node || typeof MutationObserver !== "function") return null;
    const mo = new MutationObserver(() => {
      const text = String(node.textContent || "").trim();
      if (!text || text === myLabel) return;
      externalSave = text;
      node.setAttribute("data-state", saveStateOf(text));
    });
    mo.observe(node, { childList: true, characterData: true, subtree: true });
    return mo;
  }

  /* ── 取消・やり直し ───────────────────────────────────────────── */
  function historyMenu(anchor) {
    const list = (has(store, "history") ? store.history() : []) || [];
    if (!list.length) { say("まだ取り消せる操作はありません", "info"); return; }
    const items = [];
    for (let i = list.length - 1, n = 0; i >= 0 && n < 20; i--, n++) {
      const e = list[i], back = list.length - i;
      items.push({
        label: (back === 1 ? "ここまで戻す: " : back + " 手 戻す: ") + String(e && e.label || "変更"),
        onSelect: () => { for (let k = 0; k < back && store.canUndo(); k++) store.undo(); render(); }
      });
    }
    if (has(store, "canRedo") && store.canRedo()) {
      items.push({ separator: true }, { label: "やり直す（1 手ずつ）", onSelect: () => { store.redo(); render(); } });
    }
    return openMenu(anchor, items);
  }
  /** 長押し（と右クリック）で履歴一覧。押している間に指が動いたら取り消す */
  function bindHold(node) {
    let fired = false, x0 = 0, y0 = 0;
    const clear = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } };
    on(node, "pointerdown", (e) => {
      fired = false; x0 = e.clientX; y0 = e.clientY;
      clear();
      holdTimer = setTimeout(() => { fired = true; holdTimer = 0; historyMenu(node); }, HOLD_MS);
    });
    on(node, "pointermove", (e) => {
      if (!holdTimer) return;
      if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) clear();
    });
    on(node, "pointerup", clear);
    on(node, "pointercancel", clear);
    on(node, "pointerleave", clear);
    on(node, "click", (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } });
    on(node, "contextmenu", (e) => { e.preventDefault(); historyMenu(node); });
  }

  /* ── 道具（#toolGroup）───────────────────────────────────────── */
  function setTool(tool) {
    try { store.setView({ tool }); } catch (e) { warn("topbar", "tool", e); }
    render();
  }
  function buildTools() {
    const box = ui.tools;
    if (!box) return;
    lastSig = "";                 // 作り直したので次の render は必ず塗る
    box.textContent = "";
    toolNodes = {};
    toolSeg = null;
    const seg = tryCall(W, "segmented", [{
      items: TOOLS.map((t) => ({ value: t[0], label: t[3], icon: t[1], key: t[4] })),
      value: String(V().tool || "select"),
      onChange: (v) => setTool(String(v))
    }]);
    if (seg && seg.nodeType === 1) {
      toolSeg = seg;
      toolSegValue = String(V().tool || "select");
      box.appendChild(seg);
      return;
    }
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", "ツール");
    for (const t of TOOLS) {
      const b = el("button", "vqs-topbar__tool", { type: "button", role: "radio", "data-test": "tb-tool-" + t[0], "data-tool": t[0] });
      b.append(iconEl(W, t[1], t[2]));
      const k = el("span", "vqs-topbar__toolkey");
      k.textContent = t[4];
      b.appendChild(k);
      tip(W, b, t[3], t[4]);
      on(b, "click", () => setTool(t[0]));
      toolNodes[t[0]] = b;
      box.appendChild(b);
    }
  }

  /* ── 比率（変えたら収め直すか尋ねる）─────────────────────────── */
  /* CONTRACT-NOTE: 同じ物が transport.js にも在る（共有の置き場が担当に無い） */
  function refitClips() {
    const s = S();
    const list = [];
    for (const tr of (Array.isArray(P().tracks) ? P().tracks : [])) {
      for (const c of (Array.isArray(tr && tr.clips) ? tr.clips : [])) {
        if (!c || (c.kind !== "video" && c.kind !== "image")) continue;
        const a = c.assetId ? assetById(P(), c.assetId) : null;
        if (!a) continue;
        list.push([c.id, coverScale(s.width, s.height, a.width, a.height)]);
      }
    }
    if (!list.length) return 0;
    try {
      store.batch("枠に収め直す", (d) => {
        for (const [id, sc] of list) d("clip.setTransform", { clipId: id, patch: { scale: sc, x: 0, y: 0 } });
      });
    } catch (e) { say((e && e.message) || "収め直せませんでした", "error"); return 0; }
    return list.length;
  }
  function askRefit() {
    const n = (Array.isArray(P().tracks) ? P().tracks : []).reduce((m, t) => m + (Array.isArray(t.clips) ? t.clips.length : 0), 0);
    if (!n) return;
    const doFit = () => { const k = refitClips(); if (k) say(k + " 個のクリップを収め直しました（取り消せます）", "ok"); };
    if (has(W, "openModal")) {
      const body = el("p", "vqs-topbar__ask");
      body.textContent = "比率が変わりました。クリップを新しい枠いっぱいに収め直しますか？（あとで取り消せます）";
      let m = null;
      const act = (label, primary, fn) => ({
        label, primary, kind: primary ? "primary" : "ghost",
        onSelect: () => { fn(); if (m && has(m, "close")) m.close(); },
        onClick: () => { fn(); if (m && has(m, "close")) m.close(); }
      });
      m = tryCall(W, "openModal", [{
        title: "枠に収め直しますか？", content: body,
        actions: [act("そのままにする", false, () => { }), act("収め直す", true, doFit)]
      }]);
      if (m) return;
    }
    let ok = false;
    try { ok = globalThis.confirm("クリップを新しい枠に収め直しますか？（あとで取り消せます）"); } catch (_e) { ok = false; }
    if (ok) doFit();
  }
  function setRatio(r) {
    if (String(S().ratio || "") === r) return;
    try { store.dispatch("settings.update", { patch: { ratio: r } }, { label: "比率" }); }
    catch (e) { say((e && e.message) || "比率を変えられません", "error"); return; }
    render();
    askRefit();
  }
  function ratioMenu(anchor) {
    const cur = String(S().ratio || "16:9");
    return openMenu(anchor, Object.keys(RATIOS).map((k) => ({
      label: (RATIOS[k].label || k) + (k === "custom" ? "" : "（" + RATIOS[k].w + "×" + RATIOS[k].h + "）"),
      checked: cur === k, onSelect: () => setRatio(k)
    })));
  }
  function qualityMenu(anchor) {
    const cur = String(S().previewQuality || "auto");
    return openMenu(anchor, QUALITIES.map((q) => ({
      label: "画質 " + q[1], checked: cur === q[0],
      onSelect: () => {
        try { store.dispatch("settings.update", { patch: { previewQuality: q[0] } }, { label: "プレビュー画質" }); }
        catch (e) { say((e && e.message) || "画質を変えられません", "error"); }
      }
    })));
  }

  /* ── 一覧へ戻る（未保存なら確認）─────────────────────────────── */
  function goHome() {
    if (!store.dirty) { onAction("home"); return; }
    const leave = () => onAction("home");
    const saveThen = () => {
      if (app && has(app, "save")) { const p = app.save(); if (p && has(p, "then")) { p.then(leave, leave); return; } }
      else onAction("save");                 // app.js が受けるようになったらここが効く
      leave();
    };
    if (has(W, "openModal")) {
      const body = el("p", "vqs-topbar__ask");
      body.textContent = "保存されていない変更があります。どうしますか？（自動保存は数秒後に走ります）";
      let m = null;
      const act = (label, primary, fn) => ({
        label, primary, kind: primary ? "primary" : "ghost",
        onSelect: () => { if (m && has(m, "close")) m.close(); fn(); },
        onClick: () => { if (m && has(m, "close")) m.close(); fn(); }
      });
      m = tryCall(W, "openModal", [{
        title: "プロジェクト一覧へ戻りますか？", content: body,
        actions: [act("やめる", false, () => { }), act("そのまま戻る", false, leave), act("保存して戻る", true, saveThen)]
      }]);
      if (m) return;
    }
    let ok = false;
    try { ok = globalThis.confirm("保存されていない変更があります。保存して一覧へ戻りますか？"); } catch (_e) { ok = true; }
    if (ok) saveThen();
  }

  /* ── アカウント ───────────────────────────────────────────────── */
  function refreshEstimate() {
    const t = Date.now();
    if (t - estimateAt < ESTIMATE_MS) return;
    estimateAt = t;
    const nav = globalThis.navigator;
    if (!nav || !nav.storage || !has(nav.storage, "estimate")) return;
    nav.storage.estimate().then((r) => {
      if (dead || !r) return;
      storageInfo = { usage: finite(r.usage, 0), quota: finite(r.quota, 0) };
    }).catch(() => { /* 分からない器では出さない */ });
  }
  function accountLabel() {
    const st = authState();
    const u = st.user || {};
    const nick = String(u.nickname || u.name || u.displayName || "").trim();
    const grade = String(u.gradePrefix || u.grade_prefix || "").trim();
    if (st.status === "user") return (grade ? grade + " " : "") + (nick || "ログイン中");
    if (st.status === "guest") return "ゲストで利用中";
    if (st.status === "booting") return "確かめています…";
    return "ログインしていません";
  }
  function accountMenu(anchor) {
    const st = authState();
    const items = [{ label: accountLabel(), disabled: true }];
    if (st.status === "user") {
      items.push({ label: "アカウント情報…", onSelect: () => onAction("account", "profile") });
      items.push({ label: "パスワードを変える…", onSelect: () => onAction("account", "password") });
    } else {
      items.push({ label: "ログインすると、AI の回数が増え、別の端末でも続けられます", disabled: true });
      items.push({ label: "ログイン…", onSelect: () => onAction("account", "login") });
      items.push({ label: "新規登録…", onSelect: () => onAction("account", "signup") });
      items.push({ label: "パスワードを忘れた…", onSelect: () => onAction("account", "reset") });
    }
    items.push({ separator: true });
    items.push({
      label: storageInfo && storageInfo.quota
        ? "保存容量: " + formatBytes(storageInfo.usage) + " / " + formatBytes(storageInfo.quota)
        : "保存容量: 分かりません（この端末）",
      onSelect: () => onAction("account", "storage")
    });
    items.push({ label: online() ? "通信: つながっています" : "通信: オフライン（端末に保存）", disabled: true });
    items.push({ separator: true });
    items.push({ label: "設定…", onSelect: () => onAction("settings") });
    if (st.status === "user") items.push({ label: "ログアウト", onSelect: doLogout });
    refreshEstimate();
    return openMenu(anchor, items);
  }
  function doLogout() {
    if (!has(auth, "logout")) { onAction("account", "logout"); return; }
    let ok = true;
    try { ok = globalThis.confirm("ログアウトします。この端末に保存したプロジェクトは残ります。"); } catch (_e) { ok = true; }
    if (!ok) return;
    /* ゲストとして続けられるようにして抜ける（編集を途中で止めない） */
    tryCall(auth, "logout", [{ keepGuest: true }]);
    say("ログアウトしました（ゲストとして続けられます）", "ok");
    render();
  }

  /* ── 「…」へ畳む ─────────────────────────────────────────────── */
  function groupOf(id) {
    if (id === "tools") return ui.tools;
    if (id === "quality") return ui.quality;
    if (id === "ratio") return ui.ratio;
    if (id === "undo") return ui.undo;
    if (id === "redo") return ui.redo;
    if (id === "ai") return ui.ai;
    return null;
  }
  function applyCollapse(n) {
    for (let i = 0; i < COLLAPSE_ORDER.length; i++) {
      const node = groupOf(COLLAPSE_ORDER[i]);
      if (!node) continue;
      const hide = i < n;
      node.hidden = hide;
      node.style.display = hide ? "none" : "";
    }
    if (made.more) {
      made.more.hidden = n <= 0;
      made.more.style.display = n > 0 ? "" : "none";
    }
  }
  /** 上段が横 1 列に並んでいるか（CSS がまだ無いと縦に積まれる） */
  function horizontal() {
    let cs = null;
    try { cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : null; } catch (_e) { cs = null; }
    if (!cs) return false;
    if (cs.display !== "flex" && cs.display !== "inline-flex" && cs.display !== "grid") return false;
    return !/column/.test(String(cs.flexDirection || ""));
  }
  /**
   * 溢れているか。scrollWidth だけでは足りない（flex は子を縮めて
   * 「溢れていない」顔をする）ので、3 つの組の自然な幅の合計でも見る。
   * ただし **横 1 列でない時は畳まない**。CSS が未完成で縦に積まれている
   * 器では、組の幅が器の幅と同じになり「常に溢れている」と誤って読み、
   * 上段の物が全部「…」に消えてしまう（実測で踏んだ）。
   */
  function overflowing() {
    const w = root.clientWidth || 0;
    if (!w) return false;
    if (root.scrollWidth > w + 2) return true;
    if (!horizontal()) return false;
    let sum = 0;
    for (const c of root.children) {
      if (!c || c.hidden) continue;
      sum += Math.max(finite(c.scrollWidth, 0), finite(c.offsetWidth, 0));
    }
    return sum > w - 8;
  }
  function fitWidth() {
    if (dead) return;
    compact = (globalThis.innerWidth || 1280) < 1024;
    root.setAttribute("data-compact", compact ? "1" : "0");
    let n = 0;
    applyCollapse(0);
    while (n < COLLAPSE_ORDER.length && overflowing()) { n++; applyCollapse(n); }
    collapsed = n;
    root.setAttribute("data-collapsed", String(n));
  }
  /* 幅の測り直しは重い（最悪 7 回の再レイアウト）。擦っている間に毎フレーム
     測らないよう、少し待ってから 1 回だけ測る。 */
  const fitSoon = debounce(fitWidth, 150);
  function moreMenu(anchor) {
    const ids = collapsedIds(collapsed);
    const items = [];
    const tool = String(V().tool || "select");
    if (ids.indexOf("undo") >= 0) items.push({ label: "取り消し", disabled: !store.canUndo(), onSelect: () => { store.undo(); render(); } });
    if (ids.indexOf("redo") >= 0) items.push({ label: "やり直し", disabled: !store.canRedo(), onSelect: () => { store.redo(); render(); } });
    if (ids.indexOf("undo") >= 0) items.push({ label: "履歴から戻す…", onSelect: () => historyMenu(anchor) });
    /* 区切りは「前に何か在るとき」だけ入れる（先頭の線は見苦しい） */
    const sep = () => { if (items.length) items.push({ separator: true }); };
    if (ids.indexOf("tools") >= 0) {
      sep();
      for (const t of TOOLS) items.push({ label: "ツール: " + t[3], checked: tool === t[0], onSelect: () => setTool(t[0]) });
    }
    if (ids.indexOf("ratio") >= 0 || ids.indexOf("quality") >= 0) sep();
    if (ids.indexOf("ratio") >= 0) items.push({ label: "比率: " + String(S().ratio || "16:9") + "…", onSelect: () => ratioMenu(anchor) });
    if (ids.indexOf("quality") >= 0) {
      const q = QUALITIES.find((x) => x[0] === String(S().previewQuality || "auto")) || QUALITIES[0];
      items.push({ label: "画質: " + q[1] + "…", onSelect: () => qualityMenu(anchor) });
    }
    if (ids.indexOf("ai") >= 0) { sep(); items.push({ label: "AI 自動編集…", onSelect: () => onAction("ai") }); }
    return openMenu(anchor, items);
  }

  /* ══ 組み立て（器は消さず、中身と手を入れる）══════════════════ */
  function build() {
    /* 上段そのものの目印 */
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", "上段の道具");

    if (ui.home && !ui.home.childNodes.length) ui.home.append(iconEl(W, "home", "☰"));
    if (ui.home && !made.homeBound) {
      made.homeBound = true;
      tip(W, ui.home, "プロジェクト一覧へ戻る");
      on(ui.home, "click", goHome);
    }
    if (!made.nameBound) { made.nameBound = true; bindName(); }
    if (ui.save && !made.offline) {
      made.offline = el("span", "vqs-topbar__offline", { "data-test": "tb-offline", hidden: "" });
      made.offline.textContent = "オフライン";
      made.offline.style.display = "none";
      tip(W, made.offline, "通信がありません。編集はこの端末に保存されています。");
      if (ui.save.parentNode) ui.save.parentNode.insertBefore(made.offline, ui.save.nextSibling);
    }
    for (const spec of [["undo", "undo", "↶", "取り消し", "Ctrl+Z"], ["redo", "redo", "↷", "やり直し", "Ctrl+Shift+Z"]]) {
      const node = ui[spec[0]];
      if (!node) continue;
      if (!node.childNodes.length) node.append(iconEl(W, spec[1], spec[2]));
      if (made[spec[0] + "Bound"]) continue;
      made[spec[0] + "Bound"] = true;
      tip(W, node, spec[3] + "（長押しで履歴）", spec[4]);
      on(node, "click", () => {
        if (spec[0] === "undo") { if (store.canUndo()) store.undo(); }
        else if (store.canRedo()) store.redo();
        render();
      });
      bindHold(node);
    }
    buildTools();
    if (ui.ratio && !made.ratioBound) {
      made.ratioBound = true;
      tip(W, ui.ratio, "画面の比率を変える");
      on(ui.ratio, "click", () => ratioMenu(ui.ratio));
    }
    if (ui.quality && !made.qualityBound) {
      made.qualityBound = true;
      tip(W, ui.quality, "プレビューの画質（軽くすると滑らかに動く）");
      on(ui.quality, "click", () => qualityMenu(ui.quality));
    }
    if (ui.ai && !made.aiBound) {
      made.aiBound = true;
      tip(W, ui.ai, "AI 自動編集を開く");
      on(ui.ai, "click", () => onAction("ai"));
    }
    if (ui.export && !made.exportBound) {
      made.exportBound = true;
      tip(W, ui.export, "書き出しを開く", "Ctrl+E");
      on(ui.export, "click", () => onAction("export"));
    }
    if (ui.account && !made.accountBound) {
      made.accountBound = true;
      on(ui.account, "click", () => accountMenu(ui.account));
    }
    /* 「…」（畳んだ物の置き場）。右の並びの末尾に足す */
    if (!made.more && ui.export && ui.export.parentNode) {
      const b = el("button", "vqs-topbar__more", { type: "button", "data-test": "tb-more", hidden: "" });
      b.append(iconEl(W, "more", "…"));
      b.style.display = "none";
      tip(W, b, "その他の操作");
      on(b, "click", () => moreMenu(b));
      made.more = b;
      ui.export.parentNode.appendChild(b);
    }
    refreshEstimate();
    avatarKey = "";
    lastSig = "";
    render(true);
    fitWidth();
  }

  /* ══ 描く（状態だけ）═════════════════════════════════════════ */
  /**
   * 上段の見た目が頼っている値をひとまとめにした印。
   * 再生中は毎フレーム view が変わって render() が呼ばれるが、上段は
   * 再生ヘッドを出さない。印が同じなら何もしない（毎フレームの
   * setAttribute を積むと iPhone で目に見えて重くなる）。
   */
  function signature() {
    const s = S(), st = authState(), u = st.user || {};
    return [
      P().name, store.dirty ? 1 : 0, externalSave, online() ? 1 : 0,
      has(store, "canUndo") && store.canUndo() ? 1 : 0,
      has(store, "canRedo") && store.canRedo() ? 1 : 0,
      V().tool, s.ratio, s.width, s.height, s.previewQuality,
      st.status, u.nickname || u.name || "", u.gradePrefix || u.grade_prefix || "",
      storageInfo ? storageInfo.usage : -1
    ].join("|");
  }
  function render(force) {
    if (dead) return;
    const sig = signature();
    if (!force && sig === lastSig) return;
    lastSig = sig;
    if (ui.name && !editingName) {
      const want = String(P().name || "");
      if (ui.name.value !== want) ui.name.value = want;
    }
    paintSave();
    if (ui.undo) {
      const ok = has(store, "canUndo") ? store.canUndo() : false;
      ui.undo.disabled = !ok;
      ui.undo.setAttribute("aria-disabled", ok ? "false" : "true");
    }
    if (ui.redo) {
      const ok = has(store, "canRedo") ? store.canRedo() : false;
      ui.redo.disabled = !ok;
      ui.redo.setAttribute("aria-disabled", ok ? "false" : "true");
    }
    const tool = String(V().tool || "select");
    for (const t of TOOLS) {
      const b = toolNodes[t[0]];
      if (!b) continue;
      const on = tool === t[0];
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("is-on", on);
    }
    /* widgets.segmented は値を戻す口が無いことも在る（短絡キーで変えた時に
       押した所が変わらないのを防ぐため、無ければ作り直す） */
    if (toolSeg && toolSegValue !== tool) {
      if (has(toolSeg, "setValue")) { tryCall(toolSeg, "setValue", [tool]); toolSegValue = tool; }
      else buildTools();
    }
    if (ui.ratio) {
      const r = String(S().ratio || "16:9");
      ui.ratio.textContent = r === "custom" ? S().width + "×" + S().height : r;
      ui.ratio.setAttribute("data-value", r);
    }
    if (ui.quality) {
      const cur = String(S().previewQuality || "auto");
      const q = QUALITIES.find((x) => x[0] === cur) || QUALITIES[0];
      ui.quality.textContent = "画質 " + q[1];
      ui.quality.setAttribute("data-value", cur);
    }
    if (ui.account) {
      const st = authState();
      const label = accountLabel();
      ui.account.setAttribute("data-status", String(st.status || "anon"));
      tip(W, ui.account, "アカウント（" + label + "）");
      const u = st.user || {};
      const nick = String(u.nickname || u.name || "").trim();
      const initial = st.status === "user" && nick ? nick.slice(0, 1).toUpperCase() : "";
      /* 中身の作り直しは **変わった時だけ**（毎回だと絵がちらつく） */
      const key = st.status + ":" + initial;
      if (avatarKey !== key) {
        avatarKey = key;
        ui.account.textContent = "";
        if (initial) ui.account.textContent = initial;
        else ui.account.append(iconEl(W, st.status === "guest" ? "user-guest" : "user", st.status === "guest" ? "ゲ" : "人"));
      }
    }
  }
  const renderSoon = rafThrottle(() => render());

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const unsubscribe = store.subscribe ? store.subscribe((ev) => {
    if (dead) return;
    if (ev && ev.kind === "project") {
      externalSave = "";        // 中身が変わったので札は自分で決め直す
      fitSoon();                // 名前や比率で幅が変わり得るのはこの時だけ
    }
    renderSoon();
  }) : null;
  const offAuth = has(auth, "subscribe") ? tryCall(auth, "subscribe", [() => { if (!dead) renderSoon(); }]) : null;
  const saveWatch = watchSave();
  const onNet = () => { if (!dead) { paintSave(); renderSoon(); } };
  on(globalThis, "online", onNet);
  on(globalThis, "offline", onNet);
  const onResize = () => { if (!dead) fitSoon(); };
  on(globalThis, "resize", onResize, { passive: true });
  /* 分割線のドラッグでも上段の幅は変わる（window の resize は来ない） */
  let ro = null;
  if (typeof ResizeObserver === "function") {
    try { ro = new ResizeObserver(() => fitSoon()); ro.observe(root); } catch (_e) { ro = null; }
  }

  build();

  function dispose() {
    dead = true;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    if (commitSoon.cancel) commitSoon.cancel();
    if (renderSoon.cancel) renderSoon.cancel();
    if (fitSoon.cancel) fitSoon.cancel();
    if (saveWatch) { try { saveWatch.disconnect(); } catch (_e) { /* noop */ } }
    if (ro) { try { ro.disconnect(); } catch (_e) { /* noop */ } }
    offAll();
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    if (typeof offAuth === "function") { try { offAuth(); } catch (_e) { /* noop */ } }
    /* 借りた器は **元の形に戻す**（次に作り直す人が二重に配線しないように） */
    applyCollapse(0);
    if (made.more) { try { made.more.remove(); } catch (_e) { /* noop */ } }
    if (made.offline) { try { made.offline.remove(); } catch (_e) { /* noop */ } }
    if (ui.tools) ui.tools.textContent = "";
    toolNodes = {};
    toolSeg = null;
  }

  return { render, dispose };
}
