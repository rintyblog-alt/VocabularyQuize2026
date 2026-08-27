/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz 公式サイト — 土台の動き（段A・2026-08-18）

   ★ ここでやること
     ① 画面いっぱいのメニュー（開閉・ESC・行き先を絞る）
     ② スクロール演出（**一度出たら再生しない**）
     ③ 背景の星のわずかなパララックス（**768px 未満では止める**）
   ★ 動きを減らす設定の人には、①以外は動かさない。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var 動きを減らす = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── ① 画面いっぱいのメニュー ─────────────────────────────────── */
  var burger = document.getElementById("burger");
  var menu = document.getElementById("menu");
  var closeBtn = document.getElementById("menuClose");
  var 直前の主 = null;

  function 触れるもの() {
    /* ★ offsetParent で見てはいけない（2026-08-18・実測）。
       メニューは position: fixed なので、その中の要素は
       **見えていても offsetParent が null** になる。
       結果、開いても行き先が 1 つも見つからず、焦点が中へ移らなかった。
       実際に場所を持っているか（矩形があるか）で見る。 */
    return Array.prototype.slice.call(
      menu.querySelectorAll('a[href], button:not([disabled])')
    ).filter(function (el) { return el.getClientRects().length > 0; });
  }
  function 開く() {
    直前の主 = document.activeElement;
    menu.setAttribute("data-open", "true");
    menu.removeAttribute("inert");
    burger.setAttribute("aria-expanded", "true");
    document.body.setAttribute("data-menu", "open");
    /* ★ ここで **すぐに focus しても効かない**（2026-08-18・実測）。
       メニューは visibility: hidden → visible の変化中で、
       属性を変えた直後は計算し直されておらず、
       「見えていない要素」には焦点を当てられないため黙って失敗する。
       いったん配置を計算させてから当て、それでも駄目なら次の描画で当て直す。 */
    void menu.offsetHeight;
    var 当てる = function () {
      var 先 = 触れるもの()[0];
      if (先) 先.focus();
      return !!(先 && document.activeElement === 先);
    };
    if (!当てる()) window.requestAnimationFrame(当てる);
  }
  function 閉じる() {
    menu.setAttribute("data-open", "false");
    /* ★ 閉じたら **読み上げにも触れられなくする**。
       見えないのに Tab で入れる状態が残るのがいちばん困る。 */
    menu.setAttribute("inert", "");
    burger.setAttribute("aria-expanded", "false");
    document.body.removeAttribute("data-menu");
    if (直前の主 && 直前の主.focus) 直前の主.focus();
  }
  if (burger && menu) {
    menu.setAttribute("inert", "");
    burger.addEventListener("click", function () {
      menu.getAttribute("data-open") === "true" ? 閉じる() : 開く();
    });
    if (closeBtn) closeBtn.addEventListener("click", 閉じる);
    menu.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) 閉じる();
    });
    document.addEventListener("keydown", function (e) {
      if (menu.getAttribute("data-open") !== "true") return;
      if (e.key === "Escape") { e.preventDefault(); 閉じる(); return; }
      /* 開いている間は、Tab がメニューの外へ出ていかないようにする */
      if (e.key !== "Tab") return;
      var ら = 触れるもの();
      if (!ら.length) return;
      var 先頭 = ら[0], 末尾 = ら[ら.length - 1];
      if (e.shiftKey && document.activeElement === 先頭) { e.preventDefault(); 末尾.focus(); }
      else if (!e.shiftKey && document.activeElement === 末尾) { e.preventDefault(); 先頭.focus(); }
    });
    /* 画面を広げてナビが戻ったら、開いたままにしない */
    if (window.matchMedia) {
      var 広い = window.matchMedia("(min-width: 900px)");
      var 見張る = function () { if (広い.matches && menu.getAttribute("data-open") === "true") 閉じる(); };
      広い.addEventListener ? 広い.addEventListener("change", 見張る) : 広い.addListener(見張る);
    }
  }

  /* ── ② スクロール演出（once）──────────────────────────────────── */
  var ら = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (動きを減らす || !("IntersectionObserver" in window)) {
    ら.forEach(function (el) { el.setAttribute("data-shown", "true"); });
  } else {
    var 見張り = new IntersectionObserver(function (入ってきた) {
      入ってきた.forEach(function (x) {
        if (!x.isIntersecting) return;
        /* stagger は 60ms 刻み。**同時に何個も動かさない** */
        var n = Number(x.target.getAttribute("data-delay") || 0);
        setTimeout(function () { x.target.setAttribute("data-shown", "true"); }, n);
        /* ★ 一度出したら見張りを外す。上下するたびに再生されるのが
           いちばん安っぽい。 */
        見張り.unobserve(x.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    ら.forEach(function (el) { 見張り.observe(el); });
  }

  /* ── ③ 星のパララックス（デスクトップのみ・ごく薄く）────────────── */
  var 星層 = document.getElementById("starLayer");
  if (星層 && !動きを減らす) {
    var 効かせる = window.matchMedia("(min-width: 768px)");
    var 待機 = false;
    function 描く() {
      待機 = false;
      if (!効かせる.matches) { 星層.style.transform = ""; return; }
      var y = window.scrollY || window.pageYOffset || 0;
      /* 0.04 倍。これ以上つけると「動く背景」になって読みにくい */
      星層.style.transform = "translate3d(0," + (-y * 0.04).toFixed(1) + "px,0)";
    }
    window.addEventListener("scroll", function () {
      if (待機) return;
      待機 = true;
      window.requestAnimationFrame(描く);
    }, { passive: true });
    描く();
  }

  /* ── ④ 見えているときだけ動かす ────────────────────────────────
     ★ 規約は「1 画面で同時に動くのは 1 つ」「ループは 1 画面に 1 つまで」。
       絵が 3 つ（ヒーロー・検証・非破壊）あるので、
       **画面に入っているものだけ**動かして、規約を作りで守る。
       ついでに、見ていない絵で電池を使わなくなる。 */
  var 動く箱 = Array.prototype.slice.call(document.querySelectorAll("[data-anim]"));
  if (動く箱.length) {
    if (動きを減らす || !("IntersectionObserver" in window)) {
      動く箱.forEach(function (el) { el.setAttribute("data-anim", "off"); });
    } else {
      動く箱.forEach(function (el) { el.setAttribute("data-anim", "off"); });
      var 見張り2 = new IntersectionObserver(function (ら) {
        ら.forEach(function (x) {
          x.target.setAttribute("data-anim", x.isIntersecting ? "on" : "off");
        });
      }, { threshold: 0.35 });
      動く箱.forEach(function (el) { 見張り2.observe(el); });
    }
  }

  /* ── URL をコピーする（記事の共有）─────────────────────────────
     ★ 押したのに何も起きないのがいちばん困るので、**押したことを出す**。 */
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (!b) return;
    var url = b.getAttribute("data-copy");
    var 元 = b.textContent;
    var 伝える = function (文) {
      b.textContent = 文;
      window.setTimeout(function () { b.textContent = 元; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { 伝える("コピーしました"); })
        .catch(function () { 伝える("コピーできませんでした"); });
    } else {
      伝える("コピーできませんでした");
    }
  });

  /* ── 現在地をナビに出す ────────────────────────────────────────── */
  var いま = location.pathname.replace(/\/+$/, "") || "/site";
  Array.prototype.forEach.call(document.querySelectorAll("[data-path]"), function (a) {
    if (a.getAttribute("data-path") === いま) a.setAttribute("aria-current", "page");
  });
})();
