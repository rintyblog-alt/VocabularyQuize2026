/* ══════════════════════════════════════════════════════════════════════
   core/ir/snapshot.js — 控えと 戻す／やり直す

   ★ これが「壊さない」の最後の保険。Guard をすり抜けた直しがあっても、
     ここが動く限り 元へ戻せる。
   ★ 直近 20 版は 全文で持つ。それより前は **差分（JSON Patch）** にして、
     いちばん古い 1 つだけ全文で持つ。長い作業でも重くならない。
   ★ 版を戻すのは content（保存形式）そのもの。WorkIR は写しなので、
     戻したあとに もう一度 写しを作れば そろう。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function 同じ(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function esc(s) { return String(s).replace(/~/g, "~0").replace(/\//g, "~1"); }
  function unesc(s) { return String(s).replace(/~1/g, "/").replace(/~0/g, "~"); }
  function 型(v) {
    return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  }

  /* ── 差分を作る（RFC6902 の add / remove / replace だけ）───────── */
  function diff(a, b, path, out) {
    path = path || ""; out = out || [];
    if (a === b) return out;
    if (型(a) !== 型(b)) { out.push({ op: "replace", path: path, value: 複(b) }); return out; }
    if (型(a) === "array") {
      var n = Math.min(a.length, b.length), i;
      for (i = 0; i < n; i++) diff(a[i], b[i], path + "/" + i, out);
      /* 減るほうを **後ろから**。前から消すと 番号がずれる。 */
      for (i = a.length - 1; i >= b.length; i--) out.push({ op: "remove", path: path + "/" + i });
      for (i = a.length; i < b.length; i++)
        out.push({ op: "add", path: path + "/" + i, value: 複(b[i]) });
      return out;
    }
    if (型(a) === "object") {
      Object.keys(a).forEach(function (k) {
        if (!(k in b)) out.push({ op: "remove", path: path + "/" + esc(k) });
      });
      Object.keys(b).forEach(function (k) {
        if (!(k in a)) out.push({ op: "add", path: path + "/" + esc(k), value: 複(b[k]) });
        else diff(a[k], b[k], path + "/" + esc(k), out);
      });
      return out;
    }
    if (a !== b) out.push({ op: "replace", path: path, value: 複(b) });
    return out;
  }

  function 親をたどる(o, path) {
    var 部 = String(path).split("/").slice(1).map(unesc);
    var 鍵 = 部.pop(), cur = o;
    for (var i = 0; i < 部.length; i++) {
      if (cur === null || cur === undefined) return null;
      cur = Array.isArray(cur) ? cur[+部[i]] : cur[部[i]];
    }
    return { 親: cur, 鍵: 鍵 };
  }

  function applyPatch(base, ops) {
    var o = 複(base);
    (ops || []).forEach(function (p) {
      if (p.path === "") { o = 複(p.value); return; }
      var t = 親をたどる(o, p.path);
      if (!t || t.親 === null || t.親 === undefined) return;
      if (Array.isArray(t.親)) {
        var i = +t.鍵;
        if (p.op === "remove") t.親.splice(i, 1);
        else if (p.op === "add") t.親.splice(i, 0, 複(p.value));
        else t.親[i] = 複(p.value);
      } else {
        if (p.op === "remove") delete t.親[t.鍵];
        else t.親[t.鍵] = 複(p.value);
      }
    });
    return o;
  }

  /* ══ 控えの帳面 ═══════════════════════════════════════════════ */
  var 全文で持つ = 20;

  function newHistory(content) {
    return {
      base: JSON.stringify(content || {}),      /* いちばん古い版（全文） */
      進み: [],                                  /* base からの 前向き差分 */
      新: [],                                    /* 直近 20 版（全文・古い順） */
      ラベル: [],
      やり直し: []                               /* redo 用（全文） */
    };
  }

  function 版数(h) { return h.進み.length + h.新.length; }

  /* いまの中身を控える。**直す前に**呼ぶ。 */
  function push(h, content, label) {
    h.新.push(JSON.stringify(content || {}));
    h.ラベル.push(String(label || ""));
    h.やり直し.length = 0;                       /* 新しく直したら redo は捨てる */
    while (h.新.length > 全文で持つ) {
      var 古 = JSON.parse(h.新.shift());
      var 前 = 版数の中身(h, h.進み.length);
      h.進み.push(diff(前, 古));
      h.ラベル.shift();
    }
    return 版数(h);
  }

  /* n 番目（0 = base）の中身を組み立てる */
  function 版数の中身(h, n) {
    var o = JSON.parse(h.base);
    for (var i = 0; i < Math.min(n, h.進み.length); i++) o = applyPatch(o, h.進み[i]);
    if (n > h.進み.length) {
      var k = n - h.進み.length - 1;
      if (k >= 0 && k < h.新.length) o = JSON.parse(h.新[k]);
    }
    return o;
  }

  /* 1 つ戻す。戻した中身を返す（呼び手が content へ入れ替える）。 */
  function undo(h, いまの中身) {
    if (!h.新.length && !h.進み.length) return null;
    var 前;
    if (h.新.length) { 前 = JSON.parse(h.新.pop()); h.ラベル.pop(); }
    else { 前 = 版数の中身(h, h.進み.length - 1); h.進み.pop(); }
    h.やり直し.push(JSON.stringify(いまの中身 || {}));
    return 前;
  }

  function redo(h, いまの中身) {
    if (!h.やり直し.length) return null;
    var 先 = JSON.parse(h.やり直し.pop());
    h.新.push(JSON.stringify(いまの中身 || {}));
    h.ラベル.push("やり直し");
    return 先;
  }

  function 一覧(h) {
    var 出 = [];
    for (var i = 0; i < h.進み.length; i++) 出.push({ 版: i + 1, なぜ: "（差分）" });
    for (var j = 0; j < h.新.length; j++)
      出.push({ 版: h.進み.length + j + 1, なぜ: h.ラベル[j] || "" });
    return 出;
  }

  VQW.snapshot = {
    newHistory: newHistory, push: push, undo: undo, redo: redo,
    一覧: 一覧, 版数: 版数, 版数の中身: 版数の中身,
    diff: diff, applyPatch: applyPatch, 同じ: 同じ
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
