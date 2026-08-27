/* ══════════════════════════════════════════════════════════════════════
   VocabuSheets — 数式（§14.3 / §14.4）

   ・関数は Registry へ登録する。画面の関数一覧も、入力補助も、ここを読む。
     画面へ関数名を書き並べない（在るのに動かない、が起きないように）。
   ・エラーは Excel と同じ言い方にする（#REF! / #DIV/0! / #NAME? / #CYCLE!）。
   ・循環参照は「計算中の印」で見つける。無限ループにしない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model;
  var REG = WP.functionRegistry;
  if (!M || !REG) throw new Error("workplace/model.js must be loaded before formula.js");

  /* ── エラー ───────────────────────────────────────────────────── */
  function FErr(code) { this.code = code; }
  FErr.prototype.toString = function () { return this.code; };
  var E = {
    REF: function () { return new FErr("#REF!"); },
    DIV0: function () { return new FErr("#DIV/0!"); },
    NAME: function () { return new FErr("#NAME?"); },
    VALUE: function () { return new FErr("#VALUE!"); },
    NUM: function () { return new FErr("#NUM!"); },
    NA: function () { return new FErr("#N/A"); },
    CYCLE: function () { return new FErr("#CYCLE!"); }
  };
  function isErr(v) { return v instanceof FErr; }

  /* ── 字句解析 ─────────────────────────────────────────────────── */
  var T = { NUM: 1, STR: 2, REF: 3, RANGE: 4, FUNC: 5, OP: 6, LP: 7, RP: 8, COMMA: 9, BOOL: 10, NAME: 11 };
  var REF_RE = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})/;

  function tokenize(src) {
    var s = String(src || ""), i = 0, out = [];
    function peek() { return s.charAt(i); }
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === " " || ch === "\t") { i++; continue; }
      if (ch === '"') {
        var j = i + 1, buf = "";
        while (j < s.length) {
          if (s.charAt(j) === '"') {
            if (s.charAt(j + 1) === '"') { buf += '"'; j += 2; continue; }
            break;
          }
          buf += s.charAt(j); j++;
        }
        out.push({ t: T.STR, v: buf }); i = j + 1; continue;
      }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s.charAt(i + 1)))) {
        var m = /^[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/.exec(s.slice(i));
        out.push({ t: T.NUM, v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        var rest = s.slice(i);
        var rm = REF_RE.exec(rest);
        if (rm) {
          /* 範囲か単一か */
          var after = rest.slice(rm[0].length);
          if (after.charAt(0) === ":") {
            var rm2 = REF_RE.exec(after.slice(1));
            if (rm2) {
              out.push({ t: T.RANGE, a: (rm[1] + rm[2]).toUpperCase(), b: (rm2[1] + rm2[2]).toUpperCase() });
              i += rm[0].length + 1 + rm2[0].length; continue;
            }
          }
          /* 関数名かもしれない（SUM は REF_RE に当たらないが、A1 のような名前の関数は無い） */
          if (after.charAt(0) !== "(") {
            out.push({ t: T.REF, v: (rm[1] + rm[2]).toUpperCase() });
            i += rm[0].length; continue;
          }
        }
        var nm = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
        var name = nm[0];
        i += name.length;
        while (s.charAt(i) === " ") i++;
        if (s.charAt(i) === "(") { out.push({ t: T.FUNC, v: name.toUpperCase() }); }
        else if (/^(TRUE|FALSE)$/i.test(name)) { out.push({ t: T.BOOL, v: /^TRUE$/i.test(name) }); }
        else { out.push({ t: T.NAME, v: name.toUpperCase() }); }
        continue;
      }
      if (ch === "(") { out.push({ t: T.LP }); i++; continue; }
      if (ch === ")") { out.push({ t: T.RP }); i++; continue; }
      if (ch === "," || ch === ";") { out.push({ t: T.COMMA }); i++; continue; }
      if (ch === "<" && (s.charAt(i + 1) === "=" || s.charAt(i + 1) === ">")) {
        out.push({ t: T.OP, v: ch + s.charAt(i + 1) }); i += 2; continue;
      }
      if (ch === ">" && s.charAt(i + 1) === "=") { out.push({ t: T.OP, v: ">=" }); i += 2; continue; }
      if ("+-*/^&=<>%".indexOf(ch) >= 0) { out.push({ t: T.OP, v: ch }); i++; continue; }
      /* 読めない字はそこで打ち切る（式全体を落とさない） */
      throw new Error("PARSE");
    }
    return out;
  }

  /* ── 構文解析（優先順位つき下降）───────────────────────────────── */
  function parse(tokens) {
    var p = 0;
    function peek() { return tokens[p]; }
    function eat(t) { var tok = tokens[p]; if (!tok || tok.t !== t) throw new Error("PARSE"); p++; return tok; }

    function parseExpr() { return parseCompare(); }
    function parseCompare() {
      var left = parseConcat();
      while (peek() && peek().t === T.OP && ["=", "<>", "<", ">", "<=", ">="].indexOf(peek().v) >= 0) {
        var op = tokens[p++].v;
        left = { n: "bin", op: op, a: left, b: parseConcat() };
      }
      return left;
    }
    function parseConcat() {
      var left = parseAdd();
      while (peek() && peek().t === T.OP && peek().v === "&") {
        p++; left = { n: "bin", op: "&", a: left, b: parseAdd() };
      }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (peek() && peek().t === T.OP && (peek().v === "+" || peek().v === "-")) {
        var op = tokens[p++].v;
        left = { n: "bin", op: op, a: left, b: parseMul() };
      }
      return left;
    }
    function parseMul() {
      var left = parsePow();
      while (peek() && peek().t === T.OP && (peek().v === "*" || peek().v === "/")) {
        var op = tokens[p++].v;
        left = { n: "bin", op: op, a: left, b: parsePow() };
      }
      return left;
    }
    function parsePow() {
      var left = parseUnary();
      if (peek() && peek().t === T.OP && peek().v === "^") {
        p++; return { n: "bin", op: "^", a: left, b: parsePow() };
      }
      return left;
    }
    function parseUnary() {
      if (peek() && peek().t === T.OP && (peek().v === "-" || peek().v === "+")) {
        var op = tokens[p++].v;
        return { n: "un", op: op, a: parseUnary() };
      }
      return parsePostfix();
    }
    function parsePostfix() {
      var v = parsePrimary();
      while (peek() && peek().t === T.OP && peek().v === "%") { p++; v = { n: "pct", a: v }; }
      return v;
    }
    function parsePrimary() {
      var tok = peek();
      if (!tok) throw new Error("PARSE");
      if (tok.t === T.NUM) { p++; return { n: "num", v: tok.v }; }
      if (tok.t === T.STR) { p++; return { n: "str", v: tok.v }; }
      if (tok.t === T.BOOL) { p++; return { n: "bool", v: tok.v }; }
      if (tok.t === T.REF) { p++; return { n: "ref", v: tok.v }; }
      if (tok.t === T.RANGE) { p++; return { n: "range", a: tok.a, b: tok.b }; }
      if (tok.t === T.NAME) { p++; return { n: "name", v: tok.v }; }
      if (tok.t === T.FUNC) {
        p++; eat(T.LP);
        var args = [];
        if (peek() && peek().t !== T.RP) {
          args.push(parseExpr());
          while (peek() && peek().t === T.COMMA) { p++; args.push(parseExpr()); }
        }
        eat(T.RP);
        return { n: "call", f: tok.v, args: args };
      }
      if (tok.t === T.LP) { p++; var e = parseExpr(); eat(T.RP); return e; }
      throw new Error("PARSE");
    }
    var ast = parseExpr();
    if (p !== tokens.length) throw new Error("PARSE");
    return ast;
  }

  /* ── 値の変換 ─────────────────────────────────────────────────── */
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return isFinite(v) ? v : E.NUM();
    var s = String(v).trim().replace(/,/g, "");
    if (s === "") return 0;
    if (/%$/.test(s)) { var n0 = parseFloat(s); return isNaN(n0) ? E.VALUE() : n0 / 100; }
    var n = Number(s);
    return isNaN(n) ? E.VALUE() : n;
  }
  function toStr(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    var s = String(v || "").trim().toUpperCase();
    if (s === "TRUE") return true;
    if (s === "FALSE" || s === "") return false;
    var n = Number(s);
    return isNaN(n) ? true : n !== 0;
  }
  function isBlank(v) { return v === null || v === undefined || v === ""; }

  /* ── 評価 ─────────────────────────────────────────────────────
     ctx = { get(ref) -> value, range(a,b) -> [values], flat(a,b) -> [] } */
  function evaluate(ast, ctx) {
    switch (ast.n) {
      case "num": return ast.v;
      case "str": return ast.v;
      case "bool": return ast.v;
      case "name": return E.NAME();
      case "ref": return ctx.get(ast.v);
      case "range": return { __range: true, a: ast.a, b: ast.b, values: ctx.range(ast.a, ast.b) };
      case "pct": {
        var pv = toNum(deref(evaluate(ast.a, ctx)));
        return isErr(pv) ? pv : pv / 100;
      }
      case "un": {
        var uv = toNum(deref(evaluate(ast.a, ctx)));
        if (isErr(uv)) return uv;
        return ast.op === "-" ? -uv : uv;
      }
      case "bin": {
        var a = deref(evaluate(ast.a, ctx));
        var b = deref(evaluate(ast.b, ctx));
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        if (ast.op === "&") {
          var sa = toStr(a), sb = toStr(b);
          if (isErr(sa)) return sa; if (isErr(sb)) return sb;
          return sa + sb;
        }
        if (["=", "<>", "<", ">", "<=", ">="].indexOf(ast.op) >= 0) return compare(a, b, ast.op);
        var na = toNum(a), nb = toNum(b);
        if (isErr(na)) return na;
        if (isErr(nb)) return nb;
        if (ast.op === "+") return na + nb;
        if (ast.op === "-") return na - nb;
        if (ast.op === "*") return na * nb;
        if (ast.op === "/") return nb === 0 ? E.DIV0() : na / nb;
        if (ast.op === "^") { var r = Math.pow(na, nb); return isFinite(r) ? r : E.NUM(); }
        return E.VALUE();
      }
      case "call": {
        var def = REG.get(ast.f);
        if (!def) return E.NAME();
        var n = ast.args.length;
        if (n < def.minArgs) return E.VALUE();
        if (def.maxArgs !== undefined && def.maxArgs !== null && n > def.maxArgs) return E.VALUE();
        try { return def.evaluate(ast.args, ctx, helpers); }
        catch (e) { return isErr(e) ? e : E.VALUE(); }
      }
    }
    return E.VALUE();
  }
  /* 範囲を単一の値として使うときは先頭を取る（Excel と同じ振る舞いにはしない・単純化）。 */
  function deref(v) {
    if (v && v.__range) return v.values.length ? v.values[0] : "";
    return v;
  }
  function compare(a, b, op) {
    var x = a, y = b;
    if (typeof x === "number" || typeof y === "number") {
      var nx = toNum(x), ny = toNum(y);
      if (!isErr(nx) && !isErr(ny)) { x = nx; y = ny; }
      else { x = toStr(a).toUpperCase(); y = toStr(b).toUpperCase(); }
    } else { x = toStr(a).toUpperCase(); y = toStr(b).toUpperCase(); }
    switch (op) {
      case "=": return x === y;
      case "<>": return x !== y;
      case "<": return x < y;
      case ">": return x > y;
      case "<=": return x <= y;
      case ">=": return x >= y;
    }
    return E.VALUE();
  }

  /* 関数の実装が使う道具 */
  var helpers = {
    E: E, isErr: isErr, toNum: toNum, toStr: toStr, toBool: toBool, isBlank: isBlank,
    deref: deref, evaluate: evaluate,
    /* 引数を「並んだ値の列」へ広げる（範囲はばらす）。 */
    flatten: function (args, ctx) {
      var out = [];
      for (var i = 0; i < args.length; i++) {
        var v = evaluate(args[i], ctx);
        if (isErr(v)) throw v;
        if (v && v.__range) { for (var k = 0; k < v.values.length; k++) out.push(v.values[k]); }
        else out.push(v);
      }
      return out;
    },
    /* 数だけを集める（文字と空欄は飛ばす。Excel の SUM と同じ考え方）。 */
    numbers: function (args, ctx) {
      var vals = helpers.flatten(args, ctx), out = [];
      for (var i = 0; i < vals.length; i++) {
        var v = vals[i];
        if (isBlank(v)) continue;
        if (typeof v === "boolean") continue;
        var n = toNum(v);
        if (isErr(n)) continue;
        out.push(n);
      }
      return out;
    },
    one: function (arg, ctx) { return deref(evaluate(arg, ctx)); },
    rangeValues: function (arg, ctx) {
      var v = evaluate(arg, ctx);
      if (isErr(v)) throw v;
      if (v && v.__range) return v.values;
      return [v];
    },
    /* 条件（">=10" / "りんご" / 数値）を判定する関数へ変える。 */
    matcher: function (cond) {
      var s = toStr(cond);
      if (isErr(s)) return function () { return false; };
      var m = /^(<=|>=|<>|<|>|=)?\s*(.*)$/.exec(s.trim());
      var op = m[1] || "=", rhs = m[2];
      var rn = rhs === "" ? null : Number(String(rhs).replace(/,/g, ""));
      var isNum = rhs !== "" && !isNaN(rn);
      return function (v) {
        if (isNum) {
          var nv = toNum(v);
          if (isErr(nv)) return false;
          switch (op) {
            case "=": return nv === rn;
            case "<>": return nv !== rn;
            case "<": return nv < rn;
            case ">": return nv > rn;
            case "<=": return nv <= rn;
            case ">=": return nv >= rn;
          }
        }
        var sv = toStr(v).toUpperCase(), sr = String(rhs).toUpperCase();
        /* ワイルドカード（* と ?）に対応する。 */
        if (/[*?]/.test(sr)) {
          var re = new RegExp("^" + sr.replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
          var hit = re.test(sv);
          return op === "<>" ? !hit : hit;
        }
        switch (op) {
          case "=": return sv === sr;
          case "<>": return sv !== sr;
          case "<": return sv < sr;
          case ">": return sv > sr;
          case "<=": return sv <= sr;
          case ">=": return sv >= sr;
        }
        return false;
      };
    },
    serialToDate: function (n) { return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); },
    dateToSerial: function (d) {
      return Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
    },
    parseDate: function (v) {
      if (typeof v === "number") return helpers.serialToDate(v);
      var t = Date.parse(String(v));
      return isNaN(t) ? null : new Date(t);
    }
  };

  /* ══════════════════════════════════════════════════════════════════
     関数の登録（§14.3）。level は表示の段階（1=シンプルでも出す）。
     ══════════════════════════════════════════════════════════════════ */
  function reg(type, category, minArgs, maxArgs, desc, fn, level) {
    REG.register({ type: type, name: type, category: category, description: desc,
      minArgs: minArgs, maxArgs: maxArgs, evaluate: fn, level: level || 1 });
  }
  var C = { math: "数学", stat: "統計", logic: "論理", text: "文字列", date: "日付", lookup: "検索" };

  reg("SUM", C.math, 1, null, "合計を求めます", function (a, c, h) {
    return h.numbers(a, c).reduce(function (x, y) { return x + y; }, 0);
  });
  reg("AVERAGE", C.stat, 1, null, "平均を求めます", function (a, c, h) {
    var n = h.numbers(a, c);
    return n.length ? n.reduce(function (x, y) { return x + y; }, 0) / n.length : E.DIV0();
  });
  reg("MIN", C.stat, 1, null, "最小値", function (a, c, h) {
    var n = h.numbers(a, c); return n.length ? Math.min.apply(null, n) : 0;
  });
  reg("MAX", C.stat, 1, null, "最大値", function (a, c, h) {
    var n = h.numbers(a, c); return n.length ? Math.max.apply(null, n) : 0;
  });
  reg("COUNT", C.stat, 1, null, "数値の個数", function (a, c, h) { return h.numbers(a, c).length; });
  reg("COUNTA", C.stat, 1, null, "空欄でないものの個数", function (a, c, h) {
    return h.flatten(a, c).filter(function (v) { return !h.isBlank(v); }).length;
  });
  reg("COUNTBLANK", C.stat, 1, null, "空欄の個数", function (a, c, h) {
    return h.flatten(a, c).filter(function (v) { return h.isBlank(v); }).length;
  }, 2);
  reg("MEDIAN", C.stat, 1, null, "中央値", function (a, c, h) {
    var n = h.numbers(a, c).sort(function (x, y) { return x - y; });
    if (!n.length) return E.NUM();
    var m = Math.floor(n.length / 2);
    return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  }, 2);
  reg("STDEV", C.stat, 1, null, "標準偏差（標本）", function (a, c, h) {
    var n = h.numbers(a, c);
    if (n.length < 2) return E.DIV0();
    var mu = n.reduce(function (x, y) { return x + y; }, 0) / n.length;
    var s = n.reduce(function (x, y) { return x + (y - mu) * (y - mu); }, 0) / (n.length - 1);
    return Math.sqrt(s);
  }, 3);
  reg("PRODUCT", C.math, 1, null, "積", function (a, c, h) {
    return h.numbers(a, c).reduce(function (x, y) { return x * y; }, 1);
  }, 2);

  reg("IF", C.logic, 2, 3, "条件で分ける", function (a, c, h) {
    var cond = h.toBool(h.one(a[0], c));
    if (h.isErr(cond)) return cond;
    if (cond) return h.one(a[1], c);
    return a.length > 2 ? h.one(a[2], c) : false;
  });
  reg("IFERROR", C.logic, 2, 2, "エラーなら別の値", function (a, c, h) {
    var v = h.one(a[0], c);
    return h.isErr(v) ? h.one(a[1], c) : v;
  }, 2);
  reg("AND", C.logic, 1, null, "すべて真か", function (a, c, h) {
    var vs = h.flatten(a, c);
    for (var i = 0; i < vs.length; i++) { if (!h.toBool(vs[i])) return false; }
    return true;
  });
  reg("OR", C.logic, 1, null, "どれかが真か", function (a, c, h) {
    var vs = h.flatten(a, c);
    for (var i = 0; i < vs.length; i++) { if (h.toBool(vs[i])) return true; }
    return false;
  });
  reg("NOT", C.logic, 1, 1, "真偽を反転", function (a, c, h) { return !h.toBool(h.one(a[0], c)); });

  reg("ROUND", C.math, 1, 2, "四捨五入", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); if (h.isErr(n)) return n;
    var d = a.length > 1 ? h.toNum(h.one(a[1], c)) : 0;
    var p = Math.pow(10, d);
    return Math.round((n * p + (n >= 0 ? 1e-9 : -1e-9))) / p;
  });
  reg("ROUNDUP", C.math, 1, 2, "切り上げ", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); if (h.isErr(n)) return n;
    var p = Math.pow(10, a.length > 1 ? h.toNum(h.one(a[1], c)) : 0);
    return (n >= 0 ? Math.ceil(n * p) : Math.floor(n * p)) / p;
  });
  reg("ROUNDDOWN", C.math, 1, 2, "切り捨て", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); if (h.isErr(n)) return n;
    var p = Math.pow(10, a.length > 1 ? h.toNum(h.one(a[1], c)) : 0);
    return (n >= 0 ? Math.floor(n * p) : Math.ceil(n * p)) / p;
  });
  reg("ABS", C.math, 1, 1, "絶対値", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); return h.isErr(n) ? n : Math.abs(n);
  });
  reg("INT", C.math, 1, 1, "整数部", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); return h.isErr(n) ? n : Math.floor(n);
  }, 2);
  reg("MOD", C.math, 2, 2, "余り", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)), d = h.toNum(h.one(a[1], c));
    if (h.isErr(n)) return n; if (h.isErr(d)) return d;
    return d === 0 ? E.DIV0() : n - d * Math.floor(n / d);
  }, 2);
  reg("SQRT", C.math, 1, 1, "平方根", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)); if (h.isErr(n)) return n;
    return n < 0 ? E.NUM() : Math.sqrt(n);
  }, 2);
  reg("POWER", C.math, 2, 2, "べき乗", function (a, c, h) {
    var n = h.toNum(h.one(a[0], c)), p = h.toNum(h.one(a[1], c));
    if (h.isErr(n)) return n; if (h.isErr(p)) return p;
    var r = Math.pow(n, p); return isFinite(r) ? r : E.NUM();
  }, 3);

  reg("CONCAT", C.text, 1, null, "文字をつなぐ", function (a, c, h) {
    return h.flatten(a, c).map(function (v) { return h.toStr(v); }).join("");
  });
  reg("CONCATENATE", C.text, 1, null, "文字をつなぐ", function (a, c, h) {
    return h.flatten(a, c).map(function (v) { return h.toStr(v); }).join("");
  });
  reg("LEFT", C.text, 1, 2, "左から取り出す", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); if (h.isErr(s)) return s;
    var n = a.length > 1 ? h.toNum(h.one(a[1], c)) : 1;
    return s.slice(0, Math.max(0, n));
  });
  reg("RIGHT", C.text, 1, 2, "右から取り出す", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); if (h.isErr(s)) return s;
    var n = a.length > 1 ? h.toNum(h.one(a[1], c)) : 1;
    return n <= 0 ? "" : s.slice(-n);
  });
  reg("MID", C.text, 3, 3, "途中から取り出す", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); if (h.isErr(s)) return s;
    var st = h.toNum(h.one(a[1], c)), ln = h.toNum(h.one(a[2], c));
    return s.substr(Math.max(0, st - 1), Math.max(0, ln));
  });
  reg("LEN", C.text, 1, 1, "文字数", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); return h.isErr(s) ? s : s.length;
  });
  reg("UPPER", C.text, 1, 1, "大文字へ", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); return h.isErr(s) ? s : s.toUpperCase();
  });
  reg("LOWER", C.text, 1, 1, "小文字へ", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); return h.isErr(s) ? s : s.toLowerCase();
  });
  reg("TRIM", C.text, 1, 1, "前後の空白を取る", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)); return h.isErr(s) ? s : s.trim().replace(/\s+/g, " ");
  }, 2);
  reg("SUBSTITUTE", C.text, 3, 3, "置き換える", function (a, c, h) {
    var s = h.toStr(h.one(a[0], c)), f = h.toStr(h.one(a[1], c)), t = h.toStr(h.one(a[2], c));
    if (h.isErr(s)) return s;
    return f === "" ? s : s.split(f).join(t);
  }, 2);
  reg("TEXT", C.text, 2, 2, "書式を付けて文字に", function (a, c, h) {
    var v = h.one(a[0], c), f = h.toStr(h.one(a[1], c));
    var n = h.toNum(v);
    if (h.isErr(n)) return h.toStr(v);
    var dec = (f.split(".")[1] || "").length;
    var s = n.toFixed(dec);
    if (/#,#|,0/.test(f)) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (/%/.test(f)) s = (n * 100).toFixed(dec) + "%";
    return s;
  }, 3);

  reg("TODAY", C.date, 0, 0, "今日の日付", function (a, c, h) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    return h.dateToSerial(d);
  });
  reg("NOW", C.date, 0, 0, "現在の日時", function (a, c, h) {
    var d = new Date();
    return h.dateToSerial(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
  });
  reg("DATE", C.date, 3, 3, "年月日から日付", function (a, c, h) {
    var y = h.toNum(h.one(a[0], c)), m = h.toNum(h.one(a[1], c)), d = h.toNum(h.one(a[2], c));
    if (h.isErr(y)) return y;
    return h.dateToSerial(new Date(Date.UTC(y, m - 1, d)));
  });
  reg("YEAR", C.date, 1, 1, "年", function (a, c, h) {
    var d = h.parseDate(h.one(a[0], c)); return d ? d.getUTCFullYear() : E.VALUE();
  });
  reg("MONTH", C.date, 1, 1, "月", function (a, c, h) {
    var d = h.parseDate(h.one(a[0], c)); return d ? d.getUTCMonth() + 1 : E.VALUE();
  });
  reg("DAY", C.date, 1, 1, "日", function (a, c, h) {
    var d = h.parseDate(h.one(a[0], c)); return d ? d.getUTCDate() : E.VALUE();
  });

  reg("SUMIF", C.stat, 2, 3, "条件に合うものの合計", function (a, c, h) {
    var range = h.rangeValues(a[0], c);
    var test = h.matcher(h.one(a[1], c));
    var sumRange = a.length > 2 ? h.rangeValues(a[2], c) : range;
    var total = 0;
    for (var i = 0; i < range.length; i++) {
      if (!test(range[i])) continue;
      var n = h.toNum(sumRange[i]);
      if (!h.isErr(n)) total += n;
    }
    return total;
  });
  reg("COUNTIF", C.stat, 2, 2, "条件に合うものの個数", function (a, c, h) {
    var range = h.rangeValues(a[0], c);
    var test = h.matcher(h.one(a[1], c));
    var n = 0;
    for (var i = 0; i < range.length; i++) if (test(range[i])) n++;
    return n;
  });
  reg("AVERAGEIF", C.stat, 2, 3, "条件に合うものの平均", function (a, c, h) {
    var range = h.rangeValues(a[0], c);
    var test = h.matcher(h.one(a[1], c));
    var avgRange = a.length > 2 ? h.rangeValues(a[2], c) : range;
    var total = 0, k = 0;
    for (var i = 0; i < range.length; i++) {
      if (!test(range[i])) continue;
      var n = h.toNum(avgRange[i]);
      if (!h.isErr(n)) { total += n; k++; }
    }
    return k ? total / k : E.DIV0();
  });

  /* 検索。範囲は「行 × 列」で欲しいので、ctx.grid で取り直す。 */
  reg("VLOOKUP", C.lookup, 3, 4, "縦方向に探す", function (a, c, h) {
    var key = h.one(a[0], c);
    var g = gridOf(a[1], c, h);
    if (!g) return E.REF();
    var col = h.toNum(h.one(a[2], c));
    if (h.isErr(col)) return col;
    var approx = a.length > 3 ? h.toBool(h.one(a[3], c)) : false;
    var sk = h.toStr(key).toUpperCase();
    var best = null;
    for (var r = 0; r < g.length; r++) {
      var cell = g[r][0];
      if (approx) {
        var nk = h.toNum(key), nc = h.toNum(cell);
        if (!h.isErr(nk) && !h.isErr(nc) && nc <= nk) best = g[r];
      } else if (h.toStr(cell).toUpperCase() === sk) {
        if (col < 1 || col > g[r].length) return E.REF();
        return g[r][col - 1];
      }
    }
    if (approx && best) {
      if (col < 1 || col > best.length) return E.REF();
      return best[col - 1];
    }
    return E.NA();
  }, 3);
  reg("HLOOKUP", C.lookup, 3, 4, "横方向に探す", function (a, c, h) {
    var key = h.toStr(h.one(a[0], c)).toUpperCase();
    var g = gridOf(a[1], c, h);
    if (!g || !g.length) return E.REF();
    var rowN = h.toNum(h.one(a[2], c));
    for (var col = 0; col < g[0].length; col++) {
      if (h.toStr(g[0][col]).toUpperCase() === key) {
        if (rowN < 1 || rowN > g.length) return E.REF();
        return g[rowN - 1][col];
      }
    }
    return E.NA();
  }, 3);
  reg("INDEX", C.lookup, 2, 3, "位置で取り出す", function (a, c, h) {
    var g = gridOf(a[0], c, h);
    if (!g) return E.REF();
    var r = h.toNum(h.one(a[1], c));
    var col = a.length > 2 ? h.toNum(h.one(a[2], c)) : 1;
    if (r < 1 || r > g.length) return E.REF();
    if (col < 1 || col > g[r - 1].length) return E.REF();
    return g[r - 1][col - 1];
  }, 3);
  reg("MATCH", C.lookup, 2, 3, "位置を返す", function (a, c, h) {
    var key = h.toStr(h.one(a[0], c)).toUpperCase();
    var vals = h.rangeValues(a[1], c);
    for (var i = 0; i < vals.length; i++) if (h.toStr(vals[i]).toUpperCase() === key) return i + 1;
    return E.NA();
  }, 3);
  reg("UNIQUE", C.lookup, 1, 1, "重複を除く（先頭のみ返す）", function (a, c, h) {
    var vals = h.rangeValues(a[0], c), seen = {}, out = [];
    vals.forEach(function (v) {
      var k = h.toStr(v);
      if (h.isBlank(v) || seen[k]) return;
      seen[k] = 1; out.push(v);
    });
    return out.length ? out[0] : "";
  }, 3);

  function gridOf(arg, ctx, h) {
    if (arg.n !== "range") return null;
    return ctx.grid ? ctx.grid(arg.a, arg.b) : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     シート全体の計算
     ══════════════════════════════════════════════════════════════════ */
  var astCache = {};
  function compile(src) {
    var key = String(src);
    if (astCache[key] !== undefined) return astCache[key];
    var ast;
    try { ast = parse(tokenize(key)); }
    catch (e) { ast = null; }
    if (Object.keys(astCache).length > 2000) astCache = {};
    astCache[key] = ast;
    return ast;
  }

  /* sheet.cells は { "A1": {v: 表示値, f: "=SUM(...)"} }。
     ここで f を全部評価し、v を書き戻す。 */
  function recalc(sheet) {
    var cells = sheet.cells || {};
    var computing = {}, done = {}, errors = 0;

    function cellRaw(ref) {
      var c = cells[ref];
      if (!c) return "";
      return c;
    }
    function valueOf(ref) {
      if (done[ref] !== undefined) return done[ref];
      var c = cells[ref];
      if (!c) return "";
      if (!c.f) {
        var raw = c.v;
        if (raw === "" || raw === null || raw === undefined) return "";
        if (typeof raw === "number") return raw;
        var n = Number(String(raw).replace(/,/g, ""));
        return (String(raw).trim() !== "" && !isNaN(n)) ? n : raw;
      }
      if (computing[ref]) { done[ref] = E.CYCLE(); return done[ref]; }
      computing[ref] = true;
      var ast = compile(String(c.f).replace(/^=/, ""));
      var out;
      if (!ast) out = E.NAME();
      else out = deref(evaluate(ast, ctx));
      computing[ref] = false;
      done[ref] = out;
      return out;
    }
    function refsBetween(a, b) {
      var ca = M.colIndex(a.replace(/[0-9]+$/, "")), ra = parseInt(a.replace(/^[A-Z]+/, ""), 10);
      var cb = M.colIndex(b.replace(/[0-9]+$/, "")), rb = parseInt(b.replace(/^[A-Z]+/, ""), 10);
      if (ca < 0 || cb < 0 || !ra || !rb) return null;
      var c1 = Math.min(ca, cb), c2 = Math.max(ca, cb);
      var r1 = Math.min(ra, rb), r2 = Math.max(ra, rb);
      /* 上限を設けて暴走させない（100 万セルの範囲を数えに行かない）。 */
      if ((c2 - c1 + 1) * (r2 - r1 + 1) > 50000) return null;
      return { c1: c1, c2: c2, r1: r1, r2: r2 };
    }
    var ctx = {
      get: function (ref) { return valueOf(ref); },
      range: function (a, b) {
        var box = refsBetween(a, b);
        if (!box) return [];
        var out = [];
        for (var r = box.r1; r <= box.r2; r++)
          for (var c = box.c1; c <= box.c2; c++)
            out.push(valueOf(M.colName(c) + r));
        return out;
      },
      grid: function (a, b) {
        var box = refsBetween(a, b);
        if (!box) return null;
        var rows = [];
        for (var r = box.r1; r <= box.r2; r++) {
          var row = [];
          for (var c = box.c1; c <= box.c2; c++) row.push(valueOf(M.colName(c) + r));
          rows.push(row);
        }
        return rows;
      }
    };

    var out = {};
    Object.keys(cells).forEach(function (ref) {
      var c = cells[ref];
      if (!c) return;
      if (c.f) {
        var v = valueOf(ref);
        if (isErr(v)) errors++;
        out[ref] = isErr(v) ? v.code : v;
      } else {
        out[ref] = c.v === undefined ? "" : c.v;
      }
    });
    return { values: out, errors: errors };
  }

  /* 1 つの式だけを、いまのシートの内容で評価する（入力補助のプレビュー用）。 */
  function evalOne(sheet, src) {
    var tmp = { cells: {} };
    Object.keys(sheet.cells || {}).forEach(function (k) { tmp.cells[k] = sheet.cells[k]; });
    tmp.cells.__TMP1 = { f: String(src) };
    /* __TMP1 は参照名として不正なので、直接評価する */
    var ast = compile(String(src).replace(/^=/, ""));
    if (!ast) return { ok: false, error: "#NAME?" };
    var r = recalc(sheet);
    var ctx = {
      get: function (ref) { var v = r.values[ref]; return v === undefined ? "" : v; },
      range: function (a, b) {
        var out = [];
        var ca = M.colIndex(a.replace(/[0-9]+$/, "")), ra = parseInt(a.replace(/^[A-Z]+/, ""), 10);
        var cb = M.colIndex(b.replace(/[0-9]+$/, "")), rb = parseInt(b.replace(/^[A-Z]+/, ""), 10);
        for (var rr = Math.min(ra, rb); rr <= Math.max(ra, rb); rr++)
          for (var cc = Math.min(ca, cb); cc <= Math.max(ca, cb); cc++) {
            var v = r.values[M.colName(cc) + rr];
            out.push(v === undefined ? "" : v);
          }
        return out;
      },
      grid: function (a, b) { return null; }
    };
    var v = deref(evaluate(ast, ctx));
    return isErr(v) ? { ok: false, error: v.code } : { ok: true, value: v };
  }

  /* ══════════════════════════════════════════════════════════════════
     行・列を足したり消したりしたとき、数式の中の参照をずらす

     これが無いと、=A1*2 の左に 1 列足したとき、式はそのまま A1 を指す。
     指したかった中身は B1 へ移っているので、答えが 0 になる（実際にそうだった）。

     ・足したところより後ろの参照は、そのぶん動かす
     ・消したところを指していた参照は #REF! にする（指す先が無くなったため）
     ・$ が付いていても動かす。$ は「式を写したときに動かさない」印であって、
       行や列そのものが動いたときは、Excel でも一緒に動く。
     ・文字列の中（"A1" のような書き方）と、関数名（LOG10( など）は触らない。
     ══════════════════════════════════════════════════════════════════ */
  function shiftRefs(src, o) {
    o = o || {};
    var s = String(src || "");
    var out = "", i = 0, inStr = false;
    var rowFrom = o.rowFrom, rowDelta = o.rowDelta || 0, rowDel = o.rowDel || 0;
    var colFrom = o.colFrom, colDelta = o.colDelta || 0, colDel = o.colDel || 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (inStr) { out += ch; if (ch === '"') inStr = false; i++; continue; }
      if (ch === '"') { inStr = true; out += ch; i++; continue; }
      var prev = i > 0 ? s.charAt(i - 1) : "";
      if (!/[A-Za-z0-9_$.!]/.test(prev)) {
        var m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/.exec(s.slice(i));
        if (m && !/^\s*\(/.test(s.slice(i + m[0].length))) {
          var c = M.colIndex(m[2].toUpperCase());
          var r = parseInt(m[4], 10);
          var dead = false;
          if (rowDel && r >= rowFrom && r < rowFrom + rowDel) dead = true;
          if (colDel && c >= colFrom && c < colFrom + colDel) dead = true;
          if (dead) { out += "#REF!"; i += m[0].length; continue; }
          if (rowDelta && r >= rowFrom) r += rowDelta;
          if (colDelta && c >= colFrom) c += colDelta;
          out += m[1] + M.colName(c) + m[3] + r;
          i += m[0].length;
          continue;
        }
      }
      out += ch; i++;
    }
    return out;
  }

  WP.formula = {
    tokenize: tokenize, parse: parse, compile: compile,
    evaluate: evaluate, recalc: recalc, evalOne: evalOne,
    shiftRefs: shiftRefs,
    isErr: isErr, E: E, helpers: helpers,
    /* 画面の「関数一覧」はここを読む。登録されていない関数は出さない。 */
    list: function () { return REG.all(); },
    byCategory: function () { return REG.byCategory(); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
