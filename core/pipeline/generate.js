/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/generate.js — 作るときの 一本道

   [1] 何を作るか   … 答えで 出来上がりが 大きく変わることだけ 聞く
   [2] DocType 解決 … exact / near / none。**near と none は 画面に出す**
   [3] 骨組み       … LLM（regions の並び）
   [4] 中身         … LLM。**ただし fillPolicy が llm_allowed の欄だけ**
                      user_input は **空欄（記入欄）** として置く
   [5] 組み立て     … 計算だけ。ID を発行する
   [6] 位置決め     … 計算だけ（番地・列幅）
   [7] 検証         … 計算だけ
   [8] 直す         … 崩れた所だけ
   [9] 報告         … テンプレート

   ★ LLM が 触れるのは [3][4] だけ。番地も 幅も 色も 出させない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* ══ LLM への頼みかた（§10）══════════════════════════════════════
     ・JSON だけ返させる
     ・**書いてよい欄だけ** 並べて渡す
     ・user_input の欄は 名前も渡すが「**値を書くな**」と はっきり言う */
  function プロンプト(dt, 頼み, o) {
    o = o || {};
    var よい = VQW.doctype.schema.書いてよい欄(dt);
    var 人 = VQW.doctype.schema.人が入れる欄(dt);
    var 計 = VQW.doctype.schema.計算で出す欄(dt);
    var 行 = [];
    行.push("あなたは 日本語の書類づくりの担当です。**JSON だけ**を返します。");
    行.push("前置き・言い訳・``` は 書きません。");
    行.push("");
    行.push("書式: " + dt.displayName + "（" + dt.id + "）");
    行.push("");
    行.push("次の形の JSON を返してください:");
    行.push('{"fields":{"欄の名前":"中身", ...},"sections":[{"id":"…","items":["…"]}]}');
    行.push("");
    if (よい.length) {
      行.push("★ **あなたが書いてよい欄は これだけです**:");
      よい.forEach(function (f) {
        行.push("　・" + f.key + "（" + f.label + "）"
          + (f.note ? " … " + f.note : "")
          + (o.文字数 && o.文字数[f.key] ? " … " + o.文字数[f.key] + " 字以内" : ""));
      });
    }
    if (人.length) {
      行.push("");
      行.push("★ **次の欄には 値を入れてはいけません。**");
      行.push("　こちらは 人が自分で書く所です。それらしい数字や名前を作ると、");
      行.push("　そのまま提出されて 事故になります。**空のままにしてください。**");
      人.forEach(function (f) { 行.push("　・" + f.key + "（" + f.label + "）"); });
    }
    if (計.length) {
      行.push("");
      行.push("★ 次の欄は **計算で出します**。値を書かないでください。");
      計.forEach(function (f) { 行.push("　・" + f.key + "（" + f.label + "）"); });
    }
    行.push("");
    行.push("★ 「○○」「△△」「（ここに記入）」のような 埋めていない印は 書かないでください。");
    行.push("　書くところが 決まらないなら、その欄を 省いてください。");
    行.push("");
    行.push("頼まれた内容: " + 文(頼み));
    return 行.join("\n");
  }

  /* ══ 組み立て（計算だけ）═══════════════════════════════════════ */
  function 空の中身(kind) {
    if (kind === "docs") return { blocks: [], page: null };
    if (kind === "sheets") return { sheets: [{ id: VQW.ir.wpId("sh"), name: "シート1",
      rows: 60, cols: 20, cells: {}, colW: {}, rowH: {}, merges: [],
      freeze: { rows: 0, cols: 0 }, hidden: false, color: "",
      filters: null, conditionals: [] }], charts: [], activeSheet: 0 };
    if (kind === "slides") return { ratio: "16:9", theme: "minimal", slides: [],
      transition: { type: "fade", speed: 300 } };
    return {};
  }

  function 欄を引く(dt, key) {
    var 全 = (dt.requiredFields || []).concat(dt.optionalFields || []);
    for (var i = 0; i < 全.length; i++) if (全[i].key === key) return 全[i];
    return null;
  }

  /* Docs: regions の並びどおりに ブロックを積む */
  function docs組み立て(dt, 値, o) {
    o = o || {};
    var c = 空の中身("docs");
    if (dt.printSpec) {
      var p = dt.printSpec;
      c.page = { mode: "paper", size: 文(p.paper || "A4").toLowerCase(),
                 orient: 文(p.orientation || "portrait"),
                 margin: { t: (p.margins || {}).top || 20, r: (p.margins || {}).right || 18,
                           b: (p.margins || {}).bottom || 20, l: (p.margins || {}).left || 18 },
                 header: "", footer: "", pageNumber: !!p.pageNumber };
    }
    var 出す = function (b) { c.blocks.push(b); };

    配(dt.regions).forEach(function (rg) {
      if (rg.label && rg.showLabel !== false)
        出す({ id: VQW.ir.wpId("b"), type: 文(rg.headingType) || "heading2",
               text: 文(rg.label), region: 文(rg.id) });

      配(rg.fields).forEach(function (key) {
        var f = 欄を引く(dt, key);
        if (!f) return;
        if (f.fillPolicy === "user_input") {
          出す({ id: VQW.ir.wpId("b"), type: "field", text: "",
                 key: f.key, label: f.label, dataType: f.dataType,
                 hint: f.hint || ("ここに " + f.label + " を書いてください"),
                 region: 文(rg.id) });
          return;
        }
        var v = 値 && 値.fields ? 値.fields[key] : "";
        if (Array.isArray(v)) {
          v.forEach(function (x) {
            出す({ id: VQW.ir.wpId("b"), type: 文(rg.itemType) || "bullet",
                   text: 文(x), key: f.key, region: 文(rg.id) });
          });
        } else if (文(v)) {
          出す({ id: VQW.ir.wpId("b"), type: 文(rg.itemType) || "paragraph",
                 text: 文(v), key: f.key, region: 文(rg.id) });
        }
      });

      if (rg.kind === "answer") {
        出す({ id: VQW.ir.wpId("b"), type: "answerSpace", text: "",
               lines: Number(rg.lines) || 3, label: 文(rg.label), region: 文(rg.id) });
      }
      if (rg.kind === "divider") 出す({ id: VQW.ir.wpId("b"), type: "divider", text: "" });
    });

    if (!c.blocks.length) c.blocks.push({ id: VQW.ir.wpId("b"), type: "paragraph", text: "" });
    return c;
  }

  /* Sheets: regions の at（A1）から 順に置く。式は calculations から。 */
  function sheets組み立て(dt, 値) {
    var c = 空の中身("sheets");
    var sh = c.sheets[0];
    var F = VQW.validate.formula;

    配(dt.regions).forEach(function (rg) {
      var at = 文(rg.at || "A1").toUpperCase().match(/^([A-Z]+)(\d+)$/);
      if (!at) return;
      var c0 = F.列番(at[1]), r0 = +at[2];
      配(rg.fields).forEach(function (key, i) {
        var f = 欄を引く(dt, key);
        if (!f) return;
        var 縦 = rg.direction !== "row";
        var 見出し = F.列名(c0) + (r0 + (縦 ? i : 0));
        var 値の所 = F.列名(c0 + (縦 ? 1 : i)) + (r0 + (縦 ? i : 1));
        sh.cells[見出し] = { v: f.label };
        if (f.fillPolicy === "user_input") {
          sh.cells[値の所] = { v: "", h: f.hint || ("ここに " + f.label + " を入れます") };
        } else if (f.fillPolicy === "llm_allowed") {
          var v = 値 && 値.fields ? 値.fields[key] : "";
          if (文(v)) sh.cells[値の所] = { v: 文(v) };
        }
        if (f.dataType && sh.cells[値の所]) sh.cells[値の所].t = f.dataType;
      });
    });

    配(dt.calculations).forEach(function (cl) {
      var ref = 文(cl.target || cl.key).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref)) return;
      var f = 文(cl.formula);
      if (f && f.charAt(0) !== "=") f = "=" + f;
      sh.cells[ref] = { f: f };
      if (cl.label) {
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        var 左 = F.列番(m[1]) - 1;
        if (左 >= 0) sh.cells[F.列名(左) + m[2]] = { v: 文(cl.label) };
      }
    });
    return c;
  }

  /* ══ 通し ═════════════════════════════════════════════════════
     o = { kind, 頼み, docTypeName, 聞く(prompt)->Promise<JSON> } */
  function generate(o) {
    o = o || {};
    var kind = 文(o.kind) || "docs";
    return Promise.resolve(VQW.doctype.registry.load()).then(function () {
      var 見 = VQW.doctype.fallback.探す(文(o.docTypeName || o.頼み), kind);
      if (見.match === "none" || !見.docType) {
        return { 状態: "書式なし", match: "none",
                 ことわり: 見.画面に出す, つぎ: 見.つぎ,
                 完成と言ってよい: false };
      }
      var dt = 見.docType;
      var p = プロンプト(dt, o.頼み, o);
      var 聞く = typeof o.聞く === "function" ? o.聞く : function () { return Promise.resolve({ fields: {} }); };
      return Promise.resolve(聞く(p)).then(function (値) {
        /* ★ **user_input の欄に LLM が値を入れてきたら 捨てる。** */
        var 捨てた = [];
        if (値 && 値.fields) {
          VQW.doctype.schema.人が入れる欄(dt).forEach(function (f) {
            if (文(値.fields[f.key])) { 捨てた.push(f.key); delete 値.fields[f.key]; }
          });
        }
        var content = kind === "sheets" ? sheets組み立て(dt, 値) : docs組み立て(dt, 値, o);
        content.__work = { version: 1, locks: [], docType: dt.id, docTypeMatch: 見.match };

        var 直 = VQW.pipeline.repair(kind, content, { docType: dt });
        var 検 = VQW.validate.run(kind, content, { docType: dt });
        var rep = {
          status: 検.errors.length ? "partial" : "applied",
          version: { from: 0, to: 1 },
          applied: [{ nodeId: "root", path: dt.displayName, before: "", after: "作りました" }],
          skipped: [], validation: 検,
          ことわり: VQW.doctype.fallback.ことわり(見)
        };
        var 出 = VQW.report.道具の返り(rep, o);
        出.content = content;
        出.docType = dt.id;
        出.match = 見.match;
        出.直した = 直.直した.length;
        if (捨てた.length) {
          出.入れなかった欄 = 捨てた;
          出.なぜ入れなかったか = "この欄は 人が自分で書く所です。"
            + "こちらで それらしい値を作ると そのまま提出されるので、空欄にしました。";
        }
        return 出;
      });
    });
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.generate = generate;
  VQW.pipeline.プロンプト = プロンプト;
  VQW.pipeline.docs組み立て = docs組み立て;
  VQW.pipeline.sheets組み立て = sheets組み立て;
  VQW.pipeline.空の中身 = 空の中身;
})(typeof globalThis !== "undefined" ? globalThis : this);
