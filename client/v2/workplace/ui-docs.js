/* ══════════════════════════════════════════════════════════════════════
   VocabuDocs（§13）

   ・textarea 1 枚では作らない。ブロックの並びとして持ち、保存もその形。
     見出し・リスト・表・画像・引用が、それぞれ独立して動く。
   ・ブロックの種類は Registry に登録する。ツールバーも「/」も、
     登録されているものだけを出す（在るのに動かないものを作らない）。
   ・打っている最中に描き直さない。文字はモデルへ写すだけにして、
     組み替え（種類変更・追加・削除）のときだけ描き直す。
     でないとカーソルが毎回先頭へ飛ぶ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, REG = WP.blockRegistry;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  /* ══ ブロックの登録（§9）══════════════════════════════════════════
     level: 1=シンプルでも出す / 2=標準 / 3=詳細のみ */
  function reg(type, label, iconName, level, render, o) {
    REG.register(Object.assign({
      type: type, label: label, icon: iconName, level: level, render: render,
      editor: true, mobileSupported: true, exportSupported: true, category: "基本"
    }, o || {}));
  }
  function ce(b, ph, cls) {
    return '<div class="wpd-b__c ' + (cls || "") + '" contenteditable="true" data-ph="' + esc(ph || "")
      + '" data-id="' + esc(b.id) + '" role="textbox" aria-multiline="true">' + (b.text || "") + "</div>";
  }
  reg("paragraph", "本文", "text", 1, function (b) { return ce(b, "文字を入力（「/」でメニュー）"); });
  reg("heading1", "見出し 1", "type", 1, function (b) { return ce(b, "見出し 1"); });
  reg("heading2", "見出し 2", "type", 1, function (b) { return ce(b, "見出し 2"); });
  reg("heading3", "見出し 3", "type", 2, function (b) { return ce(b, "見出し 3"); });
  reg("heading4", "見出し 4", "type", 3, function (b) { return ce(b, "見出し 4"); });
  reg("bullet", "箇条書き", "listUl", 1, function (b) {
    return '<div class="wpd-b__li"><span class="wpd-b__mk">•</span>' + ce(b, "項目") + "</div>";
  });
  reg("number", "番号付き", "listOl", 1, function (b, ctx) {
    return '<div class="wpd-b__li"><span class="wpd-b__mk">' + (ctx.num || 1) + ".</span>" + ce(b, "項目") + "</div>";
  });
  reg("todo", "チェックリスト", "check2", 1, function (b) {
    return '<div class="wpd-b__li"><input type="checkbox" class="wpd-b__ck" data-ck="' + esc(b.id) + '"'
      + (b.checked ? " checked" : "") + ' aria-label="完了" />'
      + ce(b, "やること", b.checked ? "is-done" : "") + "</div>";
  });
  reg("quote", "引用", "quote", 2, function (b) { return ce(b, "引用文"); });
  reg("code", "コード", "code", 2, function (b) { return ce(b, "コード"); });
  reg("callout", "囲み（注記）", "info", 2, function (b) {
    return '<div class="wpd-b__li"><span class="wpd-b__mk">' + icon("info") + "</span>" + ce(b, "伝えたいこと") + "</div>";
  });
  reg("divider", "区切り線", "minus", 2, function () { return "<hr />"; });
  reg("pagebreak", "改ページ", "doc2", 3, function () { return "<span>改ページ</span>"; });
  reg("image", "画像", "image", 1, function (b) {
    if (!b.src) return '<button type="button" class="wpf-add__b" data-act="pick-img" data-id="' + esc(b.id)
      + '" style="width:100%">' + icon("image") + "<span>画像を選ぶ</span></button>";
    return '<figure style="margin:10px 0"><img src="' + esc(b.src) + '" alt="' + esc(b.alt || "")
      + '" style="width:' + (b.width || 100) + '%" />'
      + '<figcaption class="wpd-b__c" contenteditable="true" data-cap="' + esc(b.id)
      + '" data-ph="説明（省略できます）" style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:5px">'
      + esc(b.caption || "") + "</figcaption></figure>";
  });
  reg("table", "表", "table", 1, function (b) {
    var rows = b.rows || [[""]];
    var cols = (rows[0] || []).length;
    var widths = b.colW || [];
    var h = '<div class="wpd-tblwrap"><table class="wpd-tbl" data-tbl="' + esc(b.id) + '"><colgroup>';
    for (var i = 0; i < cols; i++)
      h += "<col" + (widths[i] ? ' style="width:' + Number(widths[i]) + 'px"' : "") + " />";
    h += "</colgroup>";
    rows.forEach(function (r, ri) {
      h += "<tr>";
      r.forEach(function (c, ci) {
        var tag = (b.header && ri === 0) ? "th" : "td";
        h += "<" + tag + (tag === "th" ? ' scope="col"' : "") + ' contenteditable="true" data-r="' + ri
          + '" data-c="' + ci + '">' + esc(c)
          /* 列の境目をつまんで幅を変えるための取っ手（先頭の行にだけ置く）。 */
          + (ri === 0 && ci < r.length - 1
            ? '<span class="wpd-colgrip" contenteditable="false" data-grip="' + ci
              + '" aria-hidden="true"></span>' : "")
          + "</" + tag + ">";
      });
      h += "</tr>";
    });
    return h + "</table></div>";
  });
  reg("toc", "目次", "listUl", 3, function (b, ctx) {
    var items = (ctx.headings || []);
    if (!items.length) return '<div class="wp-lab">見出しを作ると、ここに目次が出ます。</div>';
    return '<div style="padding:10px 0">' + items.map(function (h) {
      return '<div style="padding-left:' + ((h.level - 1) * 16) + 'px;font:var(--vq-type-body-sm);'
        + 'color:var(--vq-text-secondary);line-height:2">' + esc(h.text) + "</div>";
    }).join("") + "</div>";
  });
  reg("math", "数式", "code", 3, function (b) {
    return '<div style="text-align:center;padding:10px;background:var(--vq-surface-sunken);border-radius:6px">'
      + ce(b, "例: E = mc^2") + "</div>";
  });

  /* 色の見本。**関数の外に置く**。
     中に var で置くと、先に走る registerCommands から undefined に見えて落ちる
     （var は巻き上がるが、代入はその行に来るまで起きないため）。 */
  /* 紙と紙のすき間（px）。
     **関数の外に置く**。中に var で置くと、先に走る paint() から
     undefined に見えて top が NaN になり、紙が全部重なる
     （COLORS で一度踏んだのと同じ罠）。 */
  var PAGE_GAP = 24;

  var COLORS = ["#1e293b", "#64748b", "#dc2626", "#ea580c", "#ca8a04", "#16a34a",
    "#0891b2", "#2b70ef", "#7b3fe4", "#d1467a"];
  var HILITES = ["", "#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];

  /* ══ 画面 ══════════════════════════════════════════════════════ */
  function open(o) {
    o = o || {};
    var item = o.item, content = o.content;
    var body = content.content;
    if (!body.blocks || !body.blocks.length) body.blocks = [{ id: M.uid("b"), type: "paragraph", text: "" }];
    /* 紙面の決まりごと。昔の形（width だけ）で保存された文書もここで整う。
       既定は **A4 の縦**。「一枚の白い紙に書く」を最初の状態にする。 */
    body.page = WP.paper.normalize(body.page);

    var session = ST.session(item, content, { intervalMs: ST.prefs().autosaveMs,
      autosave: ST.prefs().autosave });
    var shell = new U.EditorShell({ session: session, onClose: o.onClose,
      onRestore: function () { body = session.content.content; paint(); },
      onAi: function () { toggleAi(true); },
      onModeChange: function () { paint(); },
      moreItems: [
        { label: "ページ設定（用紙・向き・余白）", icon: "layout", run: function () { pageSettings(); } },
        { label: "印刷する", icon: "printer", run: function () { doPrint(true); } },
        { label: "PDF にする", icon: "download", run: function () { doPrint(false); } },
        { label: "書き出し", icon: "download", run: function () { exportSheet(); } },
        { label: "取り込み", icon: "upload", run: function () { importSheet(); } }
      ] });

    var api = VQ2.ui.mount("vq-wp-docs", { title: item.title, css: WP.CSS || "",
      onBeforeClose: function () { shell.tryClose(); return false; } });
    var selBlock = null, showLeft = !VQ2.ui.isMobile(), showAi = false;
    var comments = body.comments || (body.comments = []);

    paint();
    shell.bindHeader(api.root, api);
    bind();
    registerCommands();

    function level() { return shell.mode; }
    function blocks() { return body.blocks; }
    function findIdx(id) {
      for (var i = 0; i < body.blocks.length; i++) if (body.blocks[i].id === id) return i;
      return -1;
    }
    function headings() {
      return body.blocks.filter(function (b) { return /^heading/.test(b.type); })
        .map(function (b) {
          return { id: b.id, level: Number(b.type.replace("heading", "")) || 1,
            text: strip(b.text) || "（無題の見出し）" };
        });
    }
    function strip(html) {
      var d = doc.createElement("div");
      d.innerHTML = String(html || "");
      return (d.textContent || "").trim();
    }
    function plainAll() {
      return body.blocks.map(function (b) {
        if (b.type === "table") return (b.rows || []).map(function (r) { return r.join("\t"); }).join("\n");
        if (b.type === "divider") return "———";
        return strip(b.text);
      }).join("\n");
    }

    function paint() {
      var pg = body.page;
      var paper = pg.mode === "paper";
      /* 紙のときは、**紙を 1 枚ずつ重ねて置き**、その上に 1 枚続きの入力欄を敷く。
         紙ごとに入力欄を分けないのは、分けると行をまたいだ選択・貼り付け・
         Enter がふつうの文書と違う動きになるため。
         紙の切れ目には、後で layoutPages() が「すき間ぶんの詰め物」を入れる。 */
      var main = paper
        ? '<div class="wp-main"><div class="wpd-stage" data-role="stage">'
          + '<div class="wpd-paperbar">' + esc(WP.paper.label(pg))
          + '　余白 ' + fmtMm(pg.margin.t) + "／" + fmtMm(pg.margin.l)
          + '　<button type="button" data-act="page-setup">用紙を変える</button>'
          + '<button type="button" data-act="do-print">印刷</button>'
          + '<button type="button" data-act="do-pdf">PDF</button>'
          + '<span data-role="pgcount"></span></div>'
          + '<div class="wpd-stack" data-role="stack" style="' + WP.paper.sheetStyle(pg) + '">'
          + '<div class="wpd-sheets" data-role="sheets" aria-hidden="true"></div>'
          + '<div class="wpd-page is-paper" data-role="page">' + blocksHtml() + "</div>"
          + "</div></div></div>"
        : '<div class="wp-main"><div class="wpd-page" data-role="page">' + blocksHtml() + "</div></div>";
      api.root.innerHTML = '<div class="wp">' + shell.headerHtml() + toolbar() + ctxBar()
        + '<div class="wp-body">'
        + (showLeft ? '<aside class="wp-left">' + outline() + "</aside>" : "")
        + main
        + (showAi ? '<aside class="wp-right">' + aiPanel() + "</aside>" : "")
        + "</div>" + mobileBar() + statusBar() + "</div>";
      shell.host = api.root;
      shell.syncUndoButtons();
      if (paper) { fitPaper(); markBreaks(); }
      loadUsedFonts();
    }
    function fmtMm(v) { return (Math.round(Number(v) * 10) / 10) + "mm"; }

    /* 画面が紙より狭いときは、紙のほうを縮めて全部見せる。
       横に切れると、右端の文字が読めないまま書くことになる。 */
    function fitPaper() {
      var stage = api.root.querySelector('[data-role="stage"]');
      var stack = api.root.querySelector('[data-role="stack"]');
      if (!stage || !stack) return;
      var avail = stage.clientWidth - 24;
      var w = WP.paper.sizePx(body.page).w;
      var k = avail > 0 && w > avail ? Math.max(0.4, avail / w) : 1;
      if (k < 1) {
        stack.style.transform = "scale(" + k.toFixed(3) + ")";
        stack.style.transformOrigin = "top center";
        /* 縮めても場所は元の大きさぶん取られる。下の余りを打ち消す。 */
        stack.style.marginBottom = (-(1 - k) * stack.offsetHeight) + "px";
        stage.setAttribute("data-fit", "1");
      } else {
        stack.style.transform = "";
        stack.style.marginBottom = "";
        stage.removeAttribute("data-fit");
      }
    }

    /* ══════════════════════════════════════════════════════════════
       紙ごとに区切る（Word と同じ見え方）

       やり方:
         ・入力欄は 1 つのまま。中身は上から下へ普通に流れる。
         ・文字が 1 枚ぶんの高さを超えるところで、**すき間ぶんの詰め物**を
           流れの中へ入れる。詰め物は「下余白 ＋ 紙と紙のすき間 ＋ 上余白」の高さ。
           こうすると、次の段落はちょうど次の紙の書き出し位置から始まる。
         ・紙そのもの（白い長方形と影）は、後ろに 1 枚ずつ並べて置く。

       なぜ紙ごとに入力欄を分けないか:
         分けると、行をまたいだ選択・貼り付け・Enter・元に戻すが
         ふつうの文書と違う動きになる。見た目のために編集を壊さない。

       入りきらないもの（紙より高い表や画像）は、そのまま次の紙へ送る。
       途中で切ることはしない（切ると読めなくなるため）。
       ══════════════════════════════════════════════════════════════ */
    function markBreaks() { layoutPages(); }

    function layoutPages() {
      var pg = body.page;
      if (pg.mode !== "paper") return;
      var stack = api.root.querySelector('[data-role="stack"]');
      var page = api.root.querySelector('[data-role="page"]');
      var sheets = api.root.querySelector('[data-role="sheets"]');
      var docEl = api.root.querySelector('[data-role="doc"]');
      if (!stack || !page || !sheets || !docEl) return;

      var MM = WP.paper.MM;
      var pageH = WP.paper.sizePx(pg).h;
      var mt = pg.margin.t * MM, mb = pg.margin.b * MM;
      var innerH = Math.max(40, pageH - mt - mb);
      var spacerH = mb + PAGE_GAP + mt;

      /* 前に入れた詰め物を外してから測る（残っていると二重に空く） */
      Array.prototype.forEach.call(docEl.querySelectorAll(".wpd-gap"), function (n) { n.remove(); });

      /* 上から順に高さを積み、1 枚ぶんを超える手前で詰め物を入れる。

         **かたまりの中まで見る。**
         箇条書きや番号付きは <ul>/<ol> ひとかたまりなので、
         外側だけ測ると「1 枚に入らない大きさ」と判断されて、
         紙からはみ出したまま次の紙へ突き抜けていた（実際にそうなっていた）。
         中の 1 行ずつを見て、行の切れ目でページを割る。 */
      var used = 0, pages = 1;
      var SPLITTABLE = { UL: 1, OL: 1 };
      place(Array.prototype.slice.call(docEl.children));

      function outerH(el) {
        var cs = root.getComputedStyle(el);
        return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      }
      function place(kids) {
        for (var i = 0; i < kids.length; i++) {
          var el = kids[i];
          if (/wpd-gap/.test(el.className || "")) continue;
          var h = outerH(el);

          if (used + h <= innerH + 0.5) { used += h; continue; }

          /* 入りきらない。中で割れるものなら、中の行で割る。 */
          if (SPLITTABLE[el.tagName] && el.children.length > 1) {
            place(Array.prototype.slice.call(el.children));
            continue;
          }
          /* 1 枚に収まらないほど大きいものは、そのページの頭から置いてあふれさせる */
          if (h >= innerH) {
            if (used > 0) { insertGap(el, innerH - used); pages++; used = 0; }
            used = innerH;                       /* このページは埋まった扱い */
            continue;
          }
          insertGap(el, innerH - used);
          pages++;
          used = h;
        }
      }
      function insertGap(before, fill) {
        var g = doc.createElement("div");
        g.className = "wpd-gap";
        g.setAttribute("contenteditable", "false");
        g.setAttribute("aria-hidden", "true");
        g.style.height = Math.max(0, fill) + spacerH + "px";
        /* 箇条書きの中へ入れるときは、番号が増えないように <li> にはしない。 */
        if (before.parentNode) before.parentNode.insertBefore(g, before);
      }

      /* 後ろに紙を並べる。 */
      var want = Math.max(1, pages);
      var html = "";
      for (var k = 0; k < want; k++)
        html += '<div class="wpd-sheet" style="top:' + (k * (pageH + PAGE_GAP)) + "px;height:"
          + pageH + 'px"><span class="wpd-sheet__n">' + (k + 1) + "</span></div>";
      sheets.innerHTML = html;
      stack.style.height = (want * pageH + (want - 1) * PAGE_GAP) + "px";

      var lab = api.root.querySelector('[data-role="pgcount"]');
      if (lab) lab.textContent = "　全 " + want + " ページ";
    }

    /* この文書が使っている書体だけ、実体を読む。 */
    function usedFontIds() {
      var ids = {};
      if (body.font) ids[body.font] = 1;
      body.blocks.forEach(function (b) { if (b.font) ids[b.font] = 1; });
      /* 本文中の <span data-f="..."> も拾う */
      body.blocks.forEach(function (b) {
        String(b.text || "").replace(/data-f="([^"]+)"/g, function (_, id) { ids[id] = 1; return ""; });
      });
      return Object.keys(ids);
    }
    function loadUsedFonts() { try { U.fontLoadAll(usedFontIds()); } catch (e) {} }

    /* 打ち終わってから DOM を読み戻す。打つたびにやると重い。 */
    var harvestTimer = null;
    function scheduleHarvest() {
      if (harvestTimer) root.clearTimeout(harvestTimer);
      harvestTimer = root.setTimeout(function () {
        harvestTimer = null;
        if (harvest()) { session.touch(); updateStatus(); }
      }, 320);
    }
    function harvestNow() {
      if (harvestTimer) { root.clearTimeout(harvestTimer); harvestTimer = null; }
      if (harvest()) { session.touch(); updateStatus(); }
    }
    /* いまカーソルがある段落。ブロックの操作はここを対象にする。 */
    function caretBlockEl() {
      try {
        var s = U.selectionOf(api.shadow);
        if (!s || !s.rangeCount) return null;
        var n = s.getRangeAt(0).startContainer;
        if (n.nodeType !== 1) n = n.parentNode;
        if (!n || !n.closest) return null;
        var d = n.closest('[data-role="doc"]');
        if (!d) return null;
        var el = n.closest("[data-id]");
        while (el && el.parentNode !== d && !/^(LI)$/.test(el.tagName)) {
          if (el.parentNode === d) break;
          el = el.parentNode && el.parentNode.closest ? el.parentNode.closest("[data-id]") : null;
        }
        return el;
      } catch (e) { return null; }
    }
    function caretBlockId() {
      var el = caretBlockEl();
      return el ? el.getAttribute("data-id") : null;
    }

    /* 打っている最中に毎回測ると重い。落ち着いてから測る。 */
    var brkTimer = null;
    function scheduleBreaks() {
      if (body.page.mode !== "paper") return;
      if (brkTimer) root.clearTimeout(brkTimer);
      brkTimer = root.setTimeout(function () { brkTimer = null; markBreaks(); }, 260);
    }
    /* 窓の大きさが変わったら、紙の縮尺と途切れ目を測り直す。 */
    var onResize = function () { if (body.page.mode === "paper") { fitPaper(); markBreaks(); } };
    try { root.addEventListener("resize", onResize); } catch (e) {}
    api.onClose = function () { try { root.removeEventListener("resize", onResize); } catch (e) {} };

    function toolbar() {
      var lv = level();
      var defs = REG.forLevel(lv);
      var h = '<div class="wp-tools">';
      h += btn({ icon: "type", label: "スタイル", act: "style-menu" });
      h += '<span class="wp-sep"></span>';
      /* 書体と大きさ。数字でも A-/A+ でも変えられる。
         書体はネイティブの select を使わない。開いた瞬間に文字の選択が消えるため
         （「選んだのに変わらない」の原因だった）。自前の窓にする。 */
      h += '<button type="button" class="wp-btn wp-fontbtn" data-act="font-menu" title="書体">'
        + icon("type") + '<span data-role="fontname">' + esc(curFontLabel()) + "</span>"
        + icon("chevronD") + "</button>"
        + '<span class="wp-num"><button type="button" class="wp-btn is-icon" data-act="size-" '
        + 'aria-label="小さく" title="小さく">A－</button>'
        + '<input class="wp-num__i" type="number" min="8" max="120" value="18" data-act="size" '
        + 'aria-label="文字の大きさ（px）" title="文字の大きさ" />'
        + '<button type="button" class="wp-btn is-icon" data-act="size+" aria-label="大きく" title="大きく">A＋</button></span>'
        + '<span class="wp-sep"></span>';
      h += btn({ icon: "bold", iconOnly: true, label: "太字", act: "fmt", val: "bold" })
        + btn({ icon: "italic", iconOnly: true, label: "斜体", act: "fmt", val: "italic" })
        + btn({ icon: "underline", iconOnly: true, label: "下線", act: "fmt", val: "underline" });
      if (lv !== "simple")
        h += btn({ icon: "strike", iconOnly: true, label: "取り消し線", act: "fmt", val: "strikeThrough" })
          + btn({ icon: "palette", iconOnly: true, label: "文字色と背景", act: "color-menu" })
          + btn({ label: "記号", icon: "type", act: "symbol-menu", title: "記号を入れる" })
          + btn({ label: "囲い", icon: "shapes", act: "enclose-menu", title: "囲い文字" });
      if (lv === "detail")
        h += btn({ label: "x²", act: "fmt", val: "superscript", title: "上付き文字" })
          + btn({ label: "x₂", act: "fmt", val: "subscript", title: "下付き文字" })
          + btn({ icon: "x", iconOnly: true, label: "書式を消す", act: "fmt", val: "removeFormat" });
      h += '<span class="wp-sep"></span>'
        + btn({ icon: "listUl", iconOnly: true, label: "箇条書き", act: "type", val: "bullet" })
        + btn({ icon: "listOl", iconOnly: true, label: "番号付き", act: "type", val: "number" })
        + btn({ icon: "check2", iconOnly: true, label: "チェックリスト", act: "type", val: "todo" });
      if (lv !== "simple")
        h += '<span class="wp-sep"></span>'
          + btn({ icon: "alignL", iconOnly: true, label: "左揃え", act: "align", val: "Left" })
          + btn({ icon: "alignC", iconOnly: true, label: "中央揃え", act: "align", val: "Center" })
          + btn({ icon: "alignR", iconOnly: true, label: "右揃え", act: "align", val: "Right" });
      if (lv === "detail")
        h += btn({ icon: "alignJ", iconOnly: true, label: "両端揃え", act: "align", val: "Full" });
      h += '<span class="wp-sep"></span>' + btn({ icon: "plus", label: "挿入", act: "insert-menu" })
        + btn({ icon: "link", iconOnly: true, label: "リンク", act: "link" })
        + btn({ icon: "sparkle", label: "AI", act: "ai-panel" })
        + '<span class="wp-top__sp"></span>'
        + btn({ icon: "listUl", iconOnly: true, label: "アウトライン", act: "toggle-left", on: showLeft })
        + btn({ icon: "more", iconOnly: true, label: "その他の機能", act: "more-tools" });
      return h + "</div>";
    }
    /* 選んでいるブロックに関係する操作だけを出す（§2.2） */
    function ctxBar() {
      if (!selBlock) return "";
      var i = findIdx(selBlock);
      if (i < 0) return "";
      var b = body.blocks[i];
      var d = REG.get(b.type);
      var h = '<div class="wp-ctx"><span class="wp-ctx__l">' + esc(d ? d.label : b.type) + "</span>";
      if (b.type === "table") {
        h += btn({ icon: "rows", label: "行を追加", act: "tbl", val: "row+" })
          + btn({ icon: "cols", label: "列を追加", act: "tbl", val: "col+" })
          + btn({ icon: "minus", label: "行を削除", act: "tbl", val: "row-" })
          + btn({ icon: "minus", label: "列を削除", act: "tbl", val: "col-" })
          + btn({ label: b.header ? "見出し行をやめる" : "見出し行にする", act: "tbl", val: "head" });
      } else if (b.type === "image") {
        h += btn({ icon: "image", label: "画像を選び直す", act: "pick-img", val: b.id })
          + btn({ label: "小", act: "imgw", val: "40" }) + btn({ label: "中", act: "imgw", val: "70" })
          + btn({ label: "大", act: "imgw", val: "100" });
      } else {
        h += btn({ icon: "quote", label: "引用", act: "type", val: "quote" })
          + btn({ icon: "code", label: "コード", act: "type", val: "code" })
          + btn({ icon: "info", label: "囲み", act: "type", val: "callout" });
      }
      h += '<span class="wp-top__sp"></span>'
        + btn({ icon: "copy", iconOnly: true, label: "このブロックを複製", act: "dup-block" })
        + btn({ icon: "trash", iconOnly: true, label: "このブロックを削除", act: "del-block" });
      return h + "</div>";
    }
    function mobileBar() {
      return '<div class="wp-mbar">'
        + btn({ icon: "plus", iconOnly: true, label: "挿入", act: "insert-menu" })
        + btn({ icon: "type", iconOnly: true, label: "スタイル", act: "style-menu" })
        + btn({ icon: "bold", iconOnly: true, label: "太字", act: "fmt", val: "bold" })
        + btn({ icon: "italic", iconOnly: true, label: "斜体", act: "fmt", val: "italic" })
        + btn({ icon: "listUl", iconOnly: true, label: "箇条書き", act: "type", val: "bullet" })
        + btn({ icon: "check2", iconOnly: true, label: "チェック", act: "type", val: "todo" })
        + btn({ icon: "sparkle", iconOnly: true, label: "AI", act: "ai-panel" })
        + btn({ icon: "listUl", iconOnly: true, label: "アウトライン", act: "outline-sheet" })
        + "</div>";
    }
    function statusBar() {
      var text = plainAll();
      var chars = text.replace(/\s/g, "").length;
      var words = (text.match(/[A-Za-z]+|[぀-ヿ一-鿿]/g) || []).length;
      var mins = Math.max(1, Math.round(chars / 500));
      return '<div class="wpd-stat"><span>' + chars + " 字</span><span>" + words + " 語</span>"
        + "<span>読了 約 " + mins + " 分</span><span>" + body.blocks.length + " ブロック</span>"
        + (comments.length ? "<span>コメント " + comments.length + "</span>" : "") + "</div>";
    }
    function outline() {
      var hs = headings();
      return '<div class="wp-panel__h">アウトライン</div>'
        + (hs.length ? hs.map(function (h) {
          return '<button type="button" class="wpd-outline__i l' + h.level + '" data-act="goto" data-id="'
            + esc(h.id) + '">' + esc(h.text) + "</button>";
        }).join("")
          : '<div class="wp-lab" style="padding:0 14px">見出しを作ると、ここに並びます。</div>')
        + '<div class="wp-panel__h">コメント</div>'
        + (comments.length ? comments.map(function (c, i) {
          return '<div style="padding:8px 14px;border-bottom:1px solid var(--vq-border-subtle)">'
            + '<div style="font:var(--vq-type-body-sm);color:var(--vq-text)">' + esc(c.text) + "</div>"
            + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:3px">'
            + esc(c.quote ? "「" + c.quote.slice(0, 24) + "」" : "") + "</div>"
            + '<div class="wp-inline" style="margin-top:5px">'
            + btn({ label: c.resolved ? "未解決に戻す" : "解決", act: "cmt-resolve", val: i })
            + btn({ label: "削除", act: "cmt-del", val: i }) + "</div></div>";
        }).join("")
          : '<div class="wp-lab" style="padding:0 14px">文字を選んで「コメント」を押すと付けられます。</div>');
    }
    function aiPanel() {
      var acts = WP.ai.actionsFor("document");
      return '<div class="wp-panel__h">AI アシスタント</div><div class="wp-ai">'
        + '<div class="wp-ai__scope">' + esc(WP.ai.scopeText(currentScope())) + "</div>"
        + '<div class="wp-ai__a">' + acts.map(function (a) {
          return '<button type="button" class="wp-ai__b" data-act="ai-run" data-id="' + esc(a.id) + '">'
            + icon(a.icon || "sparkle") + "<span>" + esc(a.label) + "</span></button>";
        }).join("") + "</div></div>";
    }
    function currentScope() {
      /* 打ちかけの内容が保存前だと、AI へ古い文章を渡してしまう。
         対象を決める前に必ず DOM から読み戻す。 */
      harvestNow();
      var sel = selectionText();
      if (sel) return { kind: "selection", text: sel, label: "選んだ文字" };
      var cid = caretBlockId() || selBlock;
      if (cid) {
        var i = findIdx(cid);
        if (i >= 0 && strip(body.blocks[i].text))
          return { kind: "block", text: strip(body.blocks[i].text), blockId: cid,
            label: "カーソルのある段落" };
      }
      return { kind: "document", text: plainAll(), label: "この文書ぜんたい" };
    }

    /* ══════════════════════════════════════════════════════════════
       1 枚続きの文書として描く

       以前は 1 段落ずつ別々の入力欄（ブロック）に分けていた。
       そのため Enter・Backspace・段落をまたぐ選択・貼り付けが
       ふつうの文書と違う動きになり、「紙に書いている」感じにならなかった。

       いまは **入力欄は 1 つだけ**。中身はふつうの <p> <h1> <ul> <table> …。
       Enter で段落が増えるのも、まとめて選んで消すのも、ブラウザ本来の動き。

       body.blocks は **保存と書き出しのための形**として残す。
       打ち終わったら harvest() で DOM から読み戻す。
       ══════════════════════════════════════════════════════════════ */
    function blocksHtml() {
      return '<div class="wpd-doc" contenteditable="true" role="textbox" aria-multiline="true" '
        + 'spellcheck="true" data-role="doc">' + docInnerHtml() + "</div>";
    }
    function docInnerHtml() {
      var out = [];
      var i = 0;
      var hs = headings();
      while (i < body.blocks.length) {
        var b = body.blocks[i];
        /* 続いている箇条書き・番号付きは 1 つの <ul>/<ol> にまとめる。
           ばらばらの <ul> にすると、行の間が空いて Word と違う見え方になる。 */
        if (b.type === "bullet" || b.type === "number") {
          var tag = b.type === "bullet" ? "ul" : "ol";
          var lis = [];
          while (i < body.blocks.length && body.blocks[i].type === b.type) {
            lis.push('<li data-id="' + esc(body.blocks[i].id) + '">'
              + (body.blocks[i].text || "") + "</li>");
            i++;
          }
          out.push("<" + tag + ' class="wpd-list">' + lis.join("") + "</" + tag + ">");
          continue;
        }
        out.push(blockEl(b, hs));
        i++;
      }
      if (!out.length) out.push('<p data-id="' + esc(M.uid("b")) + '"><br></p>');
      return out.join("");
    }
    function blockEl(b, hs) {
      var id = ' data-id="' + esc(b.id) + '"';
      var t = b.text || "";
      switch (b.type) {
        case "heading1": return "<h1" + id + ">" + (t || "<br>") + "</h1>";
        case "heading2": return "<h2" + id + ">" + (t || "<br>") + "</h2>";
        case "heading3": return "<h3" + id + ">" + (t || "<br>") + "</h3>";
        case "heading4": return "<h4" + id + ">" + (t || "<br>") + "</h4>";
        case "quote": return "<blockquote" + id + ">" + (t || "<br>") + "</blockquote>";
        case "code": return "<pre" + id + ">" + (t || "<br>") + "</pre>";
        case "callout":
          return '<div class="wpd-callout"' + id + ">" + (t || "<br>") + "</div>";
        case "todo":
          return '<div class="wpd-todo' + (b.checked ? " is-done" : "") + '"' + id + ">"
            + '<input type="checkbox" class="wpd-b__ck" contenteditable="false" data-ck="' + esc(b.id) + '"'
            + (b.checked ? " checked" : "") + ' aria-label="完了" />'
            + '<span class="wpd-todo__t">' + (t || "<br>") + "</span></div>";
        case "divider":
          return '<hr class="wpd-hr" contenteditable="false"' + id + " />";
        case "pagebreak":
          return '<div class="wpd-pb" contenteditable="false"' + id + "><span>ここで改ページ</span></div>";
        case "image":
          if (!b.src)
            return '<div class="wpd-ph" contenteditable="false"' + id + ">"
              + '<button type="button" class="wpf-add__b" data-act="pick-img" data-id="' + esc(b.id)
              + '" style="width:100%">' + icon("image") + "<span>画像を選ぶ</span></button></div>";
          return '<figure class="wpd-fig" contenteditable="false"' + id + ">"
            + '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || "") + '" style="width:'
            + (b.width || 100) + '%" />'
            + '<figcaption contenteditable="true" data-cap="' + esc(b.id)
            + '" data-ph="説明（省略できます）">' + esc(b.caption || "") + "</figcaption></figure>";
        case "table": {
          var rows = b.rows || [[""]];
          var cols = (rows[0] || []).length;
          var widths = b.colW || [];
          var h = '<table class="wpd-tbl" data-tbl="' + esc(b.id) + '"' + id + "><colgroup>";
          for (var ci2 = 0; ci2 < cols; ci2++)
            h += "<col" + (widths[ci2] ? ' style="width:' + Number(widths[ci2]) + 'px"' : "") + " />";
          h += "</colgroup>";
          rows.forEach(function (r, ri) {
            h += "<tr>";
            r.forEach(function (c, ci) {
              var tag2 = (b.header && ri === 0) ? "th" : "td";
              h += "<" + tag2 + (tag2 === "th" ? ' scope="col"' : "")
                + ' data-r="' + ri + '" data-c="' + ci + '">' + esc(c)
                + (ri === 0 && ci < r.length - 1
                  ? '<span class="wpd-colgrip" contenteditable="false" data-grip="' + ci
                    + '" aria-hidden="true"></span>' : "")
                + "</" + tag2 + ">";
            });
            h += "</tr>";
          });
          return h + "</table>";
        }
        case "toc": {
          var items = hs || [];
          return '<div class="wpd-toc" contenteditable="false"' + id + ">"
            + (items.length
              ? items.map(function (x) {
                return '<div style="padding-left:' + ((x.level - 1) * 16) + 'px">' + esc(x.text) + "</div>";
              }).join("")
              : '<div class="wp-lab">見出しを作ると、ここに目次が出ます。</div>') + "</div>";
        }
        case "math":
          return '<div class="wpd-math"' + id + ">" + (t || "<br>") + "</div>";
        default:
          return "<p" + id + ">" + (t || "<br>") + "</p>";
      }
    }

    /* DOM →ブロック。打ち終わったあとに呼ぶ。
       ここが「保存されるもの」を決める唯一の場所。 */
    function harvest() {
      var docEl = api.root.querySelector('[data-role="doc"]');
      if (!docEl) return false;
      var out = [];
      var seen = {};
      function idOf(el) {
        var v = el.getAttribute && el.getAttribute("data-id");
        if (!v || seen[v]) { v = M.uid("b"); if (el.setAttribute) el.setAttribute("data-id", v); }
        seen[v] = 1;
        return v;
      }
      function pushText(el, type) {
        var html = el.innerHTML;
        if (html === "<br>" || html === "<br/>") html = "";
        out.push({ id: idOf(el), type: type, text: html });
      }
      Array.prototype.forEach.call(docEl.childNodes, function (node) {
        /* 入力欄のすぐ下に「裸の文字」が残ることがある。
           全部消してから打ち直したときなど、ブラウザが <p> を作らない場合。
           要素だけを見ていると、その行がまるごと消える（打った文章が失われる）。 */
        if (node.nodeType === 3) {
          var raw = String(node.nodeValue || "");
          if (!raw.trim()) return;
          out.push({ id: M.uid("b"), type: "paragraph", text: esc(raw) });
          return;
        }
        if (node.nodeType !== 1) return;
        var el = node;
        var tag = (el.tagName || "").toLowerCase();
        var cls = el.className || "";
        /* ページのすき間ぶんの詰め物。見た目のためだけのものなので保存しない。 */
        if (/wpd-gap/.test(cls)) return;
        if (tag === "h1") return pushText(el, "heading1");
        if (tag === "h2") return pushText(el, "heading2");
        if (tag === "h3") return pushText(el, "heading3");
        if (tag === "h4") return pushText(el, "heading4");
        if (tag === "blockquote") return pushText(el, "quote");
        if (tag === "pre") return pushText(el, "code");
        if (tag === "hr") { out.push({ id: idOf(el), type: "divider", text: "" }); return; }
        if (tag === "ul" || tag === "ol") {
          var type = tag === "ul" ? "bullet" : "number";
          Array.prototype.forEach.call(el.children, function (li) {
            /* 紙の切れ目の詰め物は、箇条書きの中にも入る。保存しない。 */
            if (/wpd-gap/.test(li.className || "")) return;
            var html = li.innerHTML;
            if (html === "<br>") html = "";
            out.push({ id: idOf(li), type: type, text: html });
          });
          return;
        }
        if (/wpd-todo/.test(cls)) {
          var sp = el.querySelector(".wpd-todo__t");
          var ck = el.querySelector("[data-ck]");
          out.push({ id: idOf(el), type: "todo", text: sp ? sp.innerHTML : "",
            checked: !!(ck && ck.checked) });
          return;
        }
        if (/wpd-callout/.test(cls)) return pushText(el, "callout");
        if (/wpd-math/.test(cls)) return pushText(el, "math");
        if (/wpd-pb/.test(cls)) { out.push({ id: idOf(el), type: "pagebreak", text: "" }); return; }
        if (/wpd-toc/.test(cls)) { out.push({ id: idOf(el), type: "toc", text: "" }); return; }
        if (tag === "table") {
          var id0 = el.getAttribute("data-id") || idOf(el);
          var prev = body.blocks.filter(function (x) { return x.id === id0; })[0];
          var rows = [];
          Array.prototype.forEach.call(el.querySelectorAll("tr"), function (tr) {
            var r = [];
            Array.prototype.forEach.call(tr.children, function (td) {
              var c = td.cloneNode(true);
              Array.prototype.forEach.call(c.querySelectorAll(".wpd-colgrip"), function (g) { g.remove(); });
              r.push((c.textContent || "").trim());
            });
            rows.push(r);
          });
          out.push({ id: id0, type: "table", rows: rows,
            header: prev ? prev.header !== false : true, colW: prev ? prev.colW : undefined });
          return;
        }
        if (tag === "figure" || /wpd-ph/.test(cls)) {
          var id1 = el.getAttribute("data-id") || idOf(el);
          var was = body.blocks.filter(function (x) { return x.id === id1; })[0] || {};
          var cap = el.querySelector("figcaption");
          out.push({ id: id1, type: "image", src: was.src || "", alt: was.alt || "",
            width: was.width || 100, caption: cap ? (cap.textContent || "").trim() : (was.caption || "") });
          return;
        }
        /* div や p、想定外のものは本文として拾う（中身を捨てない） */
        pushText(el, "paragraph");
      });
      if (!out.length) out.push({ id: M.uid("b"), type: "paragraph", text: "" });
      body.blocks = out;
      return true;
    }

    /* 1 ブロックだけを描き直す（打っている最中は使わない）。 */
    function repaintBlock(id) {
      var el = api.root.querySelector('.wpd-b[data-id="' + id + '"]');
      var i = findIdx(id);
      if (!el || i < 0) { paint(); return; }
      var b = body.blocks[i];
      var d = REG.get(b.type) || REG.get("paragraph");
      el.setAttribute("data-type", b.type);
      el.innerHTML = '<button type="button" class="wpd-hand" data-act="block-menu" data-id="' + esc(b.id)
        + '" aria-label="ブロックの操作">' + icon("more") + "</button>"
        + d.render(b, { headings: headings(), num: 1 });
    }

    function focusBlock(id, atEnd) {
      var el = api.root.querySelector('[data-role="doc"] [data-id="' + id + '"]')
        || api.root.querySelector('.wpd-b[data-id="' + id + '"] .wpd-b__c');
      if (!el) return;
      if (el.querySelector && el.querySelector(".wpd-todo__t")) el = el.querySelector(".wpd-todo__t");
      el.focus();
      try {
        var r = doc.createRange(), s = root.getSelection();
        r.selectNodeContents(el);
        r.collapse(!atEnd);
        s.removeAllRanges(); s.addRange(r);
      } catch (e) {}
    }
    function selectionText() {
      try {
        var s = api.shadow.getSelection ? api.shadow.getSelection() : root.getSelection();
        return s && !s.isCollapsed ? String(s.toString()) : "";
      } catch (e) { return ""; }
    }
    /* 文章を打つところ。本文は 1 枚続き（.wpd-doc）。
       表のマス・図の説明文だけ、いまも別の入力欄（.wpd-b__c）になっている。
       **両方を数える**。片方しか見ないと、本文で文字を選んでも
       「選んでいない」扱いになり、色も書体も段落ぜんぶに当たってしまう。 */
    var EDITABLE = '[data-role="doc"], .wpd-b__c';
    function inEditable(node) {
      var n = node && node.nodeType === 1 ? node : (node && node.parentNode);
      return !!(n && n.closest && n.closest(EDITABLE));
    }
    /* 覚えておいた選択。メニューを開くと選択は消えるので、開く直前に控える。 */
    var savedSel = null;
    function rememberSel() {
      var r = U.saveSelection(api.shadow);
      /* 文章の中の「範囲のある」選択だけを覚える。
         つぶれた（カーソルだけの）選択で上書きすると、直前に選んだ範囲が消え、
         ツールバーから当てたときに何も起きなくなる。 */
      if (r && r.startContainer && !r.collapsed && inEditable(r.startContainer)) savedSel = r;
      /* カーソルの位置は別に覚えておく（記号を入れる先などに使う）。 */
      if (r && r.startContainer && inEditable(r.startContainer)) caretSel = r;
    }
    var caretSel = null;
    function curFontLabel() {
      return "書体";
    }
    /* 控えた選択がまだ生きているか。書式を当てたあとは中身が入れ替わるので、
       死んだ範囲を戻すと execCommand が何もしなくなる（太字が効かない原因だった）。 */
    function selAlive(r) {
      if (!r || !r.startContainer) return false;
      try { return !!r.startContainer.isConnected && !r.collapsed; } catch (e) { return false; }
    }
    function withSel(fn) {
      /* ボタンを押した時点で選択が生きていればそれを使い、
         消えていれば控えておいたものへ戻してから当てる。 */
      var s = U.selectionOf(api.shadow);
      var live = s && s.rangeCount && !s.isCollapsed;
      if (!live && selAlive(savedSel)) U.restoreSelection(api.shadow, savedSel);
      var r = fn();
      syncFocusedBlock();
      rememberSel();
      return r;
    }
    function execFmt(cmd, val) {
      return withSel(function () {
        if (cmd === "indent" || cmd === "outdent" || /^justify/.test(cmd) || cmd === "insertText"
            || cmd === "createLink" || cmd === "superscript" || cmd === "subscript"
            || cmd === "removeFormat" || cmd === "insertHTML") {
          try { return doc.execCommand(cmd, false, val === undefined ? null : val); } catch (e) { return false; }
        }
        return U.applyInline(api.shadow, cmd, val);
      });
    }
    /* 選んだところへ style を当てる（書体・大きさ）。
       execCommand には px 指定が無いので、自分で span を被せる。 */
    function applyStyleToSelection(styleText) {
      /* 何も選んでいないときは、いま触っているブロック全体に当てる。
         「選び直すのが面倒」「選んだつもりが外れていた」で
         何も起きない、を無くすため。 */
      var live = U.selectionOf(api.shadow);
      var hasRange = live && live.rangeCount && !live.isCollapsed;
      if (!hasRange && !selAlive(savedSel)) {
        var id = selBlock || (caretSel && blockIdOf(caretSel));
        if (id) return applyStyleToBlock(id, styleText);
      }
      return withSel(function () {
        var s = U.selectionOf(api.shadow);
        if (!s || !s.rangeCount || s.isCollapsed) {
          var id2 = selBlock;
          if (id2) return applyStyleToBlock(id2, styleText);
          return false;
        }
        var range = s.getRangeAt(0);
        try {
          var span = doc.createElement("span");
          span.setAttribute("style", styleText);
          span.appendChild(range.extractContents());
          range.insertNode(span);
          var r2 = doc.createRange();
          r2.selectNodeContents(span);
          s.removeAllRanges();
          s.addRange(r2);
          return true;
        } catch (e) { return false; }
      });
    }
    /* 選んだ範囲を文字で置き換える（選択が生きているときだけ）。 */
    function replaceSelectionText(txt) {
      try {
        return withSel(function () {
          var s = U.selectionOf(api.shadow);
          if (!s || !s.rangeCount || s.isCollapsed) return false;
          var r = s.getRangeAt(0);
          r.deleteContents();
          var lines = String(txt).split("\n");
          var frag = doc.createDocumentFragment();
          lines.forEach(function (ln, i) {
            if (i) frag.appendChild(doc.createElement("br"));
            frag.appendChild(doc.createTextNode(ln));
          });
          r.insertNode(frag);
          return true;
        });
      } catch (e) { return false; }
    }
    function blockIdOf(range) {
      try {
        var n = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentNode;
        var b = n && n.closest ? n.closest(".wpd-b") : null;
        return b ? b.getAttribute("data-id") : null;
      } catch (e) { return null; }
    }
    /* ブロックの中身をまるごと 1 つの span で包んで style を当てる。 */
    function applyStyleToBlock(id, styleText) {
      var i = findIdx(id);
      if (i < 0) return false;
      /* 1 枚続きの本文では、段落そのものが [data-id] を持つ。
         古い形（1 段落 = 1 入力欄）も残っているので、両方を探す。 */
      var el = api.root.querySelector('[data-role="doc"] [data-id="' + id + '"]')
        || api.root.querySelector('.wpd-b[data-id="' + id + '"] .wpd-b__c');
      if (!el) return false;
      shell.pushUndo("書式");
      var span = doc.createElement("span");
      span.setAttribute("style", styleText);
      while (el.firstChild) span.appendChild(el.firstChild);
      el.appendChild(span);
      body.blocks[i].text = el.innerHTML;
      session.touch();
      api.toast("このブロック全体に当てました（文字を選ぶと一部だけにできます）", "info", 3500);
      return true;
    }
    /* いま選んでいるところの大きさを読む（数字の欄へ映すため）。 */
    function currentSize() {
      try {
        var s = U.selectionOf(api.shadow);
        if (!s || !s.rangeCount) return null;
        var n = s.getRangeAt(0).startContainer;
        if (n.nodeType !== 1) n = n.parentNode;
        if (!inEditable(n)) return null;
        return Math.round(parseFloat(root.getComputedStyle(n).fontSize)) || null;
      } catch (e) { return null; }
    }
    function bumpSize(delta) {
      var box = api.root.querySelector('[data-act="size"]');
      var cur = Number(box && box.value) || currentSize() || 18;
      var next = Math.max(8, Math.min(120, cur + delta));
      if (box) box.value = next;
      applyStyleToSelection("font-size:" + next + "px");
    }
    /* いま編集中のブロックの内容をモデルへ写す。 */
    function syncFocusedBlock() {
      /* 1 枚続きの本文は、段落ごとの入力欄が無い。DOM ぜんぶを読み戻す。
         **いま focus がどこにあるかは見ない。**
         色や書体はメニューから当てるので、当てた直後の focus はメニュー側にある。
         focus を見ていると、当てた書式が保存に入らないまま消えていた。 */
      if (api.root.querySelector('[data-role="doc"]')) { harvestNow(); return; }
      var el = api.shadow.activeElement;
      if (!el) return;
      var host = el.closest ? el.closest(".wpd-b__c") : null;
      if (!host) return;
      var id = host.getAttribute("data-id");
      var i = findIdx(id);
      if (i < 0) return;
      body.blocks[i].text = host.innerHTML;
      session.touch();
    }

    function setType(id, type) {
      /* 1 枚続きになったので、対象は **いまカーソルがある段落**。
         ボタンを押す前に、打った内容を読み戻しておく（保存漏れを防ぐ）。 */
      harvestNow();
      if (!id) id = caretBlockId() || selBlock;
      var i = findIdx(id);
      if (i < 0 || !REG.has(type)) return;
      shell.pushUndo("種類の変更");
      var b = body.blocks[i];
      b.type = type;
      if (type === "table" && !b.rows) { b.rows = [["", "", ""], ["", "", ""], ["", "", ""]]; b.header = true; }
      if (type === "divider" || type === "pagebreak") b.text = "";
      session.touch();
      paint();
      if (type !== "divider" && type !== "pagebreak" && type !== "image" && type !== "table") focusBlock(id, true);
    }
    function insertBlock(type, afterId) {
      shell.pushUndo("ブロックの追加");
      var b = { id: M.uid("b"), type: type, text: "" };
      if (type === "table") { b.rows = [["", "", ""], ["", "", ""], ["", "", ""]]; b.header = true; }
      if (type === "todo") b.checked = false;
      var i = afterId ? findIdx(afterId) : body.blocks.length - 1;
      body.blocks.splice(i + 1, 0, b);
      session.touch();
      paint();
      focusBlock(b.id, false);
      return b;
    }
    function removeBlock(id) {
      var i = findIdx(id);
      if (i < 0) return;
      if (body.blocks.length === 1) { body.blocks[0].text = ""; body.blocks[0].type = "paragraph"; }
      else body.blocks.splice(i, 1);
      shell.pushUndo("ブロックの削除");
      session.touch();
      selBlock = null;
      paint();
      var prev = body.blocks[Math.max(0, i - 1)];
      if (prev) focusBlock(prev.id, true);
    }

    /* ── 操作の受け口 ─────────────────────────────────────────── */
    function bind() {
      /* ツールバーのボタンで選択が消えないようにする。
         これが無いと、文字を選んで色や太字を押しても何も起きない。 */
      U.keepSelection(api.root);
      /* 選択が変わるたびに覚えておく（メニュー越しの操作のため）。 */
      api.root.addEventListener("mouseup", rememberSel);
      api.root.addEventListener("keyup", function (e) {
        if (e.shiftKey || /^Arrow/.test(e.key) || (e.metaKey || e.ctrlKey)) rememberSel();
      });
      try { doc.addEventListener("selectionchange", rememberSel); } catch (e) {}

      /* 右クリック（長押しも同じ道） */
      api.root.addEventListener("contextmenu", function (e) {
        var b = e.target.closest ? e.target.closest(".wpd-b") : null;
        var inPage = e.target.closest ? e.target.closest(".wpd-page") : null;
        if (!inPage) return;
        e.preventDefault();
        rememberSel();
        if (b) selBlock = b.getAttribute("data-id");
        blockContextMenu(e.clientX, e.clientY);
      });

      api.root.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (t && api.root.contains(t)) {
          var act = t.getAttribute("data-act"), val = t.getAttribute("data-val");
          if (handle(act, val, t)) { e.preventDefault(); return; }
        }
        var inDoc = e.target.closest ? e.target.closest('[data-role="doc"]') : null;
        if (inDoc) {
          var cb = caretBlockEl();
          var nid = cb ? cb.getAttribute("data-id") : null;
          if (nid && nid !== selBlock) {
            selBlock = nid;
            var bar0 = api.root.querySelector(".wp-ctx");
            var nx0 = ctxBar();
            if (bar0) bar0.outerHTML = nx0;
            else if (nx0) api.root.querySelector(".wp-tools").insertAdjacentHTML("afterend", nx0);
          }
          return;
        }
        var b = e.target.closest ? e.target.closest(".wpd-b") : null;
        if (b) {
          var id = b.getAttribute("data-id");
          if (id !== selBlock) {
            var old = selBlock; selBlock = id;
            var oldEl = old && api.root.querySelector('.wpd-b[data-id="' + old + '"]');
            if (oldEl) oldEl.classList.remove("is-sel");
            b.classList.add("is-sel");
            var bar = api.root.querySelector(".wp-ctx");
            var next = ctxBar();
            if (bar) bar.outerHTML = next;
            else if (next) api.root.querySelector(".wp-tools").insertAdjacentHTML("afterend", next);
          }
        }
      });
      /* チェックボックス */
      api.root.addEventListener("change", function (e) {
        var ck = e.target.closest ? e.target.closest("[data-ck]") : null;
        if (!ck) return;
        var i = findIdx(ck.getAttribute("data-ck"));
        if (i < 0) return;
        body.blocks[i].checked = ck.checked;
        var host0 = ck.closest ? ck.closest(".wpd-todo") : null;
        if (host0) host0.classList.toggle("is-done", ck.checked);
        session.touch();
      });
      /* 文字の入力。ここでは描き直さない（カーソルが飛ぶため）。 */
      api.root.addEventListener("input", function (e) {
        /* 1 枚続きの入力欄。打つたびに描き直さない（カーソルが飛ぶため）。
           少し待ってから DOM を読み戻して保存する。 */
        var d0 = e.target.closest ? e.target.closest('[data-role="doc"]') : null;
        if (d0) {
          scheduleHarvest();
          var cc = e.target.closest ? e.target.closest("p,h1,h2,h3,h4,li,blockquote,pre,div") : null;
          if (cc) checkSlash(cc);
          scheduleBreaks();
          return;
        }
        var c = e.target.closest ? e.target.closest(".wpd-b__c") : null;
        if (c && c.hasAttribute("data-id")) {
          var i = findIdx(c.getAttribute("data-id"));
          if (i >= 0) { body.blocks[i].text = c.innerHTML; session.touch(); updateStatus(); }
          checkSlash(c);
          scheduleBreaks();
          return;
        }
        var cap = e.target.closest ? e.target.closest("[data-cap]") : null;
        if (cap) {
          var ci = findIdx(cap.getAttribute("data-cap"));
          if (ci >= 0) { body.blocks[ci].caption = cap.textContent; session.touch(); }
          return;
        }
        var cell = e.target.closest ? e.target.closest("[data-r]") : null;
        if (cell) {
          var tbl = cell.closest("[data-tbl]");
          var ti = findIdx(tbl.getAttribute("data-tbl"));
          if (ti >= 0) {
            var b2 = body.blocks[ti];
            var r = Number(cell.getAttribute("data-r")), cc = Number(cell.getAttribute("data-c"));
            if (b2.rows && b2.rows[r]) { b2.rows[r][cc] = cell.textContent; session.touch(); }
          }
        }
      });
      api.root.addEventListener("keydown", function (e) {
        var c = e.target.closest ? e.target.closest(".wpd-b__c") : null;
        if (!c || !c.hasAttribute("data-id")) return;
        var id = c.getAttribute("data-id"), i = findIdx(id);
        if (i < 0) return;
        var b = body.blocks[i];
        if (e.key === "Enter" && !e.shiftKey && b.type !== "code") {
          e.preventDefault();
          body.blocks[i].text = c.innerHTML;
          /* リストの中で改行したら、同じ種類のブロックを続ける。 */
          var next = ["bullet", "number", "todo"].indexOf(b.type) >= 0 ? b.type : "paragraph";
          if (["bullet", "number", "todo"].indexOf(b.type) >= 0 && !strip(b.text)) {
            setType(id, "paragraph");
            return;
          }
          insertBlock(next, id);
          return;
        }
        if (e.key === "Backspace" && !strip(c.innerHTML) && body.blocks.length > 1) {
          e.preventDefault();
          removeBlock(id);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          /* 表の中はセル移動。それ以外は字下げ。 */
          execFmt(e.shiftKey ? "outdent" : "indent");
        }
      });
      /* 表のセル間の移動 */
      api.root.addEventListener("keydown", function (e) {
        var cell = e.target.closest ? e.target.closest("td[data-r],th[data-r]") : null;
        if (!cell || e.key !== "Tab") return;
        e.preventDefault();
        var cells = Array.prototype.slice.call(cell.closest("table").querySelectorAll("[data-r]"));
        var k = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (cells[k]) cells[k].focus();
      });

      /* 文字の大きさ（数字の欄） */
      api.root.addEventListener("keydown", function (e) {
        var t = e.target.closest ? e.target.closest('[data-act="size"]') : null;
        if (!t || e.key !== "Enter") return;
        e.preventDefault();
        var n = Math.max(8, Math.min(120, Number(t.value) || 18));
        t.value = n;
        applyStyleToSelection("font-size:" + n + "px");
      });
      api.root.addEventListener("change", function (e) {
        var t = e.target.closest ? e.target.closest('[data-act="size"]') : null;
        if (!t) return;
        var n = Math.max(8, Math.min(120, Number(t.value) || 18));
        t.value = n;
        applyStyleToSelection("font-size:" + n + "px");
      });
      /* 選んだところの大きさを、数字の欄へ映す。 */
      api.root.addEventListener("mouseup", function () {
        var n = currentSize();
        var box = api.root.querySelector('[data-act="size"]');
        if (n && box && doc.activeElement !== box) box.value = n;
      });

      /* 表の列幅をマウスで変える */
      api.root.addEventListener("mousedown", startColResize);
      api.root.addEventListener("touchstart", startColResize, { passive: false });
    }

    /* ── 表の列幅（つまんで動かす）───────────────────────────── */
    function startColResize(ev) {
      var grip = ev.target.closest ? ev.target.closest("[data-grip]") : null;
      if (!grip) return;
      ev.preventDefault();
      ev.stopPropagation();
      var table = grip.closest("[data-tbl]");
      var id = table.getAttribute("data-tbl");
      var i = findIdx(id);
      if (i < 0) return;
      var b = body.blocks[i];
      var ci = Number(grip.getAttribute("data-grip"));
      var cols = table.querySelectorAll("col");
      var cells = table.querySelectorAll('tr:first-child > [data-c="' + ci + '"]');
      var startX = (ev.touches ? ev.touches[0].clientX : ev.clientX);
      var startW = cells[0] ? cells[0].getBoundingClientRect().width : 100;
      var nextCell = table.querySelector('tr:first-child > [data-c="' + (ci + 1) + '"]');
      var startNext = nextCell ? nextCell.getBoundingClientRect().width : 100;
      table.classList.add("is-resizing");
      shell.pushUndo("列幅の変更");

      function move(e2) {
        var x = (e2.touches ? e2.touches[0].clientX : e2.clientX);
        var d = x - startX;
        var w = Math.max(40, Math.round(startW + d));
        var wn = Math.max(40, Math.round(startNext - d));
        if (cols[ci]) cols[ci].style.width = w + "px";
        if (cols[ci + 1]) cols[ci + 1].style.width = wn + "px";
        if (e2.preventDefault) e2.preventDefault();
      }
      function end() {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", end);
        doc.removeEventListener("touchmove", move);
        doc.removeEventListener("touchend", end);
        table.classList.remove("is-resizing");
        /* 決まった幅をモデルへ残す（保存され、開き直しても同じ幅になる）。 */
        b.colW = Array.prototype.map.call(table.querySelectorAll("col"), function (c) {
          return Math.round(parseFloat(c.style.width) || 0);
        });
        session.touch();
      }
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", end);
      doc.addEventListener("touchmove", move, { passive: false });
      doc.addEventListener("touchend", end);
    }
    function updateStatus() {
      var el = api.root.querySelector(".wpd-stat");
      if (el) el.outerHTML = statusBar();
    }

    /* 「/」でブロックを選ぶ（§13.3） */
    var slashOpen = false;
    function checkSlash(c) {
      var txt = c.textContent || "";
      if (slashOpen) return;
      if (txt.charAt(txt.length - 1) !== "/") return;
      slashOpen = true;
      var id = c.getAttribute("data-id");
      var cmds = REG.forLevel(level()).map(function (d) {
        return { group: "ブロック", label: d.label, icon: d.icon, keywords: d.type,
          run: function () {
            var i = findIdx(id);
            if (i >= 0) {
              body.blocks[i].text = String(body.blocks[i].text).replace(/\/$/, "");
              if (strip(body.blocks[i].text) === "") { setType(id, d.type); return; }
            }
            insertBlock(d.type, id);
          } };
      });
      U.palette(api.root, cmds, { placeholder: "ブロックを選ぶ" });
      /* パレットが閉じたら、また「/」で開けるようにする。 */
      root.setTimeout(function () { slashOpen = false; }, 400);
    }

    function handle(act, val, t) {
      if (act === "fmt") { execFmt(val); return true; }
      if (act === "align") { execFmt("justify" + val); return true; }
      if (act === "type") { setType(caretBlockId() || selBlock, val); return true; }
      if (act === "toggle-left") { showLeft = !showLeft; paint(); return true; }
      if (act === "page-setup") { pageSettings(); return true; }
      if (act === "do-print") { doPrint(true); return true; }
      if (act === "do-pdf") { doPrint(false); return true; }
      if (act === "goto") {
        var el = api.root.querySelector('.wpd-b[data-id="' + val + '"]')
          || api.root.querySelector('.wpd-b[data-id="' + t.getAttribute("data-id") + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      if (act === "style-menu") { styleMenu(); return true; }
      if (act === "insert-menu") { insertMenu(); return true; }
      if (act === "color-menu") { colorMenu(t); return true; }
      if (act === "font-menu") { fontMenu(t); return true; }
      if (act === "symbol-menu") { symbolMenu(t); return true; }
      if (act === "enclose-menu") { encloseMenu(t); return true; }
      if (act === "size+") { bumpSize(2); return true; }
      if (act === "size-") { bumpSize(-2); return true; }
      if (act === "more-tools") { moreTools(); return true; }
      if (act === "outline-sheet") {
        U.sheet(api.root, { title: "アウトライン", html: outline(),
          onOpen: function (bodyEl, close) {
            bodyEl.addEventListener("click", function (e) {
              var g = e.target.closest ? e.target.closest('[data-act="goto"]') : null;
              if (!g) return;
              close();
              handle("goto", g.getAttribute("data-id"), g);
            });
          } });
        return true;
      }
      if (act === "link") { linkDialog(); return true; }
      if (act === "ai-panel") { toggleAi(); return true; }
      if (act === "ai-run") { runAi(t.getAttribute("data-id")); return true; }
      if (act === "block-menu") { blockMenu(t.getAttribute("data-id")); return true; }
      if (act === "dup-block") { dupBlock(); return true; }
      if (act === "del-block") { if (selBlock) removeBlock(selBlock); return true; }
      if (act === "tbl") { tableOp(val); return true; }
      if (act === "imgw") {
        var i = findIdx(selBlock);
        if (i >= 0) { body.blocks[i].width = Number(val); session.touch(); repaintBlock(selBlock); }
        return true;
      }
      if (act === "pick-img") { pickImage(t.getAttribute("data-id") || val || selBlock); return true; }
      if (act === "cmt-resolve") { comments[Number(val)].resolved = !comments[Number(val)].resolved;
        session.touch(); paint(); return true; }
      if (act === "cmt-del") { comments.splice(Number(val), 1); session.touch(); paint(); return true; }
      return false;
    }

    function styleMenu() {
      var defs = REG.forLevel(level()).filter(function (d) {
        return ["divider", "pagebreak", "image", "table", "toc"].indexOf(d.type) < 0;
      });
      U.sheet(api.root, {
        title: "文字のスタイル",
        html: defs.map(function (d) {
          return '<button type="button" class="wp-cmd__i" data-t="' + esc(d.type) + '">'
            + icon(d.icon) + "<span>" + esc(d.label) + "</span></button>";
        }).join(""),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-t]") : null;
            if (!b) return;
            close();
            if (selBlock) setType(selBlock, b.getAttribute("data-t"));
            else insertBlock(b.getAttribute("data-t"));
          });
        }
      });
    }
    function insertMenu() {
      var defs = REG.forLevel(level()).filter(function (d) {
        return ["image", "table", "divider", "pagebreak", "callout", "code", "quote", "toc", "math"]
          .indexOf(d.type) >= 0;
      });
      var extra = [{ type: "__date", label: "今日の日付", icon: "clock" },
        { type: "__cmt", label: "選んだ文字にコメント", icon: "info" }];
      U.sheet(api.root, {
        title: "挿入",
        html: defs.concat(extra).map(function (d) {
          return '<button type="button" class="wp-cmd__i" data-t="' + esc(d.type) + '">'
            + icon(d.icon) + "<span>" + esc(d.label) + "</span></button>";
        }).join(""),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-t]") : null;
            if (!b) return;
            close();
            var ty = b.getAttribute("data-t");
            if (ty === "__date") {
              var d = new Date();
              execFmt("insertText", d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日");
            } else if (ty === "__cmt") addComment();
            else if (ty === "image") { var nb = insertBlock("image", selBlock); pickImage(nb.id); }
            else insertBlock(ty, selBlock);
          });
        }
      });
    }
    /* 色を選ぶ小窓。ツールバーのすぐ下に出す。
       押した瞬間に選択が消えるのを避けるため、開く前に選択を控えておく。 */
    /* 文字色 → 背景の順に、自由に選べる色の窓を出す。 */
    /* 色は **1 段で出す**。
       以前は「色」→「文字の色 / 背景」→ 見本、と 2 段だった。
       段が増えるほど、その間に文字の選択が外れて何も起きなくなる
       （実際に「色が変えられない」と報告があった）。
       文字色と蛍光ペンを同じ窓に置き、選んだら即その場で当てる。 */
    function colorMenu(anchor) {
      rememberSel();
      var hasSel = selAlive(savedSel);
      var pos = anchorPos(anchor);
      U.colorPicker(api.root, pos.x, pos.y, {
        title: "文字の色と蛍光ペン",
        hint: hasSel ? "選んだ文字に当てます。" : "文字を選んでいないので、いまのブロック全体に当てます。",
        modes: [
          { id: "fore", label: "文字の色" },
          { id: "back", label: "蛍光ペン" }
        ],
        allowNone: true,
        noneLabel: "色をなくす",
        onPick: function (c, mode) {
          if (mode === "back") execFmt("hiliteColor", c || "transparent");
          else if (c) execFmt("foreColor", c);
          else execFmt("removeFormat");
        }
      });
    }
    /* 書体を選ぶ（自前の窓。選択が消えない） */
    function fontMenu(anchor) {
      rememberSel();
      var pos = anchorPos(anchor);
      U.fontPicker(api.root, pos.x, pos.y, {
        hint: selAlive(savedSel) ? "選んだ文字の書体を変えます。"
          : "文字を選んでいないので、いまのブロック全体に当てます。",
        onPick: function (id) {
          if (!id) return;
          var okDone = applyStyleToSelection("font-family:" + U.fontCss(id));
          var name = api.root.querySelector('[data-role="fontname"]');
          if (name) name.textContent = U.fontLabel(id) || "書体";
          if (!okDone) api.toast("当てる場所が分かりませんでした。文字を選んでからお試しください。", "warn", 4000);
        }
      });
    }
    /* 記号を選んで入れる */
    function symbolMenu(anchor) {
      rememberSel();
      var pos = anchorPos(anchor);
      var h = '<div class="wp-cp" style="width:320px">'
        + '<div class="wp-cp__hint">押すとカーソルの位置に入ります。</div>'
        + U.SYMBOLS.map(function (g, gi) {
          return '<div class="wp-cp__l">' + esc(g.name) + "</div><div class=\"wp-sym\">"
            + Array.from(g.chars).map(function (ch) {
              return '<button type="button" class="wp-sym__b" data-ch="' + esc(ch) + '">' + esc(ch) + "</button>";
            }).join("") + "</div>";
        }).join("") + "</div>";
      var pop = U.popup(api.root, pos.x, pos.y, h, "記号を入れる");
      pop.el.style.maxHeight = "56vh";
      pop.el.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-ch]") : null;
        if (!b) return;
        e.preventDefault();
        var ch = b.getAttribute("data-ch");
        /* 記号は「いまカーソルがある場所」へ入れる。
           前に選んだ範囲を戻してしまうと、その文字を消して置き換えてしまう
           （実測: 文章全部が記号 1 文字に化けた）。 */
        var live = U.selectionOf(api.shadow);
        var hasLive = live && live.rangeCount
          && live.getRangeAt(0).startContainer
          && live.getRangeAt(0).startContainer.isConnected;
        if (!hasLive) U.restoreSelection(api.shadow, caretSel);
        try { doc.execCommand("insertText", false, ch); } catch (er) {}
        syncFocusedBlock();
        rememberSel();
      });
    }
    /* 囲い文字（Word の「囲い文字」）。選んだ 1〜4 字を枠で囲む。 */
    function encloseMenu(anchor) {
      rememberSel();
      var sel = selectionText();
      var pos = anchorPos(anchor);
      if (!sel) {
        api.toast("囲みたい文字（1〜4 文字）を選んでから押してください。", "warn", 5000);
        return;
      }
      var h = '<div class="wp-cp" style="width:250px">'
        + '<div class="wp-cp__hint">「' + esc(sel.slice(0, 4)) + "」を囲みます。</div>"
        + U.ENCLOSE.map(function (d) {
          return '<button type="button" class="wp-cp__none" data-enc="' + d.id + '" style="margin-bottom:6px">'
            + U.encloseHtml(sel.slice(0, 2), d.id) + "<span>" + esc(d.label) + "</span></button>";
        }).join("") + "</div>";
      var pop = U.popup(api.root, pos.x, pos.y, h, "囲い文字");
      pop.el.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-enc]") : null;
        if (!b) return;
        e.preventDefault();
        pop.close();
        execFmt("insertHTML", U.encloseHtml(sel.slice(0, 4), b.getAttribute("data-enc")));
      });
    }
    function anchorPos(anchor) {
      if (anchor && anchor.getBoundingClientRect) {
        var r = anchor.getBoundingClientRect();
        return { x: r.left, y: r.bottom + 4 };
      }
      return { x: 120, y: 120 };
    }
    /* 小窓（右クリックのメニューと同じ土台を使い、中身だけ差し替える）。 */
    function popover(x, y, html, label) {
      U.closeContextMenu();
      var box = doc.createElement("div");
      box.className = "wp-ctxmenu";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", label || "");
      box.innerHTML = html;
      box.style.left = "-9999px"; box.style.top = "-9999px";
      api.root.appendChild(box);
      var w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = Math.max(6, Math.min(x, api.root.clientWidth - w - 6)) + "px";
      box.style.top = Math.max(6, Math.min(y, api.root.clientHeight - h - 6)) + "px";
      box.addEventListener("mousedown", function (e) { e.preventDefault(); });
      function close() {
        try { box.remove(); } catch (e) {}
        doc.removeEventListener("mousedown", outside, true);
      }
      function outside(e) {
        var p = e.composedPath ? e.composedPath() : [];
        if (p.indexOf(box) < 0) close();
      }
      root.setTimeout(function () { doc.addEventListener("mousedown", outside, true); }, 0);
      return { el: box, close: close };
    }

    /* 右クリックのメニュー（Docs） */
    function blockContextMenu(x, y) {
      var i = findIdx(selBlock);
      var b = i >= 0 ? body.blocks[i] : null;
      var hasSel = !!selectionText();
      var items = [
        { label: "太字", icon: "bold", hint: "Ctrl+B", disabled: !hasSel,
          run: function () { execFmt("bold"); } },
        { label: "斜体", icon: "italic", disabled: !hasSel, run: function () { execFmt("italic"); } },
        { label: "下線", icon: "underline", disabled: !hasSel, run: function () { execFmt("underline"); } },
        { label: "文字色と背景", icon: "palette", run: function () { colorMenu(null); } },
        { label: "リンクを付ける", icon: "link", disabled: !hasSel, run: linkDialog },
        { sep: true },
        { label: "スタイルを変える", icon: "type", run: styleMenu },
        { label: "ここに挿入", icon: "plus", run: insertMenu },
        { sep: true },
        { label: "上に 1 つ追加", icon: "plus", run: function () {
          if (i < 0) return;
          shell.pushUndo("ブロックの追加");
          body.blocks.splice(Math.max(0, i), 0, { id: M.uid("b"), type: "paragraph", text: "" });
          session.touch(); paint();
        } },
        { label: "下に 1 つ追加", icon: "plus", run: function () { insertBlock("paragraph", selBlock); } },
        { label: "上へ移動", icon: "chevronU", run: function () { move(selBlock, -1); } },
        { label: "下へ移動", icon: "chevronD", run: function () { move(selBlock, 1); } },
        { label: "このブロックを複製", icon: "copy", run: dupBlock },
        { sep: true },
        { label: "コメントを付ける", icon: "info", run: addComment },
        { label: "AI で書き直す", icon: "sparkle", run: function () { runAi("rewrite"); } },
        { sep: true },
        { label: "このブロックを削除", icon: "trash", danger: true,
          run: function () { if (selBlock) removeBlock(selBlock); } }
      ];
      if (b && b.type === "table") {
        items.splice(6, 0,
          { label: "行を追加", icon: "rows", run: function () { tableOp("row+"); } },
          { label: "列を追加", icon: "cols", run: function () { tableOp("col+"); } },
          { label: "行を削除", icon: "minus", run: function () { tableOp("row-"); } },
          { label: "列を削除", icon: "minus", run: function () { tableOp("col-"); } },
          { sep: true });
      }
      U.contextMenu(api.root, x, y, items, { title: "文章の操作" });
    }
    function moreTools() {
      var items = [
        { label: "検索と置換", icon: "search", run: findReplace },
        { label: "ページ設定", icon: "layout", run: pageSettings },
        { label: "目次を挿入", icon: "listUl", run: function () { insertBlock("toc", selBlock); } },
        { label: "書き出し（PDF / Markdown ほか）", icon: "download", run: exportSheet },
        { label: "ファイルから取り込み", icon: "upload", run: importSheet },
        { label: "変更履歴", icon: "history", run: function () { shell.openHistory(); } }
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
    function blockMenu(id) {
      selBlock = id;
      var items = [
        { label: "上に追加", icon: "plus", run: function () {
          var i = findIdx(id);
          shell.pushUndo("ブロックの追加");
          body.blocks.splice(Math.max(0, i), 0, { id: M.uid("b"), type: "paragraph", text: "" });
          session.touch(); paint();
        } },
        { label: "下に追加", icon: "plus", run: function () { insertBlock("paragraph", id); } },
        { label: "上へ移動", icon: "chevronD", run: function () { move(id, -1); } },
        { label: "下へ移動", icon: "chevronD", run: function () { move(id, 1); } },
        { label: "複製", icon: "copy", run: function () { selBlock = id; dupBlock(); } },
        { label: "削除", icon: "trash", run: function () { removeBlock(id); } }
      ];
      U.sheet(api.root, {
        title: "ブロックの操作",
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
    function move(id, d) {
      var i = findIdx(id), j = i + d;
      if (i < 0 || j < 0 || j >= body.blocks.length) return;
      shell.pushUndo("並べ替え");
      var tmp = body.blocks[i];
      body.blocks[i] = body.blocks[j];
      body.blocks[j] = tmp;
      session.touch();
      paint();
    }
    function dupBlock() {
      var i = findIdx(selBlock);
      if (i < 0) return;
      shell.pushUndo("複製");
      var c = JSON.parse(JSON.stringify(body.blocks[i]));
      c.id = M.uid("b");
      body.blocks.splice(i + 1, 0, c);
      session.touch();
      paint();
    }
    function tableOp(op) {
      var i = findIdx(selBlock);
      if (i < 0) return;
      var b = body.blocks[i];
      if (!b.rows) return;
      shell.pushUndo("表の変更");
      if (op === "row+") b.rows.push(b.rows[0].map(function () { return ""; }));
      else if (op === "row-" && b.rows.length > 1) b.rows.pop();
      else if (op === "col+") b.rows.forEach(function (r) { r.push(""); });
      else if (op === "col-" && b.rows[0].length > 1) b.rows.forEach(function (r) { r.pop(); });
      else if (op === "head") b.header = !b.header;
      session.touch();
      repaintBlock(selBlock);
    }
    function pickImage(id) {
      var inp = doc.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) {
          api.toast("画像が大きすぎます（3MB まで）。小さくしてからお試しください。", "error", 6000);
          return;
        }
        var fr = new root.FileReader();
        fr.onload = function () {
          var i = findIdx(id);
          if (i < 0) return;
          shell.pushUndo("画像の挿入");
          body.blocks[i].type = "image";
          body.blocks[i].src = fr.result;
          body.blocks[i].width = body.blocks[i].width || 100;
          body.blocks[i].alt = f.name;
          session.touch();
          repaintBlock(id);
        };
        fr.readAsDataURL(f);
      });
      inp.click();
    }
    function linkDialog() {
      var sel = selectionText();
      U.sheet(api.root, {
        title: "リンク",
        html: '<div class="wp-row"><label class="wp-lab" for="wpu">URL</label>'
          + '<input class="wp-in" id="wpu" placeholder="https://" /></div>'
          + '<div class="wp-lab">' + (sel ? "選んだ文字「" + esc(sel.slice(0, 24)) + "」にリンクを付けます。"
            : "文字を選んでから使うと、その文字にリンクが付きます。") + "</div>"
          + btn({ label: "リンクを付ける", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            var u = bodyEl.querySelector("#wpu").value.trim();
            if (!u) return;
            close();
            execFmt("createLink", u);
          });
        }
      });
    }
    function addComment() {
      var q = selectionText();
      U.sheet(api.root, {
        title: "コメント",
        html: '<div class="wp-lab">' + (q ? "「" + esc(q.slice(0, 40)) + "」について" : "文書全体について") + "</div>"
          + '<textarea class="wp-ta" id="wpc" placeholder="気づいたことを書きます"></textarea>'
          + btn({ label: "追加する", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            var v = bodyEl.querySelector("#wpc").value.trim();
            if (!v) return;
            comments.push({ id: M.uid("c"), text: v, quote: q, at: M.nowIso(), resolved: false });
            session.touch();
            close();
            paint();
          });
        }
      });
    }
    function findReplace() {
      U.sheet(api.root, {
        title: "検索と置換",
        html: '<div class="wp-row"><label class="wp-lab" for="wpf1">探す文字</label>'
          + '<input class="wp-in" id="wpf1" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="wpf2">置き換える文字</label>'
          + '<input class="wp-in" id="wpf2" /></div>'
          + '<div class="wp-inline">' + btn({ label: "件数を数える", act: "count", variant: "outline" })
          + btn({ label: "すべて置換", act: "all", variant: "primary" }) + "</div>"
          + '<div class="wp-lab" data-role="r" style="margin-top:10px"></div>',
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-act]") : null;
            if (!t) return;
            var q = bodyEl.querySelector("#wpf1").value;
            if (!q) return;
            var out = bodyEl.querySelector('[data-role="r"]');
            var n = 0;
            body.blocks.forEach(function (b) {
              n += (String(b.text || "").split(q).length - 1);
              if (b.rows) b.rows.forEach(function (r) { r.forEach(function (c) { n += (String(c).split(q).length - 1); }); });
            });
            if (t.getAttribute("data-act") === "count") { out.textContent = n + " 件見つかりました。"; return; }
            if (!n) { out.textContent = "見つかりませんでした。"; return; }
            var rep = bodyEl.querySelector("#wpf2").value;
            shell.pushUndo("置換");
            body.blocks.forEach(function (b) {
              if (b.text) b.text = String(b.text).split(q).join(rep);
              if (b.rows) b.rows = b.rows.map(function (r) {
                return r.map(function (c) { return String(c).split(q).join(rep); }); });
            });
            session.touch();
            close();
            paint();
            api.toast(n + " 件を置き換えました", "ok");
          });
        }
      });
    }
    /* ── ページ設定（用紙・向き・余白）─────────────────────────
       Word と同じ順番で並べる: 用紙 → 向き → 余白 → ヘッダー/フッター。
       変えるたびにその場で紙が変わる（決定ボタンを押させない）。 */
    function pageSettings() {
      var pg = body.page;
      var P = WP.paper;
      function sizeOpts() {
        return P.SIZE_ORDER.map(function (k) {
          var s = P.SIZES[k];
          var mm = k === "custom" ? "" : "（" + s.w + "×" + s.h + "mm）";
          return '<option value="' + k + '"' + (pg.size === k ? " selected" : "") + ">"
            + esc(s.label) + mm + "</option>";
        }).join("");
      }
      function marginOpts() {
        return P.MARGIN_ORDER.map(function (k) {
          var m = P.MARGINS[k];
          var mm = k === "custom" ? "" : "（上下 " + m.t + "・左右 " + m.l + "mm）";
          return '<option value="' + k + '"' + (pg.marginPreset === k ? " selected" : "") + ">"
            + esc(m.label) + mm + "</option>";
        }).join("");
      }
      function bodyHtml() {
        var inn = P.innerMm(pg), sz = P.sizeMm(pg);
        return '<div class="wp-row"><label class="wp-lab" for="pm">表示のしかた</label>'
          + '<select class="wp-sel" id="pm" data-k="mode">'
          + '<option value="paper"' + (pg.mode === "paper" ? " selected" : "") + ">紙として出す（おすすめ）</option>"
          + '<option value="flow"' + (pg.mode === "flow" ? " selected" : "") + ">画面いっぱい（紙にしない）</option>"
          + "</select></div>"
          + '<div class="wp-row"><label class="wp-lab" for="ps">用紙のサイズ</label>'
          + '<select class="wp-sel" id="ps" data-k="size">' + sizeOpts() + "</select></div>"
          + (pg.size === "custom"
            ? '<div class="wp-inline" style="gap:8px">'
              + '<div class="wp-row" style="flex:1"><label class="wp-lab" for="pcw">幅（mm）</label>'
              + '<input class="wp-in" id="pcw" type="number" min="50" max="1000" step="1" value="'
              + pg.customW + '" data-k="customW" /></div>'
              + '<div class="wp-row" style="flex:1"><label class="wp-lab" for="pch">高さ（mm）</label>'
              + '<input class="wp-in" id="pch" type="number" min="50" max="1000" step="1" value="'
              + pg.customH + '" data-k="customH" /></div></div>' : "")
          + '<div class="wp-row"><span class="wp-lab">向き</span>'
          + '<div class="wp-seg" role="group" aria-label="用紙の向き">'
          + '<button type="button" class="wp-seg__b' + (pg.orient === "portrait" ? " is-on" : "")
          + '" data-orient="portrait">' + icon("file") + " 縦</button>"
          + '<button type="button" class="wp-seg__b' + (pg.orient === "landscape" ? " is-on" : "")
          + '" data-orient="landscape">' + icon("layout") + " 横</button></div></div>"
          + '<div class="wp-row"><label class="wp-lab" for="pmg">余白</label>'
          + '<select class="wp-sel" id="pmg" data-k="marginPreset">' + marginOpts() + "</select></div>"
          + (pg.marginPreset === "custom"
            ? '<div class="wp-inline" style="gap:6px;flex-wrap:wrap">'
              + ["t:上", "b:下", "l:左", "r:右"].map(function (x) {
                var k = x.split(":")[0], lab = x.split(":")[1];
                return '<div class="wp-row" style="flex:1 1 42%"><label class="wp-lab" for="pm' + k + '">'
                  + lab + "（mm）</label>"
                  + '<input class="wp-in" id="pm' + k + '" type="number" min="0" max="80" step="0.5" value="'
                  + pg.margin[k] + '" data-m="' + k + '" /></div>';
              }).join("") + "</div>" : "")
          + '<div class="wp-lab" style="margin:4px 0 10px">文字が入る範囲 '
          + Math.round(inn.w) + "×" + Math.round(inn.h) + "mm"
          + "（用紙 " + Math.round(sz.w) + "×" + Math.round(sz.h) + "mm）</div>"
          + '<div class="wp-row"><label class="wp-lab" for="ph">ヘッダー（各ページの上）</label>'
          + '<input class="wp-in" id="ph" value="' + esc(pg.header || "") + '" data-k="header" placeholder="例: 2026年度 学年だより" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="pf">フッター（各ページの下）</label>'
          + '<input class="wp-in" id="pf" value="' + esc(pg.footer || "") + '" data-k="footer" /></div>'
          + '<label class="wp-switch"><input type="checkbox" data-k="pageNumber"'
          + (pg.pageNumber ? " checked" : "") + " />ページ番号を入れる</label>"
          + (pg.pageNumber
            ? '<div class="wp-row"><label class="wp-lab" for="pnf">番号の出し方</label>'
              + '<select class="wp-sel" id="pnf" data-k="pageNumberFormat">'
              + '<option value="n"' + (pg.pageNumberFormat === "n" ? " selected" : "") + ">1、2、3…</option>"
              + '<option value="n-of-m"' + (pg.pageNumberFormat === "n-of-m" ? " selected" : "") + ">1 / 5</option>"
              + "</select></div>" : "")
          + '<div class="wp-inline" style="margin-top:12px;gap:8px;flex-wrap:wrap">'
          + btn({ label: "印刷する", icon: "printer", variant: "primary", act: "print" })
          + btn({ label: "PDF にする", icon: "download", act: "pdf", variant: "outline" })
          + "</div>";
      }
      var box = U.sheet(api.root, { title: "ページ設定", html: bodyHtml() });
      box.body.addEventListener("input", apply);
      box.body.addEventListener("change", apply);
      box.body.addEventListener("click", function (e) {
        var o = e.target.closest ? e.target.closest("[data-orient]") : null;
        if (o) { pg.orient = o.getAttribute("data-orient"); after(true); return; }
        var a = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!a) return;
        var k = a.getAttribute("data-act");
        if (k === "print") { box.close(); doPrint(true); }
        if (k === "pdf") { box.close(); doPrint(false); }
      });
      function apply(e) {
        var t = e.target.closest ? e.target.closest("[data-k],[data-m]") : null;
        if (!t) return;
        var redraw = false;
        if (t.hasAttribute("data-m")) {
          pg.margin[t.getAttribute("data-m")] = Number(t.value) || 0;
          pg.marginPreset = "custom";
        } else {
          var k = t.getAttribute("data-k");
          var v = t.type === "checkbox" ? t.checked : (t.type === "number" ? Number(t.value) : t.value);
          pg[k] = v;
          if (k === "marginPreset" && WP.paper.MARGINS[v] && v !== "custom") {
            var m = WP.paper.MARGINS[v];
            pg.margin = { t: m.t, r: m.r, b: m.b, l: m.l };
          }
          /* 選び直しで下に出る欄が変わるものは、中身ごと描き直す */
          if (k === "mode") pg.modeChosen = true;   /* 自分で選んだ、と覚える */
          if (k === "size" || k === "marginPreset" || k === "pageNumber" || k === "mode") redraw = true;
        }
        after(redraw);
      }
      function after(redraw) {
        body.page = pg = WP.paper.normalize(pg);
        session.touch();
        paint();
        if (redraw) { box.body.innerHTML = bodyHtml(); }
        else {
          var lab = box.body.querySelector(".wp-lab + .wp-lab, .wp-lab");
          /* 文字の入る範囲の表示だけ更新する */
          var inn = WP.paper.innerMm(pg), sz = WP.paper.sizeMm(pg);
          Array.prototype.forEach.call(box.body.querySelectorAll(".wp-lab"), function (n) {
            if (/文字が入る範囲/.test(n.textContent))
              n.textContent = "文字が入る範囲 " + Math.round(inn.w) + "×" + Math.round(inn.h)
                + "mm（用紙 " + Math.round(sz.w) + "×" + Math.round(sz.h) + "mm）";
          });
          void lab;
        }
      }
    }

    /* ── 印刷 / PDF ───────────────────────────────────────────
       別の窓を開いて、そこで実際に紙へ割り付ける（paper.js）。
       割り付けを自分でやるのは、ページ番号とヘッダー・フッターを
       1 枚ごとに正しい位置へ置くため。
       書体は **読み込みが終わってから** 開く。先に開くと代わりの書体で刷られる。 */
    function doPrint(autoPrint) {
      var ids = usedFontIds();
      var hrefs = U.fontCssHrefs ? U.fontCssHrefs(ids) : [];
      var fam = "";
      try {
        var f0 = body.font && U.fontFamilyOf ? U.fontFamilyOf(body.font) : "";
        fam = f0 ? '"' + f0 + '","Noto Sans JP",sans-serif' : '"Noto Sans JP","Hiragino Sans",sans-serif';
      } catch (e) { fam = '"Noto Sans JP","Hiragino Sans",sans-serif'; }

      var w = root.open("", "_blank");
      if (!w) {
        api.toast("別のタブを開けませんでした。ポップアップの許可をご確認ください。", "error", 7000);
        return;
      }
      w.document.write('<!doctype html><meta charset="utf-8"><title>準備しています…</title>'
        + '<body style="font:15px/1.7 sans-serif;color:#475569;padding:40px">紙面を組み立てています…</body>');
      var ready = U.fontReady ? U.fontReady(ids, 6000) : Promise.resolve();
      ready.then(function () {
        var html = WP.paper.printDoc({
          page: body.page,
          title: item.title,
          bodyHtml: printBodyHtml(),
          fontFamily: fam,
          fontCssHrefs: hrefs,
          fontSize: 10.5,
          lineHeight: 1.9
        });
        try {
          w.document.open();
          w.document.write(autoPrint ? html.replace("</body>", "<script>location.hash='#print'<\/script></body>") : html);
          w.document.close();
          if (autoPrint) {
            /* 割り付けが終わってから刷る。終わりは __vqReady が立つ。 */
            var n = 0, iv = w.setInterval(function () {
              if (w.__vqReady || ++n > 60) { w.clearInterval(iv); try { w.focus(); w.print(); } catch (e) {} }
            }, 100);
          }
        } catch (e) {
          api.toast("印刷用の画面を作れませんでした。", "error", 6000);
        }
      });
    }
    /* 印刷へ渡す中身。画面の HTML ではなく、紙のための組み方で作り直す。 */
    function printBodyHtml() {
      var n = 0;
      return body.blocks.map(function (b) {
        var t = String(b.text || "");
        if (b.type === "number") n++; else n = 0;
        switch (b.type) {
          case "heading1": return "<h1>" + t + "</h1>";
          case "heading2": return "<h2>" + t + "</h2>";
          case "heading3": return "<h3>" + t + "</h3>";
          case "heading4": return "<h4>" + t + "</h4>";
          case "bullet": return "<ul><li>" + t + "</li></ul>";
          case "number": return "<ol start='" + n + "'><li>" + t + "</li></ol>";
          case "todo": return "<p>" + (b.checked ? "☑" : "☐") + " " + t + "</p>";
          case "quote": return "<blockquote>" + t + "</blockquote>";
          case "code": return "<pre>" + esc(strip(t)) + "</pre>";
          case "callout": return "<div class='callout'>" + t + "</div>";
          case "divider": return "<hr>";
          case "pagebreak": return "<div class='brk'></div>";
          case "image": return b.src
            ? "<figure><img src='" + esc(b.src) + "' style='width:" + (b.width || 100) + "%'>"
              + (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure>" : "";
          case "table":
            return "<table>" + (b.rows || []).map(function (r, ri) {
              return "<tr>" + r.map(function (c) {
                return (b.header && ri === 0) ? "<th>" + esc(c) + "</th>" : "<td>" + esc(c) + "</td>";
              }).join("") + "</tr>";
            }).join("") + "</table>";
          default: return "<p>" + (t || "&nbsp;") + "</p>";
        }
      }).join("\n");
    }

    /* ── 書き出し・取り込み（§13.10）──────────────────────────── */
    function toMarkdown() {
      var out = [];
      var n = 0;
      body.blocks.forEach(function (b) {
        var t = strip(b.text);
        if (b.type === "number") n++; else n = 0;
        switch (b.type) {
          case "heading1": out.push("# " + t); break;
          case "heading2": out.push("## " + t); break;
          case "heading3": out.push("### " + t); break;
          case "heading4": out.push("#### " + t); break;
          case "bullet": out.push("- " + t); break;
          case "number": out.push(n + ". " + t); break;
          case "todo": out.push("- [" + (b.checked ? "x" : " ") + "] " + t); break;
          case "quote": out.push("> " + t); break;
          case "code": out.push("```\n" + t + "\n```"); break;
          case "callout": out.push("> **メモ** " + t); break;
          case "divider": out.push("---"); break;
          case "pagebreak": out.push("\n<!-- 改ページ -->\n"); break;
          case "image": out.push("![" + (b.alt || "") + "](" + (b.src ? "画像" : "") + ")"); break;
          case "table":
            (b.rows || []).forEach(function (r, ri) {
              out.push("| " + r.join(" | ") + " |");
              if (ri === 0 && b.header) out.push("|" + r.map(function () { return " --- "; }).join("|") + "|");
            });
            break;
          default: out.push(t);
        }
        out.push("");
      });
      return out.join("\n");
    }
    function toHtml(forPrint) {
      var n = 0;
      var inner = body.blocks.map(function (b) {
        if (b.type === "number") n++; else n = 0;
        var t = b.text || "";
        switch (b.type) {
          case "heading1": return "<h1>" + t + "</h1>";
          case "heading2": return "<h2>" + t + "</h2>";
          case "heading3": return "<h3>" + t + "</h3>";
          case "heading4": return "<h4>" + t + "</h4>";
          case "bullet": return "<ul><li>" + t + "</li></ul>";
          case "number": return "<ol start='" + n + "'><li>" + t + "</li></ol>";
          case "todo": return "<p><input type=checkbox " + (b.checked ? "checked" : "") + " disabled> " + t + "</p>";
          case "quote": return "<blockquote>" + t + "</blockquote>";
          case "code": return "<pre><code>" + esc(strip(t)) + "</code></pre>";
          case "callout": return "<div class='callout'>" + t + "</div>";
          case "divider": return "<hr>";
          case "pagebreak": return "<div style='page-break-after:always'></div>";
          case "image": return b.src ? "<figure><img src='" + b.src + "' style='width:" + (b.width || 100)
            + "%'><figcaption>" + esc(b.caption || "") + "</figcaption></figure>" : "";
          case "table":
            return "<table>" + (b.rows || []).map(function (r, ri) {
              return "<tr>" + r.map(function (c) {
                return (b.header && ri === 0) ? "<th>" + esc(c) + "</th>" : "<td>" + esc(c) + "</td>";
              }).join("") + "</tr>";
            }).join("") + "</table>";
          default: return "<p>" + t + "</p>";
        }
      }).join("\n");
      var css = "body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.9;color:#1e293b;"
        + "max-width:" + (body.page.width || 800) + "px;margin:0 auto;padding:40px 24px}"
        + "h1{font-size:28px;margin:24px 0 12px}h2{font-size:22px;margin:20px 0 10px}"
        + "h3{font-size:18px;margin:16px 0 8px}h4{font-size:16px;margin:14px 0 6px}"
        + "table{border-collapse:collapse;width:100%;margin:12px 0}"
        + "td,th{border:1px solid #cbd5e1;padding:8px 10px}th{background:#f1f5f9}"
        + "blockquote{border-left:3px solid #cbd5e1;padding-left:14px;color:#475569;margin:12px 0}"
        + "pre{background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto}"
        + ".callout{background:#eef2ff;padding:12px 14px;border-radius:8px;margin:12px 0}"
        + "img{max-width:100%}figcaption{font-size:12px;color:#64748b}";
      return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><title>" + esc(item.title)
        + "</title><style>" + css + "</style></head><body>"
        + (body.page.header ? "<div style='color:#64748b;font-size:12px'>" + esc(body.page.header) + "</div>" : "")
        + "<h1 style='margin-top:0'>" + esc(item.title) + "</h1>" + inner
        + (body.page.footer ? "<div style='color:#64748b;font-size:12px;margin-top:24px'>" + esc(body.page.footer) + "</div>" : "")
        + (forPrint ? "<script>window.onload=function(){window.print()}<\/script>" : "")
        + "</body></html>";
    }
    function download(name, mime, text) {
      try {
        var blob = new root.Blob([text], { type: mime });
        var a = doc.createElement("a");
        a.href = root.URL.createObjectURL(blob);
        a.download = name;
        doc.body.appendChild(a);
        a.click();
        root.setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return true;
      } catch (e) { return false; }
    }
    function exportSheet() {
      var opts = [
        { id: "txt", label: "テキスト（.txt）" },
        { id: "md", label: "Markdown（.md）" },
        { id: "html", label: "HTML（.html）" },
        { id: "pdf", label: "PDF（印刷ダイアログから保存）" }
      ];
      U.sheet(api.root, {
        title: "書き出し",
        html: opts.map(function (x) {
          return '<button type="button" class="wp-cmd__i" data-f="' + x.id + '">'
            + icon("download") + "<span>" + esc(x.label) + "</span></button>";
        }).join("")
          + '<div class="wp-lab" style="margin-top:10px">DOCX への書き出しは未実装です。'
          + "いまは HTML で書き出して Word で開いてください。</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-f]") : null;
            if (!b) return;
            close();
            var f = b.getAttribute("data-f");
            var base = (item.title || "文書").replace(/[\/\\:*?"<>|]/g, "_");
            if (f === "txt") download(base + ".txt", "text/plain;charset=utf-8", plainAll());
            else if (f === "md") download(base + ".md", "text/markdown;charset=utf-8", toMarkdown());
            else if (f === "html") download(base + ".html", "text/html;charset=utf-8", toHtml(false));
            else if (f === "pdf") {
              var w = root.open("", "_blank");
              if (!w) { api.toast("別のタブを開けませんでした。ポップアップの許可をご確認ください。", "error", 6000); return; }
              w.document.write(toHtml(true));
              w.document.close();
            }
            api.toast("書き出しました", "ok");
          });
        }
      });
    }
    function importSheet() {
      var inp = doc.createElement("input");
      inp.type = "file";
      inp.accept = ".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new root.FileReader();
        fr.onload = function () {
          var text = String(fr.result || "");
          var newBlocks = /\.html?$/i.test(f.name) ? fromHtml(text) : fromMarkdown(text);
          if (!newBlocks.length) { api.toast("取り込める内容がありませんでした。", "warn"); return; }
          api.confirm({ title: "取り込みますか",
            message: newBlocks.length + " ブロックを、いまの文書の末尾に足します。",
            okText: "取り込む" }).then(function (yes) {
            if (!yes) return;
            shell.pushUndo("取り込み");
            body.blocks = body.blocks.concat(newBlocks);
            session.touch();
            paint();
            api.toast(newBlocks.length + " ブロックを取り込みました", "ok");
          });
        };
        fr.readAsText(f);
      });
      inp.click();
    }
    function fromMarkdown(text) {
      var out = [];
      String(text).split(/\r?\n/).forEach(function (line) {
        var t = line.replace(/\s+$/, "");
        if (!t.trim()) return;
        var m;
        if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) out.push({ id: M.uid("b"), type: "heading" + m[1].length, text: esc(m[2]) });
        else if (/^[-*]\s+\[[ xX]\]\s+/.test(t))
          out.push({ id: M.uid("b"), type: "todo", text: esc(t.replace(/^[-*]\s+\[[ xX]\]\s+/, "")),
            checked: /\[[xX]\]/.test(t) });
        else if (/^[-*+]\s+/.test(t)) out.push({ id: M.uid("b"), type: "bullet", text: esc(t.replace(/^[-*+]\s+/, "")) });
        else if (/^\d+\.\s+/.test(t)) out.push({ id: M.uid("b"), type: "number", text: esc(t.replace(/^\d+\.\s+/, "")) });
        else if (/^>\s?/.test(t)) out.push({ id: M.uid("b"), type: "quote", text: esc(t.replace(/^>\s?/, "")) });
        else if (/^(-{3,}|\*{3,})$/.test(t)) out.push({ id: M.uid("b"), type: "divider", text: "" });
        else out.push({ id: M.uid("b"), type: "paragraph", text: esc(t) });
      });
      return out;
    }
    function fromHtml(text) {
      var d = doc.createElement("div");
      /* script と style は落とす（取り込んだ HTML をそのまま動かさない §26）。 */
      d.innerHTML = String(text).replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "");
      var out = [];
      Array.prototype.forEach.call(d.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre,hr,table"), function (n) {
        var tag = n.tagName.toLowerCase();
        var t = (n.textContent || "").trim();
        if (tag === "hr") { out.push({ id: M.uid("b"), type: "divider", text: "" }); return; }
        if (tag === "table") {
          var rows = Array.prototype.map.call(n.querySelectorAll("tr"), function (tr) {
            return Array.prototype.map.call(tr.querySelectorAll("td,th"), function (c) {
              return (c.textContent || "").trim(); });
          });
          if (rows.length) out.push({ id: M.uid("b"), type: "table", text: "", rows: rows, header: true });
          return;
        }
        if (!t) return;
        var type = { h1: "heading1", h2: "heading2", h3: "heading3", h4: "heading4",
          li: "bullet", blockquote: "quote", pre: "code" }[tag] || "paragraph";
        out.push({ id: M.uid("b"), type: type, text: esc(t) });
      });
      return out;
    }

    /* ── AI（§13.9）──────────────────────────────────────────── */
    function toggleAi(force) {
      showAi = force === undefined ? !showAi : force;
      if (VQ2.ui.isMobile()) {
        U.sheet(api.root, { title: "AI アシスタント", html: aiPanel(),
          onOpen: function (bodyEl, close) {
            bodyEl.addEventListener("click", function (e) {
              var b = e.target.closest ? e.target.closest('[data-act="ai-run"]') : null;
              if (!b) return;
              close();
              runAi(b.getAttribute("data-id"));
            });
          } });
        return;
      }
      paint();
    }
    function runAi(actionId) {
      var scope = currentScope();
      if (!String(scope.text || "").trim()) {
        api.toast("文章がありません。何か書いてからお試しください。", "warn");
        return;
      }
      WP.ai.run({
        api: api, itemType: "document", actionId: actionId, scope: scope, item: item,
        onApply: function (newText, mode) {
          shell.pushUndo("AI の適用");
          harvestNow();
          var made = fromMarkdown(newText);
          if (!made.length) made = [{ id: M.uid("b"), type: "paragraph", text: esc(newText) }];

          if (mode === "replaceAll") {
            body.blocks = made;
          } else if (scope.kind === "block" && scope.blockId && mode !== "append") {
            /* カーソルのある段落を、作られたものへ差し替える。
               1 行だけならその段落を書き換え、複数行なら入れ替える。 */
            var i = findIdx(scope.blockId);
            if (i < 0) body.blocks = body.blocks.concat(made);
            else if (made.length === 1) body.blocks[i].text = made[0].text;
            else body.blocks.splice.apply(body.blocks, [i, 1].concat(made));
          } else if (scope.kind === "selection" && mode !== "append") {
            /* 選んだところだけを置き換える。文書ぜんたいを作り直さない。 */
            var plain = made.map(function (b) { return strip(b.text); }).join("\n");
            if (!replaceSelectionText(plain)) body.blocks = body.blocks.concat(made);
            harvestNow();
          } else {
            body.blocks = body.blocks.concat(made);
          }
          if (!body.blocks.length) body.blocks = [{ id: M.uid("b"), type: "paragraph", text: "" }];
          session.touch();
          paint();
        },
        onConvert: function (targetId) {
          api.toast("変換しています…", "info");
          session.saveNow().then(function () {
            return WP.convert.run(targetId, item, session.content);
          }).then(function (r) {
            api.toast("「" + r.item.title + "」を作りました", "ok", 4000);
          }).catch(function (e) { api.toast("変換できませんでした: " + e.message, "error", 6000); });
        }
      });
    }

    function registerCommands() {
      var cmds = [];
      REG.all().forEach(function (d) {
        cmds.push({ group: "挿入", label: d.label + " を追加", icon: d.icon,
          run: function () { insertBlock(d.type, caretBlockId() || selBlock); } });
      });
      cmds.push({ group: "書式", label: "太字", icon: "bold", run: function () { execFmt("bold"); } });
      cmds.push({ group: "書式", label: "斜体", icon: "italic", run: function () { execFmt("italic"); } });
      cmds.push({ group: "書式", label: "下線", icon: "underline", run: function () { execFmt("underline"); } });
      cmds.push({ group: "書式", label: "取り消し線", icon: "strike",
        run: function () { execFmt("strikeThrough"); } });
      COLORS.forEach(function (c) {
        cmds.push({ group: "書式", label: "文字色 " + c, icon: "palette", keywords: "color いろ 色",
          run: function () { execFmt("foreColor", c); } });
      });
      cmds.push({ group: "書式", label: "文字色と背景を選ぶ", icon: "palette",
        run: function () { colorMenu(null); } });
      cmds.push({ group: "文書", label: "検索と置換", icon: "search", run: findReplace });
      cmds.push({ group: "文書", label: "ページ設定", icon: "layout", run: pageSettings });
      cmds.push({ group: "文書", label: "アウトラインの表示切替", icon: "listUl",
        run: function () { showLeft = !showLeft; paint(); } });
      cmds.push({ group: "書き出し", label: "PDF で出力", icon: "download",
        run: function () {
          var w = root.open("", "_blank");
          if (!w) { api.toast("別のタブを開けませんでした。", "error"); return; }
          w.document.write(toHtml(true)); w.document.close();
        } });
      cmds.push({ group: "書き出し", label: "Markdown で保存", icon: "download",
        run: function () { download((item.title || "文書") + ".md", "text/markdown;charset=utf-8", toMarkdown()); } });
      cmds.push({ group: "書き出し", label: "HTML で保存", icon: "download",
        run: function () { download((item.title || "文書") + ".html", "text/html;charset=utf-8", toHtml(false)); } });
      cmds.push({ group: "取り込み", label: "ファイルから取り込み", icon: "upload", run: importSheet });
      WP.convert.targetsFor("document").forEach(function (t) {
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

  WP.docs = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
