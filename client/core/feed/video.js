/* ══════════════════════════════════════════════════════════════════════
   core/feed/video.js — 動画の 再生バー（VQVID）

   ★ 訴え（2026-08-20）
     「動画の 再生バーとかは News の 表示でも Feed と 同じものを 使いたい」

   ★ なぜ 切り出すか
     もとは Feed の 中だけに あった。News でも 同じものを 出すには
     **書き写す**しか なかったが、書き写した ものは 必ず ずれる
     （片方だけ 直る／片方だけ 壊れる）。1 つに して 両方から 使う。

   ★ 使いかた（影の DOM でも 素の DOM でも 同じ）
       root.appendChild(style(VQVID.CSS))     … 見た目を 配る
       html += VQVID.html(url)                … 置く
       VQVID.結線(root)                       … 動かす（1 つの root に 1 回だけ）

   ★ 決めごと
     ・ブラウザ既定の 見た目は 使わない（端末ごとに ばらばらなので）
     ・再生してから 3 秒 触らなければ バーは そっと 引っ込む。
       止めている / 掴んでいる / キーボードで 辿っている 間は 出したまま
     ・つまみは VocabuQuiz の マーク。掴むと 大きくなり、再生中は ゆっくり 回る
     ・**影の 外で 指を 離しても 取り残されない**（document でも 拾う）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQVID = root.VQVID || (root.VQVID = {});

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON = {
    play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'
      + '<rect x="13" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/>'
      + '<path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M16 3v3a2 2 0 0 0 2 2h3"/>'
      + '<path d="M8 21v-3a2 2 0 0 0-2-2H3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'
  };
  function svg(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || "") + "</svg>";
  }
  /* 再生位置の つまみ。VocabuQuiz の マーク（3 本の リボンと V）を 小さくしたもの。 */
  function knobSvg() {
    return '<svg class="vid-k" viewBox="0 0 200 200" aria-hidden="true">'
      + '<circle cx="100" cy="100" r="96" fill="var(--vq-accent,#8175CC)"/>'
      + '<g fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity=".95">'
      + '<circle cx="100" cy="77" r="50"/><circle cx="80" cy="113" r="50"/><circle cx="120" cy="113" r="50"/>'
      + "</g>"
      + '<path d="M69 74 L100 141 L131 74" fill="none" stroke="#fff" stroke-width="26" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  var CSS = [
    ".vid{position:relative;margin-top:11px;border-radius:var(--vq-r-lg,calc(14px * var(--vq-r-scale,1)));overflow:hidden;",
      "border:1px solid var(--vq-border-subtle,#E7E4EF);background:#17161D;}",
    ".vid video{width:100%;max-height:520px;display:block;background:#17161D;}",
    ".vid-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;",
      "padding:10px 12px;background:linear-gradient(180deg,rgba(24,22,34,0),rgba(24,22,34,.82));",
      "opacity:1;transform:translateY(0);",
      "transition:opacity .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1);}",
    ".vid.is-idle .vid-bar{opacity:0;transform:translateY(10px);pointer-events:none;}",
    ".vid.is-idle{cursor:none;}",
    ".vid.is-paused .vid-bar,.vid.is-scrub .vid-bar,.vid:has(:focus-visible) .vid-bar{",
      "opacity:1 !important;transform:none !important;pointer-events:auto !important;}",
    "@media (prefers-reduced-motion:reduce){.vid-bar{transition:opacity .12s linear;}",
      ".vid.is-idle .vid-bar{transform:none;}}",
    ".vid-b{width:34px;height:34px;flex:none;border:0;cursor:pointer;border-radius:50%;",
      "background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;}",
    ".vid-b:hover{background:rgba(255,255,255,.28);}",
    ".vid-b svg{width:17px;height:17px;}",
    ".vid-t{flex:1;min-width:0;height:18px;cursor:pointer;position:relative;",
      "display:flex;align-items:center;touch-action:none;}",
    ".vid-t::before{content:\"\";position:absolute;left:0;right:0;height:4px;border-radius:99px;",
      "background:rgba(255,255,255,.24);}",
    ".vid-t i{position:absolute;left:0;height:4px;border-radius:99px;width:0;",
      "background:linear-gradient(90deg,var(--vq-border-focus,#B5ACE9),#fff);}",
    ".vid-k{position:absolute;left:0;translate:-50% 0;width:16px;height:16px;pointer-events:none;",
      "filter:drop-shadow(0 1px 4px rgba(0,0,0,.5));",
      "transition:width .16s cubic-bezier(.34,1.56,.64,1),height .16s cubic-bezier(.34,1.56,.64,1);}",
    ".vid-t:hover .vid-k,.vid.is-scrub .vid-k{width:26px;height:26px;}",
    ".vid-k g{transform-origin:50% 50%;}",
    ".vid:not(.is-paused) .vid-k g{animation:vqKnob 5.5s linear infinite;}",
    "@keyframes vqKnob{to{transform:rotate(360deg)}}",
    ".vid-tip{position:absolute;bottom:26px;translate:-50% 0;padding:3px 9px;border-radius:calc(8px * var(--vq-r-scale,1));",
      "background:rgba(24,22,34,.9);color:#fff;font-size:12px;font-variant-numeric:tabular-nums;",
      "white-space:nowrap;opacity:0;transition:opacity .14s ease;pointer-events:none;}",
    ".vid.is-scrub .vid-tip{opacity:1;}",
    ".vid-time{flex:none;color:#fff;font-size:12px;font-variant-numeric:tabular-nums;opacity:.9;}",
    ".vid-rate{flex:none;height:28px;min-width:44px;padding:0 9px;border:0;cursor:pointer;",
      "border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:12px;font-weight:700;",
      "font-variant-numeric:tabular-nums;}",
    ".vid-rate:hover{background:rgba(255,255,255,.28);}",
    ".vid:fullscreen{border:0;border-radius:0;display:grid;place-items:center;background:#000;}",
    ".vid:fullscreen video{max-height:100dvh;height:100dvh;object-fit:contain;}",
    ".vid:fullscreen .vid-bar{padding:18px 24px;}",
    /* 指で触る端末は、幅に関係なく 当たり判定を 厚くする */
    "@media (max-width:640px){",
      ".vid-bar{padding:10px;gap:7px;}",
      ".vid-b{width:34px;height:34px;}",
      ".vid-t{height:30px;}",
      ".vid-rate{height:32px;min-width:44px;padding:0 8px;}",
      ".vid-time{font-size:11px;}",
    "}",
    "@media (pointer:coarse){",
      ".vid-t{height:30px;}",
      ".vid-rate{height:32px;min-width:44px;}",
      ".vid-b{width:34px;height:34px;}",
    "}"
  ].join("");

  function html(u) {
    return '<div class="vid is-paused" data-vid>'
      + '<video src="' + esc(u) + '" preload="metadata" playsinline data-v></video>'
      + '<div class="vid-bar">'
      + '<button class="vid-b" data-a="v-play" aria-label="再生">' + svg("play") + "</button>"
      + '<span class="vid-t" data-a="v-seek" role="slider" aria-label="再生位置" tabindex="0"'
        + ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'
        + '<i data-vfill></i>' + knobSvg()
        + '<span class="vid-tip" data-vtip>0:00</span></span>'
      + '<span class="vid-time" data-vtime>0:00 / 0:00</span>'
      + '<button class="vid-rate" data-a="v-rate" aria-label="再生の速さ">1.0×</button>'
      + '<button class="vid-b" data-a="v-full" aria-label="拡大">' + svg("expand") + "</button>"
      + "</div></div>";
  }

  /* ── 動かす。1 つの root に 1 回だけ。 ───────────────────────── */
  var 済み = new WeakSet();
  function 結線(root2) {
    if (!root2 || 済み.has(root2)) return false;
    済み.add(root2);
    var doc = root2.ownerDocument || document;

    function fmt(t) {
      t = Math.max(0, Math.floor(Number(t) || 0));
      return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
    }
    function paint(v) {
      var box = v.closest("[data-vid]");
      if (!box) return;
      var fill = box.querySelector("[data-vfill]"), time = box.querySelector("[data-vtime]");
      var knob = box.querySelector(".vid-k"), tip = box.querySelector("[data-vtip]");
      var track = box.querySelector('[data-a="v-seek"]');
      var btn = box.querySelector('[data-a="v-play"]');
      var rate = box.querySelector('[data-a="v-rate"]');
      var full = box.querySelector('[data-a="v-full"]');
      var d = isFinite(v.duration) ? v.duration : 0;
      var pct = d ? (v.currentTime / d) * 100 : 0;
      if (fill) fill.style.width = pct + "%";
      if (knob) knob.style.left = pct + "%";
      if (tip) { tip.style.left = pct + "%"; tip.textContent = fmt(v.currentTime); }
      if (track) track.setAttribute("aria-valuenow", Math.round(pct));
      if (time) time.textContent = fmt(v.currentTime) + " / " + fmt(d);
      box.classList.toggle("is-paused", v.paused);
      if (btn) {
        btn.innerHTML = v.paused ? svg("play") : svg("pause");
        btn.setAttribute("aria-label", v.paused ? "再生" : "停止");
      }
      if (rate) rate.textContent = (Number(v.playbackRate) || 1).toFixed(1) + "×";
      if (full) {
        var on = doc.fullscreenElement === box;
        full.innerHTML = svg(on ? "shrink" : "expand");
        full.setAttribute("aria-label", on ? "拡大をやめる" : "拡大");
      }
    }

    /* ── 引っ込め ─────────────────────────────────────────── */
    var IDLE_MS = 3000;
    var timers = new WeakMap();
    function armIdle(box) {
      if (!box) return;
      var t = timers.get(box);
      if (t) clearTimeout(t);
      var v = box.querySelector("[data-v]");
      if (!v || v.paused) { box.classList.remove("is-idle"); return; }
      timers.set(box, setTimeout(function () {
        var vv = box.querySelector("[data-v]");
        if (!vv || vv.paused || box.classList.contains("is-scrub")) return;
        /* キーボードで 辿っている 最中だけは 隠さない。
           押したときも 焦点は 当たるので、焦点が あること だけでは 止めない。 */
        try {
          var af = box.getRootNode().activeElement;
          if (af && box.contains(af) && af.matches(":focus-visible")) return;
        } catch (x) {}
        box.classList.add("is-idle");
      }, IDLE_MS));
    }
    function wake(box, keep) {
      if (!box) return;
      box.classList.remove("is-idle");
      var t = timers.get(box);
      if (t) clearTimeout(t);
      if (!keep) armIdle(box);
    }

    ["timeupdate", "play", "pause", "loadedmetadata", "ended"].forEach(function (ev) {
      root2.addEventListener(ev, function (e) {
        if (!(e.target && e.target.matches && e.target.matches("[data-v]"))) return;
        paint(e.target);
        var box = e.target.closest("[data-vid]");
        if (ev === "play") armIdle(box);
        if (ev === "pause" || ev === "ended") wake(box, true);
      }, true);
    });

    /* ── 押したとき ───────────────────────────────────────── */
    root2.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      if (a === "v-play") {
        var box = el.closest("[data-vid]"), v = box && box.querySelector("[data-v]");
        if (v) { if (v.paused) v.play(); else v.pause(); }
        return;
      }
      if (a === "v-rate") {
        /* 押すたびに 次の 速さへ。よく使う 段だけ 回す。 */
        var rb = el.closest("[data-vid]"), rv = rb && rb.querySelector("[data-v]");
        if (!rv) return;
        var RATES = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
        var cur = Number(rv.playbackRate) || 1;
        var idx = RATES.findIndex(function (x) { return Math.abs(x - cur) < 0.01; });
        rv.playbackRate = RATES[(idx + 1) % RATES.length];
        var lbl = rb.querySelector('[data-a="v-rate"]');
        if (lbl) lbl.textContent = rv.playbackRate.toFixed(1) + "×";
        return;
      }
      if (a === "v-full") {
        var fb = el.closest("[data-vid]");
        if (!fb) return;
        if (doc.fullscreenElement === fb) {
          if (doc.exitFullscreen) doc.exitFullscreen();
        } else if (fb.requestFullscreen) {
          fb.requestFullscreen().catch(function () {});
        } else if (fb.webkitRequestFullscreen) {
          fb.webkitRequestFullscreen();
        }
      }
    });

    /* ── 触ったら バーを 戻す ─────────────────────────────── */
    ["pointermove", "pointerdown"].forEach(function (ev) {
      root2.addEventListener(ev, function (e) {
        var box = e.target && e.target.closest ? e.target.closest("[data-vid]") : null;
        if (box) wake(box);
      }, true);
    });
    root2.addEventListener("pointerleave", function (e) {
      var box = e.target && e.target.closest ? e.target.closest("[data-vid]") : null;
      if (box) armIdle(box);
    }, true);

    /* ── 掴んで 動かす ────────────────────────────────────── */
    var scrub = null;
    function seekTo(t, clientX) {
      var box = t.closest("[data-vid]"), v = box && box.querySelector("[data-v]");
      if (!v || !isFinite(v.duration) || !v.duration) return null;
      var r = t.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * v.duration;
      paint(v);
      return { box: box, v: v, t: t };
    }
    root2.addEventListener("pointerdown", function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-a="v-seek"]') : null;
      if (!t) return;
      e.preventDefault();
      var r = seekTo(t, e.clientX);
      if (!r) return;
      scrub = r;
      r.box.classList.add("is-scrub");
      try { t.setPointerCapture(e.pointerId); } catch (x) {}
    });
    root2.addEventListener("pointermove", function (e) {
      if (!scrub) return;
      seekTo(scrub.t, e.clientX);
    });
    function endScrub() {
      if (!scrub) return;
      scrub.box.classList.remove("is-scrub");
      scrub = null;
    }
    root2.addEventListener("pointerup", endScrub);
    root2.addEventListener("pointercancel", endScrub);
    /* ★ 影の 外で 指を 離しても 取り残されない。 */
    doc.addEventListener("pointerup", endScrub);

    /* ── 全画面の 出入り ──────────────────────────────────
       すでに 再生中のまま 全画面へ 入ると play が 飛ばないので、
       ここで 数え直さないと 全画面の あいだ 一度も 隠れない。 */
    doc.addEventListener("fullscreenchange", function () {
      var vs = root2.querySelectorAll ? root2.querySelectorAll("[data-v]") : [];
      for (var i = 0; i < vs.length; i++) {
        paint(vs[i]);
        var bx = vs[i].closest("[data-vid]");
        if (bx) { bx.classList.remove("is-idle"); armIdle(bx); }
      }
    });

    /* ── キーボード ───────────────────────────────────────
       再生位置の バーに 焦点が あるとき: 左右で 5 秒、上下で 10 秒。
       Enter / 空白で 再生と 停止。 */
    root2.addEventListener("keydown", function (e) {
      var tk = e.target && e.target.closest ? e.target.closest('[data-a="v-seek"]') : null;
      if (!tk) return;
      var kb = tk.closest("[data-vid]"), kv = kb && kb.querySelector("[data-v]");
      if (!kv) return;
      var step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -10, ArrowUp: 10 }[e.key];
      if (step) {
        e.preventDefault();
        kv.currentTime = Math.max(0, Math.min(kv.duration || 0, kv.currentTime + step));
        paint(kv);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (kv.paused) kv.play(); else kv.pause();
      }
    });
    return true;
  }

  VQVID.CSS = CSS;
  VQVID.html = html;
  VQVID.結線 = 結線;
  VQVID.印 = svg;
  VQVID.つまみ = knobSvg;
})(typeof globalThis !== "undefined" ? globalThis : this);
