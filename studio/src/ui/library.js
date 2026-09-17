/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/library.js — 左パネル（素材と素材ライブラリ）

   ★ 何をする所か
     CapCut の左側／Premiere のプロジェクトパネルに当たる所。#libraryTabs に
     縦タブを並べ、#libraryPanel にその中身を出す。タブは 8 枚:
       素材 / テキスト / オーディオ / ステッカー・図形 / エフェクト / 遷移 /
       フィルター / テンプレート
     どのタブも「押すと今の再生ヘッドへ入る」か「選択中のクリップへ当たる」。

   ★ なぜこの形か
     ・**中身は必要になった時に作る（遅延生成）**。8 枚全部を最初に組むと、
       起動が遅くなるし、まだ読めない登録表（FX_REGISTRY 等）を待つ事になる。
       一度作った物は残して、表示の出し入れだけで切り替える（スクロール位置も残る）。
     ・**登録表は動的 import**。engine/fx/registry.js・engine/transitions.js・
       engine/fx/luts.js・engine/shapes.js は別担当のファイルで、まだ無い事が在る。
       静的 import だと 1 つ欠けただけで左パネルごと真っ白になる。
       無い時はその場に穏やかな断り書きを出し、他のタブは普通に使える。
     ・**見本は重い画像を作らない**。CSS と小さな canvas（64×36）だけで描く。
       素材のサムネは取り込み時に 1 枚だけ作った物（storage.getThumbSheet）を使う。
     ・部品（ui/widgets.js）は在れば必ず使う。無い物だけ自前で代替する
       （widgets は別担当・まだ無い事が在る）。
     ・素材の削除は確認ダイアログを出さない（契約書 §13.5）。取消は Ctrl+Z。

   ★ 触るときの注意
     ・ここは store を読むだけ。編集は必ず ops（store.dispatch / store.batch）経由。
     ・タイムラインへのドラッグは ui/timeline/interact.js の約束に合わせる:
       `application/x-vqs-asset` に assetId を入れる（受け手が clip.add する）。
       効果・遷移・フィルターの投下は受け手が居ないので **ここで自分で受ける**
       （#tlTracks の [data-clip-id] を見る。下の §7）。
     ・モバイルは長押し（480ms）で追加メニュー。触り所は 44px 以上（CSS 側）。

   CONTRACT-NOTE: このファイルは 700 行を超えている。作法は「超えたら分割」だが、
     担当ファイルは library.js と import.js の 2 つだけで、切り出し先
     （ui/library/*.js）を作ると「担当外のファイルを作らない」という上位の
     約束を破る。分ける切れ目は ①純関数の並べ替え・絞り込み ②タブ 1 枚ずつの
     build 関数 ③骨組み（createLibrary）で、依存は ③ → ② → ① の一方向。
     分けて良い事になったら build 関数をそのまま移すだけで済む。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { finite, clamp, formatBytes, formatDuration, isTouch } from "../core/util.js";
import { warn } from "../core/log.js";
import { SHAPE_TYPES } from "../core/schema.js";
import { TEXT_PRESETS, TEXT_PRESET_IDS, roleSpec, COLOR_LOOKS, LOOK_NAMES, gradeForLook, TEMPLATES } from "../ai/templates.js";

/* ── 0. 決め事 ──────────────────────────────────────────────────── */

/** タブ（縦。id は localStorage にも入る） */
export const LIB_TABS = Object.freeze([
  { id: "media", label: "素材", icon: "film", glyph: "▦" },
  { id: "text", label: "テキスト", icon: "type", glyph: "T" },
  { id: "audio", label: "オーディオ", icon: "music", glyph: "♪" },
  { id: "sticker", label: "ステッカー", icon: "sticker", glyph: "★" },
  { id: "fx", label: "エフェクト", icon: "sparkles", glyph: "✦" },
  { id: "transition", label: "遷移", icon: "transition", glyph: "⇄" },
  { id: "filter", label: "フィルター", icon: "filter", glyph: "◑" },
  { id: "template", label: "テンプレート", icon: "template", glyph: "▤" }
]);

const LAST_TAB_KEY = "vqstudio.library.tab";
const LONG_PRESS_MS = 480;
const TAP_SLOP = 10;
/** 画像クリップの既定の尺（秒） */
const IMAGE_DUR = 4;
/** BGM として入れる時の音量とフェード（依頼の明文: 0.25・ダッキング on） */
const BGM_VOLUME = 0.25;
const BGM_FADE = 1.2;
/** 音の印（ui/inspector/audio.js と同じ綴り。変えると噛み合わない） */
const BGM_FX_TYPE = "bgm";

/** 種類の表示名 */
export const KIND_LABEL = Object.freeze({ video: "映像", image: "画像", audio: "音" });

/** ステッカー代わりの絵文字（大きな文字として入れる） */
const EMOJI = Object.freeze([
  "😀", "😂", "🥹", "😍", "🤔", "😴", "🤯", "🥳", "😎", "🙏",
  "👍", "👏", "🙌", "💪", "✨", "🔥", "💡", "❤️", "💔", "⭐",
  "🎉", "🎊", "🎁", "🍰", "🍜", "☕", "🍻", "🐱", "🐶", "🌸",
  "☀️", "🌧️", "❄️", "🌈", "⚡", "💤", "❓", "❗", "✅", "❌"
]);

/* ── 1. 純関数（並べ替え・絞り込み。試験する）──────────────────── */

/** その素材を使っているクリップの数（入れ子の中も数える） */
export function countUses(project, assetId) {
  const id = String(assetId || "");
  if (!id || !project) return 0;
  let n = 0;
  const walk = (tracks, depth) => {
    for (const tr of (tracks || [])) {
      for (const cl of ((tr && tr.clips) || [])) {
        if (!cl) continue;
        if (String(cl.assetId || "") === id) n++;
        if (cl.compound && depth < 2) walk(cl.compound.tracks, depth + 1);
      }
    }
  };
  walk(project.tracks, 0);
  return n;
}

/** 一度も使っていない素材の id */
export function unusedAssetIds(project) {
  const list = (project && project.assets) || [];
  return list.filter((a) => a && countUses(project, a.id) === 0).map((a) => String(a.id));
}

/** 名前・種類で当たるか（小文字・部分一致。空の問いは全部当たる） */
export function matchAsset(asset, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  if (!asset) return false;
  const hay = [asset.name, asset.mime, KIND_LABEL[asset.kind] || asset.kind].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.indexOf(w) >= 0);
}

/**
 * 素材を絞って並べる（pure）。
 * @param {Object[]} assets @param {{query?:string, kind?:string, sort?:string, uses?:Object}} o
 * @returns {Object[]} 新しい配列
 */
export function filterAssets(assets, o) {
  const opt = o || {};
  const kind = String(opt.kind || "all");
  const uses = opt.uses || {};
  const out = (assets || []).filter((a) => !!a && (kind === "all" || a.kind === kind) && matchAsset(a, opt.query));
  const sort = String(opt.sort || "added");
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja");
  if (sort === "name") out.sort(byName);
  else if (sort === "duration") out.sort((a, b) => finite(b.duration, 0) - finite(a.duration, 0) || byName(a, b));
  else if (sort === "uses") out.sort((a, b) => finite(uses[b.id], 0) - finite(uses[a.id], 0) || byName(a, b));
  else out.sort((a, b) => finite(a.createdAt, 0) - finite(b.createdAt, 0));
  return out;
}

/** 尺の表示（画像は「静止画」） */
export function durLabel(asset) {
  if (!asset) return "";
  if (asset.kind === "image") return "静止画";
  const d = finite(asset.duration, 0);
  return d > 0 ? formatDuration(d) : "—";
}

/** 解析の状況を一言で */
export function scanLabel(st) {
  const s = (st && st.status) || "none";
  if (s === "running") return `解析中 ${Math.round(clamp(finite(st.p, 0), 0, 1) * 100)}%`;
  if (s === "queued") return "解析待ち";
  if (s === "done") return "解析済";
  if (s === "error") return "解析できず";
  return "";
}

/** 登録表（配列でも地図でも）を `[{id,label,group,params}]` に揃える */
export function normalizeRegistry(raw, fallbackGroup) {
  const out = [];
  const seen = new Set();
  const push = (id, def) => {
    const i = String(id == null ? "" : id).trim();
    if (!i || seen.has(i)) return;
    seen.add(i);
    const d = def && typeof def === "object" ? def : {};
    out.push({
      id: i,
      label: String(d.label || d.name || d.title || i),
      group: String(d.group || d.category || fallbackGroup || "その他"),
      params: d.params && typeof d.params === "object" ? d.params : null,
      hint: String(d.hint || d.description || "")
    });
  };
  if (Array.isArray(raw)) for (const d of raw) push(d && typeof d === "object" ? (d.id || d.type || d.name) : d, d);
  else if (raw && typeof raw === "object") for (const k of Object.keys(raw)) push(k, raw[k]);
  return out;
}

/** 分類ごとにまとめる（表示順は現れた順） */
export function byGroup(list) {
  const map = new Map();
  for (const e of list || []) {
    const g = e.group || "その他";
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(e);
  }
  return Array.from(map, ([group, items]) => ({ group, items }));
}

/* ── 2. 小さな道具（DOM）────────────────────────────────────────── */

const EL = (tag, cls, text) => {
  const n = document.createElement(tag || "div");
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};
const msgOf = (e) => String((e && e.message) || e || "原因不明");

/* ── 3. 本体 ────────────────────────────────────────────────────── */

/**
 * 左パネルを作る（契約書 §7・依頼書）。
 * @param {{store:Object, els:Object, widgets?:Object, storage?:Object,
 *          media?:Object, importer?:Object, ctx?:Object}} o
 * @returns {{render:Function, dispose:Function, open:Function, get tab():string}}
 */
export function createLibrary(o) {
  const opts = o && typeof o === "object" ? o : {};
  const store = opts.store;
  const els = opts.els || {};
  const widgets = opts.widgets || null;
  const storage = opts.storage || null;
  const ctx = opts.ctx || opts.media || {};
  const importer = opts.importer || ctx.importer || null;
  const tabsHost = els.libraryTabs || document.getElementById("libraryTabs");
  const bodyHost = els.libraryPanel || document.getElementById("libraryPanel");

  if (!store || !bodyHost) {
    warn("library", "store か #libraryPanel が無いので左パネルは作らない");
    return { render() {}, dispose() { return true; }, open() {}, get tab() { return ""; } };
  }

  /** 作った物 id -> {el, update, dispose} */
  const built = new Map();
  const cleanups = [];
  const thumbURLs = new Map();
  /** 選んでいる素材（タイムラインの選択とは別物） */
  const picked = new Set();
  let active = readTab();
  let raf = 0, disposed = false, lastAnchor = "";

  /* ── 3.1 部品の代わり（widgets が無い時も画面が死なない）──────── */
  function icon(name, glyph) {
    if (widgets && typeof widgets.icon === "function") {
      try { const g = widgets.icon(name); if (g && g.nodeType === 1) return g; } catch (e) { /* 下へ */ }
    }
    return EL("span", "vqs-ico vqs-ico--text", glyph || "");
  }
  function toast(msg, o2) {
    if (widgets && typeof widgets.toast === "function") {
      try { return widgets.toast(msg, o2); } catch (e) { /* 下へ */ }
    }
    warn("library", "toast:", msg);
    return null;
  }
  /** 触り所の在る所で開く一覧（モバイルはシート・机上はメニュー） */
  function popup(anchor, items, title) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return null;
    const small = window.matchMedia("(max-width: 1023px)").matches;
    if (!small && widgets && typeof widgets.menu === "function") {
      try { return widgets.menu(anchor, list); } catch (e) { /* 下へ */ }
    }
    if (widgets && typeof widgets.openSheet === "function") {
      const box = EL("div", "vqs-lib__sheet");
      const sheet = { close() {} };
      for (const it of list) {
        const b = EL("button", "vqs-lib__sheetitem" + (it.danger ? " is-danger" : ""), it.label);
        b.type = "button";
        b.onclick = () => { try { sheet.close(); } catch (e) { /* noop */ } if (it.onSelect) it.onSelect(); };
        box.appendChild(b);
      }
      try {
        const h = widgets.openSheet({ title: title || "", content: box });
        if (h && h.close) sheet.close = h.close;
        return h;
      } catch (e) { /* 下へ */ }
    }
    /* 最後の手段: 最初の 1 つを実行する（押しても何も起きないより良い） */
    if (list[0] && list[0].onSelect) list[0].onSelect();
    return null;
  }
  function button(label, cls, onClick, iconName, glyph) {
    const b = EL("button", cls || "vqs-btn");
    b.type = "button";
    if (iconName) b.appendChild(icon(iconName, glyph));
    b.appendChild(EL("span", "vqs-btn__label", label));
    b.addEventListener("click", (e) => { e.preventDefault(); try { onClick(e); } catch (err) { toast(msgOf(err), { kind: "error" }); } });
    return b;
  }

  /* ── 3.2 store への当て方（全部ここを通す）────────────────────── */
  const project = () => store.project;
  const playhead = () => Math.max(0, finite(store.view && store.view.playhead, 0));
  const fps = () => clamp(finite(project().settings && project().settings.fps, 30), 1, 240);
  const selClipIds = () => ((store.selection && store.selection.clipIds) || []).slice();

  function dispatch(label, type, payload) {
    try { return store.dispatch(type, payload, { label }); }
    catch (e) { toast(msgOf(e), { kind: "error" }); return null; }
  }
  function batch(label, fn) {
    try { return store.batch(label, fn); }
    catch (e) { toast(msgOf(e), { kind: "error" }); return null; }
  }

  /** 素材を再生ヘッド（か指定の時刻）へ入れる */
  function addAsset(assetId, at, extra) {
    const a = (project().assets || []).find((x) => x && x.id === assetId);
    if (!a) { toast("その素材が見つかりません", { kind: "warn" }); return null; }
    const payload = Object.assign({
      assetId, at: at === undefined ? playhead() : Math.max(0, finite(at, 0)),
      duration: a.kind === "image" ? IMAGE_DUR : undefined
    }, extra || {});
    const r = dispatch("素材を追加", "clip.add", payload);
    if (r && r.clipId) store.select([r.clipId], { trackId: r.trackId });
    return r;
  }
  /** BGM として入れる（音量 0.25・ダッキングの印つき・前後フェード） */
  function addAsBgm(assetId) {
    const a = (project().assets || []).find((x) => x && x.id === assetId);
    if (!a) return null;
    const r = batch("BGM を追加", (d) => {
      const add = d("clip.add", {
        assetId, at: 0, kind: "audio",
        volume: BGM_VOLUME,
        audioFade: { in: BGM_FADE, out: BGM_FADE, curve: "exp" }
      });
      const id = add && (add.clipId || add.id);
      if (id) {
        /* 印を 1 つ載せる（ui/inspector/audio.js の BGM_FX_TYPE と同じ綴り）。
           engine 側がまだ知らない印でも音は普通に鳴る（無害）。 */
        try { d("clip.addFx", { clipId: id, type: BGM_FX_TYPE, params: { duck: true } }); }
        catch (e) { warn("library", "BGM の印を付けられなかった", msgOf(e)); }
      }
      return add;
    });
    if (r && r.clipId) {
      store.select([r.clipId], { trackId: r.trackId });
      toast("BGM として追加しました（音量 25%・自動ダッキング）", { kind: "ok" });
    }
    return r;
  }
  /** 文字クリップを入れる（体裁 × 役 → TextSpec） */
  function addText(presetId, role, content) {
    const st = project().settings || {};
    const h = Math.max(120, finite(st.height, 1080));
    const s = roleSpec(presetId, role || "title");
    const spec = {
      kind: "text",
      name: String(content || "テキスト").slice(0, 20),
      at: playhead(), duration: 3,
      transform: { x: finite(s.x, 0), y: finite(s.y, 0) },
      text: {
        content: String(content === undefined ? "テキスト" : content),
        style: {
          font: "system", size: Math.round(clamp(finite(s.sizeRel, 0.06), 0.012, 0.3) * h),
          weight: finite(s.weight, 700), italic: false, color: String(s.color || "#ffffff"),
          stroke: s.stroke || { width: 0, color: "#000000" },
          shadow: s.shadow || { x: 0, y: 4, blur: 8, color: "#00000088" },
          bg: s.bg || null
        },
        layout: {
          align: String(s.align || "center"), vAlign: String(s.vAlign || "middle"),
          maxWidth: clamp(finite(s.maxWidth, 0.8), 0.1, 1), lineHeight: 1.25, letterSpacing: 0
        },
        anim: s.anim || { in: { type: "fadeUp", duration: 0.4 }, out: { type: "fade", duration: 0.3 }, unit: "all" }
      }
    };
    const r = dispatch("テキストを追加", "clip.add", { clip: spec, at: spec.at });
    if (r && r.clipId) {
      store.select([r.clipId], { trackId: r.trackId });
      try { document.dispatchEvent(new CustomEvent("vqs:clip-activate", { detail: { clipId: r.clipId, kind: "text", tab: "text" } })); }
      catch (e) { /* noop */ }
    }
    return r;
  }
  /** 図形・絵文字を入れる */
  function addShape(shape, name) {
    const spec = {
      kind: "shape", name: String(name || "図形"), at: playhead(), duration: 3,
      shape: Object.assign({ type: "rect", fill: "#ffffff", stroke: { width: 0, color: "#000000" }, radius: 0, w: 0.3, h: 0.2 }, shape || {})
    };
    const r = dispatch("図形を追加", "clip.add", { clip: spec, at: spec.at });
    if (r && r.clipId) store.select([r.clipId], { trackId: r.trackId });
    return r;
  }

  /** 選択中のクリップへ効果を当てる（選択が無ければ断る） */
  function applyFx(type, params) {
    const ids = selClipIds();
    if (!ids.length) { toast("先にタイムラインのクリップを選んでください（ドラッグでも当てられます）", { kind: "warn" }); return null; }
    return batch("効果を当てる", (d) => {
      for (const id of ids) d("clip.addFx", { clipId: id, type, params: params || {} });
    });
  }
  /** 選択中のクリップの境界へ遷移を当てる */
  function applyTransition(type, ids) {
    const list = (ids && ids.length ? ids : selClipIds());
    if (!list.length) { toast("先にクリップを選んでください（境界へドラッグしても当てられます）", { kind: "warn" }); return null; }
    return batch("遷移を当てる", (d) => {
      for (const id of list) d("clip.setTransition", { clipId: id, edge: "in", transition: { type, duration: 0.5 } });
    });
  }
  /** 選択中のクリップへ色（LUT か見た目）を当てる */
  function applyColor(patch, label) {
    const ids = selClipIds();
    if (!ids.length) { toast("先にクリップを選んでください", { kind: "warn" }); return null; }
    return batch(label || "色を当てる", (d) => { d("clip.setColor", { clipIds: ids, color: patch }); });
  }

  /* ── 3.3 登録表（動的 import。無ければ断り書き）───────────────── */
  const REG = { fx: null, transition: null, lut: null, shape: null };
  async function loadRegistry(kind) {
    if (REG[kind]) return REG[kind];
    const src = {
      fx: ["../engine/fx/registry.js", ["FX_REGISTRY", "REGISTRY", "FX", "default"], "効果"],
      transition: ["../engine/transitions.js", ["TRANSITIONS", "REGISTRY", "default"], "遷移"],
      lut: ["../engine/fx/luts.js", ["BUILTIN_LUTS", "LUTS", "LUT_REGISTRY", "REGISTRY", "default"], "フィルム"],
      shape: ["../engine/shapes.js", ["SHAPE_PRESETS", "SHAPES", "PRESETS", "default"], "図形"]
    }[kind];
    if (!src) return [];
    let mod = null;
    try { mod = await import(src[0]); } catch (e) { mod = null; }
    let raw = null;
    if (mod) for (const n of src[1]) if (mod[n]) { raw = mod[n]; break; }
    REG[kind] = normalizeRegistry(raw, src[2]);
    return REG[kind];
  }

  /* ── 3.4 タブの骨組み ───────────────────────────────────────── */
  function readTab() {
    try {
      const v = localStorage.getItem(LAST_TAB_KEY);
      if (v && LIB_TABS.some((t) => t.id === v)) return v;
    } catch (e) { /* 使えない環境 */ }
    return "media";
  }
  function writeTab(id) { try { localStorage.setItem(LAST_TAB_KEY, id); } catch (e) { /* noop */ } }

  function buildTabs() {
    if (!tabsHost || tabsHost.dataset.vqsReady === "1") return;
    tabsHost.dataset.vqsReady = "1";
    tabsHost.setAttribute("role", "tablist");
    tabsHost.setAttribute("aria-orientation", "vertical");
    for (const t of LIB_TABS) {
      const b = EL("button", "vqs-vtab");
      b.type = "button";
      b.dataset.tab = t.id;
      b.setAttribute("role", "tab");
      b.setAttribute("data-test", "lib-tab-" + t.id);
      b.setAttribute("title", t.label);
      b.appendChild(icon(t.icon, t.glyph));
      b.appendChild(EL("span", "vqs-vtab__label", t.label));
      b.addEventListener("click", () => open(t.id));
      tabsHost.appendChild(b);
    }
    tabsHost.addEventListener("keydown", (e) => {
      const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const i = LIB_TABS.findIndex((t) => t.id === active);
      open(LIB_TABS[(i + dir + LIB_TABS.length) % LIB_TABS.length].id);
      const nb = tabsHost.querySelector('[data-tab="' + active + '"]');
      if (nb) nb.focus();
    });
  }

  /** タブを開く（中身はここで初めて作る） */
  function open(id) {
    const tab = LIB_TABS.find((t) => t.id === id) ? id : "media";
    active = tab;
    writeTab(tab);
    if (tabsHost) {
      for (const b of tabsHost.querySelectorAll("[data-tab]")) {
        const on = b.dataset.tab === tab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      }
    }
    ensure(tab);
    for (const [key, part] of built) part.el.hidden = key !== tab;
    paint();
  }

  const BUILDERS = {
    media: buildMedia, text: buildText, audio: buildAudio, sticker: buildSticker,
    fx: buildFxTab, transition: buildTransitionTab, filter: buildFilterTab, template: buildTemplateTab
  };
  function ensure(id) {
    if (built.has(id)) return built.get(id);
    let part = null;
    try { part = BUILDERS[id](); }
    catch (e) {
      warn("library", `${id} タブを作れなかった`, e);
      const box = EL("div", "vqs-lib vqs-lib--error");
      box.appendChild(EL("p", "vqs-lib__note", "この一覧を出せませんでした: " + msgOf(e)));
      part = { el: box, update() {}, dispose() {} };
    }
    part.el.dataset.libTab = id;
    part.el.setAttribute("role", "tabpanel");
    bodyHost.appendChild(part.el);
    built.set(id, part);
    return part;
  }
  function paint() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (disposed) return;
    const part = built.get(active);
    if (part && part.update) {
      try { part.update(); } catch (e) { warn("library", "更新で失敗", e); }
    }
  }
  function schedule() {
    if (raf || disposed) return;
    raf = requestAnimationFrame(paint);
  }

  /* ── 4. 素材タブ ────────────────────────────────────────────── */
  function buildMedia() {
    const root = EL("div", "vqs-lib vqs-lib--media");
    root.setAttribute("data-test", "lib-media");
    const st = { query: "", kind: "all", sort: "added", sig: "" };

    /* 追加の口 */
    const actions = EL("div", "vqs-lib__actions");
    actions.appendChild(button("素材を追加", "vqs-btn vqs-btn--primary vqs-lib__add", () => {
      if (!importer) { toast("取り込みを読み込めませんでした", { kind: "error" }); return; }
      importer.pickFiles({});
    }, "plus", "＋"));
    actions.appendChild(button("URL から", "vqs-btn vqs-btn--ghost", askURL, "link", "🔗"));
    root.appendChild(actions);

    /* 絞り込み */
    const bar = EL("div", "vqs-lib__filter");
    const search = EL("input", "vqs-lib__search");
    search.type = "search";
    search.placeholder = "名前で探す";
    search.setAttribute("aria-label", "素材を名前で探す");
    search.addEventListener("input", () => { st.query = search.value; st.sig = ""; paint(); });
    bar.appendChild(search);

    const kinds = EL("div", "vqs-lib__kinds");
    kinds.setAttribute("role", "group");
    for (const k of [["all", "すべて"], ["video", "映像"], ["image", "画像"], ["audio", "音"]]) {
      const c = EL("button", "vqs-chip", k[1]);
      c.type = "button";
      c.dataset.kind = k[0];
      c.addEventListener("click", () => {
        st.kind = k[0]; st.sig = "";
        for (const x of kinds.children) x.classList.toggle("is-on", x.dataset.kind === st.kind);
        paint();
      });
      if (k[0] === st.kind) c.classList.add("is-on");
      kinds.appendChild(c);
    }
    bar.appendChild(kinds);

    const sort = EL("select", "vqs-lib__sort");
    sort.setAttribute("aria-label", "並べ替え");
    for (const s of [["added", "追加順"], ["name", "名前"], ["duration", "尺の長い順"], ["uses", "使用回数"]]) {
      const op = EL("option", null, s[1]);
      op.value = s[0];
      sort.appendChild(op);
    }
    sort.value = st.sort;
    sort.addEventListener("change", () => { st.sort = sort.value; st.sig = ""; paint(); });
    bar.appendChild(sort);
    /* 「未使用を選ぶ」は選択が空でも押せないと意味が無いので、絞り込みの列に置く */
    bar.appendChild(button("未使用を選ぶ", "vqs-btn vqs-btn--ghost vqs-btn--sm vqs-lib__unused", () => {
      picked.clear();
      for (const id of unusedAssetIds(project())) picked.add(id);
      if (!picked.size) toast("すべての素材が使われています", { kind: "ok" });
      paint();
    }));
    root.appendChild(bar);

    /* 選択中の帯 */
    const selBar = EL("div", "vqs-lib__selbar");
    const selText = EL("span", "vqs-lib__seltext");
    selBar.appendChild(selText);
    selBar.appendChild(button("すべて選ぶ", "vqs-btn vqs-btn--ghost vqs-btn--sm", () => {
      for (const n of grid.querySelectorAll("[data-asset-id]")) picked.add(n.dataset.assetId);
      paint();
    }));
    selBar.appendChild(button("選択を解除", "vqs-btn vqs-btn--ghost vqs-btn--sm", () => { picked.clear(); paint(); }));
    selBar.appendChild(button("削除", "vqs-btn vqs-btn--danger vqs-btn--sm", removePicked));
    root.appendChild(selBar);

    const grid = EL("div", "vqs-lib__grid");
    grid.setAttribute("role", "listbox");
    grid.setAttribute("aria-multiselectable", "true");
    grid.setAttribute("data-test", "lib-grid");
    root.appendChild(grid);
    const empty = EL("p", "vqs-lib__empty");
    root.appendChild(empty);

    /* ここへも落とせる（左パネルはいつでも受け皿） */
    if (importer && typeof importer.dropTarget === "function") cleanups.push(importer.dropTarget(root, {}));

    function removePicked() {
      const ids = Array.from(picked);
      if (!ids.length) { toast("削除する素材を選んでください", { kind: "warn" }); return; }
      let clips = 0;
      for (const id of ids) clips += countUses(project(), id);
      batch("素材を削除", (d) => { for (const id of ids) d("asset.remove", { assetId: id }); });
      picked.clear();
      st.sig = "";
      toast(clips
        ? `${ids.length} 件の素材と、それを使っていた ${clips} 個のクリップを削除しました（Ctrl+Z で戻せます）`
        : `${ids.length} 件の素材を削除しました（Ctrl+Z で戻せます）`, { kind: "ok", ms: 4000 });
      paint();
    }
    async function askURL() {
      if (!importer) { toast("取り込みを読み込めませんでした", { kind: "error" }); return; }
      const box = EL("div", "vqs-lib__urlform");
      const inp = EL("input", "vqs-lib__url");
      inp.type = "url";
      inp.placeholder = "https://…";
      inp.setAttribute("aria-label", "素材の URL");
      box.appendChild(inp);
      box.appendChild(EL("p", "vqs-lib__note", "相手のサーバが別サイトからの読み込みを許していない（CORS）場合は取り込めません。その時は一度端末に保存してから入れてください。"));
      const run = () => { const v = inp.value.trim(); if (v) importer.addFromURL(v); };
      if (widgets && typeof widgets.openModal === "function") {
        try {
          const h = widgets.openModal({
            title: "URL から取り込む", content: box,
            actions: [{ label: "やめる", kind: "ghost" }, { label: "取り込む", kind: "primary", onSelect: run }]
          });
          setTimeout(() => inp.focus(), 60);
          inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { run(); if (h && h.close) h.close(); } });
          return;
        } catch (e) { /* 下へ */ }
      }
      const v = typeof prompt === "function" ? prompt("素材の URL") : "";
      if (v) importer.addFromURL(String(v).trim());
    }

    /** カード 1 枚 */
    function card(a, uses) {
      const c = EL("div", "vqs-asset");
      c.dataset.assetId = a.id;
      c.dataset.kind = a.kind;
      c.draggable = true;
      c.tabIndex = 0;
      c.setAttribute("role", "option");
      c.setAttribute("data-test", "lib-asset");
      c.title = `${a.name || "名前なし"}\n${KIND_LABEL[a.kind] || a.kind} · ${durLabel(a)}${a.width ? ` · ${a.width}×${a.height}` : ""}${a.size ? ` · ${formatBytes(a.size)}` : ""}`;

      const thumb = EL("div", "vqs-asset__thumb");
      c.appendChild(thumb);
      attachThumb(thumb, a);
      c.appendChild(EL("span", "vqs-asset__dur", durLabel(a)));
      c.appendChild(EL("span", "vqs-asset__kind", KIND_LABEL[a.kind] || a.kind));
      const uc = EL("span", "vqs-asset__uses", uses > 0 ? "×" + uses : "未使用");
      uc.dataset.used = uses > 0 ? "1" : "0";
      c.appendChild(uc);
      c.appendChild(EL("div", "vqs-asset__name", a.name || "名前なし"));

      const scan = EL("div", "vqs-asset__scan");
      scan.appendChild(EL("i", "vqs-asset__scanfill"));
      scan.appendChild(EL("span", "vqs-asset__scantext"));
      c.appendChild(scan);

      const add = EL("button", "vqs-asset__add");
      add.type = "button";
      add.setAttribute("aria-label", "再生ヘッドの位置へ追加");
      add.appendChild(icon("plus", "＋"));
      add.addEventListener("click", (e) => { e.stopPropagation(); addAsset(a.id); });
      c.appendChild(add);

      /* 選ぶ・開く */
      c.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey) { picked.has(a.id) ? picked.delete(a.id) : picked.add(a.id); }
        else if (e.shiftKey && lastAnchor) { rangeSelect(lastAnchor, a.id); }
        else { picked.clear(); picked.add(a.id); }
        lastAnchor = a.id;
        /* 指紋（sig）は触らない。選んだだけで組み直すとサムネと焦点が飛ぶ */
        paint();
      });
      c.addEventListener("dblclick", (e) => { e.preventDefault(); addAsset(a.id); });
      c.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addAsset(a.id); }
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); picked.clear(); picked.add(a.id); removePicked(); }
      });
      c.addEventListener("dragstart", (e) => {
        try {
          e.dataTransfer.setData("application/x-vqs-asset", a.id);
          e.dataTransfer.setData("text/plain", a.id);
          e.dataTransfer.effectAllowed = "copy";
        } catch (err) { /* noop */ }
        c.classList.add("is-dragging");
      });
      c.addEventListener("dragend", () => c.classList.remove("is-dragging"));
      attachLongPress(c, () => menuFor(a, c));
      return c;
    }
    function rangeSelect(fromId, toId) {
      const ids = Array.from(grid.querySelectorAll("[data-asset-id]")).map((n) => n.dataset.assetId);
      const a = ids.indexOf(fromId), b = ids.indexOf(toId);
      if (a < 0 || b < 0) { picked.add(toId); return; }
      picked.clear();
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) picked.add(ids[i]);
    }
    function menuFor(a, anchor) {
      const items = [
        { label: "再生ヘッドの位置へ追加", onSelect: () => addAsset(a.id) },
        { label: "いちばん後ろへ追加", onSelect: () => addAsset(a.id, endOfProject()) }
      ];
      if (a.kind === "audio") items.push({ label: "BGM として追加（音量 25%）", onSelect: () => addAsBgm(a.id) });
      if (a.kind !== "audio") items.push({ label: "背景にする", onSelect: () => dispatch("背景を変える", "settings.update", { patch: { background: { type: "image", assetId: a.id } } }) });
      items.push({ label: "もう一度解析する", onSelect: () => { if (importer && importer.analyze) { importer.analyze([a.id]); toast("解析を始めました", { kind: "ok" }); } else toast("解析を読み込めませんでした", { kind: "warn" }); } });
      items.push({ label: "情報", onSelect: () => showInfo(a) });
      items.push({ label: "削除", danger: true, onSelect: () => { picked.clear(); picked.add(a.id); removePicked(); } });
      popup(anchor, items, a.name || "素材");
    }
    function showInfo(a) {
      const rows = [
        ["名前", a.name || "—"], ["種類", KIND_LABEL[a.kind] || a.kind],
        ["形式", a.mime || "不明"], ["尺", durLabel(a)],
        ["寸法", a.width ? `${a.width}×${a.height}` : "—"],
        ["fps", a.fps ? String(a.fps) : "分からない"],
        ["音", a.kind === "image" ? "—" : (a.hasAudio ? "在り" : "無し")],
        ["容量", a.size ? formatBytes(a.size) : "—"],
        ["使用", countUses(project(), a.id) + " 箇所"],
        ["解析", scanLabel(importer && importer.analysisState ? importer.analysisState(a.id) : null) || (a.analysis ? "解析済" : "まだ")]
      ];
      const box = EL("dl", "vqs-lib__info");
      for (const r of rows) {
        box.appendChild(EL("dt", null, r[0]));
        box.appendChild(EL("dd", null, String(r[1])));
      }
      if (widgets && typeof widgets.openSheet === "function") {
        try { widgets.openSheet({ title: a.name || "素材の情報", content: box }); return; }
        catch (e) { /* 下へ */ }
      }
      toast(rows.map((r) => r[0] + ": " + r[1]).join(" / "), { ms: 6000 });
    }
    const endOfProject = () => {
      let end = 0;
      for (const tr of (project().tracks || [])) {
        for (const cl of ((tr && tr.clips) || [])) end = Math.max(end, finite(cl.start, 0) + finite(cl.duration, 0));
      }
      return end;
    };

    function update() {
      const p = project();
      const assets = p.assets || [];
      const uses = {};
      for (const a of assets) if (a) uses[a.id] = countUses(p, a.id);
      /* 見た目が変わらない時は組み直さない（指の下から要素を消さない） */
      const sig = [st.query, st.kind, st.sort, assets.length,
        assets.map((a) => a && a.id + ":" + a.name + ":" + (uses[a.id] || 0)).join(",")].join("|");
      const list = filterAssets(assets, { query: st.query, kind: st.kind, sort: st.sort, uses });
      if (sig !== st.sig) {
        st.sig = sig;
        grid.textContent = "";
        for (const a of list) grid.appendChild(card(a, uses[a.id] || 0));
      }
      for (const n of grid.querySelectorAll("[data-asset-id]")) {
        n.classList.toggle("is-picked", picked.has(n.dataset.assetId));
        n.setAttribute("aria-selected", picked.has(n.dataset.assetId) ? "true" : "false");
      }
      paintScan(grid);
      empty.hidden = list.length > 0;
      empty.textContent = assets.length
        ? "この条件に合う素材が在りません。"
        : "まだ素材が在りません。「素材を追加」か、ここへファイルを落としてください。";
      selBar.hidden = picked.size === 0;
      selText.textContent = picked.size ? `${picked.size} 件を選択中` : "";
    }
    return { el: root, update, dispose() {} };
  }

  /** サムネを貼る（取り込み時に作った 1 枚。無ければ CSS の代わり絵） */
  function attachThumb(host, a) {
    if (!storage || typeof storage.getThumbSheet !== "function") return;
    const cached = thumbURLs.get(a.id);
    if (cached === null) return;                       // 前に「無い」と分かっている
    if (cached) { host.appendChild(imgOf(cached, a)); return; }
    storage.getThumbSheet(a.id).then((blob) => {
      if (disposed || !blob) { if (!blob) thumbURLs.set(a.id, null); return; }
      let url = "";
      try { url = URL.createObjectURL(blob); } catch (e) { url = ""; }
      if (!url) { thumbURLs.set(a.id, null); return; }
      thumbURLs.set(a.id, url);
      if (host.isConnected) host.appendChild(imgOf(url, a));
    }).catch(() => thumbURLs.set(a.id, null));
  }
  function imgOf(url, a) {
    const im = EL("img", "vqs-asset__img");
    im.src = url;
    im.alt = "";
    im.loading = "lazy";
    im.decoding = "async";
    im.draggable = false;
    im.width = 320;
    im.height = Math.round(320 * (a.height && a.width ? a.height / a.width : 0.5625));
    return im;
  }
  /** 解析の帯だけを塗り直す（組み直さない） */
  function paintScan(scope) {
    if (!importer || typeof importer.analysisState !== "function") return;
    const done = new Set();
    for (const a of (project().assets || [])) if (a && a.analysis) done.add(String(a.id));
    for (const n of scope.querySelectorAll("[data-asset-id]")) {
      const id = n.dataset.assetId;
      const stt = importer.analysisState(id);
      const status = stt.status === "none" && done.has(id) ? "done" : stt.status;
      const box = n.querySelector(".vqs-asset__scan");
      if (!box) continue;
      box.dataset.status = status;
      box.hidden = status === "none" || status === "done";
      const fill = box.querySelector(".vqs-asset__scanfill");
      if (fill) fill.style.width = Math.round(clamp(finite(stt.p, 0), 0, 1) * 100) + "%";
      const tx = box.querySelector(".vqs-asset__scantext");
      if (tx) tx.textContent = scanLabel({ status, p: stt.p });
      n.dataset.scan = status;
    }
  }

  /** 長押し（モバイルの追加メニュー。Pointer Events・44px は CSS 側） */
  function attachLongPress(el, onLong) {
    let timer = 0, sx = 0, sy = 0, id = -1;
    const clear = () => { if (timer) { clearTimeout(timer); timer = 0; } id = -1; };
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;            // 机上は右クリック
      id = e.pointerId; sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => {
        timer = 0;
        el.classList.add("vqs-flash");
        setTimeout(() => el.classList.remove("vqs-flash"), 90);
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) { /* iOS には無い */ }
        onLong();
      }, LONG_PRESS_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id || !timer) return;
      if (Math.abs(e.clientX - sx) > TAP_SLOP || Math.abs(e.clientY - sy) > TAP_SLOP) clear();
    });
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); onLong(); });
  }

  /* ── 5. テキスト / オーディオ / ステッカー ─────────────────────── */
  function buildText() {
    const root = EL("div", "vqs-lib vqs-lib--text");
    root.setAttribute("data-test", "lib-text");
    root.appendChild(button("テキストを追加", "vqs-btn vqs-btn--primary vqs-lib__add", () => addText("impact", "title", "テキスト"), "type", "T"));
    root.appendChild(EL("h4", "vqs-lib__h", "見本から入れる"));
    const grid = EL("div", "vqs-lib__grid vqs-lib__grid--text");
    for (const id of TEXT_PRESET_IDS) {
      const pr = TEXT_PRESETS[id];
      for (const role of ["title", "caption", "lower"]) {
        const s = roleSpec(id, role);
        const cell = EL("button", "vqs-preset vqs-preset--text");
        cell.type = "button";
        cell.dataset.preset = id + ":" + role;
        cell.setAttribute("data-test", "lib-textpreset");
        const sample = EL("span", "vqs-preset__sample", role === "title" ? "見出し" : role === "caption" ? "字幕になる文" : "名前・肩書き");
        /* 見本は CSS で表現する（重い画像は作らない）。色と太さだけ実物に寄せる */
        sample.style.color = String(s.color || "#fff");
        sample.style.fontWeight = String(finite(s.weight, 700));
        if (s.bg && s.bg.color) {
          sample.style.background = String(s.bg.color);
          sample.style.borderRadius = Math.min(999, finite(s.bg.radius, 8)) + "px";
        }
        if (s.stroke && finite(s.stroke.width, 0) > 0) sample.style.webkitTextStroke = "0.5px " + String(s.stroke.color || "#000");
        cell.appendChild(sample);
        cell.appendChild(EL("span", "vqs-preset__name", `${pr.name} · ${role === "title" ? "見出し" : role === "caption" ? "字幕" : "下帯"}`));
        cell.addEventListener("click", () => addText(id, role, role === "title" ? "見出し" : "テキスト"));
        grid.appendChild(cell);
      }
    }
    root.appendChild(grid);

    root.appendChild(EL("h4", "vqs-lib__h", "字幕"));
    const subRow = EL("div", "vqs-lib__row");
    subRow.appendChild(button("字幕を読み込む（SRT / VTT）", "vqs-btn vqs-btn--ghost", pickSubtitle, "captions", "⌶"));
    root.appendChild(subRow);
    root.appendChild(EL("p", "vqs-lib__note", "読み込んだ字幕は 1 行ずつテキストのクリップになります。体裁は右の「文字」タブでまとめて変えられます。"));

    function pickSubtitle() {
      const inp = EL("input");
      inp.type = "file";
      inp.accept = ".srt,.vtt,text/vtt,text/plain";
      inp.hidden = true;
      document.body.appendChild(inp);
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) return;
        let text = "";
        try { text = await f.text(); }
        catch (e) { toast("字幕ファイルを読めませんでした: " + msgOf(e), { kind: "error" }); return; }
        const r = dispatch("字幕を読み込む", "subtitle.import", { srt: text, name: f.name });
        if (r && r.count) toast(`${r.count} 行の字幕を入れました`, { kind: "ok" });
      };
      inp.click();
    }
    return { el: root, update() {}, dispose() {} };
  }

  function buildAudio() {
    const root = EL("div", "vqs-lib vqs-lib--audio");
    root.setAttribute("data-test", "lib-audio");
    const actions = EL("div", "vqs-lib__actions");
    actions.appendChild(button("音を追加", "vqs-btn vqs-btn--primary", () => {
      if (!importer) { toast("取り込みを読み込めませんでした", { kind: "error" }); return; }
      importer.pickFiles({ accept: "audio/*" });
    }, "plus", "＋"));
    const recBtn = button("録音する", "vqs-btn vqs-btn--ghost vqs-lib__rec", toggleRecord, "mic", "●");
    actions.appendChild(recBtn);
    root.appendChild(actions);
    const recNote = EL("p", "vqs-lib__note");
    root.appendChild(recNote);

    const list = EL("div", "vqs-lib__grid vqs-lib__grid--audio");
    list.setAttribute("role", "listbox");
    root.appendChild(list);
    const empty = EL("p", "vqs-lib__empty", "まだ音の素材が在りません。");
    root.appendChild(empty);

    /** 録音（engine/audio/graph.js の recordVoice） */
    let rec = null, recStart = 0;
    function audioEngine() { return ctx.audio || (ctx.parts && ctx.parts.audio) || null; }
    async function toggleRecord() {
      const eng = audioEngine();
      if (!eng || typeof eng.recordVoice !== "function") {
        toast("この端末では録音を使えません（音の部品を読み込めませんでした）", { kind: "warn" });
        return;
      }
      if (rec) {
        const h = rec;
        rec = null;
        recBtn.classList.remove("is-on");
        recBtn.querySelector(".vqs-btn__label").textContent = "録音する";
        recNote.textContent = "録音を取り込んでいます…";
        let blob = null;
        try { blob = await h.stop(); }
        catch (e) { recNote.textContent = "録音を止められませんでした: " + msgOf(e); return; }
        if (!blob || !blob.size) { recNote.textContent = "録音が空でした。マイクの許可を確かめてください。"; return; }
        const name = "録音 " + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) +
          (String(blob.type).indexOf("mp4") >= 0 ? ".m4a" : ".webm");
        let file = blob;
        try { file = new File([blob], name, { type: blob.type || "audio/webm" }); } catch (e) { /* Blob のまま */ }
        if (importer && typeof importer.addFiles === "function") {
          const r = await importer.addFiles([file], { place: true, at: recStart });
          recNote.textContent = r && r.counts && r.counts.added ? "録音を入れました。" : "録音を入れられませんでした。";
        } else recNote.textContent = "取り込みを読み込めませんでした。";
        paint();
        return;
      }
      try {
        const start = playhead();
        const h = eng.recordVoice({ start });
        if (!h || typeof h.stop !== "function") throw new Error("録音を始められませんでした");
        recStart = start;
        rec = h;
        recBtn.classList.add("is-on");
        recBtn.querySelector(".vqs-btn__label").textContent = "録音を止める";
        recNote.textContent = "録音中…（もう一度押すと止まります）";
      } catch (e) {
        toast("録音を始められませんでした: " + msgOf(e), { kind: "error" });
        recNote.textContent = "マイクの許可が必要です。";
      }
    }

    function row(a) {
      const r = EL("div", "vqs-asset vqs-asset--audio");
      r.dataset.assetId = a.id;
      r.dataset.kind = "audio";
      r.draggable = true;
      r.tabIndex = 0;
      r.appendChild(EL("div", "vqs-asset__thumb"));
      r.appendChild(EL("div", "vqs-asset__name", a.name || "名前なし"));
      r.appendChild(EL("span", "vqs-asset__dur", durLabel(a)));
      const scan = EL("div", "vqs-asset__scan");
      scan.appendChild(EL("i", "vqs-asset__scanfill"));
      scan.appendChild(EL("span", "vqs-asset__scantext"));
      r.appendChild(scan);
      const acts = EL("div", "vqs-asset__acts");
      acts.appendChild(button("追加", "vqs-btn vqs-btn--sm", () => addAsset(a.id)));
      acts.appendChild(button("BGM に", "vqs-btn vqs-btn--sm vqs-btn--ghost", () => addAsBgm(a.id)));
      r.appendChild(acts);
      r.addEventListener("dblclick", () => addAsset(a.id));
      r.addEventListener("dragstart", (e) => {
        try {
          e.dataTransfer.setData("application/x-vqs-asset", a.id);
          e.dataTransfer.setData("text/plain", a.id);
        } catch (x) { /* noop */ }
      });
      attachLongPress(r, () => popup(r, [
        { label: "再生ヘッドへ追加", onSelect: () => addAsset(a.id) },
        { label: "BGM として追加（音量 25%）", onSelect: () => addAsBgm(a.id) }
      ], a.name || "音"));
      return r;
    }
    let sig = "";
    function update() {
      const audios = (project().assets || []).filter((a) => a && a.kind === "audio");
      const s = audios.map((a) => a.id + ":" + a.name).join(",");
      if (s !== sig) {
        sig = s;
        list.textContent = "";
        for (const a of audios) list.appendChild(row(a));
      }
      paintScan(list);
      empty.hidden = audios.length > 0;
    }
    return {
      el: root, update,
      dispose() { if (rec && rec.stop) { try { rec.stop(); } catch (e) { /* noop */ } rec = null; } }
    };
  }

  function buildSticker() {
    const root = EL("div", "vqs-lib vqs-lib--sticker");
    root.setAttribute("data-test", "lib-sticker");
    root.appendChild(EL("h4", "vqs-lib__h", "図形"));
    const shapes = EL("div", "vqs-lib__grid vqs-lib__grid--shape");
    root.appendChild(shapes);
    root.appendChild(EL("h4", "vqs-lib__h", "絵文字"));
    const emo = EL("div", "vqs-lib__grid vqs-lib__grid--emoji");
    for (const ch of EMOJI) {
      const b = EL("button", "vqs-preset vqs-preset--emoji", ch);
      b.type = "button";
      b.setAttribute("aria-label", "絵文字 " + ch);
      b.addEventListener("click", () => addText("impact", "title", ch));
      emo.appendChild(b);
    }
    root.appendChild(emo);
    root.appendChild(EL("p", "vqs-lib__note", "絵文字は「大きな文字」として入ります。大きさと位置は右の「変形」タブで変えられます。"));

    /** SHAPE_PRESETS が在ればそれを、無ければ schema の SHAPE_TYPES を出す */
    let filled = false;
    async function fill() {
      if (filled) return;
      filled = true;
      const reg = await loadRegistry("shape");
      const list = reg.length
        ? reg
        : SHAPE_TYPES.map((t) => ({ id: t, label: { rect: "四角", ellipse: "丸", triangle: "三角", arrow: "矢印", line: "線", star: "星" }[t] || t, params: null }));
      shapes.textContent = "";
      for (const e of list) {
        const b = EL("button", "vqs-preset vqs-preset--shape");
        b.type = "button";
        b.dataset.shape = e.id;
        b.setAttribute("data-test", "lib-shape");
        const fig = EL("span", "vqs-preset__fig");
        fig.dataset.shape = String((e.params && e.params.type) || e.id);
        b.appendChild(fig);
        b.appendChild(EL("span", "vqs-preset__name", e.label));
        b.addEventListener("click", () => {
          const sp = e.params && typeof e.params === "object" ? e.params : { type: e.id };
          addShape(sp, e.label);
        });
        shapes.appendChild(b);
      }
    }
    return { el: root, update: fill, dispose() {} };
  }

  /* ── 6. エフェクト / 遷移 / フィルター / テンプレート ──────────── */

  /** 一覧を分類ごとに並べる（押す＝選択へ / 引く＝クリップへ） */
  function buildPicker(o2) {
    const root = EL("div", "vqs-lib vqs-lib--" + o2.cls);
    root.setAttribute("data-test", "lib-" + o2.cls);
    if (o2.head) root.appendChild(EL("p", "vqs-lib__note", o2.head));
    const body = EL("div", "vqs-lib__groups");
    root.appendChild(body);
    const note = EL("p", "vqs-lib__empty");
    root.appendChild(note);
    let filled = false;
    async function fill() {
      if (filled) return;
      filled = true;
      let list = [];
      try { list = await o2.load(); } catch (e) { list = []; }
      body.textContent = "";
      if (!list.length) {
        note.hidden = false;
        note.textContent = o2.emptyText;
        return;
      }
      note.hidden = true;
      for (const g of byGroup(list)) {
        const sec = EL("section", "vqs-lib__group");
        sec.appendChild(EL("h4", "vqs-lib__h", g.group));
        const grid = EL("div", "vqs-lib__grid vqs-lib__grid--preset");
        for (const e of g.items) {
          const b = EL("button", "vqs-preset vqs-preset--" + o2.cls);
          b.type = "button";
          b.draggable = true;
          b.dataset.id = e.id;
          b.title = e.hint || e.label;
          b.setAttribute("data-test", "lib-" + o2.cls + "-item");
          const fig = EL("span", "vqs-preset__fig");
          fig.dataset.preset = e.id;
          b.appendChild(fig);
          b.appendChild(EL("span", "vqs-preset__name", e.label));
          b.addEventListener("click", () => o2.apply(e));
          b.addEventListener("dragstart", (ev) => {
            try {
              ev.dataTransfer.setData(o2.dndType, e.id);
              ev.dataTransfer.setData("text/plain", e.label);
              ev.dataTransfer.effectAllowed = "copy";
            } catch (x) { /* noop */ }
            b.classList.add("is-dragging");
          });
          b.addEventListener("dragend", () => b.classList.remove("is-dragging"));
          attachLongPress(b, () => popup(b, [{ label: "選択中のクリップへ当てる", onSelect: () => o2.apply(e) }], e.label));
          grid.appendChild(b);
        }
        if (!grid.children.length) continue;
        sec.appendChild(grid);
        body.appendChild(sec);
      }
    }
    return { el: root, update: fill, dispose() {} };
  }

  function buildFxTab() {
    return buildPicker({
      cls: "fx", dndType: "application/x-vqs-fx",
      head: "押すと選択中のクリップへ、クリップへ引いて落とすとその 1 つへ当たります。",
      emptyText: "効果の一覧（engine/fx/registry.js）をまだ読み込めません。",
      load: () => loadRegistry("fx"),
      apply: (e) => applyFx(e.id, defaultsOf(e))
    });
  }
  function buildTransitionTab() {
    return buildPicker({
      cls: "transition", dndType: "application/x-vqs-transition",
      head: "クリップの境界へ引いて落とすか、クリップを選んで押してください（0.5 秒で入ります）。",
      emptyText: "遷移の一覧（engine/transitions.js）をまだ読み込めません。",
      load: () => loadRegistry("transition"),
      apply: (e) => applyTransition(e.id)
    });
  }
  function buildFilterTab() {
    return buildPicker({
      cls: "filter", dndType: "application/x-vqs-filter",
      head: "色の見た目と LUT。選択中のクリップへ当たります。",
      emptyText: "",
      load: async () => {
        const luts = await loadRegistry("lut");
        const looks = Object.keys(COLOR_LOOKS).map((k) => ({
          id: "look:" + k, label: (LOOK_NAMES && LOOK_NAMES[k]) || k, group: "色の見た目", params: null, hint: ""
        }));
        const none = [{ id: "none", label: "なし（元に戻す）", group: "色の見た目", params: null, hint: "" }];
        return none.concat(looks, luts.map((l) => ({ id: "lut:" + l.id, label: l.label, group: "フィルム（LUT）", params: null, hint: l.hint })));
      },
      apply: (e) => {
        if (e.id === "none") return applyColor(null, "色を戻す");
        if (e.id.indexOf("look:") === 0) {
          const g = gradeForLook(e.id.slice(5));
          return applyColor(g || {}, "見た目を当てる");
        }
        return applyColor({ lut: { id: e.id.slice(4), amount: 1 } }, "LUT を当てる");
      }
    });
  }
  /** 効果の既定値（params が {key:{def}} でも {key:value} でも拾う） */
  function defaultsOf(e) {
    const out = {};
    const p = e && e.params;
    if (!p || typeof p !== "object") return out;
    const each = Array.isArray(p) ? p : Object.keys(p).map((k) => Object.assign({ key: k }, typeof p[k] === "object" ? p[k] : { def: p[k] }));
    for (const s of each) {
      const key = String((s && (s.key || s.id || s.name)) || "");
      if (!key) continue;
      const v = s.def !== undefined ? s.def : (s.value !== undefined ? s.value : s.default);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }

  function buildTemplateTab() {
    const root = EL("div", "vqs-lib vqs-lib--template");
    root.setAttribute("data-test", "lib-template");
    root.appendChild(EL("p", "vqs-lib__note", "素材を入れてから選ぶと、そのまま自動編集に進めます。"));
    const grid = EL("div", "vqs-lib__grid vqs-lib__grid--template");
    for (const id of Object.keys(TEMPLATES)) {
      const t = TEMPLATES[id];
      const c = EL("button", "vqs-preset vqs-preset--template");
      c.type = "button";
      c.dataset.template = id;
      c.setAttribute("data-test", "lib-template-item");
      c.appendChild(EL("span", "vqs-preset__fig"));
      c.appendChild(EL("span", "vqs-preset__name", t.name));
      c.appendChild(EL("span", "vqs-preset__hint", t.description || ""));
      c.appendChild(EL("span", "vqs-preset__meta", `${Math.round(finite(t.targetDuration, 60))} 秒 · 1 ショット ${finite(t.avgShot, 2)} 秒`));
      c.addEventListener("click", () => useTemplate(id, t));
      grid.appendChild(c);
    }
    root.appendChild(grid);
    function useTemplate(id, t) {
      if (!(project().assets || []).length) { toast("先に素材を入れてください", { kind: "warn" }); return; }
      const ai = ctx.app && ctx.app.parts ? ctx.app.parts.ai : (ctx.parts && ctx.parts.ai) || null;
      if (ai && typeof ai.open === "function") {
        try { ai.open("create", { templateId: id, template: t }); return; }
        catch (e) { warn("library", "AI パネルを開けなかった", msgOf(e)); }
      }
      try { document.dispatchEvent(new CustomEvent("vqs:ai-template", { detail: { templateId: id, template: t } })); }
      catch (e) { /* noop */ }
      toast(`「${t.name}」で自動編集を始めます`, { kind: "ok" });
    }
    return { el: root, update() {}, dispose() {} };
  }

  /* ── 7. 効果・遷移・フィルターの投下（受け手が居ないので自分で）── */
  function attachTimelineDrops() {
    const host = els.tlTracks || document.getElementById("tlTracks");
    if (!host) return;
    const TYPES = ["application/x-vqs-fx", "application/x-vqs-transition", "application/x-vqs-filter"];
    const typeOf = (dt) => {
      if (!dt || !dt.types) return "";
      const has = (n) => (typeof dt.types.contains === "function" ? dt.types.contains(n) : Array.prototype.indexOf.call(dt.types, n) >= 0);
      return TYPES.find(has) || "";
    };
    let hot = null;
    const over = (e) => {
      const t = typeOf(e.dataTransfer);
      if (!t) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "copy"; } catch (x) { /* noop */ }
      const cell = e.target && e.target.closest ? e.target.closest("[data-clip-id]") : null;
      if (hot !== cell) {
        if (hot) hot.classList.remove("vqs-lib-drophit");
        hot = cell;
        if (hot) hot.classList.add("vqs-lib-drophit");
      }
    };
    const leave = () => { if (hot) { hot.classList.remove("vqs-lib-drophit"); hot = null; } };
    const drop = (e) => {
      const t = typeOf(e.dataTransfer);
      if (!t) return;
      e.preventDefault();
      const cell = e.target && e.target.closest ? e.target.closest("[data-clip-id]") : null;
      leave();
      if (!cell) { toast("クリップの上へ落としてください", { kind: "warn" }); return; }
      const clipId = cell.dataset.clipId;
      let id = "";
      try { id = e.dataTransfer.getData(t) || ""; } catch (x) { id = ""; }
      if (!id) return;
      if (t === "application/x-vqs-fx") {
        const def = (REG.fx || []).find((x) => x.id === id);
        batch("効果を当てる", (d) => d("clip.addFx", { clipId, type: id, params: defaultsOf(def) }));
        return;
      }
      if (t === "application/x-vqs-transition") {
        /* 左半分に落ちたら頭、右半分なら尻の境界 */
        let edge = "in";
        try {
          const r = cell.getBoundingClientRect();
          edge = (e.clientX - r.left) > r.width / 2 ? "out" : "in";
        } catch (x) { /* noop */ }
        batch("遷移を当てる", (d) => d("clip.setTransition", { clipId, edge, transition: { type: id, duration: 0.5 } }));
        return;
      }
      if (id === "none") { batch("色を戻す", (d) => d("clip.setColor", { clipId, color: null })); return; }
      if (id.indexOf("look:") === 0) {
        const g = gradeForLook(id.slice(5)) || {};
        batch("見た目を当てる", (d) => d("clip.setColor", { clipId, color: g }));
        return;
      }
      batch("LUT を当てる", (d) => d("clip.setColor", { clipId, color: { lut: { id: id.slice(4), amount: 1 } } }));
    };
    host.addEventListener("dragover", over);
    host.addEventListener("dragenter", over);
    host.addEventListener("dragleave", leave);
    host.addEventListener("drop", drop);
    cleanups.push(() => {
      host.removeEventListener("dragover", over);
      host.removeEventListener("dragenter", over);
      host.removeEventListener("dragleave", leave);
      host.removeEventListener("drop", drop);
    });
  }

  /* ── 8. 配線 ────────────────────────────────────────────────── */
  buildTabs();
  attachTimelineDrops();
  if (isTouch()) bodyHost.classList.add("vqs-lib--touch");

  const offStore = store.subscribe((ev) => {
    if (ev.kind === "project" || ev.kind === "selection") schedule();
  });
  cleanups.push(offStore);

  if (importer && typeof importer.on === "function") {
    cleanups.push(importer.on("analysis", () => {
      const part = built.get("media") || built.get("audio");
      if (part) schedule();
    }));
    cleanups.push(importer.on("added", (r) => {
      if (r && r.counts && r.counts.added) {
        /* 音のタブで音を入れた人をわざわざ素材タブへ飛ばさない */
        if (active !== "audio") open("media");
        toast(`${r.counts.added} 件の素材を取り込みました`, { kind: "ok" });
      }
      schedule();
    }));
    cleanups.push(importer.on("error", (d) => { if (d && d.message) toast(d.message, { kind: "error", ms: 6000 }); }));
    cleanups.push(importer.on("warning", (d) => { if (d && d.message) toast(d.message, { kind: "warn", ms: 6000 }); }));
    cleanups.push(importer.on("note", (d) => { if (d && d.message) toast(d.message, { kind: "info", ms: 6000 }); }));
    cleanups.push(importer.on("skipped", (d) => {
      const items = (d && d.items) || [];
      if (!items.length) return;
      toast(items.length === 1 ? items[0].reason : `${items.length} 件を入れられませんでした（${items[0].reason}）`, { kind: "warn", ms: 7000 });
    }));
  }

  /* 「テキストを追加」等をモバイルの下段タブから呼べるように */
  const onOpen = (e) => { const id = e && e.detail && e.detail.tab; if (id) open(id); };
  document.addEventListener("vqs:library-open", onOpen);
  cleanups.push(() => document.removeEventListener("vqs:library-open", onOpen));

  open(active);

  return {
    /** 今のタブを描き直す（app.js が store の変更ごとに呼ぶ） */
    render() { paint(); },
    /** タブを開く（モバイルの下段タブから） */
    open,
    get tab() { return active; },
    dispose() {
      disposed = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      for (const f of cleanups) { try { f(); } catch (e) { /* noop */ } }
      cleanups.length = 0;
      for (const [, part] of built) {
        try { if (part.dispose) part.dispose(); } catch (e) { /* noop */ }
        if (part.el && part.el.parentNode) part.el.parentNode.removeChild(part.el);
      }
      built.clear();
      for (const [, url] of thumbURLs) { if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } } }
      thumbURLs.clear();
      picked.clear();
      if (tabsHost) { tabsHost.textContent = ""; delete tabsHost.dataset.vqsReady; }
      return true;
    }
  };
}
