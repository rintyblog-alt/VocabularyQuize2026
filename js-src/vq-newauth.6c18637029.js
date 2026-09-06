
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — New Auth Front Door（UI Studio SCREEN: Splash & Intro → Welcome → Auth Flow を丸ごと移植）
   ・Shadow DOM に完全隔離 → 本体の button{}!important / :is(button)!important / JSペインター
     （document.querySelectorAll ベース）はシャドウ境界を越えられず、競合が構造的にゼロ。
   ・見た目は UI Studio の実CSS/実コンポーネント/実イラストをそのまま注入（常時ライト）。
   ・実際の認証は既存の隠しフォーム＋既存ボタンclickへ委譲（_authSubmitLogin 等・ロジック不変）。
   ・導線: 未認証でゲートが開いたら本オーバーレイを最前面に出す。認証成功で自動収納。
   ・フラグ html[data-vq-ui="bloom"] 連動。legacy では出さず旧ゲートを使う（完全リバーシブル）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqNewAuthInstalled) return;
  window.__vqNewAuthInstalled = true;

  var CSS = "/* VocabuQuiz New Auth — self-contained UI Studio styles (tokens[light]→:host + base + components + screens[splash/intro/welcome/auth]) */\n\n:host {\n  /* ── Brand scale (Lavender) ───────────────────────────── */\n  --vq-lav-25:  #FCFBFE;\n  --vq-lav-50:  #F7F6FB;\n  --vq-lav-100: #F4F2FB;   /* primary subtle */\n  --vq-lav-150: #EEECF9;   /* selected */\n  --vq-lav-200: #EAE8F7;   /* primary soft */\n  --vq-lav-300: #D5D0EC;\n  --vq-lav-400: #A79FD1;\n  --vq-lav-500: #8A81C2;\n  --vq-lav-600: #756DB3;   /* brand core */\n  --vq-lav-650: #6961A8;   /* hover */\n  --vq-lav-700: #5F579E;   /* active */\n  --vq-lav-800: #4D4683;\n  --vq-lav-900: #3B3567;\n  --vq-lav-950: #262244;\n\n  /* ── Neutral scale (lavender-tinted gray) ─────────────── */\n  --vq-gray-0:   #FFFFFF;\n  --vq-gray-25:  #FCFBFE;\n  --vq-gray-50:  #F9F8FC;\n  --vq-gray-100: #F4F3F9;\n  --vq-gray-150: #EFEDF5;\n  --vq-gray-200: #E7E4EF;\n  --vq-gray-300: #D7D2E4;\n  --vq-gray-400: #BBB7C5;\n  --vq-gray-500: #9994A8;\n  --vq-gray-600: #7A7589;\n  --vq-gray-650: #686477;\n  --vq-gray-700: #5A5568;\n  --vq-gray-800: #454151;\n  --vq-gray-850: #353143;\n  --vq-gray-900: #2B2836;\n  --vq-gray-950: #211F29;\n\n  /* ═══ Semantic aliases — 実装は必ずこちらを参照する ═══ */\n\n  /* Background layers */\n  --vq-bg:            var(--vq-gray-25);\n  --vq-bg-subtle:     var(--vq-lav-50);\n  --vq-bg-elevated:   var(--vq-gray-0);\n  --vq-bg-canvas:     var(--vq-lav-50);\n\n  /* Surfaces */\n  --vq-surface:          var(--vq-gray-0);\n  --vq-surface-hover:    #F7F5FC;\n  --vq-surface-active:   #F1EEF8;\n  --vq-surface-selected: var(--vq-lav-150);\n  --vq-surface-disabled: var(--vq-gray-100);\n  --vq-surface-sunken:   var(--vq-lav-50);\n  --vq-surface-overlay:  rgba(38, 34, 68, 0.40);\n\n  /* Borders */\n  --vq-border:        var(--vq-gray-200);\n  --vq-border-subtle: var(--vq-gray-150);\n  --vq-border-strong: var(--vq-gray-300);\n  --vq-border-focus:  var(--vq-lav-600);\n\n  /* Text */\n  --vq-text:           var(--vq-gray-800);\n  --vq-text-secondary: var(--vq-gray-650);\n  --vq-text-tertiary:  var(--vq-gray-500);\n  --vq-text-disabled:  var(--vq-gray-400);\n  --vq-text-inverse:   #ffffff;\n  --vq-text-link:      var(--vq-lav-700);\n\n  /* Accent (brand action) */\n  --vq-accent:         var(--vq-lav-600);\n  --vq-accent-hover:   var(--vq-lav-650);\n  --vq-accent-active:  var(--vq-lav-700);\n  --vq-accent-subtle:  var(--vq-lav-200);\n  --vq-accent-subtle-hover: #E0DCF2;\n  --vq-accent-text:    var(--vq-lav-700);\n  --vq-accent-contrast:#ffffff;\n  /* 色付きベタ塗り（accent/正解/不正解 等）の上に載せる文字・アイコン色 */\n  --vq-solid-ink:      #ffffff;\n\n  /* Status */\n  --vq-success:        #70AD86;\n  --vq-success-strong: #3F7D58;\n  --vq-success-bg:     #E9F5ED;\n  --vq-success-text:   #3E7A56;\n  --vq-warning:        #E5A85F;\n  --vq-warning-bg:     #FFF3E5;\n  --vq-warning-text:   #925F1D;\n  --vq-danger:         #D67777;\n  --vq-danger-strong:  #B14F4F;\n  --vq-danger-strong-hover: #9E4444;\n  --vq-danger-hover:   #C96666;\n  --vq-danger-bg:      #FCEAEA;\n  --vq-danger-text:    #A94A4A;\n  --vq-info:           #708FC5;\n  --vq-info-bg:        #EAF0F9;\n  --vq-info-text:      #4A69A4;\n\n  /* Focus / selection */\n  --vq-focus-ring:     0 0 0 3px color-mix(in srgb, var(--vq-lav-600) 26%, transparent);\n  --vq-selection-bg:   #E4E0F4;\n\n  /* Domain colors */\n  --vq-quiz-correct:      #4E8F6B;\n  --vq-quiz-correct-bg:   #E9F5ED;\n  --vq-quiz-incorrect:    #C25B5B;\n  --vq-quiz-incorrect-bg: #FCEAEA;\n  --vq-quiz-unanswered:   #B6B1C2;\n  --vq-favorite:          #E6A753;\n  --vq-favorite-bg:       #FBF1E1;\n  --vq-ai:                #8175BD;\n  --vq-ai-text:           #695CA8;\n  --vq-ai-bg:             #EDEAF9;\n  --vq-qredit:            #9C6A1B;\n  --vq-qredit-fill:       #D69A4D;\n  --vq-qredit-bg:         #FAF0DF;\n  --vq-admin:             #6E6787;\n  --vq-admin-bg:          var(--vq-gray-150);\n  --vq-social:            #C95E85;\n\n  /* Charts (categorical, CVD-validated via dataviz six-checks / surface #fff) */\n  --vq-chart-1: #7a4fe8;\n  --vq-chart-2: #0b7fbd;\n  --vq-chart-3: #d43f75;\n  --vq-chart-4: #b26a00;\n  --vq-chart-5: #08967f;\n  --vq-chart-6: #3f63ea;\n  --vq-chart-grid: var(--vq-gray-150);\n\n  /* Illustration palette（フラットSVGイラスト用・両テーマで差し替わる） */\n  --vq-il-blob:  #EDEAF9;\n  --vq-il-a:     #A79FD1;\n  --vq-il-b:     #756DB3;\n  --vq-il-c:     #F2C08A;\n  --vq-il-d:     #F1B7C8;\n  --vq-il-e:     #A9C6EA;\n  --vq-il-paper: #FFFFFF;\n  --vq-il-ink:   #454151;\n  --vq-il-line:  #D7D2E4;\n\n  /* ── Typography ───────────────────────────────────────── */\n  --vq-font-sans: -apple-system, BlinkMacSystemFont, \"Hiragino Sans\",\n    \"Hiragino Kaku Gothic ProN\", \"Noto Sans JP\", \"Segoe UI\", Roboto,\n    \"Yu Gothic UI\", \"Meiryo\", sans-serif;\n  /* 見出し用: 少し丸みのある親しみやすいスタック（可愛くしすぎない） */\n  --vq-font-display: ui-rounded, \"Hiragino Maru Gothic ProN\",\n    \"Arial Rounded MT Bold\", -apple-system, \"Hiragino Sans\",\n    \"Noto Sans JP\", \"Yu Gothic UI\", \"Meiryo\", sans-serif;\n  --vq-font-mono: \"SF Mono\", \"SFMono-Regular\", ui-monospace, \"JetBrains Mono\",\n    \"Cascadia Code\", Menlo, Consolas, monospace;\n\n  --vq-type-display:    800 clamp(29px, 4.4vw, 38px) / 1.32 var(--vq-font-display);\n  --vq-type-heading-xl: 750 25px / 1.4  var(--vq-font-display);\n  --vq-type-heading-lg: 700 20px / 1.45 var(--vq-font-display);\n  --vq-type-heading-md: 700 17px / 1.55 var(--vq-font-sans);\n  --vq-type-heading-sm: 650 14.5px / 1.5 var(--vq-font-sans);\n  --vq-type-body-lg:    400 16px / 1.85 var(--vq-font-sans);\n  --vq-type-body-md:    400 14.5px / 1.8 var(--vq-font-sans);\n  --vq-type-body-sm:    400 13px / 1.7  var(--vq-font-sans);\n  --vq-type-label:      600 13px / 1.4  var(--vq-font-sans);\n  --vq-type-caption:    500 11.5px / 1.5 var(--vq-font-sans);\n  --vq-type-code:       500 13px / 1.65 var(--vq-font-mono);\n\n  --vq-tracking-tight: -0.002em;\n  --vq-tracking-body:  0.01em;\n  --vq-tracking-wide:  0.06em;\n\n  /* ── Spacing scale ────────────────────────────────────── */\n  --vq-sp-0: 0px;   --vq-sp-1: 2px;  --vq-sp-2: 4px;  --vq-sp-3: 6px;\n  --vq-sp-4: 8px;   --vq-sp-5: 12px; --vq-sp-6: 16px; --vq-sp-7: 20px;\n  --vq-sp-8: 24px;  --vq-sp-9: 32px; --vq-sp-10: 40px; --vq-sp-11: 48px;\n  --vq-sp-12: 64px; --vq-sp-13: 80px;\n\n  /* ── Radius（全体的に柔らかく・ただしピル化しすぎない） ── */\n  --vq-r-none: 0px;\n  --vq-r-xs: 6px;\n  --vq-r-sm: 10px;\n  --vq-r-md: 14px;     /* buttons, inputs */\n  --vq-r-lg: 18px;     /* cards */\n  --vq-r-xl: 22px;     /* modals, large panels */\n  --vq-r-2xl: 28px;    /* bottom sheet 上端・特大パネル */\n  --vq-r-full: 999px;\n\n  /* ── Shadows（ラベンダーを帯びた極控えめな影） ─────────── */\n  --vq-shadow-none: none;\n  --vq-shadow-subtle: 0 1px 2px rgba(84, 72, 140, 0.05);\n  --vq-shadow-raised: 0 2px 4px rgba(84, 72, 140, 0.04), 0 6px 16px rgba(84, 72, 140, 0.07);\n  --vq-shadow-floating: 0 4px 12px rgba(84, 72, 140, 0.08), 0 16px 40px rgba(84, 72, 140, 0.12);\n  --vq-shadow-modal: 0 10px 24px rgba(60, 50, 110, 0.10), 0 32px 80px rgba(60, 50, 110, 0.18);\n  --vq-shadow-accent: 0 6px 16px color-mix(in srgb, var(--vq-accent) 24%, transparent);\n\n  /* ── Motion（軽く・柔らかく） ─────────────────────────── */\n  --vq-dur-instant: 0ms;\n  --vq-dur-fast: 120ms;\n  --vq-dur-normal: 200ms;\n  --vq-dur-slow: 300ms;\n  --vq-dur-deliberate: 420ms;\n  --vq-ease-standard: cubic-bezier(0.25, 0.65, 0.2, 1);\n  --vq-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);\n  --vq-ease-exit: cubic-bezier(0.45, 0, 0.7, 0.4);\n  --vq-ease-spring: cubic-bezier(0.32, 1.25, 0.4, 1);\n\n  /* ── Layout ───────────────────────────────────────────── */\n  --vq-sidebar-w: 264px;\n  --vq-topbar-h: 56px;\n  --vq-bottomnav-h: 62px;\n  --vq-content-max: 1120px;\n  --vq-tap-min: 44px;\n\n  /* density: comfortable(default) — モバイルでタップしやすい高さ */\n  --vq-control-h-sm: 32px;\n  --vq-control-h-md: 42px;\n  --vq-control-h-lg: 50px;\n  --vq-field-px: 14px;\n  --vq-card-p: 20px;\n\n  color-scheme: light;\n}\n:host {\n  --vq-cobalt-50:  var(--vq-lav-100);\n  --vq-cobalt-100: var(--vq-lav-150);\n  --vq-cobalt-200: var(--vq-lav-200);\n  --vq-cobalt-300: var(--vq-lav-300);\n  --vq-cobalt-400: var(--vq-lav-400);\n  --vq-cobalt-500: var(--vq-lav-500);\n  --vq-cobalt-600: var(--vq-lav-600);\n  --vq-cobalt-700: var(--vq-lav-700);\n  --vq-cobalt-800: var(--vq-lav-800);\n  --vq-cobalt-900: var(--vq-lav-900);\n  --vq-cobalt-950: var(--vq-lav-950);\n}\n\n/* ── Reset + base ─────────────────────────────────────────── */\n*, *::before, *::after { box-sizing: border-box; }\n* { margin: 0; }\n\nhtml { -webkit-text-size-adjust: 100%; }\n\nbody {\n  font: var(--vq-type-body-md);\n  letter-spacing: var(--vq-tracking-body);\n  color: var(--vq-text);\n  background: var(--vq-bg);\n  -webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;\n  overflow-wrap: anywhere;\n}\n\nimg, svg, video, canvas { display: block; max-width: 100%; }\ninput, button, textarea, select { font: inherit; letter-spacing: inherit; color: inherit; }\np, h1, h2, h3, h4, h5, h6 { overflow-wrap: anywhere; }\n\nh1 { font: var(--vq-type-heading-xl); letter-spacing: var(--vq-tracking-tight); }\nh2 { font: var(--vq-type-heading-lg); letter-spacing: var(--vq-tracking-tight); }\nh3 { font: var(--vq-type-heading-md); }\nh4 { font: var(--vq-type-heading-sm); }\n\na { color: var(--vq-text-link); text-decoration: none; }\na:hover { text-decoration: underline; text-underline-offset: 3px; }\n\ncode, pre { font: var(--vq-type-code); }\n\n::selection { background: var(--vq-selection-bg); }\n\n:focus { outline: none; }\n:focus-visible {\n  outline: 2px solid var(--vq-border-focus);\n  outline-offset: 2px;\n  border-radius: var(--vq-r-xs);\n}\n\n/* Scrollbars */\n* { scrollbar-width: thin; scrollbar-color: var(--vq-border-strong) transparent; }\n*::-webkit-scrollbar { width: 10px; height: 10px; }\n*::-webkit-scrollbar-thumb {\n  background: var(--vq-border-strong);\n  border-radius: 99px;\n  border: 3px solid transparent;\n  background-clip: content-box;\n}\n*::-webkit-scrollbar-track { background: transparent; }\n\n/* Reduced motion — 情報を失わず動きだけを止める */\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after {\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n    scroll-behavior: auto !important;\n  }\n}\n:root[data-motion=\"off\"] *,\n:root[data-motion=\"off\"] *::before,\n:root[data-motion=\"off\"] *::after {\n  animation-duration: 0.01ms !important;\n  animation-iteration-count: 1 !important;\n  transition-duration: 0.01ms !important;\n}\n\n/* ── Layout utilities ─────────────────────────────────────── */\n.vq-stack { display: flex; flex-direction: column; }\n.vq-row { display: flex; align-items: center; }\n.vq-wrap { display: flex; flex-wrap: wrap; }\n.vq-grow { flex: 1 1 auto; min-width: 0; }\n.vq-visually-hidden {\n  position: absolute; width: 1px; height: 1px;\n  margin: -1px; padding: 0; overflow: hidden;\n  clip: rect(0 0 0 0); white-space: nowrap; border: 0;\n}\n.vq-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.vq-clamp-2 {\n  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n.vq-num { font-variant-numeric: tabular-nums; font-feature-settings: \"tnum\"; }\n\n/* ── Shared keyframes ─────────────────────────────────────── */\n@keyframes vq-fade-in { from { opacity: 0; } to { opacity: 1; } }\n@keyframes vq-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }\n@keyframes vq-fade-down { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }\n@keyframes vq-scale-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }\n@keyframes vq-slide-left { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }\n@keyframes vq-slide-right { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }\n@keyframes vq-spin { to { transform: rotate(360deg); } }\n@keyframes vq-pulse { 50% { opacity: 0.55; } }\n@keyframes vq-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }\n@keyframes vq-pop { 0% { transform: scale(0.8); } 55% { transform: scale(1.12); } 100% { transform: scale(1); } }\n@keyframes vq-shake {\n  10%, 90% { transform: translateX(-1px); }\n  20%, 80% { transform: translateX(2px); }\n  30%, 50%, 70% { transform: translateX(-3px); }\n  40%, 60% { transform: translateX(3px); }\n}\n\n\n/* ═══════════════════════════════════════════════════════════════\n   VocabuQuiz UI — Component styles\n   すべてトークン参照。コンポーネント固有の生値は持たない。\n   ═══════════════════════════════════════════════════════════════ */\n\n/* ── Button ──────────────────────────────────────────────── */\n.vq-btn {\n  --_h: var(--vq-control-h-md);\n  position: relative;\n  display: inline-flex; align-items: center; justify-content: center;\n  gap: var(--vq-sp-3);\n  height: var(--_h); padding: 0 calc(var(--_h) * 0.42);\n  border: 1px solid transparent; border-radius: var(--vq-r-md);\n  font: var(--vq-type-label); font-size: 14px; letter-spacing: 0.01em;\n  cursor: pointer; user-select: none; white-space: nowrap;\n  transition: background var(--vq-dur-fast) var(--vq-ease-standard),\n    border-color var(--vq-dur-fast) var(--vq-ease-standard),\n    color var(--vq-dur-fast) var(--vq-ease-standard),\n    box-shadow var(--vq-dur-fast) var(--vq-ease-standard),\n    transform var(--vq-dur-fast) var(--vq-ease-standard);\n}\n.vq-btn:active:not(:disabled) { transform: scale(0.975); }\n.vq-btn:disabled { cursor: not-allowed; }\n.vq-btn--sm { --_h: var(--vq-control-h-sm); font-size: 13px; border-radius: var(--vq-r-sm); }\n.vq-btn--lg { --_h: var(--vq-control-h-lg); font-size: 15px; }\n.vq-btn--full { width: 100%; }\n\n.vq-btn--primary { background: var(--vq-accent); color: var(--vq-accent-contrast); }\n.vq-btn--primary:hover:not(:disabled) { background: var(--vq-accent-hover); box-shadow: var(--vq-shadow-accent); }\n.vq-btn--primary:active:not(:disabled) { background: var(--vq-accent-active); }\n.vq-btn--primary:disabled { background: var(--vq-surface-disabled); color: var(--vq-text-disabled); }\n\n.vq-btn--secondary {\n  background: var(--vq-surface); color: var(--vq-accent-text);\n  border-color: color-mix(in srgb, var(--vq-accent) 42%, transparent);\n}\n.vq-btn--secondary:hover:not(:disabled) { background: var(--vq-accent-subtle); border-color: color-mix(in srgb, var(--vq-accent) 55%, transparent); }\n.vq-btn--secondary:disabled { background: var(--vq-surface-disabled); color: var(--vq-text-disabled); border-color: transparent; }\n\n.vq-btn--outline { background: var(--vq-surface); color: var(--vq-text); border-color: var(--vq-border); box-shadow: var(--vq-shadow-subtle); }\n.vq-btn--outline:hover:not(:disabled) { background: var(--vq-surface-hover); border-color: var(--vq-border-strong); }\n.vq-btn--outline:disabled { color: var(--vq-text-disabled); box-shadow: none; }\n\n.vq-btn--ghost { background: transparent; color: var(--vq-text-secondary); }\n.vq-btn--ghost:hover:not(:disabled) { background: var(--vq-surface-active); color: var(--vq-text); }\n.vq-btn--ghost:disabled { color: var(--vq-text-disabled); }\n\n.vq-btn--danger { background: var(--vq-danger-strong); color: var(--vq-solid-ink); }\n.vq-btn--danger:hover:not(:disabled) { background: var(--vq-danger-strong-hover); }\n.vq-btn--danger:disabled { background: var(--vq-surface-disabled); color: var(--vq-text-disabled); }\n\n.vq-btn--danger-soft { background: var(--vq-danger-bg); color: var(--vq-danger-text); }\n.vq-btn--danger-soft:hover:not(:disabled) { background: color-mix(in srgb, var(--vq-danger-bg) 82%, var(--vq-danger)); }\n\n.vq-btn--success { background: var(--vq-success-strong); color: var(--vq-solid-ink); }\n.vq-btn--success:hover:not(:disabled) { background: color-mix(in srgb, var(--vq-success-strong) 88%, #000); }\n\n.vq-btn--link { background: none; color: var(--vq-text-link); padding: 0; height: auto; border-radius: var(--vq-r-xs); }\n.vq-btn--link:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }\n\n.vq-btn.is-loading { pointer-events: none; }\n.vq-btn.is-loading > .vq-btn__content { opacity: 0; }\n.vq-btn__spinner { position: absolute; inset: 0; display: grid; place-items: center; }\n.vq-btn__content { display: inline-flex; align-items: center; gap: var(--vq-sp-3); }\n\n/* Icon button */\n.vq-iconbtn {\n  --_h: var(--vq-control-h-md);\n  display: inline-flex; align-items: center; justify-content: center;\n  width: var(--_h); height: var(--_h); flex: 0 0 auto;\n  border: 1px solid transparent; border-radius: var(--vq-r-md);\n  background: transparent; color: var(--vq-text-secondary); cursor: pointer;\n  transition: background var(--vq-dur-fast) var(--vq-ease-standard), color var(--vq-dur-fast) var(--vq-ease-standard);\n}\n.vq-iconbtn:hover:not(:disabled) { background: var(--vq-surface-active); color: var(--vq-text); }\n.vq-iconbtn:active:not(:disabled) { transform: scale(0.94); }\n.vq-iconbtn:disabled { color: var(--vq-text-disabled); cursor: not-allowed; }\n.vq-iconbtn--sm { --_h: var(--vq-control-h-sm); border-radius: var(--vq-r-sm); }\n.vq-iconbtn--lg { --_h: var(--vq-control-h-lg); }\n.vq-iconbtn--outline { border-color: var(--vq-border); background: var(--vq-surface); box-shadow: var(--vq-shadow-subtle); }\n.vq-iconbtn--outline:hover:not(:disabled) { border-color: var(--vq-border-strong); background: var(--vq-surface-hover); }\n.vq-iconbtn--primary { background: var(--vq-accent); color: var(--vq-accent-contrast); }\n.vq-iconbtn--primary:hover:not(:disabled) { background: var(--vq-accent-hover); color: var(--vq-accent-contrast); }\n.vq-iconbtn.is-active { background: var(--vq-accent-subtle); color: var(--vq-accent-text); }\n\n/* Button group / split */\n.vq-btngroup { display: inline-flex; }\n.vq-btngroup > .vq-btn { border-radius: 0; }\n.vq-btngroup > .vq-btn:first-child { border-radius: var(--vq-r-md) 0 0 var(--vq-r-md); }\n.vq-btngroup > .vq-btn:last-child { border-radius: 0 var(--vq-r-md) var(--vq-r-md) 0; }\n.vq-btngroup > .vq-btn--outline + .vq-btn--outline { margin-left: -1px; }\n.vq-btngroup > .vq-btn--primary + .vq-btn--primary { box-shadow: inset 1px 0 0 color-mix(in srgb, #fff 24%, transparent); }\n\n/* ── Field (input / textarea / select) ───────────────────── */\n.vq-field { display: flex; flex-direction: column; gap: var(--vq-sp-3); min-width: 0; }\n.vq-field__label { font: var(--vq-type-label); color: var(--vq-text); display: flex; gap: var(--vq-sp-2); align-items: baseline; }\n.vq-field__req { color: var(--vq-danger); font-size: 12px; }\n.vq-field__hint { font: var(--vq-type-caption); color: var(--vq-text-tertiary); }\n.vq-field__error { font: var(--vq-type-caption); font-weight: 600; color: var(--vq-danger-text); display: flex; align-items: center; gap: var(--vq-sp-2); }\n\n.vq-input {\n  position: relative; display: flex; align-items: center;\n  height: var(--vq-control-h-md);\n  background: var(--vq-surface); color: var(--vq-text);\n  border: 1px solid var(--vq-border); border-radius: var(--vq-r-md);\n  transition: border-color var(--vq-dur-fast) var(--vq-ease-standard), box-shadow var(--vq-dur-fast) var(--vq-ease-standard), background var(--vq-dur-fast) var(--vq-ease-standard);\n}\n.vq-input:hover:not(.is-disabled) { border-color: var(--vq-border-strong); }\n.vq-input:focus-within { border-color: var(--vq-border-focus); box-shadow: var(--vq-focus-ring); }\n.vq-input.is-invalid { border-color: var(--vq-danger); }\n.vq-input.is-invalid:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, var(--vq-danger) 24%, transparent); }\n.vq-input.is-disabled { background: var(--vq-surface-disabled); color: var(--vq-text-disabled); cursor: not-allowed; }\n.vq-input > input, .vq-input > select {\n  flex: 1; min-width: 0; height: 100%; padding: 0 var(--vq-field-px);\n  background: none; border: 0; outline: none; border-radius: inherit;\n  font-size: 14.5px; color: inherit;\n}\n.vq-input > input::placeholder { color: var(--vq-text-tertiary); }\n.vq-input > input:disabled { cursor: not-allowed; }\n.vq-input--sm { height: var(--vq-control-h-sm); }\n.vq-input--sm > input { font-size: 13px; }\n.vq-input--lg { height: var(--vq-control-h-lg); }\n.vq-input--lg > input { font-size: 15.5px; }\n.vq-input__icon { display: grid; place-items: center; padding-left: var(--vq-field-px); color: var(--vq-text-tertiary); flex: 0 0 auto; }\n.vq-input__icon + input { padding-left: var(--vq-sp-4); }\n.vq-input__trail { display: flex; align-items: center; gap: var(--vq-sp-1); padding-right: var(--vq-sp-3); flex: 0 0 auto; color: var(--vq-text-tertiary); }\n.vq-input__addon { display: grid; place-items: center; align-self: stretch; padding: 0 var(--vq-field-px); background: var(--vq-surface-sunken); border-right: 1px solid var(--vq-border); border-radius: calc(var(--vq-r-md) - 1px) 0 0 calc(var(--vq-r-md) - 1px); color: var(--vq-text-secondary); font-size: 13px; }\n\n.vq-textarea {\n  width: 100%; min-height: 96px; resize: vertical;\n  padding: var(--vq-sp-4) var(--vq-field-px);\n  background: var(--vq-surface); color: var(--vq-text);\n  border: 1px solid var(--vq-border); border-radius: var(--vq-r-md);\n  font-size: 14.5px; line-height: 1.8;\n  transition: border-color var(--vq-dur-fast), box-shadow var(--vq-dur-fast);\n}\n.vq-textarea:hover:not(:disabled) { border-color: var(--vq-border-strong); }\n.vq-textarea:focus { outline: none; border-color: var(--vq-border-focus); box-shadow: var(--vq-focus-ring); }\n.vq-textarea:disabled { background: var(--vq-surface-disabled); color: var(--vq-text-disabled); }\n.vq-textarea.is-invalid { border-color: var(--vq-danger); }\n\n.vq-select-chevron { pointer-events: none; margin-right: var(--vq-sp-3); color: var(--vq-text-tertiary); flex: 0 0 auto; }\n.vq-input > select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: var(--vq-sp-2); }\n\n/* character counter */\n.vq-field__count { font: var(--vq-type-caption); color: var(--vq-text-tertiary); margin-left: auto; }\n.vq-field__count.is-over { color: var(--vq-danger-text); font-weight: 700; }\n\n/* OTP */\n.vq-otp { display: flex; gap: var(--vq-sp-4); }\n.vq-otp > input {\n  width: 48px; height: 56px; text-align: center;\n  font: var(--vq-type-heading-lg); font-variant-numeric: tabular-nums;\n  background: var(--vq-surface); color: var(--vq-text);\n  border: 1.5px solid var(--vq-border); border-radius: var(--vq-r-md);\n  transition: border-color var(--vq-dur-fast), box-shadow var(--vq-dur-fast), transform var(--vq-dur-fast);\n}\n.vq-otp > input:focus { outline: none; border-color: var(--vq-border-focus); box-shadow: var(--vq-focus-ring); }\n.vq-otp > input.is-filled { border-color: var(--vq-border-strong); }\n.vq-otp.is-invalid > input { border-color: var(--vq-danger); animation: vq-shake 0.4s; }\n\n/* ── Checkbox / Radio / Switch / Slider ──────────────────── */\n.vq-check { display: inline-flex; align-items: flex-start; gap: var(--vq-sp-4); cursor: pointer; position: relative; }\n.vq-check input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }\n.vq-check__box {\n  width: 18px; height: 18px; margin-top: 2px; flex: 0 0 auto;\n  display: grid; place-items: center;\n  border: 1.5px solid var(--vq-border-strong); border-radius: var(--vq-r-xs);\n  background: var(--vq-surface); color: transparent;\n  transition: background var(--vq-dur-fast) var(--vq-ease-standard), border-color var(--vq-dur-fast), color var(--vq-dur-fast);\n}\n.vq-check:hover input:not(:disabled) ~ .vq-check__box { border-color: var(--vq-accent); }\n.vq-check input:checked ~ .vq-check__box,\n.vq-check input:indeterminate ~ .vq-check__box { background: var(--vq-accent); border-color: var(--vq-accent); color: var(--vq-accent-contrast); }\n.vq-check input:focus-visible ~ .vq-check__box { box-shadow: var(--vq-focus-ring); }\n.vq-check input:disabled ~ .vq-check__box { background: var(--vq-surface-disabled); border-color: var(--vq-border); }\n.vq-check input:disabled ~ .vq-check__label { color: var(--vq-text-disabled); }\n.vq-check input:checked ~ .vq-check__box svg { animation: vq-pop var(--vq-dur-slow) var(--vq-ease-spring); }\n.vq-check__label { font-size: 14px; line-height: 1.6; user-select: none; }\n.vq-check__box--radio { border-radius: var(--vq-r-full); }\n.vq-check input:checked ~ .vq-check__box--radio { background: var(--vq-surface); }\n.vq-check input:checked ~ .vq-check__box--radio::after {\n  content: \"\"; width: 9px; height: 9px; border-radius: 99px; background: var(--vq-accent);\n  animation: vq-pop var(--vq-dur-slow) var(--vq-ease-spring);\n}\n.vq-check input:disabled:checked ~ .vq-check__box--radio::after { background: var(--vq-text-disabled); }\n\n.vq-switch { display: inline-flex; align-items: center; gap: var(--vq-sp-4); cursor: pointer; position: relative; }\n.vq-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }\n.vq-switch__track {\n  width: 40px; height: 24px; border-radius: var(--vq-r-full); flex: 0 0 auto;\n  background: var(--vq-border-strong); position: relative;\n  transition: background var(--vq-dur-normal) var(--vq-ease-standard);\n}\n.vq-switch__track::after {\n  content: \"\"; position: absolute; top: 3px; left: 3px;\n  width: 18px; height: 18px; border-radius: 99px; background: #fff;\n  box-shadow: var(--vq-shadow-subtle);\n  transition: transform var(--vq-dur-normal) var(--vq-ease-spring);\n}\n.vq-switch input:checked ~ .vq-switch__track { background: var(--vq-accent); }\n.vq-switch input:checked ~ .vq-switch__track::after { transform: translateX(16px); }\n.vq-switch input:focus-visible ~ .vq-switch__track { box-shadow: var(--vq-focus-ring); }\n.vq-switch input:disabled ~ .vq-switch__track { opacity: 0.5; }\n.vq-switch--sm .vq-switch__track { width: 32px; height: 19px; }\n.vq-switch--sm .vq-switch__track::after { width: 13px; height: 13px; }\n.vq-switch--sm input:checked ~ .vq-switch__track::after { transform: translateX(13px); }\n\n.vq-slider { -webkit-appearance: none; width: 100%; height: 24px; background: none; cursor: pointer; }\n.vq-slider::-webkit-slider-runnable-track {\n  height: 5px; border-radius: 99px;\n  background: linear-gradient(to right, var(--vq-accent) var(--_fill, 50%), var(--vq-border) var(--_fill, 50%));\n}\n.vq-slider::-webkit-slider-thumb {\n  -webkit-appearance: none; width: 17px; height: 17px; margin-top: -6px;\n  border-radius: 99px; background: #fff; border: 1.5px solid var(--vq-accent);\n  box-shadow: var(--vq-shadow-subtle); transition: transform var(--vq-dur-fast);\n}\n.vq-slider:active::-webkit-slider-thumb { transform: scale(1.2); }\n.vq-slider:focus-visible { outline: none; }\n.vq-slider:focus-visible::-webkit-slider-thumb { box-shadow: var(--vq-focus-ring); }\n\n/* ── Tabs / Segmented ────────────────────────────────────── */\n.vq-tabs { display: flex; gap: var(--vq-sp-1); border-bottom: 1px solid var(--vq-border); position: relative; overflow-x: auto; scrollbar-width: none; }\n.vq-tabs::-webkit-scrollbar { display: none; }\n.vq-tab {\n  position: relative; padding: var(--vq-sp-4) var(--vq-sp-5);\n  background: none; border: 0; cursor: pointer;\n  font: var(--vq-type-label); font-size: 13.5px; color: var(--vq-text-secondary);\n  white-space: nowrap; border-radius: var(--vq-r-sm) var(--vq-r-sm) 0 0;\n  transition: color var(--vq-dur-fast);\n}\n.vq-tab:hover { color: var(--vq-text); }\n.vq-tab[aria-selected=\"true\"] { color: var(--vq-accent-text); }\n.vq-tab__ink { position: absolute; left: var(--vq-sp-5); right: var(--vq-sp-5); bottom: -1px; height: 2px; border-radius: 2px; background: var(--vq-accent); animation: vq-fade-in var(--vq-dur-normal); }\n.vq-tab__count { margin-left: var(--vq-sp-2); font-size: 11px; color: var(--vq-text-tertiary); background: var(--vq-surface-active); border-radius: var(--vq-r-full); padding: 1px 7px; }\n\n.vq-seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--vq-surface-active); border-radius: var(--vq-r-full); }\n.vq-seg__btn {\n  display: inline-flex; align-items: center; justify-content: center; gap: var(--vq-sp-2);\n  height: calc(var(--vq-control-h-sm) - 4px); padding: 0 var(--vq-sp-5);\n  border: 0; border-radius: var(--vq-r-full);\n  background: transparent; color: var(--vq-text-secondary);\n  font: var(--vq-type-label); font-size: 13px; cursor: pointer;\n  transition: background var(--vq-dur-fast), color var(--vq-dur-fast), box-shadow var(--vq-dur-fast);\n}\n.vq-seg__btn:hover { color: var(--vq-text); }\n.vq-seg__btn[aria-pressed=\"true\"], .vq-seg__btn[aria-selected=\"true\"] {\n  background: var(--vq-surface); color: var(--vq-text); box-shadow: var(--vq-shadow-subtle);\n}\n\n/* ── Badge / Tag / Chip / Avatar / Kbd ───────────────────── */\n.vq-badge {\n  display: inline-flex; align-items: center; gap: var(--vq-sp-2);\n  padding: 2px 9px; border-radius: var(--vq-r-full);\n  font: var(--vq-type-caption); font-weight: 650; letter-spacing: 0.015em;\n  background: var(--vq-surface-active); color: var(--vq-text-secondary);\n  border: 1px solid transparent;\n}\n.vq-badge--accent  { background: var(--vq-accent-subtle);  color: var(--vq-accent-text); }\n.vq-badge--success { background: var(--vq-success-bg); color: var(--vq-success-text); }\n.vq-badge--warning { background: var(--vq-warning-bg); color: var(--vq-warning-text); }\n.vq-badge--danger  { background: var(--vq-danger-bg);  color: var(--vq-danger-text); }\n.vq-badge--info    { background: var(--vq-info-bg);    color: var(--vq-info-text); }\n.vq-badge--ai      { background: var(--vq-ai-bg);      color: var(--vq-ai-text); }\n.vq-badge--qredit  { background: var(--vq-qredit-bg);  color: var(--vq-qredit); }\n.vq-badge--outline { background: transparent; border-color: var(--vq-border-strong); color: var(--vq-text-secondary); }\n.vq-badge__dot { width: 6px; height: 6px; border-radius: 99px; background: currentColor; }\n\n.vq-tag {\n  display: inline-flex; align-items: center; gap: var(--vq-sp-2);\n  height: 26px; padding: 0 var(--vq-sp-4);\n  border: 1px solid var(--vq-border); border-radius: var(--vq-r-sm);\n  background: var(--vq-surface); font-size: 12.5px; font-weight: 550; color: var(--vq-text-secondary);\n}\n.vq-tag__x { display: grid; place-items: center; margin-right: -4px; border: 0; background: none; color: var(--vq-text-tertiary); cursor: pointer; border-radius: var(--vq-r-xs); padding: 2px; }\n.vq-tag__x:hover { color: var(--vq-danger); background: var(--vq-danger-bg); }\n\n.vq-chip {\n  display: inline-flex; align-items: center; gap: var(--vq-sp-2);\n  height: var(--vq-control-h-sm); padding: 0 var(--vq-sp-5);\n  border: 1px solid var(--vq-border); border-radius: var(--vq-r-full);\n  background: var(--vq-surface); color: var(--vq-text-secondary);\n  font: var(--vq-type-label); font-size: 13px; cursor: pointer;\n  transition: all var(--vq-dur-fast) var(--vq-ease-standard);\n}\n.vq-chip:hover { border-color: var(--vq-border-strong); color: var(--vq-text); }\n.vq-chip[aria-pressed=\"true\"] {\n  background: var(--vq-accent-subtle); border-color: var(--vq-accent); color: var(--vq-accent-text);\n}\n\n.vq-avatar {\n  --_sz: 40px;\n  width: var(--_sz); height: var(--_sz); flex: 0 0 auto;\n  border-radius: var(--vq-r-full); overflow: hidden;\n  display: grid; place-items: center;\n  background: var(--vq-accent-subtle); color: var(--vq-accent-text);\n  font-weight: 700; font-size: calc(var(--_sz) * 0.38); letter-spacing: 0.02em;\n  position: relative; user-select: none;\n}\n.vq-avatar--xs { --_sz: 24px; } .vq-avatar--sm { --_sz: 32px; }\n.vq-avatar--lg { --_sz: 56px; } .vq-avatar--xl { --_sz: 80px; }\n.vq-avatar--square { border-radius: var(--vq-r-md); }\n.vq-avatar__status {\n  position: absolute; right: 0; bottom: 0;\n  width: 27%; height: 27%; border-radius: 99px;\n  border: 2px solid var(--vq-surface); background: var(--vq-success);\n}\n.vq-avatar-group { display: inline-flex; }\n.vq-avatar-group .vq-avatar { border: 2px solid var(--vq-surface); }\n.vq-avatar-group .vq-avatar + .vq-avatar { margin-left: -10px; }\n\n.vq-kbd {\n  display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px;\n  border: 1px solid var(--vq-border-strong); border-bottom-width: 2px; border-radius: var(--vq-r-xs);\n  background: var(--vq-surface); font: var(--vq-type-caption); font-family: var(--vq-font-mono); color: var(--vq-text-secondary);\n}\n\n/* ── Card / StatCard / ListItem / Divider ────────────────── */\n.vq-card {\n  background: var(--vq-surface);\n  border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-lg);\n  box-shadow: var(--vq-shadow-subtle);\n}\n.vq-card--pad { padding: var(--vq-card-p); }\n.vq-card--hover { transition: border-color var(--vq-dur-fast), box-shadow var(--vq-dur-normal) var(--vq-ease-standard), transform var(--vq-dur-normal) var(--vq-ease-standard); }\n.vq-card--hover:hover { border-color: var(--vq-border-strong); box-shadow: var(--vq-shadow-raised); transform: translateY(-1px); }\n.vq-card--flat { box-shadow: none; }\n.vq-card--sunken { background: var(--vq-surface-sunken); border-color: transparent; box-shadow: none; }\n.vq-card--selected { border-color: var(--vq-accent); box-shadow: 0 0 0 1px var(--vq-accent), var(--vq-shadow-subtle); }\n\n.vq-divider { border: 0; border-top: 1px solid var(--vq-border); margin: 0; }\n.vq-divider--label { display: flex; align-items: center; gap: var(--vq-sp-6); border: 0; color: var(--vq-text-tertiary); font: var(--vq-type-caption); }\n.vq-divider--label::before, .vq-divider--label::after { content: \"\"; flex: 1; border-top: 1px solid var(--vq-border); }\n.vq-divider--v { border-top: 0; border-left: 1px solid var(--vq-border); align-self: stretch; }\n\n.vq-listitem {\n  display: flex; align-items: center; gap: var(--vq-sp-5);\n  padding: var(--vq-sp-5) var(--vq-sp-6);\n  border-radius: var(--vq-r-md); cursor: pointer;\n  transition: background var(--vq-dur-fast);\n  text-align: left; width: 100%; border: 0; background: none; color: inherit; font: inherit;\n}\n.vq-listitem:hover { background: var(--vq-surface-hover); }\n.vq-listitem.is-selected { background: var(--vq-surface-selected); }\n\n/* ── Overlays: Modal / Drawer / Popover / Tooltip / Menu ─── */\n.vq-overlay {\n  position: fixed; inset: 0; z-index: 100;\n  background: var(--vq-surface-overlay);\n  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);\n  display: grid; place-items: center; padding: var(--vq-sp-6);\n  animation: vq-fade-in var(--vq-dur-normal) var(--vq-ease-standard);\n}\n.vq-overlay.is-closing { animation: vq-fade-in var(--vq-dur-normal) var(--vq-ease-exit) reverse forwards; }\n.vq-modal {\n  width: min(480px, 100%); max-height: min(86dvh, 720px);\n  display: flex; flex-direction: column;\n  background: var(--vq-bg-elevated); border-radius: var(--vq-r-xl);\n  box-shadow: var(--vq-shadow-modal); border: 1px solid var(--vq-border-subtle);\n  animation: vq-scale-in var(--vq-dur-slow) var(--vq-ease-enter);\n}\n.vq-overlay.is-closing .vq-modal { animation: vq-scale-in var(--vq-dur-normal) var(--vq-ease-exit) reverse forwards; }\n.vq-modal--lg { width: min(680px, 100%); }\n.vq-modal--xl { width: min(920px, 100%); }\n.vq-modal__head { display: flex; align-items: flex-start; gap: var(--vq-sp-5); padding: var(--vq-sp-7) var(--vq-sp-8) 0; }\n.vq-modal__title { font: var(--vq-type-heading-md); }\n.vq-modal__desc { font: var(--vq-type-body-sm); color: var(--vq-text-secondary); margin-top: var(--vq-sp-2); }\n.vq-modal__body { padding: var(--vq-sp-6) var(--vq-sp-8); overflow-y: auto; flex: 1; }\n.vq-modal__foot { display: flex; justify-content: flex-end; gap: var(--vq-sp-4); padding: var(--vq-sp-5) var(--vq-sp-8) var(--vq-sp-7); }\n.vq-modal__foot--between { justify-content: space-between; align-items: center; }\n\n/* モバイルでは Bottom Sheet 化 */\n@container vq-screen (max-width: 640px) {\n  .vq-overlay { place-items: end center; padding: 0; }\n  .vq-modal, .vq-modal--lg, .vq-modal--xl {\n    width: 100%; max-height: 92dvh;\n    border-radius: var(--vq-r-2xl) var(--vq-r-2xl) 0 0;\n    animation: vq-sheet-up var(--vq-dur-slow) var(--vq-ease-enter);\n    padding-bottom: var(--vq-sab,0px);\n  }\n}\n@media (max-width: 640px) {\n  .vq-overlay:not([data-in-frame]) { place-items: end center; padding: 0; }\n  .vq-overlay:not([data-in-frame]) .vq-modal {\n    width: 100%; max-height: 92dvh;\n    border-radius: var(--vq-r-2xl) var(--vq-r-2xl) 0 0;\n    animation: vq-sheet-up var(--vq-dur-slow) var(--vq-ease-enter);\n    padding-bottom: var(--vq-sab,0px);\n  }\n}\n@keyframes vq-sheet-up { from { transform: translateY(40px); opacity: 0.4; } to { transform: none; opacity: 1; } }\n.vq-sheet-grab { width: 40px; height: 4px; border-radius: 99px; background: var(--vq-border-strong); margin: var(--vq-sp-4) auto calc(var(--vq-sp-2) * -1); }\n\n.vq-drawer-overlay { position: fixed; inset: 0; z-index: 100; background: var(--vq-surface-overlay); animation: vq-fade-in var(--vq-dur-normal); }\n.vq-drawer {\n  position: fixed; top: 0; bottom: 0; z-index: 101;\n  width: min(400px, 92vw);\n  background: var(--vq-bg-elevated); box-shadow: var(--vq-shadow-modal);\n  display: flex; flex-direction: column;\n}\n.vq-drawer--right { right: 0; border-left: 1px solid var(--vq-border-subtle); animation: vq-drawer-right var(--vq-dur-slow) var(--vq-ease-enter); }\n.vq-drawer--left { left: 0; border-right: 1px solid var(--vq-border-subtle); animation: vq-drawer-left var(--vq-dur-slow) var(--vq-ease-enter); }\n@keyframes vq-drawer-right { from { transform: translateX(60px); opacity: 0.5; } to { transform: none; opacity: 1; } }\n@keyframes vq-drawer-left { from { transform: translateX(-60px); opacity: 0.5; } to { transform: none; opacity: 1; } }\n.vq-drawer__head { display: flex; align-items: center; gap: var(--vq-sp-4); padding: var(--vq-sp-6) var(--vq-sp-7); border-bottom: 1px solid var(--vq-border-subtle); }\n.vq-drawer__body { flex: 1; overflow-y: auto; padding: var(--vq-sp-6) var(--vq-sp-7); }\n\n.vq-menu {\n  min-width: 200px; padding: var(--vq-sp-2);\n  background: var(--vq-bg-elevated); border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-md); box-shadow: var(--vq-shadow-floating);\n  animation: vq-fade-down var(--vq-dur-fast) var(--vq-ease-enter);\n}\n.vq-menu__item {\n  display: flex; align-items: center; gap: var(--vq-sp-4); width: 100%;\n  padding: var(--vq-sp-4) var(--vq-sp-5); border: 0; background: none;\n  border-radius: var(--vq-r-sm); cursor: pointer; text-align: left;\n  font-size: 13.5px; font-weight: 500; color: var(--vq-text);\n  transition: background var(--vq-dur-fast);\n}\n.vq-menu__item:hover, .vq-menu__item.is-focused { background: var(--vq-surface-active); }\n.vq-menu__item.is-danger { color: var(--vq-danger-text); }\n.vq-menu__item.is-danger:hover { background: var(--vq-danger-bg); }\n.vq-menu__item:disabled { color: var(--vq-text-disabled); cursor: not-allowed; background: none; }\n.vq-menu__sep { border: 0; border-top: 1px solid var(--vq-border-subtle); margin: var(--vq-sp-2) calc(var(--vq-sp-2) * -1); }\n.vq-menu__label { padding: var(--vq-sp-3) var(--vq-sp-5) var(--vq-sp-1); font: var(--vq-type-caption); font-weight: 650; color: var(--vq-text-tertiary); letter-spacing: 0.04em; }\n.vq-menu__hint { margin-left: auto; color: var(--vq-text-tertiary); font-size: 12px; }\n\n.vq-tooltip {\n  position: fixed; z-index: 200; pointer-events: none;\n  max-width: 260px; padding: var(--vq-sp-3) var(--vq-sp-5);\n  background: var(--vq-gray-800); color: #fff;\n  border-radius: var(--vq-r-sm); font: var(--vq-type-caption); font-weight: 550; line-height: 1.6;\n  box-shadow: var(--vq-shadow-raised);\n  animation: vq-fade-in var(--vq-dur-fast) var(--vq-ease-standard);\n}\n:root[data-theme=\"dark\"] .vq-tooltip { background: var(--vq-gray-100); color: var(--vq-gray-900); }\n\n.vq-popover {\n  position: absolute; z-index: 90;\n  background: var(--vq-bg-elevated); border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-lg); box-shadow: var(--vq-shadow-floating);\n  padding: var(--vq-sp-6); animation: vq-fade-down var(--vq-dur-normal) var(--vq-ease-enter);\n}\n\n/* ── Toast ───────────────────────────────────────────────── */\n.vq-toaster {\n  position: fixed; z-index: 300; bottom: calc(var(--vq-sp-7) + var(--vq-sab,0px)); left: 50%; transform: translateX(-50%);\n  display: flex; flex-direction: column-reverse; gap: var(--vq-sp-4); align-items: center;\n  pointer-events: none; width: min(420px, calc(100vw - 32px));\n}\n.vq-toast {\n  pointer-events: auto; display: flex; align-items: flex-start; gap: var(--vq-sp-4);\n  width: 100%; padding: var(--vq-sp-5) var(--vq-sp-6);\n  background: var(--vq-bg-elevated); border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-lg); box-shadow: var(--vq-shadow-floating);\n  animation: vq-toast-in var(--vq-dur-slow) var(--vq-ease-spring);\n}\n.vq-toast.is-leaving { animation: vq-toast-out var(--vq-dur-normal) var(--vq-ease-exit) forwards; }\n@keyframes vq-toast-in { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: none; } }\n@keyframes vq-toast-out { to { opacity: 0; transform: translateY(8px) scale(0.98); } }\n.vq-toast__icon { flex: 0 0 auto; margin-top: 1px; }\n.vq-toast__title { font: var(--vq-type-label); font-size: 13.5px; }\n.vq-toast__desc { font: var(--vq-type-caption); font-weight: 450; color: var(--vq-text-secondary); margin-top: 2px; }\n\n/* ── Alert / Banner ──────────────────────────────────────── */\n.vq-alert {\n  display: flex; gap: var(--vq-sp-4); align-items: flex-start;\n  padding: var(--vq-sp-5) var(--vq-sp-6);\n  border: 1px solid var(--vq-border); border-radius: var(--vq-r-md);\n  background: var(--vq-surface); font: var(--vq-type-body-sm);\n}\n.vq-alert__icon { flex: 0 0 auto; margin-top: 2px; }\n.vq-alert__title { font-weight: 650; margin-bottom: 2px; }\n.vq-alert--info    { background: var(--vq-info-bg);    border-color: color-mix(in srgb, var(--vq-info) 26%, transparent);    color: var(--vq-text); }\n.vq-alert--info .vq-alert__icon { color: var(--vq-info-text); }\n.vq-alert--success { background: var(--vq-success-bg); border-color: color-mix(in srgb, var(--vq-success) 30%, transparent); }\n.vq-alert--success .vq-alert__icon { color: var(--vq-success-text); }\n.vq-alert--warning { background: var(--vq-warning-bg); border-color: color-mix(in srgb, var(--vq-warning) 34%, transparent); }\n.vq-alert--warning .vq-alert__icon { color: var(--vq-warning-text); }\n.vq-alert--danger  { background: var(--vq-danger-bg);  border-color: color-mix(in srgb, var(--vq-danger) 28%, transparent); }\n.vq-alert--danger .vq-alert__icon { color: var(--vq-danger-text); }\n.vq-alert--ai      { background: var(--vq-ai-bg); border-color: color-mix(in srgb, var(--vq-ai) 28%, transparent); }\n.vq-alert--ai .vq-alert__icon { color: var(--vq-ai-text); }\n\n.vq-banner {\n  display: flex; align-items: center; gap: var(--vq-sp-5);\n  padding: var(--vq-sp-4) var(--vq-sp-6);\n  font: var(--vq-type-body-sm); font-weight: 550;\n}\n.vq-banner--info { background: var(--vq-accent-subtle); color: var(--vq-accent-text); }\n.vq-banner--warning { background: var(--vq-warning-bg); color: var(--vq-warning-text); }\n.vq-banner--danger { background: var(--vq-danger-bg); color: var(--vq-danger-text); }\n\n/* ── Empty / Error states ────────────────────────────────── */\n.vq-empty {\n  display: flex; flex-direction: column; align-items: center; text-align: center;\n  padding: var(--vq-sp-12) var(--vq-sp-8); gap: var(--vq-sp-4);\n}\n.vq-empty__icon {\n  width: 56px; height: 56px; border-radius: var(--vq-r-full);\n  display: grid; place-items: center;\n  background: var(--vq-surface-active); color: var(--vq-text-tertiary);\n  margin-bottom: var(--vq-sp-2);\n}\n.vq-empty__title { font: var(--vq-type-heading-sm); color: var(--vq-text); }\n.vq-empty__desc { font: var(--vq-type-body-sm); color: var(--vq-text-tertiary); max-width: 360px; }\n.vq-empty__actions { display: flex; gap: var(--vq-sp-4); margin-top: var(--vq-sp-4); flex-wrap: wrap; justify-content: center; }\n\n/* ── Table ───────────────────────────────────────────────── */\n.vq-table-wrap { border: 1px solid var(--vq-border-subtle); border-radius: var(--vq-r-lg); background: var(--vq-surface); overflow: hidden; }\n.vq-table-scroll { overflow-x: auto; }\n.vq-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }\n.vq-table th {\n  text-align: left; padding: var(--vq-sp-4) var(--vq-sp-6);\n  font: var(--vq-type-caption); font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase;\n  color: var(--vq-text-tertiary); background: var(--vq-surface-sunken);\n  border-bottom: 1px solid var(--vq-border); white-space: nowrap;\n}\n.vq-table th.is-sortable { cursor: pointer; user-select: none; }\n.vq-table th.is-sortable:hover { color: var(--vq-text); }\n.vq-table td { padding: var(--vq-sp-5) var(--vq-sp-6); border-bottom: 1px solid var(--vq-border-subtle); vertical-align: middle; }\n.vq-table tbody tr { transition: background var(--vq-dur-fast); }\n.vq-table tbody tr:hover { background: var(--vq-surface-hover); }\n.vq-table tbody tr:last-child td { border-bottom: 0; }\n.vq-table tbody tr.is-selected { background: var(--vq-surface-selected); }\n.vq-table .is-num { text-align: right; font-variant-numeric: tabular-nums; }\n\n/* ── Progress / Stepper / Skeleton / Spinner ─────────────── */\n.vq-progress { height: 6px; border-radius: var(--vq-r-full); background: var(--vq-surface-active); overflow: hidden; }\n.vq-progress__fill {\n  height: 100%; border-radius: inherit; background: var(--vq-accent);\n  transition: width var(--vq-dur-deliberate) var(--vq-ease-standard);\n}\n.vq-progress--sm { height: 4px; }\n.vq-progress--lg { height: 10px; }\n.vq-progress__fill--success { background: var(--vq-success); }\n.vq-progress__fill--warning { background: var(--vq-warning); }\n.vq-progress__fill--danger { background: var(--vq-danger); }\n.vq-progress__fill--gradient { background: linear-gradient(90deg, var(--vq-accent), var(--vq-ai)); }\n\n.vq-spinner { animation: vq-spin 0.8s linear infinite; color: var(--vq-accent); }\n.vq-spinner--muted { color: var(--vq-text-tertiary); }\n\n.vq-skeleton {\n  border-radius: var(--vq-r-sm);\n  background: linear-gradient(90deg, var(--vq-surface-active) 25%, var(--vq-surface-sunken) 50%, var(--vq-surface-active) 75%);\n  background-size: 200% 100%;\n  animation: vq-shimmer 1.6s ease-in-out infinite;\n}\n.vq-skeleton--text { height: 13px; }\n.vq-skeleton--circle { border-radius: 99px; }\n\n.vq-stepper { display: flex; align-items: center; gap: var(--vq-sp-3); }\n.vq-stepper__node { display: flex; align-items: center; gap: var(--vq-sp-3); color: var(--vq-text-tertiary); font: var(--vq-type-caption); font-weight: 600; }\n.vq-stepper__dot {\n  width: 26px; height: 26px; border-radius: 99px; flex: 0 0 auto;\n  display: grid; place-items: center; font-size: 12px; font-weight: 700;\n  background: var(--vq-surface-active); color: var(--vq-text-tertiary);\n  border: 1.5px solid transparent;\n  transition: all var(--vq-dur-normal) var(--vq-ease-standard);\n}\n.vq-stepper__node.is-active { color: var(--vq-text); }\n.vq-stepper__node.is-active .vq-stepper__dot { border-color: var(--vq-accent); color: var(--vq-accent-text); background: var(--vq-accent-subtle); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vq-accent) 14%, transparent); }\n.vq-stepper__node.is-done .vq-stepper__dot { background: var(--vq-accent); color: var(--vq-accent-contrast); }\n.vq-stepper__line { flex: 1; min-width: 18px; height: 2px; border-radius: 2px; background: var(--vq-border); }\n.vq-stepper__line.is-done { background: var(--vq-accent); }\n\n/* ── Breadcrumbs / Pagination ────────────────────────────── */\n.vq-crumbs { display: flex; align-items: center; gap: var(--vq-sp-2); font-size: 12.5px; color: var(--vq-text-tertiary); flex-wrap: wrap; }\n.vq-crumbs a, .vq-crumbs button { color: var(--vq-text-tertiary); background: none; border: 0; cursor: pointer; font: inherit; padding: 2px 4px; border-radius: var(--vq-r-xs); }\n.vq-crumbs a:hover, .vq-crumbs button:hover { color: var(--vq-text); text-decoration: none; background: var(--vq-surface-active); }\n.vq-crumbs__sep { color: var(--vq-border-strong); }\n.vq-crumbs__current { color: var(--vq-text); font-weight: 600; padding: 2px 4px; }\n\n.vq-pagination { display: flex; align-items: center; gap: var(--vq-sp-2); }\n.vq-page-btn {\n  min-width: 34px; height: 34px; padding: 0 var(--vq-sp-3);\n  display: inline-flex; align-items: center; justify-content: center;\n  border: 1px solid transparent; border-radius: var(--vq-r-sm);\n  background: none; color: var(--vq-text-secondary);\n  font: var(--vq-type-label); font-size: 13px; font-variant-numeric: tabular-nums; cursor: pointer;\n  transition: all var(--vq-dur-fast);\n}\n.vq-page-btn:hover:not(:disabled) { background: var(--vq-surface-active); color: var(--vq-text); }\n.vq-page-btn[aria-current=\"page\"] { background: var(--vq-accent); color: var(--vq-accent-contrast); }\n.vq-page-btn:disabled { color: var(--vq-text-disabled); cursor: not-allowed; }\n\n/* ── Command palette ─────────────────────────────────────── */\n.vq-cmdk-overlay {\n  position: fixed; inset: 0; z-index: 250;\n  background: var(--vq-surface-overlay);\n  display: flex; justify-content: center; align-items: flex-start;\n  padding: 14vh var(--vq-sp-6) var(--vq-sp-6);\n  animation: vq-fade-in var(--vq-dur-fast);\n}\n.vq-cmdk {\n  width: min(560px, 100%); max-height: 420px;\n  display: flex; flex-direction: column;\n  background: var(--vq-bg-elevated); border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-xl); box-shadow: var(--vq-shadow-modal);\n  animation: vq-scale-in var(--vq-dur-normal) var(--vq-ease-enter);\n  overflow: hidden;\n}\n.vq-cmdk__input {\n  display: flex; align-items: center; gap: var(--vq-sp-4);\n  padding: var(--vq-sp-5) var(--vq-sp-6);\n  border-bottom: 1px solid var(--vq-border-subtle);\n  color: var(--vq-text-tertiary);\n}\n.vq-cmdk__input input { flex: 1; border: 0; background: none; outline: none; font-size: 15px; color: var(--vq-text); }\n.vq-cmdk__list { overflow-y: auto; padding: var(--vq-sp-3); }\n.vq-cmdk__group { padding: var(--vq-sp-4) var(--vq-sp-5) var(--vq-sp-1); font: var(--vq-type-caption); font-weight: 650; color: var(--vq-text-tertiary); letter-spacing: 0.04em; }\n.vq-cmdk__item {\n  display: flex; align-items: center; gap: var(--vq-sp-4);\n  width: 100%; padding: var(--vq-sp-4) var(--vq-sp-5);\n  border: 0; background: none; border-radius: var(--vq-r-sm);\n  font-size: 13.5px; font-weight: 500; color: var(--vq-text); cursor: pointer;\n  text-align: left;\n}\n.vq-cmdk__item.is-focused { background: var(--vq-accent-subtle); color: var(--vq-accent-text); }\n.vq-cmdk__path { margin-left: auto; font: var(--vq-type-caption); color: var(--vq-text-tertiary); }\n\n/* ── Timer ring ──────────────────────────────────────────── */\n.vq-ring { transform: rotate(-90deg); }\n.vq-ring__track { stroke: var(--vq-surface-active); }\n.vq-ring__fill { stroke: var(--vq-accent); transition: stroke-dashoffset 1s linear, stroke var(--vq-dur-normal); }\n.vq-ring__fill.is-warning { stroke: var(--vq-warning); }\n.vq-ring__fill.is-danger { stroke: var(--vq-danger); }\n\n\n/* ── ロゴ ────────────────────────────────────────────────── */\n.qz-logo {\n  width: 38px; height: 38px; border-radius: 12px; flex: 0 0 auto;\n  display: grid; place-items: center;\n  background: var(--vq-accent);\n  color: var(--vq-accent-contrast); font-weight: 800; font-size: 14px; letter-spacing: 0.03em;\n  font-family: var(--vq-font-display);\n  box-shadow: var(--vq-shadow-accent);\n}\n\n/* ── Splash ──────────────────────────────────────────────── */\n.qz-splash {\n  min-height: 640px; height: 100%;\n  display: grid; place-items: center;\n  background:\n    radial-gradient(52% 40% at 50% 12%, color-mix(in srgb, var(--vq-accent) 9%, transparent), transparent 70%),\n    var(--vq-lav-100);\n  position: relative; overflow: hidden;\n}\n:root[data-theme=\"dark\"] .qz-splash { background: radial-gradient(52% 40% at 50% 12%, color-mix(in srgb, var(--vq-accent) 10%, transparent), transparent 70%), var(--vq-bg); }\n.qz-splash__inner { text-align: center; animation: vq-fade-up var(--vq-dur-deliberate) var(--vq-ease-enter); }\n.qz-splash__logo {\n  width: 84px; height: 84px; margin: 0 auto var(--vq-sp-6); border-radius: 24px;\n  display: grid; place-items: center;\n  background: var(--vq-accent); color: var(--vq-accent-contrast);\n  font: 800 30px / 1 var(--vq-font-display); letter-spacing: 0.02em;\n  box-shadow: var(--vq-shadow-accent);\n  animation: qz-splash-pop 0.7s var(--vq-ease-spring) both;\n}\n@keyframes qz-splash-pop { 0% { opacity: 0; transform: scale(0.7); } 60% { transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }\n.qz-splash__name { font: var(--vq-type-heading-xl); letter-spacing: 0.01em; }\n.qz-splash__tag { font: var(--vq-type-body-sm); color: var(--vq-text-secondary); margin-top: var(--vq-sp-3); }\n.qz-splash__foot { position: absolute; bottom: calc(var(--vq-sp-8) + var(--vq-sab,0px)); left: 0; right: 0; display: grid; justify-items: center; gap: var(--vq-sp-4); }\n\n/* ── Onboarding（イントロ3枚） ────────────────────────────── */\n.qz-ob {\n  min-height: 640px; height: 100%;\n  display: flex; flex-direction: column;\n  background: var(--vq-bg);\n}\n.qz-ob__bar { display: flex; align-items: center; padding: var(--vq-sp-5) var(--vq-sp-6); }\n.qz-ob__slide {\n  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;\n  text-align: center; padding: var(--vq-sp-6) var(--vq-sp-7);\n  animation: vq-fade-up var(--vq-dur-slow) var(--vq-ease-enter);\n}\n.qz-ob__illus { margin-bottom: var(--vq-sp-7); animation: qz-ob-float 4.5s ease-in-out infinite; }\n@keyframes qz-ob-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }\n.qz-ob__title { font: var(--vq-type-heading-xl); margin-bottom: var(--vq-sp-4); max-width: 420px; }\n.qz-ob__desc { font: var(--vq-type-body-md); color: var(--vq-text-secondary); max-width: 400px; }\n.qz-ob__dots { display: flex; gap: var(--vq-sp-3); justify-content: center; padding: var(--vq-sp-5) 0; }\n.qz-ob__dots i {\n  width: 8px; height: 8px; border-radius: 99px; background: var(--vq-border-strong);\n  transition: all var(--vq-dur-normal) var(--vq-ease-standard);\n}\n.qz-ob__dots i.is-active { width: 24px; background: var(--vq-accent); }\n.qz-ob__foot {\n  display: grid; gap: var(--vq-sp-4);\n  padding: 0 var(--vq-sp-7) calc(var(--vq-sp-8) + var(--vq-sab,0px));\n  width: min(400px, 100%); margin: 0 auto;\n}\n\n/* ── Welcome ─────────────────────────────────────────────── */\n.qz-welcome {\n  min-height: 640px; height: 100%;\n  display: flex; flex-direction: column;\n  position: relative; overflow: hidden;\n  background:\n    radial-gradient(46% 38% at 86% -4%, color-mix(in srgb, var(--vq-accent) 8%, transparent), transparent 72%),\n    radial-gradient(36% 30% at 2% 104%, color-mix(in srgb, var(--vq-il-d) 22%, transparent), transparent 72%),\n    var(--vq-bg);\n}\n.qz-welcome__bar {\n  display: flex; align-items: center; gap: var(--vq-sp-4);\n  padding: var(--vq-sp-6) var(--vq-sp-8); position: relative; z-index: 1;\n}\n.qz-welcome__body {\n  flex: 1; position: relative; z-index: 1;\n  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);\n  gap: var(--vq-sp-10); align-items: center;\n  padding: var(--vq-sp-8) var(--vq-sp-10) var(--vq-sp-10);\n  max-width: 1040px; margin: 0 auto; width: 100%;\n}\n.qz-welcome__foot {\n  position: relative; z-index: 1;\n  display: flex; align-items: center; gap: var(--vq-sp-6); flex-wrap: wrap;\n  padding: var(--vq-sp-5) var(--vq-sp-8) calc(var(--vq-sp-6) + var(--vq-sab,0px));\n  border-top: 1px solid var(--vq-border-subtle);\n  font: var(--vq-type-caption); color: var(--vq-text-tertiary);\n}\n.qz-welcome__title {\n  font: var(--vq-type-display);\n  margin: var(--vq-sp-6) 0 var(--vq-sp-5);\n}\n.qz-welcome__title em { font-style: normal; color: var(--vq-accent-text); }\n.qz-welcome__lede { font: var(--vq-type-body-lg); color: var(--vq-text-secondary); max-width: 440px; margin-bottom: var(--vq-sp-8); }\n.qz-welcome__actions { display: flex; flex-direction: column; gap: var(--vq-sp-4); max-width: 340px; }\n.qz-welcome__hero { position: relative; display: grid; place-items: center; }\n.qz-welcome__hero > svg { width: min(380px, 100%); height: auto; }\n.qz-welcome__chip {\n  position: absolute;\n  display: flex; align-items: center; gap: var(--vq-sp-3);\n  padding: var(--vq-sp-3) var(--vq-sp-5);\n  background: var(--vq-surface); border: 1px solid var(--vq-border-subtle);\n  border-radius: var(--vq-r-full); box-shadow: var(--vq-shadow-raised);\n  font: var(--vq-type-label); font-size: 12.5px;\n  animation: vq-fade-up var(--vq-dur-deliberate) var(--vq-ease-enter) both;\n}\n.qz-welcome__chip:nth-of-type(2) { animation-delay: 120ms; }\n.qz-welcome__chip:nth-of-type(3) { animation-delay: 240ms; }\n.qz-welcome__mobile-hero { display: none; }\n\n@container vq-screen (max-width: 899px) {\n  .qz-welcome__body { grid-template-columns: 1fr; gap: var(--vq-sp-6); padding: var(--vq-sp-4) var(--vq-sp-6) var(--vq-sp-8); align-content: start; }\n  .qz-welcome__hero { display: none; }\n  .qz-welcome__mobile-hero { display: grid; justify-items: center; margin-top: var(--vq-sp-2); }\n  .qz-welcome__actions { max-width: none; }\n  .qz-welcome__title { margin-top: var(--vq-sp-4); text-align: center; }\n  .qz-welcome__lede { text-align: center; margin-inline: auto; }\n}\n\n/* ── Auth ────────────────────────────────────────────────── */\n.qz-auth {\n  min-height: 640px; height: 100%;\n  display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);\n  background: var(--vq-bg);\n}\n.qz-auth__side {\n  position: relative; overflow: hidden;\n  background:\n    radial-gradient(64% 48% at 24% 16%, color-mix(in srgb, var(--vq-accent) 10%, transparent), transparent 74%),\n    var(--vq-lav-100);\n  border-right: 1px solid var(--vq-border-subtle);\n  display: flex; flex-direction: column;\n  padding: var(--vq-sp-8);\n}\n:root[data-theme=\"dark\"] .qz-auth__side { background: radial-gradient(64% 48% at 24% 16%, color-mix(in srgb, var(--vq-accent) 12%, transparent), transparent 74%), var(--vq-bg-subtle); }\n.qz-auth__side-illus { flex: 1; display: grid; place-items: center; padding: var(--vq-sp-6) 0; }\n.qz-auth__side-illus > svg { width: min(320px, 88%); height: auto; }\n.qz-auth__quote { max-width: 380px; }\n.qz-auth__main {\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n  padding: var(--vq-sp-8) var(--vq-sp-6);\n}\n.qz-auth__panel { width: min(400px, 100%); animation: vq-fade-up var(--vq-dur-slow) var(--vq-ease-enter); }\n.qz-auth__panel--back { animation: vq-slide-right var(--vq-dur-slow) var(--vq-ease-enter); }\n.qz-auth__panel--fwd { animation: vq-slide-left var(--vq-dur-slow) var(--vq-ease-enter); }\n.qz-auth__illus { display: grid; justify-items: start; margin-bottom: var(--vq-sp-5); }\n.qz-auth__head { margin-bottom: var(--vq-sp-7); }\n.qz-auth__title { font: var(--vq-type-heading-xl); margin-bottom: var(--vq-sp-2); }\n.qz-auth__sub { font: var(--vq-type-body-md); color: var(--vq-text-secondary); }\n.qz-pwmeter { display: flex; gap: 4px; margin-top: var(--vq-sp-3); }\n.qz-pwmeter span { flex: 1; height: 4px; border-radius: 99px; background: var(--vq-surface-active); transition: background var(--vq-dur-normal); }\n.qz-pwmeter[data-level=\"1\"] span:nth-child(-n+1) { background: var(--vq-danger); }\n.qz-pwmeter[data-level=\"2\"] span:nth-child(-n+2) { background: var(--vq-warning); }\n.qz-pwmeter[data-level=\"3\"] span:nth-child(-n+3) { background: var(--vq-info); }\n.qz-pwmeter[data-level=\"4\"] span { background: var(--vq-success); }\n\n@container vq-screen (max-width: 899px) {\n  .qz-auth { grid-template-columns: 1fr; }\n  .qz-auth__side { display: none; }\n  .qz-auth__main { justify-content: flex-start; padding-top: var(--vq-sp-9); }\n  .qz-auth__illus { justify-items: center; }\n  .qz-auth__head { text-align: center; }\n}\n\n\n\n\n/* ── New Auth frame（Shadow root 専用・UI Studio と同じレスポンシブ文脈） ── */\n:host { color-scheme: light; }\n.vqna-mount {\n  container-type: inline-size; container-name: vq-screen;\n  min-height: 100vh;\n  font: var(--vq-type-body-md); letter-spacing: var(--vq-tracking-body);\n  color: var(--vq-text); -webkit-font-smoothing: antialiased;\n}\n.vqna-mount > .qz-splash, .vqna-mount > .qz-ob, .vqna-mount > .qz-welcome, .vqna-mount > .qz-auth { min-height: 100dvh; }\n.vqna-mount a { cursor: pointer; }\n";
  var IC = {"ArrowLeft":"<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>","ArrowRight":"<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>","Clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/>","Flame":"<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>","GraduationCap":"<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"/><path d=\"M22 10v6\"/><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/>","Lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>","LogIn":"<path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\"/><polyline points=\"10 17 15 12 10 7\"/><line x1=\"15\" x2=\"3\" y1=\"12\" y2=\"12\"/>","Mail":"<rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\"/><path d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\"/>","ShieldCheck":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>","Sparkles":"<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\"/><path d=\"M20 3v4\"/><path d=\"M22 5h-4\"/><path d=\"M4 17v2\"/><path d=\"M5 18H3\"/>","Trophy":"<path d=\"M6 9H4.5a2.5 2.5 0 0 1 0-5H6\"/><path d=\"M18 9h1.5a2.5 2.5 0 0 0 0-5H18\"/><path d=\"M4 22h16\"/><path d=\"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22\"/><path d=\"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22\"/><path d=\"M18 2H6v7a6 6 0 0 0 12 0V2Z\"/>","User":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","RotateCcw":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>","AlertCircle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>","ChevronDown":"<path d=\"m6 9 6 6 6-6\"/>","Eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","EyeOff":"<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\"/><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\"/><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\"/><path d=\"m2 2 20 20\"/>","Search":"<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>","X":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","AlertTriangle":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","CheckCircle2":"<path d=\"M21.801 10A10 10 0 1 1 17 3.335\"/><path d=\"m9 11 3 3L22 4\"/>","CloudOff":"<path d=\"m2 2 20 20\"/><path d=\"M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193\"/><path d=\"M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07\"/>","Info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>","Loader2":"<path d=\"M21 12a9 9 0 1 1-6.219-8.56\"/>","XCircle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","Check":"<path d=\"M20 6 9 17l-5-5\"/>","Minus":"<path d=\"M5 12h14\"/>"};
  var ILL = {"hello":"<path d=\"M100 6c42 0 86 22 86 64s-30 84-86 84S14 116 14 70 58 6 100 6Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M100 52c-14-9-34-12-52-8v58c18-4 38-1 52 8 14-9 34-12 52-8V44c-18-4-38-1-52 8Z\" fill=\"var(--vq-il-paper)\"/><path d=\"M100 52v58\" stroke=\"var(--vq-il-line)\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"58\" y=\"58\" width=\"30\" height=\"4.5\" rx=\"2.25\" fill=\"var(--vq-il-line)\"/><rect x=\"58\" y=\"69\" width=\"24\" height=\"4.5\" rx=\"2.25\" fill=\"var(--vq-il-line)\"/><rect x=\"58\" y=\"80\" width=\"28\" height=\"4.5\" rx=\"2.25\" fill=\"var(--vq-il-a)\"/><rect x=\"112\" y=\"58\" width=\"30\" height=\"4.5\" rx=\"2.25\" fill=\"var(--vq-il-line)\"/><rect x=\"112\" y=\"69\" width=\"22\" height=\"4.5\" rx=\"2.25\" fill=\"var(--vq-il-line)\"/><circle cx=\"123\" cy=\"86\" r=\"8\" fill=\"var(--vq-il-b)\"/><path d=\"m119.5 86 2.6 2.6 4.8-5\" stroke=\"var(--vq-il-paper)\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/><path d=\"M152 30 Q154.2 37.8 162 40 Q154.2 42.2 152 50 Q149.8 42.2 142 40 Q149.8 37.8 152 30Z\" fill=\"var(--vq-il-c)\"/><path d=\"M44 27 Q45.54 32.46 51 34 Q45.54 35.54 44 41 Q42.46 35.54 37 34 Q42.46 32.46 44 27Z\" fill=\"var(--vq-il-d)\"/><circle cx=\"166\" cy=\"72\" r=\"4\" fill=\"var(--vq-il-e)\"/>","create":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"44\" y=\"30\" width=\"62\" height=\"80\" rx=\"10\" fill=\"var(--vq-il-paper)\"/><rect x=\"54\" y=\"42\" width=\"42\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><rect x=\"54\" y=\"54\" width=\"34\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><rect x=\"54\" y=\"66\" width=\"40\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><rect x=\"54\" y=\"78\" width=\"26\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><rect x=\"102\" y=\"62\" width=\"58\" height=\"40\" rx=\"10\" fill=\"var(--vq-il-b)\"/><rect x=\"110\" y=\"72\" width=\"30\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.85\"/><circle cx=\"112.5\" cy=\"88\" r=\"4.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.9\"/><circle cx=\"127\" cy=\"88\" r=\"4.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.45\"/><circle cx=\"141.5\" cy=\"88\" r=\"4.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.45\"/><rect x=\"112\" y=\"98\" width=\"58\" height=\"40\" rx=\"10\" fill=\"var(--vq-il-c)\"/><rect x=\"120\" y=\"108\" width=\"32\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.9\"/><rect x=\"120\" y=\"119\" width=\"24\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-paper)\" opacity=\"0.6\"/><path d=\"M100 35 Q101.98 42.02 109 44 Q101.98 45.98 100 53 Q98.02 45.98 91 44 Q98.02 42.02 100 35Z\" fill=\"var(--vq-il-d)\"/><path d=\"M158 33 Q159.54 38.46 165 40 Q159.54 41.54 158 47 Q156.46 41.54 151 40 Q156.46 38.46 158 33Z\" fill=\"var(--vq-il-a)\"/>","analyze":"<path d=\"M96 8c46-2 92 24 90 66s-38 80-90 78S8 114 10 68 50 10 96 8Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"46\" y=\"82\" width=\"18\" height=\"42\" rx=\"7\" fill=\"var(--vq-il-e)\"/><rect x=\"72\" y=\"64\" width=\"18\" height=\"60\" rx=\"7\" fill=\"var(--vq-il-a)\"/><rect x=\"98\" y=\"46\" width=\"18\" height=\"78\" rx=\"7\" fill=\"var(--vq-il-b)\"/><circle cx=\"134\" cy=\"62\" r=\"24\" fill=\"var(--vq-il-paper)\" opacity=\"0.92\"/><circle cx=\"134\" cy=\"62\" r=\"24\" fill=\"none\" stroke=\"var(--vq-il-c)\" stroke-width=\"7\"/><rect x=\"150\" y=\"80\" width=\"26\" height=\"9\" rx=\"4.5\" transform=\"rotate(45 150 80)\" fill=\"var(--vq-il-c)\"/><path d=\"M126 62l5.5 5.5L145 54\" stroke=\"var(--vq-il-b)\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/><circle cx=\"42\" cy=\"48\" r=\"4\" fill=\"var(--vq-il-d)\"/><path d=\"M168 109 Q169.54 114.46 175 116 Q169.54 117.54 168 123 Q166.46 117.54 161 116 Q166.46 114.46 168 109Z\" fill=\"var(--vq-il-d)\"/>","coach":"<path d=\"M100 6c42 0 86 22 86 64s-30 84-86 84S14 116 14 70 58 6 100 6Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M46 46h108a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H92l-18 18v-18H46a12 12 0 0 1-12-12V58a12 12 0 0 1 12-12Z\" fill=\"var(--vq-il-paper)\"/><path d=\"M74 82c0-12 10-20 26-20s26 8 26 20-10 20-26 20a32 32 0 0 1-8-1l-10 5 2-9c-6-3-10-8-10-15Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M100 72 Q101.98 79.02 109 81 Q101.98 82.98 100 90 Q98.02 82.98 91 81 Q98.02 79.02 100 72Z\" fill=\"var(--vq-il-b)\"/><path d=\"M140 56 Q141.32 60.68 146 62 Q141.32 63.32 140 68 Q138.68 63.32 134 62 Q138.68 60.68 140 56Z\" fill=\"var(--vq-il-c)\"/><circle cx=\"62\" cy=\"64\" r=\"4\" fill=\"var(--vq-il-e)\"/><circle cx=\"150\" cy=\"122\" r=\"4\" fill=\"var(--vq-il-d)\"/>","login":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"42\" y=\"96\" width=\"116\" height=\"12\" rx=\"6\" fill=\"var(--vq-il-a)\"/><rect x=\"52\" y=\"60\" width=\"64\" height=\"38\" rx=\"6\" fill=\"var(--vq-il-b)\"/><rect x=\"58\" y=\"54\" width=\"64\" height=\"38\" rx=\"6\" fill=\"var(--vq-il-e)\"/><rect x=\"64\" y=\"48\" width=\"64\" height=\"38\" rx=\"6\" fill=\"var(--vq-il-paper)\"/><rect x=\"72\" y=\"58\" width=\"36\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><rect x=\"72\" y=\"69\" width=\"28\" height=\"5\" rx=\"2.5\" fill=\"var(--vq-il-line)\"/><path d=\"M138 74h18a8 8 0 0 1 0 16h-2\" fill=\"none\" stroke=\"var(--vq-il-c)\" stroke-width=\"6\"/><rect x=\"128\" y=\"66\" width=\"26\" height=\"32\" rx=\"7\" fill=\"var(--vq-il-c)\"/><path d=\"M136 52c0-4 4-4 4-8m8 8c0-4 4-4 4-8\" stroke=\"var(--vq-il-line)\" stroke-width=\"3\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M50 30 Q51.76 36.24 58 38 Q51.76 39.76 50 46 Q48.24 39.76 42 38 Q48.24 36.24 50 30Z\" fill=\"var(--vq-il-d)\"/>","signup":"<path d=\"M96 8c46-2 92 24 90 66s-38 80-90 78S8 114 10 68 50 10 96 8Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"38\" y=\"48\" width=\"104\" height=\"66\" rx=\"12\" fill=\"var(--vq-il-paper)\"/><circle cx=\"66\" cy=\"74\" r=\"13\" fill=\"var(--vq-il-a)\"/><path d=\"M52 100c2-10 7-15 14-15s12 5 14 15\" fill=\"var(--vq-il-a)\"/><rect x=\"90\" y=\"62\" width=\"40\" height=\"5.5\" rx=\"2.75\" fill=\"var(--vq-il-line)\"/><rect x=\"90\" y=\"74\" width=\"32\" height=\"5.5\" rx=\"2.75\" fill=\"var(--vq-il-line)\"/><rect x=\"90\" y=\"86\" width=\"36\" height=\"5.5\" rx=\"2.75\" fill=\"var(--vq-il-b)\"/><rect x=\"132\" y=\"70\" width=\"14\" height=\"52\" rx=\"7\" transform=\"rotate(38 132 70)\" fill=\"var(--vq-il-c)\"/><path d=\"m118 120 12 8-14 3Z\" fill=\"var(--vq-il-c)\"/><path d=\"M156 36 Q157.76 42.24 164 44 Q157.76 45.76 156 52 Q154.24 45.76 148 44 Q154.24 42.24 156 36Z\" fill=\"var(--vq-il-d)\"/><circle cx=\"40\" cy=\"34\" r=\"4\" fill=\"var(--vq-il-e)\"/>","reset":"<path d=\"M100 6c42 0 86 22 86 64s-30 84-86 84S14 116 14 70 58 6 100 6Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"56\" y=\"66\" width=\"64\" height=\"54\" rx=\"12\" fill=\"var(--vq-il-b)\"/><path d=\"M70 66V54a18 18 0 0 1 36 0v12\" fill=\"none\" stroke=\"var(--vq-il-a)\" stroke-width=\"9\" stroke-linecap=\"round\"/><circle cx=\"88\" cy=\"88\" r=\"7\" fill=\"var(--vq-il-paper)\"/><rect x=\"85\" y=\"90\" width=\"6\" height=\"14\" rx=\"3\" fill=\"var(--vq-il-paper)\"/><circle cx=\"140\" cy=\"96\" r=\"13\" fill=\"none\" stroke=\"var(--vq-il-c)\" stroke-width=\"8\"/><rect x=\"148\" y=\"100\" width=\"26\" height=\"8\" rx=\"4\" transform=\"rotate(28 148 100)\" fill=\"var(--vq-il-c)\"/><rect x=\"164\" y=\"112\" width=\"9\" height=\"8\" rx=\"3\" transform=\"rotate(28 164 112)\" fill=\"var(--vq-il-c)\"/><path d=\"M52 33 Q53.54 38.46 59 40 Q53.54 41.54 52 47 Q50.46 41.54 45 40 Q50.46 38.46 52 33Z\" fill=\"var(--vq-il-d)\"/><circle cx=\"158\" cy=\"52\" r=\"4\" fill=\"var(--vq-il-e)\"/>","done":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><circle cx=\"100\" cy=\"80\" r=\"40\" fill=\"var(--vq-il-b)\"/><path d=\"m82 80 12 12 24-26\" stroke=\"var(--vq-il-paper)\" stroke-width=\"8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"/><circle cx=\"48\" cy=\"50\" r=\"5\" fill=\"var(--vq-il-c)\"/><circle cx=\"152\" cy=\"44\" r=\"4\" fill=\"var(--vq-il-d)\"/><circle cx=\"160\" cy=\"104\" r=\"5\" fill=\"var(--vq-il-e)\"/><circle cx=\"42\" cy=\"108\" r=\"4\" fill=\"var(--vq-il-a)\"/><path d=\"M140 22 Q141.76 28.24 148 30 Q141.76 31.76 140 38 Q138.24 31.76 132 30 Q138.24 28.24 140 22Z\" fill=\"var(--vq-il-c)\"/><path d=\"M58 123 Q59.54 128.46 65 130 Q59.54 131.54 58 137 Q56.46 131.54 51 130 Q56.46 128.46 58 123Z\" fill=\"var(--vq-il-d)\"/>","otp":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M100 30c14 10 30 14 44 14v34c0 26-18 44-44 54-26-10-44-28-44-54V44c14 0 30-4 44-14Z\" fill=\"var(--vq-il-b)\"/><path d=\"M100 42c10 7 21 10 32 10v26c0 20-13 34-32 42-19-8-32-22-32-42V52c11 0 22-3 32-10Z\" fill=\"var(--vq-il-paper)\"/><circle cx=\"82\" cy=\"82\" r=\"5.5\" fill=\"var(--vq-il-ink)\"/><circle cx=\"100\" cy=\"82\" r=\"5.5\" fill=\"var(--vq-il-ink)\"/><circle cx=\"118\" cy=\"82\" r=\"5.5\" fill=\"var(--vq-il-c)\"/><rect x=\"76\" y=\"98\" width=\"48\" height=\"6\" rx=\"3\" fill=\"var(--vq-il-line)\"/><path d=\"M152 36 Q153.76 42.24 160 44 Q153.76 45.76 152 52 Q150.24 45.76 144 44 Q150.24 42.24 152 36Z\" fill=\"var(--vq-il-c)\"/><circle cx=\"46\" cy=\"116\" r=\"4\" fill=\"var(--vq-il-d)\"/>","locked":"<path d=\"M96 8c46-2 92 24 90 66s-38 80-90 78S8 114 10 68 50 10 96 8Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"48\" y=\"70\" width=\"60\" height=\"50\" rx=\"11\" fill=\"var(--vq-il-b)\"/><path d=\"M61 70V59a17 17 0 0 1 34 0v11\" fill=\"none\" stroke=\"var(--vq-il-a)\" stroke-width=\"8.5\" stroke-linecap=\"round\"/><circle cx=\"78\" cy=\"91\" r=\"6\" fill=\"var(--vq-il-paper)\"/><rect x=\"75.2\" y=\"93\" width=\"5.6\" height=\"12\" rx=\"2.8\" fill=\"var(--vq-il-paper)\"/><circle cx=\"136\" cy=\"94\" r=\"26\" fill=\"var(--vq-il-paper)\"/><circle cx=\"136\" cy=\"94\" r=\"26\" fill=\"none\" stroke=\"var(--vq-il-c)\" stroke-width=\"6\"/><path d=\"M136 80v14l10 7\" stroke=\"var(--vq-il-ink)\" stroke-width=\"4.5\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"52\" cy=\"44\" r=\"4\" fill=\"var(--vq-il-d)\"/>","expired":"<path d=\"M100 6c42 0 86 22 86 64s-30 84-86 84S14 116 14 70 58 6 100 6Z\" fill=\"var(--vq-il-blob)\"/><rect x=\"68\" y=\"34\" width=\"64\" height=\"10\" rx=\"5\" fill=\"var(--vq-il-a)\"/><rect x=\"68\" y=\"118\" width=\"64\" height=\"10\" rx=\"5\" fill=\"var(--vq-il-a)\"/><path d=\"M78 44h44c0 18-10 26-16 32 6 6 16 14 16 32H78c0-18 10-26 16-32-6-6-16-14-16-32Z\" fill=\"var(--vq-il-paper)\"/><path d=\"M88 52h24c-2 9-8 13-12 17-4-4-10-8-12-17Z\" fill=\"var(--vq-il-c)\"/><path d=\"M100 96c4 6 12 9 14 22H86c2-13 10-16 14-22Z\" fill=\"var(--vq-il-c)\"/><path d=\"M148 48 Q149.76 54.24 156 56 Q149.76 57.76 148 64 Q146.24 57.76 140 56 Q146.24 54.24 148 48Z\" fill=\"var(--vq-il-d)\"/><circle cx=\"52\" cy=\"98\" r=\"4\" fill=\"var(--vq-il-e)\"/>","maintenance":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M88 44c2-6 10-6 12 0l18 62H70Z\" fill=\"var(--vq-il-c)\"/><path d=\"M80 78h28l4 14H76Z\" fill=\"var(--vq-il-paper)\"/><rect x=\"56\" y=\"106\" width=\"76\" height=\"12\" rx=\"6\" fill=\"var(--vq-il-a)\"/><path d=\"M138 64a16 16 0 0 1 20-16l-9 9 8 8 9-9a16 16 0 0 1-16 20 16 16 0 0 1-4-1l-14 14a6 6 0 0 1-9-9l14-14a16 16 0 0 1 1-2Z\" fill=\"var(--vq-il-b)\"/><circle cx=\"48\" cy=\"52\" r=\"4\" fill=\"var(--vq-il-d)\"/><path d=\"M166 103 Q167.54 108.46 173 110 Q167.54 111.54 166 117 Q164.46 111.54 159 110 Q164.46 108.46 166 103Z\" fill=\"var(--vq-il-d)\"/>","error":"<path d=\"M104 10c40-6 82 26 80 66s-42 78-88 74S12 110 18 66 64 16 104 10Z\" fill=\"var(--vq-il-blob)\"/><path d=\"M40 76h32\" stroke=\"var(--vq-il-a)\" stroke-width=\"9\" stroke-linecap=\"round\"/><rect x=\"66\" y=\"60\" width=\"28\" height=\"32\" rx=\"9\" fill=\"var(--vq-il-b)\"/><path d=\"M94 68h10M94 84h10\" stroke=\"var(--vq-il-b)\" stroke-width=\"7\" stroke-linecap=\"round\"/><rect x=\"118\" y=\"60\" width=\"26\" height=\"32\" rx=\"9\" fill=\"var(--vq-il-c)\"/><path d=\"M112 68h8M112 84h8\" stroke=\"var(--vq-il-c)\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M144 76h24\" stroke=\"var(--vq-il-a)\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M108 37 Q109.54 42.46 115 44 Q109.54 45.54 108 51 Q106.46 45.54 101 44 Q106.46 42.46 108 37Z\" fill=\"var(--vq-il-d)\"/><path d=\"M104 106 Q105.32 110.68 110 112 Q105.32 113.32 104 118 Q102.68 113.32 98 112 Q102.68 110.68 104 106Z\" fill=\"var(--vq-il-e)\"/>"};
  var LEGAL = {"terms":[["title","利用規約"],["h","第1条（サービスの概要）"],["p","VocabuQuiz（以下「本サービス」）は、語彙学習、クイズ、デジタルAI模試、AI学習支援、学習データの同期およびバックアップ等を提供するWebアプリケーションです。"],["p","利用者は、本規約の内容に同意した上で、本サービスを利用するものとします。"],["h","第2条（アカウントと認証）"],["li","1. 本サービスの一部機能を利用するには、アカウント登録が必要です。ゲストとして利用できる機能もありますが、ゲスト利用時のデータについては、サーバーへの保存、端末間同期およびバックアップは保証されません。"],["li","2. 利用者は、ログインIDおよびパスワードを自らの責任で安全に管理するものとします。"],["li","3. ログイン情報を第三者と共有する行為、第三者に使用させる行為、または推測されやすいパスワードを使用する行為は禁止します。"],["li","4. ログイン情報を使用して行われた操作は、運営が不正利用であると合理的に判断できる場合を除き、当該アカウントの利用者による操作として取り扱う場合があります。"],["li","5. 不正利用、規約違反、セキュリティ上の問題その他運営が必要と判断した事由が確認された場合、事前の通知なく、アカウントまたは一部機能の利用を制限もしくは停止する場合があります。"],["li","6. 新規登録時には、本人確認およびアカウント保護のため、Gmail アドレスを取得し、6桁のメール確認コードを送信します。確認コードによるメールアドレスの確認が完了した後に、アカウントを作成します。"],["li","7. 利用者は、ログイン情報および登録したメールアドレスを、自らの責任で安全に管理するものとします。登録したメールアドレスは、将来のパスワード再設定や重要なセキュリティ通知に利用される場合があります。"],["h","第3条（データの保存と同期）"],["li","1. ログインして本サービスを利用する場合、学習履歴、クイズの進捗、プリセット、作成したコンテンツ、保存済みデータ、お気に入り、設定、チャット履歴、Mockの利用履歴その他本サービスの提供に必要なデータは、アカウントに紐づくサーバー側データベースに保存される場合があります。"],["li","2. サーバーに保存されたデータは、同一アカウントでログインした複数の端末間で同期される場合があります。"],["li","3. 通信状況、端末の状態、システム障害、同期処理の競合その他の事情により、データの同期が遅延し、失敗し、または一部の内容が正しく反映されない場合があります。"],["li","4. ゲスト利用時のデータは、原則として利用者の端末のブラウザ内にあるlocalStorage等へ保存されます。端末の変更、ブラウザデータの削除、プライベートブラウズの終了、ブラウザの初期化その他の操作によって、データが失われる場合があります。"],["li","5. 運営は、サービス品質の向上、利用状況の把握および機能改善のため、個人を直接識別しない形に加工した利用統計を収集し、利用する場合があります。"],["h","第4条（バックアップとデータの復元）"],["li","1. 本サービスは、ログインしている利用者を対象に、学習データ、プリセット、設定、チャット履歴、作成したコンテンツその他対応するデータのバックアップ機能を提供する場合があります。"],["li","2. バックアップは、自動または利用者の操作によって作成されます。対象となるデータ、作成頻度、保存期間、保存件数および利用可能な復元方法は、本サービス内に表示される内容に従います。"],["li","3. 利用者は、利用可能なバックアップから、アカウント全体または対応する一部のデータを復元できる場合があります。"],["li","4. データを復元した場合、現在保存されているデータの全部または一部が、復元対象となる過去のデータによって上書きされる場合があります。利用者は、復元前に表示される内容を確認した上で復元を実行するものとします。"],["li","5. バックアップは、データの完全な保存または復元を保証するものではありません。通信障害、システム障害、データ破損、保存期間の経過、利用者による削除、仕様変更その他の事情により、バックアップの作成または復元ができない場合があります。"],["li","6. ゲスト利用時のデータは、本サービス上で明示されている場合を除き、バックアップの対象にはなりません。"],["li","7. 運営は、サービスの安定運用、セキュリティ確保または保存容量の管理のため、保存期間を経過したバックアップまたは不要となったバックアップを削除する場合があります。"],["h","第5条（AI機能の利用）"],["li","1. 本サービスは、AIを活用したQuick Chat、Sede、問題生成、解説生成、学習分析その他の学習支援機能を提供します。"],["li","2. AIが生成する回答、問題、解説、要約、分析、コードその他の出力には、誤り、不正確な情報、不完全な情報または利用者の意図と異なる内容が含まれる場合があります。"],["li","3. AIの出力は参考情報として提供されるものであり、その正確性、完全性、最新性、有用性または特定の目的への適合性を保証するものではありません。"],["li","4. Quick Chatは、すべてのプランにおいて、通常利用の範囲内で回数および利用量の上限なく利用できます。"],["li","5. 前項にかかわらず、不正利用、過剰な自動リクエスト、サーバーへの過度な負荷、セキュリティ上の問題、システム保護、メンテナンス、障害対応または法令上の必要がある場合、Quick Chatの利用を一時的に制限または停止する場合があります。"],["li","6. Sedeについては、利用者が契約しているプランに応じて、利用回数、処理時間、利用可能なモデル、同時実行数その他の制限が設けられる場合があります。"],["li","7. AI機能に入力された文章、画像、ファイル、コードその他の情報は、回答の生成、問題の作成、分析または機能提供のため、外部のAIサービスへ送信される場合があります。"],["li","8. 利用者は、AI機能へ氏名、住所、電話番号、メールアドレス、パスワード、認証情報、学校または勤務先の機密情報その他第三者へ開示すべきでない情報を入力しないものとします。"],["h","第6条（Mock・デジタルAI模試）"],["li","1. Mockは、AIを活用して問題の生成、模擬試験の構成、採点、解説および学習分析等を行う実験的なデジタルAI模試機能です。"],["li","2. Mockはβ版として提供される機能であり、通常のクイズ機能と比較して高い不確実性を伴います。"],["li","3. Mockによって生成される問題、選択肢、模範解答、採点結果、配点、解説、難易度、出題範囲および分析結果には、誤り、不整合、不足、重複または不適切な内容が含まれる場合があります。"],["li","4. Mockは、学校、教育機関、検定運営団体その他の機関が実施する正式な試験、模擬試験または成績評価ではありません。"],["li","5. Mockの結果は、実際の定期考査、模擬試験、検定試験、入学試験、成績または合否を保証または予測するものではありません。"],["li","6. 利用者は、Mockを補助的な学習手段として利用し、重要な学習内容、解答および進路上の判断については、教科書、授業資料、学校、教員その他の信頼できる情報源を併せて確認するものとします。"],["li","7. β版の提供期間中、運営は、事前の通知なくMockの仕様、生成方法、採点方法、画面構成、利用条件または提供範囲を変更し、一時停止し、または提供を終了する場合があります。"],["h","第7条（禁止事項）"],["p","利用者は、以下の行為を行ってはなりません。"],["li","1. 本サービスの不正利用、サーバーへの攻撃、脆弱性の悪用または過度な負荷を与える行為"],["li","2. Bot、スクリプト、自動化ツールその他の手段を使用して、通常利用の範囲を超える大量のリクエストを送信する行為"],["li","3. 他の利用者への嫌がらせ、脅迫、誹謗中傷、なりすましまたは個人情報の不正取得"],["li","4. 他人のアカウントを使用し、またはログイン情報を第三者へ提供する行為"],["li","5. 法令または公序良俗に反する行為"],["li","6. 本サービスを利用して、違法、有害、差別的、暴力的または権利を侵害するコンテンツを作成または公開する行為"],["li","7. 本サービスまたはAI機能の安全対策、利用制限またはアクセス制御を回避しようとする行為"],["li","8. 本サービスのリバースエンジニアリング、ソースコードの不正取得、無断複製または再配布"],["li","9. 運営の事前許可なく、本サービスまたはその一部を商用目的で再販売、転載または提供する行為"],["li","10. その他、運営が本サービスの安全または正常な提供を妨げると合理的に判断する行為"],["h","第8条（知的財産権）"],["li","1. 本サービスのデザイン、ロゴ、プログラム、コード、文章、画像、UI、システム、データベースその他のコンテンツに関する知的財産権は、運営者または正当な権利を有する第三者に帰属します。"],["li","2. 利用者が本サービスを通じて作成したクイズ、プリセット、投稿その他のコンテンツに関する権利は、原則として当該利用者に帰属します。"],["li","3. 利用者は、サービスの提供、保存、同期、バックアップ、表示、共有、審査、モデレーションおよび機能改善に必要な範囲で、運営が利用者のコンテンツを取り扱うことを許諾するものとします。"],["h","第9条（サービスの変更・停止）"],["li","1. 運営は、品質向上、機能追加、メンテナンス、障害対応、セキュリティ対応、法令対応その他の必要がある場合、本サービスの全部または一部を変更し、一時停止し、または提供を終了する場合があります。"],["li","2. 緊急の場合を除き、利用者への影響が大きい変更または長時間の停止については、可能な範囲で事前に通知するよう努めます。"],["li","3. 本サービスを終了する場合、運営は可能な限り事前に告知し、利用可能な範囲でデータを書き出す手段を提供するよう努めます。"],["h","第10条（免責事項）"],["li","1. 本サービスは、現状有姿（as-is）で提供されます。運営は、本サービスの完全性、正確性、安全性、継続性、可用性または特定の目的への適合性を保証しません。"],["li","2. AI機能およびMockの出力内容に基づいて利用者が行った判断、学習、提出、受験、進路選択その他の行動については、利用者自身が最終的な確認と判断を行うものとします。"],["li","3. 同期またはバックアップ機能を提供している場合であっても、すべてのデータが常に保存され、同期され、または復元できることを保証するものではありません。"],["li","4. 利用者の端末操作、パスワード管理、ブラウザデータの削除、アカウントの共有、誤操作その他利用者側の事情によって発生したデータ消失または損害について、運営は責任を負わない場合があります。"],["li","5. 本サービスの利用によって生じた損害について、運営は、運営に故意または重大な過失がある場合を除き、適用される法令の範囲内で責任を負うものとします。"],["h","第11条（プランと料金）"],["li","1. 本サービスは、無料プランおよび有料プランを提供する場合があります。"],["li","2. 各プランの機能、保存容量、Sedeの利用制限その他の条件は、本サービス内のプラン説明または購入画面に表示される内容に従います。"],["li","3. Quick Chatは、無料プランおよび有料プランを含むすべてのプランにおいて、通常利用の範囲内で完全無制限に利用できます。"],["li","4. 有料プランの料金、支払方法、更新、変更、解約および返金に関する条件は、購入画面または別途表示される条件に従います。"],["li","5. プラン内容または料金を変更する場合、運営はサービス内その他適切な方法で通知します。"],["h","第12条（規約の変更）"],["li","1. 運営は、法令の変更、サービス内容の変更、新機能の追加、セキュリティ上の必要その他合理的な理由がある場合、本規約を変更することができます。"],["li","2. 重要な変更がある場合、運営はサービス内の通知その他適切な方法で利用者へ通知します。"],["li","3. 変更後の規約の適用開始後も利用者が本サービスを利用した場合、利用者は変更後の規約に同意したものとみなされます。ただし、法令上、利用者の個別の同意が必要となる場合を除きます。"],["h","第13条（準拠法と管轄）"],["li","1. 本規約は、日本法に準拠し、日本法に基づいて解釈されます。"],["li","2. 本サービスに関して運営者と利用者との間に紛争が生じた場合、当事者間で誠実に協議するものとします。"],["li","3. 協議によって解決しない場合、運営者の所在地を管轄する裁判所を、第一審の専属的合意管轄裁判所とします。"],["date","初回改定：2026年4月15日"],["date","最終更新：2026年8月10日"]],"privacy":[["title","プライバシーポリシー"],["p","VocabuQuiz（以下「本サービス」）は、利用者の情報を適切に取り扱うため、以下のとおりプライバシーポリシーを定めます。"],["h","1. 取得する情報"],["p","本サービスは、サービスの提供に必要な範囲で、以下の情報を取得または保存します。"],["li","1. 登録時の Gmail アドレス、認証済みメールアドレス、アカウントを識別するための学年区分、ログインID、およびハッシュ化されたパスワード"],["li","2. 学習履歴、クイズの解答履歴、スコア、進捗、間違えた問題および学習分析データ"],["li","3. プリセット、作成したクイズ、保存済みデータ、お気に入りおよび各種設定"],["li","4. Quick Chat、Sedeその他のAI機能におけるチャット履歴、入力内容、生成結果および添付されたデータ"],["li","5. Mockに入力または使用された教材、設定、問題、回答、採点結果、解説および分析結果"],["li","6. 同期およびバックアップの対象となるデータ、バックアップの作成日時、復元履歴、データのバージョンその他バックアップ機能の提供に必要な情報"],["li","7. 利用規約およびプライバシーポリシーへの同意記録（同意日時・バージョン）"],["li","8. サービス品質の改善に必要な、利用状況、エラー情報および個人を直接識別しない形に加工された統計情報"],["p","本サービスは、新規登録時に、本人確認およびアカウント保護のため Gmail アドレスを取得します。氏名・電話番号・住所等の連絡先情報は取得しません。"],["p","取得した Gmail アドレスは、メールアドレスの確認、アカウント登録、アカウント保護、将来のパスワード再設定、重要なセキュリティ通知および本人確認が必要な手続に利用します。"],["p","確認メールの配信のため、必要な範囲で、メールアドレスを外部のメール配信サービス（Resend）へ送信する場合があります。"],["p","ただし、利用者がAI機能、投稿、クイズ、問い合わせその他の入力欄へ自ら氏名・電話番号等を入力した場合、入力内容の一部として保存または処理される場合があります。"],["h","2. 情報の利用目的"],["p","取得した情報は、以下の目的で利用します。"],["li","1. アカウントの作成、識別およびログイン認証"],["li","2. 学習データ、クイズ、プリセット、設定およびチャット履歴の保存"],["li","3. 同一アカウントを使用する複数端末間でのデータ同期"],["li","4. バックアップの作成、保存、管理およびデータの復元"],["li","5. Quick Chat、Sede、Mock、問題生成、採点、解説生成その他のAI機能の提供"],["li","6. 利用者の操作に応じた学習分析、進捗表示および機能の提供"],["li","7. エラーの調査、サービスの保守、品質改善および匿名化された統計分析"],["p","取得した情報を、上記の目的に必要な範囲を超えて利用しません。"],["h","3. データの保存場所"],["p","1. ログイン時"],["p","ログインしている利用者の学習履歴、クイズデータ、プリセット、設定、チャット履歴、Mockの利用データその他対応するデータは、アカウントに紐づくサーバー側データベースに保存されます。"],["p","保存されたデータは、同一アカウントでログインした複数端末間で同期される場合があります。"],["p","2. バックアップ"],["p","対応するデータは、復元、障害対応およびサービス継続のため、通常利用されるデータとは別のバックアップまたは過去のバージョンとして、サーバー側に保存される場合があります。"],["p","バックアップの対象、作成頻度、保存期間および保存件数は、本サービス内に表示される内容または運営上の設定に従います。"],["p","3. ゲスト利用時"],["p","ゲスト利用時のデータは、原則として利用者の端末のブラウザ内にあるlocalStorage等にのみ保存されます。"],["p","ゲスト利用時のデータは、端末変更、ブラウザデータ削除、ブラウザの初期化またはプライベートブラウズの終了等によって失われる場合があります。"],["p","ゲスト利用時のデータは、本サービス上で明示されている場合を除き、サーバー同期およびバックアップの対象になりません。"],["h","4. バックアップデータの取り扱い"],["li","1. バックアップデータは、データの復元、障害からの回復、サービスの安定提供その他バックアップ機能の提供に必要な目的で利用します。"],["li","2. 利用者がバックアップからデータを復元した場合、選択されたバックアップデータが現在のデータへ反映される場合があります。"],["li","3. 保存期間を経過したバックアップ、利用者が削除したバックアップまたは運営上不要となったバックアップは、順次削除されます。"],["li","4. アカウントを削除した場合、通常利用されるサーバー上のデータは削除されます。ただし、システム上のバックアップに一時的にデータが残存する場合があります。"],["li","5. バックアップに残存したデータは、通常のサービス提供には使用されず、運営上必要な保管期間の経過後、順次削除または利用できない状態にします。"],["h","5. AI機能と外部サービスへの送信"],["li","1. Quick Chat、Sede、Mock、問題生成、採点、解説生成その他のAI機能へ入力された文章、画像、ファイル、コード、教材その他の情報は、回答または生成結果を作成するため、外部のAIサービスへ送信される場合があります。"],["li","2. 外部AIサービスへ送信される情報は、AI機能の提供に必要な範囲に限定するよう努めます。"],["li","3. 外部AIサービスにおける情報の処理は、当該サービスの利用条件、プライバシーポリシーおよびデータ処理方針に従う場合があります。"],["li","4. 利用者は、AI機能に氏名、住所、電話番号、メールアドレス、パスワード、認証情報、学校や勤務先の機密情報その他第三者へ開示すべきでない情報を入力しないようにしてください。"],["li","5. Quick Chatはすべてのプランで無制限に利用できますが、データの取り扱いについては、利用回数にかかわらず本プライバシーポリシーが適用されます。"],["li","6. Mockは実験的なβ版であり、利用者が入力した教材、回答および設定が、問題生成、採点、解説または分析のために処理される場合があります。"],["h","6. 第三者への提供"],["li","1. 法令に基づく要請がある場合を除き、利用者の同意なく、利用者を識別できる情報を第三者へ提供しません。"],["li","2. AI機能、クラウド保存、データベース、バックアップ、障害解析その他本サービスの提供に必要な外部サービスへ情報を送信または処理を委託する場合があります。"],["li","3. 前項の場合、運営は、サービス提供に必要な範囲で情報を取り扱います。"],["li","4. 個人を直接識別できない形に統計化または匿名化された情報は、サービス品質の改善、利用傾向の分析その他の目的で利用する場合があります。"],["h","7. セキュリティ"],["li","1. 運営は、利用者の情報を保護するため、アクセス制御、パスワードのハッシュ化、通信の保護その他合理的な安全管理措置を講じます。"],["li","2. 不要となったデータについては、運営上および法令上必要な期間を考慮した上で、削除または利用できない状態にするよう努めます。"],["li","3. インターネット通信およびオンラインサービスの性質上、情報の漏えい、消失、不正アクセスその他の危険を完全に排除することはできず、絶対的な安全性を保証するものではありません。"],["li","4. 利用者は、端末ロック、OSおよびブラウザの更新、パスワード管理、共有端末からのログアウトその他の基本的な安全対策を実施してください。"],["li","5. ログインID、パスワード、共有コード、ログイン状態または認証情報を第三者と共有しないでください。"],["h","8. アカウントおよびデータの削除"],["li","1. 利用者は、設定画面に用意された手続からアカウントを削除できます。"],["li","2. アカウントを削除した場合、当該アカウントに紐づく、通常利用されるサーバー上のデータは削除されます。"],["li","3. バックアップまたは障害復旧用データに一時的に情報が残存する場合がありますが、通常のサービス提供には使用されず、運営上必要な保管期間の経過後、順次削除または利用できない状態にします。"],["li","4. ゲスト利用時に端末内へ保存されたデータは、アカウント削除の対象には含まれません。利用者自身がブラウザの設定からlocalStorage、Cookieその他のサイトデータを削除する必要があります。"],["li","5. 削除処理の完了後は、削除されたデータを復元できない場合があります。"],["h","9. プライバシーポリシーの変更"],["li","1. 運営は、法令の変更、サービス内容の変更、新機能の追加または情報の取り扱い方法の変更に応じて、本プライバシーポリシーを改定する場合があります。"],["li","2. 利用者への影響が大きい変更を行う場合、サービス内の通知その他適切な方法で告知します。"],["li","3. 改定後のプライバシーポリシーは、本サービス内に掲載された時点または別途定めた適用開始日から適用されます。"],["date","初回改定：2026年4月15日"],["date","最終更新：2026年8月10日"]]};
  /* 規約と方針の本文はここが持ち主。新しい書類の画面（vq-docs）も同じものを読む。 */
  window.__vqLegal = LEGAL;

  /* ── utils ── */
  function bloomOn() { return document.documentElement.getAttribute("data-vq-ui") === "bloom"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function icon(name, size, cls, sw) {
    var inner = IC[name] || "";
    size = size || 16;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : "") + ' aria-hidden="true">' + inner + "</svg>";
  }
  function illus(name, size) {
    var inner = ILL[name] || ILL.hello;
    size = size || 168;
    return '<svg viewBox="0 0 200 160" width="' + size + '" height="' + (size * 160 / 200) + '" aria-hidden="true" focusable="false">' + inner + "</svg>";
  }

  /* ── component builders (UI Studio の実DOMを再現) ── */
  function btn(o) {
    var cls = ["vq-btn", "vq-btn--" + (o.variant || "primary")];
    if (o.size) cls.push("vq-btn--" + o.size);
    if (o.full) cls.push("vq-btn--full");
    if (o.loading) cls.push("is-loading");
    var content = (o.loading ? '<span class="vq-btn__spinner" aria-hidden="true">' + icon("Loader2", o.size === "sm" ? 14 : 17, "vq-spinner") + "</span>" : "")
      + '<span class="vq-btn__content">' + (o.icon || "") + (o.label || "") + (o.trail || "") + "</span>";
    return '<button class="' + cls.join(" ") + '" type="' + (o.type || "button") + '"' + (o.act ? ' data-act="' + o.act + '"' : "") + (o.disabled ? " disabled" : "") + (o.attrs || "") + ">" + content + "</button>";
  }
  function field(o) {
    return '<div class="vq-field">'
      + (o.label ? '<label class="vq-field__label"' + (o.forid ? ' for="' + o.forid + '"' : "") + ">" + o.label + "</label>" : "")
      + o.control
      + (o.error ? '<span class="vq-field__error" role="alert">' + icon("AlertCircle", 13) + " " + o.error + "</span>"
        : o.hint ? '<span class="vq-field__hint">' + o.hint + "</span>" : "")
      + "</div>";
  }
  function textInput(o) {
    return '<div class="vq-input' + (o.invalid ? " is-invalid" : "") + '">'
      + (o.icon ? '<span class="vq-input__icon">' + o.icon + "</span>" : "")
      + '<input id="' + o.id + '" type="' + (o.type || "text") + '"' + (o.value ? ' value="' + esc(o.value) + '"' : "") + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") + (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : "") + (o.attrs || "") + "/>"
      + (o.trail ? '<span class="vq-input__trail">' + o.trail + "</span>" : "")
      + "</div>";
  }
  function passwordInput(o) {
    return '<div class="vq-input' + (o.invalid ? " is-invalid" : "") + '" id="' + o.id + 'Wrap">'
      + (o.icon ? '<span class="vq-input__icon">' + o.icon + "</span>" : "")
      + '<input id="' + o.id + '" type="password"' + (o.value ? ' value="' + esc(o.value) + '"' : "") + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") + (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : "") + (o.caps ? ' data-caps="1"' : "") + "/>"
      + '<span class="vq-input__trail"><button type="button" class="vq-iconbtn vq-iconbtn--sm" data-act="pw-toggle" data-target="' + o.id + '" aria-label="パスワードを表示" tabindex="-1">' + icon("Eye", 16) + "</button></span>"
      + "</div>";
  }
  var GRADES = [["j1", "中1"], ["j2", "中2"], ["j3", "中3"], ["h1", "高1"], ["h2", "高2"], ["h3", "高3"]];
  /* 学年を選ぶところ。
     ── なぜ自前で作るか ─────────────────────────────────────────
     素の <select> は、スマホだと OS の見た目（ホイールや大きな一覧）が出る。
     本体は独自ドロップダウンで統一しているのに、ここだけ端末まかせになっていた。
     本体側の _customSelectEnhance は影の DOM の外に一覧を出す作りなので、
     この画面（z-index 2147483000 の影の DOM）とは相性が悪い。
     そこで **この中だけで完結する一覧** を持つ。
     値の受け渡しは今までどおり <select> が持つ（既存の読み出しを壊さない）。 */
  function gradeSelect(id, val) {
    var cur = null;
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i][0] === val) cur = GRADES[i];
    if (!cur) cur = GRADES[GRADES.length - 1];
    var opts = GRADES.map(function (g) {
      return '<option value="' + g[0] + '"' + (g[0] === cur[0] ? " selected" : "") + ">" + g[1] + "</option>";
    }).join("");
    return '<div class="vq-input vqna-sel" data-sel="' + id + '">'
      + '<span class="vq-input__icon">' + icon("GraduationCap", 16) + "</span>"
      /* 値を持つのは今までどおり select。画面には出さないが、読み出しはそのまま効く。 */
      + '<select id="' + id + '" class="vqna-sel__native" tabindex="-1" aria-hidden="true">' + opts + "</select>"
      + '<button type="button" class="vqna-sel__btn" data-act="sel-open" data-for="' + id + '"'
      + ' role="combobox" aria-haspopup="listbox" aria-expanded="false">'
      + '<span class="vqna-sel__cur">' + cur[1] + "</span></button>"
      + icon("ChevronDown", 16, "vq-select-chevron")
      + '<div class="vqna-sel__list" role="listbox" hidden>'
      + GRADES.map(function (g) {
        return '<button type="button" class="vqna-sel__opt' + (g[0] === cur[0] ? " is-on" : "")
          + '" role="option" aria-selected="' + (g[0] === cur[0] ? "true" : "false")
          + '" data-act="sel-pick" data-for="' + id + '" data-v="' + g[0] + '">'
          + g[1] + (g[0] === cur[0] ? icon("Check", 15) : "") + "</button>";
      }).join("")
      + "</div></div>";
  }
  /* 一覧を開く・閉じる・選ぶ */
  function selClose() {
    if (!root || !root.querySelectorAll) return;
    var ls = root.querySelectorAll(".vqna-sel__list");
    for (var i = 0; i < ls.length; i++) ls[i].hidden = true;
    var bs = root.querySelectorAll(".vqna-sel__btn");
    for (var k = 0; k < bs.length; k++) bs[k].setAttribute("aria-expanded", "false");
    var ws = root.querySelectorAll(".vqna-sel");
    for (var j = 0; j < ws.length; j++) ws[j].classList.remove("is-open");
  }
  function selOpen(id) {
    var wrap = root.querySelector('.vqna-sel[data-sel="' + id + '"]');
    if (!wrap) return;
    var list = wrap.querySelector(".vqna-sel__list");
    var was = list && !list.hidden;
    selClose();
    if (was) return;
    if (list) list.hidden = false;
    wrap.classList.add("is-open");
    var b = wrap.querySelector(".vqna-sel__btn");
    if (b) b.setAttribute("aria-expanded", "true");
    var on = wrap.querySelector(".vqna-sel__opt.is-on") || wrap.querySelector(".vqna-sel__opt");
    if (on && on.focus) { try { on.focus(); } catch (e) {} }
  }
  function selPick(id, v) {
    var wrap = root.querySelector('.vqna-sel[data-sel="' + id + '"]');
    if (!wrap) return;
    var sel = wrap.querySelector("select");
    if (sel) {
      /* 素の setter で入れて change を出す。既存の読み出しと監視をそのまま生かす。 */
      setNativeValue(sel, v);
    }
    var label = "";
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i][0] === v) label = GRADES[i][1];
    var cur = wrap.querySelector(".vqna-sel__cur");
    if (cur) cur.textContent = label;
    var opts = wrap.querySelectorAll(".vqna-sel__opt");
    for (var k = 0; k < opts.length; k++) {
      var on = opts[k].getAttribute("data-v") === v;
      opts[k].classList.toggle("is-on", on);
      opts[k].setAttribute("aria-selected", on ? "true" : "false");
    }
    selClose();
    var b = wrap.querySelector(".vqna-sel__btn");
    if (b && b.focus) { try { b.focus(); } catch (e) {} }
  }
  function checkbox(o) {
    return '<label class="vq-check"><input type="checkbox" id="' + o.id + '"' + (o.checked ? " checked" : "") + (o.act ? ' data-act="' + o.act + '"' : "") + "/>"
      + '<span class="vq-check__box" aria-hidden="true">' + icon("Check", 13, null, 3.2) + "</span>"
      + (o.label ? '<span class="vq-check__label">' + o.label + "</span>" : "") + "</label>";
  }
  function alertBox(tone, title, body) {
    var m = { info: "Info", success: "CheckCircle2", warning: "AlertTriangle", danger: "XCircle", ai: "Sparkles" };
    return '<div class="vq-alert vq-alert--' + tone + '" role="' + (tone === "danger" ? "alert" : "status") + '"><span class="vq-alert__icon">' + icon(m[tone] || "Info", 17) + '</span><div class="vq-grow">'
      + (title ? '<div class="vq-alert__title">' + title + "</div>" : "")
      + (body ? '<div style="color:var(--vq-text-secondary)">' + body + "</div>" : "") + "</div></div>";
  }
  function progress(pct, size, label) {
    return '<div class="vq-progress' + (size ? " vq-progress--" + size : "") + '" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100"' + (label ? ' aria-label="' + esc(label) + '"' : "") + '><div class="vq-progress__fill" style="width:' + pct + '%"></div></div>';
  }
  function otpInput() {
    var s = "";
    for (var i = 0; i < 6; i++) s += '<input inputmode="numeric" pattern="[0-9]*" maxlength="1" data-otp="' + i + '" aria-label="' + (i + 1) + '桁目"/>';
    return '<div class="vq-otp" role="group" aria-label="確認コード" data-otp-group>' + s + "</div>";
  }
  function authHead(o) {
    return (o.back ? btn({ variant: "ghost", size: "sm", icon: icon("ArrowLeft", 14), label: "戻る", act: o.back, attrs: ' style="margin-left:-10px;margin-bottom:var(--vq-sp-4)"' }) : "")
      + (o.illus ? '<div class="qz-auth__illus">' + illus(o.illus, 132) + "</div>" : "")
      + '<div class="qz-auth__head"><h1 class="qz-auth__title">' + o.title + "</h1>" + (o.sub ? '<p class="qz-auth__sub">' + o.sub + "</p>" : "") + "</div>";
  }

  /* ── content ── */
  var SLIDES = [
    { illus: "create", title: "教材から、クイズがすぐできる", desc: "プリントやPDFを読み取って、AIが問題に変換。手作業の単語カードづくりは、もう必要ありません。" },
    { illus: "analyze", title: "苦手が、ひと目でわかる", desc: "解答の記録から苦手な分野を自動で分析。間違えた問題だけを集めて、効率よく復習できます。" },
    { illus: "coach", title: "AIが、次の一歩を提案", desc: "今日なにを勉強するべきかをAIが提案。1日10分から、テスト勉強を続けられる形にします。" }
  ];
  var QUOTE = { grade: "高3・英語", text: "単語テストの朝、電車の10分だけで間に合うようになった。" };
  var SIDE_ILLUS = { login: "login", signup: "signup", regcode: "otp", regconsent: "done", reset: "reset", newPassword: "reset", verifyEmail: "done", otp: "otp", twoFactor: "otp", locked: "locked", sessionExpired: "expired", maintenance: "maintenance", networkError: "error", legal: "hello" };

  /* ── state ── */
  var S = {
    phase: "welcome",           // splash | intro | welcome | auth
    introStep: 0,
    view: "login", dir: "fwd", stack: [],
    li: { grade: "h3", id: "", pw: "", remember: true, caps: false, busy: false, err: null, fails: 0 },
    su: { email: "", id: "", grade: "h1", pw: "", pw2: "", busy: false, err: null, tsToken: "" },
    reg: { challengeId: "", maskedEmail: "", email: "", code: "", busy: false, err: null, expiresIn: 0, resendIn: 0, resendsRemaining: 3, attemptsRemaining: 5, regSession: "", agreeTerms: false, agreePrivacy: false, otpInvalid: false },
    /* 再設定（管理者コード方式をやめ、自分でできる形に作り直した） */
    rs: newRs(),
    otp: { code: "", invalid: false, busy: false, cooldown: 30, ctx: "reset" },
    np: { pw: "", pw2: "", busy: false },
    /* ★ ログインした まま パスワードを 変える（2026-09-01・訴え
       「アプリ設定から、パスワード変更画面が 出て こなく なった」）。
       直す前: 設定の 行が **送信ボタン**（authChangePwSubmitBtn）を 押していた。
       開く ボタンでは ないので、設定が 閉じて **何も 出ない**。実測で 確かめた。 */
    cp: newCp(),
    /* ★ Google と 結ぶ（ログイン中。ログインの ときの soc とは 別もの） */
    sl: newSl(),
    /* メールアドレスの登録（版が上がってから、全員に必ず通ってもらう） */
    em: newEm(),
    /* ソーシャルで入ってきた人の預かり状態（結び付くまでの間だけ使う） */
    soc: { ticket: "", provider: "", label: "", email: "", displayName: "",
      hasSame: false, mode: "new", grade: "", id: "", pw: "", err: "", busy: false },
    legalDoc: "terms", legalReturn: "login", legalForAgree: false, legalScrolled: false
  };
  /* ソーシャルで入ってきたが、まだどのアカウントとも結び付いていない人の状態 */
  function newSoc() {
    return { ticket: "", provider: "", label: "", email: "", displayName: "",
      hasSame: false, mode: "new", grade: "", id: "", pw: "", err: "", busy: false };
  }
  function newSu() { return { email: "", id: "", grade: "h1", pw: "", pw2: "", busy: false, err: null, tsToken: "" }; }
  function newReg() { return { challengeId: "", maskedEmail: "", email: "", code: "", busy: false, err: null, expiresIn: 0, resendIn: 0, resendsRemaining: 3, attemptsRemaining: 5, regSession: "", agreeTerms: false, agreePrivacy: false, otpInvalid: false, devCode: "" }; }

  /* ── 新規登録 API（Gmail確認フロー）ヘルパ ── */
  function resolveApiBase() {
    var b = "";
    try { b = String(window.AUTH_API_BASE || "").trim().replace(/\/+$/, ""); } catch (e) { }
    if (b) return b;
    if (location.protocol === "http:" || location.protocol === "https:") return "";   // same-origin（Worker が配信）→ 相対
    return "https://vocabuquiz-api.rintyblog.workers.dev";
  }
  function regApi(path, method, bodyObj) {
    return fetch(resolveApiBase() + path, {
      method: method || "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, code: "BAD_RESPONSE", message: "サーバー応答が不正です。" }; })
        .then(function (j) { return { status: res.status, body: j || {} }; });
    }).catch(function () { return { status: 0, body: { ok: false, code: "NETWORK", message: "通信エラーが発生しました。接続を確認してください。" } }; });
  }
  function turnstileSiteKey() {
    try {
      /* ローカル開発専用: localhost で /?vqdev=1 のときだけ Bot 対策ウィジェットをクライアント側スキップ。
         本番ドメインでは param を無視（＝常に通常表示）し、かつサーバは常時 Turnstile を強制するため安全。 */
      var h = location.hostname || "";
      var localHost = (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1" || h === "[::1]");
      if (localHost && /[?&]vqdev=1(?:&|$)/.test(location.search)) return "";
      var c = (window.__PUBLIC_CONFIG__ || {}).turnstile; return String((c && c.siteKey) || "");
    } catch (e) { return ""; }
  }
  var _tsScriptLoading = false;
  function ensureTurnstileScript(cb) {
    if (window.turnstile) { cb && cb(); return; }
    if (_tsScriptLoading) { var iv = setInterval(function () { if (window.turnstile) { clearInterval(iv); cb && cb(); } }, 120); setTimeout(function () { clearInterval(iv); }, 8000); return; }
    _tsScriptLoading = true;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true; s.defer = true;
    s.onload = function () { cb && cb(); };
    s.onerror = function () { cb && cb(); };   // 失敗しても UI は動く（progressive）
    document.head.appendChild(s);
  }
  /* 認証成功 → 既存アプリのトークン保存キーに書いてリロード（アプリがログイン状態を復元） */
  function regAutoLogin(token, expiresAt) {
    try {
      window.localStorage.setItem("app.auth.token.v1", String(token || ""));
      if (expiresAt) window.localStorage.setItem("app.auth.expiresAt.v1", String(Math.trunc(Number(expiresAt))));
      window.localStorage.setItem("app.auth.mode.v1", "user");
    } catch (e) { }
    if (window.__vqNoReload) return;   // テスト用フック（本番では未設定＝通常リロード）
    try { location.reload(); } catch (e) { }
  }
  var host, root, mount, cooldownTimer, splashTimer;

  /* ── screen renderers ── */
  function renderSplash() {
    return '<button class="qz-splash" style="border:0;width:100%;cursor:pointer;font:inherit;color:inherit" data-act="splash-go" aria-label="タップしてはじめる">'
      + '<div class="qz-splash__inner"><div class="qz-splash__logo">VQ</div><div class="qz-splash__name">VocabuQuiz</div><div class="qz-splash__tag">テスト勉強を、クイズで楽しく速く。</div></div>'
      + '<div class="qz-splash__foot"><span style="font:var(--vq-type-caption);color:var(--vq-text-tertiary)">v26.0</span></div></button>';
  }
  function renderIntro() {
    /* 以前は 3 枚めくらせていた。1 枚に 3 行まとめて置くほうが、
       「何ができるアプリか」を一度に受け取れる（めくらないと分からない、を無くす）。 */
    if (isNarrow()) {
      return tutorialPage({
        title: "VocabuQuiz へ<br>ようこそ",
        rows: SLIDES.map(function (sl, k) {
          return { icon: ["Sparkles", "Trophy", "GraduationCap"][k] || "Sparkles",
            title: sl.title, desc: sl.desc };
        }),
        cta: { label: "はじめる", act: "intro-skip" }
      });
    }
    var i = S.introStep, slide = SLIDES[i], last = i === SLIDES.length - 1;
    var dots = SLIDES.map(function (_, d) { return '<i class="' + (d === i ? "is-active" : "") + '"></i>'; }).join("");
    return '<div class="qz-ob">'
      + '<div class="qz-ob__bar">' + (i > 0 ? btn({ variant: "ghost", size: "sm", label: "戻る", act: "intro-back" }) : "<span></span>") + '<span class="vq-grow"></span>' + btn({ variant: "ghost", size: "sm", label: "スキップ", act: "intro-skip" }) + "</div>"
      + '<div class="qz-ob__slide"><div class="qz-ob__illus">' + illus(slide.illus, 230) + '</div><h1 class="qz-ob__title">' + slide.title + '</h1><p class="qz-ob__desc">' + slide.desc + "</p></div>"
      + '<div class="qz-ob__dots" role="img" aria-label="ページ ' + (i + 1) + " / " + SLIDES.length + '">' + dots + "</div>"
      + '<div class="qz-ob__foot">' + btn({ variant: "primary", size: "lg", full: true, trail: icon("ArrowRight", 16), label: last ? "はじめる" : "次へ", act: "intro-next" }) + "</div></div>";
  }
  /* スマホの幅かどうか。見た目の出し分けは CSS の container query が主だが、
     「作りそのものを変える」ものはここで判断する（3 枚めくり → 1 枚 など）。 */
  function isNarrow() {
    try {
      if (mount && mount.getBoundingClientRect) {
        var w = mount.getBoundingClientRect().width;
        if (w > 0) return w < 900;
      }
      return root.innerWidth < 900;
    } catch (e) { return false; }
  }
  function renderWelcome() {
    return '<div class="qz-welcome">'
      + '<div class="qz-welcome__bar"><span class="qz-logo">VQ</span><span style="font:var(--vq-type-heading-sm)">VocabuQuiz</span><span class="vq-grow"></span><span class="vq-badge vq-badge--success"><span class="vq-badge__dot"></span>すべてのシステムが正常</span></div>'
      + '<div class="qz-welcome__body"><div>'
      + '<div class="qz-welcome__mobile-hero">' + illus("hello", 200) + "</div>"
      + '<span class="vq-badge vq-badge--ai">' + icon("Sparkles", 11) + " AI搭載の学習プラットフォーム</span>"
      + '<h1 class="qz-welcome__title">テスト勉強を、<br><em>クイズで楽しく速く。</em></h1>'
      + '<p class="qz-welcome__lede">英単語から定期考査まで。あなたの理解度に合わせて出題が変わる、高校生のための学習アプリ。</p>'
      + '<div class="qz-welcome__actions">'
      + btn({ variant: "primary", size: "lg", icon: icon("LogIn", 16), label: "ログイン", act: "welcome-login" })
      + btn({ variant: "secondary", size: "lg", label: "アカウントを作成", act: "welcome-signup" })
      + btn({ variant: "ghost", label: "ゲストとして試してみる", act: "welcome-guest" })
      + "</div></div>"
      + '<div class="qz-welcome__hero">' + illus("hello", 380)
      + '<span class="qz-welcome__chip" style="top:4%;left:-2%"><span style="color:var(--vq-favorite);display:inline-flex">' + icon("Flame", 14) + "</span> 連続学習 18日目</span>"
      + '<span class="qz-welcome__chip" style="top:38%;right:-4%"><span style="color:var(--vq-ai-text);display:inline-flex">' + icon("Sparkles", 14) + "</span> AIが苦手を分析</span>"
      + '<span class="qz-welcome__chip" style="bottom:6%;left:10%"><span style="color:var(--vq-success-text);display:inline-flex">' + icon("Trophy", 14) + "</span> 期末 +14点の見込み</span>"
      + "</div></div>"
      + '<div class="qz-welcome__foot"><a data-act="legal-open-terms" href="#">利用規約</a><a data-act="legal-open-privacy" href="#">プライバシーポリシー</a><a data-act="noop" href="#">ヘルプ</a><span class="vq-grow"></span><span class="vq-num">v26.0 · © 2026 VocabuQuiz</span></div>'
      + "</div>";
  }

  /* ── auth panels ── */
  /* ══════════════════════════════════════════════════════════════════
     ソーシャルでログインする

     ・押した先は Firebase。返ってきた ID トークンを **サーバへ渡して確かめる**。
       画面側で「この人は○○です」と決めない。
     ・まだ有効になっていない提供元は、そう分かる言葉で出す（黙って失敗させない）。
     ・提供元は SOC に並べたものだけ。ここに無いものは画面にも出ない。
       いまは Google だけ（Apple / Facebook / Instagram は利用者の指示で載せない）。
     ══════════════════════════════════════════════════════════════════ */
  var SOC = [
    { key: "google.com", id: "google", label: "Google で続ける",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z"/></svg>' }
  ];
  function socialBlock() {
    return '<div class="vqna-m-or">または</div>'
      + '<div class="vqna-m-soc">'
      + SOC.map(function (p) {
        return '<button type="button" data-act="social" data-p="' + p.key + '">'
          + p.svg + "<span>" + p.label + "</span></button>";
      }).join("")
      + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     ソーシャルで入ってきたが、まだ結び付いていない人の分かれ道

     ・「新しく作る」か「いまのアカウントへ結ぶ」の 2 択だけにする。
     ・結ぶほうは **必ずパスワードを 1 回聞く**（他人のアカウントを奪えないように）。
     ══════════════════════════════════════════════════════════════════ */
  /* Google のメールアドレスへ送ったコードを入れてもらう画面。
     新しく作る場合も、いまのアカウントへ結ぶ場合も、必ずここを通る。 */
  function panelSocialCode() {
    var c = S.soc || newSoc();
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({
        illus: "otp",
        title: "確認コードを入れてください",
        sub: (c.maskedEmail || c.email || "登録のメールアドレス") + " へ 6 桁のコードを送りました。"
      })
      + (c.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", c.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="soccode">'
      + otpInput()
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center">'
      + "10 分で期限が切れます。あと " + (c.attemptsRemaining === undefined ? 5 : c.attemptsRemaining)
      + " 回まで間違えられます。</div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: c.busy, type: "submit", label: "確認する" })
      + "</form>"
      + '<div style="margin-top:var(--vq-sp-5);text-align:center">'
      + '<button class="vq-btn vq-btn--link" type="button" data-act="soc-resend" data-role="socResend"'
      + (c.resendIn > 0 ? " disabled" : "") + ">"
      + (c.resendIn > 0 ? "再送できます（あと " + c.resendIn + " 秒）" : "確認コードを再送する")
      + "</button>"
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:4px">'
      + "残りの再送: " + (c.resendsRemaining === undefined ? 3 : c.resendsRemaining) + " 回</div></div>"
      + '<div style="margin-top:var(--vq-sp-6)">'
      + btn({ variant: "link", full: true, label: "やめてログイン画面へ戻る", act: "go-login" }) + "</div>";
  }

  function panelSocialSetup() {
    var c = S.soc || newSoc();
    /* コードを通っていない状態でここへ来たら、コードの画面へ戻す。 */
    if (c.ticket && !c.verified) return panelSocialCode();
    var isLink = c.mode === "link";
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({
        illus: "signup",
        title: c.label + " でログインしました",
        sub: c.email
          ? c.email + " と、この端末のアカウントを結び付けます。"
          : "このアカウントを、VocabuQuiz のアカウントと結び付けます。"
      })
      + (c.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", c.err) + "</div>" : "")
      + (c.hasSame && !isLink
        ? '<div style="margin-bottom:var(--vq-sp-5)">'
          + alertBox("info", "同じメールアドレスのアカウントが見つかりました。新しく作らずに結び付けることをおすすめします。")
          + "</div>"
        : "")
      + '<div class="vq-row" style="gap:var(--vq-sp-3);margin-bottom:var(--vq-sp-6)">'
      + btn({ variant: isLink ? "secondary" : "primary", full: true, label: "新しく作る",
        act: "soc-mode", attrs: ' data-m="new"' })
      + btn({ variant: isLink ? "primary" : "secondary", full: true, label: "いまのアカウントへ結ぶ",
        act: "soc-mode", attrs: ' data-m="link"' })
      + "</div>"
      + (isLink
        ? '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="soclink">'
          + field({ label: "学年", forid: "vqnaSocGrade", control: gradeSelect("vqnaSocGrade", c.grade) })
          + field({ label: "ログインID", forid: "vqnaSocId",
            control: textInput({ id: "vqnaSocId", icon: icon("User", 16), placeholder: "例: aoi_eng",
              autocomplete: "username", value: c.id }) })
          + '<div class="vq-field"><label class="vq-field__label" for="vqnaSocPw">パスワード</label>'
          + passwordInput({ id: "vqnaSocPw", icon: icon("Lock", 16), placeholder: "••••••••",
            autocomplete: "current-password" })
          + '<span class="vq-field__hint">本人であることを確かめるため、1 回だけ聞きます。</span></div>'
          + btn({ variant: "primary", size: "lg", full: true, loading: c.busy, type: "submit",
            label: "このアカウントへ結ぶ" })
          + "</form>"
        : '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="socnew">'
          + field({ label: "学年", forid: "vqnaSocGrade", control: gradeSelect("vqnaSocGrade", c.grade) })
          + field({ label: "ログインID", forid: "vqnaSocId",
            control: textInput({ id: "vqnaSocId", icon: icon("User", 16), placeholder: "例: aoi_eng",
              autocomplete: "username", value: c.id }) })
          + '<span class="vq-field__hint">2〜24 文字の英数字と . _ - が使えます。</span>'
          + checkbox({ id: "vqnaSocTos", label: "利用規約とプライバシーポリシーに同意します", checked: false })
          + btn({ variant: "primary", size: "lg", full: true, loading: c.busy, type: "submit",
            label: "この内容ではじめる" })
          + "</form>")
      + '<div style="margin-top:var(--vq-sp-6)">'
      + btn({ variant: "link", full: true, label: "やめてログイン画面へ戻る", act: "go-login" }) + "</div>";
  }

  function panelLogin() {
    var l = S.li;
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({ illus: "login", title: "おかえりなさい", sub: "ログインして、昨日の続きから始めましょう。" })
      + (l.notice ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("success", l.notice) + "</div>" : "")
      + (l.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", l.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="login">'
      + field({ label: "学年", forid: "vqnaLoginGrade", control: gradeSelect("vqnaLoginGrade", l.grade) })
      + field({ label: "ログインID", forid: "vqnaLoginId", control: textInput({ id: "vqnaLoginId", icon: icon("User", 16), placeholder: "例: aoi_eng", autocomplete: "username", value: l.id }) })
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaLoginPw">パスワード</label>'
      + passwordInput({ id: "vqnaLoginPw", icon: icon("Lock", 16), placeholder: "••••••••", autocomplete: "current-password", caps: true })
      + '<span class="vq-field__error" id="vqnaLoginCaps" style="display:none">' + icon("AlertCircle", 13) + " Caps Lock がオンになっています</span></div>"
      + '<div class="vq-row" style="justify-content:space-between;flex-wrap:wrap;gap:var(--vq-sp-3)">'
      + checkbox({ id: "vqnaLoginRemember", label: "ログインしたままにする", checked: l.remember })
      + '<span class="vqna-m-forgot">'
      + btn({ variant: "link", size: "sm", label: "パスワードをお忘れですか？", act: "go-reset" }) + "</span></div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: l.busy, type: "submit", label: "ログイン" })
      + "</form>"
      + socialBlock()
      + '<div class="vq-divider--label" role="separator" style="margin:var(--vq-sp-7) 0">はじめてですか？</div>'
      + btn({ variant: "secondary", full: true, label: "アカウントを作成する", act: "go-signup" })
      + '<p style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center;margin-top:var(--vq-sp-6)">続行すると <a data-act="legal-open-terms" href="#">利用規約</a> と <a data-act="legal-open-privacy" href="#">プライバシーポリシー</a> に同意したことになります。</p>';
  }
  function pwLevel(pw) {
    var l = 0;
    if (pw.length >= 8) l++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) l++;
    if (/\d/.test(pw)) l++;
    if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) l++;
    return l;
  }
  function idOk(id) { return /^[A-Za-z0-9._-]{2,24}$/.test(id); }
  function pad2(n) { n = Math.max(0, n | 0); return (n < 10 ? "0" : "") + n; }
  /* ── ① アカウント情報入力（Gmail + Turnstile）→ /register/start ── */
  function panelSignup() {
    var u = S.su;
    var lvl = pwLevel(u.pw), ik = !u.id || idOk(u.id), mismatch = u.pw2.length > 0 && u.pw !== u.pw2;
    var head = authHead({ illus: "signup", title: "アカウントを作成", sub: "メール確認 → 規約同意 → 完了（ステップ 1 / 3）", back: "go-login" })
      + progress(33, "sm", "登録進捗 33%") + '<div style="height:var(--vq-sp-6)"></div>';
    if (u.err) head += '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", u.err) + "</div>";
    return head + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="regstart">'
      + field({ label: "Gmailアドレス", forid: "vqnaSuEmail", hint: "確認コードの送信とアカウント保護に使用します（@gmail.com のみ）。", control: textInput({ id: "vqnaSuEmail", type: "email", icon: icon("Mail", 16), placeholder: "you@gmail.com", autocomplete: "email", value: u.email, attrs: ' inputmode="email" autocapitalize="off" spellcheck="false"' }) })
      + field({ label: "ログインID", forid: "vqnaSuId", hint: ik ? "英数字と . _ -（2〜24文字）" : undefined, error: (!ik) ? "英数字と . _ - のみ、2〜24文字で入力してください" : undefined, control: textInput({ id: "vqnaSuId", icon: icon("User", 16), placeholder: "例: minato_kb", autocomplete: "username", value: u.id, invalid: !ik }) })
      + field({ label: "学年", forid: "vqnaSuGrade", control: gradeSelect("vqnaSuGrade", u.grade) })
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaSuPw">パスワード</label>'
      + passwordInput({ id: "vqnaSuPw", icon: icon("Lock", 16), placeholder: "8文字以上", autocomplete: "new-password", value: u.pw })
      + '<div class="qz-pwmeter" data-level="' + lvl + '" id="vqnaSuMeter" aria-label="パスワード強度 ' + lvl + ' / 4"><span></span><span></span><span></span><span></span></div>'
      + '<span class="vq-field__hint">8文字以上。大小英字・数字を混ぜると強くなります</span></div>'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaSuPw2">パスワード（確認）</label>' + passwordInput({ id: "vqnaSuPw2", icon: icon("Lock", 16), placeholder: "もう一度入力", autocomplete: "new-password", invalid: mismatch, value: u.pw2 }) + (mismatch ? '<span class="vq-field__error" role="alert">' + icon("AlertCircle", 13) + " パスワードが一致しません</span>" : "") + "</div>"
      + '<div id="vqnaTurnstile"></div>'
      + btn({ variant: "primary", size: "lg", full: true, type: "submit", loading: u.busy, label: "確認コードを送信", attrs: ' id="vqnaSuStart"' })
      + '<p style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center;margin-top:var(--vq-sp-3)"><a data-act="legal-open-terms" href="#">利用規約</a> と <a data-act="legal-open-privacy" href="#">プライバシーポリシー</a> は登録前にお読みいただけます。</p>'
      + "</form>";
  }
  /* ── ② 確認コード入力 → /register/verify ── */
  function panelRegCode() {
    var r = S.reg;
    var mm = Math.floor(Math.max(0, r.expiresIn) / 60), ss = Math.max(0, r.expiresIn) % 60;
    return authHead({ illus: "otp", title: "メールを確認してください", sub: r.maskedEmail + " に6桁の確認コードを送信しました。", back: "reg-change-email" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      /* 開発環境ではメールを送らない。サーバが応答で返した確認コードをここに出す。
         本番は REG_DEV_ECHO_CODE を持たないので devCode が来ず、この行は出ない。 */
      + (r.devCode
          ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("info",
              "確認コード " + '<span class="vq-num" style="font-size:1.3em;letter-spacing:.18em">'
                + esc(r.devCode) + "</span>",
              "開発環境のためメールは送信していません。上のコードを入力してください。")
            + "</div>"
          : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-6);align-items:flex-start" data-form="regverify">'
      + otpInput()
      + '<div class="vq-stack" style="gap:var(--vq-sp-2);width:100%;font:var(--vq-type-caption);color:var(--vq-text-tertiary)">'
      + '<div class="vq-row" style="gap:var(--vq-sp-3)">' + icon("Clock", 13) + ' コードの有効期限 <span id="vqnaRegExpiry" class="vq-num" style="color:var(--vq-text);font-weight:650">' + pad2(mm) + ":" + pad2(ss) + '</span></div>'
      + '<div>残り再送回数 ' + r.resendsRemaining + ' 回</div></div>'
      + btn({ variant: "primary", size: "lg", full: true, type: "submit", loading: r.busy, label: "確認する", disabled: r.code.length < 6, attrs: ' id="vqnaRegVerifyBtn"' })
      + '</form>'
      + '<div class="vq-stack" style="gap:var(--vq-sp-2);margin-top:var(--vq-sp-5)">'
      + btn({ variant: "ghost", size: "sm", label: r.resendIn > 0 ? "コードを再送信（" + r.resendIn + "秒後）" : "コードを再送信", act: "reg-resend", disabled: r.resendIn > 0, attrs: ' id="vqnaRegResend"' })
      + btn({ variant: "link", size: "sm", label: "メールアドレスを変更する", act: "reg-change-email" })
      + btn({ variant: "link", size: "sm", label: "最初からやり直す", act: "reg-restart" })
      + '</div>';
  }
  /* ── ③ 規約/プライバシー同意（メール確認済み）→ /register/consent ── */
  function panelRegConsent() {
    var r = S.reg;
    return authHead({ illus: "done", title: "メールアドレスを確認しました", sub: r.maskedEmail + " の確認が完了しました。最後に規約へ同意してアカウントを作成します（ステップ 3 / 3）。" })
      + progress(100, "sm", "登録進捗 100%") + '<div style="height:var(--vq-sp-6)"></div>'
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="regconsent">'
      + '<div class="vq-stack" style="gap:var(--vq-sp-4)">'
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary)">下の2つをそれぞれ開き、最後まで確認してから同意してください（両方の同意で登録できます）。</div>'
      + agreeRow("terms", "利用規約", r.agreeTerms)
      + agreeRow("privacy", "プライバシーポリシー", r.agreePrivacy)
      + '</div>'
      + btn({ variant: "primary", size: "lg", full: true, type: "submit", loading: r.busy, label: "同意してアカウントを作成", disabled: !(r.agreeTerms && r.agreePrivacy), attrs: ' id="vqnaRegCreate"' })
      + btn({ variant: "ghost", full: true, label: "登録をキャンセル", act: "reg-cancel" })
      + "</form>";
  }
  function agreeRow(key, label, done) {
    return '<div class="vq-row" style="justify-content:space-between;gap:var(--vq-sp-4);padding:var(--vq-sp-4) var(--vq-sp-5);background:var(--vq-surface-sunken);border-radius:var(--vq-r-md)">'
      + '<span class="vq-row" style="gap:var(--vq-sp-3);min-width:0">'
      + '<span style="display:inline-flex;color:' + (done ? "var(--vq-success-text)" : "var(--vq-text-tertiary)") + '">' + icon(done ? "CheckCircle2" : "Info", 18) + "</span>"
      + '<span style="font:var(--vq-type-label)">' + label + "</span></span>"
      + (done
        ? '<span class="vq-row" style="gap:var(--vq-sp-2);font:var(--vq-type-caption);color:var(--vq-success-text);font-weight:650;flex:0 0 auto">同意済み <button type="button" class="vq-btn vq-btn--ghost vq-btn--sm" data-act="legal-agree-' + key + '" style="min-height:auto;padding:2px 8px">読み直す</button></span>'
        : btn({ variant: "secondary", size: "sm", label: "確認して同意", act: "legal-agree-" + key, attrs: ' style="flex:0 0 auto"' }))
      + "</div>";
  }
  /* ── Legal（利用規約 / プライバシー全文・右パネル表示） ── */
  function panelLegal() {
    var t = S.legalDoc === "privacy" ? "privacy" : "terms";
    var doc = LEGAL[t] || [];
    var content = doc.map(function (b) {
      if (b[0] === "title") return '<h1 class="qz-auth__title" style="margin:0 0 var(--vq-sp-4)">' + esc(b[1]) + "</h1>";
      if (b[0] === "h") return '<div style="font:var(--vq-type-heading-sm);color:var(--vq-text);margin:var(--vq-sp-6) 0 var(--vq-sp-3)">' + esc(b[1]) + "</div>";
      if (b[0] === "li") return '<p style="font:var(--vq-type-body-sm);color:var(--vq-text-secondary);margin:0 0 var(--vq-sp-3);padding-left:var(--vq-sp-5)">' + esc(b[1]) + "</p>";
      if (b[0] === "date") return '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:var(--vq-sp-4)">' + esc(b[1]) + "</div>";
      return '<p style="font:var(--vq-type-body-sm);color:var(--vq-text-secondary);margin:0 0 var(--vq-sp-3)">' + esc(b[1]) + "</p>";
    }).join("");
    var agree = S.legalForAgree;
    var head = btn({ variant: "ghost", size: "sm", icon: icon("ArrowLeft", 14), label: "戻る", act: "legal-back", attrs: ' style="margin-left:-10px;margin-bottom:var(--vq-sp-4)"' });
    /* 同意モードでは対象文書に固定（タブ切替なし）。閲覧モードでは規約⇄プライバシーを切替可 */
    var tabs = agree
      ? '<div style="font:var(--vq-type-heading-sm);margin-bottom:var(--vq-sp-4)">' + (t === "terms" ? "利用規約" : "プライバシーポリシー") + "</div>"
      : '<div class="vq-seg" role="tablist" aria-label="法務文書" style="margin-bottom:var(--vq-sp-5)">'
      + '<button class="vq-seg__btn" type="button" role="tab" aria-selected="' + (t === "terms") + '" data-act="legal-terms">利用規約</button>'
      + '<button class="vq-seg__btn" type="button" role="tab" aria-selected="' + (t === "privacy") + '" data-act="legal-privacy">プライバシー</button>'
      + '</div>';
    var scroll = '<div class="vqk-legal-scroll" data-legal-scroll tabindex="0" style="max-height:min(' + (agree ? "52vh,460px" : "62vh,560px") + ');overflow-y:auto;padding:var(--vq-sp-2) var(--vq-sp-5) var(--vq-sp-6) 0">' + content + "</div>";
    var foot = agree
      ? '<div class="vq-stack" style="gap:var(--vq-sp-3);margin-top:var(--vq-sp-5)">'
      + btn({ variant: "primary", size: "lg", full: true, label: (t === "terms" ? "利用規約に同意する" : "プライバシーポリシーに同意する"), act: "legal-do-agree", disabled: !S.legalScrolled, attrs: ' id="vqnaLegalAgreeBtn"' })
      + '<p id="vqnaLegalHint" style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center;display:' + (S.legalScrolled ? "none" : "block") + '">最後までスクロールすると同意できます</p>'
      + "</div>"
      : "";
    return head + tabs + scroll + foot;
  }
  function openLegal(doc, forAgree) {
    S.legalDoc = doc;
    S.legalForAgree = !!forAgree;
    S.legalScrolled = false;
    if (S.view !== "legal") S.legalReturn = (S.phase === "welcome") ? "welcome" : S.view;
    S.phase = "auth"; S.view = "legal"; S.dir = "fwd"; render();
  }
  /* ══════════════════════════════════════════════════════════════════
     パスワードの再設定

     ── 変えた理由 ─────────────────────────────────────────────
     前は「再設定コード（管理者から受け取るもの）」を入れる形だった。
     実際には特定のアカウント 1 つしか通らず、**誰も自分では直せなかった**。
     いまは、本人だと確かめる方法を選んでもらう形にした。
       ① 登録したメールへ届くコード
       ② 暗証番号（4 桁 / 6 桁）
     使えない方法は選ばせない（先に聞いてから出す）。
     ══════════════════════════════════════════════════════════════════ */
  function panelReset() {
    var r = S.rs;
    if (r.step === "method") return panelResetMethod();
    if (r.step === "code") return panelResetCode();
    if (r.step === "pin") return panelResetPin();
    if (r.step === "pw") return panelResetPw();
    /* ① だれのアカウントか */
    return authHead({ illus: "reset", title: "パスワードを再設定",
      sub: "まず、どのアカウントか教えてください。", back: "go-login" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="rswho">'
      + field({ label: "学年", forid: "vqnaRsGrade", control: gradeSelect("vqnaRsGrade", r.grade) })
      + field({ label: "ログインID", forid: "vqnaRsId",
        control: textInput({ id: "vqnaRsId", icon: icon("User", 16), placeholder: "例: aoi_eng", value: r.id }) })
      + btn({ variant: "primary", size: "lg", full: true, loading: r.busy, type: "submit", label: "次へ" })
      + "</form>"
      + '<div style="margin-top:var(--vq-sp-6)">'
      + btn({ variant: "link", full: true, label: "ログイン画面へ戻る", act: "go-login" }) + "</div>";
  }
  /* ② どうやって本人だと確かめるか */
  function panelResetMethod() {
    var r = S.rs;
    var ms = r.methods || [];
    var any = ms.some(function (m) { return m.available; });
    return authHead({ illus: "reset", title: "確かめ方を選んでください",
      sub: r.grade.toUpperCase() + " ・ " + r.id + " のアカウント", back: "rs-back" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + (any ? "" : '<div style="margin-bottom:var(--vq-sp-5)">'
        + alertBox("warning", "このアカウントは、メールアドレスも暗証番号も登録されていません。"
          + "いまのパスワードでログインしてから、メールアドレスの登録をお願いします。") + "</div>")
      + '<div class="vq-stack" style="gap:var(--vq-sp-4)">'
      + ms.map(function (m) {
        return '<button type="button" class="vqna-rs-opt' + (m.available ? "" : " is-off") + '"'
          + (m.available ? ' data-act="rs-method" data-m="' + m.id + '"' : " disabled") + ">"
          + '<span class="vqna-rs-opt__i">' + icon(m.id === "email" ? "Mail" : "ShieldCheck", 20) + "</span>"
          + '<span class="vqna-rs-opt__b"><span class="vqna-rs-opt__t">' + m.label + "</span>"
          + '<span class="vqna-rs-opt__s">' + m.hint + "</span></span>"
          + (m.available ? icon("ChevronRight", 16) : "") + "</button>";
      }).join("")
      + "</div>"
      + '<div style="margin-top:var(--vq-sp-6)">'
      + btn({ variant: "link", full: true, label: "ログイン画面へ戻る", act: "go-login" }) + "</div>";
  }
  /* ③-a メールに届いたコード */
  function panelResetCode() {
    var r = S.rs;
    return authHead({ illus: "otp", title: "確認コードを入れてください",
      sub: (r.maskedEmail || "登録のメールアドレス") + " へ 6 桁のコードを送りました。", back: "rs-back" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="rscode">'
      + otpInput()
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center">'
      + "10 分で期限が切れます。あと " + r.attemptsRemaining + " 回まで間違えられます。</div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: r.busy, type: "submit", label: "確認する" })
      + "</form>"
      + '<div style="margin-top:var(--vq-sp-5);text-align:center">'
      + '<button class="vq-btn vq-btn--link" type="button" data-act="rs-resend"'
      + (r.resendIn > 0 ? " disabled" : "") + ">"
      + (r.resendIn > 0 ? "再送できます（あと " + r.resendIn + " 秒）" : "確認コードを再送する") + "</button>"
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:4px">'
      + "残りの再送: " + r.resendsRemaining + " 回</div></div>";
  }
  /* ③-b 暗証番号 */
  function panelResetPin() {
    var r = S.rs;
    return authHead({ illus: "locked", title: "暗証番号を入れてください",
      sub: "アカウントを作るときに決めた 4 桁または 6 桁の数字です。", back: "rs-back" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="rspin">'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaRsPin">暗証番号</label>'
      + textInput({ id: "vqnaRsPin", icon: icon("ShieldCheck", 16), placeholder: "4 桁 または 6 桁",
        value: r.pin, attrs: ' inputmode="numeric" maxlength="6" autocomplete="off"' })
      + '<span class="vq-field__hint">間違いが続くと、しばらく試せなくなります。</span></div>'
      + btn({ variant: "primary", size: "lg", full: true, loading: r.busy, type: "submit", label: "確認する" })
      + "</form>";
  }
  /* ④ 新しいパスワード */
  function panelResetPw() {
    var r = S.rs;
    var okLen = r.pw.length >= 8;
    var okSame = r.pw2.length > 0 && r.pw === r.pw2;
    return authHead({ illus: "reset", title: "新しいパスワード",
      sub: "以前のパスワードとは別のものにしてください。" })
      + (r.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", r.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="rspw">'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaRsPw">新しいパスワード</label>'
      + passwordInput({ id: "vqnaRsPw", icon: icon("Lock", 16), autocomplete: "new-password" }) + "</div>"
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaRsPw2">もう一度</label>'
      + passwordInput({ id: "vqnaRsPw2", icon: icon("Lock", 16), autocomplete: "new-password",
        invalid: r.pw2.length > 0 && !okSame }) + "</div>"
      + '<div class="vqna-m-rules">'
      + '<div class="vqna-m-rule' + (okLen ? " is-ok" : "") + '"><i>' + (okLen ? "✓" : "") + "</i>8 文字以上</div>"
      + '<div class="vqna-m-rule' + (okSame ? " is-ok" : "") + '"><i>' + (okSame ? "✓" : "") + "</i>2 つが同じ</div>"
      + "</div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: r.busy, type: "submit",
        label: "このパスワードにする" })
      + "</form>"
      + '<p style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:var(--vq-sp-5)">'
      + "変えると、ほかの端末のログインはすべて切れます。</p>";
  }
  /* ══════════════════════════════════════════════════════════════════
     チュートリアルの共通の型

     見出しを大きく左に置き、その下に「アイコン＋見出し＋説明」を縦に並べ、
     いちばん下に丸い大きなボタンを 1 つ。必要なら小さな文字の道を 1 本だけ添える。

     こうしている理由:
       ・スマホでは、最初に目に入るのが見出しであってほしい。
         中央揃えの小さな文字だと、何の画面か分からないまま読み始めることになる。
       ・説明は「絵」ではなく「言葉」で足りる。挿絵を大きく置くと
         肝心の 3 行が画面の外へ押し出される。
       ・押すところは 1 つに絞る。並べると、どれを押せばいいか考えさせてしまう。

     使い方:
       tutorialPage({ title, rows:[{icon,title,desc}], cta:{label,act}, link:{label,act}, note })
     ══════════════════════════════════════════════════════════════════ */
  function tutorialPage(o) {
    o = o || {};
    var rows = (o.rows || []).map(function (r) {
      return '<div class="vqt__r"><span class="vqt__i">' + icon(r.icon || "Sparkles", 30, "", 2.1) + "</span>"
        + '<span class="vqt__b"><span class="vqt__rt">' + esc(r.title) + "</span>"
        + '<span class="vqt__rd">' + esc(r.desc) + "</span></span></div>";
    }).join("");
    return '<div class="vqt">'
      + (o.back ? '<div class="vqt__nav">'
        + btn({ variant: "ghost", size: "sm", icon: icon("ArrowLeft", 15), label: "戻る", act: o.back })
        + "</div>" : "")
      + '<h1 class="vqt__t">' + o.title + "</h1>"
      + (o.lede ? '<p class="vqt__lede">' + esc(o.lede) + "</p>" : "")
      + '<div class="vqt__rows">' + rows + "</div>"
      + '<div class="vqt__foot">'
      + (o.note ? '<p class="vqt__note">' + esc(o.note) + "</p>" : "")
      + (o.cta ? '<button type="button" class="vqt__cta" data-act="' + esc(o.cta.act) + '"'
        + (o.cta.disabled ? " disabled" : "") + ">" + esc(o.cta.label) + "</button>" : "")
      + (o.link ? '<button type="button" class="vqt__link" data-act="' + esc(o.link.act) + '">'
        + esc(o.link.label) + "</button>" : "")
      + (o.dots !== undefined ? '<div class="vqt__dots" role="img" aria-label="ページ '
        + (o.dots + 1) + " / " + (o.dotsOf || 1) + '">'
        + Array.apply(null, Array(o.dotsOf || 1)).map(function (_, d) {
          return '<i class="' + (d === o.dots ? "is-active" : "") + '"></i>';
        }).join("") + "</div>" : "")
      + "</div></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     メールアドレスの登録（チュートリアル）

     版が上がってから、**全員に一度だけ必ず通ってもらう**。
     ここを飛ばせないようにしている理由:
       パスワードを忘れたとき、自分で戻せる道がこれしかないから。
       メールも暗証番号も無いと、本当に誰も助けられなくなる。
     ══════════════════════════════════════════════════════════════════ */
  function panelEmailWhy() {
    return tutorialPage({
      title: "メールアドレスを<br>登録します",
      rows: [
        { icon: "ShieldCheck", title: "忘れても、自分で戻せます",
          desc: "登録したアドレスへ確認コードが届きます。だれかに頼まなくても大丈夫です。" },
        { icon: "Mail", title: "使うのは Gmail だけです",
          desc: "いまは @gmail.com のアドレスにだけ対応しています。" },
        { icon: "Lock", title: "学習の内容は送りません",
          desc: "送るのは、確認コードと大切なお知らせだけです。" }
      ],
      cta: { label: "はじめる", act: "em-go" },
      link: emailOptional ? { label: "あとにする", act: "em-close" } : null,
      note: emailOptional ? "" : "登録が終わるまで、この画面は閉じられません。"
    });
  }
  function panelEmailInput() {
    var e = S.em;
    var okForm = /^[^\s@]+@(gmail|googlemail)\.com$/i.test(e.email);
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({ illus: "signup", title: "Gmail のアドレスを入れてください",
        sub: "確認のコードを、このアドレスへ送ります。", back: "em-back" })
      + (e.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", e.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="emstart">'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaEmAddr">メールアドレス</label>'
      + textInput({ id: "vqnaEmAddr", icon: icon("Mail", 16), placeholder: "yourname@gmail.com",
        value: e.email, attrs: ' type="email" inputmode="email" autocomplete="email"' })
      + '<span class="vq-field__hint">いまは @gmail.com のみです。</span></div>'
      + btn({ variant: "primary", size: "lg", full: true, loading: e.busy, type: "submit",
        label: "確認コードを送る" })
      + "</form>";
  }
  function panelEmailCode() {
    var e = S.em;
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({ illus: "otp", title: "確認コードを入れてください",
        sub: (e.maskedEmail || e.email) + " へ 6 桁のコードを送りました。", back: "em-back" })
      + (e.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", e.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="emcode">'
      + otpInput()
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);text-align:center">'
      + "あと " + e.attemptsRemaining + " 回まで間違えられます。</div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: e.busy, type: "submit", label: "確認する" })
      + "</form>"
      + '<div style="margin-top:var(--vq-sp-5);text-align:center">'
      + '<button class="vq-btn vq-btn--link" type="button" data-act="em-resend"'
      + (e.resendIn > 0 ? " disabled" : "") + ">"
      + (e.resendIn > 0 ? "再送できます（あと " + e.resendIn + " 秒）" : "確認コードを再送する") + "</button>"
      + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:4px">'
      + "届かないときは、迷惑メールもご確認ください。</div></div>";
  }
  function panelEmailDone() {
    var e = S.em;
    return tutorialPage({
      title: "登録できました",
      rows: [
        { icon: "Mail", title: e.maskedEmail || e.email,
          desc: "このアドレスを、あなたのアカウントに結び付けました。" },
        { icon: "ShieldCheck", title: "パスワードを忘れても大丈夫です",
          desc: "ログイン画面の「パスワードをお忘れですか？」から、このアドレスへコードを送って戻せます。" },
        { icon: "Sparkles", title: "設定からいつでも変えられます",
          desc: "機種変更などでアドレスが変わったら、設定 → アカウントで直してください。" }
      ],
      cta: { label: "学習をはじめる", act: "em-finish" }
    });
  }
  /* ══ パスワードを 変える（ログイン中）══════════════════════════
     入り口は 設定の「パスワードを変える」だけ。旧 #authGate は 表に 出さない
     決まりなので、**この 新しい 画面の 中**に 作る（emailSetup と 同じ 作り）。 */
  function newCp() {
    return { step: "form", grade: "", id: "", old: "", pw: "", pw2: "",
             busy: false, err: null };
  }
  function panelChangePw() {
    var c = S.cp;
    if (c.step === "done") {
      return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
        + authHead({ illus: "done", title: "パスワードを変えました",
          sub: "次からは新しいパスワードでログインしてください。"
            + "いまのログインはそのまま続きます。" })
        + btn({ variant: "primary", size: "lg", full: true, label: "とじる", act: "cp-close" });
    }
    var 短い = c.pw.length > 0 && c.pw.length < 8;
    var 不一致 = c.pw2.length > 0 && c.pw !== c.pw2;
    var 同じ = c.pw.length > 0 && c.old.length > 0 && c.pw === c.old;
    var 通る = c.old.length > 0 && c.pw.length >= 8 && c.pw === c.pw2 && !同じ;
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({ illus: "reset", title: "パスワードを変える",
        sub: (c.id ? c.id + " のパスワードを変えます。" : "")
          + "いまのパスワードを知っている場合に使えます。忘れたときは、ログイン画面の「パスワードを忘れた」から。" })
      + (c.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", c.err) + "</div>" : "")
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="cp">'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaCpOld">いまのパスワード</label>'
      + passwordInput({ id: "vqnaCpOld", icon: icon("Lock", 16), value: c.old,
        autocomplete: "current-password" }) + "</div>"
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaCpNew">新しいパスワード</label>'
      + passwordInput({ id: "vqnaCpNew", icon: icon("Lock", 16), value: c.pw,
        autocomplete: "new-password", invalid: 短い || 同じ })
      + '<span class="vq-field__hint" data-cp-hint style="display:' + (同じ ? "none" : "") + '">8文字以上</span>'
      + '<span class="vq-field__error" role="alert" data-cp-same style="display:' + (同じ ? "" : "none") + '">'
      + icon("AlertCircle", 13) + " いまと同じパスワードは使えません</span></div>"
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaCpNew2">新しいパスワード（確認）</label>'
      + passwordInput({ id: "vqnaCpNew2", icon: icon("Lock", 16), value: c.pw2,
        autocomplete: "new-password", invalid: 不一致 })
      + '<span class="vq-field__error" role="alert" data-cp-diff style="display:' + (不一致 ? "" : "none") + '">'
      + icon("AlertCircle", 13) + " パスワードが一致しません</span></div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: c.busy, type: "submit",
        label: "パスワードを変える", disabled: !通る, attrs: ' id="vqnaCpBtn"' })
      + "</form>"
      + '<div style="margin-top:var(--vq-sp-5)">'
      + btn({ variant: "ghost", full: true, label: "やめる", act: "cp-close" }) + "</div>";
  }
  function changePwSubmit() {
    var c = S.cp;
    if (c.busy) return;
    if (!c.grade || !c.id) { c.err = "アカウントが分かりませんでした。開き直してください。"; render(); return; }
    if (c.pw.length < 8) { c.err = "新しいパスワードは8文字以上にしてください。"; render(); return; }
    if (c.pw !== c.pw2) { c.err = "新しいパスワードが一致しません。"; render(); return; }
    c.busy = true; c.err = null; render();
    apiPost("/api/auth/change-password", {
      grade_prefix: c.grade, nickname: c.id,
      old_password: c.old, new_password: c.pw
    }, authToken()).then(function (r) {
      c.busy = false;
      if (r.ok && r.data && r.data.ok !== false) {
        /* 覚えさせない。変えた あとの 古い 値を 持ち歩かない。 */
        c.old = ""; c.pw = ""; c.pw2 = "";
        c.step = "done"; render(); return;
      }
      c.err = (r.data && r.data.message) || "変えられませんでした。";
      render();
    }).catch(function () {
      c.busy = false; c.err = "サーバーへつながりませんでした。"; render();
    });
  }

  /* ══ Google と 結ぶ（ログインした まま）══════════════════════
     訴え「Google との 連携画面も 開いて すぐ 消えちゃう 一瞬で」。
     直す前: 設定の 行は data-nav="account" ＝ **いま 居る 場所へ 移る だけ**。
     描き直しの ちらつきが 起きて、何も 起きなかった（実測）。
     サーバは もう 用意されて いる（/api/auth/social/link は
     「ログイン中なら その まま。設定画面からの あとで結ぶが この道」）。 */
  function newSl() { return { provider: "google.com", label: "Google", step: "ask", busy: false, err: null, 名: "" }; }
  function panelSocialLink() {
    var c = S.sl || newSl();
    if (c.step === "done") {
      return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
        + authHead({ illus: "done", title: c.label + " と結びました",
          sub: (c.名 ? c.名 + " で" : "") + "次からは " + c.label
            + " のボタンだけでログインできます。パスワードも今までどおり使えます。" })
        + btn({ variant: "primary", size: "lg", full: true, label: "とじる", act: "sl-close" });
    }
    return '<div class="vqna-m-logo">Vocabu<b>Quiz</b></div>'
      + authHead({ illus: "signup", title: c.label + " と結ぶ",
        sub: "いまのアカウントに " + c.label + " を結び付けます。"
          + "パスワードを忘れても、" + c.label + " のボタンで入れるようになります。" })
      + (c.err ? '<div style="margin-bottom:var(--vq-sp-5)">' + alertBox("danger", c.err) + "</div>" : "")
      + '<div class="vq-stack" style="gap:var(--vq-sp-4)">'
      + btn({ variant: "primary", size: "lg", full: true, loading: c.busy,
        label: c.label + " のアカウントを選ぶ", act: "sl-go" })
      + btn({ variant: "ghost", full: true, label: "やめる", act: "sl-close" })
      + "</div>";
  }
  /* いまの アカウントへ 結ぶ。**入り直さない**（token を 持ったまま link を 呼ぶ）。 */
  function socialLinkStart() {
    var c = S.sl;
    if (c.busy) return;
    var auth = fbAuth();
    if (!auth) { c.err = "準備ができていません。少し待ってからお試しください。"; render(); return; }
    var fb = window.firebase, provider;
    try {
      provider = c.provider === "google.com" ? new fb.auth.GoogleAuthProvider()
        : new fb.auth.OAuthProvider(c.provider);
      if (provider.addScope) { try { provider.addScope("email"); } catch (e) {} }
    } catch (e) { c.err = "この方法には対応していません。"; render(); return; }
    c.busy = true; c.err = null; render();
    auth.signInWithPopup(provider)
      .then(function (res) {
        var u = (res && res.user) || auth.currentUser;
        if (!u) throw new Error("NO_USER");
        c.名 = u.email || u.displayName || "";
        return u.getIdToken(true);
      })
      .then(function (idToken) {
        return apiPost("/api/auth/social/link", { idToken: idToken }, authToken());
      })
      .then(function (r) {
        c.busy = false;
        if (r && r.ok && r.data && r.data.code !== "BAD_REQUEST") {
          c.step = "done"; render();
          try { if (window.__vqAcctRefresh) window.__vqAcctRefresh(); } catch (e) {}
          return;
        }
        c.err = (r && r.data && r.data.message) || "結べませんでした。";
        render();
      })
      .catch(function (err) {
        c.busy = false;
        var code = String((err && err.code) || "");
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { render(); return; }
        c.err = socialErrText(code) || (code ? "結べませんでした（" + code + "）。" : "サーバーへつながりませんでした。");
        render();
      });
  }

  function panelEmailSetup() {
    var e = S.em;
    if (e.step === "input") return panelEmailInput();
    if (e.step === "code") return panelEmailCode();
    if (e.step === "done") return panelEmailDone();
    return panelEmailWhy();
  }

  function panelVerifyEmail() {
    return authHead({ illus: "done", title: "アカウントを作成しました", sub: "学習をはじめる準備ができています。メールアドレスを登録すると、パスワード再設定と週間レポートが使えるようになります（あとからでも設定できます）。" })
      + '<div class="vq-stack" style="gap:var(--vq-sp-4)">' + btn({ variant: "primary", size: "lg", full: true, label: "学習をはじめる", act: "close" }) + btn({ variant: "ghost", full: true, label: "あとでメールを登録する", act: "close" }) + "</div>";
  }
  function panelOtp() {
    var isReset = S.otp.ctx === "reset";
    return authHead({ illus: isReset ? "otp" : "otp", title: isReset ? "確認コードを入力" : "2段階認証", sub: (isReset ? "再設定用のコードをメールに送信しました。" : "認証アプリに表示されている6桁のコードを入力してください。") + ' デモ: <code>123456</code>', back: "go-back" })
      + '<div class="vq-stack" style="gap:var(--vq-sp-6);align-items:flex-start">' + otpInput()
      + btn({ variant: "primary", size: "lg", full: true, loading: S.otp.busy, label: "確認する", act: "otp-submit", disabled: S.otp.code.length < 6, attrs: ' id="vqnaOtpBtn"' })
      + btn({ variant: "ghost", size: "sm", label: S.otp.cooldown > 0 ? "コードを再送信（" + S.otp.cooldown + "秒後）" : "コードを再送信", act: "otp-resend", disabled: S.otp.cooldown > 0, attrs: ' id="vqnaOtpResend"' })
      + "</div>";
  }
  function panelNewPassword() {
    var n = S.np, mismatch = n.pw2.length > 0 && n.pw !== n.pw2;
    return authHead({ illus: "reset", title: "新しいパスワード", sub: "以前のパスワードとは別のものを設定してください。" })
      + '<form class="vq-stack" style="gap:var(--vq-sp-5)" data-form="np">'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaNpPw">新しいパスワード</label>' + passwordInput({ id: "vqnaNpPw", icon: icon("Lock", 16), autocomplete: "new-password" }) + '<span class="vq-field__hint">8文字以上</span></div>'
      + '<div class="vq-field"><label class="vq-field__label" for="vqnaNpPw2">新しいパスワード（確認）</label>' + passwordInput({ id: "vqnaNpPw2", icon: icon("Lock", 16), autocomplete: "new-password", invalid: mismatch }) + (mismatch ? '<span class="vq-field__error" role="alert">' + icon("AlertCircle", 13) + " パスワードが一致しません</span>" : "") + "</div>"
      + btn({ variant: "primary", size: "lg", full: true, loading: n.busy, type: "submit", label: "パスワードを変更", disabled: !(n.pw.length >= 8 && n.pw === n.pw2), attrs: ' id="vqnaNpBtn"' })
      + "</form>";
  }
  function panelLocked() {
    return authHead({ illus: "locked", title: "アカウントを一時ロックしました", sub: "パスワードの誤りが続いたため、安全のため15分間ログインを制限しています。心当たりがない場合はパスワードを再設定してください。" })
      + '<div class="vq-stack" style="gap:var(--vq-sp-4)">' + btn({ variant: "primary", size: "lg", full: true, label: "パスワードを再設定する", act: "go-reset" }) + btn({ variant: "ghost", full: true, icon: icon("Clock", 15), label: "15分待ってからやり直す", act: "go-login" }) + "</div>";
  }
  function panelSessionExpired() {
    return authHead({ illus: "expired", title: "セッションの有効期限が切れました", sub: "安全のため自動的にログアウトしました。学習データはすべて保存されています。" })
      + btn({ variant: "primary", size: "lg", full: true, label: "もう一度ログイン", act: "go-login" });
  }
  function panelMaintenance() {
    return authHead({ illus: "maintenance", title: "メンテナンス中です", sub: "システムを更新しています。保存済みのクイズはオフラインでも学習できます。" })
      + alertBox("info", "進捗 60%", "完了次第このページは自動で更新されます。")
      + '<div style="margin-top:var(--vq-sp-5)">' + progress(60, null, "メンテナンス進捗 60%") + "</div>";
  }
  function panelNetworkError() {
    return authHead({ illus: "error", title: "接続できません", sub: "ネットワークに接続できないため、ログインを完了できませんでした。" })
      + alertBox("danger", "NET_ERR — サーバーに到達できません", "Wi-Fi またはモバイル通信の状態を確認してください。入力内容はこの端末に保持されています。")
      + '<div style="margin-top:var(--vq-sp-6)">' + btn({ variant: "primary", size: "lg", full: true, label: "再試行", act: "go-login" }) + "</div>";
  }
  var PANELS = {
      emailSetup: panelEmailSetup,
      socialCode: panelSocialCode, socialSetup: panelSocialSetup,
    legal: panelLegal,
    login: panelLogin, signup: panelSignup, regcode: panelRegCode, regconsent: panelRegConsent,
    reset: panelReset, verifyEmail: panelVerifyEmail,
    changePw: panelChangePw, socialLink: panelSocialLink,
    otp: panelOtp, twoFactor: panelOtp, newPassword: panelNewPassword, locked: panelLocked,
    sessionExpired: panelSessionExpired, maintenance: panelMaintenance, networkError: panelNetworkError
  };
  function renderAuth() {
    var pf = PANELS[S.view] || panelLogin;
    return '<div class="qz-auth"><div class="qz-auth__side">'
      + '<div class="vq-row" style="gap:var(--vq-sp-4)"><span class="qz-logo">VQ</span><span style="font:var(--vq-type-heading-sm)">VocabuQuiz</span></div>'
      + '<div class="qz-auth__side-illus">' + illus(SIDE_ILLUS[S.view] || "login", 320) + "</div>"
      + '<div class="qz-auth__quote"><p style="font:var(--vq-type-body-lg);font-weight:550;line-height:1.75;margin-bottom:var(--vq-sp-4)">“' + QUOTE.text + '”</p><span style="font:var(--vq-type-caption);color:var(--vq-text-tertiary)">' + QUOTE.grade + ' のユーザー</span></div>'
      + '<div class="vq-row" style="gap:var(--vq-sp-3);margin-top:var(--vq-sp-6);font:var(--vq-type-caption);color:var(--vq-text-tertiary)">' + icon("ShieldCheck", 13) + " 通信は暗号化されています · 学校のメールアドレスは不要</div>"
      + '</div><div class="qz-auth__main"><div class="qz-auth__panel qz-auth__panel--' + S.dir + '">' + pf() + "</div></div></div>";
  }
  function screenHTML() {
    if (S.phase === "splash") return renderSplash();
    if (S.phase === "intro") return renderIntro();
    if (S.phase === "welcome") return renderWelcome();
    return renderAuth();
  }
  function render() {
    if (!mount) return;
    try { window.__vqcsClose && window.__vqcsClose(); } catch (e) { }
    mount.innerHTML = screenHTML();
    wire();
    /* shadow DOM 内の <select> を UI Studio 独自ドロップダウンへ昇格（存在すれば） */
    try { window.__vqcsEnhance && window.__vqcsEnhance(mount); } catch (e) { }
    /* Splash は自動で Intro へ進む（UI Studio 準拠・タップでも可） */
    clearTimeout(splashTimer);
    if (S.phase === "splash") splashTimer = setTimeout(function () { if (S.phase === "splash") { S.phase = "intro"; S.introStep = 0; render(); } }, 1600);
  }

  /* ── auth view navigation ── */
  function goView(v, dir) {
    S.stack.push(S.view);
    S.dir = dir || "fwd";
    S.view = v;
    S.phase = "auth";
    render();
  }
  function backView() {
    var prev = S.stack.pop() || "login";
    S.dir = "back"; S.view = prev; render();
  }
  function toAuth(view) { S.phase = "auth"; S.view = view; S.dir = "fwd"; S.stack = []; render(); }

  /* ── bridge to existing auth engine ── */
  function $(id) { return document.getElementById(id); }
  function setNativeValue(elm, val) {
    if (!elm) return;
    var proto = elm.tagName === "SELECT" ? window.HTMLSelectElement : window.HTMLInputElement;
    try {
      var d = Object.getOwnPropertyDescriptor(proto.prototype, "value");
      d && d.set ? d.set.call(elm, val) : (elm.value = val);
    } catch (e) { elm.value = val; }
    elm.dispatchEvent(new Event("input", { bubbles: true }));
    elm.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function bridgeLogin() {
    var g = $("authLoginGrade"), n = $("authLoginNickname"), p = $("authLoginPassword"), r = $("authLoginRemember"), st = $("authLoginStatus"), b = $("authLoginSubmitBtn");
    if (!g || !n || !p || !b) { onLoginError("認証システムを初期化できませんでした。ページを再読み込みしてください。"); return; }
    setNativeValue(g, (S.li.grade || "h3").toUpperCase());
    setNativeValue(n, S.li.id);
    setNativeValue(p, S.li.pw);
    if (r) r.checked = !!S.li.remember;
    if (st) st.textContent = "";
    var done = false;
    var finish = function () { if (done) return; done = true; obs && obs.disconnect(); clearInterval(poll); };
    var obs = st ? new MutationObserver(function () {
      var t = (st.textContent || "").trim();
      if (t) { finish(); S.li.busy = false; onLoginError(t); }
    }) : null;
    if (obs) obs.observe(st, { childList: true, characterData: true, subtree: true });
    var start = Date.now();
    var poll = setInterval(function () {
      if (done) return;
      if (!document.body.classList.contains("auth-gate-open")) {
        /* 成功。ここで即座に画面を消さず、鍵が開く様子を見せてから引き上げる。
           refresh() が先に hide() してしまわないよう、演出中は掴んでおく。 */
        finish();
        S.li.busy = false;
        /* 演出の裏で先に確かめておく（待ち時間を重ねる）。 */
        var probe = startEmailGateProbe();
        playUnlock(function () {
          probe.then(function (needs) { if (needs) openEmailGate(); else hide(); });
        });
        return;
      }
      var rp = $("authResetPanel");
      if (rp && rp.classList.contains("is-active")) { finish(); S.li.busy = false; dismiss(); return; } // luna admin backdoor → 旧ゲートの再設定へ委譲（dismissで隠したまま）
      if (Date.now() - start > 20000) { finish(); S.li.busy = false; onLoginError("応答がありませんでした。時間をおいて再試行してください。"); }
    }, 120);
    b.click();
  }
  /* ══════════════════════════════════════════════════════════════════
     鍵が開く演出

     ・パスワードが通ってから、画面をふわりと引き上げるまでの ~1.1 秒。
     ・端末が「視差効果を減らす」なら、演出を出さずにすぐ畳む。
     ・演出中に refresh() が走っても消えないよう、unlocking の間は hide() を止める。
     ══════════════════════════════════════════════════════════════════ */
  var unlocking = false;
  function playUnlock(after) {
    var done = function () {
      unlocking = false;
      try { if (after) after(); else hide(); } catch (e) {}
    };
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) {}
    if (reduce || !root || !root.appendChild) { done(); return; }

    unlocking = true;
    selClose();
    var layer = document.createElement("div");
    layer.className = "vqna-unlock";
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-live", "polite");
    layer.innerHTML =
      '<div class="vqna-unlock__in">'
      + '<svg class="vqna-unlock__lock" viewBox="0 0 64 64" aria-hidden="true">'
      /* 上のつる（開くときに持ち上がる） */
      + '<path class="vqna-unlock__shackle" d="M20 28v-7a12 12 0 0 1 24 0v7"'
      + ' fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>'
      /* 錠前の本体 */
      + '<rect class="vqna-unlock__body" x="14" y="28" width="36" height="26" rx="7"'
      + ' fill="currentColor"/>'
      /* 開いたときの確認の印 */
      + '<path class="vqna-unlock__check" d="M25 41.5l5 5 9.5-10"'
      + ' fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
      + "</svg>"
      + '<div class="vqna-unlock__ring" aria-hidden="true"></div>'
      + '<div class="vqna-unlock__t">ようこそ</div>'
      + "</div>";
    root.appendChild(layer);
    /* 演出が終わったら画面を引き上げる。取りこぼし防止に時間でも締める。 */
    var fired = false;
    var fin = function () { if (fired) return; fired = true; try { layer.remove(); } catch (e) {} done(); };
    layer.addEventListener("animationend", function (e) {
      if (e.animationName === "vqna-unlock-out") fin();
    });
    setTimeout(fin, 1500);
  }

  /* ══ メールアドレスの登録（動き）══════════════════════════════ */
  function authToken() {
    try { return String(localStorage.getItem("app.auth.token.v1") || "").trim(); } catch (e) { return ""; }
  }
  function emailSendCode() {
    var e = S.em;
    var addr = String(e.email || "").trim();
    if (!/^[^\s@]+@(gmail|googlemail)\.com$/i.test(addr)) {
      e.err = "いまは @gmail.com のアドレスだけ登録できます。"; render(); return;
    }
    e.busy = true; e.err = null; render();
    apiPost("/api/auth/upgrade/email/start", { email: addr }, authToken()).then(function (r) {
      e.busy = false;
      if (r.ok && r.data && r.data.challengeId) {
        e.challengeId = r.data.challengeId;
        e.maskedEmail = r.data.maskedEmail || addr;
        e.attemptsRemaining = 5;
        e.resendIn = 30;
        e.step = "code";
        startEmTick();
        if (r.data.devCode) e.err = "（開発用）確認コード: " + r.data.devCode;
      } else {
        var d = r.data || {};
        e.err = d.message || "確認コードを送れませんでした。";
        if (d.code === "RESEND_COOLDOWN" && d.retryAtMs) {
          e.resendIn = Math.max(1, Math.ceil((Number(d.retryAtMs) - Date.now()) / 1000));
          startEmTick();
        }
      }
      render();
    }).catch(function () { e.busy = false; e.err = "サーバーへつながりませんでした。"; render(); });
  }
  var emTimer = null;
  function startEmTick() {
    if (emTimer) clearInterval(emTimer);
    emTimer = setInterval(function () {
      if (!S.em || S.em.resendIn <= 0) { clearInterval(emTimer); emTimer = null; return; }
      S.em.resendIn--;
      if (S.em.resendIn <= 0) render();
    }, 1000);
  }
  function emailVerify() {
    var e = S.em;
    var code = String(e.code || "").replace(/\D/g, "");
    if (code.length !== 6) { e.err = "6 桁の数字を入れてください。"; render(); return; }
    e.busy = true; e.err = null; render();
    apiPost("/api/auth/upgrade/email/verify", { challengeId: e.challengeId, code: code }, authToken())
      .then(function (r) {
        e.busy = false;
        if (r.ok && r.data && r.data.ok) { e.step = "done"; e.code = ""; render(); return; }
        var d = r.data || {};
        e.err = d.message || "確認できませんでした。";
        if (d.remaining !== undefined) e.attemptsRemaining = Number(d.remaining);
        /* もう一度はじめから、が要る場合は入力へ戻す（その場で止まらないように）。 */
        if (d.code === "CODE_EXPIRED" || d.code === "TOO_MANY_ATTEMPTS" || d.code === "CHALLENGE_NOT_FOUND") {
          e.step = "input"; e.challengeId = ""; e.attemptsRemaining = 5; e.resendIn = 0;
        }
        e.code = "";
        render();
      }).catch(function () { e.busy = false; e.err = "サーバーへつながりませんでした。"; render(); });
  }
  /* ══════════════════════════════════════════════════════════════════
     メールが未登録の人を足止めする（A 方式：飛ばせない）

     鍵が開く演出は ~1.1 秒ある。その裏で先に問い合わせておくことで、
     演出が終わった時点では答えが出ている＝ログイン画面が一瞬見える、を防ぐ。
     ══════════════════════════════════════════════════════════════════ */
  var emailGateOn = false;    // ログイン直後の必須（閉じられない）
  var emailOptional = false;  // 設定画面から自分で開いた（閉じられる）
  function startEmailGateProbe() {
    var tok = authToken();
    /* 直後は本体側の保存が終わっていないことがあるので、少し粘って読む。 */
    var wait = tok ? Promise.resolve(tok) : new Promise(function (res) {
      var n = 0, iv = setInterval(function () {
        var t = authToken();
        if (t || ++n > 20) { clearInterval(iv); res(t); }
      }, 100);
    });
    return wait.then(function (t) {
      if (!t) return false;
      return fetch(apiBase() + "/api/auth/me", { headers: { Authorization: "Bearer " + t } })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (d) { return !!(d && d.account && d.account.needsEmail); })
        .catch(function () { return false; });
    }).catch(function () { return false; });
  }
  function openEmailGate() {
    emailGateOn = true;
    emailOptional = false;
    S.em = newEm();
    dismissed = false;
    ensureHost();
    if (!shown) show();
    S.phase = "auth"; S.view = "emailSetup"; S.stack = [];
    render();
  }

  /* 確かめ方を選んだとき */
  function resetPickMethod(m) {
    var r = S.rs;
    r.method = m; r.err = null;
    if (m === "pin") { r.step = "pin"; render(); return; }
    r.step = "code"; render();
    resetSendCode();
  }
  function resetSendCode() {
    var r = S.rs;
    r.busy = true; r.err = null; render();
    apiPost("/api/auth/reset/start", { gradePrefix: r.grade.toUpperCase(), nickname: r.id })
      .then(function (res) {
        r.busy = false;
        if (res.ok && res.data && res.data.challengeId) {
          r.challengeId = res.data.challengeId;
          r.maskedEmail = res.data.maskedEmail || "";
          r.resendsRemaining = Number(res.data.resendsRemaining);
          r.attemptsRemaining = 5;
          r.resendIn = 30;
          startRsTick();
          if (res.data.devCode) r.err = "（開発用）確認コード: " + res.data.devCode;
        } else {
          r.err = (res.data && res.data.message) || "確認コードを送れませんでした。";
        }
        render();
      }).catch(function () { r.busy = false; r.err = "サーバーへつながりませんでした。"; render(); });
  }
  var rsTimer = null;
  function startRsTick() {
    if (rsTimer) clearInterval(rsTimer);
    rsTimer = setInterval(function () {
      if (!S.rs || S.rs.resendIn <= 0) { clearInterval(rsTimer); rsTimer = null; return; }
      S.rs.resendIn--;
      if (S.rs.resendIn <= 0) render();
    }, 1000);
  }
  function resetBack() {
    var r = S.rs;
    r.err = null;
    if (r.step === "code" || r.step === "pin") { r.step = "method"; render(); return; }
    if (r.step === "method") { r.step = "who"; render(); return; }
    toAuth("login");
  }

  function onLoginError(msg) {
    S.li.fails++;
    if (S.li.fails >= 3) { S.li.err = null; S.li.busy = false; goView("locked", "fwd"); return; }
    S.li.err = msg.replace(/^ログイン失敗:\s*/, "") + "（あと" + (3 - S.li.fails) + "回でロックされます）";
    S.li.busy = false;
    render();
  }
  function bridgeGuest() {
    var ack = $("authGuestAcknowledge"), b = $("authGuestConfirmBtn");
    if (ack) ack.checked = true;
    if (b) { b.disabled = false; b.click(); }
  }
  /* ── ① /register/start（Gmail確認開始） ── */
  function doRegStart() {
    var u = S.su;
    regApi("/api/auth/register/start", "POST", {
      email: u.email, gradePrefix: (u.grade || "h1").toUpperCase(),
      nickname: u.id, password: u.pw, password2: u.pw2, turnstileToken: u.tsToken || ""
    }).then(function (res) {
      var b = res.body || {};
      u.busy = false;
      if (b.ok) {
        S.reg = newReg();
        S.reg.challengeId = b.challengeId; S.reg.maskedEmail = b.maskedEmail || maskLocal(u.email); S.reg.email = u.email;
        S.reg.expiresIn = Number(b.expiresIn || 600); S.reg.resendIn = Number(b.resendAvailableIn || 30);
        S.reg.resendsRemaining = Number(b.resendsRemaining != null ? b.resendsRemaining : 3);
        /* 開発環境ではメールを送らず、確認コードを応答で返す（REG_DEV_ECHO_CODE=1）。
           これを画面に出さないと「コードが届かない」ようにしか見えない（実際にそうなった）。
           本番はこのフラグを持たないので devCode が来ず、下の表示も出ない。 */
        S.reg.devCode = String(b.devCode || "");
        goView("regcode", "fwd");
        startRegTimers();
      } else {
        u.err = b.message || "確認コードを送信できませんでした。";
        u.tsToken = ""; render();
      }
    });
  }
  /* ── ② /register/verify ── */
  function doRegVerify() {
    var r = S.reg;
    regApi("/api/auth/register/verify", "POST", { challengeId: r.challengeId, code: r.code }).then(function (res) {
      var b = res.body || {}; r.busy = false;
      if (b.ok && (b.verified || b.alreadyVerified)) {
        r.regSession = b.registrationSession || ""; r.err = null; r.agreeTerms = false; r.agreePrivacy = false;
        stopRegTimers();
        /* メールを確かめたら、つぎは暗証番号。決めてから規約へ進む。
           画面は vq-pin を借りる（暗証番号の見た目を 1 か所に保つ）。 */
        if (window.__vqPin && typeof window.__vqPin.askNew === "function") {
          window.__vqPin.askNew().then(function (pin) {
            r.pin = String(pin || "");
            goView("regconsent", "fwd");
          });
          return;
        }
        goView("regconsent", "fwd");
      } else {
        r.otpInvalid = true; r.code = "";
        if (b.status === "RESTART_REQUIRED" || b.status === "EXPIRED") { r.err = b.message; }
        else { r.err = b.message + (b.attemptsRemaining != null ? "（あと" + b.attemptsRemaining + "回）" : ""); }
        render();
      }
    });
  }
  /* ── ③ /register/consent（正式アカウント作成 + 自動ログイン） ── */
  function doRegConsent() {
    var r = S.reg;
    regApi("/api/auth/register/consent", "POST", { registrationSession: r.regSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: r.pin || "" }).then(function (res) {
      var b = res.body || {}; r.busy = false;
      if (b.ok && b.token) { stopRegTimers(); regAutoLogin(b.token, b.expiresAt); }
      else { r.err = b.message || "アカウント作成に失敗しました。"; render(); }
    });
  }
  /* ── コード再送信 ── */
  function doRegResend() {
    var r = S.reg;
    if (r.resendIn > 0 || r.busy) return;
    regApi("/api/auth/register/resend", "POST", { challengeId: r.challengeId }).then(function (res) {
      var b = res.body || {};
      if (b.ok) {
        r.expiresIn = Number(b.expiresIn || 600); r.resendIn = Number(b.resendAvailableIn || 30);
        r.resendsRemaining = Number(b.resendsRemaining != null ? b.resendsRemaining : r.resendsRemaining); r.err = null; r.code = "";
        if (b.devCode) r.devCode = String(b.devCode);
        render(); startRegTimers();
      } else { r.err = b.message || "再送信できませんでした。"; render(); }
    });
  }
  function maskLocal(email) { var s = String(email || ""); var at = s.lastIndexOf("@"); return at <= 0 ? "***" : s.slice(0, 1) + "*****" + s.slice(at); }
  /* regcode の有効期限 + 再送クールダウンのカウントダウン（表示用。判定はサーバ） */
  var regTimer = null;
  function startRegTimers() {
    stopRegTimers();
    regTimer = setInterval(function () {
      if (!mount || S.view !== "regcode") { stopRegTimers(); return; }
      if (S.reg.expiresIn > 0) S.reg.expiresIn--;
      if (S.reg.resendIn > 0) S.reg.resendIn--;
      var ex = mount.querySelector("#vqnaRegExpiry");
      if (ex) { var m = Math.floor(S.reg.expiresIn / 60), s = S.reg.expiresIn % 60; ex.textContent = pad2(m) + ":" + pad2(s); }
      var rb = mount.querySelector("#vqnaRegResend");
      if (rb) { rb.disabled = S.reg.resendIn > 0; var c = rb.querySelector(".vq-btn__content"); if (c) c.textContent = S.reg.resendIn > 0 ? "コードを再送信（" + S.reg.resendIn + "秒後）" : "コードを再送信"; }
    }, 1000);
  }
  function stopRegTimers() { if (regTimer) { clearInterval(regTimer); regTimer = null; } }
  function regCancelSilent() { var id = S.reg && S.reg.challengeId; if (id) { try { regApi("/api/auth/register/cancel", "POST", { challengeId: id }); } catch (e) { } } }
  function bridgeReset() {
    var g = $("authResetGrade"), n = $("authResetNickname"), k = $("authResetKey"), p = $("authResetPassword"), p2 = $("authResetPassword2"), st = $("authResetStatus"), b = $("authResetSubmitBtn");
    if (!g || !n || !k || !p || !b) { S.rs.err = "再設定システムを初期化できませんでした。"; S.rs.busy = false; render(); return; }
    setNativeValue(g, (S.rs.grade || "h3").toUpperCase());
    setNativeValue(n, S.rs.id);
    setNativeValue(k, S.rs.key);
    setNativeValue(p, S.rs.pw);
    if (p2) setNativeValue(p2, S.rs.pw2);
    if (st) st.textContent = "";
    var done = false;
    var obs = st ? new MutationObserver(function () {
      var t = (st.textContent || "").trim(); if (!t || done) return;
      done = true; obs.disconnect(); S.rs.busy = false;
      var cls = st.className || "";
      if (/is-ok/.test(cls) || /再設定しました/.test(t)) { S.rs.ok = true; S.rs.err = null; S.rs.key = ""; S.rs.pw = ""; S.rs.pw2 = ""; render(); setTimeout(function () { S.rs.ok = false; toAuth("login"); }, 1400); }
      else { S.rs.err = t.replace(/^再設定失敗:\s*/, ""); render(); }
    }) : null;
    if (obs) obs.observe(st, { childList: true, characterData: true, subtree: true });
    setTimeout(function () { if (!done) { done = true; obs && obs.disconnect(); S.rs.busy = false; S.rs.err = "応答がありませんでした。時間をおいて再試行してください。"; render(); } }, 20000);
    b.click();
  }

  /* ── per-render wiring ── */
  function wire() {
    // caps lock (login pw)
    var lpw = root.getElementById ? null : null;
    var lp = mount.querySelector("#vqnaLoginPw");
    if (lp) {
      var caps = mount.querySelector("#vqnaLoginCaps"), wrap = mount.querySelector("#vqnaLoginPwWrap");
      var upd = function (e) { var on = false; try { on = !!(e.getModifierState && e.getModifierState("CapsLock")); } catch (_) { } if (caps) caps.style.display = on ? "flex" : "none"; if (wrap) wrap.classList.toggle("is-invalid", on); };
      lp.addEventListener("keydown", upd); lp.addEventListener("keyup", upd);
      lp.addEventListener("blur", function () { if (caps) caps.style.display = "none"; if (wrap) wrap.classList.remove("is-invalid"); });
    }
    // 新規登録: アカウント入力ライブ検証（pw強度メーター）+ Turnstile 描画
    var suEmail = mount.querySelector("#vqnaSuEmail"), suId = mount.querySelector("#vqnaSuId"), suPw = mount.querySelector("#vqnaSuPw"), suPw2 = mount.querySelector("#vqnaSuPw2");
    if (suPw) {
      var relive = function () {
        if (suEmail) S.su.email = suEmail.value; if (suId) S.su.id = suId.value; if (suPw) S.su.pw = suPw.value; if (suPw2) S.su.pw2 = suPw2.value;
        var lvl = pwLevel(suPw.value), meter = mount.querySelector("#vqnaSuMeter");
        if (meter) { meter.setAttribute("data-level", lvl); meter.setAttribute("aria-label", "パスワード強度 " + lvl + " / 4"); }
      };
      if (suEmail) suEmail.addEventListener("input", relive);
      if (suId) suId.addEventListener("input", relive);
      suPw.addEventListener("input", relive);
      if (suPw2) suPw2.addEventListener("input", relive);
    }
    var tsBox = mount.querySelector("#vqnaTurnstile");
    if (tsBox && turnstileSiteKey() && !S.su.tsToken) {
      ensureTurnstileScript(function () {
        try {
          if (window.turnstile && tsBox.isConnected && !tsBox.getAttribute("data-rendered")) {
            tsBox.setAttribute("data-rendered", "1");
            window.turnstile.render(tsBox, {
              sitekey: turnstileSiteKey(),
              callback: function (tok) { S.su.tsToken = tok; },
              "expired-callback": function () { S.su.tsToken = ""; },
              "error-callback": function () { S.su.tsToken = ""; }
            });
          }
        } catch (e) { }
      });
    }
    // legal 同意モード: 最後までスクロールしたら「同意する」ボタンを有効化（再レンダー無し）
    var lscroll = mount.querySelector("[data-legal-scroll]");
    if (lscroll && S.legalForAgree) {
      var enableAgree = function () {
        S.legalScrolled = true;
        var b = mount.querySelector("#vqnaLegalAgreeBtn"); if (b) b.disabled = false;
        var h = mount.querySelector("#vqnaLegalHint"); if (h) h.style.display = "none";
      };
      lscroll.addEventListener("scroll", function () { if (!S.legalScrolled && lscroll.scrollTop + lscroll.clientHeight >= lscroll.scrollHeight - 12) enableAgree(); }, { passive: true });
      if (lscroll.scrollHeight <= lscroll.clientHeight + 12) enableAgree();   // 短くてスクロール不要な場合は即時
    }
    // otp inputs
    var otps = mount.querySelectorAll("[data-otp]");
    if (otps.length) {
      var isReg = (S.view === "regcode");
      var syncOtp = function () {
        var v = ""; otps.forEach(function (o) { v += (o.value || "").slice(-1); });
        var code = v.replace(/\D/g, "").slice(0, 6);
        if (isReg) { S.reg.code = code; var rb = mount.querySelector("#vqnaRegVerifyBtn"); if (rb) rb.disabled = code.length < 6; }
        else { S.otp.code = code; var b = mount.querySelector("#vqnaOtpBtn"); if (b) b.disabled = code.length < 6; }
        otps.forEach(function (o) { o.classList.toggle("is-filled", !!o.value); });
      };
      otps.forEach(function (o, i) {
        o.addEventListener("input", function () { o.value = (o.value || "").replace(/\D/g, "").slice(-1); if (o.value && i < otps.length - 1) otps[i + 1].focus(); syncOtp(); });
        o.addEventListener("keydown", function (e) {
          if (e.key === "Backspace" && !o.value && i > 0) otps[i - 1].focus();
          if (e.key === "ArrowLeft" && i > 0) otps[i - 1].focus();
          if (e.key === "ArrowRight" && i < otps.length - 1) otps[i + 1].focus();
        });
        o.addEventListener("paste", function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6); if (t) { for (var j = 0; j < otps.length; j++) otps[j].value = t[j] || ""; otps[Math.min(t.length, otps.length - 1)].focus(); syncOtp(); } });
      });
      var af = mount.querySelector('[data-otp="0"]'); if (af) try { af.focus(); } catch (_) { }
    }
    // np live
    var npw = mount.querySelector("#vqnaNpPw"), npw2 = mount.querySelector("#vqnaNpPw2");
    if (npw && npw2) {
      var nlive = function () { S.np.pw = npw.value; S.np.pw2 = npw2.value; var b = mount.querySelector("#vqnaNpBtn"); if (b) b.disabled = !(npw.value.length >= 8 && npw.value === npw2.value); };
      npw.addEventListener("input", nlive); npw2.addEventListener("input", nlive);
    }
    /* ★ パスワード変更の 入力を そのまま 反映する。
       **描き直さない**（1 文字ごとに 描き直すと 打つ場所を 失う）。
       np と 同じ 作法で、状態と ボタンの 可否・注意書きだけ 触る。 */
    var co = mount.querySelector("#vqnaCpOld"), cn = mount.querySelector("#vqnaCpNew"),
        cn2 = mount.querySelector("#vqnaCpNew2");
    if (co && cn && cn2) {
      var clive = function () {
        var c = S.cp;
        c.old = co.value; c.pw = cn.value; c.pw2 = cn2.value;
        var 同 = c.pw.length > 0 && c.old.length > 0 && c.pw === c.old;
        var 差 = c.pw2.length > 0 && c.pw !== c.pw2;
        /* ★ hidden 属性では 消えない（.vq-field__error の display が 勝つ）。 */
        var 出 = function (q, on) { var e = mount.querySelector(q); if (e) e.style.display = on ? "" : "none"; };
        出("[data-cp-same]", 同); 出("[data-cp-hint]", !同); 出("[data-cp-diff]", 差);
        var bb = mount.querySelector("#vqnaCpBtn");
        if (bb) bb.disabled = !(c.old.length > 0 && c.pw.length >= 8 && c.pw === c.pw2 && !同);
      };
      co.addEventListener("input", clive);
      cn.addEventListener("input", clive);
      cn2.addEventListener("input", clive);
      clive();
    }
    // otp cooldown
    if (S.phase === "auth" && (S.view === "otp" || S.view === "twoFactor")) startCooldown();
  }
  function startCooldown() {
    clearInterval(cooldownTimer);
    if (S.otp.cooldown <= 0) return;
    cooldownTimer = setInterval(function () {
      S.otp.cooldown--;
      var b = mount && mount.querySelector("#vqnaOtpResend");
      if (b) { b.disabled = S.otp.cooldown > 0; b.querySelector(".vq-btn__content").textContent = S.otp.cooldown > 0 ? "コードを再送信（" + S.otp.cooldown + "秒後）" : "コードを再送信"; }
      if (S.otp.cooldown <= 0) clearInterval(cooldownTimer);
    }, 1000);
  }

  /* ── delegated events ── */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest("[data-act]") : null;
    /* 一覧の外を押したら閉じる（開きっぱなしにしない）。 */
    if (!t || (t.getAttribute("data-act") !== "sel-open" && t.getAttribute("data-act") !== "sel-pick")) {
      if (!(e.target.closest && e.target.closest(".vqna-sel"))) selClose();
    }
    if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "noop") { e.preventDefault(); return; }
    e.preventDefault();
    switch (act) {
      case "splash-go": S.phase = "intro"; S.introStep = 0; render(); break;
      case "intro-back": S.introStep = Math.max(0, S.introStep - 1); render(); break;
      case "intro-skip": S.phase = "welcome"; render(); break;
      case "intro-next": if (S.introStep >= SLIDES.length - 1) { S.phase = "welcome"; render(); } else { S.introStep++; render(); } break;
      case "welcome-login": toAuth("login"); break;
      case "welcome-signup": S.su = newSu(); S.reg = newReg(); toAuth("signup"); break;
      case "welcome-guest": bridgeGuest(); break;
      case "social": socialSignIn(t.getAttribute("data-p") || ""); break;
      case "soc-mode": S.soc.mode = t.getAttribute("data-m"); S.soc.err = ""; render(); break;
      case "soc-resend": socialSendCode(); break;
      case "em-go": S.em.step = "input"; S.em.err = null; render(); break;
      case "em-back":
        if (S.em.step === "code") { S.em.step = "input"; S.em.err = null; render(); }
        else if (S.em.step === "input") { S.em.step = "why"; S.em.err = null; render(); }
        break;
      case "em-resend": emailSendCode(); break;
      /* パスワードを 変える／Google と 結ぶ（どちらも ログインした まま） */
      case "cp-close": 自分で開いた = false; hide(); break;
      case "sl-close": 自分で開いた = false; hide(); break;
      case "sl-go": socialLinkStart(); break;
      case "em-close": emailOptional = false; hide(); break;
      case "em-finish":
        try { if (window.__vqAcctRefresh) window.__vqAcctRefresh(); } catch (er2) {}
        if (emailOptional) { emailOptional = false; hide(); break; }
        emailGateOn = false; hide();
        try { location.reload(); } catch (er) {}
        break;
      case "rs-method": resetPickMethod(t.getAttribute("data-m")); break;
      case "rs-back": resetBack(); break;
      case "rs-resend": resetSendCode(); break;
      case "sel-open": selOpen(t.getAttribute("data-for")); break;
      case "sel-pick": selPick(t.getAttribute("data-for"), t.getAttribute("data-v")); break;
      case "go-login": toAuth("login"); break;
      case "go-signup": S.su = newSu(); S.reg = newReg(); goView("signup", "fwd"); break;
      case "go-reset": S.rs = { grade: S.li.grade || "h3", id: S.li.id || "", key: "", pw: "", pw2: "", busy: false, err: null, ok: false }; goView("reset", "fwd"); break;
      case "go-back": backView(); break;
      case "pw-toggle": togglePw(t); break;
      case "otp-submit": otpSubmit(); break;
      case "otp-resend": S.otp.cooldown = 30; render(); break;
      case "close": dismiss(); break;
      /* 新規登録: コード確認画面 */
      case "reg-resend": doRegResend(); break;
      case "reg-change-email": stopRegTimers(); regCancelSilent(); toAuth("signup"); break;
      case "reg-restart": stopRegTimers(); regCancelSilent(); S.su = newSu(); S.reg = newReg(); toAuth("signup"); break;
      case "reg-cancel": stopRegTimers(); regCancelSilent(); S.su = newSu(); S.reg = newReg(); toAuth("login"); break;
      /* 法務: 閲覧のみ（login/welcome のリンク） */
      case "legal-open-terms": openLegal("terms", false); break;
      case "legal-open-privacy": openLegal("privacy", false); break;
      /* 法務: 同意モード（regconsent。スクロール読了で下の同意ボタンが有効化） */
      case "legal-agree-terms": openLegal("terms", true); break;
      case "legal-agree-privacy": openLegal("privacy", true); break;
      case "legal-do-agree": if (S.legalScrolled) { S.reg[S.legalDoc === "terms" ? "agreeTerms" : "agreePrivacy"] = true; S.legalForAgree = false; toAuth(S.legalReturn === "regconsent" ? "regconsent" : (S.legalReturn || "regconsent")); } break;
      /* 法務ビュー内のタブ切替（閲覧モードのみ） */
      case "legal-terms": S.legalDoc = "terms"; S.legalScrolled = false; render(); break;
      case "legal-privacy": S.legalDoc = "privacy"; S.legalScrolled = false; render(); break;
      case "legal-back": S.legalForAgree = false; if (S.legalReturn === "welcome") { S.phase = "welcome"; render(); } else { toAuth(S.legalReturn || "login"); } break;
    }
  }
  /* signup から法務へ移動する前に、現在のチェック状態を保存（戻ったとき復元されるように） */
  function stashSignup() {
    if (S.phase === "auth" && S.view === "signup" && mount) {
      var sg = mount.querySelector("#vqnaSuGrade"); if (sg) S.su.grade = sg.value;   // 学年を保全（同意で往復しても維持）
    }
  }
  function togglePw(bt) {
    var id = bt.getAttribute("data-target"), inp = mount.querySelector("#" + id);
    if (!inp) return;
    var reveal = inp.type === "password";
    inp.type = reveal ? "text" : "password";
    bt.setAttribute("aria-label", reveal ? "パスワードを隠す" : "パスワードを表示");
    bt.innerHTML = icon(reveal ? "EyeOff" : "Eye", 16);
    try { inp.focus({ preventScroll: true }); } catch (_) { }
  }
  function onSubmit(e) {
    var f = e.target.closest ? e.target.closest("form[data-form]") : null;
    if (!f) return;
    e.preventDefault();
    var form = f.getAttribute("data-form");
    /* ── メールアドレスの登録 ── */
    if (form === "emstart") {
      var e0 = S.em;
      var a0 = mount.querySelector("#vqnaEmAddr");
      e0.email = a0 ? a0.value.trim() : "";
      emailSendCode();
      return;
    }
    if (form === "cp") {
      var c9 = S.cp;
      var g1 = mount.querySelector("#vqnaCpOld"), g2 = mount.querySelector("#vqnaCpNew"),
          g3 = mount.querySelector("#vqnaCpNew2");
      c9.old = g1 ? g1.value : ""; c9.pw = g2 ? g2.value : ""; c9.pw2 = g3 ? g3.value : "";
      changePwSubmit();
      return;
    }
    if (form === "emcode") {
      var e1 = S.em;
      e1.code = Array.prototype.map.call(mount.querySelectorAll("[data-otp]"), function (x) { return x.value; })
        .join("").replace(/\D/g, "");
      emailVerify();
      return;
    }
    /* ── パスワードの再設定（4 段） ── */
    if (form === "rswho") {
      var r0 = S.rs;
      var g0 = mount.querySelector("#vqnaRsGrade"), i0 = mount.querySelector("#vqnaRsId");
      r0.grade = g0 ? g0.value : "h3";
      r0.id = i0 ? i0.value.trim() : "";
      r0.err = null;
      if (!r0.id) { r0.err = "ログインIDを入れてください。"; render(); return; }
      r0.busy = true; render();
      fetch(apiBase() + "/api/auth/reset/methods?gradePrefix=" + encodeURIComponent(r0.grade.toUpperCase())
        + "&nickname=" + encodeURIComponent(r0.id))
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
        .then(function (x) {
          r0.busy = false;
          if (!x.ok) { r0.err = (x.d && x.d.message) || "見つかりませんでした。"; render(); return; }
          r0.methods = x.d.methods || [];
          r0.step = "method";
          render();
        })
        .catch(function () { r0.busy = false; r0.err = "サーバーへつながりませんでした。"; render(); });
      return;
    }
    if (form === "rscode") {
      var r1 = S.rs;
      r1.code = Array.prototype.map.call(mount.querySelectorAll("[data-otp]"), function (x) { return x.value; })
        .join("").replace(/\D/g, "");
      if (r1.code.length !== 6) { r1.err = "6 桁の数字を入れてください。"; render(); return; }
      r1.busy = true; r1.err = null; render();
      apiPost("/api/auth/reset/code", { challengeId: r1.challengeId, code: r1.code }).then(function (res) {
        r1.busy = false;
        if (res.ok && res.data && res.data.resetToken) {
          r1.resetToken = res.data.resetToken; r1.step = "pw"; r1.err = null; render(); return;
        }
        r1.err = (res.data && res.data.message) || "確認できませんでした。";
        if (res.data && res.data.attemptsRemaining !== undefined) r1.attemptsRemaining = res.data.attemptsRemaining;
        render();
      }).catch(function () { r1.busy = false; r1.err = "サーバーへつながりませんでした。"; render(); });
      return;
    }
    if (form === "rspin") {
      var r2 = S.rs;
      var pinEl = mount.querySelector("#vqnaRsPin");
      r2.pin = pinEl ? pinEl.value.replace(/\D/g, "") : "";
      if (r2.pin.length !== 4 && r2.pin.length !== 6) {
        r2.err = "4 桁または 6 桁の数字を入れてください。"; render(); return;
      }
      r2.busy = true; r2.err = null; render();
      apiPost("/api/auth/reset/pin", { gradePrefix: r2.grade.toUpperCase(), nickname: r2.id, pin: r2.pin })
        .then(function (res) {
          r2.busy = false;
          if (res.ok && res.data && res.data.resetToken) {
            r2.challengeId = res.data.challengeId; r2.resetToken = res.data.resetToken;
            r2.step = "pw"; r2.pin = ""; render(); return;
          }
          r2.err = (res.data && res.data.message) || "確認できませんでした。";
          r2.pin = "";
          render();
        }).catch(function () { r2.busy = false; r2.err = "サーバーへつながりませんでした。"; render(); });
      return;
    }
    if (form === "rspw") {
      var r3 = S.rs;
      var p1 = mount.querySelector("#vqnaRsPw"), p2 = mount.querySelector("#vqnaRsPw2");
      r3.pw = p1 ? p1.value : ""; r3.pw2 = p2 ? p2.value : "";
      if (r3.pw.length < 8) { r3.err = "8 文字以上にしてください。"; render(); return; }
      if (r3.pw !== r3.pw2) { r3.err = "2 つのパスワードが違います。"; render(); return; }
      r3.busy = true; r3.err = null; render();
      apiPost("/api/auth/reset/password",
        { challengeId: r3.challengeId, resetToken: r3.resetToken, newPassword: r3.pw })
        .then(function (res) {
          r3.busy = false;
          if (res.ok && res.data && res.data.ok) {
            S.rs = { step: "who", grade: r3.grade, id: r3.id, methods: null, method: "",
              challengeId: "", maskedEmail: "", code: "", resetToken: "", pin: "", pw: "", pw2: "",
              busy: false, err: null, ok: true, resendsRemaining: 3, attemptsRemaining: 5, resendIn: 0 };
            S.li.err = null;
            S.li.grade = r3.grade; S.li.id = r3.id;
            toAuth("login");
            /* 変えられたことを、ログイン画面の上で伝える。 */
            S.li.notice = "パスワードを変えました。新しいパスワードでログインしてください。";
            render();
            return;
          }
          r3.err = (res.data && res.data.message) || "変えられませんでした。";
          render();
        }).catch(function () { r3.busy = false; r3.err = "サーバーへつながりませんでした。"; render(); });
      return;
    }
    if (form === "soccode") {
      var cc = S.soc || (S.soc = newSoc());
      var box = Array.prototype.map.call(mount.querySelectorAll("[data-otp]"), function (x) { return x.value; });
      cc.code = box.join("").replace(/\D/g, "");
      socialVerifyCode();
      return;
    }
    if (form === "socnew" || form === "soclink") {
      var c = S.soc || (S.soc = newSoc());
      var sg = mount.querySelector("#vqnaSocGrade"), si = mount.querySelector("#vqnaSocId");
      var sp = mount.querySelector("#vqnaSocPw"), st2 = mount.querySelector("#vqnaSocTos");
      c.grade = sg ? sg.value : "";
      c.id = si ? si.value.trim() : "";
      c.pw = sp ? sp.value : "";
      c.err = "";
      if (!c.id) { c.err = "ログインIDを入力してください。"; render(); return; }
      if (form === "socnew" && !(st2 && st2.checked)) {
        c.err = "利用規約とプライバシーポリシーへの同意が必要です。"; render(); return;
      }
      if (form === "soclink" && !c.pw) { c.err = "パスワードを入力してください。"; render(); return; }
      c.busy = true; render();
      var url = form === "socnew" ? "/api/auth/social/register" : "/api/auth/social/link";
      var payload = form === "socnew"
        ? { ticket: c.ticket, gradePrefix: (c.grade || "").toUpperCase(), nickname: c.id, tosAccepted: true }
        : { ticket: c.ticket, gradePrefix: (c.grade || "").toUpperCase(), nickname: c.id, password: c.pw };
      apiPost(url, payload).then(function (r) {
        c.busy = false;
        if (r.ok && r.data && r.data.token) { acceptSession(r.data); return; }
        c.err = (r.data && r.data.message) || "うまくいきませんでした。";
        render();
      }).catch(function () {
        c.busy = false; c.err = "サーバーへつながりませんでした。"; render();
      });
      return;
    }
    if (form === "login") {
      var g = mount.querySelector("#vqnaLoginGrade"), id = mount.querySelector("#vqnaLoginId"), pw = mount.querySelector("#vqnaLoginPw"), rem = mount.querySelector("#vqnaLoginRemember");
      S.li.grade = g ? g.value : "h3"; S.li.id = id ? id.value.trim() : ""; S.li.pw = pw ? pw.value : ""; S.li.remember = rem ? rem.checked : true; S.li.err = null;
      if (!S.li.id) { S.li.err = "ログインIDを入力してください"; render(); return; }
      if (!S.li.pw) { S.li.err = "パスワードを入力してください"; render(); return; }
      S.li.busy = true; render(); bridgeLogin();
    } else if (form === "regstart") {
      var e1 = mount.querySelector("#vqnaSuEmail"), e2 = mount.querySelector("#vqnaSuId"), e3 = mount.querySelector("#vqnaSuGrade"), e4 = mount.querySelector("#vqnaSuPw"), e5 = mount.querySelector("#vqnaSuPw2");
      S.su.email = e1 ? e1.value.trim() : ""; S.su.id = e2 ? e2.value.trim() : ""; S.su.grade = e3 ? e3.value : "h1"; S.su.pw = e4 ? e4.value : ""; S.su.pw2 = e5 ? e5.value : ""; S.su.err = null;
      if (!/^[^\s@]+@gmail\.com$/i.test(S.su.email) && !/^[^\s@]+@googlemail\.com$/i.test(S.su.email)) { S.su.err = "現在は @gmail.com のアドレスのみ登録できます。"; render(); return; }
      if (!idOk(S.su.id)) { S.su.err = "ログインIDは英数字と . _ - のみ、2〜24文字で入力してください。"; render(); return; }
      if (S.su.pw.length < 8) { S.su.err = "パスワードは8文字以上で入力してください。"; render(); return; }
      if (S.su.pw !== S.su.pw2) { S.su.err = "確認用パスワードが一致しません。"; render(); return; }
      if (turnstileSiteKey() && !S.su.tsToken) { S.su.err = "Bot 対策の確認を完了してください。"; render(); return; }
      S.su.busy = true; render(); doRegStart();
    } else if (form === "regverify") {
      if (S.reg.code.length < 6) return;
      S.reg.busy = true; S.reg.err = null; render(); doRegVerify();
    } else if (form === "regconsent") {
      if (!(S.reg.agreeTerms && S.reg.agreePrivacy)) { S.reg.err = "利用規約とプライバシーポリシーの両方に、内容を確認のうえ同意してください。"; render(); return; }
      S.reg.busy = true; S.reg.err = null; render(); doRegConsent();
    } else if (form === "reset") {
      var rg = mount.querySelector("#vqnaRsGrade"), ri = mount.querySelector("#vqnaRsId"), rk = mount.querySelector("#vqnaRsKey"), rp = mount.querySelector("#vqnaRsPw"), rp2 = mount.querySelector("#vqnaRsPw2");
      S.rs.grade = rg ? rg.value : "h3"; S.rs.id = ri ? ri.value.trim() : ""; S.rs.key = rk ? rk.value.trim() : ""; S.rs.pw = rp ? rp.value : ""; S.rs.pw2 = rp2 ? rp2.value : ""; S.rs.err = null;
      if (!S.rs.id) { S.rs.err = "ログインIDを入力してください"; render(); return; }
      if (!S.rs.key) { S.rs.err = "再設定コードを入力してください"; render(); return; }
      if (!S.rs.pw || S.rs.pw.length < 8) { S.rs.err = "パスワードは8文字以上で入力してください"; render(); return; }
      if (S.rs.pw !== S.rs.pw2) { S.rs.err = "確認用パスワードが一致しません"; render(); return; }
      S.rs.busy = true; render(); bridgeReset();
    } else if (form === "np") {
      var np = mount.querySelector("#vqnaNpPw"), np2 = mount.querySelector("#vqnaNpPw2");
      S.np.pw = np ? np.value : ""; S.np.pw2 = np2 ? np2.value : "";
      if (!(S.np.pw.length >= 8 && S.np.pw === S.np.pw2)) return;
      S.np.busy = true; render();
      setTimeout(function () { S.np.busy = false; S.np = { pw: "", pw2: "", busy: false }; toAuth("login"); }, 700);
    }
  }
  function otpSubmit() {
    if (S.otp.code.length < 6) return;
    S.otp.busy = true; render();
    setTimeout(function () {
      S.otp.busy = false;
      if (S.otp.code === "123456") {
        if (S.otp.ctx === "reset") { goView("newPassword", "fwd"); }
        else { dismiss(); }   // 2FA 成功（デモ）
      } else { S.otp.invalid = true; S.otp.code = ""; render(); setTimeout(function () { S.otp.invalid = false; }, 600); }
    }, 700);
  }

  /* ── host / shadow ── */
  /* ══════════════════════════════════════════════════════════════════
     スマホ向けの見た目（添付モックに合わせた 1 カラム）

     ・**上の巨大な 1 行 CSS 文字列は絶対に触らない**（1 文字ずれると認証画面ごと落ちる）。
       ここは別の <style> として後ろへ足すだけ。あとから外すのも簡単。
     ・効かせる範囲は @container vq-screen (max-width: 899px) の中だけ。
       PC の 2 カラムには一切触れない。
     ══════════════════════════════════════════════════════════════════ */
  var MOBILE_CSS = [
    /* ── ここから下は幅に関係なく効く（PC も同じ見た目にするため） ── */
    /* 鍵が開く演出（パスワードが通ってから画面を引き上げるまで） */
    "  .vqna-unlock{position:absolute;inset:0;z-index:80;display:grid;place-items:center;",
    "    background:rgba(255,255,255,.96);backdrop-filter:blur(2px);",
    "    animation:vqna-unlock-out .38s cubic-bezier(.4,0,1,1) 780ms both;}",
    "  .vqna-unlock__in{position:relative;display:grid;place-items:center;gap:14px;}",
    "  .vqna-unlock__lock{position:relative;z-index:1;width:76px;height:76px;color:#5B5BD6;overflow:visible;",
    "    animation:vqna-lock-pop .5s cubic-bezier(.2,.9,.25,1.2) both;}",
    /* つるが持ち上がって、少しだけ傾く＝開いた合図 */
    "  .vqna-unlock__shackle{transform-origin:44px 28px;",
    "    animation:vqna-shackle .52s cubic-bezier(.3,.9,.3,1.3) 180ms both;}",
    /* 確認の印は、つるが上がりきってから描かれる */
    "  .vqna-unlock__check{stroke-dasharray:30;stroke-dashoffset:30;",
    "    animation:vqna-check .34s ease-out 560ms both;}",
    /* 広がる輪 */
    "  .vqna-unlock__ring{position:absolute;top:38px;left:50%;width:76px;height:76px;z-index:0;",
    "    margin-left:-38px;border-radius:50%;border:2px solid #5B5BD6;",
    "    animation:vqna-ring .72s cubic-bezier(.2,.7,.3,1) 480ms both;}",
    "  .vqna-unlock__t{font-size:17px;font-weight:700;color:#2B2836;",
    "    animation:vqna-welcome .42s ease-out 600ms both;}",
    "@keyframes vqna-lock-pop{from{opacity:0;transform:scale(.72)}to{opacity:1;transform:none}}",
    "@keyframes vqna-shackle{0%{transform:translateY(0)}",
    "  60%{transform:translateY(-9px) rotate(0deg)}",
    "  100%{transform:translateY(-8px) rotate(11deg)}}",
    "@keyframes vqna-check{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}",
    "@keyframes vqna-ring{0%{opacity:.55;transform:scale(.6)}100%{opacity:0;transform:scale(2.1)}}",
    "@keyframes vqna-welcome{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    /* 最後にふわりと引き上げる */
    "@keyframes vqna-unlock-out{from{opacity:1;transform:scale(1)}",
    "  to{opacity:0;transform:scale(1.06)}}",
    "@media (prefers-reduced-motion: reduce){",
    "  .vqna-unlock,.vqna-unlock *{animation:none !important;}",
    "}",
    /* ══ チュートリアルの共通の型 ══════════════════════════════
       見出しを大きく左に、説明は「アイコン＋2 行」で縦に、
       押すところは下にひとつ。添付いただいた形に合わせている。 */
    "  .vqt{display:flex;flex-direction:column;min-height:100%;",
    "    padding:26px 24px calc(24px + var(--vq-sab,0px));}",
    "  .vqt__nav{margin:0 0 6px -8px;}",
    /* 見出し。画面の幅に合わせて伸び縮みさせる（小さい端末で 2 行に収まる） */
    "  .vqt__t{font-size:clamp(30px,8.6vw,44px);font-weight:800;line-height:1.16;",
    "    letter-spacing:-.02em;color:var(--vq-text,#0F1419);margin:14px 0 0;}",
    "  .vqt__lede{font-size:16px;line-height:1.6;color:var(--vq-text-secondary,#536471);",
    "    margin:14px 0 0;}",
    /* 説明の行。上下に大きく空ける（詰めると読み飛ばされる） */
    "  .vqt__rows{display:flex;flex-direction:column;gap:38px;",
    "    margin:auto 0;padding:34px 0;}",
    "  .vqt__r{display:flex;align-items:flex-start;gap:20px;}",
    "  .vqt__i{flex:0 0 auto;width:34px;height:34px;display:grid;place-items:center;",
    "    color:var(--vq-text,#0F1419);margin-top:1px;}",
    "  .vqt__i svg{width:30px;height:30px;}",
    "  .vqt__b{flex:1 1 auto;min-width:0;}",
    "  .vqt__rt{display:block;font-size:17px;font-weight:700;line-height:1.4;",
    "    color:var(--vq-text,#0F1419);}",
    "  .vqt__rd{display:block;font-size:16.5px;line-height:1.5;margin-top:3px;",
    "    color:var(--vq-text-secondary,#536471);}",
    /* 下のかたまり。押すところはひとつだけ大きく。 */
    "  .vqt__foot{margin-top:auto;display:flex;flex-direction:column;gap:14px;}",
    "  .vqt__note{font-size:13.5px;line-height:1.55;color:var(--vq-text-tertiary,#8B98A5);",
    "    text-align:center;margin:0;}",
    "  .vqt__cta{width:100%;min-height:60px;border:0;border-radius:999px;cursor:pointer;",
    "    background:var(--vq-text,#0F1419);color:var(--vq-surface,#fff);",
    "    font-size:18px;font-weight:700;letter-spacing:.01em;font-family:inherit;",
    "    transition:opacity .15s ease;}",
    "  .vqt__cta:hover{opacity:.86;}",
    "  .vqt__cta:active{opacity:.72;}",
    "  .vqt__cta:disabled{opacity:.4;cursor:not-allowed;}",
    "  .vqt__cta:focus-visible{outline:2px solid var(--vq-accent,#2b70ef);outline-offset:3px;}",
    "  .vqt__link{width:100%;min-height:44px;border:0;background:none;cursor:pointer;",
    "    font-size:15px;font-weight:500;color:var(--vq-text-secondary,#536471);font-family:inherit;}",
    "  .vqt__link:hover{color:var(--vq-text,#0F1419);}",
    "  .vqt__dots{display:flex;gap:6px;justify-content:center;}",
    "  .vqt__dots i{width:6px;height:6px;border-radius:50%;background:var(--vq-border-strong,#CFD9DE);}",
    "  .vqt__dots i.is-active{background:var(--vq-text,#0F1419);width:18px;border-radius:3px;}",
    /* 広い画面では、真ん中に置いて読みやすい幅で止める */
    "  .vqt{max-width:560px;margin:0 auto;width:100%;}",

    /* チュートリアルは、周りの枠の余白を打ち消して画面いっぱいに使う。
       枠の余白と .vqt 自身の余白が二重になると、下のボタンが画面外へ落ちる。 */
    "  .qz-auth__panel:has(> .vqt){padding:0;max-width:none;background:none;",
    "    border:0;box-shadow:none;}",
    "  .qz-auth:has(.vqt) .qz-auth__main{padding:0;}",
    "  .vqt{flex:1 1 auto;}",

    /* メール登録の説明（なぜ必要か） */
    "  .vqna-why{display:flex;flex-direction:column;gap:14px;margin-top:var(--vq-sp-2,8px);}",
    "  .vqna-why__r{display:flex;align-items:flex-start;gap:14px;}",
    "  .vqna-why__i{flex:0 0 auto;width:40px;height:40px;border-radius:12px;display:grid;",
    "    place-items:center;background:#EEEBFA;color:#5B5BD6;}",
    "  .vqna-why__b{flex:1 1 auto;min-width:0;}",
    "  .vqna-why__t{display:block;font-size:15px;font-weight:700;color:#2B2836;line-height:1.45;}",
    "  .vqna-why__s{display:block;font-size:13px;color:#7A7589;margin-top:3px;line-height:1.6;}",
    /* 再設定の「確かめ方を選ぶ」ボタン */
    "  .vqna-rs-opt{display:flex;align-items:center;gap:14px;width:100%;padding:16px 16px;",
    "    border:1px solid #DDDAE6;border-radius:14px;background:#fff;cursor:pointer;text-align:left;",
    "    transition:border-color .15s ease,background .15s ease;}",
    "  .vqna-rs-opt:hover{border-color:#5B5BD6;background:#FAF9FC;}",
    "  .vqna-rs-opt:focus-visible{outline:2px solid #5B5BD6;outline-offset:2px;}",
    "  .vqna-rs-opt.is-off{opacity:.5;cursor:not-allowed;background:#F7F6FB;}",
    "  .vqna-rs-opt.is-off:hover{border-color:#DDDAE6;background:#F7F6FB;}",
    "  .vqna-rs-opt__i{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:grid;",
    "    place-items:center;background:#EEEBFA;color:#5B5BD6;}",
    "  .vqna-rs-opt.is-off .vqna-rs-opt__i{background:#EAE8F0;color:#9994A8;}",
    "  .vqna-rs-opt__b{flex:1 1 auto;min-width:0;}",
    "  .vqna-rs-opt__t{display:block;font-size:16px;font-weight:700;color:#2B2836;}",
    "  .vqna-rs-opt__s{display:block;font-size:13px;color:#7A7589;margin-top:2px;",
    "    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    /* 学年の独自ドロップダウン。端末まかせの一覧を出さない。 */
    "  .vqna-sel{position:relative;}",
    "  .vqna-sel__native{position:absolute !important;width:1px !important;height:1px !important;",
    "    opacity:0 !important;pointer-events:none !important;left:-9999px !important;}",
    "  .vqna-sel__btn{flex:1 1 auto;min-width:0;height:100%;padding:0;margin:0;border:0;",
    "    background:none;text-align:left;cursor:pointer;font:inherit;color:inherit;}",
    "  .vqna-sel__cur{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    "  .vqna-sel.is-open .vq-select-chevron{transform:rotate(180deg);}",
    "  .vq-select-chevron{transition:transform .16s ease;}",
    "  .vqna-sel__list{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:40;",
    "    max-height:264px;overflow-y:auto;padding:6px;border-radius:12px;",
    "    background:#fff;border:1px solid #DDDAE6;box-shadow:0 12px 32px rgba(43,40,54,.16);}",
    "  .vqna-sel__list[hidden]{display:none;}",
    "  .vqna-sel__opt{display:flex;align-items:center;justify-content:space-between;gap:8px;",
    "    width:100%;min-height:46px;padding:8px 12px;border:0;border-radius:9px;background:none;",
    "    cursor:pointer;font-size:16px;color:#2B2836;text-align:left;}",
    "  .vqna-sel__opt:hover{background:#F4F2FB;}",
    "  .vqna-sel__opt:focus-visible{outline:2px solid #5B5BD6;outline-offset:-2px;}",
    "  .vqna-sel__opt.is-on{background:#EEEBFA;color:#5B5BD6;font-weight:700;}",
    "  .vqna-sel__opt svg{width:15px;height:15px;flex:0 0 auto;}",
    /* ロゴは PC では左の列に既に出ているので、二重に出さない */
    "  .vqna-m-logo{display:none;}",
    /* 「または」の区切り */
    "  .vqna-m-or{display:flex;align-items:center;gap:14px;margin:22px 0 16px;",
    "    font-size:13px;color:#7A7589;}",
    "  .vqna-m-or::before,.vqna-m-or::after{content:'';flex:1 1 auto;height:1px;background:#E4E1EC;}",
    /* ソーシャルのボタン（縦に並べる・丸い枠・アイコンは小さく） */
    "  .vqna-m-soc{display:flex;flex-direction:column;gap:10px;}",
    "  .vqna-m-soc button{display:flex;align-items:center;justify-content:center;gap:10px;",
    "    width:100%;height:48px;padding:0 16px;border-radius:999px;border:1px solid #DDDAE6;",
    "    background:#fff;font-size:15px;font-weight:600;color:#2B2836;cursor:pointer;",
    "    transition:background .15s ease,border-color .15s ease;}",
    "  .vqna-m-soc button:hover{background:#FAF9FC;border-color:#C9C4D8;}",
    "  .vqna-m-soc button:focus-visible{outline:2px solid #5B5BD6;outline-offset:2px;}",
    "  .vqna-m-soc button:disabled{opacity:.5;cursor:progress;}",
    /* アイコンの大きさを必ず固定する。これが無いと PC で巨大化する。 */
    "  .vqna-m-soc button > svg{width:20px !important;height:20px !important;flex:0 0 auto;}",
    "  .vqna-m-soc button > span{flex:0 0 auto;}",
    /* ── ここから下はスマホ幅のときだけ ── */
    "@container vq-screen (max-width: 899px){",
    "  .vqna-m-logo{display:block;}",
    /* 全体を白い 1 枚にする */
    "  .qz-auth{background:#fff;min-height:100%;}",
    "  .qz-auth__main{padding:0;background:#fff;}",
    "  .qz-auth__panel{max-width:none;width:100%;padding:24px 22px 40px;background:#fff;box-shadow:none;border:0;border-radius:0;}",
    /* モックには大きな挿絵が無いので、上のイラストは畳む */
    "  .qz-auth__illus{display:none;}",
    /* ロゴ（画面のいちばん上・中央） */
    "  .vqna-m-logo{display:block;text-align:center;font-weight:800;letter-spacing:-.02em;",
    "    font-size:32px;line-height:1.15;margin:8px 0 26px;color:#2B2836;}",
    "  .vqna-m-logo b{color:#5B5BD6;font-weight:800;}",
    /* 見出し */
    "  .qz-auth__head{text-align:center;margin-bottom:22px;}",
    "  .qz-auth__title{font-size:21px;font-weight:700;color:#2B2836;letter-spacing:0;}",
    "  .qz-auth__sub{font-size:14px;color:#7A7589;margin-top:6px;line-height:1.6;}",
    /* 入力欄 */
    "  .vq-field{margin:0;}",
    "  .vq-field__label{font-size:15px;font-weight:600;color:#2B2836;margin-bottom:8px;display:block;}",
    "  .vq-input{height:54px;border-radius:10px;border:1px solid #DDDAE6;background:#fff;}",
    "  .vq-input:focus-within{border-color:#5B5BD6;box-shadow:0 0 0 3px rgba(91,91,214,.14);}",
    "  .vq-input input,.vq-input select{font-size:16px;color:#2B2836;}",
    "  .vq-input input::placeholder{color:#A8A4B5;}",
    /* ボタン（角は少しだけ丸く・高さはモックに合わせる） */
    "  .vq-btn--lg{height:54px;border-radius:10px;font-size:16px;font-weight:700;}",
    "  .vq-btn--primary{background:#5B5BD6;color:#fff;}",
    "  .vq-btn--primary:hover{background:#4F4FC4;}",
    /* パスワードを忘れた（右寄せのリンク） */
    "  .vqna-m-forgot{display:flex;justify-content:flex-end;flex:1 1 100%;margin-top:-2px;}",
    "  .vqna-m-forgot .vq-btn{padding:0;height:auto;min-height:0;color:#5B5BD6;font-size:14px;font-weight:600;}",
    /* スマホでは少し大きく（指で押しやすく） */
    "  .vqna-m-or{margin:26px 0 18px;font-size:14px;}",
    "  .vqna-m-soc{gap:12px;}",
    "  .vqna-m-soc button{height:54px;font-size:16px;gap:12px;}",
    "  .vqna-m-soc button > svg{width:22px !important;height:22px !important;}",
    /* いちばん下の「アカウントを作成」 */
    "  .vqna-m-create{display:block;width:100%;margin-top:26px;padding:12px;",
    "    background:none;border:0;font-size:16px;font-weight:700;color:#2B2836;cursor:pointer;}",
    /* 確認コード（モックと同じ角丸の四角） */
    "  .vq-otp{gap:10px;justify-content:center;}",
    "  .vq-otp input{width:52px;height:60px;border-radius:10px;border:1.5px solid #5B5BD6;",
    "    font-size:22px;font-weight:700;color:#2B2836;}",
    /* 条件のチェック（モックの ✔ 付きの行） */
    "  .vqna-m-rules{display:flex;flex-direction:column;gap:10px;margin:4px 0 4px;}",
    "  .vqna-m-rule{display:flex;align-items:center;gap:10px;font-size:15px;color:#5A5568;}",
    "  .vqna-m-rule i{width:20px;height:20px;border-radius:50%;flex:0 0 auto;display:grid;",
    "    place-items:center;background:#DDDAE6;color:#fff;font-style:normal;font-size:12px;}",
    "  .vqna-m-rule.is-ok i{background:#5B5BD6;}",
    "  .vqna-m-rule.is-ok{color:#2B2836;}",
    /* 封筒の絵（Check your Email） */
    "  .vqna-m-mail{width:64px;height:64px;border-radius:16px;margin:0 auto 18px;",
    "    display:grid;place-items:center;background:#EEEBFA;color:#5B5BD6;}",
    "  .vqna-m-mail svg{width:30px;height:30px;}",
    "}"
  ].join("\n");

  /* ── Firebase を用意する（読み込み済みならそれを使う） ───────────── */
  function fbAuth() {
    try {
      var fb = window.firebase;
      if (!fb || !fb.auth) return null;
      if (!fb.apps || !fb.apps.length) {
        var cfg = (window.__PUBLIC_CONFIG__ || {}).firebase;
        if (!cfg || !cfg.apiKey) return null;
        fb.initializeApp(cfg);
      }
      return fb.auth();
    } catch (e) { return null; }
  }
  function socialBusy(on) {
    try {
      var bs = root.querySelectorAll(".vqna-m-soc button");
      for (var i = 0; i < bs.length; i++) bs[i].disabled = !!on;
    } catch (e) {}
  }
  function socialErrText(code) {
    if (code === "auth/operation-not-allowed")
      return "この方法でのログインは、まだ有効になっていません。管理者に連絡してください。";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
      return "";                       /* 自分で閉じただけ。何も出さない。 */
    if (code === "auth/account-exists-with-different-credential")
      return "同じメールアドレスが、別の方法ですでに登録されています。そちらでログインしてから連携してください。";
    if (code === "auth/network-request-failed") return "通信できませんでした。接続をご確認ください。";
    if (code === "auth/unauthorized-domain")
      return "この場所からのログインは許可されていません（Firebase の承認済みドメインに未登録）。";
    return "";
  }
  /* 提供元を押したときの一連。ここが唯一の入り口。 */
  function socialSignIn(providerKey) {
    var auth = fbAuth();
    if (!auth) {
      S.li.err = "ログインの準備ができていません。少し待ってからお試しください。";
      render();
      return;
    }
    var fb = window.firebase;
    var provider;
    try {
      if (providerKey === "google.com") provider = new fb.auth.GoogleAuthProvider();
      else if (providerKey === "facebook.com") provider = new fb.auth.FacebookAuthProvider();
      else provider = new fb.auth.OAuthProvider(providerKey);
      if (provider.addScope) { try { provider.addScope("email"); } catch (e) {} }
    } catch (e) {
      S.li.err = "この方法には対応していません。";
      render();
      return;
    }
    socialBusy(true);
    auth.signInWithPopup(provider)
      .then(function (res) {
        var u = (res && res.user) || auth.currentUser;
        if (!u) throw new Error("NO_USER");
        return u.getIdToken(true);
      })
      .then(function (idToken) { return socialExchange(idToken, providerKey); })
      .catch(function (err) {
        var code = String((err && err.code) || "");
        /* ポップアップが塞がれていたら、リダイレクトでやり直す。 */
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment"
            || code === "auth/web-storage-unsupported") {
          try {
            sessionStorage.setItem("vqna.socialRedirect", providerKey);
            auth.signInWithRedirect(provider);
            return;
          } catch (e2) {}
        }
        socialBusy(false);
        var msg = socialErrText(code);
        if (msg) { S.li.err = msg; render(); }
        else if (code && code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
          S.li.err = "ログインできませんでした（" + code + "）。";
          render();
        }
      });
  }
  /* 受け取った ID トークンをサーバへ渡す。ここで初めて「誰か」が決まる。 */
  function socialExchange(idToken, providerKey) {
    return apiPost("/api/auth/social/login", { idToken: idToken })
      .then(function (r) {
        socialBusy(false);
        if (r.ok && r.data && r.data.token) { acceptSession(r.data); return; }
        if (r.data && r.data.code === "NEEDS_ACCOUNT") {
          S.soc = {
            ticket: r.data.ticket, provider: r.data.provider,
            label: r.data.providerLabel, email: r.data.email || "",
            maskedEmail: "", displayName: r.data.displayName || "",
            hasSame: !!r.data.hasAccountWithSameEmail,
            mode: r.data.hasAccountWithSameEmail ? "link" : "new",
            grade: S.li.grade || "", id: "", pw: "", err: "", busy: false,
            code: "", codeSent: false, verified: false,
            resendsRemaining: 3, attemptsRemaining: 5, resendIn: 0
          };
          /* まず、そのメールアドレスへ確認コードを送る。
             新しく作る場合も、いまのアカウントへ結ぶ場合も、ここは共通。 */
          goView("socialCode");
          socialSendCode();
          return;
        }
        S.li.err = (r.data && r.data.message) || "ログインできませんでした。";
        render();
      })
      .catch(function () {
        socialBusy(false);
        S.li.err = "サーバーへつながりませんでした。";
        render();
      });
  }
  /* 共通の POST（このオーバーレイからの通信はここだけを通す） */
  function apiBase() {
    try {
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/+$/, "");
      if (window.VQ_API_BASE) return String(window.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function apiPost(path, body, token) {
    var h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return fetch(apiBase() + path, { method: "POST", headers: h, body: JSON.stringify(body || {}) })
      .then(function (res) {
        return res.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) {}
          return { ok: res.ok, status: res.status, data: data || {} };
        });
      });
  }
  /* ログインできた。既存のログインと同じ場所へ書いて、画面を畳む。 */
  function acceptSession(data) {
    try {
      localStorage.setItem("app.auth.token.v1", String(data.token || ""));
      if (data.user) localStorage.setItem("app.auth.profile.v1", JSON.stringify({
        uid: data.user.id, gradePrefix: data.user.gradePrefix, nickname: data.user.nickname
      }));
    } catch (e) {}
    /* 本体へ「入った」ことを伝える。既存の流れをそのまま使う。 */
    try {
      if (typeof window._authAfterLogin === "function") { window._authAfterLogin(data); }
      else if (typeof window._authApplySession === "function") { window._authApplySession(data); }
    } catch (e) {}
    try { document.body.classList.remove("auth-gate-open", "first-launch-open"); } catch (e) {}
    /* パスワードのときと同じ「鍵が開く」演出を見せてから読み直す。 */
    var probe2 = startEmailGateProbe();
    playUnlock(function () {
      probe2.then(function (needs) {
        if (needs) { openEmailGate(); return; }
        try { location.reload(); } catch (e) {}
      });
    });
  }
  /* 確認コードを送る */
  function socialSendCode() {
    var c = S.soc;
    if (!c || !c.ticket) return;
    c.busy = true; c.err = ""; render();
    apiPost("/api/auth/social/code/send", { ticket: c.ticket }).then(function (r) {
      c.busy = false;
      if (r.ok && r.data && r.data.ok) {
        c.codeSent = true;
        c.maskedEmail = r.data.maskedEmail || c.email;
        c.resendsRemaining = Number(r.data.resendsRemaining);
        c.resendIn = 30;
        startResendTick();
        /* 開発環境で実メールを送っていないときは、コードを画面へ出す（本番では返らない）。 */
        if (r.data.devCode) c.err = "（開発用）確認コード: " + r.data.devCode;
      } else {
        c.err = (r.data && r.data.message) || "確認コードを送れませんでした。";
      }
      render();
    }).catch(function () {
      c.busy = false; c.err = "サーバーへつながりませんでした。"; render();
    });
  }
  var resendTimer = null;
  function startResendTick() {
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(function () {
      if (!S.soc || S.soc.resendIn <= 0) { clearInterval(resendTimer); resendTimer = null; return; }
      S.soc.resendIn--;
      var el = root && root.querySelector ? root.querySelector("[data-role=socResend]") : null;
      if (el) el.textContent = S.soc.resendIn > 0 ? "再送できます（あと " + S.soc.resendIn + " 秒）" : "確認コードを再送する";
      if (S.soc.resendIn <= 0) render();
    }, 1000);
  }
  /* 入れてもらったコードを確かめる */
  function socialVerifyCode() {
    var c = S.soc;
    if (!c || !c.ticket) return;
    var code = String(c.code || "").replace(/\D/g, "");
    if (code.length !== 6) { c.err = "6 桁の数字を入れてください。"; render(); return; }
    c.busy = true; c.err = ""; render();
    apiPost("/api/auth/social/code/verify", { ticket: c.ticket, code: code }).then(function (r) {
      c.busy = false;
      if (r.ok && r.data && r.data.verified) {
        c.verified = true; c.code = "";
        goView("socialSetup");
        return;
      }
      c.err = (r.data && r.data.message) || "確認できませんでした。";
      if (r.data && r.data.attemptsRemaining !== undefined) c.attemptsRemaining = r.data.attemptsRemaining;
      c.code = "";
      render();
    }).catch(function () {
      c.busy = false; c.err = "サーバーへつながりませんでした。"; render();
    });
  }

  /* リダイレクトで戻ってきた場合の受け取り */
  function socialResumeRedirect() {
    var want = "";
    try { want = sessionStorage.getItem("vqna.socialRedirect") || ""; } catch (e) {}
    if (!want) return;
    try { sessionStorage.removeItem("vqna.socialRedirect"); } catch (e) {}
    var auth = fbAuth();
    if (!auth || !auth.getRedirectResult) return;
    auth.getRedirectResult().then(function (res) {
      var u = (res && res.user) || auth.currentUser;
      if (!u) return;
      return u.getIdToken(true).then(function (t) { return socialExchange(t, want); });
    }).catch(function () {});
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = "vqNewAuth";
    host.setAttribute("aria-hidden", "true");
    /* z-index は最大級。本体の #firstLaunchOverlay(999999)/#authBootSplash(999998) より必ず上に置く。 */
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:none;overflow:auto;background:var(--vq-lav-50,#F7F6FB);-webkit-overflow-scrolling:touch;";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = document.createElement("style");
    st.textContent = CSS;
    /* スマホ向けの上書き。**あとに置く**ので同じ強さなら勝つ。 */
    var stm = document.createElement("style");
    stm.id = "vqna-mobile";
    stm.textContent = MOBILE_CSS;
    var frame = document.createElement("div");
    frame.className = "vqna-mount";
    root.appendChild(st);
    root.appendChild(stm);
    root.appendChild(frame);
    mount = frame;
    root.addEventListener("click", onClick, true);
    root.addEventListener("submit", onSubmit, true);
    /* light-DOM の1行だけ: 新オーバーレイ表示中は旧 #authGate を隠す（点滅/重なりの保険）。
       visibility にして _authGateVisible 等の判定やブリッジ(.value/.click)は温存する。 */
    if (!document.getElementById("vqna-gatehide")) {
      var ls = document.createElement("style");
      ls.id = "vqna-gatehide";
      ls.textContent = "html.vqna-showing #authGate,html.vqna-showing #firstLaunchOverlay,html.vqna-showing #vqbFlow{visibility:hidden !important;}";
      (document.head || document.documentElement).appendChild(ls);
    }
    (document.body || document.documentElement).appendChild(host);
  }

  /* ── show / hide / route ── */
  var shown = false, dismissed = false;
  /* ★ 設定から 開いた とき だけ 立つ。畳むのは **人が 閉じた とき**だけ。 */
  var 自分で開いた = false;
  function decideEntryPhase() {
    var seen = false;
    try { seen = localStorage.getItem("vq.newauth.introSeen.v1") === "1"; } catch (e) { }
    if (!seen) { S.phase = "splash"; try { localStorage.setItem("vq.newauth.introSeen.v1", "1"); } catch (e) { } }
    else { S.phase = "welcome"; }
  }
  function show() {
    ensureHost();
    if (shown) return;
    shown = true;
    if (S.phase !== "auth") decideEntryPhase();
    host.style.display = "block";
    host.setAttribute("aria-hidden", "false");
    render();
    /* 表示中は旧 #authGate を確実に隠す（html クラスのみ・body には触らない＝自Observerを起こさない） */
    try { document.documentElement.classList.add("vqna-showing"); } catch (e) { }
  }
  function hide() {
    if (!host) return;
    /* 鍵が開く演出の最中は畳まない。畳むのは演出が終わってから。 */
    if (unlocking) return;
    /* メールの登録が済むまでは閉じさせない（A 方式）。 */
    if (emailGateOn) return;
    shown = false;
    host.style.display = "none";
    host.setAttribute("aria-hidden", "true");
    try { document.documentElement.classList.remove("vqna-showing"); } catch (e) { }
    clearInterval(cooldownTimer); clearTimeout(splashTimer);
  }
  function dismiss() { dismissed = true; hide(); }   // ユーザーが明示的に閉じる（ゲートが開いていても戻さない）
  /* 未認証で本体が出す画面はすべて対象: 旧初回ウェルカム(first-launch-open) と 旧authゲート(auth-gate-open) */
  function preAuth() { var c = document.body && document.body.classList; return !!(c && (c.contains("auth-gate-open") || c.contains("first-launch-open"))); }
  function gateOpen() { return document.body.classList.contains("auth-gate-open"); }
  function resetFlow() {   // 次にゲートが開いたとき Welcome から始められるよう初期化
    S.phase = "welcome"; S.view = "login"; S.dir = "fwd"; S.stack = [];
    S.li = { grade: S.li.grade || "h3", id: "", pw: "", remember: true, caps: false, busy: false, err: null, fails: 0 };
    S.su = newSu(); S.reg = newReg(); stopRegTimers();
    S.rs = newRs();
    S.otp = { code: "", invalid: false, busy: false, cooldown: 30, ctx: "reset" };
    S.np = { pw: "", pw2: "", busy: false };
  }
  /* 再設定の状態は 4 段ぶんある。畳んで開き直しても形が崩れないよう、1 か所で作る。 */
  function newRs() {
    return { step: "who", grade: "h3", id: "", methods: null, method: "",
      challengeId: "", maskedEmail: "", code: "", resetToken: "",
      pin: "", pw: "", pw2: "", busy: false, err: null, ok: false,
      resendsRemaining: 3, attemptsRemaining: 5, resendIn: 0 };
  }
  function newEm() {
    return { step: "why", email: "", challengeId: "", maskedEmail: "", code: "",
      busy: false, err: null, resendIn: 0, resendsRemaining: 3, attemptsRemaining: 5 };
  }
  var hideTimer = null;
  function refresh() {
    /* 新Auth は旗(bloom/legacy)に無関係で常にフロントドア。旧初回ウェルカムも旧ゲートも二度と表に出さない。 */
    if (emailGateOn) { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } return; }
    /* ★ 設定から **自分の意思で** 開いた 画面（パスワード変更・Google と結ぶ）は
       この 見張りの 持ちものでは ない。
       ここを 通すと、ログイン中は preAuth() が false なので 500ms 後に 畳まれ、
       「開いて すぐ 消えちゃう 一瞬で」に なる（訴えの とおり・実測で 再現）。 */
    if (自分で開いた) { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } return; }
    if (preAuth()) {                                // 未認証UI(初回ウェルカム or ゲート)が出ている → 最前面へ
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (!dismissed) show();
      return;
    }
    if (!shown) { dismissed = false; return; }      // 既に収納済み → 何もしない
    /* 未認証UIが消えた → 収納。ただし first-launch→gate の一瞬の隙間で点滅しないよう 500ms 猶予 */
    if (emailGateOn) return;                        // メール登録が済むまでは畳まない
    if (!hideTimer) hideTimer = setTimeout(function () {
      hideTimer = null;
      if (emailGateOn) return;
      if (!preAuth()) { dismissed = false; resetFlow(); hide(); }
    }, 500);
  }

  /* ── public inspection hook（8状態すべて確認用） ── */
  window.__vqAuthShow = function (view) {
    dismissed = false; ensureHost(); show(); toAuth(view || "login");
  };
  window.__vqAuthHome = function () { S.phase = "welcome"; render(); };
  /* 設定画面から、自分の意思でメールアドレスを登録／変更する。
     こちらは足止めではないので、閉じられる（ログイン後の必須とは別）。 */
  window.__vqEmailSetup = function () {
    if (!authToken()) return false;
    S.em = newEm();
    dismissed = false;
    ensureHost();
    if (!shown) show();
    S.phase = "auth"; S.view = "emailSetup"; S.stack = [];
    emailGateOn = false;                 // 任意なので閉じられる
    emailOptional = true;
    render();
    return true;
  };
  /* ★ 設定画面から「パスワードを変える」。
     ログインした まま 開く（emailSetup と 同じ 作法）。誰の アカウントかは
     /api/auth/me で 取る（学年と ログインID が サーバの 契約に 要る）。 */
  window.__vqPasswordChange = function () {
    var t = authToken();
    if (!t) return false;
    S.cp = newCp();
    dismissed = false;
    ensureHost();
    if (!shown) show();
    emailGateOn = false; emailOptional = true;   /* 足止めでは ない。閉じられる */
    自分で開いた = true;
    S.phase = "auth"; S.view = "changePw"; S.stack = [];
    render();
    fetch(apiBase() + "/api/auth/me", { headers: { Authorization: "Bearer " + t } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var u = (d && d.user) || {};
        S.cp.grade = String(u.gradePrefix || "").toUpperCase();
        S.cp.id = String(u.nickname || "");
        if (!S.cp.grade || !S.cp.id) S.cp.err = "アカウントが分かりませんでした。開き直してください。";
        if (S.view === "changePw") render();
      })
      .catch(function () {
        S.cp.err = "サーバーへつながりませんでした。";
        if (S.view === "changePw") render();
      });
    return true;
  };
  /* ★ 設定画面から「Google と結ぶ」。 */
  window.__vqSocialLink = function (providerKey) {
    if (!authToken()) return false;
    S.sl = newSl();
    if (providerKey) {
      S.sl.provider = providerKey;
      /* 名前は SOC の 一覧から 引く（「Google で続ける」の 前半だけ 使う）。 */
      var 元 = null;
      for (var i9 = 0; i9 < SOC.length; i9++) if (SOC[i9].key === providerKey) 元 = SOC[i9];
      if (元) S.sl.label = String(元.label).replace(/\s*で続ける$/, "");
    }
    dismissed = false;
    ensureHost();
    if (!shown) show();
    emailGateOn = false; emailOptional = true;
    自分で開いた = true;
    S.phase = "auth"; S.view = "socialLink"; S.stack = [];
    render();
    return true;
  };

  /* 鍵が開く演出だけを試す（見た目の確認用。実際のログインは通らない） */
  window.__vqAuthUnlock = function () {
    dismissed = false; ensureHost(); show(); toAuth("login");
    setTimeout(function () { playUnlock(function () { hide(); }); }, 120);
  };

  /* ── boot ── */
  function boot() {
    ensureHost();
    /* ポップアップが使えずリダイレクトへ回った場合、戻ってきたここで受け取る。 */
    try { socialResumeRedirect(); } catch (e) { }
    // 本体のゲート開閉（body.auth-gate-open）と UI フラグを監視して追従
    try {
      new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["data-vq-ui"] });
    } catch (e) { }
    refresh();
    /* すでに入っている人（ゲートが出ない人）にも、版が上がったら一度だけ通ってもらう。 */
    setTimeout(function () {
      if (emailGateOn || preAuth()) return;
      if (!authToken()) return;
      startEmailGateProbe().then(function (needs) {
        if (needs && !preAuth() && !emailGateOn) openEmailGate();
      });
    }, 1200);
    /* 取りこぼし保険: 起動直後のゲート open を Observer と二重で確実に拾う（~20秒） */
    var tries = 0, iv = setInterval(function () { refresh(); if (++tries > 80) clearInterval(iv); }, 250);
    // フラグ切替に連動（レガシーでも Auth は新UIのまま）
    var _set = window.__vqSetUI;
    if (_set) window.__vqSetUI = function (v) { var r = _set(v); setTimeout(refresh, 0); return r; };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

