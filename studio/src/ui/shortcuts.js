/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/shortcuts.js — 鍵（短絡キー）と命令一覧（コマンドパレット）

   ★ 何をする所か
     keydown を **1 か所**で受けて ui/commands.js の表と突き合わせ、
     合う命令を `runCommand()` で実行する所。合わせて
       ・「?」… 短絡キーの一覧（検索できる）
       ・mod+K … 命令一覧（打ち込んで findCommands → Enter で実行）
     を出す。契約書 §7.4 の割当は全て commands.js の `keys` に入っている。

   ★ なぜこの形か
     ・鍵の実装を 1 か所に集めると「同じ鍵が 2 つの物に効く」事故が起きない。
       鍵 → 命令の引き当ては `keyMap()`、同じ鍵に複数在るときは
       **when が真の最初の 1 つ**（例: Delete は選択が在るときだけ）。
     ・入力欄（input / textarea / contenteditable）に焦点が在るときは大半を
       止める。ただし Ctrl+Z / S / E など「文書ではなく作品への操作」は通す
       （契約書と依頼の文面どおり）。Escape は入力欄では焦点を外すだけ。
     ・Space は ui/transport.js も受ける。向こうは `defaultPrevented` を見て
       譲るので、**ここが先に処理して preventDefault する**（capture で聞く）。
       二重に切り替わらない。
     ・J / K / L は押すほど速く（2 度目で 2 倍・3 度目で 4 倍）。倍率は
       ctx に `hold` を足して commands.js の run に渡す（run 側は ctx.hold を読む）。
     ・危険な命令（全削除など）は runCommand が確認を出す。Delete は
       「選択が在るときだけ」なので、間違って押しても何も起きない。
     ・パレットはモバイル（< 1024px）では出さない（代わりに下段タブ。
       契約書 §7.2）。一覧（?）は出す — 外付けキーボードの iPad が在る。

   ★ 触るときの注意
     ・ここは **DOM を作るが CSS は持たない**。クラスは vqs- 接頭で付け、
       見た目は styles/ 側（担当が別）。CSS がまだ無い間も読めるように
       `@layer vqs-fallback` の控えだけ流し込む（本物の CSS が必ず勝つ）。
     ・widgets.js がまだ無いことが在る（同僚が並行して書いている）。
       `openModal` が在ればそれを使い、無ければ自前の薄い覆いを出す。
     ・dispose() は必ず 全ての listener と DOM を片付ける（画面の作り直しで
       2 重に効くと鍵が 2 回走る）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import {
  COMMANDS, GROUPS, keyMap, eventKeyString, describeKeys, findCommands,
  commandsByGroup, runCommand, isEnabled, recentIds, isMac, normalizeKey
} from "./commands.js";
import { clamp, finite } from "../core/util.js";
import { warn } from "../core/log.js";

const MOBILE_W = 1024;                    // 契約書 §7.2 の境目
const HOLD_MS = 700;                      // J / L の「押し続け」と見る間
const HOLD_MUL = [1, 2, 4, 8];            // 2 度目で 2 倍・3 度目で 4 倍
const PALETTE_MAX = 40;

/* 入力欄に焦点が在っても通す鍵（作品への操作。文字の打ち込みを邪魔しない物だけ） */
const PASS_WHILE_TYPING = new Set([
  "mod+z", "mod+shift+z", "mod+y", "mod+s", "mod+shift+s", "mod+e", "mod+shift+e", "mod+k"
]);

/** 入力中か（input / textarea / select / contenteditable） */
export function isTyping(node) {
  if (!node || typeof node !== "object") return false;
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (node.isContentEditable) return true;
  return false;
}

/** その要素が自分で使う鍵か（ボタンの Space / Enter は奪わない） */
export function ownsKey(node, key) {
  if (!node || typeof node !== "object") return false;
  if (key !== "space" && key !== "enter") return false;
  const tag = String(node.tagName || "").toLowerCase();
  if (tag === "button" || tag === "a" || tag === "summary" || tag === "label") return true;
  const role = typeof node.getAttribute === "function" ? node.getAttribute("role") : null;
  return role === "button" || role === "tab" || role === "switch" || role === "option";
}

/** 押した鍵をこの場で処理して良いか（純関数・試験できる） */
export function allowKey(key, typing) {
  if (!key) return false;
  if (!typing) return true;
  return PASS_WHILE_TYPING.has(key);
}

/** 押し続けの段（1 → 2 → 4 → 8 倍）。純関数 */
export function holdMultiplier(count) {
  const n = clamp(Math.round(finite(count, 1)), 1, HOLD_MUL.length);
  return HOLD_MUL[n - 1];
}

const isMobile = () => (globalThis.innerWidth || 1280) < MOBILE_W;
const el = (tag, cls, attrs) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of Object.keys(attrs || {})) {
    if (k === "text") n.textContent = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  return n;
};
const hostFor = (id) => document.getElementById(id) || document.body;

/* ── CSS がまだ無くても読める控え（@layer なので本物の CSS が勝つ）── */
const FALLBACK_CSS = `@layer vqs-fallback {
.vqs-cmdk{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-start;
  justify-content:center;padding:max(8vh,env(safe-area-inset-top)) 16px 16px;
  background:rgba(4,6,10,.62)}
.vqs-cmdk__panel{width:min(680px,100%);max-height:72vh;display:flex;flex-direction:column;
  border-radius:16px;overflow:hidden;background:#14181f;color:#e8ecf2;
  box-shadow:0 24px 64px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.08)}
.vqs-cmdk__input{appearance:none;width:100%;box-sizing:border-box;min-height:52px;padding:14px 16px;
  font:inherit;font-size:16px;color:inherit;background:transparent;border:0;
  border-bottom:1px solid rgba(255,255,255,.08);outline:none}
.vqs-cmdk__list{margin:0;padding:6px;overflow-y:auto;list-style:none;-webkit-overflow-scrolling:touch}
.vqs-cmdk__row{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 10px;
  border-radius:10px;cursor:pointer;background:none;border:0;color:inherit;width:100%;
  text-align:left;font:inherit}
.vqs-cmdk__row[aria-selected="true"]{background:rgba(79,140,255,.22)}
.vqs-cmdk__group{flex:0 0 auto;font-size:11px;opacity:.6}
.vqs-cmdk__title{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vqs-cmdk__row.is-danger .vqs-cmdk__title{color:#ff8f8f}
.vqs-cmdk__empty{padding:18px;opacity:.7;text-align:center}
.vqs-kbd{flex:0 0 auto;padding:2px 7px;border-radius:6px;font-size:11px;
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);white-space:nowrap}
.vqs-keyhelp__search{appearance:none;width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;
  margin-bottom:10px;font:inherit;font-size:16px;color:inherit;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12);border-radius:10px;outline:none}
.vqs-keyhelp__group{margin:0 0 6px;font-size:12px;letter-spacing:.04em;opacity:.65}
.vqs-keyhelp__table{width:100%;border-collapse:collapse;margin-bottom:14px}
.vqs-keyhelp__table td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.06);
  font-size:13px;vertical-align:middle}
.vqs-keyhelp__table td:last-child{text-align:right;white-space:nowrap}
.vqs-keyhelp__empty{opacity:.7;padding:12px 4px}
.vqs-modal-lite{position:fixed;inset:0;z-index:92;display:flex;align-items:center;
  justify-content:center;padding:16px;background:rgba(4,6,10,.62)}
.vqs-modal-lite__panel{width:min(720px,100%);max-height:80vh;overflow:auto;padding:16px;
  border-radius:16px;background:#14181f;color:#e8ecf2;border:1px solid rgba(255,255,255,.08);
  padding-bottom:calc(16px + env(safe-area-inset-bottom))}
.vqs-modal-lite__head{display:flex;align-items:center;justify-content:space-between;gap:12px;
  margin-bottom:12px;font-weight:600}
.vqs-modal-lite__close{min-width:44px;min-height:44px;border-radius:10px;border:0;font:inherit;
  font-size:18px;color:inherit;background:rgba(255,255,255,.08);cursor:pointer}
}`;

let cssDone = false;
function ensureFallbackCss() {
  if (cssDone || typeof document === "undefined") return;
  cssDone = true;
  if (document.getElementById("vqsShortcutsCss")) return;
  try {
    const st = el("style", "", { id: "vqsShortcutsCss" });
    st.textContent = FALLBACK_CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { warn("shortcuts", "控えの CSS を流し込めなかった", e); }
}

/**
 * 自前の薄い覆い（widgets.openModal がまだ無いとき用）。
 * @returns {{close:Function, body:HTMLElement}}
 */
function liteModal(title, content) {
  ensureFallbackCss();
  const back = el("div", "vqs-modal-lite", { role: "dialog", "aria-modal": "true", "data-test": "modal-lite" });
  const panel = el("div", "vqs-modal-lite__panel");
  const head = el("div", "vqs-modal-lite__head");
  head.append(el("span", "", { text: title || "" }));
  const x = el("button", "vqs-modal-lite__close", { type: "button", "aria-label": "閉じる", text: "×" });
  head.append(x);
  panel.append(head, content);
  back.append(panel);
  hostFor("modalHost").append(back);
  const close = () => { try { back.remove(); } catch (e) { /* 片付け済み */ } };
  x.addEventListener("click", close);
  back.addEventListener("pointerdown", (ev) => { if (ev.target === back) close(); });
  return { close, body: panel };
}

/** widgets が在ればそれ・無ければ自前で覆いを出す */
function showModal(ctx, title, content, actions) {
  const W = ctx && ctx.widgets;
  if (W && typeof W.openModal === "function") {
    try {
      const m = W.openModal({ title, content, actions: actions || [] });
      return m && typeof m.close === "function" ? m : { close() { } };
    } catch (e) { warn("shortcuts", "widgets.openModal が失敗したので控えで出す", e); }
  }
  return liteModal(title, content);
}

/* ══ §A 短絡キーの一覧（「?」）════════════════════════════════ */

/**
 * 一覧の中身（表）を組む。query で絞れる。
 * @param {string} query @returns {HTMLElement}
 */
function buildHelpBody(query, onQuery) {
  const wrap = el("div", "vqs-keyhelp", { "data-test": "key-help" });
  const search = el("input", "vqs-keyhelp__search", {
    type: "search", placeholder: "鍵や命令をさがす（例: 分割 / ぶんかつ / split）",
    "aria-label": "短絡キーをさがす", value: query || "", inputmode: "search"
  });
  wrap.append(search);
  const list = el("div", "vqs-keyhelp__list");
  wrap.append(list);
  const mac = isMac();
  const paint = (q) => {
    list.textContent = "";
    const hit = q ? findCommands(q, { all: true }) : COMMANDS;
    const rows = hit.filter((c) => c.keys.length);
    if (!rows.length) {
      list.append(el("p", "vqs-keyhelp__empty", { text: "合う鍵が在りませんでした" }));
      return;
    }
    for (const g of commandsByGroup(rows)) {
      list.append(el("h4", "vqs-keyhelp__group", { text: g.label }));
      const table = el("table", "vqs-keyhelp__table");
      const tbody = el("tbody", "");
      for (const cmd of g.items) {
        const tr = el("tr", "");
        tr.append(el("td", "", { text: cmd.title }));
        const td = el("td", "");
        td.append(el("kbd", "vqs-kbd", { text: describeKeys(cmd.keys, { mac }) }));
        tr.append(td);
        tbody.append(tr);
      }
      table.append(tbody);
      list.append(table);
    }
  };
  paint(query || "");
  let timer = 0;
  search.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; paint(search.value); if (onQuery) onQuery(search.value); }, 80);
  });
  /* 一覧の中の Enter で閉じないように（検索欄なので既定の submit も無い） */
  search.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.preventDefault(); });
  wrap.__focus = () => { try { search.focus(); } catch (e) { /* noop */ } };
  return wrap;
}

/* ══ §B 命令一覧（コマンドパレット・mod+K）══════════════════ */

function createPalette(ctx, onDone) {
  ensureFallbackCss();
  const mac = isMac();
  const back = el("div", "vqs-cmdk", { role: "dialog", "aria-modal": "true", "data-test": "cmd-palette" });
  const panel = el("div", "vqs-cmdk__panel");
  const input = el("input", "vqs-cmdk__input", {
    type: "text", placeholder: "命令をさがす（例: 分割 / ぶんかつ / export）",
    "aria-label": "命令をさがす", autocomplete: "off", autocapitalize: "off",
    spellcheck: "false", "data-test": "cmd-palette-input"
  });
  const list = el("ul", "vqs-cmdk__list", { role: "listbox" });
  panel.append(input, list);
  back.append(panel);
  hostFor("modalHost").append(back);

  let rows = [], cursor = 0, dead = false;
  const recent = recentIds();

  function paint() {
    rows = findCommands(input.value, { ctx, recent, limit: PALETTE_MAX });
    if (!rows.length) rows = findCommands(input.value, { recent, limit: PALETTE_MAX, all: true });
    cursor = 0;
    list.textContent = "";
    if (!rows.length) {
      list.append(el("li", "vqs-cmdk__empty", { text: "合う命令が在りませんでした" }));
      return;
    }
    rows.forEach((cmd, i) => {
      const li = el("li", "", { role: "presentation" });
      const b = el("button", "vqs-cmdk__row" + (cmd.danger ? " is-danger" : ""), {
        type: "button", role: "option", "aria-selected": i === 0 ? "true" : "false",
        "data-test": "cmd-row", "data-id": cmd.id
      });
      b.append(el("span", "vqs-cmdk__group", { text: (GROUPS[cmd.group] && GROUPS[cmd.group].label) || cmd.group }));
      b.append(el("span", "vqs-cmdk__title", { text: cmd.title + (isEnabled(cmd, ctx) ? "" : "（今はできません）") }));
      if (cmd.keys.length) b.append(el("kbd", "vqs-kbd", { text: describeKeys(cmd.keys, { mac }) }));
      b.addEventListener("click", () => pick(i));
      li.append(b);
      list.append(li);
    });
  }
  function move(d) {
    if (!rows.length) return;
    cursor = (cursor + d + rows.length) % rows.length;
    const items = list.querySelectorAll('[role="option"]');
    items.forEach((n, i) => n.setAttribute("aria-selected", i === cursor ? "true" : "false"));
    const cur = items[cursor];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }
  async function pick(i) {
    const cmd = rows[typeof i === "number" ? i : cursor];
    close();
    if (cmd) await runCommand(cmd, ctx);
  }
  function close() {
    if (dead) return;
    dead = true;
    try { back.remove(); } catch (e) { /* 片付け済み */ }
    if (onDone) onDone();
  }
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); return; }
    if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); return; }
    if (ev.key === "Enter") { ev.preventDefault(); pick(); return; }
    if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
    ev.stopPropagation();          // 鍵の受け口まで届かせない（打ち込みが消える）
  });
  back.addEventListener("pointerdown", (ev) => { if (ev.target === back) close(); });
  paint();
  setTimeout(() => { try { input.focus(); } catch (e) { /* noop */ } }, 20);
  return { close, get el() { return back; } };
}

/* ══ §C 本体 ════════════════════════════════════════════════ */

/**
 * 鍵を受け取る仕組みを起こす（契約書 §7.4）。
 * @param {{ctx:Object, commands?:Object[]|Object}} deps
 *   ctx = { store, transport, widgets, auth, app, … }（ui/app.js が渡す物）
 * @returns {{dispose:Function, setEnabled:Function, openHelp:Function,
 *            openPalette:Function, handleKey:Function, keyOf:Function}}
 */
export function createShortcuts(deps) {
  const d = deps || {};
  const raw = d.commands;
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.COMMANDS) ? raw.COMMANDS : COMMANDS);
  const base = d.ctx || {};
  const map = keyMap(list);
  let enabled = true, dead = false;
  let palette = null, help = null;
  let hold = { key: "", n: 0, at: 0 };

  /* ctx に `hold`（J / L の段）を足した物。getter を壊さないよう prototype で被せる */
  function ctxWith(n) {
    if (!n || n <= 1) return base;
    try { return Object.create(base, { hold: { value: n, enumerable: true } }); }
    catch (e) { return base; }
  }

  /** この鍵で走らせる命令を選ぶ（同じ鍵に複数在れば when が真の最初の 1 つ） */
  function pickCommand(key) {
    const cands = map.get(key);
    if (!cands || !cands.length) return null;
    for (const cmd of cands) if (isEnabled(cmd, base)) return cmd;
    return null;
  }

  /* 段の数（1..4）。倍率への直しは commands.js の playDir が持つ */
  const holdIndex = (n) => clamp(Math.round(finite(n, 1)), 1, HOLD_MUL.length);

  /** 押し続けの段を数える（J / L のときだけ使う） */
  function holdCount(key, now, repeat) {
    if (hold.key === key && (now - hold.at <= HOLD_MS || repeat)) hold = { key, n: hold.n + 1, at: now };
    else hold = { key, n: 1, at: now };
    return hold.n;
  }

  function onKey(ev) {
    if (dead || !enabled || !ev || ev.defaultPrevented) return;
    /* パレット・一覧の中の打ち込みは向こうが持つ */
    if (palette && palette.el && ev.target && palette.el.contains(ev.target)) return;
    const key = eventKeyString(ev);
    if (!key) return;
    /* 覆い（一覧・パレット）が開いているときの Escape は まず閉じる */
    if (key === "escape" && (palette || help)) { ev.preventDefault(); closeAll(); return; }
    const typing = isTyping(ev.target) || isTyping(document.activeElement);
    if (typing && key === "escape") {
      const node = document.activeElement;
      if (node && typeof node.blur === "function") { ev.preventDefault(); node.blur(); }
      return;
    }
    /* ボタン・リンクに焦点が在るときの Space / Enter は その物の物 */
    if (ownsKey(ev.target, key) || ownsKey(document.activeElement, key)) return;
    if (!allowKey(key, typing)) return;

    /* 一覧（?）とパレット（mod+K）はここで面倒見る（命令の run からも呼ばれる） */
    if (key === "?") { ev.preventDefault(); openHelp(); return; }
    if (key === "mod+k") { ev.preventDefault(); openPalette(); return; }

    const cmd = pickCommand(key);
    if (!cmd) return;
    /* J / L は押すほど速く（K や他の鍵を押したら段は切れる） */
    let n = 1;
    if (cmd.id === "play.forward" || cmd.id === "play.reverse") n = holdCount(key, Date.now(), !!ev.repeat);
    else hold = { key: "", n: 0, at: 0 };
    if (ev.repeat && cmd.id !== "play.forward" && cmd.id !== "play.reverse" &&
        cmd.id !== "play.frameNext" && cmd.id !== "play.framePrev") return;   // 押しっぱなしの暴走止め
    ev.preventDefault();
    runCommand(cmd, ctxWith(holdIndex(n)));
  }
  /** 短絡キーの一覧を出す */
  function openHelp() {
    if (help) { closeHelp(); return; }
    if (typeof document === "undefined") return;
    const body = buildHelpBody("");
    const m = showModal(base, "短絡キーの一覧", body, [{ label: "閉じる", primary: true }]);
    help = {
      close() {
        try { m.close(); } catch (e) { /* 閉じ済み */ }
        help = null;
      }
    };
    if (typeof body.__focus === "function") setTimeout(body.__focus, 30);
    return help;
  }
  function closeHelp() { if (help) help.close(); }

  /** 命令一覧（パレット）を出す。モバイルでは出さない（代わりに下段タブ） */
  function openPalette() {
    if (typeof document === "undefined") return null;
    if (palette) { palette.close(); return null; }
    if (isMobile()) {
      const t = base && (base.toast || (base.widgets && base.widgets.toast));
      if (typeof t === "function") t("下のタブから選べます", { kind: "info" });
      return null;
    }
    palette = createPalette(base, () => { palette = null; });
    return palette;
  }
  function closeAll() {
    if (palette) palette.close();
    closeHelp();
  }

  if (typeof document !== "undefined") {
    ensureFallbackCss();
    /* capture で聞く（transport.js の Space より先に決める。向こうは
       defaultPrevented を見て譲るので二重に切り替わらない） */
    document.addEventListener("keydown", onKey, true);
  }

  return {
    /** 鍵を止める・戻す（書き出し中や画面の作り直しの間に使う） */
    setEnabled(v) { enabled = !!v; return enabled; },
    get enabled() { return enabled; },
    openHelp, openPalette, closeAll,
    /** 試験・検収用: この KeyboardEvent 相当が何に当たるか */
    keyOf(ev) { return eventKeyString(ev); },
    /** 外から 1 回だけ鍵を流し込む（通し試験が使う） */
    handleKey(ev) { return onKey(ev); },
    dispose() {
      if (dead) return true;
      dead = true;
      closeAll();
      if (typeof document !== "undefined") document.removeEventListener("keydown", onKey, true);
      return true;
    }
  };
}

/** 契約書 §7.4 の割当を文字で見たいとき（selftest.html と検収用） */
export function shortcutTable(mac) {
  return COMMANDS.filter((c) => c.keys.length).map((c) => ({
    id: c.id, title: c.title, group: c.group,
    keys: c.keys.slice(), label: describeKeys(c.keys, { mac: !!mac })
  }));
}

/** 鍵の文字列が表に在るか（打ち間違いの検め用） */
export function hasKey(key) {
  const k = normalizeKey(key);
  return !!k && keyMap(COMMANDS).has(k);
}

export default createShortcuts;
