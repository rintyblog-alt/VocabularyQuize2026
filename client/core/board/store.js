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

  /* ══ 置き場を IndexedDB へ 移した（2026-08-19）══════════════════════
     ★ 実測: localStorage の 上限は **4.4MB**。利用者の端末は すでに 4.61MB。
       AR Board は 写真（1 枚 数十 KB）と 動く中身（コード）を 持つので、
       ここに 置き続けると **いちばん早く 壁に当たる**。
       IndexedDB は 同じ端末で **7.4GB**（実測）。
     ★ ただし 読み書きは **待つ形**でしか できない。画面は もう
       「その場で 読める」前提で 書いてあるので、**手元に 写しを 置く**。
         起動 → 1 回だけ 読み込む → 以後は 写しから 即答
         書いたとき → 写しを 直して、裏で IndexedDB へ 書く
     ★ IndexedDB が 使えない端末では これまでどおり localStorage。 */
  var 写し = null;          /* 読み込み済みの 中身（null = まだ 読んでいない） */
  var 読み込み = null;      /* 読み込み中の 約束 */

  function 生で読む() {
    try {
      var s = root.localStorage.getItem(鍵);
      var a = s ? JSON.parse(s) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  /* 起動のとき 1 回だけ。**待てる所から 呼ぶ**（VQB.store.用意）。 */
  function 用意() {
    if (写し) return Promise.resolve(写し);
    if (読み込み) return 読み込み;
    var IDB = root.VQIDB;
    if (!IDB || !IDB.使える()) { 写し = 生で読む(); return Promise.resolve(写し); }
    読み込み = IDB.大きいものを読む(鍵).then(function (s) {
      var a = [];
      try { a = s ? JSON.parse(s) : []; } catch (e) { a = []; }
      写し = Array.isArray(a) ? a : [];
      /* まだ localStorage に 残っていたら、こちらへ 移して 向こうは 空ける。 */
      try {
        if (root.localStorage.getItem(鍵) !== null) {
          IDB.大きいものを書く(鍵, JSON.stringify(写し));
        }
      } catch (e) {}
      連番を数え直す();
      return 写し;
    }).catch(function () { 写し = 生で読む(); return 写し; });
    return 読み込み;
  }
  function 全部() {
    if (写し) return 写し;
    /* まだ 読んでいないなら、**手元にあるぶんだけ**返す（空を 返さない）。
       用意() を 呼んでおけば ここへは 来ない。 */
    写し = 生で読む();
    用意();
    return 写し;
  }
  function 書く(a) {
    写し = a.slice();
    var IDB = root.VQIDB;
    if (IDB && IDB.使える()) {
      /* 裏で 書く。失敗しても 手元の写しは 生きているので 画面は 動く。 */
      IDB.大きいものを書く(鍵, JSON.stringify(写し));
      return true;
    }
    try { root.localStorage.setItem(鍵, JSON.stringify(写し)); return true; }
    catch (e) {
      /* 入り切らない。**古いものから 捨てて** もう一度（黙って 全部 消さない）。 */
      var b = 写し.slice();
      while (b.length > 1) {
        b.shift();
        try { root.localStorage.setItem(鍵, JSON.stringify(b)); 写し = b; return true; } catch (e2) {}
      }
      return false;
    }
  }
  function 連番を数え直す() {
    try { (写し || []).forEach(function (x) { if (Number(x.seq) > 連番) 連番 = Number(x.seq); }); }
    catch (e) {}
  }

  /* 連番は 読み込みが 済んだところで 数え直す（用意() の中）。
     ここで 全部() を 呼ぶと、まだ 読めていない時点の 数で 決まってしまう。 */

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
  /* ★ 種類が 2 つに なった（2026-08-19）:
       note … これまでの ボード（マークダウン）
       app  … **動くもの**（AR App）。中で 触れる ゲーム・教材。
     どちらも 同じ 置き場に 並ぶ。読むときは kind で 分ける。 */
  function 足す(o) {
    o = o || {};
    var 種 = 文(o.kind) === "app" ? "app" : "note";
    var md = 文(o.markdown).slice(0, 12000);
    var 符 = null;
    if (種 === "app") {
      var c = o.code || {};
      /* ★ 上限を 大きくした（2026-08-19 の 2 度目・「まじで すごいものを 一発で」）。
         200 行までと 縛っていたら、そもそも すごいものが 書けない。
         localStorage は 5MB ほど 入るので、1 本 十数万字でも 何本も 持てる。 */
      符 = {
        html: 文(c.html).slice(0, 80000),
        css: 文(c.css).slice(0, 40000),
        js: 文(c.js).slice(0, 120000),
        code: 文(c.code).slice(0, 160000),
        /* 借りた道具（phaser / three …）。開き直したときも 同じものを 借りる。 */
        libs: Array.isArray(c.libs) ? c.libs.slice(0, 8).map(function (x) { return 文(x).slice(0, 24); }) : []
      };
      if (!(符.html + 符.css + 符.js + 符.code).trim())
        return Promise.resolve({ だめ: "動かす中身が ありません。" });
    } else if (!md.trim()) {
      return Promise.resolve({ だめ: "中身が ありません。" });
    }
    return 縮める(o.photo, 480).then(function (小) {
      var rec = {
        id: id(), ownerId: 主(),
        /* 並べるための 連番。時刻が 同じでも 前後が 決まる。 */
        seq: (連番 = 連番 + 1),
        title: 文(o.title).slice(0, 80) || (種 === "app" ? "AR App" : "ボード"),
        kind: 種,
        code: 符,
        markdown: md,
        photo: 小 || "",
        source: 文(o.source).slice(0, 40) || (種 === "app" ? "app" : "board"),
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
    try { return Math.round(JSON.stringify(写し || []).length / 1024); }
    catch (e) { return 0; }
  }

  /* 起動のとき 1 回だけ 読み込む（待てる所から）。ここを 呼び忘れると、
     1 回目の 一覧が 手元のぶんだけになる（次の描き直しで そろう）。 */
  try { 用意(); } catch (e) {}

  VQB.store = { 一覧: 一覧, 取る: 取る, 足す: 足す, 消す: 消す, 全消し: 全消し,
                名を変える: 名を変える, 使っている量: 使っている量, 縮める: 縮める,
                上限: 上限, 用意: 用意 };
})(typeof globalThis !== "undefined" ? globalThis : this);
