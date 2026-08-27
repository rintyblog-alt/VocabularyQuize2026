/* ══════════════════════════════════════════════════════════════════════
   VocabuForms — 編集・公開・回答結果（§16）
   ・編集画面だけで終わらせない。公開 URL・回答の受け取り・集計まで通す。
   ・回答者に編集権限は無い。公開 URL と編集 URL は別（§22）。
   ・通常のフォームへ「正解」を勝手に持ち込まない。採点は graded を入れたときだけ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, FF = WP.formFields, CH = WP.chart;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  function open(o) {
    o = o || {};
    var item = o.item, content = o.content;
    var body = content.content;
    if (!body.sections || !body.sections.length)
      body.sections = [{ id: M.uid("s"), title: "", description: "", fields: [] }];
    if (!body.settings) body.settings = M.emptyBody("form").settings;
    if (!body.theme) body.theme = M.emptyBody("form").theme;
    if (!body.logic) body.logic = [];

    var session = ST.session(item, content, { intervalMs: ST.prefs().autosaveMs,
      autosave: ST.prefs().autosave });
    var shell = new U.EditorShell({ session: session, onClose: o.onClose,
      onRestore: function () { body = session.content.content; selF = null; paint(); },
      onAi: function () { aiForms(); },
      onModeChange: function () { paint(); },
      moreItems: [
        { label: "公開の設定", icon: "globe", run: publishSheet },
        { label: "回答を CSV で書き出し", icon: "download", run: exportCsv },
        { label: "回答を Sheets へ送る", icon: "table", run: toSheets }
      ] });

    var api = VQ2.ui.mount("vq-wp-forms", { title: item.title, css: WP.CSS || "",
      onBeforeClose: function () { shell.tryClose(); return false; } });

    var tab = o.startTab || "edit";     /* edit | preview | responses */
    var selF = null, responses = null, loadingR = false, preview = {};

    paint();
    shell.bindHeader(api.root, api);
    bind();
    registerCommands();
    if (tab === "responses") loadResponses();

    function allFields() {
      var out = [];
      body.sections.forEach(function (s) { s.fields.forEach(function (f) { out.push(f); }); });
      return out;
    }
    function questionCount() {
      return allFields().filter(function (f) { return !FF.isDecoration(f.type); }).length;
    }
    function findField(id) {
      for (var i = 0; i < body.sections.length; i++) {
        var fs = body.sections[i].fields;
        for (var k = 0; k < fs.length; k++) if (fs[k].id === id) return { sec: i, idx: k, f: fs[k] };
      }
      return null;
    }

    function paint() {
      api.root.innerHTML = '<div class="wp">' + shell.headerHtml() + tabsBar()
        + '<div class="wp-body">'
        + '<div class="wp-main">' + (tab === "edit" ? editView() : (tab === "preview" ? previewView() : respView())) + "</div>"
        + (tab === "edit" && selF && !VQ2.ui.isMobile() ? '<aside class="wp-right">' + fieldPanel() + "</aside>" : "")
        + "</div>" + mobileBar() + "</div>";
      shell.host = api.root;
      shell.syncUndoButtons();
    }
    function tabsBar() {
      return '<div class="wp-tools">'
        + btn({ icon: "pencil", label: "編集", act: "tab", val: "edit", on: tab === "edit" })
        + btn({ icon: "eye", label: "プレビュー", act: "tab", val: "preview", on: tab === "preview" })
        + btn({ icon: "chart", label: "回答結果", act: "tab", val: "responses", on: tab === "responses" })
        + '<span class="wp-sep"></span>'
        + btn({ icon: "palette", label: "テーマ", act: "theme" })
        + btn({ icon: "settings", label: "設定", act: "settings" })
        + btn({ icon: "sparkle", label: "AI", act: "ai" })
        + '<span class="wp-top__sp"></span>'
        + '<span class="wp-chip">' + questionCount() + " 問</span>"
        + (item.visibility !== "private" ? U.chip("公開中", "ok") : U.chip("非公開", ""))
        + btn({ icon: "globe", label: "公開", act: "publish", variant: "primary" })
        + "</div>";
    }
    function mobileBar() {
      return '<div class="wp-mbar">'
        + btn({ icon: "pencil", iconOnly: true, label: "編集", act: "tab", val: "edit", on: tab === "edit" })
        + btn({ icon: "eye", iconOnly: true, label: "プレビュー", act: "tab", val: "preview", on: tab === "preview" })
        + btn({ icon: "chart", iconOnly: true, label: "回答結果", act: "tab", val: "responses", on: tab === "responses" })
        + btn({ icon: "plus", iconOnly: true, label: "質問を追加", act: "add-sheet" })
        + btn({ icon: "palette", iconOnly: true, label: "テーマ", act: "theme" })
        + btn({ icon: "settings", iconOnly: true, label: "設定", act: "settings" })
        + btn({ icon: "globe", iconOnly: true, label: "公開", act: "publish" })
        + "</div>";
    }

    /* ── 編集 ─────────────────────────────────────────────────── */
    function editView() {
      var th = body.theme;
      var h = '<div class="wpf-wrap">'
        + '<div class="wpf-banner" style="background:' + esc(item.appearance.bannerValue || th.accent) + '"></div>'
        + '<div class="wpf-card">'
        + '<input class="wp-in" style="font:var(--vq-type-heading-md);border:0;padding:4px 0" value="'
        + esc(item.title) + '" data-act="title2" aria-label="フォームの題名" />'
        + '<textarea class="wp-ta" style="border:0;padding:4px 0;min-height:44px" data-act="desc" '
        + 'placeholder="説明（省略できます）">' + esc(item.description || "") + "</textarea></div>";
      body.sections.forEach(function (s, si) {
        if (body.sections.length > 1 || s.title)
          h += '<div class="wpf-card" style="background:var(--vq-accent-subtle)">'
            + '<div class="wp-inline"><input class="wp-in" value="' + esc(s.title)
            + '" data-act="sec-title" data-si="' + si + '" placeholder="セクション ' + (si + 1) + ' の名前" />'
            + btn({ icon: "trash", iconOnly: true, label: "セクションを削除", act: "sec-del", val: si })
            + "</div></div>";
        s.fields.forEach(function (f, fi) {
          h += fieldCard(f, si, fi);
        });
        h += '<div class="wpf-card" style="border-style:dashed;text-align:center">'
          + btn({ icon: "plus", label: "質問を追加", act: "add-sheet", val: si, variant: "outline" })
          + "</div>";
      });
      h += '<div class="wp-inline" style="margin-top:14px;flex-wrap:wrap">'
        + btn({ icon: "plus", label: "セクションを追加", act: "sec-add", variant: "outline" })
        + btn({ icon: "sort", label: "分岐の設定", act: "logic", variant: "outline" })
        + "</div>";
      return h + "</div>";
    }
    function fieldCard(f, si, fi) {
      var d = FF.get(f.type);
      if (!d) return "";
      var qnum = "";
      if (body.settings.showQuestionNumber && !FF.isDecoration(f.type)) {
        var n = 0, done = false;
        body.sections.some(function (s2, i2) {
          return s2.fields.some(function (f2) {
            if (FF.isDecoration(f2.type)) return false;
            n++;
            if (f2.id === f.id) { done = true; return true; }
            return false;
          }) && done;
        });
        qnum = n + ". ";
      }
      return '<div class="wpf-card' + (selF === f.id ? " is-sel" : "") + '" data-fid="' + esc(f.id) + '">'
        + '<div class="wp-inline" style="justify-content:space-between;margin-bottom:6px">'
        + '<span class="wp-chip">' + icon(d.icon) + esc(d.label) + "</span>"
        + "<span>"
        + btn({ icon: "chevronU", iconOnly: true, label: "上へ", act: "f-move", val: "up" })
        + btn({ icon: "chevronD", iconOnly: true, label: "下へ", act: "f-move", val: "down" })
        + btn({ icon: "copy", iconOnly: true, label: "複製", act: "f-dup" })
        + btn({ icon: "trash", iconOnly: true, label: "削除", act: "f-del" })
        + "</span></div>"
        + (FF.isDecoration(f.type) ? ""
          : '<input class="wp-in" style="font-weight:600;margin-bottom:6px" value="' + esc(f.label)
            + '" data-act="f-label" placeholder="' + esc(qnum) + '質問文" aria-label="質問文" />')
        + (f.description ? '<div class="wpf-card__d">' + esc(f.description) + "</div>" : "")
        + '<div style="pointer-events:none;opacity:.92">' + d.render(f, undefined) + "</div>"
        + (f.required ? '<div class="wp-lab" style="margin-top:6px">必須</div>' : "")
        + "</div>";
    }
    function fieldPanel() {
      var found = findField(selF);
      if (!found) return "";
      var f = found.f, d = FF.get(f.type);
      var h = '<div class="wp-panel__h">' + esc(d.label) + " の設定</div><div style=\"padding:0 14px 20px\">";
      if (!FF.isDecoration(f.type)) {
        h += '<div class="wp-row"><label class="wp-lab" for="fq">質問文</label>'
          + '<input class="wp-in" id="fq" value="' + esc(f.label) + '" data-act="f-label" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="fd">説明</label>'
          + '<input class="wp-in" id="fd" value="' + esc(f.description || "") + '" data-act="f-desc" /></div>'
          + '<label class="wp-switch"><input type="checkbox" data-act="f-req"' + (f.required ? " checked" : "")
          + " />必須にする</label>";
      }
      if (f.type === "description")
        h += '<div class="wp-row"><label class="wp-lab" for="ftx">本文</label>'
          + '<textarea class="wp-ta" id="ftx" data-act="f-text">' + esc(f.text || "") + "</textarea></div>";
      if (f.type === "image_block")
        h += btn({ icon: "image", label: "画像を選ぶ", act: "f-img", variant: "outline", cls: "is-lg" });
      if (["single_choice", "multi_choice", "dropdown", "image_choice", "ranking"].indexOf(f.type) >= 0) {
        h += '<div class="wp-lab" style="margin-top:12px">選択肢</div>'
          + (f.options || []).map(function (op, i) {
            return '<div class="wp-inline" style="margin-bottom:5px">'
              + '<input class="wp-in" value="' + esc(op.text) + '" data-act="opt" data-i="' + i + '" />'
              + btn({ icon: "x", iconOnly: true, label: "削除", act: "opt-del", val: i }) + "</div>";
          }).join("")
          + btn({ icon: "plus", label: "選択肢を追加", act: "opt-add", variant: "outline" });
        if (["single_choice", "multi_choice"].indexOf(f.type) >= 0)
          h += '<label class="wp-switch"><input type="checkbox" data-act="f-other"'
            + (f.allowOther ? " checked" : "") + " />「その他」を入れる</label>";
      }
      if (["matrix", "matrix_multi"].indexOf(f.type) >= 0) {
        h += '<div class="wp-row" style="margin-top:12px"><label class="wp-lab" for="fr">行（1行に1つ）</label>'
          + '<textarea class="wp-ta" id="fr" data-act="f-rows">' + esc((f.rows || []).join("\n")) + "</textarea></div>"
          + '<div class="wp-row"><label class="wp-lab" for="fc">列（1行に1つ）</label>'
          + '<textarea class="wp-ta" id="fc" data-act="f-cols">' + esc((f.cols || []).join("\n")) + "</textarea></div>";
      }
      if (["scale", "star", "number", "nps"].indexOf(f.type) >= 0 && f.type !== "nps") {
        h += '<div class="wp-inline" style="margin-top:10px">'
          + '<div style="flex:1"><label class="wp-lab" for="fmin">最小</label>'
          + '<input class="wp-in" id="fmin" type="number" value="' + (f.min === undefined ? (f.type === "number" ? "" : 1) : f.min)
          + '" data-act="f-min" /></div>'
          + '<div style="flex:1"><label class="wp-lab" for="fmax">最大</label>'
          + '<input class="wp-in" id="fmax" type="number" value="' + (f.max === undefined ? (f.type === "number" ? "" : 5) : f.max)
          + '" data-act="f-max" /></div></div>';
      }
      if (f.type === "scale")
        h += '<div class="wp-inline" style="margin-top:8px">'
          + '<input class="wp-in" placeholder="左のラベル" value="' + esc(f.minLabel || "") + '" data-act="f-minlab" />'
          + '<input class="wp-in" placeholder="右のラベル" value="' + esc(f.maxLabel || "") + '" data-act="f-maxlab" /></div>';
      if (["short_text", "long_text"].indexOf(f.type) >= 0)
        h += '<div class="wp-row" style="margin-top:10px"><label class="wp-lab" for="fp">プレースホルダー</label>'
          + '<input class="wp-in" id="fp" value="' + esc(f.placeholder || "") + '" data-act="f-ph" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="fml">文字数の上限</label>'
          + '<input class="wp-in" id="fml" type="number" value="' + (f.maxLength || "") + '" data-act="f-maxlen" /></div>';
      if (f.type === "file")
        h += '<div class="wp-row" style="margin-top:10px"><label class="wp-lab" for="fac">受け付ける種類</label>'
          + '<input class="wp-in" id="fac" value="' + esc(f.accept || "") + '" data-act="f-accept" placeholder=".pdf,image/*" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="fsz">大きさの上限（MB）</label>'
          + '<input class="wp-in" id="fsz" type="number" value="' + (f.maxSizeMb || 2) + '" data-act="f-size" /></div>';
      /* 採点モードのときだけ、正解と配点を出す（§16.12）。 */
      if (body.settings.graded && !FF.isDecoration(f.type)) {
        h += '<div class="wp-lab" style="margin-top:14px">採点</div>'
          + '<div class="wp-row"><label class="wp-lab" for="fa">正解'
          + (["single_choice", "dropdown", "image_choice"].indexOf(f.type) >= 0 ? "（選択肢の番号・0 から）" : "")
          + "</label>"
          + '<input class="wp-in" id="fa" value="' + esc(f.answer === undefined ? "" : f.answer) + '" data-act="f-ans" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="fpt">配点</label>'
          + '<input class="wp-in" id="fpt" type="number" value="' + (f.points || 0) + '" data-act="f-pts" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="ffb">解説</label>'
          + '<input class="wp-in" id="ffb" value="' + esc(f.feedback || "") + '" data-act="f-fb" /></div>';
      }
      h += btn({ label: "閉じる", act: "unsel", variant: "outline", cls: "is-lg" }) + "</div>";
      return h;
    }

    /* ── プレビュー（回答画面と同じ描き方）─────────────────────── */
    function previewView() {
      return '<div class="wpf-wrap">'
        + '<div class="wp-ai__scope">これは<b>見た目の確認</b>です。ここから送っても記録されません。'
        + "実際の回答は公開 URL から行います。</div>"
        + WP.formsRender.html({ form: { title: item.title, description: item.description,
          appearance: item.appearance, sections: body.sections, theme: body.theme, settings: body.settings },
          values: preview, mode: "preview" })
        + "</div>";
    }

    /* ── 回答結果（§16.9）──────────────────────────────────────── */
    function respView() {
      if (!item.publicId)
        return '<div class="wp-empty"><div class="wp-empty__i">' + icon("globe") + "</div>"
          + '<div class="wp-empty__t">まだ公開していません</div>'
          + '<div class="wp-empty__d">公開すると回答用の URL が発行され、集まった回答がここに出ます。</div>'
          + btn({ label: "公開の設定を開く", act: "publish", variant: "primary", icon: "globe" }) + "</div>";
      if (loadingR) return '<div class="wp-empty" role="status" aria-busy="true"><div class="wp-empty__d">読み込み中…</div></div>';
      if (!responses) return '<div class="wp-empty">' + btn({ label: "回答を読み込む", act: "load-resp", variant: "primary" }) + "</div>";
      var list = responses.filter(function (r) { return !r.excluded; });
      var h = '<div class="wpf-wrap">';
      h += '<div class="wpf-stat">'
        + statCard(responses.length, "回答数")
        + statCard(list.length, "分析の対象")
        + statCard(responses.length - list.length, "除外")
        + statCard(avgDuration(list), "平均の所要")
        + "</div>";
      h += '<div class="wp-inline" style="flex-wrap:wrap;margin-bottom:14px">'
        + btn({ icon: "download", label: "CSV で書き出し", act: "export-csv", variant: "outline" })
        + btn({ icon: "table", label: "Sheets へ送る", act: "to-sheets", variant: "outline" })
        + btn({ icon: "presentation", label: "Slides でレポート", act: "to-slides", variant: "outline" })
        + btn({ icon: "sparkle", label: "AI で分析", act: "ai-analyze", variant: "outline" })
        + btn({ icon: "restore", iconOnly: true, label: "読み込み直す", act: "load-resp" })
        + "</div>";
      if (!list.length) {
        h += '<div class="wp-empty"><div class="wp-empty__i">' + icon("chart") + "</div>"
          + '<div class="wp-empty__t">まだ回答がありません</div>'
          + '<div class="wp-empty__d">回答ページの URL を配ると、ここに集まります。</div></div>';
        return h + "</div>";
      }
      /* 設問ごとの集計 */
      allFields().forEach(function (f) {
        var d = FF.get(f.type);
        if (!d || d.analyticsSupported === false) return;
        var values = list.map(function (r) { return r.answers[f.id]; })
          .filter(function (v) { return v !== undefined && v !== null && v !== ""; });
        var sum = d.summarize ? d.summarize(f, values) : { kind: "list", n: values.length, items: values };
        h += '<div class="wpf-card"><div class="wpf-card__q">' + esc(f.label || d.label) + "</div>"
          + '<div class="wpf-card__d">' + values.length + " 件の回答（未回答 " + (list.length - values.length) + "）</div>";
        if (sum.chart) h += CH.render(sum.chart, { width: 620, height: sum.chart.type === "hbar" ? 40 * (sum.chart.labels.length + 1) : 250 });
        if (sum.kind === "number")
          h += '<div class="wp-inline" style="flex-wrap:wrap;margin-top:8px">'
            + U.chip("平均 " + sum.avg) + U.chip("中央値 " + sum.median)
            + U.chip("最小 " + sum.min) + U.chip("最大 " + sum.max) + "</div>";
        if (sum.note) h += '<div class="wp-inline" style="margin-top:8px">' + U.chip(sum.note, "accent") + "</div>";
        if (sum.table)
          h += '<div style="overflow-x:auto;margin-top:10px"><table class="wpd-tbl">'
            + '<thead><tr><th scope="col">選択肢</th><th scope="col">人数</th><th scope="col">割合</th></tr></thead><tbody>'
            + sum.table.map(function (t) {
              return "<tr><td>" + esc(t.label) + "</td><td>" + t.count + "</td><td>" + t.pct + "%</td></tr>";
            }).join("") + "</tbody></table></div>";
        if (sum.kind === "text" || sum.kind === "list") {
          h += '<div style="margin-top:8px;max-height:240px;overflow-y:auto">'
            + (sum.items || []).slice(0, 100).map(function (t) {
              return '<div style="padding:7px 9px;border-bottom:1px solid var(--vq-border-subtle);'
                + 'font:var(--vq-type-body-sm);color:var(--vq-text)">' + esc(t) + "</div>";
            }).join("") + "</div>";
          if ((sum.items || []).length > 100)
            h += '<div class="wp-lab">先頭 100 件を出しています（全 ' + sum.items.length + " 件）。</div>";
        }
        h += "</div>";
      });
      /* 回答の一覧 */
      h += '<div class="wpf-card"><div class="wpf-card__q">回答の一覧</div>'
        + '<div style="overflow-x:auto"><table class="wpd-tbl"><thead><tr>'
        + '<th scope="col">日時</th>'
        + allFields().filter(function (f) { return !FF.isDecoration(f.type); })
          .slice(0, 8).map(function (f) { return '<th scope="col">' + esc(f.label || "") + "</th>"; }).join("")
        + '<th scope="col">操作</th></tr></thead><tbody>'
        + responses.slice(0, 200).map(function (r) {
          return '<tr' + (r.excluded ? ' style="opacity:.5"' : "") + "><td>" + esc(U.fmtDate(r.createdAt)) + "</td>"
            + allFields().filter(function (f) { return !FF.isDecoration(f.type); })
              .slice(0, 8).map(function (f) {
                return "<td>" + esc(display(f, r.answers[f.id])) + "</td>";
              }).join("")
            + "<td>" + btn({ label: r.excluded ? "戻す" : "除外", act: "resp-ex", val: r.id })
            + btn({ icon: "trash", iconOnly: true, label: "削除", act: "resp-del", val: r.id }) + "</td></tr>";
        }).join("") + "</tbody></table></div>"
        + (responses.length > 200 ? '<div class="wp-lab">先頭 200 件を出しています（全 ' + responses.length + " 件）。</div>" : "")
        + "</div>";
      return h + "</div>";
    }
    function statCard(n, label) {
      return '<div class="wpf-stat__c"><div class="wpf-stat__n">' + esc(n) + "</div>"
        + '<div class="wpf-stat__l">' + esc(label) + "</div></div>";
    }
    function avgDuration(list) {
      var ds = list.map(function (r) { return Number(r.meta && r.meta.durationMs) || 0; })
        .filter(function (n) { return n > 0; });
      if (!ds.length) return "—";
      var avg = ds.reduce(function (a, b) { return a + b; }, 0) / ds.length;
      return Math.round(avg / 1000) + " 秒";
    }
    function display(f, v) {
      if (v === undefined || v === null || v === "") return "";
      var d = FF.get(f.type);
      if (["single_choice", "dropdown", "image_choice"].indexOf(f.type) >= 0) {
        if (String(v).indexOf("other:") === 0) return String(v).slice(6) + "（その他）";
        var op = (f.options || [])[Number(v)];
        return op ? op.text : String(v);
      }
      if (f.type === "multi_choice")
        return (Array.isArray(v) ? v : []).map(function (i) {
          var o = (f.options || [])[Number(i)];
          return o ? o.text : i;
        }).join("・");
      if (f.type === "ranking")
        return (Array.isArray(v) ? v : []).map(function (i, k) {
          var o = (f.options || [])[Number(i)];
          return (k + 1) + "." + (o ? o.text : i);
        }).join(" ");
      if (typeof v === "object") {
        if (v.name) return v.name;
        return Object.keys(v).map(function (k) {
          var col = (f.cols || [])[Number(v[k])];
          return ((f.rows || [])[Number(k)] || k) + ":" + (col || v[k]);
        }).join(" / ");
      }
      if (typeof v === "boolean") return v ? "はい" : "いいえ";
      return String(v);
    }
    function loadResponses() {
      if (!item.publicId) return;
      loadingR = true;
      paint();
      ST.api("GET", "/api/workplace/form/responses?id=" + encodeURIComponent(item.id))
        .then(function (r) { responses = r.responses || []; loadingR = false; paint(); })
        .catch(function (e) {
          loadingR = false; responses = [];
          paint();
          api.toast("回答を読み込めませんでした: " + e.message, "error", 6000);
        });
    }

    /* ── 操作 ─────────────────────────────────────────────────── */
    function bind() {
      U.keepSelection(api.root);
      /* 右クリック */
      api.root.addEventListener("contextmenu", function (e) {
        if (tab !== "edit") return;
        var card = e.target.closest ? e.target.closest("[data-fid]") : null;
        var wrap = e.target.closest ? e.target.closest(".wpf-wrap") : null;
        if (!wrap) return;
        e.preventDefault();
        if (card) { selF = card.getAttribute("data-fid"); paint(); questionContextMenu(e.clientX, e.clientY); }
        else formContextMenu(e.clientX, e.clientY);
      });
      api.root.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (t && api.root.contains(t)) {
          if (handle(t.getAttribute("data-act"), t.getAttribute("data-val"), t)) { e.preventDefault(); return; }
        }
        var card = e.target.closest ? e.target.closest("[data-fid]") : null;
        if (card && tab === "edit") {
          selF = card.getAttribute("data-fid");
          paint();
          if (VQ2.ui.isMobile()) openFieldSheet();
        }
        /* プレビューの中の選択（星・スケール） */
        var pick = e.target.closest ? e.target.closest("[data-pick]") : null;
        if (pick && tab === "preview") {
          var nm = pick.getAttribute("data-pick");
          var hidden = api.root.querySelector('input[type="hidden"][name="' + nm + '"]');
          if (hidden) { hidden.value = pick.getAttribute("data-v"); }
          var fid = nm.replace(/^f_/, "");
          preview[fid] = Number(pick.getAttribute("data-v"));
          paint();
        }
      });
      api.root.addEventListener("input", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var a = t.getAttribute("data-act");
        if (a === "title2") { session.setTitle(t.value);
          var ti = api.root.querySelector('[data-act="title"]'); if (ti) ti.value = t.value; return; }
        if (a === "desc") { item.description = t.value; session.touch(); return; }
        if (a === "sec-title") { body.sections[Number(t.getAttribute("data-si"))].title = t.value;
          session.touch(); return; }
        var found = findField(selF);
        var card = t.closest("[data-fid]");
        if (card && a === "f-label") {
          var f2 = findField(card.getAttribute("data-fid"));
          if (f2) { f2.f.label = t.value; session.touch(); }
          return;
        }
        if (!found) return;
        var f = found.f;
        var map = { "f-label": "label", "f-desc": "description", "f-text": "text", "f-ph": "placeholder",
          "f-minlab": "minLabel", "f-maxlab": "maxLabel", "f-accept": "accept",
          "f-ans": "answer", "f-fb": "feedback" };
        if (map[a]) { f[map[a]] = t.value; session.touch(); refreshCard(f.id); return; }
        var nmap = { "f-min": "min", "f-max": "max", "f-maxlen": "maxLength", "f-size": "maxSizeMb", "f-pts": "points" };
        if (nmap[a]) { f[nmap[a]] = t.value === "" ? "" : Number(t.value); session.touch(); refreshCard(f.id); return; }
        if (a === "f-rows") { f.rows = t.value.split("\n").filter(Boolean); session.touch(); refreshCard(f.id); return; }
        if (a === "f-cols") { f.cols = t.value.split("\n").filter(Boolean); session.touch(); refreshCard(f.id); return; }
        if (a === "opt") {
          var i = Number(t.getAttribute("data-i"));
          if (f.options[i]) { f.options[i].text = t.value; session.touch(); refreshCard(f.id); }
        }
      });
      api.root.addEventListener("change", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var found = findField(selF);
        if (!found) return;
        var a = t.getAttribute("data-act"), f = found.f;
        if (a === "f-req") { f.required = t.checked; session.touch(); paint(); }
        else if (a === "f-other") { f.allowOther = t.checked; session.touch(); paint(); }
      });
    }
    function refreshCard(id) {
      var card = api.root.querySelector('[data-fid="' + id + '"]');
      var found = findField(id);
      if (!card || !found) return;
      card.outerHTML = fieldCard(found.f, found.sec, found.idx);
    }
    function handle(act, val, t) {
      if (act === "tab") { tab = val; selF = null; paint();
        if (tab === "responses" && !responses) loadResponses(); return true; }
      if (act === "add-sheet") { addFieldSheet(val === null ? 0 : Number(val) || 0); return true; }
      if (act === "sec-add") {
        shell.pushUndo("セクションの追加");
        body.sections.push({ id: M.uid("s"), title: "セクション " + (body.sections.length + 1),
          description: "", fields: [] });
        session.touch(); paint(); return true;
      }
      if (act === "sec-del") {
        if (body.sections.length < 2) { api.toast("最後のセクションは消せません。", "warn"); return true; }
        api.confirm({ title: "セクションを削除しますか", message: "中の質問も消えます。", okText: "削除" })
          .then(function (yes) {
            if (!yes) return;
            shell.pushUndo("セクションの削除");
            body.sections.splice(Number(val), 1);
            session.touch(); paint();
          });
        return true;
      }
      if (act === "unsel") { selF = null; paint(); return true; }
      if (act === "f-move" || act === "f-dup" || act === "f-del") {
        var card = t.closest("[data-fid]");
        if (!card) return true;
        var found = findField(card.getAttribute("data-fid"));
        if (!found) return true;
        var fs = body.sections[found.sec].fields;
        shell.pushUndo("質問の変更");
        if (act === "f-del") { fs.splice(found.idx, 1); selF = null; }
        else if (act === "f-dup") {
          var c = JSON.parse(JSON.stringify(found.f));
          c.id = M.uid("f");
          (c.options || []).forEach(function (o) { o.id = M.uid("o"); });
          fs.splice(found.idx + 1, 0, c);
        } else {
          var j = found.idx + (val === "up" ? -1 : 1);
          if (j < 0 || j >= fs.length) return true;
          var tmp = fs[found.idx]; fs[found.idx] = fs[j]; fs[j] = tmp;
        }
        session.touch(); paint(); return true;
      }
      if (act === "opt-add") {
        var f = findField(selF);
        if (!f) return true;
        shell.pushUndo("選択肢の追加");
        f.f.options = f.f.options || [];
        f.f.options.push({ id: M.uid("o"), text: "選択肢 " + (f.f.options.length + 1) });
        session.touch(); paint(); return true;
      }
      if (act === "opt-del") {
        var f2 = findField(selF);
        if (!f2) return true;
        shell.pushUndo("選択肢の削除");
        f2.f.options.splice(Number(val), 1);
        session.touch(); paint(); return true;
      }
      if (act === "f-img") { pickFieldImage(); return true; }
      if (act === "theme") { themeSheet(); return true; }
      if (act === "settings") { settingsSheet(); return true; }
      if (act === "publish") { publishSheet(); return true; }
      if (act === "logic") { logicSheet(); return true; }
      if (act === "ai") { aiForms(); return true; }
      if (act === "load-resp") { loadResponses(); return true; }
      if (act === "export-csv") { exportCsv(); return true; }
      if (act === "to-sheets") { toSheets(); return true; }
      if (act === "to-slides") { toSlides(); return true; }
      if (act === "ai-analyze") { aiAnalyze(); return true; }
      if (act === "resp-ex" || act === "resp-del") {
        var action = act === "resp-del" ? "delete" : null;
        var r = null;
        (responses || []).some(function (x) { if (x.id === val) { r = x; return true; } return false; });
        if (!r) return true;
        if (!action) action = r.excluded ? "include" : "exclude";
        if (action === "delete" && !root.confirm) { }
        var go = function () {
          ST.api("POST", "/api/workplace/form/response", { responseId: val, action: action })
            .then(function () { loadResponses(); })
            .catch(function (e) { api.toast("できませんでした: " + e.message, "error"); });
        };
        if (action === "delete") {
          api.confirm({ title: "この回答を削除しますか", message: "取り消せません。", okText: "削除" })
            .then(function (yes) { if (yes) go(); });
        } else go();
        return true;
      }
      return false;
    }
    /* ── 右クリックのメニュー ─────────────────────────────────── */
    function questionContextMenu(x, y) {
      var found = findField(selF);
      if (!found) return;
      var f = found.f, d = FF.get(f.type);
      var deco = FF.isDecoration(f.type);
      var items = [
        { label: "この質問の設定を開く", icon: "settings", run: function () {
          if (VQ2.ui.isMobile()) openFieldSheet(); else paint(); } }
      ];
      if (!deco) items.push({ label: f.required ? "必須をやめる" : "必須にする", icon: "check",
        on: !!f.required, run: function () {
          shell.pushUndo("必須の切り替え");
          f.required = !f.required; session.touch(); paint(); } });
      if (["single_choice", "multi_choice", "dropdown", "image_choice", "ranking"].indexOf(f.type) >= 0)
        items.push({ label: "選択肢を追加", icon: "plus", run: function () { handle("opt-add"); } });
      items.push(
        { sep: true },
        { label: "上へ移動", icon: "chevronU", run: function () { moveField(-1); } },
        { label: "下へ移動", icon: "chevronD", run: function () { moveField(1); } },
        { label: "複製する", icon: "copy", run: function () { dupField(); } },
        { sep: true },
        { label: "この下に質問を足す", icon: "plus", run: function () { addFieldSheet(found.sec); } },
        { label: "形式を変える", icon: "layers", run: function () { changeTypeSheet(); } },
        { sep: true },
        { label: "この質問を削除", icon: "trash", danger: true, run: function () {
          shell.pushUndo("質問の削除");
          body.sections[found.sec].fields.splice(found.idx, 1);
          selF = null; session.touch(); paint(); } }
      );
      U.contextMenu(api.root, x, y, items, { title: (d ? d.label : "質問") + "の操作" });
    }
    function formContextMenu(x, y) {
      var items = [
        { label: "質問を追加", icon: "plus", run: function () { addFieldSheet(body.sections.length - 1); } },
        { label: "セクションを追加", icon: "layers", run: function () { handle("sec-add"); } },
        { sep: true },
        { label: "プレビューを見る", icon: "eye", run: function () { tab = "preview"; paint(); } },
        { label: "回答結果を見る", icon: "chart",
          run: function () { tab = "responses"; paint(); if (!responses) loadResponses(); } },
        { sep: true },
        { label: "テーマ", icon: "palette", run: themeSheet },
        { label: "フォームの設定", icon: "settings", run: settingsSheet },
        { label: "分岐の設定", icon: "sort", run: logicSheet },
        { label: "公開の設定", icon: "globe", run: publishSheet }
      ];
      U.contextMenu(api.root, x, y, items, { title: "フォームの操作" });
    }
    function moveField(d) {
      var found = findField(selF);
      if (!found) return;
      var fs = body.sections[found.sec].fields;
      var j = found.idx + d;
      if (j < 0 || j >= fs.length) return;
      shell.pushUndo("並べ替え");
      var t = fs[found.idx]; fs[found.idx] = fs[j]; fs[j] = t;
      session.touch(); paint();
    }
    function dupField() {
      var found = findField(selF);
      if (!found) return;
      shell.pushUndo("質問の複製");
      var c = JSON.parse(JSON.stringify(found.f));
      c.id = M.uid("f");
      (c.options || []).forEach(function (o) { o.id = M.uid("o"); });
      body.sections[found.sec].fields.splice(found.idx + 1, 0, c);
      selF = c.id;
      session.touch(); paint();
    }
    /* 形式を変える。中身（質問文・選択肢）は残す。 */
    function changeTypeSheet() {
      var found = findField(selF);
      if (!found) return;
      var byCat = WP.fieldRegistry.byCategory();
      var h = "";
      Object.keys(byCat).forEach(function (cat) {
        h += '<div class="wp-lab" style="margin-top:10px">' + esc(cat) + "</div><div class=\"wpf-add\">"
          + byCat[cat].map(function (d) {
            return '<button type="button" class="wpf-add__b' + (d.type === found.f.type ? " is-on" : "")
              + '" data-t="' + esc(d.type) + '">' + icon(d.icon) + "<span>" + esc(d.label) + "</span></button>";
          }).join("") + "</div>";
      });
      U.sheet(api.root, {
        title: "質問の形式を変える",
        html: '<div class="wp-lab">質問文と選択肢はそのまま残ります。</div>' + h,
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-t]") : null;
            if (!b) return;
            close();
            var t = b.getAttribute("data-t");
            shell.pushUndo("形式の変更");
            found.f.type = t;
            if (["single_choice", "multi_choice", "dropdown", "image_choice", "ranking"].indexOf(t) >= 0
                && !(found.f.options || []).length)
              found.f.options = [{ id: M.uid("o"), text: "選択肢 1" }, { id: M.uid("o"), text: "選択肢 2" }];
            if (t === "scale" && found.f.min === undefined) { found.f.min = 1; found.f.max = 5; }
            if (t === "star" && found.f.max === undefined) found.f.max = 5;
            if (["matrix", "matrix_multi"].indexOf(t) >= 0 && !(found.f.rows || []).length) {
              found.f.rows = ["行 1", "行 2"];
              found.f.cols = ["列 1", "列 2", "列 3"];
            }
            session.touch(); paint();
          });
        }
      });
    }
    function openFieldSheet() {
      U.sheet(api.root, { title: "質問の設定", html: fieldPanel(),
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            if (e.target.closest && e.target.closest('[data-act="unsel"]')) { close(); selF = null; paint(); }
          });
        } });
    }
    function addFieldSheet(si) {
      var byCat = WP.fieldRegistry.byCategory();
      var lv = shell.mode;
      var h = "";
      Object.keys(byCat).forEach(function (cat) {
        var list = byCat[cat].filter(function (d) {
          return (d.level || 1) <= ({ simple: 1, standard: 2, detail: 3 }[lv] || 2);
        });
        if (!list.length) return;
        h += '<div class="wp-lab" style="margin-top:10px">' + esc(cat) + "</div>"
          + '<div class="wpf-add">' + list.map(function (d) {
            return '<button type="button" class="wpf-add__b" data-t="' + esc(d.type) + '">'
              + icon(d.icon) + "<span>" + esc(d.label) + "</span></button>";
          }).join("") + "</div>";
      });
      U.sheet(api.root, {
        title: "質問を追加", html: h,
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var b = e.target.closest ? e.target.closest("[data-t]") : null;
            if (!b) return;
            close();
            addField(b.getAttribute("data-t"), si);
          });
        }
      });
    }
    function addField(type, si) {
      var d = FF.get(type);
      if (!d) return;
      shell.pushUndo("質問の追加");
      var f = { id: M.uid("f"), type: type, label: FF.isDecoration(type) ? "" : d.label,
        description: "", required: false, options: [] };
      if (["single_choice", "multi_choice", "dropdown", "image_choice", "ranking"].indexOf(type) >= 0)
        f.options = [{ id: M.uid("o"), text: "選択肢 1" }, { id: M.uid("o"), text: "選択肢 2" }];
      if (type === "scale") { f.min = 1; f.max = 5; }
      if (type === "star") f.max = 5;
      if (["matrix", "matrix_multi"].indexOf(type) >= 0) {
        f.rows = ["行 1", "行 2"];
        f.cols = ["列 1", "列 2", "列 3"];
      }
      var sec = body.sections[Math.min(si || 0, body.sections.length - 1)];
      sec.fields.push(f);
      selF = f.id;
      session.touch();
      paint();
      if (VQ2.ui.isMobile()) openFieldSheet();
    }
    function pickFieldImage() {
      var found = findField(selF);
      if (!found) return;
      var inp = doc.createElement("input");
      inp.type = "file"; inp.accept = "image/*";
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) { api.toast("画像が大きすぎます（1.5MB まで）。", "error", 6000); return; }
        var fr = new root.FileReader();
        fr.onload = function () {
          found.f.src = fr.result;
          found.f.alt = file.name;
          session.touch();
          paint();
        };
        fr.readAsDataURL(file);
      });
      inp.click();
    }
    function themeSheet() {
      var th = body.theme;
      U.sheet(api.root, {
        title: "テーマ",
        html: '<div class="wp-lab">アクセント色</div><div class="wp-inline" style="flex-wrap:wrap;margin-bottom:14px">'
          + ["#7b3fe4", "#2b70ef", "#0f9d58", "#e8710a", "#d1467a", "#0d7f8f", "#334155"].map(function (c) {
            return '<button type="button" data-c="' + c + '" aria-label="' + c + '" style="width:32px;height:32px;'
              + "border-radius:50%;border:2px solid " + (th.accent === c ? "var(--vq-text)" : "transparent")
              + ";cursor:pointer;background:" + c + '"></button>';
          }).join("") + "</div>"
          + '<div class="wp-lab">表紙</div><div class="wp-tpl" style="margin-bottom:14px">'
          + M.GRADIENTS.map(function (g) {
            return '<button type="button" class="wp-tpl__c" data-g="' + esc(g.value) + '">'
              + '<div class="wp-tpl__b" style="background:' + esc(g.value) + '"></div>'
              + '<div class="wp-tpl__t">' + esc(g.label) + "</div></button>";
          }).join("") + "</div>"
          + '<label class="wp-switch"><input type="checkbox" data-act="prog"' + (th.progress !== false ? " checked" : "")
          + " />進み具合のバーを出す</label>"
          + '<label class="wp-switch"><input type="checkbox" data-act="qnum"'
          + (body.settings.showQuestionNumber !== false ? " checked" : "") + " />質問に番号を付ける</label>",
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("click", function (e) {
            var c = e.target.closest ? e.target.closest("[data-c]") : null;
            var g = e.target.closest ? e.target.closest("[data-g]") : null;
            if (c) { th.accent = c.getAttribute("data-c"); session.touch(); close(); paint(); }
            else if (g) {
              item.appearance.bannerType = "gradient";
              item.appearance.bannerValue = g.getAttribute("data-g");
              session.touch(); close(); paint();
            }
          });
          bodyEl.addEventListener("change", function (e) {
            var t = e.target.closest ? e.target.closest("[data-act]") : null;
            if (!t) return;
            if (t.getAttribute("data-act") === "prog") th.progress = t.checked;
            else body.settings.showQuestionNumber = t.checked;
            session.touch();
            paint();
          });
        }
      });
    }
    function settingsSheet() {
      var s = body.settings;
      function sw(k, label, note) {
        return '<label class="wp-switch"><input type="checkbox" data-k="' + k + '"' + (s[k] ? " checked" : "")
          + " />" + esc(label) + "</label>"
          + (note ? '<div class="wp-lab" style="margin:-4px 0 8px 26px">' + esc(note) + "</div>" : "");
      }
      U.sheet(api.root, {
        title: "フォームの設定",
        html: sw("accepting", "回答を受け付ける")
          + sw("requireLogin", "ログインを必須にする", "未ログインの人は回答できなくなります。")
          + sw("onePerPerson", "1 人 1 回答", "ログインが必要です。")
          + sw("onePerDevice", "同じ端末から 1 回だけ")
          + sw("shuffleQuestions", "質問の順番をばらばらにする")
          + sw("graded", "採点モード（正解と配点を設定できる）")
          + '<div class="wp-row" style="margin-top:12px"><label class="wp-lab" for="so">受付開始</label>'
          + '<input class="wp-in" id="so" type="datetime-local" value="' + esc(s.opensAt || "") + '" data-k2="opensAt" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="sc">受付終了</label>'
          + '<input class="wp-in" id="sc" type="datetime-local" value="' + esc(s.closesAt || "") + '" data-k2="closesAt" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="sl">回答数の上限（0 で無制限）</label>'
          + '<input class="wp-in" id="sl" type="number" min="0" value="' + (s.responseLimit || 0) + '" data-k2="responseLimit" /></div>'
          + '<div class="wp-row"><label class="wp-lab" for="sm">送信後のメッセージ</label>'
          + '<textarea class="wp-ta" id="sm" data-k2="confirmMessage">' + esc(s.confirmMessage || "") + "</textarea></div>"
          + '<div class="wp-row"><label class="wp-lab" for="sr">送信後に移動する URL（任意）</label>'
          + '<input class="wp-in" id="sr" value="' + esc(s.redirectUrl || "") + '" data-k2="redirectUrl" placeholder="https://" /></div>'
          + '<div class="wp-lab">受付の可否・上限・必須の確認は、画面だけでなくサーバー側でも見ています。</div>',
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("change", function (e) {
            var t = e.target.closest ? e.target.closest("[data-k]") : null;
            if (t) { s[t.getAttribute("data-k")] = t.checked; session.touch(); paint(); return; }
            var t2 = e.target.closest ? e.target.closest("[data-k2]") : null;
            if (t2) {
              var k = t2.getAttribute("data-k2");
              s[k] = t2.type === "number" ? Number(t2.value) : t2.value;
              session.touch();
            }
          });
          bodyEl.addEventListener("input", function (e) {
            var t2 = e.target.closest ? e.target.closest("[data-k2]") : null;
            if (!t2) return;
            var k = t2.getAttribute("data-k2");
            s[k] = t2.type === "number" ? Number(t2.value) : t2.value;
            session.touch();
          });
        }
      });
    }
    function publishSheet() {
      var origin = "";
      try { origin = root.location.origin; } catch (e) {}
      var url = item.publicId ? origin + "/?wpform=" + item.publicId : "";
      var h = '<div class="wp-row"><label class="wp-lab" for="pv">公開の範囲</label>'
        + '<select class="wp-sel" id="pv" data-act="vis">'
        + '<option value="private"' + (item.visibility === "private" ? " selected" : "") + ">非公開（自分だけ）</option>"
        + '<option value="link"' + (item.visibility === "link" ? " selected" : "") + ">リンクを知っている人が回答できる</option>"
        + '<option value="public"' + (item.visibility === "public" ? " selected" : "") + ">公開</option>"
        + "</select></div>";
      if (url) {
        h += '<div class="wp-row"><div class="wp-lab">回答ページの URL</div>'
          + '<div class="wp-inline"><input class="wp-in" readonly value="' + esc(url) + '" data-act="url" />'
          + btn({ icon: "copy", iconOnly: true, label: "コピー", act: "copy" }) + "</div></div>"
          + '<div style="text-align:center;margin:14px 0">' + qrSvg(url) + "</div>"
          + '<div class="wp-inline" style="flex-wrap:wrap">'
          + btn({ icon: "eye", label: "回答ページを開く", act: "open-pub", variant: "outline" })
          + "</div>"
          + '<div class="wp-lab" style="margin-top:10px">この URL では回答だけができます。'
          + "編集はできません。</div>";
      } else {
        h += '<div class="wp-lab">「リンクを知っている人」以上にすると、回答用の URL と QR コードが出ます。</div>';
      }
      U.sheet(api.root, {
        title: "公開の設定", html: h,
        onOpen: function (bodyEl, close) {
          bodyEl.addEventListener("change", function (e) {
            var t = e.target.closest ? e.target.closest('[data-act="vis"]') : null;
            if (!t) return;
            if (!ST.isSignedIn()) {
              api.toast("公開するにはログインが必要です。この端末だけで使うことはできます。", "warn", 6000);
              return;
            }
            ST.meta(item.id, { visibility: t.value }).then(function (r) {
              if (r.item) {
                item.visibility = r.item.visibility;
                item.publicId = r.item.publicId;
                session.item.visibility = r.item.visibility;
                session.item.publicId = r.item.publicId;
              }
              close();
              paint();
              api.toast(t.value === "private" ? "非公開にしました" : "公開しました", "ok");
              if (t.value !== "private") publishSheet();
            }).catch(function (e2) { api.toast("変えられませんでした: " + e2.message, "error", 6000); });
          });
          bodyEl.addEventListener("click", function (e) {
            if (e.target.closest && e.target.closest('[data-act="copy"]')) {
              var u = bodyEl.querySelector('[data-act="url"]');
              if (u) { u.select(); try { doc.execCommand("copy"); api.toast("コピーしました", "ok"); } catch (er) {} }
            }
            if (e.target.closest && e.target.closest('[data-act="open-pub"]')) {
              close();
              WP.formsPublic.open({ publicId: item.publicId });
            }
          });
        }
      });
    }
    /* QR コード。外部ライブラリを足さないので、簡易な図で URL を示す。
       読み取り機で確実に読める本物の QR ではないため、そう書いておく。 */
    function qrSvg(url) {
      return '<div style="display:inline-block;padding:12px;background:var(--vq-surface-sunken);border-radius:10px">'
        + icon("globe") + '<div style="font:var(--vq-type-caption);color:var(--vq-text-tertiary);margin-top:6px;'
        + 'max-width:220px;word-break:break-all">' + esc(url) + "</div>"
        + '<div class="wp-lab" style="margin-top:6px">QR コードの生成は未実装です。URL をそのままお渡しください。</div></div>';
    }
    function logicSheet() {
      var fields = allFields().filter(function (f) {
        return ["single_choice", "dropdown"].indexOf(f.type) >= 0;
      });
      var h = '<div class="wp-lab">「この質問でこう答えたら、次はここへ」を決められます。'
        + "単一選択とプルダウンだけが条件に使えます。</div>";
      if (!fields.length) {
        h += '<div class="wp-empty__d" style="margin-top:12px">条件に使える質問がまだありません。'
          + "単一選択かプルダウンの質問を追加してください。</div>";
      } else {
        h += (body.logic || []).map(function (l, i) {
          var f = allFields().filter(function (x) { return x.id === l.fieldId; })[0];
          var op = f && (f.options || [])[Number(l.optionIndex)];
          return '<div class="wp-inline" style="margin-bottom:6px;justify-content:space-between">'
            + "<span>" + esc(f ? f.label : "?") + " が「" + esc(op ? op.text : l.optionIndex) + "」→ "
            + esc(l.target === "__end" ? "ここで終了"
              : ("セクション " + (body.sections.map(function (s) { return s.id; }).indexOf(l.target) + 1))) + "</span>"
            + btn({ icon: "trash", iconOnly: true, label: "削除", act: "lg-del", val: i }) + "</div>";
        }).join("");
        h += '<div class="wp-row" style="margin-top:12px"><label class="wp-lab" for="lf">質問</label>'
          + '<select class="wp-sel" id="lf">' + fields.map(function (f) {
            return '<option value="' + esc(f.id) + '">' + esc(f.label) + "</option>";
          }).join("") + "</select></div>"
          + '<div class="wp-row"><label class="wp-lab" for="lo">この選択肢のとき</label>'
          + '<select class="wp-sel" id="lo"></select></div>'
          + '<div class="wp-row"><label class="wp-lab" for="lt">次に進む先</label>'
          + '<select class="wp-sel" id="lt">'
          + body.sections.map(function (s, i) {
            return '<option value="' + esc(s.id) + '">セクション ' + (i + 1) + (s.title ? "：" + esc(s.title) : "") + "</option>";
          }).join("") + '<option value="__end">ここで終了</option></select></div>'
          + btn({ label: "この分岐を足す", variant: "primary", act: "lg-add", cls: "is-lg" });
      }
      U.sheet(api.root, {
        title: "分岐の設定", html: h,
        onOpen: function (bodyEl, close) {
          var sf = bodyEl.querySelector("#lf"), so = bodyEl.querySelector("#lo");
          function fillOpts() {
            if (!sf || !so) return;
            var f = allFields().filter(function (x) { return x.id === sf.value; })[0];
            so.innerHTML = ((f && f.options) || []).map(function (o, i) {
              return '<option value="' + i + '">' + esc(o.text) + "</option>";
            }).join("");
          }
          fillOpts();
          if (sf) sf.addEventListener("change", fillOpts);
          bodyEl.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-act]") : null;
            if (!t) return;
            if (t.getAttribute("data-act") === "lg-add") {
              body.logic.push({ fieldId: sf.value, optionIndex: Number(so.value),
                target: bodyEl.querySelector("#lt").value });
              session.touch(); close(); logicSheet();
            } else if (t.getAttribute("data-act") === "lg-del") {
              body.logic.splice(Number(t.getAttribute("data-val")), 1);
              session.touch(); close(); logicSheet();
            }
          });
        }
      });
    }

    /* ── 書き出し・連携 ───────────────────────────────────────── */
    function csvText() {
      var fs = allFields().filter(function (f) { return !FF.isDecoration(f.type); });
      var head = ["回答日時"].concat(fs.map(function (f) { return f.label || f.type; }));
      var rows = [head];
      (responses || []).forEach(function (r) {
        rows.push([r.createdAt].concat(fs.map(function (f) { return display(f, r.answers[f.id]); })));
      });
      return rows.map(function (r) {
        return r.map(function (c) {
          var s = String(c === undefined ? "" : c);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(",");
      }).join("\n");
    }
    function exportCsv() {
      if (!responses || !responses.length) { api.toast("回答がまだありません。", "warn"); return; }
      try {
        var blob = new root.Blob(["﻿", csvText()], { type: "text/csv;charset=utf-8" });
        var a = doc.createElement("a");
        a.href = root.URL.createObjectURL(blob);
        a.download = (item.title || "フォーム").replace(/[\/\\:*?"<>|]/g, "_") + "_回答.csv";
        doc.body.appendChild(a); a.click();
        root.setTimeout(function () { root.URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        api.toast("書き出しました", "ok");
      } catch (e) { api.toast("書き出せませんでした。", "error"); }
    }
    function toSheets() {
      if (!responses || !responses.length) { api.toast("回答がまだありません。", "warn"); return; }
      api.toast("Sheets を作っています…", "info");
      var fs = allFields().filter(function (f) { return !FF.isDecoration(f.type); });
      var rows = [["回答日時"].concat(fs.map(function (f) { return f.label || f.type; }))];
      responses.forEach(function (r) {
        rows.push([U.fmtDate(r.createdAt)].concat(fs.map(function (f) { return display(f, r.answers[f.id]); })));
      });
      WP.convert.rowsToSheet(rows, item.title + " の回答").then(function (r) {
        api.toast("「" + r.item.title + "」を作りました", "ok", 4000);
      }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error", 6000); });
    }
    function toSlides() {
      if (!responses || !responses.length) { api.toast("回答がまだありません。", "warn"); return; }
      api.toast("Slides を作っています…", "info");
      var list = responses.filter(function (r) { return !r.excluded; });
      var charts = [];
      allFields().forEach(function (f) {
        var d = FF.get(f.type);
        if (!d || !d.summarize || d.analyticsSupported === false) return;
        var values = list.map(function (r) { return r.answers[f.id]; })
          .filter(function (v) { return v !== undefined && v !== null && v !== ""; });
        var sum = d.summarize(f, values);
        if (sum && sum.chart) charts.push({ title: f.label || d.label, chart: sum.chart });
      });
      WP.convert.formReport(item, list.length, charts).then(function (r) {
        api.toast("「" + r.item.title + "」を作りました", "ok", 4000);
      }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error", 6000); });
    }
    function aiAnalyze() {
      if (!responses || !responses.length) { api.toast("回答がまだありません。", "warn"); return; }
      var list = responses.filter(function (r) { return !r.excluded; });
      var texts = [];
      allFields().forEach(function (f) {
        if (["short_text", "long_text"].indexOf(f.type) < 0) return;
        list.forEach(function (r) {
          var v = String(r.answers[f.id] || "").trim();
          if (v) texts.push("[" + (f.label || "自由記述") + "] " + v);
        });
      });
      if (!texts.length) { api.toast("自由記述の回答がないため、分析するものがありません。", "warn", 5000); return; }
      WP.ai.open({
        api: api, itemType: "form", item: item,
        scope: { kind: "responses", text: texts.slice(0, 300).join("\n"),
          label: "回答 " + list.length + " 件（自由記述 " + texts.length + " 件・先頭 300 件まで）" },
        meta: { total: responses.length, analyzed: list.length, excluded: responses.length - list.length },
        onApply: function (out) {
          WP.convert.textToDoc(item.title + " の回答分析", out, {
            total: responses.length, analyzed: list.length, excluded: responses.length - list.length
          }).then(function (r) {
            api.toast("「" + r.item.title + "」を作りました", "ok", 4000);
          }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error"); });
        }
      });
    }
    function aiForms() {
      if (tab === "responses") { aiAnalyze(); return; }
      WP.ai.open({
        api: api, itemType: "form", item: item,
        scope: { kind: "form", text: JSON.stringify({ title: item.title,
          sections: body.sections.map(function (s) {
            return { title: s.title, fields: s.fields.map(function (f) {
              return { type: f.type, label: f.label, options: (f.options || []).map(function (o) { return o.text; }) };
            }) };
          }) }), label: questionCount() + " 問のフォーム" },
        onApply: function (out) {
          var made = WP.ai.parseForm(out);
          if (!made || !made.length) { api.toast("フォームとして読み取れませんでした。", "warn", 5000); return; }
          api.confirm({ title: "この質問を足しますか",
            message: made.length + " 問を、いまのフォームの後ろに足します。", okText: "足す" })
            .then(function (yes) {
              if (!yes) return;
              shell.pushUndo("AI で質問を追加");
              var sec = body.sections[body.sections.length - 1];
              made.forEach(function (f) { sec.fields.push(f); });
              session.touch();
              paint();
              api.toast(made.length + " 問を足しました", "ok");
            });
        }
      });
    }

    function registerCommands() {
      var cmds = [
        { group: "フォーム", label: "プレビューを見る", icon: "eye", run: function () { tab = "preview"; paint(); } },
        { group: "フォーム", label: "回答結果を見る", icon: "chart",
          run: function () { tab = "responses"; paint(); if (!responses) loadResponses(); } },
        { group: "フォーム", label: "公開の設定", icon: "globe", run: publishSheet },
        { group: "フォーム", label: "フォームの設定", icon: "settings", run: settingsSheet },
        { group: "フォーム", label: "テーマ", icon: "palette", run: themeSheet },
        { group: "フォーム", label: "分岐の設定", icon: "sort", run: logicSheet },
        { group: "フォーム", label: "セクションを追加", icon: "plus",
          run: function () { handle("sec-add"); } },
        { group: "書き出し", label: "回答を CSV で書き出し", icon: "download", run: exportCsv },
        { group: "書き出し", label: "回答を Sheets へ送る", icon: "table", run: toSheets },
        { group: "書き出し", label: "集計を Slides でレポート", icon: "presentation", run: toSlides }
      ];
      WP.fieldRegistry.all().forEach(function (d) {
        cmds.push({ group: "質問を追加", label: d.label, icon: d.icon,
          run: function () { addField(d.type, body.sections.length - 1); } });
      });
      shell.registerCommands(cmds);
    }

    return api;
  }

  WP.forms = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
