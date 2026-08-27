/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 本体への結線（§3）

   ・左サイドバーへ「WORKPLACE」の区画を足す。既存の並びは書き換えない。
   ・?wpform=<publicId> で開かれたときは、回答ページだけを出す（編集画面へ行かせない）。
   ・押しても何も起きない入口は置かない。並べるのは実際に開けるものだけ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui;
  var doc = root.document;

  var NAV_ID = "vq2-wp-nav";

  /* 作るときに設定を反映する。store 側からは設定層を知らないので、ここで挟む。 */
  var rawCreate = ST.create;
  ST.create = function (itemType, o) {
    o = o || {};
    if (!o.content && WP.settings && WP.settings.applyToNew)
      o = Object.assign({}, o, { content: WP.settings.applyToNew(itemType, M.emptyContent(itemType)) });
    return rawCreate(itemType, o);
  };

  var ITEMS = [
    { label: "Workplace", icon: "layers", open: function () { WP.home.open({}); } },
    { label: "Docs", icon: "fileText", open: function () { WP.home.open({ tab: "docs" }); } },
    { label: "Sheets", icon: "table", open: function () { WP.home.open({ tab: "sheets" }); } },
    { label: "Slides", icon: "presentation", open: function () { WP.home.open({ tab: "slides" }); } },
    { label: "Forms", icon: "clipboardList", open: function () { WP.home.open({ tab: "forms" }); } }
  ];

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function mountNav() {
    var host = doc.getElementById("vqShell");
    var sr = host && host.shadowRoot;
    if (!sr) return false;
    var scroll = sr.querySelector(".scroll");
    if (!scroll) return false;

    var old = sr.querySelector("#" + NAV_ID);
    if (old) { try { old.parentNode.removeChild(old); } catch (e) {} }

    var box = doc.createElement("div");
    box.id = NAV_ID;
    /* サイドバー自身の CSS（.section / .nav / .vqs-item）にそのまま乗せる */
    box.innerHTML = '<div class="section">WORKPLACE</div><div class="nav">'
      + ITEMS.map(function (it, i) {
        return '<button class="vqs-item" type="button" data-wp="' + i + '" title="' + esc(it.label) + '">'
          + U.icon(it.icon) + '<span class="vqs-item__l">' + esc(it.label) + "</span></button>";
      }).join("") + "</div>";
    scroll.appendChild(box);

    if (!sr.__wpHooked) {
      sr.__wpHooked = true;
      sr.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-wp]") : null;
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        var it = ITEMS[Number(t.getAttribute("data-wp"))];
        if (it) it.open();
      });
    }
    return true;
  }

  /* サイドバーはあとから作られることがあるので、出てくるまで待つ。
     出たら止める（ずっと回し続けない）。 */
  function install() {
    if (mountNav()) return;
    var tries = 0;
    var t = root.setInterval(function () {
      tries++;
      if (mountNav() || tries > 60) root.clearInterval(t);
    }, 500);
  }

  function boot() {
    /* 公開フォームの URL で開かれたら、回答画面だけを出して終わり。 */
    if (WP.formsPublic.autoOpen()) return;
    install();
    /* ログインし直したときに、端末に残っている未同期のものを送る。 */
    if (ST.isSignedIn() && ST.isOnline()) {
      root.setTimeout(function () {
        var n = Object.keys(ST.pendingAll()).length;
        if (n) ST.syncPending();
      }, 4000);
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else root.setTimeout(boot, 0);

  /* コンソールからも開けるようにする（動作確認用） */
  VQ2.workplace.open = function (o) { return WP.home.open(o || {}); };
  VQ2.openWorkplace = VQ2.workplace.open;

  WP.entry = { install: install, mountNav: mountNav, ITEMS: ITEMS };
})(typeof globalThis !== "undefined" ? globalThis : this);
