/* ══════════════════════════════════════════════════════════════════════
   core/validate/sheets.js — 表の 崩れ

   ★「厚生年金保...」を 検出するのが 目的のひとつ。
     幅の見かたは **画面の autoFit と同じ式**（16 + 文字数 × 13）にする。
     別の式にすると、検出と 直しが 食い違って 直らない。
   ★ 数と式の検査は numbers.js / formula.js に任せ、ここで束ねる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 既定幅 = 96;                     /* ui-sheets の CELL_W と同じ */
  var 既定高 = 26;                     /* CELL_H */

  /* 画面の autoFit と 同じ式。ここを 1 か所にしておく。 */
  function 要る幅(文字数) { return Math.max(48, Math.min(420, 16 + 文字数 * 13)); }
  function 入る文字数(幅) { return Math.max(1, Math.floor((幅 - 16) / 13)); }

  function 列番(s) {
    var c = 0;
    for (var i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64);
    return c - 1;                       /* colW は 0 始まり */
  }

  /* 画面に **実際に出ている** 文字。
     ★ 式のマスは 答えが出ていないと 分からない。分からないときは
       null を返して 幅の検査から 外す。式の文字（=SUM(D2:D6)）を
       測ると、答えは 4 文字なのに 11 文字ぶん 広げてしまう（実測で 落ちた）。 */
  function 見える文字(c, 値, ref) {
    if (c.type === "formulaCell") {
      if (値 && 値[ref] !== undefined) return String(値[ref]);
      return null;
    }
    return String(c.text || "");
  }

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];

    /* 数と式 */
    if (V.numbers) V.足す(結, V.numbers.check(doc, content, o));
    if (V.formula) V.足す(結, V.formula.check(doc, content, o));

    VQW.ir.walk(doc.root, function (sh) {
      if (sh.type !== "sheet") return;
      var a = sh.attrs || {};
      var colW = a.colW || {};
      var 値 = null;
      try {
        var 生 = ((content || {}).sheets || []).filter(function (x) { return x.id === sh.id; })[0];
        if (生 && root.VQ2 && VQ2.workplace && VQ2.workplace.formula)
          値 = (VQ2.workplace.formula.recalc(生) || {}).values || null;
      } catch (e) { 値 = null; }

      var マス = sh.children || [];
      if (!マス.length) {
        出.push(V.err("emptySheet", { nodeId: sh.id, どこ: VQW.ir.pathOf(doc.root, sh.id),
          なに: "「" + (a.name || "シート") + "」に マスが 1 つも 埋まっていません。",
          どうする: "中身を 入れてください。" }));
        return;
      }

      /* ── 列幅不足（文字が 切れる）── */
      var 切れ = {};
      マス.forEach(function (c) {
        var ref = String((c.attrs || {}).ref || "").toUpperCase();
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        if (!m) return;
        var ci = 列番(m[1]);
        var 幅 = Number(colW[ci]) > 0 ? Number(colW[ci]) : 既定幅;
        var t = 見える文字(c, 値, ref);
        if (!t) return;
        if (t.length <= 入る文字数(幅)) return;
        var k = m[1];
        if (!切れ[k] || t.length > 切れ[k].len)
          切れ[k] = { len: t.length, ref: ref, t: t, 幅: 幅, ci: ci, id: c.id };
      });
      Object.keys(切れ).forEach(function (k) {
        var x = 切れ[k];
        出.push(V.err("colTooNarrow", { nodeId: x.id,
          どこ: VQW.ir.pathOf(doc.root, sh.id) + "（" + x.ref + "）",
          なに: x.ref + " の「" + x.t.slice(0, 12) + "…」が 列幅 " + x.幅
            + "px に 入りません（" + 入る文字数(x.幅) + " 字まで / 中身は " + x.len + " 字）。",
          どうする: "列 " + k + " の幅を " + 要る幅(x.len) + "px にしてください。",
          直しかた: { 種: "colW", sheetId: sh.id, 列: x.ci, 幅: 要る幅(x.len) }
        }));
      });

      /* ── 結合が 並べ替え・絞り込みを 壊す ── */
      var 結合 = a.merges || [];
      if (結合.length) {
        var 表の中 = 結合.filter(function (r) {
          var mm = String(r).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          return mm && +mm[2] >= 2;                        /* 見出しより下 */
        });
        if (表の中.length) {
          出.push(V.warn("mergeInData", { nodeId: sh.id,
            どこ: VQW.ir.pathOf(doc.root, sh.id),
            なに: "データの行に 結合が " + 表の中.length + " か所 あります（"
              + 表の中.slice(0, 3).join(" / ") + "）。",
            どうする: "並べ替えと 絞り込みが 効かなくなります。見出しの上だけにしてください。" }));
        }
      }

      /* ── 数の列に 書式が 当たっているか ── */
      if (V.numbers) {
        var 数列 = V.numbers.数の列(sh);
        Object.keys(数列).forEach(function (k) {
          if (!数列[k]) return;
          var 付いている = 0, 全 = 0;
          マス.forEach(function (c) {
            var ref = String((c.attrs || {}).ref || "");
            var m2 = ref.match(/^([A-Z]+)(\d+)$/);
            if (!m2 || m2[1] !== k || +m2[2] <= 1) return;
            全++;
            var s = (c.attrs || {}).style;
            if (s && (s.fmt || s.format || s.numFmt)) 付いている++;
          });
          if (全 >= 3 && !付いている) {
            出.push(V.warn("noNumberFormat", { nodeId: sh.id,
              どこ: VQW.ir.pathOf(doc.root, sh.id) + "（列 " + k + "）",
              なに: "数の列 " + k + " に 表示の書式が 当たっていません。",
              どうする: "桁区切りや 通貨は **書式**でつけてください（文字で書かない）。" }));
          }
        });
      }

      /* ── 印刷が 入るか（言われたときだけ）── */
      if (o.期待ページ数) {
        var 最大行 = 0;
        マス.forEach(function (c) {
          var m3 = String((c.attrs || {}).ref || "").match(/^[A-Z]+(\d+)$/);
          if (m3) 最大行 = Math.max(最大行, +m3[1]);
        });
        var 一枚の行 = Math.floor((297 - 40) * 3.78 / 既定高);
        var 見こみ = Math.max(1, Math.ceil(最大行 / Math.max(1, 一枚の行)));
        if (見こみ > Number(o.期待ページ数)) {
          出.push(V.warn("pageOverflow", { nodeId: sh.id,
            なに: "見こみ " + 見こみ + " ページで、頼まれた " + o.期待ページ数 + " ページに入りません。",
            どうする: "行を減らすか、縮小して印刷してください。" }));
        }
      }
    });

    /* ── グラフの範囲 ── */
    VQW.ir.walk(doc.root, function (g) {
      if (g.type !== "chart") return;
      var r = String((g.attrs || {}).range || "");
      if (!/^[A-Z]+\d+:[A-Z]+\d+$/.test(r.toUpperCase())) {
        出.push(V.err("chartRange", { nodeId: g.id, どこ: VQW.ir.pathOf(doc.root, g.id),
          なに: "グラフの 範囲が おかしいです（" + (r || "空") + "）。",
          どうする: "A1:B10 の形で 入れてください。" }));
      }
    });

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.sheets = { check: check, 要る幅: 要る幅, 入る文字数: 入る文字数,
                          既定幅: 既定幅, 列番: 列番 };
})(typeof globalThis !== "undefined" ? globalThis : this);
