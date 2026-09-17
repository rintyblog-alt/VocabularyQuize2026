/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/mobile.js — モバイル（< 1024px）の操作体系（CapCut 準拠）

   ★ 何をする所か
     スマホ・タブレット（横幅 1024px 未満）で編集を成立させる「殻」。
       ① 下段タブ（#mobileBar）… 編集 / オーディオ / テキスト / ステッカー /
          オーバーレイ / エフェクト / フィルター / 比率 / 自動編集。
          横スクロール可。押すと「その機能のシート」か「左パネルの該当タブ」を
          下から引き出す（左パネルは CSS で下段の抽斗に化ける）。
       ② 文脈ツールバー（#contextBar）… クリップを選ぶと出る 1 列の横スクロール。
          分割・削除・複製・速度・音量・アニメ・不透明度・クロップ・回転・反転・
          逆再生・フリーズ・マスク・クロマキー・カラー・効果・遷移・音を分離・
          前面へ・背面へ・詳細。選択が無いときは
          「素材を追加 / テキスト / 録音 / 自動編集」。
       ③ ボトムシート … 掴み棒で下げて閉じる・背面は暗幕・中身はスクロール・
          値は大きなスライダー（中央スナップ + 触覚）・右上に「完了」。
          **適用/取消は置かない**（触ったその場でプレビューへ反映＝CapCut 式）。
       ④ プレビューとタイムラインの高さ配分（叩くと拡大・もう一度で戻る）と
          疑似全画面、画面回転（横ではプレビュー左・タイムライン右）。
       ⑤ iOS の癖の面倒（100dvh・safe-area・ゴムバンド・キーボード・
          ダブルタップ拡大・長押しの選択メニュー）。

   ★ なぜこの形か
     ・**組み立ては 1 回、render() は状態だけ**書き換える。store の変更ごとに
       app.js が render() を呼ぶので、毎回作り直すと指を置いた瞬間にボタンが
       消えて押せない（触り所 44px の意味が無くなる）。
     ・他人の DOM を動かさない。左パネル（#left）と詳細（#right）は
       **その場に置いたまま CSS で下段の抽斗として見せる**（`data-vqs-mpanel`）。
       移動させると library.js / inspector.js が握っている参照との約束が崩れる。
     ・シートは `widgets.openSheet` が在ればそれを使う（見た目の一貫性）。
       まだ無い段階でも画面が死なないよう、同じ作法の控えを自前で持つ。
     ・値の入れ物だけは **自前の大きなスライダー**（CONTRACT-NOTE 参照）。
     ・触覚は core/caps.js の `haptic()` に一本化（iOS に navigator.vibrate は
       無い＝契約書 §13.4。必ず視覚の合図が付く）。
     ・store への書き込みは **必ず ops 経由**。同種の連続 op は store が
       120ms で合体させるので、擦っている間の dispatch は取消 1 単位に収まる。

   ★ 触るときの注意
     ・CONTRACT-NOTE（スライダー）: 契約書 §7.3 の `widgets.slider` は
       デスクトップの細かい値用で、指で擦る 44px の当たり判定・中央スナップの
       触覚・「擦り終わり」の合図を持たない。モバイルの値はここの
       `.vqs-m-field` を使う（`widgets` が在る/無いで見た目が変わらない）。
       それ以外（シート・トースト・アイコン・色）は widgets を優先する。
     ・CONTRACT-NOTE（前面へ/背面へ）: 契約書に「レイヤー順」の op は無い。
       重なり順 = トラックの並びなので、上下の互換トラックへ `clip.move`
       （無ければ `track.add`）で運ぶ。1 取消単位にするため store.batch を通す。
     ・CONTRACT-NOTE（速度）: 速度は擦る途中に当てると in/out が動いて値が
       滑るので、**指を離した時に 1 回だけ**当てる（表示だけ先に動かす）。
     ・`touch-action` は styles/mobile.css の持ち物。ただし擦る部品には
       「CSS が未完成でも動く」ように inline でも入れてある。
     ・画面幅が 1024px 以上に戻っても app.js はこの殻を捨てない（render() を
       呼ぶだけ）。なので render() の先頭で自分から引っ込む。
     ・CONTRACT-NOTE（行数）: 共通前提の「700 行で分割」を超えている。
       モバイルの担当ファイルは この 1 つ（と mobile.css）だけなので、
       分割先を勝手に作れない。分けて良い事になったら
       「§2.5 シートの中身」を `ui/mobile-sheets.js`（`clipSheet` と
       `tabSheet` をそのまま移す。依存は `fieldOf` 等を引数で渡す形）へ
       出すのが一番切り口が綺麗。隣の src/ui/* も 800〜2500 行なので、
       今の形でも repo の実情からは外れていない。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, hexToRgb, rgbToHex } from "../core/util.js";
import { haptic, guardGestures, caps } from "../core/caps.js";
import { warn } from "../core/log.js";
import { RATIOS, findClip } from "../core/schema.js";
import { snapFrame } from "../core/time.js";

/* ── 0. 決め打ちの数（CSS 側と揃える） ─────────────────────────────── */

/** モバイルの境目（契約書 §7.2） */
export const MOBILE_W = 1024;
/** 掴み棒を下げて閉じる距離 / 上げて全高にする距離 */
const SHEET_CLOSE_PX = 96, SHEET_GROW_PX = 56;
/** 叩いた扱いにする移動量 */
const TAP_SLOP = 10;
/** キーボードが出たと見なす高さ */
const KB_MIN = 80;

/** 下段タブ（契約書 §7.2 の並び） */
export const M_TABS = Object.freeze([
  { id: "edit", label: "編集", glyph: "✂", icon: "scissors", go: { kind: "edit" } },
  { id: "audio", label: "オーディオ", glyph: "♪", icon: "music", go: { kind: "lib", tab: "audio" } },
  { id: "text", label: "テキスト", glyph: "T", icon: "type", go: { kind: "lib", tab: "text" } },
  { id: "sticker", label: "ステッカー", glyph: "★", icon: "sticker", go: { kind: "lib", tab: "sticker" } },
  { id: "overlay", label: "オーバーレイ", glyph: "❐", icon: "layers", go: { kind: "sheet", sheet: "overlay" } },
  { id: "effect", label: "エフェクト", glyph: "✦", icon: "sparkles", go: { kind: "lib", tab: "fx" } },
  { id: "filter", label: "フィルター", glyph: "◑", icon: "filter", go: { kind: "lib", tab: "filter" } },
  { id: "ratio", label: "比率", glyph: "▭", icon: "ratio", go: { kind: "sheet", sheet: "ratio" } },
  { id: "ai", label: "自動編集", glyph: "✧", icon: "wand", go: { kind: "action", action: "ai" } }
]);

const SRC_KINDS = Object.freeze(["video", "audio"]);            // in/out を持つ
const SND_KINDS = Object.freeze(["video", "audio", "compound"]);
const VIS_KINDS = Object.freeze(["video", "image", "text", "shape", "compound"]);

/** 文脈ツールバー（クリップ選択中）。`now:true` はシートを出さず即やる物 */
export const M_ACTIONS = Object.freeze([
  { id: "split", label: "分割", glyph: "⋔", icon: "split", now: true },
  { id: "delete", label: "削除", glyph: "⌫", icon: "trash", now: true, danger: true },
  { id: "dup", label: "複製", glyph: "⧉", icon: "copy", now: true },
  { id: "speed", label: "速度", glyph: "⏵", icon: "speed", kinds: SRC_KINDS },
  { id: "volume", label: "音量", glyph: "◔", icon: "volume", kinds: SND_KINDS },
  { id: "anim", label: "アニメーション", glyph: "✧", icon: "anim", kinds: VIS_KINDS },
  { id: "opacity", label: "不透明度", glyph: "◐", icon: "opacity", kinds: VIS_KINDS },
  { id: "crop", label: "クロップ", glyph: "⬚", icon: "crop", kinds: VIS_KINDS },
  { id: "rotate", label: "回転", glyph: "⟳", icon: "rotate", kinds: VIS_KINDS },
  { id: "flip", label: "反転", glyph: "⇋", icon: "flip", kinds: VIS_KINDS },
  { id: "reverse", label: "逆再生", glyph: "◀", icon: "reverse", now: true, kinds: SRC_KINDS },
  { id: "freeze", label: "フリーズ", glyph: "❄", icon: "freeze", now: true, kinds: ["video"] },
  { id: "mask", label: "マスク", glyph: "◯", icon: "mask", kinds: VIS_KINDS },
  { id: "chroma", label: "クロマキー", glyph: "◧", icon: "chroma", kinds: ["video", "image"] },
  { id: "color", label: "カラー", glyph: "◑", icon: "color", kinds: VIS_KINDS },
  { id: "fx", label: "効果", glyph: "✦", icon: "sparkles", kinds: VIS_KINDS },
  { id: "trans", label: "遷移", glyph: "⇄", icon: "transition", kinds: VIS_KINDS },
  { id: "detach", label: "音を分離", glyph: "♪", icon: "unlink", now: true, kinds: ["video"] },
  { id: "front", label: "前面へ", glyph: "▲", icon: "up", now: true, kinds: VIS_KINDS },
  { id: "back", label: "背面へ", glyph: "▼", icon: "down", now: true, kinds: VIS_KINDS },
  { id: "more", label: "詳細", glyph: "⋯", icon: "more" }
]);

/** 選択が無いときの文脈ツールバー */
export const M_EMPTY_ACTIONS = Object.freeze([
  { id: "add", label: "素材を追加", glyph: "＋", icon: "plus" },
  { id: "addtext", label: "テキスト", glyph: "T", icon: "type" },
  { id: "record", label: "録音", glyph: "●", icon: "mic" },
  { id: "ai", label: "自動編集", glyph: "✧", icon: "wand" }
]);

/** アニメーション・遷移の種類（ai/planner.js の Plan と同じ綴り） */
const ANIM_IN = [["fade", "フェード"], ["fadeUp", "下から"], ["zoomIn", "ズーム"], ["slide", "スライド"], ["none", "なし"]];
const TRANS_TYPES = [["crossfade", "溶ける"], ["slide", "スライド"], ["whipPan", "振り"], ["zoomIn", "ズーム"], ["glitch", "グリッチ"], ["cut", "なし"]];
const MASK_TYPES = [["none", "なし"], ["rect", "長方形"], ["ellipse", "楕円"], ["linear", "直線"], ["radial", "円"]];
const FX_QUICK = [["glitch", "グリッチ"], ["shake", "揺れ"], ["glow", "発光"], ["blur", "ぼかし"], ["rgbShift", "色ずれ"], ["vignette", "周辺減光"]];

/* ── 1. 純粋な計算（DOM を触らない = 目で追える所） ───────────────── */

/**
 * そのクリップに出す文脈ツールバーの項目。
 * @param {string} kind Clip.kind（無選択は "" を渡す）
 * @param {number} [count=1] 選択数
 * @returns {Object[]} M_ACTIONS の部分集合（複数選択では単体専用の物を落とす）
 */
export function actionsFor(kind, count) {
  const k = String(kind || "");
  if (!k) return M_EMPTY_ACTIONS.slice();
  const n = Math.max(1, Math.round(finite(count, 1)));
  const single = { split: 1, freeze: 1, detach: 1, trans: 1, chroma: 1 };
  return M_ACTIONS.filter((a) => {
    if (a.kinds && a.kinds.indexOf(k) < 0) return false;
    if (n > 1 && single[a.id]) return false;
    return true;
  });
}

/**
 * 中央スナップ。中央のそばでは中央へ吸い付く（吸い付いたかも返す）。
 * @param {number} v @param {number|undefined} center @param {number} tol
 * @returns {{v:number, snapped:boolean}}
 */
export function snapCenter(v, center, tol) {
  const x = finite(v, 0);
  if (center === undefined || center === null) return { v: x, snapped: false };
  const c = finite(center, 0), t = Math.abs(finite(tol, 0));
  if (t > 0 && Math.abs(x - c) <= t) return { v: c, snapped: true };
  return { v: x, snapped: false };
}

/**
 * ソフトキーボードで隠れた高さ（visualViewport から）。
 * @param {{innerHeight:number, height:number, offsetTop:number}} v
 * @returns {number} px（0 以上）
 */
export function keyboardInset(v) {
  const o = v || {};
  const n = finite(o.innerHeight, 0) - finite(o.height, 0) - finite(o.offsetTop, 0);
  return n > 0 ? Math.round(n) : 0;
}

/**
 * 高さ配分の次の段（叩くと拡大・もう一度で戻る）。
 * @param {string} cur "normal"|"preview"|"timeline"
 * @returns {string}
 */
export function nextLayout(cur) {
  return cur === "preview" ? "normal" : "preview";
}

/**
 * 分割してよい時刻か（両側に MIN_TRIM_UI ぶん残るか。契約書 §13.5）。
 * @param {{start:number,duration:number}} clip @param {number} t @returns {boolean}
 */
export function canSplitAt(clip, t) {
  const c = clip || {};
  const s = finite(c.start, 0), d = finite(c.duration, 0), x = finite(t, -1);
  return x > s + 0.1 && x < s + d - 0.1;
}

/* ── 2. 本体 ───────────────────────────────────────────────────── */

/**
 * モバイルの殻を起こす（契約書 §7.2）。
 * @param {{store:Object, els:Object, widgets?:Object, transport?:Object,
 *          onAction?:Function, ctx?:Object}} deps
 * @returns {{render:Function, setTab:Function, openClipActions:Function,
 *            close:Function, dispose:Function}}
 */
export function createMobileShell(deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.dispatch !== "function") {
    throw new Error("createMobileShell: store が要ります（契約書 §3）");
  }
  const els = d.els || {};
  const W = d.widgets || null;
  const transport = d.transport || null;
  const onAction = typeof d.onAction === "function" ? d.onAction : () => {};
  const ctx = d.ctx || {};
  const root = document.documentElement;
  const app = els.app || document.getElementById("app") || document.body;
  const mine = [];                 // 自分で作った要素（dispose で捨てる）
  const offs = [];                 // 外した後始末
  let dead = false, tab = "edit", panel = "", actSig = "", sheet = null, fs = false;

  /* ── 2.1 小道具 ──────────────────────────────────────────────── */

  const mk = (tag, cls, text) => {
    const n = document.createElement(tag || "div");
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  function on(el, type, fn, opts) {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    offs.push(() => { try { el.removeEventListener(type, fn, opts); } catch (e) { /* noop */ } });
  }
  function own(tag, cls, parent) {
    const n = mk(tag, cls);
    (parent || app).appendChild(n);
    mine.push(n);
    return n;
  }
  /** widgets.icon が在れば線画、無ければ文字（画面が空にならないこと） */
  function ico(name, glyph, cls) {
    if (W && typeof W.icon === "function") {
      try {
        const g = W.icon(name);
        if (g && g.nodeType === 1) { g.setAttribute("class", cls); return g; }
      } catch (e) { /* 文字へ落ちる */ }
    }
    return mk("span", cls, glyph || "");
  }
  function toast(msg, o) {
    if (W && typeof W.toast === "function") { try { return W.toast(msg, o); } catch (e) { /* noop */ } }
    warn("mobile", "toast:", msg);
    return null;
  }
  const buzz = (ms, el) => { try { haptic(ms, el); } catch (e) { /* noop */ } };
  const isMobile = () => (globalThis.innerWidth || 1024) < MOBILE_W;
  const view = () => store.view || { playhead: 0 };
  const fps = () => finite(store.project && store.project.settings && store.project.settings.fps, 30);
  const playhead = () => (transport && typeof transport.time === "number" ? transport.time : finite(view().playhead, 0));
  /** ctx から他の部品を探す（app.js は parts を api 越しに見せている） */
  function part(name) {
    const p = (ctx.app && ctx.app.parts) || ctx.parts || {};
    return p[name] || ctx[name] || null;
  }
  /** op を 1 つ当てる。失敗は握りつぶさずトーストで見せる */
  function run(type, payload) {
    try { return store.dispatch(type, payload); }
    catch (e) { toast(String((e && e.message) || e), { kind: "error" }); return null; }
  }
  /** 選択中のクリップ（{track, clip} の配列） */
  function sel() {
    const ids = (store.selection && store.selection.clipIds) || [];
    const out = [];
    for (const id of ids) {
      const f = findClip(store.project, id);
      if (f && f.clip) out.push(f);
    }
    return out;
  }

  /* ── 2.2 置き場（無ければ自分で作る＝画面が死なない） ──────────── */

  const bar = els.mobileBar || document.getElementById("mobileBar") || own("nav", "vqs-mobilebar");
  const actsBar = els.contextBar || document.getElementById("contextBar") || own("div", "vqs-contextbar");
  const sheetHost = document.getElementById("sheetHost") || app;
  /* CSS は id（#mobileBar / #contextBar）で掛かるので、控えで作った時も付ける */
  if (!bar.id) bar.id = "mobileBar";
  if (!actsBar.id) actsBar.id = "contextBar";
  bar.classList.add("vqs-m-tabs");
  actsBar.classList.add("vqs-m-acts");
  bar.setAttribute("role", "tablist");
  /* 抽斗（#left / #right を下から出すときの被せ物）と暗幕 */
  const veil = own("div", "vqs-m-veil vqs-m-veil--panel");
  veil.hidden = true;
  const drawer = own("div", "vqs-m-drawerbar");
  drawer.hidden = true;
  const dGrab = mk("i", "vqs-m-drawerbar__grab");
  const dTitle = mk("span", "vqs-m-drawerbar__title", "素材");
  const dDone = mk("button", "vqs-m-drawerbar__done", "完了");
  dDone.type = "button";
  drawer.append(dGrab, dTitle, dDone);
  dGrab.style.touchAction = "none";
  on(dDone, "click", () => closePanel());
  on(veil, "click", () => closePanel());
  /* プレビューの拡大切替（叩く所が無い端末でも押せる浮きボタン） */
  const expand = els.previewWrap ? own("button", "vqs-m-expand", els.previewWrap) : null;
  if (expand) {
    expand.type = "button";
    expand.hidden = true;
    expand.title = "プレビューの大きさ";
    expand.setAttribute("aria-label", "プレビューの大きさを切り替える");
    expand.append(ico("expand", "⤢", "vqs-m-expand__ico"));
    on(expand, "click", (e) => { e.stopPropagation(); setLayout(nextLayout(root.dataset.vqsMlayout || "normal")); });
  }
  const fsBtn = els.previewWrap ? own("button", "vqs-m-fsbtn", els.previewWrap) : null;
  if (fsBtn) {
    fsBtn.type = "button";
    fsBtn.hidden = true;
    fsBtn.setAttribute("aria-label", "全画面で再生");
    fsBtn.append(ico("fullscreen", "⛶", "vqs-m-fsbtn__ico"));
    on(fsBtn, "click", (e) => { e.stopPropagation(); toggleFs(); });
  }

  /* ── 2.3 シート（widgets 優先・無ければ同じ作法の控え） ────────── */

  function closeSheet() {
    const s = sheet;
    sheet = null;
    if (s && typeof s.close === "function") { try { s.close(); } catch (e) { /* noop */ } }
    root.classList.remove("vqs-m-sheeting");
  }
  /**
   * ボトムシートを出す。
   * @param {{title:string, height?:string, content:HTMLElement}} spec
   */
  function openSheet(spec) {
    closeSheet();
    root.classList.add("vqs-m-sheeting");
    const done = () => closeSheet();
    if (W && typeof W.openSheet === "function") {
      try {
        const h = W.openSheet({
          title: spec.title, content: spec.content, height: spec.height || "half",
          actions: [{ id: "done", label: "完了", primary: true, onClick: done }]
        });
        if (h && typeof h.close === "function") { sheet = h; return h; }
      } catch (e) { warn("mobile", "widgets.openSheet が使えないので控えを出す", e && e.message); }
    }
    sheet = fallbackSheet(spec);
    return sheet;
  }
  /** 控えのシート（掴み棒・暗幕・スクロール・右上の「完了」） */
  function fallbackSheet(spec) {
    const vl = mk("div", "vqs-m-veil");
    const sh = mk("section", "vqs-m-sheet vqs-m-sheet--" + (spec.height === "full" ? "full" : "half"));
    sh.setAttribute("role", "dialog");
    sh.setAttribute("aria-modal", "true");
    sh.setAttribute("aria-label", spec.title || "設定");
    sh.dataset.test = "m-sheet";
    const grab = mk("div", "vqs-m-sheet__grab");
    grab.append(mk("i"));
    grab.style.touchAction = "none";
    const head = mk("div", "vqs-m-sheet__head");
    const done = mk("button", "vqs-m-sheet__done", "完了");
    done.type = "button";
    done.dataset.test = "m-sheet-done";
    head.append(mk("h2", "vqs-m-sheet__title", spec.title || ""), done);
    const body = mk("div", "vqs-m-sheet__body");
    if (spec.content) body.append(spec.content);
    sh.append(grab, head, body);
    sheetHost.append(vl, sh);
    requestAnimationFrame(() => { vl.classList.add("is-on"); sh.classList.add("is-on"); });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      sh.classList.remove("is-on");
      vl.classList.remove("is-on");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => { try { sh.remove(); vl.remove(); } catch (e) { /* noop */ } }, 220);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeSheet(); } };
    document.addEventListener("keydown", onKey);
    vl.addEventListener("click", () => closeSheet());
    done.addEventListener("click", () => closeSheet());
    /* 掴み棒: 下げれば閉じる・上げれば全高 */
    let y0 = 0, dy = 0, dragging = false;
    grab.addEventListener("pointerdown", (e) => {
      dragging = true; y0 = e.clientY; dy = 0;
      try { grab.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
      sh.style.transition = "none";
    });
    grab.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = e.clientY - y0;
      sh.style.transform = "translate3d(0," + Math.max(-SHEET_GROW_PX, dy) + "px,0)";
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      sh.style.transition = "";
      sh.style.transform = "";
      if (dy > SHEET_CLOSE_PX) { buzz(10, sh); closeSheet(); return; }
      if (dy < -SHEET_GROW_PX / 2) { sh.classList.remove("vqs-m-sheet--half"); sh.classList.add("vqs-m-sheet--full"); buzz(6, sh); }
    };
    grab.addEventListener("pointerup", up);
    grab.addEventListener("pointercancel", up);
    return { close, el: sh };
  }

  /* ── 2.4 値の入れ物（大きなスライダー・中央スナップ・触覚） ────── */

  /**
   * @param {{label:string, min:number, max:number, step?:number, value:number,
   *          center?:number, unit?:string, fmt?:Function, onInput?:Function,
   *          onDone?:Function}} o
   */
  function fieldOf(o) {
    const wrap = mk("div", "vqs-m-field");
    const head = mk("div", "vqs-m-field__head");
    const val = mk("span", "vqs-m-field__val");
    head.append(mk("span", "vqs-m-field__label", o.label || ""), val);
    const rail = mk("div", "vqs-m-field__rail");
    rail.style.touchAction = "none";
    rail.tabIndex = 0;
    rail.setAttribute("role", "slider");
    rail.setAttribute("aria-label", o.label || "値");
    const fill = mk("i", "vqs-m-field__fill"), knob = mk("i", "vqs-m-field__knob");
    const min = finite(o.min, 0), max = finite(o.max, 1), step = Math.abs(finite(o.step, 0));
    if (o.center !== undefined) {
      const cm = mk("i", "vqs-m-field__center");
      /* 中央の印は「真ん中」ではなく center の在る所（速度の 1x は中点ではない） */
      cm.style.left = (clamp((finite(o.center, 0) - min) / ((max - min) || 1), 0, 1) * 100) + "%";
      rail.append(cm);
    }
    rail.append(fill, knob);
    wrap.append(head, rail);
    const tol = (max - min) * 0.03;
    let v = clamp(finite(o.value, min), min, max), snapped = false;
    function show() {
      const p = (v - min) / ((max - min) || 1);
      fill.style.width = (p * 100) + "%";
      knob.style.left = (p * 100) + "%";
      val.textContent = (o.fmt ? o.fmt(v) : String(Math.round(v * 100) / 100)) + (o.unit || "");
      rail.setAttribute("aria-valuenow", String(Math.round(v * 1000) / 1000));
      rail.setAttribute("aria-valuetext", val.textContent);
    }
    function put(raw, live) {
      let x = clamp(finite(raw, v), min, max);
      if (step > 0) x = Math.round(x / step) * step;
      const s = snapCenter(x, o.center, tol);
      if (s.snapped && !snapped) buzz(8, knob);
      snapped = s.snapped;
      v = clamp(s.v, min, max);
      show();
      if (live && o.onInput) { try { o.onInput(v); } catch (e) { warn("mobile", "onInput", e && e.message); } }
    }
    const fromX = (cx) => {
      const r = rail.getBoundingClientRect();
      return min + ((cx - r.left) / Math.max(1, r.width)) * (max - min);
    };
    let drag = false;
    rail.addEventListener("pointerdown", (e) => {
      drag = true;
      rail.classList.add("is-drag");
      try { rail.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
      put(fromX(e.clientX), true);
    });
    rail.addEventListener("pointermove", (e) => { if (drag) put(fromX(e.clientX), true); });
    const end = () => {
      if (!drag) return;
      drag = false;
      rail.classList.remove("is-drag");
      if (o.onDone) { try { o.onDone(v); } catch (e) { warn("mobile", "onDone", e && e.message); } }
    };
    rail.addEventListener("pointerup", end);
    rail.addEventListener("pointercancel", end);
    rail.addEventListener("keydown", (e) => {
      const k = step || (max - min) / 100;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { put(v - k, true); if (o.onDone) o.onDone(v); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { put(v + k, true); if (o.onDone) o.onDone(v); e.preventDefault(); }
    });
    show();
    return wrap;
  }
  /** 横並びの選択（widgets.segmented を優先） */
  function chipsOf(items, value, onChange) {
    if (W && typeof W.segmented === "function") {
      try {
        const n = W.segmented({ items: items.map((x) => ({ id: x[0], value: x[0], label: x[1] })), value, onChange });
        if (n && n.nodeType === 1) { n.classList.add("vqs-m-seg"); return n; }
      } catch (e) { /* 自前へ落ちる */ }
    }
    const box = mk("div", "vqs-m-chips");
    for (const it of items) {
      const b = mk("button", "vqs-m-chip" + (it[0] === value ? " vqs-m-chip--on" : ""), it[1]);
      b.type = "button";
      b.addEventListener("click", () => {
        for (const c of box.children) c.classList.remove("vqs-m-chip--on");
        b.classList.add("vqs-m-chip--on");
        buzz(6, b);
        try { onChange(it[0]); } catch (e) { warn("mobile", "chips", e && e.message); }
      });
      box.append(b);
    }
    return box;
  }
  /** 入切（widgets.toggle を優先） */
  function toggleOf(label, value, onChange) {
    if (W && typeof W.toggle === "function") {
      try {
        const n = W.toggle({ label, value, onChange });
        if (n && n.nodeType === 1) { n.classList.add("vqs-m-row"); return n; }
      } catch (e) { /* 自前へ落ちる */ }
    }
    const row = mk("div", "vqs-m-row");
    const b = mk("button", "vqs-m-switch" + (value ? " vqs-m-switch--on" : ""));
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", value ? "true" : "false");
    b.append(mk("i"));
    let on_ = !!value;
    b.addEventListener("click", () => {
      on_ = !on_;
      b.classList.toggle("vqs-m-switch--on", on_);
      b.setAttribute("aria-checked", on_ ? "true" : "false");
      buzz(6, b);
      try { onChange(on_); } catch (e) { warn("mobile", "toggle", e && e.message); }
    });
    row.append(mk("span", "vqs-m-row__label", label), b);
    return row;
  }
  /** 色（widgets.colorField を優先） */
  function colorOf(label, value, onChange) {
    const row = mk("div", "vqs-m-row");
    row.append(mk("span", "vqs-m-row__label", label));
    if (W && typeof W.colorField === "function") {
      try {
        const n = W.colorField({ value, onInput: onChange });
        if (n && n.nodeType === 1) { n.classList.add("vqs-m-color"); row.append(n); return row; }
      } catch (e) { /* 自前へ落ちる */ }
    }
    const inp = mk("input", "vqs-m-color");
    inp.type = "color";
    inp.value = value || "#00ff00";
    inp.addEventListener("input", () => { try { onChange(inp.value); } catch (e) { /* noop */ } });
    row.append(inp);
    return row;
  }
  const btnOf = (label, cls, fn) => {
    const b = mk("button", "vqs-m-btn" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  };

  /* ── 2.5 シートの中身（機能ごと） ─────────────────────────────── */

  /** タブから開くシート */
  function tabSheet(id) {
    const box = mk("div", "vqs-m-pad");
    if (id === "ratio") {
      const cur = String((store.project.settings || {}).ratio || "16:9");
      box.append(mk("p", "vqs-m-note", "書き出しの形を決めます。素材の位置は変わりません。"));
      const grid = mk("div", "vqs-m-grid");
      for (const key of Object.keys(RATIOS)) {
        if (key === "custom") continue;
        const b = btnOf(RATIOS[key].label, cur === key ? "vqs-m-btn--primary" : "vqs-m-btn--ghost", () => {
          run("settings.update", { patch: { ratio: key } });
          buzz(8, b);
          closeSheet();
        });
        grid.append(b);
      }
      box.append(grid);
      return { title: "比率", height: "half", content: box };
    }
    /* オーバーレイ（重ねる） */
    box.append(mk("p", "vqs-m-note", "上のレイヤーに重ねます。"));
    box.append(btnOf("素材を重ねる", "vqs-m-btn--primary", () => { closeSheet(); onAction("import"); }));
    box.append(btnOf("テキストを重ねる", "", () => { closeSheet(); openPanel("library", "text"); }));
    box.append(btnOf("ステッカーを重ねる", "", () => { closeSheet(); openPanel("library", "sticker"); }));
    return { title: "オーバーレイ", height: "half", content: box };
  }

  /**
   * クリップの専用シート。
   * @param {string} id @param {Object[]} s 選択（{track,clip}）
   * @returns {{title:string, height:string, content:HTMLElement}|null}
   */
  function clipSheet(id, s) {
    const c = s[0].clip, ids = s.map((x) => x.clip.id);
    const box = mk("div", "vqs-m-pad");
    const upd = (patch) => run("clip.update", { clipIds: ids, patch });
    const tf = (patch) => run("clip.setTransform", { clipIds: ids, patch });
    const tr = c.transform || {};
    const title = (M_ACTIONS.find((a) => a.id === id) || {}).label || "設定";
    const half = { title, height: "half", content: box };

    if (id === "speed") {
      let keep = false;
      const apply = (v) => run("clip.setSpeed", { clipId: c.id, speed: v, keepDuration: keep });
      box.append(chipsOf([["0.25", "0.25x"], ["0.5", "0.5x"], ["1", "1x"], ["2", "2x"], ["4", "4x"]],
        String(finite(c.speed, 1)), (v) => apply(Number(v))));
      box.append(fieldOf({
        label: "速さ", min: 0.1, max: 10, step: 0.05, value: finite(c.speed, 1), center: 1,
        unit: "x", fmt: (v) => String(Math.round(v * 100) / 100), onDone: apply
      }));
      box.append(toggleOf("尺を保つ", false, (v) => { keep = v; }));
      box.append(mk("p", "vqs-m-note", "指を離したときに反映します（擦っている間に素材の窓が動くのを防ぐため）。"));
      return half;
    }
    if (id === "volume") {
      const fade = c.audioFade || {};
      box.append(fieldOf({
        label: "音量", min: 0, max: 2, step: 0.01, value: finite(c.volume, 1), center: 1,
        fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => upd({ volume: v })
      }));
      box.append(toggleOf("消音", !!c.muteAudio, (v) => upd({ muteAudio: v })));
      box.append(fieldOf({ label: "フェードイン", min: 0, max: 5, step: 0.05, value: finite(fade.in, 0), unit: " 秒", onInput: (v) => upd({ audioFade: { in: v } }) }));
      box.append(fieldOf({ label: "フェードアウト", min: 0, max: 5, step: 0.05, value: finite(fade.out, 0), unit: " 秒", onInput: (v) => upd({ audioFade: { out: v } }) }));
      return half;
    }
    if (id === "anim") {
      if (c.kind === "text") {
        const an = (c.text && c.text.anim) || {};
        box.append(mk("p", "vqs-m-note", "入りの動き"));
        box.append(chipsOf(ANIM_IN, String((an.in && an.in.type) || "fade"), (v) => run("clip.setText", { clipIds: ids, patch: { anim: { in: { type: v, duration: finite(an.in && an.in.duration, 0.4) } } } })));
        box.append(mk("p", "vqs-m-note", "出の動き"));
        box.append(chipsOf(ANIM_IN, String((an.out && an.out.type) || "fade"), (v) => run("clip.setText", { clipIds: ids, patch: { anim: { out: { type: v, duration: finite(an.out && an.out.duration, 0.3) } } } })));
        box.append(fieldOf({ label: "長さ", min: 0.1, max: 2, step: 0.05, value: finite(an.in && an.in.duration, 0.4), unit: " 秒", onInput: (v) => run("clip.setText", { clipIds: ids, patch: { anim: { in: { duration: v }, out: { duration: v } } } }) }));
        return half;
      }
      /* CONTRACT-NOTE: 文字以外に「アニメ」の枝は無いので、入り・出の遷移で表す */
      box.append(mk("p", "vqs-m-note", "入りの動き"));
      box.append(chipsOf(TRANS_TYPES, String((c.transitionIn && c.transitionIn.type) || "cut"), (v) => setTrans("in", v)));
      box.append(mk("p", "vqs-m-note", "出の動き"));
      box.append(chipsOf(TRANS_TYPES, String((c.transitionOut && c.transitionOut.type) || "cut"), (v) => setTrans("out", v)));
      return half;
    }
    if (id === "opacity") {
      box.append(fieldOf({
        label: "不透明度", min: 0, max: 1, step: 0.01, value: finite(c.opacity, 1),
        fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => upd({ opacity: v })
      }));
      return half;
    }
    if (id === "crop") {
      const cr = tr.crop || {};
      box.append(mk("p", "vqs-m-note", "プレビューの枠を直接つまんでも切り抜けます。"));
      for (const f of [["l", "左"], ["t", "上"], ["r", "右"], ["b", "下"]]) {
        const patch = {};
        box.append(fieldOf({
          label: f[1], min: 0, max: 0.45, step: 0.005, value: finite(cr[f[0]], 0),
          fmt: (v) => String(Math.round(v * 100)), unit: "%",
          onInput: (v) => { patch[f[0]] = v; tf({ crop: patch }); }
        }));
      }
      box.append(btnOf("切り抜きを戻す", "vqs-m-btn--ghost", () => { tf({ crop: { l: 0, t: 0, r: 0, b: 0 } }); closeSheet(); }));
      return half;
    }
    if (id === "rotate") {
      box.append(chipsOf([["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]], String(Math.round(finite(tr.rotate, 0))), (v) => tf({ rotate: Number(v) })));
      box.append(fieldOf({
        label: "角度", min: -180, max: 180, step: 1, value: finite(tr.rotate, 0), center: 0,
        unit: "°", fmt: (v) => String(Math.round(v)), onInput: (v) => tf({ rotate: v })
      }));
      box.append(fieldOf({
        label: "拡大", min: 0.1, max: 4, step: 0.01, value: finite(tr.scale, 1), center: 1,
        fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => tf({ scale: v })
      }));
      return half;
    }
    if (id === "flip") {
      box.append(toggleOf("左右を反転", !!tr.flipH, (v) => tf({ flipH: v })));
      box.append(toggleOf("上下を反転", !!tr.flipV, (v) => tf({ flipV: v })));
      return half;
    }
    if (id === "mask") {
      const m = c.mask || {};
      box.append(chipsOf(MASK_TYPES, String(m.type || "none"), (v) => {
        if (v === "none") run("clip.setMask", { clipIds: ids, patch: null });
        else run("clip.setMask", { clipIds: ids, patch: { type: v } });
      }));
      box.append(fieldOf({ label: "ぼかし", min: 0, max: 0.5, step: 0.005, value: finite(m.feather, 0), fmt: (v) => String(Math.round(v * 200)), unit: "%", onInput: (v) => run("clip.setMask", { clipIds: ids, patch: { feather: v } }) }));
      box.append(fieldOf({ label: "大きさ", min: 0.05, max: 1, step: 0.01, value: finite(m.w, 0.5), fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => run("clip.setMask", { clipIds: ids, patch: { w: v, h: v } }) }));
      box.append(toggleOf("内と外を入れ替える", !!m.invert, (v) => run("clip.setMask", { clipIds: ids, patch: { invert: v } })));
      return half;
    }
    if (id === "chroma") {
      const ch = c.chroma || {};
      const key = Array.isArray(ch.key) ? ch.key : [0, 1, 0];
      const hex = rgbToHex(Math.round(clamp(key[0], 0, 1) * 255), Math.round(clamp(key[1], 0, 1) * 255), Math.round(clamp(key[2], 0, 1) * 255));
      box.append(toggleOf("クロマキーを使う", ch.enabled !== false && !!c.chroma, (v) => run("clip.setChroma", { clipIds: ids, patch: v ? { enabled: true } : null })));
      box.append(colorOf("抜く色", hex, (v) => {
        const rgb = hexToRgb(v) || { r: 0, g: 255, b: 0 };
        run("clip.setChroma", { clipIds: ids, patch: { enabled: true, key: [rgb.r / 255, rgb.g / 255, rgb.b / 255] } });
      }));
      box.append(fieldOf({ label: "許容", min: 0, max: 1, step: 0.01, value: finite(ch.similarity, 0.4), fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => run("clip.setChroma", { clipIds: ids, patch: { similarity: v } }) }));
      box.append(fieldOf({ label: "縁の滑らかさ", min: 0, max: 1, step: 0.01, value: finite(ch.smoothness, 0.1), fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => run("clip.setChroma", { clipIds: ids, patch: { smoothness: v } }) }));
      box.append(fieldOf({ label: "色かぶり取り", min: 0, max: 1, step: 0.01, value: finite(ch.spill, 0.2), fmt: (v) => String(Math.round(v * 100)), unit: "%", onInput: (v) => run("clip.setChroma", { clipIds: ids, patch: { spill: v } }) }));
      return half;
    }
    if (id === "color") {
      const g = c.color || {};
      const put = (k) => (v) => { const p = {}; p[k] = v; run("clip.setColor", { clipIds: ids, patch: p }); };
      for (const f of [["exposure", "露出", 2], ["contrast", "コントラスト", 1], ["saturation", "彩度", 1],
        ["temperature", "色温度", 1], ["highlights", "明部", 1], ["shadows", "暗部", 1], ["vignette", "周辺減光", 1]]) {
        box.append(fieldOf({
          label: f[1], min: f[0] === "vignette" ? 0 : -1, max: 1, step: 0.01, value: finite(g[f[0]], 0),
          center: f[0] === "vignette" ? undefined : 0,
          fmt: (v) => String(Math.round(v * (f[2] === 2 ? 2 : 100) * 100) / 100), unit: f[2] === 2 ? " EV" : "",
          onInput: put(f[0])
        }));
      }
      box.append(btnOf("色を戻す", "vqs-m-btn--ghost", () => { run("clip.setColor", { clipIds: ids, patch: null }); closeSheet(); }));
      return { title, height: "full", content: box };
    }
    if (id === "fx") {
      const list = Array.isArray(c.fx) ? c.fx : [];
      if (!list.length) box.append(mk("p", "vqs-m-note", "まだ効果がありません。下から選んで足せます。"));
      for (const f of list) {
        const amt = finite((f.params || {}).amount, 0.5);
        box.append(fieldOf({
          label: f.type, min: 0, max: 1, step: 0.01, value: amt,
          fmt: (v) => String(Math.round(v * 100)), unit: "%",
          onInput: (v) => run("clip.updateFx", { clipId: c.id, fxId: f.id, params: { amount: v } })
        }));
        box.append(btnOf("「" + f.type + "」を外す", "vqs-m-btn--ghost", () => { run("clip.removeFx", { clipId: c.id, fxId: f.id }); closeSheet(); }));
      }
      box.append(mk("p", "vqs-m-note", "足す"));
      const grid = mk("div", "vqs-m-grid");
      for (const q of FX_QUICK) grid.append(btnOf(q[1], "", () => { run("clip.addFx", { clipId: c.id, type: q[0], params: { amount: 0.5 } }); closeSheet(); }));
      box.append(grid);
      box.append(btnOf("一覧から選ぶ", "vqs-m-btn--primary", () => { closeSheet(); openPanel("library", "fx"); }));
      return { title, height: "full", content: box };
    }
    if (id === "trans") {
      const cur = c.transitionOut || {};
      box.append(mk("p", "vqs-m-note", "次のクリップへの繋ぎ"));
      box.append(chipsOf(TRANS_TYPES, String(cur.type || "cut"), (v) => setTrans("out", v)));
      box.append(fieldOf({
        label: "長さ", min: 0.1, max: 2, step: 0.05, value: finite(cur.duration, 0.5), unit: " 秒",
        onInput: (v) => run("clip.setTransition", { clipId: c.id, edge: "out", type: String(cur.type || "crossfade"), duration: v })
      }));
      box.append(mk("p", "vqs-m-note", "前のクリップからの繋ぎ"));
      box.append(chipsOf(TRANS_TYPES, String((c.transitionIn || {}).type || "cut"), (v) => setTrans("in", v)));
      return half;
    }
    return null;

    function setTrans(edge, type) {
      if (type === "cut") run("clip.removeTransition", { clipId: c.id, edge });
      else run("clip.setTransition", { clipId: c.id, edge, type, duration: 0.5 });
    }
  }

  /* ── 2.6 即やる操作 ──────────────────────────────────────────── */

  function layerMove(dir) {
    const s = sel();
    if (!s.length) return;
    const tracks = (store.project.tracks || []).slice();
    const from = tracks.findIndex((t) => t.id === s[0].track.id);
    const audio = s[0].clip.kind === "audio";
    const want = audio ? ["audio"] : ["video", "overlay"];
    let to = -1;
    for (let i = from + dir; i >= 0 && i < tracks.length; i += dir) {
      if (want.indexOf(tracks[i].kind) >= 0 && !tracks[i].locked) { to = i; break; }
    }
    try {
      store.batch(dir > 0 ? "前面へ" : "背面へ", (dp) => {
        let trackId;
        if (to < 0) {
          const r = dp("track.add", { kind: audio ? "audio" : "overlay", index: dir > 0 ? tracks.length : 0 });
          trackId = r && (r.trackId || r.id);
        } else trackId = tracks[to].id;
        if (!trackId) return;
        for (const it of s) dp("clip.move", { clipId: it.clip.id, trackId, start: it.clip.start });
      });
      buzz(8, actsBar);
    } catch (e) { toast(String((e && e.message) || e), { kind: "error" }); }
  }

  /** 文脈ツールバーの 1 つを実行 */
  function doAction(id) {
    const s = sel();
    if (!s.length) {
      if (id === "add") { onAction("import"); return; }
      if (id === "addtext") { openPanel("library", "text"); return; }
      if (id === "record") { openPanel("library", "audio"); toast("「録音する」を押すと録れます", { kind: "info" }); return; }
      if (id === "ai") { onAction("ai"); return; }
      return;
    }
    const c = s[0].clip, ids = s.map((x) => x.clip.id);
    if (id === "split") {
      const t = snapFrame(playhead(), fps());
      if (!canSplitAt(c, t)) { toast("再生位置をクリップの中へ動かしてください", { kind: "warn" }); return; }
      run("clip.split", { clipId: c.id, t });
      buzz(12, actsBar);
      return;
    }
    if (id === "delete") {
      run("clip.remove", { clipIds: ids, linked: true });
      buzz(14, actsBar);
      toast("削除しました（取り消せます）", { kind: "info", ms: 4000, action: { label: "取消", onClick: () => store.undo() } });
      return;
    }
    if (id === "dup") { run("clip.duplicate", { clipIds: ids }); buzz(8, actsBar); return; }
    if (id === "reverse") { run("clip.reverse", { clipIds: ids }); buzz(8, actsBar); return; }
    if (id === "freeze") { run("clip.freeze", { clipId: c.id, t: snapFrame(playhead(), fps()), duration: 2 }); buzz(8, actsBar); return; }
    if (id === "detach") { run("clip.detachAudio", { clipId: c.id }); buzz(8, actsBar); return; }
    if (id === "front") { layerMove(1); return; }
    if (id === "back") { layerMove(-1); return; }
    if (id === "more") {
      /* 詳細は inspector のタブへ。出ないタブを指すと無反応になるので種類で選ぶ */
      openPanel("inspector", c.kind === "text" ? "text" : c.kind === "audio" ? "audio" : "transform");
      return;
    }
    const spec = clipSheet(id, s);
    if (spec) openSheet(spec);
    else toast("この操作はまだ用意できていません", { kind: "warn" });
  }

  /* ── 2.7 抽斗（左パネル・詳細を下から出す） ───────────────────── */

  function openPanel(which, tabId) {
    closeSheet();
    const p = part(which);
    if (!p) { toast("この機能をまだ読み込めていません", { kind: "warn" }); return; }
    try {
      if (which === "library" && typeof p.open === "function") p.open(tabId);
      if (which === "inspector" && typeof p.setTab === "function") p.setTab(tabId);
      if (typeof p.render === "function") p.render();
    } catch (e) { warn("mobile", "パネルを開けません", e && e.message); }
    panel = which;
    root.dataset.vqsMpanel = which;
    veil.hidden = false;
    drawer.hidden = false;
    const t = M_TABS.find((x) => x.go && x.go.tab === tabId);
    dTitle.textContent = which === "inspector" ? "詳細" : (t ? t.label : "素材");
    buzz(6, drawer);
  }
  function closePanel() {
    if (!panel) return;
    panel = "";
    root.removeAttribute("data-vqs-mpanel");
    root.style.removeProperty("--vqs-m-drawer-h");
    veil.hidden = true;
    drawer.hidden = true;
  }
  /* 掴み棒で抽斗の高さを変える（半分 ⇄ ほぼ全高） */
  {
    let y0 = 0, h0 = 0, on_ = false;
    on(dGrab, "pointerdown", (e) => {
      on_ = true; y0 = e.clientY;
      h0 = drawer.getBoundingClientRect().top;
      try { dGrab.setPointerCapture(e.pointerId); } catch (x) { /* noop */ }
    });
    on(dGrab, "pointermove", (e) => {
      if (!on_) return;
      const H = Math.max(1, globalThis.innerHeight || 1);
      const px = clamp(H - (h0 + (e.clientY - y0)), 160, H - 80);
      root.style.setProperty("--vqs-m-drawer-h", Math.round(px) + "px");
    });
    const up = () => {
      if (!on_) return;
      on_ = false;
      const H = Math.max(1, globalThis.innerHeight || 1);
      const cur = H - drawer.getBoundingClientRect().top;
      if (cur < 200) { closePanel(); buzz(10, drawer); return; }
      buzz(6, drawer);
    };
    on(dGrab, "pointerup", up);
    on(dGrab, "pointercancel", up);
  }

  /* ── 2.8 高さ配分・全画面・回転・キーボード ───────────────────── */

  function setLayout(mode) {
    const m = mode === "preview" || mode === "timeline" ? mode : "normal";
    root.dataset.vqsMlayout = m;
    buzz(6, expand);
    const p = part("preview");
    if (p && typeof p.render === "function") { try { p.render(); } catch (e) { /* noop */ } }
    const tl = part("tlView");
    if (tl && typeof tl.render === "function") { try { tl.render(); } catch (e) { /* noop */ } }
  }
  function toggleFs() {
    const wrap = els.previewWrap;
    if (!wrap) return;
    const doc = document;
    if (!fs) {
      fs = true;
      /* iPhone に requestFullscreen は無い（契約書 §13.4）→ 疑似全画面 */
      if (typeof wrap.requestFullscreen === "function") { try { wrap.requestFullscreen(); } catch (e) { /* 疑似へ */ } }
      root.classList.add("vqs-m-fs");
      if (transport && typeof transport.play === "function" && !transport.playing) { try { transport.play(); } catch (e) { /* noop */ } }
    } else {
      fs = false;
      if (doc.fullscreenElement && typeof doc.exitFullscreen === "function") { try { doc.exitFullscreen(); } catch (e) { /* noop */ } }
      root.classList.remove("vqs-m-fs");
    }
    buzz(8, wrap);
  }
  on(document, "fullscreenchange", () => {
    if (!document.fullscreenElement && fs) { fs = false; root.classList.remove("vqs-m-fs"); }
  });
  /* プレビューを叩いて高さを切り替える（選択の操作を邪魔しない） */
  if (els.previewWrap) {
    let sx = 0, sy = 0, selN = 0, ok = false;
    on(els.previewWrap, "pointerdown", (e) => {
      ok = isMobile() && e.isPrimary !== false;
      sx = e.clientX; sy = e.clientY;
      selN = ((store.selection || {}).clipIds || []).length;
    });
    on(els.previewWrap, "pointerup", (e) => {
      if (!ok) return;
      ok = false;
      if (Math.abs(e.clientX - sx) > TAP_SLOP || Math.abs(e.clientY - sy) > TAP_SLOP) return;
      /* 叩いた結果 選択が動いたなら、それはプレビュー側の操作なので触らない */
      setTimeout(() => {
        const now = ((store.selection || {}).clipIds || []).length;
        if (now !== selN) return;
        if (sheet || panel || fs) return;
        setLayout(nextLayout(root.dataset.vqsMlayout || "normal"));
      }, 0);
    });
  }
  /* 画面回転 */
  const mqL = globalThis.matchMedia ? globalThis.matchMedia("(orientation: landscape)") : null;
  function syncOrient() {
    root.dataset.vqsMorient = mqL && mqL.matches ? "landscape" : "portrait";
  }
  if (mqL) {
    const h = () => { syncOrient(); render(); };
    if (mqL.addEventListener) { mqL.addEventListener("change", h); offs.push(() => mqL.removeEventListener("change", h)); }
    else if (mqL.addListener) { mqL.addListener(h); offs.push(() => mqL.removeListener(h)); }
  }
  syncOrient();
  /* ソフトキーボード（visualViewport を見て詰める） */
  const vv = globalThis.visualViewport || null;
  function syncKb() {
    if (!vv) return;
    const px = keyboardInset({ innerHeight: globalThis.innerHeight || 0, height: vv.height, offsetTop: vv.offsetTop });
    root.style.setProperty("--vqs-m-kb", px + "px");
    root.classList.toggle("vqs-m-kb-open", px > KB_MIN);
    if (px > KB_MIN) {
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) {
        try { a.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* noop */ }
      }
    }
  }
  if (vv) {
    on(vv, "resize", syncKb);
    on(vv, "scroll", syncKb);
    syncKb();
  }
  /* WebKit のページピンチズームを止める（契約書 §13.4） */
  try { offs.push(guardGestures(app)); } catch (e) { /* noop */ }
  /* 端末の性質を見ておく（iOS では振動が無い＝視覚の合図が必須） */
  try { caps(); } catch (e) { /* noop */ }

  /* ── 2.9 組み立てと描き直し ───────────────────────────────────── */

  const tabBtns = new Map();
  function buildTabs() {
    bar.textContent = "";
    tabBtns.clear();
    for (const t of M_TABS) {
      const b = mk("button", "vqs-m-tab");
      b.type = "button";
      b.dataset.test = "m-tab-" + t.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", t.label);
      b.append(ico(t.icon, t.glyph, "vqs-m-tab__ico"), mk("span", "vqs-m-tab__label", t.label));
      /* 作り直す物の listener は offs に積まない（節点を捨てれば一緒に死ぬ）*/
      b.addEventListener("click", () => setTab(t.id));
      bar.append(b);
      tabBtns.set(t.id, b);
    }
  }
  function buildActs(items, hasSel) {
    actsBar.textContent = "";
    if (hasSel) {
      const back = mk("button", "vqs-m-act vqs-m-act--back");
      back.type = "button";
      back.dataset.test = "m-act-back";
      back.setAttribute("aria-label", "選択をやめる");
      back.append(ico("back", "◁", "vqs-m-act__ico"), mk("span", "vqs-m-act__label", "戻る"));
      back.addEventListener("click", () => { try { store.select([]); } catch (e) { /* noop */ } closeSheet(); });
      actsBar.append(back);
    }
    for (const a of items) {
      const b = mk("button", "vqs-m-act" + (a.danger ? " vqs-m-act--danger" : ""));
      b.type = "button";
      b.dataset.test = "m-act-" + a.id;
      b.setAttribute("aria-label", a.label);
      b.append(ico(a.icon, a.glyph, "vqs-m-act__ico"), mk("span", "vqs-m-act__label", a.label));
      b.addEventListener("click", () => doAction(a.id));
      actsBar.append(b);
    }
  }
  function renderActs() {
    const ids = ((store.selection || {}).clipIds || []);
    const s = ids.length ? sel() : [];
    const kind = s.length ? String(s[0].clip.kind || "") : "";
    const sig = s.length + "|" + kind + "|" + (s.length ? s[0].clip.id : "");
    if (sig !== actSig) {
      actSig = sig;
      buildActs(actionsFor(kind, s.length), s.length > 0);
      actsBar.scrollLeft = 0;
    }
    actsBar.dataset.empty = s.length ? "0" : "1";
    root.dataset.vqsMsel = s.length ? "1" : "0";
  }

  /** 下段タブを選ぶ（= その機能を出す） */
  function setTab(id) {
    const t = M_TABS.find((x) => x.id === id);
    if (!t) return;
    tab = id;
    for (const [k, b] of tabBtns) b.classList.toggle("vqs-m-tab--on", k === id);
    const cur = tabBtns.get(id);
    buzz(6, cur);
    /* 横スクロールする列なので、選んだ物を見える所へ寄せる */
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) { /* noop */ } }
    const go = t.go || {};
    if (go.kind === "lib") { openPanel("library", go.tab); return; }
    if (go.kind === "sheet") { closePanel(); openSheet(tabSheet(go.sheet)); return; }
    if (go.kind === "action") { closePanel(); closeSheet(); onAction(go.action); return; }
    /* 編集: 選択が在れば文脈ツールバーへ、無ければ素材を出す */
    closePanel();
    closeSheet();
    if (!((store.selection || {}).clipIds || []).length) openPanel("library", "media");
  }

  /** クリップの操作列を出す（タイムラインの長押しなどから呼べる） */
  function openClipActions(clipId) {
    if (clipId) {
      const f = findClip(store.project, clipId);
      if (f) { try { store.select([clipId]); } catch (e) { /* noop */ } }
    }
    closePanel();
    tab = "edit";
    for (const [k, b] of tabBtns) b.classList.toggle("vqs-m-tab--on", k === "edit");
    renderActs();
    actsBar.classList.remove("hidden");
    return { close: closeSheet };
  }

  function render() {
    if (dead) return;
    const m = isMobile();
    root.classList.toggle("vqs-m-on", m);
    if (!m) {
      /* 幅が戻ったら黙って引っ込む（app.js はこの殻を捨てない） */
      bar.classList.add("hidden");
      actsBar.classList.add("hidden");
      if (expand) expand.hidden = true;
      if (fsBtn) fsBtn.hidden = true;
      closeSheet();
      closePanel();
      root.classList.remove("vqs-m-fs");
      root.removeAttribute("data-vqs-mlayout");
      fs = false;
      return;
    }
    if (!tabBtns.size) buildTabs();
    if (!root.dataset.vqsMlayout) root.dataset.vqsMlayout = "normal";
    bar.classList.remove("hidden");
    actsBar.classList.remove("hidden");
    if (expand) expand.hidden = false;
    if (fsBtn) fsBtn.hidden = false;
    renderActs();
    for (const [k, b] of tabBtns) b.classList.toggle("vqs-m-tab--on", k === tab);
  }

  buildTabs();
  render();

  return {
    render,
    setTab,
    openClipActions,
    /** 開いている物（シート・抽斗・全画面）を閉じる */
    close() {
      closeSheet();
      closePanel();
      if (fs) toggleFs();
      return true;
    },
    dispose() {
      dead = true;
      closeSheet();
      closePanel();
      for (const f of offs) { try { f(); } catch (e) { /* noop */ } }
      offs.length = 0;
      for (const n of mine) { try { n.remove(); } catch (e) { /* noop */ } }
      mine.length = 0;
      tabBtns.clear();
      try { bar.textContent = ""; actsBar.textContent = ""; } catch (e) { /* noop */ }
      bar.classList.remove("vqs-m-tabs");
      actsBar.classList.remove("vqs-m-acts");
      actsBar.classList.add("hidden");
      root.classList.remove("vqs-m-on", "vqs-m-fs", "vqs-m-kb-open", "vqs-m-sheeting");
      for (const k of ["vqsMlayout", "vqsMorient", "vqsMsel", "vqsMpanel"]) delete root.dataset[k];
      root.style.removeProperty("--vqs-m-kb");
      root.style.removeProperty("--vqs-m-drawer-h");
      return true;
    }
  };
}
