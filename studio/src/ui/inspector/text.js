/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/text.js — 「文字」タブ（テロップの作り込み）

   ★ 何をする所か
     kind:"text" のクリップの `clip.text`（TextSpec = content / style / layout /
     anim）と、そのクリップの `opacity` / `transform`（位置・回転）を触る所。
     CapCut のテキスト編集に寄せて、
       ① 文字そのもの（textarea・IME 確定を待つ）
       ② 様式プリセット（1 タップ・見本つき）
       ③ 書体・寸法・太さ・斜体・行間・字間・揃え
       ④ 色 / グラデーション / 縁取り / 影 / 発光 / 背景 / 不透明度
       ⑤ アニメ（入り・出・ループ / 適用単位 / 速さ / その場で 1 回再生）
       ⑥ 位置（9 マス + 微調整）・回転
       ⑦ 字幕として扱う・この様式を全テロップへ・字幕の既定にする
       ⑧ 複数選択のときの一括編集（文字だけ / 様式だけ）
     を 1 枚に収める。

   ★ なぜこの形か
     ・値は **必ず ops 経由**（`clip.setText` / `clip.update` /
       `clip.setTransform`）。`clip.setText` は core/ops.js の branchSugar なので
       `{ patch: { style: { stroke: { width: 6 } } } }` の部分更新がそのまま
       深く混ざる（BRANCH に "text" と "text.style" が在る）。
     ・**書体・プリセット・アニメの名簿は engine/text.js が持つ**（契約書 §4）。
       まだ無いことがあるので **動的 import** で読み、来るまでは自前の控えで
       完全に動く。来たら見本と選択肢だけ差し替える（画面は白くならない）。
     ・textarea は **IME の確定を待つ**（compositionstart〜end の間は
       dispatch しない）。待たずに送ると変換途中の文字が履歴に積もる。
       逆に確定後・英数字入力は 1 文字ごとに反映する（CapCut と同じ体感）。
     ・panel は選択が変わらない限り作り直されない（inspector/index.js）。
       だから textarea は **触っている間だけ上書きしない**（caret が飛ぶ）。
     ・複数選択では共通値だけ出し、違えば「—」。書き込みは選択のうち
       **text クリップだけ**へ当てる（動画クリップに text 枝を生やさない）。

   ★ 触るときの注意
     ・キーを打てる path は契約書 §2 の一覧だけ。文字では
       `text.style.size` / `text.style.color` / `opacity` /
       `transform.x|y` / `transform.rotate` の 5 種（他の行に印は出さない）。
     ・`touch-action` は CSS 担当へ: `.vqs-txt__pad`（9 マス）は不要だが、
       `.vqs-txt__ta`（textarea）は `touch-action: manipulation` が欲しい。
     ・触り所は 44px 以上。プリセットの格子は 1 枚 96px 以上（指で押せる下限）。

   CONTRACT-NOTE 1（字幕として扱う）: 契約書 §1 の TextSpec に「この
     テロップを字幕（SRT）に含めるか」の置き場が無い。一方 §11.5 は
     「text クリップ or 字幕トラックから」書き出すと書いており、実物の
     `export/exporter.js#collectCues()` は **隠していない text クリップを全部**
     字幕にしている。依頼は per-clip の切替なので、ここでは
     `clip.text.subtitle`（真偽・**既定 true**）を使う形にした。既定を true に
     したのは、schema がこの枝を落とした場合でも「今の書き出しと同じ結果」に
     倒れるため（切った覚えのない字幕が消える事故を起こさない）。
     **申し送り**: 次の 2 行が入るまで、切った状態は保存し直すと戻る。
       core/schema.js  normTextSpec: `subtitle: bool(o.subtitle, true)`
       export/exporter.js collectCues: `if (c.text && c.text.subtitle === false) continue;`
   CONTRACT-NOTE 2（位置の単位）: `transform.x/y` は inspector/transform.js の
     約束（画面の幅・高さに対する割合。0 = 中央）に合わせた。9 マスの端は
     ±0.32 / ±0.34（画面の 1/3 弱）で、`layout.align` / `layout.vAlign` も
     一緒に合わせる（CapCut は 1 タップで寄せまで決まる）。
   CONTRACT-NOTE 3（このファイルの長さ）: 700 行の目安を超えている。分ける
     切れ目は ①名簿と純関数（下の §0〜§2）②画面（createTextPanel）だが、
     担当ファイルは 3 つだけと決まっているため 1 枚に置いた。§0〜§2 は DOM に
     触らないので Node で試験できる（studio/tests/inspector-detail.test.mjs）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el, sameValue } from "./index.js";
import { clamp, finite, isTouch } from "../../core/util.js";
import { defaultTextStyle, findClip } from "../../core/schema.js";

/* ── §0. 名簿の控え（engine/text.js が来るまで使う）──────────────── */

/** 書体（外部フォントは禁止なので端末に在る物だけ） */
export const FALLBACK_FONTS = Object.freeze([
  { id: "system", label: "標準", stack: "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif" },
  { id: "sans", label: "ゴシック", stack: "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif" },
  { id: "serif", label: "明朝", stack: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif" },
  { id: "rounded", label: "丸ゴシック", stack: "'Hiragino Maru Gothic ProN', 'M PLUS Rounded 1c', sans-serif" },
  { id: "mono", label: "等幅", stack: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  { id: "heavy", label: "極太", stack: "'Arial Black', 'Hiragino Sans', 'Noto Sans JP', sans-serif" }
]);

/** 様式プリセット（style は TextStyle の部分・layout は任意） */
export const FALLBACK_PRESETS = Object.freeze([
  { id: "plain", label: "標準", style: { size: 64, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 3, blur: 10, color: "#000000aa" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: null } },
  { id: "outline", label: "白フチ", style: { size: 64, weight: 800, color: "#ffffff", stroke: { width: 6, color: "#000000" }, shadow: { x: 0, y: 0, blur: 0, color: "#00000000" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: null } },
  { id: "band", label: "黒帯", style: { size: 52, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 0, blur: 0, color: "#00000000" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: { color: "#000000cc", pad: 18, radius: 10 } } },
  { id: "pop", label: "ポップ", style: { size: 72, weight: 900, color: "#fff45a", stroke: { width: 8, color: "#2a1a00" }, shadow: { x: 0, y: 6, blur: 0, color: "#2a1a00" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: null } },
  { id: "news", label: "ニュース", style: { size: 46, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 2, blur: 6, color: "#000000cc" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: { color: "#0b2f6bdd", pad: 14, radius: 4 } } },
  { id: "neon", label: "ネオン", style: { size: 66, weight: 800, color: "#8ef6ff", stroke: { width: 2, color: "#053a4a" }, shadow: { x: 0, y: 0, blur: 0, color: "#00000000" }, glow: { blur: 26, color: "#22d3ee" }, gradient: null, bg: null } },
  { id: "gold", label: "金", style: { size: 68, weight: 900, color: "#ffe9a8", stroke: { width: 4, color: "#5a3c00" }, shadow: { x: 0, y: 4, blur: 8, color: "#00000088" }, glow: { blur: 0, color: "#ffffff" }, gradient: { from: "#fff3c4", to: "#c98a17", angle: 90 }, bg: null } },
  { id: "quiet", label: "細字", style: { size: 44, weight: 400, color: "#f2f5f8", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 1, blur: 4, color: "#00000099" }, glow: { blur: 0, color: "#ffffff" }, gradient: null, bg: null } }
]);

/** アニメの控え（engine/text.js の TEXT_ANIMS が来たら差し替わる） */
export const FALLBACK_ANIMS = Object.freeze({
  in: [
    { id: "none", label: "なし" }, { id: "fade", label: "ふわっと" }, { id: "fadeUp", label: "下から" },
    { id: "fadeDown", label: "上から" }, { id: "slideL", label: "左から" }, { id: "slideR", label: "右から" },
    { id: "popIn", label: "ぽん" }, { id: "zoomIn", label: "寄る" }, { id: "typewriter", label: "打ち込み" },
    { id: "blurIn", label: "ぼけから" }
  ],
  out: [
    { id: "none", label: "なし" }, { id: "fade", label: "ふわっと" }, { id: "fadeDown", label: "下へ" },
    { id: "fadeUp", label: "上へ" }, { id: "slideL", label: "左へ" }, { id: "slideR", label: "右へ" },
    { id: "popOut", label: "ぽん" }, { id: "zoomOut", label: "引く" }
  ],
  loop: [
    { id: "none", label: "なし" }, { id: "pulse", label: "脈打つ" }, { id: "wave", label: "波" },
    { id: "shake", label: "揺れる" }, { id: "float", label: "浮く" }, { id: "rainbow", label: "虹" }
  ]
});

/** 適用単位（契約書 §1 TextSpec.anim.unit） */
export const ANIM_UNITS = Object.freeze([
  { value: "all", label: "全体" }, { value: "line", label: "行" },
  { value: "word", label: "単語" }, { value: "char", label: "文字" }
]);

/** 9 マスの寄せ（CONTRACT-NOTE 2 の単位） */
export const TEXT_CELLS = Object.freeze([
  { x: -0.32, y: -0.34, align: "left", vAlign: "top", label: "左上" },
  { x: 0, y: -0.34, align: "center", vAlign: "top", label: "上" },
  { x: 0.32, y: -0.34, align: "right", vAlign: "top", label: "右上" },
  { x: -0.32, y: 0, align: "left", vAlign: "middle", label: "左" },
  { x: 0, y: 0, align: "center", vAlign: "middle", label: "中央" },
  { x: 0.32, y: 0, align: "right", vAlign: "middle", label: "右" },
  { x: -0.32, y: 0.34, align: "left", vAlign: "bottom", label: "左下" },
  { x: 0, y: 0.34, align: "center", vAlign: "bottom", label: "下" },
  { x: 0.32, y: 0.34, align: "right", vAlign: "bottom", label: "右下" }
]);

/* ── §1. 名簿を整える（純関数・どんな形で来ても受ける）──────────── */

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
/** 名簿は配列でも { id: def } の表でも来る。配列へ均す */
function toList(raw) {
  if (Array.isArray(raw)) return raw.map((v, i) => (isObj(v) ? v : { id: str(v) || String(i), label: str(v) }));
  if (isObj(raw)) {
    return Object.keys(raw).map((k) => {
      const v = raw[k];
      return isObj(v) ? Object.assign({ id: k }, v) : { id: k, label: str(v) || k, stack: str(v) };
    });
  }
  return [];
}
const idOf = (o) => str(o.id) || str(o.value) || str(o.type) || str(o.name) || str(o.key);
const labelOf = (o) => str(o.label) || str(o.name) || str(o.title) || idOf(o);

/**
 * 書体の名簿（engine/text.js の FONT_STACKS）を `[{id,label,stack}]` へ。
 * @param {*} raw @returns {{id:string,label:string,stack:string}[]}
 */
export function normalizeFonts(raw) {
  const out = [];
  for (const o of toList(raw)) {
    const id = idOf(o);
    if (!id) continue;
    const stack = str(o.stack) || str(o.family) || str(o.css) || str(o.value) || "";
    out.push({ id, label: labelOf(o), stack: stack || "inherit" });
  }
  return out.length ? out : FALLBACK_FONTS.map((f) => Object.assign({}, f));
}

/**
 * 様式プリセット（TEXT_PRESETS）を `[{id,label,style,layout,anim}]` へ。
 * @param {*} raw @returns {Object[]}
 */
export function normalizePresets(raw) {
  const out = [];
  for (const o of toList(raw)) {
    const id = idOf(o);
    if (!id) continue;
    const style = isObj(o.style) ? o.style : (isObj(o.textStyle) ? o.textStyle : null);
    if (!style) continue;
    out.push({
      id, label: labelOf(o),
      style, layout: isObj(o.layout) ? o.layout : null, anim: isObj(o.anim) ? o.anim : null
    });
  }
  return out.length ? out : FALLBACK_PRESETS.map((p) => Object.assign({}, p));
}

/**
 * アニメの名簿（TEXT_ANIMS）を `{in:[],out:[],loop:[]}` へ。
 * `{in:[..]}` でも `[{id,kind:"in"}]` でも受ける。
 * @param {*} raw @returns {{in:Object[],out:Object[],loop:Object[]}}
 */
export function normalizeAnims(raw) {
  const pack = { in: [], out: [], loop: [] };
  const push = (slot, o) => {
    const id = idOf(o);
    if (!id) return;
    if (pack[slot].some((x) => x.id === id)) return;
    pack[slot].push({ id, label: labelOf(o) });
  };
  if (isObj(raw) && (Array.isArray(raw.in) || Array.isArray(raw.out) || Array.isArray(raw.loop) || isObj(raw.in))) {
    for (const slot of ["in", "out", "loop"]) for (const o of toList(raw[slot])) push(slot, o);
  } else {
    for (const o of toList(raw)) {
      const kinds = Array.isArray(o.kinds) ? o.kinds : [str(o.kind) || str(o.slot) || "in"];
      for (const k of kinds) if (pack[k]) push(k, o);
    }
  }
  for (const slot of ["in", "out", "loop"]) {
    if (!pack[slot].length) pack[slot] = FALLBACK_ANIMS[slot].map((a) => Object.assign({}, a));
    else if (!pack[slot].some((a) => a.id === "none")) pack[slot].unshift({ id: "none", label: "なし" });
  }
  return pack;
}

/* ── §2. 見た目の見本（純関数に近い・DOM の style を組むだけ）────── */

/** 16 進（#rgb/#rrggbb/#rrggbbaa）を CSS の色へ。読めなければ既定 */
export function cssColor(v, fallback) {
  const s = str(v).trim();
  return /^#([0-9a-fA-F]{3,8})$/.test(s) ? s : (fallback || "#ffffff");
}

/**
 * TextStyle を「見本用の CSS」へ。size は px ではなく **見本の中の比率**で
 * 使う（プロジェクトの 1080p 基準の size をそのまま px にすると巨大になる）。
 * @param {Object} style @param {number} px 見本の文字の大きさ（px）
 * @returns {Object} style 属性に流し込める平たい object
 */
export function sampleCss(style, px) {
  const s = style || {};
  const st = s.stroke || {};
  const sh = s.shadow || {};
  const gl = s.glow || {};
  const size = Math.max(9, finite(px, 20));
  const k = size / Math.max(1, finite(s.size, 64));      // 見本の縮尺
  const shadows = [];
  if (finite(sh.blur, 0) > 0 || finite(sh.x, 0) || finite(sh.y, 0)) {
    shadows.push(`${(finite(sh.x, 0) * k).toFixed(2)}px ${(finite(sh.y, 0) * k).toFixed(2)}px ${(finite(sh.blur, 0) * k).toFixed(2)}px ${cssColor(sh.color, "#000000aa")}`);
  }
  if (finite(gl.blur, 0) > 0) {
    const g = cssColor(gl.color, "#ffffff");
    shadows.push(`0 0 ${(finite(gl.blur, 0) * k * 0.6).toFixed(2)}px ${g}`);
    shadows.push(`0 0 ${(finite(gl.blur, 0) * k).toFixed(2)}px ${g}`);
  }
  const out = {
    fontSize: size.toFixed(1) + "px",
    fontWeight: String(clamp(finite(s.weight, 700), 100, 1000)),
    fontStyle: s.italic ? "italic" : "normal",
    color: cssColor(s.color, "#ffffff"),
    textShadow: shadows.length ? shadows.join(", ") : "none",
    lineHeight: "1.2",
    padding: "0",
    background: "transparent",
    borderRadius: "0",
    webkitTextStrokeWidth: Math.max(0, finite(st.width, 0) * k).toFixed(2) + "px",
    webkitTextStrokeColor: cssColor(st.color, "#000000"),
    paintOrder: "stroke fill"
  };
  if (s.gradient) {
    out.backgroundImage = `linear-gradient(${finite(s.gradient.angle, 0)}deg, ${cssColor(s.gradient.from, "#ffffff")}, ${cssColor(s.gradient.to, "#000000")})`;
    out.webkitBackgroundClip = "text";
    out.backgroundClip = "text";
    out.color = "transparent";
    out.webkitTextFillColor = "transparent";
  }
  if (s.bg) {
    out.background = cssColor(s.bg.color, "#000000aa");
    out.padding = Math.max(0, finite(s.bg.pad, 16) * k).toFixed(1) + "px " + Math.max(0, finite(s.bg.pad, 16) * k * 1.3).toFixed(1) + "px";
    out.borderRadius = Math.max(0, finite(s.bg.radius, 12) * k).toFixed(1) + "px";
  }
  return out;
}

/** sampleCss の結果を node へ流す（見本と live プレビューで共用） */
export function paintSample(node, style, px, fontStack) {
  if (!node || !node.style) return node;
  const css = sampleCss(style, px);
  for (const k of Object.keys(css)) {
    try { node.style[k] = css[k]; } catch (e) { /* 対応していない property は捨てる */ }
  }
  if (fontStack) node.style.fontFamily = fontStack;
  return node;
}

/* ── §3. 画面本体 ───────────────────────────────────────────────── */

/**
 * 「文字」タブ。
 * @param {{store:Object, widgets?:Object, clipIds:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createTextPanel(o) {
  const store = o.store;
  const widgets = o.widgets || null;
  const transport = o.transport || null;
  /**
   * この panel は **text クリップだけ**を相手にする（kit にも text の id しか
   * 入れない）。混ぜたままにすると、キーフレーム印が動画クリップへ
   * `text.style.size` のキーを打ってしまう（op は通るが意味が無い）。
   * @param {string[]} ids @returns {string[]}
   */
  const textOnly = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => {
    const f = findClip(store.project, id);
    return !!(f && f.clip && f.clip.kind === "text");
  });
  const kit = createFieldKit({ store, widgets, clipIds: textOnly(o.clipIds), transport });
  const root = el("div", "vqs-txt");
  let dead = false;
  let stopTimer = 0;

  /** 名簿（控えで始めて、engine/text.js が来たら差し替える） */
  const book = {
    fonts: normalizeFonts(null),
    presets: normalizePresets(null),
    anims: normalizeAnims(null),
    fromEngine: false
  };

  /* ── 読み書きの口（text クリップだけを相手にする）──────────────── */

  /** 選択中の text クリップ（kit には text しか入れていないが念のため濾す） */
  const textClips = () => kit.clips().filter((c) => c && c.kind === "text");
  /** 共通値を読む（違えば mixed。get は TextSpec を受ける） */
  function readT(get) {
    const list = textClips();
    if (!list.length) return { value: undefined, mixed: false, count: 0 };
    let v;
    let mixed = false;
    for (let i = 0; i < list.length; i++) {
      let cur;
      try { cur = get(list[i].text || {}, list[i]); } catch (e) { cur = undefined; }
      if (i === 0) v = cur;
      else if (!sameValue(v, cur)) { mixed = true; break; }
    }
    return { value: v, mixed, count: list.length };
  }
  /** clip.text へ部分更新（1 操作 1 undo） */
  function setT(patch, label) {
    const ids = textClips().map((c) => c.id);
    if (!ids.length) return null;
    return kit.patch("clip.setText", { clipIds: ids, patch }, { label: label || "文字", coalesce: true });
  }
  const setStyle = (patch, label) => setT({ style: patch }, label || "文字の様式");
  const setLayout = (patch, label) => setT({ layout: patch }, label || "文字の配置");
  const setAnim = (patch, label) => setT({ anim: patch }, label || "文字のアニメ");
  /** clip 自体（不透明度など）。text クリップだけへ */
  function setClip(patch, label) {
    const ids = textClips().map((c) => c.id);
    if (!ids.length) return null;
    return kit.patch("clip.update", { clipIds: ids, patch }, { label: label || "変更", coalesce: true });
  }
  /** transform（位置・回転）。text クリップだけへ */
  function setTf(patch, label) {
    const ids = textClips().map((c) => c.id);
    if (!ids.length) return null;
    return kit.patch("clip.setTransform", { clipIds: ids, patch }, { label: label || "位置", coalesce: true });
  }
  /** 先頭の text クリップの style（見本用） */
  function style0() {
    const c = textClips()[0];
    return Object.assign(defaultTextStyle(), (c && c.text && c.text.style) || null);
  }
  const fontStack = (id) => {
    const f = book.fonts.find((x) => x.id === String(id));
    return f ? f.stack : "inherit";
  };

  /* ── 3.1 文字そのもの ─────────────────────────────────────────── */
  const secBody = kit.section({ title: "文字", id: "txtbody" });
  const ta = el("textarea", "vqs-txt__ta");
  ta.setAttribute("data-test", "insp-txt-content");
  ta.setAttribute("aria-label", "テロップの文字");
  ta.rows = 3;
  ta.spellcheck = false;
  ta.placeholder = "ここに文字を入れます";
  ta.style.width = "100%";
  ta.style.minHeight = isTouch() ? "88px" : "72px";
  ta.style.resize = "vertical";
  const taDrv = kit.driver({ label: "文字", apply: (v) => setT({ content: String(v) }, "文字") });
  let composing = false;
  const sendText = () => { if (!composing) taDrv.input(ta.value); };
  ta.addEventListener("input", sendText);
  ta.addEventListener("compositionstart", () => { composing = true; });
  ta.addEventListener("compositionend", () => { composing = false; sendText(); taDrv.end(); });
  ta.addEventListener("blur", () => { composing = false; sendText(); taDrv.end(); });
  kit.addField({
    el: ta,
    set(v, mixed) {
      /* 触っている間・変換中は上から書き換えない（caret が飛ぶ） */
      if (composing || document.activeElement === ta) return;
      ta.value = mixed ? "" : String(v === undefined || v === null ? "" : v);
      ta.placeholder = mixed ? "（それぞれ違う文字）" : "ここに文字を入れます";
    },
    refresh() { const r = readT((t) => (typeof t.content === "string" ? t.content : "")); this.set(r.value, r.mixed); }
  });
  secBody.body.append(ta);

  /* 生きた見本（今の様式で 1 行だけ描く） */
  const live = el("div", "vqs-txt__live");
  live.setAttribute("data-test", "insp-txt-live");
  const liveInk = el("span", "vqs-txt__liveink", "見本");
  live.append(liveInk);
  secBody.body.append(live);
  secBody.add(kit.note("入力するとプレビューにそのまま出ます。日本語変換は確定してから反映します。"));
  root.append(secBody.el);

  /* ── 3.2 様式プリセット ──────────────────────────────────────── */
  const secPreset = kit.section({ title: "様式（1 タップ）", id: "txtpreset" });
  const presetGrid = el("div", "vqs-txt__presets");
  presetGrid.setAttribute("data-test", "insp-txt-presets");
  presetGrid.style.display = "grid";
  presetGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(96px, 1fr))";
  presetGrid.style.gap = "8px";
  secPreset.body.append(presetGrid);
  root.append(secPreset.el);

  function buildPresets() {
    presetGrid.textContent = "";
    for (const p of book.presets) {
      const b = el("button", "vqs-txt__preset");
      b.type = "button";
      b.title = p.label;
      b.setAttribute("data-preset", p.id);
      b.setAttribute("aria-label", p.label + " の様式にする");
      b.style.minHeight = "56px";
      const ink = el("span", "vqs-txt__presetink", "見本");
      paintSample(ink, Object.assign(defaultTextStyle(), p.style), 20, fontStack((p.style && p.style.font) || "system"));
      const cap = el("span", "vqs-txt__presetcap", p.label);
      b.append(ink, cap);
      b.addEventListener("click", () => applyPreset(p));
      presetGrid.append(b);
    }
  }
  function applyPreset(p) {
    const patch = { style: Object.assign({}, p.style) };
    if (p.layout) patch.layout = Object.assign({}, p.layout);
    if (p.anim) patch.anim = Object.assign({}, p.anim);
    setT(patch, "様式：" + p.label);
    kit.update();
    renderLive();
  }

  /* ── 3.3 書体と寸法 ─────────────────────────────────────────── */
  const secFont = kit.section({ title: "書体と寸法", id: "txtfont" });
  const fontField = kit.sel({
    label: "書体",
    items: book.fonts.map((f) => ({ value: f.id, label: f.label })),
    get: () => readT((t) => String((t.style && t.style.font) || "system")),
    onChange: (v) => { setStyle({ font: String(v) }, "書体"); renderLive(); }
  });
  secFont.add(kit.row({ label: "書体", field: fontField }));
  secFont.add(kit.row({
    label: "大きさ", path: "text.style.size",
    field: kit.sld({
      label: "大きさ", unit: "px", min: 8, max: 400, step: 1, digits: 0, center: 64,
      get: () => readT((t) => clamp(finite(t.style && t.style.size, 64), 1, 4000)),
      onInput: (v) => { setStyle({ size: clamp(v, 1, 4000) }, "文字の大きさ"); renderLive(); }
    }),
    onReset: () => setStyle({ size: 64 }, "大きさを戻す")
  }));
  const weightField = kit.seg({
    items: [{ value: 400, label: "細" }, { value: 700, label: "太" }, { value: 900, label: "極太" }],
    get: () => readT((t) => clamp(finite(t.style && t.style.weight, 700), 100, 1000)),
    onChange: (v) => { setStyle({ weight: clamp(finite(v, 700), 100, 1000) }, "太さ"); renderLive(); }
  });
  const italicField = kit.tog({
    label: "斜体",
    get: () => readT((t) => !!(t.style && t.style.italic)),
    onChange: (v) => { setStyle({ italic: !!v }, "斜体"); renderLive(); }
  });
  secFont.add(kit.row({ label: "太さ", node: kit.btnRow([weightField.el, italicField.el], "vqs-txt__weights") }));
  secFont.add(kit.row({
    label: "行間",
    field: kit.sld({
      label: "行間", min: 50, max: 400, step: 1, digits: 0, unit: "%", scale: 100, center: 125,
      get: () => readT((t) => clamp(finite(t.layout && t.layout.lineHeight, 1.25), 0.5, 4)),
      onInput: (v) => { setLayout({ lineHeight: clamp(v, 0.5, 4) }, "行間"); renderLive(); }
    }),
    onReset: () => setLayout({ lineHeight: 1.25 }, "行間を戻す")
  }));
  secFont.add(kit.row({
    label: "字間",
    field: kit.sld({
      label: "字間", min: -20, max: 100, step: 1, digits: 0, unit: "%", scale: 100, center: 0,
      get: () => readT((t) => clamp(finite(t.layout && t.layout.letterSpacing, 0), -0.5, 2)),
      onInput: (v) => { setLayout({ letterSpacing: clamp(v, -0.5, 2) }, "字間"); renderLive(); }
    }),
    onReset: () => setLayout({ letterSpacing: 0 }, "字間を戻す")
  }));
  secFont.add(kit.row({
    label: "横の揃え",
    field: kit.seg({
      items: [{ value: "left", label: "左" }, { value: "center", label: "中央" }, { value: "right", label: "右" }],
      get: () => readT((t) => String((t.layout && t.layout.align) || "center")),
      onChange: (v) => setLayout({ align: String(v) }, "横の揃え")
    })
  }));
  secFont.add(kit.row({
    label: "縦の揃え",
    field: kit.seg({
      items: [{ value: "top", label: "上" }, { value: "middle", label: "中央" }, { value: "bottom", label: "下" }],
      get: () => readT((t) => String((t.layout && t.layout.vAlign) || "middle")),
      onChange: (v) => setLayout({ vAlign: String(v) }, "縦の揃え")
    })
  }));
  secFont.add(kit.row({
    label: "折り返す幅",
    field: kit.sld({
      label: "折り返す幅", min: 20, max: 100, step: 1, digits: 0, unit: "%", scale: 100, center: 80,
      get: () => readT((t) => clamp(finite(t.layout && t.layout.maxWidth, 0.8), 0.05, 1)),
      onInput: (v) => setLayout({ maxWidth: clamp(v, 0.05, 1) }, "折り返す幅")
    }),
    onReset: () => setLayout({ maxWidth: 0.8 }, "折り返す幅を戻す")
  }));
  root.append(secFont.el);

  /* ── 3.4 色・縁取り・影・発光・背景 ────────────────────────── */
  const secInk = kit.section({ title: "色と装飾", id: "txtink" });
  secInk.add(kit.row({
    label: "文字の色", path: "text.style.color",
    field: kit.col({
      label: "文字の色",
      get: () => readT((t) => cssColor(t.style && t.style.color, "#ffffff")),
      onInput: (v) => { setStyle({ color: String(v) }, "文字の色"); renderLive(); }
    })
  }));
  /* グラデーション（null で無し） */
  const gradOn = kit.tog({
    label: "グラデーション",
    get: () => readT((t) => !!(t.style && t.style.gradient)),
    onChange: (v) => {
      setStyle({ gradient: v ? { from: "#ffffff", to: "#4f8cff", angle: 90 } : null }, "グラデーション");
      kit.update();
      renderLive();
      syncShown();
    }
  });
  secInk.add(kit.row({ label: "グラデーション", node: gradOn.el }));
  const gradBox = el("div", "vqs-txt__sub");
  gradBox.append(
    kit.row({ label: "始まりの色", field: kit.col({ label: "始まりの色", get: () => readT((t) => cssColor(t.style && t.style.gradient && t.style.gradient.from, "#ffffff")), onInput: (v) => { setStyle({ gradient: { from: String(v) } }, "グラデーション"); renderLive(); } }) }),
    kit.row({ label: "終わりの色", field: kit.col({ label: "終わりの色", get: () => readT((t) => cssColor(t.style && t.style.gradient && t.style.gradient.to, "#4f8cff")), onInput: (v) => { setStyle({ gradient: { to: String(v) } }, "グラデーション"); renderLive(); } }) }),
    kit.row({ label: "向き", field: kit.sld({ label: "向き", min: 0, max: 360, step: 1, digits: 0, unit: "°", center: 90, get: () => readT((t) => finite(t.style && t.style.gradient && t.style.gradient.angle, 90)), onInput: (v) => { setStyle({ gradient: { angle: finite(v, 90) } }, "グラデーション"); renderLive(); } }) })
  );
  secInk.body.append(gradBox);
  /* 縁取り */
  secInk.add(kit.row({
    label: "縁取りの太さ",
    field: kit.sld({
      label: "縁取りの太さ", min: 0, max: 40, step: 0.5, digits: 1, unit: "px", center: 0,
      get: () => readT((t) => Math.max(0, finite(t.style && t.style.stroke && t.style.stroke.width, 0))),
      onInput: (v) => { setStyle({ stroke: { width: Math.max(0, v) } }, "縁取り"); renderLive(); }
    }),
    onReset: () => setStyle({ stroke: { width: 0 } }, "縁取りを消す")
  }));
  secInk.add(kit.row({
    label: "縁取りの色",
    field: kit.col({
      label: "縁取りの色",
      get: () => readT((t) => cssColor(t.style && t.style.stroke && t.style.stroke.color, "#000000")),
      onInput: (v) => { setStyle({ stroke: { color: String(v) } }, "縁取りの色"); renderLive(); }
    })
  }));
  /* 影 */
  const shadowRow = (key, label, min, max, unit) => kit.row({
    label,
    field: kit.sld({
      label, min, max, step: 0.5, digits: 1, unit: unit || "px", center: 0,
      get: () => readT((t) => finite(t.style && t.style.shadow && t.style.shadow[key], key === "y" ? 4 : 0)),
      onInput: (v) => { setStyle({ shadow: { [key]: finite(v, 0) } }, "影"); renderLive(); }
    }),
    onReset: () => setStyle({ shadow: { [key]: 0 } }, "影を戻す")
  });
  secInk.add(shadowRow("x", "影 横", -60, 60), shadowRow("y", "影 縦", -60, 60), shadowRow("blur", "影 ぼかし", 0, 120));
  secInk.add(kit.row({
    label: "影の色",
    field: kit.col({
      label: "影の色",
      get: () => readT((t) => cssColor(t.style && t.style.shadow && t.style.shadow.color, "#000000")),
      onInput: (v) => { setStyle({ shadow: { color: String(v) } }, "影の色"); renderLive(); }
    })
  }));
  /* 発光 */
  secInk.add(kit.row({
    label: "発光",
    field: kit.sld({
      label: "発光", min: 0, max: 100, step: 1, digits: 0, unit: "px", center: 0,
      get: () => readT((t) => Math.max(0, finite(t.style && t.style.glow && t.style.glow.blur, 0))),
      onInput: (v) => { setStyle({ glow: { blur: Math.max(0, v) } }, "発光"); renderLive(); }
    }),
    onReset: () => setStyle({ glow: { blur: 0 } }, "発光を消す")
  }));
  secInk.add(kit.row({
    label: "発光の色",
    field: kit.col({
      label: "発光の色",
      get: () => readT((t) => cssColor(t.style && t.style.glow && t.style.glow.color, "#ffffff")),
      onInput: (v) => { setStyle({ glow: { color: String(v) } }, "発光の色"); renderLive(); }
    })
  }));
  /* 背景（帯） */
  const bgOn = kit.tog({
    label: "背景の帯",
    get: () => readT((t) => !!(t.style && t.style.bg)),
    onChange: (v) => {
      setStyle({ bg: v ? { color: "#000000cc", pad: 16, radius: 12 } : null }, "背景の帯");
      kit.update();
      renderLive();
      syncShown();
    }
  });
  secInk.add(kit.row({ label: "背景の帯", node: bgOn.el }));
  const bgBox = el("div", "vqs-txt__sub");
  bgBox.append(
    kit.row({ label: "帯の色", field: kit.col({ label: "帯の色", get: () => readT((t) => cssColor(t.style && t.style.bg && t.style.bg.color, "#000000")), onInput: (v) => { setStyle({ bg: { color: String(v) } }, "帯の色"); renderLive(); } }) }),
    kit.row({ label: "余白", field: kit.sld({ label: "余白", min: 0, max: 80, step: 1, digits: 0, unit: "px", center: 16, get: () => readT((t) => Math.max(0, finite(t.style && t.style.bg && t.style.bg.pad, 16))), onInput: (v) => { setStyle({ bg: { pad: Math.max(0, v) } }, "帯の余白"); renderLive(); } }) }),
    kit.row({ label: "角丸", field: kit.sld({ label: "角丸", min: 0, max: 80, step: 1, digits: 0, unit: "px", center: 12, get: () => readT((t) => Math.max(0, finite(t.style && t.style.bg && t.style.bg.radius, 12))), onInput: (v) => { setStyle({ bg: { radius: Math.max(0, v) } }, "帯の角丸"); renderLive(); } }) })
  );
  secInk.body.append(bgBox);
  /* 不透明度（clip 側・キーを打てる） */
  secInk.add(kit.row({
    label: "不透明度", path: "opacity",
    field: kit.sld({
      label: "不透明度", min: 0, max: 100, step: 1, digits: 0, unit: "%", scale: 100, center: 100,
      get: () => readT((t, c) => clamp(finite(c.opacity, 1), 0, 1)),
      onInput: (v) => setClip({ opacity: clamp(v, 0, 1) }, "不透明度")
    }),
    onReset: () => setClip({ opacity: 1 }, "不透明度を戻す")
  }));
  root.append(secInk.el);

  /* ── 3.5 アニメ ───────────────────────────────────────────── */
  const secAnim = kit.section({ title: "アニメ", id: "txtanim" });
  /** 入り / 出 / ループ の 1 組を作る */
  function animBlock(slot, label, hasDuration) {
    const selField = kit.sel({
      label,
      items: book.anims[slot].map((a) => ({ value: a.id, label: a.label })),
      get: () => readT((t) => String((t.anim && t.anim[slot] && t.anim[slot].type) || "none")),
      onChange: (v) => { setAnim({ [slot]: { type: String(v) } }, label); playAnim(slot); }
    });
    const play = kit.btn("試す", () => playAnim(slot), { cls: "vqs-btn--ghost", title: "この場で 1 回だけ再生します", test: "insp-txt-play-" + slot });
    const row = kit.row({ label, node: kit.btnRow([selField.el, play], "vqs-txt__animrow") });
    secAnim.body.append(row);
    if (hasDuration) {
      secAnim.add(kit.row({
        label: label + "の長さ",
        field: kit.sld({
          label: label + "の長さ", min: 0, max: 5, step: 0.05, digits: 2, unit: "秒", center: 0.4,
          get: () => readT((t) => clamp(finite(t.anim && t.anim[slot] && t.anim[slot].duration, 0.4), 0, 10)),
          onInput: (v) => setAnim({ [slot]: { duration: clamp(v, 0, 10) } }, label + "の長さ")
        })
      }));
    }
    return { selField, row };
  }
  const animIn = animBlock("in", "入り", true);
  const animOut = animBlock("out", "出", true);
  const animLoop = animBlock("loop", "ループ", false);
  secAnim.add(kit.row({
    label: "ループの速さ",
    field: kit.sld({
      label: "ループの速さ", min: 0.1, max: 4, step: 0.05, digits: 2, unit: "×", center: 1,
      get: () => readT((t) => clamp(finite(t.anim && t.anim.loop && t.anim.loop.speed, 1), 0.05, 10)),
      onInput: (v) => setAnim({ loop: { speed: clamp(v, 0.05, 10) } }, "ループの速さ")
    })
  }));
  secAnim.add(kit.row({
    label: "適用単位",
    field: kit.seg({
      items: ANIM_UNITS.slice(),
      get: () => readT((t) => String((t.anim && t.anim.unit) || "all")),
      onChange: (v) => { setAnim({ unit: String(v) }, "適用単位"); playAnim("in"); }
    }),
    hint: "「文字」にすると 1 文字ずつ順に動きます（打ち込みや波に向きます）。"
  }));
  root.append(secAnim.el);

  /** その場で 1 回再生する（transport が無ければ位置だけ合わせる） */
  function playAnim(slot) {
    const c = textClips()[0];
    if (!c) return;
    const t = c.text || {};
    const a = (t.anim && t.anim[slot]) || {};
    const dur = clamp(finite(a.duration, slot === "loop" ? 1.2 : 0.4), 0.05, 10);
    const start = finite(c.start, 0);
    const len = Math.max(0.04, finite(c.duration, 0));
    const at = slot === "out" ? Math.max(start, start + len - dur - 0.05) : start;
    if (transport && typeof transport.seek === "function") {
      try { transport.seek(at); } catch (e) { /* 下の play だけ試す */ }
      if (typeof transport.play === "function") {
        try { transport.play(); } catch (e) { return; }
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
          stopTimer = 0;
          if (dead) return;
          try { if (typeof transport.pause === "function") transport.pause(); } catch (e) { /* noop */ }
        }, Math.max(350, (dur + 0.35) * 1000));
        return;
      }
    }
    store.setView({ playhead: at });
  }

  /* ── 3.6 位置と回転 ───────────────────────────────────────── */
  const secPos = kit.section({ title: "位置", id: "txtpos" });
  const pad = el("div", "vqs-txt__pad");
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "文字の位置");
  pad.setAttribute("data-test", "insp-txt-pad");
  pad.style.display = "grid";
  pad.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  pad.style.gap = "4px";
  pad.style.maxWidth = isTouch() ? "168px" : "132px";
  const padCells = [];
  for (const cell of TEXT_CELLS) {
    const b = el("button", "vqs-txt__padcell");
    b.type = "button";
    b.title = cell.label;
    b.setAttribute("aria-label", cell.label + "へ寄せる");
    b.setAttribute("data-cell", cell.align + "-" + cell.vAlign);
    b.style.minWidth = isTouch() ? "44px" : "36px";
    b.style.minHeight = isTouch() ? "44px" : "36px";
    b.append(el("span", "vqs-txt__paddot"));
    b.addEventListener("click", () => {
      kit.patch("clip.setTransform", { clipIds: textClips().map((c) => c.id), patch: { x: cell.x, y: cell.y } }, { label: "位置：" + cell.label });
      setLayout({ align: cell.align, vAlign: cell.vAlign }, "位置：" + cell.label);
      kit.update();
    });
    pad.append(b);
    padCells.push({ cell, b });
  }
  kit.addField({
    el: pad,
    set() { /* refresh から */ },
    refresh() {
      const rx = readT((t, c) => finite(c.transform && c.transform.x, 0));
      const ry = readT((t, c) => finite(c.transform && c.transform.y, 0));
      const mixed = rx.mixed || ry.mixed;
      for (const { cell, b } of padCells) {
        const on = !mixed && Math.abs(cell.x - finite(rx.value, 0)) < 0.05 && Math.abs(cell.y - finite(ry.value, 0)) < 0.05;
        b.classList.toggle("vqs-txt__padcell--on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      pad.classList.toggle("vqs-field--mixed", !!mixed);
    }
  });
  secPos.body.append(pad);
  const posX = kit.num({
    label: "X", unit: "%", min: -400, max: 400, step: 0.5, digits: 1, scale: 100,
    get: () => readT((t, c) => finite(c.transform && c.transform.x, 0)),
    onInput: (v) => setTf({ x: v }, "位置")
  });
  const posY = kit.num({
    label: "Y", unit: "%", min: -400, max: 400, step: 0.5, digits: 1, scale: 100,
    get: () => readT((t, c) => finite(c.transform && c.transform.y, 0)),
    onInput: (v) => setTf({ y: v }, "位置")
  });
  const posRow = el("div", "vqs-insp-row vqs-txt__pos");
  posRow.append(kit.keyframeMark(["transform.x", "transform.y"], "位置"));
  const posCtl = el("div", "vqs-insp-row__ctl vqs-txt__pair");
  posCtl.append(posX.el, posY.el);
  posRow.append(posCtl);
  secPos.body.append(posRow);
  secPos.add(kit.row({
    label: "回転", path: "transform.rotate",
    field: kit.sld({
      label: "回転", min: -180, max: 180, step: 1, digits: 0, unit: "°", center: 0,
      get: () => readT((t, c) => finite(c.transform && c.transform.rotate, 0)),
      onInput: (v) => setTf({ rotate: clamp(v, -180, 180) }, "回転")
    }),
    onReset: () => setTf({ rotate: 0 }, "回転を戻す")
  }));
  root.append(secPos.el);

  /* ── 3.7 字幕として扱う・様式の配り方 ─────────────────────── */
  const secSub = kit.section({ title: "字幕（SRT）", id: "txtsub" });
  const subTog = kit.tog({
    label: "字幕ファイルに含める",
    get: () => readT((t) => t.subtitle !== false),
    onChange: (v) => setT({ subtitle: !!v }, "字幕として扱う")
  });
  secSub.add(kit.row({
    label: "字幕", node: subTog.el,
    hint: "切っても画面には出ます。書き出しの字幕（SRT / VTT）から外れるだけです。"
  }));
  secSub.add(kit.btnRow([
    kit.btn("この様式を全テロップへ", () => applyStyleToAll(), { test: "insp-txt-styleall", title: "このプロジェクトの全ての文字クリップを、今の様式に揃えます" }),
    kit.btn("字幕の既定にする", () => saveAsSubtitleDefault(), { cls: "vqs-btn--ghost", test: "insp-txt-subdefault", title: "これから作る字幕・自動テロップがこの見た目になります" })
  ]));
  root.append(secSub.el);

  /** 全ての text クリップへ今の様式を配る（1 undo） */
  function applyStyleToAll() {
    const src = textClips()[0];
    if (!src || !src.text) { kit.toast("文字クリップを 1 つ選んでください", { kind: "info" }); return; }
    const style = Object.assign(defaultTextStyle(), src.text.style || null);
    const targets = [];
    for (const tr of (store.project && store.project.tracks) || []) {
      for (const c of (tr && tr.clips) || []) if (c && c.kind === "text" && c.id !== src.id) targets.push(c.id);
    }
    if (!targets.length) { kit.toast("他に文字クリップがありません", { kind: "info" }); return; }
    try {
      store.batch("様式を全テロップへ", (d) => { d("clip.setText", { clipIds: targets, patch: { style } }); });
      kit.toast(targets.length + " 個のテロップを揃えました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "揃えられませんでした", { kind: "error" });
    }
  }

  /** project.subtitleStyle に今の様式を入れる（op が無いので replace を使う） */
  function saveAsSubtitleDefault() {
    const src = textClips()[0];
    if (!src || !src.text) { kit.toast("文字クリップを 1 つ選んでください", { kind: "info" }); return; }
    try {
      const snap = store.snapshot();
      snap.subtitleStyle = Object.assign(defaultTextStyle(), snap.subtitleStyle || {}, src.text.style || {});
      store.replace(snap, "字幕の既定の様式");
      kit.toast("字幕の既定にしました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "既定にできませんでした", { kind: "error" });
    }
  }

  /* ── 3.8 一括編集（複数選択のときだけ）───────────────────── */
  const secBulk = kit.section({ title: "まとめて変える", id: "txtbulk" });
  const bulkTa = el("textarea", "vqs-txt__ta vqs-txt__ta--bulk");
  bulkTa.rows = 2;
  bulkTa.placeholder = "選んだテロップ全部をこの文字にする";
  bulkTa.setAttribute("aria-label", "まとめて入れる文字");
  bulkTa.setAttribute("data-test", "insp-txt-bulk");
  bulkTa.style.width = "100%";
  bulkTa.style.minHeight = isTouch() ? "72px" : "56px";
  secBulk.body.append(bulkTa);
  secBulk.add(kit.btnRow([
    kit.btn("文字だけ揃える", () => {
      const v = bulkTa.value;
      if (!v.trim()) { kit.toast("入れる文字を書いてください", { kind: "info" }); return; }
      setT({ content: v }, "文字をまとめて変更");
      kit.toast("文字を揃えました", { kind: "success" });
    }, { test: "insp-txt-bulk-text" }),
    kit.btn("様式だけ揃える", () => {
      const list = textClips();
      if (list.length < 2) { kit.toast("2 つ以上選んでください", { kind: "info" }); return; }
      const style = Object.assign(defaultTextStyle(), (list[0].text && list[0].text.style) || null);
      const rest = list.slice(1).map((c) => c.id);
      try {
        store.batch("様式をまとめて変更", (d) => { d("clip.setText", { clipIds: rest, patch: { style } }); });
        kit.toast("先頭の様式に揃えました", { kind: "success" });
      } catch (e) { kit.toast((e && e.message) || "揃えられませんでした", { kind: "error" }); }
    }, { cls: "vqs-btn--ghost", test: "insp-txt-bulk-style" })
  ]));
  secBulk.add(kit.note("「文字だけ」「様式だけ」を選べます（片方を変えても、もう片方はそのまま残ります）。"));
  root.append(secBulk.el);

  /* ── 3.9 出す / 隠す の面倒（枝が null のときは子を隠す）───── */
  function syncShown() {
    const g = readT((t) => !!(t.style && t.style.gradient));
    gradBox.hidden = !(g.value === true);
    const b = readT((t) => !!(t.style && t.style.bg));
    bgBox.hidden = !(b.value === true);
    const many = textClips().length > 1;
    secBulk.el.hidden = !many;
    const none = textClips().length === 0;
    root.classList.toggle("vqs-txt--empty", none);
    emptyNote.hidden = !none;
  }
  const emptyNote = kit.note("文字クリップを選ぶと、ここで細かく作り込めます。", "warn");
  emptyNote.setAttribute("data-test", "insp-txt-empty");
  root.insertBefore(emptyNote, root.firstChild);

  /** 生きた見本を今の様式で描き直す */
  function renderLive() {
    const s = style0();
    const c = textClips()[0];
    const txt = (c && c.text && typeof c.text.content === "string" && c.text.content.trim()) || "見本";
    liveInk.textContent = txt.split("\n")[0].slice(0, 24);
    paintSample(liveInk, s, 26, fontStack(s.font));
  }

  /* ── 3.10 engine/text.js（名簿）を後から読む ───────────────── */
  (async function loadBook() {
    let mod = null;
    try { mod = await import("../../engine/text.js"); }
    catch (e) { mod = null; }
    if (dead || !mod) return;
    const fonts = normalizeFonts(mod.FONT_STACKS || mod.FONTS || null);
    const presets = normalizePresets(mod.TEXT_PRESETS || mod.PRESETS || null);
    const anims = normalizeAnims(mod.TEXT_ANIMS || mod.ANIMS || null);
    book.fonts = fonts;
    book.presets = presets;
    book.anims = anims;
    book.fromEngine = true;
    refillSelect(fontField, fonts.map((f) => ({ value: f.id, label: f.label })));
    refillSelect(animIn.selField, anims.in.map((a) => ({ value: a.id, label: a.label })));
    refillSelect(animOut.selField, anims.out.map((a) => ({ value: a.id, label: a.label })));
    refillSelect(animLoop.selField, anims.loop.map((a) => ({ value: a.id, label: a.label })));
    buildPresets();
    kit.update();
    renderLive();
  })();

  /** kit.sel の中身（<option>）を作り替える（items は後から来る） */
  function refillSelect(field, items) {
    const sel = field && field.el && field.el.querySelector ? field.el.querySelector("select") : null;
    if (!sel) return;
    const keep = sel.value;
    sel.textContent = "";
    for (const it of items) {
      const op = el("option", "", it.label);
      op.value = String(it.value);
      sel.append(op);
    }
    if (items.some((it) => String(it.value) === keep)) sel.value = keep;
    if (typeof field.refresh === "function") { try { field.refresh(); } catch (e) { /* noop */ } }
  }

  /* ── 契約の形 ─────────────────────────────────────────────── */
  buildPresets();
  kit.update(textOnly(o.clipIds));
  renderLive();
  syncShown();

  return {
    el: root,
    update(ids) {
      kit.update(ids === undefined ? undefined : textOnly(ids));
      renderLive();
      syncShown();
    },
    reset() {
      setT({ style: defaultTextStyle(), layout: { align: "center", vAlign: "middle", maxWidth: 0.8, lineHeight: 1.25, letterSpacing: 0 } }, "文字の様式を既定へ");
      setClip({ opacity: 1 }, "文字の様式を既定へ");
      kit.update();
      renderLive();
      syncShown();
    },
    dispose() {
      dead = true;
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = 0; }
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
