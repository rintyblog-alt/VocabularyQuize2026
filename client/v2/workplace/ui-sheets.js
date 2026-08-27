/* ══════════════════════════════════════════════════════════════════════
   VocabuSheets（§14）

   ・HTML の表を並べただけにしない。セルは {v, f, s}（値・数式・書式）で持ち、
     数式は formula.js が計算する。行列の追加・並べ替え・絞り込みも実データを動かす。
   ・画面に出す行数は見えているぶんだけ（仮想化）。1 万行でも重くならない。
   ・関数の一覧は Registry から作る。画面へ関数名を書き並べない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, F = WP.formula, CH = WP.chart;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  var CELL_W = 96, CELL_H = 26, HEAD_W = 44;

  function open(o) {
    o = o || {};
    var item = o.item, content = o.content;
    var body = content.content;
    if (!body.sheets || !body.sheets.length) body.sheets = [M.newSheet("シート1")];
    if (!body.charts) body.charts = [];
    var si = Math.min(body.activeSheet || 0, body.sheets.length - 1);

    var session = ST.session(item, content, { intervalMs: ST.prefs().autosaveMs,
      autosave: ST.prefs().autosave });
    var shell = new U.EditorShell({ session: session, onClose: o.onClose,
      onRestore: function () { body = session.content.content; si = 0; recalc(); paint(); },
      onAi: function () { aiSheet(); },
      onModeChange: function () { paint(); },
      moreItems: [
        { label: "CSV / TSV で書き出し", icon: "download", run: exportSheet },
        { label: "CSV を取り込む", icon: "upload", run: importCsv },
        { label: "グラフを作る", icon: "chart", run: chartDialog }
      ] });

    var api = VQ2.ui.mount("vq-wp-sheets", { title: item.title, css: WP.CSS || "",
      onBeforeClose: function () { shell.tryClose(); return false; } });

    var sel = { r: 1, c: 0, r2: 1, c2: 0 };   /* 1-based row, 0-based col */
    var computed = {}, editing = null, showRight = false, rightTab = "fx";
    var scrollTop = 0, scrollLeft = 0;

    function sheet() { return body.sheets[si]; }
    function ref(r, c) { return M.colName(c) + r; }
    function cell(r, c) { return sheet().cells[ref(r, c)] || null; }
    function setCell(r, c, patch) {
      var k = ref(r, c), s = sheet();
      var cur = s.cells[k] || {};
      var next = Object.assign({}, cur, patch);
      if ((next.v === "" || next.v === undefined) && !next.f && !next.s) delete s.cells[k];
      else s.cells[k] = next;
    }
    function recalc() {
      var r = F.recalc(sheet());
      computed = r.values;
      return r;
    }
    recalc();
    paint();
    shell.bindHeader(api.root, api);
    bind();
    registerCommands();

    /* ── 描画 ─────────────────────────────────────────────────── */
    function paint() {
      api.root.innerHTML = '<div class="wp">' + shell.headerHtml() + toolbar() + formulaBar()
        + '<div class="wp-body">'
        + '<div class="wp-main" data-role="scroll" style="overflow:auto"><div data-role="grid"></div></div>'
        + (showRight ? '<aside class="wp-right" data-role="right">' + rightPanel() + "</aside>" : "")
        + "</div>" + tabsBar() + mobileBar() + "</div>";
      shell.host = api.root;
      shell.syncUndoButtons();
      var sc = api.root.querySelector('[data-role="scroll"]');
      sc.addEventListener("scroll", onScroll);
      sc.scrollTop = scrollTop;
      sc.scrollLeft = scrollLeft;
      drawGrid();
      shell.syncUndoButtons();
      /* 画面を作り直したら、見えない入力欄も置き直す（ここが無いと打てなくなる）。 */
      ghost = null; ghostLive = false; editing = null;
      placeGhost(false);
    }
    function toolbar() {
      var lv = shell.mode;
      var h = '<div class="wp-tools">';
      h += btn({ icon: "bold", iconOnly: true, label: "太字", act: "s", val: "b" })
        + btn({ icon: "italic", iconOnly: true, label: "斜体", act: "s", val: "i" })
        + btn({ icon: "underline", iconOnly: true, label: "下線", act: "s", val: "u" })
        + btn({ icon: "palette", iconOnly: true, label: "色", act: "colors" })
        + '<span class="wp-sep"></span>'
        + btn({ icon: "alignL", iconOnly: true, label: "左揃え", act: "s", val: "al" })
        + btn({ icon: "alignC", iconOnly: true, label: "中央", act: "s", val: "ac" })
        + btn({ icon: "alignR", iconOnly: true, label: "右揃え", act: "s", val: "ar" })
        + '<span class="wp-sep"></span>'
        + btn({ label: "数値", icon: "type", act: "numfmt" });
      if (lv !== "simple")
        h += btn({ icon: "sort", label: "並べ替え", act: "sort-menu" })
          + btn({ icon: "filter", label: "フィルター", act: "filter-menu" });
      h += btn({ icon: "chart", label: "グラフ", act: "chart" })
        + btn({ icon: "sparkle", label: "AI", act: "ai" })
        + '<span class="wp-sep"></span>'
        + btn({ icon: "rows", iconOnly: true, label: "行を挿入", act: "row+" })
        + btn({ icon: "cols", iconOnly: true, label: "列を挿入", act: "col+" });
      if (lv === "detail")
        h += btn({ icon: "merge", iconOnly: true, label: "セルを結合", act: "merge" })
          + btn({ icon: "lock", iconOnly: true, label: "行と列を固定", act: "freeze" });
      h += '<span class="wp-top__sp"></span>'
        + btn({ icon: "code", iconOnly: true, label: "関数一覧", act: "fx" })
        + btn({ icon: "more", iconOnly: true, label: "その他", act: "more-tools" });
      return h + "</div>";
    }
    function formulaBar() {
      var c = cell(sel.r, sel.c);
      var v = c ? (c.f || (c.v === undefined ? "" : c.v)) : "";
      return '<div class="wps-bar">'
        + '<input class="wp-in wps-bar__ref" value="' + esc(ref(sel.r, sel.c)) + '" data-act="jump" aria-label="セル番地" />'
        + '<input class="wp-in wps-bar__f" value="' + esc(v) + '" data-act="fx-in" aria-label="数式バー"'
        + ' placeholder="値または =SUM(A1:A10)" /></div>';
    }
    function tabsBar() {
      return '<div class="wps-tabs">' + body.sheets.map(function (s, i) {
        return '<button type="button" class="wps-tab' + (i === si ? " is-on" : "") + '" data-act="tab" data-i="'
          + i + '">' + esc(s.name) + "</button>";
      }).join("")
        + btn({ icon: "plus", iconOnly: true, label: "シートを追加", act: "sheet+" })
        + btn({ icon: "more", iconOnly: true, label: "シートの操作", act: "sheet-menu" })
        + '<span class="wp-top__sp"></span>'
        + '<span class="wp-chip">' + selSummary() + "</span></div>";
    }
    function selSummary() {
      var vals = [];
      eachSel(function (r, c) {
        var v = computed[ref(r, c)];
        var n = Number(v);
        if (v !== "" && v !== undefined && !isNaN(n)) vals.push(n);
      });
      if (!vals.length) return "選択 " + selCount() + " セル";
      var sum = vals.reduce(function (a, b) { return a + b; }, 0);
      return "合計 " + round(sum) + " / 平均 " + round(sum / vals.length) + " / 個数 " + vals.length;
    }
    function round(n) { return Math.round(n * 1000) / 1000; }
    function selCount() {
      return (Math.abs(sel.r2 - sel.r) + 1) * (Math.abs(sel.c2 - sel.c) + 1);
    }
    function eachSel(fn) {
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) fn(r, c);
    }
    function mobileBar() {
      return '<div class="wp-mbar">'
        + btn({ icon: "plus", iconOnly: true, label: "行を挿入", act: "row+" })
        + btn({ icon: "cols", iconOnly: true, label: "列を挿入", act: "col+" })
        + btn({ icon: "bold", iconOnly: true, label: "太字", act: "s", val: "b" })
        + btn({ icon: "palette", iconOnly: true, label: "色", act: "colors" })
        + btn({ icon: "sort", iconOnly: true, label: "並べ替え", act: "sort-menu" })
        + btn({ icon: "chart", iconOnly: true, label: "グラフ", act: "chart" })
        + btn({ icon: "code", iconOnly: true, label: "関数", act: "fx" })
        + btn({ icon: "sparkle", iconOnly: true, label: "AI", act: "ai" })
        + "</div>";
    }
    function rightPanel() {
      if (rightTab === "chart") return chartPanel();
      return fxPanel();
    }
    function fxPanel() {
      var byCat = F.byCategory();
      var h = '<div class="wp-panel__h">関数（' + F.list().length + "）</div><div class=\"wps-fx\">";
      Object.keys(byCat).forEach(function (cat) {
        h += '<div class="wp-lab" style="margin-top:8px">' + esc(cat) + "</div>";
        byCat[cat].forEach(function (d) {
          h += '<button type="button" class="wps-fx__i" data-act="ins-fx" data-fn="' + esc(d.type) + '">'
            + '<span class="wps-fx__n">' + esc(d.type) + "()</span>"
            + '<span class="wps-fx__d">' + esc(d.description || "") + "</span></button>";
        });
      });
      return h + "</div>";
    }
    function chartPanel() {
      var h = '<div class="wp-panel__h">グラフ（' + body.charts.length + "）</div><div class=\"wps-fx\">";
      if (!body.charts.length) h += '<div class="wp-lab">範囲を選んで「グラフ」を押すと作れます。</div>';
      body.charts.forEach(function (c, i) {
        var spec = chartSpec(c);
        h += '<div style="padding:8px;border:1px solid var(--vq-border-subtle);border-radius:8px;margin-bottom:10px">'
          + CH.render(spec, { width: 260, height: 170 })
          + '<div class="wp-inline" style="margin-top:6px">'
          + btn({ label: "編集", act: "chart-edit", val: i })
          + btn({ label: "削除", act: "chart-del", val: i })
          + btn({ label: "Slides へ", act: "chart-to-slides", val: i }) + "</div></div>";
      });
      return h + "</div>";
    }

    function colWidth(c) {
      var w = Number((sheet().colW || {})[c]);
      return w > 0 ? w : CELL_W;
    }
    function rowHeight(r) {
      var h = Number((sheet().rowH || {})[r]);
      return h > 0 ? h : CELL_H;
    }
    /* 見えている範囲を、幅がまちまちでも正しく出す。 */
    function colAt(x) {
      var acc = HEAD_W, c = 0;
      while (acc + colWidth(c) < x && c < 2000) { acc += colWidth(c); c++; }
      return c;
    }
    function rowAt(y) {
      var acc = CELL_H, r = 1;
      while (acc + rowHeight(r) < y && r < 100000) { acc += rowHeight(r); r++; }
      return r;
    }
    function colLeft(c) {
      var acc = HEAD_W;
      for (var i = 0; i < c; i++) acc += colWidth(i);
      return acc;
    }
    function rowTop(r) {
      var acc = CELL_H;
      for (var i = 1; i < r; i++) acc += rowHeight(i);
      return acc;
    }

    /* 仮想化した表。見えている範囲だけを作る。 */
    function onScroll(e) {
      scrollTop = e.target.scrollTop;
      scrollLeft = e.target.scrollLeft;
      drawGrid();
    }
    function drawGrid() {
      var s = sheet();
      var host = api.root.querySelector('[data-role="grid"]');
      var sc = api.root.querySelector('[data-role="scroll"]');
      if (!host || !sc) return;
      var vh = sc.clientHeight || 480, vw = sc.clientWidth || 700;
      var rows = Math.max(s.rows || 60, maxRow() + 8);
      var cols = Math.max(s.cols || 20, maxCol() + 4);
      var r0 = Math.max(1, rowAt(scrollTop) - 3);
      var rN = Math.min(rows, rowAt(scrollTop + vh) + 6);
      var c0 = Math.max(0, colAt(scrollLeft) - 2);
      var cN = Math.min(cols, colAt(scrollLeft + vw) + 3);

      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var k1 = Math.min(sel.c, sel.c2), k2 = Math.max(sel.c, sel.c2);

      /* 列の幅・行の高さは 1 本ずつ変えられる。決めた値はシートに残す。 */
      var colX = [], rowY = [];
      var acc = HEAD_W;
      for (var ci2 = 0; ci2 < cols + 1; ci2++) { colX[ci2] = acc; acc += colWidth(ci2); }
      var accY = CELL_H;
      for (var ri2 = 1; ri2 <= rows + 1; ri2++) { rowY[ri2] = accY; accY += rowHeight(ri2); }
      var totalW = colX[cols] || (HEAD_W + cols * CELL_W);
      var totalH = rowY[rows + 1] || (rows * CELL_H + CELL_H);

      var h = '<div style="position:relative;height:' + totalH + "px;width:" + totalW + 'px">';
      /* 列見出し */
      h += '<div style="position:sticky;top:0;left:0;z-index:5;height:' + CELL_H + 'px">';
      h += '<div class="wps-h is-corner" style="position:absolute;left:0;top:0;width:' + HEAD_W + "px;height:"
        + CELL_H + 'px;line-height:' + CELL_H + 'px"></div>';
      for (var c = c0; c < cN; c++) {
        h += '<div class="wps-h is-col' + (c >= k1 && c <= k2 ? " is-hi" : "") + '" data-col="' + c
          + '" style="position:absolute;left:' + colX[c] + "px;top:0;width:" + colWidth(c)
          + "px;height:" + CELL_H + "px;line-height:" + CELL_H + 'px">' + M.colName(c)
          + '<span class="wps-grip is-col" data-cgrip="' + c + '"></span></div>';
      }
      h += "</div>";
      /* 行 */
      for (var r = r0; r <= rN; r++) {
        var top = rowY[r];
        var rh = rowHeight(r);
        h += '<div class="wps-h is-row' + (r >= r1 && r <= r2 ? " is-hi" : "") + '" data-row="' + r
          + '" style="position:absolute;left:0;top:' + top + "px;width:" + HEAD_W + "px;height:" + rh
          + "px;line-height:" + rh + 'px">' + r
          + '<span class="wps-grip is-row" data-rgrip="' + r + '"></span></div>';
        for (var cc = c0; cc < cN; cc++) {
          var k = ref(r, cc);
          var cl = s.cells[k];
          var v = computed[k];
          if (v === undefined) v = cl ? (cl.v === undefined ? "" : cl.v) : "";
          var isErr = typeof v === "string" && /^#[A-Z/0]+!?$/.test(v);
          var isNum = v !== "" && v !== null && !isNaN(Number(v)) && typeof v !== "boolean";
          var st = cl && cl.s ? cl.s : null;
          var style = "position:absolute;left:" + colX[cc] + "px;top:" + top + "px;width:"
            + colWidth(cc) + "px;height:" + rh + "px;line-height:" + (rh - 4) + "px";
          if (st) {
            if (st.b) style += ";font-weight:700";
            if (st.i) style += ";font-style:italic";
            if (st.u) style += ";text-decoration:underline";
            if (st.bg) style += ";background:" + st.bg;
            if (st.fg) style += ";color:" + st.fg;
            if (st.a) style += ";text-align:" + st.a;
          }
          var inSel = r >= r1 && r <= r2 && cc >= k1 && cc <= k2;
          var isCur = r === sel.r && cc === sel.c;
          h += '<div class="wps-c' + (isCur ? " is-sel" : (inSel ? " is-rng" : ""))
            + (isNum && !(st && st.a) ? " is-num" : "") + (isErr ? " is-err" : "")
            + '" data-r="' + r + '" data-c="' + cc + '" style="' + style + '" title="'
            + esc(cl && cl.f ? cl.f : "") + '">' + esc(fmtCell(v, st)) + "</div>";
        }
      }
      h += "</div>";
      host.innerHTML = h;
    }
    function fmtCell(v, st) {
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      var n = Number(v);
      if (v !== "" && !isNaN(n) && st && st.nf) {
        if (st.nf === "pct") return (n * 100).toFixed(st.dec || 0) + "%";
        if (st.nf === "cur") return "¥" + Math.round(n).toLocaleString("ja-JP");
        if (st.nf === "com") return n.toLocaleString("ja-JP",
          { minimumFractionDigits: st.dec || 0, maximumFractionDigits: st.dec || 0 });
        if (st.nf === "date") {
          var d = F.helpers.serialToDate(n);
          return d.getUTCFullYear() + "/" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
        }
      }
      if (v !== "" && !isNaN(n) && st && st.dec !== undefined && st.nf !== "pct") return n.toFixed(st.dec);
      return String(v);
    }
    function maxRow() {
      var m = 1;
      Object.keys(sheet().cells).forEach(function (k) {
        var r = parseInt(k.replace(/^[A-Z]+/, ""), 10);
        if (r > m) m = r;
      });
      return m;
    }
    function maxCol() {
      var m = 0;
      Object.keys(sheet().cells).forEach(function (k) {
        var c = M.colIndex(k.replace(/[0-9]+$/, ""));
        if (c > m) m = c;
      });
      return m;
    }

    /* ══ セルへの入力 ══════════════════════════════════════════════
       選んだセルの上に「見えない入力欄」を常に置いておき、そこへ焦点を当てる。
       ── なぜこうするか ──────────────────────────────────────────
       前は keydown の 1 文字を拾って入力欄を作っていた。これだと
       **日本語（IME）で打てない**。変換中は keydown が "Process" になり、
       文字が 1 つも届かないため。入力欄を先に置いておけば、英字も日本語も
       同じ道を通る。押した直後から打てる、という当たり前の動きになる。 */
    var ghost = null, ghostLive = false;
    function ensureGhost() {
      if (ghost && ghost.isConnected) return ghost;
      /* **まだ生きている入力欄があれば、それを使い続ける。**
         打ち始めた合図（beforeinput）でここへ来るので、その場で作り直すと
         いま打った 1 文字ごと捨ててしまう。実際、表を開いて最初に打った
         値だけが入らない、という形で出ていた。 */
      var live = api.root.querySelector(".wps-ghost");
      if (live && live.__vqBound) { ghost = live; return ghost; }
      /* 画面を作り直すたびに新しく作ると、前のものが残って 2 つ以上になる。
         探すと古いほうが当たり、焦点が当たっていないように見える。先に片づける。 */
      Array.prototype.forEach.call(api.root.querySelectorAll(".wps-ghost"), function (n) {
        try { n.remove(); } catch (e) {}
      });
      ghost = doc.createElement("input");
      ghost.className = "wps-ghost";
      ghost.setAttribute("aria-label", "セルの入力");
      ghost.setAttribute("autocomplete", "off");
      ghost.setAttribute("spellcheck", "false");
      var sc = api.root.querySelector('[data-role="scroll"]');
      (sc || api.root).appendChild(ghost);
      bindGhost();
      ghost.__vqBound = true;
      return ghost;
    }
    /* 選んでいるセルの上へ移し、いまの値を入れておく。 */
    function placeGhost(focusIt) {
      var g = ensureGhost();
      var s = sheet();
      var cl = s.cells[ref(sel.r, sel.c)];
      g.style.left = colLeft(sel.c) + "px";
      g.style.top = rowTop(sel.r) + "px";
      g.style.width = colWidth(sel.c) + "px";
      g.style.height = rowHeight(sel.r) + "px";
      if (!ghostLive) {
        g.value = "";
        g.classList.remove("is-live");
      }
      if (focusIt !== false) {
        try { g.focus({ preventScroll: true }); } catch (e) { try { g.focus(); } catch (e2) {} }
      }
    }
    /* 打ち始めた（または F2/ダブルクリック）。ここから見える入力になる。 */
    function goLive(seedFromCell) {
      var g = ensureGhost();
      if (ghostLive) return;
      ghostLive = true;
      editing = g;
      g.classList.add("is-live");
      if (seedFromCell) {
        var c = cell(sel.r, sel.c);
        g.value = c ? (c.f || (c.v === undefined ? "" : c.v)) : "";
        try { g.setSelectionRange(g.value.length, g.value.length); } catch (e) {}
      }
      updateBar();
    }
    function endLive(save) {
      var g = ghost;
      if (!ghostLive || !g) return;
      var v = g.value;
      ghostLive = false;
      editing = null;
      g.classList.remove("is-live");
      g.value = "";
      if (save) commit(v);
      else { drawGrid(); updateBar(); }
    }
    function cancelEdit() { endLive(false); }
    function startEdit(initial) {
      placeGhost(true);
      if (initial !== undefined) {
        goLive(false);
        ghost.value = String(initial);
      } else {
        goLive(true);
      }
    }
    function bindGhost() {
      var g = ghost;
      /* 変換中も含めて、何か入ったら見える入力へ切り替える。 */
      g.addEventListener("compositionstart", function () { goLive(false); });
      g.addEventListener("beforeinput", function () { if (!ghostLive) goLive(false); });
      g.addEventListener("input", function () { if (!ghostLive) goLive(false); });
      g.addEventListener("keydown", function (e) {
        /* 変換中のキーには手を出さない（確定前に確定させない）。 */
        if (e.isComposing || e.keyCode === 229) return;
        if (ghostLive) {
          if (e.key === "Enter") { e.preventDefault(); endLive(true); moveSel(1, 0); }
          else if (e.key === "Escape") { e.preventDefault(); endLive(false); }
          else if (e.key === "Tab") { e.preventDefault(); endLive(true); moveSel(0, e.shiftKey ? -1 : 1); }
          return;
        }
        /* まだ打ち始めていないときは、ここが表そのものの操作になる。 */
        var k = e.key;
        if (k === "ArrowUp") { e.preventDefault(); moveSel(-1, 0, e.shiftKey); }
        else if (k === "ArrowDown") { e.preventDefault(); moveSel(1, 0, e.shiftKey); }
        else if (k === "ArrowLeft") { e.preventDefault(); moveSel(0, -1, e.shiftKey); }
        else if (k === "ArrowRight") { e.preventDefault(); moveSel(0, 1, e.shiftKey); }
        else if (k === "Tab") { e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1); }
        else if (k === "Enter" || k === "F2") { e.preventDefault(); goLive(true); }
        else if (k === "Delete" || k === "Backspace") {
          e.preventDefault();
          shell.pushUndo("消去");
          eachSel(function (r, c) { delete sheet().cells[ref(r, c)]; });
          recalc(); session.touch(); drawGrid(); updateBar();
        } else if ((e.metaKey || e.ctrlKey) && String(k).toLowerCase() === "c") { copySel(); }
        else if ((e.metaKey || e.ctrlKey) && String(k).toLowerCase() === "x") { copySel(); cutSel(); }
      });
      g.addEventListener("blur", function () {
        if (ghostLive) endLive(true);
      });
      g.addEventListener("paste", onPaste);
    }
    function cutSel() {
      shell.pushUndo("切り取り");
      eachSel(function (r, c) { delete sheet().cells[ref(r, c)]; });
      recalc(); session.touch(); drawGrid(); updateBar();
    }
    function commit(text) {
      shell.pushUndo("セルの入力");
      var t = String(text === undefined ? "" : text);
      if (t.charAt(0) === "=") setCell(sel.r, sel.c, { f: t, v: "" });
      else {
        var n = Number(t.replace(/,/g, ""));
        setCell(sel.r, sel.c, { f: "", v: (t.trim() !== "" && !isNaN(n)) ? n : t });
        var cc = sheet().cells[ref(sel.r, sel.c)];
        if (cc) delete cc.f;
      }
      recalc();
      session.touch();
      drawGrid();
      updateBar();
      placeGhost(true);
    }
    function updateBar() {
      var bar = api.root.querySelector(".wps-bar");
      if (bar) bar.outerHTML = formulaBar();
      var tabs = api.root.querySelector(".wps-tabs");
      if (tabs) tabs.outerHTML = tabsBar();
    }
    function moveSel(dr, dc, extend) {
      var r = Math.max(1, sel.r + dr), c = Math.max(0, sel.c + dc);
      if (extend) { sel.r2 = Math.max(1, sel.r2 + dr); sel.c2 = Math.max(0, sel.c2 + dc); }
      else { sel.r = r; sel.c = c; sel.r2 = r; sel.c2 = c; }
      ensureVisible();
      drawGrid();
      updateBar();
      placeGhost(true);
    }
    function ensureVisible() {
      var sc = api.root.querySelector('[data-role="scroll"]');
      if (!sc) return;
      var top = rowTop(sel.r), left = colLeft(sel.c);
      var rh = rowHeight(sel.r), cw = colWidth(sel.c);
      if (top < sc.scrollTop + CELL_H) sc.scrollTop = Math.max(0, top - CELL_H);
      if (top + rh > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + rh - sc.clientHeight;
      if (left < sc.scrollLeft + HEAD_W) sc.scrollLeft = Math.max(0, left - HEAD_W);
      if (left + cw > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = left + cw - sc.clientWidth;
    }
    /* ── 列の幅・行の高さをつまんで変える ─────────────────────── */
    function startGrip(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      var cg = ev.target.closest ? ev.target.closest("[data-cgrip]") : null;
      var rg = ev.target.closest ? ev.target.closest("[data-rgrip]") : null;
      if (!cg && !rg) return;
      ev.preventDefault();
      ev.stopPropagation();
      var s = sheet();
      var isCol = !!cg;
      var idx = Number((cg || rg).getAttribute(isCol ? "data-cgrip" : "data-rgrip"));
      var startPos = isCol ? ev.clientX : ev.clientY;
      var start = isCol ? colWidth(idx) : rowHeight(idx);
      shell.pushUndo(isCol ? "列幅の変更" : "行高の変更");
      if (isCol && !s.colW) s.colW = {};
      if (!isCol && !s.rowH) s.rowH = {};
      function move(e2) {
        var d = (isCol ? e2.clientX : e2.clientY) - startPos;
        var v = Math.max(isCol ? 32 : 18, Math.round(start + d));
        if (isCol) s.colW[idx] = v; else s.rowH[idx] = v;
        drawGrid();
        e2.preventDefault();
      }
      function end() {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", end);
        session.touch();
        placeGhost(true);
      }
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", end);
    }
    /* 二重クリックで、その列（行）の中身に合わせる。 */
    function autoFit(ev) {
      var cg = ev.target.closest ? ev.target.closest("[data-cgrip]") : null;
      if (!cg) return;
      ev.preventDefault();
      ev.stopPropagation();
      var s = sheet();
      var c = Number(cg.getAttribute("data-cgrip"));
      var max = 0;
      for (var r = 1; r <= maxRow(); r++) {
        var v = computed[ref(r, c)];
        if (v === undefined || v === "") continue;
        max = Math.max(max, String(v).length);
      }
      if (!s.colW) s.colW = {};
      s.colW[c] = Math.max(48, Math.min(420, 16 + max * 13));
      shell.pushUndo("列幅を内容に合わせる");
      session.touch();
      drawGrid();
      placeGhost(true);
    }

    function bind() {
      U.keepSelection(api.root);
      /* 幅と高さの取っ手は、セルの選択より先に受け取る。 */
      api.root.addEventListener("mousedown", startGrip, true);
      api.root.addEventListener("dblclick", autoFit, true);
      api.root.addEventListener("mousedown", function (e) {
        if (e.button !== undefined && e.button !== 0) return;   /* 右クリックは選択を壊さない */
        if (e.target.closest && e.target.closest("[data-cgrip],[data-rgrip]")) return;
        var c = e.target.closest ? e.target.closest(".wps-c") : null;
        if (c) {
          if (ghostLive) endLive(true);
          var r = Number(c.getAttribute("data-r")), cc = Number(c.getAttribute("data-c"));
          if (e.shiftKey) { sel.r2 = r; sel.c2 = cc; }
          else { sel.r = sel.r2 = r; sel.c = sel.c2 = cc; }
          drawGrid(); updateBar(); placeGhost(true);
          e.preventDefault();          /* 焦点は見えない入力欄へ置いたままにする */
          return;
        }
        var colh = e.target.closest ? e.target.closest("[data-col]") : null;
        if (colh) { var k = Number(colh.getAttribute("data-col"));
          sel.c = sel.c2 = k; sel.r = 1; sel.r2 = Math.max(maxRow(), 1);
          drawGrid(); updateBar(); placeGhost(true); e.preventDefault(); return; }
        var rowh = e.target.closest ? e.target.closest("[data-row]") : null;
        if (rowh) { var rr = Number(rowh.getAttribute("data-row"));
          sel.r = sel.r2 = rr; sel.c = 0; sel.c2 = Math.max(maxCol(), 0);
          drawGrid(); updateBar(); placeGhost(true); e.preventDefault(); }
      });
      api.root.addEventListener("dblclick", function (e) {
        if (e.target.closest && e.target.closest(".wps-c")) startEdit();
      });
      /* 右クリック */
      api.root.addEventListener("contextmenu", function (e) {
        var c = e.target.closest ? e.target.closest(".wps-c") : null;
        var colh = e.target.closest ? e.target.closest("[data-col]") : null;
        var rowh = e.target.closest ? e.target.closest("[data-row]") : null;
        var tab = e.target.closest ? e.target.closest(".wps-tab") : null;
        if (tab) {
          e.preventDefault();
          si = Number(tab.getAttribute("data-i")); body.activeSheet = si;
          recalc(); paint();
          sheetContextMenu(e.clientX, e.clientY);
          return;
        }
        if (!c && !colh && !rowh) return;
        e.preventDefault();
        if (c) {
          var r = Number(c.getAttribute("data-r")), cc = Number(c.getAttribute("data-c"));
          var inside = r >= Math.min(sel.r, sel.r2) && r <= Math.max(sel.r, sel.r2)
            && cc >= Math.min(sel.c, sel.c2) && cc <= Math.max(sel.c, sel.c2);
          if (!inside) { sel.r = sel.r2 = r; sel.c = sel.c2 = cc; drawGrid(); updateBar(); }
        } else if (colh) {
          var k2 = Number(colh.getAttribute("data-col"));
          sel.c = sel.c2 = k2; sel.r = 1; sel.r2 = Math.max(maxRow(), 1); drawGrid(); updateBar();
        } else {
          var r2 = Number(rowh.getAttribute("data-row"));
          sel.r = sel.r2 = r2; sel.c = 0; sel.c2 = Math.max(maxCol(), 0); drawGrid(); updateBar();
        }
        cellContextMenu(e.clientX, e.clientY, !!colh, !!rowh);
      });
      api.root.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t || !api.root.contains(t)) return;
        if (handle(t.getAttribute("data-act"), t.getAttribute("data-val"), t)) e.preventDefault();
      });
      /* キー操作は見えない入力欄（ghost）が受け持つ。ここでは補助だけ。 */
      api.root.addEventListener("paste", onPaste);
      api.root.addEventListener("change", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (t && t.getAttribute("data-act") === "fx-in") { commitBar(t.value); }
      });
      api.root.addEventListener("keydown", function (e) {
        var t = e.target.closest ? e.target.closest('[data-act="fx-in"]') : null;
        if (t && e.key === "Enter") { e.preventDefault(); commitBar(t.value); }
        var j = e.target.closest ? e.target.closest('[data-act="jump"]') : null;
        if (j && e.key === "Enter") {
          e.preventDefault();
          var m = /^([A-Za-z]{1,3})([0-9]{1,7})$/.exec(String(j.value).trim());
          if (m) {
            sel.r = sel.r2 = parseInt(m[2], 10);
            sel.c = sel.c2 = M.colIndex(m[1]);
            ensureVisible(); drawGrid(); updateBar();
          }
        }
      });
    }
    function onPaste(e) {
      if (ghostLive) return;                   /* 打っている最中はそのまま入れる */
      var txt = "";
      try { txt = (e.clipboardData || root.clipboardData).getData("text/plain"); } catch (er) {}
      if (!txt) return;
      e.preventDefault();
      shell.pushUndo("貼り付け");
      txt.replace(/\r/g, "").split("\n").forEach(function (line, ri) {
        if (!line && ri) return;
        line.split("\t").forEach(function (v, ci) {
          var n = Number(v.replace(/,/g, ""));
          var val = (v.trim() !== "" && !isNaN(n)) ? n : v;
          if (String(v).charAt(0) === "=") setCell(sel.r + ri, sel.c + ci, { f: v, v: "" });
          else setCell(sel.r + ri, sel.c + ci, { v: val, f: "" });
        });
      });
      recalc(); session.touch(); drawGrid(); updateBar();
    }

    /* ── 右クリックのメニュー（セル・行・列）───────────────────── */
    function cellContextMenu(x, y, isCol, isRow) {
      var n = selCount();
      var items = [
        { label: "切り取り", icon: "copy", hint: "Ctrl+X", run: function () { copySel(); cutSel(); } },
        { label: "コピー", icon: "copy", hint: "Ctrl+C", run: copySel },
        { label: "貼り付け", icon: "copy", hint: "Ctrl+V", run: function () {
          api.toast("Ctrl+V（Mac は ⌘V）で貼り付けられます。", "info", 4000); } },
        { sep: true },
        { label: "行を挿入", icon: "rows", run: insertRow },
        { label: "列を挿入", icon: "cols", run: insertCol },
        { label: "この行を削除", icon: "minus", run: deleteRow },
        { label: "この列を削除", icon: "minus", run: deleteCol },
        { sep: true },
        { label: "内容を消す", icon: "trash", run: function () {
          shell.pushUndo("消去");
          eachSel(function (r, c) { delete sheet().cells[ref(r, c)]; });
          recalc(); session.touch(); drawGrid(); updateBar();
        } },
        { label: "書式を消す", icon: "palette", run: function () {
          shell.pushUndo("書式の消去");
          eachSel(function (r, c) { var cl = sheet().cells[ref(r, c)]; if (cl) delete cl.s; });
          session.touch(); drawGrid();
        } },
        { sep: true },
        { label: "太字", icon: "bold", run: function () { applyStyle("b"); } },
        { label: "色を変える", icon: "palette", run: function () { colorSheet(null); } },
        { label: "列の幅を数字で決める", icon: "cols", run: colWidthDialog },
        { label: "行の高さを数字で決める", icon: "rows", run: rowHeightDialog },
        { label: "列の幅を内容に合わせる", icon: "cols", run: function () {
          var s2 = sheet();
          if (!s2.colW) s2.colW = {};
          shell.pushUndo("列幅を内容に合わせる");
          var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
          for (var c = c1; c <= c2; c++) {
            var max = 0;
            for (var r = 1; r <= maxRow(); r++) {
              var v = computed[ref(r, c)];
              if (v === undefined || v === "") continue;
              max = Math.max(max, String(v).length);
            }
            s2.colW[c] = Math.max(48, Math.min(420, 16 + max * 13));
          }
          session.touch(); drawGrid(); placeGhost(true);
        } },
        { label: "数値の表示", icon: "type", run: numFmtSheet },
        { label: "セルを結合", icon: "merge", disabled: n < 2, run: mergeCells },
        { sep: true },
        { label: "並べ替え", icon: "sort", run: sortSheet },
        { label: "フィルター", icon: "filter", run: filterSheet },
        { label: "この範囲でグラフを作る", icon: "chart", run: function () { chartDialog(); } },
        { label: "ここまでを固定する", icon: "lock", run: freezeHere }
      ];
      U.contextMenu(api.root, x, y, items,
        { title: isCol ? M.colName(sel.c) + " 列" : (isRow ? sel.r + " 行" : ref(sel.r, sel.c)) });
    }
    function colWidthDialog() {
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      U.sheet(api.root, {
        title: M.colName(c1) + (c2 > c1 ? "〜" + M.colName(c2) : "") + " 列の幅",
        html: '<div class="wp-row"><label class="wp-lab" for="cw">幅（px）</label>'
          + '<input class="wp-in" id="cw" type="number" min="32" max="600" value="' + colWidth(c1) + '" /></div>'
          + btn({ label: "決定", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            var v = Math.max(32, Math.min(600, Number(bodyEl.querySelector("#cw").value) || CELL_W));
            shell.pushUndo("列幅");
            var s = sheet();
            if (!s.colW) s.colW = {};
            for (var c = c1; c <= c2; c++) s.colW[c] = v;
            session.touch(); drawGrid(); placeGhost(true); close();
          });
        }
      });
    }
    function rowHeightDialog() {
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      U.sheet(api.root, {
        title: r1 + (r2 > r1 ? "〜" + r2 : "") + " 行の高さ",
        html: '<div class="wp-row"><label class="wp-lab" for="rh">高さ（px）</label>'
          + '<input class="wp-in" id="rh" type="number" min="18" max="400" value="' + rowHeight(r1) + '" /></div>'
          + btn({ label: "決定", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            var v = Math.max(18, Math.min(400, Number(bodyEl.querySelector("#rh").value) || CELL_H));
            shell.pushUndo("行高");
            var s = sheet();
            if (!s.rowH) s.rowH = {};
            for (var r = r1; r <= r2; r++) s.rowH[r] = v;
            session.touch(); drawGrid(); placeGhost(true); close();
          });
        }
      });
    }
    function deleteRow() {
      shell.pushUndo("行の削除");
      var s = sheet(), r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var span = r2 - r1 + 1, next = {};
      var o = { rowFrom: r1, rowDel: span, rowDelta: -span };
      Object.keys(s.cells).forEach(function (k) {
        var col = k.replace(/[0-9]+$/, ""), r = parseInt(k.replace(/^[A-Z]+/, ""), 10);
        if (r >= r1 && r <= r2) return;
        next[col + (r > r2 ? r - span : r)] = moveRefs(s.cells[k], o);
      });
      s.cells = next;
      recalc(); session.touch(); drawGrid(); updateBar();
      api.toast(span + " 行を削除しました", "ok");
    }
    function deleteCol() {
      shell.pushUndo("列の削除");
      var s = sheet(), c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      var span = c2 - c1 + 1, next = {};
      var o = { colFrom: c1, colDel: span, colDelta: -span };
      Object.keys(s.cells).forEach(function (k) {
        var col = M.colIndex(k.replace(/[0-9]+$/, "")), r = k.replace(/^[A-Z]+/, "");
        if (col >= c1 && col <= c2) return;
        next[M.colName(col > c2 ? col - span : col) + r] = moveRefs(s.cells[k], o);
      });
      s.cells = next;
      recalc(); session.touch(); drawGrid(); updateBar();
      api.toast(span + " 列を削除しました", "ok");
    }
    function commitBar(v) {
      shell.pushUndo("数式の入力");
      if (String(v).charAt(0) === "=") setCell(sel.r, sel.c, { f: v, v: "" });
      else {
        var n = Number(String(v).replace(/,/g, ""));
        setCell(sel.r, sel.c, { v: (String(v).trim() !== "" && !isNaN(n)) ? n : v, f: "" });
      }
      recalc(); session.touch(); drawGrid(); updateBar();
    }
    function copySel() {
      var rows = [];
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      for (var r = r1; r <= r2; r++) {
        var row = [];
        for (var c = c1; c <= c2; c++) {
          var v = computed[ref(r, c)];
          row.push(v === undefined ? "" : v);
        }
        rows.push(row.join("\t"));
      }
      var text = rows.join("\n");
      try {
        var ta = doc.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        doc.body.appendChild(ta); ta.select(); doc.execCommand("copy"); ta.remove();
        api.toast(selCount() + " セルをコピーしました", "ok");
      } catch (e) {}
    }

    /* ── 操作 ─────────────────────────────────────────────────── */
    function handle(act, val, t) {
      if (act === "s") { applyStyle(val); return true; }
      if (act === "colors") { colorSheet(t); return true; }
      if (act === "numfmt") { numFmtSheet(); return true; }
      if (act === "row+") { insertRow(); return true; }
      if (act === "col+") { insertCol(); return true; }
      if (act === "merge") { mergeCells(); return true; }
      if (act === "freeze") { freezeHere(); return true; }
      if (act === "sort-menu") { sortSheet(); return true; }
      if (act === "filter-menu") { filterSheet(); return true; }
      if (act === "chart") { chartDialog(); return true; }
      if (act === "chart-del") { body.charts.splice(Number(val), 1); session.touch(); paint(); return true; }
      if (act === "chart-edit") { chartDialog(Number(val)); return true; }
      if (act === "chart-to-slides") { chartToSlides(Number(val)); return true; }
      if (act === "fx") { showRight = !showRight || rightTab !== "fx"; rightTab = "fx"; paint(); return true; }
      if (act === "ins-fx") { insertFunction(t.getAttribute("data-fn")); return true; }
      if (act === "tab") { si = Number(t.getAttribute("data-i")); body.activeSheet = si;
        sel = { r: 1, c: 0, r2: 1, c2: 0 }; recalc(); paint(); return true; }
      if (act === "sheet+") { addSheet(); return true; }
      if (act === "sheet-menu") { sheetMenu(); return true; }
      if (act === "more-tools") { moreTools(); return true; }
      if (act === "ai") { aiSheet(); return true; }
      return false;
    }
    function applyStyle(kind) {
      shell.pushUndo("書式");
      eachSel(function (r, c) {
        var k = ref(r, c);
        var cl = sheet().cells[k] || (sheet().cells[k] = { v: "" });
        var s = cl.s || (cl.s = {});
        if (kind === "b") s.b = !s.b;
        else if (kind === "i") s.i = !s.i;
        else if (kind === "u") s.u = !s.u;
        else if (kind === "al") s.a = "left";
        else if (kind === "ac") s.a = "center";
        else if (kind === "ar") s.a = "right";
      });
      session.touch(); drawGrid();
    }
    function colorSheet(anchor) {
      var pos = { x: 220, y: 150 };
      if (anchor && anchor.getBoundingClientRect) {
        var r = anchor.getBoundingClientRect();
        pos = { x: r.left, y: r.bottom + 6 };
      }
      U.contextMenu(api.root, pos.x, pos.y, [
        { label: "文字の色", icon: "palette", run: function () { pickCellColor("fg", pos); } },
        { label: "セルの背景", icon: "palette", run: function () { pickCellColor("bg", pos); } },
        { sep: true },
        { label: "色を消す", icon: "x", run: function () {
          shell.pushUndo("色を消す");
          eachSel(function (r, c) {
            var cl = sheet().cells[ref(r, c)];
            if (cl && cl.s) { delete cl.s.fg; delete cl.s.bg; }
          });
          session.touch(); drawGrid();
        } }
      ], { title: "色" });
    }
    function pickCellColor(kind, pos) {
      var cur = (cell(sel.r, sel.c) || {}).s || {};
      U.colorPicker(api.root, pos.x, pos.y, {
        title: kind === "fg" ? "文字の色" : "セルの背景",
        value: cur[kind],
        allowNone: true,
        noneLabel: kind === "fg" ? "既定の色に戻す" : "背景をなくす",
        onPick: function (c) {
          shell.pushUndo("色");
          eachSel(function (r, k) {
            var key = ref(r, k);
            var cl = sheet().cells[key] || (sheet().cells[key] = { v: "" });
            var s = cl.s || (cl.s = {});
            if (c) s[kind] = c; else delete s[kind];
          });
          session.touch();
          drawGrid();
        }
      });
    }
    function numFmtSheet() {
      var fmts = [
        { id: "", label: "標準" }, { id: "com", label: "桁区切り（1,234）" },
        { id: "pct", label: "パーセント（12%）" }, { id: "cur", label: "通貨（¥1,234）" },
        { id: "date", label: "日付（2026/8/6）" }
      ];
      U.sheet(api.root, {
        title: "数値の表示",
        html: fmts.map(function (f) {
          return '<button type="button" class="wp-cmd__i" data-f="' + f.id + '">'
            + icon("type") + "<span>" + esc(f.label) + "</span></button>";
        }).join("")
          + '<div class="wp-row" style="margin-top:12px"><label class="wp-lab" for="wpd">小数点以下の桁数</label>'
          + '<input class="wp-in" id="wpd" type="number" min="0" max="6" value="0" /></div>',
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-f]") : null;
            if (!b) return;
            var dec = Number(bodyEl.querySelector("#wpd").value) || 0;
            shell.pushUndo("表示形式");
            eachSel(function (r, c) {
              var k = ref(r, c);
              var cl = sheet().cells[k];
              if (!cl) return;
              var s = cl.s || (cl.s = {});
              var f = b.getAttribute("data-f");
              if (f) { s.nf = f; s.dec = dec; } else { delete s.nf; delete s.dec; }
            });
            session.touch(); drawGrid(); close();
          });
        }
      });
    }
    /* セルを動かしたら、**数式の中の参照も一緒に動かす**。
       ここを飛ばすと、=A1*2 が動いた先でも A1 を指したままになり、
       答えが 0 になる（見た目は動いているのに中身が合わない）。 */
    function moveRefs(cell, o) {
      if (!cell || !cell.f) return cell;
      var f2 = WP.formula.shiftRefs(cell.f, o);
      if (f2 === cell.f) return cell;
      return Object.assign({}, cell, { f: f2 });
    }
    /* 行・列の挿入は、下・右のセルを実際にずらす（見た目だけ増やさない）。 */
    function insertRow() {
      shell.pushUndo("行の挿入");
      var s = sheet(), next = {}, o = { rowFrom: sel.r, rowDelta: 1 };
      Object.keys(s.cells).forEach(function (k) {
        var col = k.replace(/[0-9]+$/, ""), r = parseInt(k.replace(/^[A-Z]+/, ""), 10);
        next[col + (r >= sel.r ? r + 1 : r)] = moveRefs(s.cells[k], o);
      });
      s.cells = next;
      s.rows = (s.rows || 60) + 1;
      recalc(); session.touch(); drawGrid();
      api.toast(sel.r + " 行目に 1 行足しました", "ok");
    }
    function insertCol() {
      shell.pushUndo("列の挿入");
      var s = sheet(), next = {}, o = { colFrom: sel.c, colDelta: 1 };
      Object.keys(s.cells).forEach(function (k) {
        var col = M.colIndex(k.replace(/[0-9]+$/, "")), r = k.replace(/^[A-Z]+/, "");
        next[M.colName(col >= sel.c ? col + 1 : col) + r] = moveRefs(s.cells[k], o);
      });
      s.cells = next;
      s.cols = (s.cols || 20) + 1;
      recalc(); session.touch(); drawGrid();
      api.toast(M.colName(sel.c) + " 列に 1 列足しました", "ok");
    }
    function mergeCells() {
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      if (r1 === r2 && c1 === c2) { api.toast("2 つ以上のセルを選んでください。", "warn"); return; }
      shell.pushUndo("セルの結合");
      var range = ref(r1, c1) + ":" + ref(r2, c2);
      var s = sheet();
      s.merges = (s.merges || []).filter(function (m) { return m !== range; });
      s.merges.push(range);
      session.touch();
      api.toast(range + " を結合しました（表示は結合先の値）", "ok");
    }
    function freezeHere() {
      var s = sheet();
      s.freeze = { rows: sel.r - 1, cols: sel.c };
      session.touch();
      api.toast(s.freeze.rows + " 行 / " + s.freeze.cols + " 列を固定しました", "ok");
    }
    function sortSheet() {
      var c1 = Math.min(sel.c, sel.c2);
      U.sheet(api.root, {
        title: "並べ替え",
        html: '<div class="wp-lab">' + M.colName(c1) + " 列を基準に、データのある行を並べ替えます。</div>"
          + '<label class="wp-switch"><input type="checkbox" id="wph" checked />1 行目は見出し（動かさない）</label>'
          + '<div class="wp-inline" style="margin-top:12px">'
          + btn({ label: "昇順", act: "asc", variant: "primary" })
          + btn({ label: "降順", act: "desc", variant: "outline" }) + "</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-act]") : null;
            if (!b) return;
            var head = bodyEl.querySelector("#wph").checked;
            doSort(c1, b.getAttribute("data-act") === "asc", head);
            close();
          });
        }
      });
    }
    function doSort(col, asc, head) {
      shell.pushUndo("並べ替え");
      var s = sheet(), last = maxRow(), lastC = maxCol();
      var start = head ? 2 : 1;
      var rows = [];
      for (var r = start; r <= last; r++) {
        var row = { key: computed[ref(r, col)], cells: {} };
        for (var c = 0; c <= lastC; c++) {
          var k = ref(r, c);
          if (s.cells[k]) row.cells[c] = s.cells[k];
        }
        rows.push(row);
      }
      rows.sort(function (a, b) {
        var x = a.key, y = b.key;
        var nx = Number(x), ny = Number(y);
        var bothNum = x !== "" && y !== "" && !isNaN(nx) && !isNaN(ny);
        var r = bothNum ? nx - ny : String(x === undefined ? "" : x).localeCompare(String(y === undefined ? "" : y), "ja");
        return asc ? r : -r;
      });
      for (var rr = start; rr <= last; rr++)
        for (var cc = 0; cc <= lastC; cc++) delete s.cells[ref(rr, cc)];
      rows.forEach(function (row, i) {
        Object.keys(row.cells).forEach(function (c) { s.cells[ref(start + i, Number(c))] = row.cells[c]; });
      });
      recalc(); session.touch(); drawGrid();
      api.toast(rows.length + " 行を並べ替えました", "ok");
    }
    function filterSheet() {
      var c1 = Math.min(sel.c, sel.c2);
      var vals = {};
      for (var r = 2; r <= maxRow(); r++) {
        var v = computed[ref(r, c1)];
        if (v === undefined || v === "") continue;
        vals[String(v)] = (vals[String(v)] || 0) + 1;
      }
      var keys = Object.keys(vals).slice(0, 60);
      U.sheet(api.root, {
        title: "フィルター（" + M.colName(c1) + " 列）",
        html: '<div class="wp-lab">選んだ値の行だけを残し、ほかの行は空にします。元へ戻すには「元に戻す」を使います。</div>'
          + keys.map(function (k) {
            return '<label class="wp-switch"><input type="checkbox" data-v="' + esc(k) + '" checked />'
              + esc(k) + "（" + vals[k] + "）</label>";
          }).join("")
          + (keys.length ? btn({ label: "適用する", variant: "primary", act: "ok", cls: "is-lg" })
            : '<div class="wp-lab">この列にはデータがありません。</div>'),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            var keep = {};
            Array.prototype.forEach.call(bodyEl.querySelectorAll("[data-v]"), function (cb) {
              if (cb.checked) keep[cb.getAttribute("data-v")] = 1;
            });
            shell.pushUndo("フィルター");
            var s = sheet(), lastC = maxCol(), removed = 0;
            for (var r = maxRow(); r >= 2; r--) {
              var v = String(computed[ref(r, c1)] === undefined ? "" : computed[ref(r, c1)]);
              if (keep[v]) continue;
              removed++;
              for (var c = 0; c <= lastC; c++) delete s.cells[ref(r, c)];
            }
            recalc(); session.touch(); drawGrid(); close();
            api.toast(removed + " 行を除きました（元に戻すで復帰できます）", "ok", 5000);
          });
        }
      });
    }
    function insertFunction(name) {
      var d = WP.functionRegistry.get(name);
      if (!d) return;
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var arg = (r2 > r1) ? ref(r1, sel.c) + ":" + ref(r2, sel.c) : "";
      var f = "=" + name + "(" + arg + ")";
      commitBar(f);
      api.toast(name + " を入れました。かっこの中を直してください。", "info", 4000);
    }
    function addSheet() {
      shell.pushUndo("シートの追加");
      var s = M.newSheet("シート" + (body.sheets.length + 1));
      body.sheets.push(s);
      si = body.sheets.length - 1;
      body.activeSheet = si;
      recalc(); session.touch(); paint();
    }
    function sheetMenu() {
      var items = [
        { label: "名前を変える", icon: "type", run: function () { renameSheet(); } },
        { label: "複製する", icon: "copy", run: function () {
          shell.pushUndo("シートの複製");
          var c = JSON.parse(JSON.stringify(sheet()));
          c.id = M.uid("sh"); c.name = sheet().name + "（コピー）";
          body.sheets.splice(si + 1, 0, c);
          si = si + 1; body.activeSheet = si;
          recalc(); session.touch(); paint();
        } },
        { label: "左へ移動", icon: "chevronD", run: function () { moveSheet(-1); } },
        { label: "右へ移動", icon: "chevronD", run: function () { moveSheet(1); } },
        { label: "削除する", icon: "trash", run: function () {
          if (body.sheets.length < 2) { api.toast("最後の 1 枚は消せません。", "warn"); return; }
          api.confirm({ title: "このシートを削除しますか", message: "中のデータも消えます。", okText: "削除" })
            .then(function (yes) {
              if (!yes) return;
              shell.pushUndo("シートの削除");
              body.sheets.splice(si, 1);
              si = Math.max(0, si - 1); body.activeSheet = si;
              recalc(); session.touch(); paint();
            });
        } }
      ];
      U.sheet(api.root, {
        title: sheet().name,
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
    function moveSheet(d) {
      var j = si + d;
      if (j < 0 || j >= body.sheets.length) return;
      var t = body.sheets[si];
      body.sheets[si] = body.sheets[j];
      body.sheets[j] = t;
      si = j; body.activeSheet = si;
      session.touch(); paint();
    }
    function renameSheet() {
      U.sheet(api.root, {
        title: "シート名",
        html: '<input class="wp-in" id="wpn" value="' + esc(sheet().name) + '" />'
          + btn({ label: "変更", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (bodyEl, close) {
          var inp = bodyEl.querySelector("#wpn");
          try { inp.focus(); inp.select(); } catch (e) {}
          function go() {
            var v = inp.value.trim();
            if (!v) return;
            sheet().name = v; session.touch(); close(); paint();
          }
          bodyEl.addEventListener("click", function (e) {
            if (e.target.closest && e.target.closest('[data-act="ok"]')) go();
          });
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
        }
      });
    }

    /* ── グラフ（§14.7）───────────────────────────────────────── */
    function chartSpec(c) {
      var s = body.sheets[c.sheet || 0] || sheet();
      var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(c.range || ""));
      if (!m) return { type: c.type, title: c.title, labels: [], series: [] };
      var c1 = M.colIndex(m[1]), r1 = Number(m[2]), c2 = M.colIndex(m[3]), r2 = Number(m[4]);
      var vals = F.recalc(s).values;
      var labels = [], series = [];
      for (var c0 = c1 + 1; c0 <= c2; c0++) series.push({ name: String(vals[M.colName(c0) + (r1 - 1)] || M.colName(c0)), values: [] });
      if (!series.length) series.push({ name: "値", values: [] });
      for (var r = r1; r <= r2; r++) {
        labels.push(String(vals[M.colName(c1) + r] === undefined ? "" : vals[M.colName(c1) + r]));
        for (var k = 0; k < series.length; k++) {
          var cc = c1 + 1 + k;
          var v = cc <= c2 ? vals[M.colName(cc) + r] : vals[M.colName(c1) + r];
          series[k].values.push(Number(v) || 0);
        }
      }
      return { type: c.type, title: c.title || "", labels: labels, series: series };
    }
    function chartDialog(editIdx) {
      var cur = editIdx !== undefined ? body.charts[editIdx] : null;
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      var range = cur ? cur.range : (ref(r1, c1) + ":" + ref(r2, Math.max(c2, c1 + 1)));
      var h = '<div class="wp-row"><label class="wp-lab" for="cr">範囲（1 列目が名前、2 列目以降が値）</label>'
        + '<input class="wp-in" id="cr" value="' + esc(range) + '" /></div>'
        + '<div class="wp-row"><label class="wp-lab" for="ct">題名</label>'
        + '<input class="wp-in" id="ct" value="' + esc(cur ? cur.title : "") + '" /></div>'
        + '<div class="wp-lab">種類</div><div class="wp-tpl">'
        + CH.TYPES.map(function (t) {
          return '<button type="button" class="wp-tpl__c" data-t="' + t.id + '">'
            + '<div class="wp-tpl__b" style="display:grid;place-items:center;background:var(--vq-surface-sunken)">'
            + icon(t.icon) + "</div><div class=\"wp-tpl__t\">" + esc(t.label) + "</div></button>";
        }).join("") + "</div>"
        + '<div data-role="prev" style="margin-top:14px"></div>';
      U.sheet(api.root, {
        title: cur ? "グラフを編集" : "グラフを作る",
        html: h,
        onOpen: function (bodyEl, close) {
          var type = cur ? cur.type : "bar";
          function preview() {
            var spec = chartSpec({ type: type, range: bodyEl.querySelector("#cr").value,
              title: bodyEl.querySelector("#ct").value, sheet: si });
            bodyEl.querySelector('[data-role="prev"]').innerHTML =
              CH.render(spec, { width: 300, height: 190 })
              + '<div class="wp-inline" style="margin-top:10px">'
              + btn({ label: cur ? "更新する" : "追加する", variant: "primary", act: "ok" }) + "</div>";
          }
          preview();
          bodyEl.addEventListener("input", preview);
          bodyEl.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-t]") : null;
            if (t) { type = t.getAttribute("data-t"); preview(); return; }
            if (!e.target.closest || !e.target.closest('[data-act="ok"]')) return;
            shell.pushUndo("グラフ");
            var spec = { id: cur ? cur.id : M.uid("ch"), type: type,
              range: bodyEl.querySelector("#cr").value, title: bodyEl.querySelector("#ct").value, sheet: si };
            if (cur) body.charts[editIdx] = spec; else body.charts.push(spec);
            session.touch();
            close();
            showRight = true; rightTab = "chart";
            paint();
          });
        }
      });
    }
    function chartToSlides(i) {
      var c = body.charts[i];
      if (!c) return;
      api.toast("スライドを作っています…", "info");
      WP.convert.chartToSlides(chartSpec(c), item).then(function (r) {
        api.toast("「" + r.item.title + "」を作りました", "ok", 4000);
      }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error", 6000); });
    }

    /* ── 書き出し・取り込み（§14.10）──────────────────────────── */
    function toCsv(delim) {
      var s = sheet(), lastR = maxRow(), lastC = maxCol();
      var vals = F.recalc(s).values;
      var out = [];
      for (var r = 1; r <= lastR; r++) {
        var row = [];
        for (var c = 0; c <= lastC; c++) {
          var v = vals[ref(r, c)];
          v = v === undefined ? "" : String(v);
          if (delim === "," && /[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
          row.push(v);
        }
        out.push(row.join(delim));
      }
      return out.join("\n");
    }
    function download(name, mime, text, bom) {
      try {
        var parts = bom ? ["﻿", text] : [text];
        var blob = new root.Blob(parts, { type: mime });
        var a = doc.createElement("a");
        a.href = root.URL.createObjectURL(blob);
        a.download = name;
        doc.body.appendChild(a); a.click();
        root.setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) {}
    }
    function exportSheet() {
      var opts = [
        { id: "csv", label: "CSV（Excel 用・BOM 付き）" },
        { id: "csvplain", label: "CSV（BOM なし）" },
        { id: "tsv", label: "TSV（タブ区切り）" },
        { id: "html", label: "HTML の表" },
        { id: "pdf", label: "PDF（印刷ダイアログから保存）" }
      ];
      U.sheet(api.root, {
        title: "書き出し",
        html: opts.map(function (x) {
          return '<button type="button" class="wp-cmd__i" data-f="' + x.id + '">'
            + icon("download") + "<span>" + esc(x.label) + "</span></button>";
        }).join("")
          + '<div class="wp-lab" style="margin-top:10px">XLSX への書き出しは未実装です。'
          + "CSV で書き出して Excel で開いてください。</div>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-f]") : null;
            if (!b) return;
            close();
            var base = (item.title || "表").replace(/[\/\\:*?"<>|]/g, "_") + "_" + sheet().name;
            var f = b.getAttribute("data-f");
            if (f === "csv") download(base + ".csv", "text/csv;charset=utf-8", toCsv(","), true);
            else if (f === "csvplain") download(base + ".csv", "text/csv;charset=utf-8", toCsv(","), false);
            else if (f === "tsv") download(base + ".tsv", "text/tab-separated-values;charset=utf-8", toCsv("\t"), true);
            else if (f === "html" || f === "pdf") {
              var html = sheetHtml();
              if (f === "html") download(base + ".html", "text/html;charset=utf-8", html);
              else {
                var w = root.open("", "_blank");
                if (!w) { api.toast("別のタブを開けませんでした。", "error"); return; }
                w.document.write(html.replace("</body>", "<script>window.onload=function(){window.print()}<\/script></body>"));
                w.document.close();
              }
            }
            api.toast("書き出しました", "ok");
          });
        }
      });
    }
    function sheetHtml() {
      var s = sheet(), lastR = maxRow(), lastC = maxCol();
      var vals = F.recalc(s).values;
      var h = "<!doctype html><html lang='ja'><head><meta charset='utf-8'><title>" + esc(item.title)
        + "</title><style>body{font-family:'Hiragino Sans',sans-serif;padding:24px}"
        + "table{border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:6px 9px;font-size:13px}"
        + "th{background:#f1f5f9}</style></head><body><h1>" + esc(item.title) + " — " + esc(s.name) + "</h1><table>";
      for (var r = 1; r <= lastR; r++) {
        h += "<tr>";
        for (var c = 0; c <= lastC; c++) {
          var v = vals[ref(r, c)];
          var cl = s.cells[ref(r, c)];
          var tag = (cl && cl.s && cl.s.b && r === 1) ? "th" : "td";
          h += "<" + tag + ">" + esc(v === undefined ? "" : v) + "</" + tag + ">";
        }
        h += "</tr>";
      }
      return h + "</table></body></html>";
    }
    function importCsv() {
      var inp = doc.createElement("input");
      inp.type = "file";
      inp.accept = ".csv,.tsv,.txt,text/csv";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var fr = new root.FileReader();
        fr.onload = function () {
          var text = String(fr.result || "").replace(/^﻿/, "");
          var delim = /\t/.test(text.split("\n")[0] || "") ? "\t" : ",";
          var rows = parseDelim(text, delim);
          if (!rows.length) { api.toast("読み取れる行がありませんでした。", "warn"); return; }
          api.confirm({ title: "取り込みますか",
            message: rows.length + " 行 × " + rows[0].length + " 列を、新しいシートとして足します。",
            okText: "取り込む" }).then(function (yes) {
            if (!yes) return;
            shell.pushUndo("CSV の取り込み");
            var s = M.newSheet(f.name.replace(/\.[^.]+$/, "").slice(0, 24));
            rows.forEach(function (r, ri) {
              r.forEach(function (v, ci) {
                if (v === "") return;
                var n = Number(String(v).replace(/,/g, ""));
                s.cells[M.colName(ci) + (ri + 1)] = { v: (!isNaN(n) && String(v).trim() !== "") ? n : v };
              });
            });
            s.rows = Math.max(60, rows.length + 10);
            s.cols = Math.max(20, rows[0].length + 4);
            s.freeze = { rows: 1, cols: 0 };
            body.sheets.push(s);
            si = body.sheets.length - 1; body.activeSheet = si;
            recalc(); session.touch(); paint();
            api.toast(rows.length + " 行を取り込みました", "ok");
          });
        };
        fr.readAsText(f);
      });
      inp.click();
    }
    /* 引用符の中の区切りと改行を正しく扱う。 */
    function parseDelim(text, delim) {
      var rows = [], row = [], cur = "", q = false;
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (q) {
          if (ch === '"') {
            if (text.charAt(i + 1) === '"') { cur += '"'; i++; }
            else q = false;
          } else cur += ch;
          continue;
        }
        if (ch === '"') { q = true; continue; }
        if (ch === delim) { row.push(cur); cur = ""; continue; }
        if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
        if (ch === "\r") continue;
        cur += ch;
      }
      if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
    }

    function moreTools() {
      var items = [
        { label: "CSV / TSV で書き出し", icon: "download", run: exportSheet },
        { label: "CSV を取り込む", icon: "upload", run: importCsv },
        { label: "重複する行を削除", icon: "filter", run: dedupe },
        { label: "空の行を削除", icon: "filter", run: dropEmpty },
        { label: "行と列を固定", icon: "lock", run: freezeHere },
        { label: "グラフを作る", icon: "chart", run: function () { chartDialog(); } },
        { label: "選んだ範囲をコピー", icon: "copy", run: copySel }
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
    function rowKey(r, lastC) {
      var out = [];
      for (var c = 0; c <= lastC; c++) out.push(String(computed[ref(r, c)] === undefined ? "" : computed[ref(r, c)]));
      return out.join("");
    }
    function dedupe() {
      shell.pushUndo("重複の削除");
      var s = sheet(), lastR = maxRow(), lastC = maxCol(), seen = {}, removed = 0;
      var keep = [];
      for (var r = 1; r <= lastR; r++) {
        var k = rowKey(r, lastC);
        if (r > 1 && seen[k]) { removed++; continue; }
        seen[k] = 1;
        var row = {};
        for (var c = 0; c <= lastC; c++) if (s.cells[ref(r, c)]) row[c] = s.cells[ref(r, c)];
        keep.push(row);
      }
      s.cells = {};
      keep.forEach(function (row, i) {
        Object.keys(row).forEach(function (c) { s.cells[ref(i + 1, Number(c))] = row[c]; });
      });
      recalc(); session.touch(); drawGrid();
      api.toast(removed ? removed + " 行の重複を消しました" : "重複はありませんでした", "ok");
    }
    function dropEmpty() {
      shell.pushUndo("空行の削除");
      var s = sheet(), lastR = maxRow(), lastC = maxCol(), keep = [], removed = 0;
      for (var r = 1; r <= lastR; r++) {
        var has = false, row = {};
        for (var c = 0; c <= lastC; c++) {
          var cl = s.cells[ref(r, c)];
          if (cl && (cl.v !== "" || cl.f)) has = true;
          if (cl) row[c] = cl;
        }
        if (has) keep.push(row); else removed++;
      }
      s.cells = {};
      keep.forEach(function (row, i) {
        Object.keys(row).forEach(function (c) { s.cells[ref(i + 1, Number(c))] = row[c]; });
      });
      recalc(); session.touch(); drawGrid();
      api.toast(removed + " 行の空行を消しました", "ok");
    }

    function aiSheet() {
      var r1 = Math.min(sel.r, sel.r2), r2 = Math.max(sel.r, sel.r2);
      var c1 = Math.min(sel.c, sel.c2), c2 = Math.max(sel.c, sel.c2);
      var lines = [];
      for (var r = r1; r <= Math.min(r2, r1 + 60); r++) {
        var row = [];
        for (var c = c1; c <= c2; c++) {
          var v = computed[ref(r, c)];
          row.push(v === undefined ? "" : v);
        }
        lines.push(row.join("\t"));
      }
      /* 選択が 1 セルだけなら、表の中身をひととおり渡す（ただし上限つき）。 */
      if (selCount() === 1) {
        lines = [];
        var lastR = Math.min(maxRow(), 60), lastC = maxCol();
        for (var rr = 1; rr <= lastR; rr++) {
          var rw = [];
          for (var cc = 0; cc <= lastC; cc++) {
            var vv = computed[ref(rr, cc)];
            rw.push(vv === undefined ? "" : vv);
          }
          lines.push(rw.join("\t"));
        }
      }
      WP.ai.open({
        api: api, itemType: "spreadsheet", item: item,
        scope: { kind: selCount() === 1 ? "sheet" : "range", text: lines.join("\n"),
          label: selCount() === 1 ? sheet().name + " 全体" : ref(r1, c1) + ":" + ref(r2, c2) },
        onApply: function (text) {
          /* 表として返ってきたら、選択の起点から流し込む（上書き前に確認する）。 */
          var rows = parseDelim(text, text.indexOf("\t") >= 0 ? "\t" : ",");
          if (!rows.length) { api.toast("表として読み取れませんでした。", "warn"); return; }
          api.confirm({ title: "この内容を入れますか",
            message: ref(sel.r, sel.c) + " から " + rows.length + " 行 × " + rows[0].length + " 列を入れます。",
            okText: "入れる" }).then(function (yes) {
            if (!yes) return;
            shell.pushUndo("AI の適用");
            rows.forEach(function (rw, ri) {
              rw.forEach(function (v, ci) {
                var n = Number(String(v).replace(/,/g, ""));
                setCell(sel.r + ri, sel.c + ci,
                  String(v).charAt(0) === "=" ? { f: v, v: "" }
                    : { v: (!isNaN(n) && String(v).trim() !== "") ? n : v, f: "" });
              });
            });
            recalc(); session.touch(); drawGrid();
          });
        },
        onFormula: function (f) {
          api.confirm({ title: "この数式を入れますか", message: ref(sel.r, sel.c) + " に入れます：" + f,
            okText: "入れる" }).then(function (yes) { if (yes) commitBar(f); });
        }
      });
    }

    function registerCommands() {
      var cmds = [
        { group: "編集", label: "行を挿入", icon: "rows", run: insertRow },
        { group: "編集", label: "列を挿入", icon: "cols", run: insertCol },
        { group: "編集", label: "重複する行を削除", icon: "filter", run: dedupe },
        { group: "編集", label: "空の行を削除", icon: "filter", run: dropEmpty },
        { group: "編集", label: "選んだ範囲をコピー", icon: "copy", run: copySel },
        { group: "データ", label: "並べ替え", icon: "sort", run: sortSheet },
        { group: "データ", label: "フィルター", icon: "filter", run: filterSheet },
        { group: "データ", label: "行と列を固定", icon: "lock", run: freezeHere },
        { group: "グラフ", label: "グラフを作る", icon: "chart", run: function () { chartDialog(); } },
        { group: "シート", label: "シートを追加", icon: "plus", run: addSheet },
        { group: "シート", label: "シート名を変える", icon: "type", run: renameSheet },
        { group: "書き出し", label: "CSV で書き出し", icon: "download",
          run: function () { download((item.title || "表") + ".csv", "text/csv;charset=utf-8", toCsv(","), true); } },
        { group: "書き出し", label: "PDF で出力", icon: "download",
          run: function () {
            var w = root.open("", "_blank");
            if (!w) { api.toast("別のタブを開けませんでした。", "error"); return; }
            w.document.write(sheetHtml().replace("</body>", "<script>window.onload=function(){window.print()}<\/script></body>"));
            w.document.close();
          } },
        { group: "取り込み", label: "CSV を取り込む", icon: "upload", run: importCsv }
      ];
      /* 関数はすべてコマンドから入れられる（Registry が唯一の出どころ）。 */
      F.list().forEach(function (d) {
        cmds.push({ group: "関数", label: d.type + " — " + (d.description || ""), icon: "code",
          keywords: d.type + " " + d.category, run: function () { insertFunction(d.type); } });
      });
      WP.convert.targetsFor("spreadsheet").forEach(function (t) {
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

  WP.sheets = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
