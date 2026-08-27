/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — 起動と統合（統合者が管理）

   役割:
   ・sceneDefs から <section> を生やし、build を 1 回ずつ呼ぶ
   ・タイムラインの tick で「クロスフェード・mood・surge・シーン update」を裁く
   ・URL パラメータ（?record / ?t / ?paused）と reduced motion
   ・マウスの微視差
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;
  var CFG = V.config;

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    var params = new URLSearchParams(location.search);
    var record = params.get("record") === "1";
    var startAt = parseFloat(params.get("t") || "0") || 0;
    var startPaused = params.get("paused") === "1";
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (record) document.documentElement.classList.add("vqad-record");
    if (reduced) document.documentElement.classList.add("vqad-rm");

    /* ── 背景 ── */
    var far = document.getElementById("vqad-far");
    var near = document.getElementById("vqad-near");
    var space = V.initSpace(far, near, { seed: 20260804 });
    V.space = space;
    space.setQuality(reduced || window.matchMedia("(max-width: 700px)").matches ? "low" : "high");
    window.addEventListener("resize", function () { space.resize(); });
    space.resize();

    /* ── シーン DOM ── */
    var stage = document.getElementById("vqad-stage");
    var defs = V.sceneDefs.slice().sort(function (a, b) { return a.order - b.order; });
    var scenes = CFG.SCENES.map(function (meta) {
      var def = null;
      for (var i = 0; i < defs.length; i++) if (defs[i].id === meta.id) def = defs[i];
      var el = document.createElement("section");
      el.className = "vqad-scene scene-" + meta.id;
      el.id = "vqad-" + meta.id;
      stage.appendChild(el);
      if (def && def.build) def.build(el);
      return { meta: meta, def: def, el: el };
    });

    /* ── フィルム層（粒子・周辺減光・色収差） ── */
    var film = V.initFilm ? V.initFilm(document.getElementById("vqad-film"), { seed: 20260804 }) : null;
    if (film) {
      film.setQuality(reduced || window.matchMedia("(max-width: 700px)").matches ? "low" : "high");
      window.addEventListener("resize", function () { film.resize(); });
      film.resize();
    }

    /* ── カメラ ──────────────────────────────────────────────
       全シーンを「中央・同スケール」で見せると、映像ではなくスライドに見える。
       シーンごとに寄り引きと原点を変えて画角に変化をつける。
       t 秒 → { x, y, z, ox, oy } を返し、#vqad-stage の transform に流す。 */
    var CAM = {
      /* z: 1 より大きいと寄り。ox/oy: 拡大の中心（%）。 */
      s1: { z0: 1.10, z1: 1.00, x0:  0,  x1:   0, y0:  16, y1: -10, ox: 50, oy: 46 },
      s2: { z0: 1.16, z1: 1.02, x0: 34,  x1: -22, y0:  10, y1:   4, ox: 44, oy: 44 },
      s3: { z0: 1.02, z1: 1.13, x0:-20,  x1:  14, y0:  -6, y1:  10, ox: 52, oy: 54 },
      s4: { z0: 1.18, z1: 1.03, x0:-16,  x1:  10, y0:   8, y1:  -6, ox: 48, oy: 48 },
      s5: { z0: 1.04, z1: 1.14, x0: 18,  x1: -14, y0:   6, y1:  -8, ox: 50, oy: 46 },
      s6: { z0: 1.14, z1: 1.02, x0:-24,  x1:  16, y0:  -8, y1:   6, ox: 46, oy: 50 },
      s7: { z0: 1.22, z1: 1.00, x0:  0,  x1:   0, y0:   0, y1:   0, ox: 50, oy: 44 }
    };
    var stageEl = stage;
    function applyCamera(t) {
      var cur = null, k = 0;
      for (var i = 0; i < CFG.SCENES.length; i++) {
        var m = CFG.SCENES[i];
        if (t >= m.start - 0.6 && t < m.end + 0.6) {
          cur = CAM[m.id];
          k = V.clamp01((t - m.start) / Math.max(0.001, m.end - m.start));
          break;
        }
      }
      if (!cur) return;
      /* 動きは最初と最後を緩める。等速だと機械に見える。 */
      var e = V.ease.inOut(k);
      var st = stageEl.style;
      st.setProperty("--cam-z", (cur.z0 + (cur.z1 - cur.z0) * e).toFixed(4));
      st.setProperty("--cam-x", (cur.x0 + (cur.x1 - cur.x0) * e).toFixed(2));
      st.setProperty("--cam-y", (cur.y0 + (cur.y1 - cur.y0) * e).toFixed(2));
      st.setProperty("--cam-ox", cur.ox + "%");
      st.setProperty("--cam-oy", cur.oy + "%");
    }

    /* ── タイムライン ── */
    var lastMood = "";
    var surged = {};
    var api = { space: space, t: 0 };

    var tl = V.createTimeline({
      duration: CFG.DURATION,
      onTick: function (t, dt) {
        api.t = t;
        space.frame(dt, t);
        applyCamera(t);
        var fade = CFG.CROSSFADE;
        for (var i = 0; i < scenes.length; i++) {
          var s = scenes[i], m = s.meta;
          /* クロスフェード込みの可視区間 */
          var visible = t >= m.start - fade && t < m.end + fade * 0.5;
          s.el.classList.toggle("is-on", visible);
          if (!visible) { s.el.style.opacity = "0"; continue; }
          var inK = V.span(t, m.start - fade * 0.4, m.start + fade * 0.6);
          var outK = 1 - V.span(t, m.end - fade * 0.6, m.end + fade * 0.4);
          s.el.style.opacity = String(Math.min(V.ease.inOut(inK), V.ease.inOut(outK)));
          /* mood はシーンの本区間に入ってから */
          if (t >= m.start && t < m.end && lastMood !== m.mood) {
            lastMood = m.mood;
            /* dt=0 は seek 直後の描き直し。ブレンドせず即時反映する */
            space.setMood(m.mood, dt === 0);
          }
          /* 境界の少し前で光を走らせる（各境界 1 回。seek で戻ったら取り直す） */
          var edgeKey = m.id;
          if (t >= m.end - 0.7 && !surged[edgeKey]) { surged[edgeKey] = true; space.surge(0.9); }
          if (t < m.end - 2) surged[edgeKey] = false;
          if (s.def && s.def.update) s.def.update(t - m.start, m.end - m.start, api);
        }
        if (film) film.frame(dt, t);
      },
      onEnd: function () { /* 最後の絵で静止（余韻） */ }
    });
    V.timeline = tl;

    /* ── 微視差（マウス。録画・省モーション時は切る） ── */
    if (!record && !reduced) {
      document.addEventListener("mousemove", function (e) {
        var x = (e.clientX / window.innerWidth) * 2 - 1;
        var y = (e.clientY / window.innerHeight) * 2 - 1;
        space.setParallax(x * 0.6, y * 0.6);
      });
    }

    /* ── 開始 ── */
    var startEl = document.getElementById("vqad-start");
    function begin() {
      startEl.classList.add("is-hidden");
      if (startAt > 0) tl.seek(startAt);
      if (!startPaused) tl.play();
      else { tl.seek(startAt); tl.pause(); }
    }
    if (record) {
      /* 録画: すぐ始める（スクショ用は paused=1 で静止） */
      begin();
    } else {
      startEl.addEventListener("click", begin);
      startEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(); }
      });
    }
    /* paused 指定はコントロール無しでも 1 フレーム描く必要がある */
    if (startPaused) { tl.seek(startAt); }
  }
})();
