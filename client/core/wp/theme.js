/* ══════════════════════════════════════════════════════════════════════
   core/wp/theme.js — Workplace 4 画面 **共通**の 見た目の型（VQWPTHEME）

   ★ 訴え（2026-08-28）
     「システムデザインも、もっと 型のバリエーションを 増やしたり、
       文字の フォントが、やはり まだ 足りないと 感じる」

   ★ 何が 足りなかったか（実測 2026-08-28）
       Slides … 16 種類。中身も 濃い（背景・色・書体・飾り）
       Forms  … **差し色 7 つと 表紙のグラデだけ**。型では ない
       Docs   … **型そのものが 無い**（紙の大きさと 余白だけ）
       Sheets … **型そのものが 無い**
     書体は 123 種類 同梱してあるのに、型が 指していたのは
     sans / mincho / maru / mono の **4 つの 総称だけ**。
     ＝「書体が 足りない」の 正体は **本数ではなく 型が 使っていない**こと。

   ★ ここで するのは 1 つ
     **4 画面が 同じ 型の 表を 見る**。増やすときは ここだけ 触る。
     書体は 実在の id（notosansjp / shipporimincho / …）で 指す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQWPTHEME = root.VQWPTHEME || (root.VQWPTHEME = {});

  /* 型 1 つの 中身
       bg       地色（べた塗り／グラデーション）
       surface  紙・カードの 面
       fg / sub 見出しと 添え字の 色
       accent   差し色（線・数字・図形・ボタン）
       accent2  差し色の 薄いほう（帯・背景・グラフの 2 本目）
       border   罫線
       title/body  書体の id（**実在するもの**）
       decor    背景の 飾り（Slides が 使う）
       rule     見出しの 型（Docs が 使う）… none / bar / underline / number / side
       band     表の 縞（Sheets が 使う）… none / row / col / box
       radius   角の 丸み（px）
   */
  function T(id, name, group, o) {
    return {
      id: id, name: name, group: group,
      bg: o.bg, surface: o.surface || "#ffffff",
      fg: o.fg, sub: o.sub, accent: o.accent, accent2: o.accent2,
      border: o.border || "#e5e7eb",
      title: o.title, body: o.body,
      decor: o.decor || "none", rule: o.rule || "bar", band: o.band || "row",
      radius: o.radius === undefined ? 8 : o.radius,
      dark: !!o.dark
    };
  }

  var LIST = [
    /* ── 定番（教室・仕事で いちばん 使う）───────────────────── */
    T("minimal", "Minimal", "定番", { bg: "#ffffff", fg: "#111827", sub: "#6b7280",
      accent: "#2b70ef", accent2: "#93c5fd", title: "notosansjp", body: "notosansjp",
      decor: "none", rule: "bar", band: "row", radius: 8 }),
    T("paper", "Paper", "定番", { bg: "#faf9f6", surface: "#fffdf8", fg: "#1f2937", sub: "#6b7280",
      accent: "#334155", accent2: "#cbd5e1", border: "#e7e2d8",
      title: "shipporimincho", body: "shipporimincho", decor: "rule", rule: "underline", band: "none", radius: 4 }),
    T("modern", "Modern", "定番", { bg: "#f8fafc", fg: "#0f172a", sub: "#475569",
      accent: "#0f9d58", accent2: "#6ee7b7", title: "zenkakugothicnew", body: "notosansjp",
      decor: "bar", rule: "side", band: "row", radius: 10 }),
    T("editorial", "Editorial", "定番", { bg: "#ffffff", fg: "#18181b", sub: "#52525b",
      accent: "#dc2626", accent2: "#fca5a5", title: "notoserifjp", body: "notosansjp",
      decor: "sidebar", rule: "number", band: "col", radius: 2 }),
    T("report", "Report", "定番", { bg: "#ffffff", fg: "#1e293b", sub: "#64748b",
      accent: "#1d4ed8", accent2: "#bfdbfe", title: "bizudpgothic", body: "bizudpmincho",
      decor: "rule", rule: "number", band: "box", radius: 4 }),
    T("academic", "Academic", "定番", { bg: "#fffefb", surface: "#ffffff", fg: "#1c1917", sub: "#57534e",
      accent: "#7c2d12", accent2: "#fed7aa", border: "#e7e5e4",
      title: "zenoldmincho", body: "notoserifjp", decor: "none", rule: "number", band: "box", radius: 2 }),

    /* ── やわらか（授業・自己紹介・保護者向け）────────────────── */
    T("softblue", "Soft Blue", "やわらか", { bg: "linear-gradient(160deg,#f0f7ff 0%,#e0efff 100%)",
      fg: "#0f2a4a", sub: "#456187", accent: "#2b70ef", accent2: "#bfdbfe", border: "#d5e6fb",
      title: "zenmarugothic", body: "notosansjp", decor: "blob", rule: "bar", band: "row", radius: 14 }),
    T("mint", "Mint", "やわらか", { bg: "linear-gradient(160deg,#f0fdf9 0%,#dcfce7 100%)",
      fg: "#064e3b", sub: "#3f8a72", accent: "#0d9488", accent2: "#99f6e4", border: "#c9ece1",
      title: "mplusrounded1c", body: "notosansjp", decor: "dots", rule: "bar", band: "row", radius: 14 }),
    T("sakura", "Sakura", "やわらか", { bg: "linear-gradient(160deg,#fff5f7 0%,#ffe4ec 100%)",
      fg: "#5b1e35", sub: "#95536c", accent: "#d1467a", accent2: "#fbcfe8", border: "#f6d5e0",
      title: "kiwimaru", body: "notosansjp", decor: "blob", rule: "bar", band: "row", radius: 16 }),
    T("warm", "Warm", "やわらか", { bg: "linear-gradient(160deg,#fffbeb 0%,#fef3c7 100%)",
      fg: "#451a03", sub: "#92400e", accent: "#e8710a", accent2: "#fed7aa", border: "#f2e2bd",
      title: "zenmarugothic", body: "notosansjp", decor: "rule", rule: "bar", band: "row", radius: 12 }),
    T("lavender", "Lavender", "やわらか", { bg: "linear-gradient(160deg,#faf8ff 0%,#ece9fb 100%)",
      fg: "#312a5e", sub: "#6b628f", accent: "#756db3", accent2: "#d5d0ec", border: "#e2ddf3",
      title: "zenkakugothicantique", body: "notosansjp", decor: "blob", rule: "side", band: "row", radius: 14 }),
    T("cream", "Cream", "やわらか", { bg: "#fdfaf3", surface: "#fffdf9", fg: "#3f3222", sub: "#8a7a63",
      accent: "#b4763a", accent2: "#f0dcc0", border: "#ece0cd",
      title: "kleeone", body: "shipporimincho", decor: "none", rule: "underline", band: "none", radius: 8 }),
    T("sky", "Sky", "やわらか", { bg: "linear-gradient(170deg,#f5fbff 0%,#e6f4fe 100%)",
      fg: "#0c3a52", sub: "#4a7891", accent: "#0284c7", accent2: "#bae6fd", border: "#cfe8f7",
      title: "murecho", body: "notosansjp", decor: "dots", rule: "bar", band: "row", radius: 12 }),

    /* ── 濃い（発表・夜の 画面・見せ場）──────────────────────── */
    T("ink", "Ink", "濃い", { bg: "#111827", surface: "#1f2937", fg: "#f9fafb", sub: "#9ca3af",
      accent: "#f472b6", accent2: "#4b5563", border: "#374151",
      title: "notosansjp", body: "notosansjp", decor: "bar", rule: "bar", band: "row", radius: 8, dark: true }),
    T("cosmic", "Cosmic", "濃い", { bg: "radial-gradient(120% 100% at 20% 0%,#1e3a8a 0%,#0b1120 60%)",
      surface: "#111a2e", fg: "#ffffff", sub: "#94a3b8", accent: "#38bdf8", accent2: "#1e40af",
      border: "#1e293b", title: "sora", body: "notosansjp", decor: "stars", rule: "bar", band: "row", radius: 12, dark: true }),
    T("modernPurple", "Modern Purple", "濃い",
      { bg: "linear-gradient(140deg,#2e1065 0%,#5b21b6 60%,#7c3aed 100%)", surface: "#2b1258",
        fg: "#ffffff", sub: "#ddd6fe", accent: "#c4b5fd", accent2: "#8b5cf6", border: "#4c1d95",
        title: "outfit", body: "notosansjp", decor: "blob", rule: "side", band: "row", radius: 14, dark: true }),
    T("forestNight", "Forest Night", "濃い",
      { bg: "linear-gradient(150deg,#052e2b 0%,#064e3b 70%,#065f46 100%)", surface: "#06342f",
        fg: "#ecfdf5", sub: "#99f6e4", accent: "#34d399", accent2: "#065f46", border: "#0f5a4c",
        title: "manrope", body: "notosansjp", decor: "grid", rule: "bar", band: "row", radius: 10, dark: true }),
    T("midnight", "Midnight", "濃い", { bg: "#0b1020", surface: "#141a2e", fg: "#e8ecff", sub: "#8b95bd",
      accent: "#6366f1", accent2: "#312e81", border: "#232a45",
      title: "spacegrotesk", body: "notosansjp", decor: "grid", rule: "number", band: "box", radius: 10, dark: true }),
    T("ember", "Ember", "濃い", { bg: "linear-gradient(150deg,#1c0a05 0%,#431407 70%,#7c2d12 100%)",
      surface: "#2a0f07", fg: "#ffedd5", sub: "#fdba74", accent: "#fb923c", accent2: "#9a3412",
      border: "#5a2110", title: "oswald", body: "notosansjp", decor: "bar", rule: "bar", band: "row", radius: 8, dark: true }),
    T("carbon", "Carbon", "濃い", { bg: "#18181b", surface: "#27272a", fg: "#fafafa", sub: "#a1a1aa",
      accent: "#facc15", accent2: "#3f3f46", border: "#3f3f46",
      title: "archivo", body: "notosansjp", decor: "grid", rule: "side", band: "col", radius: 4, dark: true }),

    /* ── 落ち着き（議事録・提出物）──────────────────────────── */
    T("slate", "Slate", "落ち着き", { bg: "#1f2937", surface: "#273445", fg: "#f3f4f6", sub: "#9ca3af",
      accent: "#60a5fa", accent2: "#374151", border: "#3b4759",
      title: "notosansjp", body: "notosansjp", decor: "grid", rule: "bar", band: "row", radius: 8, dark: true }),
    T("mono", "Mono", "落ち着き", { bg: "#fafafa", surface: "#ffffff", fg: "#0a0a0a", sub: "#525252",
      accent: "#0a0a0a", accent2: "#d4d4d4", border: "#e5e5e5",
      title: "ibmplexmono", body: "ibmplexsansjp", decor: "rule", rule: "underline", band: "none", radius: 2 }),
    T("stone", "Stone", "落ち着き", { bg: "#f5f5f4", surface: "#ffffff", fg: "#1c1917", sub: "#78716c",
      accent: "#57534e", accent2: "#d6d3d1", border: "#e7e5e4",
      title: "bizudpgothic", body: "bizudpgothic", decor: "none", rule: "side", band: "box", radius: 6 }),
    T("linen", "Linen", "落ち着き", { bg: "#f7f5f0", surface: "#fffefb", fg: "#26241f", sub: "#6f6a5f",
      accent: "#6b7f5c", accent2: "#d6dfc9", border: "#e3ded2",
      title: "zenantique", body: "shipporimincho", decor: "rule", rule: "underline", band: "none", radius: 4 }),

    /* ── はっきり（文化祭・掲示・見出し勝負）─────────────────── */
    T("bold", "Bold", "はっきり", { bg: "#fef08a", surface: "#fffbe6", fg: "#1c1917", sub: "#57534e",
      accent: "#dc2626", accent2: "#fbbf24", border: "#eadf9a",
      title: "delagothicone", body: "notosansjp", decor: "corner", rule: "bar", band: "row", radius: 6 }),
    T("gradient", "Gradient", "はっきり",
      { bg: "linear-gradient(120deg,#f97316 0%,#ec4899 50%,#8b5cf6 100%)", surface: "#ffffff",
        fg: "#ffffff", sub: "#fce7f3", accent: "#ffffff", accent2: "#fbcfe8", border: "#f9a8d4",
        title: "anton", body: "notosansjp", decor: "none", rule: "bar", band: "row", radius: 16, dark: true }),
    T("pop", "Pop", "はっきり", { bg: "#fff1f2", surface: "#ffffff", fg: "#4c0519", sub: "#9f1239",
      accent: "#e11d48", accent2: "#fecdd3", border: "#fbd5da",
      title: "rampartone", body: "mplusrounded1c", decor: "dots", rule: "bar", band: "row", radius: 18 }),
    T("neon", "Neon", "はっきり", { bg: "#0a0a0a", surface: "#141414", fg: "#f0fdf4", sub: "#86efac",
      accent: "#22c55e", accent2: "#14532d", border: "#166534",
      title: "bebasneue", body: "notosansjp", decor: "grid", rule: "bar", band: "col", radius: 4, dark: true }),
    T("marker", "Marker", "はっきり", { bg: "#fffef7", surface: "#ffffff", fg: "#1f2937", sub: "#6b7280",
      accent: "#f59e0b", accent2: "#fde68a", border: "#eee5c8",
      title: "permanentmarker", body: "yomogi", decor: "corner", rule: "underline", band: "row", radius: 10 }),

    /* ── 手書き・やさしい（小中学生向け・自由研究）──────────── */
    T("note", "Note", "手書き", { bg: "#fdfdf5", surface: "#ffffff", fg: "#2b2b2b", sub: "#7a7a6d",
      accent: "#4f9d6b", accent2: "#cfe8d8", border: "#e6e6d5",
      title: "yomogi", body: "yomogi", decor: "rule", rule: "underline", band: "row", radius: 10 }),
    T("crayon", "Crayon", "手書き", { bg: "#fffaf0", surface: "#ffffff", fg: "#3b2f18", sub: "#8a7856",
      accent: "#ef6c4d", accent2: "#ffd9a0", border: "#f0e2c8",
      title: "hachimarupop", body: "mplusrounded1c", decor: "dots", rule: "bar", band: "row", radius: 18 }),
    T("chalk", "Chalk", "手書き", { bg: "#1f3b32", surface: "#26463c", fg: "#f4fff8", sub: "#a8ceb9",
      accent: "#ffe9a8", accent2: "#3c6155", border: "#3a5b4f",
      title: "yuseimagic", body: "zenmarugothic", decor: "none", rule: "underline", band: "none", radius: 6, dark: true }),
    T("kids", "Kids", "手書き", { bg: "linear-gradient(160deg,#fffbe9 0%,#e9fbff 100%)", surface: "#ffffff",
      fg: "#2c3e50", sub: "#6b8496", accent: "#ff8a3d", accent2: "#ffd8b8", border: "#e7eef2",
      title: "mochiypopone", body: "kosugimaru", decor: "blob", rule: "bar", band: "row", radius: 20 }),

    /* ── 欧文よりの 見せ方（英語の 授業・ポートフォリオ）──────── */
    T("swiss", "Swiss", "欧文", { bg: "#ffffff", surface: "#ffffff", fg: "#000000", sub: "#666666",
      accent: "#ff2d20", accent2: "#ffd6d1", border: "#e0e0e0",
      title: "archivoblack", body: "inter", decor: "bar", rule: "number", band: "col", radius: 0 }),
    T("serifBook", "Serif Book", "欧文", { bg: "#fdfcf9", surface: "#ffffff", fg: "#1a1a1a", sub: "#5c5c5c",
      accent: "#8b5a2b", accent2: "#e8d8c3", border: "#e6e0d6",
      title: "playfairdisplay", body: "ebgaramond", decor: "rule", rule: "underline", band: "none", radius: 2 }),
    T("techDoc", "Tech Doc", "欧文", { bg: "#fbfcfd", surface: "#ffffff", fg: "#0f172a", sub: "#64748b",
      accent: "#0ea5e9", accent2: "#bae6fd", border: "#e2e8f0",
      title: "spacegrotesk", body: "ibmplexsansjp", decor: "grid", rule: "side", band: "box", radius: 6 }),
    T("magazine", "Magazine", "欧文", { bg: "#ffffff", surface: "#ffffff", fg: "#111111", sub: "#555555",
      accent: "#111111", accent2: "#f5f5f5", border: "#dddddd",
      title: "fraunces", body: "notosansjp", decor: "sidebar", rule: "number", band: "col", radius: 0 }),
    T("poster", "Poster", "欧文", { bg: "#111827", surface: "#1b2434", fg: "#ffffff", sub: "#cbd5e1",
      accent: "#fde047", accent2: "#1f2937", border: "#334155",
      title: "alfaslabone", body: "notosansjp", decor: "corner", rule: "bar", band: "row", radius: 4, dark: true })
  ];

  var 索 = {};
  LIST.forEach(function (t) { 索[t.id] = t; });

  function 一覧() { return LIST.slice(); }
  function 束ごと() {
    var g = {}, 順 = [];
    LIST.forEach(function (t) {
      if (!g[t.group]) { g[t.group] = []; 順.push(t.group); }
      g[t.group].push(t);
    });
    return 順.map(function (k) { return { group: k, items: g[k] }; });
  }
  function 取る(id) { return 索[String(id || "")] || 索.minimal; }
  function ある(id) { return !!索[String(id || "")]; }

  /* ── 型を CSS 変数へ ───────────────────────────────────────────
     4 画面とも、この 変数だけを 見れば 見た目が そろう。
     書体は id なので、呼び側が U.fontCss(id) で 実体を 読ませること。 */
  function 変数(t) {
    t = 取る(t && t.id ? t.id : t);
    return {
      "--wpt-bg": t.bg, "--wpt-surface": t.surface, "--wpt-fg": t.fg,
      "--wpt-sub": t.sub, "--wpt-accent": t.accent, "--wpt-accent2": t.accent2,
      "--wpt-border": t.border, "--wpt-radius": t.radius + "px"
    };
  }
  function 変数の文(t) {
    var v = 変数(t), 出 = [];
    for (var k in v) 出.push(k + ":" + v[k]);
    return 出.join(";");
  }

  VQWPTHEME.一覧 = 一覧;
  VQWPTHEME.束ごと = 束ごと;
  VQWPTHEME.取る = 取る;
  VQWPTHEME.ある = ある;
  VQWPTHEME.変数 = 変数;
  VQWPTHEME.変数の文 = 変数の文;
  VQWPTHEME.既定 = "minimal";
})(typeof globalThis !== "undefined" ? globalThis : this);
