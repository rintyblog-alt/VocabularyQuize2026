/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/home.js — プロジェクト一覧（起動して最初に触る画面）

   ★ ここでやること（契約書 §7 / C14）
     ① 上段: ロゴ・検索・並べ替え（更新順/名前/尺）・表示切替・アカウント
     ② 始め方: 「新しいプロジェクト（比率を選ぶ）」「素材を選んで始める」
        「AI にまかせる」「プロジェクトを読み込む（.vqstudio）」「テンプレート」
     ③ 一覧: storage.listProjects() の要約を格子で並べる。押すと onOpen(id)。
        長押し / 右クリックで 複製・名前変更・削除（確認つき）
     ④ 下段: 保存容量（storage.estimate）とヘルプ（短絡キー一覧）
     ⑤ 空のとき: 説明 + 「サンプルで試す」（assets/video/demoo.mp4 を 3 分割）

   ★ なぜこの形か
     ここは «起動直後に必ず通る所» なので、欠けている部品が在っても
     「新しいプロジェクト」だけは必ず押せるようにしてある。
     storage が無い / import.js が無い / ai-panel が無い —— どれも画面を殺さない。
     重い物（templates / project-file / commands）は **動的 import** で読む。
     静的 import にすると 1 個の読み込み失敗で一覧ごと消えるため。

   ★ 触るときの注意
     ・DOM は `#homeScreen`（index.html の id、変えない）の中だけに作る。
     ・表示の出し入れ（.hidden）は ui/app.js の仕事。show() は中身を作り直すだけ。
     ・objectURL は state.urls に必ず積む（dispose で revoke）。
     ・storage / widgets の口はすべて「在るか確かめてから呼ぶ」。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { formatBytes } from "../core/util.js";
import { warn } from "../core/log.js";

/* ══ §1 定数 ═══════════════════════════════════════════════════════ */

/** 新規作成で選べる比率（契約書 §1 の RATIOS のうち最初に出す 5 つ） */
export const HOME_RATIOS = Object.freeze([
  Object.freeze({ value: "16:9", label: "16:9", note: "YouTube・横長", w: 16, h: 9 }),
  Object.freeze({ value: "9:16", label: "9:16", note: "ショート・縦", w: 9, h: 16 }),
  Object.freeze({ value: "1:1", label: "1:1", note: "正方", w: 1, h: 1 }),
  Object.freeze({ value: "4:5", label: "4:5", note: "SNS 縦", w: 4, h: 5 }),
  Object.freeze({ value: "custom", label: "自由", note: "後から変えられる", w: 16, h: 10 })
]);

/** 並べ替えの種類 */
export const HOME_SORTS = Object.freeze([
  Object.freeze({ value: "updated", label: "更新順" }),
  Object.freeze({ value: "name", label: "名前" }),
  Object.freeze({ value: "duration", label: "尺" })
]);

/** サンプル素材（repo の置き方が変わっても拾えるよう複数試す） */
const DEMO_URLS = Object.freeze(["/assets/video/demoo.mp4", "../assets/video/demoo.mp4", "./assets/video/demoo.mp4"]);
const VIEW_KEY = "vqstudio.home.view";
const SORT_KEY = "vqstudio.home.sort";
const SKELETON_COUNT = 6;

/* ══ §2 小さな道具（DOM と書式。純関数だけ）═══════════════════════ */

function EL(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}
function BTN(cls, text, test) {
  const b = EL("button", cls, text);
  b.type = "button";
  if (test) b.setAttribute("data-test", test);
  return b;
}
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function has(fn) { return typeof fn === "function"; }
function normText(s) { return String(s || "").toLowerCase(); }
function msgOf(e) { return !e ? "原因不明" : (typeof e === "string" ? e : String(e.message || e)); }

/** 秒 → "1:02" / "1:02:03" */
export function fmtDur(sec) {
  const s = Math.max(0, Math.round(num(sec, 0)));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return (h > 0 ? h + ":" : "") + mm + ":" + String(r).padStart(2, "0");
}

/** 最終更新を人の言葉に（0 や未設定は "—"） */
export function fmtWhen(ms) {
  const t = num(ms, 0);
  if (t <= 0) return "—";
  const d = Date.now() - t;
  if (d < 60000) return "たった今";
  const min = Math.floor(d / 60000);
  if (min < 60) return min + " 分前";
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + " 時間前";
  const day = Math.floor(hour / 24);
  if (day < 7) return day + " 日前";
  const dt = new Date(t);
  return (dt.getMonth() + 1) + "/" + dt.getDate();
}

/** 名前から安定した色を作る（サムネが無いとき。同じ名前は必ず同じ色） */
export function tintFor(name) {
  const s = String(name || "無題");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const hue = h % 360, sat = 42 + ((h >>> 9) % 26);
  return { a: `hsl(${hue} ${sat}% 34%)`, b: `hsl(${(hue + 38) % 360} ${sat}% 19%)` };
}
function initialOf(name) { const s = String(name || "").trim(); return s ? s.slice(0, 1) : "無"; }

/* ══ §3 本体 ═══════════════════════════════════════════════════════ */

/**
 * プロジェクト一覧の画面を作る。
 * @param {{store?:Object, storage?:Object, els?:Object, widgets?:Object, auth?:Object,
 *          onOpen?:(id:string)=>any, onNew?:(o:Object)=>any, ctx?:Object}} o
 * @returns {{show:Function, hide:Function, refresh:Function, dispose:Function}}
 */
export function createHomeScreen(o) {
  const cfg = o || {};
  const storage = cfg.storage || null;
  const auth = cfg.auth || null;
  const W = cfg.widgets || null;
  const ctx = cfg.ctx || {};
  const onOpen = has(cfg.onOpen) ? cfg.onOpen : null;
  const onNew = has(cfg.onNew) ? cfg.onNew : null;

  /* ── 3.1 土台 ─────────────────────────────────────────────────── */

  function readLS(key, d) { try { return localStorage.getItem(key) || d; } catch (e) { return d; } }
  function writeLS(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) { /* 諦める */ } }
  function toast(msg, opt) {
    if (W && has(W.toast)) { try { return W.toast(msg, opt); } catch (e) { /* 下へ */ } }
    warn("home", String(msg));
    return null;
  }
  function closeToast(t) { if (t && has(t.close)) { try { t.close(); } catch (e) { /* noop */ } } }
  function isNarrow() { try { return window.matchMedia("(max-width: 1023px)").matches; } catch (e) { return false; } }
  function mountFallback() {
    /* index.html に #homeScreen が無い環境（試験など）でも壊れない */
    const d = EL("div", "vqs-home");
    d.id = "homeScreen";
    d.setAttribute("data-test", "home-screen");
    if (document.body) document.body.appendChild(d);
    return d;
  }

  const root = (cfg.els && cfg.els.homeScreen) || document.getElementById("homeScreen") || mountFallback();
  const state = {
    built: false, alive: true, loading: false, tplLoaded: false,
    query: "", sort: readLS(SORT_KEY, "updated"), view: readLS(VIEW_KEY, "grid"),
    items: [], urls: [], offs: []
  };
  /** @type {Record<string, any>} */
  const ui = {};

  /** 生きている store（新規作成の直後に入れ替わるので、その場で取り直す） */
  function storeOf() {
    if (ctx.app && ctx.app.store) return ctx.app.store;
    return ctx.store || cfg.store || null;
  }
  /** 取り込み係（編集画面が起きた後にだけ在る） */
  function importerOf() {
    if (ctx.importer) return ctx.importer;
    if (ctx.app && ctx.app.parts && ctx.app.parts.importer) return ctx.app.parts.importer;
    return null;
  }
  function on(el, ev, fn, opt) {
    if (!el) return;
    el.addEventListener(ev, fn, opt);
    state.offs.push(() => { try { el.removeEventListener(ev, fn, opt); } catch (e) { /* noop */ } });
  }

  /* ── 3.2 画面の骨 ─────────────────────────────────────────────── */

  function build() {
    if (state.built) return;
    root.classList.add("vqs-home");
    root.innerHTML = "";

    const top = EL("header", "vqs-home__top");
    const brand = EL("div", "vqs-home__brand");
    brand.append(EL("span", "vqs-home__brand-a", "VQ"), EL("span", "vqs-home__brand-b", "Studio"));
    const search = EL("label", "vqs-home__search");
    const si = EL("input", "vqs-home__search-input");
    si.type = "search";
    si.placeholder = "プロジェクトを探す";
    si.setAttribute("aria-label", "プロジェクトを探す");
    si.setAttribute("data-test", "home-search");
    on(si, "input", () => { state.query = si.value; paintList(); });
    search.append(EL("span", "vqs-home__search-ico", "⌕"), si);
    const tools = EL("div", "vqs-home__tools");
    tools.append(sortControl(), viewControl());
    ui.account = BTN("vqs-home__account", "", "home-account");
    on(ui.account, "click", () => accountMenu(ui.account));
    top.append(brand, search, tools, ui.account);

    const scroll = EL("div", "vqs-home__scroll");
    scroll.setAttribute("data-test", "home-scroll");
    scroll.append(startSection());
    ui.tplSec = EL("section", "vqs-home__sec vqs-home__sec--tpl hidden");
    ui.tpls = EL("div", "vqs-home__tpls");
    ui.tplSec.append(heading("テンプレートから作る"), ui.tpls);
    const listSec = EL("section", "vqs-home__sec vqs-home__sec--list");
    const h = heading("プロジェクト");
    ui.count = EL("span", "vqs-home__count", "");
    h.append(ui.count);
    ui.grid = EL("div", "vqs-home__grid");
    ui.grid.setAttribute("data-test", "home-grid");
    ui.empty = EL("div", "vqs-home__empty hidden");
    ui.empty.setAttribute("data-test", "home-empty");
    listSec.append(h, ui.grid, ui.empty);
    scroll.append(ui.tplSec, listSec);

    const foot = EL("footer", "vqs-home__foot");
    ui.usage = EL("span", "vqs-home__usage", "");
    ui.usage.setAttribute("data-test", "home-usage");
    const help = BTN("vqs-home__link", "短絡キーとヘルプ", "home-help");
    on(help, "click", () => openHelp());
    foot.append(ui.usage, help);

    root.append(top, scroll, foot);
    applyView();
    paintAccount();
    if (auth && has(auth.subscribe)) {
      try { state.offs.push(auth.subscribe(() => paintAccount())); } catch (e) { /* noop */ }
    }
    loadTemplates();
    state.built = true;
  }

  function heading(text) {
    const h = EL("h2", "vqs-home__h");
    h.append(EL("span", "vqs-home__h-text", text));
    return h;
  }

  function sortControl() {
    const items = HOME_SORTS.map((s) => ({ value: s.value, label: s.label }));
    if (W && has(W.segmented)) {
      const seg = W.segmented({
        items, value: state.sort, label: "並べ替え",
        onChange: (v) => { state.sort = String(v); writeLS(SORT_KEY, state.sort); paintList(); }
      });
      const el = seg && seg.el ? seg.el : seg;
      if (el) { el.classList.add("vqs-home__sort"); el.setAttribute("data-test", "home-sort"); }
      return el;
    }
    const wrap = EL("div", "vqs-home__sort");
    wrap.setAttribute("data-test", "home-sort");
    for (const s of items) {
      const b = BTN("vqs-home__sortbtn", s.label);
      b.setAttribute("data-value", s.value);
      b.classList.toggle("vqs-home__sortbtn--on", s.value === state.sort);
      on(b, "click", () => {
        state.sort = s.value;
        writeLS(SORT_KEY, s.value);
        wrap.querySelectorAll(".vqs-home__sortbtn").forEach((x) =>
          x.classList.toggle("vqs-home__sortbtn--on", x.getAttribute("data-value") === s.value));
        paintList();
      });
      wrap.append(b);
    }
    return wrap;
  }

  function viewControl() {
    const b = BTN("vqs-home__viewbtn", "", "home-view");
    const paint = () => {
      b.textContent = state.view === "list" ? "≣" : "▦";
      b.title = state.view === "list" ? "格子で見る" : "一覧で見る";
      b.setAttribute("aria-label", b.title);
    };
    on(b, "click", () => {
      state.view = state.view === "list" ? "grid" : "list";
      writeLS(VIEW_KEY, state.view);
      paint();
      applyView();
    });
    paint();
    return b;
  }

  function applyView() {
    if (!ui.grid) return;
    ui.grid.classList.toggle("vqs-home__grid--list", state.view === "list");
    root.setAttribute("data-view", state.view);
  }

  /* ── 3.3 始め方の段 ───────────────────────────────────────────── */

  function startSection() {
    const sec = EL("section", "vqs-home__sec vqs-home__sec--start");
    const big = BTN("vqs-home__new", "", "home-new");
    const col = EL("span", "vqs-home__new-col");
    col.append(EL("span", "vqs-home__new-title", "新しいプロジェクト"),
      EL("span", "vqs-home__new-sub", "比率を選んで始める"));
    big.append(EL("span", "vqs-home__new-plus", "＋"), col);
    on(big, "click", () => pickRatio().then((r) => { if (r) startNew({ ratio: r }); }));

    const row = EL("div", "vqs-home__starts");
    /* CONTRACT-NOTE: 契約は「importer が無ければボタンを出さない」だが、一覧の時点では
       まだ importer を作れない（store が無い）。そこで «import.js が読めるか» で判断する。 */
    ui.startAssets = startCard("素材を選んで始める", "端末の動画・写真を並べる", "home-start-assets", startWithAssets);
    ui.startAssets.classList.add("hidden");
    hasImporterModule().then((ok) => { if (state.alive && ok && ui.startAssets) ui.startAssets.classList.remove("hidden"); });
    row.append(ui.startAssets);
    row.append(startCard("AI にまかせる", "素材と一言から自動で組む", "home-start-ai", startWithAi));
    row.append(startCard("プロジェクトを読み込む", ".vqstudio を開く", "home-start-file", pickProjectFile));
    sec.append(big, row);
    return sec;
  }

  function startCard(title, sub, test, fn) {
    const b = BTN("vqs-home__start", "", test);
    b.append(EL("span", "vqs-home__start-title", title), EL("span", "vqs-home__start-sub", sub));
    on(b, "click", fn);
    return b;
  }

  function hasImporterModule() {
    if (importerOf()) return Promise.resolve(true);
    return import("./import.js").then((m) => !!(m && m.createImporter)).catch(() => false);
  }

  /** 比率を選ぶ。@returns {Promise<string|null>} やめたら null */
  function pickRatio() {
    const body = EL("div", "vqs-home__ratios");
    let closer = null;
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      for (const r of HOME_RATIOS) {
        const b = BTN("vqs-home__ratio", "");
        b.setAttribute("data-test", "home-ratio-" + r.value);
        const box = EL("span", "vqs-home__ratio-box");
        box.style.setProperty("--vqs-home-ar", r.w + " / " + r.h);
        b.append(box, EL("span", "vqs-home__ratio-label", r.label), EL("span", "vqs-home__ratio-note", r.note));
        b.addEventListener("click", () => { fin(r.value); if (closer && has(closer.close)) closer.close("pick"); });
        body.append(b);
      }
      const opts = {
        title: "比率を選ぶ", content: body, height: 0.5, className: "vqs-modal--ratio",
        onClose: () => fin(null), actions: [{ id: "cancel", label: "やめる" }]
      };
      if (W && has(W.openSheet) && isNarrow()) closer = W.openSheet(opts);
      else if (W && has(W.openModal)) closer = W.openModal(opts);
      else fin("16:9");   /* widgets が無ければ既定で進む（手ぶらにしない） */
    });
  }

  /* ── 3.4 始める（新規 / 素材 / AI）───────────────────────────── */

  async function startNew(opts) {
    if (!onNew) { toast("新規作成の口が渡されていません", { kind: "error" }); return null; }
    try { return await onNew(opts || {}); }
    catch (e) { toast("作成できませんでした: " + msgOf(e), { kind: "error" }); return null; }
  }

  async function startWithAssets() {
    const ratio = await pickRatio();
    if (!ratio) return;
    if (!await startNew({ ratio })) return;
    const imp = importerOf();
    if (!imp || !has(imp.pickFiles)) { toast("素材の取り込みが使えません", { kind: "warn" }); return; }
    let res = null;
    try { res = await imp.pickFiles({ place: false }); }
    catch (e) { toast("素材を選べませんでした: " + msgOf(e), { kind: "error" }); return; }
    const ids = addedIds(res);
    if (!ids.length) return;
    const n = placeOnV1(ids);
    if (n > 0) toast(n + " 個の素材を並べました");
  }

  async function startWithAi() {
    const ratio = await pickRatio();
    if (!ratio) return;
    if (!await startNew({ ratio })) return;
    const imp = importerOf();
    if (imp && has(imp.pickFiles)) {
      try {
        const ids = addedIds(await imp.pickFiles({ place: false }));
        if (ids.length) placeOnV1(ids);
      } catch (e) { warn("home", "AI 用の素材取り込みに失敗", e); }
    }
    let text = "";
    if (W && has(W.prompt)) {
      const v = await W.prompt({
        title: "どんな動画にしますか", label: "一言で（例: 旅行の思い出を 1 分で、テンポ良く）",
        placeholder: "テンポ良く 1 分で", multiline: true, okLabel: "AI に渡す"
      });
      if (v === null) return;
      text = String(v || "");
    }
    if (!openAi({ prompt: text, ratio })) {
      toast("自動編集の画面はまだ使えません。先に素材を並べておきました", { kind: "warn" });
    }
  }

  /** ai-panel を開く（口の名前が違っても拾えるよう順に試す。無ければ false） */
  function openAi(payload) {
    const panel = ctx.app && ctx.app.parts ? ctx.app.parts.ai : null;
    if (panel) {
      for (const k of ["open", "show", "start", "run"]) {
        if (has(panel[k])) {
          try { panel[k](payload); return true; }
          catch (e) { warn("home", "AI を開けませんでした", e); return false; }
        }
      }
    }
    const btn = document.getElementById("btnAi");
    if (btn) { try { btn.click(); return true; } catch (e) { /* 下へ */ } }
    return false;
  }

  /** 取り込み結果 → assetId の配列 */
  function addedIds(res) {
    const added = res && Array.isArray(res.added) ? res.added : [];
    const out = [];
    for (const a of added) { const id = a && (a.assetId || a.id); if (id) out.push(String(id)); }
    return out;
  }

  function videoTrack(project) {
    const tracks = project && Array.isArray(project.tracks) ? project.tracks : [];
    for (const t of tracks) if (t && t.kind === "video" && !t.locked) return t;
    for (const t of tracks) if (t && t.kind === "video") return t;
    return null;
  }
  function trackEnd(project, trackId) {
    const tracks = project && Array.isArray(project.tracks) ? project.tracks : [];
    let end = 0;
    for (const t of tracks) {
      if (!t || String(t.id) !== String(trackId)) continue;
      for (const c of (Array.isArray(t.clips) ? t.clips : [])) end = Math.max(end, num(c && c.start, 0) + num(c && c.duration, 0));
    }
    return end;
  }
  function assetById(project, id) {
    const assets = project && Array.isArray(project.assets) ? project.assets : [];
    for (const a of assets) if (a && String(a.id) === String(id)) return a;
    return null;
  }
  /** V1（最初の video トラック）の id。無ければ track.add で作る */
  function ensureV1(st) {
    const tr = videoTrack(st.project);
    if (tr) return String(tr.id);
    const r = st.dispatch("track.add", { kind: "video", name: "V1" });
    let id = String((r && (r.trackId || r.id)) || "");
    if (!id) { const t2 = videoTrack(st.project); if (t2) id = String(t2.id); }
    return id;
  }
  /** 1 取消単位で流す（batch が無い store でも動く） */
  function runBatch(st, label, fn) {
    if (has(st.batch)) return st.batch(label, fn);
    return fn((t, pl) => st.dispatch(t, pl));
  }

  /** V1 の末尾へ順に並べる（契約どおり ops の clip.add を使う） */
  function placeOnV1(assetIds) {
    const st = storeOf();
    if (!st || !has(st.dispatch) || !assetIds.length) return 0;
    let trackId = "";
    try { trackId = ensureV1(st); }
    catch (e) { toast("トラックを用意できませんでした: " + msgOf(e), { kind: "error" }); return 0; }
    if (!trackId) return 0;
    let at = trackEnd(st.project, trackId), n = 0;
    try {
      runBatch(st, "素材を並べる", (d) => {
        for (const id of assetIds) {
          const a = assetById(st.project, id);
          const dur = (a && a.kind === "image") ? 4 : Math.max(0.2, num(a && a.duration, 4));
          let r = null;
          try { r = d("clip.add", { trackId, at, assetId: id, duration: dur, mode: "overwrite" }); }
          catch (e) { warn("home", "並べられなかった素材が在る", e); continue; }
          n++;
          at = r && Number.isFinite(r.start) && Number.isFinite(r.duration) ? r.start + r.duration : at + dur;
        }
      });
    } catch (e) { toast("素材を並べられませんでした: " + msgOf(e), { kind: "error" }); }
    return n;
  }

  /* ── 3.5 .vqstudio を読み込む ─────────────────────────────────── */

  function pickProjectFile() {
    const input = EL("input", "vqs-home__file");
    input.type = "file";
    input.accept = ".vqstudio,application/x-vqstudio";
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const f = input.files && input.files[0] ? input.files[0] : null;
      try { input.remove(); } catch (e) { /* noop */ }
      if (f) loadProjectFile(f);
    }, { once: true });
    try { input.click(); }
    catch (e) {
      try { input.remove(); } catch (e2) { /* noop */ }
      toast("ファイルを選べませんでした", { kind: "error" });
    }
  }

  async function loadProjectFile(file) {
    const t = toast("プロジェクトを読み込んでいます…", { ms: 12000 });
    let mod = null;
    try { mod = await import("../export/project-file.js"); } catch (e) { mod = null; }
    if (!mod || !has(mod.unpackProject)) { closeToast(t); toast("読み込み機能が使えません", { kind: "error" }); return; }
    /* 素材は読みながら保存庫へ入れる（そのまま blob を抱えるとメモリが持たない） */
    const putAsset = storage && has(storage.putAsset) ? async (rec) => {
      const r = await storage.putAsset(rec.blob, { id: rec.id, name: rec.name, kind: rec.kind, mime: rec.mime, size: rec.size });
      const key = r && (r.key || (r.storage && r.storage.key));
      if (!key) throw new Error("保存庫に入れられませんでした");
      return { kind: "idb", key: String(key) };
    } : undefined;

    let res = null;
    try { res = await mod.unpackProject(file, { putAsset }); }
    catch (e) { closeToast(t); toast("読み込めませんでした: " + msgOf(e), { kind: "error" }); return; }
    closeToast(t);
    const project = res && res.project ? res.project : null;
    if (!project) { toast(".vqstudio の中身が読めませんでした", { kind: "error" }); return; }
    if (res.warnings && res.warnings.length) toast(res.warnings[0], { kind: "warn", ms: 7000 });

    if (storage && has(storage.putProject)) {
      try { await storage.putProject(project); }
      catch (e) { toast("保存庫に入れられませんでした: " + msgOf(e), { kind: "warn" }); }
    }
    if (onOpen && project.id && storage) { onOpen(String(project.id)); return; }
    if (ctx.app && has(ctx.app.openProjectObject)) { ctx.app.openProjectObject(project); return; }
    toast("読み込みましたが開けませんでした（保存庫が使えません）", { kind: "warn" });
  }

  /* ── 3.6 テンプレート ─────────────────────────────────────────── */

  function loadTemplates() {
    if (state.tplLoaded) return;
    state.tplLoaded = true;
    import("../ai/templates.js").then((m) => {
      if (!state.alive || !ui.tpls) return;
      const T = m && m.TEMPLATES;
      if (!T) return;
      const ids = Array.isArray(m.TEMPLATE_IDS) ? m.TEMPLATE_IDS : Object.keys(T);
      let n = 0;
      for (const id of ids) { if (T[id]) { ui.tpls.append(templateCard(T[id])); n++; } }
      if (n > 0 && ui.tplSec) ui.tplSec.classList.remove("hidden");
    }).catch(() => { /* テンプレが無くても一覧は使える */ });
  }

  function templateCard(tpl) {
    const b = BTN("vqs-home__tpl", "");
    b.setAttribute("data-test", "home-tpl-" + tpl.id);
    const tint = tintFor(tpl.name || tpl.id);
    b.style.setProperty("--vqs-home-tint-a", tint.a);
    b.style.setProperty("--vqs-home-tint-b", tint.b);
    const face = EL("span", "vqs-home__tpl-face");
    face.append(EL("span", "vqs-home__tpl-dur", Math.round(num(tpl.targetDuration, 60)) + " 秒"));
    b.append(face, EL("span", "vqs-home__tpl-name", String(tpl.name || tpl.id)),
      EL("span", "vqs-home__tpl-desc", String(tpl.description || "")));
    on(b, "click", async () => {
      const ratio = (tpl.style === "short" || tpl.id === "short") ? "9:16" : "16:9";
      if (!await startNew({ ratio, name: String(tpl.name || "無題のプロジェクト") })) return;
      if (!openAi({ templateId: String(tpl.id), template: tpl, ratio })) {
        toast("「" + (tpl.name || tpl.id) + "」で作りました。素材を入れてください");
      }
    });
    return b;
  }

  /* ── 3.7 一覧 ─────────────────────────────────────────────────── */

  async function refresh() {
    if (!state.built) build();
    paintUsage();
    if (!storage || !has(storage.listProjects)) { state.items = []; paintList(); return; }
    state.loading = true;
    paintSkeleton();
    let list = [];
    try { list = await storage.listProjects(); }
    catch (e) { warn("home", "一覧が読めません", e); list = []; }
    if (!state.alive) return;
    state.loading = false;
    state.items = Array.isArray(list) ? list : [];
    paintList();
  }

  function paintSkeleton() {
    if (!ui.grid) return;
    ui.grid.innerHTML = "";
    if (ui.empty) ui.empty.classList.add("hidden");
    for (let i = 0; i < SKELETON_COUNT; i++) {
      const s = EL("div", "vqs-home__card vqs-home__card--skel");
      s.append(EL("div", "vqs-home__thumb"), EL("div", "vqs-home__meta"));
      ui.grid.append(s);
    }
  }

  function visibleItems() {
    const q = normText(state.query).trim();
    let list = state.items.slice();
    if (q) list = list.filter((it) => normText(it && it.name).indexOf(q) >= 0);
    if (state.sort === "name") list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
    else if (state.sort === "duration") list.sort((a, b) => num(b.duration, 0) - num(a.duration, 0));
    else list.sort((a, b) => num(b.updatedAt, 0) - num(a.updatedAt, 0));
    return list;
  }

  function paintList() {
    if (!ui.grid) return;
    const list = visibleItems();
    ui.grid.innerHTML = "";
    if (ui.count) ui.count.textContent = state.items.length ? String(state.items.length) : "";
    for (const it of list) ui.grid.append(card(it));
    if (!ui.empty) return;
    ui.empty.innerHTML = "";
    if (state.loading || list.length) { ui.empty.classList.add("hidden"); return; }
    ui.empty.classList.remove("hidden");
    if (state.items.length && state.query) {
      ui.empty.append(EL("p", "vqs-home__empty-msg", "「" + state.query + "」に合うプロジェクトは在りません。"));
    } else if (!storage) {
      ui.empty.append(EL("p", "vqs-home__empty-msg",
        "この端末では保存庫（IndexedDB）が使えないため、一覧は残りません。作った物はその場で書き出してください。"));
    } else {
      ui.empty.append(EL("p", "vqs-home__empty-title", "まだプロジェクトが在りません"));
      ui.empty.append(EL("p", "vqs-home__empty-msg",
        "「新しいプロジェクト」で比率を選ぶと、すぐに編集を始められます。素材は端末から選ぶだけで、どこにも送られません。"));
      const b = BTN("vqs-home__btn vqs-home__btn--ghost", "サンプルで試す", "home-demo");
      on(b, "click", () => tryDemo(b));
      ui.empty.append(b);
    }
  }

  function card(it) {
    const id = String((it && it.id) || "");
    const name = String((it && it.name) || "無題のプロジェクト");
    const el = EL("article", "vqs-home__card");
    el.setAttribute("data-test", "home-card");
    el.setAttribute("data-id", id);
    el.setAttribute("role", "button");
    el.tabIndex = 0;

    const tint = tintFor(name);
    const thumb = EL("div", "vqs-home__thumb");
    thumb.style.setProperty("--vqs-home-tint-a", tint.a);
    thumb.style.setProperty("--vqs-home-tint-b", tint.b);
    thumb.append(EL("span", "vqs-home__initial", initialOf(name)), EL("span", "vqs-home__dur", fmtDur(it && it.duration)));
    if (it && it.ratio) thumb.append(EL("span", "vqs-home__ratio-tag", String(it.ratio)));
    loadThumb(id, thumb);

    const meta = EL("div", "vqs-home__meta");
    const bits = [fmtWhen(it && it.updatedAt), "素材 " + num(it && it.assetCount, 0)];
    if (num(it && it.bytes, 0) > 0) bits.push(formatBytes(num(it.bytes, 0)));
    meta.append(EL("div", "vqs-home__name", name), EL("div", "vqs-home__sub", bits.join(" · ")));

    const more = BTN("vqs-home__more", "⋯", "home-card-more");
    more.setAttribute("aria-label", "このプロジェクトの操作");
    on(more, "click", (ev) => { ev.stopPropagation(); cardMenu(more, it); });

    el.append(thumb, meta, more);
    on(el, "click", () => open(id));
    on(el, "keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(id); } });
    on(el, "contextmenu", (ev) => { ev.preventDefault(); cardMenu(el, it); });
    if (W && has(W.longPress)) {
      try { state.offs.push(W.longPress(el, () => cardMenu(el, it))); } catch (e) { /* noop */ }
    }
    return el;
  }

  /** サムネが保存庫に在れば使う（無ければ安定色のまま。失敗は黙って諦める） */
  function loadThumb(id, thumb) {
    if (!id || !storage || !has(storage.getMeta)) return;
    Promise.resolve().then(() => storage.getMeta("home.thumb:" + id)).then((v) => {
      if (!state.alive || !v) return;
      const blob = v && v.blob ? v.blob : v;
      if (typeof Blob === "undefined" || !(blob instanceof Blob)) return;
      const url = URL.createObjectURL(blob);
      state.urls.push(url);
      const img = EL("img", "vqs-home__img");
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = url;
      thumb.classList.add("vqs-home__thumb--img");
      thumb.prepend(img);
    }).catch(() => { /* サムネが無いのは普通のこと */ });
  }

  function open(id) {
    if (!id) return;
    if (onOpen) {
      try { onOpen(id); } catch (e) { toast("開けませんでした: " + msgOf(e), { kind: "error" }); }
      return;
    }
    if (ctx.app && has(ctx.app.openProject)) ctx.app.openProject(id);
  }

  /* ── 3.8 カードの操作（複製・名前変更・削除）───────────────────── */

  function cardMenu(anchor, it) {
    const id = String((it && it.id) || "");
    const items = [
      { id: "open", label: "開く", icon: "play", onClick: () => open(id) },
      { id: "dup", label: "複製", icon: "copy", onClick: () => duplicate(it) },
      { id: "rename", label: "名前を変える", icon: "edit", onClick: () => rename(it) },
      "-",
      { id: "del", label: "削除", icon: "trash", danger: true, onClick: () => remove(it) }
    ];
    if (W && has(W.menu)) { try { W.menu(anchor, items); return; } catch (e) { /* 下へ */ } }
    open(id);   /* menu が無ければ既定の操作だけ（手ぶらにしない） */
  }

  /** 保存庫から project 本体を取る（無ければ理由を出して null） */
  async function loadFull(id, why) {
    if (!storage || !has(storage.loadProject) || !has(storage.putProject)) {
      toast("保存庫が使えないため" + why + "できません", { kind: "error" });
      return null;
    }
    let p = null;
    try { p = await storage.loadProject(id); } catch (e) { p = null; }
    if (!p) toast("プロジェクトが読めませんでした", { kind: "error" });
    return p;
  }

  async function duplicate(it) {
    const p = await loadFull(String((it && it.id) || ""), "複製");
    if (!p) return;
    let copy = null;
    try { copy = JSON.parse(JSON.stringify(p)); }
    catch (e) { toast("複製できませんでした: " + msgOf(e), { kind: "error" }); return; }
    copy.id = "prj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    copy.name = String(p.name || "無題のプロジェクト") + " のコピー";
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    try { await storage.putProject(copy); }
    catch (e) { toast("複製できませんでした: " + msgOf(e), { kind: "error" }); return; }
    toast("複製しました");
    refresh();
  }

  async function rename(it) {
    const id = String((it && it.id) || "");
    const cur = String((it && it.name) || "");
    const next = (W && has(W.prompt))
      ? await W.prompt({ title: "名前を変える", label: "プロジェクト名", value: cur, okLabel: "変える" })
      : window.prompt("プロジェクト名", cur);
    if (next === null) return;
    const name = String(next).trim();
    if (!name) { toast("名前を入れてください", { kind: "warn" }); return; }
    const p = await loadFull(id, "名前の変更");
    if (!p) return;
    p.name = name;
    p.updatedAt = Date.now();
    try { await storage.putProject(p); }
    catch (e) { toast("保存できませんでした: " + msgOf(e), { kind: "error" }); return; }
    refresh();
  }

  async function remove(it) {
    const id = String((it && it.id) || "");
    const name = String((it && it.name) || "このプロジェクト");
    const msg = "「" + name + "」を削除します。取り消せません。";
    const ok = (W && has(W.confirm))
      ? await W.confirm({ title: "削除しますか", message: msg, okLabel: "削除する", danger: true })
      : window.confirm(msg);
    if (!ok) return;
    if (!storage || !has(storage.deleteProject)) { toast("保存庫が使えないため削除できません", { kind: "error" }); return; }
    let r = null;
    try { r = await storage.deleteProject(id); }
    catch (e) { toast("削除できませんでした: " + msgOf(e), { kind: "error" }); return; }
    if (r && r.ok === false) { toast("削除できませんでした: " + String(r.reason || ""), { kind: "error" }); return; }
    toast("削除しました");
    refresh();
  }

  /* ── 3.9 サンプル（demoo.mp4 を 3 クリップに分ける）────────────── */

  async function tryDemo(btn) {
    /* 契約どおり «失敗したら静かに隠す»（原因は log にだけ残す） */
    const fail = (e) => {
      if (e) warn("home", "サンプルを用意できなかった", e);
      if (btn) { try { btn.remove(); } catch (e2) { btn.classList.add("hidden"); } }
    };
    if (btn) { btn.disabled = true; btn.textContent = "用意しています…"; }

    let blob = null;
    for (const u of DEMO_URLS) {
      try {
        const res = await fetch(u, { cache: "force-cache" });
        if (res && res.ok) { blob = await res.blob(); break; }
      } catch (e) { /* 次の場所を試す */ }
    }
    if (!blob || !blob.size) { fail(); return; }
    if (!await startNew({ ratio: "16:9", name: "サンプル" })) { fail(); return; }

    const imp = importerOf();
    if (!imp || !has(imp.addFiles)) { fail(); return; }
    let file = blob;
    try { file = new File([blob], "demoo.mp4", { type: blob.type || "video/mp4" }); } catch (e) { file = blob; }
    let ids = [];
    try { ids = addedIds(await imp.addFiles([file], { place: false, silent: true })); }
    catch (e) { fail(e); return; }
    if (!ids.length) { fail(); return; }

    const st = storeOf();
    if (!st || !has(st.dispatch)) { fail(); return; }
    let trackId = "";
    try { trackId = ensureV1(st); } catch (e) { fail(e); return; }
    if (!trackId) { fail(); return; }

    const total = Math.max(1.5, num((assetById(st.project, ids[0]) || {}).duration, 9));
    const seg = Math.round((total / 3) * 1000) / 1000;
    try {
      runBatch(st, "サンプルを作る", (d) => {
        for (let i = 0; i < 3; i++) {
          const inT = Math.round(seg * i * 1000) / 1000;
          const outT = Math.round(seg * (i + 1) * 1000) / 1000;
          d("clip.add", {
            trackId, at: inT, assetId: ids[0], in: inT, out: outT,
            duration: Math.max(0.2, outT - inT), mode: "overwrite"
          });
        }
      });
    } catch (e) { warn("home", "サンプルを並べられなかった", e); }
    toast("サンプルを 3 クリップで作りました");
  }

  /* ── 3.10 アカウント ──────────────────────────────────────────── */

  function accountLabel() {
    const s = auth && auth.state ? auth.state : null;
    if (!s) return "ゲスト";
    if (s.status === "user") {
      const u = s.user || {};
      const nick = String(u.nickname || u.name || "").trim();
      const grade = String(u.gradePrefix || u.grade_prefix || "").trim();
      if (nick) return grade ? grade + " " + nick : nick;
      return "ログイン中";
    }
    if (s.status === "booting") return "確認中…";
    return "ゲスト";
  }

  function paintAccount() {
    if (!ui.account) return;
    const label = accountLabel();
    ui.account.innerHTML = "";
    ui.account.append(EL("span", "vqs-home__avatar", initialOf(label)), EL("span", "vqs-home__accname", label));
    ui.account.title = "アカウント: " + label;
  }

  function accountMenu(anchor) {
    const s = auth && auth.state ? auth.state : { status: "anon" };
    const goAuth = (view) => {
      if (ctx.app && has(ctx.app.openAuth)) ctx.app.openAuth(view);
      else toast("アカウント画面が使えません", { kind: "warn" });
    };
    const items = [{ id: "who", label: accountLabel(), disabled: true }, "-"];
    if (s.status === "user") {
      items.push({
        id: "logout", label: "ログアウト", icon: "user", onClick: async () => {
          if (auth && has(auth.logout)) { try { await auth.logout(); } catch (e) { warn("home", "ログアウト失敗", e); } }
          goAuth("welcome");
          paintAccount();
        }
      });
    } else {
      items.push({ id: "login", label: "ログイン / 新規登録", icon: "user", onClick: () => goAuth("welcome") });
    }
    if (W && has(W.menu)) { try { W.menu(anchor, items); return; } catch (e) { /* 下へ */ } }
    goAuth("welcome");
  }

  /* ── 3.11 容量とヘルプ ────────────────────────────────────────── */

  function paintUsage() {
    if (!ui.usage) return;
    if (!storage || !has(storage.estimate)) { ui.usage.textContent = "保存容量: 不明"; return; }
    Promise.resolve().then(() => storage.estimate()).then((e) => {
      if (!state.alive || !ui.usage) return;
      const usage = num(e && e.usage, 0), quota = num(e && e.quota, 0);
      ui.usage.textContent = quota > 0
        ? "保存容量 " + formatBytes(usage) + " / " + formatBytes(quota) + "（" + Math.min(100, Math.round((usage / quota) * 100)) + "%）"
        : "保存容量 " + formatBytes(usage);
    }).catch(() => { if (ui.usage) ui.usage.textContent = "保存容量: 不明"; });
  }

  async function openHelp() {
    const body = EL("div", "vqs-home__help");
    body.append(EL("p", "vqs-home__help-lead", "動画も素材もこの端末の中だけで扱います。どこにも送られません。"));
    let mod = null;
    try { mod = await import("./commands.js"); } catch (e) { mod = null; }
    if (mod && Array.isArray(mod.COMMANDS)) {
      const groups = mod.GROUPS || {};
      const byGroup = new Map();
      for (const c of mod.COMMANDS) {
        if (!c || !c.keys || !c.keys.length) continue;
        const g = String(c.group || "other");
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(c);
      }
      const order = Array.from(byGroup.keys())
        .sort((a, b) => num(groups[a] && groups[a].order, 99) - num(groups[b] && groups[b].order, 99));
      for (const g of order) {
        body.append(EL("h3", "vqs-home__help-h", String((groups[g] && groups[g].label) || g)));
        const dl = EL("dl", "vqs-home__keys");
        for (const c of byGroup.get(g)) {
          dl.append(EL("dt", "vqs-home__key-t", String(c.title || c.id)));
          dl.append(EL("dd", "vqs-home__key-d", has(mod.describeKeys) ? mod.describeKeys(c.keys) : c.keys.join(" / ")));
        }
        body.append(dl);
      }
    } else {
      body.append(EL("p", "vqs-home__help-msg", "短絡キーの一覧はまだ読み込めません。"));
    }
    const opts = { title: "短絡キーとヘルプ", content: body, width: 560, height: 0.8, className: "vqs-modal--help" };
    if (W && has(W.openSheet) && isNarrow()) W.openSheet(opts);
    else if (W && has(W.openModal)) W.openModal(opts);
    else toast("ヘルプを開けません", { kind: "warn" });
  }

  /* ── 3.12 外向きの形（契約書の 4 つ）──────────────────────────── */

  return {
    /** 画面を出す（中身を作り、一覧を読み直す） */
    show() {
      state.alive = true;
      if (!state.built) build();
      root.classList.remove("hidden");
      refresh();
    },
    /** 画面を隠す（.hidden の付け外しは app.js と両方で安全に効く） */
    hide() { root.classList.add("hidden"); },
    /** 一覧と容量を読み直す @returns {Promise<void>} */
    refresh() { return refresh(); },
    /** 全部返す（購読・objectURL・DOM） */
    dispose() {
      state.alive = false;
      for (const off of state.offs) { if (has(off)) { try { off(); } catch (e) { /* noop */ } } }
      state.offs.length = 0;
      for (const u of state.urls) { try { URL.revokeObjectURL(u); } catch (e) { /* noop */ } }
      state.urls.length = 0;
      state.items = [];
      state.built = false;
      try { root.innerHTML = ""; } catch (e) { /* noop */ }
    }
  };
}

export default createHomeScreen;
