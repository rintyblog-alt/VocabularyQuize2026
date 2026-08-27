/* ══════════════════════════════════════════════════════════════════════
   Question Renderer（V3 §8 / §13 / §19）
   ・形式ごとに画面を作り分けない。エンジンごとに 1 つのレンダラを持つ。
   ・知らない形式が来てもアプリを落とさない。安全な代わりの表示を出す（§24）。
   ・運ぶ操作（並べ替え・分類・ラベル・語群）は 3 通りで必ず動く。
       1) 指／マウスでつかんで運ぶ（Pointer Events。iOS でも動く）
       2) 押して選ぶ → 置き先を押す（いちばん確実。指でも迷わない）
       3) キーボード（Tab で移動、Space でつかむ、矢印で動かす、Esc で戻す）
     HTML5 の drag&drop は使わない（スマートフォンで動かないため）。
   ・回答の形は evaluator.js が受け取る形とそろえる。ここが唯一の作り手。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, Q = VQ2.qtypes, M = VQ2.qmodel, EV = VQ2.evaluator;
  if (!U || !Q || !M) throw new Error("VQ2.ui / qtypes / qmodel must be loaded before question-renderer.js");
  var esc = U.esc, icon = U.icon, btn = U.button;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function letter(i) { return String.fromCharCode(65 + i); }

  /* 動きを減らす設定を尊重する。 */
  function reduced() { return U.reducedMotion ? U.reducedMotion() : false; }

  /* ══════════════════════════════════════════════════════════════════
     0) 運ぶ操作の共通部品
     ・つかむ／置く／戻す／やり直す をここに集める。
     ══════════════════════════════════════════════════════════════════ */
  function DragKit(container, o) {
    o = o || {};
    var picked = null;              /* いま持っているもの { id, el, from } */
    var ghost = null;
    var startX = 0, startY = 0, moved = false, activePointer = null;
    var undoStack = [], redoStack = [];
    var MOVE_THRESHOLD = 8;

    function itemEl(id) { return container.querySelector('[data-drag-id="' + cssEsc(id) + '"]'); }
    function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

    function setPicked(id, el) {
      clearPicked();
      picked = { id: id, el: el, from: el ? el.getAttribute("data-drag-from") : null };
      if (el) { el.classList.add("is-held"); el.setAttribute("aria-grabbed", "true"); }
      container.classList.add("is-dragging");
      markZones(true);
      if (o.onPick) o.onPick(id);
    }
    function clearPicked() {
      if (picked && picked.el) { picked.el.classList.remove("is-held"); picked.el.setAttribute("aria-grabbed", "false"); }
      picked = null;
      container.classList.remove("is-dragging");
      markZones(false);
      killGhost();
    }
    function markZones(on) {
      var zones = container.querySelectorAll("[data-drop-zone]");
      for (var i = 0; i < zones.length; i++) zones[i].classList.toggle("is-target", !!on);
    }
    function killGhost() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
    }
    function makeGhost(el, x, y) {
      if (reduced()) return;
      var r = el.getBoundingClientRect();
      ghost = el.cloneNode(true);
      ghost.className = (el.className || "") + " vq2-drag-ghost";
      ghost.style.width = r.width + "px";
      ghost.style.left = (x - r.width / 2) + "px";
      ghost.style.top = (y - r.height / 2) + "px";
      ghost.setAttribute("aria-hidden", "true");
      /* 持ち上げた見た目は **影の中へ入れる**。外（body）へ置くと、
         影の中にしかない .vq2-drag-ghost の指定が当たらず、
         位置も色も付かないまま本文の下へ積まれる。 */
      var host = rootOf(container);
      var into = (host && host.querySelector && host.querySelector(".vq2-root"))
        || (host && host.appendChild ? host : null)
        || container.ownerDocument.body || container;
      into.appendChild(ghost);
    }
    function moveGhost(x, y) {
      if (!ghost) return;
      var r = ghost.getBoundingClientRect();
      ghost.style.left = (x - r.width / 2) + "px";
      ghost.style.top = (y - r.height / 2) + "px";
    }
    /* 落とす先を座標から探す。

       **影の DOM（Shadow DOM）の中を見ること。**
       この画面は影の中に作られているので、document.elementFromPoint は
       いちばん外の入れ物（div.vq2-host）しか返さない。そこから親をたどっても
       [data-drop-zone] には永久に着かない ＝ **落とせない**。
       実測（zoneprobe）: document 経由 → DIV.vq2-host（zone 無し）
                          影の根 経由   → SPAN.vq2-sort-m（zone あり）
       これが「つまめるのに並び替わらない」の正体だった（PC・スマホの両方）。 */
    function rootOf(node) {
      var r = node && node.getRootNode ? node.getRootNode() : null;
      return (r && typeof r.elementFromPoint === "function") ? r : node.ownerDocument;
    }
    function zoneAt(x, y) {
      var el = rootOf(container).elementFromPoint(x, y);
      /* 入れ子の影があっても掘り進む（いまは 1 段だが、増えても壊れないように）。 */
      var guard = 0;
      while (el && el.shadowRoot && typeof el.shadowRoot.elementFromPoint === "function" && guard++ < 4) {
        var inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      while (el && el !== container) {
        if (el.hasAttribute && el.hasAttribute("data-drop-zone")) return el;
        el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
      }
      return null;
    }

    function commit(zone, x, y) {
      if (!picked) return;
      var id = picked.id, from = picked.from;
      clearPicked();
      if (!zone) return;
      pushUndo();
      if (o.onDrop) o.onDrop(id, zone.getAttribute("data-drop-zone"), { from: from, zoneEl: zone, x: x, y: y });
    }

    function pushUndo() {
      if (!o.snapshot) return;
      undoStack.push(o.snapshot());
      if (undoStack.length > 30) undoStack.shift();
      redoStack.length = 0;
    }

    function onPointerDown(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      var handle = closest(ev.target, "[data-drag-id]");
      if (!handle || !container.contains(handle)) return;
      if (o.disabled && o.disabled()) return;
      activePointer = ev.pointerId;
      startX = ev.clientX; startY = ev.clientY; moved = false;
      /* すでに持っているものを押し直したら置く（押して選ぶ操作） */
      if (picked && picked.id === handle.getAttribute("data-drag-id")) { clearPicked(); return; }
      setPicked(handle.getAttribute("data-drag-id"), handle);
      try { handle.setPointerCapture && handle.setPointerCapture(ev.pointerId); } catch (e) {}
    }
    function onPointerMove(ev) {
      if (!picked || ev.pointerId !== activePointer) return;
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.sqrt(dx * dx + dy * dy) < MOVE_THRESHOLD) return;
      if (!moved) { moved = true; makeGhost(picked.el, ev.clientX, ev.clientY); }
      ev.preventDefault();
      moveGhost(ev.clientX, ev.clientY);
      var z = zoneAt(ev.clientX, ev.clientY);
      var zones = container.querySelectorAll("[data-drop-zone]");
      for (var i = 0; i < zones.length; i++) zones[i].classList.toggle("is-over", zones[i] === z);
      if (o.onMove) o.onMove(picked.id, z, ev.clientX, ev.clientY);
      autoScroll(ev.clientY);
    }
    function onPointerUp(ev) {
      if (!picked || ev.pointerId !== activePointer) return;
      activePointer = null;
      var zones = container.querySelectorAll("[data-drop-zone]");
      for (var i = 0; i < zones.length; i++) zones[i].classList.remove("is-over");
      if (!moved) return;                       /* 動かしていないなら「選んだ」ままにする */
      commit(zoneAt(ev.clientX, ev.clientY), ev.clientX, ev.clientY);
    }
    function onPointerCancel() { if (picked && moved) clearPicked(); activePointer = null; }

    /* 画面の外へ運び出せないよう、端に近づいたら自動で送る。 */
    var scrollTimer = null;
    function autoScroll(y) {
      var sc = closest(container, ".vq2-pane-b") || container;
      if (!sc) return;
      var r = sc.getBoundingClientRect();
      var d = 0;
      if (y < r.top + 48) d = -14;
      else if (y > r.bottom - 48) d = 14;
      if (!d) { if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; } return; }
      if (scrollTimer) return;
      scrollTimer = setInterval(function () {
        if (!picked) { clearInterval(scrollTimer); scrollTimer = null; return; }
        sc.scrollTop += d;
      }, 16);
    }

    /* 置き先を押したとき（押して選ぶ操作） */
    function onZoneClick(ev) {
      var z = closest(ev.target, "[data-drop-zone]");
      if (!z || !container.contains(z)) return;
      if (!picked) return;
      ev.preventDefault();
      commit(z, ev.clientX, ev.clientY);
    }

    /* キーボード */
    function onKey(ev) {
      var handle = closest(ev.target, "[data-drag-id]");
      var zone = closest(ev.target, "[data-drop-zone]");
      if (ev.key === "Escape" && picked) { clearPicked(); ev.preventDefault(); return; }
      if ((ev.key === " " || ev.key === "Enter") && handle) {
        ev.preventDefault();
        if (picked && picked.id === handle.getAttribute("data-drag-id")) clearPicked();
        else setPicked(handle.getAttribute("data-drag-id"), handle);
        return;
      }
      if ((ev.key === " " || ev.key === "Enter") && zone && picked) {
        ev.preventDefault();
        commit(zone, 0, 0);
        return;
      }
      if (handle && o.onKeyMove && (ev.key === "ArrowUp" || ev.key === "ArrowDown"
          || ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        if (!ev.altKey && !picked) return;      /* 持っていないときの矢印は普通の移動 */
        ev.preventDefault();
        pushUndo();
        o.onKeyMove(handle.getAttribute("data-drag-id"), ev.key);
      }
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove, { passive: false });
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerCancel);
    container.addEventListener("click", onZoneClick);
    container.addEventListener("keydown", onKey);

    return {
      pickedId: function () { return picked ? picked.id : null; },
      clear: clearPicked,
      pushUndo: pushUndo,
      canUndo: function () { return undoStack.length > 0; },
      canRedo: function () { return redoStack.length > 0; },
      undo: function () {
        if (!undoStack.length || !o.restore) return false;
        redoStack.push(o.snapshot());
        o.restore(undoStack.pop());
        return true;
      },
      redo: function () {
        if (!redoStack.length || !o.restore) return false;
        undoStack.push(o.snapshot());
        o.restore(redoStack.pop());
        return true;
      },
      destroy: function () {
        clearPicked();
        if (scrollTimer) clearInterval(scrollTimer);
        container.removeEventListener("pointerdown", onPointerDown);
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerup", onPointerUp);
        container.removeEventListener("pointercancel", onPointerCancel);
        container.removeEventListener("click", onZoneClick);
        container.removeEventListener("keydown", onKey);
      }
    };
  }

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 共通の部品
     ══════════════════════════════════════════════════════════════════ */
  function toolbarHtml(o) {
    return '<div class="vq2-qtools">'
      + (o.hint ? '<span class="vq2-hint">' + esc(o.hint) + "</span>" : "")
      + '<span class="vq2-top-sp"></span>'
      + (o.undo !== false ? btn({ icon: "undo", label: "ひとつ戻す", size: "sm", variant: "quiet", action: "qr-undo" }) : "")
      + (o.reset !== false ? btn({ icon: "refresh", label: "やり直す", size: "sm", variant: "quiet", action: "qr-reset" }) : "")
      + "</div>";
  }

  function mediaHtml(q, o) {
    o = o || {};
    var out = "";
    arr(q.media).forEach(function (m) {
      if (m.kind === "image" && m.src) {
        out += '<figure class="vq2-qmedia"><img src="' + esc(m.src) + '" alt="' + esc(m.alt || "問題の図") + '" loading="lazy">'
             + (m.name ? "<figcaption>" + esc(m.name) + "</figcaption>" : "") + "</figure>";
      } else if (m.kind === "audio" && m.src && !o.skipAudio) {
        out += audioHtml(q, m, o);
      } else if (m.kind === "video" && m.src) {
        out += '<video class="vq2-qmedia-v" controls preload="metadata" src="' + esc(m.src) + '"></video>';
      }
    });
    return out;
  }

  /* 音声。再生できる回数の上限をここで見せる（隠して数えるとずるく見える）。
     m が無いときは「原稿を読み上げる」問題。押されたときに音声を用意する
     （ui/tts.js）。作れない端末では端末の読み上げに落ちる。 */
  function audioHtml(q, m, o) {
    var st = q.settings || {};
    /* 編集画面は「0 で何回でも」と書いてある。ここで 0 を「0 回」と読むと、
       再生ボタンが最初から押せない音声問題ができる（実際そうなっていた）。
       意味は 1 か所に決める: **0 以下は上限なし**。 */
    var limit = isNum(st.replayLimit) && st.replayLimit > 0 ? st.replayLimit : null;
    var used = o && isNum(o.replayCount) ? o.replayCount : 0;
    var left = limit === null ? null : Math.max(0, limit - used);
    var rate = isNum(st.playbackRate) ? st.playbackRate : 1;
    var src = m && m.src ? m.src : "";
    return '<div class="vq2-audio" data-audio-src="' + esc(src) + '"'
      + (src ? "" : ' data-audio-mode="script"')
      + ' data-rate="' + rate + '"'
      + (limit === null ? "" : ' data-limit="' + limit + '"') + ">"
      + btn({ icon: "play", label: "再生", size: "sm", action: "qr-audio-play",
              disabled: left !== null && left <= 0 })
      + '<span class="vq2-audio-meta">'
      + (rate !== 1 ? "×" + rate + "　" : "")
      + (limit === null ? "何回でも聞けます"
         : (left > 0 ? "あと " + left + " 回聞けます" : "もう聞けません"))
      + "</span>"
      + '<span class="vq2-audio-bar"><span class="vq2-audio-fill" style="width:0%"></span></span>'
      + "</div>";
  }

  /* 図表。値があれば自前で描く（外の読み込みを待たせない）。 */
  function chartHtml(q) {
    var c = q.chart;
    if (!c) return "";
    if (c.src) return '<figure class="vq2-qmedia"><img src="' + esc(c.src) + '" alt="' + esc(c.title || "図表") + '" loading="lazy">'
      + (c.title ? "<figcaption>" + esc(c.title) + "</figcaption>" : "") + "</figure>";
    if (c.kind === "table" && c.table) return tableViewHtml(c.table, c.title);
    var series = arr(c.series).filter(function (s) { return arr(s.values).length; });
    if (!series.length) return "";
    var cats = arr(c.categories);
    var vals = [];
    series.forEach(function (s) { arr(s.values).forEach(function (v) { if (isNum(v)) vals.push(v); }); });
    if (!vals.length) return "";
    var maxV = Math.max.apply(null, vals), minV = Math.min.apply(null, vals.concat([0]));
    var span = (maxV - minV) || 1;
    var W = 520, H = 220, PL = 46, PB = 34, PT = 14, PR = 12;
    var iw = W - PL - PR, ih = H - PT - PB;
    var n = Math.max(cats.length, series[0].values.length);
    var body = "";
    /* 目盛り。読み取り問題なので、目盛りが無いと答えが決められない。 */
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = minV + span * (t / ticks);
      var y = PT + ih - ih * (t / ticks);
      body += '<line class="vq2-ch-grid" x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) + '"/>'
            + '<text class="vq2-ch-lbl" x="' + (PL - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + esc(fmtNum(v)) + "</text>";
    }
    if (c.kind === "line") {
      series.forEach(function (s, si) {
        var pts = arr(s.values).map(function (v, i) {
          var x = PL + (n > 1 ? iw * (i / (n - 1)) : iw / 2);
          var y = PT + ih - ih * ((v - minV) / span);
          return x.toFixed(1) + "," + y.toFixed(1);
        }).join(" ");
        body += '<polyline class="vq2-ch-line vq2-ch-s' + (si % 4) + '" points="' + pts + '"/>';
        arr(s.values).forEach(function (v, i) {
          var x = PL + (n > 1 ? iw * (i / (n - 1)) : iw / 2);
          var y = PT + ih - ih * ((v - minV) / span);
          body += '<circle class="vq2-ch-dot vq2-ch-s' + (si % 4) + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4"/>';
        });
      });
    } else {
      var gw = iw / Math.max(1, n);
      var bw = Math.max(6, (gw - 8) / series.length);
      series.forEach(function (s, si) {
        arr(s.values).forEach(function (v, i) {
          if (!isNum(v)) return;
          var h = ih * ((v - minV) / span);
          var x = PL + gw * i + 4 + bw * si;
          var y = PT + ih - h;
          body += '<rect class="vq2-ch-bar vq2-ch-s' + (si % 4) + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1)
                + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" rx="2"/>';
        });
      });
    }
    cats.forEach(function (cat, i) {
      var x = c.kind === "line"
        ? PL + (n > 1 ? iw * (i / (n - 1)) : iw / 2)
        : PL + (iw / Math.max(1, n)) * i + (iw / Math.max(1, n)) / 2;
      body += '<text class="vq2-ch-lbl" x="' + x.toFixed(1) + '" y="' + (H - PB + 18) + '" text-anchor="middle">' + esc(cat) + "</text>";
    });
    body += '<line class="vq2-ch-axis" x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (PT + ih) + '"/>'
          + '<line class="vq2-ch-axis" x1="' + PL + '" y1="' + (PT + ih) + '" x2="' + (W - PR) + '" y2="' + (PT + ih) + '"/>';

    return '<figure class="vq2-chart">'
      + (c.title ? '<figcaption class="vq2-chart-t">' + esc(c.title) + "</figcaption>" : "")
      + '<div class="vq2-chart-w"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(c.title || "図表") + '">'
      + body + "</svg></div>"
      + (series.length > 1
          ? '<div class="vq2-chart-lg">' + series.map(function (s, i) {
              return '<span class="vq2-chart-lgi"><i class="vq2-ch-sw vq2-ch-s' + (i % 4) + '"></i>' + esc(s.name) + "</span>";
            }).join("") + "</div>"
          : "")
      + (c.unit ? '<div class="vq2-hint">単位: ' + esc(c.unit) + "</div>" : "")
      + "</figure>";
  }
  function fmtNum(v) {
    if (!isNum(v)) return "";
    if (Math.abs(v) >= 10000) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }
  function tableViewHtml(t, caption) {
    if (!t) return "";
    return '<div class="vq2-tw"><table class="vq2-table">'
      + (caption ? "<caption>" + esc(caption) + "</caption>" : "")
      + (arr(t.columns).length ? "<thead><tr>"
          + (arr(t.rows).some(function (r) { return str(r.header); }) ? "<th></th>" : "")
          + t.columns.map(function (c) { return '<th scope="col">' + esc(c.text) + "</th>"; }).join("")
          + "</tr></thead>" : "")
      + "<tbody>" + arr(t.rows).map(function (r) {
          return "<tr>"
            + (arr(t.rows).some(function (x) { return str(x.header); }) ? '<th scope="row">' + esc(r.header) + "</th>" : "")
            + arr(r.cells).map(function (c) { return "<td>" + esc(c.text) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     2) エンジンごとのレンダラ
     ・html(ctx) → 回答欄の HTML
     ・bind(ctx) → 出来事の結線（省略可）
     ══════════════════════════════════════════════════════════════════ */
  var RENDERERS = {};

  function markClass(locked, isCorrect, picked) {
    if (!locked) return picked ? " is-picked" : "";
    if (isCorrect) return " is-correct";
    return picked ? " is-wrong" : "";
  }
  function markTag(locked, isCorrect, picked) {
    if (!locked) return "";
    if (isCorrect) return '<span class="vq2-choice-tag is-correct">正解' + (picked ? "・あなたの答え" : "") + "</span>";
    if (picked) return '<span class="vq2-choice-tag is-wrong">あなたの答え</span>';
    return "";
  }

  function orderedChoices(ctx) {
    var list = arr(ctx.q.choices).slice();
    var order = ctx.opts.choiceOrder;
    if (order && order.length) {
      list.sort(function (a, b) {
        var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
    }
    /* 「該当なし」は必ず最後に置く。混ぜると意味が変わる。 */
    var none = list.filter(function (c) { return c.isNone; });
    if (none.length) list = list.filter(function (c) { return !c.isNone; }).concat(none);
    return list;
  }

  /* ── 単一選択（○×・画像選択・音声選択も同じ） ─────────────────── */
  function singleChoiceHtml(ctx) {
    var q = ctx.q, locked = ctx.locked;
    var picked = pickedChoiceId(ctx.value);
    var list = orderedChoices(ctx);
    var isImage = q.engine === "image_choice" || list.some(function (c) { return c.image; });
    var h = "";
    if (q.engine === "audio_choice") h += audioBlock(ctx);
    h += '<div class="vq2-q-choices' + (isImage ? " is-grid" : "") + '" role="radiogroup" aria-label="選択肢">'
      + list.map(function (c, i) {
          var sel = str(picked) === str(c.id);
          var inner = isImage
            ? (c.image ? '<img class="vq2-choice-img" src="' + esc(c.image) + '" alt="' + esc(c.text || ("選択肢" + letter(i))) + '" loading="lazy">' : "")
              + (c.text ? '<span class="vq2-choice-cap">' + esc(c.text) + "</span>" : "")
            : '<span style="line-height:1.7">' + esc(c.text) + "</span>";
          return '<button type="button" class="vq2-choice' + markClass(locked, c.isCorrect, sel) + '"'
            + ' role="radio" aria-checked="' + (sel ? "true" : "false") + '"'
            + ' data-qr-choice="' + esc(c.id) + '"' + (locked || ctx.readonly ? " disabled" : "")
            + ' style="cursor:pointer;text-align:left;width:100%">'
            + '<span class="vq2-choice-l">' + esc(c.label || letter(i)) + "</span>"
            + '<span class="vq2-choice-m">' + inner + markTag(locked, c.isCorrect, sel)
            + (c.audio ? '<span class="vq2-choice-a2">' + btn({ icon: "play", label: "聞く", size: "sm", variant: "quiet", action: "qr-choice-audio", id: c.id }) + "</span>" : "")
            + "</span></button>";
        }).join("") + "</div>";
    if (q.settings && q.settings.confidenceEnabled) h += confidenceHtml(ctx);
    return h;
  }
  function pickedChoiceId(value) {
    if (value == null) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.length ? str(value[0]) : null;
    if (isObj(value)) {
      if (value.choiceId) return str(value.choiceId);
      if (Array.isArray(value.choiceIds) && value.choiceIds.length) return str(value.choiceIds[0]);
    }
    return null;
  }
  /* 音声ファイルがあればそれを、無ければ原稿を読み上げる。
     どちらも無ければ何も出さない（押せない再生ボタンを置かない）。 */
  function audioBlock(ctx) {
    var m = M.firstMedia(ctx.q, "audio");
    if (!m && !scriptOf(ctx.q)) return "";
    return audioHtml(ctx.q, m, ctx.opts);
  }
  function scriptOf(q) {
    var T = root.VQ2 && root.VQ2.tts;
    if (T && T.scriptOf) return T.scriptOf(q);
    return str(q && q.script).trim();
  }
  function hasAudioBlock(q) {
    return !!(M.firstMedia(q, "audio") || scriptOf(q));
  }
  /* 自分で再生ボタンを出すエンジン（上の audioBlock を呼ぶもの）。 */
  var OWN_AUDIO = { audio_choice: 1, dictation: 1, fill_blank: 1, text_input: 1, numeric_input: 1 };
  /* 自信度。結果画面で「自信と正答率のずれ」を出すために取る。 */
  function confidenceHtml(ctx) {
    var v = isObj(ctx.value) && isNum(ctx.value.confidence) ? ctx.value.confidence : null;
    var LABELS = ["あてずっぽう", "自信なし", "ふつう", "たぶん合っている", "確実"];
    return '<div class="vq2-conf"><span class="vq2-label">どのくらい自信がありますか</span>'
      + '<div class="vq2-conf-r" role="radiogroup" aria-label="自信度">'
      + LABELS.map(function (l, i) {
          var n = i + 1;
          return '<button type="button" class="vq2-conf-b' + (v === n ? " is-on" : "") + '"'
            + ' role="radio" aria-checked="' + (v === n ? "true" : "false") + '"'
            + ' data-qr-conf="' + n + '"' + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
            + '<span class="vq2-conf-n">' + n + "</span><span>" + esc(l) + "</span></button>";
        }).join("") + "</div></div>";
  }

  RENDERERS.single_choice = { html: singleChoiceHtml };
  RENDERERS.true_false = { html: singleChoiceHtml };
  RENDERERS.image_choice = { html: singleChoiceHtml };
  RENDERERS.audio_choice = { html: singleChoiceHtml };

  /* ── 複数選択 ─────────────────────────────────────────────────── */
  RENDERERS.multi_choice = {
    html: function (ctx) {
      var q = ctx.q, locked = ctx.locked;
      var picks = pickedChoiceIds(ctx.value);
      var list = orderedChoices(ctx);
      var need = arr(q.choices).filter(function (c) { return c.isCorrect; }).length;
      return '<div class="vq2-q-choices" role="group" aria-label="選択肢（複数選べます）">'
        + list.map(function (c, i) {
            var sel = picks.indexOf(str(c.id)) >= 0;
            return '<button type="button" class="vq2-choice' + markClass(locked, c.isCorrect, sel) + '"'
              + ' aria-pressed="' + (sel ? "true" : "false") + '" data-qr-choice-multi="' + esc(c.id) + '"'
              + (locked || ctx.readonly ? " disabled" : "") + ' style="cursor:pointer;text-align:left;width:100%">'
              + '<span class="vq2-choice-l">' + (sel ? icon("check") : esc(c.label || letter(i))) + "</span>"
              + '<span class="vq2-choice-m"><span style="line-height:1.7">' + esc(c.text) + "</span>"
              + markTag(locked, c.isCorrect, sel) + "</span></button>";
          }).join("")
        + '</div><div class="vq2-hint">当てはまるものをすべて選びます'
        + (locked ? "（正解は " + need + " つ）" : "") + "。選んだ数: " + picks.length + "</div>";
    }
  };
  function pickedChoiceIds(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map(str);
    if (isObj(value) && Array.isArray(value.choiceIds)) return value.choiceIds.map(str);
    if (typeof value === "string") return value ? [value] : [];
    return [];
  }

  /* ── 文字入力・数値入力 ───────────────────────────────────────── */
  function textInputHtml(ctx) {
    var q = ctx.q, st = q.settings || {}, sr = q.scoringRule || {};
    var v = isObj(ctx.value) && ctx.value.text !== undefined ? str(ctx.value.text)
          : (typeof ctx.value === "string" ? ctx.value : "");
    var numeric = q.engine === "numeric_input";
    var mono = !!st.monospace;
    var expected = str(q.correctAnswer);
    var hints = [];
    if (st.hintKind === "length" && expected) hints.push("答えは " + expected.length + " 文字です。");
    if (st.hintKind === "initial" && expected) hints.push("最初の文字は「" + expected.charAt(0) + "」です。");
    if (sr.unit) hints.push("単位: " + sr.unit);
    if (isNum(st.maxLength)) hints.push(st.maxLength + " 文字以内");

    var h = "";
    if (hasAudioBlock(q)) h += audioBlock(ctx);
    h += '<div class="vq2-field">'
      + '<input type="text" class="vq2-input' + (mono ? " is-mono" : "") + '" data-qr-text'
      + ' inputmode="' + (numeric ? "decimal" : "text") + '"'
      + ' autocomplete="off" autocapitalize="off" spellcheck="false"'
      + (isNum(st.maxLength) ? ' maxlength="' + Math.min(2000, st.maxLength) + '"' : "")
      + ' placeholder="' + (numeric ? "数で答えます" : "解答を入力します") + '"'
      + ' value="' + esc(v) + '"' + (ctx.locked || ctx.readonly ? " disabled" : "") + ">";
    if (st.hintKind === "progressive" && expected && !ctx.locked) {
      var shown = isNum(ctx.opts.hintStep) ? ctx.opts.hintStep : 0;
      h += '<div class="vq2-hintrow">'
        + '<span class="vq2-hint-chars">' + expected.split("").map(function (c, i) {
            return '<span class="vq2-hint-c' + (i < shown ? " is-on" : "") + '">' + (i < shown ? esc(c) : "・") + "</span>";
          }).join("") + "</span>"
        + btn({ label: "1 文字ひらく", icon: "eye", size: "sm", variant: "quiet", action: "qr-hint-step",
                disabled: shown >= expected.length })
        + "</div>"
        + '<div class="vq2-hint">ひらいた分だけ得点が下がります。</div>';
    }
    if (hints.length) h += '<div class="vq2-hint">' + esc(hints.join("　")) + "</div>";
    h += "</div>";
    return h;
  }
  RENDERERS.text_input = { html: textInputHtml };
  RENDERERS.numeric_input = { html: textInputHtml };

  /* ── 書き取り ─────────────────────────────────────────────────── */
  RENDERERS.dictation = {
    html: function (ctx) {
      var v = isObj(ctx.value) && ctx.value.text !== undefined ? str(ctx.value.text) : "";
      return audioBlock(ctx)
        + '<div class="vq2-field">'
        + '<textarea class="vq2-input" data-qr-text rows="4" placeholder="聞こえたとおりに書きます"'
        + ' autocomplete="off" autocapitalize="off" spellcheck="false"'
        + (ctx.locked || ctx.readonly ? " disabled" : "") + ">" + esc(v) + "</textarea>"
        + '<div class="vq2-hint">語ごとに部分点が付きます。分かるところまで書いてください。</div></div>';
    }
  };

  /* ── 記述 ─────────────────────────────────────────────────────── */
  RENDERERS.free_text = {
    html: function (ctx) {
      var q = ctx.q, st = q.settings || {};
      var v = isObj(ctx.value) && ctx.value.text !== undefined ? str(ctx.value.text)
            : (typeof ctx.value === "string" ? ctx.value : "");
      var len = v.length;
      var min = isNum(st.minLength) ? st.minLength : null;
      var max = isNum(st.maxLength) ? st.maxLength : null;
      var state = "";
      if (max !== null && len > max) state = " is-over";
      else if (min !== null && len && len < min) state = " is-short";
      var rows = max && max > 600 ? 12 : (max && max < 120 ? 4 : 8);
      var h = '<div class="vq2-field">'
        + '<textarea class="vq2-input' + (st.monospace ? " is-mono" : "") + '" data-qr-text rows="' + rows + '"'
        + ' placeholder="解答を入力します"' + (ctx.locked || ctx.readonly ? " disabled" : "") + ">" + esc(v) + "</textarea>"
        + '<div class="vq2-hint' + state + '"><span data-qr-count>' + len + "</span> 文字"
        + (min !== null || max !== null
            ? "（" + (min !== null ? min + " 文字以上" : "") + (min !== null && max !== null ? "・" : "")
              + (max !== null ? max + " 文字以内" : "") + "）"
            : "")
        + "</div></div>";
      /* 採点基準を先に見せる。何を書けば点になるかを隠さない。 */
      if (arr(q.scoringRubric && q.scoringRubric.items).length && ctx.opts.showRubric !== false) {
        h += '<details class="vq2-rubric-peek"' + (ctx.locked ? " open" : "") + ">"
          + "<summary>採点の基準を見る（" + q.scoringRubric.items.length + " 項目）</summary>"
          + '<ul class="vq2-rubric-list">'
          + q.scoringRubric.items.map(function (it) {
              return "<li><span>" + esc(it.description) + "</span><b>" + it.points + " 点</b></li>";
            }).join("") + "</ul></details>";
      }
      return h;
    }
  };

  /* ── 穴埋め ───────────────────────────────────────────────────── */
  RENDERERS.fill_blank = {
    html: function (ctx) {
      var q = ctx.q, st = q.settings || {};
      var blanks = arr(q.blanks);
      var vals = fillValues(ctx.value, blanks.length);
      var mode = st.blankMode === "select" ? "select" : (st.blankMode === "drag" ? "drag" : "input");
      var h = "";
      if (hasAudioBlock(q)) h += audioBlock(ctx);

      if (mode === "drag") {
        var bank = wordBank(q);
        var used = {};
        vals.forEach(function (v) { if (v) used[v] = (used[v] || 0) + 1; });
        h += '<div class="vq2-dragwrap" data-qr-drag="fill">';
        h += toolbarHtml({ hint: "語を押してから、入れたい空欄を押します。つかんで運ぶこともできます。" });
        h += '<div class="vq2-bank" data-drop-zone="__bank__">'
          + bank.map(function (w) {
              var left = (w.count || 1) - (used[w.text] || 0);
              return '<button type="button" class="vq2-bank-i' + (left <= 0 ? " is-used" : "") + '"'
                + ' data-drag-id="' + esc(w.id) + '" data-bank-text="' + esc(w.text) + '"'
                + ' data-drag-from="__bank__" aria-grabbed="false"'
                + (ctx.locked || ctx.readonly || left <= 0 ? " disabled" : "") + ">" + esc(w.text) + "</button>";
            }).join("")
          + (bank.length ? "" : '<span class="vq2-muted">語群がありません。</span>')
          + "</div>";
        h += '<div class="vq2-blanks">' + blanks.map(function (b, i) {
            return '<div class="vq2-blank-row">'
              + '<span class="vq2-blank-n">' + esc(b.label || String(i + 1)) + "</span>"
              + '<button type="button" class="vq2-blank-slot' + (vals[i] ? " is-filled" : "") + '"'
              + ' data-drop-zone="b' + i + '" data-blank-slot="' + i + '"'
              + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
              + (vals[i] ? esc(vals[i]) : '<span class="vq2-muted">ここに入れます</span>') + "</button>"
              + (vals[i] && !ctx.locked ? btn({ icon: "close", iconOnly: true, size: "sm", variant: "quiet",
                                                action: "qr-blank-clear", id: String(i), aria: "この空欄を空にする" }) : "")
              + "</div>";
          }).join("") + "</div></div>";
        return h;
      }

      h += '<div class="vq2-blanks">' + blanks.map(function (b, i) {
        var inner;
        if (mode === "select" && arr(b.options).length) {
          inner = '<select class="vq2-input vq2-select" data-qr-blank="' + i + '"'
            + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
            + '<option value="">選んでください</option>'
            + b.options.map(function (o) {
                return '<option value="' + esc(o.id) + '"' + (str(vals[i]) === str(o.id) ? " selected" : "") + ">" + esc(o.text) + "</option>";
              }).join("") + "</select>";
        } else {
          inner = '<input type="text" class="vq2-input" data-qr-blank="' + i + '"'
            + ' autocomplete="off" autocapitalize="off" spellcheck="false"'
            + ' value="' + esc(vals[i] || "") + '" placeholder="空欄 ' + (i + 1) + '"'
            + (ctx.locked || ctx.readonly ? " disabled" : "") + ">";
        }
        return '<div class="vq2-blank-row"><label class="vq2-blank-n" for="">' + esc(b.label || String(i + 1)) + "</label>" + inner + "</div>";
      }).join("") + "</div>";
      if (blanks.length > 1) h += '<div class="vq2-hint">空欄ごとに部分点が付きます。</div>';
      return h;
    }
  };
  function fillValues(value, n) {
    var out = new Array(n);
    var src = Array.isArray(value) ? value
      : (isObj(value) && Array.isArray(value.blanks) ? value.blanks : []);
    for (var i = 0; i < n; i++) out[i] = str(src[i] || "");
    return out;
  }
  /* 語群。指定が無ければ空欄の正解から作る（重複はまとめて回数を持つ）。 */
  function wordBank(q) {
    var explicit = arr(q.wordBank);
    if (explicit.length) {
      return explicit.map(function (w, i) {
        if (typeof w === "string") return { id: "w" + i, text: w, count: 1 };
        return { id: str(w.id) || ("w" + i), text: str(w.text), count: isNum(w.count) ? w.count : 1 };
      });
    }
    var seen = Object.create(null), out = [];
    arr(q.blanks).forEach(function (b) {
      var t = str(b.answer);
      if (!t) return;
      if (seen[t] !== undefined) { out[seen[t]].count++; return; }
      seen[t] = out.length;
      out.push({ id: "w" + out.length, text: t, count: 1 });
    });
    arr(q.blanks).forEach(function (b) {
      arr(b.options).forEach(function (o) {
        var t = str(o.text);
        if (!t || seen[t] !== undefined) return;
        seen[t] = out.length;
        out.push({ id: "w" + out.length, text: t, count: 1 });
      });
    });
    /* 並びは固定しない。正解の順に並んでいると答えが分かってしまう。 */
    return shuffleStable(out, q.id);
  }
  /* 問題 ID から決まる並び。毎回の描き直しで動かないようにする。 */
  function shuffleStable(list, seedStr) {
    var seed = 0, s = str(seedStr);
    for (var i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      var k = seed % (j + 1);
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  /* ── 並べ替え ─────────────────────────────────────────────────── */
  RENDERERS.reorder = {
    html: function (ctx) {
      var q = ctx.q;
      var items = arr(q.orderItems);
      var byId = Object.create(null);
      items.forEach(function (it) { byId[it.id] = it; });
      var order = currentOrder(ctx.value, items, q.id);
      var want = arr(q.correctOrder);
      return '<div class="vq2-dragwrap" data-qr-drag="reorder">'
        + toolbarHtml({ hint: ctx.opts.mobile
            ? "上下のボタンで動かせます。つかんで運ぶこともできます。"
            : "つかんで運ぶか、上下のボタンで動かします。キーボードは Space でつかんで矢印で動かします。" })
        + '<ol class="vq2-sort" role="list">'
        + order.map(function (id, i) {
            var it = byId[id];
            if (!it) return "";
            var okMark = "";
            if (ctx.locked && want.length) {
              var ok = want[i] === id;
              okMark = '<span class="vq2-choice-tag ' + (ok ? "is-correct" : "is-wrong") + '">' + (ok ? "正しい位置" : "違う位置") + "</span>";
            }
            return '<li class="vq2-sort-i' + (ctx.locked && want.length ? (want[i] === id ? " is-correct" : " is-wrong") : "") + '"'
              + ' data-drag-id="' + esc(id) + '" data-drop-zone="pos' + i + '" tabindex="0"'
              + ' aria-grabbed="false" aria-label="' + esc((i + 1) + " 番目: " + (it.text || "項目")) + '">'
              + '<span class="vq2-sort-h" aria-hidden="true">' + icon("drag") + "</span>"
              + '<span class="vq2-sort-n">' + (i + 1) + "</span>"
              + '<span class="vq2-sort-m">'
              + (it.image ? '<img class="vq2-sort-img" src="' + esc(it.image) + '" alt="" loading="lazy">' : "")
              /* 文の入れ物には名前を付ける。名前が無いと CSS で幅を守れず、
                 狭い画面で 1 文字ずつ折れて縦書きのように見える（実測 320px で 44px 幅・14 行）。 */
              + '<span class="vq2-sort-t">' + esc(it.text) + "</span>" + okMark + "</span>"
              + (ctx.locked || ctx.readonly ? "" : '<span class="vq2-sort-a">'
                  + btn({ icon: "chevronU", iconOnly: true, size: "sm", variant: "quiet", action: "qr-up", id: id, aria: "1 つ上へ", disabled: i === 0 })
                  + btn({ icon: "chevronD", iconOnly: true, size: "sm", variant: "quiet", action: "qr-down", id: id, aria: "1 つ下へ", disabled: i === order.length - 1 })
                  + "</span>")
              + "</li>";
          }).join("")
        + "</ol></div>";
    }
  };
  function currentOrder(value, items, seed) {
    var ids = items.map(function (i) { return i.id; });
    var given = Array.isArray(value) ? value.map(str)
      : (isObj(value) && Array.isArray(value.order) ? value.order.map(str) : null);
    if (given && given.length) {
      /* 保存済みの並びに、消えた項目・増えた項目があっても壊さない。 */
      var kept = given.filter(function (id) { return ids.indexOf(id) >= 0; });
      ids.forEach(function (id) { if (kept.indexOf(id) < 0) kept.push(id); });
      return kept;
    }
    /* 最初の並びは、正解の順そのままにしない。 */
    return shuffleStable(items, seed + "|start").map(function (i) { return i.id; });
  }

  /* ── 組み合わせ ───────────────────────────────────────────────── */
  RENDERERS.matching = {
    html: function (ctx) {
      var q = ctx.q;
      var p = q.pairs || { left: [], right: [], correct: {} };
      var pairs = isObj(ctx.value) ? ctx.value : {};
      var rightOrder = shuffleStable(arr(p.right), q.id + "|r");
      var rIndex = Object.create(null);
      rightOrder.forEach(function (r, i) { rIndex[r.id] = i; });
      var usedBy = Object.create(null);
      Object.keys(pairs).forEach(function (l) { if (pairs[l]) usedBy[pairs[l]] = l; });

      return '<div class="vq2-dragwrap vq2-match" data-qr-drag="matching">'
        + toolbarHtml({ hint: "左を押してから、つなげたい右を押します。" })
        + '<div class="vq2-match-b">'
        + '<div class="vq2-match-col" data-side="left">'
        + arr(p.left).map(function (l, i) {
            var got = str(pairs[l.id] || "");
            var want = str(p.correct && p.correct[l.id] || "");
            var ok = ctx.locked ? (got && got === want) : null;
            return '<button type="button" class="vq2-match-i'
              + (got ? " is-linked" : "") + (ctx.locked ? (ok ? " is-correct" : " is-wrong") : "") + '"'
              + ' data-drag-id="' + esc(l.id) + '" data-match-left="' + esc(l.id) + '" tabindex="0"'
              + ' aria-grabbed="false"' + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
              + '<span class="vq2-match-n">' + esc(l.label || letter(i)) + "</span>"
              + (l.image ? '<img class="vq2-match-img" src="' + esc(l.image) + '" alt="" loading="lazy">' : "")
              + '<span class="vq2-match-t">' + esc(l.text) + "</span>"
              + '<span class="vq2-match-link">' + (got && isNum(rIndex[got]) ? String(rIndex[got] + 1) : "―") + "</span>"
              + "</button>";
          }).join("")
        + "</div>"
        + '<svg class="vq2-match-lines" aria-hidden="true"></svg>'
        + '<div class="vq2-match-col" data-side="right">'
        + rightOrder.map(function (r, i) {
            var takenBy = usedBy[r.id];
            return '<button type="button" class="vq2-match-i' + (takenBy ? " is-linked" : "") + (r.isDummy && ctx.locked ? " is-dummy" : "") + '"'
              + ' data-drop-zone="' + esc(r.id) + '" data-match-right="' + esc(r.id) + '" tabindex="0"'
              + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
              + '<span class="vq2-match-n">' + (i + 1) + "</span>"
              + (r.image ? '<img class="vq2-match-img" src="' + esc(r.image) + '" alt="" loading="lazy">' : "")
              + '<span class="vq2-match-t">' + esc(r.text) + "</span>"
              + (r.isDummy && ctx.locked ? '<span class="vq2-choice-tag">使わない</span>' : "")
              + "</button>";
          }).join("")
        + "</div></div>"
        + '<div class="vq2-hint">つないだ数だけ部分点が付きます。'
        + (arr(p.right).some(function (r) { return r.isDummy; }) ? "使わない項目が混ざっています。" : "") + "</div></div>";
    }
  };

  /* ── 分類 ─────────────────────────────────────────────────────── */
  RENDERERS.classification = {
    html: function (ctx) {
      var q = ctx.q;
      var c = q.classification || { groups: [], items: [] };
      var placed = (isObj(ctx.value) && isObj(ctx.value.items)) ? ctx.value.items : {};
      var pool = arr(c.items).filter(function (it) { return !str(placed[it.id]); });
      pool = shuffleStable(pool, q.id + "|p");

      function itemBtn(it, inZone) {
        var ok = null;
        if (ctx.locked) ok = str(placed[it.id]) === str(it.groupId);
        return '<button type="button" class="vq2-cls-i'
          + (ctx.locked && inZone ? (ok ? " is-correct" : " is-wrong") : "") + '"'
          + ' data-drag-id="' + esc(it.id) + '" data-drag-from="' + esc(inZone || "__pool__") + '" tabindex="0"'
          + ' aria-grabbed="false"' + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
          + (it.image ? '<img class="vq2-cls-img" src="' + esc(it.image) + '" alt="" loading="lazy">' : "")
          + esc(it.text)
          + (ctx.locked && inZone && !ok ? '<span class="vq2-choice-tag is-wrong">違う</span>' : "")
          + "</button>";
      }

      return '<div class="vq2-dragwrap" data-qr-drag="classification">'
        + toolbarHtml({ hint: "項目を押してから、入れたい箱を押します。つかんで運ぶこともできます。" })
        + '<div class="vq2-cls-pool" data-drop-zone="__pool__">'
        + '<div class="vq2-label">まだ分けていないもの（' + pool.length + "）</div>"
        + '<div class="vq2-cls-row">' + (pool.length ? pool.map(function (it) { return itemBtn(it, null); }).join("")
            : '<span class="vq2-muted">すべて分け終わりました。</span>') + "</div></div>"
        + '<div class="vq2-cls-groups">'
        + arr(c.groups).map(function (g) {
            var mine = arr(c.items).filter(function (it) { return str(placed[it.id]) === str(g.id); });
            return '<div class="vq2-cls-g' + (g.isExclude ? " is-ex" : "") + '" data-drop-zone="' + esc(g.id) + '" tabindex="0">'
              + '<div class="vq2-cls-gh">' + esc(g.label) + '<span class="vq2-cls-c">' + mine.length + "</span></div>"
              + '<div class="vq2-cls-row">' + (mine.length ? mine.map(function (it) { return itemBtn(it, g.id); }).join("")
                  : '<span class="vq2-muted">ここへ入れます</span>') + "</div></div>";
          }).join("")
        + "</div>"
        + '<div class="vq2-hint">合った数だけ部分点が付きます。</div></div>';
    }
  };

  /* ── 表の完成 ─────────────────────────────────────────────────── */
  RENDERERS.table_fill = {
    html: function (ctx) {
      var q = ctx.q, t = q.table;
      if (!t) return fallbackHtml(ctx, "表が設定されていません。");
      var given = (isObj(ctx.value) && isObj(ctx.value.cells)) ? ctx.value.cells : {};
      var hasHeader = arr(t.rows).some(function (r) { return str(r.header); });
      return '<div class="vq2-tw"><table class="vq2-table is-fill">'
        + (t.caption ? "<caption>" + esc(t.caption) + "</caption>" : "")
        + (arr(t.columns).length ? "<thead><tr>" + (hasHeader ? "<th></th>" : "")
            + t.columns.map(function (c) { return '<th scope="col">' + esc(c.text) + "</th>"; }).join("") + "</tr></thead>" : "")
        + "<tbody>" + arr(t.rows).map(function (r) {
            return "<tr>" + (hasHeader ? '<th scope="row">' + esc(r.header) + "</th>" : "")
              + arr(r.cells).map(function (cell) {
                  if (!cell.editable) return "<td>" + esc(cell.text) + "</td>";
                  var v = str(given[cell.id] || "");
                  var mark = "";
                  if (ctx.locked) {
                    var want = [cell.answer].concat(arr(cell.acceptedAnswers)).filter(Boolean);
                    var ok = want.some(function (w) { return str(w).trim() === v.trim(); });
                    mark = ok ? " is-correct" : " is-wrong";
                  }
                  if (arr(cell.options).length) {
                    return '<td class="is-edit' + mark + '"><select class="vq2-input vq2-select" data-qr-cell="' + esc(cell.id) + '"'
                      + (ctx.locked || ctx.readonly ? " disabled" : "") + '><option value="">選ぶ</option>'
                      + cell.options.map(function (o) {
                          return '<option value="' + esc(o.id) + '"' + (v === str(o.id) ? " selected" : "") + ">" + esc(o.text) + "</option>";
                        }).join("") + "</select>"
                      + (ctx.locked ? '<div class="vq2-cell-ans">正解: ' + esc(cell.answer) + "</div>" : "") + "</td>";
                  }
                  return '<td class="is-edit' + mark + '"><input type="text" class="vq2-input" data-qr-cell="' + esc(cell.id) + '"'
                    + ' value="' + esc(v) + '" autocomplete="off" aria-label="埋めるます"'
                    + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
                    + (ctx.locked ? '<div class="vq2-cell-ans">正解: ' + esc(cell.answer) + "</div>" : "") + "</td>";
                }).join("") + "</tr>";
          }).join("") + "</tbody></table></div>"
        + '<div class="vq2-hint">ますごとに部分点が付きます。</div>';
    }
  };

  /* ── 画像内の位置 ─────────────────────────────────────────────── */
  RENDERERS.image_point = {
    html: function (ctx) {
      var q = ctx.q;
      var m = M.firstMedia(q, "image");
      if (!m) return fallbackHtml(ctx, "画像が設定されていません。");
      var pts = (isObj(ctx.value) && arr(ctx.value.points).length) ? arr(ctx.value.points) : [];
      var multi = arr(q.hotspots).length > 1 || (q.settings && q.settings.multiPoint);
      var zoomOn = !(q.settings && q.settings.zoomEnabled === false);
      var z = isNum(ctx.opts.zoom) ? ctx.opts.zoom : 1;

      var marks = pts.map(function (p, i) {
        return '<span class="vq2-pt" style="left:' + (clamp01(p.x) * 100) + "%;top:" + (clamp01(p.y) * 100) + '%">'
          + (multi ? (i + 1) : "") + "</span>";
      }).join("");
      /* 答え合わせのあとは、正解の場所も出す。「違う」だけでは直せない。 */
      var reveal = "";
      if (ctx.locked) {
        reveal = arr(q.hotspots).map(function (h) {
          if (h.shape === "rect") {
            return '<span class="vq2-hs is-rect" style="left:' + (h.x * 100) + "%;top:" + (h.y * 100)
              + "%;width:" + (h.width * 100) + "%;height:" + (h.height * 100) + '%"></span>';
          }
          if (h.shape === "circle") {
            var d = (isNum(h.r) ? h.r : 0.05) * 2 * 100;
            return '<span class="vq2-hs is-circ" style="left:' + (h.x * 100) + "%;top:" + (h.y * 100)
              + "%;width:" + d + "%;padding-bottom:" + d + '%"></span>';
          }
          return "";
        }).join("");
      }

      return '<div class="vq2-imgq" data-qr-imgpoint>'
        + (zoomOn ? '<div class="vq2-qtools">'
            + '<span class="vq2-hint">' + (multi ? "当てはまる場所をすべて押します。" : "画像の上の場所を押します。") + "</span>"
            + '<span class="vq2-top-sp"></span>'
            + btn({ label: "縮小", icon: "chevronD", size: "sm", variant: "quiet", action: "qr-zoom-out", disabled: z <= 1 })
            + '<span class="vq2-zoom-n">×' + (Math.round(z * 10) / 10) + "</span>"
            + btn({ label: "拡大", icon: "chevronU", size: "sm", variant: "quiet", action: "qr-zoom-in", disabled: z >= 4 })
            + (pts.length && !ctx.locked ? btn({ label: "やり直す", icon: "refresh", size: "sm", variant: "quiet", action: "qr-reset" }) : "")
            + "</div>" : "")
        + '<div class="vq2-imgq-vp" data-imgq-viewport>'
        + '<div class="vq2-imgq-in" data-imgq-stage style="transform:scale(' + z + ')">'
        + '<img src="' + esc(m.src) + '" alt="' + esc(m.alt || "問題の画像") + '" draggable="false">'
        + reveal + marks
        + "</div></div>"
        + '<div class="vq2-hint">'
        + (pts.length ? "押した場所: " + pts.length + " 件" : "まだ押していません")
        + (ctx.locked ? "　薄い丸が正解の場所です。" : "") + "</div></div>";
    }
  };

  /* ── 図へのラベル配置 ─────────────────────────────────────────── */
  RENDERERS.image_label = {
    html: function (ctx) {
      var q = ctx.q;
      var m = M.firstMedia(q, "image");
      if (!m) return fallbackHtml(ctx, "画像が設定されていません。");
      var L = q.labels || { slots: [], bank: [] };
      var placed = (isObj(ctx.value) && isObj(ctx.value.slots)) ? ctx.value.slots : {};
      var usedIds = Object.create(null);
      Object.keys(placed).forEach(function (s) { if (placed[s]) usedIds[placed[s]] = 1; });
      var bank = shuffleStable(arr(L.bank), q.id + "|lb");
      var byId = Object.create(null);
      arr(L.bank).forEach(function (b) { byId[b.id] = b; });

      return '<div class="vq2-dragwrap" data-qr-drag="label">'
        + toolbarHtml({ hint: "ラベルを押してから、置きたい場所を押します。" })
        + '<div class="vq2-imgq"><div class="vq2-imgq-vp"><div class="vq2-imgq-in">'
        + '<img src="' + esc(m.src) + '" alt="' + esc(m.alt || "問題の図") + '" draggable="false">'
        + arr(L.slots).map(function (s, i) {
            var got = str(placed[s.id] || "");
            var lab = got && byId[got] ? byId[got].text : "";
            var mark = "";
            if (ctx.locked) mark = got && got === str(s.answerId) ? " is-correct" : " is-wrong";
            return '<button type="button" class="vq2-lslot' + (got ? " is-filled" : "") + mark + '"'
              + ' style="left:' + (clamp01(s.x) * 100) + "%;top:" + (clamp01(s.y) * 100) + '%"'
              + ' data-drop-zone="' + esc(s.id) + '" tabindex="0"'
              + ' aria-label="' + esc("置き場所 " + (i + 1) + (lab ? "：" + lab : "")) + '"'
              + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
              + (lab ? esc(lab) : String(i + 1))
              + (ctx.locked && got !== str(s.answerId) && byId[s.answerId]
                  ? '<span class="vq2-lslot-ans">正: ' + esc(byId[s.answerId].text) + "</span>" : "")
              + "</button>";
          }).join("")
        + "</div></div></div>"
        + '<div class="vq2-bank" data-drop-zone="__bank__">'
        + bank.map(function (b) {
            return '<button type="button" class="vq2-bank-i' + (usedIds[b.id] ? " is-used" : "") + '"'
              + ' data-drag-id="' + esc(b.id) + '" data-drag-from="__bank__" aria-grabbed="false"'
              + (ctx.locked || ctx.readonly || usedIds[b.id] ? " disabled" : "") + ">" + esc(b.text) + "</button>";
          }).join("") + "</div>"
        + '<div class="vq2-hint">合った数だけ部分点が付きます。</div></div>';
    }
  };

  /* ── 図表の読み取り ───────────────────────────────────────────── */
  RENDERERS.chart_read = {
    html: function (ctx) {
      var body = arr(ctx.q.choices).length ? singleChoiceHtml(ctx) : textInputHtml(ctx);
      return body;
    }
  };

  /* ── 誤文訂正 ─────────────────────────────────────────────────── */
  RENDERERS.error_correction = {
    html: function (ctx) {
      var q = ctx.q;
      var spans = arr(q.errorSpans);
      if (!spans.length) return fallbackHtml(ctx, "どこが誤りかが設定されていません。");
      var given = (isObj(ctx.value) && isObj(ctx.value.spans)) ? ctx.value.spans : {};
      /* 誤りの箇所を本文の中で目立たせる。どこを直すのかが分からないと解けない。 */
      var marked = esc(q.prompt);
      spans.forEach(function (sp, i) {
        if (!sp.wrong) return;
        var w = esc(sp.wrong);
        marked = marked.replace(w, '<mark class="vq2-ec-m" data-span="' + esc(sp.id) + '">' + w
          + '<sup class="vq2-ec-n">' + (i + 1) + "</sup></mark>");
      });
      return '<div class="vq2-ec"><div class="vq2-ec-body">' + marked + "</div>"
        + spans.map(function (sp, i) {
            var v = str(given[sp.id] || "");
            var mark = "";
            if (ctx.locked) {
              var want = [sp.correct].concat(arr(sp.acceptedAnswers)).filter(Boolean);
              mark = want.some(function (w) { return str(w).trim().toLowerCase() === v.trim().toLowerCase(); })
                ? " is-correct" : " is-wrong";
            }
            return '<div class="vq2-ec-row' + mark + '">'
              + '<span class="vq2-ec-n2">' + (i + 1) + "</span>"
              + '<span class="vq2-ec-w">' + esc(sp.wrong) + "</span>"
              + '<span class="vq2-ec-ar" aria-hidden="true">→</span>'
              + '<input type="text" class="vq2-input" data-qr-span="' + esc(sp.id) + '" value="' + esc(v) + '"'
              + ' placeholder="正しい形" aria-label="' + esc(sp.wrong + " の正しい形") + '"'
              + ' autocomplete="off" autocapitalize="off" spellcheck="false"'
              + (ctx.locked || ctx.readonly ? " disabled" : "") + ">"
              + (ctx.locked ? '<span class="vq2-ec-ans">正解: ' + esc(sp.correct) + "</span>" : "")
              + "</div>";
          }).join("")
        + '<div class="vq2-hint">直した数だけ部分点が付きます。</div></div>';
    }
  };

  /* ── カード ───────────────────────────────────────────────────── */
  RENDERERS.flashcard = {
    html: function (ctx) {
      var q = ctx.q, st = q.settings || {};
      var card = q.card || { front: q.prompt, back: str(q.correctAnswer) };
      var reverse = st.face === "back";
      var faceUp = ctx.opts.cardFlipped === true;
      var front = reverse ? card.back : card.front;
      var back = reverse ? card.front : card.back;
      var mark = isObj(ctx.value) ? str(ctx.value.mark) : "";
      return '<div class="vq2-card3" data-qr-card>'
        + '<button type="button" class="vq2-card3-f' + (faceUp ? " is-flipped" : "") + '" data-qr-flip'
        + ' aria-label="' + (faceUp ? "裏を表示中。押すと表に戻ります" : "押すと裏を表示します") + '">'
        + '<span class="vq2-card3-t">' + esc(faceUp ? back : front) + "</span>"
        + '<span class="vq2-card3-h">' + (faceUp ? "押して表へ" : "押して答えを見る") + "</span>"
        + "</button>"
        + (faceUp
            ? '<div class="vq2-card3-a">'
              + btn({ label: "まだ", icon: "refresh", variant: mark === "unknown" ? "primary" : "", action: "qr-card-mark", id: "unknown" })
              + btn({ label: "覚えた", icon: "check", variant: mark === "known" ? "primary" : "", action: "qr-card-mark", id: "known" })
              + "</div>"
            : '<div class="vq2-hint">思い出してから、押して答えを見ます。</div>')
        + "</div>";
    }
  };

  /* ── 複合大問 ─────────────────────────────────────────────────── */
  RENDERERS.composite = {
    html: function (ctx) {
      var q = ctx.q;
      var kids = arr(q.children);
      if (!kids.length) return fallbackHtml(ctx, "小問がありません。");
      var vals = (isObj(ctx.value) && isObj(ctx.value.children)) ? ctx.value.children : {};
      var sub = isNum(ctx.opts.subIndex) ? Math.max(0, Math.min(kids.length - 1, ctx.opts.subIndex)) : 0;
      var mobile = !!ctx.opts.mobile;
      var tab = ctx.opts.compositeTab || (mobile ? "q" : "both");

      var contextHtml = '<div class="vq2-comp-src">'
        + (q.instruction ? '<div class="vq2-comp-inst">' + esc(q.instruction) + "</div>" : "")
        + (q.contextRich ? M.RC.toHtml(q.contextRich, { className: "vq2-rc" })
           : (q.context ? '<div class="vq2-rc">' + esc(q.context).replace(/\n/g, "<br>") + "</div>" : ""))
        + mediaHtml(q, ctx.opts)
        + chartHtml(q)
        + "</div>";

      var navHtml = '<div class="vq2-comp-nav" role="tablist" aria-label="小問">'
        + kids.map(function (c, i) {
            var done = vals[c.id] !== undefined && !(EV && EV.isUnanswered(c, vals[c.id]));
            return '<button type="button" class="vq2-comp-t' + (i === sub ? " is-on" : "") + (done ? " is-done" : "") + '"'
              + ' role="tab" aria-selected="' + (i === sub ? "true" : "false") + '" data-qr-sub="' + i + '">'
              + "問 " + (i + 1) + (done ? '<span class="vq2-comp-dot" aria-label="回答済み"></span>' : "") + "</button>";
          }).join("") + "</div>";

      var child = kids[sub];
      var childCtx = Object.assign({}, ctx, {
        q: child, value: vals[child.id],
        opts: Object.assign({}, ctx.opts, { inComposite: true, subIndex: undefined })
      });
      var childHtml = '<div class="vq2-comp-q" data-qr-child="' + esc(child.id) + '">'
        + '<div class="vq2-row" style="gap:8px;margin-bottom:8px">'
        + U.badge("小問 " + (sub + 1) + " / " + kids.length)
        + U.badge(Q.shortLabel(child.type))
        + (isNum(child.points) ? U.badge(child.points + " 点") : "")
        + "</div>"
        + '<div class="vq2-qtext">' + esc(child.prompt) + "</div>"
        + mediaHtml(child, ctx.opts)
        + '<div class="vq2-comp-qbody">' + engineHtml(childCtx) + "</div>"
        + "</div>";

      if (mobile) {
        return '<div class="vq2-comp is-mobile" data-qr-composite>'
          + '<div class="vq2-comp-tabs" role="tablist">'
          + '<button type="button" class="vq2-comp-tb' + (tab === "src" ? " is-on" : "") + '" data-qr-ctab="src" role="tab" aria-selected="' + (tab === "src") + '">資料</button>'
          + '<button type="button" class="vq2-comp-tb' + (tab !== "src" ? " is-on" : "") + '" data-qr-ctab="q" role="tab" aria-selected="' + (tab !== "src") + '">問題</button>'
          + "</div>"
          + (tab === "src" ? contextHtml : navHtml + childHtml)
          + "</div>";
      }
      return '<div class="vq2-comp" data-qr-composite>'
        + '<div class="vq2-comp-l">' + contextHtml + "</div>"
        + '<div class="vq2-comp-r">' + navHtml + childHtml + "</div>"
        + "</div>";
    }
  };

  /* ── 代わりの表示（未対応・壊れたデータ） ─────────────────────── */
  /* data-qr-fallback を必ず付ける。
     「その形式の操作 UI が出た」のか「代わりの表示に落ちた」のかを、
     見た目ではなく**印**で判別できるようにするため（§31 の検証で使う）。
     印が無いと、代わりの表示を数えて「表示できています」と言えてしまう。 */
  function fallbackHtml(ctx, why) {
    var d = Q.getOrUnknown(ctx.q.type);
    return '<div class="vq2-card vq2-qfallback" data-qr-fallback="1">'
      + '<div class="vq2-row" style="gap:8px;align-items:flex-start">'
      + U.statusChip("warning", "表示できません")
      + "<div><div><b>" + esc(d.name) + "</b>（" + esc(str(ctx.q.type)) + "）</div>"
      + '<div class="vq2-hint" style="margin-top:4px">' + esc(why || d.description) + "</div>"
      + '<div class="vq2-hint">この問題は飛ばして先へ進めます。作った人に知らせると直せます。</div>'
      + "</div></div>"
      + '<div style="margin-top:10px">'
      + btn({ label: "この問題を報告する", icon: "flag", size: "sm", variant: "quiet", action: "qr-report" })
      + "</div></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 入口
     ══════════════════════════════════════════════════════════════════ */
  function ctxOf(question, value, opts) {
    opts = opts || {};
    var q = question && question.modelVersion === M.MODEL_VERSION ? question : M.normalize(question || {});
    return {
      q: q, value: value, opts: opts,
      locked: !!opts.locked,          /* 採点後（正誤を出す） */
      readonly: !!opts.readonly       /* 見るだけ */
    };
  }

  function engineHtml(ctx) {
    var q = ctx.q;
    if (!q.engine) return fallbackHtml(ctx, "この形式にはまだ対応していません。");
    var r = RENDERERS[q.engine];
    if (!r) return fallbackHtml(ctx, "この形式にはまだ対応していません（" + q.engine + "）。");
    try {
      return r.html(ctx);
    } catch (e) {
      /* 1 問のデータが壊れていてもアプリ全体を落とさない（§24）。 */
      return fallbackHtml(ctx, "この問題のデータに足りないところがあります。");
    }
  }

  /* 問題文と資料。複合大問は自分で資料を出すので、外では出さない。 */
  function promptHtml(question, opts) {
    var ctx = ctxOf(question, null, opts);
    var q = ctx.q;
    if (q.engine === "composite") return "";
    var h = "";
    if (q.instruction) h += '<div class="vq2-qinst">' + esc(q.instruction) + "</div>";
    if (q.contextRich) h += '<div class="vq2-qctx">' + M.RC.toHtml(q.contextRich, { className: "vq2-rc" }) + "</div>";
    else if (q.context) h += '<div class="vq2-qctx"><div class="vq2-rc">' + esc(q.context).replace(/\n/g, "<br>") + "</div></div>";
    if (q.promptRich) h += '<div class="vq2-qtext">' + M.RC.toHtml(q.promptRich, { className: "vq2-rc" }) + "</div>";
    /* 答える場所の側が本文をそのまま出す形式は、ここでは出さない。
       誤文訂正は「誤りに印を付けた本文」を答える場所へ出すので、
       ここでも出すと同じ文が 2 回並ぶ（実際そうなっていた）。 */
    else if (q.engine !== "flashcard" && q.engine !== "error_correction")
      h += '<div class="vq2-qtext">' + esc(q.prompt) + "</div>";
    /* 答える場所の側で自分の再生ボタンを出す形式は、ここでは音声を出さない。
       出すと再生ボタンが 2 つ並び、聞ける回数の数え方も 2 つに割れる。 */
    h += mediaHtml(q, Object.assign({}, opts || {},
      OWN_AUDIO[q.engine] ? { skipAudio: true } : null));
    h += chartHtml(q);
    return h;
  }

  function html(question, value, opts) {
    return engineHtml(ctxOf(question, value, opts));
  }

  /* 結果画面用。正解を出したうえで、自分の答えを再現する。 */
  function reviewHtml(question, value, opts) {
    var o = Object.assign({}, opts || {}, { locked: true, readonly: true });
    var ctx = ctxOf(question, value, o);
    return engineHtml(ctx);
  }

  /* 描き直さずに DOM を直す形式（運ぶ操作は描き直すと持っているものが消える）。 */
  var LIVE_ENGINES = { reorder: 1, classification: 1, image_label: 1, image_point: 1, matching: 1, fill_blank: 1 };
  function needsLiveDom(engine) { return !!LIVE_ENGINES[engine]; }

  /* ══════════════════════════════════════════════════════════════════
     3') その形式の操作 UI が本当に出たかを、外から確かめる（§31）

     「並び替えなさい」と書いてあるのに入力欄しか出ない、という訴えがあった。
     見た目を人が見て気づくまで分からない状態をやめる。
     ここでは **描いた HTML そのもの**を見て、次の 3 つを区別する。

       ① その形式の操作 UI が出た      … operationUi = true
       ② 代わりの表示に落ちた          … fallback = true（data-qr-fallback）
       ③ 描こうとして落ちた            … ok = false

     ENGINE_MARK は「その操作 UI なら必ず出る印」。
     印は実際の出力から採っている（勝手な名前を書かない）。
     ══════════════════════════════════════════════════════════════════ */
  var ENGINE_MARK = {
    single_choice: "data-qr-choice",
    true_false: "data-qr-choice",
    image_choice: "data-qr-choice",
    audio_choice: "data-qr-choice",
    multi_choice: "data-qr-choice",
    text_input: "data-qr-text",
    numeric_input: "data-qr-text",
    dictation: "data-qr-text",
    free_text: "data-qr-text",
    fill_blank: "data-qr-blank",
    reorder: 'data-qr-drag="reorder"',
    matching: 'data-qr-drag="matching"',
    classification: 'data-qr-drag="classification"',
    table_fill: "data-qr-cell",
    image_point: "data-qr-imgpoint",
    image_label: 'data-qr-drag="label"',
    /* 図表の読み取りは、選択肢があれば選択・無ければ入力。どちらかが出る。 */
    chart_read: ["data-qr-choice", "data-qr-text"],
    error_correction: "data-qr-span",
    flashcard: "data-qr-flip",
    composite: "data-qr-composite"
  };

  function markOf(engine) { return ENGINE_MARK[engine] || null; }
  function hasMark(h, mark) {
    if (!mark) return null;                       /* 印を決めていない＝判定しない */
    var list = Array.isArray(mark) ? mark : [mark];
    for (var i = 0; i < list.length; i++) if (h.indexOf(list[i]) >= 0) return true;
    return false;
  }

  /* 1 問を実際に描いて、何が出たかを返す。画面は作らない（HTML を作るだけ）。 */
  function probeRender(question, value, opts) {
    var ctx = ctxOf(question, value, opts || {});
    var q = ctx.q;
    var out = { engine: q.engine || null, type: q.type || null, ok: false,
                fallback: false, operationUi: null, mark: null, html: "", reason: "" };
    if (!q.engine) { out.reason = "形式（エンジン）が決まっていません。"; return out; }
    var r = RENDERERS[q.engine];
    if (!r) { out.reason = "表示のしくみがありません（" + q.engine + "）。"; return out; }
    var h;
    try { h = r.html(ctx); }
    catch (e) { out.reason = "描こうとすると落ちます: " + str(e && e.message); return out; }
    out.html = str(h);
    out.fallback = out.html.indexOf("data-qr-fallback") >= 0;
    out.mark = markOf(q.engine);
    out.operationUi = out.fallback ? false : hasMark(out.html, out.mark);
    out.ok = !out.fallback && out.operationUi !== false;
    if (out.fallback) out.reason = "代わりの表示に落ちています（この形式の操作 UI が出ていません）。";
    else if (out.operationUi === false) out.reason = "この形式の操作 UI が出ていません（" + q.engine + "）。";
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 結線
     ・container の中だけを見る。onChange(value, meta) で外へ返す。
     ・meta.rerender が true のときだけ、呼び出し側は描き直す。
     ══════════════════════════════════════════════════════════════════ */
  function bind(container, question, value, opts) {
    opts = opts || {};
    var ctx = ctxOf(question, value, opts);
    var q = ctx.q;
    var onChange = opts.onChange || function () {};
    var onLocal = opts.onLocalState || function () {};
    var current = value;
    var kit = null;
    var childBinding = null;
    var destroyed = false;
    if (ctx.locked || ctx.readonly) { bindMediaOnly(); return api(); }

    function emit(v, meta) {
      current = v;
      onChange(v, meta || {});
    }
    /* 描き直しは中身だけ。container そのものは差し替えないので、
       container へ張った結線は 1 回きりにする（毎回張ると二重に効く）。 */
    function repaint() {
      if (destroyed) return;
      if (kit) { kit.destroy(); kit = null; }
      if (childBinding) { childBinding.destroy(); childBinding = null; }
      var scroll = container.scrollTop;
      container.innerHTML = html(q, current, opts);
      container.scrollTop = scroll;
      wireDynamic();
    }

    function api() {
      return {
        destroy: function () {
          destroyed = true;
          if (kit) kit.destroy();
          if (childBinding) childBinding.destroy();
        },
        repaint: repaint
      };
    }

    function bindMediaOnly() {
      container.addEventListener("click", function (ev) {
        var a = closest(ev.target, '[data-act="qr-audio-play"]');
        if (a) playAudio(closest(a, ".vq2-audio"), opts, null, q);
      });
    }

    /* container へ 1 回だけ張る（出来事の委譲）。 */
    function wireOnce() {
      bindCommon();
      var e = q.engine;
      if (e === "single_choice" || e === "true_false" || e === "image_choice" || e === "audio_choice"
          || (e === "chart_read" && arr(q.choices).length)) bindSingle();
      else if (e === "multi_choice") bindMulti();
      else if (e === "fill_blank") bindBlankDelegate();
      else if (e === "reorder") bindReorderDelegate();
      else if (e === "matching") bindMatchingDelegate();
      else if (e === "image_point") bindImagePointDelegate();
      else if (e === "flashcard") bindFlashcard();
      else if (e === "composite") bindCompositeTabs();
    }

    /* 描き直すたびに張り直す（中の要素が入れ替わるもの）。 */
    function wireDynamic() {
      var e = q.engine;
      if (e === "text_input" || e === "numeric_input" || e === "dictation" || e === "free_text"
          || (e === "chart_read" && !arr(q.choices).length)) bindText();
      else if (e === "fill_blank") bindBlankInputs();
      else if (e === "reorder") makeReorderKit();
      else if (e === "matching") makeMatchingKit();
      else if (e === "classification") makeClassificationKit();
      else if (e === "table_fill") bindTable();
      else if (e === "image_point") bindImagePointStage();
      else if (e === "image_label") makeImageLabelKit();
      else if (e === "error_correction") bindErrorCorrection();
      else if (e === "composite") bindCompositeChild();
    }

    function bindCommon() {
      container.addEventListener("click", function (ev) {
        var a = closest(ev.target, "[data-act]");
        if (!a) return;
        var act = a.getAttribute("data-act");
        if (act === "qr-audio-play") { playAudio(closest(a, ".vq2-audio"), opts, function (n) { onLocal({ replayCount: n }); }, q); return; }
        if (act === "qr-choice-audio") {
          var c = arr(q.choices).filter(function (x) { return x.id === a.getAttribute("data-id"); })[0];
          if (c && c.audio) playSrc(c.audio, 1);
          return;
        }
        if (act === "qr-hint-step") {
          var step = (isNum(opts.hintStep) ? opts.hintStep : 0) + 1;
          opts.hintStep = step;
          onLocal({ hintStep: step, hintUsed: true });
          repaint();
          return;
        }
        if (act === "qr-report") { if (opts.onReport) opts.onReport(q); return; }
        if (act === "qr-undo") { if (kit && kit.undo()) repaint(); return; }
        if (act === "qr-reset") { emit(null, { rerender: false }); repaint(); return; }
      });
      /* 自信度は形式に関係なく共通で拾う。 */
      container.addEventListener("click", function (ev) {
        var b = closest(ev.target, "[data-qr-conf]");
        if (!b) return;
        var n = Number(b.getAttribute("data-qr-conf"));
        var v = isObj(current) ? Object.assign({}, current) : {};
        v.confidence = n;
        emit(v, { rerender: false });
        var all = container.querySelectorAll("[data-qr-conf]");
        for (var i = 0; i < all.length; i++) {
          var on = Number(all[i].getAttribute("data-qr-conf")) === n;
          all[i].classList.toggle("is-on", on);
          all[i].setAttribute("aria-checked", on ? "true" : "false");
        }
      });
    }

    function bindSingle() {
      container.addEventListener("click", function (ev) {
        var b = closest(ev.target, "[data-qr-choice]");
        if (!b || b.disabled) return;
        var id = b.getAttribute("data-qr-choice");
        var v = { choiceId: id };
        if (isObj(current) && isNum(current.confidence)) v.confidence = current.confidence;
        emit(v, { rerender: false });
        var all = container.querySelectorAll("[data-qr-choice]");
        for (var i = 0; i < all.length; i++) {
          var on = all[i].getAttribute("data-qr-choice") === id;
          all[i].classList.toggle("is-picked", on);
          all[i].setAttribute("aria-checked", on ? "true" : "false");
        }
      });
    }

    function bindMulti() {
      container.addEventListener("click", function (ev) {
        var b = closest(ev.target, "[data-qr-choice-multi]");
        if (!b || b.disabled) return;
        var id = b.getAttribute("data-qr-choice-multi");
        var picks = pickedChoiceIds(current);
        var at = picks.indexOf(id);
        if (at >= 0) picks.splice(at, 1); else picks.push(id);
        emit({ choiceIds: picks }, { rerender: false });
        repaint();
      });
    }

    function bindText() {
      var input = container.querySelector("[data-qr-text]");
      if (!input) return;
      var count = container.querySelector("[data-qr-count]");
      input.addEventListener("input", function () {
        var v = { text: input.value };
        if (isObj(current) && isNum(current.confidence)) v.confidence = current.confidence;
        emit(v, { rerender: false });
        if (count) count.textContent = String(input.value.length);
      });
    }

    /* ── 穴埋め ── */
    function blankCount() { return arr(q.blanks).length; }
    function bindBlankInputs() {
      if ((q.settings || {}).blankMode === "drag") { makeBlankKit(); return; }
      var inputs = container.querySelectorAll("[data-qr-blank]");
      for (var i = 0; i < inputs.length; i++) {
        (function (el) {
          var idx = Number(el.getAttribute("data-qr-blank"));
          var evName = el.tagName === "SELECT" ? "change" : "input";
          el.addEventListener(evName, function () {
            var vals = fillValues(current, blankCount());
            vals[idx] = el.value;
            emit({ blanks: vals }, { rerender: false });
          });
        })(inputs[i]);
      }
    }
    function bindBlankDelegate() {
      container.addEventListener("click", function (ev) {
        var c = closest(ev.target, '[data-act="qr-blank-clear"]');
        if (!c) return;
        var vals = fillValues(current, blankCount());
        vals[Number(c.getAttribute("data-id"))] = "";
        if (kit) kit.pushUndo();
        emit({ blanks: vals }, { rerender: false });
        repaint();
      });
    }
    function makeBlankKit() {
      var wrap = container.querySelector('[data-qr-drag="fill"]');
      if (!wrap) return;
      var byId = Object.create(null);
      wordBank(q).forEach(function (w) { byId[w.id] = w; });
      kit = DragKit(wrap, {
        snapshot: function () { return clone(fillValues(current, blankCount())); },
        restore: function (s) { emit({ blanks: s }, { rerender: false }); repaint(); },
        onDrop: function (dragId, zone) {
          var w = byId[dragId];
          if (!w || zone === "__bank__") return;
          var m = /^b(\d+)$/.exec(zone);
          if (!m) return;
          var vals = fillValues(current, blankCount());
          vals[Number(m[1])] = w.text;
          emit({ blanks: vals }, { rerender: false });
          repaint();
        }
      });
    }

    /* ── 並べ替え ── */
    function orderNow() { return currentOrder(current, arr(q.orderItems), q.id); }
    function setOrder(list) { emit({ order: list }, { rerender: false }); repaint(); }
    function moveItem(id, delta) {
      var o = orderNow();
      var at = o.indexOf(id);
      if (at < 0) return;
      var to = Math.max(0, Math.min(o.length - 1, at + delta));
      if (to === at) return;
      o.splice(at, 1); o.splice(to, 0, id);
      setOrder(o);
    }
    function bindReorderDelegate() {
      container.addEventListener("click", function (ev) {
        var a = closest(ev.target, "[data-act]");
        if (!a) return;
        var act = a.getAttribute("data-act");
        if (act !== "qr-up" && act !== "qr-down") return;
        if (kit) kit.pushUndo();
        moveItem(a.getAttribute("data-id"), act === "qr-up" ? -1 : 1);
      });
    }
    function makeReorderKit() {
      var wrap = container.querySelector('[data-qr-drag="reorder"]');
      if (!wrap) return;
      kit = DragKit(wrap, {
        snapshot: function () { return orderNow(); },
        restore: function (s) { setOrder(s); },
        onDrop: function (dragId, zone) {
          var m = /^pos(\d+)$/.exec(zone);
          if (!m) return;
          var o = orderNow();
          var at = o.indexOf(dragId);
          if (at < 0) return;
          o.splice(at, 1);
          o.splice(Math.max(0, Math.min(o.length, Number(m[1]))), 0, dragId);
          setOrder(o);
        },
        onKeyMove: function (dragId, key) {
          moveItem(dragId, (key === "ArrowUp" || key === "ArrowLeft") ? -1 : 1);
          setTimeout(function () {
            var el = container.querySelector('[data-drag-id="' + String(dragId).replace(/["\\]/g, "\\$&") + '"]');
            if (el) el.focus();
          }, 0);
        }
      });
    }

    /* ── 組み合わせ ── */
    function pairsNow() { return isObj(current) ? Object.assign({}, current) : {}; }
    function setPairs(p) { emit(p, { rerender: false }); repaint(); }
    function bindMatchingDelegate() {
      container.addEventListener("click", function (ev) {
        var l = closest(ev.target, "[data-match-left]");
        if (!l || l.disabled) return;
        var lid = l.getAttribute("data-match-left");
        var p = pairsNow();
        /* すでにつないである左をもう一度押したら、つなぎを外す。 */
        if (p[lid]) { if (kit) kit.pushUndo(); delete p[lid]; setPairs(p); }
      });
    }
    function makeMatchingKit() {
      var wrap = container.querySelector('[data-qr-drag="matching"]');
      if (!wrap) return;
      kit = DragKit(wrap, {
        snapshot: function () { return pairsNow(); },
        restore: function (s) { setPairs(s); },
        onDrop: function (leftId, rightId) {
          var p = pairsNow();
          /* 右はひとつの左としかつながない。 */
          Object.keys(p).forEach(function (k) { if (p[k] === rightId) delete p[k]; });
          p[leftId] = rightId;
          setPairs(p);
        }
      });
      drawMatchLines(wrap);
      if (root.ResizeObserver && !bindMatchingDelegate._ro) {
        try {
          bindMatchingDelegate._ro = new root.ResizeObserver(function () {
            var w = container.querySelector('[data-qr-drag="matching"]');
            if (w) drawMatchLines(w);
          });
          bindMatchingDelegate._ro.observe(container);
        } catch (e) {}
      }
    }
    function drawMatchLines(wrap) {
      var svg = wrap.querySelector(".vq2-match-lines");
      var box = wrap.querySelector(".vq2-match-b");
      if (!svg || !box) return;
      var br = box.getBoundingClientRect();
      if (!br.width) return;
      svg.setAttribute("viewBox", "0 0 " + Math.round(br.width) + " " + Math.round(br.height));
      var p = pairsNow(), out = "";
      Object.keys(p).forEach(function (lid) {
        var le = wrap.querySelector('[data-match-left="' + String(lid).replace(/["\\]/g, "\\$&") + '"]');
        var re = wrap.querySelector('[data-match-right="' + String(p[lid]).replace(/["\\]/g, "\\$&") + '"]');
        if (!le || !re) return;
        var a = le.getBoundingClientRect(), b = re.getBoundingClientRect();
        var x1 = a.right - br.left, y1 = a.top + a.height / 2 - br.top;
        var x2 = b.left - br.left, y2 = b.top + b.height / 2 - br.top;
        out += '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + " C" + (x1 + 30).toFixed(1) + " " + y1.toFixed(1)
             + " " + (x2 - 30).toFixed(1) + " " + y2.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1) + '"/>';
      });
      svg.innerHTML = out;
    }

    /* ── 分類 ── */
    function makeClassificationKit() {
      var wrap = container.querySelector('[data-qr-drag="classification"]');
      if (!wrap) return;
      function items() { return (isObj(current) && isObj(current.items)) ? Object.assign({}, current.items) : {}; }
      function setItems(m) { emit({ items: m }, { rerender: false }); repaint(); }
      kit = DragKit(wrap, {
        snapshot: function () { return items(); },
        restore: function (s) { setItems(s); },
        onDrop: function (itemId, zone) {
          var m = items();
          if (zone === "__pool__") delete m[itemId]; else m[itemId] = zone;
          setItems(m);
        }
      });
    }

    /* ── 表 ── */
    function bindTable() {
      var cells = container.querySelectorAll("[data-qr-cell]");
      for (var i = 0; i < cells.length; i++) {
        (function (el) {
          var id = el.getAttribute("data-qr-cell");
          var evName = el.tagName === "SELECT" ? "change" : "input";
          el.addEventListener(evName, function () {
            var m = (isObj(current) && isObj(current.cells)) ? Object.assign({}, current.cells) : {};
            m[id] = el.value;
            emit({ cells: m }, { rerender: false });
          });
        })(cells[i]);
      }
    }

    /* ── 画像内の位置 ── */
    function bindImagePointDelegate() {
      container.addEventListener("click", function (ev) {
        var a = closest(ev.target, "[data-act]");
        if (!a) return;
        var act = a.getAttribute("data-act");
        if (act !== "qr-zoom-in" && act !== "qr-zoom-out") return;
        var z = isNum(opts.zoom) ? opts.zoom : 1;
        z = act === "qr-zoom-in" ? Math.min(4, z + 0.5) : Math.max(1, z - 0.5);
        opts.zoom = z;
        onLocal({ zoom: z });
        repaint();
      });
    }
    function bindImagePointStage() {
      var wrap = container.querySelector("[data-qr-imgpoint]");
      if (!wrap) return;
      var vp = wrap.querySelector("[data-imgq-viewport]");
      var img = wrap.querySelector("[data-imgq-stage] img");
      if (!vp || !img) return;
      var multi = arr(q.hotspots).length > 1 || (q.settings || {}).multiPoint;
      var downX = 0, downY = 0, panning = false, sx = 0, sy = 0;
      var cur = { x: 0.5, y: 0.5 };

      vp.addEventListener("pointerdown", function (ev) {
        downX = ev.clientX; downY = ev.clientY;
        panning = (isNum(opts.zoom) ? opts.zoom : 1) > 1;
        sx = vp.scrollLeft; sy = vp.scrollTop;
      });
      vp.addEventListener("pointermove", function (ev) {
        if (!panning || !ev.buttons) return;
        vp.scrollLeft = sx - (ev.clientX - downX);
        vp.scrollTop = sy - (ev.clientY - downY);
      });
      vp.addEventListener("pointerup", function (ev) {
        if (Math.abs(ev.clientX - downX) > 8 || Math.abs(ev.clientY - downY) > 8) return;
        var r = img.getBoundingClientRect();
        if (!r.width || !r.height) return;
        placePoint(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height), multi);
      });
      vp.setAttribute("tabindex", "0");
      vp.setAttribute("role", "application");
      vp.setAttribute("aria-label", "画像。矢印で場所を動かし、Enter で決めます。");
      vp.addEventListener("keydown", function (ev) {
        var step = ev.shiftKey ? 0.01 : 0.05;
        if (ev.key === "ArrowLeft") cur.x = clamp01(cur.x - step);
        else if (ev.key === "ArrowRight") cur.x = clamp01(cur.x + step);
        else if (ev.key === "ArrowUp") cur.y = clamp01(cur.y - step);
        else if (ev.key === "ArrowDown") cur.y = clamp01(cur.y + step);
        else if (ev.key === "Enter" || ev.key === " ") { placePoint(cur.x, cur.y, multi); }
        else return;
        ev.preventDefault();
      });
    }
    function placePoint(x, y, multi) {
      var pts = (isObj(current) && arr(current.points).length) ? arr(current.points).slice() : [];
      if (multi) {
        var near = -1;
        pts.forEach(function (p, i) { if (Math.abs(p.x - x) < 0.03 && Math.abs(p.y - y) < 0.03) near = i; });
        if (near >= 0) pts.splice(near, 1); else pts.push({ x: x, y: y });
      } else pts = [{ x: x, y: y }];
      emit({ points: pts }, { rerender: false });
      repaint();
    }

    /* ── ラベル配置 ── */
    function makeImageLabelKit() {
      var wrap = container.querySelector('[data-qr-drag="label"]');
      if (!wrap) return;
      function slots() { return (isObj(current) && isObj(current.slots)) ? Object.assign({}, current.slots) : {}; }
      function setSlots(m) { emit({ slots: m }, { rerender: false }); repaint(); }
      kit = DragKit(wrap, {
        snapshot: function () { return slots(); },
        restore: function (s) { setSlots(s); },
        onDrop: function (labelId, zone) {
          var m = slots();
          /* 1 つのラベルは 1 か所だけ。付け替えたら前の場所は空く。 */
          Object.keys(m).forEach(function (k) { if (m[k] === labelId) delete m[k]; });
          if (zone !== "__bank__") m[zone] = labelId;
          setSlots(m);
        }
      });
    }

    /* ── 誤文訂正 ── */
    function bindErrorCorrection() {
      var inputs = container.querySelectorAll("[data-qr-span]");
      for (var i = 0; i < inputs.length; i++) {
        (function (el) {
          var id = el.getAttribute("data-qr-span");
          el.addEventListener("input", function () {
            var m = (isObj(current) && isObj(current.spans)) ? Object.assign({}, current.spans) : {};
            m[id] = el.value;
            emit({ spans: m }, { rerender: false });
          });
        })(inputs[i]);
      }
    }

    /* ── カード ── */
    function bindFlashcard() {
      container.addEventListener("click", function (ev) {
        if (closest(ev.target, "[data-qr-flip]")) {
          opts.cardFlipped = !opts.cardFlipped;
          onLocal({ cardFlipped: opts.cardFlipped });
          repaint();
          return;
        }
        var m = closest(ev.target, '[data-act="qr-card-mark"]');
        if (m) {
          emit({ mark: m.getAttribute("data-id") }, { rerender: false, advance: true });
          repaint();
        }
      });
    }

    /* ── 複合大問 ── */
    function bindCompositeTabs() {
      container.addEventListener("click", function (ev) {
        var t = closest(ev.target, "[data-qr-sub]");
        if (t) { opts.subIndex = Number(t.getAttribute("data-qr-sub")); onLocal({ subIndex: opts.subIndex }); repaint(); return; }
        var ct = closest(ev.target, "[data-qr-ctab]");
        if (ct) { opts.compositeTab = ct.getAttribute("data-qr-ctab"); onLocal({ compositeTab: opts.compositeTab }); repaint(); }
      });
    }
    function bindCompositeChild() {
      var host = container.querySelector("[data-qr-child]");
      if (!host) return;
      var childId = host.getAttribute("data-qr-child");
      var child = arr(q.children).filter(function (c) { return c.id === childId; })[0];
      if (!child) return;
      var body = host.querySelector(".vq2-comp-qbody");
      if (!body) return;
      var vals = (isObj(current) && isObj(current.children)) ? current.children : {};
      childBinding = bind(body, child, vals[child.id], Object.assign({}, opts, {
        inComposite: true, subIndex: undefined, compositeTab: undefined,
        onChange: function (v) {
          var next = (isObj(current) && isObj(current.children)) ? Object.assign({}, current.children) : {};
          next[child.id] = v;
          emit({ children: next }, { rerender: false });
        },
        onLocalState: onLocal
      }));
    }

    wireOnce();
    wireDynamic();
    return api();
  }

  /* ── 音声の再生。回数の上限をここで守る。 ─────────────────────── */
  var currentAudio = null;
  function playSrc(src, rate) {
    try {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      var a = new root.Audio(src);
      a.playbackRate = isNum(rate) ? rate : 1;
      currentAudio = a;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      return a;
    } catch (e) { return null; }
  }
  function playAudio(box, opts, onCount, question) {
    if (!box) return;
    var src = box.getAttribute("data-audio-src");
    var rate = Number(box.getAttribute("data-rate")) || 1;
    var limit = box.hasAttribute("data-limit") ? Number(box.getAttribute("data-limit")) : null;
    var used = (opts && isNum(opts.replayCount)) ? opts.replayCount : 0;
    if (limit !== null && used >= limit) return;
    if (box.getAttribute("data-audio-mode") === "script")
      return playScript(box, opts, onCount, question, rate, limit, used);
    var a = playSrc(src, rate);
    if (!a) return;
    countReplay(box, opts, onCount, limit, used);
    var fill = box.querySelector(".vq2-audio-fill");
    if (fill) {
      a.addEventListener("timeupdate", function () {
        if (!a.duration) return;
        fill.style.width = Math.round((a.currentTime / a.duration) * 100) + "%";
      });
      a.addEventListener("ended", function () { fill.style.width = "100%"; });
    }
  }

  /* 聞けた回数を 1 つ増やし、残りを出す。上限に達したら押せなくする。 */
  function countReplay(box, opts, onCount, limit, used) {
    if (opts) opts.replayCount = used + 1;
    if (onCount) onCount(used + 1);
    var meta = box.querySelector(".vq2-audio-meta");
    if (limit === null || !meta) return;
    var left = Math.max(0, limit - (used + 1));
    meta.textContent = left > 0 ? "あと " + left + " 回聞けます" : "もう聞けません";
    if (left <= 0) {
      var b = box.querySelector('[data-act="qr-audio-play"]');
      if (b) b.disabled = true;
    }
  }

  /* 原稿を読み上げる。音声はここで用意する（貯めてあればすぐ鳴る）。
     ・**用意できた時点で 1 回と数える**（用意に失敗した回は数えない）
     ・端末の読み上げに落ちたことは隠さない（声が変わるので気づけるようにする） */
  function playScript(box, opts, onCount, question, rate, limit, used) {
    var T = root.VQ2 && root.VQ2.tts;
    var meta = box.querySelector(".vq2-audio-meta");
    var fill = box.querySelector(".vq2-audio-fill");
    var btnEl = box.querySelector('[data-act="qr-audio-play"]');
    if (!T) { if (meta) meta.textContent = "この端末では音声を用意できません。"; return; }
    if (box.__vqPlaying) return;
    box.__vqPlaying = true;
    if (btnEl) btnEl.disabled = true;
    if (meta) meta.textContent = "音声を用意しています…";
    if (fill) { fill.style.width = "0%"; box.classList.add("is-playing"); }

    var timer = null;
    function bar(seconds) {
      if (!fill) return;
      var ms = (Number(seconds) || 0) * 1000 / (rate || 1);
      /* 長さが分からない（端末の読み上げ）ときは、進み具合を作らない。
         偽の進捗を出すより、鳴っていることだけを示す。 */
      if (!ms) { box.classList.add("is-unknown"); return; }
      var t0 = Date.now();
      timer = setInterval(function () {
        var p = Math.min(1, (Date.now() - t0) / ms);
        fill.style.width = Math.round(p * 100) + "%";
        if (p >= 1) { clearInterval(timer); timer = null; }
      }, 80);
    }
    function done(msg) {
      if (timer) { clearInterval(timer); timer = null; }
      box.__vqPlaying = false;
      box.classList.remove("is-playing", "is-unknown");
      if (fill) fill.style.width = "100%";
      var left = limit === null ? null : Math.max(0, limit - (used + 1));
      if (btnEl) btnEl.disabled = left !== null && left <= 0;
      if (meta && msg) meta.textContent = msg;
    }

    var counted = false;
    T.playQuestion(question, {
      rate: rate,
      preset: opts && opts.preset,
      voice: opts && opts.voice,
      onStart: function (info) {
        if (!counted) { counted = true; countReplay(box, opts, onCount, limit, used); }
        bar(info && info.seconds);
        if (meta && limit === null) meta.textContent = info && info.local ? "この端末の声で読み上げています…" : "再生中…";
      }
    }).then(function (r) {
      if (r && r.ok) {
        done(r.note || (limit === null ? "何回でも聞けます" : null));
      } else {
        /* 用意できなかった回は数えない（数えると理不尽に減る） */
        if (counted && opts) opts.replayCount = used;
        done((r && r.reason) || "音声を用意できませんでした。");
      }
    }).catch(function () { done("音声を用意できませんでした。"); });
  }

  /* ══════════════════════════════════════════════════════════════════
     5) 答え合わせの見せ方（正解と、自分の答えの差）
     ══════════════════════════════════════════════════════════════════ */
  function correctAnswerText(question) {
    var q = question && question.modelVersion === M.MODEL_VERSION ? question : M.normalize(question || {});
    var e = q.engine;
    if (e === "single_choice" || e === "true_false" || e === "image_choice" || e === "audio_choice"
        || e === "multi_choice" || (e === "chart_read" && arr(q.choices).length)) {
      return arr(q.choices).filter(function (c) { return c.isCorrect; })
        .map(function (c) { return c.text || c.label; }).join(" / ");
    }
    if (e === "fill_blank") return arr(q.blanks).map(function (b, i) { return (i + 1) + ". " + b.answer; }).join("　");
    if (e === "reorder") {
      var byId = Object.create(null);
      arr(q.orderItems).forEach(function (it) { byId[it.id] = it; });
      return arr(q.correctOrder).map(function (id, i) { return (i + 1) + ". " + (byId[id] ? byId[id].text : id); }).join("　");
    }
    if (e === "matching") {
      var r = Object.create(null);
      arr(q.pairs && q.pairs.right).forEach(function (x) { r[x.id] = x.text; });
      return arr(q.pairs && q.pairs.left).map(function (l) {
        return l.text + " → " + (r[q.pairs.correct[l.id]] || "");
      }).join("　");
    }
    if (e === "classification") {
      var g = Object.create(null);
      arr(q.classification && q.classification.groups).forEach(function (x) { g[x.id] = x.label; });
      return arr(q.classification && q.classification.items).map(function (it) {
        return it.text + "→" + (g[it.groupId] || "");
      }).join("　");
    }
    if (e === "table_fill") {
      var out = [];
      arr(q.table && q.table.rows).forEach(function (r2) {
        arr(r2.cells).forEach(function (c) { if (c.editable) out.push(c.answer); });
      });
      return out.join("　");
    }
    if (e === "image_point") return arr(q.hotspots).map(function (h) { return h.label || "図の中の場所"; }).join(" / ");
    if (e === "image_label") {
      var b2 = Object.create(null);
      arr(q.labels && q.labels.bank).forEach(function (x) { b2[x.id] = x.text; });
      return arr(q.labels && q.labels.slots).map(function (s, i) { return (i + 1) + ". " + (b2[s.answerId] || ""); }).join("　");
    }
    if (e === "error_correction") return arr(q.errorSpans).map(function (s) { return s.wrong + " → " + s.correct; }).join("　");
    if (e === "flashcard") return str(q.card && q.card.back);
    if (e === "composite") return "";
    if (e === "free_text") {
      if (arr(q.scoringRubric && q.scoringRubric.items).length)
        return q.scoringRubric.items.map(function (it) { return it.description; }).join("　");
      return str(q.correctAnswer);
    }
    return str(q.correctAnswer) || arr(q.acceptedAnswers).join(" / ");
  }

  /* 自分の答えを、人が読める形に直す。 */
  function answerText(question, value) {
    var q = question && question.modelVersion === M.MODEL_VERSION ? question : M.normalize(question || {});
    if (EV && EV.isUnanswered(q, value)) return "";
    var e = q.engine;
    var byChoice = Object.create(null);
    arr(q.choices).forEach(function (c) { byChoice[c.id] = c.text || c.label; });
    if (e === "single_choice" || e === "true_false" || e === "image_choice" || e === "audio_choice"
        || (e === "chart_read" && arr(q.choices).length)) {
      var id = pickedChoiceId(value);
      return byChoice[id] || str(id);
    }
    if (e === "multi_choice") return pickedChoiceIds(value).map(function (i) { return byChoice[i] || i; }).join(" / ");
    if (e === "fill_blank") return fillValues(value, arr(q.blanks).length).map(function (v, i) { return (i + 1) + ". " + (v || "（空）"); }).join("　");
    if (e === "reorder") {
      var byId = Object.create(null);
      arr(q.orderItems).forEach(function (it) { byId[it.id] = it; });
      return currentOrder(value, arr(q.orderItems), q.id).map(function (id2, i) {
        return (i + 1) + ". " + (byId[id2] ? byId[id2].text : id2);
      }).join("　");
    }
    if (e === "matching") {
      var r = Object.create(null);
      arr(q.pairs && q.pairs.right).forEach(function (x) { r[x.id] = x.text; });
      return arr(q.pairs && q.pairs.left).map(function (l) {
        return l.text + " → " + (isObj(value) && value[l.id] ? (r[value[l.id]] || "") : "（未）");
      }).join("　");
    }
    if (e === "classification") {
      var g = Object.create(null);
      arr(q.classification && q.classification.groups).forEach(function (x) { g[x.id] = x.label; });
      var m = isObj(value) && isObj(value.items) ? value.items : {};
      return arr(q.classification && q.classification.items).map(function (it) {
        return it.text + "→" + (g[m[it.id]] || "（未）");
      }).join("　");
    }
    if (e === "table_fill") {
      var cells = isObj(value) && isObj(value.cells) ? value.cells : {};
      return Object.keys(cells).map(function (k) { return cells[k]; }).filter(Boolean).join("　");
    }
    if (e === "image_point") return arr(isObj(value) && value.points).length + " か所を選びました";
    if (e === "image_label") {
      var b2 = Object.create(null);
      arr(q.labels && q.labels.bank).forEach(function (x) { b2[x.id] = x.text; });
      var s2 = isObj(value) && isObj(value.slots) ? value.slots : {};
      return arr(q.labels && q.labels.slots).map(function (s, i) { return (i + 1) + ". " + (b2[s2[s.id]] || "（未）"); }).join("　");
    }
    if (e === "error_correction") {
      var sp = isObj(value) && isObj(value.spans) ? value.spans : {};
      return arr(q.errorSpans).map(function (s) { return s.wrong + " → " + (sp[s.id] || "（未）"); }).join("　");
    }
    if (e === "flashcard") return isObj(value) && value.mark === "known" ? "覚えた" : "まだ";
    if (e === "composite") return "";
    return isObj(value) && value.text !== undefined ? str(value.text) : str(value);
  }

  VQ2.qrender = {
    html: html, promptHtml: promptHtml, reviewHtml: reviewHtml, bind: bind,
    mediaHtml: mediaHtml, chartHtml: chartHtml, tableViewHtml: tableViewHtml,
    fallbackHtml: function (q, why) { return fallbackHtml(ctxOf(q, null, {}), why); },
    correctAnswerText: correctAnswerText, answerText: answerText,
    needsLiveDom: needsLiveDom,
    /* §31 の検証で使う。「描けたつもり」を外から確かめられるようにする。 */
    probeRender: probeRender, ENGINE_MARK: ENGINE_MARK,
    currentOrder: currentOrder, wordBank: wordBank, shuffleStable: shuffleStable,
    pickedChoiceId: pickedChoiceId, pickedChoiceIds: pickedChoiceIds, fillValues: fillValues,
    DragKit: DragKit,
    RENDERERS: RENDERERS,
    /* 後から形式を足すときの口。エンジン単位で登録する。 */
    registerRenderer: function (engine, impl) {
      if (RENDERERS[engine]) throw new Error("すでにあるエンジンです: " + engine);
      RENDERERS[engine] = impl;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
