/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/commands.js — 命令の表（1 か所）

   ★ 何をする所か
     編集ソフトの「できること」を **1 つの表**（COMMANDS）にまとめる所。
     ここに並べた物は ボタン（UI）からも 鍵（ui/shortcuts.js）からも
     命令一覧（コマンドパレット）からも AI からも **同じ形**で呼べる。
       { id, title, group, icon, keys, aliases, when(ctx), run(ctx), danger }
     ctx = { store, transport, ui, selection, project, widgets, … }（契約書 §7.4）

   ★ なぜこの形か
     ・「押せるか（when）」と「何をするか（run）」を 1 か所に置くと、
       ボタンの disabled と 鍵の可否が **食い違わない**。増やすときも 1 行で済む。
     ・run は必ず `runCommand()` を通して呼ぶ。危険な命令の確認・例外の
       トースト・最近使った物の記録をそこで 1 度だけ面倒見る。
     ・探し物（findCommands）・鍵の表記（describeKeys）・鍵の衝突検出
       （keyConflicts）は **純関数**にして Node の試験で守る（DOM を触らない）。
     ・日本語の題は読みで引けないので、各命令に **別名（aliases）**を持たせる
       （「分割」を「ぶんかつ / split / cut」で引ける）。片仮名と全角は
       normText() で平仮名・半角へ寄せるので、別名は平仮名で書けば足りる。

   ★ 触るときの注意
     ・ここは DOM を **モジュール読み込み時に触らない**（試験が Node で回る）。
       document を使うのは run の中だけ。widgets / 各画面は ctx から借り、
       無ければ穏やかに断る（画面を真っ白にしない）。
     ・鍵は `mod` で書く（mod = Windows/Linux の Ctrl・Mac の ⌘）。
       同じ鍵を 2 つの命令に付けるときは **同時に成り立たない条件**
       （EXCLUSIVE の組）にすること。そうでなければ試験が落ちる。
     ・貼り付けの控えは ui/timeline/toolbar.js とも分け合う
       （`vqs:clipboard` の CustomEvent。向こうの実装に合わせてある）。
     ・まだ書かれていない部品（export-dialog / ai-panel / settings / layout）は
       `part()` で探して、無ければトーストで知らせるだけにしてある。
     ・CONTRACT-NOTE: 共通前提の「1 ファイル 700 行で分ける」を超えている。
       中身は §7 の **表が 190 行以上の命令そのもの**（190 個近くある）で、
       分けるには担当外の新しいファイル（commands/table.js 等）が要る。
       担当は「この 3 ファイルだけ」なので、ここでは分けずに §ごとに区切った。
       分けるときの切り口は「§1〜§6 の道具」と「§7 の表」の 2 つ。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, deepClone } from "../core/util.js";
import { snapFrame, toTC, fromTC } from "../core/time.js";
import { findClip, clipEnd, projectDuration, RATIOS, MIN_CLIP } from "../core/schema.js";
import { warn } from "../core/log.js";

/* ══ §1 小道具（ctx から穏やかに読む）════════════════════════════ */

const EMPTY_PROJECT = Object.freeze({ tracks: [], assets: [], markers: [], chapters: [], settings: {} });
const EMPTY_SEL = Object.freeze({ clipIds: [], trackId: null, keyframe: null });
const RECENT_KEY = "vqstudio.commands.recent";
const RECENT_MAX = 24;

const store = (c) => (c && c.store && typeof c.store.dispatch === "function" ? c.store : null);
const proj = (c) => {
  const s = c && c.store ? c.store.project : null;
  const p = s || (c && c.project);
  return p && typeof p === "object" ? p : EMPTY_PROJECT;
};
const selOf = (c) => {
  const s = c && c.store ? c.store.selection : null;
  const x = s || (c && c.selection);
  return x && typeof x === "object" ? x : EMPTY_SEL;
};
const ids = (c) => { const a = selOf(c).clipIds; return Array.isArray(a) ? a.slice() : []; };
const hits = (c) => { const p = proj(c); return ids(c).map((id) => findClip(p, id)).filter(Boolean); };
const clipsOf = (c) => hits(c).map((f) => f.clip);
const first = (c) => { const h = hits(c); return h.length ? h[0] : null; };
/** 選択の中で条件に合う最初の 1 つ（無ければ先頭） */
const firstWhere = (c, test) => { const h = hits(c); return h.find((f) => test(f.clip)) || h[0] || null; };
const fpsOf = (c) => clamp(finite((proj(c).settings || {}).fps, 30), 1, 240);
const tp = (c) => (c && c.transport && typeof c.transport.seek === "function" ? c.transport : null);
const hasSrc = (cl) => !!cl && (cl.kind === "video" || cl.kind === "audio");
const tracksOf = (c) => { const t = proj(c).tracks; return Array.isArray(t) ? t : []; };
const settings = (c) => proj(c).settings || {};

/** 再生位置（store の view が正。無ければ transport の時刻） */
function head(c) {
  const s = c && c.store;
  const v = s && s.view;
  if (v && Number.isFinite(v.playhead)) return v.playhead;
  const t = tp(c);
  return t && Number.isFinite(t.time) ? t.time : 0;
}

/** 部品を探す（ctx.ui → ctx → app.parts の順。無ければ null） */
function part(c, name) {
  if (!c || !name) return null;
  const spots = [c.ui, c, c.parts, c.app && c.app.parts];
  for (const s of spots) {
    if (s && typeof s === "object" && s[name]) return s[name];
  }
  return null;
}

/** 知らせる（widgets.toast が在れば そこへ。無ければ log） */
function say(c, msg, kind) {
  const t = c && typeof c.toast === "function" ? c.toast : null;
  const w = c && c.widgets && typeof c.widgets.toast === "function" ? c.widgets.toast : null;
  try {
    if (t) return t(msg, { kind: kind || "info" });
    if (w) return w(msg, { kind: kind || "info" });
  } catch (e) { /* 出せなくても止めない */ }
  if (kind === "error" || kind === "warn") warn("commands", msg);
  return null;
}

const errMsg = (e) => String((e && e.message) || e || "原因不明");

/** op を 1 つ流す（失敗は throw のまま。runCommand が拾う） */
function dispatch(c, type, payload, label) {
  const s = store(c);
  if (!s) { say(c, "編集する場所がまだ在りません", "warn"); return null; }
  return s.dispatch(type, payload || {}, label ? { label } : undefined);
}
/** まとめて 1 取消単位（batch が無い store でも動く） */
function batch(c, label, fn) {
  const s = store(c);
  if (!s) { say(c, "編集する場所がまだ在りません", "warn"); return null; }
  if (typeof s.batch === "function") return s.batch(label, fn);
  return fn((t, p) => s.dispatch(t, p));
}
/** 選択それぞれに同じ op（1 つ失敗したら丸ごと戻る） */
function eachSel(c, label, type, build) {
  const list = hits(c);
  if (!list.length) { say(c, "クリップを選んでください", "warn"); return null; }
  return batch(c, label, (d) => { for (const f of list) d(type, build(f, c)); });
}
/** 設定を 1 つ書き換える */
const setSetting = (c, patch, label) => dispatch(c, "settings.update", { patch }, label);

/** 再生位置を動かす（transport が在ればそちら） */
function seek(c, t) {
  const v = Math.max(0, finite(t, 0));
  const T = tp(c);
  if (T) return T.seek(v);
  const s = c && c.store;
  if (s && typeof s.setView === "function") s.setView({ playhead: snapFrame(v, fpsOf(c)) });
  return v;
}
/** transport の口を穏やかに呼ぶ */
function tcall(c, name, args) {
  const T = c && c.transport;
  if (!T || typeof T[name] !== "function") { say(c, "再生の仕組みがまだ動いていません", "warn"); return null; }
  return T[name].apply(T, args || []);
}

/** 在れば呼ぶだけ（無くても知らせない。イン点のように store 側で足りる物） */
function tquiet(c, name, args) {
  const T = c && c.transport;
  if (!T || typeof T[name] !== "function") return null;
  try { return T[name].apply(T, args || []); } catch (e) { warn("commands", name, e); return null; }
}

/** 部品の口を呼ぶ（無ければ知らせるだけ） */
function open(c, name, method, arg, label) {
  const p = part(c, name);
  if (p && typeof p[method] === "function") { p[method](arg); return true; }
  say(c, (label || name) + "はまだ読み込めていません", "warn");
  return false;
}

/** 文字を訊く（widgets.openModal → 無ければ prompt）@returns {Promise<string|null>} */
function askText(c, title, value) {
  const W = c && c.widgets;
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || !W || typeof W.openModal !== "function") {
    try {
      const v = typeof globalThis.prompt === "function" ? globalThis.prompt(title, value || "") : null;
      return Promise.resolve(v == null ? null : String(v));
    } catch (e) { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    const wrap = doc.createElement("div");
    wrap.className = "vqs-cmd-ask";
    const input = doc.createElement("input");
    input.className = "vqs-cmd-ask__input";
    input.type = "text";
    input.value = value == null ? "" : String(value);
    input.setAttribute("aria-label", title);
    wrap.append(input);
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { m && m.close && m.close(); } catch (e) { /* 閉じ済み */ } resolve(v); };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(input.value); }
      if (ev.key === "Escape") { ev.preventDefault(); finish(null); }
    });
    const m = W.openModal({
      title, content: wrap,
      actions: [
        { label: "やめる", onClick: () => finish(null) },
        { label: "決定", primary: true, onClick: () => finish(input.value) }
      ]
    });
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* noop */ } }, 30);
  });
}

/** 危険な命令の確認（widgets.openModal → 無ければ confirm） */
export function confirmDanger(c, cmd) {
  const title = (cmd && cmd.title) || "この操作";
  const msg = title + "を実行します。取り消せないことがあります。よろしいですか？";
  const W = c && c.widgets;
  if (W && typeof W.openModal === "function" && typeof document !== "undefined") {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; try { m && m.close && m.close(); } catch (e) { /* noop */ } resolve(v); };
      const box = document.createElement("p");
      box.className = "vqs-cmd-confirm";
      box.textContent = msg;
      const m = W.openModal({
        title, content: box,
        actions: [
          { label: "やめる", onClick: () => end(false) },
          { label: "実行する", danger: true, primary: true, onClick: () => end(true) }
        ]
      });
    });
  }
  try {
    if (typeof globalThis.confirm === "function") return Promise.resolve(!!globalThis.confirm(msg));
  } catch (e) { /* noop */ }
  say(c, "確認が出せないため実行しませんでした", "warn");
  return Promise.resolve(false);
}

/* ══ §2 貼り付けの控え（timeline/toolbar.js と分け合う）══════════ */

let CLIP = [];
/** @returns {Object[]} 控えの中身（複製を返す） */
export function clipboard() { return CLIP.map((x) => deepClone(x)); }
export function setClipboard(list, spread) {
  CLIP = (Array.isArray(list) ? list : []).map((x) => deepClone(x)).filter(Boolean);
  if (spread !== false && typeof document !== "undefined") {
    try { document.dispatchEvent(new CustomEvent("vqs:clipboard", { detail: { clips: CLIP, from: "commands" } })); }
    catch (e) { /* 伝えられなくても控えは効く */ }
  }
  return CLIP.length;
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("vqs:clipboard", (e) => {
    const d = e && e.detail;
    if (!d || d.from === "commands" || !Array.isArray(d.clips)) return;
    CLIP = d.clips.map((x) => deepClone(x)).filter(Boolean);
  });
}
function copySel(c, cut) {
  const list = clipsOf(c);
  if (!list.length) { say(c, "クリップを選んでください", "warn"); return; }
  setClipboard(list.map((x) => deepClone(x)), true);
  if (cut) dispatch(c, "clip.remove", { clipIds: ids(c) }, "切り取り");
  say(c, list.length + " 個を" + (cut ? "切り取りました" : "複写しました"), "ok");
}
function pasteAt(c, mode) {
  if (!CLIP.length) { say(c, "貼り付ける物が控えに在りません", "warn"); return; }
  const trackId = selOf(c).trackId || null;
  const at = snapFrame(head(c), fpsOf(c));
  const payload = { clips: clipboard(), at };
  if (trackId) payload.trackId = trackId;
  const r = dispatch(c, mode === "insert" ? "timeline.insert" : "timeline.paste", payload, "貼り付け");
  if (r && Array.isArray(r.ids) && store(c)) store(c).select(r.ids);
}

/* ══ §3 鍵の文字列（mod = Ctrl / ⌘）════════════════════════════ */

const MOD_ORDER = ["mod", "ctrl", "meta", "alt", "shift"];
const BASE_ALIAS = {
  plus: "+", "=": "+", add: "+", minus: "-", _: "-", subtract: "-",
  esc: "escape", del: "delete", ins: "insert", ret: "enter", return: "enter",
  " ": "space", spacebar: "space", left: "arrowleft", right: "arrowright",
  up: "arrowup", down: "arrowdown", pgup: "pageup", pgdn: "pagedown",
  cmd: "mod", command: "mod", control: "ctrl", option: "alt", opt: "alt"
};
const BASE_LABEL = {
  space: "Space", enter: "Enter", escape: "Esc", tab: "Tab", delete: "Delete",
  backspace: "Backspace", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓",
  home: "Home", end: "End", pageup: "PgUp", pagedown: "PgDn", insert: "Ins"
};
const MOD_LABEL_PC = { mod: "Ctrl", ctrl: "Ctrl", meta: "Win", alt: "Alt", shift: "Shift" };
const MOD_LABEL_MAC = { mod: "⌘", ctrl: "⌃", meta: "⌘", alt: "⌥", shift: "⇧" };

/** Mac かどうか（navigator が無い所でも落ちない） */
export function isMac() {
  try {
    const n = globalThis.navigator;
    if (!n) return false;
    const s = String((n.userAgentData && n.userAgentData.platform) || n.platform || n.userAgent || "");
    return /mac|iphone|ipad|ipod/i.test(s);
  } catch (e) { return false; }
}

/** 1 文字の印字可能な記号か（"?" のように shift で出る物は shift を書かない） */
const isSymbol = (b) => b.length === 1 && !/[a-z0-9]/.test(b);

/**
 * 鍵の文字列を正規形へ（"Shift+Mod+Z" → "mod+shift+z"）。
 * @param {string} key @returns {string} 読めなければ ""
 */
export function normalizeKey(key) {
  const p = parseKey(key);
  return p ? p.id : "";
}

/**
 * 鍵の文字列を分解する（純関数）。
 * @param {string} key @returns {{mod:boolean,ctrl:boolean,meta:boolean,alt:boolean,
 *   shift:boolean,base:string,id:string}|null}
 */
export function parseKey(key) {
  const raw = String(key == null ? "" : key).trim().toLowerCase();
  if (!raw) return null;
  const tokens = raw === "+" ? ["+"] : raw.split("+").map((s) => s.trim()).filter((s) => s !== "");
  if (!tokens.length) return null;
  const out = { mod: false, ctrl: false, meta: false, alt: false, shift: false, base: "" };
  for (const t0 of tokens) {
    const t = BASE_ALIAS[t0] || t0;
    if (t === "mod" || t === "ctrl" || t === "meta" || t === "alt" || t === "shift") { out[t] = true; continue; }
    out.base = t;
  }
  if (!out.base) return null;
  if (isSymbol(out.base)) out.shift = false;          // "?" は shift 抜きで表す
  const mods = MOD_ORDER.filter((m) => out[m]);
  out.id = mods.concat([out.base]).join("+");
  return out;
}

/**
 * KeyboardEvent → 鍵の文字列（正規形）。ui/shortcuts.js の入口。
 * 修飾キー単体（Shift だけ等）は "" を返す。
 * @param {Object} ev KeyboardEvent 相当（key / ctrlKey / metaKey / altKey / shiftKey）
 * @param {{mac?:boolean}} [opts] @returns {string}
 */
export function eventKeyString(ev, opts) {
  if (!ev) return "";
  const mac = opts && "mac" in opts ? !!opts.mac : isMac();
  const raw = String(ev.key == null ? "" : ev.key);
  if (!raw) return "";
  let base = raw.length === 1 ? raw.toLowerCase() : raw.toLowerCase();
  base = BASE_ALIAS[base] || base;
  if (base === "mod" || base === "ctrl" || base === "meta" || base === "alt" || base === "shift" ||
      base === "capslock" || base === "dead" || base === "unidentified") return "";
  const parts = [];
  if (mac ? ev.metaKey : ev.ctrlKey) parts.push("mod");
  if (mac ? ev.ctrlKey : ev.metaKey) parts.push(mac ? "ctrl" : "meta");
  if (ev.altKey) parts.push("alt");
  if (ev.shiftKey && !isSymbol(base)) parts.push("shift");
  return MOD_ORDER.filter((m) => parts.indexOf(m) >= 0).concat([base]).join("+");
}

/**
 * 鍵の表記（契約書 §7.4 の見せ方）。"mod+z" → "Ctrl+Z"（Mac は "⌘Z"）。
 * 配列を渡すと " / " で連ねる。
 * @param {string|string[]} keys @param {{mac?:boolean}} [opts] @returns {string}
 */
export function describeKeys(keys, opts) {
  const mac = opts && "mac" in opts ? !!opts.mac : isMac();
  const list = Array.isArray(keys) ? keys : (keys == null || keys === "" ? [] : [keys]);
  const out = [];
  for (const k of list) {
    const p = parseKey(k);
    if (!p) continue;
    const table = mac ? MOD_LABEL_MAC : MOD_LABEL_PC;
    const mods = MOD_ORDER.filter((m) => p[m]).map((m) => table[m]);
    const base = BASE_LABEL[p.base] || (p.base.length === 1 ? p.base.toUpperCase() : p.base.toUpperCase());
    out.push(mac ? mods.join("") + base : mods.concat([base]).join("+"));
  }
  return out.join(" / ");
}

/** 命令 id → 一番目の鍵（正規形）。無ければ "" */
export function keyFor(id) {
  const cmd = commandById(id);
  return cmd && cmd.keys.length ? cmd.keys[0] : "";
}
/** 命令 id → 見せる鍵（"Ctrl+Z"）。無ければ "" */
export function keyLabelFor(id, opts) {
  const cmd = commandById(id);
  return cmd ? describeKeys(cmd.keys, opts) : "";
}

/* ══ §4 探す（findCommands は純関数）════════════════════════════ */

/** 片仮名 → 平仮名・全角 → 半角・小文字・空白落とし */
export function normText(s) {
  let t = String(s == null ? "" : s);
  try { t = t.normalize("NFKC"); } catch (e) { /* 古い器は そのまま */ }
  t = t.toLowerCase().replace(/[\s　]+/g, "");
  return t.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

const TIER = { exact: 1000, prefix: 800, partial: 600 };
const FIELD = { title: 1, id: 0.96, alias: 0.55, group: 0.3 };

function tierOf(hay, q) {
  if (!hay || !q) return 0;
  if (hay === q) return TIER.exact;
  if (hay.indexOf(q) === 0) return TIER.prefix;
  return hay.indexOf(q) >= 0 ? TIER.partial : 0;
}

/**
 * 命令 1 つの点数（純関数・試験する）。
 * 完全一致 > 前方一致 > 部分一致 > 別名 の順になるよう、
 * 「段（tier）× 場（field）」で決める。
 * @param {Object} cmd @param {string} query 正規化前で良い @returns {number}
 */
export function scoreCommand(cmd, query) {
  if (!cmd) return 0;
  const q = normText(query);
  if (!q) return 0;
  const s = cmd.search || buildSearch(cmd);
  let best = tierOf(s.title, q) * FIELD.title;
  best = Math.max(best, tierOf(s.id, q) * FIELD.id);
  for (const a of s.aliases) best = Math.max(best, tierOf(a, q) * FIELD.alias);
  best = Math.max(best, tierOf(s.group, q) * FIELD.group);
  return Math.round(best);
}

function buildSearch(cmd) {
  return {
    title: normText(cmd.title),
    id: normText(cmd.id),
    group: normText((GROUPS[cmd.group] && GROUPS[cmd.group].label) || cmd.group),
    aliases: (cmd.aliases || []).map(normText).filter(Boolean)
  };
}

/** when を安全に確かめる（throw したら「今はできない」扱い） */
export function isEnabled(cmd, ctx) {
  if (!cmd || typeof cmd.when !== "function") return true;
  try { return !!cmd.when(ctx || {}); } catch (e) { warn("commands", cmd.id + " の when が失敗", e); return false; }
}

/**
 * 命令を探す（順位つき・純関数）。
 * @param {string} query 空なら全部（最近使った物が上）
 * @param {{commands?:Object[], ctx?:Object, limit?:number, recent?:string[],
 *          all?:boolean}} [opts]
 * @returns {Object[]} COMMANDS の要素（点数の高い順）
 */
export function findCommands(query, opts) {
  const o = opts || {};
  const src = Array.isArray(o.commands) ? o.commands : COMMANDS;
  const recent = Array.isArray(o.recent) ? o.recent : [];
  const q = normText(query);
  const rows = [];
  for (let i = 0; i < src.length; i++) {
    const cmd = src[i];
    if (!cmd || !cmd.id) continue;
    if (o.ctx && !o.all && !isEnabled(cmd, o.ctx)) continue;
    const base = q ? scoreCommand(cmd, q) : 0;
    if (q && base <= 0) continue;
    const r = recent.indexOf(cmd.id);
    const bonus = r >= 0 ? Math.max(1, 60 - r * 4) : 0;
    rows.push({ cmd, score: base + bonus, recent: r < 0 ? 9999 : r, len: cmd.title.length, i });
  }
  rows.sort((a, b) => (b.score - a.score) || (a.recent - b.recent) || (a.len - b.len) || (a.i - b.i));
  const lim = finite(o.limit, 0);
  return (lim > 0 ? rows.slice(0, lim) : rows).map((x) => x.cmd);
}

/* ══ §5 条件（when）════════════════════════════════════════════ */

/* 同じ鍵を分け合って良いのは「同時に成り立たない条件」だけ（keyConflicts が見る） */
export const EXCLUSIVE = Object.freeze([
  ["user", "anon"], ["desktop", "mobile"], ["playing", "paused"]
]);

const auth = (c) => (c && c.auth) || null;
const authStatus = (c) => { const a = auth(c); const s = a && a.state; return (s && s.status) || "anon"; };
const markersOf = (c) => { const m = proj(c).markers; return Array.isArray(m) ? m : []; };

export const WHEN = Object.freeze({
  always: () => true,
  store: (c) => !!store(c),
  sel: (c) => ids(c).length > 0,
  sel1: (c) => ids(c).length === 1,
  sel2: (c) => ids(c).length >= 2,
  src: (c) => clipsOf(c).some(hasSrc),
  video: (c) => clipsOf(c).some((x) => x.kind === "video"),
  text: (c) => clipsOf(c).some((x) => x.kind === "text"),
  grouped: (c) => clipsOf(c).some((x) => !!x.groupId),
  linked: (c) => clipsOf(c).some((x) => !!x.linkedId),
  compound: (c) => clipsOf(c).some((x) => x.kind === "compound"),
  splitable: (c) => splitTargets(c).length > 0,
  clipboard: () => CLIP.length > 0,
  undo: (c) => !!store(c) && !!store(c).canUndo && store(c).canUndo(),
  redo: (c) => !!store(c) && !!store(c).canRedo && store(c).canRedo(),
  keyed: (c) => !!selOf(c).keyframe,
  marker: (c) => markersOf(c).length > 0,
  track: (c) => tracksOf(c).length > 0,
  range: (c) => { const v = (c && c.store && c.store.view) || {}; return v.inPoint != null || v.outPoint != null; },
  user: (c) => authStatus(c) === "user",
  anon: (c) => authStatus(c) !== "user",
  authApi: (c) => !!auth(c)
});

/** 再生位置で割れるクリップ（選択が在ればその中から） */
function splitTargets(c) {
  const t = head(c);
  const list = ids(c).length ? clipsOf(c) : allClips(c);
  return list.filter((cl) => !cl.locked && cl.start < t - MIN_CLIP && clipEnd(cl) > t + MIN_CLIP);
}
function allClips(c) {
  const out = [];
  for (const tr of tracksOf(c)) {
    if (!tr || tr.locked || !Array.isArray(tr.clips)) continue;
    for (const cl of tr.clips) if (cl) out.push(cl);
  }
  return out;
}
/** クリップの継ぎ目（次/前の編集点）の一覧 */
function edges(c) {
  const set = new Set([0]);
  for (const cl of allClips(c)) { set.add(+cl.start.toFixed(6)); set.add(+clipEnd(cl).toFixed(6)); }
  return Array.from(set).sort((a, b) => a - b);
}

/* ══ §6 run の部品 ════════════════════════════════════════════ */

function doSplit(c) {
  const t = snapFrame(head(c), fpsOf(c));
  const targets = splitTargets(c);
  if (!targets.length) { say(c, "再生位置に割れるクリップが在りません", "warn"); return; }
  const out = batch(c, "分割", (d) => { for (const cl of targets) d("clip.split", { clipId: cl.id, t }); });
  say(c, targets.length + " 個を分割しました", "ok");
  return out;
}
/** 頭（start）または尻（end）を再生位置まで詰める */
function trimToHead(c, edge) {
  const t = head(c);
  const list = hits(c).length ? hits(c) : allClips(c).map((cl) => findClip(proj(c), cl.id)).filter(Boolean);
  const targets = list.filter((f) => f.clip.start < t && clipEnd(f.clip) > t);
  if (!targets.length) { say(c, "再生位置に掛かるクリップが在りません", "warn"); return; }
  return batch(c, edge === "start" ? "頭を詰める" : "尻を詰める", (d) => {
    for (const f of targets) {
      const delta = edge === "start" ? t - f.clip.start : clipEnd(f.clip) - t;
      d("clip.trim", { clipId: f.clip.id, edge, delta, ripple: edge === "start" });
    }
  });
}
/** クリップを別の層（トラック）へ移す。dir>0 で前面（上） */
function layerMove(c, dir, toEnd) {
  const f = first(c);
  if (!f) { say(c, "クリップを選んでください", "warn"); return; }
  const list = tracksOf(c);
  const same = list.filter((tr) => tr.kind === f.track.kind && !tr.locked);
  const i = same.indexOf(f.track);
  let dest = null;
  if (toEnd) dest = dir > 0 ? same[same.length - 1] : same[0];
  else dest = same[i + (dir > 0 ? 1 : -1)] || null;
  if (!dest || dest === f.track) {
    if (dir > 0) {
      return batch(c, "前面へ", (d) => {
        const r = d("track.add", { kind: f.track.kind, index: list.length });
        d("clip.move", { clipId: f.clip.id, trackId: r.trackId, start: f.clip.start, mode: "overwrite" });
      });
    }
    say(c, "これ以上動かせません", "warn");
    return;
  }
  return dispatch(c, "clip.move", { clipId: f.clip.id, trackId: dest.id, start: f.clip.start, mode: "overwrite" },
    dir > 0 ? "前面へ" : "背面へ");
}
/** 選択の頭・中央・尻を再生位置へ揃える */
function alignTo(c, mode) {
  const t = snapFrame(head(c), fpsOf(c));
  return eachSel(c, "整列", "clip.move", (f) => {
    const d = f.clip.duration;
    const start = mode === "end" ? Math.max(0, t - d) : (mode === "center" ? Math.max(0, t - d / 2) : t);
    return { clipId: f.clip.id, start, mode: "overwrite" };
  });
}
/** 音量・不透明度を段で上下 */
function nudgeValue(c, field, mul, add) {
  return eachSel(c, field === "volume" ? "音量" : "不透明度", "clip.update", (f) => {
    const cur = finite(f.clip[field], 1);
    const v = clamp(mul ? cur * mul : cur + add, 0, field === "volume" ? 4 : 1);
    const patch = {};
    patch[field] = Math.round(v * 1000) / 1000;
    return { clipIds: [f.clip.id], patch };
  });
}
/** フェード（音）を付ける */
function fade(c, where, sec) {
  return eachSel(c, "フェード", "clip.update", (f) => {
    const cur = (f.clip.audioFade && typeof f.clip.audioFade === "object") ? f.clip.audioFade : {};
    const patch = { audioFade: { curve: cur.curve || "linear" } };
    const d = Math.min(finite(sec, 0.5), Math.max(0, f.clip.duration / 2));
    if (where === "in" || where === "both") patch.audioFade.in = d;
    if (where === "out" || where === "both") patch.audioFade.out = d;
    return { clipIds: [f.clip.id], patch };
  });
}
/** キーフレームを打つ／消す */
function keyAt(c, path, remove) {
  const f = first(c);
  if (!f) { say(c, "クリップを選んでください", "warn"); return; }
  const t = clamp(head(c) - f.clip.start, 0, Math.max(MIN_CLIP, f.clip.duration));
  const paths = path ? [path] : keyPathsOf(f.clip);
  if (!paths.length) { say(c, "打てるキーフレームが在りません", "warn"); return; }
  return batch(c, remove ? "キーフレームを消す" : "キーフレームを打つ", (d) => {
    for (const p of paths) d(remove ? "key.remove" : "key.add", { clipId: f.clip.id, path: p, t });
  });
}
function keyPathsOf(clip) {
  const k = clip && clip.keys && typeof clip.keys === "object" ? Object.keys(clip.keys) : [];
  if (k.length) return k;
  return clip && clip.kind === "audio" ? ["volume"] : ["opacity"];
}
/** 次／前のキーフレームへ */
function keyStep(c, dir) {
  const f = first(c);
  if (!f) return;
  const k = f.clip.keys && typeof f.clip.keys === "object" ? f.clip.keys : {};
  const times = [];
  for (const p of Object.keys(k)) for (const key of (Array.isArray(k[p]) ? k[p] : [])) {
    if (key && Number.isFinite(key.t)) times.push(f.clip.start + key.t);
  }
  if (!times.length) { say(c, "キーフレームが在りません", "warn"); return; }
  times.sort((a, b) => a - b);
  const t = head(c);
  const next = dir > 0 ? times.find((x) => x > t + 1e-4) : times.slice().reverse().find((x) => x < t - 1e-4);
  if (next == null) { say(c, dir > 0 ? "これより後に在りません" : "これより前に在りません", "warn"); return; }
  seek(c, next);
}
/** 印（マーカー）を辿る */
function markerStep(c, dir) {
  const list = markersOf(c).map((m) => finite(m.t, 0)).sort((a, b) => a - b);
  if (!list.length) { say(c, "印が在りません", "warn"); return; }
  const t = head(c);
  const next = dir > 0 ? list.find((x) => x > t + 1e-4) : list.slice().reverse().find((x) => x < t - 1e-4);
  if (next == null) { say(c, "これ以上 印が在りません", "warn"); return; }
  seek(c, next);
}
/** 継ぎ目を辿る */
function edgeStep(c, dir) {
  const list = edges(c);
  const t = head(c);
  const next = dir > 0 ? list.find((x) => x > t + 1e-4) : list.slice().reverse().find((x) => x < t - 1e-4);
  seek(c, next == null ? (dir > 0 ? projectDuration(proj(c)) : 0) : next);
}
/** J / L の押し続けで加速（ctx.hold は ui/shortcuts.js が渡す） */
function playDir(c, dir) {
  const hold = clamp(Math.round(finite(c && c.hold, 1)), 1, 4);
  const mul = [1, 2, 4, 8][hold - 1];
  tcall(c, "setRate", [dir * mul]);
  const T = c && c.transport;
  if (T && !T.playing && typeof T.play === "function") T.play();
  say(c, (dir < 0 ? "逆再生 " : "早送り ") + mul + "倍", "info");
}
/** 倍率を上げ下げ */
function rateStep(c, mul, reset) {
  const T = c && c.transport;
  const cur = T && Number.isFinite(T.rate) ? T.rate : 1;
  tcall(c, "setRate", [reset ? 1 : clamp(cur * mul, -8, 8) || 1]);
}
/** ズーム（timeline/view.js が在れば pxPerSec、無ければ view.zoom） */
function zoom(c, mul, fit) {
  const v = part(c, "tlView");
  if (fit) {
    if (v && typeof v.fitToWindow === "function") { v.fitToWindow(); return; }
    say(c, "タイムラインがまだ在りません", "warn");
    return;
  }
  if (v && typeof v.setZoom === "function") { v.setZoom(clamp(finite(v.zoom, 80) * mul, 2, 800)); return; }
  const s = c && c.store;
  if (s && typeof s.setView === "function") {
    s.setView({ zoom: clamp(finite(s.view && s.view.zoom, 1) * mul, 0.02, 800) });
  }
}
/** トラックの高さをまとめて変える */
function trackHeight(c, mul) {
  const list = tracksOf(c);
  if (!list.length) { say(c, "トラックが在りません", "warn"); return; }
  const sel = selOf(c).trackId;
  const targets = sel ? list.filter((t) => t.id === sel) : list;
  return batch(c, "トラックの高さ", (d) => {
    for (const t of targets) d("track.update", { trackId: t.id, patch: { height: clamp(Math.round(finite(t.height, 72) * mul), 28, 400) } });
  });
}
/** タイムラインの見せ方（波形・サムネ）。timeline/toolbar.js と同じ置き場 */
function tlDisplay(c, key) {
  const lsKey = "vqstudio.tl." + key;
  let on = true;
  try { on = globalThis.localStorage.getItem(lsKey) !== "off"; } catch (e) { /* 読めない器 */ }
  const next = !on;
  try { globalThis.localStorage.setItem(lsKey, next ? "on" : "off"); } catch (e) { /* 保存できなくて良い */ }
  if (typeof document !== "undefined") {
    const pane = document.getElementById("timelinePane");
    if (pane) pane.setAttribute("data-" + key, next ? "on" : "off");
    try { document.dispatchEvent(new CustomEvent("vqs:tl-display", { detail: { key, on: next } })); } catch (e) { /* noop */ }
  }
  say(c, (key === "waveform" ? "波形" : "サムネ") + "を" + (next ? "出しました" : "隠しました"), "ok");
}
/* 補助線の今の段（preview は今の値を出してくれないのでここで覚える）。
   CONTRACT-NOTE: preview.js の GRID_MODES と同じ並びにしてある。 */
const GRID_STEPS = ["none", "thirds", "grid9"];
let gridStep = 0, centerOn = false;

/** プレビューの補助線 */
function guides(c, patch) {
  const pv = part(c, "preview");
  if (pv && typeof pv.setGuides === "function") { pv.setGuides(patch); return true; }
  say(c, "プレビューがまだ在りません", "warn");
  return false;
}
/** パネルの開閉（layout.js が在ればそちらに任せる） */
function togglePane(c, name, elId) {
  const L = part(c, "layout");
  if (L && typeof L.toggle === "function") { L.toggle(name); return; }
  if (typeof document === "undefined") return;
  const el = document.getElementById(elId);
  if (!el) { say(c, "その場所が在りません", "warn"); return; }
  const on = el.classList.toggle("vqs-pane--collapsed");
  /* CSS 担当が居なくても閉じる（class は CSS 担当が飾れるように残す） */
  el.style.display = on ? "none" : "";
  el.setAttribute("aria-hidden", on ? "true" : "false");
}
/** 全画面（transport のボタンが在れば押す = 実装を 1 つに保つ） */
function fullscreen(c) {
  if (typeof document !== "undefined") {
    const b = document.querySelector('[data-test="tr-fullscreen"]');
    if (b && typeof b.click === "function") { b.click(); return; }
    const node = document.getElementById("center") || document.getElementById("previewWrap");
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (node && node.requestFullscreen) {
      const p = node.requestFullscreen({ navigationUI: "hide" });
      if (p && p.catch) p.catch(() => pseudoFs(node));
      return;
    }
    if (node && node.webkitRequestFullscreen) { node.webkitRequestFullscreen(); return; }
    if (node) pseudoFs(node);                       // iPhone はここ（契約書 §13.4）
    return;
  }
  say(c, "全画面にできません", "warn");
}
function pseudoFs(node) {
  const on = node.classList.toggle("vqs-fs-fake");
  document.documentElement.classList.toggle("vqs-fs-lock", on);
  node.style.cssText = on
    ? "position:fixed;left:0;right:0;top:0;bottom:0;z-index:80;background:#000;height:100dvh;margin:0"
    : "";
}
/** 素材を書き出す（画面が在ればそれに任せ、無ければ直に作って渡す） */
async function exportVia(c, tab, direct) {
  const dlg = part(c, "exportDialog");
  if (dlg && typeof dlg.open === "function") { dlg.open({ tab }); return; }
  const ex = (c && c.exporter) || null;
  if (!ex || !direct) { say(c, "書き出しの画面がまだ読み込めていません", "warn"); return; }
  say(c, "書き出しています…", "info");
  const out = await direct(ex, proj(c), c);
  const blob = out && out.blob ? out.blob : out;
  const name = (out && out.filename) || ((proj(c).name || "vqstudio") + "." + tab);
  if (!blob) { say(c, "書き出す物が在りませんでした", "warn"); return; }
  if (typeof ex.deliver === "function") await ex.deliver(blob, name);
  say(c, "書き出しました", "ok");
}
/** 自動編集の道具（ai/tools.js）を 1 つ当てる */
async function autoTool(c, fn, opts, label) {
  const tools = c && c.ai && c.ai.tools ? c.ai.tools : null;
  if (!tools || typeof tools[fn] !== "function") { say(c, label + "の道具がまだ読み込めていません", "warn"); return; }
  const o = Object.assign({}, opts || {});
  if (ids(c).length) o.clipIds = ids(c);
  const res = tools[fn](proj(c), o);
  const ops = res && Array.isArray(res.ops) ? res.ops : [];
  if (!ops.length) { say(c, (res && res.summary) || (label + "で変える所が在りませんでした"), "warn"); return; }
  batch(c, label, (d) => { for (const op of ops) d(op.type, op.payload); });
  say(c, (res && res.summary) || (label + "を当てました"), "ok");
  for (const w of (res && res.warnings) || []) say(c, w, "warn");
}
/** アカウントの画面へ（settings → auth 画面の順に探す） */
function account(c, view) {
  const s = part(c, "settings");
  if (s && typeof s.openAccount === "function" && view === "profile") { s.openAccount(); return; }
  const a = part(c, "authScreen");
  if (a && typeof a.show === "function") { a.show(view); return; }
  const app = c && c.app;
  if (app && typeof app.openAuth === "function") { app.openAuth(view); return; }
  say(c, "アカウントの画面がまだ読み込めていません", "warn");
}

/* ══ §7 命令の表 ══════════════════════════════════════════════ */

export const GROUPS = Object.freeze({
  file: { label: "ファイル", icon: "file", order: 1 },
  edit: { label: "編集", icon: "edit", order: 2 },
  clip: { label: "クリップ", icon: "film", order: 3 },
  key: { label: "キーフレーム", icon: "key", order: 4 },
  play: { label: "再生", icon: "play", order: 5 },
  view: { label: "表示", icon: "eye", order: 6 },
  marker: { label: "マーカー", icon: "marker", order: 7 },
  auto: { label: "自動編集", icon: "ai", order: 8 },
  tool: { label: "道具", icon: "cursor", order: 9 },
  account: { label: "アカウント", icon: "user", order: 10 },
  help: { label: "ヘルプ", icon: "help", order: 11 }
});

/**
 * 命令を 1 つ作る（表の 1 行）。
 * @param {string} id @param {string} title 日本語 @param {string} group @param {string} icon
 * @param {string|string[]} keys "mod+z" 等 @param {string} aliases 空白区切りの読み・英語
 * @param {string} cond WHEN の名前 @param {Function} run @param {boolean} [danger]
 */
function C(id, title, group, icon, keys, aliases, cond, run, danger) {
  const list = (Array.isArray(keys) ? keys : (keys ? [keys] : [])).map(normalizeKey).filter(Boolean);
  const whenId = WHEN[cond] ? cond : "always";
  const cmd = {
    id, title, group, icon: icon || (GROUPS[group] && GROUPS[group].icon) || "dot",
    keys: Object.freeze(list),
    aliases: Object.freeze(String(aliases || "").split(/\s+/).filter(Boolean)),
    whenId, when: WHEN[whenId], run, danger: !!danger
  };
  cmd.search = buildSearch(cmd);
  return Object.freeze(cmd);
}

/** 全ての命令（契約書 §7.4。ここに足せば UI・鍵・AI の全部から呼べる） */
export const COMMANDS = Object.freeze([
  /* ── ファイル ─────────────────────────────────────────────── */
  C("file.new", "新しいプロジェクト", "file", "plus", "mod+alt+n", "しんき あたらしい new project", "always",
    (c) => open(c, "app", "newProject", {}, "プロジェクトの作成")),
  C("file.open", "プロジェクトを開く", "file", "folder", "mod+o", "ひらく open いちらん", "always",
    (c) => open(c, "app", "goHome", null, "一覧")),
  C("file.save", "保存", "file", "save", "mod+s", "ほぞん save", "always",
    (c) => open(c, "app", "save", null, "保存")),
  C("file.export", "書き出し", "file", "download", "mod+e", "かきだし export しゅつりょく", "always",
    (c) => exportVia(c, "video", null)),
  C("file.exportStill", "現在フレームを画像で書き出す", "file", "image", "mod+shift+e", "しずがぞう png jpeg screenshot", "always",
    (c) => exportVia(c, "png", (ex, p, cc) => ex.exportStill(p, head(cc), { type: "image/png" }))),
  C("file.exportSequence", "連番画像で書き出す", "file", "image", "", "れんばん sequence", "always",
    (c) => exportVia(c, "png", (ex, p) => ex.exportStillSequence(p, {}))),
  C("file.exportAudio", "音声だけ書き出す", "file", "music", "", "おんせい wav audio", "always",
    (c) => exportVia(c, "wav", (ex, p) => ex.exportAudio(p, { format: "wav" }))),
  C("file.exportGif", "GIF で書き出す", "file", "gif", "", "gif あにめ", "always",
    (c) => exportVia(c, "gif", (ex, p) => ex.exportGif(p, {}))),
  C("file.exportSrt", "字幕を SRT で書き出す", "file", "captions", "", "じまく srt subtitle", "always",
    (c) => exportVia(c, "srt", (ex, p) => ex.exportSubtitles(p, { format: "srt" }))),
  C("file.exportVtt", "字幕を VTT で書き出す", "file", "captions", "", "じまく vtt subtitle", "always",
    (c) => exportVia(c, "vtt", (ex, p) => ex.exportSubtitles(p, { format: "vtt" }))),
  C("file.exportEdl", "編集内容（EDL）を書き出す", "file", "code", "", "edl json へんしゅうないよう", "always",
    (c) => exportVia(c, "json", (ex, p) => ex.exportEDL(p))),
  C("file.exportProject", "プロジェクトを書き出す（.vqstudio）", "file", "package", "mod+shift+s", "ぷろじぇくと vqstudio backup", "always",
    (c) => exportVia(c, "vqstudio", (ex, p) => ex.exportProject(p, { includeAssets: true }))),
  C("file.importProject", "プロジェクトを読み込む", "file", "upload", "", "よみこみ import vqstudio", "always",
    (c) => open(c, "importer", "pickFiles", { accept: ".vqstudio" }, "読み込み")),
  C("file.import", "素材を読み込む", "file", "upload", "mod+i", "そざい とりこみ import media", "always",
    (c) => open(c, "importer", "pickFiles", null, "取り込み")),
  C("file.importSubtitles", "字幕を読み込む", "file", "captions", "", "じまく srt vtt よみこみ", "store",
    async (c) => {
      const text = await askText(c, "字幕（SRT / VTT）を貼り付けてください", "");
      if (text) dispatch(c, "subtitle.import", { text }, "字幕の読み込み");
    }),
  C("file.settings", "プロジェクトの設定", "file", "settings", "mod+,", "せってい settings かんきょう", "always",
    (c) => { if (!open(c, "inspector", "setTab", "project", "設定")) open(c, "settings", "openSettings", "edit", "設定"); }),
  C("file.rename", "プロジェクト名を変える", "file", "edit", "", "なまえ rename", "store",
    async (c) => { const n = await askText(c, "プロジェクト名", proj(c).name); if (n) dispatch(c, "project.rename", { name: n }, "名前"); }),

  /* ── 編集 ─────────────────────────────────────────────────── */
  C("edit.undo", "取り消し", "edit", "undo", "mod+z", "とりけし もどす undo", "undo", (c) => store(c).undo()),
  C("edit.redo", "やり直し", "edit", "redo", ["mod+shift+z", "mod+y"], "やりなおし redo", "redo", (c) => store(c).redo()),
  C("edit.cut", "切り取り", "edit", "cut", "mod+x", "きりとり cut", "sel", (c) => copySel(c, true)),
  C("edit.copy", "複写", "edit", "copy", "mod+c", "こぴー ふくしゃ copy", "sel", (c) => copySel(c, false)),
  C("edit.paste", "貼り付け", "edit", "paste", "mod+v", "はりつけ paste", "clipboard", (c) => pasteAt(c, "paste")),
  C("edit.pasteInsert", "差し込んで貼り付け", "edit", "paste", "mod+shift+v", "さしこみ insert paste", "clipboard",
    (c) => pasteAt(c, "insert")),
  C("edit.duplicate", "複製", "edit", "duplicate", "mod+d", "ふくせい duplicate", "sel",
    (c) => dispatch(c, "clip.duplicate", { clipIds: ids(c) }, "複製")),
  C("edit.delete", "削除", "edit", "trash", ["delete", "backspace"], "さくじょ けす delete", "sel",
    (c) => dispatch(c, "clip.remove", { clipIds: ids(c) }, "削除")),
  C("edit.rippleDelete", "詰めて削除", "edit", "trash", ["shift+delete", "shift+backspace"], "つめてさくじょ ripple", "sel",
    (c) => dispatch(c, "clip.rippleDelete", { clipIds: ids(c) }, "詰めて削除")),
  C("edit.selectAll", "全て選択", "edit", "select", "mod+a", "ぜんせんたく select all", "store",
    (c) => store(c).select(allClips(c).map((x) => x.id))),
  C("edit.deselect", "選択を解除", "edit", "select", ["mod+shift+a", "escape"], "せんたくかいじょ deselect", "sel",
    (c) => store(c).select([])),
  C("edit.selectTrack", "このトラックを全て選択", "edit", "select", "", "とらっくせんたく select track", "store",
    (c) => {
      const tid = selOf(c).trackId || (first(c) && first(c).track.id);
      const tr = tracksOf(c).find((t) => t.id === tid);
      if (!tr) { say(c, "トラックを選んでください", "warn"); return; }
      store(c).select((tr.clips || []).map((x) => x.id), { trackId: tr.id });
    }),
  C("edit.selectForward", "この先を全て選択", "edit", "select", "", "いこう select forward", "store",
    (c) => { const t = head(c); store(c).select(allClips(c).filter((x) => x.start >= t - 1e-4).map((x) => x.id)); }),
  C("edit.rename", "クリップの名前を変える", "edit", "edit", "f2", "なまえ rename", "sel1",
    async (c) => {
      const f = first(c);
      const n = await askText(c, "クリップの名前", f.clip.name || "");
      if (n != null) dispatch(c, "clip.update", { clipIds: [f.clip.id], patch: { name: n } }, "名前");
    }),
  C("edit.lock", "クリップに鍵を掛ける", "edit", "lock", "", "かぎ ろっく lock", "sel",
    (c) => eachSel(c, "鍵", "clip.update", (f) => ({ clipIds: [f.clip.id], patch: { locked: !f.clip.locked } }))),
  C("edit.hide", "クリップを隠す", "edit", "eye", "", "かくす hide", "sel",
    (c) => eachSel(c, "表示", "clip.update", (f) => ({ clipIds: [f.clip.id], patch: { hidden: !f.clip.hidden } }))),
  C("edit.closeGaps", "隙間を詰める", "edit", "magnet", "", "すきま つめる close gap", "store",
    (c) => dispatch(c, "timeline.magneticClose", {}, "隙間を詰める")),
  C("edit.history", "変更の履歴", "edit", "history", "", "りれき history", "store",
    (c) => {
      const list = (store(c).history() || []).slice(-30).reverse();
      say(c, list.length ? "直近: " + list.slice(0, 5).map((x) => x.label).join(" / ") : "履歴は空です", "info");
    }),
  C("edit.clearTimeline", "タイムラインを全部消す", "edit", "trash", "", "ぜんさくじょ すべてけす clear", "store",
    (c) => batch(c, "全部消す", (d) => { for (const cl of allClips(c)) d("clip.remove", { clipIds: [cl.id] }); }), true),
  C("edit.removeUnusedAssets", "使っていない素材を捨てる", "edit", "trash", "", "みしよう そざい cleanup", "store",
    (c) => {
      const used = new Set(allClips(c).map((x) => x.assetId).filter(Boolean));
      const gone = (proj(c).assets || []).filter((a) => !used.has(a.id));
      if (!gone.length) { say(c, "使っていない素材は在りません", "info"); return; }
      batch(c, "素材を捨てる", (d) => { for (const a of gone) d("asset.remove", { assetId: a.id }); });
    }, true),

  /* ── クリップ ─────────────────────────────────────────────── */
  C("clip.split", "分割", "clip", "razor", ["s", "mod+b"], "ぶんかつ わける split cut razor", "splitable", doSplit),
  C("clip.trimStart", "頭を再生位置まで詰める", "clip", "trimStart", "q", "あたま とりむ trim in", "store",
    (c) => trimToHead(c, "start")),
  C("clip.trimEnd", "尻を再生位置まで詰める", "clip", "trimEnd", "w", "しり とりむ trim out", "store",
    (c) => trimToHead(c, "end")),
  C("clip.speedPanel", "速度を調整する", "clip", "speed", "mod+r", "そくど はやさ speed", "src",
    (c) => open(c, "inspector", "setTab", "speed", "速度")),
  C("clip.speed025", "速度 0.25 倍", "clip", "speed", "", "そくど すろー 0.25", "src",
    (c) => eachSel(c, "速度", "clip.setSpeed", (f) => ({ clipId: f.clip.id, speed: 0.25 }))),
  C("clip.speed05", "速度 0.5 倍", "clip", "speed", "", "そくど すろー 0.5", "src",
    (c) => eachSel(c, "速度", "clip.setSpeed", (f) => ({ clipId: f.clip.id, speed: 0.5 }))),
  C("clip.speed1", "速度を戻す（1 倍）", "clip", "speed", "", "そくど もどす 1", "src",
    (c) => eachSel(c, "速度", "clip.setSpeed", (f) => ({ clipId: f.clip.id, speed: 1 }))),
  C("clip.speed2", "速度 2 倍", "clip", "speed", "", "そくど はやい 2", "src",
    (c) => eachSel(c, "速度", "clip.setSpeed", (f) => ({ clipId: f.clip.id, speed: 2 }))),
  C("clip.speed4", "速度 4 倍", "clip", "speed", "", "そくど はやい 4", "src",
    (c) => eachSel(c, "速度", "clip.setSpeed", (f) => ({ clipId: f.clip.id, speed: 4 }))),
  C("clip.reverse", "逆再生", "clip", "reverse", "alt+r", "ぎゃくさいせい reverse", "src",
    (c) => dispatch(c, "clip.reverse", { clipIds: ids(c) }, "逆再生")),
  C("clip.freeze", "フリーズ（静止）", "clip", "snow", "shift+f", "ふりーず せいし freeze still", "src",
    (c) => { const f = firstWhere(c, hasSrc); dispatch(c, "clip.freeze", { clipId: f.clip.id, t: head(c), duration: 2 }, "静止"); }),
  C("clip.detachAudio", "音を分離", "clip", "unlink", "mod+shift+l", "おとをわける detach audio", "video",
    (c) => eachSel(c, "音を分離", "clip.detachAudio", (f) => ({ clipId: f.clip.id }))),
  C("clip.link", "映像と音を結ぶ", "clip", "link", "mod+l", "りんく link", "sel2",
    (c) => dispatch(c, "clip.link", { clipIds: ids(c).slice(0, 2) }, "リンク")),
  C("clip.unlink", "リンクを外す", "clip", "unlink", "", "りんくかいじょ unlink", "linked",
    (c) => dispatch(c, "clip.link", { clipIds: [firstWhere(c, (x) => !!x.linkedId).clip.id] }, "リンク解除")),
  C("clip.group", "グループにする", "clip", "group", "mod+g", "ぐるーぷ group", "sel2",
    (c) => dispatch(c, "clip.group", { clipIds: ids(c) }, "グループ")),
  C("clip.ungroup", "グループを解く", "clip", "ungroup", "mod+shift+g", "ぐるーぷかいじょ ungroup", "grouped",
    (c) => dispatch(c, "clip.ungroup", { clipIds: ids(c) }, "グループ解除")),
  C("clip.compound", "複合クリップにする", "clip", "box", "mod+alt+g", "ふくごう compound nest", "sel",
    (c) => dispatch(c, "compound.make", { clipIds: ids(c) }, "複合クリップ")),
  C("clip.compoundEnter", "複合クリップの中へ", "clip", "box", "", "なかへ enter compound", "compound",
    (c) => dispatch(c, "compound.enter", { clipId: firstWhere(c, (x) => x.kind === "compound").clip.id }, "複合クリップへ")),
  C("clip.compoundFlatten", "複合クリップを解く", "clip", "box", "", "ふくごうかいじょ flatten", "compound",
    (c) => dispatch(c, "compound.flatten", { clipId: firstWhere(c, (x) => x.kind === "compound").clip.id }, "複合を解く")),
  C("clip.alignStart", "頭を再生位置へ揃える", "clip", "align", "", "せいれつ そろえる align", "sel", (c) => alignTo(c, "start")),
  C("clip.alignCenter", "中央を再生位置へ揃える", "clip", "align", "", "せいれつ ちゅうおう align center", "sel",
    (c) => alignTo(c, "center")),
  C("clip.alignEnd", "尻を再生位置へ揃える", "clip", "align", "", "せいれつ おわり align end", "sel", (c) => alignTo(c, "end")),
  C("clip.forward", "前面へ", "clip", "layers", "alt+arrowup", "ぜんめん まえへ forward", "sel1", (c) => layerMove(c, 1, false)),
  C("clip.backward", "背面へ", "clip", "layers", "alt+arrowdown", "はいめん うしろへ backward", "sel1",
    (c) => layerMove(c, -1, false)),
  C("clip.front", "最前面へ", "clip", "layers", "alt+shift+arrowup", "さいぜんめん front", "sel1", (c) => layerMove(c, 1, true)),
  C("clip.back", "最背面へ", "clip", "layers", "alt+shift+arrowdown", "さいはいめん back", "sel1", (c) => layerMove(c, -1, true)),
  C("clip.nudgeLeft", "1 コマ左へ動かす", "clip", "move", "mod+shift+arrowleft", "こまうごかす nudge left", "sel",
    (c) => eachSel(c, "移動", "clip.move", (f, cc) => ({ clipId: f.clip.id, start: Math.max(0, f.clip.start - 1 / fpsOf(cc)) }))),
  C("clip.nudgeRight", "1 コマ右へ動かす", "clip", "move", "mod+shift+arrowright", "こまうごかす nudge right", "sel",
    (c) => eachSel(c, "移動", "clip.move", (f, cc) => ({ clipId: f.clip.id, start: f.clip.start + 1 / fpsOf(cc) }))),
  C("clip.fadeIn", "フェードイン", "clip", "fade", "", "ふぇーどいん fade in", "src", (c) => fade(c, "in", 0.5)),
  C("clip.fadeOut", "フェードアウト", "clip", "fade", "", "ふぇーどあうと fade out", "src", (c) => fade(c, "out", 0.5)),
  C("clip.fadeBoth", "前後にフェード", "clip", "fade", "", "ふぇーど both", "src", (c) => fade(c, "both", 0.5)),
  C("clip.volumeUp", "音量を上げる", "clip", "volume", "", "おんりょう あげる volume up", "src",
    (c) => nudgeValue(c, "volume", 1.26, 0)),
  C("clip.volumeDown", "音量を下げる", "clip", "volume", "", "おんりょう さげる volume down", "src",
    (c) => nudgeValue(c, "volume", 0.79, 0)),
  C("clip.mute", "音を消す／戻す", "clip", "mute", "alt+m", "みゅーと けす mute", "src",
    (c) => eachSel(c, "ミュート", "clip.update", (f) => ({ clipIds: [f.clip.id], patch: { muteAudio: !f.clip.muteAudio } }))),
  C("clip.opacityUp", "不透明度を上げる", "clip", "opacity", "", "ふとうめいど あげる opacity", "sel",
    (c) => nudgeValue(c, "opacity", 0, 0.1)),
  C("clip.opacityDown", "不透明度を下げる", "clip", "opacity", "", "ふとうめいど さげる opacity", "sel",
    (c) => nudgeValue(c, "opacity", 0, -0.1)),
  C("clip.transitionAdd", "クロスフェードを入れる", "clip", "transition", "mod+shift+d", "とらんじしょん くろすふぇーど transition", "sel",
    (c) => eachSel(c, "トランジション", "clip.setTransition",
      (f) => ({ clipId: f.clip.id, edge: "in", type: "crossfade", duration: 0.5 }))),
  C("clip.transitionRemove", "トランジションを外す", "clip", "transition", "", "とらんじしょんけす remove transition", "sel",
    (c) => eachSel(c, "トランジション削除", "clip.removeTransition", (f) => ({ clipId: f.clip.id, edge: "in" }))),
  C("clip.resetTransform", "変形を戻す", "clip", "reset", "", "へんけい もどす reset transform", "sel",
    (c) => eachSel(c, "変形を戻す", "clip.setTransform", (f) => ({ clipId: f.clip.id, transform: null }))),
  C("clip.fitFrame", "画面に収める", "clip", "fit", "", "がめんにあわせる fit", "sel",
    (c) => eachSel(c, "画面に収める", "clip.setTransform",
      (f) => ({ clipId: f.clip.id, transform: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1 } }))),
  C("clip.transformPanel", "変形を調整する", "clip", "move", "", "へんけい transform", "sel",
    (c) => open(c, "inspector", "setTab", "transform", "変形")),
  C("clip.colorPanel", "カラーを調整する", "clip", "color", "", "からー いろ color grade", "sel",
    (c) => open(c, "inspector", "setTab", "color", "カラー")),
  C("clip.audioPanel", "オーディオを調整する", "clip", "volume", "", "おーでぃお おと audio", "sel",
    (c) => open(c, "inspector", "setTab", "audio", "オーディオ")),
  C("clip.textPanel", "文字を編集する", "clip", "type", "", "もじ てきすと text", "sel",
    (c) => open(c, "inspector", "setTab", "text", "文字")),
  C("clip.fxPanel", "効果を付ける", "clip", "sparkles", "", "こうか えふぇくと fx effect", "sel",
    (c) => open(c, "inspector", "setTab", "fx", "効果")),
  C("clip.maskPanel", "マスクを付ける", "clip", "mask", "", "ますく mask", "sel",
    (c) => { if (!open(c, "preview", "setMode", "mask", "マスク")) open(c, "inspector", "setTab", "transform", "マスク"); }),
  C("clip.cropPanel", "トリミング（切り抜き）", "clip", "crop", "", "とりみんぐ きりぬき crop", "sel",
    (c) => { if (!open(c, "preview", "setMode", "crop", "切り抜き")) open(c, "inspector", "setTab", "transform", "切り抜き"); }),
  C("clip.chromaPick", "クロマキーの色を拾う", "clip", "chroma", "", "くろまきー ぐりーんばっく chroma", "video",
    (c) => open(c, "preview", "setMode", "chroma-pick", "クロマキー")),
  C("clip.labelColor", "ラベルの色を変える", "clip", "label", "", "らべる いろ label", "sel",
    (c) => {
      const palette = ["#4f8cff", "#ff6b6b", "#ffd166", "#06d6a0", "#b388ff"];
      const cur = (first(c) && first(c).clip.label) || palette[0];
      const next = palette[(palette.indexOf(cur) + 1) % palette.length];
      eachSel(c, "ラベル", "clip.update", (f) => ({ clipIds: [f.clip.id], patch: { label: next } }));
    }),

  /* ── キーフレーム ─────────────────────────────────────────── */
  C("key.add", "キーフレームを打つ", "key", "key", "alt+k", "きーふれーむ うつ keyframe add", "sel1", (c) => keyAt(c, null, false)),
  C("key.remove", "キーフレームを消す", "key", "key", "alt+shift+k", "きーふれーむ けす keyframe remove", "sel1",
    (c) => keyAt(c, null, true)),
  C("key.next", "次のキーフレームへ", "key", "next", "alt+.", "つぎのきー next keyframe", "sel1", (c) => keyStep(c, 1)),
  C("key.prev", "前のキーフレームへ", "key", "prev", "alt+,", "まえのきー prev keyframe", "sel1", (c) => keyStep(c, -1)),
  C("key.addOpacity", "不透明度にキーを打つ", "key", "key", "", "ふとうめいど きー opacity key", "sel1",
    (c) => keyAt(c, "opacity", false)),
  C("key.addScale", "拡大率にキーを打つ", "key", "key", "", "かくだい きー scale key", "sel1",
    (c) => keyAt(c, "transform.scale", false)),
  C("key.addPosition", "位置にキーを打つ", "key", "key", "", "いち きー position key", "sel1",
    (c) => batch(c, "位置のキー", (d) => {
      const f = first(c), t = clamp(head(c) - f.clip.start, 0, f.clip.duration);
      d("key.add", { clipId: f.clip.id, path: "transform.x", t });
      d("key.add", { clipId: f.clip.id, path: "transform.y", t });
    })),
  C("key.addVolume", "音量にキーを打つ", "key", "key", "", "おんりょう きー volume key", "sel1",
    (c) => keyAt(c, "volume", false)),
  C("key.easeInOut", "選んだキーを滑らかにする", "key", "curve", "", "いーじんぐ なめらか ease", "keyed",
    (c) => { const k = selOf(c).keyframe; dispatch(c, "key.update", { clipId: k.clipId, path: k.path, index: k.index, ease: "inout" }, "イージング"); }),
  C("key.clearPath", "このクリップのキーを全部消す", "key", "trash", "", "きーぜんぶけす clear keys", "sel1",
    (c) => { const f = first(c); batch(c, "キーを全部消す", (d) => { for (const p of keyPathsOf(f.clip)) d("key.remove", { clipId: f.clip.id, path: p, all: true }); }); }, true),

  /* ── 再生 ─────────────────────────────────────────────────── */
  C("play.toggle", "再生／一時停止", "play", "play", "space", "さいせい ていし play pause", "always", (c) => tcall(c, "toggle")),
  C("play.stop", "止める", "play", "pause", "k", "とめる stop", "always", (c) => { tcall(c, "setRate", [1]); tcall(c, "pause"); }),
  C("play.reverse", "逆再生（押すほど速く）", "play", "rewind", "j", "ぎゃくさいせい まきもどし rewind", "always", (c) => playDir(c, -1)),
  C("play.forward", "早送り（押すほど速く）", "play", "forward", "l", "はやおくり forward", "always", (c) => playDir(c, 1)),
  C("play.frameNext", "1 コマ進む", "play", "step", "arrowright", "こまおくり next frame", "always", (c) => tcall(c, "stepFrame", [1])),
  C("play.framePrev", "1 コマ戻る", "play", "step", "arrowleft", "こまもどし prev frame", "always", (c) => tcall(c, "stepFrame", [-1])),
  C("play.secNext", "1 秒進む", "play", "step", "shift+arrowright", "いちびょうおくり second", "always",
    (c) => seek(c, head(c) + 1)),
  C("play.secPrev", "1 秒戻る", "play", "step", "shift+arrowleft", "いちびょうもどし second", "always",
    (c) => seek(c, head(c) - 1)),
  C("play.start", "先頭へ", "play", "first", "home", "せんとう さいしょ start home", "always", (c) => seek(c, 0)),
  C("play.end", "末尾へ", "play", "last", "end", "まつび さいご end", "always", (c) => seek(c, projectDuration(proj(c)))),
  C("play.nextEdit", "次の継ぎ目へ", "play", "next", "arrowdown", "つぎのつぎめ next edit", "always", (c) => edgeStep(c, 1)),
  C("play.prevEdit", "前の継ぎ目へ", "play", "prev", "arrowup", "まえのつぎめ prev edit", "always", (c) => edgeStep(c, -1)),
  C("play.setIn", "イン点を打つ", "play", "in", "i", "いんてん in point", "always",
    (c) => { const s = store(c); if (s) s.setView({ inPoint: head(c) }); tquiet(c, "setRange", [head(c), (s && s.view.outPoint) || null]); }),
  C("play.setOut", "アウト点を打つ", "play", "out", "o", "あうとてん out point", "always",
    (c) => { const s = store(c); if (s) s.setView({ outPoint: head(c) }); tquiet(c, "setRange", [(s && s.view.inPoint) || null, head(c)]); }),
  C("play.gotoIn", "イン点へ", "play", "in", "shift+i", "いんてんへ goto in", "range",
    (c) => seek(c, finite(store(c).view.inPoint, 0))),
  C("play.gotoOut", "アウト点へ", "play", "out", "shift+o", "あうとてんへ goto out", "range",
    (c) => seek(c, finite(store(c).view.outPoint, 0))),
  C("play.clearRange", "イン・アウトを消す", "play", "reset", "alt+x", "はんいけす clear in out", "range",
    (c) => { store(c).setView({ inPoint: null, outPoint: null }); tquiet(c, "setRange", [null, null]); }),
  C("play.playRange", "イン〜アウトを再生", "play", "play", "shift+space", "はんいさいせい play range", "always",
    (c) => { const v = store(c) ? store(c).view : {}; seek(c, finite(v.inPoint, 0)); tcall(c, "play"); }),
  C("play.loop", "繰り返し再生", "play", "loop", "shift+l", "るーぷ くりかえし loop", "always",
    (c) => { const T = c && c.transport; tcall(c, "setLoop", [!(T && T.loop)]); }),
  C("play.rateUp", "再生を速くする", "play", "rate", "]", "ばいそく はやく rate up", "always", (c) => rateStep(c, 2, false)),
  C("play.rateDown", "再生を遅くする", "play", "rate", "[", "ばいそく おそく rate down", "always", (c) => rateStep(c, 0.5, false)),
  C("play.rateReset", "再生速度を戻す", "play", "rate", "\\", "ばいそくもどす rate reset", "always", (c) => rateStep(c, 1, true)),
  C("play.goto", "時刻を指定して移動", "play", "clock", "g", "じかん いどう goto timecode", "always",
    async (c) => {
      const f = fpsOf(c);
      const s = await askText(c, "移動先のタイムコード（例 00:00:12:15）", toTC(head(c), f));
      if (s == null) return;
      const t = fromTC(s, f);
      if (t == null || !Number.isFinite(t)) { say(c, "読めない時刻です", "warn"); return; }
      seek(c, t);
    }),
  C("play.muteMaster", "全体の音を消す／戻す", "play", "mute", "", "みゅーと ぜんたい master mute", "store",
    (c) => {
      const a = settings(c).audio || {};
      setSetting(c, { audio: { master: finite(a.master, 1) > 0 ? 0 : 1 } }, "マスター音量");
    }),
  C("play.followPlayhead", "再生位置を追いかける", "play", "follow", "", "ついせき follow playhead", "store",
    (c) => { const v = store(c).view; store(c).setView({ followPlayhead: !v.followPlayhead }); }),

  /* ── 表示 ─────────────────────────────────────────────────── */
  C("view.zoomIn", "タイムラインを拡大", "view", "zoomIn", "plus", "かくだい ずーむ zoom in", "always", (c) => zoom(c, 1.6, false)),
  C("view.zoomOut", "タイムラインを縮小", "view", "zoomOut", "-", "しゅくしょう ずーむ zoom out", "always", (c) => zoom(c, 1 / 1.6, false)),
  C("view.zoomFit", "全体を表示", "view", "fitScreen", "shift+z", "ぜんたいひょうじ fit all", "always", (c) => zoom(c, 1, true)),
  C("view.zoomSel", "選択に合わせて拡大", "view", "fitScreen", "alt+z", "せんたくにあわせる zoom selection", "sel",
    (c) => {
      const v = part(c, "tlView");
      const f = first(c);
      if (!v || !f || typeof v.setZoom !== "function") { say(c, "タイムラインがまだ在りません", "warn"); return; }
      v.setZoom(clamp(600 / Math.max(0.2, f.clip.duration), 2, 800));
      if (typeof v.scrollToTime === "function") v.scrollToTime(f.clip.start, { center: true });
    }),
  C("view.trackTaller", "トラックを高くする", "view", "track", "mod+alt+arrowup", "とらっくたかく track height", "track",
    (c) => trackHeight(c, 1.25)),
  C("view.trackShorter", "トラックを低くする", "view", "track", "mod+alt+arrowdown", "とらっくひくく track height", "track",
    (c) => trackHeight(c, 0.8)),
  C("view.waveform", "波形の表示を切り替え", "view", "waveform", "", "はけい waveform", "always", (c) => tlDisplay(c, "waveform")),
  C("view.thumbs", "サムネの表示を切り替え", "view", "image", "", "さむね thumbnail", "always", (c) => tlDisplay(c, "thumbs")),
  C("view.safeArea", "セーフエリアの表示", "view", "safe", "shift+s", "せーふえりあ safe area", "store",
    (c) => {
      const on = !settings(c).showSafeArea;
      setSetting(c, { showSafeArea: on }, "セーフエリア");
      guides(c, { safe: on });
    }),
  C("view.grid", "グリッド（なし→3 分割→9 分割）", "view", "grid", "shift+g", "ぐりっど grid", "always",
    (c) => { gridStep = (gridStep + 1) % GRID_STEPS.length; guides(c, { grid: GRID_STEPS[gridStep] }); }),
  C("view.center", "中心線の表示", "view", "grid", "shift+c", "ちゅうしんせん center line", "always",
    (c) => { centerOn = !centerOn; guides(c, { center: centerOn }); }),
  C("view.qualityAuto", "画質 自動", "view", "quality", "", "がしつ じどう quality auto", "store",
    (c) => setSetting(c, { previewQuality: "auto" }, "画質")),
  C("view.qualityFull", "画質 最高", "view", "quality", "", "がしつ さいこう quality full", "store",
    (c) => setSetting(c, { previewQuality: "full" }, "画質")),
  C("view.qualityHalf", "画質 半分", "view", "quality", "", "がしつ はんぶん quality half", "store",
    (c) => setSetting(c, { previewQuality: "half" }, "画質")),
  C("view.qualityQuarter", "画質 1/4", "view", "quality", "", "がしつ よんぶんのいち quality quarter", "store",
    (c) => setSetting(c, { previewQuality: "quarter" }, "画質")),
  C("view.fullscreen", "全画面", "view", "fullscreen", "f", "ぜんがめん fullscreen", "always", fullscreen),
  C("view.panelLeft", "左の棚を開閉", "view", "panel", "alt+1", "ひだり そざいだな left panel", "always",
    (c) => togglePane(c, "left", "left")),
  C("view.panelRight", "右の調整棚を開閉", "view", "panel", "alt+2", "みぎ いんすぺくた right panel", "always",
    (c) => togglePane(c, "right", "right")),
  C("view.panelTimeline", "タイムラインを開閉", "view", "panel", "alt+3", "たいむらいん timeline panel", "always",
    (c) => togglePane(c, "timeline", "timelinePane")),
  C("view.mixer", "ミキサーを開く", "view", "mixer", "alt+4", "みきさー mixer", "always",
    (c) => open(c, "mixer", "open", null, "ミキサー")),
  C("view.scopes", "波形モニタ（スコープ）", "view", "scope", "alt+5", "すこーぷ べくとる scope", "always",
    (c) => open(c, "scopes", "open", null, "スコープ")),
  C("view.snap", "吸着（スナップ）", "view", "snap", "n", "きゅうちゃく すなっぷ snap", "store",
    (c) => setSetting(c, { snap: !settings(c).snap }, "吸着")),
  C("view.magnet", "磁石（詰めて並べる）", "view", "magnet", "shift+n", "じしゃく まぐねっと magnet", "store",
    (c) => setSetting(c, { magnet: !settings(c).magnet }, "磁石")),
  C("view.libMedia", "素材の棚を開く", "view", "film", "", "そざい media library", "always",
    (c) => open(c, "library", "open", "media", "素材")),
  C("view.libText", "テキストの棚を開く", "view", "type", "", "てきすと text library", "always",
    (c) => open(c, "library", "open", "text", "テキスト")),
  C("view.libAudio", "オーディオの棚を開く", "view", "music", "", "おーでぃお おんがく audio library", "always",
    (c) => open(c, "library", "open", "audio", "オーディオ")),
  C("view.libSticker", "ステッカーの棚を開く", "view", "sticker", "", "すてっかー sticker", "always",
    (c) => open(c, "library", "open", "sticker", "ステッカー")),
  C("view.libFx", "エフェクトの棚を開く", "view", "sparkles", "", "えふぇくと effect", "always",
    (c) => open(c, "library", "open", "fx", "エフェクト")),
  C("view.libTransition", "遷移の棚を開く", "view", "transition", "", "せんい とらんじしょん transition", "always",
    (c) => open(c, "library", "open", "transition", "遷移")),
  C("view.libFilter", "フィルターの棚を開く", "view", "filter", "", "ふぃるたー filter", "always",
    (c) => open(c, "library", "open", "filter", "フィルター")),
  C("view.libTemplate", "テンプレートの棚を開く", "view", "template", "", "てんぷれーと template", "always",
    (c) => open(c, "library", "open", "template", "テンプレート")),
  C("view.ratio916", "比率を 9:16（縦）にする", "view", "ratio", "", "ひりつ たて 9:16 shorts", "store",
    (c) => setSetting(c, { ratio: "9:16" }, "比率")),
  C("view.ratio169", "比率を 16:9（横）にする", "view", "ratio", "", "ひりつ よこ 16:9", "store",
    (c) => setSetting(c, { ratio: "16:9" }, "比率")),
  C("view.ratio11", "比率を 1:1（正方）にする", "view", "ratio", "", "ひりつ せいほう 1:1", "store",
    (c) => setSetting(c, { ratio: "1:1" }, "比率")),

  /* ── マーカー ─────────────────────────────────────────────── */
  C("marker.add", "マーカーを打つ", "marker", "marker", "m", "まーかー しるし marker add", "store",
    (c) => dispatch(c, "marker.add", { t: head(c) }, "印")),
  C("marker.next", "次のマーカーへ", "marker", "next", "shift+m", "つぎのまーかー next marker", "marker",
    (c) => markerStep(c, 1)),
  C("marker.prev", "前のマーカーへ", "marker", "prev", "alt+shift+m", "まえのまーかー prev marker", "marker",
    (c) => markerStep(c, -1)),
  C("marker.rename", "マーカーに名前を付ける", "marker", "edit", "", "まーかーなまえ rename marker", "marker",
    async (c) => {
      const list = markersOf(c).slice().sort((a, b) => Math.abs(a.t - head(c)) - Math.abs(b.t - head(c)));
      const m = list[0];
      const n = await askText(c, "マーカーの名前", m.name || "");
      if (n != null) dispatch(c, "marker.update", { markerId: m.id, patch: { name: n } }, "印の名前");
    }),
  C("marker.toChapter", "この位置を章にする", "marker", "chapter", "", "しょう ちゃぷたー chapter", "store",
    async (c) => {
      const n = await askText(c, "章の題", "章 " + ((proj(c).chapters || []).length + 1));
      if (n != null) dispatch(c, "chapter.add", { t: head(c), title: n }, "章");
    }),
  C("marker.clearAll", "マーカーを全部消す", "marker", "trash", "", "まーかーぜんぶけす clear markers", "marker",
    (c) => batch(c, "印を全部消す", (d) => { for (const m of markersOf(c)) d("marker.remove", { markerId: m.id }); }), true),

  /* ── 自動編集 ─────────────────────────────────────────────── */
  C("auto.open", "自動編集を開く", "auto", "ai", "mod+j", "じどうへんしゅう ai しぜんごで", "always",
    (c) => open(c, "ai", "open", "create", "自動編集")),
  C("auto.cutSilence", "無音カット", "auto", "cut", "", "むおんかっと しずかなところ silence", "store",
    (c) => autoTool(c, "autoCutSilence", {}, "無音カット")),
  C("auto.beatSync", "ビート同期", "auto", "music", "", "びーとどうき おんがくにあわせる beat", "store",
    (c) => autoTool(c, "autoBeatSync", {}, "ビート同期")),
  C("auto.reframe", "自動リフレーム", "auto", "crop", "", "りふれーむ たてよこ reframe", "store",
    (c) => autoTool(c, "autoReframe", { ratio: settings(c).ratio === "16:9" ? "9:16" : settings(c).ratio }, "自動リフレーム")),
  C("auto.color", "自動カラー", "auto", "color", "", "じどうからー いろほせい auto color", "store",
    (c) => autoTool(c, "autoColor", {}, "自動カラー")),
  C("auto.normalize", "音量をそろえる", "auto", "volume", "", "おんりょうそろえる normalize loudness", "store",
    (c) => autoTool(c, "autoNormalize", {}, "音量そろえ")),
  C("auto.duck", "ダッキング（BGM を下げる）", "auto", "volume", "", "だっきんぐ bgm さげる duck", "store",
    (c) => autoTool(c, "autoDuck", {}, "ダッキング")),
  C("auto.highlights", "ハイライト抽出", "auto", "star", "", "はいらいと みどころ highlight", "store",
    (c) => autoTool(c, "autoHighlights", {}, "ハイライト抽出")),
  C("auto.captions", "字幕を作る", "auto", "captions", "", "じまくつくる caption subtitle", "store",
    (c) => autoTool(c, "autoSubtitleFromSpeech", {}, "字幕作成")),
  C("auto.chapters", "章を自動で作る", "auto", "chapter", "", "しょうじどう chapters", "store",
    (c) => autoTool(c, "autoChapters", {}, "章の自動作成")),
  C("auto.fades", "前後にフェードを入れる", "auto", "fade", "", "ふぇーどじどう auto fade", "store",
    (c) => autoTool(c, "autoFadeInOut", {}, "自動フェード")),
  C("auto.closeGaps", "隙間を自動で詰める", "auto", "magnet", "", "すきまじどう remove gaps", "store",
    (c) => autoTool(c, "removeGaps", {}, "隙間を詰める")),
  C("auto.evenOut", "尺をそろえる", "auto", "align", "", "しゃくそろえる even out", "store",
    (c) => autoTool(c, "evenOut", {}, "尺そろえ")),
  C("auto.zoomPunch", "ズームの強弱を付ける", "auto", "zoomIn", "", "ずーむぱんち zoom punch", "store",
    (c) => autoTool(c, "autoZoomPunch", {}, "ズーム演出")),
  C("auto.transitions", "つなぎに遷移を入れる", "auto", "transition", "", "とらんじしょんじどう auto transition", "store",
    (c) => autoTool(c, "autoTransitions", {}, "自動トランジション")),
  C("auto.analyze", "素材を解析する", "auto", "scan", "", "かいせき analyze", "store",
    (c) => {
      const im = part(c, "importer");
      const list = (proj(c).assets || []).map((a) => a.id);
      if (!im || typeof im.analyze !== "function" || !list.length) { say(c, "解析できる素材が在りません", "warn"); return; }
      im.analyze(list);
      say(c, list.length + " 個の素材を解析に積みました", "ok");
    }),
  C("auto.refine", "言葉で直す（追い注文）", "auto", "ai", "", "おいちゅうもん もっとはやく refine", "store",
    (c) => open(c, "ai", "open", "refine", "追い注文")),

  /* ── 道具（契約書 §7.4 の V / A / T）─────────────────────── */
  C("tool.select", "選択ツール", "tool", "cursor", "v", "せんたく select tool", "store",
    (c) => store(c).setView({ tool: "select" })),
  C("tool.ripple", "リップルツール", "tool", "ripple", "a", "りっぷる ripple tool", "store",
    (c) => store(c).setView({ tool: "ripple" })),
  C("tool.razor", "かみそり（分割）ツール", "tool", "razor", ["t", "c"], "かみそり razor tool", "store",
    (c) => store(c).setView({ tool: "razor" })),
  C("tool.hand", "手のひらツール", "tool", "hand", "h", "てのひら hand tool", "store",
    (c) => store(c).setView({ tool: "hand" })),
  C("tool.zoom", "ズームツール", "tool", "zoomIn", "z", "ずーむどうぐ zoom tool", "store",
    (c) => store(c).setView({ tool: "zoom" })),

  /* ── アカウント ───────────────────────────────────────────── */
  C("account.login", "ログイン", "account", "user", "", "ろぐいん login signin はいる", "anon", (c) => account(c, "login")),
  C("account.register", "新規登録", "account", "userPlus", "", "しんきとうろく とうろく signup register", "anon",
    (c) => account(c, "signup")),
  C("account.guest", "ゲストで続ける", "account", "user", "", "げすと ためす guest", "anon",
    (c) => { const a = auth(c); if (a && a.guest) { a.guest(); say(c, "ゲストで続けます（保存は端末の中だけ）", "info"); } else account(c, "welcome"); }),
  C("account.profile", "アカウント情報", "account", "user", "", "あかうんと ぷろふぃーる profile", "user",
    (c) => account(c, "profile")),
  C("account.changePassword", "パスワードを変える", "account", "lock", "", "ぱすわーどへんこう password change", "authApi",
    (c) => { const s = part(c, "settings"); if (s && s.openAccount) s.openAccount("changePassword"); else account(c, "changePassword"); }),
  C("account.logout", "ログアウト", "account", "logout", "", "ろぐあうと logout signout でる", "user",
    (c) => {
      const a = auth(c);
      if (!a || typeof a.logout !== "function") { say(c, "ログアウトできません", "warn"); return; }
      a.logout({ keepGuest: true });
      say(c, "ログアウトしました", "ok");
    }, true),

  /* ── ヘルプ ───────────────────────────────────────────────── */
  C("help.shortcuts", "短絡キーの一覧", "help", "keyboard", "?", "しょーとかっと きーいちらん shortcut help", "always",
    (c) => open(c, "shortcuts", "openHelp", null, "短絡キーの一覧")),
  C("help.palette", "命令をさがす", "help", "search", "mod+k", "こまんど さがす command palette", "always",
    (c) => open(c, "shortcuts", "openPalette", null, "命令一覧")),
  C("help.selftest", "自己診断を開く", "help", "scan", "", "じこしんだん selftest", "always",
    (c) => {
      if (typeof globalThis.open === "function") { globalThis.open("./selftest.html", "_blank"); return; }
      say(c, "自己診断の画面を開けませんでした", "warn");
    })
]);

/* ══ §8 索き（引く）と検め ════════════════════════════════════ */

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
/** @param {string} id @returns {Object|null} */
export function commandById(id) { return BY_ID.get(String(id || "")) || null; }
/** 群ごとに並べた命令（画面の一覧用） */
export function commandsByGroup(list) {
  const src = Array.isArray(list) ? list : COMMANDS;
  const keys = Object.keys(GROUPS).sort((a, b) => GROUPS[a].order - GROUPS[b].order);
  return keys.map((g) => ({ group: g, label: GROUPS[g].label, items: src.filter((c) => c.group === g) }))
    .filter((x) => x.items.length);
}
/** id の重複（試験用。空配列なら健全）@returns {string[]} */
export function duplicateIds(list) {
  const src = Array.isArray(list) ? list : COMMANDS;
  const seen = new Set(), dup = [];
  for (const c of src) { if (!c || !c.id) continue; if (seen.has(c.id)) dup.push(c.id); seen.add(c.id); }
  return dup;
}
/** 2 つの条件が「同時に成り立たない」か */
function exclusive(a, b) {
  for (const pair of EXCLUSIVE) if ((pair[0] === a && pair[1] === b) || (pair[1] === a && pair[0] === b)) return true;
  return false;
}
/**
 * 鍵の衝突（同じ鍵・同時に成り立つ条件）@returns {{key:string,a:string,b:string}[]}
 * 空配列なら健全。EXCLUSIVE の組だけは分け合って良い。
 */
export function keyConflicts(list) {
  const src = Array.isArray(list) ? list : COMMANDS;
  const byKey = new Map();
  const out = [];
  for (const cmd of src) {
    if (!cmd) continue;
    for (const raw of (cmd.keys || [])) {
      const k = normalizeKey(raw);
      if (!k) continue;
      const prev = byKey.get(k) || [];
      for (const p of prev) {
        if (!exclusive(p.whenId, cmd.whenId)) out.push({ key: k, a: p.id, b: cmd.id, when: [p.whenId, cmd.whenId] });
      }
      prev.push(cmd);
      byKey.set(k, prev);
    }
  }
  return out;
}
/** 鍵 → その鍵を持つ命令たち（ui/shortcuts.js が引く） */
export function keyMap(list) {
  const src = Array.isArray(list) ? list : COMMANDS;
  const map = new Map();
  for (const cmd of src) for (const raw of (cmd.keys || [])) {
    const k = normalizeKey(raw);
    if (!k) continue;
    const arr = map.get(k) || [];
    arr.push(cmd);
    map.set(k, arr);
  }
  return map;
}

/* ══ §9 最近使った物 ══════════════════════════════════════════ */

/** @returns {string[]} 新しい順 */
export function recentIds() {
  try {
    const raw = globalThis.localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch (e) { return []; }
}
export function noteUse(id) {
  const key = String(id || "");
  if (!key) return [];
  const list = [key].concat(recentIds().filter((x) => x !== key)).slice(0, RECENT_MAX);
  try { globalThis.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* 保存できなくて良い */ }
  return list;
}

/* ══ §10 実行の唯一の入口 ════════════════════════════════════ */

/**
 * 命令を 1 つ実行する（UI・鍵・パレット・AI は必ずここを通す）。
 *   ・when が偽なら実行しない（理由をトーストで出す）
 *   ・danger は確認を取る（confirmed:true で省ける）
 *   ・例外は握りつぶさずトーストにして false を返す
 * @param {string|Object} target 命令 id か命令そのもの
 * @param {Object} ctx @param {{confirmed?:boolean, quiet?:boolean}} [opts]
 * @returns {Promise<boolean>} 実行できたか
 */
export async function runCommand(target, ctx, opts) {
  const o = opts || {};
  const cmd = typeof target === "string" ? commandById(target) : target;
  if (!cmd || typeof cmd.run !== "function") { say(ctx, "その命令は在りません", "warn"); return false; }
  if (!isEnabled(cmd, ctx)) {
    if (!o.quiet) say(ctx, "「" + cmd.title + "」は今できません", "warn");
    return false;
  }
  if (cmd.danger && !o.confirmed) {
    const ok = await confirmDanger(ctx, cmd);
    if (!ok) return false;
  }
  try {
    const r = cmd.run(ctx);
    if (r && typeof r.then === "function") await r;
    noteUse(cmd.id);
    return true;
  } catch (e) {
    warn("commands", cmd.id + " が失敗", e);
    say(ctx, "「" + cmd.title + "」に失敗しました: " + errMsg(e), "error");
    return false;
  }
}

export default COMMANDS;
