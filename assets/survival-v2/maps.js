export const SURVIVAL_BABYLON_RELEASE_GATE = false;
export const SURVIVAL_PRIORITY_MAPS = Object.freeze(["bridge", "city", "volcano", "gauntlet"]);

export const SURVIVAL_GRAPHICS_PROFILES = Object.freeze({
  low: Object.freeze({
    id: "low",
    label: "Low",
    scalingLevel: 1.45,
    environmentDensity: 0.45,
    farLayers: 1,
    effectLevel: 0.35,
    textureScale: 0.7,
    drawDistance: 0.7
  }),
  medium: Object.freeze({
    id: "medium",
    label: "Medium",
    scalingLevel: 1.15,
    environmentDensity: 0.72,
    farLayers: 2,
    effectLevel: 0.6,
    textureScale: 0.92,
    drawDistance: 0.88
  }),
  high: Object.freeze({
    id: "high",
    label: "High",
    scalingLevel: 1,
    environmentDensity: 1,
    farLayers: 3,
    effectLevel: 1,
    textureScale: 1,
    drawDistance: 1
  })
});

const MAPS = Object.freeze({
  bridge: {
    id: "bridge",
    label: "Bridge Run",
    tag: "High Bridge",
    description: "長い高所橋を渡りながら、崩れる橋と横風を越えるマップ。",
    skyTop: "#6aa8ff",
    skyBottom: "#d8f0ff",
    fogColor: "#b8d4f6",
    ambientColor: "#eef7ff",
    groundColor: "#e2edf8",
    laneColor: "#d6e3ef",
    edgeColor: "#5f7ea6",
    accentColor: "#8ed0ff",
    accentGlow: "#b7ebff",
    hazardColor: "#ff8e6f",
    railColor: "#314a6d",
    backdropColor: "#95b9df",
    loadingBackgrounds: [
      "linear-gradient(140deg, rgba(17,32,69,.92) 0%, rgba(40,95,168,.82) 45%, rgba(159,220,255,.72) 100%)",
      "radial-gradient(circle at 20% 18%, rgba(189,230,255,.38), transparent 30%), linear-gradient(160deg, rgba(16,34,68,.94) 0%, rgba(61,111,188,.86) 52%, rgba(207,238,255,.62) 100%)",
      "linear-gradient(180deg, rgba(20,28,56,.96) 0%, rgba(61,123,203,.88) 40%, rgba(159,205,247,.76) 100%), radial-gradient(circle at 78% 22%, rgba(255,255,255,.2), transparent 28%)"
    ],
    environment: Object.freeze({
      horizonType: "bridge",
      skylineLayers: 2,
      landmarkDensity: 1.08,
      bridgeTowerCount: 3,
      bridgeDropDepth: 18,
      windRibbonCount: 5
    })
  },
  city: {
    id: "city",
    label: "Metro Rush",
    tag: "City",
    description: "高架と街路を切り替えながら、頭上を走る車と狭い区間を抜けるマップ。",
    skyTop: "#4d6084",
    skyBottom: "#b7c9e6",
    fogColor: "#c0cadb",
    ambientColor: "#f2f5fa",
    groundColor: "#4c5567",
    laneColor: "#2e3441",
    edgeColor: "#9da9bd",
    accentColor: "#66a5ff",
    accentGlow: "#8bbdff",
    hazardColor: "#f37e5b",
    railColor: "#d8dde6",
    sidewalkColor: "#767f8d",
    roadStripeColor: "#f7f1d5",
    backdropColor: "#7a869b",
    loadingBackgrounds: [
      "linear-gradient(145deg, rgba(17,20,28,.95) 0%, rgba(41,49,65,.88) 42%, rgba(108,132,172,.8) 100%), radial-gradient(circle at 76% 20%, rgba(255,208,143,.28), transparent 24%)",
      "linear-gradient(180deg, rgba(18,22,31,.96) 0%, rgba(42,54,76,.9) 36%, rgba(102,124,160,.78) 100%), radial-gradient(circle at 16% 84%, rgba(255,255,255,.16), transparent 22%)",
      "linear-gradient(135deg, rgba(15,18,25,.98) 0%, rgba(44,56,77,.9) 35%, rgba(93,117,153,.82) 100%), radial-gradient(circle at 26% 18%, rgba(254,198,130,.2), transparent 28%)"
    ],
    environment: Object.freeze({
      horizonType: "city",
      skylineLayers: 3,
      landmarkDensity: 1.35,
      buildingBands: 3,
      elevatedRoads: 2,
      trafficLanes: 2,
      billboardCount: 4,
      roadsideDetail: 1.2
    })
  },
  snow: {
    id: "snow",
    label: "Snow Drift",
    tag: "Snow",
    description: "雪原と氷橋を進み、滑る床と雪玉をかわすマップ。",
    skyTop: "#90bfff",
    skyBottom: "#eef7ff",
    fogColor: "#e7f1fb",
    ambientColor: "#fbfdff",
    groundColor: "#f2f7fb",
    laneColor: "#e6eef6",
    edgeColor: "#8fb3d9",
    accentColor: "#8fdcff",
    accentGlow: "#d0f6ff",
    hazardColor: "#78a9d7",
    railColor: "#b6d2ea",
    backdropColor: "#dce9f6",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(35,66,110,.92) 0%, rgba(126,178,232,.86) 42%, rgba(241,249,255,.86) 100%)",
      "linear-gradient(180deg, rgba(42,74,117,.94) 0%, rgba(118,168,220,.88) 48%, rgba(234,244,255,.9) 100%), radial-gradient(circle at 70% 18%, rgba(255,255,255,.28), transparent 26%)",
      "radial-gradient(circle at 22% 20%, rgba(255,255,255,.28), transparent 22%), linear-gradient(135deg, rgba(42,77,126,.94) 0%, rgba(137,192,241,.88) 54%, rgba(242,249,255,.92) 100%)"
    ]
  },
  factory: {
    id: "factory",
    label: "Factory Pulse",
    tag: "Factory",
    description: "鉄骨とコンベア、プレス機が待ち受ける工場マップ。",
    skyTop: "#51606d",
    skyBottom: "#bac7d0",
    fogColor: "#cfd6dd",
    ambientColor: "#f1f3f6",
    groundColor: "#636d77",
    laneColor: "#444b54",
    edgeColor: "#9aa2aa",
    accentColor: "#7fd3ff",
    accentGlow: "#b9ecff",
    hazardColor: "#f0a15d",
    railColor: "#adb4bc",
    backdropColor: "#69737e",
    loadingBackgrounds: [
      "linear-gradient(145deg, rgba(19,24,31,.96) 0%, rgba(53,63,75,.9) 48%, rgba(138,154,167,.8) 100%)",
      "linear-gradient(180deg, rgba(22,27,34,.96) 0%, rgba(62,73,86,.9) 46%, rgba(159,173,185,.84) 100%)"
    ]
  },
  jungle: {
    id: "jungle",
    label: "Jungle Swing",
    tag: "Jungle",
    description: "ツタと泥を越えて遺跡の間を駆け抜けるマップ。",
    skyTop: "#4f8157",
    skyBottom: "#b8d3a2",
    fogColor: "#cfe4bc",
    ambientColor: "#f7fbef",
    groundColor: "#4d6843",
    laneColor: "#687f52",
    edgeColor: "#8e9d74",
    accentColor: "#d6c96e",
    accentGlow: "#f4e498",
    hazardColor: "#8a5f3a",
    railColor: "#6d7a58",
    backdropColor: "#4d6c40",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(15,35,22,.95) 0%, rgba(48,96,53,.88) 44%, rgba(178,205,132,.78) 100%)",
      "radial-gradient(circle at 74% 22%, rgba(255,235,161,.18), transparent 20%), linear-gradient(160deg, rgba(18,40,24,.95) 0%, rgba(58,110,62,.88) 48%, rgba(191,213,145,.8) 100%)"
    ]
  },
  lab: {
    id: "lab",
    label: "Lab Flux",
    tag: "Lab",
    description: "白い実験施設にレーザーとワープ床が配置されたマップ。",
    skyTop: "#7f96b9",
    skyBottom: "#eef4ff",
    fogColor: "#edf3ff",
    ambientColor: "#ffffff",
    groundColor: "#f4f7fb",
    laneColor: "#dee6ef",
    edgeColor: "#95a3b6",
    accentColor: "#58d1ff",
    accentGlow: "#97ebff",
    hazardColor: "#ff7b7b",
    railColor: "#bac7d4",
    backdropColor: "#ced9e6",
    loadingBackgrounds: [
      "linear-gradient(145deg, rgba(25,39,62,.92) 0%, rgba(110,137,176,.84) 42%, rgba(239,246,255,.92) 100%)",
      "linear-gradient(180deg, rgba(28,43,66,.94) 0%, rgba(122,148,186,.86) 44%, rgba(247,250,255,.94) 100%)"
    ]
  },
  sky: {
    id: "sky",
    label: "Sky Drift",
    tag: "Sky",
    description: "浮島と雲足場、強風が特徴の空中マップ。",
    skyTop: "#64a7ff",
    skyBottom: "#edf7ff",
    fogColor: "#dfefff",
    ambientColor: "#ffffff",
    groundColor: "#dceeff",
    laneColor: "#f5fbff",
    edgeColor: "#90b8de",
    accentColor: "#6bd1ff",
    accentGlow: "#bbf0ff",
    hazardColor: "#ffcf85",
    railColor: "#9bc2e7",
    backdropColor: "#cfe3fb",
    loadingBackgrounds: [
      "linear-gradient(160deg, rgba(31,79,154,.9) 0%, rgba(103,170,255,.84) 50%, rgba(241,248,255,.94) 100%)",
      "radial-gradient(circle at 18% 24%, rgba(255,255,255,.34), transparent 22%), linear-gradient(145deg, rgba(40,92,170,.9) 0%, rgba(122,188,255,.84) 48%, rgba(245,251,255,.95) 100%)"
    ]
  },
  volcano: {
    id: "volcano",
    label: "Volcano Core",
    tag: "Volcano",
    description: "溶岩と落石、噴気孔を避けながら進む火山マップ。",
    skyTop: "#3b2530",
    skyBottom: "#8f4231",
    fogColor: "#9d4e35",
    ambientColor: "#ffe7d2",
    groundColor: "#4e3029",
    laneColor: "#5e3a2d",
    edgeColor: "#8a6556",
    accentColor: "#ffb36a",
    accentGlow: "#ffd39a",
    hazardColor: "#ff5d38",
    railColor: "#7e665e",
    backdropColor: "#5f392c",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(16,8,9,.96) 0%, rgba(75,27,18,.9) 32%, rgba(166,71,40,.84) 100%)",
      "radial-gradient(circle at 76% 20%, rgba(255,158,90,.26), transparent 22%), linear-gradient(180deg, rgba(19,10,12,.98) 0%, rgba(83,30,20,.9) 38%, rgba(179,80,43,.84) 100%)",
      "linear-gradient(135deg, rgba(22,11,13,.98) 0%, rgba(71,24,18,.92) 30%, rgba(202,94,44,.82) 100%), radial-gradient(circle at 16% 82%, rgba(255,217,162,.18), transparent 18%)"
    ],
    environment: Object.freeze({
      horizonType: "volcano",
      skylineLayers: 2,
      landmarkDensity: 1.2,
      calderaRings: 2,
      lavaFalls: 3,
      ventCount: 6,
      cliffBands: 3
    })
  },
  aqua: {
    id: "aqua",
    label: "Aqua Stream",
    tag: "Aqua",
    description: "水流と浮遊足場を越える水辺マップ。",
    skyTop: "#3e8ab3",
    skyBottom: "#d4f2ff",
    fogColor: "#d7eef6",
    ambientColor: "#f6fcff",
    groundColor: "#8cc6d7",
    laneColor: "#69adc5",
    edgeColor: "#4b87a0",
    accentColor: "#a5f0ff",
    accentGlow: "#d9fbff",
    hazardColor: "#5ca9ff",
    railColor: "#93d0de",
    backdropColor: "#61a9bc",
    loadingBackgrounds: [
      "linear-gradient(160deg, rgba(18,65,92,.94) 0%, rgba(54,146,181,.86) 48%, rgba(212,241,255,.92) 100%)",
      "radial-gradient(circle at 70% 22%, rgba(255,255,255,.22), transparent 20%), linear-gradient(145deg, rgba(18,59,87,.96) 0%, rgba(76,164,196,.86) 52%, rgba(227,248,255,.94) 100%)"
    ]
  },
  ice: {
    id: "ice",
    label: "Ice Rift",
    tag: "Ice",
    description: "極端に滑る床と割れる氷が待つ氷床マップ。",
    skyTop: "#7ca7d6",
    skyBottom: "#eef7ff",
    fogColor: "#edf5ff",
    ambientColor: "#ffffff",
    groundColor: "#deefff",
    laneColor: "#cfe6fb",
    edgeColor: "#7ea3cc",
    accentColor: "#85dbff",
    accentGlow: "#d0f7ff",
    hazardColor: "#89b8f4",
    railColor: "#b4d0e9",
    backdropColor: "#c2dcf1",
    loadingBackgrounds: [
      "linear-gradient(155deg, rgba(29,55,96,.94) 0%, rgba(106,150,206,.88) 46%, rgba(242,248,255,.96) 100%)",
      "radial-gradient(circle at 24% 18%, rgba(255,255,255,.24), transparent 20%), linear-gradient(145deg, rgba(28,58,102,.95) 0%, rgba(121,168,222,.88) 54%, rgba(245,250,255,.96) 100%)"
    ]
  },
  desert: {
    id: "desert",
    label: "Desert Tempest",
    tag: "Desert",
    description: "流砂と砂嵐を抜ける砂漠の遺跡マップ。",
    skyTop: "#6c5239",
    skyBottom: "#f0c68f",
    fogColor: "#e7c894",
    ambientColor: "#fff3dc",
    groundColor: "#b58c5a",
    laneColor: "#c99d63",
    edgeColor: "#8d6b45",
    accentColor: "#f3d58b",
    accentGlow: "#ffe6b4",
    hazardColor: "#d68b42",
    railColor: "#c9ad7d",
    backdropColor: "#c0945e",
    loadingBackgrounds: [
      "linear-gradient(155deg, rgba(38,23,15,.96) 0%, rgba(108,68,33,.9) 34%, rgba(215,160,92,.84) 100%)",
      "radial-gradient(circle at 74% 18%, rgba(255,228,164,.2), transparent 22%), linear-gradient(145deg, rgba(43,26,17,.98) 0%, rgba(115,72,36,.9) 38%, rgba(230,178,104,.84) 100%)",
      "linear-gradient(180deg, rgba(43,26,16,.98) 0%, rgba(126,76,37,.9) 42%, rgba(238,192,121,.86) 100%)"
    ]
  },
  rail: {
    id: "rail",
    label: "Rail Split",
    tag: "Rail",
    description: "線路と電車、移動台車を使うレールマップ。",
    skyTop: "#58697a",
    skyBottom: "#ccd5dc",
    fogColor: "#d5dbe2",
    ambientColor: "#f5f7f9",
    groundColor: "#6a6a67",
    laneColor: "#4e4e4a",
    edgeColor: "#9ca29f",
    accentColor: "#77c4ff",
    accentGlow: "#bbe5ff",
    hazardColor: "#f08d5d",
    railColor: "#d3d7dc",
    backdropColor: "#727979",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(19,24,28,.96) 0%, rgba(76,88,101,.9) 48%, rgba(189,199,207,.86) 100%)",
      "linear-gradient(180deg, rgba(22,26,30,.97) 0%, rgba(82,96,109,.9) 44%, rgba(204,212,219,.86) 100%)"
    ]
  },
  canyon: {
    id: "canyon",
    label: "Canyon Edge",
    tag: "Canyon",
    description: "狭い尾根道と転がる岩が特徴の峡谷マップ。",
    skyTop: "#8d6450",
    skyBottom: "#e2c29f",
    fogColor: "#d8b38f",
    ambientColor: "#fff0df",
    groundColor: "#8c6449",
    laneColor: "#a77b59",
    edgeColor: "#6f503b",
    accentColor: "#f8cc8b",
    accentGlow: "#ffe1ad",
    hazardColor: "#b46d46",
    railColor: "#a77e67",
    backdropColor: "#956847",
    loadingBackgrounds: [
      "linear-gradient(145deg, rgba(40,22,18,.96) 0%, rgba(117,69,49,.9) 46%, rgba(222,180,140,.86) 100%)",
      "radial-gradient(circle at 20% 20%, rgba(255,219,169,.16), transparent 22%), linear-gradient(160deg, rgba(46,26,20,.98) 0%, rgba(129,77,53,.9) 44%, rgba(230,192,149,.86) 100%)"
    ]
  },
  ruins: {
    id: "ruins",
    label: "Ruins Wake",
    tag: "Ruins",
    description: "崩れる石床と神殿の柱が並ぶ遺跡マップ。",
    skyTop: "#726d60",
    skyBottom: "#e4d7bc",
    fogColor: "#d9cfbb",
    ambientColor: "#fbf7ef",
    groundColor: "#8c7b5d",
    laneColor: "#a48f71",
    edgeColor: "#6e624b",
    accentColor: "#f4d18f",
    accentGlow: "#ffebb8",
    hazardColor: "#a0714f",
    railColor: "#baa98d",
    backdropColor: "#8c785d",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(23,20,18,.96) 0%, rgba(85,73,55,.9) 42%, rgba(214,191,150,.86) 100%)",
      "linear-gradient(180deg, rgba(26,23,20,.98) 0%, rgba(96,82,62,.9) 40%, rgba(225,204,167,.88) 100%)"
    ]
  },
  neon: {
    id: "neon",
    label: "Neon Pulse",
    tag: "Neon",
    description: "発光床とネオン柱、リズムギミックが特徴のマップ。",
    skyTop: "#1d153d",
    skyBottom: "#271d60",
    fogColor: "#2f2c69",
    ambientColor: "#f8f6ff",
    groundColor: "#17133b",
    laneColor: "#251d65",
    edgeColor: "#8b74ff",
    accentColor: "#76d4ff",
    accentGlow: "#d76dff",
    hazardColor: "#ff5be4",
    railColor: "#6d63d4",
    backdropColor: "#221a52",
    loadingBackgrounds: [
      "linear-gradient(145deg, rgba(8,7,21,.98) 0%, rgba(32,22,85,.92) 42%, rgba(101,61,196,.84) 100%), radial-gradient(circle at 76% 18%, rgba(117,221,255,.22), transparent 24%)",
      "linear-gradient(180deg, rgba(8,7,25,.99) 0%, rgba(40,26,98,.92) 34%, rgba(139,69,214,.84) 100%), radial-gradient(circle at 22% 82%, rgba(255,120,238,.16), transparent 20%)",
      "linear-gradient(135deg, rgba(10,8,24,.99) 0%, rgba(30,23,87,.93) 38%, rgba(86,57,194,.86) 100%)"
    ]
  },
  gauntlet: {
    id: "gauntlet",
    label: "Final Gauntlet",
    tag: "Final",
    description: "複数のギミックと景色が混ざる最終ステージ。",
    skyTop: "#223040",
    skyBottom: "#56708f",
    fogColor: "#6884a2",
    ambientColor: "#f4f7fb",
    groundColor: "#3a4557",
    laneColor: "#485a71",
    edgeColor: "#a5b7cb",
    accentColor: "#ffcc77",
    accentGlow: "#ffe6b6",
    hazardColor: "#ff7f56",
    railColor: "#ccd8e4",
    backdropColor: "#4c6079",
    loadingBackgrounds: [
      "linear-gradient(150deg, rgba(11,16,22,.98) 0%, rgba(41,61,87,.92) 36%, rgba(103,137,176,.84) 100%), radial-gradient(circle at 76% 20%, rgba(255,207,121,.22), transparent 22%)",
      "linear-gradient(180deg, rgba(11,16,24,.98) 0%, rgba(45,67,95,.92) 42%, rgba(126,152,188,.84) 100%), radial-gradient(circle at 18% 84%, rgba(255,131,99,.14), transparent 18%)",
      "linear-gradient(135deg, rgba(12,17,25,.99) 0%, rgba(38,53,79,.94) 34%, rgba(109,135,174,.86) 100%)"
    ],
    environment: Object.freeze({
      horizonType: "gauntlet",
      skylineLayers: 3,
      landmarkDensity: 1.45,
      gauntletZones: 4,
      monumentCount: 6,
      mixedDecorBands: 4
    })
  }
});

export function listSurvivalThemes() {
  return Object.values(MAPS);
}

export function getSurvivalTheme(mapId) {
  const key = String(mapId || "bridge").toLowerCase();
  return MAPS[key] || MAPS.bridge;
}

export function getSurvivalLoadingBackgrounds(mapId) {
  const theme = getSurvivalTheme(mapId);
  return Array.isArray(theme.loadingBackgrounds) && theme.loadingBackgrounds.length
    ? theme.loadingBackgrounds.slice()
    : MAPS.bridge.loadingBackgrounds.slice();
}

export function normalizeGraphicsQuality(raw) {
  const key = String(raw || "").toLowerCase();
  if (SURVIVAL_GRAPHICS_PROFILES[key]) return key;
  try {
    const dm = Math.max(0, Number(navigator.deviceMemory || 0));
    const hc = Math.max(0, Number(navigator.hardwareConcurrency || 0));
    if (dm >= 8 || hc >= 8) return "high";
    if (dm >= 4 || hc >= 4) return "medium";
  } catch (_) {}
  return "low";
}

export function getGraphicsProfile(raw) {
  return SURVIVAL_GRAPHICS_PROFILES[normalizeGraphicsQuality(raw)] || SURVIVAL_GRAPHICS_PROFILES.medium;
}

export function isBabylonReleaseReady() {
  return !!SURVIVAL_BABYLON_RELEASE_GATE;
}

export function buildThemeEnvironmentSeed(mapId, qualityId) {
  const theme = getSurvivalTheme(mapId);
  const quality = getGraphicsProfile(qualityId);
  return {
    mapId: theme.id,
    quality,
    buildingRows: Math.max(1, Math.round(quality.environmentDensity * (theme.id === "city" ? 6 : 3))),
    farLayers: Math.max(1, quality.farLayers),
    decorCount: Math.max(4, Math.round(quality.environmentDensity * (theme.id === "gauntlet" ? 28 : 18))),
    effectLevel: quality.effectLevel
  };
}
