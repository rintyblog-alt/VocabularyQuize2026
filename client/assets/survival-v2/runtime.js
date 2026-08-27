import { SurvivalLobbyBabylon } from "./lobby-babylon.js";
import {
  createLobbyShell,
  renderPartyList,
  renderMapCards,
  fillPresetSelect,
  fillQuestionCountSelect,
  updateLobbyFrame,
  setLoadingState,
  setRotateState,
  renderModeChips
} from "./lobby-ui.js";
import {
  chooseGraphicsQuality,
  persistGraphicsQuality,
  getGraphicsBadge,
  getLoadingPayload,
  rotateHint
} from "./ui.js";
import { listSurvivalThemes, getSurvivalTheme } from "./maps.js";

const BABYLON_CORE_URL = "https://cdn.babylonjs.com/babylon.js";
const FEATURE_FLAG_KEY = "vq:survival-v2:lobby";

const state = {
  active: false,
  shell: null,
  renderer: null,
  root: null,
  connected: false,
  loading: true,
  graphics: chooseGraphicsQuality(),
  hintIndex: 0,
  hintTimer: null,
  roomCode: "",
  playerCount: 0,
  maxPlayers: 8,
  isHost: false,
  mode: "race",
  mapId: "bridge",
  portrait: false,
  mobilePanel: "",
  babylonPromise: null,
  bootstrapped: false
};

if (isRoute()) {
  patchLegacyRouteHooks();
  hideLegacySurvivalUi();
}

function qs(name) {
  try { return new URLSearchParams(String(location.search || "")).get(name); } catch (_) { return null; }
}

function isRoute() {
  return /^\/survival-v2(?:\/|$)/i.test(String(location.pathname || ""));
}

function isEnabled() {
  if (!isRoute()) return false;
  return true;
}

function safe(fnName, ...args) {
  const fn = window[fnName];
  if (typeof fn !== "function") return undefined;
  try { return fn(...args); } catch (_) { return undefined; }
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((node) => String(node.src || "") === src);
    if (existing && window.BABYLON) { resolve(); return; }
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    if (!existing) document.head.appendChild(script);
  });
}

async function ensureBabylon() {
  if (window.BABYLON) return window.BABYLON;
  if (!state.babylonPromise) {
    state.babylonPromise = (async () => {
      await loadScript(BABYLON_CORE_URL);
      if (!window.BABYLON) throw new Error("Babylon.js failed to initialize.");
      return window.BABYLON;
    })();
  }
  return state.babylonPromise;
}

function hideLegacySurvivalUi() {
  try {
    document.body.classList.remove("auth-booting", "first-launch-open");
    document.getElementById("onlineOverlay")?.classList.remove("is-open");
    document.getElementById("rt3dOverlay")?.classList.remove("is-open");
    if (document.getElementById("onlineOverlay")) document.getElementById("onlineOverlay").hidden = true;
    if (document.getElementById("rt3dOverlay")) document.getElementById("rt3dOverlay").hidden = true;
    const authBoot = document.getElementById("authBootSplash");
    if (authBoot) authBoot.classList.add("hidden");
    const authGate = document.getElementById("authGate");
    if (authGate) authGate.classList.add("hidden");
    const firstLaunch = document.getElementById("firstLaunchOverlay");
    if (firstLaunch) {
      firstLaunch.classList.remove("is-active", "is-leaving");
      firstLaunch.classList.add("hidden");
    }
    const globalLoading = document.getElementById("globalLoadingOverlay") || document.getElementById("globalLoading");
    if (globalLoading) globalLoading.classList.add("hidden");
  } catch (_) {}
}

function patchLegacyRouteHooks() {
  if (window.__survivalV2LobbyPatched) return;
  window.__survivalV2LobbyPatched = true;
  const openBase = window._vSurvivalOpen;
  if (typeof openBase === "function") {
    window._vSurvivalOpen = function patchedSurvivalOpen(mode) {
      if (isRoute()) return;
      return openBase.apply(this, arguments);
    };
  }
  const shouldAutoBase = window._vSurvivalShouldAuto3d;
  if (typeof shouldAutoBase === "function") {
    window._vSurvivalShouldAuto3d = function patchedShouldAuto() {
      if (isRoute()) return false;
      return shouldAutoBase.apply(this, arguments);
    };
  }
}

function gatherPlayers() {
  const st = typeof window._rtBattleState === "function" ? window._rtBattleState() : {};
  const players = Array.isArray(st.players) ? st.players : [];
  const hostPid = Math.max(0, Number(st.room?.hostPlayerId || 0));
  return players.map((player) => ({
    ...player,
    host: Math.max(0, Number(player?.id || 0)) === hostPid
  }));
}

function buildPresetOptions() {
  const fn = window._rtBattlePresetOptions;
  return typeof fn === "function" ? fn() : [];
}

function buildQuestionCountOptions() {
  const fn = window._rtBattleQuestionCountOptions;
  return typeof fn === "function" ? fn() : [];
}

function battleState() {
  return typeof window._rtBattleState === "function" ? window._rtBattleState() : {};
}

function myPlayerId() {
  const fn = window._rtBattleMyPlayerId;
  return typeof fn === "function" ? Math.max(0, Number(fn() || 0)) : 0;
}

function isHost() {
  const fn = window._rtBattleIsHost;
  return typeof fn === "function" ? !!fn() : false;
}

function roomCode() {
  const st = battleState();
  return String(st.room?.roomId || st.roomId || "").toUpperCase();
}

function refreshUi() {
  if (!(state.root instanceof HTMLElement)) return;
  const st = battleState();
  const players = gatherPlayers();
  const countSelect = state.root.querySelector("[data-sv2-count-select]");
  const presetSelect = state.root.querySelector("[data-sv2-preset-select]");
  const qualitySelect = state.root.querySelector("[data-sv2-quality-select]");
  const createCountSelect = state.root.querySelector("[data-sv2-create-count]");
  const entryPanel = state.root.querySelector("[data-sv2-entry-panel]");
  const nickInput = state.root.querySelector("[data-sv2-nick-input]");
  const createPassword = state.root.querySelector("[data-sv2-create-password]");
  const joinRoom = state.root.querySelector("[data-sv2-join-room]");
  const joinPassword = state.root.querySelector("[data-sv2-join-password]");
  const activePreset = st.room?.presetRef?.type === "builtin"
    ? String(st.room?.presetRef?.key || "")
    : (st.room?.presetRef?.type === "custom" ? `custom:${String(st.room?.presetRef?.id || "")}` : "");
  fillPresetSelect(presetSelect, buildPresetOptions(), activePreset);
  fillQuestionCountSelect(countSelect, buildQuestionCountOptions(), String(st.room?.settings?.questionCount ?? st.questionCount ?? 20));
  fillQuestionCountSelect(createCountSelect, buildQuestionCountOptions(), String(st.questionCount ?? 20));
  if (qualitySelect instanceof HTMLSelectElement) qualitySelect.value = state.graphics;
  if (nickInput instanceof HTMLInputElement && document.activeElement !== nickInput) nickInput.value = String(st.nickname || "");
  if (createPassword instanceof HTMLInputElement && document.activeElement !== createPassword) createPassword.value = String(st.roomPassword || "");
  if (joinRoom instanceof HTMLInputElement && document.activeElement !== joinRoom) joinRoom.value = String(st.joinRoomId || "");
  if (joinPassword instanceof HTMLInputElement && document.activeElement !== joinPassword) joinPassword.value = String(st.joinPassword || "");
  renderPartyList(state.root.querySelector("[data-sv2-party-list]"), players, myPlayerId());
  renderModeChips(state.root.querySelector("[data-sv2-mode-row]"), state.mode);
  renderMapCards(state.root.querySelector("[data-sv2-map-grid]"), state.mapId);
  updateLobbyFrame(state.root, {
    roomCode: roomCode(),
    connected: !!st.connected,
    connecting: !!st.connecting,
    playerCount: players.length,
    maxPlayers: Number(st.room?.max || 8),
    isHost: isHost(),
    graphicsLabel: getGraphicsBadge(state.graphics).label
  });
  state.root.classList.toggle("is-party-open", state.mobilePanel === "party");
  state.root.classList.toggle("is-match-open", state.mobilePanel === "match");
  if (entryPanel instanceof HTMLElement) entryPanel.classList.toggle("sv2-entry-hidden", !!st.connected);
  state.renderer?.setTheme(state.mapId);
  state.renderer?.setPlayers(players, myPlayerId());
  setRotateState(state.root, state.portrait);
}

function updateLoading(active, stageKey = "boot") {
  if (!(state.root instanceof HTMLElement)) return;
  state.loading = !!active;
  const payload = getLoadingPayload(state.mapId, state.mode, battleState().room?.presetName || "ALL", stageKey);
  setLoadingState(state.root, {
    active,
    stageText: payload.stageText,
    hintText: rotateHint(state.hintIndex),
    progress: active ? (stageKey === "boot" ? 18 : stageKey === "scene" ? 52 : stageKey === "ready" ? 100 : 74) : 100,
    metaText: `${payload.mapLabel} · ${payload.modeLabel} · ${payload.presetLabel}`
  });
}

function bindHintRotation() {
  if (state.hintTimer) clearInterval(state.hintTimer);
  state.hintTimer = setInterval(() => {
    state.hintIndex = (state.hintIndex + 1) % 6;
    if (state.loading) updateLoading(true, "scene");
  }, 2800);
}

function handlePortrait() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches && window.innerWidth < 1100;
  state.portrait = !!isPortrait;
  setRotateState(state.root, isPortrait);
}

function maybeLockOrientation() {
  const scr = screen;
  if (!scr || !scr.orientation || typeof scr.orientation.lock !== "function") return;
  try { scr.orientation.lock("landscape").catch(() => {}); } catch (_) {}
}

function wireEvents() {
  if (!(state.root instanceof HTMLElement)) return;
  state.root.addEventListener("input", (event) => {
    const target = event.target;
    const st = battleState();
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-sv2-nick-input]")) st.nickname = String(target.value || "").trim().slice(0, 32);
    if (target.matches("[data-sv2-create-password]")) st.roomPassword = String(target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (target.matches("[data-sv2-join-room]")) st.joinRoomId = String(target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (target.matches("[data-sv2-join-password]")) st.joinPassword = String(target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  });
  state.root.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-sv2-action],[data-sv2-map],[data-sv2-mode]");
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-sv2-action");
    if (action === "show-party") { state.mobilePanel = state.mobilePanel === "party" ? "" : "party"; refreshUi(); return; }
    if (action === "show-match") { state.mobilePanel = state.mobilePanel === "match" ? "" : "match"; refreshUi(); return; }
    if (action === "close-drawers") { state.mobilePanel = ""; refreshUi(); return; }
    if (action === "leave") { safe("_rtBattleLeave"); return; }
    if (action === "create-room") { safe("_rtBattleStart"); return; }
    if (action === "join-room") { safe("_rtBattleReconnect"); return; }
    if (action === "ready") {
      const st = battleState();
      const me = (Array.isArray(st.players) ? st.players : []).find((p) => Math.max(0, Number(p?.id || 0)) === myPlayerId());
      safe("_rtBattleSetReady", !(me && me.ready));
      return;
    }
    if (action === "play") { safe("_rtBattleStartGame"); return; }
    if (action === "copy") {
      const code = roomCode();
      if (!code) return;
      navigator.clipboard?.writeText(code).then(() => {
        try { window.uiToast?.("Room code copied."); } catch (_) {}
      }).catch(() => {});
      return;
    }
    const mapId = target.getAttribute("data-sv2-map");
    if (mapId) {
      state.mapId = String(mapId);
      state.mobilePanel = "";
      safe("_rtBattleSafeSend", { type: "game3d:map:set", mapId: state.mapId });
      refreshUi();
      return;
    }
    const mode = target.getAttribute("data-sv2-mode");
    if (mode) {
      state.mode = String(mode);
      refreshUi();
    }
  });
  state.root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-sv2-create-count]")) {
      battleState().questionCount = String(target.value || "");
      return;
    }
    if (target.matches("[data-sv2-preset-select]")) {
      safe("_rtBattleSendPresetSelection");
      return;
    }
    if (target.matches("[data-sv2-count-select]")) {
      safe("_rtBattleSendRoomSettings");
      return;
    }
    if (target.matches("[data-sv2-quality-select]")) {
      state.graphics = persistGraphicsQuality(target.value);
      state.renderer?.setGraphicsQuality(state.graphics);
      refreshUi();
    }
  });
}

function createEntryBridge() {
  const st = battleState();
  if (st.connected || st.connecting) return;
  const nick = st.nickname || "Player";
  try {
    if (!st.nickname) st.nickname = nick;
  } catch (_) {}
}

async function bootstrap() {
  if (state.bootstrapped) return;
  if (!isEnabled()) return;
  state.bootstrapped = true;
  patchLegacyRouteHooks();
  hideLegacySurvivalUi();
  state.active = true;
  state.shell = createLobbyShell();
  document.body.appendChild(state.shell);
  state.root = state.shell;
  createEntryBridge();
  bindHintRotation();
  handlePortrait();
  window.addEventListener("resize", handlePortrait);
  maybeLockOrientation();
  wireEvents();
  updateLoading(true, "boot");
  await ensureBabylon();
  updateLoading(true, "scene");
  const canvas = state.root.querySelector("[data-sv2-canvas]");
  state.renderer = new SurvivalLobbyBabylon({ canvas, quality: state.graphics });
  await state.renderer.mount();
  state.mapId = String(battleState().game3d?.mapId || battleState().room?.game3d?.mapId || "bridge").toLowerCase();
  refreshUi();
  updateLoading(false, "ready");
  setInterval(refreshUi, 350);
}

function startBootstrap() {
  if (!isEnabled()) return;
  bootstrap().catch((err) => {
    console.error("[survival-v2:lobby]", err);
    try { window.uiToast?.(String(err?.message || "Failed to open lobby.")); } catch (_) {}
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBootstrap, { once: true });
} else {
  startBootstrap();
}
