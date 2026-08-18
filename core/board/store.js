/* ══════════════════════════════════════════════════════════════════════
   core/board/store.js — ボードを **残しておく**（AR Board）

   ★ 訴え（2026-08-17）「ボードが 消えちゃうじゃん。もったいないから
     左サイドメニューに AR Board を 追加して、そこに 格納して。
     できれば 写真付きだと、どこの 何かが 分かるから」。

   ★ 決めごと
     ・置き場は **この端末の中**（localStorage）。写真が 入るので 外へは 出さない。
     ・写真は **小さくしてから** しまう（横 480px・JPEG 65%）。
       もとのまま しまうと 1 枚 1MB を 超えて、すぐ 入らなくなる。
     ・入り切らなくなったら **古いものから 捨てる**（黙って 全部 消さない）。
     ・利用者ごとに 分ける（ownerId）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var 鍵 = "vq2.arboards.v1";
  var 上限 = 60;
  /* いま 入っている いちばん大きい 連番の 次から 始める（読み込み直しても 続く） */
  var 連番 = 0;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 今() { return new Date().toISOString(); }
  function id() { return "brd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function 主() {
    try {
      var ST = root.VQ2 && root.VQ2.store;
      if (ST && ST.currentOwnerId) return ST.currentOwnerId() || "local";
    } catch (e) {}
    return "local";
  }

  function 全部() {
    try {
      var s = root.localStorage.getItem(鍵);
      var a = s ? JSON.parse(s) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function 書く(a) {
    try { root.localStorage.setItem(鍵, JSON.stringify(a)); return true; }
    catch (e) {
      /* 入り切らない。**古いものから 捨てて** もう一度（黙って 全部 消さない）。 */
      var b = a.slice();
      while (b.length > 1) {
        b.shift();
        try { root.localStorage.setItem(鍵, JSON.stringify(b)); return true; } catch (e2) {}
      }
      return false;
    }
  }

  /* 起動のとき、いま 入っているものの 連番を 見て 続きから 始める */
  (function () {
    try {
      全部().forEach(function (x) { if (Number(x.seq) > 連番) 連番 = Number(x.seq); });
    } catch (e) {}
  })();

  function 一覧(o) {
    o = o || {};
    var 主人 = o.ownerId || 主();
    return 全部().filter(function (x) { return !x.ownerId || x.ownerId === 主人; })
      /* ★ **時刻だけでは 並びが 決まらない**（2026-08-17・実測）。
         同じ秒に 2 枚 しまうと ISO の 文字列が 同じになり、
         新しいほうが 先に 来ない。連番で 決着を つける。 */
      .sort(function (a, b) {
        var d = (Number(b.seq) || 0) - (Number(a.seq) || 0);
        return d !== 0 ? d : 文(b.at).localeCompare(文(a.at));
      });
  }
  function 取る(i) {
    var a = 全部();
    for (var k = 0; k < a.length; k++) if (a[k].id === i) return a[k];
    return null;
  }

  /* 写真を 小さくする。**元のまま しまわない。** */
  function 縮める(dataUrl, 最大幅) {
    return new Promise(function (done) {
      if (!dataUrl) return done("");
      try {
        var im = new root.Image();
        im.onload = function () {
          try {
            var W = Math.min(Number(最大幅) || 480, im.width || 480);
            var H = Math.round((im.height || 1) * (W / (im.width || 1)));
            var cv = root.document.createElement("canvas");
            cv.width = W; cv.height = H;
            cv.getContext("2d").drawImage(im, 0, 0, W, H);
            done(cv.toDataURL("image/jpeg", 0.65));
          } catch (e) { done(""); }
        };
        im.onerror = function () { done(""); };
        im.src = dataUrl;
      } catch (e) { done(""); }
    });
  }

  /* しまう。戻り { id, 写真あり } */
  function 足す(o) {
    o = o || {};
    var md = 文(o.markdown).slice(0, 12000);
    if (!md.trim()) return Promise.resolve({ だめ: "中身が ありません。" });
    return 縮める(o.photo, 480).then(function (小) {
      var rec = {
        id: id(), ownerId: 主(),
        /* 並べるための 連番。時刻が 同じでも 前後が 決まる。 */
        seq: (連番 = 連番 + 1),
        title: 文(o.title).slice(0, 80) || "ボード",
        markdown: md,
        photo: 小 || "",
        source: 文(o.source).slice(0, 40) || "board",   /* camera / board */
        subject: 文(o.subject).slice(0, 24),
        at: 今()
      };
      var a = 全部();
      a.push(rec);
      while (a.length > 上限) a.shift();
      var ok = 書く(a);
      if (!ok) return { だめ: "端末に 入り切りませんでした。古いものを 消してください。" };
      return { id: rec.id, 写真あり: !!rec.photo, 数: 一覧().length };
    });
  }

  function 消す(i) {
    var a = 全部(), 前 = a.length;
    a = a.filter(function (x) { return x.id !== i; });
    書く(a);
    return 前 - a.length;
  }
  function 全消し() {
    var n = 一覧().length;
    var 主人 = 主();
    書く(全部().filter(function (x) { return x.ownerId && x.ownerId !== 主人; }));
    return n;
  }
  function 名を変える(i, 名) {
    var a = 全部(), 出 = false;
    a.forEach(function (x) { if (x.id === i) { x.title = 文(名).slice(0, 80); 出 = true; } });
    if (出) 書く(a);
    return 出;
  }
  function 使っている量() {
    try { return Math.round((root.localStorage.getItem(鍵) || "").length / 1024); }
    catch (e) { return 0; }
  }

  VQB.store = { 一覧: 一覧, 取る: 取る, 足す: 足す, 消す: 消す, 全消し: 全消し,
                名を変える: 名を変える, 使っている量: 使っている量, 縮める: 縮める, 上限: 上限 };
})(typeof globalThis !== "undefined" ? globalThis : this);
