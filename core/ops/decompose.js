/* ══════════════════════════════════════════════════════════════════════
   core/ops/decompose.js — 大きな直しを **作り直しにしない**

   ★ 「20 枚を 40 枚に」「全部作り直して」も、作り直しではなく 操作列にする。
     作り直すと、位置も書式も 手直しも 黙って消える（実測で何度も起きた）。
   ★ 大きな直しのときに 必ずやること（§4.5）
       ① 当てる前に **何が変わるか** を出して 確かめてもらう
       ② 50 件ずつに分け、束ごとに Guard と 検証を通す
       ③ 途中で落ちたら **そこで止めて、正確に報告する**
       ④ ピン留めされた所を触る操作は **分解の段階で外す**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 束の大きさ = 50;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── ピン留めを外す ────────────────────────────────────────── */
  function 錠を避ける(kind, content, operations) {
    var 錠 = VQW.ops.ロック(content);
    if (!錠.length) return { 通す: (operations || []).slice(), 外した: [] };
    var doc = VQW.ir.toIR(kind, content);
    var 親 = Object.create(null);
    VQW.ir.walk(doc.root, function (n, p) { 親[n.id] = p ? p.id : null; });
    var 通す = [], 外した = [];
    operations.forEach(function (op) {
      var t = 文(op.nodeId || op.parentId), cur = t, 当 = false;
      while (cur) { if (錠.indexOf(cur) >= 0) { 当 = true; break; } cur = 親[cur]; }
      if (当) 外した.push({ op: op.op, nodeId: t, なぜ: "ピン留めされています" });
      else 通す.push(op);
    });
    return { 通す: 通す, 外した: 外した };
  }

  /* ── 何が変わるか（当てる前に見せる）───────────────────────── */
  function preview(kind, content, operations) {
    var I = VQW.ir;
    var 前doc = I.toIR(kind, content);
    var 作 = JSON.parse(JSON.stringify(content));
    var 結 = VQW.ops.applyAll(kind, 作, operations);
    var 後doc = I.toIR(kind, 作);
    var 前 = I.hashAll(前doc.root), 後 = I.hashAll(後doc.root);
    var 足す = [], 消す = [], 直す = [];
    Object.keys(後).forEach(function (id) {
      if (id === "root") return;         /* 根は 中身ではなく 入れ物。足す/消す で もう見えている */
      if (前[id] === undefined) 足す.push(見出し(後doc, id));
      else if (前[id] !== 後[id]) 直す.push({
        どこ: I.pathOf(後doc.root, id), 前: 文字(前doc, id), 後: 文字(後doc, id) });
    });
    Object.keys(前).forEach(function (id) {
      if (id !== "root" && 後[id] === undefined) 消す.push(見出し(前doc, id));
    });
    return {
      足す数: 足す.length, 消す数: 消す.length, 直す数: 直す.length,
      足す: 足す.slice(0, 20), 消す: 消す.slice(0, 20), 直す: 直す.slice(0, 20),
      当たらなかった: 結.落.slice(0, 10)
    };
  }

  function 見出し(doc, id) {
    return { どこ: VQW.ir.pathOf(doc.root, id), 中身: 文字(doc, id) };
  }
  function 文字(doc, id) {
    var n = VQW.ir.find(doc.root, id);
    return n ? VQW.ir.素(n.text || "").slice(0, 80) : "";
  }

  /* ── 束に分けて 順に当てる ────────────────────────────────── */
  function 段階適用(o) {
    o = o || {};
    var kind = 文(o.kind), content = o.content;
    var 避 = 錠を避ける(kind, content, o.operations || []);
    var ops = 避.通す;
    var 束 = [];
    for (var i = 0; i < ops.length; i += 束の大きさ) 束.push(ops.slice(i, i + 束の大きさ));

    var 済 = [], 落 = 避.外した.map(function (x) {
      return { intent: x.op + "（" + x.nodeId + "）", reason: "locked", なぜ: x.なぜ };
    });
    var 版 = { from: VQW.ops.版(content), to: VQW.ops.版(content) };
    var 検 = { errors: [], warnings: [] };
    var 止まった = null;

    for (var b = 0; b < 束.length; b++) {
      var r = VQW.ops.guard({
        kind: kind, content: content, docType: o.docType,
        errorで戻す: !!o.errorで戻す,
        request: { baseVersion: VQW.ops.版(content), intent: o.intent, operations: 束[b] }
      });
      if (r.status === "rejected") {
        止まった = { 束: b + 1, 全部の束: 束.length, なぜ: r.理由, reason: r.skipped[0] && r.skipped[0].reason };
        落 = 落.concat(r.skipped);
        break;
      }
      済 = 済.concat(r.applied);
      落 = 落.concat(r.skipped);
      検 = r.validation;
      版.to = r.version.to;
    }

    return {
      status: 止まった ? (済.length ? "partial" : "rejected")
            : (落.length ? "partial" : "applied"),
      version: 版, applied: 済, skipped: 落, validation: 検,
      止まった: 止まった,
      束の数: 束.length
    };
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.preview = preview;
  VQW.ops.段階適用 = 段階適用;
  VQW.ops.錠を避ける = 錠を避ける;
  VQW.ops.束の大きさ = 束の大きさ;
})(typeof globalThis !== "undefined" ? globalThis : this);
