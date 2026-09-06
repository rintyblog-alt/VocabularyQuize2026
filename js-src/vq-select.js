/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — 開く一覧を **アプリ自身のもの**にする（vqcs）

   訴え（2026-08-30・Rinty さん）
     「アプリの ドロップダウンなんだけどさ、独自のものとして 用意しない？
       今は 全て システムのものに なってるから」

   ★ 直す前は **51 個のうち 8 個**にしか 効いていなかった（実測）。
     残り 43 個は システムの 一覧が そのまま 開いていた。理由は 2 つ:

     ① **影の DOM が 見えていなかった。**
        MutationObserver は subtree:true でも 影の 中まで 見ない。
        → Element.prototype.attachShadow を 包んで、**影が できた 瞬間**に
          その 中を 見る。起動時には すでに ある 影も 深く 一巡する。

     ② **隠れていた ものを 永久に 飛ばしていた。**
        → 隠れている ものにも 付ける。隠れて いれば そもそも 押せない。

   訴え（2026-08-31・Rinty さん）
     「モバイルの ドロップダウンが、まだ システムが 反応してしまってるのと、
       独自ドロップダウンを モバイルだと 下部バー（ナビゲーションバー）に
       被ってしまう ことが あるから、直下に おいて。」

   ★ ここで 直した 2 つ（どちらも **原因が はっきり している**）:

     ③ **触った ときに select へ 焦点を 当てていた。**
        iOS は select に 焦点が 入った だけで 端末の 一覧を 出す。
        ・iOS の 順番は pointerdown → touchstart。前の 作りは
          pointerdown を 「触る 合図」と 見ておらず focus() を 呼んでいた。
        ・**選んだ あと**も closeMenu(true) が focus() を 呼んでいたので、
          選ぶ たびに 端末の 一覧が 出ていた（いちばん 目に つく 症状）。
        → 触って 開いた ときは 焦点を 当てない・戻さない。touchend も 止める。
          念のため、触った 直後に 焦点が 入ったら すぐ 外す。

     ④ **一覧を 影の DOM の 中に 出していた。**
        影の 中の 重なりは **持ち主（host）の 重なり**に 閉じ込められる。
        z-index を いくら 上げても、host より 上の #vqMobBar（z-index:9990）
        には 勝てない。どの 画面かで 変わるので 「ことが ある」に なる。
        → 一覧は いつも **document.body** に 出す。
          そのうえで **下部バーの 上端**を 見て、そこより 下へ 出さない。

     ・下から 出る 板は やめ、**押した ところの 直下**に 出す（訴えどおり）。
       指で 押せる 大きさ（44px 以上）は そのまま 保つ。

   ・閉じた見た目・レイアウト・既存CSS/JSは一切触らない（＝競合最小）。
     native <select> をそのまま残し、"開く操作" だけ横取りして独自リストを表示する。
   ・選択時は select.value を更新し input/change を発火 → 既存アプリロジックはそのまま動く。
   ・全クラス/ID は vqcs- 接頭辞でスコープ。`data-vqcs-skip` で 抜けられる。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqcsInstalled) return;
  window.__vqcsInstalled = true;

  var CSS =
    /* ★ 重なりは **開いた 板より 上**でなければ 意味が ない。
       いまの 上位: 停止中の 覆い 2147483646 / Live 2147483644 /
       作る 画面 2147483100 / 下部バー 9990。
       停止中の 覆いだけには 譲る（あれは 全部を 止める もの）。 */
    ".vqcs-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483645;}" +
    ".vqcs-menu{position:fixed;pointer-events:auto;box-sizing:border-box;" +
      "display:flex;flex-direction:column;gap:3px;" +
      "min-width:180px;max-height:min(340px,64vh);overflow-y:auto;overscroll-behavior:contain;" +
      "-webkit-overflow-scrolling:touch;" +
      "padding:5px;background:var(--vq-bg-elevated,#FFFFFF);" +
      "border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:var(--vq-r-md,calc(14px * var(--vq-r-scale,1)));" +
      "box-shadow:var(--vq-shadow-floating,0 4px 12px rgba(84,72,140,.10),0 16px 40px rgba(84,72,140,.14));" +
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;" +
      "animation:vqcs-fade 120ms cubic-bezier(.16,1,.3,1);}" +
    "@keyframes vqcs-fade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}" +
    ".vqcs-menu.is-up{animation:vqcs-fade-up 120ms cubic-bezier(.16,1,.3,1);}" +
    "@keyframes vqcs-fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    ".vqcs-opt{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;flex:0 0 auto;" +
      "padding:11px 10px 11px 12px;border:0;background:none;border-radius:var(--vq-r-sm,calc(10px * var(--vq-r-scale,1)));" +
      "cursor:pointer;text-align:left;font-size:13.5px;font-weight:500;line-height:1.4;" +
      "-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;" +
      "color:var(--vq-text,#454151);transition:background 120ms;}" +
    ".vqcs-opt:hover,.vqcs-opt.is-active{background:var(--vq-surface-active,#F1EEF8);}" +
    ".vqcs-opt.is-selected{color:var(--vq-accent-text,#5F579E);font-weight:650;}" +
    ".vqcs-opt[aria-disabled='true']{color:var(--vq-text-disabled,#BBB7C5);cursor:not-allowed;background:none;}" +
    ".vqcs-opt__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".vqcs-opt__check{flex:0 0 auto;width:16px;height:16px;opacity:0;color:var(--vq-accent,#756DB3);}" +
    ".vqcs-opt.is-selected .vqcs-opt__check{opacity:1;}" +
    /* ── 触る 画面（指で 押せる 大きさ・押した ところの 直下に 出る）───── */
    ".vqcs-scrim{position:fixed;inset:0;pointer-events:auto;background:transparent;}" +
    ".vqcs-menu.is-touch{gap:4px;padding:6px;" +
      "border-radius:var(--vq-r-lg,calc(18px * var(--vq-r-scale,1)));}" +
    ".vqcs-menu.is-touch .vqcs-opt{min-height:46px;padding:12px 12px;font-size:15px;}" +
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

  function ensureStyle() {
    if (document.getElementById("vqcs-style")) return;
    var st = document.createElement("style"); st.id = "vqcs-style"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  /* ★ 一覧は **いつも document.body** に 出す（2026-08-31・訴え ④）。
     影の 中に 出すと、重なりが 持ち主の 重なりに 閉じ込められて
     下部バー（z-index:9990）に 負ける ことが ある。 */
  function layerFor() {
    ensureStyle();
    var el = document.getElementById("vqcs-layer");
    if (!el || !el.isConnected) {
      el = document.createElement("div"); el.id = "vqcs-layer"; el.className = "vqcs-layer";
      (document.body || document.documentElement).appendChild(el);
    } else if (el.parentNode !== document.body && document.body) {
      document.body.appendChild(el);          /* 画面ごと 差し替えられても 付け直す */
    }
    return el;
  }

  /* ── 現在開いているメニュー（同時に1つ） ── */
  var cur = null; // { select, menu, root, opts[], active, onDocDown, onScroll, onKey }
  /* 最後に 指で 触った 時刻。**焦点を 当てて よいか**の 判断に 使う。 */
  var 最後に触った = 0;
  function 触ったばかり() { return Date.now() - 最後に触った < 900; }
  try {
    window.addEventListener("touchstart", function () { 最後に触った = Date.now(); }, true);
    window.addEventListener("pointerdown", function (e) {
      if (e && e.pointerType && e.pointerType !== "mouse") 最後に触った = Date.now();
    }, true);
  } catch (e) {}

  function closeMenu(refocus) {
    if (!cur) return;
    var c = cur; cur = null;
    try { document.removeEventListener("pointerdown", c.onDocDown, true); } catch (e) {}
    try { window.removeEventListener("scroll", c.onScroll, true); } catch (e) {}
    try { window.removeEventListener("resize", c.onScroll, true); } catch (e) {}
    if (isShadow(c.root)) { try { c.root.removeEventListener("pointerdown", c.onDocDown, true); } catch (e) {} }
    if (c.menu && c.menu.parentNode) c.menu.parentNode.removeChild(c.menu);
    if (c.scrim && c.scrim.parentNode) c.scrim.parentNode.removeChild(c.scrim);
    if (c.select) {
      c.select.removeAttribute("aria-expanded");
      /* 開いている あいだ 切っていた 当たり判定を 戻す。 */
      if (c.元のpe != null) { try { c.select.style.pointerEvents = c.元のpe; } catch (e) {} }
      /* ★ 触って 選んだ ときは **焦点を 戻さない**（2026-08-31・訴え ③）。
         iOS は select に 焦点が 入った だけで 端末の 一覧を 出すので、
         ここで 戻すと 選ぶ たびに システムの 一覧が 開いていた。 */
      /* ★ **巻きを 動かさない**（2026-09-01・訴え「選択したりして 更新すると
         上に スクロールして しまう」）。focus() は 既定で **その 部品が 見える
         ところまで 親を 巻き戻す**。窓の 上の ほうに ある 選び欄を 選ぶと、
         下まで 巻いて いた 画面が 一気に 先頭へ 戻って いた（実測 333 → 0）。
         焦点は 要る（キーボードで 続けて 操作できる）ので、**巻きだけ 止める**。 */
      if (refocus && !触ったばかり()) { try { c.select.focus({ preventScroll: true }); } catch (e) { try { c.select.focus(); } catch (e2) {} } }
    }
  }

  /* 指で 触る 画面か（大きさでは なく **入力の しかた**で 決める）。 */
  function 触る画面() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (触ったばかり()) return true;
      return window.innerWidth <= 560;
    } catch (e) { return false; }
  }

  /* ★ 下部バー（ナビゲーションバー）の 上端。ここより 下へは 出さない。
     body の 直下だけを 見る（安い）。画面いっぱいの 覆いは 除く。 */
  function 下の限り() {
    var vh = window.innerHeight, vw = window.innerWidth;
    var 下 = vh - 8 - 安全な下();
    try {
      var ch = document.body ? document.body.children : [];
      for (var i = 0; i < ch.length; i++) {
        var el = ch[i];
        if (!el || el.id === "vqcs-layer") continue;
        var cs = window.getComputedStyle(el);
        if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        if (parseFloat(cs.opacity || "1") < 0.05) continue;
        var b = el.getBoundingClientRect();
        if (b.height <= 8 || b.height > vh * 0.35) continue;   /* 覆い・全画面は 除く */
        if (b.width < vw * 0.5) continue;                      /* 横いっぱいの 帯だけ */
        if (b.bottom < vh - 4) continue;                        /* 下に ついている ものだけ */
        if (b.top - 8 < 下) 下 = b.top - 8;
      }
    } catch (e) {}
    return 下;
  }
  var _安全 = null;
  function 安全な下() {
    if (_安全 != null) return _安全;
    try {
      var p = document.createElement("div");
      p.style.cssText = "position:fixed;bottom:0;left:-9999px;width:1px;pointer-events:none;" +
                        "height:var(--vq-sab,0px);";
      (document.body || document.documentElement).appendChild(p);
      _安全 = p.offsetHeight || 0;
      p.parentNode.removeChild(p);
    } catch (e) { _安全 = 0; }
    return _安全;
  }
  try { window.addEventListener("resize", function () { _安全 = null; }); } catch (e) {}

  /* ★ **押した ところの 直下**に 出す（2026-08-31・訴え）。
     入り切らない ときだけ 上へ 逃がす。下部バーには 決して 掛けない。 */
  function position(select, menu) {
    var r = select.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var 触 = menu.classList.contains("is-touch");
    var 上限 = 8, 下限 = 下の限り();
    if (下限 < 上限 + 80) 下限 = Math.min(vh - 8, 上限 + 80);   /* 帯が 大きすぎる ときの 保険 */

    var 幅 = Math.max(r.width, 触 ? 220 : 180);
    menu.style.minWidth = Math.round(Math.min(幅, vw - 16)) + "px";
    menu.style.maxWidth = Math.round(Math.min(vw - 16, Math.max(幅, 触 ? 520 : 420))) + "px";

    var 下の余り = 下限 - (r.bottom + 6);
    var 上の余り = (r.top - 6) - 上限;
    var 天井 = Math.min(触 ? 420 : 340, vh * 0.7);
    /* ★ **下を 強く 優先**する（訴え「直下に おいて」）。
       上のほうが 広くても、下に 200px 取れるなら 下へ 出す。
       上へ 逃がすのは 下が 本当に 狭い ときだけ。 */
    var 下へ = (下の余り >= 200) || (下の余り >= 上の余り);
    menu.style.maxHeight = Math.round(Math.max(120, Math.min(天井, 下へ ? 下の余り : 上の余り))) + "px";

    menu.style.left = "-9999px"; menu.style.top = "0px";
    var mh = menu.offsetHeight, mw = menu.offsetWidth;

    var left = Math.min(r.left, vw - mw - 8); if (left < 8) left = 8;
    var top;
    if (下へ) { top = Math.min(r.bottom + 6, 下限 - mh); if (top < 上限) top = 上限; }
    else { top = Math.max(r.top - mh - 6, 上限); }
    menu.classList.toggle("is-up", !下へ);
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

  function openMenu(select, 触指定) {
    if (select.disabled) return;
    if (cur && cur.select === select) { closeMenu(true); return; }
    closeMenu(false);
    var root = rootOf(select);
    var layer = layerFor();
    /* ★ 指で 開いたのか マウスで 開いたのかは **その 合図**で 決める。
       画面の 広さだけで 決めると、触れる パソコンで ちぐはぐに なる。 */
    var 触 = (触指定 == null) ? 触る画面() : !!触指定;
    var scrim = null;
    if (触) {
      /* 外を 触った ときに 下の ボタンが 反応しないよう、透明な 幕で 受ける。 */
      scrim = document.createElement("div");
      scrim.className = "vqcs-scrim";
      scrim.addEventListener("pointerdown", function (e) { e.preventDefault(); closeMenu(false); });
      scrim.addEventListener("touchstart", function (e) { if (e.cancelable) e.preventDefault(); closeMenu(false); }, { passive: false });
      layer.appendChild(scrim);
    }
    var menu = document.createElement("div");
    menu.className = "vqcs-menu" + (触 ? " is-touch" : "");
    menu.setAttribute("role", "listbox");
    var lbl = select.getAttribute("aria-label") || 名前(select);
    if (lbl) menu.setAttribute("aria-label", lbl);

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
      b.firstChild.textContent = txt || " ";
      menu.appendChild(b);
    }
    layer.appendChild(menu);
    cur = { select: select, menu: menu, scrim: scrim, root: root, active: sel < 0 ? 0 : sel };
    select.setAttribute("aria-expanded", "true");
    position(select, menu);
    setActive(cur.active);

    /* クリックで確定 */
    /* マウスの ときだけ 既定を 止める（文字の 選択・焦点の 移動を 防ぐ）。
       指の ときは 止めない。止めると 一覧が なぞって 動かせなく なる。 */
    menu.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      if (!e.pointerType || e.pointerType === "mouse") e.preventDefault();
    });
    menu.addEventListener("click", function (e) {
      var t = e.target; while (t && t !== menu && !t.classList.contains("vqcs-opt")) t = t.parentNode;
      if (t && t.classList && t.classList.contains("vqcs-opt") && t.getAttribute("aria-disabled") !== "true") {
        commit(select, parseInt(t.getAttribute("data-i"), 10));
      }
    });
    /* 触る 画面は click を 待たずに 決める（合成の click が 来ない ことが ある）。
       ★ ただし **なぞって 一覧を 動かした ときは 決めない**（指を 離した ところで
         勝手に 選ばれる）。10px より 動いたら 見送る。 */
    var 触点 = null;
    menu.addEventListener("touchstart", function (e) {
      var p = e.touches && e.touches[0];
      触点 = p ? { x: p.clientX, y: p.clientY, 動: false } : null;
    }, { passive: true });
    menu.addEventListener("touchmove", function (e) {
      var p = e.touches && e.touches[0];
      if (触点 && p && (Math.abs(p.clientX - 触点.x) > 10 || Math.abs(p.clientY - 触点.y) > 10)) 触点.動 = true;
    }, { passive: true });
    menu.addEventListener("touchend", function (e) {
      if (触点 && 触点.動) { 触点 = null; return; }
      触点 = null;
      var t = e.target; while (t && t !== menu && !t.classList.contains("vqcs-opt")) t = t.parentNode;
      if (t && t.classList && t.classList.contains("vqcs-opt") && t.getAttribute("aria-disabled") !== "true") {
        if (e.cancelable) e.preventDefault();
        commit(select, parseInt(t.getAttribute("data-i"), 10));
      }
    }, { passive: false });
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
    cur.触 = 触;
    /* ★ 開いている あいだは select 自身を **触れなく**する。
       2 度目の tap が 端末の 一覧へ 行くのを 断つ（見た目は 変わらない）。 */
    if (触) {
      try { cur.元のpe = select.style.pointerEvents || ""; select.style.pointerEvents = "none"; } catch (e) {}
      /* 端末が あとから 焦点を 入れて くることが あるので、次の コマでも 外す。 */
      try {
        var 外す = function () { if (cur && cur.select === select) { try { select.blur(); } catch (x) {} } };
        requestAnimationFrame(外す); setTimeout(外す, 60); setTimeout(外す, 200);
      } catch (e) {}
    }
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
         ・iOS は **touchstart / touchend** を 止めないと 端末の 一覧が 出る
         ・Android は **click** で 出る（pointerdown を 止めても 残る）
       ★ どの 合図でも 同じ ところへ 入れ、**1 回の 操作で 1 回だけ** 開く。
       ★ ★ 触った ときは **焦点を 当てない**。
         iOS は select に 焦点が 入った だけで 端末の 一覧を 出す。
         前の 作りは iOS の 順番（pointerdown → touchstart）を 知らず、
         先に 来る pointerdown で focus() を 呼んでいた。ここが 芯。 */
    function 触る系(e) {
      if (e.type === "touchstart" || e.type === "touchend") return true;
      if (e.pointerType) return e.pointerType !== "mouse";
      return 触ったばかり() || 触る画面();
    }
    function 開く合図(e) {
      if (select.disabled) return;
      if (e.type === "pointerdown" && e.button != null && e.button > 0) return;
      var 触 = 触る系(e);
      if (触) 最後に触った = Date.now();
      if (e.cancelable) e.preventDefault();
      var t = Date.now();
      /* ★ 同じ 1 回の 操作（pointerdown → touchstart → click）を 1 回に まとめる。
         **開いている 相手が この select の ときだけ** 飛ばす。
         そうしないと、閉じた あと 700 ミリ秒 以内に もう一度 押しても
         開かなく なる（実測で 一覧が 出なく なった）。 */
      if (cur && cur.select === select && t - (select.__vqcsAt || 0) < 700) return;
      select.__vqcsAt = t;
      if (触) { try { select.blur(); } catch (x) {} }
      else { try { select.focus({ preventScroll: true }); } catch (x) { try { select.focus(); } catch (x2) {} } }
      openMenu(select, 触);
    }
    select.addEventListener("pointerdown", 開く合図);
    select.addEventListener("touchstart", 開く合図, { passive: false });
    /* touchend も 止める。iOS は ここで 合成の click と 端末の 一覧を 出す。 */
    select.addEventListener("touchend", function (e) {
      最後に触った = Date.now();
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    select.addEventListener("click", function (e) {
      if (select.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      開く合図(e);
    });
    /* ★ 最後の 砦。触った 直後に 焦点が 入ったら すぐ 外す。
       （どこか よそから focus() されても 端末の 一覧を 出させない） */
    select.addEventListener("focus", function () {
      if (触ったばかり() || (cur && cur.select === select && cur.触)) {
        try { select.blur(); } catch (x) {}
      }
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
  /* 検証用: いま 開いている 一覧の 置き場所と 下端の 限り。 */
  window.__vqcsWhere = function () {
    if (!cur) return null;
    var b = cur.menu.getBoundingClientRect();
    return { body: cur.menu.parentNode === document.getElementById("vqcs-layer") &&
                   document.getElementById("vqcs-layer").parentNode === document.body,
             上: Math.round(b.top), 下: Math.round(b.bottom), 左: Math.round(b.left),
             幅: Math.round(b.width), 高: Math.round(b.height),
             限り: Math.round(下の限り()), 触: cur.menu.classList.contains("is-touch"),
             上向き: cur.menu.classList.contains("is-up") };
  };

  /* ══ 影の DOM まで 届かせる（2026-08-30・訴え）══════════════════════
     ★ **ここが 効いていなかった 芯。**
       MutationObserver は subtree:true でも 影の 中を 見ない。
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
    ensureStyle();
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
