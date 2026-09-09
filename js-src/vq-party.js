/* ══════════════════════════════════════════════════════════════════════════
   みんなで解く（ライブルーム）　画面側　2026-09-10
   訴え「他のユーザーとカフートのように、部屋（PINコード6桁 V から始まる）を
        作って、それを入力し、ユーザーのニックネームを設定したら始まる仕組みに。
        一番メインは、プリセットの画面。それぞれ回答が色別でリアルタイム上で
        共有され、その下にそれぞれユーザーのアイコンが表示される。
        ユーザーが回答共有を許可したら、アイコンが外れ、リアルタイムでの回答が
        表示される。正誤も。ランキングでポイントもある。」

   ★ 作りの 決まり（実測で 決まって いる）
     1. **U.mount で 別画面を 作らない。** それは ほかの V2 画面を 全部 畳むので、
        出題画面が 閉じる。参加者の 帯は `VQ2.quizNow.影` の 中へ 差し込む。
     2. 影の DOM に 外の CSS は 届かない。**style を 影へ 直接 入れる。**
        ただし `--vq-*` の トークンは 器ごしに 届く（それは 使ってよい）。
     3. 出題画面は 問題が 変わるたび 中身を 丸ごと 入れ替える。
        `vq:quiz:render` を 受けて **毎回 差し直す**。
     4. 正誤と 点は **サーバが 出す**。画面で 出すと いくらでも 言い張れる。

   ★ 名前は **vq-party**。`vq-live` は すでに Lumi の 音声会話が 使って いる
     （`js-src/vq-live.9628a32d29.js`・`window.__vqLive`）。同じ 名前に すると
     こちらの 入口が **黙って 何も しなく なる**（実測で 踏んだ:
     先に 読まれた ほうが `if (root.__vqLive) return;` で 止まる）。

   出す もの: window.__vqParty
     開く()        入口（作る / 入る を 選ぶ）
     作る(preset)  そのプリセットで 部屋を 作る
     入る(pin)     PIN から 入る
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var root = window, doc = document;
  if (root.__vqParty) return;

  var API = (function () {
    try { if (root.VQ2 && root.VQ2.apiBase) return root.VQ2.apiBase(); } catch (e) {}
    try { if (root.__vqApiBase) return root.__vqApiBase; } catch (e) {}
    return "";
  })();
  var K_ME = "vq.live.me.v1";      /* 入り直し用の 鍵 */

  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  var q = function (sel, r) { return (r || doc).querySelector(sel); };

  /* 人ごとの 色。**12 色。** 隣どうしが 似ない 順に 並べて ある。 */
  var COLORS = [
    "#E5484D", "#0090FF", "#30A46C", "#F76B15",
    "#8E4EC6", "#12A594", "#E93D82", "#FFB224",
    "#3E63DD", "#46A758", "#D6409F", "#5B5BD6"
  ];
  var 色 = function (i) { return COLORS[(Number(i) || 0) % COLORS.length]; };
  var 頭文字 = function (name) {
    var s = String(name || "").trim();
    return s ? s.slice(0, 2) : "？";
  };

  /* ══ 通信 ══════════════════════════════════════════════════════════ */
  function 頼む(path, o) {
    o = o || {};
    var h = { "Content-Type": "application/json" };
    try {
      var t = root.VQ2 && root.VQ2.auth && root.VQ2.auth.token && root.VQ2.auth.token();
      if (!t) { try { t = root.localStorage.getItem("wordPractice400.auth.token"); } catch (e) {} }
      if (t) h.Authorization = "Bearer " + t;
    } catch (e) {}
    return root.fetch(API + path, {
      method: o.method || "GET", headers: h,
      body: o.body ? JSON.stringify(o.body) : undefined
    }).then(function (r) { return r.json(); });
  }

  /* ══ 部屋との つなぎ ══════════════════════════════════════════════
     ★ 切れたら **自分で 戻る**。教室の Wi-Fi は よく 切れる。 */
  function つなぐ(pin, key, 受ける) {
    var ws = null, 死 = false, 待ち = 500, 再 = null;
    function 開く() {
      if (死) return;
      var u = (API || location.origin).replace(/^http/, "ws") + "/ws/live/" + pin + "?k=" + encodeURIComponent(key);
      try { ws = new WebSocket(u); } catch (e) { 戻す(); return; }
      ws.onopen = function () { 待ち = 500; 受ける({ t: "_open" }); };
      ws.onmessage = function (e) {
        var m = null;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        受ける(m);
      };
      ws.onclose = function () { 受ける({ t: "_close" }); 戻す(); };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }
    function 戻す() {
      if (死) return;
      try { if (再) clearTimeout(再); } catch (e) {}
      再 = setTimeout(開く, 待ち);
      待ち = Math.min(8000, Math.round(待ち * 1.7));
    }
    開く();
    return {
      送る: function (m) { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch (e) {} },
      閉じる: function () { 死 = true; try { if (再) clearTimeout(再); } catch (e) {} try { ws && ws.close(); } catch (e) {} }
    };
  }

  /* ══ 見た目 ══════════════════════════════════════════════════════ */
  var CSS = [
    ".vql{position:fixed;inset:0;z-index:2147483400;display:flex;align-items:center;justify-content:center;",
      "background:rgba(20,16,40,.62);backdrop-filter:blur(6px);font-family:inherit;}",
    ".vql-card{width:min(520px,92vw);max-height:88vh;overflow:auto;background:var(--vq-surface,#fff);",
      "color:var(--vq-text,#2B2836);border-radius:22px;padding:26px 24px 22px;box-shadow:0 24px 70px rgba(20,10,50,.36);}",
    ".vql-h{font-size:20px;font-weight:800;margin:0 0 4px;}",
    ".vql-sub{font-size:13.5px;color:var(--vq-text-secondary,#7A7589);margin:0 0 18px;line-height:1.7;}",
    ".vql-row{display:flex;gap:10px;flex-wrap:wrap;}",
    ".vql-b{flex:1 1 180px;min-height:96px;border-radius:16px;border:1px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-surface,#fff);cursor:pointer;font:inherit;color:inherit;padding:14px;text-align:left;",
      "display:flex;flex-direction:column;gap:5px;transition:transform .12s,box-shadow .12s;}",
    ".vql-b:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(80,60,140,.16);}",
    ".vql-b b{font-size:15px;}",
    ".vql-b span{font-size:12.5px;color:var(--vq-text-secondary,#7A7589);line-height:1.6;}",
    ".vql-pin{width:100%;font-size:34px;font-weight:800;letter-spacing:.22em;text-align:center;",
      "padding:14px 10px;border-radius:14px;border:2px solid var(--vq-border,#DED8EE);background:var(--vq-bg,#FCFBFE);",
      "color:inherit;font-family:inherit;text-transform:uppercase;}",
    ".vql-pin:focus{outline:none;border-color:var(--vq-accent,#756DB3);}",
    ".vql-in{width:100%;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-bg,#FCFBFE);color:inherit;font-family:inherit;}",
    ".vql-go{width:100%;height:52px;margin-top:14px;border:0;border-radius:14px;cursor:pointer;",
      "background:var(--vq-accent,#756DB3);color:#fff;font-size:16px;font-weight:750;font-family:inherit;}",
    ".vql-go[disabled]{opacity:.45;cursor:default;}",
    ".vql-x{position:absolute;right:18px;top:14px;width:38px;height:38px;border:0;border-radius:999px;",
      "background:rgba(255,255,255,.14);color:#fff;font-size:20px;cursor:pointer;}",
    ".vql-err{margin-top:10px;font-size:13px;color:var(--vq-danger,#C62A2F);min-height:18px;}",
    ".vql-code{font-size:44px;font-weight:800;letter-spacing:.2em;text-align:center;margin:10px 0 6px;",
      "font-variant-numeric:tabular-nums;}",
    ".vql-people{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;}",
    ".vql-p{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 4px;border-radius:999px;",
      "background:var(--vq-surface-sunken,#F6F4FB);font-size:13px;font-weight:650;}",
    ".vql-av{width:26px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;",
      "color:#fff;font-size:11px;font-weight:800;}"
  ].join("");

  /* 覆いを 1 枚 出す（入口・ロビー・結果 用）。
     ★ ここは 出題画面が 開く 前 なので 覆いで よい。 */
  function 覆い(html) {
    var old = q("#vqPartyOverlay");
    if (old) old.remove();
    var host = doc.createElement("div");
    host.id = "vqPartyOverlay";
    var sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = "<style>" + CSS + "</style><div class='vql'><div class='vql-card'>" + html + "</div></div>";
    doc.body.appendChild(host);
    return {
      影: sh, 器: host,
      閉じる: function () { try { host.remove(); } catch (e) {} },
      書く: function (h) { sh.querySelector(".vql-card").innerHTML = h; }
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     参加者の 帯（**出題画面の 影の DOM の 中**へ 差し込む）
     ══════════════════════════════════════════════════════════════════ */
  var 帯CSS = [
    ".vqlb{position:absolute;left:0;right:0;bottom:0;z-index:40;padding:8px 10px 10px;",
      "background:linear-gradient(0deg,var(--vq-surface,#fff) 78%,rgba(0,0,0,0));",
      "border-top:1px solid var(--vq-border-subtle,#ECEAF4);}",
    ".vqlb-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11.5px;",
      "color:var(--vq-text-secondary,#7A7589);font-weight:650;}",
    ".vqlb-pin{font-weight:800;letter-spacing:.12em;color:var(--vq-accent-text,#5F579E);}",
    ".vqlb-list{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch;}",
    ".vqlb-i{flex:0 0 auto;min-width:52px;max-width:150px;border-radius:12px;padding:5px 8px;",
      "background:var(--vq-surface-sunken,#F6F4FB);display:flex;flex-direction:column;align-items:center;gap:3px;",
      "border:2px solid transparent;transition:border-color .15s;}",
    ".vqlb-i.is-ok{border-color:#30A46C;}",
    ".vqlb-i.is-ng{border-color:#E5484D;}",
    ".vqlb-i.is-done{background:var(--vq-accent-subtle,#F2EEFB);}",
    ".vqlb-i.is-off{opacity:.4;}",
    ".vqlb-av{width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;",
      "color:#fff;font-size:12px;font-weight:800;flex:0 0 auto;}",
    ".vqlb-n{font-size:10.5px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqlb-a{font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;color:#fff;max-width:100%;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqlb-s{font-size:10px;color:var(--vq-text-secondary,#7A7589);font-variant-numeric:tabular-nums;}",
    /* 選択肢の 上に 打つ 人の 点 */
    ".vqld{position:absolute;right:6px;top:6px;display:flex;gap:3px;flex-wrap:wrap;max-width:60%;",
      "justify-content:flex-end;pointer-events:none;z-index:6;}",
    ".vqld i{width:11px;height:11px;border-radius:999px;display:block;box-shadow:0 0 0 2px var(--vq-surface,#fff);}",
    /* 参加者が 押す「見せる」 */
    ".vqlb-share{margin-left:auto;border:1px solid var(--vq-border,#DED8EE);background:var(--vq-surface,#fff);",
      "border-radius:999px;height:26px;padding:0 11px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;",
      "color:var(--vq-text-secondary,#7A7589);}",
    ".vqlb-share.is-on{background:var(--vq-accent,#756DB3);color:#fff;border-color:transparent;}",
    ".vqlb-host{margin-left:6px;border:0;border-radius:999px;height:26px;padding:0 13px;font:inherit;font-size:11.5px;",
      "font-weight:750;cursor:pointer;background:var(--vq-accent,#756DB3);color:#fff;}"
  ].join("");

  /* ══════════════════════════════════════════════════════════════════
     本体
     ══════════════════════════════════════════════════════════════════ */
  var 場 = null;   /* いまの 部屋 */

  function 状態() {
    return 場;
  }

  /* ── 入口 ───────────────────────────────────────────────────── */
  function 開く(o) {
    o = o || {};
    var ov = 覆い(
      "<h2 class='vql-h'>みんなで解く</h2>"
      + "<p class='vql-sub'>同じ 問題を みんなで 同時に 解きます。"
      + "部屋を 作ると <b>6 文字の PIN</b> が 出ます。参加する 人は それを 入れるだけ —— "
      + "<b>ログインは 要りません</b>。</p>"
      + "<div class='vql-row'>"
      + "<button class='vql-b' data-go='make'><b>部屋を 作る</b><span>自分の プリセットで 出題します。PIN が 出ます。</span></button>"
      + "<button class='vql-b' data-go='join'><b>PIN で 入る</b><span>先生や 友だちから 聞いた 6 文字を 入れます。</span></button>"
      + "</div>"
    );
    ov.影.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-go]");
      if (!b) return;
      ov.閉じる();
      if (b.getAttribute("data-go") === "join") 入る画面(o.pin || "");
      else 作る画面();
    });
    /* 背景を 押したら 閉じる */
    ov.影.querySelector(".vql").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) ov.閉じる();
    });
  }

  /* ── 入る（PIN → ニックネーム）───────────────────────────────── */
  function 入る画面(pin0) {
    var ov = 覆い(
      "<h2 class='vql-h'>PIN で 入る</h2>"
      + "<p class='vql-sub'>先生の 画面に 出ている <b>6 文字</b>（V から 始まります）を 入れてください。</p>"
      + "<input class='vql-pin' data-pin maxlength='6' placeholder='V _ _ _ _ _' value='" + esc(pin0 || "") + "' autocomplete='off' spellcheck='false'>"
      + "<div style='height:10px'></div>"
      + "<input class='vql-in' data-nick maxlength='16' placeholder='ニックネーム（みんなに 見えます）'>"
      + "<div class='vql-err' data-err></div>"
      + "<button class='vql-go' data-join>入る</button>"
    );
    var sh = ov.影;
    var pinEl = sh.querySelector("[data-pin]"), nickEl = sh.querySelector("[data-nick]");
    var err = sh.querySelector("[data-err]"), go = sh.querySelector("[data-join]");
    pinEl.focus();
    /* 6 文字 入ったら 名前へ 送る（打ち直させない） */
    pinEl.addEventListener("input", function () {
      pinEl.value = pinEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (pinEl.value.length === 6) nickEl.focus();
    });
    var 送る = function () {
      var pin = pinEl.value.trim().toUpperCase(), nick = nickEl.value.trim();
      if (!/^V[0-9A-Z]{5}$/.test(pin)) { err.textContent = "PIN は V で 始まる 6 文字です。"; return; }
      if (!nick) { err.textContent = "ニックネームを 入れてください。"; nickEl.focus(); return; }
      go.disabled = true; err.textContent = "";
      var 前 = null;
      try { 前 = JSON.parse(root.localStorage.getItem(K_ME) || "null"); } catch (e) {}
      頼む("/api/live/join", { method: "POST", body: {
        pin: pin, nickname: nick,
        rejoinKey: (前 && 前.pin === pin) ? 前.key : ""
      } }).then(function (r) {
        go.disabled = false;
        if (!r || !r.ok) { err.textContent = (r && r.message) || "入れませんでした。"; return; }
        try { root.localStorage.setItem(K_ME, JSON.stringify({ pin: pin, key: r.key, you: r.you })); } catch (e) {}
        ov.閉じる();
        始める({ pin: pin, key: r.key, you: r.you, host: false, room: r.room });
      }, function () { go.disabled = false; err.textContent = "つながりませんでした。"; });
    };
    go.addEventListener("click", 送る);
    sh.addEventListener("keydown", function (e) { if (e.key === "Enter") 送る(); });
  }

  /* ── 作る（プリセットを 選んで 部屋を 作る）──────────────────── */
  function 作る画面(preset) {
    if (preset) return 作る(preset);
    /* プリセットが 渡されて いなければ、一覧から 選んで もらう */
    var list = [];
    try {
      var ST = root.VQ2 && root.VQ2.store;
      list = (ST && ST.presets && ST.presets.list ? ST.presets.list() : []) || [];
    } catch (e) { list = []; }
    var 使える = list.filter(function (p) { return p && (p.questions || []).length; });
    if (!使える.length) {
      var o1 = 覆い("<h2 class='vql-h'>プリセットが ありません</h2>"
        + "<p class='vql-sub'>先に 問題を 作ってから、もう一度 お試しください。</p>"
        + "<button class='vql-go' data-x>閉じる</button>");
      o1.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o1.閉じる(); });
      return;
    }
    var ov = 覆い("<h2 class='vql-h'>どれで やりますか</h2>"
      + "<p class='vql-sub'>選んだ プリセットの 問題を みんなで 解きます。</p>"
      + "<div class='vql-row' style='flex-direction:column'>"
      + 使える.slice(0, 30).map(function (p, i) {
          return "<button class='vql-b' data-i='" + i + "' style='min-height:auto'><b>" + esc(p.title || "名前なし")
            + "</b><span>" + (p.questions || []).length + " 問</span></button>";
        }).join("")
      + "</div>");
    ov.影.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-i]");
      if (!b) return;
      ov.閉じる();
      作る(使える[Number(b.getAttribute("data-i"))]);
    });
  }

  /* ══ みんなで解くに **出せる 形式**（2026-09-10）════════════════════
     出せない ものを 混ぜると、選択肢の 無い 文字入力に 化けて
     **答えようが ない 問題**が 出る。だから 部屋に 入れる 前に よける。
     ★ よけた ことは 隠さない。何問 よけたかを 先生に 見せる。
     ★ ここに 足す ときは server/src/live.js の 採点() も 一緒に 直す
       （こちらだけ 増やすと「出るのに 正誤が 付かない」に なる）。 */
  var 出せる形式 = {
    single_choice: 1, multiple_choice_single: 1, choice_2: 1, choice_3: 1, choice_5: 1,
    multi_choice: 1, multiple_choice_multiple: 1,
    true_false: 1,
    text_input: 1, word_input: 1,
    numeric_input: 1, numeric: 1
  };
  function 出せるか(q) {
    if (!q) return false;
    var t = String(q.type || "");
    if (出せる形式[t]) return true;
    /* 形式名が 分からなくても、**選択肢が あれば 出せる**（4択と 同じ 扱い）。 */
    return Array.isArray(q.choices) && q.choices.length >= 2;
  }

  function 作る(preset) {
    var 全 = (preset.questions || []);
    var qs = 全.filter(出せるか).slice(0, 100);
    var よけた = 全.length - qs.length;
    if (!qs.length) {
      var o0 = 覆い("<h2 class='vql-h'>この プリセットは まだ 出せません</h2>"
        + "<p class='vql-sub'>みんなで解くで 出せるのは <b>4択・○×・短答・数値</b> です。"
        + "記述や 並べ替え、資料の 問題は これから 増やします。</p>"
        + "<button class='vql-go' data-x>閉じる</button>");
      o0.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o0.閉じる(); });
      return;
    }
    preset = { id: preset.id, title: preset.title || preset.name, subject: preset.subject, questions: qs };
    if (よけた) 作った後に伝える = よけた;
    var ov = 覆い("<h2 class='vql-h'>部屋を 作って います…</h2><p class='vql-sub'>少し お待ちください。</p>");
    頼む("/api/live/create", { method: "POST", body: {
      title: preset.title || "みんなで解く",
      questions: qs,
      settings: { limit: 20, reveal: true }
    } }).then(function (r) {
      ov.閉じる();
      if (!r || !r.ok) {
        var o2 = 覆い("<h2 class='vql-h'>作れませんでした</h2><p class='vql-sub'>"
          + esc((r && r.message) || "もう一度 お試しください。") + "</p><button class='vql-go' data-x>閉じる</button>");
        o2.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o2.閉じる(); });
        return;
      }
      ロビー({ pin: r.pin, key: r.hostKey, you: "p1", host: true, room: r.room,
               preset: preset, よけた: 作った後に伝える });
      作った後に伝える = 0;
    }, function () { ov.閉じる(); });
  }

  /* ── ロビー（PIN を 大きく 出して 待つ）──────────────────────── */
  var 作った後に伝える = 0;

  function ロビー(s) {
    var ov = 覆い("");
    var conn = null;
    function 描く(room) {
      var ps = (room && room.players || []).filter(function (p) { return !p.host; });
      /* ★ **立場で 出す ことばを 変える**（2026-09-10 実測）。
         参加した 人にも「この PIN を 伝えて ください」と 出て いて、
         自分が 何を すれば よいのか 分からなかった。 */
      ov.書く(
        (s.host
          ? "<h2 class='vql-h'>この PIN を 伝えて ください</h2>"
          : "<h2 class='vql-h'>入りました</h2>")
        + "<div class='vql-code'>" + esc(s.pin) + "</div>"
        + (s.host
            ? "<p class='vql-sub' style='text-align:center'>参加する 人は「みんなで解く」→「PIN で 入る」。"
              + "<b>ログインは 要りません。</b></p>"
            : "<p class='vql-sub' style='text-align:center'>この 画面の まま お待ちください。"
              + "先生が 始めると、問題が 出ます。</p>")
        + "<div style='font-size:12.5px;font-weight:700;color:var(--vq-text-secondary,#7A7589)'>"
        + "入って いる 人　" + ps.length + " 人</div>"
        + "<div class='vql-people'>"
        + (ps.length ? ps.map(function (p) {
            return "<span class='vql-p'><span class='vql-av' style='background:" + 色(p.color) + "'>"
              + esc(頭文字(p.name)) + "</span>" + esc(p.name) + "</span>";
          }).join("") : "<span class='vql-sub' style='margin:0'>まだ 誰も 入って いません。</span>")
        + "</div>"
        + (s.host
            ? ((s.よけた
                ? "<p class='vql-sub' style='margin:12px 0 0'>★ みんなで解くで 出せない 形式の <b>"
                  + s.よけた + " 問</b>は、この 部屋から 外しました（記述・並べ替え など）。</p>"
                : "")
              + "<button class='vql-go' data-start" + (ps.length ? "" : " disabled") + ">始める（" + ps.length + " 人）</button>")
            : "<p class='vql-sub' style='margin-top:16px;text-align:center'>先生が 始めるのを 待って います…</p>")
      );
    }
    描く(s.room);
    conn = つなぐ(s.pin, s.key, function (m) {
      if (m.t === "welcome" || m.t === "room") 描く(m.room);
      if (m.t === "q") { ov.閉じる(); 出題へ(s, conn, m); }
    });
    ov.影.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-start]")) conn.送る({ t: "start" });
    });
    場 = { s: s, conn: conn, room: s.room };
  }

  /* 参加者側は ロビーを 経由して 出題へ 入る */
  function 始める(s) { ロビー(s); }

  /* ══════════════════════════════════════════════════════════════════
     出題（**プリセットの 画面が 主役**）
     ══════════════════════════════════════════════════════════════════ */
  function 出題へ(s, conn, 最初) {
    /* 部屋の 問題を そのまま 1 つの プリセットに して 開く。
       ★ 答えは サーバが 落として いる ので、この プリセットに 正解は 無い。
         正誤は サーバの reveal で 受ける。 */
    var 状 = {
      s: s, conn: conn,
      /* ★ **部屋の 姿を 最初から 持たせる**（2026-09-10 実測）。
         null で 始めて いたので 見出しが「1/?」に なり、
         帯も 最初の room が 来るまで 空だった。 */
      room: s.room || null, cur: -1, q: null,
      players: {}, live: {}, res: {}, rank: [],
      share: false, 送った: {}, 直近送信: 0
    };
    場 = 状;

    /* 出題画面を 開く（1 問ずつ サーバが 配る ので、器だけ 借りる） */
    var preset = {
      id: "live:" + s.pin, title: (s.room && s.room.title) || "みんなで解く",
      subject: "", questions: []
    };

    /* ★ 出題画面を そのまま 使うと 「次へ」で 勝手に 進んで しまう。
       みんなで解く では **サーバが 進める** ので、
       1 問ずつ 差し替える 軽い 出題面を 自前で 出す。
       （出題画面の 描画は R.renderHtml を 借りる。作り直さない） */
    面を開く(状);
    面へ(状, 最初);

    conn.受け = true;
  }

  /* 出題の 面。**影の DOM を 1 枚 だけ 持つ。** */
  function 面を開く(状) {
    var old = q("#vqPartyStage");
    if (old) old.remove();
    var host = doc.createElement("div");
    host.id = "vqPartyStage";
    var sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = "<style>" + CSS + 帯CSS + 面CSS + "</style>"
      + "<div class='vqls'><div class='vqls-h'></div><div class='vqls-b'></div><div class='vqlb'></div></div>";
    doc.body.appendChild(host);
    状.影 = sh;
    状.器 = host;

    sh.addEventListener("click", function (e) {
      var t = e.target;
      var sBtn = t.closest && t.closest("[data-share]");
      if (sBtn) {
        状.share = !状.share;
        状.conn.送る({ t: "share", on: 状.share });
        帯を描く(状);
        return;
      }
      var hBtn = t.closest && t.closest("[data-host]");
      if (hBtn) { 状.conn.送る({ t: hBtn.getAttribute("data-host") }); return; }
      var c = t.closest && t.closest("[data-ch]");
      if (c) 選ぶ(状, Number(c.getAttribute("data-ch")));
      var x = t.closest && t.closest("[data-quit]");
      if (x) 終わる(状);
    });
    sh.addEventListener("input", function (e) {
      var i = e.target.closest && e.target.closest("[data-txt]");
      if (i) 打つ(状, i.value);
    });
    sh.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var i = e.target.closest && e.target.closest("[data-txt]");
        if (i) 出す(状, i.value);
      }
    });
  }

  var 面CSS = [
    /* ★ 重なりは **いちばん 上**（2026-09-10 実測）。
       2147482900 だと 初回案内の 下に 隠れて、動いて いるのに 見えなかった。 */
    ".vqls{position:fixed;inset:0;z-index:2147483300;background:var(--vq-bg,#FCFBFE);color:var(--vq-text,#2B2836);",
      "display:flex;flex-direction:column;font-family:inherit;}",
    ".vqls-h{flex:0 0 auto;padding:12px 16px;display:flex;align-items:center;gap:10px;",
      "border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);font-size:13px;}",
    ".vqls-b{flex:1 1 auto;overflow:auto;padding:22px 18px 190px;}",
    ".vqls-q{font-size:clamp(18px,2.6vw,26px);font-weight:750;line-height:1.6;margin:0 auto 22px;max-width:820px;}",
    ".vqls-cs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;max-width:820px;margin:0 auto;}",
    ".vqls-c{position:relative;min-height:74px;border-radius:16px;border:2px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-surface,#fff);color:inherit;font:inherit;font-size:16px;font-weight:650;cursor:pointer;",
      "padding:16px 18px;text-align:left;transition:transform .12s,border-color .12s;}",
    ".vqls-c:hover{transform:translateY(-2px);}",
    ".vqls-c.is-mine{border-color:var(--vq-accent,#756DB3);background:var(--vq-accent-subtle,#F2EEFB);}",
    ".vqls-c.is-ok{border-color:#30A46C;background:rgba(48,164,108,.12);}",
    ".vqls-c.is-ng{border-color:#E5484D;background:rgba(229,72,77,.10);}",
    ".vqls-t{width:100%;max-width:820px;margin:0 auto;display:block;font-size:20px;padding:16px 18px;",
      "border-radius:16px;border:2px solid var(--vq-border,#DED8EE);background:var(--vq-surface,#fff);",
      "color:inherit;font-family:inherit;}",
    ".vqls-n{font-size:12.5px;color:var(--vq-text-secondary,#7A7589);font-weight:700;}",
    ".vqls-tm{margin-left:auto;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}",
    ".vqls-quit{border:0;background:none;font:inherit;font-size:13px;color:var(--vq-text-secondary,#7A7589);cursor:pointer;}",
    ".vqls-rv{max-width:820px;margin:20px auto 0;padding:14px 16px;border-radius:14px;",
      "background:var(--vq-surface-sunken,#F6F4FB);font-size:14px;line-height:1.8;}",
    ".vqls-rank{max-width:820px;margin:14px auto 0;}",
    ".vqls-rank div{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;font-size:14px;}",
    ".vqls-rank div:nth-child(odd){background:var(--vq-surface-sunken,#F6F4FB);}",
    ".vqls-rank b{margin-left:auto;font-variant-numeric:tabular-nums;}"
  ].join("");

  /* ── 1 問 出す ───────────────────────────────────────────────── */
  function 面へ(状, m) {
    /* 前の 問題の「回答ずみ」を 消す（残ると 全員 出した ように 見える） */
    ((状.room && 状.room.players) || []).forEach(function (p) { p.answered = false; });
    状.cur = m.i;
    状.q = m.q;
    状.live = {};
    状.res = {};
    状.終 = m.curAt && m.limit ? (m.curAt + m.limit * 1000) : 0;
    本文を描く(状);
    帯を描く(状);
    時計(状);
  }

  function 本文を描く(状) {
    var sh = 状.影;
    if (!sh) return;
    var q0 = 状.q || {};
    var h = sh.querySelector(".vqls-h"), b = sh.querySelector(".vqls-b");
    h.innerHTML = "<span class='vqls-n'>" + (状.cur + 1) + " / " + ((状.room && 状.room.total) || "?") + "</span>"
      + "<span class='vqls-n' style='letter-spacing:.1em'>" + esc(状.s.pin) + "</span>"
      + "<span class='vqls-tm' data-tm></span>"
      + "<button class='vqls-quit' data-quit>やめる</button>";

    var 選 = Array.isArray(q0.choices) ? q0.choices : null;
    var 私 = 状.送った[状.cur];
    var body = "<div class='vqls-q'>" + esc(q0.question || q0.prompt || "") + "</div>";
    if (q0.type === "true_false") {
      body += "<div class='vqls-cs'>"
        + ["○ 正しい", "× まちがい"].map(function (t, i) {
            return "<button class='vqls-c" + (私 !== undefined && String(私) === String(i === 0) ? " is-mine" : "")
              + "' data-ch='" + i + "'>" + t + "<span class='vqld' data-dot='" + i + "'></span></button>";
          }).join("") + "</div>";
    } else if (選 && 選.length) {
      body += "<div class='vqls-cs'>"
        + 選.map(function (c, i) {
            return "<button class='vqls-c" + (私 === i ? " is-mine" : "") + "' data-ch='" + i + "'>"
              + esc(typeof c === "string" ? c : (c && c.text) || "")
              + "<span class='vqld' data-dot='" + i + "'></span></button>";
          }).join("") + "</div>";
    } else {
      body += "<input class='vqls-t' data-txt placeholder='答えを 入力して Enter' value='"
        + esc(私 === undefined ? "" : 私) + "'>";
    }
    b.innerHTML = body;
    点を打つ(状);
  }

  /* ── 選ぶ／打つ／出す ─────────────────────────────────────── */
  function 選ぶ(状, i) {
    if (状.送った[状.cur] !== undefined) return;
    var v = (状.q && 状.q.type === "true_false") ? (i === 0) : i;
    状.conn.送る({ t: "typing", v: v });
    出す(状, v);
  }
  function 打つ(状, s) {
    /* ★ **1 文字ごとに 送らない。** 0.3 秒 おき。
       （1 文字ごとに 重い ことを するな、は この アプリの 決まり） */
    if (状.share && 状.s.you) { 状.live[状.s.you] = s; 帯を描く(状); }
    var now = Date.now();
    if (now - 状.直近送信 < 300) return;
    状.直近送信 = now;
    状.conn.送る({ t: "typing", v: s });
  }
  function 出す(状, v) {
    if (状.送った[状.cur] !== undefined) return;
    状.送った[状.cur] = v;
    /* ★ **自分のぶんは 自分で 入れる**（2026-09-10 実測）。
       サーバは 送り主へ live を 返さない ので、
       「見せる」を 押して いても 自分の 欄だけ「…」の ままだった。 */
    if (状.s.you) 状.live[状.s.you] = v;
    状.conn.送る({ t: "answer", i: 状.cur, v: v });
    本文を描く(状);
    帯を描く(状);
  }

  /* ── 参加者の 帯 ─────────────────────────────────────────── */
  function 帯を描く(状) {
    var sh = 状.影;
    if (!sh) return;
    var bar = sh.querySelector(".vqlb");
    if (!bar) return;
    var ps = ((状.room && 状.room.players) || []).filter(function (p) { return !p.host; });
    bar.innerHTML =
      "<div class='vqlb-top'><span class='vqlb-pin'>" + esc(状.s.pin) + "</span>"
      + "<span>" + ps.length + " 人</span>"
      + "<span>" + ps.filter(function (p) { return p.answered; }).length + " 人 回答ずみ</span>"
      + (状.s.host
          ? "<button class='vqlb-host' data-host='reveal'>答え合わせ</button>"
            + "<button class='vqlb-host' data-host='next'>次へ</button>"
          : "<button class='vqlb-share" + (状.share ? " is-on" : "") + "' data-share>"
            + (状.share ? "回答を 見せて います" : "回答を みんなに 見せる") + "</button>")
      + "</div>"
      + "<div class='vqlb-list'>"
      + ps.map(function (p) {
          var r = 状.res[p.id];
          var 見 = p.share;
          /* 答え合わせが 済んで いれば、書きかけ ではなく **出した 答え**を 出す。 */
          var r0 = 状.res[p.id];
          var v = (r0 && r0.v !== undefined && r0.v !== null) ? r0.v : 状.live[p.id];
          var cls = "vqlb-i" + (p.online ? "" : " is-off")
            + (r && r.ok === true ? " is-ok" : r && r.ok === false ? " is-ng" : "")
            + (p.answered && !r ? " is-done" : "");
          /* ★ **見せて いい 人だけ** 中身を 出す。
             許可して いない 人は アイコンのまま（訴えの とおり）。 */
          var 中 = 見
            ? "<span class='vqlb-a' style='background:" + 色(p.color) + "'>" + esc(答えの字(状.q, v)) + "</span>"
            : "<span class='vqlb-av' style='background:" + 色(p.color) + "'>" + esc(頭文字(p.name)) + "</span>";
          return "<div class='" + cls + "' title='" + esc(p.name) + "'>" + 中
            + "<span class='vqlb-n'>" + esc(p.name) + "</span>"
            + "<span class='vqlb-s'>" + (p.score || 0) + "</span></div>";
        }).join("")
      + "</div>";
  }

  /* 選んだ ものを 短い 字に する（帯は 狭い） */
  function 答えの字(q0, v) {
    if (v === undefined || v === null || v === "") return "…";
    if (q0 && q0.type === "true_false") return v === true || v === "true" ? "○" : "×";
    if (q0 && Array.isArray(q0.choices) && typeof v === "number") {
      return String.fromCharCode(65 + v);
    }
    return String(v).slice(0, 12);
  }

  /* 選択肢の 上に 「誰が いま 選んで いるか」を 色の 点で 打つ */
  function 点を打つ(状) {
    var sh = 状.影;
    if (!sh) return;
    var 箱 = {};
    sh.querySelectorAll("[data-dot]").forEach(function (el) {
      箱[el.getAttribute("data-dot")] = el;
      el.innerHTML = "";
    });
    var ps = ((状.room && 状.room.players) || []).filter(function (p) { return !p.host && p.share; });
    ps.forEach(function (p) {
      var v = 状.live[p.id];
      var k = null;
      if (状.q && 状.q.type === "true_false") k = (v === true || v === "true") ? "0" : (v === false || v === "false" ? "1" : null);
      else if (typeof v === "number") k = String(v);
      if (k === null || !箱[k]) return;
      var i = doc.createElement("i");
      i.style.background = 色(p.color);
      i.title = p.name;
      箱[k].appendChild(i);
    });
  }

  /* ── 残り 時間 ─────────────────────────────────────────────── */
  function 時計(状) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    状.時 = setInterval(function () {
      var el = 状.影 && 状.影.querySelector("[data-tm]");
      if (!el) return;
      if (!状.終) { el.textContent = ""; return; }
      var 残 = Math.max(0, Math.ceil((状.終 - Date.now()) / 1000));
      el.textContent = 残 + " 秒";
      if (残 <= 0) { try { clearInterval(状.時); } catch (e) {} }
    }, 200);
  }

  /* ── 答え合わせ ───────────────────────────────────────────── */
  function 答え合わせ(状, m) {
    状.res = {};
    (m.results || []).forEach(function (r) { 状.res[r.id] = r; });
    状.rank = m.rank || [];
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    状.終 = 0;
    var sh = 状.影;
    if (!sh) return;
    /* ★ 秒数を **消す**（2026-09-10 実測）。時計は 止めて いたが 字が 残り、
       答え合わせの 最中も「16 秒」と 出たままに なって いた。 */
    var tm = sh.querySelector("[data-tm]");
    if (tm) tm.textContent = "";
    /* 自分の 選択肢に 正誤の 色を 付ける */
    var 正 = m.answer;
    sh.querySelectorAll("[data-ch]").forEach(function (el) {
      var i = Number(el.getAttribute("data-ch"));
      var これ = (状.q && 状.q.type === "true_false") ? (i === 0) : i;
      if (正 !== null && 正 !== undefined && String(これ) === String(正)) el.classList.add("is-ok");
      else if (状.送った[状.cur] !== undefined && String(状.送った[状.cur]) === String(これ)) el.classList.add("is-ng");
    });
    var b = sh.querySelector(".vqls-b");
    var 私 = 状.res[状.s.you];
    var h = "<div class='vqls-rv'>"
      + (私 ? (私.ok === true ? "<b style='color:#30A46C'>正解！ +" + 私.gain + " 点</b>"
              : 私.ok === false ? "<b style='color:#E5484D'>ざんねん</b>"
              : "<b>受け取りました</b>") : "<b>答え合わせ</b>")
      + (m.answer !== null && m.answer !== undefined
          ? "<div>正解：" + esc(答えの字(状.q, m.answer) === "…" ? String(m.answer) : 正解の字(状.q, m.answer)) + "</div>" : "")
      + (m.explanation ? "<div style='margin-top:6px'>" + esc(m.explanation) + "</div>" : "")
      + "</div>"
      + "<div class='vqls-rank'>"
      + (状.rank || []).slice(0, 10).map(function (r) {
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + esc(頭文字(r.name))
            + "</span><span>" + r.rank + ". " + esc(r.name) + "</span><b>" + r.score + "</b></div>";
        }).join("")
      + "</div>";
    b.insertAdjacentHTML("beforeend", h);
    帯を描く(状);
  }
  function 正解の字(q0, v) {
    if (q0 && q0.type === "true_false") return v === true ? "○ 正しい" : "× まちがい";
    if (q0 && Array.isArray(q0.choices) && typeof v === "number") {
      var c = q0.choices[v];
      return (typeof c === "string" ? c : (c && c.text) || String(v));
    }
    return Array.isArray(v) ? v.join("、") : String(v);
  }

  /* ── 終わり ──────────────────────────────────────────────── */
  function 結果(状, m) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    var sh = 状.影;
    if (!sh) return;
    sh.querySelector(".vqls-h").innerHTML = "<span class='vqls-n'>おしまい</span>"
      + "<button class='vqls-quit' data-quit style='margin-left:auto'>閉じる</button>";
    sh.querySelector(".vqlb").innerHTML = "";
    sh.querySelector(".vqls-b").innerHTML =
      "<div class='vqls-q' style='text-align:center'>結果</div>"
      + "<div class='vqls-rank'>"
      + (m.rank || []).map(function (r) {
          var 金 = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "";
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + esc(頭文字(r.name))
            + "</span><span>" + 金 + " " + r.rank + ". " + esc(r.name) + "</span><b>" + r.score + " 点</b></div>";
        }).join("")
      + "</div>";
  }

  function 終わる(状) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    try { 状.conn && 状.conn.閉じる(); } catch (e) {}
    try { 状.器 && 状.器.remove(); } catch (e) {}
    場 = null;
  }

  /* ══ 受け口を 1 か所に する ══════════════════════════════════════
     ロビーで つないだ 通信を、出題へ 移った あとも 使い回す。 */
  var 元つなぐ = つなぐ;
  つなぐ = function (pin, key, 受ける) {
    return 元つなぐ(pin, key, function (m) {
      /* 出題に 入って いれば こちらで 先に 処理する */
      var 状 = 場;
      if (状 && 状.影) {
        if (m.t === "room") { 状.room = m.room; 帯を描く(状); 点を打つ(状); }
        if (m.t === "q") { 面へ(状, m); return; }
        if (m.t === "live") { 状.live[m.id] = m.v; 点を打つ(状); 帯を描く(状); return; }
        if (m.t === "answered") {
          /* ★ **room を 待たない**（2026-09-10 実測）。
             回答の たびに 部屋の 姿を 丸ごと 配ると 通信量が 増えるので、
             サーバは 軽い 合図だけ 送る。こちらで 印を 立てる。 */
          var ps0 = (状.room && 状.room.players) || [];
          for (var i0 = 0; i0 < ps0.length; i0++) {
            if (ps0[i0].id === m.id) { ps0[i0].answered = true; break; }
          }
          帯を描く(状);
          return;
        }
        if (m.t === "reveal") { 答え合わせ(状, m); return; }
        if (m.t === "end") { 結果(状, m); return; }
        if (m.t === "welcome") { 状.room = m.room; 帯を描く(状); return; }
      }
      受ける(m);
    });
  };

  root.__vqParty = {
    開く: 開く,
    作る: function (preset) { 作る画面(preset); },
    入る: function (pin) { 入る画面(pin || ""); },
    いま: 状態
  };
})();
