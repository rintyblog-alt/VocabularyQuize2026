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
