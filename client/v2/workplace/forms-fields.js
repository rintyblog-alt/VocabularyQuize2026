/* ══════════════════════════════════════════════════════════════════════
   VocabuForms — 質問の形式（§16.3 / §9 Form Field Registry）

   ・1 つの形式につき「描く」「読み取る」「検証する」「集計する」を必ず揃える。
     4 つそろっていないものは登録しない＝画面にも出ない。
   ・回答画面と編集画面のプレビューは **同じ render** を使う。
     見た目が違って「編集では出るのに回答画面では出ない」を起こさない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, U = WP.ui, REG = WP.fieldRegistry;
  var esc = U.esc, icon = U.icon;

  function name(f) { return "f_" + f.id; }
  function opts(f) { return (f.options || []); }

  function reg(o) {
    REG.register(Object.assign({
      category: "基本", level: 1, analyticsSupported: true, mobileSupported: true,
      validate: function () { return ""; },
      summarize: null
    }, o));
  }

  /* ── 文字 ─────────────────────────────────────────────────────── */
  reg({
    type: "short_text", label: "短文", icon: "type", category: "文字",
    render: function (f, v) {
      return '<input class="wp-in" type="text" name="' + name(f) + '" value="' + esc(v || "")
        + '" placeholder="' + esc(f.placeholder || "") + '"'
        + (f.maxLength ? ' maxlength="' + f.maxLength + '"' : "") + " />";
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    validate: function (f, v) {
      if (f.maxLength && String(v).length > f.maxLength) return f.maxLength + " 文字までです。";
      if (f.pattern) { try { if (!new RegExp(f.pattern).test(String(v))) return f.patternMessage || "形式が正しくありません。"; } catch (e) {} }
      return "";
    },
    summarize: textSummary
  });
  reg({
    type: "long_text", label: "長文", icon: "text", category: "文字",
    render: function (f, v) {
      return '<textarea class="wp-ta" name="' + name(f) + '" placeholder="' + esc(f.placeholder || "")
        + '"' + (f.maxLength ? ' maxlength="' + f.maxLength + '"' : "") + ">" + esc(v || "") + "</textarea>";
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    summarize: textSummary
  });
  reg({
    type: "email", label: "メール", icon: "link", category: "文字",
    render: function (f, v) {
      return '<input class="wp-in" type="email" name="' + name(f) + '" value="' + esc(v || "")
        + '" placeholder="you@example.com" inputmode="email" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value.trim() : ""; },
    validate: function (f, v) {
      if (!v) return "";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? "" : "メールアドレスの形式で入力してください。";
    },
    summarize: textSummary
  });
  reg({
    type: "phone", label: "電話番号", icon: "type", category: "文字",
    render: function (f, v) {
      return '<input class="wp-in" type="tel" name="' + name(f) + '" value="' + esc(v || "")
        + '" placeholder="090-1234-5678" inputmode="tel" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value.trim() : ""; },
    validate: function (f, v) {
      if (!v) return "";
      return /^[0-9+\-() ]{6,20}$/.test(String(v)) ? "" : "数字とハイフンで入力してください。";
    },
    summarize: textSummary
  });
  reg({
    type: "url", label: "URL", icon: "link", category: "文字", level: 2,
    render: function (f, v) {
      return '<input class="wp-in" type="url" name="' + name(f) + '" value="' + esc(v || "")
        + '" placeholder="https://" inputmode="url" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value.trim() : ""; },
    validate: function (f, v) {
      if (!v) return "";
      return /^https?:\/\/.+/.test(String(v)) ? "" : "http:// または https:// から始めてください。";
    },
    summarize: textSummary
  });
  reg({
    type: "number", label: "数値", icon: "type", category: "文字",
    render: function (f, v) {
      return '<input class="wp-in" type="number" name="' + name(f) + '" value="' + esc(v === 0 ? "0" : (v || ""))
        + '"' + (f.min !== undefined && f.min !== "" ? ' min="' + f.min + '"' : "")
        + (f.max !== undefined && f.max !== "" ? ' max="' + f.max + '"' : "")
        + ' inputmode="decimal" />';
    },
    readValue: function (f, form) {
      var el = form.querySelector('[name="' + name(f) + '"]');
      if (!el || el.value === "") return "";
      return Number(el.value);
    },
    validate: function (f, v) {
      if (v === "" || v === null || v === undefined) return "";
      var n = Number(v);
      if (isNaN(n)) return "数値を入れてください。";
      if (f.min !== undefined && f.min !== "" && n < Number(f.min)) return f.min + " 以上で入れてください。";
      if (f.max !== undefined && f.max !== "" && n > Number(f.max)) return f.max + " 以下で入れてください。";
      return "";
    },
    summarize: numberSummary
  });

  /* ── 選択 ─────────────────────────────────────────────────────── */
  reg({
    type: "single_choice", label: "単一選択", icon: "check2", category: "選択",
    render: function (f, v) {
      var h = opts(f).map(function (o, i) {
        return '<label class="wpf-opt"><input type="radio" name="' + name(f) + '" value="' + i + '"'
          + (String(v) === String(i) ? " checked" : "") + " /><span>" + esc(o.text) + "</span></label>";
      }).join("");
      if (f.allowOther)
        h += '<label class="wpf-opt"><input type="radio" name="' + name(f) + '" value="other"'
          + (String(v).indexOf("other:") === 0 ? " checked" : "") + " /><span>その他</span>"
          + '<input class="wp-in" style="flex:1 1 auto" data-other="' + esc(f.id) + '" value="'
          + esc(String(v).indexOf("other:") === 0 ? String(v).slice(6) : "") + '" /></label>';
      return h;
    },
    readValue: function (f, form) {
      var el = form.querySelector('[name="' + name(f) + '"]:checked');
      if (!el) return "";
      if (el.value === "other") {
        var o = form.querySelector('[data-other="' + f.id + '"]');
        return "other:" + (o ? o.value : "");
      }
      return el.value;
    },
    summarize: choiceSummary
  });
  reg({
    type: "multi_choice", label: "複数選択", icon: "check2", category: "選択",
    render: function (f, v) {
      var arr = Array.isArray(v) ? v.map(String) : [];
      return opts(f).map(function (o, i) {
        return '<label class="wpf-opt"><input type="checkbox" name="' + name(f) + '" value="' + i + '"'
          + (arr.indexOf(String(i)) >= 0 ? " checked" : "") + " /><span>" + esc(o.text) + "</span></label>";
      }).join("");
    },
    readValue: function (f, form) {
      return Array.prototype.map.call(form.querySelectorAll('[name="' + name(f) + '"]:checked'),
        function (el) { return el.value; });
    },
    validate: function (f, v) {
      var n = Array.isArray(v) ? v.length : 0;
      if (f.minSelect && n < f.minSelect) return f.minSelect + " つ以上選んでください。";
      if (f.maxSelect && n > f.maxSelect) return f.maxSelect + " つまでです。";
      return "";
    },
    summarize: multiSummary
  });
  reg({
    type: "dropdown", label: "プルダウン", icon: "chevronD", category: "選択",
    render: function (f, v) {
      return '<select class="wp-sel" name="' + name(f) + '"><option value="">選んでください</option>'
        + opts(f).map(function (o, i) {
          return '<option value="' + i + '"' + (String(v) === String(i) ? " selected" : "") + ">"
            + esc(o.text) + "</option>";
        }).join("") + "</select>";
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    summarize: choiceSummary
  });
  reg({
    type: "checkbox", label: "チェックボックス（1つ）", icon: "check", category: "選択", level: 2,
    render: function (f, v) {
      return '<label class="wpf-opt"><input type="checkbox" name="' + name(f) + '"' + (v ? " checked" : "")
        + " /><span>" + esc(f.checkboxLabel || "はい") + "</span></label>";
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? !!el.checked : false; },
    summarize: boolSummary
  });
  reg({
    type: "image_choice", label: "画像から選ぶ", icon: "image", category: "選択", level: 2,
    render: function (f, v) {
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">'
        + opts(f).map(function (o, i) {
          return '<label style="cursor:pointer"><input type="radio" name="' + name(f) + '" value="' + i + '"'
            + (String(v) === String(i) ? " checked" : "") + ' style="position:absolute;opacity:0" />'
            + '<div style="border:2px solid ' + (String(v) === String(i) ? "var(--vq-accent)" : "var(--vq-border)")
            + ';border-radius:8px;overflow:hidden">'
            + (o.image ? '<img src="' + esc(o.image) + '" alt="' + esc(o.text) + '" style="width:100%;height:80px;object-fit:cover" />'
              : '<div style="height:80px;background:var(--vq-surface-sunken);display:grid;place-items:center;'
                + 'color:var(--vq-text-tertiary);font-size:12px">画像なし</div>')
            + '<div style="padding:6px;font:var(--vq-type-caption);text-align:center">' + esc(o.text) + "</div>"
            + "</div></label>";
        }).join("") + "</div>";
    },
    readValue: function (f, form) {
      var el = form.querySelector('[name="' + name(f) + '"]:checked');
      return el ? el.value : "";
    },
    summarize: choiceSummary
  });

  /* ── 評価 ─────────────────────────────────────────────────────── */
  reg({
    type: "scale", label: "評価スケール", icon: "chart", category: "評価",
    render: function (f, v) {
      var min = Number(f.min || 1), max = Number(f.max || 5);
      var h = '<div class="wpf-scale">';
      for (var i = min; i <= max; i++)
        h += '<button type="button" class="wpf-scale__b' + (String(v) === String(i) ? " is-on" : "")
          + '" data-pick="' + name(f) + '" data-v="' + i + '" aria-pressed="'
          + (String(v) === String(i) ? "true" : "false") + '">' + i + "</button>";
      h += '</div><input type="hidden" name="' + name(f) + '" value="' + esc(v === 0 ? "0" : (v || "")) + '" />';
      if (f.minLabel || f.maxLabel)
        h += '<div style="display:flex;justify-content:space-between;font:var(--vq-type-caption);'
          + 'color:var(--vq-text-tertiary);margin-top:6px"><span>' + esc(f.minLabel || "")
          + "</span><span>" + esc(f.maxLabel || "") + "</span></div>";
      return h;
    },
    readValue: function (f, form) {
      var el = form.querySelector('input[type="hidden"][name="' + name(f) + '"]');
      return el && el.value !== "" ? Number(el.value) : "";
    },
    summarize: numberSummary
  });
  reg({
    type: "star", label: "星評価", icon: "star", category: "評価",
    render: function (f, v) {
      var max = Number(f.max || 5), n = Number(v) || 0;
      var h = '<div class="wpf-star">';
      for (var i = 1; i <= max; i++)
        h += '<button type="button" class="wpf-star__b' + (i <= n ? " is-on" : "") + '" data-pick="'
          + name(f) + '" data-v="' + i + '" aria-label="' + i + ' つ星">' + U.iconFill("star") + "</button>";
      return h + '</div><input type="hidden" name="' + name(f) + '" value="' + (n || "") + '" />';
    },
    readValue: function (f, form) {
      var el = form.querySelector('input[type="hidden"][name="' + name(f) + '"]');
      return el && el.value !== "" ? Number(el.value) : "";
    },
    summarize: numberSummary
  });
  reg({
    type: "emoji", label: "絵文字で評価", icon: "star", category: "評価", level: 2,
    render: function (f, v) {
      var faces = ["とても悪い", "悪い", "ふつう", "良い", "とても良い"];
      var h = '<div class="wpf-scale">';
      faces.forEach(function (t, i) {
        h += '<button type="button" class="wpf-scale__b' + (String(v) === String(i + 1) ? " is-on" : "")
          + '" data-pick="' + name(f) + '" data-v="' + (i + 1) + '" style="min-width:auto;padding:0 12px">'
          + esc(t) + "</button>";
      });
      return h + '</div><input type="hidden" name="' + name(f) + '" value="' + esc(v || "") + '" />';
    },
    readValue: function (f, form) {
      var el = form.querySelector('input[type="hidden"][name="' + name(f) + '"]');
      return el && el.value !== "" ? Number(el.value) : "";
    },
    summarize: numberSummary
  });
  reg({
    type: "nps", label: "NPS（0〜10）", icon: "chart", category: "評価",
    render: function (f, v) {
      var h = '<div class="wpf-scale">';
      for (var i = 0; i <= 10; i++)
        h += '<button type="button" class="wpf-scale__b' + (String(v) === String(i) ? " is-on" : "")
          + '" data-pick="' + name(f) + '" data-v="' + i + '" style="min-width:38px">' + i + "</button>";
      return h + '</div><div style="display:flex;justify-content:space-between;font:var(--vq-type-caption);'
        + 'color:var(--vq-text-tertiary);margin-top:6px"><span>すすめない</span><span>強くすすめる</span></div>'
        + '<input type="hidden" name="' + name(f) + '" value="' + esc(v === 0 ? "0" : (v || "")) + '" />';
    },
    readValue: function (f, form) {
      var el = form.querySelector('input[type="hidden"][name="' + name(f) + '"]');
      return el && el.value !== "" ? Number(el.value) : "";
    },
    summarize: function (f, values) {
      var nums = values.map(Number).filter(function (n) { return !isNaN(n); });
      if (!nums.length) return { kind: "empty" };
      var prom = nums.filter(function (n) { return n >= 9; }).length;
      var det = nums.filter(function (n) { return n <= 6; }).length;
      var nps = Math.round(((prom - det) / nums.length) * 100);
      return { kind: "nps", n: nums.length, nps: nps,
        chart: { type: "bar", labels: ["批判者 0-6", "中立 7-8", "推奨者 9-10"],
          series: [{ name: "人数", values: [det, nums.length - det - prom, prom] }] },
        note: "NPS = " + nps };
    }
  });

  /* ── 日付・時刻 ───────────────────────────────────────────────── */
  reg({
    type: "date", label: "日付", icon: "clock", category: "日時",
    render: function (f, v) {
      return '<input class="wp-in" type="date" name="' + name(f) + '" value="' + esc(v || "") + '" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    summarize: choiceLikeSummary
  });
  reg({
    type: "time", label: "時刻", icon: "clock", category: "日時",
    render: function (f, v) {
      return '<input class="wp-in" type="time" name="' + name(f) + '" value="' + esc(v || "") + '" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    summarize: choiceLikeSummary
  });
  reg({
    type: "datetime", label: "日時", icon: "clock", category: "日時", level: 2,
    render: function (f, v) {
      return '<input class="wp-in" type="datetime-local" name="' + name(f) + '" value="' + esc(v || "") + '" />';
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? el.value : ""; },
    summarize: choiceLikeSummary
  });

  /* ── 表・並べ替え ─────────────────────────────────────────────── */
  reg({
    type: "matrix", label: "マトリクス（単一）", icon: "table", category: "表", level: 2,
    render: function (f, v) {
      var rows = f.rows || [], cols = f.cols || [];
      var val = v && typeof v === "object" ? v : {};
      /* PC は表、モバイルは 1 行ずつのカード。同じ name を使うので読み取りは共通。 */
      var t = '<div class="wpf-mxwrap"><table class="wpf-mx"><thead><tr><th scope="col"></th>'
        + cols.map(function (c) { return '<th scope="col">' + esc(c) + "</th>"; }).join("")
        + "</tr></thead><tbody>"
        + rows.map(function (r, ri) {
          return "<tr><th scope=\"row\">" + esc(r) + "</th>"
            + cols.map(function (c, ci) {
              return '<td><input type="radio" name="' + name(f) + "_" + ri + '" value="' + ci + '"'
                + (String(val[ri]) === String(ci) ? " checked" : "") + ' aria-label="' + esc(r + " " + c) + '" /></td>';
            }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
      var m = '<div class="wpf-mxm">' + rows.map(function (r, ri) {
        return '<div style="margin-bottom:10px"><div class="wpf-card__q" style="font-size:15px">' + esc(r) + "</div>"
          + cols.map(function (c, ci) {
            return '<label class="wpf-opt"><input type="radio" name="' + name(f) + "_m" + ri + '" value="' + ci + '"'
              + (String(val[ri]) === String(ci) ? " checked" : "") + " /><span>" + esc(c) + "</span></label>";
          }).join("") + "</div>";
      }).join("") + "</div>";
      return t + m;
    },
    readValue: function (f, form) {
      var out = {};
      (f.rows || []).forEach(function (r, ri) {
        var el = form.querySelector('[name="' + name(f) + "_" + ri + '"]:checked')
          || form.querySelector('[name="' + name(f) + "_m" + ri + '"]:checked');
        if (el) out[ri] = el.value;
      });
      return out;
    },
    validate: function (f, v) {
      if (!f.required) return "";
      var n = v && typeof v === "object" ? Object.keys(v).length : 0;
      return n < (f.rows || []).length ? "すべての行にお答えください。" : "";
    },
    summarize: function (f, values) {
      var rows = f.rows || [], cols = f.cols || [];
      var series = cols.map(function (c, ci) {
        return { name: c, values: rows.map(function (r, ri) {
          return values.filter(function (v) { return v && String(v[ri]) === String(ci); }).length;
        }) };
      });
      return { kind: "matrix", n: values.length,
        chart: { type: "bar", labels: rows, series: series } };
    }
  });
  reg({
    type: "matrix_multi", label: "マトリクス（複数）", icon: "table", category: "表", level: 3,
    render: function (f, v) {
      var rows = f.rows || [], cols = f.cols || [];
      var val = v && typeof v === "object" ? v : {};
      return '<div class="wpf-mxwrap"><table class="wpf-mx"><thead><tr><th scope="col"></th>'
        + cols.map(function (c) { return '<th scope="col">' + esc(c) + "</th>"; }).join("")
        + "</tr></thead><tbody>"
        + rows.map(function (r, ri) {
          var picked = Array.isArray(val[ri]) ? val[ri].map(String) : [];
          return "<tr><th scope=\"row\">" + esc(r) + "</th>"
            + cols.map(function (c, ci) {
              return '<td><input type="checkbox" name="' + name(f) + "_" + ri + '" value="' + ci + '"'
                + (picked.indexOf(String(ci)) >= 0 ? " checked" : "") + ' aria-label="' + esc(r + " " + c) + '" /></td>';
            }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    },
    readValue: function (f, form) {
      var out = {};
      (f.rows || []).forEach(function (r, ri) {
        out[ri] = Array.prototype.map.call(form.querySelectorAll('[name="' + name(f) + "_" + ri + '"]:checked'),
          function (el) { return el.value; });
      });
      return out;
    },
    summarize: function (f, values) {
      var rows = f.rows || [], cols = f.cols || [];
      return { kind: "matrix", n: values.length,
        chart: { type: "bar", labels: rows,
          series: cols.map(function (c, ci) {
            return { name: c, values: rows.map(function (r, ri) {
              return values.filter(function (v) {
                return v && Array.isArray(v[ri]) && v[ri].map(String).indexOf(String(ci)) >= 0; }).length;
            }) };
          }) } };
    }
  });
  reg({
    type: "ranking", label: "並べ替え（順位）", icon: "sort", category: "表", level: 2,
    render: function (f, v) {
      var order = Array.isArray(v) && v.length === opts(f).length ? v : opts(f).map(function (o, i) { return i; });
      return '<div data-rank="' + esc(f.id) + '">' + order.map(function (oi, pos) {
        var o = opts(f)[oi];
        if (!o) return "";
        return '<div class="wpf-opt" style="justify-content:space-between" data-oi="' + oi + '">'
          + "<span>" + (pos + 1) + ". " + esc(o.text) + "</span>"
          + '<span><button type="button" class="wp-btn is-icon" data-rk="up" aria-label="上へ">'
          + icon("chevronD") + "</button>"
          + '<button type="button" class="wp-btn is-icon" data-rk="down" aria-label="下へ">'
          + icon("chevronD") + "</button></span></div>";
      }).join("") + '</div><input type="hidden" name="' + name(f) + '" value="' + esc(order.join(",")) + '" />';
    },
    readValue: function (f, form) {
      var el = form.querySelector('input[type="hidden"][name="' + name(f) + '"]');
      if (!el || !el.value) return [];
      return el.value.split(",").map(Number);
    },
    summarize: function (f, values) {
      var o = opts(f);
      var scores = o.map(function () { return 0; });
      values.forEach(function (v) {
        if (!Array.isArray(v)) return;
        v.forEach(function (oi, pos) { if (scores[oi] !== undefined) scores[oi] += (o.length - pos); });
      });
      return { kind: "chart", n: values.length,
        chart: { type: "hbar", labels: o.map(function (x) { return x.text; }),
          series: [{ name: "得点（1位ほど高い）", values: scores }] } };
    }
  });

  /* ── その他 ───────────────────────────────────────────────────── */
  reg({
    type: "consent", label: "同意の確認", icon: "shield", category: "その他",
    render: function (f, v) {
      return '<label class="wpf-opt"><input type="checkbox" name="' + name(f) + '"' + (v ? " checked" : "")
        + " /><span>" + esc(f.label || "同意します") + "</span></label>";
    },
    readValue: function (f, form) { var el = form.querySelector('[name="' + name(f) + '"]'); return el ? !!el.checked : false; },
    validate: function (f, v) { return f.required && !v ? "同意が必要です。" : ""; },
    summarize: boolSummary
  });
  reg({
    type: "file", label: "ファイル添付", icon: "upload", category: "その他", level: 2,
    render: function (f, v) {
      return '<input class="wp-in" type="file" name="' + name(f) + '"'
        + (f.accept ? ' accept="' + esc(f.accept) + '"' : "") + " />"
        + '<div class="wp-lab" style="margin-top:5px">'
        + (f.maxSizeMb ? f.maxSizeMb + "MB まで。" : "2MB まで。")
        + "ファイルは名前と大きさだけを記録します（中身は保存しません）。</div>";
    },
    readValue: function (f, form) {
      var el = form.querySelector('[name="' + name(f) + '"]');
      var file = el && el.files && el.files[0];
      if (!file) return "";
      return { name: file.name, size: file.size, type: file.type };
    },
    validate: function (f, v) {
      if (!v || typeof v !== "object") return "";
      var max = (Number(f.maxSizeMb) || 2) * 1024 * 1024;
      if (v.size > max) return "ファイルが大きすぎます（" + (Number(f.maxSizeMb) || 2) + "MB まで）。";
      if (f.accept) {
        var ok = String(f.accept).split(",").some(function (a) {
          a = a.trim();
          if (a.charAt(0) === ".") return new RegExp(a.replace(".", "\\.") + "$", "i").test(v.name);
          return String(v.type || "").indexOf(a.replace("/*", "")) === 0;
        });
        if (!ok) return "この種類のファイルは受け付けていません。";
      }
      return "";
    },
    summarize: function (f, values) {
      return { kind: "list", n: values.length,
        items: values.map(function (v) { return v && v.name ? v.name : "（不明）"; }).slice(0, 50) };
    }
  });

  /* ── 飾り（回答を持たない）───────────────────────────────────── */
  reg({
    type: "description", label: "説明文", icon: "info", category: "飾り",
    render: function (f) {
      return '<div style="font:var(--vq-type-body-sm);color:var(--vq-text-secondary);line-height:1.8;white-space:pre-wrap">'
        + esc(f.text || "") + "</div>";
    },
    readValue: function () { return undefined; },
    analyticsSupported: false
  });
  reg({
    type: "image_block", label: "画像を置く", icon: "image", category: "飾り",
    render: function (f) {
      return f.src ? '<img src="' + esc(f.src) + '" alt="' + esc(f.alt || "")
        + '" style="max-width:100%;border-radius:8px" />'
        : '<div style="height:100px;background:var(--vq-surface-sunken);border-radius:8px;display:grid;'
          + 'place-items:center;color:var(--vq-text-tertiary);font-size:13px">画像が未設定です</div>';
    },
    readValue: function () { return undefined; },
    analyticsSupported: false
  });
  reg({
    type: "divider", label: "区切り", icon: "minus", category: "飾り",
    render: function () { return "<hr style='border:0;border-top:1px solid var(--vq-border)' />"; },
    readValue: function () { return undefined; },
    analyticsSupported: false
  });

  /* ── 集計の共通処理 ───────────────────────────────────────────── */
  function textSummary(f, values) {
    var list = values.map(function (v) { return String(v === undefined ? "" : v).trim(); })
      .filter(function (s) { return s !== ""; });
    return { kind: "text", n: list.length, items: list.slice(0, 200),
      avgLen: list.length ? Math.round(list.reduce(function (a, b) { return a + b.length; }, 0) / list.length) : 0 };
  }
  function numberSummary(f, values) {
    var nums = values.map(Number).filter(function (n) { return !isNaN(n); });
    if (!nums.length) return { kind: "empty" };
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    var counts = {};
    nums.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; });
    var labels = Object.keys(counts).sort(function (a, b) { return Number(a) - Number(b); });
    return { kind: "number", n: nums.length,
      avg: Math.round((sum / nums.length) * 100) / 100,
      median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
      min: sorted[0], max: sorted[sorted.length - 1],
      chart: { type: "bar", labels: labels,
        series: [{ name: "人数", values: labels.map(function (l) { return counts[l]; }) }] } };
  }
  function choiceSummary(f, values) {
    var o = opts(f);
    var counts = o.map(function () { return 0; });
    var other = 0;
    values.forEach(function (v) {
      var s = String(v);
      if (s.indexOf("other:") === 0) { other++; return; }
      var i = Number(s);
      if (!isNaN(i) && counts[i] !== undefined) counts[i]++;
    });
    var labels = o.map(function (x) { return x.text; });
    if (other) { labels = labels.concat(["その他"]); counts = counts.concat([other]); }
    return { kind: "chart", n: values.length,
      chart: { type: "pie", labels: labels, series: [{ name: "人数", values: counts }] },
      table: labels.map(function (l, i) {
        return { label: l, count: counts[i],
          pct: values.length ? Math.round((counts[i] / values.length) * 100) : 0 };
      }) };
  }
  function multiSummary(f, values) {
    var o = opts(f);
    var counts = o.map(function () { return 0; });
    values.forEach(function (v) {
      (Array.isArray(v) ? v : []).forEach(function (i) {
        var k = Number(i);
        if (counts[k] !== undefined) counts[k]++;
      });
    });
    return { kind: "chart", n: values.length,
      chart: { type: "hbar", labels: o.map(function (x) { return x.text; }),
        series: [{ name: "人数", values: counts }] },
      table: o.map(function (x, i) {
        return { label: x.text, count: counts[i],
          pct: values.length ? Math.round((counts[i] / values.length) * 100) : 0 };
      }) };
  }
  function boolSummary(f, values) {
    var yes = values.filter(function (v) { return !!v; }).length;
    return { kind: "chart", n: values.length,
      chart: { type: "pie", labels: ["はい", "いいえ"],
        series: [{ name: "人数", values: [yes, values.length - yes] }] } };
  }
  function choiceLikeSummary(f, values) {
    var counts = {};
    values.forEach(function (v) {
      var s = String(v || "");
      if (!s) return;
      counts[s] = (counts[s] || 0) + 1;
    });
    var labels = Object.keys(counts).sort();
    return { kind: "chart", n: values.length,
      chart: { type: "bar", labels: labels,
        series: [{ name: "件数", values: labels.map(function (l) { return counts[l]; }) }] } };
  }

  /* 正解つき（採点モード）の判定。§16.12 のとおり、
     通常のフォームには正解の考えを持ち込まない。graded が ON のときだけ使う。 */
  function grade(f, v) {
    if (f.answer === undefined || f.answer === null || f.answer === "") return null;
    var correct = false;
    if (f.type === "multi_choice") {
      var want = String(f.answer).split(",").map(function (s) { return s.trim(); }).sort().join(",");
      var got = (Array.isArray(v) ? v : []).map(String).sort().join(",");
      correct = want === got;
    } else if (["single_choice", "dropdown", "image_choice"].indexOf(f.type) >= 0) {
      correct = String(v) === String(f.answer);
    } else {
      correct = String(v || "").trim().toLowerCase() === String(f.answer).trim().toLowerCase();
    }
    return { correct: correct, points: correct ? (Number(f.points) || 0) : 0,
      max: Number(f.points) || 0, feedback: f.feedback || "" };
  }

  WP.formFields = {
    all: function () { return REG.all(); },
    get: function (t) { return REG.get(t); },
    byCategory: function () { return REG.byCategory(); },
    isDecoration: M.isDecoration,
    grade: grade,
    name: name
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
