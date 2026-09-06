
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — Quick Chat 新UI（#vqChat）
   ─────────────────────────────────────────────────────────────────────────
   方針: 既存 Quick Chat エンジン（送信/SSEストリーミング/履歴/添付/クォータ/
   認証/プロジェクト）は一切書き換えず、UI だけを新設計に置き換える。
   本UIは Shadow DOM の隔離レイヤーで、実データは
     ・#appChatList の実DOM（ストリーミング中も更新される）を鏡写し
     ・#appChatSessionList / localStorage(app.chat.sessions.v2 / .projects.v1)
     ・#appChatPendingAttachments / #appChatProcessList
   から取得し、操作はすべて実要素を .click() / value+event でブリッジする。

   AIプロバイダ抽象: VQChatProvider（下部）。現行実装は CurrentAIProvider として
   既存DOMブリッジ経由で動く。将来ローカルLLMを足す時はこの一箇所を差し替える。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqChatInstalled) return;
  window.__vqChatInstalled = true;

  /* ── モデルレジストリ（追加はここだけ） ────────────────────────── */
  var MODELS = [
    { id: "standard", label: "Standard", desc: "通常の回答", enabled: true }
  ];
  /* ── 思考レベル（実リクエスト設定へ反映する） ───────────────── */
  var THINK = [
    { id: "fast", label: "速い", desc: "短く速い回答", mode: "normal" },
    { id: "normal", label: "標準", desc: "品質と速度のバランス", mode: "normal" },
    { id: "deep", label: "深い", desc: "長く考えて詳しく", mode: "reason" }
  ];
  var THINK_KEY = "vq.chat.think.v1";     /* { conversationId: levelId } */
  var PIN_KEY = "vq.chat.pins.v1";        /* [sessionId] */
  var PANEL_KEY = "vq.chat.activity.v1";  /* { userClosed: bool } */

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    pin: '<path d="M14 3l7 7-3 1-1 5-4-4-5 5v-3l5-5-4-4 5-1Z"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
    clip: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L10.2 17.9a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'
  };
  /* ストリーミング中の目印。VocabuQuiz ロゴの「絡み合うループ」を簡略化した3連リング */
  var VQMARK =
    '<svg class="vqmark" viewBox="0 0 24 24" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
        '<circle class="r1" cx="12" cy="8.8" r="5.1"/>' +
        '<circle class="r2" cx="8.2" cy="14.4" r="5.1"/>' +
        '<circle class="r3" cx="15.8" cy="14.4" r="5.1"/>' +
      '</g></svg>';
  function svg(n, cls) { return '<svg viewBox="0 0 24 24" ' + P + (cls ? ' class="' + cls + '"' : '') + '>' + (ICON[n] || '') + '</svg>'; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function $(id) { return document.getElementById(id); }
  function lsGet(k, fb) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? fb : v; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ══ AIプロバイダ抽象（将来ローカルLLMを足す差し替え点） ══════════
     現在は既存 Quick Chat エンジンを DOM 経由で駆動する CurrentAIProvider。
     将来 LocalAIProvider を足す場合は同じインターフェースを実装して
     VQChatProvider を差し替えるだけでUIは無改造で動く。 */
  var CurrentAIProvider = {
    id: "current",
    getModels: function () { return MODELS.filter(function (m) { return m.enabled; }); },
    getCapabilities: function () {
      return { streaming: true, attachments: true, stop: true, thinkingLevels: THINK.map(function (t) { return t.id; }) };
    },
    /* 思考レベル → 実リクエスト設定（既存の AI モード）へ反映 */
    applyThinking: function (levelId) {
      var lv = THINK.filter(function (t) { return t.id === levelId; })[0] || THINK[1];
      var menu = $("appChatModeMenu");
      if (!menu) return false;
      var want = lv.mode;                       /* "normal" | "reason" */
      var row = menu.querySelector('[data-chat-mode="' + want + '"],[data-chat-ids="' + want + '"],[data-mode="' + want + '"]');
      if (!row) {
        /* ラベル一致でフォールバック（Standard / Deepthink 等） */
        var rows = menu.querySelectorAll("[data-chat-action]");
        for (var i = 0; i < rows.length; i++) {
          var t = (rows[i].textContent || "").toLowerCase();
          if (want === "reason" && /deep|reason|思考/.test(t)) { row = rows[i]; break; }
          if (want === "normal" && /standard|標準/.test(t)) { row = rows[i]; break; }
        }
      }
      if (row) { row.click(); return true; }
      return false;
    },
    sendMessage: function (text) {
      var input = $("appChatInput"), btn = $("appChatSendBtn");
      if (!input || !btn) return false;
      try {
        var d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
        if (d && d.set) d.set.call(input, text); else input.value = text;
      } catch (e) { input.value = text; }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      btn.click();
      return true;
    },
    cancelGeneration: function () { var b = $("appChatStopBtn"); if (b) { b.click(); return true; } return false; },
    uploadAttachment: function (files) {
      var fi = $("appChatFileInput"); if (!fi) return false;
      try {
        var dt = new DataTransfer();
        for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch (e) { return false; }
    },
    openFilePicker: function () { var fi = $("appChatFileInput"); if (fi) fi.click(); },
    isBusy: function () {
      var stop = $("appChatStopBtn");
      return !!(stop && getComputedStyle(stop).display !== "none" && !stop.classList.contains("hidden"));
    }
  };
  /* ══ LocalAIProvider（VocabuQuiz Local AI Bridge 経由の完全ローカル推論） ══
     ・Bridge は 127.0.0.1 のみ・ペアリング由来の Bearer トークン必須。
     ・SSE の activity / token / usage / citation / completed / error を
       第2段階の Document Engine の Activity へそのまま流す。
     ・llama.cpp / ollama / モデル名など固有の情報は UI へ出さない（Standard 表記のみ）。 */
  var BRIDGE_KEY = "vq.chat.localai.v1";   /* {url, token, expiresAt} */
  var LocalAIProvider = {
    id: "local",
    _abort: null,
    conf: function () {
      var c = lsGet(BRIDGE_KEY, null) || {};
      /* ── ?bridge=... で Bridge の場所を教える ───────────────────
         開発用デプロイ（https://vocabuquiz-api-dev...workers.dev）から開くと、
         配信元は Cloudflare なので「ページの出どころ＝Mac」の関係が使えない。
         既定の 127.0.0.1 はスマホ自身を指すため永久に届かない。
         そこで一度だけ URL で教えられるようにし、以後は端末に覚えさせる。

         受け付けるのは **私有IP / localhost / .local だけ**。
         任意のホストを受けると、細工した URL を踏ませて
         別のサーバへ資料を送らせることができてしまう。 */
      try {
        var q = new URLSearchParams(location.search).get("bridge");
        if (q) {
          var u = new URL(q);
          var h = u.hostname;
          var ok = h === "localhost" || h === "127.0.0.1" || /\.local$/i.test(h)
            || /^192\.168\./.test(h) || /^10\./.test(h)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
          if (ok && (u.protocol === "https:" || u.protocol === "http:")) {
            var url = u.origin;
            if (c.url !== url) { c.url = url; lsSet(BRIDGE_KEY, c); }
          }
        }
      } catch (e) { /* 壊れた指定は黙って無視（既定へ落とす） */ }

      /* トンネルの URL（*.trycloudflare.com など）。
         これは **利用者が設定画面で自分の手で貼ったときだけ** 使う。
         ?bridge= のような URL 経由では受け付けない
         （細工した URL を踏ませて別サーバへ送らせる手を防ぐ）。
         外向けの Bridge は VocabuQuiz の token で本人確認する作りなので、
         万一おかしな URL でも、資料や推論は流れない（読み上げの 4 経路だけ）。 */
      if (!c.url && c.tunnel) {
        try {
          var tu = new URL(c.tunnel);
          if (tu.protocol === "https:") c.url = tu.origin;
        } catch (e) {}
      }
      return c;
    },
    /* Bridge を探すホスト。

       ページが 127.0.0.1 / localhost で開かれているなら従来どおり自分自身。
       **LAN の私有IP（192.168.x.x など）で開かれているときは、そのホスト**を見る。
       スマホから http://<MacのIP>:8791 を開いた場合、127.0.0.1 は
       「スマホ自身」を指すため Bridge へ永久に届かない（実測で確認）。
       ページの配信元＝Bridge が動いている Mac、という関係を使う。

       https のページからは私有IPへ繋げない（混在コンテンツ）ので、
       ここが効くのは http で配信しているときだけ。 */
    _hosts: function () {
      var out = ["127.0.0.1"];
      try {
        var h = String(location.hostname || "").trim();
        var isPrivate = /^192\.168\./.test(h) || /^10\./.test(h)
          || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/i.test(h);
        /* スマホから開いたときは、その端末から見える Mac の住所を使う。
           https で開いているときも同じ（Bridge 側も TLS で受ける）。 */
        if (isPrivate) out.unshift(h);
      } catch (e) {}
      return out;
    },
    /* ページが https なら Bridge も https で呼ぶ。
       混ぜるとブラウザが混在コンテンツとして遮断し、ローカル AI が丸ごと使えなくなる。
       （ループバックだけは例外扱いなので、下の discover で http も試す） */
    _schemeFor: function (host) {
      try { return location.protocol === "https:" ? "https" : "http"; }
      catch (e) { return "http"; }
    },
    _scheme: function () { return this._schemeFor(this._hosts()[0]); },
    url: function () {
      var h = this._hosts()[0];
      return (this.conf().url) || (this._schemeFor(h) + "://" + h + ":17891");
    },
    /* Bridge のポートは競合時に自動で繰り上がるため 17891..17895 を探索して記憶する */
    discover: async function () {
      var c = this.conf();
      var cands = [];
      if (c.url) cands.push(c.url);
      var hosts = this._hosts();
      for (var hi = 0; hi < hosts.length; hi++) {
        var sch = this._schemeFor(hosts[hi]);
        for (var p2 = 17891; p2 <= 17895; p2++) {
          var u = sch + "://" + hosts[hi] + ":" + p2;
          if (cands.indexOf(u) < 0) cands.push(u);
        }
      }
      /* ループバック（この端末の中）は、**両方の話し方**を必ず試す。

         Bridge は素の http で立つことも、TLS を張って https で立つこともある。
         片方しか試さないと、立っているのに「見つからない」で終わる。
         127.0.0.1 と localhost は「安全な出どころ」として扱われる決まりなので、
         https のページからでも http で呼べる（混在コンテンツにならない）。
         これが無いと、開発版サイト（https）から手元の Bridge へ永久に届かない。

         TLS で立てているときは証明書を信用させる手間が要るので、
         Bridge 側が **+100 番のポートで素の http も開く**。そこも見に行く。
         ＊Safari だけはこの例外を認めないため、Safari では届かない。 */
      for (var p3 = 17891; p3 <= 17895; p3++) {
        var loop = ["http://127.0.0.1:" + (p3 + 100),
                    "http://127.0.0.1:" + p3,
                    "https://127.0.0.1:" + p3];
        for (var li = 0; li < loop.length; li++)
          if (cands.indexOf(loop[li]) < 0) cands.push(loop[li]);
      }
      for (var i = 0; i < cands.length; i++) {
        try {
          var r = await fetch(cands[i] + "/health", { signal: AbortSignal.timeout(1200) });
          if (r.ok) {
            try { var hj = await r.json(); this._open = !!hj.open; } catch (e) {}
            if (c.url !== cands[i]) { c.url = cands[i]; lsSet(BRIDGE_KEY, c); }
            return cands[i];
          }
        } catch (e) {}
      }
      return null;
    },
    token: function () { return this.conf().token || ""; },
    _open: false,
    /* OPEN モード(パスワードなし)の Bridge ではトークン不要 */
    isPaired: function () { if (this._open) return true; var c = this.conf(); return !!(c.token && (!c.expiresAt || c.expiresAt > Date.now())); },
    isAvailable: async function () {
      try {
        var r = await fetch(this.url() + "/health", { signal: AbortSignal.timeout(2500) });
        if (!r.ok) return { ok: false, error: "BRIDGE_HTTP_" + r.status };
        var j = await r.json();
        this._open = !!j.open;
        return { ok: true, engine: j.engine, open: this._open, paired: this.isPaired() };
      } catch (e) { return { ok: false, error: "BRIDGE_UNREACHABLE" }; }
    },
    pair: async function (code) {
      var r = await fetch(this.url() + "/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: String(code || "").replace(/\D/g, "") })
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.token) return { ok: false, error: j.error || "PAIR_FAILED" };
      lsSet(BRIDGE_KEY, { url: this.url(), token: j.token, expiresAt: j.expiresAt });
      return { ok: true };
    },
    unpair: function () { lsSet(BRIDGE_KEY, {}); },
    _get: async function (path) {
      var r = await fetch(this.url() + path, { headers: { Authorization: "Bearer " + this.token() } });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    getCapabilities: function () { return this._get("/capabilities"); },
    getModels: function () { return this._get("/models"); },
    getHealth: function () { return this._get("/status"); },
    getResourceUsage: async function () { var s2 = await this._get("/status"); return s2.resources; },
    startModel: function (id) { return fetch(this.url() + "/models/start", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.token() }, body: JSON.stringify({ id: id }) }); },
    stopModel: function (id) { return fetch(this.url() + "/models/stop", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.token() }, body: JSON.stringify({ id: id }) }); },
    _jobId: "",
    /* いま走っている送信。Quick Mock は大問を並列で作るので複数になりうる。
       1つの _abort を使い回していたときは、2本目が1本目の停止ハンドルを
       上書きして、止めたつもりの処理が止まらなかった。 */
    _active: [],
    _track: function (h) { this._active.push(h); },
    _untrack: function (h) {
      var i = this._active.indexOf(h);
      if (i >= 0) this._active.splice(i, 1);
      if (this._jobId === h.jobId) this._jobId = "";
    },
    /* 停止は「今の生成」だけでなく Orchestration Job 全体（検証・修正・整形）を止める。
       走っているものは全部止める（1本だけ残ると画面は止まったのに裏で動き続ける）。 */
    cancelGeneration: function () {
      var self = this;
      this._active.slice().forEach(function (h) {
        if (h.jobId) {
          try {
            fetch(self.url() + "/chat/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + self.token() },
              body: JSON.stringify({ jobId: h.jobId })
            }).catch(function () {});
          } catch (e) {}
        }
        if (h.abort) { try { h.abort.abort(); } catch (e) {} }
      });
      this._cancelled = true;
      if (window.__vqQueue) { try { window.__vqQueue.clear(); } catch (e) {} }
      return true;
    },
    /* 再読み込み後に処理中 Job を取り直す。存在しなければ null（永遠に処理中にしない）。 */
    getJob: async function (jobId) {
      try {
        var r = await fetch(this.url() + "/jobs/" + encodeURIComponent(jobId), { headers: { Authorization: "Bearer " + this.token() } });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    },
    /* 本物のトークンストリーム。onToken/onActivity は呼び出し側が渡す。 */
    /* 時間のかかる生成だけ、アプリ内の札で知らせる。
       ふつうの会話は目の前に出ているので札は出さない（うるさいだけ）。 */
    _notifyLabel: function (req) {
      var o = (req && req.options) || {};
      if (o.workspaceTask === "ai_grading") return { run: "記述を採点しています", ok: "採点が終わりました" };
      if (o.workspaceTask) return { run: "AIが処理しています", ok: "処理が終わりました" };
      if (o.structuredOutput === "mock") return { run: "試験を作っています", ok: "試験ができました" };
      if (o.structuredOutput === "preset") return { run: "問題を作っています", ok: "問題ができました" };
      return null;
    },
    /* いま使っている人の ID。Bridge はこれを短いハッシュにしてから記録する。
       ログを「誰の依頼が重いか」で束ねるためだけに使う。取れなければ空でよい。 */
    _ownerId: function () {
      try {
        if (window.VQ2 && VQ2.store && VQ2.store.currentOwnerId) return String(VQ2.store.currentOwnerId() || "");
      } catch (e) {}
      try {
        var p = JSON.parse(window.localStorage.getItem("app.auth.profile.v1") || "null");
        return String((p && (p.uid || p.userId || p.id || p.username)) || "");
      } catch (e) {}
      return "";
    },
    streamMessage: async function (req, on) {
      var F = window.__vqChatFiles;
      var N = window.__vqNotify;
      var nkey = "gen:" + ((req && req.requestId) || Date.now());
      var nlabel = this._notifyLabel(req);
      var self = this;
      var notified = false;
      var announce = function (ok, label) {
        if (!N || !nlabel || !notified) return;
        notified = false; self._notifyKey = "";
        try { N.done(nkey, { ok: ok, label: label }); } catch (e) {}
      };
      this._cancelled = false;
      /* この送信ぶんの停止ハンドル。共有しない（並列で潰し合うため）。 */
      var handle = { abort: new AbortController(), jobId: "" };
      this._track(handle);
      this._abort = handle.abort;
      try {
        /* 順番待ちの優先度はプランで決まる。対応表は Bridge 側（config）が持つ。
           Bridge は 127.0.0.1 の自分専用なので、ここで名乗るだけでよい。 */
        var payload = req;
        try {
          payload = Object.assign({}, req, {
            plan: window.__vqPlanId || "free",
            /* 誰の依頼が重いのかを Bridge 側でまとめるための印。
               Bridge はこれを受け取ったらすぐ短いハッシュにして、
               生の ID はログへ書かない（メールアドレスのこともあるため）。 */
            ownerId: this._ownerId()
          });
        } catch (e) {}
        var res = await fetch(this.url() + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.token() },
          body: JSON.stringify(payload), signal: handle.abort.signal
        });
        if (!res.ok || !res.body) {
          if (window.__vqQueue) { try { window.__vqQueue.clear(); } catch (e) {} }
          throw new Error("BRIDGE_" + res.status);
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", ev = "", data = "";
        while (true) {
          var c = await reader.read();
          if (c.done) break;
          buf += dec.decode(c.value, { stream: true });
          var lines = buf.split("\n"); buf = lines.pop() || "";
          for (var i = 0; i < lines.length; i++) {
            var L = lines[i];
            if (L.indexOf("event: ") === 0) { ev = L.slice(7).trim(); continue; }
            if (L.indexOf("data: ") === 0) { data = L.slice(6); continue; }
            if (L === "") {
              if (!ev) continue;
              var j = null; try { j = JSON.parse(data); } catch (e) {}
              if (j) {
                if (ev === "meta" && j.jobId) { this._jobId = j.jobId; handle.jobId = j.jobId; }
                /* 順番待ちの表示は3画面共通。ここが唯一の入口なので、ここだけで拾う。 */
                if (ev === "activity" && window.__vqQueue) { try { window.__vqQueue.note(j); } catch (e) {} }
                /* 札を出すのは順番待ちを抜けてから。待っている間は入力欄の帯が担当する。 */
                if (ev === "activity" && j.type !== "queue.wait" && N && nlabel && !notified) {
                  notified = true; self._notifyKey = nkey;
                  try { N.start(nkey, { label: nlabel.run }); } catch (e) {}
                }
                if (ev === "error") announce(false, "作れませんでした");
                if (ev === "activity" && F) {
                  /* 同じ種類の running を上書きする（running→completed で2行に増やさない） */
                  var patch = { label: j.label, status: j.status, detail: j.detail || "" };
                  if (j.current != null) patch.current = j.current;
                  if (j.total != null) patch.total = j.total;
                  var evs = F.events(), prev = null;
                  for (var q = evs.length - 1; q >= 0; q--)
                    if (evs[q].type === j.type && evs[q].status === "running") { prev = evs[q]; break; }
                  if (prev) F.update(prev, patch); else F.emit(j.type, patch);
                }
                if (on) on(ev, j);
              }
              ev = ""; data = "";
            }
          }
        }
        announce(true, nlabel && nlabel.ok);
        return true;
      } catch (e) {
        announce(false, this._cancelled ? "停止しました" : "作れませんでした");
        throw e;
      } finally {
        /* 完了済みの Job を後から停止しに行かない */
        this._untrack(handle);
        if (window.__vqQueue) { try { window.__vqQueue.clear(); } catch (x) {} }
      }
    }
  };
  window.__vqLocalAI = LocalAIProvider;
  /* 設定画面から、トンネルの URL を覚えさせる／消す口。 */
  window.__vqBridgeSetTunnel = function (url) {
    try {
      var c = lsGet(BRIDGE_KEY, null) || {};
      if (!url) { delete c.tunnel; delete c.url; }
      else {
        var u = new URL(String(url).trim());
        if (u.protocol !== "https:") return { ok: false, error: "https の URL を貼ってください。" };
        c.tunnel = u.origin; c.url = u.origin;
      }
      lsSet(BRIDGE_KEY, c);
      return { ok: true, url: c.url || "" };
    } catch (e) { return { ok: false, error: "URL の形になっていません。" }; }
  };
  window.__vqBridgeGetTunnel = function () {
    try { return (lsGet(BRIDGE_KEY, null) || {}).tunnel || ""; } catch (e) { return ""; }
  };

  var VQChatProvider = CurrentAIProvider;

  /* ══ 実DOMからの読み取り（鏡写し） ══════════════════════════════ */
  /* ローカル会話は conversationId で厳密に分離する（他会話の配列を絶対に混ぜない） */
  function localMsgs(cid) {
    var id = cid || activeSessionId() || "__new__";
    if (!st.local.byConv[id]) st.local.byConv[id] = loadLocalConv(id);
    return st.local.byConv[id];
  }
  var LCONV_KEY = "vq.chat.localconv.v1";
  var JOB_KEY = "vq.chat.job.v1";          /* 再読み込み後に処理中 Job を取り直すための最小情報 */
  /* 再読み込み時：Bridge に Job の実状態を聞く。存在しない Job を「処理中」と表示しない。 */
  async function restoreJob() {
    var raw = null;
    try { raw = JSON.parse(sessionStorage.getItem(JOB_KEY) || "null"); } catch (e) {}
    if (!raw || !raw.jobId) return;
    if (Date.now() - (raw.at || 0) > 30 * 60 * 1000) { try { sessionStorage.removeItem(JOB_KEY); } catch (e) {} return; }
    var L = window.__vqLocalAI; if (!L) return;
    await L.discover();
    var j = await L.getJob(raw.jobId);
    try { sessionStorage.removeItem(JOB_KEY); } catch (e) {}
    if (!j) return;                                   /* 404 = もう存在しない。何も出さない。 */
    if (j.status === "cancelled") st.err = "前回の生成は停止されました。";
    else if (j.status === "failed") st.err = "前回の生成は完了できませんでした。";
    else if (j.status !== "completed") st.err = "前回の処理はページを離れたため中断されました。もう一度送信してください。";
    st.lastMsgSig = ""; renderThread();
  }
  function loadLocalConv(id) {
    var all = lsGet(LCONV_KEY, {});
    return Array.isArray(all[id]) ? all[id] : [];
  }
  /* 「新しいチャット」を押した直後に送ると、本体がセッションを作り終える前に
     送信されることがある。その場合ローカル会話が旧IDのまま残り、画面には
     新IDの空スレッドが出て回答が消えたように見える。生成完了時にIDを付け替える。 */
  function rekeyLocalConv(from, to) {
    if (!from || !to || from === to) return false;
    var arr = st.local.byConv[from];
    if (!arr || !arr.length) return false;
    var dest = st.local.byConv[to] || loadLocalConv(to);
    if (dest && dest.length) return false;            /* 既に中身がある会話へは移さない */
    st.local.byConv[to] = arr;
    delete st.local.byConv[from];
    var all = lsGet(LCONV_KEY, {});
    delete all[from];
    lsSet(LCONV_KEY, all);
    saveLocalConv(to);
    var tmap = lsGet(TITLE_KEY, {});
    if (tmap[from] && !tmap[to]) { tmap[to] = tmap[from]; delete tmap[from]; lsSet(TITLE_KEY, tmap); }
    return true;
  }
  function saveLocalConv(id) {
    var all = lsGet(LCONV_KEY, {});
    all[id] = (st.local.byConv[id] || []).map(function (m) { return { id: m.id, role: m.role, text: m.text, status: m.status || "done" }; });
    lsSet(LCONV_KEY, all);
  }

  /* ── 送信した添付を会話に残す ──────────────────────────────────
     添付は送信すると入力欄から消える（F.clear）ので、そのままだと
     「何を渡したか」が履歴のどこにも残らない。
     発言の番号で対応づけると、以前からある会話では番号がずれる
     （控えの 1 件目が、その会話の最初の発言に付いてしまう）。
     なので発言そのものの ID で結びつける。 */
  var MFILES_KEY = "vq.chat.msgfiles.v2";
  var MF_MAX_CONV = 60, MF_MAX_PER_MSG = 12, MF_THUMB_MAX = 24000;
  function mfAll() { var v = lsGet(MFILES_KEY, {}); return (v && typeof v === "object") ? v : {}; }
  function mfConvId() { return activeSessionId() || "__new__"; }
  function mfMap(cid) { var m = mfAll()[cid]; return (m && typeof m === "object" && !Array.isArray(m)) ? m : {}; }
  function mfMeta(files) {
    return (files || []).slice(0, MF_MAX_PER_MSG).map(function (f) {
      var thumb = (f.thumb && String(f.thumb).length <= MF_THUMB_MAX) ? f.thumb : "";
      return { name: String(f.name || "ファイル").slice(0, 120), kind: f.kind || "file",
               size: Number(f.size) || 0, thumb: thumb,
               pageCount: f.pageCount || null, lineCount: f.lineCount || null,
               width: f.width || null, height: f.height || null, fileCount: f.fileCount != null ? f.fileCount : null };
    });
  }
  function mfSet(cid, msgId, files) {
    if (!msgId) return;
    var all = mfAll();
    var m = (all[cid] && typeof all[cid] === "object" && !Array.isArray(all[cid])) ? all[cid] : {};
    m[msgId] = files;
    var ks = Object.keys(m);
    if (ks.length > MF_MAX_CONV) ks.slice(0, ks.length - MF_MAX_CONV).forEach(function (k) { delete m[k]; });
    all[cid] = m;
    lsSet(MFILES_KEY, all);
  }
  /* 会話IDが後から確定したとき（新規チャット）、__new__ 側を引き継ぐ */
  function mfRekey(from, to) {
    if (!from || !to || from === to) return;
    var all = mfAll();
    var src = all[from];
    if (!src || !Object.keys(src).length) return;
    var dst = all[to];
    if (dst && Object.keys(dst).length) return;
    all[to] = src; delete all[from]; lsSet(MFILES_KEY, all);
  }
  function mfClear(cid) { var all = mfAll(); if (all[cid]) { delete all[cid]; lsSet(MFILES_KEY, all); } }
  /* 画面に出すときは資料の中身を落とす。
     利用者が書いたのは [添付資料] より前だけ。ここを出すと、PDF を付けただけで
     自分の吹き出しに全文が流れてしまう（何を送ったかは添付の札で分かる）。 */
  var CTX_MARK = "[添付資料]";
  function stripCtx(s) {
    s = String(s == null ? "" : s);
    var i = s.indexOf(CTX_MARK);
    if (i < 0) return s;
    /* 目印より前が利用者の文。DOM から読むと空白が詰められることがあるので
       改行の有無に頼らず、目印そのものの位置で切る。 */
    return s.slice(0, i).replace(/\s+$/, "");
  }
  function readMessages() {
    var lm = localMsgs();
    if (lm.length) return lm.map(function (m) {
      var t = m.role === "user" ? stripCtx(m.text) : m.text;
      return { id: m.id, role: m.role, html: m.html || mdLite(t), text: t };
    });
    var list = $("appChatList"); if (!list) return [];
    var rows = list.querySelectorAll(".app-chat-msg"), out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var role = r.classList.contains("is-user") ? "user" : r.classList.contains("is-typing") ? "typing" : "ai";
      if (r.classList.contains("is-welcome")) continue;          /* 旧ウェルカムは新UIでは出さない */
      var bubble = r.querySelector(".app-chat-bubble");
      var btext = bubble ? (bubble.textContent || "").trim() : "";
      /* クラウド経路は資料を本文へ足して送るので、表示のときに落とす */
      var shown = role === "user" ? stripCtx(btext) : btext;
      out.push({
        id: r.getAttribute("data-chat-msg-id") || ("i" + i),
        role: role,
        html: (role === "user" && shown !== btext) ? esc(shown) : (bubble ? bubble.innerHTML : ""),
        text: shown
      });
    }
    return out;
  }
  function readSessions() {
    var list = lsGet("app.chat.sessions.v2", []);
    if (!Array.isArray(list)) list = [];
    return list.map(function (s) {
      var id = String(s && s.id || "");
      var ts = Number(s && (s.updatedAt || s.lastMessageAt || s.createdAt || s.ts)) || 0;
      if (!ts) {
        var blob = lsGet("app.chat.ses." + id + ".v2", null);
        var msgs = blob && (blob.chats || blob.history || blob.messages);
        if (Array.isArray(msgs) && msgs.length) ts = Number(msgs[msgs.length - 1].ts) || 0;
      }
      var tmap = lsGet("vq.chat.titles.v1", {});
      var title = tmap[id] || String(s && s.title || "新しいチャット");
      return { id: id, title: title, projectId: String(s && s.projectId || ""), ts: ts };
    }).filter(function (s) { return !!s.id; });
  }
  function readProjects() {
    var list = lsGet("app.chat.projects.v1", []);
    return Array.isArray(list) ? list.map(function (p) { return { id: String(p.id || ""), name: String(p.name || "プロジェクト") }; }) : [];
  }
  function activeSessionId() {
    var el = document.querySelector("#appChatSessionList .app-chat-session-item.is-active");
    return el ? el.getAttribute("data-chat-ids") || "" : "";
  }
  function readPending() {
    var host = $("appChatPendingAttachments");
    if (!host || host.classList.contains("hidden")) return [];
    var nodes = host.children, out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var name = (n.querySelector(".app-chat-attachment-name, .name, strong") || {}).textContent;
      var sub = (n.querySelector(".app-chat-attachment-sub, .sub, .note, small") || {}).textContent;
      out.push({ i: i, name: (name || n.textContent || "ファイル").trim().slice(0, 60), sub: (sub || "").trim(), node: n });
    }
    return out;
  }
  /* 実 process panel から「アクティビティ」を読む（AIの生の思考は含まれない・実行済み処理のみ） */
  function readActivity() {
    var listEl = $("appChatProcessList"), out = [];
    if (listEl) {
      var cards = listEl.querySelectorAll(".app-chat-process-card, .app-chat-process-line, li, .app-chat-process-item");
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var label = (c.querySelector(".app-chat-process-card-title, .title, strong") || c).textContent || "";
        label = label.replace(/\s+/g, " ").trim();
        if (!label) continue;
        var st = c.className.indexOf("is-done") >= 0 || c.getAttribute("data-status") === "done" ? "done"
          : c.className.indexOf("is-active") >= 0 || c.getAttribute("data-status") === "active" ? "active" : "pending";
        out.push({ label: label.slice(0, 120), status: st });
      }
    }
    var el = $("appChatProcessElapsed");
    var elapsed = el ? (el.textContent || "").trim() : "";
    var stEl = $("appChatProcessStatus");
    return { items: out, elapsed: elapsed, status: stEl ? (stEl.textContent || "").trim() : "" };
  }

  /* ══ CSS ══════════════════════════════════════════════════════════ */
  var CSS =
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    ":host{--vqc-bg:var(--vq-surface,#fff);--vqc-text:var(--vq-text,#17161C);--vqc-text2:var(--vq-text-secondary,#5A5568);--vqc-text3:var(--vq-text-secondary,#8E8A9B);--vqc-line:var(--vq-border-subtle,#EAE8F0);" +
      "--vqc-user:var(--vq-surface-sunken,#F3F2F6);--vqc-accent:var(--vq-accent,#756DB3);--vqc-accent-soft:var(--vq-accent-subtle,#EFEBFA);--vqc-danger:var(--vq-danger-text,#C1445F);--vqc-ok:var(--vq-success-text,#3E8E5F);" +
      "--vqc-r:calc(14px * var(--vq-r-scale,1));font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--vqc-text);}" +
    "@keyframes vq-shimmer{from{background-position:200% 0;}to{background-position:-200% 0;}}" +
    "@keyframes vqc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    ".root{position:absolute;inset:0;display:flex;background:var(--vqc-bg);overflow:hidden;}" +
    /* ── 左サイドバー ── */
    ".side{width:268px;flex:0 0 auto;display:flex;flex-direction:column;border-right:1px solid var(--vqc-line);background:var(--vq-surface-hover,#FBFAFD);min-height:0;}" +
    ".side__h{display:flex;align-items:center;gap:8px;padding:14px 14px 10px;}" +
    ".side__t{font-size:14.5px;font-weight:750;letter-spacing:-.01em;flex:1 1 auto;}" +
    ".sbtn{width:32px;height:32px;border:0;background:none;border-radius:calc(9px * var(--vq-r-scale,1));cursor:pointer;display:grid;place-items:center;color:var(--vqc-text2);flex:0 0 auto;}" +
    ".sbtn:hover{background:var(--vq-surface-sunken,#F0EDF7);color:var(--vqc-text);}.sbtn svg{width:18px;height:18px;}" +
    ".nav{display:flex;flex-direction:column;gap:1px;padding:0 8px 6px;}" +
    ".nav button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:none;border-radius:calc(9px * var(--vq-r-scale,1));" +
      "cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:560;color:var(--vqc-text);text-align:left;}" +
    ".nav button:hover{background:var(--vq-surface-sunken,#F0EDF7);}.nav button svg{width:17px;height:17px;flex:0 0 auto;color:var(--vqc-text2);}" +
    ".nav .kb{margin-left:auto;font-size:10.5px;color:var(--vqc-text3);font-weight:650;}" +
    ".slist{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 8px 16px;}" +
    ".ghead{padding:14px 8px 5px;font-size:11px;font-weight:750;letter-spacing:.04em;color:var(--vqc-text3);}" +
    ".srow{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;background:none;border-radius:calc(9px * var(--vq-r-scale,1));cursor:pointer;" +
      "font-family:inherit;font-size:13px;font-weight:520;color:var(--vqc-text);text-align:left;position:relative;}" +
    ".srow:hover{background:var(--vq-surface-sunken,#F0EDF7);}.srow.on{background:var(--vqc-accent-soft);color:var(--vq-accent-text,#5A5296);font-weight:680;}" +
    /* プロジェクト行のアイコン。大きさを決めないと既定サイズまで膨らむ。 */
    ".srow > svg{width:16px;height:16px;flex:0 0 auto;color:var(--vqc-text3);}" +
    ".srow__t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".srow__m{width:24px;height:24px;flex:0 0 auto;border:0;background:none;border-radius:calc(7px * var(--vq-r-scale,1));display:none;place-items:center;color:var(--vqc-text3);cursor:pointer;}" +
    ".srow:hover .srow__m,.srow.on .srow__m{display:grid;}.srow__m:hover{background:#E6E1F2;color:var(--vqc-text);}.srow__m svg{width:15px;height:15px;}" +
    ".sempty{padding:14px 10px;font-size:12px;color:var(--vqc-text3);}" +
    /* ── メイン ── */
    ".main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;position:relative;}" +
    ".top{display:flex;align-items:center;gap:8px;padding:10px 14px;flex:0 0 auto;}" +
    ".top__t{font-size:13.5px;font-weight:700;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vqc-text2);}" +
    ".scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}" +
    ".thread{max-width:900px;margin:0 auto;padding:8px 24px 26px;display:flex;flex-direction:column;gap:22px;}" +
    /* 表とコードだけワイド化（本文は900pxのまま・全体は伸ばさない） */
    ".msg.ai .b pre,.msg.ai .b table{max-width:min(1120px,calc(100vw - 96px));width:max-content;min-width:100%;}" +
    "@media (max-width:900px){.msg.ai .b pre,.msg.ai .b table{max-width:100%;}}" +
    ".msg.ai .b{overflow-wrap:anywhere;}" +
    /* 初期（中央）状態 */
    ".hero{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:22px;}" +
    /* 色を直書きしない。#000 だとダークのとき地色に埋もれて読めなかった
       （2026-08-13 報告）。--vq-text は :root で明暗が切り替わり、
       影の DOM にも降りてくる（明 #454151 / 暗 #F5F2FA）。 */
    ".hero__t{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--vq-text,#2B2836);}" +
    ".hero .composer{width:min(900px,100%);}" +
    /* メッセージ */
    ".msg{animation:vqc-in .18s ease;}" +
    ".msg.user{display:flex;justify-content:flex-end;}" +
    ".msg.user .b{max-width:78%;background:var(--vqc-user);border-radius:calc(16px * var(--vq-r-scale,1));padding:11px 15px;font-size:15px;line-height:1.75;white-space:pre-wrap;word-break:break-word;}" +
    ".msg.ai .b{font-size:15.5px;line-height:1.9;word-break:break-word;}" +
    ".msg.ai .b p{margin:0 0 1em;}.msg.ai .b p:last-child{margin-bottom:0;}" +
    ".msg.ai .b h1,.msg.ai .b h2,.msg.ai .b h3{font-weight:750;letter-spacing:-.01em;margin:1.4em 0 .5em;line-height:1.5;}" +
    ".msg.ai .b h1{font-size:20px;}.msg.ai .b h2{font-size:18px;}.msg.ai .b h3{font-size:16px;}" +
    ".msg.ai .b ul,.msg.ai .b ol{margin:0 0 1em 1.3em;}.msg.ai .b li{margin:.3em 0;}" +
    ".msg.ai .b pre{background:var(--vq-bg-canvas,#F7F6FA);border:1px solid var(--vqc-line);border-radius:calc(12px * var(--vq-r-scale,1));padding:13px 15px;overflow-x:auto;margin:0 0 1em;font-size:13px;line-height:1.65;}" +
    ".msg.ai .b code{font-family:'SF Mono',Consolas,monospace;font-size:.92em;}" +
    ".msg.ai .b :not(pre)>code{background:var(--vq-surface-sunken,#F2F0F7);border-radius:calc(5px * var(--vq-r-scale,1));padding:1px 5px;}" +
    ".msg.ai .b table{border-collapse:collapse;width:100%;margin:0 0 1em;font-size:13.5px;display:block;overflow-x:auto;}" +
    ".msg.ai .b th,.msg.ai .b td{border:1px solid var(--vqc-line);padding:7px 10px;text-align:left;}" +
    ".msg.ai .b th{background:var(--vq-bg-canvas,#F7F6FA);font-weight:700;white-space:nowrap;}" +
    ".msg.ai .b td{vertical-align:top;}" +
    ".msg.ai .b tbody tr:nth-child(even){background:var(--vq-surface-hover,#FBFAFD);}" +
    ".msg.ai .b strong{font-weight:750;color:var(--vq-text,#0F0E14);}" +
    ".msg.ai .b em{font-style:normal;background:linear-gradient(transparent 62%,var(--vq-accent-subtle,#EFE9FF) 62%);}" +
    ".msg.ai .b hr{border:0;border-top:1px solid var(--vqc-line);margin:1.4em 0;}" +
    ".msg.ai .b ol{margin:0 0 1em 1.4em;}" +
    ".msg.ai .b del{color:var(--vqc-text3);}" +

    ".msg.ai .b blockquote{border-left:3px solid var(--vqc-line);padding-left:14px;color:var(--vqc-text2);margin:0 0 1em;}" +
    ".msg.ai .b img{max-width:100%;border-radius:calc(10px * var(--vq-r-scale,1));}" +
    ".msg.ai .b a{color:var(--vqc-accent);}" +
    /* ライブ表示: 届いたトークンがふわっと出て、末尾にキャレットが点滅する */
    "@keyframes vqc-tk{0%{opacity:0;color:var(--vq-border-strong,#CFCADB)}55%{opacity:.7;color:var(--vq-text-tertiary,#A9A3BC)}100%{opacity:1;color:var(--vqc-text)}}" +
    "@keyframes vqc-out{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(.72)}}" +
    "@keyframes vqc-spin{to{transform:rotate(360deg)}}" +
    "@keyframes vqc-breathe{0%,100%{opacity:.85}50%{opacity:.35}}" +
    "@keyframes vqc-blink{0%,45%{opacity:.55}50%,100%{opacity:0}}" +
    /* 1チャンク 0.5秒でゆっくり。連続して届くのでフェードが重なり"ふわっ"と見える */
    /* 1チャンク 0.95秒。薄い色から本文色へ、ゆっくり立ち上がる */
    ".msg.ai .b .tk{animation:vqc-tk .95s cubic-bezier(.16,.72,.24,1) both;}" +
    ".msg.ai .b .tail{display:inline;}" +
    /* キャレットの代わりに VocabuQuiz ロゴ風の3連リングをゆっくり回す */
    ".msg.ai .b .vqcaret{display:inline-block;width:1.02em;height:1.02em;margin-left:.18em;vertical-align:-.2em;" +
      "color:var(--vqc-accent);animation:vqc-breathe 1.8s ease-in-out infinite;}" +
    ".msg.ai .b .vqcaret .vqmark{width:100%;height:100%;display:block;animation:vqc-spin 3.6s linear infinite;transform-origin:50% 50%;}" +
    ".msg.ai .b .vqcaret .vqmark circle{stroke-width:2.1;}" +
    ".msg.ai .b .vqcaret .vqmark .r1{opacity:.95}" +
    ".msg.ai .b .vqcaret .vqmark .r2{opacity:.62}" +
    ".msg.ai .b .vqcaret .vqmark .r3{opacity:.62}" +
    /* 生成完了: 回転をゆるめて留まる → その後ふわっと消える */
    ".msg.ai .b .vqcaret.done{animation:none;opacity:.92;}" +
    ".msg.ai .b .vqcaret.done .vqmark{animation:vqc-spin 7s linear infinite;}" +
    ".msg.ai .b .vqcaret.out{animation:vqc-out .7s cubic-bezier(.3,.1,.3,1) forwards;transform-origin:50% 55%;}" +

    "@media (prefers-reduced-motion:reduce){.msg.ai .b .tk{animation:none;}" +
      ".msg.ai .b .vqcaret,.msg.ai .b .vqcaret .vqmark{animation:none;opacity:.7;}}" +
    ".acts{display:flex;align-items:center;gap:2px;margin-top:10px;}" +
    /* display:flex は [hidden] の display:none より強い。これを書かないと隠れない。 */
    ".acts[hidden]{display:none;}" +
    ".acts button{width:30px;height:30px;border:0;background:none;border-radius:calc(8px * var(--vq-r-scale,1));cursor:pointer;display:grid;place-items:center;color:var(--vqc-text3);}" +
    ".acts button:hover{background:var(--vq-surface-sunken,#F2F0F7);color:var(--vqc-text);}.acts button svg{width:16px;height:16px;}" +
    ".acts .ok{color:var(--vqc-ok);}" +
    /* 思考中スケルトン */
    /* 発言に添えた資料。送ったあとも履歴に残す。 */
    ".mfiles{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-bottom:6px;}" +
    ".mfile{display:flex;align-items:center;gap:8px;max-width:260px;border:1px solid var(--vqc-line);background:var(--vq-surface-hover,#FBFAFD);" +
      "border-radius:calc(11px * var(--vq-r-scale,1));padding:6px 9px;}" +
    ".mfile__i{width:30px;height:30px;border-radius:calc(7px * var(--vq-r-scale,1));object-fit:cover;flex:0 0 auto;background:var(--vq-border-subtle,#EFEDF5);}" +
    ".mfile__k{width:30px;height:30px;border-radius:calc(7px * var(--vq-r-scale,1));display:grid;place-items:center;background:var(--vq-border-subtle,#EFEDF5);color:var(--vqc-text3);flex:0 0 auto;}" +
    ".mfile__k svg{width:15px;height:15px;}" +
    ".mfile__c{min-width:0;display:flex;flex-direction:column;}" +
    ".mfile__n{font-size:12px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".mfile__s{font-size:10.5px;color:var(--vqc-text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".msg.ai .mfiles{justify-content:flex-start;}" +
    /* 新しい発言はふわっと出す（既存の発言は作り直さないので再生されない） */
    ".msg.enter{animation:vq-msg-in .3s cubic-bezier(.22,1,.36,1) both;}" +
    "@keyframes vq-msg-in{from{opacity:0;transform:translateY(7px);}to{opacity:1;transform:none;}}" +
    "@media (prefers-reduced-motion:reduce){.msg.enter{animation:none;}}" +
    ".think{display:flex;flex-direction:column;gap:11px;}" +
    ".think__l{font-size:14.5px;font-weight:600;color:var(--vqc-text2);}" +
    /* 文字が左から右へ波打つ。明るい帯が文字の上を流れていく見え方。 */
    ".wave{display:inline-block;background:linear-gradient(90deg,var(--vq-text-tertiary,#B9B5C4) 0%,var(--vq-text-tertiary,#B9B5C4) 32%,var(--vq-text,#2E2A3A) 50%,var(--vq-text-tertiary,#B9B5C4) 68%,var(--vq-text-tertiary,#B9B5C4) 100%);" +
      "background-size:220% 100%;background-position:120% 0;" +
      "-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;" +
      "animation:vq-wave 1.9s linear infinite;}" +
    "@keyframes vq-wave{from{background-position:120% 0;}to{background-position:-20% 0;}}" +
    "@media (prefers-reduced-motion:reduce){.wave{animation:none;" +
      "color:var(--vqc-text2);-webkit-text-fill-color:currentColor;background:none;}}" +
    /* コンポーザー */
    ".cwrap{flex:0 0 auto;padding:0 24px 14px;}" +
    /* position:relative が要る。無いと .dd(absolute) の基準が .main になり、
       選択パネルが入力欄ではなく画面下端を基準に置かれて、
       下部バーの裏へ潜って選べなくなる（PCで14px・モバイルで77px ずれていた）。 */
    ".composer{position:relative;max-width:900px;margin:0 auto;border:1px solid var(--vqc-line);border-radius:calc(22px * var(--vq-r-scale,1));background:var(--vq-surface,#fff);" +
      "box-shadow:0 1px 3px rgba(24,22,34,.05),0 8px 28px rgba(24,22,34,.05);transition:border-color .14s,box-shadow .14s;}" +
    ".composer.focus{border-color:var(--vq-border-strong,#CFC8E6);box-shadow:0 0 0 3px rgba(117,109,179,.14);}" +
    ".files{display:flex;gap:8px;padding:11px 12px 0;overflow-x:auto;}" +
    ".file{display:flex;align-items:center;gap:9px;flex:0 0 auto;max-width:260px;border:1px solid var(--vqc-line);border-radius:calc(11px * var(--vq-r-scale,1));padding:7px 9px;background:var(--vq-surface-hover,#FBFAFD);}" +
    ".file__c{min-width:0;display:flex;flex-direction:column;}" +
    ".file__n{font-size:12.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".file__s{font-size:11px;color:var(--vqc-text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".file__x{width:22px;height:22px;border:0;background:none;border-radius:calc(6px * var(--vq-r-scale,1));cursor:pointer;display:grid;place-items:center;color:var(--vqc-text3);flex:0 0 auto;}" +
    ".file__x:hover{background:var(--vq-border-subtle,#EFEDF5);color:var(--vqc-danger);}.file__x svg{width:13px;height:13px;}" +
    ".file__i{width:34px;height:34px;border-radius:calc(8px * var(--vq-r-scale,1));object-fit:cover;flex:0 0 auto;}" +
    /* 理由をそのまま出すので、長くても札が崩れないように1行で省略する */
    ".file__st{display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:650;color:var(--vqc-text3);" +
      "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".file__st svg{width:11px;height:11px;flex:0 0 auto;}" +
    ".file.warn{border-color:var(--vq-warning-bg,#EEDDB4);background:var(--vq-warning-bg,#FDF9F0);}.file.warn .file__st{color:var(--vq-warning-text,#8A6410);}" +
    ".file.bad{border-color:var(--vq-danger-bg,#F1CBD4);background:var(--vq-danger-bg,#FCF1F4);}.file.bad .file__st{color:var(--vqc-danger);}" +
    ".atx{display:flex;flex-direction:column;gap:2px;min-width:0;}" +
    ".atl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}" +
    ".ade{font-size:11.5px;color:var(--vqc-text3);}" +
    ".acnt{font-size:11px;color:var(--vqc-text3);font-weight:650;}" +
    ".arow.bad .d{background:var(--vqc-danger);border-color:var(--vqc-danger);}.arow.bad .d svg{width:9px;height:9px;color:#fff;}" +
    ".arow.bad{color:var(--vqc-danger);}" +
    ".arow.warn .d{border-color:var(--vq-warning,#D9A441);background:var(--vq-warning-bg,#F6E7C6);}.arow.warn{color:var(--vq-warning-text,#8A6410);}" +
    ".arow.cancel{color:var(--vq-text-tertiary,#A9A5B8);}.arow.cancel .d{border-style:dashed;}" +
    ".agrp{margin-top:4px;}.agrp summary{cursor:pointer;font-size:12px;color:var(--vqc-text3);padding:4px 0;}" +
    ".agrp[open] summary{margin-bottom:4px;}" +
    ".ta{width:100%;border:0;outline:0;background:none;resize:none;font-family:inherit;font-size:15.5px;line-height:1.7;" +
      "color:var(--vqc-text);padding:14px 18px 4px;max-height:230px;overflow-y:auto;}" +
    ".ta::placeholder{color:var(--vq-text-tertiary,#A6A2B2);}" +
    ".bar{display:flex;align-items:center;gap:6px;padding:6px 10px 9px 8px;}" +
    ".cbtn{height:32px;min-width:32px;padding:0 8px;border:0;background:none;border-radius:calc(9px * var(--vq-r-scale,1));cursor:pointer;display:inline-flex;align-items:center;gap:5px;" +
      "color:var(--vqc-text2);font-family:inherit;font-size:12.5px;font-weight:620;}" +
    ".cbtn:hover{background:var(--vq-surface-sunken,#F2F0F7);color:var(--vqc-text);}.cbtn svg{width:17px;height:17px;flex:0 0 auto;}" +
    ".cbtn .cv{width:13px;height:13px;opacity:.6;}" +
    ".spacer{flex:1 1 auto;}" +
    ".send{width:36px;height:36px;border:0;border-radius:50%;cursor:pointer;display:grid;place-items:center;background:var(--vqc-accent);color:#fff;flex:0 0 auto;}" +
    ".send:disabled{background:var(--vq-border,#DCD9E6);color:#fff;cursor:default;}.send svg{width:18px;height:18px;}" +
    ".send.stop{background:var(--vq-text,#2B2836);}" +
    ".disc{max-width:900px;margin:8px auto 0;text-align:center;font-size:11px;color:var(--vqc-text3);}" +
    /* ドロップダウン */
    ".dd{position:absolute;z-index:30;min-width:210px;max-width:min(320px,calc(100vw - 24px));background:var(--vq-surface,#fff);border:1px solid var(--vqc-line);border-radius:calc(13px * var(--vq-r-scale,1));" +
      "box-shadow:0 12px 34px rgba(24,22,34,.16);padding:5px;display:none;overflow-y:auto;overscroll-behavior:contain;" +
      "opacity:0;transform:translateY(4px);transition:opacity .13s ease,transform .13s cubic-bezier(.22,1,.36,1);}" +
    ".dd.on{display:block;}" +
    ".dd.on.in{opacity:1;transform:none;}" +
    ".dd button{display:flex;align-items:flex-start;gap:9px;width:100%;padding:8px 10px;border:0;background:none;border-radius:calc(9px * var(--vq-r-scale,1));cursor:pointer;" +
      "font-family:inherit;text-align:left;color:var(--vqc-text);}" +
    ".dd button:hover{background:var(--vq-surface-active,#F4F2F9);}" +
    ".dd__c{display:flex;flex-direction:column;gap:1px;min-width:0;}" +
    ".dd__t{font-size:13px;font-weight:650;}.dd__d{font-size:11px;color:var(--vqc-text3);}" +
    ".dd .mk{width:15px;height:15px;margin-left:auto;color:var(--vqc-accent);flex:0 0 auto;opacity:0;}" +
    ".dd button.on .mk{opacity:1;}" +
    ".drop{position:absolute;inset:0;z-index:40;display:none;place-items:center;background:rgba(117,109,179,.10);border:2px dashed var(--vq-border-focus,#B9B0E0);border-radius:calc(16px * var(--vq-r-scale,1));" +
      "font-size:14px;font-weight:700;color:var(--vq-accent-text,#5A5296);}" +
    ".root.dragging .drop{display:grid;}" +
    /* エラー */
    ".note{max-width:820px;margin:0 auto 10px;padding:10px 14px;border:1px solid var(--vq-border,#E6E2F0);background:var(--vq-surface-hover,#FAF9FD);border-radius:calc(12px * var(--vq-r-scale,1));font-size:13px;line-height:1.7;color:var(--vq-text-secondary,#5A5570);}" +
    ".choice{max-width:820px;margin:0 auto 10px;padding:12px 14px;border:1px solid var(--vq-border,#E0DCEC);background:var(--vq-surface,#fff);border-radius:calc(12px * var(--vq-r-scale,1));}" +
    ".choice__m{font-size:13px;color:var(--vq-text,#2A2636);margin-bottom:8px;}" +
    ".choice__b{display:flex;gap:8px;flex-wrap:wrap;}" +
    ".choice__b button{height:32px;padding:0 12px;border-radius:calc(8px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#DAD5E8);background:var(--vq-surface,#fff);font-size:13px;cursor:pointer;}" +
    ".choice__b button:first-child{background:var(--vq-accent-text,#5F579E);border-color:var(--vq-accent-text,#5F579E);color:var(--vq-accent-contrast,#fff);}" +
    ".err{max-width:820px;margin:0 auto 10px;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--vq-danger-bg,#F1CBD4);background:var(--vq-danger-bg,#FCF1F4);border-radius:calc(12px * var(--vq-r-scale,1));font-size:13px;color:var(--vq-danger-text,#8E3350);}" +
    ".err button{margin-left:auto;border:0;background:var(--vq-surface,#fff);border:1px solid var(--vq-danger-bg,#F1CBD4);border-radius:calc(8px * var(--vq-r-scale,1));padding:5px 10px;font-family:inherit;font-size:12px;font-weight:650;color:var(--vq-danger-text,#8E3350);cursor:pointer;}" +
    /* 最新へ */
    /* 最新へ戻る丸ボタン。PC は入力欄のすぐ上・中央、モバイルは右下。
       display 切替だとパッと出るので、opacity と transform でふわっと出し入れする。 */
    ".jump{position:absolute;z-index:20;display:inline-flex;align-items:center;justify-content:center;" +
      "width:36px;height:36px;padding:0;border:1px solid var(--vqc-line);background:var(--vq-surface,#fff);border-radius:50%;" +
      "box-shadow:0 6px 20px rgba(24,22,34,.13);color:var(--vqc-text2);cursor:pointer;" +
      /* --vqc-cwrap-h は入力欄まわりの実測高さ（layout() が入れる）。
         モバイルではこの高さに下部バーと safe-area の余白が含まれるので、同じ式で足りる。 */
      "left:50%;bottom:calc(var(--vqc-cwrap-h,84px) + 10px);" +
      "opacity:0;transform:translateX(-50%) translateY(8px) scale(.92);pointer-events:none;" +
      "transition:opacity .18s ease,transform .22s cubic-bezier(.22,1,.36,1);}" +
    ".jump.on{opacity:1;transform:translateX(-50%) translateY(0) scale(1);pointer-events:auto;}" +
    ".jump:hover{color:var(--vqc-text);border-color:var(--vq-border,#D8D3E6);}" +
    ".jump svg{width:17px;height:17px;}" +
    "@media (prefers-reduced-motion:reduce){.jump{transition:opacity .12s linear;}}" +
    ".lchip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--vqc-line);background:var(--vq-surface,#fff);" +
      "border-radius:999px;font-family:inherit;font-size:11.5px;font-weight:650;color:var(--vqc-text3);cursor:pointer;flex:0 0 auto;}" +
    ".lchip::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--vq-border-strong,#C9C5D4);}" +
    ".lchip.on{color:var(--vq-success-text,#3E7C5A);border-color:var(--vq-success-bg,#CFE7D9);background:var(--vq-success-bg,#F3FAF6);}.lchip.on::before{background:var(--vq-success-text,#3E8E5F);}" +
    "@keyframes vqc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(117,109,179,.45)}50%{box-shadow:0 0 0 6px rgba(117,109,179,0)}}" +
    ".lchip.pulse{animation:vqc-pulse 1.1s ease-in-out 2;border-color:var(--vqc-accent);color:var(--vqc-accent);}" +
    /* ── 右アクティビティ ── */
    ".act{width:340px;flex:0 0 auto;border-left:1px solid var(--vqc-line);display:none;flex-direction:column;background:var(--vq-surface-hover,#FBFAFD);min-height:0;}" +
    ".root.act-on .act{display:flex;}" +
    ".act__h{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--vqc-line);}" +
    ".act__t{font-size:13px;font-weight:750;flex:1 1 auto;}" +
    ".act__e{font-size:11.5px;color:var(--vqc-text3);font-weight:600;}" +
    ".act__b{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 14px 20px;display:flex;flex-direction:column;gap:9px;}" +
    /* 1件ずつ ふわっと浮かび上がる。印どうしは縦線でつなぐ。 */
    ".arow{position:relative;display:flex;align-items:flex-start;gap:9px;font-size:12.5px;line-height:1.6;color:var(--vqc-text2);padding-bottom:10px;}" +
    ".arow:last-child{padding-bottom:0;}" +
    ".arow::before{content:'';position:absolute;left:7px;top:19px;bottom:-1px;width:1.5px;background:var(--vq-border-subtle,#E4E0EC);}" +
    ".arow:last-child::before{display:none;}" +
    ".arow.done::before{background:var(--vq-success-bg,#CDE7D8);}" +
    ".arow.in{animation:vq-arow-in .34s cubic-bezier(.22,1,.36,1) both;}" +
    "@keyframes vq-arow-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}" +
    ".arow .d{width:15px;height:15px;flex:0 0 auto;margin-top:2px;border-radius:50%;border:1.6px solid var(--vq-border,#D6D2E0);display:grid;place-items:center;background:var(--vq-surface,#fff);position:relative;z-index:1;}" +
    /* 完了の締めくくり */
    ".adone{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--vqc-line);" +
      "font-size:12.5px;font-weight:650;color:var(--vq-success-text,#2F7A55);animation:vq-arow-in .34s cubic-bezier(.22,1,.36,1) both;}" +
    /* 大きさを指定しないと SVG が既定サイズまで膨らんでパネルを埋め尽くす */
    ".adone svg{width:16px;height:16px;flex:0 0 auto;display:block;}" +
    ".adone .i{display:flex;flex:0 0 auto;}" +
    ".adone .t{margin-left:auto;font-weight:600;color:var(--vqc-text3);white-space:nowrap;}" +
    "@media (prefers-reduced-motion:reduce){.arow.in,.adone{animation:none;}}" +
    ".arow.done .d{background:var(--vqc-ok);border-color:var(--vqc-ok);}" +
    ".arow.done .d svg{width:9px;height:9px;color:#fff;}" +
    ".arow.active .d{border-color:var(--vqc-accent);background:var(--vqc-accent);box-shadow:0 0 0 3px rgba(117,109,179,.18);}" +
    ".arow.active{color:var(--vqc-text);font-weight:650;}" +
    ".aempty{font-size:12.5px;color:var(--vqc-text3);}" +
    /* ── レスポンシブ ── */
    ".backdrop{position:absolute;inset:0;z-index:35;background:rgba(24,22,34,.34);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:none;}" +
    "@media (max-width:1180px){.act{position:absolute;right:0;top:0;bottom:0;z-index:36;box-shadow:-14px 0 40px rgba(24,22,34,.14);}" +
      ".root.act-on .backdrop{display:block;}}" +
    "@media (max-width:900px){" +
      ".side{position:absolute;left:0;top:0;bottom:0;z-index:38;width:min(84vw,300px);transform:translateX(-102%);transition:transform .24s cubic-bezier(.22,1,.36,1);box-shadow:14px 0 40px rgba(24,22,34,.16);}" +
      ".root.side-on .side{transform:none;}.root.side-on .backdrop{display:block;}" +
      ".thread{padding:6px 14px 20px;}" +
      ".cwrap{padding:0 12px calc(var(--vq-sab,0px) + var(--vqc-bottombar,64px) + 12px);}" +
      ".disc{display:none;}" +
      ".hero__t{font-size:24px;}.msg.user .b{max-width:88%;}" +
      /* モバイルでも位置は同じ（入力欄の真上・中央）。指で押しやすいよう少しだけ大きくする。 */
      ".jump{width:40px;height:40px;}" +
      ".act{width:100%;max-width:none;top:auto;height:72%;border-left:0;border-top:1px solid var(--vqc-line);border-radius:calc(18px * var(--vq-r-scale,1)) calc(18px * var(--vq-r-scale,1)) 0 0;}" +
      /* アプリの上バーを出さないので、時計やノッチにかぶらないよう自分で余白を持つ */
      ".top{padding:calc(var(--vq-sat,0px) + 10px) 10px 8px;}" +
      ".side__h{padding-top:calc(var(--vq-sat,0px) + 10px);}" +
    "}";

  /* ── アプリの左パネルを呼ぶ ──────────────────────────────────
     Quick Chat は画面いっぱいに出るので、PC ではアプリの左パネルが隠れて
     ここから他の画面へ行けない。× を押したら、**Quick Chat を出ないまま**
     左パネルをこの上に呼び出す。行き先を選べば、そこで初めて画面が変わる。 */
  function isNarrow() {
    return (window.innerWidth || document.documentElement.clientWidth || 0) <= 900;
  }
  /* × の言い方は画面幅で変わる。スマホは履歴を閉じる、PC はアプリの左パネルを出す。 */
  function syncCloseLabel() {
    if (!root) return;
    var b2 = root.querySelector("[data-closebtn]");
    if (!b2) return;
    var t = isNarrow() ? "履歴を閉じる" : "アプリのメニューを出す";
    b2.setAttribute("aria-label", t);
    b2.setAttribute("title", t);
  }
  function navOpen() { return document.body.classList.contains("vqchat-nav-on"); }
  function showAppNav(on) {
    document.body.classList.toggle("vqchat-nav-on", !!on);
  }
  function toggleAppNav() { showAppNav(!navOpen()); }

  /* ══ 状態 ══════════════════════════════════════════════════════════ */
  var host, root, R = {}, st = {
    started: false, thinking: false, thinkIdx: 0, thinkTimer: 0,
    modelId: "standard", think: "normal",
    actOpen: false, actAuto: false, actUserClosed: false, actExpand: false, longTimer: 0, longStart: 0,
    follow: true, lastMsgSig: "", err: "",
    choice: null,
    sourceOnly: false, structuredWant: "",
    local: { byConv: {}, ready: false, url: "", jobId: "", gen: 0, stream: null, status: "checking",
             meta: null, structured: null, citations: [], warnings: [], streaming: false }
  };
  /* 末尾へ寄せる。自前のスクロールだと分かるよう印を立てて、
     その反動の scroll イベントで follow が false に落ちないようにする。 */
  function stickBottom() {
    if (!R.scroll) return;
    st.autoScrolling = true;
    R.scroll.scrollTop = R.scroll.scrollHeight;
    if (st.autoScrollTimer) clearTimeout(st.autoScrollTimer);
    st.autoScrollTimer = setTimeout(function () { st.autoScrolling = false; syncJump(); }, 80);
  }

  /* 待っている間の一言。いま実際に running な処理から作る（固定文の巡回はしない）。
     ファイルを読んでいるなら件数、外部を見に行っているならその宛先を出す。 */
  var READING = { "document.extract": 1, "pdf.extract": 1, "pdf.inspect": 1, "pdf.ocr": 1,
                  "zip.extract": 1, "zip.inspect": 1, "image.analyze": 1, "file.selected": 1, "file.validation": 1 };
  function thinkingLine() {
    var F = window.__vqChatFiles, e = F && F.currentRunning();
    if (!e) return "考えています";

    /* 外部を見に行っているとき（そういうイベントが来たときだけ出る） */
    var isSearch = /search|browse|fetch|web/i.test(e.type || "") || /検索/.test(e.label || "");
    if (isSearch) {
      var where = e.url || e.detail || "";
      var host = "";
      try { host = where ? new URL(where).hostname.replace(/^www\./, "") : ""; } catch (x) { host = ""; }
      return host ? "検索しています（" + host + "）" : "検索しています";
    }

    /* ファイルを読んでいるとき */
    if (READING[e.type]) {
      var n = (F.list() || []).length;
      if (e.current != null && e.total != null && e.total > 1) {
        return (n || 1) + "件のファイルを読み込んでいます（" + e.current + " / " + e.total + "）";
      }
      return (n || 1) + "件のファイルを読み込んでいます";
    }

    /* 順番待ちはラベルに「◯番目」が入っているので、件数を重ねて出さない */
    if (e.type === "queue.wait") return e.label || "順番待ちです";
    if (e.type === "response.generate") return "考えています";
    var c = (e.current != null && e.total != null) ? "（" + e.current + " / " + e.total + "）" : "";
    return (e.label || "考えています") + c;
  }

  function build() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", build); return; }
    if ($("vqChat")) return;
    var shell = $("appAiChatShell"); if (!shell) { setTimeout(build, 500); return; }

    var ls = document.createElement("style"); ls.id = "vqChatHostStyle";
    ls.textContent =
      "#vqChat{position:absolute;inset:0;z-index:5;display:none;background:var(--vq-surface,#fff);}" +
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #vqChat{display:block;}" +
      /* 旧UIは値の読み取り・ブリッジ元として生かしたまま不可視にする */
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #appAiChatShell>*:not(#vqChat){visibility:hidden !important;}" +
      /* 旧オンボーディング/選択オーバーレイは新UIの上に出るので閉じる（DOMは残す＝ブリッジ生存） */
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #appChatUpgradeModal," +
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #appChatEntryShell," +
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #appChatChooseTopbar," +
      "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #appChatPaneSwitch{visibility:hidden !important;pointer-events:none !important;}" +
      /* スマホ: アプリ側の上バー（左上の三本線）が Quick Chat の見出しに重なっていた。
         Quick Chat は自分の三本線（履歴）を持っているので、こちらは出さない。
         画面の行き来は下のバーでできる。 */
      "@media (max-width:900px){" +
        "body[data-ui-v2=\"1\"][data-app-tab=\"chat\"] #vqTopbar{display:none !important;}" +
      "}" +
      /* PC で × を押したときに出る「アプリの左パネル」。
         Quick Chat は画面いっぱいなので、その上へ重ねて出す。
         #vqShell はこの画面では画面の外へ追い出されているため、位置ごと引き戻す。
         行き先を選んだら勝手に引っ込む。 */
      "#vqChatNavBack{position:fixed;inset:0;z-index:9974;background:var(--vq-surface-overlay,rgba(38,34,68,.42));" +
        "backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:none;}" +
      "body.vqchat-nav-on #vqChatNavBack{display:block;}" +
      /* 左パネル(#vqShell)は #appTabBar の中にいる。Quick Chat 中は #appTabBar ごと
         translateX(-320px) で画面の外へ追い出されている。**動かしているのは親**なので、
         子だけ left:0 にしても戻らない（transform された親が基準になるため）。親の移動を止める。 */
      "body.vqchat-nav-on #appTabBar{transform:none !important;z-index:9976 !important;" +
        "opacity:1 !important;visibility:visible !important;pointer-events:auto !important;}" +
      "body.vqchat-nav-on #vqShell{position:fixed !important;left:0 !important;top:0 !important;" +
        "bottom:0 !important;z-index:9976 !important;opacity:1 !important;visibility:visible !important;" +
        "pointer-events:auto !important;box-shadow:14px 0 44px rgba(24,22,34,.20);}";
    document.head.appendChild(ls);

    /* 左パネルを呼んだときの背景。押すと引っ込む。 */
    if (!$("vqChatNavBack")) {
      var nb = document.createElement("div");
      nb.id = "vqChatNavBack";
      nb.addEventListener("click", function () { showAppNav(false); });
      document.body.appendChild(nb);
    }
    /* 行き先を選んだら（＝画面が変わったら）自分で引っ込む */
    try {
      new MutationObserver(function () { if (navOpen()) showAppNav(false); })
        .observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navOpen()) { e.stopPropagation(); showAppNav(false); }
    }, true);

    host = document.createElement("div"); host.id = "vqChat";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var stl = document.createElement("style"); stl.textContent = CSS; root.appendChild(stl);
    if (window.__vqQueue) { try { window.__vqQueue.registerRoot(root); } catch (e) {} }

    var r = document.createElement("div"); r.className = "root";
    r.innerHTML =
      '<aside class="side" aria-label="チャット">' +
        '<div class="side__h"><span class="side__t">Quick Chat</span>' +
          '<button class="sbtn" data-a="closeSide" data-closebtn aria-label="アプリに戻る" title="アプリに戻る">' + svg("x") + '</button></div>' +
        '<div class="nav">' +
          '<button data-a="new">' + svg("plus") + '新しいチャット<span class="kb">⇧⌘O</span></button>' +
          '<button data-a="search">' + svg("search") + '検索<span class="kb">⌘K</span></button>' +
          '<button data-a="projects">' + svg("folder") + 'プロジェクト</button>' +
        '</div>' +
        '<div class="slist" data-slist></div>' +
      '</aside>' +
      '<div class="main">' +
        '<div class="top">' +
          '<button class="sbtn" data-a="openSide" aria-label="チャット履歴を開く">' + svg("menu") + '</button>' +
          '<span class="top__t" data-title></span>' +
          '<button class="lchip" data-localchip data-a="localPair" hidden></button>' +
          '<button class="sbtn" data-a="toggleAct" aria-label="LUMI を表示">' + svg("activity") + '</button>' +
        '</div>' +
        '<div class="scroll" data-scroll><div class="thread" data-thread></div></div>' +
        '<div class="hero" data-hero><div class="hero__t">Quick Chat</div><div class="composer" data-composer-slot></div></div>' +
        '<button class="jump" data-a="jump" aria-label="最新のメッセージへ移動" title="最新へ移動">' + svg("down") + '</button>' +
        '<div class="cwrap" data-cwrap></div>' +
      '</div>' +
      '<aside class="act" aria-label="アクティビティ">' +
        '<div class="act__h"><span class="act__t">アクティビティ</span><span class="act__e" data-act-el></span>' +
          '<button class="sbtn" data-a="closeAct" aria-label="LUMI を閉じる">' + svg("x") + '</button></div>' +
        '<div class="act__b" data-act-body></div>' +
      '</aside>' +
      '<div class="backdrop" data-a="closeOverlays"></div>' +
      '<div class="drop">ここにドロップして添付</div>' +
      '<input type="file" data-fi multiple hidden accept="image/*,.pdf,.docx,.zip,.txt,.md,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.toml,.sql,.js,.mjs,.ts,.tsx,.jsx,.css,.scss,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.cs,.php,.sh,.vue,.svelte,.log,.ini,.conf">';
    root.appendChild(r);
    shell.appendChild(host);

    R.root = r;
    R.slist = r.querySelector("[data-slist]");
    R.thread = r.querySelector("[data-thread]");
    R.scroll = r.querySelector("[data-scroll]");
    R.hero = r.querySelector("[data-hero]");
    R.heroSlot = r.querySelector("[data-composer-slot]");
    R.cwrap = r.querySelector("[data-cwrap]");
    R.title = r.querySelector("[data-title]");
    R.actBody = r.querySelector("[data-act-body]");
    R.actEl = r.querySelector("[data-act-el]");
    R.jump = r.querySelector(".jump");
    R.fi = r.querySelector("[data-fi]");

    buildComposer();
    loadPrefs();
    wire();
    renderSidebar();
    renderThread();
    layout();
  }

  /* ── コンポーザー（初期は中央、送信後は下部固定へ移動） ── */
  function buildComposer() {
    var c = document.createElement("div"); c.className = "composer";
    c.innerHTML =
      /* 順番待ちの帯。中身は __vqQueue が描く（待っていないときは display:none） */
      '<div data-vq-queue></div>' +
      '<div class="files" data-files hidden></div>' +
      '<textarea class="ta" data-ta rows="1" placeholder="メッセージを入力…" aria-label="メッセージを入力"></textarea>' +
      '<div class="bar">' +
        '<button class="cbtn" data-a="attach" aria-label="ファイルを添付" title="ファイルを添付">' + svg("clip") + '</button>' +
        '<button class="cbtn" data-a="modelMenu" aria-haspopup="listbox" data-model-label>Standard' + svg("chev", "cv") + '</button>' +
        '<button class="cbtn" data-a="thinkMenu" aria-haspopup="listbox" data-think-label>思考：標準' + svg("chev", "cv") + '</button>' +
        '<span class="spacer"></span>' +
        '<button class="send" data-a="send" aria-label="送信" disabled>' + svg("up") + '</button>' +
      '</div>' +
      '<div class="dd" data-dd="model" role="listbox" aria-label="モデル"></div>' +
      '<div class="dd" data-dd="think" role="listbox" aria-label="思考レベル"></div>';
    R.composer = c;
    R.ta = c.querySelector("[data-ta]");
    R.files = c.querySelector("[data-files]");
    R.send = c.querySelector(".send");
    R.ddModel = c.querySelector('[data-dd="model"]');
    R.ddThink = c.querySelector('[data-dd="think"]');
    R.modelLabel = c.querySelector("[data-model-label]");
    R.thinkLabel = c.querySelector("[data-think-label]");
    R.heroSlot.replaceWith(c);
    R.heroSlot = c;
    renderMenus();
  }
  function renderMenus() {
    R.ddModel.innerHTML = VQChatProvider.getModels().map(function (m) {
      return '<button data-model="' + m.id + '" class="' + (m.id === st.modelId ? "on" : "") + '" role="option">' +
        '<span class="dd__c"><span class="dd__t">' + esc(m.label) + '</span><span class="dd__d">' + esc(m.desc || "") + '</span></span>' +
        svg("check", "mk") + '</button>';
    }).join("");
    R.ddThink.innerHTML = THINK.map(function (t) {
      return '<button data-think="' + t.id + '" class="' + (t.id === st.think ? "on" : "") + '" role="option">' +
        '<span class="dd__c"><span class="dd__t">' + esc(t.label) + '</span><span class="dd__d">' + esc(t.desc) + '</span></span>' +
        svg("check", "mk") + '</button>';
    }).join("");
    var m = MODELS.filter(function (x) { return x.id === st.modelId; })[0] || MODELS[0];
    var t = THINK.filter(function (x) { return x.id === st.think; })[0] || THINK[1];
    R.modelLabel.childNodes[0].nodeValue = m.label;
    R.thinkLabel.childNodes[0].nodeValue = "思考：" + t.label;
  }

  /* ── 設定の永続化（会話単位） ── */
  function loadPrefs() {
    var map = lsGet(THINK_KEY, {}), id = activeSessionId() || "__new__";
    st.think = THINK.filter(function (t) { return t.id === map[id]; })[0] ? map[id] : "normal";
    renderMenus();
  }
  function savePrefs() {
    var map = lsGet(THINK_KEY, {}); map[activeSessionId() || "__new__"] = st.think; lsSet(THINK_KEY, map);
  }

  /* ── レイアウト（初期中央 / 会話中は下部固定） ── */
  function layout() {
    var msgs = readMessages();
    var started = msgs.length > 0 || st.thinking;
    if (started !== st.started) {
      st.started = started;
      if (started) { R.cwrap.appendChild(R.composer); R.hero.style.display = "none"; R.scroll.style.display = ""; }
      else { R.hero.appendChild(R.composer); R.hero.style.display = ""; R.scroll.style.display = "none"; }
    } else if (!started && R.composer.parentNode !== R.hero) {
      R.hero.appendChild(R.composer);
    }
    R.hero.style.display = started ? "none" : "";
    R.scroll.style.display = started ? "" : "none";
    syncCwrapVar();
    syncJump();
  }
  /* 「最新へ」ボタンを入力欄の上に置くための実測値。
     画面幅でも入力欄の行数でも変わるので、変わるたびに測り直す。 */
  function syncCwrapVar() {
    if (!R.root || !R.cwrap) return;
    var ch = st.started ? R.cwrap.offsetHeight : 0;
    R.root.style.setProperty("--vqc-cwrap-h", ch + "px");
  }
  /* 下端から離れているときだけ「最新へ」を出す */
  function syncJump() {
    if (!R.jump || !R.scroll) return;
    var far = R.scroll.scrollHeight - R.scroll.scrollTop - R.scroll.clientHeight > 120;
    R.jump.classList.toggle("on", !!(far && st.started));
  }

  /* ── サイドバー描画（ピン留め / プロジェクト / 日付グループ） ── */
  function dayGroup(ts) {
    if (!ts) return "それ以前";
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var t0 = d0.getTime(), DAY = 86400000, diff = t0 - new Date(ts).setHours(0, 0, 0, 0);
    if (diff <= 0) return "今日";
    if (diff <= DAY) return "昨日";
    if (diff <= 7 * DAY) return "過去7日間";
    if (diff <= 30 * DAY) return "過去30日間";
    return "それ以前";
  }
  function renderSidebar() {
    var sessions = readSessions(), projects = readProjects(), pins = lsGet(PIN_KEY, []), act = activeSessionId();
    if (!Array.isArray(pins)) pins = [];
    var html = "";
    function row(s) {
      return '<div class="srow' + (s.id === act ? " on" : "") + '" data-ses="' + esc(s.id) + '" role="button" tabindex="0" title="' + esc(s.title) + '">' +
        '<span class="srow__t">' + esc(s.title) + '</span>' +
        '<button class="srow__m" data-a="sesMenu" data-ses="' + esc(s.id) + '" aria-label="メニュー">' + svg("more") + '</button></div>';
    }
    var pinned = sessions.filter(function (s) { return pins.indexOf(s.id) >= 0; });
    if (pinned.length) html += '<div class="ghead">ピン留め</div>' + pinned.map(row).join("");
    if (projects.length) {
      html += '<div class="ghead">プロジェクト</div>';
      html += projects.map(function (p) {
        var n = sessions.filter(function (s) { return s.projectId === p.id; }).length;
        return '<div class="srow" data-proj="' + esc(p.id) + '" role="button" tabindex="0">' + svg("folder") +
          '<span class="srow__t">' + esc(p.name) + '</span><span class="kb" style="font-size:10.5px;color:var(--vq-text-secondary,#8E8A9B)">' + n + '</span></div>';
      }).join("");
    }
    var rest = sessions.filter(function (s) { return pins.indexOf(s.id) < 0; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var groups = ["今日", "昨日", "過去7日間", "過去30日間", "それ以前"], any = false;
    html += '<div class="ghead">チャット</div>';
    groups.forEach(function (g) {
      var rows = rest.filter(function (s) { return dayGroup(s.ts) === g; });
      if (!rows.length) return;
      any = true;
      html += '<div class="ghead" style="padding-top:8px">' + g + '</div>' + rows.map(row).join("");
    });
    if (!any && !pinned.length) html += '<div class="sempty">まだ会話がありません。</div>';
    R.slist.innerHTML = html;
  }

  /* 発言に添えるファイルの札 */
  function msgFilesHtml(files) {
    if (!files || !files.length) return "";
    return '<div class="mfiles">' + files.map(function (f) {
      var sub = [];
      if (f.kind === "pdf" && f.pageCount) sub.push(f.pageCount + "ページ");
      if (f.kind === "zip" && f.fileCount != null) sub.push(f.fileCount + "ファイル");
      if (f.kind === "image" && f.width) sub.push(f.width + "×" + f.height);
      if (f.kind === "text" && f.lineCount) sub.push(f.lineCount + "行");
      if (f.size) sub.push(VQF() ? VQF().fmtBytes(f.size) : Math.round(f.size / 1024) + "KB");
      return '<div class="mfile">' +
        (f.thumb ? '<img class="mfile__i" src="' + esc(f.thumb) + '" alt="">'
                 : '<span class="mfile__k">' + svg(f.kind === "image" ? "eye" : "clip") + '</span>') +
        '<span class="mfile__c"><span class="mfile__n">' + esc(f.name) + '</span>' +
        '<span class="mfile__s">' + esc(sub.join("・")) + '</span></span></div>';
    }).join("") + "</div>";
  }

  /* ── スレッド描画（実DOMの鏡写し＝ストリーミングもそのまま反映） ──
     作り直しは「変わったところだけ」。全体を innerHTML で入れ替えると、
     ストリーミング中は毎回DOMが総入れ替えになって文字がチカチカし、
     スクロール位置も飛んで上へ戻れなくなる。 */
  function renderThread() {
    var msgs = readMessages();
    var cid1 = mfConvId();
    var mf = mfMap(cid1);
    /* 預かっている添付を、新しく現れたユーザー発言へ結びつける。
       ここでやると、ローカルAI でもクラウドでも同じ経路で付けられる。 */
    if (st.pendingAtts) {
      var lastU = null;
      for (var p = msgs.length - 1; p >= 0; p--) if (msgs[p].role === "user") { lastU = msgs[p]; break; }
      if (lastU && lastU.id && !mf[lastU.id]) {
        mfSet(cid1, lastU.id, st.pendingAtts);
        st.pendingAtts = null;
        mf = mfMap(cid1);
      }
    }
    var sig = msgs.map(function (m) { return m.id + ":" + m.role + ":" + m.html.length; }).join("|")
      + "|" + st.thinking + "|" + Object.keys(mf).length + "|" + (st.err || "") + "|" + (st.choice ? "c" : "");
    if (sig === st.lastMsgSig) return;
    st.lastMsgSig = sig;

    /* 末尾の可変ゾーン（思考中・注意書き・選択・エラー）は毎回作り直してよい */
    var tail = R.thread.querySelector(":scope > .tailzone");
    if (!tail) { tail = document.createElement("div"); tail.className = "tailzone"; R.thread.appendChild(tail); }

    var want = [];
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (m.role === "typing") continue;                     /* 思考中は自前スケルトンで出す */
      if (m.role === "user") want.push({ key: "u:" + m.id, role: "user", m: m, files: mf[m.id] || null });
      else want.push({ key: "a:" + m.id, role: "ai", m: m });
    }

    var have = R.thread.querySelectorAll(":scope > .msg");
    var hi = 0;
    for (var w = 0; w < want.length; w++) {
      var it = want[w], node = have[hi];
      if (!node || node.getAttribute("data-key") !== it.key) {
        node = document.createElement("div");
        node.className = "msg " + it.role + " enter";
        node.setAttribute("data-key", it.key);
        if (it.role === "ai") node.setAttribute("data-mid", it.m.id);
        node.innerHTML = it.role === "user"
          ? msgFilesHtml(it.files) + '<div class="b"></div>'
          : '<div class="b"></div><div class="acts">' +
              '<button data-a="copy" data-mid="' + esc(it.m.id) + '" aria-label="コピー" title="コピー">' + svg("copy") + '</button>' +
              '<button data-a="regen" aria-label="再生成" title="再生成">' + svg("refresh") + '</button>' +
            '</div>';
        R.thread.insertBefore(node, have[hi] || tail);
        have = R.thread.querySelectorAll(":scope > .msg");
      }
      /* 本文は中身が変わったときだけ差し替える（毎回入れ替えない） */
      var b = node.querySelector(":scope > .b");
      var next = it.role === "user" ? esc(it.m.text) : it.m.html;
      if (b && node.getAttribute("data-sig") !== String(next.length) + ":" + next.slice(-24)) {
        b.innerHTML = next;
        node.setAttribute("data-sig", String(next.length) + ":" + next.slice(-24));
      }
      /* 本文が空のうちはコピー・再生成を出さない。
         生成待ちの空欄に操作ボタンだけ浮いていると、押せるものだと思ってしまう。 */
      if (it.role === "ai") {
        var acts = node.querySelector(":scope > .acts");
        if (acts) acts.hidden = !String(it.m.text || "").trim();
      }
      /* 添付は送信のあとで結びつくので、既にある発言にも後から差し込む */
      if (it.role === "user" && it.files && it.files.length && !node.querySelector(":scope > .mfiles")) {
        node.insertAdjacentHTML("afterbegin", msgFilesHtml(it.files));
      }
      hi++;
    }
    /* 余ったものを外す */
    have = R.thread.querySelectorAll(":scope > .msg");
    for (var d = have.length - 1; d >= want.length; d--) have[d].remove();

    var h = "";
    if (st.thinking) {
      /* 波打つ一行だけ。骨組み（スケルトン）は出さない。 */
      h += '<div class="msg ai"><div class="think">' +
        '<div class="think__l"><span class="wave">' + esc(thinkingLine()) + '</span></div>' +
        '</div></div>';
    }
    /* 検証状況の注意書き。確認できていないものを確認済みに見せない。 */
    var lw = st.local && st.local.warnings ? st.local.warnings : [];
    var lm = st.local && st.local.meta;
    var unver = lm && lm.verified && (lm.verified.evidence === "unverified" || lm.verified.evidence === "failed" || lm.verified.critic === "failed");
    if (!st.thinking && (lw.length || unver)) {
      var notes = lw.slice(0, 4);
      if (unver && notes.indexOf("一部の根拠を確認できていません。") < 0) notes.push("一部の根拠を確認できていません。");
      h += '<div class="note">' + notes.map(function (n) { return esc(n); }).join("<br>") + '</div>';
    }
    if (st.choice) {
      h += '<div class="choice"><div class="choice__m">' + esc(st.choice.message) + '</div><div class="choice__b">' +
        st.choice.options.map(function (o) {
          return '<button data-a="choice" data-cid="' + esc(o.id) + '">' + esc(o.label) + '</button>';
        }).join("") + '</div></div>';
    }
    if (st.err) {
      var isLocalErr = st.err.indexOf("ローカルAI") === 0;
      h += '<div class="err">' + esc(st.err) +
        '<button data-a="' + (isLocalErr ? "localPair" : "regen") + '">' + (isLocalErr ? "接続する" : "再生成") + '</button></div>';
    }
    tail.innerHTML = h;
    /* 生成直後の保持中はマークを復元する（別経路の再描画で消えないように） */
    if (st.local && st.local.holdMid) {
      var hn = R.thread.querySelector('[data-mid="' + st.local.holdMid + '"] .b');
      if (hn) attachMark(hn, st.local.holdPhase || "done");
    }
    var cid0 = activeSessionId();
    var tmap0 = lsGet("vq.chat.titles.v1", {});
    var t = document.querySelector("#appChatSessionList .app-chat-session-item.is-active .app-chat-session-title");
    R.title.textContent = (cid0 && tmap0[cid0]) ? tmap0[cid0] : (t ? (t.textContent || "").trim() : "");
    if (st.follow) stickBottom();
    layout();
  }

  /* ── 添付カード（Document Engine の実モデルから描画） ── */
  /* ストリーミング中はスレッド全体を作り直さず、対象メッセージの本文だけ差し替える。
     全体再構築は毎トークンでDOMが総入れ替えになり、文字がチカチカする原因になる。 */
  /* 届いたトークンをふわっと出す。
     ポイント: 毎回 innerHTML を作り直すと直前のフェードが打ち切られて
     「1文字ずつパチパチ出る＝タイプライター」に見えてしまう。
     そこで Markdown の構造が変わらない間は末尾へ追記するだけにして、
     複数チャンクのフェードが重なるようにしている。 */
  /* 本文があるときだけコピー・再生成を出す */
  function syncActs(mid, hasText) {
    var wrap = R.thread.querySelector('[data-mid="' + mid + '"]');
    var acts = wrap && wrap.querySelector(":scope > .acts");
    if (acts) acts.hidden = !hasText;
  }
  function paintStream(mid, chunk, html) {
    var node = R.thread.querySelector('[data-mid="' + mid + '"] .b');
    if (!node) { st.lastMsgSig = ""; renderThread(); return; }
    syncActs(mid, !!String(html || chunk || "").trim());
    var th = R.thread.querySelector(".think");
    if (th && th.parentNode) th.parentNode.remove();
    node.classList.add("live");

    /* 構造に影響する文字が来たとき、または一定間隔でだけ全体を作り直す */
    var structural = /[\n`|#>\[\]*_~-]/.test(chunk || "");
    var now = Date.now();
    if (!structural && node.getAttribute("data-inc") === "1" && now - (st.local.lastFull || 0) < 1200) {
      var host2 = node.querySelector("[data-tail]");
      if (host2) {
        var sp = document.createElement("span");
        sp.className = "tk"; sp.textContent = chunk;
        host2.appendChild(sp);
        if (st.follow) stickBottom();
        return;
      }
    }
    /* 全体再構築（末尾に追記先とマークを用意する） */
    node.innerHTML = html;
    st.local.lastFull = now;
    node.setAttribute("data-inc", "1");
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), last = null, t;
    while ((t = w.nextNode())) if (t.nodeValue && t.nodeValue.length) last = t;
    var anchor = last ? last.parentNode : node;
    var tail = document.createElement("span");
    tail.setAttribute("data-tail", "1"); tail.className = "tail";
    anchor.appendChild(tail);
    var mark = document.createElement("span");
    mark.className = "vqcaret"; mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = VQMARK;
    anchor.appendChild(mark);
    if (st.follow) stickBottom();
  }
  /* 生成が終わったらキャレットを外して確定表示にする */
  var HOLD_MS = 1100, FADE_MS = 700;
  function finishStream(mid, html) {
    var node = R.thread.querySelector('[data-mid="' + mid + '"] .b');
    if (!node) return;
    syncActs(mid, !!String(html || "").trim());
    var settle = function () {
      node.innerHTML = html;               /* 最終形は素の Markdown に戻す（マーク除去） */
      node.classList.remove("live");
      node.removeAttribute("data-inc");
    };
    /* 生成が終わってもすぐ消さず、少し留まってから ふわっと消える。
       この間に別の再描画が走ってもマークが消えないよう state で保持する。 */
    st.local.holdMid = mid;
    st.local.holdPhase = "done";
    node.innerHTML = html;
    attachMark(node, "done");
    if (st.local.markTimer) clearTimeout(st.local.markTimer);
    st.local.markTimer = setTimeout(function () {
      st.local.holdPhase = "out";
      var n2 = R.thread.querySelector('[data-mid="' + mid + '"] .b');
      var m2 = n2 && n2.querySelector(".vqcaret");
      if (m2) m2.classList.add("out");
      st.local.markTimer = setTimeout(function () {
        st.local.holdMid = ""; st.local.holdPhase = "";
        settle();
      }, FADE_MS);
    }, HOLD_MS);
  }
  /* マーク要素を本文末尾へ付ける（phase: "" | "done" | "out"） */
  function attachMark(node, phase) {
    if (!node || node.querySelector(".vqcaret")) return;
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), last = null, t;
    while ((t = w.nextNode())) if (t.nodeValue && t.nodeValue.length) last = t;
    var anchor = last ? last.parentNode : node;
    var mark = document.createElement("span");
    mark.className = "vqcaret" + (phase ? " " + phase : "");
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = VQMARK;
    anchor.appendChild(mark);
  }
  function VQF() { return window.__vqChatFiles; }
  function renderFiles() {
    var F = VQF(); if (!F) { R.files.hidden = true; return; }
    var list = F.list();
    if (!list.length) { R.files.hidden = true; R.files.innerHTML = ""; return; }
    R.files.hidden = false;
    R.files.innerHTML = list.map(function (f) {
      var sub = [];
      if (f.kind === "pdf" && f.pageCount) sub.push(f.pageCount + "ページ");
      if (f.kind === "zip" && f.fileCount != null) sub.push(f.fileCount + "ファイル / 対象" + f.includedCount + " / 除外" + f.excludedCount);
      if (f.kind === "image" && f.width) sub.push(f.width + "×" + f.height);
      if (f.kind === "text" && f.lineCount) sub.push(f.lineCount + "行");
      sub.push(F.fmtBytes(f.size));
      var icon = f.status === "ready" ? "check" : f.status === "failed" ? "x" : f.status === "warning" ? "activity" : "refresh";
      /* 「警告あり」だけでは何が起きたのか分からない。理由をそのまま出す。
         （例: 20ページは画像化されており文字を取得できません（OCR未接続）） */
      var why = f.error || ((f.warnings && f.warnings.length) ? f.warnings.join(" / ") : f.statusText);
      return '<div class="file' + (f.status === "failed" ? " bad" : f.status === "warning" ? " warn" : "") + '" data-fid="' + esc(f.id) + '">' +
        (f.thumb ? '<img class="file__i" src="' + f.thumb + '" alt="">' : '') +
        '<span class="file__c"><span class="file__n">' + esc(f.name) + '</span>' +
        '<span class="file__s">' + esc(sub.join("・")) + '</span>' +
        '<span class="file__st" title="' + esc(why) + '">' + svg(icon) + esc(why) + '</span></span>' +
        (f.status === "failed" ? '<button class="file__x" data-a="refile" data-fid="' + esc(f.id) + '" aria-label="再試行">' + svg("refresh") + '</button>' : '') +
        '<button class="file__x" data-a="unattach" data-fid="' + esc(f.id) + '" aria-label="添付を削除">' + svg("x") + '</button></div>';
    }).join("");
  }

  /* ── アクティビティ（実処理イベントから描画） ── */
  function fmtEl(ms) {
    var s2 = Math.max(0, Math.round(ms / 1000));
    return s2 < 60 ? s2 + "秒" : Math.floor(s2 / 60) + "分" + (s2 % 60) + "秒";
  }
  function renderActivity() {
    var F = VQF(); if (!F) return;
    var evs = F.events(), start = F.runStartedAt();
    /* 終わったらタイマーは止める。止めないと、完了後も数字が動き続けて終わったように見えない。 */
    var running = !!F.currentRunning() || st.thinking;
    if (running && start) { st.actEndAt = 0; R.actEl.textContent = fmtEl(Date.now() - start); }
    else if (start) {
      if (!st.actEndAt) {
        var last = 0;
        for (var q = 0; q < evs.length; q++) if (evs[q].completedAt) last = Math.max(last, evs[q].completedAt);
        st.actEndAt = last || Date.now();
      }
      R.actEl.textContent = fmtEl(st.actEndAt - start);
    } else R.actEl.textContent = "";
    if (!evs.length) { R.actBody.innerHTML = '<div class="aempty">まだ処理はありません。</div>'; st.actShown = {}; return; }
    /* 大きな処理は個別、細かい処理(document.extract/file.selected)はまとめる */
    var MINOR = { "file.selected": 1, "file.validation": 1 };
    var minor = evs.filter(function (e) { return MINOR[e.type] && e.status === "completed"; });
    /* 「処理が完了しました」は行にしない。下の締めくくり（完了しました。＋所要時間）と
       同じことを言っているうえ、2 か所から emit されるため 2 行に増えていた。 */
    var major = evs.filter(function (e) {
      return !(MINOR[e.type] && e.status === "completed") && e.type !== "request.completed";
    });

    /* 行は足すだけ・変わったところだけ書き換える。
       毎回 innerHTML で作り直すと、先に出た行の浮かび上がりが途中で切れて、
       結局「一気に出た」ように見えてしまう。 */
    var rows = R.actBody.querySelector(":scope > .arows");
    var tailz = R.actBody.querySelector(":scope > .atailz");
    if (!rows) {
      R.actBody.innerHTML = '<div class="arows"></div><div class="atailz"></div>';
      rows = R.actBody.querySelector(":scope > .arows");
      tailz = R.actBody.querySelector(":scope > .atailz");
    }
    if (!st.actShown) st.actShown = {};
    /* 遅らせる量は「この 1 フレームで足した本数」で決める。
       イベントは同じ処理の中でまとめて届くことがあり、
       描画のたびに 0 へ戻すと、結局まとめて同時に浮かんでしまう。 */
    if (st.actBurst == null) st.actBurst = 0;
    if (!st.actBurstScheduled) {
      st.actBurstScheduled = true;
      requestAnimationFrame(function () { st.actBurst = 0; st.actBurstScheduled = false; });
    }
    major.forEach(function (e) {
      var cls = e.status === "completed" ? "done" : e.status === "running" ? "active"
        : e.status === "failed" ? "bad" : e.status === "warning" ? "warn" : e.status === "cancelled" ? "cancel" : "";
      var mark = e.status === "completed" ? svg("check") : e.status === "failed" ? svg("x") : "";
      var cnt = (e.current != null && e.total != null) ? '<span class="acnt">' + e.current + " / " + e.total + "</span>" : "";
      var el = e.completedAt ? '<span class="acnt">' + fmtEl(e.completedAt - e.startedAt) + "</span>" : "";
      var key = (e.type || "") + "@" + (e.startedAt || 0);
      var inner = '<span class="d">' + mark + '</span><span class="atx">' +
        '<span class="atl">' + esc(e.label) + cnt + el + '</span>' +
        (e.detail ? '<span class="ade">' + esc(e.detail) + '</span>' : '') + '</span>';
      var node = rows.querySelector('[data-akey="' + key.replace(/"/g, "") + '"]');
      if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-akey", key.replace(/"/g, ""));
        node.className = "arow " + cls + " in";
        /* まとめて届いたぶんだけ、順番にずらして出す */
        node.style.animationDelay = (st.actBurst * 90) + "ms";
        st.actBurst++; st.actShown[key] = 1;
        node.innerHTML = inner;
        rows.appendChild(node);
      } else {
        if (node.getAttribute("data-ai") !== inner) { node.innerHTML = inner; node.setAttribute("data-ai", inner); }
        var keep = node.classList.contains("in") ? " in" : "";
        var want = "arow " + cls + keep;
        if (node.className !== want) node.className = want;
      }
      node.setAttribute("data-ai", inner);
    });
    /* 消えた行を外す */
    var keys = {};
    major.forEach(function (e) { keys[((e.type || "") + "@" + (e.startedAt || 0)).replace(/"/g, "")] = 1; });
    Array.prototype.slice.call(rows.children).forEach(function (n) {
      if (!keys[n.getAttribute("data-akey")]) n.remove();
    });

    var h = "";
    if (minor.length) {
      h += '<details class="agrp"' + (st.actExpand ? " open" : "") + '><summary>' + minor.length + '件の処理</summary>' +
        minor.map(function (e) { return '<div class="arow done"><span class="d">' + svg("check") + '</span><span class="atx"><span class="atl">' + esc(e.label) + '</span>' + (e.detail ? '<span class="ade">' + esc(e.detail) + '</span>' : '') + '</span></div>'; }).join("") +
        '</details>';
    }
    if (tailz.innerHTML !== h) tailz.innerHTML = h;

    /* 終わったら、その時点の所要時間を添えて締めくくる。
       この要素は作り直さない。毎回入れ替えると浮かび上がりが 1 秒ごとに
       やり直されて、ぴょんぴょん跳ねて見える。 */
    var donez = R.actBody.querySelector(":scope > .adone");
    if (!running && start && st.actEndAt) {
      var failed = evs.some(function (e) { return e.status === "failed"; });
      var cancelled = evs.some(function (e) { return e.status === "cancelled"; });
      var word = failed ? "一部を完了できませんでした。" : cancelled ? "停止しました。" : "完了しました。";
      var tone = failed ? "var(--vqc-danger)" : cancelled ? "var(--vq-text-tertiary,#A9A5B8)" : "";
      if (!donez) {
        donez = document.createElement("div");
        donez.className = "adone";
        donez.innerHTML = '<span class="i"></span><span class="w"></span><span class="t"></span>';
        R.actBody.appendChild(donez);
      }
      var iw = failed ? svg("x") : svg("check");
      if (donez.getAttribute("data-i") !== (failed ? "x" : "c")) {
        donez.querySelector(".i").innerHTML = iw;
        donez.setAttribute("data-i", failed ? "x" : "c");
      }
      if (donez.querySelector(".w").textContent !== word) donez.querySelector(".w").textContent = word;
      var tt = fmtEl(st.actEndAt - start);
      if (donez.querySelector(".t").textContent !== tt) donez.querySelector(".t").textContent = tt;
      if (donez.style.color !== tone) donez.style.color = tone;
    } else if (donez) donez.remove();
  }
  function setAct(on, auto) {
    st.actOpen = !!on;
    R.root.classList.toggle("act-on", st.actOpen);
    if (!on && !auto) { st.actUserClosed = true; lsSet(PANEL_KEY, { userClosed: true }); }
    if (on) renderActivity();
  }

  /* ── 送信/停止 ── */
  function busy() { return VQChatProvider.isBusy(); }
  function updateSend() {
    var F = VQF();
    var b = busy() || !!(F && F.currentRunning()) || !!st.local.streaming;
    R.send.classList.toggle("stop", b);
    R.send.innerHTML = b ? svg("stop") : svg("up");
    R.send.setAttribute("aria-label", b ? "生成を停止" : "送信");
    R.send.disabled = !b && !(R.ta.value.trim() || (F && F.list().length));
  }
  function doSend() {
    var F = VQF();
    if (busy() || (F && F.currentRunning()) || st.local.streaming) {   /* 停止は解析と生成の両方に効く */
      if (F) F.abort();
      /* ローカル実行中は Orchestration Job 全体を止める。旧DOMの停止ボタンでは止まらない。 */
      if (st.local.streaming && window.__vqLocalAI) { try { window.__vqLocalAI.cancelGeneration(); } catch (e) {} }
      else VQChatProvider.cancelGeneration();
      stopThinking(); updateSend(); return;
    }
    var text = R.ta.value.trim();
    var atts = F ? F.list() : [];
    if (!text && !atts.length) return;
    var pending = atts.filter(function (a) { return a.status === "queued" || a.status === "extracting"; });
    if (pending.length) { st.err = "添付ファイルの解析が完了するまでお待ちください。"; renderThread(); return; }
    st.err = "";
    /* 送ったものを履歴へ残す。この直後に F.clear() で入力欄からは消えるので、
       消える前にここで控えておく。実際の発言 ID は送信後に決まるので、
       いったん預かって、新しいユーザー発言が現れたときに結びつける。 */
    var sentCid = mfConvId();
    st.pendingAtts = atts.length ? mfMeta(atts) : null;
    st.lastMsgSig = "";
    var ctxText = "";                          /* AIへ送るときだけ足す資料の中身 */
    ensureAiPane();
    st.actShown = {}; st.actEndAt = 0;          /* 新しい処理なので、出した記録と完了時刻を空にする */
    if (F) {
      F.beginRun();
      F.emit("request.queued", { status: "completed", label: "リクエストを準備しました" });
      var imgs = F.imageFiles();
      if (imgs.length) VQChatProvider.uploadAttachment(imgs);   /* 画像は既存の画像ペイロード経路へ */
      /* 資料の中身は「AIへ送る文」にだけ足す。画面に出す発言へ混ぜない。
         混ぜると、PDF を付けただけで自分の吹き出しに全文が出てしまう。
         ローカルAI へは attachments として別枠で渡るので、そもそも足す必要がない。 */
      var ctx = F.buildContext();
      if (ctx.text) { ctxText = ctx.text; st.sources = ctx.sources; }
      else st.sources = [];
      F.emit("response.generate", { status: "running", label: "回答を生成しています" });
    }
    VQChatProvider.applyThinking(st.think);
    savePrefs();
    /* Bridge は動いているのに未ペアリング → 勝手にクラウドへ流さず、接続を促す */
    if (!st.local.ready && st.local.url) {
      /* ローカルAI は切り離したので、ここで止めない。そのままクラウドへ送る。 */
    }
    /* ══ ローカルAI（この Mac）の道は、もう通らない ══════════════
       2026-08-12 に切り離した。**AI はクラウドの Gemini 一本**。
       残しておくと、つないだ人だけ黙って別の AI で答えることになり、
       同じ質問で答えが変わる。ここで分岐させない。 */
    /* クラウド経路は本文に足す以外に資料を渡す手段が無いので、送る文にだけ足す。
       画面には [添付資料] 以降を出さない（readMessages で落とす）。 */
    var ok = VQChatProvider.sendMessage(text + ctxText);
    if (!ok) { st.err = "送信できませんでした。時間をおいて再試行してください。"; renderThread(); return; }
    if (F) F.clear();
    R.ta.value = ""; autoGrow(); renderFiles();
    st.follow = true;
    /* 新規チャットは送信より後に会話IDが決まる。決まったら添付の控えをそちらへ移す。 */
    if (sentCid === "__new__") watchMfId("__new__");
    startThinking();
    startLongWatch();
    updateSend();
  }
  /* 会話IDが確定するまで見張って、添付の控えを移す */
  function watchMfId(from) {
    var n = 0;
    var iv = setInterval(function () {
      if (++n > 25) { clearInterval(iv); return; }
      var id2 = activeSessionId();
      if (!id2 || id2 === from) return;
      mfRekey(from, id2);
      clearInterval(iv);
      st.lastMsgSig = ""; renderThread();
    }, 200);
  }
  function startThinking() {
    st.thinking = true; st.thinkIdx = 0;
    clearInterval(st.thinkTimer);
    /* 経過時間の更新のみ。文言は実イベントから引くので"巡回"ではない */
    st.thinkTimer = setInterval(function () {
      if (!st.thinking) { clearInterval(st.thinkTimer); return; }
      /* 文字は .wave の中。ここを textContent で書き換えると波の要素ごと消えるので、中身だけ差し替える */
      var tl = R.thread.querySelector(".think__l .wave");
      if (tl) { var nx = thinkingLine(); if (tl.textContent !== nx) tl.textContent = nx; }
      else { st.lastMsgSig = ""; renderThread(); }
      if (st.actOpen) renderActivity();
    }, 700);
    renderThread();
  }
  /* ══ 走りっぱなしの処理を閉じる ═══════════════════════════════════
     running が 1 件でも残ると currentRunning() が真を返し続け、
     「考えています」と「停止」ボタンが戻らなくなる。
     終わったと分かっている所から、いつでもこれを呼べるようにする。
     maxIdleMs を渡すと「その時間だけ何も動きが無かったもの」だけを閉じる
     （見張りから呼ぶとき用。動いている最中のものを巻き込まないため）。 */
  function closeStrayRuns(maxIdleMs) {
    var F = VQF();
    if (!F) return 0;
    var evs = F.events(), now = Date.now(), n = 0;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.status !== "running" && e.status !== "pending") continue;
      if (maxIdleMs != null) {
        var last = e.touchedAt || e.startedAt || 0;
        if (!last || (now - last) < maxIdleMs) continue;   /* まだ動いている */
      }
      F.update(e, { status: "completed" });
      n++;
    }
    if (n) {
      var done = evs.some(function (x) { return x.type === "request.completed"; });
      if (!done) F.emit("request.completed", { status: "completed", label: "処理が完了しました" });
      F.endRun();
    }
    return n;
  }

  function stopThinking() {
    if (!st.thinking) return;
    st.thinking = false; clearInterval(st.thinkTimer); st.thinkTimer = 0;
    var F = VQF();
    if (F) {
      var evs = F.events();
      for (var i = evs.length - 1; i >= 0; i--) if (evs[i].type === "response.generate" && evs[i].status === "running") {
        F.update(evs[i], { status: "completed", label: "回答を生成しました" }); break;
      }
      var already = evs.some(function (x) { return x.type === "request.completed"; });
      if (!already) F.emit("request.completed", { status: "completed", label: "処理が完了しました" });
      F.endRun();
    }
    st.lastMsgSig = ""; renderThread();
    /* パネルを開いていなくても、完了の締めくくりを作れるよう一度描く */
    renderActivity();
  }
  /* 60秒ルール: 60秒未満では絶対に自動表示しない／ユーザーが閉じたら二度と自動で開かない／
     新しい処理では再び自動表示できる（beginRun で autoShown がリセットされる） */
  function startLongWatch() {
    clearTimeout(st.longTimer); st.longStart = Date.now();
    st.longTimer = setTimeout(function () {
      var F = VQF();
      var running = busy() || (F && F.currentRunning());
      if (!running || st.actOpen || st.actUserClosed) return;
      if (F && F.autoShown()) return;
      if (F) F.autoShown(true);
      st.actAuto = true;
      if ((window.innerWidth || 0) < 900) { st.actNotice = true; }   /* 狭い画面は通知→シート */
      setAct(true, true);
      st.lastMsgSig = ""; renderThread();
    }, 60000);
  }

  /* ── ローカルAI: 本物のトークンストリームをスレッドへ描画 ── */
  function localMsgId() { return "l-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  /* 最初のユーザー発言から仮タイトルを作る（Markdown/改行除去・24〜32字） */
  function draftTitle(text) {
    var t = String(text || "")
      .replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
      .replace(/^#{1,6}\s*/gm, "").replace(/\*\*|__|\*|_|>/g, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ").trim();
    if (!t) return "";
    /* ファイル名だけの長い文字列はそのまま使わない */
    if (/^[\w.\-]+\.(pdf|zip|docx|txt|md|csv|json|png|jpe?g)$/i.test(t)) t = t.replace(/\.[a-z0-9]+$/i, "") + " について";
    if (t.length > 30) t = t.slice(0, 28) + "…";
    return t;
  }
  /* アプリ本体のセッション一覧へタイトルを保存（＝再読み込み後も残る） */
  var TITLE_KEY = "vq.chat.titles.v1";
  function persistTitle(cid, title) {
    if (!cid || !title) return false;
    /* 本体は _chatSaveSessions() で sessions.v2 を丸ごと書き戻すため、
       自前キーにも保存して読み出し時にこちらを優先する（本体データは壊さない）。 */
    var tmap = lsGet(TITLE_KEY, {}); tmap[cid] = title.slice(0, 60); lsSet(TITLE_KEY, tmap);
    var list = lsGet("app.chat.sessions.v2", []);
    if (!Array.isArray(list)) return false;
    var hit = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === cid) {
        if (!list[i].title || list[i].title === "新しいチャット") { list[i].title = title.slice(0, 60); hit = true; }
        list[i].updatedAt = Date.now();
        break;
      }
    }
    if (hit) lsSet("app.chat.sessions.v2", list);
    hit = true;
    /* 実サイドバー(アプリ側)の表示も更新しておく */
    try {
      var li = document.querySelector('#appChatSessionList .app-chat-session-item[data-chat-ids="' + cssEsc(cid) + '"] .app-chat-session-title');
      if (li && hit) li.textContent = title;
    } catch (e) {}
    return hit;
  }
  function maybeTitle(cid, firstText) {
    var t = draftTitle(firstText);
    if (!t) return;                                   /* 空なら「新しいチャット」を維持 */
    if (persistTitle(cid, t)) { renderSidebar(); R.title.textContent = t; }
  }
  async function sendLocal(text, atts) {
    var F = VQF(), L = window.__vqLocalAI;
    var cid = activeSessionId() || "__new__";
    var gen = ++st.local.gen;                          /* 世代: 会話切替後の遅延到着を捨てる */
    var arr = localMsgs(cid);
    var uid2 = localMsgId(), aid = localMsgId();
    var isFirst = arr.length === 0;
    arr.push({ id: uid2, role: "user", html: "", text: text, status: "done" });
    var aiMsg = { id: aid, role: "ai", html: "", text: "", status: "streaming" };
    arr.push(aiMsg);
    if (isFirst) maybeTitle(cid, text);
    st.thinking = true; st.follow = true;
    st.lastMsgSig = ""; renderThread(); startLongWatch(); updateSend();

    /* 添付を Bridge の形式へ（画像は base64、テキスト系は抽出済みテキスト）。
       ここで必ず量を絞る。抽出した全文をそのまま送ると、大きな資料では
       リクエストが数十MBになって接続ごと切れる（実際に切れた）。
       モデルが読めるのは文脈長ぶん（約32kトークン）だけなので、送っても無駄でもある。 */
    var usable = (atts || []).filter(function (a) { return a.status === "ready" || a.status === "warning"; });
    var budget = (VQF() && VQF().LIMITS && VQF().LIMITS.maxContextChars) || 120000;
    var textOnes = usable.filter(function (a) { return a.kind !== "image" && a.text; });
    /* 短いものから配って、余りを大きいものへ回す（1本が総取りしない） */
    var share = {}, left = budget, remain = textOnes.length;
    textOnes.slice().sort(function (x, y) { return (x.text || "").length - (y.text || "").length; })
      .forEach(function (a) {
        var even = Math.floor(left / Math.max(1, remain));
        var give = Math.min((a.text || "").length, even);
        share[a.id] = give; left -= give; remain--;
      });
    var trimmed = [];
    var attach = usable.map(function (a) {
      var full = a.kind === "image" ? "" : String(a.text || "");
      var cap = share[a.id] != null ? share[a.id] : full.length;
      var sent = full.slice(0, cap);
      if (full.length > sent.length) trimmed.push(a.name);
      return {
        id: a.id, name: a.name, kind: a.kind,
        extractedText: sent + (full.length > sent.length ? "\n…（以降は省略）" : ""),
        imageBase64: a.kind === "image" ? String(a.imageDataUrl || "").replace(/^data:[^,]+,/, "") : "",
        pageCount: a.pageCount || null,
        pages: a.pages ? a.pages.filter(function (x) { return x.text; }).map(function (x) { return x.pageNumber; }) : null,
        lineCount: a.lineCount || null
      };
    });
    /* スキャンしたページは画像として足す（1ページ＝1枚）。
       サーバは kind:"image" の添付だけを画像として受け取る。 */
    var scanCount = 0;
    var scanMax = (VQF() && VQF().LIMITS && VQF().LIMITS.maxScanPages) || 12;
    usable.forEach(function (a) {
      (a.pageImages || []).forEach(function (pi) {
        if (scanCount >= scanMax) return;
        attach.push({
          id: a.id + "-p" + pi.pageNumber,
          name: a.name + "（" + pi.pageNumber + "ページ）",
          kind: "image",
          extractedText: "",
          imageBase64: String(pi.dataUrl || "").replace(/^data:[^,]+,/, ""),
          pageCount: null, pages: null, lineCount: null
        });
        scanCount++;
      });
    });
    if (scanCount && F) {
      F.emit("scan.attach", { status: "completed",
        label: scanCount + "ページを画像としてAIへ渡しました",
        detail: "文字が入っていないページは、画像のまま読み取ります" });
    }

    /* 全部は渡っていない、と隠さず伝える */
    if (trimmed.length && F) {
      F.emit("context.trim", { status: "warning",
        label: trimmed.length + "件は先頭のみをAIへ渡しました",
        detail: "AIが一度に読める量に収めるため（" + trimmed.slice(0, 3).join("・") + (trimmed.length > 3 ? " ほか" : "") + "）" });
    }
    var history = arr.slice(0, -2).map(function (m) {
      return { role: m.role === "user" ? "user" : "assistant", content: m.text };
    }).slice(-10);

    st.local.meta = null; st.local.structured = null; st.local.warnings = []; st.choice = null;
    st.local.streaming = true;
    try {
      await L.streamMessage({
        requestId: "r-" + Date.now().toString(36),
        conversationId: cid, messageId: aid,
        message: text, modelId: "standard", thinkingLevel: st.think,
        attachments: attach,
        conversationContext: history,
        history: history,                                /* 旧経路との互換 */
        options: {
          sourceOnly: !!st.sourceOnly,
          requireCitations: false,
          structuredOutput: st.structuredWant || undefined,
          language: "ja",
          allowExternalKnowledge: !st.sourceOnly
        }
      }, function (ev, j) {
        if (gen !== st.local.gen) return;              /* 別会話へ移動した後のトークンは描画しない */
        if (ev === "meta") {
          st.local.jobId = j.jobId;
          try { sessionStorage.setItem(JOB_KEY, JSON.stringify({ jobId: j.jobId, cid: cid, at: Date.now() })); } catch (e) {}
        }
        else if (ev === "token") {
          if (st.thinking) { st.thinking = false; clearInterval(st.thinkTimer); }
          aiMsg.text += j.text;
          aiMsg.html = mdLite(aiMsg.text);
          if (activeSessionId() === cid || cid === "__new__") paintStream(aid, j.text || "", aiMsg.html);
        } else if (ev === "citation") { st.sources = j.sources; st.local.citations = j.citations || []; }
        else if (ev === "usage") { st.local.usage = j; }
        else if (ev === "answer_meta") { st.local.meta = j; }
        else if (ev === "structured") { st.local.structured = j; }
        else if (ev === "warning") { if (j.message) st.local.warnings.push(j.message); }
        else if (ev === "choice") {
          /* 深い思考モデルを準備できないとき等。勝手に別モデルへ差し替えない。 */
          st.choice = { message: j.message || "続行方法を選んでください。", options: j.options || [], code: j.code || "" };
        }
        else if (ev === "error") { st.err = j.message || "ローカルAIでエラーが発生しました。"; }
        else if (ev === "cancelled") { st.err = "生成を停止しました。"; }
      });
    } catch (e) {
      if (gen === st.local.gen) st.err = "ローカルAIへの接続が切断されました。途中までの回答は残しています。";
      aiMsg.status = "interrupted";
    }
    st.local.streaming = false;
    aiMsg.status = aiMsg.status === "streaming" ? "done" : aiMsg.status;
    var nowId = activeSessionId();
    if (nowId === cid || cid === "__new__") finishStream(aid, aiMsg.html);
    saveLocalConv(cid);                                /* 途中回答も含め必ず保存 */
    /* 生成中に本体側でセッションIDが確定した場合は、この会話をそちらへ移す。
       利用者が自分で別の会話へ移った場合（gen が進む）は移さない。 */
    if (gen === st.local.gen && nowId && nowId !== cid && rekeyLocalConv(cid, nowId)) {
      mfRekey(cid, nowId);                              /* 添付の控えも一緒に移す */
      cid = nowId;
      st.lastMsgSig = "";
    }
    /* 本体が「新しいチャット」を作り終えるのは送信より後になることがある。
       完了後もしばらく監視し、IDが確定したら会話をそちらへ移す。
       これをしないと、答えは保存されているのに画面には空のスレッドが出る。 */
    (function watchId(from) {
      var n = 0, myGen = st.local.gen;
      var iv = setInterval(function () {
        if (++n > 25 || myGen !== st.local.gen) { clearInterval(iv); return; }
        var id2 = activeSessionId();
        if (!id2 || id2 === from) return;
        if (rekeyLocalConv(from, id2)) {
          mfRekey(from, id2);
          clearInterval(iv);
          st.lastMsgSig = ""; renderThread(); renderSidebar();
        }
      }, 200);
    })(cid);
    /* ══ 取りこぼしの running は **先に** 必ず閉じる ═════════════════
       1 件でも running が残ると currentRunning() が真を返し続け、
       「考えています」が出たまま・送信ボタンが「停止」のまま戻らない。

       これまでは下の早期 return より **後ろ** に置いてあった。
       別の会話へ移った・次の生成が始まった（gen が進んだ）ときは
       そこで抜けてしまい、running が閉じられないまま残っていた
       （2026-08-13 報告: 生成が終わっても「考えています」が消えない）。
       閉じる処理は gen に関係なく要るので、判定の手前へ動かす。 */
    closeStrayRuns();
    if (gen !== st.local.gen) { updateSend(); return; }
    st.thinking = false; clearInterval(st.thinkTimer);
    try { sessionStorage.removeItem(JOB_KEY); } catch (e) {}
    st.lastMsgSig = ""; renderThread(); updateSend();
    /* 保存済みの本文が画面に出ていないことがまれにある（描画と本体側の
       セッション確定が競合したとき）。中身があるのに空のままなら描き直す。 */
    [220, 700, 1500].forEach(function (ms) {
      setTimeout(function () {
        if (!aiMsg.text) return;
        var node = R.thread.querySelector('[data-mid="' + aid + '"] .b');
        if (node && (node.textContent || "").trim().length) return;
        st.lastMsgSig = ""; renderThread();
      }, ms);
    });
  }
  /* 依存なしの最小 Markdown（コードブロック/見出し/箇条書き/強調/表は簡易） */
  function mdInline(x) {
    return x
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  /* 表・順序付きリスト・引用・水平線に対応した軽量 Markdown（依存ライブラリなし） */
  function mdLite(t) {
    var src = String(t || ""), code = [];
    src = src.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, function (m0, lang, body) {
      code.push('<pre><code data-lang="' + esc(lang) + '">' + esc(body.replace(/\n$/, "")) + "</code></pre>");
      return "@@VQCODE" + (code.length - 1) + "@@";
    });
    var lines = src.split("\n"), i = 0, blocks = [];
    function isSep(x) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(x); }
    function cells(x) {
      return x.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")
        .map(function (c) { return mdInline(esc(c.trim())); });
    }
    while (i < lines.length) {
      var L = lines[i];
      if (/^@@VQCODE\d+@@$/.test(L.trim())) { blocks.push(L.trim()); i++; continue; }
      if (!L.trim()) { i++; continue; }
      /* 表 */
      if (L.indexOf("|") >= 0 && i + 1 < lines.length && isSep(lines[i + 1])) {
        var head = cells(L); i += 2; var rows = [];
        while (i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
        blocks.push("<table><thead><tr>" + head.map(function (c) { return "<th>" + c + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table>");
        continue;
      }
      /* 見出し */
      var hm = /^(#{1,6})\s+(.+)$/.exec(L);
      if (hm) { var lv = Math.min(4, hm[1].length + 1); blocks.push("<h" + lv + ">" + mdInline(esc(hm[2])) + "</h" + lv + ">"); i++; continue; }
      /* 水平線 */
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(L)) { blocks.push("<hr>"); i++; continue; }
      /* 引用 */
      if (/^\s*>\s?/.test(L)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(mdInline(esc(lines[i].replace(/^\s*>\s?/, "")))); i++; }
        blocks.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue;
      }
      /* リスト（順序付き / 箇条書き・1段ネスト対応） */
      if (/^\s*([-*+]|\d+[.)])\s+/.test(L)) {
        var ordered = /^\s*\d+[.)]\s+/.test(L), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          var ind = (/^(\s*)/.exec(lines[i])[1] || "").length;
          items.push({ d: ind >= 2 ? 1 : 0, t: mdInline(esc(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""))) });
          i++;
        }
        var inner = "", open = 0;
        for (var k = 0; k < items.length; k++) {
          if (items[k].d === 1 && !open) { inner += "<ul>"; open = 1; }
          if (items[k].d === 0 && open) { inner += "</ul>"; open = 0; }
          inner += "<li>" + items[k].t + "</li>";
        }
        if (open) inner += "</ul>";
        blocks.push((ordered ? "<ol>" : "<ul>") + inner + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      /* 段落 */
      /* 段落の打ち切り条件は、箇条書き判定と同じ「記号のあとに空白」でなければならない。
         ここで空白を要求しないと "**太字**で始まる行" が箇条書きにも段落にもならず、
         本文が丸ごと消える（実際に回答が空になる不具合が出た）。 */
      var para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*([-*+]\s+|\d+[.)]\s+|>|#{1,6}\s)/.test(lines[i]) &&
             !/^@@VQCODE\d+@@$/.test(lines[i].trim()) &&
             !(lines[i].indexOf("|") >= 0 && i + 1 < lines.length && isSep(lines[i + 1]))) {
        para.push(mdInline(esc(lines[i]))); i++;
      }
      if (para.length) blocks.push("<p>" + para.join("<br>") + "</p>"); else i++;
    }
    return blocks.join("").replace(/@@VQCODE(\d+)@@/g, function (m0, n) { return code[Number(n)] || ""; });
  }

  /* ── ローカルAIの接続状態 ── */
  async function refreshLocal() {
    var L = window.__vqLocalAI; if (!L) return;
    var chip0 = R.root.querySelector("[data-localchip]");
    if (chip0) { chip0.hidden = true; chip0.textContent = ""; }
    var url = await L.discover();
    st.local.url = url || "";
    st.local.ready = !!(url && L.isPaired());
    /* **表示そのものを出さない。** ローカルAI は使わないので、
       「接続済み」と出ていると、そちらで答えていると誤解される。 */
    var chip = R.root.querySelector("[data-localchip]");
    if (chip) { chip.hidden = true; chip.textContent = ""; }
  }
  async function doPair() {
    var L = window.__vqLocalAI;
    var url = await L.discover();
    if (!url) { alert("Local AI Bridge が見つかりません。ターミナルで local-ai/scripts/start.sh を実行してください。"); return; }
    var code = prompt("Local AI Bridge のターミナルに表示されている接続コード（6桁）を入力してください");
    if (!code) return;
    var r = await L.pair(code);
    if (!r.ok) { alert("ペアリングに失敗しました: " + r.error); return; }
    await refreshLocal();
    alert("ローカルAIへ接続しました。以後 Standard はこの端末内で処理されます。");
  }

  function autoGrow() {
    R.ta.style.height = "auto";
    R.ta.style.height = Math.min(230, R.ta.scrollHeight) + "px";
  }

  /* ── イベント ── */
  function wire() {
    var r = R.root;

    r.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== r && !(el.dataset && (el.dataset.a || el.dataset.ses || el.dataset.proj || el.dataset.model || el.dataset.think))) el = el.parentNode;
      if (!el || el === r) return;
      var d = el.dataset;
      if (d.model) { st.modelId = d.model; renderMenus(); closeDD(); return; }
      if (d.think) { st.think = d.think; savePrefs(); renderMenus(); closeDD(); return; }
      switch (d.a) {
        case "send": doSend(); return;
        case "attach": if (R.fi) R.fi.click(); return;
        case "unattach": if (VQF()) VQF().remove(d.fid); renderFiles(); updateSend(); return;
        case "refile": if (VQF()) VQF().retry(d.fid); return;
        case "modelMenu": toggleDD(R.ddModel, el); return;
        case "thinkMenu": toggleDD(R.ddThink, el); return;
        case "new": {
          leaveConversation();
          var prev = activeSessionId();
          /* 前の「新規」の控えが残っていると、次の会話で発言と添付の番号がずれる */
          mfClear("__new__");
          bridgeAction("newSession");
          r.classList.remove("side-on"); renderFiles();
          /* 本体が新セッションを作り終える(=activeSessionId が変わる)まで待って再描画 */
          var n = 0, iv = setInterval(function () {
            if (activeSessionId() !== prev || ++n > 25) {
              clearInterval(iv);
              st.lastMsgSig = ""; renderSidebar(); renderThread(); layout(); updateSend();
            }
          }, 120);
          return;
        }
        case "search": bridgeAction("sidebarSearch"); return;
        case "projects": bridgeAction("sidebarProject"); return;
        case "openSide": r.classList.add("side-on"); return;
        case "closeSide": {
          /* スマホ: 履歴の引き出しを閉じるだけ。
             PC: 引き出しはもともと開いたままなので、このボタンは何も起きていなかった。
                 Quick Chat はアプリの左パネルを覆ってしまい、ここから出られない。
                 だから PC ではこの × を「アプリへ戻る」にする。 */
          if (isNarrow()) { r.classList.remove("side-on"); return; }
          toggleAppNav(); return;
        }
        case "localPair": doPair(); return;
        case "choice": {
          var pick = d.cid; st.choice = null;
          if (pick === "cancel") { st.lastMsgSig = ""; renderThread(); return; }
          if (pick === "continue-normal") { st.think = "normal"; savePrefs(); renderMenus(); }
          /* retry / continue-normal はどちらも直前のユーザー発言を再送する */
          var ms2 = readMessages(), last2 = "";
          for (var z = ms2.length - 1; z >= 0; z--) if (ms2[z].role === "user") { last2 = ms2[z].text; break; }
          if (last2) { st.err = ""; R.ta.value = last2; doSend(); }
          return;
        }
        case "toggleAct": setAct(!st.actOpen); return;
        case "closeAct": setAct(false); return;
        case "closeOverlays": r.classList.remove("side-on"); if (st.actOpen) setAct(false); return;
        case "jump":
          st.follow = true;
          st.autoScrolling = true;
          R.scroll.scrollTo({ top: R.scroll.scrollHeight, behavior: "smooth" });
          setTimeout(function () { st.autoScrolling = false; syncJump(); }, 420);
          R.jump.classList.remove("on");
          return;
        case "copy": {
          var mid = d.mid, node = R.thread.querySelector('[data-mid="' + mid + '"] .b');
          if (node) { try { navigator.clipboard.writeText(node.textContent || ""); } catch (er) {} el.classList.add("ok"); setTimeout(function () { el.classList.remove("ok"); }, 1200); }
          return;
        }
        case "regen": {
          /* 直近のユーザー発言を再送＝実エンジンで再生成 */
          var ms = readMessages(), last = "";
          for (var i = ms.length - 1; i >= 0; i--) if (ms[i].role === "user") { last = ms[i].text; break; }
          if (last) { st.err = ""; R.ta.value = last; doSend(); }
          return;
        }
        case "sesMenu": {
          e.stopPropagation();
          var btn = document.querySelector('#appChatSessionList .app-chat-session-options-btn[data-chat-ids="' + cssEsc(d.ses) + '"]');
          if (btn) btn.click();
          return;
        }
      }
      if (d.ses) { switchSession(d.ses); return; }
      if (d.proj) { bridgeAction("sidebarProject"); return; }
    });

    if (R.fi) R.fi.addEventListener("change", function () {
      /* input.files は「生きている」FileList。add() は途中で await するので、
         その前に value="" で入力欄を空にすると、2件目以降が読まれる前に消える。
         ＝3件選んでも1件しか添付されない（理由も出ない）。先に配列へ写しておく。 */
      var picked = R.fi.files ? Array.prototype.slice.call(R.fi.files) : [];
      R.fi.value = "";
      if (picked.length && VQF()) VQF().add(picked);
    });
    /* 入力 */
    R.ta.addEventListener("input", function () { autoGrow(); updateSend(); });
    R.ta.addEventListener("focus", function () { R.composer.classList.add("focus"); });
    R.ta.addEventListener("blur", function () { R.composer.classList.remove("focus"); });
    R.ta.addEventListener("compositionstart", function () { R.ta.dataset.ime = "1"; });
    R.ta.addEventListener("compositionend", function () { R.ta.dataset.ime = ""; });
    R.ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        if (R.ta.dataset.ime === "1" || e.isComposing || e.keyCode === 229) return;   /* IME確定は送信しない */
        e.preventDefault(); doSend();
      }
    });
    /* 貼り付け画像 */
    R.ta.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { e.preventDefault(); if (VQF()) VQF().add(items); }
    });
    /* ドラッグ＆ドロップ */
    ["dragenter", "dragover"].forEach(function (k) {
      r.addEventListener(k, function (e) { e.preventDefault(); r.classList.add("dragging"); });
    });
    ["dragleave", "drop"].forEach(function (k) {
      r.addEventListener(k, function (e) { e.preventDefault(); if (k === "dragleave" && e.target !== r) return; r.classList.remove("dragging"); });
    });
    r.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) { if (VQF()) VQF().add(f); }
    });

    /* 自動追従 */
    R.scroll.addEventListener("scroll", function () {
      /* 自前でスクロールを動かした直後の scroll イベントで follow を戻さない
         （戻すと、利用者が上へ動かしても即座に下へ引っ張られる） */
      if (st.autoScrolling) return;
      var atEnd = R.scroll.scrollHeight - R.scroll.scrollTop - R.scroll.clientHeight < 60;
      st.follow = atEnd;
      syncJump();
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (document.body.getAttribute("data-app-tab") !== "chat") return;
      if (e.key === "Escape") { closeDD(); R.root.classList.remove("side-on"); if (st.actOpen) setAct(false); }
      if ((e.key === "o" || e.key === "O") && e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); bridgeAction("newSession"); }
    });

    /* 実DOMの監視: メッセージ / セッション / 添付 / 作業パネル */
    var listEl = $("appChatList");
    try {
      if (listEl) new MutationObserver(function () {
        var ms = readMessages();
        var hasTyping = ms.some(function (m) { return m.role === "typing"; });
        var hasAi = ms.length && ms[ms.length - 1].role === "ai" && ms[ms.length - 1].html;
        /* ローカルAIで動いている間は、ここで止めてはいけない。
           busy() はクラウド側の状態しか見ないので、ローカル実行中は常に false になり、
           送信の直後に「考えています」が消えて、12秒間なにも出ないままになっていた。 */
        var localBusy = st.local.streaming || !!(VQF() && VQF().currentRunning());
        if (!localBusy && (hasAi || (!hasTyping && !busy()))) stopThinking();
        renderThread(); updateSend();
      }).observe(listEl, { childList: true, subtree: true, characterData: true });
      var sesEl = $("appChatSessionList");
      if (sesEl) new MutationObserver(function () { renderSidebar(); loadPrefs(); }).observe(sesEl, { childList: true, subtree: true });
      if (window.__vqChatFiles) window.__vqChatFiles.subscribe(function () {
        renderFiles(); updateSend(); if (st.actOpen) renderActivity();
        /* 書き換えるのは .wave の中身だけ。.think__l を textContent で上書きすると
           波打つ span ごと消えて、アニメーションが二度と出なくなる。 */
        if (st.thinking) {
          var tl2 = R.thread.querySelector(".think__l .wave");
          if (tl2) { var nx2 = thinkingLine(); if (tl2.textContent !== nx2) tl2.textContent = nx2; }
          else { st.lastMsgSig = ""; renderThread(); }
        }
      });
      var proc = $("appChatProcessList");
      if (proc) new MutationObserver(function () { if (st.actOpen) renderActivity(); }).observe(proc, { childList: true, subtree: true, characterData: true });
    } catch (e) {}

    setInterval(function () {
      if (document.body.getAttribute("data-app-tab") !== "chat") return;
      updateSend();
      /* ローカルAIの実行中は busy() が false でも「動いていない」ではない（上と同じ理由） */
      var localBusy2 = st.local.streaming || !!(VQF() && VQF().currentRunning());
      if (!busy() && !localBusy2) { stopThinking(); clearTimeout(st.longTimer); }
      /* ══ 取りこぼしの見張り ═══════════════════════════════════════
         どこかで閉じ忘れると running が残り、「考えています」も
         「停止」ボタンも戻らなくなる。閉じ忘れは仕組みで拾う。
         **45 秒なにも動きが無かったものだけ**を閉じるので、
         大きな資料を読んでいる最中のもの（途中経過が届く）は巻き込まない。 */
      if (!busy() && !st.local.streaming && closeStrayRuns(45000)) {
        stopThinking(); st.lastMsgSig = ""; renderThread(); updateSend();
      }
      if (st.actOpen) renderActivity();
    }, 900);

    /* 下部バーの実高さを CSS 変数へ渡す（隠れ防止・実測値を使う） */
    function syncBottomBar() {
      var mb = document.getElementById("vqMobBar");
      var h = (mb && getComputedStyle(mb).display !== "none") ? Math.round(mb.getBoundingClientRect().height) : 0;
      R.root.style.setProperty("--vqc-bottombar", h + "px");
    }
    syncBottomBar();
    window.addEventListener("resize", syncBottomBar);
    setInterval(syncBottomBar, 2000);
    refreshLocal(); setInterval(refreshLocal, 4000);
    setTimeout(function () { restoreJob().catch(function () {}); }, 1200);
    window.__vqChatLocalRefresh = refreshLocal;
    var pv = lsGet(PANEL_KEY, null);
    st.actUserClosed = !!(pv && pv.userClosed);

    /* Chat タブに入ったら AI ペインへ寄せる＋描画し直す。
       開いたときは必ず最新（最下部）を見せる。前回どこを見ていたかに関わらず、
       会話は下が最新なので、開いて上の方が出ていると迷う。 */
    function onTab() {
      if (document.body.getAttribute("data-app-tab") !== "chat") return;
      ensureAiPane();
      st.follow = true;
      setTimeout(function () {
        ensureAiPane(); st.lastMsgSig = "";
        renderSidebar(); renderThread(); renderFiles(); updateSend();
        layout();
        st.follow = true; stickBottom();
        /* 画像や折り返しで高さが後から変わるぶんの取りこぼしを拾う */
        setTimeout(function () { if (st.follow) stickBottom(); }, 260);
        setTimeout(function () { if (st.follow) stickBottom(); }, 700);
      }, 260);
    }
    onTab();

    /* 画面幅や入力欄の高さが変わったら、ボタンの位置の基準を測り直す。
       ここは測るだけ（描画はしない）。入力中に何度も呼ばれるため。 */
    var relayout = function () { syncCwrapVar(); syncJump(); };
    window.addEventListener("resize", relayout);
    /* × の言い方は画面幅で変わるので、幅が変わったら合わせ直す */
    window.addEventListener("resize", syncCloseLabel);
    syncCloseLabel();
    try { new ResizeObserver(relayout).observe(R.cwrap); } catch (e) {}
    try { new MutationObserver(onTab).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] }); } catch (e) {}
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  /* 既存 Chat タブは「選択(choose)」ペインで開くため、AIペインへ寄せておく。
     これをしないと送信ハンドラが AI ペース非アクティブとみなして何も起きない。 */
  function ensureAiPane() {
    var page = $("appChatPage"); if (!page) return;
    if (page.getAttribute("data-collab-pane") === "ai") return;
    var b = page.querySelector('[data-collab-action="switchPane"][data-id="ai"]');
    if (b) b.click();
  }
  function bridgeAction(name) {
    var el = document.querySelector('#appAiChatShell [data-chat-action="' + name + '"]');
    if (el) { el.click(); return true; }
    return false;
  }
  /* 会話を離れるときは進行中ストリームを打ち切り、世代を進める */
  function leaveConversation() {
    st.local.gen++;
    if (window.__vqLocalAI) { try { window.__vqLocalAI.cancelGeneration(); } catch (e) {} }
    st.thinking = false; clearInterval(st.thinkTimer); st.thinkTimer = 0;
    st.err = ""; st.sources = []; st.follow = true;
    if (VQF()) VQF().clear();
    R.ta.value = ""; autoGrow();
    st.lastMsgSig = "";
  }
  function switchSession(id) {
    leaveConversation();
    var li = document.querySelector('#appChatSessionList .app-chat-session-item[data-chat-ids="' + cssEsc(id) + '"]');
    if (li) li.click();
    R.root.classList.remove("side-on");
    setTimeout(function () { renderSidebar(); loadPrefs(); st.lastMsgSig = ""; renderThread(); }, 220);
  }
  /* 選択パネルは必ずボタンの真上に出し、画面からはみ出さないようにする。
     入りきらないときは高さを詰めて中でスクロールさせる（下へ潜らせない）。 */
  function toggleDD(dd, anchor) {
    var was = dd.classList.contains("on");
    closeDD();
    if (was) return;
    var ar = anchor.getBoundingClientRect(), cr = R.composer.getBoundingClientRect();
    var rr = R.root.getBoundingClientRect();
    var MG = 8;

    dd.style.maxHeight = "";
    dd.classList.add("on");                       /* 実寸を測るため先に出す */
    var need = dd.offsetHeight;
    var above = ar.top - rr.top - MG;             /* ボタンより上に使える高さ */
    if (need > above) dd.style.maxHeight = Math.max(120, above) + "px";

    /* 縦: パネル下端をボタン上端の 6px 上へ（composer が基準） */
    dd.style.bottom = Math.round(cr.bottom - ar.top + 6) + "px";

    /* 横: 画面の左右からはみ出さないところまで寄せる */
    var w = dd.offsetWidth;
    var left = ar.left - cr.left;
    var maxLeft = (rr.right - MG) - cr.left - w;
    var minLeft = (rr.left + MG) - cr.left;
    dd.style.left = Math.round(Math.max(minLeft, Math.min(left, maxLeft))) + "px";

    requestAnimationFrame(function () { dd.classList.add("in"); });
  }
  function closeDD() {
    R.ddModel.classList.remove("on"); R.ddModel.classList.remove("in");
    R.ddThink.classList.remove("on"); R.ddThink.classList.remove("in");
  }

  /* 公開: ピン留めのトグル（サイドバー行の⋯からアプリ側メニューを使いつつ、
     ピンは本UI側の永続データとして持つ） */
  window.__vqChat = {
    togglePin: function (id) {
      var pins = lsGet(PIN_KEY, []); if (!Array.isArray(pins)) pins = [];
      var i = pins.indexOf(id);
      if (i >= 0) pins.splice(i, 1); else pins.push(id);
      lsSet(PIN_KEY, pins); renderSidebar(); return pins.indexOf(id) >= 0;
    },
    provider: function () { return VQChatProvider; },
    models: MODELS,
    thinkingLevels: THINK,
    /* 待ち時間の文言（検証から中身を確かめられるように公開する） */
    thinkingLine: thinkingLine,
    refresh: function () { st.lastMsgSig = ""; renderSidebar(); renderThread(); renderFiles(); }
  };

  build();
})();

