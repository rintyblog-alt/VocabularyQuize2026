/* ══════════════════════════════════════════════════════════════════════════
   VQCLOUD — 会話を **端末の外**にも 持つ（2026-08-19）

   何が起きていたか（実測）:
     会話の一覧（app.chat.sessions.v2）と 各会話の本文（app.chat.ses.<id>.v2）は
     localStorage の中にしか 無かった。
       ・localStorage の上限 …… 4,587,520 バイト（実測）
       ・すでに 使っていた量 …… 約 4.6MB
     つまり **上限を すでに 越えていた**。setItem は例外を投げるが、
     呼んでいる側は try/catch で 黙って捨てていたので、
     「保存した つもりで 消えている」状態だった。
     さらに 端末を 変えれば 何も 残らなかった。

   ここでやること:
     ① 会話の鍵への 読み書きを 横から見る
     ② 書かれたら **手元の写し**（記憶）に 入れ、まとめて サーバへ送る
     ③ ログインしたら サーバから 引いて 写しに入れる
     ④ 読むときは 写し → localStorage の順で 返す

   なぜ「写し」を 持つのか:
     呼んでいる側は localStorage.getItem を **その場で**（同期で）読む。
     IndexedDB もサーバも 同期では 読めない。
     だから 記憶の中に 同じものを 置いておき、そこから 即座に 返す。
     localStorage が 一杯でも これは 動く。

   触らないもの:
     会話以外の鍵は **一切 触らない**。素の localStorage へ そのまま通す。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (!root || root.VQCLOUD) return;

  /* ── 見る鍵。これ以外は 何もしない ────────────────────────── */
  var 一覧の鍵 = "app.chat.sessions.v2";
  var 本文の形 = /^app\.chat\.ses\.(.+)\.v2$/;
  function 見る鍵か(k) { return k === 一覧の鍵 || 本文の形.test(k); }
  /* プリセット等は 会話とは 別の口（/api/account/store）で 揃える。 */
  function 揃える鍵か(k) { return 揃える鍵.indexOf(k) >= 0; }
  function 会話のIDに(k) { var m = 本文の形.exec(k); return m ? m[1] : ""; }

  var 記憶 = Object.create(null);      /* 鍵 → 文字列（同期で読める写し） */
  var 送る待ち = Object.create(null);  /* 会話 ID → true */
  var 一覧も送る = false;
  var タイマ = null;
  var 引いた誰 = "";                   /* すでに引いたユーザー */
  var 送信中 = false;
  var 最後の結果 = { 送った: 0, 断られた: [], とき: 0 };

  /* ── 素の localStorage（包む前のもの）────────────────────── */
  var LS = null;
  try { LS = root.localStorage; } catch (e) { LS = null; }
  var 素の読み = null, 素の書き = null, 素の消し = null;
  if (LS) {
    try {
      素の読み = LS.getItem.bind(LS);
      素の書き = LS.setItem.bind(LS);
      素の消し = LS.removeItem.bind(LS);
    } catch (e) { LS = null; }
  }

  function 読む(k) {
    if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
    if (!素の読み) return null;
    try { return 素の読み(k); } catch (e) { return null; }
  }
  function 手元へ書く(k, v) {
    記憶[k] = String(v);
    if (!素の書き) return false;
    try { 素の書き(k, String(v)); return true; }
    catch (e) {
      /* localStorage が 一杯。**それでも 失わない** — 写しとサーバが 持つ。
         古い会話を localStorage から どかして 場所を空ける。 */
      場所を空ける();
      try { 素の書き(k, String(v)); return true; } catch (e2) { return false; }
    }
  }

  /* 一杯になったら、**古い会話から** localStorage の外へ出す。
     出しても 写し（記憶）と サーバに 在るので 消えない。 */
  function 場所を空ける() {
    if (!LS || !素の消し) return;
    var 並 = 一覧を読む();
    if (!並.length) return;
    /* 古い順（updatedAt の小さい順） */
    並.sort(function (a, b) { return (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0); });
    var 出した = 0;
    for (var i = 0; i < 並.length && 出した < 20; i++) {
      var k = "app.chat.ses." + 並[i].id + ".v2";
      var v = null;
      try { v = 素の読み(k); } catch (e) { v = null; }
      if (v === null) continue;
      記憶[k] = v;                      /* 写しへ 移してから 消す */
      try { 素の消し(k); 出した++; } catch (e) {}
    }
    if (出した) {
      try { console.warn("[VQCLOUD] 手元が一杯なので 古い会話 " + 出した + " 本を 写しへ移しました（消えていません）"); } catch (e) {}
    }
  }

  function 一覧を読む() {
    try { var v = JSON.parse(読む(一覧の鍵) || "null"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }

  /* ── ログインの札 ─────────────────────────────────────────
     置き場所は 本体と 同じものを 見る。無ければ 何もしない（送らない）。 */
  function 札() {
    /* ★ 本物の名前は **app.auth.token.v1**（2026-08-19・実測で気づいた）。
       ここに 無い名前ばかり 並べていたので、_authGetToken が
       window に 出るより 前に 呼ばれた ぶんは **札なし** と 見なされ、
       送るはずのものが 黙って 見送られていた。先頭に 本物を 置く。 */
    var 候補 = ["app.auth.token.v1", "vq.auth.token", "app.auth.token", "auth.token", "vq_token"];
    for (var i = 0; i < 候補.length; i++) {
      var v = null;
      try { v = 素の読み ? 素の読み(候補[i]) : null; } catch (e) {}
      if (v && v.length > 20) return v.replace(/^"|"$/g, "");
    }
    try {
      if (typeof root._authGetToken === "function") {
        var t = root._authGetToken();
        if (t && String(t).length > 20) return String(t);
      }
    } catch (e) {}
    return "";
  }
  function 誰() {
    try {
      if (typeof root._chatRemoteUserKey === "function") return String(root._chatRemoteUserKey() || "");
    } catch (e) {}
    var t = 札();
    return t ? t.slice(-24) : "";
  }

  function 頼む(道, 中身) {
    var t = 札();
    if (!t) return Promise.reject(new Error("ログインしていません"));
    var o = { method: 中身 ? "POST" : "GET", headers: { Authorization: "Bearer " + t } };
    if (中身) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(中身); }
    return root.fetch(道, o).then(function (r) {
      if (!r.ok) return r.text().then(function (t2) { throw new Error(r.status + " " + t2.slice(0, 200)); });
      return r.json();
    });
  }

  /* ══ サーバへ 送る ═══════════════════════════════════════════════
     まとめて 送る（1 文字ごとに 送らない）。
     送るのは **変わった会話だけ**。 */
  function あとで送る(会話ID) {
    if (会話ID) 送る待ち[会話ID] = true; else 一覧も送る = true;
    if (タイマ) return;
    タイマ = root.setTimeout(function () { タイマ = null; いま送る(); }, 1500);
  }

  function いま送る() {
    if (送信中) { あとで送る(""); return Promise.resolve(最後の結果); }
    if (!札()) return Promise.resolve({ 送った: 0, 理由: "ログインしていません" });
    var 並 = 一覧を読む();
    var 索引 = Object.create(null);
    for (var i = 0; i < 並.length; i++) if (並[i] && 並[i].id) 索引[並[i].id] = 並[i];

    var 荷 = [];
    var 待ち = Object.keys(送る待ち);
    for (var j = 0; j < 待ち.length; j++) {
      var id = 待ち[j];
      var 見出し = 索引[id];
      var 本文 = 読む("app.chat.ses." + id + ".v2");
      if (!見出し && 本文 == null) {
        /* 一覧にも 本文にも 無い ＝ 消された */
        荷.push({ id: id, deletedAt: Date.now(), updatedAt: Date.now() });
        continue;
      }
      荷.push({
        id: id,
        title: String((見出し && (見出し.title || 見出し.name)) || ""),
        meta: 見出し ? 小さくする(見出し) : {},
        body: 本文 == null ? "[]" : 本文,
        updatedAt: Math.max(0, Number(見出し && (見出し.updatedAt || 見出し.ts)) || 0) || Date.now(),
        deletedAt: 0
      });
    }
    /* 一覧に在るのに 一度も送っていないものも 拾う */
    if (一覧も送る) {
      for (var k = 0; k < 並.length; k++) {
        var s = 並[k];
        if (!s || !s.id || 送る待ち[s.id]) continue;
        if (記憶["送った:" + s.id] === String(s.updatedAt || 0)) continue;
        var b = 読む("app.chat.ses." + s.id + ".v2");
        if (b == null) continue;
        荷.push({
          id: s.id, title: String(s.title || s.name || ""), meta: 小さくする(s),
          body: b, updatedAt: Math.max(0, Number(s.updatedAt || s.ts) || 0) || Date.now(), deletedAt: 0
        });
      }
    }
    送る待ち = Object.create(null);
    一覧も送る = false;
    if (!荷.length) return Promise.resolve({ 送った: 0 });
    if (荷.length > 400) 荷 = 荷.slice(0, 400);

    送信中 = true;
    return 頼む("/api/chat/sessions", { sessions: 荷 }).then(function (r) {
      送信中 = false;
      for (var i2 = 0; i2 < 荷.length; i2++) 記憶["送った:" + 荷[i2].id] = String(荷[i2].updatedAt);
      最後の結果 = { 送った: (r && r.savedIds || []).length, 断られた: (r && r.rejected) || [], とき: Date.now() };
      if (最後の結果.断られた.length) {
        try { console.warn("[VQCLOUD] 大きすぎて 置けなかった会話:", 最後の結果.断られた); } catch (e) {}
      }
      return 最後の結果;
    }).catch(function (e) {
      送信中 = false;
      /* 送れなかったものは 次の機会に また送る（捨てない）。 */
      for (var i3 = 0; i3 < 荷.length; i3++) 送る待ち[荷[i3].id] = true;
      try { console.warn("[VQCLOUD] 送れませんでした:", String(e && e.message || e)); } catch (e2) {}
      return { 送った: 0, だめ: String(e && e.message || e) };
    });
  }

  /* 見出しは 一覧そのままだと 重い。要るところだけ 残す。 */
  function 小さくする(s) {
    var o = {};
    var 残す = ["projectId", "project", "pinned", "model", "icon", "color", "kind", "ts", "createdAt"];
    for (var i = 0; i < 残す.length; i++) if (s[残す[i]] !== undefined) o[残す[i]] = s[残す[i]];
    return o;
  }

  /* ══ サーバから 引く ═════════════════════════════════════════════
     ログインした直後に 1 回。手元に無いものだけ 入れる。
     手元のほうが 新しければ 手元を 残す（上書きしない）。 */
  function 引く(むりやり) {
    var 私 = 誰();
    if (!札()) return Promise.resolve({ 入れた: 0, 理由: "ログインしていません" });
    if (!むりやり && 私 && 引いた誰 === 私) return Promise.resolve({ 入れた: 0, 理由: "もう引いています" });
    引いた誰 = 私;
    return 頼む("/api/chat/sessions?full=1").then(function (r) {
      var 来た = (r && r.sessions) || [];
      var 手元 = 一覧を読む();
      var 索引 = Object.create(null);
      for (var i = 0; i < 手元.length; i++) if (手元[i] && 手元[i].id) 索引[手元[i].id] = 手元[i];

      var 入れた = 0, 消した = 0, 本文なし = [];
      for (var j = 0; j < 来た.length; j++) {
        var s = 来た[j];
        if (!s || !s.id) continue;
        var 手 = 索引[s.id];
        if (s.deletedAt) {
          if (手) { delete 索引[s.id]; try { 素の消し && 素の消し("app.chat.ses." + s.id + ".v2"); } catch (e) {} delete 記憶["app.chat.ses." + s.id + ".v2"]; 消した++; }
          continue;
        }
        var 手の時 = Math.max(0, Number(手 && (手.updatedAt || 手.ts)) || 0);
        if (手 && 手の時 >= Number(s.updatedAt || 0)) continue;   /* 手元のほうが 新しい */
        索引[s.id] = Object.assign({}, s.meta || {}, {
          id: s.id, title: s.title || "", updatedAt: Number(s.updatedAt || 0)
        });
        if (typeof s.body === "string") { 手元へ書く("app.chat.ses." + s.id + ".v2", s.body); 入れた++; }
        else 本文なし.push(s.id);
        記憶["送った:" + s.id] = String(s.updatedAt || 0);
      }
      var 新一覧 = Object.keys(索引).map(function (k) { return 索引[k]; })
        .sort(function (a, b) { return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0); });
      手元へ書く(一覧の鍵, JSON.stringify(新一覧));

      /* ★ ここが 要（2026-08-19）。
         この仕掛けは **本体より あとに** 読み込まれる（束の いちばん後ろ）。
         だから 読み込まれる前から 手元に在った会話は、
         もう一度 触られない限り **一度も 送られない**。
         いままでの会話が そのまま 端末に 取り残される、ということ。
         引いたついでに「サーバに 無い／手元のほうが 新しい」ものを 送りに出す。 */
      var 来た印 = Object.create(null);
      for (var j2 = 0; j2 < 来た.length; j2++) if (来た[j2] && 来た[j2].id) 来た印[来た[j2].id] = 来た[j2];
      var 送り出す = 0;
      for (var k2 = 0; k2 < 手元.length; k2++) {
        var h = 手元[k2];
        if (!h || !h.id) continue;
        var 向 = 来た印[h.id];
        var 手時 = Math.max(0, Number(h.updatedAt || h.ts) || 0);
        if (向 && Number(向.updatedAt || 0) >= 手時) continue;   /* サーバのほうが 新しい */
        if (向 && 向.deletedAt) continue;                        /* 消したものは 送り返さない */
        if (読む("app.chat.ses." + h.id + ".v2") == null) continue;
        あとで送る(h.id);
        送り出す++;
      }
      if (送り出す) {
        try { console.info("[VQCLOUD] まだ サーバに 無い会話 " + 送り出す + " 本を 送ります"); } catch (e) {}
      }

      var 結 = { 入れた: 入れた, 消した: 消した, 本文なし: 本文なし, 全部: 来た.length, 送り出す: 送り出す };
      try { root.dispatchEvent(new CustomEvent("vq-chat-restored", { detail: 結 })); } catch (e) {}
      return 結;
    }).catch(function (e) {
      引いた誰 = "";
      try { console.warn("[VQCLOUD] 引けませんでした:", String(e && e.message || e)); } catch (e2) {}
      return { 入れた: 0, だめ: String(e && e.message || e) };
    });
  }

  /* 本文が 手元に無い会話を 1 本だけ 取りに行く。 */
  function 一本引く(id) {
    if (!id) return Promise.resolve(null);
    return 頼む("/api/chat/sessions?id=" + encodeURIComponent(id)).then(function (r) {
      var s = r && r.session;
      if (!s || s.deletedAt || typeof s.body !== "string") return null;
      手元へ書く("app.chat.ses." + id + ".v2", s.body);
      try { root.dispatchEvent(new CustomEvent("vq-chat-restored", { detail: { 入れた: 1, id: id } })); } catch (e) {}
      return s.body;
    }).catch(function () { return null; });
  }

  /* ══════════════════════════════════════════════════════════════════════
     プリセットも アカウントごと（2026-08-19）

     訴え:
       「プリセットも 必ず アカウントごと。端末を 変えても
         ローカルストレージではなく アカウントごとに。
         今の状態だと、端末を 変えると 同じアカウントでも
         全く プリセットが 異なる。」

     なぜ そうなっていたか（実測）:
       いままでの同期が 送っていたのは **旧 V1 の鍵**
       （wordPractice400.presets.v1）だけ。
       いま アプリが 実際に 読み書きしているのは vq2.presets.v1 で、
       こちらは **一度も 送られていなかった**。

     ★ ここで いちばん 大事なこと: **上書きしない。突き合わせる。**
       端末 A に 1,2 / 端末 B に 3 が 在るとき、
       新しいほうで まるごと 上書きすると **もう片方が 消える**。
       「端末を 変えると 全く 違う」と 言われている状態は、
       まさに 両方に 別々の ものが 溜まっている状態なので、
       まるごと 上書きは **いちばん やってはいけない**。
       だから プリセットは **1 件ずつ id で 突き合わせ**、
       新しいほうを 採る。どちらにも 在るものは 更新時刻で 決める。
     ══════════════════════════════════════════════════════════════════════ */
  /* ★ この 並びは **サーバの ACCOUNT_KEYS_OK と そっくり 同じ**に すること。
     片方だけ 足すと、送っても rejected:[{reason:"この鍵は置けません"}] が
     返るだけで、画面には 何も 出ない（console.warn だけ）＝無言の 不具合。
     一致は vqsynckeys.cjs が 実測で 見張る。 */
  var 揃える鍵 = [
  "vq2.presets.v1",
  "vq2.presetChats.v1",
  "vq2.presetAttachments.v1",
  "vq2.mocks.v1",
  "wordPractice400.presets.v1",
  "app.chat.projects.v1",
  /* ── ここから 2026-08-26 に 足した ぶん ────────────────────────
     訴え:「アカウント同士での 同期は 必ず 行うこと。
            例えば、プリセット、設定、インサイト、学習履歴」
     これまで 学習の記録は **どこにも 送っていなかった**。
     端末を 変えると Insight が 空、ログアウトすると 消える。
     どれも {id, ownerId, updatedAt} を 持つ 並びなので、
     件ごとに 突き合わせられる（まるごと 上書きしない）。 */
  "vq2.results.v1",                    /* 解いた 結果 */
  "vq2.learn.sessions.v1",             /* 学習セッション */
  "vq2.learn.answers.v1",              /* 1 問ごとの 記録 */
  "vq2.learn.events.v1",               /* 学習の できごと */
  "wordPractice.analytics.sessions.v1", /* 旧 Insight（古い画面が 読む） */
  /* ── 2026-08-30 に 足した ぶん ─────────────────────────────
     依頼:「この 左に メモした ものは 同じ アカウントなら 絶対に 残るように」
     問題用紙への 手書きメモ。{id, presetId, ownerId, updatedAt, strokes} の 並び
     なので 件ごとに 突き合わせる（まるごと 上書きしない）。 */
  "vq2.presetNotes.v1"                 /* 問題用紙への 手書きメモ */
  ];
  /* 1 件ずつ 突き合わせる鍵（配列で、各要素に id があるもの）。
     ★ ここに 入れ忘れると **まるごと 上書き**になり、
       別の端末の ぶんが 消える（cloud.js の 上の 但し書きの 事故）。 */
  var 件ごと = {
    "vq2.presets.v1": 1, "wordPractice400.presets.v1": 1, "vq2.mocks.v1": 1,
    "vq2.results.v1": 1, "vq2.learn.sessions.v1": 1, "vq2.learn.answers.v1": 1,
    "vq2.learn.events.v1": 1, "wordPractice.analytics.sessions.v1": 1,
    /* ★ メモも 件ごと。ここに 入れ忘れると、別の 端末で 書いた メモが
       まるごと 消える（この ファイルの 上の 但し書きの 事故）。 */
    "vq2.presetNotes.v1": 1
  };
  var 揃える待ち = Object.create(null);
  var 揃えタイマ = null;
  var 最後の揃え = { 送った: [], 受けた: [], とき: 0 };

  function 時に直す(v) {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    var t = Date.parse(String(v));
    return isFinite(t) ? t : 0;
  }
  function 件の時(x) {
    return Math.max(時に直す(x && x.updatedAt), 時に直す(x && x.deletedAt),
                    時に直す(x && x.createdAt), Number(x && x.revision) || 0);
  }

  /* 2 つの並びを **消さずに** 突き合わせる。 */
  function 突き合わせる(手元, 向こう) {
    var 箱 = Object.create(null), 順 = [];
    function 入れる(x) {
      if (!x || typeof x !== "object") return;
      var id = String(x.id || "");
      if (!id) return;
      if (!Object.prototype.hasOwnProperty.call(箱, id)) { 箱[id] = x; 順.push(id); return; }
      /* 両方に 在る。新しいほうを 採る。 */
      if (件の時(x) > 件の時(箱[id])) 箱[id] = x;
    }
    (Array.isArray(手元) ? 手元 : []).forEach(入れる);
    (Array.isArray(向こう) ? 向こう : []).forEach(入れる);
    return 順.map(function (id) { return 箱[id]; });
  }

  /* 広い置き場（IndexedDB）。無い端末では null。 */
  function 広い置き場() {
    try {
      var I = root.VQIDB;
      if (I && typeof I.鏡へ === "function" && typeof I.鏡から === "function") return I;
    } catch (e) {}
    return null;
  }
  function 鍵を読む(k) {
    /* ★ **写し（記憶）が いちばん 新しい。**素を 先に 見ていたので、
       手元へ 書けなかった ぶんが 古い値に 上書きされて 送られていた。 */
    if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
    var I = 広い置き場();
    if (I && I.鏡にある && I.鏡にある(k)) return I.鏡から(k);
    var v = null;
    try { v = 素の読み ? 素の読み(k) : null; } catch (e) { v = null; }
    return v;
  }
  function 鍵を書く(k, 文) {
    記憶[k] = String(文);
    try { 素の書き(k, String(文)); return true; }
    catch (e) {
      /* 手元が 一杯。写しと サーバが 持っているので 失われはしない。 */
      try { console.warn("[VQCLOUD] 手元へ 書けませんでした（写しとサーバには 在ります）: " + k); } catch (e2) {}
      return false;
    }
  }
  /* ══ 鍵ごとの 「いつ 書いたか」は **必ず 進む**（2026-08-26）═══════════
     訴えの筋:「消したのに 上がらない」

     もとは 件ごとの鍵で 「中の いちばん 新しい 時刻」を 送っていた。
     ところが **いちばん 新しい 件を 消すと この数が 下がる**。
     サーバは「サーバのほうが 新しい」と 断るので（worker.js の 比べ）、
     消した ぶんが 永遠に 上がらない。手元では 消えて、他の端末には 残る。

     → 鍵ごとに **戻らない 印**を 手元に 持つ。書くたびに
       max(いま, 前の印 + 1) にして、必ず 1 ミリ秒でも 進める。
       この印は 端末に 残す（読み込み直しても 戻らないように）。 */
  var 印の鍵 = "vq.cloud.at.v1";
  var 印 = null;
  function 印を読む() {
    if (印) return 印;
    印 = Object.create(null);
    try {
      var 文 = 素の読み ? 素の読み(印の鍵) : null;
      var o = 文 ? JSON.parse(文) : null;
      if (o && typeof o === "object") for (var k in o) if (Number(o[k])) 印[k] = Number(o[k]);
    } catch (e) {}
    return 印;
  }
  function 印を残す() {
    try { 素の書き(印の鍵, JSON.stringify(印を読む())); } catch (e) {}
  }
  function 印を進める(k) {
    var p = 印を読む();
    var 次 = Math.max(Date.now(), (Number(p[k]) || 0) + 1);
    p[k] = 次;
    印を残す();
    return 次;
  }
  /* その鍵の 「いつのものか」。**戻らない 印**を 使う。
     印が まだ 無い（この端末で 一度も 書いていない）ときだけ、
     中身の いちばん 新しい 時刻を 見る（初回の 突き合わせの ため）。 */
  function 鍵の時(k) {
    var 文 = 鍵を読む(k);
    if (文 == null) return 0;
    var p = 印を読む();
    if (Number(p[k])) return Number(p[k]);
    if (件ごと[k]) {
      try {
        var a = JSON.parse(文);
        if (Array.isArray(a)) {
          var m = 0;
          for (var i = 0; i < a.length; i++) { var t = 件の時(a[i]); if (t > m) m = t; }
          if (m) return m;
        }
      } catch (e) {}
    }
    return Date.now();
  }

  function あとで揃える(k) {
    if (揃える鍵.indexOf(k) < 0) return;
    揃える待ち[k] = true;
    印を進める(k);
    if (揃えタイマ) return;
    揃えタイマ = root.setTimeout(function () { 揃えタイマ = null; いま揃える(); }, 2500);
  }

  /* ══ 送る 大きさの 決まり（2026-08-27）════════════════════════════
     サーバは
       ・1 回の 頼みぜんぶで 16MB まで（ACCOUNT_POST_MAX）
       ・鍵 1 つで   24MB まで（ACCOUNT_VALUE_MAX・2026-08-29 に 12MB から）
     を 見ている。ところが 手元は **溜まっている 鍵を まとめて 1 回で**
     送っていた。プリセットと 添付が どちらも 育つと 合わせて 16MB を
     越え、**頼み そのものが 400 で 落ちる**。落ちると 全部を 待ちへ
     戻すので、次も 同じ 大きさで 送って また 落ちる。
     ＝ **いつまでも 1 件も 保存されない**（しかも 画面には 何も 出ない）。
     → 大きさを 見て 小分けにする。1 つで 越えるものは 単独で 送り、
       それでも 断られたら **待ちへ 戻さず 覚えておいて 画面で 伝える**。 */
  /* UTF-8 の バイト数。**文字数では 数えない**（日本語で 3 倍 ずれる）。 */
  function バイト数(文) {
    var s2 = String(文 == null ? "" : 文);
    try { if (root.TextEncoder) return new root.TextEncoder().encode(s2).length; } catch (e) {}
    /* TextEncoder が 無い端末の 見積り（多めに 見る＝安全側） */
    var n = 0;
    for (var i = 0; i < s2.length; i++) {
      var c = s2.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }
  var 一度に送る上限 = 7 * 1024 * 1024;   /* **バイト**。16MB の 半分より 下 */
  /* 鍵 1 つの 上限は サーバが **文字数**で 見ている（worker.js の
     ACCOUNT_VALUE_MAX）。ここも 文字数で そろえる。
     ただし 送れる 束の 大きさは バイトで 見る（上の 一度に送る上限）。 */
  /* ★ 2026-08-29: 12MB → 24MB（訴え「プリセットが 保存されない」）。
     **サーバの ACCOUNT_VALUE_MAX と 必ず 同じ**にすること。
     こちらが 大きいと 送って 断られ、小さいと 送れるものを 送らない。 */
  var 鍵の上限 = 24 * 1024 * 1024;
  var 大きすぎる = Object.create(null);   /* 鍵 → { バイト, とき } */

  function 荷を小分け(荷) {
    var 束 = [], いま = [], 量 = 0;
    for (var i = 0; i < 荷.length; i++) {
      /* ★ **バイトで 数える**（サーバの 16MB は UTF-8 バイト）。 */
      var 大 = バイト数(荷[i].value);
      /* 1 つで 超えるものは 単独の 束にする（一緒に すると 道連れになる） */
      if (大 >= 一度に送る上限 || いま.length >= 20 || (量 + 大) > 一度に送る上限) {
        if (いま.length) { 束.push(いま); いま = []; 量 = 0; }
      }
      いま.push(荷[i]); 量 += 大;
    }
    if (いま.length) 束.push(いま);
    return 束;
  }

  function 困りごとを知らせる(理由, 鍵たち) {
    try {
      root.dispatchEvent(new CustomEvent("vq-sync-problem", {
        detail: { 理由: String(理由 || ""), 鍵: (鍵たち || []).slice() }
      }));
    } catch (e) {}
  }

  function いま揃える() {
    if (!札()) return Promise.resolve({ 送った: 0, 理由: "ログインしていません" });
    var 並 = Object.keys(揃える待ち);
    揃える待ち = Object.create(null);
    if (!並.length) return Promise.resolve({ 送った: 0 });
    var 荷 = [];
    var この回の大きすぎ = [];
    for (var i = 0; i < 並.length; i++) {
      var k = 並[i];
      var 文 = 鍵を読む(k);
      if (文 == null) continue;
      /* 鍵 1 つで 上限を 越えるものは **送らずに 覚える**。
         送っても 必ず 断られ、待ちへ 戻すと ほかの鍵まで 巻き添えになる。 */
      if (文.length > 鍵の上限) {
        大きすぎる[k] = { バイト: 文.length, とき: Date.now() };
        この回の大きすぎ.push(k);
        continue;
      }
      delete 大きすぎる[k];
      荷.push({ key: k, value: 文, updatedAt: 鍵の時(k) });
    }
    /* ★ **この回に 実際に 超えた鍵だけ** を 知らせる（2026-08-30）。
       もとは 溜まった 一覧（大きすぎる）を そのまま 出していたので、
       **一度 超えると 以後 毎回**「置けません」と 言い続けた。
       小さくして 保存し直しても 消えないので、
       「何をしても 保存できない」と 見える。訴えの 出どころは ここ。
       溜めた ほうは 覚え書きとして 残すが、古いものは 片づける。 */
    var 線 = Date.now() - 10 * 60 * 1000;
    Object.keys(大きすぎる).forEach(function (k2) {
      if (Number(大きすぎる[k2] && 大きすぎる[k2].とき) < 線) delete 大きすぎる[k2];
    });
    var 大並 = この回の大きすぎ;
    if (大並.length) 困りごとを知らせる("鍵が大きすぎて置けません", 大並);
    if (!荷.length) return Promise.resolve({ 送った: 0, 大きすぎる: 大並 });
    /* 送る ぶんが ある なら、この回の 断りは 下で まとめて 出す。 */

    var 束 = 荷を小分け(荷);
    var 送れた = [], 断られた = [], 失敗 = "";
    return 束.reduce(function (p, 塊) {
      return p.then(function () {
        return 頼む("/api/account/store", { items: 塊 }).then(function (r) {
          ((r && r.saved) || []).forEach(function (x) { 送れた.push(x); });
          ((r && r.rejected) || []).forEach(function (x) { 断られた.push(x); });
        }).catch(function (e) {
          /* この 束だけ 待ちへ 戻す（ほかの 束は もう 通っている） */
          塊.forEach(function (x) { 揃える待ち[x.key] = true; });
          失敗 = String((e && e.message) || e);
        });
      });
    }, Promise.resolve()).then(function () {
      最後の揃え = { 送った: 送れた, 受けた: 最後の揃え.受けた, とき: Date.now(),
                     断られた: 断られた, 大きすぎる: 大並, 束: 束.length };
      if (断られた.length) {
        try { console.warn("[VQCLOUD] 置けなかった鍵:", 断られた); } catch (e) {}
        /* 「サーバのほうが 新しい」は 正常な 断り。伝えるのは それ以外だけ。 */
        var 本当にだめ = 断られた.filter(function (x) {
          return String(x && x.reason || "").indexOf("サーバのほうが新しい") < 0;
        });
        if (本当にだめ.length) {
          困りごとを知らせる("保存できなかった鍵があります",
            本当にだめ.map(function (x) { return x.key; }));
        }
      }
      if (失敗) {
        try { console.warn("[VQCLOUD] 揃えられませんでした:", 失敗); } catch (e2) {}
        困りごとを知らせる("サーバへ送れませんでした", []);
      }
      return 最後の揃え;
    });
  }

  /* サーバから 引いて、手元と **突き合わせる**（消さない）。 */
  function 揃えを引く(むりやり) {
    if (!札()) return Promise.resolve({ 受けた: 0, 理由: "ログインしていません" });
    return 頼む("/api/account/store").then(function (r) {
      var 在る = {};
      ((r && r.keys) || []).forEach(function (x) { 在る[x.key] = x; });
      var 仕事 = [];
      揃える鍵.forEach(function (k) {
        var 手元の時 = 鍵の時(k);
        var 向こう = 在る[k];
        /* 向こうに 無いなら こちらを 送る */
        if (!向こう || 向こう.deletedAt) {
          if (鍵を読む(k) != null) 揃える待ち[k] = true;
          return;
        }
        /* 件ごとの鍵は **必ず** 引いて 突き合わせる（時刻だけでは 決められない）。
           そうでない鍵は、向こうが 新しいときだけ 引く。 */
        if (件ごと[k] || 向こう.updatedAt > 手元の時 || むりやり) 仕事.push(k);
      });
      if (!仕事.length) { いま揃える(); return { 受けた: 0 }; }
      return 仕事.reduce(function (p, k) {
        return p.then(function () {
          return 頼む("/api/account/store?key=" + encodeURIComponent(k)).then(function (d) {
            if (!d || d.value == null) return null;
            var 手元文 = 鍵を読む(k);
            if (件ごと[k]) {
              var 手元配 = null, 向こう配 = null;
              try { 手元配 = JSON.parse(手元文 || "null"); } catch (e) {}
              try { 向こう配 = JSON.parse(d.value); } catch (e) {}
              if (Array.isArray(向こう配)) {
                var 合 = 突き合わせる(手元配, 向こう配);
                var 新文 = JSON.stringify(合);
                if (新文 !== 手元文) {
                  鍵を書く(k, 新文);
                  /* 突き合わせた ぶんも **印を 進める**（送り返すので 必ず 勝たせる） */
                  印を進める(k);
                  最後の揃え.受けた.push({ key: k, 件数: 合.length,
                    手元: Array.isArray(手元配) ? 手元配.length : 0,
                    向こう: 向こう配.length });
                  /* 突き合わせた結果を 送り返す（向こうにも 揃える） */
                  揃える待ち[k] = true;
                }
                return null;
              }
            }
            /* 件ごとでない鍵は、向こうが 新しいときだけ 置き換える */
            if ((Number(d.updatedAt) || 0) >= 鍵の時(k) && d.value !== 手元文) {
              鍵を書く(k, d.value);
              /* サーバの ぶんを 採ったので、手元の 印は **サーバの 時刻に そろえる**
                 （進めてしまうと、採ったばかりの ものを 送り返す ことになる）。 */
              (function () { var p = 印を読む(); p[k] = Number(d.updatedAt) || Date.now(); 印を残す(); })();
              最後の揃え.受けた.push({ key: k, バイト: String(d.value).length });
            }
            return null;
          }).catch(function () { return null; });
        });
      }, Promise.resolve()).then(function () {
        try { root.dispatchEvent(new CustomEvent("vq-presets-restored",
          { detail: { 受けた: 最後の揃え.受けた.slice() } })); } catch (e) {}
        return いま揃える().then(function () { return { 受けた: 最後の揃え.受けた.length }; });
      });
    }).catch(function (e) {
      try { console.warn("[VQCLOUD] 揃えを引けません:", String(e && e.message || e)); } catch (e2) {}
      return { 受けた: 0, だめ: String(e && e.message || e) };
    });
  }

  /* ══ localStorage を 横から見る ═══════════════════════════════════
     会話の鍵だけ。それ以外は 素通し。 */
  if (LS && 素の読み) {
    try {
      LS.getItem = function (k) {
        k = String(k);
        /* ★ **揃える鍵は 写しを 先に 返す**（2026-08-28）。
           setItem が 容量あふれを 握りつぶす のに getItem が 素だったので、
           保存したはずの 新しい中身が 読めず、**古いほうが 生き残っていた**。 */
        if (揃える鍵か(k)) {
          if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
          var I0 = 広い置き場();
          if (I0 && I0.鏡にある && I0.鏡にある(k)) {
            var w = I0.鏡から(k);
            if (w != null) { 記憶[k] = w; return w; }
          }
          return 素の読み(k);
        }
        if (!見る鍵か(k)) return 素の読み(k);
        if (Object.prototype.hasOwnProperty.call(記憶, k)) return 記憶[k];
        var v = null;
        try { v = 素の読み(k); } catch (e) { v = null; }
        if (v === null) {
          /* 手元に無い会話。サーバに 在るなら 取りに行く（返事は 次の描き直しで）。 */
          var id = 会話のIDに(k);
          if (id && !記憶["取りに行った:" + id]) { 記憶["取りに行った:" + id] = "1"; 一本引く(id); }
        }
        return v;
      };
      LS.setItem = function (k, v) {
        k = String(k);
        if (揃える鍵か(k)) {
          /* プリセット等。**手元へは そのまま書き**、あとで サーバへ 揃える。
             ここで 書き方を 変えると 既存の画面が 壊れるので、素通しに 近く保つ。
             ★ 手元が 一杯で 書けなくても **投げ返さない**（2026-08-19）。
               投げると 呼んだ側が「容量超過」の道へ 入り、
               並びを 半分に 削って 保存し直す作りだった。
               写しと サーバが 持っているので、ここは 静かに 受け取ってよい。 */
          記憶[k] = String(v);
          try { 素の書き(k, v); }
          catch (e5) {
            /* ★ **手元が 一杯。IndexedDB（実測 7.4GB）へ 逃がす**（2026-08-28）。
               逃がしたら 素の 古い値は 消す。残すと getItem が
               そちらを 拾って「保存したのに 古いまま」に なる。 */
            var I1 = 広い置き場();
            if (I1) {
              try { I1.鏡へ(k, String(v)); } catch (e7) {}
              try { 素の消し(k); } catch (e8) {}
            }
            try { console.warn("[VQCLOUD] 手元へ 書けないので 広い置き場へ 移しました: " + k); } catch (e6) {}
          }
          あとで揃える(k);
          return undefined;
        }
        if (!見る鍵か(k)) return 素の書き(k, v);
        手元へ書く(k, v);
        あとで送る(会話のIDに(k));
        return undefined;
      };
      LS.removeItem = function (k) {
        k = String(k);
        if (!見る鍵か(k)) return 素の消し(k);
        delete 記憶[k];
        try { 素の消し(k); } catch (e) {}
        var id = 会話のIDに(k);
        if (id) {
          /* 消したことを サーバへも 伝える（他の端末で 生き返らせない）。 */
          var t = 札();
          if (t) {
            root.fetch("/api/chat/sessions?id=" + encodeURIComponent(id),
              { method: "DELETE", headers: { Authorization: "Bearer " + t } }).catch(function () {});
          }
        } else あとで送る("");
        return undefined;
      };
    } catch (e) {
      try { console.warn("[VQCLOUD] localStorage を 包めませんでした:", String(e && e.message || e)); } catch (e2) {}
    }
  }

  /* ══ いつ引くか ══════════════════════════════════════════════════
     ・立ち上がって 少ししてから 1 回（札があれば）
     ・ログインの合図が 来たとき
     ・画面へ 戻ってきたとき（別の端末で 増えているかもしれない）
     ・閉じる直前に 溜まっているものを 送り切る */
  function そのうち引く() { if (札()) { 引く(false); 揃えを引く(false); } }
  try {
    if (root.requestIdleCallback) root.requestIdleCallback(function () { そのうち引く(); }, { timeout: 6000 });
    else root.setTimeout(そのうち引く, 3000);
  } catch (e) { root.setTimeout(そのうち引く, 3000); }

  ["vq-auth-changed", "vq-login", "vq-pin-passed"].forEach(function (n) {
    try { root.addEventListener(n, function () { 引いた誰 = ""; root.setTimeout(そのうち引く, 400); }); } catch (e) {}
  });
  try {
    root.addEventListener("visibilitychange", function () {
      if (root.document && root.document.visibilityState === "visible") そのうち引く();
    });
  } catch (e) {}
  try {
    root.addEventListener("pagehide", function () {
      if (タイマ) { root.clearTimeout(タイマ); タイマ = null; いま送る(); }
      if (揃えタイマ) { root.clearTimeout(揃えタイマ); 揃えタイマ = null; いま揃える(); }
    });
  } catch (e) {}

  root.VQCLOUD = {
    引く: 引く, 一本引く: 一本引く, いま送る: いま送る, あとで送る: あとで送る,
    揃えを引く: 揃えを引く, いま揃える: いま揃える, あとで揃える: あとで揃える,
    揃える鍵: 揃える鍵, 突き合わせる: 突き合わせる,
    読む: 読む, 一覧: 一覧を読む, 記憶: 記憶,
    様子: function () {
      var 並 = 一覧を読む();
      var 写し = 0, 手元 = 0, 量 = 0;
      for (var i = 0; i < 並.length; i++) {
        var k = "app.chat.ses." + 並[i].id + ".v2";
        var 在る手元 = false;
        try { 在る手元 = 素の読み(k) !== null; } catch (e) {}
        if (在る手元) 手元++;
        else if (Object.prototype.hasOwnProperty.call(記憶, k)) 写し++;
        量 += (読む(k) || "").length;
      }
      var 揃い = {};
      揃える鍵.forEach(function (k) {
        var v = 鍵を読む(k);
        var n = null;
        try { var a = JSON.parse(v || "null"); if (Array.isArray(a)) n = a.length; } catch (e) {}
        揃い[k] = { バイト: v ? v.length : 0, 件数: n };
      });
      return { 会話の数: 並.length, 手元にある: 手元, 写しだけ: 写し, おおよそのバイト: 量,
               ログイン: !!札(), 最後の送信: 最後の結果,
               揃えるもの: 揃い, 最後の揃え: 最後の揃え,
               /* 大きすぎて 置けなかった 鍵。画面は ここを 見て 伝える。 */
               大きすぎる: (function () {
                 var o = {};
                 for (var k2 in 大きすぎる) o[k2] = 大きすぎる[k2];
                 return o;
               })() };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
