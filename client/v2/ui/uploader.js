/* ══════════════════════════════════════════════════════════════════════
   資料の分割アップロード（クライアント側）

   これまで資料は、本文も画像も要求 JSON へそのまま載せていた。
   40MB を超えると Bridge が本文を読み切る前に落ち、利用者には
   「通信に失敗しました」としか見えなかった（実測）。

   ここでは本体を JSON へ載せない。
   ・8MiB ずつに切って PUT する
   ・受け取り側が返すのは attachmentId だけ。以後はその ID を回す
   ・途中でやめられる。やめたところから続けられる
   ・落ちたパートだけ送り直せる（96MB を最初からやり直さない）

   100MB まで扱えるのは **ローカル Bridge 経路だけ**。
   Cloudflare Worker 経路は R2 が繋がっていないため、この上限を使わない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  /* ── Bridge の在りか。既存の接続部品が持っているものをそのまま使う ── */
  function provider() { return root.__vqLocalAI || null; }
  function baseUrl() {
    var P = provider();
    try { return P && typeof P.url === "function" ? P.url() : "http://127.0.0.1:17891"; }
    catch (e) { return "http://127.0.0.1:17891"; }
  }
  function authHeaders(extra) {
    var h = extra || {};
    var P = provider();
    try {
      var t = P && typeof P.token === "function" ? P.token() : "";
      if (t) h.Authorization = "Bearer " + t;
    } catch (e) {}
    return h;
  }

  /* ── 上限は Bridge から受け取る。ここに直書きしない ── */
  var LIMITS = null, limitsAt = 0;
  var FALLBACK = {
    maxFileBytes: 104857600, uploadPartBytes: 8388608, maxPartBytes: 16777216,
    maxTotalBytesPerJob: 314572800, maxFilesPerJob: 20, uploadTtlSeconds: 7200
  };
  function limits(force) {
    if (LIMITS && !force && Date.now() - limitsAt < 300000) return Promise.resolve(LIMITS);
    return fetch(baseUrl() + "/attachments/limits", { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        LIMITS = (j && j.limits) || FALLBACK;
        limitsAt = Date.now();
        return LIMITS;
      })
      .catch(function () { LIMITS = LIMITS || FALLBACK; return LIMITS; });
  }

  function fmtBytes(n) {
    var b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  /* ── 1 ファイルぶんの送り出し ─────────────────────────────────
     状態は 7 つ。「送信中」と「止めた」と「失敗」を混ぜない。 */
  var TASK_STATE = {
    queued:    "順番待ち",
    uploading: "送っています",
    paused:    "止めています",
    uploaded:  "送り終えました",
    failed:    "送れませんでした",
    cancelled: "取り消しました",
    expired:   "期限が切れました"
  };

  function Task(file, o) {
    o = o || {};
    this.id = "up_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    this.file = file;
    this.name = file && file.name ? String(file.name) : "資料";
    this.size = file ? Number(file.size) || 0 : 0;
    this.mimeType = (file && file.type) || "";
    this.kind = o.kind || kindOf(this.name, this.mimeType);
    this.jobId = o.jobId || null;
    this.attachmentId = null;
    this.partBytes = 0;
    this.totalParts = 0;
    this.parts = [];              /* {index, bytes, status: pending|sending|sent|failed} */
    this.sentBytes = 0;
    this.state = "queued";
    this.error = null;
    this.message = "";
    this._abort = null;
    this._stop = false;
    this.onChange = o.onChange || null;
  }

  function kindOf(name, mime) {
    var n = String(name || "").toLowerCase();
    if (/^image\//.test(mime) || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return "image";
    if (mime === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    if (/\.(docx?|rtf|odt)$/.test(n)) return "docx";
    if (/\.zip$/.test(n)) return "zip";
    if (/\.(txt|md|csv|json|ya?ml|log)$/.test(n)) return "text";
    if (/\.(js|ts|py|rb|go|rs|java|c|cpp|h|css|html?)$/.test(n)) return "code";
    return "unknown";
  }

  Task.prototype._emit = function () {
    if (this.onChange) { try { this.onChange(this); } catch (e) {} }
  };
  Task.prototype._set = function (state, msg) {
    this.state = state;
    if (msg !== undefined) this.message = msg;
    this._emit();
  };

  /* 画面に出す進み具合。パート単位でも出せるようにしておく
     （「45% です」より「12 個中 7 個目」のほうが、止めて再開したときに分かる）。 */
  Task.prototype.progress = function () {
    var sent = this.parts.filter(function (p) { return p.status === "sent"; }).length;
    return {
      sentBytes: this.sentBytes, totalBytes: this.size,
      sentParts: sent, totalParts: this.totalParts,
      percent: this.size ? Math.min(100, Math.round((this.sentBytes / this.size) * 100)) : 0,
      partBytes: this.partBytes,
      failedParts: this.parts.filter(function (p) { return p.status === "failed"; })
        .map(function (p) { return p.index; }),
      label: this.totalParts > 1
        ? sent + " / " + this.totalParts + " 個目（1 個 " + fmtBytes(this.partBytes) + "）"
        : fmtBytes(this.sentBytes) + " / " + fmtBytes(this.size)
    };
  };

  /* 送り始める前に場所を確保する。ここで上限に触れれば、1 バイトも送らずに済む。 */
  Task.prototype.init = function () {
    var self = this;
    return limits().then(function (L) {
      return fetch(baseUrl() + "/attachments/init", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          jobId: self.jobId || undefined,
          name: self.name, kind: self.kind, mimeType: self.mimeType,
          bytes: self.size, partSize: L.uploadPartBytes
        })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          return { status: r.status, json: j };
        });
      }).then(function (r) {
        if (r.status === 413) {
          self.error = r.json.error || "FILE_TOO_LARGE";
          self._set("failed", r.json.message || "この資料は大きすぎます。");
          return null;
        }
        if (r.status !== 200 || !r.json.attachmentId) {
          self.error = r.json.error || "INIT_FAILED";
          self._set("failed", "資料の受け取り口を用意できませんでした。");
          return null;
        }
        self.jobId = r.json.jobId;
        self.attachmentId = r.json.attachmentId;
        self.partBytes = Number(r.json.partBytes) || L.uploadPartBytes;
        self.totalParts = Math.max(1, Math.ceil(self.size / self.partBytes));
        self.parts = [];
        for (var i = 0; i < self.totalParts; i++)
          self.parts.push({ index: i, status: "pending",
                            bytes: Math.min(self.partBytes, self.size - i * self.partBytes) });
        self._set("queued", "");
        return self;
      });
    }).catch(function (e) {
      self.error = "BRIDGE_UNREACHABLE";
      self._set("failed", "ローカル AI に接続できません。Bridge が起動しているか確認してください。");
      return null;
    });
  };

  /* パートを 1 つ送る。止めたいときは AbortController で切る。 */
  Task.prototype._sendPart = function (p) {
    var self = this;
    var from = p.index * self.partBytes;
    var blob = self.file.slice(from, from + p.bytes);
    self._abort = new AbortController();
    p.status = "sending";
    self._emit();
    return fetch(baseUrl() + "/attachments/part?job=" + encodeURIComponent(self.jobId)
        + "&id=" + encodeURIComponent(self.attachmentId) + "&index=" + p.index, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/octet-stream" }),
      body: blob, signal: self._abort.signal
    }).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (j) { return { status: r.status, json: j }; });
    }).then(function (r) {
      if (r.status === 200) {
        /* 同じパートを送り直したときに二重に数えない */
        if (p.status !== "sent") self.sentBytes += p.bytes;
        p.status = "sent";
        self._emit();
        return true;
      }
      if (r.status === 404) {          /* 置き場所ごと消えている（期限切れ） */
        self.error = "JOB_NOT_FOUND";
        self._set("expired", "取り込みの期限が切れました。もう一度添付してください。");
        return false;
      }
      p.status = "failed";
      self.error = r.json.error || ("HTTP_" + r.status);
      self._emit();
      return false;
    }).catch(function (e) {
      /* 止めたときは失敗にしない。続きから送れる状態のままにする。 */
      if (self._stop) { p.status = "pending"; self._emit(); return false; }
      p.status = "failed";
      self.error = "NETWORK";
      self._emit();
      return false;
    });
  };

  /* まだ送っていないパートを順に送る。1 つでも落ちたらそこで止める
     （落ちたパートだけを覚えておき、あとから送り直せる）。 */
  Task.prototype.start = function () {
    var self = this;
    self._stop = false;
    var go = function () {
      if (self._stop) { self._set("paused", "止めています。続きから送れます。"); return Promise.resolve(self); }
      var next = self.parts.filter(function (p) { return p.status !== "sent"; })[0];
      if (!next) return self._complete();
      self._set("uploading");
      return self._sendPart(next).then(function (ok) {
        if (!ok) {
          if (self.state === "expired") return self;
          if (self._stop) { self._set("paused", "止めています。続きから送れます。"); return self; }
          self._set("failed", "送れなかった部分があります。もう一度送れます。");
          return self;
        }
        return go();
      });
    };
    var ready = self.attachmentId ? Promise.resolve(self) : self.init();
    return ready.then(function (r) { return r ? go() : self; });
  };

  Task.prototype._complete = function () {
    var self = this;
    return fetch(baseUrl() + "/attachments/complete", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jobId: self.jobId, attachmentId: self.attachmentId,
                             totalParts: self.totalParts })
    }).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (j) { return { status: r.status, json: j }; });
    }).then(function (r) {
      if (r.status === 200) {
        self.sentBytes = Number(r.json.bytes) || self.size;
        self._set("uploaded", "");
        return self;
      }
      if (r.status === 409 && r.json.missing) {
        /* 欠けているパートを教えてもらえる。そこだけ送り直す。 */
        r.json.missing.forEach(function (i) {
          if (self.parts[i]) { self.parts[i].status = "failed"; }
        });
        self._set("failed", r.json.missing.length + " 個の部分が届いていません。もう一度送れます。");
        return self;
      }
      self.error = r.json.error || ("HTTP_" + r.status);
      self._set("failed", "資料をまとめられませんでした。");
      return self;
    }).catch(function () {
      self.error = "NETWORK";
      self._set("failed", "資料をまとめられませんでした。");
      return self;
    });
  };

  /* 止める。送信中のパートは取り消し、次からやり直す。 */
  Task.prototype.pause = function () {
    this._stop = true;
    if (this._abort) { try { this._abort.abort(); } catch (e) {} }
    if (this.state === "uploading") this._set("paused", "止めています。続きから送れます。");
    return this;
  };
  Task.prototype.resume = function () {
    if (this.state === "uploaded" || this.state === "cancelled") return Promise.resolve(this);
    return this.start();
  };
  /* 落ちたパートだけを送り直す。全部やり直さない。 */
  Task.prototype.retryFailed = function () {
    this.parts.forEach(function (p) { if (p.status === "failed") p.status = "pending"; });
    this.error = null;
    return this.start();
  };
  Task.prototype.cancel = function () {
    this._stop = true;
    if (this._abort) { try { this._abort.abort(); } catch (e) {} }
    this._set("cancelled", "");
    return this;
  };

  /* 生成要求へ渡す形。**本体もページ画像もここには入らない。**
     入るのは、どこに置いたかを指す ID だけ。 */
  Task.prototype.ref = function () {
    if (this.state !== "uploaded") return null;
    return {
      id: this.attachmentId,
      attachmentId: this.attachmentId,
      jobId: this.jobId,
      name: this.name,
      kind: this.kind,
      fileType: this.kind,
      mimeType: this.mimeType,
      bytes: this.size
    };
  };

  /* ── ジョブ（1 回の取り込み。複数ファイルで場所を共有する）── */
  function Session(o) {
    o = o || {};
    this.jobId = o.jobId || null;
    this.tasks = [];
    this.onChange = o.onChange || null;
  }
  Session.prototype._emit = function () {
    if (this.onChange) { try { this.onChange(this); } catch (e) {} }
  };
  /* o.mark: 作った直後に立てておきたい印。
     ページ画像かどうかは**送り始める前**に決まっていないといけない。
     あとから立てると、その間に画面がチップを 1 枚作ってしまい、
     48 ページの資料でチップが 48 枚並ぶ（実測でそうなった）。 */
  Session.prototype.add = function (files, o) {
    var self = this;
    var mark = (o && o.mark) || null;
    var list = Array.prototype.slice.call(files || []);
    var made = list.map(function (f) {
      var t = new Task(f, {
        jobId: self.jobId,
        onChange: function () { self._emit(); }
      });
      if (mark) for (var k in mark) t[k] = mark[k];
      self.tasks.push(t);
      return t;
    });
    self._emit();
    /* 1 本目で場所が決まるので、順番に初期化してから並べて送る */
    return made.reduce(function (chain, t) {
      return chain.then(function () {
        t.jobId = self.jobId;
        return t.init().then(function (r) {
          if (r && r.jobId) self.jobId = r.jobId;
          return r;
        });
      });
    }, Promise.resolve()).then(function () {
      return made.reduce(function (chain, t) {
        return chain.then(function () { return t.state === "failed" ? t : t.start(); });
      }, Promise.resolve());
    }).then(function () { return made; });
  };
  Session.prototype.get = function (id) {
    return this.tasks.filter(function (t) {
      return t.id === id || t.attachmentId === id;
    })[0] || null;
  };
  Session.prototype.remove = function (id) {
    var t = this.get(id);
    if (t) t.cancel();
    this.tasks = this.tasks.filter(function (x) { return x !== t; });
    this._emit();
    return t;
  };
  /* 置き場所ごと消す。消したあとは status が 404 になる。 */
  Session.prototype.drop = function () {
    var self = this;
    if (!self.jobId) { self.tasks = []; self._emit(); return Promise.resolve(true); }
    var id = self.jobId;
    self.tasks.forEach(function (t) { t.cancel(); });
    self.tasks = [];
    self.jobId = null;
    self._emit();
    return fetch(baseUrl() + "/attachments/drop", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jobId: id })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  };
  Session.prototype.refs = function () {
    return this.tasks.map(function (t) { return t.ref(); }).filter(Boolean);
  };

  /* 開き直したとき、置き場所がまだ生きているかを確かめる。
     生きていれば選び直さずに使える（2 時間は残る）。 */
  function restore(jobId) {
    if (!jobId) return Promise.resolve(null);
    return fetch(baseUrl() + "/attachments/status?job=" + encodeURIComponent(jobId),
                 { headers: authHeaders() })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .then(function (j) { return (j && j.job) || null; })
      .catch(function () { return null; });
  }

  /* ══════════════════════════════════════════════════════════════════
     資料ひとまとまりの指紋をもらう

     これまで「同じ資料かどうか」は **添付 ID** で見ていた。
     ID は付け直すたびに変わるので、同じ PDF を選び直しただけで
     別の資料と見なされ、全ページを読み直していた。

     ここでは中身から作った札を Bridge からもらう。
     中身は解釈しない（不透明な文字列として持ち回るだけ）。
     取れなかったときは null。**取れないことを失敗にしない**
     （札が無ければ、今までどおりの動きに落ちるだけ）。 */
  function fingerprint(jobId, ids) {
    var job = String(jobId || "");
    if (!job) return Promise.resolve(null);
    var q = "?job=" + encodeURIComponent(job);
    if (Array.isArray(ids) && ids.length) q += "&ids=" + encodeURIComponent(ids.join(","));
    return fetch(baseUrl() + "/attachments/fingerprint" + q, { headers: authHeaders() })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ready || !j.fingerprint) return null;
        return { fingerprint: j.fingerprint, cacheVersion: j.cacheVersion,
                 memoVersion: j.memoVersion, files: j.files };
      })
      .catch(function () { return null; });
  }

  VQ2.upload = {
    limits: limits,
    Task: Task,
    Session: Session,
    restore: restore,
    fingerprint: fingerprint,
    fmtBytes: fmtBytes,
    kindOf: kindOf,
    TASK_STATE: TASK_STATE,
    baseUrl: baseUrl,
    /* 100MB まで扱えるのはローカル Bridge 経路だけ、という事実を画面が引ける形で置く。 */
    route: { name: "local-bridge", maxBytesNote: "100MB まではローカル Bridge 経路のみ",
             cloudflareLargeFile: false }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
