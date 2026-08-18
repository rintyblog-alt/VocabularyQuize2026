/* ══════════════════════════════════════════════════════════════════════
   core/doctype/extract.js — 手持ちの様式から 書式を起こす

   ★ いちばん値打ちがある道（§6.5）。「うちの請求書と同じ形式で」に
     そのまま答えられる。著作権の心配も無い（本人の書類）。
   ★ いまの取り込み（__vqChatFiles）は **本文の文字しか取らない**。
     xlsx / pptx は そもそも弾いている。ここでは **構造**を読む。
     ZIP を開く所は 取り込み側と 同じやりかた（DecompressionStream）。
   ★ 取り出すのは 「必須項目の並び」と「領域の構成」という **事実**だけ。
     見た目（色・書体・罫線）は 写さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── ZIP（最小限。取り込み側と同じ DecompressionStream を使う）── */
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }

  function 目次(buf) {
    var d = new Uint8Array(buf), n = d.length, i = n - 22;
    for (; i >= 0; i--) if (u32(d, i) === 0x06054b50) break;
    if (i < 0) throw new Error("ZIP_BROKEN");
    var 件数 = u16(d, i + 10), 始 = u32(d, i + 16), p = 始, 出 = [];
    for (var k = 0; k < 件数 && p + 46 <= n; k++) {
      if (u32(d, p) !== 0x02014b50) break;
      var 方式 = u16(d, p + 10), 圧 = u32(d, p + 20), 生 = u32(d, p + 24);
      var nl = u16(d, p + 28), el = u16(d, p + 30), cl = u16(d, p + 32);
      var lo = u32(d, p + 42);
      var 名 = new TextDecoder("utf-8").decode(d.subarray(p + 46, p + 46 + nl));
      出.push({ name: 名, 方式: 方式, 圧: 圧, 生: 生, lo: lo });
      p += 46 + nl + el + cl;
    }
    return 出;
  }

  function 取り出す(buf, e) {
    var d = new Uint8Array(buf);
    if (u32(d, e.lo) !== 0x04034b50) throw new Error("ZIP_BROKEN");
    var nl = u16(d, e.lo + 26), el = u16(d, e.lo + 28);
    var 始 = e.lo + 30 + nl + el;
    var 生 = d.subarray(始, 始 + e.圧);
    if (e.方式 === 0) return Promise.resolve(new TextDecoder("utf-8").decode(生));
    if (e.方式 !== 8) return Promise.reject(new Error("ZIP_METHOD_UNSUPPORTED"));
    if (typeof root.DecompressionStream !== "function") return Promise.reject(new Error("NO_INFLATE"));
    var s = new Blob([生]).stream().pipeThrough(new root.DecompressionStream("deflate-raw"));
    return new Response(s).arrayBuffer().then(function (a) {
      return new TextDecoder("utf-8").decode(new Uint8Array(a));
    });
  }

  function 探す(並, 名) {
    for (var i = 0; i < 並.length; i++) if (並[i].name === 名) return 並[i];
    return null;
  }

  /* ══ xlsx の 構造 ═══════════════════════════════════════════ */
  function xlsx(buf, o) {
    o = o || {};
    var 並;
    try { 並 = 目次(buf); } catch (e) { return Promise.reject(e); }
    var ss = 探す(並, "xl/sharedStrings.xml");
    var sheet = 探す(並, "xl/worksheets/sheet1.xml");
    if (!sheet) return Promise.reject(new Error("XLSX_NO_SHEET"));
    return Promise.resolve(ss ? 取り出す(buf, ss) : "")
      .then(function (sxml) {
        var 共有 = (sxml.match(/<si[\s>][\s\S]*?<\/si>/g) || []).map(function (si) {
          return (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
            .map(function (t) { return t.replace(/<[^>]+>/g, ""); }).join("");
        }).map(解く);
        return 取り出す(buf, sheet).then(function (xml) { return よむ(xml, 共有, o); });
      });
  }

  function 解く(s) {
    return 文(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  }

  function よむ(xml, 共有, o) {
    var マス = {};
    var re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>|<c r="([A-Z]+\d+)"([^>]*)\/>/g, m;
    while ((m = re.exec(xml)) !== null) {
      var ref = m[1] || m[4], 属 = m[2] || m[5] || "", 中 = m[3] || "";
      var 型 = (属.match(/t="([^"]+)"/) || [])[1] || "n";
      var f = (中.match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
      var v = (中.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];
      var t = (中.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      var 値 = "";
      if (型 === "s" && v !== undefined) 値 = 共有[+v] || "";
      else if (型 === "inlineStr") 値 = 解く(t || "");
      else 値 = 解く(v || "");
      if (f || 文(値)) マス[ref] = { v: 文(値), f: f ? "=" + 解く(f) : undefined };
    }
    return 形にする(マス, o);
  }

  /* ══ マスの並び → DocType の たね ═══════════════════════════
     ・**値が入っている所**は「人が入れる欄」（その人の実データなので 写さない）
     ・**式が入っている所**は「計算で出す欄」（式は そのまま覚える）
     ・見出しらしい所（値の左か上にある文字）は 欄の名前 */
  function 形にする(マス, o) {
    o = o || {};
    var F = VQW.validate.formula;
    var 欄 = [], 計算 = [], 見た = {};

    function 割(ref) {
      var m = ref.match(/^([A-Z]+)(\d+)$/);
      return m ? { c: F.列番(m[1]), r: +m[2] } : null;
    }
    function 名前(ref) {
      var p = 割(ref); if (!p) return "";
      var 左 = p.c > 1 ? F.列名(p.c - 1) + p.r : null;
      var 上 = p.r > 1 ? F.列名(p.c) + (p.r - 1) : null;
      var 候 = [左, 上].filter(Boolean);
      for (var i = 0; i < 候.length; i++) {
        var c = マス[候[i]];
        if (c && !c.f && 文(c.v) && !/^-?[\d,.]+$/.test(文(c.v))) return 文(c.v).replace(/[：:]\s*$/, "");
      }
      return "";
    }

    Object.keys(マス).forEach(function (ref) {
      var c = マス[ref];
      if (c.f) 計算.push({ target: ref, formula: c.f, label: 名前(ref) });
    });

    /* ★ 「見出し」と「値」を 取り違えないための 2 段構え。
       1 段目で 行の いちばん左を 見出しとみなし、その右（または下）を
       **値のマス**として 使い済みにする。使い済みを 見出しにしない。
       これをやらないと、値そのもの（「株式会社ほんもの」）が
       欄の名前として 書式に 焼き付く（実測で 落ちた）。 */
    var 使い済み = Object.create(null);
    var 行ごと = {};
    Object.keys(マス).forEach(function (ref) {
      var p = 割(ref); if (!p) return;
      (行ごと[p.r] = 行ごと[p.r] || []).push({ ref: ref, c: p.c });
    });
    var 行番 = Object.keys(行ごと).map(Number).sort(function (a, b) { return a - b; });

    行番.forEach(function (r) {
      var 並び = 行ごと[r].sort(function (a, b) { return a.c - b.c; });
      var 左 = 並び[0];
      if (!左) return;
      var c = マス[左.ref];
      if (!c || c.f) return;
      var v = 文(c.v).trim();
      if (!v || 使い済み[左.ref]) return;
      if (/^-?[\d,.]+$/.test(v)) return;                 /* 値そのもの */

      var p = 割(左.ref);
      var 右ref = F.列名(p.c + 1) + p.r, 下ref = F.列名(p.c) + (p.r + 1);
      var 右 = マス[右ref], 下 = マス[下ref];

      /* 表の見出し行は 欄にしない。
         見分けかた: **その行に 3 つ以上** 中身があり、**すぐ下の行にも 3 つ以上**ある。
         「宛名 / 株式会社◯◯」のような 2 つ組は 見出し行ではない
         （ここを 2 つで切ると 宛名も 拾えなくなる。実測で 落ちた）。 */
      var この行 = 並び.length;
      var 下の行 = (行ごと[p.r + 1] || []).length;
      if (この行 >= 3 && 下の行 >= 3) return;

      var 値のref = (右 && (右.f || 文(右.v))) ? 右ref
                  : (下 && (下.f || 文(下.v))) ? 下ref : null;
      if (!値のref) return;
      使い済み[値のref] = 1;

      var key = v.replace(/[：:\s]/g, "").slice(0, 24);
      if (!key || 見た[key]) return;
      見た[key] = 1;
      var 値のマス = マス[値のref];
      欄.push({
        key: key, label: v.replace(/[：:]\s*$/, ""),
        dataType: 型を見る(値のマス && !値のマス.f ? 値のマス.v : ""),
        /* ★ **人の実データは 写さない。**空欄＋ヒントにする。 */
        fillPolicy: "user_input",
        hint: v.replace(/[：:]\s*$/, "") + " を入れる所です",
        at: 左.ref
      });
    });

    return VQW.doctype.schema.そろえる({
      id: 文(o.id) || "user_" + VQW.ir.wpId("dt"),
      kind: "sheets",
      displayName: 文(o.displayName) || "取り込んだ様式",
      aliases: o.aliases || [],
      parent: null,
      requiredFields: 欄,
      optionalFields: [],
      regions: [{ id: "body", label: "", showLabel: false,
                  fields: 欄.map(function (f) { return f.key; }), at: "A1" }],
      calculations: 計算,
      validations: [],
      source: { kind: "user_upload", ref: 文(o.ファイル名), checkedAt: 今日() },
      status: "draft"                      /* ★ 人が見て 承認するまで draft */
    });
  }

  function 型を見る(v) {
    var s = 文(v).trim();
    if (/^-?[\d,]+(\.\d+)?$/.test(s)) return "number";
    if (/^-?[\d,]+(\.\d+)?\s*[%％]$/.test(s)) return "percent";
    if (/^\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/.test(s)) return "date";
    if (/^[¥￥$]|円$/.test(s)) return "money";
    return "text";
  }
  function 今日() {
    try { return new Date().toISOString().slice(0, 10); } catch (e) { return ""; }
  }

  /* ══ docx の 構造（見出しの並びだけ）═══════════════════════ */
  function docx(buf, o) {
    o = o || {};
    var 並;
    try { 並 = 目次(buf); } catch (e) { return Promise.reject(e); }
    var t = 探す(並, "word/document.xml");
    if (!t) return Promise.reject(new Error("DOCX_NO_BODY"));
    return 取り出す(buf, t).then(function (xml) {
      var 段 = xml.split(/<w:p[ >]/).slice(1);
      var 欄 = [], 領域 = [], 見た = {};
      段.forEach(function (seg) {
        var 見出し = /w:val="Heading(\d)"/.test(seg);
        var txt = 解く((seg.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
          .map(function (m) { return m.replace(/<[^>]+>/g, ""); }).join(""));
        if (!txt.trim()) return;
        if (見出し) {
          領域.push({ id: "r" + (領域.length + 1), label: txt, fields: [] });
          return;
        }
        /* 「氏名：______」のような 記入欄の形 */
        var m2 = txt.match(/^(.{1,16}?)\s*[：:]\s*[_＿\s]{2,}$/);
        if (m2) {
          var key = m2[1].replace(/\s/g, "");
          if (見た[key]) return;
          見た[key] = 1;
          欄.push({ key: key, label: m2[1], dataType: "text",
                    fillPolicy: "user_input", hint: m2[1] + " を書く所です" });
          if (領域.length) 領域[領域.length - 1].fields.push(key);
        }
      });
      return VQW.doctype.schema.そろえる({
        id: 文(o.id) || "user_" + VQW.ir.wpId("dt"),
        kind: "docs",
        displayName: 文(o.displayName) || "取り込んだ様式",
        requiredFields: 欄, optionalFields: [],
        regions: 領域.length ? 領域 : [{ id: "body", label: "", showLabel: false, fields: [] }],
        calculations: [], validations: [],
        source: { kind: "user_upload", ref: 文(o.ファイル名), checkedAt: 今日() },
        status: "draft"
      });
    });
  }

  function 取り込む(file, o) {
    o = o || {};
    var 名 = 文(file && file.name).toLowerCase();
    var 拡 = (名.match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (["xlsx", "xlsm", "docx"].indexOf(拡) < 0)
      return Promise.reject(new Error("この形式からは 様式を 起こせません（" + (拡 || "不明") + "）"));
    return file.arrayBuffer().then(function (buf) {
      var opt = { ファイル名: file.name, displayName: o.displayName || file.name.replace(/\.[^.]+$/, ""),
                  id: o.id, aliases: o.aliases };
      return 拡 === "docx" ? docx(buf, opt) : xlsx(buf, opt);
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.extract = { 取り込む: 取り込む, xlsx: xlsx, docx: docx,
                          目次: 目次, 形にする: 形にする, 型を見る: 型を見る };
})(typeof globalThis !== "undefined" ? globalThis : this);
