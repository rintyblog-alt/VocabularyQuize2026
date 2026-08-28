/* ───────── /vq-wake.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   「ルミ」と呼ばれたかどうかを判じる。

   ★ **推測で作っていない。** iPhone（iOS 18.7 / Safari 26.6）で実際に
     「ルミ」と 3 回言ったときに、端末が返してきた字を全部並べて作った:

       ルビー / 海・海海・海海海 / るみ / エルミ・エル海・恵海・エミ・恵み
       テルミ・ヘルミ・テイルミ / オイル

     23 回のうち「るみ」だったのは 4 回だけ。残りは全部よそへ行っている。
     日本語の聞き取りは短い言葉に弱く、しかも **漢字で返す**。
     「るみ」だけを見ていたら、当たらないのが当たり前だった。

   ★ 二段にする。
       近い（strong）: まず間違いなく呼びかけ。言葉の長さを問わない。
       似た音（weak）: 「海」「恵み」のようによその意味も持つ字。
                       **一言だけのとき**しか採らない（普通の会話で誤って
                       始まらないようにするため）。

   ★ このファイルは **アプリと診断ページの両方**が読む。
     片方だけ直して食い違う、を防ぐため。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  /* ── 近い音：これが出たら 長さを問わず呼びかけとみなす ────────── */
  var STRONG = [
    /* そのもの */
    "るみ", "るーみ", "るうみ", "ろみ", "るび", "るびー", "るーび",
    /* 「ヘイ ルミ」がくっついた形（実測） */
    "へるみ", "てるみ", "ているみ", "えるみ", "へいるみ", "へいるび",
    /* 人名の当て字（聞き取りは人名に寄せてくる） */
    "留美", "瑠美", "流美", "琉美", "留実", "瑠海", "留海", "流海",
    "ルミ", "ルーミ",
    /* 英語で返ってくる場合 */
    "lumi", "loomi", "rumi", "roomi", "lumy", "ruumi", "lumie", "roomie"
  ];

  /* ── 似た音：一言だけのときに限って採る ──────────────────────
     「ルミ」は「うみ」と紛れる。「海」はその漢字。
     「恵み（めぐみ）」「エミ」も実測で出た。
     ★ よその意味を持つので、**短いときだけ**。 */
  var WEAK = [
    "うみ", "えみ", "ゆみ", "くみ", "むみ", "ぬみ",
    "海", "恵", "恵み", "膿", "産み", "生み", "弓", "笑み",
    "おいる", "える", "へい", "えるび"
  ];

  var STRONG_RE = new RegExp(STRONG.join("|"));
  var WEAK_RE = new RegExp(WEAK.join("|"));

  function kata2hira(t) {
    return String(t || "").replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  /* 記号・空白・伸ばし棒を落とす。「ルー ミ」「る・み」でも当たるように。 */
  function tidy(t) {
    return String(t || "").replace(/[\s　、。,.!！?？「」『』・ー…〜~\-]/g, "");
  }
  /* 同じ字の繰り返しを 1 つに畳む。「海海海」→「海」（実測で出た形）。 */
  function fold(t) {
    return t.replace(/(.)\1+/g, "$1");
  }

  /* 呼びかけか？ 返すのは真偽。 */
  function isWake(raw) {
    return !!why(raw).hit;
  }

  /* なぜそう判じたかも返す（診断ページで見せるため）。 */
  function why(raw) {
    var src = tidy(String(raw || ""));
    if (!src) return { hit: false, reason: "空" };
    if (src.length > 16) return { hit: false, reason: "長すぎる（呼びかけではない）" };

    var hira = kata2hira(src.toLowerCase());
    var cand = [src, hira, fold(src), fold(hira)];

    /* ★ 近い音でも、**文の途中に埋もれている**なら呼びかけではない。
       「くるみパンを買ってきた」の「るみ」で起きてはいけない（実際に起きた）。
       頭にあるか、ぜんぶで一言ぶんの短さなら呼びかけとみなす。 */
    for (var i = 0; i < cand.length; i++) {
      var m = cand[i].match(STRONG_RE);
      if (!m) continue;
      if (m.index === 0 || cand[i].length <= 8) {
        return { hit: true, reason: "近い音", 見た字: cand[i] };
      }
    }
    /* 似た音は **一言だけ**のときに限る（畳んだあとで 6 字まで）。 */
    var shortEnough = fold(hira).length <= 6;
    if (shortEnough) {
      for (var j = 0; j < cand.length; j++) {
        if (WEAK_RE.test(cand[j])) return { hit: true, reason: "似た音（一言だけ）", 見た字: cand[j] };
      }
      return { hit: false, reason: "当たらない（短いが似ていない）" };
    }
    return { hit: false, reason: "当たらない" };
  }

  var API = { isWake: isWake, why: why, STRONG: STRONG, WEAK: WEAK };
  root.VQ_WAKE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/color.js ───────── */
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


/* ───────── /design/seed.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/seed.js — デザイン空間の座標（10 軸）

   ★ ここが「毎回ちがうのに 毎回まとまっている」の土台。
     テーマを 16 個 並べるのではなく、**座標を選ぶ**ようにする。
   ★ 組み合わせ: 24 × 6 × 3 × 24 × 5 × 3 × 3 × 4 × 4 × 4 ≒ 2,986 万通り
   ★ LLM が出してよいのは **この選択肢の中の enum と整数だけ**。
     色コード・書体名・pt・px・座標を LLM に出させない（第 1 原則）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* ── 軸の定義 ───────────────────────────────────────────────── */
  var HUES = [];
  for (var i = 0; i < 24; i++) HUES.push(i * 15);          /* 0,15,…,345 */

  var AXES = {
    hue: { values: HUES, 印象: "色みそのもの。0=赤 60=黄 120=緑 210=青 270=紫" },
    scheme: {
      values: ["mono", "analogous", "complementary", "split", "triad", "neutral_accent"],
      印象: {
        mono: "1 色だけ。いちばん静かでまとまる",
        analogous: "となり合う色。穏やかで自然",
        complementary: "反対の色。差し色がはっきり立つ",
        split: "反対の両どなり。強いが荒れにくい",
        triad: "三等分。にぎやかで元気",
        neutral_accent: "地は無彩色、差し色だけ有彩。資料向きで硬い"
      }
    },
    mode: {
      values: ["light", "dark", "high_contrast"],
      印象: { light: "明るい地", dark: "暗い地。写真や数字が映える", high_contrast: "白地に濃い字。読みやすさ最優先" }
    },
    fontPair: { values: null, 印象: "書体の組み合わせ（0〜23）。design/font-pairs.js に一覧" },
    typeScale: {
      values: [1.2, 1.25, 1.333, 1.414, 1.5],
      印象: { 1.2: "落差が小さく穏やか", 1.25: "標準", 1.333: "見出しがよく立つ",
              1.414: "劇的", 1.5: "とても劇的。文字数が少ないとき向け" }
    },
    grid: { values: [4, 6, 12], 印象: { 4: "大づかみ", 6: "扱いやすい標準", 12: "細かく割れる" } },
    spacing: { values: ["tight", "normal", "airy"], 印象: { tight: "詰まって情報量が多い", normal: "標準", airy: "余白が広く上品" } },
    shape: {
      values: ["rounded", "sharp", "circular", "angled"],
      印象: { rounded: "やわらかい", sharp: "硬く端正", circular: "まるい。人物や記号向け", angled: "角を落とした個性" }
    },
    accent: {
      values: ["underline", "block", "rule", "none"],
      印象: { underline: "見出しの下に短い線", block: "色の面で強調", rule: "細い罫で仕切る", none: "飾らない" }
    },
    background: {
      values: ["plain", "gradient", "texture", "shapes"],
      印象: { plain: "べた一色", gradient: "ゆるやかな階調", texture: "ごく薄い地紋", shapes: "大きな図形を端に逃がす" }
    }
  };

  var ORDER = ["hue", "scheme", "mode", "fontPair", "typeScale", "grid",
               "spacing", "shape", "accent", "background"];

  function fontPairCount() {
    try { return (VQD.fontPairs || []).length || 24; } catch (e) { return 24; }
  }
  function valuesOf(axis) {
    if (axis === "fontPair") {
      var n = fontPairCount(), a = [];
      for (var i = 0; i < n; i++) a.push(i);
      return a;
    }
    return AXES[axis].values;
  }

  /* ── 形が正しいか（値が選択肢の中にあるか）───────────────────── */
  function isSeed(s) {
    if (!s || typeof s !== "object") return false;
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], v = valuesOf(k);
      if (v.indexOf(s[k]) < 0) return false;
    }
    return true;
  }

  /* 足りない軸を既定で埋める（LLM の出力が欠けていても落とさない）。 */
  function normalize(s) {
    var o = {}, src = s || {};
    ORDER.forEach(function (k) {
      var v = valuesOf(k);
      var x = src[k];
      if (k === "hue" && typeof x === "number") x = Math.round(x / 15) * 15 % 360;
      if (k === "typeScale" && typeof x === "number") {
        /* 1.33 のような近い数は いちばん近い段へ寄せる */
        var best = v[0], d = Infinity;
        v.forEach(function (c) { var dd = Math.abs(c - x); if (dd < d) { d = dd; best = c; } });
        x = best;
      }
      if (k === "grid" && typeof x === "number" && v.indexOf(x) < 0) {
        var b2 = v[0], d2 = Infinity;
        v.forEach(function (c) { var dd = Math.abs(c - x); if (dd < d2) { d2 = dd; b2 = c; } });
        x = b2;
      }
      if (k === "fontPair" && typeof x === "number") x = ((Math.round(x) % v.length) + v.length) % v.length;
      o[k] = v.indexOf(x) >= 0 ? x : v[0];
    });
    return o;
  }

  /* ── 文字列にする / 戻す（?seed= と 重複判定に使う）───────────── */
  function encode(s) {
    var n = normalize(s);
    return ORDER.map(function (k) { return valuesOf(k).indexOf(n[k]); }).join("-");
  }
  function decode(str) {
    var a = String(str || "").split("-").map(Number);
    var o = {};
    ORDER.forEach(function (k, i) {
      var v = valuesOf(k);
      var idx = a[i];
      o[k] = (idx >= 0 && idx < v.length) ? v[idx] : v[0];
    });
    return o;
  }

  /* 組み合わせの総数（報告のため） */
  function space() {
    return ORDER.reduce(function (n, k) { return n * valuesOf(k).length; }, 1);
  }

  VQD.seed = {
    AXES: AXES, ORDER: ORDER, valuesOf: valuesOf,
    isSeed: isSeed, normalize: normalize, encode: encode, decode: decode, space: space
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/font-families.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/font-families.js — 同梱書体の id と family の対応（自動生成）

   ★ client/index.html の WP.fontData から作っている。手で直さないこと。
     直すときは client/fonts と WP.fontData のほうを直す。
   ★ 実体は /fonts/css/<id>.css。読み込んだ時点で効き始める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  VQD.fontFamilyTable = [
    { id: "anton", family: "Anton" },
    { id: "archivo", family: "Archivo" },
    { id: "barlowcondensed", family: "Barlow Condensed" },
    { id: "bebasneue", family: "Bebas Neue" },
    { id: "bricolagegrotesque", family: "Bricolage Grotesque" },
    { id: "cabin", family: "Cabin" },
    { id: "chivo", family: "Chivo" },
    { id: "dmsans", family: "DM Sans" },
    { id: "ibmplexsans", family: "IBM Plex Sans" },
    { id: "inter", family: "Inter" },
    { id: "josefinsans", family: "Josefin Sans" },
    { id: "jost", family: "Jost" },
    { id: "karla", family: "Karla" },
    { id: "lato", family: "Lato" },
    { id: "lexend", family: "Lexend" },
    { id: "manrope", family: "Manrope" },
    { id: "montserrat", family: "Montserrat" },
    { id: "notosans", family: "Noto Sans" },
    { id: "nunito", family: "Nunito" },
    { id: "opensans", family: "Open Sans" },
    { id: "oswald", family: "Oswald" },
    { id: "outfit", family: "Outfit" },
    { id: "plusjakartasans", family: "Plus Jakarta Sans" },
    { id: "poppins", family: "Poppins" },
    { id: "publicsans", family: "Public Sans" },
    { id: "quicksand", family: "Quicksand" },
    { id: "roboto", family: "Roboto" },
    { id: "rubik", family: "Rubik" },
    { id: "sora", family: "Sora" },
    { id: "sourcesans3", family: "Source Sans 3" },
    { id: "spacegrotesk", family: "Space Grotesk" },
    { id: "worksans", family: "Work Sans" },
    { id: "alegreya", family: "Alegreya" },
    { id: "bitter", family: "Bitter" },
    { id: "bodonimoda", family: "Bodoni Moda" },
    { id: "cardo", family: "Cardo" },
    { id: "cormorantgaramond", family: "Cormorant Garamond" },
    { id: "crimsonpro", family: "Crimson Pro" },
    { id: "dmserifdisplay", family: "DM Serif Display" },
    { id: "ebgaramond", family: "EB Garamond" },
    { id: "frankruhllibre", family: "Frank Ruhl Libre" },
    { id: "fraunces", family: "Fraunces" },
    { id: "instrumentserif", family: "Instrument Serif" },
    { id: "librebaskerville", family: "Libre Baskerville" },
    { id: "literata", family: "Literata" },
    { id: "lora", family: "Lora" },
    { id: "merriweather", family: "Merriweather" },
    { id: "newsreader", family: "Newsreader" },
    { id: "notoserif", family: "Noto Serif" },
    { id: "ptserif", family: "PT Serif" },
    { id: "petrona", family: "Petrona" },
    { id: "playfairdisplay", family: "Playfair Display" },
    { id: "robotoslab", family: "Roboto Slab" },
    { id: "sourceserif4", family: "Source Serif 4" },
    { id: "spectral", family: "Spectral" },
    { id: "vollkorn", family: "Vollkorn" },
    { id: "youngserif", family: "Young Serif" },
    { id: "zillaslab", family: "Zilla Slab" },
    { id: "abrilfatface", family: "Abril Fatface" },
    { id: "alfaslabone", family: "Alfa Slab One" },
    { id: "archivoblack", family: "Archivo Black" },
    { id: "bungee", family: "Bungee" },
    { id: "caveat", family: "Caveat" },
    { id: "courierprime", family: "Courier Prime" },
    { id: "dmmono", family: "DM Mono" },
    { id: "dancingscript", family: "Dancing Script" },
    { id: "firacode", family: "Fira Code" },
    { id: "fredoka", family: "Fredoka" },
    { id: "greatvibes", family: "Great Vibes" },
    { id: "ibmplexmono", family: "IBM Plex Mono" },
    { id: "inconsolata", family: "Inconsolata" },
    { id: "jetbrainsmono", family: "JetBrains Mono" },
    { id: "lobster", family: "Lobster" },
    { id: "pacifico", family: "Pacifico" },
    { id: "patrickhand", family: "Patrick Hand" },
    { id: "permanentmarker", family: "Permanent Marker" },
    { id: "righteous", family: "Righteous" },
    { id: "robotomono", family: "Roboto Mono" },
    { id: "sacramento", family: "Sacramento" },
    { id: "satisfy", family: "Satisfy" },
    { id: "shadowsintolight", family: "Shadows Into Light" },
    { id: "sourcecodepro", family: "Source Code Pro" },
    { id: "spacemono", family: "Space Mono" },
    { id: "notosansjp", family: "Noto Sans JP" },
    { id: "notoserifjp", family: "Noto Serif JP" },
    { id: "bizudpgothic", family: "BIZ UDPGothic" },
    { id: "bizudpmincho", family: "BIZ UDPMincho" },
    { id: "zenmarugothic", family: "Zen Maru Gothic" },
    { id: "mplusrounded1c", family: "M PLUS Rounded 1c" },
    { id: "zenkakugothicnew", family: "Zen Kaku Gothic New" },
    { id: "shipporimincho", family: "Shippori Mincho" },
    { id: "kleeone", family: "Klee One" },
    { id: "mplus1p", family: "M PLUS 1p" },
    { id: "bizudgothic", family: "BIZ UDGothic" },
    { id: "ibmplexsansjp", family: "IBM Plex Sans JP" },
    { id: "mplus2", family: "M PLUS 2" },
    { id: "murecho", family: "Murecho" },
    { id: "zenkakugothicantique", family: "Zen Kaku Gothic Antique" },
    { id: "sawarabigothic", family: "Sawarabi Gothic" },
    { id: "delagothicone", family: "Dela Gothic One" },
    { id: "dotgothic16", family: "DotGothic16" },
    { id: "kosugi", family: "Kosugi" },
    { id: "yomogi", family: "Yomogi" },
    { id: "shizuru", family: "Shizuru" },
    { id: "stick", family: "Stick" },
    { id: "trainone", family: "Train One" },
    { id: "rampartone", family: "Rampart One" },
    { id: "reggaeone", family: "Reggae One" },
    { id: "rocknrollone", family: "RocknRoll One" },
    { id: "kaiseidecol", family: "Kaisei Decol" },
    { id: "kiwimaru", family: "Kiwi Maru" },
    { id: "hachimarupop", family: "Hachi Maru Pop" },
    { id: "yuseimagic", family: "Yusei Magic" },
    { id: "pottaone", family: "Potta One" },
    { id: "mochiypopone", family: "Mochiy Pop One" },
    { id: "kosugimaru", family: "Kosugi Maru" },
    { id: "zenantique", family: "Zen Antique" },
    { id: "zenoldmincho", family: "Zen Old Mincho" },
    { id: "sawarabimincho", family: "Sawarabi Mincho" },
    { id: "hinamincho", family: "Hina Mincho" },
    { id: "newtegomin", family: "New Tegomin" },
    { id: "yujisyuku", family: "Yuji Syuku" },
    { id: "kaiseitokumin", family: "Kaisei Tokumin" }
  ];
  VQD.familyOfId = {};
  VQD.fontFamilyTable.forEach(function (f) { VQD.familyOfId[f.id] = f.family; });
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/font-pairs.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/font-pairs.js — 書体の組み合わせ 24 組

   ★ ここに並ぶ id は **すべて同梱**（client/fonts/css/<id>.css）。
     端末に入っているかは関係なく、選べば必ずその形で出る。
   ★ body（本文）に置いてよいのは
       ・400 と 700 の両方が実体としてある
       ・和文は 和文グリフを持つもの
     だけ。飾りの強い書体は display にしか置かない。
   ★ 欧文と和文を **並べて 1 つの stack** にする。
     "Anton","Noto Sans JP",sans-serif のように、
     英数は欧文の顔、かなと漢字は和文の顔になる。
   ★ 同じ性格（genre）が 5 組以上にならないようにしてある。
     この決まりは design/checks の試験で機械的に見張る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* w: 実体としてあるウェイト（build 時に css を読んで確かめた値） */
  var P = [
    { id: 0, 名: "静かで正確", genre: "ui", 印象: "画面のUIのような端正さ。数字が読みやすい",
      display: "inter", body: "inter", mono: "jetbrainsmono",
      jpDisplay: "zenkakugothicnew", jpBody: "notosansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 1, 名: "洗練・幾何", genre: "geometric", 印象: "Futura 風。上品で少し冷たい",
      display: "jost", body: "jost", mono: "dmmono",
      jpDisplay: "zenkakugothicnew", jpBody: "murecho",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 2, 名: "強い断言", genre: "condensed", 印象: "極太の見出しで言い切る。宣言や表紙向き",
      display: "anton", body: "worksans", mono: "robotomono",
      jpDisplay: "delagothicone", jpBody: "notosansjp",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 3, 名: "やさしく確実", genre: "humanist", 印象: "学習教材。読み間違えにくい",
      display: "lexend", body: "lexend", mono: "sourcecodepro",
      jpDisplay: "zenkakugothicnew", jpBody: "bizudpgothic",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 4, 名: "格式", genre: "display-serif", 印象: "古典的で改まった場。式典や提案書",
      display: "playfairdisplay", body: "ebgaramond", mono: "ibmplexmono",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 5, 名: "誌面らしい", genre: "display-serif", 印象: "雑誌の特集。見出しが華やか",
      display: "abrilfatface", body: "literata", mono: "courierprime",
      jpDisplay: "zenantique", jpBody: "zenoldmincho",
      weightRange: { display: [400], body: [400, 700] } },
    { id: 6, 名: "技術的", genre: "mono-tech", 印象: "開発者向け資料。等幅が馴染む",
      display: "spacegrotesk", body: "ibmplexsans", mono: "ibmplexmono",
      jpDisplay: "ibmplexsansjp", jpBody: "ibmplexsansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 7, 名: "親しみ・まるい", genre: "rounded", 印象: "角がない。子どもや初学者に向く",
      display: "quicksand", body: "nunito", mono: "dmmono",
      jpDisplay: "zenmarugothic", jpBody: "mplusrounded1c",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 8, 名: "報道", genre: "condensed", 印象: "新聞の紙面。事実を淡々と並べる",
      display: "oswald", body: "newsreader", mono: "robotomono",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 600, 700], body: [400, 700] } },
    { id: 9, 名: "先進", genre: "mono-tech", 印象: "少し近未来。プロダクト発表向き",
      display: "sora", body: "manrope", mono: "spacemono",
      jpDisplay: "mplus2", jpBody: "mplus2",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 10, 名: "手作り", genre: "handwriting", 印象: "手書きの温度。ワークショップや部活",
      display: "caveat", body: "cabin", mono: "courierprime",
      jpDisplay: "yomogi", jpBody: "zenmarugothic",
      weightRange: { display: [400, 700], body: [400, 600, 700] } },
    { id: 11, 名: "硬質", genre: "slab", 印象: "スラブセリフ。工業・実務の硬さ",
      display: "robotoslab", body: "bitter", mono: "robotomono",
      jpDisplay: "zenkakugothicantique", jpBody: "bizudgothic",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 12, 名: "掲示・大声", genre: "condensed", 印象: "ポスター。遠くから読ませる",
      display: "bebasneue", body: "barlowcondensed", mono: "spacemono",
      jpDisplay: "mochiypopone", jpBody: "mplus2",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 13, 名: "端正", genre: "oldstyle-serif", 印象: "細部まで整った明朝。落ち着いた報告",
      display: "frankruhllibre", body: "sourceserif4", mono: "ibmplexmono",
      jpDisplay: "zenoldmincho", jpBody: "bizudpmincho",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 14, 名: "抜け感", genre: "display-serif", 印象: "細い明朝の見出しに 素直なゴシック本文",
      display: "dmserifdisplay", body: "dmsans", mono: "dmmono",
      jpDisplay: "hinamincho", jpBody: "notosansjp",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 15, 名: "学術", genre: "oldstyle-serif", 印象: "論文や研究発表。長い文が読める",
      display: "crimsonpro", body: "crimsonpro", mono: "courierprime",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 16, 名: "楽しい", genre: "rounded", 印象: "明るくポップ。イベントや告知",
      display: "fredoka", body: "rubik", mono: "dmmono",
      jpDisplay: "pottaone", jpBody: "mplusrounded1c",
      weightRange: { display: [400, 700], body: [400, 600, 700] } },
    { id: 17, 名: "中立・公的", genre: "ui", 印象: "役所や学校の配布物。癖を出さない",
      display: "publicsans", body: "publicsans", mono: "sourcecodepro",
      jpDisplay: "bizudgothic", jpBody: "bizudpgothic",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 18, 名: "温かい主張", genre: "display-serif", 印象: "少し癖のあるセリフ。個人の言葉",
      display: "fraunces", body: "vollkorn", mono: "ibmplexmono",
      jpDisplay: "kaiseitokumin", jpBody: "zenoldmincho",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 19, 名: "明快", genre: "geometric", 印象: "表紙が映える定番。誰にでも通じる",
      display: "montserrat", body: "opensans", mono: "robotomono",
      jpDisplay: "zenkakugothicnew", jpBody: "notosansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 20, 名: "和の趣", genre: "jp-retro", 印象: "毛筆調の題字。和のテーマや行事",
      display: "youngserif", body: "spectral", mono: "courierprime",
      jpDisplay: "yujisyuku", jpBody: "zenoldmincho",
      weightRange: { display: [400], body: [400, 700] } },
    { id: 21, 名: "余白・ミニマル", genre: "ui", 印象: "線が細い。ほとんど何も足さない",
      display: "instrumentserif", body: "karla", mono: "inconsolata",
      jpDisplay: "stick", jpBody: "murecho",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 22, 名: "レトロ看板", genre: "jp-retro", 印象: "昭和の看板。縁取りの太い題字",
      display: "righteous", body: "archivo", mono: "spacemono",
      jpDisplay: "trainone", jpBody: "mplus1p",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 23, 名: "教科書", genre: "oldstyle-serif", 印象: "教科書体。書き取りや国語の教材",
      display: "librebaskerville", body: "lato", mono: "courierprime",
      jpDisplay: "kleeone", jpBody: "bizudpmincho",
      weightRange: { display: [400, 700], body: [400, 700] } }
  ];

  /* 役目ごとの stack（欧文 → 和文 → 総称）。
     ここで返す id は そのまま /fonts/css/<id>.css へ対応する。 */
  function stack(pairIndex, role) {
    var p = P[((pairIndex | 0) % P.length + P.length) % P.length];
    if (role === "mono") return [p.mono, p.jpBody];
    if (role === "display") return [p.display, p.jpDisplay];
    return [p.body, p.jpBody];
  }
  function of(i) { return P[((i | 0) % P.length + P.length) % P.length]; }

  /* 性格の一覧（LLM へ渡す説明文。**書体名は渡さない**） */
  function 一覧() {
    return P.map(function (p) { return { fontPair: p.id, 性格: p.名, 印象: p.印象 }; });
  }

  VQD.fontPairs = P;
  VQD.fonts = { of: of, stack: stack, 一覧: 一覧 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/derive.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/derive.js — Seed → Tokens（計算だけ。LLM はいない）

   ★ **決定的**でなければならない。同じ Seed からは 何度やっても同じ値。
     乱数を使わない。時計を見ない。Seed の中の数だけから決める。
   ★ 色は必ず HSL から作り、**最後にコントラスト比で確かめて明度を直す**。
     「たぶん読める」で出さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var C = VQD.color;

  /* 必要なコントラスト比（§4.1）。ここを緩めない。 */
  /* ★ 差し色の上に置く文字は **7.0** まで離す（2026-08-17）。
     4.5 だと、番号つきの手順の丸番号（21px）や 比べるカードの見出しのように
     **小さめの文字を色の面に載せる**部品で 読みにくくなる。
     色の面はどこでも使うので、いちばん厳しい所に合わせておく。 */
  var NEED = { body: 7.0, heading: 4.5, onAccent: 7.0, rule: 3.0 };

  /* scheme ごとの色相のずれ [地, 副, 差し色] */
  var OFFSET = {
    mono: [0, 0, 0],
    analogous: [0, 30, -30],
    complementary: [0, 180, 150],
    split: [0, 150, 210],
    triad: [0, 120, 240],
    neutral_accent: [0, 0, 180]
  };

  /* mode ごとの明度の幅と彩度の上限（§4.1）*/
  var MODE = {
    light: { bg: [96, 98], surface: [91, 94], text: [12, 18], satCap: 70 },
    dark: { bg: [10, 14], surface: [17, 21], text: [92, 96], satCap: 60 },
    high_contrast: { bg: [100, 100], surface: [96, 96], text: [6, 9], satCap: 80 }
  };

  /* Seed から **決まった** 0〜n-1 を作る（乱数ではない）。
     幅のある値（bg 96〜98 のどこにするか）を Seed ごとに散らすため。 */
  function 位置(seed, 塩, n) {
    var s = VQD.seed.encode(seed) + "|" + 塩;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % n;
  }
  function 幅から(seed, 塩, 範囲) {
    var lo = 範囲[0], hi = 範囲[1];
    if (hi <= lo) return lo;
    return lo + 位置(seed, 塩, hi - lo + 1);
  }

  function derive(seedIn) {
    var seed = VQD.seed.normalize(seedIn);
    var m = MODE[seed.mode];
    var off = OFFSET[seed.scheme];
    var 暗い = seed.mode === "dark";

    var h地 = seed.hue + off[0];
    var h副 = seed.hue + off[1];
    var h差 = seed.hue + off[2];

    /* ── 彩度の決めかた ───────────────────────────────────────
       ★ 地の彩度は必ず低く抑える。「S>60% の面積は 10% 以下」を
         **地で使い切らない**ため（§4.5）。 */
    var 無彩 = seed.scheme === "neutral_accent";
    var 単色 = seed.scheme === "mono";
    var bgS = seed.mode === "high_contrast" ? 0 : (無彩 ? 3 : (4 + 位置(seed, "bgS", 5)));
    var surS = seed.mode === "high_contrast" ? 0 : (無彩 ? 4 : bgS + 3);
    var txtS = seed.mode === "high_contrast" ? 0 : (無彩 ? 6 : 10);
    var 差S = Math.min(m.satCap, 単色 ? 48 : (62 + 位置(seed, "acS", 4) * 4));
    var 副S = 無彩 ? 6 : (単色 ? Math.min(m.satCap, 30) : Math.min(m.satCap, 44 + 位置(seed, "seS", 3) * 5));

    /* ── 地と面 ─────────────────────────────────────────────── */
    var bg = C.hsl(h地, bgS, 幅から(seed, "bgL", m.bg));
    var surface = C.hsl(h地, surS, 幅から(seed, "suL", m.surface));

    /* ── 文字（必ず比で確かめる）───────────────────────────────
       ★ 階調を敷くときは 地が 2 色ある。**両方**に対して満たす。 */
    var 地候補 = seed.background === "gradient" ? [bg, surface] : [bg];
    function 最小比(c) {
      var m2 = Infinity;
      地候補.forEach(function (b) { m2 = Math.min(m2, C.contrast(c, b)); });
      return m2;
    }
    var 本文 = C.fitAll(h地, txtS, 幅から(seed, "txL", m.text), 地候補, NEED.body);
    var 副文L = 暗い ? Math.max(0, C.lightOf(本文.fg) - 22) : Math.min(100, C.lightOf(本文.fg) + 26);
    var 副文 = C.fitAll(h地, txtS, 副文L, 地候補, NEED.heading);

    /* ── 差し色 ───────────────────────────────────────────────
       ① まず 地に対して 3.0 以上（線や帯として見えること）
       ② そのうえで、色の面に文字を置いても 4.5 以上あること */
    /* ★ 地に対して 3.0 ではなく **4.5** を要る（2026-08-17・実測）。
       差し色は「大きな数字」の文字色にも使う。3.0 だと
       数字そのものが読めず、Gate の contrastFail が出ていた。 */
    var 差L = 暗い ? 62 : 46;
    var 差 = C.fitAll(h差, 差S, 差L, 地候補, NEED.heading).fg;
    /* ★ fit が動かした明度を **変数へ戻す**（2026-08-17・実測）。
       戻していなかったので、下の while が 元の明度から作り直し、
       地に対する比が 4.08 まで落ちて metric が読めなくなっていた。 */
    差L = C.lightOf(差);
    var 上文字 = 暗い ? "#111111" : "#ffffff";
    var 回 = 0;
    while (C.contrast(上文字, 差) < NEED.onAccent && 回 < 100) {
      差L = 暗い ? 差L + 1 : 差L - 1;
      if (差L < 0 || 差L > 100) break;
      差 = C.hsl(h差, 差S, 差L);
      回++;
    }
    if (C.contrast(上文字, 差) < NEED.onAccent) 上文字 = C.ink(差);

    /* うすい差し色（カードの地）。**この上に本文を置いても読めること。** */
    var 淡 = C.fit(h差, Math.min(32, Math.round(差S * 0.45)), 暗い ? 25 : 90, 本文.fg, NEED.heading);
    var 淡色 = 淡.fg;
    /* fit は文字側を動かす作りなので、ここでは地として使えるよう
       「本文が読めるか」を見て、だめなら 地から遠い側へ寄せる。 */
    var 回2 = 0;
    var 淡L = 暗い ? 25 : 90;
    淡色 = C.hsl(h差, Math.min(32, Math.round(差S * 0.45)), 淡L);
    /* ★ ここは 4.5 では足りない（2026-08-17・実測）。
       うすい差し色は **カードの地**として使い、その上に 18px の本文を置く。
       本文の決まりは 7.0 なので、7.0 まで離す。 */
    /* ★ 副文（そえ書き）も この上に載る。4.5 を切ると読めない。 */
    while ((C.contrast(本文.fg, 淡色) < NEED.body
            || C.contrast(副文.fg, 淡色) < NEED.heading) && 回2 < 100) {
      淡L = 暗い ? 淡L - 1 : 淡L + 1;
      if (淡L < 0 || 淡L > 100) break;
      淡色 = C.hsl(h差, Math.min(32, Math.round(差S * 0.45)), 淡L);
      回2++;
    }

    /* 副の色（2 本目の系列・補助の図形）。地に対して 3.0 以上。 */
    var 副 = C.fitAll(h副, 副S, 暗い ? 58 : (単色 ? 62 : 52), 地候補, NEED.rule).fg;
    /* 単色のときは 差し色と 副が同じ色相なので、明度で必ず離す。 */
    if (単色 && Math.abs(C.lightOf(副) - C.lightOf(差)) < 14)
      副 = C.hsl(h副, 副S, C.clamp(C.lightOf(差) + (暗い ? -18 : 18), 0, 100));

    /* 罫線。§4.1 の表どおり 地に対して 3.0 以上。 */
    var 罫 = C.fitAll(h地, Math.min(12, bgS + 4), 暗い ? 42 : 62, 地候補, NEED.rule).fg;

    /* ── グラフの色（6 枠・決まった順）─────────────────────────────
       ★ 系列ごとの「見分け」なので、明度だけでなく **色相を離す**。
       ★ 7 本目からは色を作らず「その他」へまとめる（chart.js と同じ考え）。
       ★ どれも 地に対して 3.0 以上（色だけで細い棒を見分けるため）。 */
    var 図色 = [];
    var 回し = 単色 ? 0 : (無彩 ? 26 : 30);
    for (var gi = 0; gi < 6; gi++) {
      var gh = h差 + (gi % 2 ? 回し * Math.ceil(gi / 2) : -回し * (gi / 2));
      var gs = Math.min(m.satCap, 差S - (gi % 3) * 8);
      var gl = (暗い ? [62, 74, 50, 68, 44, 80] : [46, 34, 58, 26, 66, 40])[gi];
      if (単色) { gs = Math.min(m.satCap, 44); gl = (暗い ? [70, 58, 46, 34, 82, 26] : [30, 42, 54, 66, 22, 74])[gi]; }
      図色.push(C.fitAll(gh, gs, gl, 地候補, NEED.rule).fg);
    }

    /* ── 文字の大きさ（本文 18pt を軸に typeScale の累乗）───────── */
    var r = seed.typeScale;
    var 字 = {
      caption: Math.max(14, Math.round(18 / r)),
      body: 18,
      h3: Math.round(18 * r),
      h2: Math.round(18 * Math.pow(r, 2)),
      h1: Math.round(18 * Math.pow(r, 3)),
      display: Math.round(18 * Math.pow(r, 4))
    };
    function 行間(size) { return size < 20 ? 1.7 : (size < 36 ? 1.4 : 1.15); }

    /* ── 余白（4px グリッド・8 を単位に）───────────────────────── */
    var unit = 8;
    var mult = { tight: 0.75, normal: 1.0, airy: 1.4 }[seed.spacing];
    var 間 = {
      unit: unit,
      slideMargin: Math.round(unit * 6 * mult),
      blockGap: Math.round(unit * 3 * mult),
      inlineGap: Math.round(unit * 1.5 * mult),
      gutter: Math.round(unit * 2 * mult)
    };

    /* ── 形 ─────────────────────────────────────────────────── */
    var 形 = { kind: seed.shape, radius: 0, cut: 0, 円で切る: false };
    if (seed.shape === "rounded") 形.radius = unit * 1.5;
    else if (seed.shape === "sharp") 形.radius = 0;
    else if (seed.shape === "circular") { 形.radius = 9999; 形.円で切る = true; }
    else if (seed.shape === "angled") { 形.radius = 0; 形.cut = unit * 2; }

    /* ── 地の作り（背景）───────────────────────────────────────
       ★ 濃い色（S>60%）で塗ってよいのは 画面の 10% まで。
         ここでは **淡い色しか使わない**ので、地では使い切らない。 */
    var 角度 = (seed.hue * 7) % 360;
    var 背 = { kind: seed.background, 角度: 角度 };
    if (seed.background === "gradient") { 背.from = bg; 背.to = surface; }
    if (seed.background === "texture") { 背.色 = 罫; 背.濃さ = (3 + 位置(seed, "tx", 3)) / 100; 背.間隔 = 24 + 位置(seed, "tx2", 3) * 8; }
    if (seed.background === "shapes") { 背.色 = 淡色; 背.向き = 位置(seed, "sh", 4); }

    return {
      seed: seed,
      seedKey: VQD.seed.encode(seed),
      color: {
        bg: bg, surface: surface,
        textPrimary: 本文.fg, textSecondary: 副文.fg, textOnAccent: 上文字,
        accent: 差, accentSoft: 淡色, secondary: 副,
        border: 罫, shadowColor: 暗い ? "rgba(0,0,0,.55)" : "rgba(15,23,42,.10)",
        chart: 図色
      },
      type: {
        pair: seed.fontPair,
        stack: {
          display: VQD.fonts.stack(seed.fontPair, "display"),
          body: VQD.fonts.stack(seed.fontPair, "body"),
          mono: VQD.fonts.stack(seed.fontPair, "mono")
        },
        weight: VQD.fonts.of(seed.fontPair).weightRange,
        size: 字, 行間: 行間,
        字間: { display: -0.02, heading: -0.01, body: 0, 和文本文: 0.02 }
      },
      space: 間, shape: 形, background: 背, grid: seed.grid,
      比: {
        本文: 最小比(本文.fg),
        見出し: 最小比(本文.fg),
        副文: 最小比(副文.fg),
        差し色の上の文字: C.contrast(上文字, 差),
        差し色と地: 最小比(差),
        うすい差し色の上の本文: C.contrast(本文.fg, 淡色),
        うすい差し色の上の副文: C.contrast(副文.fg, 淡色),
        罫線: 最小比(罫),
        地の候補: 地候補
      }
    };
  }

  /* できあがった Tokens が 決まりを守れているか（試験と Gate が使う） */
  function 確かめ(t) {
    var 悪 = [];
    if (t.比.本文 < NEED.body) 悪.push("本文と地の比が " + t.比.本文.toFixed(2) + "（要 7.0）");
    if (t.比.副文 < NEED.heading) 悪.push("副文と地の比が " + t.比.副文.toFixed(2) + "（要 4.5）");
    if (t.比.差し色の上の文字 < NEED.onAccent) 悪.push("差し色の上の文字が " + t.比.差し色の上の文字.toFixed(2) + "（要 4.5）");
    if (t.比.罫線 < NEED.rule) 悪.push("罫線と地の比が " + t.比.罫線.toFixed(2) + "（要 3.0）");
    if (t.比.差し色と地 < NEED.heading) 悪.push("差し色と地の比が " + t.比.差し色と地.toFixed(2) + "（要 4.5）");
    if (t.比.うすい差し色の上の本文 < NEED.body) 悪.push("うすい差し色の上の本文が " + t.比.うすい差し色の上の本文.toFixed(2) + "（要 7.0）");
    if (t.比.うすい差し色の上の副文 < NEED.heading) 悪.push("うすい差し色の上の副文が " + t.比.うすい差し色の上の副文.toFixed(2) + "（要 4.5）");
    /* 地と面の彩度が高いと 画面いっぱいが濃い色になる */
    [["地", t.color.bg], ["面", t.color.surface], ["うすい差し色", t.color.accentSoft]].forEach(function (p) {
      if (VQD.color.satOf(p[1]) > 60) 悪.push(p[0] + "の彩度が " + Math.round(VQD.color.satOf(p[1])) + "%（60% 超は広い面に使えない）");
    });
    return 悪;
  }

  VQD.derive = derive;
  VQD.deriveCheck = 確かめ;
  VQD.NEED = NEED;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/constraints.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/constraints.js — Seed の禁じ手と、いちばん近い直しかた

   ★ 直しは **計算で完結**させる。LLM に作り直させない（§5.2）。
     違反している軸だけを 1 段ずつずらして、通る組み合わせを探す。
   ★ どの軸をどれだけ動かしたかを必ず返す。黙って直さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var S = VQD.seed;

  /* 禁じ手。なぜ だめかを 1 行で持つ（説明できない決まりは置かない）。 */
  var 禁 = [
    { id: "grid12_bigscale",
      当たる: function (s) { return s.grid === 12 && s.typeScale >= 1.414; },
      なぜ: "12 列に対して 見出しが大きすぎて 列に収まらない",
      直す: { 軸: "grid", 先: 6 } },
    { id: "grid12_circular",
      当たる: function (s) { return s.grid === 12 && s.shape === "circular"; },
      なぜ: "12 列だと 円にした要素が小さくなりすぎる",
      直す: { 軸: "grid", 先: 6 } },
    { id: "hc_background",
      当たる: function (s) { return s.mode === "high_contrast" && s.background !== "plain"; },
      なぜ: "読みやすさ最優先の面に 模様や階調を敷くと 台無しになる",
      直す: { 軸: "background", 先: "plain" } },
    { id: "mono_noaccent",
      当たる: function (s) { return s.scheme === "mono" && s.accent === "none"; },
      なぜ: "1 色だけで飾りも無いと 強弱が完全に消える",
      直す: { 軸: "accent", 先: "rule" } },
    { id: "texture_tight",
      当たる: function (s) { return s.background === "texture" && s.spacing === "tight"; },
      なぜ: "詰まった余白に地紋が重なると 文字が沈む",
      直す: { 軸: "spacing", 先: "normal" } }
  ];

  function validateSeed(seedIn) {
    var s = S.normalize(seedIn);
    var 破 = 禁.filter(function (r) { return r.当たる(s); })
      .map(function (r) { return { id: r.id, なぜ: r.なぜ }; });
    return { ok: !破.length, 破り: 破, seed: s };
  }

  /* いちばん近い有効な Seed。**1 軸を 1 段ずつ**しか動かさない。 */
  function nearestValidSeed(seedIn) {
    var s = S.normalize(seedIn);
    var 直した = [], 回 = 0;
    while (回 < 24) {
      var 破 = null;
      for (var i = 0; i < 禁.length; i++) if (禁[i].当たる(s)) { 破 = 禁[i]; break; }
      if (!破) break;
      var 軸 = 破.直す.軸, 先 = 破.直す.先;
      var v = S.valuesOf(軸);
      var いま = v.indexOf(s[軸]), さき = v.indexOf(先);
      var 次 = いま === さき ? さき : (いま < さき ? いま + 1 : いま - 1);   /* 1 段だけ */
      var o = {};
      Object.keys(s).forEach(function (k) { o[k] = s[k]; });
      o[軸] = v[次];
      直した.push({ なぜ: 破.なぜ, 軸: 軸, 前: s[軸], 後: o[軸] });
      s = o;
      回++;
    }
    return { seed: s, 直した: 直した, ok: validateSeed(s).ok };
  }

  /* 試験と design-lab のための Seed 生成。
     通るまで引き直すのではなく、**必ず補正して返す**（§5.3）。 */
  function randomSeed(rng) {
    var f = typeof rng === "function" ? rng : Math.random;
    var o = {};
    S.ORDER.forEach(function (k) {
      var v = S.valuesOf(k);
      o[k] = v[Math.floor(f() * v.length) % v.length];
    });
    return nearestValidSeed(o).seed;
  }

  /* 再現できる乱数（試験で同じ 1000 件を作り直せるように） */
  function rngOf(seedNum) {
    var x = (seedNum | 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  VQD.constraints = {
    禁: 禁, validateSeed: validateSeed, nearestValidSeed: nearestValidSeed,
    randomSeed: randomSeed, rngOf: rngOf
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/layout-grammar.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/layout-grammar.js — レイアウトを「一覧」ではなく「割りかた」で持つ

   ★ 固定のレイアウト一覧を作らない。作った瞬間にテンプレになる。
     持つのは **分割の規則** だけ。
   ★ direction の意味をここで決めておく（あとで取り違えないため）:
       vertical   … 上下に積む（分割線が横に走る）
       horizontal … 左右に並べる（分割線が縦に走る）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* 許す比。ここに無い比は使わせない（目分量の比を作らせない）。 */
  var RATIOS = [
    /* ★ 1 分割のときの比 [1] を入れておく（2026-08-17・実測）。
       指示書の一覧には無いが、分割数 1 は許しているので
       これが無いと「許していない比」で 1 分割が すべて弾かれる。 */
    [1],
    [1, 1], [1, 2], [2, 1], [2, 3], [3, 2], [1, 1.618], [1.618, 1],
    [1, 1, 1], [1, 2, 1], [1, 1, 1, 1]
  ];
  function ratioKey(r) { return (r || []).join(":"); }
  var RATIO_KEYS = RATIOS.map(ratioKey);

  /* ★ 部品を増やした（2026-08-17・訴え「素人感が否めない・機能を増やして」）。
     text / 図形 / 線 / 矢印 / 表 / グラフ / 大きな数字 の 7 つだけでは
     「文字を置いただけ」の資料にしかならなかった。
     資料でよく使う **かたまり**を 役目として足す。
     どれも 既存の部品の組み合わせなので、アプリ側の変更は要らない。 */
  var ROLES = ["heading", "subheading", "body", "bullets", "image", "diagram",
               "metric", "quote", "table", "chart", "spacer",
               "steps",    /* 番号つきの手順（丸番号＋見出し＋説明） */
               "compare",  /* 2 つを 並べて比べるカード */
               "kpi",      /* 大きな数字を 2〜4 個 並べる */
               "callout",  /* 囲みの強調（ひとこと） */
               "timeline", /* 横軸の年表（線＋点＋ラベル） */
               "section"   /* セクションの扉（大きな番号＋見出し） */];
  /* 声からは写真を入れられない。**入れられないものを選ばせない。** */
  var ROLES_使える = ROLES.filter(function (r) { return r !== "image"; });

  var ALIGNS = ["start", "center", "end"];
  var EMPH = ["primary", "secondary", "tertiary"];
  var GRAVITY = ["left", "center", "asymmetric"];
  var DIRECTION = ["vertical", "horizontal"];

  /* ページの役目。自由記述にしない（§10）。 */
  var PURPOSES = ["title", "agenda", "problem", "solution", "concept", "target",
                  "method", "process", "timeline", "budget", "data", "comparison",
                  "case", "team", "risk", "metric", "quote", "detail",
                  "summary", "cta", "closing", "question"];

  /* 大きな面を必要とする役目（比の 0.4 以上を占めること） */
  var 大きく要る = ["table", "chart", "diagram", "image",
                    "steps", "compare", "kpi", "timeline"];

  function 正規化(spec) {
    var s = spec || {};
    var p = s.partition || {};
    var count = Math.max(1, Math.min(4, parseInt(p.count, 10) || 1));
    var dir = DIRECTION.indexOf(p.direction) >= 0 ? p.direction : "vertical";
    var ratio = Array.isArray(p.ratio) ? p.ratio.map(Number) : null;
    if (!ratio || ratio.length !== count || RATIO_KEYS.indexOf(ratioKey(ratio)) < 0) {
      /* 数が合わない比は 同じ長さの許した比のうち いちばん先頭のものへ寄せる */
      var 候補 = RATIOS.filter(function (r) { return r.length === count; });
      ratio = 候補.length ? 候補[0].slice() : [1];
    }
    var slots = (Array.isArray(s.slots) ? s.slots : []).slice(0, count).map(function (x) {
      x = x || {};
      return {
        role: ROLES.indexOf(x.role) >= 0 ? x.role : "body",
        align: ALIGNS.indexOf(x.align) >= 0 ? x.align : "start",
        emphasis: EMPH.indexOf(x.emphasis) >= 0 ? x.emphasis : "secondary"
      };
    });
    while (slots.length < count) slots.push({ role: "body", align: "start", emphasis: "secondary" });
    var gravity = GRAVITY.indexOf(s.gravity) >= 0 ? s.gravity : "left";
    if (count === 1 && gravity === "asymmetric") gravity = "left";
    /* spacer は必ず三次 */
    slots.forEach(function (x) { if (x.role === "spacer") x.emphasis = "tertiary"; });
    /* ★ **全部 spacer のページは作らせない**（2026-08-17・実測）。
       中身が 1 つも無い＝白紙のページ。Gate は spacer を空とみなさないので
       素通りし、多様性の直しでも候補が 1 つも作れず 詰まっていた。 */
    if (slots.length && slots.every(function (x) { return x.role === "spacer"; }))
      slots[0] = { role: "body", align: slots[0].align, emphasis: "primary" };
    /* ★ 空けておく枠（spacer）は **いちばん狭いところ**へ（2026-08-17・実測）。
       body と spacer を 1:1 で割ると 画面の半分が ただの空白になり、
       作りかけに見えていた。余白は「残り」であって「主役」ではない。 */
    (function () {
      var 和 = ratio.reduce(function (a, b) { return a + b; }, 0);
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].role !== "spacer") continue;
        var 小 = i, 小割 = ratio[i] / 和;
        for (var k = 0; k < slots.length; k++) {
          if (slots[k].role === "spacer") continue;
          if (ratio[k] / 和 < 小割) { 小 = k; 小割 = ratio[k] / 和; }
        }
        if (小 !== i) { var t2 = slots[i]; slots[i] = slots[小]; slots[小] = t2; }
      }
    })();
    /* primary は 1 枚に 1 つだけ */
    var 主 = slots.filter(function (x) { return x.emphasis === "primary"; });
    if (主.length === 0) {
      var 先 = slots.filter(function (x) { return x.role !== "spacer"; })[0];
      if (先) 先.emphasis = "primary";
    } else if (主.length > 1) {
      var 見た = false;
      slots.forEach(function (x) {
        if (x.emphasis !== "primary") return;
        if (見た) x.emphasis = "secondary"; else 見た = true;
      });
    }
    return { partition: { count: count, direction: dir, ratio: ratio },
             slots: slots, gravity: gravity, bleed: !!s.bleed };
  }

  /* 比のうち そのスロットが占める割合 */
  function 取り分(spec, i) {
    var r = spec.partition.ratio;
    var 和 = r.reduce(function (a, b) { return a + b; }, 0);
    return 和 ? r[i] / 和 : 0;
  }

  function validateSpec(specIn) {
    var s = 正規化(specIn), 悪 = [];
    if (s.slots.length !== s.partition.count) 悪.push("スロットの数が 分割の数と合わない");
    if (RATIO_KEYS.indexOf(ratioKey(s.partition.ratio)) < 0) 悪.push("許していない比: " + ratioKey(s.partition.ratio));
    if (s.partition.ratio.length !== s.partition.count) 悪.push("比の数が 分割の数と合わない");
    if (s.partition.count === 1 && s.gravity === "asymmetric") 悪.push("1 分割で asymmetric は使えない");
    if (s.slots.filter(function (x) { return x.emphasis === "primary"; }).length !== 1)
      悪.push("primary は 1 ページに ちょうど 1 つ");
    if (s.slots.every(function (x) { return x.role === "spacer"; }))
      悪.push("中身が 1 つも無い（全部 spacer）");
    s.slots.forEach(function (x, i) {
      if (x.role === "spacer" && x.emphasis !== "tertiary") 悪.push((i + 1) + " 番目: spacer は tertiary のみ");
      if (大きく要る.indexOf(x.role) >= 0 && 取り分(s, i) < 0.4)
        悪.push((i + 1) + " 番目: " + x.role + " は 面の 40% 以上が要る（いま "
          + Math.round(取り分(s, i) * 100) + "%）");
    });
    return { ok: !悪.length, 悪: 悪, spec: s };
  }

  /* だめな Spec を **計算で** 通る形へ寄せる（LLM に作り直させない）。 */
  function 直す(specIn) {
    var s = 正規化(specIn);
    var 直し = [];
    /* ① 大きな面が要る役目が 小さい枠にいる
       ★ 直す順番（2026-08-17・実測）:
         (a) 同じ枠のまま 比を変える
         (b) だめなら **その役目を 広い枠へ移す**（比も変えてよい）
         (c) それでも無理なら body へ落とす（最後の手。ここに来たら記録する）
       前は (a) がだめなら いきなり (c) だったので、
       3 分割の 1 番目に置かれたグラフが 黙って消えていた。 */
    s.slots.forEach(function (x, i) {
      if (大きく要る.indexOf(x.role) < 0 || 取り分(s, i) >= 0.4) return;
      var 同じ長さ = RATIOS.filter(function (r) { return r.length === s.partition.count; });
      var その場 = 同じ長さ.filter(function (r) {
        var 和 = r.reduce(function (a, b) { return a + b; }, 0);
        return r[i] / 和 >= 0.4;
      });
      if (その場.length) {
        s.partition.ratio = その場[0].slice();
        直し.push("比を " + ratioKey(s.partition.ratio) + " にした");
        return;
      }
      /* (b) 広い枠を作れる比を探して、そこへ 入れ替える */
      var 見つけた = null;
      同じ長さ.some(function (r) {
        var 和 = r.reduce(function (a, b) { return a + b; }, 0);
        for (var k = 0; k < r.length; k++) {
          if (k === i) continue;
          if (r[k] / 和 < 0.4) continue;
          if (大きく要る.indexOf(s.slots[k].role) >= 0) continue;   /* 相手も広い役なら 交換できない */
          見つけた = { r: r, k: k };
          return true;
        }
        return false;
      });
      if (見つけた) {
        s.partition.ratio = 見つけた.r.slice();
        var t = s.slots[i]; s.slots[i] = s.slots[見つけた.k]; s.slots[見つけた.k] = t;
        直し.push((i + 1) + " 番目の " + x.role + " を " + (見つけた.k + 1)
          + " 番目（広いほう）へ移し、比を " + ratioKey(s.partition.ratio) + " にした");
        return;
      }
      s.slots[i].role = "body";
      直し.push((i + 1) + " 番目を body にした（どの比でも 40% を作れない）");
    });
    var v = validateSpec(s);
    return { spec: v.spec, ok: v.ok, 悪: v.悪, 直し: 直し };
  }

  /* ── 決まった作りかた（LLM の出力が壊れていたときの受け皿）──────
     ★ テンプレではない。**壊れたときだけ**使う最後の砦で、
       purpose と 何枚目かで 形が変わる。 */
  function 受け皿(purpose, index) {
    var i = (index | 0);
    var 表 = {
      title: { partition: { count: 2, direction: "vertical", ratio: [1, 1] },
               slots: [{ role: "heading", align: "start", emphasis: "primary" },
                       { role: "subheading", align: "start", emphasis: "tertiary" }],
               gravity: "left", bleed: true },
      timeline: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
                  slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                          { role: "table", align: "start", emphasis: "primary" }],
                  gravity: "left", bleed: false },
      budget: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
                slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                        { role: "chart", align: "center", emphasis: "primary" }],
                gravity: "left", bleed: false },
      data: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
              slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                      { role: "chart", align: "center", emphasis: "primary" }],
              gravity: "left", bleed: false },
      team: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
              slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                      { role: "table", align: "start", emphasis: "primary" }],
              gravity: "left", bleed: false },
      metric: { partition: { count: 3, direction: "horizontal", ratio: [1, 1, 1] },
                slots: [{ role: "metric", align: "center", emphasis: "primary" },
                        { role: "metric", align: "center", emphasis: "secondary" },
                        { role: "metric", align: "center", emphasis: "secondary" }],
                gravity: "center", bleed: false },
      quote: { partition: { count: 1, direction: "vertical", ratio: [1] },
               slots: [{ role: "quote", align: "center", emphasis: "primary" }],
               gravity: "center", bleed: true },
      comparison: { partition: { count: 2, direction: "horizontal", ratio: [1, 1] },
                    slots: [{ role: "bullets", align: "start", emphasis: "primary" },
                            { role: "bullets", align: "start", emphasis: "secondary" }],
                    gravity: "left", bleed: false },
      closing: { partition: { count: 1, direction: "vertical", ratio: [1] },
                 slots: [{ role: "heading", align: "center", emphasis: "primary" }],
                 gravity: "center", bleed: true }
    };
    if (表[purpose]) return 正規化(表[purpose]);
    /* 決まっていない purpose は 何枚目かで 形を変える（同じ顔を続けない） */
    var 型 = [
      { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
        slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                { role: "bullets", align: "start", emphasis: "primary" }],
        gravity: "left", bleed: false },
      { partition: { count: 2, direction: "horizontal", ratio: [1, 1.618] },
        slots: [{ role: "heading", align: "start", emphasis: "primary" },
                { role: "body", align: "start", emphasis: "secondary" }],
        gravity: "asymmetric", bleed: false },
      { partition: { count: 3, direction: "horizontal", ratio: [1, 1, 1] },
        slots: [{ role: "body", align: "start", emphasis: "primary" },
                { role: "body", align: "start", emphasis: "secondary" },
                { role: "body", align: "start", emphasis: "secondary" }],
        gravity: "center", bleed: false },
      { partition: { count: 2, direction: "vertical", ratio: [2, 3] },
        slots: [{ role: "heading", align: "start", emphasis: "primary" },
                { role: "table", align: "start", emphasis: "secondary" }],
        gravity: "left", bleed: true }
    ];
    return 正規化(型[i % 型.length]);
  }

  /* 試験のための Spec 生成（Phase 2 の 20 枚 × 50 デッキで使う） */
  function randomSpec(rng, opts) {
    var f = typeof rng === "function" ? rng : Math.random;
    var o = opts || {};
    var pick = function (a) { return a[Math.floor(f() * a.length) % a.length]; };
    var 候補 = RATIOS.filter(function (r) { return !o.count || r.length === o.count; });
    var ratio = pick(候補);
    var count = ratio.length;
    var slots = [];
    for (var i = 0; i < count; i++) {
      slots.push({ role: pick(ROLES_使える), align: pick(ALIGNS), emphasis: pick(EMPH) });
    }
    var s = { partition: { count: count, direction: pick(DIRECTION), ratio: ratio },
              slots: slots, gravity: pick(GRAVITY), bleed: f() < 0.35 };
    return 直す(s).spec;
  }

  VQD.grammar = {
    RATIOS: RATIOS, ROLES: ROLES, ROLES_使える: ROLES_使える, ALIGNS: ALIGNS,
    EMPH: EMPH, GRAVITY: GRAVITY, DIRECTION: DIRECTION, PURPOSES: PURPOSES,
    正規化: 正規化, 取り分: 取り分, validateSpec: validateSpec, 直す: 直す,
    受け皿: 受け皿, randomSpec: randomSpec, ratioKey: ratioKey
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/layout-diversity.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/layout-diversity.js — 「毎ページ同じ顔」を 数で止める

   ★ 「見た目が違うか」を LLM に聞かない。特徴ベクトルを作って数で比べる。
   ★ 違反したページ **だけ** を選び直す。デッキ全体を作り直さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  function 安定ハッシュ(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % 997;
  }

  /* 特徴ベクトル（§6.2）*/
  function vec(specIn) {
    var s = G.正規化(specIn);
    var 主 = -1;
    s.slots.forEach(function (x, i) { if (x.emphasis === "primary" && 主 < 0) 主 = i; });
    var 役 = s.slots.map(function (x) { return x.role; }).slice().sort().join(",");
    return [
      s.partition.count,
      s.partition.direction === "vertical" ? 0 : 1,
      G.RATIOS.map(G.ratioKey).indexOf(G.ratioKey(s.partition.ratio)),
      G.GRAVITY.indexOf(s.gravity),
      s.bleed ? 1 : 0,
      主,
      安定ハッシュ(役)
    ];
  }
  function key(specOrVec) {
    var v = Array.isArray(specOrVec) ? specOrVec : vec(specOrVec);
    return v.join("/");
  }
  function 違う軸(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  }

  /* デッキ全体を見る。返すのは **どのページが だめか** だけ。 */
  function checkDiversity(specs) {
    var vs = (specs || []).map(vec);
    var 悪 = [];
    for (var i = 1; i < vs.length; i++) {
      var d = 違う軸(vs[i - 1], vs[i]);
      if (d < 3) 悪.push({ 番: i + 1, なぜ: "前のページと " + d + " 軸しか違わない（3 軸以上 要る）" });
    }
    for (var j = 0; j < vs.length; j++) {
      var 窓 = vs.slice(Math.max(0, j - 4), j + 1);
      if (窓.length === 5) {
        var 数 = {};
        窓.forEach(function (v) { 数[v[0]] = (数[v[0]] || 0) + 1; });
        var 最 = Math.max.apply(null, Object.keys(数).map(function (k) { return 数[k]; }));
        if (最 >= 4) 悪.push({ 番: j + 1, なぜ: "直近 5 枚のうち " + 最 + " 枚が 同じ分割数" });
      }
    }
    var 種 = {};
    vs.forEach(function (v) { 種[key(v)] = 1; });
    var 要る = Math.min(Math.max(1, Math.ceil(vs.length / 3)), 5);
    var 全体 = Object.keys(種).length;
    if (vs.length >= 2 && 全体 < 要る)
      悪.push({ 番: 0, なぜ: "デッキ全体で " + 全体 + " 種類しかない（" + 要る + " 種類 以上 要る）" });
    /* 同じ番号を二重に出さない */
    var 見た = {}, 出 = [];
    悪.forEach(function (x) { var k = x.番 + "|" + x.なぜ; if (!見た[k]) { 見た[k] = 1; 出.push(x); } });
    return { ok: !出.length, 悪: 出, 種類: 全体, 要る種類: 要る, ベクトル: vs };
  }

  /* 中身を持つ「重い役」。ここは 何があっても 落とさない。 */
  var 重い役 = ["heading", "table", "chart", "diagram", "metric", "quote", "bullets"];
  /* そのうち **面の 40% 以上**が要るもの（layout-grammar の決まりと同じ） */
  var 面が要る = ["table", "chart", "diagram", "image"];

  /* その位置に置ける候補。
     ★ **重い役は 1 つも落とさない**（2026-08-17・実測）。
       落とすと、頼まれていた 表・グラフの枠が 黙って消える。
       通しの試験で「表とグラフを入れて」と言った 10 枚から 両方 消えていた。
     ★ そのままの形しか許さないと 多様性が作れないので、
       中身を書いたあと（かたい=true）だけ **枠の数も役目も固定**し、
       まだ書く前は 重い役を保ったまま 枠を増やしてよいことにする。 */
  function 候補一覧(いま, 禁じ分割数, かたい) {
    var 役 = いま.slots.map(function (x) { return x.role; });
    var 重 = いま.slots.map(function (x) { return x.emphasis; });
    var 寄 = いま.slots.map(function (x) { return x.align; });
    var 要る = 役.filter(function (r) { return 重い役.indexOf(r) >= 0; });
    var 候補 = [];
    G.RATIOS.forEach(function (r) {
      if (禁じ分割数 && r.length === 禁じ分割数) return;
      if (かたい ? r.length !== 役.length : r.length < 要る.length) return;
      G.DIRECTION.forEach(function (d) {
        G.GRAVITY.forEach(function (g) {
          [false, true].forEach(function (bl) {
            if (r.length === 1 && g === "asymmetric") return;
            var slots = [];
            if (かたい) {
              for (var k = 0; k < r.length; k++)
                slots.push({ role: 役[k], align: 寄[k], emphasis: 重[k] });
            } else {
              /* ★ 面の広い役（表・グラフ・図解）は **広い枠へ**（2026-08-17・実測）。
                 前から順に詰めていたので、3 分割のときは グラフが必ず
                 いちばん狭い枠（25〜33%）に入り、「40% 以上 要る」に引っかかって
                 候補が 1 つも作れず、分割数を変えられなくなっていた。
                 その結果 同じ分割数が 4 枚続き、多様性が 50 デッキ中 19 で落ちていた。 */
              var 和 = r.reduce(function (x, y) { return x + y; }, 0);
              var 順 = r.map(function (v, k3) { return { k: k3, 割: v / 和 }; })
                .sort(function (x, y) { return y.割 - x.割; });
              var 広い役 = 要る.filter(function (x) { return 面が要る.indexOf(x) >= 0; });
              var 細い役 = 要る.filter(function (x) { return 面が要る.indexOf(x) < 0; });
              var 割当 = new Array(r.length);
              広い役.forEach(function (x, k4) { if (順[k4]) 割当[順[k4].k] = x; });
              var 残枠 = [];
              for (var k5 = 0; k5 < r.length; k5++) if (!割当[k5]) 残枠.push(k5);
              細い役.forEach(function (x, k6) { if (残枠[k6] !== undefined) 割当[残枠[k6]] = x; });
              for (var k7 = 0; k7 < r.length; k7++)
                slots.push({ role: 割当[k7] || "body",
                             align: 寄[Math.min(k7, 寄.length - 1)],
                             emphasis: k7 === 0 ? "primary" : "secondary" });
            }
            var sp = G.直す({ partition: { count: r.length, direction: d, ratio: r },
                              slots: slots, gravity: g, bleed: bl });
            var 保てた = 要る.every(function (x) {
              return sp.spec.slots.some(function (y) { return y.role === x; });
            });
            if (sp.ok && 保てた) 候補.push(sp.spec);
          });
        });
      });
    });
    return 候補;
  }

  /* 違反ページを **そのページだけ** 選び直す。
     ★ 直前のページと 3 軸以上 違う候補を、決まった順に探す。
       乱数を使わない（同じ入力からは同じ直しが出る）。 */
  function 選び直す(specs, 番, seedNum, 禁じ分割数, かたい) {
    var i = 番 - 1;
    if (i < 0 || i >= specs.length) return null;
    var 前 = i > 0 ? vec(specs[i - 1]) : null;
    var 次 = i + 1 < specs.length ? vec(specs[i + 1]) : null;
    var いま = G.正規化(specs[i]);
    /* ★ 「直近 5 枚のうち 4 枚が 同じ分割数」を直すときは、その分割数を外す。
       候補の作りかたは 候補一覧 と 1 本にまとめてある（役目を落とさない）。 */
    var 候補 = 候補一覧(いま, 禁じ分割数, かたい);
    /* 決まった順で回すが、開始位置だけ Seed でずらす（同じ形に偏らないため） */
    var 開始 = ((seedNum | 0) % Math.max(1, 候補.length) + 候補.length) % Math.max(1, 候補.length);
    var 片方だけ = null;
    for (var t = 0; t < 候補.length; t++) {
      var c = 候補[(開始 + t) % 候補.length];
      var v = vec(c);
      var 前OK = !前 || 違う軸(前, v) >= 3;
      var 次OK = !次 || 違う軸(次, v) >= 3;
      if (前OK && 次OK) return c;
      /* ★ 両隣を同時に満たす形が無いことがある（2026-08-17・実測）。
         そのときは **前とだけ** 満たす形を覚えておき、
         次のページは 次の回で直す。全部あきらめるより ずっと良い。 */
      if (前OK && !片方だけ) 片方だけ = c;
    }
    return 片方だけ;
  }

  /* ══ デッキ全体を そろえる ═══════════════════════════════════════
     ★ **前から 1 回で決める**（2026-08-17・実測）。
       前は「違反したページを直す」を繰り返していたが、直すと隣が壊れ、
       60 回まわしても 50 デッキ中 11 デッキが通らなかった（振動）。
       すでに確定した手前だけを見て 1 枚ずつ決めれば、必ず 1 周で終わる。 */
  function 整える(specs, seedNum) {
    var 元 = (specs || []).map(function (s) { return G.正規化(s); });
    var 出 = [], 直し = [];
    元.forEach(function (sp, i) {
      if (i === 0) { 出.push(sp); return; }
      var 前 = vec(出[i - 1]);
      /* ★ 窓の見かた（2026-08-17・実測で直した）。
         「自分が選ぶ分割数」だけ見ていては足りない。
         **4 枚が すでに同じ**なら、自分が何を選んでも その窓は壊れている。
         だから 4 枚そろう前（i=3）から止める。 */
      var 窓 = 出.slice(Math.max(0, i - 4)), 数 = {};
      窓.forEach(function (s2) { var c = s2.partition.count; 数[c] = (数[c] || 0) + 1; });
      function 窓OK(c) {
        if (窓.length + 1 < 4) return true;
        var n2 = {};
        Object.keys(数).forEach(function (k) { n2[k] = 数[k]; });
        n2[c] = (n2[c] || 0) + 1;
        var 最 = 0;
        Object.keys(n2).forEach(function (k) { if (n2[k] > 最) 最 = n2[k]; });
        return 最 < 4;
      }

      var v0 = vec(sp);
      if (違う軸(前, v0) >= 3 && 窓OK(sp.partition.count)) { 出.push(sp); return; }

      var 候補 = 候補一覧(sp, 0, false);
      var 開始 = 候補.length ? (((seedNum | 0) + i * 13) % 候補.length + 候補.length) % 候補.length : 0;
      /* ★ 落としどころを 2 段にする（2026-08-17・実測）。
         前は「3 軸そろわなければ いちばん違う形」だけだったので、
         窓の決まり（直近 5 枚で 同じ分割数 4 回）を 平気で踏んでいた。
         1000 枚中 29 枚が それだった。窓を優先する候補を 先に探す。 */
      /* ★ **その場しのぎで選ばない**（2026-08-17・実測）。
         条件を満たす最初の候補を採ると、同じ分割数が 3 連続してしまい、
         次のページが 何を選んでも 窓の決まりを踏む（1000 枚中 29 枚）。
         満たす候補の中から **直近であまり使っていない分割数**を選ぶ。 */
      var 良 = [], 窓だけ = null, 窓だけ差 = -1, 次点 = null, 次点差 = -1;
      for (var t = 0; t < 候補.length; t++) {
        var c = 候補[(開始 + t) % 候補.length], v = vec(c), d = 違う軸(前, v);
        var wok = 窓OK(c.partition.count);
        if (d >= 3 && wok) 良.push(c);
        else if (wok && d > 窓だけ差) { 窓だけ差 = d; 窓だけ = c; }
        else if (d > 次点差) { 次点差 = d; 次点 = c; }
      }
      var 選 = null;
      if (良.length) {
        var 少 = Infinity;
        良.forEach(function (c2) {
          var n3 = 数[c2.partition.count] || 0;
          if (n3 < 少) { 少 = n3; 選 = c2; }
        });
      }
      var 決 = 選 || 窓だけ || 次点 || sp;
      直し.push({ 番: i + 1, なぜ: 選 ? "前と 3 軸そろえた" : "満たす形が無いので いちばん違う形にした" });
      出.push(決);
    });

    /* 全体の種類が足りないときだけ、後ろから 1 枚ずつ 形を変える */
    var 回2 = 0;
    while (回2 < 20) {
      var r2 = checkDiversity(出);
      if (r2.ok || r2.悪.every(function (x) { return x.番 > 0; })) break;
      var 数3 = {}, 最多 = "", 最 = 0;
      出.forEach(function (s) { var k = key(s); 数3[k] = (数3[k] || 0) + 1; if (数3[k] > 最) { 最 = 数3[k]; 最多 = k; } });
      var 的番 = -1;
      for (var j = 出.length - 1; j >= 1; j--) if (key(出[j]) === 最多) { 的番 = j; break; }
      if (的番 < 0) break;
      var n2 = 選び直す(出, 的番 + 1, (seedNum | 0) + 回2 * 5, 0, false);
      if (!n2) break;
      出[的番] = n2;
      直し.push({ 番: 的番 + 1, なぜ: "デッキ全体の種類が足りない" });
      回2++;
    }
    return { specs: 出, 直し: 直し, 結果: checkDiversity(出) };
  }

  /* 旧: 違反したページだけ直す作り（外から使う口として残す） */
  function 直しながら整える(specs, seedNum) {
    var 出 = (specs || []).map(function (s) { return G.正規化(s); });
    var 直し = [], 回 = 0;
    /* ★ 直せないページが 1 枚あっても **そこで全部やめない**（2026-08-17・実測）。
       前は null が返った瞬間に break していたので、その先のページの
       違反が まるごと残り、50 デッキ中 12 デッキが通らなかった。 */
    var 諦め = {};
    while (回 < 60) {
      var r = checkDiversity(出);
      if (r.ok) break;
      var 残 = r.悪.filter(function (x) { return x.番 > 0 && !諦め[x.番]; });
      /* 窓の決まり（直近 5 枚）を **先に**直す。
         隣どうしの決まりだけ直していると、窓のほうが永久に残る。 */
      var 的 = null;
      for (var i0 = 0; i0 < 残.length; i0++)
        if (/直近/.test(残[i0].なぜ)) { 的 = 残[i0]; break; }
      if (!的 && 残.length) 的 = 残[0];
      if (!的) {
        /* 全体の種類が足りない: いちばん多く出ている形のページを 1 枚 選び直す */
        var 数 = {}, 最多 = "", 最 = 0;
        出.forEach(function (s) { var k = key(s); 数[k] = (数[k] || 0) + 1; if (数[k] > 最) { 最 = 数[k]; 最多 = k; } });
        for (var j = 出.length - 1; j >= 0; j--)
          if (key(出[j]) === 最多 && !諦め[j + 1]) { 的 = { 番: j + 1, なぜ: "種類が足りない" }; break; }
      }
      if (!的) break;
      var 禁 = 0;
      if (/直近/.test(的.なぜ || "")) {
        var 窓 = 出.slice(Math.max(0, 的.番 - 5), 的.番), 数2 = {}, 最2 = 0;
        窓.forEach(function (s2) { var c2 = G.正規化(s2).partition.count;
          数2[c2] = (数2[c2] || 0) + 1; if (数2[c2] > 最2) { 最2 = 数2[c2]; 禁 = c2; } });
      }
      var n = 選び直す(出, 的.番, (seedNum | 0) + 回 * 7, 禁);
      if (!n) { 諦め[的.番] = 1; 回++; continue; }
      直し.push({ 番: 的.番, なぜ: 的.なぜ });
      出[的.番 - 1] = n;
      回++;
    }
    return { specs: 出, 直し: 直し, 結果: checkDiversity(出) };
  }

  VQD.diversity = { vec: vec, key: key, 違う軸: 違う軸, 候補一覧: 候補一覧, 重い役: 重い役,
                    checkDiversity: checkDiversity, 選び直す: 選び直す,
                    整える: 整える, 直しながら整える: 直しながら整える };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/layout-resolve.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/layout-resolve.js — LayoutSpec + Tokens → **絶対座標**

   ★ ここも計算だけ。LLM はいない。
   ★ 座標は必ず 4 の倍数へ寄せる（4px グリッド）。
   ★ 飾り（地に敷くもの・帯・カードの下地）は 装飾:true を付ける。
     Gate の「重なり」は 装飾 を数えない。**下に敷くのは重なりではない。**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  function 四(v) { return Math.round(v / 4) * 4; }
  /* ★ 枠を割るときは **内側へ** 寄せる（2026-08-17・実測）。
     四捨五入で寄せると、端の枠が 1〜3px ずつ外へ出て、
     Gate の「はみ出し」が 818 件 出ていた。始まりは切り上げ、
     大きさは切り捨て。こうすると 絶対に外へ出ない。 */
  function 上四(v) { return Math.ceil(v / 4) * 4; }
  function 下四(v) { return Math.floor(v / 4) * 4; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ── 文字の実寸（推定）───────────────────────────────────────
     和文は全角 1.0em、英数と半角カナは 0.5em で近似する。
     **推定であることを前提に**、Gate では枠の 85% を超えたら溢れ扱い。 */
  function 幅em(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      n += (c < 0x80 || (c >= 0xff61 && c <= 0xff9f)) ? 0.5 : 1.0;
    }
    return n;
  }
  function 測る(text, size, w, lh) {
    var 行 = 0;
    String(text === undefined || text === null ? "" : text).split("\n").forEach(function (p) {
      var per = Math.max(1, w / size);
      行 += Math.max(1, Math.ceil(幅em(p) / per));
    });
    return Math.ceil(行 * size * lh);
  }

  var 連番 = 0;
  function uid() {連番++; return "d" + 連番.toString(36) + Math.floor(連番 * 2654435761 % 1679616).toString(36); }
  function 番号を戻す() { 連番 = 0; }        /* 試験で id を揃えるため */

  /* ── 大きさと色の決めかた ───────────────────────────────────── */
  function 字大(t, role, emphasis, purpose) {
    var S = t.type.size;
    if (role === "heading")
      return purpose === "title" || purpose === "closing" ? S.display
        : (emphasis === "primary" ? S.h1 : (emphasis === "secondary" ? S.h2 : S.h3));
    if (role === "subheading") return emphasis === "primary" ? S.h2 : S.h3;
    if (role === "quote") return emphasis === "primary" ? S.h2 : S.h3;
    if (role === "metric" || role === "kpi") return S.display;
    if (role === "section") return S.h1;
    if (role === "callout") return S.h3;
    if (role === "diagram" || role === "steps" || role === "compare" || role === "timeline") return S.body;
    return emphasis === "tertiary" ? S.caption : S.body;
  }
  function 字色(t, role) {
    if (role === "subheading") return t.color.textSecondary;
    return t.color.textPrimary;
  }
  function 揃え(a) { return a === "center" ? "center" : (a === "end" ? "right" : "left"); }

  /* ── 分割 ───────────────────────────────────────────────────
     horizontal は **列グリッドの上で**割る（grid が効く場所）。
     vertical は 高さを比で割る。 */
  function 枠を割る(spec, 箱, t) {
    var r = spec.partition.ratio, n = spec.partition.count;
    var 和 = r.reduce(function (a, b) { return a + b; }, 0);
    var 出 = [];
    if (spec.partition.direction === "horizontal") {
      var 列 = t.grid, gut = t.space.gutter;
      var colW = (箱.w - gut * (列 - 1)) / 列;
      var 割 = r.map(function (v) { return Math.max(1, Math.round(列 * v / 和)); });
      var 差 = 列 - 割.reduce(function (a, b) { return a + b; }, 0);
      while (差 !== 0) {                       /* 端数を いちばん大きい枠で吸う */
        var i = 0, best = -1;
        割.forEach(function (v, k) { if (v > best) { best = v; i = k; } });
        if (差 > 0) { 割[i]++; 差--; } else { if (割[i] > 1) { 割[i]--; 差++; } else break; }
      }
      var x = 箱.x;
      割.forEach(function (c) {
        var w = c * colW + (c - 1) * gut;
        var X = 上四(x);
        出.push({ x: X, y: 上四(箱.y), w: Math.max(8, 下四(x + w - X)), h: 下四(箱.y + 箱.h - 上四(箱.y)) });
        x += w + gut;
      });
    } else {
      var gap = t.space.blockGap;
      var 使える = 箱.h - gap * (n - 1);
      var y = 箱.y;
      r.forEach(function (v) {
        var h = 使える * v / 和;
        var Y = 上四(y);
        出.push({ x: 上四(箱.x), y: Y, w: 下四(箱.x + 箱.w - 上四(箱.x)), h: Math.max(8, 下四(y + h - Y)) });
        y += h + gap;
      });
    }
    return 出;
  }

  /* ══ その中身が **実際に要る高さ**（2026-08-17・訴え「余白が多い」）═══
     ★ 枠は 比だけで割っていたので、見出し 1 行の枠にも 画面の 1/3 を
       与えていた。中身の量を見ずに割れば 余白が出るのは当たり前。
     ★ ここで「最低これだけ要る」を出し、余ったぶんは
       伸びて嬉しい枠（表・グラフ・図解・本文）へ回す。 */
  function 必要高(t, slot, 中, w, purpose) {
    var role = slot.role;
    if (role === "spacer") return 0;
    var size = 字大(t, role, slot.emphasis, purpose);
    var lh = t.type.行間(size);
    var 余 = t.space.inlineGap;
    if (role === "heading" || role === "subheading") {
      var h = 測る(String((中 && 中.text) || ""), size, w, lh);
      if (中 && 中.caption) h += 測る(String(中.caption), Math.min(t.type.size.h3, size), w, 1.5) + 余;
      if (t.seed.accent !== "none" && t.seed.accent !== "block") h += 余 + 10;
      return Math.ceil(h * 1.15);            /* 段が上がる余地を少しだけ見ておく */
    }
    if (role === "body") return Math.ceil(測る(String((中 && 中.text) || ""), size, w, lh) * 1.15);
    if (role === "bullets") {
      var 本 = ((中 && 中.items) || []).map(function (x) { return "・" + String(x); }).join("\n");
      return Math.ceil(測る(本, size, w, lh) * 1.15);
    }
    if (role === "quote") {
      var q = Math.ceil(測る(String((中 && 中.text) || ""), size, Math.max(40, w - 28), lh) * 1.15);
      if (中 && 中.caption) q += t.type.size.caption * 1.8 + 余;
      return q;
    }
    if (role === "metric") return Math.ceil(size * 1.25 + (中 && 中.caption ? t.type.size.caption * 1.8 : 0));
    if (role === "table") {
      var rows = ((中 && 中.rows) || []).length || 2;
      return Math.ceil(rows * Math.max(26, t.type.size.body * 1.9));
    }
    if (role === "chart") return 200;
    if (role === "diagram") return 96;
    var こま = ((中 && 中.cells) || (中 && 中.items) || []).length || 2;
    if (role === "steps") return w >= 300 ? 190 : Math.max(120, こま * 76);
    if (role === "compare") return w >= 300 ? 190 : Math.max(140, こま * 96);
    if (role === "kpi") return Math.ceil(t.type.size.h1 * 1.3 + t.type.size.caption * 1.9);
    if (role === "callout") return Math.ceil(測る(String((中 && 中.text) || ""), t.type.size.h3, Math.max(60, w - 40), 1.4) + 40);
    if (role === "timeline") return 170;
    if (role === "section") return Math.ceil(t.type.size.display * 1.1 + t.type.size.h1 * 1.3 + 24);
    return Math.ceil(測る(String((中 && 中.text) || ""), size, w, lh) * 1.15);
  }
  /* 余りを渡して嬉しい役（渡すと 表が伸び、字が 1 段 大きくなる） */
  var 伸びる役 = { table: 1, chart: 1, diagram: 1, image: 1, body: 1, bullets: 1, quote: 1, metric: 1,
                   steps: 1, compare: 1, kpi: 1, timeline: 1, callout: 1 };

  /* 上下に積む割りかたを **中身の量で** 配り直す */
  function 詰め直す(spec, 枠, 箱, t, 中身, purpose) {
    if (spec.partition.direction !== "vertical" || spec.partition.count < 2) return 枠;
    var n = spec.partition.count, gap = t.space.blockGap;
    var 使える = 箱.h - gap * (n - 1);
    var 必要 = spec.slots.map(function (s, i) {
      return Math.min(必要高(t, s, 中身[i] || null, 枠[i].w, purpose), 使える);
    });
    var 和 = 必要.reduce(function (a, b) { return a + b; }, 0);
    if (和 <= 0 || 和 >= 使える) return 枠;          /* 足りないなら 今までどおり */
    var r = spec.partition.ratio;
    var 重み = spec.slots.map(function (s, i) { return 伸びる役[s.role] ? r[i] : 0; });
    var 重和 = 重み.reduce(function (a, b) { return a + b; }, 0);
    if (!重和) { 重み = r.slice(); 重和 = r.reduce(function (a, b) { return a + b; }, 0); }
    var 余 = 使える - 和;
    var 高 = 必要.map(function (v, i) { return v + 余 * (重み[i] / 重和); });
    /* spacer は 最低限だけ残す（0 だと 詰まりすぎる） */
    高 = 高.map(function (v, i) { return spec.slots[i].role === "spacer" ? Math.max(8, v) : Math.max(24, v); });
    var 出 = [], y = 箱.y;
    高.forEach(function (h, i) {
      var Y = 上四(y);
      出.push({ x: 枠[i].x, y: Y, w: 枠[i].w, h: Math.max(8, 下四(y + h - Y)) });
      y += h + gap;
    });
    return 出;
  }

  /* ── 地に敷くもの ───────────────────────────────────────────── */
  function 地の作り(t, W, H) {
    var b = t.background, c = t.color;
    var css = c.bg, 飾 = [];
    if (b.kind === "gradient")
      css = "linear-gradient(" + b.角度 + "deg," + b.from + " 0%," + b.to + " 100%)";
    else if (b.kind === "texture")
      css = "radial-gradient(" + c.border + " 1.2px, transparent 1.2px) 0 0/" + b.間隔 + "px "
        + b.間隔 + "px, " + c.bg;
    else if (b.kind === "shapes") {
      /* ★ 角ばった四角を 隅に置くと **貼り忘れの当て紙**に見えた（目視）。
         丸いか、端まで通した帯か、どちらかにする。どちらも「わざと」に見える。 */
      var 大 = Math.round(H * 0.72);
      if (t.shape.kind === "sharp" || t.shape.kind === "angled") {
        var 厚 = Math.round(H * 0.34);
        飾.push(b.向き % 2
          ? { type: "shape", shape: "rect", x: 0, y: b.向き < 2 ? 0 : H - 厚, w: W, h: 厚, z: 0,
              fill: b.色, radius: 0, 装飾: true, はみ出し可: true, 役: "background" }
          : { type: "shape", shape: "rect", x: b.向き < 2 ? 0 : W - 厚, y: 0, w: 厚, h: H, z: 0,
              fill: b.色, radius: 0, 装飾: true, はみ出し可: true, 役: "background" });
      } else {
        var 位 = [[-大 * 0.42, -大 * 0.38], [W - 大 * 0.58, -大 * 0.42],
                  [-大 * 0.45, H - 大 * 0.5], [W - 大 * 0.5, H - 大 * 0.46]][b.向き % 4];
        飾.push({ type: "shape", shape: "circle",
                  x: Math.round(位[0]), y: Math.round(位[1]), w: 大, h: 大, z: 0,
                  fill: b.色, radius: 9999, 装飾: true, はみ出し可: true, 役: "background" });
      }
    }
    return { css: css, 飾: 飾 };
  }

  /* ── 端まで届く 1 本（bleed）──────────────────────────────── */
  function 端の帯(spec, t, W, H) {
    if (!spec.bleed) return null;
    var c = t.color, m = t.space.slideMargin;
    if (spec.gravity === "center")
      return { type: "shape", shape: "rect", x: 0, y: 0, w: W, h: 8, z: 0,
               fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
    if (spec.gravity === "asymmetric")
      return { type: "shape", shape: "rect", x: W - 12, y: 0, w: 12, h: H, z: 0,
               fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
    return { type: "shape", shape: "rect", x: 0, y: 0, w: Math.max(8, Math.round(m * 0.22)), h: H,
             z: 0, fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
  }
  /* ── 中身を 1 スロットぶん 置く ───────────────────────────────
     ★ 入りきらないときは **タイプスケールの段を 1 つ下げる**（2026-08-17）。
       px を 1 ずつ削ると、1 枚の中で大きさがばらばらになり
       「1 デッキで タイプスケールが統一されている」が壊れる。
       段の中でしか動かさないので、統一は保たれる。 */
  function 置く(出, 枠, slot, 中, t, spec, purpose, idx, 予算) {
    var role = slot.role;
    if (role === "spacer") return;
    var size = 字大(t, role, slot.emphasis, purpose);
    /* ★ 箇条書きと本文の **右揃えはしない**（2026-08-17・目視）。
       行頭がそろわず、読む順が分からなくなる。中央は残す。 */
    var al = 揃え((role === "bullets" || role === "body") && slot.align === "end"
      ? "start" : slot.align);

    /* ★ すでに置いた飾りの上に載るときの **本当の地の色**（2026-08-17・実測）。
       地に大きな図形を敷く作りのとき、その上へ差し色の数字を置くと
       比が 4.08 まで落ちていた（差し色と うすい差し色は 2000 件中 1435 件が
       4.5 未満）。うすい差し色を無理に離すと「うすい」でなくなるので、
       **文字の色のほうを 読める側へ替える**。 */
    function 背後(cx, cy, z) {
      var 色 = t.color.bg, 高 = -1;
      出.forEach(function (o) {
        if (o.type !== "shape" || !o.fill || (o.z || 0) > z) return;
        if (cx < o.x || cx > o.x + o.w || cy < o.y || cy > o.y + o.h) return;
        if ((o.z || 0) >= 高) { 高 = o.z || 0; 色 = o.fill; }
      });
      return 色;
    }

    /* 大きい順の段（重複は落とす）。14px より下へは行かない。 */
    var 段 = [t.type.size.display, t.type.size.h1, t.type.size.h2, t.type.size.h3,
              t.type.size.body, t.type.size.caption]
      .filter(function (v, i, a) { return v >= 14 && a.indexOf(v) === i; })
      .sort(function (a, b) { return b - a; });

    /* ★ 枠に対して **大きいほうから** 合わせる（2026-08-17・実測）。
       前は「決めた大きさから 下へ」しか動かさなかったので、
       広い枠に 18px の本文がぽつんと乗り、100 枚並べると
       半分ちかくが **スカスカで作りかけに見えた**。
       上限は emphasis で決める（primary > secondary > tertiary）ので、
       上下関係は崩れず、段の中でしか動かないので統一も保たれる。 */
    /* ★ 伸ばせる上限を **役目ごと**に変える（2026-08-17・実測）。
       前は どの役目も primary=h1 止まりだったので、
       見出し 1 つだけのページや 箇条書きだけのページが
       広い枠の上のほうに小さく乗り、**1000 枚中 261 枚が
       内側の 25% も埋まっていなかった**（＝スカスカに見える）。
       見出しは大きく、本文は本文らしく、で段を分ける。 */
    var S2 = t.type.size;
    var 天井 = (function () {
      if (role === "heading")
        return { primary: S2.display, secondary: S2.h1, tertiary: S2.h2 };
      if (role === "subheading" || role === "quote")
        return { primary: S2.h1, secondary: S2.h2, tertiary: S2.h3 };
      return { primary: S2.h1, secondary: S2.h2, tertiary: S2.h3 };
    })();
    if (purpose === "title" || purpose === "closing") 天井.primary = S2.display;
    /* ★ そのページに 中身が 1 つしか無いなら **いちばん大きい段**まで使う
       （2026-08-17・実測）。1 分割のページが 画面の 2〜3 割しか埋まらず、
       スカスカに見えていた。言うことが 1 つだけの回は、大きく出すのが正しい。 */
    if ((spec.slots || []).filter(function (x) { return x.role !== "spacer"; }).length === 1) {
      天井.primary = S2.display;
      天井.secondary = S2.h1;
      天井.tertiary = S2.h2;
    }

    function 収める(text, 開始, w, 制限, のばす) {
      var 上 = のばす === false ? 開始
        : Math.max(開始, Math.min(天井[slot.emphasis] || 開始, t.type.size.display));
      var 候補 = 段.filter(function (s) { return s <= 上; });
      if (!候補.length) 候補 = [段[段.length - 1]];
      /* ★ 短い見出しを 語の途中で折らない（2026-08-17・目視）。
         枠に合わせて大きくしたら「文化祭の企 / 画」「3 年 A 組実行委 / 員会」
         のように 2 行へ割れて 見苦しくなった。
         短い文（改行なし・18em 以下）は **1 行に収まる いちばん大きい段**を選ぶ。 */
      var 短い = String(text).indexOf("\n") < 0 && 幅em(String(text)) <= 18;
      if (短い) {
        for (var k0 = 0; k0 < 候補.length; k0++) {
          var s0 = 候補[k0], lh0 = t.type.行間(s0);
          if (幅em(String(text)) * s0 <= w && 測る(text, s0, w, lh0) <= 制限)
            return { size: s0, lh: lh0, h: 測る(text, s0, w, lh0) };
        }
      }
      for (var i = 0; i < 候補.length; i++) {
        var s = 候補[i], lh = t.type.行間(s), h = 測る(text, s, w, lh);
        if (h <= 制限) return { size: s, lh: lh, h: h };
      }
      var 末 = 候補[候補.length - 1], lh2 = t.type.行間(末);
      return { size: 末, lh: lh2, h: 測る(text, 末, w, lh2) };
    }

    function 文(text, o) {
      o = o || {};
      /* ★ 幅は **最後に置く幅で**測る（2026-08-17・実測）。
         収めるときは 端数つきの幅、置くときは 4 の倍数へ切り捨て、で
         測りかたが 1〜3px ずれ、Gate が「72px / 枠 84px」のような
         きわどい溢れを 2/1000 枚 拾っていた。 */
      var w = 下四(o.w === undefined ? 枠.w : o.w);
      var 制限 = o.制限 === undefined ? 枠.h * 0.85 : o.制限;
      var f = 収める(String(text || ""), o.size || size, w, 制限);
      var y = o.y === undefined ? 枠.y : o.y;
      /* ★ **小さい字に 副文の色を使わない**（2026-08-17・実測）。
         副文の色は 4.5 で作ってあるので、20px 未満で使うと
         読みやすさの決まり（7.0）を満たせない。
         小さい所は 濃い色にして、弱さは **大きさで**出す。 */
      var 色 = o.color || 字色(t, role);
      /* ★ 判定は Gate と **同じ式**を使う（2026-08-17）。
         別々に書いていたので「20px 未満」と「32px 未満」でずれ、
         22px や 25px の副文が 落ちていた。 */
      var 大か = VQD.gate && VQD.gate.大きい字
        ? VQD.gate.大きい字(f.size, o.bold, "text")
        : (f.size >= 32 || (f.size >= 24 && o.bold));
      if (色 === t.color.textSecondary && !大か) 色 = t.color.textPrimary;
      var e = { type: "text", x: 四(o.x === undefined ? 枠.x : o.x), y: 四(y),
                w: w, h: 上四(Math.min(f.h, 枠.h)), text: String(text || ""),
                size: f.size, bold: !!o.bold, align: o.align || al,
                color: 色, lh: f.lh,
                fontStack: o.stack || (o.見出し ? t.type.stack.display : t.type.stack.body),
                z: o.z === undefined ? 1 : o.z, 役: o.役 || role, スロット: idx };
      出.push(e);
      return e;
    }

    /* 上下の置きどころ（align は 横だけでなく 縦にも効かせる）
       ★ start でも **短い中身を 上に貼りつけない**（2026-08-17・実測）。
         1 分割のページで 中身が上に寄り、下が 35% 以上あいたページが
         1000 枚中 162 枚あった。人が組むときは、量が少ないほど
         真ん中（やや上）に置く。それを式にする。 */
    function 縦(高さ) {
      var 余 = Math.max(0, 枠.h - 高さ);
      if (slot.align === "center") return 枠.y + 余 / 2;
      if (slot.align === "end") return 枠.y + 余;
      if (余 > 枠.h * 0.45) return 枠.y + 余 * 0.42;   /* 光学的中央（真ん中より少し上） */
      return 枠.y;
    }

    /* ══ 図・絵 ── 2026-08-28 ═══════════════════════════════════
       ★ 訴え（実測）「図の生成はできませんでした」。
         deck（3 枚以上の 資料）は 中身に 文しか 通していなかったので、
         Lumi が 図を 描いても 置き場が 無かった。
       ★ 役目（role）を 増やさない。増やすと 割りつけの側が
         **絵の 無いページにも 絵の枠を 作って** 空きが 出る。
         そうではなく **中身に 図が あれば どの枠でも 図として 描く**。
         図が 無ければ これまでどおり 役目のとおりに 描く。 */
    if (中 && (中.svg || 中.src)) {
      var 添 = String((中 && 中.caption) || "");
      var 添h = 添 ? 上四(t.type.size.caption * 1.6) : 0;
      var 絵h = Math.max(48, 下四(枠.h - 添h - (添h ? 6 : 0)));
      var 絵y = 上四(縦(絵h + (添h ? 添h + 6 : 0)));
      出.push(中.svg
        ? { type: "svg", x: 上四(枠.x), y: 絵y, w: 下四(枠.w), h: 絵h, z: 1,
            svg: String(中.svg), alt: String(中.alt || ""), credit: 中.credit,
            装飾: false, 役: "image", スロット: idx }
        : { type: "image", x: 上四(枠.x), y: 絵y, w: 下四(枠.w), h: 絵h, z: 1,
            src: String(中.src), alt: String(中.alt || ""), credit: 中.credit,
            fit: "contain", 装飾: false, 役: "image", スロット: idx });
      if (添)
        文(添, { x: 枠.x, y: 絵y + 絵h + 6, w: 下四(枠.w), size: t.type.size.caption,
                 制限: 添h, align: "center", color: t.color.textSecondary,
                 z: 2, 役: "image" });
      return;
    }

    if (role === "heading" || role === "subheading") {
      var text = String((中 && 中.text) || "");
      var そえ = String((中 && 中.caption) || "");
      /* ★ 空の見出しは **置かない**（2026-08-17・実測）。
         空の文字の箱を置くと、Gate の「空のスロット」に引っかからず、
         表しか無いページが そのまま通っていた。置かなければ
         emptySlot が正しく出て、LLM に「書いてください」と返せる。 */
      if (!text.trim() && !そえ.trim()) return;
      var 飾り高 = t.seed.accent === "none" || t.seed.accent === "block" ? 0 : t.space.inlineGap + 10;
      var そえ大 = Math.min(t.type.size.h3, size);
      /* 見出し・飾り・そえ書き を **合わせて** 枠に収める */
      var 使える = 枠.h * 0.85 - 飾り高;
      var そえ実 = null;
      if (そえ) {
        そえ実 = 収める(そえ, そえ大, 枠.w, Math.max(20, 使える * 0.35));
        使える -= そえ実.h + t.space.inlineGap;
      }
      var 本 = 収める(text, size, 枠.w - (t.seed.accent === "block" ? t.space.inlineGap * 2 : 0),
                      Math.max(20, 使える));
      var 総 = 本.h + 飾り高 + (そえ実 ? そえ実.h + t.space.inlineGap : 0);
      var y0 = 縦(総);

      if (t.seed.accent === "block" && role === "heading") {
        var pad = Math.round(t.space.inlineGap);
        /* ★ 帯は **枠いっぱい**にする（2026-08-17・実測）。
           文字ぶんの幅にしていたら、文字の中心が帯からはみ出す枠があり、
           Gate が「白地に白文字（比 1.00）」と正しく叫んでいた。 */
        var bw0 = 下四(枠.w), bh0 = 上四(本.h + pad * 1.2);
        /* ★ 濃い色で塗ってよいのは 画面の 10% まで（§4.5）。
           大きな見出しの帯だけで 36% 塗っていた（実測）。
           足りないときは **うすい差し色の帯**へ落とす。柄は保てる。 */
        var 濃く塗れる = !予算 || 予算.残 >= bw0 * bh0;
        if (濃く塗れる && 予算) 予算.残 -= bw0 * bh0;
        出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(y0),
                  w: bw0, h: bh0, z: 0,
                  fill: 濃く塗れる ? t.color.accent : t.color.accentSoft,
                  radius: t.shape.radius, 装飾: true, 役: "accent", スロット: idx });
        文(text, { x: 枠.x + pad, w: 枠.w - pad * 2, y: y0 + pad * 0.6, size: 本.size, 制限: 本.h,
                   bold: true, 見出し: true,
                   color: 濃く塗れる ? t.color.textOnAccent : t.color.textPrimary, z: 2 });
      } else {
        /* ★ 飾りの位置は **置いた文字の実物**から取る（2026-08-17・実測）。
           予測した高さから計算していたので、丸めのぶん 3px ずれて
           Gate が「見出しと飾りが重なっている」と正しく叫んでいた。 */
        var 見 = 文(text, { y: y0, size: 本.size, 制限: 本.h,
                            bold: role === "heading", 見出し: role === "heading" });
        var 下端 = 見.y + 見.h + t.space.inlineGap;
        /* ★ **入らないなら 置かない**（2026-08-17・実測）。
           枠の下からはみ出す飾りは、最後の「余白内へ収める」処理で
           3px ほど押し上げられ、見出しの文字と重なっていた（32/1000 枚）。
           飾りは無くても資料は成立する。無理に置かない。 */
        var 入る = 下端 + 8 <= 枠.y + 枠.h;
        if (入る && t.seed.accent === "underline")
          出.push({ type: "shape", shape: "rect",
                    x: 上四(slot.align === "center" ? 枠.x + 枠.w / 2 - 60
                        : (slot.align === "end" ? 枠.x + 枠.w - 120 : 枠.x)),
                    y: 上四(下端), w: Math.min(120, 下四(枠.w)), h: 6, z: 1,
                    fill: t.color.accent, radius: t.shape.kind === "sharp" ? 0 : 3,
                    装飾: false, 役: "accent", スロット: idx });
        else if (入る && t.seed.accent === "rule")
          出.push({ type: "line", x: 上四(枠.x), y: 上四(下端),
                    w: 下四(枠.w), h: 4, z: 1, color: t.color.border, weight: 2,
                    装飾: false, 役: "accent", スロット: idx });
      }
      if (そえ実)
        文(そえ, { y: y0 + 本.h + 飾り高 + t.space.inlineGap, size: そえ実.size, 制限: そえ実.h,
                   color: t.color.textSecondary, 役: "subheading" });
      return;
    }

    if (role === "body" || role === "bullets") {
      var 本文 = role === "bullets"
        ? ((中 && 中.items) || []).map(function (x) { return "・" + String(x); }).join("\n")
        : String((中 && 中.text) || "");
      if (!String(本文).trim()) return;
      var f2 = 収める(本文, size, 枠.w, 枠.h * 0.85);
      /* ★ 3 行以上になる本文を 中央揃えにしない（2026-08-17・目視）。
         行の左端がそろわず、ぎざぎざして読みにくい。 */
      var 行数 = Math.max(1, Math.round(f2.h / (f2.size * f2.lh)));
      文(本文, { y: 縦(f2.h), size: f2.size, 制限: f2.h,
                 align: (行数 >= 3 && al === "center") ? "left" : al });
      return;
    }

    if (role === "quote") {
      var q = String((中 && 中.text) || "");
      if (!q.trim()) return;
      var qw = 枠.w - 28;
      var そえq = String((中 && 中.caption) || "");
      var 余 = 枠.h * 0.85 - (そえq ? t.type.size.caption * 1.7 + t.space.inlineGap : 0);
      var fq = 収める(q, size, qw, Math.max(24, 余));
      var 総q = fq.h + (そえq ? t.type.size.caption * 1.7 + t.space.inlineGap : 0);
      var qy = 縦(総q);
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(qy), w: 8, h: 上四(fq.h),
                z: 1, fill: t.color.accent, radius: t.shape.kind === "sharp" ? 0 : 4,
                装飾: false, 役: "accent", スロット: idx });
      文(q, { x: 枠.x + 28, w: qw, y: qy, size: fq.size, 制限: fq.h });
      if (そえq)
        文("— " + そえq, { x: 枠.x + 28, w: qw, y: qy + fq.h + t.space.inlineGap,
                           size: t.type.size.caption, 制限: t.type.size.caption * 1.8,
                           color: t.color.textSecondary, 役: "subheading" });
      return;
    }

    if (role === "metric") {
      var v = String((中 && 中.value) || (中 && 中.text) || "");
      if (!v.trim()) return;
      var lab = String((中 && 中.caption) || "");
      var 幅 = Math.max(1, 幅em(v));
      var ms = Math.min(size, Math.floor(枠.h * 0.42), Math.floor(枠.w / 幅 * 0.95));
      ms = Math.max(20, ms);
      var mh = Math.min(枠.h, ms * 1.25 + (lab ? t.type.size.caption * 1.8 : 0));
      var my = 上四(縦(mh));
      var 地色 = 背後(枠.x + 枠.w / 2, my + mh / 2, 1);
      var 数字色 = VQD.color.contrast(t.color.accent, 地色) >= 4.5
        ? t.color.accent : t.color.textPrimary;
      出.push({ type: "number", x: 上四(枠.x), y: my, w: 下四(枠.w), h: 上四(mh), z: 1,
                text: v, label: lab, size: ms, color: 数字色,
                fontStack: t.type.stack.display, 役: "metric", スロット: idx });
      return;
    }

    if (role === "table") {
      var rows = (中 && 中.rows) || [];
      if (!rows.length) return;
      var 字 = Math.max(14, Math.min(t.type.size.body, Math.floor(枠.h / rows.length / 2.2)));
      /* ★ 枠が余っているなら 行の高さを のばして 表で埋める（2026-08-17・実測）。
         1 分割のページに 4 行の表を置くと、上 4 割だけ表で
         下 6 割が空白になっていた（1000 枚中 11 枚がこの形）。 */
      var 行高 = Math.max(26, Math.round(字 * 1.9));
      行高 = Math.max(行高, Math.min(Math.floor(枠.h / rows.length), Math.round(字 * 3.2)));
      var th = Math.min(下四(枠.h), 上四(rows.length * 行高));
      出.push({ type: "table", x: 上四(枠.x), y: 上四(縦(th)), w: 下四(枠.w), h: th, z: 1,
                rows: rows, size: 字, 役: "table", スロット: idx });
      return;
    }

    if (role === "chart") {
      var ch = (中 && 中.chart) || null;
      if (!ch) return;
      var chh = 下四(枠.h);
      出.push({ type: "chart", x: 上四(枠.x), y: 上四(縦(chh)), w: 下四(枠.w), h: chh, z: 1,
                chart: ch, 役: "chart", スロット: idx });
      return;
    }

    /* ══ ここから 足した役目（2026-08-17）════════════════════════════
       ★ どれも 既存の部品（text / shape / line / number）の組み合わせ。
         アプリ側の描画は 1 行も変えていない。
       ★ 中身は cells（題 / 文 / 数）で受ける。役目ごとに鍵を分けない。 */
    /* ★ カードの角は **丸めすぎない**（2026-08-17・目視）。
       shape が circular の Seed では radius が 9999 なので、
       比べるカードや囲みが **楕円**になって崩れて見えた。
       円にしてよいのは 丸番号やアイコンのような 小さいものだけ。 */
    var カード角 = Math.min(t.shape.radius, 24);

    function 中身のこま(既定) {
      var c = (中 && 中.cells) || null;
      if (c && c.length) return c;
      var it = (中 && 中.items) || [];
      if (it.length) return it.map(function (x) { return { title: String(x) }; });
      return 既定 || [];
    }

    /* ── 番号つきの手順 ─────────────────────────────────────── */
    if (role === "steps") {
      var 手 = 中身のこま().slice(0, 4);
      if (!手.length) return;
      var n2 = 手.length;
      var 横か = 枠.w >= 枠.h * 1.25;
      var 丸 = Math.max(28, Math.min(44, Math.round(t.type.size.h3 * 1.5)));
      if (横か) {
        var cw = 下四((枠.w - t.space.gutter * (n2 - 1)) / n2);
        var ch = Math.min(下四(枠.h), 上四(丸 + 12 + t.type.size.h3 * 1.4 + t.type.size.body * 1.7 * 2));
        var cy = 上四(縦(ch));
        手.forEach(function (x, i) {
          var cx = 上四(枠.x + i * (cw + t.space.gutter));
          出.push({ type: "shape", shape: "circle", x: cx, y: cy, w: 丸, h: 丸, z: 1,
                    fill: t.color.accent, radius: 9999, 装飾: true, 役: "steps", スロット: idx });
          出.push({ type: "text", x: cx, y: 上四(cy + (丸 - t.type.size.h3) / 2 - 2), w: 丸, h: 上四(t.type.size.h3 * 1.4),
                    text: String(i + 1), size: Math.max(14, Math.round(丸 * 0.5)), bold: true,
                    align: "center", color: t.color.textOnAccent, lh: 1.1,
                    fontStack: t.type.stack.display, z: 2, 役: "steps", スロット: idx });
          var ty = cy + 丸 + 10;
          if (x.title) {
            var f3 = 収める(x.title, t.type.size.h3, cw, t.type.size.h3 * 2.9, false);
            文(x.title, { x: cx, y: ty, w: cw, size: f3.size, 制限: f3.h, bold: true, align: "left", 役: "steps" });
            ty += f3.h + 4;
          }
          if (x.text) {
            var f4 = 収める(x.text, t.type.size.body, cw, Math.max(20, cy + ch - ty), false);
            文(x.text, { x: cx, y: ty, w: cw, size: f4.size, 制限: f4.h, align: "left",
                         color: t.color.textSecondary, 役: "steps" });
          }
        });
      } else {
        var rh = 下四((枠.h - t.space.inlineGap * (n2 - 1)) / n2);
        手.forEach(function (x, i) {
          var ry = 上四(枠.y + i * (rh + t.space.inlineGap));
          出.push({ type: "shape", shape: "circle", x: 上四(枠.x), y: 上四(ry + (rh - 丸) / 2),
                    w: 丸, h: 丸, z: 1, fill: t.color.accent, radius: 9999,
                    装飾: true, 役: "steps", スロット: idx });
          出.push({ type: "text", x: 上四(枠.x), y: 上四(ry + (rh - t.type.size.h3) / 2 - 2),
                    w: 丸, h: 上四(t.type.size.h3 * 1.4), text: String(i + 1),
                    size: Math.max(14, Math.round(丸 * 0.5)), bold: true, align: "center",
                    color: t.color.textOnAccent, lh: 1.1, fontStack: t.type.stack.display,
                    z: 2, 役: "steps", スロット: idx });
          var tx = 枠.x + 丸 + 16, tw = 下四(枠.w - 丸 - 16);
          var 題 = x.title || "", 説 = x.text || "";
          var h題 = 題 ? 収める(題, t.type.size.h3, tw, rh * 0.6, false) : null;
          var h説 = 説 ? 収める(説, t.type.size.body, tw, rh - (h題 ? h題.h : 0) - 4, false) : null;
          var 総h = (h題 ? h題.h : 0) + (h説 ? h説.h + 4 : 0);
          var y2 = ry + Math.max(0, (rh - 総h) / 2);
          if (h題) { 文(題, { x: tx, y: y2, w: tw, size: h題.size, 制限: h題.h, bold: true, align: "left", 役: "steps" }); y2 += h題.h + 4; }
          if (h説) 文(説, { x: tx, y: y2, w: tw, size: h説.size, 制限: h説.h, align: "left",
                            color: t.color.textSecondary, 役: "steps" });
        });
      }
      return;
    }

    /* ── 2 つを 並べて比べる ─────────────────────────────────── */
    if (role === "compare") {
      var 比 = 中身のこま().slice(0, 2);
      if (比.length < 2) return;
      var 横2 = 枠.w >= 枠.h;
      var 帯h = 上四(t.type.size.h3 * 1.9);
      var pad = Math.max(10, t.space.inlineGap);
      /* ★ 2 枚目の帯に **副の色**を使わない（2026-08-17・実測）。
         副の色は「地に対して 3.0」でしか作っていないので、
         その上に白文字を置くと 3.88 まで落ちた。
         1 枚目＝濃い差し色＋白文字、2 枚目＝うすい差し色＋濃い文字 にする。
         強弱もこのほうが はっきり出る。 */
      var 色2 = [t.color.accent, t.color.accentSoft];
      var 字2 = [t.color.textOnAccent, t.color.textPrimary];
      /* 濃い色で塗ってよい面積が残っていなければ うすい帯に落とす（§4.5） */
      var 帯面 = 下四((枠.w - t.space.gutter) / 2) * 上四(t.type.size.h3 * 1.9);
      if (予算 && 予算.残 < 帯面) { 色2[0] = t.color.accentSoft; 字2[0] = t.color.textPrimary; }
      else if (予算) 予算.残 -= 帯面;
      if (横2) {
        var w2 = 下四((枠.w - t.space.gutter) / 2);
        var h2 = 下四(枠.h);
        var y3 = 上四(縦(h2));
        比.forEach(function (x, i) {
          var x2 = 上四(枠.x + i * (w2 + t.space.gutter));
          出.push({ type: "shape", shape: "rect", x: x2, y: y3, w: w2, h: h2, z: 0,
                    fill: t.color.accentSoft, radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          出.push({ type: "shape", shape: "rect", x: x2, y: y3, w: w2, h: 帯h, z: 1,
                    fill: 色2[i], radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          文(x.title || "", { x: x2 + pad, y: y3 + (帯h - t.type.size.h3 * 1.3) / 2, w: w2 - pad * 2,
                              size: t.type.size.h3, 制限: 帯h, bold: true, align: "left",
                              color: 字2[i], z: 2, 役: "compare" });
          if (x.text) {
            var f5 = 収める(x.text, t.type.size.body, w2 - pad * 2, h2 - 帯h - pad * 2, false);
            文(x.text, { x: x2 + pad, y: y3 + 帯h + pad, w: w2 - pad * 2, size: f5.size,
                         制限: f5.h, align: "left", z: 2, 役: "compare" });
          }
        });
      } else {
        var hh = 下四((枠.h - t.space.inlineGap) / 2);
        比.forEach(function (x, i) {
          var yy = 上四(枠.y + i * (hh + t.space.inlineGap));
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: yy, w: 下四(枠.w), h: hh, z: 0,
                    fill: t.color.accentSoft, radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: yy, w: 8, h: hh, z: 1,
                    fill: 色2[i], radius: 0, 装飾: true, 役: "compare", スロット: idx });
          var tw2 = 下四(枠.w - 16 - pad * 2);
          var 題e = 文(x.title || "", { x: 枠.x + 16 + pad, y: yy + pad, w: tw2, size: t.type.size.h3,
                                        制限: t.type.size.h3 * 1.6, bold: true, align: "left",
                                        z: 2, 役: "compare" });
          var 次y = 題e.y + 題e.h + 6;
          if (x.text && 次y + 24 <= yy + hh - pad)
            文(x.text, { x: 枠.x + 16 + pad, y: 次y, w: tw2,
                         size: t.type.size.body, 制限: yy + hh - pad - 次y,
                         align: "left", z: 2, 役: "compare" });
        });
      }
      return;
    }

    /* ── 大きな数字を 並べる ─────────────────────────────────── */
    if (role === "kpi") {
      var 数 = 中身のこま().filter(function (x) { return x.value || x.title; }).slice(0, 4);
      if (!数.length) return;
      var n3 = 数.length;
      var kw = 下四((枠.w - t.space.gutter * (n3 - 1)) / n3);
      var ks = Math.min(t.type.size.display, Math.floor(枠.h * 0.42),
                        Math.floor(kw / Math.max(1, Math.max.apply(null, 数.map(function (x) { return 幅em(String(x.value || x.title || "")); }))) * 0.95));
      ks = Math.max(t.type.size.h2, ks);
      var kh = Math.min(下四(枠.h), 上四(ks * 1.25 + t.type.size.caption * 1.9));
      var ky = 上四(縦(kh));
      数.forEach(function (x, i) {
        var kx = 上四(枠.x + i * (kw + t.space.gutter));
        出.push({ type: "number", x: kx, y: ky, w: kw, h: kh, z: 1,
                  text: String(x.value || ""), label: String(x.title || ""),
                  size: ks, color: t.color.accent, fontStack: t.type.stack.display,
                  役: "kpi", スロット: idx });
        if (i < n3 - 1)
          出.push({ type: "shape", shape: "rect",
                    x: 上四(kx + kw + t.space.gutter / 2 - 1), y: 上四(ky + kh * 0.15),
                    w: 2, h: 下四(kh * 0.7), z: 0, fill: t.color.border, radius: 0,
                    装飾: true, 役: "kpi", スロット: idx });
      });
      return;
    }

    /* ── 囲みの強調 ─────────────────────────────────────────── */
    if (role === "callout") {
      var 言 = String((中 && 中.text) || "");
      if (!言.trim()) return;
      var pad2 = Math.max(12, t.space.inlineGap + 4);
      var 内w = 下四(枠.w - 12 - pad2 * 2);
      var f6 = 収める(言, t.type.size.h3, 内w, 枠.h * 0.85 - pad2 * 2);
      var 箱h = 上四(f6.h + pad2 * 2 + (中 && 中.caption ? t.type.size.caption * 1.8 : 0));
      var 箱y = 上四(縦(箱h));
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 箱y, w: 下四(枠.w), h: 箱h, z: 0,
                fill: t.color.accentSoft, radius: カード角,
                装飾: true, 役: "callout", スロット: idx });
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 箱y, w: 6, h: 箱h, z: 1,
                fill: t.color.accent, radius: 0, 装飾: true, 役: "callout", スロット: idx });
      文(言, { x: 枠.x + 12 + pad2, y: 箱y + pad2, w: 内w, size: f6.size, 制限: f6.h,
               align: "left", z: 2, 役: "callout" });
      if (中 && 中.caption)
        文("— " + 中.caption, { x: 枠.x + 12 + pad2, y: 箱y + pad2 + f6.h + 2, w: 内w,
                                size: t.type.size.caption, 制限: t.type.size.caption * 1.8,
                                color: t.color.textSecondary, z: 2, 役: "subheading" });
      return;
    }

    /* ── 横軸の年表 ─────────────────────────────────────────── */
    if (role === "timeline") {
      var 点 = 中身のこま().slice(0, 5);
      if (点.length < 2) return;
      var n4 = 点.length;
      var 線y = 上四(枠.y + 枠.h * 0.5);
      var 端 = Math.round(枠.w / (n4 * 2));
      出.push({ type: "line", x: 上四(枠.x + 端), y: 線y, w: 下四(枠.w - 端 * 2), h: 4, z: 0,
                color: t.color.border, weight: 2, 装飾: true, 役: "timeline", スロット: idx });
      var 幅1 = 下四(枠.w / n4);
      点.forEach(function (x, i) {
        var cx2 = 枠.x + 端 + (枠.w - 端 * 2) * (n4 === 1 ? 0 : i / (n4 - 1));
        出.push({ type: "shape", shape: "circle", x: 上四(cx2 - 7), y: 上四(線y - 5),
                  w: 14, h: 14, z: 1, fill: t.color.accent, radius: 9999,
                  装飾: true, 役: "timeline", スロット: idx });
        var lx = Math.max(枠.x, Math.min(cx2 - 幅1 / 2, 枠.x + 枠.w - 幅1));
        if (x.title) {
          var f7 = 収める(x.title, t.type.size.h3, 幅1 - 8, 枠.h * 0.35, false);
          文(x.title, { x: lx + 4, y: 線y - 16 - f7.h, w: 幅1 - 8, size: f7.size, 制限: f7.h,
                        bold: true, align: "center", 役: "timeline" });
        }
        if (x.text) {
          var f8 = 収める(x.text, t.type.size.caption, 幅1 - 8, 枠.h * 0.35, false);
          文(x.text, { x: lx + 4, y: 線y + 18, w: 幅1 - 8, size: f8.size, 制限: f8.h,
                       align: "center", color: t.color.textSecondary, 役: "timeline" });
        }
      });
      return;
    }

    /* ── セクションの扉 ─────────────────────────────────────── */
    if (role === "section") {
      var 題2 = String((中 && 中.text) || "");
      if (!題2.trim()) return;
      var 番2 = String((中 && 中.value) || (中 && 中.caption) || "");
      var 数大 = Math.min(t.type.size.display, Math.floor(枠.h * 0.5));
      var 題大 = 収める(題2, t.type.size.h1, 下四(枠.w - (番2 ? 数大 * 0.9 : 0)), 枠.h * 0.5);
      var 総2 = (番2 ? 数大 * 1.1 : 0) + 題大.h + 12;
      var y4 = 縦(総2);
      if (番2) {
        出.push({ type: "text", x: 上四(枠.x), y: 上四(y4), w: 下四(枠.w), h: 上四(数大 * 1.1),
                  text: 番2, size: 数大, bold: true, align: "left",
                  color: t.color.accent, lh: 1.05, fontStack: t.type.stack.display,
                  z: 1, 役: "section", スロット: idx });
        y4 += 数大 * 1.1 + 8;
      }
      var 節 = 文(題2, { y: y4, size: 題大.size, 制限: 題大.h, bold: true, 見出し: true,
                         align: "left", 役: "section" });
      if (節.y + 節.h + 14 + 8 <= 枠.y + 枠.h)
        出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(節.y + 節.h + 14),
                  w: Math.min(160, 下四(枠.w)), h: 6, z: 1, fill: t.color.accent,
                  radius: t.shape.kind === "sharp" ? 0 : 3, 装飾: false, 役: "accent", スロット: idx });
      return;
    }

    if (role === "diagram" || role === "image") {
      /* 図解: 箱を並べて つなぐ。**中身から作る**（空の箱は作らない）。
         ★ 枠が縦長なら 縦に積む。前は横並びしか無く、
           横分割のページで **何も置かれず「空のスロット」**になっていた。 */
      var 品 = ((中 && 中.items) || []).slice(0, 4);
      if (!品.length) return;
      var n = 品.length;
      var 矢 = Math.max(16, Math.round(t.space.gutter));
      var 横並び = 枠.w >= 枠.h * 1.15;
      if (横並び) {
        var bw = 下四((枠.w - 矢 * (n - 1)) / n);
        var bh = Math.min(下四(枠.h), Math.max(64, 下四(枠.h * 0.92)));
        var by = 上四(縦(bh));
        品.forEach(function (s, i) {
          var bx = 上四(枠.x + i * (bw + 矢));
          出.push({ type: "shape", shape: "rect",
                    x: bx, y: by, w: bw, h: bh, z: 1, fill: t.color.accentSoft,
                    radius: カード角, 装飾: true, 役: "diagram", スロット: idx });
          var ft = 収める(String(s), size, bw - 20, bh * 0.8);
          文(String(s), { x: bx + 10, y: by + (bh - ft.h) / 2, w: bw - 20, 制限: ft.h,
                          size: ft.size, align: "center", z: 2, 役: "diagram" });
          if (i < n - 1)
            出.push({ type: "arrow", x: 上四(bx + bw + 2), y: 上四(by + bh / 2 - 8),
                      w: Math.max(8, 下四(矢 - 6)), h: 16, z: 1, color: t.color.accent,
                      装飾: false, 役: "diagram", スロット: idx });
        });
      } else {
        var bh2 = 下四((枠.h - 矢 * (n - 1)) / n);
        if (bh2 < 32) { n = Math.max(1, Math.floor(枠.h / (32 + 矢))); 品 = 品.slice(0, n); bh2 = 下四((枠.h - 矢 * (n - 1)) / n); }
        var bw2 = 下四(枠.w);
        品.forEach(function (s, i) {
          var by2 = 上四(枠.y + i * (bh2 + 矢));
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: by2, w: bw2, h: bh2, z: 1,
                    fill: t.color.accentSoft, radius: カード角,
                    装飾: true, 役: "diagram", スロット: idx });
          var ft2 = 収める(String(s), size, bw2 - 20, bh2 * 0.8);
          文(String(s), { x: 枠.x + 10, y: by2 + (bh2 - ft2.h) / 2, w: bw2 - 20, 制限: ft2.h,
                          size: ft2.size, align: "center", z: 2, 役: "diagram" });
        });
      }
      return;
    }
  }

  /* ── そのスロットに入る 文字数（§10 で LLM へ「32 文字以内」と数で渡す）─
     ★ 「短く」ではなく **数**を渡すためのもの。和文（1 字 = 1em）で数える。
     ★ 中身を作る側と、Gate で測る側が **同じ式**を使う。ここがずれると
       「作った文字が入らない」が延々と起きる。 */
  function 文字数の上限(t, 枠, role, emphasis, purpose) {
    var 寸 = 寸法(t, 枠, role, emphasis, purpose);
    return 寸.文字数上限;
  }
  /* ★ 箇条書きは **行数**が効く（2026-08-17・実測）。
     1 項目が 1 行を必ず食うので、「全部で 30 字」だけ渡すと
     3 項目 × 1 行 = 3 行 になって 2 行の枠から溢れていた。
     行数と 1 行の字数を いっしょに渡す。 */
  function 寸法(t, 枠, role, emphasis, purpose) {
    var size = 字大(t, role, emphasis, purpose);
    /* ★ **入れられる量を 少なく申告していた**（2026-08-17・訴え）。
       上限を「決めた大きさ」で数えていたが、実際には入りきらなければ
       段を 1 つ下げて収める作りなので、**本当はもっと入る**。
       訴え「入れたいことが入れられなくて、結局あとから自分で直す」。
       本文・箇条書き・引用は 1 段下の大きさで数える（約 1.3〜1.5 倍 入る）。 */
    if (role === "body" || role === "bullets" || role === "quote") {
      var 段2 = [t.type.size.display, t.type.size.h1, t.type.size.h2, t.type.size.h3,
                 t.type.size.body, t.type.size.caption]
        .filter(function (v, i, a2) { return v >= 14 && a2.indexOf(v) === i; })
        .sort(function (x, y) { return y - x; });
      for (var i2 = 0; i2 < 段2.length; i2++)
        if (段2[i2] < size) { size = 段2[i2]; break; }
    }
    var lh = t.type.行間(size);
    var w = 枠.w - (role === "quote" ? 28 : 0);
    var 一行 = Math.max(1, Math.floor(w / size));
    var 行 = Math.max(1, Math.floor((枠.h * 0.85) / (size * lh)));
    return { 字の大きさ: size, 行数上限: 行, 一行の文字数: 一行,
             文字数上限: Math.max(4, Math.floor(一行 * 行 * 0.92)) };
  }
  /* ページの Spec と Tokens から、スロットごとの上限をまとめて出す */
  function 上限一覧(spec, t, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 540;
    var s = G.正規化(spec);
    var m = t.space.slideMargin;
    var 箱 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    if (s.gravity === "asymmetric") {
      var 一列 = Math.round((W - m * 2) / t.grid);
      箱 = { x: m + 一列, y: m, w: W - m * 2 - 一列, h: H - m * 2 };
    }
    var 枠 = 枠を割る(s, 箱, t);
    var 出 = s.slots.map(function (sl, i) {
      if (sl.role === "spacer")
        return { slotIndex: i, role: "spacer", 文字数上限: 0, 行数上限: 0, 一行の文字数: 0, 枠: 枠[i] };
      var 寸 = 寸法(t, 枠[i], sl.role, sl.emphasis, opts.purpose);
      return { slotIndex: i, role: sl.role, emphasis: sl.emphasis,
               文字数上限: 寸.文字数上限, 行数上限: 寸.行数上限,
               一行の文字数: 寸.一行の文字数, 字の大きさ: 寸.字の大きさ, 枠: 枠[i] };
    });
    /* ページ全体の字数（Gate の charDensity と同じ上限）も返す */
    var 本文枠 = 出.filter(function (x) { return x.role === "body" || x.role === "bullets"; });
    /* ページ全体の本文の量。Gate が **止める線**（和文 320 字）に合わせる。
       目安の 200 字ではなく 限界で配ることで、書きたいことが入る。 */
    var 全体 = (opts.lang === "en" ? 640 : 320);
    本文枠.forEach(function (x) {
      x.文字数上限 = Math.min(x.文字数上限, Math.max(8, Math.floor(全体 / 本文枠.length)));
    });
    出.ページ全体の本文字数 = 全体;
    return 出;
  }

  /* ── 本体 ───────────────────────────────────────────────────── */
  function resolve(page, t, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 540;
    var spec = G.正規化(page.layout);
    var m = t.space.slideMargin;
    var 箱 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    if (spec.gravity === "asymmetric") {
      var 一列 = Math.round((W - m * 2) / t.grid);
      箱 = { x: m + 一列, y: m, w: W - m * 2 - 一列, h: H - m * 2 };
    }
    var 出 = [];
    var 地 = 地の作り(t, W, H);
    地.飾.forEach(function (e) { 出.push(e); });
    /* ══ ページの調度（番号・細い罫）（2026-08-17・訴え「素人感」）════════
       ★ 実測: 飾りを none にした Seed で **文字だけのページが 3/10 枚**出た。
         文字が浮いているだけのページは、それだけで素人っぽく見える。
       ★ 資料らしくする最低限を 全ページに置く:
           ・ページ番号（表紙以外・右下・小さく）
           ・飾りが none のときは 中身の上に **細い罫**を 1 本
         どちらも 主張しない。**中身の邪魔をしない位置**に置く。 */
    var 番 = page["番号"] || 0;
    if (番 > 1) {
      出.push({ type: "text", x: 下四(W - m - 80), y: 上四(H - m + 6), w: 80, h: 20,
                text: String(番), size: Math.max(11, t.type.size.caption - 2),
                align: "right", color: t.color.textSecondary, lh: 1.2,
                fontStack: t.type.stack.body, z: 1,
                装飾: true, はみ出し可: true, 役: "pagenum" });
    }
    /* ★ 表紙も 例外にしない（実測）。飾り none ＋ 帯なしの表紙は
       文字が 1 行 浮いているだけで、いちばん素人っぽく見える。
       罫は 1 本だけ。主張しない。 */
    if (t.seed.accent === "none") {
      出.push({ type: "line", x: 上四(m), y: 上四(番 === 1 ? H - m + 10 : m - 14),
                w: 下四(W - m * 2), h: 4,
                color: t.color.border, weight: 1, z: 0,
                装飾: true, はみ出し可: true, 役: "rule" });
    }

    /* 濃い色（S>60%）で塗ってよい面積。ここから引いていく（§4.5）。 */
    var 予算 = { 残: W * H * 0.10 };
    出.forEach(function (e) {
      if (e.fill && VQD.color.satOf(e.fill) > 60) 予算.残 -= Math.max(0, e.w) * Math.max(0, e.h);
    });
    var 帯 = 端の帯(spec, t, W, H);
    if (帯) { 出.push(帯); if (VQD.color.satOf(帯.fill) > 60) 予算.残 -= 帯.w * 帯.h; }

    var 枠 = 枠を割る(spec, 箱, t);
    var 中身 = {};
    ((page.content) || []).forEach(function (c) { 中身[c.slotIndex] = c; });
    枠 = 詰め直す(spec, 枠, 箱, t, 中身, page.purpose);
    spec.slots.forEach(function (s, i) {
      置く(出, 枠[i], s, 中身[i] || null, t, spec, page.purpose, i, 予算);
    });

    /* ★ 最後に **必ず** 余白の内側へ収める（2026-08-17）。
       ここまでで気をつけていても、丸めや文字の実寸のずれで 1〜3px 出る。
       出たものは 黙って外に置かず、内側へ詰める。 */
    var 余 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    出.forEach(function (e) {
      if (e.はみ出し可) return;
      if (e.x < 余.x) { e.w -= (余.x - e.x); e.x = 余.x; }
      if (e.y < 余.y) { e.h -= (余.y - e.y); e.y = 余.y; }
      if (e.x + e.w > 余.x + 余.w) e.w = 余.x + 余.w - e.x;
      if (e.y + e.h > 余.y + 余.h) e.h = 余.y + 余.h - e.y;
      if (e.w < 8) { e.x = Math.max(余.x, Math.min(e.x, 余.x + 余.w - 8)); e.w = 8; }
      if (e.h < 8) { e.y = Math.max(余.y, Math.min(e.y, 余.y + 余.h - 8)); e.h = 8; }
    });

    /* id を振る（無い場合だけ） */
    出.forEach(function (e) { if (!e.id) e.id = uid(); });
    return { elements: 出, background: 地.css, canvas: { w: W, h: H }, 枠: 枠, spec: spec, 内箱: 箱 };
  }

  VQD.resolve = resolve;
  VQD.measure = { 測る: 測る, 幅em: 幅em, 四: 四, 番号を戻す: 番号を戻す,
                  文字数の上限: 文字数の上限, 上限一覧: 上限一覧, 字大: 字大 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/gate.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/gate.js — 崩れの検出（**純粋関数だけ**）

   ★ 「このスライドは崩れていますか」と LLM に聞かない。ここで数える。
   ★ error が 1 つでもあれば needs_repair。warning だけなら ok とし、
     デッキ全体を has_warnings にする。
   ★ 文字の実寸は推定なので、**枠の 85% を超えたら溢れ**とする（安全側）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var C = VQD.color, M = VQD.measure;

  var 最小字 = 14;
  var 濃さの上限 = 0.85;          /* 枠の何割まで文字を入れてよいか */
  /* ★ 字数の上限（2026-08-17・訴えで 2 段にした）。
     指示書は「和文 200 字を超えたら error」。ところが実際には
     「入れたいことが入れられない」という訴えが出た。
     読みやすさの **目安は 200 字のまま**（超えたら warning で知らせる）、
     **止めるのは 320 字**にする。緩めたのではなく、
     「知らせる線」と「止める線」を分けた。 */
  var 字数上限 = { ja: 200, en: 400 };
  var 字数の限界 = { ja: 320, en: 640 };

  function 重なり(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function 和文か(s) { return /[^\x00-\x7F]/.test(String(s || "")); }

  /* その文字の **真後ろにある色**。飾りの上に載っているならその色で測る。 */
  function 背後の色(e, res, t) {
    var 中 = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    var 色 = null, 高 = -1;
    (res.elements || []).forEach(function (o) {
      if (o === e || o.type !== "shape" || !o.fill) return;
      if ((o.z || 0) > (e.z || 0)) return;
      if (中.x < o.x || 中.x > o.x + o.w || 中.y < o.y || 中.y > o.y + o.h) return;
      if ((o.z || 0) >= 高) { 高 = o.z || 0; 色 = o.fill; }
    });
    if (色) return 色;
    var b = t.background;
    if (b.kind === "gradient") {
      /* 階調はどちらの端でも読めなければならない。**悪いほう**で測る。 */
      return C.contrast(e.color || t.color.textPrimary, b.from)
        < C.contrast(e.color || t.color.textPrimary, b.to) ? b.from : b.to;
    }
    return t.color.bg;
  }

  /* ★ 要る比は **役目ではなく 字の大きさ**で決める（2026-08-17）。
     役目で決めていたので、部品を足すたびに 例外を書き足すことになり、
     書き忘れた役目は 大きな見出しにも 本文と同じ 7.0 を課して落ちていた。
     読みやすさは 役目ではなく 大きさで決まる（WCAG も同じ考えかた）。
       大きい字（32px 以上／太字なら 24px 以上）… 4.5
       それ以外                                  … 7.0
     ページ番号だけは 目印なので 4.5。 */
  function 大きい字(size, bold, type) {
    if (type === "number") return true;      /* 大きな数字は それ自体が大きい */
    var s = size || 18;
    return s >= 32 || (s >= 24 && !!bold);
  }
  function 要る比(e) {
    if (e.役 === "pagenum") return 4.5;
    return 大きい字(e.size, e.bold, e.type) ? 4.5 : 7.0;
  }

  /* ── 1 ページ ─────────────────────────────────────────────── */
  function checkPage(page, res, t) {
    var 悪 = [], W = res.canvas.w, H = res.canvas.h;
    var m = t.space.slideMargin;
    var 内 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    var els = res.elements || [];
    var 本文字数 = 0, 和 = false;

    els.forEach(function (e) {
      /* ① 枠からのはみ出し */
      if (!e.はみ出し可) {
        if (e.x < 内.x - 1 || e.y < 内.y - 1 || e.x + e.w > 内.x + 内.w + 1 || e.y + e.h > 内.y + 内.h + 1)
          悪.push({ 深刻: "error", 種: "boundsOverflow", 部品: e.id,
                    どこが: (e.役 || e.type) + " が余白の内側からはみ出している",
                    数: Math.round(e.x) + "," + Math.round(e.y) + " " + Math.round(e.w) + "×" + Math.round(e.h) });
      }
      /* ③ 小さすぎる字
         ★ ページ番号だけは 例外（12px）。読ませる文ではなく **目印**で、
           資料では小さいのが普通。ここを 14px にすると番号が主張しすぎる。
           中身の文字は 14px の床を そのまま守る。 */
      if (e.役 !== "pagenum"
          && (e.type === "text" || e.type === "number" || e.type === "table") && (e.size || 0) < 最小字)
        悪.push({ 深刻: "error", 種: "minFontSize", 部品: e.id,
                  どこが: "字が " + e.size + "px（" + 最小字 + "px 未満）" });
      /* ④ コントラスト */
      if (e.type === "text" || e.type === "number") {
        var 後 = 背後の色(e, res, t);
        var 比 = C.contrast(e.color || t.color.textPrimary, 後);
        var 要 = 要る比(e);
        if (比 < 要 - 0.01)
          悪.push({ 深刻: "error", 種: "contrastFail", 部品: e.id,
                    どこが: (e.役 || "文字") + " と 背後の色の比が " + 比.toFixed(2) + "（要 " + 要 + "）",
                    数: (e.color || "") + " / " + 後 });
      }
      /* ⑩ 枠に入りきらない */
      if (e.type === "text" && e.スロット !== undefined && res.枠 && res.枠[e.スロット]) {
        var 枠 = res.枠[e.スロット];
        var 要る = M.測る(e.text, e.size, e.w, e.lh || 1.4);
        /* ★ error は **直せるものだけ**（2026-08-17・実測）。
           85% は 幅の見積りがざっくりなことへの安全代。
           ところが 字がもう最小（14px）で、しかも 枠には入っている
           （要 72px / 枠 84px）ときにまで error を出していた。
           これ以上 小さくできないので 直しようがなく、
           「直してください」と言われても どうにもならない。
           **枠を本当に超えたときだけ error**、それ以外は お知らせにする。 */
        if (要る > 枠.h)
          悪.push({ 深刻: "error", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠に入りません（要 " + 要る + "px / 枠 " + Math.round(枠.h) + "px）" });
        else if (要る > 枠.h * 濃さの上限 && (e.size || 0) > 最小字)
          悪.push({ 深刻: "error", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠いっぱいで 窮屈（要 " + 要る + "px / 枠 " + Math.round(枠.h)
                      + "px）。減らすか 短くしてください" });
        else if (要る > 枠.h * 濃さの上限)
          悪.push({ 深刻: "warning", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠いっぱい（要 " + 要る + "px / 枠 " + Math.round(枠.h)
                      + "px）。字はもう最小なので これ以上は縮みません" });
      }
      if (e.type === "text" && (e.役 === "body" || e.役 === "bullets")) {
        本文字数 += String(e.text || "").length;
        if (和文か(e.text)) 和 = true;
      }
    });

    /* ② 重なり（飾りは数えない。**下に敷くのは重なりではない**） */
    var 実 = els.filter(function (e) { return !e.装飾; });
    for (var i = 0; i < 実.length; i++) for (var j = i + 1; j < 実.length; j++) {
      var s = 重なり(実[i], 実[j]);
      if (s > 4)
        悪.push({ 深刻: "error", 種: "overlap", 部品: 実[i].id + " と " + 実[j].id,
                  どこが: (実[i].役 || 実[i].type) + " と " + (実[j].役 || 実[j].type) + " が重なっている",
                  数: Math.round(s) + "px²" });
    }

    /* ⑤ 字が多すぎる */
    var 上限 = 和 ? 字数上限.ja : 字数上限.en;
    var 限界 = 和 ? 字数の限界.ja : 字数の限界.en;
    if (本文字数 > 限界)
      悪.push({ 深刻: "error", 種: "charDensity",
                どこが: "本文が " + 本文字数 + " 字。**" + 限界 + " 字を超えると 1 枚に入りません**"
                  + "（" + (和 ? "和文" : "欧文") + "）" });
    else if (本文字数 > 上限)
      悪.push({ 深刻: "warning", 種: "charDensity",
                どこが: "本文が " + 本文字数 + " 字（読みやすさの目安は " + 上限 + " 字）。"
                  + "ページを分けると読みやすくなります" });

    /* ⑥ 空のスロット */
    var spec = res.spec;
    (spec.slots || []).forEach(function (s, i) {
      if (s.role === "spacer") return;
      /* ★ 空の文字の箱は「ある」に数えない（2026-08-17・実測）。 */
      var ある = els.some(function (e) {
        if (e.スロット !== i || e.装飾) return false;
        if (e.type === "text" || e.type === "number") return String(e.text || "").trim().length > 0;
        return true;
      });
      if (!ある)
        悪.push({ 深刻: "error", 種: "emptySlot", どこが: (i + 1) + " 番目（" + s.role + "）が空" });
    });

    /* ⑦ 見出しも数字も引用も無い */
    var 芯 = els.some(function (e) { return ["heading", "metric", "quote"].indexOf(e.役) >= 0; });
    if (!芯) 悪.push({ 深刻: "warning", 種: "headingMissing", どこが: "見出しも 大きな数字も 引用も無い" });

    /* ⑨ 箇条書きが 1 つだけ */
    els.forEach(function (e) {
      if (e.役 !== "bullets") return;
      var n = String(e.text || "").split("\n").filter(function (x) { return x.trim(); }).length;
      if (n === 1) 悪.push({ 深刻: "warning", 種: "orphanBullet", 部品: e.id, どこが: "箇条書きが 1 つしか無い" });
    });

    var err = 悪.filter(function (x) { return x.深刻 === "error"; });
    return { ok: !err.length, status: err.length ? "needs_repair" : "ok", issues: 悪,
             error数: err.length, warning数: 悪.length - err.length };
  }

  /* ── デッキ全体 ───────────────────────────────────────────── */
  function checkDeck(pages, results) {
    var 悪 = [], 見出し = {};
    (results || []).forEach(function (r, i) {
      (r.res.elements || []).forEach(function (e) {
        if (e.役 !== "heading") return;
        var k = String(e.text || "").trim();
        if (!k) return;
        (見出し[k] = 見出し[k] || []).push(i + 1);
      });
    });
    Object.keys(見出し).forEach(function (k) {
      if (見出し[k].length >= 2)
        悪.push({ 深刻: "warning", 種: "duplicateHeading",
                  どこが: "同じ見出しが " + 見出し[k].length + " 回（" + 見出し[k].join(",") + " 枚目）: " + k.slice(0, 24) });
    });
    return 悪;
  }

  /* 濃い色（S>60%）が 画面のどれだけを塗っているか（§4.5・上限 10%）*/
  function 濃い色の面積比(res, t) {
    var W = res.canvas.w, H = res.canvas.h, 全 = W * H, 塗 = 0;
    if (t.background.kind === "gradient") {
      if (C.satOf(t.background.from) > 60 || C.satOf(t.background.to) > 60) 塗 += 全;
    } else if (C.satOf(t.color.bg) > 60) 塗 += 全;
    (res.elements || []).forEach(function (e) {
      var col = e.fill || (e.type === "line" || e.type === "arrow" ? e.color : null);
      if (!col || C.satOf(col) <= 60) return;
      var x0 = Math.max(0, e.x), y0 = Math.max(0, e.y);
      var x1 = Math.min(W, e.x + e.w), y1 = Math.min(H, e.y + e.h);
      塗 += Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    });
    return 塗 / 全;
  }

  VQD.gate = { checkPage: checkPage, checkDeck: checkDeck, 重なり: 重なり, 大きい字: 大きい字,
               濃い色の面積比: 濃い色の面積比, 最小字: 最小字,
               字数上限: 字数上限, 字数の限界: 字数の限界 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/ir.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/ir.js — DeckIR（中間表現）

   ★ LLM も レンダラも **必ずここを通る**。Slides のモデルを直接触らない。
     検証は この形に対して行う。
   ★ 「作りかけ」を隠さない: ページごとに status と issues と repairCount を持つ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  /* ══ 受け口を広げる（2026-08-20・訴え「改行・グラフ・図形・表」）════
     ★ ここは LLM も レンダラも **必ず通る**所。ここで 落とすと
       そのスロットは **空のまま**出る（＝「読み込まれない」の正体）。
     ★ これまでは Array.isArray でしか 受けていなかったので、
       items が 改行入りの 1 本の文字列 だったり、rows が もの の並び
       だったりすると 黙って 消えていた。rows が もの だと
       `(r||[]).map` で **例外**になり、deckWrite ごと こけていた。 */
  function 文(x) {
    if (Array.isArray(x)) return x.map(文).join("\n");
    if (x === undefined || x === null) return "";
    if (typeof x === "object")
      return 文(x.text !== undefined ? x.text
        : (x["文"] !== undefined ? x["文"] : (x.value !== undefined ? x.value : "")));
    var t = String(x);
    if (t.indexOf("<") >= 0)
      t = t.replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
           .replace(/<\s*\/?\s*(p|div|span|b|strong|i|em|u|li|ul|ol|h[1-6]|br)(\s[^<>]*)?\/?\s*>/gi, "");
    t = t.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n?/g, "\n");
    if (t.indexOf("&") >= 0)
      t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
           .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  function 並びにする(x) {
    if (Array.isArray(x)) return x;
    if (x === undefined || x === null || x === "") return [];
    if (typeof x === "string") return 文(x).split(/\n+/);
    return [x];
  }
  /* 表: 並びの並び / もの の並び / {headers,rows} / markdown の | を 受ける */
  function 表にする(生, 頭) {
    if (生 && typeof 生 === "object" && !Array.isArray(生) && (生.rows || 生.headers)) {
      頭 = 頭 || 生.headers || 生.header || 生.columns;
      生 = 生.rows;
    }
    生 = 並びにする(生);
    var 鍵 = Array.isArray(頭) ? 頭.map(文) : null;
    if (!鍵) {
      for (var i = 0; i < 生.length; i++) {
        var r0 = 生[i];
        if (r0 && typeof r0 === "object" && !Array.isArray(r0)) { 鍵 = Object.keys(r0); break; }
      }
      if (!鍵 && typeof 頭 === "string") 鍵 = 文(頭).split(/[|,\t]/).map(function (v) { return v.trim(); });
    }
    var 行 = [];
    生.forEach(function (r) {
      if (Array.isArray(r)) { 行.push(r.map(function (v) { return 文(v).replace(/\n/g, " "); })); return; }
      if (r && typeof r === "object") {
        var k = 鍵 || Object.keys(r);
        行.push(k.map(function (key) { return 文(r[key]).replace(/\n/g, " "); }));
        return;
      }
      var t = String(r === undefined || r === null ? "" : r);
      if (!t.trim()) return;
      if (t.indexOf("|") >= 0) {
        var セ = t.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")
                  .map(function (v) { return 文(v).trim(); });
        if (セ.length && セ.every(function (v) { return /^:?-{2,}:?$/.test(v.replace(/\s/g, "")); })) return;
        行.push(セ); return;
      }
      if (t.indexOf("\t") >= 0) { 行.push(t.split("\t").map(function (v) { return 文(v).trim(); })); return; }
      行.push([文(t)]);
    });
    if (鍵 && 鍵.length) {
      var 同じ = 行.length && 行[0].length === 鍵.length
        && 行[0].every(function (v, i2) { return v === 鍵[i2]; });
      if (!同じ) 行.unshift(鍵.map(文));
    }
    if (!行.length) return null;
    var 列 = 0;
    行.forEach(function (r) { if (r.length > 列) 列 = r.length; });
    列 = Math.max(1, Math.min(12, 列));
    return 行.slice(0, 20).map(function (r) {
      var o = r.slice(0, 列);
      while (o.length < 列) o.push("");
      return o;
    });
  }
  /* グラフ: values / data / 数の じか並び のどれでも 受け、
     **values と data の 両方**を 持たせる（描く側は values を読む）。 */
  var 種の言い換え = {
    bar: "bar", column: "bar", vbar: "bar", "棒": "bar", "縦棒": "bar", "棒グラフ": "bar",
    hbar: "hbar", barh: "hbar", horizontalbar: "hbar", horizontal: "hbar",
    "横棒": "hbar", "横棒グラフ": "hbar",
    line: "line", "折れ線": "line", "折線": "line", "折れ線グラフ": "line",
    area: "area", "面": "area", "面グラフ": "area",
    pie: "pie", circle: "pie", "円": "pie", "円グラフ": "pie",
    donut: "donut", doughnut: "donut", "ドーナツ": "donut",
    scatter: "scatter", point: "scatter", "散布図": "scatter"
  };
  function 数の並び(v) {
    if (!Array.isArray(v) || !v.length) return null;
    var out = [], ok = 0;
    for (var i = 0; i < v.length; i++) {
      var x = v[i];
      if (x && typeof x === "object") {
        if (Array.isArray(x)) return null;
        var y = x.value !== undefined ? x.value : (x.y !== undefined ? x.y : x["値"]);
        if (y === undefined) return null;
        x = y;
      }
      var n = Number(x);
      out.push(isFinite(n) ? n : 0);
      if (isFinite(n)) ok++;
    }
    return ok ? out : null;
  }
  function グラフにする(g) {
    if (!g || typeof g !== "object") return null;
    var t = String(g.type || g.kind || "").toLowerCase().replace(/[\s_-]+/g, "");
    var lb = g.labels !== undefined ? g.labels
           : (g.categories !== undefined ? g.categories : g.x);
    if (typeof lb === "string") lb = lb.split(/[,、\n]+/);
    var labels = Array.isArray(lb) ? lb.map(文) : [];
    var 生 = g.series !== undefined ? g.series
           : (g.datasets !== undefined ? g.datasets
           : (g.data !== undefined ? g.data : g.values));
    var 並 = Array.isArray(生) ? 生 : (生 === undefined || 生 === null ? [] : [生]);
    var 出 = [];
    並.forEach(function (x, i) {
      if (Array.isArray(x)) { var v0 = 数の並び(x); if (v0) 出.push({ name: "系列" + (i + 1), values: v0 }); return; }
      if (!x || typeof x !== "object") return;
      var v = 数の並び(x.values) || 数の並び(x.data) || 数の並び(x.y) || 数の並び(x["値"]);
      if (v) 出.push({ name: 文(x.name || x.label || ("系列" + (i + 1))), values: v });
    });
    if (!出.length) {
      var v2 = 数の並び(並);
      if (v2) {
        出 = [{ name: 文(g.title || g.name || "値"), values: v2 }];
        if (!labels.length)
          labels = 並.map(function (x, i2) {
            var n = x && typeof x === "object"
              ? (x.label !== undefined ? x.label : x.name) : undefined;
            return n === undefined ? String(i2 + 1) : 文(n);
          });
      }
    }
    var n2 = labels.length;
    if (!n2) { 出.forEach(function (x) { if (x.values.length > n2) n2 = x.values.length; });
               labels = []; for (var i3 = 0; i3 < n2; i3++) labels.push(String(i3 + 1)); }
    出.forEach(function (x) {
      while (x.values.length < n2) x.values.push(0);
      if (x.values.length > n2) x.values = x.values.slice(0, n2);
      x.data = x.values;
    });
    return { type: 種の言い換え[t] || "bar", title: 文(g.title), labels: labels, series: 出 };
  }

  function newDeck(meta, seed) {
    var s = VQD.constraints.nearestValidSeed(seed || {});
    return {
      meta: {
        title: 文(meta && meta.title) || "無題",
        audience: 文(meta && meta.audience),
        purpose: 文(meta && meta.purpose),
        pageCount: Math.max(1, parseInt(meta && meta.pageCount, 10) || 1),
        lang: (meta && meta.lang) === "en" ? "en" : "ja"
      },
      seed: s.seed, seedを直した: s.直した,
      tokens: VQD.derive(s.seed),
      pages: [], status: "complete"
    };
  }

  function newPage(purpose, layout, index) {
    var p = G.PURPOSES.indexOf(purpose) >= 0 ? purpose : "detail";
    return {
      id: "p" + (index + 1),
      "番号": index + 1,
      purpose: p,
      layout: G.正規化(layout || G.受け皿(p, index)),
      content: [],
      resolved: null,
      status: "unresolved",
      issues: [],
      repairCount: 0
    };
  }

  /* SlotContent の形をそろえる。**知らない鍵は落とす**（勝手な拡張を防ぐ）。 */
  function 中身をそろえる(c, role) {
    c = c || {};
    var o = { slotIndex: parseInt(c.slotIndex, 10) || 0, role: role || c.role || "body" };
    if (c.text !== undefined) o.text = 文(c.text);
    if (c.items !== undefined || c.bullets !== undefined || c.list !== undefined)
      o.items = 並びにする(c.items !== undefined ? c.items
                  : (c.bullets !== undefined ? c.bullets : c.list))
        .map(文)
        /* 行頭の 印は 落とす。layout-resolve が 「・」を 付け直すので、
           残すと 「・・りんご」に なる。「-5度」を 壊さないよう、
           中黒は そのまま、ハイフン・星は **空きが 続くときだけ** 落とす。 */
        .map(function (x) { return x.replace(/^\s*(?:[・•]\s*|[-*]\s+)/, "").trim(); })
        .filter(function (x) { return x; });
    if (c.value !== undefined) o.value = 文(c.value);
    if (c.caption !== undefined) o.caption = 文(c.caption);
    if (c.rows !== undefined || c.table !== undefined || c.headers !== undefined) {
      var 表 = 表にする(c.rows !== undefined ? c.rows : c.table,
                        c.headers !== undefined ? c.headers
                          : (c.header !== undefined ? c.header : c.columns));
      if (表) o.rows = 表;
    }
    /* ★ 新しい役目（steps / compare / kpi / timeline）の中身は
       **1 つの形**にそろえる。役目ごとに別の鍵を作ると 覚えられない。
         題 … 見出し（手順名・比べる相手・KPI の名前・年表の点）
         文 … そえる説明
         数 … 大きく出す数（kpi のとき） */
    if (Array.isArray(c.cells)) {
      o.cells = c.cells.slice(0, 6).map(function (x) {
        x = x || {};
        var y = {};
        if (x.title !== undefined || x["題"] !== undefined) y.title = 文(x.title !== undefined ? x.title : x["題"]);
        if (x.text !== undefined || x["文"] !== undefined) y.text = 文(x.text !== undefined ? x.text : x["文"]);
        if (x.value !== undefined || x["数"] !== undefined) y.value = 文(x.value !== undefined ? x.value : x["数"]);
        return y;
      }).filter(function (y) { return y.title || y.text || y.value; });
    }
    /* ★ 図（SVG）と 借りた絵。ここで 落とすと deck に 図が 入らない
       （2026-08-28・訴え「図の生成はできませんでした」）。
       ★★ **清めるのは ここ**（VQSVG）。deck は slidesWrite を 通らないので、
         ここで 清めないと **生の SVG が そのまま 画面に 出る**。
       ★★ 文() を 通さないこと。文() は <span> などを 落として
         &lt; を < に 戻すので、SVG が 壊れる（別の 意味に 変わる）。 */
    if (c.svg !== undefined) {
      var 生 = String(c.svg == null ? "" : c.svg);
      if (生.trim()) {
        var V = (typeof root !== "undefined" && root.VQSVG) ? root.VQSVG : null;
        var r2 = V ? V.清める(生) : { ok: false };
        if (r2.ok) o.svg = r2.svg;
        else o.svgだめ = (r2["なぜ"] || "SVG の 部品が 読み込まれていません");
      }
    }
    if (c.src !== undefined) {
      /* 置き場は **こちらの 住所だけ**（外の 住所を そのまま 貼らせない） */
      var sr = String(c.src == null ? "" : c.src).trim();
      if (/^\/api\/media\//.test(sr) || /^data:image\//.test(sr)) o.src = sr;
      else if (sr) o.srcだめ = "取り込んでいない 住所は 貼れません（usePicture を 使ってください）";
    }
    if (c.alt !== undefined) o.alt = 文(c.alt);
    if (c.credit && typeof c.credit === "object") o.credit = c.credit;
    var 生図 = c.chart !== undefined ? c.chart : c.graph;
    if (生図 && typeof 生図 === "object") {
      var 図 = グラフにする(生図);
      if (図 && 図.series.length && 図.labels.length) o.chart = 図;
    }
    return o;
  }

  /* 1 ページを 座標まで解く → Gate にかける */
  function 解く(deck, page) {
    var res = VQD.resolve(page, deck.tokens, { w: 960, h: 540 });
    var g = VQD.gate.checkPage(page, res, deck.tokens);
    page.resolved = res;
    page.issues = g.issues;
    page.status = g.status;
    return g;
  }

  /* デッキ全部（デッキ全体の警告も足す） */
  function 全部解く(deck) {
    var 結 = deck.pages.map(function (p) { return { page: p, g: 解く(deck, p), res: p.resolved }; });
    var 全 = VQD.gate.checkDeck(deck.pages, 結);
    全.forEach(function (w) {
      /* デッキ全体の警告は 1 枚目に持たせず、meta 側へ置く */
      deck.meta.警告 = (deck.meta.警告 || []).concat([w]);
    });
    var err = 結.reduce(function (n, r) { return n + r.g.error数; }, 0);
    var warn = 結.reduce(function (n, r) { return n + r.g.warning数; }, 0) + 全.length;
    var 未 = deck.pages.filter(function (p) { return p.status === "unresolved"; }).length;
    deck.status = (err || 未) ? "has_warnings" : (warn ? "has_warnings" : "complete");
    return { error数: err, warning数: warn, 未解決: 未, 結: 結 };
  }

  VQD.ir = { newDeck: newDeck, newPage: newPage, 中身をそろえる: 中身をそろえる,
             解く: 解く, 全部解く: 全部解く };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/preview.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/preview.js — DeckIR を そのまま HTML で描く（確認用）

   ★ Slides の API を叩かずに 見た目を確かめられるようにするためのもの。
     ここで納得できないものは、本番へ出しても納得できない。
   ★ 書体の実体（/fonts/css/<id>.css）は使うぶんだけ head へ挿す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 書体の実体を読む。同じものは 2 度入れない。 */
  var 読んだ = {};
  function 書体を読む(ids) {
    if (!doc) return;
    (ids || []).forEach(function (id) {
      if (!id || 読んだ[id]) return;
      読んだ[id] = 1;
      var lk = doc.createElement("link");
      lk.rel = "stylesheet";
      lk.href = "/fonts/css/" + id + ".css";
      lk.setAttribute("data-vqd-font", id);
      (doc.head || doc.documentElement).appendChild(lk);
    });
  }
  /* id の並び → CSS の font-family。**二重引用符は使わない**
     （style 属性の中へ入れると そこで属性が切れる。実測済みの罠）。 */
  var 家族 = null;
  function familyOf(ids) {
    if (!家族) {
      家族 = {};
      try {
        (VQD.fontFamilyTable || []).forEach(function (f) { 家族[f.id] = f.family; });
      } catch (e) {}
    }
    書体を読む(ids);
    var 名 = (ids || []).map(function (id) { return 家族[id] || id; });
    return 名.map(function (n) { return "'" + n + "'"; }).join(",") + ",sans-serif";
  }

  /* ── かんたんなグラフ（確認用。本番は Workplace の chart が描く）──── */
  function chartSvg(c, w, h, t) {
    /* ★ 色は Tokens の 6 枠を **決まった順で**使う（2026-08-17）。
       前は 差し色・副・うすい差し色・罫線 を混ぜていたので、
       うすい色と灰色が混ざって にごっていた。
     ★ 系列が 1 本のときは **全部 同じ色**。棒ごとに色を変えない
       （色は「見分け」のためのもので、飾りではない）。 */
    var 色 = (t.color.chart && t.color.chart.length) ? t.color.chart
      : [t.color.accent, t.color.secondary, t.color.border];
    var 系列数 = (c.series || []).length;
    var s0 = (c.series && c.series[0]) || { data: [] };
    var d = (s0.data || []).map(Number);
    var 題 = c.title ? 22 : 0;
    var 名 = (c.labels || []).length ? 16 : 0;      /* 下の名前ぶん あけておく */
    var W = w, H = h - 題 - 名;
    if (!d.length || H <= 10) return "";
    var 出 = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '">';
    if (c.title)
      出 += '<text x="0" y="14" font-size="13" fill="' + esc(t.color.textSecondary) + '">' + esc(c.title) + "</text>";
    var 最 = Math.max.apply(null, d.concat([1]));
    if (c.type === "pie" || c.type === "donut") {
      var 和 = d.reduce(function (a, b) { return a + b; }, 0) || 1;
      var cx = W / 2, cy = 題 + H / 2, r = Math.min(W, H) / 2 - 4, a0 = -Math.PI / 2;
      d.forEach(function (v, i) {
        var a1 = a0 + (v / 和) * Math.PI * 2;
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        出 += '<path d="M' + cx + " " + cy + " L" + x0.toFixed(1) + " " + y0.toFixed(1)
          + " A" + r + " " + r + " 0 " + ((a1 - a0) > Math.PI ? 1 : 0) + " 1 "
          + x1.toFixed(1) + " " + y1.toFixed(1) + ' Z" fill="' + esc(色[i % 色.length]) + '"/>';
        a0 = a1;
      });
      if (c.type === "donut")
        出 += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="' + esc(t.color.bg) + '"/>';
    } else if (c.type === "line" || c.type === "area" || c.type === "scatter") {
      var st = W / Math.max(1, d.length - 1);
      var pts = d.map(function (v, i) { return (i * st).toFixed(1) + "," + (題 + H - (v / 最) * H * 0.9).toFixed(1); });
      if (c.type === "area")
        出 += '<polygon points="0,' + (題 + H) + " " + pts.join(" ") + " " + W + "," + (題 + H)
          + '" fill="' + esc(t.color.accentSoft) + '"/>';
      if (c.type !== "scatter")
        出 += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + esc(色[0]) + '" stroke-width="3"/>';
      pts.forEach(function (p) {
        var xy = p.split(",");
        出 += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="4" fill="' + esc(色[0]) + '"/>';
      });
    } else {
      var 横 = c.type === "hbar";
      var n = d.length, すき = 8;
      d.forEach(function (v, i) {
        if (横) {
          var bh = (H - すき * (n - 1)) / n;
          出 += '<rect x="0" y="' + (題 + i * (bh + すき)) + '" width="' + ((v / 最) * W * 0.95)
            + '" height="' + bh + '" fill="' + esc(系列数 > 1 ? 色[i % 色.length] : 色[0]) + '" rx="3"/>';
        } else {
          var bw = (W - すき * (n - 1)) / n;
          var bhh = (v / 最) * H * 0.9;
          出 += '<rect x="' + (i * (bw + すき)) + '" y="' + (題 + H - bhh) + '" width="' + bw
            + '" height="' + bhh + '" fill="' + esc(系列数 > 1 ? 色[i % 色.length] : 色[0]) + '" rx="3"/>';
        }
      });
    }
    /* 名前（labels）は 下に あけておいた帯へ。棒の上には重ねない。 */
    if ((c.labels || []).length)
      出 += '<text x="0" y="' + (h - 3) + '" font-size="11" fill="' + esc(t.color.textSecondary) + '">'
        + esc((c.labels || []).join(" ／ ").slice(0, 64)) + "</text>";
    return 出 + "</svg>";
  }

  /* ── 部品 1 つ ─────────────────────────────────────────────── */
  function elHtml(e, t) {
    var 枠 = "position:absolute;left:" + e.x + "px;top:" + e.y + "px;width:" + e.w
      + "px;height:" + e.h + "px;z-index:" + (e.z || 1) + ";";
    if (e.type === "text") {
      return '<div style="' + 枠 + "font-family:" + familyOf(e.fontStack) + ";font-size:" + e.size
        + "px;font-weight:" + (e.bold ? 700 : 400) + ";color:" + esc(e.color)
        + ";text-align:" + esc(e.align || "left") + ";line-height:" + (e.lh || 1.4)
        + ";letter-spacing:" + (e.size >= 36 ? "-0.02em" : "0.02em")
        + ';white-space:pre-wrap;overflow:hidden">' + esc(e.text) + "</div>";
    }
    if (e.type === "number") {
      return '<div style="' + 枠 + 'display:grid;place-items:center;text-align:center">'
        + '<div style="width:100%"><div style="font-family:' + familyOf(e.fontStack)
        + ";font-size:" + e.size + "px;font-weight:800;line-height:1.1;color:" + esc(e.color)
        + ';letter-spacing:-0.02em">' + esc(e.text) + "</div>"
        + (e.label ? '<div style="font-size:' + Math.max(12, Math.round(e.size * 0.22))
            + "px;color:" + esc(t.color.textSecondary) + ';margin-top:4px">' + esc(e.label) + "</div>" : "")
        + "</div></div>";
    }
    if (e.type === "shape") {
      var 角 = e.shape === "circle" ? "50%" : (e.radius >= 9999 ? "50%" : (e.radius || 0) + "px");
      if (e.shape === "triangle")
        return '<div style="' + 枠 + '"><svg viewBox="0 0 100 100" preserveAspectRatio="none" '
          + 'style="width:100%;height:100%"><polygon points="50,4 96,96 4,96" fill="' + esc(e.fill) + '"/></svg></div>';
      return '<div style="' + 枠 + "background:" + esc(e.fill) + ";border-radius:" + 角
        + (e.opacity !== undefined ? ";opacity:" + e.opacity : "") + '"></div>';
    }
    if (e.type === "line")
      return '<div style="' + 枠 + '"><svg viewBox="0 0 100 10" preserveAspectRatio="none" style="width:100%;height:100%">'
        + '<line x1="0" y1="5" x2="100" y2="5" stroke="' + esc(e.color) + '" stroke-width="'
        + (e.weight || 2) + '"/></svg></div>';
    if (e.type === "arrow")
      return '<div style="' + 枠 + '"><svg viewBox="0 0 100 20" preserveAspectRatio="none" style="width:100%;height:100%">'
        + '<line x1="2" y1="10" x2="88" y2="10" stroke="' + esc(e.color) + '" stroke-width="3"/>'
        + '<polygon points="88,3 99,10 88,17" fill="' + esc(e.color) + '"/></svg></div>';
    if (e.type === "table") {
      var rows = e.rows || [];
      var h = '<div style="' + 枠 + 'overflow:hidden"><table style="width:100%;height:100%;'
        + "border-collapse:collapse;table-layout:fixed;font-family:" + familyOf(t.type.stack.body)
        + ";font-size:" + e.size + "px;color:" + esc(t.color.textPrimary) + '">';
      rows.forEach(function (r, ri) {
        h += "<tr>" + (r || []).map(function (c) {
          return '<td style="border:1px solid ' + esc(t.color.border) + ";padding:4px 8px;overflow:hidden"
            + (ri === 0 ? ";font-weight:700;background:" + esc(t.color.accentSoft) : "") + '">'
            + esc(c) + "</td>";
        }).join("") + "</tr>";
      });
      return h + "</table></div>";
    }
    if (e.type === "chart")
      return '<div style="' + 枠 + '">' + chartSvg(e.chart || {}, e.w, e.h, t) + "</div>";
    return "";
  }

  /* ── 1 ページ ─────────────────────────────────────────────── */
  function pageHtml(page, t, opts) {
    opts = opts || {};
    var res = page.resolved || VQD.resolve(page, t, { w: 960, h: 540 });
    var W = res.canvas.w, H = res.canvas.h;
    var 拡 = opts.scale || 1;
    var 中 = res.elements.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); })
      .map(function (e) { return elHtml(e, t); }).join("");
    return '<div class="vqd-page" style="width:' + (W * 拡) + "px;height:" + (H * 拡)
      + 'px;overflow:hidden;position:relative">'
      + '<div style="width:' + W + "px;height:" + H + "px;position:absolute;left:0;top:0;"
      + "transform:scale(" + 拡 + ");transform-origin:0 0;background:" + res.background + '">'
      + 中 + "</div></div>";
  }

  function deckHtml(deck, opts) {
    return (deck.pages || []).map(function (p) { return pageHtml(p, deck.tokens, opts); }).join("");
  }

  VQD.preview = { pageHtml: pageHtml, deckHtml: deckHtml, elHtml: elHtml,
                  chartSvg: chartSvg, familyOf: familyOf, 書体を読む: 書体を読む, esc: esc };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/render-vqslides.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/render-vqslides.js — DeckIR → VocabuSlides の中身

   ★ このアプリに Google Slides は無い。行き先は
     body.slides[].elements[]（960×540 の絶対座標）。
   ★ 部品の色・書体は **全部 明示して**渡す。テーマ任せにしない。
     テーマ任せにすると、テーマを変えた瞬間に Seed の配色が壊れる。
   ★ 背景は slide.background（CSS そのまま）。ここを入れると
     テーマの飾りは出なくなる（ui-slides.js の decorHtml がそう作られている）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  function uid(p) {
    try {
      var M = root.VQ2 && root.VQ2.workplace && root.VQ2.workplace.model;
      if (M && M.uid) return M.uid(p);
    } catch (e) {}
    return p + "_" + Math.abs(Math.floor((Date.now() % 1e9) + Math.random() * 1e6)).toString(36);
  }

  /* 画面の一覧に出る「レイアウト名」。中身の作りに合わせて選ぶ。
     位置は絶対座標で持っているので、ここは **見出し代わり**でしかない。 */
  function レイアウト名(page) {
    var 役 = (page.layout.slots || []).map(function (s) { return s.role; });
    var p = page.purpose;
    if (p === "title") return "title";
    if (p === "closing" || p === "cta") return "summary";
    if (役.indexOf("chart") >= 0) return "chart";
    if (役.indexOf("quote") >= 0) return "quote";
    if (役.indexOf("metric") >= 0) return "number";
    if (役.indexOf("table") >= 0) return p === "timeline" ? "timeline" : (p === "team" ? "team" : "title_body");
    if (役.indexOf("diagram") >= 0 || 役.indexOf("steps") >= 0) return "process";
    if (役.indexOf("kpi") >= 0) return "number";
    if (役.indexOf("compare") >= 0) return "compare";
    if (役.indexOf("timeline") >= 0) return "timeline";
    if (役.indexOf("section") >= 0) return "section";
    if (page.layout.partition.direction === "horizontal") {
      if (page.layout.partition.count >= 3) return "three_col";
      if (page.layout.partition.count === 2) return "two_col";
    }
    if (p === "summary") return "summary";
    if (p === "agenda") return "section";
    return "title_body";
  }

  /* ResolvedElement → アプリの部品（鍵の名前を合わせるだけ） */
  function 部品(e, t) {
    var o = { id: uid("e"), type: e.type,
              x: Math.round(e.x), y: Math.round(e.y),
              w: Math.round(e.w), h: Math.round(e.h), z: e.z === undefined ? 1 : e.z,
              /* ★ 役目を **残す**（2026-08-17・訴え）。
                 これが無いと「3 枚目の見出しを直して」と言われても
                 どれが見出しか 分からず、id を当てずっぽうで指すしかない。 */
              役: e.役 || undefined };
    if (e.type === "text") {
      o.text = String(e.text || "");
      o.size = e.size; o.bold = !!e.bold; o.align = e.align || "left";
      o.color = e.color; o.lh = e.lh;
      o.fontStack = e.fontStack;
    } else if (e.type === "number") {
      o.text = String(e.text || ""); o.label = String(e.label || "");
      o.size = e.size; o.color = e.color; o.fontStack = e.fontStack;
    } else if (e.type === "shape") {
      o.shape = e.shape || "rect"; o.fill = e.fill;
      o.radius = e.radius >= 9999 ? 9999 : (e.radius || 0);
      if (e.opacity !== undefined) o.opacity = e.opacity;
    } else if (e.type === "line") {
      o.color = e.color; o.weight = e.weight || 2;
    } else if (e.type === "arrow") {
      o.color = e.color;
    } else if (e.type === "table") {
      o.rows = (e.rows || []).map(function (r) {
        return (Array.isArray(r) ? r : [r]).map(function (v) {
          return v === undefined || v === null ? "" : String(v); });
      });
      o.size = e.size;
      /* 表の色も 明示する（テーマの色を継がせない） */
      o.color = t.color.textPrimary;
      o.borderColor = t.color.border;
      o.headFill = t.color.accentSoft;
    } else if (e.type === "svg") {
      o.svg = e.svg;
      if (e.alt) o.alt = e.alt;
      /* 出どころは **必ず 連れて行く**（CC-BY は 作者の 表示が 条件） */
      if (e.credit) o.credit = e.credit;
    } else if (e.type === "image") {
      o.src = e.src;
      if (e.alt) o.alt = e.alt;
      o.fit = e.fit || "contain";
      if (e.credit) o.credit = e.credit;
    } else if (e.type === "chart") {
      o.chart = e.chart;
      o.palette = t.color.chart;         /* --vq-chart-1〜6 に流し込む */
      o.ink = t.color.textPrimary;
      o.bg = "transparent";
    }
    return o;
  }

  /* DeckIR → presentation の中身（そのまま session.content.content に入る形） */
  function toWorkplace(deck, opts) {
    opts = opts || {};
    var t = deck.tokens;
    var slides = (deck.pages || []).map(function (p) {
      var res = p.resolved || VQD.resolve(p, t, { w: 960, h: 540 });
      return {
        id: uid("sl"),
        layout: レイアウト名(p),
        elements: res.elements
          .slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); })
          .map(function (e) { return 部品(e, t); }),
        notes: p.notes || "",
        hidden: false,
        background: res.background,
        transition: ""
      };
    });
    return {
      schemaVersion: 1,
      content: {
        theme: opts.theme || "minimal",     /* 飾りは background があるので出ない */
        ratio: "16:9",
        slides: slides,
        transition: { type: "fade", speed: 300 },
        /* どの Seed から作ったかを残す。あとから同じ見た目を作り直せる。 */
        designSeed: t.seedKey
      }
    };
  }

  VQD.toWorkplace = toWorkplace;
  VQD.レイアウト名 = レイアウト名;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /design/pipeline.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   design/pipeline.js — 通し（[2]構成 →[3][5]設計 →[6]中身 →[8]関門 →[9]修復）

   ★ LLM を呼ぶのは **3 回だけ**（構成 / 設計 / 中身）。
     [4] Tokens・[7] 座標・[8] 崩れ検出・[9] どう直すかの判断 は 計算だけ。
   ★ LLM に出させるのは **enum と整数と文** のみ。
     色コード・書体名・pt・px・座標は 1 つも出させない。
   ★ 修復は ページごと 2 回まで、全体 3 周まで。
     それでも残ったら「要確認」の印を付けて **出す**。止まり続けない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  var 状態 = null;          /* いま作りかけのデッキ */

  /* ══ 生成中の表示（画面の上）══════════════════════════════════════
     ★ 訴え「生成中は固まるんじゃなくて、上部に 生成中… と出しておいて」。
       作っているあいだ 画面は静かなので、止まったように見えていた。
     ★ 決めごと:
       ・**操作の邪魔を絶対にしない**（pointer-events:none。押せる物を隠さない）
       ・z-index は控えめ（前に z-index の取り合いで画面が固まったことがある）
       ・iPhone の切り欠きぶんを avoid（safe-area-inset-top）
       ・90 秒で自動的に消える（消し忘れて出っぱなしにしない）
       ・アプリの明暗（data-theme-mode）に合わせる */
  var 帯 = null, 帯タイマー = 0;
  function 進捗(文, 済, 全, 消えるまで) {
    try {
      var doc = root.document;
      if (!doc || !doc.body) return;
      if (!帯) {
        帯 = doc.createElement("div");
        帯.id = "vqdProgress";
        帯.setAttribute("role", "status");
        帯.setAttribute("aria-live", "polite");
        帯.style.cssText = [
          "position:fixed", "left:50%", "transform:translateX(-50%)",
          /* ★ Live の「聞いています。」の帯と **同じ場所に出ていた**（実測・目視）。
             真上は先客がいるので、その下へ ずらす。重ねない。 */
          "top:calc(env(safe-area-inset-top,0px) + 56px)",
          "z-index:900", "pointer-events:none",
          "display:flex", "align-items:center", "gap:10px",
          "padding:9px 16px", "border-radius:999px",
          "font:600 13px/1.4 -apple-system,'Hiragino Sans','Noto Sans JP',sans-serif",
          "letter-spacing:.02em",
          "background:var(--vq-surface,#ffffff)", "color:var(--vq-text,#1e2330)",
          "border:1px solid var(--vq-border,rgba(15,23,42,.12))",
          "box-shadow:0 6px 24px rgba(15,23,42,.16)",
          "max-width:min(92vw,420px)", "white-space:nowrap",
          "overflow:hidden", "text-overflow:ellipsis",
          "opacity:0", "transition:opacity .18s ease"
        ].join(";");
        帯.innerHTML = '<span class="vqd-sp" style="width:13px;height:13px;flex:none;'
          + "border-radius:50%;border:2px solid currentColor;border-top-color:transparent;"
          + 'animation:vqdSpin .8s linear infinite"></span><span class="vqd-tx"></span>';
        var st2 = doc.createElement("style");
        st2.textContent = "@keyframes vqdSpin{to{transform:rotate(360deg)}}"
          + "@media (prefers-reduced-motion:reduce){#vqdProgress .vqd-sp{animation:none}}";
        doc.head.appendChild(st2);
        doc.body.appendChild(帯);
        /* 次の描画で 出す（いきなり出すと 変化として見えない） */
        root.setTimeout(function () { if (帯) 帯.style.opacity = "1"; }, 16);
      }
      var t = 文 + (全 ? "（" + 済 + " / " + 全 + " 枚）" : "");
      var tx = 帯.querySelector(".vqd-tx");
      if (tx && tx.textContent !== t) tx.textContent = t;
      帯.style.opacity = "1";
      if (帯タイマー) root.clearTimeout(帯タイマー);
      /* ★ 消し忘れて 出っぱなしにしない。次の合図が来るまでの猶予。
         書類づくりの通し（deck*）は 長いので 90 秒、
         1 回きりの手直しは 6 秒で 静かに消す。 */
      帯タイマー = root.setTimeout(function () { 進捗を消す(); }, 消えるまで || 90000);
    } catch (e) {}
  }
  function 進捗を消す() {
    try {
      if (帯タイマー) { root.clearTimeout(帯タイマー); 帯タイマー = 0; }
      if (!帯) return;
      var b = 帯;
      b.style.opacity = "0";
      root.setTimeout(function () { try { b.parentNode.removeChild(b); } catch (e) {} }, 220);
      帯 = null;
    } catch (e) {}
  }

  function VQ() { return root.VQ2 && root.VQ2.workplace; }
  function 今() { try { return VQ().cmd.いま(); } catch (e) { return null; } }

  function S(v) { return v === undefined || v === null ? "" : String(v); }
  function N(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  /* ── [1] 始める（構成は LLM が purpose の並びで渡す）───────────── */
  function deckStart(a) {
    a = a || {};
    var 枚 = Math.max(1, Math.min(60, N(a.pageCount, (a.pages || []).length || 8)));
    var 並び = (a.pages || []).map(function (p) {
      return S(p && (p.purpose || p)) || "detail";
    }).slice(0, 枚);
    while (並び.length < 枚) 並び.push("detail");

    進捗("生成中… 組み立てを始めています", 0, 枚);
    var 知らない = 並び.filter(function (p) { return VQD.grammar.PURPOSES.indexOf(p) < 0; });
    状態 = {
      meta: { title: S(a.title) || "無題", audience: S(a.audience), purpose: S(a.purpose),
              pageCount: 枚, lang: a.lang === "en" ? "en" : "ja" },
      purposes: 並び.map(function (p) { return VQD.grammar.PURPOSES.indexOf(p) >= 0 ? p : "detail"; }),
      deck: null, 段階: "設計まち", 周: 0
    };
    return {
      やった: 枚 + " 枚の組み立てを 始めました。",
      ページの役目: 状態.purposes.map(function (p, i) { return (i + 1) + ". " + p; }),
      知らない役目: 知らない.length ? 知らない : undefined,
      つぎ: "**deckDesign を 1 回だけ呼んでください。**"
        + "デザインの 10 軸と、各ページの割りかたを まとめて渡します。",
      デザインの軸: 軸の説明(),
      レイアウトの決まり: {
        分割: "1〜4。ratio は " + VQD.grammar.RATIOS.map(function (r) { return r.join(":"); }).join(" / ") + " のどれか",
        向き: "vertical = 上下に積む ／ horizontal = 左右に並べる",
        役目: VQD.grammar.ROLES_使える,
        重み: "primary は 1 ページに **ちょうど 1 つ**",
        面: "table / chart / diagram は その枠が 面の 40% 以上を占めること",
        ちがい: "**となりのページと 3 つ以上 変えること。**同じ割りかたを続けない"
      }
    };
  }

  function 軸の説明() {
    var A = VQD.seed.AXES, 出 = {};
    VQD.seed.ORDER.forEach(function (k) {
      if (k === "fontPair") {
        出.fontPair = { 選べる: "0〜23", 意味: VQD.fonts.一覧() };
        return;
      }
      出[k] = { 選べる: VQD.seed.valuesOf(k), 印象: A[k].印象 };
    });
    return 出;
  }

  /* ── [3][5] 設計（Seed と 各ページの割りかたを 1 回で受け取る）───── */
  function deckDesign(a) {
    if (!状態) return { だめ: "先に deckStart を呼んでください。**何もしていません。**" };
    進捗("生成中… デザインを決めています", 0, 状態.meta.pageCount);
    a = a || {};
    var 直し = [];

    /* Seed: 形をそろえて、禁じ手なら **計算で** いちばん近い有効な組へ */
    var s0 = VQD.seed.normalize(a);
    var n = VQD.constraints.nearestValidSeed(s0);
    if (n.直した.length)
      n.直した.forEach(function (x) {
        直し.push("Seed: " + x.軸 + " を " + x.前 + " → " + x.後 + "（" + x.なぜ + "）");
      });

    var deck = VQD.ir.newDeck(状態.meta, n.seed);

    /* レイアウト: 渡ってきたものを 正規化 → 妥当性を計算で直す */
    var 渡 = {};
    (a.layouts || []).forEach(function (L) {
      var i = N(L && L.page, 0);
      if (i >= 1 && i <= 状態.purposes.length) 渡[i - 1] = L;
    });
    var specs = 状態.purposes.map(function (p, i) {
      var L = 渡[i];
      if (!L) { 直し.push((i + 1) + " 枚目: 割りかたが渡らなかったので 受け皿を使いました"); return VQD.grammar.受け皿(p, i); }
      var r = VQD.grammar.直す(L);
      if (r.直し.length) 直し.push((i + 1) + " 枚目: " + r.直し.join(" / "));
      if (!r.ok) { 直し.push((i + 1) + " 枚目: " + r.悪.join(" / ") + " → 受け皿へ"); return VQD.grammar.受け皿(p, i); }
      return r.spec;
    });

    /* 多様性は **計算で**そろえる（LLM に作り直させない） */
    var 整 = VQD.diversity.整える(specs, (deck.tokens.seed.hue + deck.tokens.seed.fontPair) | 0);
    整.直し.forEach(function (x) { 直し.push(x.番 + " 枚目: 割りかたを 変えました（" + x.なぜ + "）"); });

    整.specs.forEach(function (sp, i) {
      deck.pages.push(VQD.ir.newPage(状態.purposes[i], sp, i));
    });
    状態.deck = deck;
    状態.段階 = "中身まち";

    return {
      やった: "デザインを決めました。",
      使った設計: 設計の要約(deck),
      計算で直したこと: 直し.length ? 直し : "なし",
      書くところ: 書くところ(deck, 1, Math.min(5, deck.pages.length)),
      ページの流れ: 状態.purposes.map(function (p, i) { return (i + 1) + ". " + p; }),
      つぎ: "**deckWrite で 5 枚ずつ 書いてください。**"
        + "各スロットの『文字数上限』と『行数上限』を **必ず**守ること。"
        + "超えたら 入りきらず、やり直しになります。"
    };
  }

  function 設計の要約(deck) {
    var s = deck.tokens.seed, p = VQD.fonts.of(s.fontPair);
    return {
      Seed: deck.tokens.seedKey,
      色: s.hue + "° / " + s.scheme + " / " + s.mode,
      書体: p.名 + "（" + p.印象 + "）",
      組み: "比 " + s.typeScale + " / " + s.grid + " 列 / " + s.spacing
        + " / " + s.shape + " / 飾り " + s.accent + " / 地 " + s.background,
      "★色や px は こちらで計算しました": "あなたは 文だけ書いてください。"
    };
  }

  /* 何をどれだけ書けばよいか（数で渡す。「短く」とは言わない） */
  /* すでに書けているページの 役目と見出し。
     ★ 5 枚ずつ書く作りなので、後半を書くとき **前半に何を書いたか**を
       渡さないと、目次と中身が食い違う（訴え「目次と矛盾する」）。 */
  function これまでの見出し(deck) {
    var 出 = [];
    (deck.pages || []).forEach(function (p, i) {
      var h = "";
      (p.content || []).forEach(function (c) {
        if (c.role === "heading" && !h) h = S(c.text);
      });
      if (h) 出.push({ page: i + 1, 役目: p.purpose, 見出し: h });
    });
    return 出;
  }

  function 書くところ(deck, from, to) {
    var 出 = [];
    for (var i = from - 1; i < to && i < deck.pages.length; i++) {
      var p = deck.pages[i];
      var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
      出.push({
        page: i + 1, 役目: p.purpose,
        スロット: 寸.filter(function (x) { return x.role !== "spacer"; }).map(function (x) {
          var o = { slotIndex: x.slotIndex, role: x.role };
          if (x.role === "table") { o.欲しいもの = "rows（1 行目が見出し）"; o.行数の目安 = x.行数上限; }
          else if (x.role === "chart") o.欲しいもの = "chart（type / labels / series）";
          else if (x.role === "metric") { o.欲しいもの = "value（数そのもの）と caption（何の数か）";
            o["value の文字数上限"] = Math.min(10, x.一行の文字数); o["caption の文字数上限"] = 20; }
          else if (x.role === "bullets") { o.欲しいもの = "items（箇条書き）";
            o.項目数の上限 = x.行数上限; o["1 項目の文字数上限"] = Math.max(4, x.一行の文字数 - 1); }
          else if (x.role === "diagram") { o.欲しいもの = "items（流れの各段）"; o.項目数の上限 = 4; o["1 項目の文字数上限"] = 8; }
          else if (x.role === "quote") { o.欲しいもの = "text（引用）と caption（出どころ）"; o.文字数上限 = x.文字数上限; }
          else { o.欲しいもの = "text"; o.文字数上限 = x.文字数上限; }
          /* ★ どの枠でも **文の かわりに 図**を 置ける（2026-08-28）。
             役目を 増やさずに 図を 通す作りなので、ここで 知らせる。
             知らせないと Lumi は 図を 置けることに 気づけない。 */
          o["図でもよい"] = 'svg（<svg viewBox=…>…</svg>）か、'
            + "usePicture が返した src と credit を 渡すと、この枠は 図に なります";
          return o;
        })
      });
    }
    return 出;
  }

  /* ── [6] 中身 → [7] 座標 → [8] 関門 → [9] 修復 ─────────────────── */
  function deckWrite(a) {
    if (!状態 || !状態.deck) return { だめ: "先に deckStart → deckDesign を呼んでください。**何もしていません。**" };
    /* ★ 仕上げたあとに 書き直させない（2026-08-17・訴え「保存されない」の筋）。
       deckWrite は **全ページを作り直して丸ごと差し替える**ので、
       仕上げたあとに呼ぶと、そのあとの手直し（人の打ち替えも、
       slidesEdit の直しも）が **黙って消える**。
       利用者からは「直したのに保存されていない」に見える。
       仕上げたあとの手直しは slidesEdit の仕事。 */
    if (状態.段階 === "おわり")
      return { だめ: "この資料は **もう仕上がっています**。deckWrite で書き直すと"
                 + "そのあとの手直しが 消えます。**何もしていません。**",
               つぎ: "直したい所は slidesEdit（op:element）で指してください。"
                 + "指しかたは slide＋役／slide＋目印／slide＋type＋番号。"
                 + "何か所もあるときは elementOp:\"まとめて\" で 1 回にまとめられます。"
                 + "作り直したいなら deckStart からやり直してください。" };
    a = a || {};
    var deck = 状態.deck;
    var 入れた = 0;
    /* ★ 図が 通らなかったときは **黙らない**（2026-08-28）。
       黙ると 図の 無い ページが できて、Lumi は「入れた」と 言う。 */
    var 図のだめ = [];
    (a.pages || []).forEach(function (P) {
      var i = N(P && P.page, 0) - 1;
      if (i < 0 || i >= deck.pages.length) return;
      var pg = deck.pages[i];
      var 役 = {};
      pg.layout.slots.forEach(function (s, k) { 役[k] = s.role; });
      var 元 = {};
      (pg.content || []).forEach(function (c) { 元[c.slotIndex] = c; });
      (P.slots || []).forEach(function (c) {
        var k = N(c && c.slotIndex, -1);
        if (k < 0 || k >= pg.layout.slots.length) return;
        var y = VQD.ir.中身をそろえる(Object.assign({}, c, { slotIndex: k }), 役[k]);
        if (y.svgだめ) { 図のだめ.push((i + 1) + " 枚目 " + (k + 1) + " 番目の枠: 図を 置けません（" + y.svgだめ + "）"); delete y.svgだめ; }
        if (y.srcだめ) { 図のだめ.push((i + 1) + " 枚目 " + (k + 1) + " 番目の枠: " + y.srcだめ); delete y.srcだめ; }
        元[k] = y;
      });
      pg.content = Object.keys(元).map(function (k) { return 元[k]; });
      入れた++;
    });

    var 直した = 修復(deck);
    var 出せた = 書き出す(deck);
    var できた = deck.pages.filter(function (p) { return (p.content || []).length; }).length;
    if (できた >= deck.pages.length) 進捗("生成中… 仕上げを確かめています", できた, deck.pages.length);
    else 進捗("生成中… 中身を書いています", できた, deck.pages.length);

    /* ★ **まだ書いていないページを「直して」と言わない**（2026-08-17）。
       それは『書くところ』でもう案内している。二重に言うと
       どれが本当の直しか 分からなくなる。 */
    var 残 = deck.pages.map(function (p, i) {
      if (!(p.content || []).length) return null;
      var err = (p.issues || []).filter(function (x) { return x.深刻 === "error"; });
      if (!err.length) return null;
      return { page: i + 1, 直しかた: 直しの指示(p, deck, err) };
    }).filter(Boolean);

    var 済 = deck.pages.filter(function (p) { return p.status === "ok"; }).length;
    var つぎ番 = 次に書くページ(deck);
    return {
      やった: 入れた + " 枚に 中身を入れました。",
      置けなかった図: 図のだめ.length ? 図のだめ.slice(0, 8) : undefined,
      できたページ: 済 + " / " + deck.pages.length,
      計算で直したこと: 直した.length ? 直した : "なし",
      画面へ出せたか: 出せた ? "出しました" : "★ **出していません**（この資料は 別の所で直されています）",
      直してほしいところ: 残.length ? 残 : "なし",
      書くところ: つぎ番 ? 書くところ(deck, つぎ番, Math.min(つぎ番 + 4, deck.pages.length)) : [],
      すでに書いた見出し: これまでの見出し(deck),
      "★ここに注意": "上の『すでに書いた見出し』と 食い違わないように書いてください。"
        + "目次に無いページを足したり、目次と違う見出しを付けたりしないこと。",
      つぎ: 残.length
        ? "★ **直してほしいところ の指示どおりに 書き直して、もう一度 deckWrite を呼んでください。**"
        : (つぎ番 ? "**続けて deckWrite で " + つぎ番 + " 枚目から書いてください。**"
                  : "全部 入りました。**deckFinish を呼んでください。**")
    };
  }

  function 次に書くページ(deck) {
    for (var i = 0; i < deck.pages.length; i++) {
      var p = deck.pages[i];
      var 空 = !(p.content || []).length;
      if (空) return i + 1;
    }
    return 0;
  }

  /* ── [9] 修復（どう直すかは **計算で** 決める。LLM に選ばせない）──── */
  function 修復(deck) {
    var 直した = [];
    状態.周 = (状態.周 || 0) + 1;
    VQD.ir.全部解く(deck);
    if (状態.周 > 3) return 直した;               /* 全体の周回上限（§9）*/

    deck.pages.forEach(function (p, i) {
      /* ★ **まだ書いていないページには 手を出さない**（2026-08-17・実測）。
         5 枚ずつ書く作りなので、1 束目のあと 6〜10 枚目は 中身が空。
         それを「空のスロット」とみなして 枠を spacer へ畳んでいた。
         その結果、頼まれていた 表とグラフの枠が 丸ごと消えていた。 */
      if (!(p.content || []).length) return;
      var 回 = 0;
      while (回 < 2) {
        var err = (p.issues || []).filter(function (x) { return x.深刻 === "error"; });
        if (!err.length) return;
        var 種 = {};
        err.forEach(function (x) { 種[x.種] = (種[x.種] || 0) + 1; });
        var 前の数 = err.length;
        var 手 = null;

        if (種.boundsOverflow || 種.overlap) {
          /* 割りかたを 選び直す（多様性の決まりは保つ） */
          /* ★ ここは **かたい=true**。中身を書いたあとなので、
             枠の数や役目が変わると 書いた文が 行き場を失う。 */
          var n = VQD.diversity.選び直す(deck.pages.map(function (x) { return x.layout; }),
                                         i + 1, (deck.tokens.seed.hue + i * 7) | 0, 0, true);
          if (n) { p.layout = n; 手 = "割りかたを 選び直した"; }
        } else if (種.emptySlot && (p.repairCount || 0) >= 1) {
          /* 中身が無いスロットは **こちらでは埋めない**（作り話になる）。
             1 度は「書いてください」と返し、それでも空なら
             役目を spacer へ落として ページとして成立させる。 */
          var 変 = false;
          p.layout.slots.forEach(function (s, k) {
            var ある = (p.content || []).some(function (c) { return c.slotIndex === k; });
            if (!ある && s.role !== "spacer" && p.layout.slots.length > 1) { s.role = "spacer"; 変 = true; }
          });
          if (変) { p.layout = VQD.grammar.正規化(p.layout); 手 = "中身の無い枠を たたんだ"; }
        }
        if (!手) break;                            /* 文字数の直しは LLM の番 */

        var 前 = JSON.parse(JSON.stringify(p.issues || []));
        VQD.ir.解く(deck, p);
        var 後 = (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length;
        if (後 > 前の数) { p.issues = 前; break; }  /* 悪くなったら 元へ戻す */
        直した.push((i + 1) + " 枚目: " + 手 + "（error " + 前の数 + " → " + 後 + "）");
        p.repairCount = (p.repairCount || 0) + 1;
        回++;
      }
      if ((p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length && p.repairCount >= 2)
        p.status = "unresolved";
    });
    VQD.ir.全部解く(deck);
    return 直した;
  }

  /* LLM へ返す「どう書き直すか」。**必ず数で言う。** */
  function 直しの指示(p, deck, err) {
    var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
    var 出 = [];
    err.forEach(function (x) {
      if (x.種 === "lineOverflow" || x.種 === "charDensity") {
        (p.content || []).forEach(function (c) {
          var 上 = 寸[c.slotIndex];
          if (!上) return;
          var いま = (c.text || (c.items || []).join("")).length;
          if (x.種 === "charDensity" && c.role !== "body" && c.role !== "bullets") return;
          if (いま > 上.文字数上限)
            出.push("slotIndex " + c.slotIndex + "（" + c.role + "）を **"
              + 上.文字数上限 + " 文字以内**にしてください（いま " + いま + " 文字）");
        });
      } else if (x.種 === "emptySlot") {
        出.push(x.どこが + " → その slotIndex に 中身を書いてください");
      } else {
        出.push(x.どこが);
      }
    });
    if (!出.length) 出.push(err.map(function (x) { return x.どこが; }).join(" / "));
    return 出;
  }

  /* ── 画面へ書き出す（1 束ごとに 出す。最後まで待たせない）──────── */
  function 指紋(b) {
    try {
      var ss = b.slides || [];
      return ss.length + ":" + ss.reduce(function (n, s) { return n + (s.elements || []).length; }, 0)
        + ":" + ss.map(function (s) {
            return (s.elements || []).map(function (e) { return (e.text || "").length; }).join(",");
          }).join("|");
    } catch (e) { return ""; }
  }
  function 書き出す(deck) {
    try {
      var c = 今();
      if (!c || c.kind !== "presentation") return false;
      var b = VQ().cmd.本体(c);
      /* ★ **よそで変わっていたら 上書きしない**（2026-08-17・訴え）。
         前に自分が書き出したときの形と違うなら、
         その間に 人か slidesEdit が手を入れている。
         そこへ全ページ差し替えを当てると 手直しが消える。 */
      if (状態 && 状態.指紋 && 状態.指紋 !== 指紋(b)) {
        状態.よそで変わった = true;
        return false;
      }
      var out = VQD.toWorkplace(deck).content;
      b.theme = out.theme; b.ratio = out.ratio;
      b.slides = out.slides; b.transition = out.transition;
      b.designSeed = out.designSeed;
      try { c.paint(); } catch (e) {}
      try { c.session.touch ? c.session.touch() : (c.session.saveNow && c.session.saveNow()); } catch (e) {}
      if (状態) 状態.指紋 = 指紋(b);
      return true;
    } catch (e) { return false; }
  }

  /* ══ 目次を **実際の見出しに合わせる**（2026-08-17・訴え）═════════════
     ★ 訴え「目次に書いてあることと矛盾していたりする」。
     ★ 原因: 目次は 1 枚目の束で書くのに、中身は そのあとの束で書く。
       書いている時点では 後ろのページの見出しは まだ存在しない。
       LLM にいくら注意しても、**知らないものは書けない**。
     ★ 直しかた: 全部書き終わった時点で、目次の項目を
       **実際の見出しから作り直す**。ここは推測が要らないので計算でやる。
       勝手に直したことは 黙らずに返す。 */
  function 目次をそろえる(deck) {
    var 見 = [];
    deck.pages.forEach(function (p, i) {
      if (["title", "agenda", "closing"].indexOf(p.purpose) >= 0) return;
      var h = "";
      (p.content || []).forEach(function (c) { if (c.role === "heading" && !h) h = S(c.text); });
      if (h) 見.push(h);
    });
    if (!見.length) return null;
    var 直した = null;
    deck.pages.forEach(function (p, i) {
      if (p.purpose !== "agenda") return;
      var 枠 = null;
      p.layout.slots.forEach(function (s, k) { if (s.role === "bullets" && 枠 === null) 枠 = k; });
      if (枠 === null) return;
      var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
      var 行 = Math.max(2, (寸[枠] && 寸[枠].行数上限) || 6);
      var 幅 = Math.max(6, ((寸[枠] && 寸[枠].一行の文字数) || 20) - 2);
      var 並 = 見.slice();
      /* 入る行数より多いときは まとめる（勝手に削らず「ほか N 件」と書く） */
      var 出 = 並.slice(0, 行).map(function (t) {
        return t.length > 幅 ? t.slice(0, Math.max(2, 幅 - 1)) + "…" : t;
      });
      if (並.length > 行) 出[出.length - 1] = "ほか " + (並.length - 行 + 1) + " 件";
      var 前 = null;
      (p.content || []).forEach(function (c) { if (c.slotIndex === 枠) 前 = (c.items || []).join("／"); });
      if (前 === 出.join("／")) return;
      var 新 = (p.content || []).filter(function (c) { return c.slotIndex !== 枠; });
      新.push(VQD.ir.中身をそろえる({ slotIndex: 枠, items: 出 }, "bullets"));
      p.content = 新;
      直した = { page: i + 1, 前: 前, 後: 出 };
    });
    return 直した;
  }

  /* ── 仕上げ ───────────────────────────────────────────────── */
  function deckFinish() {
    if (!状態 || !状態.deck) { 進捗を消す(); return { だめ: "作りかけのデッキがありません。" }; }
    var deck = 状態.deck;
    var 目次直し = null;
    try { 目次直し = 目次をそろえる(deck); } catch (e) {}
    var r = VQD.ir.全部解く(deck);
    書き出す(deck);
    var 未 = deck.pages.map(function (p, i) {
      return (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length ? i + 1 : 0;
    }).filter(Boolean);
    var 種類 = {};
    deck.pages.forEach(function (p) { 種類[VQD.diversity.key(p.layout)] = 1; });
    var 空 = deck.pages.filter(function (p) { return !(p.content || []).length; }).length;
    if (空) {
      進捗("生成中… のこり " + 空 + " 枚", deck.pages.length - 空, deck.pages.length);
      return { だめ: "まだ **中身の無いページが " + 空 + " 枚**あります。**終われません。**",
               つぎ: "deckWrite で 残りを書いてください。",
               書くところ: 書くところ(deck, 次に書くページ(deck), Math.min(次に書くページ(deck) + 4, deck.pages.length)) };
    }
    進捗を消す();
    var 出 = {
      やった: deck.pages.length + " 枚 仕上げました。",
      Seed: deck.tokens.seedKey,
      レイアウトの種類: Object.keys(種類).length + " 種",
      崩れ: r.error数, 気になるところ: r.warning数,
      要確認のページ: 未.length ? 未 : "なし"
    };
    if (目次直し)
      出.目次を合わせました = {
        何枚目: 目次直し.page,
        前: 目次直し.前 || "（空）", 後: 目次直し.後.join("／"),
        なぜ: "目次を書いた時点では 後ろのページの見出しが まだ無かったので、"
          + "**実際の見出しに合わせました**。利用者へ「目次は中身に合わせた」と伝えてください。"
      };
    if (未.length)
      出.正直に = "★ " + 未.length + " 枚は 直しきれませんでした。"
        + "**「" + 未.join(",") + " 枚目は 確認してほしい」と 利用者へ伝えてください。**"
        + "できたふりをしないこと。";
    状態.段階 = "おわり";
    return 出;
  }

  /* いま作りかけのものを 見る（試験と 見直しのため） */
  function deckState() {
    if (!状態) return { 作りかけ: null };
    var d = 状態.deck;
    return {
      段階: 状態.段階, 周: 状態.周,
      meta: 状態.meta,
      Seed: d ? d.tokens.seedKey : null,
      ページ: d ? d.pages.map(function (p, i) {
        return { page: i + 1, 役目: p.purpose, 状態: p.status,
                 部品: p.resolved ? p.resolved.elements.length : 0,
                 崩れ: (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length };
      }) : []
    };
  }

  VQD.pipeline = { deckStart: deckStart, deckDesign: deckDesign, deckWrite: deckWrite,
                   deckFinish: deckFinish, deckState: deckState,
                   進捗: 進捗, 進捗を消す: 進捗を消す,
                   書き出す: 書き出す, 書くところ: 書くところ,
                   状態: function () { return 状態; },
                   捨てる: function () { 状態 = null; } };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/types.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/types.js — WorkIR の型（節点の種類と 空の書類）

   ★ 大前提: **WorkIR は 保存形式を置き換えない。**
     Workplace の保存形式は もともと JSON の木（blocks / sheets / slides /
     sections）で、画面も式も 印刷も その形を直に読んでいる。
     ここで別の木を作って そちらを正にすると、**同じものが 2 つ**になり、
     片方だけ直したときに黙って食い違う（これまで何度も踏んだ罠）。
   ★ だから WorkIR は **写し（projection）**にする。
       ・読む   … project.js が 保存形式 → WorkIR を作る
       ・書く   … ops/apply.js が **保存形式のほうを** 直す
       ・確かめ … 直す前後の WorkIR を hash で突き合わせる
     WorkIR から保存形式へ書き戻す道は 作らない。
     ＝ 往復変換は 定義上 必ず一致する（Phase 1 の完了条件）。

   ★ 節点の種類は 指示書 §3.2 のものに、Workplace が実際に持っている
     ものを足してある（divider / toc / todo / form*）。
     足さずに落とすと 写しが 中身を失い、検証が素通りする。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  /* ── 節点の種類 ───────────────────────────────────────────── */
  var TYPES = {
    docs: ["document", "section", "heading", "paragraph", "list", "listItem",
           "table", "tableRow", "tableCell", "image", "pageBreak",
           "math", "field", "answerSpace",
           /* Workplace が実際に持っているもの */
           "divider", "toc", "code", "quote", "callout", "todo", "caption"],
    sheets: ["workbook", "sheet", "region", "table", "tableHeader", "tableRow",
             "labelCell", "valueCell", "formulaCell", "inputCell", "mergedBlock",
             "chart"],
    slides: ["deck", "page", "slot", "textFrame", "imageFrame", "shape", "chart",
             "table", "line"],
    forms: ["form", "formSection", "formField"]
  };

  /* 値をまだ持っていない箱。**LLM がここへ値を入れることを禁じる**（§3.3） */
  var 空箱 = { field: 1, inputCell: 1, answerSpace: 1 };
  /* 中に文を持つ節点（プレースホルダ検査などの対象） */
  var 文を持つ = { heading: 1, paragraph: 1, listItem: 1, tableCell: 1, quote: 1,
                   code: 1, callout: 1, todo: 1, caption: 1, math: 1, section: 1,
                   labelCell: 1, valueCell: 1, textFrame: 1, formField: 1,
                   formSection: 1 };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  function newNode(type, id, o) {
    var n = { id: 文(id), type: 文(type), attrs: (o && o.attrs) || {} };
    if (o && o.text !== undefined) n.text = 文(o.text);
    if (o && o.children) n.children = o.children;
    return n;
  }

  /* WorkDoc の器。root だけは project.js が入れる。 */
  function newDoc(o) {
    o = o || {};
    return {
      docId: 文(o.docId),
      kind: 文(o.kind) || "docs",
      docType: o.docType || null,
      docTypeMatch: 文(o.docTypeMatch) || "none",
      version: Number(o.version) || 0,
      title: 文(o.title),
      meta: o.meta || {},
      design: o.design || null,        /* デザインエンジン用のフック。当面 null */
      locks: o.locks || [],
      root: o.root || newNode("document", "root", { children: [] })
    };
  }

  /* Workplace の itemType → WorkIR の kind */
  var KIND = { document: "docs", spreadsheet: "sheets",
               presentation: "slides", form: "forms" };
  var 逆KIND = { docs: "document", sheets: "spreadsheet",
                 slides: "presentation", forms: "form" };

  function kindOf(itemType) { return KIND[文(itemType)] || null; }
  function itemTypeOf(kind) { return 逆KIND[文(kind)] || null; }

  function 種類がある(kind, type) {
    var l = TYPES[kind]; return !!l && l.indexOf(type) >= 0;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.TYPES = TYPES;
  VQW.ir.空箱 = 空箱;
  VQW.ir.文を持つ = 文を持つ;
  VQW.ir.newNode = newNode;
  VQW.ir.newDoc = newDoc;
  VQW.ir.kindOf = kindOf;
  VQW.ir.itemTypeOf = itemTypeOf;
  VQW.ir.種類がある = 種類がある;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/ids.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/ids.js — 永続 ID

   ★ 一度出した ID は 二度と変えない。挿入・削除・移動・並べ替えのあとも
     残っている節点の ID は そのまま。
   ★ Workplace の保存形式は **もともと ID を持っている**（b_… / sh_… /
     sl_… / e_…）。ここでは その形に合わせて出す。新しい体系を作って
     付け替えると、既に保存されている書類が全部 別物になる。
   ★ 保存形式が ID を持たない所（表のセル・シートのマス）は、
     **場所から決まる合成 ID** を使う。番地が変われば ID も変わるが、
     番地そのものが同一性なので それで正しい。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 頭 = {
    document: "doc", section: "sec", heading: "hd", paragraph: "p",
    list: "ul", listItem: "li", table: "tb", tableRow: "tr", tableCell: "td",
    image: "img", pageBreak: "pb", math: "mth", field: "fld",
    answerSpace: "ans", divider: "hr", toc: "toc", code: "cd",
    quote: "qt", callout: "cal", todo: "tdo", caption: "cap",
    workbook: "wb", sheet: "sh", region: "rg", tableHeader: "th",
    labelCell: "lc", valueCell: "vc", formulaCell: "fc", inputCell: "ic",
    mergedBlock: "mb", chart: "ch",
    deck: "dk", page: "pg", slot: "sl", textFrame: "tf",
    imageFrame: "if", shape: "shp", line: "ln",
    form: "fm", formSection: "fs", formField: "ff"
  };

  /* 12 桁。Math.random だけだと同じミリ秒で衝突しうるので 連番も混ぜる。 */
  var 連 = 0;
  function rand12() {
    連 = (連 + 1) % 1296;
    var a = Date.now().toString(36);
    var b = Math.random().toString(36).slice(2, 8);
    var c = 連.toString(36);
    return (a + b + c).slice(-12);
  }

  function newNodeId(type) {
    return (頭[type] || "n") + "_" + rand12();
  }

  /* ★ 保存形式へ **新しく置く**ものの ID は、Workplace の作法に合わせる
     （model.js の uid: b_ / sh_ / sl_ / e_ / ch_ / s_ / f_）。
     ここだけ別の体系にすると、画面の側で「知らない ID」に見える。 */
  function wpId(prefix) { return (prefix || "wp") + "_" + rand12(); }
  var 保存の頭 = {
    docs: "b", sheet: "sh", slide: "sl", element: "e", chart: "ch",
    section: "s", field: "f"
  };

  /* 合成 ID（保存形式が ID を持たない所）。
     形を 1 か所に閉じ込める。ここ以外で文字列を組み立てないこと。 */
  function cellId(sheetId, ref) { return String(sheetId) + "!" + String(ref).toUpperCase(); }
  function rowId(blockId, r) { return String(blockId) + "#r" + r; }
  function cellInTable(blockId, r, c) { return String(blockId) + "#r" + r + "c" + c; }

  function 割る合成(id) {
    var s = String(id || "");
    var i = s.indexOf("!");
    if (i > 0) return { 種: "cell", 親: s.slice(0, i), ref: s.slice(i + 1) };
    var m = s.match(/^(.+)#r(\d+)(?:c(\d+))?$/);
    if (m) {
      return m[3] !== undefined
        ? { 種: "tcell", 親: m[1], r: +m[2], c: +m[3] }
        : { 種: "trow", 親: m[1], r: +m[2] };
    }
    return null;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.newNodeId = newNodeId;
  VQW.ir.wpId = wpId;
  VQW.ir.保存の頭 = 保存の頭;
  VQW.ir.cellId = cellId;
  VQW.ir.rowId = rowId;
  VQW.ir.cellInTable = cellInTable;
  VQW.ir.割る合成 = 割る合成;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/hash.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/hash.js — 節点のハッシュ（**浅い**）

   ★ 対象は type / attrs / text と、**子の ID の並び**だけ。
     子の中身は 含めない。
   ★ なぜ浅くするか（ここを間違えると Guard が意味を失う）:
     子の中身まで混ぜると、いちばん下の 1 文字を直しただけで
     祖先が 根まで全部「変わった」ことになる。
     すると「変えてよい所の宣言」と突き合わせても、必ず宣言外が出て
     何も通らない。逆に 何でも通す方向へ緩めると 見張りにならない。
   ★ 子の **ID の並び**を入れるのは、挿入・削除・並べ替えを
     **親の側で** 検出するため。子の中身は 子自身のハッシュが見る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  /* 並びの決まった JSON（キーの順で結果が変わらないようにする）。
     JSON.stringify そのままだと、同じ中身でもキーの順で別物になる。 */
  function 決まった順(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(決まった順(v[i]));
      return "[" + a.join(",") + "]";
    }
    var ks = Object.keys(v).sort(), o = [];
    for (var j = 0; j < ks.length; j++) {
      if (v[ks[j]] === undefined) continue;
      o.push(JSON.stringify(ks[j]) + ":" + 決まった順(v[ks[j]]));
    }
    return "{" + o.join(",") + "}";
  }

  /* FNV-1a 32bit を 2 本（種を変えて）。衝突は 2^-64 相当まで落ちる。
     暗号用ではない。**変わったかどうか**を見るためだけのもの。 */
  function fnv(s, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function hashNode(node) {
    if (!node) return "0";
    var 子 = [];
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) 子.push(node.children[i].id);
    }
    var s = node.type + ""
      + 決まった順(node.attrs || {}) + ""
      + (node.text === undefined ? " " : String(node.text)) + ""
      + 子.join(",");
    return fnv(s, 0x811c9dc5).toString(36) + "-" + fnv(s, 0x1000193).toString(36);
  }

  /* 木ぜんぶの { id → hash }。Guard はこれを 前後で比べる。 */
  function hashAll(rootNode) {
    var m = Object.create(null);
    (function 歩く(n) {
      if (!n) return;
      m[n.id] = hashNode(n);
      if (n.children) for (var i = 0; i < n.children.length; i++) 歩く(n.children[i]);
    })(rootNode);
    return m;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.hashNode = hashNode;
  VQW.ir.hashAll = hashAll;
  VQW.ir.決まった順 = 決まった順;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/walk.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/walk.js — 木をたどる道具

   ★ 報告に出す「どこ」（path）も ここで作る。
     報告文は LLM に書かせないので、**人が読める場所の名前**は
     機械が作らないといけない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function walk(n, fn, 親) {
    if (!n) return;
    fn(n, 親 || null);
    if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], fn, n);
  }

  function find(rootNode, id) {
    var 出 = null;
    walk(rootNode, function (n) { if (!出 && n.id === id) 出 = n; });
    return 出;
  }

  function parentOf(rootNode, id) {
    var 出 = null;
    walk(rootNode, function (n, p) { if (!出 && n.id === id) 出 = p; });
    return 出;
  }

  function 全部(rootNode, pred) {
    var 出 = [];
    walk(rootNode, function (n) { if (!pred || pred(n)) 出.push(n); });
    return 出;
  }

  function indexOf(rootNode, id) {
    var p = parentOf(rootNode, id);
    if (!p || !p.children) return -1;
    for (var i = 0; i < p.children.length; i++) if (p.children[i].id === id) return i;
    return -1;
  }

  /* ── 人が読める場所の名前 ─────────────────────────────────── */
  var 呼び名 = {
    document: "文書", section: "章", heading: "見出し", paragraph: "本文",
    list: "箇条書き", listItem: "箇条書きの行", table: "表",
    tableRow: "表の行", tableCell: "表のマス", image: "画像",
    pageBreak: "改ページ", math: "数式", field: "記入欄",
    answerSpace: "解答欄", divider: "区切り線", toc: "目次", code: "コード",
    quote: "引用", callout: "囲み", todo: "チェック", caption: "説明文",
    workbook: "ブック", sheet: "シート", region: "領域",
    tableHeader: "見出し行", labelCell: "見出しのマス", valueCell: "値のマス",
    formulaCell: "式のマス", inputCell: "入力するマス", mergedBlock: "結合",
    chart: "グラフ",
    deck: "スライド一式", page: "ページ", slot: "枠", textFrame: "文字の箱",
    imageFrame: "画像の箱", shape: "図形", line: "線",
    form: "フォーム", formSection: "まとまり", formField: "質問"
  };
  function 名(n) { return (n && 呼び名[n.type]) || (n && n.type) || "?"; }

  /* 'ページ3 / 見出し' のような道。番号は 1 から。 */
  function pathOf(rootNode, id) {
    var 道 = [], 見 = false;
    (function 降りる(n, 親, 番) {
      if (見) return;
      道.push(番 ? 名(n) + 番 : 名(n));
      if (n.id === id) { 見 = true; return; }
      if (n.children) {
        for (var i = 0; i < n.children.length; i++) {
          降りる(n.children[i], n, i + 1);
          if (見) return;
        }
      }
      道.pop();
    })(rootNode, null, 0);
    if (!見) return "";
    道.shift();                                   /* 根（文書・ブック）は出さない */
    return 道.join(" / ");
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.walk = walk;
  VQW.ir.find = find;
  VQW.ir.parentOf = parentOf;
  VQW.ir.全部 = 全部;
  VQW.ir.indexOf = indexOf;
  VQW.ir.pathOf = pathOf;
  VQW.ir.名 = 名;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/project.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/project.js — 保存形式 → WorkIR（写し）と 場所の割り出し

   ★ 一方通行。WorkIR から保存形式へ戻す道は **作らない**（types.js の頭）。
     直すのは ops/apply.js が 保存形式に対して行い、ここは読むだけ。
   ★ 箇条書きは 保存形式では **平ら**（list の親が無い）。
     写しのために list の親をこしらえると、その親の ID は
     項目を足すたびに変わってしまい、Guard の突き合わせが崩れる。
     **平らのまま listItem で写す。**
   ★ 表のマス・シートのマスは 保存形式に ID が無いので 合成 ID（ids.js）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* Docs の text は **HTML**（contenteditable の innerHTML をそのまま保存）。
     文字数・プレースホルダ・数式の検査は 生の文字に対して行う。 */
  function 素(s) {
    return 文(s)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /* ── Docs のブロック種 → 写しの種 ─────────────────────────── */
  var 種 = {
    paragraph: "paragraph", heading1: "heading", heading2: "heading",
    heading3: "heading", heading4: "heading",
    bullet: "listItem", number: "listItem", todo: "todo",
    quote: "quote", code: "code", callout: "callout",
    divider: "divider", pagebreak: "pageBreak", image: "image",
    table: "table", toc: "toc", math: "math",
    field: "field", answerSpace: "answerSpace", section: "section"
  };
  var 逆種 = { heading: "heading1", listItem: "bullet", pageBreak: "pagebreak" };

  function docsNode(b, i) {
    var t = 種[文(b.type)] || "paragraph";
    var a = {};
    if (/^heading([1-4])$/.test(文(b.type))) a.level = +文(b.type).slice(-1);
    if (b.type === "bullet") a.marker = "bullet";
    if (b.type === "number") a.marker = "number";
    if (b.type === "todo") a.checked = !!b.checked;
    if (b.type === "image") { a.src = 文(b.src); a.width = Number(b.width) || 100;
                              a.alt = 文(b.alt); a.caption = 文(b.caption); }
    if (b.type === "math") a.latex = 素(b.text);
    if (b.type === "field") { a.key = 文(b.key); a.label = 文(b.label);
                              a.dataType = 文(b.dataType) || "text"; a.hint = 文(b.hint); }
    if (b.type === "answerSpace") { a.lines = Number(b.lines) || 3; a.label = 文(b.label); }
    if (b.type === "table") { a.header = b.header !== false; a.colW = b.colW || null; }
    var n = I.newNode(t, 文(b.id), { attrs: a, text: 文(b.text) });
    if (b.type === "table") {
      n.children = [];
      配(b.rows).forEach(function (r, ri) {
        var row = I.newNode("tableRow", I.rowId(b.id, ri), { attrs: {}, children: [] });
        配(r).forEach(function (c, ci) {
          row.children.push(I.newNode("tableCell", I.cellInTable(b.id, ri, ci),
            { attrs: { r: ri, c: ci, header: (b.header !== false) && ri === 0 }, text: 文(c) }));
        });
        n.children.push(row);
      });
    }
    return n;
  }

  /* ── Sheets ───────────────────────────────────────────────── */
  function cellNode(sh, ref) {
    var cl = (sh.cells || {})[ref] || {};
    var t = cl.f ? "formulaCell"
          : (cl.h && 文(cl.v) === "") ? "inputCell"
          : "valueCell";
    var a = { ref: ref };
    if (cl.f) a.formula = 文(cl.f);
    if (cl.h) a.hint = 文(cl.h);
    if (cl.s) a.style = cl.s;
    if (cl.t) a.dataType = 文(cl.t);          /* money / date / percent など */
    return I.newNode(t, I.cellId(sh.id, ref), { attrs: a, text: 文(cl.v) });
  }

  /* ── Slides ───────────────────────────────────────────────── */
  var 箱 = { text: "textFrame", number: "textFrame", image: "imageFrame",
             shape: "shape", line: "line", arrow: "line",
             table: "table", chart: "chart" };
  function elNode(e) {
    var t = 箱[文(e.type)] || "shape";
    var a = {};
    Object.keys(e).forEach(function (k) {
      if (k === "id" || k === "text") return;
      a[k] = e[k];
    });
    return I.newNode(t, 文(e.id), { attrs: a, text: 文(e.text) });
  }

  /* ══ 写しを作る ═══════════════════════════════════════════════ */
  function toIR(kindOrItemType, content, meta) {
    var kind = I.kindOf(kindOrItemType) || kindOrItemType;
    var c = content || {};
    var w = c.__work || {};
    var d = I.newDoc({
      docId: 文(meta && meta.docId), kind: kind,
      docType: (meta && meta.docType) || w.docType || null,
      docTypeMatch: (meta && meta.docTypeMatch) || w.docTypeMatch || "none",
      version: Number(w.version) || 0,
      title: 文(meta && meta.title),
      meta: (meta && meta.meta) || {},
      locks: 配(w.locks).slice()
    });

    if (kind === "docs") {
      d.root = I.newNode("document", "root", { attrs: { page: c.page || null }, children: [] });
      配(c.blocks).forEach(function (b, i) { d.root.children.push(docsNode(b, i)); });
    } else if (kind === "sheets") {
      d.root = I.newNode("workbook", "root",
        { attrs: { activeSheet: Number(c.activeSheet) || 0 }, children: [] });
      配(c.sheets).forEach(function (sh) {
        var s = I.newNode("sheet", 文(sh.id),
          { attrs: { name: 文(sh.name), rows: sh.rows, cols: sh.cols,
                     merges: sh.merges || [], freeze: sh.freeze || null,
                     colW: sh.colW || {}, rowH: sh.rowH || {} }, children: [] });
        Object.keys(sh.cells || {}).sort(セル順).forEach(function (ref) {
          s.children.push(cellNode(sh, ref));
        });
        d.root.children.push(s);
      });
      配(c.charts).forEach(function (g) {
        d.root.children.push(I.newNode("chart", 文(g.id),
          { attrs: { type: 文(g.type), range: 文(g.range), sheet: g.sheet }, text: 文(g.title) }));
      });
    } else if (kind === "slides") {
      d.root = I.newNode("deck", "root",
        { attrs: { ratio: 文(c.ratio), theme: 文(c.theme),
                   designSeed: c.designSeed || null }, children: [] });
      配(c.slides).forEach(function (sl) {
        var p = I.newNode("page", 文(sl.id),
          { attrs: { layout: 文(sl.layout), background: 文(sl.background),
                     hidden: !!sl.hidden }, text: 文(sl.notes), children: [] });
        配(sl.elements).forEach(function (e) { p.children.push(elNode(e)); });
        d.root.children.push(p);
      });
    } else if (kind === "forms") {
      d.root = I.newNode("form", "root",
        { attrs: { settings: c.settings || null }, children: [] });
      配(c.sections).forEach(function (s) {
        var sec = I.newNode("formSection", 文(s.id),
          { attrs: { description: 文(s.description) }, text: 文(s.title), children: [] });
        配(s.fields).forEach(function (f) {
          var a = {};
          Object.keys(f).forEach(function (k) { if (k !== "id" && k !== "label") a[k] = f[k]; });
          sec.children.push(I.newNode("formField", 文(f.id), { attrs: a, text: 文(f.label) }));
        });
        d.root.children.push(sec);
      });
    }
    return d;
  }

  /* A1 の並び（列 → 行）。並びが毎回同じでないと ハッシュがぶれる。 */
  function 割(ref) {
    var m = String(ref).toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!m) return [0, 0];
    var c = 0;
    for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
    return [+m[2], c];
  }
  function セル順(a, b) {
    var x = 割(a), y = 割(b);
    return x[0] - y[0] || x[1] - y[1];
  }

  /* ══ 場所の割り出し（保存形式のどこか）═══════════════════════════ */
  function locate(kindOrItemType, content, id) {
    var kind = I.kindOf(kindOrItemType) || kindOrItemType;
    var c = content || {}, s = 文(id);
    if (s === "root") return { k: "root" };
    var 合 = I.割る合成(s);

    if (kind === "docs") {
      var bs = 配(c.blocks);
      if (合 && (合.種 === "trow" || 合.種 === "tcell")) {
        for (var i = 0; i < bs.length; i++) if (bs[i].id === 合.親) {
          return 合.種 === "trow"
            ? { k: "trow", i: i, r: 合.r }
            : { k: "tcell", i: i, r: 合.r, c: 合.c };
        }
        return null;
      }
      for (var j = 0; j < bs.length; j++) if (文(bs[j].id) === s) return { k: "block", i: j };
      return null;
    }
    if (kind === "sheets") {
      var shs = 配(c.sheets);
      if (合 && 合.種 === "cell") {
        for (var k = 0; k < shs.length; k++) if (文(shs[k].id) === 合.親)
          return { k: "cell", i: k, ref: 合.ref };
        return null;
      }
      for (var m2 = 0; m2 < shs.length; m2++) if (文(shs[m2].id) === s) return { k: "sheet", i: m2 };
      var gs = 配(c.charts);
      for (var n = 0; n < gs.length; n++) if (文(gs[n].id) === s) return { k: "chart", i: n };
      return null;
    }
    if (kind === "slides") {
      var sls = 配(c.slides);
      for (var p = 0; p < sls.length; p++) {
        if (文(sls[p].id) === s) return { k: "slide", i: p };
        var es = 配(sls[p].elements);
        for (var q = 0; q < es.length; q++) if (文(es[q].id) === s)
          return { k: "el", i: p, j: q };
      }
      return null;
    }
    if (kind === "forms") {
      var ss = 配(c.sections);
      for (var r = 0; r < ss.length; r++) {
        if (文(ss[r].id) === s) return { k: "section", i: r };
        var fs = 配(ss[r].fields);
        for (var t = 0; t < fs.length; t++) if (文(fs[t].id) === s)
          return { k: "field", i: r, j: t };
      }
      return null;
    }
    return null;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.toIR = toIR;
  VQW.ir.locate = locate;
  VQW.ir.素 = 素;
  VQW.ir.docsNode = docsNode;
  VQW.ir.逆種 = 逆種;
  VQW.ir.セル順 = セル順;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ir/snapshot.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ir/snapshot.js — 控えと 戻す／やり直す

   ★ これが「壊さない」の最後の保険。Guard をすり抜けた直しがあっても、
     ここが動く限り 元へ戻せる。
   ★ 直近 20 版は 全文で持つ。それより前は **差分（JSON Patch）** にして、
     いちばん古い 1 つだけ全文で持つ。長い作業でも重くならない。
   ★ 版を戻すのは content（保存形式）そのもの。WorkIR は写しなので、
     戻したあとに もう一度 写しを作れば そろう。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function 同じ(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function esc(s) { return String(s).replace(/~/g, "~0").replace(/\//g, "~1"); }
  function unesc(s) { return String(s).replace(/~1/g, "/").replace(/~0/g, "~"); }
  function 型(v) {
    return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  }

  /* ── 差分を作る（RFC6902 の add / remove / replace だけ）───────── */
  function diff(a, b, path, out) {
    path = path || ""; out = out || [];
    if (a === b) return out;
    if (型(a) !== 型(b)) { out.push({ op: "replace", path: path, value: 複(b) }); return out; }
    if (型(a) === "array") {
      var n = Math.min(a.length, b.length), i;
      for (i = 0; i < n; i++) diff(a[i], b[i], path + "/" + i, out);
      /* 減るほうを **後ろから**。前から消すと 番号がずれる。 */
      for (i = a.length - 1; i >= b.length; i--) out.push({ op: "remove", path: path + "/" + i });
      for (i = a.length; i < b.length; i++)
        out.push({ op: "add", path: path + "/" + i, value: 複(b[i]) });
      return out;
    }
    if (型(a) === "object") {
      Object.keys(a).forEach(function (k) {
        if (!(k in b)) out.push({ op: "remove", path: path + "/" + esc(k) });
      });
      Object.keys(b).forEach(function (k) {
        if (!(k in a)) out.push({ op: "add", path: path + "/" + esc(k), value: 複(b[k]) });
        else diff(a[k], b[k], path + "/" + esc(k), out);
      });
      return out;
    }
    if (a !== b) out.push({ op: "replace", path: path, value: 複(b) });
    return out;
  }

  function 親をたどる(o, path) {
    var 部 = String(path).split("/").slice(1).map(unesc);
    var 鍵 = 部.pop(), cur = o;
    for (var i = 0; i < 部.length; i++) {
      if (cur === null || cur === undefined) return null;
      cur = Array.isArray(cur) ? cur[+部[i]] : cur[部[i]];
    }
    return { 親: cur, 鍵: 鍵 };
  }

  function applyPatch(base, ops) {
    var o = 複(base);
    (ops || []).forEach(function (p) {
      if (p.path === "") { o = 複(p.value); return; }
      var t = 親をたどる(o, p.path);
      if (!t || t.親 === null || t.親 === undefined) return;
      if (Array.isArray(t.親)) {
        var i = +t.鍵;
        if (p.op === "remove") t.親.splice(i, 1);
        else if (p.op === "add") t.親.splice(i, 0, 複(p.value));
        else t.親[i] = 複(p.value);
      } else {
        if (p.op === "remove") delete t.親[t.鍵];
        else t.親[t.鍵] = 複(p.value);
      }
    });
    return o;
  }

  /* ══ 控えの帳面 ═══════════════════════════════════════════════ */
  var 全文で持つ = 20;

  function newHistory(content) {
    return {
      base: JSON.stringify(content || {}),      /* いちばん古い版（全文） */
      進み: [],                                  /* base からの 前向き差分 */
      新: [],                                    /* 直近 20 版（全文・古い順） */
      ラベル: [],
      やり直し: []                               /* redo 用（全文） */
    };
  }

  function 版数(h) { return h.進み.length + h.新.length; }

  /* いまの中身を控える。**直す前に**呼ぶ。 */
  function push(h, content, label) {
    h.新.push(JSON.stringify(content || {}));
    h.ラベル.push(String(label || ""));
    h.やり直し.length = 0;                       /* 新しく直したら redo は捨てる */
    while (h.新.length > 全文で持つ) {
      var 古 = JSON.parse(h.新.shift());
      var 前 = 版数の中身(h, h.進み.length);
      h.進み.push(diff(前, 古));
      h.ラベル.shift();
    }
    return 版数(h);
  }

  /* n 番目（0 = base）の中身を組み立てる */
  function 版数の中身(h, n) {
    var o = JSON.parse(h.base);
    for (var i = 0; i < Math.min(n, h.進み.length); i++) o = applyPatch(o, h.進み[i]);
    if (n > h.進み.length) {
      var k = n - h.進み.length - 1;
      if (k >= 0 && k < h.新.length) o = JSON.parse(h.新[k]);
    }
    return o;
  }

  /* 1 つ戻す。戻した中身を返す（呼び手が content へ入れ替える）。 */
  function undo(h, いまの中身) {
    if (!h.新.length && !h.進み.length) return null;
    var 前;
    if (h.新.length) { 前 = JSON.parse(h.新.pop()); h.ラベル.pop(); }
    else { 前 = 版数の中身(h, h.進み.length - 1); h.進み.pop(); }
    h.やり直し.push(JSON.stringify(いまの中身 || {}));
    return 前;
  }

  function redo(h, いまの中身) {
    if (!h.やり直し.length) return null;
    var 先 = JSON.parse(h.やり直し.pop());
    h.新.push(JSON.stringify(いまの中身 || {}));
    h.ラベル.push("やり直し");
    return 先;
  }

  function 一覧(h) {
    var 出 = [];
    for (var i = 0; i < h.進み.length; i++) 出.push({ 版: i + 1, なぜ: "（差分）" });
    for (var j = 0; j < h.新.length; j++)
      出.push({ 版: h.進み.length + j + 1, なぜ: h.ラベル[j] || "" });
    return 出;
  }

  VQW.snapshot = {
    newHistory: newHistory, push: push, undo: undo, redo: redo,
    一覧: 一覧, 版数: 版数, 版数の中身: 版数の中身,
    diff: diff, applyPatch: applyPatch, 同じ: 同じ
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ops/types.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ops/types.js — 操作と 編集の願い

   ★ すべての操作が **対象の節点 ID を必ず持つ**。
     「だいたいこの辺」を表せない形にしておく。
     どこを直すか決まっていないのに直し始めるのが、
     「違う所を直す」の正体だった。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var OPS = ["setText", "setAttrs", "insertNode", "deleteNode", "moveNode",
             "replaceNode", "setFormula", "setLock"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 操作 1 つが「宣言していなければならない ID」 */
  function 宣言が要るID(op, doc) {
    var I = VQW.ir, r = doc && doc.root;
    var 出 = [];
    if (!op) return 出;
    if (op.op === "setText" || op.op === "setAttrs" || op.op === "setFormula"
        || op.op === "setLock") {
      出.push(文(op.nodeId));
    } else if (op.op === "insertNode") {
      出.push(文(op.parentId));
    } else if (op.op === "deleteNode") {
      /* ★ 消すときは **本人と親の 両方**を宣言する。
         親だけだと、消し方によって 本人の中身が変わる場合
         （表のマスを 空にする など）に 宣言外になる。 */
      var p = r ? I.parentOf(r, 文(op.nodeId)) : null;
      出.push(文(op.nodeId));
      if (p) 出.push(p.id);
    } else if (op.op === "moveNode") {
      var p2 = r ? I.parentOf(r, 文(op.nodeId)) : null;
      if (p2) 出.push(p2.id);
      出.push(文(op.newParentId));
    } else if (op.op === "replaceNode") {
      出.push(文(op.nodeId));
    }
    return 出.filter(Boolean);
  }

  /* 操作列から declaredTargets を **自動で** 作る。
     人（LLM）に書かせると 必ず抜ける。抜けたぶんは 宣言外として弾かれ、
     何も進まなくなる。宣言は 機械が作り、Guard は
     「宣言の通りにしか変わっていないか」だけを見る。 */
  function targetsOf(doc, operations) {
    var 見 = Object.create(null), 出 = [];
    (operations || []).forEach(function (op) {
      宣言が要るID(op, doc).forEach(function (id) {
        if (!見[id]) { 見[id] = 1; 出.push(id); }
      });
    });
    return 出;
  }

  function newRequest(o) {
    o = o || {};
    return {
      docId: 文(o.docId),
      /* ★ 0 と「言っていない」を 区別する。
         Number(x)||0 にすると 版 0 の書類で 競合を 見逃す（実測で 落ちた）。 */
      baseVersion: (o.baseVersion === undefined || o.baseVersion === null)
        ? null : (Number(o.baseVersion) || 0),
      intent: 文(o.intent),
      declaredTargets: Array.isArray(o.declaredTargets) ? o.declaredTargets.slice() : [],
      operations: Array.isArray(o.operations) ? o.operations.slice() : []
    };
  }

  function 知らない操作(operations) {
    var 悪 = [];
    (operations || []).forEach(function (op, i) {
      if (!op || OPS.indexOf(op.op) < 0) 悪.push({ 番: i + 1, op: op && op.op });
    });
    return 悪;
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.OPS = OPS;
  VQW.ops.newRequest = newRequest;
  VQW.ops.targetsOf = targetsOf;
  VQW.ops.宣言が要るID = 宣言が要るID;
  VQW.ops.知らない操作 = 知らない操作;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ops/apply.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ops/apply.js — 操作を **保存形式**へ当てる

   ★ 直すのは content（保存形式）そのもの。WorkIR は読むだけの写し。
   ★ ここは Guard の中から、**作業用のコピー**に対して呼ばれる。
     通ったときだけ 本物へ入れ替える。
   ★ 「見つからなかった」を黙って握りつぶさない。必ず 理由を返す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }
  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* ── 写しの節点 → 保存形式 ────────────────────────────────── */
  function docsBlockOf(n) {
    var a = n.attrs || {}, t = 文(n.type);
    var ty = t === "heading" ? "heading" + (Math.min(4, Math.max(1, +a.level || 1)))
           : t === "listItem" ? (a.marker === "number" ? "number" : "bullet")
           : t === "pageBreak" ? "pagebreak"
           : t;
    var b = { id: 文(n.id) || I.wpId("b"), type: ty, text: 文(n.text) };
    if (ty === "todo") b.checked = !!a.checked;
    if (ty === "image") { b.src = 文(a.src); b.width = Number(a.width) || 100;
                          b.alt = 文(a.alt); b.caption = 文(a.caption); }
    if (ty === "math") b.text = 文(a.latex || n.text);
    if (ty === "field") { b.key = 文(a.key); b.label = 文(a.label);
                          b.dataType = 文(a.dataType) || "text"; b.hint = 文(a.hint); }
    if (ty === "answerSpace") { b.lines = Number(a.lines) || 3; b.label = 文(a.label); }
    if (ty === "table") {
      b.header = a.header !== false;
      b.rows = 配(n.children).length
        ? 配(n.children).map(function (r) { return 配(r.children).map(function (c) { return 文(c.text); }); })
        : (配(a.rows).length ? 複(a.rows) : [["", ""], ["", ""]]);
      if (a.colW) b.colW = 複(a.colW);
    }
    return b;
  }

  function slideElOf(n) {
    var a = n.attrs || {};
    var ty = a.type ? 文(a.type)
      : ({ textFrame: "text", imageFrame: "image", shape: "shape",
           line: "line", table: "table", chart: "chart" }[文(n.type)] || "text");
    var e = { id: 文(n.id) || I.wpId("e"), type: ty };
    Object.keys(a).forEach(function (k) { if (k !== "type") e[k] = 複(a[k]); });
    if (n.text !== undefined) e.text = 文(n.text);
    if (e.x === undefined) e.x = 70;
    if (e.y === undefined) e.y = 300;
    if (e.w === undefined) e.w = 820;
    if (e.h === undefined) e.h = 80;
    return e;
  }

  function slideOf(n) {
    var a = n.attrs || {};
    return { id: 文(n.id) || I.wpId("sl"), layout: 文(a.layout) || "title_body",
             elements: 配(n.children).map(slideElOf), notes: 文(n.text),
             hidden: !!a.hidden, background: 文(a.background), transition: 文(a.transition) };
  }

  function sheetOf(n) {
    var a = n.attrs || {}, sh = {
      id: 文(n.id) || I.wpId("sh"), name: 文(a.name) || "シート",
      rows: Number(a.rows) || 60, cols: Number(a.cols) || 20,
      cells: {}, colW: 複(a.colW) || {}, rowH: 複(a.rowH) || {},
      merges: 複(a.merges) || [], freeze: 複(a.freeze) || { rows: 0, cols: 0 },
      hidden: false, color: "", filters: null, conditionals: []
    };
    配(n.children).forEach(function (c) {
      var ref = 文((c.attrs || {}).ref).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref)) return;
      sh.cells[ref] = cellOf(c);
    });
    return sh;
  }

  function cellOf(n) {
    var a = n.attrs || {}, cl = {};
    if (a.formula) cl.f = 文(a.formula);
    else cl.v = 文(n.text);
    if (a.hint) cl.h = 文(a.hint);
    if (a.style) cl.s = 複(a.style);
    if (a.dataType) cl.t = 文(a.dataType);
    return cl;
  }

  function fieldOf(n) {
    var a = n.attrs || {}, f = { id: 文(n.id) || I.wpId("f"),
      type: 文(a.type) || "short_text", label: 文(n.text) };
    Object.keys(a).forEach(function (k) { if (k !== "type") f[k] = 複(a[k]); });
    f.type = 文(a.type) || "short_text";
    return f;
  }

  function sectionOf(n) {
    var a = n.attrs || {};
    return { id: 文(n.id) || I.wpId("s"), title: 文(n.text),
             description: 文(a.description), fields: 配(n.children).map(fieldOf) };
  }

  /* ══ 1 つの操作を当てる。返りは { ok } か { だめ } ═══════════════ */
  function 当てる(kind, content, op) {
    var c = content, L = I.locate(kind, c, op.nodeId || op.parentId);

    /* ── setLock は 中身を触らない（__work に持つ）── */
    if (op.op === "setLock") {
      c.__work = c.__work || {};
      var ls = 配(c.__work.locks).slice();
      var id = 文(op.nodeId), at = ls.indexOf(id);
      if (op.locked && at < 0) ls.push(id);
      if (!op.locked && at >= 0) ls.splice(at, 1);
      c.__work.locks = ls;
      return { ok: true };
    }

    if (kind === "docs") return docs当てる(c, op);
    if (kind === "sheets") return sheets当てる(c, op);
    if (kind === "slides") return slides当てる(c, op);
    if (kind === "forms") return forms当てる(c, op);
    return { だめ: "知らない種類です（" + kind + "）" };
  }

  /* ── Docs ─────────────────────────────────────────────────── */
  function docs当てる(c, op) {
    c.blocks = 配(c.blocks);
    var 位 = op.nodeId ? I.locate("docs", c, op.nodeId) : null;
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var b = docsBlockOf(op.node || {});
        var i = op.index === undefined ? c.blocks.length : Math.max(0, Math.min(c.blocks.length, +op.index));
        c.blocks.splice(i, 0, b);
        return { ok: true, 入れたID: b.id };
      }
      var 表 = I.locate("docs", c, pid);
      if (!表 || 表.k !== "block" || c.blocks[表.i].type !== "table")
        return { だめ: "そこへは足せません（" + pid + "）" };
      var t = c.blocks[表.i];
      t.rows = 配(t.rows);
      var 列 = (t.rows[0] || []).length || 2;
      var 行 = 配((op.node || {}).children).length
        ? 配(op.node.children).map(function (x) { return 文(x.text); })
        : new Array(列).join(",").split(",");
      while (行.length < 列) 行.push("");
      var k = op.index === undefined ? t.rows.length : Math.max(0, Math.min(t.rows.length, +op.index));
      t.rows.splice(k, 0, 行.slice(0, 列));
      return { ok: true, 入れたID: I.rowId(t.id, k) };
    }
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };

    if (位.k === "block") {
      var blk = c.blocks[位.i];
      if (op.op === "setText") { blk.text = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") { 属性を当てる(blk, op.attrs || {}); return { ok: true }; }
      if (op.op === "deleteNode") {
        if (c.blocks.length <= 1) return { だめ: "最後の 1 つは消せません。" };
        c.blocks.splice(位.i, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var m = c.blocks.splice(位.i, 1)[0];
        var j = op.index === undefined ? c.blocks.length : Math.max(0, Math.min(c.blocks.length, +op.index));
        c.blocks.splice(j, 0, m); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新 = docsBlockOf(op.node || {});
        新.id = blk.id;                    /* ★ ID は引き継ぐ（§3.4）*/
        c.blocks[位.i] = 新; return { ok: true };
      }
    }
    if (位.k === "trow") {
      var tb = c.blocks[位.i]; tb.rows = 配(tb.rows);
      if (op.op === "deleteNode") {
        if (tb.rows.length <= 1) return { だめ: "最後の行は消せません。" };
        tb.rows.splice(位.r, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var rr = tb.rows.splice(位.r, 1)[0];
        var ri = op.index === undefined ? tb.rows.length : Math.max(0, Math.min(tb.rows.length, +op.index));
        tb.rows.splice(ri, 0, rr); return { ok: true };
      }
      if (op.op === "replaceNode") {
        tb.rows[位.r] = 配((op.node || {}).children).map(function (x) { return 文(x.text); });
        return { ok: true };
      }
    }
    if (位.k === "tcell") {
      var tc = c.blocks[位.i]; tc.rows = 配(tc.rows);
      if (!tc.rows[位.r]) return { だめ: "その行がありません。" };
      if (op.op === "setText") { tc.rows[位.r][位.c] = 文(op.text); return { ok: true }; }
      if (op.op === "deleteNode") { tc.rows[位.r][位.c] = ""; return { ok: true }; }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  function 属性を当てる(blk, a) {
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (k === "level") { blk.type = "heading" + Math.min(4, Math.max(1, +v || 1)); return; }
      if (k === "marker") { blk.type = v === "number" ? "number" : "bullet"; return; }
      if (k === "latex") { blk.type = "math"; blk.text = 文(v); return; }
      if (k === "rows" || k === "colW") { blk[k] = 複(v); return; }
      blk[k] = (v && typeof v === "object") ? 複(v) : v;
    });
  }

  /* ── Sheets ───────────────────────────────────────────────── */
  function sheets当てる(c, op) {
    c.sheets = 配(c.sheets); c.charts = 配(c.charts);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var n = op.node || {};
        if (n.type === "chart") {
          var g = { id: 文(n.id) || I.wpId("ch"), type: 文((n.attrs || {}).type) || "bar",
                    range: 文((n.attrs || {}).range), title: 文(n.text),
                    sheet: Number((n.attrs || {}).sheet) || 0 };
          c.charts.push(g); return { ok: true, 入れたID: g.id };
        }
        var sh = sheetOf(n);
        var i = op.index === undefined ? c.sheets.length : Math.max(0, Math.min(c.sheets.length, +op.index));
        c.sheets.splice(i, 0, sh); return { ok: true, 入れたID: sh.id };
      }
      var 位0 = I.locate("sheets", c, pid);
      if (!位0 || 位0.k !== "sheet") return { だめ: "そこへは足せません（" + pid + "）" };
      var s0 = c.sheets[位0.i];
      var ref0 = 文(((op.node || {}).attrs || {}).ref).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref0)) return { だめ: "番地がありません（attrs.ref）" };
      s0.cells = s0.cells || {};
      s0.cells[ref0] = cellOf(op.node);
      return { ok: true, 入れたID: I.cellId(s0.id, ref0) };
    }
    var 位 = I.locate("sheets", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    if (位.k === "cell") {
      var sh2 = c.sheets[位.i]; sh2.cells = sh2.cells || {};
      var cl = sh2.cells[位.ref] || (sh2.cells[位.ref] = {});
      if (op.op === "setText") { delete cl.f; cl.v = 文(op.text); return { ok: true }; }
      if (op.op === "setFormula") {
        var f = 文(op.formula).trim();
        if (f && f.charAt(0) !== "=") f = "=" + f;
        delete cl.v; cl.f = f; return { ok: true };
      }
      if (op.op === "setAttrs") {
        var a = op.attrs || {};
        if (a.hint !== undefined) { if (a.hint) cl.h = 文(a.hint); else delete cl.h; }
        if (a.style !== undefined) { if (a.style) cl.s = 複(a.style); else delete cl.s; }
        if (a.dataType !== undefined) { if (a.dataType) cl.t = 文(a.dataType); else delete cl.t; }
        return { ok: true };
      }
      if (op.op === "deleteNode") { delete sh2.cells[位.ref]; return { ok: true }; }
      if (op.op === "replaceNode") { sh2.cells[位.ref] = cellOf(op.node || {}); return { ok: true }; }
    }
    if (位.k === "sheet") {
      var s = c.sheets[位.i];
      if (op.op === "setText") { s.name = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        var b = op.attrs || {};
        Object.keys(b).forEach(function (k) {
          if (k === "cells") return;                       /* マスは cell の操作で */
          s[k] = (b[k] && typeof b[k] === "object") ? 複(b[k]) : b[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") {
        if (c.sheets.length <= 1) return { だめ: "最後のシートは消せません。" };
        c.sheets.splice(位.i, 1);
        if (c.activeSheet >= c.sheets.length) c.activeSheet = c.sheets.length - 1;
        return { ok: true };
      }
    }
    if (位.k === "chart") {
      var g2 = c.charts[位.i];
      if (op.op === "setText") { g2.title = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) { g2[k] = op.attrs[k]; });
        return { ok: true };
      }
      if (op.op === "deleteNode") { c.charts.splice(位.i, 1); return { ok: true }; }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ── Slides ───────────────────────────────────────────────── */
  function slides当てる(c, op) {
    c.slides = 配(c.slides);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var sl = slideOf(op.node || {});
        var i = op.index === undefined ? c.slides.length : Math.max(0, Math.min(c.slides.length, +op.index));
        c.slides.splice(i, 0, sl); return { ok: true, 入れたID: sl.id };
      }
      var 位0 = I.locate("slides", c, pid);
      if (!位0 || 位0.k !== "slide") return { だめ: "そこへは足せません（" + pid + "）" };
      var p = c.slides[位0.i]; p.elements = 配(p.elements);
      var e = slideElOf(op.node || {});
      var j = op.index === undefined ? p.elements.length : Math.max(0, Math.min(p.elements.length, +op.index));
      p.elements.splice(j, 0, e); return { ok: true, 入れたID: e.id };
    }
    var 位 = I.locate("slides", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    if (位.k === "slide") {
      var s = c.slides[位.i];
      if (op.op === "setText") { s.notes = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) {
          if (k === "elements") return;
          s[k] = op.attrs[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") {
        if (c.slides.length <= 1) return { だめ: "最後の 1 枚は消せません。" };
        c.slides.splice(位.i, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var m = c.slides.splice(位.i, 1)[0];
        var k2 = op.index === undefined ? c.slides.length : Math.max(0, Math.min(c.slides.length, +op.index));
        c.slides.splice(k2, 0, m); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新 = slideOf(op.node || {}); 新.id = s.id;
        c.slides[位.i] = 新; return { ok: true };
      }
    }
    if (位.k === "el") {
      var pg = c.slides[位.i], el = pg.elements[位.j];
      if (op.op === "setText") { el.text = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) {
          el[k] = (op.attrs[k] && typeof op.attrs[k] === "object") ? 複(op.attrs[k]) : op.attrs[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") { pg.elements.splice(位.j, 1); return { ok: true }; }
      if (op.op === "moveNode") {
        var 先 = I.locate("slides", c, 文(op.newParentId));
        if (!先 || 先.k !== "slide") return { だめ: "移す先のページがありません。" };
        var mv = pg.elements.splice(位.j, 1)[0];
        var 先p = c.slides[先.i]; 先p.elements = 配(先p.elements);
        var idx = op.index === undefined ? 先p.elements.length
          : Math.max(0, Math.min(先p.elements.length, +op.index));
        先p.elements.splice(idx, 0, mv); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新e = slideElOf(op.node || {}); 新e.id = el.id;
        pg.elements[位.j] = 新e; return { ok: true };
      }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ── Forms ────────────────────────────────────────────────── */
  function forms当てる(c, op) {
    c.sections = 配(c.sections);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var sec = sectionOf(op.node || {});
        var i = op.index === undefined ? c.sections.length : Math.max(0, Math.min(c.sections.length, +op.index));
        c.sections.splice(i, 0, sec); return { ok: true, 入れたID: sec.id };
      }
      var 位0 = I.locate("forms", c, pid);
      if (!位0 || 位0.k !== "section") return { だめ: "そこへは足せません（" + pid + "）" };
      var s0 = c.sections[位0.i]; s0.fields = 配(s0.fields);
      var f = fieldOf(op.node || {});
      var j = op.index === undefined ? s0.fields.length : Math.max(0, Math.min(s0.fields.length, +op.index));
      s0.fields.splice(j, 0, f); return { ok: true, 入れたID: f.id };
    }
    var 位 = I.locate("forms", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    var 対 = 位.k === "section" ? c.sections[位.i] : c.sections[位.i].fields[位.j];
    var 鍵 = 位.k === "section" ? "title" : "label";
    if (op.op === "setText") { 対[鍵] = 文(op.text); return { ok: true }; }
    if (op.op === "setAttrs") {
      Object.keys(op.attrs || {}).forEach(function (k) {
        if (k === "fields") return;
        対[k] = (op.attrs[k] && typeof op.attrs[k] === "object") ? 複(op.attrs[k]) : op.attrs[k];
      });
      return { ok: true };
    }
    if (op.op === "deleteNode") {
      if (位.k === "section") {
        if (c.sections.length <= 1) return { だめ: "最後のまとまりは消せません。" };
        c.sections.splice(位.i, 1);
      } else c.sections[位.i].fields.splice(位.j, 1);
      return { ok: true };
    }
    if (op.op === "moveNode" && 位.k === "field") {
      var 先 = I.locate("forms", c, 文(op.newParentId));
      if (!先 || 先.k !== "section") return { だめ: "移す先のまとまりがありません。" };
      var mv = c.sections[位.i].fields.splice(位.j, 1)[0];
      var t = c.sections[先.i]; t.fields = 配(t.fields);
      var idx = op.index === undefined ? t.fields.length : Math.max(0, Math.min(t.fields.length, +op.index));
      t.fields.splice(idx, 0, mv); return { ok: true };
    }
    if (op.op === "replaceNode") {
      if (位.k === "section") { var ns = sectionOf(op.node || {}); ns.id = 対.id; c.sections[位.i] = ns; }
      else { var nf = fieldOf(op.node || {}); nf.id = 対.id; c.sections[位.i].fields[位.j] = nf; }
      return { ok: true };
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ══ 操作列を まとめて当てる（作業用のコピーに対して）═══════════ */
  function applyAll(kind, content, operations) {
    var 済 = [], 落 = [];
    (operations || []).forEach(function (op, i) {
      var r;
      try { r = 当てる(kind, content, op); }
      catch (e) { r = { だめ: "しくじりました（" + String(e && e.message || e).slice(0, 60) + "）" }; }
      if (r && r.ok) 済.push({ 番: i + 1, op: op.op, nodeId: op.nodeId || op.parentId, 入れたID: r.入れたID });
      else 落.push({ 番: i + 1, op: op.op, nodeId: op.nodeId || op.parentId,
                     なぜ: (r && r.だめ) || "不明" });
    });
    return { 済: 済, 落: 落 };
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.applyAll = applyAll;
  VQW.ops.当てる = 当てる;
  VQW.ops.docsBlockOf = docsBlockOf;
  VQW.ops.slideElOf = slideElOf;
  VQW.ops.slideOf = slideOf;
  VQW.ops.sheetOf = sheetOf;
  VQW.ops.cellOf = cellOf;
  VQW.ops.fieldOf = fieldOf;
  VQW.ops.sectionOf = sectionOf;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ops/guard.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ops/guard.js — 宣言と 実測の 突き合わせ

   ★ ここが「絶対に壊さない」の中核。
     LLM の善意に頼らない。**言ったこと**と **実際に変わったところ**を
     機械が突き合わせ、はみ出したら まるごと戻す。
   ★ 手順（§4.3）
       1 baseVersion が合っているか（合わなければ 競合として断る）
       2 ロックされた所を触っていないか
       3 直す前の { id → hash } を取る
       4 **作業用のコピー**へ操作を当てる
       5 直したあとの { id → hash } を取る
       6 変わった所を出す
       7 宣言外があれば 戻す
       8 検証にかける。error があれば 直すか 戻す
       9 通ったときだけ 本物へ入れ替え、版を 1 つ進める
   ★ 「変わった所」の数え方（ここを緩めると 見張りにならない）
       ・ハッシュが変わった ID … その ID 自身が宣言されていること
       ・消えた ID           … その **親**（または本人）が宣言されていること
       ・増えた ID           … その **親**が宣言されていること
     ハッシュは浅い（hash.js）ので、祖先まで芋づるに「変わった」ことには
     ならない。だから この 3 つで足りる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function 版(content) {
    return Number(content && content.__work && content.__work.version) || 0;
  }
  function 版を進める(content) {
    content.__work = content.__work || {};
    content.__work.version = 版(content) + 1;
    return content.__work.version;
  }
  function ロック(content) {
    var w = (content && content.__work) || {};
    return Array.isArray(w.locks) ? w.locks : [];
  }

  /* 親の ID を（写しから）引く。消えた節点の親も引けるよう、直す前の写しを使う。 */
  function 親表(doc) {
    var m = Object.create(null);
    VQW.ir.walk(doc.root, function (n, p) { m[n.id] = p ? p.id : null; });
    return m;
  }

  /* ══ 本体 ═══════════════════════════════════════════════════════
     o = { kind, content, request, docType, 検証する(bool), 直す(fn) } */
  function run(o) {
    o = o || {};
    var kind = 文(o.kind);
    var content = o.content;
    var req = VQW.ops.newRequest(o.request);
    var I = VQW.ir;

    if (!content) return 断る("中身がありません。", "invalid", req);

    /* 1 — 版 */
    if (req.baseVersion !== null && req.baseVersion !== 版(content)) {
      return 断る("この書類は **その後 変わっています**（いま 版 " + 版(content)
        + " / 受け取ったのは 版 " + req.baseVersion + "）。読み直してから やり直してください。",
        "competing_edit", req);
    }

    /* 操作の形 */
    var 変 = VQW.ops.知らない操作(req.operations);
    if (変.length) return 断る("知らない操作があります。**何もしていません。**", "invalid", req, { 知らない操作: 変 });
    if (!req.operations.length) return 断る("操作が 1 つもありません。", "invalid", req);

    var 前doc = I.toIR(kind, content, { docType: o.docType });
    var 親 = 親表(前doc);

    /* 宣言。渡されていなければ 操作から機械が作る（人に書かせると必ず抜ける） */
    var 宣言 = req.declaredTargets.length ? req.declaredTargets.slice()
             : VQW.ops.targetsOf(前doc, req.operations);
    var 宣言表 = Object.create(null);
    宣言.forEach(function (id) { 宣言表[文(id)] = 1; });

    /* 2 — ロック */
    var 錠 = ロック(content);
    var 触った錠 = 宣言.filter(function (id) { return 錠.indexOf(文(id)) >= 0; });
    /* 子孫が錠の中にいる場合も止める */
    錠.forEach(function (lid) {
      if (触った錠.indexOf(lid) >= 0) return;
      req.operations.forEach(function (op) {
        var t = 文(op.nodeId || op.parentId);
        var cur = t;
        while (cur) { if (cur === lid) { 触った錠.push(lid); return; } cur = 親[cur]; }
      });
    });
    if (触った錠.length)
      return 断る("ピン留めされている所は 直せません。**何もしていません。**", "locked", req,
        { ピン留め: 触った錠 });

    /* 3 — 直す前 */
    var 前 = I.hashAll(前doc.root);

    /* 4 — 作業用のコピーへ当てる */
    var 作 = 複(content);
    var 結 = VQW.ops.applyAll(kind, 作, req.operations);

    /* 5 — 直したあと */
    var 後doc = I.toIR(kind, 作, { docType: o.docType });
    var 後 = I.hashAll(後doc.root);

    /* 6 — 変わった所
       ★ 合成 ID（表の行・マス）は **場所そのものが 名前**なので、
         行を 1 つ足すだけで それより下の ID が ずれる。
         これを「宣言外」と数えると、表の操作が 何ひとつ 通らなくなる。
         合成 ID は **いちばん近い 本物の ID の親**まで さかのぼって見る。
       ★ 消えたものは **どれかの祖先が 宣言されていれば** よい。
         根を宣言する＝構造を変えると 言っている、ということ。
         中身の書き換え（ハッシュが変わった）は これまでどおり
         **その節点そのもの**の宣言が要る。ここを緩めると 見張りにならない。 */
    var 後親 = 親表(後doc);
    function 本物まで(id, 親表さん) {
      var cur = id, 回 = 0;
      while (cur && I.割る合成(cur) && 回++ < 8) cur = 親表さん[cur];
      return cur;
    }
    /* 足してよい: 本人か 親が宣言されている。
       親ごと足した場合（ページを 1 枚足すと その中の部品も 増える）は 連鎖で認める。 */
    function 足してよい(id, 回) {
      if (宣言表[id]) return true;
      var p = 後親[id];
      if (!p || (回 || 0) > 32) return false;
      if (宣言表[p]) return true;
      if (前[p] === undefined) return 足してよい(p, (回 || 0) + 1);   /* 親ごと足した */
      return false;
    }
    /* 消してよい: 本人か 親が宣言されている。親ごと消えた場合は 連鎖で認める。
       **祖先なら何でもよい、にはしない**（根を宣言しただけで 何でも消せてしまう）。 */
    function 消してよい(id, 回) {
      if (宣言表[id]) return true;
      var p = 親[id];
      if (!p || (回 || 0) > 32) return false;
      if (宣言表[p]) return true;
      if (後[p] === undefined) return 消してよい(p, (回 || 0) + 1);   /* 親ごと消えた */
      return false;
    }
    var はみ出し = [];
    Object.keys(後).forEach(function (id) {
      if (前[id] === undefined) {                       /* 増えた */
        if (足してよい(id)) return;
        はみ出し.push({ id: id, なぜ: "宣言していない所へ 足された", 親: 後親[id] });
      } else if (前[id] !== 後[id]) {                    /* 変わった */
        if (宣言表[id]) return;
        var 実 = I.割る合成(id) ? 本物まで(id, 後親) : null;
        if (実 && 宣言表[実]) return;
        はみ出し.push({ id: id, なぜ: "宣言していない所が 変わった" });
      }
    });
    Object.keys(前).forEach(function (id) {
      if (後[id] !== undefined) return;                  /* 消えた */
      if (消してよい(id)) return;
      はみ出し.push({ id: id, なぜ: "宣言していない所が 消えた", 親: 親[id] });
    });

    /* 7 — はみ出したら 戻す（本物には 一切 触っていない） */
    if (はみ出し.length) {
      return 断る("**宣言していない所が変わった**ので、まるごと戻しました。**何もしていません。**",
        "out_of_scope", req, {
          はみ出し: はみ出し.slice(0, 12),
          はみ出した数: はみ出し.length,
          宣言していた所: 宣言.slice(0, 12)
        });
    }

    /* 8 — 検証 */
    var 検 = { errors: [], warnings: [] };
    if (o.検証する !== false && VQW.validate && VQW.validate.run) {
      検 = VQW.validate.run(kind, 作, { docType: o.docType, 直したID: 宣言 });
      if (検.errors.length && typeof o.直す === "function") {
        try { o.直す(作, 検); } catch (e) {}
        検 = VQW.validate.run(kind, 作, { docType: o.docType, 直したID: 宣言 });
      }
      if (検.errors.length && o.errorで戻す) {
        return 断る("直したあとに **崩れ**が出たので、まるごと戻しました。", "invalid", req,
          { 崩れ: 検.errors.slice(0, 8) });
      }
    }

    /* 9 — 本物へ
       ★ 入れ替えかた: **いちばん外の入れ物（content）は そのまま**にして、
         中の鍵だけ 差し替える。画面は content の参照を 握っているので、
         入れ物ごと 作り替えると 画面が 古いほうを 見続ける。
       ★ ただし **中の子（sheets[0] など）は 別の物になる**。
         呼び手が 子を 変数に取っていたら、通ったあとに **取り直すこと**。
         （実測: sheets.セル が 古い sheet を 見て「列幅は 変わっていない」と
         報告していた。） */
    var 前版 = 版(content);
    Object.keys(content).forEach(function (k) { delete content[k]; });
    Object.keys(作).forEach(function (k) { content[k] = 作[k]; });
    var 後版 = 版を進める(content);

    return {
      status: 結.落.length ? "partial" : "applied",
      version: { from: 前版, to: 後版 },
      applied: 結.済.map(function (x) {
        var id = x.入れたID || x.nodeId;
        return {
          nodeId: id,
          path: I.pathOf(後doc.root, id) || I.pathOf(前doc.root, id) || "",
          before: 見せる(前doc, x.nodeId),
          after: 見せる(後doc, id)
        };
      }),
      skipped: 結.落.map(function (x) {
        return { intent: x.op + "（" + (x.nodeId || "") + "）",
                 reason: /見つかりません/.test(x.なぜ) ? "not_found" : "invalid",
                 なぜ: x.なぜ };
      }),
      validation: 検,
      declaredTargets: 宣言
    };
  }

  function 親後(doc, id) {
    var p = VQW.ir.parentOf(doc.root, id);
    return p ? p.id : null;
  }

  function 見せる(doc, id) {
    var n = id ? VQW.ir.find(doc.root, id) : null;
    if (!n) return "";
    var t = VQW.ir.素(n.text || "");
    if (!t && n.attrs) {
      if (n.attrs.formula) t = 文(n.attrs.formula);
      else if (n.attrs.latex) t = 文(n.attrs.latex);
      else if (n.attrs.src) t = "（画像）";
    }
    return t.slice(0, 120);
  }

  function 断る(なぜ, reason, req, 足す) {
    var o = {
      status: "rejected",
      version: { from: 0, to: 0 },
      applied: [],
      skipped: [{ intent: req && req.intent || "", reason: reason, なぜ: なぜ }],
      validation: { errors: [], warnings: [] },
      理由: なぜ
    };
    if (足す) Object.keys(足す).forEach(function (k) { o[k] = 足す[k]; });
    return o;
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.guard = run;
  VQW.ops.版 = 版;
  VQW.ops.ロック = ロック;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ops/decompose.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ops/decompose.js — 大きな直しを **作り直しにしない**

   ★ 「20 枚を 40 枚に」「全部作り直して」も、作り直しではなく 操作列にする。
     作り直すと、位置も書式も 手直しも 黙って消える（実測で何度も起きた）。
   ★ 大きな直しのときに 必ずやること（§4.5）
       ① 当てる前に **何が変わるか** を出して 確かめてもらう
       ② 50 件ずつに分け、束ごとに Guard と 検証を通す
       ③ 途中で落ちたら **そこで止めて、正確に報告する**
       ④ ピン留めされた所を触る操作は **分解の段階で外す**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 束の大きさ = 50;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── ピン留めを外す ────────────────────────────────────────── */
  function 錠を避ける(kind, content, operations) {
    var 錠 = VQW.ops.ロック(content);
    if (!錠.length) return { 通す: (operations || []).slice(), 外した: [] };
    var doc = VQW.ir.toIR(kind, content);
    var 親 = Object.create(null);
    VQW.ir.walk(doc.root, function (n, p) { 親[n.id] = p ? p.id : null; });
    var 通す = [], 外した = [];
    operations.forEach(function (op) {
      var t = 文(op.nodeId || op.parentId), cur = t, 当 = false;
      while (cur) { if (錠.indexOf(cur) >= 0) { 当 = true; break; } cur = 親[cur]; }
      if (当) 外した.push({ op: op.op, nodeId: t, なぜ: "ピン留めされています" });
      else 通す.push(op);
    });
    return { 通す: 通す, 外した: 外した };
  }

  /* ── 何が変わるか（当てる前に見せる）───────────────────────── */
  function preview(kind, content, operations) {
    var I = VQW.ir;
    var 前doc = I.toIR(kind, content);
    var 作 = JSON.parse(JSON.stringify(content));
    var 結 = VQW.ops.applyAll(kind, 作, operations);
    var 後doc = I.toIR(kind, 作);
    var 前 = I.hashAll(前doc.root), 後 = I.hashAll(後doc.root);
    var 足す = [], 消す = [], 直す = [];
    Object.keys(後).forEach(function (id) {
      if (id === "root") return;         /* 根は 中身ではなく 入れ物。足す/消す で もう見えている */
      if (前[id] === undefined) 足す.push(見出し(後doc, id));
      else if (前[id] !== 後[id]) 直す.push({
        どこ: I.pathOf(後doc.root, id), 前: 文字(前doc, id), 後: 文字(後doc, id) });
    });
    Object.keys(前).forEach(function (id) {
      if (id !== "root" && 後[id] === undefined) 消す.push(見出し(前doc, id));
    });
    return {
      足す数: 足す.length, 消す数: 消す.length, 直す数: 直す.length,
      足す: 足す.slice(0, 20), 消す: 消す.slice(0, 20), 直す: 直す.slice(0, 20),
      当たらなかった: 結.落.slice(0, 10)
    };
  }

  function 見出し(doc, id) {
    return { どこ: VQW.ir.pathOf(doc.root, id), 中身: 文字(doc, id) };
  }
  function 文字(doc, id) {
    var n = VQW.ir.find(doc.root, id);
    return n ? VQW.ir.素(n.text || "").slice(0, 80) : "";
  }

  /* ── 束に分けて 順に当てる ────────────────────────────────── */
  function 段階適用(o) {
    o = o || {};
    var kind = 文(o.kind), content = o.content;
    var 避 = 錠を避ける(kind, content, o.operations || []);
    var ops = 避.通す;
    var 束 = [];
    for (var i = 0; i < ops.length; i += 束の大きさ) 束.push(ops.slice(i, i + 束の大きさ));

    var 済 = [], 落 = 避.外した.map(function (x) {
      return { intent: x.op + "（" + x.nodeId + "）", reason: "locked", なぜ: x.なぜ };
    });
    var 版 = { from: VQW.ops.版(content), to: VQW.ops.版(content) };
    var 検 = { errors: [], warnings: [] };
    var 止まった = null;

    for (var b = 0; b < 束.length; b++) {
      var r = VQW.ops.guard({
        kind: kind, content: content, docType: o.docType,
        errorで戻す: !!o.errorで戻す,
        request: { baseVersion: VQW.ops.版(content), intent: o.intent, operations: 束[b] }
      });
      if (r.status === "rejected") {
        止まった = { 束: b + 1, 全部の束: 束.length, なぜ: r.理由, reason: r.skipped[0] && r.skipped[0].reason };
        落 = 落.concat(r.skipped);
        break;
      }
      済 = 済.concat(r.applied);
      落 = 落.concat(r.skipped);
      検 = r.validation;
      版.to = r.version.to;
    }

    return {
      status: 止まった ? (済.length ? "partial" : "rejected")
            : (落.length ? "partial" : "applied"),
      version: 版, applied: 済, skipped: 落, validation: 検,
      止まった: 止まった,
      束の数: 束.length
    };
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.preview = preview;
  VQW.ops.段階適用 = 段階適用;
  VQW.ops.錠を避ける = 錠を避ける;
  VQW.ops.束の大きさ = 束の大きさ;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/selector/resolve.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/selector/resolve.js — 場所の特定

   ★ いまの「壊す」と「嘘をつく」は、ほぼ全部ここが原因だった。
     指した所が見つからないのに 編集を実行し、成功と報告していた。
   ★ 決まりごと（§5.3）
       1 件      … やる
       2 件以上  … **候補を出して聞く**。勝手に 1 つ選ばない
       0 件      … **聞く**。近そうな所を推測して直すのは 禁止
   ★ 「ここ」「これ」は 画面の選択範囲。自然言語の解釈より確実なので、
     by:'selection' が使える場面では 常にそれを優先する（§5.4）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 種の別名。人と LLM は 正式名で言わない。 */
  var 別名 = {
    "見出し": "heading", "みだし": "heading", heading: "heading",
    "本文": "paragraph", "文": "paragraph", paragraph: "paragraph",
    "箇条書き": "listItem", "項目": "listItem", listItem: "listItem",
    "表": "table", table: "table", "行": "tableRow", tableRow: "tableRow",
    "マス": "tableCell", "セル": "tableCell", tableCell: "tableCell",
    "画像": "image", image: "image", "数式": "math", math: "math",
    "記入欄": "field", field: "field", "解答欄": "answerSpace",
    "ページ": "page", page: "page", "スライド": "page",
    "文字の箱": "textFrame", textFrame: "textFrame",
    "図形": "shape", shape: "shape", "グラフ": "chart", chart: "chart",
    "シート": "sheet", sheet: "sheet",
    "質問": "formField", formField: "formField",
    "まとまり": "formSection", formSection: "formSection",
    "囲み": "callout", "引用": "quote", "区切り線": "divider"
  };
  function 種を読む(s) { return 別名[文(s)] || 文(s); }

  function 候補(doc, scope) {
    var t = 種を読む(scope);
    if (!t) return I.全部(doc.root, function (n) { return n.id !== "root"; });
    return I.全部(doc.root, function (n) { return n.type === t; });
  }

  /* ══ 本体 ═════════════════════════════════════════════════════
     sel は { by: ... }。selection は 画面が渡す ID の並び。 */
  function resolve(doc, sel, selection) {
    sel = sel || {};
    var by = 文(sel.by);

    if (by === "nodeId") {
      var n = I.find(doc.root, 文(sel.id));
      return n ? 一つ(n.id) : 無し("その ID は この書類にありません。", 近そうな(doc, 文(sel.id)));
    }

    if (by === "selection") {
      var s = (selection || []).filter(function (x) { return !!I.find(doc.root, 文(x)); });
      if (s.length === 1) return 一つ(s[0]);
      if (s.length > 1) return 複数(s, doc);
      return 無し("いま画面で 何も選ばれていません。", []);
    }

    if (by === "ordinal") {
      var 並 = 候補(doc, sel.scope);
      var i = Math.max(1, Number(sel.index) || 1) - 1;
      if (!並.length) return 無し("「" + 文(sel.scope) + "」が この書類にありません。", []);
      if (i >= 並.length)
        return 無し("「" + 文(sel.scope) + "」は " + 並.length + " 個しかありません（"
          + (i + 1) + " 番目は ありません）。",
          並.map(function (x, k) { return 印(doc, x, k + 1); }));
      var 当 = 並[i];
      if (sel.sub) {
        var 中 = I.全部(当, function (x) { return x.type === 種を読む(sel.sub); });
        if (中.length === 1) return 一つ(中[0].id);
        if (!中.length) return 無し("その中に「" + 文(sel.sub) + "」はありません。", []);
        return 複数(中.map(function (x) { return x.id; }), doc);
      }
      return 一つ(当.id);
    }

    if (by === "text") {
      var 語 = I.素(文(sel.contains)).trim();
      if (!語) return 無し("さがす言葉がありません。", []);
      var 全 = 候補(doc, sel.scope);
      var 当2 = 全.filter(function (n) { return I.素(n.text || "").indexOf(語) >= 0; });
      if (当2.length === 1) return 一つ(当2[0].id);
      if (!当2.length) {
        /* 部分一致でも 0 件。近そうなものを 出して聞く。 */
        return 無し("「" + 語 + "」を含む所が 見つかりません。", 近そうな(doc, 語));
      }
      return 複数(当2.map(function (n) { return n.id; }), doc);
    }

    if (by === "field") {
      var 鍵 = 文(sel.docTypeField);
      var 当3 = I.全部(doc.root, function (n) {
        return (n.attrs && (n.attrs.key === 鍵)) ||
               (n.type === "field" && I.素(n.attrs && n.attrs.label) === 鍵);
      });
      if (当3.length === 1) return 一つ(当3[0].id);
      if (!当3.length) return 無し("「" + 鍵 + "」という欄が ありません。", []);
      return 複数(当3.map(function (n) { return n.id; }), doc);
    }

    if (by === "last") {
      var 並2 = 候補(doc, sel.scope);
      if (!並2.length) return 無し("「" + 文(sel.scope) + "」が この書類にありません。", []);
      return 一つ(並2[並2.length - 1].id);
    }

    if (by === "range") {
      var a = I.find(doc.root, 文(sel.fromId)), b = I.find(doc.root, 文(sel.toId));
      if (!a || !b) return 無し("範囲の 端が 見つかりません。", []);
      var 平 = I.全部(doc.root, function (n) { return n.id !== "root"; });
      var ia = -1, ib = -1;
      平.forEach(function (n, k) { if (n.id === a.id) ia = k; if (n.id === b.id) ib = k; });
      if (ia < 0 || ib < 0) return 無し("範囲を 決められません。", []);
      var 出 = 平.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).map(function (n) { return n.id; });
      return 出.length === 1 ? 一つ(出[0]) : 複数(出, doc);
    }

    return 無し("指しかたが 分かりません（by: " + by + "）。", []);
  }

  function 一つ(id) { return { kind: "unique", nodeId: id }; }
  function 複数(ids, doc) {
    return { kind: "multiple", nodeIds: ids,
             候補: ids.slice(0, 12).map(function (id, k) { return 印(doc, I.find(doc.root, id), k + 1); }) };
  }
  function 無し(なぜ, 候) { return { kind: "none", なぜ: なぜ, 候補: (候 || []).slice(0, 12) }; }

  function 印(doc, n, 番) {
    if (!n) return { 番: 番 };
    return { 番: 番, id: n.id, どこ: I.pathOf(doc.root, n.id),
             中身: I.素(n.text || "").slice(0, 40) };
  }

  /* 近そうなもの（言葉の重なりで並べる）。**勝手に選ぶためではなく、聞くため。** */
  function 近そうな(doc, 語) {
    var s = I.素(語);
    var 得 = [];
    I.walk(doc.root, function (n) {
      if (n.id === "root") return;
      var t = I.素(n.text || "");
      if (!t) return;
      var 点 = 0;
      for (var i = 0; i < s.length - 1; i++) if (t.indexOf(s.substr(i, 2)) >= 0) 点++;
      if (点) 得.push({ n: n, 点: 点 });
    });
    得.sort(function (a, b) { return b.点 - a.点; });
    return 得.slice(0, 6).map(function (x, k) { return 印(doc, x.n, k + 1); });
  }

  VQW.selector = {
    resolve: resolve, 種を読む: 種を読む, 別名: 別名, 近そうな: 近そうな
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/selector/ask.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/selector/ask.js — 曖昧なときの 聞きかた

   ★ 文は **機械が作る**。LLM に「どこですか？」を書かせると、
     そのついでに「たぶんここですね」と決めつけて 実行してしまう。
   ★ 「全部に当てる」も 選択肢として出す（そのほうが早いことが多い）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  function 並べる(候補) {
    return (候補 || []).map(function (c) {
      return "  " + c.番 + ") " + (c.どこ || "") + (c.中身 ? "  「" + c.中身 + "」" : "");
    }).join("\n");
  }

  /* resolve() の返りから、そのまま道具の返り値にできる形を作る */
  function 聞く(res, o) {
    o = o || {};
    var 何 = 文(o.何をしたい) || "直す";
    if (!res) return null;
    if (res.kind === "unique") return null;

    /* ★ **完成と言ってよい を 必ず false で 付ける**。
       付け忘れると、聞いている最中に「できました」と 言える道が 残る
       （実測: cmd の口から 返したときに 抜けていた）。 */
    if (res.kind === "multiple") {
      return {
        完成と言ってよい: false,
        だめ: "どこを " + 何 + "か、**1 つに決まりません**（" + res.nodeIds.length + " か所あります）。"
          + "**何もしていません。**",
        候補: res.候補,
        きくこと: "次のどれですか。番号で答えてもらってください。\n" + 並べる(res.候補)
          + "\n  0) 全部に当てる",
        つぎ: "**推測して 1 つ選ばないでください。** 番号を聞いてから もう一度呼びます。"
      };
    }
    return {
      完成と言ってよい: false,
      だめ: (res.なぜ || "指された所が 見つかりません。") + "**何もしていません。**",
      候補: res.候補,
      きくこと: res.候補 && res.候補.length
        ? "近いのは この辺です。どれですか。\n" + 並べる(res.候補)
        : "どこを " + 何 + "か、教えてもらってください。",
      つぎ: "**近そうな所を勝手に直さないでください。** 場所を聞いてから もう一度呼びます。"
    };
  }

  VQW.selector = VQW.selector || {};
  VQW.selector.聞く = 聞く;
  VQW.selector.並べる = 並べる;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/common.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/common.js — 検証の 土台と 振り分け

   ★ **LLM は 1 回も呼ばない。全部 純粋関数。**
     見た目が崩れているかを AI に聞くと、聞くたびに答えが変わり、
     しかも「大丈夫です」と言う。数えれば 毎回 同じ答えになる。
   ★ 深刻さは 2 段（§7.6）
       error   … 1 つでもあれば **完成と表示しない**
       warning … 完成扱い。ただし 画面に出す
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  function issue(code, severity, o) {
    o = o || {};
    var i = {
      code: 文(code),
      severity: severity === "warning" ? "warning" : "error",
      nodeId: 文(o.nodeId),
      どこ: 文(o.どこ),
      なに: 文(o.なに),
      どうする: 文(o.どうする)
    };
    /* ★ 決まった欄のほかも **そのまま持ち越す**。
       ここで捨てると、検査が付けた「直しかた」が 修復まで 届かない
       （実測: 列幅の直しが 1 度も 効いていなかった）。 */
    Object.keys(o).forEach(function (k) {
      if (i[k] === undefined) i[k] = o[k];
    });
    return i;
  }
  function err(code, o) { return issue(code, "error", o); }
  function warn(code, o) { return issue(code, "warning", o); }

  function 空(){ return { errors: [], warnings: [] }; }
  function 足す(結, is) {
    (is || []).forEach(function (i) {
      if (!i) return;
      (i.severity === "warning" ? 結.warnings : 結.errors).push(i);
    });
    return 結;
  }
  function 混ぜる(a, b) {
    a.errors = a.errors.concat(b.errors || []);
    a.warnings = a.warnings.concat(b.warnings || []);
    return a;
  }

  /* ── 振り分け ─────────────────────────────────────────────── */
  function run(kind, content, o) {
    o = o || {};
    var V = VQW.validate, 結 = 空();
    var doc = VQW.ir.toIR(kind, content, { docType: o.docType && o.docType.id });

    /* 種類によらない検査 */
    if (V.placeholder) 足す(結, V.placeholder.check(doc, o));
    if (V.math) 足す(結, V.math.check(doc, o));

    if (kind === "docs" && V.docs) 混ぜる(結, V.docs.check(doc, content, o));
    if (kind === "sheets" && V.sheets) 混ぜる(結, V.sheets.check(doc, content, o));
    if (kind === "slides" && V.slides) 混ぜる(結, V.slides.check(doc, content, o));

    if (o.docType && V.doctype) 混ぜる(結, V.doctype.check(doc, content, o.docType, o));
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.issue = issue;
  VQW.validate.err = err;
  VQW.validate.warn = warn;
  VQW.validate.空 = 空;
  VQW.validate.足す = 足す;
  VQW.validate.混ぜる = 混ぜる;
  VQW.validate.run = run;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/placeholder.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/placeholder.js — 埋めていない所を そのまま出さない

   ★ 実例:「A. ○○...  B. ○○...」「株式会社○○」「（ここに記入）」
   ★ 誤って弾かないための決まり（§7.1）
     ・**人が自分で入れた値**は 見ない（attrs.userEntered / 取り込み由来）
     ・**値をまだ持っていない箱**（field / inputCell / answerSpace）は 見ない。
       空なのは 正しい。捏造されているほうが 間違い。
     ・「○○商店」と 本当に書きたい場合があるので、
       **人が入れた値だけは 例外なく通す**。AI が書いた所だけ見る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  /* 印。増やせる並びとして持つ（コードの奥に埋め込まない）。 */
  var 印 = [
    { re: /[○〇]{2,}/, 名: "○○" },
    { re: /[△▲]{2,}/, 名: "△△" },
    { re: /[□■]{2,}/, 名: "□□" },
    { re: /[×✕]{3,}/, 名: "×××" },
    { re: /[・･]{3,}/, 名: "・・・" },
    { re: /\bX{3,}\b/i, 名: "XXX" },
    { re: /\bY{3,}\b/i, 名: "YYY" },
    { re: /\bZ{3,}\b/i, 名: "ZZZ" },
    { re: /lorem\s+ipsum/i, 名: "Lorem ipsum" },
    { re: /（\s*ここに[^）]*）|\(\s*ここに[^)]*\)/, 名: "（ここに…）" },
    { re: /（[^）]*記入[^）]*）|\([^)]*記入[^)]*\)/, 名: "（…記入…）" },
    { re: /（[^）]*入力[^）]*）|\([^)]*入力[^)]*\)/, 名: "（…入力…）" },
    { re: /【[^】]*】のところ/, 名: "【…】のところ" },
    { re: /\bTBD\b/i, 名: "TBD" },
    { re: /(^|[\s、。：:])未定([\s、。]|$)/, 名: "未定" },
    { re: /未記入/, 名: "未記入" },
    { re: /(^|[\s、。：:])サンプル([\s、。]|$)/, 名: "サンプル" },
    { re: /(^|[\s、。：:])ダミー/, 名: "ダミー" },
    { re: /例）\s*$/, 名: "例）だけ" },
    { re: /〜など\.{3}|…など…/, 名: "〜など…" },
    { re: /\bplaceholder\b/i, 名: "placeholder" }
  ];

  /* 見なくてよい節点 */
  function 見ない(n) {
    if (!n) return true;
    if (VQW.ir.空箱[n.type]) return true;                 /* 空でよい箱 */
    var a = n.attrs || {};
    if (a.userEntered === true) return true;              /* 人が入れた */
    if (a.fromUpload === true) return true;               /* 取り込み由来 */
    if (a.placeholderOk === true) return true;
    return false;
  }

  function check(doc, o) {
    o = o || {};
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.id === "root" || 見ない(n)) return;
      var t = VQW.ir.素(n.text || "");
      if (!t.trim()) return;
      for (var i = 0; i < 印.length; i++) {
        if (!印[i].re.test(t)) continue;
        出.push(V.err("placeholder", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "埋めていない印「" + 印[i].名 + "」が 残っています: 「" + t.slice(0, 40) + "」",
          どうする: "本当の値を入れるか、**値がまだ無いなら 記入欄（空欄＋入力ヒント）にしてください。**"
        }));
        break;
      }
    });
    return 出;
  }

  /* 1 つの文字列だけ調べる（生成の途中で使う） */
  function ある(s) {
    var t = VQW.ir.素(s);
    for (var i = 0; i < 印.length; i++) if (印[i].re.test(t)) return 印[i].名;
    return null;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.placeholder = { check: check, ある: ある, 印: 印 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/math.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/math.js — 生の LaTeX を そのまま出さない

   ★ 実例: 文の中に「$x^2 + 5x + 6$」が **文字として** 出ていた。
     原因は 2 つあって、両方ここで検出する。
       ① AI が paragraph に $…$ と書いた（math の箱を知らなかった）
       ② math の箱に入れても 画面が KaTeX を通していなかった
     ②は 画面側で直した。ここは ①を止める。
   ★ 「$100」のような お金の $ は 式ではない。
     $ の内側に 改行や 別の $ が無く、閉じがあるときだけ 式として扱う。
     ここは クイズ側（VQ2.qrender）の見かたと そろえる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 式 = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/;
  var 命令 = /\\(frac|sqrt|sum|int|left|right|begin|end|times|div|pm|leq|geq|neq|alpha|beta|pi|theta|cdot|angle|triangle)\b/;

  function ある(s) {
    var t = String(s == null ? "" : s);
    return 式.test(t) || /\\\(|\\\[/.test(t) || 命令.test(t);
  }

  /* ざっくりした釣り合いの検査。KaTeX が無い所（テスト）でも動く。 */
  function 組めるか(latex) {
    var s = String(latex || "");
    if (!s.trim()) return "式が 空です";
    var 開 = (s.match(/\{/g) || []).length, 閉 = (s.match(/\}/g) || []).length;
    if (開 !== 閉) return "{ } の数が 合いません（" + 開 + " / " + 閉 + "）";
    var l = (s.match(/\\left/g) || []).length, r = (s.match(/\\right/g) || []).length;
    if (l !== r) return "\\left と \\right の数が 合いません";
    var b = (s.match(/\\begin\{/g) || []).length, e = (s.match(/\\end\{/g) || []).length;
    if (b !== e) return "\\begin と \\end の数が 合いません";
    if (/\$/.test(s)) return "式の中に $ が 入っています（囲みは 外に付けます）";
    /* KaTeX があるなら 本物に通す */
    var K = root.katex;
    if (K && typeof K.renderToString === "function") {
      try { K.renderToString(s, { throwOnError: true, strict: "ignore", output: "html" }); }
      catch (x) { return String(x && x.message || x).slice(0, 80); }
    }
    return null;
  }

  function check(doc, o) {
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.id === "root") return;
      if (n.type === "math") {
        var なぜ = 組めるか((n.attrs && n.attrs.latex) || n.text);
        if (なぜ) 出.push(V.err("mathBroken", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "数式が 組めません: " + なぜ,
          どうする: "式を 直してください。"
        }));
        return;
      }
      var t = VQW.ir.素(n.text || "");
      if (!t) return;
      if (!ある(t)) return;

      /* ★ 指示書 §3.3 からの ずれ（意図して そうしている）
         「テキストに $…$ を含めるのを 禁止」だと、
         **文の途中の式**（「面積は $S=\pi r^2$ で求まる」）まで 弾いてしまい、
         段落を まるごと数式にするしかなくなる。それは かえって読みにくい。
         そこで 2 つに分ける:
           ・文が **まるごと式**（または $$…$$）… math の箱にすべき → error
           ・文の途中の $…$                      … 認める。ただし
             **組めない式は error**（組めないまま出すのが 本当の事故）
         画面側は 文の中の $…$ も KaTeX で組むようにした。 */
      var まるごと = /^\s*\$\$[\s\S]+\$\$\s*$/.test(t) || /^\s*\$[^$\n]+\$\s*$/.test(t);
      if (まるごと && n.type !== "math") {
        出.push(V.err("mathShouldBeBlock", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "この かたまりは まるごと 数式です: 「" + t.slice(0, 40) + "」",
          どうする: "**数式の箱（math）に してください。**"
        }));
        return;
      }
      /* 文の途中の式は 1 つずつ 組めるか見る */
      var re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, m;
      while ((m = re.exec(t)) !== null) {
        var なぜ2 = 組めるか(m[1] !== undefined ? m[1] : m[2]);
        if (なぜ2) {
          出.push(V.err("mathBroken", {
            nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
            なに: "文の中の 数式が 組めません（" + m[0].slice(0, 24) + "）: " + なぜ2,
            どうする: "式を 直してください。そのままだと 文字のまま出ます。"
          }));
          break;
        }
      }
      /* KaTeX の別の書きかた（\( \) や \[ \]）は 組めない。印だけ出す。 */
      if (/\\\(|\\\[/.test(t)) {
        出.push(V.err("mathOtherSyntax", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "\\( \\) / \\[ \\] の書きかたは 読めません: 「" + t.slice(0, 40) + "」",
          どうする: "**$…$（文の中）と $$…$$（行を変えて）だけ** 使ってください。"
        }));
      }
    });
    return 出;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.math = { check: check, ある: ある, 組めるか: 組めるか };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/numbers.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/numbers.js — 数と日付の 規律

   ★ 実例:「1,000円」という **文字** がマスに入っていて、合計が 0 になる。
     画面には それらしく見えるので、作った側は気づかない。
   ★ 単位は **見出しへ**。マスには 数だけ入れる。
     これを守らないと 合計も 並べ替えも グラフも 効かない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 単位つき = /^-?[\d,]+(?:\.\d+)?\s*(円|¥|＄|\$|%|％|人|名|個|点|冊|枚|件|回|台|本|kg|g|t|m|km|cm|mm|時間|分|秒|日|ヶ月|か月)$/;
  var 区切りつき = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
  var 素の数 = /^-?\d+(?:\.\d+)?$/;
  var 日付 = /^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})日?$/;

  function 数か(s) { return 素の数.test(String(s).trim()); }

  function 日付か(s) {
    var m = String(s).trim().match(日付);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200;
  }

  /* マス 1 つを見る。列がそもそも文字の列なら 何も言わない。 */
  function マスを見る(doc, n, 数の列か) {
    var t = String(n.text || "").trim();
    if (!t) return null;
    var a = n.attrs || {};
    var 型 = String(a.dataType || "");

    if (単位つき.test(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "「" + t + "」は 数ではなく **文字** です（単位が付いています）。",
        どうする: "**単位は 見出しへ**（例:「金額（円）」）。マスには 数だけ入れてください。"
      });
    }
    if (区切りつき.test(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "「" + t + "」は 桁区切りが 文字として入っています。合計に 数えられません。",
        どうする: "1000 のように 数だけ入れ、**見た目の桁区切りは 書式**でつけてください。"
      });
    }
    if ((型 === "number" || 型 === "money" || 型 === "percent") && !数か(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "数の欄に 数でないものが 入っています: 「" + t + "」",
        どうする: "数だけ入れてください。"
      });
    }
    if (型 === "date" && !日付か(t)) {
      return V.err("dateAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "日付の欄が 日付として読めません: 「" + t + "」",
        どうする: "2026-08-17 か 2026年8月17日 の形にしてください。"
      });
    }
    if (数の列か && !数か(t) && !/^[=＝]/.test(t)) {
      return V.warn("mixedColumn", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "数の列に 文字が 混ざっています: 「" + t.slice(0, 20) + "」",
        どうする: "並べ替えと合計が 効かなくなります。"
      });
    }
    return null;
  }

  /* 列ごとに「数の列か」を見る（8 割以上が数なら 数の列） */
  function 数の列(sheetNode) {
    var 列 = {};
    (sheetNode.children || []).forEach(function (c) {
      var ref = String((c.attrs || {}).ref || "");
      var m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) return;
      var r = +m[2];
      if (r <= 1) return;                                /* 1 行目は見出し */
      var k = m[1];
      列[k] = 列[k] || { 数: 0, 全: 0 };
      列[k].全++;
      if (c.type === "formulaCell" || 数か(c.text)) 列[k].数++;
    });
    var 出 = {};
    Object.keys(列).forEach(function (k) {
      出[k] = 列[k].全 >= 3 && 列[k].数 / 列[k].全 >= 0.8;
    });
    return 出;
  }

  function check(doc) {
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.type !== "sheet") return;
      var 数列 = 数の列(n);
      (n.children || []).forEach(function (c) {
        if (c.type === "formulaCell" || c.type === "inputCell") return;
        var ref = String((c.attrs || {}).ref || "");
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        var 数の列か = !!(m && +m[2] > 1 && 数列[m[1]]);
        var i = マスを見る(doc, c, 数の列か);
        if (i) 出.push(i);
      });
    });
    return 出;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.numbers = { check: check, 数か: 数か, 日付か: 日付か, 数の列: 数の列 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/formula.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/formula.js — 式の 規律

   ★ 合計・税額・小計は **必ず式**。値で書くと、元の数を直しても
     合計が古いまま残り、しかも誰も気づかない。
   ★ 検査
       ・式のしくじり（#REF! #VALUE! …）        error
       ・見ている先が 無い                       error
       ・SUM の範囲から **データの行が はみ出している**  error
       ・式は入っているのに 元の数が 空          error
       ・端数処理（ROUND）の 二重がけ            warning
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 番地 = /\$?([A-Z]{1,3})\$?(\d{1,5})/g;
  var 範囲 = /\$?([A-Z]{1,3})\$?(\d{1,5})\s*:\s*\$?([A-Z]{1,3})\$?(\d{1,5})/g;

  function 列番(s) {
    var c = 0;
    for (var i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64);
    return c;
  }
  function 列名(n) {
    var s = "";
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = ((n - r) / 26) | 0; }
    return s;
  }

  function 参照を拾う(f) {
    var s = String(f || ""), 出 = { 単: [], 範: [] };
    範囲.lastIndex = 0;
    var m, 使った = [];
    while ((m = 範囲.exec(s)) !== null) {
      出.範.push({ c1: 列番(m[1]), r1: +m[2], c2: 列番(m[3]), r2: +m[4], 元: m[0] });
      使った.push([m.index, m.index + m[0].length]);
    }
    番地.lastIndex = 0;
    while ((m = 番地.exec(s)) !== null) {
      var 中 = 使った.some(function (u) { return m.index >= u[0] && m.index < u[1]; });
      if (中) continue;
      出.単.push({ c: 列番(m[1]), r: +m[2], ref: m[1] + m[2] });
    }
    return 出;
  }

  function セル(sheetNode) {
    var m = Object.create(null);
    (sheetNode.children || []).forEach(function (c) {
      var ref = String((c.attrs || {}).ref || "").toUpperCase();
      if (ref) m[ref] = c;
    });
    return m;
  }
  function 中身あり(c) {
    if (!c) return false;
    if (c.type === "formulaCell") return true;
    return String(c.text || "").trim() !== "";
  }

  function check(doc, content, o) {
    var 出 = [];
    /* 式の答え。画面の式エンジンがあるときだけ 使う（無くても他は動く）。 */
    var 計算 = null;
    try {
      if (root.VQ2 && VQ2.workplace && VQ2.workplace.formula && content) 計算 = true;
    } catch (e) {}

    VQW.ir.walk(doc.root, function (sh) {
      if (sh.type !== "sheet") return;
      var 表 = セル(sh);
      var 値 = null;
      if (計算) {
        try {
          var 生 = (content.sheets || []).filter(function (x) { return x.id === sh.id; })[0];
          if (生) 値 = (VQ2.workplace.formula.recalc(生) || {}).values || null;
        } catch (e2) { 値 = null; }
      }

      Object.keys(表).forEach(function (ref) {
        var c = 表[ref];
        if (c.type !== "formulaCell") return;
        var f = String((c.attrs || {}).formula || "");
        var どこ = VQW.ir.pathOf(doc.root, c.id) + "（" + ref + "）";

        /* 答えが しくじりになっている */
        if (値 && /^#(REF|NAME|DIV\/0|VALUE|N\/A|NUM|CYCLE)/.test(String(値[ref]))) {
          出.push(V.err("formulaError", { nodeId: c.id, どこ: どこ,
            なに: ref + " = " + f + " の答えが " + 値[ref] + " です。",
            どうする: "式か 見ている先を 直してください。" }));
        }

        var 参 = 参照を拾う(f);

        /* 見ている先が 全部 空 */
        var 見た = 0, あり = 0;
        参.単.forEach(function (u) { 見た++; if (中身あり(表[u.ref])) あり++; });
        参.範.forEach(function (g) {
          for (var r = Math.min(g.r1, g.r2); r <= Math.max(g.r1, g.r2); r++)
            for (var cc = Math.min(g.c1, g.c2); cc <= Math.max(g.c1, g.c2); cc++) {
              見た++; if (中身あり(表[列名(cc) + r])) あり++;
            }
        });
        if (見た && !あり) {
          出.push(V.err("formulaEmptySource", { nodeId: c.id, どこ: どこ,
            なに: "式は入っているのに、見ている先が すべて 空です（" + ref + " = " + f + "）。",
            どうする: "**先に 数を入れてください。**空を掛けても 0 にしかなりません。" }));
        }

        /* SUM の範囲から データが はみ出している */
        if (/^=\s*(SUM|AVERAGE|COUNT|COUNTA|MAX|MIN)\s*\(/i.test(f) && 参.範.length === 1) {
          var g0 = 参.範[0];
          var c1 = Math.min(g0.c1, g0.c2), c2 = Math.max(g0.c1, g0.c2);
          var r1 = Math.min(g0.r1, g0.r2), r2 = Math.max(g0.r1, g0.r2);
          var 外 = [];
          for (var cc2 = c1; cc2 <= c2; cc2++) {
            /* ★ すぐ下だけ見ても 足りない。合計の行が 1 つ挟まっていると
               その先の データ行を 見落とす（実測で 落ちた）。
               式のマスは 飛ばして、下へ 5 行 まで さがす。 */
            for (var d = 1; d <= 5; d++) {
              var 下 = 列名(cc2) + (r2 + d), cell = 表[下];
              if (!cell) continue;
              if (cell.type === "formulaCell") continue;   /* 合計などは 飛ばす */
              if (!中身あり(cell)) continue;
              /* 数のときだけ 言う（「合計」などの 見出しは データではない） */
              if (/^-?[\d,]+(\.\d+)?$/.test(String(cell.text || "").trim())) 外.push(下);
              break;
            }
            var 上 = r1 > 1 ? 列名(cc2) + (r1 - 1) : null;
            if (上 && 中身あり(表[上]) && 表[上].type !== "formulaCell"
                && /^-?[\d,]+(\.\d+)?$/.test(String(表[上].text || "").trim())) 外.push(上);
          }
          if (外.length) {
            出.push(V.err("rangeMismatch", { nodeId: c.id, どこ: どこ,
              なに: ref + " = " + f + " の範囲から、中身のある行が はみ出しています（"
                + 外.slice(0, 4).join(" / ") + "）。",
              どうする: "範囲を データの最後まで 伸ばしてください。" }));
          }
        }

        /* 端数処理の 二重がけ */
        if (/ROUND\s*\(/i.test(f) && /^=\s*(SUM|ROUND)\s*\(/i.test(f)) {
          var 元がROUND = 参.範.some(function (g2) {
            for (var r3 = Math.min(g2.r1, g2.r2); r3 <= Math.max(g2.r1, g2.r2); r3++)
              for (var c3 = Math.min(g2.c1, g2.c2); c3 <= Math.max(g2.c1, g2.c2); c3++) {
                var x = 表[列名(c3) + r3];
                if (x && x.type === "formulaCell" && /ROUND\s*\(/i.test(String((x.attrs || {}).formula)))
                  return true;
              }
            return false;
          });
          if (元がROUND) {
            出.push(V.warn("doubleRound", { nodeId: c.id, どこ: どこ,
              なに: "行ごとに ROUND したものを、合計で もう一度 ROUND しています。",
              どうする: "どちらか 一方にしてください（1 円ずれる原因になります）。" }));
          }
        }
      });
    });
    return 出;
  }

  /* DocType の calculations 指定に対する検査（doctype.js から呼ぶ） */
  function 式であるべき(doc, ref, sheetNode) {
    var 表 = セル(sheetNode);
    var c = 表[String(ref).toUpperCase()];
    if (!c) return "そのマス（" + ref + "）が ありません";
    if (c.type !== "formulaCell") return "そのマス（" + ref + "）が 式ではありません（値が 直接 書かれています）";
    return null;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.formula = {
    check: check, 参照を拾う: 参照を拾う, 列名: 列名, 列番: 列番,
    式であるべき: 式であるべき
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/docs.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/docs.js — 文書の 崩れ

   ★ 紙の大きさ・余白は body.page が持っている（workplace/paper.js）。
     ここでは その数字を使って **入るか入らないか** を計算する。
     見た目を AI に見せて聞かない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 紙 = { a4: [210, 297], b5: [182, 257], a3: [297, 420], letter: [216, 279] };
  var mm = 3.7795;                     /* 1mm ≒ 3.78px（96dpi）*/

  function 紙の幅mm(page) {
    var s = 紙[String((page && page.size) || "a4").toLowerCase()] || 紙.a4;
    var 横 = String(page && page.orient) === "landscape";
    var w = 横 ? s[1] : s[0];
    var m = (page && page.margin) || { l: 25.4, r: 25.4 };
    return Math.max(20, w - (Number(m.l) || 0) - (Number(m.r) || 0));
  }
  function 紙の高さmm(page) {
    var s = 紙[String((page && page.size) || "a4").toLowerCase()] || 紙.a4;
    var 横 = String(page && page.orient) === "landscape";
    var h = 横 ? s[0] : s[1];
    var m = (page && page.margin) || { t: 25.4, b: 25.4 };
    return Math.max(20, h - (Number(m.t) || 0) - (Number(m.b) || 0));
  }

  /* 見かけの文字幅（全角 1 / 半角 0.5）。1 か所に閉じ込める。 */
  function 字数(s) {
    var t = String(s || ""), n = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      n += (c < 0x80 || (c >= 0xff61 && c <= 0xff9f)) ? 0.5 : 1;
    }
    return n;
  }

  var 高さ = { heading: 12, paragraph: 8, listItem: 7, quote: 9, code: 8,
               callout: 10, todo: 7, table: 0, image: 0, divider: 6,
               pageBreak: 0, math: 12, field: 8, answerSpace: 0, toc: 10,
               caption: 6, section: 14 };

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];
    var page = (content && content.page) || (doc.root.attrs && doc.root.attrs.page) || {};
    var 幅mm = 紙の幅mm(page);
    var 本文pt = 10.5, 一行の字数 = Math.floor(幅mm / (本文pt * 0.3528));

    var 前の段 = 0, 空の連続 = 0, 見出しが1つでも = false;
    var 高さ計 = 0;

    (doc.root.children || []).forEach(function (n, i) {
      var t = VQW.ir.素(n.text || "");
      var どこ = VQW.ir.pathOf(doc.root, n.id);

      /* 見出しの飛び */
      if (n.type === "heading") {
        見出しが1つでも = true;
        var lv = Number((n.attrs || {}).level) || 1;
        if (前の段 && lv > 前の段 + 1) {
          出.push(V.warn("headingSkip", { nodeId: n.id, どこ: どこ,
            なに: "見出しが 見出し" + 前の段 + " から 見出し" + lv + " へ 飛んでいます。",
            どうする: "1 段ずつ 下げてください。" }));
        }
        前の段 = lv;
        if (!t.trim()) {
          出.push(V.err("emptyHeading", { nodeId: n.id, どこ: どこ,
            なに: "見出しが 空です。", どうする: "文を入れるか、消してください。" }));
        }
      }

      /* 空の段落が 続く */
      if ((n.type === "paragraph" || n.type === "listItem") && !t.trim()) {
        空の連続++;
        if (空の連続 >= 3) {
          出.push(V.warn("emptyRun", { nodeId: n.id, どこ: どこ,
            なに: "空のかたまりが " + 空の連続 + " 個 続いています。",
            どうする: "余白は 段落を空けるのではなく、余白の設定で作ってください。" }));
        }
      } else 空の連続 = 0;

      /* 解答欄の高さ */
      if (n.type === "answerSpace") {
        var 行 = Number((n.attrs || {}).lines) || 0;
        if (行 <= 0) {
          出.push(V.err("answerSpaceZero", { nodeId: n.id, どこ: どこ,
            なに: "解答欄の 行数が 0 です（書く所がありません）。",
            どうする: "lines に 1 以上を入れてください。" }));
        }
        高さ計 += 行 * 8 + 4;
      }

      /* 画像 */
      if (n.type === "image") {
        var a = n.attrs || {};
        if (!a.src) {
          出.push(V.err("imageMissing", { nodeId: n.id, どこ: どこ,
            なに: "画像が まだ選ばれていません。",
            どうする: "**画像は 人に選んでもらってください。**入れたと言わないこと。" }));
        }
        if (Number(a.width) > 100) {
          出.push(V.warn("imageWide", { nodeId: n.id, どこ: どこ,
            なに: "画像の幅が 100% を超えています（" + a.width + "%）。",
            どうする: "紙からはみ出します。100 以下にしてください。" }));
        }
        高さ計 += 60;
      }

      /* 表：列が多すぎて 紙に入らない */
      if (n.type === "table") {
        var 行数 = (n.children || []).length;
        var 列数 = ((n.children || [])[0] || { children: [] }).children.length;
        if (!行数 || !列数) {
          出.push(V.err("emptyTable", { nodeId: n.id, どこ: どこ,
            なに: "空の表です。", どうする: "行と列を入れてください。" }));
        } else {
          var ずれ = (n.children || []).filter(function (r) {
            return (r.children || []).length !== 列数;
          }).length;
          if (ずれ) {
            出.push(V.err("tableRagged", { nodeId: n.id, どこ: どこ,
              なに: "表の列数が そろっていません（" + ずれ + " 行）。",
              どうする: "すべての行を " + 列数 + " 列にしてください。" }));
          }
          /* いちばん長いマスが 1 列あたりの幅に入るか */
          var 一列mm = 幅mm / 列数;
          var 入る字 = Math.floor(一列mm / (9 * 0.3528));
          var 長い = null;
          (n.children || []).forEach(function (r) {
            (r.children || []).forEach(function (c) {
              var 幅 = 字数(VQW.ir.素(c.text));
              if (幅 > 入る字 * 3 && (!長い || 幅 > 長い.幅))
                長い = { 幅: 幅, id: c.id, t: VQW.ir.素(c.text) };
            });
          });
          if (長い) {
            出.push(V.warn("tableTooNarrow", { nodeId: 長い.id, どこ: どこ,
              なに: "列が " + 列数 + " 列だと 1 列 " + 入る字 + " 字ぶんしかなく、"
                + "「" + 長い.t.slice(0, 16) + "…」が 何行にも折り返します。",
              どうする: "列を減らすか、紙を横にしてください。" }));
          }
          高さ計 += 行数 * 7 + 4;
        }
      }

      if (n.type === "math") {
        高さ計 += 12;
      } else if (高さ[n.type] !== undefined && n.type !== "table" && n.type !== "image"
                 && n.type !== "answerSpace") {
        var 行2 = Math.max(1, Math.ceil(字数(t) / Math.max(8, 一行の字数)));
        高さ計 += 行2 * (高さ[n.type] || 8) / 1.5 + 2;
      }
      if (n.type === "pageBreak") 高さ計 = Math.ceil(高さ計 / 紙の高さmm(page)) * 紙の高さmm(page);
    });

    if ((doc.root.children || []).length >= 12 && !見出しが1つでも) {
      出.push(V.warn("noHeading", {
        なに: (doc.root.children || []).length + " 個の かたまりに 見出しが 0 個です。",
        どうする: "読みにくいので 見出しを入れてください。" }));
    }

    /* 指定ページ数に入るか（言われたときだけ見る） */
    var 見こみ = Math.max(1, Math.ceil(高さ計 / 紙の高さmm(page)));
    if (o.期待ページ数 && 見こみ > Number(o.期待ページ数)) {
      出.push(V.warn("pageOverflow", {
        なに: "見こみ " + 見こみ + " ページで、頼まれた " + o.期待ページ数 + " ページに 入りません。",
        どうする: "文を削るか、ページ数を 増やしてください。" }));
    }

    V.足す(結, 出);
    結.見こみページ = 見こみ;
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.docs = { check: check, 字数: 字数, 紙の幅mm: 紙の幅mm, 紙の高さmm: 紙の高さmm };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/sheets.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/sheets.js — 表の 崩れ

   ★「厚生年金保...」を 検出するのが 目的のひとつ。
     幅の見かたは **画面の autoFit と同じ式**（16 + 文字数 × 13）にする。
     別の式にすると、検出と 直しが 食い違って 直らない。
   ★ 数と式の検査は numbers.js / formula.js に任せ、ここで束ねる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 既定幅 = 96;                     /* ui-sheets の CELL_W と同じ */
  var 既定高 = 26;                     /* CELL_H */

  /* 画面の autoFit と 同じ式。ここを 1 か所にしておく。 */
  function 要る幅(文字数) { return Math.max(48, Math.min(420, 16 + 文字数 * 13)); }
  function 入る文字数(幅) { return Math.max(1, Math.floor((幅 - 16) / 13)); }

  function 列番(s) {
    var c = 0;
    for (var i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64);
    return c - 1;                       /* colW は 0 始まり */
  }

  /* 画面に **実際に出ている** 文字。
     ★ 式のマスは 答えが出ていないと 分からない。分からないときは
       null を返して 幅の検査から 外す。式の文字（=SUM(D2:D6)）を
       測ると、答えは 4 文字なのに 11 文字ぶん 広げてしまう（実測で 落ちた）。 */
  function 見える文字(c, 値, ref) {
    if (c.type === "formulaCell") {
      if (値 && 値[ref] !== undefined) return String(値[ref]);
      return null;
    }
    return String(c.text || "");
  }

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];

    /* 数と式 */
    if (V.numbers) V.足す(結, V.numbers.check(doc, content, o));
    if (V.formula) V.足す(結, V.formula.check(doc, content, o));

    VQW.ir.walk(doc.root, function (sh) {
      if (sh.type !== "sheet") return;
      var a = sh.attrs || {};
      var colW = a.colW || {};
      var 値 = null;
      try {
        var 生 = ((content || {}).sheets || []).filter(function (x) { return x.id === sh.id; })[0];
        if (生 && root.VQ2 && VQ2.workplace && VQ2.workplace.formula)
          値 = (VQ2.workplace.formula.recalc(生) || {}).values || null;
      } catch (e) { 値 = null; }

      var マス = sh.children || [];
      if (!マス.length) {
        出.push(V.err("emptySheet", { nodeId: sh.id, どこ: VQW.ir.pathOf(doc.root, sh.id),
          なに: "「" + (a.name || "シート") + "」に マスが 1 つも 埋まっていません。",
          どうする: "中身を 入れてください。" }));
        return;
      }

      /* ── 列幅不足（文字が 切れる）── */
      var 切れ = {};
      マス.forEach(function (c) {
        var ref = String((c.attrs || {}).ref || "").toUpperCase();
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        if (!m) return;
        var ci = 列番(m[1]);
        var 幅 = Number(colW[ci]) > 0 ? Number(colW[ci]) : 既定幅;
        var t = 見える文字(c, 値, ref);
        if (!t) return;
        if (t.length <= 入る文字数(幅)) return;
        var k = m[1];
        if (!切れ[k] || t.length > 切れ[k].len)
          切れ[k] = { len: t.length, ref: ref, t: t, 幅: 幅, ci: ci, id: c.id };
      });
      Object.keys(切れ).forEach(function (k) {
        var x = 切れ[k];
        出.push(V.err("colTooNarrow", { nodeId: x.id,
          どこ: VQW.ir.pathOf(doc.root, sh.id) + "（" + x.ref + "）",
          なに: x.ref + " の「" + x.t.slice(0, 12) + "…」が 列幅 " + x.幅
            + "px に 入りません（" + 入る文字数(x.幅) + " 字まで / 中身は " + x.len + " 字）。",
          どうする: "列 " + k + " の幅を " + 要る幅(x.len) + "px にしてください。",
          直しかた: { 種: "colW", sheetId: sh.id, 列: x.ci, 幅: 要る幅(x.len) }
        }));
      });

      /* ── 結合が 並べ替え・絞り込みを 壊す ── */
      var 結合 = a.merges || [];
      if (結合.length) {
        var 表の中 = 結合.filter(function (r) {
          var mm = String(r).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          return mm && +mm[2] >= 2;                        /* 見出しより下 */
        });
        if (表の中.length) {
          出.push(V.warn("mergeInData", { nodeId: sh.id,
            どこ: VQW.ir.pathOf(doc.root, sh.id),
            なに: "データの行に 結合が " + 表の中.length + " か所 あります（"
              + 表の中.slice(0, 3).join(" / ") + "）。",
            どうする: "並べ替えと 絞り込みが 効かなくなります。見出しの上だけにしてください。" }));
        }
      }

      /* ── 数の列に 書式が 当たっているか ── */
      if (V.numbers) {
        var 数列 = V.numbers.数の列(sh);
        Object.keys(数列).forEach(function (k) {
          if (!数列[k]) return;
          var 付いている = 0, 全 = 0;
          マス.forEach(function (c) {
            var ref = String((c.attrs || {}).ref || "");
            var m2 = ref.match(/^([A-Z]+)(\d+)$/);
            if (!m2 || m2[1] !== k || +m2[2] <= 1) return;
            全++;
            var s = (c.attrs || {}).style;
            if (s && (s.fmt || s.format || s.numFmt)) 付いている++;
          });
          if (全 >= 3 && !付いている) {
            出.push(V.warn("noNumberFormat", { nodeId: sh.id,
              どこ: VQW.ir.pathOf(doc.root, sh.id) + "（列 " + k + "）",
              なに: "数の列 " + k + " に 表示の書式が 当たっていません。",
              どうする: "桁区切りや 通貨は **書式**でつけてください（文字で書かない）。" }));
          }
        });
      }

      /* ── 印刷が 入るか（言われたときだけ）── */
      if (o.期待ページ数) {
        var 最大行 = 0;
        マス.forEach(function (c) {
          var m3 = String((c.attrs || {}).ref || "").match(/^[A-Z]+(\d+)$/);
          if (m3) 最大行 = Math.max(最大行, +m3[1]);
        });
        var 一枚の行 = Math.floor((297 - 40) * 3.78 / 既定高);
        var 見こみ = Math.max(1, Math.ceil(最大行 / Math.max(1, 一枚の行)));
        if (見こみ > Number(o.期待ページ数)) {
          出.push(V.warn("pageOverflow", { nodeId: sh.id,
            なに: "見こみ " + 見こみ + " ページで、頼まれた " + o.期待ページ数 + " ページに入りません。",
            どうする: "行を減らすか、縮小して印刷してください。" }));
        }
      }
    });

    /* ── グラフの範囲 ── */
    VQW.ir.walk(doc.root, function (g) {
      if (g.type !== "chart") return;
      var r = String((g.attrs || {}).range || "");
      if (!/^[A-Z]+\d+:[A-Z]+\d+$/.test(r.toUpperCase())) {
        出.push(V.err("chartRange", { nodeId: g.id, どこ: VQW.ir.pathOf(doc.root, g.id),
          なに: "グラフの 範囲が おかしいです（" + (r || "空") + "）。",
          どうする: "A1:B10 の形で 入れてください。" }));
      }
    });

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.sheets = { check: check, 要る幅: 要る幅, 入る文字数: 入る文字数,
                          既定幅: 既定幅, 列番: 列番 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/slides.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/slides.js — 発表資料の 崩れ

   ★ デザインエンジン（client/design/gate.js）が **すでに** 同じことを
     もっと細かくやっている。二重に持つと 片方だけ直して食い違うので、
     **あるときは そちらを使う**。ここは 無いときの受け皿と、
     デザインエンジンを通していない古い資料のための検査。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 画布 = { "16:9": [960, 540], "4:3": [960, 720] };

  function 重なり(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function 箱(n) {
    var a = n.attrs || {};
    return { x: Number(a.x) || 0, y: Number(a.y) || 0,
             w: Number(a.w) || 0, h: Number(a.h) || 0 };
  }

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];
    var 比 = String((doc.root.attrs || {}).ratio || "16:9");
    var 板 = 画布[比] || 画布["16:9"];
    var W = 板[0], H = 板[1];

    /* デザインエンジンで作った資料は そちらの Gate が正。文字数だけ見る。 */
    var エンジン製 = !!(doc.root.attrs && doc.root.attrs.designSeed);

    (doc.root.children || []).forEach(function (p, pi) {
      var els = (p.children || []).filter(function (e) {
        var a = e.attrs || {};
        return !a.装飾;
      });
      var どこ = "ページ" + (pi + 1);

      /* 1 枚あたりの文字数 */
      var 字 = 0, 英 = 0, 全 = 0;
      (p.children || []).forEach(function (e) {
        var t = VQW.ir.素(e.text || "");
        字 += t.length;
        for (var i = 0; i < t.length; i++) {
          var c = t.charCodeAt(i);
          if (c < 0x80) 英++; else 全++;
        }
      });
      var 上限 = 全 >= 英 ? 200 : 400;
      if (字 > 上限) {
        出.push(V.warn("charDensity", { nodeId: p.id, どこ: どこ,
          なに: "1 枚に " + 字 + " 字あります（目安 " + 上限 + " 字）。",
          どうする: "枚を分けるか、文を削ってください。" }));
      }

      if (エンジン製) return;               /* ここから先は Gate の担当 */

      els.forEach(function (e, i) {
        var b = 箱(e), どこ2 = どこ + " / " + VQW.ir.名(e) + (i + 1);
        /* はみ出し */
        if (b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1) {
          出.push(V.err("boundsOverflow", { nodeId: e.id, どこ: どこ2,
            なに: "画面（" + W + "×" + H + "）から はみ出しています（"
              + Math.round(b.x) + "," + Math.round(b.y) + " " + Math.round(b.w) + "×" + Math.round(b.h) + "）。",
            どうする: "中へ入れてください。" }));
        }
        /* 小さすぎる字 */
        var s = Number((e.attrs || {}).size);
        if (e.type === "textFrame" && s && s < 14) {
          出.push(V.err("minFontSize", { nodeId: e.id, どこ: どこ2,
            なに: "文字が " + s + "px しかありません（14px 未満）。",
            どうする: "14px 以上にしてください。" }));
        }
        /* 重なり */
        for (var j = i + 1; j < els.length; j++) {
          var b2 = 箱(els[j]);
          var 面 = 重なり(b, b2);
          if (面 <= 0) continue;
          var 小 = Math.min(b.w * b.h, b2.w * b2.h);
          if (小 > 0 && 面 / 小 > 0.2) {
            出.push(V.err("overlap", { nodeId: e.id, どこ: どこ2,
              なに: VQW.ir.名(e) + " と " + VQW.ir.名(els[j]) + " が "
                + Math.round(面 / 小 * 100) + "% 重なっています。",
              どうする: "どちらかを ずらしてください。" }));
            break;
          }
        }
      });

      if (!els.length) {
        出.push(V.warn("emptyPage", { nodeId: p.id, どこ: どこ,
          なに: "何も置かれていない ページです。",
          どうする: "中身を入れるか、消してください。" }));
      }
    });

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.slides = { check: check, 重なり: 重なり };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/validate/doctype.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/validate/doctype.js — 書式に 合っているか

   ★ 見かた（§7.5）
       ・fillPolicy が user_input **以外**の必須欄が 埋まっているか
       ・user_input の欄が **記入欄として 在るか**
         （空なのは error ではない。**捏造されているほうが error**）
       ・regions がすべて あるか
       ・calculations の指す所が **式** になっているか
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 欄が 書類の中に 在るか。key / label のどちらでも引く。 */
  function 欄をさがす(doc, f) {
    var 当 = [];
    VQW.ir.walk(doc.root, function (n) {
      var a = n.attrs || {};
      if (文(a.key) && 文(a.key) === 文(f.key)) { 当.push(n); return; }
      var t = VQW.ir.素(n.text || "");
      var l = VQW.ir.素(a.label || "");
      if (f.label && (l === f.label || t === f.label
          || t.indexOf(f.label) === 0)) 当.push(n);
    });
    return 当;
  }

  function 埋まっている(n) {
    if (!n) return false;
    var a = n.attrs || {};
    if (n.type === "formulaCell") return true;
    if (VQW.ir.空箱[n.type]) return 文(n.text).trim() !== "";
    var t = VQW.ir.素(n.text || "");
    /* 「氏名：」だけの見出しは 埋まっていない */
    return t.replace(/[：:\s_＿]/g, "").length > 文(a.label || "").length;
  }

  function check(doc, content, dt, o) {
    var 結 = V.空(), 出 = [];
    if (!dt) return 結;

    /* draft の書式は 使うたびに 断りを入れる */
    if (dt.status !== "approved") {
      出.push(V.warn("doctypeDraft", {
        なに: "「" + dt.displayName + "」は **まだ承認されていない書式**です。",
        どうする: "項目や並びを ご自分で確かめてください。" }));
    }

    (dt.requiredFields || []).forEach(function (f) {
      var 当 = 欄をさがす(doc, f);
      if (!当.length) {
        出.push(V.err("fieldMissing", {
          なに: "必須の項目「" + (f.label || f.key) + "」が ありません。",
          どうする: f.fillPolicy === "user_input"
            ? "**空欄（記入欄）として** 置いてください。値は 入れないこと。"
            : "項目を 足してください。" }));
        return;
      }
      if (f.fillPolicy === "user_input") {
        /* 空でよい。ただし **記入欄として** 在ること。
           値が入っていたら、それは 捏造の疑い。 */
        var 箱 = 当.filter(function (n) { return VQW.ir.空箱[n.type]; });
        if (!箱.length) {
          出.push(V.err("fieldNotInput", { nodeId: 当[0].id,
            どこ: VQW.ir.pathOf(doc.root, 当[0].id),
            なに: "「" + (f.label || f.key) + "」が 記入欄になっていません。",
            どうする: "人が入れる項目なので、**空欄＋入力ヒント**にしてください。" }));
        } else if (!o || o.値の捏造を見る !== false) {
          箱.forEach(function (n) {
            var t = VQW.ir.素(n.text || "");
            if (t.trim() && !(n.attrs || {}).userEntered) {
              出.push(V.err("fabricated", { nodeId: n.id,
                どこ: VQW.ir.pathOf(doc.root, n.id),
                なに: "「" + (f.label || f.key) + "」に **こちらが作った値** が入っています（「"
                  + t.slice(0, 24) + "」）。",
                どうする: "**持っていない値は 埋めないでください。**空欄に戻します。" }));
            }
          });
        }
      } else if (f.fillPolicy === "llm_allowed" || f.fillPolicy === "derived") {
        var ある = 当.some(埋まっている);
        if (!ある) {
          出.push(V.err("fieldEmpty", { nodeId: 当[0].id,
            どこ: VQW.ir.pathOf(doc.root, 当[0].id),
            なに: "「" + (f.label || f.key) + "」が 空のままです。",
            どうする: f.fillPolicy === "derived"
              ? "式で 出してください。" : "中身を 書いてください。" }));
        }
      }
    });

    /* regions */
    (dt.regions || []).forEach(function (r) {
      var 名 = 文(r.id || r.name);
      if (!名) return;
      var ある = false;
      VQW.ir.walk(doc.root, function (n) {
        var a = n.attrs || {};
        if (文(a.region) === 名 || 文(a.key) === 名) ある = true;
      });
      if (!ある && r.required !== false) {
        出.push(V.warn("regionMissing", {
          なに: "領域「" + (r.label || 名) + "」が ありません。",
          どうする: "書式どおりに 並べてください。" }));
      }
    });

    /* calculations は **式** であること */
    if (dt.kind === "sheets" && V.formula) {
      var シート = [];
      VQW.ir.walk(doc.root, function (n) { if (n.type === "sheet") シート.push(n); });
      (dt.calculations || []).forEach(function (c) {
        var ref = 文(c.target || c.key);
        if (!/^[A-Z]+\d+$/i.test(ref)) return;
        var なぜ = シート.length ? V.formula.式であるべき(doc, ref, シート[0]) : "シートがありません";
        if (なぜ) {
          出.push(V.err("calcNotFormula", {
            なに: (c.label || ref) + " は 計算で出す所です: " + なぜ,
            どうする: "「=" + 文(c.formula) + "」のように **式**で入れてください。" }));
        }
      });
    }

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.doctype = { check: check, 欄をさがす: 欄をさがす, 埋まっている: 埋まっている };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/report/render.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/report/render.js — 報告文を **機械が** 作る

   ★ これがいちばん大事な決まり（§8.2）。
     報告を LLM に書かせているかぎり、嘘は 絶対に消えない。
     「ごめんごめん！作り変えて保存したよ」は これが原因で出ている。
     道具の返り値を 見て 感想を書くのではなく、
     **差分そのものから 文を組み立てる。**
   ★ 部分成功を 成功と言わない（§8.3）。3 件のうち 2 件なら「2 件を適用、
     1 件は未適用」と そのまま書く。
   ★ Workplace は 仕事の道具。「ごめんごめん！」「〜だよ！」は 使わない（§8.4）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  /* status が applied かつ error 0 のとき **以外**に 出してはいけない言葉
     ★ 2026-08-17 追加（受け入れテストの実測）。
       「見直しもしたから、崩れもないはず！確認してみてね。」が
       そのまま画面に出ていた。**検証していないのに 検証したと 言っている。**
       「見直しもした」「崩れもない」「保存しました」を 足す。 */
  var 完成の言葉 = [
    "できました", "完成しました", "修正しました", "変更しました",
    "作成しました", "保存したよ", "保存しました", "直しました", "対応しました",
    "確認してみて", "できたよ", "直したよ", "作ったよ", "できた！",
    "修正完了", "完了しました", "反映しました",
    "見直しもした", "見直しました", "崩れもない", "崩れはない", "問題ありません"
  ];

  var 理由の言葉 = {
    not_found: "該当箇所が 見つかりませんでした",
    ambiguous: "どこを指すか 1 つに決まりませんでした",
    locked: "ピン留めされているため 触っていません",
    invalid: "その操作は 使えませんでした",
    out_of_scope: "宣言していない所が変わるため 取り消しました",
    competing_edit: "その間に 書類が変わったため 取り消しました"
  };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 切(s, n) { s = 文(s); return s.length <= n ? s : s.slice(0, n) + "…"; }

  /* ══ 報告文 ═══════════════════════════════════════════════════ */
  function render(rep, o) {
    o = o || {};
    rep = rep || {};
    var 済 = rep.applied || [], 落 = rep.skipped || [];
    var 検 = rep.validation || { errors: [], warnings: [] };
    var 行 = [];

    if (rep.見ただけ) {
      /* ★ 「いま開いている書類を 数えただけ」のとき。
         変更の件数を 出すと「変更 0 件」となり、作ったばかりの書類に
         そぐわない（実測: makeDocument の直後に出て 誤解を生む）。 */
      行.push("いまの書類を 数えました。");
    } else if (rep.status === "rejected") {
      行.push("**変更していません。**");
      落.slice(0, 4).forEach(function (s) {
        行.push("　" + (理由の言葉[s.reason] || "できませんでした")
          + (s.なぜ ? "\n　" + 切(s.なぜ, 160) : ""));
      });
      if (rep.はみ出し && rep.はみ出し.length) {
        行.push("　変わろうとしていた所: "
          + rep.はみ出し.slice(0, 4).map(function (x) { return x.id; }).join(" / "));
      }
    } else {
      行.push("変更 " + 済.length + " 件" + (落.length ? " / 未適用 " + 落.length + " 件" : ""));
      行.push("");
      済.slice(0, 12).forEach(function (a) {
        行.push("✓ " + (a.path || a.nodeId));
        if (a.before || a.after) {
          if (a.before) 行.push("　　旧「" + 切(a.before, 60) + "」");
          行.push("　　新「" + 切(a.after, 60) + "」");
        }
      });
      if (済.length > 12) 行.push("…ほか " + (済.length - 12) + " 件");
      落.forEach(function (s) {
        行.push("");
        行.push("未適用: 「" + 切(s.intent, 40) + "」");
        行.push("　　" + (理由の言葉[s.reason] || "できませんでした")
          + (s.候補 && s.候補.length ? "。どこか 指定してください。" : "。"));
      });
    }

    if (検.errors && 検.errors.length) {
      行.push("");
      行.push("**まだ 直す所が " + 検.errors.length + " か所 あります。**");
      検.errors.slice(0, 6).forEach(function (e) {
        行.push("　・" + (e.どこ ? e.どこ + " … " : "") + 切(e.なに, 90));
      });
      if (検.errors.length > 6) 行.push("　…ほか " + (検.errors.length - 6) + " か所");
    }
    if (検.warnings && 検.warnings.length) {
      行.push("");
      行.push("気になる所 " + 検.warnings.length + " か所（このままでも 使えます）");
      検.warnings.slice(0, 4).forEach(function (w) {
        行.push("　・" + (w.どこ ? w.どこ + " … " : "") + 切(w.なに, 80));
      });
    }
    if (rep.ことわり) { 行.push(""); 行.push(rep.ことわり); }
    return 行.join("\n");
  }

  /* 完成と言ってよいか。**ここだけが 判断する。** */
  function 言ってよい(rep) {
    if (!rep) return false;
    if (rep.status !== "applied") return false;
    var 検 = rep.validation || {};
    return !(検.errors && 検.errors.length);
  }

  /* 道具の返り値をまとめて作る。Lumi へは これを そのまま返す。 */
  function 道具の返り(rep, o) {
    o = o || {};
    var よい = 言ってよい(rep);
    var 出 = {
      報告: render(rep, o),
      状態: rep.status,
      変えた数: (rep.applied || []).length,
      未適用: (rep.skipped || []).length,
      残る崩れ: ((rep.validation || {}).errors || []).length,
      完成と言ってよい: よい,
      つぎ: よい
        ? "**上の「報告」を そのまま伝えてください。**足したり ぼかしたりしないこと。"
        : "**まだ「できました」と言わないでください。**上の「報告」を そのまま伝え、"
          + "残っている所を 直してから もう一度 見直してください。"
    };
    if (!よい) 出.言ってはいけない言葉 = 完成の言葉.slice(0, 8);
    if (rep.version) 出.版 = rep.version.from + " → " + rep.version.to;
    if (rep.候補) 出.候補 = rep.候補;
    /* ★ 画面の出口（said）が これを 見て 差し替える。**必ず 覚える。** */
    return 覚える(出);
  }

  /* 言ったことに 完成の言葉が 混ざっていないか（監査・試験で使う） */
  function 言ってしまった(発話) {
    var s = 文(発話);
    var 出 = [];
    完成の言葉.forEach(function (w) { if (s.indexOf(w) >= 0) 出.push(w); });
    return 出;
  }

  /* ══ 直近の報告 と 検閲（2026-08-17）══════════════════════════════
     ★ 受け入れテストの実測。**言い聞かせでは 止まらなかった。**
       システム指示に「完成と言ってよい が false のあいだは言うな」と
       書いてあっても、モデルは「見直しもしたから、崩れもないはず！」と
       言い、その文が そのまま 画面に出ていた。
     ★ だから **出口で 差し替える。**言わせないのではなく、
       言っても **画面には 機械の報告しか 出さない。**
     ★ 声は もう鳴っているので 完全には 止まらない。ここで止めるのは
       **画面に残る文**。残る文が 事実であれば、あとから読んだ人が
       だまされない。 */
  var 直近 = null;      /* { 出, 時 } */

  function 覚える(出) {
    if (!出 || typeof 出 !== "object") return 出;
    if (出.報告 !== undefined) { 直近 = { 出: 出, 時: Date.now() }; return 出; }
    /* 「聞き返し」の形（だめ／きくこと）も 覚える。
       聞いている最中に「直しました」と言われるのを 止めるため。 */
    if (出.だめ !== undefined) {
      直近 = { 時: Date.now(), 出: {
        報告: 文(出.だめ) + (出.きくこと ? "\n" + 文(出.きくこと) : ""),
        状態: "rejected", 変えた数: 0, 未適用: 1, 残る崩れ: 0,
        完成と言ってよい: 出.完成と言ってよい === true,
        つぎ: 文(出.つぎ)
      } };
    }
    return 出;
  }
  function 忘れる() { 直近 = null; }
  function いまの報告(有効ms) {
    if (!直近) return null;
    var 限 = Number(有効ms) || 120000;
    if (Date.now() - 直近.時 > 限) return null;
    return 直近.出;
  }

  /* 差し替える文。**なぜ差し替えたか**も 一緒に出す（黙って書き換えない）。 */
  function 差し替え文(r) {
    return "（いまの言いかたは 数えた結果と 合っていないので、"
      + "こちらで 差し替えました）\n" + 文(r && r.報告);
  }

  /* 発話を 検閲する。
       発話 … Lumi が 言った文（積み上がったもの）
       報告 … その場で 用意した機械の報告（無ければ 直近を使う）
     返り { 直した, 文, ひっかかり, もとの文 } */
  function 検閲(発話, 報告) {
    var s = 文(発話);
    var ひ = 言ってしまった(s);
    if (!ひ.length) return { 直した: false, 文: s, ひっかかり: [] };
    var r = 報告 || いまの報告();
    /* 機械の報告が 無い＝Workplace の話ではない（クイズなど）。**触らない。** */
    if (!r) return { 直した: false, 文: s, ひっかかり: ひ, 報告なし: true };
    if (r.完成と言ってよい) return { 直した: false, 文: s, ひっかかり: ひ };
    return { 直した: true, 文: 差し替え文(r), もとの文: s, ひっかかり: ひ };
  }

  VQW.report = {
    render: render, 言ってよい: 言ってよい, 道具の返り: 道具の返り,
    言ってしまった: 言ってしまった, 完成の言葉: 完成の言葉, 理由の言葉: 理由の言葉,
    覚える: 覚える, 忘れる: 忘れる, いまの報告: いまの報告, 検閲: 検閲
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/schema.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/schema.js — 書式カタログの 形

   ★ fillPolicy が「値を捏造しない」の 実装そのもの（§6.1）
       user_input  … **LLM が値を作ってはならない**。空欄＋入力ヒントを出す。
                     金額・氏名・番号・日付・料率は すべてこれ。
       derived     … 式か 計算で 出す（calculations に書く）
       llm_allowed … LLM が書いてよい（問題文・見出し・説明文）
   ★ DocType は **データ**（JSON）。ここは その形を確かめるだけで、
     中身を コードに埋め込まない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 埋めかた = ["user_input", "derived", "llm_allowed"];
  var 値の型 = ["text", "number", "money", "date", "percent", "enum"];
  var 種類 = ["docs", "sheets", "slides"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  function 欄をそろえる(f) {
    return {
      key: 文(f && f.key),
      label: 文(f && f.label) || 文(f && f.key),
      dataType: 値の型.indexOf(文(f && f.dataType)) >= 0 ? 文(f.dataType) : "text",
      fillPolicy: 埋めかた.indexOf(文(f && f.fillPolicy)) >= 0 ? 文(f.fillPolicy) : "user_input",
      format: 文(f && f.format) || undefined,
      hint: 文(f && f.hint) || undefined,
      note: 文(f && f.note) || undefined,
      options: 配(f && f.options).map(文)
    };
  }

  function そろえる(d) {
    d = d || {};
    return {
      id: 文(d.id),
      kind: 種類.indexOf(文(d.kind)) >= 0 ? 文(d.kind) : "docs",
      displayName: 文(d.displayName) || 文(d.id),
      aliases: 配(d.aliases).map(文),
      parent: d.parent ? 文(d.parent) : null,
      requiredFields: 配(d.requiredFields).map(欄をそろえる),
      optionalFields: 配(d.optionalFields).map(欄をそろえる),
      regions: 配(d.regions),
      calculations: 配(d.calculations),
      validations: 配(d.validations),
      printSpec: d.printSpec || { paper: "A4", orientation: "portrait",
        margins: { top: 20, right: 18, bottom: 20, left: 18 } },
      source: d.source || { kind: "manual", ref: "", checkedAt: "" },
      status: 文(d.status) === "approved" ? "approved" : "draft"
    };
  }

  /* 形が おかしいものは 使わない（黙って使うと 検証が空回りする） */
  function 確かめる(d) {
    var 悪 = [];
    if (!文(d && d.id)) 悪.push("id がありません");
    if (種類.indexOf(文(d && d.kind)) < 0) 悪.push("kind が docs / sheets / slides ではありません");
    配(d && d.requiredFields).forEach(function (f, i) {
      if (!文(f && f.key)) 悪.push("requiredFields[" + i + "].key がありません");
      if (f && f.fillPolicy && 埋めかた.indexOf(文(f.fillPolicy)) < 0)
        悪.push("requiredFields[" + i + "].fillPolicy が 知らない値です（" + f.fillPolicy + "）");
    });
    配(d && d.calculations).forEach(function (c, i) {
      if (!文(c && (c.target || c.key))) 悪.push("calculations[" + i + "].target がありません");
      if (!文(c && c.formula)) 悪.push("calculations[" + i + "].formula がありません");
    });
    return 悪;
  }

  /* LLM が値を作ってよい欄だけ返す。**ここを通さずに埋めさせない。** */
  function 書いてよい欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "llm_allowed"; });
  }
  function 人が入れる欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "user_input"; });
  }
  function 計算で出す欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "derived"; });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.schema = {
    そろえる: そろえる, 確かめる: 確かめる, 欄をそろえる: 欄をそろえる,
    書いてよい欄: 書いてよい欄, 人が入れる欄: 人が入れる欄, 計算で出す欄: 計算で出す欄,
    埋めかた: 埋めかた, 値の型: 値の型
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/registry.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/registry.js — 書式カタログの 置き場

   ★ **DocType を 1 個足すのに デプロイが要る作りにしない**（§6.2）。
     いまは 静的ファイル（/data/doctypes/*.json）から読む。
     公開後に D1 / R2 へ移すときは 取りにいく関数を差し替えるだけ。
   ★ 取りにいけないときは **黙って空にしない**。「読めなかった」と言う。
     カタログが 0 個でも、正直なら 使いものになる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var S = function () { return VQW.doctype.schema; };

  var 棚 = Object.create(null);        /* id → DocType */
  var 読んだ = false, 読み中 = null, 読めなかった = null;

  /* 外から差し替えられるようにしておく（D1 / R2 へ移すときの口） */
  var 取りにいく = function () {
    if (!root.fetch) return Promise.resolve([]);
    return root.fetch("/data/doctypes/index.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("index " + r.status); return r.json(); })
      .then(function (j) {
        var 名 = (j && j.doctypes) || [];
        return Promise.all(名.map(function (n) {
          return root.fetch("/data/doctypes/" + n + ".json", { cache: "no-cache" })
            .then(function (r2) { return r2.ok ? r2.json() : null; })
            .catch(function () { return null; });
        }));
      })
      .then(function (a) { return a.filter(Boolean); });
  };

  function 入れる(d) {
    var t = S().そろえる(d);
    var 悪 = S().確かめる(t);
    if (悪.length) return { だめ: t.id + ": " + 悪.join(" / ") };
    棚[t.id] = t;
    return { ok: true, id: t.id };
  }

  function load(o) {
    o = o || {};
    if (読んだ && !o.もう一度) return Promise.resolve(一覧());
    if (読み中) return 読み中;
    読み中 = Promise.resolve()
      .then(function () { return 取りにいく(); })
      .then(function (a) {
        (a || []).forEach(入れる);
        読んだ = true; 読み中 = null; 読めなかった = null;
        return 一覧();
      })
      .catch(function (e) {
        読み中 = null;
        読めなかった = String(e && e.message || e).slice(0, 80);
        return 一覧();
      });
    return 読み中;
  }

  function get(id) { return 棚[String(id)] || null; }
  function 一覧() {
    return Object.keys(棚).map(function (k) {
      return { id: k, displayName: 棚[k].displayName, kind: 棚[k].kind,
               status: 棚[k].status, aliases: 棚[k].aliases };
    });
  }
  function すべて() { return Object.keys(棚).map(function (k) { return 棚[k]; }); }
  function 具合() {
    return { 読んだ: 読んだ, 個数: Object.keys(棚).length, 読めなかった: 読めなかった };
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.registry = {
    load: load, get: get, 一覧: 一覧, すべて: すべて, 入れる: 入れる, 具合: 具合,
    取りにいくを差し替える: function (fn) { if (typeof fn === "function") { 取りにいく = fn; 読んだ = false; } }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/fallback.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/fallback.js — 知らない書類の 扱い

   ★ **「知らない」と言えるようにすることが 最優先**（§6.3）。
     カタログが 5 個でも、正直に言えれば 使える。
     100 個あっても、知らないものを 知っているふりをすれば 信用されない。
   ★ 3 段
       exact … id か 別名に 一致        → ふつうに作る
       near  … parent をたどって 一般形  → **「一般的な○○の形式で作りました。
                                           △△特有の項目は入っていません」と画面に出す**
       none  … 無し                      → **「これは正式な○○の書式ではありません」**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 正規(s) {
    return 文(s).toLowerCase()
      .replace(/[ 　\-_・]/g, "")
      .replace(/[ぁ-ん]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }

  function 探す(名, kind) {
    var R = VQW.doctype.registry;
    var q = 正規(名);
    if (!q) return { match: "none", docType: null, なぜ: "書類の名前が 空です。" };

    var 候 = R.すべて().filter(function (d) { return !kind || d.kind === kind; });

    /* exact — id / displayName / aliases */
    for (var i = 0; i < 候.length; i++) {
      var d = 候[i];
      var 名前 = [d.id, d.displayName].concat(d.aliases || []);
      for (var j = 0; j < 名前.length; j++) {
        if (正規(名前[j]) === q) return { match: "exact", docType: d };
      }
    }
    /* exact — 含む（「給与明細書」で「給与明細」を引く） */
    for (var k = 0; k < 候.length; k++) {
      var d2 = 候[k];
      var 名前2 = [d2.id, d2.displayName].concat(d2.aliases || []);
      for (var m = 0; m < 名前2.length; m++) {
        var s = 正規(名前2[m]);
        if (s.length >= 2 && (q.indexOf(s) >= 0 || s.indexOf(q) >= 0))
          return { match: "exact", docType: d2 };
      }
    }

    /* near — 親をたどって 一般形が あるか。
       言葉の重なりで いちばん近いものを選び、その親（あれば）を使う。 */
    var 得 = null;
    候.forEach(function (d3) {
      var 名前3 = [d3.displayName].concat(d3.aliases || []).map(正規);
      var 点 = 0;
      名前3.forEach(function (s2) {
        for (var x = 0; x < q.length - 1; x++) if (s2.indexOf(q.substr(x, 2)) >= 0) 点++;
      });
      if (点 >= 2 && (!得 || 点 > 得.点)) 得 = { d: d3, 点: 点 };
    });
    if (得) {
      var 親 = 得.d.parent ? VQW.doctype.registry.get(得.d.parent) : null;
      var 使う = 親 || 得.d;
      return {
        match: "near", docType: 使う, 元: 得.d.id,
        画面に出す: "一般的な「" + 使う.displayName + "」の形式で作りました。"
          + "「" + 名 + "」に特有の項目は 入っていません。"
      };
    }

    return {
      match: "none", docType: null,
      画面に出す: "これは 正式な「" + 名 + "」の書式ではありません。"
        + "一般の文書として 作りました。項目や並びは ご自分で確かめてください。",
      つぎ: "正式な書式が要るなら、お手持ちの様式を 取り込んでください（その形を覚えます）。"
    };
  }

  /* 画面と 報告に 必ず出す一言。**黙って near / none にしない。** */
  function ことわり(res) {
    if (!res || res.match === "exact") return "";
    return res.画面に出す || "";
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.fallback = { 探す: 探す, ことわり: ことわり, 正規: 正規 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/exam.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/exam.js — 問題用紙 / 解答用紙 / 解答解説

   ★ **問題は 作らない。**すでにある 問題エンジンの出した 問題 JSON
     （VQ2.qmodel の形）を **並べるだけ**（§6.6）。
     ここで問題を作り直すと、選択肢の数も 正解の有無も 保証が切れ、
     「A. ○○…」が また出る。
   ★ 同じ 1 つの並びから 3 つの紙を出す。別々に作ると 番号がずれる。
   ★ 選択肢の印は 既定で ア・イ・ウ・エ、縦に並べる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 印 = {
    kana: ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク"],
    maru: ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"],
    alpha: ["A", "B", "C", "D", "E", "F", "G", "H"]
  };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }
  function b(type, text, o) {
    var x = { id: VQW.ir.wpId("b"), type: type, text: 文(text) };
    if (o) Object.keys(o).forEach(function (k) { x[k] = o[k]; });
    return x;
  }

  /* 記述の解答欄が いる形式か（選ぶだけの問いには 罫線を引かない） */
  function 書く形式(q) {
    var e = 文(q.engine);
    return ["short_answer", "long_answer", "numeric", "formula", "fill_blank",
            "essay", "proof", "calculation"].indexOf(e) >= 0
      || (!q.choices || !q.choices.length);
  }

  function 行数(q) {
    var e = 文(q.engine);
    if (e === "long_answer" || e === "essay" || e === "proof") return 6;
    if (e === "formula" || e === "calculation") return 4;
    return 1;
  }

  /* ══ 共通の 見出し（試験名・注意・氏名欄）══════════════════════ */
  function 頭(o, 紙) {
    o = o || {};
    var out = [];
    out.push(b("heading1", 文(o.試験名) || "テスト"));
    var 副 = [];
    if (o.学校) 副.push(文(o.学校));
    if (o.科目) 副.push(文(o.科目));
    if (o.実施日) 副.push(文(o.実施日));
    if (o.試験時間) 副.push(文(o.試験時間) + " 分");
    if (o.満点) 副.push("満点 " + 文(o.満点) + " 点");
    if (副.length) out.push(b("paragraph", 副.join("　／　")));

    /* 氏名・クラス・出席番号は **人が書く所**。値を入れない。 */
    ["クラス", "出席番号", "氏名"].forEach(function (k) {
      out.push(b("field", "", { key: k, label: k, dataType: "text",
        hint: k + " を書いてもらう欄です（こちらでは 埋めません）", region: "identity" }));
    });
    if (紙 === "exam" && o.注意) {
      out.push(b("heading3", "注意"));
      配(o.注意).forEach(function (t) { out.push(b("bullet", 文(t))); });
    }
    out.push(b("divider", ""));
    return out;
  }

  /* ══ 問題用紙 ═══════════════════════════════════════════════ */
  function 問題用紙(questions, o) {
    o = o || {};
    var 記 = 印[文(o.選択肢の印) || "kana"] || 印.kana;
    var out = 頭(o, "exam");
    var 解答は別紙 = o.解答は別紙 !== false;

    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      var 配点 = (o.配点を出す !== false && q.points) ? "（" + q.points + " 点）" : "";
      out.push(b("heading3", "問 " + 番 + " " + 配点));
      if (文(q.instruction)) out.push(b("paragraph", 文(q.instruction)));
      if (文(q.context)) out.push(b("quote", 文(q.context)));
      out.push(b("paragraph", 文(q.prompt), { key: "q" + 番 }));

      配(q.choices).forEach(function (c, k) {
        out.push(b("bullet", (記[k] || String(k + 1)) + "．" + 文(c.text)));
      });
      配(q.orderItems).forEach(function (c, k) {
        out.push(b("bullet", (記[k] || String(k + 1)) + "．" + 文(c.text)));
      });

      if (!解答は別紙 && 書く形式(q))
        out.push(b("answerSpace", "", { lines: 行数(q), label: "問 " + 番, region: "answer" }));
    });
    return { blocks: out, page: 紙面(o) };
  }

  /* ══ 解答用紙 ═══════════════════════════════════════════════ */
  function 解答用紙(questions, o) {
    o = o || {};
    var out = 頭(o, "answer");
    out.push(b("heading2", "解答欄"));
    /* 番号は **試験全体の通し番号**（採点と つき合わせやすい） */
    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      var 配点 = q.points ? "（" + q.points + " 点）" : "";
      out.push(b("heading4", "問 " + 番 + " " + 配点));
      out.push(b("answerSpace", "", { lines: 行数(q), label: "問 " + 番, region: "answer" }));
    });
    out.push(b("divider", ""));
    out.push(b("field", "", { key: "得点", label: "得点", dataType: "number",
      hint: "採点する人が 書きます", region: "score" }));
    return { blocks: out, page: 紙面(o) };
  }

  /* ══ 解答解説 ═══════════════════════════════════════════════ */
  function 解答解説(questions, o) {
    o = o || {};
    var 記 = 印[文(o.選択肢の印) || "kana"] || 印.kana;
    var out = 頭(o, "key");
    out.push(b("heading2", "解答と解説"));
    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      out.push(b("heading3", "問 " + 番));
      out.push(b("paragraph", "正解: " + 正解の文(q, 記)));
      if (文(q.explanation)) out.push(b("paragraph", 文(q.explanation)));
      配(q.choices).forEach(function (c, k) {
        if (!文(c.explanation)) return;
        out.push(b("bullet", (記[k] || "") + "．" + 文(c.explanation)));
      });
    });
    return { blocks: out, page: 紙面(o) };
  }

  function 正解の文(q, 記) {
    var 選 = 配(q.choices);
    if (選.length) {
      var 当 = [];
      選.forEach(function (c, k) { if (c.isCorrect) 当.push(記[k] || String(k + 1)); });
      if (当.length) return 当.join("・");
    }
    if (配(q.correctOrder).length) {
      var 表 = {};
      配(q.orderItems).forEach(function (x, k) { 表[x.id] = 記[k] || String(k + 1); });
      return q.correctOrder.map(function (id) { return 表[id] || id; }).join(" → ");
    }
    var a = q.correctAnswer;
    if (Array.isArray(a)) return a.map(文).join("・");
    if (a && typeof a === "object") return JSON.stringify(a).slice(0, 80);
    if (文(a)) return 文(a);
    if (配(q.acceptedAnswers).length) return q.acceptedAnswers.join(" / ");
    return "（この形式は 解答が 別に決まります）";
  }

  function 紙面(o) {
    return { mode: "paper", size: 文(o.用紙 || "a4").toLowerCase(),
             orient: 文(o.向き || "portrait"),
             margin: { t: 20, r: 18, b: 20, l: 18 },
             header: "", footer: "", pageNumber: true };
  }

  /* ══ 3 枚 まとめて ═════════════════════════════════════════ */
  function 三枚(questions, o) {
    var qs = そろえる(questions);
    return {
      exam_paper: 問題用紙(qs, o),
      answer_sheet: 解答用紙(qs, o),
      answer_key: 解答解説(qs, o),
      問題数: qs.length,
      満点: qs.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0)
    };
  }

  /* 問題エンジンの そろえ直しを 通す（あるときだけ）。
     通さないと 選択肢の label や correctAnswer の形が まちまちになる。 */
  function そろえる(questions) {
    var M = root.VQ2 && VQ2.qmodel;
    return 配(questions).map(function (q) {
      if (M && typeof M.normalizeQuestion === "function") {
        try { return M.normalizeQuestion(q); } catch (e) {}
      }
      return q;
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.exam = {
    問題用紙: 問題用紙, 解答用紙: 解答用紙, 解答解説: 解答解説,
    三枚: 三枚, そろえる: そろえる, 正解の文: 正解の文, 印: 印
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/extract.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/extract.js — 手持ちの様式から 書式を起こす

   ★ いちばん値打ちがある道（§6.5）。「うちの請求書と同じ形式で」に
     そのまま答えられる。著作権の心配も無い（本人の書類）。
   ★ いまの取り込み（__vqChatFiles）は **本文の文字しか取らない**。
     xlsx / pptx は そもそも弾いている。ここでは **構造**を読む。
     ZIP を開く所は 取り込み側と 同じやりかた（DecompressionStream）。
   ★ 取り出すのは 「必須項目の並び」と「領域の構成」という **事実**だけ。
     見た目（色・書体・罫線）は 写さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── ZIP（最小限。取り込み側と同じ DecompressionStream を使う）── */
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  function 目次(buf) {
    var d = new Uint8Array(buf), n = d.length, i = n - 22;
    for (; i >= 0; i--) if (u32(d, i) === 0x06054b50) break;
    if (i < 0) throw new Error("ZIP_BROKEN");
    var 件数 = u16(d, i + 10), 始 = u32(d, i + 16), p = 始, 出 = [];
    for (var k = 0; k < 件数 && p + 46 <= n; k++) {
      if (u32(d, p) !== 0x02014b50) break;
      var 方式 = u16(d, p + 10), 圧 = u32(d, p + 20), 生 = u32(d, p + 24);
      var nl = u16(d, p + 28), el = u16(d, p + 30), cl = u16(d, p + 32);
      var lo = u32(d, p + 42);
      var 名 = new TextDecoder("utf-8").decode(d.subarray(p + 46, p + 46 + nl));
      出.push({ name: 名, 方式: 方式, 圧: 圧, 生: 生, lo: lo });
      p += 46 + nl + el + cl;
    }
    return 出;
  }

  function 取り出す(buf, e) {
    var d = new Uint8Array(buf);
    if (u32(d, e.lo) !== 0x04034b50) throw new Error("ZIP_BROKEN");
    var nl = u16(d, e.lo + 26), el = u16(d, e.lo + 28);
    var 始 = e.lo + 30 + nl + el;
    var 生 = d.subarray(始, 始 + e.圧);
    if (e.方式 === 0) return Promise.resolve(new TextDecoder("utf-8").decode(生));
    if (e.方式 !== 8) return Promise.reject(new Error("ZIP_METHOD_UNSUPPORTED"));
    if (typeof root.DecompressionStream !== "function") return Promise.reject(new Error("NO_INFLATE"));
    var s = new Blob([生]).stream().pipeThrough(new root.DecompressionStream("deflate-raw"));
    return new Response(s).arrayBuffer().then(function (a) {
      return new TextDecoder("utf-8").decode(new Uint8Array(a));
    });
  }

  function 探す(並, 名) {
    for (var i = 0; i < 並.length; i++) if (並[i].name === 名) return 並[i];
    return null;
  }

  /* ══ xlsx の 構造 ═══════════════════════════════════════════ */
  function xlsx(buf, o) {
    o = o || {};
    var 並;
    try { 並 = 目次(buf); } catch (e) { return Promise.reject(e); }
    var ss = 探す(並, "xl/sharedStrings.xml");
    var sheet = 探す(並, "xl/worksheets/sheet1.xml");
    if (!sheet) return Promise.reject(new Error("XLSX_NO_SHEET"));
    return Promise.resolve(ss ? 取り出す(buf, ss) : "")
      .then(function (sxml) {
        var 共有 = (sxml.match(/<si[\s>][\s\S]*?<\/si>/g) || []).map(function (si) {
          return (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
            .map(function (t) { return t.replace(/<[^>]+>/g, ""); }).join("");
        }).map(解く);
        return 取り出す(buf, sheet).then(function (xml) { return よむ(xml, 共有, o); });
      });
  }

  function 解く(s) {
    return 文(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  }

  function よむ(xml, 共有, o) {
    var マス = {};
    var re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>|<c r="([A-Z]+\d+)"([^>]*)\/>/g, m;
    while ((m = re.exec(xml)) !== null) {
      var ref = m[1] || m[4], 属 = m[2] || m[5] || "", 中 = m[3] || "";
      var 型 = (属.match(/t="([^"]+)"/) || [])[1] || "n";
      var f = (中.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
      var v = (中.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];
      var t = (中.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      var 値 = "";
      if (型 === "s" && v !== undefined) 値 = 共有[+v] || "";
      else if (型 === "inlineStr") 値 = 解く(t || "");
      else 値 = 解く(v || "");
      if (f || 文(値)) マス[ref] = { v: 文(値), f: f ? "=" + 解く(f) : undefined };
    }
    return 形にする(マス, o);
  }

  /* ══ マスの並び → DocType の たね ═══════════════════════════
     ・**値が入っている所**は「人が入れる欄」（その人の実データなので 写さない）
     ・**式が入っている所**は「計算で出す欄」（式は そのまま覚える）
     ・見出しらしい所（値の左か上にある文字）は 欄の名前 */
  function 形にする(マス, o) {
    o = o || {};
    var F = VQW.validate.formula;
    var 欄 = [], 計算 = [], 見た = {};

    function 割(ref) {
      var m = ref.match(/^([A-Z]+)(\d+)$/);
      return m ? { c: F.列番(m[1]), r: +m[2] } : null;
    }
    function 名前(ref) {
      var p = 割(ref); if (!p) return "";
      var 左 = p.c > 1 ? F.列名(p.c - 1) + p.r : null;
      var 上 = p.r > 1 ? F.列名(p.c) + (p.r - 1) : null;
      var 候 = [左, 上].filter(Boolean);
      for (var i = 0; i < 候.length; i++) {
        var c = マス[候[i]];
        if (c && !c.f && 文(c.v) && !/^-?[\d,.]+$/.test(文(c.v))) return 文(c.v).replace(/[：:]\s*$/, "");
      }
      return "";
    }

    Object.keys(マス).forEach(function (ref) {
      var c = マス[ref];
      if (c.f) 計算.push({ target: ref, formula: c.f, label: 名前(ref) });
    });

    /* ★ 「見出し」と「値」を 取り違えないための 2 段構え。
       1 段目で 行の いちばん左を 見出しとみなし、その右（または下）を
       **値のマス**として 使い済みにする。使い済みを 見出しにしない。
       これをやらないと、値そのもの（「株式会社ほんもの」）が
       欄の名前として 書式に 焼き付く（実測で 落ちた）。 */
    var 使い済み = Object.create(null);
    var 行ごと = {};
    Object.keys(マス).forEach(function (ref) {
      var p = 割(ref); if (!p) return;
      (行ごと[p.r] = 行ごと[p.r] || []).push({ ref: ref, c: p.c });
    });
    var 行番 = Object.keys(行ごと).map(Number).sort(function (a, b) { return a - b; });

    行番.forEach(function (r) {
      var 並び = 行ごと[r].sort(function (a, b) { return a.c - b.c; });
      var 左 = 並び[0];
      if (!左) return;
      var c = マス[左.ref];
      if (!c || c.f) return;
      var v = 文(c.v).trim();
      if (!v || 使い済み[左.ref]) return;
      if (/^-?[\d,.]+$/.test(v)) return;                 /* 値そのもの */

      var p = 割(左.ref);
      var 右ref = F.列名(p.c + 1) + p.r, 下ref = F.列名(p.c) + (p.r + 1);
      var 右 = マス[右ref], 下 = マス[下ref];

      /* 表の見出し行は 欄にしない。
         見分けかた: **その行に 3 つ以上** 中身があり、**すぐ下の行にも 3 つ以上**ある。
         「宛名 / 株式会社◯◯」のような 2 つ組は 見出し行ではない
         （ここを 2 つで切ると 宛名も 拾えなくなる。実測で 落ちた）。 */
      var この行 = 並び.length;
      var 下の行 = (行ごと[p.r + 1] || []).length;
      if (この行 >= 3 && 下の行 >= 3) return;

      var 値のref = (右 && (右.f || 文(右.v))) ? 右ref
                  : (下 && (下.f || 文(下.v))) ? 下ref : null;
      if (!値のref) return;
      使い済み[値のref] = 1;

      var key = v.replace(/[：:\s]/g, "").slice(0, 24);
      if (!key || 見た[key]) return;
      見た[key] = 1;
      var 値のマス = マス[値のref];
      欄.push({
        key: key, label: v.replace(/[：:]\s*$/, ""),
        dataType: 型を見る(値のマス && !値のマス.f ? 値のマス.v : ""),
        /* ★ **人の実データは 写さない。**空欄＋ヒントにする。 */
        fillPolicy: "user_input",
        hint: v.replace(/[：:]\s*$/, "") + " を入れる所です",
        at: 左.ref
      });
    });

    return VQW.doctype.schema.そろえる({
      id: 文(o.id) || "user_" + VQW.ir.wpId("dt"),
      kind: "sheets",
      displayName: 文(o.displayName) || "取り込んだ様式",
      aliases: o.aliases || [],
      parent: null,
      requiredFields: 欄,
      optionalFields: [],
      regions: [{ id: "body", label: "", showLabel: false,
                  fields: 欄.map(function (f) { return f.key; }), at: "A1" }],
      calculations: 計算,
      validations: [],
      source: { kind: "user_upload", ref: 文(o.ファイル名), checkedAt: 今日() },
      status: "draft"                      /* ★ 人が見て 承認するまで draft */
    });
  }

  function 型を見る(v) {
    var s = 文(v).trim();
    if (/^-?[\d,]+(\.\d+)?$/.test(s)) return "number";
    if (/^-?[\d,]+(\.\d+)?\s*[%％]$/.test(s)) return "percent";
    if (/^\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/.test(s)) return "date";
    if (/^[¥￥$]|円$/.test(s)) return "money";
    return "text";
  }
  function 今日() {
    try { return new Date().toISOString().slice(0, 10); } catch (e) { return ""; }
  }

  /* ══ docx の 構造（見出しの並びだけ）═══════════════════════ */
  function docx(buf, o) {
    o = o || {};
    var 並;
    try { 並 = 目次(buf); } catch (e) { return Promise.reject(e); }
    var t = 探す(並, "word/document.xml");
    if (!t) return Promise.reject(new Error("DOCX_NO_BODY"));
    return 取り出す(buf, t).then(function (xml) {
      var 段 = xml.split(/<w:p[ >]/).slice(1);
      var 欄 = [], 領域 = [], 見た = {};
      段.forEach(function (seg) {
        var 見出し = /w:val="Heading(\d)"/.test(seg);
        var txt = 解く((seg.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
          .map(function (m) { return m.replace(/<[^>]+>/g, ""); }).join(""));
        if (!txt.trim()) return;
        if (見出し) {
          領域.push({ id: "r" + (領域.length + 1), label: txt, fields: [] });
          return;
        }
        /* 「氏名：______」のような 記入欄の形 */
        var m2 = txt.match(/^(.{1,16}?)\s*[：:]\s*[_＿\s]{2,}$/);
        if (m2) {
          var key = m2[1].replace(/\s/g, "");
          if (見た[key]) return;
          見た[key] = 1;
          欄.push({ key: key, label: m2[1], dataType: "text",
                    fillPolicy: "user_input", hint: m2[1] + " を書く所です" });
          if (領域.length) 領域[領域.length - 1].fields.push(key);
        }
      });
      return VQW.doctype.schema.そろえる({
        id: 文(o.id) || "user_" + VQW.ir.wpId("dt"),
        kind: "docs",
        displayName: 文(o.displayName) || "取り込んだ様式",
        requiredFields: 欄, optionalFields: [],
        regions: 領域.length ? 領域 : [{ id: "body", label: "", showLabel: false, fields: [] }],
        calculations: [], validations: [],
        source: { kind: "user_upload", ref: 文(o.ファイル名), checkedAt: 今日() },
        status: "draft"
      });
    });
  }

  function 取り込む(file, o) {
    o = o || {};
    var 名 = 文(file && file.name).toLowerCase();
    var 拡 = (名.match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (["xlsx", "xlsm", "docx"].indexOf(拡) < 0)
      return Promise.reject(new Error("この形式からは 様式を 起こせません（" + (拡 || "不明") + "）"));
    return file.arrayBuffer().then(function (buf) {
      var opt = { ファイル名: file.name, displayName: o.displayName || file.name.replace(/\.[^.]+$/, ""),
                  id: o.id, aliases: o.aliases };
      return 拡 === "docx" ? docx(buf, opt) : xlsx(buf, opt);
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.extract = { 取り込む: 取り込む, xlsx: xlsx, docx: docx,
                          目次: 目次, 形にする: 形にする, 型を見る: 型を見る };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/doctype/generate.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/doctype/generate.js — 書式を 自動で 起こす（**構築時**に走らせる）

   ★ 実行時に 走らせない。頼まれたその場で 法令を引いて 様式を作ると、
     待たされるうえ、内容が 毎回 変わる。
   ★ 出てくるのは 必ず status:"draft"。**人が見て approved にするまで、
     画面に「未承認の書式です」と出す。**
   ★ 取り出すのは「必須項目の並び」と「領域の構成」という **事実**だけ。
     既存の様式の デザインそのものを 複製しない。
   ★ 調べものは アプリの口（/api/research/search・/api/research/read）を
     そのまま使う。ここに 新しい取りに行き方を 作らない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* 「〜に掲げる事項を記載しなければならない」を 探すための 言いかた */
  var 引きかた = [
    "{名前} 記載事項 法令",
    "{名前} 記載しなければならない 事項",
    "{名前} 様式 記載例 厚生労働省 OR 国税庁 OR 総務省"
  ];

  /* 条文から 項目を 拾う。番号つきの並びだけを 取る（文章は取らない）。 */
  function 項目を拾う(本文) {
    var s = 文(本文);
    var 出 = [];
    var re = /(?:^|\n)\s*(?:[一二三四五六七八九十]{1,3}|[０-９0-9]{1,2})\s*[　\.、）\)]\s*([^\n]{2,40})/g, m;
    while ((m = re.exec(s)) !== null) {
      var t = m[1].replace(/[（(][^）)]*[）)]/g, "").trim();
      if (t && 出.indexOf(t) < 0) 出.push(t);
      if (出.length >= 40) break;
    }
    return 出;
  }

  /* 項目の名前から 埋めかたを 決める。
     **迷ったら user_input。**捏造するくらいなら 空欄のほうがよい。 */
  var 人が入れる語 = ["氏名", "名称", "住所", "所在", "番号", "日", "年月", "金額", "額",
                      "料", "率", "時間", "日数", "個数", "数量", "口座", "印", "署名"];
  var 書いてよい語 = ["説明", "注意", "備考", "件名", "表題", "目的", "概要", "案内"];
  function 埋めかた(名) {
    var s = 文(名);
    for (var i = 0; i < 人が入れる語.length; i++) if (s.indexOf(人が入れる語[i]) >= 0) return "user_input";
    for (var j = 0; j < 書いてよい語.length; j++) if (s.indexOf(書いてよい語[j]) >= 0) return "llm_allowed";
    return "user_input";
  }
  function 型(名) {
    var s = 文(名);
    if (/金額|額|料|給|税|円/.test(s)) return "money";
    if (/年月日|日付|期間|日$/.test(s)) return "date";
    if (/率|割合|％|%/.test(s)) return "percent";
    if (/数|回数|時間|人数|番号/.test(s)) return "number";
    return "text";
  }

  /* ══ 通し（調べる → 起こす）═══════════════════════════════════
     o = { 名前, kind, 調べる(質問)->Promise<[{title,url,snippet}]>,
           読む(url)->Promise<{text}> } */
  function 起こす(o) {
    o = o || {};
    var 名 = 文(o.名前);
    if (!名) return Promise.reject(new Error("書類の名前がありません"));
    var 調 = typeof o.調べる === "function" ? o.調べる : null;
    var 読 = typeof o.読む === "function" ? o.読む : null;
    if (!調 || !読) return Promise.resolve(たね(名, o.kind, [], []));

    var 質問 = 引きかた.map(function (t) { return t.replace("{名前}", 名); });
    return Promise.all(質問.map(function (q) {
      return Promise.resolve(調(q)).catch(function () { return []; });
    })).then(function (結) {
      var url = [], 見 = {};
      結.forEach(function (a) {
        配(a).slice(0, 3).forEach(function (r) {
          var u = 文(r && r.url);
          if (u && !見[u]) { 見[u] = 1; url.push({ url: u, title: 文(r.title) }); }
        });
      });
      return Promise.all(url.slice(0, 5).map(function (x) {
        return Promise.resolve(読(x.url))
          .then(function (r) { return { url: x.url, title: x.title, text: 文(r && r.text) }; })
          .catch(function () { return null; });
      }));
    }).then(function (本) {
      var 元 = (本 || []).filter(Boolean);
      var 項 = [];
      元.forEach(function (p) {
        項目を拾う(p.text).forEach(function (t) { if (項.indexOf(t) < 0) 項.push(t); });
      });
      return たね(名, o.kind, 項, 元);
    });
  }

  function たね(名, kind, 項, 元) {
    var 欄 = 項.map(function (t) {
      return { key: t.replace(/[\s：:]/g, "").slice(0, 24), label: t,
               dataType: 型(t), fillPolicy: 埋めかた(t),
               hint: 埋めかた(t) === "user_input" ? t + " を書く所です" : undefined };
    });
    return VQW.doctype.schema.そろえる({
      id: "gen_" + VQW.doctype.fallback.正規(名).slice(0, 24),
      kind: 文(kind) || "docs",
      displayName: 名,
      aliases: [名],
      requiredFields: 欄,
      optionalFields: [],
      regions: [{ id: "body", label: "", showLabel: false,
                  fields: 欄.map(function (f) { return f.key; }) }],
      calculations: [],
      validations: [{ rule: "noPlaceholder", severity: "error" }],
      source: {
        kind: 元 && 元.length ? "law" : "manual",
        ref: (元 || []).map(function (p) { return p.url; }).slice(0, 5).join(" / "),
        checkedAt: (function () { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ""; } })()
      },
      status: "draft"                       /* ★ 必ず draft。人が承認する。 */
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.generate = { 起こす: 起こす, 項目を拾う: 項目を拾う,
                           埋めかた: 埋めかた, 型: 型, たね: たね };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/pipeline/repair.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/repair.js — 崩れを **計算で** 直す

   ★ 直しかたは 決めうち。AI に「直して」と頼まない（頼むと 別の所が壊れる）。
   ★ 直せないものは 直せないと言う。**でっち上げて埋めない。**
     とくに 値が要る所（金額・氏名・番号）は、直しかたが「空欄に戻す」しかない。
   ★ 同じ節点は 2 回まで。3 周やって残ったら 「要確認」の印をつけて 出す
     （止まり続けるより、印をつけて出す）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── 1 つの崩れに対する 直しかた ─────────────────────────────
     返りは 操作の並び（ops）。空なら 直せない。 */
  function 手だて(kind, content, doc, e, dt) {
    var ops = [];
    var n = e.nodeId ? VQW.ir.find(doc.root, e.nodeId) : null;

    if (e.code === "colTooNarrow" && e.直しかた && e.直しかた.種 === "colW") {
      var sh = VQW.ir.find(doc.root, e.直しかた.sheetId);
      if (!sh) return ops;
      var colW = {};
      Object.keys((sh.attrs || {}).colW || {}).forEach(function (k) { colW[k] = (sh.attrs.colW)[k]; });
      colW[e.直しかた.列] = e.直しかた.幅;
      ops.push({ op: "setAttrs", nodeId: sh.id, attrs: { colW: colW } });
      return ops;
    }

    if (e.code === "numberAsText" && n) {
      var t = 文(n.text).trim();
      var 数 = t.replace(/,/g, "").replace(
        /(円|¥|＄|\$|%|％|人|名|個|点|冊|枚|件|回|台|本|kg|g|t|m|km|cm|mm|時間|分|秒|日|ヶ月|か月)$/, "").trim();
      if (/^-?\d+(\.\d+)?$/.test(数)) {
        ops.push({ op: "setText", nodeId: n.id, text: 数 });
        return ops;
      }
      return ops;                        /* 数にできないものは 触らない */
    }

    if (e.code === "mathShouldBeBlock" && n && kind === "docs") {
      var s = VQW.ir.素(n.text).trim().replace(/^\$\$?|\$\$?$/g, "").trim();
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { latex: s } });
      return ops;
    }

    if (e.code === "emptyHeading" && n) {
      ops.push({ op: "deleteNode", nodeId: n.id });
      return ops;
    }

    if (e.code === "tableRagged" && n && n.type === "table") {
      var 列 = 0;
      (n.children || []).forEach(function (r) { 列 = Math.max(列, (r.children || []).length); });
      (n.children || []).forEach(function (r) {
        var 今 = (r.children || []).map(function (c) { return { text: 文(c.text) }; });
        while (今.length < 列) 今.push({ text: "" });
        ops.push({ op: "replaceNode", nodeId: r.id,
                   node: { type: "tableRow", children: 今 } });
      });
      return ops;
    }

    if (e.code === "fabricated" && n) {
      /* **でっち上げた値は 消す。**空欄に戻すのが 正しい直しかた。 */
      ops.push({ op: "setText", nodeId: n.id, text: "" });
      return ops;
    }

    if (e.code === "calcNotFormula" && dt) {
      var 対 = null;
      (dt.calculations || []).forEach(function (c) {
        if (e.なに.indexOf(文(c.target || c.key)) >= 0) 対 = c;
      });
      if (対) {
        var sh2 = null;
        VQW.ir.walk(doc.root, function (x) { if (!sh2 && x.type === "sheet") sh2 = x; });
        if (sh2) {
          var ref = 文(対.target || 対.key).toUpperCase();
          var id = VQW.ir.cellId(sh2.id, ref);
          var ある = VQW.ir.find(doc.root, id);
          if (ある) ops.push({ op: "setFormula", nodeId: id, formula: 文(対.formula) });
          else ops.push({ op: "insertNode", parentId: sh2.id,
                          node: { type: "formulaCell", attrs: { ref: ref, formula: 文(対.formula) } } });
        }
      }
      return ops;
    }

    if (e.code === "fieldMissing" && dt && kind === "docs") {
      var 欄 = null;
      (dt.requiredFields || []).forEach(function (f) {
        if (e.なに.indexOf(f.label || f.key) >= 0) 欄 = f;
      });
      if (欄 && 欄.fillPolicy === "user_input") {
        ops.push({ op: "insertNode", parentId: "root",
          node: { type: "field", attrs: { key: 欄.key, label: 欄.label,
                  dataType: 欄.dataType, hint: 欄.hint || ("ここに " + 欄.label + " を書いてください") },
                  text: "" } });
      }
      return ops;
    }

    if (e.code === "answerSpaceZero" && n) {
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { lines: 3 } });
      return ops;
    }

    if (e.code === "imageWide" && n) {
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { width: 100 } });
      return ops;
    }

    return ops;
  }

  /* ★ 同じ節点の setAttrs を **1 つに合わせる**。
     合わせないと、列 A の幅を直す操作と 列 D の幅を直す操作が
     どちらも 直す前の colW から 作られ、あとの 1 つが 前の 1 つを
     打ち消す（実測: 1 列しか 直らなかった）。 */
  function まとめる(ops) {
    var 出 = [], 表 = Object.create(null);
    (ops || []).forEach(function (op) {
      if (op.op !== "setAttrs") { 出.push(op); return; }
      var k = "setAttrs:" + op.nodeId;
      if (!表[k]) { 表[k] = { op: "setAttrs", nodeId: op.nodeId, attrs: {} }; 出.push(表[k]); }
      Object.keys(op.attrs || {}).forEach(function (a) {
        var 前 = 表[k].attrs[a], 後 = op.attrs[a];
        if (前 && 後 && typeof 前 === "object" && typeof 後 === "object" && !Array.isArray(後)) {
          Object.keys(後).forEach(function (x) { 前[x] = 後[x]; });
        } else 表[k].attrs[a] = 後;
      });
    });
    return 出;
  }

  /* ══ 直す（最大 3 周・同じ節点は 2 回まで）═══════════════════════ */
  function repair(kind, content, o) {
    o = o || {};
    var dt = o.docType || null;
    var 回数 = Object.create(null);
    var 周 = 0, 直した = [], 残り = [];

    while (周 < 3) {
      周++;
      var doc = VQW.ir.toIR(kind, content, { docType: dt && dt.id });
      var 検 = VQW.validate.run(kind, content, { docType: dt });
      if (!検.errors.length) { 残り = []; break; }

      var ops = [], 今回 = 0;
      検.errors.forEach(function (e) {
        var k = 文(e.nodeId) + ":" + e.code;
        if ((回数[k] || 0) >= 2) return;
        var t = 手だて(kind, content, doc, e, dt);
        if (!t.length) return;
        回数[k] = (回数[k] || 0) + 1;
        ops = ops.concat(t);
        直した.push({ code: e.code, どこ: e.どこ, nodeId: e.nodeId });
        今回++;
      });
      if (!今回) { 残り = 検.errors; break; }
      ops = まとめる(ops);

      var r = VQW.ops.guard({
        kind: kind, content: content, docType: dt, 検証する: false,
        request: { baseVersion: VQW.ops.版(content), intent: "崩れを直す", operations: ops }
      });
      if (r.status === "rejected") { 残り = 検.errors; break; }
      残り = VQW.validate.run(kind, content, { docType: dt }).errors;
      if (!残り.length) break;
    }

    /* 残ったものには 「要確認」の印をつける（止まり続けない） */
    if (残り.length) {
      content.__work = content.__work || {};
      content.__work.要確認 = 残り.slice(0, 20).map(function (e) {
        return { nodeId: e.nodeId, code: e.code, なに: e.なに };
      });
    } else if (content.__work) {
      delete content.__work.要確認;
    }

    return { 周: 周, 直した: 直した, 残り: 残り,
             要確認: 残り.length ? 残り.length : 0 };
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.repair = repair;
  VQW.pipeline.手だて
    = 手だて;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/pipeline/edit.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/edit.js — 直しの 一本道

   [1] セレクタ解決 … none / multiple なら **聞いて 終わり**（何もしない）
   [2] 操作を作る   … LLM が出してよいのは ここまで
   [3] Guard        … 宣言と 実測の突き合わせ
   [4] 検証         … 純粋関数
   [5] 直す / 戻す
   [6] 報告         … テンプレート（LLM を通さない）

   ★ 入口で 1 つでも 引っかかったら **その場で止まる**。
     「とりあえず近い所を直しておく」を できない作りにする。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* o = { kind, content, selector, selection, 作る(nodeIds, doc) -> ops,
          docType, intent, 何をしたい, 直す(bool) } */
  function edit(o) {
    o = o || {};
    var kind = 文(o.kind), content = o.content;
    if (!content) return 断り("いま開いている書類がありません。");

    var doc = VQW.ir.toIR(kind, content, { docType: o.docType && o.docType.id });

    /* [1] どこ */
    var ids = null;
    if (o.nodeIds && o.nodeIds.length) ids = o.nodeIds.slice();
    else if (o.selector) {
      var res = VQW.selector.resolve(doc, o.selector, o.selection);
      if (res.kind !== "unique") {
        if (res.kind === "multiple" && o.全部に当てる) ids = res.nodeIds.slice();
        else {
          var 聞 = VQW.selector.聞く(res, { 何をしたい: o.何をしたい });
          聞.完成と言ってよい = false;
          return 聞;
        }
      } else ids = [res.nodeId];
    } else return 断り("どこを直すか 指定されていません。");

    /* [2] 操作 */
    var ops = typeof o.作る === "function" ? (o.作る(ids, doc) || []) : (o.operations || []);
    if (!ops.length) return 断り("直す中身がありません。");

    /* [3][4][5] */
    var rep = VQW.ops.guard({
      kind: kind, content: content, docType: o.docType,
      errorで戻す: !!o.errorで戻す,
      request: { baseVersion: o.baseVersion || VQW.ops.版(content),
                 intent: o.intent, operations: ops }
    });
    if (rep.status !== "rejected" && o.直す !== false && VQW.pipeline.repair) {
      var r2 = VQW.pipeline.repair(kind, content, { docType: o.docType });
      rep.validation = VQW.validate.run(kind, content, { docType: o.docType });
      rep.直した = r2.直した;
    }

    /* [6] */
    return VQW.report.道具の返り(rep, o);
  }

  function 断り(なぜ) {
    return { だめ: なぜ + " **何もしていません。**", 完成と言ってよい: false,
             つぎ: "できたと言わないでください。" };
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.edit = edit;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/pipeline/generate.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/generate.js — 作るときの 一本道

   [1] 何を作るか   … 答えで 出来上がりが 大きく変わることだけ 聞く
   [2] DocType 解決 … exact / near / none。**near と none は 画面に出す**
   [3] 骨組み       … LLM（regions の並び）
   [4] 中身         … LLM。**ただし fillPolicy が llm_allowed の欄だけ**
                      user_input は **空欄（記入欄）** として置く
   [5] 組み立て     … 計算だけ。ID を発行する
   [6] 位置決め     … 計算だけ（番地・列幅）
   [7] 検証         … 計算だけ
   [8] 直す         … 崩れた所だけ
   [9] 報告         … テンプレート

   ★ LLM が 触れるのは [3][4] だけ。番地も 幅も 色も 出させない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* ══ LLM への頼みかた（§10）══════════════════════════════════════
     ・JSON だけ返させる
     ・**書いてよい欄だけ** 並べて渡す
     ・user_input の欄は 名前も渡すが「**値を書くな**」と はっきり言う */
  function プロンプト(dt, 頼み, o) {
    o = o || {};
    var よい = VQW.doctype.schema.書いてよい欄(dt);
    var 人 = VQW.doctype.schema.人が入れる欄(dt);
    var 計 = VQW.doctype.schema.計算で出す欄(dt);
    var 行 = [];
    行.push("あなたは 日本語の書類づくりの担当です。**JSON だけ**を返します。");
    行.push("前置き・言い訳・``` は 書きません。");
    行.push("");
    行.push("書式: " + dt.displayName + "（" + dt.id + "）");
    行.push("");
    行.push("次の形の JSON を返してください:");
    行.push('{"fields":{"欄の名前":"中身", ...},"sections":[{"id":"…","items":["…"]}]}');
    行.push("");
    if (よい.length) {
      行.push("★ **あなたが書いてよい欄は これだけです**:");
      よい.forEach(function (f) {
        行.push("　・" + f.key + "（" + f.label + "）"
          + (f.note ? " … " + f.note : "")
          + (o.文字数 && o.文字数[f.key] ? " … " + o.文字数[f.key] + " 字以内" : ""));
      });
    }
    if (人.length) {
      行.push("");
      行.push("★ **次の欄には 値を入れてはいけません。**");
      行.push("　こちらは 人が自分で書く所です。それらしい数字や名前を作ると、");
      行.push("　そのまま提出されて 事故になります。**空のままにしてください。**");
      人.forEach(function (f) { 行.push("　・" + f.key + "（" + f.label + "）"); });
    }
    if (計.length) {
      行.push("");
      行.push("★ 次の欄は **計算で出します**。値を書かないでください。");
      計.forEach(function (f) { 行.push("　・" + f.key + "（" + f.label + "）"); });
    }
    行.push("");
    行.push("★ 「○○」「△△」「（ここに記入）」のような 埋めていない印は 書かないでください。");
    行.push("　書くところが 決まらないなら、その欄を 省いてください。");
    行.push("");
    行.push("頼まれた内容: " + 文(頼み));
    return 行.join("\n");
  }

  /* ══ 組み立て（計算だけ）═══════════════════════════════════════ */
  function 空の中身(kind) {
    if (kind === "docs") return { blocks: [], page: null };
    if (kind === "sheets") return { sheets: [{ id: VQW.ir.wpId("sh"), name: "シート1",
      rows: 60, cols: 20, cells: {}, colW: {}, rowH: {}, merges: [],
      freeze: { rows: 0, cols: 0 }, hidden: false, color: "",
      filters: null, conditionals: [] }], charts: [], activeSheet: 0 };
    if (kind === "slides") return { ratio: "16:9", theme: "minimal", slides: [],
      transition: { type: "fade", speed: 300 } };
    return {};
  }

  function 欄を引く(dt, key) {
    var 全 = (dt.requiredFields || []).concat(dt.optionalFields || []);
    for (var i = 0; i < 全.length; i++) if (全[i].key === key) return 全[i];
    return null;
  }

  /* Docs: regions の並びどおりに ブロックを積む */
  function docs組み立て(dt, 値, o) {
    o = o || {};
    var c = 空の中身("docs");
    if (dt.printSpec) {
      var p = dt.printSpec;
      c.page = { mode: "paper", size: 文(p.paper || "A4").toLowerCase(),
                 orient: 文(p.orientation || "portrait"),
                 margin: { t: (p.margins || {}).top || 20, r: (p.margins || {}).right || 18,
                           b: (p.margins || {}).bottom || 20, l: (p.margins || {}).left || 18 },
                 header: "", footer: "", pageNumber: !!p.pageNumber };
    }
    var 出す = function (b) { c.blocks.push(b); };

    配(dt.regions).forEach(function (rg) {
      if (rg.label && rg.showLabel !== false)
        出す({ id: VQW.ir.wpId("b"), type: 文(rg.headingType) || "heading2",
               text: 文(rg.label), region: 文(rg.id) });

      配(rg.fields).forEach(function (key) {
        var f = 欄を引く(dt, key);
        if (!f) return;
        if (f.fillPolicy === "user_input") {
          出す({ id: VQW.ir.wpId("b"), type: "field", text: "",
                 key: f.key, label: f.label, dataType: f.dataType,
                 hint: f.hint || ("ここに " + f.label + " を書いてください"),
                 region: 文(rg.id) });
          return;
        }
        var v = 値 && 値.fields ? 値.fields[key] : "";
        if (Array.isArray(v)) {
          v.forEach(function (x) {
            出す({ id: VQW.ir.wpId("b"), type: 文(rg.itemType) || "bullet",
                   text: 文(x), key: f.key, region: 文(rg.id) });
          });
        } else if (文(v)) {
          出す({ id: VQW.ir.wpId("b"), type: 文(rg.itemType) || "paragraph",
                 text: 文(v), key: f.key, region: 文(rg.id) });
        }
      });

      if (rg.kind === "answer") {
        出す({ id: VQW.ir.wpId("b"), type: "answerSpace", text: "",
               lines: Number(rg.lines) || 3, label: 文(rg.label), region: 文(rg.id) });
      }
      if (rg.kind === "divider") 出す({ id: VQW.ir.wpId("b"), type: "divider", text: "" });
    });

    if (!c.blocks.length) c.blocks.push({ id: VQW.ir.wpId("b"), type: "paragraph", text: "" });
    return c;
  }

  /* Sheets: regions の at（A1）から 順に置く。式は calculations から。 */
  function sheets組み立て(dt, 値) {
    var c = 空の中身("sheets");
    var sh = c.sheets[0];
    var F = VQW.validate.formula;

    配(dt.regions).forEach(function (rg) {
      var at = 文(rg.at || "A1").toUpperCase().match(/^([A-Z]+)(\d+)$/);
      if (!at) return;
      var c0 = F.列番(at[1]), r0 = +at[2];
      配(rg.fields).forEach(function (key, i) {
        var f = 欄を引く(dt, key);
        if (!f) return;
        var 縦 = rg.direction !== "row";
        var 見出し = F.列名(c0) + (r0 + (縦 ? i : 0));
        var 値の所 = F.列名(c0 + (縦 ? 1 : i)) + (r0 + (縦 ? i : 1));
        sh.cells[見出し] = { v: f.label };
        if (f.fillPolicy === "user_input") {
          sh.cells[値の所] = { v: "", h: f.hint || ("ここに " + f.label + " を入れます") };
        } else if (f.fillPolicy === "llm_allowed") {
          var v = 値 && 値.fields ? 値.fields[key] : "";
          if (文(v)) sh.cells[値の所] = { v: 文(v) };
        }
        if (f.dataType && sh.cells[値の所]) sh.cells[値の所].t = f.dataType;
      });
    });

    配(dt.calculations).forEach(function (cl) {
      var ref = 文(cl.target || cl.key).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref)) return;
      var f = 文(cl.formula);
      if (f && f.charAt(0) !== "=") f = "=" + f;
      sh.cells[ref] = { f: f };
      if (cl.label) {
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        var 左 = F.列番(m[1]) - 1;
        if (左 >= 0) sh.cells[F.列名(左) + m[2]] = { v: 文(cl.label) };
      }
    });
    return c;
  }

  /* ══ 通し ═════════════════════════════════════════════════════
     o = { kind, 頼み, docTypeName, 聞く(prompt)->Promise<JSON> } */
  function generate(o) {
    o = o || {};
    var kind = 文(o.kind) || "docs";
    return Promise.resolve(VQW.doctype.registry.load()).then(function () {
      var 見 = VQW.doctype.fallback.探す(文(o.docTypeName || o.頼み), kind);
      if (見.match === "none" || !見.docType) {
        return { 状態: "書式なし", match: "none",
                 ことわり: 見.画面に出す, つぎ: 見.つぎ,
                 完成と言ってよい: false };
      }
      var dt = 見.docType;
      var p = プロンプト(dt, o.頼み, o);
      var 聞く = typeof o.聞く === "function" ? o.聞く : function () { return Promise.resolve({ fields: {} }); };
      return Promise.resolve(聞く(p)).then(function (値) {
        /* ★ **user_input の欄に LLM が値を入れてきたら 捨てる。** */
        var 捨てた = [];
        if (値 && 値.fields) {
          VQW.doctype.schema.人が入れる欄(dt).forEach(function (f) {
            if (文(値.fields[f.key])) { 捨てた.push(f.key); delete 値.fields[f.key]; }
          });
        }
        var content = kind === "sheets" ? sheets組み立て(dt, 値) : docs組み立て(dt, 値, o);
        content.__work = { version: 1, locks: [], docType: dt.id, docTypeMatch: 見.match };

        var 直 = VQW.pipeline.repair(kind, content, { docType: dt });
        var 検 = VQW.validate.run(kind, content, { docType: dt });
        var rep = {
          status: 検.errors.length ? "partial" : "applied",
          version: { from: 0, to: 1 },
          applied: [{ nodeId: "root", path: dt.displayName, before: "", after: "作りました" }],
          skipped: [], validation: 検,
          ことわり: VQW.doctype.fallback.ことわり(見)
        };
        var 出 = VQW.report.道具の返り(rep, o);
        出.content = content;
        出.docType = dt.id;
        出.match = 見.match;
        出.直した = 直.直した.length;
        if (捨てた.length) {
          出.入れなかった欄 = 捨てた;
          出.なぜ入れなかったか = "この欄は 人が自分で書く所です。"
            + "こちらで それらしい値を作ると そのまま提出されるので、空欄にしました。";
        }
        return 出;
      });
    });
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.generate = generate;
  VQW.pipeline.プロンプト = プロンプト;
  VQW.pipeline.docs組み立て = docs組み立て;
  VQW.pipeline.sheets組み立て = sheets組み立て;
  VQW.pipeline.空の中身 = 空の中身;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/math/parse.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/math/parse.js — 本文から 数式を **抜き出して 別の箱へ移す**

   ★ なぜ要るか（実測）
     Quick Mock の紙面（pdf/renderer.js）には LaTeX を扱う所が 1 つも無い。
     だから「$x^2 + 5x + 6$」は **そのままの文字**として紙に出ていた。
     生成のときに「数式は分けて出して」と頼んでも、LLM は必ず漏らす。
     **受け取り側で 必ず通す。**ここが その関所。

   ★ やること
     本文の $…$ / $$…$$ / \(…\) / \[…\] / \begin{…}…\end{…} を見つけ、
     **math ノードの表**へ移し、本文には **見えない参照記号**だけを残す。
     移したあとの本文に $ \( \[ が 1 文字でも残っていたら 崩れ（error）。

   ★ 参照記号は 私用領域（U+E000 / U+E001）。人が打てる字ではないので、
     利用者の書いた文と ぶつからない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  /* 私用領域。**文字を直に書かない**（編集器やコピペで 黙って消える）。 */
  var 開 = String.fromCharCode(0xE000);
  var 閉 = String.fromCharCode(0xE001);
  var ドル避け = String.fromCharCode(0xE002);   /* \$ を いったん逃がす */

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 数式らしい環境。ここに無い環境名は 本文の一部として扱う
     （\begin{itemize} のような 文章の環境まで 数式にしない）。 */
  var 数式の環境 = ["equation", "equation*", "align", "align*", "alignat", "alignat*",
    "gather", "gather*", "multline", "multline*", "cases", "dcases",
    "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix",
    "smallmatrix", "array", "aligned", "gathered", "split", "eqnarray", "eqnarray*"];

  /* ══ 抜き出し ═════════════════════════════════════════════════
     text … 本文（HTML ではなく 素の文字列）
     表   … { id: {latex, display} } を 足していく入れ物
     戻り … 参照記号に置き換わった 本文 */
  function 抜く(text, 表, 種) {
    var s = 文(text);
    if (!s) return s;
    表 = 表 || {};
    var 番 = 0;
    function 次のid() {
      番++;
      return (種 || "m") + "_" + (Object.keys(表).length + 1) + "_" + 番;
    }
    var 一つだけ = new RegExp("^" + 開 + "([^" + 閉 + "]+)" + 閉 + "$");
    function 入れる(latex, display) {
      var t = 文(latex).trim();
      if (!t) return "";                      /* 中身が空なら 記号ごと消す */
      /* ★ **二重に包まない**（2026-08-17・実測で見つけた）。
         \[\begin{pmatrix}…\end{pmatrix}\] や $$\begin{cases}…\end{cases}$$ は
         ふつうに書かれる。環境を先に抜いたあと、外側の \[…\] が
         **参照記号そのものを 数式として** 抜き直していた。
         その結果 latex が「m_2_2」になり、当然 組めなかった。 */
      var 入れ子 = 一つだけ.exec(t);
      if (入れ子) {
        var 元 = 表[入れ子[1]];
        if (元) { if (display) 元.display = true; return t; }
      }
      var id = 次のid();
      表[id] = { id: id, type: "math", latex: t, display: !!display };
      return 開 + id + 閉;
    }

    /* ① 逃がす。\$ は お金の $ なので 数式ではない。 */
    s = s.replace(/\\\$/g, ドル避け);

    /* ② 環境（\begin{…}…\end{…}）。$$ より先に取る。
          $$\begin{cases}…\end{cases}$$ のときは ③ が先に丸ごと取るので
          ここへは 素の \begin だけが残る。 */
    数式の環境.forEach(function (env) {
      var e = env.replace(/\*/g, "\\*");
      var re = new RegExp("\\\\begin\\{" + e + "\\}([\\s\\S]*?)\\\\end\\{" + e + "\\}", "g");
      s = s.replace(re, function (whole) { return 入れる(whole, true); });
    });

    /* ③ ブロック（$$…$$ と \[…\]）。**インラインより先。** */
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (m, x) { return 入れる(x, true); });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m, x) { return 入れる(x, true); });

    /* ④ インライン（\(…\) と $…$）。
          $…$ は **改行をまたがない**。またがせると、
          文中の 2 つの $ が 段落をまたいで つながってしまう。 */
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m, x) { return 入れる(x, false); });
    s = s.replace(/\$([^$\n]+?)\$/g, function (m, x) { return 入れる(x, false); });

    /* ⑤ 逃がしたものを 戻す */
    s = s.replace(new RegExp(ドル避け, "g"), "\\$");
    return s;
  }

  /* ══ 残っていないか（崩れの検出）═══════════════════════════════
     戻り … [] なら きれい。中身があれば その印。 */
  function 残り(text) {
    var s = 文(text);
    var 出 = [];
    if (/\$/.test(s.replace(/\\\$/g, ""))) 出.push("$");
    if (/\\\(|\\\)/.test(s)) 出.push("\\( \\)");
    if (/\\\[|\\\]/.test(s)) 出.push("\\[ \\]");
    if (/\\begin\{/.test(s)) 出.push("\\begin{…}");
    return 出;
  }

  /* ══ 区切りの無い 生の LaTeX（2026-08-17・実測で見つけた）══════════
     ★ LLM は `$` で囲まずに `\cfrac{1}{2}` とだけ書くことがある。
       それは 上の 残り() には 引っかからない（$ も \( も 無いので）。
       すると **紙に そのままの文字が出る**のに、検査は「きれい」と言う。
       いちばん危ない見逃し方なので、**別に 数えて 見えるようにする。**
     ★ 勝手に 数式へ変えない。書き方が 決めきれないため（\\ は改行、
       \text は文中にも出る）。**気になる所として 出すだけ。** */
  var 数式らしい命令 = ["frac", "cfrac", "dfrac", "tfrac", "sqrt", "int", "iint", "oint",
    "sum", "prod", "lim", "binom", "vec", "overline", "underline", "hat", "bar",
    "times", "div", "pm", "mp", "leq", "geq", "leqq", "geqq", "neq", "approx",
    "equiv", "sim", "propto", "angle", "perp", "parallel", "therefore", "because",
    "in", "subset", "cap", "cup", "infty", "alpha", "beta", "gamma", "theta", "pi",
    "sigma", "omega", "cdot", "cdots", "ldots", "left", "right", "mathrm", "mathbf"];

  function 区切りの無い式(text) {
    var s = 文(text);
    if (s.indexOf("\\") < 0) return [];
    var 出 = [];
    for (var i = 0; i < 数式らしい命令.length; i++) {
      var re = new RegExp("\\\\" + 数式らしい命令[i] + "(?![A-Za-z])", "g");
      var m;
      while ((m = re.exec(s)) !== null) {
        if (出.indexOf("\\" + 数式らしい命令[i]) < 0) 出.push("\\" + 数式らしい命令[i]);
        break;
      }
    }
    return 出;
  }

  /* ══ 参照記号で 切り分ける（描く側が使う）═══════════════════════
     戻り … [{ t:"text", v } | { t:"math", id }] */
  function 割る(text) {
    var s = 文(text);
    var 出 = [], i = 0;
    while (i < s.length) {
      var a = s.indexOf(開, i);
      if (a < 0) { 出.push({ t: "text", v: s.slice(i) }); break; }
      var b = s.indexOf(閉, a);
      if (b < 0) { 出.push({ t: "text", v: s.slice(i) }); break; }
      if (a > i) 出.push({ t: "text", v: s.slice(i, a) });
      出.push({ t: "math", id: s.slice(a + 1, b) });
      i = b + 1;
    }
    return 出.filter(function (x) { return x.t === "math" || x.v; });
  }

  /* 参照記号を 素の LaTeX へ戻す（編集・保存・検索のため）。 */
  function 戻す(text, 表) {
    return 割る(text).map(function (x) {
      if (x.t === "text") return x.v;
      var n = 表 && 表[x.id];
      if (!n) return "";
      return n.display ? "$$" + n.latex + "$$" : "$" + n.latex + "$";
    }).join("");
  }

  /* 参照記号を 落として 素の文だけにする（字数を数えるときなど）。 */
  function 素(text) {
    return 割る(text).map(function (x) { return x.t === "text" ? x.v : ""; }).join("");
  }

  function 記号がある(text) { return 文(text).indexOf(開) >= 0; }

  VQM.parse = {
    抜く: 抜く, 残り: 残り, 割る: 割る, 戻す: 戻す, 素: 素,
    区切りの無い式: 区切りの無い式, 数式らしい命令: 数式らしい命令,
    記号がある: 記号がある, 開: 開, 閉: 閉, 数式の環境: 数式の環境
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/math/svg.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/math/svg.js — 数式を **SVG に固める**

   ★ なぜ SVG か（実測で決めた）
     紙面は pdf/renderer.js が作った HTML を **新しい窓へ document.write して
     window.print()** するだけ（renderer.js の print()）。その HTML の <head> は
     <meta charset> と <style> しか無く、link も script も無い。
     つまり **CDN の KaTeX は 印刷窓には 絶対に届かない。**
     Web フォントに頼る組み方は、そこで必ず崩れる。
     SVG にパスとして固めてしまえば、フォントも通信も要らない。

   ★ なぜ MathJax か
     KaTeX の output は html / mathml / htmlAndMathml の 3 つだけで、
     **SVG を出せない。** SVG を出せるのは MathJax の tex-svg だけ。
     自前配信（client/vendor/mathjax/tex-svg-full.js）。CDN は使わない。

   ★ fontCache は 'local'
     既定（'global'）だと 字形が 別の <defs> に置かれ、SVG 単体では 描けない。
     'local' にすると **1 つの SVG が 自分の <defs> を持つ**（実測で確認）。

   ★ 大きさは **viewBox から出す**。推定しない。
     MathJax の viewBox は 1000 単位 = 1em（実測で確かめた:
     高さ 4.586ex の式の viewBox 高が 2027 → 2.027em、4.586 × 0.442 = 2.027）。
       幅px = viewBox幅 / 1000 × 文字の大きさpx
       高px = viewBox高 / 1000 × 文字の大きさpx
     これを 行高・枠高・はみ出しの判定に使う。

   ★ 和文（\text{それ以外}）だけは <text> 要素で出る（パスにならない）。
     そこへ **和文の書体を はっきり差し込む**。入れないと 印刷窓で
     既定書体になり、字が変わる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  var 置き場 = "/vendor/mathjax/tex-svg-full.js";
  var 和文 = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
  var 待ち = null;                       /* 読み込みの約束（1 回だけ） */
  var 覚え = Object.create(null);        /* latex+display → 結果 */

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══ 読み込み（数式が出てきたときだけ 読む）═══════════════════ */
  function 用意() {
    if (待ち) return 待ち;
    待ち = new Promise(function (done, ng) {
      try {
        if (root.MathJax && root.MathJax.tex2svgPromise) { done(root.MathJax); return; }
        /* 設定は **読み込む前**に置く。あとから置いても効かない。 */
        root.MathJax = root.MathJax || {};
        root.MathJax.svg = { fontCache: "local", displayAlign: "left", displayIndent: "0" };
        root.MathJax.options = { enableMenu: false };
        root.MathJax.startup = { typeset: false };
        var s = root.document.createElement("script");
        s.src = 置き場;
        s.async = true;
        s.onload = function () {
          var n = 0;
          var 待つ = function () {
            if (root.MathJax && root.MathJax.tex2svgPromise) return done(root.MathJax);
            if (n++ > 200) return ng(new Error("MATHJAX_SLOW"));
            root.setTimeout(待つ, 25);
          };
          待つ();
        };
        s.onerror = function () { ng(new Error("MATHJAX_MISSING")); };
        root.document.head.appendChild(s);
      } catch (e) { ng(e); }
    });
    return 待ち;
  }

  /* ══ viewBox を読む ═══════════════════════════════════════════ */
  function 箱を読む(svg) {
    var m = /viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/.exec(文(svg));
    if (!m) return null;
    return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
  }

  /* SVG の 幅・高さ・下がり を **em** に書き直す。
     もとは ex 単位。ex は 書体で変わるので、印刷窓（書体が違う）でずれる。
     em なら 1000 単位＝1em の約束から そのまま計算できる。 */
  function 直す(svg, o) {
    o = o || {};
    var 箱 = 箱を読む(svg);
    if (!箱) return svg;
    var 幅 = 箱.w / 1000, 高 = 箱.h / 1000;
    var 下がり = (箱.y + 箱.h) / 1000;          /* ベースラインより下の量 */
    var s = 文(svg);
    s = s.replace(/\swidth="[^"]*"/, ' width="' + 幅.toFixed(4) + 'em"');
    s = s.replace(/\sheight="[^"]*"/, ' height="' + 高.toFixed(4) + 'em"');
    /* もとの style（vertical-align: -1.686ex）を em で置き直す。
       display のときは 行の中に置かないので 下がりは付けない。 */
    var st = o.display
      ? "display:block;margin:0.35em 0;max-width:100%"
      : "vertical-align:" + (-下がり).toFixed(4) + "em";
    if (/\sstyle="[^"]*"/.test(s)) s = s.replace(/\sstyle="[^"]*"/, ' style="' + st + '"');
    else s = s.replace(/<svg /, '<svg style="' + st + '" ');
    /* 和文は <text> で出る。**書体を差し込む。**入れないと 印刷窓で字が変わる。 */
    if (s.indexOf("<text") >= 0) {
      s = s.replace(/<text /g, '<text font-family="' + 和文 + '" ');
    }
    /* 色は 本文に合わせる（既定は currentColor のまま）。 */
    if (s.indexOf("currentColor") < 0) s = s.replace(/<svg /, '<svg fill="currentColor" stroke="currentColor" ');
    return s;
  }

  /* ══ 1 つ組む ════════════════════════════════════════════════
     戻り { svg, 幅em, 高em, 下がりem, だめ } */
  function 組む(latex, display) {
    var 鍵 = (display ? "B|" : "I|") + 文(latex);
    if (覚え[鍵]) return Promise.resolve(覚え[鍵]);
    return 用意().then(function (MJ) {
      var node;
      try {
        MJ.texReset();
        node = MJ.tex2svg(文(latex), { display: !!display });
      } catch (e) {
        return (覚え[鍵] = { だめ: "組めませんでした", latex: 文(latex) });
      }
      var el = node && node.querySelector ? node.querySelector("svg") : null;
      if (!el) return (覚え[鍵] = { だめ: "組めませんでした", latex: 文(latex) });
      var 生 = el.outerHTML;
      var 壊れ = /data-mjx-error|<merror/.test(生);
      var 箱 = 箱を読む(生) || { x: 0, y: 0, w: 0, h: 0 };
      var 出 = {
        svg: 直す(生, { display: !!display }),
        幅em: 箱.w / 1000, 高em: 箱.h / 1000, 下がりem: (箱.y + 箱.h) / 1000,
        display: !!display, latex: 文(latex)
      };
      if (壊れ) 出.だめ = "式の書き方が おかしい";
      覚え[鍵] = 出;
      return 出;
    }).catch(function (e) {
      return (覚え[鍵] = { だめ: String((e && e.message) || e).slice(0, 60), latex: 文(latex) });
    });
  }

  /* ══ 表をまとめて組む（parse.抜く で作った表をそのまま渡す）══ */
  function 仕込む(表, o) {
    o = o || {};
    var 文字px = Number(o.文字px) || 16;
    var ids = Object.keys(表 || {});
    if (!ids.length) return Promise.resolve({ 組んだ: 0, だめ: [] });
    var だめ = [];
    return ids.reduce(function (p, id) {
      return p.then(function () {
        var n = 表[id];
        if (!n || n.svg) return null;
        return 組む(n.latex, n.display).then(function (r) {
          if (r.だめ) { n.だめ = r.だめ; だめ.push({ id: id, latex: n.latex, なぜ: r.だめ }); }
          n.svg = r.svg || "";
          n.幅em = r.幅em || 0; n.高em = r.高em || 0; n.下がりem = r.下がりem || 0;
          /* **実測の px。**推定ではない。行高・枠高・はみ出しの判定に使う。 */
          n.renderedWidth = Math.round((r.幅em || 0) * 文字px * 100) / 100;
          n.renderedHeight = Math.round((r.高em || 0) * 文字px * 100) / 100;
          return null;
        });
      });
    }, Promise.resolve()).then(function () {
      return { 組んだ: ids.length, だめ: だめ };
    });
  }

  /* ══ 同期で 1 つ組む ═══════════════════════════════════════════
     ★ MathJax は **読み込みだけが 非同期**で、tex2svg 自体は 同期。
       だから 読み込み済みなら その場で HTML の文字列を返せる。
       まだなら null を返し、読み込みを 始める。
       （KaTeX の renderToString と 同じ使い勝手にするため。呼び手は
         null のとき 元の文字を そのまま出す＝これまでと同じ動き。） */
  function 同期(latex, display) {
    var 鍵 = (display ? "B|" : "I|") + 文(latex);
    if (覚え[鍵]) return 覚え[鍵].svg || null;
    if (!root.MathJax || !root.MathJax.tex2svg) { 要る(); return null; }
    try {
      root.MathJax.texReset();
      var node = root.MathJax.tex2svg(文(latex), { display: !!display });
      var el = node && node.querySelector ? node.querySelector("svg") : null;
      if (!el) return null;
      var 生 = el.outerHTML;
      if (/data-mjx-error|<merror/.test(生)) { 覚え[鍵] = { だめ: "式の書き方が おかしい" }; return null; }
      var 箱 = 箱を読む(生) || { x: 0, y: 0, w: 0, h: 0 };
      覚え[鍵] = { svg: 直す(生, { display: !!display }),
                   幅em: 箱.w / 1000, 高em: 箱.h / 1000, 下がりem: (箱.y + 箱.h) / 1000 };
      return 覚え[鍵].svg;
    } catch (e) { return null; }
  }

  /* 「いま数式が要る」と伝える。読み込み終わったら 1 度だけ 合図を出す。
     呼び手は その合図で 描き直す（そうしないと 初回だけ 素の文字のまま残る）。 */
  var 合図した = false;
  function 要る() {
    用意().then(function () {
      if (合図した) return;
      合図した = true;
      try { root.document.dispatchEvent(new root.CustomEvent("vqm:ready")); } catch (e) {}
    }).catch(function () {});
  }

  /* ══ 画面へ 直接 描く（KaTeX の呼び口を そのまま置き換えるため）══
     ★ 組めるまでは **元の式を そのまま出す。**空にして待たない
       （待っている間 何も見えないと「消えた」と言われる）。
     ★ 組めなかったときも 元の式を残す。黙って消さない。 */
  function 描く(el, latex, display) {
    if (!el) return Promise.resolve(false);
    var t = 文(latex);
    el.textContent = t;                        /* まず 元の式 */
    if (!t.trim()) return Promise.resolve(false);
    return 組む(t, display).then(function (r) {
      if (!r || !r.svg) { el.className = (el.className || "") + " vqm-ng"; return false; }
      el.innerHTML = '<span class="vqm' + (display ? " vqm-b" : "") + '">' + r.svg + "</span>";
      return true;
    }).catch(function () { return false; });
  }

  /* 印刷用の最低限の CSS（外の資源に頼らない）。 */
  function CSS() {
    return ".vqm{display:inline-block;line-height:0}"
      + ".vqm svg{overflow:visible}"
      + ".vqm-b{display:block;margin:.35em 0;text-align:left}"
      + ".vqm-ng{color:#b00;border-bottom:1px dotted #b00}";
  }

  VQM.svg = {
    用意: 用意, 組む: 組む, 仕込む: 仕込む, 直す: 直す, 箱を読む: 箱を読む, 描く: 描く,
    同期: 同期, 要る: 要る,
    CSS: CSS, 置き場: 置き場, 和文: 和文,
    読み込み済み: function () { return !!(root.MathJax && root.MathJax.tex2svgPromise); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/math/spec.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/math/spec.js — MockSpec を **数式ごと** 通す関所

   ★ ここが Quick Mock の 唯一の入口。紙面を作る前に 必ず通す。
       ① 本文の $…$ などを 抜き出して spec.__math（math ノードの表）へ移す
       ② 表を まとめて SVG に固める（実測の 幅・高さ も入る）
       ③ 本文に $ \( \[ が 残っていないか 数える → 残っていたら 崩れ

   ★ **大問の階層は 潰さない。**sections[].questions[] のまま、
     文字列のフィールドだけを 書き換える。

   ★ 何度通しても 同じ（すでに参照記号になっている文は 触らない）。
     作り直し（recompile）で 二重に抜かないため。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  /* 数式が入りうる 文字列のフィールド。**ここに無い所は 触らない。** */
  var 設問の文 = ["prompt", "instruction", "context", "explanation", "stem", "text"];
  var 大問の文 = ["title", "instruction", "description", "text"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* 1 つの文字列を 通す。すでに参照記号だけなら そのまま返す。 */
  function 一本(obj, key, 表, 種) {
    if (!obj || typeof obj[key] !== "string") return 0;
    var 前 = obj[key];
    if (!前) return 0;
    /* 生の数式が 1 つも無いなら 触らない（何度通しても同じにする） */
    if (!VQM.parse.残り(前).length) return 0;
    obj[key] = VQM.parse.抜く(前, 表, 種);
    return 1;
  }

  /* ══ ① 抜き出し ══════════════════════════════════════════════ */
  function 抜く(spec) {
    if (!spec || typeof spec !== "object") return { 表: {}, 抜いた: 0 };
    var 表 = (spec.__math && typeof spec.__math === "object") ? spec.__math : {};
    var n = 0;

    大問の文.forEach(function (k) { n += 一本(spec, k, 表, "s"); });
    if (spec.cover) 大問の文.forEach(function (k) { n += 一本(spec.cover, k, 表, "c"); });
    配(spec.notices).forEach(function (x, i) {
      if (typeof x === "string") {
        if (VQM.parse.残り(x).length) { spec.notices[i] = VQM.parse.抜く(x, 表, "n"); n++; }
      } else 大問の文.forEach(function (k) { n += 一本(x, k, 表, "n"); });
    });

    配(spec.sections).forEach(function (sec) {
      大問の文.forEach(function (k) { n += 一本(sec, k, 表, "s"); });
      配(sec.contentBlocks).forEach(function (cb) { n += 一本(cb, "text", 表, "b"); });
      配(sec.questions).forEach(function (q) { n += 設問を通す(q, 表); });
    });
    /* 大問を持たない形（questions が直下）も ある。 */
    配(spec.questions).forEach(function (q) { n += 設問を通す(q, 表); });

    spec.__math = 表;
    return { 表: 表, 抜いた: n };
  }

  function 設問を通す(q, 表) {
    if (!q) return 0;
    var n = 0;
    設問の文.forEach(function (k) { n += 一本(q, k, 表, "q"); });
    配(q.choices).forEach(function (c) { n += 一本(c, "text", 表, "ch"); n += 一本(c, "label", 表, "ch"); });
    配(q.orderItems).forEach(function (c) { n += 一本(c, "text", 表, "or"); });
    配(q.blanks).forEach(function (c) { n += 一本(c, "text", 表, "bl"); });
    配(q.contentBlocks).forEach(function (c) { n += 一本(c, "text", 表, "cb"); });
    配(q.sourceReferences).forEach(function (c) { n += 一本(c, "text", 表, "sr"); });
    if (q.pairs) {
      配(q.pairs.left).forEach(function (c) { n += 一本(c, "text", 表, "pl"); });
      配(q.pairs.right).forEach(function (c) { n += 一本(c, "text", 表, "pr"); });
    }
    /* 正解の文字列にも 式が入る（数値・数式の形式）。紙には出ないが、
       解答解説には出るので 同じように 通す。 */
    if (typeof q.correctAnswer === "string") n += 一本(q, "correctAnswer", 表, "an");
    配(q.acceptedAnswers).forEach(function (v, i) {
      if (typeof v === "string" && VQM.parse.残り(v).length) {
        q.acceptedAnswers[i] = VQM.parse.抜く(v, 表, "an"); n++;
      }
    });
    配(q.children).forEach(function (c) { n += 設問を通す(c, 表); });
    return n;
  }

  /* ══ ③ 残っていないか（純粋関数・AI を使わない）═══════════════ */
  function 検査(spec) {
    var 崩 = [], 気 = [];
    function 見る(どこ, s) {
      var r = VQM.parse.残り(s);
      if (r.length) {
        崩.push({ code: "rawLatex", どこ: どこ,
          なに: "本文に 生の数式の記号が 残っています（" + r.join(" / ") + "）",
          中身: 文(s).slice(0, 80) });
        return;
      }
      /* ★ $ で囲まれていない 生の LaTeX（実測で見つけた 見逃し）。
         紙には そのままの文字が出るのに、上の検査は 通ってしまう。
         勝手に数式へ変えると 取り違えるので、**気になる所**として出す。 */
      var 生 = VQM.parse.区切りの無い式(s);
      if (生.length) {
        気.push({ code: "bareLatex", どこ: どこ,
          なに: "数式の命令が $ で囲まれずに 書かれています（" + 生.slice(0, 4).join(" / ")
            + "）。このままだと 文字として 紙に出ます",
          中身: 文(s).slice(0, 80) });
      }
    }
    function 設問(q, どこ) {
      if (!q) return;
      設問の文.forEach(function (k) { if (typeof q[k] === "string") 見る(どこ + "/" + k, q[k]); });
      配(q.choices).forEach(function (c, i) { 見る(どこ + "/選択肢" + (i + 1), 文(c.text)); });
      配(q.children).forEach(function (c, i) { 設問(c, どこ + "-" + (i + 1)); });
    }
    大問の文.forEach(function (k) { if (typeof spec[k] === "string") 見る("表題/" + k, spec[k]); });
    配(spec.sections).forEach(function (sec, si) {
      大問の文.forEach(function (k) { if (typeof sec[k] === "string") 見る("大問" + (si + 1) + "/" + k, sec[k]); });
      配(sec.questions).forEach(function (q, qi) { 設問(q, "大問" + (si + 1) + "-問" + (qi + 1)); });
    });
    配(spec.questions).forEach(function (q, qi) { 設問(q, "問" + (qi + 1)); });

    /* 組めなかった式 */
    var 表 = spec.__math || {};
    Object.keys(表).forEach(function (id) {
      var n = 表[id];
      if (n && n.だめ) {
        崩.push({ code: "mathBroken", どこ: id,
          なに: "数式を 組めませんでした（" + n.だめ + "）", 中身: 文(n.latex).slice(0, 80) });
      }
    });
    return { errors: 崩, warnings: 気 };
  }

  /* ══ はみ出し（実測の幅で 見る）═══════════════════════════════
     使える幅（px）を渡すと、それを超える式を 返す。推定していない。 */
  function はみ出し(spec, 使える幅px) {
    var 表 = (spec && spec.__math) || {};
    var 幅 = Number(使える幅px) || 0;
    var 出 = [];
    if (!幅) return 出;
    Object.keys(表).forEach(function (id) {
      var n = 表[id];
      if (!n || !n.renderedWidth) return;
      if (n.renderedWidth > 幅) {
        出.push({ code: "mathOverflow", どこ: id,
          なに: "数式が 紙の幅を 超えます（" + Math.round(n.renderedWidth) + "px / 使える幅 "
            + Math.round(幅) + "px）",
          中身: 文(n.latex).slice(0, 60), 幅: n.renderedWidth, 使える幅: 幅 });
      }
    });
    return 出;
  }

  /* ══ 通し（① → ② → ③）═══════════════════════════════════════
     戻り { 抜いた, 組んだ, errors, warnings } */
  function 通す(spec, o) {
    o = o || {};
    var r = 抜く(spec);
    if (!Object.keys(r.表).length) {
      return Promise.resolve({ 抜いた: 0, 組んだ: 0, errors: 検査(spec).errors, warnings: [] });
    }
    return VQM.svg.仕込む(r.表, { 文字px: o.文字px || 16 }).then(function (s) {
      var 検 = 検査(spec);
      return { 抜いた: r.抜いた, 組んだ: s.組んだ, 組めなかった: s.だめ,
               errors: 検.errors, warnings: 検.warnings };
    });
  }

  VQM.spec = { 通す: 通す, 抜く: 抜く, 検査: 検査, はみ出し: はみ出し,
               設問の文: 設問の文, 大問の文: 大問の文 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/md/render.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/md/render.js — Lumi の言葉を **かたちのある文**にする

   ★ 訴え（2026-08-17）「上に出てくるやつを マークダウン付きにできない？
     大事なとこに 強調したり、線を引いたり。図や 表も。色も。数式も。」

   ★ なぜ 自前で書くか
     この画面は 印刷窓（about:blank）や オフラインでも 動く必要がある。
     CDN の marked に頼ると、そこで 消える。**外に頼らない。**

   ★ 安全の決まり（ここを外すと 差し込みの穴になる）
     **必ず 先に 全部 エスケープしてから**、決まった形だけを タグへ戻す。
     生の HTML は 一切 通さない。リンクも 文字として出すだけで、
     押して 飛べるようには しない（Lumi の言葉で 外へ 飛ばさない）。

   ★ 使える形
     見出し  # 〜 ######
     強調    **太字**  __下線__  *斜め*  ~~取り消し~~
     色つき  ==目立たせる==  ==r:赤==  ==b:青==  ==g:緑==  ==y:黄==
     箇条書き  - / * / 1.（2 文字ぶん下げると 入れ子）
     引用    >
     区切り  ---
     表      | 見出し | 見出し |
             |---|---|
     コード  `その場` と ``` の 3 連
     図      ```図  はじめ -> 計算 -> 答え  ```
     数式    $x^2$（文の中）  $$…$$（行を変えて）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQMD = root.VQMD || (root.VQMD = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var 色 = { r: "vqmd-r", b: "vqmd-b", g: "vqmd-g", y: "vqmd-y", p: "vqmd-p", o: "vqmd-o" };

  /* ══ 数式（VQM がいれば SVG。無ければ 元の字のまま）════════════ */
  function 式にする(s) {
    /* ★ **$ が無くても 数式のことがある**（2026-08-17・実測で見つけた）。
       ここで「$ が無ければ 帰る」と していたので、
       \\(…\\) と \\[…\\] と \\begin{…} は **下の 処理まで 届いていなかった**。
       下に 正しい 拾いかたを 書いたのに、入口で 弾かれていた
       （「ボードで 数式が 反映されないことがある」の 正体は これ）。 */
    if (s.indexOf("$") < 0 && s.indexOf("\\") < 0) return s;
    var V = root.VQM && root.VQM.svg;
    if (V && !V.読み込み済み()) { try { V.要る(); } catch (e) {} }
    function 組む(tex, ブロック) {
      if (!V) return null;
      try { return V.同期(tex, !!ブロック); } catch (e) { return null; }
    }
    function 包む(m, t, ブロック) {
      var h = 組む(実体を戻す(t), ブロック);
      return h ? '<span class="vqmd-math' + (ブロック ? " vqmd-math-b" : "") + '">' + h + "</span>"
               : m;
    }
    /* ★ **$ だけでは 足りない**（2026-08-17・実測で 分かった不具合）。
       「ボードで 数式が 反映されないことがある」の 正体。
       Lumi は $…$ のほかに \\(…\\)・\\[…\\]・\\begin{cases}…\\end{cases}
       も ふつうに 書く。拾っていなかったので、その形のときだけ
       生の字が そのまま 出ていた。
       ★ 見る順番は **広いものから**。$$ より先に $ を見ると、
         $$ を 2 つの $ と 読み違える。 */
    /* ① 環境（\begin{…}…\end{…}）。$$ の 中に 入っていても、
          先に 取れば 二重にならない（中身は 同じ）。 */
    s = s.replace(/\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|cases|dcases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array|aligned|gathered|split)\}([\s\S]*?)\\end\{\1\}/g,
      function (m) { return 包む(m, m, true); });
    /* ② ブロック（$$…$$ と \[…\]） */
    s = s.replace(/\$\$([^$]+?)\$\$/g, function (m, t) { return 包む(m, t, true); });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m, t) { return 包む(m, t, true); });
    /* ③ 文の中（\(…\) と $…$） */
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m, t) { return 包む(m, t, false); });
    s = s.replace(/\$([^$\n]+?)\$/g, function (m, t) { return 包む(m, t, false); });
    /* ④ ★ **囲みの無い 生の命令**（2026-08-17・訴え「frac が 効いていない」）。
       Lumi は 囲むのを 忘れて、そのまま \frac{1}{2} と 書くことが ある。
       ここまでの ①〜③ は どれも 囲みが 要るので、素通りして
       **\frac{1}{2} という 字が そのまま** 出ていた。
       ★ 拾うのは **命令ひとかたまりだけ**（\命令 と そのうしろの {…}）。
         前後の 文まで 巻き込まない（日本語を 数式にしてしまうため）。
       ★ 組めなかったものは そのまま。無理に 図にしない。 */
    s = 生の命令(s);
    return s;

    /* 囲みの無い \命令{…} を ひとかたまりずつ 組む。
       うしろに 続く {…} と ^{…} _{…} は 同じかたまりに 入れる
       （\frac{1}{2} は {…} が 2 つ、x^{2} は 上つきまで が 1 つ）。 */
    function 生の命令(t2) {
      if (t2.indexOf("\\") < 0) return t2;
      var 出 = "", i = 0;
      while (i < t2.length) {
        var c = t2.charAt(i);
        if (c !== "\\") { 出 += c; i++; continue; }
        var m2 = /^\\([a-zA-Z]+)/.exec(t2.slice(i));
        if (!m2 || !数式の命令[m2[1]]) { 出 += c; i++; continue; }
        var j = i + m2[0].length;
        /* うしろの {…} / ^{…} / _{…} を 取り込む（かっこの 対応を 数える） */
        while (j < t2.length) {
          var d = t2.charAt(j);
          if (d === "^" || d === "_") { j++; continue; }
          if (d !== "{") break;
          var 深 = 0, k = j;
          for (; k < t2.length; k++) {
            if (t2.charAt(k) === "{") 深++;
            else if (t2.charAt(k) === "}") { 深--; if (!深) { k++; break; } }
          }
          if (深) break;                       /* 閉じていない → あきらめる */
          j = k;
        }
        /* うしろに 上つき・下つきの ついた 文字が 続くなら 一緒に 取る
           （\pi r^{2} の r^{2} まで 図にする。ここを 切ると 半分だけ 図になる） */
        var 続 = /^\s?[A-Za-z0-9]+(?:[\^_](?:\{[^}]*\}|[A-Za-z0-9]))+/.exec(t2.slice(j));
        if (続) j += 続[0].length;
        var 生 = t2.slice(i, j);
        var h = 組む(実体を戻す(生), false);
        出 += h ? '<span class="vqmd-math">' + h + "</span>" : 生;
        i = j;
      }
      return 出;
    }
  }

  /* 囲み無しでも 数式として 拾ってよい 命令。
     ここに無いものは **文字のまま**（\n や \t を 図にしない）。 */
  var 数式の命令 = {};
  ("frac dfrac cfrac tfrac sqrt sum prod int iint oint lim binom vec overline underline "
   + "hat bar tilde times div pm mp leq geq leqq geqq neq approx equiv sim propto "
   + "angle perp parallel therefore because in notin subset supset cap cup infty "
   + "alpha beta gamma delta theta lambda mu pi rho sigma phi omega Delta Sigma Omega "
   + "cdot cdots ldots dots le ge ne to rightarrow leftarrow Leftrightarrow "
   + "sin cos tan log ln exp max min mathrm mathbf boxed").split(" ")
    .forEach(function (n) { 数式の命令[n] = 1; });
  /* エスケープ済みの字を LaTeX へ戻す（\frac{a}{b} の < > & を 元に戻す） */
  function 実体を戻す(s) {
    return 文(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }

  /* ══ 文の中の飾り ═══════════════════════════════════════════════ */
  function 中身(s) {
    s = 文(s);
    /* その場のコード と 組んだ数式は **先に 取り分ける**。
       ★ ここが 崩れの もとだった（2026-08-17・実測）。
         組んだ数式（SVG）の 中には width="…" のような **= が 山ほど**あり、
         そのあと マーカー（==…==）を 探すと、SVG の中の = に 引っかかって
         「答えは ==x=3==」や「==答えは $x=2$==」が **そのまま 出ていた**。
         取り分けてから 飾りを 当て、最後に 戻す。 */
    var 箱 = [];
    /* ★ 目印は **私用領域**。ただの数字で 印を付けると、
       本文の数字（「 3 」など）と ぶつかって 中身が 消える。 */
    var 印開 = String.fromCharCode(0xE010), 印閉 = String.fromCharCode(0xE011);
    var しまう = function (h) { 箱.push(h); return 印開 + (箱.length - 1) + 印閉; };
    s = s.replace(/`([^`\n]+)`/g, function (m, t) {
      return しまう('<code class="vqmd-c">' + t + "</code>");
    });
    /* 数式を 組み、そのまま **箱へ しまう**（飾りの regexp から 隠す） */
    s = 式にする(s).replace(/<span class="vqmd-math[^"]*">[\s\S]*?<\/span>/g, しまう);
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    /* 番号つきの下線（__1:ここ__）。手順の 何番の話かが ひと目で 分かる。 */
    s = s.replace(/__(\d{1,2}):([^_\n]+?)__/g, function (m, n, t) {
      return '<u class="vqmd-un"><i class="vqmd-no">' + n + "</i>" + t + "</u>";
    });
    s = s.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
    /* ★ マーカーは **中に = が あってもよい**（実測で 直した）。
       数学の 印つけは 「==x=3==」のように = を 含むのが ふつう。
       閉じは 「==」だけ。1 つの = は 中身として 通す。
       色の前後の すき間も 許す（== r: 大事 == と 書かれることが ある）。 */
    var マーカー中 = "((?:[^=\\n]|=(?!=))+?)";
    s = s.replace(new RegExp("==\\s*([rbgyop])\\s*:\\s*" + マーカー中 + "\\s*==", "g"),
      function (m, c, t) { return '<mark class="' + (色[c] || "") + '">' + t + "</mark>"; });
    s = s.replace(new RegExp("==" + マーカー中 + "==", "g"), '<mark>$1</mark>');
    /* ══ ここから 2026-08-20 に 足した 飾り ════════════════════════
       訴え「他のマークダウンも 増やしていいよ。さらに 増やしても」。
       ★ どれも **閉じ**が 要る形にした。閉じが 無いと ふつうの字は
         そのまま 出る（「2^3」や「約~5」が 勝手に 化けない）。 */
    /* 押す鍵（[[Esc]]）。リンクの 決まりより **先に** 見る。 */
    s = s.replace(/\[\[([^\]\n]{1,24})\]\]/g, '<kbd class="vqmd-k">$1</kbd>');
    /* ふりがな。{漢字|かんじ} と 漢字《かんじ》の どちらでも。
       ★ 表の中では { … | … } は 使えない（| で 桝が 切れる）。
         表の中で ふりがなを 振るときは 《》の ほうを 使う。 */
    s = s.replace(/\{([^{}|\n]{1,24})\|([^{}|\n]{1,24})\}/g,
      '<ruby>$1<rt>$2</rt></ruby>');
    /* ★ 《》の 中は **かなだけ**に 絞る。かぎかっこ代わりに 《重要》と
       書かれることが あり、そこまで ふりがなに すると 字が つぶれる。 */
    s = s.replace(/([^\s《》|]{1,16})《([ぁ-んァ-ヶーぁ-ゖ・]{1,24})》/g,
      '<ruby>$1<rt>$2</rt></ruby>');
    /* 上つき（^2^）・下つき（~2~）。化学式や 単位で 使う。
       ★ 下つきは **取り消し線（~~…~~）のあと**に 見る（先に 見ると 食い合う）。 */
    s = s.replace(/\^([^\^\s]{1,12})\^/g, "<sup>$1</sup>");
    s = s.replace(/~([^~\s]{1,12})~/g, "<sub>$1</sub>");
    /* リンクは **文字だけ**。押して 飛べるようには しない。 */
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<span class="vqmd-l">$1</span>');
    /* しまってあった コードと数式を **最後に 戻す** */
    s = s.replace(new RegExp(印開 + "(\\d+)" + 印閉, "g"),
      function (m, i2) { return 箱[Number(i2)] || ""; });
    return s;
  }

  /* ══ 図 ═════════════════════════════════════════════════════════
     ★ 訴え（2026-08-17）「数学の問題や 比較問題で、同じような図形を
       すぐに 組み立てられるように」。
     ★ 外の作図の道具は 入れない（重い・オフラインで 消える）。
       **よく出るものだけ**を SVG で 自前で 描く。
         数直線:  -3 <= x < 2.5      … 範囲・点・端の 白丸/黒丸
         三角形:  3, 4, 5 直角        … 辺の長さつき（直角の印も）
         円:      r=5                 … 半径つき
         長方形:  たて3 よこ5
         座標:    y = 2x + 1          … 1 次関数のグラフ
         流れ:    はじめ -> 計算 -> 答え
     ★ 数字が 読めないものは **描かずに 文字のまま**出す。
       それらしい図を 作ると、合っていない図で 覚えてしまう。 */
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }

  function 数直線(式) {
    /* 「-3 <= x < 2.5」「x > 1」「-1 〜 4」 */
    var m = /(-?[\d.]+)\s*(<=|≦|<|≤)?\s*[a-zA-Zｘx]\s*(<=|≦|<|≤)?\s*(-?[\d.]+)/.exec(式);
    var 左 = null, 右 = null, 左閉 = false, 右閉 = false;
    if (m) {
      左 = 数(m[1], null); 右 = 数(m[4], null);
      左閉 = /=|≦|≤/.test(m[2] || ""); 右閉 = /=|≦|≤/.test(m[3] || "");
    } else {
      var m2 = /[a-zA-Zｘx]\s*(>=|≧|>|≥|<=|≦|<|≤)\s*(-?[\d.]+)/.exec(式);
      if (!m2) return null;
      var v = 数(m2[2], 0), 上 = /</.test(m2[1]) || /≦|≤/.test(m2[1]);
      if (上) { 右 = v; 右閉 = /=|≦|≤/.test(m2[1]); }
      else { 左 = v; 左閉 = /=|≧|≥/.test(m2[1]); }
    }
    var 下 = Math.floor(Math.min(左 === null ? 右 - 3 : 左, 右 === null ? 左 - 3 : 右)) - 1;
    var 上端 = Math.ceil(Math.max(左 === null ? 右 + 3 : 左, 右 === null ? 左 + 3 : 右)) + 1;
    if (!isFinite(下) || !isFinite(上端) || 上端 - 下 > 40) return null;
    var W = 280, H = 52, 端 = 16;
    var X = function (v2) { return 端 + (v2 - 下) / (上端 - 下) * (W - 端 * 2); };
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<line x1="4" y1="30" x2="' + (W - 4) + '" y2="30" class="ax"/>');
    for (var v3 = 下; v3 <= 上端; v3++) {
      o.push('<line x1="' + X(v3).toFixed(1) + '" y1="26" x2="' + X(v3).toFixed(1) + '" y2="34" class="tk"/>');
      o.push('<text x="' + X(v3).toFixed(1) + '" y="46" class="lb">' + v3 + "</text>");
    }
    var a = 左 === null ? 下 : 左, b = 右 === null ? 上端 : 右;
    o.push('<line x1="' + X(a).toFixed(1) + '" y1="20" x2="' + X(b).toFixed(1) + '" y2="20" class="rg"/>');
    if (左 !== null) o.push('<circle cx="' + X(左).toFixed(1) + '" cy="20" r="4.5" class="' + (左閉 ? "pt" : "pto") + '"/>');
    if (右 !== null) o.push('<circle cx="' + X(右).toFixed(1) + '" cy="20" r="4.5" class="' + (右閉 ? "pt" : "pto") + '"/>');
    o.push("</svg>");
    return o.join("");
  }

  function 三角形(式) {
    var 数ら = (式.match(/-?[\d.]+/g) || []).map(Number).filter(function (x) { return x > 0; });
    if (数ら.length < 3) return null;
    var a = 数ら[0], b = 数ら[1], c = 数ら[2];
    var 直 = /直角|right/.test(式) || Math.abs(a * a + b * b - c * c) < 0.01;
    var W = 190, H = 130, m2 = 22;
    /* 直角のときは そのまま。そうでなくても **辺の比**は 保つ。 */
    var 幅 = W - m2 * 2, 高 = H - m2 * 2;
    var s2 = Math.min(幅 / Math.max(a, 1), 高 / Math.max(b, 1));
    var ax = m2, ay = H - m2;
    var bx = m2 + a * s2, by = H - m2;
    var cx2 = 直 ? m2 : m2 + a * s2 * 0.32, cy = H - m2 - b * s2;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<polygon points="' + [ax, ay, bx, by, cx2, cy].map(function (n) { return n.toFixed(1); }).join(",") + '" class="sh"/>');
    if (直) o.push('<path d="M' + (ax + 11) + " " + ay + "L" + (ax + 11) + " " + (ay - 11) + "L" + ax + " " + (ay - 11) + '" class="rt"/>');
    o.push('<text x="' + ((ax + bx) / 2).toFixed(1) + '" y="' + (ay + 14) + '" class="lb">' + a + "</text>");
    o.push('<text x="' + (Math.min(ax, cx2) - 8).toFixed(1) + '" y="' + ((ay + cy) / 2).toFixed(1) + '" class="lb">' + b + "</text>");
    o.push('<text x="' + ((bx + cx2) / 2 + 8).toFixed(1) + '" y="' + ((by + cy) / 2 - 4).toFixed(1) + '" class="lb">' + c + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 円(式) {
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    if (r === null) r = 数((式.match(/-?[\d.]+/) || [])[0], null);
    if (r === null || r <= 0) return null;
    var W = 140, H = 130, cx2 = 70, cy = 62, R = 44;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<circle cx="' + cx2 + '" cy="' + cy + '" r="' + R + '" class="sh"/>');
    o.push('<line x1="' + cx2 + '" y1="' + cy + '" x2="' + (cx2 + R) + '" y2="' + cy + '" class="tk"/>');
    o.push('<circle cx="' + cx2 + '" cy="' + cy + '" r="2.5" class="pt"/>');
    o.push('<text x="' + (cx2 + R / 2) + '" y="' + (cy - 6) + '" class="lb">' + r + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 長方形(式) {
    var t = 数((/(?:たて|縦|高さ|h)\s*[=:]?\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    var y = 数((/(?:よこ|横|幅|w)\s*[=:]?\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    if (t === null || y === null) {
      var ns = (式.match(/-?[\d.]+/g) || []).map(Number);
      if (ns.length < 2) return null;
      y = ns[0]; t = ns[1];
    }
    if (!(t > 0 && y > 0)) return null;
    var W = 180, H = 120, m2 = 24;
    var s2 = Math.min((W - m2 * 2) / y, (H - m2 * 2) / t);
    var w2 = y * s2, h2 = t * s2;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<rect x="' + m2 + '" y="' + (H - m2 - h2).toFixed(1) + '" width="' + w2.toFixed(1)
      + '" height="' + h2.toFixed(1) + '" class="sh"/>');
    o.push('<text x="' + (m2 + w2 / 2).toFixed(1) + '" y="' + (H - m2 + 14) + '" class="lb">' + y + "</text>");
    o.push('<text x="' + (m2 - 8) + '" y="' + (H - m2 - h2 / 2).toFixed(1) + '" class="lb">' + t + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 座標(式) {
    /* y = 2x + 1 / y = -x - 3 */
    var m = /y\s*=\s*(-?[\d.]*)\s*\*?\s*[a-zA-Zｘx]\s*([+-]\s*[\d.]+)?/i.exec(式);
    if (!m) return null;
    var a = m[1] === "" || m[1] === undefined ? 1 : (m[1] === "-" ? -1 : 数(m[1], 1));
    var b = 数(String(m[2] || "0").replace(/\s+/g, ""), 0);
    var W = 170, H = 150, cx2 = 85, cy = 75, 目 = 14;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<line x1="6" y1="' + cy + '" x2="' + (W - 6) + '" y2="' + cy + '" class="ax"/>');
    o.push('<line x1="' + cx2 + '" y1="6" x2="' + cx2 + '" y2="' + (H - 6) + '" class="ax"/>');
    for (var k = -4; k <= 4; k++) {
      if (!k) continue;
      o.push('<line x1="' + (cx2 + k * 目) + '" y1="' + (cy - 3) + '" x2="' + (cx2 + k * 目) + '" y2="' + (cy + 3) + '" class="tk"/>');
      o.push('<line x1="' + (cx2 - 3) + '" y1="' + (cy + k * 目) + '" x2="' + (cx2 + 3) + '" y2="' + (cy + k * 目) + '" class="tk"/>');
    }
    var 点 = function (x) { return { x: cx2 + x * 目, y: cy - (a * x + b) * 目 }; };
    var p1 = 点(-5), p2 = 点(5);
    o.push('<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1)
      + '" y2="' + p2.y.toFixed(1) + '" class="gl"/>');
    o.push('<text x="' + (W - 8) + '" y="' + (cy - 6) + '" class="lb">x</text>');
    o.push('<text x="' + (cx2 + 6) + '" y="14" class="lb">y</text>');
    o.push("</svg>");
    return o.join("");
  }

  function 図にする(本文) {
    var 行 = 文(本文).split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    if (!行.length) return "";
    var 出 = ['<div class="vqmd-zu">'];
    行.forEach(function (l) {
      var m = /^(数直線|三角形|直角三角形|円|長方形|四角形|座標|グラフ)\s*[:：]?\s*(.*)$/.exec(l);
      if (m) {
        var 式 = m[2] || "", g = null;
        if (m[1] === "数直線") g = 数直線(式);
        else if (m[1] === "三角形" || m[1] === "直角三角形") g = 三角形((m[1] === "直角三角形" ? "直角 " : "") + 式);
        else if (m[1] === "円") g = 円(式);
        else if (m[1] === "長方形" || m[1] === "四角形") g = 長方形(式);
        else g = 座標(式);
        /* ★ 読めなかったら **描かない**。それらしい図は 覚え違いのもと。 */
        出.push(g ? '<div class="vqmd-zu-f">' + g + "</div>"
                  : '<div class="vqmd-zu-r"><span class="vqmd-zu-b">' + 中身(esc(l)) + "</span></div>");
        return;
      }
      var 節 = l.split(/\s*(?:->|→|=>)\s*/).filter(Boolean);
      出.push('<div class="vqmd-zu-r">');
      節.forEach(function (n, i) {
        if (i) 出.push('<i class="vqmd-zu-a">→</i>');
        出.push('<span class="vqmd-zu-b">' + 中身(esc(n)) + "</span>");
      });
      出.push("</div>");
    });
    出.push("</div>");
    return 出.join("");
  }

  /* ══ 表 ═════════════════════════════════════════════════════════ */
  /* ══ 注意書きの 種類（2026-08-20）════════════════════════════════
     日本語で 書けるようにする。英語で 書かれても 受ける（言い方を 縛らない）。
     ★ 印は **文字**にする。絵文字を 使うと 書体の 差し替えで 化ける
       （2026-08-19 に 一度 踏んだ。アイコンが 字に なる不具合）。 */
  var 呼び名の表 = [
    { 鍵: "memo",  名: "メモ",   印: "✎", 語: ["メモ", "note", "info", "情報", "参考"] },
    { 鍵: "kan",   名: "大事",   印: "★", 語: ["大事", "重要", "important", "key", "たいせつ"] },
    { 鍵: "chu",   名: "注意",   印: "!", 語: ["注意", "warning", "caution", "気をつけて", "ちゅうい"] },
    { 鍵: "kotsu", 名: "コツ",   印: "☞", 語: ["コツ", "tip", "ヒント", "hint", "こつ"] },
    { 鍵: "rei",   名: "れい",   印: "▸", 語: ["れい", "例", "example", "たとえば", "sample"] },
    { 鍵: "matome", 名: "まとめ", 印: "✓", 語: ["まとめ", "summary", "結論", "答え", "こたえ"] }
  ];
  function 呼び名(s2) {
    var k = 文(s2).trim().toLowerCase();
    if (!k) return null;
    for (var i2 = 0; i2 < 呼び名の表.length; i2++) {
      var x = 呼び名の表[i2];
      for (var j2 = 0; j2 < x.語.length; j2++)
        if (k === String(x.語[j2]).toLowerCase()) return x;
    }
    return null;
  }

  function 表の行(l) {
    var s = l.trim().replace(/^\|/, "").replace(/\|$/, "");
    return s.split("|").map(function (x) { return x.trim(); });
  }
  function 区切り行か(l) {
    return /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(l) && l.indexOf("-") >= 0 && l.indexOf("|") >= 0;
  }

  /* ══ 本体 ═══════════════════════════════════════════════════════ */
  function render(src) {
    var 生 = 文(src);
    if (!生.trim()) return "";
    return 組む(esc(生).split(/\r?\n/));
  }

  /* ★ **逃がし済みの行**を 受け取る（2026-08-20）。
     入れ子（注意書き・折りたたみ・引用の 中身）を 同じ道で 組むため 分けた。
     ここへ 生の字を 渡すと **二度 逃がして** & が &amp;amp; になる。 */
  function 組む(行) {
    var 出 = [], i = 0;

    function 段落を閉じる(積) {
      if (積.length) { 出.push("<p>" + 中身(積.join("<br>")) + "</p>"); 積.length = 0; }
    }
    var 積 = [];

    while (i < 行.length) {
      var l = 行[i];

      /* ``` の 3 連（図・コード） */
      var f = /^\s*```\s*(\S*)\s*$/.exec(l);
      if (f) {
        段落を閉じる(積);
        var 種 = f[1] || "", 中 = [];
        i++;
        while (i < 行.length && !/^\s*```\s*$/.test(行[i])) { 中.push(行[i]); i++; }
        i++;
        if (/^(図形|図|zu|geo|geometry|flow|diagram|graph|グラフ|chart)$/i.test(種)) {
          /* ★ 座標で 描く 図形（core/geo/draw.js）。
             **合っていない図は 描かない。**言われた長さと 座標が
             食い違ったら、理由を 出して 文字のまま 見せる。 */
          var G = root.VQG;
          var 元 = 実体を戻す(中.join("\n"));
          /* ★ 1 行で 済む 図（関数・円グラフ・立体…）は **その行だけ**で 描く。
             座標で 組む 図（点・線・多角形）は まとめて 図形エンジンへ。
             1 つの ブロックに 両方 混ざっていても よい。 */
          var 一括 = [], 座標行 = [], だめら = [];
          元.split("\n").forEach(function (l2) {
            if (!l2.trim()) return;
            var one = null;
            try { one = G && G.more ? G.more.一行(l2) : null; } catch (e2) { one = null; }
            if (!one) { try { one = G && G.sci ? G.sci.一行(l2) : null; } catch (e4) { one = null; } }
            if (one) { 一括.push('<div class="vqmd-geo">' + one + "</div>"); return; }
            /* ★ 昔からの かんたんな図（長方形・座標…）も **ここで 拾う**
               （2026-08-17・実測）。座標エンジンへ 回してから 拾おうとすると、
               「描くものが ありません」で 落ちて 図が 1 つも 出なくなる。
               図に ならない行は そのまま 座標エンジンへ 渡す。 */
            var 簡 = null;
            try { 簡 = 図にする(l2); } catch (e5) { 簡 = null; }
            if (簡 && 簡.indexOf("vqmd-zu-f") >= 0) { 一括.push(簡); return; }
            /* more が 断ったのが「点検で 落ちた」なら 理由を 残す */
            try {
              if (G && G.more && G.more.なぜだめ && G.more.なぜだめ()
                  && /^([^\s:：]+)\s*[:：]/.test(l2)) だめら.push(G.more.なぜだめ());
            } catch (e3) {}
            座標行.push(l2);
          });
          if (一括.length) 出.push(一括.join(""));
          if (!座標行.length) {
            if (だめら.length) 出.push('<div class="vqmd-geo-ng">'
              + esc(だめら.slice(0, 2).join(" ／ ")) + "</div>");
            continue;
          }
          元 = 座標行.join("\n");
          var r2 = G && G.描く ? G.描く(元, {}) : { だめ: "図形の道具が ありません" };
          /* ★ 座標の 図として 読めなかったら、**流れ図として** 出す
             （はじめ -> つぎ のような 書き方は こちら）。
             どちらでも 読めないときだけ 理由を 出す。 */
          if (!(r2 && r2.svg)) {
            var 流 = 図にする(元);
            if (流 && 流.indexOf("vqmd-zu-b") >= 0) { 出.push(流); continue; }
          }
          if (r2 && r2.svg) {
            出.push('<div class="vqmd-geo">' + r2.svg
              /* 書かれた数と ちがったときは **黙らずに** 下へ 一言 */
              + ((r2.ちがい && r2.ちがい.length)
                 ? '<div class="vqmd-geo-note">図は 座標のとおりに 描きました。'
                   + esc(r2.ちがい.join(" ／ ")) + "</div>" : "")
              + "</div>");
          }
          else {
            出.push('<div class="vqmd-geo-ng"><b>この図は 描けません</b><br>'
              + esc((r2 && r2.だめ) || "読めません") + "</div>");
            出.push('<pre class="vqmd-pre"><code>' + esc(元) + "</code></pre>");
          }
        } else if (/^(図|zu|flow|diagram)$/i.test(種)) 出.push(図にする(実体を戻す(中.join("\n"))));
        else 出.push('<pre class="vqmd-pre"><code>' + 中.join("\n") + "</code></pre>");
        continue;
      }

      /* 表 */
      if (/\|/.test(l) && i + 1 < 行.length && 区切り行か(行[i + 1])) {
        段落を閉じる(積);
        var 頭 = 表の行(l);
        i += 2;
        var 体 = [];
        while (i < 行.length && /\|/.test(行[i]) && 行[i].trim()) { 体.push(表の行(行[i])); i++; }
        var t = ['<div class="vqmd-tw"><table class="vqmd-t"><thead><tr>'];
        頭.forEach(function (c) { t.push("<th>" + 中身(c) + "</th>"); });
        t.push("</tr></thead><tbody>");
        体.forEach(function (r) {
          t.push("<tr>");
          for (var k = 0; k < 頭.length; k++) t.push("<td>" + 中身(r[k] || "") + "</td>");
          t.push("</tr>");
        });
        t.push("</tbody></table></div>");
        出.push(t.join(""));
        continue;
      }

      /* 見出し */
      var h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) {
        段落を閉じる(積);
        var n = Math.min(6, h[1].length);
        出.push("<h" + n + ' class="vqmd-h">' + 中身(h[2]) + "</h" + n + ">");
        i++; continue;
      }

      /* 区切り */
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
        段落を閉じる(積); 出.push('<hr class="vqmd-hr">'); i++; continue;
      }

      /* ══ 折りたたみ（2026-08-20）════════════════════════════════
           ??? もっと 細かく
           …中身…
           ???
         長い補足を **たたんで** 置ける。読む人が 押したときだけ 開く。 */
      var 畳 = /^\s*\?\?\?\s*(.*)$/.exec(l);
      if (畳 && 畳[1].trim()) {
        段落を閉じる(積);
        var 見 = 畳[1].trim(), 畳中 = [];
        i++;
        while (i < 行.length && !/^\s*\?\?\?\s*$/.test(行[i])) { 畳中.push(行[i]); i++; }
        i++;
        出.push('<details class="vqmd-dt"><summary>' + 中身(見) + "</summary>"
          + '<div class="vqmd-dtb">' + 組む(畳中) + "</div></details>");
        continue;
      }

      /* ══ 用語の説明（2026-08-20）════════════════════════════════
           領域 :: 国の 広さ・場所
         語と 意味を **そろえて** 並べる。単語の 学びで いちばん よく使う形。 */
      if (/^\s*[^\s:][^:\n]*\s::\s+\S/.test(l)) {
        段落を閉じる(積);
        var 表D = ['<dl class="vqmd-dl">'];
        while (i < 行.length && /^\s*[^\s:][^:\n]*\s::\s+\S/.test(行[i])) {
          var mD = /^\s*([^:\n]+?)\s::\s+(.*)$/.exec(行[i]);
          表D.push("<dt>" + 中身(mD[1].trim()) + "</dt><dd>" + 中身(mD[2].trim()) + "</dd>");
          i++;
        }
        表D.push("</dl>");
        出.push(表D.join(""));
        continue;
      }

      /* ══ 引用 と 注意書き（2026-08-20 で 注意書きを 足した）══════
           > ふつうの 引用
           > [!メモ] ここが 大事
         [!…] で 始めると **色の付いた 囲み**になる。
         種類: メモ / 大事 / 注意 / コツ / れい / まとめ  （英語でも 可）
         ★ 中身は **入れ子で 組む**ので、箇条書きも 表も 入れられる。 */
      if (/^\s*&gt;\s?/.test(l)) {
        段落を閉じる(積);
        var q = [];
        while (i < 行.length && /^\s*&gt;\s?/.test(行[i])) {
          q.push(行[i].replace(/^\s*&gt;\s?/, "")); i++;
        }
        var 頭C = /^\s*\[!\s*([^\]\n]+?)\s*\]\s*(.*)$/.exec(q[0] || "");
        var 種C = 頭C ? 呼び名(頭C[1]) : null;
        if (種C) {
          q[0] = 頭C[2];
          if (!String(q[0]).trim()) q.shift();
          出.push('<div class="vqmd-cal vqmd-cal-' + 種C.鍵 + '">'
            + '<div class="vqmd-cal-t"><span class="vqmd-cal-i" aria-hidden="true">'
            + 種C.印 + "</span>" + esc(種C.名) + "</div>"
            + '<div class="vqmd-cal-b">' + 組む(q) + "</div></div>");
          continue;
        }
        出.push('<blockquote class="vqmd-q">' + 中身(q.join("<br>")) + "</blockquote>");
        continue;
      }

      /* 箇条書き・番号つき（2 文字ぶんで 入れ子） */
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        段落を閉じる(積);
        var 山 = [], 深さ = [];
        while (i < 行.length && /^\s*([-*+]|\d+\.)\s+/.test(行[i])) {
          var m2 = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(行[i]);
          var d = Math.floor(m2[1].replace(/\t/g, "  ").length / 2);
          var 番 = /\d/.test(m2[2]);
          while (深さ.length > d + 1) { 山.push(深さ.pop() === "ol" ? "</ol>" : "</ul>"); }
          if (深さ.length < d + 1) {
            深さ.push(番 ? "ol" : "ul");
            山.push(番 ? '<ol class="vqmd-ol">' : '<ul class="vqmd-ul">');
          }
          /* ★ チェック（- [ ] / - [x]）。やることの 並びに 使う（2026-08-20）。
             押せるようには しない（読むためのもの。押しても 何も 起きない）。 */
          var mc = /^\[([ xX])\]\s+(.*)$/.exec(m2[3]);
          if (mc) 山.push('<li class="vqmd-ck' + (mc[1] === " " ? "" : " on") + '">'
            + '<span class="vqmd-bx" aria-hidden="true">' + (mc[1] === " " ? "" : "✓") + "</span>"
            + 中身(mc[2]) + "</li>");
          else 山.push("<li>" + 中身(m2[3]) + "</li>");
          i++;
        }
        while (深さ.length) { 山.push(深さ.pop() === "ol" ? "</ol>" : "</ul>"); }
        出.push(山.join(""));
        continue;
      }

      /* 空行＝段落の切れ目 */
      if (!l.trim()) { 段落を閉じる(積); i++; continue; }

      積.push(l);
      i++;
    }
    段落を閉じる(積);
    return 出.join("");
  }

  /* 飾りを 落として 素の文にする（読み上げ・記録・字数に使う） */
  function 素(src) {
    return 文(src)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*#{1,6}\s+/gm, "")
      /* 2026-08-20 に 足した 形も 落とす（残すと 声が「かぎかっこ びっくり
         メモ」と 読み上げる。記号は 目で 読むもの）。 */
      .replace(/^\s*\?\?\?\s*/gm, "")
      .replace(/^\s*&gt;\s?/gm, "").replace(/^\s*>\s?/gm, "")
      .replace(/\[!\s*[^\]\n]*\]\s?/g, "")
      .replace(/^\s*([-*+]|\d+\.)\s+\[[ xX]\]\s+/gm, "")
      .replace(/\[\[([^\]\n]{1,24})\]\]/g, "$1")
      .replace(/\{([^{}|\n]{1,24})\|[^{}|\n]{1,24}\}/g, "$1")
      .replace(/([^\s《》|]{1,16})《[ぁ-んァ-ヶーぁ-ゖ・]{1,24}》/g, "$1")
      .replace(/\^([^\^\s]{1,12})\^/g, "$1")
      .replace(/~([^~\s]{1,12})~/g, "$1")
      .replace(/\s::\s+/g, "は ")
      .replace(/\*\*|__|~~|==([rbgyp]:)?|`/g, "")
      .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
      .replace(/\|/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  /* 飾りが 入っていそうか（入っていなければ そのまま 文字で出す） */
  function 飾りがある(src) {
    var s = 文(src);
    return /(^|\n)\s*#{1,6}\s|\*\*|__|~~|==|```|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|(^|\n)\s*&?gt;?\s|\|.*\|/.test(s)
      /* ★ 数式は **$ だけでは ない**（2026-08-17）。\(…\)・\[…\]・
         \begin{…} も 数式。ここで 見落とすと、帯（島）が
         素の字のまま 出す。 */
      || /\$[^$\n]+\$/.test(s)
      || /\\\([\s\S]+?\\\)/.test(s)
      || /\\\[[\s\S]+?\\\]/.test(s)
      || /\\begin\{[a-zA-Z*]+\}/.test(s)
      /* 囲みの無い \frac{…} なども 数式（訴え「frac が 効いていない」） */
      || /\\(frac|dfrac|cfrac|sqrt|sum|int|lim|binom|vec|overline|times|div|pm|leq|geq|neq|approx|pi|theta|alpha|beta|infty|cdot)\b/.test(s);
  }

  function CSS() {
    return [
      ".vqmd{line-height:1.75;word-break:break-word;}",
      /* ══ 字の色は **必ず 受け継ぐ**（2026-08-20・訴え）════════════════
         「ダークモードだと 表とかの 文字が 黒くて 何も わからん」
         ★ 板は 影の DOM では ない（ふつうの 要素）。だから **本体の CSS が
           そのまま 届く**。どこかに table や td の 色が 書いてあると、
           暗い画面でも 黒い字のままに なる。
         ★ 中の 決まりで 色を 決めない。**入れ物の 色を 受け継ぐ**。
           そうすれば 明るくても 暗くても 必ず 読める。
         ★ 色で 見分けるもの（蛍光ペン・注意書きの 印）は 下で 別に 決める。 */
      ".vqmd table,.vqmd th,.vqmd td,.vqmd thead,.vqmd tbody,.vqmd tr,",
      ".vqmd p,.vqmd li,.vqmd ul,.vqmd ol,.vqmd dl,.vqmd dt,.vqmd dd,",
      ".vqmd blockquote,.vqmd pre,.vqmd code,.vqmd details,.vqmd summary,",
      ".vqmd h1,.vqmd h2,.vqmd h3,.vqmd h4,.vqmd h5,.vqmd h6,",
      ".vqmd strong,.vqmd em,.vqmd b,.vqmd i,.vqmd u,.vqmd s,.vqmd ruby,.vqmd rt,",
      ".vqmd sup,.vqmd sub,.vqmd kbd{color:inherit;}",
      ".vqmd p{margin:.35em 0;}",
      ".vqmd .vqmd-h{margin:.5em 0 .3em;font-weight:700;line-height:1.4;}",
      ".vqmd h1.vqmd-h{font-size:1.24em}.vqmd h2.vqmd-h{font-size:1.14em}",
      ".vqmd h3.vqmd-h{font-size:1.06em}.vqmd h4.vqmd-h,.vqmd h5.vqmd-h,.vqmd h6.vqmd-h{font-size:1em}",
      ".vqmd strong{font-weight:700;}",
      ".vqmd u{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px;}",
      ".vqmd s{opacity:.6;}",
      ".vqmd mark{background:rgba(255,214,0,.34);color:inherit;padding:0 .18em;border-radius:4px;}",
      ".vqmd mark.vqmd-r{background:rgba(229,72,77,.28);}",
      ".vqmd mark.vqmd-b{background:rgba(43,112,239,.24);}",
      ".vqmd mark.vqmd-g{background:rgba(46,160,67,.26);}",
      ".vqmd mark.vqmd-y{background:rgba(255,214,0,.34);}",
      ".vqmd mark.vqmd-p{background:rgba(138,129,194,.30);}",
      ".vqmd mark.vqmd-o{background:rgba(255,140,0,.30);}",
      ".vqmd u.vqmd-un{text-decoration-color:rgba(229,72,77,.75);}",
      ".vqmd .vqmd-no{display:inline-flex;align-items:center;justify-content:center;",
      "min-width:1.15em;height:1.15em;margin-right:.25em;border-radius:999px;",
      "background:rgba(229,72,77,.85);color:#fff;font-size:.72em;font-style:normal;",
      "font-weight:700;vertical-align:.08em;}",
      ".vqmd .vqmd-l{text-decoration:underline;opacity:.85;}",
      ".vqmd .vqmd-c{background:rgba(127,127,127,.18);border-radius:5px;padding:.05em .32em;",
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;}",
      ".vqmd .vqmd-pre{background:rgba(127,127,127,.14);border-radius:10px;padding:.6em .7em;",
      "overflow-x:auto;margin:.4em 0;}",
      ".vqmd .vqmd-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;",
      "white-space:pre;background:none;padding:0;}",
      ".vqmd .vqmd-q{margin:.4em 0;padding:.25em .7em;border-left:3px solid currentColor;opacity:.85;}",
      ".vqmd .vqmd-hr{border:0;border-top:1px solid currentColor;opacity:.22;margin:.6em 0;}",
      ".vqmd .vqmd-ul,.vqmd .vqmd-ol{margin:.3em 0;padding-left:1.35em;}",
      ".vqmd li{margin:.12em 0;}",
      ".vqmd .vqmd-tw{overflow-x:auto;margin:.45em 0;}",
      ".vqmd .vqmd-t{border-collapse:collapse;font-size:.94em;min-width:100%;}",
      ".vqmd .vqmd-t th,.vqmd .vqmd-t td{border:1px solid rgba(127,127,127,.35);",
      "padding:.28em .5em;text-align:left;white-space:nowrap;}",
      ".vqmd .vqmd-t th{background:rgba(127,127,127,.16);font-weight:700;color:inherit;}",
      ".vqmd .vqmd-t td{color:inherit;}",
      /* ══ 2026-08-20 に 足した 飾り ══════════════════════════════ */
      ".vqmd .vqmd-ck{list-style:none;margin-left:-1.1em;display:flex;align-items:flex-start;gap:.45em;}",
      ".vqmd .vqmd-bx{flex:0 0 auto;width:1.05em;height:1.05em;margin-top:.32em;border-radius:5px;",
      "border:1.6px solid currentColor;opacity:.55;display:inline-flex;align-items:center;",
      "justify-content:center;font-size:.78em;line-height:1;font-weight:800;}",
      ".vqmd .vqmd-ck.on{opacity:.7;}",
      /* ★ **塗りつぶさない**（2026-08-20・実測で 踏んだ）。
         もとは 箱を currentColor で 塗り、中の ✓ を
         var(--vq-surface,#fff) に していた。ところが
           ① 同じ要素に color を 書くと、background:currentColor は
              **その color**を 見る。つまり 白い箱に 白い ✓ で **消える**
           ② 隠すための font-size:0 が width:1.05em にも 効いて **箱が 潰れる**
         枠だけ 残して ✓ は 字の色（濃い色）で 描く。これなら どんな
         背景でも 必ず 見える。 */
      ".vqmd .vqmd-ck.on{opacity:1;}",
      ".vqmd .vqmd-ck.on .vqmd-bx{opacity:.9;border-color:currentColor;}",
      /* 注意書き（コールアウト）。左の 帯だけでは 弱いので 全周を 囲む。 */
      ".vqmd .vqmd-cal{margin:.5em 0;padding:.5em .75em .6em;border-radius:11px;",
      "border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.07);}",
      ".vqmd .vqmd-cal-t{display:flex;align-items:center;gap:.4em;font-weight:750;",
      "font-size:.92em;margin:0 0 .15em;opacity:.95;}",
      /* ══ 印（2026-08-20・訴え「メモの アイコンが 黒くないから
         背景白で アイコンも 白。これ 全部 アイコンが 黒に なるように」）══
         ★ 原因は **同じ要素に color を 書いたこと**。
           background:currentColor は 親の色では なく、**その要素自身の
           color** を 見る。ここでは color:var(--vq-surface,#fff)＝白 だったので、
           背景も 白に なり、白い印が 白い丸に 沈んで **見えなくなっていた**。
         ★ 直しかた: 印は **字の色**（見出しと 同じ 濃い色）で 描く。
           丸は 灰色の うすい 敷きもの。どんな 背景でも 必ず 見える。 */
      ".vqmd .vqmd-cal-i{display:inline-flex;align-items:center;justify-content:center;",
      "width:1.35em;height:1.35em;border-radius:999px;font-size:.82em;font-style:normal;",
      "background:rgba(127,127,127,.16);color:inherit;font-weight:800;}",
      ".vqmd .vqmd-cal-b>*:first-child{margin-top:0;}",
      ".vqmd .vqmd-cal-b>*:last-child{margin-bottom:0;}",
      /* ★ 見分けは **色の字**では なく **印と 枠**で つける（2026-08-20）。
         色の字は 明るい画面と 暗い画面の 両方で 読める色が 無い。
         字は 受け継ぎ（必ず 読める）、印の 丸と 枠に 色を 置く。 */
      ".vqmd .vqmd-cal-memo{border-color:rgba(120,120,140,.42);background:rgba(120,120,140,.10);}",
      ".vqmd .vqmd-cal-memo .vqmd-cal-i{background:rgba(120,120,140,.34);}",
      ".vqmd .vqmd-cal-kan{border-color:rgba(138,129,194,.52);background:rgba(138,129,194,.12);}",
      ".vqmd .vqmd-cal-kan .vqmd-cal-i{background:rgba(138,129,194,.42);}",
      ".vqmd .vqmd-cal-chu{border-color:rgba(229,72,77,.48);background:rgba(229,72,77,.10);}",
      ".vqmd .vqmd-cal-chu .vqmd-cal-i{background:rgba(229,72,77,.40);}",
      ".vqmd .vqmd-cal-kotsu{border-color:rgba(255,160,0,.52);background:rgba(255,180,40,.13);}",
      ".vqmd .vqmd-cal-kotsu .vqmd-cal-i{background:rgba(255,170,20,.42);}",
      ".vqmd .vqmd-cal-rei{border-color:rgba(43,112,239,.44);background:rgba(43,112,239,.09);}",
      ".vqmd .vqmd-cal-rei .vqmd-cal-i{background:rgba(43,112,239,.36);}",
      ".vqmd .vqmd-cal-matome{border-color:rgba(46,160,67,.46);background:rgba(46,160,67,.10);}",
      ".vqmd .vqmd-cal-matome .vqmd-cal-i{background:rgba(46,160,67,.38);}",
      /* たたむ */
      ".vqmd .vqmd-dt{margin:.45em 0;border:1px solid rgba(127,127,127,.28);border-radius:11px;",
      "padding:.1em .75em;background:rgba(127,127,127,.05);}",
      ".vqmd .vqmd-dt>summary{cursor:pointer;font-weight:700;font-size:.95em;padding:.45em 0;",
      "list-style:none;display:flex;align-items:center;gap:.4em;}",
      ".vqmd .vqmd-dt>summary::-webkit-details-marker{display:none;}",
      ".vqmd .vqmd-dt>summary::before{content:'▸';font-size:.9em;opacity:.6;",
      "transition:transform .15s ease;}",
      ".vqmd .vqmd-dt[open]>summary::before{transform:rotate(90deg);}",
      ".vqmd .vqmd-dtb{padding:0 0 .5em;}",
      ".vqmd .vqmd-dtb>*:first-child{margin-top:0;}",
      /* 用語の説明 */
      ".vqmd .vqmd-dl{margin:.45em 0;display:grid;grid-template-columns:auto 1fr;",
      "gap:.18em .7em;align-items:baseline;}",
      ".vqmd .vqmd-dl dt{font-weight:750;white-space:nowrap;}",
      ".vqmd .vqmd-dl dt::after{content:'—';margin-left:.5em;opacity:.35;font-weight:400;}",
      ".vqmd .vqmd-dl dd{margin:0;}",
      "@media (max-width:520px){.vqmd .vqmd-dl{grid-template-columns:1fr;gap:.05em;}",
      ".vqmd .vqmd-dl dt::after{content:'';}.vqmd .vqmd-dl dd{margin:0 0 .3em .8em;opacity:.9;}}",
      /* 押す鍵・ふりがな・上つき下つき */
      ".vqmd .vqmd-k{display:inline-block;padding:.05em .4em;border-radius:6px;font-size:.85em;",
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5;",
      "border:1px solid rgba(127,127,127,.42);border-bottom-width:2px;",
      "background:rgba(127,127,127,.10);}",
      ".vqmd ruby rt{font-size:.55em;opacity:.75;letter-spacing:0;}",
      ".vqmd sup,.vqmd sub{font-size:.72em;line-height:0;}",
      ".vqmd .vqmd-math{display:inline-block;}",
      ".vqmd .vqmd-math-b{display:block;margin:.4em 0;}",
      ".vqmd .vqmd-zu{display:flex;flex-direction:column;gap:.35em;margin:.45em 0;}",
      ".vqmd .vqmd-zu-r{display:flex;align-items:center;gap:.3em;flex-wrap:wrap;}",
      ".vqmd .vqmd-zu-b{border:1px solid currentColor;border-radius:9px;padding:.22em .6em;",
      "opacity:.95;font-size:.95em;}",
      ".vqmd .vqmd-zu-a{opacity:.6;font-style:normal;}",
      ".vqmd .vqmd-zu-f{margin:.2em 0;}",
      ".vqmd .vqmd-geo{margin:.4em 0;}",
      ".vqmd .vqmd-geo-note{font-size:.82em;line-height:1.6;opacity:.75;margin-top:.2em;}",
      ".vqmd .vqmd-geo-ng{margin:.4em 0;padding:.5em .7em;border-radius:9px;",
      "background:rgba(229,72,77,.14);font-size:.9em;line-height:1.6;}",
      /* ★ 実寸で 出す。width を 付けないと SVG は 入れ物いっぱいに 広がり、
         ボードの幅（660px）まで 引き伸ばされて **はみ出して 切れる**
         （実測: 三角形が ボードを 突き抜けた）。 */
      ".vqmd .vqmd-fig{max-width:100%;height:auto;overflow:visible;display:block;}",
      ".vqmd .vqmd-fig .ax{stroke:currentColor;stroke-width:1.4;opacity:.75}",
      ".vqmd .vqmd-fig .tk{stroke:currentColor;stroke-width:1.1;opacity:.55}",
      ".vqmd .vqmd-fig .rg{stroke:#e5484d;stroke-width:3.4;stroke-linecap:round}",
      ".vqmd .vqmd-fig .gl{stroke:#2b70ef;stroke-width:2.4;stroke-linecap:round}",
      ".vqmd .vqmd-fig .pt{fill:#e5484d;stroke:#e5484d;stroke-width:1.6}",
      ".vqmd .vqmd-fig .pto{fill:none;stroke:#e5484d;stroke-width:2}",
      ".vqmd .vqmd-fig .sh{fill:rgba(43,112,239,.10);stroke:currentColor;stroke-width:1.6}",
      ".vqmd .vqmd-fig .rt{fill:none;stroke:currentColor;stroke-width:1.3;opacity:.8}",
      ".vqmd .vqmd-fig .lb{fill:currentColor;font-size:11px;text-anchor:middle;",
      "font-family:inherit;opacity:.9}"
    ].join("");
  }

  VQMD.render = render;
  VQMD.素 = 素;
  VQMD.飾りがある = 飾りがある;
  VQMD.CSS = CSS;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/ar/track.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/ar/track.js — 置いた答えを **紙に貼りつけたまま** にする

   ★ 訴え（2026-08-17）「空欄に 解答を 残しておいてもらえる？
     カメラが 動いても、そこに 表示し続ける仕組み」。

   ★ どうやるか（外の道具を 使わずに）
     置いた瞬間に、その場所の **小さな絵の切れはし（型）**を 覚える。
     次のこまで、その型が どこへ 移ったかを **近くだけ探す**。
     見つかった所へ 印を 動かす。これを 毎こま 繰り返す。
     いわゆる テンプレート追跡。重い道具（OpenCV など 8MB）は 要らない。

   ★ 速さのための決めごと（ここを外すと 端末が 熱くなる）
     ・**小さくしてから 探す。**240×180 の 白黒に 落とす。
       元の 1280×720 のまま探すと 24 倍の手間になる。
     ・**近くだけ 探す。**紙は 1/10 秒で 画面の端から端へは 動かない。
     ・**粗く → 細かく。**まず 2 px とびで あたりを付け、そこだけ 1 px で詰める。
     ・見失ったら **黙って 別の所を指さない。**自信が落ちたら 薄くして、
       それでも 戻らなければ 消す。**間違った所を 指すより、消えるほうが まし。**

   ★ 返す座標は **0〜1 の割合**。px で返すと 小窓の大きさが変わったときに ずれる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQAR = root.VQAR || (root.VQAR = {});

  /* ★ **探す大きさ**（2026-08-17・実測で 240 から 上げた）。
     240 幅だと、紙の 26 px の字が 10 px まで 縮む。そこから 32 px 四方を
     切り取っても、行を 見分ける だけの 手がかりが 残らない。
     実測: 「問1 2x+3=9」と「問2 2x+4=10」を 取り違えて、隣の行へ 乗り移った。
     480 幅にすると 字は 19 px 残り、数字の ちがいが 効く。
     手間は 4 倍だが、追いかけは 1 秒に 12 回なので 足りる。 */
  var W = 480, H = 360;          /* 探すときの 大きさ（白黒） */
  var 型 = 32;                    /* 覚える切れはしの 一辺（広いほど 見分けが つく） */
  /* ★ 1 回で どれだけ 動いたものまで 追うか（2026-08-17・実測で 決めた）。
     ★ **広げれば よい というものでは ない。**
       ワークの紙は 同じ形の行が だいたい 同じ間隔で 並ぶ（実測で 36 px）。
       探す幅を その間隔より 広げると、**隣の行が 探す範囲に 入ってしまい**、
       札が 行を 乗り移る（実測: 2 つの札が 同じ行へ 重なった）。
       だから 行の間隔より **狭く**しておく。速く動かしたときは
       追えずに 薄くなるが、**違う行を 指すより そのほうが まし。** */
  var 探す幅 = 26;
  var 見失う線 = 34;              /* 1 px あたりの ちがいが これを超えたら 怪しい */
  var 見失う回 = 12;              /* これだけ 続けて 怪しければ 見失い */

  function 白黒にする(状, v) {
    var cv = 状.cv || (状.cv = root.document.createElement("canvas"));
    cv.width = W; cv.height = H;
    var cx = 状.cx || (状.cx = cv.getContext("2d", { willReadFrequently: true }));
    try { cx.drawImage(v, 0, 0, W, H); } catch (e) { return null; }
    var d;
    try { d = cx.getImageData(0, 0, W, H).data; } catch (e2) { return null; }
    var g = 状.g || (状.g = new Uint8Array(W * H));
    for (var i = 0, p = 0; i < g.length; i++, p += 4) {
      /* 目に近い重みで 白黒へ。速さのため 整数で。 */
      g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    }
    return g;
  }

  /* 切れはしを 覚える */
  function 型を取る(g, cx0, cy0) {
    var 半 = 型 >> 1;
    var t = new Uint8Array(型 * 型);
    var k = 0, 合 = 0;
    for (var y = 0; y < 型; y++) {
      var sy = Math.max(0, Math.min(H - 1, cy0 - 半 + y));
      for (var x = 0; x < 型; x++) {
        var sx = Math.max(0, Math.min(W - 1, cx0 - 半 + x));
        var v = g[sy * W + sx];
        t[k++] = v; 合 += v;
      }
    }
    /* のっぺりした所は 追えない（白い紙の 真ん中など）。
       ちがいの大きさで 見分けて、追えないものは 追えないと言う。 */
    var 平 = 合 / t.length, ばらつき = 0;
    for (var i = 0; i < t.length; i++) { var d2 = t[i] - 平; ばらつき += d2 * d2; }
    /* ★ **ばらつきだけでは 足りない**（2026-08-17・実測）。
       答え欄の 横線は ばらつきが 大きいのに、**どの行も 同じ形**なので
       追いかけると 隣の行と 区別が つかない（実測: 決められず 止まった）。
       横の変わりめ（gx）と 縦の変わりめ（gy）を **別々に**数えて、
       **小さいほうを 点にする。**
         横線   … gy は 大きいが gx は ほぼ 0 → 点 0（選ばない）
         縦線   … その逆 → 点 0
         文字・角… どちらも 大きい → 点が 高い（選ぶ）
       これで 錨は「字のある所」に 落ちる。 */
    var gx = 0, gy = 0;
    for (var y2 = 1; y2 < 型 - 1; y2++) {
      for (var x2 = 1; x2 < 型 - 1; x2++) {
        var c = y2 * 型 + x2;
        var a1 = t[c + 1] - t[c - 1]; if (a1 < 0) a1 = -a1;
        var b1 = t[c + 型] - t[c - 型]; if (b1 < 0) b1 = -b1;
        gx += a1; gy += b1;
      }
    }
    var n2 = (型 - 2) * (型 - 2);
    return { 画: t, ばらつき: Math.sqrt(ばらつき / t.length),
             角らしさ: Math.min(gx, gy) / n2 };
  }

  /* 型が どこへ 行ったか。返り { x, y, ちがい, 二番, 迷い }
     ★ **二番目に よかった所も 返す**（2026-08-17・実測で必要だった）。
       ワークの紙は「問1 …」「問2 …」と **同じ形の行が 並ぶ**。
       いちばん似た所だけを 見ていると、隣の行へ 乗り換えて 流されていく
       （実測: 1 秒で 画面の端まで 447 px 飛んだ）。
       二番目と ほとんど 差が無いときは「決められない」として **動かさない**。 */
  function 探す(g, t, cx0, cy0, 幅, とび) {
    var 半 = 型 >> 1;
    var 最良 = 1e9, bx = cx0, by = cy0;
    var 候補 = [];
    for (var dy = -幅; dy <= 幅; dy += とび) {
      for (var dx = -幅; dx <= 幅; dx += とび) {
        var ox = cx0 + dx, oy = cy0 + dy;
        if (ox - 半 < 0 || oy - 半 < 0 || ox + 半 >= W || oy + 半 >= H) continue;
        var 和 = 0, k = 0, 打ち切り = false;
        for (var y = 0; y < 型; y += 2) {
          var sy = (oy - 半 + y) * W + (ox - 半);
          var ty = y * 型;
          for (var x = 0; x < 型; x += 2) {
            var d3 = g[sy + x] - t[ty + x];
            和 += d3 < 0 ? -d3 : d3;
            k++;
          }
          if (和 / (k || 1) > 最良 * 2.2) { 打ち切り = true; break; }
        }
        if (打ち切り) continue;
        var 平 = 和 / (k || 1);
        候補.push({ x: ox, y: oy, 平: 平 });
        if (平 < 最良) { 最良 = 平; bx = ox; by = oy; }
      }
    }
    /* いちばんから 離れた所での 二番目（すぐ隣は 同じ山なので 数えない） */
    var 二番 = 1e9;
    for (var i = 0; i < 候補.length; i++) {
      var c = 候補[i];
      var dd = (c.x - bx) * (c.x - bx) + (c.y - by) * (c.y - by);
      if (dd < 36) continue;
      if (c.平 < 二番) 二番 = c.平;
    }
    return { x: bx, y: by, ちがい: 最良, 二番: 二番,
             /* 二番が すぐ後ろに 迫っていたら 決められない */
             迷い: 二番 < 1e9 && 最良 > 0 ? (二番 / 最良) < 1.18 : false };
  }

  /* ══ 本体 ═══════════════════════════════════════════════════════ */
  function 作る() {
    var 状 = { 印: [], 前: null, 動いた: 0 };

    /* 置く。x, y は 0〜1 の割合。
       ★ **空欄そのものは 追えない**（2026-08-17・実測で分かった）。
         答えを入れる所は 白紙なので、覚える切れはしに 何の目印も 無い。
         これは 試験の作りの話ではなく、**本物の紙でも 必ず起きる**。
       ★ だから **近くの 字を 目印にする。**まわりを 見回して、
         いちばん 模様のある所を 錨にし、そこから **どれだけ ずれた所か**を
         覚えておく。追うのは 錨。札は 錨＋ずれ に 出す。
         これが 追跡の ふつうのやり方（目印を追い、離れた所へ 描く）。 */
    function 錨をさがす(g, cx0, cy0) {
      var 良 = null;
      /* ★ **広く 見回す**（2026-08-17・実測）。答え欄は 字から 離れている
         ことが 多く、狭く探すと 横線しか 見つからない。
         横線は どの行も 同じなので 追えない。字まで 届く広さが 要る。 */
      var 半径 = 150, とび = 12;
      for (var dy = -半径; dy <= 半径; dy += とび) {
        for (var dx = -半径; dx <= 半径; dx += とび) {
          var ax = cx0 + dx, ay = cy0 + dy;
          var 半 = 型 >> 1;
          if (ax - 半 < 0 || ay - 半 < 0 || ax + 半 >= W || ay + 半 >= H) continue;
          var t = 型を取る(g, ax, ay);
          /* 近いほうが よい（遠い錨は 紙が ゆがむと ずれる）。
             ばらつきから 距離ぶんを 少し 引いて 比べる。 */
          /* 点は **角らしさ**が 主。ばらつきは 少しだけ 足す。
             近いほうが よい（遠い錨は 紙が ゆがむと ずれる）。 */
          var 点 = t.角らしさ * 6 + t.ばらつき * 0.15
                 - Math.sqrt(dx * dx + dy * dy) * 0.03;
          if (!良 || 点 > 良.点) 良 = { x: ax, y: ay, 型: t, 点: 点 };
        }
      }
      return 良;
    }

    function 置く(v, id, x, y, 中身) {
      var g = 白黒にする(状, v);
      if (!g) return { だめ: "映像が まだ 来ていません。" };
      var cx0 = Math.round(Math.max(0, Math.min(1, x)) * (W - 1));
      var cy0 = Math.round(Math.max(0, Math.min(1, y)) * (H - 1));
      var 錨 = 錨をさがす(g, cx0, cy0);
      var t = 錨 ? 錨.型 : 型を取る(g, cx0, cy0);
      var ax = 錨 ? 錨.x : cx0, ay = 錨 ? 錨.y : cy0;
      var 印 = { id: String(id), x: ax, y: ay,
                 /* 札を 出す所は 錨から この分 ずれた所 */
                 ずれx: cx0 - ax, ずれy: cy0 - ay,
                 型: t.画,
                 /* 置いたときの 型は **そのまま 取っておく**（流れの見張り用） */
                 元型: t.画.slice(0),
                 ばらつき: t.ばらつき, 角らしさ: t.角らしさ,
                 追える: t.角らしさ >= 1.2, 見失い: 0, 生きている: true,
                 濃さ: 1, 中身: 中身 || {} };
      /* 同じ id は 置き換える（同じ空欄に 2 つ 出さない） */
      状.印 = 状.印.filter(function (p) { return p.id !== 印.id; });
      状.印.push(印);
      while (状.印.length > 12) 状.印.shift();
      return { 置いた: true, 追える: 印.追える,
               錨ずれ: { x: -印.ずれx, y: -印.ずれy },
               角らしさ: Math.round(印.角らしさ * 100) / 100,
               なぜ追えない: 印.追える ? ""
                 : "そばに 目印になる字が ありません（その場に 固定します）" };
    }

    /* 1 こまぶん 追う。返り [{id, x, y, 濃さ, 生きている, 中身}] */
    function 追う(v) {
      if (!状.印.length) return [];
      var g = 白黒にする(状, v);
      if (!g) return いまの位置();
      状.印.forEach(function (p) {
        if (!p.生きている || !p.追える) return;
        /* 粗く（2 px とび）→ そのまわりを 細かく（1 px） */
        /* 広い所は 3 px とび（手間を 抑える）→ 近くを 1 px で 詰める */
        var a = 探す(g, p.型, p.x, p.y, 探す幅, 3);
        var b = 探す(g, p.型, a.x, a.y, 3, 1);
        var 良 = b.ちがい <= a.ちがい ? b : a;
        /* ★ **決められないときは 動かさない**（同じ形の行が 並ぶ紙の対策）。
           動かさずに 待てば、次のこまで はっきりすることが 多い。 */
        if (a.迷い) {
          p.迷い = (p.迷い || 0) + 1;
          if (p.迷い > 20) { p.生きている = false; p.濃さ = 0; }
          else p.濃さ = 0.75;
          return;
        }
        p.迷い = 0;
        if (良.ちがい > 見失う線) {
          p.見失い++;
          p.濃さ = Math.max(0, 1 - p.見失い / 見失う回);
          if (p.見失い >= 見失う回) { p.生きている = false; p.濃さ = 0; }
          return;
        }
        /* ★ **置いたときの 型からも 離れすぎていないか** を 見る。
           流されると、いまの型とは 合うのに 最初の型とは 合わなくなる。 */
        if (p.元型) {
          var 元 = 探す(g, p.元型, 良.x, 良.y, 3, 1);
          if (元.ちがい > 見失う線 * 1.5) {
            p.見失い++;
            p.濃さ = Math.max(0, 1 - p.見失い / 見失う回);
            if (p.見失い >= 見失う回) { p.生きている = false; p.濃さ = 0; }
            return;
          }
        }
        /* ★ **紙は 一瞬で ワープしない**（2026-08-17・実測で 要ると分かった）。
           同じ形の行が 並ぶ紙では、いちばん似た所が **隣の行**に
           なることが ある。1 回の 追いかけ（1/12 秒）で 動ける量を
           行の間隔より 小さく 抑えれば、行を 乗り移れなくなる。
           速く動かしすぎたときは 追えずに 薄くなる。**違う行を 指すより まし。** */
        var 跳び = Math.sqrt((良.x - p.x) * (良.x - p.x) + (良.y - p.y) * (良.y - p.y));
        if (跳び > 14) {
          p.迷い = (p.迷い || 0) + 1;
          p.濃さ = 0.75;
          if (p.迷い > 20) { p.生きている = false; p.濃さ = 0; }
          return;
        }
        p.見失い = 0; p.濃さ = 1;
        p.x = 良.x; p.y = 良.y;
        /* 少しずつ 型を 今の見た目へ 寄せる（光が変わっても 追えるように）。
           **迷いが 無く、よく合ったときだけ。**ここを 緩めると 流される。 */
        if (良.ちがい < 見失う線 * 0.4) {
          var 新 = 型を取る(g, p.x, p.y);
          for (var i = 0; i < p.型.length; i++) {
            p.型[i] = (p.型[i] * 15 + 新.画[i]) >> 4;
          }
        }
      });
      状.印 = 状.印.filter(function (p) { return p.生きている; });
      return いまの位置();
    }

    function いまの位置() {
      return 状.印.map(function (p) {
        /* ★ 返すのは **札を出す所**（錨＋ずれ）。錨そのものでは ない。 */
        var sx = Math.max(0, Math.min(W - 1, p.x + (p.ずれx || 0)));
        var sy = Math.max(0, Math.min(H - 1, p.y + (p.ずれy || 0)));
        return { id: p.id, x: sx / (W - 1), y: sy / (H - 1),
                 錨x: p.x / (W - 1), 錨y: p.y / (H - 1),
                 濃さ: p.濃さ, 生きている: p.生きている, 追える: p.追える, 中身: p.中身 };
      });
    }

    function 消す(id) {
      var 前 = 状.印.length;
      if (id === undefined) 状.印 = [];
      else 状.印 = 状.印.filter(function (p) { return p.id !== String(id); });
      return 前 - 状.印.length;
    }

    function 数() { return 状.印.length; }

    return { 置く: 置く, 追う: 追う, 消す: 消す, 数: 数, いまの位置: いまの位置,
             設定: { W: W, H: H, 型: 型, 探す幅: 探す幅, 見失う線: 見失う線 } };
  }

  VQAR.作る = 作る;
  VQAR.設定 = { W: W, H: H, 型: 型, 探す幅: 探す幅, 見失う線: 見失う線, 見失う回: 見失う回 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/geo/draw.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/geo/draw.js — 図形を **座標で** 描く

   ★ 訴え（2026-08-17）「ガチの数学図形を 書けるエンジンも 作れば？
     ただ **位置がずれたり、大きさが違ってたりするのは おかしい**。
     そういうのは 無いようにして」。

   ★ ずれない・違わない ための 決めごと（ここが この道具の 全部）
     ① **すべて 座標で 決める。**見た目で 置かない。
        点は (x, y)。線は 点と点。円は 中心と半径。
     ② **縦と横で 同じ倍率**を使う（uniform scale）。
        縦横で 別の倍率を 使うと、正方形が 長方形に、円が 楕円に なる。
        ここを 守れば **形は 絶対に 崩れない。**
     ③ **長さは 座標から 計算して 出す。**書かれた数字を そのまま 貼らない。
        書かれた数字と 計算が 合わなければ **描かずに 断る。**
        合っていない図を 出すほうが、出さないより 悪い（覚え違いのもと）。
     ④ 辺の長さだけ 渡されたときは **こちらで 座標を 作る**
        （余弦定理。3, 4, 5 なら ぴったり 直角三角形になる）。
     ⑤ 三角形が 成り立たない（2辺の和 ≦ 残り1辺）なら **断る。**

   ★ 書きかた（1 行に 1 つ）
       点 A(0,0) B(4,0) C(0,3)
       三角形 A B C          多角形 A B C D
       三角形 3,4,5          ← 辺の長さだけでも よい（座標は こちらで 作る）
       線 A-B                線 A-B B-C
       円 A r=2              円 (2,2) r=2
       直角 A                ← A の角に 直角の印
       辺 A-B                ← 長さを 座標から 出して 貼る
       辺 A-B = 4            ← 合っているか 確かめてから 貼る（違えば 断る）
       角 A                  ← 角度を 座標から 出して 貼る
       印 A-B B-C            ← 同じ長さの印（等辺の しるし）
       軸                    ← 座標軸と 方眼
       関数 y = 2x + 1       ← 1 次・2 次
       ラベル A 左上
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function 距離(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }

  /* ══ 3 辺から 座標を 作る（余弦定理）════════════════════════════
     A を 原点、B を x 軸の上に 置く。C は そこから 一意に 決まる。
     **これで 3 辺の 長さは 必ず 合う。** */
  function 三辺から(a, b, c) {
    /* a = AB, b = AC, c = BC */
    if (!(a > 0 && b > 0 && c > 0)) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;   /* 作れない */
    var cosA = (a * a + b * b - c * c) / (2 * a * b);
    if (cosA < -1 || cosA > 1) return null;
    var A = Math.acos(cosA);
    return { A: { x: 0, y: 0 }, B: { x: a, y: 0 },
             C: { x: b * Math.cos(A), y: b * Math.sin(A) } };
  }

  /* ══ 読む ═══════════════════════════════════════════════════════
     ★ **書き方の ゆれを 受け入れる**（2026-08-17・実測で 直した）。
       13 通り 試して 6 通りが 落ちていた。落ちていたのは:
         ・「点」を 書かずに  A(0,0) B(4,0)
         ・全角のかっこ       A（0,0）
         ・くっついた 名前     三角形ABC
         ・ハイフン無し        辺 AB = 4
         ・コメントや 説明文が 1 行 混ざった
         ・英語（point / polygon）
       AI は こういう 書き方を ふつうに する。**受ける側が 合わせる。**
     ★ そして **読めない行 1 つで 全部を 捨てない。**
       分からない行は 飛ばして 覚え書きに 残し、分かるものだけ 描く。
       止めるのは「数が 合っていない」ときだけ（そこは 嘘になるので）。 */
  function 正す(l) {
    return 文(l)
      .replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/[，、]/g, ",").replace(/[：]/g, ":").replace(/[＝]/g, "=")
      .replace(/[－ー–—]/g, "-").replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/^\s*(?:\/\/|#|;)\s*.*$/, "")          /* コメント行は 落とす */
      .trim();
  }
  /* ★ 日本語の 寸法語を そろえる（2026-08-17・実測で 足した）。
     「円: 半径3」のように **半径 と 書かれた行が 座標エンジンに 来る**。
     r= に 直しておかないと「円の 半径が 読めません」で 落ちていた。
     そろえる中身は more.js と 同じものを 使う（二重に 持たない）。 */
  function 言い回しをそろえる(l) {
    var t = 正す(l);
    try {
      var M = (root.VQG || {}).more;
      if (M && M.引数を正す) {
        var m = /^([^\s:：]+)([\s\S]*)$/.exec(t);
        if (m) t = (m[1] + " " + M.引数を正す(m[2] || "")).replace(/\s{2,}/g, " ").trim();
      }
    } catch (e) {}
    return t;
  }
  /* 英語の 言いかたを 日本語へ そろえる */
  var 言い換え = [
    [/^point\b/i, "点"], [/^(line|segment)\b/i, "線"], [/^circle\b/i, "円"],
    [/^(triangle|tri)\b/i, "三角形"], [/^(polygon|poly|quad|rect(angle)?)\b/i, "多角形"],
    [/^(side|edge)\b/i, "辺"], [/^angle\b/i, "角"], [/^right(\s*angle)?\b/i, "直角"],
    [/^(axis|axes|grid)\b/i, "軸"], [/^(function|graph|plot)\b/i, "関数"],
    [/^label\b/i, "ラベル"], [/^(mark|tick)\b/i, "印"]
  ];

  /* ★ **日本語の あとに \b は 使えない**（2026-08-17・実測で つまずいた）。
     \b は A-Za-z0-9_ の 境目のこと。「辺 A-B」の 辺 と 空白の 間には
     境目が 無いので /^辺\b/ は **当たらない**。当たらないと その行は
     黙って 飛ばされ、長さの 食い違いの 検査まで 素通りしていた
     （食い違った図が そのまま 描かれた）。(?:\s|$|[:：]) で 見る。 */
  function 読む(本文) {
    var 図 = { 点: {}, 線: [], 円: [], 直角: [], 辺: [], 角: [], 印: [],
               軸: false, 関数: [], ラベル: {}, 多角形: [], 崩れ: [], 飛ばした: [],
               ちがい: [] };
    var 行 = 文(本文).split("\n").map(言い回しをそろえる).filter(Boolean);

    /* ★ 先に **座標を 全部 拾う**（「点」と 書かれていなくてもよい）。
       これを 先にやると、あとの 行で 名前だけ 使われても 通る。 */
    行.forEach(function (l) {
      var re0 = /([A-Za-z][A-Za-z0-9']?)\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m0;
      while ((m0 = re0.exec(l))) {
        if (/^(円|circle)\b/.test(l)) continue;          /* 円の 中心は 別で 扱う */
        図.点[m0[1]] = { x: 数(m0[2], 0), y: 数(m0[3], 0) };
      }
    });
    /* くっついた 名前（三角形ABC）を ばらす。既に 決まっている点だけ。 */
    function 名をばらす(t) {
      var 名 = t.split(/[\s,、-]+/).filter(Boolean);
      if (名.length >= 3) return 名;
      var 出 = [], 一 = t.replace(/[^A-Za-z0-9']/g, "");
      for (var i = 0; i < 一.length; i++) {
        var a = 一.charAt(i), b = 一.charAt(i + 1);
        if (b && /[0-9']/.test(b) && 図.点[a + b]) { 出.push(a + b); i++; }
        else 出.push(a);
      }
      return 出;
    }

    行.forEach(function (l0) {
      var m;
      var l = l0;
      言い換え.forEach(function (x) { l = l.replace(x[0], x[1]); });
      /* 点 A(0,0) B(4,0) … */
      /* 点は **先に 拾ってある**。ここでは 何もしない（二度 拾わない）。 */
      if (/^点(?:\s|$)/.test(l) || /^[A-Za-z][A-Za-z0-9']?\s*\(/.test(l)) return;
      /* 三角形 3,4,5 ／ 三角形 A B C ／ 多角形 A B C D */
      if ((m = /^(三角形|多角形|四角形)\s*[:：]?\s*(.+)$/.exec(l))) {
        var 中 = m[2].trim();
        var 数ら = 中.split(/[,、\s]+/).map(Number).filter(function (x) { return isFinite(x) && x > 0; });
        if (m[1] === "三角形" && 数ら.length >= 3 && !/[A-Za-z]/.test(中.replace(/[\d.,\s直角]/g, ""))) {
          var t = 三辺から(数ら[0], 数ら[1], 数ら[2]);
          if (!t) { 図.崩れ.push("その 3 辺では 三角形が 作れません（" + 数ら.slice(0, 3).join(", ") + "）"); return; }
          図.点.A = t.A; 図.点.B = t.B; 図.点.C = t.C;
          図.多角形.push(["A", "B", "C"]);
          図.辺.push({ a: "A", b: "B" }); 図.辺.push({ a: "A", b: "C" }); 図.辺.push({ a: "B", b: "C" });
          if (/直角/.test(中) || Math.abs(数ら[0] * 数ら[0] + 数ら[1] * 数ら[1] - 数ら[2] * 数ら[2]) < 1e-6) {
            図.直角.push("A");
          }
          return;
        }
        var 名 = 名をばらす(中);
        if (名.length < 3) { 図.飛ばした.push("点が 足りません: " + l0); return; }
        図.多角形.push(名);
        return;
      }
      /* 線 A-B B-C */
      if (/^(線|線分)(?:\s|$|[:：])/.test(l)) {
        var 中2 = l.replace(/^(線|線分)\s*[:：]?\s*/, "");
        var re2 = /([A-Za-z][A-Za-z0-9']?)\s*-\s*([A-Za-z][A-Za-z0-9']?)/g;
        var n2 = 0;
        while ((m = re2.exec(中2))) { 図.線.push({ a: m[1], b: m[2] }); n2++; }
        if (!n2) {
          /* ハイフンが 無い書きかた（線 AB / 線 AB BC） */
          中2.split(/[\s,]+/).filter(Boolean).forEach(function (t) {
            var 名 = 名をばらす(t);
            for (var i = 0; i + 1 < 名.length; i++) { 図.線.push({ a: 名[i], b: 名[i + 1] }); n2++; }
          });
        }
        if (!n2) 図.飛ばした.push("線が 読めません: " + l0);
        return;
      }
      /* 円 A r=2 ／ 円 (2,2) r=2 */
      if (/^円(?:\s|$|[:：])/.test(l)) {
        var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(l) || [])[1], null);
        if (r === null || r <= 0) { 図.崩れ.push("円の 半径が 読めません: " + l); return; }
        var c1 = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(l);
        if (c1) 図.円.push({ c: { x: 数(c1[1], 0), y: 数(c1[2], 0) }, r: r });
        else {
          /* ★ 「円 r=3」の r を **中心の 名前と 読んでしまう**（2026-08-17・実測）。
             うしろが = なら それは 中心では なく 値の 名前。 */
          var nm = (/^円\s+([A-Za-z][A-Za-z0-9']?)(?!\s*=)/.exec(l) || [])[1];
          /* ★ 中心が 書かれていないなら **原点に 置く**（2026-08-17）。
             「円: 半径3」だけで 描けないのは おかしい。断る理由が 無い。 */
          if (!nm) { 図.円.push({ c: { x: 0, y: 0 }, r: r }); return; }
          図.円.push({ 名: nm, r: r });
        }
        return;
      }
      if ((m = /^直角\s*[:：]?\s*([A-Za-z][A-Za-z0-9']?)/.exec(l))) { 図.直角.push(m[1]); return; }
      if (/^直角$/.test(l)) return;               /* 「直角」だけの行は 印だけ（点は 三角形が 決める） */
      if (/^辺(?:\s|$|[:：])/.test(l)) {
        var 中3 = l.replace(/^辺\s*[:：]?\s*/, "");
        var mm = /^([A-Za-z][A-Za-z0-9']?)\s*-\s*([A-Za-z][A-Za-z0-9']?)(?:\s*=\s*(-?[\d.]+))?/.exec(中3);
        if (!mm) mm = /^([A-Za-z])([A-Za-z])(?:\s*=\s*(-?[\d.]+))?/.exec(中3);
        if (!mm) { 図.飛ばした.push("辺が 読めません: " + l0); return; }
        図.辺.push({ a: mm[1], b: mm[2], 言われた: mm[3] === undefined ? null : 数(mm[3], null) });
        return;
      }
      if ((m = /^角\s+([A-Za-z][A-Za-z0-9']?)(?:\s*=\s*(-?[\d.]+))?/.exec(l))) {
        図.角.push({ p: m[1], 言われた: m[2] === undefined ? null : 数(m[2], null) });
        return;
      }
      if (/^印\s/.test(l)) {
        var re3 = /([A-Za-z][A-Za-z0-9']?)\s*[-–—]\s*([A-Za-z][A-Za-z0-9']?)/g;
        while ((m = re3.exec(l))) 図.印.push({ a: m[1], b: m[2] });
        return;
      }
      if (/^(軸|座標軸|方眼)$/.test(l)) { 図.軸 = true; return; }
      if ((m = /^関数\s+(.+)$/.exec(l))) { 図.関数.push(m[1]); 図.軸 = true; return; }
      if ((m = /^ラベル\s+([A-Za-z][A-Za-z0-9']?)\s+(.+)$/.exec(l))) { 図.ラベル[m[1]] = m[2].trim(); return; }
      /* ★ 分からない行は **飛ばすだけ**。1 行のために 図を 捨てない。 */
      図.飛ばした.push(l0);
    });
    return 図;
  }

  /* ══ 直せるものは 直す（2026-08-17・実測で 足した）══════════════
     ★ AI は 「三角形 A B C」と 書きながら、座標を いいかげんに 決めて
       そのくせ 「辺 A-B = 3」と 正しい長さを 書く——という 書き方を する。
       前は それを **食い違い**として 全部 断っていた（図が 出ない）。
     ★ 3 辺とも 長さが 書いてあるなら、**その長さから 座標を 作り直す。**
       そうすれば 図も 数字も 正しくなる。断るより ずっとよい。
     ★ 作り直せないときだけ、**座標を 正として 計算した数字を 出す**
       （書かれた数字は 使わない。嘘の数字を 貼らないため）。 */
  function 直せるなら直す(図) {
    var 直した = [];
    図.多角形.forEach(function (名ら) {
      if (名ら.length !== 3) return;
      var a = 名ら[0], b = 名ら[1], c = 名ら[2];
      var 言 = {};
      図.辺.forEach(function (s) {
        if (s.言われた === null || s.言われた === undefined) return;
        言[[s.a, s.b].sort().join("")] = s.言われた;
      });
      var ab = 言[[a, b].sort().join("")], ac = 言[[a, c].sort().join("")],
          bc = 言[[b, c].sort().join("")];
      if (!(ab > 0 && ac > 0 && bc > 0)) return;
      /* いまの座標で すでに 合っているなら 触らない */
      var P = 図.点;
      if (P[a] && P[b] && P[c]
          && Math.abs(距離(P[a], P[b]) - ab) < Math.max(0.01, ab * 0.01)
          && Math.abs(距離(P[a], P[c]) - ac) < Math.max(0.01, ac * 0.01)
          && Math.abs(距離(P[b], P[c]) - bc) < Math.max(0.01, bc * 0.01)) return;
      var t = 三辺から(ab, ac, bc);
      if (!t) return;                       /* 作れない → あとで 断る */
      図.点[a] = t.A; 図.点[b] = t.B; 図.点[c] = t.C;
      直した.push(a + b + c);
    });
    return 直した;
  }

  /* ══ 確かめる（言われた長さと 座標が 合っているか）════════════ */
  function 確かめる(図) {
    var 悪 = 図.崩れ.slice();
    図.多角形.forEach(function (名ら) {
      名ら.forEach(function (n) { if (!図.点[n]) 悪.push("点 " + n + " が 決まっていません"); });
    });
    図.線.forEach(function (s) {
      if (!図.点[s.a]) 悪.push("点 " + s.a + " が 決まっていません");
      if (!図.点[s.b]) 悪.push("点 " + s.b + " が 決まっていません");
    });
    図.辺.forEach(function (s) {
      var A = 図.点[s.a], B = 図.点[s.b];
      if (!A || !B) { 悪.push("辺 " + s.a + s.b + " の 点が ありません"); return; }
      if (s.言われた === null || s.言われた === undefined) return;
      var 実 = 距離(A, B);
      /* ★ **言われた長さと 座標が 食い違ったら 描かない。**
         見た目だけ 合わせて 数字を 貼ると、**嘘の図**になる。 */
      if (Math.abs(実 - s.言われた) > Math.max(0.01, s.言われた * 0.01)) {
        /* ★ **断らずに 描く**（2026-08-17・訴え「図が 書けないと 言われる」）。
           ただし 貼るのは **座標から 出した数**。書かれた数字は 使わない。
           図が 出ないより、正しい数で 出るほうが よい。
           食い違ったことは 下に 一言 出す（黙って すり替えない）。 */
        図.ちがい.push("辺 " + s.a + s.b + " は 座標から 出すと " + 丸(実, 2)
          + "（書かれていたのは " + s.言われた + "）");
      }
    });
    図.円.forEach(function (c) {
      if (c.名 && !図.点[c.名]) 悪.push("円の 中心 " + c.名 + " が 決まっていません");
    });
    図.直角.forEach(function (n) { if (!図.点[n]) 悪.push("直角の 点 " + n + " が 決まっていません"); });
    return 悪;
  }

  /* ══ 描く ═══════════════════════════════════════════════════════ */
  function 描く(本文, o) {
    o = o || {};
    var 図 = 読む(本文);
    var 直した = 直せるなら直す(図);
    var 悪 = 確かめる(図);
    if (悪.length) return { だめ: 悪.slice(0, 4).join(" ／ "), 崩れ: 悪 };
    var 名ら = Object.keys(図.点);
    if (!名ら.length && !図.円.length && !図.関数.length) {
      return { だめ: "描くものが ありません。" };
    }

    /* ① 入る範囲を 出す */
    var 小x = Infinity, 大x = -Infinity, 小y = Infinity, 大y = -Infinity;
    var 見る = function (x, y) {
      if (x < 小x) 小x = x; if (x > 大x) 大x = x;
      if (y < 小y) 小y = y; if (y > 大y) 大y = y;
    };
    名ら.forEach(function (n) { 見る(図.点[n].x, 図.点[n].y); });
    図.円.forEach(function (c) {
      var C = c.名 ? 図.点[c.名] : c.c;
      見る(C.x - c.r, C.y - c.r); 見る(C.x + c.r, C.y + c.r);
    });
    if (図.軸 || 図.関数.length) { 見る(-3, -3); 見る(3, 3); }
    if (!isFinite(小x)) { 小x = -3; 大x = 3; 小y = -3; 大y = 3; }
    if (大x - 小x < 1e-6) { 小x -= 1; 大x += 1; }
    if (大y - 小y < 1e-6) { 小y -= 1; 大y += 1; }

    /* ② **縦と横で 同じ倍率**。ここが 形を 崩さない かなめ。 */
    var 最大幅 = Math.max(120, Math.min(320, 数(o.幅, 300)));
    var 余 = 26;
    var 幅u = 大x - 小x, 高u = 大y - 小y;
    var s = (最大幅 - 余 * 2) / 幅u;
    var 最大高 = 260;
    if (高u * s > 最大高 - 余 * 2) s = (最大高 - 余 * 2) / 高u;
    var W = Math.round(幅u * s + 余 * 2), H = Math.round(高u * s + 余 * 2);
    var X = function (x) { return 余 + (x - 小x) * s; };
    var Y = function (y) { return H - 余 - (y - 小y) * s; };   /* y は 上向き */

    var g = ['<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="図形">'];

    /* 方眼と 軸 */
    if (図.軸) {
      for (var gx = Math.ceil(小x); gx <= Math.floor(大x); gx++) {
        g.push('<line x1="' + 丸(X(gx), 1) + '" y1="0" x2="' + 丸(X(gx), 1) + '" y2="' + H + '" class="gd"/>');
      }
      for (var gy = Math.ceil(小y); gy <= Math.floor(大y); gy++) {
        g.push('<line x1="0" y1="' + 丸(Y(gy), 1) + '" x2="' + W + '" y2="' + 丸(Y(gy), 1) + '" class="gd"/>');
      }
      if (小y <= 0 && 大y >= 0) g.push('<line x1="0" y1="' + 丸(Y(0), 1) + '" x2="' + W + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
      if (小x <= 0 && 大x >= 0) g.push('<line x1="' + 丸(X(0), 1) + '" y1="0" x2="' + 丸(X(0), 1) + '" y2="' + H + '" class="ax"/>');
    }

    /* 関数（1 次・2 次） */
    図.関数.forEach(function (式) {
      var q = /y\s*=\s*(-?[\d.]*)\s*x\s*\^?\s*2\s*([+-]\s*[\d.]*)\s*x?\s*([+-]\s*[\d.]+)?/i.exec(式);
      var f = null;
      if (q) {
        var A2 = q[1] === "" ? 1 : (q[1] === "-" ? -1 : 数(q[1], 1));
        var B2 = 数(String(q[2] || "0").replace(/\s+/g, ""), 0);
        var C2 = 数(String(q[3] || "0").replace(/\s+/g, ""), 0);
        f = function (x) { return A2 * x * x + B2 * x + C2; };
      } else {
        var li = /y\s*=\s*(-?[\d.]*)\s*x?\s*([+-]\s*[\d.]+)?/i.exec(式);
        if (!li) return;
        var a3 = li[1] === "" ? (/x/.test(式) ? 1 : 0) : (li[1] === "-" ? -1 : 数(li[1], 1));
        var b3 = 数(String(li[2] || "0").replace(/\s+/g, ""), 0);
        f = function (x) { return a3 * x + b3; };
      }
      var pts = [];
      for (var i = 0; i <= 120; i++) {
        var x2 = 小x + (大x - 小x) * i / 120, y2 = f(x2);
        if (y2 < 小y - 1 || y2 > 大y + 1) { if (pts.length) { g.push('<polyline points="' + pts.join(" ") + '" class="fn"/>'); pts = []; } continue; }
        pts.push(丸(X(x2), 1) + "," + 丸(Y(y2), 1));
      }
      if (pts.length) g.push('<polyline points="' + pts.join(" ") + '" class="fn"/>');
    });

    /* 円 */
    図.円.forEach(function (c) {
      var C = c.名 ? 図.点[c.名] : c.c;
      g.push('<circle cx="' + 丸(X(C.x), 1) + '" cy="' + 丸(Y(C.y), 1) + '" r="' + 丸(c.r * s, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(X(C.x), 1) + '" cy="' + 丸(Y(C.y), 1) + '" r="2.2" class="pt"/>');
    });

    /* 多角形 */
    図.多角形.forEach(function (名2) {
      var pts = 名2.map(function (n) { return 丸(X(図.点[n].x), 1) + "," + 丸(Y(図.点[n].y), 1); });
      g.push('<polygon points="' + pts.join(" ") + '" class="sh"/>');
    });
    /* 線 */
    図.線.forEach(function (l2) {
      var A = 図.点[l2.a], B = 図.点[l2.b];
      g.push('<line x1="' + 丸(X(A.x), 1) + '" y1="' + 丸(Y(A.y), 1) + '" x2="' + 丸(X(B.x), 1)
        + '" y2="' + 丸(Y(B.y), 1) + '" class="ln"/>');
    });

    /* 直角の印（その点から 出ている 2 本を 見て 直角なら 四角を 置く） */
    図.直角.forEach(function (n) {
      var P = 図.点[n];
      var 相手 = [];
      図.多角形.forEach(function (名2) {
        var i = 名2.indexOf(n);
        if (i < 0) return;
        相手.push(図.点[名2[(i + 1) % 名2.length]]);
        相手.push(図.点[名2[(i - 1 + 名2.length) % 名2.length]]);
      });
      図.線.forEach(function (l2) {
        if (l2.a === n) 相手.push(図.点[l2.b]);
        if (l2.b === n) 相手.push(図.点[l2.a]);
      });
      if (相手.length < 2) return;
      var u = 単位(P, 相手[0]), v = 単位(P, 相手[1]);
      var d = 12 / s;
      var p1 = { x: P.x + u.x * d, y: P.y + u.y * d };
      var p2 = { x: P.x + u.x * d + v.x * d, y: P.y + u.y * d + v.y * d };
      var p3 = { x: P.x + v.x * d, y: P.y + v.y * d };
      g.push('<polyline points="' + [p1, p2, p3].map(function (q2) {
        return 丸(X(q2.x), 1) + "," + 丸(Y(q2.y), 1); }).join(" ") + '" class="rt"/>');
    });

    /* 同じ長さの印 */
    図.印.forEach(function (s2) {
      var A = 図.点[s2.a], B = 図.点[s2.b];
      if (!A || !B) return;
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      var u = 単位(A, B), n3 = { x: -u.y, y: u.x }, d = 5 / s;
      g.push('<line x1="' + 丸(X(mx + n3.x * d), 1) + '" y1="' + 丸(Y(my + n3.y * d), 1)
        + '" x2="' + 丸(X(mx - n3.x * d), 1) + '" y2="' + 丸(Y(my - n3.y * d), 1) + '" class="tk"/>');
    });

    /* 辺の長さ（**座標から 出した値**を 貼る） */
    図.辺.forEach(function (s2) {
      var A = 図.点[s2.a], B = 図.点[s2.b];
      var 長 = 距離(A, B);
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      var u = 単位(A, B), n3 = { x: -u.y, y: u.x };
      /* 図の 外側へ 寄せる（中心から 離れる向き） */
      var cx = 平均x(図), cy = 平均y(図);
      if ((mx - cx) * n3.x + (my - cy) * n3.y < 0) { n3.x = -n3.x; n3.y = -n3.y; }
      var d = 11 / s;
      g.push('<text x="' + 丸(X(mx + n3.x * d), 1) + '" y="' + 丸(Y(my + n3.y * d) + 4, 1)
        + '" class="lb">' + esc(丸(長, 2)) + "</text>");
    });

    /* 角度（座標から 出す） */
    図.角.forEach(function (a2) {
      var P = 図.点[a2.p];
      if (!P) return;
      var 相手 = [];
      図.多角形.forEach(function (名2) {
        var i = 名2.indexOf(a2.p);
        if (i < 0) return;
        相手.push(図.点[名2[(i + 1) % 名2.length]]);
        相手.push(図.点[名2[(i - 1 + 名2.length) % 名2.length]]);
      });
      if (相手.length < 2) return;
      var u = 単位(P, 相手[0]), v = 単位(P, 相手[1]);
      var 角 = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180 / Math.PI;
      var b2 = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
      var len = Math.sqrt(b2.x * b2.x + b2.y * b2.y) || 1;
      var d = 22 / s;
      g.push('<text x="' + 丸(X(P.x + b2.x / len * d), 1) + '" y="' + 丸(Y(P.y + b2.y / len * d) + 4, 1)
        + '" class="lb">' + 丸(角, 1) + "°</text>");
    });

    /* 点と 名前 */
    名ら.forEach(function (n) {
      var P = 図.点[n];
      g.push('<circle cx="' + 丸(X(P.x), 1) + '" cy="' + 丸(Y(P.y), 1) + '" r="2.6" class="pt"/>');
      var cx = 平均x(図), cy = 平均y(図);
      var dx = (P.x - cx) || 0.001, dy = (P.y - cy) || 0.001;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = 13;
      g.push('<text x="' + 丸(X(P.x) + dx / L * off, 1) + '" y="' + 丸(Y(P.y) - dy / L * off + 4, 1)
        + '" class="nm">' + esc(図.ラベル[n] || n) + "</text>");
    });

    g.push("</svg>");
    return { svg: g.join(""), 幅: W, 高: H,
             点の数: 名ら.length, 倍率: 丸(s, 3),
             /* 書かれた数と ちがった所（黙って すり替えない） */
             ちがい: 図.ちがい.slice(0, 4),
             作り直した: 直した,
             飛ばした行: 図.飛ばした.slice(0, 4),
             /* 確かめに使えるよう **描いた実寸**も 返す */
             長さ: 図.辺.map(function (s2) {
               return { 辺: s2.a + s2.b, 長さ: 丸(距離(図.点[s2.a], 図.点[s2.b]), 3) }; }) };
  }

  function 単位(A, B) {
    var dx = B.x - A.x, dy = B.y - A.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / L, y: dy / L };
  }
  function 平均x(図) {
    var k = Object.keys(図.点); if (!k.length) return 0;
    return k.reduce(function (n, x) { return n + 図.点[x].x; }, 0) / k.length;
  }
  function 平均y(図) {
    var k = Object.keys(図.点); if (!k.length) return 0;
    return k.reduce(function (n, x) { return n + 図.点[x].y; }, 0) / k.length;
  }

  function CSS() {
    return [
      ".vqg{max-width:100%;height:auto;overflow:visible;display:block;margin:.3em 0;}",
      ".vqg .gd{stroke:currentColor;stroke-width:.6;opacity:.16}",
      ".vqg .ax{stroke:currentColor;stroke-width:1.3;opacity:.6}",
      ".vqg .sh{fill:rgba(43,112,239,.10);stroke:currentColor;stroke-width:1.6}",
      ".vqg .ln{stroke:currentColor;stroke-width:1.6;stroke-linecap:round}",
      ".vqg .fn{fill:none;stroke:#2b70ef;stroke-width:2.2;stroke-linejoin:round}",
      ".vqg .rt{fill:none;stroke:currentColor;stroke-width:1.3;opacity:.85}",
      ".vqg .tk{stroke:#e5484d;stroke-width:2}",
      ".vqg .pt{fill:#e5484d;stroke:none}",
      ".vqg .lb{fill:currentColor;font-size:11px;text-anchor:middle;opacity:.9;font-family:inherit}",
      ".vqg .nm{fill:currentColor;font-size:12px;font-weight:700;text-anchor:middle;font-family:inherit}"
    ].join("");
  }

  VQG.描く = 描く; VQG.読む = 読む; VQG.確かめる = 確かめる;
  VQG.三辺から = 三辺から; VQG.CSS = CSS;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/geo/more.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/geo/more.js — 図形と グラフを **どっさり** 増やす

   ★ 訴え（2026-08-17）「図形の種類が 少ない。関数グラフ、平面・立体図形、
     円、相関グラフ、円グラフ、棒グラフ… 書けるものを めっちゃ増やして。
     数学記号・数式・記号は 全部 入れられるように。じゃないと 詰まる」。

   ★ ここでも 決めごとは 同じ（core/geo/draw.js と 揃える）
     ・**値から 座標を 出す。**目分量で 置かない。
     ・**縦と横は 同じ倍率**（形が 崩れない）。グラフの軸だけは 別（そういうもの）。
     ・数が 読めなければ **描かない。**それらしい絵を 作らない。
     ・貼る数字は **計算した値**。渡された文字を そのまま 貼らない。

   ★ 増やしたもの
     グラフ   関数（式を そのまま 計算）／散布図＋回帰直線／円グラフ／
              棒グラフ／折れ線／ヒストグラム／箱ひげ図
     平面     正多角形／扇形／弧／楕円／平行四辺形／台形／ひし形
     立体     立方体／直方体／円柱／円錐／球／角錐／三角柱
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  /* ★ **描いたものを 自分で 点検する**（2026-08-17・訴え「描画ミスも
     ずれも 無いように。これ 絶対条件」）。
     出す前に 機械が 見る。1 つでも おかしければ **出さない**。
       ・数字に NaN / Infinity が 混ざっていないか
       ・座標が 枠の 外へ 出ていないか（はみ出し＝ずれ）
       ・中身が 空でないか
     おかしな図を 出すくらいなら 出さないほうが よい。 */
  function 点検(W, H, 中) {
    if (!中 || 中.length < 20) return "中身が 空です";
    if (/NaN|Infinity|undefined|null/.test(中)) return "数が 出せていません";
    var 余 = 2;                     /* 線の 太さぶん */
    var 悪 = null;
    中.replace(/(?:x|y|cx|cy|x1|y1|x2|y2)="(-?[\d.]+)"/g, function (m, v) {
      var n = parseFloat(v);
      if (!isFinite(n)) { 悪 = "座標が 数に なっていません"; return m; }
      var 縦 = /^(?:y|cy|y1|y2)=/.test(m);
      var 端 = 縦 ? H : W;
      if (n < -余 || n > 端 + 余) 悪 = "枠から はみ出しています（" + m + " / 枠 " + 端 + "）";
      return m;
    });
    if (悪) return 悪;
    中.replace(/points="([^"]+)"/g, function (m, ps) {
      ps.split(/\s+/).forEach(function (p) {
        var a = p.split(",");
        var x = parseFloat(a[0]), y = parseFloat(a[1]);
        if (!isFinite(x) || !isFinite(y)) { 悪 = "折れ線の 座標が おかしい"; return; }
        if (x < -余 || x > W + 余 || y < -余 || y > H + 余) 悪 = "折れ線が 枠から はみ出しています";
      });
      return m;
    });
    return 悪;
  }
  function svg(W, H, 中, 名) {
    var 悪 = 点検(W, H, 中);
    if (悪) { 最後のだめ = (名 || "図") + ": " + 悪; return null; }
    return '<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="' + esc(名 || "図") + '">' + 中 + "</svg>";
  }
  var 最後のだめ = "";

  /* ══ 式を 計算する（eval は 使わない）════════════════════════════
     使えるもの: + - * / ^ ( ) と x、sin cos tan asin acos atan
                 sqrt abs log ln exp、pi e
     ★ 文字列を そのまま 実行しない。**自分で 読む。** */
  var 関数表 = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log: function (v) { return Math.log(v) / Math.LN10; },
    floor: Math.floor, ceil: Math.ceil, round: Math.round
  };
  function 切る(s) {
    var 出 = [], i = 0;
    s = 文(s).replace(/\s+/g, "");
    while (i < s.length) {
      var c = s.charAt(i);
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
        出.push({ t: "数", v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        var k = i; while (k < s.length && /[a-zA-Z]/.test(s.charAt(k))) k++;
        var w = s.slice(i, k);
        if (関数表[w]) 出.push({ t: "関", v: w });
        else if (w === "pi") 出.push({ t: "数", v: Math.PI });
        else if (w === "e") 出.push({ t: "数", v: Math.E });
        else if (w === "x") 出.push({ t: "x" });
        else return null;                       /* 知らない字 → 読めない */
        i = k; continue;
      }
      if ("+-*/^(),".indexOf(c) >= 0) { 出.push({ t: c }); i++; continue; }
      if (c === "|") { 出.push({ t: "関", v: "abs" }); 出.push({ t: "(" }); i++; continue; }
      return null;
    }
    return 出;
  }
  /* かけ算の 省略（2x, 3(x+1), x(x+1)）を 補う */
  function 掛けを補う(ts) {
    var 出 = [];
    for (var i = 0; i < ts.length; i++) {
      var a = ts[i], b = ts[i + 1];
      出.push(a);
      if (!b) continue;
      var 左 = (a.t === "数" || a.t === "x" || a.t === ")");
      var 右 = (b.t === "数" || b.t === "x" || b.t === "(" || b.t === "関");
      if (左 && 右) 出.push({ t: "*" });
    }
    return 出;
  }
  var 強さ = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
  function 逆ポーランド(ts) {
    var 出 = [], 山 = [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t.t === "数" || t.t === "x") { 出.push(t); continue; }
      if (t.t === "関") { 山.push(t); continue; }
      if (t.t === ",") {
        while (山.length && 山[山.length - 1].t !== "(") 出.push(山.pop());
        continue;
      }
      if (強さ[t.t]) {
        /* 単項の マイナス（先頭 か 演算子の あと） */
        if (t.t === "-" && (i === 0 || ["+", "-", "*", "/", "^", "("].indexOf(ts[i - 1].t) >= 0)) {
          出.push({ t: "数", v: 0 });
        }
        while (山.length && 強さ[山[山.length - 1].t]
               && (強さ[山[山.length - 1].t] > 強さ[t.t]
                   || (強さ[山[山.length - 1].t] === 強さ[t.t] && t.t !== "^"))) {
          出.push(山.pop());
        }
        山.push(t); continue;
      }
      if (t.t === "(") { 山.push(t); continue; }
      if (t.t === ")") {
        while (山.length && 山[山.length - 1].t !== "(") 出.push(山.pop());
        if (!山.length) return null;
        山.pop();
        if (山.length && 山[山.length - 1].t === "関") 出.push(山.pop());
        continue;
      }
      return null;
    }
    while (山.length) { var s2 = 山.pop(); if (s2.t === "(") return null; 出.push(s2); }
    return 出;
  }
  function 式にする(式) {
    var ts = 切る(式); if (!ts) return null;
    var rp = 逆ポーランド(掛けを補う(ts)); if (!rp) return null;
    return function (x) {
      var 山 = [];
      for (var i = 0; i < rp.length; i++) {
        var t = rp[i];
        if (t.t === "数") { 山.push(t.v); continue; }
        if (t.t === "x") { 山.push(x); continue; }
        if (t.t === "関") { var a = 山.pop(); 山.push(関数表[t.v](a)); continue; }
        var b2 = 山.pop(), a2 = 山.pop();
        if (a2 === undefined || b2 === undefined) return NaN;
        if (t.t === "+") 山.push(a2 + b2);
        else if (t.t === "-") 山.push(a2 - b2);
        else if (t.t === "*") 山.push(a2 * b2);
        else if (t.t === "/") 山.push(a2 / b2);
        else if (t.t === "^") 山.push(Math.pow(a2, b2));
        else return NaN;
      }
      return 山.length === 1 ? 山[0] : NaN;
    };
  }

  /* 「りんご 30, みかん 20」「A:3, B:5」を 読む */
  function 組を読む(s) {
    var 出 = [];
    文(s).split(/[,、\n]+/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var m = /^(.+?)\s*[:：=]?\s*(-?[\d.]+)\s*$/.exec(t);
      if (!m) return;
      var 名 = m[1].replace(/[:：=]\s*$/, "").trim();
      var v = 数(m[2], null);
      if (名 && v !== null) 出.push({ 名: 名, 値: v });
    });
    return 出;
  }
  function 数を読む(s) {
    /* ★ 「下=5 3 角=60」のように **名前つきの 数**が 混ざる（2026-08-17・実測）。
       もとは Number("下=5") が NaN で 落ちていたので、
       「平行四辺形 底辺5 斜辺3 角度60」が 描けなかった。= の 右だけ 見る。 */
    return 文(s).split(/[\s,、]+/)
      .map(function (t) { var i = t.lastIndexOf("="); return i >= 0 ? t.slice(i + 1) : t; })
      .map(Number).filter(function (x) { return isFinite(x); });
  }
  function 点を読む(s) {
    var 出 = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m;
    while ((m = re.exec(文(s)))) 出.push({ x: 数(m[1], 0), y: 数(m[2], 0) });
    return 出;
  }

  /* ══ グラフの 下地（軸・目盛り）══════════════════════════════ */
  function 軸つき(o) {
    var W = o.W, H = o.H, 左 = o.左 || 34, 下 = o.下 || 28, 上 = 12, 右 = 12;
    var 小x = o.小x, 大x = o.大x, 小y = o.小y, 大y = o.大y;
    var X = function (v) { return 左 + (v - 小x) / (大x - 小x) * (W - 左 - 右); };
    var Y = function (v) { return H - 下 - (v - 小y) / (大y - 小y) * (H - 下 - 上); };
    var g = [];
    var 刻 = function (幅) {
      var 生 = 幅 / 5, 桁 = Math.pow(10, Math.floor(Math.log(生) / Math.LN10));
      var n = 生 / 桁;
      return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * 桁;
    };
    var dx = 刻(大x - 小x), dy = 刻(大y - 小y);
    for (var vx = Math.ceil(小x / dx) * dx; vx <= 大x + 1e-9; vx += dx) {
      g.push('<line x1="' + 丸(X(vx), 1) + '" y1="' + 上 + '" x2="' + 丸(X(vx), 1) + '" y2="' + (H - 下) + '" class="gd"/>');
      g.push('<text x="' + 丸(X(vx), 1) + '" y="' + (H - 下 + 13) + '" class="lb">' + 丸(vx, 2) + "</text>");
    }
    for (var vy = Math.ceil(小y / dy) * dy; vy <= 大y + 1e-9; vy += dy) {
      g.push('<line x1="' + 左 + '" y1="' + 丸(Y(vy), 1) + '" x2="' + (W - 右) + '" y2="' + 丸(Y(vy), 1) + '" class="gd"/>');
      g.push('<text x="' + (左 - 5) + '" y="' + 丸(Y(vy) + 4, 1) + '" class="lb" text-anchor="end">' + 丸(vy, 2) + "</text>");
    }
    if (小y <= 0 && 大y >= 0) g.push('<line x1="' + 左 + '" y1="' + 丸(Y(0), 1) + '" x2="' + (W - 右) + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
    else g.push('<line x1="' + 左 + '" y1="' + (H - 下) + '" x2="' + (W - 右) + '" y2="' + (H - 下) + '" class="ax"/>');
    if (小x <= 0 && 大x >= 0) g.push('<line x1="' + 丸(X(0), 1) + '" y1="' + 上 + '" x2="' + 丸(X(0), 1) + '" y2="' + (H - 下) + '" class="ax"/>');
    else g.push('<line x1="' + 左 + '" y1="' + 上 + '" x2="' + 左 + '" y2="' + (H - 下) + '" class="ax"/>');
    return { g: g, X: X, Y: Y, 左: 左, 下: 下, 上: 上, 右: 右 };
  }

  /* ══ 関数グラフ（式を そのまま 計算）══════════════════════════ */
  function 関数(式ら, o) {
    o = o || {};
    var fs = [];
    (Array.isArray(式ら) ? 式ら : [式ら]).forEach(function (t) {
      var 本 = 文(t).replace(/^\s*y\s*=\s*/i, "");
      var f = 式にする(本);
      if (f) fs.push({ f: f, 名: 文(t) });
    });
    if (!fs.length) return null;
    var W = 300, H = 240;
    var 小x = 数(o.小x, -5), 大x = 数(o.大x, 5);
    /* ★ **上下の 端で 決めない**（2026-08-17・実測で 直した）。
       y = 6/x のように x=0 の そばで 無限に 飛ぶ式では、
       いちばん大きい値で 縦の幅を 決めると 図が 潰れ、
       さらに 飛んだ点が **枠の外へ 出て しまう**（点検が それを 捕まえた）。
       真ん中あたりの 値（5%〜95%）で 決めて、外れた所は **描かない**。 */
    var ys = [];
    fs.forEach(function (F) {
      for (var i = 0; i <= 400; i++) {
        var x = 小x + (大x - 小x) * i / 400, y = F.f(x);
        if (isFinite(y)) ys.push(y);
      }
    });
    if (!ys.length) return null;
    ys.sort(function (a, b) { return a - b; });
    var 割 = function (p) { return ys[Math.min(ys.length - 1, Math.max(0, Math.round((ys.length - 1) * p)))]; };
    var 小y = 割(0.05), 大y = 割(0.95);
    if (大y - 小y < 1e-6) { 小y -= 1; 大y += 1; }
    var 幅 = 大y - 小y;
    小y -= 幅 * 0.12; 大y += 幅 * 0.12;
    /* 0 が 近ければ 入れる（グラフは 0 が 見えるほうが 読みやすい） */
    if (小y > 0 && 小y < 幅) 小y = 0;
    if (大y < 0 && 大y > -幅) 大y = 0;
    var A = 軸つき({ W: W, H: H, 小x: 小x, 大x: 大x, 小y: 小y, 大y: 大y });
    var g = A.g.slice();
    var 色 = ["#2b70ef", "#e5484d", "#2ea043", "#d69600"];
    fs.forEach(function (F, k) {
      var 点 = [];
      for (var i = 0; i <= 300; i++) {
        var x = 小x + (大x - 小x) * i / 300, y = F.f(x);
        /* ★ 枠の外は **1 px も 描かない**（はみ出し＝ずれ の もと）。 */
        if (!isFinite(y) || y < 小y || y > 大y) {
          if (点.length > 1) g.push('<polyline points="' + 点.join(" ") + '" class="fn" style="stroke:' + 色[k % 4] + '"/>');
          点 = []; continue;
        }
        点.push(丸(A.X(x), 1) + "," + 丸(A.Y(y), 1));
      }
      if (点.length > 1) g.push('<polyline points="' + 点.join(" ") + '" class="fn" style="stroke:' + 色[k % 4] + '"/>');
    });
    return svg(W, H, g.join(""), "関数のグラフ");
  }

  /* ══ 散布図（相関）＋ 回帰直線 ═══════════════════════════════ */
  function 散布図(点ら, o) {
    o = o || {};
    if (!点ら || 点ら.length < 2) return null;
    var W = 300, H = 240;
    var xs = 点ら.map(function (p) { return p.x; }), ys = 点ら.map(function (p) { return p.y; });
    var 小x = Math.min.apply(null, xs), 大x = Math.max.apply(null, xs);
    var 小y = Math.min.apply(null, ys), 大y = Math.max.apply(null, ys);
    var mx = (大x - 小x) * 0.1 || 1, my = (大y - 小y) * 0.1 || 1;
    小x -= mx; 大x += mx; 小y -= my; 大y += my;
    var A = 軸つき({ W: W, H: H, 小x: 小x, 大x: 大x, 小y: 小y, 大y: 大y });
    var g = A.g.slice();
    点ら.forEach(function (p) {
      g.push('<circle cx="' + 丸(A.X(p.x), 1) + '" cy="' + 丸(A.Y(p.y), 1) + '" r="3.4" class="pt"/>');
    });
    /* 回帰直線と 相関係数（**計算して 出す**） */
    var n = 点ら.length;
    var sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    点ら.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
    var 分母 = n * sxx - sx * sx;
    var 説明 = "";
    if (Math.abs(分母) > 1e-9 && o.回帰 !== false) {
      var a = (n * sxy - sx * sy) / 分母, b = (sy - a * sx) / n;
      g.push('<line x1="' + 丸(A.X(小x), 1) + '" y1="' + 丸(A.Y(a * 小x + b), 1)
        + '" x2="' + 丸(A.X(大x), 1) + '" y2="' + 丸(A.Y(a * 大x + b), 1) + '" class="gl"/>');
      var r = (n * sxy - sx * sy) / Math.sqrt(Math.max(1e-12, (n * sxx - sx * sx) * (n * syy - sy * sy)));
      説明 = "y = " + 丸(a, 2) + "x " + (b >= 0 ? "+ " : "- ") + 丸(Math.abs(b), 2)
        + "　r = " + 丸(r, 3);
      g.push('<text x="' + (W - 12) + '" y="20" class="lb" text-anchor="end">' + esc(説明) + "</text>");
    }
    return svg(W, H, g.join(""), "散布図");
  }

  /* ══ 円グラフ ═══════════════════════════════════════════════ */
  var 見本色 = ["#2b70ef", "#e5484d", "#2ea043", "#d69600", "#8a81c2", "#00a3a3", "#c2557a"];
  function 円グラフ(組) {
    if (!組 || !組.length) return null;
    var 合 = 組.reduce(function (n, x) { return n + Math.max(0, x.値); }, 0);
    if (合 <= 0) return null;
    var W = 300, H = 220, cx = 105, cy = 110, R = 84;
    var g = [], 角 = -Math.PI / 2;
    組.forEach(function (x, i) {
      var 割 = Math.max(0, x.値) / 合, d = 割 * Math.PI * 2;
      var x1 = cx + R * Math.cos(角), y1 = cy + R * Math.sin(角);
      var x2 = cx + R * Math.cos(角 + d), y2 = cy + R * Math.sin(角 + d);
      var 大 = d > Math.PI ? 1 : 0;
      if (割 >= 0.9999) {
        g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + 見本色[i % 7] + '" opacity=".85"/>');
      } else {
        g.push('<path d="M' + cx + " " + cy + "L" + 丸(x1, 1) + " " + 丸(y1, 1)
          + "A" + R + " " + R + " 0 " + 大 + " 1 " + 丸(x2, 1) + " " + 丸(y2, 1) + 'Z" fill="'
          + 見本色[i % 7] + '" opacity=".85" stroke="#fff" stroke-width="1.2"/>');
      }
      /* 割合を 中に 出す（10% 以上のときだけ。小さいと 重なる） */
      if (割 >= 0.1) {
        var m2 = 角 + d / 2;
        g.push('<text x="' + 丸(cx + R * 0.62 * Math.cos(m2), 1) + '" y="'
          + 丸(cy + R * 0.62 * Math.sin(m2) + 4, 1) + '" class="lb" style="fill:#fff">'
          + Math.round(割 * 100) + "%</text>");
      }
      角 += d;
    });
    組.slice(0, 7).forEach(function (x, i) {
      var y = 26 + i * 22;
      g.push('<rect x="206" y="' + (y - 9) + '" width="11" height="11" rx="2.5" fill="' + 見本色[i % 7] + '"/>');
      g.push('<text x="223" y="' + y + '" class="lb" text-anchor="start">'
        + esc(x.名) + " " + 丸(x.値, 2) + "</text>");
    });
    return svg(W, H, g.join(""), "円グラフ");
  }

  /* ══ 棒グラフ・折れ線・ヒストグラム ═══════════════════════════ */
  function 棒グラフ(組, o) {
    o = o || {};
    if (!組 || !組.length) return null;
    var W = Math.min(320, Math.max(200, 46 * 組.length + 50)), H = 220;
    var 大 = Math.max.apply(null, 組.map(function (x) { return x.値; }));
    var 小 = Math.min(0, Math.min.apply(null, 組.map(function (x) { return x.値; })));
    if (大 === 小) 大 = 小 + 1;
    var A = 軸つき({ W: W, H: H, 小x: 0, 大x: 組.length, 小y: 小, 大y: 大 * 1.1, 左: 36, 下: 30 });
    var g = A.g.filter(function (t) { return t.indexOf('y="' + (H - 30 + 13)) < 0; });
    var 幅 = (W - A.左 - A.右) / 組.length;
    組.forEach(function (x, i) {
      var x0 = A.左 + 幅 * i + 幅 * 0.16, w = 幅 * 0.68;
      var y0 = A.Y(Math.max(0, x.値)), y1 = A.Y(Math.min(0, x.値));
      g.push('<rect x="' + 丸(x0, 1) + '" y="' + 丸(y0, 1) + '" width="' + 丸(w, 1)
        + '" height="' + 丸(Math.max(1, y1 - y0), 1) + '" rx="3" fill="' + 見本色[i % 7] + '" opacity=".88"/>');
      g.push('<text x="' + 丸(x0 + w / 2, 1) + '" y="' + 丸(y0 - 5, 1) + '" class="lb">' + 丸(x.値, 2) + "</text>");
      g.push('<text x="' + 丸(x0 + w / 2, 1) + '" y="' + (H - 30 + 14) + '" class="lb">' + esc(x.名) + "</text>");
    });
    return svg(W, H, g.join(""), "棒グラフ");
  }
  function 折れ線(組) {
    if (!組 ||組.length < 2) return null;
    var W = Math.min(320, Math.max(220, 44 * 組.length + 50)), H = 220;
    var vs = 組.map(function (x) { return x.値; });
    var 大 = Math.max.apply(null, vs), 小 = Math.min.apply(null, vs);
    if (大 === 小) { 大 += 1; 小 -= 1; }
    var 幅 = (大 - 小) * 0.15;
    var A = 軸つき({ W: W, H: H, 小x: 0, 大x: 組.length - 1, 小y: 小 - 幅, 大y: 大 + 幅, 左: 36, 下: 30 });
    var g = A.g.filter(function (t) { return t.indexOf('y="' + (H - 30 + 13)) < 0; });
    var 点 = 組.map(function (x, i) { return 丸(A.X(i), 1) + "," + 丸(A.Y(x.値), 1); });
    g.push('<polyline points="' + 点.join(" ") + '" class="fn"/>');
    組.forEach(function (x, i) {
      g.push('<circle cx="' + 丸(A.X(i), 1) + '" cy="' + 丸(A.Y(x.値), 1) + '" r="3.2" class="pt"/>');
      g.push('<text x="' + 丸(A.X(i), 1) + '" y="' + (H - 30 + 14) + '" class="lb">' + esc(x.名) + "</text>");
    });
    return svg(W, H, g.join(""), "折れ線グラフ");
  }
  function ヒストグラム(組) { return 棒グラフ(組); }

  /* ══ 箱ひげ図 ═══════════════════════════════════════════════ */
  function 箱ひげ(数ら) {
    if (!数ら || 数ら.length < 4) return null;
    var a = 数ら.slice().sort(function (x, y) { return x - y; });
    var q = function (p) {
      var i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return a[lo] + (a[hi] - a[lo]) * (i - lo);
    };
    var 小 = a[0], 大 = a[a.length - 1], q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    var W = 300, H = 130, 左 = 20, 右 = 20, y = 58, 高 = 34;
    var X = function (v) { return 左 + (v - 小) / ((大 - 小) || 1) * (W - 左 - 右); };
    var g = [];
    g.push('<line x1="' + 丸(X(小), 1) + '" y1="' + y + '" x2="' + 丸(X(大), 1) + '" y2="' + y + '" class="ln"/>');
    [小, 大].forEach(function (v) {
      g.push('<line x1="' + 丸(X(v), 1) + '" y1="' + (y - 10) + '" x2="' + 丸(X(v), 1) + '" y2="' + (y + 10) + '" class="ln"/>');
    });
    g.push('<rect x="' + 丸(X(q1), 1) + '" y="' + (y - 高 / 2) + '" width="' + 丸(X(q3) - X(q1), 1)
      + '" height="' + 高 + '" class="sh"/>');
    g.push('<line x1="' + 丸(X(q2), 1) + '" y1="' + (y - 高 / 2) + '" x2="' + 丸(X(q2), 1)
      + '" y2="' + (y + 高 / 2) + '" class="tk"/>');
    [[小, "最小"], [q1, "Q1"], [q2, "中央"], [q3, "Q3"], [大, "最大"]].forEach(function (p, i) {
      g.push('<text x="' + 丸(X(p[0]), 1) + '" y="' + (i % 2 ? y + 34 : y - 26) + '" class="lb">'
        + 丸(p[0], 2) + "</text>");
    });
    return svg(W, H, g.join(""), "箱ひげ図");
  }

  /* ══ 平面図形 ═══════════════════════════════════════════════ */
  function 正多角形(n, r, 辺) {
    n = Math.round(n);
    if (!(n >= 3 && n <= 20) || !(r > 0)) return null;
    var W = 200, H = 200, cx = 100, cy = 100, R = 76;
    var 点 = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      点.push(丸(cx + R * Math.cos(a), 1) + "," + 丸(cy + R * Math.sin(a), 1));
    }
    var g = ['<polygon points="' + 点.join(" ") + '" class="sh"/>'];
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.4" class="pt"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" class="tk"/>');
    /* ★ 数字だけ 置くと **半径か 一辺か 読めない**（2026-08-17）。名前を 付ける。 */
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy - 6) + '" class="lb">r = ' + 丸(r, 2) + "</text>");
    if (辺 !== null && 辺 !== undefined && isFinite(辺)) {
      var a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 / n;
      g.push('<text x="' + 丸(cx + R * 0.98 * Math.cos((a0 + a1) / 2), 1)
        + '" y="' + 丸(cy + R * 0.98 * Math.sin((a0 + a1) / 2) - 6, 1)
        + '" class="lb" text-anchor="middle">一辺 ' + 丸(辺, 2) + "</text>");
    }
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">正' + n + "角形</text>");
    return svg(W, H, g.join(""), "正多角形");
  }
  function 扇形(r, 角) {
    if (!(r > 0) || !(角 > 0 && 角 <= 360)) return null;
    var W = 200, H = 190, cx = 100, cy = 110, R = 80;
    var a0 = -Math.PI / 2, a1 = a0 + 角 * Math.PI / 180;
    var x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0);
    var x2 = cx + R * Math.cos(a1), y2 = cy + R * Math.sin(a1);
    var g = [];
    if (角 >= 360) g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh"/>');
    else g.push('<path d="M' + cx + " " + cy + "L" + 丸(x1, 1) + " " + 丸(y1, 1)
      + "A" + R + " " + R + " 0 " + (角 > 180 ? 1 : 0) + " 1 " + 丸(x2, 1) + " " + 丸(y2, 1) + 'Z" class="sh"/>');
    g.push('<text x="' + cx + '" y="' + (cy - 8) + '" class="lb">' + 丸(角, 1) + "°</text>");
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy + 14) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    /* 弧の長さと 面積も 出す（計算して 出す） */
    var 弧 = 2 * Math.PI * r * (角 / 360), 面 = Math.PI * r * r * (角 / 360);
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">弧 ' + 丸(弧, 2) + " ／ 面積 " + 丸(面, 2) + "</text>");
    return svg(W, H, g.join(""), "扇形");
  }
  function 楕円(a, b) {
    if (!(a > 0 && b > 0)) return null;
    var W = 220, H = 180, cx = 110, cy = 88;
    var s = Math.min(88 / a, 62 / b);
    var g = ['<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + 丸(a * s, 1) + '" ry="' + 丸(b * s, 1) + '" class="sh"/>'];
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(cx + a * s, 1) + '" y2="' + cy + '" class="tk"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + 丸(cy - b * s, 1) + '" class="tk"/>');
    g.push('<text x="' + 丸(cx + a * s / 2, 1) + '" y="' + (cy - 6) + '" class="lb">' + 丸(a, 2) + "</text>");
    g.push('<text x="' + (cx - 12) + '" y="' + 丸(cy - b * s / 2, 1) + '" class="lb">' + 丸(b, 2) + "</text>");
    return svg(W, H, g.join(""), "楕円");
  }
  /* 底辺と 高さから（直角なら 左下を 直角に） */
  function 三角形寸法(底, 高, 直) {
    底 = Number(底); 高 = Number(高);
    if (!isFinite(底) || !isFinite(高) || 底 <= 0 || 高 <= 0) return null;
    var 倍 = Math.min(200 / 底, 160 / 高), W = 底 * 倍 + 90, H = 高 * 倍 + 70;
    var x0 = 45, y0 = H - 40, x1 = x0 + 底 * 倍;
    var 頂 = 直 ? x0 : (x0 + x1) / 2, 頂y = y0 - 高 * 倍;
    var g = ['<polygon points="' + 丸(x0, 1) + ',' + 丸(y0, 1) + ' ' + 丸(x1, 1) + ',' + 丸(y0, 1)
      + ' ' + 丸(頂, 1) + ',' + 丸(頂y, 1) + '" class="fg"/>'];
    g.push('<line x1="' + 丸(頂, 1) + '" y1="' + 丸(頂y, 1) + '" x2="' + 丸(頂, 1) + '" y2="'
      + 丸(y0, 1) + '" class="ax" stroke-dasharray="4 3"/>');
    if (直) g.push('<path d="M' + (x0 + 12) + ' ' + 丸(y0, 1) + ' L' + (x0 + 12) + ' ' + 丸(y0 - 12, 1)
      + ' L' + x0 + ' ' + 丸(y0 - 12, 1) + '" class="ax" fill="none"/>');
    g.push('<text x="' + 丸((x0 + x1) / 2, 1) + '" y="' + 丸(y0 + 18, 1)
      + '" class="lb" text-anchor="middle">底辺 ' + 丸(底, 2) + '</text>');
    g.push('<text x="' + 丸(頂 + 6, 1) + '" y="' + 丸((頂y + y0) / 2, 1) + '" class="lb">高さ ' + 丸(高, 2) + '</text>');
    g.push('<text x="' + (W - 8) + '" y="18" class="lb" text-anchor="end">面積 ' + 丸(底 * 高 / 2, 2) + '</text>');
    return svg(W, H, g.join(""), "三角形");
  }
  /* 3 辺から（余弦定理で 形を 決める。**目分量では 置かない**） */
  function 三角形三辺(a, b, c) {
    a = Number(a); b = Number(b); c = Number(c);
    if (![a, b, c].every(function (v) { return isFinite(v) && v > 0; })) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;   /* 三角形に ならない */
    /* 辺 c を 底に 置く。A(0,0) B(c,0)、C は 余弦定理から 決める。 */
    var cosA = (b * b + c * c - a * a) / (2 * b * c);
    cosA = Math.max(-1, Math.min(1, cosA));
    var A2 = Math.acos(cosA);
    var Cx = b * Math.cos(A2), Cy = b * Math.sin(A2);
    var 最大 = Math.max(c, Math.abs(Cx), Cy) || 1;
    var 倍 = 190 / 最大;
    var W = Math.max(Math.max(Cx, c) * 倍 + 100, 160), H = Cy * 倍 + 80;
    var px = function (x) { return 50 + x * 倍; }, py = function (y) { return H - 40 - y * 倍; };
    var g = ['<polygon points="' + 丸(px(0), 1) + ',' + 丸(py(0), 1) + ' ' + 丸(px(c), 1) + ',' + 丸(py(0), 1)
      + ' ' + 丸(px(Cx), 1) + ',' + 丸(py(Cy), 1) + '" class="fg"/>'];
    /* 直角かどうかは **辺の 長さから 計算で** 判る（見た目で 決めない） */
    var 直角 = Math.abs(b * b + c * c - a * a) < 1e-6;
    if (直角) g.push('<path d="M' + 丸(px(0) + 12, 1) + ' ' + 丸(py(0), 1) + ' L' + 丸(px(0) + 12, 1)
      + ' ' + 丸(py(0) - 12, 1) + ' L' + 丸(px(0), 1) + ' ' + 丸(py(0) - 12, 1) + '" class="ax" fill="none"/>');
    g.push('<text x="' + 丸(px(c / 2), 1) + '" y="' + 丸(py(0) + 18, 1) + '" class="lb" text-anchor="middle">' + 丸(c, 2) + '</text>');
    g.push('<text x="' + 丸(px(Cx / 2) - 22, 1) + '" y="' + 丸(py(Cy / 2), 1) + '" class="lb">' + 丸(b, 2) + '</text>');
    g.push('<text x="' + 丸(px((Cx + c) / 2) + 6, 1) + '" y="' + 丸(py(Cy / 2), 1) + '" class="lb">' + 丸(a, 2) + '</text>');
    var s3 = (a + b + c) / 2;
    g.push('<text x="' + (W - 8) + '" y="18" class="lb" text-anchor="end">面積 '
      + 丸(Math.sqrt(Math.max(0, s3 * (s3 - a) * (s3 - b) * (s3 - c))), 2) + '</text>');
    return svg(W, H, g.join(""), "三角形");
  }
  function 平行四辺形(底, 斜, 角) {
    if (!(底 > 0 && 斜 > 0)) return null;
    角 = 数(角, 60);
    var t = 角 * Math.PI / 180;
    var dx = 斜 * Math.cos(t), dy = 斜 * Math.sin(t);
    var W = 240, H = 170, 余 = 30;
    var s = Math.min((W - 余 * 2) / (底 + Math.abs(dx)), (H - 余 * 2) / (dy || 1));
    var x0 = 余, y0 = H - 余;
    var 点 = [[x0, y0], [x0 + 底 * s, y0], [x0 + 底 * s + dx * s, y0 - dy * s], [x0 + dx * s, y0 - dy * s]];
    var g = ['<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    g.push('<text x="' + 丸(x0 + 底 * s / 2, 1) + '" y="' + (y0 + 14) + '" class="lb">' + 丸(底, 2) + "</text>");
    g.push('<text x="' + 丸(x0 + dx * s / 2 - 12, 1) + '" y="' + 丸(y0 - dy * s / 2, 1) + '" class="lb">' + 丸(斜, 2) + "</text>");
    g.push('<text x="' + 丸(x0 + 16, 1) + '" y="' + 丸(y0 - 8, 1) + '" class="lb">' + 丸(角, 0) + "°</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">面積 ' + 丸(底 * dy, 2) + "</text>");
    return svg(W, H, g.join(""), "平行四辺形");
  }
  function 台形(上, 下, 高) {
    if (!(上 > 0 && 下 > 0 && 高 > 0)) return null;
    var W = 240, H = 170, 余 = 30;
    var s = Math.min((W - 余 * 2) / Math.max(上, 下), (H - 余 * 2) / 高);
    var y0 = H - 余, y1 = y0 - 高 * s;
    var 中 = W / 2;
    var 点 = [[中 - 下 * s / 2, y0], [中 + 下 * s / 2, y0], [中 + 上 * s / 2, y1], [中 - 上 * s / 2, y1]];
    var g = ['<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    g.push('<text x="' + 中 + '" y="' + (y0 + 14) + '" class="lb">' + 丸(下, 2) + "</text>");
    g.push('<text x="' + 中 + '" y="' + (y1 - 6) + '" class="lb">' + 丸(上, 2) + "</text>");
    g.push('<text x="' + (中 - 下 * s / 2 - 14) + '" y="' + 丸((y0 + y1) / 2, 1) + '" class="lb">' + 丸(高, 2) + "</text>");
    g.push('<text x="' + 中 + '" y="' + (H - 6) + '" class="lb">面積 ' + 丸((上 + 下) * 高 / 2, 2) + "</text>");
    return svg(W, H, g.join(""), "台形");
  }

  /* ══ 立体（見取り図）═══════════════════════════════════════════
     ★ 斜めに 引く量は **一定**（0.42・45°）。ここを 値ごとに 変えると
       同じ立体が 毎回 ちがう形に 見える。 */
  var 奥 = 0.42, 奥角 = Math.PI / 4;
  function 直方体(w, d, h) {
    if (!(w > 0 && d > 0 && h > 0)) return null;
    var W = 240, H = 200, 余 = 26;
    var ox = d * 奥 * Math.cos(奥角), oy = d * 奥 * Math.sin(奥角);
    var s = Math.min((W - 余 * 2) / (w + ox), (H - 余 * 2) / (h + oy));
    var x0 = 余, y0 = H - 余;
    var P = function (x, y, z) { return [x0 + (x + z * 奥 * Math.cos(奥角)) * s,
                                         y0 - (y + z * 奥 * Math.sin(奥角)) * s]; };
    var a = P(0, 0, 0), b = P(w, 0, 0), c = P(w, h, 0), e = P(0, h, 0);
    var a2 = P(0, 0, d), b2 = P(w, 0, d), c2 = P(w, h, d), e2 = P(0, h, d);
    var 面 = function (ps, cls) {
      return '<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="' + (cls || "sh") + '"/>';
    };
    var g = [面([a2, b2, c2, e2], "sh2"), 面([b, b2, c2, c], "sh2"), 面([e, e2, c2, c], "sh2"),
             面([a, b, c, e], "sh")];
    [[a, a2], [b, b2], [c, c2], [e, e2]].forEach(function (l) {
      g.push('<line x1="' + 丸(l[0][0], 1) + '" y1="' + 丸(l[0][1], 1) + '" x2="' + 丸(l[1][0], 1)
        + '" y2="' + 丸(l[1][1], 1) + '" class="ln"/>');
    });
    g.push('<text x="' + 丸((a[0] + b[0]) / 2, 1) + '" y="' + 丸(a[1] + 14, 1) + '" class="lb">' + 丸(w, 2) + "</text>");
    g.push('<text x="' + 丸(a[0] - 12, 1) + '" y="' + 丸((a[1] + e[1]) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + 丸((b[0] + b2[0]) / 2 + 8, 1) + '" y="' + 丸((b[1] + b2[1]) / 2, 1) + '" class="lb">' + 丸(d, 2) + "</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(w * d * h, 2)
      + " ／ 表面積 " + 丸(2 * (w * d + d * h + h * w), 2) + "</text>");
    return svg(W, H, g.join(""), "直方体");
  }
  function 円柱(r, h) {
    if (!(r > 0 && h > 0)) return null;
    var W = 200, H = 210, cx = 100, 余 = 30;
    var s = Math.min((W - 余 * 2) / (2 * r), (H - 余 * 2 - 20) / h);
    var R = r * s, Hh = h * s, ry = R * 0.32;
    var y0 = H - 余 - 20, y1 = y0 - Hh;
    var g = [];
    g.push('<path d="M' + 丸(cx - R, 1) + " " + 丸(y1, 1) + "L" + 丸(cx - R, 1) + " " + 丸(y0, 1)
      + "A" + 丸(R, 1) + " " + 丸(ry, 1) + " 0 0 0 " + 丸(cx + R, 1) + " " + 丸(y0, 1)
      + "L" + 丸(cx + R, 1) + " " + 丸(y1, 1) + 'Z" class="sh"/>');
    g.push('<ellipse cx="' + cx + '" cy="' + 丸(y1, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="sh"/>');
    g.push('<text x="' + 丸(cx + R / 2, 1) + '" y="' + 丸(y1 - 6, 1) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + 丸(cx + R + 12, 1) + '" y="' + 丸((y0 + y1) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(Math.PI * r * r * h, 2) + "</text>");
    return svg(W, H, g.join(""), "円柱");
  }
  function 円錐(r, h) {
    if (!(r > 0 && h > 0)) return null;
    var W = 200, H = 210, cx = 100, 余 = 30;
    var s = Math.min((W - 余 * 2) / (2 * r), (H - 余 * 2 - 20) / h);
    var R = r * s, Hh = h * s, ry = R * 0.32;
    var y0 = H - 余 - 20, 頂 = y0 - Hh;
    var g = [];
    g.push('<path d="M' + 丸(cx - R, 1) + " " + 丸(y0, 1) + "L" + cx + " " + 丸(頂, 1)
      + "L" + 丸(cx + R, 1) + " " + 丸(y0, 1) + 'Z" class="sh"/>');
    g.push('<ellipse cx="' + cx + '" cy="' + 丸(y0, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="sh"/>');
    g.push('<line x1="' + cx + '" y1="' + 丸(頂, 1) + '" x2="' + cx + '" y2="' + 丸(y0, 1) + '" class="gd"/>');
    g.push('<text x="' + 丸(cx + R / 2, 1) + '" y="' + 丸(y0 + 16, 1) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + (cx + 8) + '" y="' + 丸((y0 + 頂) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(Math.PI * r * r * h / 3, 2) + "</text>");
    return svg(W, H, g.join(""), "円錐");
  }
  function 球(r) {
    if (!(r > 0)) return null;
    var W = 190, H = 200, cx = 95, cy = 92, R = 72;
    var g = ['<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh"/>'];
    g.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + R + '" ry="' + 丸(R * 0.3, 1) + '" class="gd" fill="none"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" class="tk"/>');
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy - 6) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(4 / 3 * Math.PI * r * r * r, 2)
      + " ／ 表面積 " + 丸(4 * Math.PI * r * r, 2) + "</text>");
    return svg(W, H, g.join(""), "球");
  }
  function 角錐(底, h, n) {
    n = Math.round(数(n, 4));
    if (!(底 > 0 && h > 0) || n < 3) return null;
    var W = 210, H = 200, cx = 105, 余 = 28;
    var s = Math.min((W - 余 * 2) / (底 * 1.3), (H - 余 * 2 - 16) / h);
    var R = 底 * s / 2, ry = R * 0.34, y0 = H - 余 - 16, 頂 = y0 - h * s;
    var g = ['<ellipse cx="' + cx + '" cy="' + 丸(y0, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="gd" fill="none"/>'];
    var 点 = [];
    for (var i = 0; i < n; i++) {
      var a = Math.PI / 2 + i * Math.PI * 2 / n;
      点.push([cx + R * Math.cos(a), y0 + ry * Math.sin(a)]);
    }
    g.push('<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>');
    点.forEach(function (p) {
      g.push('<line x1="' + 丸(p[0], 1) + '" y1="' + 丸(p[1], 1) + '" x2="' + cx + '" y2="' + 丸(頂, 1) + '" class="ln"/>');
    });
    g.push('<text x="' + (cx + 8) + '" y="' + 丸((y0 + 頂) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">' + n + "角錐</text>");
    return svg(W, H, g.join(""), "角錐");
  }


  /* ══ 第 2 弾（2026-08-17）══════════════════════════════════════
     ベン図／単位円／樹形図／数直線／円と接線／ベクトル／
     正四面体・正八面体／展開図／回路／力の図 */

  function ベン図(組) {
    var 名 = (組 || []).map(function (x) { return x.名; });
    if (名.length < 2) return null;
    var 三 = 名.length >= 3;
    var W = 260, H = 三 ? 220 : 180, R = 三 ? 58 : 62;
    var g = [];
    var 円ら = 三
      ? [{ x: 100, y: 92 }, { x: 160, y: 92 }, { x: 130, y: 146 }]
      : [{ x: 102, y: 90 }, { x: 158, y: 90 }];
    円ら.forEach(function (c, i) {
      g.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="' + R + '" fill="' + 見本色[i % 7]
        + '" opacity=".26" stroke="currentColor" stroke-width="1.4"/>');
    });
    var 置 = 三 ? [[62, 60], [198, 60], [130, 208]] : [[58, 46], [202, 46]];
    名.slice(0, 3).forEach(function (n, i) {
      g.push('<text x="' + 置[i][0] + '" y="' + 置[i][1] + '" class="lb">' + esc(n) + "</text>");
    });
    (組 || []).slice(0, 3).forEach(function (x, i) {
      if (x.値 === undefined || x.値 === null) return;
      var c = 円ら[i];
      var dx = 三 ? [-26, 26, 0][i] : [-24, 24][i];
      var dy = 三 ? [-14, -14, 22][i] : [0, 0][i];
      g.push('<text x="' + (c.x + dx) + '" y="' + (c.y + dy) + '" class="lb">' + 丸(x.値, 2) + "</text>");
    });
    return svg(W, H, g.join(""), "ベン図");
  }

  function 単位円(角) {
    角 = 数(角, null);
    if (角 === null) return null;
    var W = 240, H = 240, cx = 120, cy = 120, R = 88;
    var t = 角 * Math.PI / 180;
    var px = cx + R * Math.cos(t), py = cy - R * Math.sin(t);
    var g = [];
    g.push('<line x1="14" y1="' + cy + '" x2="' + (W - 14) + '" y2="' + cy + '" class="ax"/>');
    g.push('<line x1="' + cx + '" y1="14" x2="' + cx + '" y2="' + (H - 14) + '" class="ax"/>');
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh" fill="none"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(px, 1) + '" y2="' + 丸(py, 1) + '" class="gl"/>');
    g.push('<line x1="' + 丸(px, 1) + '" y1="' + 丸(py, 1) + '" x2="' + 丸(px, 1) + '" y2="' + cy + '" class="tk"/>');
    g.push('<line x1="' + cx + '" y1="' + 丸(py, 1) + '" x2="' + 丸(px, 1) + '" y2="' + 丸(py, 1) + '" class="gd"/>');
    g.push('<circle cx="' + 丸(px, 1) + '" cy="' + 丸(py, 1) + '" r="3.2" class="pt"/>');
    /* 値は **計算して** 出す */
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">' + 丸(角, 1)
      + "°　cos=" + 丸(Math.cos(t), 3) + "　sin=" + 丸(Math.sin(t), 3) + "</text>");
    return svg(W, H, g.join(""), "単位円");
  }

  function 樹形図(段ら) {
    /* 「表,裏 / 表,裏」→ 2 段。各段の 枝の 名前 */
    var 段 = 文(段ら).split(/\s*[\/／]\s*/).map(function (t) {
      return t.split(/[,、\s]+/).filter(Boolean);
    }).filter(function (a) { return a.length; });
    if (!段.length || 段.length > 4) return null;
    var 葉 = 段.reduce(function (n, a) { return n * a.length; }, 1);
    if (葉 > 24) return null;
    var W = 60 + 段.length * 78, H = Math.min(280, 26 + 葉 * 22);
    var g = [];
    function 引く(x, y0, y1, 深) {
      if (深 >= 段.length) return;
      var a = 段[深], 幅 = (y1 - y0) / a.length;
      a.forEach(function (n, i) {
        var cy = y0 + 幅 * i + 幅 / 2;
        g.push('<line x1="' + x + '" y1="' + 丸((y0 + y1) / 2, 1) + '" x2="' + (x + 52)
          + '" y2="' + 丸(cy, 1) + '" class="ln"/>');
        g.push('<text x="' + (x + 62) + '" y="' + 丸(cy + 4, 1) + '" class="lb" text-anchor="start">'
          + esc(n) + "</text>");
        引く(x + 78, y0 + 幅 * i, y0 + 幅 * (i + 1), 深 + 1);
      });
    }
    g.push('<circle cx="18" cy="' + 丸(H / 2, 1) + '" r="3" class="pt"/>');
    引く(18, 8, H - 8, 0);
    g.push('<text x="' + (W - 6) + '" y="14" class="lb" text-anchor="end">全 ' + 葉 + " 通り</text>");
    return svg(W, H, g.join(""), "樹形図");
  }

  function 数直線(式) {
    var m = /(-?[\d.]+)\s*(<=|≦|<|≤)?\s*[a-zA-Zｘx]\s*(<=|≦|<|≤)?\s*(-?[\d.]+)/.exec(文(式));
    var 左 = null, 右 = null, 左閉 = false, 右閉 = false;
    if (m) {
      左 = 数(m[1], null); 右 = 数(m[4], null);
      左閉 = /=|≦|≤/.test(m[2] || ""); 右閉 = /=|≦|≤/.test(m[3] || "");
    } else {
      var m2 = /[a-zA-Zｘx]\s*(>=|≧|>|≥|<=|≦|<|≤)\s*(-?[\d.]+)/.exec(文(式));
      if (!m2) return null;
      var v = 数(m2[2], 0), 上 = /</.test(m2[1]) || /≦|≤/.test(m2[1]);
      if (上) { 右 = v; 右閉 = /=|≦|≤/.test(m2[1]); }
      else { 左 = v; 左閉 = /=|≧|≥/.test(m2[1]); }
    }
    var 下 = Math.floor(Math.min(左 === null ? 右 - 3 : 左, 右 === null ? 左 - 3 : 右)) - 1;
    var 上端 = Math.ceil(Math.max(左 === null ? 右 + 3 : 左, 右 === null ? 左 + 3 : 右)) + 1;
    if (!isFinite(下) || !isFinite(上端) || 上端 - 下 > 40) return null;
    var W = 300, H = 60, 端 = 18;
    var X = function (v2) { return 端 + (v2 - 下) / (上端 - 下) * (W - 端 * 2); };
    var g = ['<line x1="6" y1="34" x2="' + (W - 6) + '" y2="34" class="ax"/>'];
    for (var v3 = 下; v3 <= 上端; v3++) {
      g.push('<line x1="' + 丸(X(v3), 1) + '" y1="30" x2="' + 丸(X(v3), 1) + '" y2="38" class="tk"/>');
      g.push('<text x="' + 丸(X(v3), 1) + '" y="52" class="lb">' + v3 + "</text>");
    }
    var a = 左 === null ? 下 : 左, b = 右 === null ? 上端 : 右;
    g.push('<line x1="' + 丸(X(a), 1) + '" y1="22" x2="' + 丸(X(b), 1) + '" y2="22" class="rg"/>');
    if (左 !== null) g.push('<circle cx="' + 丸(X(左), 1) + '" cy="22" r="4.5" class="' + (左閉 ? "pt" : "pto") + '"/>');
    if (右 !== null) g.push('<circle cx="' + 丸(X(右), 1) + '" cy="22" r="4.5" class="' + (右閉 ? "pt" : "pto") + '"/>');
    return svg(W, H, g.join(""), "数直線");
  }

  function 円と接線(r, d) {
    if (!(r > 0 && d > r)) return null;
    var W = 280, H = 190, s = Math.min(110 / d, 70 / r);
    var cx = 70, cy = 95, R = r * s, D = d * s;
    var px = cx + D, py = cy;
    /* 接点は 円と 直角に なる位置（計算で 出す） */
    var 接長 = Math.sqrt(d * d - r * r) * s;
    var a = Math.acos(R / D);
    var tx = cx + R * Math.cos(a), ty = cy - R * Math.sin(a);
    var tx2 = cx + R * Math.cos(a), ty2 = cy + R * Math.sin(a);
    var g = ['<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(R, 1) + '" class="sh" fill="none"/>'];
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.4" class="pt"/>');
    g.push('<circle cx="' + 丸(px, 1) + '" cy="' + py + '" r="2.8" class="pt"/>');
    [[tx, ty], [tx2, ty2]].forEach(function (t) {
      g.push('<line x1="' + 丸(px, 1) + '" y1="' + py + '" x2="' + 丸(t[0], 1) + '" y2="' + 丸(t[1], 1) + '" class="ln"/>');
      g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(t[0], 1) + '" y2="' + 丸(t[1], 1) + '" class="gd"/>');
      g.push('<circle cx="' + 丸(t[0], 1) + '" cy="' + 丸(t[1], 1) + '" r="2.6" class="pt"/>');
    });
    g.push('<text x="' + 丸((cx + px) / 2, 1) + '" y="' + (cy + 14) + '" class="lb">' + 丸(d, 2) + "</text>");
    g.push('<text x="' + (cx - 6) + '" y="' + (cy - R / 2) + '" class="lb">' + 丸(r, 2) + "</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">接線の長さ ' + 丸(接長 / s, 3) + "</text>");
    return svg(W, H, g.join(""), "円と接線");
  }

  function ベクトル(点ら, 名ら) {
    if (!点ら || !点ら.length) return null;
    var 大 = 1;
    点ら.forEach(function (p) { 大 = Math.max(大, Math.abs(p.x), Math.abs(p.y)); });
    var W = 240, H = 220, cx = 120, cy = 110, s = Math.min(92 / 大, 88 / 大);
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 24) + '" class="ax"/>'];
    点ら.slice(0, 4).forEach(function (p, i) {
      var x2 = cx + p.x * s, y2 = cy - p.y * s;
      var 色2 = 見本色[i % 7];
      g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(x2, 1) + '" y2="' + 丸(y2, 1)
        + '" stroke="' + 色2 + '" stroke-width="2.4"/>');
      /* 矢じり（向きから 計算） */
      var a = Math.atan2(y2 - cy, x2 - cx), L = 9;
      g.push('<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + 色2 + '"/>');
      var 長 = Math.sqrt(p.x * p.x + p.y * p.y);
      g.push('<text x="' + 丸(x2 + (p.x >= 0 ? 12 : -12), 1) + '" y="' + 丸(y2 - 6, 1)
        + '" class="lb">' + esc((名ら && 名ら[i]) || "") + "(" + p.x + "," + p.y + ") |" + 丸(長, 2) + "|</text>");
    });
    return svg(W, H, g.join(""), "ベクトル");
  }

  function 正多面体(種, a) {
    if (!(a > 0)) return null;
    var W = 200, H = 200, cx = 100, cy = 96, R = 70;
    var g = [];
    if (/四面/.test(種)) {
      var p = [[cx, cy - R], [cx - R * 0.87, cy + R * 0.5], [cx + R * 0.87, cy + R * 0.5], [cx, cy + R * 0.18]];
      g.push('<polygon points="' + [p[0], p[1], p[2]].map(function (q) { return q[0] + "," + q[1]; }).join(" ") + '" class="sh"/>');
      [[0, 3], [1, 3], [2, 3]].forEach(function (e) {
        g.push('<line x1="' + p[e[0]][0] + '" y1="' + p[e[0]][1] + '" x2="' + p[e[1]][0]
          + '" y2="' + p[e[1]][1] + '" class="gd"/>');
      });
      g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">正四面体 一辺 ' + 丸(a, 2)
        + " ／ 体積 " + 丸(a * a * a / (6 * Math.SQRT2), 3) + "</text>");
    } else {
      var q2 = [[cx, cy - R], [cx - R * 0.8, cy], [cx, cy + R], [cx + R * 0.8, cy],
                [cx - R * 0.3, cy - R * 0.28], [cx + R * 0.3, cy + R * 0.28]];
      g.push('<polygon points="' + [q2[0], q2[1], q2[2], q2[3]].map(function (q3) { return q3[0] + "," + q3[1]; }).join(" ") + '" class="sh"/>');
      [[0, 4], [1, 4], [2, 5], [3, 5], [4, 5]].forEach(function (e) {
        g.push('<line x1="' + q2[e[0]][0] + '" y1="' + q2[e[0]][1] + '" x2="' + q2[e[1]][0]
          + '" y2="' + q2[e[1]][1] + '" class="gd"/>');
      });
      g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">正八面体 一辺 ' + 丸(a, 2)
        + " ／ 体積 " + 丸(Math.SQRT2 / 3 * a * a * a, 3) + "</text>");
    }
    return svg(W, H, g.join(""), "正多面体");
  }

  function 展開図(種, ns) {
    var W = 280, H = 210, g = [];
    if (/直方体|立方体/.test(種)) {
      var w = ns[0], d = ns[1] !== undefined ? ns[1] : ns[0], h = ns[2] !== undefined ? ns[2] : ns[0];
      if (!(w > 0 && d > 0 && h > 0)) return null;
      var s = Math.min((W - 30) / (2 * (w + d)), (H - 40) / (2 * d + h));
      var x0 = 15, y0 = 15;
      var 箱 = function (x, y, ww, hh) {
        return '<rect x="' + 丸(x, 1) + '" y="' + 丸(y, 1) + '" width="' + 丸(ww, 1)
          + '" height="' + 丸(hh, 1) + '" class="sh"/>';
      };
      g.push(箱(x0 + d * s, y0, w * s, d * s));
      g.push(箱(x0, y0 + d * s, d * s, h * s));
      g.push(箱(x0 + d * s, y0 + d * s, w * s, h * s));
      g.push(箱(x0 + (d + w) * s, y0 + d * s, d * s, h * s));
      g.push(箱(x0 + (2 * d + w) * s, y0 + d * s, w * s, h * s));
      g.push(箱(x0 + d * s, y0 + (d + h) * s, w * s, d * s));
      g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">表面積 '
        + 丸(2 * (w * d + d * h + h * w), 2) + "</text>");
      return svg(W, H, g.join(""), "展開図");
    }
    if (/円柱/.test(種)) {
      var r = ns[0], h2 = ns[1];
      if (!(r > 0 && h2 > 0)) return null;
      var 周 = 2 * Math.PI * r;
      var s2 = Math.min((W - 40) / 周, (H - 60) / (h2 + 2 * r));
      var bx = 20, by = 20 + r * s2 * 2;
      g.push('<rect x="' + bx + '" y="' + 丸(by, 1) + '" width="' + 丸(周 * s2, 1)
        + '" height="' + 丸(h2 * s2, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(bx + r * s2, 1) + '" cy="' + 丸(by - r * s2, 1) + '" r="' + 丸(r * s2, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(bx + r * s2, 1) + '" cy="' + 丸(by + h2 * s2 + r * s2, 1) + '" r="' + 丸(r * s2, 1) + '" class="sh"/>');
      g.push('<text x="' + 丸(bx + 周 * s2 / 2, 1) + '" y="' + 丸(by + h2 * s2 / 2, 1) + '" class="lb">周 ' + 丸(周, 2) + "</text>");
      g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">表面積 '
        + 丸(2 * Math.PI * r * (r + h2), 2) + "</text>");
      return svg(W, H, g.join(""), "展開図");
    }
    return null;
  }

  function 回路(並び) {
    var 部 = 文(並び).split(/\s*[-–—>]+\s*/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (!部.length) return null;
    var W = Math.min(320, 70 + 部.length * 62), H = 130;
    var y = 46, x0 = 24, 幅 = (W - x0 * 2) / 部.length;
    var g = ['<rect x="' + x0 + '" y="' + y + '" width="' + 丸(W - x0 * 2, 1) + '" height="46" fill="none" stroke="currentColor" stroke-width="1.6"/>'];
    部.forEach(function (n, i) {
      var cx = x0 + 幅 * i + 幅 / 2;
      g.push('<rect x="' + 丸(cx - 15, 1) + '" y="' + (y - 9) + '" width="30" height="18" rx="3" fill="var(--vq-surface,#fff)" stroke="currentColor" stroke-width="1.4"/>');
      if (/電池|battery/.test(n)) {
        g.push('<line x1="' + 丸(cx - 5, 1) + '" y1="' + (y - 7) + '" x2="' + 丸(cx - 5, 1) + '" y2="' + (y + 7) + '" class="ln"/>');
        g.push('<line x1="' + 丸(cx + 5, 1) + '" y1="' + (y - 3) + '" x2="' + 丸(cx + 5, 1) + '" y2="' + (y + 3) + '" class="ln"/>');
      } else if (/電球|lamp/.test(n)) {
        g.push('<circle cx="' + 丸(cx, 1) + '" cy="' + y + '" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>');
      } else if (/スイッチ|switch/.test(n)) {
        g.push('<line x1="' + 丸(cx - 8, 1) + '" y1="' + y + '" x2="' + 丸(cx + 6, 1) + '" y2="' + (y - 8) + '" class="ln"/>');
      } else {
        g.push('<rect x="' + 丸(cx - 10, 1) + '" y="' + (y - 5) + '" width="20" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/>');
      }
      g.push('<text x="' + 丸(cx, 1) + '" y="' + (y + 30) + '" class="lb">' + esc(n) + "</text>");
    });
    return svg(W, H, g.join(""), "回路");
  }

  function 力の図(組) {
    if (!組 || !組.length) return null;
    var W = 240, H = 220, cx = 120, cy = 112;
    var 大 = 1;
    組.forEach(function (f) { 大 = Math.max(大, Math.abs(f.値)); });
    var s = 68 / 大;
    var 向き = { 右: [1, 0], 左: [-1, 0], 上: [0, 1], 下: [0, -1] };
    var g = ['<rect x="' + (cx - 24) + '" y="' + (cy - 18) + '" width="48" height="36" rx="4" class="sh"/>'];
    組.slice(0, 6).forEach(function (f, i) {
      var v = 向き[f.名] || 向き[String(f.名).slice(-1)] || [1, 0];
      var x2 = cx + v[0] * (24 + Math.abs(f.値) * s), y2 = cy - v[1] * (18 + Math.abs(f.値) * s);
      var x1 = cx + v[0] * 24, y1 = cy - v[1] * 18;
      var 色2 = 見本色[i % 7];
      g.push('<line x1="' + 丸(x1, 1) + '" y1="' + 丸(y1, 1) + '" x2="' + 丸(x2, 1) + '" y2="'
        + 丸(y2, 1) + '" stroke="' + 色2 + '" stroke-width="2.6"/>');
      var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
      g.push('<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + 色2 + '"/>');
      g.push('<text x="' + 丸(x2 + v[0] * 10, 1) + '" y="' + 丸(y2 - v[1] * 8 + 4, 1)
        + '" class="lb">' + 丸(f.値, 2) + "N</text>");
    });
    return svg(W, H, g.join(""), "力の図");
  }

  /* ══ 言い回しを そろえる（2026-08-17・実測で 足した）══════════════
     ★ 30 通りの 自然な 書き方を 試したら **18 通りが 落ちた**。
       落ちていたのは どれも「人が ふつうに 書く形」だった:
         円: 半径3 ／ 円柱: 半径2 高さ5 ／ 球 半径3 ／ 立方体 一辺4
         扇形: 半径3 中心角60 ／ 直角三角形: 3,4,5 ／ 正三角形: 4
         斜面 30度 2kg ／ 構造式 メタン ／ 円グラフ りんご50%
       **AI に 書き方を 覚えさせる**より、**こちらが 受ける**ほうが 確実。
     ★ ここでやるのは 3 つだけ。
       ① 和名を 決まった名前へ（直角三角形 → 三角形 直角）
       ② 日本語の 項目名を 記号へ（半径 → r=、高さ → h=）
       ③ 単位を 落とす（cm・度・N/m・% など。数だけ 残す） */
  var 言い換え表 = [
    [/^直角三角形/, "三角形"], [/^正三角形/, "正多角形 3"], [/^正方形/, "正多角形 4"],
    [/^正(五|六|七|八|九|十|十二)角形/, function (m, n) {
      var 表 = { 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十二: 12 };
      return "正多角形 " + (表[n] || 6);
    }],
    [/^ひし形/, "平行四辺形"], [/^長方形|^四角形/, "長方形"],
    [/^円グラフ/, "円グラフ"], [/^帯グラフ/, "棒グラフ"],
    [/^複素数平面/, "複素数"], [/^空間座標/, "空間"], [/^座標平面/, "座標"]
  ];
  var 名の言い換え = { メタン: "CH4", 水: "H2O", アンモニア: "NH3",
    二酸化炭素: "CO2", メタノール: "CH3OH", エタノール: "C2H5OH" };
  function 引数を正す(t) {
    var s2 = 文(t);
    /* 全角 → 半角 */
    s2 = s2.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[，、]/g, ",")
           .replace(/[：]/g, ":").replace(/[＝]/g, "=")
           .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    /* 日本語の 項目名 → 記号。**「=」が 無くても 受ける** */
    s2 = s2.replace(/半径\s*=?\s*/g, "r=").replace(/直径\s*=?\s*/g, "d2=")
           .replace(/(高さ|高|たかさ)\s*=?\s*/g, "h=")
           /* ★ 「角」だけを 置き換えると **正六角形の 角まで 壊す**
                （正六角=形 になった。2026-08-17・実測）。 */
           .replace(/(中心角|角度|中心の角|∠)\s*=?\s*/g, "角=")
           /* ★ 一辺は **落とさず 印として 残す**（2026-08-17）。
              落とすと 正多角形で「4」が 半径なのか 一辺なのか 分からなくなり、
              半径のつもりで 描いて **大きさが 違う図**に なる。 */
           .replace(/(一辺|1辺|辺の長さ)\s*=?\s*/g, "辺=")
           .replace(/(底辺|下底)\s*=?\s*/g, "下=").replace(/上底\s*=?\s*/g, "上=")
           .replace(/(斜辺|となりの辺)\s*=?\s*/g, "")
           .replace(/質量\s*=?\s*/g, "質量=")
           .replace(/ばね定数\s*=?\s*/g, "k=").replace(/(伸び|のび)\s*=?\s*/g, "x=")
           .replace(/θ\s*=?\s*/g, "角=");
    /* 「正六角形」→ 6（見出しでなく **引数の中**にも 出る） */
    s2 = s2.replace(/正(三|四|五|六|七|八|九|十|十一|十二|\d+)角形/g, function (m, n) {
      var 表 = { 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
      return 表[n] !== undefined ? String(表[n]) : String(parseInt(n, 10) || 6);
    });
    /* 単位を 落とす（数だけ 残す）。
       ★ ローマ字の 単位は **うしろに 字が 続かないとき だけ** 落とす。
         そうしないと「3 max」の m まで 食う。 */
    s2 = s2.replace(/([\d.])\s*(cm2|cm3|m2|m3|cm|mm|km|kg|N\/m|Hz|mol|m|g|N|J|W|V|A)(?![A-Za-z0-9])/g, "$1")
           .replace(/([\d.])\s*(度|°|％|%|個|点|人|円|年|才|歳|Ω|℃)/g, "$1");
    /* 直径 → 半径 */
    s2 = s2.replace(/d2=\s*(-?[\d.]+)/g, function (m, v) { return "r=" + (parseFloat(v) / 2); });
    return s2.replace(/\s{2,}/g, " ").trim();
  }
  function 見出しを正す(種) {
    var t = 文(種);
    for (var i = 0; i < 言い換え表.length; i++) {
      if (言い換え表[i][0].test(t)) return t.replace(言い換え表[i][0], 言い換え表[i][1]);
    }
    return t;
  }

  /* ══ 入口（1 行 → 図）═══════════════════════════════════════════ */
  function 一行(l0) {
    var l = 文(l0).trim();
    /* 見出しと 引数を そろえてから 読む */
    var mm0 = /^([^\s:：]+)\s*[:：]?\s*([\s\S]*)$/.exec(l);
    if (mm0) {
      var 頭 = 見出しを正す(mm0[1]);
      var 尾 = 引数を正す(mm0[2] || "");
      /* 「正三角形 4」→「正多角形 3 4」のように 見出しが 数を 持つことがある */
      l = (頭 + " " + 尾).replace(/\s{2,}/g, " ").trim();
      /* ★ 「正三角形: 4」「正六角形 4」の 4 は **一辺**のこと（2026-08-17）。
         半径として 描くと 大きさが 変わってしまう。名前で n が 決まっている
         ときだけ、うしろの 裸の数を 一辺として 読む。 */
      if (/^正多角形\s+\d+$/.test(頭) && /^-?[\d.]+$/.test(尾.trim())) {
        l = 頭 + " 辺=" + 尾.trim();
      }
      if (名の言い換え[(mm0[2] || "").trim()]) l = 頭 + " " + 名の言い換え[(mm0[2] || "").trim()];
    }
    return 読み取る(l, l0);
  }
  function 読み取る(l, l0) {
    var m = /^([^\s:：]+)\s*[:：]?\s*(.*)$/.exec(文(l).trim());
    if (!m) return null;
    var 種 = m[1], 引 = m[2] || "";
    var ns = 数を読む(引);
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], null);
    var h = 数((/(?:h|高さ|高)\s*=?\s*(-?[\d.]+)/i.exec(引) || [])[1], null);

    if (/^(関数|グラフ|function|graph)$/.test(種)) return 関数(引.split(/[,、]\s*(?=y\s*=)/));
    if (/^(散布図|相関|scatter)$/.test(種)) {
      var 点 = 点を読む(引);
      if (点.length < 2) {
        var xs = (/x\s*[:：]\s*([^y]+)/i.exec(引) || [])[1];
        var ys = (/y\s*[:：]\s*(.+)$/i.exec(引) || [])[1];
        if (xs && ys) {
          var X2 = 数を読む(xs), Y2 = 数を読む(ys);
          点 = X2.map(function (v, i) { return { x: v, y: Y2[i] }; })
                 .filter(function (p) { return isFinite(p.y); });
        }
      }
      return 散布図(点, {});
    }
    if (/^(円グラフ|pie)$/.test(種)) return 円グラフ(組を読む(引));
    if (/^(棒グラフ|bar)$/.test(種)) return 棒グラフ(組を読む(引));
    if (/^(折れ線|折れ線グラフ|line)$/.test(種)) return 折れ線(組を読む(引));
    if (/^(ヒストグラム|histogram)$/.test(種)) return ヒストグラム(組を読む(引));
    if (/^(箱ひげ|箱ひげ図|boxplot)$/.test(種)) return 箱ひげ(ns);
    if (/^(正多角形|regular)$/.test(種)) {
      var 辺4 = 数((/辺\s*=\s*(-?[\d.]+)/.exec(引) || [])[1], null);
      var n4 = ns[0];
      if (辺4 !== null && n4 >= 3) {
        /* 一辺 a の 正 n 角形の 外接円: R = a / (2 sin(π/n))。目分量では 出さない。 */
        return 正多角形(n4, 辺4 / (2 * Math.sin(Math.PI / n4)), 辺4);
      }
      return 正多角形(n4, r !== null ? r : (ns[1] || 1), null);
    }
    if (/^(扇形|おうぎ形|sector)$/.test(種)) {
      var 角 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      return 扇形(r !== null ? r : ns[0], 角);
    }
    if (/^(楕円|ellipse)$/.test(種)) {
      var A2 = 数((/a\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[0]);
      var B2 = 数((/b\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return 楕円(A2, B2);
    }
    /* ★ 三角形を **寸法だけ**で 描く（2026-08-17・実測で 足した）。
       「三角形: 底辺4 高さ3」「直角三角形: 3,4,5」のように、
       頂点の 名前も 座標も 無い 書きかたが いちばん よく 来る。
       頂点名や 座標が ある行は **座標エンジンの 仕事**なので ここでは 断る。 */
    if (/^(三角形|triangle)$/.test(種) && !/[A-Za-z]\s*\(/.test(引) && !/[A-Za-z]{3}/.test(引)) {
      var 直 = /直角/.test(文(l0)) || /直角/.test(引);
      var 下3 = 数((/下\s*=\s*(-?[\d.]+)/.exec(引) || [])[1], null);
      if (下3 !== null && h !== null) return 三角形寸法(下3, h, 直);
      if (ns.length >= 3) return 三角形三辺(ns[0], ns[1], ns[2]);
      if (ns.length === 2) return 三角形寸法(ns[0], ns[1], 直);
      return null;
    }
    if (/^(平行四辺形|parallelogram)$/.test(種)) {
      var 角2 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], 60);
      return 平行四辺形(ns[0], ns[1], 角2);
    }
    if (/^(台形|trapezoid)$/.test(種)) {
      var 上 = 数((/(?:上|上底)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[0]);
      var 下 = 数((/(?:下|下底)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      var 高2 = h !== null ? h : ns[2];
      return 台形(上, 下, 高2);
    }
    if (/^(立方体|cube)$/.test(種)) return 直方体(ns[0], ns[0], ns[0]);
    if (/^(直方体|cuboid|box)$/.test(種)) return 直方体(ns[0], ns[1], ns[2]);
    if (/^(円柱|cylinder)$/.test(種)) return 円柱(r !== null ? r : ns[0], h !== null ? h : ns[1]);
    if (/^(円錐|cone)$/.test(種)) return 円錐(r !== null ? r : ns[0], h !== null ? h : ns[1]);
    if (/^(球|sphere)$/.test(種)) return 球(r !== null ? r : ns[0]);
    if (/^(角錐|pyramid)$/.test(種)) return 角錐(ns[0], h !== null ? h : ns[1], ns[2] || 4);
    if (/^(三角柱|prism)$/.test(種)) return 直方体(ns[0], ns[1], ns[2]);
    /* ★ **見出しを 書かない 書き方**（2026-08-17・実測）。
       AI は 「関数:」を 付けずに、いきなり
         y = x^2 - 2x - 3
       と 書く。いちばん 自然な 書き方なので **そのまま 受ける**。
       ・y = … → 関数のグラフ
       ・r = … → 極座標
       実測で ここだけ 落ちていた（ほかの 3 つは 通っていた）。 */
    if (/^y\s*=/i.test(文(l).trim())) {
      return 関数(文(l).split(/\s*[,、]\s*(?=y\s*=)/i));
    }
    if (/^(ベン図|venn)$/.test(種)) {
      var 組2 = 組を読む(引);
      if (組2.length < 2) 組2 = 引.split(/[,、\s]+/).filter(Boolean).map(function (n) { return { 名: n }; });
      return ベン図(組2);
    }
    if (/^(単位円|unitcircle)$/.test(種)) return 単位円(ns[0]);
    if (/^(樹形図|tree)$/.test(種)) return 樹形図(引);
    if (/^(数直線|numberline)$/.test(種)) return 数直線(引);
    if (/^(円と接線|接線|tangent)$/.test(種)) {
      var d2 = 数((/(?:d|距離)\s*=?\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return 円と接線(r !== null ? r : ns[0], d2);
    }
    if (/^(ベクトル|vector)$/.test(種)) {
      var ps = 点を読む(引);
      var 名2 = (引.match(/([A-Za-z\u3041-\u30ff])\s*\(/g) || []).map(function (t) { return t.replace(/[\s(]/g, ""); });
      return ベクトル(ps, 名2);
    }
    if (/^(正四面体|正八面体|tetrahedron|octahedron)$/.test(種)) {
      return 正多面体(/四面|tetra/.test(種) ? "四面" : "八面", ns[0]);
    }
    if (/^(展開図|net)$/.test(種)) {
      var 何 = /円柱|cylinder/.test(引) ? "円柱" : "直方体";
      var ns2 = ns.slice();
      if (何 === "円柱") {
        var r2 = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns2[0]);
        var h2 = 数((/h\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns2[1]);
        ns2 = [r2, h2];
      }
      return 展開図(何, ns2);
    }
    if (/^(回路|circuit)$/.test(種)) return 回路(引);
    if (/^(力|力の図|force)$/.test(種)) return 力の図(組を読む(引));
    return null;
  }

  VQG.more = { 一行: 一行, 引数を正す: 引数を正す, 三角形寸法: 三角形寸法, 三角形三辺: 三角形三辺, 見出しを正す: 見出しを正す, ベン図: ベン図, 単位円: 単位円, 樹形図: 樹形図, 数直線: 数直線,
               円と接線: 円と接線, ベクトル: ベクトル, 正多面体: 正多面体, 展開図: 展開図,
               回路: 回路, 力の図: 力の図, 点検: 点検, なぜだめ: function () { return 最後のだめ; }, 関数: 関数, 散布図: 散布図, 円グラフ: 円グラフ, 棒グラフ: 棒グラフ,
               折れ線: 折れ線, 箱ひげ: 箱ひげ, 正多角形: 正多角形, 扇形: 扇形, 楕円: 楕円,
               平行四辺形: 平行四辺形, 台形: 台形, 直方体: 直方体, 円柱: 円柱, 円錐: 円錐,
               球: 球, 角錐: 角錐, 式にする: 式にする, 組を読む: 組を読む };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/geo/sci.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/geo/sci.js — 図形の 第 3 弾（数学の 作図・理科の 図）

   ★ 訴え（2026-08-17）「まだ無いもの を 全部 追加しちゃっていい」。
     相似・合同の印／垂線・角の二等分線／不等式の領域／複素数平面／
     極座標／空間座標／正十二面体・正二十面体／化学構造式／並列回路／
     斜面・ばね（力学）／年表

   ★ 決めごとは 前と 同じ。
     ・**値から 座標を 出す。**目分量では 置かない。
     ・縦横は **同じ倍率**。
     ・数が 読めなければ **描かない。**
     ・出す前に **点検**（NaN・枠外・空）。落ちたら 出さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var 色ら = ["#2b70ef", "#e5484d", "#2ea043", "#d69600", "#8a81c2", "#00a3a3", "#c2557a"];
  var なぜ = "";
  function svg(W, H, 中, 名) {
    var 悪 = VQG.more && VQG.more.点検 ? VQG.more.点検(W, H, 中) : null;
    if (悪) { なぜ = (名 || "図") + ": " + 悪; return null; }
    return '<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="' + esc(名 || "図") + '">' + 中 + "</svg>";
  }
  function 数ら(s) {
    return 文(s).split(/[\s,、]+/).map(Number).filter(function (x) { return isFinite(x); });
  }
  function 矢(x1, y1, x2, y2, 色, 太) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
    return '<line x1="' + 丸(x1, 1) + '" y1="' + 丸(y1, 1) + '" x2="' + 丸(x2, 1) + '" y2="' + 丸(y2, 1)
      + '" stroke="' + (色 || "currentColor") + '" stroke-width="' + (太 || 2.2) + '"/>'
      + '<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + (色 || "currentColor") + '"/>';
  }
  function 目盛り(g, X, Y, 小x, 大x, 小y, 大y, W, H) {
    for (var vx = Math.ceil(小x); vx <= 大x; vx++) {
      if (!vx) continue;
      g.push('<line x1="' + 丸(X(vx), 1) + '" y1="' + 丸(Y(0) - 3, 1) + '" x2="' + 丸(X(vx), 1)
        + '" y2="' + 丸(Y(0) + 3, 1) + '" class="tk"/>');
    }
    for (var vy = Math.ceil(小y); vy <= 大y; vy++) {
      if (!vy) continue;
      g.push('<line x1="' + 丸(X(0) - 3, 1) + '" y1="' + 丸(Y(vy), 1) + '" x2="' + 丸(X(0) + 3, 1)
        + '" y2="' + 丸(Y(vy), 1) + '" class="tk"/>');
    }
  }

  /* ══ 相似・合同 ═══════════════════════════════════════════════ */
  function 三辺座標(a, b, c) {
    if (!(a > 0 && b > 0 && c > 0)) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;
    var A = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    return [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: b * Math.cos(A), y: b * Math.sin(A) }];
  }
  function 相似(a, b, c, 比, 合同) {
    var P = 三辺座標(a, b, c);
    if (!P || !(比 > 0)) return null;
    var W = 300, H = 190, 余 = 26;
    var 大 = Math.max(a, b, c) * (1 + 比);
    var s = Math.min((W - 余 * 3) / 大, (H - 余 * 2) / (Math.max.apply(null, P.map(function (p) { return p.y; })) * Math.max(1, 比)));
    var g = [], 印 = ["", "‖", "≡"];
    [[1, 20], [比, 20 + (Math.max(a, b, c) * s) + 26]].forEach(function (t, k) {
      var 倍 = t[0] * s, x0 = t[1], y0 = H - 34;
      var ps = P.map(function (p) { return [x0 + p.x * 倍, y0 - p.y * 倍]; });
      g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="sh" style="fill:' + 色ら[k] + '22;stroke:' + 色ら[k] + '"/>');
      /* 対応する辺に **同じ数の 印**（相似・合同の しるし） */
      [[0, 1, 1], [0, 2, 2], [1, 2, 3]].forEach(function (e) {
        var A2 = ps[e[0]], B2 = ps[e[1]];
        var mx = (A2[0] + B2[0]) / 2, my = (A2[1] + B2[1]) / 2;
        var dx = B2[0] - A2[0], dy = B2[1] - A2[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / L, ny = dx / L;
        for (var i = 0; i < e[2]; i++) {
          var o = (i - (e[2] - 1) / 2) * 4;
          g.push('<line x1="' + 丸(mx + nx * 4 + dx / L * o, 1) + '" y1="' + 丸(my + ny * 4 + dy / L * o, 1)
            + '" x2="' + 丸(mx - nx * 4 + dx / L * o, 1) + '" y2="' + 丸(my - ny * 4 + dy / L * o, 1)
            + '" stroke="' + 色ら[k] + '" stroke-width="1.6"/>');
        }
      });
      var 名 = [a, b, c].map(function (v) { return 丸(v * t[0], 2); }).join(", ");
      g.push('<text x="' + 丸(x0 + Math.max(a, b, c) * 倍 / 2, 1) + '" y="' + (H - 14) + '" class="lb">' + 名 + "</text>");
    });
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + (合同 ? "合同（≡）" : "相似比 1 : " + 丸(比, 2)) + "</text>");
    return svg(W, H, g.join(""), 合同 ? "合同" : "相似");
  }

  /* ══ 作図（垂線・角の二等分線）═════════════════════════════════ */
  function 垂線(A, B, P) {
    if (!A || !B || !P) return null;
    var dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return null;
    var t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2;
    var H2 = { x: A.x + dx * t, y: A.y + dy * t };            /* 足（計算で 出す） */
    var pts = [A, B, P, H2];
    var 小x = Math.min.apply(null, pts.map(function (p) { return p.x; })) - 1;
    var 大x = Math.max.apply(null, pts.map(function (p) { return p.x; })) + 1;
    var 小y = Math.min.apply(null, pts.map(function (p) { return p.y; })) - 1;
    var 大y = Math.max.apply(null, pts.map(function (p) { return p.y; })) + 1;
    var W = 260, H = 200, 余 = 28;
    var s = Math.min((W - 余 * 2) / (大x - 小x), (H - 余 * 2) / (大y - 小y));
    var X = function (x) { return 余 + (x - 小x) * s; }, Y = function (y) { return H - 余 - (y - 小y) * s; };
    var g = [];
    g.push('<line x1="' + 丸(X(A.x), 1) + '" y1="' + 丸(Y(A.y), 1) + '" x2="' + 丸(X(B.x), 1) + '" y2="' + 丸(Y(B.y), 1) + '" class="ln"/>');
    g.push('<line x1="' + 丸(X(P.x), 1) + '" y1="' + 丸(Y(P.y), 1) + '" x2="' + 丸(X(H2.x), 1) + '" y2="' + 丸(Y(H2.y), 1) + '" class="gl"/>');
    /* 直角の印 */
    var u = { x: dx / Math.sqrt(L2), y: dy / Math.sqrt(L2) };
    var v = { x: (P.x - H2.x), y: (P.y - H2.y) };
    var vl = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
    v = { x: v.x / vl, y: v.y / vl };
    var d2 = 11 / s;
    g.push('<polyline points="' + [
      [H2.x + u.x * d2, H2.y + u.y * d2],
      [H2.x + u.x * d2 + v.x * d2, H2.y + u.y * d2 + v.y * d2],
      [H2.x + v.x * d2, H2.y + v.y * d2]
    ].map(function (p) { return 丸(X(p[0]), 1) + "," + 丸(Y(p[1]), 1); }).join(" ") + '" class="rt"/>');
    [[A, "A"], [B, "B"], [P, "P"], [H2, "H"]].forEach(function (t2) {
      g.push('<circle cx="' + 丸(X(t2[0].x), 1) + '" cy="' + 丸(Y(t2[0].y), 1) + '" r="2.8" class="pt"/>');
      g.push('<text x="' + 丸(X(t2[0].x), 1) + '" y="' + 丸(Y(t2[0].y) - 8, 1) + '" class="nm">' + t2[1] + "</text>");
    });
    var 長 = Math.sqrt((P.x - H2.x) * (P.x - H2.x) + (P.y - H2.y) * (P.y - H2.y));
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">H(' + 丸(H2.x, 2) + ", " + 丸(H2.y, 2)
      + ")　PH = " + 丸(長, 3) + "</text>");
    return svg(W, H, g.join(""), "垂線");
  }
  function 二等分線(角) {
    角 = 数(角, null);
    if (角 === null || 角 <= 0 || 角 >= 180) return null;
    var W = 240, H = 190, ox = 40, oy = H - 40, R = 130;
    var t = 角 * Math.PI / 180, h = t / 2;
    var g = [];
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R, 1) + '" y2="' + oy + '" class="ln"/>');
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R * Math.cos(t), 1) + '" y2="' + 丸(oy - R * Math.sin(t), 1) + '" class="ln"/>');
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R * 0.85 * Math.cos(h), 1) + '" y2="' + 丸(oy - R * 0.85 * Math.sin(h), 1) + '" class="gl"/>');
    [0, h, t].forEach(function (a, i) {
      var r = 34 + i * 0;
      g.push('<path d="M' + 丸(ox + r * Math.cos(i ? (i === 1 ? 0 : h) : 0), 1) + " " + 丸(oy - r * Math.sin(i ? (i === 1 ? 0 : h) : 0), 1)
        + "A" + r + " " + r + " 0 0 0 " + 丸(ox + r * Math.cos(i === 1 ? h : (i === 2 ? t : 0)), 1) + " "
        + 丸(oy - r * Math.sin(i === 1 ? h : (i === 2 ? t : 0)), 1) + '" fill="none" class="gd"/>');
    });
    g.push('<text x="' + 丸(ox + 52 * Math.cos(h / 2), 1) + '" y="' + 丸(oy - 52 * Math.sin(h / 2) + 4, 1) + '" class="lb">' + 丸(角 / 2, 1) + "°</text>");
    g.push('<text x="' + 丸(ox + 52 * Math.cos(h * 1.5), 1) + '" y="' + 丸(oy - 52 * Math.sin(h * 1.5) + 4, 1) + '" class="lb">' + 丸(角 / 2, 1) + "°</text>");
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + 丸(角, 1) + "° の 二等分線</text>");
    return svg(W, H, g.join(""), "角の二等分線");
  }

  /* ══ 不等式の 領域 ═══════════════════════════════════════════ */
  function 領域(式) {
    var m = /y\s*(>=|≧|>|<=|≦|<)\s*(.+)$/i.exec(文(式));
    if (!m) return null;
    var f = VQG.more && VQG.more.式にする ? VQG.more.式にする(m[2]) : null;
    if (!f) return null;
    var 上 = />/.test(m[1]) || /≧/.test(m[1]);
    var 含 = /=|≧|≦/.test(m[1]);
    var W = 280, H = 240, 小x = -5, 大x = 5;
    var ys = [];
    for (var i = 0; i <= 200; i++) { var y = f(小x + (大x - 小x) * i / 200); if (isFinite(y)) ys.push(y); }
    if (!ys.length) return null;
    ys.sort(function (a, b) { return a - b; });
    var 小y = ys[Math.round((ys.length - 1) * 0.05)], 大y = ys[Math.round((ys.length - 1) * 0.95)];
    var 幅 = Math.max(1, 大y - 小y);
    小y -= 幅 * 0.5; 大y += 幅 * 0.5;
    var 余 = 24;
    var X = function (x) { return 余 + (x - 小x) / (大x - 小x) * (W - 余 * 2); };
    var Y = function (y) { return H - 余 - (y - 小y) / (大y - 小y) * (H - 余 * 2); };
    var g = [];
    g.push('<line x1="' + 余 + '" y1="' + 丸(Y(0), 1) + '" x2="' + (W - 余) + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
    g.push('<line x1="' + 丸(X(0), 1) + '" y1="' + 余 + '" x2="' + 丸(X(0), 1) + '" y2="' + (H - 余) + '" class="ax"/>');
    目盛り(g, X, Y, 小x, 大x, 小y, 大y, W, H);
    var 上端 = [], 線 = [];
    for (var k = 0; k <= 200; k++) {
      var x2 = 小x + (大x - 小x) * k / 200, y2 = f(x2);
      if (!isFinite(y2)) continue;
      y2 = Math.max(小y, Math.min(大y, y2));
      線.push(丸(X(x2), 1) + "," + 丸(Y(y2), 1));
      上端.push([X(x2), Y(y2)]);
    }
    if (線.length < 2) return null;
    var 塗 = 線.slice();
    塗.push(丸(X(大x), 1) + "," + 丸(上 ? Y(大y) : Y(小y), 1));
    塗.push(丸(X(小x), 1) + "," + 丸(上 ? Y(大y) : Y(小y), 1));
    g.push('<polygon points="' + 塗.join(" ") + '" fill="rgba(43,112,239,.20)" stroke="none"/>');
    g.push('<polyline points="' + 線.join(" ") + '" class="fn"'
      + (含 ? "" : ' stroke-dasharray="5 4"') + "/>");
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">y ' + esc(m[1]) + " " + esc(m[2])
      + (含 ? "（境目を 含む）" : "（境目を 含まない）") + "</text>");
    return svg(W, H, g.join(""), "領域");
  }

  /* ══ 複素数平面 ═══════════════════════════════════════════════ */
  function 複素数(s) {
    var 出 = [], re = /(-?[\d.]*)\s*([+-])\s*(-?[\d.]*)\s*i|(-?[\d.]+)\s*i|(-?[\d.]+)/g, m;
    文(s).split(/[,、]+/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var mm = /^(-?[\d.]+)?\s*([+-]\s*[\d.]*)i$/.exec(t.replace(/\s+/g, ""));
      if (mm) {
        var a = 数(mm[1], 0);
        var b = mm[2].replace(/\s+/g, "");
        b = (b === "+" ? 1 : b === "-" ? -1 : 数(b, 0));
        出.push({ a: a, b: b }); return;
      }
      var m2 = /^(-?[\d.]*)i$/.exec(t.replace(/\s+/g, ""));
      if (m2) { 出.push({ a: 0, b: m2[1] === "" ? 1 : (m2[1] === "-" ? -1 : 数(m2[1], 0)) }); return; }
      var v = 数(t, null);
      if (v !== null) 出.push({ a: v, b: 0 });
    });
    if (!出.length) return null;
    var 大 = 1;
    出.forEach(function (z) { 大 = Math.max(大, Math.abs(z.a), Math.abs(z.b)); });
    var W = 240, H = 230, cx = 120, cy = 108, s2 = 82 / 大;
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 30) + '" class="ax"/>',
             '<text x="' + (W - 14) + '" y="' + (cy - 6) + '" class="lb">実</text>',
             '<text x="' + (cx + 10) + '" y="18" class="lb">虚</text>'];
    出.slice(0, 4).forEach(function (z, i) {
      var x2 = cx + z.a * s2, y2 = cy - z.b * s2;
      g.push(矢(cx, cy, x2, y2, 色ら[i % 7], 2.2));
      var r = Math.sqrt(z.a * z.a + z.b * z.b);
      var th = Math.atan2(z.b, z.a) * 180 / Math.PI;
      g.push('<text x="' + 丸(x2 + (z.a >= 0 ? 8 : -8), 1) + '" y="' + 丸(y2 - 6, 1) + '" class="lb">'
        + 丸(z.a, 2) + (z.b >= 0 ? "+" : "-") + 丸(Math.abs(z.b), 2) + "i</text>");
      g.push('<text x="' + (W / 2) + '" y="' + (H - 18 + i * 0) + '" class="lb">|z| = ' + 丸(r, 3)
        + "　偏角 " + 丸(th, 1) + "°</text>");
    });
    return svg(W, H, g.join(""), "複素数平面");
  }

  /* ══ 極座標 ═══════════════════════════════════════════════════ */
  function 極座標(式) {
    var 本 = 文(式).replace(/^\s*r\s*=\s*/i, "").replace(/θ|t\b/g, "x");
    var f = VQG.more && VQG.more.式にする ? VQG.more.式にする(本) : null;
    if (!f) return null;
    var W = 240, H = 240, cx = 120, cy = 120;
    var 大 = 0, 点 = [];
    for (var i = 0; i <= 720; i++) {
      var th = i * Math.PI / 180 * 2, r = f(th);
      if (!isFinite(r)) continue;
      大 = Math.max(大, Math.abs(r));
    }
    if (!(大 > 0)) return null;
    var s = 96 / 大;
    for (var k = 0; k <= 720; k++) {
      var t2 = k * Math.PI / 180 * 2, r2 = f(t2);
      if (!isFinite(r2)) { 点.push(null); continue; }
      点.push([cx + r2 * s * Math.cos(t2), cy - r2 * s * Math.sin(t2)]);
    }
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 10) + '" class="ax"/>'];
    [0.33, 0.66, 1].forEach(function (p) {
      g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(96 * p, 1) + '" class="gd" fill="none"/>');
    });
    var 並 = [];
    点.forEach(function (p) {
      if (!p) { if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>'); 並 = []; return; }
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) {
        if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>');
        並 = []; return;
      }
      並.push(丸(p[0], 1) + "," + 丸(p[1], 1));
    });
    if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>');
    return svg(W, H, g.join(""), "極座標");
  }

  /* ══ 空間座標（3D の 見取り図）════════════════════════════════ */
  function 空間(点す) {
    var ps = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m;
    while ((m = re.exec(文(点す)))) ps.push({ x: 数(m[1], 0), y: 数(m[2], 0), z: 数(m[3], 0) });
    if (!ps.length) return null;
    var 大 = 1;
    ps.forEach(function (p) { 大 = Math.max(大, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)); });
    var W = 240, H = 230, ox = 92, oy = 152, s = 62 / 大;
    /* y は 奥（斜め 45°・0.55 倍）。**この比は 固定**（毎回 同じ見え方にする） */
    var P = function (p) { return [ox + (p.x + p.y * 0.55 * 0.71) * s, oy - (p.z + p.y * 0.55 * 0.71) * s]; };
    var g = [];
    g.push(矢(ox, oy, ox + 大 * s * 1.15, oy, "currentColor", 1.4));
    g.push(矢(ox, oy, ox + 大 * s * 0.55 * 0.71 * 1.3, oy - 大 * s * 0.55 * 0.71 * 1.3, "currentColor", 1.4));
    g.push(矢(ox, oy, ox, oy - 大 * s * 1.15, "currentColor", 1.4));
    g.push('<text x="' + 丸(ox + 大 * s * 1.15 + 8, 1) + '" y="' + (oy + 4) + '" class="lb">x</text>');
    g.push('<text x="' + 丸(ox + 大 * s * 0.55 * 0.71 * 1.3 + 8, 1) + '" y="' + 丸(oy - 大 * s * 0.55 * 0.71 * 1.3, 1) + '" class="lb">y</text>');
    g.push('<text x="' + (ox - 10) + '" y="' + 丸(oy - 大 * s * 1.15, 1) + '" class="lb">z</text>');
    ps.slice(0, 4).forEach(function (p, i) {
      var q = P(p), 足 = P({ x: p.x, y: p.y, z: 0 });
      g.push('<line x1="' + 丸(足[0], 1) + '" y1="' + 丸(足[1], 1) + '" x2="' + 丸(q[0], 1) + '" y2="' + 丸(q[1], 1) + '" class="gd"/>');
      g.push('<circle cx="' + 丸(q[0], 1) + '" cy="' + 丸(q[1], 1) + '" r="3.2" fill="' + 色ら[i % 7] + '"/>');
      g.push('<text x="' + 丸(q[0] + 8, 1) + '" y="' + 丸(q[1] - 6, 1) + '" class="lb">(' + p.x + "," + p.y + "," + p.z + ")</text>");
    });
    var p0 = ps[0];
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">原点からの 距離 '
      + 丸(Math.sqrt(p0.x * p0.x + p0.y * p0.y + p0.z * p0.z), 3) + "</text>");
    return svg(W, H, g.join(""), "空間座標");
  }

  /* ══ 正十二面体・正二十面体（見取り図＋正しい体積）══════════════ */
  function 正多面体2(種, a) {
    if (!(a > 0)) return null;
    var 十二 = /十二|dodeca/.test(種);
    var W = 210, H = 210, cx = 105, cy = 100, R = 76;
    var g = [];
    var n = 十二 ? 5 : 3;
    /* 外側の 輪郭（正 n 角形を 2 枚 ずらして 重ねる。見取り図として 一定） */
    [[R, 0, 1], [R * 0.62, Math.PI / n, 0.55]].forEach(function (t, k) {
      var ps = [];
      for (var i = 0; i < n * (十二 ? 1 : 1); i++) {
        var ang = -Math.PI / 2 + t[1] + i * Math.PI * 2 / n;
        ps.push([cx + t[0] * Math.cos(ang), cy + t[0] * Math.sin(ang)]);
      }
      g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="sh" style="opacity:' + t[2] + '"/>');
      if (k === 0) {
        ps.forEach(function (p, i) {
          var q = ps[(i + 1) % ps.length];
          g.push('<line x1="' + 丸(p[0], 1) + '" y1="' + 丸(p[1], 1) + '" x2="' + 丸(q[0], 1) + '" y2="' + 丸(q[1], 1) + '" class="ln"/>');
        });
      }
    });
    var 体 = 十二 ? (15 + 7 * Math.sqrt(5)) / 4 * a * a * a
                  : 5 * (3 + Math.sqrt(5)) / 12 * a * a * a;
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">'
      + (十二 ? "正十二面体" : "正二十面体") + " 一辺 " + 丸(a, 2) + " ／ 体積 " + 丸(体, 3) + "</text>");
    return svg(W, H, g.join(""), "正多面体");
  }

  /* ══ 化学構造式 ═══════════════════════════════════════════════ */
  var 構造 = {
    "CH4": { 中: "C", 枝: [["H", 90], ["H", 210], ["H", 330], ["H", 30]] },
    "H2O": { 中: "O", 枝: [["H", 210], ["H", 330]] },
    "NH3": { 中: "N", 枝: [["H", 90], ["H", 210], ["H", 330]] },
    "CO2": { 中: "C", 枝: [["O", 0, 2], ["O", 180, 2]] },
    "CH3OH": { 中: "C", 枝: [["H", 90], ["H", 210], ["H", 330], ["OH", 0]] }
  };
  function 構造式(名) {
    var n = 文(名).replace(/\s+/g, "");
    if (/^(ベンゼン|benzene|C6H6)$/i.test(n)) return ベンゼン();
    var d = 構造[n.toUpperCase()] || 構造[n];
    if (!d) return null;
    var W = 190, H = 170, cx = 95, cy = 82, R = 46;
    var g = ['<text x="' + cx + '" y="' + (cy + 6) + '" class="nm" style="font-size:16px">' + esc(d.中) + "</text>"];
    d.枝.forEach(function (b) {
      var a = b[1] * Math.PI / 180;
      var x1 = cx + 14 * Math.cos(a), y1 = cy - 14 * Math.sin(a);
      var x2 = cx + R * Math.cos(a), y2 = cy - R * Math.sin(a);
      var 本 = b[2] || 1;
      for (var i = 0; i < 本; i++) {
        var o = (i - (本 - 1) / 2) * 4;
        var nx = -Math.sin(a) * o, ny = -Math.cos(a) * o;
        g.push('<line x1="' + 丸(x1 + nx, 1) + '" y1="' + 丸(y1 + ny, 1) + '" x2="' + 丸(x2 + nx, 1)
          + '" y2="' + 丸(y2 + ny, 1) + '" class="ln"/>');
      }
      g.push('<text x="' + 丸(cx + (R + 12) * Math.cos(a), 1) + '" y="' + 丸(cy - (R + 12) * Math.sin(a) + 5, 1)
        + '" class="nm" style="font-size:14px">' + esc(b[0]) + "</text>");
    });
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">' + esc(n) + "</text>");
    return svg(W, H, g.join(""), "構造式");
  }
  function ベンゼン() {
    var W = 180, H = 180, cx = 90, cy = 84, R = 52;
    var g = [], ps = [];
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      ps.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh" fill="none"/>');
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(R * 0.58, 1) + '" class="gd" fill="none"/>');
    ps.forEach(function (p) {
      g.push('<text x="' + 丸(p[0], 1) + '" y="' + 丸(p[1] + 4, 1) + '" class="nm" style="font-size:12px">C</text>');
    });
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">ベンゼン C6H6</text>');
    return svg(W, H, g.join(""), "ベンゼン");
  }

  /* ══ 並列も 描ける 回路 ═══════════════════════════════════════ */
  function 回路2(並び) {
    var s = 文(並び);
    var 段 = s.split(/\s*[-–—]\s*/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (!段.length) return null;
    var 並列あり = /[（(].+[|｜].+[)）]/.test(s);
    var W = Math.min(330, 80 + 段.length * 66), H = 並列あり ? 170 : 130;
    var y = 46, x0 = 26, 幅 = (W - x0 * 2) / 段.length;
    var g = [];
    var 部品 = function (cx, cy, n) {
      var o = [];
      if (/電池|battery/.test(n)) {
        o.push('<line x1="' + 丸(cx - 5, 1) + '" y1="' + (cy - 9) + '" x2="' + 丸(cx - 5, 1) + '" y2="' + (cy + 9) + '" class="ln"/>');
        o.push('<line x1="' + 丸(cx + 5, 1) + '" y1="' + (cy - 4) + '" x2="' + 丸(cx + 5, 1) + '" y2="' + (cy + 4) + '" class="ln"/>');
      } else if (/電球|lamp/.test(n)) {
        o.push('<circle cx="' + 丸(cx, 1) + '" cy="' + cy + '" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>');
        o.push('<line x1="' + 丸(cx - 6, 1) + '" y1="' + (cy - 6) + '" x2="' + 丸(cx + 6, 1) + '" y2="' + (cy + 6) + '" class="gd"/>');
      } else if (/スイッチ|switch/.test(n)) {
        o.push('<line x1="' + 丸(cx - 9, 1) + '" y1="' + cy + '" x2="' + 丸(cx + 7, 1) + '" y2="' + (cy - 9) + '" class="ln"/>');
        o.push('<circle cx="' + 丸(cx - 9, 1) + '" cy="' + cy + '" r="2" class="pt"/>');
      } else {
        o.push('<rect x="' + 丸(cx - 12, 1) + '" y="' + (cy - 6) + '" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/>');
      }
      o.push('<text x="' + 丸(cx, 1) + '" y="' + (cy + 26) + '" class="lb">' + esc(n.replace(/[（()）|｜]/g, " ").trim()) + "</text>");
      return o.join("");
    };
    g.push('<rect x="' + x0 + '" y="' + y + '" width="' + 丸(W - x0 * 2, 1) + '" height="' + (H - y - 34)
      + '" fill="none" stroke="currentColor" stroke-width="1.6"/>');
    段.forEach(function (n, i) {
      var cx = x0 + 幅 * i + 幅 / 2;
      var 並 = /^[（(](.+)[)）]$/.exec(n);
      if (並 && /[|｜]/.test(並[1])) {
        var 枝 = 並[1].split(/[|｜]/).map(function (t) { return t.trim(); }).filter(Boolean);
        var 上 = y - 22, 下 = y + 22;
        枝.slice(0, 2).forEach(function (b, k) {
          var by = k === 0 ? 上 : 下;
          g.push('<line x1="' + 丸(cx - 26, 1) + '" y1="' + y + '" x2="' + 丸(cx - 26, 1) + '" y2="' + by + '" class="ln"/>');
          g.push('<line x1="' + 丸(cx - 26, 1) + '" y1="' + by + '" x2="' + 丸(cx + 26, 1) + '" y2="' + by + '" class="ln"/>');
          g.push('<line x1="' + 丸(cx + 26, 1) + '" y1="' + by + '" x2="' + 丸(cx + 26, 1) + '" y2="' + y + '" class="ln"/>');
          g.push('<rect x="' + 丸(cx - 13, 1) + '" y="' + (by - 7) + '" width="26" height="14" fill="var(--vq-surface,#fff)" stroke="none"/>');
          g.push(部品(cx, by, b));
        });
        return;
      }
      g.push('<rect x="' + 丸(cx - 16, 1) + '" y="' + (y - 10) + '" width="32" height="20" fill="var(--vq-surface,#fff)" stroke="none"/>');
      g.push(部品(cx, y, n));
    });
    return svg(W, H, g.join(""), "回路");
  }

  /* ══ 斜面と ばね（力学）═══════════════════════════════════════ */
  function 斜面(角, 質量) {
    角 = 数(角, null); 質量 = 数(質量, 1);
    if (角 === null || 角 <= 0 || 角 >= 90) return null;
    var W = 290, H = 200, ox = 24, oy = H - 34, L = 220;
    var t = 角 * Math.PI / 180;
    var 高 = L * Math.tan(t);
    var s = Math.min(1, (H - 60) / 高);
    var 底 = L * s, たか = 高 * s;
    var g = ['<polygon points="' + [[ox, oy], [ox + 底, oy], [ox + 底, oy - たか]]
      .map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    /* 物体は 斜面の 真ん中 */
    var mx = ox + 底 * 0.55, my = oy - たか * 0.55;
    var 直 = { x: Math.sin(t), y: Math.cos(t) };
    g.push('<rect x="' + 丸(mx - 11, 1) + '" y="' + 丸(my - 11, 1) + '" width="22" height="22" rx="3" fill="'
      + 色ら[0] + '" opacity=".85" transform="rotate(' + 丸(-角, 1) + " " + 丸(mx, 1) + " " + 丸(my, 1) + ')"/>');
    var W重 = 質量 * 9.8;
    var s2 = 46 / Math.max(1, W重);
    g.push(矢(mx, my, mx, my + W重 * s2, 色ら[1], 2.4));
    g.push('<text x="' + 丸(mx + 8, 1) + '" y="' + 丸(my + W重 * s2 + 4, 1) + '" class="lb">' + 丸(W重, 2) + "N</text>");
    var 平 = W重 * Math.sin(t), 垂 = W重 * Math.cos(t);
    g.push(矢(mx, my, mx - 平 * s2 * Math.cos(t), my + 平 * s2 * Math.sin(t), 色ら[2], 2));
    g.push(矢(mx, my, mx + 垂 * s2 * Math.sin(t), my + 垂 * s2 * Math.cos(t), 色ら[3], 2));
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + 丸(角, 1) + "° ／ " + 丸(質量, 2) + "kg</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">斜面方向 ' + 丸(平, 2)
      + "N ／ 垂直方向 " + 丸(垂, 2) + "N</text>");
    return svg(W, H, g.join(""), "斜面");
  }
  function ばね(k, x) {
    k = 数(k, null); x = 数(x, null);
    if (k === null || x === null || k <= 0) return null;
    var W = 290, H = 130, y = 60, x0 = 26;
    var 巻 = 8, 幅 = 120 + x * 60;
    if (!(幅 > 40 && 幅 < 200)) 幅 = Math.max(40, Math.min(200, 幅));
    var g = ['<line x1="' + x0 + '" y1="' + (y - 26) + '" x2="' + x0 + '" y2="' + (y + 26) + '" class="ln"/>'];
    var 点 = [[x0, y]];
    for (var i = 0; i <= 巻 * 2; i++) {
      点.push([x0 + 10 + (幅 - 20) * i / (巻 * 2), y + (i % 2 ? -11 : 11)]);
    }
    点.push([x0 + 幅, y]);
    g.push('<polyline points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
      + '" fill="none" stroke="currentColor" stroke-width="1.8"/>');
    g.push('<rect x="' + 丸(x0 + 幅, 1) + '" y="' + (y - 15) + '" width="30" height="30" rx="4" fill="' + 色ら[0] + '" opacity=".85"/>');
    var F = k * x;
    g.push(矢(x0 + 幅 + 34, y, x0 + 幅 + 34 + Math.min(60, Math.abs(F) * 6) * (x >= 0 ? 1 : -1), y, 色ら[1], 2.4));
    g.push('<text x="' + (W / 2) + '" y="18" class="lb">k = ' + 丸(k, 2) + " N/m ／ x = " + 丸(x, 3) + " m</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 8) + '" class="lb">弾性力 F = kx = ' + 丸(F, 3)
      + "N ／ 位置エネルギー " + 丸(0.5 * k * x * x, 4) + "J</text>");
    return svg(W, H, g.join(""), "ばね");
  }

  /* ══ 年表 ═══════════════════════════════════════════════════ */
  function 年表(s) {
    var 出 = [];
    文(s).split(/[,、\n]+/).forEach(function (t) {
      var m = /^\s*(-?\d{1,4})\s*年?\s*[:：]?\s*(.+?)\s*$/.exec(t);
      if (m) 出.push({ 年: Number(m[1]), 事: m[2] });
    });
    if (出.length < 2) return null;
    出.sort(function (a, b) { return a.年 - b.年; });
    var 小 = 出[0].年, 大 = 出[出.length - 1].年;
    if (大 === 小) 大 = 小 + 1;
    var W = 300, H = 44 + 出.length * 26;
    var 左 = 46, 右 = 14;
    var Y = function (v) { return 26 + (v - 小) / (大 - 小) * (H - 52); };
    var g = ['<line x1="' + 左 + '" y1="20" x2="' + 左 + '" y2="' + (H - 20) + '" class="ax"/>'];
    出.forEach(function (x, i) {
      var y = Y(x.年);
      g.push('<circle cx="' + 左 + '" cy="' + 丸(y, 1) + '" r="3.4" fill="' + 色ら[i % 7] + '"/>');
      g.push('<line x1="' + 左 + '" y1="' + 丸(y, 1) + '" x2="' + (左 + 12) + '" y2="' + 丸(y, 1) + '" class="gd"/>');
      g.push('<text x="' + (左 - 6) + '" y="' + 丸(y + 4, 1) + '" class="lb" text-anchor="end">' + x.年 + "</text>");
      g.push('<text x="' + (左 + 16) + '" y="' + 丸(y + 4, 1) + '" class="lb" text-anchor="start">' + esc(x.事) + "</text>");
    });
    return svg(W, H, g.join(""), "年表");
  }

  /* ══ 入口 ═══════════════════════════════════════════════════ */
  function 一行(l0) {
    /* ★ 言い回しの そろえは more.js と 共通で 使う（半径→r= など）。 */
    var l = 文(l0).trim();
    var m0 = /^([^\s:：]+)\s*[:：]?\s*([\s\S]*)$/.exec(l);
    if (m0 && VQG.more && VQG.more.引数を正す) {
      try {
        var 頭 = VQG.more.見出しを正す ? VQG.more.見出しを正す(m0[1]) : m0[1];
        l = (頭 + " " + VQG.more.引数を正す(m0[2] || "")).replace(/\s{2,}/g, " ").trim();
      } catch (e) {}
    }
    var m = /^([^\s:：]+)\s*[:：]?\s*(.*)$/.exec(l);
    if (!m) return null;
    var 種 = m[1], 引 = m[2] || "", ns = 数ら(引);
    /* 構造式の 和名 */
    if (/^(構造式|structure)$/.test(種)) {
      var 和 = { メタン: "CH4", 水: "H2O", アンモニア: "NH3", 二酸化炭素: "CO2",
                 メタノール: "CH3OH", ベンゼン: "ベンゼン" };
      var k0 = 文(m0 ? m0[2] : 引).trim();
      if (和[k0]) 引 = 和[k0];
    }
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], null);

    if (/^(相似|similar)$/.test(種)) {
      var 比 = 数((/(?:比|:)\s*1?\s*[:：]?\s*([\d.]+)\s*$/.exec(引) || [])[1], ns[3]);
      return 相似(ns[0], ns[1], ns[2], 比 || 1.5, false);
    }
    if (/^(合同|congruent)$/.test(種)) return 相似(ns[0], ns[1], ns[2], 1, true);
    if (/^(垂線|perpendicular)$/.test(種)) {
      var ps = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, mm;
      while ((mm = re.exec(引))) ps.push({ x: 数(mm[1], 0), y: 数(mm[2], 0) });
      return 垂線(ps[0], ps[1], ps[2]);
    }
    if (/^(二等分線|角の二等分線|bisector)$/.test(種)) return 二等分線(ns[0]);
    if (/^(領域|不等式|region)$/.test(種)) return 領域(引);
    if (/^(複素数|複素数平面|complex)$/.test(種)) return 複素数(引);
    if (/^(極座標|polar)$/.test(種)) return 極座標(引);
    if (/^(空間|空間座標|3d|xyz)$/i.test(種)) return 空間(引);
    if (/^(正十二面体|正二十面体|dodecahedron|icosahedron)$/.test(種)) return 正多面体2(種, ns[0]);
    if (/^(構造式|structure)$/.test(種)) return 構造式(引);
    if (/^(ベンゼン|benzene)$/.test(種)) return ベンゼン();
    if (/^(回路|circuit)$/.test(種) && /[|｜]/.test(引)) return 回路2(引);
    if (/^(斜面|slope|incline)$/.test(種)) {
      var 角 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[0]);
      var 質 = 数((/(?:質量|m|kg)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      return 斜面(角, 質 || 1);
    }
    if (/^(ばね|バネ|spring)$/.test(種)) {
      var k2 = 数((/k\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[0]);
      var x2 = 数((/x\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return ばね(k2, x2);
    }
    if (/^(年表|timeline)$/.test(種)) return 年表(引);
    /* 見出し無しの 書き方（r = … は 極座標） */
    if (/^r\s*=/i.test(文(l).trim())) return 極座標(文(l));
    /* 「y > …」だけで 領域と 分かる */
    if (/^y\s*(>=|≧|>|<=|≦|<)/.test(文(l).trim())) return 領域(文(l));
    return null;
  }

  VQG.sci = { 一行: 一行, なぜだめ: function () { return なぜ; },
              相似: 相似, 垂線: 垂線, 二等分線: 二等分線, 領域: 領域, 複素数: 複素数,
              極座標: 極座標, 空間: 空間, 正多面体2: 正多面体2, 構造式: 構造式,
              回路2: 回路2, 斜面: 斜面, ばね: ばね, 年表: 年表 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/store/idb.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/store/idb.js — 大きいものの 置き場（IndexedDB）

   ★ 訴え（2026-08-19）「ストレージ問題を どうにかしないと。
     何か 外部でないのかな。。。」

   ★ 実測して 分かったこと（2026-08-19・この端末で 測った）
       localStorage の 上限 …    4,587,520 バイト（約 4.4MB）
       IndexedDB の 空き   … 7,991,325,342 バイト（約 7.4GB）
     利用者の 端末は すでに 4.61MB 使っていた。**もう 壁**で、
     次に プリセットを 保存した瞬間に 落ちる状態だった。
     つまり 足りないのは 置き場ではなく、**置き場所の 選び方**。

   ★ 外の預け先は 要らない（要るとしても 今は 使えない）
     ・R2 は この Cloudflare の 口座で **有効化されていない**
       （バケットを 作ろうとすると 10042 が返る）
     ・D1 は 1 行 2048 字までで、写真や コードは 入らない
     ・同じ端末の IndexedDB が **1,700 倍**。ここへ 逃がすのが 正しい

   ★ 決めごと
     ・**localStorage は 捨てない。** 小さくて すぐ読むもの（旗・設定・
       いまの状態）は そのまま。同期で 読める速さが 要るため。
     ・**大きくて たまにしか 読まないもの**（AR Board の写真とコード・
       会話の記録・控え）だけ こちらへ 移す。
     ・移したものは localStorage から 消す。二重に 持たない。
     ・IndexedDB が 使えない端末では、**これまでどおり localStorage**
       （動かなくなるより、狭くても 動くほうがよい）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var 名 = "vq2", 版 = 1, 棚 = "kv";
  var 開いたもの = null;

  function 使える() {
    try { return !!root.indexedDB; } catch (e) { return false; }
  }

  function 開く() {
    if (開いたもの) return 開いたもの;
    開いたもの = new Promise(function (done, ng) {
      if (!使える()) { ng(new Error("IndexedDB を 使えません")); return; }
      var r;
      try { r = root.indexedDB.open(名, 版); } catch (e) { ng(e); return; }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(棚)) db.createObjectStore(棚);
      };
      r.onsuccess = function () { done(r.result); };
      r.onerror = function () { ng(r.error || new Error("開けません")); };
      /* ★ 別のタブが 古い版を 開いていると ここで 止まる。
         永久に 待たせない（呼び側は 失敗として 受け取り、
         これまでどおり localStorage を 使う）。 */
      r.onblocked = function () { ng(new Error("別のタブが 開いています")); };
    });
    /* 一度 失敗したら 次は 作り直せるように 忘れる。 */
    開いたもの.catch(function () { 開いたもの = null; });
    return 開いたもの;
  }

  function 仕事(モード, fn) {
    return 開く().then(function (db) {
      return new Promise(function (done, ng) {
        var tx = db.transaction(棚, モード);
        var st = tx.objectStore(棚);
        var 値;
        try { 値 = fn(st); } catch (e) { ng(e); return; }
        /* ★ 箱かどうかは **印で 見分ける**（2026-08-19・実測の不具合）。
           もとは 中身が undefined かどうかで 見ていたので、
           「無い鍵を 読む」と **箱そのもの**が 返り、
           消したのに 消えていないように 見えた。 */
        tx.oncomplete = function () { done(値 && 値.__箱 === true ? 値.__r : 値); };
        tx.onerror = function () { ng(tx.error || new Error("書けません")); };
        tx.onabort = function () { ng(tx.error || new Error("やめました")); };
      });
    });
  }
  function 一つ(req) {
    var 箱 = { __箱: true, __r: undefined };
    req.onsuccess = function () { 箱.__r = req.result; };
    return 箱;
  }

  /* ── 読む・書く・消す。すべて 待つ形（同期では 読めない）── */
  function 読む(鍵) {
    return 仕事("readonly", function (st) { return 一つ(st.get(String(鍵))); })
      .then(function (v) { return v === undefined ? null : v; })
      .catch(function () { return null; });
  }
  function 書く(鍵, 値) {
    return 仕事("readwrite", function (st) { st.put(値, String(鍵)); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function 消す(鍵) {
    return 仕事("readwrite", function (st) { st.delete(String(鍵)); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function 鍵一覧() {
    return 仕事("readonly", function (st) { return 一つ(st.getAllKeys()); })
      .then(function (v) { return Array.isArray(v) ? v : []; })
      .catch(function () { return []; });
  }

  /* いま どれくらい 使っていて、どれくらい 空いているか。
     **推し量らない。** 端末が 答えてくれる値を そのまま 返す。 */
  function 容量() {
    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.estimate) {
        return root.navigator.storage.estimate().then(function (e) {
          return { 使用: Number(e.usage) || 0, 上限: Number(e.quota) || 0, 分かる: true };
        }).catch(function () { return { 使用: 0, 上限: 0, 分かる: false }; });
      }
    } catch (e) {}
    return Promise.resolve({ 使用: 0, 上限: 0, 分かる: false });
  }

  /* localStorage が いま どれだけ 使っているか（文字数 × 2 バイト）。
     **概算だと はっきり 書く**（UTF-16 の 見積り）。 */
  function 手元の量() {
    var 合計 = 0, 明細 = [];
    try {
      for (var i = 0; i < root.localStorage.length; i++) {
        var k = root.localStorage.key(i);
        var v = root.localStorage.getItem(k) || "";
        var n = (String(k).length + v.length) * 2;
        合計 += n;
        明細.push({ 鍵: k, バイト: n });
      }
    } catch (e) {}
    明細.sort(function (a, b) { return b.バイト - a.バイト; });
    return { 合計: 合計, 明細: 明細, 上限のめやす: 4.4 * 1024 * 1024 };
  }

  /* ══ 大きいものを こちらへ 移す ══════════════════════════════════
     ★ 移すのは **決めた鍵だけ**。知らないものを 勝手に 動かさない。
     ★ 移したら localStorage から 消す（二重に 持たない）。
     ★ 1 つでも 失敗したら、そのものは 消さない（消えるより 狭いほうがよい）。 */
  var 移してよい鍵 = [
    "vq2.arboards.v1",             /* AR Board（写真・動く中身） */
    "app.chat.history.v1",         /* 会話の記録 */
    "app.backup.latest.v1",        /* 控え */
    /* ── プリセット一式（2026-08-28 に 足した）──────────────────
       ここが localStorage を 食い尽くしていた。**同期で 読める形**を
       保ったまま こちらへ 移す（下の 鏡）。 */
    "wordPractice400.presets.v1",  /* 旧 V1 の プリセット（実測 2.01MB） */
    "vq2.presets.v1",              /* いまの プリセット */
    "vq2.presetAttachments.v1",    /* プリセットごとの 添付 */
    "vq2.presetChats.v1",          /* プリセットごとの 会話 */
    "vq2.mocks.v1",                /* 試験（Quick Mock） */
    "vq2.results.v1",              /* 解いた 結果 */
    "vq2.learn.sessions.v1",
    "vq2.learn.answers.v1",
    "vq2.learn.events.v1",
    "wordPractice.analytics.sessions.v1"
  ];

  /* ══ 鏡（同期で 読めるようにする）══════════════════════════════
     ★ 画面の readAll / writeAll は **同期**で 書かれている。
       IndexedDB は 非同期なので、そのままでは 差し替えられない。
       そこで **中身を 覚えておく**（鏡）。読むのは 鏡から、
       書くのは 鏡へ 入れてから IndexedDB へ 流す。
     ★ 用意が 済むまでは **localStorage が 正**。
       済んでいない 鍵を 鏡から 読ませない（空だと 勘違いさせない）。 */
  var 鏡 = Object.create(null);       /* 鍵 → 文字列 */
  var 用意済 = Object.create(null);   /* 鍵 → true */
  var 書き待ち = Object.create(null); /* 鍵 → タイマー */

  function 鏡にある(k) { return !!用意済[k] && typeof 鏡[k] === "string"; }
  function 鏡から(k) { return 鏡にある(k) ? 鏡[k] : null; }
  function 用意できた(k) { return !!用意済[k]; }

  /* 鏡へ 入れて、少し まとめてから IndexedDB へ 流す。
     ★ **返り値は 同期**（画面を 待たせない）。流すのは あと。 */
  function 鏡へ(k, 文) {
    鏡[k] = String(文);
    用意済[k] = true;
    if (書き待ち[k]) clearTimeout(書き待ち[k]);
    書き待ち[k] = setTimeout(function () {
      書き待ち[k] = 0;
      書く("ls:" + k, 鏡[k]).then(function (ok) {
        /* 入ったら localStorage の ぶんは 捨てる（二重に 持たない）。 */
        if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
      });
    }, 250);
    return true;
  }

  /* 起動のとき 1 回、決めた鍵を 鏡へ 読み込む。
     localStorage に まだ 在るなら それを 正とし、IndexedDB へ 移す。 */
  function 鏡を用意() {
    if (!使える()) return Promise.resolve({ 用意: 0, 理由: "IndexedDB を 使えません" });
    /* ★ **空で 潰さない。**
       手元に「[]」や「{}」だけが 残っている ことが ある（用意が 済む前に
       画面が 空を 書いた ときなど）。それを そのまま 正に すると、
       IndexedDB に 入っている 本物を 空で 上書きして **全部 消える**。
       中身が 入っている ほうを 残す。 */
    var 空っぽ = function (v) {
      var t = String(v == null ? "" : v).trim();
      return t === "" || t === "[]" || t === "{}" || t === "null";
    };
    return 移してよい鍵.reduce(function (p, k) {
      return p.then(function () {
        var 手 = null;
        try { 手 = root.localStorage.getItem(k); } catch (e) { 手 = null; }
        if (手 !== null && 空っぽ(手)) {
          /* 手元が 空。IndexedDB に 中身が あれば そちらを 正に する。 */
          return 読む("ls:" + k).then(function (v) {
            if (typeof v === "string" && !空っぽ(v)) {
              鏡[k] = v; 用意済[k] = true;
              try { root.localStorage.removeItem(k); } catch (e) {}
              return;
            }
            鏡[k] = 手; 用意済[k] = true;
            return 書く("ls:" + k, 手).then(function (ok) {
              if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
            });
          });
        }
        if (手 !== null) {
          鏡[k] = 手; 用意済[k] = true;
          return 書く("ls:" + k, 手).then(function (ok) {
            if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
          });
        }
        return 読む("ls:" + k).then(function (v) {
          if (typeof v === "string") 鏡[k] = v;
          用意済[k] = true;
        });
      });
    }, Promise.resolve()).then(function () {
      return { 用意: Object.keys(用意済).length };
    });
  }
  var 用意の約束 = null;
  function 用意を待つ() {
    if (!用意の約束) 用意の約束 = 鏡を用意().catch(function () { return { 用意: 0 }; });
    return 用意の約束;
  }
  /* **すぐ 始める。**画面（vq2-app）は あとから 読み込まれるので、
     その頃には たいてい 済んでいる。 */
  try { 用意を待つ(); } catch (e) {}
  function 移す(鍵たち) {
    var 並 = (鍵たち && 鍵たち.length ? 鍵たち : 移してよい鍵).slice();
    var 結果 = { 移した: [], だめ: [], 減ったバイト: 0 };
    if (!使える()) { 結果.だめ = 並; return Promise.resolve(結果); }
    return 並.reduce(function (p, k) {
      return p.then(function () {
        var v = null;
        try { v = root.localStorage.getItem(k); } catch (e) { v = null; }
        if (v === null) return null;
        return 書く("ls:" + k, v).then(function (ok) {
          if (!ok) { 結果.だめ.push(k); return null; }
          try { root.localStorage.removeItem(k); } catch (e) {}
          結果.移した.push(k);
          結果.減ったバイト += (k.length + v.length) * 2;
          return null;
        });
      });
    }, Promise.resolve()).then(function () { return 結果; });
  }

  /* 移したものを 読む。まず localStorage（まだ 移していない端末）、
     無ければ IndexedDB。**どちらでも 同じように 読める**ようにする。 */
  function 大きいものを読む(鍵) {
    var v = null;
    try { v = root.localStorage.getItem(鍵); } catch (e) {}
    if (v !== null) return Promise.resolve(v);
    return 読む("ls:" + 鍵);
  }
  function 大きいものを書く(鍵, 文字) {
    if (使える()) {
      return 書く("ls:" + 鍵, String(文字)).then(function (ok) {
        if (ok) { try { root.localStorage.removeItem(鍵); } catch (e) {} return true; }
        return 手元へ(鍵, 文字);
      });
    }
    return Promise.resolve(手元へ(鍵, 文字));
  }
  function 手元へ(鍵, 文字) {
    try { root.localStorage.setItem(鍵, String(文字)); return true; }
    catch (e) { return false; }
  }

  /* ══ 壁に 当たる前に 逃がす（2026-08-19）══════════════════════════
     ★ localStorage は 4.4MB で 落ちる。落ちてから 直すのでは 遅い
       （**保存できなかったことに 気づけない**のが いちばん怖い）。
     ★ そこで 8 割（3.5MB）を 超えたら、決めた鍵を 静かに 移す。
     ★ 起動のとき 1 回 見る。重いことは しない（数えるだけ）。 */
  var 危ない線 = Math.round(4.4 * 1024 * 1024 * 0.8);
  function 見張る() {
    if (!使える()) return Promise.resolve({ した: false, 理由: "IndexedDB を 使えません" });
    var 量 = 手元の量();
    if (量.合計 < 危ない線) return Promise.resolve({ した: false, いま: 量.合計 });
    return 移す().then(function (r) {
      var 後 = 手元の量();
      try {
        console.warn("[VQIDB] 手元が 一杯に 近いので 移しました: "
          + Math.round(量.合計 / 1024) + "KB → " + Math.round(後.合計 / 1024) + "KB"
          + "（" + r.移した.join(", ") + "）");
      } catch (e) {}
      return { した: true, 前: 量.合計, 後: 後.合計, 移した: r.移した, だめ: r.だめ };
    });
  }
  /* 起動のとき 1 回。**待たない**（画面を 遅らせない）。 */
  try {
    if (root.requestIdleCallback) root.requestIdleCallback(function () { 見張る(); }, { timeout: 4000 });
    else setTimeout(function () { 見張る(); }, 2500);
  } catch (e) {}

  root.VQIDB = {
    /* 同期で 読み書きする 口（画面の readAll / writeAll が 使う） */
    鏡にある: 鏡にある, 鏡から: 鏡から, 鏡へ: 鏡へ,
    用意できた: 用意できた, 用意を待つ: 用意を待つ, 移してよい鍵か: function (k) {
      return 移してよい鍵.indexOf(String(k)) >= 0;
    },
    見張る: 見張る, 危ない線: 危ない線,
    使える: 使える, 読む: 読む, 書く: 書く, 消す: 消す, 鍵一覧: 鍵一覧,
    容量: 容量, 手元の量: 手元の量, 移す: 移す, 移してよい鍵: 移してよい鍵,
    大きいものを読む: 大きいものを読む, 大きいものを書く: 大きいものを書く
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/store/cloud.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   VQCLOUD — 会話を **端末の外**にも 持つ（2026-08-19）

   何が起きていたか（実測）:
     会話の一覧（app.chat.sessions.v2）と 各会話の本文（app.chat.ses.<id>.v2）は
     localStorage の中にしか 無かった。
       ・localStorage の上限 …… 4,587,520 バイト（実測）
       ・すでに 使っていた量 …… 約 4.6MB
     つまり **上限を すでに 越えていた**。setItem は例外を投げるが、
     呼んでいる側は try/catch で 黙って捨てていたので、
     「保存した つもりで 消えている」状態だった。
     さらに 端末を 変えれば 何も 残らなかった。

   ここでやること:
     ① 会話の鍵への 読み書きを 横から見る
     ② 書かれたら **手元の写し**（記憶）に 入れ、まとめて サーバへ送る
     ③ ログインしたら サーバから 引いて 写しに入れる
     ④ 読むときは 写し → localStorage の順で 返す

   なぜ「写し」を 持つのか:
     呼んでいる側は localStorage.getItem を **その場で**（同期で）読む。
     IndexedDB もサーバも 同期では 読めない。
     だから 記憶の中に 同じものを 置いておき、そこから 即座に 返す。
     localStorage が 一杯でも これは 動く。

   触らないもの:
     会話以外の鍵は **一切 触らない**。素の localStorage へ そのまま通す。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (!root || root.VQCLOUD) return;

  /* ── 見る鍵。これ以外は 何もしない ────────────────────────── */
  var 一覧の鍵 = "app.chat.sessions.v2";
  var 本文の形 = /^app\.chat\.ses\.(.+)\.v2$/;
  function 見る鍵か(k) { return k === 一覧の鍵 || 本文の形.test(k); }
  /* プリセット等は 会話とは 別の口（/api/account/store）で 揃える。 */
  function 揃える鍵か(k) { return 揃える鍵.indexOf(k) >= 0; }
  function 会話のIDに(k) { var m = 本文の形.exec(k); return m ? m[1] : ""; }

  var 記憶 = Object.create(null);      /* 鍵 → 文字列（同期で読める写し） */
  var 送る待ち = Object.create(null);  /* 会話 ID → true */
  var 一覧も送る = false;
  var タイマ = null;
  var 引いた誰 = "";                   /* すでに引いたユーザー */
  var 送信中 = false;
  var 最後の結果 = { 送った: 0, 断られた: [], とき: 0 };

  /* ── 素の localStorage（包む前のもの）────────────────────── */
  var LS = null;
  try { LS = root.localStorage; } catch (e) { LS = null; }
  var 素の読み = null, 素の書き = null, 素の消し = null;
  if (LS) {
    try {
      素の読み = LS.getItem.bind(LS);
      素の書き = LS.setItem.bind(LS);
      素の消し = LS.removeItem.bind(LS);
    } catch (e) { LS = null; }
  }

  function 読む(k) {
    if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
    if (!素の読み) return null;
    try { return 素の読み(k); } catch (e) { return null; }
  }
  function 手元へ書く(k, v) {
    記憶[k] = String(v);
    if (!素の書き) return false;
    try { 素の書き(k, String(v)); return true; }
    catch (e) {
      /* localStorage が 一杯。**それでも 失わない** — 写しとサーバが 持つ。
         古い会話を localStorage から どかして 場所を空ける。 */
      場所を空ける();
      try { 素の書き(k, String(v)); return true; } catch (e2) { return false; }
    }
  }

  /* 一杯になったら、**古い会話から** localStorage の外へ出す。
     出しても 写し（記憶）と サーバに 在るので 消えない。 */
  function 場所を空ける() {
    if (!LS || !素の消し) return;
    var 並 = 一覧を読む();
    if (!並.length) return;
    /* 古い順（updatedAt の小さい順） */
    並.sort(function (a, b) { return (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0); });
    var 出した = 0;
    for (var i = 0; i < 並.length && 出した < 20; i++) {
      var k = "app.chat.ses." + 並[i].id + ".v2";
      var v = null;
      try { v = 素の読み(k); } catch (e) { v = null; }
      if (v === null) continue;
      記憶[k] = v;                      /* 写しへ 移してから 消す */
      try { 素の消し(k); 出した++; } catch (e) {}
    }
    if (出した) {
      try { console.warn("[VQCLOUD] 手元が一杯なので 古い会話 " + 出した + " 本を 写しへ移しました（消えていません）"); } catch (e) {}
    }
  }

  function 一覧を読む() {
    try { var v = JSON.parse(読む(一覧の鍵) || "null"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }

  /* ── ログインの札 ─────────────────────────────────────────
     置き場所は 本体と 同じものを 見る。無ければ 何もしない（送らない）。 */
  function 札() {
    /* ★ 本物の名前は **app.auth.token.v1**（2026-08-19・実測で気づいた）。
       ここに 無い名前ばかり 並べていたので、_authGetToken が
       window に 出るより 前に 呼ばれた ぶんは **札なし** と 見なされ、
       送るはずのものが 黙って 見送られていた。先頭に 本物を 置く。 */
    var 候補 = ["app.auth.token.v1", "vq.auth.token", "app.auth.token", "auth.token", "vq_token"];
    for (var i = 0; i < 候補.length; i++) {
      var v = null;
      try { v = 素の読み ? 素の読み(候補[i]) : null; } catch (e) {}
      if (v && v.length > 20) return v.replace(/^"|"$/g, "");
    }
    try {
      if (typeof root._authGetToken === "function") {
        var t = root._authGetToken();
        if (t && String(t).length > 20) return String(t);
      }
    } catch (e) {}
    return "";
  }
  function 誰() {
    try {
      if (typeof root._chatRemoteUserKey === "function") return String(root._chatRemoteUserKey() || "");
    } catch (e) {}
    var t = 札();
    return t ? t.slice(-24) : "";
  }

  function 頼む(道, 中身) {
    var t = 札();
    if (!t) return Promise.reject(new Error("ログインしていません"));
    var o = { method: 中身 ? "POST" : "GET", headers: { Authorization: "Bearer " + t } };
    if (中身) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(中身); }
    return root.fetch(道, o).then(function (r) {
      if (!r.ok) return r.text().then(function (t2) { throw new Error(r.status + " " + t2.slice(0, 200)); });
      return r.json();
    });
  }

  /* ══ サーバへ 送る ═══════════════════════════════════════════════
     まとめて 送る（1 文字ごとに 送らない）。
     送るのは **変わった会話だけ**。 */
  function あとで送る(会話ID) {
    if (会話ID) 送る待ち[会話ID] = true; else 一覧も送る = true;
    if (タイマ) return;
    タイマ = root.setTimeout(function () { タイマ = null; いま送る(); }, 1500);
  }

  function いま送る() {
    if (送信中) { あとで送る(""); return Promise.resolve(最後の結果); }
    if (!札()) return Promise.resolve({ 送った: 0, 理由: "ログインしていません" });
    var 並 = 一覧を読む();
    var 索引 = Object.create(null);
    for (var i = 0; i < 並.length; i++) if (並[i] && 並[i].id) 索引[並[i].id] = 並[i];

    var 荷 = [];
    var 待ち = Object.keys(送る待ち);
    for (var j = 0; j < 待ち.length; j++) {
      var id = 待ち[j];
      var 見出し = 索引[id];
      var 本文 = 読む("app.chat.ses." + id + ".v2");
      if (!見出し && 本文 == null) {
        /* 一覧にも 本文にも 無い ＝ 消された */
        荷.push({ id: id, deletedAt: Date.now(), updatedAt: Date.now() });
        continue;
      }
      荷.push({
        id: id,
        title: String((見出し && (見出し.title || 見出し.name)) || ""),
        meta: 見出し ? 小さくする(見出し) : {},
        body: 本文 == null ? "[]" : 本文,
        updatedAt: Math.max(0, Number(見出し && (見出し.updatedAt || 見出し.ts)) || 0) || Date.now(),
        deletedAt: 0
      });
    }
    /* 一覧に在るのに 一度も送っていないものも 拾う */
    if (一覧も送る) {
      for (var k = 0; k < 並.length; k++) {
        var s = 並[k];
        if (!s || !s.id || 送る待ち[s.id]) continue;
        if (記憶["送った:" + s.id] === String(s.updatedAt || 0)) continue;
        var b = 読む("app.chat.ses." + s.id + ".v2");
        if (b == null) continue;
        荷.push({
          id: s.id, title: String(s.title || s.name || ""), meta: 小さくする(s),
          body: b, updatedAt: Math.max(0, Number(s.updatedAt || s.ts) || 0) || Date.now(), deletedAt: 0
        });
      }
    }
    送る待ち = Object.create(null);
    一覧も送る = false;
    if (!荷.length) return Promise.resolve({ 送った: 0 });
    if (荷.length > 400) 荷 = 荷.slice(0, 400);

    送信中 = true;
    return 頼む("/api/chat/sessions", { sessions: 荷 }).then(function (r) {
      送信中 = false;
      for (var i2 = 0; i2 < 荷.length; i2++) 記憶["送った:" + 荷[i2].id] = String(荷[i2].updatedAt);
      最後の結果 = { 送った: (r && r.savedIds || []).length, 断られた: (r && r.rejected) || [], とき: Date.now() };
      if (最後の結果.断られた.length) {
        try { console.warn("[VQCLOUD] 大きすぎて 置けなかった会話:", 最後の結果.断られた); } catch (e) {}
      }
      return 最後の結果;
    }).catch(function (e) {
      送信中 = false;
      /* 送れなかったものは 次の機会に また送る（捨てない）。 */
      for (var i3 = 0; i3 < 荷.length; i3++) 送る待ち[荷[i3].id] = true;
      try { console.warn("[VQCLOUD] 送れませんでした:", String(e && e.message || e)); } catch (e2) {}
      return { 送った: 0, だめ: String(e && e.message || e) };
    });
  }

  /* 見出しは 一覧そのままだと 重い。要るところだけ 残す。 */
  function 小さくする(s) {
    var o = {};
    var 残す = ["projectId", "project", "pinned", "model", "icon", "color", "kind", "ts", "createdAt"];
    for (var i = 0; i < 残す.length; i++) if (s[残す[i]] !== undefined) o[残す[i]] = s[残す[i]];
    return o;
  }

  /* ══ サーバから 引く ═════════════════════════════════════════════
     ログインした直後に 1 回。手元に無いものだけ 入れる。
     手元のほうが 新しければ 手元を 残す（上書きしない）。 */
  function 引く(むりやり) {
    var 私 = 誰();
    if (!札()) return Promise.resolve({ 入れた: 0, 理由: "ログインしていません" });
    if (!むりやり && 私 && 引いた誰 === 私) return Promise.resolve({ 入れた: 0, 理由: "もう引いています" });
    引いた誰 = 私;
    return 頼む("/api/chat/sessions?full=1").then(function (r) {
      var 来た = (r && r.sessions) || [];
      var 手元 = 一覧を読む();
      var 索引 = Object.create(null);
      for (var i = 0; i < 手元.length; i++) if (手元[i] && 手元[i].id) 索引[手元[i].id] = 手元[i];

      var 入れた = 0, 消した = 0, 本文なし = [];
      for (var j = 0; j < 来た.length; j++) {
        var s = 来た[j];
        if (!s || !s.id) continue;
        var 手 = 索引[s.id];
        if (s.deletedAt) {
          if (手) { delete 索引[s.id]; try { 素の消し && 素の消し("app.chat.ses." + s.id + ".v2"); } catch (e) {} delete 記憶["app.chat.ses." + s.id + ".v2"]; 消した++; }
          continue;
        }
        var 手の時 = Math.max(0, Number(手 && (手.updatedAt || 手.ts)) || 0);
        if (手 && 手の時 >= Number(s.updatedAt || 0)) continue;   /* 手元のほうが 新しい */
        索引[s.id] = Object.assign({}, s.meta || {}, {
          id: s.id, title: s.title || "", updatedAt: Number(s.updatedAt || 0)
        });
        if (typeof s.body === "string") { 手元へ書く("app.chat.ses." + s.id + ".v2", s.body); 入れた++; }
        else 本文なし.push(s.id);
        記憶["送った:" + s.id] = String(s.updatedAt || 0);
      }
      var 新一覧 = Object.keys(索引).map(function (k) { return 索引[k]; })
        .sort(function (a, b) { return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0); });
      手元へ書く(一覧の鍵, JSON.stringify(新一覧));

      /* ★ ここが 要（2026-08-19）。
         この仕掛けは **本体より あとに** 読み込まれる（束の いちばん後ろ）。
         だから 読み込まれる前から 手元に在った会話は、
         もう一度 触られない限り **一度も 送られない**。
         いままでの会話が そのまま 端末に 取り残される、ということ。
         引いたついでに「サーバに 無い／手元のほうが 新しい」ものを 送りに出す。 */
      var 来た印 = Object.create(null);
      for (var j2 = 0; j2 < 来た.length; j2++) if (来た[j2] && 来た[j2].id) 来た印[来た[j2].id] = 来た[j2];
      var 送り出す = 0;
      for (var k2 = 0; k2 < 手元.length; k2++) {
        var h = 手元[k2];
        if (!h || !h.id) continue;
        var 向 = 来た印[h.id];
        var 手時 = Math.max(0, Number(h.updatedAt || h.ts) || 0);
        if (向 && Number(向.updatedAt || 0) >= 手時) continue;   /* サーバのほうが 新しい */
        if (向 && 向.deletedAt) continue;                        /* 消したものは 送り返さない */
        if (読む("app.chat.ses." + h.id + ".v2") == null) continue;
        あとで送る(h.id);
        送り出す++;
      }
      if (送り出す) {
        try { console.info("[VQCLOUD] まだ サーバに 無い会話 " + 送り出す + " 本を 送ります"); } catch (e) {}
      }

      var 結 = { 入れた: 入れた, 消した: 消した, 本文なし: 本文なし, 全部: 来た.length, 送り出す: 送り出す };
      try { root.dispatchEvent(new CustomEvent("vq-chat-restored", { detail: 結 })); } catch (e) {}
      return 結;
    }).catch(function (e) {
      引いた誰 = "";
      try { console.warn("[VQCLOUD] 引けませんでした:", String(e && e.message || e)); } catch (e2) {}
      return { 入れた: 0, だめ: String(e && e.message || e) };
    });
  }

  /* 本文が 手元に無い会話を 1 本だけ 取りに行く。 */
  function 一本引く(id) {
    if (!id) return Promise.resolve(null);
    return 頼む("/api/chat/sessions?id=" + encodeURIComponent(id)).then(function (r) {
      var s = r && r.session;
      if (!s || s.deletedAt || typeof s.body !== "string") return null;
      手元へ書く("app.chat.ses." + id + ".v2", s.body);
      try { root.dispatchEvent(new CustomEvent("vq-chat-restored", { detail: { 入れた: 1, id: id } })); } catch (e) {}
      return s.body;
    }).catch(function () { return null; });
  }

  /* ══════════════════════════════════════════════════════════════════════
     プリセットも アカウントごと（2026-08-19）

     訴え:
       「プリセットも 必ず アカウントごと。端末を 変えても
         ローカルストレージではなく アカウントごとに。
         今の状態だと、端末を 変えると 同じアカウントでも
         全く プリセットが 異なる。」

     なぜ そうなっていたか（実測）:
       いままでの同期が 送っていたのは **旧 V1 の鍵**
       （wordPractice400.presets.v1）だけ。
       いま アプリが 実際に 読み書きしているのは vq2.presets.v1 で、
       こちらは **一度も 送られていなかった**。

     ★ ここで いちばん 大事なこと: **上書きしない。突き合わせる。**
       端末 A に 1,2 / 端末 B に 3 が 在るとき、
       新しいほうで まるごと 上書きすると **もう片方が 消える**。
       「端末を 変えると 全く 違う」と 言われている状態は、
       まさに 両方に 別々の ものが 溜まっている状態なので、
       まるごと 上書きは **いちばん やってはいけない**。
       だから プリセットは **1 件ずつ id で 突き合わせ**、
       新しいほうを 採る。どちらにも 在るものは 更新時刻で 決める。
     ══════════════════════════════════════════════════════════════════════ */
  /* ★ この 並びは **サーバの ACCOUNT_KEYS_OK と そっくり 同じ**に すること。
     片方だけ 足すと、送っても rejected:[{reason:"この鍵は置けません"}] が
     返るだけで、画面には 何も 出ない（console.warn だけ）＝無言の 不具合。
     一致は vqsynckeys.cjs が 実測で 見張る。 */
  var 揃える鍵 = [
  "vq2.presets.v1",
  "vq2.presetChats.v1",
  "vq2.presetAttachments.v1",
  "vq2.mocks.v1",
  "wordPractice400.presets.v1",
  "app.chat.projects.v1",
  /* ── ここから 2026-08-26 に 足した ぶん ────────────────────────
     訴え:「アカウント同士での 同期は 必ず 行うこと。
            例えば、プリセット、設定、インサイト、学習履歴」
     これまで 学習の記録は **どこにも 送っていなかった**。
     端末を 変えると Insight が 空、ログアウトすると 消える。
     どれも {id, ownerId, updatedAt} を 持つ 並びなので、
     件ごとに 突き合わせられる（まるごと 上書きしない）。 */
  "vq2.results.v1",                    /* 解いた 結果 */
  "vq2.learn.sessions.v1",             /* 学習セッション */
  "vq2.learn.answers.v1",              /* 1 問ごとの 記録 */
  "vq2.learn.events.v1",               /* 学習の できごと */
  "wordPractice.analytics.sessions.v1" /* 旧 Insight（古い画面が 読む） */
  ];
  /* 1 件ずつ 突き合わせる鍵（配列で、各要素に id があるもの）。
     ★ ここに 入れ忘れると **まるごと 上書き**になり、
       別の端末の ぶんが 消える（cloud.js の 上の 但し書きの 事故）。 */
  var 件ごと = {
    "vq2.presets.v1": 1, "wordPractice400.presets.v1": 1, "vq2.mocks.v1": 1,
    "vq2.results.v1": 1, "vq2.learn.sessions.v1": 1, "vq2.learn.answers.v1": 1,
    "vq2.learn.events.v1": 1, "wordPractice.analytics.sessions.v1": 1
  };
  var 揃える待ち = Object.create(null);
  var 揃えタイマ = null;
  var 最後の揃え = { 送った: [], 受けた: [], とき: 0 };

  function 時に直す(v) {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    var t = Date.parse(String(v));
    return isFinite(t) ? t : 0;
  }
  function 件の時(x) {
    return Math.max(時に直す(x && x.updatedAt), 時に直す(x && x.deletedAt),
                    時に直す(x && x.createdAt), Number(x && x.revision) || 0);
  }

  /* 2 つの並びを **消さずに** 突き合わせる。 */
  function 突き合わせる(手元, 向こう) {
    var 箱 = Object.create(null), 順 = [];
    function 入れる(x) {
      if (!x || typeof x !== "object") return;
      var id = String(x.id || "");
      if (!id) return;
      if (!Object.prototype.hasOwnProperty.call(箱, id)) { 箱[id] = x; 順.push(id); return; }
      /* 両方に 在る。新しいほうを 採る。 */
      if (件の時(x) > 件の時(箱[id])) 箱[id] = x;
    }
    (Array.isArray(手元) ? 手元 : []).forEach(入れる);
    (Array.isArray(向こう) ? 向こう : []).forEach(入れる);
    return 順.map(function (id) { return 箱[id]; });
  }

  /* 広い置き場（IndexedDB）。無い端末では null。 */
  function 広い置き場() {
    try {
      var I = root.VQIDB;
      if (I && typeof I.鏡へ === "function" && typeof I.鏡から === "function") return I;
    } catch (e) {}
    return null;
  }
  function 鍵を読む(k) {
    /* ★ **写し（記憶）が いちばん 新しい。**素を 先に 見ていたので、
       手元へ 書けなかった ぶんが 古い値に 上書きされて 送られていた。 */
    if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
    var I = 広い置き場();
    if (I && I.鏡にある && I.鏡にある(k)) return I.鏡から(k);
    var v = null;
    try { v = 素の読み ? 素の読み(k) : null; } catch (e) { v = null; }
    return v;
  }
  function 鍵を書く(k, 文) {
    記憶[k] = String(文);
    try { 素の書き(k, String(文)); return true; }
    catch (e) {
      /* 手元が 一杯。写しと サーバが 持っているので 失われはしない。 */
      try { console.warn("[VQCLOUD] 手元へ 書けませんでした（写しとサーバには 在ります）: " + k); } catch (e2) {}
      return false;
    }
  }
  /* ══ 鍵ごとの 「いつ 書いたか」は **必ず 進む**（2026-08-26）═══════════
     訴えの筋:「消したのに 上がらない」

     もとは 件ごとの鍵で 「中の いちばん 新しい 時刻」を 送っていた。
     ところが **いちばん 新しい 件を 消すと この数が 下がる**。
     サーバは「サーバのほうが 新しい」と 断るので（worker.js の 比べ）、
     消した ぶんが 永遠に 上がらない。手元では 消えて、他の端末には 残る。

     → 鍵ごとに **戻らない 印**を 手元に 持つ。書くたびに
       max(いま, 前の印 + 1) にして、必ず 1 ミリ秒でも 進める。
       この印は 端末に 残す（読み込み直しても 戻らないように）。 */
  var 印の鍵 = "vq.cloud.at.v1";
  var 印 = null;
  function 印を読む() {
    if (印) return 印;
    印 = Object.create(null);
    try {
      var 文 = 素の読み ? 素の読み(印の鍵) : null;
      var o = 文 ? JSON.parse(文) : null;
      if (o && typeof o === "object") for (var k in o) if (Number(o[k])) 印[k] = Number(o[k]);
    } catch (e) {}
    return 印;
  }
  function 印を残す() {
    try { 素の書き(印の鍵, JSON.stringify(印を読む())); } catch (e) {}
  }
  function 印を進める(k) {
    var p = 印を読む();
    var 次 = Math.max(Date.now(), (Number(p[k]) || 0) + 1);
    p[k] = 次;
    印を残す();
    return 次;
  }
  /* その鍵の 「いつのものか」。**戻らない 印**を 使う。
     印が まだ 無い（この端末で 一度も 書いていない）ときだけ、
     中身の いちばん 新しい 時刻を 見る（初回の 突き合わせの ため）。 */
  function 鍵の時(k) {
    var 文 = 鍵を読む(k);
    if (文 == null) return 0;
    var p = 印を読む();
    if (Number(p[k])) return Number(p[k]);
    if (件ごと[k]) {
      try {
        var a = JSON.parse(文);
        if (Array.isArray(a)) {
          var m = 0;
          for (var i = 0; i < a.length; i++) { var t = 件の時(a[i]); if (t > m) m = t; }
          if (m) return m;
        }
      } catch (e) {}
    }
    return Date.now();
  }

  function あとで揃える(k) {
    if (揃える鍵.indexOf(k) < 0) return;
    揃える待ち[k] = true;
    印を進める(k);
    if (揃えタイマ) return;
    揃えタイマ = root.setTimeout(function () { 揃えタイマ = null; いま揃える(); }, 2500);
  }

  /* ══ 送る 大きさの 決まり（2026-08-27）════════════════════════════
     サーバは
       ・1 回の 頼みぜんぶで 16MB まで（ACCOUNT_POST_MAX）
       ・鍵 1 つで   12MB まで（ACCOUNT_VALUE_MAX）
     を 見ている。ところが 手元は **溜まっている 鍵を まとめて 1 回で**
     送っていた。プリセットと 添付が どちらも 育つと 合わせて 16MB を
     越え、**頼み そのものが 400 で 落ちる**。落ちると 全部を 待ちへ
     戻すので、次も 同じ 大きさで 送って また 落ちる。
     ＝ **いつまでも 1 件も 保存されない**（しかも 画面には 何も 出ない）。
     → 大きさを 見て 小分けにする。1 つで 越えるものは 単独で 送り、
       それでも 断られたら **待ちへ 戻さず 覚えておいて 画面で 伝える**。 */
  /* UTF-8 の バイト数。**文字数では 数えない**（日本語で 3 倍 ずれる）。 */
  function バイト数(文) {
    var s2 = String(文 == null ? "" : 文);
    try { if (root.TextEncoder) return new root.TextEncoder().encode(s2).length; } catch (e) {}
    /* TextEncoder が 無い端末の 見積り（多めに 見る＝安全側） */
    var n = 0;
    for (var i = 0; i < s2.length; i++) {
      var c = s2.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }
  var 一度に送る上限 = 7 * 1024 * 1024;   /* **バイト**。16MB の 半分より 下 */
  /* 鍵 1 つの 上限は サーバが **文字数**で 見ている（worker.js の
     ACCOUNT_VALUE_MAX）。ここも 文字数で そろえる。
     ただし 送れる 束の 大きさは バイトで 見る（上の 一度に送る上限）。 */
  var 鍵の上限 = 12 * 1024 * 1024;
  var 大きすぎる = Object.create(null);   /* 鍵 → { バイト, とき } */

  function 荷を小分け(荷) {
    var 束 = [], いま = [], 量 = 0;
    for (var i = 0; i < 荷.length; i++) {
      /* ★ **バイトで 数える**（サーバの 16MB は UTF-8 バイト）。 */
      var 大 = バイト数(荷[i].value);
      /* 1 つで 超えるものは 単独の 束にする（一緒に すると 道連れになる） */
      if (大 >= 一度に送る上限 || いま.length >= 20 || (量 + 大) > 一度に送る上限) {
        if (いま.length) { 束.push(いま); いま = []; 量 = 0; }
      }
      いま.push(荷[i]); 量 += 大;
    }
    if (いま.length) 束.push(いま);
    return 束;
  }

  function 困りごとを知らせる(理由, 鍵たち) {
    try {
      root.dispatchEvent(new CustomEvent("vq-sync-problem", {
        detail: { 理由: String(理由 || ""), 鍵: (鍵たち || []).slice() }
      }));
    } catch (e) {}
  }

  function いま揃える() {
    if (!札()) return Promise.resolve({ 送った: 0, 理由: "ログインしていません" });
    var 並 = Object.keys(揃える待ち);
    揃える待ち = Object.create(null);
    if (!並.length) return Promise.resolve({ 送った: 0 });
    var 荷 = [];
    for (var i = 0; i < 並.length; i++) {
      var k = 並[i];
      var 文 = 鍵を読む(k);
      if (文 == null) continue;
      /* 鍵 1 つで 上限を 越えるものは **送らずに 覚える**。
         送っても 必ず 断られ、待ちへ 戻すと ほかの鍵まで 巻き添えになる。 */
      if (文.length > 鍵の上限) {
        大きすぎる[k] = { バイト: 文.length, とき: Date.now() };
        continue;
      }
      delete 大きすぎる[k];
      荷.push({ key: k, value: 文, updatedAt: 鍵の時(k) });
    }
    var 大並 = Object.keys(大きすぎる);
    if (大並.length) 困りごとを知らせる("鍵が大きすぎて置けません", 大並);
    if (!荷.length) return Promise.resolve({ 送った: 0, 大きすぎる: 大並 });

    var 束 = 荷を小分け(荷);
    var 送れた = [], 断られた = [], 失敗 = "";
    return 束.reduce(function (p, 塊) {
      return p.then(function () {
        return 頼む("/api/account/store", { items: 塊 }).then(function (r) {
          ((r && r.saved) || []).forEach(function (x) { 送れた.push(x); });
          ((r && r.rejected) || []).forEach(function (x) { 断られた.push(x); });
        }).catch(function (e) {
          /* この 束だけ 待ちへ 戻す（ほかの 束は もう 通っている） */
          塊.forEach(function (x) { 揃える待ち[x.key] = true; });
          失敗 = String((e && e.message) || e);
        });
      });
    }, Promise.resolve()).then(function () {
      最後の揃え = { 送った: 送れた, 受けた: 最後の揃え.受けた, とき: Date.now(),
                     断られた: 断られた, 大きすぎる: 大並, 束: 束.length };
      if (断られた.length) {
        try { console.warn("[VQCLOUD] 置けなかった鍵:", 断られた); } catch (e) {}
        /* 「サーバのほうが 新しい」は 正常な 断り。伝えるのは それ以外だけ。 */
        var 本当にだめ = 断られた.filter(function (x) {
          return String(x && x.reason || "").indexOf("サーバのほうが新しい") < 0;
        });
        if (本当にだめ.length) {
          困りごとを知らせる("保存できなかった鍵があります",
            本当にだめ.map(function (x) { return x.key; }));
        }
      }
      if (失敗) {
        try { console.warn("[VQCLOUD] 揃えられませんでした:", 失敗); } catch (e2) {}
        困りごとを知らせる("サーバへ送れませんでした", []);
      }
      return 最後の揃え;
    });
  }

  /* サーバから 引いて、手元と **突き合わせる**（消さない）。 */
  function 揃えを引く(むりやり) {
    if (!札()) return Promise.resolve({ 受けた: 0, 理由: "ログインしていません" });
    return 頼む("/api/account/store").then(function (r) {
      var 在る = {};
      ((r && r.keys) || []).forEach(function (x) { 在る[x.key] = x; });
      var 仕事 = [];
      揃える鍵.forEach(function (k) {
        var 手元の時 = 鍵の時(k);
        var 向こう = 在る[k];
        /* 向こうに 無いなら こちらを 送る */
        if (!向こう || 向こう.deletedAt) {
          if (鍵を読む(k) != null) 揃える待ち[k] = true;
          return;
        }
        /* 件ごとの鍵は **必ず** 引いて 突き合わせる（時刻だけでは 決められない）。
           そうでない鍵は、向こうが 新しいときだけ 引く。 */
        if (件ごと[k] || 向こう.updatedAt > 手元の時 || むりやり) 仕事.push(k);
      });
      if (!仕事.length) { いま揃える(); return { 受けた: 0 }; }
      return 仕事.reduce(function (p, k) {
        return p.then(function () {
          return 頼む("/api/account/store?key=" + encodeURIComponent(k)).then(function (d) {
            if (!d || d.value == null) return null;
            var 手元文 = 鍵を読む(k);
            if (件ごと[k]) {
              var 手元配 = null, 向こう配 = null;
              try { 手元配 = JSON.parse(手元文 || "null"); } catch (e) {}
              try { 向こう配 = JSON.parse(d.value); } catch (e) {}
              if (Array.isArray(向こう配)) {
                var 合 = 突き合わせる(手元配, 向こう配);
                var 新文 = JSON.stringify(合);
                if (新文 !== 手元文) {
                  鍵を書く(k, 新文);
                  /* 突き合わせた ぶんも **印を 進める**（送り返すので 必ず 勝たせる） */
                  印を進める(k);
                  最後の揃え.受けた.push({ key: k, 件数: 合.length,
                    手元: Array.isArray(手元配) ? 手元配.length : 0,
                    向こう: 向こう配.length });
                  /* 突き合わせた結果を 送り返す（向こうにも 揃える） */
                  揃える待ち[k] = true;
                }
                return null;
              }
            }
            /* 件ごとでない鍵は、向こうが 新しいときだけ 置き換える */
            if ((Number(d.updatedAt) || 0) >= 鍵の時(k) && d.value !== 手元文) {
              鍵を書く(k, d.value);
              /* サーバの ぶんを 採ったので、手元の 印は **サーバの 時刻に そろえる**
                 （進めてしまうと、採ったばかりの ものを 送り返す ことになる）。 */
              (function () { var p = 印を読む(); p[k] = Number(d.updatedAt) || Date.now(); 印を残す(); })();
              最後の揃え.受けた.push({ key: k, バイト: String(d.value).length });
            }
            return null;
          }).catch(function () { return null; });
        });
      }, Promise.resolve()).then(function () {
        try { root.dispatchEvent(new CustomEvent("vq-presets-restored",
          { detail: { 受けた: 最後の揃え.受けた.slice() } })); } catch (e) {}
        return いま揃える().then(function () { return { 受けた: 最後の揃え.受けた.length }; });
      });
    }).catch(function (e) {
      try { console.warn("[VQCLOUD] 揃えを引けません:", String(e && e.message || e)); } catch (e2) {}
      return { 受けた: 0, だめ: String(e && e.message || e) };
    });
  }

  /* ══ localStorage を 横から見る ═══════════════════════════════════
     会話の鍵だけ。それ以外は 素通し。 */
  if (LS && 素の読み) {
    try {
      LS.getItem = function (k) {
        k = String(k);
        /* ★ **揃える鍵は 写しを 先に 返す**（2026-08-28）。
           setItem が 容量あふれを 握りつぶす のに getItem が 素だったので、
           保存したはずの 新しい中身が 読めず、**古いほうが 生き残っていた**。 */
        if (揃える鍵か(k)) {
          if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
          var I0 = 広い置き場();
          if (I0 && I0.鏡にある && I0.鏡にある(k)) {
            var w = I0.鏡から(k);
            if (w != null) { 記憶[k] = w; return w; }
          }
          return 素の読み(k);
        }
        if (!見る鍵か(k)) return 素の読み(k);
        if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
        var v = null;
        try { v = 素の読み(k); } catch (e) { v = null; }
        if (v === null) {
          /* 手元に無い会話。サーバに 在るなら 取りに行く（返事は 次の描き直しで）。 */
          var id = 会話のIDに(k);
          if (id && !記憶["取りに行った:" + id]) { 記憶["取りに行った:" + id] = "1"; 一本引く(id); }
        }
        return v;
      };
      LS.setItem = function (k, v) {
        k = String(k);
        if (揃える鍵か(k)) {
          /* プリセット等。**手元へは そのまま書き**、あとで サーバへ 揃える。
             ここで 書き方を 変えると 既存の画面が 壊れるので、素通しに 近く保つ。
             ★ 手元が 一杯で 書けなくても **投げ返さない**（2026-08-19）。
               投げると 呼んだ側が「容量超過」の道へ 入り、
               並びを 半分に 削って 保存し直す作りだった。
               写しと サーバが 持っているので、ここは 静かに 受け取ってよい。 */
          記憶[k] = String(v);
          try { 素の書き(k, v); }
          catch (e5) {
            /* ★ **手元が 一杯。IndexedDB（実測 7.4GB）へ 逃がす**（2026-08-28）。
               逃がしたら 素の 古い値は 消す。残すと getItem が
               そちらを 拾って「保存したのに 古いまま」に なる。 */
            var I1 = 広い置き場();
            if (I1) {
              try { I1.鏡へ(k, String(v)); } catch (e7) {}
              try { 素の消し(k); } catch (e8) {}
            }
            try { console.warn("[VQCLOUD] 手元へ 書けないので 広い置き場へ 移しました: " + k); } catch (e6) {}
          }
          あとで揃える(k);
          return undefined;
        }
        if (!見る鍵か(k)) return 素の書き(k, v);
        手元へ書く(k, v);
        あとで送る(会話のIDに(k));
        return undefined;
      };
      LS.removeItem = function (k) {
        k = String(k);
        if (!見る鍵か(k)) return 素の消し(k);
        delete 記憶[k];
        try { 素の消し(k); } catch (e) {}
        var id = 会話のIDに(k);
        if (id) {
          /* 消したことを サーバへも 伝える（他の端末で 生き返らせない）。 */
          var t = 札();
          if (t) {
            root.fetch("/api/chat/sessions?id=" + encodeURIComponent(id),
              { method: "DELETE", headers: { Authorization: "Bearer " + t } }).catch(function () {});
          }
        } else あとで送る("");
        return undefined;
      };
    } catch (e) {
      try { console.warn("[VQCLOUD] localStorage を 包めませんでした:", String(e && e.message || e)); } catch (e2) {}
    }
  }

  /* ══ いつ引くか ══════════════════════════════════════════════════
     ・立ち上がって 少ししてから 1 回（札があれば）
     ・ログインの合図が 来たとき
     ・画面へ 戻ってきたとき（別の端末で 増えているかもしれない）
     ・閉じる直前に 溜まっているものを 送り切る */
  function そのうち引く() { if (札()) { 引く(false); 揃えを引く(false); } }
  try {
    if (root.requestIdleCallback) root.requestIdleCallback(function () { そのうち引く(); }, { timeout: 6000 });
    else root.setTimeout(そのうち引く, 3000);
  } catch (e) { root.setTimeout(そのうち引く, 3000); }

  ["vq-auth-changed", "vq-login", "vq-pin-passed"].forEach(function (n) {
    try { root.addEventListener(n, function () { 引いた誰 = ""; root.setTimeout(そのうち引く, 400); }); } catch (e) {}
  });
  try {
    root.addEventListener("visibilitychange", function () {
      if (root.document && root.document.visibilityState === "visible") そのうち引く();
    });
  } catch (e) {}
  try {
    root.addEventListener("pagehide", function () {
      if (タイマ) { root.clearTimeout(タイマ); タイマ = null; いま送る(); }
      if (揃えタイマ) { root.clearTimeout(揃えタイマ); 揃えタイマ = null; いま揃える(); }
    });
  } catch (e) {}

  root.VQCLOUD = {
    引く: 引く, 一本引く: 一本引く, いま送る: いま送る, あとで送る: あとで送る,
    揃えを引く: 揃えを引く, いま揃える: いま揃える, あとで揃える: あとで揃える,
    揃える鍵: 揃える鍵, 突き合わせる: 突き合わせる,
    読む: 読む, 一覧: 一覧を読む, 記憶: 記憶,
    様子: function () {
      var 並 = 一覧を読む();
      var 写し = 0, 手元 = 0, 量 = 0;
      for (var i = 0; i < 並.length; i++) {
        var k = "app.chat.ses." + 並[i].id + ".v2";
        var 在る手元 = false;
        try { 在る手元 = 素の読み(k) !== null; } catch (e) {}
        if (在る手元) 手元++;
        else if (Object.prototype.hasOwnProperty.call(記憶, k)) 写し++;
        量 += (読む(k) || "").length;
      }
      var 揃い = {};
      揃える鍵.forEach(function (k) {
        var v = 鍵を読む(k);
        var n = null;
        try { var a = JSON.parse(v || "null"); if (Array.isArray(a)) n = a.length; } catch (e) {}
        揃い[k] = { バイト: v ? v.length : 0, 件数: n };
      });
      return { 会話の数: 並.length, 手元にある: 手元, 写しだけ: 写し, おおよそのバイト: 量,
               ログイン: !!札(), 最後の送信: 最後の結果,
               揃えるもの: 揃い, 最後の揃え: 最後の揃え,
               /* 大きすぎて 置けなかった 鍵。画面は ここを 見て 伝える。 */
               大きすぎる: (function () {
                 var o = {};
                 for (var k2 in 大きすぎる) o[k2] = 大きすぎる[k2];
                 return o;
               })() };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/scan/mode.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/scan/mode.js — **スキャンモード**（2026-08-20）

   訴え:
     「カメラからスキャンをして、その範囲を問題にしたり、そこをボードに
       まとめたりをできるようにしてほしい。**スキャンしてって言っても
       イマイチスキャンされてない**から、あらかじめ スキャンモードみたいなのを
       作って、そこで 何枚かをスキャンし、何枚も、あるいは PDF、写真なので
       まとめられたりできるといい。スキャンされた内容は、そこから
       ボードにまとめられるように。または ゲームにするとか。
       または 問題プリセットを作成したりも。」

   なぜ「モード」にするか:
     声で「スキャンして」と頼む形だと、**いつ撮れたのかが 誰にも 分からない**。
     撮れていなくても 話は進むので、読めていない資料で 答えてしまう。
     モードにすれば
       ・何枚 撮ったかが 見える
       ・**読み取った中身が 目で 確かめられる**（ここが いちばん 大事）
       ・気に入らなければ 撮り直せる
     つまり「読めたつもり」を なくすための 作り。

   引き受けること:
     ・カメラで **何枚でも** 撮る（1 枚ずつ 溜める）
     ・写真・PDF を **足す**（撮らなくてもよい）
     ・並べ替え・削除
     ・**読み取り**（/api/scan/generate?step=ocr）で 中身を 見せる
     ・そこから 3 つへ 渡す
         ボードにまとめる … /api/ai/chat（資料つき）→ マークダウン → 板
         問題を作る       … /api/aigen/questions（資料つき）
         ゲームにする     … /api/ai/chat（資料つき）→ 1 枚の HTML → 板で動かす

   守ること:
     ・**影の DOM の中**に作る（書体の設定やほかの CSS に 崩されない）
     ・写真は 送る前に 小さくする（長辺 1600px・JPEG）。生のままだと 1 枚 8MB
     ・撮ったものは **勝手に どこへも 送らない**。押されたときだけ 送る
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (!root || root.VQSCAN) return;
  var doc = root.document;
  if (!doc) return;

  var 長辺 = 1600, 画質 = 0.72;

  var CSS = [
    ":host{all:initial;}",
    "*{box-sizing:border-box;font-family:-apple-system,'system-ui','Hiragino Sans',",
    "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;}",
    ".back{position:fixed;inset:0;background:#14121C;color:#F4F3F9;display:flex;",
    "flex-direction:column;z-index:2147483500;}",
    ".head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:",
    "calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;}",
    ".head h1{flex:1 1 auto;margin:0;font-size:16px;font-weight:750;}",
    ".x{width:36px;height:36px;border-radius:999px;border:0;background:rgba(255,255,255,.12);",
    "color:#F4F3F9;font-size:17px;cursor:pointer;flex:0 0 auto;}",
    ".x:hover{background:rgba(255,255,255,.2);}",
    ".view{flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;",
    "justify-content:center;background:#000;overflow:hidden;}",
    ".view video{max-width:100%;max-height:100%;display:block;}",
    ".hint{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:12.5px;",
    "color:rgba(255,255,255,.82);text-shadow:0 1px 3px rgba(0,0,0,.7);padding:0 16px;}",
    ".nocam{color:#BBB7C5;font-size:14px;line-height:1.9;text-align:center;padding:24px;}",
    /* 撮ったもの（横に並ぶ） */
    ".strip{flex:0 0 auto;display:flex;gap:8px;overflow-x:auto;padding:10px 12px;",
    "background:#1C1A26;-webkit-overflow-scrolling:touch;}",
    ".strip:empty{display:none;}",
    ".pg{position:relative;flex:0 0 auto;width:64px;height:84px;border-radius:8px;",
    "overflow:hidden;background:#2B2836;border:1px solid rgba(255,255,255,.14);}",
    ".pg img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".pg .no{position:absolute;left:3px;top:3px;min-width:17px;height:17px;border-radius:999px;",
    "background:rgba(0,0,0,.66);color:#fff;font-size:10.5px;font-weight:700;display:flex;",
    "align-items:center;justify-content:center;padding:0 4px;}",
    ".pg .mk{position:absolute;left:3px;bottom:3px;min-width:17px;height:17px;border-radius:999px;",
    "display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}",
    ".pg .mk .ok{color:#7BD88F;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .mk .ng{color:#FF8A8A;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .mk .run{color:#D7D2E4;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .del{position:absolute;right:2px;top:2px;width:19px;height:19px;border-radius:999px;",
    "border:0;background:rgba(0,0,0,.66);color:#fff;font-size:11px;line-height:1;cursor:pointer;}",
    ".pg .pdf{display:flex;align-items:center;justify-content:center;width:100%;height:100%;",
    "font-size:10.5px;color:#D7D2E4;text-align:center;padding:4px;line-height:1.5;word-break:break-all;}",
    /* 操作 */
    ".bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;justify-content:center;",
    "padding:12px 12px calc(env(safe-area-inset-bottom,0px) + 14px);background:#1C1A26;}",
    ".shot{width:66px;height:66px;border-radius:999px;border:4px solid rgba(255,255,255,.9);",
    "background:#fff;cursor:pointer;flex:0 0 auto;}",
    ".shot:active{transform:scale(.94);}",
    ".shot:disabled{opacity:.35;cursor:default;}",
    ".sub{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.2);",
    "background:rgba(255,255,255,.08);color:#F4F3F9;font-size:13.5px;font-weight:650;",
    "cursor:pointer;flex:0 0 auto;}",
    ".sub:hover{background:rgba(255,255,255,.16);}",
    ".sub:disabled{opacity:.35;cursor:default;}",
    /* 読み取り結果 */
    ".sheet{position:absolute;inset:0;background:#14121C;display:flex;flex-direction:column;}",
    ".sheet .body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 14px 14px;}",
    ".txt{white-space:pre-wrap;word-break:break-word;font-size:13.5px;line-height:1.9;",
    "color:#E6E3F0;background:#211F29;border:1px solid rgba(255,255,255,.1);border-radius:12px;",
    "padding:12px 13px;}",
    ".go{display:grid;grid-template-columns:1fr;gap:9px;padding:12px 14px ",
    "calc(env(safe-area-inset-bottom,0px) + 16px);background:#1C1A26;flex:0 0 auto;}",
    ".go button{height:48px;border-radius:12px;border:0;background:#5F579E;color:#fff;",
    "font-size:15px;font-weight:700;cursor:pointer;}",
    ".go button:hover{background:#544C8E;}",
    ".go button.alt{background:rgba(255,255,255,.1);color:#F4F3F9;}",
    ".go button.alt:hover{background:rgba(255,255,255,.18);}",
    ".go button:disabled{opacity:.4;cursor:default;}",
    ".note{font-size:12.5px;line-height:1.8;color:#BBB7C5;padding:10px 14px 0;}",
    ".err{margin:10px 14px 0;padding:10px 12px;border-radius:10px;background:rgba(229,72,77,.18);",
    "border:1px solid rgba(229,72,77,.4);color:#FFC9CB;font-size:13px;line-height:1.8;}",
    /* 進み具合 */
    ".prog{margin:12px 14px;height:8px;border-radius:999px;background:rgba(255,255,255,.12);",
    "overflow:hidden;}",
    ".prog i{display:block;height:100%;background:#8A81C2;width:0;transition:width .25s ease;}",
    ".pmsg{padding:0 14px;font-size:13px;color:#D7D2E4;line-height:1.9;}"
  ].join("");

  var 状 = null;      /* { host, sr, ページ:[], stream, video, 文, 見出し } */

  function 番号(n) { return String(n); }

  /* ── 写真を 小さくする（送る前に 必ず 通す）───────────────── */
  function 小さくする(src, mime) {
    return new Promise(function (done) {
      try {
        var im = new Image();
        im.onload = function () {
          try {
            var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
            var r = Math.min(1, 長辺 / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * r)), ch = Math.max(1, Math.round(h * r));
            var c = doc.createElement("canvas");
            c.width = cw; c.height = ch;
            c.getContext("2d").drawImage(im, 0, 0, cw, ch);
            done({ dataUrl: c.toDataURL("image/jpeg", 画質), 幅: cw, 高: ch });
          } catch (e) { done({ dataUrl: src, 幅: 0, 高: 0 }); }
        };
        im.onerror = function () { done({ dataUrl: src, 幅: 0, 高: 0 }); };
        im.src = src;
      } catch (e) { done({ dataUrl: src, 幅: 0, 高: 0 }); }
    });
  }

  function 読み込む(file) {
    return new Promise(function (done) {
      var fr = new FileReader();
      fr.onload = function () { done(String(fr.result || "")); };
      fr.onerror = function () { done(""); };
      fr.readAsDataURL(file);
    });
  }

  /* ── カメラ ─────────────────────────────────────────────── */
  function カメラを出す() {
    if (!状) return Promise.resolve(false);
    var v = 状.sr.querySelector("video");
    if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      映せない("この端末では カメラを 使えません。下の「写真・PDF を足す」から 入れてください。");
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false
    }).then(function (s) {
      状.stream = s;
      v.srcObject = s; v.playsInline = true; v.muted = true;
      return v.play().catch(function () {});
    }).then(function () { return true; }, function (e) {
      映せない("カメラを 使えませんでした（" + String((e && e.name) || e) + "）。"
        + "許可を 確かめるか、下の「写真・PDF を足す」から 入れてください。");
      return false;
    });
  }
  function 映せない(文) {
    if (!状) return;
    var vw = 状.sr.querySelector(".view");
    if (vw) vw.innerHTML = '<div class="nocam">' + 逃す(文) + "</div>";
    var b = 状.sr.querySelector(".shot"); if (b) b.disabled = true;
  }
  function カメラを止める() {
    if (!状 || !状.stream) return;
    try { 状.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    状.stream = null;
  }

  function 撮る() {
    if (!状 || !状.stream) return Promise.resolve(false);
    var v = 状.sr.querySelector("video");
    if (!v || !v.videoWidth) return Promise.resolve(false);
    var w = v.videoWidth, h = v.videoHeight;
    var r = Math.min(1, 長辺 / Math.max(w, h));
    var c = doc.createElement("canvas");
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    状.ページ.push({ 種: "写真", 名: "撮ったもの " + (状.ページ.length + 1),
                     dataUrl: c.toDataURL("image/jpeg", 画質), mime: "image/jpeg" });
    並べ直す();
    return Promise.resolve(true);
  }

  function 足す(files) {
    var 並 = Array.prototype.slice.call(files || []).slice(0, 20);
    var 次 = Promise.resolve();
    並.forEach(function (f) {
      次 = 次.then(function () {
        return 読み込む(f).then(function (u) {
          if (!u) return;
          if (/^image\//i.test(f.type)) {
            return 小さくする(u, f.type).then(function (o) {
              状.ページ.push({ 種: "写真", 名: f.name || "写真", dataUrl: o.dataUrl, mime: "image/jpeg" });
            });
          }
          状.ページ.push({ 種: "PDF", 名: f.name || "PDF", dataUrl: u,
                           mime: f.type || "application/pdf", file: f });
        });
      });
    });
    return 次.then(並べ直す);
  }

  function 逃す(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function 印章(p) {
    if (p.種 === "PDF") return "";
    if (p.状態 === "済") return '<span class="ok">✓</span>';
    if (p.状態 === "だめ") return '<span class="ng">!</span>';
    if (p.状態 === "読み中") return '<span class="run">…</span>';
    return "";
  }
  function 札を塗る() {
    if (!状) return;
    var 並 = 状.sr.querySelectorAll(".pg");
    for (var i = 0; i < 並.length && i < 状.ページ.length; i++) {
      var m = 並[i].querySelector(".mk");
      if (m) m.innerHTML = 印章(状.ページ[i]);
    }
  }
  function 並べ直す() {
    if (!状) return;
    var st = 状.sr.querySelector(".strip");
    st.innerHTML = 状.ページ.map(function (p, i) {
      var 中 = p.種 === "写真"
        ? '<img alt="" src="' + p.dataUrl + '">'
        : '<div class="pdf">' + 逃す(String(p.名).slice(0, 22)) + "</div>";
      return '<div class="pg">' + 中 + '<span class="no">' + 番号(i + 1) + "</span>"
        + '<span class="mk">' + 印章(p) + "</span>"
        + '<button class="del" type="button" data-del="' + i + '" aria-label="' + 番号(i + 1) + ' 枚目を 消す">✕</button></div>';
    }).join("");
    /* ★ **撮った そばから 読み始める**（2026-08-20）。
       読み取りは 1 枚 7〜8 秒 かかる。押してから 読み始めると
       5 枚で 40 秒 待たせる。撮っている 間に 走らせておけば、
       押したときには たいてい もう 済んでいる。 */
    setTimeout(読む列を回す, 0);
    var 読 = 状.sr.querySelector("[data-read]");
    if (読) {
      読.disabled = !状.ページ.length;
      読.textContent = 状.ページ.length ? "読み取る（" + 状.ページ.length + " 枚）" : "読み取る";
    }
  }

  /* ── 読み取り（1 枚ずつ）───────────────────────────────── */
  /* ══ 1 枚 読む（2026-08-20）════════════════════════════════════════
     ★ 実測: 読み取りの 時間は **ほぼ 全部 サーバの 画像認識**。
         長辺1600px(50KB) → 7.5〜8.1 秒（通信も 縮小も 0 秒）
         長辺1000px      → 5.9 秒だが **誤読が 増える**（縮めても 損）
       だから 速くする道は「小さくする」ではなく
       **同時に 走らせる**ことと **撮った時点で 先に 読み始める**こと。
     ★ ときどき 24 秒で 詰まる（実測 2/2）。1 回だけ やり直す。 */
  function 読む1枚(p, 回) {
    p.状態 = "読み中"; 札を塗る();
    /* ★ 読み取りの 口を 替えた（2026-08-20・訴え「もう少し 早く できる？」）。
       実測（同じ紙）:
         前 /api/scan/generate?step=ocr … 7,547ms・誤読あり・24 秒で 詰まることも
         今 /api/scan/read（Gemini）    … 1,638ms・誤読なし
       **4.7 倍 速くて、しかも 正しい。** */
    return fetch(api() + "/api/scan/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ task: "ocr", images: [p.dataUrl] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) {
        p.文 = String(j.text || "").trim();
        if (!p.題) { var 頭 = (p.文.split("\n")[0] || "").trim(); if (頭 && 頭.length <= 30) p.題 = 頭; }
        p.状態 = "済"; 札を塗る(); return true;
      }
      throw new Error(String((j && j.message) || "読めません"));
    }).catch(function (e) {
      if ((回 || 0) < 1) return 読む1枚(p, (回 || 0) + 1);   /* 1 回だけ やり直す */
      p.文 = ""; p.訳 = String((e && e.message) || e).slice(0, 60);
      p.状態 = "だめ"; 札を塗る(); return false;
    });
  }

  /* 溜まっている紙を **3 枚ずつ** 読む。撮った そばから 走らせる。 */
  var 同時 = 3;
  function 読む列を回す() {
    if (!状) return;
    var 走 = 状.ページ.filter(function (p) { return p.状態 === "読み中"; }).length;
    var 待 = 状.ページ.filter(function (p) { return p.種 === "写真" && !p.状態; });
    for (var i = 0;走 + i < 同時 && i < 待.length; i++) {
      読む1枚(待[i], 0).then(function () { 読む列を回す(); 読み終わりを見る(); });
    }
  }
  function まだ読んでいる() {
    return !!(状 && 状.ページ.some(function (p) {
      return p.種 === "写真" && (!p.状態 || p.状態 === "読み中"); }));
  }
  var 待ち人 = [];
  function 読み終わりを見る() {
    if (まだ読んでいる()) return;
    var 並 = 待ち人.slice(); 待ち人 = [];
    並.forEach(function (f) { try { f(); } catch (e) {} });
  }

  /* いまの 紙の 顔つき。変わっていなければ 読み直さない。 */
  function 印() {
    return 状.ページ.map(function (p) { return p.種 + ":" + String(p.dataUrl || "").length; }).join("|");
  }

  function まとめる() {
    var 出 = [], 見出し = "";
    状.ページ.forEach(function (p, i) {
      if (p.種 === "PDF") { 出.push("【" + p.名 + "】（PDF は そのまま AI へ 渡します）"); return; }
      if (!見出し && p.題) 見出し = p.題;
      出.push("【" + (i + 1) + " 枚目】\n"
        + (p.状態 === "済" ? (p.文 || "（字が 見つかりませんでした）")
           : "読めませんでした（" + (p.訳 || "訳は 分かりません") + "）"));
    });
    状.文 = 出.join("\n\n");
    状.見出し = 見出し || "スキャンした資料";
    状.読んだ印 = 印();
  }

  function 読み取る() {
    if (!状 || !状.ページ.length) return Promise.resolve(null);
    /* ★ 同じ紙を 二度 読まない。控えてある 中身を そのまま 出す。 */
    if (状.文 && 状.読んだ印 === 印()) { 面を消す(); 板面("読み取った中身"); 結果を出す();
      return Promise.resolve({ 文: 状.文, 見出し: 状.見出し }); }
    読む列を回す();
    if (!まだ読んでいる()) { まとめる(); 面を消す(); 板面("読み取った中身"); 結果を出す();
      return Promise.resolve({ 文: 状.文, 見出し: 状.見出し }); }
    var 面 = 板面("読み取っています…");
    var 帯 = 面.querySelector(".prog i"), 文 = 面.querySelector(".pmsg");
    var 全 = 状.ページ.filter(function (p) { return p.種 === "写真"; }).length;
    var 刻 = setInterval(function () {
      if (!状 || !状.面) { clearInterval(刻); return; }
      var 済 = 状.ページ.filter(function (p) { return p.種 === "写真" && (p.状態 === "済" || p.状態 === "だめ"); }).length;
      try {
        帯.style.width = Math.round(済 / Math.max(1, 全) * 100) + "%";
        文.textContent = 済 + " / " + 全 + " 枚 読めました（" + 同時 + " 枚ずつ 同時に 読んでいます）";
      } catch (e) {}
    }, 200);
    return new Promise(function (done) { 待ち人.push(done); }).then(function () {
      clearInterval(刻);
      まとめる();
      結果を出す();
      return { 文: 状.文, 見出し: 状.見出し };
    });
  }

  /* API の 行き先は 本体と 同じ決めかたに そろえる（別に持つと 食い違う）。 */
  function api() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function token() { try { return String(root.localStorage.getItem("app.auth.token.v1") || ""); } catch (e) { return ""; } }

  function 板面(題) {
    var s = doc.createElement("div");
    s.className = "sheet";
    s.innerHTML = '<div class="head"><h1>' + 逃す(題) + '</h1>'
      + '<button class="x" type="button" data-back aria-label="戻る">‹</button></div>'
      + '<div class="prog"><i></i></div><div class="pmsg"></div>'
      + '<div class="body"></div>';
    状.sr.querySelector(".back").appendChild(s);
    状.面 = s;
    return s;
  }
  function 面を消す() { if (状 && 状.面) { try { 状.面.remove(); } catch (e) {} 状.面 = null; } }

  function 結果を出す() {
    if (!状 || !状.面) return;
    var s = 状.面;
    s.querySelector(".head h1").textContent = "読み取った中身";
    var pr = s.querySelector(".prog"); if (pr) pr.remove();
    var pm = s.querySelector(".pmsg"); if (pm) pm.remove();
    s.querySelector(".body").innerHTML =
      '<p class="note" style="padding-left:0;padding-right:0">'
      + 'ここに 出ているものが、AI に 渡る 中身です。ちがっていたら 戻って 撮り直してください。</p>'
      + '<div class="txt">' + 逃す(状.文 || "（何も 読めませんでした）") + "</div>";
    var go = doc.createElement("div");
    go.className = "go";
    go.innerHTML = '<button type="button" data-go="board">ボードにまとめる</button>'
      + '<button type="button" data-go="quiz" class="alt">問題を作る</button>'
      + '<button type="button" data-go="game" class="alt">ゲームにする</button>';
    s.appendChild(go);
  }

  /* ── 渡す先 ─────────────────────────────────────────────── */
  /* ★★ **sourceType が 無いと 黙って 捨てられる**（2026-08-20・実測）。
     受け側（aiNormalizeChatImageAttachments）は
       sourceType === "image" かつ preview が data:image/ で 始まる
     ものしか 通さない。付け忘れていたので、**画像は 1 枚も 届いていなかった**。
     AI は「画像が 読み込まれていません」と 答え、板も ゲームも 作れなかった。
     ＝ 訴え「OCR が ちゃんと できてない」「ボードも 何も」の 正体。 */
  function 資料() {
    return 状.ページ.map(function (p) {
      return { name: p.名, mimeType: p.mime, preview: p.dataUrl,
               sourceType: p.種 === "PDF" ? "pdf" : "image" };
    });
  }
  function 待たせる(題, 文言) {
    面を消す();
    var s = 板面(題);
    s.querySelector(".pmsg").textContent = 文言;
    s.querySelector(".prog i").style.width = "35%";
    return s;
  }
  function 訳を読む(j) {
    var m = String((j && (j.message || j.code)) || "").trim();
    if (/混|BUSY|UNAVAILABLE/i.test(m)) return "いま AI が 混み合っています。少し おいて もう一度 押してください。";
    return m || "できませんでした。";
  }
  function しくじり(s, 文) {
    var e = doc.createElement("div");
    e.className = "err"; e.textContent = 文;
    s.querySelector(".body").appendChild(e);
    s.querySelector(".prog i").style.width = "100%";
    s.querySelector(".pmsg").textContent = "できませんでした。";
  }

  /* ★ 「混んでいます」は **待てば 戻る**（2026-08-20・訴え
     「混雑してるって言って 作れなかった。ボードも 何も」）。
     1 回で 諦めると、押した人には ただの 失敗に 見える。
     少し 待って もう一度だけ 試す。それでも だめなら 正直に 出す。 */
  function 話しかける(仕事, 追, 回) {
    /* ★ /api/ai/chat では **本番で Gemini に ならない**（CHAT_PROVIDER が
       workers_ai）。読み取りと 同じ口を 使う（提供元を 決め打てる）。 */
    return fetch(api() + "/api/scan/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ task: 仕事, images: 画たち(), prompt: 追 || "" })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var 本文 = String((j && j.text) || "").trim();
      var 混 = !本文 && /混|BUSY|UNAVAILABLE|しばらく|時間をおいて/i.test(
        String((j && (j.message || j.code)) || ""));
      if ((混 || !本文) && (回 || 0) < 1) {
        return new Promise(function (r2) { setTimeout(r2, 2500); })
          .then(function () { return 話しかける(仕事, 追, (回 || 0) + 1); });
      }
      return j;
    }, function (e) {
      if ((回 || 0) < 1) {
        return new Promise(function (r2) { setTimeout(r2, 2500); })
          .then(function () { return 話しかける(仕事, 追, (回 || 0) + 1); });
      }
      throw e;
    });
  }
  /* 送る 画（写真だけ。PDF は この口では 読めない） */
  function 画たち() {
    return 状.ページ.filter(function (p) { return p.種 === "写真"; })
      .map(function (p) { return p.dataUrl; }).slice(0, 8);
  }

  function ボードへ() {
    var s = 待たせる("ボードにまとめています…", "読み取った中身から、板を 組み立てています。");
    return 話しかける("board", "読み取った中身（参考）:\n" + String(状.文 || "").slice(0, 6000))
      .then(function (j) {
      var md = String((j && j.text) || "").trim();
      if (!md) { しくじり(s, 訳を読む(j)); return false; }
      md = md.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "");
      try {
        if (root.__vqLive && root.__vqLive.板) { root.__vqLive.板(状.見出し || "スキャンした資料", md); 閉じる(); return true; }
      } catch (e) {}
      /* 板の 部品が 無ければ、この画面に そのまま 出す（黙って 消さない）。 */
      s.querySelector(".head h1").textContent = "まとめました";
      s.querySelector(".prog").remove(); s.querySelector(".pmsg").remove();
      s.querySelector(".body").innerHTML = '<div class="txt">' + 逃す(md) + "</div>";
      return true;
    }, function () { しくじり(s, "つながりませんでした。"); return false; });
  }

  function 問題へ(件数) {
    var n = Math.max(3, Math.min(30, Number(件数) || 10));
    var s = 待たせる("問題を作っています…", n + " 問 作ります。1 分ほど かかります。");
    var files = 状.ページ.map(function (p) {
      var m = /^data:([^;,]+);base64,(.+)$/i.exec(String(p.dataUrl || ""));
      return m ? { mimeType: m[1], data: m[2] } : null;
    }).filter(Boolean);
    return fetch(api() + "/api/aigen/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({
        prompt: "この資料から " + n + " 問 作ってください。資料に書いてあることだけで作ります。",
        count: n, files: files
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.ok === false) { しくじり(s, 訳を読む(j)); return null; }
      s.querySelector(".head h1").textContent = "問題ができました";
      s.querySelector(".prog i").style.width = "100%";
      s.querySelector(".pmsg").textContent = "";
      var qs = (j.questions || j.items || []);
      s.querySelector(".body").innerHTML = '<p class="note" style="padding-left:0">'
        + qs.length + " 問 できました。下から プリセットとして 残せます。</p>"
        + '<div class="txt">' + 逃す(qs.slice(0, 8).map(function (q, i) {
            return (i + 1) + ". " + String(q.question || q.front || q.q || "").slice(0, 120);
          }).join("\n")) + (qs.length > 8 ? "\n…ほか " + (qs.length - 8) + " 問" : "") + "</div>";
      状.問題 = j;
      var go = doc.createElement("div");
      go.className = "go";
      go.innerHTML = '<button type="button" data-save="preset">プリセットとして残す</button>';
      s.appendChild(go);
      return j;
    }, function () { しくじり(s, "つながりませんでした。"); return null; });
  }

  function ゲームへ() {
    var s = 待たせる("ゲームを作っています…", "読み取った中身から、遊べるものを 組み立てています。");
    return 話しかける("game", "読み取った中身（参考）:\n" + String(状.文 || "").slice(0, 5000))
      .then(function (j) {
      var code = String((j && j.text) || "").trim();
      if (!code) { しくじり(s, 訳を読む(j)); return false; }
      code = code.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
      try {
        if (root.__vqLive && root.__vqLive.アプリ) {
          root.__vqLive.アプリ(状.見出し || "スキャンから作ったもの", code); 閉じる(); return true;
        }
      } catch (e) {}
      しくじり(s, "動かす部品が ありません。ボードにまとめる を 使ってください。");
      return false;
    }, function () { しくじり(s, "つながりませんでした。"); return false; });
  }

  /* ── 開く・閉じる ───────────────────────────────────────── */
  function 開く(o) {
    o = o || {};
    if (状) return 状;
    var host = doc.createElement("div");
    host.setAttribute("data-vqscan", "1");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483500;";
    var sr = host.attachShadow({ mode: "open" });
    var st0 = doc.createElement("style"); st0.textContent = CSS; sr.appendChild(st0);
    var box = doc.createElement("div");
    box.className = "back";
    box.innerHTML = '<div class="head"><h1>スキャン</h1>'
      + '<button class="x" type="button" data-close aria-label="やめる">✕</button></div>'
      + '<div class="view"><video playsinline muted></video>'
      + '<div class="hint">紙が 画面いっぱいに 入るように 構えて、丸いボタンで 撮ります。何枚でも 撮れます。</div></div>'
      + '<div class="strip"></div>'
      + '<div class="bar">'
      + '<button class="sub" type="button" data-add>写真・PDF を足す</button>'
      + '<button class="shot" type="button" aria-label="撮る"></button>'
      + '<button class="sub" type="button" data-read disabled>読み取る</button>'
      + "</div>";
    sr.appendChild(box);
    doc.body.appendChild(host);
    状 = { host: host, sr: sr, ページ: [], stream: null, 文: "", 見出し: "", 面: null };

    sr.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-close]")) { e.preventDefault(); 閉じる(); return; }
      if (t.closest("[data-back]")) { e.preventDefault(); 面を消す(); return; }
      if (t.closest(".shot")) { e.preventDefault(); 撮る(); return; }
      if (t.closest("[data-add]")) { e.preventDefault(); 選ばせる(); return; }
      if (t.closest("[data-read]")) { e.preventDefault(); 読み取る(); return; }
      var d = t.closest("[data-del]");
      if (d) { e.preventDefault(); 状.ページ.splice(Number(d.getAttribute("data-del")), 1); 並べ直す(); return; }
      var g = t.closest("[data-go]");
      if (g) {
        e.preventDefault();
        var k = g.getAttribute("data-go");
        if (k === "board") ボードへ();
        else if (k === "quiz") 問題へ(o.件数);
        else if (k === "game") ゲームへ();
        return;
      }
      if (t.closest("[data-save]")) { e.preventDefault(); 残す(); return; }
    });
    doc.addEventListener("keydown", 鍵, true);
    カメラを出す();
    return 状;
  }
  function 鍵(e) { if (e.key === "Escape" && 状) { e.preventDefault(); if (状.面) 面を消す(); else 閉じる(); } }

  function 選ばせる() {
    var inp = doc.createElement("input");
    inp.type = "file"; inp.multiple = true;
    inp.accept = "image/*,application/pdf";
    inp.style.cssText = "position:fixed;left:-9999px;";
    doc.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var fs = inp.files;
      try { inp.remove(); } catch (e) {}
      if (fs && fs.length) 足す(fs);
    });
    inp.click();
  }

  function 残す() {
    if (!状 || !状.問題) return Promise.resolve(false);
    try {
      if (root.VQ2 && root.VQ2.presets && root.VQ2.presets.取り込む) {
        root.VQ2.presets.取り込む(状.問題);
        閉じる(); return Promise.resolve(true);
      }
    } catch (e) {}
    /* 受け口が 無ければ **黙って 捨てない**。端末に 残して 知らせる。 */
    try {
      root.localStorage.setItem("vq.scan.lastQuestions",
        JSON.stringify(状.問題).slice(0, 2 * 1024 * 1024));
    } catch (e) {}
    var s = 状.面;
    if (s) しくじり(s, "この画面からは まだ 残せません。作ったものは 端末に 控えました（vq.scan.lastQuestions）。");
    return Promise.resolve(false);
  }

  function 閉じる() {
    if (!状) return false;
    カメラを止める();
    try { doc.removeEventListener("keydown", 鍵, true); } catch (e) {}
    try { 状.host.remove(); } catch (e) {}
    状 = null;
    return true;
  }

  root.VQSCAN = {
    開く: 開く, 閉じる: 閉じる,
    開いているか: function () { return !!状; },
    枚数: function () { return 状 ? 状.ページ.length : 0; },
    取り出す: function () { return 状 ? { ページ: 状.ページ.slice(), 文: 状.文, 見出し: 状.見出し } : null; },
    /* 確かめるとき用（カメラの 無い所でも 中身を 入れられる） */
    _足す: function (p) { if (状) { 状.ページ.push(p); 並べ直す(); } },
    読み取る: 読み取る, ボードへ: ボードへ, 問題へ: 問題へ, ゲームへ: ゲームへ,
    CSS: CSS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/kata/base.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/kata/base.js — 型（テンプレート）の 土台

   ★ なぜ 型 なのか（2026-08-20・訴え）
     「ゲームやアプリのボードは UI が 壊れたり、実用に ならないことが 多い。
       致命的な バグも ある。**あらかじめ 型を 決めて、そこへ 入れ込むだけ**に
       すれば エラーも 減るし 実用的に なるのでは」

     そのとおりで、いま Lumi は **毎回 ゼロから コードを 書いて**いる。
     だから 毎回 違う壊れかたを する。直しても 次は 別の所が 壊れる。

   ★ 直しかた
     動く部分（遊びかた・使いかた）は **こちらが 手で 書いて 検証済み**にする。
     Lumi は **文字と 数と 並び だけ**を 入れる。コードは 1 行も 書かない。
     色・大きさ・間・座標も 出させない（デザインエンジンと 同じ考え）。

   ★ 型 ID の 形    芯 / 骨 / 色 / 詰
       芯 … 遊びかた・使いかた（24 種。これだけが 中身の 違い）
       骨 … 画面の 組み立て（6 種）
       色 … 色の 組（12 種）
       詰 … 間の 詰めかた（3 種）
     24 × 6 × 12 × 3 = 5,184 通り。
     **中身の 違いは 24 種**で、あとは 見た目の 違い。そこは 正直に 言う。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});

  /* ══ 色の組 ═══════════════════════════════════════════════════════
     どれも 地 と 文字 の 比が 7 以上、地 と 主色 の 比が 3 以上。
     （検証 vqkata.cjs が 12 組 すべてを 実測して 落とす） */
  var 色たち = {
    dawn:    { 名: "あさやけ", bg: "#FBF7F4", surface: "#FFFFFF", line: "#E9DFD7", text: "#2B2119", sub: "#6E5E52", accent: "#B4551F", ink: "#FFFFFF" },
    mint:    { 名: "みずいろ", bg: "#F3FAF8", surface: "#FFFFFF", line: "#D6EAE4", text: "#12302B", sub: "#41615A", accent: "#0E6E58", ink: "#FFFFFF" },
    lavender:{ 名: "ふじ",     bg: "#F8F7FD", surface: "#FFFFFF", line: "#E4E0F2", text: "#241F38", sub: "#544C6E", accent: "#54479F", ink: "#FFFFFF" },
    slate:   { 名: "はいいろ", bg: "#F6F7F9", surface: "#FFFFFF", line: "#E1E5EB", text: "#1D2430", sub: "#4F5768", accent: "#2A5382", ink: "#FFFFFF" },
    forest:  { 名: "もり",     bg: "#F5F8F3", surface: "#FFFFFF", line: "#DCE7D6", text: "#1B2A18", sub: "#465A41", accent: "#2A6026", ink: "#FFFFFF" },
    berry:   { 名: "いちご",   bg: "#FDF6F8", surface: "#FFFFFF", line: "#F2DEE5", text: "#331A22", sub: "#684853", accent: "#9A2B52", ink: "#FFFFFF" },
    sand:    { 名: "すな",     bg: "#FAF8F1", surface: "#FFFFFF", line: "#E8E2CF", text: "#2A2618", sub: "#615940", accent: "#7C5F12", ink: "#FFFFFF" },
    ocean:   { 名: "うみ",     bg: "#F2F8FC", surface: "#FFFFFF", line: "#D8E7F2", text: "#132433", sub: "#42596C", accent: "#0E4C72", ink: "#FFFFFF" },
    night:   { 名: "よる",     bg: "#14151C", surface: "#1E202B", line: "#2E3140", text: "#F2F3F8", sub: "#AFB4C6", accent: "#8D9BFF", ink: "#10121A" },
    charcoal:{ 名: "すみ",     bg: "#17181A", surface: "#212327", line: "#31343A", text: "#F1F2F4", sub: "#ABAFB7", accent: "#69DCA9", ink: "#10121A" },
    plum:    { 名: "むらさきよる", bg: "#1A1420", surface: "#241C2D", line: "#382C43", text: "#F5F0F8", sub: "#BBAEC5", accent: "#E79AD6", ink: "#1A1420" },
    ember:   { 名: "ひのこ",   bg: "#1B1512", surface: "#26201C", line: "#3A312B", text: "#F7F1EC", sub: "#C3B4A9", accent: "#FFB779", ink: "#1B1512" }
  };
  var 色の名 = Object.keys(色たち);

  /* ══ 間の 詰めかた ═════════════════════════════════════════════ */
  var 詰たち = {
    airy:   { 名: "ゆったり", gap: 16, pad: 22, r: 18, 字: 17, 見出し: 24 },
    normal: { 名: "ふつう",   gap: 12, pad: 16, r: 14, 字: 16, 見出し: 21 },
    tight:  { 名: "つめて",   gap: 8,  pad: 11, r: 10, 字: 15, 見出し: 19 }
  };
  var 詰の名 = Object.keys(詰たち);

  /* ══ 骨（画面の 組み立て）══════════════════════════════════════ */
  var 骨たち = {
    stack:  { 名: "たて積み",     説: "見出し → 中身 → 手もと を 縦に 積む。いちばん 崩れにくい。" },
    hud:    { 名: "帯つき全面",   説: "上に 細い帯（点・のこり）、下は 全部 中身。ゲーム向き。" },
    card:   { 名: "中央カード",   説: "真ん中に 1 枚のカード。1 問ずつ 見せるものに。" },
    split:  { 名: "左右",         説: "左に 中身、右に 手もと。せまい画面では 縦に 折る。" },
    board:  { 名: "盤ちゅうしん", 説: "中身を 目一杯 広げ、手もとは 下に 寄せる。盤ものに。" },
    panel:  { 名: "横に 一覧",    説: "左に 一覧、右に 中身。道具向き。せまい画面では 縦。" }
  };
  var 骨の名 = Object.keys(骨たち);

  /* ══ 土台の CSS ════════════════════════════════════════════════
     ★ ここが 崩れないことが すべて。**すべての 型が これを 使う。**
       骨ごとの 違いは data-k の 一行だけ。 */
  function 土台CSS(色, 詰) {
    var c = 色たち[色] || 色たち.slate;
    var d = 詰たち[詰] || 詰たち.normal;
    return [
      ":root{",
        "--k-bg:" + c.bg + ";--k-surface:" + c.surface + ";--k-line:" + c.line + ";",
        "--k-text:" + c.text + ";--k-sub:" + c.sub + ";--k-accent:" + c.accent + ";--k-ink:" + c.ink + ";",
        "--k-good:#2E9E6B;--k-bad:#D14343;--k-warn:#C98A16;",
        "--k-gap:" + d.gap + "px;--k-pad:" + d.pad + "px;--k-r:" + d.r + "px;",
        "--k-fs:" + d.字 + "px;--k-h:" + d.見出し + "px;",
      "}",
      "*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}",
      "html,body{height:100%}",
      "body{background:var(--k-bg);color:var(--k-text);font-size:var(--k-fs);",
        "font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.6;overflow:hidden}",
      "#vqapp{height:100%}",
      "button,input,select,textarea{font:inherit;color:inherit}",
      "button{cursor:pointer;border:0;background:none}",
      ".k{height:100%;display:flex;flex-direction:column;gap:var(--k-gap);padding:var(--k-pad);overflow:hidden}",
      ".k-head{display:flex;align-items:center;gap:10px;flex:0 0 auto;min-height:0}",
      ".k-title{font-size:var(--k-h);font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".k-sub{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".k-hud{margin-left:auto;display:flex;gap:8px;align-items:center;flex:0 0 auto}",
      ".k-chip{padding:3px 10px;border-radius:99px;background:var(--k-surface);border:1px solid var(--k-line);",
        "font-size:calc(var(--k-fs) - 3px);font-weight:700;white-space:nowrap}",
      ".k-chip.on{background:var(--k-accent);color:var(--k-ink);border-color:transparent}",
      ".k-main{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:var(--k-gap)}",
      ".k-foot{flex:0 0 auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".k-card{background:var(--k-surface);border:1px solid var(--k-line);border-radius:var(--k-r);padding:var(--k-pad)}",
      ".k-btn{min-height:42px;padding:0 16px;border-radius:calc(var(--k-r) - 3px);background:var(--k-surface);",
        "border:1px solid var(--k-line);font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:7px}",
      ".k-btn:active{transform:translateY(1px)}",
      ".k-btn.pri{background:var(--k-accent);color:var(--k-ink);border-color:transparent}",
      ".k-btn.ghost{background:transparent}",
      ".k-btn[disabled]{opacity:.45;cursor:default}",
      ".k-in{width:100%;min-height:42px;padding:8px 12px;border-radius:calc(var(--k-r) - 3px);",
        "background:var(--k-surface);border:1px solid var(--k-line);outline:none}",
      ".k-in:focus{border-color:var(--k-accent)}",
      /* ★ 名前を k-grid から k-gr へ 変えた（2026-08-20）。
         AR App の 枠は 中身を 見て 道具を 貸すが、その 手がかりの 1 つが
         class の中の 「grid」。k-grid だと **Tailwind を 勝手に 借りてしまい**、
         向こうの 打ち消し（preflight）で この 土台の 見た目が 崩れる。 */
      ".k-gr{display:grid;gap:var(--k-gap)}",
      ".k-note{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub)}",
      ".k-big{font-size:clamp(30px,7vw,52px);font-weight:800;line-height:1.1}",
      ".k-bar{height:8px;border-radius:99px;background:var(--k-line);overflow:hidden}",
      ".k-bar>i{display:block;height:100%;background:var(--k-accent);transition:width .25s}",
      ".k-good{color:var(--k-good)}.k-bad{color:var(--k-bad)}",
      ".k-center{margin:auto;text-align:center;display:flex;flex-direction:column;gap:var(--k-gap);align-items:center}",
      ".k-hide{display:none !important}",
      "[data-k='hud'] .k-head{padding-bottom:2px;border-bottom:1px solid var(--k-line)}",
      "[data-k='hud'] .k-title{font-size:calc(var(--k-h) - 4px)}",
      "[data-k='card'] .k-main{align-items:center;justify-content:center}",
      "[data-k='card'] .k-main>*{width:min(560px,100%)}",
      "[data-k='split'] .k-main{flex-direction:row;align-items:stretch}",
      "[data-k='split'] .k-main>*:first-child{flex:1 1 auto;min-width:0;overflow:auto}",
      "[data-k='split'] .k-main>*:last-child{flex:0 0 clamp(180px,30%,280px);overflow:auto}",
      "[data-k='board'] .k-main{padding:0}",
      "[data-k='board'] .k-foot{justify-content:center}",
      "[data-k='panel'] .k-main{flex-direction:row-reverse;align-items:stretch}",
      "[data-k='panel'] .k-main>*:first-child{flex:1 1 auto;min-width:0;overflow:auto}",
      "[data-k='panel'] .k-main>*:last-child{flex:0 0 clamp(160px,28%,240px);overflow:auto}",
      "@media (max-width:560px){",
        "[data-k='split'] .k-main,[data-k='panel'] .k-main{flex-direction:column}",
        "[data-k='split'] .k-main>*,[data-k='panel'] .k-main>*{flex:0 0 auto;overflow:visible}",
        ".k-title{font-size:calc(var(--k-h) - 3px)}",
      "}"
    ].join("");
  }

  /* ══ 骨の 組み立て ═════════════════════════════════════════════
     芯は 中身（中）と 手もと（手）と 帯 だけを 出す。並べるのは こちら。 */
  function 骨で包む(骨, 部) {
    var h = '<div class="k" data-k="' + 骨 + '">';
    h += '<div class="k-head">';
    h += '<div style="min-width:0"><div class="k-title">' + (部.題 || "") + "</div>";
    if (部.副) h += '<div class="k-sub">' + 部.副 + "</div>";
    h += "</div>";
    if (部.帯) h += '<div class="k-hud">' + 部.帯 + "</div>";
    h += "</div>";
    h += '<div class="k-main">' + (部.中 || "") + "</div>";
    if (部.手) h += '<div class="k-foot">' + 部.手 + "</div>";
    return h + "</div>";
  }

  /* ══ 差し込みの 検査 ═══════════════════════════════════════════
     ★ ここが いちばん 効く。LLM が 何を 入れてきても
       **型が 期待する 形へ 必ず 直してから** 渡す。
       足りなければ 既定で 埋める。多すぎれば 切る。 */
  var 制御文字 = /[ -]/g;
  function 文にする(v, 上限) {
    var s = v === undefined || v === null ? "" : String(v);
    s = s.replace(制御文字, "");
    return 上限 ? s.slice(0, 上限) : s;
  }
  function 逃がす(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function 数にする(v, 既定, 最小, 最大) {
    var n = Number(v);
    if (!isFinite(n)) n = Number(既定) || 0;
    if (最小 !== undefined) n = Math.max(最小, n);
    if (最大 !== undefined) n = Math.min(最大, n);
    return n;
  }
  function 並びにする(v) {
    if (Array.isArray(v)) return v;
    if (v === undefined || v === null || v === "") return [];
    if (typeof v === "string") return v.split(/\r?\n|、|,/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (typeof v === "object") return Object.keys(v).map(function (k) { return v[k]; });
    return [v];
  }

  function 一つ直す(定, 生) {
    var t = 定.型;
    if (t === "文") return 文にする(生 === undefined || 生 === null || 生 === "" ? 定.既定 : 生, 定.上限 || 200);
    if (t === "数") return 数にする(生, 定.既定, 定.最小, 定.最大);
    if (t === "真偽") return 生 === undefined ? !!定.既定 : !!生;
    if (t === "選") {
      var s = 文にする(生, 40);
      return (定.候補 || []).indexOf(s) >= 0 ? s : 定.既定;
    }
    if (t === "並び") {
      var a = 並びにする(生).map(function (x) { return 文にする(x, 定.上限 || 120); }).filter(Boolean);
      if (!a.length && 定.既定) a = 定.既定.slice();
      if (定.最大) a = a.slice(0, 定.最大);
      return a;
    }
    if (t === "表") {
      var 行 = 並びにする(生).filter(function (x) { return x && typeof x === "object"; });
      var 形 = 定.形 || {};
      var 出 = 行.map(function (r) {
        var o = {};
        Object.keys(形).forEach(function (k) {
          var f = 形[k];
          if (f === "並び") o[k] = 並びにする(r[k]).map(function (x) { return 文にする(x, 120); }).filter(Boolean);
          else if (f === "数") o[k] = 数にする(r[k], 0);
          else if (f === "真偽") o[k] = !!r[k];
          else o[k] = 文にする(r[k], 300);
        });
        return o;
      });
      (定.必須 || []).forEach(function (k) {
        出 = 出.filter(function (r) { return Array.isArray(r[k]) ? r[k].length : String(r[k] || "").trim(); });
      });
      if (!出.length && 定.既定) 出 = JSON.parse(JSON.stringify(定.既定));
      if (定.最大) 出 = 出.slice(0, 定.最大);
      return 出;
    }
    return 生;
  }

  function 差し込みを直す(スロット, 生) {
    生 = (生 && typeof 生 === "object") ? 生 : {};
    var 出 = {}, 直した = [];
    (スロット || []).forEach(function (定) {
      var 前 = 生[定.鍵];
      var 後 = 一つ直す(定, 前);
      出[定.鍵] = 後;
      try { if (JSON.stringify(前) !== JSON.stringify(後)) 直した.push(定.鍵); } catch (e) { 直した.push(定.鍵); }
    });
    return { 中身: 出, 直した: 直した };
  }

  VQK.色たち = 色たち; VQK.色の名 = 色の名;
  VQK.詰たち = 詰たち; VQK.詰の名 = 詰の名;
  VQK.骨たち = 骨たち; VQK.骨の名 = 骨の名;
  VQK.土台CSS = 土台CSS;
  VQK.骨で包む = 骨で包む;
  VQK.差し込みを直す = 差し込みを直す;
  VQK.逃がす = 逃がす;
  VQK.文にする = 文にする;
  VQK.数にする = 数にする;
  VQK.並びにする = 並びにする;
})(typeof window !== "undefined" ? window : globalThis);


/* ───────── /core/kata/play.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/kata/play.js — 型の 芯（あそび）12 種

   ★ ここに 書いてあるものが **実際に 動く 中身**。
     Lumi は これを 1 行も 書かない。文字と 数と 並び を 入れるだけ。
   ★ どの 芯も 返すのは { 中, 手, 帯, css, js } の 5 つだけ。
     並べるのは base.js の 骨。だから 崩れない。
   ★ js の中では 共通の 道具 K（index.js が 先に 差し込む）が 使える。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});

  /* 共通の スロット */
  var 題 = { 鍵: "題", 型: "文", 既定: "あそぶ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };

  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══════════════════════════════════════════════════════════════════
     ① quiz4 — えらぶ問題（2〜6 択）
     ══════════════════════════════════════════════════════════════════ */
  芯.quiz4 = {
    名: "えらぶ問題", 分類: "あそび",
    語: ["クイズ", "4択", "選択", "問題", "テスト", "quiz", "選ぶ", "正誤", "○×", "確認テスト"],
    説明: "問題を 1 問ずつ 出して、いくつかの 選択肢から 選ばせる。正解・解説・得点つき。",
    スロット: [題, 副,
      { 鍵: "問題", 型: "表", 必須: ["問", "答"], 最大: 60,
        形: { 問: "文", 答: "文", 選択肢: "並び", 解説: "文" },
        説: "1 問 ＝ {問, 答, 選択肢[], 解説}。答は 選択肢の どれかと 同じ文字にする",
        既定: [{ 問: "日本の首都は？", 答: "東京", 選択肢: ["東京", "大阪", "京都", "札幌"], 解説: "1868 年から。" }] },
      { 鍵: "制限秒", 型: "数", 既定: 0, 最小: 0, 最大: 300, 説: "1 問あたりの 秒数。0 なら 無制限" },
      { 鍵: "混ぜる", 型: "真偽", 既定: true, 説: "出る順と 選択肢の順を 混ぜるか" }
    ],
    例: { 題: "理科 まとめテスト", 問題: [{ 問: "水の沸点は？", 答: "100℃", 選択肢: ["0℃", "50℃", "100℃", "200℃"], 解説: "1 気圧のとき。" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kS", "0 点"], ["kT", ""]]),
        中: '<div class="k-card" id="kBody"></div><div class="k-gr" id="kChoices" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"></div><div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn pri" id="kNext">つぎへ</button><button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kBody{font-size:calc(var(--k-fs) + 4px);font-weight:600;line-height:1.7}"
          + "#kChoices .k-btn{min-height:52px;width:100%;white-space:normal;line-height:1.4;padding:8px 12px}"
          + ".ans-o{background:var(--k-good) !important;color:#fff !important;border-color:transparent !important}"
          + ".ans-x{background:var(--k-bad) !important;color:#fff !important;border-color:transparent !important}",
        js: "var Q=" + JSON.stringify(d.問題) + ",MIX=" + (d.混ぜる ? "1" : "0") + ",LIM=" + d.制限秒 + ";\n"
          + "var i=0,sc=0,lock=0,tid=0,left=0;\n"
          + "if(MIX)Q=K.shuffle(Q.slice());\n"
          + "function opts(q){var o=(q.選択肢||[]).slice();if(!o.length)o=[q.答];if(o.indexOf(q.答)<0)o.unshift(q.答);return MIX?K.shuffle(o):o;}\n"
          + "function draw(){lock=0;clearInterval(tid);var q=Q[i];\n"
          + "  K.$('#kQ').textContent=(i+1)+'/'+Q.length;K.$('#kS').textContent=sc+' 点';\n"
          + "  K.$('#kBody').textContent=q.問;K.$('#kExp').classList.add('k-hide');\n"
          + "  var c=K.$('#kChoices');c.innerHTML='';\n"
          + "  opts(q).forEach(function(t){var b=document.createElement('button');b.className='k-btn';b.textContent=t;\n"
          + "    b.onclick=function(){pick(b,t,q);};c.appendChild(b);});\n"
          + "  if(LIM>0){left=LIM;K.$('#kT').textContent=left+' 秒';tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0){clearInterval(tid);pick(null,'',q);}},1000);}\n"
          + "  else K.$('#kT').textContent='';}\n"
          + "function pick(b,t,q){if(lock)return;lock=1;clearInterval(tid);\n"
          + "  var ok=t===q.答;if(ok)sc++;K.$('#kS').textContent=sc+' 点';\n"
          /* ★ 空の 名前を classList.add に 渡すと **その場で 落ちる**（実測）。
             どちらでもない ボタンには 何も 付けない。 */
          + "  K.$$('#kChoices .k-btn').forEach(function(x){var c=x.textContent===q.答?'ans-o':(x===b?'ans-x':'');if(c)x.classList.add(c);});\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b>'+(ok?'せいかい':'こたえ: '+K.esc(q.答))+'</b>'+(q.解説?'<div class=\"k-note\" style=\"margin-top:6px\">'+K.esc(q.解説)+'</div>':'');}\n"
          + "function next(){if(!lock&&Q[i]){pick(null,'',Q[i]);return;}i++;if(i>=Q.length){done();return;}draw();}\n"
          + "function done(){K.$('#kChoices').innerHTML='';K.$('#kExp').classList.add('k-hide');\n"
          + "  K.$('#kBody').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+sc+' / '+Q.length+'</div><div class=\"k-note\">おつかれさま</div></div>';}\n"
          + "K.$('#kNext').onclick=next;K.$('#kAgain').onclick=function(){i=0;sc=0;if(MIX)Q=K.shuffle(Q);draw();};\n"
          + "draw();"
      };
    }
  };

  /* ══ ② flash — 単語カード ═══════════════════════════════════════ */
  芯.flash = {
    名: "単語カード", 分類: "あそび",
    語: ["単語カード", "フラッシュカード", "暗記", "めくる", "英単語", "flashcard", "覚える", "反復"],
    説明: "表を見て 考えて、めくって 答え合わせ。覚えた／まだ で 仕分ける。",
    スロット: [題, 副,
      { 鍵: "カード", 型: "表", 必須: ["表", "裏"], 最大: 200, 形: { 表: "文", 裏: "文", 補足: "文" },
        説: "1 枚 ＝ {表, 裏, 補足}",
        既定: [{ 表: "apple", 裏: "りんご", 補足: "" }, { 表: "dog", 裏: "犬", 補足: "" }] },
      { 鍵: "混ぜる", 型: "真偽", 既定: true, 説: "順番を 混ぜるか" }
    ],
    例: { 題: "英単語 1 章", カード: [{ 表: "increase", 裏: "を増やす" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kO", "覚えた 0"]]),
        中: '<div class="k-card" id="kCard"><div id="kFront"></div><div id="kBack" class="k-hide"></div></div>',
        手: '<button class="k-btn pri" id="kFlip">めくる</button>'
          + '<button class="k-btn" id="kOk">覚えた</button><button class="k-btn" id="kNg">まだ</button>'
          + '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kCard{min-height:min(46vh,300px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;cursor:pointer}"
          + "#kFront{font-size:clamp(24px,6vw,42px);font-weight:800;line-height:1.25}"
          + "#kBack{font-size:clamp(19px,4.4vw,28px);font-weight:600;color:var(--k-accent)}"
          + "#kBack .sub{display:block;font-size:var(--k-fs);color:var(--k-sub);font-weight:400;margin-top:6px}",
        js: "var CARDS=" + JSON.stringify(d.カード) + ",MIX=" + (d.混ぜる ? "1" : "0") + ";\n"
          + "var C=MIX?K.shuffle(CARDS.slice()):CARDS.slice();\nvar i=0,ok=0,open=0;\n"
          + "function draw(){open=0;var c=C[i]||{表:'',裏:''};K.$('#kQ').textContent=(i+1)+'/'+C.length;\n"
          + "  K.$('#kO').textContent='覚えた '+ok;K.$('#kFront').textContent=c.表;\n"
          + "  K.$('#kBack').innerHTML=K.esc(c.裏)+(c.補足?'<span class=\"sub\">'+K.esc(c.補足)+'</span>':'');\n"
          + "  K.$('#kBack').classList.add('k-hide');}\n"
          + "function flip(){open=!open;K.$('#kBack').classList.toggle('k-hide',!open);}\n"
          + "function go(g){if(g)ok++;i++;\n"
          + "  if(i>=C.length){K.$('#kCard').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+ok+' / '+C.length+'</div><div class=\"k-note\">覚えた かず</div></div>';\n"
          + "    K.$('#kO').textContent='覚えた '+ok;return;}draw();}\n"
          + "function again(){i=0;ok=0;C=MIX?K.shuffle(CARDS.slice()):CARDS.slice();\n"
          + "  K.$('#kCard').innerHTML='<div id=\"kFront\"></div><div id=\"kBack\" class=\"k-hide\"></div>';\n"
          + "  K.$('#kCard').onclick=flip;draw();}\n"
          + "K.$('#kFlip').onclick=flip;K.$('#kCard').onclick=flip;\n"
          + "K.$('#kOk').onclick=function(){go(1);};K.$('#kNg').onclick=function(){go(0);};\n"
          + "K.$('#kAgain').onclick=again;\ndraw();"
      };
    }
  };

  /* ══ ③ pair — 神経衰弱（絵合わせ）═══════════════════════════════ */
  芯.pair = {
    名: "絵合わせ", 分類: "あそび",
    語: ["神経衰弱", "絵合わせ", "ペア", "記憶", "めくって合わせる", "memory", "対応", "組み合わせ"],
    説明: "裏返した札を 2 枚ずつ めくって、対に なるものを そろえる。",
    スロット: [題, 副,
      { 鍵: "対", 型: "表", 必須: ["左", "右"], 最大: 18, 形: { 左: "文", 右: "文" },
        説: "1 組 ＝ {左, 右}。同じ意味の 2 つを 入れる（英語と 日本語 など）",
        既定: [{ 左: "犬", 右: "dog" }, { 左: "猫", 右: "cat" }, { 左: "鳥", 右: "bird" }, { 左: "魚", 右: "fish" }] }
    ],
    例: { 題: "英単語 絵合わせ", 対: [{ 左: "山", 右: "mountain" }] },
    作る: function (d) {
      return {
        帯: 帯([["kM", "0 手"], ["kP", "0 組"]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kBoard{grid-template-columns:repeat(auto-fit,minmax(84px,1fr));align-content:start}"
          + ".cell{aspect-ratio:1/1;border-radius:calc(var(--k-r) - 2px);background:var(--k-accent);color:var(--k-ink);"
          + "display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font-weight:700;"
          + "font-size:calc(var(--k-fs) - 1px);line-height:1.25;word-break:break-word;overflow:hidden;transition:.15s}"
          + ".cell.up{background:var(--k-surface);color:var(--k-text);border:1px solid var(--k-line)}"
          + ".cell.got{background:var(--k-good);color:#fff;pointer-events:none}",
        js: "var P=" + JSON.stringify(d.対) + ";\nvar cards=[],a=null,b=null,mv=0,got=0,lock=0;\n"
          + "function build(){cards=[];P.forEach(function(p,n){cards.push({k:n,t:p.左});cards.push({k:n,t:p.右});});\n"
          + "  cards=K.shuffle(cards);mv=0;got=0;a=b=null;lock=0;\n"
          + "  var bd=K.$('#kBoard');bd.innerHTML='';\n"
          + "  cards.forEach(function(c,idx){var e=document.createElement('button');e.className='cell';e.dataset.i=idx;\n"
          + "    e.textContent='?';e.onclick=function(){tap(e,c);};bd.appendChild(e);});\n"
          + "  K.$('#kM').textContent='0 手';K.$('#kP').textContent='0 組';}\n"
          + "function tap(e,c){if(lock||e.classList.contains('up')||e.classList.contains('got'))return;\n"
          + "  e.classList.add('up');e.textContent=c.t;\n"
          + "  if(!a){a={e:e,c:c};return;}b={e:e,c:c};mv++;K.$('#kM').textContent=mv+' 手';lock=1;\n"
          /* ★ 700ms の 戻しは **その場の 控え**で 持つ。
             はじめから を 押されると a・b は 空に なるので、
             共有の 入れ物を 見ていると そこで 落ちる（実測）。 */
          + "  var A=a,B=b;a=b=null;\n"
          + "  if(A.c.k===B.c.k&&A.e!==B.e){A.e.classList.add('got');B.e.classList.add('got');got++;\n"
          + "    K.$('#kP').textContent=got+' 組';lock=0;\n"
          + "    if(got===P.length)setTimeout(function(){var bd=K.$('#kBoard');if(bd)bd.innerHTML='<div class=\"k-center\" style=\"grid-column:1/-1\"><div class=\"k-big\">そろった</div><div class=\"k-note\">'+mv+' 手</div></div>';},260);return;}\n"
          + "  setTimeout(function(){if(A.e&&A.e.isConnected){A.e.classList.remove('up');A.e.textContent='?';}\n"
          + "    if(B.e&&B.e.isConnected){B.e.classList.remove('up');B.e.textContent='?';}lock=0;},700);}\n"
          + "K.$('#kAgain').onclick=build;build();"
      };
    }
  };

  /* ══ ④ type — タイピング ═══════════════════════════════════════ */
  芯.type = {
    名: "タイピング", 分類: "あそび",
    語: ["タイピング", "打つ", "入力", "typing", "キーボード", "速さ", "スペル", "つづり"],
    説明: "出てくる 言葉を 打ち込む。正しく 打てた数と 速さが 出る。",
    スロット: [題, 副,
      { 鍵: "言葉", 型: "並び", 最大: 200, 上限: 60, 既定: ["apple", "banana", "orange", "grape"],
        説: "打たせたい 言葉の 並び" },
      { 鍵: "秒数", 型: "数", 既定: 60, 最小: 10, 最大: 600, 説: "遊べる 秒数" }
    ],
    例: { 題: "英単語 タイピング", 言葉: ["increase", "prevent", "observe"], 秒数: 60 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kT", d.秒数 + " 秒"]]),
        中: '<div class="k-center"><div id="kWord"></div><input class="k-in" id="kIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ここに 打つ" style="max-width:420px;text-align:center;font-size:calc(var(--k-fs) + 3px)"><div class="k-note" id="kMsg">はじめの 1 字を 打つと 始まります</div></div>',
        手: '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kWord{font-size:clamp(28px,7vw,52px);font-weight:800;letter-spacing:.02em;line-height:1.2;word-break:break-all}"
          + "#kWord .ok{color:var(--k-good)}#kWord .ng{color:var(--k-bad);text-decoration:underline}",
        js: "var W=" + JSON.stringify(d.言葉) + ",SEC=" + d.秒数 + ";\n"
          + "var list=K.shuffle(W.slice()),i=0,sc=0,miss=0,run=0,left=SEC,tid=0;\n"
          + "function show(){var w=list[i%list.length]||'';var v=K.$('#kIn').value;\n"
          + "  var h='';for(var n=0;n<w.length;n++){var c=K.esc(w[n]);\n"
          + "    h+= n<v.length ? (v[n]===w[n]?'<span class=\"ok\">'+c+'</span>':'<span class=\"ng\">'+c+'</span>') : c;}\n"
          + "  K.$('#kWord').innerHTML=h;}\n"
          + "function start(){if(run)return;run=1;K.$('#kMsg').textContent='';\n"
          + "  tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0)end();},1000);}\n"
          + "function end(){clearInterval(tid);run=0;K.$('#kIn').disabled=true;\n"
          + "  var wpm=Math.round(sc/Math.max(1,SEC)*60);\n"
          + "  K.$('#kWord').innerHTML='<span class=\"k-big\">'+sc+'</span>';\n"
          + "  K.$('#kMsg').textContent='1 分あたり '+wpm+' 語 ／ 打ちまちがい '+miss;}\n"
          + "K.$('#kIn').addEventListener('input',function(){start();var w=list[i%list.length]||'';var v=K.$('#kIn').value;\n"
          + "  if(v.length&&w.indexOf(v)!==0)miss++;\n"
          + "  if(v===w){sc++;i++;K.$('#kS').textContent=sc;K.$('#kIn').value='';}show();});\n"
          + "K.$('#kAgain').onclick=function(){clearInterval(tid);list=K.shuffle(W.slice());i=0;sc=0;miss=0;left=SEC;run=0;\n"
          + "  K.$('#kIn').disabled=false;K.$('#kIn').value='';K.$('#kS').textContent='0';K.$('#kT').textContent=SEC+' 秒';\n"
          + "  K.$('#kMsg').textContent='はじめの 1 字を 打つと 始まります';show();K.$('#kIn').focus();};\n"
          + "show();setTimeout(function(){K.$('#kIn').focus();},100);"
      };
    }
  };

  /* ══ ⑤ mole — もぐらたたき ═════════════════════════════════════ */
  芯.mole = {
    名: "もぐらたたき", 分類: "あそび",
    語: ["もぐらたたき", "たたく", "反射", "素早く", "whack", "反応", "当てる", "瞬発"],
    説明: "穴から 出てくるものを 押す。合っているものだけ 押すと 点が 入る。",
    スロット: [題, 副,
      { 鍵: "あたり", 型: "並び", 最大: 40, 上限: 20, 既定: ["○"], 説: "押すと 点が 入るもの" },
      { 鍵: "はずれ", 型: "並び", 最大: 40, 上限: 20, 既定: ["×"], 説: "押すと 点が 減るもの" },
      { 鍵: "秒数", 型: "数", 既定: 45, 最小: 10, 最大: 300 },
      { 鍵: "はやさ", 型: "数", 既定: 900, 最小: 300, 最大: 2500, 説: "出てくる 間隔（ミリ秒）。小さいほど 速い" }
    ],
    例: { 題: "偶数を たたけ", あたり: ["2", "4", "6", "8"], はずれ: ["1", "3", "5"], 秒数: 45 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 点"], ["kT", d.秒数 + " 秒"]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button>',
        css: "#kBoard{grid-template-columns:repeat(3,1fr);align-content:center;height:100%}"
          + ".hole{aspect-ratio:1/1;border-radius:50%;background:var(--k-line);display:flex;align-items:center;justify-content:center;"
          + "font-size:clamp(20px,5vw,34px);font-weight:800;color:transparent;transition:.12s;overflow:hidden;padding:6px;text-align:center}"
          + ".hole.up{background:var(--k-accent);color:var(--k-ink)}.hole.hit{background:var(--k-good);color:#fff}"
          + ".hole.bad{background:var(--k-bad);color:#fff}",
        js: "var A=" + JSON.stringify(d.あたり) + ",B=" + JSON.stringify(d.はずれ) + ",SEC=" + d.秒数 + ",SP=" + d.はやさ + ";\n"
          + "var holes=[],sc=0,left=SEC,run=0,t1=0,t2=0;\n"
          + "var bd=K.$('#kBoard');for(var n=0;n<9;n++){var e=document.createElement('button');e.className='hole';e.dataset.v='';\n"
          + "  e.onclick=(function(el){return function(){hit(el);};})(e);bd.appendChild(e);holes.push(e);}\n"
          + "function hit(e){if(!run||!e.classList.contains('up'))return;var good=e.dataset.g==='1';\n"
          + "  sc+=good?1:-1;K.$('#kS').textContent=sc+' 点';e.classList.remove('up');e.classList.add(good?'hit':'bad');\n"
          + "  setTimeout(function(){e.classList.remove('hit','bad');e.textContent='';},220);}\n"
          + "function pop(){holes.forEach(function(e){e.classList.remove('up');e.textContent='';});\n"
          + "  var e=holes[Math.floor(Math.random()*holes.length)];var g=Math.random()<0.6||!B.length;\n"
          + "  var src=g?A:B;if(!src.length)src=A.concat(B);\n"
          + "  e.dataset.g=g?'1':'0';e.textContent=src[Math.floor(Math.random()*src.length)]||'';e.classList.add('up');}\n"
          + "function go(){if(run)return;run=1;sc=0;left=SEC;K.$('#kS').textContent='0 点';K.$('#kGo').textContent='やりなおす';\n"
          + "  clearInterval(t1);clearInterval(t2);t1=setInterval(pop,SP);\n"
          + "  t2=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0)end();},1000);pop();}\n"
          + "function end(){run=0;clearInterval(t1);clearInterval(t2);\n"
          + "  holes.forEach(function(e){e.classList.remove('up');e.textContent='';});\n"
          + "  holes[4].classList.add('up');holes[4].textContent=sc;K.$('#kGo').textContent='もう一度';}\n"
          + "K.$('#kGo').onclick=function(){run=0;go();};"
      };
    }
  };

  /* ══ ⑥ catch — 落ちものキャッチ ═══════════════════════════════ */
  芯.catch = {
    名: "落ちものキャッチ", 分類: "あそび",
    語: ["落ちもの", "キャッチ", "受ける", "よける", "動かす", "catch", "落ちてくる", "かご"],
    説明: "上から 落ちてくるものを 下の かごで 受ける。合うものだけ 受ける。",
    スロット: [題, 副,
      { 鍵: "あたり", 型: "並び", 最大: 40, 上限: 12, 既定: ["◯"], 説: "受けると 点が 入るもの" },
      { 鍵: "はずれ", 型: "並び", 最大: 40, 上限: 12, 既定: ["✕"], 説: "受けると 点が 減るもの" },
      { 鍵: "秒数", 型: "数", 既定: 60, 最小: 10, 最大: 300 }
    ],
    例: { 題: "母音を あつめろ", あたり: ["a", "i", "u", "e", "o"], はずれ: ["k", "s", "t"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 点"], ["kT", d.秒数 + " 秒"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">左右に 動かす（指・矢印キー）</span>',
        css: "#kStage{flex:1;min-height:200px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var A=" + JSON.stringify(d.あたり) + ",B=" + JSON.stringify(d.はずれ) + ",SEC=" + d.秒数 + ";\n"
          + "var cv=K.canvas(K.$('#kC')),sc=0,left=SEC,run=0,px=0.5,items=[],tid=0,acc=0;\n"
          + "K.drag(K.$('#kStage'),function(x){px=x;});\n"
          + "K.keys(function(k){if(k==='ArrowLeft')px=Math.max(0,px-0.07);if(k==='ArrowRight')px=Math.min(1,px+0.07);});\n"
          + "function spawn(){var g=Math.random()<0.62||!B.length;var src=g?A:B;if(!src.length)src=A.concat(B);\n"
          + "  items.push({x:0.08+Math.random()*0.84,y:-0.05,g:g,t:src[Math.floor(Math.random()*src.length)]||'',v:0.0035+Math.random()*0.004});}\n"
          + "cv.loop(function(ctx,w,h,dt){ctx.clearRect(0,0,w,h);\n"
          + "  var cs=K.css('--k-text'),ac=K.css('--k-accent'),gd=K.css('--k-good'),bd=K.css('--k-bad');\n"
          + "  if(run){acc+=dt;if(acc>620){acc=0;spawn();}}\n"
          + "  var by=h-26,bw=Math.max(56,w*0.16);\n"
          + "  ctx.fillStyle=ac;ctx.beginPath();ctx.roundRect(px*w-bw/2,by,bw,16,8);ctx.fill();\n"
          + "  ctx.font='600 '+Math.round(Math.min(26,h*0.07))+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "  for(var i=items.length-1;i>=0;i--){var it=items[i];if(run)it.y+=it.v*dt;\n"
          + "    var x=it.x*w,y=it.y*h;ctx.fillStyle=it.g?gd:bd;ctx.fillText(it.t,x,y);\n"
          + "    if(y>by-8&&y<by+22&&Math.abs(x-px*w)<bw/2+10){sc+=it.g?1:-1;K.$('#kS').textContent=sc+' 点';items.splice(i,1);continue;}\n"
          + "    if(y>h+30)items.splice(i,1);}\n"
          + "  if(!run){ctx.fillStyle=cs;ctx.font='700 '+Math.round(Math.min(30,h*0.09))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(left<=0?('けっか '+sc+' 点'):'はじめる を おす',w/2,h/2);}});\n"
          + "function go(){run=1;sc=0;left=SEC;items=[];K.$('#kS').textContent='0 点';K.$('#kGo').textContent='やりなおす';\n"
          + "  clearInterval(tid);tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';\n"
          + "    if(left<=0){run=0;clearInterval(tid);K.$('#kGo').textContent='もう一度';}},1000);}\n"
          + "K.$('#kGo').onclick=go;"
      };
    }
  };

  /* ══ ⑦ snake — へび ═══════════════════════════════════════════ */
  芯.snake = {
    名: "へび", 分類: "あそび",
    語: ["へび", "スネーク", "snake", "のびる", "food", "むかしのゲーム", "方向"],
    説明: "えさを 取って のびる。壁と 自分に ぶつかると おわり。",
    スロット: [題, 副,
      { 鍵: "ます", 型: "数", 既定: 16, 最小: 8, 最大: 28, 説: "盤の 一辺の ます目" },
      { 鍵: "はやさ", 型: "数", 既定: 140, 最小: 60, 最大: 400, 説: "1 こま の ミリ秒。小さいほど 速い" }
    ],
    例: { 題: "へび", ます: 16 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kL", "長さ 3"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">矢印キー・画面を なぞる</span>',
        css: "#kStage{flex:1;min-height:200px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var N=" + d.ます + ",SP=" + d.はやさ + ";\nvar cv=K.canvas(K.$('#kC'));\n"
          + "var s=[],dir={x:1,y:0},nd={x:1,y:0},food={x:0,y:0},sc=0,run=0,acc=0;\n"
          + "function reset(){s=[{x:2,y:2},{x:1,y:2},{x:0,y:2}];dir={x:1,y:0};nd=dir;sc=0;place();\n"
          + "  K.$('#kS').textContent='0';K.$('#kL').textContent='長さ '+s.length;}\n"
          + "function place(){for(var t=0;t<400;t++){var p={x:(Math.random()*N)|0,y:(Math.random()*N)|0};\n"
          + "  if(!s.some(function(q){return q.x===p.x&&q.y===p.y;})){food=p;return;}}}\n"
          + "function turn(x,y){if(x===-dir.x&&y===-dir.y)return;nd={x:x,y:y};}\n"
          + "K.keys(function(k){if(k==='ArrowLeft')turn(-1,0);if(k==='ArrowRight')turn(1,0);if(k==='ArrowUp')turn(0,-1);if(k==='ArrowDown')turn(0,1);});\n"
          + "K.swipe(K.$('#kStage'),turn);\n"
          + "function step(){dir=nd;var h={x:s[0].x+dir.x,y:s[0].y+dir.y};\n"
          + "  if(h.x<0||h.y<0||h.x>=N||h.y>=N||s.some(function(q){return q.x===h.x&&q.y===h.y;})){run=0;K.$('#kGo').textContent='もう一度';return;}\n"
          + "  s.unshift(h);if(h.x===food.x&&h.y===food.y){sc++;K.$('#kS').textContent=sc;place();}else s.pop();\n"
          + "  K.$('#kL').textContent='長さ '+s.length;}\n"
          + "cv.loop(function(ctx,w,h2,dt){var m=Math.min(w,h2),c=Math.floor(m/N),ox=(w-c*N)/2,oy=(h2-c*N)/2;\n"
          + "  ctx.clearRect(0,0,w,h2);if(run){acc+=dt;if(acc>=SP){acc=0;step();}}\n"
          + "  ctx.fillStyle=K.css('--k-line');ctx.fillRect(ox,oy,c*N,c*N);\n"
          + "  ctx.fillStyle=K.css('--k-bad');ctx.beginPath();ctx.arc(ox+food.x*c+c/2,oy+food.y*c+c/2,c*0.32,0,7);ctx.fill();\n"
          + "  ctx.fillStyle=K.css('--k-accent');s.forEach(function(q,i){ctx.globalAlpha=i?0.85:1;\n"
          + "    ctx.beginPath();ctx.roundRect(ox+q.x*c+1,oy+q.y*c+1,c-2,c-2,Math.max(2,c*0.25));ctx.fill();});ctx.globalAlpha=1;\n"
          + "  if(!run){ctx.fillStyle=K.css('--k-text');ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "    ctx.font='700 '+Math.round(Math.min(28,h2*0.09))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(sc>0?('けっか '+sc):'はじめる を おす',w/2,h2/2);}});\n"
          + "K.$('#kGo').onclick=function(){reset();run=1;K.$('#kGo').textContent='やりなおす';};reset();"
      };
    }
  };

  /* ══ ⑧ breakout — ブロックくずし ═══════════════════════════════ */
  芯.breakout = {
    名: "ブロックくずし", 分類: "あそび",
    語: ["ブロックくずし", "ブロック", "たま", "はねる", "breakout", "パドル", "崩す"],
    説明: "下の 板で たまを はね返して、上の ブロックを 全部 消す。",
    スロット: [題, 副,
      { 鍵: "だん", 型: "数", 既定: 4, 最小: 2, 最大: 8, 説: "ブロックの 段数" },
      { 鍵: "れつ", 型: "数", 既定: 7, 最小: 3, 最大: 12, 説: "ブロックの 列数" },
      { 鍵: "はやさ", 型: "数", 既定: 26, 最小: 12, 最大: 60, 説: "たまの 速さ" }
    ],
    例: { 題: "ブロックくずし", だん: 4, れつ: 7 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kLf", "のこり 3"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">左右に 動かす</span>',
        css: "#kStage{flex:1;min-height:220px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var R=" + d.だん + ",C=" + d.れつ + ",SP=" + d.はやさ + "/1000;\nvar cv=K.canvas(K.$('#kC'));\n"
          + "var px=0.5,bx=0.5,by=0.7,vx=SP*0.6,vy=-SP,br=[],sc=0,life=3,run=0;\n"
          + "K.drag(K.$('#kStage'),function(x){px=x;});\n"
          + "K.keys(function(k){if(k==='ArrowLeft')px=Math.max(0,px-0.06);if(k==='ArrowRight')px=Math.min(1,px+0.06);});\n"
          + "function reset(){br=[];for(var r=0;r<R;r++)for(var c=0;c<C;c++)br.push({r:r,c:c,on:1});\n"
          + "  sc=0;life=3;K.$('#kS').textContent='0';K.$('#kLf').textContent='のこり 3';ball();}\n"
          + "function ball(){bx=px;by=0.72;vx=SP*(Math.random()<0.5?-0.6:0.6);vy=-SP;}\n"
          + "cv.loop(function(ctx,w,h,dt){ctx.clearRect(0,0,w,h);var k=Math.min(2.5,dt/16.7);\n"
          + "  var bw=w/C,bh=Math.min(30,h*0.055),top=8;\n"
          + "  br.forEach(function(b){if(!b.on)return;ctx.fillStyle=K.css('--k-accent');ctx.globalAlpha=1-b.r*0.11;\n"
          + "    ctx.beginPath();ctx.roundRect(b.c*bw+2,top+b.r*(bh+3),bw-4,bh,4);ctx.fill();});ctx.globalAlpha=1;\n"
          + "  var pw=Math.max(64,w*0.19),py=h-22;\n"
          + "  ctx.fillStyle=K.css('--k-text');ctx.beginPath();ctx.roundRect(px*w-pw/2,py,pw,12,6);ctx.fill();\n"
          + "  if(run){bx+=vx*k;by+=vy*k*(w/Math.max(1,h));\n"
          + "    if(bx<0.01){bx=0.01;vx=Math.abs(vx);}if(bx>0.99){bx=0.99;vx=-Math.abs(vx);}\n"
          + "    if(by<0.02){by=0.02;vy=Math.abs(vy);}\n"
          + "    var X=bx*w,Y=by*h;\n"
          + "    if(Y>py-8&&Y<py+14&&Math.abs(X-px*w)<pw/2+6&&vy>0){vy=-Math.abs(vy);vx+=(X-px*w)/w*SP*1.4;}\n"
          + "    br.forEach(function(b){if(!b.on)return;var x0=b.c*bw+2,y0=top+b.r*(bh+3);\n"
          + "      if(X>x0&&X<x0+bw-4&&Y>y0&&Y<y0+bh){b.on=0;vy=-vy;sc++;K.$('#kS').textContent=sc;}});\n"
          + "    if(by>1.05){life--;K.$('#kLf').textContent='のこり '+life;if(life<=0){run=0;K.$('#kGo').textContent='もう一度';}else ball();}\n"
          + "    if(!br.some(function(b){return b.on;})){run=0;K.$('#kGo').textContent='もう一度';}}\n"
          + "  ctx.fillStyle=K.css('--k-bad');ctx.beginPath();ctx.arc(bx*w,by*h,Math.max(5,w*0.012),0,7);ctx.fill();\n"
          + "  if(!run){ctx.fillStyle=K.css('--k-text');ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "    ctx.font='700 '+Math.round(Math.min(26,h*0.08))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(sc>0?('けっか '+sc):'はじめる を おす',w/2,h*0.62);}});\n"
          + "K.$('#kGo').onclick=function(){reset();run=1;K.$('#kGo').textContent='やりなおす';};reset();"
      };
    }
  };

  /* ══ ⑨ merge2048 — 数をあわせる ═══════════════════════════════ */
  芯.merge2048 = {
    名: "数をあわせる", 分類: "あそび",
    語: ["2048", "合体", "数", "スライド", "パズル", "merge", "同じ数", "倍"],
    説明: "同じ 数どうしを ぶつけて 倍にしていく。4×4 の 盤。",
    スロット: [題, 副,
      { 鍵: "目標", 型: "数", 既定: 2048, 最小: 32, 最大: 8192, 説: "ここまで 行けば 勝ち" }
    ],
    例: { 題: "2048", 目標: 2048 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kB", "最大 0"]]),
        中: '<div id="kBoard"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめから</button><span class="k-note">矢印キー・なぞる</span>',
        css: "#kBoard{margin:auto;width:min(100%,min(72vh,460px));aspect-ratio:1/1;display:grid;grid-template-columns:repeat(4,1fr);"
          + "gap:calc(var(--k-gap) * .6);background:var(--k-line);padding:calc(var(--k-gap) * .6);border-radius:var(--k-r);touch-action:none}"
          + ".tl{border-radius:calc(var(--k-r) - 5px);display:flex;align-items:center;justify-content:center;font-weight:800;"
          + "font-size:clamp(15px,3.6vw,28px);background:var(--k-surface);color:var(--k-text);opacity:.45}"
          + ".tl.on{opacity:1;background:var(--k-accent);color:var(--k-ink)}",
        js: "var GOAL=" + d.目標 + ";\nvar g=[],sc=0,cells=[];\n"
          + "var bd=K.$('#kBoard');for(var i=0;i<16;i++){var e=document.createElement('div');e.className='tl';bd.appendChild(e);cells.push(e);}\n"
          + "function reset(){g=new Array(16).fill(0);sc=0;add();add();draw();}\n"
          + "function add(){var f=[];g.forEach(function(v,i){if(!v)f.push(i);});if(!f.length)return;\n"
          + "  g[f[(Math.random()*f.length)|0]]=Math.random()<0.9?2:4;}\n"
          + "function draw(){var mx=0;g.forEach(function(v,i){mx=Math.max(mx,v);var e=cells[i];\n"
          + "  e.textContent=v?v:'';e.classList.toggle('on',!!v);\n"
          + "  e.style.opacity=v?String(Math.min(1,0.55+Math.log2(v)/12)):'';});\n"
          + "  K.$('#kS').textContent=sc;K.$('#kB').textContent='最大 '+mx;\n"
          + "  if(mx>=GOAL)K.$('#kB').textContent='とうたつ '+mx;}\n"
          + "function line(a){var b=a.filter(function(v){return v;});\n"
          + "  for(var i=0;i<b.length-1;i++){if(b[i]===b[i+1]){b[i]*=2;sc+=b[i];b.splice(i+1,1);}}\n"
          + "  while(b.length<4)b.push(0);return b;}\n"
          + "function move(dx,dy){var before=g.join(',');\n"
          + "  for(var i=0;i<4;i++){var a=[];\n"
          + "    for(var j=0;j<4;j++){var r=dy?j:i,c=dy?i:j;a.push(g[r*4+c]);}\n"
          + "    if(dx>0||dy>0)a.reverse();a=line(a);if(dx>0||dy>0)a.reverse();\n"
          + "    for(var j2=0;j2<4;j2++){var r2=dy?j2:i,c2=dy?i:j2;g[r2*4+c2]=a[j2];}}\n"
          + "  if(g.join(',')!==before){add();}draw();}\n"
          + "K.keys(function(k){if(k==='ArrowLeft')move(-1,0);if(k==='ArrowRight')move(1,0);if(k==='ArrowUp')move(0,-1);if(k==='ArrowDown')move(0,1);});\n"
          + "K.swipe(bd,function(x,y){move(x,y);});\n"
          + "K.$('#kGo').onclick=reset;reset();"
      };
    }
  };

  /* ══ ⑩ memoryseq — 光る順に押す ═══════════════════════════════ */
  芯.memoryseq = {
    名: "光る順に押す", 分類: "あそび",
    語: ["サイモン", "順番", "記憶", "光る", "まねる", "simon", "音", "順序記憶"],
    説明: "光った 順に 押す。1 つずつ 長くなる。",
    スロット: [題, 副,
      { 鍵: "ふだ", 型: "並び", 最大: 9, 上限: 12, 既定: ["あか", "あお", "きいろ", "みどり"], 説: "押す ふだの 名前（4〜9 枚）" }
    ],
    例: { 題: "順番を 覚える", ふだ: ["1", "2", "3", "4"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 段"], ["kM", ""]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button>',
        css: "#kBoard{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));align-content:center;height:100%}"
          + ".pd{aspect-ratio:1/1;border-radius:var(--k-r);background:var(--k-surface);border:1px solid var(--k-line);"
          + "font-weight:700;font-size:calc(var(--k-fs) + 1px);display:flex;align-items:center;justify-content:center;"
          + "text-align:center;padding:6px;transition:.1s;word-break:break-word;overflow:hidden}"
          + ".pd.lit{background:var(--k-accent);color:var(--k-ink);transform:scale(.97)}",
        js: "var L=" + JSON.stringify(d.ふだ) + ";\nvar pads=[],seq=[],at=0,lock=1;\n"
          + "var bd=K.$('#kBoard');L.forEach(function(t,i){var e=document.createElement('button');e.className='pd';e.textContent=t;\n"
          + "  e.onclick=function(){tap(i);};bd.appendChild(e);pads.push(e);});\n"
          + "function lit(i,ms){pads[i].classList.add('lit');setTimeout(function(){pads[i].classList.remove('lit');},ms||300);}\n"
          + "function play(){lock=1;K.$('#kM').textContent='見る';var n=0;\n"
          + "  var t=setInterval(function(){if(n>=seq.length){clearInterval(t);lock=0;at=0;K.$('#kM').textContent='どうぞ';return;}\n"
          + "    lit(seq[n],320);n++;},520);}\n"
          + "function tap(i){if(lock)return;lit(i,180);\n"
          + "  if(seq[at]!==i){lock=1;K.$('#kM').textContent='ちがった';K.$('#kGo').textContent='もう一度';return;}\n"
          + "  at++;if(at>=seq.length){K.$('#kS').textContent=seq.length+' 段';setTimeout(next,520);}}\n"
          + "function next(){seq.push((Math.random()*pads.length)|0);play();}\n"
          + "K.$('#kGo').onclick=function(){seq=[];at=0;K.$('#kS').textContent='0 段';K.$('#kGo').textContent='やりなおす';next();};"
      };
    }
  };

  /* ══ ⑪ sortorder — ならべかえ ═════════════════════════════════ */
  芯.sortorder = {
    名: "ならべかえ", 分類: "あそび",
    語: ["並べ替え", "順番", "順序", "ならべる", "時系列", "sort", "手順", "工程", "年代順"],
    説明: "ばらばらの ものを 正しい 順に ならべる。押した 順に 入る。",
    スロット: [題, 副,
      { 鍵: "正しい順", 型: "並び", 最大: 24, 上限: 80, 既定: ["たまごを わる", "かきまぜる", "焼く", "皿に のせる"],
        説: "**正しい順** に 並べて 入れる。画面では 混ぜて 出す" },
      { 鍵: "ヒント", 型: "文", 既定: "", 上限: 120 }
    ],
    例: { 題: "手順を ならべる", 正しい順: ["種をまく", "水をやる", "芽が出る", "花が咲く"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0/" + d.正しい順.length], ["kM", ""]]),
        中: '<div class="k-card"><div class="k-note" id="kHint"></div><div id="kSlot" class="k-gr"></div></div>'
          + '<div id="kPool" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kCheck">たしかめる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kSlot,#kPool{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}"
          + "#kSlot{min-height:46px;margin-top:6px}"
          + ".it{min-height:46px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;font-weight:600;word-break:break-word}"
          + ".it.in{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".it.o{background:var(--k-good);color:#fff;border-color:transparent}"
          + ".it.x{background:var(--k-bad);color:#fff;border-color:transparent}",
        js: "var ANS=" + JSON.stringify(d.正しい順) + ",HINT=" + JSON.stringify(d.ヒント) + ";\nvar put=[];\n"
          + "K.$('#kHint').textContent=HINT||'正しいと 思う 順に おしてください';\n"
          + "function reset(){put=[];var p=K.$('#kPool');p.innerHTML='';K.$('#kSlot').innerHTML='';\n"
          + "  K.$('#kM').textContent='';K.$('#kS').textContent='0/'+ANS.length;\n"
          + "  K.shuffle(ANS.slice()).forEach(function(t){var b=document.createElement('button');b.className='it';b.textContent=t;\n"
          + "    b.onclick=function(){if(b.dataset.used)return;b.dataset.used='1';b.classList.add('in');put.push(t);slot();};p.appendChild(b);});}\n"
          + "function slot(){var s=K.$('#kSlot');s.innerHTML='';put.forEach(function(t,i){var e=document.createElement('div');\n"
          + "  e.className='it in';e.textContent=(i+1)+'. '+t;s.appendChild(e);});K.$('#kS').textContent=put.length+'/'+ANS.length;}\n"
          + "K.$('#kCheck').onclick=function(){var n=0;var s=K.$('#kSlot');s.innerHTML='';\n"
          + "  put.forEach(function(t,i){var ok=ANS[i]===t;if(ok)n++;var e=document.createElement('div');\n"
          + "    e.className='it '+(ok?'o':'x');e.textContent=(i+1)+'. '+t;s.appendChild(e);});\n"
          + "  K.$('#kM').textContent=n+' / '+ANS.length+' 正しい';};\n"
          + "K.$('#kGo').onclick=reset;reset();"
      };
    }
  };

  /* ══ ⑫ hangman — 文字あて ═══════════════════════════════════ */
  芯.hangman = {
    名: "文字あて", 分類: "あそび",
    語: ["文字当て", "hangman", "スペル", "1 文字ずつ", "あてる", "つづり", "虫食い"],
    説明: "隠れた 言葉を 1 文字ずつ あてる。まちがえられるのは 決まった 回数まで。",
    スロット: [題, 副,
      { 鍵: "言葉", 型: "表", 必須: ["語"], 最大: 60, 形: { 語: "文", ヒント: "文" },
        説: "1 問 ＝ {語, ヒント}", 既定: [{ 語: "apple", ヒント: "赤い くだもの" }] },
      { 鍵: "まちがえてよい回数", 型: "数", 既定: 6, 最小: 2, 最大: 12 }
    ],
    例: { 題: "英単語 あてゲーム", 言葉: [{ 語: "science", ヒント: "理科" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kL", ""]]),
        中: '<div class="k-center"><div id="kWord"></div><div class="k-note" id="kHint"></div></div><div id="kKeys" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kNext">つぎへ</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kWord{font-size:clamp(24px,6.5vw,46px);font-weight:800;letter-spacing:.14em;word-break:break-all}"
          + "#kKeys{grid-template-columns:repeat(auto-fit,minmax(40px,1fr))}"
          + "#kKeys .k-btn{min-height:40px;padding:0 4px}"
          + "#kKeys .k-btn.used{opacity:.3}",
        js: "var W=" + JSON.stringify(d.言葉) + ",MISS=" + d.まちがえてよい回数 + ";\n"
          + "var i=0,used={},bad=0,done=0;\n"
          + "function cur(){return W[i]||{語:'',ヒント:''};}\n"
          + "function letters(){var s=cur().語.toLowerCase();var out=[];\n"
          + "  for(var n=0;n<s.length;n++){var c=s[n];if(c!==' '&&out.indexOf(c)<0)out.push(c);}\n"
          + "  var az='abcdefghijklmnopqrstuvwxyz'.split('');\n"
          + "  return out.every(function(c){return az.indexOf(c)>=0;})?az:K.shuffle(out.concat(out.slice(0,Math.min(8,out.length))).filter(function(v,n,a){return a.indexOf(v)===n;}));}\n"
          + "function draw(){used={};bad=0;done=0;K.$('#kQ').textContent=(i+1)+'/'+W.length;\n"
          + "  K.$('#kHint').textContent=cur().ヒント||'';show();\n"
          + "  var kb=K.$('#kKeys');kb.innerHTML='';letters().forEach(function(c){var b=document.createElement('button');\n"
          + "    b.className='k-btn';b.textContent=c;b.onclick=function(){hit(c,b);};kb.appendChild(b);});}\n"
          + "function show(){var s=cur().語;var h='';for(var n=0;n<s.length;n++){var c=s[n];\n"
          + "  h+=(c===' ')?'  ':(used[c.toLowerCase()]?K.esc(c):'_');}\n"
          + "  K.$('#kWord').textContent=h;K.$('#kL').textContent='のこり '+(MISS-bad);}\n"
          + "function hit(c,b){if(done||used[c])return;used[c]=1;b.classList.add('used');\n"
          + "  if(cur().語.toLowerCase().indexOf(c)<0){bad++;b.style.opacity='.25';}\n"
          + "  show();\n"
          + "  var all=cur().語.toLowerCase().split('').every(function(x){return x===' '||used[x];});\n"
          + "  if(all){done=1;K.$('#kL').textContent='せいかい';}\n"
          + "  else if(bad>=MISS){done=1;K.$('#kWord').textContent=cur().語;K.$('#kL').textContent='おわり';}}\n"
          + "K.$('#kNext').onclick=function(){i++;if(i>=W.length){i=0;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;draw();};draw();"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);


/* ───────── /core/kata/learn.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/kata/learn.js — 型の 芯（まなび）6 種
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});
  var 題 = { 鍵: "題", 型: "文", 既定: "まなぶ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };
  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══ ⑬ drill — 計算ドリル ═══════════════════════════════════════ */
  芯.drill = {
    名: "計算ドリル", 分類: "まなび",
    語: ["計算", "ドリル", "算数", "足し算", "引き算", "かけ算", "わり算", "暗算", "数学", "練習", "九九", "けいさん", "百ます"],
    説明: "その場で 問題を 作って 出す。答えを 打ち込む。何問 正解したかが 出る。",
    スロット: [題, 副,
      { 鍵: "やりかた", 型: "選", 候補: ["たす", "ひく", "かける", "わる", "まぜる"], 既定: "まぜる" },
      { 鍵: "上のかず", 型: "数", 既定: 20, 最小: 2, 最大: 999, 説: "使う数の いちばん大きいところ" },
      { 鍵: "問数", 型: "数", 既定: 20, 最小: 3, 最大: 100 }
    ],
    例: { 題: "九九の れんしゅう", やりかた: "かける", 上のかず: 9, 問数: 20 },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.問数], ["kS", "0 問 正解"]]),
        中: '<div class="k-center"><div id="kEx"></div>'
          + '<input class="k-in" id="kIn" inputmode="numeric" autocomplete="off" placeholder="こたえ" style="max-width:220px;text-align:center;font-size:calc(var(--k-fs) + 6px)">'
          + '<div class="k-note" id="kMsg">Enter で つぎへ</div></div>',
        手: '<button class="k-btn pri" id="kOk">こたえる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kEx{font-size:clamp(30px,8vw,58px);font-weight:800;letter-spacing:.02em}",
        js: "var OP=" + JSON.stringify(d.やりかた) + ",MAX=" + d.上のかず + ",N=" + d.問数 + ";\n"
          + "var i=0,sc=0,cur=null,done=0;\n"
          + "function make(){var ops=OP==='まぜる'?['たす','ひく','かける','わる']:[OP];\n"
          + "  var o=ops[(Math.random()*ops.length)|0];\n"
          + "  var a=1+((Math.random()*MAX)|0),b=1+((Math.random()*MAX)|0);\n"
          + "  if(o==='ひく'&&b>a){var t=a;a=b;b=t;}\n"
          + "  if(o==='わる'){b=Math.max(1,b);a=b*(1+((Math.random()*Math.max(1,Math.floor(MAX/b)))|0));}\n"
          + "  var s=o==='たす'?'+':o==='ひく'?'−':o==='かける'?'×':'÷';\n"
          + "  var v=o==='たす'?a+b:o==='ひく'?a-b:o==='かける'?a*b:a/b;\n"
          + "  return {t:a+' '+s+' '+b,v:v};}\n"
          + "function draw(){done=0;cur=make();K.$('#kEx').textContent=cur.t;K.$('#kIn').value='';\n"
          + "  K.$('#kQ').textContent=(i+1)+'/'+N;K.$('#kMsg').textContent='Enter で つぎへ';K.$('#kIn').focus();}\n"
          + "function ans(){if(done){i++;if(i>=N){fin();return;}draw();return;}\n"
          + "  done=1;var v=Number(K.$('#kIn').value);var ok=v===cur.v;if(ok)sc++;\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  K.$('#kMsg').innerHTML=ok?'<b class=\"k-good\">せいかい</b>':'<b class=\"k-bad\">こたえ '+cur.v+'</b>';}\n"
          + "function fin(){K.$('#kEx').innerHTML='<span class=\"k-big\">'+sc+' / '+N+'</span>';\n"
          + "  K.$('#kIn').classList.add('k-hide');K.$('#kMsg').textContent='おつかれさま';}\n"
          + "K.$('#kOk').onclick=ans;\n"
          + "K.$('#kIn').addEventListener('keydown',function(e){if(e.key==='Enter')ans();});\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';K.$('#kIn').classList.remove('k-hide');draw();};\n"
          + "draw();"
      };
    }
  };

  /* ══ ⑭ matchline — 線つなぎ ═══════════════════════════════════ */
  芯.matchline = {
    名: "線つなぎ", 分類: "まなび",
    語: ["線つなぎ", "線でつなぐ", "対応", "結ぶ", "マッチング", "左右", "match", "組にする", "つなげる", "意味をつなぐ"],
    説明: "左と 右を 1 つずつ 選んで つなぐ。合っていれば 消える。",
    スロット: [題, 副,
      { 鍵: "対", 型: "表", 必須: ["左", "右"], 最大: 20, 形: { 左: "文", 右: "文" },
        説: "1 組 ＝ {左, 右}",
        既定: [{ 左: "光合成", 右: "植物が 養分を 作る" }, { 左: "蒸散", 右: "葉から 水が 出る" }] }
    ],
    例: { 題: "用語と 意味を つなぐ", 対: [{ 左: "還元", 右: "酸素を うばう" }] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/" + d.対.length], ["kM", ""]]),
        中: '<div id="kWrap"><div id="kL" class="col"></div><div id="kR" class="col"></div></div>',
        手: '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kWrap{display:flex;gap:var(--k-gap);align-items:flex-start}"
          + "#kWrap .col{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--k-gap) * .6)}"
          + ".mi{min-height:48px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;word-break:break-word;font-weight:600}"
          + ".mi.sel{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".mi.got{background:var(--k-good);color:#fff;border-color:transparent;pointer-events:none}"
          + ".mi.ng{background:var(--k-bad);color:#fff;border-color:transparent}",
        js: "var P=" + JSON.stringify(d.対) + ";\nvar sel=null,got=0;\n"
          + "function build(){got=0;sel=null;K.$('#kM').textContent='';K.$('#kP').textContent='0/'+P.length;\n"
          + "  var L=K.$('#kL'),R=K.$('#kR');L.innerHTML='';R.innerHTML='';\n"
          + "  K.shuffle(P.map(function(p,i){return {i:i,t:p.左};})).forEach(function(o){L.appendChild(item(o,'L'));});\n"
          + "  K.shuffle(P.map(function(p,i){return {i:i,t:p.右};})).forEach(function(o){R.appendChild(item(o,'R'));});}\n"
          + "function item(o,side){var b=document.createElement('button');b.className='mi';b.textContent=o.t;\n"
          + "  b.dataset.i=o.i;b.dataset.s=side;b.onclick=function(){tap(b);};return b;}\n"
          + "function tap(b){if(!sel){sel=b;b.classList.add('sel');return;}\n"
          + "  if(sel===b){sel.classList.remove('sel');sel=null;return;}\n"
          + "  if(sel.dataset.s===b.dataset.s){sel.classList.remove('sel');sel=b;b.classList.add('sel');return;}\n"
          + "  var a=sel;sel=null;a.classList.remove('sel');\n"
          + "  if(a.dataset.i===b.dataset.i){a.classList.add('got');b.classList.add('got');got++;\n"
          + "    K.$('#kP').textContent=got+'/'+P.length;\n"
          + "    if(got===P.length)K.$('#kM').textContent='ぜんぶ そろった';return;}\n"
          + "  a.classList.add('ng');b.classList.add('ng');\n"
          + "  setTimeout(function(){a.classList.remove('ng');b.classList.remove('ng');},520);}\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑮ fillblank — 穴うめ ═══════════════════════════════════ */
  芯.fillblank = {
    名: "穴うめ", 分類: "まなび",
    語: ["穴埋め", "空欄", "虫食い", "書き込む", "fill", "補う", "文中", "入れる"],
    説明: "文の 空いた所に 言葉を 入れる。打ち込みでも、選ぶ形でも 出せる。",
    スロット: [題, 副,
      { 鍵: "問題", 型: "表", 必須: ["文", "答"], 最大: 60, 形: { 文: "文", 答: "文", 選択肢: "並び", 解説: "文" },
        説: "文の 空けたい所に ＿＿ と 書く。答が その中身",
        既定: [{ 文: "水は ＿＿ ℃ で 沸とうする。", 答: "100", 選択肢: [], 解説: "1 気圧のとき。" }] }
    ],
    例: { 題: "歴史 穴うめ", 問題: [{ 文: "1868 年に ＿＿ が 始まった。", 答: "明治維新" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.問題.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-card"><div id="kSent"></div></div>'
          + '<div id="kPick" class="k-gr" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))"></div>'
          + '<div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn pri" id="kOk">たしかめる</button><button class="k-btn" id="kNext">つぎへ</button>'
          + '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kSent{font-size:calc(var(--k-fs) + 3px);line-height:2.1;word-break:break-word}"
          + "#kSent input{display:inline-block;width:min(190px,52vw);min-height:38px;padding:2px 10px;margin:0 4px;"
          + "border-radius:8px;border:1px solid var(--k-line);background:var(--k-bg);text-align:center;font-weight:700}"
          + "#kSent .fx{padding:2px 10px;border-radius:8px;font-weight:700}"
          + "#kSent .fx.o{background:var(--k-good);color:#fff}#kSent .fx.x{background:var(--k-bad);color:#fff}",
        js: "var Q=" + JSON.stringify(d.問題) + ";\nvar i=0,sc=0,done=0;\n"
          + "function draw(){done=0;var q=Q[i];K.$('#kQ').textContent=(i+1)+'/'+Q.length;\n"
          + "  var parts=String(q.文).split(/＿＿+|_{2,}/);\n"
          + "  if(parts.length<2)parts=[String(q.文)+' ',''];\n"
          + "  K.$('#kSent').innerHTML=K.esc(parts[0])+'<input id=\"kBlank\" autocomplete=\"off\">'+K.esc(parts.slice(1).join(' '));\n"
          + "  K.$('#kExp').classList.add('k-hide');\n"
          + "  var p=K.$('#kPick');p.innerHTML='';\n"
          + "  if((q.選択肢||[]).length){K.shuffle(q.選択肢.slice()).forEach(function(t){var b=document.createElement('button');\n"
          + "    b.className='k-btn';b.textContent=t;b.onclick=function(){K.$('#kBlank').value=t;};p.appendChild(b);});}\n"
          + "  K.$('#kBlank').addEventListener('keydown',function(e){if(e.key==='Enter')check();});\n"
          + "  K.$('#kBlank').focus();}\n"
          + "function check(){if(done)return;done=1;var q=Q[i];var v=String(K.$('#kBlank').value||'').trim();\n"
          + "  var ok=v.toLowerCase()===String(q.答).trim().toLowerCase();if(ok)sc++;\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  var parts=String(q.文).split(/＿＿+|_{2,}/);if(parts.length<2)parts=[String(q.文)+' ',''];\n"
          + "  K.$('#kSent').innerHTML=K.esc(parts[0])+'<span class=\"fx '+(ok?'o':'x')+'\">'+K.esc(ok?v:q.答)+'</span>'+K.esc(parts.slice(1).join(' '));\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b>'+(ok?'せいかい':'こたえ: '+K.esc(q.答))+'</b>'+(q.解説?'<div class=\"k-note\" style=\"margin-top:6px\">'+K.esc(q.解説)+'</div>':'');}\n"
          + "K.$('#kOk').onclick=check;\n"
          + "K.$('#kNext').onclick=function(){if(!done){check();return;}i++;\n"
          + "  if(i>=Q.length){K.$('#kSent').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+sc+' / '+Q.length+'</div></div>';\n"
          + "    K.$('#kPick').innerHTML='';K.$('#kExp').classList.add('k-hide');return;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';draw();};draw();"
      };
    }
  };

  /* ══ ⑯ sortcat — しわけ ═══════════════════════════════════════ */
  芯.sortcat = {
    名: "しわけ", 分類: "まなび",
    語: ["仕分け", "分類", "グループ", "分ける", "カテゴリ", "sort", "属する", "どっち", "振り分け"],
    説明: "出てくる ものを 決められた 箱へ 分ける。合っていれば 箱に たまる。",
    スロット: [題, 副,
      { 鍵: "箱", 型: "並び", 最大: 6, 上限: 24, 既定: ["動物", "植物"], 説: "分け先の 名前（2〜6 個）" },
      { 鍵: "品", 型: "表", 必須: ["名", "箱"], 最大: 80, 形: { 名: "文", 箱: "文" },
        説: "1 つ ＝ {名, 箱}。箱は 上の 並びの どれかと 同じ 文字にする",
        既定: [{ 名: "いぬ", 箱: "動物" }, { 名: "さくら", 箱: "植物" }, { 名: "ねこ", 箱: "動物" }, { 名: "すぎ", 箱: "植物" }] }
    ],
    例: { 題: "生きもの しわけ", 箱: ["こん虫", "ほ乳類"], 品: [{ 名: "カブトムシ", 箱: "こん虫" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "0/" + d.品.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-center" id="kNow"></div><div id="kBox" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kNow{font-size:clamp(22px,5.5vw,38px);font-weight:800;min-height:1.4em;text-align:center;word-break:break-word}"
          + "#kBox{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}"
          + ".bx{min-height:80px;border-radius:var(--k-r);border:2px dashed var(--k-line);background:var(--k-surface);"
          + "padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:700}"
          + ".bx .n{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub);font-weight:600}"
          + ".bx.o{border-color:var(--k-good)}.bx.x{border-color:var(--k-bad)}",
        js: "var BX=" + JSON.stringify(d.箱) + ",IT=" + JSON.stringify(d.品) + ";\n"
          + "var q=[],i=0,sc=0,cnt={};\n"
          + "function build(){q=K.shuffle(IT.slice());i=0;sc=0;cnt={};\n"
          + "  var b=K.$('#kBox');b.innerHTML='';BX.forEach(function(t){cnt[t]=0;\n"
          + "    var e=document.createElement('button');e.className='bx';e.dataset.t=t;\n"
          + "    e.innerHTML='<span>'+K.esc(t)+'</span><span class=\"n\">0</span>';\n"
          + "    e.onclick=function(){pick(e,t);};b.appendChild(e);});\n"
          + "  K.$('#kS').textContent='0 問 正解';draw();}\n"
          + "function draw(){K.$('#kQ').textContent=i+'/'+q.length;\n"
          + "  K.$('#kNow').textContent=i<q.length?q[i].名:'おわり';}\n"
          + "function pick(e,t){if(i>=q.length)return;var ok=q[i].箱===t;if(ok)sc++;\n"
          + "  cnt[t]++;e.querySelector('.n').textContent=cnt[t];\n"
          + "  e.classList.add(ok?'o':'x');setTimeout(function(){e.classList.remove('o','x');},380);\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';i++;\n"
          + "  if(i>=q.length){K.$('#kNow').innerHTML='<span class=\"k-big\">'+sc+' / '+q.length+'</span>';\n"
          + "    K.$('#kQ').textContent=q.length+'/'+q.length;return;}draw();}\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑰ timeline — 年表ならべ ═══════════════════════════════════ */
  芯.timeline = {
    名: "年表ならべ", 分類: "まなび",
    語: ["年表", "歴史", "年代", "順番", "いつ", "timeline", "出来事", "古い順", "時代"],
    説明: "出来事を 古い順に ならべる。答え合わせで 年も 出す。",
    スロット: [題, 副,
      { 鍵: "出来事", 型: "表", 必須: ["名"], 最大: 24, 形: { 名: "文", 年: "数", 説明: "文" },
        説: "1 件 ＝ {名, 年, 説明}。年は 数字（西暦）",
        既定: [{ 名: "大化の改新", 年: 645 }, { 名: "鎌倉幕府", 年: 1192 }, { 名: "明治維新", 年: 1868 }] }
    ],
    例: { 題: "日本史の 流れ", 出来事: [{ 名: "応仁の乱", 年: 1467, 説明: "京都が 焼けた" }] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/" + d.出来事.length], ["kM", ""]]),
        中: '<div id="kLine" class="k-gr"></div><div id="kPool" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kOk">たしかめる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kLine,#kPool{grid-template-columns:1fr}"
          + "#kLine{border-left:3px solid var(--k-line);padding-left:12px;min-height:44px}"
          + ".ev{min-height:46px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;font-weight:600;word-break:break-word}"
          + ".ev .y{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub);font-weight:600;margin-left:8px}"
          + ".ev.in{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".ev.in .y{color:var(--k-ink);opacity:.8}"
          + ".ev.o{background:var(--k-good);color:#fff;border-color:transparent}"
          + ".ev.x{background:var(--k-bad);color:#fff;border-color:transparent}"
          + ".ev.o .y,.ev.x .y{color:#fff;opacity:.85}",
        js: "var EV=" + JSON.stringify(d.出来事) + ";\n"
          + "var ANS=EV.slice().sort(function(a,b){return (a.年||0)-(b.年||0);});\nvar put=[];\n"
          + "function build(){put=[];K.$('#kLine').innerHTML='';K.$('#kM').textContent='';\n"
          + "  K.$('#kP').textContent='0/'+EV.length;var p=K.$('#kPool');p.innerHTML='';\n"
          + "  K.shuffle(EV.slice()).forEach(function(e){var b=document.createElement('button');b.className='ev';\n"
          + "    b.textContent=e.名;b.onclick=function(){if(b.dataset.u)return;b.dataset.u='1';b.classList.add('in');\n"
          + "      put.push(e);line();};p.appendChild(b);});}\n"
          + "function line(){var L=K.$('#kLine');L.innerHTML='';\n"
          + "  put.forEach(function(e,i){var d2=document.createElement('div');d2.className='ev in';\n"
          + "    d2.innerHTML=(i+1)+'. '+K.esc(e.名);L.appendChild(d2);});\n"
          + "  K.$('#kP').textContent=put.length+'/'+EV.length;}\n"
          + "K.$('#kOk').onclick=function(){var n=0;var L=K.$('#kLine');L.innerHTML='';\n"
          + "  put.forEach(function(e,i){var ok=ANS[i]&&ANS[i].名===e.名;if(ok)n++;\n"
          + "    var d2=document.createElement('div');d2.className='ev '+(ok?'o':'x');\n"
          + "    d2.innerHTML=(i+1)+'. '+K.esc(e.名)+'<span class=\"y\">'+(e.年||'')+(e.説明?' ・ '+K.esc(e.説明):'')+'</span>';\n"
          + "    L.appendChild(d2);});\n"
          + "  K.$('#kM').textContent=n+' / '+EV.length+' 正しい';};\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑱ dictation — 聞きとり ═══════════════════════════════════ */
  芯.dictation = {
    名: "聞きとり", 分類: "まなび",
    語: ["聞き取り", "リスニング", "ディクテーション", "読み上げ", "音", "listening", "書き取り", "発音"],
    説明: "読み上げを 聞いて 書き取る。何度でも 聞き直せる。",
    スロット: [題, 副,
      { 鍵: "文", 型: "表", 必須: ["文"], 最大: 60, 形: { 文: "文", 訳: "文" },
        説: "1 問 ＝ {文, 訳}。文が 読み上げられる",
        既定: [{ 文: "I go to school every day.", 訳: "私は 毎日 学校へ 行く。" }] },
      { 鍵: "ことば", 型: "選", 候補: ["英語", "日本語"], 既定: "英語", 説: "読み上げる ことば" },
      { 鍵: "はやさ", 型: "数", 既定: 90, 最小: 50, 最大: 150, 説: "読む 速さ（100 が ふつう）" }
    ],
    例: { 題: "英文 聞き取り", 文: [{ 文: "She lives in Osaka.", 訳: "彼女は 大阪に 住んでいる。" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.文.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-center"><button class="k-btn pri" id="kPlay" style="min-height:64px;min-width:180px;font-size:calc(var(--k-fs) + 3px)">きく</button>'
          + '<input class="k-in" id="kIn" autocomplete="off" placeholder="聞こえたとおりに 書く" style="max-width:520px">'
          + '<div class="k-note" id="kMsg"></div></div><div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn" id="kOk">たしかめる</button><button class="k-btn" id="kNext">つぎへ</button>'
          + '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kExp b{font-size:calc(var(--k-fs) + 2px)}",
        js: "var S=" + JSON.stringify(d.文) + ",LANG=" + JSON.stringify(d.ことば === "英語" ? "en-US" : "ja-JP")
          + ",RATE=" + (d.はやさ / 100) + ";\nvar i=0,sc=0,done=0;\n"
          + "function say(){var t=(S[i]||{}).文||'';\n"
          + "  try{var u=new SpeechSynthesisUtterance(t);u.lang=LANG;u.rate=RATE;\n"
          + "    speechSynthesis.cancel();speechSynthesis.speak(u);K.$('#kMsg').textContent='';}\n"
          + "  catch(e){K.$('#kMsg').textContent='この端末では 読み上げられません。下に 文を 出します。';\n"
          + "    K.$('#kExp').classList.remove('k-hide');K.$('#kExp').innerHTML='<b>'+K.esc(t)+'</b>';}}\n"
          + "function draw(){done=0;K.$('#kQ').textContent=(i+1)+'/'+S.length;K.$('#kIn').value='';\n"
          + "  K.$('#kExp').classList.add('k-hide');K.$('#kMsg').textContent='';K.$('#kIn').focus();say();}\n"
          + "function norm(s){return String(s||'').toLowerCase().replace(/[.,!?;:\\u3001\\u3002]/g,'').replace(/\\s+/g,' ').trim();}\n"
          + "function check(){if(done)return;done=1;var q=S[i]||{文:''};\n"
          + "  var ok=norm(K.$('#kIn').value)===norm(q.文);if(ok)sc++;K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b class=\"'+(ok?'k-good':'k-bad')+'\">'+(ok?'せいかい':'ほんとうは')+'</b>'\n"
          + "    +'<div style=\"margin-top:6px\">'+K.esc(q.文)+'</div>'\n"
          + "    +(q.訳?'<div class=\"k-note\" style=\"margin-top:4px\">'+K.esc(q.訳)+'</div>':'');}\n"
          + "K.$('#kPlay').onclick=say;K.$('#kOk').onclick=check;\n"
          + "K.$('#kIn').addEventListener('keydown',function(e){if(e.key==='Enter')check();});\n"
          + "K.$('#kNext').onclick=function(){if(!done){check();return;}i++;\n"
          + "  if(i>=S.length){K.$('#kMsg').innerHTML='<span class=\"k-big\">'+sc+' / '+S.length+'</span>';return;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';draw();};\n"
          + "K.$('#kQ').textContent='1/'+S.length;"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);


/* ───────── /core/kata/tool.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/kata/tool.js — 型の 芯（どうぐ）6 種
   どれも **保存が 効く**（K.save / K.load が 本体の 溜めへ 預ける）。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});
  var 題 = { 鍵: "題", 型: "文", 既定: "どうぐ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };
  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══ ⑲ checklist — やることリスト ═══════════════════════════════ */
  芯.checklist = {
    名: "やることリスト", 分類: "どうぐ",
    語: ["チェックリスト", "やること", "todo", "持ち物", "手順", "確認", "リスト", "タスク", "点検"],
    説明: "項目に チェックを 入れていく。足す・消す・並べ替えも できる。閉じても 残る。",
    スロット: [題, 副,
      { 鍵: "項目", 型: "並び", 最大: 100, 上限: 100, 既定: ["教科書", "ノート", "筆記用具"], 説: "はじめから 入れておく 項目" },
      { 鍵: "足せる", 型: "真偽", 既定: true, 説: "使う人が 項目を 足せるように するか" }
    ],
    例: { 題: "遠足の 持ち物", 項目: ["水とう", "おべんとう", "しおり"] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/0"]]),
        中: '<div class="k-bar"><i id="kBar" style="width:0%"></i></div><div id="kList" class="k-gr"></div>',
        手: (d.足せる
          ? '<input class="k-in" id="kNew" placeholder="足したいことを 書く" style="flex:1;min-width:160px">'
            + '<button class="k-btn pri" id="kAdd">足す</button>' : "")
          + '<button class="k-btn ghost" id="kClear">ぜんぶ はずす</button>',
        css: "#kList{grid-template-columns:1fr}"
          + ".ck{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:calc(var(--k-r) - 4px);"
          + "background:var(--k-surface);border:1px solid var(--k-line);text-align:left;width:100%}"
          + ".ck .bx{width:24px;height:24px;flex:0 0 auto;border-radius:7px;border:2px solid var(--k-line);"
          + "display:flex;align-items:center;justify-content:center;font-weight:900;color:transparent;font-size:15px}"
          + ".ck.on .bx{background:var(--k-good);border-color:transparent;color:#fff}"
          + ".ck .t{flex:1;min-width:0;line-height:1.45;word-break:break-word}"
          + ".ck.on .t{opacity:.5;text-decoration:line-through}"
          + ".ck .rm{flex:0 0 auto;opacity:.45;padding:2px 8px;border-radius:6px}",
        js: "var INIT=" + JSON.stringify(d.項目) + ",ADD=" + (d.足せる ? "1" : "0") + ";\n"
          + "var L=K.load('list',null)||INIT.map(function(t){return {t:t,on:0};});\n"
          + "function save(){K.save('list',L);}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';var n=0;\n"
          + "  L.forEach(function(it,i){if(it.on)n++;var b=document.createElement('div');b.className='ck'+(it.on?' on':'');\n"
          + "    b.innerHTML='<button class=\"bx\">✓</button><span class=\"t\"></span><button class=\"rm\">✕</button>';\n"
          + "    b.querySelector('.t').textContent=it.t;\n"
          + "    b.querySelector('.bx').onclick=function(){it.on=it.on?0:1;save();draw();};\n"
          + "    b.querySelector('.rm').onclick=function(){L.splice(i,1);save();draw();};\n"
          + "    el.appendChild(b);});\n"
          + "  K.$('#kP').textContent=n+'/'+L.length;\n"
          + "  K.$('#kBar').style.width=(L.length?Math.round(n/L.length*100):0)+'%';}\n"
          + "if(ADD){K.$('#kAdd').onclick=function(){var v=String(K.$('#kNew').value||'').trim();if(!v)return;\n"
          + "  L.push({t:v,on:0});K.$('#kNew').value='';save();draw();};\n"
          + "  K.$('#kNew').addEventListener('keydown',function(e){if(e.key==='Enter')K.$('#kAdd').click();});}\n"
          + "K.$('#kClear').onclick=function(){L.forEach(function(x){x.on=0;});save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ⑳ pomodoro — 集中タイマー ═════════════════════════════════ */
  芯.pomodoro = {
    名: "集中タイマー", 分類: "どうぐ",
    語: ["タイマー", "ポモドーロ", "集中", "休憩", "時間", "timer", "計る", "25分", "勉強時間"],
    説明: "決めた 時間 集中して、決めた 時間 休む。何回 まわったかも 数える。",
    スロット: [題, 副,
      { 鍵: "集中分", 型: "数", 既定: 25, 最小: 1, 最大: 120 },
      { 鍵: "休み分", 型: "数", 既定: 5, 最小: 1, 最大: 60 },
      { 鍵: "音", 型: "真偽", 既定: true, 説: "切り替わるときに 音を 鳴らすか" }
    ],
    例: { 題: "数学に 集中", 集中分: 25, 休み分: 5 },
    作る: function (d) {
      return {
        帯: 帯([["kR", "0 回"], ["kW", "集中"]]),
        中: '<div class="k-center"><div id="kT" class="k-big" style="font-size:clamp(48px,17vw,120px);font-variant-numeric:tabular-nums">25:00</div>'
          + '<div class="k-bar" style="width:min(420px,86%)"><i id="kBar" style="width:0%"></i></div>'
          + '<div class="k-note" id="kMsg">はじめる を おす</div></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><button class="k-btn" id="kSkip">つぎへ</button>'
          + '<button class="k-btn ghost" id="kReset">もどす</button>',
        css: "",
        js: "var W=" + d.集中分 + "*60,B=" + d.休み分 + "*60,SND=" + (d.音 ? "1" : "0") + ";\n"
          + "var work=1,left=W,run=0,tid=0,round=K.load('round',0)||0;\n"
          + "K.$('#kR').textContent=round+' 回';\n"
          + "function fmt(s){var m=Math.floor(s/60),x=s%60;return m+':'+(x<10?'0':'')+x;}\n"
          + "function draw(){K.$('#kT').textContent=fmt(Math.max(0,left));\n"
          + "  K.$('#kW').textContent=work?'集中':'休み';var all=work?W:B;\n"
          + "  K.$('#kBar').style.width=Math.round((1-left/all)*100)+'%';}\n"
          + "function tick(){left--;if(left<=0)flip();draw();}\n"
          + "function flip(){if(SND)K.beep(work?880:520);\n"
          + "  if(work){round++;K.save('round',round);K.$('#kR').textContent=round+' 回';}\n"
          + "  work=!work;left=work?W:B;K.$('#kMsg').textContent=work?'また 集中':'ひと休み';}\n"
          + "K.$('#kGo').onclick=function(){run=!run;clearInterval(tid);\n"
          + "  if(run){tid=setInterval(tick,1000);K.$('#kGo').textContent='とめる';K.$('#kMsg').textContent='';}\n"
          + "  else K.$('#kGo').textContent='つづける';};\n"
          + "K.$('#kSkip').onclick=function(){flip();draw();};\n"
          + "K.$('#kReset').onclick=function(){clearInterval(tid);run=0;work=1;left=W;\n"
          + "  K.$('#kGo').textContent='はじめる';K.$('#kMsg').textContent='はじめる を おす';draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉑ counter — かぞえる ═══════════════════════════════════ */
  芯.counter = {
    名: "かぞえる", 分類: "どうぐ",
    語: ["カウンター", "数える", "回数", "集計", "タリー", "counter", "記録", "何回", "点数板"],
    説明: "いくつでも 作れる 数とり。押すたび 増える。閉じても 残る。",
    スロット: [題, 副,
      { 鍵: "名前", 型: "並び", 最大: 12, 上限: 24, 既定: ["1組", "2組"], 説: "数える ものの 名前" },
      { 鍵: "きざみ", 型: "数", 既定: 1, 最小: 1, 最大: 100, 説: "1 回 押すと いくつ 増えるか" }
    ],
    例: { 題: "得点板", 名前: ["赤チーム", "白チーム"] },
    作る: function (d) {
      return {
        帯: 帯([["kSum", "合計 0"]]),
        中: '<div id="kList" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kReset">ぜんぶ 0 に</button>',
        css: "#kList{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}"
          + ".cn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--k-pad);"
          + "border-radius:var(--k-r);background:var(--k-surface);border:1px solid var(--k-line)}"
          + ".cn .nm{font-weight:700;text-align:center;word-break:break-word}"
          + ".cn .v{font-size:clamp(32px,8vw,54px);font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}"
          + ".cn .row{display:flex;gap:8px;width:100%}"
          + ".cn .row .k-btn{flex:1;min-height:46px;font-size:calc(var(--k-fs) + 3px)}",
        js: "var NM=" + JSON.stringify(d.名前) + ",ST=" + d.きざみ + ";\n"
          + "var V=K.load('v',null)||NM.map(function(){return 0;});\n"
          + "if(V.length!==NM.length)V=NM.map(function(_,i){return V[i]||0;});\n"
          + "function save(){K.save('v',V);}\n"
          + "function sum(){var s=0;V.forEach(function(x){s+=x;});K.$('#kSum').textContent='合計 '+s;}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';\n"
          + "  NM.forEach(function(n,i){var c=document.createElement('div');c.className='cn';\n"
          + "    c.innerHTML='<div class=\"nm\"></div><div class=\"v\"></div>"
          + "<div class=\"row\"><button class=\"k-btn\">−</button><button class=\"k-btn pri\">＋</button></div>';\n"
          + "    c.querySelector('.nm').textContent=n;c.querySelector('.v').textContent=V[i];\n"
          + "    var bs=c.querySelectorAll('.k-btn');\n"
          + "    bs[0].onclick=function(){V[i]-=ST;c.querySelector('.v').textContent=V[i];save();sum();};\n"
          + "    bs[1].onclick=function(){V[i]+=ST;c.querySelector('.v').textContent=V[i];save();sum();};\n"
          + "    el.appendChild(c);});sum();}\n"
          + "K.$('#kReset').onclick=function(){V=NM.map(function(){return 0;});save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉒ budget — かんたん出納 ═══════════════════════════════════ */
  芯.budget = {
    名: "かんたん出納", 分類: "どうぐ",
    語: ["家計", "お金", "出納", "支出", "収入", "予算", "budget", "つけ", "会計", "小遣い", "おこづかい", "おこづかいの記録", "こづかい帳"],
    説明: "入った お金と 出た お金を 足していく。のこりが すぐ 分かる。",
    スロット: [題, 副,
      { 鍵: "はじめの残り", 型: "数", 既定: 0, 最小: -9999999, 最大: 9999999 },
      { 鍵: "たんい", 型: "文", 既定: "円", 上限: 6 },
      { 鍵: "わけ", 型: "並び", 最大: 12, 上限: 16, 既定: ["食べもの", "本", "交通", "その他"], 説: "選べる 使いみち" }
    ],
    例: { 題: "8 月の おこづかい", はじめの残り: 5000, わけ: ["おやつ", "文具"] },
    作る: function (d) {
      return {
        帯: 帯([["kBal", "0"]]),
        中: '<div id="kList" class="k-gr"></div>',
        手: '<input class="k-in" id="kName" placeholder="なにに" style="flex:2;min-width:120px">'
          + '<input class="k-in" id="kAmt" inputmode="numeric" placeholder="いくら" style="flex:1;min-width:90px">'
          + '<select class="k-in" id="kCat" style="flex:1;min-width:110px"></select>'
          + '<button class="k-btn" id="kIn2">入った</button><button class="k-btn pri" id="kOut">出た</button>'
          + '<button class="k-btn ghost" id="kReset">まっさら</button>',
        css: "#kList{grid-template-columns:1fr}"
          + ".rw{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:calc(var(--k-r) - 4px);"
          + "background:var(--k-surface);border:1px solid var(--k-line)}"
          + ".rw .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
          + ".rw .ct{font-size:calc(var(--k-fs) - 4px);color:var(--k-sub);padding:2px 8px;border-radius:99px;background:var(--k-bg)}"
          + ".rw .am{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}"
          + ".rw .rm{opacity:.45;padding:2px 6px}",
        js: "var START=" + d.はじめの残り + ",UNIT=" + JSON.stringify(d.たんい) + ",CAT=" + JSON.stringify(d.わけ) + ";\n"
          + "var R=K.load('rows',null)||[];\n"
          + "var sel=K.$('#kCat');CAT.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});\n"
          + "function save(){K.save('rows',R);}\n"
          + "function yen(n){return (n<0?'−':'')+Math.abs(n).toLocaleString('ja-JP')+UNIT;}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';var bal=START;\n"
          + "  R.forEach(function(r,i){bal+=r.a;var d2=document.createElement('div');d2.className='rw';\n"
          + "    d2.innerHTML='<span class=\"nm\"></span><span class=\"ct\"></span><span class=\"am\"></span><button class=\"rm\">✕</button>';\n"
          + "    d2.querySelector('.nm').textContent=r.n;d2.querySelector('.ct').textContent=r.c||'';\n"
          + "    var am=d2.querySelector('.am');am.textContent=(r.a>0?'+':'')+yen(r.a);\n"
          + "    am.className='am '+(r.a>0?'k-good':'k-bad');\n"
          + "    d2.querySelector('.rm').onclick=function(){R.splice(i,1);save();draw();};el.appendChild(d2);});\n"
          + "  K.$('#kBal').textContent='のこり '+yen(bal);}\n"
          + "function add(sign){var n=String(K.$('#kName').value||'').trim()||'（なまえ なし）';\n"
          + "  var a=Math.abs(Number(K.$('#kAmt').value)||0);if(!a)return;\n"
          + "  R.unshift({n:n,a:sign*a,c:sel.value||''});K.$('#kName').value='';K.$('#kAmt').value='';save();draw();}\n"
          + "K.$('#kIn2').onclick=function(){add(1);};K.$('#kOut').onclick=function(){add(-1);};\n"
          + "K.$('#kAmt').addEventListener('keydown',function(e){if(e.key==='Enter')add(-1);});\n"
          + "K.$('#kReset').onclick=function(){R=[];save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉓ dice — さいころ・くじ ═══════════════════════════════════ */
  芯.dice = {
    名: "さいころ・くじ", 分類: "どうぐ",
    語: ["さいころ", "くじ", "ルーレット", "抽選", "ランダム", "dice", "当番", "決める", "順番決め", "あみだ"],
    説明: "並べたものから 1 つ 選ぶ。同じものを 続けて 出さない ようにも できる。",
    スロット: [題, 副,
      { 鍵: "候補", 型: "並び", 最大: 200, 上限: 40, 既定: ["1", "2", "3", "4", "5", "6"], 説: "選ばれる もの" },
      { 鍵: "重ねない", 型: "真偽", 既定: false, 説: "全部 出るまで 同じものを 出さないか" }
    ],
    例: { 題: "きょうの 当番", 候補: ["あさひ", "みなと", "ゆい"], 重ねない: true },
    作る: function (d) {
      return {
        帯: 帯([["kN", "0 回"], ["kL", ""]]),
        中: '<div class="k-center"><div id="kOut" class="k-big" style="font-size:clamp(36px,11vw,84px);word-break:break-word;text-align:center;min-height:1.2em">？</div>'
          + '<div class="k-note" id="kHist"></div></div>',
        手: '<button class="k-btn pri" id="kGo" style="min-height:56px;min-width:160px;font-size:calc(var(--k-fs) + 3px)">ひく</button>'
          + '<button class="k-btn ghost" id="kReset">もどす</button>',
        css: "#kOut.roll{opacity:.35}",
        js: "var C=" + JSON.stringify(d.候補) + ",UNIQ=" + (d.重ねない ? "1" : "0") + ";\n"
          + "var pool=C.slice(),n=0,hist=[],rolling=0;\n"
          + "function left(){K.$('#kL').textContent=UNIQ?('のこり '+pool.length):'';}\n"
          + "function go(){if(rolling)return;\n"
          + "  if(UNIQ&&!pool.length){K.$('#kOut').textContent='おわり';return;}\n"
          + "  rolling=1;K.$('#kOut').classList.add('roll');var t=0;\n"
          + "  var iv=setInterval(function(){K.$('#kOut').textContent=C[(Math.random()*C.length)|0];\n"
          + "    if(++t>8){clearInterval(iv);fin();}},60);}\n"
          + "function fin(){var v;\n"
          + "  if(UNIQ){var i=(Math.random()*pool.length)|0;v=pool[i];pool.splice(i,1);}\n"
          + "  else v=C[(Math.random()*C.length)|0];\n"
          + "  K.$('#kOut').classList.remove('roll');K.$('#kOut').textContent=v;\n"
          + "  n++;K.$('#kN').textContent=n+' 回';hist.unshift(v);hist=hist.slice(0,12);\n"
          + "  K.$('#kHist').textContent=hist.join(' ・ ');left();rolling=0;}\n"
          + "K.$('#kGo').onclick=go;\n"
          + "K.$('#kReset').onclick=function(){pool=C.slice();n=0;hist=[];K.$('#kN').textContent='0 回';\n"
          + "  K.$('#kHist').textContent='';K.$('#kOut').textContent='？';left();};left();"
      };
    }
  };

  /* ══ ㉔ draw — お絵かき ═══════════════════════════════════════ */
  芯.draw = {
    名: "お絵かき", 分類: "どうぐ",
    語: ["お絵かき", "描く", "落書き", "ホワイトボード", "図", "draw", "手書き", "スケッチ", "板書"],
    説明: "指や マウスで 描く。太さと 色を 変えられる。消しゴムと 全消しつき。",
    スロット: [題, 副,
      { 鍵: "背景", 型: "選", 候補: ["まっしろ", "方眼", "横線"], 既定: "まっしろ" },
      { 鍵: "はじめの太さ", 型: "数", 既定: 4, 最小: 1, 最大: 40 }
    ],
    例: { 題: "考えを 書く", 背景: "方眼" },
    作る: function (d) {
      return {
        帯: "",
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<div id="kPal" style="display:flex;gap:6px"></div>'
          + '<input type="range" id="kW" min="1" max="40" value="' + d.はじめの太さ + '" style="width:110px">'
          + '<button class="k-btn" id="kEr">消しゴム</button><button class="k-btn ghost" id="kClr">全部 消す</button>',
        css: "#kStage{flex:1;min-height:220px;border-radius:var(--k-r);overflow:hidden;background:#fff;border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%;cursor:crosshair}"
          + "#kPal button{width:30px;height:30px;border-radius:50%;border:2px solid transparent}"
          + "#kPal button.on{border-color:var(--k-text)}",
        js: "var BG=" + JSON.stringify(d.背景) + ",W0=" + d.はじめの太さ + ";\n"
          + "var cv=K.canvas(K.$('#kC'),1),cols=['#1E2430','#D14343','#2E9E6B','#2A5382','#C98A16','#9A2B52'];\n"
          + "var col=cols[0],wid=W0,er=0,down=0,last=null,strokes=[];\n"
          + "var pal=K.$('#kPal');cols.forEach(function(c,i){var b=document.createElement('button');\n"
          + "  b.style.background=c;if(!i)b.className='on';\n"
          + "  b.onclick=function(){col=c;er=0;K.$$('#kPal button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};\n"
          + "  pal.appendChild(b);});\n"
          + "K.$('#kW').oninput=function(){wid=Number(K.$('#kW').value)||4;};\n"
          + "K.$('#kEr').onclick=function(){er=!er;K.$('#kEr').classList.toggle('pri',!!er);};\n"
          + "K.$('#kClr').onclick=function(){strokes=[];};\n"
          + "function pos(e){var r=K.$('#kC').getBoundingClientRect();var t=e.touches?e.touches[0]:e;\n"
          + "  return {x:(t.clientX-r.left)/r.width,y:(t.clientY-r.top)/r.height};}\n"
          + "function start(e){e.preventDefault();down=1;last=pos(e);\n"
          + "  strokes.push({c:er?'#FFFFFF':col,w:er?wid*3:wid,p:[last]});}\n"
          + "function move(e){if(!down)return;e.preventDefault();var p=pos(e);\n"
          + "  strokes[strokes.length-1].p.push(p);last=p;}\n"
          + "function end(){down=0;}\n"
          + "var st=K.$('#kStage');\n"
          + "st.addEventListener('pointerdown',start);st.addEventListener('pointermove',move);\n"
          + "window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);\n"
          + "cv.loop(function(ctx,w,h){ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,w,h);\n"
          + "  ctx.strokeStyle='#E3E7EE';ctx.lineWidth=1;\n"
          + "  if(BG==='方眼'){for(var x=0;x<w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}\n"
          + "    for(var y=0;y<h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}\n"
          + "  else if(BG==='横線'){for(var y2=32;y2<h;y2+=32){ctx.beginPath();ctx.moveTo(0,y2);ctx.lineTo(w,y2);ctx.stroke();}}\n"
          + "  ctx.lineCap='round';ctx.lineJoin='round';\n"
          + "  strokes.forEach(function(s){if(s.p.length<1)return;ctx.strokeStyle=s.c;ctx.lineWidth=s.w;\n"
          + "    ctx.beginPath();ctx.moveTo(s.p[0].x*w,s.p[0].y*h);\n"
          + "    for(var i=1;i<s.p.length;i++)ctx.lineTo(s.p[i].x*w,s.p[i].y*h);\n"
          + "    if(s.p.length===1)ctx.lineTo(s.p[0].x*w+0.1,s.p[0].y*h);ctx.stroke();});});"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);


/* ───────── /core/kata/index.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/kata/index.js — 型の 目録・さがす・組み立てる

   使いかた（本体から）:
     VQK.型たち()            … 芯 24 種の 一覧（Lumi へ 見せる）
     VQK.かず()              … 全部で いくつ 型が あるか
     VQK.さがす("九九の練習") … 近い 型を 点つきで 返す
     VQK.作る(型ID, 中身)     … {html, css, js} を 返す（そのまま AR App へ）

   ★ Lumi は コードを 書かない。型ID と 中身（文字・数・並び）だけ。
   ★ 中身が どんなに おかしくても、差し込みの検査が 必ず 直してから 渡す。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var 芯 = VQK.芯 || (VQK.芯 = {});

  /* ══ 中で 使える 共通の 道具 K ═══════════════════════════════════
     ★ すべての 型の js は これを 先に 読み込んで から 動く。
       ここに 集めておくと、芯ごとに 書き直さずに 済み、
       直すときも 1 か所で 済む（＝ 壊れにくい）。 */
  var 共通JS = [
    "var K=(function(){",
    "  var mem={},booted=0,waiting=[];",
    "  function $(s){return document.querySelector(s);}",
    "  function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s));}",
    "  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')",
    "    .replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}",
    "  function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=(Math.random()*(i+1))|0;",
    "    var t=a[i];a[i]=a[j];a[j]=t;}return a;}",
    "  function css(n){try{return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#888';}",
    "    catch(e){return '#888';}}",
    /* 保存。iframe には localStorage が 無い（そう作ってある）ので
       本体の 溜めへ 預ける。読みは 起動時に 1 回だけ まとめて。 */
    "  function save(k,v){mem[k]=v;try{if(window.VQ&&VQ.store)VQ.store.set('kata',mem);}catch(e){}}",
    "  function load(k,d){return mem[k]===undefined?d:mem[k];}",
    /* ★ 画面が 差し替わったあとも 時計が 動き続けると、
       もう無い所を さわって 落ちる（実測。144 通しで 出た）。
       ここで 一括して 「土台が 外れたら 自分で 止まる」に する。 */
    "  var 根=null,生き=1;",
    "  function 生きてる(){if(!生き)return 0;if(!根)根=document.querySelector('.k');",
    "    if(根&&!根.isConnected){生き=0;return 0;}return 1;}",
    "  function 見張る(){var si=window.setInterval,st2=window.setTimeout;",
    "    window.setInterval=function(f,ms){var id=si(function(){",
    "      if(!生きてる()){clearInterval(id);return;}f();},ms);return id;};",
    "    window.setTimeout=function(f,ms){return st2(function(){if(!生きてる())return;f();},ms);};",
    "    var raf=window.requestAnimationFrame;",
    "    window.requestAnimationFrame=function(f){return raf(function(t){if(!生きてる())return;f(t);});};}",
    "  function 始める(fn){",
    "    var go=function(){booted=1;見張る();try{fn();}catch(e){",
    "      try{var p=document.createElement('pre');p.id='vqerr';p.textContent=(e&&e.message)||String(e);",
    "        document.body.appendChild(p);}catch(x){}",
    "      try{parent.postMessage({__vqapp:1,kind:'error',message:(e&&e.message)||String(e)},'*');}catch(x){}}};",
    "    var t=setTimeout(go,1200);",
    "    try{",
    "      if(window.VQ&&VQ.store&&VQ.store.get){",
    "        VQ.store.get('kata',{}).then(function(v){if(v&&typeof v==='object')mem=v;",
    "          clearTimeout(t);if(!booted)go();}).catch(function(){clearTimeout(t);if(!booted)go();});",
    "      }else{clearTimeout(t);go();}",
    "    }catch(e){clearTimeout(t);go();}",
    "  }",
    /* 絵を 描く 場所。画素の 濃さ（DPR）も 大きさ直しも こちらが 持つ。 */
    "  function canvas(el,noloop){",
    "    var ctx=el.getContext('2d'),W=0,H=0,fn=null,last=0,raf=0;",
    "    function fit(){var r=el.getBoundingClientRect();var d=Math.min(2,window.devicePixelRatio||1);",
    "      W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));",
    "      el.width=Math.round(W*d);el.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);}",
    "    fit();",
    "    try{new ResizeObserver(fit).observe(el);}catch(e){window.addEventListener('resize',fit);}",
    "    if(!ctx.roundRect)ctx.roundRect=function(x,y,w,h,r){r=Math.min(r,w/2,h/2);this.beginPath();",
    "      this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);",
    "      this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;};",
    "    function step(t){raf=requestAnimationFrame(step);var dt=last?Math.min(64,t-last):16;last=t;",
    "      if(fn){try{fn(ctx,W,H,dt);}catch(e){cancelAnimationFrame(raf);throw e;}}}",
    "    return {ctx:ctx,fit:fit,w:function(){return W;},h:function(){return H;},",
    "      loop:function(f){fn=f;if(!raf&&!noloop)raf=requestAnimationFrame(step);",
    "        if(noloop){fn=f;raf=requestAnimationFrame(step);}}};",
    "  }",
    /* 左右に 引く（0〜1 で 返す）。指も マウスも 同じ 口。 */
    "  function drag(el,fn){",
    "    var on=0;function p(e){var r=el.getBoundingClientRect();var t=e.touches?e.touches[0]:e;",
    "      fn(Math.max(0,Math.min(1,(t.clientX-r.left)/Math.max(1,r.width))));}",
    "    el.addEventListener('pointerdown',function(e){on=1;p(e);e.preventDefault();});",
    "    el.addEventListener('pointermove',function(e){if(on){p(e);e.preventDefault();}});",
    "    window.addEventListener('pointerup',function(){on=0;});",
    "    el.addEventListener('mousemove',function(e){p(e);});",
    "  }",
    /* なぞる向き（上下左右）。 */
    "  function swipe(el,fn){var sx=0,sy=0,on=0;",
    "    el.addEventListener('pointerdown',function(e){on=1;sx=e.clientX;sy=e.clientY;});",
    "    window.addEventListener('pointerup',function(e){if(!on)return;on=0;",
    "      var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)<24&&Math.abs(dy)<24)return;",
    "      if(Math.abs(dx)>Math.abs(dy))fn(dx>0?1:-1,0);else fn(0,dy>0?1:-1);});}",
    "  function keys(fn){window.addEventListener('keydown',function(e){",
    "    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)>=0)e.preventDefault();fn(e.key,e);});}",
    /* 短い 音。外の 音は 使わない（つながせない ため）。 */
    "  function beep(hz,ms){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;",
    "    var c=beep._c||(beep._c=new A());var o=c.createOscillator(),g=c.createGain();",
    "    o.frequency.value=hz||660;o.connect(g);g.connect(c.destination);",
    "    g.gain.setValueAtTime(0.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(0.14,c.currentTime+0.01);",
    "    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+((ms||180)/1000));",
    "    o.start();o.stop(c.currentTime+((ms||180)/1000)+0.02);}catch(e){}}",
    "  return {$:$,$$:$$,esc:esc,shuffle:shuffle,css:css,save:save,load:load,",
    "    始める:始める,canvas:canvas,drag:drag,swipe:swipe,keys:keys,beep:beep};",
    "})();"
  ].join("\n");

  /* ══ 目録 ═══════════════════════════════════════════════════════ */
  function 芯の名() { return Object.keys(芯); }
  function かず() {
    return 芯の名().length * VQK.骨の名.length * VQK.色の名.length * VQK.詰の名.length;
  }
  function 型たち() {
    return 芯の名().map(function (k) {
      var a = 芯[k];
      return { 芯: k, 名: a.名, 分類: a.分類, 説明: a.説明, 語: a.語,
        スロット: a.スロット.map(function (s) {
          return { 鍵: s.鍵, 型: s.型, 説: s.説 || "", 既定: s.既定, 候補: s.候補, 形: s.形 };
        }), 例: a.例 || {} };
    });
  }

  /* ══ 型 ID ═════════════════════════════════════════════════════ */
  function 分解(id) {
    var a = String(id || "").split("/");
    return {
      芯: 芯[a[0]] ? a[0] : "",
      骨: VQK.骨たち[a[1]] ? a[1] : "stack",
      色: VQK.色たち[a[2]] ? a[2] : "slate",
      詰: VQK.詰たち[a[3]] ? a[3] : "normal"
    };
  }
  function 組む(芯名, 骨, 色, 詰) {
    return [芯名, 骨 || "stack", 色 || "slate", 詰 || "normal"].join("/");
  }
  /* 決まった 文字から 決まった 見た目を 選ぶ（同じ頼みなら 毎回 同じ）。 */
  function 種(s) {
    var h = 2166136261;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function 見た目を選ぶ(芯名, 手がかり) {
    var a = 芯[芯名] || {};
    var h = 種(芯名 + "|" + (手がかり || ""));
    /* 芯ごとに 似合う 骨を 先に 決めておく（外れが 出ないように）。 */
    var 似合う = {
      quiz4: ["card", "stack"], flash: ["card", "stack"], pair: ["board", "stack"],
      type: ["card", "hud"], mole: ["board", "hud"], "catch": ["hud", "board"],
      snake: ["board", "hud"], breakout: ["board", "hud"], merge2048: ["board", "hud"],
      memoryseq: ["board", "stack"], sortorder: ["stack", "split"], hangman: ["card", "stack"],
      drill: ["card", "hud"], matchline: ["split", "stack"], fillblank: ["card", "stack"],
      sortcat: ["stack", "board"], timeline: ["split", "stack"], dictation: ["card", "stack"],
      checklist: ["stack", "panel"], pomodoro: ["card", "stack"], counter: ["stack", "board"],
      budget: ["stack", "panel"], dice: ["card", "board"], draw: ["board", "stack"]
    }[芯名] || ["stack"];
    return {
      骨: 似合う[h % 似合う.length],
      色: VQK.色の名[(h >>> 3) % VQK.色の名.length],
      詰: VQK.詰の名[(h >>> 7) % VQK.詰の名.length]
    };
  }

  /* ══ さがす ═══════════════════════════════════════════════════
     言葉の 重なりで 点をつける。**近いものが 無ければ 無いと 言う**
     （むりに 当てはめると 実用に ならないものが 出る）。 */
  function 正す(s) {
    return String(s || "").toLowerCase().replace(/[\s　、。，．・「」『』（）()]/g, "");
  }
  function さがす(希望, n) {
    var q = 正す(希望);
    n = Math.max(1, Math.min(12, Number(n) || 6));
    var 出 = 芯の名().map(function (k) {
      var a = 芯[k], 点 = 0;
      (a.語 || []).forEach(function (w) {
        var v = 正す(w);
        if (!v) return;
        if (q.indexOf(v) >= 0) 点 += Math.min(6, v.length) * 2;
        else if (v.length >= 2 && v.indexOf(q) >= 0 && q.length >= 2) 点 += 3;
      });
      if (q && 正す(a.名).length && q.indexOf(正す(a.名)) >= 0) 点 += 10;
      /* 説明の 中の 言葉も 少しだけ 見る */
      正す(a.説明).split("").length && (a.語 || []).length;
      var m = 見た目を選ぶ(k, 希望);
      return { 芯: k, 名: a.名, 分類: a.分類, 説明: a.説明, 点: 点,
        型ID: 組む(k, m.骨, m.色, m.詰),
        スロット: a.スロット.map(function (s) { return { 鍵: s.鍵, 型: s.型, 説: s.説 || "", 既定: s.既定, 候補: s.候補, 形: s.形 }; }),
        例: a.例 || {} };
    });
    出.sort(function (a, b) { return b.点 - a.点 || a.芯.localeCompare(b.芯); });
    return 出.slice(0, n);
  }

  /* ══ 組み立てる ═══════════════════════════════════════════════ */
  function 作る(型ID, 中身, o) {
    o = o || {};
    var p = 分解(型ID);
    if (!p.芯) {
      /* 型 ID が 分からないときは **黙って 適当に 作らない**。 */
      var e = new Error("その型は ありません: " + String(型ID));
      e.code = "KATA_NOT_FOUND";
      e.候補 = さがす(o.希望 || String(型ID), 5).map(function (x) { return x.型ID; });
      throw e;
    }
    var a = 芯[p.芯];
    var v = VQK.差し込みを直す(a.スロット, 中身);
    var r = a.作る(v.中身);
    var html = VQK.骨で包む(p.骨, {
      題: VQK.逃がす(v.中身.題 || a.名),
      副: VQK.逃がす(v.中身.副 || ""),
      帯: r.帯 || "", 中: r.中 || "", 手: r.手 || ""
    });
    var css = VQK.土台CSS(p.色, p.詰) + (r.css || "");
    /* ★ 差し込んだ 文の中に </script> が あると、包みの <script> を
       **そこで 閉じてしまう**（実測。問題文へ 仕掛けを 入れると 起きた）。
       包み（core/board/app.js）でも 逃がしているが、
       **ここでも 逃がす**（別の 出しかたでも 安全なように）。 */
    var js = 共通JS + "\nK.始める(function(){\n" + (r.js || "") + "\n});";
    js = js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
    return {
      型ID: 組む(p.芯, p.骨, p.色, p.詰),
      芯: p.芯, 骨: p.骨, 色: p.色, 詰: p.詰,
      html: html, css: css, js: js,
      直した: v.直した, 中身: v.中身,
      見出し: v.中身.題 || a.名
    };
  }

  /* 希望の文 → いちばん近い 型で そのまま 作る（Lumi の 近道） */
  function 近いので作る(希望, 中身) {
    var c = さがす(希望, 1)[0];
    if (!c || c.点 <= 0) {
      var e = new Error("近い型が 見つかりませんでした。");
      e.code = "KATA_NO_MATCH";
      e.候補 = 型たち().map(function (t) { return t.芯 + "（" + t.名 + "）"; });
      throw e;
    }
    return 作る(c.型ID, 中身, { 希望: 希望 });
  }

  VQK.共通JS = 共通JS;
  VQK.芯の名 = 芯の名;
  VQK.かず = かず;
  VQK.型たち = 型たち;
  VQK.分解 = 分解;
  VQK.組む = 組む;
  VQK.見た目を選ぶ = 見た目を選ぶ;
  VQK.さがす = さがす;
  VQK.作る = 作る;
  VQK.近いので作る = 近いので作る;
})(typeof window !== "undefined" ? window : globalThis);


/* ───────── /core/feed/badge.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/feed/badge.js — 公式マーク（VQBADGE）

   ★ 訴え（2026-08-20）
     「rinty_0401 には、プロフィールに 公式マークを 付与して欲しい。
       名前の 左に つけて、金と青が 重なった チェックマークで、
       超限られた 公式しか つけられない」
     「admin ダッシュボードから 公式マーク（青 または 金色）を
       付与できるように。一般アカウントに」

   ★ 3 種類だけ
       official … 金と青が **重なった** チェック。ごく限られた 公式のみ
       gold     … 金
       blue     … 青

   ★ 決めごと
     ・出す場所は **名前の 左**
     ・色だけで 伝えない。かならず title と aria-label に 言葉を 入れる
     ・外の 画像に 頼らない（Feed も DM も shadow root の 中なので）
     ・同じ 絵を 2 か所で 手書きしない。ここ 1 つに まとめる
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQBADGE = root.VQBADGE || (root.VQBADGE = {});

  var 名 = {
    official: "VocabuQuiz 公式（認証済み）",
    gold: "公式（ゴールド）",
    blue: "公式（ブルー）"
  };
  var 色 = {
    blue: { 主: "#1D8BF0", 影: "#0F6FCB" },
    gold: { 主: "#E0A526", 影: "#B87F12" }
  };

  /* ぎざぎざの 丸（よくある 認証バッジの 形）を 1 回だけ 作る。 */
  function 花びら(cx, cy, R, r, n) {
    var d = "", i, t, rr, x, y;
    for (i = 0; i <= n * 2; i++) {
      t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      rr = (i % 2 === 0) ? R : r;
      x = Math.round((cx + Math.cos(t) * rr) * 100) / 100;
      y = Math.round((cy + Math.sin(t) * rr) * 100) / 100;
      d += (i === 0 ? "M" : "L") + x + " " + y;
      d += " ";
    }
    return d + "Z";
  }
  var ROSETTE = 花びら(12, 12, 11.2, 9.2, 11);
  var CHECK = "M7.6 12.2l2.9 2.9 5.9-6.1";

  function 種(k) {
    var v = String(k || "").trim().toLowerCase();
    return (v === "official" || v === "gold" || v === "blue") ? v : "";
  }

  /* 印を 1 つ 返す。無ければ 空文字（呼び側で 出し分けなくてよい）。 */
  function 印(k, opt) {
    var v = 種(k);
    if (!v) return "";
    var o = opt || {};
    var px = Number(o.size || 16);
    var cls = "vqbadge vqbadge--" + v + (o.cls ? " " + o.cls : "");
    var ラベル = 名[v];
    var 中 = "";
    if (v === "official") {
      /* 金の 花びらを 右下へ ずらして 敷き、その上に 青。
         **重なって 見える**ことが この印の 芯。 */
      中 = '<g transform="translate(2.4,1.5) scale(0.9)">'
        + '<path d="' + ROSETTE + '" fill="' + 色.gold.主 + '"/></g>'
        + '<g transform="translate(-1.6,-0.6) scale(0.9)">'
        + '<path d="' + ROSETTE + '" fill="' + 色.blue.主 + '"/>'
        + '<path d="' + CHECK + '" fill="none" stroke="#fff" stroke-width="2.3"'
        + ' stroke-linecap="round" stroke-linejoin="round"/></g>';
    } else {
      var c = 色[v];
      中 = '<path d="' + ROSETTE + '" fill="' + c.主 + '"/>'
        + '<path d="' + CHECK + '" fill="none" stroke="#fff" stroke-width="2.3"'
        + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return '<svg class="' + cls + '" viewBox="0 0 24 24" width="' + px + '" height="' + px + '"'
      + ' role="img" aria-label="' + ラベル + '" focusable="false"'
      + ' style="flex:0 0 auto;vertical-align:-0.16em"><title>' + ラベル + "</title>"
      + 中 + "</svg>";
  }

  /* 名前の **左** に 印を 付けた 文字列を 返す（esc は 呼び側の 関数を 使う）。 */
  function 名前に付ける(名前HTML, k, opt) {
    var m = 印(k, opt);
    return m ? m + 名前HTML : 名前HTML;
  }

  VQBADGE.印 = 印;
  VQBADGE.名前に付ける = 名前に付ける;
  VQBADGE.種 = 種;
  VQBADGE.名 = function (k) { return 名[種(k)] || ""; };
  VQBADGE.一覧 = ["official", "gold", "blue"];
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/feed/art.js ───────── */
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


/* ───────── /core/feed/video.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/feed/video.js — 動画の 再生バー（VQVID）

   ★ 訴え（2026-08-20）
     「動画の 再生バーとかは News の 表示でも Feed と 同じものを 使いたい」

   ★ なぜ 切り出すか
     もとは Feed の 中だけに あった。News でも 同じものを 出すには
     **書き写す**しか なかったが、書き写した ものは 必ず ずれる
     （片方だけ 直る／片方だけ 壊れる）。1 つに して 両方から 使う。

   ★ 使いかた（影の DOM でも 素の DOM でも 同じ）
       root.appendChild(style(VQVID.CSS))     … 見た目を 配る
       html += VQVID.html(url)                … 置く
       VQVID.結線(root)                       … 動かす（1 つの root に 1 回だけ）

   ★ 決めごと
     ・ブラウザ既定の 見た目は 使わない（端末ごとに ばらばらなので）
     ・再生してから 3 秒 触らなければ バーは そっと 引っ込む。
       止めている / 掴んでいる / キーボードで 辿っている 間は 出したまま
     ・つまみは VocabuQuiz の マーク。掴むと 大きくなり、再生中は ゆっくり 回る
     ・**影の 外で 指を 離しても 取り残されない**（document でも 拾う）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQVID = root.VQVID || (root.VQVID = {});

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON = {
    play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'
      + '<rect x="13" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/>'
      + '<path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M16 3v3a2 2 0 0 0 2 2h3"/>'
      + '<path d="M8 21v-3a2 2 0 0 0-2-2H3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'
  };
  function svg(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || "") + "</svg>";
  }
  /* 再生位置の つまみ。VocabuQuiz の マーク（3 本の リボンと V）を 小さくしたもの。 */
  function knobSvg() {
    return '<svg class="vid-k" viewBox="0 0 200 200" aria-hidden="true">'
      + '<circle cx="100" cy="100" r="96" fill="var(--vq-accent,#8175CC)"/>'
      + '<g fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity=".95">'
      + '<circle cx="100" cy="77" r="50"/><circle cx="80" cy="113" r="50"/><circle cx="120" cy="113" r="50"/>'
      + "</g>"
      + '<path d="M69 74 L100 141 L131 74" fill="none" stroke="#fff" stroke-width="26" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  var CSS = [
    ".vid{position:relative;margin-top:11px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:#17161D;}",
    ".vid video{width:100%;max-height:520px;display:block;background:#17161D;}",
    ".vid-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;",
      "padding:10px 12px;background:linear-gradient(180deg,rgba(24,22,34,0),rgba(24,22,34,.82));",
      "opacity:1;transform:translateY(0);",
      "transition:opacity .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1);}",
    ".vid.is-idle .vid-bar{opacity:0;transform:translateY(10px);pointer-events:none;}",
    ".vid.is-idle{cursor:none;}",
    ".vid.is-paused .vid-bar,.vid.is-scrub .vid-bar,.vid:has(:focus-visible) .vid-bar{",
      "opacity:1 !important;transform:none !important;pointer-events:auto !important;}",
    "@media (prefers-reduced-motion:reduce){.vid-bar{transition:opacity .12s linear;}",
      ".vid.is-idle .vid-bar{transform:none;}}",
    ".vid-b{width:34px;height:34px;flex:none;border:0;cursor:pointer;border-radius:50%;",
      "background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;}",
    ".vid-b:hover{background:rgba(255,255,255,.28);}",
    ".vid-b svg{width:17px;height:17px;}",
    ".vid-t{flex:1;min-width:0;height:18px;cursor:pointer;position:relative;",
      "display:flex;align-items:center;touch-action:none;}",
    ".vid-t::before{content:\"\";position:absolute;left:0;right:0;height:4px;border-radius:99px;",
      "background:rgba(255,255,255,.24);}",
    ".vid-t i{position:absolute;left:0;height:4px;border-radius:99px;width:0;",
      "background:linear-gradient(90deg,var(--vq-border-focus,#B5ACE9),#fff);}",
    ".vid-k{position:absolute;left:0;translate:-50% 0;width:16px;height:16px;pointer-events:none;",
      "filter:drop-shadow(0 1px 4px rgba(0,0,0,.5));",
      "transition:width .16s cubic-bezier(.34,1.56,.64,1),height .16s cubic-bezier(.34,1.56,.64,1);}",
    ".vid-t:hover .vid-k,.vid.is-scrub .vid-k{width:26px;height:26px;}",
    ".vid-k g{transform-origin:50% 50%;}",
    ".vid:not(.is-paused) .vid-k g{animation:vqKnob 5.5s linear infinite;}",
    "@keyframes vqKnob{to{transform:rotate(360deg)}}",
    ".vid-tip{position:absolute;bottom:26px;translate:-50% 0;padding:3px 9px;border-radius:calc(8px * var(--vq-r-scale,1));",
      "background:rgba(24,22,34,.9);color:#fff;font-size:12px;font-variant-numeric:tabular-nums;",
      "white-space:nowrap;opacity:0;transition:opacity .14s ease;pointer-events:none;}",
    ".vid.is-scrub .vid-tip{opacity:1;}",
    ".vid-time{flex:none;color:#fff;font-size:12px;font-variant-numeric:tabular-nums;opacity:.9;}",
    ".vid-rate{flex:none;height:28px;min-width:44px;padding:0 9px;border:0;cursor:pointer;",
      "border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:12px;font-weight:700;",
      "font-variant-numeric:tabular-nums;}",
    ".vid-rate:hover{background:rgba(255,255,255,.28);}",
    ".vid:fullscreen{border:0;border-radius:0;display:grid;place-items:center;background:#000;}",
    ".vid:fullscreen video{max-height:100dvh;height:100dvh;object-fit:contain;}",
    ".vid:fullscreen .vid-bar{padding:18px 24px;}",
    /* 指で触る端末は、幅に関係なく 当たり判定を 厚くする */
    "@media (max-width:640px){",
      ".vid-bar{padding:10px;gap:7px;}",
      ".vid-b{width:34px;height:34px;}",
      ".vid-t{height:30px;}",
      ".vid-rate{height:32px;min-width:44px;padding:0 8px;}",
      ".vid-time{font-size:11px;}",
    "}",
    "@media (pointer:coarse){",
      ".vid-t{height:30px;}",
      ".vid-rate{height:32px;min-width:44px;}",
      ".vid-b{width:34px;height:34px;}",
    "}"
  ].join("");

  function html(u) {
    return '<div class="vid is-paused" data-vid>'
      + '<video src="' + esc(u) + '" preload="metadata" playsinline data-v></video>'
      + '<div class="vid-bar">'
      + '<button class="vid-b" data-a="v-play" aria-label="再生">' + svg("play") + "</button>"
      + '<span class="vid-t" data-a="v-seek" role="slider" aria-label="再生位置" tabindex="0"'
        + ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'
        + '<i data-vfill></i>' + knobSvg()
        + '<span class="vid-tip" data-vtip>0:00</span></span>'
      + '<span class="vid-time" data-vtime>0:00 / 0:00</span>'
      + '<button class="vid-rate" data-a="v-rate" aria-label="再生の速さ">1.0×</button>'
      + '<button class="vid-b" data-a="v-full" aria-label="拡大">' + svg("expand") + "</button>"
      + "</div></div>";
  }

  /* ── 動かす。1 つの root に 1 回だけ。 ───────────────────────── */
  var 済み = new WeakSet();
  function 結線(root2) {
    if (!root2 || 済み.has(root2)) return false;
    済み.add(root2);
    var doc = root2.ownerDocument || document;

    function fmt(t) {
      t = Math.max(0, Math.floor(Number(t) || 0));
      return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    }
    function paint(v) {
      var box = v.closest("[data-vid]");
      if (!box) return;
      var fill = box.querySelector("[data-vfill]"), time = box.querySelector("[data-vtime]");
      var knob = box.querySelector(".vid-k"), tip = box.querySelector("[data-vtip]");
      var track = box.querySelector('[data-a="v-seek"]');
      var btn = box.querySelector('[data-a="v-play"]');
      var rate = box.querySelector('[data-a="v-rate"]');
      var full = box.querySelector('[data-a="v-full"]');
      var d = isFinite(v.duration) ? v.duration : 0;
      var pct = d ? (v.currentTime / d) * 100 : 0;
      if (fill) fill.style.width = pct + "%";
      if (knob) knob.style.left = pct + "%";
      if (tip) { tip.style.left = pct + "%"; tip.textContent = fmt(v.currentTime); }
      if (track) track.setAttribute("aria-valuenow", Math.round(pct));
      if (time) time.textContent = fmt(v.currentTime) + " / " + fmt(d);
      box.classList.toggle("is-paused", v.paused);
      if (btn) {
        btn.innerHTML = v.paused ? svg("play") : svg("pause");
        btn.setAttribute("aria-label", v.paused ? "再生" : "停止");
      }
      if (rate) rate.textContent = (Number(v.playbackRate) || 1).toFixed(1) + "×";
      if (full) {
        var on = doc.fullscreenElement === box;
        full.innerHTML = svg(on ? "shrink" : "expand");
        full.setAttribute("aria-label", on ? "拡大をやめる" : "拡大");
      }
    }

    /* ── 引っ込め ─────────────────────────────────────────── */
    var IDLE_MS = 3000;
    var timers = new WeakMap();
    function armIdle(box) {
      if (!box) return;
      var t = timers.get(box);
      if (t) clearTimeout(t);
      var v = box.querySelector("[data-v]");
      if (!v || v.paused) { box.classList.remove("is-idle"); return; }
      timers.set(box, setTimeout(function () {
        var vv = box.querySelector("[data-v]");
        if (!vv || vv.paused || box.classList.contains("is-scrub")) return;
        /* キーボードで 辿っている 最中だけは 隠さない。
           押したときも 焦点は 当たるので、焦点が あること だけでは 止めない。 */
        try {
          var af = box.getRootNode().activeElement;
          if (af && box.contains(af) && af.matches(":focus-visible")) return;
        } catch (x) {}
        box.classList.add("is-idle");
      }, IDLE_MS));
    }
    function wake(box, keep) {
      if (!box) return;
      box.classList.remove("is-idle");
      var t = timers.get(box);
      if (t) clearTimeout(t);
      if (!keep) armIdle(box);
    }

    ["timeupdate", "play", "pause", "loadedmetadata", "ended"].forEach(function (ev) {
      root2.addEventListener(ev, function (e) {
        if (!(e.target && e.target.matches && e.target.matches("[data-v]"))) return;
        paint(e.target);
        var box = e.target.closest("[data-vid]");
        if (ev === "play") armIdle(box);
        if (ev === "pause" || ev === "ended") wake(box, true);
      }, true);
    });

    /* ── 押したとき ───────────────────────────────────────── */
    root2.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      if (a === "v-play") {
        var box = el.closest("[data-vid]"), v = box && box.querySelector("[data-v]");
        if (v) { if (v.paused) v.play(); else v.pause(); }
        return;
      }
      if (a === "v-rate") {
        /* 押すたびに 次の 速さへ。よく使う 段だけ 回す。 */
        var rb = el.closest("[data-vid]"), rv = rb && rb.querySelector("[data-v]");
        if (!rv) return;
        var RATES = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
        var cur = Number(rv.playbackRate) || 1;
        var idx = RATES.findIndex(function (x) { return Math.abs(x - cur) < 0.01; });
        rv.playbackRate = RATES[(idx + 1) % RATES.length];
        var lbl = rb.querySelector('[data-a="v-rate"]');
        if (lbl) lbl.textContent = rv.playbackRate.toFixed(1) + "×";
        return;
      }
      if (a === "v-full") {
        var fb = el.closest("[data-vid]");
        if (!fb) return;
        if (doc.fullscreenElement === fb) {
          if (doc.exitFullscreen) doc.exitFullscreen();
        } else if (fb.requestFullscreen) {
          fb.requestFullscreen().catch(function () {});
        } else if (fb.webkitRequestFullscreen) {
          fb.webkitRequestFullscreen();
        }
      }
    });

    /* ── 触ったら バーを 戻す ─────────────────────────────── */
    ["pointermove", "pointerdown"].forEach(function (ev) {
      root2.addEventListener(ev, function (e) {
        var box = e.target && e.target.closest ? e.target.closest("[data-vid]") : null;
        if (box) wake(box);
      }, true);
    });
    root2.addEventListener("pointerleave", function (e) {
      var box = e.target && e.target.closest ? e.target.closest("[data-vid]") : null;
      if (box) armIdle(box);
    }, true);

    /* ── 掴んで 動かす ────────────────────────────────────── */
    var scrub = null;
    function seekTo(t, clientX) {
      var box = t.closest("[data-vid]"), v = box && box.querySelector("[data-v]");
      if (!v || !isFinite(v.duration) || !v.duration) return null;
      var r = t.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * v.duration;
      paint(v);
      return { box: box, v: v, t: t };
    }
    root2.addEventListener("pointerdown", function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-a="v-seek"]') : null;
      if (!t) return;
      e.preventDefault();
      var r = seekTo(t, e.clientX);
      if (!r) return;
      scrub = r;
      r.box.classList.add("is-scrub");
      try { t.setPointerCapture(e.pointerId); } catch (x) {}
    });
    root2.addEventListener("pointermove", function (e) {
      if (!scrub) return;
      seekTo(scrub.t, e.clientX);
    });
    function endScrub() {
      if (!scrub) return;
      scrub.box.classList.remove("is-scrub");
      scrub = null;
    }
    root2.addEventListener("pointerup", endScrub);
    root2.addEventListener("pointercancel", endScrub);
    /* ★ 影の 外で 指を 離しても 取り残されない。 */
    doc.addEventListener("pointerup", endScrub);

    /* ── 全画面の 出入り ──────────────────────────────────
       すでに 再生中のまま 全画面へ 入ると play が 飛ばないので、
       ここで 数え直さないと 全画面の あいだ 一度も 隠れない。 */
    doc.addEventListener("fullscreenchange", function () {
      var vs = root2.querySelectorAll ? root2.querySelectorAll("[data-v]") : [];
      for (var i = 0; i < vs.length; i++) {
        paint(vs[i]);
        var bx = vs[i].closest("[data-vid]");
        if (bx) { bx.classList.remove("is-idle"); armIdle(bx); }
      }
    });

    /* ── キーボード ───────────────────────────────────────
       再生位置の バーに 焦点が あるとき: 左右で 5 秒、上下で 10 秒。
       Enter / 空白で 再生と 停止。 */
    root2.addEventListener("keydown", function (e) {
      var tk = e.target && e.target.closest ? e.target.closest('[data-a="v-seek"]') : null;
      if (!tk) return;
      var kb = tk.closest("[data-vid]"), kv = kb && kb.querySelector("[data-v]");
      if (!kv) return;
      var step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -10, ArrowUp: 10 }[e.key];
      if (step) {
        e.preventDefault();
        kv.currentTime = Math.max(0, Math.min(kv.duration || 0, kv.currentTime + step));
        paint(kv);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (kv.paused) kv.play(); else kv.pause();
      }
    });
    return true;
  }

  VQVID.CSS = CSS;
  VQVID.html = html;
  VQVID.結線 = 結線;
  VQVID.印 = svg;
  VQVID.つまみ = knobSvg;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/tts/voices.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/tts/voices.js — 読み上げの 声の 一覧（2026-08-26）

   訴え:「リスニングの声の種類を 男女で 新たに追加させる。無料API ＋ 高品質」

   ★ なぜ この ファイルが 要るか
     声の 一覧は もともと **2 か所に 手で 書いてあった**
       ・server/src/worker.js の LIVE_VOICES（サーバが 通す 名前）
       ・js-src/vq-settings-store.*.js の opts（画面で 選べる 名前）
     片方だけ 足すと、サーバの liveVoiceOf が **黙って 既定へ 落とす**ので
     「選べるのに 鳴らない」「鳴るのに 選べない」に なる。無言の 不具合。
     → 決めどころは **サーバの TTS_VOICES ただ 1 つ**。
        画面は /api/tts/voices で それを 読む。ここは その 受け皿。

   ★ 控え（手元の一覧）を 置いてある 理由
     圏外・起動直後・ログイン前でも 選択肢を 出せるようにするため。
     控えは **サーバと 同じ 中身**でなければ ならない。
     ずれていないことは vqvoice.cjs が 実測で 見張る。

   ★ 男女は **測った 値**（基本周波数 F0 / 単位 Hz）で 分けてある。
     名前の 印象では 決めていない。測りかたは worker.js の ttsPitchHz。
     hz が null のものは 前に 人が 確かめた ぶん（今回 無料枠が 尽きて
     測り直せなかった）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ = root.VQVOICE || (root.VQVOICE = {});

  /* サーバの TTS_VOICES と **同じ 中身**（vqvoice.cjs が 見張る） */
  var 控え = [
    { id: "Kore",       名: "コレ",         性: "女", hz: 200,   印象: "しっかり" },
    { id: "Leda",       名: "レダ",         性: "女", hz: 208.7, 印象: "はきはき" },
    { id: "Autonoe",    名: "アウトノエ",   性: "女", hz: 200,   印象: "明るい" },
    { id: "Zephyr",     名: "ゼファー",     性: "女", hz: 192,   印象: "軽やか" },
    { id: "Erinome",    名: "エリノメ",     性: "女", hz: 192,   印象: "澄んだ" },
    { id: "Achernar",   名: "アケルナル",   性: "女", hz: 189,   印象: "やわらかい" },
    { id: "Aoede",      名: "アオエデ",     性: "女", hz: 170.2, 印象: "さわやか" },
    { id: "Sulafat",    名: "スラファト",   性: "女", hz: null,  印象: "あたたかい" },
    { id: "Charon",     名: "カロン",       性: "男", hz: 93.4,  印象: "説明が得意" },
    { id: "Enceladus",  名: "エンケラドス", 性: "男", hz: 100,   印象: "落ち着いた" },
    { id: "Iapetus",    名: "イアペトス",   性: "男", hz: 116.5, 印象: "静かな" },
    { id: "Umbriel",    名: "ウンブリエル", 性: "男", hz: 117.1, 印象: "おだやか" },
    { id: "Algieba",    名: "アルギエバ",   性: "男", hz: 118.2, 印象: "低め" },
    { id: "Fenrir",     名: "フェンリル",   性: "男", hz: 121.8, 印象: "力強い" },
    { id: "Puck",       名: "パック",       性: "男", hz: 123.1, 印象: "明るい" },
    { id: "Orus",       名: "オルス",       性: "男", hz: 125.7, 印象: "きびきび" },
    { id: "Alnilam",    名: "アルニラム",   性: "男", hz: 125.7, 印象: "はっきり" },
    { id: "Rasalgethi", 名: "ラサルゲティ", 性: "男", hz: 131.1, 印象: "ものしり" },
    { id: "Schedar",    名: "シェダル",     性: "男", hz: 135.6, 印象: "落ち着いた" },
    { id: "Achird",     名: "アキルド",     性: "男", hz: 143.7, 印象: "親しみやすい" }
  ];

  VQ.既定 = "Kore";
  var いま = 控え.slice();
  var 取った = false;

  function 札(v) {
    return v.名 + "（" + (v.性 === "女" ? "女性" : "男性")
      + (v.印象 ? "・" + v.印象 : "") + (v.id === VQ.既定 ? "／既定" : "") + "）";
  }

  VQ.控え = function () { return 控え.slice(); };
  VQ.一覧 = function () { return いま.slice(); };
  VQ.札 = 札;
  /* 設定の select が そのまま 使える形 [[値, 見せる文], …] */
  VQ.選択肢 = function () {
    return いま.map(function (v) { return [v.id, v.label || 札(v)]; });
  };
  VQ.性別 = function (id) {
    for (var i = 0; i < いま.length; i++) if (いま[i].id === id) return いま[i].性;
    return "";
  };
  VQ.ある = function (id) { return !!VQ.性別(id); };
  /* 男女で 絞る。声を 20 も 並べると 選べないので、画面は これで 分ける。 */
  VQ.男 = function () { return いま.filter(function (v) { return v.性 === "男"; }); };
  VQ.女 = function () { return いま.filter(function (v) { return v.性 === "女"; }); };

  /* サーバの 一覧を 取りに行く。**取れなくても 黙って 控えのまま**。
     圏外で 選択肢が 空に なるほうが 困る。 */
  VQ.取りに行く = function (api) {
    if (取った) return Promise.resolve(いま.slice());
    var 元 = String(api || "").replace(/\/+$/, "");
    return fetch(元 + "/api/tts/voices", { method: "GET" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.voices) || !j.voices.length) return いま.slice();
        いま = j.voices.map(function (v) {
          return { id: v.id, 名: v.名 || v.id, 性: v.性 || "",
                   hz: v["高さHz"] === undefined ? null : v["高さHz"],
                   印象: v.印象 || "", label: v.label || "" };
        });
        if (j["既定"]) VQ.既定 = j["既定"];
        取った = true;
        try { root.dispatchEvent(new CustomEvent("vq-voices-updated", { detail: { 数: いま.length } })); }
        catch (e) {}
        return いま.slice();
      })
      .catch(function () { return いま.slice(); });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/tts/script.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/tts/script.js — 読み上げ原稿の **タグ**（2026-08-26）

   訴え:「プリセット編集画面の 読み上げ文章の ところから、タグを 追加して、
          読み上げ部分に タグから 持って来れるように してほしい。
          例えば、音声を ここの タグで 指定できたり（複数人 男女で 会話文の
          リスニングを 作成するときなど）、あとは 感情とか 速さとかも
          この タグで 指定できたり できると いい」

   ★ 何を するものか
     原稿の 中に [ ] で 印を 書いておくと、読み上げの ときに
     **その場から 声・感情・速さが 変わる**。会話文の リスニングを
     1 つの 原稿で 作れる。

       [A] Hello. How are you?
       [B] I'm fine, thanks.
       [A][excited] Great! Let's go.

   ★ 決めごと
     ・感情・速さは **次に 変えるまで 続く**（そこから 先に かかる）。
     ・ただし **話し手が 変わったら 感情は 戻る**。
       「[A][怒り] 遅いよ！ / [B] ごめん…」で B まで 怒って 読むのは
       書いた人の 思っていることと 違う（速さは 全体の 調子なので 続く）。
     ・効果（笑い・ため息など）と 間（ま）は **その場かぎり**。
     ・知らないタグは **消さずに 文として 残す**。消すと 書いた人が
       「なぜ 出ないのか」分からない。警告として 返す。
     ・A / B / C / D は 話し手の 札。既定は 女→男→女→男 の 順で
       サーバの 声を 当てる（男女が 交互に なるように）。
     ・**タグは 画面には 出さない**（読み上げの ための 印であって 本文では ない）。

   ★ 置き場所
     ここは **タグの 決めどころ**。編集画面の「タグを選択」も、
     読み上げの 段づくりも、原稿の 見せかたも 全部 ここを 読む。
     ばらばらに 書くと、増やしたとき 片方だけ 直って ずれる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ = root.VQSCRIPT || (root.VQSCRIPT = {});

  /* ── タグの 一覧 ──────────────────────────────────────────────
     name … 画面に 出す 名前
     tag  … 実際に 差し込む 文字（[ ] を 除いた 中身）
     別名 … 書いても 通る 言いかた（日本語・英語）
     style… 読み上げに 渡す 言いかた（サーバは これを そのまま 指示に 使う） */
  var 感情 = [
    { name: "怒り",     tag: "angry",     別名: ["怒り", "おこり", "angry", "怒って"],     style: "怒った口調で" },
    { name: "悲しみ",   tag: "sad",       別名: ["悲しみ", "かなしみ", "sad"],             style: "悲しそうな口調で" },
    { name: "うれしい", tag: "happy",     別名: ["うれしい", "嬉しい", "happy", "joy"],    style: "うれしそうな口調で" },
    { name: "照れ",     tag: "shy",       別名: ["照れ", "てれ", "shy", "bashful"],        style: "照れたような口調で" },
    { name: "強調",     tag: "emphasis",  別名: ["強調", "emphasis", "strong"],            style: "強く言い切るように" },
    { name: "ささやき", tag: "whisper",   別名: ["ささやき", "囁き", "whisper"],           style: "ささやくような小さな声で" },
    { name: "ソフト",   tag: "soft",      別名: ["ソフト", "soft", "やわらかく"],          style: "やわらかく穏やかな口調で" },
    { name: "息まじり", tag: "breathy",   別名: ["息まじり", "breathy"],                   style: "息まじりの声で" },
    { name: "興奮",     tag: "excited",   別名: ["興奮", "excited"],                       style: "興奮した早めの口調で" },
    { name: "まじめ",   tag: "serious",   別名: ["まじめ", "真面目", "serious"],           style: "まじめで落ち着いた口調で" },
    { name: "やさしい", tag: "gentle",    別名: ["やさしい", "優しい", "gentle", "kind"],  style: "やさしく語りかけるように" },
    { name: "不安",     tag: "nervous",   別名: ["不安", "nervous", "worried"],            style: "不安そうな口調で" },
    { name: "ふつう",   tag: "normal",    別名: ["ふつう", "普通", "normal", "plain"],     style: "" }
  ];
  var 効果 = [
    { name: "笑い",         tag: "laugh",    別名: ["笑い", "わらい", "laugh"],        style: "笑いながら" },
    { name: "くすくす笑い", tag: "chuckle",  別名: ["くすくす笑い", "chuckle", "くすくす"], style: "くすくす笑いながら" },
    { name: "うめき声",     tag: "groan",    別名: ["うめき声", "groan"],              style: "うめくように" },
    { name: "咳払い",       tag: "cough",    別名: ["咳払い", "せきばらい", "cough"],  style: "咳払いをしてから" },
    { name: "すすり泣き",   tag: "sob",      別名: ["すすり泣き", "sob"],              style: "すすり泣きながら" },
    { name: "大泣き",       tag: "cry",      別名: ["大泣き", "cry", "泣き"],          style: "泣きながら" },
    { name: "ため息",       tag: "sigh",     別名: ["ため息", "sigh"],                 style: "ため息をついてから" },
    { name: "荒い息",       tag: "panting",  別名: ["荒い息", "panting"],              style: "息を切らしながら" },
    { name: "うなり声",     tag: "growl",    別名: ["うなり声", "growl"],              style: "低くうなるように" }
  ];
  var 速さ = [
    { name: "とてもゆっくり", tag: "speed:0.7", 値: 0.7 },
    { name: "ゆっくり",       tag: "speed:0.85", 値: 0.85 },
    { name: "ふつうの速さ",   tag: "speed:1",   値: 1 },
    { name: "少し速く",       tag: "speed:1.15", 値: 1.15 },
    { name: "速く",           tag: "speed:1.3", 値: 1.3 }
  ];
  var 話し手 = [
    { name: "A さん", tag: "A" }, { name: "B さん", tag: "B" },
    { name: "C さん", tag: "C" }, { name: "D さん", tag: "D" }
  ];
  var その他 = [
    { name: "女性の声", tag: "女" }, { name: "男性の声", tag: "男" },
    { name: "間（0.5 秒）", tag: "pause:500" }, { name: "間（1 秒）", tag: "pause:1000" }
  ];

  /* 画面の「タグを選択」は これを 読む（束ごと 出す） */
  VQ.束 = function () {
    return [
      { 名: "話し手", 説明: "会話文は これで 分けます（男女が 交互に なります）", 品: 話し手 },
      { 名: "感情",   説明: "その場から 先に かかります",                         品: 感情 },
      { 名: "効果",   説明: "その 1 か所だけ",                                     品: 効果 },
      { 名: "速さ",   説明: "その場から 先に かかります",                         品: 速さ },
      { 名: "そのほか", 説明: "",                                                  品: その他 }
    ];
  };
  VQ.感情 = function () { return 感情.slice(); };
  VQ.効果 = function () { return 効果.slice(); };

  function 引く(並, t) {
    var k = String(t || "").trim().toLowerCase();
    for (var i = 0; i < 並.length; i++) {
      var x = 並[i];
      if (String(x.tag).toLowerCase() === k) return x;
      for (var j = 0; j < (x.別名 || []).length; j++)
        if (String(x.別名[j]).toLowerCase() === k) return x;
    }
    return null;
  }

  /* 話し手 → 声。**男女が 交互**に なるように 当てる。
     声の 実体は VQVOICE（サーバの 実測つき 一覧）から 取る。 */
  function 声を割り当てる(札, 決め) {
    決め = 決め || {};
    if (決め[札]) return 決め[札];
    var V = root.VQVOICE;
    var 女 = (V && V.女) ? V.女() : [];
    var 男 = (V && V.男) ? V.男() : [];
    var 順 = ["A", "B", "C", "D"];
    var i = 順.indexOf(String(札).toUpperCase());
    if (i < 0) i = 0;
    var 群 = (i % 2 === 0) ? 女 : 男;      /* A=女 / B=男 / C=女 / D=男 */
    var 番 = Math.floor(i / 2);
    if (!群.length) return (V && V.既定) || "Kore";
    return 群[番 % 群.length].id;
  }

  /* 原稿を 段（せつ）に 分ける。 */
  VQ.読む = function (text, o) {
    o = o || {};
    var 生 = String(text === undefined || text === null ? "" : text);
    var 決め = o.話し手の声 || {};
    var いまの声 = o.voice || "";
    var いまの性 = "";
    var いま速さ = Number(o.speed) || 1;
    var いま感情 = "";
    var 次の効果 = "";
    var 次の間 = 0;
    var 段 = [], 警告 = [], 使った = {}, 札の声 = {};
    var 溜 = "";

    function 出す() {
      var t = 溜.replace(/[ \t]+/g, " ").trim();
      溜 = "";
      if (!t) {
        /* 文が 無くても 間は 残す（[間] だけの 行） */
        if (次の間) { 段.push({ text: "", pauseMs: 次の間 }); 次の間 = 0; }
        return;
      }
      var st = [];
      if (次の効果) st.push(次の効果);
      if (いま感情) st.push(いま感情);
      段.push({
        text: t,
        voice: いまの声 || "",
        speed: いま速さ,
        style: st.join("、"),
        pauseMs: 次の間
      });
      次の効果 = ""; 次の間 = 0;
      if (いまの声) 使った[いまの声] = true;
    }

    /* 「A: こんにちは」という 昔ながらの 書きかたも 話し手として 読む
       （前から この 形を すすめていたので、急に 効かなくすると 壊れる） */
    var 行 = 生.split("\n");
    for (var li = 0; li < 行.length; li++) {
      var line = 行[li];
      var m0 = /^\s*([A-Da-d])\s*[:：]\s*/.exec(line);
      if (m0) {
        出す();
        var 札0 = m0[1].toUpperCase();
        札の声[札0] = 札の声[札0] || 声を割り当てる(札0, 決め);
        if (いまの声 !== 札の声[札0]) いま感情 = "";
        いまの声 = 札の声[札0];
        line = line.slice(m0[0].length);
      } else if (li > 0) 溜 += "\n";

      var re = /\[([^\[\]\n]{1,40})\]/g;
      var at = 0, m;
      while ((m = re.exec(line))) {
        溜 += line.slice(at, m.index);
        at = m.index + m[0].length;
        var 中 = String(m[1]).trim();

        /* 話し手 */
        if (/^[A-Da-d]$/.test(中)) {
          出す();
          var 札 = 中.toUpperCase();
          札の声[札] = 札の声[札] || 声を割り当てる(札, 決め);
          if (いまの声 !== 札の声[札]) いま感情 = "";   /* 話し手が 変われば 感情は 戻す */
          いまの声 = 札の声[札];
          continue;
        }
        /* 男女 */
        if (/^(女|女性|female|f)$/i.test(中) || /^(男|男性|male|m)$/i.test(中)) {
          出す();
          var 女か = /^(女|女性|female|f)$/i.test(中);
          var V2 = root.VQVOICE;
          var 群2 = V2 ? (女か ? V2.女() : V2.男()) : [];
          var 新 = 群2.length ? 群2[0].id : いまの声;
          if (いまの声 !== 新) いま感情 = "";
          いまの声 = 新;
          いまの性 = 女か ? "女" : "男";
          continue;
        }
        /* 声を 名指し */
        var mv = /^(?:voice|声)\s*[:：]\s*(.+)$/i.exec(中);
        if (mv) {
          出す();
          var 名 = mv[1].trim();
          var V3 = root.VQVOICE;
          if (V3 && V3.ある && V3.ある(名)) いまの声 = 名;
          else {
            /* 日本語の 呼び名（コレ・カロン…）でも 当てる */
            var 当 = null;
            if (V3 && V3.一覧) V3.一覧().forEach(function (x) {
              if (!当 && (x.名 === 名 || String(x.id).toLowerCase() === 名.toLowerCase())) 当 = x.id;
            });
            if (当) いまの声 = 当;
            else 警告.push("「" + 名 + "」という 声は ありません。");
          }
          continue;
        }
        /* 速さ */
        var ms = /^(?:speed|速さ|はやさ)\s*[:：]\s*([0-9.]+)$/i.exec(中);
        if (ms) {
          出す();
          var sp = Number(ms[1]);
          if (isFinite(sp) && sp >= 0.5 && sp <= 2) いま速さ = sp;
          else 警告.push("速さは 0.5〜2 の 間で 書いてください（" + ms[1] + "）。");
          continue;
        }
        if (/^(ゆっくり|slow)$/i.test(中)) { 出す(); いま速さ = 0.85; continue; }
        if (/^(はやく|速く|fast)$/i.test(中)) { 出す(); いま速さ = 1.3; continue; }
        /* 間 */
        var mp = /^(?:pause|間|ま)(?:\s*[:：]\s*([0-9.]+))?$/i.exec(中);
        if (mp) {
          出す();
          var v = mp[1] === undefined ? 500 : Number(mp[1]);
          if (v > 0 && v <= 20) v = v * 1000;          /* 秒で 書かれても 受ける */
          次の間 = Math.max(0, Math.min(5000, v || 500));
          continue;
        }
        /* 感情（先に かかる） */
        var e = 引く(感情, 中);
        if (e) { 出す(); いま感情 = e.style; continue; }
        /* 効果（その場かぎり） */
        var f = 引く(効果, 中);
        if (f) { 出す(); 次の効果 = f.style; continue; }

        /* 知らない印。**消さない**。本文として 残し、警告に 出す。 */
        警告.push("「[" + 中 + "]」は 分かりません。そのまま 読み上げます。");
        溜 += m[0];
      }
      溜 += line.slice(at);
    }
    出す();

    /* 声を 1 つも 指していないときは、全部 同じ（既定）で 読む */
    var 声の数 = Object.keys(使った).length;
    return {
      段: 段,
      話し手: 札の声,
      使った声: Object.keys(使った),
      多人数: 声の数 >= 2,
      警告: 警告,
      素の文: VQ.素の文(生)
    };
  };

  /* タグを 外した 文（画面に 見せる ぶん・字数を 数える ぶん） */
  VQ.素の文 = function (text) {
    var s = String(text === undefined || text === null ? "" : text);
    /* 知っている タグだけ 外す（知らない [ ] は 本文かもしれない） */
    return s.replace(/\[([^\[\]\n]{1,40})\]/g, function (all, 中) {
      var t = String(中).trim();
      if (/^[A-Da-d]$/.test(t)) return "";
      if (/^(女|女性|female|f|男|男性|male|m)$/i.test(t)) return "";
      if (/^(?:voice|声|speed|速さ|はやさ|pause|間|ま)\s*[:：]/i.test(t)) return "";
      if (/^(pause|間|ま|ゆっくり|はやく|速く|slow|fast)$/i.test(t)) return "";
      if (引く(感情, t) || 引く(効果, t)) return "";
      return all;
    }).replace(/[ \t]{2,}/g, " ")
      .replace(/^[ \t]+/gm, "")        /* [A] を 外した あとの 頭の 空きを 消す */
      .replace(/\n{3,}/g, "\n\n");
  };

  /* タグが 1 つでも 入っているか（入っていなければ 前と 同じ 道で 読む） */
  VQ.タグがある = function (text) {
    var s = String(text || "");
    if (!/\[/.test(s) && !/^\s*[A-Da-d]\s*[:：]/m.test(s)) return false;
    var r = VQ.読む(s, {});
    return r.多人数 || r.段.some(function (x) {
      return x.style || (x.speed && x.speed !== 1) || x.pauseMs || x.voice;
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/wp/svg.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/wp/svg.js — SVG を **安全にしてから** 受け入れる（VQSVG）

   ★ 訴え（2026-08-28）
     「生成時に、スライドに新たに 参考資料（フリーのものを ネットから
       持ってきたり）、SVG で 精密に 素早く 正確に 描写したり… が
       できるように なればいい。これは プレゼンだけじゃないからな？
       他の 3 つも そう」

   ★ なぜ 要るか
     SVG は **絵の顔をした 書類**。中に script も 外への 参照も 書ける。
     AI が 出したものを そのまま 画面へ 入れると、
       ・<script> が 動く
       ・<image href="http://…"> や <use href="http://…"> で 外へ 出る
       ・onload= などの 仕掛けが 走る
     ので、**入れる前に 必ず ここを 通す**。
     出すときではなく **入れるとき**に 清める（保存されたものは いつも 清い）。

   ★ 決めごと
     ・許すものだけ 通す（禁じるものを 数える やりかたは 抜けが 出る）
     ・外への 参照は 一切 通さない。`#…`（自分の中）と
       `data:image/…`（埋め込み）だけ
     ・<style> は 通すが、@import と url(外) は 落とす
     ・大きすぎるもの・部品が 多すぎるものは 断る（画面が 固まるため）
     ・**直した所は 数えて 返す**（黙って 直さない）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQSVG = root.VQSVG || (root.VQSVG = {});

  var 最大バイト = 400 * 1024;
  function バイト数(s) {
    try { return new root.TextEncoder().encode(s).length; }
    catch (e) { return String(s || "").length * 3; }
  }
  var 最大部品 = 6000;

  /* 通してよい 要素。ここに 無いものは まるごと 落とす。 */
  var 通す要素 = {};
  ("svg g defs symbol use title desc metadata "
    + "path rect circle ellipse line polyline polygon "
    + "text tspan textPath "
    + "marker linearGradient radialGradient stop "
    + "clipPath mask pattern image switch "
    + "filter feGaussianBlur feOffset feBlend feColorMatrix feComposite "
    + "feFlood feMerge feMergeNode feDropShadow feTurbulence feDisplacementMap "
    + "style").split(" ").forEach(function (k) { 通す要素[k] = 1; });

  /* 明らかに 危ないもの。中身ごと 消す（子まで 消す）。 */
  var 消す要素 = {};
  ("script foreignObject iframe object embed video audio "
    + "animate animateMotion animateTransform set handler listener").split(" ")
    .forEach(function (k) { 消す要素[k] = 1; });

  /* 住所を 持つ 属性。ここだけ 中身を 見る。 */
  var 住所の属性 = { href: 1, "xlink:href": 1, src: 1, "xlink:show": 1, "xlink:actuate": 1 };

  function 住所はよいか(v) {
    var s = String(v || "").trim();
    if (!s) return false;
    if (s.charAt(0) === "#") return true;                       /* 自分の中 */
    if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(s)) return true;
    /* 手元の 置き場だけは 通す（表紙・取り込んだ 参考資料） */
    if (/^\/api\/media\//.test(s)) return true;
    return false;
  }

  /* style の 中の 外への 参照を 落とす。 */
  function 見た目を清める(css) {
    return String(css || "")
      .replace(/@import[^;]*;?/gi, "")
      .replace(/url\(\s*(['"]?)(?!#|data:image\/|\/api\/media\/)[^)]*\1\s*\)/gi, "none")
      .replace(/expression\s*\(/gi, "(")
      .replace(/javascript:/gi, "");
  }

  /* ── 本体 ────────────────────────────────────────────────────── */
  function 清める(文, o) {
    o = o || {};
    var 直し = [];
    var s = String(文 || "").trim();
    if (!s) return { ok: false, なぜ: "中身が ありません", svg: "", 直したところ: 直し };
    /* ★ **バイトで 測る**。s.length は 文字の 数（UTF-16）なので、
       日本語なら 1 文字 3 バイト。文字数で 測ると 上限が 3 倍 ゆるくなる。 */
    if (バイト数(s) > 最大バイト)
      return { ok: false, なぜ: "大きすぎます（" + Math.round(最大バイト / 1024) + "KB まで）",
               svg: "", 直したところ: 直し };
    /* ```svg …``` で 囲んで 来ることが ある（AI の 癖）。外す。 */
    var 囲 = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(s);
    if (囲) { s = 囲[1].trim(); 直し.push("囲みを外した"); }
    /* 前後の 文が くっついて 来ることも ある。<svg …> から </svg> までを 取る。 */
    var 頭 = s.indexOf("<svg");
    var 尻 = s.lastIndexOf("</svg>");
    if (頭 > 0 || (尻 >= 0 && 尻 + 6 < s.length)) {
      if (頭 < 0 || 尻 < 0) return { ok: false, なぜ: "SVG が 見つかりません", svg: "", 直したところ: 直し };
      s = s.slice(頭, 尻 + 6);
      直し.push("前後の文を外した");
    }
    if (s.indexOf("<svg") !== 0)
      return { ok: false, なぜ: "SVG では ありません", svg: "", 直したところ: 直し };

    var doc = null;
    try { doc = new root.DOMParser().parseFromString(s, "image/svg+xml"); } catch (e) { doc = null; }
    if (!doc) return { ok: false, なぜ: "読み取れません", svg: "", 直したところ: 直し };
    if (doc.getElementsByTagName("parsererror").length)
      return { ok: false, なぜ: "形が 壊れています", svg: "", 直したところ: 直し };
    var 根 = doc.documentElement;
    if (!根 || String(根.nodeName).toLowerCase() !== "svg")
      return { ok: false, なぜ: "いちばん外が <svg> では ありません", svg: "", 直したところ: 直し };

    var 数 = 0, 落ちた = 0, 属性落ち = 0;
    (function 歩く(el) {
      if (++数 > 最大部品) return;
      var 子 = Array.prototype.slice.call(el.childNodes);
      for (var i = 0; i < 子.length; i++) {
        var c = 子[i];
        if (c.nodeType === 8) { el.removeChild(c); continue; }        /* 覚え書き */
        if (c.nodeType !== 1) continue;
        var 名 = String(c.nodeName).toLowerCase().replace(/^.*:/, "");
        if (消す要素[名] || !通す要素[名]) { el.removeChild(c); 落ちた++; continue; }
        if (名 === "style") { c.textContent = 見た目を清める(c.textContent); }
        /* 属性を 見る */
        var 属 = Array.prototype.slice.call(c.attributes || []);
        for (var j = 0; j < 属.length; j++) {
          var a = 属[j], an = String(a.name).toLowerCase();
          if (an.indexOf("on") === 0) { c.removeAttribute(a.name); 属性落ち++; continue; }
          if (住所の属性[an] || an === "xlink:href") {
            if (!住所はよいか(a.value)) { c.removeAttribute(a.name); 属性落ち++; }
            continue;
          }
          if (an === "style") {
            var v2 = 見た目を清める(a.value);
            if (v2 !== a.value) { c.setAttribute(a.name, v2); 属性落ち++; }
          }
        }
        歩く(c);
      }
    })(根);

    if (数 > 最大部品)
      return { ok: false, なぜ: "部品が 多すぎます（" + 最大部品 + " まで）", svg: "", 直したところ: 直し };
    if (落ちた) 直し.push("危ない部品を " + 落ちた + " 個 外した");
    if (属性落ち) 直し.push("外へ出る指定を " + 属性落ち + " 個 外した");

    /* 根の 属性も 同じ 手で 清める（上の 歩きは 子だけを 見ている） */
    var 根属 = Array.prototype.slice.call(根.attributes || []);
    for (var k = 0; k < 根属.length; k++) {
      var ra = 根属[k], rn = String(ra.name).toLowerCase();
      if (rn.indexOf("on") === 0) { 根.removeAttribute(ra.name); 直し.push("根の仕掛けを外した"); }
      else if ((住所の属性[rn] || rn === "xlink:href") && !住所はよいか(ra.value)) 根.removeAttribute(ra.name);
      else if (rn === "style") 根.setAttribute(ra.name, 見た目を清める(ra.value));
    }

    /* ★ **viewBox を 必ず 持たせる**。無いと 箱に 合わせて 伸ばせず、
       スライドの 中で 元の 大きさのまま はみ出す。 */
    if (!根.getAttribute("viewBox")) {
      var w = parseFloat(根.getAttribute("width") || "") || 0;
      var h = parseFloat(根.getAttribute("height") || "") || 0;
      if (w > 0 && h > 0) { 根.setAttribute("viewBox", "0 0 " + w + " " + h); 直し.push("viewBox を 付けた"); }
      else { 根.setAttribute("viewBox", "0 0 100 100"); 直し.push("viewBox が 無いので 100×100 と した"); }
    }
    /* 箱に 合わせて 伸び縮みさせる。width/height は 外す（CSS で 決める）。 */
    根.removeAttribute("width");
    根.removeAttribute("height");
    if (!根.getAttribute("preserveAspectRatio")) 根.setAttribute("preserveAspectRatio", "xMidYMid meet");
    根.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    var 出 = "";
    try { 出 = new root.XMLSerializer().serializeToString(根); } catch (e) { 出 = ""; }
    if (!出) return { ok: false, なぜ: "書き出せません", svg: "", 直したところ: 直し };
    return { ok: true, svg: 出, 直したところ: 直し, 部品数: 数, なぜ: "" };
  }

  /* 箱に 収めて 出すための 包み。中身は すでに 清いもの だけを 渡すこと。 */
  function 包む(清いSVG, o) {
    o = o || {};
    return '<div class="wp-svg"' + (o.cls ? ' data-k="' + o.cls + '"' : "") + ">" + 清いSVG + "</div>";
  }

  var CSS = ".wp-svg{display:block;width:100%;height:100%;min-height:0;}"
    + ".wp-svg>svg{display:block;width:100%;height:100%;max-width:100%;}"
    /* 印刷でも 出す。既定では 背景や 塗りが 落ちる。 */
    + "@media print{.wp-svg{break-inside:avoid;}"
    + ".wp-svg>svg{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}";

  VQSVG.清める = 清める;
  VQSVG.包む = 包む;
  VQSVG.CSS = function () { return CSS; };
  VQSVG.最大バイト = 最大バイト;
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/wp/stock.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/wp/stock.js — 参考資料（自由に 使える 絵）を 探して 取り込む（VQSTOCK）

   ★ 訴え（2026-08-28）
     「生成時に、スライドに 新たに 参考資料（フリーのものを ネットから
       持ってきたり）… これは プレゼンだけじゃないからな？ 他の 3 つも そう」

   ★ 決めごと
     ・探すのも 取り込むのも **サーバを 通す**（/api/stock/find・/api/stock/adopt）。
       画面から 直に 外へ 出ない（CORS で 落ちるし、追跡もされる）。
     ・貼るのは **取り込んだ あとの 住所**（/api/media/…）。
       外の 住所を そのまま 貼ると、消える・遅い・追跡される。
     ・**出どころと 決まり（ライセンス）を 必ず 持ち回る。**
       CC-BY は 作者の 名前を 出すのが 決まり。ここを 落とすと 決まり違反。
       だから 取り込んだ 結果には いつも credit が 付く。
     ・4 つ（Docs / Sheets / Slides / Forms）で **同じ ここ**を 使う。
       画面ごとに 書くと、片方だけ 出どころを 出し忘れる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQSTOCK = root.VQSTOCK || (root.VQSTOCK = {});

  function 台() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function 札() {
    try { return String(root.localStorage.getItem("app.auth.token.v1") || ""); } catch (e) { return ""; }
  }
  function 頼む(道, 中身) {
    var h = { "Content-Type": "application/json" };
    var t = 札();
    if (t) h.Authorization = "Bearer " + t;
    return root.fetch(台() + 道, { method: "POST", headers: h, body: JSON.stringify(中身 || {}) })
      .then(function (r) {
        return r.text().then(function (txt) {
          var d = null;
          try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; }
          if (!r.ok) {
            var e2 = new Error((d && d.message) || ("うまくいきませんでした（" + r.status + "）"));
            e2.状態 = r.status; e2.中身 = d;
            throw e2;
          }
          return d || {};
        });
      });
  }

  /* ── 探す ────────────────────────────────────────────────────── */
  function 探す(言葉, o) {
    o = o || {};
    var q = String(言葉 || "").replace(/\s+/g, " ").trim();
    if (!q) return Promise.resolve({ ok: false, なぜ: "探す言葉が ありません", images: [] });
    return 頼む("/api/stock/find", { q: q, limit: Math.max(1, Math.min(24, o.limit || 12)) })
      .then(function (d) {
        return { ok: true, images: d.images || [], 提供元: d.提供元 || [],
                 落ちた: d.落ちた || [], 決まり: d.決まり || "" };
      })
      .catch(function (e) { return { ok: false, なぜ: String(e && e.message || e), images: [] }; });
  }

  /* ── 取り込む（こちらの 置き場へ 写す）────────────────────────── */
  function 取り込む(絵) {
    if (!絵 || !絵.url) return Promise.resolve({ ok: false, なぜ: "選ばれていません" });
    return 頼む("/api/stock/adopt", {
      url: 絵.url, 印: 絵.取り込み印 || "",
      author: 絵.author || "", license: 絵.license || "",
      licenseUrl: 絵.licenseUrl || "", page: 絵.page || "", source: 絵.source || ""
    }).then(function (d) {
      return { ok: true, url: d.url, bytes: d.bytes || 0, credit: d.credit || {},
               contentType: d.contentType || "" };
    }).catch(function (e) { return { ok: false, なぜ: String(e && e.message || e) }; });
  }

  /* ── 出どころの 一行（貼った 絵の 下に 出す）───────────────────
     ★ 「作者 / 決まり / 出どころ」を 短く 1 行に する。
       決まりが 分からないものは **出さない**（探す側で 落としてある）。 */
  function 出どころの文(credit) {
    var c = credit || {};
    var 並 = [];
    if (c.author) 並.push(String(c.author).slice(0, 60));
    if (c.license) 並.push(String(c.license));
    if (c.source) 並.push(String(c.source));
    return 並.join(" / ");
  }
  function 出どころのHTML(credit, esc) {
    var 文 = 出どころの文(credit);
    if (!文) return "";
    var e = esc || function (s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };
    var 頁 = String((credit || {}).page || "");
    var 中 = e(文);
    if (/^https:\/\//.test(頁)) {
      中 = '<a href="' + e(頁) + '" target="_blank" rel="noopener noreferrer nofollow">' + 中 + "</a>";
    }
    return '<div class="wp-credit">出典: ' + 中 + "</div>";
  }

  var CSS = ".wp-credit{font-size:10px;line-height:1.5;color:var(--vq-text-tertiary,#9994A8);"
    + "margin-top:3px;word-break:break-word;}"
    + ".wp-credit a{color:inherit;text-decoration:underline;}"
    /* 印刷でも 消さない。決まりで 出す ものなので、消えたら 決まり違反になる。 */
    + "@media print{.wp-credit{display:block !important;color:#555 !important;}}";

  VQSTOCK.探す = 探す;
  VQSTOCK.取り込む = 取り込む;
  VQSTOCK.出どころの文 = 出どころの文;
  VQSTOCK.出どころのHTML = 出どころのHTML;
  VQSTOCK.CSS = function () { return CSS; };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/wp/theme.js ───────── */
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


/* ───────── /core/wp/math.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/wp/math.js — Workplace 4 画面 **共通**の 数式（VQWPM）

   ★ 訴え（2026-08-28）
     「Workplace の 4 つに、数式が 適用されても 反映もされてない。
       … PDF として 出力した時に、なぜか 文字しか 反映されてない」

   ★ 何が 起きていたか（実測 2026-08-28・数えた）
       ui-docs.js   … 数式に 触る行 **12**（実装あり）
       ui-sheets.js … **0**
       ui-slides.js … **0**
       ui-forms.js  … **0**
     つまり **壊れていたのではなく、3 つには 最初から 無かった**。
     さらに Docs でも、印刷の 組み立て（printBodyHtml）の switch に
     "math" が 無く、既定の <p> へ 落ちていた ＝ 紙には 出ない。

   ★ ここで するのは 1 つ
     **4 画面が 同じ ここを 通す**。片方だけ 直る、を なくす。

   ★ なぜ SVG か（core/math/svg.js の 但し書きと 同じ）
     印刷の 窓は 別の 文書で、外の CSS も 書体も 届かない。
     SVG に 固めれば 通信も 書体も 要らずに そのまま 出る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQWPM = root.VQWPM || (root.VQWPM = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 実体を戻す(s) {
    return 文(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  }

  /* ── 1 つ 組む。まだ 読めていなければ null（呼び側が 素の字を 出す）── */
  function 組む(latex, display) {
    var M = root.VQM;
    if (!M || !M.svg) return null;
    var src = 文(latex);
    /* ① や ½ のような 記号を TeX へ 直す仕掛けが あれば 通す。 */
    try {
      if (root.VQ2 && root.VQ2.qrender && root.VQ2.qrender.uniToTex)
        src = root.VQ2.qrender.uniToTex(src);
    } catch (e) {}
    try { return M.svg.同期(src, !!display); } catch (e2) { return null; }
  }

  /* まだなら 読み込みを 始める。読めたら vqm:ready が 飛ぶ。 */
  function 用意() {
    try {
      var M = root.VQM;
      if (M && M.svg && !M.svg.読み込み済み()) M.svg.要る();
    } catch (e) {}
  }
  function 読めている() {
    try { return !!(root.VQM && root.VQM.svg && root.VQM.svg.読み込み済み()); }
    catch (e) { return false; }
  }

  /* ── 文の 中の $…$ / $$…$$ を 組む ────────────────────────────
     ★ **タグの 外だけ**を 見る。中を 見ると 属性の $ まで 拾って 壊す。
     ★ 組めないものは **そのままの 字**で 出す（黙って 消さない）。 */
  var 式の形 = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

  function 平文の式(seg) {
    if (!seg || seg.indexOf("$") < 0) return seg;
    var 出 = "", at = 0, m;
    式の形.lastIndex = 0;
    while ((m = 式の形.exec(seg)) !== null) {
      出 += seg.slice(at, m.index);
      var 表示 = m[1] !== undefined;
      var 生 = 実体を戻す(表示 ? m[1] : m[2]);
      var h = 組む(生, 表示);
      出 += h
        ? '<span class="wp-m' + (表示 ? " wp-m--b" : "") + '">' + h + "</span>"
        : m[0];
      at = 式の形.lastIndex;
    }
    出 += seg.slice(at);
    return 出;
  }

  function 描く(html) {
    var s = 文(html);
    if (s.indexOf("$") < 0) return s;
    用意();
    var 出 = [], last = 0, re = /<[^>]*>/g, m;
    while ((m = re.exec(s)) !== null) {
      出.push(平文の式(s.slice(last, m.index)));
      出.push(m[0]);
      last = re.lastIndex;
    }
    出.push(平文の式(s.slice(last)));
    return 出.join("");
  }

  /* 素の 文字（HTML では ないもの）用。エスケープしてから 組む。
     Sheets の セル・Slides の 箱・Forms の 質問文は こちら。 */
  function 素の文を描く(text) {
    var s = 文(text);
    if (s.indexOf("$") < 0) return esc(s);
    用意();
    var 出 = "", at = 0, m;
    式の形.lastIndex = 0;
    while ((m = 式の形.exec(s)) !== null) {
      出 += esc(s.slice(at, m.index));
      var 表示 = m[1] !== undefined;
      var h = 組む(表示 ? m[1] : m[2], 表示);
      出 += h ? '<span class="wp-m' + (表示 ? " wp-m--b" : "") + '">' + h + "</span>" : esc(m[0]);
      at = 式の形.lastIndex;
    }
    出 += esc(s.slice(at));
    return 出;
  }

  function 式がある(text) { return 文(text).indexOf("$") >= 0; }

  /* ── 読み終わったら 描き直す ──────────────────────────────────
     ★ ここが 無いと「最初の 1 回は 素の字、あとは 何も 起きない」に なる。
       MathJax は 2.2MB あるので、**最初の 描画には まず 間に合わない**。
     ★ 同じ 画面が 何度も 登録しないよう、外し方も 返す。 */
  function 読めたら(fn) {
    if (typeof fn !== "function") return function () {};
    var 一度 = function () { try { fn(); } catch (e) {} };
    try { root.document.addEventListener("vqm:ready", 一度); } catch (e) {}
    /* もう 読めているなら すぐ 1 回（登録が 遅れた 場合の 取りこぼし防止） */
    if (読めている()) { try { root.setTimeout(一度, 0); } catch (e) {} }
    return function () {
      try { root.document.removeEventListener("vqm:ready", 一度); } catch (e) {}
    };
  }

  /* ── 紙にする 前に **待つ** ────────────────────────────────────
     ★ MathJax は 数式が 出てきたとき に 読み始める（2.2MB）。
       読み終わる 前に PDF を 押されると、組めないので 素の $…$ が
       そのまま 紙に 出る（実測 2026-08-28: Forms で 踏んだ）。
       印刷の 道は **必ず ここを 通してから** 組み立てる。
     ★ 届かなくても 止めない（既定 6 秒で 見切る）。
       出ないより、素の字でも 出るほうが まし。 */
  function 用意して待つ(上限) {
    var ms = Math.max(0, Number(上限) || 6000);
    return new Promise(function (done) {
      if (読めている()) { done(true); return; }
      用意();
      var 済 = false;
      var 外す = null;
      var 終 = function (v) {
        if (済) return; 済 = true;
        try { if (外す) 外す(); } catch (e) {}
        done(v);
      };
      外す = 読めたら(function () { 終(true); });
      try { root.setTimeout(function () { 終(読めている()); }, ms); }
      catch (e) { 終(false); }
    });
  }

  var CSS = ".wp-m{display:inline-block;vertical-align:middle;max-width:100%;}"
    + ".wp-m svg{max-width:100%;height:auto;vertical-align:middle;}"
    + ".wp-m--b{display:block;text-align:center;margin:.5em 0;}"
    /* 印刷でも そのまま 出す（SVG なので 書体も 通信も 要らない） */
    + "@media print{.wp-m{break-inside:avoid;}"
    + ".wp-m svg{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}";

  VQWPM.組む = 組む;
  VQWPM.描く = 描く;
  VQWPM.素の文を描く = 素の文を描く;
  VQWPM.式がある = 式がある;
  VQWPM.用意 = 用意;
  VQWPM.読めている = 読めている;
  VQWPM.読めたら = 読めたら;
  VQWPM.用意して待つ = 用意して待つ;
  VQWPM.CSS = function () { return CSS; };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/board/store.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/board/store.js — ボードを **残しておく**（AR Board）

   ★ 訴え（2026-08-17）「ボードが 消えちゃうじゃん。もったいないから
     左サイドメニューに AR Board を 追加して、そこに 格納して。
     できれば 写真付きだと、どこの 何かが 分かるから」。

   ★ 決めごと
     ・置き場は **この端末の中**（localStorage）。写真が 入るので 外へは 出さない。
     ・写真は **小さくしてから** しまう（横 480px・JPEG 65%）。
       もとのまま しまうと 1 枚 1MB を 超えて、すぐ 入らなくなる。
     ・入り切らなくなったら **古いものから 捨てる**（黙って 全部 消さない）。
     ・利用者ごとに 分ける（ownerId）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var 鍵 = "vq2.arboards.v1";
  var 上限 = 60;
  /* いま 入っている いちばん大きい 連番の 次から 始める（読み込み直しても 続く） */
  var 連番 = 0;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 今() { return new Date().toISOString(); }
  function id() { return "brd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function 主() {
    try {
      var ST = root.VQ2 && root.VQ2.store;
      if (ST && ST.currentOwnerId) return ST.currentOwnerId() || "local";
    } catch (e) {}
    return "local";
  }

  /* ══ 置き場を IndexedDB へ 移した（2026-08-19）══════════════════════
     ★ 実測: localStorage の 上限は **4.4MB**。利用者の端末は すでに 4.61MB。
       AR Board は 写真（1 枚 数十 KB）と 動く中身（コード）を 持つので、
       ここに 置き続けると **いちばん早く 壁に当たる**。
       IndexedDB は 同じ端末で **7.4GB**（実測）。
     ★ ただし 読み書きは **待つ形**でしか できない。画面は もう
       「その場で 読める」前提で 書いてあるので、**手元に 写しを 置く**。
         起動 → 1 回だけ 読み込む → 以後は 写しから 即答
         書いたとき → 写しを 直して、裏で IndexedDB へ 書く
     ★ IndexedDB が 使えない端末では これまでどおり localStorage。 */
  var 写し = null;          /* 読み込み済みの 中身（null = まだ 読んでいない） */
  var 読み込み = null;      /* 読み込み中の 約束 */

  function 生で読む() {
    try {
      var s = root.localStorage.getItem(鍵);
      var a = s ? JSON.parse(s) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  /* 起動のとき 1 回だけ。**待てる所から 呼ぶ**（VQB.store.用意）。 */
  function 用意() {
    if (写し) return Promise.resolve(写し);
    if (読み込み) return 読み込み;
    var IDB = root.VQIDB;
    if (!IDB || !IDB.使える()) { 写し = 生で読む(); return Promise.resolve(写し); }
    読み込み = IDB.大きいものを読む(鍵).then(function (s) {
      var a = [];
      try { a = s ? JSON.parse(s) : []; } catch (e) { a = []; }
      写し = Array.isArray(a) ? a : [];
      /* まだ localStorage に 残っていたら、こちらへ 移して 向こうは 空ける。 */
      try {
        if (root.localStorage.getItem(鍵) !== null) {
          IDB.大きいものを書く(鍵, JSON.stringify(写し));
        }
      } catch (e) {}
      連番を数え直す();
      return 写し;
    }).catch(function () { 写し = 生で読む(); return 写し; });
    return 読み込み;
  }
  function 全部() {
    if (写し) return 写し;
    /* まだ 読んでいないなら、**手元にあるぶんだけ**返す（空を 返さない）。
       用意() を 呼んでおけば ここへは 来ない。 */
    写し = 生で読む();
    用意();
    return 写し;
  }
  function 書く(a) {
    写し = a.slice();
    var IDB = root.VQIDB;
    if (IDB && IDB.使える()) {
      /* 裏で 書く。失敗しても 手元の写しは 生きているので 画面は 動く。 */
      IDB.大きいものを書く(鍵, JSON.stringify(写し));
      return true;
    }
    try { root.localStorage.setItem(鍵, JSON.stringify(写し)); return true; }
    catch (e) {
      /* 入り切らない。**古いものから 捨てて** もう一度（黙って 全部 消さない）。 */
      var b = 写し.slice();
      while (b.length > 1) {
        b.shift();
        try { root.localStorage.setItem(鍵, JSON.stringify(b)); 写し = b; return true; } catch (e2) {}
      }
      return false;
    }
  }
  function 連番を数え直す() {
    try { (写し || []).forEach(function (x) { if (Number(x.seq) > 連番) 連番 = Number(x.seq); }); }
    catch (e) {}
  }

  /* 連番は 読み込みが 済んだところで 数え直す（用意() の中）。
     ここで 全部() を 呼ぶと、まだ 読めていない時点の 数で 決まってしまう。 */

  function 一覧(o) {
    o = o || {};
    var 主人 = o.ownerId || 主();
    return 全部().filter(function (x) { return !x.ownerId || x.ownerId === 主人; })
      /* ★ **時刻だけでは 並びが 決まらない**（2026-08-17・実測）。
         同じ秒に 2 枚 しまうと ISO の 文字列が 同じになり、
         新しいほうが 先に 来ない。連番で 決着を つける。 */
      .sort(function (a, b) {
        var d = (Number(b.seq) || 0) - (Number(a.seq) || 0);
        return d !== 0 ? d : 文(b.at).localeCompare(文(a.at));
      });
  }
  function 取る(i) {
    var a = 全部();
    for (var k = 0; k < a.length; k++) if (a[k].id === i) return a[k];
    return null;
  }

  /* 写真を 小さくする。**元のまま しまわない。** */
  function 縮める(dataUrl, 最大幅) {
    return new Promise(function (done) {
      if (!dataUrl) return done("");
      try {
        var im = new root.Image();
        im.onload = function () {
          try {
            var W = Math.min(Number(最大幅) || 480, im.width || 480);
            var H = Math.round((im.height || 1) * (W / (im.width || 1)));
            var cv = root.document.createElement("canvas");
            cv.width = W; cv.height = H;
            cv.getContext("2d").drawImage(im, 0, 0, W, H);
            done(cv.toDataURL("image/jpeg", 0.65));
          } catch (e) { done(""); }
        };
        im.onerror = function () { done(""); };
        im.src = dataUrl;
      } catch (e) { done(""); }
    });
  }

  /* しまう。戻り { id, 写真あり } */
  /* ★ 種類が 2 つに なった（2026-08-19）:
       note … これまでの ボード（マークダウン）
       app  … **動くもの**（AR App）。中で 触れる ゲーム・教材。
     どちらも 同じ 置き場に 並ぶ。読むときは kind で 分ける。 */
  function 足す(o) {
    o = o || {};
    var 種 = 文(o.kind) === "app" ? "app" : "note";
    var md = 文(o.markdown).slice(0, 12000);
    var 符 = null;
    if (種 === "app") {
      var c = o.code || {};
      /* ★ 上限を 大きくした（2026-08-19 の 2 度目・「まじで すごいものを 一発で」）。
         200 行までと 縛っていたら、そもそも すごいものが 書けない。
         localStorage は 5MB ほど 入るので、1 本 十数万字でも 何本も 持てる。 */
      符 = {
        html: 文(c.html).slice(0, 80000),
        css: 文(c.css).slice(0, 40000),
        js: 文(c.js).slice(0, 120000),
        code: 文(c.code).slice(0, 160000),
        /* 借りた道具（phaser / three …）。開き直したときも 同じものを 借りる。 */
        libs: Array.isArray(c.libs) ? c.libs.slice(0, 8).map(function (x) { return 文(x).slice(0, 24); }) : []
      };
      if (!(符.html + 符.css + 符.js + 符.code).trim())
        return Promise.resolve({ だめ: "動かす中身が ありません。" });
    } else if (!md.trim()) {
      return Promise.resolve({ だめ: "中身が ありません。" });
    }
    return 縮める(o.photo, 480).then(function (小) {
      var rec = {
        id: id(), ownerId: 主(),
        /* 並べるための 連番。時刻が 同じでも 前後が 決まる。 */
        seq: (連番 = 連番 + 1),
        title: 文(o.title).slice(0, 80) || (種 === "app" ? "AR App" : "ボード"),
        kind: 種,
        code: 符,
        markdown: md,
        photo: 小 || "",
        source: 文(o.source).slice(0, 40) || (種 === "app" ? "app" : "board"),
        subject: 文(o.subject).slice(0, 24),
        at: 今()
      };
      var a = 全部();
      a.push(rec);
      while (a.length > 上限) a.shift();
      var ok = 書く(a);
      if (!ok) return { だめ: "端末に 入り切りませんでした。古いものを 消してください。" };
      return { id: rec.id, 写真あり: !!rec.photo, 数: 一覧().length };
    });
  }

  function 消す(i) {
    var a = 全部(), 前 = a.length;
    a = a.filter(function (x) { return x.id !== i; });
    書く(a);
    return 前 - a.length;
  }
  function 全消し() {
    var n = 一覧().length;
    var 主人 = 主();
    書く(全部().filter(function (x) { return x.ownerId && x.ownerId !== 主人; }));
    return n;
  }
  function 名を変える(i, 名) {
    var a = 全部(), 出 = false;
    a.forEach(function (x) { if (x.id === i) { x.title = 文(名).slice(0, 80); 出 = true; } });
    if (出) 書く(a);
    return 出;
  }
  function 使っている量() {
    try { return Math.round(JSON.stringify(写し || []).length / 1024); }
    catch (e) { return 0; }
  }

  /* 起動のとき 1 回だけ 読み込む（待てる所から）。ここを 呼び忘れると、
     1 回目の 一覧が 手元のぶんだけになる（次の描き直しで そろう）。 */
  try { 用意(); } catch (e) {}

  VQB.store = { 一覧: 一覧, 取る: 取る, 足す: 足す, 消す: 消す, 全消し: 全消し,
                名を変える: 名を変える, 使っている量: 使っている量, 縮める: 縮める,
                上限: 上限, 用意: 用意 };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/board/play.js ───────── */
/* ══════════════════════════════════════════════════════════════════════════
   core/board/play.js — 板を **上から下まで 解説する**（2026-08-19）

   訴え:
     「ボードが 出たときに、タイトルの右に 再生マークを 置いてほしい。
       ここを 再生すると、ボードを 上から下まで Lumi が 解説できるように。
       リアルタイムで 解説している部分に マーカーを 引いたり、
       波線を 新たに 引いたり、自由に ペンで 説明できたりも できるように。
       あとは 追加で テキストで リアルタイムに 文字を 増やしたり」

   ここが 引き受けること（**声は 出さない**。声は vq-live が 持つ）:
     ・板の中身を **区切り**に 分ける（見出し・段落・箇条書き・表・式）
     ・いま話している区切りへ **すっと 動かして**、そこを 目立たせる
     ・上に 透明な 板を 重ねて、そこへ 線を 引く
         marker … 蛍光ペン（文字の 上に 重ねる）
         wave   … 波線（文字の 下に 引く）
         pen    … 自由な線（Lumi が 点を 渡す／人が 指で 描く）
         box    … 囲み
         arrow  … 矢印
     ・区切りの あとに **文字を 足す**（言いながら 書き足す）

   守ること:
     ・線は **中身と 同じ座標**で 持つ。だから 動かしても ずれない。
     ・板の 中身を 書き換えない（線は 別の 重ね板）。消せば 元どおり。
     ・重ね板は 触れない（pointer-events:none）。ただし
       **人が 描くとき だけ** 触れるようにする。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  if (VQB.play) return;
  var doc = root.document;

  var CSS = [
    ".vqp-host{position:relative;}",
    ".vqp-lay{position:absolute;inset:0;pointer-events:none;z-index:3;overflow:visible;}",
    ".vqp-lay.on{pointer-events:auto;cursor:crosshair;}",
    /* 蛍光ペン。明るい画面は かけ算（下の 字が 透ける）。
       暗い画面で かけ算に すると **真っ黒に 沈んで 字が 読めない**ので、
       重ねかたを 変える。どちらでも 字は 読める。 */
    ".vqp-mk{mix-blend-mode:multiply;}",
    "@media (prefers-color-scheme:dark){.vqp-mk{mix-blend-mode:screen;opacity:.30;}}",
    /* いま話している所 */
    ".vqp-now{position:relative;z-index:1;}",
    ".vqp-now::before{content:'';position:absolute;inset:-6px -10px;border-radius:10px;",
    "background:rgba(124,110,220,.10);box-shadow:0 0 0 1.5px rgba(124,110,220,.30);",
    "pointer-events:none;animation:vqp-in .22s ease;}",
    "@keyframes vqp-in{from{opacity:0;transform:scale(.99)}to{opacity:1;transform:none}}",
    /* 言いながら 足した文字 */
    ".vqp-add{display:block;margin:6px 0 0;padding:7px 10px;border-radius:9px;",
    "background:rgba(124,110,220,.08);border-left:3px solid rgba(124,110,220,.55);",
    "font-size:.95em;line-height:1.85;animation:vqp-in .2s ease;}",
    ".vqp-cursor{display:inline-block;width:2px;height:1em;vertical-align:-.15em;",
    "background:currentColor;animation:vqp-blink 1s steps(2) infinite;margin-left:1px;}",
    "@keyframes vqp-blink{50%{opacity:0}}",
    /* 操作の帯 */
    ".vqp-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;}",
    ".vqp-bar button{height:30px;padding:0 11px;border-radius:999px;font:inherit;font-size:12.5px;",
    "font-weight:650;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}",
    ".vqp-bar button.on{background:#5F579E;border-color:#5F579E;color:#fff;}",
    ".vqp-bar .sp{flex:1 1 auto;}",
    ".vqp-bar .st{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);",
    "font-variant-numeric:tabular-nums;}",
    /* 下線に つける 番号（①②③…）。線の 左端に 小さく 出す。 */
    ".vqp-no{position:absolute;transform:translate(-50%,-50%);font-size:11px;font-weight:750;",
    "line-height:1;color:#fff;background:#E0563C;border-radius:999px;min-width:16px;height:16px;",
    "display:flex;align-items:center;justify-content:center;padding:0 4px;pointer-events:none;",
    "box-shadow:0 1px 3px rgba(16,15,26,.25);animation:vqp-in .2s ease;}",
    /* 付箋。ボードに **無いこと**を あとから 貼る。 */
    /* ★ 付箋は **紙**。暗い画面でも 紙のままにする（2026-08-20・訴え
       「ダークモードだと 付箋が ちょっと 怪しいかもしれない」）。
       もとは 背景だけ 決めて 字の色を 決めていなかった。
       暗い画面では 字が 明るい色を 受け継ぐので、
       **薄い黄色の 紙に 白い字**になって 読めなくなる。
       字の色を ここで 決め打つ。紙の色も 暗い画面では 少し 沈める。 */
    ".vqp-tag{position:relative;display:block;margin:8px 0 2px;padding:10px 12px 10px 13px;",
    "border-radius:10px;background:#FFF8D6;border:1px solid #F0E2A0;color:#2B2836;",
    "box-shadow:0 2px 8px rgba(16,15,26,.10);font-size:.94em;line-height:1.85;",
    "animation:vqp-in .22s ease;}",
    ".vqp-tag *{color:inherit;}",
    ".vqp-tag mark{background:rgba(255,214,0,.55);color:#2B2836;}",
    ".vqp-tag code{background:rgba(16,15,26,.09);color:#2B2836;}",
    ".vqp-tag::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;",
    "border-radius:3px;background:#E3B341;}",
    ".vqp-tag.aoi{background:#EAF2FE;border-color:#C9DCF7;}",
    ".vqp-tag.aoi::before{background:#5B8DEF;}",
    ".vqp-tag.midori{background:#EAF6EE;border-color:#CBE6D6;}",
    ".vqp-tag.midori::before{background:#4C9A6A;}",
    ".vqp-tag.momo{background:#FDECEF;border-color:#F5CBD4;}",
    ".vqp-tag.momo::before{background:#D9587A;}",
    ".vqp-tag>*:first-child{margin-top:0;}",
    ".vqp-tag>*:last-child{margin-bottom:0;}",
    ".vqp-tag h1,.vqp-tag h2,.vqp-tag h3{font-size:1.02em;margin:.5em 0 .3em;}",
    ".vqp-tag code{background:rgba(16,15,26,.07);padding:.1em .35em;border-radius:4px;}",
    ".vqp-tag ul,.vqp-tag ol{margin:.3em 0 .3em 1.2em;}",
    /* 暗い画面。紙は 少し 沈め、字は 濃いまま（読めることを 最優先）。 */
    "@media (prefers-color-scheme:dark){",
    ".vqp-tag{background:#F2E7BE;border-color:#D9C888;color:#241F14;",
    "box-shadow:0 2px 10px rgba(0,0,0,.42);}",
    ".vqp-tag.aoi{background:#D9E6FA;border-color:#A9C4EA;color:#12213A;}",
    ".vqp-tag.midori{background:#D8EDDF;border-color:#A8CDB7;color:#12291C;}",
    ".vqp-tag.momo{background:#F7DCE3;border-color:#E2AFBD;color:#33141C;}",
    ".vqp-tag mark{background:rgba(255,196,0,.55);color:#241F14;}",
    ".vqp-tag code{background:rgba(0,0,0,.10);color:#241F14;}}"
  ].join("");

  /* ══ 色（2026-08-19・訴え「背景の 色つきマーカーで 線を 引けるものも 追加して。
     破綻しないように」）════════════════════════════════════════════
     ★ 色は **選ばせない**（好きな色を 渡させると、濃すぎて 字が 読めなくなる）。
       名前で 選ぶ。濃さは こちらで 決める。
     ★ 暗い画面では multiply だと **真っ黒に 沈む**ので、
       重ねかたを 変える（CSS の @media で 切り替え）。
     ★ 線（波線・囲み・矢印）は はっきり 見える 濃い色、
       蛍光ペンは 薄い色。同じ 名前でも 用途で 分ける。 */
  var 色見本 = {
    "": { 塗: "#FFE24D", 線: "#E0563C" },
    "きいろ": { 塗: "#FFE24D", 線: "#C9922B" },
    "ももいろ": { 塗: "#FFC1D4", 線: "#D9587A" },
    "あお": { 塗: "#BBD9FF", 線: "#3E72C9" },
    "みどり": { 塗: "#B8ECC8", 線: "#3E9160" },
    "だいだい": { 塗: "#FFD1A6", 線: "#D2762A" },
    "むらさき": { 塗: "#DCCBFF", 線: "#7A5BD1" },
    "あか": { 塗: "#FFC6C0", 線: "#D1373B" }
  };
  /* 英語でも 受ける（言い方を 縛らない）。 */
  var 色の別名 = { yellow: "きいろ", pink: "ももいろ", blue: "あお", green: "みどり",
                   orange: "だいだい", purple: "むらさき", red: "あか",
                   黄: "きいろ", 桃: "ももいろ", 青: "あお", 緑: "みどり",
                   橙: "だいだい", 紫: "むらさき", 赤: "あか" };
  function 色を選ぶ(名, 用途) {
    var k = String(名 || "").trim();
    if (色の別名[k]) k = 色の別名[k];
    var c = 色見本[k] || 色見本[""];
    /* 名前で 選ばれなかった とき、**#rrggbb を 渡されても 受けない**。
       濃さが 分からない色を 塗ると 字が 消える。既定に 落とす。 */
    return 用途 === "塗" ? c.塗 : c.線;
  }

  /* ── 区切りを 見つける ────────────────────────────────────────
     見出し・段落・箇条書き・表・式。**中に 字が 在るもの**だけ。 */
  var 区切りの札 = "h1,h2,h3,h4,p,li,blockquote,pre,table,.vqmd-math,.vqm-svg,figure";
  function 区切りを拾う(親) {
    if (!親) return [];
    var 出 = [], 見た = [];
    var 並 = 親.querySelectorAll(区切りの札);
    for (var i = 0; i < 並.length; i++) {
      var e = 並[i];
      /* 入れ子（li の 中の p など）は 外側だけ 採る */
      var 中に入っている = false;
      for (var j = 0; j < 見た.length; j++) if (見た[j].contains(e)) { 中に入っている = true; break; }
      if (中に入っている) continue;
      var t = String(e.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      見た.push(e);
      出.push({ i: 出.length, el: e, text: t });
    }
    return 出;
  }

  /* ══ どこが **大事か** を 板から 読む（2026-08-20・訴え）════════════
     「カッコが あったり、マーカーが 引いてあるところや、Lumi が 重要だと
       思う部分を **徹底的に 解説に 入れられるように**して欲しい」

     ★ 大事さは **書いた人が すでに 印を つけている**。
       太字・下線・蛍光ペン・注意書き・カッコ・数と式。
       それを 数えれば「どこを 厚く 話すか」は こちらで 決められる。
       Lumi の 気分に 任せない。
     ★ 拾った言葉は **そのまま 渡す**。「ここは 必ず 触れて」と 言えるようにする。 */
  function 見どころ(el) {
    var 出 = [], 重み = 0;
    var 足す = function (t, 種, 点) {
      t = String(t || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 60) return;
      if (出.some(function (x) { return x.語 === t; })) return;
      出.push({ 語: t, 種: 種 }); 重み += 点;
    };
    try {
      /* ① 印が ついている所（いちばん 強い） */
      el.querySelectorAll("mark").forEach(function (x) { 足す(x.textContent, "蛍光ペン", 3); });
      el.querySelectorAll("strong,b").forEach(function (x) { 足す(x.textContent, "太字", 2); });
      el.querySelectorAll("u").forEach(function (x) { 足す(x.textContent, "下線", 2); });
      el.querySelectorAll("code").forEach(function (x) { 足す(x.textContent, "そのままの語", 1); });
      el.querySelectorAll(".vqmd-math,.vqmd-math-b").forEach(function (x) { 足す(x.textContent, "式", 2); });
      /* ② 注意書き（> [!大事] など）は かたまりごと 大事 */
      if (el.closest && el.closest(".vqmd-cal")) 重み += 3;
      if (/^H[1-4]$/.test(el.tagName || "")) 重み += 2;      /* 見出し */
      /* ③ カッコの 中（言いかえ・読み・補足が 入る所） */
      var t = String(el.textContent || "");
      var m = t.match(/[（(]([^（()）]{1,40})[)）]/g) || [];
      m.slice(0, 4).forEach(function (x) {
        足す(x.replace(/^[（(]|[)）]$/g, ""), "かっこの中", 2);
      });
      /* ④ 数・式が 出てくる所 */
      if (/\d/.test(t)) 重み += 1;
    } catch (e) {}
    return { 語ら: 出, 重み: 重み };
  }

  /* ══ 意味の まとまりに 束ねる（2026-08-20・訴え）════════════════════
     「1 行 1 行 解説しているから、同じ説明を 2 回くらい することがある。
       ちょっと くどいかもな」

     ★ 板は 見出し → 説明 → 箇条書き…と 続く。1 行ずつ 話すと
       **同じことを 言い直す**（箇条書きの 3 行は だいたい 同じ話）。
     ★ 見出しで 区切り、その下の 行を ひとまとめにする。
       見出しが 無ければ 600 字ごとに 束ねる。
     ★ まとまりの 中の どの行に 線を 引くかは 番号で 指せるように 残す。 */
  function 段に束ねる(区切り) {
    var 段 = [], いま = null;
    var 新しく = function (x) {
      いま = { i: 段.length, 見出し: "", 行: [], 番号: [], 語ら: [], 重み: 0 };
      段.push(いま);
      return いま;
    };
    区切り.forEach(function (x) {
      var 見 = /^H[1-4]$/.test((x.el.tagName || "").toUpperCase());
      var 長い = いま && いま.行.join("").length > 600;
      if (!いま || 見 || 長い) 新しく();
      if (見 && !いま.見出し) いま.見出し = x.text;
      else いま.行.push(x.text);
      いま.番号.push(x.i);
      var v = 見どころ(x.el);
      いま.重み += v.重み;
      v.語ら.forEach(function (g) {
        if (いま.語ら.length < 8 && !いま.語ら.some(function (y) { return y.語 === g.語; })) いま.語ら.push(g);
      });
    });
    /* 中身の 無い 段は 落とす */
    return 段.filter(function (d) { return (d.見出し + d.行.join("")).trim(); })
      .map(function (d, i) {
        d.i = i;
        d.text = (d.見出し ? "■ " + d.見出し + "\n" : "") + d.行.join("\n");
        return d;
      });
  }

  /* ══ ★★ 見た目（CSS）を **自分で 入れる**（2026-08-19・実測で 踏んだ）
     呼ぶ側に 任せていたら、**誰も 入れていなかった**。
     すると .vqp-lay の position:absolute が 効かず、
     重ね板は **ただの 要素として 本文の 後ろに 流し込まれる**。
     線は 字の 場所ではなく **本文の 下の 何もない所**に 並ぶ
     （実測: 字が y=384 で 終わっているのに 線は 423 / 530 / 650）。
     .vqp-host の position:relative も 効かないので 座標の 基準も ずれる。
     ここで 入れれば、どこから 呼ばれても 必ず 効く。 */
  function 見た目を入れる(親) {
    var d2 = (親 && 親.ownerDocument) || doc;
    var 置き場 = d2;
    /* 影の DOM の 中なら **その中へ**入れる（外の CSS は 届かない）。 */
    try {
      var r = 親 && 親.getRootNode && 親.getRootNode();
      if (r && r.host) 置き場 = r;
    } catch (e) {}
    try {
      if (置き場.querySelector && 置き場.querySelector("style[data-vqp]")) return;
      var st2 = d2.createElement("style");
      st2.setAttribute("data-vqp", "1");
      st2.textContent = CSS;
      (置き場.head || 置き場).appendChild(st2);
    } catch (e) {}
  }

  function 作る(o) {
    o = o || {};
    var 中 = o.中身;                    /* 字が 入っている 要素（.vqmd / .vqn-b） */
    var 巻 = o.巻物 || 中;              /* 縦に 動く 入れ物 */
    if (!中) return null;
    見た目を入れる(中);

    /* 重ね板（線を 引く所）。**中身と 同じ 大きさ**にする。
       ★ position は **必ず** relative にする（2026-08-19）。
         「static のときだけ」にしていたが、CSS が 効かないと
         classList だけ 付いても relative に ならない。
         style で 直に 当てれば、どんな CSS でも 崩れない。 */
    中.classList.add("vqp-host");
    try { if (getComputedStyle(中).position === "static") 中.style.position = "relative"; } catch (e) {}
    var 面 = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    面.setAttribute("class", "vqp-lay");
    面.setAttribute("aria-hidden", "true");
    /* ★ 要のところは **style で 直に**（クラスだけだと 誰かの CSS に 負ける）。 */
    面.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:3;overflow:visible;";
    中.appendChild(面);

    var 区切り = 区切りを拾う(中);
    var いま = -1, 描く手 = null, 引いたもの = [], 番号カウンタ = 0;
    /* ══ 引いた線の **控え**（2026-08-20）════════════════════════════
       訴え「ボードを 自由に 縮小拡大できたりとかも いいかも」。
       字の 大きさを 変えると 字は 組み直されるが、**線は 組み直されない**
       （線は 引いた ときの 座標を そのまま 持っている）。
       だから 変えたら ここから **引き直す**。
       ★ 付箋・書き足した文は ふつうの 要素なので 一緒に 流れる。
         引き直すのは **座標を 持っているもの**（線と 番号の玉）だけ。 */
    var 台帳 = [], 座標もの = [];

    function 測り直す() {
      var w = 中.scrollWidth || 中.clientWidth || 1;
      var h = 中.scrollHeight || 中.clientHeight || 1;
      面.setAttribute("viewBox", "0 0 " + w + " " + h);
      面.setAttribute("width", w); 面.setAttribute("height", h);
      面.style.width = w + "px"; 面.style.height = h + "px";
    }
    測り直す();
    var 見張り = null, 直し待ち = null;
    try {
      見張り = new root.ResizeObserver(function () {
        測り直す();
        /* ★ 大きさが 変われば 字は 組み直される。線も 引き直さないと
           **前の 座標のまま 取り残される**（2026-08-20）。
           続けて 何度も 呼ばれるので 少し 待ってから 1 回だけ。 */
        if (直し待ち) clearTimeout(直し待ち);
        直し待ち = setTimeout(function () { 直し待ち = null; try { 引き直す(); } catch (e2) {} }, 180);
      });
      見張り.observe(中);
    } catch (e) {}

    /* 中身の 中での 位置（重ね板と 同じ 座標）。 */
    function 場所(el) {
      var a = el.getBoundingClientRect(), b = 中.getBoundingClientRect();
      return { x: a.left - b.left + 中.scrollLeft, y: a.top - b.top + 中.scrollTop,
               w: a.width, h: a.height };
    }
    /* 字の 1 行ずつの 場所（蛍光ペンを 行ごとに 引くため）。 */
    function 行たち(el) {
      var 出 = [];
      try {
        var r = doc.createRange(); r.selectNodeContents(el);
        var 箱 = r.getClientRects(), b = 中.getBoundingClientRect();
        for (var i = 0; i < 箱.length; i++) {
          var c = 箱[i];
          if (c.width < 2 || c.height < 2) continue;
          出.push({ x: c.left - b.left + 中.scrollLeft, y: c.top - b.top + 中.scrollTop,
                    w: c.width, h: c.height });
        }
      } catch (e) {}
      if (!出.length) 出.push(場所(el));
      return 出;
    }

    function 印(名, 中身) {
      var e = doc.createElementNS("http://www.w3.org/2000/svg", 名);
      for (var k in 中身) e.setAttribute(k, 中身[k]);
      面.appendChild(e); 引いたもの.push(e); 座標もの.push(e);
      return e;
    }
    /* すっと 現れる（急に 出さない）。 */
    var 引き直し中 = false;
    function 現す(e, ミリ秒) {
      /* 引き直しでは すっと 出さない（何度も 動くと ちらつく）。 */
      if (引き直し中) return;
      try {
        var L = e.getTotalLength ? e.getTotalLength() : 0;
        if (L) {
          e.style.strokeDasharray = L; e.style.strokeDashoffset = L;
          e.style.transition = "stroke-dashoffset " + (ミリ秒 || 500) + "ms ease";
          requestAnimationFrame(function () { e.style.strokeDashoffset = "0"; });
        } else {
          e.style.opacity = "0"; e.style.transition = "opacity " + (ミリ秒 || 300) + "ms ease";
          requestAnimationFrame(function () { e.style.opacity = "1"; });
        }
      } catch (x) {}
    }

    /* ── 線を 引く ──────────────────────────────────────────── */
    function 引く(種類, o2) {
      o2 = o2 || {};
      /* 引き直しの ためだけに 控える。__再 は 引き直しの ときの 目印。 */
      if (!o2.__再) 台帳.push({ 種類: 種類, o2: o2 });
      var 色 = 色を選ぶ(o2.color, 種類 === "marker" ? "塗" : "線");
      var 的 = o2.el || (Number.isFinite(o2.block) ? (区切り[o2.block] || {}).el : null)
             || (いま >= 0 ? (区切り[いま] || {}).el : null);
      if (種類 === "pen" && Array.isArray(o2.points) && o2.points.length > 1) {
        var d = "M" + o2.points.map(function (p) { return p[0] + " " + p[1]; }).join(" L");
        var e0 = 印("path", { d: d, fill: "none", stroke: 色, "stroke-width": o2.width || 3,
                              "stroke-linecap": "round", "stroke-linejoin": "round" });
        現す(e0, 700); return true;
      }
      if (!的) return false;

      if (種類 === "marker") {
        行たち(的).forEach(function (r, i) {
          var 高 = Math.min(r.h * 0.62, 20);
          var e = 印("rect", { x: r.x - 2, y: r.y + r.h - 高 - 1, width: r.w + 4, height: 高,
                               rx: 3, fill: 色, opacity: 0.42, class: "vqp-mk" });
          setTimeout(function () { 現す(e, 260); }, i * 70);
        });
        return true;
      }
      /* 番号つきの 下線（①②③…）。順番に 見せたいときに 使う。 */
      if (種類 === "number" || 種類 === "numbered") {
        var 番 = Number.isFinite(Number(o2.no)) ? Number(o2.no) : (++番号カウンタ);
        o2.no = 番;                       /* 引き直しても 番が ずれないように 焼き付ける */
        var 行1 = 行たち(的);
        行1.forEach(function (r, i) {
          var y1 = r.y + r.h - 1;
          var e5 = 印("line", { x1: r.x, y1: y1, x2: r.x + r.w, y2: y1,
                                stroke: 色, "stroke-width": o2.width || 2.2,
                                "stroke-linecap": "round" });
          setTimeout(function () { 現す(e5, 420); }, i * 80);
        });
        var r0 = 行1[0];
        var 玉 = doc.createElement("span");
        玉.className = "vqp-no";
        玉.textContent = String(番);
        /* ★ 玉は 真ん中で 置くので、そのままだと 左端の 見出し（x≒0）で
           **半分 板の外**へ 出る（2026-08-20・実測）。中へ 寄せる。 */
        玉.style.left = Math.max(10, r0.x - 2) + "px";
        玉.style.top = (r0.y + r0.h + 2) + "px";
        中.appendChild(玉); 引いたもの.push(玉); 座標もの.push(玉);
        return true;
      }
      /* かたまり ぜんぶの 背景を 塗る（見出しや 短い段落を 目立たせるとき）。
         字の 上ではなく **後ろ**に 敷くので、どんな色でも 字は 読める。 */
      if (種類 === "back" || 種類 === "背景") {
        var p3 = 場所(的);
        var 左3 = Math.max(1, p3.x - 8), 右3 = Math.min((中.scrollWidth || p3.x + p3.w) - 1, p3.x + p3.w + 8);
        var e6 = 印("rect", { x: 左3, y: Math.max(1, p3.y - 5), width: Math.max(4, 右3 - 左3), height: p3.h + 10,
                              rx: 8, fill: 色, opacity: 0.28, class: "vqp-mk" });
        現す(e6, 320);
        return true;
      }
      if (種類 === "wave") {
        行たち(的).forEach(function (r, i) {
          var y = r.y + r.h - 1, d = "M" + r.x + " " + y, x = r.x;
          var 幅 = 6, 高 = 3;
          while (x < r.x + r.w) {
            d += " q" + (幅 / 2) + " " + (-高) + " " + 幅 + " 0";
            d += " q" + (幅 / 2) + " " + 高 + " " + 幅 + " 0";
            x += 幅 * 2;
          }
          var e = 印("path", { d: d, fill: "none", stroke: 色, "stroke-width": o2.width || 2,
                               "stroke-linecap": "round" });
          setTimeout(function () { 現す(e, 500); }, i * 90);
        });
        return true;
      }
      if (種類 === "box") {
        var p = 場所(的);
        var 左2 = Math.max(1.5, p.x - 6), 右2 = Math.min((中.scrollWidth || p.x + p.w) - 1.5, p.x + p.w + 6);
        var e2 = 印("rect", { x: 左2, y: Math.max(1.5, p.y - 4), width: Math.max(6, 右2 - 左2),
                              height: p.h + 8, rx: 8,
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4 });
        現す(e2, 620); return true;
      }
      /* ══ 矢印（2026-08-20・訴え「矢印の位置が ちょっと 気になる」）══
         もとの 決め打ちが 悪かった。実測で 分かったこと:
           ① 的の **まんなか**（q.y + q.h/2）を 指していた。
              かたまりが 何行も あると、まんなかは **字と 字の すきま**。
              「1. 領域」のように 下に 説明が ぶら下がる かたまりでは、
              矢は 見出しでは なく 下の 行を 指す。
           ② 尾を いつも **左上 46px**に 置いていた。左端の 見出し
              （x≒0）では 尾が **板の 外**（x=-54）に はみ出す。
              overflow:visible なので 消えず、板の 縁に 貼り付いて 見える。
           ③ 矢じりが l-9 -3 / l-4 -8 の **決め打ち**。尾の 向きが
              変わっても 羽の 向きは 変わらないので、右から 指すと
              羽が 逆を 向く。
         直しかた:
           ・**1 行目の 高さ**を 指す（行たち の 先頭）。字の 横に 付く。
           ・左に 余地が あれば 左から、無ければ 右から、
             どちらも 無ければ 上（上も 詰まっていれば 下）から。
           ・尾は **必ず 板の中**へ 収める。
           ・矢じりは 尾→頭の **角度から 計算**する。 */
      if (種類 === "arrow") {
        var 行3 = 行たち(的), r2 = 行3[0] || 場所(的);
        var 板W = 中.scrollWidth || 中.clientWidth || 1;
        var 板H = 中.scrollHeight || 中.clientHeight || 1;
        var 矢長 = 42, すき = 9, 頭x, 頭y, 尾x, 尾y;
        var 中心y = r2.y + r2.h / 2;
        if (r2.x - すき - 矢長 >= 6) {                       /* 左から */
          頭x = r2.x - すき; 頭y = 中心y; 尾x = 頭x - 矢長; 尾y = 頭y - 15;
        } else if (r2.x + r2.w + すき + 矢長 <= 板W - 6) {   /* 右から */
          頭x = r2.x + r2.w + すき; 頭y = 中心y; 尾x = 頭x + 矢長; 尾y = 頭y - 15;
        } else if (r2.y - 34 >= 6) {                          /* 上から */
          頭x = r2.x + Math.min(30, r2.w * 0.35); 頭y = r2.y - 6;
          尾x = 頭x - 26; 尾y = 頭y - 26;
        } else {                                              /* 下から */
          頭x = r2.x + Math.min(30, r2.w * 0.35); 頭y = r2.y + r2.h + 6;
          尾x = 頭x - 26; 尾y = 頭y + 26;
        }
        尾x = Math.max(4, Math.min(板W - 4, 尾x));
        尾y = Math.max(4, Math.min(板H - 4, 尾y));
        頭x = Math.max(3, Math.min(板W - 3, 頭x));
        頭y = Math.max(3, Math.min(板H - 3, 頭y));
        var e3 = 印("path", { d: "M" + 尾x.toFixed(1) + " " + 尾y.toFixed(1)
                                 + " L" + 頭x.toFixed(1) + " " + 頭y.toFixed(1),
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4,
                              "stroke-linecap": "round" });
        現す(e3, 420);
        var 角 = Math.atan2(頭y - 尾y, 頭x - 尾x), 羽 = 10, 開 = 0.44;
        var 羽1x = 頭x - 羽 * Math.cos(角 - 開), 羽1y = 頭y - 羽 * Math.sin(角 - 開);
        var 羽2x = 頭x - 羽 * Math.cos(角 + 開), 羽2y = 頭y - 羽 * Math.sin(角 + 開);
        var e4 = 印("path", { d: "M" + 羽1x.toFixed(1) + " " + 羽1y.toFixed(1)
                                 + " L" + 頭x.toFixed(1) + " " + 頭y.toFixed(1)
                                 + " L" + 羽2x.toFixed(1) + " " + 羽2y.toFixed(1),
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4,
                              "stroke-linecap": "round", "stroke-linejoin": "round" });
        setTimeout(function () { 現す(e4, 200); }, 400);
        return true;
      }
      return false;
    }

    /* ── 文字を 足す（言いながら 書き足す）───────────────────── */
    function 書く(文, o2) {
      o2 = o2 || {};
      var 的 = Number.isFinite(o2.block) ? (区切り[o2.block] || {}).el
             : (いま >= 0 ? (区切り[いま] || {}).el : null);
      var 箱 = doc.createElement("div");
      箱.className = "vqp-add";
      if (的 && 的.parentNode) 的.parentNode.insertBefore(箱, 的.nextSibling);
      else 中.appendChild(箱);
      引いたもの.push(箱);
      var 全 = String(文 || "");
      if (o2.instant) { 箱.textContent = 全; 測り直す(); return 箱; }
      /* 1 文字ずつ。**速すぎず 遅すぎず**（読める速さ）。 */
      var i = 0, 印棒 = doc.createElement("span");
      印棒.className = "vqp-cursor";
      箱.appendChild(印棒);
      var t = setInterval(function () {
        if (i >= 全.length) { clearInterval(t); try { 印棒.remove(); } catch (e) {} 測り直す(); return; }
        印棒.insertAdjacentText("beforebegin", 全.charAt(i++));
      }, Math.max(12, Math.min(60, o2.speed || 26)));
      引いたもの.push({ 止める: function () { clearInterval(t); } });
      return 箱;
    }

    /* ── いま話している所へ 動く ───────────────────────────── */
    function 進む(i) {
      if (!区切り.length) return null;
      i = Math.max(0, Math.min(区切り.length - 1, Number(i) || 0));
      if (いま >= 0 && 区切り[いま]) 区切り[いま].el.classList.remove("vqp-now");
      いま = i;
      var e = 区切り[i].el;
      e.classList.add("vqp-now");
      try {
        /* 巻物の 中で **真ん中あたり**へ。画面ごと 飛ばさない。 */
        var a = e.getBoundingClientRect(), b = 巻.getBoundingClientRect();
        var 先 = 巻.scrollTop + (a.top - b.top) - Math.max(24, b.height * 0.28);
        巻.scrollTo({ top: Math.max(0, 先), behavior: "smooth" });
      } catch (x) { try { e.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (y) {} }
      return 区切り[i];
    }

    /* ── 人が 指で 描く ──────────────────────────────────── */
    function 手描き(on, o2) {
      o2 = o2 || {};
      if (!on) {
        面.classList.remove("on");
        if (描く手) { 描く手(); 描く手 = null; }
        return false;
      }
      面.classList.add("on");
      var 引き中 = null, 点 = [];
      var 場 = function (ev) {
        var b = 面.getBoundingClientRect();
        return [Math.round(ev.clientX - b.left), Math.round(ev.clientY - b.top)];
      };
      var 始 = function (ev) {
        ev.preventDefault();
        点 = [場(ev)];
        引き中 = 印("path", { d: "M" + 点[0][0] + " " + 点[0][1], fill: "none",
                             stroke: o2.color || "#E0563C", "stroke-width": o2.width || 3,
                             "stroke-linecap": "round", "stroke-linejoin": "round" });
        try { 面.setPointerCapture(ev.pointerId); } catch (e) {}
      };
      var 動 = function (ev) {
        if (!引き中) return;
        ev.preventDefault();
        var p = 場(ev); 点.push(p);
        引き中.setAttribute("d", "M" + 点.map(function (q) { return q[0] + " " + q[1]; }).join(" L"));
      };
      var 終 = function () { 引き中 = null; };
      面.addEventListener("pointerdown", 始);
      面.addEventListener("pointermove", 動);
      面.addEventListener("pointerup", 終);
      面.addEventListener("pointercancel", 終);
      描く手 = function () {
        面.removeEventListener("pointerdown", 始);
        面.removeEventListener("pointermove", 動);
        面.removeEventListener("pointerup", 終);
        面.removeEventListener("pointercancel", 終);
      };
      return true;
    }

    /* ══ 付箋（2026-08-19・訴え）════════════════════════════════
       「すでに 作られている ボードに ない ことも、追加で 上書きで
         付箋なんかを ボードに 貼り付けて、わかりやすくしたり。
         （付箋にも マークダウン適用）」
       ★ 中身は **マークダウン**として 組む（VQMD が あれば）。
       ★ 元の 中身は 触らない。消せば きれいに 戻る。 */
    function 付箋(文, o2) {
      o2 = o2 || {};
      var 的 = Number.isFinite(Number(o2.block)) ? (区切り[Number(o2.block)] || {}).el
             : (いま >= 0 ? (区切り[いま] || {}).el : null);
      var 箱 = doc.createElement("div");
      箱.className = "vqp-tag" + (o2.color ? " " + String(o2.color) : "");
      var md = String(文 || "");
      try {
        if (root.VQMD && root.VQMD.render) 箱.innerHTML = root.VQMD.render(md);
        else 箱.textContent = md;
      } catch (e) { 箱.textContent = md; }
      if (的 && 的.parentNode) 的.parentNode.insertBefore(箱, 的.nextSibling);
      else 中.appendChild(箱);
      引いたもの.push(箱);
      測り直す();
      return 箱;
    }

    /* ══ 引き直す（2026-08-20）════════════════════════════════════
       字の 大きさ・板の 幅が 変わったら 呼ぶ。線だけ 引き直す。
       ★ 付箋と 書き足した文は **消さない**（ふつうの要素なので 流れる）。 */
    function 引き直す() {
      if (!台帳.length) { 測り直す(); return 0; }
      引き直し中 = true;
      座標もの.forEach(function (e) {
        try { e.remove(); } catch (x) {}
        var k = 引いたもの.indexOf(e); if (k >= 0) 引いたもの.splice(k, 1);
      });
      座標もの = [];
      測り直す();
      番号カウンタ = 0;
      var 控 = 台帳.slice();
      控.forEach(function (x) {
        var o3 = {}; for (var k in x.o2) o3[k] = x.o2[k];
        o3.__再 = true;
        try { 引く(x.種類, o3); } catch (e2) {}
      });
      引き直し中 = false;
      return 控.length;
    }

    function 消す() {
      番号カウンタ = 0;
      引いたもの.forEach(function (e) {
        try { if (e && e.止める) e.止める(); else if (e && e.remove) e.remove(); } catch (x) {}
      });
      引いたもの = []; 座標もの = []; 台帳 = [];
    }
    function 片づける() {
      消す(); 手描き(false);
      if (いま >= 0 && 区切り[いま]) 区切り[いま].el.classList.remove("vqp-now");
      いま = -1;
      try { if (直し待ち) { clearTimeout(直し待ち); 直し待ち = null; } } catch (e) {}
      try { if (見張り) 見張り.disconnect(); } catch (e) {}
      try { 面.remove(); } catch (e) {}
      中.classList.remove("vqp-host");
    }

    return {
      区切り: function () { return 区切り.map(function (x) { return { i: x.i, text: x.text }; }); },
      /* 意味の まとまり（見出しごと）。解説は これを 1 つずつ 話す。 */
      段: function () {
        return 段に束ねる(区切り).map(function (d) {
          return { i: d.i, 見出し: d.見出し, text: d.text, 番号: d.番号.slice(),
                   重み: d.重み, 見どころ: d.語ら.slice() };
        });
      },
      数: function () { return 区切り.length; },
      いま: function () { return いま; },
      進む: 進む, 引く: 引く, 書く: 書く, 付箋: 付箋, 消す: 消す, 手描き: 手描き,
      測り直す: 測り直す, 引き直す: 引き直す, 片づける: 片づける
    };
  }

  VQB.play = { 作る: 作る, CSS: CSS, 区切りを拾う: 区切りを拾う,
               段に束ねる: 段に束ねる, 見どころ: 見どころ };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/board/runtime-embed.js ───────── */
(function(root){
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  /* AR App の 中で 使う 土台 API。**中身を そのまま 文字列で 持つ。** */
  VQB.RUNTIME = "/* ══════════════════════════════════════════════════════════════════════\n   core/board/runtime.js — AR App の 中で 使える 土台（window.VQ）\n\n   ★ 訴え（2026-08-19）「さらに 高度なアプリを 作れるように。今のじゃ まだまだ。\n     まじで すごいものを **一発で** 作れるように」。\n\n   ★ 一発で すごいものが 出ない いちばんの理由は「決まりきった書き物」。\n     canvas を 用意して、DPR を 合わせて、輪を 回して、キーを 拾って、\n     音を 鳴らして、点を 出して……ここまでで 100 行 使い切ってしまい、\n     **中身に たどりつく前に 力尽きる**。しかも 毎回 どこかを 間違える。\n   ★ だから **そこを ぜんぶ こちらが 持つ**。書くのは 中身だけにする。\n\n   ★ この文字列は 各アプリの 中（iframe）へ そのまま 差し込まれる。\n     外（本体）とは postMessage でしか つながらない。\n   ══════════════════════════════════════════════════════════════════════ */\n(function () {\n  \"use strict\";\n  var W = window, D = document;\n  if (W.VQ) return;\n\n  /* ── 外（本体）との やりとり ───────────────────────────────────── */\n  var 待ち = {}, 番 = 0;\n  function 送る(kind, o) {\n    try { W.parent.postMessage(Object.assign({ __vqapp: 1, kind: kind }, o || {}), \"*\"); }\n    catch (e) {}\n  }\n  function 頼む(kind, o, ms) {\n    return new Promise(function (done) {\n      var id = \"r\" + (++番);\n      var t = setTimeout(function () { if (待ち[id]) { delete 待ち[id]; done(null); } }, ms || 4000);\n      待ち[id] = function (v) { clearTimeout(t); done(v); };\n      送る(kind, Object.assign({ rid: id }, o || {}));\n    });\n  }\n  W.addEventListener(\"message\", function (e) {\n    var d = e && e.data;\n    if (!d || d.__vqapp !== 2) return;\n    if (d.rid && 待ち[d.rid]) { var f = 待ち[d.rid]; delete 待ち[d.rid]; f(d.value); }\n    if (d.kind === \"resize\") { VQ._fit(); }\n  });\n\n  /* ── 色（本体と そろえる）────────────────────────────────────── */\n  var 色 = {\n    地: \"#FCFBFE\", 面: \"#FFFFFF\", 線: \"#E7E4EF\",\n    字: \"#2B2836\", 薄字: \"#7A7589\", 主: \"#756DB3\", 主薄: \"#EAE8F7\",\n    good: \"#3E7A56\", bad: \"#A94A4A\", warn: \"#B0791F\",\n    彩: [\"#756DB3\", \"#5B9BD5\", \"#E08A5F\", \"#5FA97B\", \"#C96B8E\", \"#D6A93B\", \"#6FA8B5\", \"#9B7BC9\"]\n  };\n\n  /* ── 小道具 ──────────────────────────────────────────────────── */\n  function rnd(a, b) {\n    if (a === undefined) return Math.random();\n    if (b === undefined) return Math.random() * a;\n    return a + Math.random() * (b - a);\n  }\n  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }\n  function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : undefined; }\n  function shuffle(a) {\n    var b = (a || []).slice();\n    for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; }\n    return b;\n  }\n  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }\n  function lerp(a, b, t) { return a + (b - a) * t; }\n  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }\n  function hit(a, b) {\n    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;\n  }\n  function 円あたり(a, b) { return dist(a.x, a.y, b.x, b.y) < (a.r || 0) + (b.r || 0); }\n\n  /* ── 置き場 ──────────────────────────────────────────────────── */\n  function 根() {\n    var r = D.getElementById(\"vqapp\");\n    if (!r) { r = D.createElement(\"div\"); r.id = \"vqapp\"; D.body.appendChild(r); }\n    return r;\n  }\n\n  /* ── 絵を描く板（DPR も 大きさ合わせも こちらが やる）───────────── */\n  var _stage = null;\n  function stage(o) {\n    o = o || {};\n    var 親 = o.親 || 根();\n    var box = D.createElement(\"div\");\n    box.className = \"vq-stage\";\n    var cv = D.createElement(\"canvas\");\n    box.appendChild(cv);\n    親.appendChild(box);\n    var s = {\n      box: box, cv: cv, ctx: cv.getContext(\"2d\"),\n      w: Number(o.w) || 0, h: Number(o.h) || 0,\n      比: Number(o.比) || (o.w && o.h ? o.w / o.h : 0),\n      固定: !!(o.w && o.h && o.固定 !== false)\n    };\n    _stage = s;\n    合わせる();\n    W.addEventListener(\"resize\", 合わせる);\n    はめる(cv);\n    return s;\n\n    function 合わせる() {\n      var 幅 = Math.max(120, box.clientWidth || 親.clientWidth || 320);\n      var 高;\n      if (s.固定) {\n        /* 決められた大きさ。はみ出さないように 縮めて 収める。 */\n        var k = Math.min(1, 幅 / s.w);\n        高 = s.h * k;\n        cv.style.width = Math.round(s.w * k) + \"px\";\n        cv.style.height = Math.round(高) + \"px\";\n        描く画素(s.w, s.h);\n        return;\n      }\n      高 = s.比 ? 幅 / s.比 : Math.min(Math.max(200, W.innerHeight - 140), 520);\n      s.w = Math.round(幅); s.h = Math.round(高);\n      cv.style.width = \"100%\"; cv.style.height = Math.round(高) + \"px\";\n      描く画素(s.w, s.h);\n    }\n    function 描く画素(w, h) {\n      var dpr = Math.min(2, W.devicePixelRatio || 1);\n      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);\n      s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n    }\n  }\n\n  /* ── 動かす（毎こま 呼ぶ）──────────────────────────────────────── */\n  var _raf = 0, _fn = null, _前 = 0, _止 = false;\n  function loop(fn) {\n    _fn = fn; _前 = 0; _止 = false;\n    if (_raf) cancelAnimationFrame(_raf);\n    _raf = requestAnimationFrame(こま);\n    return { stop: stop, resume: function () { _止 = false; }, pause: function () { _止 = true; } };\n  }\n  function こま(t) {\n    _raf = requestAnimationFrame(こま);\n    if (!_fn || _止) { _前 = t; return; }\n    var dt = _前 ? Math.min(0.05, (t - _前) / 1000) : 0.016;\n    _前 = t;\n    /* ★ ここで 落ちても **輪は 止めない**（1 こま 飛ぶだけ）。\n       止めると 画面が 固まり、何が起きたか 分からなくなる。 */\n    try { _fn(dt, t / 1000); }\n    catch (e) { 止める理由(e); }\n  }\n  var _落ち回数 = 0;\n  function 止める理由(e) {\n    _落ち回数++;\n    if (_落ち回数 > 60) { stop(); }\n    if (_落ち回数 === 1 || _落ち回数 === 60) {\n      try { W.parent.postMessage({ __vqapp: 1, kind: \"error\",\n        message: \"毎こまの中で 止まりました: \" + ((e && e.message) || e) }, \"*\"); } catch (x) {}\n    }\n  }\n  function stop() { if (_raf) cancelAnimationFrame(_raf); _raf = 0; _fn = null; }\n\n  /* ── キーと 指 ────────────────────────────────────────────────── */\n  var keys = {}, _keyfn = {};\n  W.addEventListener(\"keydown\", function (e) {\n    keys[e.key] = true; keys[e.code] = true;\n    if (/^(Arrow|Space| )/.test(e.key)) { try { e.preventDefault(); } catch (x) {} }\n    var f = _keyfn[e.key] || _keyfn[e.code]; if (f) { try { f(e); } catch (x) {} }\n  });\n  W.addEventListener(\"keyup\", function (e) { keys[e.key] = false; keys[e.code] = false; });\n  W.addEventListener(\"blur\", function () { keys = {}; });\n  function key(k) { return !!keys[k]; }\n  function onKey(k, fn) { _keyfn[k] = fn; }\n  /* よく使う 4 方向を まとめて（矢印でも WASD でも 同じに 効く） */\n  function 十字() {\n    return {\n      x: (key(\"ArrowRight\") || key(\"KeyD\") ? 1 : 0) - (key(\"ArrowLeft\") || key(\"KeyA\") ? 1 : 0),\n      y: (key(\"ArrowDown\") || key(\"KeyS\") ? 1 : 0) - (key(\"ArrowUp\") || key(\"KeyW\") ? 1 : 0)\n    };\n  }\n\n  var pointer = { x: 0, y: 0, down: false, dx: 0, dy: 0 };\n  var _tap = [], _drag = [];\n  function はめる(el) {\n    var 前x = 0, 前y = 0;\n    var 場所 = function (e) {\n      var r = el.getBoundingClientRect();\n      var p = e.touches && e.touches[0] ? e.touches[0] : e;\n      var sx = (_stage && _stage.w ? _stage.w : r.width) / (r.width || 1);\n      var sy = (_stage && _stage.h ? _stage.h : r.height) / (r.height || 1);\n      pointer.x = (p.clientX - r.left) * sx;\n      pointer.y = (p.clientY - r.top) * sy;\n    };\n    var 下 = function (e) {\n      場所(e); pointer.down = true; 前x = pointer.x; 前y = pointer.y;\n      _tap.forEach(function (f) { try { f(pointer.x, pointer.y); } catch (x) {} });\n      try { e.preventDefault(); } catch (x) {}\n    };\n    var 動 = function (e) {\n      場所(e); pointer.dx = pointer.x - 前x; pointer.dy = pointer.y - 前y;\n      前x = pointer.x; 前y = pointer.y;\n      if (pointer.down) _drag.forEach(function (f) { try { f(pointer.x, pointer.y, pointer.dx, pointer.dy); } catch (x) {} });\n    };\n    var 上 = function () { pointer.down = false; };\n    el.addEventListener(\"mousedown\", 下); el.addEventListener(\"touchstart\", 下, { passive: false });\n    el.addEventListener(\"mousemove\", 動); el.addEventListener(\"touchmove\", 動, { passive: false });\n    W.addEventListener(\"mouseup\", 上); W.addEventListener(\"touchend\", 上);\n  }\n  function onTap(fn) { _tap.push(fn); }\n  function onDrag(fn) { _drag.push(fn); }\n\n  /* ── 音（外の道具は 要らない）──────────────────────────────────── */\n  var _ac = null;\n  function ac() {\n    if (!_ac) { try { _ac = new (W.AudioContext || W.webkitAudioContext)(); } catch (e) { _ac = null; } }\n    if (_ac && _ac.state === \"suspended\") { try { _ac.resume(); } catch (e) {} }\n    return _ac;\n  }\n  var 音名 = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };\n  function 高さ(n) {\n    if (typeof n === \"number\") return n;\n    var m = String(n).match(/^([A-G])(#|b)?(-?\\d)?$/);\n    if (!m) return 440;\n    var k = 音名[m[1]] + (m[2] === \"#\" ? 1 : m[2] === \"b\" ? -1 : 0);\n    var o = m[3] === undefined ? 4 : Number(m[3]);\n    return 440 * Math.pow(2, (k - 9) / 12 + (o - 4));\n  }\n  function beep(f, ms, o) {\n    o = o || {};\n    var c = ac(); if (!c) return;\n    var os = c.createOscillator(), g = c.createGain();\n    os.type = o.type || \"sine\";\n    os.frequency.value = 高さ(f === undefined ? 660 : f);\n    var v = o.音量 === undefined ? 0.14 : o.音量;\n    var t0 = c.currentTime + (o.遅れ || 0), t1 = t0 + (ms || 120) / 1000;\n    g.gain.setValueAtTime(0.0001, t0);\n    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);\n    g.gain.exponentialRampToValueAtTime(0.0001, t1);\n    os.connect(g); g.connect(c.destination);\n    os.start(t0); os.stop(t1 + 0.02);\n  }\n  function 並べて(列, 間) {\n    (列 || []).forEach(function (x, i) {\n      beep(x, (間 || 120) * 0.9, { 遅れ: (間 || 120) * i / 1000 });\n    });\n  }\n  var sound = {\n    beep: beep, note: beep, seq: 並べて,\n    click: function () { beep(880, 40, { type: \"square\", 音量: 0.06 }); },\n    good: function () { 並べて([\"E5\", \"G5\", \"C6\"], 90); },\n    bad: function () { beep(180, 260, { type: \"sawtooth\", 音量: 0.1 }); },\n    win: function () { 並べて([\"C5\", \"E5\", \"G5\", \"C6\", \"G5\", \"C6\"], 110); },\n    lose: function () { 並べて([\"G4\", \"E4\", \"C4\"], 160); },\n    tick: function () { beep(1200, 25, { type: \"square\", 音量: 0.04 }); }\n  };\n  function speak(t, o) {\n    o = o || {};\n    try {\n      var u = new W.SpeechSynthesisUtterance(String(t));\n      u.lang = o.lang || \"ja-JP\"; u.rate = o.rate || 1;\n      W.speechSynthesis.cancel(); W.speechSynthesis.speak(u);\n    } catch (e) {}\n  }\n\n  /* ── 覚えておく（外の 保存へ 預ける。iframe 単体では 持てない）──── */\n  var store = {\n    get: function (k, 既定) {\n      return 頼む(\"store.get\", { key: String(k) }).then(function (v) {\n        return v === null || v === undefined ? 既定 : v;\n      });\n    },\n    set: function (k, v) { 送る(\"store.set\", { key: String(k), value: v }); return true; }\n  };\n\n  /* ── 本体の 問題を 借りる（教材として いちばん 効く）─────────────── */\n  var quiz = {\n    get: function (o) {\n      o = o || {};\n      return 頼む(\"quiz.get\", { count: Number(o.count) || 10, presetId: o.presetId || \"\",\n                                subject: o.subject || \"\" }, 6000).then(function (v) {\n        return Array.isArray(v) ? v : [];\n      });\n    }\n  };\n\n  /* ── 画面の 部品（書かなくても それらしく 出る）──────────────────── */\n  function 作る(tag, cls, 中) {\n    var e = D.createElement(tag);\n    if (cls) e.className = cls;\n    if (中 !== undefined) e.textContent = 中;\n    return e;\n  }\n  var ui = {\n    panel: function (o) {\n      o = o || {};\n      var p = 作る(\"div\", \"vq-panel\");\n      if (o.title) p.appendChild(作る(\"h2\", \"\", o.title));\n      if (o.body) p.appendChild(作る(\"p\", \"vq-sub\", o.body));\n      (o.親 || 根()).appendChild(p);\n      return p;\n    },\n    row: function (親) { var r = 作る(\"div\", \"vq-row\"); (親 || 根()).appendChild(r); return r; },\n    button: function (label, fn, 親) {\n      var b = 作る(\"button\", \"vq-btn\", label);\n      b.type = \"button\";\n      b.addEventListener(\"click\", function () { sound.click(); try { fn && fn(b); } catch (e) {} });\n      (親 || 根()).appendChild(b);\n      return b;\n    },\n    slider: function (o) {\n      o = o || {};\n      var wrap = 作る(\"label\", \"vq-slider\");\n      var t = 作る(\"span\", \"vq-slider-l\", (o.label || \"\") + \"：\" + (o.value !== undefined ? o.value : 0));\n      var i = D.createElement(\"input\");\n      i.type = \"range\";\n      i.min = o.min === undefined ? 0 : o.min;\n      i.max = o.max === undefined ? 100 : o.max;\n      i.step = o.step === undefined ? 1 : o.step;\n      i.value = o.value === undefined ? i.min : o.value;\n      i.addEventListener(\"input\", function () {\n        t.textContent = (o.label || \"\") + \"：\" + i.value;\n        try { o.onChange && o.onChange(Number(i.value)); } catch (e) {}\n      });\n      wrap.appendChild(t); wrap.appendChild(i);\n      (o.親 || 根()).appendChild(wrap);\n      return { el: wrap, input: i, get: function () { return Number(i.value); },\n               set: function (v) { i.value = v; t.textContent = (o.label || \"\") + \"：\" + v; } };\n    },\n    label: function (t, 親) { var e = 作る(\"div\", \"vq-label\", t); (親 || 根()).appendChild(e); return e; },\n    toast: function (t, ms) {\n      var e = 作る(\"div\", \"vq-toast\", t);\n      D.body.appendChild(e);\n      setTimeout(function () { e.classList.add(\"out\"); }, (ms || 1600) - 260);\n      setTimeout(function () { try { e.remove(); } catch (x) {} }, ms || 1600);\n      return e;\n    },\n    /* 点・残り・時間を まとめて 出す 帯。数を 入れ替えるだけで 更新される。 */\n    hud: function (o) {\n      o = o || {};\n      var bar = 作る(\"div\", \"vq-hud\");\n      var 枠 = {};\n      Object.keys(o).forEach(function (k) {\n        if (k === \"親\") return;\n        var c = 作る(\"span\", \"vq-hud-i\");\n        c.appendChild(作る(\"b\", \"\", k));\n        var v = 作る(\"i\", \"\", String(o[k]));\n        c.appendChild(v); bar.appendChild(c); 枠[k] = v;\n      });\n      var 親 = o.親 || 根();\n      親.insertBefore(bar, 親.firstChild);\n      return { el: bar, set: function (k, v) { if (枠[k]) 枠[k].textContent = String(v); } };\n    }\n  };\n\n  /* ── うれしいときの 粒（外の道具は 使わない）─────────────────── */\n  function 祝う(o) {\n    o = o || {};\n    var n = o.数 || 90;\n    var cv = D.createElement(\"canvas\");\n    cv.className = \"vq-fx\";\n    var dpr = Math.min(2, W.devicePixelRatio || 1);\n    cv.width = W.innerWidth * dpr; cv.height = W.innerHeight * dpr;\n    D.body.appendChild(cv);\n    var g = cv.getContext(\"2d\"); g.setTransform(dpr, 0, 0, dpr, 0, 0);\n    var P = [];\n    for (var i = 0; i < n; i++) {\n      P.push({ x: (o.x === undefined ? W.innerWidth / 2 : o.x), y: (o.y === undefined ? W.innerHeight * 0.42 : o.y),\n               vx: rnd(-260, 260), vy: rnd(-420, -120), s: rnd(4, 9),\n               c: pick(色.彩), a: 1, r: rnd(0, 6.28), vr: rnd(-6, 6) });\n    }\n    var t0 = 0;\n    (function f(t) {\n      var dt = t0 ? Math.min(0.05, (t - t0) / 1000) : 0.016; t0 = t;\n      g.clearRect(0, 0, W.innerWidth, W.innerHeight);\n      var 生 = 0;\n      P.forEach(function (p) {\n        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.a -= dt * 0.55;\n        if (p.a <= 0) return;\n        生++;\n        g.save(); g.globalAlpha = Math.max(0, p.a); g.translate(p.x, p.y); g.rotate(p.r);\n        g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); g.restore();\n      });\n      if (生) requestAnimationFrame(f); else { try { cv.remove(); } catch (e) {} }\n    })(0);\n    if (o.音 !== false) sound.win();\n  }\n\n  /* ── 時間 ──────────────────────────────────────────────────── */\n  function timer(秒, o) {\n    o = o || {};\n    var 残 = Number(秒) || 30, 止 = false;\n    var id = setInterval(function () {\n      if (止) return;\n      残 -= 1;\n      try { o.onTick && o.onTick(残); } catch (e) {}\n      if (残 <= 0) { clearInterval(id); try { o.onEnd && o.onEnd(); } catch (e) {} }\n    }, 1000);\n    return { stop: function () { clearInterval(id); }, pause: function () { 止 = true; },\n             resume: function () { 止 = false; }, left: function () { return 残; } };\n  }\n\n  /* ── 絵を描く 近道（ctx を 毎回 書かなくてよい）───────────────── */\n  function 描(o) {\n    var s = _stage;\n    if (!s) return null;\n    var c = s.ctx;\n    var d = {\n      clear: function (col) { c.fillStyle = col || 色.地; c.fillRect(0, 0, s.w, s.h); return d; },\n      rect: function (x, y, w, h, col, r) {\n        c.fillStyle = col || 色.主;\n        if (r) { 角丸(c, x, y, w, h, r); c.fill(); } else c.fillRect(x, y, w, h);\n        return d;\n      },\n      line: function (x1, y1, x2, y2, col, 太) {\n        c.strokeStyle = col || 色.字; c.lineWidth = 太 || 2;\n        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); return d;\n      },\n      circle: function (x, y, r, col) {\n        c.fillStyle = col || 色.主; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); return d;\n      },\n      text: function (t, x, y, o2) {\n        o2 = o2 || {};\n        c.fillStyle = o2.色 || 色.字;\n        c.font = (o2.太 || 600) + \" \" + (o2.大きさ || 16) + \"px Inter,'Hiragino Sans','Noto Sans JP',sans-serif\";\n        c.textAlign = o2.寄せ || \"left\"; c.textBaseline = o2.縦 || \"top\";\n        c.fillText(String(t), x, y); return d;\n      },\n      img: function (im, x, y, w, h) { try { c.drawImage(im, x, y, w, h); } catch (e) {} return d; },\n      ctx: c, w: s.w, h: s.h\n    };\n    return d;\n  }\n  function 角丸(c, x, y, w, h, r) {\n    r = Math.min(r, w / 2, h / 2);\n    c.beginPath();\n    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);\n    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);\n    c.arcTo(x, y, x + w, y, r); c.closePath();\n  }\n\n  /* ── できあがりを 外へ 伝える（点数・終わった、など）───────────── */\n  function done(o) { 送る(\"done\", { value: o || {} }); }\n\n  /* ── まとめて 出す ─────────────────────────────────────────── */\n  var VQ = {\n    版: 1,\n    root: null, 色: 色, colors: 色,\n    stage: stage, loop: loop, stop: stop, 描: 描, draw: 描,\n    keys: keys, key: key, onKey: onKey, 十字: 十字, dpad: 十字,\n    pointer: pointer, onTap: onTap, onDrag: onDrag,\n    sound: sound, speak: speak, 祝う: 祝う, confetti: 祝う,\n    store: store, quiz: quiz, ui: ui, timer: timer, done: done,\n    rnd: rnd, rndInt: rndInt, pick: pick, shuffle: shuffle,\n    clamp: clamp, lerp: lerp, dist: dist, hit: hit, 円あたり: 円あたり,\n    角丸: 角丸,\n    ready: function (fn) {\n      if (D.readyState === \"loading\") D.addEventListener(\"DOMContentLoaded\", go);\n      else go();\n      function go() { VQ.root = 根(); try { fn(); } catch (e) { 止める理由(e); throw e; } }\n    },\n    _fit: function () { try { W.dispatchEvent(new Event(\"resize\")); } catch (e) {} }\n  };\n  try { VQ.root = 根(); } catch (e) {}\n  W.VQ = VQ;\n})();\n";
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ───────── /core/board/app.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/board/app.js — AR Board で **動くもの**（AR App）

   ★ 訴え（2026-08-19）
     ① 「その場で コードを書いて、ボードで 動く ゲームや 教材を すぐ 出して。
        **毎回 必ず 崩れずに**」
     ② 「さらに 高度なアプリを。今のじゃ まだまだ。**まじで すごいものを 一発で**」
     ③ 「外部のものを 最大限に 使って、普通に 日常でも、ゲームとしても、
        アプリとしても 使えて 遊べるものに」

   ★ ① を守りながら ②③ を出すために、次の 4 段で 作る。

     ㋐ **道具を 貸す**（/vendor/arapp/）
        phaser・three・matter・p5・pixi・konva・fabric・chart・d3・
        tone・howler・gsap・tailwind・katex・qrcode・sortable・lil-gui・confetti。
        名前で 頼むだけ。読み込む順も 置き場所も こちらが 持つ。
        **本体と 同じ出どころ**から 配るので、外へは 一切 出ない。

     ㋑ **土台の API（window.VQ）を 先に 差し込む**（runtime.js）
        canvas の 用意・DPR・毎こまの輪・キー・指・音・保存・点の帯・粒。
        決まりきった書き物で 力尽きないように、そこは 全部 こちらが 持つ。

     ㋒ **包みは こちらが 作る**
        doctype・文字コード・画面幅・土台の見た目・見張り。
        向こうには **中身だけ** 書かせる。忘れようが 崩れない。

     ㋓ **壊れても 外は 無傷、そして 黙らない**
        sandbox（allow-same-origin なし）＝ 本体の DOM も 保存も 触れない。
        落ちたら 中の帯に 出し、親へ 送り、Lumi が その場で 直す。

   ★ 外へは 繋がせない（connect-src 'none'）。
     日常づかいの道具（メモ・時計・家計・暗記・作図）も ゲームも、
     外に 出さずに 作れる。保存は VQ.store が 本体の 溜めへ 預かる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var doc = root.document;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══ 貸せる道具 ═════════════════════════════════════════════════
     名前 → 実ファイル。**版は 名前の中**（1 年 溜めてよい）。
     いくつか 別名を 受ける（言い間違えても 通るように）。 */
  var 道具 = {
    phaser:   { js: "phaser-3.87.0.js",   別: ["ゲームエンジン", "game"] },
    three:    { js: "three-0.149.0.js",   別: ["threejs", "3d", "3D"] },
    matter:   { js: "matter-0.20.0.js",   別: ["matterjs", "物理", "physics"] },
    p5:       { js: "p5-1.11.10.js",      別: ["p5js", "processing"] },
    pixi:     { js: "pixi-7.4.2.js",      別: ["pixijs"] },
    konva:    { js: "konva-9.3.16.js",    別: [] },
    fabric:   { js: "fabric-5.3.0.js",    別: ["fabricjs", "お絵かき"] },
    chart:    { js: "chart-4.5.0.js",     別: ["chartjs", "グラフ"] },
    d3:       { js: "d3-7.9.0.js",        別: ["d3js"] },
    tone:     { js: "tone-15.0.4.js",     別: ["tonejs", "音楽"] },
    howler:   { js: "howler-2.2.4.js",    別: ["howlerjs"] },
    gsap:     { js: "gsap-3.13.0.js",     別: ["アニメ", "animation"] },
    tailwind: { js: "tailwind-4.1.11.js", 別: ["tw", "tailwindcss"] },
    katex:    { js: "katex-0.16.11.js", css: "katex-0.16.11.css", 別: ["数式", "math"] },
    qrcode:   { js: "qrcode-1.0.0.js",    別: ["qr"] },
    sortable: { js: "sortable-1.15.6.js", 別: ["sortablejs", "並べ替え", "dnd"] },
    lilgui:   { js: "lilgui-0.20.0.js",   別: ["gui", "つまみ"] },
    confetti: { js: "confetti-1.9.3.js",  別: ["紙吹雪"] }
  };
  var 別名 = (function () {
    var m = {};
    Object.keys(道具).forEach(function (k) {
      m[k] = k;
      (道具[k].別 || []).forEach(function (a) { m[String(a).toLowerCase()] = k; });
    });
    return m;
  })();
  function 道具を選ぶ(v) {
    var 出 = [], 見 = {};
    var 列 = Array.isArray(v) ? v : 文(v).split(/[,\s、・]+/);
    列.forEach(function (x) {
      var k = 別名[String(x || "").trim().toLowerCase()];
      if (k && !見[k]) { 見[k] = 1; 出.push(k); }
    });
    return 出;
  }
  /* 名前を 書き忘れても、中身から 気づいて 貸す（一発で 出すために大事）。 */
  function 中身から気づく(全文, すでに) {
    var 見 = {};
    すでに.forEach(function (k) { 見[k] = 1; });
    var 手がかり = {
      phaser: /\bPhaser\b/, three: /\bTHREE\b/, matter: /\bMatter\b/, p5: /\b(createCanvas|setup\s*\(\s*\)|p5\.)/,
      pixi: /\bPIXI\b/, konva: /\bKonva\b/, fabric: /\bfabric\b/, chart: /\bnew\s+Chart\b/,
      d3: /\bd3\./, tone: /\bTone\./, howler: /\bHowl\b/, gsap: /\bgsap\b|\bTweenMax\b/,
      katex: /\bkatex\b/, qrcode: /\bQRCode\b/, sortable: /\bSortable\b/, lilgui: /\b(lil|GUI)\b\s*\./,
      confetti: /\bconfetti\s*\(/,
      tailwind: /class\s*=\s*"[^"]*\b(flex|grid|bg-(?:slate|gray|blue|indigo|emerald|rose|amber|violet)-\d|text-(?:xl|2xl|3xl|sm)|rounded-(?:lg|xl|2xl)|p[xytblr]?-\d)\b/
    };
    var 足す = [];
    Object.keys(手がかり).forEach(function (k) {
      if (!見[k] && 手がかり[k].test(全文)) { 見[k] = 1; 足す.push(k); }
    });
    return 足す;
  }

  /* ── 三連の記号で 囲まれていたら 外す ─────────────────────────── */
  function 囲みを外す(s) {
    var t = 文(s).trim();
    if (!t) return "";
    var m = t.match(/^```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)\n?```$/);
    if (m) return m[1];
    var re = /```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)```/g, best = "", x;
    while ((x = re.exec(t))) { if (x[1].length > best.length) best = x[1]; }
    return best || t;
  }
  function 丸ごとか(h) {
    var t = 文(h).slice(0, 400).toLowerCase();
    return t.indexOf("<!doctype") >= 0 || t.indexOf("<html") >= 0;
  }
  function 閉じを逃がす(s) { return 文(s).replace(/<\/script/gi, "<\\/script"); }

  /* ── 土台の見た目。**必ず付ける。** ────────────────────────────── */
  var 土台 = [
    "*,*::before,*::after{box-sizing:border-box;}",
    "html,body{margin:0;padding:0;height:100%;}",
    "body{font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',",
    "system-ui,sans-serif;font-size:15px;line-height:1.7;color:#2B2836;background:#FCFBFE;",
    "-webkit-text-size-adjust:100%;overflow-x:hidden;overscroll-behavior:contain;}",
    /* ★ #vqapp に min-height を **付けない**（2026-08-19 の 3 度目）。
       付けていると 中身の高さが いつも「画面いっぱい」になり、
       **どこまでが 中身か 測れない** → 枠を 伸ばせない → 途切れて見えた。
       地の色は body が 持つので、見た目は 変わらない。 */
    "#vqapp{padding:14px;}",
    "html,body{min-height:100%;}",
    "h1{font-size:20px;}h2{font-size:17px;}h3{font-size:15px;}",
    "h1,h2,h3{margin:0 0 8px;line-height:1.5;font-weight:750;}",
    "p{margin:0 0 8px;}",
    "img{max-width:100%;height:auto;}",
    "table{border-collapse:collapse;}td,th{border:1px solid #E7E4EF;padding:6px 10px;}",
    "canvas{max-width:100%;display:block;touch-action:none;}",
    /* 触るもの */
    "button,.vq-btn{font:inherit;font-weight:650;min-height:40px;padding:0 16px;border-radius:12px;",
    "border:1px solid #E7E4EF;background:#fff;color:#2B2836;cursor:pointer;",
    "transition:background .12s,transform .08s;}",
    "button:hover,.vq-btn:hover{background:#F7F5FC;}",
    "button:active,.vq-btn:active{transform:scale(.97);}",
    ".vq-btn.main{background:#756DB3;border-color:#756DB3;color:#fff;}",
    ".vq-btn.main:hover{filter:brightness(1.08);}",
    "input,select,textarea{font:inherit;padding:9px 11px;border:1px solid #E7E4EF;",
    "border-radius:11px;background:#fff;color:#2B2836;max-width:100%;}",
    "input[type=range]{padding:0;width:100%;accent-color:#756DB3;}",
    /* 土台 API が 出すもの */
    ".vq-stage{width:100%;margin:0 0 12px;}",
    ".vq-panel{background:#fff;border:1px solid #EFEDF5;border-radius:16px;padding:16px;margin:0 0 12px;",
    "box-shadow:0 1px 2px rgba(84,72,140,.05);}",
    ".vq-sub{color:#7A7589;font-size:13px;margin:0;}",
    ".vq-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;}",
    ".vq-label{font-size:14px;color:#454151;margin:0 0 8px;}",
    ".vq-slider{display:block;margin:0 0 12px;}",
    ".vq-slider-l{display:block;font-size:12.5px;color:#7A7589;font-weight:650;margin:0 0 4px;}",
    ".vq-hud{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}",
    ".vq-hud-i{display:inline-flex;align-items:baseline;gap:6px;padding:6px 12px;border-radius:999px;",
    "background:#EAE8F7;color:#5F579E;font-size:12.5px;font-weight:650;}",
    ".vq-hud-i i{font-style:normal;font-size:16px;font-weight:750;color:#2B2836;",
    "font-variant-numeric:tabular-nums;}",
    ".vq-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:80;",
    "padding:10px 18px;border-radius:999px;background:rgba(24,22,38,.92);color:#fff;",
    "font-size:13.5px;font-weight:650;transition:opacity .25s,transform .25s;}",
    ".vq-toast.out{opacity:0;transform:translateX(-50%) translateY(8px);}",
    ".vq-fx{position:fixed;inset:0;z-index:90;pointer-events:none;}",
    /* 壊れたときの 帯 */
    "#vqerr{position:fixed;left:0;right:0;bottom:0;z-index:99;margin:0;padding:8px 12px;",
    "background:#FDECEC;color:#9A2A2A;border-top:1px solid #F3C9C9;font-size:12px;",
    "line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:38%;overflow:auto;}"
  ].join("");

  /* ── 見張り。**中身より 先に** 置く ────────────────────────────── */
  var 見張り = [
    "(function(){",
    "  var 送る=function(k,m){try{parent.postMessage({__vqapp:1,kind:k,message:String(m).slice(0,600)},'*');}catch(e){}};",
    "  var 出す=function(m){try{var d=document.getElementById('vqerr');",
    "    if(!d){d=document.createElement('pre');d.id='vqerr';(document.body||document.documentElement).appendChild(d);}",
    "    d.textContent=String(m).slice(0,600);}catch(e){}};",
    "  window.addEventListener('error',function(e){",
    "    var m=(e&&e.message)||'エラー';",
    "    if(e&&e.target&&e.target.tagName==='SCRIPT'&&e.target.src){",
    "      m='道具を 読み込めませんでした: '+e.target.src;}",
    "    else if(e&&e.filename&&e.lineno)m+=' （'+e.lineno+' 行目）';",
    "    出す(m);送る('error',m);},true);",
    "  window.addEventListener('unhandledrejection',function(e){",
    "    var m='待っていたものが 失敗しました: '+((e&&e.reason&&e.reason.message)||e.reason||'');",
    "    出す(m);送る('error',m);});",
    "  var ce=console.error;console.error=function(){",
    "    try{送る('console',Array.prototype.join.call(arguments,' '));}catch(x){}",
    "    try{ce.apply(console,arguments);}catch(x){}};",
    "  var 見た=function(){",
    "    var b=document.getElementById('vqapp')||document.body;",
    "    var 中=b?b.innerHTML.replace(/\\s|<!--[\\s\\S]*?-->/g,''):'';",
    "    var 板=document.querySelector('canvas,svg,input,button,select,textarea');",
    "    var 空=!中.length&&!板;",
    "    送る(空?'blank':'ok',空?'画面に 何も 描かれていません':'動いています');",
    "  };",
    "  window.addEventListener('load',function(){setTimeout(見た,900);});",
    /* ★ **中身の高さを 知らせる**（2026-08-19 の 3 度目・訴え「途切れる」）。
       外の枠は これを 見て 伸びる。測るのは #vqapp の 中身だけ
       （body を 測ると 枠の高さを そのまま 返すので 伸び続ける）。 */
    "  var 前H=0;",
    "  var 測る=function(){",
    "    try{",
    "      var b=document.getElementById('vqapp');",
    "      var h=b?b.scrollHeight:0;",
    "      var e=document.getElementById('vqerr');",
    "      if(e)h+=e.offsetHeight||0;",
    "      /* 絶対配置や 固定のものは scrollHeight に 入らない。いちばん下を 探す。 */",
    "      var 全=document.querySelectorAll('#vqapp *');",
    "      for(var i=0;i<全.length;i++){",
    "        var st2=getComputedStyle(全[i]);",
    "        if(st2.position!=='absolute'&&st2.position!=='fixed')continue;",
    "        var r=全[i].getBoundingClientRect();",
    "        var y=r.bottom+(window.scrollY||0);",
    "        if(y>h&&y<20000)h=y;",
    "      }",
    "      h=Math.round(h);",
    "      if(h>0&&Math.abs(h-前H)>6){前H=h;送る2('height',h);}",
    "    }catch(x){}",
    "  };",
    "  var 送る2=function(k,v){try{parent.postMessage({__vqapp:1,kind:k,value:v},'*');}catch(e){}};",
    "  try{",
    "    var ro=new ResizeObserver(function(){測る();});",
    "    var 待=function(){var b=document.getElementById('vqapp');if(b){ro.observe(b);測る();}else setTimeout(待,80);};",
    "    待();",
    "  }catch(x){setInterval(測る,700);}",
    "  setTimeout(測る,400);setTimeout(測る,1200);setTimeout(測る,2600);setTimeout(測る,5000);",
    /* ★ **拡大縮小**（訴え「拡大縮小もできるように」）。
       transform で 引き伸ばすと ぼやける。zoom なら 組み直すので くっきり。 */
    "  window.addEventListener('message',function(e){",
    "    var d=e&&e.data;if(!d||d.__vqapp!==2)return;",
    "    if(d.kind==='zoom'){",
    "      try{",
    "        var k=Math.max(0.4,Math.min(3,Number(d.value)||1));",
    "        document.documentElement.style.zoom=k===1?'':String(k);",
    "        window.dispatchEvent(new Event('resize'));",
    "        setTimeout(測る,120);setTimeout(測る,420);",
    "      }catch(x){}",
    "    }",
    "    if(d.kind==='measure'){測る();}",
    "  });",
    "})();"
  ].join("\n");

  /* ── 土台 API（runtime.js）の 中身。読み込み時に 1 度だけ 取る ──── */
  var _土台API = null, _取得中 = null;
  function 元()  {
    try { return root.location.origin; } catch (e) { return ""; }
  }
  function 土台APIを取る() {
    if (_土台API !== null) return Promise.resolve(_土台API);
    if (_取得中) return _取得中;
    /* 束ねたものの中に 文字列として 持っている（VQB.RUNTIME）。
       持っていなければ 取りに行く。どちらも だめでも **止めない**
       （VQ が 無いだけで、素の JS は 動く）。 */
    if (root.VQB && typeof root.VQB.RUNTIME === "string" && root.VQB.RUNTIME.length > 100) {
      _土台API = root.VQB.RUNTIME;
      return Promise.resolve(_土台API);
    }
    _取得中 = fetch("/core/board/runtime.js")
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) { _土台API = t || ""; return _土台API; })
      .catch(function () { _土台API = ""; return ""; });
    return _取得中;
  }

  /* ══ 1 枚の 文書に 組み立てる ══════════════════════════════════════ */
  function 文書(a, o) {
    o = o || {};
    if (typeof a === "string") a = { code: a };
    a = a || {};
    var html = 囲みを外す(a.html);
    var css = 囲みを外す(a.css);
    var js = 囲みを外す(a.js);
    var code = 囲みを外す(a.code);
    if (!html && !css && !js && code) {
      if (丸ごとか(code)) html = code;
      else if (/<[a-z][\s\S]*>/i.test(code)) html = code;
      else js = code;
    }
    var 全文 = html + "\n" + css + "\n" + js;
    var 借りる = 道具を選ぶ(a.libs || a.道具 || []);
    借りる = 借りる.concat(中身から気づく(全文, 借りる));

    var org = 元();
    /* 道具は **本体と 同じ出どころ**からだけ。外の住所は 一切 許さない。 */
    var csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' " + org,
      "style-src 'unsafe-inline' " + org,
      "img-src data: blob: " + org,
      "media-src data: blob: " + org,
      "font-src data: " + org,
      "worker-src blob:",
      "connect-src 'none'",
      "form-action 'none'"
    ].join("; ");

    var 借り物 = 借りる.map(function (k) {
      var d = 道具[k], 出 = [];
      if (d.css) 出.push('<link rel="stylesheet" href="/vendor/arapp/' + d.css + '">');
      出.push('<script src="/vendor/arapp/' + d.js + '"><\/script>');
      return 出.join("\n");
    }).join("\n");

    var 土台API = o.土台API === undefined ? (_土台API || "") : o.土台API;

    /* 丸ごとの HTML を 渡された … 包みは そのまま、見張りと 土台だけ 差す。 */
    if (丸ごとか(html)) {
      var 差し = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n'
        + "<style>" + 土台 + "</style>\n"
        + "<script>" + 見張り + "<\/script>\n"
        + (土台API ? "<script>" + 土台API + "<\/script>\n" : "")
        + 借り物 + "\n";
      if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, "<head$1>\n" + 差し);
      if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, "<body$1>\n" + 差し);
      return 差し + html;
    }

    return [
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
      '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
      "<title>AR App</title>",
      "<style>" + 土台 + "</style>",
      css ? "<style>\n" + css + "\n</style>" : "",
      "<script>" + 見張り + "<\/script>",
      土台API ? "<script>" + 土台API + "<\/script>" : "",
      借り物,
      "</head><body>",
      '<div id="vqapp">' + (html || "") + "</div>",
      js ? ("<script>\ntry{\n" + 閉じを逃がす(js) + "\n}catch(e){\n"
            + "  var m=(e&&e.message)||String(e);\n"
            + "  try{var d=document.createElement('pre');d.id='vqerr';"
            + "d.textContent=m;document.body.appendChild(d);}catch(x){}\n"
            + "  try{parent.postMessage({__vqapp:1,kind:'error',message:m},'*');}catch(x){}\n"
            + "}\n<\/script>") : "",
      "</body></html>"
    ].filter(Boolean).join("\n");
  }

  /* ══ 中からの 頼みごと（保存・問題）に 答える ══════════════════════
     ★ iframe は 本体の 保存を **触れない**（そう作ってある）。
       代わりに ここが 預かる。鍵は アプリごとに 分ける。 */
  function 既定の橋(appId) {
    var 頭 = "vq2.arapp." + (appId || "app") + ".";
    return function (kind, d) {
      try {
        if (kind === "store.get") {
          var s = root.localStorage.getItem(頭 + d.key);
          return s === null ? null : JSON.parse(s);
        }
        if (kind === "store.set") {
          root.localStorage.setItem(頭 + d.key, JSON.stringify(d.value === undefined ? null : d.value));
          return true;
        }
        if (kind === "quiz.get") return 問題を渡す(d);
      } catch (e) {}
      return null;
    };
  }
  /* 本体が 持っている 本物の問題を 渡す（教材として いちばん 効く）。
     **個人を 特定するものは 渡さない**（問題文と 答えだけ）。 */
  function 問題を渡す(d) {
    var n = Math.max(1, Math.min(60, Number(d && d.count) || 10));
    var 束 = [];
    try {
      var ST = root.VQ2 && root.VQ2.store;
      if (!ST || !ST.listPresets) return [];
      var 一 = ST.listPresets() || [];
      if (d && d.presetId) 一 = 一.filter(function (p) { return String(p.id) === String(d.presetId); });
      一.forEach(function (p) {
        (p.questions || []).forEach(function (q) {
          var 正 = q.correctAnswer;
          var 選 = (q.choices || []).map(function (c) { return c.text; });
          if (!正 && (q.choices || []).length) {
            var c0 = (q.choices || []).filter(function (c) { return c.isCorrect; })[0];
            正 = c0 ? c0.text : "";
          }
          if (!q.prompt || !正) return;
          束.push({ q: String(q.prompt).slice(0, 300), a: String(正).slice(0, 200),
                    choices: 選.slice(0, 8), explanation: String(q.explanation || "").slice(0, 300),
                    preset: String(p.name || "") });
        });
      });
    } catch (e) { return []; }
    /* 並べ替えて 頭から n 個。毎回 同じ順に しない。 */
    for (var i = 束.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = 束[i]; 束[i] = 束[j]; 束[j] = t;
    }
    return 束.slice(0, n);
  }

  /* ══ 枠（iframe）に 入れて 出す ═══════════════════════════════════ */
  function 枠(親, a, o) {
    o = o || {};
    if (!親) return null;
    var 本文 = 文書(a, { 土台API: _土台API || "" });
    var f = doc.createElement("iframe");
    f.className = "vqb-app-frame";
    f.setAttribute("title", 文(o.title) || "AR App");
    /* allow-same-origin は **付けない**。付けると 本体の保存も 触れてしまう。 */
    f.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals");
    f.setAttribute("allow", "fullscreen; autoplay");
    f.setAttribute("referrerpolicy", "no-referrer");
    var 高 = Number(o.高さ) || 340;
    f.style.cssText = "display:block;width:100%;border:0;background:#FCFBFE;"
      + "border-radius:12px;min-height:" + 高 + "px;height:" + 高 + "px;";
    f.srcdoc = 本文;
    親.appendChild(f);

    var 橋 = o.橋 || 既定の橋(o.appId || o.title || "app");
    var 済み = false, 生きてる = true;

    function 聞く(e) {
      var d = e && e.data;
      if (!d || d.__vqapp !== 1) return;
      if (!f.contentWindow || e.source !== f.contentWindow) return;
      /* ★ 頼みごと（保存・問題）は **rid の有無に かかわらず** 橋へ 回す
         （2026-08-19・実測の不具合）。
         もとは rid が付いているものだけ 橋へ 渡していたので、
         返事の要らない store.set が **どこへも 届かず**、
         そのうえ 「知らせ」として 扱われて
         「うまく 動きませんでした：undefined」と 帯に 出ていた。 */
      if (/^(store|quiz|app)\./.test(String(d.kind || ""))) {
        var v = null;
        try { v = 橋(d.kind, d); } catch (x) { v = null; }
        if (d.rid) {
          Promise.resolve(v).then(function (val) {
            try { f.contentWindow.postMessage({ __vqapp: 2, rid: d.rid, value: val }, "*"); } catch (x) {}
          });
        }
        return;
      }
      /* ★ 中身の高さが 届いた → **枠を そこまで 伸ばす**（2026-08-19 の 3 度目）。
         訴え「生成したものが 途切れる。もったいない」。
         もとは 枠の高さが 決め打ちだったので、長いものは 下が 切れていた。 */
      if (d.kind === "height") { 高さに合わせる(d.value); return; }
      if (d.kind === "ok") 済み = true;
      /* 知らせは **決まったものだけ** 上へ渡す。知らない名前で
         「壊れた」と 出さない（同じ間違いを 二度としないため）。 */
      if (["ok", "blank", "silent", "error", "console", "done"].indexOf(String(d.kind)) < 0) return;
      if (typeof o.報せ === "function") { try { o.報せ(d.kind, d.message, d); } catch (x) {} }
    }
    /* ── 枠の高さを 中身に 合わせる ────────────────────────────────
       ★ 伸ばすだけで **縮めすぎない**。ゲームは 中で 画面いっぱいに
         描くことがあり、そこで 縮めると 逆に 切れる。
       ★ 上限は 画面の高さ（全画面のときは 目いっぱい）。それを 超えたら
         枠の中で スクロールさせる（外の板ごと 伸ばさない）。 */
    var 最低 = 高, いまの高 = 高, 自動 = o.自動高さ !== false;
    function 上限() {
      if (o.上限) return Number(o.上限);
      var v = root.innerHeight || 800;
      return Math.max(320, Math.round(v * (o.全画面 ? 0.94 : 0.78)));
    }
    function 高さに合わせる(h) {
      if (!自動) return;
      var n = Math.round(Number(h) || 0);
      if (!n) return;
      n = Math.max(最低, Math.min(上限(), n + 4));
      if (Math.abs(n - いまの高) < 8) return;
      いまの高 = n;
      f.style.height = n + "px";
      f.style.minHeight = n + "px";
      if (typeof o.高さが変わった === "function") { try { o.高さが変わった(n); } catch (x) {} }
    }
    root.addEventListener("message", 聞く);
    var t = setTimeout(function () {
      if (済み || !生きてる) return;
      if (typeof o.報せ === "function") { try { o.報せ("silent", "8 秒 返事が ありません"); } catch (x) {} }
    }, 8000);

    /* 大きい道具（phaser 1.2MB）を 借りると 少し 待つ。**先に 出しておく。** */
    土台APIを取る().then(function (rt) {
      if (!生きてる || !rt || _土台API === "") return;
      /* すでに 出した文書に 土台 API が 入っていなければ 入れ直す。 */
      if (本文.indexOf("window.VQ=VQ") < 0 && 本文.indexOf("W.VQ = VQ") < 0) {
        本文 = 文書(a, { 土台API: rt });
        f.srcdoc = 本文;
      }
    });

    return {
      枠: f, 文書: 本文,
      道具: 道具を選ぶ((a && (a.libs || a.道具)) || []).concat(
        中身から気づく(文((a && a.html) || "") + 文((a && a.css) || "") + 文((a && a.js) || "") + 文((a && a.code) || ""),
                     道具を選ぶ((a && (a.libs || a.道具)) || []))),
      高さを変える: function (h) {
        最低 = いまの高 = Number(h) || 最低;
        f.style.height = いまの高 + "px"; f.style.minHeight = いまの高 + "px";
      },
      /* ★ 拡大縮小（0.4〜3 倍）。中で zoom を 使うので **ぼやけない**。 */
      拡大: function (k) {
        var v = Math.max(0.4, Math.min(3, Number(k) || 1));
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "zoom", value: v }, "*"); } catch (x) {}
        return v;
      },
      測り直す: function () {
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "measure" }, "*"); } catch (x) {}
      },
      /* 全画面のときは 上限が 変わるので、測り直させる。 */
      全画面にする: function (on) {
        o.全画面 = !!on;
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "measure" }, "*"); } catch (x) {}
      },
      いまの高さ: function () { return いまの高; },
      作り直す: function (b) { 済み = false; 本文 = 文書(b || a, { 土台API: _土台API || "" }); f.srcdoc = 本文; },
      片づける: function () {
        生きてる = false;
        clearTimeout(t);
        try { root.removeEventListener("message", 聞く); } catch (x) {}
        try { if (f.parentNode) f.parentNode.removeChild(f); } catch (x) {}
      }
    };
  }

  /* 起動のとき 土台 API を 先に 温めておく（1 本目から 使えるように）。 */
  try { 土台APIを取る(); } catch (e) {}

  VQB.app = {
    文書: 文書, 枠: 枠, 囲みを外す: 囲みを外す, 丸ごとか: 丸ごとか,
    道具一覧: function () { return Object.keys(道具); },
    道具を選ぶ: 道具を選ぶ, 中身から気づく: 中身から気づく,
    土台APIを取る: 土台APIを取る
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


/* ───────── /core/board/ui.js ───────── */
/* ══════════════════════════════════════════════════════════════════════
   core/board/ui.js — AR Board の 一覧と 中身

   ★ 訴え（2026-08-17）「左サイドメニューに AR Board を 追加して、
     そこに ボードを 格納して。写真付きだと どこの 何かが 分かる。
     一覧画面は プリセット一覧の UI を 参考に」。

   ★ 作り
     ・一覧は **カードを 並べる**（プリセット一覧と 同じ考えかた）。
       写真が あれば 表紙にする。無ければ 中身の 先頭を 出す。
     ・押すと 中身（マークダウン・数式・図・表）を そのまま 出す。
     ・名前を 変える／消す が その場で できる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 日(iso) {
    try {
      var d = new Date(iso);
      return (d.getMonth() + 1) + "/" + d.getDate() + " "
        + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    } catch (e) { return ""; }
  }
  function 抜き(md) {
    try {
      var t = root.VQMD && root.VQMD.素 ? root.VQMD.素(md) : String(md || "");
      return t.replace(/\s+/g, " ").slice(0, 60);
    } catch (e) { return String(md || "").slice(0, 60); }
  }

  var CSS = [
    /* ★ **スクロールする枠を 自分で 持つ**（2026-08-27・訴え「AR Board が
       スクロールできない」）。U.mount が 作る .vq2-root は
       `display:flex; flex-direction:column; overflow:hidden` なので、
       中身を そのまま 置くと **はみ出た分は 切り落とされ、指でも 動かせない**。
       他の画面は .vq2-pane-b のような すべる枠を 挟んでいたが、
       ここは 直に 置いていたので 1 画面ぶんしか 見えなかった。
       min-height:0 が 要る（flex の 子は 既定で 縮まないため）。 */
    ".vqb-wrap,.vqb-one{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;",
    "-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}",
    ".vqb-wrap{padding:14px 14px 28px;}",
    ".vqb-head{display:flex;align-items:center;gap:10px;margin:0 0 12px;}",
    ".vqb-head h2{flex:1 1 auto;margin:0;font-size:17px;font-weight:700;}",
    ".vqb-cnt{font-size:12px;color:var(--vq-text-tertiary,#9994A8);}",
    ".vqb-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));}",
    ".vqb-card{position:relative;display:flex;flex-direction:column;text-align:left;",
    "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);",
    "border-radius:16px;overflow:hidden;cursor:pointer;padding:0;font:inherit;color:inherit;",
    "box-shadow:0 1px 2px rgba(16,15,26,.05);transition:transform .12s ease,box-shadow .12s ease;}",
    ".vqb-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(16,15,26,.10);}",
    ".vqb-thumb{width:100%;aspect-ratio:4/3;background:var(--vq-surface-sunken,#F4F2FB);",
    "display:flex;align-items:center;justify-content:center;overflow:hidden;}",
    ".vqb-thumb img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".vqb-thumb .vqb-none{font-size:11px;line-height:1.6;padding:10px;",
    "color:var(--vq-text-tertiary,#9994A8);text-align:center;}",
    ".vqb-body{padding:9px 11px 11px;}",
    ".vqb-t{font-size:13.5px;font-weight:700;line-height:1.5;margin:0 0 3px;",
    "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".vqb-m{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);}",
    ".vqb-tag{position:absolute;top:8px;left:8px;background:rgba(11,10,16,.72);color:#fff;",
    "font-size:10.5px;padding:2px 7px;border-radius:999px;}",
    ".vqb-empty{padding:44px 16px;text-align:center;color:var(--vq-text-tertiary,#9994A8);",
    "font-size:14px;line-height:1.9;}",
    ".vqb-one{padding:14px;}",
    ".vqb-one .vqb-photo{width:100%;max-height:38vh;object-fit:contain;border-radius:12px;",
    "background:var(--vq-surface-sunken,#F4F2FB);margin:0 0 12px;display:block;}",
    ".vqb-bar{display:flex;gap:8px;margin:14px 0 0;flex-wrap:wrap;}",
    ".vqb-bar button{border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;font:inherit;font-size:13px;padding:7px 13px;border-radius:999px;cursor:pointer;}",
    ".vqb-bar button.dn{color:#d1373b;border-color:rgba(209,55,59,.35);}",
    /* ── 動くもの（AR App）── */
    ".vqb-appthumb{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;",
    "justify-content:center;gap:6px;background:linear-gradient(135deg,#EFEAFB,#E3F0FA);color:#5F579E;}",
    ".vqb-appthumb b{font-size:12px;font-weight:750;letter-spacing:.02em;}",
    ".vqb-appthumb span{font-size:10.5px;color:#7A7589;padding:0 10px;text-align:center;",
    "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".vqb-tag.is-app{background:rgba(95,87,158,.92);}",
    ".vqb-app-wrap{border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;overflow:hidden;",
    "background:#FCFBFE;margin:0 0 10px;}",
    ".vqb-app-frame{display:block;width:100%;border:0;}",
    ".vqb-app-msg{margin:0 0 10px;padding:9px 12px;border-radius:12px;font-size:12.5px;line-height:1.7;",
    "background:#FDECEC;color:#9A2A2A;border:1px solid #F3C9C9;white-space:pre-wrap;word-break:break-word;}",
    ".vqb-app-msg.ok{background:#EAF6EE;color:#2F6B45;border-color:#CBE6D6;}",
    ".vqb-app-libs{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin:0 0 8px;}",
    ".vqb-app-ops{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;}",
    ".vqb-app-ops button{min-width:34px;height:30px;padding:0 10px;border-radius:999px;",
    "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;",
    "display:inline-flex;align-items:center;justify-content:center;}",
    ".vqb-app-ops button:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".vqb-app-ops .z{font-size:12px;color:var(--vq-text-tertiary,#9994A8);min-width:44px;",
    "text-align:center;font-variant-numeric:tabular-nums;}",
    ".vqb-one.zen{position:fixed;inset:0;z-index:60;margin:0;padding:12px;overflow:auto;",
    "background:var(--vq-bg,#FCFBFE);}",
    ".vqb-one.zen .vqb-app-frame{height:calc(100vh - 120px) !important;min-height:0 !important;}",
    ".vqb-code{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:#F7F6FB;",
    "border:1px solid var(--vq-border-subtle,#EFEDF5);font-size:11.5px;line-height:1.6;",
    "white-space:pre-wrap;word-break:break-all;max-height:34vh;overflow:auto;}",
    "@media (max-width:700px){.vqb-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}}"
  ].join("");

  function 開く(o) {
    o = o || {};
    var U = root.VQ2 && root.VQ2.ui;
    var S = VQB.store;
    if (!U || !U.mount || !S) return null;
    var 面 = U.mount("vq2-ar-board", {
      title: "AR Board", sheet: true, stack: true,
      css: CSS + (root.VQMD && root.VQMD.CSS ? root.VQMD.CSS() : "")
        + (root.VQG && root.VQG.CSS ? root.VQG.CSS() : "")
    });
    /* ★ 中身は IndexedDB にあるので **待ってから** 描く（2026-08-19）。
       待たずに 描くと 1 回目だけ 空に見える。読み終わったら もう一度 描く。 */
    描く();
    try { if (S.用意) S.用意().then(function () { 描く(); }); } catch (e) {}
    return 面;

    function 描く() {
      var 一 = S.一覧();
      var h = ['<div class="vqb-wrap"><div class="vqb-head"><h2>AR Board</h2>'
        + '<span class="vqb-cnt">' + 一.length + " 件"
        + (一.length ? "・" + S.使っている量() + "KB" : "") + "</span></div>"];
      if (!一.length) {
        h.push('<div class="vqb-empty">まだ ありません。<br>'
          + "Lumi が ボードに 書いたものが ここに 残ります。<br>"
          + "カメラで 読んだときは 写真も 一緒に 入ります。</div>");
      } else {
        h.push('<div class="vqb-grid">');
        一.forEach(function (b) {
          h.push('<button class="vqb-card" type="button" data-b="' + esc(b.id) + '">');
          var 動くもの = b.kind === "app";
          h.push('<div class="vqb-thumb">'
            + (b.photo ? '<img src="' + esc(b.photo) + '" alt="">'
               : 動くもの
                 ? '<span class="vqb-appthumb"><b>▶ 動かせます</b><span>'
                   + esc(b.subject || 抜き(b.markdown) || "触って 確かめる 教材") + "</span></span>"
                 : '<span class="vqb-none">' + esc(抜き(b.markdown)) + "</span>")
            + "</div>");
          if (動くもの) h.push('<span class="vqb-tag is-app">AR App</span>');
          else if (b.source === "camera") h.push('<span class="vqb-tag">カメラ</span>');
          h.push('<div class="vqb-body"><div class="vqb-t">' + esc(b.title) + "</div>"
            + '<div class="vqb-m">' + 日(b.at) + (b.subject ? "・" + esc(b.subject) : "") + "</div></div>");
          h.push("</button>");
        });
        h.push("</div>");
      }
      h.push("</div>");
      面.root.innerHTML = h.join("");
      U.on(面.root, "click", "[data-b]", function (e, t) { 一つ(t.getAttribute("data-b")); });
    }

    /* 動かしている 枠。画面を 描き直すときに 必ず 片づける
       （片づけないと 見張りが 積み重なって、同じ知らせが 何度も 出る）。 */
    var いまの枠 = null, 倍率 = 1;
    function 枠を片づける() {
      if (!いまの枠) return;
      try { いまの枠.片づける(); } catch (e) {}
      いまの枠 = null;
    }

    function 一つ(id) {
      枠を片づける();
      var b = S.取る(id);
      if (!b) return;
      var 動くもの = b.kind === "app";
      var h = ['<div class="vqb-one">'];
      if (b.photo) h.push('<img class="vqb-photo" src="' + esc(b.photo) + '" alt="写したもの">');
      if (動くもの) {
        h.push('<div class="vqb-app-ops">'
          + '<button type="button" data-op="out" aria-label="小さくする">−</button>'
          + '<span class="z" data-zoomv>100%</span>'
          + '<button type="button" data-op="in" aria-label="大きくする">＋</button>'
          + '<button type="button" data-op="reset" aria-label="もとの大きさに戻す">等倍</button>'
          + "</div>");
        h.push('<div class="vqb-app-msg ok" data-appmsg>読み込んでいます…</div>');
        h.push('<div class="vqb-app-wrap" data-appwrap></div>');
        h.push('<div class="vqb-app-libs" data-applibs></div>');
      }
      if (!動くもの || String(b.markdown || "").trim()) {
        h.push('<div class="vqmd">'
          + (root.VQMD && root.VQMD.render ? root.VQMD.render(b.markdown) : esc(b.markdown))
          + "</div>");
      }
      h.push('<div class="vqb-bar">'
        + '<button type="button" data-act="back">一覧へ</button>'
        + (動くもの ? '<button type="button" data-act="zen">大きく</button>'
                    + '<button type="button" data-act="rerun">やり直す</button>'
                    + '<button type="button" data-act="code">コードを見る</button>' : "")
        + '<button type="button" data-act="rename">名前を変える</button>'
        + '<button class="dn" type="button" data-act="del">消す</button></div>');
      if (動くもの) h.push('<pre class="vqb-code" data-codebox hidden></pre>');
      h.push("</div>");
      面.root.innerHTML = h.join("");

      if (動くもの) 動かす(b);
      /* 数式は あとから 組み上がることがある。届いたら 描き直す。 */
      try {
        if (root.VQM && root.VQM.svg && !root.VQM.svg.読み込み済み()) {
          root.VQM.svg.要る();
          doc.addEventListener("vqm:ready", function 一度() {
            doc.removeEventListener("vqm:ready", 一度);
            var el = 面.root.querySelector(".vqmd");
            if (el) el.innerHTML = root.VQMD.render(b.markdown);
          });
        }
      } catch (e) {}
      U.on(面.root, "click", '[data-act="back"]', function () { 枠を片づける(); 描く(); });
      U.on(面.root, "click", '[data-act="rerun"]', function () { 動かす(b); });
      U.on(面.root, "click", "[data-op]", function (e, t) {
        var k = 倍率;
        var op = t.getAttribute("data-op");
        if (op === "in") k = Math.min(3, Math.round((k + 0.1) * 10) / 10);
        else if (op === "out") k = Math.max(0.4, Math.round((k - 0.1) * 10) / 10);
        else k = 1;
        倍率 = k;
        try { if (いまの枠 && いまの枠.拡大) いまの枠.拡大(k); } catch (x) {}
        var v = 面.root.querySelector("[data-zoomv]");
        if (v) v.textContent = Math.round(k * 100) + "%";
      });
      U.on(面.root, "click", '[data-act="zen"]', function (e, t) {
        var one = 面.root.querySelector(".vqb-one");
        if (!one) return;
        var 大 = one.classList.toggle("zen");
        t.textContent = 大 ? "もどす" : "大きく";
        /* 大きさが 変わったので 枠も 作り直す（中の 板も 測り直される）。 */
        動かす(b);
      });
      U.on(面.root, "click", '[data-act="code"]', function (e, t) {
        var box = 面.root.querySelector("[data-codebox]");
        if (!box) return;
        var c = b.code || {};
        if (box.hidden) {
          box.textContent = [
            c.html ? "── HTML ──\n" + c.html : "",
            c.css ? "── CSS ──\n" + c.css : "",
            c.js ? "── JS ──\n" + c.js : "",
            c.code ? "── コード ──\n" + c.code : ""
          ].filter(Boolean).join("\n\n");
          box.hidden = false; t.textContent = "コードを隠す";
        } else { box.hidden = true; t.textContent = "コードを見る"; }
      });
      U.on(面.root, "click", '[data-act="rename"]', function () {
        var n = root.prompt("新しい名前", b.title);
        if (n === null) return;
        S.名を変える(b.id, n); b.title = n; 一つ(b.id);
      });
      U.on(面.root, "click", '[data-act="del"]', function () {
        if (!root.confirm("この ボードを 消しますか。")) return;
        S.消す(b.id); 描く();
      });
    }

    /* ══ 動かす（AR App）══════════════════════════════════════════════
       ★ 壊れても **本体は 何も 起きない**（sandbox の 中だけ）。
       ★ 壊れたら 黙らずに 帯へ 出す。何行目かも 出す。 */
    function 動かす(b) {
      枠を片づける();
      var 置き場 = 面.root.querySelector("[data-appwrap]");
      var 帯 = 面.root.querySelector("[data-appmsg]");
      if (!置き場) return;
      置き場.innerHTML = "";
      if (!root.VQB || !root.VQB.app || !root.VQB.app.枠) {
        if (帯) { 帯.className = "vqb-app-msg"; 帯.textContent = "動かす部品が 読み込まれていません。"; }
        return;
      }
      /* 画面の 高さの 半分くらいを 使う。狭い端末でも 320px は 確保する。
         大きく（全画面）のときは 目いっぱい。 */
      var 全画面 = 面.root.querySelector(".vqb-one.zen");
      var 高 = 全画面 ? Math.max(360, (root.innerHeight || 700) - 130)
                      : Math.max(340, Math.min(620, Math.round((root.innerHeight || 700) * 0.56)));
      いまの枠 = root.VQB.app.枠(置き場, b.code || {}, {
        title: b.title, 高さ: 高, appId: b.id,
        全画面: !!全画面,
        /* 中身に 合わせて 伸びたぶん、全画面のときは 上限まで 使う。 */
        上限: 全画面 ? Math.max(360, (root.innerHeight || 700) - 130) : 0,
        報せ: function (種, 文言) {
          if (!帯) return;
          if (種 === "ok") { 帯.className = "vqb-app-msg ok"; 帯.textContent = "動いています。触ってみてください。"; return; }
          if (種 === "blank") { 帯.className = "vqb-app-msg"; 帯.textContent = "画面に 何も 描かれませんでした。「やり直す」を押すか、Lumi に 直してもらってください。"; return; }
          if (種 === "silent") { 帯.className = "vqb-app-msg"; 帯.textContent = "返事が ありません。重すぎるか、途中で 止まっています。"; return; }
          帯.className = "vqb-app-msg"; 帯.textContent = "うまく 動きませんでした：" + 文言;
        }
      });
      /* 前に 変えていた 倍率を そのまま 掛け直す（作り直しで 戻ってしまわないように）。 */
      if (倍率 !== 1) {
        setTimeout(function () {
          try { if (いまの枠 && いまの枠.拡大) いまの枠.拡大(倍率); } catch (x) {}
          var v = 面.root.querySelector("[data-zoomv]");
          if (v) v.textContent = Math.round(倍率 * 100) + "%";
        }, 900);
      }
      /* どの道具を 借りたか 出す（重いものを 借りていると 待ち時間の 説明になる）。 */
      try {
        var 名 = (いまの枠 && いまの枠.道具) || [];
        var 行 = 面.root.querySelector("[data-applibs]");
        if (行) 行.textContent = 名.length ? "借りている道具：" + 名.join("・") : "";
      } catch (e) {}
    }
  }

  VQB.ui = { 開く: 開く, CSS: CSS };
})(typeof globalThis !== "undefined" ? globalThis : this);

