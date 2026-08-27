/* ══════════════════════════════════════════════════════════════════════
   design/color.js — 色の計算だけ（LLM は一切いない）

   ★ ここにあるのは **全部 純粋関数**。同じ入力からは必ず同じ出力が出る。
     乱数を使わない。時計を見ない。
   ★ コントラスト比は WCAG 2.1 の式そのまま。目分量で「読めそう」と
     判断しないための土台。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round(v) { return Math.round(v); }

  /* ── HSL → RGB ─────────────────────────────────────────────────
     h は 0〜360（外は回り込む）、s と l は 0〜100。 */
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [round((r + m) * 255), round((g + m) * 255), round((b + m) * 255)];
  }

  function rgbToHex(rgb) {
    return "#" + rgb.map(function (v) {
      var s = clamp(round(v), 0, 255).toString(16);
      return s.length === 1 ? "0" + s : s;
    }).join("");
  }

  function hexToRgb(hex) {
    var s = String(hex || "").replace("#", "").trim();
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return [0, 0, 0];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  /* HSL をそのまま hex で返す。設計上「色は必ず HSL から作る」。 */
  function hsl(h, s, l) { return rgbToHex(hslToRgb(h, s, l)); }

  /* ── RGB → HSL（できあがった色の彩度を測るのに使う）───────────── */
  function rgbToHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function satOf(hex) { return rgbToHsl(hexToRgb(hex))[1]; }
  function lightOf(hex) { return rgbToHsl(hexToRgb(hex))[2]; }

  /* ── 輝度とコントラスト比（WCAG 2.1）──────────────────────────── */
  function lin(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(hex) {
    var p = hexToRgb(hex);
    return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ── 閾値を満たすまで 明度を動かす ─────────────────────────────
     ★ 手順（§4.1）:
        文字の L を 1% ずつ 背景から遠ざける。満たしたら止める。
        0 か 100 まで行っても満たせないなら、**背景側を動かす**。
     ★ 返すのは { fg, bg, ratio, 動かした } 。どちらを動かしたかを隠さない。 */
  function fit(fgH, fgS, fgL, bgHex, need) {
    var bgL = lightOf(bgHex);
    var 下へ = fgL <= bgL;               /* 背景より暗いなら さらに暗く */
    var l = fgL, best = hsl(fgH, fgS, l), 回 = 0;
    while (contrast(best, bgHex) < need && 回 < 100) {
      l = 下へ ? l - 1 : l + 1;
      if (l < 0 || l > 100) break;
      best = hsl(fgH, fgS, l);
      回++;
    }
    if (contrast(best, bgHex) >= need)
      return { fg: best, bg: bgHex, ratio: contrast(best, bgHex), 動かした: 回 ? "文字" : "なし" };
    /* 文字だけでは届かない。白か黒へ振り切ってからもう一度見る。 */
    var 端 = 下へ ? hsl(fgH, Math.min(fgS, 20), 0) : hsl(fgH, Math.min(fgS, 20), 100);
    if (contrast(端, bgHex) >= need)
      return { fg: 端, bg: bgHex, ratio: contrast(端, bgHex), 動かした: "文字（端まで）" };
    /* それでも届かないので 背景を動かす。 */
    var bh = rgbToHsl(hexToRgb(bgHex));
    var bl = bh[2], nb = bgHex, 回2 = 0;
    while (contrast(端, nb) < need && 回2 < 120) {
      bl = 下へ ? bl + 1 : bl - 1;
      if (bl < 0 || bl > 100) break;
      nb = hsl(bh[0], bh[1], bl);
      回2++;
    }
    return { fg: 端, bg: nb, ratio: contrast(端, nb), 動かした: "背景" };
  }

  /* ★ 地が 1 色とはかぎらない（2026-08-17・実測）。
     階調（gradient）を敷くと 上端と下端で 地の色が違う。
     地の色だけで合わせていたら、もう一方の端で 4.08 まで落ちていた。
     **候補ぜんぶに対して**満たすまで動かす。 */
  function fitAll(fgH, fgS, fgL, bgs, need) {
    var 地 = (bgs || []).filter(Boolean);
    if (!地.length) return { fg: hsl(fgH, fgS, fgL), ratio: 0 };
    function 最小(c) {
      var m = Infinity;
      地.forEach(function (b) { m = Math.min(m, contrast(c, b)); });
      return m;
    }
    /* 明るいほうの地に合わせて 進む向きを決める */
    var 平均 = 地.reduce(function (a, b) { return a + lightOf(b); }, 0) / 地.length;
    var 下へ = fgL <= 平均;
    var l = fgL, best = hsl(fgH, fgS, l), 回 = 0;
    while (最小(best) < need && 回 < 120) {
      l = 下へ ? l - 1 : l + 1;
      if (l < 0 || l > 100) break;
      best = hsl(fgH, fgS, l);
      回++;
    }
    if (最小(best) < need) {
      var 端 = 下へ ? hsl(fgH, Math.min(fgS, 20), 0) : hsl(fgH, Math.min(fgS, 20), 100);
      if (最小(端) > 最小(best)) best = 端;
    }
    return { fg: best, ratio: 最小(best), 動かした: 回 };
  }

  /* その地色の上に置くなら 白と黒 どちらが読めるか。 */
  function ink(bgHex) {
    return contrast("#ffffff", bgHex) >= contrast("#000000", bgHex) ? "#ffffff" : "#111111";
  }

  VQD.color = {
    hsl: hsl, hslToRgb: hslToRgb, rgbToHex: rgbToHex, hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl, satOf: satOf, lightOf: lightOf,
    luminance: luminance, contrast: contrast, fit: fit, fitAll: fitAll, ink: ink, clamp: clamp
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
