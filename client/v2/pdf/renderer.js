/* ══════════════════════════════════════════════════════════════════════
   組み込み PDF レンダラ（§15 / §16 / §19 / §21）
   ・LayoutPlan → 安全な HTML/CSS（Paged Media）→ 印刷で PDF 化。
   ・AI に組版ソースを書かせない。ここが唯一の生成点で、値はすべて
     エスケープしてから流し込む（AI が作った文字列も未信頼として扱う）。
   ・縦書き・ルビ・傍線部・縦中横は CSS の writing-mode / <ruby> で組む。
   ・Typst / LaTeX は差し替え口（adapters）だけ用意。実行環境が無いため未検証。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, TPL = VQ2.templates, L = VQ2.layout;
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── 記法の変換（本文中の限定的な記法だけを解釈する） ────────
     {漢字|かんじ}      → ルビ
     [[傍線部A]]        → 傍線部ラベル
     ^^12^^             → 縦中横（縦書きでの半角数字）
     ___                → 空欄（下線）
     いずれもエスケープ後に適用するので、タグ注入は起こらない。 */
  function rich(text, vertical) {
    var h = esc(text);
    h = h.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, function (m, base, ruby) {
      return "<ruby>" + base + "<rt>" + ruby + "</rt></ruby>";
    });
    h = h.replace(/\[\[([^\]]+)\]\]/g, function (m, label) {
      return '<span class="ul">' + label + "</span>";
    });
    if (vertical) {
      h = h.replace(/\^\^([0-9A-Za-z]{1,4})\^\^/g, function (m, t) {
        return '<span class="tcy">' + t + "</span>";
      });
    } else {
      h = h.replace(/\^\^([0-9A-Za-z]{1,4})\^\^/g, "$1");
    }
    h = h.replace(/_{3,}/g, '<span class="blank"></span>');
    h = h.replace(/\n/g, "<br>");
    return h;
  }

  /* ══════════════════════════════════════════════════════════════════
     ページ CSS
     ══════════════════════════════════════════════════════════════════ */
  function pageCss(plan) {
    var p = plan.paper;
    var m = p.margins || { top: 20, bottom: 20, left: 18, right: 18 };
    var vertical = p.writingDirection === "vertical";
    /* 紙面プロファイルが本文の大きさ・書体を決めているときはそれに従う。
       選ばれていなければ、これまでどおり 10.5pt の明朝。 */
    var lprof = plan.layoutProfile || null;
    var basePt = (lprof && lprof.typography && lprof.typography.basePt) || 10.5;
    var base = basePt * (plan.fontScale || 1);
    var MINCHO = "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif";
    var GOTHIC = "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif";
    var bodyFont = (lprof && lprof.typography && lprof.typography.bodyFamily === "gothic") ? GOTHIC : MINCHO;
    var headFont = (lprof && lprof.typography && lprof.typography.headingFamily === "mincho") ? MINCHO : GOTHIC;

    return [
      "@page {",
      "  size: " + p.widthMm + "mm " + p.heightMm + "mm;",
      "  margin: " + m.top + "mm " + m.right + "mm " + m.bottom + "mm " + m.left + "mm;",
      "}",
      "* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
      "html, body { margin: 0; padding: 0; }",
      "body {",
      "  font-family: " + bodyFont + ";",
      "  font-size: " + base.toFixed(2) + "pt;",
      "  line-height: " + (plan.lineHeight || 1.85) + ";",
      "  color: #000; background: #fff;",
      "  text-align: justify;",
      vertical ? "  writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl;" : "",
      "}",
      ".sheet {",
      "  width: " + (p.widthMm - m.left - m.right) + "mm;",
      "  min-height: " + (p.heightMm - m.top - m.bottom) + "mm;",
      "  margin: 0 auto; position: relative;",
      vertical ? "  height: " + (p.heightMm - m.top - m.bottom) + "mm;" : "",
      "}",
      ".page { page-break-after: always; break-after: page; position: relative; }",
      /* 1 ページに収まらないブロック。隠さず、そのまま出す（測れば分かる状態にする）。 */
      "[data-overflowing='1'] { }",
      ".page:last-child { page-break-after: auto; break-after: auto; }",

      /* 見出し・大問。
         紙面プロファイルが「左寄せ・罫線なし」を指定していればそれに従う。
         選ばれていなければ、これまでどおり中央寄せ + 下罫線。 */
      ".exam-head { text-align: center; margin-bottom: 6mm; padding-bottom: 3mm; border-bottom: 0.5pt solid #000; }",
      (lprof && lprof.header && lprof.header.align === "left" ? ".exam-head { text-align: left; }" : ""),
      (lprof && lprof.header && lprof.header.rule === false
        ? ".exam-head { border-bottom: 0; padding-bottom: 0; margin-bottom: 8mm; }" : ""),
      ".exam-title { font-size: 1.5em; font-weight: 700; letter-spacing: .08em; }",
      ".exam-meta { margin-top: 2mm; font-size: .82em; }",
      ".exam-meta span { margin: 0 1.2em; }",
      ".name-box { margin-top: 3mm; display: inline-block; border: 0.5pt solid #000; padding: 1.5mm 4mm; font-size: .82em; }",
      ".sec { margin: " + (plan.questionGapMm || 8) + "mm 0 3mm; font-weight: 700; font-size: 1.08em; }",
      ".sec-no { display: inline-block; min-width: 7mm; }",
      ".sec-no.is-boxed { border: 0.4mm solid #000; min-width: 0; padding: 0.4mm 2mm; margin-right: 2mm; }",
      ".sec-pts { float: right; font-weight: 400; font-size: .82em; }",
      ".sec-inst { margin: 1mm 0 3mm; font-size: .9em; }",

      /* 設問 */
      ".q { margin: 0 0 1.5mm; page-break-inside: avoid; break-inside: avoid; }",
      /* 設問どうしの空きは、次の設問の上に置く。
         下に置くと「設問 → 大きな空白 → その設問の選択肢」に見えてしまう。 */
      ".q + .q, .ch + .q, .ans + .q, .src + .q, .fig + .q, table.tbl + .q, .qfg + .q,",
      ".ch + .qfg, .q + .qfg, .qfg + .qfg { margin-top: " + (plan.questionGapMm || 8) + "mm; }",
      ".q-head { display: flex; align-items: baseline; gap: 2mm; }",
      ".q-no { font-weight: 700; min-width: 8mm; flex: 0 0 auto; }",
      ".q-text { flex: 1 1 auto; }",
      ".q-pts { flex: 0 0 auto; font-size: .8em; }",

      /* 選択肢 */
      ".ch { margin: 1.5mm 0 0 8mm; }",
      ".ch.c2 { column-count: 2; column-gap: 6mm; }",
      ".ch.c4 { column-count: 4; column-gap: 4mm; }",
      ".ch-i { break-inside: avoid; margin: .8mm 0; display: flex; gap: 1.5mm; }",
      ".ch-l { flex: 0 0 auto; }",

      /* ── 形式そのものの中身 ────────────────────────────────
         白黒印刷でも読めるよう、色は使わず罫線と余白だけで分ける。 */
      /* 並べる語（語群） */
      ".ob { margin: 2mm 0 0 8mm; break-inside: avoid; }",
      ".ob-t { font-size: .86em; margin-bottom: 1.2mm; }",
      ".ob-l { border: 0.5pt solid #000; padding: 2mm 2.5mm; display: flex;",
      "        flex-wrap: wrap; gap: 2mm 4mm; }",
      ".ob-i { break-inside: avoid; white-space: nowrap; }",
      ".ob-k { display: inline-block; min-width: 4.5mm; }",
      /* 組み合わせ（左右 2 列） */
      ".mp { margin: 2mm 0 0 8mm; display: flex; gap: 6mm; break-inside: avoid; }",
      ".mp-c { flex: 1 1 0; border: 0.5pt solid #000; padding: 2mm 2.5mm; }",
      ".mp-h { font-size: .82em; text-align: center; border-bottom: 0.5pt solid #000;",
      "        margin: -2mm -2.5mm 1.5mm; padding: 1mm 0; }",
      ".mp-i { margin: 1mm 0; display: flex; gap: 1.5mm; break-inside: avoid; }",
      ".mp-k { flex: 0 0 auto; min-width: 4.5mm; }",
      /* 分類（語の並び ＋ 分類の箱） */
      ".cg { margin: 2mm 0 0 8mm; break-inside: avoid; }",
      ".cg-l { border: 0.5pt solid #000; padding: 2mm 2.5mm; display: flex;",
      "        flex-wrap: wrap; gap: 2mm 4mm; }",
      ".cg-g { display: flex; gap: 4mm; margin-top: 2mm; }",
      ".cg-b { flex: 1 1 0; border: 0.5pt solid #000; }",
      ".cg-bt { font-size: .84em; text-align: center; border-bottom: 0.5pt solid #000; padding: 1mm 0; }",
      ".cg-bs { height: 14mm; }",
      /* 表うめ */
      ".ft { margin: 2mm 0 0 8mm; break-inside: avoid; }",
      ".ft-cap { font-size: .84em; margin-bottom: 1mm; }",
      ".ft table { border-collapse: collapse; width: 100%; }",
      ".ft th, .ft td { border: 0.5pt solid #000; padding: 1.2mm 2mm; font-size: .9em;",
      "                 text-align: center; font-weight: normal; }",
      ".ft td.ft-e { min-width: 16mm; height: 7mm; }",

      /* 資料・図表 */
      ".src { margin: 2mm 0 2mm 4mm; padding: 2.5mm 3mm; border: 0.5pt solid #000; font-size: .9em; }",
      ".src-cap { font-size: .82em; margin-top: 1.5mm; text-align: right; }",
      ".fig { margin: 2mm auto; text-align: center; }",
      ".fig img { max-width: 100%; }",
      ".dlg { margin: 2mm 0 2mm 4mm; padding: 2mm 3mm; border-left: 1.5pt solid #000; }",
      "table.tbl { border-collapse: collapse; margin: 2mm 0; font-size: .9em; }",
      "table.tbl th, table.tbl td { border: 0.4pt solid #000; padding: 1mm 2mm; }",
      "pre.code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: .85em; border: 0.4pt solid #000; padding: 2mm; white-space: pre-wrap; }",
      ".notice { border: 0.5pt solid #000; padding: 2.5mm 3mm; margin: 0 0 5mm; font-size: .9em; }",
      ".notice-t { font-weight: 700; margin-bottom: 1mm; }",

      /* 解答欄 */
      ".ans { margin: 1.5mm 0 0 8mm; }",
      ".ans-box { border: 0.5pt solid #000; min-height: 7mm; }",
      ".ans-line { border-bottom: 0.4pt solid #000; height: 7mm; }",
      ".ans-grid { display: flex; flex-wrap: wrap; gap: 1.5mm; }",
      ".ans-cell { border: 0.5pt solid #000; width: 9mm; height: 9mm; }",
      ".ans-num { display: inline-block; min-width: 9mm; font-weight: 700; }",
      ".frac { display: inline-block; text-align: center; vertical-align: middle; }",
      ".frac .n { border-bottom: 0.5pt solid #000; display: block; padding: 0 1mm; }",
      ".mark-row { display: flex; gap: 1.2mm; align-items: center; }",
      ".mark { width: 5mm; height: 3mm; border: 0.4pt solid #000; border-radius: 2.5mm; }",

      /* 解答用紙 */
      ".as-row { display: flex; align-items: stretch; gap: 2mm; margin-bottom: 1.5mm; page-break-inside: avoid; }",
      ".as-no { flex: 0 0 14mm; border: 0.5pt solid #000; display: flex; align-items: center; justify-content: center; font-weight: 700; }",
      ".as-field { flex: 1 1 auto; border: 0.5pt solid #000; min-height: 8mm; }",
      ".as-pts { flex: 0 0 12mm; border: 0.5pt solid #000; display: flex; align-items: center; justify-content: center; font-size: .78em; }",

      /* 正解・解説 */
      ".ak { margin-bottom: 4mm; page-break-inside: avoid; }",
      ".ak-a { font-weight: 700; }",
      ".ak-e { font-size: .9em; margin-top: 1mm; }",
      ".ak-r { font-size: .85em; margin-top: 1mm; }",
      ".ak-r li { margin: .4mm 0; }",
      ".ak-s { font-size: .82em; margin-top: 1mm; }",

      /* 記法 */
      "ruby rt { font-size: .5em; }",
      ".ul { text-decoration: underline; text-underline-offset: 2px; }",
      vertical ? ".ul { text-decoration: none; border-right: 0.5pt solid #000; padding-right: .5mm; }" : "",
      ".tcy { text-combine-upright: all; -webkit-text-combine: horizontal; }",
      ".blank { display: inline-block; min-width: 14mm; border-bottom: 0.5pt solid #000; }",
      vertical ? ".blank { min-width: 0; min-height: 14mm; border-bottom: 0; border-left: 0.5pt solid #000; }" : "",

      /* ── 紙面プロファイル：本文と図表をひとつの枠へ ──────────────
         幅は Planner の指定をそのまま使う。ここで勝手に広げない。
         改ページで本文と図表が離れないよう break-inside を止める。
         図の縦横比は変えない（height を指定せず max-width だけで縮める）。 */
      ".qfg { break-inside: avoid; page-break-inside: avoid; margin-bottom: 1.5mm; }",
      ".qfg-b { min-width: 0; }",
      ".qfg-f { min-width: 0; }",
      ".qfg.is-side { display: flex; align-items: flex-start; gap: var(--pair-gap, 6mm); }",
      ".qfg.is-side > .qfg-b { flex: 0 0 var(--body-w, 58%); max-width: var(--body-w, 58%); }",
      ".qfg.is-side > .qfg-f { flex: 0 0 var(--fig-w, 38%); max-width: var(--fig-w, 38%); }",
      ".qfg.is-row > .qfg-f { display: flex; align-items: flex-end; justify-content: center;",
      "                       gap: var(--pair-gap, 6mm); width: var(--fig-w, 94%); margin: 3mm auto 0; }",
      ".qfg.is-row > .qfg-f > .fgi { flex: 0 1 auto; min-width: 0; }",
      ".qfg.is-stack > .qfg-f { width: var(--fig-w, 70%); margin: 3mm auto 0; }",
      ".fgi { text-align: center; }",
      ".fgi + .fgi { margin-top: 3mm; }",
      ".qfg.is-row .fgi + .fgi { margin-top: 0; }",
      ".fgi-t { font-size: .86em; margin-bottom: 1mm; }",
      /* height を書かない＝縦横比はそのまま */
      ".fgi img { max-width: 100%; }",
      ".fgi table.tbl { margin: 0 auto; }",
      ".qfg .ch { margin-top: 2mm; }",

      /* ── 紙面プロファイル：罫線型の解答用紙 ────────────────────── */
      ".agh { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; }",
      ".agh.is-ruled { border-bottom: 0.6mm solid #000; padding-bottom: 1.5mm; }",
      ".agh-l { display: flex; align-items: baseline; gap: 4mm; }",
      ".agh-i { border: 0.2mm solid #000; padding: 0.6mm 2mm; font-size: .82em; }",
      ".agh-t { font-weight: 700; font-size: 1.05em; }",
      ".agh, .agt, .agtot, .ags { font-family: " + headFont + "; }",
      ".agh-r { font-size: .82em; }",
      ".agt { width: 100%; border-collapse: collapse; margin: 0 0 2mm; table-layout: fixed; }",
      ".agt th, .agt td { border: 0.2mm solid #000; padding: 1mm 1.5mm; vertical-align: middle; }",
      ".agt .agt-sec { border-width: 0.8mm 0.2mm 0.8mm 0.8mm; width: 12mm; text-align: center;",
      "                font-weight: 700; font-size: 1.05em; }",
      ".agt .agt-no { width: 12mm; text-align: center; font-weight: 400; font-size: .88em; }",
      ".agt .agt-c { }",
      ".agt .agt-x { width: 16mm; text-align: center; vertical-align: top; }",
      ".agt .agt-xl { font-size: .72em; }",
      ".agt.is-dense th, .agt.is-dense td { padding: 0.4mm 1.2mm; }",
      ".agc { display: inline-block; }",
      ".agc-mark { border: 0.2mm solid #000; }",
      ".agc-mark.is-circle { border-radius: 50%; }",
      ".agc-short { border-bottom: 0.2mm solid #000; }",
      ".agc-row { display: inline-flex; gap: 1.5mm; }",
      ".agc-write { display: block; }",
      ".agc-line { display: block; border-bottom: 0.2mm solid #000; }",
      ".agc-line:last-child { border-bottom: 0.2mm solid #000; }",
      ".agtot { border-collapse: collapse; margin: 3mm 0 0 auto; }",
      ".agtot th, .agtot td { border: 0.3mm solid #000; padding: 1mm 3mm; text-align: center; font-size: .82em; }",
      ".agtot td { height: 9mm; }",
      ".ags { display: flex; gap: 4mm; margin-top: 4mm; border-top: 0.5mm solid #000; padding-top: 2mm; }",
      ".ags-f { display: inline-flex; align-items: baseline; gap: 1.5mm; }",
      ".ags-l { font-size: .82em; }",
      ".ags-b { flex: 1 1 auto; border-bottom: 0.2mm solid #000; min-height: 6mm; }",

      /* ── 可変グリッドの解答用紙（大問ごとの枠）────────────────── */
      ".agb { margin: 0 0 var(--agb-gap, 4mm); break-inside: avoid; page-break-inside: avoid; }",
      ".agbt { width: 100%; border-collapse: collapse; table-layout: fixed;",
      "        border: var(--agb-out, 0.6mm) solid #000; }",
      ".agbt th, .agbt td { border: var(--agb-in, 0.2mm) solid #000; padding: 0.6mm 1mm;",
      "                     vertical-align: middle; overflow: hidden; }",
      ".agb-sec { width: 10mm; text-align: center; font-weight: 700;",
      "           border-right-width: var(--agb-out, 0.6mm); }",
      ".agb-sec.is-vert { writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl;",
      "                   letter-spacing: .12em; white-space: nowrap; }",
      ".agb-ql { text-align: center; font-weight: 400; font-size: .82em; white-space: nowrap; }",
      ".agb-fx { text-align: center; font-size: .88em; }",
      ".agb-c { }",
      ".agb-sp { border-left: 0; }",
      ".agb-sc { position: relative; text-align: right; vertical-align: bottom; padding: 0 !important;",
      "          border-left-width: var(--agb-out, 0.6mm); }",
      ".agb-slash { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }",
      ".agb-den { position: absolute; right: 1mm; bottom: 0.5mm; font-size: .82em; line-height: 1; }",
      ".agf-t .agb-slash { position: absolute; inset: 0; }",
      ".agf-t .agb-den { position: absolute; right: 1.5mm; bottom: 1mm; font-size: .9em; }",
      ".agb-rl { font-size: .7em; writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; }",
      ".agc-mark { display: inline-block; border: 0.2mm solid #000; margin-right: 1mm; max-width: 100%; }",
      ".agc-mark:last-child { margin-right: 0; }",
      ".agc-wide { display: block; border-bottom: 0.2mm solid #000; width: 100%; }",
      ".agc-wide + .agc-wide { margin-top: 1mm; }",
      ".agc-seq { display: inline-flex; gap: 0; max-width: 100%; }",
      ".agc-sq { display: inline-block; border: 0.2mm solid #000; margin-left: -0.2mm; min-width: 0; flex: 0 1 auto; }",
      ".agc-lines { display: block; }",
      ".agc-lines .agc-line { display: block; border-bottom: 0.2mm solid #000; }",
      /* 配点の凡例 */
      ".agl { display: flex; gap: 6mm; margin: 1mm 0 2mm; justify-content: flex-end; font-size: .78em; }",
      ".agl-i { display: inline-flex; align-items: center; gap: 1.5mm; }",
      ".agl-b { display: inline-block; width: 9mm; height: 5mm; border-style: solid; border-color: #000; }",
      /* 下部の氏名欄と合計 */
      ".agf { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm;",
      "       margin-top: 3mm; padding-top: 2mm; border-top: 0.4mm solid #000; }",
      ".agf-s { display: flex; gap: 4mm; flex: 1 1 auto; }",
      ".agf-t { position: relative; border: 0.4mm solid #000; min-height: 10mm;",
      "         display: flex; align-items: flex-end; justify-content: flex-end; }",

      /* ページ番号。位置は文書ファミリーが決める。 */
      ".pgno { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: .78em; }",
      ".pgno-bottom-right { text-align: right; }",
      ".pgno-bottom-left { text-align: left; }",
      ".pgno-bottom-outer { text-align: right; }",
      ".pgno-top-center { bottom: auto; top: 0; text-align: center; }",
      ".pgno-top-right { bottom: auto; top: 0; text-align: right; }",
      vertical ? ".pgno { bottom: auto; top: 0; left: 0; right: auto; height: 100%; writing-mode: horizontal-tb; }" : "",

      /* 画面プレビュー用（印刷では消す） */
      "@media screen {",
      "  body { background: #eceaf3; padding: 12px; }",
      "  .page { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.16); margin: 0 auto 14px;",
      "          width: " + p.widthMm + "mm; min-height: " + p.heightMm + "mm;",
      "          padding: " + m.top + "mm " + m.right + "mm " + m.bottom + "mm " + m.left + "mm; }",
      "  .sheet { width: auto; }",
      "}",
      "@media print { body { background: #fff; padding: 0; } .page { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; } }"
    ].filter(Boolean).join("\n");
  }

  /* ══════════════════════════════════════════════════════════════════
     冊子ごとの本文
     ══════════════════════════════════════════════════════════════════ */
  function renderBooklet(spec, plan, booklet) {
    var vertical = plan.paper.writingDirection === "vertical";
    var h = '<div class="page"><div class="sheet" data-booklet="' + esc(booklet.id) + '">';

    /* 見出し。紙面プロファイルが選ばれていれば、その指定に従う。
       実画像の問題用紙は「試験名 1 行だけ」で、科目・時間・満点の行も氏名欄も無い。
       解答用紙は自分の見出し（answer-grid-head）と氏名欄を持つので、ここでは出さない。 */
    var hp = (plan.layoutProfile && plan.layoutProfile.header) || null;
    var showMeta = hp ? hp.showMeta !== false : true;
    var showName = hp ? hp.showNameBox !== false : (booklet.kind !== "answer-key");
    if (plan.layoutProfile && booklet.kind === "answer-sheet") { showMeta = false; showName = false; }
    h += '<div class="exam-head">'
      + '<div class="exam-title">' + esc(booklet.title) + "</div>"
      + (showMeta
          ? '<div class="exam-meta">'
            + (spec.subject ? "<span>" + esc(spec.subject) + "</span>" : "")
            + (spec.grade ? "<span>" + esc(spec.grade) + "</span>" : "")
            + "<span>試験時間 " + esc(spec.durationMinutes) + " 分</span>"
            + "<span>満点 " + esc(spec.totalPoints) + " 点</span></div>"
          : "");
    if (showName && booklet.kind !== "answer-key")
      h += '<div class="name-box">組　　　番　　　氏名　　　　　　　　　　</div>';
    h += "</div>";

    (booklet.blocks || []).forEach(function (b) {
      h += renderBlock(b, plan, vertical, booklet.kind);
    });

    h += "</div></div>";
    return h;
  }

  /* ── ページ分割 ──────────────────────────────────────────────
     いままでは冊子ぜんぶを 1 つの .page へ入れ、実際の分割は印刷時の
     ブラウザ任せだった。そのため
       ・画面では何ページになるか分からない
       ・ページ番号を正しい位置へ入れられない
       ・inspector が「1 ページ」としか測れない
     という状態だった。

     ここで、描いたあとに実測して本物の .page へ分ける。
     ・ブロックは途中で切らない（切ってよいものだけ data-split="1" を持つ）
     ・1 ブロックが 1 ページより高いときは、そのページへ単独で置き、
       はみ出していることを data-overflowing="1" として残す（隠さない）
     ・見出しだけがページ末尾に残らないよう、次のブロックと一緒に送る */
  function paginateScript(plan) {
    var p = plan.paper;
    var m = p.margins || { top: 20, bottom: 20, left: 18, right: 18 };
    var contentMm = p.heightMm - m.top - m.bottom;
    return "<script>(function(){"
      + "var contentMm=" + contentMm + ";"
      /* mm → px は端末で変わる。実物を測って換算する。 */
      + "var probe=document.createElement('div');"
      + "probe.style.cssText='position:absolute;visibility:hidden;height:100mm';"
      + "document.body.appendChild(probe);"
      + "var mmPx=probe.getBoundingClientRect().height/100;"
      + "probe.parentNode.removeChild(probe);"
      + "if(!mmPx||!isFinite(mmPx))return;"
      + "var limit=contentMm*mmPx;"
      + "var pages=Array.prototype.slice.call(document.querySelectorAll('.page'));"
      + "pages.forEach(function(page){"
      + "var sheet=page.querySelector('.sheet');if(!sheet)return;"
      + "var kids=Array.prototype.slice.call(sheet.children);"
      + "if(!kids.length)return;"
      /* 高さ（下マージンを含む）を先に測っておく */
      + "var hs=kids.map(function(k){var cs=getComputedStyle(k);"
      + "return k.getBoundingClientRect().height+(parseFloat(cs.marginBottom)||0);});"
      + "var groups=[[]],acc=0;"
      + "for(var i=0;i<kids.length;i++){"
      + "var h=hs[i];"
      + "var isHead=kids[i].classList.contains('sec');"
      /* 見出しは単独で置かない。次のブロックとまとめて考える。 */
      + "var pairH=isHead&&i+1<kids.length?h+hs[i+1]:h;"
      + "if(acc>0&&acc+pairH>limit){groups.push([]);acc=0;}"
      + "groups[groups.length-1].push(kids[i]);acc+=h;"
      + "if(h>limit){kids[i].setAttribute('data-overflowing','1');}"
      + "}"
      + "if(groups.length<=1)return;"
      + "var tpl=page.cloneNode(false);"
      + "var sheetTpl=sheet.cloneNode(false);"
      + "var frag=document.createDocumentFragment();"
      + "groups.forEach(function(g,gi){"
      + "var pg=gi===0?page:tpl.cloneNode(false);"
      + "var sh=gi===0?sheet:sheetTpl.cloneNode(false);"
      + "if(gi>0){pg.appendChild(sh);frag.appendChild(pg);}"
      + "g.forEach(function(el){sh.appendChild(el);});"
      + "});"
      + "if(page.parentNode)page.parentNode.insertBefore(frag,page.nextSibling);"
      + "});"
      + "})();<\/script>";
  }

  /* ── ページ番号 ──────────────────────────────────────────────
     描いたあとに、実際にできたページ数を見てから入れる。
     ページ数が分からないうちに「1 / 6」と書かない（嘘の数を出さない）。 */
  function pageNumberScript(plan) {
    var G = VQ2.layoutGrammar;
    /* 紙面プロファイルを選んでいれば文書ファミリーの指定に従う。
       選んでいない（current 経路）ときは、これまでどおり
       spec.paper.pageNumbering の指定を見る。切っていれば出さない。 */
    var pn = plan.pageNumber
      || ((plan.paper && plan.paper.pageNumbering === false) ? null
          : (G ? G.normalizePageNumber(null) : null));
    if (!pn || !pn.enabled) return "";
    var cfg = JSON.stringify(pn);
    return "<script>(function(){"
      + "var pn=" + cfg + ";"
      + "var pages=document.querySelectorAll('.page');"
      + "var total=pages.length;"
      + "function text(i){var n=(pn.startNumber||1)+i;var c;"
      + "if(pn.style==='dash')c='- '+n+' -';"
      + "else if(pn.style==='slash')c=n+' / '+total;"
      + "else if(pn.style==='labeled')c='ページ '+n;else c=String(n);"
      + "return (pn.prefix?pn.prefix+' ':'')+c+(pn.suffix?' '+pn.suffix:'');}"
      + "for(var i=0;i<total;i++){"
      + "if(!pn.coverIncluded&&pages[i].getAttribute('data-cover')==='1')continue;"
      + "var e=document.createElement('div');e.className='pgno pgno-'+pn.position;"
      + "e.textContent=text(i);pages[i].appendChild(e);}"
      + "})();<\/script>";
  }

  function renderBlock(b, plan, vertical, kind) {
    switch (b.type) {
      case "notice":
        return '<div class="notice"><div class="notice-t">注意</div>' + rich(b.text, vertical) + "</div>";

      case "instructions":
        return '<div class="sec"' + (b.pageBreakBefore ? ' style="page-break-before:always;break-before:page"' : "") + ">"
          + '<span class="sec-no' + (b.markerVariant === "boxed" ? " is-boxed" : "") + '">'
          + esc(b.marker || numberKanji(b.number)) + "</span>" + esc(b.title || "")
          + (b.points != null && b.showPoints !== false ? '<span class="sec-pts">（' + b.points + " 点）</span>" : "")
          + "</div>" + (b.text ? '<div class="sec-inst">' + rich(b.text, vertical) + "</div>" : "");

      case "source":
        return '<div class="src" data-block="' + esc(b.id) + '">' + rich(b.text, vertical)
          + (b.caption ? '<div class="src-cap">' + esc(b.caption) + "</div>" : "") + "</div>";

      case "passage":
        return '<div class="src" data-block="' + esc(b.id) + '">' + rich(b.text, vertical) + "</div>";

      case "dialogue":
        return '<div class="dlg" data-block="' + esc(b.id) + '">' + rich(b.text, vertical) + "</div>";

      case "figure":
        return '<div class="fig" data-block="' + esc(b.id) + '">'
          + (b.src && /^data:image\//.test(b.src) ? '<img src="' + esc(b.src) + '" alt="' + esc(b.caption || "図") + '">'
             : '<div class="src">' + esc(b.caption || "（図）") + "</div>")
          + (b.caption ? '<div class="src-cap">' + esc(b.caption) + "</div>" : "") + "</div>";

      case "table":
        return renderTable(b);

      case "code":
        return '<pre class="code" data-block="' + esc(b.id) + '">' + esc(b.text) + "</pre>";

      case "question":
        if (kind === "answer-key") return renderAnswerKey(b, vertical);
        return '<div class="q" data-question="' + esc(b.questionId) + '" data-binding="' + esc(b.answerBindingId || "") + '">'
          + '<div class="q-head"><span class="q-no">' + esc(b.marker || ("問" + b.number)) + "</span>"
          + '<span class="q-text">' + rich(b.text, vertical) + "</span>"
          + (b.points != null && b.showPoints !== false ? '<span class="q-pts">（' + b.points + "）</span>" : "")
          + "</div></div>";

      case "choices":
        return '<div class="ch c' + (b.columns || 1) + '" data-block="' + esc(b.id) + '">'
          + (b.choices || []).map(function (c) {
              return '<div class="ch-i"><span class="ch-l">' + esc(c.label) + '</span><span>' + rich(c.text, vertical) + "</span></div>";
            }).join("") + "</div>";

      /* ── 形式そのものの中身（2026-08-05 追加）────────────────────
         ここが無かったので、並び替えは「並び替えなさい」とだけ書かれた
         紙になっていた（並べる語が 1 つも出ない＝解けない）。 */
      case "order-bank":
        /* 指示は問題文が持っている。ここで重ねて書くと同じことが 2 行出る
           （実測: 「次の語を並べ替えて英文を完成させなさい。」の下に
            「次の語句を並べ替えなさい。」が並んでいた）。 */
        return '<div class="ob" data-block="' + esc(b.id) + '">'
          + '<div class="ob-l">'
          + (b.items || []).map(function (it) {
              return '<span class="ob-i"><span class="ob-k">' + esc(it.label) + '</span>'
                + rich(it.text, vertical) + "</span>";
            }).join("")
          + "</div></div>";

      case "match-pairs":
        return '<div class="mp" data-block="' + esc(b.id) + '">'
          + '<div class="mp-c"><div class="mp-h">Ａ</div>'
          + (b.left || []).map(function (l) {
              return '<div class="mp-i"><span class="mp-k">' + esc(l.label) + '</span>'
                + rich(l.text, vertical) + "</div>";
            }).join("") + "</div>"
          + '<div class="mp-c"><div class="mp-h">Ｂ</div>'
          + (b.right || []).map(function (r) {
              return '<div class="mp-i"><span class="mp-k">' + esc(r.label) + '</span>'
                + rich(r.text, vertical) + "</div>";
            }).join("") + "</div>"
          + "</div>";

      case "class-groups":
        return '<div class="cg" data-block="' + esc(b.id) + '">'
          + '<div class="cg-l">'
          + (b.items || []).map(function (it) {
              return '<span class="ob-i"><span class="ob-k">' + esc(it.label) + '</span>'
                + rich(it.text, vertical) + "</span>";
            }).join("") + "</div>"
          + '<div class="cg-g">'
          + (b.groups || []).map(function (g) {
              return '<div class="cg-b"><div class="cg-bt">' + esc(g.label) + "</div>"
                + '<div class="cg-bs"></div></div>';
            }).join("") + "</div>"
          + "</div>";

      case "fill-table":
        return '<div class="ft" data-block="' + esc(b.id) + '">'
          + (b.caption ? '<div class="ft-cap">' + esc(b.caption) + "</div>" : "")
          + "<table><thead><tr><th></th>"
          + (b.columns || []).map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("")
          + "</tr></thead><tbody>"
          + (b.rows || []).map(function (r) {
              return "<tr><th>" + esc(r.header) + "</th>"
                + (r.cells || []).map(function (c) {
                    return '<td class="' + (c.editable ? "ft-e" : "") + '">'
                      + (c.editable ? "" : esc(c.text)) + "</td>";
                  }).join("") + "</tr>";
            }).join("")
          + "</tbody></table></div>";

      case "answer-area":
        return renderAnswerArea(b, kind);

      case "spacer":
        return '<div style="height:' + (Number(b.mm) || 4) + 'mm"></div>';

      /* ── 紙面プロファイルを選んだときだけ出る部品 ────────────── */
      case "figure-group":
        return renderFigureGroup(b, vertical);
      case "answer-grid-head":
        return renderGridHead(b);
      case "answer-grid-section":
        return renderGridSection(b);
      case "answer-grid-block":
        return renderGridBlock(b);
      case "answer-grid-legend":
        return renderGridLegend(b);
      case "answer-grid-foot":
        return renderGridFoot(b);
      case "answer-grid-total":
        return renderGridTotal(b);
      case "answer-grid-student":
        return renderGridStudent(b);

      default:
        return "";
    }
  }

  /* ── 本文と図表をひとつの枠へ ────────────────────────────────
     ・horizontal-centered … 本文の下に図表を横並びで中央（実画像の（ア））
     ・side               … 本文（と選択肢）を左、図を右（実画像の（ウ））
     ・vertical-centered  … 本文の下に中央寄せで縦に積む
     幅は Planner が決めている。ここでは受け取った幅をそのまま使い、広げない。
     図の縦横比は変えない（object-fit しない・height を指定しない）。 */
  function oneFigure(f) {
    if (f.type === "table") {
      return '<div class="fgi" data-block="' + esc(f.id) + '">'
        + (f.title ? '<div class="fgi-t">' + esc(f.title) + "</div>" : "")
        + renderTable(Object.assign({}, f, { id: f.id + "-t" }))
        + (f.caption ? '<div class="src-cap">' + esc(f.caption) + "</div>" : "")
        + "</div>";
    }
    return '<div class="fgi" data-block="' + esc(f.id) + '">'
      + (f.title ? '<div class="fgi-t">' + esc(f.title) + "</div>" : "")
      + (f.src && /^data:image\//.test(f.src)
          ? '<img src="' + esc(f.src) + '" alt="' + esc(f.caption || "図") + '">'
          : '<div class="src">' + esc(f.caption || "（図）") + "</div>")
      + (f.caption ? '<div class="src-cap">' + esc(f.caption) + "</div>" : "")
      + "</div>";
  }
  function renderFigureGroup(b, vertical) {
    var figs = (b.figures || []).map(oneFigure).join("");
    var side = b.groupLayout === "side";
    var row = b.groupLayout === "horizontal-centered";
    var body = '<div class="q-head"><span class="q-no">' + esc(b.marker || ("問" + b.number)) + "</span>"
      + '<span class="q-text">' + rich(b.text, vertical) + "</span>"
      + (b.points != null && b.showPoints !== false ? '<span class="q-pts">（' + b.points + "）</span>" : "")
      + "</div>"
      + (b.extras || []).map(function (x) { return renderBlock(x, null, vertical, "question"); }).join("")
      + (b.choices
          ? '<div class="ch c' + (b.choiceColumns || 1) + '" data-block="' + esc(b.id) + '-ch">'
            + b.choices.map(function (c) {
                return '<div class="ch-i"><span class="ch-l">' + esc(c.label) + '</span><span>'
                  + rich(c.text, vertical) + "</span></div>";
              }).join("") + "</div>"
          : "");

    var style = '--body-w:' + (b.bodyWidthPct || 100) + '%;--fig-w:' + (b.figureWidthPct || 60)
      + '%;--pair-gap:' + (b.gapMm || 6) + "mm";
    var cls = "qfg" + (side ? " is-side" : row ? " is-row" : " is-stack");
    return '<div class="' + cls + '" data-block="' + esc(b.id) + '" data-question="' + esc(b.questionId) + '"'
      + ' data-binding="' + esc(b.answerBindingId || "") + '" style="' + style + '">'
      + '<div class="qfg-b">' + body + "</div>"
      + '<div class="qfg-f" data-figgroup="' + esc(b.id) + '">' + figs + "</div>"
      + "</div>";
  }

  /* ── 可変グリッドの解答用紙（実画像 2 枚目の構造）──────────────
     大問ごとの枠。左端は縦に結合した大問セル。
     セルの種類と数値は Planner が決めたものだけを使う。 */
  function renderGridBlock(b) {
    var sl = b.sectionLabel || {};
    var h = '<div class="agb" data-block="' + esc(b.id) + '" data-section="' + esc(b.sectionId) + '"'
      + ' style="--agb-gap:' + (b.gapMm || 4) + "mm;--agb-out:" + (b.outerBorderWidthMm || 0.6)
      + "mm;--agb-in:" + (b.innerBorderWidthMm || 0.2) + 'mm">';
    h += '<table class="agbt"><tbody>';
    (b.rows || []).forEach(function (row, ri) {
      h += '<tr style="height:' + (row.heightMm || 10) + 'mm">';
      if (ri === 0) {
        h += '<th class="agb-sec' + (sl.writingMode === "vertical" ? " is-vert" : "") + '"'
          + ' rowspan="' + (sl.rowSpan || (b.rows || []).length) + '" scope="rowgroup"'
          + ' style="width:' + (sl.widthMm || 10) + 'mm">' + esc(sl.text || "") + "</th>";
      }
      (row.cells || []).forEach(function (c) { h += gridCell(c); });
      if (ri === 0 && b.score && b.score.show) {
        h += '<td class="agb-sc" rowspan="' + (b.rows || []).length + '"'
          + ' style="width:' + (b.score.widthMm || 18) + 'mm">' + slashCell(b.score.denominator) + "</td>";
      }
      if (ri === 0 && b.recheck) {
        h += '<td class="agb-sc" rowspan="' + (b.rows || []).length + '"'
          + ' style="width:' + b.recheck.widthMm + 'mm"><span class="agb-rl">'
          + esc(b.recheck.label) + "</span></td>";
      }
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  /* 斜線と満点（実画像の「⁄42」）。得点は書き込む欄なので空けておく。
     斜線はグラデーションだと縮尺によってかすれる。線として描く。 */
  function slashCell(den) {
    return '<svg class="agb-slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
      + '<line x1="0" y1="100" x2="100" y2="0" stroke="#000" stroke-width="0.6"'
      + ' vector-effect="non-scaling-stroke"/></svg>'
      + '<span class="agb-den">' + esc(den) + "</span>";
  }
  function gridCell(c) {
    var span = ' colspan="' + (c.colSpan || 1) + '"' + (c.rowSpan > 1 ? ' rowspan="' + c.rowSpan + '"' : "");
    var st = [];
    if (c.widthMm != null) st.push("width:" + c.widthMm + "mm");
    if (c.minWidthMm != null) st.push("min-width:" + c.minWidthMm + "mm");
    if (c.borderWidth != null) st.push("border-width:" + c.borderWidth + "mm");
    if (c.align) st.push("text-align:" + c.align);
    if (c.fontSizePt) st.push("font-size:" + c.fontSizePt + "pt");
    var style = st.length ? ' style="' + st.join(";") + '"' : "";
    var data = (c.questionId ? ' data-question="' + esc(c.questionId) + '"' : "")
      + (c.answerBindingId ? ' data-binding="' + esc(c.answerBindingId) + '"' : "");

    switch (c.type) {
      case "question-label":
        return '<th class="agb-ql" scope="row"' + span + style + data + ">" + esc(c.text || "") + "</th>";
      case "fixed-label":
        return '<td class="agb-fx"' + span + style + data + ">" + esc(c.text || "") + "</td>";
      case "small-box":
        return '<td class="agb-c"' + span + style + data + ">"
          + repeat(c.cells || 1, function () {
              return '<span class="agc agc-mark' + (c.cellStyle === "circle" ? " is-circle" : "") + '"'
                + ' style="width:' + (c.widthMm || 16) + "mm;min-height:" + (c.heightMm || 9) + 'mm"></span>';
            }) + "</td>";
      case "box-sequence":
        return '<td class="agb-c"' + span + style + data + '><span class="agc-seq">'
          + repeat(c.cells || 1, function () {
              return '<span class="agc-sq" style="width:' + (c.widthMm || 7)
                + "mm;min-height:" + (c.heightMm || 9) + 'mm"></span>';
            }) + "</span></td>";
      case "wide-answer":
        return '<td class="agb-c"' + span + style + data + ">"
          + repeat(c.cells || 1, function () {
              return '<span class="agc agc-wide" style="min-height:' + (c.heightMm || 10) + 'mm"></span>';
            }) + "</td>";
      case "lined-answer":
        return '<td class="agb-c"' + span + style + data + '><span class="agc-lines">'
          + repeat(c.rows || 1, function () {
              return '<span class="agc-line" style="height:' + (c.heightMm || 9) + 'mm"></span>';
            }) + "</span></td>";
      case "merged-answer":
        return '<td class="agb-c"' + span + style + data + '><span class="agc agc-wide"'
          + ' style="min-height:' + (c.heightMm || 11) + 'mm"></span></td>';
      case "spacer":
        return '<td class="agb-sp"' + span + style + "></td>";
      default:
        return '<td class="agb-c"' + span + style + data + "></td>";
    }
  }
  function repeat(n, fn) {
    var out = "";
    for (var i = 0; i < Math.max(1, n); i++) out += fn(i);
    return out;
  }
  /* 配点の凡例（実画像の「1点配当 / 2点配当」）。罫線の太さで表す。 */
  function renderGridLegend(b) {
    return '<div class="agl" data-block="' + esc(b.id) + '">'
      + '<span class="agl-i"><span class="agl-b" style="border-width:' + b.thinWidthMm + 'mm"></span>'
      + esc((b.labels || [])[0] || "") + "</span>"
      + '<span class="agl-i"><span class="agl-b" style="border-width:' + b.thickWidthMm + 'mm"></span>'
      + esc((b.labels || [])[1] || "") + "</span></div>";
  }
  /* 下部の 年・組・番・氏名 と 合計（斜線 + 満点） */
  function renderGridFoot(b) {
    var t = b.total || {};
    return '<div class="agf" data-block="' + esc(b.id) + '">'
      + '<div class="agf-s">'
      + (b.fields || []).map(function (f) {
          return '<span class="ags-f" style="min-width:' + f.widthMm + 'mm">'
            + '<span class="ags-l">' + esc(f.label) + '</span><span class="ags-b"></span></span>';
        }).join("")
      + "</div>"
      + (t.show
          ? '<div class="agf-t" style="min-width:' + (t.widthMm || 30) + 'mm">'
            + slashCell(t.denominator) + "</div>"
          : "")
      + "</div>";
  }

  /* ── 罫線型の解答用紙 ────────────────────────────────────────
     問題数と形式から毎回組み立てる。固定の画像は使わない。 */
  function renderGridHead(b) {
    return '<div class="agh' + (b.variant === "top-bar-with-rule" ? " is-ruled" : "") + '" data-block="' + esc(b.id) + '">'
      + '<div class="agh-l">'
      + (b.grade ? '<span class="agh-i">' + esc(b.grade) + "</span>" : "")
      + (b.subject ? '<span class="agh-i">' + esc(b.subject) + "</span>" : "")
      + '<span class="agh-t">' + esc(b.examName || "") + "</span>"
      + "</div>"
      + (b.totalPoints != null ? '<div class="agh-r">満点 ' + esc(b.totalPoints) + " 点</div>" : "")
      + "</div>";
  }
  function renderGridSection(b) {
    var extra = (b.subtotal ? 1 : 0) + (b.grader ? 1 : 0) + (b.regrade ? 1 : 0);
    var h = '<table class="agt' + (b.density === "dense" ? " is-dense" : "") + '" data-block="' + esc(b.id) + '">'
      + "<tbody>";
    (b.rows || []).forEach(function (r, i) {
      h += '<tr data-question="' + esc(r.questionId) + '" data-binding="' + esc(r.answerBindingId || "") + '">';
      if (i === 0) {
        h += '<th class="agt-sec" rowspan="' + (b.rows || []).length + '" scope="rowgroup">' + esc(b.label) + "</th>";
      }
      h += '<th class="agt-no" scope="row">' + esc(r.label) + "</th>";
      h += '<td class="agt-c">' + answerCell(r) + "</td>";
      if (i === 0 && extra) {
        if (b.subtotal) h += '<td class="agt-x" rowspan="' + (b.rows || []).length + '"><span class="agt-xl">小計</span></td>';
        if (b.grader) h += '<td class="agt-x" rowspan="' + (b.rows || []).length + '"><span class="agt-xl">採点</span></td>';
        if (b.regrade) h += '<td class="agt-x" rowspan="' + (b.rows || []).length + '"><span class="agt-xl">再採点</span></td>';
      }
      h += "</tr>";
    });
    return h + "</tbody></table>";
  }
  /* 形式ごとの解答欄。大きさは Planner が mm で決めている。 */
  function answerCell(r) {
    var style = "min-height:" + r.heightMm + "mm";
    if (r.cell === "mark" || r.cell === "truefalse") {
      return '<span class="agc agc-mark' + (r.cellStyle === "circle" ? " is-circle" : "") + '"'
        + ' style="width:' + r.widthMm + "mm;" + style + '"></span>';
    }
    if (r.cell === "mark-multi") {
      return '<span class="agc agc-mark" style="width:' + r.widthMm + "mm;" + style + '"></span>';
    }
    if (r.cell === "matching" || r.cell === "ordering") {
      var n = Math.max(1, Number(r.cells) || 1), out = "";
      for (var i = 0; i < n; i++) {
        out += '<span class="agc agc-mark" style="width:' + r.widthMm + "mm;" + style + '"></span>';
      }
      return '<span class="agc-row">' + out + "</span>";
    }
    if (r.cell === "written" || r.cell === "essay") {
      var rows = Math.max(1, Number(r.rows) || 1), lines = "";
      for (var j = 0; j < rows; j++) lines += '<span class="agc-line" style="height:' + r.heightMm + 'mm"></span>';
      return '<span class="agc agc-write" style="width:100%">' + lines + "</span>";
    }
    return '<span class="agc agc-short" style="width:' + r.widthMm + "mm;" + style + '"></span>';
  }
  function renderGridTotal(b) {
    var h = '<table class="agtot" data-block="' + esc(b.id) + '"><tbody><tr>';
    (b.sections || []).forEach(function (s) { h += "<th>" + esc(s.label) + "</th>"; });
    h += "<th>" + esc(b.label) + "</th>" + (b.regrade ? "<th>" + esc(b.regradeLabel) + "</th>" : "");
    h += "</tr><tr>";
    (b.sections || []).forEach(function () { h += "<td></td>"; });
    h += "<td></td>" + (b.regrade ? "<td></td>" : "");
    return h + "</tr></tbody></table>";
  }
  function renderGridStudent(b) {
    return '<div class="ags" data-block="' + esc(b.id) + '">'
      + (b.fields || []).map(function (f) {
          return '<span class="ags-f" style="min-width:' + f.widthMm + 'mm">'
            + '<span class="ags-l">' + esc(f.label) + '</span><span class="ags-b"></span></span>';
        }).join("")
      + "</div>";
  }

  function renderTable(b) {
    var rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return "";
    return '<table class="tbl" data-block="' + esc(b.id) + '">'
      + rows.map(function (r, i) {
          var tag = i === 0 && b.header !== false ? "th" : "td";
          return "<tr>" + (Array.isArray(r) ? r : [r]).map(function (c) {
            return "<" + tag + ">" + esc(c) + "</" + tag + ">";
          }).join("") + "</tr>";
        }).join("") + "</table>";
  }

  function renderAnswerKey(b, vertical) {
    var h = '<div class="ak" data-question="' + esc(b.questionId) + '">'
      + '<div class="q-head"><span class="q-no">' + esc(b.marker || ("問" + b.number)) + "</span>"
      + '<span class="q-text">' + esc(String(b.text).slice(0, 120)) + "</span>"
      + (b.points != null ? '<span class="q-pts">（' + b.points + "）</span>" : "") + "</div>"
      + '<div class="ak-a">解答：' + esc(b.answer || "") + (b.accepted ? "　（別解：" + esc(b.accepted) + "）" : "") + "</div>";
    if (b.explanation) h += '<div class="ak-e">' + rich(b.explanation, vertical) + "</div>";
    if ((b.rubric || []).length) {
      h += '<div class="ak-r">採点基準<ul>' + b.rubric.map(function (r) {
        return "<li>" + esc(r.description) + "（" + r.points + " 点）</li>";
      }).join("") + "</ul></div>";
    }
    if (b.criterion) h += '<div class="ak-r">観点別：' + esc(b.criterion) + "</div>";
    if ((b.sources || []).length) h += '<div class="ak-s">出典：' + b.sources.map(esc).join(" / ") + "</div>";
    return h + "</div>";
  }

  function renderAnswerArea(b, kind) {
    var inner = answerField(b);
    if (kind === "answer-sheet") {
      return '<div class="as-row" data-binding="' + esc(b.answerBindingId) + '" data-question="' + esc(b.questionId) + '">'
        + '<div class="as-no">' + esc(b.number || "") + "</div>"
        + '<div class="as-field">' + inner + "</div>"
        + (b.points != null ? '<div class="as-pts">' + b.points + "</div>" : "")
        + "</div>";
    }
    return '<div class="ans" data-binding="' + esc(b.answerBindingId) + '" data-question="' + esc(b.questionId) + '"'
      + ' style="width:' + (b.widthPct || 100) + '%">' + inner + "</div>";
  }

  function answerField(b) {
    /* 解答欄の形と数は Planner（pdf/layout.js の answerShapeOf）が決める。
       ここで型名を並べて分岐していたころは、
       仲間の形式（reorder_english など）が全部こぼれて記述の行になり、
       数も問題の中身と合っていなかった（§43「解答欄不足」）。 */
    var sh = b.answerShape;
    if (sh && sh.style) {
      var i, out = "";
      if (sh.style === "marks") {
        for (i = 1; i <= sh.count; i++) out += '<span class="mark" title="' + i + '"></span>';
        return '<div class="mark-row" style="padding:1.5mm 2mm">' + out + "</div>";
      }
      if (sh.style === "cells") {
        for (i = 0; i < sh.count; i++) out += '<div class="ans-cell"></div>';
        return '<div class="ans-grid" style="padding:1.5mm 2mm">' + out + "</div>";
      }
      if (sh.style === "box") return '<div style="min-height:8mm"></div>';
    }

    var t = b.inputType;
    if (t === "multiple_choice_single" || t === "true_false" || t === "multiple_choice_multiple") {
      var n = Math.max(2, Math.min(10, b.choiceCount || 4));
      var marks = "";
      for (var i = 1; i <= n; i++) marks += '<span class="mark" title="' + i + '"></span>';
      return '<div class="mark-row" style="padding:1.5mm 2mm">' + marks + "</div>";
    }
    if (t === "numeric" || t === "short_answer" || t === "formula") {
      return '<div style="min-height:8mm"></div>';
    }
    if (t === "fill_blank") {
      var cells = "";
      var bc = Math.max(1, Math.min(30, b.blankCount || 1));
      for (var j = 0; j < bc; j++) cells += '<div class="ans-cell"></div>';
      return '<div class="ans-grid" style="padding:1.5mm 2mm">' + cells + "</div>";
    }
    if (t === "ordering" || t === "matching") {
      var cs = "";
      var oc = Math.max(2, Math.min(12, b.blankCount || 4));
      for (var k = 0; k < oc; k++) cs += '<div class="ans-cell"></div>';
      return '<div class="ans-grid" style="padding:1.5mm 2mm">' + cs + "</div>";
    }
    /* 記述系：行を引く */
    var lines = Math.max(1, Math.min(40, b.lines || 3));
    var out = "";
    for (var m = 0; m < lines; m++) out += '<div class="ans-line"></div>';
    return out;
  }

  var KANJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  function numberKanji(n) {
    if (typeof n !== "number") return String(n || "");
    if (n <= 10) return KANJI[n];
    if (n < 20) return "十" + KANJI[n - 10];
    return String(n);
  }

  /* ══════════════════════════════════════════════════════════════════
     完全な HTML を作る
     ══════════════════════════════════════════════════════════════════ */
  function buildHtml(spec, plan, opts) {
    opts = opts || {};
    var only = opts.bookletId;
    var booklets = (plan.booklets || []).filter(function (b) { return !only || b.id === only; });
    var body = booklets.map(function (b) { return renderBooklet(spec, plan, b); }).join("");
    return "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
      + "<title>" + esc(spec.title || "試験") + "</title>"
      + "<style>" + pageCss(plan) + "</style></head><body>" + body
      /* 先に本物のページへ分けてから、ページ番号を入れる。順番が逆だと
         「1 / 1」しか出せない（実際は何ページあるか分からないまま）。 */
      + paginateScript(plan) + pageNumberScript(plan) + "</body></html>";
  }

  /* ══════════════════════════════════════════════════════════════════
     成果物の生成（§21）
     ══════════════════════════════════════════════════════════════════ */
  function buildArtifacts(spec, plan, opts) {
    opts = opts || {};
    var arts = {};
    (plan.booklets || []).forEach(function (b) {
      arts[b.id] = { kind: "html", filename: b.id + ".html", content: buildHtml(spec, plan, { bookletId: b.id }) };
    });
    arts["mock-spec.json"] = { kind: "json", filename: "mock-spec.json", content: JSON.stringify(spec, null, 2) };
    arts["grading-definition.json"] = {
      kind: "json", filename: "grading-definition.json",
      content: JSON.stringify(gradingDefinition(spec), null, 2)
    };
    if (opts.manifest)
      arts["layout-manifest.json"] = { kind: "json", filename: "layout-manifest.json", content: JSON.stringify(opts.manifest, null, 2) };
    if (opts.validationReport)
      arts["validation-report.json"] = { kind: "json", filename: "validation-report.json", content: JSON.stringify(opts.validationReport, null, 2) };
    return arts;
  }

  /* 採点定義。問題冊子・解答用紙・採点・結果表示がずれないための唯一の定義。 */
  function gradingDefinition(spec) {
    var items = [];
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) {
        items.push({
          questionId: q.id, answerBindingId: q.answerBindingId,
          sectionId: sec.id, number: q.number, type: q.type, points: q.points,
          correctAnswer: (q.choices || []).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.id; }),
          correctText: q.correctAnswer || null,
          acceptedAnswers: q.acceptedAnswers || [],
          answerNormalization: q.answerNormalization || null,
          tolerance: q.tolerance != null ? q.tolerance : null,
          scoringRubric: q.scoringRubric || null,
          criterionAllocation: q.criterionAllocation || null,
          gradingMethod: S.isDeterministic(q.type) ? "deterministic" : "ai-assisted"
        });
      });
    });
    return {
      mockId: spec.id, schemaVersion: S.SCHEMA_VERSION,
      totalPoints: spec.totalPoints,
      criteria: S.CRITERIA,
      items: items
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     プレビューと印刷
     ══════════════════════════════════════════════════════════════════ */
  function renderToIframe(iframe, html) {
    return new Promise(function (resolve) {
      var d = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!d) { resolve(false); return; }
      d.open(); d.write(html); d.close();
      /* 画像・フォントの読み込みを待つ。待ちすぎないよう上限を置く。 */
      var done = false;
      function finish() { if (done) return; done = true; resolve(true); }
      if (iframe.contentWindow) {
        try {
          if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { setTimeout(finish, 60); });
          else setTimeout(finish, 250);
        } catch (e) { setTimeout(finish, 250); }
      }
      setTimeout(finish, 2500);
    });
  }

  /* 印刷ダイアログを開く。ここで利用者が「PDF として保存」を選ぶ。 */
  function print(html, title) {
    var w = root.open("", "_blank");
    if (!w) return { ok: false, error: "POPUP_BLOCKED", message: "ポップアップがブロックされました。許可してからもう一度お試しください。" };
    w.document.open(); w.document.write(html); w.document.close();
    var tried = false;
    function go() {
      if (tried) return; tried = true;
      try { w.focus(); w.print(); } catch (e) {}
    }
    try {
      if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(function () { setTimeout(go, 120); });
      else setTimeout(go, 400);
    } catch (e) { setTimeout(go, 400); }
    setTimeout(go, 2500);
    return { ok: true, window: w };
  }

  function printBooklet(spec, plan, bookletId) {
    var b = (plan.booklets || []).find(function (x) { return x.id === bookletId; });
    if (!b) return { ok: false, error: "NOT_FOUND" };
    return print(buildHtml(spec, plan, { bookletId: bookletId }), b.title);
  }

  function downloadArtifact(art) {
    try {
      var blob = new root.Blob([art.content], {
        type: art.kind === "json" ? "application/json" : "text/html;charset=utf-8"
      });
      var url = root.URL.createObjectURL(blob);
      var a = doc.createElement("a");
      a.href = url; a.download = art.filename;
      doc.body.appendChild(a); a.click();
      setTimeout(function () { doc.body.removeChild(a); root.URL.revokeObjectURL(url); }, 400);
      return true;
    } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════
     結果レポート（§9 のレポート出力）
     ══════════════════════════════════════════════════════════════════ */
  function printResultReport(o) {
    var r = o.result, qs = o.questions || [];
    var byId = {}; qs.forEach(function (q) { byId[q.id] = q; });
    var agg = r.aggregate || {};
    var css = [
      "@page { size: A4 portrait; margin: 18mm 16mm; }",
      "body { font-family: 'Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif; font-size: 10.5pt; line-height: 1.75; color: #000; }",
      "h1 { font-size: 1.6em; margin: 0 0 2mm; } h2 { font-size: 1.1em; margin: 6mm 0 2mm; border-bottom: .5pt solid #000; padding-bottom: 1mm; }",
      ".meta { font-size: .85em; margin-bottom: 4mm; }",
      ".score { font-size: 2.2em; font-weight: 700; }",
      "table { width: 100%; border-collapse: collapse; font-size: .9em; margin: 2mm 0; }",
      "th, td { border: .4pt solid #000; padding: 1.5mm 2mm; text-align: left; }",
      "td.n, th.n { text-align: right; }",
      ".q { page-break-inside: avoid; margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: .3pt dotted #666; }",
      ".ok { font-weight: 700; } .ng { font-weight: 700; }",
      "@media screen { body { max-width: 800px; margin: 20px auto; padding: 0 16px; } }"
    ].join("\n");

    var h = "<h1>" + esc(r.presetName || "結果") + "</h1>"
      + '<div class="meta">' + esc(new Date(r.finishedAt).toLocaleString("ja-JP")) + "</div>"
      + '<div class="score">' + (Math.round(r.score * 10) / 10) + " / " + r.maxScore + " 点</div>"
      + "<div>正解 " + r.correctCount + " 問 ／ 不正解 " + r.wrongCount + " 問 ／ 未回答 " + r.unansweredCount + " 問</div>";

    var crit = Object.keys(agg.byCriterion || {}).filter(function (k) { return agg.byCriterion[k].max > 0; });
    if (crit.length) {
      h += "<h2>観点別</h2><table><tr><th>観点</th><th class='n'>得点</th><th class='n'>満点</th></tr>"
        + crit.map(function (k) {
            var c = agg.byCriterion[k];
            return "<tr><td>" + esc(c.label) + "</td><td class='n'>" + (Math.round(c.score * 10) / 10) + "</td><td class='n'>" + c.max + "</td></tr>";
          }).join("") + "</table>";
    }
    if (Object.keys(agg.byTopic || {}).length) {
      h += "<h2>単元別</h2><table><tr><th>単元</th><th class='n'>問題数</th><th class='n'>得点</th><th class='n'>正答率</th></tr>"
        + Object.keys(agg.byTopic).map(function (k) {
            var t = agg.byTopic[k];
            return "<tr><td>" + esc(k) + "</td><td class='n'>" + t.count + "</td><td class='n'>"
              + (Math.round(t.score * 10) / 10) + " / " + t.max + "</td><td class='n'>"
              + (t.accuracy === null ? "－" : Math.round(t.accuracy * 100) + "%") + "</td></tr>";
          }).join("") + "</table>";
    }

    h += "<h2>問題別</h2>";
    (r.items || []).forEach(function (it, i) {
      var q = byId[it.questionId]; if (!q) return;
      h += '<div class="q"><div><strong>問 ' + (i + 1) + "</strong>　"
        + (it.score === null ? "未採点" : it.correct === true ? '<span class="ok">正解</span>'
           : !it.answered ? "未回答" : '<span class="ng">不正解</span>')
        + "　" + (it.score === null ? "－" : Math.round(it.score * 10) / 10) + " / " + it.maxScore + " 点</div>"
        + "<div>" + esc(String(q.prompt).slice(0, 200)) + "</div>"
        + (q.explanation ? '<div style="font-size:.9em;margin-top:1mm">' + esc(String(q.explanation).slice(0, 300)) + "</div>" : "")
        + "</div>";
    });

    if (r.analysis) {
      h += "<h2>分析</h2>";
      if (r.analysis.summary) h += "<div>" + esc(r.analysis.summary) + "</div>";
      if ((r.analysis.nextActions || []).length)
        h += "<ol>" + r.analysis.nextActions.map(function (a) { return "<li>" + esc(a.action) + "</li>"; }).join("") + "</ol>";
    }

    return print("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>"
      + esc(r.presetName || "結果") + " レポート</title><style>" + css + "</style></head><body>" + h + "</body></html>");
  }

  /* ══════════════════════════════════════════════════════════════════
     組版エンジンの差し替え口（§15 / §16）
     ・Typst / LaTeX の実行環境が入ったら、ここに実装を足すだけで切り替わる。
     ・現在は環境が無いため、呼ばれたら「未対応」を正直に返す。
     ══════════════════════════════════════════════════════════════════ */
  var adapters = {
    builtin: {
      id: "builtin", available: function () { return true; },
      build: function (spec, plan, opts) { return { ok: true, html: buildHtml(spec, plan, opts) }; },
      compile: function () { return Promise.resolve({ ok: true, via: "browser-print", note: "ブラウザの印刷から PDF にします。" }); }
    },
    typst: {
      id: "typst", available: function () { return false; },
      build: function () { return { ok: false, error: "ENGINE_UNAVAILABLE", message: "Typst の実行環境が導入されていません。" }; },
      compile: function () { return Promise.resolve({ ok: false, error: "ENGINE_UNAVAILABLE", message: "Typst の実行環境が導入されていません。" }); }
    },
    latex: {
      id: "latex", available: function () { return false; },
      build: function () { return { ok: false, error: "ENGINE_UNAVAILABLE", message: "LaTeX の実行環境が導入されていません。" }; },
      compile: function () { return Promise.resolve({ ok: false, error: "ENGINE_UNAVAILABLE", message: "LaTeX の実行環境が導入されていません。" }); }
    }
  };
  function adapter(id) { return adapters[id] || adapters.builtin; }

  VQ2.pdfRenderer = {
    rich: rich,
    pageCss: pageCss,
    buildHtml: buildHtml,
    buildArtifacts: buildArtifacts,
    gradingDefinition: gradingDefinition,
    renderToIframe: renderToIframe,
    print: print,
    printBooklet: printBooklet,
    printResultReport: printResultReport,
    downloadArtifact: downloadArtifact,
    adapter: adapter,
    adapters: adapters,
    numberKanji: numberKanji
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
