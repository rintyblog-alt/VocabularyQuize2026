/* ══════════════════════════════════════════════════════════════════════
   AI の出力を「そのまま使える形」にする層

   なぜ要るか:
     頼み方に「出力は本文だけ」と書いても、model は
       「はい、承知しました。以下が書き直した文章です。」
       「```markdown …略… ```」
       「いかがでしょうか。ご確認ください。」
     を付けてくる。これが本文に混ざると、そのまま文書へ入らない。
     表を頼んでも、表にせず箇条書きで返してくることもある。

   ここでやること（3 段）:
     1. **目印で囲わせる**（contract）。囲えていれば中身だけを取ればよい。
     2. 囲えていなかったときのために **掃除する**（clean）。
     3. 形が要るもの（表・スライド・アンケート・数式）は **検算する**（validate）。
        通らなければ呼び出し側が 1 回だけ言い直す。

   掃除の規則は当てずっぽうではなく、実際に返ってきた文面から作っている。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});

  var BEGIN = "===OUTPUT===";
  var END = "===END===";

  /* ── 1. 頼み方に足す約束 ───────────────────────────────────── */
  function contract(kind) {
    var shape = {
      text:    "・本文だけ。見出しや箇条書きは元の文章に合わせる。",
      lines:   "・1 行に 1 つ。行頭に「- 」を付ける。",
      table:   "・Markdown の表だけ。1 行目が見出し、2 行目は |---|---| の区切り。\n"
             + "・列数はすべての行で揃える。説明の文は書かない。",
      tsv:     "・タブ区切りの表だけ。1 行目が見出し。\n"
             + "・列の区切りは必ずタブ 1 個。空欄も列として残す。説明の文は書かない。",
      outline: "・1 枚ごとに「## 見出し」の行を置き、その下に「- 箇条書き」を 3 行まで。\n"
             + "・それ以外の行は書かない。",
      form:    "・1 行につき 1 問。「type|質問文|選択肢1;選択肢2」の形。\n"
             + "・type は single_choice / multi_choice / short_text / long_text / scale / star のどれか。\n"
             + "・選択肢が要らない type は 3 つ目を空にする。それ以外の行は書かない。",
      formula: "・「=」で始まる数式を 1 行だけ。説明は書かない。"
    }[kind] || "・求めたものだけ。";

    return "\n\n【出力の決まり】\n"
      + "・出力は必ず " + BEGIN + " の行で始め、" + END + " の行で終える。\n"
      + "・" + BEGIN + " と " + END + " の間には、求めたものだけを書く。\n"
      + "・あいさつ・前置き・「以下が〜です」・感想・確認の問いかけは **1 文字も書かない**。\n"
      + "・``` で囲わない。\n"
      + shape + "\n";
  }

  /* ── 2. 掃除 ───────────────────────────────────────────────── */

  /* 前置き。実際に返ってきたものを元にしている。
     行まるごと消すので、本文の途中の言い回しは巻き込まない。 */
  var PREAMBLE = [
    /^\s*(はい|ええ|もちろん)[、,。!！]?\s*/,
    /^\s*(承知(いた)?しました|かしこまりました|了解(いた)?しました)[。.!！]?\s*/,
    /^\s*(以下|下記)(が|に|の(とおり|通り))[^\n]{0,40}(です|になります|示します|作成しました)[。.:：]?\s*$/,
    /^\s*[^\n]{0,30}(を)?(作成|作成いた)しました[。.:：]?\s*$/,
    /^\s*[^\n]{0,30}(に)?(書き直し|整理|要約|翻訳|修正)(いた)?しました[。.:：]?\s*$/,
    /^\s*(Sure|Certainly|Of course|Here('s| is| are)|Below is)[^\n]{0,60}[:：]?\s*$/i,
    /^\s*(I('| ha)ve|I will)[^\n]{0,60}[:：]?\s*$/i
  ];
  /* 後置き。 */
  var TRAILER = [
    /^\s*(いかが(でしょうか|ですか))[。.?？]?\s*$/,
    /^\s*(ご(確認|参考|不明点|質問)|必要(に応じて|であれば)|他に(も)?)[^\n]{0,60}\s*$/,
    /^\s*[^\n]{0,40}(お知らせください|お申し付けください|ご連絡ください)[。.]?\s*$/,
    /^\s*(Let me know|Feel free|Hope this helps|If you)[^\n]{0,80}\s*$/i,
    /^\s*※?\s*(補足|注意|ポイント)[:：][^\n]{0,80}$/
  ];

  function stripFence(s) {
    var t = String(s || "").trim();
    /* 全体が ``` で囲われている場合だけ外す（本文中のコード片は残す） */
    var m = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(t);
    if (m) return m[1].trim();
    /* 片方しか無い壊れた囲みも落とす */
    t = t.replace(/^```[a-zA-Z0-9_-]*\s*\n/, "").replace(/\n?```\s*$/, "");
    return t.trim();
  }

  function clean(raw, kind) {
    var t = String(raw == null ? "" : raw);

    /* 目印で囲えていれば、その中だけを取る。いちばん確実。 */
    var bi = t.indexOf(BEGIN);
    if (bi >= 0) {
      t = t.slice(bi + BEGIN.length);
      var ei = t.indexOf(END);
      if (ei >= 0) t = t.slice(0, ei);
    } else {
      /* 目印が無いときは、終わりの目印だけ残っている場合もある */
      t = t.replace(new RegExp(END.replace(/[|]/g, "\\|"), "g"), "");
    }
    t = t.replace(/\r\n?/g, "\n").trim();
    t = stripFence(t);

    /* 行単位で前置き・後置きを落とす。
       「本文が 1 行しか無い」ときに全部消してしまわないよう、
       残りが空になる削除は行わない。 */
    var lines = t.split("\n");
    var guard = 0;
    while (lines.length > 1 && guard++ < 6) {
      var head = lines[0];
      if (!head.trim()) { lines.shift(); continue; }
      var hit = PREAMBLE.some(function (re) { return re.test(head); });
      if (!hit) break;
      lines.shift();
    }
    guard = 0;
    while (lines.length > 1 && guard++ < 6) {
      var tail = lines[lines.length - 1];
      if (!tail.trim()) { lines.pop(); continue; }
      var hit2 = TRAILER.some(function (re) { return re.test(tail); });
      if (!hit2) break;
      lines.pop();
    }
    t = lines.join("\n").trim();
    t = stripFence(t);

    /* 1 行しか無いときは、行頭の前置きだけ削る（行ごと消せないため） */
    if (t.indexOf("\n") < 0) {
      PREAMBLE.slice(0, 2).forEach(function (re) { t = t.replace(re, ""); });
      t = t.trim();
    }
    /* 数式は 1 行だけにする */
    if (kind === "formula") {
      var f = t.split("\n").map(function (x) { return x.trim(); })
        .filter(function (x) { return x.indexOf("=") === 0; })[0];
      if (f) t = f;
    }
    return t;
  }

  /* ── 表を読む ───────────────────────────────────────────────
     Markdown の表と、タブ区切りの両方を受ける。
     区切り線（|---|---|）は落とす。列数が足りない行は空欄で埋め、
     多い行は切らずに全体の列数を広げる（黙って捨てない）。 */
  function parseTable(text) {
    var lines = String(text || "").split("\n")
      .map(function (l) { return l.replace(/\s+$/, ""); })
      .filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return null;

    var md = lines.filter(function (l) { return /^\s*\|/.test(l) || /\|/.test(l); }).length >= lines.length * 0.6;
    var rows = [];

    if (md) {
      lines.forEach(function (l) {
        var s = l.trim();
        if (/^\|?\s*:?-{2,}/.test(s.replace(/\|/g, "").trim()) && /^[\s|:\-]+$/.test(s)) return; /* 区切り線 */
        s = s.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
        /* \| は中身としての縦棒 */
        var cells = s.split(/(?<!\\)\|/).map(function (c) {
          return c.replace(/\\\|/g, "|").trim();
        });
        if (cells.length >= 2) rows.push(cells);
      });
    }
    if (!rows.length) {
      /* タブ区切り。タブが無ければ 2 つ以上の空白でも受ける。 */
      var tabbed = lines.filter(function (l) { return l.indexOf("\t") >= 0; }).length >= 1;
      lines.forEach(function (l) {
        var cells = tabbed ? l.split("\t") : l.split(/\s{2,}/);
        cells = cells.map(function (c) { return c.trim(); });
        if (cells.length >= 2) rows.push(cells);
      });
    }
    if (rows.length < 2) return null;

    var cols = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0);
    rows = rows.map(function (r) {
      var out = r.slice(0, cols);
      while (out.length < cols) out.push("");
      return out;
    });
    return { header: rows[0], rows: rows.slice(1), cols: cols, all: rows };
  }

  /* ── スライドの構成を読む ───────────────────────────────── */
  function parseOutline(text) {
    var slides = [];
    var cur = null;
    String(text || "").split("\n").forEach(function (raw) {
      var l = raw.trim();
      if (!l) return;
      var h = /^#{1,4}\s+(.+)$/.exec(l);
      if (h) { cur = { title: h[1].trim(), bullets: [] }; slides.push(cur); return; }
      var b = /^[-*・]\s+(.+)$/.exec(l);
      if (b) {
        if (!cur) { cur = { title: "", bullets: [] }; slides.push(cur); }
        cur.bullets.push(b[1].trim());
        return;
      }
      /* 見出しも箇条書きも無い行は、そのスライドの説明として拾う */
      if (cur) cur.bullets.push(l);
      else { cur = { title: l, bullets: [] }; slides.push(cur); }
    });
    return slides.filter(function (s) { return s.title || s.bullets.length; });
  }

  /* ── 3. 検算 ───────────────────────────────────────────────
     形が要るものだけ。通らなければ、呼び出し側が 1 回だけ言い直す。 */
  function validate(kind, text) {
    var t = String(text || "").trim();
    if (!t) return { ok: false, why: "空でした" };

    /* どの種類でも、会話文が残っていたら失敗にする */
    var chat = /(承知(いた)?しました|かしこまりました|いかがでしょうか|ご確認ください|以下(が|に)(.{0,20})です)/;
    if (chat.test(t.split("\n")[0]) || chat.test(t.split("\n").slice(-1)[0]))
      return { ok: false, why: "あいさつや前置きが残っています" };

    if (kind === "table" || kind === "tsv") {
      var tb = parseTable(t);
      if (!tb) return { ok: false, why: "表として読めませんでした" };
      if (tb.cols < 2) return { ok: false, why: "列が 1 つしかありません" };
      if (tb.rows.length < 1) return { ok: false, why: "見出しだけで中身がありません" };
      return { ok: true, table: tb };
    }
    if (kind === "outline") {
      var sl = parseOutline(t);
      if (sl.length < 2) return { ok: false, why: "スライドが 2 枚未満です" };
      if (!sl.some(function (s) { return s.title; })) return { ok: false, why: "見出しがありません" };
      return { ok: true, slides: sl };
    }
    if (kind === "form") {
      var ok = t.split("\n").filter(function (l) { return l.indexOf("|") > 0; }).length;
      if (!ok) return { ok: false, why: "「type|質問|選択肢」の行がありません" };
      return { ok: true };
    }
    if (kind === "formula") {
      if (t.indexOf("=") !== 0) return { ok: false, why: "「=」で始まっていません" };
      if (t.indexOf("\n") >= 0) return { ok: false, why: "1 行ではありません" };
      return { ok: true };
    }
    if (kind === "lines") {
      var n = t.split("\n").filter(function (l) { return /^[-*・]\s+/.test(l.trim()); }).length;
      if (!n) return { ok: false, why: "箇条書きになっていません" };
      return { ok: true };
    }
    return { ok: true };
  }

  /* 言い直すときの、短くて強い頼み方。 */
  function retryNote(kind, why) {
    return "さきほどの出力は使えませんでした（理由: " + why + "）。\n"
      + "**同じ内容を、形だけ直して出し直してください。**\n"
      + "説明・あいさつ・前置き・後置きは一切書かないこと。"
      + contract(kind);
  }

  WP.aiFormat = {
    BEGIN: BEGIN, END: END,
    contract: contract, clean: clean, validate: validate, retryNote: retryNote,
    parseTable: parseTable, parseOutline: parseOutline, stripFence: stripFence
  };
})(typeof window !== "undefined" ? window : globalThis);
