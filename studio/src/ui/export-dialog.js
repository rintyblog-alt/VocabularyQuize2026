/* ══════════════════════════════════════════════════════════════════════
   ui/export-dialog.js — 書き出しの画面（契約書 §11 を漏れなく画面に出す）

   ★ 何をする所か
     「書き出し」ボタンから開く 1 枚の画面。契約書 §11 の 8 項目
     （動画 / 静止画 / 音声 / GIF / 字幕 / プロジェクト / EDL / 共通の
     進捗・中止・失敗・共有）を **タブ 6 枚**に割って全部出す。
     実際の書き出しは export/exporter.js が持っているので、ここは
     「聞く・見せる・進捗を出す・出来た物を渡す」だけをする。

   ★ なぜこの形か
     ・端末で使えない選択肢を **消さずに無効化して理由を添える**。
       消すと「mp4 が無い」ことに利用者が気付けず、webm を出して
       iPhone で再生できないと後で分かる（契約書 §13.1 の壁）。
       理由は exporter.capabilities()（実際に聞いた結果）と
       core/caps.js（captureStream の有無）の両方から作る。UA では決めない。
     ・書き出し中に画面を閉じても **続く**。job は閉じる処理から切り離し、
       進捗は #saveState（無ければ #topbar）に小さく残す。
       exporter は DOM に依らないので、画面を消しても走り続ける。
     ・設定は「preset の札 → 各つまみ」の順。札を押すと つまみの値へ
       流し込む（preset を «別の道» にすると、押した後につまみを触った時に
       どちらが勝つのか分からなくなる）。
     ・compositor / sources / audio は ctx から渡す（契約書 §12-1。
       プレビューの物を使い回す＝二重に作って iOS のデコーダを食わない）。

   ★ 触るときの注意
     ・exporter / widgets / ctx は **無いことが在る**（app.js の safe() は
       部品が落ちても画面を起こす）。必ず存在を見てから呼ぶ。
     ・store.project を直接書き換えない。書き出しは snapshot() を渡す。
     ・close() は中止ではない。中止は「中止」ボタン（AbortController）だけ。
     ・CONTRACT-NOTE: このファイルは §0 の「700 行で分ける」を超えている。
       §11 の 8 項目を 1 つの画面に **漏れなく**出すのが今回の担当範囲で、
       分割先（ui/export-tabs.js / ui/export-progress.js）は他の担当の
       ファイルになるため作らなかった。次に触る人が分ける境目はここ:
         §5（各タブの中身）→ ui/export-tabs.js
         §6（実行・進捗・完了・失敗）→ ui/export-progress.js
       §3（開閉と端末能力）と §7（履歴）を残せば 300 行を切る。
   ══════════════════════════════════════════════════════════════════════ */

import { scope } from "../core/log.js";
import { finite, clamp, clampInt, formatBytes, formatDuration } from "../core/util.js";
import { humanDuration } from "../core/time.js";
import { caps as deviceCaps } from "../core/caps.js";

const L = scope("export-ui");

/* ── 1. 定数 ───────────────────────────────────────────────────── */

/** タブ（契約書 §11 の 1〜6。EDL は「プロジェクト」の中に置く＝§11.7） */
const TABS = [
  { value: "video", label: "動画", icon: "video" },
  { value: "still", label: "静止画", icon: "image" },
  { value: "audio", label: "音声", icon: "music" },
  { value: "gif", label: "GIF", icon: "gif" },
  { value: "subtitle", label: "字幕", icon: "text" },
  { value: "project", label: "プロジェクト", icon: "archive" },
];

/** 解像度の段（契約書 §11.1）。height だけ渡すと exporter が比率から幅を出す */
const RES_ITEMS = [
  { value: "source", label: "元のまま" },
  { value: "2160", label: "2160p (4K)" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
];

/** fps の段（契約書 §11.1） */
const FPS_ITEMS = [
  { value: "source", label: "元のまま" },
  { value: "24", label: "24" }, { value: "25", label: "25" },
  { value: "30", label: "30" }, { value: "50", label: "50" }, { value: "60", label: "60" },
];

const QUALITY_ITEMS = [
  { value: "low", label: "低" }, { value: "normal", label: "標準" },
  { value: "high", label: "高" }, { value: "max", label: "最高" },
];

const AUDIO_ITEMS = [
  { value: "include", label: "含める" }, { value: "none", label: "無音" }, { value: "only", label: "音声のみ" },
];

const MODE_ITEMS = [
  { value: "auto", label: "自動" },
  { value: "precise", label: "高精度" },
  { value: "realtime", label: "実時間録画" },
];

/** 進捗の段の呼び名（契約書 §11.8 で並べた stage） */
const STAGE_LABEL = {
  prepare: "準備しています", video: "映像を書き出しています", audio: "音を作っています",
  still: "画像を書き出しています", mux: "1 つのファイルに詰めています",
  finalize: "仕上げています", assets: "素材を詰めています", done: "終わりました",
};

const HISTORY_KEY = "vqstudio.export.history.v1";
const HISTORY_MAX = 5;
const MOBILE_Q = "(max-width: 1023px)";

/* ── 2. 小道具（DOM）──────────────────────────────────────────── */

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

function button(cls, label, onClick) {
  const b = h("button", cls, label);
  b.type = "button";
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** ラベル + 操作 + 注記（設定の 1 枠。CSS が 2 列に並べる） */
function field(label, control, hint) {
  const el = h("div", "vqs-exfield");
  el.append(h("div", "vqs-exfield__label", label));
  const body = h("div", "vqs-exfield__body");
  if (control) body.append(control.el && control.el.nodeType === 1 ? control.el : control);
  el.append(body);
  if (hint) el.append(h("div", "vqs-exfield__hint", hint));
  return el;
}

/** 使えない選択肢に理由を貼る（segmented / select が data-value を持つ） */
function markDisabled(rootEl, value, reason) {
  if (!rootEl) return;
  const q = `[data-value="${String(value).replace(/"/g, "")}"]`;
  const hits = rootEl.querySelectorAll ? rootEl.querySelectorAll(q) : [];
  for (const b of hits) {
    b.disabled = true;
    b.classList.add("vqs-exopt--off");
    b.title = reason;
    b.setAttribute("aria-disabled", "true");
  }
  if (rootEl.tagName === "SELECT" || (rootEl.querySelector && rootEl.querySelector("select"))) {
    const sel = rootEl.tagName === "SELECT" ? rootEl : rootEl.querySelector("select");
    for (const op of sel.options || []) {
      if (String(op.value) === String(value)) { op.disabled = true; op.label = `${op.textContent}（使えません）`; }
    }
  }
}

/* ── 3. 本体 ───────────────────────────────────────────────────── */

/**
 * 書き出しの画面を作る（契約書 §7 の UI 契約どおりの入口）。
 * @param {{store:any, els:any, widgets:any, exporter:any, ctx:any}} deps
 * @returns {{open:(tab?:string)=>void, close:()=>void, dispose:()=>void}}
 */
export function createExportDialog(deps) {
  const d = deps || {};
  const store = d.store;
  const els = d.els || {};
  const W = d.widgets || {};
  const exporter = d.exporter || null;
  const ctx = d.ctx || {};

  const toast = (msg, o) => {
    if (typeof W.toast === "function") { try { return W.toast(msg, o); } catch (_e) { /* 続ける */ } }
    return null;
  };

  /** 画面の状態（設定は開き直しても残す＝毎回やり直しにしない） */
  const S = {
    tab: "video",
    caps: null,
    video: {
      presetId: null, res: "1080", fps: "source", quality: "normal",
      container: "mp4", range: "all", audio: "include", mode: "auto",
    },
    still: { when: "current", at: 0, type: "image/png", quality: 0.92, res: "source", count: 1, sequence: false },
    audio: { format: "wav", tracks: null, normalize: false },
    gif: { fps: 12, width: 480, loop: 0, dither: true, range: "all" },
    subtitle: { format: "srt", trackId: "", wrap: 32 },
    project: { includeAssets: true },
  };

  /** 走っている書き出し（画面を閉じても生き残る） */
  let job = null;
  let layer = null;       // openModal / openSheet の返り値
  let bodyEl = null;      // 画面の中身の入れ物
  let disposed = false;
  let ambientSaved = null;
  let history = loadHistory();

  /* ── 3.1 開閉 ─────────────────────────────────────────────── */

  function isMobile() {
    try { return window.matchMedia(MOBILE_Q).matches; } catch (_e) { return false; }
  }

  function open(tab) {
    if (disposed) return;
    if (!exporter || typeof exporter.planExport !== "function") {
      toast("書き出しの部品（export/exporter.js）を読み込めませんでした", { kind: "error" });
      return;
    }
    if (typeof tab === "string" && TABS.some((t) => t.value === tab)) S.tab = tab;
    if (layer) { render(); return; }

    bodyEl = h("div", "vqs-ex");
    const opts = {
      title: "書き出し",
      content: bodyEl,
      className: "vqs-ex-layer",
      /* 暗幕や Esc で閉じられた時もここを通る。**中止はしない**
         （契約書 §11 の「書き出し中に画面を閉じても続くこと」）。
         離れた DOM へ描き続けないよう bodyEl も手放し、
         走っている物は topbar の小さな進捗へ移す。 */
      onClose: () => {
        layer = null;
        bodyEl = null;
        progressRefs = null;
        if (job && job.running) paintAmbient();
      },
    };
    try {
      layer = isMobile() && typeof W.openSheet === "function"
        ? W.openSheet(Object.assign({ height: "full" }, opts))
        : typeof W.openModal === "function"
          ? W.openModal(Object.assign({ width: 720 }, opts))
          : null;
    } catch (e) {
      L.error("書き出し画面を開けませんでした", e);
      layer = null;
    }
    if (!layer) { toast("書き出し画面を開けませんでした", { kind: "error" }); return; }
    render();
    void ensureCaps();
  }

  function close() {
    // ここで中止はしない（契約書の「書き出し中に画面を閉じても続くこと」）
    if (layer && layer.close) { try { layer.close("api"); } catch (_e) { /* 既に閉じている */ } }
    layer = null;
    bodyEl = null;
    if (job && job.running) paintAmbient();
  }

  function dispose() {
    disposed = true;
    close();
    clearAmbient();
  }

  /* ── 3.2 端末の能力 ───────────────────────────────────────── */

  async function ensureCaps() {
    if (S.caps) return S.caps;
    /** @type {any} */
    let c = null;
    try {
      if (typeof exporter.capabilities === "function") c = await exporter.capabilities();
    } catch (e) { L.warn("capabilities() が失敗しました", e); }
    let dev = {};
    try { dev = deviceCaps() || {}; } catch (_e) { dev = {}; }
    const containers = (c && Array.isArray(c.containers)) ? c.containers : ["mp4", "webm", "wav", "gif", "png", "jpeg"];
    const recorders = (c && Array.isArray(c.mediaRecorder)) ? c.mediaRecorder : [];
    S.caps = {
      containers,
      notes: (c && Array.isArray(c.notes)) ? c.notes : [],
      preciseAvailable: c ? !!c.preciseAvailable : !!dev.videoEncoder,
      /* 実時間録画は「MediaRecorder が在る」だけでは足りない。
         iOS は canvas.captureStream が無いので絵を渡せない（契約書 §13.1）。 */
      realtimeAvailable: !!dev.captureStream && (recorders.length > 0 || !!dev.mediaRecorder),
      iOS: !!dev.iOS,
      share: !!(globalThis.navigator && typeof navigator.share === "function"),
    };
    if (!S.caps.realtimeAvailable && S.video.mode === "realtime") S.video.mode = "auto";
    if (!S.caps.containers.includes("mp4") && S.video.container === "mp4") S.video.container = "webm";
    if (layer) render();
    return S.caps;
  }

  function reasonFor(key) {
    const c = S.caps || {};
    if (key === "mp4") return "この端末は mp4 の書き出しに対応していません（webm でお試しください）";
    if (key === "webm") return "この端末は webm の書き出しに対応していません";
    if (key === "realtime") {
      return c.iOS
        ? "iPhone / iPad は実時間録画（canvas.captureStream）に対応していません。高精度で書き出します"
        : "この端末は実時間録画（MediaRecorder）に対応していません";
    }
    if (key === "precise") return "この端末は WebCodecs（高精度）に対応していません。実時間録画で書き出します";
    return "この端末では使えません";
  }

  /* ── 3.3 画面を描く ───────────────────────────────────────── */

  function render() {
    if (!bodyEl) return;
    bodyEl.textContent = "";
    bodyEl.append(tabBar());
    const main = h("div", "vqs-ex__main");
    bodyEl.append(main);

    if (job && job.running) { main.append(progressPanel()); return; }
    if (job && job.result) { main.append(resultPanel(job)); return; }
    if (job && job.error) { main.append(errorPanel(job)); return; }

    try {
      if (S.tab === "video") main.append(videoTab());
      else if (S.tab === "still") main.append(stillTab());
      else if (S.tab === "audio") main.append(audioTab());
      else if (S.tab === "gif") main.append(gifTab());
      else if (S.tab === "subtitle") main.append(subtitleTab());
      else main.append(projectTab());
    } catch (e) {
      L.error("書き出し画面の描画で失敗", e);
      main.append(noteBox("error", [`画面を組み立てられませんでした: ${e && e.message ? e.message : e}`]));
    }
    main.append(historyPanel());
  }

  function tabBar() {
    const nav = h("nav", "vqs-extabs");
    nav.setAttribute("role", "tablist");
    for (const t of TABS) {
      const b = button("vqs-extab" + (S.tab === t.value ? " vqs-extab--on" : ""), t.label, () => {
        S.tab = t.value;
        if (job && !job.running) job = null;   // 別のタブへ行くときは結果を片付ける
        render();
      });
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", S.tab === t.value ? "true" : "false");
      b.dataset.test = `export-tab-${t.value}`;
      nav.append(b);
    }
    return nav;
  }

  function noteBox(kind, lines) {
    const box = h("div", `vqs-exnote vqs-exnote--${kind}`);
    for (const t of (lines || []).filter(Boolean)) box.append(h("p", "vqs-exnote__line", t));
    return box;
  }

  function seg(items, value, onChange, label) {
    if (typeof W.segmented === "function") {
      const el = W.segmented({ items, value, onChange, label });
      return el && el.nodeType === 1 ? el : (el && el.el) || h("div");
    }
    const wrap = h("div", "vqs-seg");
    for (const it of items) {
      const b = button("vqs-seg__item" + (String(it.value) === String(value) ? " vqs-seg__item--on" : ""), it.label,
        () => onChange(it.value));
      b.setAttribute("data-value", String(it.value));
      wrap.append(b);
    }
    return wrap;
  }

  function sel(items, value, onChange, label) {
    if (typeof W.select === "function") {
      const el = W.select({ items, value, onChange, label: "" });
      return el && el.nodeType === 1 ? el : (el && el.el) || h("div");
    }
    const s = h("select", "vqs-select");
    for (const it of items) {
      const op = h("option", "", it.label);
      op.value = String(it.value);
      s.append(op);
    }
    s.value = String(value);
    s.setAttribute("aria-label", String(label || "選択"));
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }

  function sw(value, onChange, label) {
    if (typeof W.toggle === "function") {
      const el = W.toggle({ value, onChange, label: "" });
      return el && el.nodeType === 1 ? el : (el && el.el) || h("div");
    }
    const b = button("vqs-toggle" + (value ? " vqs-toggle--on" : ""), value ? "入" : "切", () => onChange(!value));
    b.setAttribute("aria-label", String(label || "切り替え"));
    return b;
  }

  function grid(children) {
    const g = h("div", "vqs-exgrid");
    for (const c of children) if (c) g.append(c);
    return g;
  }

  /* ── 4. 範囲とプロジェクト ────────────────────────────────── */

  function project() {
    if (!store) return null;
    try { return typeof store.snapshot === "function" ? store.snapshot() : store.project; }
    catch (e) { L.warn("project を取れませんでした", e); return store.project || null; }
  }

  /** 選べる範囲（全体 / イン〜アウト / 選択クリップ）。契約書 §11.1 */
  function rangeItems() {
    const v = (store && store.view) || {};
    const hasInOut = v.inPoint !== null && v.inPoint !== undefined && v.outPoint !== null && v.outPoint !== undefined;
    const sel2 = (store && store.selection) || {};
    const hasSel = Array.isArray(sel2.clipIds) && sel2.clipIds.length > 0;
    return [
      { value: "all", label: "全体" },
      { value: "inout", label: "イン〜アウト", disabled: !hasInOut },
      { value: "selection", label: "選択クリップ", disabled: !hasSel },
    ];
  }

  function rangeOf(kind) {
    const p = project();
    if (!p) return null;
    if (kind === "inout") {
      const v = (store && store.view) || {};
      if (v.inPoint === null || v.outPoint === null || v.inPoint === undefined || v.outPoint === undefined) return null;
      return { start: finite(v.inPoint, 0), end: finite(v.outPoint, 0) };
    }
    if (kind === "selection") {
      const ids = new Set((((store && store.selection) || {}).clipIds) || []);
      if (!ids.size) return null;
      let s = Infinity, e = -Infinity;
      for (const tr of (p.tracks || [])) {
        for (const c of ((tr && tr.clips) || [])) {
          if (!c || !ids.has(c.id)) continue;
          s = Math.min(s, finite(c.start, 0));
          e = Math.max(e, finite(c.start, 0) + finite(c.duration, 0));
        }
      }
      if (!(e > s)) return null;
      return { start: s, end: e };
    }
    return null;   // 全体は exporter に任せる
  }

  /** 音を持ちうるトラック（契約書 §11.3 の「特定トラックのみ・BGM 抜き」） */
  function audioTracks() {
    const p = project();
    const out = [];
    for (const tr of ((p && p.tracks) || [])) {
      if (!tr || tr.kind === "adjust") continue;
      const hasAudio = (tr.clips || []).some((c) => c && (c.kind === "audio" || c.kind === "video"));
      if (hasAudio || tr.kind === "audio") out.push({ id: tr.id, name: tr.name || tr.id, kind: tr.kind });
    }
    return out;
  }

  /* ── 5. タブの中身 ───────────────────────────────────────── */

  /** 今の設定 → exporter へ渡す opts（tab ごと） */
  function buildOpts(tab) {
    const o = {};
    if (tab === "video") {
      const v = S.video;
      if (v.res !== "source") o.height = Number(v.res);
      if (v.fps !== "source") o.fps = Number(v.fps);
      o.quality = v.quality;
      o.container = v.container;
      o.audio = v.audio;
      o.mode = v.mode;
      if (v.presetId) o.preset = v.presetId;
      const r = rangeOf(v.range);
      if (r) o.range = r;
      return o;
    }
    if (tab === "gif") {
      const g = S.gif;
      o.container = "gif";
      o.fps = clampInt(g.fps, 10, 15);
      o.width = clampInt(g.width, 64, 1280);
      o.loop = clampInt(g.loop, 0, 65535);
      o.dither = !!g.dither;
      o.audio = "none";
      const r = rangeOf(g.range);
      if (r) o.range = r;
      return o;
    }
    if (tab === "still") {
      const s = S.still;
      o.container = s.type === "image/jpeg" ? "jpeg" : "png";
      o.type = s.type;
      o.quality = clamp(finite(s.quality, 0.92), 0.1, 1);
      if (s.res !== "source") o.height = Number(s.res);
      if (s.sequence) {
        o.sequence = true;
        o.maxStills = clampInt(s.count, 1, 600);
        const r = rangeOf("all");
        if (r) o.range = r;
      }
      return o;
    }
    if (tab === "audio") {
      const a = S.audio;
      o.format = a.format;
      if (Array.isArray(a.tracks) && a.tracks.length) o.audioTracks = a.tracks.slice();
      /* CONTRACT-NOTE: 契約書 §11.3 に正規化の口は無い（exporter も今は見ない）。
         画面の指示を落とさないため名前を付けて渡し、対応しない版では
         そのまま書き出される（注記で利用者に伝える）。 */
      o.normalize = !!a.normalize;
      o.targetLufs = -14;
      return o;
    }
    if (tab === "subtitle") return { format: S.subtitle.format, trackId: S.subtitle.trackId || undefined };
    return { includeAssets: !!S.project.includeAssets };
  }

  /** planExport の結果（失敗したら理由を返す） */
  function plan(tab) {
    const p = project();
    if (!p) return { plan: null, error: "プロジェクトが在りません" };
    try {
      const o = buildOpts(tab);
      return { plan: exporter.planExport(p, o), error: null };
    } catch (e) {
      return { plan: null, error: e && e.message ? String(e.message) : String(e) };
    }
  }

  /** 推定時間（planExport の値から出す目安。実測ではない） */
  function estimateMs(pl) {
    if (!pl) return 0;
    if (pl.mode === "realtime") return pl.duration * 1000 * 1.15;
    if (pl.mode === "audio") return Math.max(600, pl.duration * 150);
    const px = Math.max(1, finite(pl.width, 1920) * finite(pl.height, 1080));
    const per = 10 + (px / 92160) * (pl.mode === "gif" ? 2.6 : 1.1);
    return Math.max(800, finite(pl.frames, 1) * per);
  }

  /** 推定の帯（サイズ・時間・フレーム数・警告） */
  function estimateBox(tab) {
    const r = plan(tab);
    const box = h("div", "vqs-exest");
    if (r.error) { box.append(h("div", "vqs-exest__err", r.error)); return box; }
    const pl = r.plan;
    const cell = (k, v) => {
      const c = h("div", "vqs-exest__cell");
      c.append(h("span", "vqs-exest__k", k), h("strong", "vqs-exest__v", v));
      return c;
    };
    box.append(cell("推定サイズ", formatBytes(pl.estimatedBytes)));
    box.append(cell("推定時間", `約 ${humanDuration(estimateMs(pl) / 1000)}`));
    if (pl.frames > 0) box.append(cell("フレーム", `${pl.frames} 枚 / ${pl.fps} fps`));
    box.append(cell("範囲", `${formatDuration(pl.range.start)} 〜 ${formatDuration(pl.range.end)}（${humanDuration(pl.duration)}）`));
    if (pl.warnings && pl.warnings.length) box.append(noteBox("warn", pl.warnings));
    return box;
  }

  /** 実行ボタンの並び */
  function actionRow(label, onRun, extra) {
    const row = h("div", "vqs-exacts");
    const run = button("vqs-btn vqs-btn--primary vqs-exrun", label, onRun);
    run.dataset.test = "export-run";
    row.append(run);
    for (const e of (extra || [])) if (e) row.append(e);
    return row;
  }

  /* 5.1 動画 */
  function videoTab() {
    const wrap = h("div", "vqs-extab-body");
    const c = S.caps || {};

    /* preset の札（横スクロール）＋「おすすめ」印 */
    const p = project();
    let recommended = null;
    try { recommended = typeof exporter.recommendPreset === "function" && p ? exporter.recommendPreset(p) : null; }
    catch (e) { L.warn("recommendPreset が失敗", e); }
    const groups = (() => {
      try {
        if (typeof exporter.presetGroups === "function") return exporter.presetGroups();
      } catch (e) { L.warn("presetGroups が失敗", e); }
      const list = Array.isArray(exporter.PRESETS) ? exporter.PRESETS : [];
      return list.length ? [{ title: "設定", presets: list }] : [];
    })();

    for (const g of groups) {
      wrap.append(h("div", "vqs-exsub", g.title));
      const rail = h("div", "vqs-exrail");
      rail.dataset.test = "export-presets";
      for (const pr of (g.presets || [])) {
        const card = button("vqs-excard" + (S.video.presetId === pr.id ? " vqs-excard--on" : ""), "", () => applyPresetToUi(pr));
        card.append(h("span", "vqs-excard__name", pr.name));
        const meta = pr.width && pr.height ? `${pr.width}×${pr.height}${pr.fps ? ` / ${pr.fps}fps` : ""}` : (pr.container || "").toUpperCase();
        card.append(h("span", "vqs-excard__meta", meta));
        if (pr.note) card.append(h("span", "vqs-excard__note", pr.note));
        if (pr.id === recommended) card.append(h("span", "vqs-exbadge", "おすすめ"));
        const cont = String(pr.container || "mp4");
        /* capabilities() を聞き終わる前（c.containers が無い）は塞がない。
           「まだ分からない物」を先に無効化すると、開いた直後だけ全部
           押せない画面になる（聞き終わったら render し直す）。 */
        if ((cont === "mp4" || cont === "webm") && Array.isArray(c.containers) && !c.containers.includes(cont)) {
          card.disabled = true;
          card.classList.add("vqs-exopt--off");
          card.title = reasonFor(cont);
        }
        rail.append(card);
      }
      wrap.append(rail);
    }

    /* つまみ（2 列。狭い時は CSS が 1 列にする） */
    const resEl = sel(RES_ITEMS, S.video.res, (v) => { S.video.res = v; S.video.presetId = null; render(); }, "解像度");
    const fpsEl = seg(FPS_ITEMS, S.video.fps, (v) => { S.video.fps = v; S.video.presetId = null; render(); }, "fps");
    const qEl = seg(QUALITY_ITEMS, S.video.quality, (v) => { S.video.quality = v; render(); }, "画質");
    const contEl = seg([{ value: "mp4", label: "mp4" }, { value: "webm", label: "webm" }],
      S.video.container, (v) => { S.video.container = v; S.video.presetId = null; render(); }, "形式");
    const rangeEl = seg(rangeItems(), S.video.range, (v) => { S.video.range = v; render(); }, "範囲");
    const audioEl = seg(AUDIO_ITEMS, S.video.audio, (v) => { S.video.audio = v; render(); }, "音声");
    const modeEl = seg(MODE_ITEMS, S.video.mode, (v) => { S.video.mode = v; render(); }, "方式");

    for (const cont of ["mp4", "webm"]) {
      if (Array.isArray(c.containers) && !c.containers.includes(cont)) markDisabled(contEl, cont, reasonFor(cont));
    }
    if (c.realtimeAvailable === false) markDisabled(modeEl, "realtime", reasonFor("realtime"));
    if (c.preciseAvailable === false) markDisabled(modeEl, "precise", reasonFor("precise"));

    wrap.append(grid([
      field("解像度", resEl),
      field("フレームレート", fpsEl),
      field("画質", qEl, "ビットレートは解像度と fps から自動で決めます"),
      field("形式", contEl, c.containers && !c.containers.includes("mp4") ? reasonFor("mp4") : ""),
      field("範囲", rangeEl),
      field("音声", audioEl),
      field("方式", modeEl,
        S.video.mode === "realtime"
          ? "実時間録画は「速いが近似」です（尺どおりの時間が掛かります）"
          : "高精度（WebCodecs）が既定です。使えないときは自動で録画へ落ちます"),
    ]));

    const notes = (c.notes || []).slice();
    if (notes.length) wrap.append(noteBox("info", notes));
    wrap.append(estimateBox("video"));
    wrap.append(actionRow("書き出す", () => runVideo()));
    return wrap;
  }

  function applyPresetToUi(pr) {
    if (!pr) return;
    S.video.presetId = pr.id;
    const cont = String(pr.container || "mp4");
    if (cont === "wav" || (cont === "webm" && pr.codec === "opus")) {
      S.audio.format = cont === "wav" ? "wav" : "webm";
      S.tab = "audio";
      render();
      return;
    }
    if (cont === "gif") {
      if (pr.fps) S.gif.fps = clampInt(pr.fps, 10, 15);
      if (pr.width) S.gif.width = clampInt(pr.width, 64, 1280);
      S.tab = "gif";
      render();
      return;
    }
    if (cont === "png" || cont === "jpeg") {
      S.still.type = cont === "jpeg" ? "image/jpeg" : "image/png";
      if (pr.height) S.still.res = String(pr.height);
      S.tab = "still";
      render();
      return;
    }
    S.video.container = cont === "webm" ? "webm" : "mp4";
    S.video.res = pr.height ? String(pr.height) : "source";
    S.video.fps = pr.fps ? String(pr.fps) : "source";
    render();
  }

  /* 5.2 静止画（契約書 §11.2） */
  function stillTab() {
    const wrap = h("div", "vqs-extab-body");
    const s = S.still;
    const whenEl = seg([{ value: "current", label: "現在フレーム" }, { value: "at", label: "任意の時刻" }],
      s.when, (v) => { s.when = v; render(); }, "時刻");
    const atEl = h("input", "vqs-input vqs-exnum");
    atEl.type = "number";
    atEl.step = "0.04";
    atEl.min = "0";
    atEl.value = String(s.when === "current" ? currentTime() : s.at);
    atEl.disabled = s.when !== "at";
    atEl.setAttribute("aria-label", "書き出す時刻（秒）");
    atEl.addEventListener("change", () => { s.at = Math.max(0, finite(atEl.value, 0)); });

    const typeEl = seg([{ value: "image/png", label: "PNG" }, { value: "image/jpeg", label: "JPEG" }],
      s.type, (v) => { s.type = v; render(); }, "形式");
    const qEl = typeof W.slider === "function"
      ? W.slider({ min: 0.3, max: 1, step: 0.01, value: s.quality, onInput: (v) => { s.quality = v; }, unit: "" })
      : (() => { const i = h("input", "vqs-input"); i.type = "range"; i.min = "0.3"; i.max = "1"; i.step = "0.01"; i.value = String(s.quality); i.addEventListener("input", () => { s.quality = finite(i.value, 0.92); }); return i; })();
    const resEl = sel(RES_ITEMS, s.res, (v) => { s.res = v; render(); }, "解像度");
    const seqEl = sw(s.sequence, (v) => { s.sequence = v; render(); }, "連番");
    const countEl = h("input", "vqs-input vqs-exnum");
    countEl.type = "number";
    countEl.min = "1";
    countEl.max = "600";
    countEl.value = String(clampInt(s.count, 1, 600));
    countEl.disabled = !s.sequence;
    countEl.setAttribute("aria-label", "連番の枚数");
    countEl.addEventListener("change", () => { s.count = clampInt(finite(countEl.value, 1), 1, 600); render(); });

    wrap.append(grid([
      field("どの絵を出すか", whenEl),
      field("時刻（秒）", atEl, s.when === "current" ? `いまの再生位置: ${formatDuration(currentTime(), { decimals: 2 })}` : ""),
      field("形式", typeEl),
      field("JPEG の品質", qEl, s.type === "image/jpeg" ? "1 に近いほど綺麗で重くなります" : "PNG では使いません"),
      field("解像度", resEl),
      field("連番で出す", seqEl, "範囲の全体から等間隔で書き出します（ZIP は作りません）"),
      field("枚数", countEl),
    ]));
    if (s.sequence) wrap.append(estimateBox("still"));
    wrap.append(actionRow(s.sequence ? `${clampInt(s.count, 1, 600)} 枚書き出す` : "この 1 枚を書き出す", () => runStill()));
    return wrap;
  }

  function currentTime() {
    const t = ctx && ctx.transport;
    if (t) {
      try {
        if (typeof t.time === "number") return t.time;
        if (typeof t.getTime === "function") return finite(t.getTime(), 0);
      } catch (_e) { /* 続ける */ }
    }
    return finite(((store && store.view) || {}).playhead, 0);
  }

  /* 5.3 音声（契約書 §11.3） */
  function audioTab() {
    const wrap = h("div", "vqs-extab-body");
    const a = S.audio;
    const fmtEl = seg([{ value: "wav", label: "wav（無圧縮）" }, { value: "webm", label: "webm（Opus）" }],
      a.format, (v) => { a.format = v; render(); }, "形式");
    const list = audioTracks();
    const box = h("div", "vqs-extracks");
    if (!list.length) box.append(h("p", "vqs-exnote__line", "音を持つトラックが見つかりません"));
    for (const tr of list) {
      const on = !Array.isArray(a.tracks) || a.tracks.includes(tr.id);
      const lb = h("label", "vqs-extrack" + (on ? " vqs-extrack--on" : ""));
      const cb = h("input", "vqs-excheck");
      cb.type = "checkbox";
      cb.checked = on;
      cb.addEventListener("change", () => {
        const ids = Array.isArray(a.tracks) ? a.tracks.slice() : list.map((x) => x.id);
        const i = ids.indexOf(tr.id);
        if (cb.checked && i < 0) ids.push(tr.id);
        if (!cb.checked && i >= 0) ids.splice(i, 1);
        a.tracks = ids.length === list.length ? null : ids;
        render();
      });
      lb.append(cb, h("span", "vqs-extrack__name", `${tr.name}（${tr.kind}）`));
      box.append(lb);
    }
    const normEl = sw(a.normalize, (v) => { a.normalize = v; render(); }, "音量を揃える");
    wrap.append(grid([
      field("形式", fmtEl, a.format === "webm" ? "端末が Opus に対応していないときは wav になります" : ""),
      field("−14 LUFS に揃える", normEl, "配信向けの標準音量。対応していない版では そのまま書き出します"),
    ]));
    wrap.append(h("div", "vqs-exsub", "混ぜるトラック（外すと BGM 抜きになります）"), box);
    wrap.append(estimateBox("audio"));
    wrap.append(actionRow("音声を書き出す", () => runAudio()));
    return wrap;
  }

  /* 5.4 GIF（契約書 §11.4） */
  function gifTab() {
    const wrap = h("div", "vqs-extab-body");
    const g = S.gif;
    const fpsEl = seg([{ value: 10, label: "10" }, { value: 12, label: "12" }, { value: 15, label: "15" }],
      g.fps, (v) => { g.fps = clampInt(v, 10, 15); render(); }, "fps");
    const wEl = sel([
      { value: 240, label: "240px" }, { value: 320, label: "320px" }, { value: 480, label: "480px" },
      { value: 640, label: "640px" }, { value: 800, label: "800px" },
    ], g.width, (v) => { g.width = clampInt(v, 64, 1280); render(); }, "幅");
    const loopEl = seg([{ value: 0, label: "無限" }, { value: 1, label: "1 回" }, { value: 3, label: "3 回" }],
      g.loop, (v) => { g.loop = clampInt(v, 0, 65535); render(); }, "ループ");
    const ditherEl = sw(g.dither, (v) => { g.dither = v; render(); }, "ディザ");
    const rangeEl = seg(rangeItems(), g.range, (v) => { g.range = v; render(); }, "範囲");
    wrap.append(grid([
      field("フレームレート", fpsEl),
      field("幅", wEl, "高さは比率から決まります"),
      field("ループ", loopEl),
      field("ディザ（色のざらつきでごまかす）", ditherEl, "写真は入れた方が綺麗・イラストは切った方が締まります"),
      field("範囲", rangeEl, "GIF に音は入りません"),
    ]));
    wrap.append(estimateBox("gif"));
    wrap.append(actionRow("GIF を書き出す", () => runGif()));
    return wrap;
  }

  /* 5.5 字幕（契約書 §11.5） */
  function subtitleTab() {
    const wrap = h("div", "vqs-extab-body");
    const s = S.subtitle;
    const p = project();
    const trackItems = [{ value: "", label: "すべての文字クリップ" }];
    for (const tr of ((p && p.tracks) || [])) {
      if (!tr) continue;
      if (tr.kind === "overlay" || (tr.clips || []).some((c) => c && c.kind === "text")) {
        trackItems.push({ value: tr.id, label: tr.name || tr.id });
      }
    }
    const fmtEl = seg([{ value: "srt", label: "SRT" }, { value: "vtt", label: "VTT" }],
      s.format, (v) => { s.format = v; render(); }, "形式");
    const trEl = sel(trackItems, s.trackId, (v) => { s.trackId = v; render(); }, "対象トラック");
    const wrapEl = sel([
      { value: 0, label: "折返さない" }, { value: 20, label: "20 文字" },
      { value: 28, label: "28 文字" }, { value: 32, label: "32 文字" }, { value: 40, label: "40 文字" },
    ], s.wrap, (v) => { s.wrap = clampInt(v, 0, 200); render(); }, "折返し");

    let preview = "";
    try {
      const text = typeof exporter.buildSubtitles === "function"
        ? exporter.buildSubtitles(p, { format: s.format, trackId: s.trackId || undefined })
        : "";
      preview = wrapText(text, s.wrap).split("\n").slice(0, 12).join("\n");
    } catch (e) { preview = `字幕を作れませんでした: ${e && e.message ? e.message : e}`; }

    wrap.append(grid([
      field("形式", fmtEl),
      field("対象トラック", trEl),
      field("折返し", wrapEl, "1 行がこの文字数を超えたら折り返します"),
    ]));
    wrap.append(h("div", "vqs-exsub", "中身の確認（先頭だけ）"));
    wrap.append(h("pre", "vqs-expre", preview || "（字幕になる文字クリップが在りません）"));
    wrap.append(actionRow("字幕を書き出す", () => runSubtitles()));
    return wrap;
  }

  /** 折返し（字幕の 1 行を n 文字で折る。単語境界は空白だけ見る） */
  function wrapText(text, n) {
    const w = clampInt(finite(n, 0), 0, 200);
    if (!w || !text) return String(text || "");
    return String(text).split("\n").map((line) => {
      if (/^\d+$/.test(line) || line.indexOf("-->") >= 0 || line.length <= w) return line;
      const out = [];
      let cur = "";
      for (const ch of line) {
        cur += ch;
        if (cur.length >= w) { out.push(cur); cur = ""; }
      }
      if (cur) out.push(cur);
      return out.join("\n");
    }).join("\n");
  }

  /* 5.6 プロジェクト（契約書 §11.6 / §11.7） */
  function projectTab() {
    const wrap = h("div", "vqs-extab-body");
    const incEl = sw(S.project.includeAssets, (v) => { S.project.includeAssets = v; render(); }, "素材を含める");
    const p = project();
    const assetCount = ((p && p.assets) || []).length;
    let bytes = 0;
    for (const a of ((p && p.assets) || [])) bytes += finite(a && a.size, 0);
    wrap.append(grid([
      field("素材を含める", incEl,
        S.project.includeAssets
          ? `素材 ${assetCount} 個（およそ ${formatBytes(bytes)}）を 1 ファイルに詰めます`
          : "編集内容だけ。開いた先で素材をつなぎ直す必要があります"),
    ]));
    wrap.append(h("div", "vqs-exsub", ".vqstudio（そのまま開き直せる形）"));
    wrap.append(actionRow("プロジェクトを保存", () => runProject()));
    wrap.append(h("div", "vqs-exsub", "EDL（編集内容の JSON。共有・AI の再現用）"));
    wrap.append(actionRow("EDL を書き出す", () => runEDL()));
    return wrap;
  }

  /* ── 6. 実行と進捗 ───────────────────────────────────────── */

  /** ctx から合成の道具を借りる（契約書 §12-1） */
  function tools() {
    const o = {};
    if (ctx.compositor) o.compositor = ctx.compositor;
    if (ctx.sources) o.sources = ctx.sources;
    if (ctx.audio) o.audioEngine = ctx.audio;
    if (ctx.storage) o.storage = ctx.storage;
    return o;
  }

  /**
   * 書き出しを始める。画面を閉じても続く（job は layer と切り離す）。
   * @param {{kind:string, label:string, tab:string, run:(onProgress:Function, signal:any)=>Promise<any>}} spec
   */
  function startJob(spec) {
    if (job && job.running) { toast("すでに書き出しています", { kind: "warn" }); return; }
    const ctrl = typeof AbortController === "function" ? new AbortController() : { signal: null, abort() { } };
    job = {
      running: true, kind: spec.kind, label: spec.label, tab: spec.tab, ctrl,
      p: 0, frame: 0, frames: 0, stage: "prepare", startedAt: Date.now(),
      result: null, error: null, spec,
    };
    render();
    paintAmbient();
    const onProgress = (p, info) => {
      if (!job) return;
      job.p = clamp(finite(p, 0), 0, 1);
      if (info) {
        if (info.frame !== undefined) job.frame = clampInt(finite(info.frame, 0), 0, 1e9);
        if (info.frames !== undefined) job.frames = clampInt(finite(info.frames, 0), 0, 1e9);
        if (info.stage) job.stage = String(info.stage);
        if (info.etaMs !== undefined) job.etaMs = finite(info.etaMs, 0);
      }
      paintProgress();
      paintAmbient();
    };
    Promise.resolve()
      .then(() => spec.run(onProgress, ctrl.signal))
      .then((res) => {
        if (!job) return;
        job.running = false;
        job.result = normalizeResult(res, spec);
        pushHistory(job);
        clearAmbient();
        if (layer) render();
        else toast(`${spec.label}が終わりました`, { kind: "ok" });
      })
      .catch((e) => {
        if (!job) return;
        job.running = false;
        const aborted = e && (e.name === "AbortError" || e.code === 20);
        job.error = aborted ? { message: "中止しました", aborted: true } : {
          message: e && e.message ? String(e.message) : String(e),
          code: (e && e.code) || "FAILED", aborted: false,
        };
        clearAmbient();
        if (layer) render();
        else toast(aborted ? "書き出しを中止しました" : `書き出しに失敗しました: ${job.error.message}`, { kind: aborted ? "warn" : "error" });
      });
  }

  /** 返り値をひと並びに揃える（Blob / 結果 object / 連番の配列） */
  function normalizeResult(res, spec) {
    const items = [];
    const warnings = [];
    if (!res) return { items, warnings };
    if (Array.isArray(res)) {
      for (const x of res) if (x && x.blob) items.push({ blob: x.blob, filename: x.filename || "still.png" });
    } else if (res instanceof Blob) {
      items.push({ blob: res, filename: spec.filename || "export.bin" });
    } else {
      if (res.blob) items.push({ blob: res.blob, filename: res.filename || spec.filename || "export.bin" });
      if (Array.isArray(res.stills) && res.stills.length > 1) {
        for (const x of res.stills.slice(1)) if (x && x.blob) items.push({ blob: x.blob, filename: x.filename });
      }
      if (res.audio) items.push({ blob: res.audio, filename: res.audioFilename || "audio.wav" });
      if (Array.isArray(res.warnings)) warnings.push(...res.warnings);
      if (res.mode) warnings.push(res.mode === "realtime" ? "実時間録画で書き出しました（尺が僅かにずれることが在ります）" : "");
    }
    return { items, warnings: warnings.filter(Boolean), raw: res };
  }

  function filenameFor(container, label) {
    try {
      if (typeof exporter.buildFilename === "function") {
        return exporter.buildFilename(project(), { container, label });
      }
    } catch (e) { L.warn("buildFilename が失敗", e); }
    return `export.${container}`;
  }

  function runVideo() {
    const o = Object.assign(buildOpts("video"), tools());
    startJob({
      kind: "video", label: "動画の書き出し", tab: "video",
      run: (onProgress, signal) => exporter.exportVideo(project(), Object.assign({}, o, { onProgress, signal })),
    });
  }

  function runGif() {
    const o = Object.assign(buildOpts("gif"), tools());
    startJob({
      kind: "gif", label: "GIF の書き出し", tab: "gif",
      run: (onProgress, signal) => exporter.exportVideo(project(), Object.assign({}, o, { onProgress, signal })),
    });
  }

  function runStill() {
    const s = S.still;
    const o = Object.assign(buildOpts("still"), tools());
    if (s.sequence) {
      startJob({
        kind: "stills", label: "連番の書き出し", tab: "still",
        run: (onProgress, signal) => exporter.exportStillSequence(project(), Object.assign({}, o, { onProgress, signal })),
      });
      return;
    }
    const t = s.when === "at" ? finite(s.at, 0) : currentTime();
    startJob({
      kind: "still", label: "静止画の書き出し", tab: "still",
      filename: filenameFor(s.type === "image/jpeg" ? "jpeg" : "png", "still"),
      run: (onProgress, signal) => {
        onProgress(0.2, { stage: "still" });
        return exporter.exportStill(project(), t, Object.assign({}, o, { signal }));
      },
    });
  }

  function runAudio() {
    const o = Object.assign(buildOpts("audio"), tools());
    startJob({
      kind: "audio", label: "音声の書き出し", tab: "audio",
      filename: filenameFor(S.audio.format === "webm" ? "webm" : "wav", "audio"),
      run: (onProgress, signal) => exporter.exportAudio(project(), Object.assign({}, o, { onProgress, signal, warningsOut: [] })),
    });
  }

  function runSubtitles() {
    const s = S.subtitle;
    startJob({
      kind: "subtitle", label: "字幕の書き出し", tab: "subtitle",
      filename: filenameFor(s.format === "vtt" ? "vtt" : "srt", "sub").replace(/\.(mp4|bin)$/, `.${s.format}`),
      run: (onProgress) => {
        onProgress(0.5, { stage: "finalize" });
        const p = project();
        if (typeof exporter.buildSubtitles === "function") {
          const text = wrapText(exporter.buildSubtitles(p, { format: s.format, trackId: s.trackId || undefined }), s.wrap);
          const type = `${s.format === "vtt" ? "text/vtt" : "application/x-subrip"};charset=utf-8`;
          return Promise.resolve(new Blob([text], { type }));
        }
        return Promise.resolve(exporter.exportSubtitles(p, { format: s.format, trackId: s.trackId || undefined }));
      },
    });
  }

  function runProject() {
    const o = Object.assign(buildOpts("project"), tools());
    startJob({
      kind: "project", label: "プロジェクトの保存", tab: "project",
      filename: `${(project() || {}).name || "project"}.vqstudio`,
      run: (onProgress, signal) => exporter.exportProject(project(), Object.assign({}, o, { onProgress, signal })),
    });
  }

  function runEDL() {
    startJob({
      kind: "edl", label: "EDL の書き出し", tab: "project",
      filename: `${(project() || {}).name || "project"}.edl.json`,
      run: (onProgress) => {
        onProgress(0.6, { stage: "finalize" });
        if (typeof exporter.exportEDL === "function") return Promise.resolve(exporter.exportEDL(project()));
        const json = JSON.stringify(exporter.buildEDL(project()), null, 2);
        return Promise.resolve(new Blob([json], { type: "application/json;charset=utf-8" }));
      },
    });
  }

  /* 6.1 進捗の画面（太いバー + 円形リング） */
  let progressRefs = null;

  function progressPanel() {
    const wrap = h("div", "vqs-exprog");
    const ring = typeof W.progressRing === "function" ? W.progressRing({ value: job.p, size: 96 }) : null;
    const ringEl = ring && (ring.nodeType === 1 ? ring : ring.el);
    if (ringEl) wrap.append(ringEl);
    const right = h("div", "vqs-exprog__body");
    const title = h("div", "vqs-exprog__title", job.label);
    const stage = h("div", "vqs-exprog__stage", STAGE_LABEL[job.stage] || job.stage);
    const bar = h("div", "vqs-exbar");
    const fill = h("i", "vqs-exbar__fill");
    fill.style.width = `${Math.round(job.p * 100)}%`;
    bar.append(fill);
    bar.setAttribute("role", "progressbar");
    const meta = h("div", "vqs-exprog__meta");
    right.append(title, stage, bar, meta);
    wrap.append(right);
    const stop = button("vqs-btn vqs-btn--danger vqs-exstop", "中止", () => {
      try { job.ctrl.abort(); } catch (_e) { /* 既に終わっている */ }
    });
    stop.dataset.test = "export-abort";
    wrap.append(stop);
    progressRefs = { fill, meta, stage, ring: ring && ring.set ? ring : null };
    paintProgress();
    return wrap;
  }

  function paintProgress() {
    if (!progressRefs || !job || !layer) return;
    const r = progressRefs;
    try {
      r.fill.style.width = `${Math.round(job.p * 100)}%`;
      r.stage.textContent = STAGE_LABEL[job.stage] || job.stage;
      if (r.ring) r.ring.set(job.p);
      const parts = [`${Math.round(job.p * 100)}%`];
      if (job.frames > 0) parts.push(`${job.frame} / ${job.frames} フレーム`);
      const eta = etaMs();
      if (eta > 0) parts.push(`残り 約 ${humanDuration(eta / 1000)}`);
      r.meta.textContent = parts.join(" ・ ");
    } catch (e) { L.warn("進捗を描けませんでした", e); }
  }

  function etaMs() {
    if (!job) return 0;
    if (job.etaMs > 0) return job.etaMs;
    const el = Date.now() - job.startedAt;
    if (job.p <= 0.02 || el < 1200) return 0;
    return Math.max(0, el / job.p - el);
  }

  /* 6.2 画面を閉じている間の小さな進捗（#saveState か topbar） */
  function ambientHost() {
    const sv = document.getElementById("saveState");
    if (sv) return { el: sv, own: false };
    const tb = els.topbar || document.getElementById("topbar");
    if (!tb) return null;
    let mine = tb.querySelector(".vqs-exambient");
    if (!mine) {
      mine = h("span", "vqs-exambient");
      tb.append(mine);
    }
    return { el: mine, own: true };
  }

  function paintAmbient() {
    if (layer || !job || !job.running) return;
    const host = ambientHost();
    if (!host) return;
    if (ambientSaved === null && !host.own) ambientSaved = host.el.textContent;
    host.el.classList.add("vqs-exambient--on");
    host.el.textContent = `書き出し ${Math.round(job.p * 100)}%`;
    host.el.title = "書き出し中です（押すと画面を開きます）";
    if (!host.el.dataset.exBound) {
      host.el.dataset.exBound = "1";
      host.el.addEventListener("click", () => open(job ? job.tab : "video"));
    }
  }

  function clearAmbient() {
    const host = ambientHost();
    if (!host) return;
    host.el.classList.remove("vqs-exambient--on");
    if (host.own) { try { host.el.remove(); } catch (_e) { /* noop */ } }
    else if (ambientSaved !== null) { host.el.textContent = ambientSaved; ambientSaved = null; }
  }

  /* 6.3 完了と失敗 */
  function resultPanel(j) {
    const wrap = h("div", "vqs-exdone");
    const items = j.result.items;
    const total = items.reduce((n, x) => n + finite(x.blob && x.blob.size, 0), 0);
    wrap.append(h("div", "vqs-exdone__mark", "✓"));
    wrap.append(h("div", "vqs-exdone__title", `${j.label}が終わりました`));
    wrap.append(h("div", "vqs-exdone__meta",
      items.length > 1 ? `${items.length} ファイル ・ ${formatBytes(total)}` : `${items[0] ? items[0].filename : ""} ・ ${formatBytes(total)}`));
    if (j.result.warnings.length) wrap.append(noteBox("warn", j.result.warnings));

    const row = h("div", "vqs-exacts");
    const dl = button("vqs-btn vqs-btn--primary", items.length > 1 ? "すべてダウンロード" : "ダウンロード", () => deliverAll(items, false));
    dl.dataset.test = "export-download";
    row.append(dl);
    if (S.caps && S.caps.share) row.append(button("vqs-btn", "共有", () => deliverAll(items, true)));
    row.append(button("vqs-btn", "もう一度", () => { const spec = j.spec; job = null; render(); startJob(spec); }));
    row.append(button("vqs-btn vqs-btn--ghost", "閉じる", () => { job = null; close(); }));
    wrap.append(row);
    return wrap;
  }

  function errorPanel(j) {
    const wrap = h("div", "vqs-exfail");
    wrap.append(h("div", "vqs-exfail__mark", j.error.aborted ? "—" : "!"));
    wrap.append(h("div", "vqs-exfail__title", j.error.aborted ? "書き出しを中止しました" : "書き出しに失敗しました"));
    wrap.append(h("p", "vqs-exfail__msg", j.error.message));
    const row = h("div", "vqs-exacts");
    if (!j.error.aborted && (j.kind === "video" || j.kind === "gif")) {
      row.append(button("vqs-btn vqs-btn--primary", "別の方式で試す", () => {
        S.video.mode = S.video.mode === "realtime" ? "precise" : "realtime";
        if (!(S.caps && S.caps.realtimeAvailable) && S.video.mode === "realtime") S.video.mode = "precise";
        job = null;
        S.tab = "video";
        render();
        runVideo();
      }));
    }
    row.append(button("vqs-btn", "設定に戻る", () => { job = null; render(); }));
    row.append(button("vqs-btn vqs-btn--ghost", "閉じる", () => { job = null; close(); }));
    wrap.append(row);
    return wrap;
  }

  /** 出来た物を渡す（共有が使えれば共有・それ以外はダウンロード） */
  async function deliverAll(items, preferShare) {
    for (const it of items) {
      if (!it || !it.blob) continue;
      let done = false;
      if (preferShare && typeof exporter.deliver === "function") {
        try { done = await exporter.deliver(it.blob, it.filename); }
        catch (e) { L.warn("共有に失敗", e); }
      }
      if (!done) download(it.blob, it.filename);
      await new Promise((r) => setTimeout(r, items.length > 1 ? 220 : 0));
    }
  }

  function download(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = h("a", "");
      a.href = url;
      a.download = String(filename || "export.bin").replace(/[\\/]+/g, "_");
      a.rel = "noopener";
      a.style.display = "none";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_e) { /* noop */ } }, 10000);
    } catch (e) {
      L.error("ダウンロードできませんでした", e);
      toast("ダウンロードできませんでした", { kind: "error" });
    }
  }

  /* ── 7. 履歴（直近 5 件）───────────────────────────────────── */

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, HISTORY_MAX) : [];
    } catch (_e) { return []; }
  }

  function pushHistory(j) {
    const items = j.result.items;
    const size = items.reduce((n, x) => n + finite(x.blob && x.blob.size, 0), 0);
    const entry = {
      name: items.length > 1 ? `${j.label}（${items.length} ファイル）` : (items[0] ? items[0].filename : j.label),
      size, at: Date.now(), kind: j.kind, tab: j.tab,
      settings: JSON.parse(JSON.stringify(S[j.tab] || {})),
    };
    history = [entry].concat(history.filter((x) => x && x.at !== entry.at)).slice(0, HISTORY_MAX);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_e) { /* 保存できなくても続ける */ }
  }

  function historyPanel() {
    const wrap = h("div", "vqs-exhist");
    wrap.append(h("div", "vqs-exsub", "最近の書き出し"));
    if (!history.length) { wrap.append(h("p", "vqs-exhist__empty", "まだ在りません")); return wrap; }
    for (const e of history) {
      const row = h("div", "vqs-exhist__row");
      row.append(h("span", "vqs-exhist__name", e.name || "書き出し"));
      row.append(h("span", "vqs-exhist__size", formatBytes(e.size)));
      row.append(h("span", "vqs-exhist__at", new Date(finite(e.at, Date.now())).toLocaleString("ja-JP")));
      row.append(button("vqs-btn vqs-btn--sm", "もう一度", () => {
        if (e.settings && S[e.tab]) Object.assign(S[e.tab], e.settings);
        S.tab = e.tab || "video";
        job = null;
        render();
        if (e.tab === "video") runVideo();
        else if (e.tab === "gif") runGif();
        else if (e.tab === "still") runStill();
        else if (e.tab === "audio") runAudio();
        else if (e.tab === "subtitle") runSubtitles();
        else if (e.kind === "edl") runEDL();
        else runProject();
      }));
      wrap.append(row);
    }
    return wrap;
  }

  return { open, close, dispose };
}

export default createExportDialog;
