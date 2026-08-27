/* ══════════════════════════════════════════════════════════════════════
   VocabuForms — 回答ページ（§16.8）

   ・編集画面のプレビューと **同じ描画関数** を使う（formsRender.html）。
     こうしないと「編集では見えるのに回答画面では出ない」が起きる。
   ・回答者に編集の入口を出さない。公開 URL からはここしか開かない（§22）。
   ・受付の可否・必須・上限は、画面で止めるだけでなくサーバーでも見ている。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, FF = WP.formFields;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  /* ══ 描画（編集プレビューと共用）══════════════════════════════ */
  function html(o) {
    var f = o.form, values = o.values || {}, mode = o.mode || "answer";
    var th = f.theme || {};
    var settings = f.settings || {};
    var sections = f.sections || [];
    var secIdx = o.sectionIndex === undefined ? -1 : o.sectionIndex;   /* -1 = 全部 */
    var shown = secIdx < 0 ? sections : [sections[secIdx]].filter(Boolean);

    var h = "";
    var ap = f.appearance || {};
    h += '<div class="wpf-banner" style="background:'
      + esc(ap.bannerValue || th.accent || "#7b3fe4") + '"></div>';
    if (secIdx <= 0) {
      h += '<div class="wpf-card"><div style="font:var(--vq-type-heading-md);color:var(--vq-text)">'
        + esc(f.title || "") + "</div>"
        + (f.description ? '<div class="wpf-card__d" style="margin-top:6px;white-space:pre-wrap">'
          + esc(f.description) + "</div>" : "")
        + (hasRequired(sections) ? '<div class="wp-lab" style="margin-top:8px">'
          + '<span class="wpf-req">*</span> の付いた項目は必須です。</div>' : "")
        + "</div>";
    }
    if (th.progress !== false && sections.length > 1 && secIdx >= 0) {
      var pct = Math.round(((secIdx + 1) / sections.length) * 100);
      h += '<div class="wpf-prog"><div class="wpf-prog__f" style="width:' + pct + '%"></div></div>'
        + '<div class="wp-lab" style="text-align:right;margin-top:-10px">セクション ' + (secIdx + 1)
        + " / " + sections.length + "</div>";
    }

    var qn = 0;
    shown.forEach(function (s) {
      if (s.title)
        h += '<div class="wpf-card" style="background:var(--vq-accent-subtle)">'
          + '<div class="wpf-card__q">' + esc(s.title) + "</div>"
          + (s.description ? '<div class="wpf-card__d">' + esc(s.description) + "</div>" : "") + "</div>";
      (s.fields || []).forEach(function (fd) {
        var d = FF.get(fd.type);
        if (!d) return;
        var deco = FF.isDecoration(fd.type);
        if (!deco) qn++;
        h += '<div class="wpf-card" data-q="' + esc(fd.id) + '">';
        if (!deco)
          h += '<div class="wpf-card__q">'
            + (settings.showQuestionNumber !== false ? qn + ". " : "")
            + esc(fd.label || "")
            + (fd.required ? '<span class="wpf-req" aria-label="必須">*</span>' : "") + "</div>";
        if (fd.description) h += '<div class="wpf-card__d">' + esc(fd.description) + "</div>";
        h += d.render(fd, values[fd.id]);
        h += '<div class="wpf-err" data-err="' + esc(fd.id) + '" role="alert"></div>';
        h += "</div>";
      });
    });
    return h;
  }
  function hasRequired(sections) {
    return (sections || []).some(function (s) {
      return (s.fields || []).some(function (f) { return f.required; });
    });
  }
  /* 画面から値を読み取る。形式ごとの読み方は Registry が持っている。 */
  function read(form, sections) {
    var out = {};
    (sections || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        var d = FF.get(f.type);
        if (!d) return;
        var v = d.readValue(f, form);
        if (v !== undefined) out[f.id] = v;
      });
    });
    return out;
  }
  /* 検証。必須は共通、形式ごとの決まりは Registry が持つ。 */
  function validate(sections, values, onlySection) {
    var errs = {};
    (sections || []).forEach(function (s, si) {
      if (onlySection !== undefined && onlySection >= 0 && si !== onlySection) return;
      (s.fields || []).forEach(function (f) {
        var d = FF.get(f.type);
        if (!d || FF.isDecoration(f.type)) return;
        var v = values[f.id];
        var empty = v === undefined || v === null || v === "" || v === false
          || (Array.isArray(v) && !v.length)
          || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
        if (f.required && empty) { errs[f.id] = "この項目は必須です。"; return; }
        if (empty) return;
        var msg = d.validate ? d.validate(f, v) : "";
        if (msg) errs[f.id] = msg;
      });
    });
    return errs;
  }
  /* 分岐（§16.5）。答えに応じて次のセクションを決める。 */
  function nextSection(logic, sections, curIdx, values) {
    var rules = (logic || []).filter(function (l) {
      var f = null;
      sections.forEach(function (s) {
        (s.fields || []).forEach(function (x) { if (x.id === l.fieldId) f = x; });
      });
      if (!f) return false;
      return String(values[l.fieldId]) === String(l.optionIndex);
    });
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.target === "__end") return -2;         /* ここで終了 */
      var idx = sections.map(function (s) { return s.id; }).indexOf(r.target);
      if (idx >= 0) return idx;
    }
    return curIdx + 1 < sections.length ? curIdx + 1 : -2;
  }

  WP.formsRender = { html: html, read: read, validate: validate, nextSection: nextSection };

  /* ══ 回答ページ ═══════════════════════════════════════════════ */
  function deviceKey() {
    try {
      var k = root.localStorage.getItem("vq2.wp.device.v1");
      if (!k) {
        k = "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        root.localStorage.setItem("vq2.wp.device.v1", k);
      }
      return k;
    } catch (e) { return ""; }
  }
  var DRAFT_KEY = "vq2.wp.formDraft.v1";
  function draftGet(pid) {
    try {
      var all = JSON.parse(root.localStorage.getItem(DRAFT_KEY) || "{}");
      return all[pid] || null;
    } catch (e) { return null; }
  }
  function draftSet(pid, values) {
    try {
      var all = JSON.parse(root.localStorage.getItem(DRAFT_KEY) || "{}");
      if (values) all[pid] = { values: values, at: new Date().toISOString() };
      else delete all[pid];
      root.localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function open(o) {
    o = o || {};
    var publicId = o.publicId;
    var api = VQ2.ui.mount("vq-wp-form-public", { title: "フォームに回答", css: WP.CSS || "",
      onClose: function () { if (o.onClose) o.onClose(); } });
    var form = null, closed = "", values = {}, errs = {}, secIdx = 0, sending = false;
    var startedAt = Date.now();
    var done = null;

    render();
    load();
    bind();

    function load() {
      ST.api("GET", "/api/workplace/form/public?publicId=" + encodeURIComponent(publicId))
        .then(function (r) {
          form = r.form;
          closed = r.closed || "";
          var d = draftGet(publicId);
          if (d && d.values) {
            values = d.values;
            api.toast("前回の途中まで復元しました", "info", 4000);
          }
          render();
        })
        .catch(function (e) {
          form = null;
          closed = e.message || "このフォームを開けませんでした。";
          render();
        });
    }

    function render() {
      if (done) { api.root.innerHTML = doneView(); return; }
      if (!form) {
        api.root.innerHTML = '<div class="wp">' + topBar() + '<div class="wp-main"><div class="wpf-wrap">'
          + (closed
            ? '<div class="wp-empty"><div class="wp-empty__i">' + icon("warning") + "</div>"
              + '<div class="wp-empty__t">' + esc(closed) + "</div></div>"
            : '<div class="wp-empty" role="status" aria-busy="true"><div class="wp-empty__d">読み込み中…</div></div>')
          + "</div></div></div>";
        return;
      }
      var multi = (form.sections || []).length > 1;
      api.root.innerHTML = '<div class="wp">' + topBar() + '<div class="wp-main"><div class="wpf-wrap" data-role="form">'
        + (closed ? '<div class="wp-ai__scope" style="background:var(--vq-warning-bg);color:var(--vq-warning-text)">'
          + esc(closed) + "</div>" : "")
        + WP.formsRender.html({ form: form, values: values, sectionIndex: multi ? secIdx : -1 })
        + navRow(multi)
        + '<div class="wp-lab" style="margin-top:18px;text-align:center">'
        + "この画面では回答だけができます。フォームの編集はできません。</div>"
        + "</div></div></div>";
      paintErrors();
    }
    function topBar() {
      return '<div class="wp-top">'
        + btn({ icon: "back", iconOnly: true, label: "閉じる", act: "close" })
        + '<div style="font:var(--vq-type-heading-sm);color:var(--vq-text);overflow:hidden;'
        + 'text-overflow:ellipsis;white-space:nowrap">' + esc(form ? form.title : "フォーム") + "</div>"
        + '<div class="wp-top__sp"></div>'
        + (o.preview ? U.chip("あなたが作ったフォーム", "accent") : "")
        + "</div>";
    }
    function navRow(multi) {
      if (closed) return "";
      var last = !multi || secIdx >= form.sections.length - 1;
      return '<div class="wp-inline" style="justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:8px">'
        + "<span>" + (multi && secIdx > 0 ? btn({ icon: "back", label: "前へ", act: "prev", variant: "outline" }) : "")
        + "</span>"
        + "<span>"
        + btn({ label: "保存して後で続ける", act: "save-later", variant: "outline" })
        + (last
          ? btn({ label: sending ? "送信中…" : "送信する", act: "submit", variant: "primary",
            icon: "check", disabled: sending })
          : btn({ label: "次へ", act: "next", variant: "primary", icon: "chevronR" }))
        + "</span></div>";
    }
    function doneView() {
      var s = done;
      return '<div class="wp">' + topBar() + '<div class="wp-main"><div class="wpf-wrap">'
        + '<div class="wp-empty"><div class="wp-empty__i" style="background:var(--vq-success-bg);color:var(--vq-success-text)">'
        + icon("check") + "</div>"
        + '<div class="wp-empty__t">送信しました</div>'
        + '<div class="wp-empty__d" style="white-space:pre-wrap">' + esc(s.message || "") + "</div>"
        + (s.score ? '<div class="wpf-stat" style="max-width:340px;margin:0 auto 16px">'
          + '<div class="wpf-stat__c"><div class="wpf-stat__n">' + s.score.points + " / " + s.score.max + "</div>"
          + '<div class="wpf-stat__l">得点</div></div>'
          + '<div class="wpf-stat__c"><div class="wpf-stat__n">' + s.score.correct + " / " + s.score.total + "</div>"
          + '<div class="wpf-stat__l">正解数</div></div></div>' : "")
        + (s.score && s.score.details.length
          ? '<div style="text-align:left;max-width:520px;margin:0 auto">'
            + s.score.details.map(function (d) {
              return '<div class="wpf-card"><div class="wpf-card__q">'
                + (d.correct ? U.chip("正解", "ok") : U.chip("不正解", "err")) + " " + esc(d.label) + "</div>"
                + (d.feedback ? '<div class="wpf-card__d">' + esc(d.feedback) + "</div>" : "") + "</div>";
            }).join("") + "</div>"
          : "")
        + btn({ label: "閉じる", act: "close", variant: "primary", cls: "is-lg" })
        + "</div></div></div></div>";
    }
    function paintErrors() {
      Object.keys(errs).forEach(function (id) {
        var el = api.root.querySelector('[data-err="' + id + '"]');
        if (el) el.textContent = errs[id];
      });
      var first = Object.keys(errs)[0];
      if (first) {
        var card = api.root.querySelector('[data-q="' + first + '"]');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    function collect() {
      var formEl = api.root.querySelector('[data-role="form"]');
      if (!formEl || !form) return;
      var got = WP.formsRender.read(formEl, form.sections);
      Object.keys(got).forEach(function (k) { values[k] = got[k]; });
    }

    function bind() {
      api.root.addEventListener("click", function (e) {
        var pick = e.target.closest ? e.target.closest("[data-pick]") : null;
        if (pick) {
          e.preventDefault();
          var nm = pick.getAttribute("data-pick");
          var hidden = api.root.querySelector('input[type="hidden"][name="' + nm + '"]');
          if (hidden) hidden.value = pick.getAttribute("data-v");
          var fid = nm.replace(/^f_/, "");
          values[fid] = Number(pick.getAttribute("data-v"));
          render();
          return;
        }
        var rk = e.target.closest ? e.target.closest("[data-rk]") : null;
        if (rk) {
          e.preventDefault();
          moveRank(rk);
          return;
        }
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var act = t.getAttribute("data-act");
        if (act === "close") { api.close("user"); return; }
        if (act === "prev") { collect(); secIdx = Math.max(0, secIdx - 1); errs = {}; render(); return; }
        if (act === "next") { goNext(); return; }
        if (act === "save-later") { collect(); draftSet(publicId, values);
          api.toast("この端末に保存しました。あとで同じ URL を開くと続きから答えられます。", "ok", 5000); return; }
        if (act === "submit") { submit(); return; }
      });
      api.root.addEventListener("change", function () { collect(); });
      api.root.addEventListener("input", function () { collect(); });
    }
    function moveRank(btnEl) {
      var box = btnEl.closest("[data-rank]");
      var row = btnEl.closest("[data-oi]");
      if (!box || !row) return;
      var rows = Array.prototype.slice.call(box.querySelectorAll("[data-oi]"));
      var i = rows.indexOf(row);
      var j = i + (btnEl.getAttribute("data-rk") === "up" ? -1 : 1);
      if (j < 0 || j >= rows.length) return;
      var order = rows.map(function (r) { return Number(r.getAttribute("data-oi")); });
      var t = order[i]; order[i] = order[j]; order[j] = t;
      var hidden = box.parentNode.querySelector('input[type="hidden"]');
      if (hidden) hidden.value = order.join(",");
      var fid = box.getAttribute("data-rank");
      values[fid] = order;
      render();
    }
    function goNext() {
      collect();
      errs = WP.formsRender.validate(form.sections, values, secIdx);
      if (Object.keys(errs).length) { render(); return; }
      var n = WP.formsRender.nextSection(form.logic, form.sections, secIdx, values);
      if (n === -2) { submit(); return; }
      secIdx = n;
      errs = {};
      render();
    }
    function submit() {
      collect();
      errs = WP.formsRender.validate(form.sections, values);
      if (Object.keys(errs).length) {
        /* エラーのある最初のセクションへ戻す */
        var firstId = Object.keys(errs)[0];
        form.sections.some(function (s, i) {
          if ((s.fields || []).some(function (f) { return f.id === firstId; })) { secIdx = i; return true; }
          return false;
        });
        render();
        api.toast("未回答または誤りの項目があります。", "error", 5000);
        return;
      }
      if (o.preview) {
        api.toast("これはプレビューです。記録はされません。", "info", 5000);
        return;
      }
      sending = true;
      render();
      ST.api("POST", "/api/workplace/form/respond", {
        publicId: publicId, answers: values, deviceKey: deviceKey(),
        durationMs: Date.now() - startedAt
      }).then(function (r) {
        draftSet(publicId, null);
        done = { message: r.message || "回答を受け付けました。", score: gradeAll() };
        sending = false;
        render();
        if (r.redirectUrl) {
          root.setTimeout(function () { try { root.location.href = r.redirectUrl; } catch (e) {} }, 1800);
        }
      }).catch(function (e) {
        sending = false;
        render();
        api.toast("送信できませんでした: " + e.message, "error", 8000);
      });
    }
    /* 採点モードのときだけ、その場で点を出す（§16.12）。 */
    function gradeAll() {
      if (!form.settings || !form.settings.graded) return null;
      var points = 0, max = 0, correct = 0, total = 0, details = [];
      (form.sections || []).forEach(function (s) {
        (s.fields || []).forEach(function (f) {
          if (FF.isDecoration(f.type)) return;
          var g = FF.grade(f, values[f.id]);
          if (!g) return;
          total++;
          max += g.max;
          points += g.points;
          if (g.correct) correct++;
          details.push({ label: f.label, correct: g.correct, feedback: g.feedback });
        });
      });
      return total ? { points: points, max: max, correct: correct, total: total, details: details } : null;
    }

    return api;
  }

  /* URL に ?wpform=<publicId> があれば、開いた瞬間に回答画面を出す。
     編集画面へは行かせない。 */
  function autoOpen() {
    try {
      var m = /[?&]wpform=([A-Za-z0-9_-]+)/.exec(root.location.search || "");
      if (!m) return false;
      open({ publicId: m[1] });
      return true;
    } catch (e) { return false; }
  }

  WP.formsPublic = { open: open, autoOpen: autoOpen };
})(typeof globalThis !== "undefined" ? globalThis : this);
