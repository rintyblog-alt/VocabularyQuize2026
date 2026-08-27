/* ══════════════════════════════════════════════════════════════════════
   core/ops/guard.js — 宣言と 実測の 突き合わせ

   ★ ここが「絶対に壊さない」の中核。
     LLM の善意に頼らない。**言ったこと**と **実際に変わったところ**を
     機械が突き合わせ、はみ出したら まるごと戻す。
   ★ 手順（§4.3）
       1 baseVersion が合っているか（合わなければ 競合として断る）
       2 ロックされた所を触っていないか
       3 直す前の { id → hash } を取る
       4 **作業用のコピー**へ操作を当てる
       5 直したあとの { id → hash } を取る
       6 変わった所を出す
       7 宣言外があれば 戻す
       8 検証にかける。error があれば 直すか 戻す
       9 通ったときだけ 本物へ入れ替え、版を 1 つ進める
   ★ 「変わった所」の数え方（ここを緩めると 見張りにならない）
       ・ハッシュが変わった ID … その ID 自身が宣言されていること
       ・消えた ID           … その **親**（または本人）が宣言されていること
       ・増えた ID           … その **親**が宣言されていること
     ハッシュは浅い（hash.js）ので、祖先まで芋づるに「変わった」ことには
     ならない。だから この 3 つで足りる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function 版(content) {
    return Number(content && content.__work && content.__work.version) || 0;
  }
  function 版を進める(content) {
    content.__work = content.__work || {};
    content.__work.version = 版(content) + 1;
    return content.__work.version;
  }
  function ロック(content) {
    var w = (content && content.__work) || {};
    return Array.isArray(w.locks) ? w.locks : [];
  }

  /* 親の ID を（写しから）引く。消えた節点の親も引けるよう、直す前の写しを使う。 */
  function 親表(doc) {
    var m = Object.create(null);
    VQW.ir.walk(doc.root, function (n, p) { m[n.id] = p ? p.id : null; });
    return m;
  }

  /* ══ 本体 ═══════════════════════════════════════════════════════
     o = { kind, content, request, docType, 検証する(bool), 直す(fn) } */
  function run(o) {
    o = o || {};
    var kind = 文(o.kind);
    var content = o.content;
    var req = VQW.ops.newRequest(o.request);
    var I = VQW.ir;

    if (!content) return 断る("中身がありません。", "invalid", req);

    /* 1 — 版 */
    if (req.baseVersion !== null && req.baseVersion !== 版(content)) {
      return 断る("この書類は **その後 変わっています**（いま 版 " + 版(content)
        + " / 受け取ったのは 版 " + req.baseVersion + "）。読み直してから やり直してください。",
        "competing_edit", req);
    }

    /* 操作の形 */
    var 変 = VQW.ops.知らない操作(req.operations);
    if (変.length) return 断る("知らない操作があります。**何もしていません。**", "invalid", req, { 知らない操作: 変 });
    if (!req.operations.length) return 断る("操作が 1 つもありません。", "invalid", req);

    var 前doc = I.toIR(kind, content, { docType: o.docType });
    var 親 = 親表(前doc);

    /* 宣言。渡されていなければ 操作から機械が作る（人に書かせると必ず抜ける） */
    var 宣言 = req.declaredTargets.length ? req.declaredTargets.slice()
             : VQW.ops.targetsOf(前doc, req.operations);
    var 宣言表 = Object.create(null);
    宣言.forEach(function (id) { 宣言表[文(id)] = 1; });

    /* 2 — ロック */
    var 錠 = ロック(content);
    var 触った錠 = 宣言.filter(function (id) { return 錠.indexOf(文(id)) >= 0; });
    /* 子孫が錠の中にいる場合も止める */
    錠.forEach(function (lid) {
      if (触った錠.indexOf(lid) >= 0) return;
      req.operations.forEach(function (op) {
        var t = 文(op.nodeId || op.parentId);
        var cur = t;
        while (cur) { if (cur === lid) { 触った錠.push(lid); return; } cur = 親[cur]; }
      });
    });
    if (触った錠.length)
      return 断る("ピン留めされている所は 直せません。**何もしていません。**", "locked", req,
        { ピン留め: 触った錠 });

    /* 3 — 直す前 */
    var 前 = I.hashAll(前doc.root);

    /* 4 — 作業用のコピーへ当てる */
    var 作 = 複(content);
    var 結 = VQW.ops.applyAll(kind, 作, req.operations);

    /* 5 — 直したあと */
    var 後doc = I.toIR(kind, 作, { docType: o.docType });
    var 後 = I.hashAll(後doc.root);

    /* 6 — 変わった所
       ★ 合成 ID（表の行・マス）は **場所そのものが 名前**なので、
         行を 1 つ足すだけで それより下の ID が ずれる。
         これを「宣言外」と数えると、表の操作が 何ひとつ 通らなくなる。
         合成 ID は **いちばん近い 本物の ID の親**まで さかのぼって見る。
       ★ 消えたものは **どれかの祖先が 宣言されていれば** よい。
         根を宣言する＝構造を変えると 言っている、ということ。
         中身の書き換え（ハッシュが変わった）は これまでどおり
         **その節点そのもの**の宣言が要る。ここを緩めると 見張りにならない。 */
    var 後親 = 親表(後doc);
    function 本物まで(id, 親表さん) {
      var cur = id, 回 = 0;
      while (cur && I.割る合成(cur) && 回++ < 8) cur = 親表さん[cur];
      return cur;
    }
    /* 足してよい: 本人か 親が宣言されている。
       親ごと足した場合（ページを 1 枚足すと その中の部品も 増える）は 連鎖で認める。 */
    function 足してよい(id, 回) {
      if (宣言表[id]) return true;
      var p = 後親[id];
      if (!p || (回 || 0) > 32) return false;
      if (宣言表[p]) return true;
      if (前[p] === undefined) return 足してよい(p, (回 || 0) + 1);   /* 親ごと足した */
      return false;
    }
    /* 消してよい: 本人か 親が宣言されている。親ごと消えた場合は 連鎖で認める。
       **祖先なら何でもよい、にはしない**（根を宣言しただけで 何でも消せてしまう）。 */
    function 消してよい(id, 回) {
      if (宣言表[id]) return true;
      var p = 親[id];
      if (!p || (回 || 0) > 32) return false;
      if (宣言表[p]) return true;
      if (後[p] === undefined) return 消してよい(p, (回 || 0) + 1);   /* 親ごと消えた */
      return false;
    }
    var はみ出し = [];
    Object.keys(後).forEach(function (id) {
      if (前[id] === undefined) {                       /* 増えた */
        if (足してよい(id)) return;
        はみ出し.push({ id: id, なぜ: "宣言していない所へ 足された", 親: 後親[id] });
      } else if (前[id] !== 後[id]) {                    /* 変わった */
        if (宣言表[id]) return;
        var 実 = I.割る合成(id) ? 本物まで(id, 後親) : null;
        if (実 && 宣言表[実]) return;
        はみ出し.push({ id: id, なぜ: "宣言していない所が 変わった" });
      }
    });
    Object.keys(前).forEach(function (id) {
      if (後[id] !== undefined) return;                  /* 消えた */
      if (消してよい(id)) return;
      はみ出し.push({ id: id, なぜ: "宣言していない所が 消えた", 親: 親[id] });
    });

    /* 7 — はみ出したら 戻す（本物には 一切 触っていない） */
    if (はみ出し.length) {
      return 断る("**宣言していない所が変わった**ので、まるごと戻しました。**何もしていません。**",
        "out_of_scope", req, {
          はみ出し: はみ出し.slice(0, 12),
          はみ出した数: はみ出し.length,
          宣言していた所: 宣言.slice(0, 12)
        });
    }

    /* 8 — 検証 */
    var 検 = { errors: [], warnings: [] };
    if (o.検証する !== false && VQW.validate && VQW.validate.run) {
      検 = VQW.validate.run(kind, 作, { docType: o.docType, 直したID: 宣言 });
      if (検.errors.length && typeof o.直す === "function") {
        try { o.直す(作, 検); } catch (e) {}
        検 = VQW.validate.run(kind, 作, { docType: o.docType, 直したID: 宣言 });
      }
      if (検.errors.length && o.errorで戻す) {
        return 断る("直したあとに **崩れ**が出たので、まるごと戻しました。", "invalid", req,
          { 崩れ: 検.errors.slice(0, 8) });
      }
    }

    /* 9 — 本物へ
       ★ 入れ替えかた: **いちばん外の入れ物（content）は そのまま**にして、
         中の鍵だけ 差し替える。画面は content の参照を 握っているので、
         入れ物ごと 作り替えると 画面が 古いほうを 見続ける。
       ★ ただし **中の子（sheets[0] など）は 別の物になる**。
         呼び手が 子を 変数に取っていたら、通ったあとに **取り直すこと**。
         （実測: sheets.セル が 古い sheet を 見て「列幅は 変わっていない」と
         報告していた。） */
    var 前版 = 版(content);
    Object.keys(content).forEach(function (k) { delete content[k]; });
    Object.keys(作).forEach(function (k) { content[k] = 作[k]; });
    var 後版 = 版を進める(content);

    return {
      status: 結.落.length ? "partial" : "applied",
      version: { from: 前版, to: 後版 },
      applied: 結.済.map(function (x) {
        var id = x.入れたID || x.nodeId;
        return {
          nodeId: id,
          path: I.pathOf(後doc.root, id) || I.pathOf(前doc.root, id) || "",
          before: 見せる(前doc, x.nodeId),
          after: 見せる(後doc, id)
        };
      }),
      skipped: 結.落.map(function (x) {
        return { intent: x.op + "（" + (x.nodeId || "") + "）",
                 reason: /見つかりません/.test(x.なぜ) ? "not_found" : "invalid",
                 なぜ: x.なぜ };
      }),
      validation: 検,
      declaredTargets: 宣言
    };
  }

  function 親後(doc, id) {
    var p = VQW.ir.parentOf(doc.root, id);
    return p ? p.id : null;
  }

  function 見せる(doc, id) {
    var n = id ? VQW.ir.find(doc.root, id) : null;
    if (!n) return "";
    var t = VQW.ir.素(n.text || "");
    if (!t && n.attrs) {
      if (n.attrs.formula) t = 文(n.attrs.formula);
      else if (n.attrs.latex) t = 文(n.attrs.latex);
      else if (n.attrs.src) t = "（画像）";
    }
    return t.slice(0, 120);
  }

  function 断る(なぜ, reason, req, 足す) {
    var o = {
      status: "rejected",
      version: { from: 0, to: 0 },
      applied: [],
      skipped: [{ intent: req && req.intent || "", reason: reason, なぜ: なぜ }],
      validation: { errors: [], warnings: [] },
      理由: なぜ
    };
    if (足す) Object.keys(足す).forEach(function (k) { o[k] = 足す[k]; });
    return o;
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.guard = run;
  VQW.ops.版 = 版;
  VQW.ops.ロック = ロック;
})(typeof globalThis !== "undefined" ? globalThis : this);
