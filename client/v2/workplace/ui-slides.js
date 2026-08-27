/* ══════════════════════════════════════════════════════════════════════
   VocabuSlides（§15）

   ・静止画の一覧ではない。要素は座標つきで持ち、掴んで動かせる・大きさを変えられる。
   ・座標系は 960×540（16:9）に固定し、画面では拡大縮小するだけ。
     こうすると、どの画面幅で作っても同じ見た目で発表できる。
   ・要素の種類は Registry。出す道具は登録されているものだけ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, CH = WP.chart, REG = WP.elementRegistry;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  var BASE = { "16:9": { w: 960, h: 540 }, "4:3": { w: 960, h: 720 } };

  /* ══ テーマ ══════════════════════════════════════════════════════
     ただの背景色ではなく、1 つの「見た目の型」として持つ。
       bg      背景（べた塗り／グラデーション）
       fg/sub  見出しと本文の色
       accent  差し色（数字・線・図形の既定）
       titleFont / bodyFont  書体の組み合わせ
       decor   背景に敷く飾り（帯・円・格子など）
     飾りは SVG で描くので、どの拡大率でもぼけない。 */
  var THEMES = {
    minimal: { name: "Minimal", group: "定番", bg: "#ffffff", fg: "#111827", sub: "#6b7280",
      accent: "#2b70ef", accent2: "#93c5fd", titleFont: "sans", bodyFont: "sans", decor: "none" },
    paper: { name: "Paper", group: "定番", bg: "#faf9f6", fg: "#1f2937", sub: "#6b7280",
      accent: "#334155", accent2: "#cbd5e1", titleFont: "mincho", bodyFont: "mincho", decor: "rule" },
    modern: { name: "Modern", group: "定番", bg: "#f8fafc", fg: "#0f172a", sub: "#475569",
      accent: "#0f9d58", accent2: "#6ee7b7", titleFont: "sans", bodyFont: "sans", decor: "bar" },
    editorial: { name: "Editorial", group: "定番", bg: "#ffffff", fg: "#18181b", sub: "#52525b",
      accent: "#dc2626", accent2: "#fca5a5", titleFont: "mincho", bodyFont: "sans", decor: "sidebar" },
    softblue: { name: "Soft Blue", group: "やわらか", bg: "linear-gradient(160deg,#f0f7ff 0%,#e0efff 100%)",
      fg: "#0f2a4a", sub: "#456187", accent: "#2b70ef", accent2: "#bfdbfe",
      titleFont: "maru", bodyFont: "sans", decor: "blob" },
    mint: { name: "Mint", group: "やわらか", bg: "linear-gradient(160deg,#f0fdf9 0%,#dcfce7 100%)",
      fg: "#064e3b", sub: "#3f8a72", accent: "#0d9488", accent2: "#99f6e4",
      titleFont: "maru", bodyFont: "sans", decor: "dots" },
    sakura: { name: "Sakura", group: "やわらか", bg: "linear-gradient(160deg,#fff5f7 0%,#ffe4ec 100%)",
      fg: "#5b1e35", sub: "#95536c", accent: "#d1467a", accent2: "#fbcfe8",
      titleFont: "maru", bodyFont: "sans", decor: "blob" },
    warm: { name: "Warm", group: "やわらか", bg: "linear-gradient(160deg,#fffbeb 0%,#fef3c7 100%)",
      fg: "#451a03", sub: "#92400e", accent: "#e8710a", accent2: "#fed7aa",
      titleFont: "sans", bodyFont: "sans", decor: "rule" },
    ink: { name: "Ink", group: "濃い", bg: "#111827", fg: "#f9fafb", sub: "#9ca3af",
      accent: "#f472b6", accent2: "#4b5563", titleFont: "sans", bodyFont: "sans", decor: "bar" },
    cosmic: { name: "Cosmic V3", group: "濃い", bg: "radial-gradient(120% 100% at 20% 0%,#1e3a8a 0%,#0b1120 60%)",
      fg: "#ffffff", sub: "#94a3b8", accent: "#38bdf8", accent2: "#1e40af",
      titleFont: "sans", bodyFont: "sans", decor: "stars" },
    modernPurple: { name: "Modern Purple", group: "濃い",
      bg: "linear-gradient(140deg,#2e1065 0%,#5b21b6 60%,#7c3aed 100%)",
      fg: "#ffffff", sub: "#ddd6fe", accent: "#c4b5fd", accent2: "#8b5cf6",
      titleFont: "sans", bodyFont: "sans", decor: "blob" },
    forestNight: { name: "Forest Night", group: "濃い",
      bg: "linear-gradient(150deg,#052e2b 0%,#064e3b 70%,#065f46 100%)",
      fg: "#ecfdf5", sub: "#99f6e4", accent: "#34d399", accent2: "#065f46",
      titleFont: "sans", bodyFont: "sans", decor: "grid" },
    slate: { name: "Slate", group: "落ち着き", bg: "#1f2937", fg: "#f3f4f6", sub: "#9ca3af",
      accent: "#60a5fa", accent2: "#374151", titleFont: "sans", bodyFont: "sans", decor: "grid" },
    mono: { name: "Mono", group: "落ち着き", bg: "#fafafa", fg: "#0a0a0a", sub: "#525252",
      accent: "#0a0a0a", accent2: "#d4d4d4", titleFont: "mono", bodyFont: "mono", decor: "rule" },
    bold: { name: "Bold", group: "はっきり", bg: "#fef08a", fg: "#1c1917", sub: "#57534e",
      accent: "#dc2626", accent2: "#fbbf24", titleFont: "sans", bodyFont: "sans", decor: "corner" },
    gradient: { name: "Gradient", group: "はっきり",
      bg: "linear-gradient(120deg,#f97316 0%,#ec4899 50%,#8b5cf6 100%)",
      fg: "#ffffff", sub: "#fce7f3", accent: "#ffffff", accent2: "#fbcfe8",
      titleFont: "sans", bodyFont: "sans", decor: "none" }
  };
  /* 背景に敷く飾り。SVG なのでどの大きさでもぼけない。 */
  function decorSvg(th, w, h) {
    var a = esc(th.accent), a2 = esc(th.accent2 || th.accent);
    switch (th.decor) {
      case "bar":
        return '<rect x="0" y="0" width="' + w + '" height="7" fill="' + a + '"/>';
      case "sidebar":
        return '<rect x="0" y="0" width="10" height="' + h + '" fill="' + a + '"/>';
      case "rule":
        return '<rect x="56" y="' + (h - 46) + '" width="' + (w - 112) + '" height="1.5" fill="' + a2 + '"/>';
      case "corner":
        return '<path d="M' + w + ' 0 L' + w + ' ' + (h * 0.42) + ' L' + (w * 0.72) + ' 0 Z" fill="' + a
          + '" opacity="0.9"/>';
      case "blob":
        /* 主張しすぎない濃さにする。文字の上に色が乗って読みにくくならない範囲。 */
        return '<circle cx="' + (w * 0.97) + '" cy="' + (h * 0.06) + '" r="' + (h * 0.30)
          + '" fill="' + a2 + '" opacity="0.30"/>'
          + '<circle cx="' + (w * 0.03) + '" cy="' + (h * 1.0) + '" r="' + (h * 0.22)
          + '" fill="' + a + '" opacity="0.12"/>';
      case "dots":
        var d = "";
        for (var i = 0; i < 9; i++) for (var j = 0; j < 4; j++)
          d += '<circle cx="' + (w - 190 + i * 21) + '" cy="' + (h - 92 + j * 21) + '" r="3" fill="'
            + a + '" opacity="0.28"/>';
        return d;
      case "grid":
        var g = "";
        for (var x = 0; x <= w; x += 48) g += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + h
          + '" stroke="' + a2 + '" stroke-width="1" opacity="0.24"/>';
        for (var y = 0; y <= h; y += 48) g += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y
          + '" stroke="' + a2 + '" stroke-width="1" opacity="0.24"/>';
        return g;
      case "stars":
        var s = "", seed = 7;
        for (var k = 0; k < 46; k++) {
          seed = (seed * 1103515245 + 12345) % 2147483648;
          var sx = (seed / 2147483648) * w;
          seed = (seed * 1103515245 + 12345) % 2147483648;
          var sy = (seed / 2147483648) * h;
          seed = (seed * 1103515245 + 12345) % 2147483648;
          var sr = 0.7 + (seed / 2147483648) * 1.7;
          s += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + sr.toFixed(1)
            + '" fill="#fff" opacity="' + (0.25 + sr / 6).toFixed(2) + '"/>';
        }
        return s;
      default:
        return "";
    }
  }
  /* ══ アニメーション ══════════════════════════════════════════ */
  var TRANSITIONS_ANIM = {
    none: "", fade: "wpp-in-fade", slide: "wpp-in-slide", zoom: "wpp-in-zoom",
    push: "wpp-in-push", dissolve: "wpp-in-dissolve", flip: "wpp-in-flip"
  };
  var EL_ANIMS = [
    { id: "", label: "なし" },
    { id: "fade", label: "ふわっと出る" },
    { id: "up", label: "下から上へ" },
    { id: "left", label: "左から入る" },
    { id: "right", label: "右から入る" },
    { id: "zoom", label: "大きくなりながら" },
    { id: "pop", label: "ぽんと出る" }
  ];
  var LAYOUTS = [
    { id: "title", label: "タイトル" }, { id: "title_body", label: "タイトルと本文" },
    { id: "section", label: "セクション" }, { id: "two_col", label: "2カラム" },
    { id: "three_col", label: "3カラム" }, { id: "image_text", label: "画像と文章" },
    { id: "big_image", label: "大きな画像" }, { id: "compare", label: "比較" },
    { id: "quote", label: "引用" }, { id: "number", label: "数字" },
    { id: "chart", label: "グラフ" }, { id: "timeline", label: "タイムライン" },
    { id: "process", label: "プロセス" }, { id: "team", label: "チーム紹介" },
    { id: "qa", label: "Q&A" }, { id: "summary", label: "まとめ" }, { id: "blank", label: "空白" }
  ];
  var TRANSITIONS = [
    { id: "none", label: "なし" }, { id: "fade", label: "フェード" }, { id: "slide", label: "スライド" },
    { id: "zoom", label: "ズーム" }, { id: "push", label: "プッシュ" }, { id: "dissolve", label: "ディゾルブ" },
    { id: "flip", label: "めくる" }
  ];

  /* ── 要素の登録 ───────────────────────────────────────────────── */
  function regEl(type, label, iconName, level, render) {
    REG.register({ type: type, label: label, icon: iconName, level: level, render: render, editor: true });
  }
  /* テキストはキャンバスの上で直接打てるようにする（§15.4）。
     右のパネルからしか直せないと、発表資料は作れない。
     編集中かどうかは ctx.editing が渡ってくる（二重クリックで入る）。 */
  /* 書体はテーマの組み合わせを既定にする（見出しと本文で変える）。
     自分で選んだ場合はそちらを優先する。 */
  function elFont(e, th) {
    var id = e.font || e.themeFont
      || ((e.size || 20) >= 30 ? (th.titleFont || "sans") : (th.bodyFont || "sans"));
    return U.fontCss(id);
  }
  regEl("text", "テキスト", "text", 1, function (e, th, ctx) {
    var editing = ctx && ctx.editing;
    return '<div class="wpp-el__t' + (editing ? " is-editing" : "") + '"'
      + (editing ? ' contenteditable="true" data-edit="' + esc(e.id) + '" role="textbox" aria-multiline="true"' : "")
      + ' data-ph="ここに文字を入力" style="font-family:' + elFont(e, th)
      + ";font-size:" + (e.size || 20) + "px;font-weight:"
      + (e.bold ? 700 : 400) + ";font-style:" + (e.italic ? "italic" : "normal")
      + ";text-decoration:" + (e.underline ? "underline" : "none")
      + ";color:" + esc(e.color || th.fg) + ";text-align:" + esc(e.align || "left")
      + ";line-height:" + (e.lh || 1.5) + ";opacity:" + (e.opacity === undefined ? 1 : e.opacity)
      + ';white-space:pre-wrap">' + esc(e.text || "") + "</div>";
  });
  regEl("shape", "図形", "shapes", 1, function (e, th) {
    var fill = esc(e.fill || th.accent);
    if (e.shape === "circle")
      return '<div style="width:100%;height:100%;border-radius:50%;background:' + fill + ';opacity:'
        + (e.opacity === undefined ? 1 : e.opacity) + '"></div>';
    if (e.shape === "triangle")
      return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">'
        + '<polygon points="50,4 96,96 4,96" fill="' + fill + '"/></svg>';
    return '<div style="width:100%;height:100%;border-radius:' + (e.radius || 6) + "px;background:" + fill
      + ";opacity:" + (e.opacity === undefined ? 1 : e.opacity) + '"></div>';
  });
  regEl("line", "線", "minus", 2, function (e, th) {
    return '<svg viewBox="0 0 100 10" preserveAspectRatio="none" style="width:100%;height:100%">'
      + '<line x1="0" y1="5" x2="100" y2="5" stroke="' + esc(e.color || th.fg) + '" stroke-width="'
      + (e.weight || 2) + '"/></svg>';
  });
  regEl("arrow", "矢印", "chevronR", 2, function (e, th) {
    var c = esc(e.color || th.accent);
    return '<svg viewBox="0 0 100 20" preserveAspectRatio="none" style="width:100%;height:100%">'
      + '<line x1="2" y1="10" x2="88" y2="10" stroke="' + c + '" stroke-width="3"/>'
      + '<polygon points="88,3 99,10 88,17" fill="' + c + '"/></svg>';
  });
  regEl("image", "画像", "image", 1, function (e) {
    if (!e.src) return '<div style="width:100%;height:100%;display:grid;place-items:center;'
      + 'background:#e2e8f0;color:#64748b;font-size:13px">画像を選ぶ</div>';
    return '<img src="' + esc(e.src) + '" alt="' + esc(e.alt || "") + '" style="width:100%;height:100%;object-fit:'
      + esc(e.fit || "cover") + ';border-radius:' + (e.radius || 0) + 'px" />';
  });
  /* 表はスライドの上で直接打てるようにする。列の幅もつまんで変えられる。 */
  regEl("table", "表", "table", 2, function (e, th, ctx) {
    var rows = e.rows || [["", ""], ["", ""]];
    var cols = (rows[0] || []).length;
    var wArr = e.colW || [];
    var editing = ctx && ctx.editing;
    var h = '<table class="wpp-tbl' + (editing ? " is-editing" : "")
      + '" data-tbl="' + esc(e.id) + '" style="width:100%;height:100%;border-collapse:collapse;'
      + "table-layout:fixed;font-size:" + (e.size || 14) + "px;color:" + esc(th.fg) + '"><colgroup>';
    for (var i = 0; i < cols; i++)
      h += "<col" + (wArr[i] ? ' style="width:' + Number(wArr[i]) + '%"' : "") + " />";
    h += "</colgroup>";
    rows.forEach(function (r, ri) {
      h += "<tr>" + r.map(function (c, ci) {
        return '<td class="wpp-td" data-r="' + ri + '" data-c="' + ci + '"'
          + (editing ? ' contenteditable="true"' : "")
          + ' style="border:1px solid ' + esc(th.sub) + ";padding:6px 8px;position:relative;overflow:hidden"
          + (ri === 0 ? ";font-weight:700;background:rgba(127,127,127,.12)" : "") + '">' + esc(c)
          + (ri === 0 && ci < r.length - 1 && editing
            ? '<span class="wpp-colgrip" contenteditable="false" data-grip="' + ci + '"></span>' : "")
          + "</td>";
      }).join("") + "</tr>";
    });
    return h + "</table>";
  });
  regEl("chart", "グラフ", "chart", 1, function (e) {
    return '<div style="width:100%;height:100%;background:#fff;border-radius:6px;padding:6px">'
      + CH.render(e.chart || { type: "bar", labels: [], series: [] }, { width: e.w || 600, height: (e.h || 300) - 20 })
      + "</div>";
  });
  regEl("number", "大きな数字", "type", 2, function (e, th, ctx) {
    var editing = ctx && ctx.editing;
    return '<div style="width:100%;height:100%;display:grid;place-items:center;text-align:center">'
      + '<div style="width:100%"><div class="wpp-el__t' + (editing ? " is-editing" : "") + '"'
      + (editing ? ' contenteditable="true" data-edit="' + esc(e.id) + '" role="textbox"' : "")
      + ' style="font-family:' + elFont(e, th) + ";font-size:" + (e.size || 84)
      + "px;font-weight:800;color:" + esc(e.color || th.accent)
      + ';outline:none">' + esc(e.text || "0") + "</div>"
      + '<div style="font-family:' + U.fontCss(th.bodyFont) + ";font-size:18px;color:" + esc(th.sub)
      + '">' + esc(e.label || "") + "</div></div></div>";
  });

  /* ══ 画面 ══════════════════════════════════════════════════════ */
  function open(o) {
    o = o || {};
    var item = o.item, content = o.content;
    var body = content.content;
    if (!body.slides || !body.slides.length) body.slides = [M.newSlide("title")];
    if (!body.ratio) body.ratio = "16:9";
    /* 作りたてで 1 枚も中身が無いときは、レイアウトの枠を入れておく。
       まっさらな白い箱だけだと、何をすればよいか分からないため。 */
    var needSeed = body.slides.length === 1 && !(body.slides[0].elements || []).length;
    if (!body.theme) body.theme = "minimal";
    if (!body.transition) body.transition = { type: "fade", speed: 300 };

    var session = ST.session(item, content, { intervalMs: ST.prefs().autosaveMs,
      autosave: ST.prefs().autosave });
    var shell = new U.EditorShell({ session: session, onClose: o.onClose,
      onRestore: function () { body = session.content.content; cur = 0; selEl = null; paint(); },
      onAi: function () { aiSlides(); },
      onModeChange: function () { paint(); },
      moreItems: [
        { label: "発表を始める", icon: "play", run: present },
        { label: "PDF / 画像で書き出し", icon: "download", run: exportSheet },
        { label: "デザイン（テーマ）", icon: "palette", run: designSheet }
      ] });

    var api = VQ2.ui.mount("vq-wp-slides", { title: item.title, css: WP.CSS || "",
      onBeforeClose: function () { shell.tryClose(); return false; } });

    var cur = 0, selEl = null, scale = 1, showNotes = false;
    /* いま文字を打っている要素。二重クリックで入り、外を押すと抜ける。
       打っているあいだは掴んで動かさない（カーソルが置けなくなるため）。 */
    var editingEl = null;
    var dragging = false;

    if (needSeed) {
      body.slides[0].elements = layoutElements(body.slides[0].layout || "title");
      needSeed = false;
    }
    paint();
    shell.bindHeader(api.root, api);
    bind();
    registerCommands();

    function theme() { return THEMES[body.theme] || THEMES.minimal; }
    function base() { return BASE[body.ratio] || BASE["16:9"]; }
    function slide() { return body.slides[cur]; }
    function elOf(id) {
      var s = slide();
      for (var i = 0; i < s.elements.length; i++) if (s.elements[i].id === id) return s.elements[i];
      return null;
    }

    function paint() {
      api.root.innerHTML = '<div class="wp">' + shell.headerHtml() + toolbar() + ctxBar()
        + '<div class="wp-body">'
        + '<aside class="wp-left"><div class="wp-panel__h">スライド（' + body.slides.length + "）</div>"
        + thumbs() + "</aside>"
        + '<div class="wp-main"><div class="wpp-stage" data-role="stage">' + canvas() + "</div>"
        + (showNotes ? notesBox() : "") + "</div>"
        + '<aside class="wp-right">' + rightPanel() + "</aside>"
        + "</div>" + mobileBar() + "</div>";
      shell.host = api.root;
      shell.syncUndoButtons();
      fitCanvas();
    }
    function toolbar() {
      var lv = shell.mode;
      var h = '<div class="wp-tools">'
        + btn({ icon: "plus", label: "新規スライド", act: "slide+" })
        + btn({ icon: "layout", label: "レイアウト", act: "layout-menu" })
        + '<span class="wp-sep"></span>'
        + btn({ icon: "text", label: "テキスト", act: "add", val: "text" })
        + btn({ icon: "image", label: "画像", act: "add", val: "image" })
        + btn({ icon: "shapes", label: "図形", act: "shape-menu" });
      if (lv !== "simple")
        h += btn({ icon: "chart", label: "グラフ", act: "add", val: "chart" })
          + btn({ icon: "table", label: "表", act: "add", val: "table" });
      h += btn({ icon: "palette", label: "デザイン", act: "design" })
        + btn({ icon: "sparkle", label: "AI", act: "ai" })
        + '<span class="wp-top__sp"></span>'
        + btn({ icon: "doc2", iconOnly: true, label: "発表者ノート", act: "notes", on: showNotes })
        + btn({ icon: "play", label: "発表", act: "present", variant: "primary" })
        + btn({ icon: "more", iconOnly: true, label: "その他", act: "more-tools" });
      return h + "</div>";
    }
    function ctxBar() {
      if (!selEl) return "";
      var e = elOf(selEl);
      if (!e) return "";
      var d = REG.get(e.type);
      var h = '<div class="wp-ctx"><span class="wp-ctx__l">' + esc(d ? d.label : e.type) + "</span>";
      if (e.type === "text" || e.type === "number") {
        h += '<button type="button" class="wp-btn wp-fontbtn" data-act="el-font-menu" title="書体">'
          + icon("type") + "<span>" + esc(e.font ? U.fontLabel(e.font) : "テーマの書体")
          + "</span>" + icon("chevronD") + "</button>"
          + '<span class="wp-num"><button type="button" class="wp-btn is-icon" data-act="el" data-val="size-" '
          + 'aria-label="小さく">A－</button>'
          + '<input class="wp-num__i" type="number" min="8" max="200" value="' + (e.size || 20)
          + '" data-act="el-size" aria-label="文字の大きさ" />'
          + '<button type="button" class="wp-btn is-icon" data-act="el" data-val="size+" aria-label="大きく">A＋</button></span>'
          + btn({ icon: "bold", iconOnly: true, label: "太字", act: "el", val: "bold", on: !!e.bold })
          + btn({ icon: "italic", iconOnly: true, label: "斜体", act: "el", val: "italic", on: !!e.italic })
          + btn({ icon: "underline", iconOnly: true, label: "下線", act: "el", val: "underline", on: !!e.underline })
          + btn({ icon: "alignL", iconOnly: true, label: "左", act: "el", val: "left" })
          + btn({ icon: "alignC", iconOnly: true, label: "中央", act: "el", val: "center" })
          + btn({ icon: "alignR", iconOnly: true, label: "右", act: "el", val: "right" })
          + btn({ icon: "palette", iconOnly: true, label: "文字色", act: "el-color" });
      } else if (e.type === "table") {
        h += btn({ icon: "type", label: "文字を打つ", act: "edit-table" })
          + btn({ icon: "rows", label: "行を追加", act: "tbl", val: "row+" })
          + btn({ icon: "cols", label: "列を追加", act: "tbl", val: "col+" })
          + btn({ icon: "minus", label: "行を削除", act: "tbl", val: "row-" })
          + btn({ icon: "minus", label: "列を削除", act: "tbl", val: "col-" })
          + btn({ icon: "palette", iconOnly: true, label: "色", act: "el-color" });
      } else if (e.type === "image") {
        h += btn({ icon: "image", label: "画像を選ぶ", act: "pick-img" })
          + btn({ label: "全体を入れる", act: "el", val: "fit-contain" })
          + btn({ label: "切り抜き", act: "el", val: "fit-cover" });
      } else {
        h += btn({ icon: "palette", iconOnly: true, label: "色", act: "el-color" });
      }
      h += '<span class="wp-sep"></span>'
        + btn({ label: "最前面", act: "el", val: "front" })
        + btn({ label: "最背面", act: "el", val: "back" })
        + btn({ label: "中央へ", act: "el", val: "center-h" })
        + btn({ icon: "play", label: "アニメ", act: "anim", on: !!e.anim,
          title: "この要素の出てくる動き" })
        + '<span class="wp-top__sp"></span>'
        + btn({ icon: "copy", iconOnly: true, label: "複製", act: "el", val: "dup" })
        + btn({ icon: "trash", iconOnly: true, label: "削除", act: "el", val: "del" });
      return h + "</div>";
    }
    function mobileBar() {
      return '<div class="wp-mbar">'
        + btn({ icon: "plus", iconOnly: true, label: "新規スライド", act: "slide+" })
        + btn({ icon: "text", iconOnly: true, label: "テキスト", act: "add", val: "text" })
        + btn({ icon: "image", iconOnly: true, label: "画像", act: "add", val: "image" })
        + btn({ icon: "shapes", iconOnly: true, label: "図形", act: "shape-menu" })
        + btn({ icon: "layout", iconOnly: true, label: "レイアウト", act: "layout-menu" })
        + btn({ icon: "palette", iconOnly: true, label: "デザイン", act: "design" })
        + btn({ icon: "layers", iconOnly: true, label: "スライド一覧", act: "thumbs-sheet" })
        + btn({ icon: "play", iconOnly: true, label: "発表", act: "present" })
        + "</div>";
    }
    function thumbs() {
      var b = base(), th = theme();
      return '<div class="wpp-thumbs">' + body.slides.map(function (s, i) {
        return '<button type="button" class="wpp-th' + (i === cur ? " is-on" : "") + '" data-act="go" data-i="'
          + i + '" aria-label="' + (i + 1) + " 枚目" + '">'
          + '<span class="wpp-th__n">' + (i + 1) + "</span>"
          + '<div class="wpp-th__c" style="background:' + esc(s.background || th.bg) + '">'
          + '<div style="position:absolute;inset:0;transform:scale(' + (200 / b.w) + ');transform-origin:0 0;width:'
          + b.w + "px;height:" + b.h + 'px">'
          + (!s.background && th.decor && th.decor !== "none"
            ? '<svg class="wpp-decor" viewBox="0 0 ' + b.w + " " + b.h + '" width="' + b.w + '" height="'
              + b.h + '" aria-hidden="true">' + decorSvg(th, b.w, b.h) + "</svg>" : "")
          + s.elements.map(function (e) { return elHtml(e, th, true); }).join("")
          + "</div></div>"
          + (s.hidden ? '<span class="wp-chip is-warn" style="position:absolute;right:4px;top:4px">非表示</span>' : "")
          + "</button>";
      }).join("")
        + '<button type="button" class="wpf-add__b" data-act="slide+" style="justify-content:center">'
        + icon("plus") + "<span>スライドを追加</span></button></div>";
    }
    /* 縮小は transform で行う。ただし transform は **場所を取る大きさを変えない** ので、
       外側の枠に「縮めたあとの実寸」を持たせる。これが無いと 960px ぶんの場所を
       取り続け、右と下へはみ出す（実測でそうなっていた）。 */
    function canvas() {
      var b = base(), th = theme(), s = slide();
      return '<div class="wpp-fit" data-role="fit" style="width:' + b.w + "px;height:" + b.h + 'px">'
        + '<div class="wpp-canvas" data-role="canvas" style="width:' + b.w + "px;height:" + b.h
        + "px;background:" + esc(slideBg(s)) + ';transform-origin:0 0">'
        + decorHtml(th, b)
        + s.elements.map(function (e) { return elHtml(e, th, false); }).join("") + "</div></div>";
    }
    /* テーマの飾り。個別の背景色を指定したスライドには出さない（色がぶつかるため）。 */
    function decorHtml(th, b) {
      if (!th.decor || th.decor === "none" || slide().background) return "";
      return '<svg class="wpp-decor" viewBox="0 0 ' + b.w + " " + b.h + '" width="' + b.w
        + '" height="' + b.h + '" aria-hidden="true">' + decorSvg(th, b.w, b.h) + "</svg>";
    }
    /* ── 要素を探すときは必ずキャンバスの中だけを見る ────────────────
       左のプレビュー一覧にも同じ要素が描かれている。DOM の並びでは
       プレビューのほうが先に来るので、`[data-el=...]` で素直に探すと
       **プレビュー側が当たる**。
       実測: キャンバスの上で動かしても、左の一覧だけが動いて
       本体が動かない、という状態になっていた。
       ここを直すために (1) プレビューには data-el を付けない
       (2) 探すときはキャンバスに限る、の 2 つを両方やる。 */
    function canvasEl(id) {
      return api.root.querySelector('[data-role="canvas"] [data-el="' + id + '"]');
    }
    function elHtml(e, th, isThumb, o) {
      o = o || {};
      var d = REG.get(e.type);
      if (!d) return "";
      var sel = !isThumb && e.id === selEl;
      var editing = !isThumb && e.id === editingEl;
      return '<div class="wpp-el' + (sel ? " is-sel" : "") + (editing ? " is-editing" : "")
        + (o.animClass ? " " + o.animClass : "")
        + '"' + (isThumb ? "" : ' data-el="' + esc(e.id) + '"') + ' style="left:'
        + e.x + "px;top:" + e.y + "px;width:" + e.w + "px;height:" + e.h + "px;z-index:" + (e.z || 1)
        + (e.rotate ? ";transform:rotate(" + e.rotate + "deg)" : "")
        + (o.animDelay ? ";animation-delay:" + o.animDelay + "ms" : "")
        + (e.locked ? ";pointer-events:none" : "") + '">'
        + d.render(e, th, { editing: editing })
        + (sel && !editing
          ? '<span class="wpp-hnd nw" data-h="nw"></span><span class="wpp-hnd ne" data-h="ne"></span>'
            + '<span class="wpp-hnd sw" data-h="sw"></span><span class="wpp-hnd se" data-h="se"></span>'
          : "")
        + "</div>";
    }
    function canEditText(e) {
      return e && (e.type === "text" || e.type === "number" || e.type === "table");
    }
    /* 背景（テーマ or スライド個別）。グラデーションもそのまま使える。 */
    function slideBg(s) {
      var th = theme();
      return s && s.background ? s.background : th.bg;
    }
    /* 文字の編集へ入る。全部描き直さず、その要素だけ差し替えてカーソルを置く。 */
    function enterEdit(id) {
      var e = elOf(id);
      if (!e || e.locked || !canEditText(e)) return;
      editingEl = id;
      selEl = id;
      redrawEl(id);
      var host = canvasEl(id);
      var node = host && host.querySelector("[data-edit]");
      if (!node) return;
      node.focus();
      try {
        var r = doc.createRange(), s = api.shadow.getSelection ? api.shadow.getSelection() : root.getSelection();
        r.selectNodeContents(node);
        r.collapse(false);
        s.removeAllRanges(); s.addRange(r);
      } catch (er) {}
    }
    function exitEdit() {
      if (!editingEl) return;
      var id = editingEl;
      commitEditText();
      editingEl = null;
      redrawEl(id);
      refreshThumbs();
    }
    function commitEditText() {
      if (!editingEl) return;
      var host = canvasEl(editingEl);
      var node = host && host.querySelector("[data-edit]");
      var e = elOf(editingEl);
      if (!node || !e) return;
      var t = node.innerText !== undefined ? node.innerText : node.textContent;
      if (String(e.text || "") === String(t)) return;
      e.text = String(t).replace(/\n$/, "");
      session.touch();
    }
    /* 1 要素だけ描き直す。全部描き直すと、掴んでいる最中に対象が消える。 */
    function redrawEl(id) {
      var node = canvasEl(id);
      var e = elOf(id);
      if (!node || !e) { paint(); return; }
      var tmp = doc.createElement("div");
      tmp.innerHTML = elHtml(e, theme(), false);
      node.replaceWith(tmp.firstChild);
    }
    function refreshThumbs() {
      var th = api.root.querySelector(".wpp-thumbs");
      if (th) th.outerHTML = thumbs();
    }
    /* 選んでいる印だけを付け替える（描き直さない）。 */
    function markSelected(id) {
      Array.prototype.forEach.call(api.root.querySelectorAll(".wpp-canvas .wpp-el"), function (n) {
        var on = n.getAttribute("data-el") === id;
        n.classList.toggle("is-sel", on);
        var hasHnd = !!n.querySelector(".wpp-hnd");
        if (on && !hasHnd && editingEl !== id) {
          n.insertAdjacentHTML("beforeend",
            '<span class="wpp-hnd nw" data-h="nw"></span><span class="wpp-hnd ne" data-h="ne"></span>'
            + '<span class="wpp-hnd sw" data-h="sw"></span><span class="wpp-hnd se" data-h="se"></span>');
        } else if (!on && hasHnd) {
          Array.prototype.forEach.call(n.querySelectorAll(".wpp-hnd"), function (x) { x.remove(); });
        }
      });
      refreshRight();
    }
    function refreshRight() {
      var r = api.root.querySelector(".wp-right");
      if (r) r.innerHTML = rightPanel();
      var c = api.root.querySelector(".wp-ctx");
      var next = ctxBar();
      if (c) c.outerHTML = next;
      else if (next) {
        var tools = api.root.querySelector(".wp-tools");
        if (tools) tools.insertAdjacentHTML("afterend", next);
      }
    }
    function notesBox() {
      return '<div class="wpp-notes"><label class="wp-lab" for="wpn">発表者ノート（' + (cur + 1) + " 枚目）</label>"
        + '<textarea class="wp-ta" id="wpn" data-act="notes-in" placeholder="話す内容のメモ。発表画面にだけ出ます。">'
        + esc(slide().notes || "") + "</textarea></div>";
    }
    function rightPanel() {
      if (selEl) return elPanel();
      return slidePanel();
    }
    function slidePanel() {
      var s = slide();
      return '<div class="wp-panel__h">スライドの設定</div><div style="padding:0 14px 16px">'
        + '<div class="wp-row"><label class="wp-lab" for="sl-layout">レイアウト</label>'
        + '<select class="wp-sel" id="sl-layout" data-act="set-layout">'
        + LAYOUTS.map(function (l) {
          return '<option value="' + l.id + '"' + (s.layout === l.id ? " selected" : "") + ">" + esc(l.label) + "</option>";
        }).join("") + "</select></div>"
        + '<div class="wp-row"><label class="wp-lab" for="sl-tr">画面の切り替え</label>'
        + '<select class="wp-sel" id="sl-tr" data-act="set-tr">'
        + TRANSITIONS.map(function (t) {
          return '<option value="' + t.id + '"' + ((s.transition || body.transition.type) === t.id ? " selected" : "")
            + ">" + esc(t.label) + "</option>";
        }).join("") + "</select></div>"
        + '<label class="wp-switch"><input type="checkbox" data-act="sl-hide"' + (s.hidden ? " checked" : "")
        + " />発表のとき飛ばす</label>"
        + '<div class="wp-row" style="margin-top:14px"><div class="wp-lab">背景色</div>'
        + '<div class="wp-inline" style="flex-wrap:wrap">'
        + ["", "#ffffff", "#f1f5f9", "#0b1120", "#2e1065", "#fffbeb"].map(function (c) {
          return '<button type="button" data-act="sl-bg" data-val="' + c + '" aria-label="背景 ' + (c || "テーマ通り")
            + '" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--vq-border);cursor:pointer;'
            + "background:" + (c || "repeating-linear-gradient(45deg,#eee,#eee 4px,#fff 4px,#fff 8px)") + '"></button>';
        }).join("") + "</div></div>"
        + '<div class="wp-lab" style="margin-top:16px">要素（' + s.elements.length + "）</div>"
        + s.elements.map(function (e) {
          var d = REG.get(e.type);
          return '<button type="button" class="wp-cmd__i" data-act="pick-el" data-val="' + esc(e.id) + '">'
            + icon(d ? d.icon : "shapes") + "<span>" + esc(d ? d.label : e.type)
            + (e.text ? "：" + esc(String(e.text).slice(0, 14)) : "") + "</span></button>";
        }).join("")
        + "</div>";
    }
    function elPanel() {
      var e = elOf(selEl);
      if (!e) return slidePanel();
      var d = REG.get(e.type);
      var h = '<div class="wp-panel__h">' + esc(d ? d.label : e.type) + " の設定</div><div style=\"padding:0 14px 16px\">";
      if (e.type === "text" || e.type === "number") {
        h += '<div class="wp-row"><label class="wp-lab" for="et">文字</label>'
          + '<textarea class="wp-ta" id="et" data-act="el-text">' + esc(e.text || "") + "</textarea></div>"
          + '<div class="wp-row"><label class="wp-lab" for="es">サイズ</label>'
          + '<input class="wp-in" id="es" type="number" min="8" max="140" value="' + (e.size || 20)
          + '" data-act="el-size" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="el">行間</label>'
          + '<input class="wp-in" id="el" type="number" step="0.1" min="1" max="3" value="' + (e.lh || 1.5)
          + '" data-act="el-lh" /></div>';
      }
      if (e.type === "number")
        h += '<div class="wp-row"><label class="wp-lab" for="enl">下の説明</label>'
          + '<input class="wp-in" id="enl" value="' + esc(e.label || "") + '" data-act="el-label" /></div>';
      if (e.type === "image")
        h += btn({ icon: "image", label: "画像を選ぶ", act: "pick-img", variant: "outline", cls: "is-lg" })
          + '<div class="wp-row" style="margin-top:10px"><label class="wp-lab" for="ea">代替テキスト（読み上げ用）</label>'
          + '<input class="wp-in" id="ea" value="' + esc(e.alt || "") + '" data-act="el-alt" /></div>';
      if (e.type === "chart")
        h += btn({ icon: "chart", label: "グラフの内容を編集", act: "edit-chart", variant: "outline", cls: "is-lg" });
      if (e.type === "table")
        h += '<div class="wp-inline">' + btn({ label: "行を追加", act: "tbl", val: "row+" })
          + btn({ label: "列を追加", act: "tbl", val: "col+" }) + "</div>"
          + '<div class="wp-lab" style="margin-top:8px">表の文字は、スライド上のマスを押すと直せます。</div>';
      h += '<div class="wp-row" style="margin-top:12px"><div class="wp-lab">位置と大きさ</div>'
        + '<div class="wp-inline">'
        + '<input class="wp-in" type="number" value="' + Math.round(e.x) + '" data-act="el-x" aria-label="X" />'
        + '<input class="wp-in" type="number" value="' + Math.round(e.y) + '" data-act="el-y" aria-label="Y" />'
        + "</div><div class=\"wp-inline\" style=\"margin-top:6px\">"
        + '<input class="wp-in" type="number" value="' + Math.round(e.w) + '" data-act="el-w" aria-label="幅" />'
        + '<input class="wp-in" type="number" value="' + Math.round(e.h) + '" data-act="el-h" aria-label="高さ" />'
        + "</div></div>"
        + '<label class="wp-switch"><input type="checkbox" data-act="el-lock"' + (e.locked ? " checked" : "")
        + " />動かせないようにする</label>"
        + btn({ label: "スライドの設定へ戻る", act: "pick-el", val: "", variant: "outline", cls: "is-lg" })
        + "</div>";
      return h;
    }

    function fitCanvas() {
      var stage = api.root.querySelector('[data-role="stage"]');
      var cv = api.root.querySelector('[data-role="canvas"]');
      var fit = api.root.querySelector('[data-role="fit"]');
      if (!stage || !cv || !fit) return;
      var b = base();
      var aw = Math.max(120, stage.clientWidth - 40), ah = Math.max(90, stage.clientHeight - 40);
      scale = Math.min(aw / b.w, ah / b.h, 1.4);
      if (!isFinite(scale) || scale <= 0) scale = 0.5;
      cv.style.transform = "scale(" + scale + ")";
      fit.style.width = Math.round(b.w * scale) + "px";
      fit.style.height = Math.round(b.h * scale) + "px";
    }

    /* ── 操作 ─────────────────────────────────────────────────── */
    function bind() {
      root.addEventListener("resize", fitCanvas);
      U.keepSelection(api.root);

      api.root.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (t && api.root.contains(t)) {
          if (handle(t.getAttribute("data-act"), t.getAttribute("data-val"), t)) { e.preventDefault(); return; }
        }
        if (dragging) return;
        var el = e.target.closest ? e.target.closest("[data-el]") : null;
        var cv = e.target.closest ? e.target.closest('[data-role="canvas"]') : null;
        if (el) {
          var id = el.getAttribute("data-el");
          if (editingEl && editingEl !== id) exitEdit();
          if (id !== selEl) { selEl = id; markSelected(id); }
        } else if (cv) {
          if (editingEl) exitEdit();
          if (selEl) { selEl = null; markSelected(null); }
        }
      });
      /* 二重クリックでキャンバスの上に直接文字を打てる。 */
      api.root.addEventListener("dblclick", function (e) {
        var el = e.target.closest ? e.target.closest("[data-el]") : null;
        if (!el) return;
        var m = elOf(el.getAttribute("data-el"));
        if (!m) return;
        e.preventDefault();
        if (canEditText(m)) enterEdit(m.id);
        else if (m.type === "chart") { selEl = m.id; markSelected(m.id); editChart(); }
        else if (m.type === "image") { selEl = m.id; markSelected(m.id); pickImage(); }
      });
      /* キャンバスの上で打った文字をモデルへ写す（描き直さない）。 */
      api.root.addEventListener("input", function (e) {
        var ed = e.target.closest ? e.target.closest("[data-edit]") : null;
        if (ed) {
          var m = elOf(ed.getAttribute("data-edit"));
          if (!m) return;
          m.text = (ed.innerText !== undefined ? ed.innerText : ed.textContent).replace(/\n$/, "");
          session.touch();
          return;
        }
        /* 表のマス（スライドの上で直接打てる） */
        var td = e.target.closest ? e.target.closest(".wpp-td") : null;
        if (!td) return;
        var tbl = td.closest("[data-tbl]");
        var el = tbl && elOf(tbl.getAttribute("data-tbl"));
        if (!el || !el.rows) return;
        var r = Number(td.getAttribute("data-r")), c = Number(td.getAttribute("data-c"));
        if (el.rows[r]) {
          /* 取っ手の span は文字に数えない */
          var clone = td.cloneNode(true);
          Array.prototype.forEach.call(clone.querySelectorAll(".wpp-colgrip"), function (x) { x.remove(); });
          el.rows[r][c] = clone.textContent;
          session.touch();
        }
      });
      /* 表のマスの移動（Tab） */
      api.root.addEventListener("keydown", function (e) {
        var td = e.target.closest ? e.target.closest(".wpp-td") : null;
        if (!td || e.key !== "Tab") return;
        e.preventDefault();
        e.stopPropagation();
        var cells = Array.prototype.slice.call(td.closest("table").querySelectorAll(".wpp-td"));
        var k = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (cells[k]) cells[k].focus();
      });
      /* スライドの表の列幅（つまんで動かす。% で持つので拡大しても崩れない） */
      api.root.addEventListener("mousedown", startSlideColResize, true);
      api.root.addEventListener("keydown", function (e) {
        var ed = e.target.closest ? e.target.closest("[data-edit]") : null;
        if (!ed) return;
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); exitEdit(); }
      });
      api.root.addEventListener("focusout", function (e) {
        var ed = e.target.closest ? e.target.closest("[data-edit]") : null;
        if (!ed) return;
        root.setTimeout(function () {
          var a = api.shadow.activeElement;
          if (!a || !a.closest || !a.closest("[data-edit]")) exitEdit();
        }, 60);
      });

      /* 右クリック */
      api.root.addEventListener("contextmenu", function (e) {
        var onCanvas = e.target.closest ? e.target.closest('[data-role="canvas"]') : null;
        var onThumb = e.target.closest ? e.target.closest(".wpp-th") : null;
        if (!onCanvas && !onThumb) return;
        e.preventDefault();
        if (onThumb) {
          cur = Number(onThumb.getAttribute("data-i"));
          selEl = null;
          paint();
          slideContextMenu(e.clientX, e.clientY);
          return;
        }
        var elBox = e.target.closest ? e.target.closest("[data-el]") : null;
        if (elBox) {
          var id = elBox.getAttribute("data-el");
          if (id !== selEl) { selEl = id; markSelected(id); }
          elementContextMenu(e.clientX, e.clientY);
        } else {
          if (selEl) { selEl = null; markSelected(null); }
          canvasContextMenu(e.clientX, e.clientY);
        }
      });

      api.root.addEventListener("input", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var a = t.getAttribute("data-act");
        if (a === "notes-in") { slide().notes = t.value; session.touch(); return; }
        var el = elOf(selEl);
        if (!el) return;
        var map = { "el-text": "text", "el-label": "label", "el-alt": "alt" };
        if (map[a]) { el[map[a]] = t.value; session.touch(); repaintCanvas(); return; }
        var nmap = { "el-size": "size", "el-lh": "lh", "el-x": "x", "el-y": "y", "el-w": "w", "el-h": "h" };
        if (nmap[a]) { el[nmap[a]] = Number(t.value) || 0; session.touch(); redrawEl(el.id); refreshThumbs(); }
      });

      api.root.addEventListener("change", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var a = t.getAttribute("data-act");
        if (a === "set-layout") { applyLayout(t.value); }
        else if (a === "set-tr") { slide().transition = t.value; session.touch(); }
        else if (a === "sl-hide") { slide().hidden = t.checked; session.touch(); paint(); }
        else if (a === "el-lock") { var el = elOf(selEl); if (el) { el.locked = t.checked; session.touch(); } }
      });
      /* 掴んで動かす・端をつまんで大きさを変える */
      api.root.addEventListener("mousedown", startDrag);
      api.root.addEventListener("touchstart", startDrag, { passive: false });
      api.root.addEventListener("keydown", function (e) {
        if (!selEl || editingEl) return;
        var tag = String((e.target.tagName || "")).toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
        var el = elOf(selEl);
        if (!el) return;
        /* Enter か F2 で、その場で文字を打てるようにする。 */
        if ((e.key === "Enter" || e.key === "F2") && canEditText(el)) {
          e.preventDefault(); enterEdit(el.id); return;
        }
        var d = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowUp") { e.preventDefault(); el.y -= d; }
        else if (e.key === "ArrowDown") { e.preventDefault(); el.y += d; }
        else if (e.key === "ArrowLeft") { e.preventDefault(); el.x -= d; }
        else if (e.key === "ArrowRight") { e.preventDefault(); el.x += d; }
        else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(); return; }
        else return;
        session.touch();
        var node = canvasEl(el.id);
        if (node) { node.style.left = el.x + "px"; node.style.top = el.y + "px"; }
        syncNumbers(el);
        refreshThumbs();
      });
    }

    /* ── 右クリックのメニュー ─────────────────────────────────── */
    function elementContextMenu(x, y) {
      var e = elOf(selEl);
      if (!e) return;
      var d = REG.get(e.type);
      var items = [];
      if (canEditText(e))
        items.push({ label: "文字を編集", icon: "type", hint: "ダブルクリック",
          run: function () { enterEdit(e.id); } });
      if (e.type === "image")
        items.push({ label: "画像を選び直す", icon: "image", run: pickImage });
      if (e.type === "chart")
        items.push({ label: "グラフの内容を編集", icon: "chart", run: editChart });
      if (e.type === "table")
        items.push({ label: "行を追加", icon: "rows", run: function () { tableOp("row+"); } },
          { label: "列を追加", icon: "cols", run: function () { tableOp("col+"); } });
      items.push(
        { label: "色を変える", icon: "palette", run: function () { elColor(null); } },
        { label: "アニメーション", icon: "play", on: !!e.anim, run: animSheet },
        { sep: true },
        { label: "最前面へ", icon: "layers", run: function () { elOp("front"); } },
        { label: "最背面へ", icon: "layers", run: function () { elOp("back"); } },
        { label: "左右の中央へ", icon: "alignC", run: function () { elOp("center-h"); } },
        { label: "上下の中央へ", icon: "alignC", run: function () {
          shell.pushUndo("配置"); e.y = Math.round((base().h - e.h) / 2);
          session.touch(); redrawEl(e.id); refreshThumbs(); } },
        { sep: true },
        { label: "複製する", icon: "copy", hint: "Ctrl+D", run: function () { elOp("dup"); } },
        { label: e.locked ? "動かせるようにする" : "動かせないようにする", icon: "lock",
          run: function () { e.locked = !e.locked; session.touch(); paint(); } },
        { label: "削除する", icon: "trash", danger: true, run: removeEl }
      );
      U.contextMenu(api.root, x, y, items, { title: (d ? d.label : "要素") + "の操作" });
    }
    function canvasContextMenu(x, y) {
      var b = base();
      /* 押した場所へ置けるように、キャンバス上の座標を出しておく。 */
      var cv = api.root.querySelector('[data-role="canvas"]');
      var pos = null;
      if (cv) {
        var r = cv.getBoundingClientRect();
        pos = { x: Math.round((x - r.left) / scale), y: Math.round((y - r.top) / scale) };
      }
      function addAt(type, extra) {
        addEl(type, extra);
        if (pos && selEl) {
          var e = elOf(selEl);
          if (e) {
            e.x = Math.max(0, Math.min(b.w - e.w, pos.x - Math.round(e.w / 2)));
            e.y = Math.max(0, Math.min(b.h - e.h, pos.y - Math.round(e.h / 2)));
            session.touch();
            redrawEl(e.id);
            refreshThumbs();
          }
        }
      }
      var items = [
        { label: "ここにテキストを置く", icon: "text", run: function () { addAt("text"); } },
        { label: "ここに画像を置く", icon: "image", run: function () { addAt("image"); pickImage(); } },
        { label: "ここに図形を置く", icon: "shapes", run: function () { addAt("shape", { shape: "rect" }); } },
        { label: "ここにグラフを置く", icon: "chart", run: function () { addAt("chart"); } },
        { label: "ここに表を置く", icon: "table", run: function () { addAt("table"); } },
        { sep: true },
        { label: "レイアウトを選ぶ", icon: "layout", run: layoutMenu },
        { label: "デザイン（テーマ・背景）", icon: "palette", run: designSheet },
        { sep: true },
        { label: "新しいスライドを足す", icon: "plus", run: function () { addSlide(); } },
        { label: "このスライドを複製", icon: "copy", run: dupSlide },
        { label: "発表を始める", icon: "play", run: present }
      ];
      U.contextMenu(api.root, x, y, items, { title: "スライドの操作" });
    }
    function slideContextMenu(x, y) {
      var items = [
        { label: "新しいスライドを足す", icon: "plus", run: function () { addSlide(); } },
        { label: "このスライドを複製", icon: "copy", run: dupSlide },
        { label: "レイアウトを選ぶ", icon: "layout", run: layoutMenu },
        { sep: true },
        { label: "前へ移動", icon: "chevronU", run: function () { moveSlide(-1); } },
        { label: "後ろへ移動", icon: "chevronD", run: function () { moveSlide(1); } },
        { label: slide().hidden ? "発表で表示する" : "発表のとき飛ばす", icon: "eye",
          run: function () { slide().hidden = !slide().hidden; session.touch(); paint(); } },
        { sep: true },
        { label: "ここから発表", icon: "play", run: present },
        { label: "このスライドを削除", icon: "trash", danger: true, run: delSlide }
      ];
      U.contextMenu(api.root, x, y, items, { title: (cur + 1) + " 枚目の操作" });
    }
    function dupSlide() {
      shell.pushUndo("スライドの複製");
      var c = JSON.parse(JSON.stringify(slide()));
      c.id = M.uid("sl");
      c.elements.forEach(function (e) { e.id = M.uid("e"); });
      body.slides.splice(cur + 1, 0, c);
      cur++;
      selEl = null;
      session.touch();
      paint();
    }
    function delSlide() {
      if (body.slides.length < 2) { api.toast("最後の 1 枚は消せません。", "warn"); return; }
      shell.pushUndo("スライドの削除");
      body.slides.splice(cur, 1);
      cur = Math.max(0, cur - 1);
      selEl = null;
      session.touch();
      paint();
    }
    function repaintCanvas() {
      var stage = api.root.querySelector('[data-role="stage"]');
      if (!stage) { paint(); return; }
      stage.innerHTML = canvas();
      fitCanvas();
      var th = api.root.querySelector(".wpp-thumbs");
      if (th) th.outerHTML = thumbs();
    }
    /* 掴んで動かす・端をつまんで大きさを変える。
       ── ここは 1 度作り直している ─────────────────────────────
       前は「選ばれていない要素を掴んだら paint() して選び直す」ようにしていた。
       paint() は画面をまるごと作り直すので、掴んだ要素そのものが消えてしまい、
       **選んでいない要素は 1 回目のドラッグで動かなかった**（実測）。
       いまは描き直さず、印だけ付け替えてそのまま掴み続ける。 */
    function startDrag(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;      /* 右クリックでは掴まない */
      var handleEl = ev.target.closest ? ev.target.closest("[data-h]") : null;
      var elBox = ev.target.closest ? ev.target.closest("[data-el]") : null;
      var onCanvas = ev.target.closest ? ev.target.closest('[data-role="canvas"]') : null;
      if (!onCanvas) return;
      /* 文字を打っている最中は掴まない（カーソルが置けなくなる）。 */
      if (editingEl && elBox && elBox.getAttribute("data-el") === editingEl && !handleEl) return;
      if (!elBox && !handleEl) { if (editingEl) exitEdit(); return; }
      var el = elOf(handleEl ? selEl : elBox.getAttribute("data-el"));
      if (!el || el.locked) return;
      if (editingEl && editingEl !== el.id) exitEdit();
      /* 選び直しは印の付け替えだけ。**描き直さない**。 */
      if (!handleEl && el.id !== selEl) { selEl = el.id; markSelected(el.id); }
      ev.preventDefault();
      var pt = point(ev);
      var start = { x: el.x, y: el.y, w: el.w, h: el.h, px: pt.x, py: pt.y };
      var mode = handleEl ? handleEl.getAttribute("data-h") : "move";
      var moved = false;
      var b = base();
      var node = canvasEl(el.id);
      var readout = showReadout();

      function move(e2) {
        var p = point(e2);
        var dx = (p.x - start.px) / scale, dy = (p.y - start.py) / scale;
        if (!moved && Math.abs(p.x - start.px) < 3 && Math.abs(p.y - start.py) < 3) return;
        if (!moved) { moved = true; dragging = true; shell.pushUndo("要素の移動"); }
        if (e2.preventDefault) e2.preventDefault();
        if (mode === "move") {
          el.x = Math.round(start.x + dx);
          el.y = Math.round(start.y + dy);
          /* Shift を押しているあいだは縦横をまっすぐに。 */
          if (e2.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) el.y = start.y; else el.x = start.x;
          }
          /* 中央・端に近づいたら吸い付く（8px 以内）。 */
          if (!e2.altKey) {
            var cx = Math.round((b.w - el.w) / 2), cy = Math.round((b.h - el.h) / 2);
            if (Math.abs(el.x - cx) < 8) el.x = cx;
            if (Math.abs(el.y - cy) < 8) el.y = cy;
            if (Math.abs(el.x) < 8) el.x = 0;
            if (Math.abs(el.y) < 8) el.y = 0;
            if (Math.abs(el.x + el.w - b.w) < 8) el.x = b.w - el.w;
            if (Math.abs(el.y + el.h - b.h) < 8) el.y = b.h - el.h;
          }
        } else {
          if (mode === "se" || mode === "ne") el.w = Math.max(24, Math.round(start.w + dx));
          if (mode === "sw" || mode === "nw") {
            el.w = Math.max(24, Math.round(start.w - dx));
            el.x = Math.round(start.x + (start.w - el.w));
          }
          if (mode === "se" || mode === "sw") el.h = Math.max(20, Math.round(start.h + dy));
          if (mode === "ne" || mode === "nw") {
            el.h = Math.max(20, Math.round(start.h - dy));
            el.y = Math.round(start.y + (start.h - el.h));
          }
        }
        if (node) {
          node.style.left = el.x + "px"; node.style.top = el.y + "px";
          node.style.width = el.w + "px"; node.style.height = el.h + "px";
        }
        readout.set(el);
        /* 右のパネルの数値も、動かしているそばから合わせる。 */
        syncNumbers(el);
      }
      function end() {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", end);
        doc.removeEventListener("touchmove", move);
        doc.removeEventListener("touchend", end);
        readout.hide();
        dragging = false;
        if (moved) {
          session.touch();
          refreshThumbs();
          refreshRight();
        }
      }
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", end);
      doc.addEventListener("touchmove", move, { passive: false });
      doc.addEventListener("touchend", end);
    }
    function startSlideColResize(ev) {
      var grip = ev.target.closest ? ev.target.closest(".wpp-colgrip") : null;
      if (!grip) return;
      ev.preventDefault();
      ev.stopPropagation();
      var table = grip.closest("[data-tbl]");
      var el = elOf(table.getAttribute("data-tbl"));
      if (!el || !el.rows) return;
      var ci = Number(grip.getAttribute("data-grip"));
      var cols = table.querySelectorAll("col");
      var total = table.getBoundingClientRect().width || 1;
      var startX = ev.clientX;
      var w0 = cols[ci] ? cols[ci].getBoundingClientRect().width : total / cols.length;
      var w1 = cols[ci + 1] ? cols[ci + 1].getBoundingClientRect().width : total / cols.length;
      shell.pushUndo("列幅の変更");
      function move(e2) {
        var d = (e2.clientX - startX) / scale;
        var a = Math.max(24, w0 / scale + d), bb = Math.max(24, w1 / scale - d);
        var t = total / scale;
        if (cols[ci]) cols[ci].style.width = ((a / t) * 100).toFixed(2) + "%";
        if (cols[ci + 1]) cols[ci + 1].style.width = ((bb / t) * 100).toFixed(2) + "%";
        e2.preventDefault();
      }
      function end() {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", end);
        el.colW = Array.prototype.map.call(table.querySelectorAll("col"), function (c) {
          return Math.round((parseFloat(c.style.width) || (100 / cols.length)) * 100) / 100;
        });
        session.touch();
        refreshThumbs();
      }
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", end);
    }

    /* 動かしているあいだ、位置と大きさをその場に出す。 */
    function showReadout() {
      var el = api.root.querySelector('[data-role="readout"]');
      if (!el) {
        el = doc.createElement("div");
        el.className = "wpp-readout";
        el.setAttribute("data-role", "readout");
        var stage = api.root.querySelector('[data-role="stage"]');
        if (stage) stage.appendChild(el);
      }
      el.hidden = false;
      return {
        set: function (e) {
          el.textContent = "X " + Math.round(e.x) + " / Y " + Math.round(e.y)
            + "　　" + Math.round(e.w) + " × " + Math.round(e.h);
        },
        hide: function () { el.hidden = true; }
      };
    }
    function syncNumbers(e) {
      var map = { "el-x": e.x, "el-y": e.y, "el-w": e.w, "el-h": e.h };
      Object.keys(map).forEach(function (k) {
        var n = api.root.querySelector('[data-act="' + k + '"]');
        if (n && doc.activeElement !== n) n.value = Math.round(map[k]);
      });
    }
    function point(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function handle(act, val, t) {
      if (act === "go") { cur = Number(t.getAttribute("data-i")); selEl = null; paint(); return true; }
      if (act === "slide+") { addSlide(); return true; }
      if (act === "add") { addEl(val); return true; }
      if (act === "shape-menu") { shapeMenu(); return true; }
      if (act === "layout-menu") { layoutMenu(); return true; }
      if (act === "design") { designSheet(); return true; }
      if (act === "present") { present(); return true; }
      if (act === "notes") { showNotes = !showNotes; paint(); return true; }
      if (act === "more-tools") { moreTools(); return true; }
      if (act === "ai") { aiSlides(); return true; }
      if (act === "pick-el") { selEl = val || null; paint(); return true; }
      if (act === "pick-img") { pickImage(); return true; }
      if (act === "edit-chart") { editChart(); return true; }
      if (act === "edit-table") { if (selEl) enterEdit(selEl); return true; }
      if (act === "anim") { animSheet(); return true; }
      if (act === "el-font-menu") {
        var fe = elOf(selEl);
        if (!fe) return true;
        var fr = t.getBoundingClientRect();
        U.fontPicker(api.root, fr.left, fr.bottom + 6, {
          value: fe.font, allowTheme: true,
          hint: "この文字の書体を変えます。",
          onPick: function (id) {
            shell.pushUndo("書体");
            fe.font = id || "";
            session.touch();
            redrawEl(fe.id);
            refreshThumbs();
            refreshRight();
          }
        });
        return true;
      }
      if (act === "el") { elOp(val); return true; }
      if (act === "el-color") { elColor(t); return true; }
      if (act === "sl-bg") { slide().background = val; session.touch(); paint(); return true; }
      if (act === "tbl") { tableOp(val); return true; }
      if (act === "thumbs-sheet") {
        U.sheet(api.root, { title: "スライド一覧", html: thumbs(),
          onOpen: function (bodyEl, close) {
            bodyEl.addEventListener("click", function (e) {
              var g = e.target.closest ? e.target.closest('[data-act="go"]') : null;
              if (g) { close(); cur = Number(g.getAttribute("data-i")); selEl = null; paint(); }
            });
          } });
        return true;
      }
      return false;
    }
    function addSlide(layout) {
      shell.pushUndo("スライドの追加");
      var s = M.newSlide(layout || "title_body");
      s.elements = layoutElements(s.layout);
      body.slides.splice(cur + 1, 0, s);
      cur = cur + 1;
      selEl = null;
      session.touch();
      paint();
    }
    function applyLayout(id) {
      shell.pushUndo("レイアウトの変更");
      var s = slide();
      s.layout = id;
      /* いまの文字は捨てない。枠だけを足りないぶん補う。 */
      var want = layoutElements(id);
      var texts = s.elements.filter(function (e) { return e.type === "text"; });
      want.forEach(function (w, i) {
        if (w.type === "text" && texts[i]) { w.text = texts[i].text; }
      });
      var keep = s.elements.filter(function (e) { return e.type !== "text"; });
      s.elements = want.concat(keep);
      session.touch();
      selEl = null;
      paint();
    }
    function layoutElements(id) {
      var b = base();
      function T(x, y, w, h, text, o) {
        return Object.assign({ id: M.uid("e"), type: "text", x: x, y: y, w: w, h: h, text: text || "",
          size: 20, align: "left", lh: 1.5, z: 1 }, o || {});
      }
      switch (id) {
        case "title":
          return [T(80, b.h / 2 - 70, b.w - 160, 90, "タイトル", { size: 46, bold: true, align: "center" }),
            T(80, b.h / 2 + 30, b.w - 160, 40, "サブタイトル", { size: 20, align: "center" })];
        case "section":
          return [T(80, b.h / 2 - 40, b.w - 160, 80, "セクション", { size: 38, bold: true, align: "center" })];
        case "title_body":
          return [T(70, 60, b.w - 140, 50, "見出し", { size: 32, bold: true }),
            T(70, 140, b.w - 140, b.h - 200, "", { size: 20 })];
        case "two_col":
          return [T(70, 55, b.w - 140, 46, "見出し", { size: 30, bold: true }),
            T(70, 130, (b.w - 180) / 2, b.h - 190, "", { size: 18 }),
            T(b.w / 2 + 20, 130, (b.w - 180) / 2, b.h - 190, "", { size: 18 })];
        case "three_col":
          var cw = (b.w - 200) / 3;
          return [T(70, 55, b.w - 140, 46, "見出し", { size: 30, bold: true }),
            T(70, 130, cw, b.h - 190, "", { size: 17 }),
            T(70 + cw + 30, 130, cw, b.h - 190, "", { size: 17 }),
            T(70 + (cw + 30) * 2, 130, cw, b.h - 190, "", { size: 17 })];
        case "image_text":
          return [T(70, 50, b.w - 140, 44, "見出し", { size: 28, bold: true }),
            { id: M.uid("e"), type: "image", x: 70, y: 118, w: (b.w - 180) / 2, h: b.h - 180, src: "", z: 1 },
            T(b.w / 2 + 20, 118, (b.w - 180) / 2, b.h - 180, "", { size: 18 })];
        case "big_image":
          return [{ id: M.uid("e"), type: "image", x: 0, y: 0, w: b.w, h: b.h, src: "", fit: "cover", z: 1 }];
        case "compare":
          return [T(70, 50, b.w - 140, 44, "比較", { size: 28, bold: true }),
            T(70, 116, (b.w - 180) / 2, 44, "A", { size: 22, bold: true, align: "center" }),
            T(b.w / 2 + 20, 116, (b.w - 180) / 2, 44, "B", { size: 22, bold: true, align: "center" }),
            T(70, 170, (b.w - 180) / 2, b.h - 230, "", { size: 17 }),
            T(b.w / 2 + 20, 170, (b.w - 180) / 2, b.h - 230, "", { size: 17 })];
        case "quote":
          return [T(110, b.h / 2 - 70, b.w - 220, 110, "「引用文をここへ」", { size: 30, italic: true, align: "center" }),
            T(110, b.h / 2 + 55, b.w - 220, 36, "— 出典", { size: 17, align: "center" })];
        case "number":
          return [{ id: M.uid("e"), type: "number", x: 80, y: b.h / 2 - 110, w: b.w - 160, h: 220,
            text: "0", label: "指標の名前", size: 96, z: 1 }];
        case "chart":
          return [T(70, 45, b.w - 140, 42, "グラフ", { size: 28, bold: true }),
            { id: M.uid("e"), type: "chart", x: 90, y: 105, w: b.w - 180, h: b.h - 165, z: 1,
              chart: { type: "bar", labels: ["A", "B", "C"], series: [{ name: "値", values: [3, 5, 2] }] } }];
        case "timeline":
          var out = [T(70, 50, b.w - 140, 44, "時系列", { size: 28, bold: true }),
            { id: M.uid("e"), type: "line", x: 80, y: b.h / 2, w: b.w - 160, h: 10, z: 1 }];
          for (var i = 0; i < 4; i++) {
            out.push({ id: M.uid("e"), type: "shape", shape: "circle", x: 100 + i * ((b.w - 220) / 3) - 9,
              y: b.h / 2 - 4, w: 18, h: 18, z: 2 });
            out.push(T(60 + i * ((b.w - 220) / 3), b.h / 2 + 30, 160, 60, "できごと", { size: 15, align: "center" }));
          }
          return out;
        case "process":
          var o2 = [T(70, 50, b.w - 140, 44, "手順", { size: 28, bold: true })];
          for (var k = 0; k < 3; k++) {
            o2.push({ id: M.uid("e"), type: "shape", x: 90 + k * ((b.w - 220) / 3), y: b.h / 2 - 60,
              w: (b.w - 300) / 3, h: 120, fill: "#e2e8f0", z: 1 });
            o2.push(T(90 + k * ((b.w - 220) / 3), b.h / 2 - 20, (b.w - 300) / 3, 44,
              (k + 1) + ". 手順", { size: 18, align: "center", z: 2 }));
            if (k < 2) o2.push({ id: M.uid("e"), type: "arrow", x: 90 + (k + 1) * ((b.w - 220) / 3) - 46,
              y: b.h / 2 - 10, w: 44, h: 20, z: 1 });
          }
          return o2;
        case "team":
          var o3 = [T(70, 50, b.w - 140, 44, "メンバー", { size: 28, bold: true })];
          for (var m = 0; m < 3; m++) {
            o3.push({ id: M.uid("e"), type: "shape", shape: "circle", x: 140 + m * 240, y: 150, w: 110, h: 110, z: 1 });
            o3.push(T(110 + m * 240, 280, 170, 60, "名前\n役割", { size: 16, align: "center" }));
          }
          return o3;
        case "qa":
          return [T(80, 120, b.w - 160, 70, "Q. 質問", { size: 30, bold: true }),
            T(80, 230, b.w - 160, b.h - 300, "A. 答え", { size: 22 })];
        case "summary":
          return [T(70, 55, b.w - 140, 46, "まとめ", { size: 32, bold: true }),
            T(70, 140, b.w - 140, b.h - 200, "・\n・\n・", { size: 22, lh: 1.8 })];
        default:
          return [];
      }
    }
    function layoutMenu() {
      U.sheet(api.root, {
        title: "レイアウト",
        html: '<div class="wp-lab">いまのスライドに当てはめます。書いた文字は残ります。</div>'
          + '<div class="wp-tpl">' + LAYOUTS.map(function (l) {
            return '<button type="button" class="wp-tpl__c" data-l="' + l.id + '">'
              + '<div class="wp-tpl__b" style="background:var(--vq-surface-sunken);display:grid;place-items:center">'
              + icon("layout") + "</div><div class=\"wp-tpl__t\">" + esc(l.label) + "</div></button>";
          }).join("") + "</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-l]") : null;
            if (!b) return;
            close();
            applyLayout(b.getAttribute("data-l"));
          });
        }
      });
    }
    function shapeMenu() {
      var shapes = [{ id: "rect", label: "四角" }, { id: "circle", label: "丸" },
        { id: "triangle", label: "三角" }, { id: "__line", label: "線" }, { id: "__arrow", label: "矢印" }];
      U.sheet(api.root, {
        title: "図形",
        html: shapes.map(function (s) {
          return '<button type="button" class="wp-cmd__i" data-s="' + s.id + '">'
            + icon("shapes") + "<span>" + esc(s.label) + "</span></button>";
        }).join(""),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-s]") : null;
            if (!b) return;
            close();
            var v = b.getAttribute("data-s");
            if (v === "__line") addEl("line");
            else if (v === "__arrow") addEl("arrow");
            else addEl("shape", { shape: v });
          });
        }
      });
    }
    function addEl(type, extra) {
      if (!REG.has(type)) return;
      shell.pushUndo("要素の追加");
      var b = base();
      var e = Object.assign({ id: M.uid("e"), type: type, x: b.w / 2 - 150, y: b.h / 2 - 60,
        w: 300, h: 120, z: (slide().elements.length + 1) }, extra || {});
      if (type === "text") { e.text = "テキスト"; e.size = 22; e.lh = 1.5; e.align = "left"; }
      if (type === "number") { e.text = "0"; e.label = "説明"; e.size = 84; e.h = 200; }
      if (type === "line") { e.h = 10; e.w = 400; }
      if (type === "arrow") { e.h = 24; e.w = 200; }
      if (type === "shape") { e.w = 200; e.h = 200; }
      if (type === "table") { e.rows = [["項目", "値"], ["", ""], ["", ""]]; e.w = 420; e.h = 160; }
      if (type === "chart") {
        e.w = 520; e.h = 300;
        e.chart = { type: "bar", labels: ["A", "B", "C"], series: [{ name: "値", values: [3, 5, 2] }] };
      }
      slide().elements.push(e);
      selEl = e.id;
      session.touch();
      paint();
    }
    function removeEl() {
      var s = slide();
      var i = -1;
      s.elements.forEach(function (e, k) { if (e.id === selEl) i = k; });
      if (i < 0) return;
      shell.pushUndo("要素の削除");
      s.elements.splice(i, 1);
      selEl = null;
      session.touch();
      paint();
    }
    function elOp(op) {
      var e = elOf(selEl);
      if (!e) return;
      shell.pushUndo("要素の変更");
      var b = base(), s = slide();
      if (op === "bold") e.bold = !e.bold;
      else if (op === "italic") e.italic = !e.italic;
      else if (op === "underline") e.underline = !e.underline;
      else if (op === "size+") e.size = Math.min(140, (e.size || 20) + 4);
      else if (op === "size-") e.size = Math.max(8, (e.size || 20) - 4);
      else if (op === "left" || op === "center" || op === "right") e.align = op;
      else if (op === "fit-contain") e.fit = "contain";
      else if (op === "fit-cover") e.fit = "cover";
      else if (op === "front") e.z = Math.max.apply(null, s.elements.map(function (x) { return x.z || 1; })) + 1;
      else if (op === "back") e.z = Math.min.apply(null, s.elements.map(function (x) { return x.z || 1; })) - 1;
      else if (op === "center-h") e.x = Math.round((b.w - e.w) / 2);
      else if (op === "dup") {
        var c = JSON.parse(JSON.stringify(e));
        c.id = M.uid("e"); c.x += 20; c.y += 20;
        s.elements.push(c);
        selEl = c.id;
      } else if (op === "del") { removeEl(); return; }
      session.touch();
      paint();
    }
    function elColor(anchor) {
      var e = elOf(selEl);
      if (!e) return;
      var isText = e.type === "text" || e.type === "number";
      var pos = { x: 200, y: 160 };
      if (anchor && anchor.getBoundingClientRect) {
        var r = anchor.getBoundingClientRect();
        pos = { x: r.left, y: r.bottom + 6 };
      }
      U.colorPicker(api.root, pos.x, pos.y, {
        title: isText ? "文字の色" : "色",
        value: isText ? e.color : e.fill,
        allowNone: true,
        noneLabel: "テーマの色に戻す",
        onPick: function (c) {
          shell.pushUndo("色");
          if (isText) { e.color = c || ""; e.colorLocked = !!c; }
          else { e.fill = c || ""; e.colorLocked = !!c; }
          session.touch();
          redrawEl(e.id);
          refreshThumbs();
        }
      });
    }
    function tableOp(op) {
      var e = elOf(selEl);
      if (!e || !e.rows) return;
      shell.pushUndo("表の変更");
      if (op === "row+") e.rows.push(e.rows[0].map(function () { return ""; }));
      if (op === "col+") e.rows.forEach(function (r) { r.push(""); });
      session.touch();
      paint();
    }
    function pickImage() {
      var e = elOf(selEl);
      var inp = doc.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) { api.toast("画像が大きすぎます（3MB まで）。", "error", 6000); return; }
        var fr = new root.FileReader();
        fr.onload = function () {
          shell.pushUndo("画像");
          if (e && e.type === "image") { e.src = fr.result; e.alt = e.alt || f.name; }
          else addEl("image", { src: fr.result, alt: f.name, w: 420, h: 280 });
          session.touch();
          paint();
        };
        fr.readAsDataURL(f);
      });
      inp.click();
    }
    function editChart() {
      var e = elOf(selEl);
      if (!e || e.type !== "chart") return;
      var c = e.chart || { type: "bar", labels: [], series: [] };
      var text = c.labels.map(function (l, i) {
        return l + "," + c.series.map(function (s) { return s.values[i]; }).join(",");
      }).join("\n");
      U.sheet(api.root, {
        title: "グラフの内容",
        html: '<div class="wp-row"><label class="wp-lab" for="ct">データ（1 行 1 項目。「名前,値」）</label>'
          + '<textarea class="wp-ta" id="ct" style="min-height:130px;font:var(--vq-type-code)">'
          + esc(text) + "</textarea></div>"
          + '<div class="wp-lab">種類</div><div class="wp-inline" style="flex-wrap:wrap">'
          + CH.TYPES.map(function (t) {
            return btn({ label: t.label, act: "t", val: t.id, on: c.type === t.id });
          }).join("") + "</div>"
          + btn({ label: "反映する", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          var type = c.type;
          bodyEl.addEventListener("click", function (ev) {
            var t = ev.target.closest ? ev.target.closest('[data-act="t"]') : null;
            if (t) {
              type = t.getAttribute("data-val");
              Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-act="t"]'), function (b) {
                b.classList.toggle("is-on", b.getAttribute("data-val") === type);
              });
              return;
            }
            if (!ev.target.closest || !ev.target.closest('[data-act="ok"]')) return;
            var lines = bodyEl.querySelector("#ct").value.split("\n")
              .map(function (l) { return l.trim(); }).filter(Boolean);
            var labels = [], series = [];
            lines.forEach(function (l) {
              var parts = l.split(",");
              labels.push(parts[0]);
              parts.slice(1).forEach(function (v, i) {
                if (!series[i]) series[i] = { name: "系列" + (i + 1), values: [] };
                series[i].values.push(Number(v) || 0);
              });
            });
            if (!series.length) series = [{ name: "値", values: labels.map(function () { return 0; }) }];
            shell.pushUndo("グラフ");
            e.chart = { type: type, title: c.title || "", labels: labels, series: series };
            session.touch();
            close();
            paint();
          });
        }
      });
    }
    /* テーマの見本。実物と同じ飾り・書体・差し色で描く（当ててみないと分からない、をなくす）。 */
    function themeCardHtml(k) {
      var t = THEMES[k];
      return '<button type="button" class="wp-thc' + (body.theme === k ? " is-on" : "")
        + '" data-th="' + k + '" aria-pressed="' + (body.theme === k ? "true" : "false") + '">'
        + '<div class="wp-thc__p" style="background:' + t.bg + '">'
        + '<svg viewBox="0 0 960 540" preserveAspectRatio="none" aria-hidden="true">'
        + decorSvg(t, 960, 540) + "</svg>"
        + '<div class="wp-thc__t" style="color:' + t.fg + ";font-family:" + U.fontCss(t.titleFont) + '">Aa 見出し</div>'
        + '<div class="wp-thc__s" style="color:' + t.sub + ";font-family:" + U.fontCss(t.bodyFont) + '">本文のサンプル</div>'
        + '<div class="wp-thc__a" style="background:' + t.accent + '"></div>'
        + "</div><div class=\"wp-thc__n\">" + esc(t.name) + "</div></button>";
    }
    function designSheet() {
      var groups = {};
      Object.keys(THEMES).forEach(function (k) {
        var g = THEMES[k].group || "その他";
        (groups[g] = groups[g] || []).push(k);
      });
      var h = "";
      Object.keys(groups).forEach(function (g) {
        h += '<div class="wp-lab" style="margin:12px 0 6px">' + esc(g) + "</div>"
          + '<div class="wp-thgrid">' + groups[g].map(themeCardHtml).join("") + "</div>";
      });
      h += '<div class="wp-row" style="margin-top:16px"><label class="wp-lab" for="ra">スライドの比率</label>'
        + '<select class="wp-sel" id="ra" data-act="ratio">'
        + '<option value="16:9"' + (body.ratio === "16:9" ? " selected" : "") + ">16:9（横長）</option>"
        + '<option value="4:3"' + (body.ratio === "4:3" ? " selected" : "") + ">4:3</option></select></div>"
        + '<div class="wp-row"><label class="wp-lab" for="tr">全スライドの切り替え</label>'
        + '<select class="wp-sel" id="tr" data-act="alltr">'
        + TRANSITIONS.map(function (t) {
          return '<option value="' + t.id + '"' + (body.transition.type === t.id ? " selected" : "")
            + ">" + esc(t.label) + "</option>";
        }).join("") + "</select></div>"
        + '<div class="wp-row"><label class="wp-lab" for="sp">切り替えの速さ（ミリ秒）</label>'
        + '<input class="wp-in" id="sp" type="number" min="120" max="1500" step="20" value="'
        + (body.transition.speed || 300) + '" data-act="trspeed" /></div>'
        + '<div class="wp-row"><div class="wp-lab">背景の色を自分で決める（このスライドだけ）</div>'
        + '<div class="wp-inline">'
        + btn({ label: "色を選ぶ", icon: "palette", act: "sl-bg-pick", variant: "outline" })
        + btn({ label: "テーマに戻す", act: "sl-bg-clear", variant: "outline" }) + "</div></div>";
      U.sheet(api.root, {
        title: "デザイン",
        html: h,
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-th]") : null;
            if (b) {
              shell.pushUndo("テーマ");
              body.theme = b.getAttribute("data-th");
              applyThemeToText();
              session.touch(); close(); paint();
              api.toast("テーマ「" + THEMES[body.theme].name + "」にしました", "ok");
              return;
            }
            if (e.target.closest && e.target.closest('[data-act="sl-bg-pick"]')) {
              var r = e.target.getBoundingClientRect();
              U.colorPicker(api.root, r.left, r.bottom + 6, {
                title: "背景の色", value: slide().background,
                onPick: function (c) {
                  shell.pushUndo("背景色");
                  slide().background = c || "";
                  session.touch(); close(); paint();
                }
              });
              return;
            }
            if (e.target.closest && e.target.closest('[data-act="sl-bg-clear"]')) {
              shell.pushUndo("背景色");
              slide().background = "";
              session.touch(); close(); paint();
            }
          });
          bodyEl.addEventListener("change", function (e) {
            var t = e.target.closest ? e.target.closest("[data-act]") : null;
            if (!t) return;
            var a = t.getAttribute("data-act");
            if (a === "ratio") { body.ratio = t.value; session.touch(); paint(); }
            else if (a === "trspeed") {
              body.transition.speed = Math.max(120, Math.min(1500, Number(t.value) || 300));
              session.touch();
            } else if (a === "alltr") {
              body.transition.type = t.value;
              body.slides.forEach(function (s) { s.transition = t.value; });
              session.touch();
            }
          });
        }
      });
    }
    /* テーマを変えたら、色を指定していない文字はテーマの色に従わせる。
       自分で色を決めた文字はそのまま残す（勝手に塗り替えない）。 */
    function applyThemeToText() {
      var th = theme();
      body.slides.forEach(function (s) {
        s.elements.forEach(function (e) {
          if (e.type === "text" && e.themed !== false && !e.colorLocked) e.color = "";
          if (e.type === "number" && !e.colorLocked) e.color = "";
          if (e.type === "shape" && !e.colorLocked && !e.fill) e.fill = "";
        });
      });
      /* 書体もテーマのものへ（個別指定が無いもののみ）。 */
      body.slides.forEach(function (s) {
        s.elements.forEach(function (e) {
          if ((e.type === "text" || e.type === "number") && !e.font)
            e.themeFont = e.size >= 30 ? th.titleFont : th.bodyFont;
        });
      });
    }
    /* アニメーションの設定（要素ごと） */
    function animSheet() {
      var e = elOf(selEl);
      if (!e) { api.toast("先に要素を選んでください。", "warn"); return; }
      U.sheet(api.root, {
        title: "アニメーション",
        html: '<div class="wp-lab">この要素が出てくるときの動きです。発表のときに動きます。</div>'
          + '<div class="wp-row"><label class="wp-lab" for="an">動き</label>'
          + '<select class="wp-sel" id="an" data-act="anim">'
          + EL_ANIMS.map(function (a) {
            return '<option value="' + a.id + '"' + ((e.anim || "") === a.id ? " selected" : "")
              + ">" + esc(a.label) + "</option>";
          }).join("") + "</select></div>"
          + '<div class="wp-row"><label class="wp-lab" for="ao">出てくる順番（小さいほど先）</label>'
          + '<input class="wp-in" id="ao" type="number" min="0" max="20" value="'
          + (e.animOrder === undefined ? 0 : e.animOrder) + '" data-act="animorder" /></div>'
          + btn({ label: "この動きを試す", act: "animtry", variant: "outline", icon: "play", cls: "is-lg" })
          + '<div class="wp-lab" style="margin-top:12px">端末で「視差効果を減らす」を選んでいる場合、'
          + "動きは出ません（読みやすさを優先します）。</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("change", function (ev) {
            var t = ev.target.closest ? ev.target.closest("[data-act]") : null;
            if (!t) return;
            if (t.getAttribute("data-act") === "anim") e.anim = t.value;
            else e.animOrder = Math.max(0, Math.min(20, Number(t.value) || 0));
            session.touch();
          });
          bodyEl.addEventListener("click", function (ev) {
            if (!ev.target.closest || !ev.target.closest('[data-act="animtry"]')) return;
            var node = canvasEl(e.id);
            if (!node || !e.anim) { api.toast("動きを選ぶと試せます。", "info"); return; }
            node.classList.remove("wpp-anim");
            void node.offsetWidth;
            node.classList.add("wpp-anim", "wpp-anim-" + e.anim);
            root.setTimeout(function () {
              node.classList.remove("wpp-anim", "wpp-anim-" + e.anim);
            }, 1200);
          });
        }
      });
    }

    /* ── 発表（§15.9）─────────────────────────────────────────── */
    function present() {
      var list = body.slides.filter(function (s) { return !s.hidden; });
      if (!list.length) { api.toast("表示できるスライドがありません。", "warn"); return; }
      var i = Math.max(0, list.indexOf(slide()));
      var th = theme(), b = base();
      var box = doc.createElement("div");
      box.className = "wpp-present";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "発表");
      api.root.appendChild(box);
      var started = Date.now();
      var timer = root.setInterval(function () { var t = box.querySelector('[data-role="t"]');
        if (t) t.textContent = VQ2.ui.fmtClock(Date.now() - started); }, 1000);

      function draw(dir) {
        var s = list[i];
        var vw = root.innerWidth, vh = root.innerHeight;
        var sc = Math.min(vw / b.w, (vh - 52) / b.h);
        /* 画面の切り替え。スライドごとの指定が無ければ全体の設定を使う。 */
        var tr = s.transition || body.transition.type || "none";
        var anim = TRANSITIONS_ANIM[tr] || "";
        var speed = Math.max(120, Number(body.transition.speed) || 300);
        var reduced = VQ2.ui.reducedMotion();
        box.innerHTML = '<div class="wpp-present__c' + (anim && !reduced ? " " + anim : "")
          + (dir < 0 ? " is-back" : "") + '" style="width:' + b.w + "px;height:" + b.h
          + "px;background:" + esc(s.background || th.bg) + ";transform:scale(" + sc + ")"
          + (anim && !reduced ? ";animation-duration:" + speed + "ms" : "") + '">'
          + (!s.background && th.decor && th.decor !== "none"
            ? '<svg class="wpp-decor" viewBox="0 0 ' + b.w + " " + b.h + '" width="' + b.w + '" height="'
              + b.h + '" aria-hidden="true">' + decorSvg(th, b.w, b.h) + "</svg>" : "")
          + s.elements.map(function (e, k) {
            /* 要素ごとのアニメーション。順番は animOrder（無ければ並び順）。 */
            if (!e.anim || reduced) return elHtml(e, th, true);
            var order = e.animOrder === undefined ? k : Number(e.animOrder);
            return elHtml(e, th, true, { animClass: "wpp-anim wpp-anim-" + e.anim,
              animDelay: speed + order * 220 });
          }).join("") + "</div>"
          + '<div class="wpp-present__bar">'
          + btn({ icon: "back", iconOnly: true, label: "前へ", act: "prev" })
          + '<span>' + (i + 1) + " / " + list.length + "</span>"
          + btn({ icon: "chevronR", iconOnly: true, label: "次へ", act: "next" })
          + '<span data-role="t">0:00</span>'
          + '<span style="flex:1 1 auto;min-width:0;opacity:.85;font-size:13px;overflow:hidden;'
          + 'text-overflow:ellipsis;white-space:nowrap">' + esc(s.notes || "") + "</span>"
          + btn({ icon: "x", iconOnly: true, label: "終了", act: "exit" }) + "</div>";
      }
      function go(d) {
        var next = Math.max(0, Math.min(list.length - 1, i + d));
        if (next === i) return;
        i = next;
        draw(d);
      }
      function exit() {
        root.clearInterval(timer);
        doc.removeEventListener("keydown", onKey);
        root.removeEventListener("resize", draw);
        try { box.remove(); } catch (e) {}
        try { if (doc.fullscreenElement) doc.exitFullscreen(); } catch (e) {}
      }
      function onKey(e) {
        if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
        else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
        else if (e.key === "Escape") { e.preventDefault(); exit(); }
      }
      box.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (t) {
          var a = t.getAttribute("data-act");
          if (a === "prev") go(-1);
          else if (a === "next") go(1);
          else if (a === "exit") exit();
          return;
        }
        /* 画面を押したら次へ（スマホで使いやすい） */
        if (e.target.closest && e.target.closest(".wpp-present__bar")) return;
        go(1);
      });
      doc.addEventListener("keydown", onKey);
      root.addEventListener("resize", function () { draw(0); });
      draw(1);
      try { if (api.host.requestFullscreen) api.host.requestFullscreen(); } catch (e) {}
    }

    /* ── 書き出し（§15.12）────────────────────────────────────── */
    function slidesHtml(forPrint) {
      var th = theme(), b = base();
      var pages = body.slides.filter(function (s) { return !s.hidden; }).map(function (s) {
        return '<div class="pg" style="width:' + b.w + "px;height:" + b.h + "px;background:"
          + esc(s.background || th.bg) + '">'
          + s.elements.map(function (e) {
            var d = REG.get(e.type);
            if (!d) return "";
            return '<div style="position:absolute;left:' + e.x + "px;top:" + e.y + "px;width:" + e.w
              + "px;height:" + e.h + "px;z-index:" + (e.z || 1) + '">' + d.render(e, th) + "</div>";
          }).join("") + "</div>";
      }).join("");
      return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><title>" + esc(item.title)
        + "</title><style>@page{size:" + b.w + "px " + b.h + "px;margin:0}"
        + "body{margin:0;background:#333}"
        + ".pg{position:relative;overflow:hidden;margin:0 auto 12px;page-break-after:always}"
        + "@media print{body{background:#fff}.pg{margin:0}}</style></head><body>" + pages
        + (forPrint ? "<script>window.onload=function(){window.print()}<\/script>" : "")
        + "</body></html>";
    }
    function exportSheet() {
      var opts = [
        { id: "pdf", label: "PDF（印刷ダイアログから保存）" },
        { id: "html", label: "HTML（そのまま開ける）" },
        { id: "png", label: "現在のスライドを PNG で保存" },
        { id: "txt", label: "文字だけをテキストで" }
      ];
      U.sheet(api.root, {
        title: "書き出し",
        html: opts.map(function (x) {
          return '<button type="button" class="wp-cmd__i" data-f="' + x.id + '">'
            + icon("download") + "<span>" + esc(x.label) + "</span></button>";
        }).join("")
          + '<div class="wp-lab" style="margin-top:10px">PPTX への書き出しは未実装です。'
          + "PDF か HTML をお使いください。</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-f]") : null;
            if (!b) return;
            close();
            var f = b.getAttribute("data-f");
            var base2 = (item.title || "スライド").replace(/[\/\\:*?"<>|]/g, "_");
            if (f === "pdf" || f === "html") {
              var html = slidesHtml(f === "pdf");
              if (f === "html") dl(base2 + ".html", "text/html;charset=utf-8", html);
              else {
                var w = root.open("", "_blank");
                if (!w) { api.toast("別のタブを開けませんでした。", "error"); return; }
                w.document.write(html); w.document.close();
              }
            } else if (f === "png") exportPng(base2);
            else {
              var txt = body.slides.map(function (s, i) {
                return "── " + (i + 1) + " 枚目 ──\n"
                  + s.elements.filter(function (e2) { return e2.text; })
                    .map(function (e2) { return e2.text; }).join("\n")
                  + (s.notes ? "\n[ノート] " + s.notes : "");
              }).join("\n\n");
              dl(base2 + ".txt", "text/plain;charset=utf-8", txt);
            }
            api.toast("書き出しました", "ok");
          });
        }
      });
    }
    /* PNG は SVG 経由で描く（外部ライブラリを足さない）。
       文字と図形は出る。画像は data URL のものだけ出る。 */
    function exportPng(name) {
      var b = base(), th = theme(), s = slide();
      var inner = s.elements.map(function (e) {
        if (e.type === "text" || e.type === "number") {
          var lines = String(e.text || "").split("\n");
          var size = e.size || 20;
          var anchor = e.align === "center" ? "middle" : (e.align === "right" ? "end" : "start");
          var x = e.align === "center" ? e.x + e.w / 2 : (e.align === "right" ? e.x + e.w : e.x);
          return lines.map(function (l, i) {
            return '<text x="' + x + '" y="' + (e.y + size + i * size * (e.lh || 1.5)) + '" font-size="' + size
              + '" font-family="Hiragino Sans, sans-serif" font-weight="' + (e.bold ? 700 : 400)
              + '" fill="' + esc(e.color || th.fg) + '" text-anchor="' + anchor + '">'
              + esc(l) + "</text>";
          }).join("");
        }
        if (e.type === "shape") {
          if (e.shape === "circle")
            return '<ellipse cx="' + (e.x + e.w / 2) + '" cy="' + (e.y + e.h / 2) + '" rx="' + (e.w / 2)
              + '" ry="' + (e.h / 2) + '" fill="' + esc(e.fill || th.accent) + '"/>';
          return '<rect x="' + e.x + '" y="' + e.y + '" width="' + e.w + '" height="' + e.h
            + '" rx="' + (e.radius || 6) + '" fill="' + esc(e.fill || th.accent) + '"/>';
        }
        if (e.type === "line" || e.type === "arrow")
          return '<line x1="' + e.x + '" y1="' + (e.y + e.h / 2) + '" x2="' + (e.x + e.w) + '" y2="'
            + (e.y + e.h / 2) + '" stroke="' + esc(e.color || th.fg) + '" stroke-width="' + (e.weight || 3) + '"/>';
        if (e.type === "image" && e.src && /^data:/.test(e.src))
          return '<image href="' + esc(e.src) + '" x="' + e.x + '" y="' + e.y + '" width="' + e.w
            + '" height="' + e.h + '" preserveAspectRatio="xMidYMid slice"/>';
        return "";
      }).join("");
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + b.w + '" height="' + b.h + '">'
        + '<rect width="100%" height="100%" fill="' + esc(s.background || th.bg) + '"/>' + inner + "</svg>";
      var img = new root.Image();
      var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      img.onload = function () {
        var cv = doc.createElement("canvas");
        cv.width = b.w; cv.height = b.h;
        cv.getContext("2d").drawImage(img, 0, 0);
        try {
          cv.toBlob(function (blob) {
            var a = doc.createElement("a");
            a.href = root.URL.createObjectURL(blob);
            a.download = name + "_" + (cur + 1) + ".png";
            doc.body.appendChild(a); a.click();
            root.setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          });
        } catch (e) { api.toast("PNG を作れませんでした。PDF をお試しください。", "error", 6000); }
      };
      img.onerror = function () { api.toast("PNG を作れませんでした。PDF をお試しください。", "error", 6000); };
      img.src = url;
    }
    function dl(name, mime, text) {
      try {
        var blob = new root.Blob([text], { type: mime });
        var a = doc.createElement("a");
        a.href = root.URL.createObjectURL(blob);
        a.download = name;
        doc.body.appendChild(a); a.click();
        root.setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) {}
    }

    function moreTools() {
      var items = [
        { label: "発表を始める", icon: "play", run: present },
        { label: "スライドを複製", icon: "copy", run: dupSlide },
        { label: "スライドを削除", icon: "trash", run: delSlide },
        { label: "前へ移動", icon: "chevronD", run: function () { moveSlide(-1); } },
        { label: "後ろへ移動", icon: "chevronD", run: function () { moveSlide(1); } },
        { label: "デザイン（テーマ・比率）", icon: "palette", run: designSheet },
        { label: "書き出し", icon: "download", run: exportSheet }
      ];
      U.sheet(api.root, {
        title: "その他の機能",
        html: items.map(function (x, i) {
          return '<button type="button" class="wp-cmd__i" data-i="' + i + '">'
            + icon(x.icon) + "<span>" + esc(x.label) + "</span></button>";
        }).join(""),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-i]") : null;
            if (!b) return;
            close();
            items[Number(b.getAttribute("data-i"))].run();
          });
        }
      });
    }
    function moveSlide(d) {
      var j = cur + d;
      if (j < 0 || j >= body.slides.length) return;
      shell.pushUndo("並べ替え");
      var t = body.slides[cur];
      body.slides[cur] = body.slides[j];
      body.slides[j] = t;
      cur = j;
      session.touch();
      paint();
    }

    function aiSlides() {
      var text = body.slides.map(function (s, i) {
        return (i + 1) + ". " + s.elements.filter(function (e) { return e.text; })
          .map(function (e) { return e.text; }).join(" / ");
      }).join("\n");
      WP.ai.open({
        api: api, itemType: "presentation", item: item,
        scope: { kind: "deck", text: text, label: body.slides.length + " 枚のスライド" },
        onApply: function (out) {
          /* 「見出し」＋「・箇条書き」の形で返ってきたものをスライドにする。 */
          var made = parseOutline(out);
          if (!made.length) { api.toast("スライドとして読み取れませんでした。", "warn"); return; }
          api.confirm({ title: "スライドを足しますか",
            message: made.length + " 枚を、いまの後ろに足します。", okText: "足す" })
            .then(function (yes) {
              if (!yes) return;
              shell.pushUndo("AI でスライド追加");
              body.slides = body.slides.concat(made);
              cur = body.slides.length - made.length;
              session.touch(); paint();
            });
        },
        onNotes: function (out) {
          shell.pushUndo("発表者ノート");
          slide().notes = out;
          session.touch();
          showNotes = true;
          paint();
        }
      });
    }
    function parseOutline(text) {
      var out = [], cur2 = null;
      String(text).split(/\r?\n/).forEach(function (line) {
        var t = line.trim();
        if (!t) return;
        var m = /^#{1,3}\s*(.+)$/.exec(t) || /^(?:\d+[.)]\s*)(.+)$/.exec(t);
        if (m) {
          cur2 = { title: m[1], lines: [] };
          out.push(cur2);
          return;
        }
        if (!cur2) { cur2 = { title: t, lines: [] }; out.push(cur2); return; }
        cur2.lines.push(t.replace(/^[-・*]\s*/, ""));
      });
      var b = base();
      return out.map(function (o) {
        var s = M.newSlide("title_body");
        s.elements = [
          { id: M.uid("e"), type: "text", x: 70, y: 60, w: b.w - 140, h: 50, text: o.title,
            size: 32, bold: true, align: "left", lh: 1.4, z: 1 },
          { id: M.uid("e"), type: "text", x: 70, y: 140, w: b.w - 140, h: b.h - 200,
            text: o.lines.map(function (l) { return "・" + l; }).join("\n"),
            size: 20, align: "left", lh: 1.8, z: 1 }
        ];
        return s;
      });
    }

    function registerCommands() {
      var cmds = [
        { group: "スライド", label: "新しいスライド", icon: "plus", run: function () { addSlide(); } },
        { group: "スライド", label: "レイアウトを選ぶ", icon: "layout", run: layoutMenu },
        { group: "スライド", label: "発表を始める", icon: "play", run: present },
        { group: "デザイン", label: "テーマを変える", icon: "palette", run: designSheet }
      ];
      REG.all().forEach(function (d) {
        cmds.push({ group: "挿入", label: d.label + " を追加", icon: d.icon,
          run: function () { addEl(d.type); } });
      });
      cmds.push({ group: "書き出し", label: "PDF で出力", icon: "download",
        run: function () {
          var w = root.open("", "_blank");
          if (!w) { api.toast("別のタブを開けませんでした。", "error"); return; }
          w.document.write(slidesHtml(true)); w.document.close();
        } });
      cmds.push({ group: "書き出し", label: "現在のスライドを PNG で保存", icon: "download",
        run: function () { exportPng((item.title || "スライド")); } });
      WP.convert.targetsFor("presentation").forEach(function (t) {
        cmds.push({ group: "変換", label: t.label, icon: t.icon,
          run: function () {
            session.saveNow().then(function () { return WP.convert.run(t.id, item, session.content); })
              .then(function (r) { api.toast("「" + r.item.title + "」を作りました", "ok", 4000); })
              .catch(function (e) { api.toast("変換できませんでした: " + e.message, "error", 6000); });
          } });
      });
      shell.registerCommands(cmds);
    }

    return api;
  }

  WP.slides = { open: open, THEMES: THEMES, LAYOUTS: LAYOUTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
