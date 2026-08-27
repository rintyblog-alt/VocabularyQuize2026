import {
  SURVIVAL_BABYLON_RELEASE_GATE,
  getSurvivalLoadingBackgrounds,
  getSurvivalTheme
} from "./maps.js";
import {
  chooseGraphicsQuality,
  getLoadingPayload
} from "./ui.js";
import {
  getBattleState,
  getBattle3dState,
  myPlayerKey,
  sendBattleMessage,
  buildInputPayload,
  extractWorld,
  extractSnapshot
} from "./network.js";
import { SurvivalBabylonRenderer } from "./renderer-babylon.js";

const BABYLON_CORE_URL = "https://cdn.babylonjs.com/babylon.js";
const BABYLON_LOADERS_URL = "https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js";
const INTERNAL_SWITCH_KEY = "vq:survival:renderer";
const QUALITY_LABELS = Object.freeze([
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" }
]);

const runtime = {
  active: false,
  open: false,
  renderer: null,
  babylonReady: false,
  babylonPromise: null,
  inputTimer: null,
  hudTimer: null,
  watchdogTimer: null,
  lastWorld: null,
  lastSnapshot: null,
  lastInputSeq: 0,
  hintTick: 0,
  canvasWrap: null,
  quality: chooseGraphicsQuality(),
  patched: false
};

function qs(name) {
  try {
    return new URLSearchParams(String(location.search || "")).get(name);
  } catch (_) {
    return null;
  }
}

function isSurvivalRoute() {
  return /^\/survival(?:\/|$)/i.test(String(location.pathname || ""));
}

function isDebugEnabled() {
  const raw = String(qs("debug") || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function hasInternalSwitch() {
  try {
    return String(localStorage.getItem(INTERNAL_SWITCH_KEY) || "").toLowerCase() === "babylon";
  } catch (_) {
    return false;
  }
}

function shouldUseBabylon() {
  if (!isSurvivalRoute()) return false;
  if (SURVIVAL_BABYLON_RELEASE_GATE) return true;
  if (String(qs("survivalRenderer") || "").toLowerCase() === "babylon") return true;
  if (String(qs("babylon") || "").toLowerCase() === "1") return true;
  if (hasInternalSwitch()) return true;
  return isDebugEnabled();
}

function setInternalSwitch(enabled) {
  try {
    if (enabled) localStorage.setItem(INTERNAL_SWITCH_KEY, "babylon");
    else localStorage.removeItem(INTERNAL_SWITCH_KEY);
  } catch (_) {}
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asStr(value, fallback = "") {
  const text = String(value ?? fallback);
  return text.trim() ? text : String(fallback || "");
}

function safeInvoke(name, ...args) {
  const fn = window[name];
  if (typeof fn !== "function") return undefined;
  try {
    return fn(...args);
  } catch (_) {
    return undefined;
  }
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((node) => String(node.src || "") === src);
    if (existing && (window.BABYLON || src !== BABYLON_CORE_URL)) {
      resolve();
      return;
    }
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    if (!existing) document.head.appendChild(script);
  });
}

async function ensureBabylon() {
  if (window.BABYLON) {
    runtime.babylonReady = true;
    return window.BABYLON;
  }
  if (!runtime.babylonPromise) {
    runtime.babylonPromise = (async () => {
      await loadScript(BABYLON_CORE_URL);
      await loadScript(BABYLON_LOADERS_URL);
      runtime.babylonReady = !!window.BABYLON;
      if (!runtime.babylonReady) throw new Error("Babylon.js failed to initialize.");
      return window.BABYLON;
    })();
  }
  return runtime.babylonPromise;
}

function patchLoadingBackgrounds() {
  const base = window._rtBattle3dLoadingBackgroundSet;
  if (typeof base !== "function" || base.__babylonWrapped) return;
  const wrapped = function patchedRt3dLoadingBackgroundSet(mapId) {
    if (runtime.active) {
      const list = getSurvivalLoadingBackgrounds(mapId);
      const title = getSurvivalTheme(mapId).label;
      return list.map((style, index) => ({
        key: `${String(mapId || "bridge").toLowerCase()}-${index}`,
        title,
        style
      }));
    }
    return base.apply(this, arguments);
  };
  wrapped.__babylonWrapped = true;
  window._rtBattle3dLoadingBackgroundSet = wrapped;
}

function ensureQualityControl() {
  const headRight = document.querySelector("#rt3dOverlay .b3d-head-right");
  if (!(headRight instanceof HTMLElement)) return;
  let select = document.getElementById("rt3dQualitySelect");
  if (!(select instanceof HTMLSelectElement)) {
    select = document.createElement("select");
    select.id = "rt3dQualitySelect";
    select.className = "b3d-select";
    select.style.minWidth = "92px";
    select.innerHTML = QUALITY_LABELS.map((row) => `<option value="${row.id}">${row.label}</option>`).join("");
    headRight.prepend(select);
    select.addEventListener("change", () => {
      runtime.quality = chooseGraphicsQuality(select.value);
      try { localStorage.setItem("vq:survival:gfx", runtime.quality); } catch (_) {}
      runtime.renderer?.setGraphicsQuality(runtime.quality);
      pushToast("info", `Graphics ${runtime.quality.toUpperCase()}`);
    });
  }
  select.value = runtime.quality;
}

function pushToast(kind, text) {
  safeInvoke("_rtBattle3dPushToast", kind, text);
}

function ensureOverlayReady() {
  safeInvoke("_rtBattle3dEnsureStyles");
  safeInvoke("_rtBattle3dBindGlobalHandlers");
  const root = safeInvoke("_rtBattle3dEnsureRoot");
  if (root instanceof HTMLElement) {
    const title = root.querySelector(".b3d-title");
    const sub = document.getElementById("rt3dSubLine");
    if (title) title.textContent = "VocabuSurvival";
    if (sub && !runtime.open) sub.textContent = "Babylon Preview";
  }
  patchLoadingBackgrounds();
  ensureQualityControl();
  return root instanceof HTMLElement ? root : document.getElementById("rt3dOverlay");
}

function ensureRuntimeState() {
  const b = getBattle3dState();
  if (!b.runtime || typeof b.runtime !== "object") b.runtime = {};
  b.runtime.inited = true;
  b.runtime.mode = "babylon";
  return b;
}

function setOpenState(open) {
  const b = ensureRuntimeState();
  const root = ensureOverlayReady();
  b.open = !!open;
  b.loading = !!open;
  b.error = "";
  b.status = open ? "Babylon scene を準備中…" : "";
  if (root instanceof HTMLElement) {
    root.classList.toggle("is-open", !!open);
    root.hidden = !open;
    root.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (open) {
    b._prevBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = typeof b._prevBodyOverflow === "string" ? b._prevBodyOverflow : "";
  }
}

function currentModeLabel() {
  const st = getBattleState();
  return String(st.room?.settings?.mode || st.mode || "race").toLowerCase() === "survival" ? "Survival" : "Race";
}

function currentPresetLabel() {
  const st = getBattleState();
  const display = safeInvoke("_rtBattlePresetDisplayName", st.room?.presetRef, st.room?.presetName);
  return asStr(display || st.room?.presetName || "ALL", "ALL");
}

function currentMapId() {
  const st = getBattleState();
  const g3 = (st.room?.game3d && typeof st.room.game3d === "object") ? st.room.game3d : (st.game3d && typeof st.game3d === "object" ? st.game3d : null);
  return String(g3?.mapId || safeInvoke("_rtBattle3dV8State")?.p3?.mapId || "bridge").toLowerCase();
}

function applyLoadingStage(stageKey, extra = {}) {
  const payload = getLoadingPayload(currentMapId(), currentModeLabel(), currentPresetLabel(), stageKey);
  safeInvoke("_rtBattle3dSetLoadingStage", stageKey, {
    title: payload.title,
    subtitle: payload.subtitle,
    stageText: payload.stageText,
    mapId: currentMapId(),
    modeLabel: payload.modeLabel,
    presetLabel: payload.presetLabel,
    progress: extra.progress,
    context: extra.context || "babylon",
    metaText: `${payload.mapLabel} / ${payload.modeLabel} / ${payload.presetLabel}`
  });
}

function updateRendererViewMode() {
  const v8 = safeInvoke("_rtBattle3dV8State");
  const mode = String(v8?.p3?.viewMode || "third");
  runtime.renderer?.setViewMode(mode);
}

function mergeSnapshot(snapshot, world) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (world && typeof world === "object") return { ...snapshot, world };
  if (runtime.lastWorld && typeof runtime.lastWorld === "object") return { ...snapshot, world: runtime.lastWorld };
  return snapshot;
}

function worldValidationError(world) {
  const validation = (world && typeof world === "object" && world.validation && typeof world.validation === "object")
    ? world.validation
    : null;
  if (!validation || validation.ok !== false) return "";
  const errors = Array.isArray(validation.errors) ? validation.errors.filter(Boolean).map((x) => String(x)) : [];
  return errors.length ? errors.join(", ") : "invalid_world";
}

function handleWorldValidationFailure(world, source = "babylon") {
  const errorText = worldValidationError(world);
  if (!errorText) return false;
  runtime.active = false;
  safeInvoke("_rtBattle3dCancelLoading");
  safeInvoke("_rtBattle3dShowError", `Babylon マップ検証に失敗しました: ${errorText}`);
  pushToast("error", "Babylon map invalid");
  console.warn(`[survival:babylon] invalid world from ${source}:`, errorText, world?.validation || null);
  return true;
}

function syncRendererFromMessage(msg) {
  const world = extractWorld(msg);
  if (world) {
    runtime.lastWorld = world;
    if (handleWorldValidationFailure(world, "message")) return;
  }
  const snapshot = mergeSnapshot(extractSnapshot(msg), world);
  if (!snapshot || !runtime.renderer) return;
  runtime.lastSnapshot = snapshot;
  runtime.renderer.setLocalPlayerKey(myPlayerKey());
  updateRendererViewMode();
  runtime.renderer.sync(snapshot, myPlayerKey());
}

function syncRendererFromState() {
  const st = getBattleState();
  if (handleWorldValidationFailure(runtime.lastWorld, "state")) return;
  const snapshot = mergeSnapshot(st.game3d && typeof st.game3d === "object" ? st.game3d : null, runtime.lastWorld);
  if (!snapshot || !runtime.renderer) return;
  runtime.lastSnapshot = snapshot;
  runtime.renderer.setLocalPlayerKey(myPlayerKey());
  updateRendererViewMode();
  runtime.renderer.sync(snapshot, myPlayerKey());
}

function startInputLoop() {
  stopInputLoop();
  runtime.inputTimer = window.setInterval(() => {
    if (!runtime.open || !runtime.renderer) return;
    const b = ensureRuntimeState();
    const look = runtime.renderer.getLookState();
    const input = b.input && typeof b.input === "object" ? b.input : {};
    let moveX = 0;
    let moveZ = 0;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;
    if (input.fwd) moveZ -= 1;
    if (input.back) moveZ += 1;
    const len = Math.hypot(moveX, moveZ) || 1;
    moveX /= len;
    moveZ /= len;
    const payload = buildInputPayload({
      seq: ++runtime.lastInputSeq,
      moveX,
      moveZ,
      jump: !!(b.jumpQueued || input.jump),
      sprint: false,
      yaw: look.yaw,
      pitch: look.pitch,
      viewMode: look.viewMode
    });
    sendBattleMessage(payload);
    if (b.jumpQueued) b.jumpQueued = false;
  }, 50);
}

function stopInputLoop() {
  if (runtime.inputTimer) {
    clearInterval(runtime.inputTimer);
    runtime.inputTimer = null;
  }
}

function startHudLoop() {
  stopHudLoop();
  runtime.hudTimer = window.setInterval(() => {
    if (!runtime.open) return;
    safeInvoke("_rtBattle3dRenderScoreboard");
    safeInvoke("_rtBattle3dRenderResult");
    safeInvoke("_rtBattle3dRenderQuizUi");
    safeInvoke("_rtBattle3dUpdateStatusUi");
  }, 180);
}

function stopHudLoop() {
  if (runtime.hudTimer) {
    clearInterval(runtime.hudTimer);
    runtime.hudTimer = null;
  }
}

function startWatchdog() {
  stopWatchdog();
  runtime.watchdogTimer = window.setInterval(() => {
    if (!runtime.open) return;
    const st = getBattleState();
    const phase = String(st.phase || "").toLowerCase();
    if (phase === "countdown" || phase === "playing" || phase === "result" || phase === "lobby") {
      safeInvoke("_rtBattle3dMaybeAutoFinishLoading", "babylon:watchdog");
    }
    syncRendererFromState();
  }, 400);
}

function stopWatchdog() {
  if (runtime.watchdogTimer) {
    clearInterval(runtime.watchdogTimer);
    runtime.watchdogTimer = null;
  }
}

async function openBabylonOverlay() {
  const st = getBattleState();
  if (!st.connected) {
    safeInvoke("uiToast", "先にルームへ接続してください。");
    return;
  }
  if (runtime.open) return;
  runtime.active = true;
  runtime.quality = chooseGraphicsQuality(runtime.quality);
  setOpenState(true);
  applyLoadingStage("boot", { progress: 8 });
  safeInvoke("_rtBattle3dHideError");
  safeInvoke("_rtBattle3dRenderQuizUi");
  safeInvoke("_rtBattle3dRenderResult");
  safeInvoke("_rtBattle3dUpdateStatusUi");
  try {
    await ensureBabylon();
    applyLoadingStage("assets", { progress: 26 });
    const root = ensureOverlayReady();
    runtime.canvasWrap = document.getElementById("rt3dCanvasWrap");
    if (!(runtime.canvasWrap instanceof HTMLElement)) throw new Error("Canvas root is missing.");
    runtime.renderer = new SurvivalBabylonRenderer({
      container: runtime.canvasWrap,
      quality: runtime.quality
    });
    if (handleWorldValidationFailure(runtime.lastWorld, "open")) {
      closeBabylonOverlay();
      return;
    }
    runtime.renderer.setLocalPlayerKey(myPlayerKey());
    updateRendererViewMode();
    applyLoadingStage("scene", { progress: 52 });
    syncRendererFromState();
    applyLoadingStage("sync", { progress: 82 });
    startInputLoop();
    startHudLoop();
    startWatchdog();
    runtime.open = true;
    const b = ensureRuntimeState();
    b.status = "Babylon ロビーを準備しました";
    safeInvoke("_rtBattle3dUpdateStatusUi");
    pushToast("info", "Babylon preview ready");
    requestAnimationFrame(() => safeInvoke("_rtBattle3dMaybeAutoFinishLoading", "babylon:open"));
    if (root instanceof HTMLElement) root.dataset.renderer = "babylon";
  } catch (error) {
    console.error("[survival:babylon] open failed", error);
    runtime.active = false;
    setOpenState(false);
    safeInvoke("_rtBattle3dCancelLoading");
    safeInvoke("_rtBattle3dShowError", String(error?.message || "Babylon scene の初期化に失敗しました。"));
  }
}

function closeBabylonOverlay() {
  if (!runtime.open && !runtime.renderer) return;
  stopInputLoop();
  stopHudLoop();
  stopWatchdog();
  try {
    runtime.renderer?.dispose();
  } catch (_) {}
  runtime.renderer = null;
  runtime.open = false;
  runtime.active = false;
  runtime.lastSnapshot = null;
  runtime.lastWorld = null;
  safeInvoke("_rtBattle3dCancelLoading");
  const root = document.getElementById("rt3dOverlay");
  if (root instanceof HTMLElement) {
    root.dataset.renderer = "";
    root.classList.remove("is-quiz-open");
  }
  setOpenState(false);
}

function patchLifecycle() {
  if (runtime.patched) return;
  runtime.patched = true;
  patchLoadingBackgrounds();

  const baseOpen = window._rtBattle3dOpen;
  const baseClose = window._rtBattle3dClose;
  const baseHandleMessage = window._rtBattleHandleMessage;

  if (typeof baseOpen === "function") {
    window._rtBattle3dOpen = async function patchedRtBattle3dOpen() {
      if (shouldUseBabylon()) {
        await openBabylonOverlay();
        return;
      }
      return baseOpen.apply(this, arguments);
    };
  }

  if (typeof baseClose === "function") {
    window._rtBattle3dClose = function patchedRtBattle3dClose() {
      if (runtime.open || runtime.renderer) {
        closeBabylonOverlay();
        return;
      }
      return baseClose.apply(this, arguments);
    };
  }

  if (typeof baseHandleMessage === "function") {
    window._rtBattleHandleMessage = function patchedRtBattleHandleMessage(msg) {
      baseHandleMessage.apply(this, arguments);
      if (!runtime.renderer && !runtime.open && !shouldUseBabylon()) return;
      syncRendererFromMessage(msg);
      const type = String(msg?.type || "").toLowerCase();
      if (type === "countdown:start") {
        applyLoadingStage("match", { progress: 88 });
        safeInvoke("_rtBattle3dMaybeAutoFinishLoading", "babylon:countdown");
      } else if (type === "game:question") {
        applyLoadingStage("round", { progress: 96 });
        safeInvoke("_rtBattle3dMaybeAutoFinishLoading", "babylon:question");
      } else if (type === "game:result" || type === "game:final") {
        safeInvoke("_rtBattle3dRenderResult");
      } else if (type === "room:snapshot" || type === "state" || type === "game3d:world" || type === "game3d:snapshot") {
        safeInvoke("_rtBattle3dMaybeAutoFinishLoading", `babylon:${type}`);
      }
    };
  }
}

function bootstrapBabylonBridge() {
  window.VocabuSurvivalBabylon = {
    enable() {
      setInternalSwitch(true);
      runtime.active = false;
      return true;
    },
    disable() {
      setInternalSwitch(false);
      runtime.active = false;
      return true;
    },
    isEnabled() {
      return shouldUseBabylon();
    },
    async open() {
      await openBabylonOverlay();
    },
    close() {
      closeBabylonOverlay();
    },
    state() {
      return {
        active: runtime.active,
        open: runtime.open,
        quality: runtime.quality,
        route: isSurvivalRoute(),
        releaseGate: !!SURVIVAL_BABYLON_RELEASE_GATE
      };
    }
  };

  if (!isSurvivalRoute()) return;
  patchLifecycle();
  if (!shouldUseBabylon()) return;
  runtime.active = true;
  safeInvoke("_vSurvivalScheduleImmersive3d", "babylon:bootstrap");
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapBabylonBridge, { once: true });
  } else {
    bootstrapBabylonBridge();
  }
}
