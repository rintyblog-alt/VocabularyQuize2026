/* ══════════════════════════════════════════════════════════════════════
   ui/ai-panel.js — AI 自動編集の画面（今回の目玉機能の顔）

   ★ 何をする所か
     契約書 §6 の ai/* を人が触れる形にする 1 枚。3 つの顔を持つ:
       ・"create" 作る … 大きな注文入力 → planEdit → resolvePlan → 要約 → 適用
       ・"refine" 直す … 追い注文（「もっとテンポ速く」）→ refine → 適用（履歴つき）
       ・"tools"  道具 … ai/tools.js に **実際に在る関数だけ** を並べて「試す」
     デスクトップは中央モーダル（widgets.openModal）、モバイルは全高シート
     （widgets.openSheet）。中身の DOM はどちらでも同じ物を使い回す。

   ★ なぜこの形か
     ・適用は **必ず** `store.batch("AI 自動編集", d => ops.forEach(o => d(o.type, o.payload)))`。
       ops を自分で project に書き込むと取消（store.undo）が壊れる。
     ・plan（構成）と ops（実タイムライン）を分けて持つ。微調整スライダーは
       **同じ plan を作り直さずに resolvePlan だけを回す**（通信しない・速い・
       同じ入力なら同じ結果）。
     ・ai/* と analysis/* は「無いことがある」（app.js が opt() で読む）。
       呼ぶ前に必ず typeof で在るか見て、無ければ日本語で理由を出す。
     ・LLM が使えない時は隠さず「この端末だけで組み立てます」と出す。嘘をつくと
       「AI が動いていない」と誤解される（契約の合格条件は local で動く事）。
     ・widgets が読めなかった時でも最低限操作できるように、素の input の控えを
       持つ（AI の画面だけ真っ白になるのを避ける）。

   ★ 触るときの注意
     ・この画面は project を直接書き換えない。全て op 経由。
     ・進捗・中止は AbortController 1 本で回す（解析 → 構成の両方に渡す）。
     ・CSS は styles/ai.css の `vqs-ai*` だけ。色は tokens の変数のみ。

   CONTRACT-NOTE: 共通前提は「1 ファイル 700 行で分割」だが、分割先
     （ui/ai-panel/*.js）は担当外なので作れない（ai/tools.js が同じ理由で 1 枚に
     なっているのと同じ）。読む人のために §0〜§6 の章立てを入れて 1 枚に収めた。
     統合担当が分けるときは §3 作る / §4 直す / §5 道具 を切り出せば、import は
     `../core/*` のままで動く（章の間で共有しているのは state と小道具だけ）。
   ══════════════════════════════════════════════════════════════════════ */

import { warn } from "../core/log.js";
import { RATIOS } from "../core/schema.js";
import { caps } from "../core/caps.js";

/* ── 0. 定数（画面の文言と選択肢）───────────────────────────────── */

const MOBILE_Q = "(max-width: 1023px)";

/** 作る の段階表示（契約の順番）*/
const STAGES = Object.freeze(["素材を調べる", "構成を考える", "並べる", "仕上げ"]);

const PROMPT_EXAMPLE =
  "例: 沖縄旅行の 30 秒ダイジェスト。海の場面を多めに、テンポ良く、"
  + "テロップは短い一言で。最後に「また行きます」と出す。";

const DUR_CHOICES = Object.freeze([
  { value: 15, label: "15 秒" }, { value: 30, label: "30 秒" },
  { value: 60, label: "60 秒" }, { value: 0, label: "自由" }
]);
const PACING_CHOICES = Object.freeze([
  { value: "slow", label: "ゆっくり" }, { value: "medium", label: "普通" },
  { value: "fast", label: "速い" }, { value: "beat", label: "音ハメ" }
]);
const CAPTION_CHOICES = Object.freeze([
  { value: "none", label: "無し" }, { value: "auto", label: "自動" }
]);
const TELOP_LABELS = Object.freeze(["少なめ", "普通", "多め"]);

const REFINE_EXAMPLES = Object.freeze([
  "もっとテンポ速く", "テロップを大きく", "BGM を小さく",
  "最初の 3 秒を削って", "全体を明るく", "無音を詰めて"
]);

/** 雰囲気（= テンプレ）。ai/templates.js が読めたら実物の名前に差し替える */
const MOOD_FALLBACK = Object.freeze([
  ["vlog", "日常 Vlog"], ["travel", "旅行"], ["product", "商品紹介"], ["explainer", "解説"],
  ["tutorial", "作り方・手順"], ["short", "ショート（縦）"], ["digest", "ダイジェスト"],
  ["cinematic", "シネマ"], ["news", "ニュース"], ["sports", "スポーツ"],
  ["wedding", "結婚式"], ["food", "料理・グルメ"], ["pet", "ペット"],
  ["music", "音楽・MV"], ["game", "ゲーム実況"], ["interview", "インタビュー"]
]);
let moodItems = MOOD_FALLBACK.map((x) => ({ value: x[0], label: x[1] }));
let moodTried = false;

/**
 * 道具の一覧（ai/tools.js に **在る物だけ** を出す）。
 * knob.from は AUTO_DEFAULTS の場所（在ればそこから初期値を取る）。
 */
const TOOL_DEFS = Object.freeze([
  { fn: "autoCutSilence", title: "無音カット", desc: "話していない所を詰めます（音の解析が要ります）。",
    knobs: [
      { key: "thresholdDb", label: "静かさのしきい", min: -60, max: -20, step: 1, value: -38, unit: "dB", from: ["silence", "thresholdDb"] },
      { key: "minDur", label: "これ以上の無音を切る", min: 0.1, max: 2, step: 0.05, value: 0.35, unit: "秒", from: ["silence", "minDur"] },
      { key: "pad", label: "前後に残す余白", min: 0, max: 0.5, step: 0.01, value: 0.08, unit: "秒", from: ["silence", "pad"] }
    ] },
  { fn: "autoBeatSync", title: "ビート同期", desc: "切り替え点を BGM の拍に吸い付けます。",
    knobs: [{ key: "divide", label: "何拍ごとか", min: 1, max: 4, step: 1, value: 1, unit: "拍", from: ["beat", "divide"] }] },
  { fn: "autoReframe", title: "自動リフレーム", desc: "主役を追って縦・横に切り直します（キーフレームで残るので後から直せます）。",
    knobs: [{ key: "smooth", label: "滑らかさ", min: 0, max: 1, step: 0.05, value: 0.8, from: ["reframe", "smooth"] }] },
  { fn: "autoColor", title: "自動カラー", desc: "明るさ・コントラスト・色温度を整えます。",
    knobs: [{ key: "strength", label: "効かせ方", min: 0.2, max: 1.5, step: 0.05, value: 1, from: ["color", "strength"] }] },
  { fn: "autoNormalize", title: "音量そろえ", desc: "クリップごとの音量を同じ大きさに寄せます。",
    knobs: [{ key: "targetLufs", label: "目標の大きさ", min: -24, max: -8, step: 1, value: -14, unit: "LUFS", from: ["normalize", "targetLufs"] }] },
  { fn: "autoDuck", title: "ダッキング", desc: "人が話している所だけ BGM を下げます。",
    knobs: [{ key: "amount", label: "下げ幅", min: 0.1, max: 1, step: 0.05, value: 0.7, from: ["duck", "amount"] }] },
  { fn: "autoHighlights", title: "ハイライト", desc: "長い素材から良い所だけを拾って並べます。",
    knobs: [
      { key: "count", label: "拾う数", min: 2, max: 12, step: 1, value: 5, unit: "個", from: ["highlights", "count"] },
      { key: "len", label: "1 つの長さ", min: 1, max: 8, step: 0.5, value: 3, unit: "秒", from: ["highlights", "len"] }
    ] },
  { fn: "autoChapters", title: "章（チャプター）", desc: "話や場面の切れ目に章の印を置きます。",
    knobs: [{ key: "minGap", label: "章の最短間隔", min: 3, max: 60, step: 1, value: 8, unit: "秒", from: ["chapters", "minGap"] }] },
  { fn: "autoZoomPunch", title: "ズームパンチ", desc: "拍や切り替えで少しだけ寄ります。",
    knobs: [{ key: "amount", label: "寄り幅", min: 0.02, max: 0.3, step: 0.01, value: 0.08, from: ["zoom", "amount"] }] },
  { fn: "autoTransitions", title: "遷移（トランジション）", desc: "つなぎ目に自然な遷移を置きます。",
    knobs: [{ key: "density", label: "どれくらい置くか", min: 0, max: 1, step: 0.05, value: 0.3, from: ["transitions", "density"] }] },
  { fn: "autoSubtitleFromSpeech", title: "字幕（話し声から）", desc: "話している所に字幕クリップを作ります。",
    knobs: [] },
  { fn: "autoTelopFromSilence", title: "テロップ枠", desc: "話の区切りごとに空のテロップ枠を置きます（文字は後で入れられます）。",
    knobs: [] },
  { fn: "removeGaps", title: "隙間詰め", desc: "クリップの間の空きを詰めます。", knobs: [] },
  { fn: "evenOut", title: "尺そろえ", desc: "選んだクリップの長さを同じにします。",
    knobs: [{ key: "duration", label: "そろえる長さ", min: 0.5, max: 10, step: 0.1, value: 2, unit: "秒" }] },
  { fn: "autoFadeInOut", title: "フェード", desc: "頭と尻に音・絵のフェードを付けます。",
    knobs: [
      { key: "in", label: "頭", min: 0, max: 3, step: 0.1, value: 0.5, unit: "秒", from: ["fade", "in"] },
      { key: "out", label: "尻", min: 0, max: 3, step: 0.1, value: 0.5, unit: "秒", from: ["fade", "out"] }
    ] }
]);

/* ── 1. 小道具 ──────────────────────────────────────────────────── */

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const msgOf = (e) => String((e && e.message) || e || "原因不明");
const s1 = (n) => (Math.round(num(n, 0) * 10) / 10).toFixed(1);

function mk(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null && text !== "") el.textContent = String(text);
  return el;
}
function row(label, node, hint) {
  const el = mk("div", "vqs-ai__row");
  if (label) el.append(mk("span", "vqs-ai__rowlabel", label));
  const b = mk("div", "vqs-ai__rowbody");
  if (node) b.append(node);
  el.append(b);
  if (hint) el.append(mk("p", "vqs-ai__hint", hint));
  return el;
}
function section(title) {
  const el = mk("section", "vqs-ai__sec");
  if (title) el.append(mk("h3", "vqs-ai__sectitle", title));
  return el;
}
function btn(label, cls, onClick) {
  const b = mk("button", "vqs-ai__btn " + (cls || ""), label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
/** 雰囲気の実名を後から取り込む（読めなくても既定の一覧で動く） */
function loadMoods(after) {
  if (moodTried) return;
  moodTried = true;
  import("../ai/templates.js").then((m) => {
    const t = m && m.TEMPLATES;
    if (!t) return;
    const ids = (m.TEMPLATE_IDS && m.TEMPLATE_IDS.length) ? m.TEMPLATE_IDS : Object.keys(t);
    const list = ids.map((id) => ({
      value: id,
      label: String((t[id] && t[id].name) || id),
      desc: String((t[id] && t[id].description) || "")
    }));
    if (list.length) moodItems = list;
    if (typeof after === "function") { try { after(); } catch (e) { warn("ai-panel", "雰囲気の描き直しに失敗", msgOf(e)); } }
  }).catch(() => { /* 無ければ既定の一覧のまま */ });
}

/* ══ 2. 本体 ════════════════════════════════════════════════════ */

/**
 * AI 自動編集の画面を作る（契約書 §7）。
 * @param {{store:Object, els?:Object, widgets?:Object, storage?:Object,
 *          analysis?:Object, ai?:Object, ctx?:Object}} deps
 * @returns {{open:(mode?:string)=>void, close:()=>void, dispose:()=>void}}
 */
export function createAiPanel(deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.batch !== "function") {
    throw new Error("createAiPanel: store が要ります（契約書 §3）");
  }
  const widgets = d.widgets || null;
  const ai = d.ai || {};
  const analysis = d.analysis || null;
  const storage = d.storage || null;
  const ctx = d.ctx || {};

  const W = (name) => (widgets && typeof widgets[name] === "function" ? widgets[name] : null);
  const toast = (m, kind) => {
    const f = W("toast");
    if (f) { try { return f(String(m), { kind: kind || "info" }); } catch (e) { /* 続行 */ } }
    return null;
  };

  /* ── 状態 ─────────────────────────────────────────────────── */
  const state = {
    mode: "create",
    layer: null,       // widgets が返す { close, el }
    root: null,        // 画面の中身
    body: null,        // タブごとの入れ替え先
    busy: false,
    abort: null,
    stageEl: null,
    resultEl: null,
    last: null,        // { plan, intent, source, notes, rv }
    chat: [],          // 直す のやり取り
    form: {
      prompt: "", useAll: true, picked: new Set(),
      duration: 30, freeDuration: 30, ratio: "", pacing: "medium",
      captions: "auto", bgm: "", mood: "vlog"
    },
    tune: { tempo: 1, cuts: 1, telop: 1, fx: 1 },
    toolsSelOnly: false,
    toolKnobs: Object.create(null)
  };

  /* ── 控えの部品（widgets が読めなかった時だけ通る）─────────── */
  function wSeg(o) {
    const f = W("segmented");
    if (f) return f(o);
    const el = mk("div", "vqs-ai__fbseg");
    for (const it of o.items || []) {
      const b = mk("button", "vqs-ai__fbsegbtn", it.label);
      b.type = "button";
      if (String(it.value) === String(o.value)) b.classList.add("is-on");
      b.addEventListener("click", () => {
        for (const x of Array.prototype.slice.call(el.children)) x.classList.remove("is-on");
        b.classList.add("is-on");
        if (o.onChange) o.onChange(it.value, it);
      });
      el.append(b);
    }
    return el;
  }
  function wSlider(o) {
    const f = W("slider");
    if (f) return f(o);
    const el = mk("label", "vqs-ai__fbslider");
    if (o.label) el.append(mk("span", "vqs-ai__fbslabel", o.label));
    const inp = mk("input", "vqs-ai__fbsrange");
    inp.type = "range";
    inp.min = String(num(o.min, 0)); inp.max = String(num(o.max, 1));
    inp.step = String(num(o.step, 0.01)); inp.value = String(num(o.value, 0));
    const out = mk("span", "vqs-ai__fbsval", String(num(o.value, 0)));
    inp.addEventListener("input", () => {
      out.textContent = inp.value;
      if (o.onInput) o.onInput(Number(inp.value));
    });
    inp.addEventListener("change", () => { if (o.onCommit) o.onCommit(Number(inp.value)); });
    el.append(inp, out);
    return el;
  }
  function wToggle(o) {
    const f = W("toggle");
    if (f) return f(o);
    const el = mk("label", "vqs-ai__fbtoggle");
    const inp = mk("input");
    inp.type = "checkbox";
    inp.checked = !!o.value;
    inp.addEventListener("change", () => { if (o.onChange) o.onChange(inp.checked); });
    el.append(inp, mk("span", "", o.label || ""));
    return el;
  }
  function wArea(o) {
    const f = W("textArea");
    if (f) return f(o);
    const ta = mk("textarea", "vqs-ai__fbarea");
    ta.rows = num(o.rows, 4);
    ta.value = o.value || "";
    if (o.placeholder) ta.placeholder = o.placeholder;
    ta.addEventListener("input", () => { if (o.onInput) o.onInput(ta.value); });
    return ta;
  }
  function wSelect(o) {
    const f = W("select");
    if (f) return f(o);
    const sel = mk("select", "vqs-ai__fbselect");
    for (const it of o.items || []) {
      const op = mk("option", "", it.label);
      op.value = String(it.value);
      sel.append(op);
    }
    if (o.value !== undefined) sel.value = String(o.value);
    sel.addEventListener("change", () => { if (o.onChange) o.onChange(sel.value); });
    return sel;
  }

  /* ── 素材と設定の読み ─────────────────────────────────────── */
  const project = () => store.project || { assets: [], tracks: [], settings: {} };
  const allAssets = () => (Array.isArray(project().assets) ? project().assets : []);
  const fpsOf = () => num(project().settings && project().settings.fps, 30);
  function assetsFor() {
    const all = allAssets();
    if (state.form.useAll) return all.slice();
    const sel = all.filter((a) => a && state.form.picked.has(String(a.id)));
    return sel.length ? sel : all.slice();
  }
  function audioAssets() {
    return allAssets().filter((a) => a && String(a.kind) === "audio");
  }
  function llmOn() {
    const l = ai.llm;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    return !!(l && typeof l.json === "function" && l.available !== false) && online;
  }
  function llmNote() {
    return llmOn() ? "AI に相談しながら組み立てます。" : "この端末だけで組み立てます（ネットや AI に繋がっていません）。";
  }

  /* ── 適用（必ず store.batch）─────────────────────────────── */
  /**
   * ops を 1 取消単位で当てる。
   * @returns {number} 当てた op の数。失敗は -1
   */
  function applyOps(ops, label) {
    const list = Array.isArray(ops) ? ops.filter((o) => o && o.type) : [];
    if (!list.length) { toast("変更はありませんでした", "warn"); return 0; }
    try {
      store.batch(String(label || "AI 自動編集"), (dispatch) => {
        for (const o of list) dispatch(o.type, o.payload || {});
      });
      return list.length;
    } catch (e) {
      warn("ai-panel", "適用に失敗", msgOf(e));
      toast("当てられませんでした: " + msgOf(e), "error");
      return -1;
    }
  }
  /** 適用後は先頭から自動再生（契約）*/
  function playFromHead() {
    const tr = ctx.transport || null;
    if (!tr) return;
    try {
      if (typeof tr.seek === "function") tr.seek(0, { scrub: false });
      if (typeof tr.play === "function") tr.play();
    } catch (e) { warn("ai-panel", "自動再生できなかった", msgOf(e)); }
  }
  function undoLast() {
    try {
      if (typeof store.canUndo === "function" && !store.canUndo()) { toast("戻せる変更がありません", "warn"); return; }
      store.undo();
      toast("元に戻しました");
    } catch (e) { toast("戻せませんでした: " + msgOf(e), "error"); }
  }

  /* ── 段階表示 ─────────────────────────────────────────────── */
  function makeStages() {
    const el = mk("div", "vqs-ai__stages");
    el.setAttribute("data-test", "ai-stages");
    for (let i = 0; i < STAGES.length; i++) {
      const s = mk("div", "vqs-ai__stage");
      s.append(mk("i", "vqs-ai__stagedot"), mk("span", "vqs-ai__stagename", STAGES[i]));
      s.append(mk("span", "vqs-ai__stagenote"));
      el.append(s);
    }
    return el;
  }
  /**
   * 段階を進める。i 未満は済み・i は進行中。
   * @param {number} i @param {string} [note] 「n/m」等の一言
   */
  function setStage(i, note) {
    const host = state.stageEl;
    if (!host) return;
    const kids = Array.prototype.slice.call(host.children);
    for (let k = 0; k < kids.length; k++) {
      kids[k].classList.toggle("is-done", k < i);
      kids[k].classList.toggle("is-now", k === i);
      const n = kids[k].querySelector(".vqs-ai__stagenote");
      if (n) n.textContent = k === i && note ? String(note) : "";
    }
  }
  function busy(on, label) {
    state.busy = !!on;
    if (state.root) {
      state.root.classList.toggle("vqs-ai--busy", !!on);
      const t = state.root.querySelector(".vqs-ai__thinking");
      if (t) t.textContent = on ? String(label || "考えています…") : "";
    }
  }

  /* ══ 3. 作る ═════════════════════════════════════════════════ */

  function renderCreate(host) {
    const f = state.form;

    /* ① 注文 */
    const sec1 = section("どんな動画にしますか");
    const area = wArea({
      rows: 5, value: f.prompt, placeholder: PROMPT_EXAMPLE,
      onInput: (v) => { f.prompt = String(v || ""); }
    });
    const areaWrap = mk("div", "vqs-ai__prompt");
    areaWrap.setAttribute("data-test", "ai-prompt");
    areaWrap.append(area);
    sec1.append(areaWrap);
    sec1.append(mk("p", "vqs-ai__note", llmNote()));
    host.append(sec1);

    /* ② 素材 */
    const sec2 = section("使う素材");
    const list = allAssets();
    sec2.append(row("", wSeg({
      items: [{ value: "all", label: "全部使う" }, { value: "pick", label: "選ぶ" }],
      value: f.useAll ? "all" : "pick",
      onChange: (v) => { f.useAll = v === "all"; paintPicker(); }
    })));
    const picker = mk("div", "vqs-ai__picker");
    picker.setAttribute("data-test", "ai-asset-picker");
    function paintPicker() {
      picker.textContent = "";
      picker.classList.toggle("is-hidden", f.useAll);
      if (f.useAll) return;
      if (!list.length) { picker.append(mk("p", "vqs-ai__empty", "素材がありません。")); return; }
      for (const a of list) {
        const id = String(a.id);
        const chip = mk("button", "vqs-ai__chip", String(a.name || id).slice(0, 28));
        chip.type = "button";
        chip.classList.toggle("is-on", f.picked.has(id));
        chip.addEventListener("click", () => {
          if (f.picked.has(id)) f.picked.delete(id); else f.picked.add(id);
          chip.classList.toggle("is-on", f.picked.has(id));
        });
        picker.append(chip);
      }
    }
    paintPicker();
    sec2.append(picker);
    host.append(sec2);

    /* ③ 手早い設定 */
    const sec3 = section("手早い設定");
    sec3.append(row("長さ", wSeg({
      items: DUR_CHOICES.slice(),
      value: f.duration,
      onChange: (v) => { f.duration = num(v, 30); paintFree(); }
    })));
    const freeWrap = mk("div", "vqs-ai__free");
    function paintFree() {
      freeWrap.textContent = "";
      freeWrap.classList.toggle("is-hidden", f.duration !== 0);
      if (f.duration !== 0) return;
      freeWrap.append(wSlider({
        label: "好きな長さ", min: 3, max: 300, step: 1, value: f.freeDuration, unit: "秒",
        onInput: (v) => { f.freeDuration = num(v, 30); }
      }));
    }
    paintFree();
    sec3.append(freeWrap);

    const ratioItems = Object.keys(RATIOS).filter((k) => k !== "custom")
      .map((k) => ({ value: k, label: String((RATIOS[k] && RATIOS[k].label) || k) }));
    ratioItems.unshift({ value: "", label: "今のまま" });
    sec3.append(row("比率", wSelect({
      items: ratioItems, value: f.ratio,
      onChange: (v) => { f.ratio = String(v || ""); }
    })));
    sec3.append(row("テンポ", wSeg({
      items: PACING_CHOICES.slice(), value: f.pacing,
      onChange: (v) => { f.pacing = String(v); }
    })));
    sec3.append(row("テロップ", wSeg({
      items: CAPTION_CHOICES.slice(), value: f.captions,
      onChange: (v) => { f.captions = String(v); }
    })));
    const bgm = audioAssets();
    const bgmItems = [{ value: "", label: bgm.length ? "なし" : "音の素材がありません" }]
      .concat(bgm.map((a) => ({ value: String(a.id), label: String(a.name || a.id).slice(0, 24) })));
    sec3.append(row("BGM", wSelect({
      items: bgmItems, value: f.bgm, onChange: (v) => { f.bgm = String(v || ""); }
    })));
    sec3.append(row("雰囲気", wSelect({
      items: moodItems.slice(), value: f.mood, onChange: (v) => { f.mood = String(v); }
    })));
    host.append(sec3);

    /* ④ 進捗と結果 */
    const prog = mk("div", "vqs-ai__progress is-hidden");
    prog.setAttribute("data-test", "ai-progress");
    state.stageEl = makeStages();
    prog.append(state.stageEl);
    const pfoot = mk("div", "vqs-ai__progfoot");
    pfoot.append(mk("span", "vqs-ai__thinking"), btn("中止", "vqs-ai__btn--ghost", cancel));
    prog.append(pfoot);
    host.append(prog);

    state.resultEl = mk("div", "vqs-ai__result");
    state.resultEl.setAttribute("data-test", "ai-result");
    host.append(state.resultEl);

    /* ⑤ 組み立てる */
    const foot = mk("div", "vqs-ai__foot");
    const go = btn("組み立てる", "vqs-ai__btn--primary", () => {
      prog.classList.remove("is-hidden");
      build();
    });
    go.setAttribute("data-test", "ai-build");
    foot.append(go);
    host.append(foot);

    if (!moodTried) loadMoods(() => { if (state.mode === "create") renderBody(); });
    if (state.last) paintResult();
  }

  function cancel() {
    if (state.abort) { try { state.abort.abort(); } catch (e) { /* noop */ } }
    busy(false);
    toast("中止しました", "warn");
  }

  /** 注文 → 構成 → 並べる（失敗は日本語で理由を出す）*/
  async function build() {
    if (state.busy) { toast("いま組み立てています", "warn"); return; }
    const assets = assetsFor();
    if (!assets.length) {
      toast("素材がありません。先に動画や写真を取り込んでください。", "warn");
      return;
    }
    const planner = ai.planner;
    if (!planner || typeof planner.planEdit !== "function") {
      toast("AI の構成部品（ai/planner.js）を読み込めませんでした。", "error");
      return;
    }
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    state.abort = ac;
    const signal = ac ? ac.signal : null;
    busy(true, "素材を調べています…");
    setStage(0, "");
    if (state.resultEl) state.resultEl.textContent = "";
    const notes = [];

    try {
      /* ① 未解析の素材を調べる（無くても進む）*/
      if (analysis && typeof analysis.analyzeAssets === "function") {
        const need = assets.filter((a) => (typeof analysis.needsAnalysis === "function"
          ? analysis.needsAnalysis(a) : !(a && a.analysis)));
        if (need.length) {
          setStage(0, "0/" + need.length);
          let done = 0;
          const got = await analysis.analyzeAssets(need, {
            storage, signal,
            onProgress: (p) => {
              const n = Math.min(need.length, Math.floor(num(p, 0) * need.length) + 1);
              if (n !== done) { done = n; setStage(0, done + "/" + need.length); }
            }
          });
          const ok = (got || []).filter((r) => r && r.analysis);
          if (ok.length) {
            store.batch("素材の解析", (dispatch) => {
              for (const r of ok) dispatch("asset.update", { assetId: r.assetId, patch: { analysis: r.analysis } });
            });
          }
          const bad = (got || []).filter((r) => r && r.error);
          if (bad.length) notes.push(bad.length + " 個の素材は調べきれませんでした（そのまま使います）");
        }
      } else {
        notes.push("解析部品が無いので素材は「普通」として扱いました");
      }

      /* ② 構成 */
      setStage(1, "");
      busy(true, llmOn() ? "AI が構成を考えています…" : "この端末で構成を考えています…");
      const target = state.form.duration === 0 ? state.form.freeDuration : state.form.duration;
      const constraints = { targetDuration: target, pacing: state.form.pacing };
      if (state.form.ratio) constraints.ratio = state.form.ratio;
      const res = await planner.planEdit({
        prompt: state.form.prompt, project: project(), assets,
        template: state.form.mood, constraints,
        llm: llmOn() ? ai.llm : null, signal,
        onProgress: (p, info) => setStage(1, info && info.stage ? String(info.stage) : Math.round(num(p, 0) * 100) + "%")
      });
      const plan = res && res.plan ? res.plan : null;
      if (!plan) throw new Error("構成を作れませんでした");
      /* UI の指定は Plan に必ず反映（テロップ・BGM は画面が強い）*/
      if (state.form.captions) plan.captions = state.form.captions;
      if (state.form.bgm) {
        plan.music = Object.assign({ gain: 0.22, duck: true, startAt: "auto" }, plan.music || {}, { assetId: state.form.bgm });
      }

      /* ③ 並べる */
      setStage(2, "");
      busy(true, "並べています…");
      const rv = resolveNow(plan);

      /* ④ 仕上げ */
      setStage(3, "");
      state.tune = { tempo: 1, cuts: 1, telop: 1, fx: 1 };
      state.last = {
        plan, tuned: plan, source: String((res && res.source) || "local"),
        notes: notes.concat(Array.isArray(res && res.notes) ? res.notes : []),
        rv, applied: false
      };
      setStage(4, "");
      busy(false);
      paintResult();
    } catch (e) {
      busy(false);
      if (e && e.name === "AbortError") { toast("中止しました", "warn"); return; }
      warn("ai-panel", "組み立てに失敗", msgOf(e));
      toast("組み立てられませんでした: " + msgOf(e), "error");
    } finally {
      state.abort = null;
    }
  }

  /** plan → ops（決定論。微調整はここだけを回す）*/
  function resolveNow(plan) {
    const R = ai.resolve;
    if (!R || typeof R.resolvePlan !== "function") {
      return { ops: [], summary: "", warnings: ["並べる部品（ai/resolve.js）を読み込めませんでした"] };
    }
    try {
      return R.resolvePlan(plan, { project: project(), assets: assetsFor(), fps: fpsOf() });
    } catch (e) {
      warn("ai-panel", "resolvePlan に失敗", msgOf(e));
      return { ops: [], summary: "", warnings: ["並べる途中で失敗しました: " + msgOf(e)] };
    }
  }

  /** ops の中身を数える（要約の見出し用）*/
  function countOps(ops) {
    let clips = 0, texts = 0, audio = 0;
    for (const o of Array.isArray(ops) ? ops : []) {
      if (!o || o.type !== "clip.add") continue;
      const c = (o.payload && (o.payload.clip || o.payload)) || {};
      const k = String(c.kind || "");
      if (k === "text") texts++;
      else if (k === "audio") audio++;
      else clips++;
    }
    return { clips, texts, audio };
  }

  /** 同じ plan をつまみで作り替える（通信しない）*/
  function tunedPlan(plan, t) {
    let p;
    try { p = JSON.parse(JSON.stringify(plan)); }
    catch (e) { return plan; }
    const segs = Array.isArray(p.segments) ? p.segments : [];
    if (segs.length) {
      const want = Math.max(1, Math.round(segs.length * clamp(num(t.cuts, 1), 0.4, 2)));
      const out = [];
      for (let i = 0; i < want; i++) out.push(Object.assign({}, segs[i % segs.length]));
      const tempo = clamp(num(t.tempo, 1), 0.5, 2);
      for (const s of out) {
        s.want = Math.max(0.4, num(s.want, 2) / tempo);
        if (num(t.fx, 1) <= 0.01) { s.transition = "cut"; s.fx = []; }
        if (s.text) {
          if (num(t.telop, 1) <= 0.01) s.text = null;
          else s.text.emphasis = clamp(num(s.text.emphasis, 0.5) * num(t.fx, 1), 0, 1);
        }
      }
      p.segments = out;
      if (p.pacing !== "beat") p.pacing = tempo >= 1.3 ? "fast" : tempo <= 0.75 ? "slow" : "medium";
    }
    if (num(t.telop, 1) <= 0.01) p.captions = "none";
    else if (num(t.telop, 1) >= 1.99) p.captions = "auto";
    if (num(t.fx, 1) <= 0.01) p.grade = null;
    return p;
  }

  /* 要約カード（変更点・微調整・3 つのボタン）*/
  function paintResult() {
    const host = state.resultEl;
    if (!host) return;
    host.textContent = "";
    const L = state.last;
    if (!L) return;
    const rv = L.rv || { ops: [], summary: "", warnings: [] };
    const c = countOps(rv.ops);

    const card = mk("div", "vqs-ai__card");
    card.setAttribute("data-test", "ai-summary");
    const head = mk("div", "vqs-ai__cardhead");
    head.append(mk("strong", "vqs-ai__cardtitle",
      c.clips + " クリップ / " + s1(planEnd(rv)) + " 秒 / テロップ " + c.texts + " 枚"));
    head.append(mk("span", "vqs-ai__badge", L.source === "llm" ? "AI が構成" : "端末内で構成"));
    card.append(head);
    if (rv.summary) card.append(mk("p", "vqs-ai__cardsub", String(rv.summary)));

    const changes = (L.notes || []).concat(Array.isArray(rv.warnings) ? rv.warnings : []);
    if (changes.length) {
      const ul = mk("ul", "vqs-ai__changes");
      for (const x of changes.slice(0, 10)) ul.append(mk("li", "", String(x)));
      card.append(mk("h4", "vqs-ai__cardh", "変更点・注意"), ul);
    }
    host.append(card);

    /* 微調整（同じ plan を再解決）*/
    const tune = mk("div", "vqs-ai__tune");
    tune.setAttribute("data-test", "ai-tune");
    tune.append(mk("h4", "vqs-ai__cardh", "微調整"));
    const mkTune = (key, label, min, max, step, fmt) => tune.append(wSlider({
      label, min, max, step, value: state.tune[key], center: 1,
      format: fmt,
      onInput: (v) => { state.tune[key] = num(v, 1); scheduleReresolve(); }
    }));
    mkTune("tempo", "テンポ", 0.5, 2, 0.05);
    mkTune("cuts", "カット数", 0.4, 2, 0.05);
    mkTune("telop", "テロップ量", 0, 2, 1, (v) => TELOP_LABELS[clamp(Math.round(num(v, 1)), 0, 2)]);
    mkTune("fx", "効果の強さ", 0, 1.5, 0.05);
    host.append(tune);

    const acts = mk("div", "vqs-ai__acts");
    const use = btn("このまま使う", "vqs-ai__btn--primary", () => {
      const n = applyOps((state.last.rv || {}).ops, "AI 自動編集");
      if (n > 0) {
        state.last.applied = true;
        toast(n + " 件の編集を当てました");
        playFromHead();
        close();
      }
    });
    use.setAttribute("data-test", "ai-apply");
    acts.append(use);
    acts.append(btn("もう一度", "", () => build()));
    acts.append(btn("元に戻す", "vqs-ai__btn--ghost", undoLast));
    host.append(acts);
  }

  /** 並べた結果の終わり（秒）。分からなければ 0 */
  function planEnd(rv) {
    let end = 0;
    for (const o of Array.isArray(rv && rv.ops) ? rv.ops : []) {
      if (!o || o.type !== "clip.add") continue;
      const c = (o.payload && (o.payload.clip || o.payload)) || {};
      /* resolve.js は置き場所を payload.at で渡す（clip.start は空のことがある）*/
      const st = num(c.start, num(o.payload && o.payload.at, 0));
      const du = num(c.duration, Math.max(0, num(c.out, 0) - num(c.in, 0)));
      if (st + du > end) end = st + du;
    }
    return end;
  }

  let reTimer = 0;
  function scheduleReresolve() {
    if (reTimer) clearTimeout(reTimer);
    reTimer = setTimeout(() => {
      reTimer = 0;
      if (!state.last || !state.last.plan) return;
      const p = tunedPlan(state.last.plan, state.tune);
      state.last.tuned = p;
      state.last.rv = resolveNow(p);
      paintResult();
    }, 140);
  }

  /* ══ 4. 直す ═════════════════════════════════════════════════ */

  function renderRefine(host) {
    const sec = section("どこを直しますか");
    sec.append(mk("p", "vqs-ai__note",
      "今の編集に追い注文を出します。例:「もっとテンポ速く」「BGM を小さく」。" + llmNote()));

    const log = mk("div", "vqs-ai__chat");
    log.setAttribute("data-test", "ai-chat");
    function paintChat() {
      log.textContent = "";
      if (!state.chat.length) { log.append(mk("p", "vqs-ai__empty", "まだやり取りはありません。")); return; }
      for (const m of state.chat) {
        const b = mk("div", "vqs-ai__bubble vqs-ai__bubble--" + (m.role === "user" ? "me" : "ai"));
        b.append(mk("p", "vqs-ai__bubbletext", m.text));
        for (const w of m.warnings || []) b.append(mk("p", "vqs-ai__bubblewarn", String(w)));
        if (m.role === "ai" && m.applied) b.append(btn("取消", "vqs-ai__btn--ghost vqs-ai__btn--sm", undoLast));
        log.append(b);
      }
      log.scrollTop = log.scrollHeight;
    }
    paintChat();

    let text = "";
    const area = wArea({
      rows: 3, placeholder: "例: もっとテンポ速く / テロップを大きく",
      onInput: (v) => { text = String(v || ""); }
    });
    const ex = mk("div", "vqs-ai__examples");
    for (const s of REFINE_EXAMPLES) {
      ex.append(btn(s, "vqs-ai__btn--chip", () => {
        text = s;
        const ta = area.querySelector ? area.querySelector("textarea") : null;
        if (ta) ta.value = s; else if (area.tagName === "TEXTAREA") area.value = s;
      }));
    }

    const onlySel = wToggle({
      label: "選択中のクリップだけに効かせる", value: state.toolsSelOnly,
      onChange: (v) => { state.toolsSelOnly = !!v; }
    });

    const send = btn("送る", "vqs-ai__btn--primary", async () => {
      const prompt = String(text || "").trim();
      if (!prompt) { toast("直したい所を書いてください", "warn"); return; }
      const R = ai.refine;
      if (!R || typeof R.refine !== "function") { toast("追い注文の部品（ai/refine.js）を読み込めませんでした。", "error"); return; }
      state.chat.push({ role: "user", text: prompt });
      paintChat();
      busy(true, "考えています…");
      try {
        const sel = state.toolsSelOnly ? selectedClipIds() : null;
        if (state.toolsSelOnly && (!sel || !sel.length)) {
          state.chat.push({ role: "ai", text: "クリップが選ばれていません。タイムラインで選んでから、もう一度送ってください。" });
          paintChat(); busy(false); return;
        }
        const out = await R.refine({
          prompt, project: project(), selection: sel || undefined,
          llm: llmOn() ? ai.llm : null
        });
        const ops = (out && out.ops) || [];
        if (!ops.length) {
          state.chat.push({
            role: "ai",
            text: (out && out.summary) || "言われた事を編集に置き換えられませんでした。",
            warnings: (out && out.warnings) || []
          });
        } else {
          const n = applyOps(ops, (out && out.summary) || "AI 自動編集");
          state.chat.push({
            role: "ai", text: (out && out.summary) || (n + " 件直しました"),
            warnings: (out && out.warnings) || [], applied: n > 0
          });
        }
        paintChat();
      } catch (e) {
        if (e && e.name === "AbortError") { busy(false); return; }
        state.chat.push({ role: "ai", text: "失敗しました: " + msgOf(e) });
        paintChat();
      } finally { busy(false); }
    });

    const foot = mk("div", "vqs-ai__foot");
    foot.append(mk("span", "vqs-ai__thinking"), send);
    sec.append(log, ex, area, row("", onlySel), foot);
    host.append(sec);
  }

  function selectedClipIds() {
    const s = store.selection || {};
    return Array.isArray(s.clipIds) ? s.clipIds.slice() : [];
  }

  /* ══ 5. 道具 ═════════════════════════════════════════════════ */

  function renderTools(host) {
    const tools = ai.tools || null;
    const sec = section("道具（この端末だけで動きます）");
    if (!tools) {
      sec.append(mk("p", "vqs-ai__empty", "道具（ai/tools.js）を読み込めませんでした。再読み込みしてみてください。"));
      host.append(sec);
      return;
    }
    sec.append(row("", wToggle({
      label: "選択中のクリップだけに効かせる", value: state.toolsSelOnly,
      onChange: (v) => { state.toolsSelOnly = !!v; }
    })));
    const defs = TOOL_DEFS.filter((t) => typeof tools[t.fn] === "function");
    if (!defs.length) {
      sec.append(mk("p", "vqs-ai__empty", "使える道具が見つかりませんでした。"));
      host.append(sec);
      return;
    }
    const list = mk("div", "vqs-ai__tools");
    list.setAttribute("data-test", "ai-tools");
    for (const def of defs) list.append(toolCard(tools, def));
    sec.append(list);
    host.append(sec);
  }

  function knobValue(def, k) {
    const bag = state.toolKnobs[def.fn] || (state.toolKnobs[def.fn] = Object.create(null));
    if (bag[k.key] !== undefined) return bag[k.key];
    const D = (ai.tools && ai.tools.AUTO_DEFAULTS) || null;
    let v = k.value;
    if (D && Array.isArray(k.from) && D[k.from[0]] && D[k.from[0]][k.from[1]] !== undefined) {
      v = D[k.from[0]][k.from[1]];
    }
    bag[k.key] = num(v, 0);
    return bag[k.key];
  }

  function toolCard(tools, def) {
    const card = mk("div", "vqs-ai__tool");
    card.setAttribute("data-tool", def.fn);
    card.append(mk("h4", "vqs-ai__toolname", def.title));
    card.append(mk("p", "vqs-ai__tooldesc", def.desc));
    const knobs = mk("div", "vqs-ai__knobs");
    for (const k of def.knobs || []) {
      knobs.append(wSlider({
        label: k.label, min: k.min, max: k.max, step: k.step, unit: k.unit,
        value: knobValue(def, k),
        onInput: (v) => { state.toolKnobs[def.fn][k.key] = num(v, 0); }
      }));
    }
    card.append(knobs);
    const out = mk("div", "vqs-ai__toolout");
    const go = btn("試す", "vqs-ai__btn--primary vqs-ai__btn--sm", () => {
      out.textContent = "";
      out.append(mk("span", "vqs-ai__thinking2", "考えています…"));
      /* 道具は同期（pure）。1 frame 置いて「考えています」を見せる */
      requestAnimationFrame(() => runTool(tools, def, out));
    });
    const acts = mk("div", "vqs-ai__toolacts");
    acts.append(go);
    card.append(acts, out);
    return card;
  }

  function runTool(tools, def, out) {
    const opts = Object.assign(Object.create(null), state.toolKnobs[def.fn] || {});
    if (state.toolsSelOnly) {
      const ids = selectedClipIds();
      if (!ids.length) {
        out.textContent = "";
        out.append(mk("p", "vqs-ai__fail", "クリップが選ばれていません。タイムラインで選んでください。"));
        return;
      }
      opts.clipIds = ids;
    }
    if (def.fn === "autoReframe" && !opts.ratio) {
      opts.ratio = String((project().settings && project().settings.ratio) || "9:16");
    }
    let res = null;
    try { res = tools[def.fn](project(), opts); }
    catch (e) {
      out.textContent = "";
      out.append(mk("p", "vqs-ai__fail", "できませんでした: " + msgOf(e)));
      return;
    }
    const ops = (res && res.ops) || [];
    const warnings = (res && res.warnings) || [];
    out.textContent = "";
    if (!ops.length) {
      out.append(mk("p", "vqs-ai__fail", (res && res.summary) || "変えられる所がありませんでした。"));
      for (const w of warnings.slice(0, 4)) out.append(mk("p", "vqs-ai__failsub", String(w)));
      return;
    }
    const n = applyOps(ops, (res && res.summary) || def.title);
    if (n <= 0) return;
    const card = mk("div", "vqs-ai__card vqs-ai__card--sm");
    card.append(mk("strong", "vqs-ai__cardtitle", String((res && res.summary) || (n + " 件変えました"))));
    for (const w of warnings.slice(0, 4)) card.append(mk("p", "vqs-ai__cardsub", String(w)));
    const acts = mk("div", "vqs-ai__acts");
    acts.append(btn("取消", "vqs-ai__btn--ghost vqs-ai__btn--sm", undoLast));
    card.append(acts);
    out.append(card);
  }

  /* ══ 6. 殻（タブ・モーダル / シート）════════════════════════ */

  function renderBody() {
    if (!state.body) return;
    state.body.textContent = "";
    state.stageEl = null;
    state.resultEl = null;
    if (state.mode === "refine") renderRefine(state.body);
    else if (state.mode === "tools") renderTools(state.body);
    else renderCreate(state.body);
    paintTabs();
  }

  let tabBtns = [];
  function paintTabs() {
    for (const t of tabBtns) {
      const on = t.mode === state.mode;
      t.el.classList.toggle("is-on", on);
      t.el.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function buildRoot() {
    const root = mk("div", "vqs-ai");
    root.setAttribute("data-test", "ai-panel");
    const tabs = mk("nav", "vqs-ai__tabs");
    tabs.setAttribute("role", "tablist");
    tabBtns = [];
    for (const t of [["create", "作る"], ["refine", "直す"], ["tools", "道具"]]) {
      const b = mk("button", "vqs-ai__tab", t[1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("data-test", "ai-tab-" + t[0]);
      b.addEventListener("click", () => {
        if (state.busy) { toast("いま動いています。終わるか中止してから切り替えてください。", "warn"); return; }
        state.mode = t[0];
        renderBody();
      });
      tabs.append(b);
      tabBtns.push({ mode: t[0], el: b });
    }
    root.append(tabs);
    state.body = mk("div", "vqs-ai__body");
    root.append(state.body);
    state.root = root;
    return root;
  }

  const isMobile = () => {
    try {
      if (window.matchMedia && window.matchMedia(MOBILE_Q).matches) return true;
    } catch (e) { /* 判定できなければ端末能力へ */ }
    try { return !!caps().touch && window.innerWidth < 1024; } catch (e) { return false; }
  };

  /**
   * 画面を出す。
   * @param {"create"|"refine"|"tools"} [mode]
   */
  function open(mode) {
    const m = mode === "refine" || mode === "tools" ? mode : "create";
    state.mode = m;
    if (state.layer) { renderBody(); return; }
    const root = buildRoot();
    renderBody();
    const title = "AI 自動編集";
    const openFn = isMobile() ? W("openSheet") : W("openModal");
    if (openFn) {
      state.layer = openFn({
        title, content: root, height: "full", className: "vqs-ai__shell",
        onClose: () => { state.layer = null; if (state.abort) cancel(); }
      });
    } else {
      /* widgets が読めない時の最後の砦（画面を出さないより出す）*/
      const veil = mk("div", "vqs-ai__fallback");
      veil.append(root);
      const x = btn("閉じる", "vqs-ai__btn--ghost", () => close());
      root.prepend(x);
      document.body.append(veil);
      state.layer = { close: () => { try { veil.remove(); } catch (e) { /* noop */ } state.layer = null; }, el: veil };
    }
    /* 注文欄に焦点（モバイルでは出さない: 鍵盤が画面を潰す）*/
    if (!isMobile() && m === "create") {
      const ta = root.querySelector("textarea");
      if (ta) { try { ta.focus(); } catch (e) { /* noop */ } }
    }
  }

  function close() {
    const l = state.layer;
    state.layer = null;
    if (l && typeof l.close === "function") { try { l.close("api"); } catch (e) { /* noop */ } }
    if (state.abort) { try { state.abort.abort(); } catch (e) { /* noop */ } state.abort = null; }
    busy(false);
  }

  function dispose() {
    if (reTimer) { clearTimeout(reTimer); reTimer = 0; }
    close();
    state.root = null;
    state.body = null;
    state.stageEl = null;
    state.resultEl = null;
    state.last = null;
    state.chat = [];
    tabBtns = [];
  }

  return { open, close, dispose };
}

export default createAiPanel;
