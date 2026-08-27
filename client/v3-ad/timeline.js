/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — タイムラインエンジン＋再生コントロール（実装 B）
   契約: DESIGN.md §3（VQAD.createTimeline）

   ・rAF 駆動。dt は「実測」と 1/12 秒の小さい方。performance.now ベース
   ・seek 時も onTick(t, 0) を 1 回呼んで絵を更新する（静止スクショ用）
   ・タブ非表示で自動 pause（record モード中は pause しない）
   ・t が duration に達したら onEnd() を呼び、最後のフレームで停止
   ・html.vqad-record が付いていたらコントロール UI は一切作らない
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;

  V.createTimeline = function (opts) {
    var duration = opts.duration;
    var onTick = opts.onTick || function () {};
    var onEnd = opts.onEnd || function () {};
    var SCENES = V.config.SCENES;
    var isRecord = document.documentElement.classList.contains("vqad-record");

    /* ── 再生状態 ─────────────────────────────────────────────────
       すべてここから導出する。UI は状態の写像であって状態を持たない。 */
    var t = 0;             // 広告内時刻（秒）
    var playing = false;
    var ended = false;     // duration に到達済みか
    var rafId = 0;
    var lastNow = 0;       // performance.now の前回値
    var lastWakeAt = 0;    // 最後にユーザーが動いた時刻（自動フェード用）
    var devOpen = false;   // 開発ナビの表示状態
    var dragging = false;
    var wasPlayingBeforeDrag = false;
    var ui = null;         // record モード時は null のまま

    /* render のキャッシュ（テキスト更新は 0.1 秒粒度に間引く） */
    var lastTenth = -1;
    var lastTimeStr = "";
    var lastSceneIdx = -1;

    var self = {
      play: play, pause: pause, toggle: toggle, replay: replay,
      seek: seek, skipToScene: skipToScene,
      t: 0, playing: false
    };

    /* 公開プロパティ（t / playing）を内部状態に同期する */
    function sync() { self.t = t; self.playing = playing; }

    /* ── 小物 ───────────────────────────────────────────────────── */

    /* 秒 → "mm:ss" */
    function fmt(sec) {
      sec = Math.max(0, sec);
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
    }

    /* 時刻が属するシーンの添字（終端は最終シーン扱い） */
    function sceneIndexAt(time) {
      for (var i = SCENES.length - 1; i >= 0; i--) {
        if (time >= SCENES[i].start) return i;
      }
      return 0;
    }

    function stopRaf() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    /* ── エンジン ────────────────────────────────────────────────── */

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      var dt = (now - lastNow) / 1000;
      lastNow = now;
      if (dt < 0) dt = 0;
      if (dt > 1 / 12) dt = 1 / 12;   // タブ復帰などの巨大 dt を封じる
      t += dt;
      if (t >= duration) { finish(dt); return; }
      sync();
      onTick(t, dt);
      /* 再生中、3 秒マウスが動かなければコントロールをフェードアウト */
      if (ui && now - lastWakeAt > 3000) ui.root.classList.add("vqad-tl-idle");
      render();
    }

    /* 終端処理。t は duration に固定し、最後のフレームを描いて停止する */
    function finish(dt) {
      t = duration;
      stopRaf();
      playing = false;
      ended = true;
      sync();
      onTick(t, dt);
      uiFinish();
      onEnd();
      render();
    }

    function play() {
      if (playing) return;
      if (t >= duration) { replay(); return; }   // 終端からの再生は最初から
      playing = true;
      ended = false;
      sync();
      lastNow = performance.now();
      lastWakeAt = lastNow;
      stopRaf();
      rafId = requestAnimationFrame(frame);
      uiPlayState();
    }

    function pause() {
      if (!playing) return;
      playing = false;
      sync();
      stopRaf();
      uiPlayState();
    }

    function toggle() { if (playing) pause(); else play(); }

    function replay() {
      uiUnfinish();
      seek(0);
      play();
    }

    /* 任意時刻へ。静止中でも 1 フレーム描く（onTick(t, 0)） */
    function seek(nt) {
      nt = +nt;
      if (!isFinite(nt)) nt = 0;
      if (nt < 0) nt = 0;
      if (nt > duration) nt = duration;
      t = nt;
      var wasEnded = ended;
      if (t >= duration) {
        /* 端まで飛んだら終了扱い。絵は最終フレームで止める */
        if (playing) { playing = false; stopRaf(); }
        ended = true;
        sync();
        onTick(t, 0);
        uiFinish();
        if (!wasEnded) onEnd();
      } else {
        ended = false;
        sync();
        onTick(t, 0);
        uiUnfinish();
      }
      render();
    }

    function skipToScene(idx) {
      idx = idx | 0;
      if (idx < 0) idx = 0;
      if (idx > SCENES.length - 1) idx = SCENES.length - 1;
      seek(SCENES[idx].start);
    }

    /* 次のシーン頭へ。最終シーンなら終端へ */
    function skipNext() {
      var i = sceneIndexAt(t);
      if (i < SCENES.length - 1) skipToScene(i + 1);
      else seek(duration);
    }

    /* ── コントロール UI ─────────────────────────────────────────── */

    function buildUi() {
      var host = document.getElementById("vqad-controls");
      if (!host) return;

      /* リプレイ（回転矢印）。絵文字ではなく SVG パスで描く */
      var icReplay =
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"' +
        ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 4v6h-6"/>' +
        '<path d="M20.5 15a8.5 8.5 0 1 1-2-8.9L21 10"/>' +
        '</svg>';

      /* シーン境界の目盛り（先頭 0 秒は除く） */
      var ticks = "";
      var i;
      for (i = 1; i < SCENES.length; i++) {
        ticks += '<span class="vqad-tl-tick" style="left:' +
          (SCENES[i].start / duration * 100).toFixed(3) + '%"></span>';
      }

      /* 開発ナビのシーンボタン */
      var devBtns = "";
      for (i = 0; i < SCENES.length; i++) {
        devBtns += '<button type="button" class="vqad-dev-btn" data-idx="' + i + '">' +
          (i + 1) + " · " + SCENES[i].title + "</button>";
      }

      host.innerHTML =
        '<div class="vqad-tl-wrap">' +
          '<div class="vqad-tl-bar">' +
            '<button type="button" class="vqad-tl-btn vqad-tl-play" aria-label="再生">' +
              '<svg class="vqad-tl-ic-play" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></svg>' +
              '<svg class="vqad-tl-ic-pause" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M7.4 5h3.3v14H7.4zM13.3 5h3.3v14h-3.3z" fill="currentColor"/></svg>' +
            '</button>' +
            '<button type="button" class="vqad-tl-btn vqad-tl-replay" aria-label="最初から再生">' +
              icReplay +
            '</button>' +
            '<button type="button" class="vqad-tl-btn vqad-tl-skip" aria-label="次のシーンへ">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M6 5.4v13.2l9-6.6z" fill="currentColor"/>' +
                '<rect x="16.6" y="5.4" width="2.4" height="13.2" rx="1.2" fill="currentColor"/></svg>' +
            '</button>' +
            '<div class="vqad-tl-track" role="slider" tabindex="0" aria-label="再生位置"' +
              ' aria-valuemin="0" aria-valuemax="' + duration + '" aria-valuenow="0"' +
              ' aria-valuetext="00:00 / ' + fmt(duration) + '">' +
              '<div class="vqad-tl-rail">' +
                '<div class="vqad-tl-fill"></div>' +
                ticks +
                '<div class="vqad-tl-thumb"></div>' +
              '</div>' +
            '</div>' +
            '<div class="vqad-tl-meta">' +
              '<span class="vqad-tl-scene"></span>' +
              '<span class="vqad-tl-time"></span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="vqad-tl-again">' +
            icReplay + "<span>もう一度見る</span>" +
          '</button>' +
        '</div>' +
        '<div class="vqad-dev-nav" aria-label="開発用シーンナビ">' +
          devBtns +
          '<div class="vqad-dev-time">t = 0.0 s</div>' +
        '</div>';

      ui = {
        root: host,
        wrap: host.querySelector(".vqad-tl-wrap"),
        playBtn: host.querySelector(".vqad-tl-play"),
        replayBtn: host.querySelector(".vqad-tl-replay"),
        skipBtn: host.querySelector(".vqad-tl-skip"),
        track: host.querySelector(".vqad-tl-track"),
        rail: host.querySelector(".vqad-tl-rail"),
        fill: host.querySelector(".vqad-tl-fill"),
        thumb: host.querySelector(".vqad-tl-thumb"),
        scene: host.querySelector(".vqad-tl-scene"),
        time: host.querySelector(".vqad-tl-time"),
        again: host.querySelector(".vqad-tl-again"),
        dev: host.querySelector(".vqad-dev-nav"),
        devTime: host.querySelector(".vqad-dev-time"),
        devBtns: host.querySelectorAll(".vqad-dev-btn")
      };

      /* ボタン。クリック後は blur して Space の二重発火を防ぐ */
      ui.playBtn.addEventListener("click", function () { toggle(); this.blur(); });
      ui.replayBtn.addEventListener("click", function () { replay(); this.blur(); });
      ui.skipBtn.addEventListener("click", function () { skipNext(); this.blur(); });
      ui.again.addEventListener("click", function () { replay(); });
      for (i = 0; i < ui.devBtns.length; i++) {
        (function (btn) {
          btn.addEventListener("click", function () {
            skipToScene(parseInt(btn.getAttribute("data-idx"), 10));
            btn.blur();
          });
        })(ui.devBtns[i]);
      }

      /* 進捗バー: クリックとドラッグで seek。ドラッグ中は一時停止して
         指を離したら元の再生状態へ戻す */
      function seekFromPointer(e) {
        var rect = ui.rail.getBoundingClientRect();
        var frac = V.clamp01((e.clientX - rect.left) / Math.max(1, rect.width));
        seek(frac * duration);
      }
      ui.track.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        dragging = true;
        wasPlayingBeforeDrag = playing;
        if (playing) pause();
        ui.track.classList.add("is-dragging");
        if (ui.track.setPointerCapture) ui.track.setPointerCapture(e.pointerId);
        seekFromPointer(e);
      });
      ui.track.addEventListener("pointermove", function (e) {
        if (dragging) seekFromPointer(e);
      });
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        ui.track.classList.remove("is-dragging");
        if (wasPlayingBeforeDrag && t < duration) play();
      }
      ui.track.addEventListener("pointerup", endDrag);
      ui.track.addEventListener("pointercancel", endDrag);
    }

    /* 再生/停止のアイコンとラベル */
    function uiPlayState() {
      if (!ui) return;
      ui.wrap.classList.toggle("is-playing", playing);
      ui.playBtn.setAttribute("aria-label", playing ? "一時停止" : "再生");
      if (!playing) ui.root.classList.remove("vqad-tl-idle");
    }

    /* 終了状態: バーを沈めて「もう一度見る」ピルを出す */
    function uiFinish() {
      if (!ui) return;
      ui.wrap.classList.add("is-ended");
      ui.again.classList.add("is-on");
      ui.root.classList.remove("vqad-tl-idle");
      uiPlayState();
    }
    function uiUnfinish() {
      if (!ui) return;
      ui.wrap.classList.remove("is-ended");
      ui.again.classList.remove("is-on");
    }

    /* 状態 → UI（毎フレーム）。フィルは連続、テキストは 0.1 秒粒度 */
    function render() {
      if (!ui) return;
      var frac = duration > 0 ? t / duration : 0;
      ui.fill.style.clipPath = "inset(0 " + ((1 - frac) * 100).toFixed(2) + "% 0 0)";
      ui.thumb.style.left = (frac * 100).toFixed(2) + "%";
      var tenth = Math.round(t * 10);
      if (tenth === lastTenth) return;
      lastTenth = tenth;
      var str = fmt(t) + " / " + fmt(duration);
      if (str !== lastTimeStr) {
        lastTimeStr = str;
        ui.time.textContent = str;
        ui.track.setAttribute("aria-valuenow", String(Math.round(t)));
        ui.track.setAttribute("aria-valuetext", str);
      }
      var si = sceneIndexAt(t);
      if (si !== lastSceneIdx) {
        lastSceneIdx = si;
        ui.scene.textContent = SCENES[si].title;
        for (var i = 0; i < ui.devBtns.length; i++) {
          ui.devBtns[i].classList.toggle("is-cur", i === si);
        }
      }
      if (devOpen) ui.devTime.textContent = "t = " + (tenth / 10).toFixed(1) + " s";
    }

    /* 開発ナビ（D キー）。既定は非表示 */
    function toggleDev() {
      if (!ui) return;
      devOpen = !devOpen;
      ui.dev.classList.toggle("is-open", devOpen);
      if (devOpen) ui.devTime.textContent = "t = " + (Math.round(t * 10) / 10).toFixed(1) + " s";
    }

    /* コントロールを目覚めさせる（自動フェードの解除） */
    function wake() {
      lastWakeAt = performance.now();
      if (ui) ui.root.classList.remove("vqad-tl-idle");
    }

    /* ── グローバルイベント（record 中は付けない） ───────────────── */

    function bindGlobalEvents() {
      /* キー操作: Space / ←→ / R / 1〜7 / D */
      document.addEventListener("keydown", function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;   // Cmd+R 等は素通し
        /* 開始オーバーレイが出ている間は main.js の begin に任せる */
        var startEl = document.getElementById("vqad-start");
        if (startEl && !startEl.classList.contains("is-hidden")) return;
        /* ボタンにフォーカスがある時の Space / Enter はボタンに任せる */
        var tgt = e.target;
        if (tgt && tgt.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
        wake();
        switch (e.key) {
          case " ":          e.preventDefault(); toggle(); break;
          case "ArrowLeft":  e.preventDefault(); seek(t - 5); break;
          case "ArrowRight": e.preventDefault(); seek(t + 5); break;
          case "r": case "R": replay(); break;
          case "d": case "D": toggleDev(); break;
          default:
            if (e.key >= "1" && e.key <= "7") skipToScene(e.key.charCodeAt(0) - 49);
        }
      });

      /* マウス（タッチ）操作でコントロールを起こす */
      document.addEventListener("mousemove", wake);
      document.addEventListener("pointerdown", wake);
    }

    /* タブ非表示で自動 pause。record モード中は止めない */
    if (!isRecord) {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden && playing) pause();
      });
      buildUi();
      bindGlobalEvents();
    }

    /* 初期描画（record では ui が無いので何もしない） */
    render();
    uiPlayState();
    sync();
    return self;
  };
})();
