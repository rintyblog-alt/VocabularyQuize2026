/* ══════════════════════════════════════════════════════════════════════════
   VocabuSurvive の 見た目の 決めどころ。

   ここは **影の DOM の 中だけ**で 効く。本体の 1.4MB の CSS とは
   一切 ぶつからない（過去に 何度も 詳細度で 負けているので、
   最初から 隔離する）。

   色の 考え:
     ・土台は 深い 紺。上に 置く 色が 全部 映える。
     ・強い色は 5 つだけ。増やすと 安っぽく なる。
     ・人の 色（8 人分）は 色相を 均等に 割って、
       近くの 2 人が 似ないように 並べ替えてある。
   ══════════════════════════════════════════════════════════════════════════ */

export const PALETTE = {
  bg:        "#0b0e26",
  bgDeep:    "#070919",
  panel:     "rgba(255,255,255,.065)",
  panelHi:   "rgba(255,255,255,.11)",
  line:      "rgba(255,255,255,.14)",
  ink:       "#f3f5ff",
  inkSub:    "rgba(243,245,255,.66)",
  inkFaint:  "rgba(243,245,255,.40)",
  amber:     "#ffb020",
  mint:      "#37e0b0",
  pink:      "#ff5d8f",
  blue:      "#5b8cff",
  violet:    "#a77bff",
  danger:    "#ff5b5b",
  good:      "#3ddc84"
};

/** 走る人の 色 8 色。隣どうしが 似ないように 並べてある。 */
export const BEAN_COLORS = [
  { id: "sun",   name: "サン",     hex: "#ffbe2e", rgb: [1.00, 0.745, 0.180] },
  { id: "sea",   name: "シー",     hex: "#3aa9ff", rgb: [0.227, 0.663, 1.00] },
  { id: "coral", name: "コーラル", hex: "#ff6b7a", rgb: [1.00, 0.420, 0.478] },
  { id: "leaf",  name: "リーフ",   hex: "#4fd97b", rgb: [0.310, 0.851, 0.482] },
  { id: "grape", name: "グレープ", hex: "#a97bff", rgb: [0.663, 0.482, 1.00] },
  { id: "peach", name: "ピーチ",   hex: "#ff9a5c", rgb: [1.00, 0.604, 0.361] },
  { id: "aqua",  name: "アクア",   hex: "#35ded0", rgb: [0.208, 0.871, 0.816] },
  { id: "berry", name: "ベリー",   hex: "#ff5fb4", rgb: [1.00, 0.373, 0.706] }
];

export function beanByIndex(i) { return BEAN_COLORS[((i | 0) % BEAN_COLORS.length + BEAN_COLORS.length) % BEAN_COLORS.length]; }

/** #rrggbb → [0..1,0..1,0..1] */
export function hexToRgb(hex) {
  const h = String(hex || "#fff").replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* 影の DOM に 入れる 一枚の CSS。
   ★ ここを 直したら vqsurvive.cjs で 束ね直すこと。 */
export const CSS = `
:host{
  all: initial;
  position: absolute; inset: 0;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans",
               "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", Roboto, sans-serif;
  color: ${PALETTE.ink};
  background: ${PALETTE.bg};
  overflow: hidden;
  contain: layout paint style;
  -webkit-tap-highlight-color: transparent;
  --vs-amber: ${PALETTE.amber};
  --vs-mint: ${PALETTE.mint};
  --vs-pink: ${PALETTE.pink};
  --vs-blue: ${PALETTE.blue};
  --vs-violet: ${PALETTE.violet};
  --vs-ink: ${PALETTE.ink};
  --vs-ink-sub: ${PALETTE.inkSub};
  --vs-panel: ${PALETTE.panel};
  --vs-line: ${PALETTE.line};
  --vs-radius: 18px;
  --vs-safe-t: env(safe-area-inset-top, 0px);
  --vs-safe-b: env(safe-area-inset-bottom, 0px);
  --vs-safe-l: env(safe-area-inset-left, 0px);
  --vs-safe-r: env(safe-area-inset-right, 0px);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select { font: inherit; color: inherit; }

.vs-root{ position:absolute; inset:0; overflow:hidden; }

/* ── 画面の 出し入れ ───────────────────────────────────────────── */
.vs-screen{
  position:absolute; inset:0;
  opacity:0; visibility:hidden;
  transition: opacity .28s ease, transform .28s ease;
  transform: scale(.985);
  will-change: opacity, transform;
}
.vs-screen[data-on="1"]{ opacity:1; visibility:visible; transform:none; }
@media (prefers-reduced-motion: reduce){
  .vs-screen{ transition-duration: .01ms; transform:none; }
}

/* ── 画面いっぱいの 板 ─────────────────────────────────────────── */
.vs-canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }

/* ── よく使う 部品 ───────────────────────────────────────────── */
.vs-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  height:52px; padding:0 26px; border-radius:15px;
  font-size:16px; font-weight:800; letter-spacing:.02em;
  background:linear-gradient(180deg, #ffc94a, ${PALETTE.amber});
  color:#231702;
  box-shadow:0 6px 0 #b97400, 0 12px 26px rgba(255,176,32,.28);
  transition: transform .12s cubic-bezier(.2,.9,.3,1.3), box-shadow .12s ease, filter .12s ease;
  user-select:none; -webkit-user-select:none;
}
.vs-btn:hover{ filter:brightness(1.05); }
.vs-btn:active{ transform:translateY(4px); box-shadow:0 2px 0 #b97400, 0 6px 14px rgba(255,176,32,.24); }
.vs-btn:focus-visible{ outline:3px solid #fff; outline-offset:3px; }
.vs-btn[disabled]{ opacity:.45; pointer-events:none; }
.vs-btn.is-ghost{
  background:${PALETTE.panel}; color:${PALETTE.ink};
  border:1px solid ${PALETTE.line}; box-shadow:none;
}
.vs-btn.is-ghost:active{ transform:translateY(2px); box-shadow:none; }
.vs-btn.is-mint{
  background:linear-gradient(180deg,#5ff0c6,${PALETTE.mint}); color:#04281f;
  box-shadow:0 6px 0 #17a17c, 0 12px 26px rgba(55,224,176,.26);
}
.vs-btn.is-mint:active{ box-shadow:0 2px 0 #17a17c, 0 6px 14px rgba(55,224,176,.22); }
.vs-btn.is-sm{ height:40px; padding:0 16px; font-size:14px; border-radius:12px; box-shadow:0 4px 0 rgba(0,0,0,.28); }
.vs-btn.is-sm:active{ transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.28); }

.vs-card{
  background:${PALETTE.panel};
  border:1px solid ${PALETTE.line};
  border-radius:var(--vs-radius);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}
.vs-chip{
  display:inline-flex; align-items:center; gap:6px;
  height:28px; padding:0 12px; border-radius:999px;
  background:${PALETTE.panelHi}; border:1px solid ${PALETTE.line};
  font-size:12px; font-weight:700; color:${PALETTE.inkSub};
}
.vs-h1{ font-size:clamp(30px,6vw,56px); font-weight:900; letter-spacing:-.02em; line-height:1.05; }
.vs-h2{ font-size:clamp(18px,3vw,24px); font-weight:800; letter-spacing:-.01em; }
.vs-sub{ color:${PALETTE.inkSub}; font-size:14px; line-height:1.7; }
.vs-mono{ font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
.vs-hide{ display:none !important; }

/* 目に 見えないが 読み上げには 出す */
.vs-sr{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
`;
