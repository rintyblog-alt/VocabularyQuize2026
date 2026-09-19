/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/app.js — 画面を束ねる所（統合層）

   ★ ここでやること
     ① 部品（engine / ui / ai / export）を **欠けても落ちない形**で起こす
     ② 3 つの画面（アカウント / 一覧 / 編集）の行き来
     ③ 自動保存・画面幅に応じた配置替え・全体の短絡キー
     ④ プロジェクトの新規・読み込み・保存

   ★ 大前提
     ここは「配線」だけを持つ。編集の中身（描画や操作）は各部品が持つ。
     ここに機能を足したくなったら、それは部品側の仕事。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

const $ = (id) => document.getElementById(id);
const MOBILE_Q = "(max-width: 1023px)";

async function opt(path, failures) {
  try { return await import(path); }
  catch (e) { failures.push({ path, required: false, message: String(e && e.message || e) }); return null; }
}
function safe(label, fn, failures) {
  try { return fn(); }
  catch (e) {
    failures.push({ path: label, required: false, message: String(e && e.message || e) });
    try { console.error("[VQS:init]", label, e); } catch (_) { /* noop */ }
    return null;
  }
}

export async function createApp({ cfg, schema, storeMod, opsMod, storage, auth, failures }) {
  /* ── 部品を読む（並べて読み、欠けた物は null） ───────────────────── */
  const [
    widgets, icons, i18n,
    compositorMod, sourcesMod, playbackMod, audioMod,
    exporterMod,
    homeMod, authScreenMod, topbarMod, transportMod, libraryMod, importMod,
    inspectorMod, tlViewMod, tlInteractMod, tlHeadsMod, tlToolbarMod, tlMinimapMod,
    previewMod, mobileMod, shortcutsMod, commandsMod, aiPanelMod, exportDialogMod, settingsMod,
    plannerMod, resolveMod, toolsMod, refineMod, llmMod, analysisMod
  ] = await Promise.all([
    opt("./widgets.js", failures), opt("./icons.js", failures), opt("./i18n.js", failures),
    opt("../engine/compositor.js", failures), opt("../engine/sources.js", failures),
    opt("../engine/playback.js", failures), opt("../engine/audio/graph.js", failures),
    opt("../export/exporter.js", failures),
    opt("./home.js", failures), opt("./auth-screen.js", failures), opt("./toolbar.js", failures),
    opt("./transport.js", failures), opt("./library.js", failures), opt("./import.js", failures),
    opt("./inspector/index.js", failures), opt("./timeline/view.js", failures),
    opt("./timeline/interact.js", failures), opt("./timeline/heads.js", failures),
    opt("./timeline/toolbar.js", failures), opt("./timeline/minimap.js", failures),
    opt("./preview.js", failures), opt("./mobile.js", failures), opt("./shortcuts.js", failures),
    opt("./commands.js", failures), opt("./ai-panel.js", failures), opt("./export-dialog.js", failures),
    opt("./settings.js", failures),
    opt("../ai/planner.js", failures), opt("../ai/resolve.js", failures), opt("../ai/tools.js", failures),
    opt("../ai/refine.js", failures), opt("../ai/llm.js", failures), opt("../analysis/index.js", failures)
  ]);

  const toast = (msg, o) => {
    if (widgets && widgets.toast) { try { return widgets.toast(msg, o); } catch (e) { /* fallthrough */ } }
    try { console.warn("[VQS:toast]", msg); } catch (e) { /* noop */ }
    return null;
  };

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const state = {
    screen: "boot",          // "auth" | "home" | "editor"
    mobile: window.matchMedia(MOBILE_Q).matches,
    store: null,
    parts: {},               // 起こした部品（dispose 用）
    saveTimer: 0,
    savingLabel: $("saveState")
  };

  const els = {
    app: $("app"), authScreen: $("authScreen"), homeScreen: $("homeScreen"),
    previewCanvas: $("previewCanvas"), previewOverlay: $("previewOverlay"),
    previewWrap: $("previewWrap"), previewStage: $("previewStage"), previewHud: $("previewHud"),
    transport: $("transport"), contextBar: $("contextBar"),
    left: $("left"), right: $("right"), libraryTabs: $("libraryTabs"), libraryPanel: $("libraryPanel"),
    inspectorTabs: $("inspectorTabs"), inspector: $("inspector"),
    timelinePane: $("timelinePane"), tlToolbar: $("tlToolbar"), tlRuler: $("tlRuler"),
    tlTracks: $("tlTracks"), tlHeads: $("tlHeads"), tlScroll: $("tlScroll"),
    tlPlayhead: $("tlPlayhead"), tlSnapLine: $("tlSnapLine"), tlMarquee: $("tlMarquee"),
    tlMinimap: $("tlMinimap"), mobileBar: $("mobileBar"), topbar: $("topbar"),
    projectName: $("projectName")
  };

  /* ── 画面の出し入れ ───────────────────────────────────────────── */
  function show(screen) {
    state.screen = screen;
    if (els.authScreen) els.authScreen.classList.toggle("hidden", screen !== "auth");
    if (els.homeScreen) els.homeScreen.classList.toggle("hidden", screen !== "home");
    if (els.app) els.app.classList.toggle("hidden", screen !== "editor");
    document.documentElement.setAttribute("data-screen", screen);
  }

  /* ── 編集画面の部品を起こす ───────────────────────────────────── */
  function buildEditor() {
    const P = state.parts;
    const store = state.store;
    if (!store) return;

    /* 合成（WebGL）→ 素材 → 音 → 再生 */
    P.compositor = safe("compositor", () => compositorMod && compositorMod.createCompositor
      ? compositorMod.createCompositor(els.previewCanvas, { preferGL: true }) : null, failures);
    P.audio = safe("audio", () => audioMod && audioMod.createAudioEngine
      ? audioMod.createAudioEngine({ storage }) : null, failures);
    P.sources = safe("sources", () => sourcesMod && sourcesMod.createSourcePool
      ? sourcesMod.createSourcePool({ storage, project: store.project, fps: store.project.settings.fps }) : null, failures);
    P.transport = safe("transport-engine", () => playbackMod && playbackMod.createTransport
      ? playbackMod.createTransport({
        store, compositor: P.compositor, sources: P.sources, audio: P.audio,
        fps: store.project.settings.fps
      }) : null, failures);

    const ctx = {
      store, storage, auth, widgets, icons, i18n, cfg,
      compositor: P.compositor, sources: P.sources, audio: P.audio, transport: P.transport,
      analysis: analysisMod, exporter: exporterMod,
      ai: {
        planner: plannerMod, resolve: resolveMod, tools: toolsMod, refine: refineMod,
        llm: llmMod && llmMod.createLLM ? safe("llm", () => llmMod.createLLM({ endpoint: cfg.apiBase + "/api/ai/chat" }), failures) : null
      },
      app: api, toast
    };
    state.ctx = ctx;

    /* 素材の取り込み */
    P.importer = safe("importer", () => importMod && importMod.createImporter
      ? importMod.createImporter({ store, storage, analysis: analysisMod }) : null, failures);
    ctx.importer = P.importer;

    /* タイムライン */
    P.tlView = safe("tl-view", () => tlViewMod && tlViewMod.createTimelineView
      ? tlViewMod.createTimelineView({ store, els, media: { storage } }) : null, failures);
    P.tlHeads = safe("tl-heads", () => tlHeadsMod && tlHeadsMod.createTrackHeads
      ? tlHeadsMod.createTrackHeads({ store, els, view: P.tlView }) : null, failures);
    P.tlInteract = safe("tl-interact", () => tlInteractMod && tlInteractMod.createTimelineInteraction
      ? tlInteractMod.createTimelineInteraction({
        store, view: P.tlView, els, transport: P.transport, widgets
      }) : null, failures);
    P.tlToolbar = safe("tl-toolbar", () => tlToolbarMod && tlToolbarMod.createTimelineToolbar
      ? tlToolbarMod.createTimelineToolbar({ store, view: P.tlView, transport: P.transport, widgets }) : null, failures);
    P.tlMinimap = safe("tl-minimap", () => tlMinimapMod && tlMinimapMod.createMinimap
      ? tlMinimapMod.createMinimap({ store, view: P.tlView }) : null, failures);

    /* 左・右・中央 */
    P.library = safe("library", () => libraryMod && libraryMod.createLibrary
      ? libraryMod.createLibrary({ store, els, widgets, storage, media: ctx, importer: P.importer, ctx }) : null, failures);
    P.inspector = safe("inspector", () => inspectorMod && inspectorMod.createInspector
      ? inspectorMod.createInspector({ store, els, widgets, transport: P.transport, ctx }) : null, failures);
    P.preview = safe("preview", () => previewMod && previewMod.createPreview
      ? previewMod.createPreview({ store, els, compositor: P.compositor, transport: P.transport, widgets }) : null, failures);
    P.transportBar = safe("transport-bar", () => transportMod && transportMod.createTransportBar
      ? transportMod.createTransportBar({ store, els, transport: P.transport, widgets }) : null, failures);

    /* 上段 */
    P.topbar = safe("topbar", () => topbarMod && topbarMod.createTopbar
      ? topbarMod.createTopbar({ store, els, widgets, auth, onAction: onTopbarAction }) : null, failures);

    /* AI・書き出し・設定 */
    P.ai = safe("ai-panel", () => aiPanelMod && aiPanelMod.createAiPanel
      ? aiPanelMod.createAiPanel({
        store, els, widgets, storage, analysis: analysisMod, ai: ctx.ai, ctx
      }) : null, failures);
    P.exportDialog = safe("export-dialog", () => exportDialogMod && exportDialogMod.createExportDialog
      ? exportDialogMod.createExportDialog({
        store, els, widgets, exporter: exporterMod, ctx
      }) : null, failures);
    P.settings = safe("settings", () => settingsMod && settingsMod.createSettings
      ? settingsMod.createSettings({ store, storage, widgets, auth, authScreen: P.authScreen, ctx }) : null, failures);

    /* 短絡キー */
    P.commands = safe("commands", () => commandsMod ? commandsMod : null, failures);
    P.shortcuts = safe("shortcuts", () => shortcutsMod && shortcutsMod.createShortcuts
      ? shortcutsMod.createShortcuts({ ctx, commands: commandsMod && commandsMod.COMMANDS }) : null, failures);

    /* モバイルの殻 */
    applyMobileShell();

    /* 最初の 1 枚を描く */
    requestFrame();
    if (P.tlView && P.tlView.render) safe("tl-first-render", () => P.tlView.render(), failures);
    if (P.inspector && P.inspector.render) safe("insp-first-render", () => P.inspector.render(), failures);
    if (P.library && P.library.render) safe("lib-first-render", () => P.library.render(), failures);
  }

  function applyMobileShell() {
    const P = state.parts;
    document.documentElement.classList.toggle("vqs-mobile", state.mobile);
    if (state.mobile && !P.mobile && mobileMod && mobileMod.createMobileShell) {
      P.mobile = safe("mobile", () => mobileMod.createMobileShell({
        store: state.store, els, widgets, transport: P.transport, onAction: onTopbarAction, ctx: state.ctx
      }), failures);
    }
    if (P.mobile && P.mobile.render) safe("mobile-render", () => P.mobile.render(), failures);
  }

  function onTopbarAction(action, arg) {
    const P = state.parts;
    if (action === "ai") { if (P.ai && P.ai.open) P.ai.open("create"); else toast("AI 機能を読み込めませんでした", { kind: "warn" }); return; }
    if (action === "export") { if (P.exportDialog && P.exportDialog.open) P.exportDialog.open(); else toast("書き出しを読み込めませんでした", { kind: "warn" }); return; }
    if (action === "account") { if (P.settings && P.settings.openAccount) P.settings.openAccount(); else openAuth("profile"); return; }
    if (action === "settings") { if (P.settings && P.settings.openSettings) P.settings.openSettings("edit"); return; }
    if (action === "home") { goHome(); return; }
    if (action === "import") { if (P.importer && P.importer.pickFiles) P.importer.pickFiles(); return; }
    if (action === "tool" && P.commands) { /* 道具の切替は toolbar 側が store.setView する */ return; }
    if (arg && typeof arg === "function") arg();
  }

  /* ── 描画の呼び出し（再生していないときの 1 枚） ─────────────── */
  let rafId = 0;
  function requestFrame() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const P = state.parts;
      if (!P.compositor || !state.store) return;
      const t = state.store.view ? state.store.view.playhead : 0;
      try { P.compositor.renderFrame(state.store.project, t, { sources: P.sources, quality: 1 }); }
      catch (e) { failures.push({ path: "compositor.renderFrame", required: false, message: String(e && e.message || e) }); }
      if (P.preview && P.preview.render) { try { P.preview.render(); } catch (e) { /* noop */ } }
    });
  }

  /* ── 自動保存 ─────────────────────────────────────────────────── */
  function markSaving(label) { if (state.savingLabel) state.savingLabel.textContent = label; }
  function scheduleSave() {
    if (!storage || !state.store) return;
    markSaving("未保存");
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      state.saveTimer = 0;
      try {
        markSaving("保存中…");
        const p = state.store.project;
        p.updatedAt = Date.now();
        await storage.putProject(p);
        if (state.store.markClean) state.store.markClean();
        markSaving("保存済み");
      } catch (e) {
        markSaving("保存できません");
        toast("保存に失敗しました: " + String(e && e.message || e), { kind: "error" });
      }
    }, 2500);
  }

  /* ── プロジェクトの生成・読み込み ─────────────────────────────── */
  function attachStore(project) {
    if (state.store && state.store.dispose) { try { state.store.dispose(); } catch (e) { /* noop */ } }
    const normalized = schema.normalizeProject ? schema.normalizeProject(project) : project;
    const store = storeMod.createStore(normalized);
    state.store = store;
    store.subscribe((ev) => {
      if (!ev || ev.kind === "view") {
        requestFrame();
        return;
      }
      scheduleSave();
      requestFrame();
      const P = state.parts;
      if (P.tlView && P.tlView.render) { try { P.tlView.render(); } catch (e) { /* noop */ } }
      if (P.inspector && P.inspector.render) { try { P.inspector.render(); } catch (e) { /* noop */ } }
      if (P.tlHeads && P.tlHeads.render) { try { P.tlHeads.render(); } catch (e) { /* noop */ } }
      if (P.tlMinimap && P.tlMinimap.render) { try { P.tlMinimap.render(); } catch (e) { /* noop */ } }
      if (P.library && P.library.render) { try { P.library.render(); } catch (e) { /* noop */ } }
      if (P.mobile && P.mobile.render) { try { P.mobile.render(); } catch (e) { /* noop */ } }
    });
    /* タイムラインの初期表示: 作品が入っていれば画面幅に収める。
       空なら 80px/秒（既定）。これをやらないと 3 秒の作品でも目盛りが分刻みになる。 */
    try {
      const dur = schema.projectDuration ? schema.projectDuration(store.project) : 0;
      const vw = (els.tlScroll && els.tlScroll.clientWidth) || (window.innerWidth - 360) || 900;
      const zoom = dur > 0.2 ? Math.max(4, Math.min(400, (vw - 48) / dur)) : 80;
      store.setView({ zoom, scrollX: 0, playhead: 0 });
    } catch (e) { /* 表示だけの話なので黙って既定に任せる */ }

    if (els.projectName) {
      els.projectName.value = store.project.name || "無題のプロジェクト";
      els.projectName.oninput = () => {
        try { store.dispatch("project.rename", { name: els.projectName.value }); } catch (e) { /* noop */ }
      };
    }
    return store;
  }

  const api = {
    get store() { return state.store; },
    get parts() { return state.parts; },
    get mobile() { return state.mobile; },
    toast,
    requestFrame,

    async newProject(opts) {
      const ratio = (opts && opts.ratio) || "16:9";
      const size = (schema.RATIOS && schema.RATIOS[ratio]) || { w: 1920, h: 1080 };
      const p = schema.newProject({
        name: (opts && opts.name) || "無題のプロジェクト",
        settings: { ratio, width: size.w, height: size.h, fps: (opts && opts.fps) || 30 }
      });
      attachStore(p);
      if (!state.parts.compositor) buildEditor(); else rebuildForProject();
      show("editor");
      if (storage) { try { await storage.putProject(state.store.project); } catch (e) { /* noop */ } }
      markSaving("保存済み");
      return state.store.project;
    },

    async openProject(id) {
      if (!storage) { toast("保存庫が使えないため開けません", { kind: "error" }); return null; }
      const p = await storage.loadProject(id);
      if (!p) { toast("プロジェクトが見つかりませんでした", { kind: "error" }); return null; }
      attachStore(p);
      if (!state.parts.compositor) buildEditor(); else rebuildForProject();
      show("editor");
      markSaving("保存済み");
      return state.store.project;
    },

    async openProjectObject(project) {
      attachStore(project);
      if (!state.parts.compositor) buildEditor(); else rebuildForProject();
      show("editor");
      scheduleSave();
      return state.store.project;
    },

    async save() {
      if (!storage || !state.store) return false;
      state.store.project.updatedAt = Date.now();
      await storage.putProject(state.store.project);
      markSaving("保存済み");
      return true;
    },

    goHome, openAuth, show,

    dispose() {
      Object.keys(state.parts).forEach((k) => {
        const p = state.parts[k];
        if (p && typeof p.dispose === "function") { try { p.dispose(); } catch (e) { /* noop */ } }
      });
      state.parts = {};
    },

    async start() {
      /* 行き先を決める: 未ログイン（ゲストでもない）ならアカウント画面 */
      const st = auth && auth.state ? auth.state : { status: "anon" };
      if (cfg.projectId) { await api.openProject(cfg.projectId); return; }
      if (cfg.startNew) { await api.newProject({}); return; }
      if (st.status === "anon" && authScreenMod) { openAuth("welcome"); return; }
      goHome();
    }
  };

  function rebuildForProject() {
    const P = state.parts;
    if (P.sources && P.sources.setProject) { try { P.sources.setProject(state.store.project); } catch (e) { /* noop */ } }
    if (P.audio && P.audio.setProject) { try { P.audio.setProject(state.store.project); } catch (e) { /* noop */ } }
    /* store が入れ替わったので、store を握る部品は作り直す */
    ["tlView", "tlHeads", "tlInteract", "tlToolbar", "tlMinimap", "library", "inspector",
      "preview", "transportBar", "topbar", "ai", "exportDialog", "settings", "shortcuts", "mobile"]
      .forEach((k) => { const p = state.parts[k]; if (p && p.dispose) { try { p.dispose(); } catch (e) { /* noop */ } } state.parts[k] = null; });
    const keep = { compositor: P.compositor, audio: P.audio, sources: P.sources, transport: P.transport, importer: P.importer };
    state.parts = Object.assign({}, keep);
    buildEditorUIOnly();
  }

  /* エンジンは保ったまま UI だけ作り直す */
  function buildEditorUIOnly() {
    const P = state.parts;
    const store = state.store;
    const ctx = state.ctx || {};
    ctx.store = store;
    P.tlView = safe("tl-view", () => tlViewMod && tlViewMod.createTimelineView ? tlViewMod.createTimelineView({ store, els, media: { storage } }) : null, failures);
    P.tlHeads = safe("tl-heads", () => tlHeadsMod && tlHeadsMod.createTrackHeads ? tlHeadsMod.createTrackHeads({ store, els, view: P.tlView }) : null, failures);
    P.tlInteract = safe("tl-interact", () => tlInteractMod && tlInteractMod.createTimelineInteraction ? tlInteractMod.createTimelineInteraction({ store, view: P.tlView, els, transport: P.transport, widgets }) : null, failures);
    P.tlToolbar = safe("tl-toolbar", () => tlToolbarMod && tlToolbarMod.createTimelineToolbar ? tlToolbarMod.createTimelineToolbar({ store, view: P.tlView, transport: P.transport, widgets }) : null, failures);
    P.tlMinimap = safe("tl-minimap", () => tlMinimapMod && tlMinimapMod.createMinimap ? tlMinimapMod.createMinimap({ store, view: P.tlView }) : null, failures);
    P.library = safe("library", () => libraryMod && libraryMod.createLibrary ? libraryMod.createLibrary({ store, els, widgets, storage, media: ctx, importer: P.importer, ctx }) : null, failures);
    P.inspector = safe("inspector", () => inspectorMod && inspectorMod.createInspector ? inspectorMod.createInspector({ store, els, widgets, transport: P.transport, ctx }) : null, failures);
    P.preview = safe("preview", () => previewMod && previewMod.createPreview ? previewMod.createPreview({ store, els, compositor: P.compositor, transport: P.transport, widgets }) : null, failures);
    P.transportBar = safe("transport-bar", () => transportMod && transportMod.createTransportBar ? transportMod.createTransportBar({ store, els, transport: P.transport, widgets }) : null, failures);
    P.topbar = safe("topbar", () => topbarMod && topbarMod.createTopbar ? topbarMod.createTopbar({ store, els, widgets, auth, onAction: onTopbarAction }) : null, failures);
    P.ai = safe("ai-panel", () => aiPanelMod && aiPanelMod.createAiPanel ? aiPanelMod.createAiPanel({ store, els, widgets, storage, analysis: analysisMod, ai: ctx.ai, ctx }) : null, failures);
    P.exportDialog = safe("export-dialog", () => exportDialogMod && exportDialogMod.createExportDialog ? exportDialogMod.createExportDialog({ store, els, widgets, exporter: exporterMod, ctx }) : null, failures);
    P.settings = safe("settings", () => settingsMod && settingsMod.createSettings ? settingsMod.createSettings({ store, storage, widgets, auth, authScreen: state.parts.authScreen, ctx }) : null, failures);
    P.shortcuts = safe("shortcuts", () => shortcutsMod && shortcutsMod.createShortcuts ? shortcutsMod.createShortcuts({ ctx, commands: commandsMod && commandsMod.COMMANDS }) : null, failures);
    applyMobileShell();
    requestFrame();
  }

  /* ── 一覧とアカウント ─────────────────────────────────────────── */
  function goHome() {
    show("home");
    const P = state.parts;
    if (!P.home && homeMod && homeMod.createHomeScreen) {
      P.home = safe("home", () => homeMod.createHomeScreen({
        store: state.store, storage, els, widgets, auth,
        onOpen: (id) => api.openProject(id),
        onNew: (opts) => api.newProject(opts || {}),
        ctx: state.ctx || { storage, widgets, auth, cfg, app: api }
      }), failures);
    }
    if (P.home && P.home.show) safe("home-show", () => P.home.show(), failures);
    else if (!P.home) {
      /* 一覧が読めなかったときの最小の入口（手ぶらにしない） */
      if (els.homeScreen) {
        els.homeScreen.innerHTML = "";
        const b = document.createElement("button");
        b.className = "vqs-btn vqs-btn--primary";
        b.textContent = "新しいプロジェクトを作る";
        b.addEventListener("click", () => api.newProject({}));
        els.homeScreen.append(b);
      }
    }
  }

  function openAuth(view) {
    show("auth");
    const P = state.parts;
    if (!P.authScreen && authScreenMod && authScreenMod.createAuthScreen) {
      P.authScreen = safe("auth-screen", () => authScreenMod.createAuthScreen({
        auth, els, widgets, onDone: () => goHome()
      }), failures);
    }
    if (P.authScreen && P.authScreen.show) safe("auth-show", () => P.authScreen.show(view || "welcome"), failures);
    else goHome();
  }

  /* ── 画面幅の変化 ─────────────────────────────────────────────── */
  const mq = window.matchMedia(MOBILE_Q);
  const onMQ = () => {
    const now = mq.matches;
    if (now === state.mobile) return;
    state.mobile = now;
    applyMobileShell();
    const P = state.parts;
    if (P.tlView && P.tlView.render) { try { P.tlView.render(); } catch (e) { /* noop */ } }
    requestFrame();
  };
  if (mq.addEventListener) mq.addEventListener("change", onMQ); else if (mq.addListener) mq.addListener(onMQ);

  window.addEventListener("resize", () => {
    const P = state.parts;
    if (P.compositor && P.compositor.resize && state.store) {
      const s = state.store.project.settings;
      try { P.compositor.resize(s.width, s.height); } catch (e) { /* noop */ }
    }
    if (P.preview && P.preview.fit) { try { P.preview.fit(); } catch (e) { /* noop */ } }
    if (P.tlView && P.tlView.render) { try { P.tlView.render(); } catch (e) { /* noop */ } }
    requestFrame();
  }, { passive: true });

  /* 離れる前に保存（未保存があれば止める） */
  window.addEventListener("beforeunload", (ev) => {
    if (state.store && state.store.dirty) {
      api.save();
      ev.preventDefault();
      ev.returnValue = "";
    }
  });

  return api;
}
