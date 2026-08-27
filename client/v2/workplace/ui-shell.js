/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 共通のエディター枠（§12）と道具（§2）

   ・ヘッダー・保存状態・Undo/Redo・共有・書き出しを 4 製品で 1 回だけ書く。
   ・機能は多いが、初めに見えるのは主要な数個だけ。残りは
     「その他」メニュー・右パネル・ボトムシート・コマンドパレットから出す。
   ・押しても何も起きないボタンは置かない。並べる前に run があるか確かめる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store;
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── アイコン（線画。絵文字は使わない）───────────────────────── */
  var P = {
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    presentation: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M12 16.5V21M8 21h8"/>',
    clipboardList: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M8 4.5H6a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2"/><path d="M8.5 11h7M8.5 15h5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    star: '<path d="m12 2.6 3 6.1 6.7 1-4.9 4.7 1.2 6.7L12 17.9l-6 3.2 1.2-6.7L2.3 9.7l6.7-1z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5"/><path d="M12 4v12"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>',
    more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    sparkle: '<path d="M12 3.4 13.8 8 18.4 9.8 13.8 11.6 12 16.2 10.2 11.6 5.6 9.8 10.2 8z"/><path d="M18.6 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevronD: '<path d="m6 9 6 6 6-6"/>',
    chevronR: '<path d="m9 18 6-6-6-6"/>',
    bold: '<path d="M6 4h7a4 4 0 0 1 0 8H6z"/><path d="M6 12h8a4 4 0 0 1 0 8H6z"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 21h16"/>',
    strike: '<path d="M4 12h16"/><path d="M17.5 7A4.5 4.5 0 0 0 13 4.5h-2A3.5 3.5 0 0 0 8 8"/><path d="M7 17a4 4 0 0 0 4 2.5h2a3.5 3.5 0 0 0 3.4-4"/>',
    listUl: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.3"/><circle cx="3.6" cy="12" r="1.3"/><circle cx="3.6" cy="18" r="1.3"/>',
    listOl: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 5h1.5v4M3.4 18h2.6M3.4 15.6c0-.9 2.4-.9 2.4.3S3.4 17.4 3.4 18"/>',
    check2: '<rect x="3" y="4" width="7" height="7" rx="1.6"/><path d="m4.6 7.5 1.6 1.6L9 6.3"/><path d="M13 7.5h8M13 16.5h8"/><rect x="3" y="13" width="7" height="7" rx="1.6"/>',
    alignL: '<path d="M3 6h18M3 12h11M3 18h15"/>',
    alignC: '<path d="M3 6h18M6.5 12h11M4.5 18h15"/>',
    alignR: '<path d="M3 6h18M10 12h11M6 18h15"/>',
    alignJ: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    quote: '<path d="M7 7h4v5a4 4 0 0 1-4 4V7zM15 7h4v5a4 4 0 0 1-4 4V7z"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
    minus: '<path d="M5 12h14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.5-.2-.8-.5-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="10.5" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16.5" cy="10.5" r="1.1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.7l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7L4.2 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    play: '<path d="m6 4 14 8-14 8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14.5 2.5A9 9 0 0 1 21.5 9.5h-7z"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4.5l3 1.8"/>',
    rows: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18"/>',
    cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16M15 4v16"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>',
    merge: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>',
    shapes: '<circle cx="7.5" cy="16" r="4.2"/><rect x="12.5" y="12" width="8" height="8" rx="1.5"/><path d="m12 3 4 7H8z"/>',
    type: '<path d="M4 6V4h16v2"/><path d="M12 4v16M9 20h6"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    /* 紙・印刷まわり */
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    text: '<path d="M4 7V5h16v2"/><path d="M12 5v14M9 19h6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    users: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 5.2a3.6 3.6 0 0 1 0 5.6M18 13.5a6 6 0 0 1 3.5 5.5"/>',
    restore: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    doc2: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H18v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M8 7h7M8 11h7M8 15h4"/>'
  };
  function icon(name, cls) {
    return '<svg class="wp-i ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (P[name] || P.info) + "</svg>";
  }
  /* 塗りつぶしのアイコン（お気に入りの★など） */
  function iconFill(name, cls) {
    return '<svg class="wp-i ' + (cls || "") + '" viewBox="0 0 24 24" fill="currentColor" '
      + 'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">'
      + (P[name] || P.info) + "</svg>";
  }

  /* ── 小さな道具 ───────────────────────────────────────────────── */
  function btn(o) {
    o = o || {};
    var cls = "wp-btn" + (o.variant ? " is-" + o.variant : "") + (o.iconOnly ? " is-icon" : "")
      + (o.on ? " is-on" : "") + (o.cls ? " " + o.cls : "");
    var inner = (o.icon ? icon(o.icon) : "") + (o.label && !o.iconOnly ? "<span>" + esc(o.label) + "</span>" : "");
    return '<button type="button" class="' + cls + '"'
      + (o.act ? ' data-act="' + esc(o.act) + '"' : "")
      + (o.val !== undefined ? ' data-val="' + esc(o.val) + '"' : "")
      + (o.title ? ' title="' + esc(o.title) + '"' : "")
      + (o.iconOnly ? ' aria-label="' + esc(o.label || o.title || "") + '"' : "")
      + (o.disabled ? " disabled" : "")
      + (o.pressed !== undefined ? ' aria-pressed="' + (o.pressed ? "true" : "false") + '"' : "")
      + ">" + inner + "</button>";
  }
  function chip(text, kind) {
    return '<span class="wp-chip' + (kind ? " is-" + kind : "") + '">' + esc(text) + "</span>";
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var now = new Date(), ms = now - d;
    if (ms < 60000) return "たった今";
    if (ms < 3600000) return Math.floor(ms / 60000) + " 分前";
    if (ms < 86400000) return Math.floor(ms / 3600000) + " 時間前";
    if (ms < 7 * 86400000) return Math.floor(ms / 86400000) + " 日前";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  /* パネル（挿入・書式・ページ設定・AI など、本文の外へ隠した操作）。

     **画面の真ん中に出す窓**にする。下から出るシートは、
     ・卓上だと本文の上へ細長く乗って、選んだ場所が隠れる
     ・Docs / Sheets / Slides / Forms で出方が揃わない
     という二つが問題だったため（§2.2 / §21）。

     class 名は wp-sheet のまま。呼び出しが 40 か所以上あり、
     名前を変えると差分が広がるだけで、見た目は CSS 側で決まるため。

     **開いても文字の入力位置は動かさない**。ここで窓へ focus を移すと、
     本文で選んでいた場所が消えて「挿入」が入る先を見失う。 */
  function sheet(rootEl, o) {
    o = o || {};
    var host = doc.createElement("div");
    host.className = "wp-sheet-host";
    var bd = doc.createElement("div");
    bd.className = "wp-sheet-bd";
    var box = doc.createElement("div");
    box.className = "wp-sheet";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", o.title || "設定");
    box.innerHTML =
      '<div class="wp-sheet__h"><div class="wp-sheet__t">' + esc(o.title || "") + "</div>"
      + btn({ icon: "x", iconOnly: true, label: "閉じる", act: "wp-sheet-close" }) + "</div>"
      + '<div class="wp-sheet__b">' + (o.html || "") + "</div>";
    host.appendChild(bd);
    host.appendChild(box);
    /* **本文の外側へ置く。**
       画面を描き直すとき、各アプリは本文の入れ物ごと innerHTML を入れ替える。
       その中に窓を置くと、描き直した瞬間に開いている窓が消える
       （用紙の大きさを変えると「ページ設定」が閉じていたのがこれ）。
       影の一番外側へ置けば、中を描き直しても窓はそのまま残る。 */
    var mountTo = rootEl;
    var rn = rootEl && rootEl.getRootNode ? rootEl.getRootNode() : null;
    if (rn && rn !== doc && rn.nodeType === 11) mountTo = rn;
    mountTo.appendChild(host);
    var body = box.querySelector(".wp-sheet__b");
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      doc.removeEventListener("keydown", onEsc);
      try { host.remove(); } catch (e) {}
      if (o.onClose) o.onClose();
    }
    function onEsc(e) { if (e.key === "Escape") close(); }
    bd.addEventListener("click", close);
    box.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest('[data-act="wp-sheet-close"]') : null;
      if (t) close();
    });
    doc.addEventListener("keydown", onEsc);
    if (o.onOpen) o.onOpen(body, close);
    return { el: box, body: body, close: close };
  }

  /* ══════════════════════════════════════════════════════════════════
     右クリックのメニュー

     ・押した場所のすぐ横に出す。ボトムシートは遠いので、卓上では使わない。
     ・画面の外へはみ出さないよう、右下で折り返す。
     ・モバイル（細い画面）ではボトムシートへ落とす（長押しでも同じ経路）。
     ══════════════════════════════════════════════════════════════════ */
  var openMenu = null;
  function contextMenu(rootEl, x, y, items, o) {
    o = o || {};
    items = (items || []).filter(function (i) { return i && (i.sep || typeof i.run === "function"); });
    if (!items.length) return null;
    closeContextMenu();
    if (VQ2.ui.isMobile()) {
      return sheet(rootEl, {
        title: o.title || "操作",
        html: items.map(function (it, i) {
          if (it.sep) return '<div style="height:1px;background:var(--vq-border-subtle);margin:6px 0"></div>';
          return '<button type="button" class="wp-cmd__i' + (it.danger ? " is-danger" : "") + '" data-i="' + i + '"'
            + (it.disabled ? " disabled" : "") + ">" + icon(it.icon || "chevronR")
            + "<span>" + esc(it.label) + "</span>"
            + (it.hint ? '<span class="wp-cmd__k">' + esc(it.hint) + "</span>" : "") + "</button>";
        }).join(""),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-i]") : null;
            if (!t || t.disabled) return;
            close();
            var it = items[Number(t.getAttribute("data-i"))];
            if (it && it.run) it.run();
          });
        }
      });
    }
    var box = doc.createElement("div");
    box.className = "wp-ctxmenu";
    box.setAttribute("role", "menu");
    box.innerHTML = items.map(function (it, i) {
      if (it.sep) return '<div class="wp-ctxmenu__sep"></div>';
      return '<button type="button" class="wp-ctxmenu__i' + (it.danger ? " is-danger" : "")
        + (it.on ? " is-on" : "") + '" role="menuitem" data-i="' + i + '"'
        + (it.disabled ? " disabled" : "") + ">"
        + icon(it.icon || "chevronR") + "<span>" + esc(it.label) + "</span>"
        + (it.hint ? '<span class="wp-ctxmenu__k">' + esc(it.hint) + "</span>" : "") + "</button>";
    }).join("");
    box.style.left = "-9999px";
    box.style.top = "-9999px";
    rootEl.appendChild(box);
    /* 置いてから大きさを測り、画面からはみ出さない位置へ移す。 */
    var w = box.offsetWidth, h = box.offsetHeight;
    var vw = rootEl.clientWidth || root.innerWidth, vh = rootEl.clientHeight || root.innerHeight;
    box.style.left = Math.max(6, Math.min(x, vw - w - 6)) + "px";
    box.style.top = Math.max(6, Math.min(y, vh - h - 6)) + "px";

    function close() {
      try { box.remove(); } catch (e) {}
      doc.removeEventListener("mousedown", onOutside, true);
      doc.removeEventListener("keydown", onKey, true);
      root.removeEventListener("blur", close);
      if (openMenu === close) openMenu = null;
    }
    function onOutside(e) {
      var p = e.composedPath ? e.composedPath() : [];
      if (p.indexOf(box) < 0) close();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      var btns = Array.prototype.slice.call(box.querySelectorAll(".wp-ctxmenu__i:not([disabled])"));
      var cur = btns.indexOf(box.querySelector(".wp-ctxmenu__i.is-focus"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var n = (cur + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % Math.max(1, btns.length);
        btns.forEach(function (b) { b.classList.remove("is-focus"); });
        if (btns[n]) { btns[n].classList.add("is-focus"); btns[n].focus(); }
      } else if (e.key === "Enter") {
        var f = box.querySelector(".wp-ctxmenu__i.is-focus");
        if (f) { e.preventDefault(); f.click(); }
      }
    }
    box.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-i]") : null;
      if (!t || t.disabled) return;
      e.preventDefault();
      close();
      var it = items[Number(t.getAttribute("data-i"))];
      if (it && it.run) it.run();
    });
    /* メニューの上で押しても、下の文字の選択を消さない。 */
    box.addEventListener("mousedown", function (e) { e.preventDefault(); });
    root.setTimeout(function () {
      doc.addEventListener("mousedown", onOutside, true);
      doc.addEventListener("keydown", onKey, true);
      root.addEventListener("blur", close);
    }, 0);
    openMenu = close;
    return { el: box, close: close };
  }
  function closeContextMenu() { if (openMenu) { try { openMenu(); } catch (e) {} } }

  /* ══════════════════════════════════════════════════════════════════
     文字の選択を保つ

     ツールバーのボタンを押すと、押した瞬間に **選択が消える**。
     （ボタンへフォーカスが移るため。色や太字が効かない原因はこれだった。）
     ・ボタンの mousedown を止めて、選択を保ったまま押せるようにする
     ・メニュー越しの操作では、開いたときの選択を覚えておいて戻す
     ・影の DOM の中の選択は shadowRoot.getSelection() でないと取れない環境がある
     ══════════════════════════════════════════════════════════════════ */
  function selectionOf(shadow) {
    try {
      if (shadow && shadow.getSelection) return shadow.getSelection();
    } catch (e) {}
    return root.getSelection ? root.getSelection() : null;
  }
  function saveSelection(shadow) {
    var s = selectionOf(shadow);
    if (!s || !s.rangeCount) return null;
    try { return s.getRangeAt(0).cloneRange(); } catch (e) { return null; }
  }
  function restoreSelection(shadow, range) {
    if (!range) return false;
    var s = selectionOf(shadow);
    if (!s) return false;
    try { s.removeAllRanges(); s.addRange(range); return true; } catch (e) { return false; }
  }
  /* 押しても選択が消えないようにする。ツールバーごとに 1 回呼べばよい。 */
  function keepSelection(hostEl) {
    if (!hostEl || hostEl.__wpKeep) return;
    hostEl.__wpKeep = true;
    hostEl.addEventListener("mousedown", function (e) {
      var t = e.target.closest ? e.target.closest(".wp-btn, .wp-ctxmenu__i, .wp-cmd__i") : null;
      if (!t) return;
      /* 入力欄は普通に触れるようにする（ここで止めるのはボタンだけ）。 */
      e.preventDefault();
    });
  }
  /* 書式を当てる。execCommand が効かない場面のために、自前の包み込みも用意する。 */
  function applyInline(shadow, cmd, value) {
    var s = selectionOf(shadow);
    if (!s || !s.rangeCount) return false;
    var range = s.getRangeAt(0);
    if (range.collapsed && cmd !== "createLink") return false;
    var okDone = false;
    try { okDone = doc.execCommand(cmd, false, value === undefined ? null : value); } catch (e) { okDone = false; }
    if (okDone) return true;
    /* 効かなかったときは、選んだところを span で包む。 */
    var style = null;
    if (cmd === "bold") style = "font-weight:700";
    else if (cmd === "italic") style = "font-style:italic";
    else if (cmd === "underline") style = "text-decoration:underline";
    else if (cmd === "strikeThrough") style = "text-decoration:line-through";
    else if (cmd === "foreColor") style = "color:" + value;
    else if (cmd === "hiliteColor" || cmd === "backColor") style = "background-color:" + value;
    if (!style) return false;
    try {
      var span = doc.createElement("span");
      span.setAttribute("style", style);
      span.appendChild(range.extractContents());
      range.insertNode(span);
      var r2 = doc.createRange();
      r2.selectNodeContents(span);
      s.removeAllRanges();
      s.addRange(r2);
      return true;
    } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════════════
     色を自由に決める

     見本から選ぶだけでなく、色の輪から選ぶ・数字（#RRGGBB）で入れる・
     最近使った色から選ぶ、の 3 つを同じ窓に置く。
     ══════════════════════════════════════════════════════════════════ */
  var SWATCHES = [
    /* 無彩色 */
    "#000000", "#1e293b", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0", "#ffffff",
    /* 赤〜橙 */
    "#7f1d1d", "#b91c1c", "#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2",
    "#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5",
    /* 黄〜緑 */
    "#713f12", "#a16207", "#ca8a04", "#eab308", "#facc15", "#fde047", "#fef08a", "#fefce8",
    "#14532d", "#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0", "#dcfce7",
    /* 青〜紫 */
    "#0c4a6e", "#0369a1", "#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe",
    "#1e3a8a", "#1d4ed8", "#2b70ef", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe",
    "#4c1d95", "#6d28d9", "#7b3fe4", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe",
    /* 桃 */
    "#831843", "#be185d", "#d1467a", "#ec4899", "#f472b6", "#f9a8d4", "#fbcfe8", "#fce7f3"
  ];
  var RECENT_KEY = "vq2.wp.recentColors.v1";
  function recentColors() {
    try {
      var a = JSON.parse(root.localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a.slice(0, 10) : [];
    } catch (e) { return []; }
  }
  function pushRecent(c) {
    try {
      var a = recentColors().filter(function (x) { return x !== c; });
      a.unshift(c);
      root.localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 10)));
    } catch (e) {}
  }
  function normHex(v) {
    var s = String(v || "").trim();
    if (!s) return "";
    if (s.charAt(0) !== "#") s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s))
      s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : "";
  }
  /* rootEl の中に出す小窓。x, y は画面の座標。 */
  function popup(rootEl, x, y, html, label) {
    closeContextMenu();
    var box = doc.createElement("div");
    box.className = "wp-ctxmenu wp-pop";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", label || "");
    box.innerHTML = html;
    box.style.left = "-9999px";
    box.style.top = "-9999px";
    rootEl.appendChild(box);
    var w = box.offsetWidth, h = box.offsetHeight;
    var vw = rootEl.clientWidth || root.innerWidth, vh = rootEl.clientHeight || root.innerHeight;
    box.style.left = Math.max(6, Math.min(x, vw - w - 6)) + "px";
    box.style.top = Math.max(6, Math.min(y, vh - h - 6)) + "px";
    /* 小窓の上で押しても、下の文字の選択を消さない（色は選択に当てるため）。
       ただし色の輪や数字の欄は触れないと困るので、そこは通す。 */
    box.addEventListener("mousedown", function (e) {
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      e.preventDefault();
    });
    function close() {
      try { box.remove(); } catch (e) {}
      doc.removeEventListener("mousedown", outside, true);
      doc.removeEventListener("keydown", onKey, true);
    }
    function outside(e) {
      var p = e.composedPath ? e.composedPath() : [];
      if (p.indexOf(box) < 0) close();
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    root.setTimeout(function () {
      doc.addEventListener("mousedown", outside, true);
      doc.addEventListener("keydown", onKey, true);
    }, 0);
    return { el: box, close: close };
  }

  /* o = { value, onPick(color), allowNone, noneLabel, title } */
  function colorPicker(rootEl, x, y, o) {
    o = o || {};
    var cur = normHex(o.value) || "";
    var recent = recentColors();
    /* 当てる先（文字色 / 蛍光ペン）を同じ窓の中で切り替える。
       窓を開き直させると、その間に文字の選択が外れて何も起きなくなる。 */
    var modes = Array.isArray(o.modes) ? o.modes : null;
    var mode = modes && modes.length ? modes[0].id : "";
    var h = '<div class="wp-cp">';
    if (o.hint) h += '<div class="wp-cp__hint">' + esc(o.hint) + "</div>";
    if (modes)
      h += '<div class="wp-seg wp-cp__seg" role="group" aria-label="当てる先">'
        + modes.map(function (m, i) {
          return '<button type="button" class="wp-seg__b' + (i === 0 ? " is-on" : "")
            + '" data-mode="' + esc(m.id) + '">' + esc(m.label) + "</button>";
        }).join("") + "</div>";
    if (o.allowNone)
      h += '<button type="button" class="wp-cp__none" data-c="">' + icon("x")
        + "<span>" + esc(o.noneLabel || "色なし") + "</span></button>";
    if (recent.length) {
      h += '<div class="wp-cp__l">最近使った色</div><div class="wp-cp__row">'
        + recent.map(function (c) {
          return '<button type="button" class="wp-cp__s' + (c === cur ? " is-on" : "")
            + '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>';
        }).join("") + "</div>";
    }
    h += '<div class="wp-cp__l">見本から選ぶ</div><div class="wp-cp__grid">'
      + SWATCHES.map(function (c) {
        return '<button type="button" class="wp-cp__s' + (c === cur ? " is-on" : "")
          + '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>';
      }).join("") + "</div>";
    h += '<div class="wp-cp__l">自分で決める</div><div class="wp-cp__custom">'
      + '<input type="color" class="wp-cp__wheel" value="' + (cur || "#2b70ef") + '" aria-label="色を選ぶ" />'
      + '<input type="text" class="wp-in wp-cp__hex" value="' + (cur || "") + '" placeholder="#2b70ef"'
      + ' aria-label="色の番号（#RRGGBB）" spellcheck="false" />'
      + btn({ label: "決定", act: "cp-ok", variant: "primary" })
      + "</div></div>";

    var pop = popup(rootEl, x, y, h, o.title || "色を選ぶ");
    var wheel = pop.el.querySelector(".wp-cp__wheel");
    var hex = pop.el.querySelector(".wp-cp__hex");
    function pick(c) {
      if (c) pushRecent(c);
      pop.close();
      if (o.onPick) o.onPick(c, mode);
    }
    pop.el.addEventListener("click", function (e) {
      var m = e.target.closest ? e.target.closest("[data-mode]") : null;
      if (m) {
        e.preventDefault();
        mode = m.getAttribute("data-mode");
        Array.prototype.forEach.call(pop.el.querySelectorAll("[data-mode]"), function (b) {
          b.classList.toggle("is-on", b === m);
        });
        return;                       /* 窓は閉じない。続けて色を選べる。 */
      }
      var s = e.target.closest ? e.target.closest("[data-c]") : null;
      if (s) { e.preventDefault(); pick(s.getAttribute("data-c")); return; }
      if (e.target.closest && e.target.closest('[data-act="cp-ok"]')) {
        e.preventDefault();
        pick(normHex(hex.value) || wheel.value);
      }
    });
    wheel.addEventListener("input", function () { hex.value = wheel.value; });
    hex.addEventListener("input", function () {
      var v = normHex(hex.value);
      if (v) wheel.value = v;
    });
    hex.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var v = normHex(hex.value);
      if (v) pick(v);
    });
    return pop;
  }

  /* ══ 処理中のモーダル ════════════════════════════════════════
     AI が考えている間、画面の真ん中に出す。
     裏で静かに進むと「押したのに何も起きない」に見えるため、
     いま何をしているかと、途中で止められることを見せる。 */
  function progressModal(rootEl, o) {
    o = o || {};
    var steps = o.steps || ["処理しています"];
    var host = doc.createElement("div");
    host.className = "wp-mod";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-live", "polite");
    host.innerHTML = '<div class="wp-mod__bd"></div>'
      + '<div class="wp-mod__w">'
      + '<div class="wp-mod__h">' + esc(o.title || "処理中") + "</div>"
      + (o.note ? '<div class="wp-mod__n">' + esc(o.note) + "</div>" : "")
      + '<div class="wp-mod__bar"><i></i></div>'
      + '<ol class="wp-mod__s">' + steps.map(function (s, i) {
        return '<li data-i="' + i + '"><span class="wp-mod__d"></span>' + esc(s) + "</li>";
      }).join("") + "</ol>"
      + '<div class="wp-mod__o" data-role="stream" aria-hidden="true"></div>'
      + '<div class="wp-mod__f">'
      + '<button type="button" class="wp-btn is-outline" data-act="cancel">やめる</button></div>'
      + "</div>";
    (rootEl || doc.body).appendChild(host);

    var closed = false, cancelled = false;
    var stream = host.querySelector('[data-role="stream"]');
    var acc = "";
    function mark(i, note) {
      Array.prototype.forEach.call(host.querySelectorAll(".wp-mod__s li"), function (li, k) {
        li.classList.toggle("is-done", k < i);
        li.classList.toggle("is-now", k === i);
      });
      if (note) {
        var n = host.querySelector(".wp-mod__n");
        if (n) n.textContent = note;
      }
    }
    mark(0);
    host.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (e.target.closest('[data-act="cancel"]') || e.target.closest(".wp-mod__bd")) {
        cancelled = true;
        api.close();
        if (o.onCancel) o.onCancel();
      }
    });
    var api = {
      step: function (i, note) { if (!closed) mark(i, note); },
      stream: function (t) {
        if (closed || !stream) return;
        acc += String(t || "");
        stream.textContent = acc.slice(-600);
        stream.scrollTop = stream.scrollHeight;
      },
      get cancelled() { return cancelled; },
      close: function () { if (closed) return; closed = true; try { host.remove(); } catch (e) {} }
    };
    return api;
  }

  /* ══ 文字の書体 ══════════════════════════════════════════════
     **書体は VocabuQuiz が自分で配る**（client/fonts/）。
     端末に入っているかは関係なく、選べば必ずその形で出る。

     実体は書体ごとに 1 枚ずつ CSS を分けてあり、必要になった時だけ読む。
     全部を最初に読むと数百 KB の CSS を毎回読むことになるため。
     日本語は文字の範囲ごとに 120 枚以上へ切り分けてあるので、
     読み込んでも実際に落ちてくるのは画面に出ている文字ぶんだけ（実測 ~130KB）。

     下の SYSTEM_FONTS は、同梱の一覧が読めなかったときの受け皿。
     端末まかせになるので、そのときだけ「この端末には無い」の印を出す。 */
  var SYSTEM_FONTS = [
    /* ── 日本語：ゴシック ───────────────────────────── */
    { id: "sans", g: "日本語 ゴシック", label: "ゴシック（標準）", probe: "Hiragino Sans",
      css: '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif' },
    { id: "yugo", g: "日本語 ゴシック", label: "游ゴシック", probe: "Yu Gothic",
      css: '"Yu Gothic","YuGothic","游ゴシック",sans-serif' },
    { id: "meiryo", g: "日本語 ゴシック", label: "メイリオ", probe: "Meiryo",
      css: 'Meiryo,"メイリオ",sans-serif' },
    { id: "hirakaku", g: "日本語 ゴシック", label: "ヒラギノ角ゴ", probe: "Hiragino Kaku Gothic ProN",
      css: '"Hiragino Kaku Gothic ProN","ヒラギノ角ゴ ProN W3",sans-serif' },
    { id: "notosans", g: "日本語 ゴシック", label: "Noto Sans JP", probe: "Noto Sans JP",
      css: '"Noto Sans JP",sans-serif' },
    { id: "msgothic", g: "日本語 ゴシック", label: "MS ゴシック", probe: "MS Gothic",
      css: '"MS Gothic","ＭＳ ゴシック",monospace' },
    { id: "mspgothic", g: "日本語 ゴシック", label: "MS P ゴシック", probe: "MS PGothic",
      css: '"MS PGothic","ＭＳ Ｐゴシック",sans-serif' },
    { id: "bizgothic", g: "日本語 ゴシック", label: "BIZ UD ゴシック", probe: "BIZ UDPGothic",
      css: '"BIZ UDPGothic","BIZ UDGothic",sans-serif' },
    { id: "osaka", g: "日本語 ゴシック", label: "Osaka", probe: "Osaka", css: 'Osaka,sans-serif' },
    /* ── 日本語：明朝 ───────────────────────────────── */
    { id: "mincho", g: "日本語 明朝", label: "明朝（標準）", probe: "Hiragino Mincho ProN",
      css: '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif' },
    { id: "yumin", g: "日本語 明朝", label: "游明朝", probe: "Yu Mincho",
      css: '"Yu Mincho","YuMincho","游明朝",serif' },
    { id: "hiramin", g: "日本語 明朝", label: "ヒラギノ明朝", probe: "Hiragino Mincho ProN",
      css: '"Hiragino Mincho ProN","ヒラギノ明朝 ProN",serif' },
    { id: "msmincho", g: "日本語 明朝", label: "MS 明朝", probe: "MS Mincho",
      css: '"MS Mincho","ＭＳ 明朝",serif' },
    { id: "mspmincho", g: "日本語 明朝", label: "MS P 明朝", probe: "MS PMincho",
      css: '"MS PMincho","ＭＳ Ｐ明朝",serif' },
    { id: "notoserif", g: "日本語 明朝", label: "Noto Serif JP", probe: "Noto Serif JP",
      css: '"Noto Serif JP",serif' },
    { id: "bizmincho", g: "日本語 明朝", label: "BIZ UD 明朝", probe: "BIZ UDPMincho",
      css: '"BIZ UDPMincho","BIZ UDMincho",serif' },
    { id: "shippori", g: "日本語 明朝", label: "しっぽり明朝", probe: "Shippori Mincho",
      css: '"Shippori Mincho",serif' },
    /* ── 日本語：丸・やわらかい ─────────────────────── */
    { id: "maru", g: "日本語 丸ゴシック", label: "丸ゴシック", probe: "Hiragino Maru Gothic ProN",
      css: '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif' },
    { id: "mplusround", g: "日本語 丸ゴシック", label: "M PLUS Rounded", probe: "M PLUS Rounded 1c",
      css: '"M PLUS Rounded 1c",sans-serif' },
    { id: "zenmaru", g: "日本語 丸ゴシック", label: "Zen Maru Gothic", probe: "Zen Maru Gothic",
      css: '"Zen Maru Gothic",sans-serif' },
    { id: "kosugimaru", g: "日本語 丸ゴシック", label: "小杉丸", probe: "Kosugi Maru",
      css: '"Kosugi Maru",sans-serif' },
    /* ── 日本語：手書き・デザイン ───────────────────── */
    { id: "klee", g: "日本語 デザイン", label: "Klee One（手書き風）", probe: "Klee One",
      css: '"Klee One",cursive' },
    { id: "yusei", g: "日本語 デザイン", label: "Yusei Magic", probe: "Yusei Magic",
      css: '"Yusei Magic",sans-serif' },
    { id: "hachimaru", g: "日本語 デザイン", label: "はちまるポップ", probe: "Hachi Maru Pop",
      css: '"Hachi Maru Pop",cursive' },
    { id: "dotgothic", g: "日本語 デザイン", label: "DotGothic16（ドット）", probe: "DotGothic16",
      css: '"DotGothic16",sans-serif' },
    { id: "reggae", g: "日本語 デザイン", label: "Reggae One（太字）", probe: "Reggae One",
      css: '"Reggae One",cursive' },
    { id: "yujisyuku", g: "日本語 デザイン", label: "Yuji Syuku（筆）", probe: "Yuji Syuku",
      css: '"Yuji Syuku",serif' },
    /* ── 欧文：サンセリフ ───────────────────────────── */
    { id: "helvetica", g: "欧文 サンセリフ", label: "Helvetica", probe: "Helvetica",
      css: 'Helvetica,Arial,sans-serif' },
    { id: "arial", g: "欧文 サンセリフ", label: "Arial", probe: "Arial", css: 'Arial,Helvetica,sans-serif' },
    { id: "verdana", g: "欧文 サンセリフ", label: "Verdana", probe: "Verdana", css: 'Verdana,Geneva,sans-serif' },
    { id: "tahoma", g: "欧文 サンセリフ", label: "Tahoma", probe: "Tahoma", css: 'Tahoma,Geneva,sans-serif' },
    { id: "trebuchet", g: "欧文 サンセリフ", label: "Trebuchet MS", probe: "Trebuchet MS",
      css: '"Trebuchet MS",sans-serif' },
    { id: "segoe", g: "欧文 サンセリフ", label: "Segoe UI", probe: "Segoe UI", css: '"Segoe UI",sans-serif' },
    { id: "avenir", g: "欧文 サンセリフ", label: "Avenir", probe: "Avenir", css: 'Avenir,"Avenir Next",sans-serif' },
    { id: "futura", g: "欧文 サンセリフ", label: "Futura", probe: "Futura", css: 'Futura,"Century Gothic",sans-serif' },
    { id: "gillsans", g: "欧文 サンセリフ", label: "Gill Sans", probe: "Gill Sans",
      css: '"Gill Sans","Gill Sans MT",sans-serif' },
    { id: "optima", g: "欧文 サンセリフ", label: "Optima", probe: "Optima", css: 'Optima,sans-serif' },
    { id: "inter", g: "欧文 サンセリフ", label: "Inter", probe: "Inter", css: 'Inter,sans-serif' },
    { id: "roboto", g: "欧文 サンセリフ", label: "Roboto", probe: "Roboto", css: 'Roboto,sans-serif' },
    /* ── 欧文：セリフ ───────────────────────────────── */
    { id: "georgia", g: "欧文 セリフ", label: "Georgia", probe: "Georgia", css: 'Georgia,serif' },
    { id: "times", g: "欧文 セリフ", label: "Times New Roman", probe: "Times New Roman",
      css: '"Times New Roman",Times,serif' },
    { id: "garamond", g: "欧文 セリフ", label: "Garamond", probe: "Garamond",
      css: 'Garamond,"EB Garamond",serif' },
    { id: "palatino", g: "欧文 セリフ", label: "Palatino", probe: "Palatino",
      css: 'Palatino,"Palatino Linotype",serif' },
    { id: "baskerville", g: "欧文 セリフ", label: "Baskerville", probe: "Baskerville",
      css: 'Baskerville,"Libre Baskerville",serif' },
    { id: "didot", g: "欧文 セリフ", label: "Didot", probe: "Didot", css: 'Didot,"Didot LT STD",serif' },
    { id: "cambria", g: "欧文 セリフ", label: "Cambria", probe: "Cambria", css: 'Cambria,serif' },
    /* ── 等幅 ───────────────────────────────────────── */
    { id: "mono", g: "等幅", label: "等幅（標準）", probe: "Menlo",
      css: '"SFMono-Regular",Menlo,Consolas,"Noto Sans Mono",monospace' },
    { id: "menlo", g: "等幅", label: "Menlo", probe: "Menlo", css: 'Menlo,monospace' },
    { id: "monaco", g: "等幅", label: "Monaco", probe: "Monaco", css: 'Monaco,monospace' },
    { id: "consolas", g: "等幅", label: "Consolas", probe: "Consolas", css: 'Consolas,monospace' },
    { id: "courier", g: "等幅", label: "Courier New", probe: "Courier New",
      css: '"Courier New",Courier,monospace' },
    /* ── 飾り ───────────────────────────────────────── */
    { id: "impact", g: "飾り", label: "Impact", probe: "Impact", css: 'Impact,"Arial Black",sans-serif' },
    { id: "arialblack", g: "飾り", label: "Arial Black", probe: "Arial Black",
      css: '"Arial Black",sans-serif' },
    { id: "comic", g: "飾り", label: "Comic Sans MS", probe: "Comic Sans MS",
      css: '"Comic Sans MS",cursive' },
    { id: "brush", g: "飾り", label: "Brush Script", probe: "Brush Script MT",
      css: '"Brush Script MT",cursive' },
    { id: "copperplate", g: "飾り", label: "Copperplate", probe: "Copperplate",
      css: 'Copperplate,"Copperplate Gothic Light",fantasy' },
    { id: "chalkboard", g: "飾り", label: "Chalkboard", probe: "Chalkboard SE",
      css: '"Chalkboard SE",Chalkboard,sans-serif' },
    { id: "markerfelt", g: "飾り", label: "Marker Felt", probe: "Marker Felt",
      css: '"Marker Felt",fantasy' },
    { id: "snell", g: "飾り", label: "Snell Roundhand", probe: "Snell Roundhand",
      css: '"Snell Roundhand",cursive' },
    { id: "papyrus", g: "飾り", label: "Papyrus", probe: "Papyrus", css: 'Papyrus,fantasy' }
  ];
  /* 同梱の一覧（fonts-data.js が入れる）を、この画面の形へ直す。
     ・css は font-family の指定。実体は cssHref の CSS が持つ。
     ・bundled:true のものは端末に入っているかを測らない（必ず出るため）。 */
  function buildFonts() {
    var data = WP.fontData;
    if (!data || !data.length) return SYSTEM_FONTS.slice();     /* 受け皿 */
    return data.map(function (f) {
      return {
        id: f.id, g: f.group, label: f.label, note: f.note || "",
        css: '"' + f.family + '",' + (f.generic || "sans-serif"),
        family: f.family, cssHref: f.css, bundled: true
      };
    });
  }
  var FONTS = buildFonts();
  var FONT_BY_ID = {};
  FONTS.forEach(function (f) { FONT_BY_ID[f.id] = f; });

  /* ── 実体の読み込み ────────────────────────────────────────
     @font-face は文書ぜんたいのものなので、Shadow DOM の中へ入れても効かない。
     document.head へ入れる。同じものは 2 度入れない。 */
  var fontLoaded = {};
  function fontLoad(id) {
    var f = FONT_BY_ID[id];
    if (!f || !f.cssHref || fontLoaded[id]) return;
    fontLoaded[id] = true;
    try {
      var lk = doc.createElement("link");
      lk.rel = "stylesheet";
      lk.href = f.cssHref;
      lk.setAttribute("data-vq-font", id);
      (doc.head || doc.documentElement).appendChild(lk);
    } catch (e) { fontLoaded[id] = false; }
  }
  /* 文書が使っている書体をまとめて読む（開いた直後に呼ぶ）。 */
  function fontLoadAll(ids) {
    (ids || []).forEach(function (id) { if (id) fontLoad(id); });
  }
  /* 実際に使える形になるまで待つ。印刷や PDF の前に呼ぶ
     （読み込みが終わる前に刷ると、代わりの書体で出てしまう）。 */
  function fontReady(ids, timeoutMs) {
    fontLoadAll(ids);
    var fams = (ids || []).map(function (id) {
      var f = FONT_BY_ID[id];
      return f && f.family ? f.family : "";
    }).filter(Boolean);
    if (!fams.length || !doc.fonts || !doc.fonts.load) return Promise.resolve();
    var jobs = fams.map(function (fam) {
      return Promise.all([
        doc.fonts.load('400 16px "' + fam + '"', "あア亜Aa1"),
        doc.fonts.load('700 16px "' + fam + '"', "あア亜Aa1")
      ]).catch(function () {});
    });
    return Promise.race([
      Promise.all(jobs),
      new Promise(function (r) { root.setTimeout(r, timeoutMs || 6000); })
    ]);
  }

  function fontCss(id) {
    var f = FONT_BY_ID[id];
    if (f) { fontLoad(id); return f.css; }
    return FONTS[0] ? FONTS[0].css : "sans-serif";
  }
  function fontLabel(id) {
    var f = FONT_BY_ID[id];
    return f ? f.label : "";
  }
  function fontFamilyOf(id) {
    var f = FONT_BY_ID[id];
    return f && f.family ? f.family : "";
  }
  function fontCssHrefs(ids) {
    var out = [];
    (ids || []).forEach(function (id) {
      var f = FONT_BY_ID[id];
      if (f && f.cssHref && out.indexOf(f.cssHref) < 0) out.push(f.cssHref);
    });
    return out;
  }
  /* この端末にその書体が入っているかを実測する。
     同梱の書体は測らない（配ってあるので必ず出る）。
     受け皿の端末書体を使っているときだけ、入っていないものに印を付ける。 */
  var availCache = null;
  function fontAvailability() {
    if (availCache) return availCache;
    availCache = {};
    if (FONTS.length && FONTS[0].bundled) {
      FONTS.forEach(function (f) { availCache[f.id] = true; });
      return availCache;
    }
    try {
      var cv = doc.createElement("canvas");
      var ctx = cv.getContext("2d");
      var text = "MWiあア漢字123";
      var base = {};
      ["monospace", "serif", "sans-serif"].forEach(function (b) {
        ctx.font = "72px " + b;
        base[b] = ctx.measureText(text).width;
      });
      FONTS.forEach(function (f) {
        var name = f.probe || f.label;
        var hit = false;
        ["monospace", "serif", "sans-serif"].forEach(function (b) {
          ctx.font = '72px "' + name + '",' + b;
          if (Math.abs(ctx.measureText(text).width - base[b]) > 0.6) hit = true;
        });
        availCache[f.id] = hit;
      });
    } catch (e) { availCache = {}; }
    return availCache;
  }
  /* 書体を選ぶ窓。並び・見え方・端末に在るかを一度に見せる。
     ネイティブの select と違い、開いても文字の選択が消えない。 */
  function fontPicker(rootEl, x, y, o) {
    o = o || {};
    var avail = fontAvailability();
    var groups = {};
    FONTS.forEach(function (f) { (groups[f.g] = groups[f.g] || []).push(f); });
    var h = '<div class="wp-cp" style="width:322px">'
      + '<div class="wp-cp__hint">' + esc(o.hint || "選んだ文字の書体を変えます。") + "</div>"
      + '<input type="search" class="wp-in wp-fp__q" placeholder="書体をしぼり込む" aria-label="書体をしぼり込む" />';
    if (o.allowTheme)
      h += '<button type="button" class="wp-cp__none" data-f="">' + icon("palette")
        + "<span>テーマの書体にまかせる</span></button>";
    Object.keys(groups).forEach(function (g) {
      h += '<div class="wp-cp__l" data-grp="' + esc(g) + '">' + esc(g) + "</div>";
      groups[g].forEach(function (f) {
        var has = avail[f.id] !== false;
        var jp = /日本語/.test(g);
        h += '<button type="button" class="wp-fp__i' + (o.value === f.id ? " is-on" : "")
          + '" data-f="' + esc(f.id) + '" data-name="' + esc(f.label) + " " + esc(f.family || "")
          + '" data-grp="' + esc(g) + '" data-note="' + esc(f.note || "") + '">'
          + '<span class="wp-fp__n">' + esc(f.label)
          + (f.note ? '<span class="wp-fp__d">' + esc(f.note) + "</span>" : "") + "</span>"
          + '<span class="wp-fp__s" data-prev="' + esc(f.id) + '" style="font-family:' + f.css + '">'
          + (jp ? "あア亜 Aa" : "Aa Bb 123") + "</span>"
          + (has ? "" : '<span class="wp-fp__x">この端末には無い</span>')
          + "</button>";
      });
    });
    h += "</div>";
    var pop = popup(rootEl, x, y, h, "書体を選ぶ");
    pop.el.style.maxHeight = "60vh";

    /* 見本は **目に入ったものだけ** 実体を読む。
       123 書体ぶんを一度に読むと、日本語だけで数十 MB を取りに行ってしまう。
       見えている数個だけなら、実際に落ちてくるのは見本の文字ぶんだけで済む。 */
    (function lazyPreview() {
      var boxes = pop.el.querySelectorAll("[data-prev]");
      var load = function (el) {
        var id = el.getAttribute("data-prev");
        if (!id || el.getAttribute("data-loaded")) return;
        el.setAttribute("data-loaded", "1");
        fontLoad(id);
      };
      if (!root.IntersectionObserver) {
        Array.prototype.forEach.call(boxes, load);
        return;
      }
      var io = new root.IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { load(en.target); io.unobserve(en.target); } });
      }, { root: pop.el, rootMargin: "220px" });
      Array.prototype.forEach.call(boxes, function (el) { io.observe(el); });
      pop.el.addEventListener("vq-close", function () { try { io.disconnect(); } catch (e) {} });
    })();

    var q = pop.el.querySelector(".wp-fp__q");
    q.addEventListener("input", function () {
      var v = String(q.value || "").trim().toLowerCase();
      Array.prototype.forEach.call(pop.el.querySelectorAll(".wp-fp__i"), function (b) {
        var hit = !v || (b.getAttribute("data-name") + " " + b.getAttribute("data-grp")
          + " " + b.getAttribute("data-f")).toLowerCase().indexOf(v) >= 0;
        b.hidden = !hit;
      });
      Array.prototype.forEach.call(pop.el.querySelectorAll("[data-grp].wp-cp__l"), function (l) {
        var g = l.getAttribute("data-grp");
        var any = Array.prototype.some.call(pop.el.querySelectorAll('.wp-fp__i[data-grp="' + g + '"]'),
          function (b) { return !b.hidden; });
        l.hidden = !any;
      });
      /* しぼり込んだ結果、見えるようになったものの実体を読む */
      Array.prototype.forEach.call(pop.el.querySelectorAll(".wp-fp__i:not([hidden]) [data-prev]"),
        function (el, i) {
          if (i > 24 || el.getAttribute("data-loaded")) return;
          el.setAttribute("data-loaded", "1");
          fontLoad(el.getAttribute("data-prev"));
        });
    });
    pop.el.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-f]") : null;
      if (!b) return;
      e.preventDefault();
      pop.close();
      if (o.onPick) o.onPick(b.getAttribute("data-f"));
    });
    return pop;
  }

  /* ══ 記号 ══════════════════════════════════════════════════════ */
  var SYMBOLS = [
    { name: "よく使う", chars: "、。・…—―〜「」『』（）［］｛｝〈〉《》【】〔〕％＆＃＊＠§¶†‡№℡" },
    { name: "数学", chars: "＋−×÷±∓＝≠≒≡＜＞≦≧∞∝∫∮∑∏√∛∂∇∈∉∋⊂⊃⊆⊇∪∩∧∨¬⇒⇔∀∃∴∵∠⊥∥≪≫" },
    { name: "ギリシャ", chars: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ" },
    { name: "矢印", chars: "←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕⇦⇧⇨⇩➡⬅⬆⬇↰↱↲↳⤴⤵" },
    { name: "図形", chars: "○●◎◇◆□■△▲▽▼☆★♡♢♤♧◯◻◼◽◾▪▫▬▭▮▯" },
    { name: "通貨・単位", chars: "¥＄€£¢₩₽₹￠￡￥℃℉°′″㎜㎝㎞㎎㎏㎡㎥㍑㌫‰" },
    { name: "罫線", chars: "─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬" },
    { name: "丸数字", chars: "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕" },
    { name: "括弧数字", chars: "⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑" },
    { name: "囲み文字", chars: "㊤㊦㊥㊧㊨㈱㈲㈹㍾㍽㍼㍻㊙㊗㊑㊒㊓㊔㊕㊖㊘㊚㊛㊜㊝㊞㊟㊠" },
    { name: "チェック", chars: "✓✔✗✘☑☒☐※★☆♪♫♬♭♯✚✜✢✣✤✥❖❉❈" }
  ];
  /* 囲い文字（Word の「囲い文字」に相当）。文字の周りに枠を描く。 */
  var ENCLOSE = [
    { id: "circle", label: "○ で囲む", shape: "50%" },
    { id: "square", label: "□ で囲む", shape: "0" },
    { id: "round", label: "角丸で囲む", shape: "6px" },
    { id: "diamond", label: "◇ で囲む", shape: "0", rotate: true }
  ];
  function encloseHtml(text, style) {
    var s = String(text || "").slice(0, 4);
    var d = null;
    for (var i = 0; i < ENCLOSE.length; i++) if (ENCLOSE[i].id === style) d = ENCLOSE[i];
    if (!d) d = ENCLOSE[0];
    var inner = '<span class="wp-enc__t"' + (d.rotate ? ' style="transform:rotate(-45deg)"' : "") + ">"
      + esc(s) + "</span>";
    return '<span class="wp-enc" data-enc="' + d.id + '" style="border-radius:' + d.shape
      + (d.rotate ? ";transform:rotate(45deg)" : "") + '">' + inner + "</span>";
  }

  /* ── コマンドパレット（§2.4）────────────────────────────────────
     4 製品ぜんぶがここへ機能を登録する。検索して実行するだけ。
     登録には run（実際に動く関数）が必ず要る。 */
  function palette(rootEl, commands, o) {
    o = o || {};
    var list = (commands || []).filter(function (c) { return c && typeof c.run === "function"; });
    var bd = doc.createElement("div");
    bd.className = "wp-cmd-bd";
    var box = doc.createElement("div");
    box.className = "wp-cmd";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "コマンドを探す");
    box.innerHTML =
      '<div class="wp-cmd__in">' + icon("search")
      + '<input type="text" placeholder="' + esc(o.placeholder || "機能を検索（例: 表を追加、PDFで出力）")
      + '" aria-label="コマンドを検索" /></div>'
      + '<div class="wp-cmd__l" role="listbox"></div>';
    rootEl.appendChild(bd);
    rootEl.appendChild(box);
    var input = box.querySelector("input");
    var listEl = box.querySelector(".wp-cmd__l");
    var sel = 0, shown = [];

    function score(c, q) {
      if (!q) return 1;
      var hay = (c.label + " " + (c.keywords || "") + " " + (c.group || "")).toLowerCase();
      var qq = q.toLowerCase();
      if (hay.indexOf(qq) >= 0) return 3;
      /* 1 文字ずつ順に含まれていれば拾う（「ひょうつい」→「表を追加」） */
      var i = 0;
      for (var k = 0; k < qq.length; k++) {
        i = hay.indexOf(qq.charAt(k), i);
        if (i < 0) return 0;
        i++;
      }
      return 1;
    }
    function render() {
      var q = input.value.trim();
      shown = list.map(function (c) { return { c: c, s: score(c, q) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 60).map(function (x) { return x.c; });
      if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
      var group = "", h = "";
      shown.forEach(function (c, i) {
        if (c.group && c.group !== group) { group = c.group; h += '<div class="wp-cmd__g">' + esc(group) + "</div>"; }
        h += '<button type="button" class="wp-cmd__i' + (i === sel ? " is-sel" : "") + '" data-i="' + i + '" role="option">'
          + icon(c.icon || "chevronR") + "<span>" + esc(c.label) + "</span>"
          + (c.hint ? '<span class="wp-cmd__k">' + esc(c.hint) + "</span>" : "") + "</button>";
      });
      listEl.innerHTML = h || '<div class="wp-cmd__g">見つかりませんでした</div>';
      var cur = listEl.querySelector(".is-sel");
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    }
    function close() { try { bd.remove(); box.remove(); } catch (e) {} }
    function run(i) {
      var c = shown[i];
      if (!c) return;
      close();
      try { c.run(); } catch (e) { try { root.console.error("[Workplace]", e); } catch (e2) {} }
    }
    input.addEventListener("input", function () { sel = 0; render(); });
    box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    listEl.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-i]") : null;
      if (t) run(Number(t.getAttribute("data-i")));
    });
    bd.addEventListener("click", close);
    render();
    try { input.focus(); } catch (e) {}
    return { close: close };
  }

  /* ══════════════════════════════════════════════════════════════════
     編集画面の枠（§12）
     ══════════════════════════════════════════════════════════════════ */
  function EditorShell(o) {
    this.o = o || {};
    this.session = o.session;
    this.item = o.session.item;
    this.commands = [];
    this.undoStack = [];
    this.redoStack = [];
    this.mode = ST.prefs().mode;
    this.host = null;
  }
  EditorShell.prototype.registerCommands = function (cmds) {
    var self = this;
    (cmds || []).forEach(function (c) { if (c && typeof c.run === "function") self.commands.push(c); });
  };
  /* 元に戻す。中身のまるごとの写しを積む。
     大きなファイルでは重くなるので上限を設ける。 */
  EditorShell.prototype.pushUndo = function (label) {
    this.undoStack.push({ label: label || "", snap: JSON.stringify(this.session.content) });
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack.length = 0;
    this.syncUndoButtons();
  };
  EditorShell.prototype.undo = function () {
    if (!this.undoStack.length) return false;
    var top = this.undoStack.pop();
    this.redoStack.push({ label: top.label, snap: JSON.stringify(this.session.content) });
    this.session.content = JSON.parse(top.snap);
    this.session.touch();
    this.syncUndoButtons();
    if (this.o.onRestore) this.o.onRestore();
    return true;
  };
  EditorShell.prototype.redo = function () {
    if (!this.redoStack.length) return false;
    var top = this.redoStack.pop();
    this.undoStack.push({ label: top.label, snap: JSON.stringify(this.session.content) });
    this.session.content = JSON.parse(top.snap);
    this.session.touch();
    this.syncUndoButtons();
    if (this.o.onRestore) this.o.onRestore();
    return true;
  };
  EditorShell.prototype.syncUndoButtons = function () {
    if (!this.host) return;
    var u = this.host.querySelector('[data-act="undo"]'), r = this.host.querySelector('[data-act="redo"]');
    if (u) u.disabled = !this.undoStack.length;
    if (r) r.disabled = !this.redoStack.length;
  };

  /* ヘッダー。ここだけが保存状態を出す（画面ごとに違う言い方をしない）。
     ※ 画面は何度も描き直される。そのたびに **いまの状態** を書き込むこと。
       固定の文字を書いておくと、描き直した瞬間に古い表示へ戻る
       （実測: スライドで「この端末に保存」が「保存済み」に戻っていた）。 */
  EditorShell.prototype.headerHtml = function () {
    var it = this.item;
    var app = M.appOf(it.itemType);
    var st = this.session.state || "clean";
    var label = ST.stateLabel(st, ST.isSignedIn());
    return '<div class="wp-top">'
      + btn({ icon: "back", iconOnly: true, label: "一覧へ戻る", act: "close" })
      + '<span class="wp-quick__i" style="width:28px;height:28px;border-radius:7px;background:' + esc(app.accent) + '">'
      + icon(app.icon) + "</span>"
      + '<input class="wp-top__title" value="' + esc(it.title) + '" aria-label="ファイル名" data-act="title" />'
      + btn({ icon: "star", iconOnly: true, label: "お気に入り", act: "fav", on: !!it.favorite })
      + '<div class="wp-save is-' + st + '" data-role="save"' + (ST.isSignedIn() ? ""
        : ' title="ログインしていないため、この端末にだけ保存されます。"')
      + '><span class="wp-save__d"></span><span data-role="save-t">' + esc(label) + "</span></div>"
      + '<div class="wp-top__sp"></div>'
      + '<div class="wp-top__grp">'
      + btn({ icon: "undo", iconOnly: true, label: "元に戻す", act: "undo", disabled: true })
      + btn({ icon: "redo", iconOnly: true, label: "やり直す", act: "redo", disabled: true })
      + '<span class="wp-sep"></span>'
      + btn({ icon: "search", iconOnly: true, label: "コマンドを探す（Ctrl+K）", act: "palette" })
      + btn({ icon: "sparkle", iconOnly: true, label: "AI", act: "ai" })
      + btn({ icon: "share", iconOnly: true, label: "共有", act: "share" })
      + btn({ icon: "more", iconOnly: true, label: "その他", act: "more" })
      + "</div></div>";
  };

  EditorShell.prototype.bindHeader = function (hostEl, api) {
    var self = this;
    this.host = hostEl;
    this.api = api;

    /* 保存状態の表示。要素は毎回引き直す。掴んだまま持たない
       （画面を描き直すと前の要素は捨てられ、更新が届かなくなる）。 */
    this.paintSave = function (state) {
      var host = self.host;
      if (!host) return;
      var box = host.querySelector('[data-role="save"]');
      var txt = host.querySelector('[data-role="save-t"]');
      if (!box) return;
      box.className = "wp-save is-" + state;
      if (txt) txt.textContent = ST.stateLabel(state, ST.isSignedIn());
      box.setAttribute("title", ST.isSignedIn() ? "" : "ログインしていないため、この端末にだけ保存されます。");
    };
    this.session.on(function (state) {
      self.paintSave(state);
      if (state === "conflict") self.showConflict();
    });
    this.paintSave(this.session.state);

    hostEl.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-act") === "title") {
        self.session.setTitle(t.value);
      }
    });
    hostEl.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t || !hostEl.contains(t)) return;
      var act = t.getAttribute("data-act");
      if (act === "close") self.tryClose();
      else if (act === "fav") {
        self.item.favorite = !self.item.favorite;
        t.classList.toggle("is-on", self.item.favorite);
        t.setAttribute("aria-pressed", self.item.favorite ? "true" : "false");
        ST.meta(self.item.id, { favorite: self.item.favorite });
      }
      else if (act === "undo") self.undo();
      else if (act === "redo") self.redo();
      else if (act === "palette") self.openPalette();
      else if (act === "ai") { if (self.o.onAi) self.o.onAi(); }
      else if (act === "share") self.openShare();
      else if (act === "more") self.openMore();
    });

    /* キーボード（§27）。Ctrl/Cmd+K・S・Z・Shift+Z */
    this._onKey = function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      var k = String(e.key || "").toLowerCase();
      if (k === "k") { e.preventDefault(); self.openPalette(); }
      else if (k === "s") { e.preventDefault(); self.manualSave(); }
      else if (k === "z" && !e.shiftKey) {
        /* 文字の入力中は、その場の取り消しを優先する（横取りしない）。 */
        if (isTextTarget(e.target)) return;
        e.preventDefault(); self.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        if (isTextTarget(e.target)) return;
        e.preventDefault(); self.redo();
      }
    };
    hostEl.addEventListener("keydown", this._onKey);
  };
  function isTextTarget(t) {
    if (!t) return false;
    var tag = String(t.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || t.isContentEditable;
  }

  EditorShell.prototype.manualSave = function () {
    var self = this;
    return this.session.saveNow({ snapshot: true, label: "手動保存" }).then(function (r) {
      if (r && r.ok) self.api.toast(ST.isSignedIn() ? "保存しました" : "この端末に保存しました", "ok");
      else if (r && r.error) self.api.toast("保存できませんでした: " + r.error.message, "error", 6000);
      return r;
    });
  };
  EditorShell.prototype.tryClose = function () {
    var self = this;
    if (this.session.state === "dirty" || this.session.state === "saving") {
      this.api.confirm({
        title: "保存していない変更があります",
        message: "保存してから閉じますか。",
        okText: "保存して閉じる", cancelText: "そのまま閉じる"
      }).then(function (yes) {
        if (yes) self.session.saveNow({ snapshot: true }).then(function () { self.finish(); });
        else self.finish();
      });
      return;
    }
    this.finish();
  };
  EditorShell.prototype.finish = function () {
    this.session.destroy();
    if (this.o.onClose) this.o.onClose();
    this.api.forceClose("done");
  };
  EditorShell.prototype.openPalette = function () {
    var self = this;
    var base = [
      { group: "ファイル", label: "保存する", icon: "save", hint: "Ctrl+S", run: function () { self.manualSave(); } },
      { group: "ファイル", label: "名前を変更", icon: "type", run: function () { self.renameDialog(); } },
      { group: "ファイル", label: "複製を作る", icon: "copy", run: function () { self.duplicate(); } },
      { group: "ファイル", label: "共有と公開", icon: "share", run: function () { self.openShare(); } },
      { group: "ファイル", label: "変更履歴", icon: "history", run: function () { self.openHistory(); } },
      { group: "表示", label: "表示モード: シンプル", icon: "eye", run: function () { self.setMode("simple"); } },
      { group: "表示", label: "表示モード: 標準", icon: "eye", run: function () { self.setMode("standard"); } },
      { group: "表示", label: "表示モード: 詳細", icon: "eye", run: function () { self.setMode("detail"); } }
    ];
    palette(this.api.root, base.concat(this.commands));
  };
  EditorShell.prototype.setMode = function (m) {
    this.mode = m;
    ST.setPrefs({ mode: m });
    if (this.o.onModeChange) this.o.onModeChange(m);
    this.api.toast("表示モードを「" + ({ simple: "シンプル", standard: "標準", detail: "詳細" }[m]) + "」にしました", "ok");
  };
  EditorShell.prototype.renameDialog = function () {
    var self = this;
    var inp = this.host.querySelector('[data-act="title"]');
    if (inp) { inp.focus(); inp.select(); }
  };
  EditorShell.prototype.duplicate = function () {
    var self = this;
    this.session.saveNow().then(function () { return ST.duplicate(self.item.id); })
      .then(function (r) { self.api.toast("「" + r.item.title + "」を作りました", "ok"); })
      .catch(function (e) { self.api.toast("複製できませんでした: " + e.message, "error"); });
  };
  EditorShell.prototype.openShare = function () {
    var self = this, it = this.item;
    var origin = "";
    try { origin = root.location.origin; } catch (e) {}
    var pubUrl = it.publicId ? origin + "/?wpform=" + it.publicId : "";
    var canPublish = it.itemType === "form";
    var h = '<div class="wp-row"><label class="wp-lab" for="wpvis">公開の範囲</label>'
      + '<select class="wp-sel" id="wpvis" data-act="vis">'
      + '<option value="private"' + (it.visibility === "private" ? " selected" : "") + ">非公開（自分だけ）</option>"
      + '<option value="link"' + (it.visibility === "link" ? " selected" : "") + ">リンクを知っている人</option>"
      + '<option value="public"' + (it.visibility === "public" ? " selected" : "") + ">公開</option>"
      + "</select></div>";
    if (canPublish) {
      h += '<div class="wp-row"><div class="wp-lab">回答ページの URL</div>'
        + (pubUrl
          ? '<div class="wp-inline"><input class="wp-in" readonly value="' + esc(pubUrl) + '" data-act="url" />'
            + btn({ icon: "copy", iconOnly: true, label: "コピー", act: "copy-url" }) + "</div>"
            + '<div class="wp-lab" style="margin-top:6px">編集用の URL とは別です。回答者に編集権限はありません。</div>'
          : '<div class="wp-lab">「リンクを知っている人」以上にすると発行されます。</div>')
        + "</div>";
    } else {
      h += '<div class="wp-lab">この種類は、いまは共有リンクからの閲覧のみに対応しています。'
        + "他の人が編集できる共有は未実装です。</div>";
    }
    sheet(this.api.root, {
      title: "共有と公開",
      html: h,
      onOpen: function (body, close) {
        body.addEventListener("change", function (e) {
          var t = e.target.closest ? e.target.closest('[data-act="vis"]') : null;
          if (!t) return;
          ST.meta(it.id, { visibility: t.value }).then(function (r) {
            if (r.item) { self.item = r.item; self.session.item.visibility = r.item.visibility;
              self.session.item.publicId = r.item.publicId; }
            close();
            self.api.toast("公開の範囲を変えました", "ok");
            if (r.item && r.item.publicId && t.value !== "private") self.openShare();
          });
        });
        body.addEventListener("click", function (e) {
          var t = e.target.closest ? e.target.closest('[data-act="copy-url"]') : null;
          if (!t) return;
          var u = body.querySelector('[data-act="url"]');
          if (u) { u.select();
            try { doc.execCommand("copy"); self.api.toast("コピーしました", "ok"); } catch (er) {} }
        });
      }
    });
  };
  EditorShell.prototype.openHistory = function () {
    var self = this;
    var s = sheet(this.api.root, { title: "変更履歴", html: '<div data-role="vl">読み込み中…</div>' });
    ST.versions(this.item.id).then(function (r) {
      var el = s.body.querySelector('[data-role="vl"]');
      if (!r.versions.length) {
        el.innerHTML = '<div class="wp-lab">まだ履歴がありません。手動で保存すると、その時点が記録されます。</div>';
        return;
      }
      el.innerHTML = r.versions.map(function (v) {
        return '<button type="button" class="wp-cmd__i" data-v="' + v.version + '">'
          + icon("history") + "<span>版 " + v.version + (v.label ? "・" + esc(v.label) : "")
          + '</span><span class="wp-cmd__k">' + esc(fmtDate(v.createdAt)) + "</span></button>";
      }).join("");
      el.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-v]") : null;
        if (!t) return;
        var v = Number(t.getAttribute("data-v"));
        self.api.confirm({ title: "この版に戻しますか",
          message: "いまの内容は履歴に残ったうえで、版 " + v + " の内容に置き換わります。",
          okText: "戻す" }).then(function (yes) {
          if (!yes) return;
          ST.versionContent(self.item.id, v).then(function (rr) {
            self.pushUndo("履歴から復元");
            self.session.content = { schemaVersion: self.session.content.schemaVersion, content: rr.content };
            self.session.touch();
            if (self.o.onRestore) self.o.onRestore();
            s.close();
            self.api.toast("版 " + v + " に戻しました", "ok");
          }).catch(function (er) { self.api.toast("戻せませんでした: " + er.message, "error"); });
        });
      });
    });
  };
  EditorShell.prototype.showConflict = function () {
    var self = this;
    this.api.confirm({
      title: "他の場所でこのファイルが更新されています",
      message: "どちらの内容を残しますか。選ぶまで自動保存を止めています。",
      okText: "いまの画面の内容を残す", cancelText: "サーバーの内容を読み込む"
    }).then(function (mine) {
      self.session.resolveConflict(mine ? "mine" : "server").then(function () {
        if (!mine && self.o.onRestore) self.o.onRestore();
        self.api.toast(mine ? "この画面の内容で保存しました" : "サーバーの内容を読み込みました", "ok");
      });
    });
  };
  EditorShell.prototype.openMore = function () {
    var self = this;
    var extra = (this.o.moreItems || []).filter(function (x) { return x && typeof x.run === "function"; });
    var items = [
      { label: "保存する", icon: "save", run: function () { self.manualSave(); } },
      { label: "複製を作る", icon: "copy", run: function () { self.duplicate(); } },
      { label: "変更履歴", icon: "history", run: function () { self.openHistory(); } },
      { label: "表紙とアイコン", icon: "palette", run: function () { self.openAppearance(); } }
    ].concat(extra).concat([
      { label: "ゴミ箱へ移動", icon: "trash", danger: true, run: function () {
        self.api.confirm({ title: "ゴミ箱へ移動しますか",
          message: "一覧からは見えなくなります。ゴミ箱から元へ戻せます。", okText: "移動" })
          .then(function (yes) {
            if (!yes) return;
            ST.meta(self.item.id, { action: "trash" }).then(function () { self.finish(); });
          });
      } }
    ]);
    sheet(this.api.root, {
      title: "その他の操作",
      html: items.map(function (x, i) {
        return '<button type="button" class="wp-cmd__i' + (x.danger ? " is-danger" : "") + '" data-i="' + i + '">'
          + icon(x.icon || "chevronR") + "<span>" + esc(x.label) + "</span></button>";
      }).join(""),
      onOpen: function (body, close) {
        body.addEventListener("click", function (e) {
          var t = e.target.closest ? e.target.closest("[data-i]") : null;
          if (!t) return;
          close();
          items[Number(t.getAttribute("data-i"))].run();
        });
      }
    });
  };
  EditorShell.prototype.openAppearance = function () {
    var self = this, ap = this.item.appearance;
    var h = '<div class="wp-row"><div class="wp-lab">表紙</div><div class="wp-tpl">'
      + M.GRADIENTS.map(function (g) {
        return '<button type="button" class="wp-tpl__c" data-g="' + esc(g.value) + '">'
          + '<div class="wp-tpl__b" style="background:' + esc(g.value) + '"></div>'
          + '<div class="wp-tpl__t">' + esc(g.label) + "</div></button>";
      }).join("") + "</div></div>"
      + '<div class="wp-row"><label class="wp-lab" for="wpdesc">説明</label>'
      + '<textarea class="wp-ta" id="wpdesc" data-act="desc" placeholder="このファイルの説明">'
      + esc(this.item.description) + "</textarea></div>";
    sheet(this.api.root, {
      title: "表紙とアイコン", html: h,
      onOpen: function (body, close) {
        body.addEventListener("click", function (e) {
          var t = e.target.closest ? e.target.closest("[data-g]") : null;
          if (!t) return;
          ap.bannerType = "gradient";
          ap.bannerValue = t.getAttribute("data-g");
          self.session.touch();
          self.api.toast("表紙を変えました", "ok");
          close();
        });
        body.addEventListener("input", function (e) {
          var t = e.target.closest ? e.target.closest('[data-act="desc"]') : null;
          if (!t) return;
          self.item.description = t.value;
          self.session.touch();
        });
      }
    });
  };

  WP.ui = {
    esc: esc, icon: icon, iconFill: iconFill, ICON_PATHS: P,
    btn: btn, chip: chip, fmtDate: fmtDate,
    sheet: sheet, palette: palette,
    contextMenu: contextMenu, closeContextMenu: closeContextMenu,
    popup: popup, colorPicker: colorPicker, normHex: normHex, SWATCHES: SWATCHES,
    recentColors: recentColors, pushRecent: pushRecent,
    FONTS: FONTS, fontCss: fontCss, fontLabel: fontLabel, fontPicker: fontPicker,
    fontAvailability: fontAvailability,
    progressModal: progressModal,
    fontLoad: fontLoad, fontLoadAll: fontLoadAll, fontReady: fontReady,
    fontFamilyOf: fontFamilyOf, fontCssHrefs: fontCssHrefs,
    fontCount: FONTS.length, fontsBundled: !!(FONTS[0] && FONTS[0].bundled),
    SYMBOLS: SYMBOLS, ENCLOSE: ENCLOSE, encloseHtml: encloseHtml,
    selectionOf: selectionOf, saveSelection: saveSelection, restoreSelection: restoreSelection,
    keepSelection: keepSelection, applyInline: applyInline,
    EditorShell: EditorShell
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
