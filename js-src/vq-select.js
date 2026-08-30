/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — 開く一覧を **アプリ自身のもの**にする（vqcs）

   訴え（2026-08-30・Rinty さん）
     「アプリの ドロップダウンなんだけどさ、独自のものとして 用意しない？
       今は 全て システムのものに なってるから」

   ★ 直す前は **51 個のうち 8 個**にしか 効いていなかった（実測）。
     残り 43 個は システムの 一覧が そのまま 開いていた。理由は 2 つ:

     ① **影の DOM が 見えていなかった。**
        MutationObserver は subtree:true でも 影の 中まで 見ない。
        いまの 画面（作る・設定・画面群・受験・Workplace…）は ほぼ 全部
        影の DOM なので、そこの select は 1 つも 昇格していなかった。
        → Element.prototype.attachShadow を 包んで、**影が できた 瞬間**に
          その 中を 見る。起動時には すでに ある 影も 深く 一巡する。

     ② **隠れていた ものを 永久に 飛ばしていた。**
        起動時に aria-hidden / .hidden だった select は attach() が
        「対象外」と 決めて、あとで 見えるように なっても 二度と 戻らなかった。
        画面の ほとんどは 隠した 板を あとから 見せる 作りなので、
        これで 大半が 落ちていた。
        → 隠れている ものにも 付ける。隠れて いれば そもそも 押せない。

   ・閉じた見た目・レイアウト・既存CSS/JSは一切触らない（＝競合最小）。
     native <select> をそのまま残し、"開く操作" だけ横取りして独自リストを表示する。
   ・選択時は select.value を更新し input/change を発火 → 既存アプリロジックはそのまま動く。
   ・狭い画面（560px 以下）では 下から 出る 板に する（指で 押せる 大きさ）。
   ・全クラス/ID は vqcs- 接頭辞でスコープ。`data-vqcs-skip` で 抜けられる。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqcsInstalled) return;
  window.__vqcsInstalled = true;

  var CSS =
    ".vqcs-layer{position:fixed;inset:0;pointer-events:none;z-index:2147482000;}" +
    ".vqcs-menu{position:fixed;pointer-events:auto;box-sizing:border-box;" +
      "display:flex;flex-direction:column;gap:3px;" +
      "min-width:180px;max-height:min(340px,64vh);overflow-y:auto;overscroll-behavior:contain;" +
      "padding:5px;background:var(--vq-bg-elevated,#FFFFFF);" +
      "border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:var(--vq-r-md,calc(14px * var(--vq-r-scale,1)));" +
      "box-shadow:var(--vq-shadow-floating,0 4px 12px rgba(84,72,140,.10),0 16px 40px rgba(84,72,140,.14));" +
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;" +
      "animation:vqcs-fade 120ms cubic-bezier(.16,1,.3,1);}" +
    "@keyframes vqcs-fade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}" +
    ".vqcs-opt{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;flex:0 0 auto;" +
      "padding:11px 10px 11px 12px;border:0;background:none;border-radius:var(--vq-r-sm,calc(10px * var(--vq-r-scale,1)));" +
      "cursor:pointer;text-align:left;font-size:13.5px;font-weight:500;line-height:1.4;" +
      "color:var(--vq-text,#454151);transition:background 120ms;}" +
    ".vqcs-opt:hover,.vqcs-opt.is-active{background:var(--vq-surface-active,#F1EEF8);}" +
    ".vqcs-opt.is-selected{color:var(--vq-accent-text,#5F579E);font-weight:650;}" +
    ".vqcs-opt[aria-disabled='true']{color:var(--vq-text-disabled,#BBB7C5);cursor:not-allowed;background:none;}" +
    ".vqcs-opt__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".vqcs-opt__check{flex:0 0 auto;width:16px;height:16px;opacity:0;color:var(--vq-accent,#756DB3);}" +
    ".vqcs-opt.is-selected .vqcs-opt__check{opacity:1;}" +
    /* ── 狭い画面は 下から 出る 板（指で 押せる 大きさ）───────────── */
    ".vqcs-scrim{position:fixed;inset:0;pointer-events:auto;background:rgba(24,20,40,.32);" +
      "animation:vqcs-in 140ms ease-out;}" +
    "@keyframes vqcs-in{from{opacity:0}to{opacity:1}}" +
    ".vqcs-menu.is-sheet{left:8px!important;right:8px!important;top:auto!important;" +
      "bottom:0;width:auto;max-width:none!important;min-width:0!important;" +
      "max-height:min(66vh,520px);gap:4px;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));" +
      "border-radius:var(--vq-r-lg,18px) var(--vq-r-lg,18px) 0 0;" +
      "animation:vqcs-up 180ms cubic-bezier(.16,1,.3,1);}" +
    "@keyframes vqcs-up{from{transform:translateY(14px);opacity:.6}to{transform:none;opacity:1}}" +
    ".vqcs-menu.is-sheet .vqcs-opt{padding:14px 12px;font-size:15px;}" +
    ".vqcs-ttl{flex:0 0 auto;padding:4px 12px 8px;font-size:12px;font-weight:650;" +
      "color:var(--vq-text-muted,#8A85A0);}" +
    ".vqcs-open{}";

  var CHECK = '<svg class="vqcs-opt__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  /* 見出しに 使う 名前。aria-label が 無ければ <label for> を 探す。 */
  function 名前(select) {
    try {
      if (select.id) {
        var r = select.getRootNode ? select.getRootNode() : document;
        var l = r.querySelector ? r.querySelector('label[for="' + CSS_ESC(select.id) + '"]') : null;
        if (l) return (l.textContent || "").trim().slice(0, 40);
      }
      var p = select.closest ? select.closest("label") : null;
      if (p) return (p.textContent || "").trim().slice(0, 40);
    } catch (e) {}
    return "";
  }
  function CSS_ESC(v) { return String(v).replace(/["\\]/g, "\\$&"); }
  function isShadow(n) { return typeof ShadowRoot !== "undefined" && n instanceof ShadowRoot; }
  function rootOf(node) { var r = node.getRootNode ? node.getRootNode() : document; return isShadow(r) ? r : document; }

  function ensureStyle(root) {
    var inShadow = isShadow(root);
    var has = inShadow ? root.getElementById("vqcs-style") : document.getElementById("vqcs-style");
    if (has) return;
    var st = document.createElement("style"); st.id = "vqcs-style"; st.textContent = CSS;
    (inShadow ? root : document.head).appendChild(st);
  }
  function layerFor(root) {
    var inShadow = isShadow(root);
    var container = inShadow ? root : document.body;
    var el = inShadow ? root.getElementById("vqcs-layer") : document.getElementById("vqcs-layer");
    if (!el) { el = document.createElement("div"); el.id = "vqcs-layer"; el.className = "vqcs-layer"; container.appendChild(el); }
    return el;
  }

  /* ── 現在開いているメニュー（同時に1つ） ── */
  var cur = null; // { select, menu, root, opts[], active, onDocDown, onScroll, onKey }

  function closeMenu(refocus) {
    if (!cur) return;
    var c = cur; cur = null;
    try { document.removeEventListener("pointerdown", c.onDocDown, true); } catch (e) {}
    try { window.removeEventListener("scroll", c.onScroll, true); } catch (e) {}
    try { window.removeEventListener("resize", c.onScroll, true); } catch (e) {}
    if (isShadow(c.root)) { try { c.root.removeEventListener("pointerdown", c.onDocDown, true); } catch (e) {} }
    if (c.menu && c.menu.parentNode) c.menu.parentNode.removeChild(c.menu);
    if (c.scrim && c.scrim.parentNode) c.scrim.parentNode.removeChild(c.scrim);
    if (c.select) { c.select.removeAttribute("aria-expanded"); if (refocus) { try { c.select.focus(); } catch (e) {} } }
  }

  /* 狭い画面（＝指で 触る 画面）は 下から 出る 板に する。 */
  function 板にするか() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) return true;
      return window.innerWidth <= 560;
    } catch (e) { return false; }
  }
  function position(select, menu) {
    if (menu.classList.contains("is-sheet")) return;   /* 板は CSS が 置く */
    var r = select.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    menu.style.minWidth = Math.max(r.width, 180) + "px";
    menu.style.maxWidth = Math.max(r.width, Math.min(vw - 16, 420)) + "px";
    // 一旦表示して実寸取得
    menu.style.left = "-9999px"; menu.style.top = "0px";
    var mh = menu.offsetHeight, mw = menu.offsetWidth;
    var left = Math.min(r.left, vw - mw - 8); if (left < 8) left = 8;
    var below = vh - r.bottom, above = r.top;
    var top;
    if (below >= mh + 8 || below >= above) { top = Math.min(r.bottom + 6, vh - mh - 8); if (top < 8) top = 8; }
    else { top = Math.max(r.top - mh - 6, 8); }
    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
  }

  function setActive(idx) {
    if (!cur) return;
    var items = cur.menu.querySelectorAll(".vqcs-opt");
    if (!items.length) return;
    if (idx < 0) idx = 0; if (idx > items.length - 1) idx = items.length - 1;
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("is-active", i === idx);
    cur.active = idx;
    var el = items[idx];
    if (el) { var eb = el.getBoundingClientRect(), mb = cur.menu.getBoundingClientRect();
      if (eb.top < mb.top) cur.menu.scrollTop -= (mb.top - eb.top);
      else if (eb.bottom > mb.bottom) cur.menu.scrollTop += (eb.bottom - mb.bottom); }
  }

  function commit(select, optionIndex) {
    var opt = select.options[optionIndex];
    if (!opt || opt.disabled) return;
    if (select.selectedIndex !== optionIndex) {
      select.selectedIndex = optionIndex;
      select.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }
    closeMenu(true);
  }

  function openMenu(select) {
    if (select.disabled) return;
    if (cur && cur.select === select) { closeMenu(true); return; }
    closeMenu(false);
    var root = rootOf(select);
    ensureStyle(root);
    var layer = layerFor(root);
    var 板 = 板にするか();
    var scrim = null;
    if (板) {
      scrim = document.createElement("div");
      scrim.className = "vqcs-scrim";
      scrim.addEventListener("pointerdown", function (e) { e.preventDefault(); closeMenu(true); });
      layer.appendChild(scrim);
    }
    var menu = document.createElement("div");
    menu.className = "vqcs-menu" + (板 ? " is-sheet" : "");
    menu.setAttribute("role", "listbox");
    var lbl = select.getAttribute("aria-label") || 名前(select);
    if (lbl) menu.setAttribute("aria-label", lbl);
    /* 板は 何を 選んでいるのかが 見えなく なるので、見出しを 付ける。 */
    if (板 && lbl) {
      var ttl = document.createElement("div");
      ttl.className = "vqcs-ttl"; ttl.textContent = lbl;
      menu.appendChild(ttl);
    }

    var sel = select.selectedIndex;
    for (var i = 0; i < select.options.length; i++) {
      var o = select.options[i];
      var b = document.createElement("div");
      b.className = "vqcs-opt" + (i === sel ? " is-selected" : "");
      b.setAttribute("role", "option");
      b.setAttribute("data-i", String(i));
      if (i === sel) b.setAttribute("aria-selected", "true");
      if (o.disabled) b.setAttribute("aria-disabled", "true");
      var txt = (o.textContent || o.value || "").trim();
      b.innerHTML = '<span class="vqcs-opt__label"></span>' + CHECK;
      b.firstChild.textContent = txt || " ";
      menu.appendChild(b);
    }
    layer.appendChild(menu);
    cur = { select: select, menu: menu, scrim: scrim, root: root, active: sel < 0 ? 0 : sel };
    select.setAttribute("aria-expanded", "true");
    position(select, menu);
    setActive(cur.active);

    /* クリックで確定 */
    menu.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); });
    menu.addEventListener("click", function (e) {
      var t = e.target; while (t && t !== menu && !t.classList.contains("vqcs-opt")) t = t.parentNode;
      if (t && t.classList && t.classList.contains("vqcs-opt") && t.getAttribute("aria-disabled") !== "true") {
        commit(select, parseInt(t.getAttribute("data-i"), 10));
      }
    });
    menu.addEventListener("mousemove", function (e) {
      var t = e.target; while (t && t !== menu && !t.classList.contains("vqcs-opt")) t = t.parentNode;
      if (t && t.classList && t.classList.contains("vqcs-opt")) {
        var items = menu.querySelectorAll(".vqcs-opt");
        for (var i = 0; i < items.length; i++) if (items[i] === t) { setActive(i); break; }
      }
    });

    /* 外側クリック / スクロール / リサイズ */
    cur.onDocDown = function (e) {
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(menu) === -1 && path.indexOf(select) === -1) closeMenu(false);
    };
    cur.onScroll = function () { if (cur) position(select, menu); };
    document.addEventListener("pointerdown", cur.onDocDown, true);
    if (isShadow(root)) root.addEventListener("pointerdown", cur.onDocDown, true);
    window.addEventListener("scroll", cur.onScroll, true);
    window.addEventListener("resize", cur.onScroll, true);
  }

  /* ── 各 select にハンドラを取り付け（開く操作を横取り） ── */
  function attach(select) {
    if (!select || select.__vqcs) return;
    if (select.multiple) return;
    if (select.hasAttribute("data-vqcs-skip")) return;
    if (select.closest && select.closest("[data-vqcs-skip]")) return;
    /* ★ **隠れていても 付ける**（2026-08-30・訴え）。
       前は 起動時に aria-hidden / .hidden だった ものを 対象外に していた。
       画面の ほとんどは 隠した 板を あとから 見せる 作りなので、
       見えるように なった ときには もう 付け直す 機会が 無く、
       **51 個中 43 個**が システムの 一覧の ままだった（実測）。
       隠れて いれば そもそも 押せないので、付けて 困ることは 無い。 */
    select.__vqcs = true;

    /* ══ 触る 画面では **開く 合図が 違う**（2026-08-31・訴え）════════
       訴え「モバイルだとさ、独自の ドロップダウンより、システムが 勝ってる」
       ★ pointerdown を 止めるだけでは 足りない。
         ・iOS は **touchstart** を 止めないと 端末の 一覧が 出る
         ・Android は **click** で 出る（pointerdown を 止めても 残る）
       ★ どの 合図でも 同じ ところへ 入れ、**1 回の 操作で 1 回だけ** 開く
         （3 つとも 開くと、開いて すぐ 閉じる）。
       ★ 触った ときは 焦点を 当てない。当てると 端末が 一覧を 出す。 */
    function 開く合図(e) {
      if (select.disabled) return;
      if (e.type === "pointerdown" && e.button != null && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();
      var t = Date.now();
      /* ★ 同じ 1 回の 操作（pointerdown → touchstart → click）を 1 回に まとめる。
         **開いている 相手が この select の ときだけ** 飛ばす。
         そうしないと、閉じた あと 700 ミリ秒 以内に もう一度 押しても
         開かなく なる（実測で 下から 出る 板が 出なく なった）。
         700 ミリ秒 より あとの 押し直しは これまでどおり 開閉の 切り替え。 */
      if (cur && cur.select === select && t - (select.__vqcsAt || 0) < 700) return;
      select.__vqcsAt = t;
      if (e.type === "touchstart") { try { select.blur(); } catch (x) {} }
      else { try { select.focus(); } catch (x) {} }
      openMenu(select);
    }
    select.addEventListener("pointerdown", 開く合図);
    select.addEventListener("touchstart", 開く合図, { passive: false });
    select.addEventListener("click", function (e) {
      if (select.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      開く合図(e);
    });
    // 一部ブラウザの keyboard/クリックで開くのも抑止して独自メニューへ
    select.addEventListener("mousedown", function (e) { e.preventDefault(); });
    select.addEventListener("keydown", function (e) {
      var k = e.key;
      if (cur && cur.select === select) {
        if (k === "ArrowDown") { e.preventDefault(); setActive(cur.active + 1); }
        else if (k === "ArrowUp") { e.preventDefault(); setActive(cur.active - 1); }
        else if (k === "Home") { e.preventDefault(); setActive(0); }
        else if (k === "End") { e.preventDefault(); setActive(select.options.length - 1); }
        else if (k === "Enter" || k === " " || k === "Tab") {
          if (k !== "Tab") e.preventDefault();
          commit(select, cur.active); if (k === "Tab") {/* allow default focus move after commit */}
        }
        else if (k === "Escape") { e.preventDefault(); closeMenu(true); }
        else if (k && k.length === 1) { typeahead(select, k); }
      } else {
        if (k === "ArrowDown" || k === "ArrowUp" || k === " " || k === "Enter") { e.preventDefault(); openMenu(select); }
      }
    });
  }

  var _ta = { s: "", t: 0 };
  function typeahead(select, ch) {
    var now = Date.now(); if (now - _ta.t > 900) _ta.s = ""; _ta.t = now; _ta.s += ch.toLowerCase();
    for (var i = 0; i < select.options.length; i++) {
      var t = (select.options[i].textContent || "").trim().toLowerCase();
      if (t.indexOf(_ta.s) === 0) { setActive(i); break; }
    }
  }

  function enhanceWithin(node) {
    if (!node) node = document;
    if (isShadow(node)) { 見張る(node); return; }
    深く一巡(node.querySelectorAll ? node : document);
  }
  window.__vqcsEnhance = enhanceWithin;
  /* 何個 昇格したかを 数える（検証のため。**動くふりを しない**）。 */
  window.__vqcsCount = function () {
    var 全 = 0, 済 = 0;
    (function 巡(node) {
      if (!node || !node.querySelectorAll) return;
      var s = node.querySelectorAll("select");
      for (var i = 0; i < s.length; i++) { 全++; if (s[i].__vqcs) 済++; }
      var all = node.querySelectorAll("*");
      for (var k = 0; k < all.length; k++) if (all[k].shadowRoot) 巡(all[k].shadowRoot);
    })(document);
    return { 全: 全, 独自: 済 };
  };
  window.__vqcsClose = function () { closeMenu(false); };

  /* ══ 影の DOM まで 届かせる（2026-08-30・訴え）══════════════════════
     ★ **ここが 効いていなかった 芯。**
       MutationObserver は subtree:true でも 影の 中を 見ない。
       いまの 画面は ほぼ 全部 影の DOM なので、そこの select は
       1 つも 昇格していなかった（実測 51 個中 8 個だけ）。
     ★ 影は 2 つの 道で 捕まえる:
       ① これから できる 影 … attachShadow を 包む（できた 瞬間に 入る）
       ② もう ある 影     … 起動時に 深く 一巡する
     ★ 見張りは **root ごとに** 1 本 置く。二重に 置かない。
     ★ mode:"closed" の 影は 触れない（アプリは 全部 "open"）。 */
  var 見た = typeof WeakSet === "function" ? new WeakSet() : null;
  function 見張る(root) {
    if (!root) return;
    if (見た) { if (見た.has(root)) return; 見た.add(root); }
    else { if (root.__vqcsWatched) return; root.__vqcsWatched = true; }
    ensureStyle(root);
    深く一巡(root);
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var a = muts[i].addedNodes;
          for (var j = 0; j < a.length; j++) {
            var n = a[j]; if (!n || n.nodeType !== 1) continue;
            if (n.tagName === "SELECT") attach(n);
            else 深く一巡(n);
          }
        }
      });
      mo.observe(isShadow(root) ? root : (root.documentElement || root),
                 { childList: true, subtree: true });
    } catch (e) {}
  }
  /* node の 下を、影の 中まで 降りて 一巡する。 */
  function 深く一巡(node) {
    if (!node || !node.querySelectorAll) return;
    try {
      var sels = node.querySelectorAll("select");
      for (var i = 0; i < sels.length; i++) attach(sels[i]);
      if (node.tagName === "SELECT") attach(node);
      var all = node.querySelectorAll("*");
      for (var k = 0; k < all.length; k++) {
        var sr = all[k].shadowRoot;
        if (sr) 見張る(sr);
      }
      if (node.shadowRoot) 見張る(node.shadowRoot);
    } catch (e) {}
  }
  /* 影が できた 瞬間に 入る。**遅らせない**（一瞬でも システムの 一覧を 出さない）。 */
  (function 影ができたら入る() {
    try {
      var E = window.Element && window.Element.prototype;
      if (!E || !E.attachShadow || E.__vqcsShadowPatched) return;
      var 元 = E.attachShadow;
      E.attachShadow = function () {
        var sr = 元.apply(this, arguments);
        try { if (sr) 見張る(sr); } catch (e) {}
        return sr;
      };
      E.__vqcsShadowPatched = true;
    } catch (e) {}
  })();

  /* ── 自動適用（light DOM ＋ 影の DOM）── */
  function boot() {
    ensureStyle(document);
    見張る(document);
    // ページ内スクロール中に開いていたら閉じる保険（capture済だがフォールバック）
    window.addEventListener("blur", function () { closeMenu(false); });
    /* 遅れて 組み上がる 層（板・作業場）へも 何度か 手を 伸ばす。
       見張りが 効いていれば 空振りするだけで、二度は 付かない。 */
    var n = 0;
    var t = setInterval(function () { 深く一巡(document); if (++n >= 6) clearInterval(t); }, 1200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

