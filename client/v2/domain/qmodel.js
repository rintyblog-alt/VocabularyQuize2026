/* ══════════════════════════════════════════════════════════════════════
   共通問題モデル V3（§6 / §7 / §22）
   ・既存の V2 Question を **壊さずに広げる**。
     top-level の prompt / choices / points / difficulty / correctAnswer などは
     そのまま残す。だから validate.js・grading.js・score-allocator・
     mock-builder・adapter は書き換えなしで動き続ける。
   ・新しい構造（分類・表・座標・ラベル・誤り訂正・複合大問・RichContent）は
     追加のフィールドとして載せる。
   ・保存データから任意の HTML や script を実行させない。
     RichContent は決められた節点しか持てず、書き出しは必ず escape を通る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  var Q = VQ2.qtypes;
  if (!S) throw new Error("VQ2.schema must be loaded before qmodel.js");
  if (!Q) throw new Error("VQ2.qtypes must be loaded before qmodel.js");

  var MODEL_VERSION = 3;

  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function num(v, d) { return isNum(v) ? v : (isNum(d) ? d : null); }
  var uid = (function () {
    var n = 0;
    return function (p) { n++; return (p || "x") + "_" + n.toString(36) + Math.random().toString(36).slice(2, 6); };
  })();

  /* ══════════════════════════════════════════════════════════════════
     1) RichContent — 安全な構造化本文
     ・節点の種類はここにあるものだけ。知らない種類は捨てる。
     ・HTML はここでしか作らない。値は必ず escape する。
     ══════════════════════════════════════════════════════════════════ */
  var BLOCK_TYPES = ["p", "h", "ul", "ol", "quote", "code", "formula", "table",
                     "image", "audio", "pageRef", "note", "br"];

  function escHtml(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* URL の安全確認。javascript: や data:text/html は通さない。 */
  function safeSrc(src, kind) {
    var s = str(src).trim();
    if (!s) return "";
    var lower = s.toLowerCase();
    if (/^javascript:/.test(lower) || /^vbscript:/.test(lower)) return "";
    if (/^data:/.test(lower)) {
      var okPrefix = kind === "audio" ? "data:audio/"
                   : kind === "video" ? "data:video/"
                   : "data:image/";
      return lower.indexOf(okPrefix) === 0 ? s : "";
    }
    if (/^blob:/.test(lower)) return s;
    if (/^https?:\/\//.test(lower)) return s;
    if (/^[./]/.test(s) || /^[a-z0-9_-]+\//i.test(s)) return s;   /* 相対パス */
    return "";
  }

  function mkRun(o) {
    if (isStr(o)) return { text: o };
    if (!isObj(o)) return { text: "" };
    var r = { text: str(o.text) };
    ["b", "u", "i", "sup", "sub", "code"].forEach(function (k) { if (o[k]) r[k] = true; });
    if (o.ruby) r.ruby = str(o.ruby).slice(0, 40);
    return r;
  }
  function runs(v) {
    if (v == null) return [];
    if (isStr(v)) return v ? [{ text: v }] : [];
    return arr(v).map(mkRun).filter(function (r) { return r.text !== "" || r.ruby; });
  }
  function runsPlain(rs) { return arr(rs).map(function (r) { return str(r.text); }).join(""); }

  function normalizeBlock(b) {
    if (isStr(b)) return { t: "p", runs: runs(b) };
    if (!isObj(b)) return null;
    var t = str(b.t || b.type);
    if (BLOCK_TYPES.indexOf(t) < 0) return null;
    switch (t) {
      case "p":     return { t: "p", runs: runs(b.runs != null ? b.runs : b.text) };
      case "note":  return { t: "note", runs: runs(b.runs != null ? b.runs : b.text) };
      case "quote": return { t: "quote", runs: runs(b.runs != null ? b.runs : b.text) };
      case "h":     return { t: "h", level: Math.min(4, Math.max(2, num(b.level, 3))), runs: runs(b.runs != null ? b.runs : b.text) };
      case "ul":
      case "ol":    return { t: t, items: arr(b.items).map(runs).filter(function (x) { return x.length; }) };
      case "code":  return { t: "code", lang: str(b.lang).slice(0, 24), text: str(b.text).slice(0, 8000) };
      case "formula": return { t: "formula", text: str(b.text).slice(0, 2000) };
      case "br":    return { t: "br" };
      case "table": return {
        t: "table",
        head: arr(b.head).map(runs),
        rows: arr(b.rows).map(function (r) { return arr(r).map(runs); }).slice(0, 200)
      };
      case "image": {
        var src = safeSrc(b.src, "image");
        if (!src) return null;
        return { t: "image", src: src, alt: str(b.alt).slice(0, 300),
                 width: num(b.width, null), height: num(b.height, null) };
      }
      case "audio": {
        var asrc = safeSrc(b.src, "audio");
        if (!asrc) return null;
        return { t: "audio", src: asrc, label: str(b.label).slice(0, 200) };
      }
      case "pageRef": return { t: "pageRef", sourceId: str(b.sourceId).slice(0, 120),
                               page: num(b.page, null), label: str(b.label).slice(0, 200) };
    }
    return null;
  }

  /* 軽い記法 → RichContent。
     **太字** __下線__ ^上付き^ ~下付き~ `コード` 行頭 - / 1. で箇条書き、> で引用。
     利用者が打った記号を、そのまま HTML として実行しない。 */
  function parseInline(line) {
    var out = [], i = 0, buf = "", marks = {};
    function push() { if (buf) { out.push(mkRun(Object.assign({ text: buf }, marks))); buf = ""; } }
    while (i < line.length) {
      var two = line.substr(i, 2);
      if (two === "**") { push(); marks.b = !marks.b; if (!marks.b) delete marks.b; i += 2; continue; }
      if (two === "__") { push(); marks.u = !marks.u; if (!marks.u) delete marks.u; i += 2; continue; }
      var one = line.charAt(i);
      if (one === "^") { push(); marks.sup = !marks.sup; if (!marks.sup) delete marks.sup; i += 1; continue; }
      if (one === "~") { push(); marks.sub = !marks.sub; if (!marks.sub) delete marks.sub; i += 1; continue; }
      if (one === "`") { push(); marks.code = !marks.code; if (!marks.code) delete marks.code; i += 1; continue; }
      buf += one; i++;
    }
    push();
    return out.length ? out : (line ? [{ text: line }] : []);
  }

  function fromText(text) {
    var s = str(text);
    if (!s) return { blocks: [], plain: "" };
    var lines = s.replace(/\r\n?/g, "\n").split("\n");
    var blocks = [], listBuf = null, listType = null;
    function flushList() {
      if (listBuf && listBuf.length) blocks.push({ t: listType, items: listBuf });
      listBuf = null; listType = null;
    }
    lines.forEach(function (raw) {
      var line = raw;
      var mUl = line.match(/^\s*[-・*]\s+(.*)$/);
      var mOl = line.match(/^\s*\d+[.)]\s+(.*)$/);
      var mQ = line.match(/^\s*>\s?(.*)$/);
      if (mUl) { if (listType !== "ul") flushList(); listType = "ul"; listBuf = listBuf || []; listBuf.push(parseInline(mUl[1])); return; }
      if (mOl) { if (listType !== "ol") flushList(); listType = "ol"; listBuf = listBuf || []; listBuf.push(parseInline(mOl[1])); return; }
      flushList();
      if (mQ) { blocks.push({ t: "quote", runs: parseInline(mQ[1]) }); return; }
      if (!line.trim()) { blocks.push({ t: "br" }); return; }
      blocks.push({ t: "p", runs: parseInline(line) });
    });
    flushList();
    /* 末尾の空行は落とす */
    while (blocks.length && blocks[blocks.length - 1].t === "br") blocks.pop();
    return { blocks: blocks, plain: s };
  }

  function toPlain(rc) {
    if (rc == null) return "";
    if (isStr(rc)) return rc;
    if (!isObj(rc)) return "";
    if (isStr(rc.plain) && rc.plain) return rc.plain;
    return arr(rc.blocks).map(function (b) {
      switch (b.t) {
        case "ul": case "ol": return arr(b.items).map(function (it) { return "・" + runsPlain(it); }).join("\n");
        case "code": case "formula": return str(b.text);
        case "image": return b.alt ? "［図：" + b.alt + "］" : "［図］";
        case "audio": return "［音声］";
        case "pageRef": return "［" + (b.label || ("p." + b.page)) + "］";
        case "br": return "";
        case "table": return arr(b.rows).map(function (r) {
          return arr(r).map(runsPlain).join(" / ");
        }).join("\n");
        default: return runsPlain(b.runs);
      }
    }).filter(function (x) { return x !== ""; }).join("\n");
  }

  function coerceRich(v) {
    if (v == null) return null;
    if (isStr(v)) return v ? fromText(v) : null;
    if (!isObj(v)) return null;
    var blocks = arr(v.blocks).map(normalizeBlock).filter(Boolean);
    if (!blocks.length) return null;
    var rc = { blocks: blocks };
    rc.plain = isStr(v.plain) && v.plain ? v.plain : toPlain({ blocks: blocks });
    return rc;
  }

  function runsHtml(rs) {
    return arr(rs).map(function (r) {
      var t = escHtml(r.text);
      if (r.code) t = "<code>" + t + "</code>";
      if (r.sup) t = "<sup>" + t + "</sup>";
      if (r.sub) t = "<sub>" + t + "</sub>";
      if (r.b) t = "<strong>" + t + "</strong>";
      if (r.u) t = "<u>" + t + "</u>";
      if (r.i) t = "<em>" + t + "</em>";
      if (r.ruby) t = "<ruby>" + t + "<rt>" + escHtml(r.ruby) + "</rt></ruby>";
      return t;
    }).join("");
  }

  /* RichContent → HTML。ここが唯一の書き出し口。 */
  function toHtml(rc, opts) {
    opts = opts || {};
    var v = coerceRich(rc);
    if (!v) return "";
    var cls = opts.className ? ' class="' + escHtml(opts.className) + '"' : "";
    var h = arr(v.blocks).map(function (b) {
      switch (b.t) {
        case "p":     return "<p>" + runsHtml(b.runs) + "</p>";
        case "note":  return '<p class="vq2-rc-note">' + runsHtml(b.runs) + "</p>";
        case "quote": return "<blockquote>" + runsHtml(b.runs) + "</blockquote>";
        case "h":     return "<h" + b.level + ">" + runsHtml(b.runs) + "</h" + b.level + ">";
        case "ul": case "ol":
          return "<" + b.t + ">" + arr(b.items).map(function (it) { return "<li>" + runsHtml(it) + "</li>"; }).join("") + "</" + b.t + ">";
        case "code":  return '<pre class="vq2-rc-code"><code>' + escHtml(b.text) + "</code></pre>";
        case "formula": return '<div class="vq2-rc-formula">' + escHtml(b.text) + "</div>";
        case "br":    return '<div class="vq2-rc-br"></div>';
        case "image": return '<img class="vq2-rc-img" src="' + escHtml(b.src) + '" alt="' + escHtml(b.alt) + '" loading="lazy">';
        case "audio": return '<audio class="vq2-rc-audio" controls preload="none" src="' + escHtml(b.src) + '"></audio>';
        case "pageRef": return '<span class="vq2-rc-ref">' + escHtml(b.label || ("p." + b.page)) + "</span>";
        case "table":
          return '<div class="vq2-rc-tw"><table class="vq2-rc-table">'
            + (arr(b.head).length ? "<thead><tr>" + b.head.map(function (c) { return '<th scope="col">' + runsHtml(c) + "</th>"; }).join("") + "</tr></thead>" : "")
            + "<tbody>" + arr(b.rows).map(function (r) {
                return "<tr>" + arr(r).map(function (c) { return "<td>" + runsHtml(c) + "</td>"; }).join("") + "</tr>";
              }).join("") + "</tbody></table></div>";
      }
      return "";
    }).join("");
    return '<div' + cls + ">" + h + "</div>";
  }

  var RC = {
    BLOCK_TYPES: BLOCK_TYPES,
    fromText: fromText, toHtml: toHtml, toPlain: toPlain, coerce: coerceRich,
    escHtml: escHtml, safeSrc: safeSrc, runsHtml: runsHtml, normalizeBlock: normalizeBlock
  };

  /* ══════════════════════════════════════════════════════════════════
     2) メディア参照
     ══════════════════════════════════════════════════════════════════ */
  var MEDIA_KINDS = ["image", "audio", "video", "documentPage", "diagram", "asset"];
  function normalizeMedia(m, i) {
    if (!isObj(m)) return null;
    var kind = MEDIA_KINDS.indexOf(str(m.kind)) >= 0 ? str(m.kind) : "image";
    var out = {
      id: str(m.id) || ("m" + (i + 1)),
      kind: kind,
      name: str(m.name).slice(0, 200),
      alt: str(m.alt).slice(0, 300)
    };
    if (kind === "diagram") { out.data = clone(m.data) || null; return out; }
    var src = safeSrc(m.src, kind === "audio" ? "audio" : kind === "video" ? "video" : "image");
    if (!src) return null;
    out.src = src;
    if (isNum(m.page)) out.page = m.page;
    if (isNum(m.duration)) out.duration = m.duration;
    if (m.sourceId) out.sourceId = str(m.sourceId).slice(0, 120);
    return out;
  }
  function normalizeMediaList(v) {
    return arr(v).map(normalizeMedia).filter(Boolean);
  }
  function firstMedia(q, kind) {
    var list = arr(q && q.media);
    for (var i = 0; i < list.length; i++) if (list[i].kind === kind) return list[i];
    return null;
  }

  /* ── 読み上げ（音声問題の中身）─────────────────────────────────
     **原稿（script）が本体で、音声ファイルは作り方の一つ**。
     こうしておくと、
       ・AI は原稿だけ書けばよい（架空の音声 URL を作らない）
       ・配られた側の端末に Bridge が無くても、端末の読み上げで解ける
       ・声を変えても問題を作り直さなくてよい
     声と速さは、無ければプリセットの設定を使うので、ここでは持たせない。 */
  var MAX_SCRIPT = 2000;
  function normalizeAudioScript(src, q) {
    var a = isObj(src.audio) ? src.audio : {};
    q.script = str(src.script || a.script || "").slice(0, MAX_SCRIPT);
    var v = str(src.voice || a.voice || "").slice(0, 60);
    if (v) q.voice = v; else delete q.voice;
    var sp = src.speed !== undefined && src.speed !== null ? src.speed : a.speed;
    if (isNum(Number(sp)) && Number(sp) > 0) q.speed = Math.max(0.5, Math.min(2, Number(sp)));
    else delete q.speed;
    /* 入れ子の audio は畳んだので残さない（二重の持ち方を作らない） */
    delete q.audio;
  }
  /* 音の出どころがあるか。**原稿があれば足りる**（鳴らすときに作れる）。 */
  function hasAudioSource(q) {
    return !!(firstMedia(q, "audio") || str(q && q.script).trim()
              || arr(q && q.choices).some(function (c) { return c && c.audio; }));
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 形式ごとの構造の正規化
     ・足りないものは「空のまま」にする。勝手に正解を作らない（§22）。
     ══════════════════════════════════════════════════════════════════ */

  function normalizeChoices(v, engine) {
    var list = arr(v).map(function (c, i) {
      if (isStr(c)) c = { text: c };
      if (!isObj(c)) return null;
      var out = {
        id: str(c.id) || ("c" + (i + 1)),
        label: str(c.label) || String.fromCharCode(65 + i),
        text: str(c.text),
        explanation: str(c.explanation),
        isCorrect: c.isCorrect === true
      };
      if (isNum(c.order)) out.order = c.order;
      var img = c.image || c.imageSrc;
      if (img) {
        var src = safeSrc(img, "image");
        if (src) out.image = src;
      }
      if (c.audio) {
        var asrc = safeSrc(c.audio, "audio");
        if (asrc) out.audio = asrc;
      }
      if (c.isNone === true) out.isNone = true;
      return out;
    }).filter(Boolean);
    /* 単一選択で正解が 2 つ以上あっても、勝手に消さない。検証で error にする。 */
    return list;
  }

  function normalizeBlanks(v) {
    return arr(v).map(function (b, i) {
      if (isStr(b)) b = { answer: b };
      if (!isObj(b)) return null;
      var out = {
        id: str(b.id) || ("b" + (i + 1)),
        label: str(b.label) || String(i + 1),
        answer: str(b.answer),
        acceptedAnswers: arr(b.acceptedAnswers).map(str).filter(Boolean),
        points: num(b.points, null)
      };
      if (arr(b.options).length) out.options = arr(b.options).map(function (o, j) {
        if (isStr(o)) return { id: "o" + (j + 1), text: o };
        return { id: str(o.id) || ("o" + (j + 1)), text: str(o.text) };
      });
      if (isNum(b.position)) out.position = b.position;
      return out;
    }).filter(Boolean);
  }

  function normalizeOrderItems(v) {
    return arr(v).map(function (it, i) {
      if (isStr(it)) it = { text: it };
      if (!isObj(it)) return null;
      var out = {
        id: str(it.id) || ("i" + (i + 1)),
        text: str(it.text),
        fixed: it.fixed === true
      };
      if (it.image) { var s = safeSrc(it.image, "image"); if (s) out.image = s; }
      if (it.audio) { var a = safeSrc(it.audio, "audio"); if (a) out.audio = a; }
      if (isNum(it.order)) out.order = it.order;
      return out;
    }).filter(Boolean);
  }

  function normalizePairs(v) {
    if (!isObj(v)) return null;
    var left = arr(v.left).map(function (l, i) {
      if (isStr(l)) l = { text: l };
      var o = { id: str(l.id) || ("L" + (i + 1)), text: str(l.text) };
      if (l.image) { var s = safeSrc(l.image, "image"); if (s) o.image = s; }
      if (l.audio) { var a = safeSrc(l.audio, "audio"); if (a) o.audio = a; }
      return o;
    });
    var right = arr(v.right).map(function (r, i) {
      if (isStr(r)) r = { text: r };
      var o = { id: str(r.id) || ("R" + (i + 1)), text: str(r.text), isDummy: r.isDummy === true };
      if (r.image) { var s = safeSrc(r.image, "image"); if (s) o.image = s; }
      return o;
    });
    var correct = {};
    if (isObj(v.correct)) Object.keys(v.correct).forEach(function (k) { correct[k] = str(v.correct[k]); });
    return { left: left, right: right, correct: correct };
  }

  function normalizeClassification(v) {
    if (!isObj(v)) return null;
    var groups = arr(v.groups).map(function (g, i) {
      if (isStr(g)) g = { label: g };
      return { id: str(g.id) || ("g" + (i + 1)), label: str(g.label),
               isExclude: g.isExclude === true };
    });
    var items = arr(v.items).map(function (it, i) {
      if (isStr(it)) it = { text: it };
      var o = { id: str(it.id) || ("t" + (i + 1)), text: str(it.text), groupId: str(it.groupId) };
      if (it.image) { var s = safeSrc(it.image, "image"); if (s) o.image = s; }
      return o;
    });
    return { groups: groups, items: items };
  }

  function normalizeTable(v) {
    if (!isObj(v)) return null;
    var columns = arr(v.columns).map(function (c, i) {
      if (isStr(c)) c = { text: c };
      return { id: str(c.id) || ("col" + (i + 1)), text: str(c.text), width: num(c.width, null) };
    });
    var rows = arr(v.rows).map(function (row, ri) {
      var cells = arr(row.cells != null ? row.cells : row).map(function (c, ci) {
        if (isStr(c)) c = { text: c };
        if (!isObj(c)) c = {};
        var cell = {
          id: str(c.id) || ("r" + (ri + 1) + "c" + (ci + 1)),
          text: str(c.text),
          editable: c.editable === true,
          answer: str(c.answer),
          acceptedAnswers: arr(c.acceptedAnswers).map(str).filter(Boolean),
          points: num(c.points, null)
        };
        if (arr(c.options).length) cell.options = arr(c.options).map(function (o, j) {
          if (isStr(o)) return { id: "o" + (j + 1), text: o };
          return { id: str(o.id) || ("o" + (j + 1)), text: str(o.text) };
        });
        return cell;
      });
      return { id: str(row.id) || ("r" + (ri + 1)), header: str(row.header), cells: cells };
    });
    return { columns: columns, rows: rows, caption: str(v.caption).slice(0, 300) };
  }

  /* 座標は 0〜1 の正規化座標だけを持つ。画像の実寸に依存させない。 */
  function normalizeHotspots(v) {
    return arr(v).map(function (h, i) {
      if (!isObj(h)) return null;
      var shape = ["rect", "circle", "poly"].indexOf(str(h.shape)) >= 0 ? str(h.shape) : "circle";
      var out = {
        id: str(h.id) || ("h" + (i + 1)),
        shape: shape,
        label: str(h.label).slice(0, 200),
        tolerance: num(h.tolerance, 0.05),
        isCorrect: h.isCorrect !== false,
        explanation: str(h.explanation).slice(0, 600)
      };
      if (shape === "rect") {
        out.x = num(h.x, 0); out.y = num(h.y, 0);
        out.width = num(h.width, 0.1); out.height = num(h.height, 0.1);
      } else if (shape === "circle") {
        out.x = num(h.x, 0.5); out.y = num(h.y, 0.5); out.r = num(h.r, out.tolerance);
      } else {
        out.points = arr(h.points).map(function (p) {
          return { x: num(p.x, 0), y: num(p.y, 0) };
        }).filter(function (p) { return p.x !== null && p.y !== null; });
      }
      return out;
    }).filter(Boolean);
  }

  function normalizeLabels(v) {
    if (!isObj(v)) return null;
    var slots = arr(v.slots).map(function (s, i) {
      if (!isObj(s)) return null;
      return {
        id: str(s.id) || ("s" + (i + 1)),
        x: num(s.x, 0.5), y: num(s.y, 0.5),
        answerId: str(s.answerId),
        hint: str(s.hint).slice(0, 200)
      };
    }).filter(Boolean);
    var bank = arr(v.bank).map(function (b, i) {
      if (isStr(b)) b = { text: b };
      return { id: str(b.id) || ("lb" + (i + 1)), text: str(b.text), isDummy: b.isDummy === true };
    });
    return { slots: slots, bank: bank };
  }

  function normalizeErrorSpans(v) {
    return arr(v).map(function (e, i) {
      if (!isObj(e)) return null;
      return {
        id: str(e.id) || ("e" + (i + 1)),
        wrong: str(e.wrong),
        correct: str(e.correct),
        acceptedAnswers: arr(e.acceptedAnswers).map(str).filter(Boolean),
        note: str(e.note).slice(0, 400)
      };
    }).filter(Boolean);
    /* 書きかけ（誤りの語がまだ空）でも捨てない。捨てると編集画面から消える。
       空のままかどうかは検証で止める。 */
  }

  /* 図表。画像でも、値の入った表でも受け取る。値があるほうを優先して描く。 */
  function normalizeChart(v) {
    if (!isObj(v)) return null;
    var kind = ["bar", "line", "pie", "table", "image"].indexOf(str(v.kind)) >= 0 ? str(v.kind) : "bar";
    var out = {
      kind: kind,
      title: str(v.title).slice(0, 200),
      xLabel: str(v.xLabel).slice(0, 80),
      yLabel: str(v.yLabel).slice(0, 80),
      categories: arr(v.categories).map(str).slice(0, 60),
      series: arr(v.series).map(function (s, i) {
        return {
          id: str(s.id) || ("s" + (i + 1)),
          name: str(s.name) || ("系列" + (i + 1)),
          values: arr(s.values).map(function (n) { return isNum(n) ? n : null; }).slice(0, 60)
        };
      }).slice(0, 8),
      unit: str(v.unit).slice(0, 24)
    };
    if (kind === "image" || v.src) {
      var src = safeSrc(v.src, "image");
      if (src) out.src = src;
    }
    if (kind === "table" && v.table) out.table = normalizeTable(v.table);
    return out;
  }

  function normalizeHint(v) {
    if (v == null) return null;
    if (isStr(v)) return v ? { kind: "text", text: v, penalty: 0, steps: [] } : null;
    if (!isObj(v)) return null;
    var kind = ["text", "initial", "length", "progressive", "eliminate"].indexOf(str(v.kind)) >= 0 ? str(v.kind) : "text";
    return {
      kind: kind,
      text: str(v.text).slice(0, 800),
      penalty: Math.max(0, Math.min(1, num(v.penalty, 0) || 0)),
      steps: arr(v.steps).map(str).slice(0, 12)
    };
  }

  /* 採点のきまり。形式ごとの違いはここに集約する。 */
  var MATCH_MODES = ["exact", "partial", "keyword", "fuzzy", "numeric", "set", "order"];
  /* legacyQ を渡すと、V2 が問題の直下に持っていた tolerance / unit を引き継ぐ。
     引き継がないと、既存の数値問題が突然すべて不正解になる。 */
  function normalizeScoringRule(v, type, legacyQ) {
    var d = Q.defaultsFor(type);
    var o = isObj(v) ? v : {};
    var lq = isObj(legacyQ) ? legacyQ : {};
    if (o.tolerance === undefined && isNum(lq.tolerance)) o = Object.assign({}, o, { tolerance: lq.tolerance });
    if (!o.unit && isStr(lq.unit) && lq.unit) o = Object.assign({}, o, { unit: lq.unit });
    var mode = MATCH_MODES.indexOf(str(o.mode || d.matchMode)) >= 0 ? str(o.mode || d.matchMode) : null;
    return {
      mode: mode,
      partialCredit: o.partialCredit !== undefined ? !!o.partialCredit
                     : (d.partialCredit !== undefined ? !!d.partialCredit : Q.supportsPartial(type)),
      penaltyForWrong: Math.max(0, num(o.penaltyForWrong, 0) || 0),
      caseSensitive: o.caseSensitive !== undefined ? !!o.caseSensitive : !!d.caseSensitive,
      trimWhitespace: o.trimWhitespace !== undefined ? !!o.trimWhitespace : (d.trimWhitespace !== false),
      ignoreSpace: o.ignoreSpace !== undefined ? !!o.ignoreSpace : !!d.ignoreSpace,
      ignorePunctuation: o.ignorePunctuation !== undefined ? !!o.ignorePunctuation : !!d.ignorePunctuation,
      kanaInsensitive: o.kanaInsensitive !== undefined ? !!o.kanaInsensitive : !!d.kanaInsensitive,
      fullwidthToHalfwidth: o.fullwidthToHalfwidth !== undefined ? !!o.fullwidthToHalfwidth : (d.fullwidthToHalfwidth !== false),
      requireKanji: o.requireKanji !== undefined ? !!o.requireKanji : !!d.requireKanji,
      keywords: arr(o.keywords).map(str).filter(Boolean),
      keywordThreshold: num(o.keywordThreshold, null),
      tolerance: num(o.tolerance, isNum(d.tolerance) ? d.tolerance : null),
      unit: str(o.unit || d.unit || ""),
      unitRequired: !!o.unitRequired,
      /* AI 採点でも、まずコードで測れるものは測る。 */
      requiresManualReview: !!o.requiresManualReview
    };
  }

  var SETTING_KEYS = ["shuffleOptions", "caseSensitive", "trimWhitespace", "allowPartialMatch",
                      "showWordCount", "maxLength", "minLength", "tolerance", "timeLimit",
                      "replayLimit", "playbackRate", "zoomEnabled", "confidenceEnabled",
                      "blankMode", "hintKind", "hintPenalty", "monospace", "grid", "multiPoint",
                      "allowUnassigned", "stickyContext", "layout", "face", "selfMark", "twoWay",
                      "invertedPrompt", "appendNoneOption", "longChoices", "answerKind",
                      "chartKind", "display", "itemKind", "orderLabel", "aiGrading",
                      "requiresRubric", "forbidVerbatim", "quoteFromContext", "requireSource",
                      "formula", "hasContext", "contextKind", "choiceCount", "blankCount",
                      "partialCredit", "requireKanji", "kanaInsensitive", "ignoreSpace",
                      "ignorePunctuation", "fullwidthToHalfwidth", "matchMode", "unit",
                      "hasExcludeGroup", "childTypes", "pairKind"];
  function normalizeSettings(v, type) {
    var d = Q.defaultsFor(type);
    var out = {};
    SETTING_KEYS.forEach(function (k) {
      if (isObj(v) && v[k] !== undefined && v[k] !== null) out[k] = clone(v[k]);
      else if (d[k] !== undefined && d[k] !== null) out[k] = clone(d[k]);
    });
    return out;
  }

  var DIFF_TO_NUM = { easy: 2, normal: 3, hard: 4 };
  var NUM_TO_DIFF = { 1: "easy", 2: "easy", 3: "normal", 4: "hard", 5: "hard" };

  function normalizeMetadata(v, q) {
    var m = isObj(v) ? v : {};
    var diffNum = isNum(m.difficulty) ? Math.max(1, Math.min(5, Math.round(m.difficulty)))
                : DIFF_TO_NUM[str(q && q.difficulty)] || 3;
    return {
      subject: str(m.subject).slice(0, 40),
      unit: str(m.unit || (q && q.topic) || "").slice(0, 120),
      grade: str(m.grade).slice(0, 40),
      difficulty: diffNum,
      tags: arr(m.tags).length ? arr(m.tags).map(str).slice(0, 40) : arr(q && q.tags).map(str).slice(0, 40),
      estimatedTime: num(m.estimatedTime, (q && num(q.estimatedSeconds, null))),
      generatedByAI: m.generatedByAI === true || (q && q.createdBy === "ai"),
      generatorModel: str(m.generatorModel).slice(0, 80),
      reasonForType: str(m.reasonForType).slice(0, 400),
      createdAt: str(m.createdAt) || (q && str(q.createdAt)) || "",
      updatedAt: str(m.updatedAt) || (q && str(q.updatedAt)) || ""
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 問題の正規化（何度通しても同じ結果になる）
     ══════════════════════════════════════════════════════════════════ */
  function normalizeQuestion(input, opts) {
    opts = opts || {};
    var src = isObj(input) ? input : {};
    var rawType = str(src.type);
    var canon = Q.canonicalId(rawType);
    var known = !!canon;
    var type = canon || rawType || "multiple_choice_single";
    var d = Q.getOrUnknown(type);
    var engine = d.engine;

    var q = clone(src) || {};
    q.id = str(src.id) || uid("q");
    q.schemaVersion = S.SCHEMA_VERSION;
    q.modelVersion = MODEL_VERSION;
    q.type = type;
    /* 知らない形式に、それらしいエンジンを当てはめない。
       当てはめると「動いているのに全部 0 点」という一番まずい壊れ方をする。 */
    q.engine = known ? engine : null;
    q.typeKnown = known;
    if (!known && rawType) q.unknownType = rawType;

    /* ── 本文 ── */
    q.prompt = str(src.prompt || src.front || "");
    q.promptRich = coerceRich(src.promptRich || src.promptRichText || null);
    if (!q.prompt && q.promptRich) q.prompt = toPlain(q.promptRich);
    q.instruction = str(src.instruction || "");
    q.instructionRich = coerceRich(src.instructionRich || null);
    q.context = str(src.context || "");
    q.contextRich = coerceRich(src.contextRich || null);
    if (!q.context && q.contextRich) q.context = toPlain(q.contextRich);
    q.explanation = str(src.explanation || "");
    q.explanationRich = coerceRich(src.explanationRich || null);

    q.media = normalizeMediaList(src.media);
    normalizeAudioScript(src, q);

    /* ── 形式ごとの構造 ── */
    q.choices = Q.hasChoices(type) || arr(src.choices).length
      ? normalizeChoices(src.choices, engine) : [];
    q.blanks = normalizeBlanks(src.blanks);
    q.orderItems = arr(src.orderItems).length ? normalizeOrderItems(src.orderItems)
                 : (engine === "reorder" ? normalizeOrderItems(src.choices) : []);
    q.pairs = normalizePairs(src.pairs);
    q.classification = normalizeClassification(src.classification);
    q.table = normalizeTable(src.table);
    q.hotspots = normalizeHotspots(src.hotspots);
    q.labels = normalizeLabels(src.labels);
    q.errorSpans = normalizeErrorSpans(src.errorSpans);
    q.chart = normalizeChart(src.chart);
    q.card = engine === "flashcard"
      ? { front: str(src.card && src.card.front) || q.prompt,
          back: str(src.card && src.card.back) || str(src.correctAnswer) || str(src.back) }
      : null;

    /* ── 正解 ── */
    if (engine === "reorder") {
      var order = arr(src.correctOrder).length ? arr(src.correctOrder).map(str)
        : (Array.isArray(src.correctAnswer) ? src.correctAnswer.map(str) : []);
      if (!order.length && q.orderItems.length) {
        order = q.orderItems.slice().sort(function (a, b) {
          return (isNum(a.order) ? a.order : 0) - (isNum(b.order) ? b.order : 0);
        }).map(function (i) { return i.id; });
      }
      q.correctOrder = order;
      q.correctAnswer = order;                 /* grading.js との互換 */
    } else if (engine === "matching") {
      q.correctAnswer = (q.pairs && q.pairs.correct) ? q.pairs.correct
        : (isObj(src.correctAnswer) ? clone(src.correctAnswer) : {});
      if (q.pairs && !Object.keys(q.pairs.correct).length && isObj(src.correctAnswer))
        q.pairs.correct = clone(src.correctAnswer);
    } else if (engine === "single_choice" || engine === "multi_choice" || engine === "true_false"
               || engine === "image_choice" || engine === "audio_choice") {
      q.correctAnswer = src.correctAnswer !== undefined ? clone(src.correctAnswer) : null;
    } else {
      q.correctAnswer = src.correctAnswer !== undefined && src.correctAnswer !== null
        ? clone(src.correctAnswer) : "";
    }
    q.acceptedAnswers = arr(src.acceptedAnswers).map(str).filter(Boolean);
    q.answerNormalization = isObj(src.answerNormalization) ? clone(src.answerNormalization) : null;

    /* ── 採点・設定 ── */
    q.scoringRule = normalizeScoringRule(src.scoringRule, type, src);
    /* grading.js は問題の直下の tolerance を見る。両方そろえておく。 */
    if (isNum(q.scoringRule.tolerance)) q.tolerance = q.scoringRule.tolerance;
    q.settings = normalizeSettings(src.settings, type);
    q.scoringRubric = src.scoringRubric ? clone(src.scoringRubric) : null;
    q.criterionAllocation = arr(src.criterionAllocation).length ? clone(src.criterionAllocation) : undefined;
    if (q.criterionAllocation === undefined) delete q.criterionAllocation;
    q.hint = normalizeHint(src.hint);

    /* ── 共通 ── */
    q.points = num(src.points, 1);
    q.difficulty = ["easy", "normal", "hard"].indexOf(str(src.difficulty)) >= 0 ? str(src.difficulty) : "normal";
    q.topic = str(src.topic);
    q.tags = arr(src.tags).map(str).slice(0, 40);
    q.estimatedSeconds = num(src.estimatedSeconds, defaultSeconds(type));
    q.requiresReview = src.requiresReview === true;
    q.confidence = num(src.confidence, null);
    q.sourceReferences = arr(src.sourceReferences).map(clone);
    q.metadata = normalizeMetadata(src.metadata, q);
    if (src.questionNumber !== undefined) q.questionNumber = src.questionNumber;
    if (src.groupId) q.groupId = str(src.groupId);
    if (src.sectionId) q.sectionId = str(src.sectionId);
    if (src.answerBindingId) q.answerBindingId = str(src.answerBindingId);
    if (src.number !== undefined) q.number = src.number;
    if (src.createdBy) q.createdBy = str(src.createdBy);
    if (src.__legacy) q.__legacy = clone(src.__legacy);

    /* ── 複合大問 ── */
    if (engine === "composite") {
      q.children = arr(src.children).map(function (c, i) {
        var child = normalizeQuestion(c, opts);
        child.groupId = q.id;
        if (child.number === undefined) child.number = i + 1;
        return child;
      });
      /* 大問の配点は小問の合計。ここでずれを作らない。 */
      var sum = q.children.reduce(function (a, c) { return a + (num(c.points, 0) || 0); }, 0);
      q.points = sum > 0 ? Math.round(sum * 100) / 100 : num(src.points, 1);
      q.estimatedSeconds = q.children.reduce(function (a, c) { return a + (num(c.estimatedSeconds, 0) || 0); }, 0) || q.estimatedSeconds;
    } else if (arr(src.children).length) {
      /* 複合でないのに小問が付いている。捨てずに退避する。 */
      q.__legacy = q.__legacy || {};
      q.__legacy.orphanChildren = clone(src.children);
      q.children = [];
    } else {
      q.children = [];
    }

    return q;
  }

  function defaultSeconds(type) {
    var e = Q.engineOf(type);
    if (e === "flashcard") return 12;
    if (e === "free_text") return 300;
    if (e === "composite") return 480;
    if (e === "reorder" || e === "matching" || e === "classification" || e === "table_fill") return 120;
    if (e === "image_point" || e === "image_label" || e === "chart_read") return 90;
    if (e === "dictation") return 120;
    return 60;
  }

  /* V1 / V2 の問題を V3 へ。normalize と同じ入口を通すので、
     二度通しても同じ結果になる（§22 の実行時変換）。 */
  function migrateLegacyQuestion(legacy) {
    var src = isObj(legacy) ? legacy : {};
    /* V1 のカード（front / back / choices / correctIndex）が来たとき */
    if (src.front !== undefined && src.type === undefined) {
      var choices = arr(src.choices).filter(function (c) { return str(c).trim(); });
      var hasChoices = choices.length >= 2;
      src = {
        id: "q_" + str(src.id || uid("c")),
        type: hasChoices ? "multiple_choice_single" : "short_answer",
        prompt: str(src.front),
        choices: hasChoices ? choices.map(function (t, i) {
          return { id: "c" + (i + 1), label: String.fromCharCode(65 + i), text: str(t),
                   isCorrect: isNum(src.correctIndex) && src.correctIndex === i };
        }) : [],
        correctAnswer: hasChoices ? null : str(src.back),
        acceptedAnswers: hasChoices ? [] : (str(src.back) ? [str(src.back)] : []),
        explanation: str(src.explanation),
        tags: arr(src.tags).map(str),
        questionNumber: isNum(Number(src.id)) ? Number(src.id) : undefined,
        __legacy: { back: str(src.back) }
      };
    }
    return normalizeQuestion(src);
  }

  /* ══════════════════════════════════════════════════════════════════
     5) 空の問題を作る（形式を選んだ直後の状態）
     ・「作れる最小の形」を返す。正解は入れない（偽の正解を作らない）。
     ══════════════════════════════════════════════════════════════════ */
  function emptyQuestion(type, o) {
    o = o || {};
    var d = Q.get(type) || Q.get("multiple_choice_single");
    var t = d.id, dfl = d.defaults || {};
    var q = {
      id: o.id || uid("q"),
      type: t,
      prompt: str(o.prompt),
      points: num(o.points, 1),
      difficulty: o.difficulty || "normal",
      topic: str(o.topic),
      tags: [],
      explanation: "",
      createdBy: o.createdBy || "user"
    };
    var e = d.engine;

    if (e === "true_false") {
      q.choices = [{ id: "c1", label: "○", text: "正しい", isCorrect: false },
                   { id: "c2", label: "×", text: "誤り", isCorrect: false }];
    } else if (e === "single_choice" || e === "multi_choice" || e === "image_choice" || e === "audio_choice") {
      var n = num(dfl.choiceCount, 4);
      q.choices = [];
      for (var i = 0; i < n; i++) {
        q.choices.push({ id: "c" + (i + 1), label: String.fromCharCode(65 + i), text: "", isCorrect: false });
      }
      if (dfl.appendNoneOption) q.choices.push({ id: "cNone", label: "N", text: "該当なし", isCorrect: false, isNone: true });
    } else if (e === "fill_blank") {
      var bn = num(dfl.blankCount, 1);
      q.blanks = [];
      for (var b = 0; b < bn; b++) q.blanks.push({ id: "b" + (b + 1), label: String(b + 1), answer: "", acceptedAnswers: [] });
      if (dfl.hasContext) q.context = "";
    } else if (e === "reorder") {
      q.orderItems = [1, 2, 3, 4].map(function (k) { return { id: "i" + k, text: "", order: k }; });
      q.correctOrder = ["i1", "i2", "i3", "i4"];
    } else if (e === "matching") {
      q.pairs = {
        left: [1, 2, 3].map(function (k) { return { id: "L" + k, text: "" }; }),
        right: [1, 2, 3].map(function (k) { return { id: "R" + k, text: "" }; }),
        correct: { L1: "R1", L2: "R2", L3: "R3" }
      };
    } else if (e === "classification") {
      q.classification = {
        groups: [{ id: "g1", label: "" }, { id: "g2", label: "" }],
        items: [1, 2, 3, 4].map(function (k) { return { id: "t" + k, text: "", groupId: "" }; })
      };
      if (dfl.hasExcludeGroup) q.classification.groups.push({ id: "gEx", label: "除外", isExclude: true });
    } else if (e === "table_fill") {
      q.table = {
        columns: [{ id: "col1", text: "" }, { id: "col2", text: "" }],
        rows: [1, 2].map(function (r) {
          return { id: "r" + r, header: "", cells: [
            { id: "r" + r + "c1", text: "", editable: false },
            { id: "r" + r + "c2", text: "", editable: true, answer: "", acceptedAnswers: [] }
          ] };
        })
      };
    } else if (e === "image_point") {
      q.media = [];
      q.hotspots = [{ id: "h1", shape: "circle", x: 0.5, y: 0.5, r: num(dfl.tolerance, 0.06), label: "" }];
    } else if (e === "image_label") {
      q.media = [];
      q.labels = {
        slots: [{ id: "s1", x: 0.35, y: 0.4, answerId: "lb1" }, { id: "s2", x: 0.65, y: 0.6, answerId: "lb2" }],
        bank: [{ id: "lb1", text: "" }, { id: "lb2", text: "" }]
      };
    } else if (e === "chart_read") {
      q.chart = { kind: dfl.chartKind === "table" ? "table" : "bar", title: "",
                  categories: ["", "", ""], series: [{ id: "s1", name: "系列1", values: [0, 0, 0] }] };
      if (dfl.answerKind === "numeric") { q.correctAnswer = ""; }
      else {
        q.choices = [1, 2, 3, 4].map(function (k) {
          return { id: "c" + k, label: String.fromCharCode(64 + k), text: "", isCorrect: false };
        });
      }
    } else if (e === "dictation") {
      q.media = [];
      q.correctAnswer = "";
    } else if (e === "error_correction") {
      q.errorSpans = [{ id: "e1", wrong: "", correct: "", acceptedAnswers: [] }];
    } else if (e === "free_text") {
      q.points = num(o.points, 10);
      /* defaultRubric は (形式, 配点) の 2 引数。片方だけ渡すと
         合計が配点と合わない採点基準ができ、ずっと「要修正」のままになる。 */
      q.scoringRubric = S.defaultRubric ? S.defaultRubric(t, q.points) : null;
    } else if (e === "flashcard") {
      q.card = { front: "", back: "" };
    } else if (e === "composite") {
      q.context = "";
      q.children = arr(dfl.childTypes).length
        ? dfl.childTypes.map(function (ct, i) { return emptyQuestion(ct, { points: 5 }); })
        : [emptyQuestion("multiple_choice_single", { points: 5 })];
    } else if (e === "numeric_input") {
      q.correctAnswer = "";
    } else {
      q.correctAnswer = "";
      q.acceptedAnswers = [];
    }
    return normalizeQuestion(q);
  }

  /* ══════════════════════════════════════════════════════════════════
     6) 複合大問の取り回し
     ・採点・集計・番号付けは「葉」で行う。大問そのものは点を持たない。
     ══════════════════════════════════════════════════════════════════ */
  function isComposite(q) { return !!(q && (q.engine === "composite" || Q.engineOf(q.type) === "composite")); }
  function childrenOf(q) { return isComposite(q) ? arr(q.children) : []; }

  /* 出題順に並んだ葉の一覧。大問は展開する。 */
  function flatten(questions) {
    var out = [];
    arr(questions).forEach(function (q) {
      if (isComposite(q)) {
        childrenOf(q).forEach(function (c) {
          var child = c;
          if (!child.groupId) { child = clone(c); child.groupId = q.id; }
          out.push(child);
        });
      } else out.push(q);
    });
    return out;
  }
  /* 葉の ID → 親の大問。結果画面で「どの大問の小問か」を出すために使う。 */
  function groupIndex(questions) {
    var map = Object.create(null);
    arr(questions).forEach(function (q) {
      if (!isComposite(q)) return;
      childrenOf(q).forEach(function (c) { map[c.id] = q; });
    });
    return map;
  }
  function countQuestions(questions) { return flatten(questions).length; }

  /* ══════════════════════════════════════════════════════════════════
     7) 追加の検証（新しい構造の分だけ。既存 validate.js とは重ねて使う）
     ・error が 1 件でもあれば保存させない、という扱いは validate.js と同じ。
     ══════════════════════════════════════════════════════════════════ */
  /* 「まだ書いていない」ことを表す指摘。
     編集中は要修正にしない（作りはじめた瞬間に全部赤くなると手が止まる）。
     出題・公開の直前（strict）だけ、そろっていないものを止める。 */
  var NOT_YET_CODES = {
    noCorrect: 1, tooFewChoices: 1, missingChoiceImage: 1, missingAudio: 1, missingImage: 1,
    noBlanks: 1, blankNoAnswer: 1, blankNoOptions: 1,
    tooFewItems: 1, noOrder: 1, emptyItem: 1,
    tooFewPairs: 1, pairNoCorrect: 1, emptyPairItem: 1,
    tooFewGroups: 1, emptyGroupLabel: 1, itemNoGroup: 1,
    noTable: 1, cellNoAnswer: 1, noEditableCell: 1,
    noHotspots: 1, noSlots: 1, noBank: 1, slotNoAnswer: 1,
    noChart: 1, noAnswer: 1, noErrorSpans: 1, noErrorWrong: 1, noCorrection: 1,
    noFront: 1, noBack: 1, noChildren: 1, noRubric: 1
  };

  /* まだ何も書いていない問題か。ここで早く返して、指摘を 1 行にまとめる。 */
  function looksUntouched(q) {
    if (!q) return true;
    if (str(q.prompt).trim() || str(q.context).trim() || str(q.instruction).trim()) return false;
    if (arr(q.media).length) return false;
    /* 「該当なし」はこちらが自動で足したもの。書いたとは数えない。 */
    if (arr(q.choices).some(function (c) { return (!c.isNone && str(c.text).trim()) || c.image; })) return false;
    if (arr(q.blanks).some(function (b) { return str(b.answer).trim(); })) return false;
    if (arr(q.orderItems).some(function (i) { return str(i.text).trim(); })) return false;
    if (q.pairs && (arr(q.pairs.left).some(function (l) { return str(l.text).trim(); })
                 || arr(q.pairs.right).some(function (r) { return str(r.text).trim(); }))) return false;
    if (q.classification && (arr(q.classification.groups).some(function (g) { return str(g.label).trim(); })
                          || arr(q.classification.items).some(function (i) { return str(i.text).trim(); }))) return false;
    if (q.table && arr(q.table.rows).some(function (r) {
      return arr(r.cells).some(function (c) { return str(c.text).trim() || str(c.answer).trim(); });
    })) return false;
    if (arr(q.hotspots).some(function (h) { return str(h.label).trim(); })) return false;
    if (q.labels && arr(q.labels.bank).some(function (b) { return str(b.text).trim(); })) return false;
    if (arr(q.errorSpans).some(function (e) { return str(e.wrong).trim() || str(e.correct).trim(); })) return false;
    if (q.card && (str(q.card.front).trim() || str(q.card.back).trim())) return false;
    /* correctAnswer が配列・オブジェクトのときは、こちらが自動で入れた並びや
       対応表であって、利用者が書いたものではない。「書いた」と数えない。 */
    if (typeof q.correctAnswer === "string" && q.correctAnswer.trim()) return false;
    if (arr(q.acceptedAnswers).length) return false;
    if (arr(q.children).length) return false;
    return true;
  }

  function validateV3Question(qIn, path, out, opts) {
    out = out || [];
    opts = opts || {};
    var q = qIn || {};
    /* 出題・公開の直前だけ、そろっていないものを止める。
       編集中は「まだ書いていない」を要修正にしない。 */
    var strict = !!opts.strict;
    var raw = out;
    out = {
      push: function (issue) {
        if (!strict && issue.severity === "error" && NOT_YET_CODES[issue.code]) {
          issue = S.warn(issue.code, issue.path, issue.message);
        }
        raw.push(issue);
        return raw.length;
      },
      length: 0
    };
    if (!strict && looksUntouched(q) && Q.get(q.type)) {
      raw.push(S.info("notWrittenYet", path,
        "この問題はまだ書きかけです（" + Q.label(q.type) + "）。"));
      return raw;
    }

    var d = Q.get(q.type);
    if (!d) {
      out.push(S.err("unknownType", path + ".type",
        "知らない問題形式です: " + str(q.type) + "。この問題は表示できません。"));
      return raw;
    }
    if (d.status === "coming_soon") {
      out.push(S.err("comingSoonType", path + ".type",
        "「" + d.name + "」はまだ使えません（準備中）。別の形式を選んでください。"));
      return raw;
    }
    if (d.status === "deprecated") {
      out.push(S.warn("deprecatedType", path + ".type", "「" + d.name + "」は今後使えなくなります。"));
    }
    var e = d.engine;

    if (e === "single_choice" || e === "true_false" || e === "image_choice" || e === "audio_choice") {
      var correct = arr(q.choices).filter(function (c) { return c.isCorrect; });
      if (arr(q.choices).length < 2) out.push(S.err("tooFewChoices", path + ".choices", "選択肢が 2 つ以上必要です。"));
      if (correct.length === 0) out.push(S.err("noCorrect", path + ".choices", "正解がどれか決まっていません。"));
      if (correct.length > 1) out.push(S.err("tooManyCorrect", path + ".choices",
        "1 つだけ選ぶ形式なのに正解が " + correct.length + " つあります。"));
      if (e === "image_choice" && !arr(q.choices).some(function (c) { return c.image; }))
        out.push(S.err("missingChoiceImage", path + ".choices", "画像選択なのに、画像の付いた選択肢がありません。"));
      if (e === "audio_choice" && !hasAudioSource(q))
        out.push(S.err("missingAudio", path + ".script", "読み上げる原稿も音声もありません。"));
    }
    if (e === "multi_choice") {
      if (arr(q.choices).length < 2) out.push(S.err("tooFewChoices", path + ".choices", "選択肢が 2 つ以上必要です。"));
      if (!arr(q.choices).some(function (c) { return c.isCorrect; }))
        out.push(S.err("noCorrect", path + ".choices", "正解が 1 つも決まっていません。"));
      if (arr(q.choices).every(function (c) { return c.isCorrect; }))
        out.push(S.warn("allCorrect", path + ".choices", "すべてが正解になっています。意図した設定か確認してください。"));
    }
    if (e === "fill_blank") {
      if (!arr(q.blanks).length) out.push(S.err("noBlanks", path + ".blanks", "空欄が 1 つもありません。"));
      arr(q.blanks).forEach(function (b, i) {
        var hasOpts = arr(b.options).length > 0;
        if (!str(b.answer) && !arr(b.acceptedAnswers).length)
          out.push(S.err("blankNoAnswer", path + ".blanks[" + i + "].answer", "空欄 " + (i + 1) + " の正解がありません。"));
        if (q.settings && q.settings.blankMode === "select" && !hasOpts)
          out.push(S.err("blankNoOptions", path + ".blanks[" + i + "].options", "選択式なのに空欄 " + (i + 1) + " の選択肢がありません。"));
      });
      if (q.settings && q.settings.blankMode === "drag" && !arr(q.wordBank).length && !arr(q.blanks).some(function (b) { return arr(b.options).length; }))
        out.push(S.warn("noWordBank", path + ".wordBank", "ドラッグ式ですが語群がありません。空欄の正解から自動で作ります。"));
    }
    if (e === "reorder") {
      if (arr(q.orderItems).length < 2) out.push(S.err("tooFewItems", path + ".orderItems", "並べ替える項目が 2 つ以上必要です。"));
      var ids = arr(q.orderItems).map(function (i) { return i.id; });
      var ord = arr(q.correctOrder);
      if (!ord.length) out.push(S.err("noOrder", path + ".correctOrder", "正しい順序が決まっていません。"));
      else {
        if (ord.length !== ids.length)
          out.push(S.err("orderLength", path + ".correctOrder", "正しい順序の数（" + ord.length + "）と項目の数（" + ids.length + "）が合いません。"));
        ord.forEach(function (id, i) {
          if (ids.indexOf(id) < 0) out.push(S.err("orderUnknownId", path + ".correctOrder[" + i + "]", "存在しない項目 " + id + " が順序に入っています。"));
        });
      }
      if (arr(q.orderItems).some(function (i) { return !str(i.text) && !i.image; }))
        out.push(S.err("emptyItem", path + ".orderItems", "中身が空の項目があります。"));
    }
    if (e === "matching") {
      var p = q.pairs;
      if (!p || arr(p.left).length < 2) out.push(S.err("tooFewPairs", path + ".pairs.left", "左の項目が 2 つ以上必要です。"));
      if (!p || arr(p.right).length < 2) out.push(S.err("tooFewPairs", path + ".pairs.right", "右の項目が 2 つ以上必要です。"));
      if (p) {
        var rIds = arr(p.right).map(function (r) { return r.id; });
        arr(p.left).forEach(function (l, i) {
          if (!str(l.text) && !l.image)
            out.push(S.err("emptyPairItem", path + ".pairs.left[" + i + "].text", "左の項目の中身が空です。"));
        });
        arr(p.right).forEach(function (r, i) {
          if (!str(r.text) && !r.image)
            out.push(S.err("emptyPairItem", path + ".pairs.right[" + i + "].text", "右の項目の中身が空です。"));
        });
        arr(p.left).forEach(function (l) {
          var want = p.correct ? p.correct[l.id] : null;
          if (!want) out.push(S.err("pairNoCorrect", path + ".pairs.correct." + l.id, "「" + (l.text || l.id) + "」の相手が決まっていません。"));
          else if (rIds.indexOf(want) < 0) out.push(S.err("pairUnknownId", path + ".pairs.correct." + l.id, "存在しない相手 " + want + " が指定されています。"));
        });
      }
    }
    if (e === "classification") {
      var c = q.classification;
      if (!c || arr(c.groups).length < 2) out.push(S.err("tooFewGroups", path + ".classification.groups", "分ける先が 2 つ以上必要です。"));
      if (!c || arr(c.items).length < 2) out.push(S.err("tooFewItems", path + ".classification.items", "分ける項目が 2 つ以上必要です。"));
      if (c) {
        var gIds = arr(c.groups).map(function (g) { return g.id; });
        arr(c.groups).forEach(function (g, i) {
          if (!str(g.label)) out.push(S.err("emptyGroupLabel", path + ".classification.groups[" + i + "].label", "分け先の名前が空です。"));
        });
        arr(c.items).forEach(function (it, i) {
          if (!str(it.text)) out.push(S.err("emptyItem", path + ".classification.items[" + i + "].text", "項目の中身が空です。"));
          if (!str(it.groupId)) out.push(S.err("itemNoGroup", path + ".classification.items[" + i + "].groupId", "「" + (it.text || it.id) + "」がどの分け先か決まっていません。"));
          else if (gIds.indexOf(it.groupId) < 0) out.push(S.err("itemUnknownGroup", path + ".classification.items[" + i + "].groupId", "存在しない分け先が指定されています。"));
        });
      }
    }
    if (e === "table_fill") {
      var t = q.table;
      if (!t || !arr(t.rows).length) out.push(S.err("noTable", path + ".table", "表がありません。"));
      else {
        var editable = 0;
        arr(t.rows).forEach(function (r, ri) {
          arr(r.cells).forEach(function (cell, ci) {
            if (!cell.editable) return;
            editable++;
            if (!str(cell.answer) && !arr(cell.acceptedAnswers).length)
              out.push(S.err("cellNoAnswer", path + ".table.rows[" + ri + "].cells[" + ci + "].answer", "埋めるますの正解がありません。"));
          });
        });
        if (!editable) out.push(S.err("noEditableCell", path + ".table", "埋めるますが 1 つもありません。"));
      }
    }
    if (e === "image_point") {
      if (!firstMedia(q, "image")) out.push(S.err("missingImage", path + ".media", "画像が設定されていません。"));
      if (!arr(q.hotspots).length) out.push(S.err("noHotspots", path + ".hotspots", "正解の場所が決まっていません。"));
      arr(q.hotspots).forEach(function (h, i) {
        var p2 = path + ".hotspots[" + i + "]";
        if (h.shape === "poly" && arr(h.points).length < 3)
          out.push(S.err("polyTooFewPoints", p2 + ".points", "多角形には 3 点以上必要です。"));
        ["x", "y"].forEach(function (k) {
          if (isNum(h[k]) && (h[k] < 0 || h[k] > 1))
            out.push(S.err("outOfImage", p2 + "." + k, "座標は 0〜1 の範囲で持ちます（画像の外を指しています）。"));
        });
      });
    }
    if (e === "image_label") {
      if (!firstMedia(q, "image")) out.push(S.err("missingImage", path + ".media", "画像が設定されていません。"));
      var L = q.labels;
      if (!L || !arr(L.slots).length) out.push(S.err("noSlots", path + ".labels.slots", "ラベルを置く場所がありません。"));
      if (!L || !arr(L.bank).length) out.push(S.err("noBank", path + ".labels.bank", "置くラベルがありません。"));
      if (L) {
        var bIds = arr(L.bank).map(function (b) { return b.id; });
        arr(L.slots).forEach(function (s, i) {
          if (!str(s.answerId)) out.push(S.err("slotNoAnswer", path + ".labels.slots[" + i + "].answerId", "この場所に入る正しいラベルが決まっていません。"));
          else if (bIds.indexOf(s.answerId) < 0) out.push(S.err("slotUnknownLabel", path + ".labels.slots[" + i + "].answerId", "存在しないラベルが指定されています。"));
        });
      }
    }
    if (e === "chart_read") {
      var ch = q.chart;
      var hasImg = !!firstMedia(q, "image") || (ch && ch.src);
      var hasData = ch && (arr(ch.series).some(function (s) { return arr(s.values).length; }) || ch.table);
      if (!hasImg && !hasData) out.push(S.err("noChart", path + ".chart", "読み取る図表がありません。"));
      if (!arr(q.choices).length && !str(q.correctAnswer))
        out.push(S.err("noAnswer", path + ".correctAnswer", "答えが決まっていません。"));
    }
    if (e === "dictation") {
      /* 書き取りは、正解の文がそのまま読み上げる原稿になる。
         正解さえあれば音声は用意できるので、音声ファイルは必須にしない。 */
      if (!str(q.correctAnswer)) out.push(S.err("noAnswer", path + ".correctAnswer", "書き取る正しい文がありません。"));
    }
    if (e === "error_correction") {
      if (!arr(q.errorSpans).length) out.push(S.err("noErrorSpans", path + ".errorSpans", "どこが誤りかが決まっていません。"));
      arr(q.errorSpans).forEach(function (sp, i) {
        if (!str(sp.wrong))
          out.push(S.err("noErrorWrong", path + ".errorSpans[" + i + "].wrong", "どの語が誤りかが入っていません。"));
        if (!str(sp.correct) && !arr(sp.acceptedAnswers).length)
          out.push(S.err("noCorrection", path + ".errorSpans[" + i + "].correct", "正しい形が入っていません。"));
        if (str(q.prompt) && str(sp.wrong) && q.prompt.indexOf(sp.wrong) < 0)
          out.push(S.warn("spanNotInPrompt", path + ".errorSpans[" + i + "].wrong",
            "「" + sp.wrong + "」が問題文の中に見つかりません。"));
      });
    }
    if (e === "free_text") {
      var aiOn = !(q.settings && q.settings.aiGrading === false);
      var rub = q.scoringRubric && arr(q.scoringRubric.items).length;
      if (aiOn && !rub)
        out.push(S.err("noRubric", path + ".scoringRubric",
          "AI に採点させるには採点基準が要ります。基準がないと、点の理由を示せません。"));
      if (rub) {
        var sum = q.scoringRubric.items.reduce(function (a, it) { return a + (num(it.points, 0) || 0); }, 0);
        if (Math.abs(sum - num(q.points, 0)) > 0.01)
          out.push(S.err("rubricSum", path + ".scoringRubric",
            "採点基準の合計（" + sum + " 点）が配点（" + q.points + " 点）と合いません。"));
      }
      if (!aiOn && !str(q.correctAnswer) && !arr(q.acceptedAnswers).length)
        out.push(S.err("noAnswer", path + ".correctAnswer", "コードで採点するには正解が要ります。"));
    }
    if (e === "text_input" || e === "numeric_input") {
      if (!str(q.correctAnswer) && !arr(q.acceptedAnswers).length
          && !(q.scoringRule && arr(q.scoringRule.keywords).length))
        out.push(S.err("noAnswer", path + ".correctAnswer", "正解が入っていません。"));
      if (e === "numeric_input" && str(q.correctAnswer) && !isFinite(Number(String(q.correctAnswer).replace(/,/g, ""))))
        out.push(S.err("notNumeric", path + ".correctAnswer", "数値で答える形式ですが、正解が数値ではありません。"));
    }
    if (e === "flashcard") {
      var card = q.card || {};
      if (!str(card.front)) out.push(S.err("noFront", path + ".card.front", "カードの表が空です。"));
      if (!str(card.back)) out.push(S.err("noBack", path + ".card.back", "カードの裏が空です。"));
    }
    if (e === "composite") {
      var kids = arr(q.children);
      if (!kids.length) out.push(S.err("noChildren", path + ".children", "小問が 1 つもありません。"));
      if (kids.length > 60) out.push(S.err("tooManyChildren", path + ".children", "1 つの大問に入れられる小問は 60 問までです。"));
      if (!str(q.context) && !q.contextRich && !arr(q.media).length)
        out.push(S.warn("noContext", path + ".context", "共通の資料がありません。小問を並べただけになっています。"));
      kids.forEach(function (c, i) {
        if (isComposite(c)) {
          out.push(S.err("nestedComposite", path + ".children[" + i + "]", "大問の中に大問は入れられません。"));
          return;
        }
        validateV3Question(c, path + ".children[" + i + "]", raw, opts);
      });
    }

    /* 制限時間・再生回数の値域 */
    var st = q.settings || {};
    if (isNum(st.timeLimit) && (st.timeLimit < 0 || st.timeLimit > 7200))
      out.push(S.err("timeLimitRange", path + ".settings.timeLimit", "1 問の制限時間は 0〜7200 秒で指定します。"));
    if (isNum(st.replayLimit) && (st.replayLimit < 0 || st.replayLimit > 20))
      out.push(S.err("replayLimitRange", path + ".settings.replayLimit", "再生できる回数は 0〜20 回で指定します。"));

    return raw;
  }

  function validateV3Preset(preset, out, opts) {
    out = out || [];
    arr(preset && preset.questions).forEach(function (q, i) {
      validateV3Question(q, "questions[" + i + "]", out, opts);
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     8) 出題側へ渡す形（正解を含まない）
     ・Mock / 対戦では、正解を端末へ送らない（§9 / §21）。
     ══════════════════════════════════════════════════════════════════ */
  function stripAnswers(q) {
    var v = clone(q);
    /* ドラッグ式の穴埋めは語群が要る。正解を消す前に作っておく
       （消したあとでは作れず、語群が空の出題になる）。 */
    if (v.settings && v.settings.blankMode === "drag" && !arr(v.wordBank).length) {
      var bank = [], seen = Object.create(null);
      arr(v.blanks).forEach(function (b) {
        var t = str(b.answer);
        if (!t) return;
        if (seen[t] !== undefined) { bank[seen[t]].count++; return; }
        seen[t] = bank.length;
        bank.push({ id: "w" + bank.length, text: t, count: 1 });
      });
      if (bank.length) v.wordBank = bank;
    }
    /* 読み上げ問題は、原稿が無いと音そのものを作れない。
       書き取りは「正解の文＝読み上げる文」なので、正解を消す前に原稿へ写す。
       写さないと、試験モードだけ再生ボタンが無音になる（気づけない壊れ方）。
       **原稿は端末に残る**。音声を端末で作る以上ここは避けられないので、
       試験で厳密に隠したい場合は音声ファイルを用意して原稿を空にすること。 */
    if (v.engine === "dictation" && !str(v.script) && typeof v.correctAnswer === "string")
      v.script = v.correctAnswer;
    delete v.correctAnswer;
    delete v.acceptedAnswers;
    delete v.correctOrder;
    delete v.explanation;
    delete v.explanationRich;
    delete v.scoringRubric;
    delete v.hint;
    arr(v.choices).forEach(function (c) { delete c.isCorrect; delete c.explanation; });
    arr(v.blanks).forEach(function (b) { delete b.answer; delete b.acceptedAnswers; });
    if (v.pairs) delete v.pairs.correct;
    if (v.classification) arr(v.classification.items).forEach(function (it) { delete it.groupId; });
    if (v.table) arr(v.table.rows).forEach(function (r) {
      arr(r.cells).forEach(function (c) { if (c.editable) { delete c.answer; delete c.acceptedAnswers; } });
    });
    /* 位置問題は「どこが正解か」を消すと出題できないので、
       範囲だけ残して、正解／不正解の別と解説を落とす。 */
    arr(v.hotspots).forEach(function (h) { delete h.isCorrect; delete h.explanation; });
    if (v.labels) arr(v.labels.slots).forEach(function (s) { delete s.answerId; });
    arr(v.errorSpans).forEach(function (e) { delete e.correct; delete e.acceptedAnswers; delete e.note; });
    arr(v.children).forEach(function (c, i) { v.children[i] = stripAnswers(c); });
    if (v.card) delete v.card.back;
    v.__answersStripped = true;
    return v;
  }
  /* 位置問題だけは、正解の場所そのものが答えなので、
     サーバ採点のときは hotspots ごと送らないという選択も要る。 */
  function stripAnswersStrict(q) {
    var v = stripAnswers(q);
    if (v.engine === "image_point") v.hotspots = [];
    if (v.engine === "image_label" && v.labels) v.labels.slots = arr(v.labels.slots).map(function (s) {
      return { id: s.id, x: s.x, y: s.y, hint: s.hint };
    });
    return v;
  }

  VQ2.qmodel = {
    MODEL_VERSION: MODEL_VERSION,
    RC: RC,
    normalize: normalizeQuestion,
    normalizeQuestion: normalizeQuestion,
    migrateLegacyQuestion: migrateLegacyQuestion,
    empty: emptyQuestion,
    emptyQuestion: emptyQuestion,
    defaultSeconds: defaultSeconds,
    isComposite: isComposite, childrenOf: childrenOf, flatten: flatten,
    groupIndex: groupIndex, countQuestions: countQuestions,
    firstMedia: firstMedia, normalizeMediaList: normalizeMediaList, safeSrc: safeSrc,
    hasAudioSource: hasAudioSource,
    validateQuestion: validateV3Question, validatePreset: validateV3Preset,
    looksUntouched: looksUntouched, NOT_YET_CODES: NOT_YET_CODES,
    stripAnswers: stripAnswers, stripAnswersStrict: stripAnswersStrict,
    /* 部品（編集フォームと AI 取り込みが使う） */
    normalizeChoices: normalizeChoices, normalizeBlanks: normalizeBlanks,
    normalizeOrderItems: normalizeOrderItems, normalizePairs: normalizePairs,
    normalizeClassification: normalizeClassification, normalizeTable: normalizeTable,
    normalizeHotspots: normalizeHotspots, normalizeLabels: normalizeLabels,
    normalizeErrorSpans: normalizeErrorSpans, normalizeChart: normalizeChart,
    normalizeScoringRule: normalizeScoringRule, normalizeSettings: normalizeSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
