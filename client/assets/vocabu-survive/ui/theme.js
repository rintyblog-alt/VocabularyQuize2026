/* ══════════════════════════════════════════════════════════════════════════
   VocabuSurvive の 見た目の 決めどころ。

   ★ 2026-08-28 作り直し:
     ここは 影の DOM の 中で 完結するので **本体と 違う 見た目**に なっていた
     （紺の 地・琥珀の 立体ボタン・900 の 太字・すりガラス）。
     本体は Bloom（ラベンダー × 白／暗い ラベンダー）で 動いているのに、
     この 画面だけ 別の アプリのように 見えるのは よくない。

     直しかた: **本体の トークン（--vq-*）を そのまま 使う**。
     CSS の カスタム プロパティは `all: initial` では 消えないので、
     影の DOM の 中まで ちゃんと 降りてくる（実測ずみ）。
     これで 本体の 明暗（ライト/ダーク）・アクセント色・角の 丸みの
     設定が **この 画面にも そのまま 効く**。

     本体が 無い ところ（単体で 開いたとき）でも 見えるように、
     すべての var() に 逃げ道（ダークの 既定値）を 付けてある。

   色の 考え:
     ・面・線・文字・アクセントは **本体の トークンだけ**。
     ・遊びの 色（走る人の 8 色・コースの 空）は ここが 持つ。
       これは 中身の 色であって 見た目の 骨組みでは ない。
   ══════════════════════════════════════════════════════════════════════════ */

/* CSS の 中で 使う 色。**値では なく 本体の トークンを 指す**。
   （SVG の 属性へ 直に 入れると var() が 効かないので、
     そこだけは style で 当てること。） */
export const PALETTE = {
  bg:        "var(--vs-bg)",
  bgDeep:    "var(--vs-bg-deep)",
  panel:     "var(--vs-surface)",
  panelHi:   "var(--vs-surface-2)",
  line:      "var(--vs-line)",
  ink:       "var(--vs-ink)",
  inkSub:    "var(--vs-ink-sub)",
  inkFaint:  "var(--vs-ink-faint)",
  amber:     "var(--vs-accent)",
  mint:      "var(--vs-good)",
  pink:      "var(--vs-social)",
  blue:      "var(--vs-info)",
  violet:    "var(--vs-accent)",
  danger:    "var(--vs-danger)",
  good:      "var(--vs-good)",
  gold:      "var(--vs-gold)"
};

/** 走る人の 色 8 色。隣どうしが 似ないように 並べてある。
    ここは **遊びの 中身**なので 本体の トークンには しない。 */
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
  font-family: var(--vq-font-sans, -apple-system, BlinkMacSystemFont, "Hiragino Sans",
               "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", Roboto, sans-serif);
  overflow: hidden;
  contain: layout paint style;
  -webkit-tap-highlight-color: transparent;

  /* ── 本体（Bloom）の トークンから 引く ─────────────────────────
     逃げ道は Bloom の ダークの 値。本体が 無くても 同じに 見える。 */
  --vs-bg:          var(--vq-bg-canvas, #131218);
  --vs-bg-deep:     var(--vq-bg, #17161D);
  --vs-surface:     var(--vq-surface, #211F29);
  --vs-surface-2:   var(--vq-surface-active, #2D2A39);
  --vs-surface-3:   var(--vq-surface-selected, #302B44);
  --vs-sunken:      var(--vq-surface-sunken, #1B1A22);
  --vs-scrim:       var(--vq-surface-overlay, rgba(9,8,14,.62));
  --vs-line:        var(--vq-border, #393543);
  --vs-line-subtle: var(--vq-border-subtle, #2C2937);
  --vs-line-strong: var(--vq-border-strong, #4A4559);
  --vs-ink:         var(--vq-text, #F5F2FA);
  --vs-ink-sub:     var(--vq-text-secondary, #CBC5D5);
  --vs-ink-faint:   var(--vq-text-tertiary, #928B9E);
  --vs-ink-off:     var(--vq-text-disabled, #655F73);
  --vs-accent:      var(--vq-accent, #A59BE0);
  --vs-accent-hi:   var(--vq-accent-hover, #B5ACE9);
  --vs-accent-ink:  var(--vq-accent-contrast, #232040);
  --vs-accent-soft: var(--vq-accent-subtle, #2E2A45);
  --vs-accent-text: var(--vq-accent-text, #BCB2F0);
  --vs-good:        var(--vq-success, #7FC69A);
  --vs-good-bg:     var(--vq-success-bg, #20342A);
  --vs-good-text:   var(--vq-success-text, #A8DDBE);
  --vs-warn:        var(--vq-warning, #E4B778);
  --vs-warn-bg:     var(--vq-warning-bg, #372B17);
  --vs-warn-text:   var(--vq-warning-text, #ECCA97);
  --vs-danger:      var(--vq-danger, #E08D8D);
  --vs-danger-bg:   var(--vq-danger-bg, #3B2225);
  --vs-danger-text: var(--vq-danger-text, #F0A9A9);
  --vs-info:        var(--vq-info, #8FA9DC);
  --vs-info-bg:     var(--vq-info-bg, #202A3D);
  --vs-info-text:   var(--vq-info-text, #AFC4EA);
  --vs-social:      var(--vq-social, #E289AE);
  --vs-gold:        var(--vq-qredit-fill, #DFAE63);
  --vs-gold-bg:     var(--vq-qredit-bg, #362B15);
  --vs-solid-ink:   var(--vq-solid-ink, #17161D);
  /* ★ 遊んでいる 立体の 上に 置く 板だけ、面を **少し 透かす**。
     見た目の ためでは なく 速さの ため: すりガラスの 板は 自分の 層に
     なるので、毎コマ 書き換わる 時計や 順位の ために 立体まで 塗り直さない。
     不透明に したら 走り出しで コマが 落ちた（実測: 6 秒で 進む 時間が
     2.5 秒 → 2.0 秒）。色・角・字は アプリの トークンのまま。 */
  --vs-hud-panel: color-mix(in srgb, var(--vq-surface, #211F29) 80%, transparent);

  /* 角・影・間・高さ・動き も 本体と 同じ 尺 */
  --vs-r-xs:   var(--vq-r-xs, 6px);
  --vs-r-sm:   var(--vq-r-sm, 10px);
  --vs-r-md:   var(--vq-r-md, 14px);
  --vs-r-lg:   var(--vq-r-lg, 18px);
  --vs-r-xl:   var(--vq-r-xl, 22px);
  --vs-r-full: var(--vq-r-full, 999px);
  --vs-radius: var(--vq-r-lg, 18px);
  --vs-sh-subtle:   var(--vq-shadow-subtle, 0 1px 2px rgba(0,0,0,.28));
  --vs-sh-raised:   var(--vq-shadow-raised, 0 2px 4px rgba(0,0,0,.22), 0 6px 16px rgba(0,0,0,.3));
  --vs-sh-floating: var(--vq-shadow-floating, 0 4px 12px rgba(0,0,0,.3), 0 16px 40px rgba(0,0,0,.4));
  --vs-sh-modal:    var(--vq-shadow-modal, 0 10px 24px rgba(0,0,0,.36), 0 32px 80px rgba(0,0,0,.5));
  --vs-focus:       var(--vq-focus-ring, 0 0 0 3px rgba(165,155,224,.34));
  --vs-h-sm: var(--vq-control-h-sm, 32px);
  --vs-h-md: var(--vq-control-h-md, 42px);
  --vs-h-lg: var(--vq-control-h-lg, 50px);
  --vs-dur-fast:   var(--vq-dur-fast, 120ms);
  --vs-dur:        var(--vq-dur-normal, 200ms);
  --vs-ease:       var(--vq-ease-standard, cubic-bezier(.25,.65,.2,1));

  color: var(--vs-ink);
  background: var(--vs-bg);

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

/* ── ボタン ───────────────────────────────────────────────────
   本体の .vq-btn と 同じ 作り（高さ・角・字・押したときの 縮み）。
   前の 立体ボタン（下に 6px の 影）は アプリの どこにも 無いので やめた。 */
.vs-btn{
  --_h: var(--vs-h-md);
  position:relative;
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:var(--_h); padding:0 calc(var(--_h) * 0.42);
  border:1px solid transparent; border-radius:var(--vs-r-md);
  font-weight:600; font-size:14px; line-height:1.4; letter-spacing:.01em;
  background:var(--vs-accent); color:var(--vs-accent-ink);
  cursor:pointer; user-select:none; -webkit-user-select:none; white-space:nowrap;
  transition: background var(--vs-dur-fast) var(--vs-ease),
              border-color var(--vs-dur-fast) var(--vs-ease),
              color var(--vs-dur-fast) var(--vs-ease),
              box-shadow var(--vs-dur-fast) var(--vs-ease),
              transform var(--vs-dur-fast) var(--vs-ease);
}
.vs-btn:hover:not([disabled]){ background:var(--vs-accent-hi); }
.vs-btn:active:not([disabled]){ transform:scale(.975); }
.vs-btn:focus-visible{ outline:none; box-shadow:var(--vs-focus); }
.vs-btn[disabled]{ background:var(--vq-surface-disabled, #1E1D25); color:var(--vs-ink-off); cursor:not-allowed; }
.vs-btn.is-lg{ --_h: var(--vs-h-lg); font-size:15px; }
.vs-btn.is-sm{ --_h: var(--vs-h-sm); font-size:13px; border-radius:var(--vs-r-sm); }
.vs-btn.is-full{ width:100%; }
.vs-btn.is-ghost{
  background:var(--vs-surface); color:var(--vs-ink);
  border-color:var(--vs-line); box-shadow:var(--vs-sh-subtle);
}
.vs-btn.is-ghost:hover:not([disabled]){ background:var(--vs-surface-2); border-color:var(--vs-line-strong); }
.vs-btn.is-quiet{ background:transparent; color:var(--vs-ink-sub); box-shadow:none; }
.vs-btn.is-quiet:hover:not([disabled]){ background:var(--vs-surface-2); color:var(--vs-ink); }
.vs-btn.is-mint{ background:var(--vq-success-strong, #7FC69A); color:var(--vs-solid-ink); }
.vs-btn.is-mint:hover:not([disabled]){ filter:brightness(1.06); }
.vs-btn.is-danger{ background:var(--vq-danger-strong, #DE8484); color:var(--vs-solid-ink); }
.vs-btn.is-danger:hover:not([disabled]){ background:var(--vq-danger-strong-hover, #E9A0A0); }

/* ── 面 ───────────────────────────────────────────────────────
   本体の .vq-card と 同じ。すりガラスは やめた（アプリで 使っていない）。 */
.vs-card{
  background:var(--vs-surface);
  border:1px solid var(--vs-line-subtle);
  border-radius:var(--vs-r-lg);
  box-shadow:var(--vs-sh-subtle);
}
/* 立体の 上に 浮かせる 面だけ 影を 強く（下の 絵と 混ざらないように） */
.vs-card.is-float{ box-shadow:var(--vs-sh-floating); }
.vs-card.is-sunken{ background:var(--vs-sunken); border-color:transparent; box-shadow:none; }

/* ── しるし ─────────────────────────────────────────────────── */
.vs-chip{
  display:inline-flex; align-items:center; gap:6px;
  height:26px; padding:0 10px; border-radius:var(--vs-r-full);
  background:var(--vs-surface-2); border:1px solid transparent;
  font-size:11.5px; font-weight:650; letter-spacing:.015em; color:var(--vs-ink-sub);
}
.vs-chip.is-accent{ background:var(--vs-accent-soft); color:var(--vs-accent-text); }
.vs-chip.is-good{ background:var(--vs-good-bg); color:var(--vs-good-text); }
.vs-chip.is-warn{ background:var(--vs-warn-bg); color:var(--vs-warn-text); }
.vs-chip.is-danger{ background:var(--vs-danger-bg); color:var(--vs-danger-text); }
.vs-chip.is-outline{ background:transparent; border-color:var(--vs-line-strong); color:var(--vs-ink-sub); }

/* ── 字 ───────────────────────────────────────────────────────
   本体の 見出しの 尺（--vq-type-*）に そろえる。900 の 太字は やめた。 */
.vs-h1{ font:var(--vq-type-display, 800 clamp(29px,4.4vw,38px)/1.32 var(--vq-font-display, inherit)); letter-spacing:-.002em; }
.vs-h2{ font:var(--vq-type-heading-lg, 700 20px/1.45 var(--vq-font-display, inherit)); letter-spacing:-.002em; }
.vs-h3{ font:var(--vq-type-heading-md, 700 17px/1.55 var(--vq-font-sans, inherit)); }
.vs-label{ font:var(--vq-type-label, 600 13px/1.4 var(--vq-font-sans, inherit)); }
.vs-sub{ color:var(--vs-ink-sub); font:var(--vq-type-body-sm, 400 13px/1.7 var(--vq-font-sans, inherit)); }
.vs-cap{ color:var(--vs-ink-faint); font:var(--vq-type-caption, 500 11.5px/1.5 var(--vq-font-sans, inherit)); }
.vs-mono{ font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
.vs-hide{ display:none !important; }

/* 目に 見えないが 読み上げには 出す */
.vs-sr{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
`;
