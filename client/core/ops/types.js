/* ══════════════════════════════════════════════════════════════════════
   core/ops/types.js — 操作と 編集の願い

   ★ すべての操作が **対象の節点 ID を必ず持つ**。
     「だいたいこの辺」を表せない形にしておく。
     どこを直すか決まっていないのに直し始めるのが、
     「違う所を直す」の正体だった。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var OPS = ["setText", "setAttrs", "insertNode", "deleteNode", "moveNode",
             "replaceNode", "setFormula", "setLock"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 操作 1 つが「宣言していなければならない ID」 */
  function 宣言が要るID(op, doc) {
    var I = VQW.ir, r = doc && doc.root;
    var 出 = [];
    if (!op) return 出;
    if (op.op === "setText" || op.op === "setAttrs" || op.op === "setFormula"
        || op.op === "setLock") {
      出.push(文(op.nodeId));
    } else if (op.op === "insertNode") {
      出.push(文(op.parentId));
    } else if (op.op === "deleteNode") {
      /* ★ 消すときは **本人と親の 両方**を宣言する。
         親だけだと、消し方によって 本人の中身が変わる場合
         （表のマスを 空にする など）に 宣言外になる。 */
      var p = r ? I.parentOf(r, 文(op.nodeId)) : null;
      出.push(文(op.nodeId));
      if (p) 出.push(p.id);
    } else if (op.op === "moveNode") {
      var p2 = r ? I.parentOf(r, 文(op.nodeId)) : null;
      if (p2) 出.push(p2.id);
      出.push(文(op.newParentId));
    } else if (op.op === "replaceNode") {
      出.push(文(op.nodeId));
    }
    return 出.filter(Boolean);
  }

  /* 操作列から declaredTargets を **自動で** 作る。
     人（LLM）に書かせると 必ず抜ける。抜けたぶんは 宣言外として弾かれ、
     何も進まなくなる。宣言は 機械が作り、Guard は
     「宣言の通りにしか変わっていないか」だけを見る。 */
  function targetsOf(doc, operations) {
    var 見 = Object.create(null), 出 = [];
    (operations || []).forEach(function (op) {
      宣言が要るID(op, doc).forEach(function (id) {
        if (!見[id]) { 見[id] = 1; 出.push(id); }
      });
    });
    return 出;
  }

  function newRequest(o) {
    o = o || {};
    return {
      docId: 文(o.docId),
      /* ★ 0 と「言っていない」を 区別する。
         Number(x)||0 にすると 版 0 の書類で 競合を 見逃す（実測で 落ちた）。 */
      baseVersion: (o.baseVersion === undefined || o.baseVersion === null)
        ? null : (Number(o.baseVersion) || 0),
      intent: 文(o.intent),
      declaredTargets: Array.isArray(o.declaredTargets) ? o.declaredTargets.slice() : [],
      operations: Array.isArray(o.operations) ? o.operations.slice() : []
    };
  }

  function 知らない操作(operations) {
    var 悪 = [];
    (operations || []).forEach(function (op, i) {
      if (!op || OPS.indexOf(op.op) < 0) 悪.push({ 番: i + 1, op: op && op.op });
    });
    return 悪;
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.OPS = OPS;
  VQW.ops.newRequest = newRequest;
  VQW.ops.targetsOf = targetsOf;
  VQW.ops.宣言が要るID = 宣言が要るID;
  VQW.ops.知らない操作 = 知らない操作;
})(typeof globalThis !== "undefined" ? globalThis : this);
