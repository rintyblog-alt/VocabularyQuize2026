import { getGraphicsProfile, getSurvivalTheme, getSurvivalLoadingBackgrounds, normalizeGraphicsQuality } from "./maps.js";

export const SURVIVAL_LOADING_HINTS = Object.freeze([
  "正解するとゲートが開きます。",
  "不正解だと前のチェックポイントに戻ります。",
  "マップごとにギミックが異なります。",
  "1人称と3人称は切り替え可能です。",
  "連続正解で短いブーストが入ります。",
  "フレンドと一緒に勝ち抜きを楽しもう。"
]);

function readStoredQuality() {
  try {
    if (typeof localStorage === "undefined") return "";
    return String(localStorage.getItem("vq:survival:gfx") || "");
  } catch (_) {
    return "";
  }
}

export function chooseGraphicsQuality(raw) {
  return normalizeGraphicsQuality(raw || readStoredQuality() || "");
}

export function persistGraphicsQuality(raw) {
  const normalized = chooseGraphicsQuality(raw);
  try { localStorage.setItem("vq:survival:gfx", normalized); } catch (_) {}
  return normalized;
}

export function getGraphicsBadge(raw) {
  const profile = getGraphicsProfile(raw);
  return {
    id: profile.id,
    label: profile.label
  };
}

export function getLoadingPayload(mapId, modeLabel, presetLabel, stageKey = "boot") {
  const theme = getSurvivalTheme(mapId);
  const stageMap = {
    boot: "Initializing scene...",
    assets: "Loading arena assets...",
    scene: "Building Babylon scene...",
    map: `${theme.label} を読み込み中...`,
    sync: "Syncing players...",
    match: "Preparing match...",
    round: "Starting match...",
    ready: "Ready to play"
  };
  return {
    title: "VocabuSurvival",
    subtitle: stageMap[stageKey] || "Loading arena...",
    stageText: stageMap[stageKey] || "Loading arena...",
    mapLabel: theme.label,
    modeLabel: String(modeLabel || "Race"),
    presetLabel: String(presetLabel || "ALL"),
    backgrounds: getSurvivalLoadingBackgrounds(mapId)
  };
}

export function rotateHint(index = 0) {
  const safeIndex = Math.max(0, Number(index || 0)) % SURVIVAL_LOADING_HINTS.length;
  return SURVIVAL_LOADING_HINTS[safeIndex];
}
