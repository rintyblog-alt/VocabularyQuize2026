/* ══════════════════════════════════════════════════════════════════════
   core/feed/art.js — お知らせに 添える 絵（VQART）

   ★ 訴え（2026-08-20）「あらかじめ SVG を 用意しておいて、それと一緒に
     feed に 投稿できるようにしよう。何十種類も 用意しておいて。
     メッセージ本文の 下に その SVG を 表示させる」

   ★ 決めごと
     ・**サーバは 鍵だけ 持つ**（core の 48 個の 名前）。実物は ここ。
       生の SVG を DB へ 入れると 投稿 1 件が 何 KB にも なる。
     ・外の 画像を 読まない。文字も 入れない（多言語で 崩れるため）。
     ・**自分の 背景を 持つ**。明るい画面でも 暗い画面でも そのまま 出せる。
     ・同じ お知らせなら 毎回 同じ 絵（鍵と 種から 決める）。

   ★ 使い方
       VQART.名前()            → 48 個の 鍵の 並び（サーバと 同じ順）
       VQART.作る(鍵, 種)      → <svg …>…</svg> の 文字列
       VQART.色の数 / VQART.かず()

   ★ 気をつけること
     Feed は shadow root の 中なので、外の CSS は 届かない。
     色は すべて この中で 決め打ちにする（変数に 頼らない）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQART = root.VQART || (root.VQART = {});

  var W = 800, H = 240;

  /* ── 鍵。**サーバ（worker.js の NEWS_ART_KEYS）と 同じ順**。 ──────── */
  var 鍵 = [
    "aurora", "ripple", "bloom", "comet", "grid", "hill",
    "lattice", "orbit", "petal", "prism", "pulse", "ridge",
    "sprout", "stack", "stream", "sun", "tide", "wave",
    "weave", "zen", "arc", "beam", "bubble", "canopy",
    "cascade", "cloud", "confetti", "crest", "dawn", "dot",
    "drift", "dune", "echo", "ember", "fern", "flow",
    "fold", "frost", "garden", "glow", "harbor", "ink",
    "kite", "lantern", "leaf", "meadow", "mesh", "mist"
  ];

  /* ── 色の組（12）。どれも 背景と 主色の 差を 3 以上 取ってある。 ──── */
  var 色たち = [
    { 名: "夜明け",   bg: "#2A2340", a: "#F2B36B", b: "#E8748C", c: "#8E7BD8", ink: "#F6F2FF" },
    { 名: "若葉",     bg: "#F2F7F0", a: "#4E8C5A", b: "#8FBF6A", c: "#2F6B49", ink: "#20361F" },
    { 名: "藤",       bg: "#F4F1FB", a: "#6B5BC4", b: "#A492E6", c: "#4B3F91", ink: "#241F3A" },
    { 名: "石",       bg: "#F3F4F6", a: "#4B5563", b: "#93A0AF", c: "#2C3542", ink: "#1B2027" },
    { 名: "深緑",     bg: "#12241C", a: "#5FBF8A", b: "#2E7D5A", c: "#A8E6C0", ink: "#EAF7F0" },
    { 名: "苺",       bg: "#FDF1F3", a: "#C2455F", b: "#E88BA0", c: "#8E2A44", ink: "#3A1620" },
    { 名: "砂",       bg: "#FAF5EC", a: "#B4813C", b: "#DCB878", c: "#7C5320", ink: "#31240F" },
    { 名: "海",       bg: "#EDF4FA", a: "#2C6F9E", b: "#6FA8C9", c: "#1B4C6E", ink: "#12242F" },
    { 名: "夜",       bg: "#131218", a: "#8E85E8", b: "#4E4A7A", c: "#C9C2FF", ink: "#F1EFF6" },
    { 名: "炭",       bg: "#1B1B1E", a: "#D9D5CC", b: "#7C7A74", c: "#F0EDE6", ink: "#F4F2ED" },
    { 名: "梅",       bg: "#F7EFF6", a: "#8E3F79", b: "#C287B4", c: "#5E2450", ink: "#2C1526" },
    { 名: "熾火",     bg: "#241713", a: "#E8783C", b: "#9C4526", c: "#F5B98C", ink: "#FBEFE7" }
  ];

  /* ── 種から 数を 作る（毎回 同じ）───────────────────────────── */
  function たね(t) {
    var h = 2166136261, s = String(t == null ? "" : t);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function さいころ(n) {
    var x = n >>> 0;
    return function () {
      x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }
  function 丸(v) { return Math.round(v * 100) / 100; }

  /* ── 部品 ───────────────────────────────────────────────────── */
  function 円(x, y, r, c, o) {
    return '<circle cx="' + 丸(x) + '" cy="' + 丸(y) + '" r="' + 丸(r) + '" fill="' + c + '"'
      + (o === undefined ? "" : ' opacity="' + o + '"') + "/>";
  }
  function 輪(x, y, r, c, w, o) {
    return '<circle cx="' + 丸(x) + '" cy="' + 丸(y) + '" r="' + 丸(r) + '" fill="none" stroke="' + c
      + '" stroke-width="' + (w || 3) + '"' + (o === undefined ? "" : ' opacity="' + o + '"') + "/>";
  }
  function 角(x, y, w, h, c, r, o) {
    return '<rect x="' + 丸(x) + '" y="' + 丸(y) + '" width="' + 丸(w) + '" height="' + 丸(h)
      + '" rx="' + (r || 0) + '" fill="' + c + '"' + (o === undefined ? "" : ' opacity="' + o + '"') + "/>";
  }
  function 線(d, c, w, o) {
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 3)
      + '" stroke-linecap="round" stroke-linejoin="round"'
      + (o === undefined ? "" : ' opacity="' + o + '"') + "/>";
  }
  function 面(d, c, o) {
    return '<path d="' + d + '" fill="' + c + '"' + (o === undefined ? "" : ' opacity="' + o + '"') + "/>";
  }
  /* なだらかな 山なりの 線（左から 右へ） */
  function 波(y, 振, 数, ずれ) {
    var d = "M0 " + 丸(y), 幅 = W / 数;
    for (var i = 0; i < 数; i++) {
      var x0 = i * 幅, 上 = (i % 2 === 0) ? -振 : 振;
      d += " Q" + 丸(x0 + 幅 / 2) + " " + 丸(y + 上 + (ずれ || 0)) + " " + 丸(x0 + 幅) + " " + 丸(y);
    }
    return d;
  }

  /* ══ 48 の 絵 ═══════════════════════════════════════════════════
     どれも 引数は (P, r) だけ。P = 色の組、r = さいころ。 */
  var 絵 = {
    aurora: function (P, r) {
      var o = "";
      for (var i = 0; i < 5; i++)
        o += 線(波(70 + i * 26, 22 + r() * 16, 3 + (i % 2), i * 4), i % 2 ? P.b : P.a, 6 - i * 0.6, 0.85 - i * 0.12);
      for (var j = 0; j < 14; j++) o += 円(r() * W, r() * 70, 1.4 + r() * 1.6, P.c, 0.8);
      return o;
    },
    ripple: function (P, r) {
      var cx = 220 + r() * 360, cy = H / 2, o = "";
      for (var i = 1; i <= 9; i++) o += 輪(cx, cy, i * 15, i % 2 ? P.a : P.b, 2.4, 1 - i * 0.09);
      return o + 円(cx, cy, 9, P.c);
    },
    bloom: function (P, r) {
      var cx = W / 2, cy = H / 2 + 8, o = "", n = 9;
      for (var i = 0; i < n; i++) {
        var t = (i / n) * Math.PI * 2, R = 62 + r() * 22;
        o += '<ellipse cx="' + 丸(cx + Math.cos(t) * 34) + '" cy="' + 丸(cy + Math.sin(t) * 34)
          + '" rx="' + 丸(R) + '" ry="20" fill="' + (i % 2 ? P.a : P.b) + '" opacity="0.5"'
          + ' transform="rotate(' + 丸((t * 180) / Math.PI) + ' ' + 丸(cx) + ' ' + 丸(cy) + ')"/>';
      }
      return o + 円(cx, cy, 20, P.c);
    },
    comet: function (P, r) {
      var o = "";
      for (var i = 0; i < 5; i++) {
        var x = 90 + i * 150 + r() * 40, y = 40 + r() * 150;
        o += 線("M" + 丸(x - 78) + " " + 丸(y + 40) + " L" + 丸(x) + " " + 丸(y), P.b, 3, 0.55)
          + 円(x, y, 7 + r() * 6, P.a);
      }
      return o;
    },
    grid: function (P, r) {
      var o = "";
      for (var x = 40; x < W; x += 48) o += 線("M" + x + " 24 L" + x + " " + (H - 24), P.b, 1.4, 0.5);
      for (var y = 32; y < H; y += 40) o += 線("M24 " + y + " L" + (W - 24) + " " + y, P.b, 1.4, 0.5);
      for (var i = 0; i < 7; i++) o += 角(40 + Math.floor(r() * 15) * 48, 32 + Math.floor(r() * 4) * 40, 48, 40, P.a, 4, 0.85);
      return o;
    },
    hill: function (P, r) {
      return 面("M0 " + H + " L0 170 Q200 " + 丸(90 + r() * 30) + " 400 160 Q600 " + 丸(200 + r() * 20) + " " + W + " 130 L" + W + " " + H + " Z", P.b, 0.8)
        + 面("M0 " + H + " L0 200 Q240 150 480 195 Q640 220 " + W + " 178 L" + W + " " + H + " Z", P.a, 0.9)
        + 円(120 + r() * 90, 62, 26, P.c, 0.9);
    },
    lattice: function (P, r) {
      var o = "";
      for (var i = -6; i < 22; i++) {
        o += 線("M" + i * 44 + " 0 L" + (i * 44 + 240) + " " + H, P.a, 2, 0.55);
        o += 線("M" + i * 44 + " 0 L" + (i * 44 - 240) + " " + H, P.b, 2, 0.4);
      }
      return o + 角(0, 0, W, H, P.bg, 0, 0.12);
    },
    orbit: function (P, r) {
      var cx = W / 2, cy = H / 2, o = 円(cx, cy, 22, P.a);
      for (var i = 1; i <= 4; i++) {
        var rx = i * 62, ry = i * 22 + 8, t = r() * Math.PI * 2;
        o += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry
          + '" fill="none" stroke="' + P.b + '" stroke-width="2" opacity="' + (0.8 - i * 0.13) + '"/>';
        o += 円(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, 6 + r() * 4, P.c);
      }
      return o;
    },
    petal: function (P, r) {
      var o = "";
      for (var i = 0; i < 16; i++) {
        var x = 40 + r() * (W - 80), y = 20 + r() * (H - 40), s = 10 + r() * 16;
        o += 面("M" + 丸(x) + " " + 丸(y) + " q" + 丸(s) + " " + 丸(-s) + " " + 丸(s * 2) + " 0 q" + 丸(-s) + " " + 丸(s * 1.5) + " " + 丸(-s * 2) + " 0 Z",
          i % 3 === 0 ? P.c : (i % 2 ? P.a : P.b), 0.75);
      }
      return o;
    },
    prism: function (P, r) {
      var o = "";
      for (var i = 0; i < 7; i++) {
        var x = 70 + i * 96;
        o += 面("M" + x + " 200 L" + (x + 46) + " " + 丸(40 + r() * 70) + " L" + (x + 92) + " 200 Z",
          i % 3 === 0 ? P.c : (i % 2 ? P.a : P.b), 0.85);
      }
      return o;
    },
    pulse: function (P, r) {
      var d = "M0 120", x = 0;
      while (x < W) {
        var w = 40 + r() * 40, h = (r() > 0.55 ? -1 : 1) * (18 + r() * 60);
        d += " L" + 丸(x + w * 0.3) + " 120 L" + 丸(x + w * 0.5) + " " + 丸(120 + h) + " L" + 丸(x + w * 0.7) + " 120";
        x += w;
      }
      return 線(d + " L" + W + " 120", P.a, 4) + 線("M0 120 L" + W + " 120", P.b, 1.4, 0.5);
    },
    ridge: function (P, r) {
      var o = "";
      for (var i = 0; i < 4; i++) {
        var d = "M0 " + (110 + i * 26), x = 0;
        while (x < W) { var w = 60 + r() * 70; d += " L" + 丸(x + w / 2) + " " + 丸(110 + i * 26 - (20 + r() * 40)) + " L" + 丸(x + w) + " " + (110 + i * 26); x += w; }
        o += 面(d + " L" + W + " " + H + " L0 " + H + " Z", i % 2 ? P.b : P.a, 0.32 + i * 0.16);
      }
      return o;
    },
    sprout: function (P, r) {
      var o = "";
      for (var i = 0; i < 6; i++) {
        var x = 80 + i * 128 + r() * 24, h = 70 + r() * 80;
        o += 線("M" + 丸(x) + " " + H + " L" + 丸(x) + " " + 丸(H - h), P.c, 4)
          + 面("M" + 丸(x) + " " + 丸(H - h) + " q" + 丸(-34) + " " + 丸(-10) + " " + 丸(-30) + " " + 丸(-34) + " q26 4 30 34 Z", P.a, 0.9)
          + 面("M" + 丸(x) + " " + 丸(H - h + 20) + " q34 -10 30 -34 q-26 4 -30 34 Z", P.b, 0.9);
      }
      return o;
    },
    stack: function (P, r) {
      var o = "", y = H - 26;
      for (var i = 0; i < 7; i++) {
        var w = 520 - i * 60, x = (W - w) / 2 + (r() - 0.5) * 26;
        o += 角(x, y - i * 27, w, 20, i % 3 === 0 ? P.c : (i % 2 ? P.a : P.b), 6, 0.92);
      }
      return o;
    },
    stream: function (P, r) {
      var o = "";
      for (var i = 0; i < 7; i++) o += 線(波(38 + i * 28, 12 + r() * 10, 4, 0), i % 2 ? P.a : P.b, 3, 0.8);
      return o;
    },
    sun: function (P, r) {
      var cx = W / 2, cy = 150, o = "";
      for (var i = 0; i < 24; i++) {
        var t = (i / 24) * Math.PI * 2, R1 = 62, R2 = 84 + r() * 34;
        o += 線("M" + 丸(cx + Math.cos(t) * R1) + " " + 丸(cy + Math.sin(t) * R1)
          + " L" + 丸(cx + Math.cos(t) * R2) + " " + 丸(cy + Math.sin(t) * R2), P.b, 3, 0.8);
      }
      return o + 円(cx, cy, 50, P.a);
    },
    tide: function (P, r) {
      return 面(波(120, 26, 3, 0) + " L" + W + " " + H + " L0 " + H + " Z", P.a, 0.85)
        + 面(波(158, 20, 4, 0) + " L" + W + " " + H + " L0 " + H + " Z", P.c, 0.75)
        + 円(140 + r() * 90, 62, 24, P.b, 0.9);
    },
    wave: function (P, r) {
      var o = "";
      for (var i = 0; i < 9; i++) o += 線(波(24 + i * 24, 16, 2 + (i % 3), i), i % 2 ? P.a : P.b, 2.6, 0.85);
      return o;
    },
    weave: function (P, r) {
      var o = "";
      for (var x = 0; x < W; x += 40) o += 角(x, 0, 20, H, P.a, 0, 0.5);
      for (var y = 0; y < H; y += 40) o += 角(0, y, W, 20, P.b, 0, 0.5);
      return o;
    },
    zen: function (P, r) {
      var cx = 300 + r() * 200, o = 輪(cx, 118, 78, P.a, 9, 0.95);
      o += 線("M120 200 L" + (W - 120) + " 200", P.b, 3, 0.7);
      o += 円(cx + 110, 66, 12, P.c);
      return o;
    },
    arc: function (P, r) {
      var o = "";
      for (var i = 0; i < 6; i++) {
        var R = 40 + i * 30;
        o += 線("M" + 丸(W / 2 - R) + " 210 A" + R + " " + R + " 0 0 1 " + 丸(W / 2 + R) + " 210", i % 2 ? P.a : P.b, 5, 0.9 - i * 0.1);
      }
      return o;
    },
    beam: function (P, r) {
      var o = "";
      for (var i = 0; i < 9; i++) {
        var w = 12 + r() * 40;
        o += 面("M" + 丸(360 + r() * 80) + " 0 L" + 丸(i * 96) + " " + H + " L" + 丸(i * 96 + w) + " " + H + " Z",
          i % 2 ? P.a : P.b, 0.55);
      }
      return o;
    },
    bubble: function (P, r) {
      var o = "";
      for (var i = 0; i < 20; i++) {
        var x = r() * W, y = r() * H, R = 6 + r() * 34;
        o += 輪(x, y, R, i % 3 === 0 ? P.c : (i % 2 ? P.a : P.b), 2.4, 0.85);
      }
      return o;
    },
    canopy: function (P, r) {
      var o = 角(0, 190, W, 50, P.c, 0, 0.35);
      for (var i = 0; i < 6; i++) {
        var x = 70 + i * 130 + r() * 20;
        o += 線("M" + 丸(x) + " 210 L" + 丸(x) + " 130", P.c, 6)
          + 円(x, 108, 40 + r() * 18, i % 2 ? P.a : P.b, 0.88);
      }
      return o;
    },
    cascade: function (P, r) {
      var o = "";
      for (var i = 0; i < 6; i++) {
        var y = 24 + i * 34;
        o += 角(30 + i * 46, y, W - 100 - i * 92, 20, i % 2 ? P.a : P.b, 10, 0.9);
      }
      return o;
    },
    cloud: function (P, r) {
      var o = "";
      for (var i = 0; i < 4; i++) {
        var x = 110 + i * 190 + r() * 30, y = 60 + r() * 90, s = 0.7 + r() * 0.6;
        o += 円(x, y, 34 * s, P.a, 0.9) + 円(x + 34 * s, y + 6 * s, 26 * s, P.a, 0.9)
          + 円(x - 30 * s, y + 8 * s, 22 * s, P.a, 0.9) + 円(x + 8 * s, y - 20 * s, 24 * s, P.b, 0.9);
      }
      return o;
    },
    confetti: function (P, r) {
      var o = "";
      for (var i = 0; i < 46; i++) {
        var x = r() * W, y = r() * H, w = 6 + r() * 12, h = 4 + r() * 8;
        o += '<rect x="' + 丸(x) + '" y="' + 丸(y) + '" width="' + 丸(w) + '" height="' + 丸(h)
          + '" rx="2" fill="' + (i % 3 === 0 ? P.c : (i % 2 ? P.a : P.b)) + '" opacity="0.92"'
          + ' transform="rotate(' + 丸(r() * 360) + ' ' + 丸(x) + ' ' + 丸(y) + ')"/>';
      }
      return o;
    },
    crest: function (P, r) {
      var cx = W / 2;
      return 面("M" + cx + " 28 L" + (cx + 86) + " 74 L" + (cx + 86) + " 156 L" + cx + " 208 L" + (cx - 86) + " 156 L" + (cx - 86) + " 74 Z", P.a, 0.95)
        + 面("M" + cx + " 62 L" + (cx + 52) + " 90 L" + (cx + 52) + " 144 L" + cx + " 176 L" + (cx - 52) + " 144 L" + (cx - 52) + " 90 Z", P.bg, 0.9)
        + 線("M" + (cx - 26) + " 118 L" + (cx - 6) + " 138 L" + (cx + 30) + " 98", P.c, 8);
    },
    dawn: function (P, r) {
      var o = 面("M0 200 L" + W + " 200 L" + W + " " + H + " L0 " + H + " Z", P.c, 0.85);
      for (var i = 6; i >= 1; i--) o += 円(W / 2, 200, i * 26, P.a, 0.14 + (7 - i) * 0.06);
      return o + 円(W / 2, 200, 34, P.b);
    },
    dot: function (P, r) {
      var o = "";
      for (var y = 26; y < H; y += 30) for (var x = 26; x < W; x += 30) {
        var d = Math.hypot(x - W / 2, y - H / 2);
        o += 円(x, y, Math.max(1.6, 9 - d / 34), d < 120 ? P.a : P.b, 0.9);
      }
      return o;
    },
    drift: function (P, r) {
      var o = "";
      for (var i = 0; i < 26; i++) {
        var x = r() * W, y = r() * H, L = 24 + r() * 70;
        o += 線("M" + 丸(x) + " " + 丸(y) + " l" + 丸(L) + " " + 丸(-L * 0.3), i % 2 ? P.a : P.b, 3, 0.8);
      }
      return o;
    },
    dune: function (P, r) {
      var o = "";
      for (var i = 0; i < 5; i++) {
        var y = 96 + i * 30;
        o += 面("M0 " + y + " Q" + 丸(180 + r() * 120) + " " + 丸(y - 44) + " " + 丸(420 + r() * 60) + " " + y
          + " T" + W + " " + 丸(y - 10) + " L" + W + " " + H + " L0 " + H + " Z", i % 2 ? P.a : P.b, 0.35 + i * 0.13);
      }
      return o;
    },
    echo: function (P, r) {
      var o = "";
      for (var i = 0; i < 7; i++) {
        var x = 90 + i * 105;
        for (var j = 1; j <= 3; j++) o += 輪(x, H / 2, j * 16, i % 2 ? P.a : P.b, 2.2, 1 - j * 0.22);
      }
      return o;
    },
    ember: function (P, r) {
      var o = 面("M0 " + H + " L0 190 Q" + (W / 2) + " 120 " + W + " 190 L" + W + " " + H + " Z", P.b, 0.7);
      for (var i = 0; i < 30; i++) o += 円(r() * W, 30 + r() * 150, 2 + r() * 7, i % 3 ? P.a : P.c, 0.9);
      return o;
    },
    fern: function (P, r) {
      var o = "", x0 = W / 2, y0 = H - 16;
      o += 線("M" + x0 + " " + y0 + " Q" + (x0 + 30) + " 120 " + (x0 - 10) + " 30", P.c, 5);
      for (var i = 0; i < 14; i++) {
        var t = i / 14, x = x0 + 30 * (1 - t) * (1 - t) * 2 + (t * -20), y = y0 - t * (y0 - 30), L = 66 * (1 - t) + 10;
        o += 線("M" + 丸(x) + " " + 丸(y) + " q" + 丸(L / 2) + " " + 丸(-L / 3) + " " + 丸(L) + " " + 丸(-L / 8), P.a, 3, 0.9)
          + 線("M" + 丸(x) + " " + 丸(y) + " q" + 丸(-L / 2) + " " + 丸(-L / 3) + " " + 丸(-L) + " " + 丸(-L / 8), P.b, 3, 0.9);
      }
      return o;
    },
    flow: function (P, r) {
      var o = "";
      for (var i = 0; i < 12; i++) {
        var y = 16 + i * 19;
        o += 線("M0 " + y + " C" + 丸(200 + r() * 100) + " " + 丸(y - 40) + " " + 丸(500 + r() * 100) + " " + 丸(y + 40) + " " + W + " " + y,
          i % 2 ? P.a : P.b, 2.4, 0.85);
      }
      return o;
    },
    fold: function (P, r) {
      var o = "";
      for (var i = 0; i < 10; i++) {
        var x = i * 80;
        o += 面("M" + x + " 0 L" + (x + 80) + " " + 丸(30 + r() * 60) + " L" + (x + 80) + " " + H + " L" + x + " " + H + " Z",
          i % 2 ? P.a : P.b, 0.7);
      }
      return o;
    },
    frost: function (P, r) {
      var o = "";
      for (var i = 0; i < 8; i++) {
        var cx = 60 + i * 96 + r() * 20, cy = 40 + r() * 160, R = 18 + r() * 22;
        for (var j = 0; j < 6; j++) {
          var t = (j / 6) * Math.PI * 2;
          o += 線("M" + 丸(cx) + " " + 丸(cy) + " l" + 丸(Math.cos(t) * R) + " " + 丸(Math.sin(t) * R), i % 2 ? P.a : P.c, 2.2, 0.9);
        }
      }
      return o;
    },
    garden: function (P, r) {
      var o = 角(0, 196, W, 44, P.c, 0, 0.4);
      for (var i = 0; i < 9; i++) {
        var x = 50 + i * 88 + r() * 16, h = 50 + r() * 80;
        o += 線("M" + 丸(x) + " 200 L" + 丸(x) + " " + 丸(200 - h), P.c, 3, 0.9);
        for (var j = 0; j < 5; j++) {
          var t = (j / 5) * Math.PI * 2;
          o += 円(x + Math.cos(t) * 13, 200 - h + Math.sin(t) * 13, 9, i % 2 ? P.a : P.b, 0.95);
        }
        o += 円(x, 200 - h, 6, P.bg);
      }
      return o;
    },
    glow: function (P, r) {
      var o = "";
      for (var i = 0; i < 5; i++) {
        var cx = 100 + i * 150 + r() * 40, cy = 60 + r() * 120;
        for (var j = 5; j >= 1; j--) o += 円(cx, cy, j * 12, i % 2 ? P.a : P.b, 0.1 + (6 - j) * 0.05);
        o += 円(cx, cy, 8, P.c);
      }
      return o;
    },
    harbor: function (P, r) {
      var o = 面("M0 176 L" + W + " 176 L" + W + " " + H + " L0 " + H + " Z", P.b, 0.75);
      for (var i = 0; i < 5; i++) {
        var x = 90 + i * 150 + r() * 24;
        o += 面("M" + 丸(x - 40) + " 176 L" + 丸(x + 40) + " 176 L" + 丸(x + 26) + " 200 L" + 丸(x - 26) + " 200 Z", P.a, 0.95)
          + 線("M" + 丸(x) + " 176 L" + 丸(x) + " " + 丸(80 + r() * 40), P.c, 3)
          + 面("M" + 丸(x + 3) + " " + 丸(88 + r() * 20) + " L" + 丸(x + 3) + " 168 L" + 丸(x + 48) + " 168 Z", P.c, 0.9);
      }
      return o;
    },
    ink: function (P, r) {
      var o = "";
      for (var i = 0; i < 6; i++) {
        var x = 90 + i * 130 + r() * 30, y = 60 + r() * 110, R = 20 + r() * 26, d = "M" + 丸(x + R) + " " + 丸(y);
        for (var j = 1; j <= 10; j++) {
          var t = (j / 10) * Math.PI * 2, rr = R * (0.72 + r() * 0.5);
          d += " L" + 丸(x + Math.cos(t) * rr) + " " + 丸(y + Math.sin(t) * rr);
        }
        o += 面(d + " Z", i % 2 ? P.a : P.b, 0.85);
      }
      return o;
    },
    kite: function (P, r) {
      var o = "";
      for (var i = 0; i < 5; i++) {
        var x = 100 + i * 150 + r() * 24, y = 50 + r() * 70, s = 22 + r() * 16;
        o += 面("M" + 丸(x) + " " + 丸(y - s) + " L" + 丸(x + s) + " " + 丸(y) + " L" + 丸(x) + " " + 丸(y + s * 1.4) + " L" + 丸(x - s) + " " + 丸(y) + " Z",
          i % 2 ? P.a : P.b, 0.95)
          + 線("M" + 丸(x) + " " + 丸(y + s * 1.4) + " q" + 丸(14) + " 30 " + 丸(-6) + " 56", P.c, 2.4, 0.9);
      }
      return o;
    },
    lantern: function (P, r) {
      var o = 線("M0 34 L" + W + " 34", P.c, 2.4, 0.8);
      for (var i = 0; i < 7; i++) {
        var x = 60 + i * 112 + r() * 16, h = 44 + r() * 40;
        o += 線("M" + 丸(x) + " 34 L" + 丸(x) + " " + 丸(60), P.c, 2)
          + 角(x - 20, 60, 40, h, i % 2 ? P.a : P.b, 12, 0.95)
          + 線("M" + 丸(x) + " " + 丸(60 + h) + " L" + 丸(x) + " " + 丸(60 + h + 14), P.c, 2, 0.8);
      }
      return o;
    },
    leaf: function (P, r) {
      var o = "";
      for (var i = 0; i < 9; i++) {
        var x = 50 + r() * (W - 100), y = 30 + r() * (H - 60), s = 26 + r() * 26, a = r() * 360;
        o += '<g transform="rotate(' + 丸(a) + ' ' + 丸(x) + ' ' + 丸(y) + ')">'
          + 面("M" + 丸(x) + " " + 丸(y - s) + " q" + 丸(s) + " " + 丸(s) + " 0 " + 丸(s * 2) + " q" + 丸(-s) + " " + 丸(-s) + " 0 " + 丸(-s * 2) + " Z",
            i % 2 ? P.a : P.b, 0.9)
          + 線("M" + 丸(x) + " " + 丸(y - s) + " L" + 丸(x) + " " + 丸(y + s), P.bg, 1.8, 0.7) + "</g>";
      }
      return o;
    },
    meadow: function (P, r) {
      var o = 面("M0 150 Q" + (W / 4) + " 120 " + (W / 2) + " 150 T" + W + " 150 L" + W + " " + H + " L0 " + H + " Z", P.a, 0.85);
      for (var i = 0; i < 28; i++) {
        var x = r() * W, y = 156 + r() * 70;
        o += 線("M" + 丸(x) + " " + 丸(y) + " q" + 丸(4 + r() * 8) + " " + 丸(-14) + " " + 丸(2) + " " + 丸(-26), P.c, 2, 0.8);
      }
      for (var j = 0; j < 9; j++) o += 円(r() * W, 160 + r() * 60, 4 + r() * 3, P.b, 0.95);
      return o;
    },
    mesh: function (P, r) {
      var o = "", pts = [];
      for (var i = 0; i < 16; i++) pts.push([r() * W, r() * H]);
      for (var a = 0; a < pts.length; a++) for (var b = a + 1; b < pts.length; b++) {
        var d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
        if (d < 190) o += 線("M" + 丸(pts[a][0]) + " " + 丸(pts[a][1]) + " L" + 丸(pts[b][0]) + " " + 丸(pts[b][1]), P.b, 1.6, 0.55);
      }
      for (var k = 0; k < pts.length; k++) o += 円(pts[k][0], pts[k][1], 6, P.a);
      return o;
    },
    mist: function (P, r) {
      var o = "";
      for (var i = 0; i < 9; i++) {
        var y = 20 + i * 24, w = 200 + r() * 400, x = r() * (W - w);
        o += 角(x, y, w, 12, i % 2 ? P.a : P.b, 6, 0.55);
      }
      return o;
    }
  };

  /* ── 組み立て ───────────────────────────────────────────────── */
  function 色を選ぶ(t) { return 色たち[たね("色/" + t) % 色たち.length]; }

  function 作る(k, 種) {
    var key = String(k || "");
    if (!絵[key]) key = 鍵[たね(key + "/" + 種) % 鍵.length];
    var t = String(種 === undefined || 種 === null ? key : 種);
    var P = 色を選ぶ(key + "/" + t);
    var r = さいころ(たね(key + "#" + t) || 1);
    var 中 = "";
    try { 中 = 絵[key](P, r) || ""; } catch (e) { 中 = ""; }
    return '<svg class="vqart" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img"'
      + ' aria-label="お知らせの絵" preserveAspectRatio="xMidYMid slice"'
      + ' xmlns="http://www.w3.org/2000/svg">'
      + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + P.bg + '"/>'
      + 中 + "</svg>";
  }

  VQART.名前 = function () { return 鍵.slice(); };
  VQART.かず = function () { return 鍵.length; };
  VQART.色の数 = 色たち.length;
  VQART.色の名 = 色たち.map(function (p) { return p.名; });
  VQART.作る = 作る;
  VQART.ある = function (k) { return !!絵[String(k || "")]; };
})(typeof globalThis !== "undefined" ? globalThis : this);
