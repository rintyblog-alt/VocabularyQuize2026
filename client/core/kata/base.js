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
