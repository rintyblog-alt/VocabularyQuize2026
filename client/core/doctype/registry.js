/* ══════════════════════════════════════════════════════════════════════
   core/doctype/registry.js — 書式カタログの 置き場

   ★ **DocType を 1 個足すのに デプロイが要る作りにしない**（§6.2）。
     いまは 静的ファイル（/data/doctypes/*.json）から読む。
     公開後に D1 / R2 へ移すときは 取りにいく関数を差し替えるだけ。
   ★ 取りにいけないときは **黙って空にしない**。「読めなかった」と言う。
     カタログが 0 個でも、正直なら 使いものになる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var S = function () { return VQW.doctype.schema; };

  var 棚 = Object.create(null);        /* id → DocType */
  var 読んだ = false, 読み中 = null, 読めなかった = null;

  /* 外から差し替えられるようにしておく（D1 / R2 へ移すときの口） */
  var 取りにいく = function () {
    if (!root.fetch) return Promise.resolve([]);
    return root.fetch("/data/doctypes/index.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("index " + r.status); return r.json(); })
      .then(function (j) {
        var 名 = (j && j.doctypes) || [];
        return Promise.all(名.map(function (n) {
          return root.fetch("/data/doctypes/" + n + ".json", { cache: "no-cache" })
            .then(function (r2) { return r2.ok ? r2.json() : null; })
            .catch(function () { return null; });
        }));
      })
      .then(function (a) { return a.filter(Boolean); });
  };

  function 入れる(d) {
    var t = S().そろえる(d);
    var 悪 = S().確かめる(t);
    if (悪.length) return { だめ: t.id + ": " + 悪.join(" / ") };
    棚[t.id] = t;
    return { ok: true, id: t.id };
  }

  function load(o) {
    o = o || {};
    if (読んだ && !o.もう一度) return Promise.resolve(一覧());
    if (読み中) return 読み中;
    読み中 = Promise.resolve()
      .then(function () { return 取りにいく(); })
      .then(function (a) {
        (a || []).forEach(入れる);
        読んだ = true; 読み中 = null; 読めなかった = null;
        return 一覧();
      })
      .catch(function (e) {
        読み中 = null;
        読めなかった = String(e && e.message || e).slice(0, 80);
        return 一覧();
      });
    return 読み中;
  }

  function get(id) { return 棚[String(id)] || null; }
  function 一覧() {
    return Object.keys(棚).map(function (k) {
      return { id: k, displayName: 棚[k].displayName, kind: 棚[k].kind,
               status: 棚[k].status, aliases: 棚[k].aliases };
    });
  }
  function すべて() { return Object.keys(棚).map(function (k) { return 棚[k]; }); }
  function 具合() {
    return { 読んだ: 読んだ, 個数: Object.keys(棚).length, 読めなかった: 読めなかった };
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.registry = {
    load: load, get: get, 一覧: 一覧, すべて: すべて, 入れる: 入れる, 具合: 具合,
    取りにいくを差し替える: function (fn) { if (typeof fn === "function") { 取りにいく = fn; 読んだ = false; } }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
