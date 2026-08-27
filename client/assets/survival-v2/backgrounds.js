import { getSurvivalTheme } from "./maps.js";

const V2_BACKGROUNDS = Object.freeze({
  bridge: [
    "linear-gradient(155deg, rgba(6,12,26,.98) 0%, rgba(27,55,108,.92) 42%, rgba(120,190,255,.72) 100%), radial-gradient(circle at 78% 16%, rgba(255,255,255,.18), transparent 22%), linear-gradient(180deg, transparent 0 62%, rgba(12,36,70,.42) 62% 64%, transparent 64%)",
    "linear-gradient(180deg, rgba(8,16,34,.99) 0%, rgba(33,77,145,.9) 46%, rgba(181,226,255,.72) 100%), radial-gradient(circle at 20% 82%, rgba(255,255,255,.14), transparent 16%), linear-gradient(90deg, transparent 0 18%, rgba(255,255,255,.06) 18% 19%, transparent 19% 81%, rgba(255,255,255,.06) 81% 82%, transparent 82%)",
    "linear-gradient(145deg, rgba(10,19,41,.98) 0%, rgba(40,92,168,.9) 44%, rgba(159,216,255,.76) 100%), radial-gradient(circle at 12% 18%, rgba(240,248,255,.12), transparent 18%), linear-gradient(180deg, transparent 0 58%, rgba(32,78,132,.32) 58% 60%, transparent 60%)"
  ],
  city: [
    "linear-gradient(160deg, rgba(7,10,16,.99) 0%, rgba(26,34,49,.94) 42%, rgba(82,108,148,.82) 100%), linear-gradient(90deg, transparent 0 12%, rgba(255,210,126,.08) 12% 13%, transparent 13% 27%, rgba(255,210,126,.06) 27% 28%, transparent 28% 100%), radial-gradient(circle at 74% 18%, rgba(255,189,104,.18), transparent 20%)",
    "linear-gradient(180deg, rgba(9,12,18,.99) 0%, rgba(31,42,60,.94) 34%, rgba(96,120,157,.84) 100%), linear-gradient(0deg, rgba(255,255,255,.04) 0 20%, transparent 20% 100%), repeating-linear-gradient(90deg, transparent 0 8%, rgba(255,255,255,.03) 8% 9.4%, transparent 9.4% 18%)",
    "linear-gradient(145deg, rgba(8,10,15,.99) 0%, rgba(34,44,61,.94) 38%, rgba(102,124,160,.86) 100%), radial-gradient(circle at 22% 22%, rgba(255,214,140,.14), transparent 18%), linear-gradient(180deg, transparent 0 68%, rgba(14,18,27,.5) 68% 100%)"
  ],
  volcano: [
    "linear-gradient(160deg, rgba(10,5,7,.99) 0%, rgba(64,20,15,.94) 28%, rgba(169,67,38,.86) 100%), radial-gradient(circle at 78% 18%, rgba(255,170,102,.22), transparent 20%), linear-gradient(180deg, transparent 0 64%, rgba(255,103,47,.18) 64% 70%, transparent 70%)",
    "linear-gradient(180deg, rgba(11,5,7,.99) 0%, rgba(53,17,13,.95) 34%, rgba(196,88,42,.84) 100%), radial-gradient(circle at 18% 84%, rgba(255,220,166,.12), transparent 16%), linear-gradient(90deg, transparent 0 24%, rgba(255,101,51,.1) 24% 25%, transparent 25% 75%, rgba(255,101,51,.08) 75% 76%, transparent 76%)",
    "linear-gradient(145deg, rgba(12,6,7,.99) 0%, rgba(59,19,14,.95) 32%, rgba(221,103,46,.84) 100%), radial-gradient(circle at 50% 15%, rgba(255,208,146,.12), transparent 18%), linear-gradient(180deg, transparent 0 56%, rgba(255,92,46,.14) 56% 62%, transparent 62%)"
  ],
  snow: [
    "linear-gradient(150deg, rgba(16,34,68,.96) 0%, rgba(107,164,224,.88) 46%, rgba(240,249,255,.96) 100%), radial-gradient(circle at 78% 18%, rgba(255,255,255,.22), transparent 24%), repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 10px, transparent 10px 22px)",
    "linear-gradient(180deg, rgba(23,48,91,.96) 0%, rgba(125,176,231,.9) 48%, rgba(246,251,255,.96) 100%), radial-gradient(circle at 18% 80%, rgba(255,255,255,.14), transparent 18%), linear-gradient(90deg, transparent 0 30%, rgba(255,255,255,.05) 30% 31%, transparent 31% 69%, rgba(255,255,255,.05) 69% 70%, transparent 70%)"
  ],
  neon: [
    "linear-gradient(145deg, rgba(7,6,20,.99) 0%, rgba(25,18,79,.94) 38%, rgba(105,56,202,.86) 100%), radial-gradient(circle at 76% 20%, rgba(112,228,255,.2), transparent 22%), repeating-linear-gradient(135deg, rgba(255,0,204,.08) 0 12px, transparent 12px 24px)",
    "linear-gradient(180deg, rgba(9,8,24,.99) 0%, rgba(33,22,91,.94) 36%, rgba(136,70,225,.86) 100%), radial-gradient(circle at 20% 82%, rgba(255,122,238,.14), transparent 18%), linear-gradient(90deg, transparent 0 18%, rgba(112,228,255,.08) 18% 19%, transparent 19% 100%)"
  ],
  desert: [
    "linear-gradient(155deg, rgba(29,16,10,.99) 0%, rgba(111,68,34,.92) 34%, rgba(234,186,112,.86) 100%), radial-gradient(circle at 76% 18%, rgba(255,226,166,.14), transparent 20%), repeating-linear-gradient(135deg, rgba(255,240,205,.05) 0 10px, transparent 10px 22px)",
    "linear-gradient(180deg, rgba(32,18,12,.99) 0%, rgba(122,73,37,.92) 42%, rgba(244,199,122,.86) 100%), radial-gradient(circle at 18% 80%, rgba(255,222,176,.12), transparent 16%), linear-gradient(90deg, transparent 0 24%, rgba(255,224,169,.07) 24% 25%, transparent 25% 76%, rgba(255,224,169,.05) 76% 77%, transparent 77%)"
  ],
  gauntlet: [
    "linear-gradient(150deg, rgba(8,13,22,.99) 0%, rgba(37,58,92,.94) 38%, rgba(111,145,187,.84) 100%), radial-gradient(circle at 78% 18%, rgba(255,208,122,.16), transparent 20%), linear-gradient(180deg, transparent 0 60%, rgba(255,123,88,.12) 60% 66%, transparent 66%)",
    "linear-gradient(180deg, rgba(10,14,24,.99) 0%, rgba(43,66,101,.94) 42%, rgba(131,157,193,.86) 100%), radial-gradient(circle at 20% 82%, rgba(255,120,98,.12), transparent 18%), repeating-linear-gradient(90deg, transparent 0 16%, rgba(255,225,172,.05) 16% 17%, transparent 17% 100%)"
  ]
});

export function getSurvivalLoadingBackgroundsV2(mapId) {
  const key = String(mapId || "bridge").toLowerCase();
  const theme = getSurvivalTheme(key);
  const rows = V2_BACKGROUNDS[key]
    || V2_BACKGROUNDS[theme.id]
    || (Array.isArray(theme.loadingBackgrounds) ? theme.loadingBackgrounds : []);
  const list = Array.isArray(rows) ? rows : [];
  return list.length ? list.slice() : [
    `linear-gradient(145deg, ${theme.skyTop || "#17223a"} 0%, ${theme.backdropColor || theme.groundColor || "#31425d"} 50%, ${theme.skyBottom || "#9ab8d8"} 100%)`
  ];
}
