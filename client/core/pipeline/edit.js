/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/edit.js — 直しの 一本道

   [1] セレクタ解決 … none / multiple なら **聞いて 終わり**（何もしない）
   [2] 操作を作る   … LLM が出してよいのは ここまで
   [3] Guard        … 宣言と 実測の突き合わせ
   [4] 検証         … 純粋関数
   [5] 直す / 戻す
   [6] 報告         … テンプレート（LLM を通さない）

   ★ 入口で 1 つでも 引っかかったら **その場で止まる**。
     「とりあえず近い所を直しておく」を できない作りにする。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* o = { kind, content, selector, selection, 作る(nodeIds, doc) -> ops,
          docType, intent, 何をしたい, 直す(bool) } */
  function edit(o) {
    o = o || {};
    var kind = 文(o.kind), content = o.content;
    if (!content) return 断り("いま開いている書類がありません。");

    var doc = VQW.ir.toIR(kind, content, { docType: o.docType && o.docType.id });

    /* [1] どこ */
    var ids = null;
    if (o.nodeIds && o.nodeIds.length) ids = o.nodeIds.slice();
    else if (o.selector) {
      var res = VQW.selector.resolve(doc, o.selector, o.selection);
      if (res.kind !== "unique") {
        if (res.kind === "multiple" && o.全部に当てる) ids = res.nodeIds.slice();
        else {
          var 聞 = VQW.selector.聞く(res, { 何をしたい: o.何をしたい });
          聞.完成と言ってよい = false;
          return 聞;
        }
      } else ids = [res.nodeId];
    } else return 断り("どこを直すか 指定されていません。");

    /* [2] 操作 */
    var ops = typeof o.作る === "function" ? (o.作る(ids, doc) || []) : (o.operations || []);
    if (!ops.length) return 断り("直す中身がありません。");

    /* [3][4][5] */
    var rep = VQW.ops.guard({
      kind: kind, content: content, docType: o.docType,
      errorで戻す: !!o.errorで戻す,
      request: { baseVersion: o.baseVersion || VQW.ops.版(content),
                 intent: o.intent, operations: ops }
    });
    if (rep.status !== "rejected" && o.直す !== false && VQW.pipeline.repair) {
      var r2 = VQW.pipeline.repair(kind, content, { docType: o.docType });
      rep.validation = VQW.validate.run(kind, content, { docType: o.docType });
      rep.直した = r2.直した;
    }

    /* [6] */
    return VQW.report.道具の返り(rep, o);
  }

  function 断り(なぜ) {
    return { だめ: なぜ + " **何もしていません。**", 完成と言ってよい: false,
             つぎ: "できたと言わないでください。" };
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.edit = edit;
})(typeof globalThis !== "undefined" ? globalThis : this);
