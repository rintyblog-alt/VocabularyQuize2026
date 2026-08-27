/* ══════════════════════════════════════════════════════════════════════
   core/board/runtime.js — AR App の 中で 使える 土台（window.VQ）

   ★ 訴え（2026-08-19）「さらに 高度なアプリを 作れるように。今のじゃ まだまだ。
     まじで すごいものを **一発で** 作れるように」。

   ★ 一発で すごいものが 出ない いちばんの理由は「決まりきった書き物」。
     canvas を 用意して、DPR を 合わせて、輪を 回して、キーを 拾って、
     音を 鳴らして、点を 出して……ここまでで 100 行 使い切ってしまい、
     **中身に たどりつく前に 力尽きる**。しかも 毎回 どこかを 間違える。
   ★ だから **そこを ぜんぶ こちらが 持つ**。書くのは 中身だけにする。

   ★ この文字列は 各アプリの 中（iframe）へ そのまま 差し込まれる。
     外（本体）とは postMessage でしか つながらない。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.VQ) return;

  /* ── 外（本体）との やりとり ───────────────────────────────────── */
  var 待ち = {}, 番 = 0;
  function 送る(kind, o) {
    try { W.parent.postMessage(Object.assign({ __vqapp: 1, kind: kind }, o || {}), "*"); }
    catch (e) {}
  }
  function 頼む(kind, o, ms) {
    return new Promise(function (done) {
      var id = "r" + (++番);
      var t = setTimeout(function () { if (待ち[id]) { delete 待ち[id]; done(null); } }, ms || 4000);
      待ち[id] = function (v) { clearTimeout(t); done(v); };
      送る(kind, Object.assign({ rid: id }, o || {}));
    });
  }
  W.addEventListener("message", function (e) {
    var d = e && e.data;
    if (!d || d.__vqapp !== 2) return;
    if (d.rid && 待ち[d.rid]) { var f = 待ち[d.rid]; delete 待ち[d.rid]; f(d.value); }
    if (d.kind === "resize") { VQ._fit(); }
  });

  /* ── 色（本体と そろえる）────────────────────────────────────── */
  var 色 = {
    地: "#FCFBFE", 面: "#FFFFFF", 線: "#E7E4EF",
    字: "#2B2836", 薄字: "#7A7589", 主: "#756DB3", 主薄: "#EAE8F7",
    good: "#3E7A56", bad: "#A94A4A", warn: "#B0791F",
    彩: ["#756DB3", "#5B9BD5", "#E08A5F", "#5FA97B", "#C96B8E", "#D6A93B", "#6FA8B5", "#9B7BC9"]
  };

  /* ── 小道具 ──────────────────────────────────────────────────── */
  function rnd(a, b) {
    if (a === undefined) return Math.random();
    if (b === undefined) return Math.random() * a;
    return a + Math.random() * (b - a);
  }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : undefined; }
  function shuffle(a) {
    var b = (a || []).slice();
    for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function 円あたり(a, b) { return dist(a.x, a.y, b.x, b.y) < (a.r || 0) + (b.r || 0); }

  /* ── 置き場 ──────────────────────────────────────────────────── */
  function 根() {
    var r = D.getElementById("vqapp");
    if (!r) { r = D.createElement("div"); r.id = "vqapp"; D.body.appendChild(r); }
    return r;
  }

  /* ── 絵を描く板（DPR も 大きさ合わせも こちらが やる）───────────── */
  var _stage = null;
  function stage(o) {
    o = o || {};
    var 親 = o.親 || 根();
    var box = D.createElement("div");
    box.className = "vq-stage";
    var cv = D.createElement("canvas");
    box.appendChild(cv);
    親.appendChild(box);
    var s = {
      box: box, cv: cv, ctx: cv.getContext("2d"),
      w: Number(o.w) || 0, h: Number(o.h) || 0,
      比: Number(o.比) || (o.w && o.h ? o.w / o.h : 0),
      固定: !!(o.w && o.h && o.固定 !== false)
    };
    _stage = s;
    合わせる();
    W.addEventListener("resize", 合わせる);
    はめる(cv);
    return s;

    function 合わせる() {
      var 幅 = Math.max(120, box.clientWidth || 親.clientWidth || 320);
      var 高;
      if (s.固定) {
        /* 決められた大きさ。はみ出さないように 縮めて 収める。 */
        var k = Math.min(1, 幅 / s.w);
        高 = s.h * k;
        cv.style.width = Math.round(s.w * k) + "px";
        cv.style.height = Math.round(高) + "px";
        描く画素(s.w, s.h);
        return;
      }
      高 = s.比 ? 幅 / s.比 : Math.min(Math.max(200, W.innerHeight - 140), 520);
      s.w = Math.round(幅); s.h = Math.round(高);
      cv.style.width = "100%"; cv.style.height = Math.round(高) + "px";
      描く画素(s.w, s.h);
    }
    function 描く画素(w, h) {
      var dpr = Math.min(2, W.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /* ── 動かす（毎こま 呼ぶ）──────────────────────────────────────── */
  var _raf = 0, _fn = null, _前 = 0, _止 = false;
  function loop(fn) {
    _fn = fn; _前 = 0; _止 = false;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(こま);
    return { stop: stop, resume: function () { _止 = false; }, pause: function () { _止 = true; } };
  }
  function こま(t) {
    _raf = requestAnimationFrame(こま);
    if (!_fn || _止) { _前 = t; return; }
    var dt = _前 ? Math.min(0.05, (t - _前) / 1000) : 0.016;
    _前 = t;
    /* ★ ここで 落ちても **輪は 止めない**（1 こま 飛ぶだけ）。
       止めると 画面が 固まり、何が起きたか 分からなくなる。 */
    try { _fn(dt, t / 1000); }
    catch (e) { 止める理由(e); }
  }
  var _落ち回数 = 0;
  function 止める理由(e) {
    _落ち回数++;
    if (_落ち回数 > 60) { stop(); }
    if (_落ち回数 === 1 || _落ち回数 === 60) {
      try { W.parent.postMessage({ __vqapp: 1, kind: "error",
        message: "毎こまの中で 止まりました: " + ((e && e.message) || e) }, "*"); } catch (x) {}
    }
  }
  function stop() { if (_raf) cancelAnimationFrame(_raf); _raf = 0; _fn = null; }

  /* ── キーと 指 ────────────────────────────────────────────────── */
  var keys = {}, _keyfn = {};
  W.addEventListener("keydown", function (e) {
    keys[e.key] = true; keys[e.code] = true;
    if (/^(Arrow|Space| )/.test(e.key)) { try { e.preventDefault(); } catch (x) {} }
    var f = _keyfn[e.key] || _keyfn[e.code]; if (f) { try { f(e); } catch (x) {} }
  });
  W.addEventListener("keyup", function (e) { keys[e.key] = false; keys[e.code] = false; });
  W.addEventListener("blur", function () { keys = {}; });
  function key(k) { return !!keys[k]; }
  function onKey(k, fn) { _keyfn[k] = fn; }
  /* よく使う 4 方向を まとめて（矢印でも WASD でも 同じに 効く） */
  function 十字() {
    return {
      x: (key("ArrowRight") || key("KeyD") ? 1 : 0) - (key("ArrowLeft") || key("KeyA") ? 1 : 0),
      y: (key("ArrowDown") || key("KeyS") ? 1 : 0) - (key("ArrowUp") || key("KeyW") ? 1 : 0)
    };
  }

  var pointer = { x: 0, y: 0, down: false, dx: 0, dy: 0 };
  var _tap = [], _drag = [];
  function はめる(el) {
    var 前x = 0, 前y = 0;
    var 場所 = function (e) {
      var r = el.getBoundingClientRect();
      var p = e.touches && e.touches[0] ? e.touches[0] : e;
      var sx = (_stage && _stage.w ? _stage.w : r.width) / (r.width || 1);
      var sy = (_stage && _stage.h ? _stage.h : r.height) / (r.height || 1);
      pointer.x = (p.clientX - r.left) * sx;
      pointer.y = (p.clientY - r.top) * sy;
    };
    var 下 = function (e) {
      場所(e); pointer.down = true; 前x = pointer.x; 前y = pointer.y;
      _tap.forEach(function (f) { try { f(pointer.x, pointer.y); } catch (x) {} });
      try { e.preventDefault(); } catch (x) {}
    };
    var 動 = function (e) {
      場所(e); pointer.dx = pointer.x - 前x; pointer.dy = pointer.y - 前y;
      前x = pointer.x; 前y = pointer.y;
      if (pointer.down) _drag.forEach(function (f) { try { f(pointer.x, pointer.y, pointer.dx, pointer.dy); } catch (x) {} });
    };
    var 上 = function () { pointer.down = false; };
    el.addEventListener("mousedown", 下); el.addEventListener("touchstart", 下, { passive: false });
    el.addEventListener("mousemove", 動); el.addEventListener("touchmove", 動, { passive: false });
    W.addEventListener("mouseup", 上); W.addEventListener("touchend", 上);
  }
  function onTap(fn) { _tap.push(fn); }
  function onDrag(fn) { _drag.push(fn); }

  /* ── 音（外の道具は 要らない）──────────────────────────────────── */
  var _ac = null;
  function ac() {
    if (!_ac) { try { _ac = new (W.AudioContext || W.webkitAudioContext)(); } catch (e) { _ac = null; } }
    if (_ac && _ac.state === "suspended") { try { _ac.resume(); } catch (e) {} }
    return _ac;
  }
  var 音名 = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function 高さ(n) {
    if (typeof n === "number") return n;
    var m = String(n).match(/^([A-G])(#|b)?(-?\d)?$/);
    if (!m) return 440;
    var k = 音名[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    var o = m[3] === undefined ? 4 : Number(m[3]);
    return 440 * Math.pow(2, (k - 9) / 12 + (o - 4));
  }
  function beep(f, ms, o) {
    o = o || {};
    var c = ac(); if (!c) return;
    var os = c.createOscillator(), g = c.createGain();
    os.type = o.type || "sine";
    os.frequency.value = 高さ(f === undefined ? 660 : f);
    var v = o.音量 === undefined ? 0.14 : o.音量;
    var t0 = c.currentTime + (o.遅れ || 0), t1 = t0 + (ms || 120) / 1000;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    os.connect(g); g.connect(c.destination);
    os.start(t0); os.stop(t1 + 0.02);
  }
  function 並べて(列, 間) {
    (列 || []).forEach(function (x, i) {
      beep(x, (間 || 120) * 0.9, { 遅れ: (間 || 120) * i / 1000 });
    });
  }
  var sound = {
    beep: beep, note: beep, seq: 並べて,
    click: function () { beep(880, 40, { type: "square", 音量: 0.06 }); },
    good: function () { 並べて(["E5", "G5", "C6"], 90); },
    bad: function () { beep(180, 260, { type: "sawtooth", 音量: 0.1 }); },
    win: function () { 並べて(["C5", "E5", "G5", "C6", "G5", "C6"], 110); },
    lose: function () { 並べて(["G4", "E4", "C4"], 160); },
    tick: function () { beep(1200, 25, { type: "square", 音量: 0.04 }); }
  };
  function speak(t, o) {
    o = o || {};
    try {
      var u = new W.SpeechSynthesisUtterance(String(t));
      u.lang = o.lang || "ja-JP"; u.rate = o.rate || 1;
      W.speechSynthesis.cancel(); W.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ── 覚えておく（外の 保存へ 預ける。iframe 単体では 持てない）──── */
  var store = {
    get: function (k, 既定) {
      return 頼む("store.get", { key: String(k) }).then(function (v) {
        return v === null || v === undefined ? 既定 : v;
      });
    },
    set: function (k, v) { 送る("store.set", { key: String(k), value: v }); return true; }
  };

  /* ── 本体の 問題を 借りる（教材として いちばん 効く）─────────────── */
  var quiz = {
    get: function (o) {
      o = o || {};
      return 頼む("quiz.get", { count: Number(o.count) || 10, presetId: o.presetId || "",
                                subject: o.subject || "" }, 6000).then(function (v) {
        return Array.isArray(v) ? v : [];
      });
    }
  };

  /* ── 画面の 部品（書かなくても それらしく 出る）──────────────────── */
  function 作る(tag, cls, 中) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    if (中 !== undefined) e.textContent = 中;
    return e;
  }
  var ui = {
    panel: function (o) {
      o = o || {};
      var p = 作る("div", "vq-panel");
      if (o.title) p.appendChild(作る("h2", "", o.title));
      if (o.body) p.appendChild(作る("p", "vq-sub", o.body));
      (o.親 || 根()).appendChild(p);
      return p;
    },
    row: function (親) { var r = 作る("div", "vq-row"); (親 || 根()).appendChild(r); return r; },
    button: function (label, fn, 親) {
      var b = 作る("button", "vq-btn", label);
      b.type = "button";
      b.addEventListener("click", function () { sound.click(); try { fn && fn(b); } catch (e) {} });
      (親 || 根()).appendChild(b);
      return b;
    },
    slider: function (o) {
      o = o || {};
      var wrap = 作る("label", "vq-slider");
      var t = 作る("span", "vq-slider-l", (o.label || "") + "：" + (o.value !== undefined ? o.value : 0));
      var i = D.createElement("input");
      i.type = "range";
      i.min = o.min === undefined ? 0 : o.min;
      i.max = o.max === undefined ? 100 : o.max;
      i.step = o.step === undefined ? 1 : o.step;
      i.value = o.value === undefined ? i.min : o.value;
      i.addEventListener("input", function () {
        t.textContent = (o.label || "") + "：" + i.value;
        try { o.onChange && o.onChange(Number(i.value)); } catch (e) {}
      });
      wrap.appendChild(t); wrap.appendChild(i);
      (o.親 || 根()).appendChild(wrap);
      return { el: wrap, input: i, get: function () { return Number(i.value); },
               set: function (v) { i.value = v; t.textContent = (o.label || "") + "：" + v; } };
    },
    label: function (t, 親) { var e = 作る("div", "vq-label", t); (親 || 根()).appendChild(e); return e; },
    toast: function (t, ms) {
      var e = 作る("div", "vq-toast", t);
      D.body.appendChild(e);
      setTimeout(function () { e.classList.add("out"); }, (ms || 1600) - 260);
      setTimeout(function () { try { e.remove(); } catch (x) {} }, ms || 1600);
      return e;
    },
    /* 点・残り・時間を まとめて 出す 帯。数を 入れ替えるだけで 更新される。 */
    hud: function (o) {
      o = o || {};
      var bar = 作る("div", "vq-hud");
      var 枠 = {};
      Object.keys(o).forEach(function (k) {
        if (k === "親") return;
        var c = 作る("span", "vq-hud-i");
        c.appendChild(作る("b", "", k));
        var v = 作る("i", "", String(o[k]));
        c.appendChild(v); bar.appendChild(c); 枠[k] = v;
      });
      var 親 = o.親 || 根();
      親.insertBefore(bar, 親.firstChild);
      return { el: bar, set: function (k, v) { if (枠[k]) 枠[k].textContent = String(v); } };
    }
  };

  /* ── うれしいときの 粒（外の道具は 使わない）─────────────────── */
  function 祝う(o) {
    o = o || {};
    var n = o.数 || 90;
    var cv = D.createElement("canvas");
    cv.className = "vq-fx";
    var dpr = Math.min(2, W.devicePixelRatio || 1);
    cv.width = W.innerWidth * dpr; cv.height = W.innerHeight * dpr;
    D.body.appendChild(cv);
    var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var P = [];
    for (var i = 0; i < n; i++) {
      P.push({ x: (o.x === undefined ? W.innerWidth / 2 : o.x), y: (o.y === undefined ? W.innerHeight * 0.42 : o.y),
               vx: rnd(-260, 260), vy: rnd(-420, -120), s: rnd(4, 9),
               c: pick(色.彩), a: 1, r: rnd(0, 6.28), vr: rnd(-6, 6) });
    }
    var t0 = 0;
    (function f(t) {
      var dt = t0 ? Math.min(0.05, (t - t0) / 1000) : 0.016; t0 = t;
      g.clearRect(0, 0, W.innerWidth, W.innerHeight);
      var 生 = 0;
      P.forEach(function (p) {
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.a -= dt * 0.55;
        if (p.a <= 0) return;
        生++;
        g.save(); g.globalAlpha = Math.max(0, p.a); g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); g.restore();
      });
      if (生) requestAnimationFrame(f); else { try { cv.remove(); } catch (e) {} }
    })(0);
    if (o.音 !== false) sound.win();
  }

  /* ── 時間 ──────────────────────────────────────────────────── */
  function timer(秒, o) {
    o = o || {};
    var 残 = Number(秒) || 30, 止 = false;
    var id = setInterval(function () {
      if (止) return;
      残 -= 1;
      try { o.onTick && o.onTick(残); } catch (e) {}
      if (残 <= 0) { clearInterval(id); try { o.onEnd && o.onEnd(); } catch (e) {} }
    }, 1000);
    return { stop: function () { clearInterval(id); }, pause: function () { 止 = true; },
             resume: function () { 止 = false; }, left: function () { return 残; } };
  }

  /* ── 絵を描く 近道（ctx を 毎回 書かなくてよい）───────────────── */
  function 描(o) {
    var s = _stage;
    if (!s) return null;
    var c = s.ctx;
    var d = {
      clear: function (col) { c.fillStyle = col || 色.地; c.fillRect(0, 0, s.w, s.h); return d; },
      rect: function (x, y, w, h, col, r) {
        c.fillStyle = col || 色.主;
        if (r) { 角丸(c, x, y, w, h, r); c.fill(); } else c.fillRect(x, y, w, h);
        return d;
      },
      line: function (x1, y1, x2, y2, col, 太) {
        c.strokeStyle = col || 色.字; c.lineWidth = 太 || 2;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); return d;
      },
      circle: function (x, y, r, col) {
        c.fillStyle = col || 色.主; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); return d;
      },
      text: function (t, x, y, o2) {
        o2 = o2 || {};
        c.fillStyle = o2.色 || 色.字;
        c.font = (o2.太 || 600) + " " + (o2.大きさ || 16) + "px Inter,'Hiragino Sans','Noto Sans JP',sans-serif";
        c.textAlign = o2.寄せ || "left"; c.textBaseline = o2.縦 || "top";
        c.fillText(String(t), x, y); return d;
      },
      img: function (im, x, y, w, h) { try { c.drawImage(im, x, y, w, h); } catch (e) {} return d; },
      ctx: c, w: s.w, h: s.h
    };
    return d;
  }
  function 角丸(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* ── できあがりを 外へ 伝える（点数・終わった、など）───────────── */
  function done(o) { 送る("done", { value: o || {} }); }

  /* ── まとめて 出す ─────────────────────────────────────────── */
  var VQ = {
    版: 1,
    root: null, 色: 色, colors: 色,
    stage: stage, loop: loop, stop: stop, 描: 描, draw: 描,
    keys: keys, key: key, onKey: onKey, 十字: 十字, dpad: 十字,
    pointer: pointer, onTap: onTap, onDrag: onDrag,
    sound: sound, speak: speak, 祝う: 祝う, confetti: 祝う,
    store: store, quiz: quiz, ui: ui, timer: timer, done: done,
    rnd: rnd, rndInt: rndInt, pick: pick, shuffle: shuffle,
    clamp: clamp, lerp: lerp, dist: dist, hit: hit, 円あたり: 円あたり,
    角丸: 角丸,
    ready: function (fn) {
      if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", go);
      else go();
      function go() { VQ.root = 根(); try { fn(); } catch (e) { 止める理由(e); throw e; } }
    },
    _fit: function () { try { W.dispatchEvent(new Event("resize")); } catch (e) {} }
  };
  try { VQ.root = 根(); } catch (e) {}
  W.VQ = VQ;
})();
