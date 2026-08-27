/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz 公式サイト — ヒーローのカルーセル（段B・2026-08-18）

   ★ 決めごと
     ・自動送りは **デスクトップだけ**。7 秒。
       モバイルで動かすと、見ていない間も電池と通信を使う。
     ・一時停止は **必須**（読む速さは人によって違う）。
     ・切り替えは fade のみ。横スライドは使わない。
     ・動きを減らす設定の人には自動送りをしない。
     ・キーボード: ← → で切り替え、Space で一時停止。
   ★ 4 枚目は「最新のお知らせ」。**中身はサーバから読む**（決め打ちしない）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var 台 = document.getElementById("heroStage");
  if (!台) return;

  var 札ら = Array.prototype.slice.call(台.querySelectorAll(".hero__slide"));
  var 点ら = Array.prototype.slice.call(document.querySelectorAll(".hero__dot"));
  var 停止ボタン = document.getElementById("heroPause");
  var 読み上げ = document.getElementById("heroLive");
  var 枠 = document.getElementById("hero");

  var 動きを減らす = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var 広い画面 = window.matchMedia ? window.matchMedia("(min-width: 900px)") : { matches: true };

  var いま = 0;
  var 時計 = null;
  var 手で止めた = false;
  var 送る間隔 = 7000;

  function 自動でよいか() {
    /* ★ モバイルでは自動送りをしない（指示書 段B）。
       動きを減らす設定の人にもしない。手で止めていたらしない。 */
    return !動きを減らす && 広い画面.matches && !手で止めた && !document.hidden;
  }

  function 出す(n, 声に出すか) {
    if (!札ら.length) return;
    いま = ((n % 札ら.length) + 札ら.length) % 札ら.length;
    札ら.forEach(function (el, i) {
      var 選ばれた = i === いま;
      el.setAttribute("data-active", 選ばれた ? "true" : "false");
      /* ★ 見えていない札は **読み上げにも触れさせない**。
         見えないものが Tab で拾えるのがいちばん困る。 */
      if (選ばれた) el.removeAttribute("inert"); else el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", 選ばれた ? "false" : "true");
    });
    点ら.forEach(function (b, i) {
      b.setAttribute("aria-selected", i === いま ? "true" : "false");
    });
    if (声に出すか && 読み上げ) {
      var t = 札ら[いま].getAttribute("data-title") || "";
      読み上げ.textContent = (いま + 1) + " / " + 札ら.length + "：" + t;
    }
  }

  function 回す() {
    止める();
    if (!自動でよいか()) return;
    時計 = window.setInterval(function () {
      if (!自動でよいか()) { 止める(); return; }
      出す(いま + 1, false);
    }, 送る間隔);
  }
  function 止める() { if (時計) { window.clearInterval(時計); 時計 = null; } }

  function 見た目を合わせる() {
    if (!停止ボタン) return;
    var 止まっている = !時計;
    停止ボタン.setAttribute("data-paused", 止まっている ? "true" : "false");
    停止ボタン.setAttribute("aria-label", 止まっている ? "自動送りを再開する" : "自動送りを止める");
    停止ボタン.setAttribute("aria-pressed", 止まっている ? "true" : "false");
  }

  function 切り替え() {
    手で止めた = !手で止めた;
    if (手で止めた) 止める(); else 回す();
    見た目を合わせる();
  }

  /* ── 点 ─────────────────────────────────────────────────────────── */
  点ら.forEach(function (b, i) {
    b.addEventListener("click", function () {
      出す(i, true);
      /* 人が選んだら、いまの周期を数え直す（すぐ next へ飛ばさない） */
      if (!手で止めた) 回す();
    });
  });

  if (停止ボタン) 停止ボタン.addEventListener("click", 切り替え);

  /* ── キーボード ─────────────────────────────────────────────────── */
  if (枠) {
    枠.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); 出す(いま + 1, true); if (!手で止めた) 回す(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); 出す(いま - 1, true); if (!手で止めた) 回す(); }
      else if (e.key === " " || e.key === "Spacebar") {
        /* ボタンやリンクの上での Space は、そちらの動きを邪魔しない */
        var t = e.target;
        if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
        e.preventDefault(); 切り替え();
      }
    });
  }

  /* ── 指でなぞる（モバイル）────────────────────────────────────────
     ★ 縦のスクロールを **奪わない**。横の動きが縦より大きいときだけ効かせる。 */
  var 始x = 0, 始y = 0, 見ている = false;
  台.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    始x = e.touches[0].clientX; 始y = e.touches[0].clientY; 見ている = true;
  }, { passive: true });
  台.addEventListener("touchend", function (e) {
    if (!見ている) return;
    見ている = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - 始x, dy = t.clientY - 始y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
    出す(いま + (dx < 0 ? 1 : -1), true);
  }, { passive: true });

  /* ── 見ていないときは回さない ──────────────────────────────────── */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) 止める(); else 回す();
    見た目を合わせる();
  });
  /* 触れている間は止める（読んでいる最中に飛ばさない） */
  ["mouseenter", "focusin"].forEach(function (n) {
    if (枠) 枠.addEventListener(n, function () { 止める(); 見た目を合わせる(); });
  });
  ["mouseleave", "focusout"].forEach(function (n) {
    if (枠) 枠.addEventListener(n, function () {
      if (枠.contains(document.activeElement)) return;
      回す(); 見た目を合わせる();
    });
  });
  var 追う = function () { 回す(); 見た目を合わせる(); };
  広い画面.addEventListener ? 広い画面.addEventListener("change", 追う) : 広い画面.addListener && 広い画面.addListener(追う);

  /* ── 4 枚目: 最新のお知らせ ───────────────────────────────────────
     ★ 中身が無いときは **札ごと出さない**。
       「お知らせはありません」の札を見せても仕方がない。 */
  var 報せ札 = document.getElementById("heroNews");
  function 報せを消す() {
    if (!報せ札) return;
    報せ札.parentNode.removeChild(報せ札);
    var 点 = document.querySelector('.hero__dot[data-index="3"]');
    if (点) 点.parentNode.removeChild(点);
    札ら = Array.prototype.slice.call(台.querySelectorAll(".hero__slide"));
    点ら = Array.prototype.slice.call(document.querySelectorAll(".hero__dot"));
    出す(0, false);
  }
  if (報せ札) {
    fetch("/api/site/news/latest?limit=1")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var x = j && j.items && j.items[0];
        if (!x) { 報せを消す(); return; }
        報せ札.querySelector("[data-news-category]").textContent =
          ({ release: "リリース", feature: "新機能", maintenance: "メンテナンス",
             incident: "障害" }[x.category] || "お知らせ");
        報せ札.querySelector("[data-news-title]").textContent = x.title;
        報せ札.querySelector("[data-news-summary]").textContent = x.summary || "";
        var a = 報せ札.querySelector("[data-news-link]");
        a.setAttribute("href", x.url);
        報せ札.setAttribute("data-title", x.title);
      })
      .catch(function () { 報せを消す(); });
  }

  /* ── 起動 ───────────────────────────────────────────────────────── */
  出す(0, false);
  回す();
  見た目を合わせる();
})();
