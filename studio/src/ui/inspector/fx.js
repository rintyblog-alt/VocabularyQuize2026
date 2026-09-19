/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/fx.js — 「効果」タブ（エフェクト / マスク / クロマキー）

   ★ 何をする所か
     選択クリップの `clip.fx`（効果の鎖）・`clip.mask`・`clip.chroma`・
     `clip.stabilize` を触る所。CapCut の「エフェクト」＋「マスク」＋
     「クロマキー」、Premiere の「エフェクトコントロール」に当たる。
       ① 効果の一覧（engine/fx/registry.js の FX_REGISTRY を分類ごとに
          小さな見本つきの格子で出す）→ 押すと選択クリップ全部へ追加
       ② 適用済みの鎖（並べ替え・on/off・削除・パラメータ・キーフレーム印）
       ③ プリセット（FX_PRESETS）で一気に何段か積む
       ④ マスク（形 / ぼかし / 反転 / 広げる / プレビューで形を触る）
       ⑤ クロマキー（色を吸う / 許容差 / 境界 / スピル除去 / 透明の確認）
       ⑥ 手ぶれ補正の入口（engine が未着なら「準備中」で無効表示）

   ★ なぜこの形か
     ・**名簿は engine が持つ**（契約書 §4）。まだ無いので **動的 import**
       にして、来るまでは自前の控えで完全に動く。実物の
       `engine/compositor.js#fxSource()` は `FX_REGISTRY[type]` と
       **type を鍵にした表**として引くので、こちらの正規化も表を第一に扱う
       （配列で来ても受ける）。
     ・鎖の編集は **clipId を 1 つずつ**取る op（`clip.addFx` /
       `clip.removeFx` / `clip.updateFx` / `clip.reorderFx`）。だから
       「追加」は選択全部へ（kit.eachClip = 1 undo）、「鎖の中身の調整」は
       **先頭のクリップだけ**を相手にする。効果の id はクリップごとに違うので、
       複数のクリップの鎖を 1 つの UI で同時に触ると id が混ざって壊れる。
       そのため鎖用に **専用の kit（chainKit・先頭クリップだけ）** を持つ。
       これでキーフレーム印（`fx.<fxId>.<param>`）も、その効果を持っていない
       クリップへ key.add を投げて op が throw する事故を避けられる。
     ・並べ替えは掴んで動かす（Pointer Events）だけでなく **▲▼ ボタン**も置く。
       指で細い取っ手を掴むのは辛く、iOS では長押しで選択が始まってしまう。
     ・マスクとクロマキーは選択全部へ当てる（枝は clip ごとに独立していて、
       id を持たないので混ざらない）。

   ★ 触るときの注意
     ・キーを打てる path は契約書 §2 の一覧 + `fx.<fxId>.<paramKey>` だけ。
       選択肢（select）や真偽（toggle）のパラメータには印を出さない
       （key の値は数か #rrggbb のみ）。
     ・`touch-action` は CSS 担当へ: `.vqs-fx__grip`（取っ手）に
       `touch-action: none` が要る。
     ・触り所は 44px 以上。効果の格子は 1 枚 84px 以上。

   CONTRACT-NOTE 1（見本の絵）: FX_REGISTRY の各項目が見本の絵
     （`sample` / `thumb`）を持つかは契約書に無い。持っていればそれを使い、
     無ければ **CSS で近い見た目を作る**（下の FX_SAMPLE）。engine の実物とは
     当然違うので「見本」としてだけ出し、押した後はプレビューが正解。
   CONTRACT-NOTE 2（プレビューの編集モード）: マスクの形を触る口と、
     クロマキーの色を吸う口は `ui/preview.js` の担当。まだ無いので
     `ctx.preview` に `setMode(mode, opt)` / `pickColor(opt)` /
     `startMask(opt)` のいずれかが在れば呼び、無ければ穏やかに断って
     数値の調整へ誘導する（画面は壊さない）。
   CONTRACT-NOTE 3（手ぶれ補正）: 契約書 §1 に `clip.stabilize` は在るが、
     それを焼く engine（解析 + 変形の書き戻し）は v1 の担当表に無い。
     ここでは `ctx.caps.stabilize` か `engine/stabilize.js` の存在で判定し、
     無ければ **無効表示 + 「準備中」** を出す（勝手に値だけ書いて
     「効かない設定」を残さない）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el } from "./index.js";
import { clamp, finite, isTouch, hexToRgb, rgbToHex } from "../../core/util.js";
import { defaultChroma, MASK_TYPES } from "../../core/schema.js";

/* ── §0. 控えの名簿（engine/fx/registry.js が来るまで使う）───────── */

/** 分類の並びと日本語 */
export const FX_CATEGORIES = Object.freeze([
  { id: "basic", label: "基本" },
  { id: "blur", label: "ぼかし" },
  { id: "light", label: "光" },
  { id: "distort", label: "歪み" },
  { id: "texture", label: "質感" },
  { id: "motion", label: "動き" },
  { id: "other", label: "その他" }
]);

const SL = (key, label, min, max, def, step, unit) => ({ key, label, type: "slider", min, max, def, step: step || 0.01, unit: unit || "" });

/**
 * 控えの効果表（type を鍵にする＝ engine/compositor.js の引き方と同じ）。
 * params は「見せ方」の指定。engine が来たら丸ごと差し替わる。
 */
export const FALLBACK_FX = Object.freeze({
  blur: { label: "ぼかし", category: "blur", params: [SL("amount", "強さ", 0, 1, 0.3)] },
  blurBg: { label: "背景ぼかし", category: "blur", params: [SL("amount", "強さ", 0, 1, 0.5)] },
  mosaic: { label: "モザイク", category: "blur", params: [SL("size", "粗さ", 0, 1, 0.3)] },
  sharpen: { label: "先鋭化", category: "basic", params: [SL("amount", "強さ", 0, 1, 0.3)] },
  glow: { label: "発光", category: "light", params: [SL("amount", "強さ", 0, 1, 0.4), SL("threshold", "しきい値", 0, 1, 0.6)] },
  flash: { label: "明滅", category: "light", params: [SL("amount", "強さ", 0, 1, 0.5), SL("speed", "速さ", 0.1, 8, 2, 0.1, "Hz")] },
  vignette: { label: "周辺減光", category: "light", params: [SL("amount", "強さ", 0, 1, 0.4), SL("softness", "柔らかさ", 0, 1, 0.5)] },
  glitch: { label: "グリッチ", category: "distort", params: [SL("amount", "強さ", 0, 1, 0.4), SL("speed", "速さ", 0.1, 8, 2, 0.1, "Hz")] },
  rgbShift: { label: "色ずれ", category: "distort", params: [SL("amount", "強さ", 0, 1, 0.3), SL("angle", "向き", 0, 360, 0, 1, "°")] },
  wave: { label: "波", category: "distort", params: [SL("amount", "強さ", 0, 1, 0.3), SL("speed", "速さ", 0.1, 8, 1, 0.1, "Hz")] },
  mirror: { label: "鏡", category: "distort", params: [{ key: "axis", label: "軸", type: "select", def: "x", options: [{ value: "x", label: "左右" }, { value: "y", label: "上下" }] }] },
  grain: { label: "粒子", category: "texture", params: [SL("amount", "強さ", 0, 1, 0.3), SL("size", "粒の大きさ", 0, 1, 0.4)] },
  scanline: { label: "走査線", category: "texture", params: [SL("amount", "強さ", 0, 1, 0.3)] },
  oldFilm: { label: "古い film", category: "texture", params: [SL("amount", "強さ", 0, 1, 0.4)] },
  shake: { label: "揺れ", category: "motion", params: [SL("amount", "強さ", 0, 1, 0.3), SL("speed", "速さ", 0.1, 12, 4, 0.1, "Hz")] },
  zoom: { label: "寄り（ケンバーンズ）", category: "motion", params: [SL("amount", "強さ", -1, 1, 0.2)] }
});

/** 見本の CSS（CONTRACT-NOTE 1）。type → filter、無ければ分類で */
export const FX_SAMPLE = Object.freeze({
  blur: "blur(2.2px)", blurBg: "blur(1.6px)", mosaic: "contrast(1.4) saturate(1.3) blur(1.4px)",
  sharpen: "contrast(1.35) saturate(1.1)", glow: "brightness(1.35) saturate(1.3)",
  flash: "brightness(1.5)", vignette: "brightness(0.85) contrast(1.15)",
  glitch: "hue-rotate(80deg) saturate(1.6)", rgbShift: "hue-rotate(-40deg) saturate(1.5)",
  wave: "hue-rotate(20deg)", mirror: "none", grain: "contrast(1.1) sepia(0.15)",
  scanline: "contrast(1.2) brightness(0.9)", oldFilm: "sepia(0.55) contrast(1.1)",
  shake: "saturate(1.15)", zoom: "saturate(1.1) brightness(1.05)"
});
const CAT_SAMPLE = Object.freeze({
  basic: "contrast(1.15)", blur: "blur(2px)", light: "brightness(1.3)",
  distort: "hue-rotate(60deg)", texture: "sepia(0.4)", motion: "saturate(1.2)", other: "none"
});

/** 控えのプリセット（何段か積む組み合わせ） */
export const FALLBACK_FX_PRESETS = Object.freeze([
  { id: "vlogSoft", label: "やわらか", fx: [{ type: "glow", params: { amount: 0.25, threshold: 0.7 } }, { type: "vignette", params: { amount: 0.25, softness: 0.6 } }] },
  { id: "retro", label: "レトロ", fx: [{ type: "oldFilm", params: { amount: 0.5 } }, { type: "grain", params: { amount: 0.35, size: 0.5 } }, { type: "vignette", params: { amount: 0.35, softness: 0.4 } }] },
  { id: "cyber", label: "サイバー", fx: [{ type: "rgbShift", params: { amount: 0.25, angle: 20 } }, { type: "glitch", params: { amount: 0.3, speed: 3 } }, { type: "glow", params: { amount: 0.4, threshold: 0.5 } }] },
  { id: "punch", label: "パンチ", fx: [{ type: "sharpen", params: { amount: 0.5 } }, { type: "shake", params: { amount: 0.2, speed: 6 } }] },
  { id: "dreamy", label: "夢見心地", fx: [{ type: "blur", params: { amount: 0.2 } }, { type: "glow", params: { amount: 0.5, threshold: 0.4 } }] }
]);

/** マスクの形（なし + 契約書 §1 の MASK_TYPES） */
export const MASK_ITEMS = Object.freeze([
  { value: "", label: "なし" }, { value: "rect", label: "矩形" }, { value: "ellipse", label: "楕円" },
  { value: "polygon", label: "多角形" }, { value: "linear", label: "直線" }, { value: "radial", label: "放射" }
]);

/** 多角形に切り替えたときの初期の点（五角形。points が空だと形が出ない） */
export const POLY_DEFAULT = Object.freeze([[0.5, 0.12], [0.88, 0.42], [0.73, 0.88], [0.27, 0.88], [0.12, 0.42]]);

/* ── §1. 名簿を整える（純関数）───────────────────────────────── */

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
const labelOf = (o, id) => str(o.label) || str(o.name) || str(o.title) || id;

/**
 * FX_REGISTRY を `{ type: {type,label,category,params:[spec]} }` へ均す。
 * 表（`{type:def}`）でも配列（`[{type,...}]`）でも受ける。
 * @param {*} raw @returns {Object}
 */
export function normalizeRegistry(raw) {
  const out = Object.create(null);
  const put = (type, def) => {
    const id = str(type);
    if (!id || !isObj(def)) return;
    out[id] = {
      type: id,
      label: labelOf(def, id),
      category: str(def.category) || str(def.group) || str(def.cat) || "other",
      params: paramSpecs(def),
      sample: str(def.sample) || str(def.thumb) || ""
    };
  };
  if (Array.isArray(raw)) {
    for (const d of raw) if (isObj(d)) put(str(d.type) || str(d.id), d);
  } else if (isObj(raw)) {
    for (const k of Object.keys(raw)) {
      const d = raw[k];
      if (isObj(d)) put(str(d.type) || k, d);
    }
  }
  if (!Object.keys(out).length) {
    for (const k of Object.keys(FALLBACK_FX)) put(k, FALLBACK_FX[k]);
  }
  return out;
}

/**
 * 1 つの効果の「触れるパラメータ」の並び。params が
 * 配列でも `{key:def}` の表でも、数（既定値だけ）でも読む。
 * @param {Object} def @returns {Object[]}
 */
export function paramSpecs(def) {
  const raw = isObj(def) ? (def.params || def.uniforms || def.controls || null) : null;
  const list = [];
  const push = (key, p) => {
    const k = str(key);
    if (!k) return;
    if (typeof p === "number") { list.push({ key: k, label: k, type: "slider", min: 0, max: 1, def: p, step: 0.01, unit: "" }); return; }
    if (typeof p === "boolean") { list.push({ key: k, label: k, type: "toggle", def: p }); return; }
    if (typeof p === "string") { list.push({ key: k, label: k, type: /^#[0-9a-fA-F]{3,8}$/.test(p) ? "color" : "select", def: p, options: [] }); return; }
    if (!isObj(p)) return;
    const opts = Array.isArray(p.options) ? p.options.map((o) => (isObj(o) ? { value: str(o.value) || str(o.id), label: labelOf(o, str(o.value) || str(o.id)) } : { value: str(o), label: str(o) })) : [];
    let type = str(p.type) || str(p.kind);
    const dv = p.def !== undefined ? p.def : (p.default !== undefined ? p.default : (p.value !== undefined ? p.value : 0));
    if (!type) {
      if (opts.length) type = "select";
      else if (typeof dv === "boolean") type = "toggle";
      else if (typeof dv === "string") type = /^#[0-9a-fA-F]{3,8}$/.test(dv) ? "color" : "select";
      else type = "slider";
    }
    if (type === "number" || type === "range" || type === "float") type = "slider";
    if (type === "bool" || type === "boolean" || type === "check") type = "toggle";
    list.push({
      key: k, label: labelOf(p, k), type,
      min: finite(p.min, 0), max: finite(p.max, 1), step: finite(p.step, 0.01) || 0.01,
      def: dv, options: opts, unit: str(p.unit)
    });
  };
  if (Array.isArray(raw)) for (const p of raw) push(isObj(p) ? (str(p.key) || str(p.name) || str(p.id)) : "", p);
  else if (isObj(raw)) for (const k of Object.keys(raw)) push(k, raw[k]);
  return list;
}

/** その効果を追加するときの params（spec の既定値を集めたもの） */
export function defaultParams(entry) {
  const out = {};
  for (const p of (entry && entry.params) || []) {
    out[p.key] = p.type === "slider" ? finite(p.def, 0) : p.def;
  }
  return out;
}

/**
 * FX_PRESETS を `[{id,label,fx:[{type,params}]}]` へ均す。
 * @param {*} raw @returns {Object[]}
 */
export function normalizeFxPresets(raw) {
  const src = Array.isArray(raw) ? raw : (isObj(raw) ? Object.keys(raw).map((k) => Object.assign({ id: k }, isObj(raw[k]) ? raw[k] : null)) : []);
  const out = [];
  for (const o of src) {
    if (!isObj(o)) continue;
    const id = str(o.id) || str(o.name);
    const steps = Array.isArray(o.fx) ? o.fx : (Array.isArray(o.chain) ? o.chain : (Array.isArray(o.effects) ? o.effects : []));
    const fx = [];
    for (const s of steps) {
      if (typeof s === "string") { fx.push({ type: s, params: {} }); continue; }
      if (!isObj(s)) continue;
      const t = str(s.type) || str(s.id);
      if (t) fx.push({ type: t, params: isObj(s.params) ? Object.assign({}, s.params) : {} });
    }
    if (id && fx.length) out.push({ id, label: labelOf(o, id), fx });
  }
  return out.length ? out : FALLBACK_FX_PRESETS.map((p) => ({ id: p.id, label: p.label, fx: p.fx.map((f) => ({ type: f.type, params: Object.assign({}, f.params) })) }));
}

/* ── §2. 画面本体 ───────────────────────────────────────────── */

/**
 * 「効果」タブ。
 * @param {{store:Object, widgets?:Object, clipIds:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createFxPanel(o) {
  const store = o.store;
  const widgets = o.widgets || null;
  const transport = o.transport || null;
  const ctx = o.ctx || null;
  /** 全選択を相手にする kit（マスク・クロマキー・手ぶれ補正） */
  const kit = createFieldKit({ store, widgets, clipIds: o.clipIds, transport });
  /** 鎖だけを相手にする kit（**先頭クリップだけ**。上の理由を参照） */
  let chainKit = null;
  const root = el("div", "vqs-fx");
  let dead = false;
  let chainSig = "";
  let transparent = false;

  /** 名簿 */
  const book = { reg: normalizeRegistry(null), presets: normalizeFxPresets(null), fromEngine: false };
  /** 一覧で今出している分類 */
  let cat = "basic";

  const clips = () => kit.clips();
  const first = () => clips()[0] || null;
  const entryOf = (type) => book.reg[String(type)] || null;
  const labelOfType = (type) => {
    const e = entryOf(type);
    return e ? e.label : String(type || "効果");
  };

  /* ── 2.1 効果の一覧（分類 → 格子）──────────────────────────── */
  const secAdd = kit.section({ title: "効果を足す", id: "fxadd" });
  const catBar = el("div", "vqs-fx__cats");
  catBar.setAttribute("role", "tablist");
  catBar.setAttribute("data-test", "insp-fx-cats");
  catBar.style.display = "flex";
  catBar.style.overflowX = "auto";
  catBar.style.gap = "6px";
  secAdd.body.append(catBar);
  const grid = el("div", "vqs-fx__grid");
  grid.setAttribute("data-test", "insp-fx-grid");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(84px, 1fr))";
  grid.style.gap = "8px";
  secAdd.body.append(grid);
  root.append(secAdd.el);

  function buildCats() {
    catBar.textContent = "";
    const used = new Set();
    for (const k of Object.keys(book.reg)) used.add(book.reg[k].category || "other");
    const items = FX_CATEGORIES.filter((c) => used.has(c.id));
    for (const c of used) if (!FX_CATEGORIES.some((x) => x.id === c)) items.push({ id: c, label: c });
    if (!items.length) items.push({ id: "other", label: "その他" });
    if (!items.some((c) => c.id === cat)) cat = items[0].id;
    for (const c of items) {
      const b = el("button", "vqs-fx__cat", c.label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("data-cat", c.id);
      b.setAttribute("aria-selected", c.id === cat ? "true" : "false");
      b.classList.toggle("vqs-fx__cat--on", c.id === cat);
      if (isTouch()) { b.style.minHeight = "44px"; b.style.minWidth = "44px"; }
      b.addEventListener("click", () => { cat = c.id; buildCats(); buildGrid(); });
      catBar.append(b);
    }
  }
  function buildGrid() {
    grid.textContent = "";
    const types = Object.keys(book.reg).filter((t) => (book.reg[t].category || "other") === cat);
    types.sort((a, b) => String(book.reg[a].label).localeCompare(String(book.reg[b].label), "ja"));
    if (!types.length) { grid.append(kit.note("この分類の効果はまだありません。")); return; }
    for (const t of types) {
      const e = book.reg[t];
      const b = el("button", "vqs-fx__tile");
      b.type = "button";
      b.title = e.label;
      b.setAttribute("data-fx", t);
      b.setAttribute("aria-label", e.label + " を足す");
      b.style.minHeight = "72px";
      const thumb = el("span", "vqs-fx__thumb");
      thumb.style.display = "block";
      thumb.style.height = "40px";
      thumb.style.borderRadius = "6px";
      thumb.style.background = "linear-gradient(135deg, #4f8cff 0%, #22d3ee 45%, #f472b6 100%)";
      thumb.style.filter = FX_SAMPLE[t] || CAT_SAMPLE[e.category] || "none";
      const cap = el("span", "vqs-fx__tilecap", e.label);
      b.append(thumb, cap);
      b.addEventListener("click", () => addFx(t));
      grid.append(b);
    }
  }
  /** 選択クリップ全部へ 1 つ足す（1 undo） */
  function addFx(type) {
    const e = entryOf(type);
    const params = defaultParams(e);
    const r = kit.eachClip("効果を追加：" + labelOfType(type), (c) => ({ type: "clip.addFx", payload: { clipId: c.id, type: String(type), params } }));
    if (r !== null) kit.toast(labelOfType(type) + " を足しました", { kind: "success" });
    refreshAll();
  }

  /* ── 2.2 プリセット ───────────────────────────────────────── */
  const secPreset = kit.section({ title: "組み合わせ（プリセット）", id: "fxpreset" });
  const presetRow = el("div", "vqs-insp-presets vqs-fx__presets");
  presetRow.setAttribute("data-test", "insp-fx-presets");
  secPreset.body.append(presetRow);
  secPreset.add(kit.note("何段かまとめて足します。足した後は下の一覧で個別に調整できます。"));
  root.append(secPreset.el);

  function buildPresets() {
    presetRow.textContent = "";
    for (const p of book.presets) {
      presetRow.append(kit.btn(p.label, () => applyPreset(p), { title: p.fx.map((f) => labelOfType(f.type)).join(" → "), test: "insp-fx-preset-" + p.id }));
    }
  }
  function applyPreset(p) {
    const list = clips();
    if (!list.length) return;
    try {
      store.batch("効果の組み合わせ：" + p.label, (d) => {
        for (const c of list) for (const f of p.fx) d("clip.addFx", { clipId: c.id, type: f.type, params: Object.assign({}, f.params) });
      });
      kit.toast(p.label + " を足しました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "足せませんでした", { kind: "error" });
    }
    refreshAll();
  }

  /* ── 2.3 適用済みの鎖 ─────────────────────────────────────── */
  const secChain = kit.section({ title: "付いている効果", id: "fxchain" });
  const chainNote = kit.note("");
  chainNote.setAttribute("data-test", "insp-fx-chainnote");
  secChain.body.append(chainNote);
  const chainHost = el("div", "vqs-fx__chain");
  chainHost.setAttribute("data-test", "insp-fx-chain");
  secChain.body.append(chainHost);
  secChain.add(kit.btnRow([
    kit.btn("全部外す", () => clearChain(), { cls: "vqs-btn--ghost", test: "insp-fx-clear" })
  ]));
  root.append(secChain.el);

  /** 鎖の指紋（これが変わった時だけ作り直す） */
  function sigOfChain() {
    const c = first();
    if (!c) return "";
    const fx = Array.isArray(c.fx) ? c.fx : [];
    return c.id + "|" + fx.map((f) => f.id + ":" + f.type + ":" + (f.enabled ? 1 : 0)).join(",") + "|" + clips().length;
  }

  function buildChain() {
    if (chainKit) { try { chainKit.dispose(); } catch (e) { /* noop */ } chainKit = null; }
    chainHost.textContent = "";
    const c = first();
    if (!c) { chainNote.textContent = "クリップを選ぶと、付いている効果が出ます。"; return; }
    const list = clips();
    chainNote.textContent = list.length > 1
      ? "複数選んでいます。足す・外すは全部へ、細かい調整は 1 つ目（" + (c.name || "先頭のクリップ") + "）に効きます。"
      : "";
    chainKit = createFieldKit({ store, widgets, clipIds: [c.id], transport });
    const fx = Array.isArray(c.fx) ? c.fx : [];
    if (!fx.length) { chainHost.append(kit.note("まだ効果は付いていません。上の格子から足してください。")); return; }
    fx.forEach((f, i) => chainHost.append(fxRow(c, f, i, fx.length)));
    /* 作った行へ今の値を流す（これを忘れると全部 0 に見える） */
    chainKit.update([c.id]);
  }

  /** 効果 1 段ぶんの行 */
  function fxRow(clip, fx, index, total) {
    const host = el("div", "vqs-fx__item");
    host.setAttribute("data-fx-id", fx.id);
    host.setAttribute("data-test", "insp-fx-item");
    if (!fx.enabled) host.classList.add("vqs-fx__item--off");

    const head = el("div", "vqs-fx__itemhead");
    const grip = el("button", "vqs-fx__grip");
    grip.type = "button";
    grip.title = "掴んで並べ替え";
    grip.setAttribute("aria-label", labelOfType(fx.type) + " を並べ替える");
    grip.style.touchAction = "none";      // CSS 担当へ: .vqs-fx__grip に同じ指定を
    grip.append(kit.icon("drag", "≡"));
    if (isTouch()) { grip.style.minWidth = "44px"; grip.style.minHeight = "44px"; }
    const name = el("span", "vqs-fx__name", labelOfType(fx.type));
    const up = kit.btn("▲", () => move(index - 1), { cls: "vqs-fx__move", title: "1 つ上へ" });
    const down = kit.btn("▼", () => move(index + 1), { cls: "vqs-fx__move", title: "1 つ下へ" });
    up.disabled = index === 0;
    down.disabled = index === total - 1;
    const onoff = kit.btn(fx.enabled ? "切る" : "入れる", () => {
      patchFx({ enabled: !fx.enabled }, fx.enabled ? "効果を切る" : "効果を入れる");
      refreshAll();
    }, { cls: "vqs-btn--ghost", title: "この効果だけ一時的に止める" });
    const del = kit.btn("削除", () => {
      chainKit.patch("clip.removeFx", { clipId: clip.id, fxId: fx.id }, { label: "効果を削除" });
      refreshAll();
    }, { cls: "vqs-btn--danger", title: "この効果を外す" });
    head.append(grip, name, up, down, onoff, del);
    host.append(head);

    /** この効果の 1 つの値を書く */
    function patchFx(patch, label) {
      return chainKit.patch("clip.updateFx", Object.assign({ clipId: clip.id, fxId: fx.id }, patch), { label: label || "効果を調整", coalesce: true });
    }
    function move(to) {
      if (to < 0 || to >= total) return;
      chainKit.patch("clip.reorderFx", { clipId: clip.id, fxId: fx.id, index: to }, { label: "効果の順序" });
      refreshAll();
    }

    /* パラメータ */
    const e = entryOf(fx.type);
    const specs = (e && e.params) || [];
    const body = el("div", "vqs-fx__params");
    if (!specs.length) {
      body.append(kit.note(e ? "この効果に触れる値はありません。" : "この効果の名簿がまだ読めていません（engine 側の用意待ち）。"));
    }
    for (const p of specs) {
      const path = "fx." + fx.id + "." + p.key;
      /* clip は dispatch ごとに **別の object** へ入れ替わる（store は複製を
         作る）。掴んだままの参照から読むと値が古いままになるので、毎回
         store から引き直す。 */
      const cur = () => {
        const live = (chainKit && chainKit.clips()[0]) || clip;
        const f = (Array.isArray(live.fx) ? live.fx : []).find((x) => x.id === fx.id);
        const v = f && f.params ? f.params[p.key] : undefined;
        return v === undefined ? p.def : v;
      };
      const read1 = () => ({ value: cur(), mixed: false });
      if (p.type === "color") {
        body.append(chainKit.row({
          label: p.label, path,
          field: chainKit.col({ label: p.label, get: read1, onInput: (v) => patchFx({ params: { [p.key]: String(v) } }, p.label) })
        }));
      } else if (p.type === "select") {
        body.append(chainKit.row({
          label: p.label,
          field: chainKit.sel({
            label: p.label,
            items: (p.options && p.options.length ? p.options : [{ value: String(p.def), label: String(p.def) }]),
            get: read1,
            onChange: (v) => { patchFx({ params: { [p.key]: String(v) } }, p.label); refreshAll(); }
          })
        }));
      } else if (p.type === "toggle") {
        body.append(chainKit.row({
          label: p.label,
          field: chainKit.tog({ label: p.label, get: read1, onChange: (v) => { patchFx({ params: { [p.key]: !!v } }, p.label); refreshAll(); } })
        }));
      } else {
        const min = finite(p.min, 0);
        const max = finite(p.max, 1) > min ? finite(p.max, 1) : min + 1;
        body.append(chainKit.row({
          label: p.label, path,
          field: chainKit.sld({
            label: p.label, min, max, step: finite(p.step, 0.01) || 0.01,
            digits: max - min <= 2 ? 2 : 0, unit: p.unit || "", center: finite(p.def, min),
            get: read1,
            onInput: (v) => patchFx({ params: { [p.key]: finite(v, 0) } }, p.label)
          }),
          onReset: () => patchFx({ params: { [p.key]: p.def } }, p.label + "を戻す")
        }));
      }
    }
    host.append(body);
    armDrag(host, grip, index, total, clip, fx);
    return host;
  }

  /** 取っ手を掴んで縦に動かす（離した所の順番へ差し替える） */
  function armDrag(host, grip, index, total, clip, fx) {
    let y0 = 0;
    let rowH = 0;
    let moved = 0;
    let on = false;
    const onDown = (ev) => {
      on = true;
      y0 = ev.clientY;
      rowH = Math.max(36, host.getBoundingClientRect().height);
      moved = 0;
      host.classList.add("vqs-fx__item--drag");
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!on) return;
      const dy = ev.clientY - y0;
      moved = Math.round(dy / rowH);
      host.style.transform = "translateY(" + dy.toFixed(0) + "px)";
      host.style.zIndex = "2";
    };
    const onUp = () => {
      if (!on) return;
      on = false;
      host.style.transform = "";
      host.style.zIndex = "";
      host.classList.remove("vqs-fx__item--drag");
      const to = clamp(index + moved, 0, total - 1);
      if (to !== index && chainKit) {
        chainKit.patch("clip.reorderFx", { clipId: clip.id, fxId: fx.id, index: to }, { label: "効果の順序" });
        refreshAll();
      }
    };
    grip.addEventListener("pointerdown", onDown);
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  }

  function clearChain() {
    const list = clips();
    if (!list.length) return;
    const jobs = [];
    for (const c of list) for (const f of (Array.isArray(c.fx) ? c.fx : [])) jobs.push({ clipId: c.id, fxId: f.id });
    if (!jobs.length) { kit.toast("外す効果がありません", { kind: "info" }); return; }
    try {
      store.batch("効果を全部外す", (d) => { for (const j of jobs) d("clip.removeFx", j); });
      kit.toast(jobs.length + " 個の効果を外しました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "外せませんでした", { kind: "error" });
    }
    refreshAll();
  }

  /* ── 2.4 マスク ───────────────────────────────────────────── */
  const secMask = kit.section({ title: "マスク", id: "fxmask", open: false });
  secMask.add(kit.row({
    label: "形",
    field: kit.seg({
      items: MASK_ITEMS.slice(),
      get: () => kit.read((c) => String((c.mask && c.mask.type) || "")),
      onChange: (v) => {
        const t = String(v || "");
        if (!t) { kit.patchAll("clip.setMask", { mask: null }, { label: "マスクを外す" }); }
        else {
          const patch = { type: MASK_TYPES.indexOf(t) >= 0 ? t : "rect" };
          if (t === "polygon") patch.points = POLY_DEFAULT.map((p) => p.slice());
          kit.patchAll("clip.setMask", { patch }, { label: "マスクの形" });
        }
        refreshAll();
      }
    })
  }));
  const maskBox = el("div", "vqs-fx__sub");
  const maskNum = (key, label, min, max, unit, scale, digits) => maskBox.append(kit.row({
    label, path: "mask." + key,
    field: kit.sld({
      label, min, max, step: (max - min) / 100, digits: digits === undefined ? 1 : digits, unit: unit || "%",
      scale: scale === undefined ? 100 : scale, center: key === "x" || key === "y" ? 50 : undefined,
      get: () => kit.read((c) => finite(c.mask && c.mask[key], key === "x" || key === "y" ? 0.5 : 0.5)),
      onInput: (v) => kit.patchAll("clip.setMask", { patch: { [key]: v } }, { label: "マスク", coalesce: true })
    })
  }));
  maskNum("x", "中心 X", 0, 100);
  maskNum("y", "中心 Y", 0, 100);
  maskNum("w", "幅", 1, 200);
  maskNum("h", "高さ", 1, 200);
  maskBox.append(kit.row({
    label: "回転", path: "mask.rotate",
    field: kit.sld({
      label: "回転", min: -180, max: 180, step: 1, digits: 0, unit: "°", scale: 1, center: 0,
      get: () => kit.read((c) => finite(c.mask && c.mask.rotate, 0)),
      onInput: (v) => kit.patchAll("clip.setMask", { patch: { rotate: clamp(v, -180, 180) } }, { label: "マスクの回転", coalesce: true })
    })
  }));
  maskBox.append(kit.row({
    label: "ぼかし", path: "mask.feather",
    field: kit.sld({
      label: "ぼかし", min: 0, max: 100, step: 1, digits: 0, unit: "%", scale: 100, center: 0,
      get: () => kit.read((c) => clamp(finite(c.mask && c.mask.feather, 0), 0, 1)),
      onInput: (v) => kit.patchAll("clip.setMask", { patch: { feather: clamp(v, 0, 1) } }, { label: "マスクのぼかし", coalesce: true })
    })
  }));
  maskBox.append(kit.row({
    label: "広げる",
    field: kit.sld({
      label: "広げる", min: -50, max: 50, step: 1, digits: 0, unit: "%", scale: 100, center: 0,
      get: () => kit.read((c) => finite(c.mask && c.mask.expand, 0)),
      onInput: (v) => kit.patchAll("clip.setMask", { patch: { expand: clamp(v, -0.5, 0.5) } }, { label: "マスクを広げる", coalesce: true })
    })
  }));
  maskBox.append(kit.row({
    label: "反転",
    field: kit.tog({
      label: "内と外を入れ替える",
      get: () => kit.read((c) => !!(c.mask && c.mask.invert)),
      onChange: (v) => kit.patchAll("clip.setMask", { patch: { invert: !!v } }, { label: "マスクの反転" })
    })
  }));
  maskBox.append(kit.btnRow([
    kit.btn("プレビューで形を触る", () => previewEdit("mask"), { test: "insp-fx-maskmode", title: "プレビューの上で枠を掴んで形を決めます" }),
    kit.btn("マスクを外す", () => { kit.patchAll("clip.setMask", { mask: null }, { label: "マスクを外す" }); refreshAll(); }, { cls: "vqs-btn--ghost" })
  ]));
  secMask.body.append(maskBox);
  root.append(secMask.el);

  /* ── 2.5 クロマキー ───────────────────────────────────────── */
  const secKey = kit.section({ title: "クロマキー（背景を抜く）", id: "fxchroma", open: false });
  const keyOn = kit.tog({
    label: "背景を抜く",
    get: () => kit.read((c) => !!(c.chroma && c.chroma.enabled !== false)),
    onChange: (v) => {
      if (v) kit.patchAll("clip.setChroma", { patch: Object.assign(defaultChroma(), { enabled: true }) }, { label: "クロマキー" });
      else kit.patchAll("clip.setChroma", { patch: { enabled: false } }, { label: "クロマキーを切る" });
      refreshAll();
    }
  });
  secKey.add(kit.row({ label: "クロマキー", node: keyOn.el }));
  const keyBox = el("div", "vqs-fx__sub");
  const keySwatch = el("span", "vqs-fx__swatch");
  keySwatch.style.display = "inline-block";
  keySwatch.style.width = "28px";
  keySwatch.style.height = "28px";
  keySwatch.style.borderRadius = "6px";
  keySwatch.style.background = "#00ff00";
  const keyColor = kit.col({
    label: "抜く色",
    get: () => kit.read((c) => rgbToHex(Array.isArray(c.chroma && c.chroma.key) ? c.chroma.key : [0, 1, 0])),
    onInput: (v) => {
      const rgb = hexToRgb(String(v)) || [0, 1, 0];
      keySwatch.style.background = String(v);
      kit.patchAll("clip.setChroma", { patch: { key: rgb, enabled: true } }, { label: "抜く色", coalesce: true });
    }
  });
  keyBox.append(kit.row({ label: "抜く色", node: kit.btnRow([keySwatch, keyColor.el, kit.btn("画面から吸う", () => pickChromaColor(), { test: "insp-fx-eyedrop", title: "プレビューを押して、その場所の色を抜く色にします" })]) }));
  const keySld = (key, label, hint) => keyBox.append(kit.row({
    label, path: "chroma." + key, hint,
    field: kit.sld({
      label, min: 0, max: 100, step: 1, digits: 0, unit: "%", scale: 100,
      center: key === "similarity" ? 40 : key === "smoothness" ? 10 : 20,
      get: () => kit.read((c) => clamp(finite(c.chroma && c.chroma[key], key === "similarity" ? 0.4 : key === "smoothness" ? 0.1 : 0.2), 0, 1)),
      onInput: (v) => kit.patchAll("clip.setChroma", { patch: { [key]: clamp(v, 0, 1) } }, { label, coalesce: true })
    })
  }));
  keySld("similarity", "許容差", "上げると近い色まで抜けます（抜けすぎたら下げる）。");
  keySld("smoothness", "境界の滑らかさ", "髪の毛のような細かい所を馴染ませます。");
  keySld("spill", "スピル除去", "背景の色が肌や服に乗ってしまうのを抑えます。");
  const alphaTog = kit.btn("背景を透明で確かめる", () => toggleTransparent(), { cls: "vqs-btn--ghost", test: "insp-fx-alpha", title: "抜けた所を市松模様で見ます" });
  keyBox.append(kit.btnRow([
    alphaTog,
    kit.btn("クロマキーを外す", () => { kit.patchAll("clip.setChroma", { chroma: null }, { label: "クロマキーを外す" }); refreshAll(); }, { cls: "vqs-btn--ghost" })
  ]));
  secKey.body.append(keyBox);
  root.append(secKey.el);

  /* ── 2.6 手ぶれ補正（入口）──────────────────────────────── */
  const secStab = kit.section({ title: "手ぶれ補正", id: "fxstab", open: false });
  const stabField = kit.sld({
    label: "効き具合", min: 0, max: 100, step: 1, digits: 0, unit: "%", scale: 100, center: 50,
    get: () => kit.read((c) => clamp(finite(c.stabilize && c.stabilize.amount, 0), 0, 1)),
    onInput: (v) => kit.patchAll("clip.update", { patch: { stabilize: { amount: clamp(v, 0, 1), baked: false } } }, { label: "手ぶれ補正", coalesce: true })
  });
  const stabRow = kit.row({ label: "効き具合", field: stabField });
  secStab.body.append(stabRow);
  const stabNote = kit.note("準備中です（映像を解析して揺れを打ち消す部分がまだ入っていません）。", "warn");
  stabNote.setAttribute("data-test", "insp-fx-stabnote");
  secStab.body.append(stabNote);
  root.append(secStab.el);

  /** 手ぶれ補正が使えるか（CONTRACT-NOTE 3） */
  const stab = { ready: !!(ctx && ctx.caps && ctx.caps.stabilize) };
  function paintStab() {
    stabRow.classList.toggle("vqs-insp-row--disabled", !stab.ready);
    stabNote.hidden = stab.ready;
    const inputs = stabRow.querySelectorAll("input, select, button");
    for (const i of inputs) i.disabled = !stab.ready;
    if (stab.ready) stabRow.removeAttribute("aria-disabled");
    else stabRow.setAttribute("aria-disabled", "true");
  }
  (async function probeStab() {
    if (stab.ready) { paintStab(); return; }
    let mod = null;
    try { mod = await import("../../engine/stabilize.js"); }
    catch (e) { mod = null; }
    if (dead) return;
    stab.ready = !!(mod && (typeof mod.stabilizeClip === "function" || typeof mod.analyzeShake === "function"));
    paintStab();
  })();

  /* ── 2.7 プレビューへの口（CONTRACT-NOTE 2）──────────────── */
  function previewApi() {
    return (ctx && (ctx.preview || (ctx.app && ctx.app.parts && ctx.app.parts.preview))) || null;
  }
  function previewEdit(mode) {
    const p = previewApi();
    const ids = clips().map((c) => c.id);
    if (!ids.length) return;
    if (p && typeof p.setMode === "function") { try { p.setMode(mode, { clipIds: ids }); return; } catch (e) { /* 下へ */ } }
    if (mode === "mask" && p && typeof p.startMask === "function") { try { p.startMask({ clipIds: ids }); return; } catch (e) { /* 下へ */ } }
    kit.toast("プレビューの上で形を触る操作はまだ使えません。上の数値で調整してください。", { kind: "info" });
  }
  function pickChromaColor() {
    const p = previewApi();
    const apply = (hex) => {
      const rgb = hexToRgb(String(hex)) || [0, 1, 0];
      keySwatch.style.background = String(hex);
      kit.patchAll("clip.setChroma", { patch: { key: rgb, enabled: true } }, { label: "抜く色" });
      refreshAll();
    };
    if (p && typeof p.pickColor === "function") {
      try {
        const r = p.pickColor({ clipIds: clips().map((c) => c.id) });
        if (r && typeof r.then === "function") {
          r.then((hex) => { if (!dead && hex) apply(hex); }).catch(() => { /* やめただけ */ });
          kit.toast("プレビューの抜きたい色を押してください", { kind: "info" });
          return;
        }
        if (r) { apply(r); return; }
      } catch (e) { /* 下へ */ }
    }
    if (p && typeof p.setMode === "function") {
      try { p.setMode("eyedropper", { clipIds: clips().map((c) => c.id), onPick: apply }); kit.toast("プレビューの抜きたい色を押してください", { kind: "info" }); return; }
      catch (e) { /* 下へ */ }
    }
    kit.toast("色を吸う機能はまだ使えません。右の色見本から選んでください。", { kind: "info" });
  }
  function toggleTransparent() {
    const p = previewApi();
    transparent = !transparent;
    alphaTog.classList.toggle("vqs-btn--on", transparent);
    alphaTog.setAttribute("aria-pressed", transparent ? "true" : "false");
    for (const fn of ["setTransparent", "setAlphaCheck", "setChecker"]) {
      if (p && typeof p[fn] === "function") { try { p[fn](transparent); return; } catch (e) { /* 次を試す */ } }
    }
    if (p && typeof p.setMode === "function") {
      try { p.setMode(transparent ? "alpha" : "normal", {}); return; } catch (e) { /* 下へ */ }
    }
    transparent = false;
    alphaTog.classList.remove("vqs-btn--on");
    alphaTog.setAttribute("aria-pressed", "false");
    kit.toast("透明の確認はまだ使えません（プレビュー側の用意待ち）。", { kind: "info" });
  }

  /* ── 2.8 出す / 隠す ─────────────────────────────────────── */
  function syncShown() {
    const m = kit.read((c) => !!c.mask);
    maskBox.hidden = !(m.value === true);
    const k = kit.read((c) => !!c.chroma);
    keyBox.hidden = !(k.value === true);
    const none = clips().length === 0;
    emptyNote.hidden = !none;
    secChain.el.hidden = none;
    secMask.el.hidden = none;
    secKey.el.hidden = none;
    secStab.el.hidden = none;
    secPreset.el.hidden = none;
  }
  const emptyNote = kit.note("クリップを選ぶと、効果・マスク・クロマキーを触れます。", "warn");
  emptyNote.setAttribute("data-test", "insp-fx-empty");
  root.insertBefore(emptyNote, root.firstChild);

  /** 全部を読み直す（鎖は形が変わった時だけ作り直す） */
  function refreshAll() {
    if (dead) return;
    const sig = sigOfChain();
    if (sig !== chainSig) { chainSig = sig; buildChain(); }
    else if (chainKit) chainKit.update([first() ? first().id : ""].filter(Boolean));
    kit.update();
    syncShown();
  }

  /* ── 2.9 engine/fx/registry.js を後から読む ─────────────── */
  (async function loadBook() {
    let mod = null;
    try { mod = await import("../../engine/fx/registry.js"); }
    catch (e) { mod = null; }
    if (dead || !mod) return;
    const reg = normalizeRegistry(mod.FX_REGISTRY || mod.REGISTRY || mod.FX || mod.default || null);
    if (Object.keys(reg).length) { book.reg = reg; book.fromEngine = true; }
    book.presets = normalizeFxPresets(mod.FX_PRESETS || mod.PRESETS || null);
    buildCats();
    buildGrid();
    buildPresets();
    chainSig = "";
    refreshAll();
  })();

  /* ── 契約の形 ───────────────────────────────────────────── */
  buildCats();
  buildGrid();
  buildPresets();
  kit.update(o.clipIds);
  chainSig = sigOfChain();
  buildChain();
  syncShown();
  paintStab();

  return {
    el: root,
    update(ids) {
      kit.update(ids);
      refreshAll();
    },
    reset() {
      const list = clips();
      if (!list.length) return;
      try {
        store.batch("効果・マスク・クロマキーを既定へ", (d) => {
          for (const c of list) {
            for (const f of (Array.isArray(c.fx) ? c.fx : [])) d("clip.removeFx", { clipId: c.id, fxId: f.id });
            d("clip.update", { clipIds: [c.id], patch: { mask: null, chroma: null, stabilize: null } });
          }
        });
      } catch (e) {
        kit.toast((e && e.message) || "戻せませんでした", { kind: "error" });
      }
      refreshAll();
    },
    dispose() {
      dead = true;
      if (chainKit) { try { chainKit.dispose(); } catch (e) { /* noop */ } chainKit = null; }
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
