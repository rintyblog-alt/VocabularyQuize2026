/* ══════════════════════════════════════════════════════════════════════
   core/doctype/generate.js — 書式を 自動で 起こす（**構築時**に走らせる）

   ★ 実行時に 走らせない。頼まれたその場で 法令を引いて 様式を作ると、
     待たされるうえ、内容が 毎回 変わる。
   ★ 出てくるのは 必ず status:"draft"。**人が見て approved にするまで、
     画面に「未承認の書式です」と出す。**
   ★ 取り出すのは「必須項目の並び」と「領域の構成」という **事実**だけ。
     既存の様式の デザインそのものを 複製しない。
   ★ 調べものは アプリの口（/api/research/search・/api/research/read）を
     そのまま使う。ここに 新しい取りに行き方を 作らない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* 「〜に掲げる事項を記載しなければならない」を 探すための 言いかた */
  var 引きかた = [
    "{名前} 記載事項 法令",
    "{名前} 記載しなければならない 事項",
    "{名前} 様式 記載例 厚生労働省 OR 国税庁 OR 総務省"
  ];

  /* 条文から 項目を 拾う。番号つきの並びだけを 取る（文章は取らない）。 */
  function 項目を拾う(本文) {
    var s = 文(本文);
    var 出 = [];
    var re = /(?:^|\n)\s*(?:[一二三四五六七八九十]{1,3}|[０-９0-9]{1,2})\s*[　\.、）\)]\s*([^\n]{2,40})/g, m;
    while ((m = re.exec(s)) !== null) {
      var t = m[1].replace(/[（(][^）)]*[）)]/g, "").trim();
      if (t && 出.indexOf(t) < 0) 出.push(t);
      if (出.length >= 40) break;
    }
    return 出;
  }

  /* 項目の名前から 埋めかたを 決める。
     **迷ったら user_input。**捏造するくらいなら 空欄のほうがよい。 */
  var 人が入れる語 = ["氏名", "名称", "住所", "所在", "番号", "日", "年月", "金額", "額",
                      "料", "率", "時間", "日数", "個数", "数量", "口座", "印", "署名"];
  var 書いてよい語 = ["説明", "注意", "備考", "件名", "表題", "目的", "概要", "案内"];
  function 埋めかた(名) {
    var s = 文(名);
    for (var i = 0; i < 人が入れる語.length; i++) if (s.indexOf(人が入れる語[i]) >= 0) return "user_input";
    for (var j = 0; j < 書いてよい語.length; j++) if (s.indexOf(書いてよい語[j]) >= 0) return "llm_allowed";
    return "user_input";
  }
  function 型(名) {
    var s = 文(名);
    if (/金額|額|料|給|税|円/.test(s)) return "money";
    if (/年月日|日付|期間|日$/.test(s)) return "date";
    if (/率|割合|％|%/.test(s)) return "percent";
    if (/数|回数|時間|人数|番号/.test(s)) return "number";
    return "text";
  }

  /* ══ 通し（調べる → 起こす）═══════════════════════════════════
     o = { 名前, kind, 調べる(質問)->Promise<[{title,url,snippet}]>,
           読む(url)->Promise<{text}> } */
  function 起こす(o) {
    o = o || {};
    var 名 = 文(o.名前);
    if (!名) return Promise.reject(new Error("書類の名前がありません"));
    var 調 = typeof o.調べる === "function" ? o.調べる : null;
    var 読 = typeof o.読む === "function" ? o.読む : null;
    if (!調 || !読) return Promise.resolve(たね(名, o.kind, [], []));

    var 質問 = 引きかた.map(function (t) { return t.replace("{名前}", 名); });
    return Promise.all(質問.map(function (q) {
      return Promise.resolve(調(q)).catch(function () { return []; });
    })).then(function (結) {
      var url = [], 見 = {};
      結.forEach(function (a) {
        配(a).slice(0, 3).forEach(function (r) {
          var u = 文(r && r.url);
          if (u && !見[u]) { 見[u] = 1; url.push({ url: u, title: 文(r.title) }); }
        });
      });
      return Promise.all(url.slice(0, 5).map(function (x) {
        return Promise.resolve(読(x.url))
          .then(function (r) { return { url: x.url, title: x.title, text: 文(r && r.text) }; })
          .catch(function () { return null; });
      }));
    }).then(function (本) {
      var 元 = (本 || []).filter(Boolean);
      var 項 = [];
      元.forEach(function (p) {
        項目を拾う(p.text).forEach(function (t) { if (項.indexOf(t) < 0) 項.push(t); });
      });
      return たね(名, o.kind, 項, 元);
    });
  }

  function たね(名, kind, 項, 元) {
    var 欄 = 項.map(function (t) {
      return { key: t.replace(/[\s：:]/g, "").slice(0, 24), label: t,
               dataType: 型(t), fillPolicy: 埋めかた(t),
               hint: 埋めかた(t) === "user_input" ? t + " を書く所です" : undefined };
    });
    return VQW.doctype.schema.そろえる({
      id: "gen_" + VQW.doctype.fallback.正規(名).slice(0, 24),
      kind: 文(kind) || "docs",
      displayName: 名,
      aliases: [名],
      requiredFields: 欄,
      optionalFields: [],
      regions: [{ id: "body", label: "", showLabel: false,
                  fields: 欄.map(function (f) { return f.key; }) }],
      calculations: [],
      validations: [{ rule: "noPlaceholder", severity: "error" }],
      source: {
        kind: 元 && 元.length ? "law" : "manual",
        ref: (元 || []).map(function (p) { return p.url; }).slice(0, 5).join(" / "),
        checkedAt: (function () { try { return new Date().toISOString().slice(0, 10); } catch (e) { return ""; } })()
      },
      status: "draft"                       /* ★ 必ず draft。人が承認する。 */
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.generate = { 起こす: 起こす, 項目を拾う: 項目を拾う,
                           埋めかた: 埋めかた, 型: 型, たね: たね };
})(typeof globalThis !== "undefined" ? globalThis : this);
