/* ══════════════════════════════════════════════════════════════════════
   core/doctype/schema.js — 書式カタログの 形

   ★ fillPolicy が「値を捏造しない」の 実装そのもの（§6.1）
       user_input  … **LLM が値を作ってはならない**。空欄＋入力ヒントを出す。
                     金額・氏名・番号・日付・料率は すべてこれ。
       derived     … 式か 計算で 出す（calculations に書く）
       llm_allowed … LLM が書いてよい（問題文・見出し・説明文）
   ★ DocType は **データ**（JSON）。ここは その形を確かめるだけで、
     中身を コードに埋め込まない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 埋めかた = ["user_input", "derived", "llm_allowed"];
  var 値の型 = ["text", "number", "money", "date", "percent", "enum"];
  var 種類 = ["docs", "sheets", "slides"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  function 欄をそろえる(f) {
    return {
      key: 文(f && f.key),
      label: 文(f && f.label) || 文(f && f.key),
      dataType: 値の型.indexOf(文(f && f.dataType)) >= 0 ? 文(f.dataType) : "text",
      fillPolicy: 埋めかた.indexOf(文(f && f.fillPolicy)) >= 0 ? 文(f.fillPolicy) : "user_input",
      format: 文(f && f.format) || undefined,
      hint: 文(f && f.hint) || undefined,
      note: 文(f && f.note) || undefined,
      options: 配(f && f.options).map(文)
    };
  }

  function そろえる(d) {
    d = d || {};
    return {
      id: 文(d.id),
      kind: 種類.indexOf(文(d.kind)) >= 0 ? 文(d.kind) : "docs",
      displayName: 文(d.displayName) || 文(d.id),
      aliases: 配(d.aliases).map(文),
      parent: d.parent ? 文(d.parent) : null,
      requiredFields: 配(d.requiredFields).map(欄をそろえる),
      optionalFields: 配(d.optionalFields).map(欄をそろえる),
      regions: 配(d.regions),
      calculations: 配(d.calculations),
      validations: 配(d.validations),
      printSpec: d.printSpec || { paper: "A4", orientation: "portrait",
        margins: { top: 20, right: 18, bottom: 20, left: 18 } },
      source: d.source || { kind: "manual", ref: "", checkedAt: "" },
      status: 文(d.status) === "approved" ? "approved" : "draft"
    };
  }

  /* 形が おかしいものは 使わない（黙って使うと 検証が空回りする） */
  function 確かめる(d) {
    var 悪 = [];
    if (!文(d && d.id)) 悪.push("id がありません");
    if (種類.indexOf(文(d && d.kind)) < 0) 悪.push("kind が docs / sheets / slides ではありません");
    配(d && d.requiredFields).forEach(function (f, i) {
      if (!文(f && f.key)) 悪.push("requiredFields[" + i + "].key がありません");
      if (f && f.fillPolicy && 埋めかた.indexOf(文(f.fillPolicy)) < 0)
        悪.push("requiredFields[" + i + "].fillPolicy が 知らない値です（" + f.fillPolicy + "）");
    });
    配(d && d.calculations).forEach(function (c, i) {
      if (!文(c && (c.target || c.key))) 悪.push("calculations[" + i + "].target がありません");
      if (!文(c && c.formula)) 悪.push("calculations[" + i + "].formula がありません");
    });
    return 悪;
  }

  /* LLM が値を作ってよい欄だけ返す。**ここを通さずに埋めさせない。** */
  function 書いてよい欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "llm_allowed"; });
  }
  function 人が入れる欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "user_input"; });
  }
  function 計算で出す欄(d) {
    return (d.requiredFields || []).concat(d.optionalFields || [])
      .filter(function (f) { return f.fillPolicy === "derived"; });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.schema = {
    そろえる: そろえる, 確かめる: 確かめる, 欄をそろえる: 欄をそろえる,
    書いてよい欄: 書いてよい欄, 人が入れる欄: 人が入れる欄, 計算で出す欄: 計算で出す欄,
    埋めかた: 埋めかた, 値の型: 値の型
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
