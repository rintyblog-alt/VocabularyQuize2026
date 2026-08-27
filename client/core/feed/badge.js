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
