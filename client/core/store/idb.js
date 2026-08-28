/* ══════════════════════════════════════════════════════════════════════
   core/store/idb.js — 大きいものの 置き場（IndexedDB）

   ★ 訴え（2026-08-19）「ストレージ問題を どうにかしないと。
     何か 外部でないのかな。。。」

   ★ 実測して 分かったこと（2026-08-19・この端末で 測った）
       localStorage の 上限 …    4,587,520 バイト（約 4.4MB）
       IndexedDB の 空き   … 7,991,325,342 バイト（約 7.4GB）
     利用者の 端末は すでに 4.61MB 使っていた。**もう 壁**で、
     次に プリセットを 保存した瞬間に 落ちる状態だった。
     つまり 足りないのは 置き場ではなく、**置き場所の 選び方**。

   ★ 外の預け先は 要らない（要るとしても 今は 使えない）
     ・R2 は この Cloudflare の 口座で **有効化されていない**
       （バケットを 作ろうとすると 10042 が返る）
     ・D1 は 1 行 2048 字までで、写真や コードは 入らない
     ・同じ端末の IndexedDB が **1,700 倍**。ここへ 逃がすのが 正しい

   ★ 決めごと
     ・**localStorage は 捨てない。** 小さくて すぐ読むもの（旗・設定・
       いまの状態）は そのまま。同期で 読める速さが 要るため。
     ・**大きくて たまにしか 読まないもの**（AR Board の写真とコード・
       会話の記録・控え）だけ こちらへ 移す。
     ・移したものは localStorage から 消す。二重に 持たない。
     ・IndexedDB が 使えない端末では、**これまでどおり localStorage**
       （動かなくなるより、狭くても 動くほうがよい）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var 名 = "vq2", 版 = 1, 棚 = "kv";
  var 開いたもの = null;

  function 使える() {
    try { return !!root.indexedDB; } catch (e) { return false; }
  }

  function 開く() {
    if (開いたもの) return 開いたもの;
    開いたもの = new Promise(function (done, ng) {
      if (!使える()) { ng(new Error("IndexedDB を 使えません")); return; }
      var r;
      try { r = root.indexedDB.open(名, 版); } catch (e) { ng(e); return; }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(棚)) db.createObjectStore(棚);
      };
      r.onsuccess = function () { done(r.result); };
      r.onerror = function () { ng(r.error || new Error("開けません")); };
      /* ★ 別のタブが 古い版を 開いていると ここで 止まる。
         永久に 待たせない（呼び側は 失敗として 受け取り、
         これまでどおり localStorage を 使う）。 */
      r.onblocked = function () { ng(new Error("別のタブが 開いています")); };
    });
    /* 一度 失敗したら 次は 作り直せるように 忘れる。 */
    開いたもの.catch(function () { 開いたもの = null; });
    return 開いたもの;
  }

  function 仕事(モード, fn) {
    return 開く().then(function (db) {
      return new Promise(function (done, ng) {
        var tx = db.transaction(棚, モード);
        var st = tx.objectStore(棚);
        var 値;
        try { 値 = fn(st); } catch (e) { ng(e); return; }
        /* ★ 箱かどうかは **印で 見分ける**（2026-08-19・実測の不具合）。
           もとは 中身が undefined かどうかで 見ていたので、
           「無い鍵を 読む」と **箱そのもの**が 返り、
           消したのに 消えていないように 見えた。 */
        tx.oncomplete = function () { done(値 && 値.__箱 === true ? 値.__r : 値); };
        tx.onerror = function () { ng(tx.error || new Error("書けません")); };
        tx.onabort = function () { ng(tx.error || new Error("やめました")); };
      });
    });
  }
  function 一つ(req) {
    var 箱 = { __箱: true, __r: undefined };
    req.onsuccess = function () { 箱.__r = req.result; };
    return 箱;
  }

  /* ── 読む・書く・消す。すべて 待つ形（同期では 読めない）── */
  function 読む(鍵) {
    return 仕事("readonly", function (st) { return 一つ(st.get(String(鍵))); })
      .then(function (v) { return v === undefined ? null : v; })
      .catch(function () { return null; });
  }
  function 書く(鍵, 値) {
    return 仕事("readwrite", function (st) { st.put(値, String(鍵)); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function 消す(鍵) {
    return 仕事("readwrite", function (st) { st.delete(String(鍵)); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function 鍵一覧() {
    return 仕事("readonly", function (st) { return 一つ(st.getAllKeys()); })
      .then(function (v) { return Array.isArray(v) ? v : []; })
      .catch(function () { return []; });
  }

  /* いま どれくらい 使っていて、どれくらい 空いているか。
     **推し量らない。** 端末が 答えてくれる値を そのまま 返す。 */
  function 容量() {
    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.estimate) {
        return root.navigator.storage.estimate().then(function (e) {
          return { 使用: Number(e.usage) || 0, 上限: Number(e.quota) || 0, 分かる: true };
        }).catch(function () { return { 使用: 0, 上限: 0, 分かる: false }; });
      }
    } catch (e) {}
    return Promise.resolve({ 使用: 0, 上限: 0, 分かる: false });
  }

  /* localStorage が いま どれだけ 使っているか（文字数 × 2 バイト）。
     **概算だと はっきり 書く**（UTF-16 の 見積り）。 */
  function 手元の量() {
    var 合計 = 0, 明細 = [];
    try {
      for (var i = 0; i < root.localStorage.length; i++) {
        var k = root.localStorage.key(i);
        var v = root.localStorage.getItem(k) || "";
        var n = (String(k).length + v.length) * 2;
        合計 += n;
        明細.push({ 鍵: k, バイト: n });
      }
    } catch (e) {}
    明細.sort(function (a, b) { return b.バイト - a.バイト; });
    return { 合計: 合計, 明細: 明細, 上限のめやす: 4.4 * 1024 * 1024 };
  }

  /* ══ 大きいものを こちらへ 移す ══════════════════════════════════
     ★ 移すのは **決めた鍵だけ**。知らないものを 勝手に 動かさない。
     ★ 移したら localStorage から 消す（二重に 持たない）。
     ★ 1 つでも 失敗したら、そのものは 消さない（消えるより 狭いほうがよい）。 */
  var 移してよい鍵 = [
    "vq2.arboards.v1",             /* AR Board（写真・動く中身） */
    "app.chat.history.v1",         /* 会話の記録 */
    "app.backup.latest.v1",        /* 控え */
    /* ── プリセット一式（2026-08-28 に 足した）──────────────────
       ここが localStorage を 食い尽くしていた。**同期で 読める形**を
       保ったまま こちらへ 移す（下の 鏡）。 */
    "wordPractice400.presets.v1",  /* 旧 V1 の プリセット（実測 2.01MB） */
    "vq2.presets.v1",              /* いまの プリセット */
    "vq2.presetAttachments.v1",    /* プリセットごとの 添付 */
    "vq2.presetChats.v1",          /* プリセットごとの 会話 */
    "vq2.mocks.v1",                /* 試験（Quick Mock） */
    "vq2.results.v1",              /* 解いた 結果 */
    "vq2.learn.sessions.v1",
    "vq2.learn.answers.v1",
    "vq2.learn.events.v1",
    "wordPractice.analytics.sessions.v1"
  ];

  /* ══ 鏡（同期で 読めるようにする）══════════════════════════════
     ★ 画面の readAll / writeAll は **同期**で 書かれている。
       IndexedDB は 非同期なので、そのままでは 差し替えられない。
       そこで **中身を 覚えておく**（鏡）。読むのは 鏡から、
       書くのは 鏡へ 入れてから IndexedDB へ 流す。
     ★ 用意が 済むまでは **localStorage が 正**。
       済んでいない 鍵を 鏡から 読ませない（空だと 勘違いさせない）。 */
  var 鏡 = Object.create(null);       /* 鍵 → 文字列 */
  var 用意済 = Object.create(null);   /* 鍵 → true */
  var 書き待ち = Object.create(null); /* 鍵 → タイマー */

  function 鏡にある(k) { return !!用意済[k] && typeof 鏡[k] === "string"; }
  function 鏡から(k) { return 鏡にある(k) ? 鏡[k] : null; }
  function 用意できた(k) { return !!用意済[k]; }

  /* 鏡へ 入れて、少し まとめてから IndexedDB へ 流す。
     ★ **返り値は 同期**（画面を 待たせない）。流すのは あと。 */
  function 鏡へ(k, 文) {
    鏡[k] = String(文);
    用意済[k] = true;
    if (書き待ち[k]) clearTimeout(書き待ち[k]);
    書き待ち[k] = setTimeout(function () {
      書き待ち[k] = 0;
      書く("ls:" + k, 鏡[k]).then(function (ok) {
        /* 入ったら localStorage の ぶんは 捨てる（二重に 持たない）。 */
        if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
      });
    }, 250);
    return true;
  }

  /* 起動のとき 1 回、決めた鍵を 鏡へ 読み込む。
     localStorage に まだ 在るなら それを 正とし、IndexedDB へ 移す。 */
  function 鏡を用意() {
    if (!使える()) return Promise.resolve({ 用意: 0, 理由: "IndexedDB を 使えません" });
    /* ★ **空で 潰さない。**
       手元に「[]」や「{}」だけが 残っている ことが ある（用意が 済む前に
       画面が 空を 書いた ときなど）。それを そのまま 正に すると、
       IndexedDB に 入っている 本物を 空で 上書きして **全部 消える**。
       中身が 入っている ほうを 残す。 */
    var 空っぽ = function (v) {
      var t = String(v == null ? "" : v).trim();
      return t === "" || t === "[]" || t === "{}" || t === "null";
    };
    return 移してよい鍵.reduce(function (p, k) {
      return p.then(function () {
        var 手 = null;
        try { 手 = root.localStorage.getItem(k); } catch (e) { 手 = null; }
        if (手 !== null && 空っぽ(手)) {
          /* 手元が 空。IndexedDB に 中身が あれば そちらを 正に する。 */
          return 読む("ls:" + k).then(function (v) {
            if (typeof v === "string" && !空っぽ(v)) {
              鏡[k] = v; 用意済[k] = true;
              try { root.localStorage.removeItem(k); } catch (e) {}
              return;
            }
            鏡[k] = 手; 用意済[k] = true;
            return 書く("ls:" + k, 手).then(function (ok) {
              if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
            });
          });
        }
        if (手 !== null) {
          鏡[k] = 手; 用意済[k] = true;
          return 書く("ls:" + k, 手).then(function (ok) {
            if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} }
          });
        }
        return 読む("ls:" + k).then(function (v) {
          if (typeof v === "string") 鏡[k] = v;
          用意済[k] = true;
        });
      });
    }, Promise.resolve()).then(function () {
      return { 用意: Object.keys(用意済).length };
    });
  }
  var 用意の約束 = null;
  function 用意を待つ() {
    if (!用意の約束) 用意の約束 = 鏡を用意().catch(function () { return { 用意: 0 }; });
    return 用意の約束;
  }
  /* **すぐ 始める。**画面（vq2-app）は あとから 読み込まれるので、
     その頃には たいてい 済んでいる。 */
  try { 用意を待つ(); } catch (e) {}
  function 移す(鍵たち) {
    var 並 = (鍵たち && 鍵たち.length ? 鍵たち : 移してよい鍵).slice();
    var 結果 = { 移した: [], だめ: [], 減ったバイト: 0 };
    if (!使える()) { 結果.だめ = 並; return Promise.resolve(結果); }
    return 並.reduce(function (p, k) {
      return p.then(function () {
        var v = null;
        try { v = root.localStorage.getItem(k); } catch (e) { v = null; }
        if (v === null) return null;
        return 書く("ls:" + k, v).then(function (ok) {
          if (!ok) { 結果.だめ.push(k); return null; }
          try { root.localStorage.removeItem(k); } catch (e) {}
          結果.移した.push(k);
          結果.減ったバイト += (k.length + v.length) * 2;
          return null;
        });
      });
    }, Promise.resolve()).then(function () { return 結果; });
  }

  /* 移したものを 読む。まず localStorage（まだ 移していない端末）、
     無ければ IndexedDB。**どちらでも 同じように 読める**ようにする。 */
  function 大きいものを読む(鍵) {
    var v = null;
    try { v = root.localStorage.getItem(鍵); } catch (e) {}
    if (v !== null) return Promise.resolve(v);
    return 読む("ls:" + 鍵);
  }
  function 大きいものを書く(鍵, 文字) {
    if (使える()) {
      return 書く("ls:" + 鍵, String(文字)).then(function (ok) {
        if (ok) { try { root.localStorage.removeItem(鍵); } catch (e) {} return true; }
        return 手元へ(鍵, 文字);
      });
    }
    return Promise.resolve(手元へ(鍵, 文字));
  }
  function 手元へ(鍵, 文字) {
    try { root.localStorage.setItem(鍵, String(文字)); return true; }
    catch (e) { return false; }
  }

  /* ══ 壁に 当たる前に 逃がす（2026-08-19）══════════════════════════
     ★ localStorage は 4.4MB で 落ちる。落ちてから 直すのでは 遅い
       （**保存できなかったことに 気づけない**のが いちばん怖い）。
     ★ そこで 8 割（3.5MB）を 超えたら、決めた鍵を 静かに 移す。
     ★ 起動のとき 1 回 見る。重いことは しない（数えるだけ）。 */
  var 危ない線 = Math.round(4.4 * 1024 * 1024 * 0.8);
  function 見張る() {
    if (!使える()) return Promise.resolve({ した: false, 理由: "IndexedDB を 使えません" });
    var 量 = 手元の量();
    if (量.合計 < 危ない線) return Promise.resolve({ した: false, いま: 量.合計 });
    return 移す().then(function (r) {
      var 後 = 手元の量();
      try {
        console.warn("[VQIDB] 手元が 一杯に 近いので 移しました: "
          + Math.round(量.合計 / 1024) + "KB → " + Math.round(後.合計 / 1024) + "KB"
          + "（" + r.移した.join(", ") + "）");
      } catch (e) {}
      return { した: true, 前: 量.合計, 後: 後.合計, 移した: r.移した, だめ: r.だめ };
    });
  }
  /* 起動のとき 1 回。**待たない**（画面を 遅らせない）。 */
  try {
    if (root.requestIdleCallback) root.requestIdleCallback(function () { 見張る(); }, { timeout: 4000 });
    else setTimeout(function () { 見張る(); }, 2500);
  } catch (e) {}

  root.VQIDB = {
    /* 同期で 読み書きする 口（画面の readAll / writeAll が 使う） */
    鏡にある: 鏡にある, 鏡から: 鏡から, 鏡へ: 鏡へ,
    用意できた: 用意できた, 用意を待つ: 用意を待つ, 移してよい鍵か: function (k) {
      return 移してよい鍵.indexOf(String(k)) >= 0;
    },
    見張る: 見張る, 危ない線: 危ない線,
    使える: 使える, 読む: 読む, 書く: 書く, 消す: 消す, 鍵一覧: 鍵一覧,
    容量: 容量, 手元の量: 手元の量, 移す: 移す, 移してよい鍵: 移してよい鍵,
    大きいものを読む: 大きいものを読む, 大きいものを書く: 大きいものを書く
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
