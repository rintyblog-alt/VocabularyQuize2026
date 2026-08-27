/* ══════════════════════════════════════════════════════════════════════
   録音と聞き取り（ユーザーの声）

   ・マイクは **押したときにだけ** 開く。使い終わったら必ず閉じる
     （閉じないと、ブラウザのタブに録音中の印が残り続ける）。
   ・録音した音は **既定では採点が終わったらすぐ消す**（§41）。
     残す設定にしたときだけ、端末の中（IndexedDB）に置く。**外へは送らない。**
   ・聞き取りは Bridge（この端末の中の Whisper）で行う。
   ・**できないことは、できないと言う。** マイクを断られた／Bridge が無い
     ときは、理由を返す。黙って 0 点にしない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var DB_NAME = "vq2.voice", DB_VER = 1, STORE = "takes";
  var MAX_MS = 30000;             /* 1 回の録音の上限。押しっぱなしを防ぐ */
  var MAX_BYTES = 8 * 1024 * 1024;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function provider() { return root.__vqLocalAI || null; }

  /* ── できるかどうか ────────────────────────────────────────── */
  function supported() {
    return !!(root.navigator && root.navigator.mediaDevices
              && root.navigator.mediaDevices.getUserMedia && root.MediaRecorder);
  }
  /* 端末が作れる音の形。webm が第一、Safari は mp4。 */
  function pickMime() {
    if (!root.MediaRecorder || !root.MediaRecorder.isTypeSupported) return "";
    var list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < list.length; i++) if (root.MediaRecorder.isTypeSupported(list[i])) return list[i];
    return "";
  }
  function baseKind(mime) { return str(mime).split(";")[0].trim() || "audio/webm"; }

  function status() {
    if (!provider()) return Promise.resolve({ ok: false, reason: "ローカルAIに接続できません。" });
    return fetch(provider().url() + "/stt/status", { headers: headers(false) })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (j) { return (j && j.stt) || { ok: false }; })
      .catch(function () { return { ok: false, reason: "ローカルAIに接続できません。" }; });
  }
  function headers(json) {
    var P = provider(), h = {};
    if (json) h["Content-Type"] = json === true ? "application/json" : json;
    var t = P && P.token && P.token();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  /* ══════════════════════════════════════════════════════════════════
     録音
     start() → { stop(), cancel(), ms(), stream }
     ══════════════════════════════════════════════════════════════════ */
  var current = null;

  function start(o) {
    o = o || {};
    if (!supported())
      return Promise.resolve({ ok: false, error: "NO_MIC",
                               reason: "この端末では録音できません（マイクの仕組みがありません）。" });
    if (current) stopStream(current);

    return root.navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function (stream) {
      var mime = pickMime();
      var rec;
      try { rec = new root.MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
      catch (e) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return { ok: false, error: "NO_RECORDER", reason: "この端末では録音を始められませんでした。" };
      }
      var chunks = [], t0 = Date.now(), stopped = null, timer = null;
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      var done = new Promise(function (resolve) { stopped = resolve; });
      rec.onstop = function () {
        if (timer) { clearTimeout(timer); timer = null; }
        stopStream(handle);
        var blob = new Blob(chunks, { type: baseKind(mime) });
        stopped({ ok: true, blob: blob, ms: Date.now() - t0, kind: baseKind(mime),
                  tooLong: blob.size > MAX_BYTES });
      };
      rec.start(100);
      /* 押しっぱなしを止める。止めないとマイクが開いたままになる。 */
      timer = setTimeout(function () { try { rec.stop(); } catch (e) {} }, MAX_MS);

      var handle = {
        ok: true, stream: stream, mime: baseKind(mime),
        ms: function () { return Date.now() - t0; },
        stop: function () {
          if (rec.state !== "inactive") { try { rec.stop(); } catch (e) {} }
          else stopped({ ok: false, error: "NOT_RECORDING", reason: "録音していません。" });
          return done;
        },
        cancel: function () {
          if (timer) { clearTimeout(timer); timer = null; }
          try { rec.ondataavailable = null; rec.onstop = null; if (rec.state !== "inactive") rec.stop(); } catch (e) {}
          stopStream(handle);
          stopped({ ok: false, error: "CANCELLED", reason: "録音をやめました。" });
          return done;
        },
        maxMs: MAX_MS
      };
      current = handle;
      return handle;
    }).catch(function (e) {
      var name = e && e.name;
      return { ok: false, error: name === "NotAllowedError" ? "DENIED" : "MIC_FAILED",
               reason: name === "NotAllowedError"
                 ? "マイクの利用が許可されませんでした。ブラウザの設定から許可すると使えます。"
                 : (name === "NotFoundError" ? "マイクが見つかりませんでした。"
                                             : "マイクを開けませんでした。") };
    });
  }
  function stopStream(h) {
    try { if (h && h.stream) h.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (current === h) current = null;
  }
  function isRecording() { return !!current; }

  /* ══════════════════════════════════════════════════════════════════
     聞き取り
     **目標の英文は送らない**（Bridge 側の注意書きと同じ理由）。
     ══════════════════════════════════════════════════════════════════ */
  function transcribe(blob, o) {
    o = o || {};
    if (!blob || !blob.size)
      return Promise.resolve({ ok: false, reason: "録音できていません。" });
    if (blob.size > MAX_BYTES)
      return Promise.resolve({ ok: false, reason: "録音が長すぎます。短く区切ってください。" });
    if (!provider())
      return Promise.resolve({ ok: false, error: "NO_BRIDGE",
                               reason: "ローカルAIに接続できないため、聞き取りできません。" });
    var t0 = Date.now();
    return fetch(provider().url() + "/stt/transcribe?words=1", {
      method: "POST",
      headers: headers(o.kind || blob.type || "audio/webm"),
      body: blob
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok || !j || !j.ok) {
          return { ok: false, error: (j && j.error) || "STT_FAILED",
                   reason: (j && j.message) || "聞き取りに失敗しました。" };
        }
        j.clientMs = Date.now() - t0;
        return j;
      });
    }).catch(function () {
      return { ok: false, error: "NETWORK", reason: "ローカルAIへ届きませんでした。" };
    });
  }

  /* 録音してから聞き取るまでを 1 本にする。 */
  function transcribeTake(take, o) {
    if (!take || !take.ok) return Promise.resolve({ ok: false, reason: (take && take.reason) || "録音できていません。" });
    return transcribe(take.blob, { kind: take.kind }).then(function (r) {
      r.recordedMs = take.ms;
      return r;
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     録音の置き場（残す設定のときだけ）
     ══════════════════════════════════════════════════════════════════ */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error("NO_IDB")); return; }
      var q = root.indexedDB.open(DB_NAME, DB_VER);
      q.onupgradeneeded = function () {
        var d = q.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var s = d.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("createdAt", "createdAt");
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

  var RETENTION_DAYS = { immediate: 0, session: 0, "7days": 7, "30days": 30 };

  /* 残すかどうかは設定しだい。**既定は残さない。** */
  function keep(take, o) {
    o = o || {};
    var mode = str(o.retention) || "immediate";
    if (mode === "immediate" || mode === "session")
      return Promise.resolve({ kept: false, reason: "設定により保存していません。" });
    var rec = {
      id: "vt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      blob: take.blob, bytes: take.blob.size, ms: take.ms,
      variantId: str(o.variantId), target: str(o.target).slice(0, 120),
      score: o.score === undefined ? null : o.score,
      createdAt: Date.now(),
      expiresAt: Date.now() + (RETENTION_DAYS[mode] || 7) * 864e5
    };
    return tx("readwrite").then(function (s) { return req(s.put(rec)); })
      .then(function () { return sweep().then(function () { return { kept: true, id: rec.id }; }); })
      .catch(function () { return { kept: false, reason: "端末へ保存できませんでした。" }; });
  }
  function list(o) {
    o = o || {};
    return tx("readonly").then(function (s) { return req(s.getAll()); })
      .then(function (all) {
        return (all || []).filter(function (r) { return !o.variantId || r.variantId === o.variantId; })
          .sort(function (a, b) { return b.createdAt - a.createdAt; });
      }).catch(function () { return []; });
  }
  function remove(id) {
    return tx("readwrite").then(function (s) { return req(s.delete(str(id))); })
      .then(function () { return { ok: true }; }).catch(function () { return { ok: false }; });
  }
  function clearAll() {
    return tx("readwrite").then(function (s) { return req(s.clear()); })
      .then(function () { return { ok: true }; }).catch(function () { return { ok: false }; });
  }
  /* 期限の切れたものを消す。**約束した期限を守る。** */
  function sweep() {
    var now = Date.now();
    return tx("readonly").then(function (s) { return req(s.getAll()); })
      .then(function (all) {
        var dead = (all || []).filter(function (r) { return r.expiresAt && r.expiresAt <= now; });
        if (!dead.length) return { removed: 0 };
        return dead.reduce(function (c, r) { return c.then(function () { return remove(r.id); }); },
                           Promise.resolve()).then(function () { return { removed: dead.length }; });
      }).catch(function () { return { removed: 0 }; });
  }
  function usage() {
    return tx("readonly").then(function (s) { return req(s.getAll()); })
      .then(function (all) {
        return { count: (all || []).length,
                 bytes: (all || []).reduce(function (a, r) { return a + (r.bytes || 0); }, 0) };
      }).catch(function () { return { count: 0, bytes: 0 }; });
  }

  VQ2.stt = {
    supported: supported, status: status, isRecording: isRecording,
    start: start, transcribe: transcribe, transcribeTake: transcribeTake,
    keep: keep, list: list, remove: remove, clearAll: clearAll, sweep: sweep, usage: usage,
    MAX_MS: MAX_MS, RETENTION_DAYS: RETENTION_DAYS, pickMime: pickMime
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
