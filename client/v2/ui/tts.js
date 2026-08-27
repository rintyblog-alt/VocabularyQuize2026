/* ══════════════════════════════════════════════════════════════════════
   読み上げ（音声問題の土台）

   **音声ファイルではなく「原稿（script）」を問題の本体にする。**
   ・AI には原稿だけを書かせる（架空の音声 URL を作らせない）
   ・再生するときに音声を用意する。用意できたものは端末に貯める
   ・Bridge が無い端末（配られた側・スマホ）でも、原稿があるので解ける

   音声の出どころは 3 段。上から順に試す。
     ① 端末に貯めてある音声（すぐ鳴る）
     ② Bridge で作る（VOICEVOX / Kokoro。外へは送らない）
     ③ 端末の読み上げ（Web Speech API。声は端末まかせ）

   ここは「鳴らす」ことだけを持つ。何を鳴らすかは問題（script）が決める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var DB_NAME = "vq2.audio", DB_VER = 1, STORE = "clips";
  var MAX_BYTES = 120 * 1024 * 1024;   /* 端末に貯める上限。超えたら古いものから消す */

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function provider() { return root.__vqLocalAI || null; }
  /* Bridge が **実際に見つかっているか**。
     口があるだけでは足りない（見つかっていなければ通信して待つだけ無駄）。 */
  function bridgeReady() {
    var P = provider();
    if (!P) return false;
    try { return !!(P.conf && P.conf().url); } catch (e) { return false; }
  }

  /* ── 端末の置き場（IndexedDB）───────────────────────────────────
     localStorage には入れない。音声 1 本で 100KB を超えるので、
     入れると保存領域を食いつぶしてプリセットごと保存できなくなる。 */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error("NO_IDB")); return; }
      var q = root.indexedDB.open(DB_NAME, DB_VER);
      q.onupgradeneeded = function () {
        var d = q.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var s = d.createObjectStore(STORE, { keyPath: "key" });
          s.createIndex("usedAt", "usedAt");
        }
      };
      q.onsuccess = function () { resolve(q.result); };
      q.onerror = function () { reject(q.error || new Error("IDB_OPEN")); };
    }).catch(function (e) { dbp = null; throw e; });
    return dbp;
  }
  function tx(mode) {
    return db().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  function req(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  /* 同じ原稿・同じ声・同じ速さなら、同じ音声。作り直さない。 */
  function cacheKey(text, voice, speed) {
    var s = str(text) + "|" + str(voice) + "|" + (Number(speed) || 1);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + "_" + s.length.toString(36);
  }

  function getClip(key) {
    return tx("readonly").then(function (s) { return req(s.get(key)); }).catch(function () { return null; });
  }
  function putClip(rec) {
    return tx("readwrite").then(function (s) { return req(s.put(rec)); }).catch(function () { return null; });
  }
  function allClips() {
    return tx("readonly").then(function (s) { return req(s.getAll()); }).catch(function () { return []; });
  }
  function delClip(key) {
    return tx("readwrite").then(function (s) { return req(s.delete(key)); }).catch(function () { return null; });
  }

  /* 貯めすぎたら、最後に使った日が古いものから消す。 */
  function trim() {
    return allClips().then(function (list) {
      var total = list.reduce(function (a, c) { return a + (c.bytes || 0); }, 0);
      if (total <= MAX_BYTES) return { total: total, removed: 0 };
      list.sort(function (a, b) { return (a.usedAt || 0) - (b.usedAt || 0); });
      var removed = 0;
      var chain = Promise.resolve();
      list.forEach(function (c) {
        if (total <= MAX_BYTES * 0.8) return;
        total -= c.bytes || 0; removed++;
        chain = chain.then(function () { return delClip(c.key); });
      });
      return chain.then(function () { return { total: total, removed: removed }; });
    });
  }

  function usage() {
    return allClips().then(function (list) {
      return { count: list.length,
               bytes: list.reduce(function (a, c) { return a + (c.bytes || 0); }, 0),
               limitBytes: MAX_BYTES };
    });
  }
  function clearAll() {
    return tx("readwrite").then(function (s) { return req(s.clear()); }).catch(function () { return null; });
  }

  /* ── Bridge ──────────────────────────────────────────────────── */
  function base() {
    var P = provider();
    return P ? P.url() : "";
  }
  /* Bridge が **トンネル越し（公開 https）**のときは、
     ペアリング token ではなく **VocabuQuiz のログイン token** を送る。
     外向けの Bridge は、その token で本人確認する作りだから。
     手元・LAN の Bridge のときは、今までどおりペアリング token。 */
  function isTunnel() {
    var u = base();
    if (!/^https:\/\//i.test(u)) return false;
    var h = "";
    try { h = new URL(u).hostname; } catch (e) { return false; }
    if (h === "127.0.0.1" || h === "localhost" || /\.local$/i.test(h)) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;   /* 公開ホスト名＝トンネル */
  }
  function appToken() {
    try { return String(root.localStorage.getItem("app.auth.token.v1") || "").trim(); } catch (e) { return ""; }
  }
  function headers(json) {
    var P = provider();
    var h = {};
    if (json) h["Content-Type"] = "application/json";
    if (isTunnel()) {
      var at = appToken();
      if (at) h.Authorization = "Bearer " + at;
      return h;
    }
    var t = P && P.token && P.token();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  var voiceCache = null;
  /* 声の一覧。**動いていないエンジンのために勝手に起こさない**（start で明示） */
  function voices(o) {
    o = o || {};
    if (voiceCache && !o.force && !o.start) return Promise.resolve(voiceCache);
    var P = provider();
    if (!P) return Promise.resolve({ ok: false, voices: [], engines: {}, reason: "ローカルAIの接続部品が読み込まれていません。" });
    var q = (o.start ? "?start=1" : "") + (o.force ? (o.start ? "&force=1" : "?force=1") : "");
    return fetch(base() + "/tts/voices" + q, { headers: headers(false) })
      .then(function (r) { return r.ok ? r.json() : { ok: false, voices: [], engines: {} }; })
      .then(function (j) {
        if (j && j.voices && j.voices.length) voiceCache = j;
        return j || { ok: false, voices: [], engines: {} };
      })
      .catch(function () {
        return { ok: false, voices: [], engines: {}, reason: "ローカルAIに接続できません。" };
      });
  }

  /* すでに取ってある一覧。取りに行かない（画面を描く途中で使う）。 */
  function cachedVoices() { return (voiceCache && voiceCache.voices) || []; }

  function status() {
    if (!provider()) return Promise.resolve({ ok: false, engines: {} });
    return fetch(base() + "/tts/status", { headers: headers(false) })
      .then(function (r) { return r.ok ? r.json() : { ok: false, engines: {} }; })
      .catch(function () { return { ok: false, engines: {} }; });
  }

  /* 音声を 1 本作る。作れたら端末へ貯める。 */
  function make(text, o) {
    o = o || {};
    var t = str(text).trim();
    if (!t) return Promise.resolve({ ok: false, reason: "読み上げる文がありません。" });
    var voice = str(o.voice) || defaultVoiceFor(t);
    var speed = Number(o.speed) || 1;
    var key = cacheKey(t, voice, speed);

    return getClip(key).then(function (hit) {
      if (hit && hit.blob) {
        hit.usedAt = Date.now();
        putClip(hit);
        return { ok: true, blob: hit.blob, seconds: hit.seconds, voice: hit.voice, cached: true, key: key };
      }
      if (!provider()) return { ok: false, reason: "ローカルAIに接続できないため、音声を作れません。" };
      return fetch(base() + "/tts/speak", {
        method: "POST", headers: headers(true),
        body: JSON.stringify({ text: t, voice: voice, speed: speed })
      }).then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            return { ok: false, reason: j.message || "音声を作れませんでした。", code: j.error || "" };
          });
        }
        var seconds = Number(r.headers.get("X-Audio-Seconds") || 0);
        var used = r.headers.get("X-Audio-Voice") || voice;
        return r.blob().then(function (blob) {
          putClip({ key: key, blob: blob, bytes: blob.size, seconds: seconds,
                    voice: used, text: t.slice(0, 80), createdAt: Date.now(), usedAt: Date.now() })
            .then(function () { return trim(); });
          return { ok: true, blob: blob, seconds: seconds, voice: used, cached: false, key: key };
        });
      }).catch(function () {
        return { ok: false, reason: "ローカルAIに接続できないため、音声を作れません。" };
      });
    });
  }

  /* 日本語なら VOICEVOX、そうでなければ Kokoro。何も分からなければ英語の声。 */
  function defaultVoiceFor(text) {
    return isJapanese(text) ? "voicevox:3" : "kokoro:af_heart";
  }
  function isJapanese(text) {
    return /[぀-ヿ一-鿿]/.test(str(text));
  }

  /* ── サーバで作る（Bridge が無い端末のための本命）──────────────
     日本語も英語も、こちらで作れる。作れなければ素直に false を返す
     （無音を返さない。呼び側が端末の声へ落とす）。 */
  function apiBase() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function serverSpeak(text, o) {
    o = o || {};
    var h = { "Content-Type": "application/json" };
    try {
      var tok = root.localStorage.getItem("app.auth.token.v1");
      if (tok) h.Authorization = "Bearer " + tok;
    } catch (e) {}
    return fetch(apiBase() + "/api/tts/speak", {
      method: "POST", headers: h,
      body: JSON.stringify({ text: str(text), lang: o.lang || "" })
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.indexOf("audio") < 0) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          return { ok: false, reason: (d && d.message) || "サーバで音声を作れませんでした。" };
        });
      }
      var model = res.headers.get("x-vq-tts-model") || "";
      return res.blob().then(function (blob) {
        return new Promise(function (resolve) {
          var url = URL.createObjectURL(blob);
          var a = new Audio(url);
          a.playbackRate = Math.max(0.5, Math.min(2, Number(o.rate) || 1));
          release();
          current = { audio: a, url: url, seq: playSeq };
          a.onended = function () { release(); resolve({ ok: true, source: "server", model: model }); };
          a.onerror = function () { release(); resolve({ ok: false, reason: "音声を再生できませんでした。" }); };
          a.play().catch(function () {
            release();
            resolve({ ok: false, reason: "再生できませんでした（画面を一度さわってからお試しください）。" });
          });
        });
      });
    }).catch(function () {
      return { ok: false, reason: "サーバへつながりませんでした。" };
    });
  }

  /* ── 端末の読み上げ（最後の受け皿）────────────────────────────── */
  function canSpeakLocal() { return !!(root.speechSynthesis && root.SpeechSynthesisUtterance); }
  /* 音を出せる見込みがあるか。Bridge で作れるか、端末が読み上げられるか。
     どちらも無い端末では、音声問題を作っても鳴らないので出題候補から外す。 */
  function canMakeAudio() { return !!provider() || canSpeakLocal(); }
  /* 声の一覧は、最初の呼び出しでは空で返ることがある（iOS / Chrome）。
     用意できたら知らせてくれるので、そこで拾い直す。 */
  var voiceCache = [];
  function localVoices() {
    if (!canSpeakLocal()) return [];
    try {
      var v = root.speechSynthesis.getVoices() || [];
      if (v.length) voiceCache = v;
      return voiceCache;
    } catch (e) { return voiceCache; }
  }
  try {
    if (root.speechSynthesis && "onvoiceschanged" in root.speechSynthesis) {
      root.speechSynthesis.addEventListener("voiceschanged", function () {
        try { voiceCache = root.speechSynthesis.getVoices() || voiceCache; } catch (e) {}
      });
    }
  } catch (e) {}

  /* ── 最初のタップで読み上げの口を開けておく ──
     iOS は「一度も利用者の操作から呼ばれていない」状態だと、
     あとから呼んでも鳴らない。無音の短い発話を 1 回だけ通して開けておく。
     開けるのは 1 回きり。以後は普通に鳴る。 */
  var unlocked = false;
  function unlockLocalVoice() {
    if (unlocked || !canSpeakLocal()) return;
    unlocked = true;
    try {
      var u = new root.SpeechSynthesisUtterance(" ");
      u.volume = 0; u.rate = 10;
      root.speechSynthesis.speak(u);
      root.speechSynthesis.cancel();
      /* ここで声の一覧も取れるようになることが多い */
      localVoices();
    } catch (e) {}
  }
  try {
    ["touchend", "pointerup", "click", "keydown"].forEach(function (ev) {
      root.document.addEventListener(ev, unlockLocalVoice, { once: true, capture: true, passive: true });
    });
  } catch (e) {}
  var localUtter = null;
  function speakLocal(text, o) {
    o = o || {};
    if (!canSpeakLocal()) return Promise.resolve({ ok: false, reason: "この端末では読み上げできません。" });
    return new Promise(function (resolve) {
      try { root.speechSynthesis.cancel(); } catch (e) {}
      var u = new root.SpeechSynthesisUtterance(str(text));
      u.lang = o.lang || (isJapanese(text) ? "ja-JP" : "en-US");
      u.rate = Math.max(0.5, Math.min(2, Number(o.rate) || 1));
      var vs = localVoices().filter(function (v) { return v.lang && v.lang.indexOf(u.lang.slice(0, 2)) === 0; });
      if (vs.length) u.voice = vs[0];
      u.onend = function () { localUtter = null; resolve({ ok: true, local: true }); };
      u.onerror = function () { localUtter = null; resolve({ ok: false, reason: "読み上げに失敗しました。" }); };
      localUtter = u;
      root.speechSynthesis.speak(u);
    });
  }
  function stopLocal() {
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {}
    localUtter = null;
  }

  /* ── 鳴らす ───────────────────────────────────────────────────
     ① 端末の音声 → ② Bridge で作る → ③ 端末の読み上げ
     どこまでいったかを返す。**「鳴らなかった」を黙って握りつぶさない。** */
  var current = null;
  /* 何番目の再生かを数える。**音を作っている間に次の再生が始まったら、
     先に始まったほうは捨てる。** これをしないと、押した回数だけ音が重なって
     二重に聞こえたり割れたりする（実測）。 */
  var playSeq = 0;
  function play(text, o) {
    o = o || {};
    stop();
    var mySeq = ++playSeq;

    /* ── Bridge が無ければ、まず **サーバで作る** ──
       手元の Bridge は Mac の中にしか無い。スマホや配った先では届かない。
       そのままだと端末まかせの声しか出ず、用意した声が使えない。
       サーバ（Workers AI）で作れるので、そちらを先に試す。
       作れなかったときだけ端末の読み上げへ落とす。 */
    /* provider() は「Bridge の口があるか」であって「使えるか」ではない。
       __vqLocalAI は常に居るので、これで判定すると必ず Bridge 側へ倒れ、
       スマホでは待たされた末に端末の声になっていた（実測）。
       **実際に見つかっている（url が控えてある）かどうか**で判断する。 */
    if (!bridgeReady() && !o.noFallback && !o.localOnly) {
      if (o.onStart) { try { o.onStart({ server: true }); } catch (e) {} }
      return serverSpeak(text, o).then(function (sr) {
        if (mySeq !== playSeq) return { ok: false, superseded: true, reason: "" };
        if (sr.ok) return sr;
        /* サーバでも作れなかった。端末の声へ。 */
        return speakLocal(text, { rate: o.rate, lang: o.lang }).then(function (lr) {
          return lr.ok
            ? { ok: true, source: "local", note: "この端末の読み上げで再生しました（声は端末のものです）。" }
            : { ok: false, reason: lr.reason || sr.reason || "音声を用意できませんでした。" };
        });
      });
    }

    /* ── Bridge も無く、サーバも使わない指定なら、待たずに端末の読み上げへ ──
       iOS / Android は「利用者がさわった流れの中」でしか読み上げを始められない。
       ここで先に Bridge を探しに行くと、その通信を待っている間に
       さわった扱いが切れて、**無音のまま何も起きない**（スマホで実際にそうなった）。
       Bridge が無いことは provider() を見れば通信せずに分かるので、
       その場合は一切待たずに読み上げる。 */
    if (!bridgeReady() && o.localOnly && canSpeakLocal()) {
      if (o.onStart) { try { o.onStart({ local: true }); } catch (e) {} }
      return speakLocal(text, { rate: o.rate, lang: o.lang }).then(function (lr) {
        if (mySeq !== playSeq) return { ok: false, superseded: true, reason: "" };
        return lr.ok
          ? { ok: true, source: "local", note: "この端末の読み上げで再生しました（声は端末のものです）。" }
          : { ok: false, reason: lr.reason || "音声を用意できませんでした。" };
      });
    }

    return make(text, o).then(function (r) {
      /* 待っている間に次の再生が始まっていたら、ここでやめる。 */
      if (mySeq !== playSeq) return { ok: false, superseded: true, reason: "" };
      if (r.ok && r.blob) {
        var url = URL.createObjectURL(r.blob);
        var a = new Audio(url);
        a.playbackRate = Math.max(0.5, Math.min(2, Number(o.rate) || 1));
        stop();                       /* 直前のものが残っていれば必ず止める */
        current = { audio: a, url: url, seq: mySeq };
        return new Promise(function (resolve) {
          a.onended = function () { release(); resolve({ ok: true, source: r.cached ? "cache" : "bridge", seconds: r.seconds, voice: r.voice }); };
          a.onerror = function () { release(); resolve({ ok: false, reason: "音声を再生できませんでした。" }); };
          if (o.onStart) { try { o.onStart({ seconds: r.seconds, voice: r.voice }); } catch (e) {} }
          a.play().catch(function () {
            release();
            resolve({ ok: false, reason: "再生できませんでした（画面を一度さわってからお試しください）。" });
          });
        });
      }
      /* Bridge が無い・作れない。端末の読み上げへ落とす。
         **落としたことを黙らない**（声が違うので、人は気づく必要がある）。 */
      if (o.noFallback) return { ok: false, reason: r.reason || "音声を用意できませんでした。" };
      if (mySeq !== playSeq) return { ok: false, superseded: true, reason: "" };
      if (o.onStart) { try { o.onStart({ local: true }); } catch (e) {} }
      return speakLocal(text, { rate: o.rate }).then(function (lr) {
        return lr.ok
          ? { ok: true, source: "local", note: "この端末の読み上げで再生しました（声は端末のものです）。" }
          : { ok: false, reason: lr.reason || r.reason || "音声を用意できませんでした。" };
      });
    });
  }
  function release() {
    if (current) {
      try { current.audio.pause(); } catch (e) {}
      try { URL.revokeObjectURL(current.url); } catch (e) {}
      current = null;
    }
  }
  function stop() { playSeq++; release(); stopLocal(); }
  function isPlaying() { return !!current || !!localUtter; }

  /* 問題から「読み上げる文」と「声」を決める。
     ・原稿（script）が本体。無ければ正解の文（書き取り）を読む。
     ・声は 問題 → プリセット → 言語ごとの既定 の順。 */
  function scriptOf(q) {
    if (!q) return "";
    var s = str(q.script || (q.audio && q.audio.script) || "").trim();
    if (s) return s;
    /* 書き取りは、書き取らせる文がそのまま原稿。二重に持たせない。 */
    if (q.engine === "dictation" && typeof q.correctAnswer === "string") return q.correctAnswer.trim();
    return "";
  }
  function voiceOf(q, preset) {
    var v = str(q && (q.voice || (q.audio && q.audio.voice)));
    if (v) return v;
    var pv = preset && preset.audio && preset.audio.voice;
    if (pv) return str(pv);
    return defaultVoiceFor(scriptOf(q));
  }
  function speedOf(q, preset) {
    var s = q && (q.speed || (q.audio && q.audio.speed));
    if (s) return Number(s) || 1;
    var ps = preset && preset.audio && preset.audio.speed;
    return Number(ps) || 1;
  }
  function playQuestion(q, o) {
    o = o || {};
    var text = o.text || scriptOf(q);
    if (!text) return Promise.resolve({ ok: false, reason: "読み上げる原稿がありません。" });
    return play(text, {
      voice: o.voice || voiceOf(q, o.preset),
      speed: o.speed || speedOf(q, o.preset),
      rate: o.rate, onStart: o.onStart, noFallback: o.noFallback
    });
  }

  /* まとめて用意する（プリセットを配る前に音声を作っておく）。
     何問できたかを都度返す。**偽の進捗を作らない。** */
  function prepare(list, o) {
    o = o || {};
    var items = (list || []).filter(function (x) { return str(x.text).trim(); });
    var done = 0, made = 0, failed = [];
    return items.reduce(function (chain, it) {
      return chain.then(function () {
        if (o.shouldStop && o.shouldStop()) return null;
        return make(it.text, { voice: it.voice || o.voice, speed: it.speed || o.speed })
          .then(function (r) {
            done++;
            if (r.ok) made++; else failed.push({ id: it.id, reason: r.reason });
            if (o.onProgress) { try { o.onProgress({ done: done, total: items.length, made: made }); } catch (e) {} }
          });
      });
    }, Promise.resolve()).then(function () {
      return { total: items.length, done: done, made: made, failed: failed };
    });
  }

  VQ2.tts = {
    voices: voices, cachedVoices: cachedVoices, status: status,
    make: make, play: play, playQuestion: playQuestion, prepare: prepare,
    stop: stop, isPlaying: isPlaying,
    speakLocal: speakLocal, canSpeakLocal: canSpeakLocal, canMakeAudio: canMakeAudio,
    localVoices: localVoices,
    cacheKey: cacheKey, usage: usage, clearAll: clearAll, trim: trim,
    scriptOf: scriptOf, voiceOf: voiceOf, speedOf: speedOf,
    defaultVoiceFor: defaultVoiceFor, isJapanese: isJapanese
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
