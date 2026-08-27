/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 保存基盤（§10 / §11）

   ここが仕様のいちばん大事な部分。
   ・正式な保存先はサーバ（D1）。localStorage は「控え」と「復旧」のためだけ。
     ログインしていない場合は端末保存になるが、**そのことを画面へ必ず出す**。
     「保存しました」と嘘をつかない。
   ・保存は直列。走っている保存が終わるまで次を投げない。
     途中で編集が続いたら、最新の内容だけを次の 1 回にまとめる。
   ・古い応答で新しい内容を上書きしない（保存のたびに通し番号を振る）。
   ・サーバの版が進んでいたら 409 を受け取り、競合として止める。黙って潰さない。
   ・ネットワークが落ちたら端末へ退避し、次に開いたときに復元を尋ねる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model;
  if (!M) throw new Error("workplace/model.js must be loaded before store.js");

  var LS = {
    items:   "vq2.wp.items.v1",     /* 端末の控え（メタ） */
    content: "vq2.wp.content.v1",   /* 端末の控え（本文） */
    pending: "vq2.wp.pending.v1",   /* 未同期の変更 */
    prefs:   "vq2.wp.prefs.v1",     /* 表示方法・並び順など */
    versions:"vq2.wp.versions.v1"   /* 端末保存時の版 */
  };
  var AUTOSAVE_MS = 1000;           /* 入力が止まってから保存するまで（§10.1） */

  /* ── localStorage の読み書き ───────────────────────────────────── */
  function lsGet(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      if (!raw) return fallback;
      var o = JSON.parse(raw);
      return o === null || o === undefined ? fallback : o;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* ── 認証まわり ───────────────────────────────────────────────── */
  function token() {
    try { return String(root.localStorage.getItem("app.auth.token.v1") || "").trim(); }
    catch (e) { return ""; }
  }
  function isSignedIn() { return !!token(); }
  function apiBase() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";                       /* 同じ場所から配られているときは相対で叩く */
  }
  function isOnline() {
    try { return root.navigator ? root.navigator.onLine !== false : true; } catch (e) { return true; }
  }
  function ownerId() {
    try {
      var raw = root.localStorage.getItem("app.auth.profile.v1");
      if (raw) {
        var p = JSON.parse(raw);
        var id = p && (p.uid || p.userId || p.id);
        if (id) return String(id);
      }
    } catch (e) {}
    return "local";
  }

  /* ── サーバへの問い合わせ ─────────────────────────────────────── */
  function api(method, path, body, opts) {
    opts = opts || {};
    var url = apiBase() + path;
    var headers = { "Content-Type": "application/json" };
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null) init.body = JSON.stringify(body);
    var ctl = null;
    if (root.AbortController && opts.timeoutMs) {
      ctl = new root.AbortController();
      init.signal = ctl.signal;
      root.setTimeout(function () { try { ctl.abort(); } catch (e) {} }, opts.timeoutMs);
    }
    return root.fetch(url, init).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.message) || ("通信に失敗しました（" + res.status + "）"));
          err.status = res.status;
          err.code = (data && data.code) || "HTTP_" + res.status;
          err.data = data;
          throw err;
        }
        return data || {};
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     端末の控え
     ══════════════════════════════════════════════════════════════════ */
  function localItems() {
    var all = lsGet(LS.items, []);
    if (!Array.isArray(all)) return [];
    var me = ownerId();
    return all.filter(function (r) { return r && (r.ownerId === me || (!r.ownerId && me === "local")); });
  }
  function localSaveItem(item) {
    var all = lsGet(LS.items, []);
    if (!Array.isArray(all)) all = [];
    var i = -1;
    for (var k = 0; k < all.length; k++) if (all[k] && all[k].id === item.id) { i = k; break; }
    if (i >= 0) all[i] = item; else all.unshift(item);
    if (all.length > 400) all = all.slice(0, 400);
    return lsSet(LS.items, all);
  }
  function localRemoveItem(id) {
    var all = lsGet(LS.items, []).filter(function (r) { return r && r.id !== id; });
    lsSet(LS.items, all);
    var c = lsGet(LS.content, {});
    delete c[id];
    lsSet(LS.content, c);
    var p = lsGet(LS.pending, {});
    delete p[id];
    lsSet(LS.pending, p);
  }
  function localContent(id) {
    var c = lsGet(LS.content, {});
    return c && c[id] ? c[id] : null;
  }
  function localSaveContent(id, content) {
    var c = lsGet(LS.content, {});
    if (!c || typeof c !== "object") c = {};
    c[id] = content;
    if (!lsSet(LS.content, c)) {
      /* いっぱいになったら、開いていないものから捨てる。開いている 1 件は必ず残す。 */
      var keys = Object.keys(c);
      for (var i = 0; i < keys.length && keys.length > 1; i++) {
        if (keys[i] === id) continue;
        delete c[keys[i]];
        if (lsSet(LS.content, c)) return true;
      }
      return false;
    }
    return true;
  }
  /* 未同期の印。サーバへ入っていない変更をここに積む。 */
  function pendingGet(id) { var p = lsGet(LS.pending, {}); return p && p[id] ? p[id] : null; }
  function pendingSet(id, rec) {
    var p = lsGet(LS.pending, {});
    if (!p || typeof p !== "object") p = {};
    if (rec) p[id] = rec; else delete p[id];
    lsSet(LS.pending, p);
  }
  function pendingAll() {
    var p = lsGet(LS.pending, {});
    return p && typeof p === "object" ? p : {};
  }

  /* ══════════════════════════════════════════════════════════════════
     一覧・作成・取得
     ══════════════════════════════════════════════════════════════════ */
  function list(opts) {
    opts = opts || {};
    var localList = localItems();
    if (!isSignedIn() || !isOnline()) {
      return Promise.resolve({ items: filterLocal(localList, opts), source: "local",
        signedIn: isSignedIn(), online: isOnline() });
    }
    var q = "?status=" + encodeURIComponent(opts.status || "active");
    if (opts.itemType) q += "&itemType=" + encodeURIComponent(opts.itemType);
    return api("GET", "/api/workplace/items" + q, null, { timeoutMs: 15000 })
      .then(function (r) {
        var items = (r.items || []).map(function (x) { return M.normalizeItem(x) ? merge(x) : null; })
          .filter(Boolean);
        /* サーバの内容で控えを更新する（一覧のぶんだけ）。 */
        items.forEach(function (it) { localSaveItem(it); });
        /* 端末にしか無いもの（未同期・ゲスト時代のもの）も混ぜる。消さない。 */
        var seen = {};
        items.forEach(function (it) { seen[it.id] = true; });
        localList.forEach(function (it) {
          if (!seen[it.id] && matchStatus(it, opts.status || "active")) {
            it.__localOnly = true;
            items.push(it);
          }
        });
        return { items: filterLocal(items, opts), source: "server", signedIn: true, online: true };
      })
      .catch(function (e) {
        return { items: filterLocal(localList, opts), source: "local", error: e,
          signedIn: isSignedIn(), online: isOnline() };
      });
  }
  function merge(raw) {
    var it = M.normalizeItem(raw) || {};
    it.preview = raw.preview || {};
    it.publicId = raw.publicId || "";
    return it;
  }
  function matchStatus(it, status) {
    return status === "trashed" ? it.status === "trashed" : it.status !== "trashed";
  }
  function filterLocal(items, opts) {
    var out = items.filter(function (it) { return matchStatus(it, opts.status || "active"); });
    if (opts.itemType) out = out.filter(function (it) { return it.itemType === opts.itemType; });
    if (opts.favorite) out = out.filter(function (it) { return !!it.favorite; });
    var q = String(opts.query || "").trim().toLowerCase();
    if (q) {
      out = out.filter(function (it) {
        return String(it.title || "").toLowerCase().indexOf(q) >= 0
          || String(it.description || "").toLowerCase().indexOf(q) >= 0
          || previewText(it).toLowerCase().indexOf(q) >= 0;
      });
    }
    var sort = opts.sort || "updated";
    out.sort(function (a, b) {
      if (sort === "name") return String(a.title).localeCompare(String(b.title), "ja");
      if (sort === "created") return String(b.createdAt).localeCompare(String(a.createdAt));
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return out;
  }
  function previewText(it) {
    var p = it.preview || {};
    if (p.kind === "document") return (p.lines || []).map(function (l) { return l.t; }).join(" ");
    if (p.kind === "presentation") return String(p.title || "");
    return "";
  }

  function create(itemType, o) {
    o = o || {};
    var item = M.newItem(itemType, { ownerId: ownerId(), title: o.title, templateId: o.templateId,
      appearance: o.appearance, description: o.description });
    var content = o.content || M.emptyContent(itemType);
    item.preview = M.buildPreview(itemType, content.content);

    localSaveItem(item);
    localSaveContent(item.id, content);

    if (!isSignedIn() || !isOnline()) {
      pendingSet(item.id, { at: M.nowIso(), reason: isSignedIn() ? "offline" : "guest" });
      return Promise.resolve({ item: item, content: content, source: "local" });
    }
    return api("POST", "/api/workplace/items", {
      id: item.id, itemType: itemType, title: item.title, description: item.description,
      appearance: item.appearance, preview: item.preview, templateId: item.templateId, content: content
    }, { timeoutMs: 20000 }).then(function (r) {
      var saved = merge(r.item || item);
      localSaveItem(saved);
      return { item: saved, content: content, source: "server" };
    }).catch(function (e) {
      pendingSet(item.id, { at: M.nowIso(), reason: "create_failed", message: e.message });
      return { item: item, content: content, source: "local", error: e };
    });
  }

  function open(id) {
    var localItem = null;
    localItems().some(function (it) { if (it.id === id) { localItem = it; return true; } return false; });
    var lc = localContent(id);
    var pend = pendingGet(id);

    if (!isSignedIn() || !isOnline()) {
      if (!localItem) return Promise.reject(new Error("このファイルは端末にありません。"));
      return Promise.resolve({ item: localItem, content: lc || M.emptyContent(localItem.itemType),
        source: "local", role: "owner", pending: pend });
    }
    return api("GET", "/api/workplace/item?id=" + encodeURIComponent(id), null, { timeoutMs: 20000 })
      .then(function (r) {
        var item = merge(r.item);
        var content = r.content || M.emptyContent(item.itemType);
        localSaveItem(item);
        /* 端末に未同期の変更が残っていれば、**勝手に上書きしない**。
           どちらを使うかは画面が尋ねる（§10.2）。 */
        var recovery = null;
        if (pend && lc) recovery = { content: lc, at: pend.at, reason: pend.reason };
        else localSaveContent(id, content);
        return { item: item, content: content, source: "server", role: r.role || "owner",
          recovery: recovery };
      })
      .catch(function (e) {
        if (localItem) return { item: localItem, content: lc || M.emptyContent(localItem.itemType),
          source: "local", role: "owner", error: e, pending: pend };
        throw e;
      });
  }

  function meta(id, patch) {
    var localItem = null;
    localItems().some(function (it) { if (it.id === id) { localItem = it; return true; } return false; });
    if (localItem) {
      Object.keys(patch || {}).forEach(function (k) {
        if (k !== "id" && k !== "action") localItem[k] = patch[k];
      });
      if (patch && patch.action === "trash") { localItem.status = "trashed"; localItem.trashedAt = M.nowIso(); }
      if (patch && patch.action === "restore") { localItem.status = "active"; localItem.trashedAt = ""; }
      localItem.updatedAt = M.nowIso();
      localSaveItem(localItem);
    }
    if (patch && patch.action === "purge") localRemoveItem(id);

    if (!isSignedIn() || !isOnline()) return Promise.resolve({ item: localItem, source: "local" });
    var body = { id: id };
    Object.keys(patch || {}).forEach(function (k) { body[k] = patch[k]; });
    return api("POST", "/api/workplace/item/meta", body, { timeoutMs: 15000 })
      .then(function (r) {
        if (r.item) { var it = merge(r.item); localSaveItem(it); return { item: it, source: "server" }; }
        return { item: localItem, source: "server", purged: !!r.purged };
      })
      .catch(function (e) { return { item: localItem, source: "local", error: e }; });
  }

  function duplicate(id) {
    return open(id).then(function (r) {
      return create(r.item.itemType, {
        title: r.item.title + "（コピー）",
        description: r.item.description,
        appearance: r.item.appearance,
        content: M.clone(r.content)
      });
    });
  }

  /* ── 版（§11）。ログインしていない場合は端末に持つ。 ─────────────── */
  function versions(id) {
    if (!isSignedIn() || !isOnline()) {
      var v = lsGet(LS.versions, {});
      return Promise.resolve({ versions: (v[id] || []).map(function (x, i) {
        return { version: x.version, label: x.label || "", createdAt: x.createdAt, size: 0, local: true };
      }).reverse(), source: "local" });
    }
    return api("GET", "/api/workplace/versions?id=" + encodeURIComponent(id), null, { timeoutMs: 15000 })
      .then(function (r) { return { versions: r.versions || [], source: "server" }; })
      .catch(function () { return { versions: [], source: "local" }; });
  }
  function versionContent(id, version) {
    if (!isSignedIn() || !isOnline()) {
      var v = lsGet(LS.versions, {});
      var found = (v[id] || []).filter(function (x) { return x.version === version; })[0];
      return found ? Promise.resolve({ content: found.content })
                   : Promise.reject(new Error("その版は端末にありません。"));
    }
    return api("GET", "/api/workplace/versions?id=" + encodeURIComponent(id) + "&version=" + version,
      null, { timeoutMs: 15000 });
  }
  function localPushVersion(id, content, label) {
    var v = lsGet(LS.versions, {});
    if (!v || typeof v !== "object") v = {};
    var arr = v[id] || [];
    arr.push({ version: arr.length + 1, label: label || "", createdAt: M.nowIso(), content: M.clone(content) });
    if (arr.length > 12) arr = arr.slice(arr.length - 12);
    v[id] = arr;
    lsSet(LS.versions, v);
  }

  /* ══════════════════════════════════════════════════════════════════
     編集セッション — 自動保存の本体
     ══════════════════════════════════════════════════════════════════ */
  function Session(item, content, opts) {
    opts = opts || {};
    this.item = item;
    this.content = content;
    this.state = "clean";
    this.baseVersion = Math.max(1, Number(item.currentVersion) || 1);
    this.lastError = null;
    this.listeners = [];
    this._timer = 0;
    this._inflight = false;
    this._queued = false;
    this._seq = 0;              /* 保存の通し番号。古い応答を捨てるために使う。 */
    this._appliedSeq = 0;
    this._autosave = opts.autosave !== false;
    this._interval = Math.max(400, Number(opts.intervalMs) || AUTOSAVE_MS);
    this._destroyed = false;
    var self = this;
    this._onBeforeUnload = function (e) {
      if (self.state === "dirty" || self.state === "saving" || self._queued) {
        /* 保存できるならその場で送る（ページを閉じるとき／隠れるとき）。 */
        self.flushBeacon();
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    this._onVisibility = function () {
      try {
        if (root.document.visibilityState === "hidden" && (self.state === "dirty" || self._queued))
          self.saveNow({ silent: true });
      } catch (er) {}
    };
    try {
      root.addEventListener("beforeunload", this._onBeforeUnload);
      root.document.addEventListener("visibilitychange", this._onVisibility);
    } catch (e) {}
  }
  Session.prototype.on = function (fn) { this.listeners.push(fn); return this; };
  Session.prototype._emit = function () {
    var self = this;
    this.listeners.forEach(function (fn) { try { fn(self.state, self); } catch (e) {} });
  };
  Session.prototype._set = function (s) {
    if (this.state === s) return;
    this.state = s;
    this._emit();
  };
  /* 内容が変わった。端末へは即時、サーバへは少し待ってからまとめて。 */
  Session.prototype.touch = function () {
    if (this._destroyed) return;
    this.item.updatedAt = M.nowIso();
    this.item.preview = M.buildPreview(this.item.itemType, this.content.content);
    localSaveContent(this.item.id, this.content);
    localSaveItem(this.item);
    this._set("dirty");
    if (!this._autosave) return;
    var self = this;
    if (this._timer) root.clearTimeout(this._timer);
    this._timer = root.setTimeout(function () { self._timer = 0; self.saveNow({ silent: true }); },
      this._interval);
  };
  Session.prototype.setTitle = function (title) {
    this.item.title = String(title || "");
    this.touch();
  };
  Session.prototype.saveNow = function (o) {
    o = o || {};
    if (this._destroyed) return Promise.resolve({ ok: false });
    if (this._timer) { root.clearTimeout(this._timer); this._timer = 0; }
    if (this.state === "conflict" && !o.force) return Promise.resolve({ ok: false, conflict: true });

    /* 走っている保存があるなら、終わってから最新をもう 1 回だけ送る（直列化）。 */
    if (this._inflight) { this._queued = true; return Promise.resolve({ ok: true, queued: true }); }

    localSaveContent(this.item.id, this.content);
    localSaveItem(this.item);

    if (!isSignedIn()) {
      /* ログインしていない。端末保存であることを状態で示す。「保存しました」とは言わない。 */
      if (o.snapshot) localPushVersion(this.item.id, this.content, o.label);
      this._set("offline");
      return Promise.resolve({ ok: true, local: true });
    }
    if (!isOnline()) {
      pendingSet(this.item.id, { at: M.nowIso(), reason: "offline" });
      this._set("offline");
      return Promise.resolve({ ok: true, local: true });
    }

    var self = this;
    var seq = ++this._seq;
    this._inflight = true;
    this._set("saving");

    return api("PUT", "/api/workplace/item", {
      id: this.item.id,
      baseVersion: this.baseVersion,
      title: this.item.title,
      description: this.item.description,
      appearance: this.item.appearance,
      preview: this.item.preview,
      content: this.content,
      snapshot: !!o.snapshot,
      versionLabel: o.label || ""
    }, { timeoutMs: 30000 }).then(function (r) {
      self._inflight = false;
      /* 古い応答は捨てる（§10.1）。 */
      if (seq < self._appliedSeq) return { ok: true, stale: true };
      self._appliedSeq = seq;
      self.baseVersion = Math.max(1, Number(r.version) || self.baseVersion + 1);
      if (r.item) { self.item = merge(r.item); localSaveItem(self.item); }
      pendingSet(self.item.id, null);
      if (self._queued) { self._queued = false; self.saveNow({ silent: true }); }
      else self._set("saved");
      return { ok: true, version: self.baseVersion };
    }).catch(function (e) {
      self._inflight = false;
      self.lastError = e;
      pendingSet(self.item.id, { at: M.nowIso(), reason: e.code === "CONFLICT" ? "conflict" : "failed",
        message: e.message });
      if (e.code === "CONFLICT") {
        self.serverCopy = e.data || null;
        self._set("conflict");
      } else if (!isOnline()) {
        self._set("offline");
      } else {
        self._set("failed");
      }
      return { ok: false, error: e };
    });
  };
  /* ページを閉じる直前。fetch は間に合わないことがあるので sendBeacon を使う。 */
  Session.prototype.flushBeacon = function () {
    try {
      localSaveContent(this.item.id, this.content);
      localSaveItem(this.item);
      if (!isSignedIn() || !isOnline() || !root.navigator || !root.navigator.sendBeacon) return;
      /* sendBeacon は独自ヘッダを付けられないので、認証を本文へ載せた専用の口は作らない。
         ここでは端末保存までを保証し、次に開いたときに復元を尋ねる。 */
      pendingSet(this.item.id, { at: M.nowIso(), reason: "unload" });
    } catch (e) {}
  };
  /* 競合の解決。どちらを残すかは利用者が決める。 */
  Session.prototype.resolveConflict = function (which) {
    if (which === "server" && this.serverCopy && this.serverCopy.content) {
      this.content = this.serverCopy.content;
      this.item = merge(this.serverCopy.item || this.item);
      this.baseVersion = Math.max(1, Number(this.serverCopy.serverVersion) || this.baseVersion);
      localSaveContent(this.item.id, this.content);
      pendingSet(this.item.id, null);
      this._set("saved");
      return Promise.resolve({ ok: true, took: "server" });
    }
    /* 自分の内容で上書きする。サーバの版に合わせてから送り直す。 */
    this.baseVersion = Math.max(this.baseVersion,
      Number(this.serverCopy && this.serverCopy.serverVersion) || this.baseVersion);
    this._set("dirty");
    return this.saveNow({ force: true });
  };
  Session.prototype.destroy = function () {
    this._destroyed = true;
    if (this._timer) root.clearTimeout(this._timer);
    try {
      root.removeEventListener("beforeunload", this._onBeforeUnload);
      root.document.removeEventListener("visibilitychange", this._onVisibility);
    } catch (e) {}
    this.listeners = [];
  };

  function session(item, content, opts) { return new Session(item, content, opts); }

  /* ── 未同期のものをまとめて送る（ログインし直したとき等）───────── */
  function syncPending() {
    if (!isSignedIn() || !isOnline()) return Promise.resolve({ synced: 0, skipped: true });
    var p = pendingAll(), ids = Object.keys(p);
    if (!ids.length) return Promise.resolve({ synced: 0 });
    var done = 0, failed = 0;
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var it = null;
        localItems().some(function (x) { if (x.id === id) { it = x; return true; } return false; });
        var c = localContent(id);
        if (!it || !c) { pendingSet(id, null); return; }
        return api("POST", "/api/workplace/items", {
          id: it.id, itemType: it.itemType, title: it.title, description: it.description,
          appearance: it.appearance, preview: it.preview, content: c
        }).then(function () { done++; pendingSet(id, null); })
          .catch(function (e) {
            if (e.code === "DUPLICATE") {
              return api("PUT", "/api/workplace/item", { id: it.id, title: it.title,
                appearance: it.appearance, preview: it.preview, content: c })
                .then(function () { done++; pendingSet(id, null); })
                .catch(function () { failed++; });
            }
            failed++;
          });
      });
    });
    return chain.then(function () { return { synced: done, failed: failed }; });
  }

  /* ── 表示の好み（一覧の見せ方など）─────────────────────────────── */
  function prefs() {
    var p = lsGet(LS.prefs, {});
    return {
      view: p.view || "card",            /* card | compact | list */
      sort: p.sort || "updated",
      density: p.density || "normal",
      mode: p.mode || "standard",        /* simple | standard | detail（§2.3） */
      autosave: p.autosave !== false,
      autosaveMs: Math.max(400, Number(p.autosaveMs) || AUTOSAVE_MS),
      showSaveState: p.showSaveState !== false,
      confirmDelete: p.confirmDelete !== false,
      trashDays: Math.max(1, Number(p.trashDays) || 30),
      defaultTab: p.defaultTab || "all",
      defaultVisibility: p.defaultVisibility || "private",
      animation: p.animation !== false,
      docs: p.docs || {}, sheets: p.sheets || {}, slides: p.slides || {}, forms: p.forms || {}
    };
  }
  function setPrefs(patch) {
    var cur = lsGet(LS.prefs, {});
    if (!cur || typeof cur !== "object") cur = {};
    Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k]; });
    lsSet(LS.prefs, cur);
    return prefs();
  }

  WP.store = {
    LS: LS,
    isSignedIn: isSignedIn, isOnline: isOnline, ownerId: ownerId, apiBase: apiBase, api: api,
    list: list, create: create, open: open, meta: meta, duplicate: duplicate,
    versions: versions, versionContent: versionContent,
    session: session, Session: Session,
    syncPending: syncPending, pendingAll: pendingAll, pendingSet: pendingSet,
    localItems: localItems, localContent: localContent, localRemoveItem: localRemoveItem,
    prefs: prefs, setPrefs: setPrefs,
    /* 状態の言い方を 1 か所にまとめる。画面ごとに違う言葉を出さない。 */
    stateLabel: function (s, signedIn) {
      if (s === "saving") return "保存中…";
      if (s === "dirty") return "未保存の変更";
      if (s === "failed") return "保存できませんでした";
      if (s === "conflict") return "他の場所で更新されています";
      /* ログインしていないときは、どの状態でも「端末に保存」と言い切る。
         サーバーへ入っていないのに「保存しました」と出さない。 */
      if (signedIn === false) return "この端末に保存";
      if (s === "saved") return "保存しました";
      if (s === "offline") return "オフライン保存済み";
      return "保存済み";
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
