/* ══════════════════════════════════════════════════════════════════════
   design/doc-theme.js — Seed →**書類の見た目**（Docs / Sheets / Forms）

   訴え（2026-08-29）:
     「スライド／ワード／エクセル／フォームの デザインが 毎回 同じ。
       Lumi が 作るように して（大まかな 型は そのままで よい）」

   なぜ 別に 要るか:
     スライドには 座標まで 組み立てる エンジン（pipeline）が あるが、
     書類の 3 つには **何も 無かった**。どの 書類も 同じ 白い紙・
     同じ 黒い字・同じ 灰色の 罫線で 出ていた。

   ★ ここで **やらない** こと（大事）:
     ・置き場所を 変えない（段組み・順番・部品の 差し替えを しない）。
       書類は 人が 打って 直す ものなので、勝手に 動かすと 邪魔になる。
     ・座標も px も LLM に 出させない（エンジンの 第 1 原則は そのまま）。
   ★ 変えるのは **色・書体・見出しの 飾り・表の 塗り・紙の 地**だけ。

   ★ 紙ならではの 決まり:
     ・mode: dark は 使わない。**印刷すると 真っ黒**になる。
     ・background: shapes / texture も 紙には 置かない（字が 読みにくい）。
     どちらも ここで 静かに 寄せる（LLM を 責めない・失敗にしない）。

   出すのは CSS の 文字列 1 つ（純粋関数）。当てるのは 呼ぶ側。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* 書類向けに 座標を ならす。 */
  function 書類向けに(seed) {
    var s = VQD.seed.normalize(seed);
    if (s.mode === "dark") s.mode = "high_contrast";
    if (s.background === "shapes" || s.background === "texture") s.background = "plain";
    try {
      var n = VQD.constraints.nearestValidSeed(s);
      if (n && n.seed) return n.seed;
    } catch (e) {}
    return s;
  }

  function 家族(ids) {
    try { return VQD.preview.familyOf(ids); } catch (e) { return "sans-serif"; }
  }

  /* rgba にする（薄い 塗りに 使う）。#rrggbb だけ 受ける。 */
  function 薄く(hex, a) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return "transparent";
    return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + ","
      + parseInt(m[3], 16) + "," + a + ")";
  }

  /* 見出しの 飾り。seed.accent の 4 通りを そのまま 使う。 */
  function 見出しの飾り(印, s, c, R) {
    if (s.accent === "block") {
      return 印 + " .wpd-doc h1, " + 印 + " .wpd-doc h2 {"
        + "background:" + c.accentSoft + ";border-radius:" + R + "px;"
        + "padding:.28em .6em;margin-left:-.6em;margin-right:-.6em;}";
    }
    if (s.accent === "rule") {
      return 印 + " .wpd-doc h1, " + 印 + " .wpd-doc h2 {"
        + "border-left:4px solid " + c.accent + ";padding-left:.55em;}";
    }
    if (s.accent === "underline") {
      return 印 + " .wpd-doc h1, " + 印 + " .wpd-doc h2 {"
        + "border-bottom:2px solid " + c.accent + ";padding-bottom:.22em;}";
    }
    return "";   /* none */
  }

  /* 紙の 地。gradient のときだけ ごく薄い 階調を 敷く。 */
  function 紙の地(s, c) {
    if (s.background === "gradient") {
      return "linear-gradient(160deg," + c.bg + " 0%," + 薄く(c.accent, 0.05) + " 100%)";
    }
    return c.bg;
  }

  /* ── 本体。Seed → CSS 文字列 ─────────────────────────────────── */
  function CSSを作る(seed, 印) {
    var s = 書類向けに(seed);
    var t = VQD.derive(s);
    var c = t.color, ty = t.type;
    var 見 = 家族(ty.stack.display), 本 = 家族(ty.stack.body);
    var R = Math.max(2, Math.min(16, t.shape.radius));
    var P = 印 || '[data-vqdesign="1"]';
    var 縞 = 薄く(c.accent, 0.045);
    var 罫 = 薄く(c.border, 0.55);

    return [
      /* ── Docs（文書）─────────────────────────────── */
      P + " .wpd-page, " + P + " .wpd-page.is-paper{background:" + 紙の地(s, c) + ";}",
      P + " .wpd-doc, " + P + " .wpd-b__c{font-family:" + 本 + ";}",
      P + " .wpd-page.is-paper .wpd-doc, " + P + " .wpd-page.is-paper .wpd-b__c{"
        + "color:" + c.textPrimary + ";}",
      P + " .wpd-doc h1, " + P + " .wpd-doc h2, " + P + " .wpd-doc h3, " + P + " .wpd-doc h4{"
        + "font-family:" + 見 + ";color:" + c.accent + ";}",
      見出しの飾り(P, s, c, R),
      P + " .wpd-page.is-paper .wpd-doc blockquote{"
        + "border-left:3px solid " + c.accent + ";color:" + c.textSecondary + ";}",
      P + " .wpd-callout{background:" + c.accentSoft + ";border:1px solid " + c.accent
        + ";border-radius:" + R + "px;color:" + c.textPrimary + ";}",
      P + " .wpd-hr{border-top-color:" + 罫 + ";}",
      /* ★ ますの 字は **地の 上で 読める 濃さ**へ そろえる（2026-08-29 実測）。
         そろえないと、暗い 設定の ときに 表の 中だけ 字が うすく 残る。 */
      P + " .wpd-tbl td, " + P + " .wpd-tbl th{border-color:" + 罫
        + ";color:" + c.textPrimary + ";}",
      P + " .wpd-tbl th{background:" + c.accentSoft + ";color:" + c.textPrimary + ";}",
      P + " .wpd-tbl tbody tr:nth-child(even) td{background:" + 縞 + ";}",
      P + " .wpd-toc{border-left:3px solid " + c.accent + ";}",

      /* ── Sheets（表計算）───────────────────────────
         ますの 中身は 人が 打つ ので、**字の 色は 触らない**。
         変えるのは 見出し行・罫線・書体だけ。 */
      P + " .wps-cell, " + P + " .wps-tbl{font-family:" + 本 + ";}",
      P + " .wps-h{background:" + c.accentSoft + ";color:" + c.textPrimary + ";}",
      P + " .wps-tbl td, " + P + " .wps-tbl th{border-color:" + 罫 + ";}",
      P + " .wps-tab.is-on, " + P + " .wps-tab[aria-selected=\"true\"]{"
        + "border-bottom-color:" + c.accent + ";color:" + c.accent + ";}",

      /* ── Forms（フォーム）─────────────────────────── */
      P + " .wpf-wrap{font-family:" + 本 + ";}",
      P + " .wpf-banner{background:" + c.accent + ";color:" + c.textOnAccent + ";"
        + "border-radius:" + R + "px " + R + "px 0 0;}",
      P + " .wpf-card{border-color:" + 罫 + ";border-radius:" + R + "px;}",
      P + " .wpf-card__q{font-family:" + 見 + ";color:" + c.textPrimary + ";}",
      P + " .wpf-prog__f{background:" + c.accent + ";}",
      P + " .wpf-req{color:" + c.accent + ";}",
      P + " .wpf-star__b[aria-pressed=\"true\"]{color:" + c.accent + ";}"
    ].filter(Boolean).join("\n");
  }

  /* 人に 見せる 要約（何を 変えたのか 言えるように）。 */
  function 要約(seed) {
    var s = 書類向けに(seed);
    var p = VQD.fonts.of(s.fontPair);
    return {
      Seed: VQD.seed.encode(s),
      色: s.hue + "° / " + s.scheme + " / " + s.mode,
      書体: p.名 + "（" + p.印象 + "）",
      組み: "比 " + s.typeScale + " / " + s.spacing + " / " + s.shape
        + " / 見出しの飾り " + s.accent + " / 紙の地 " + s.background
    };
  }

  VQD.docTheme = { CSSを作る: CSSを作る, 書類向けに: 書類向けに, 要約: 要約 };
})(typeof globalThis !== "undefined" ? globalThis : this);
