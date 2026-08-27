/* ══════════════════════════════════════════════════════════════════════
   プリセットを公開する（モーダル）
   ・これまでは 5 画面のウィザードだった。決めることは 4 つしか無いので、
     **1 枚のモーダルにまとめて、上に「公開したらこう見える」を出す。**
   ・これまでの項目（公開ID・公開名・アイコン・色・注意事項と同意）は残す。
   ・通信と保存はこれまでどおりアプリ側が持ち主（`window.__vqAppData.publish`）。
     ここで二重に実装しない（認証の付け方と保存先がずれる）。
   ・すでに公開しているものは「変更を保存」と「公開をやめる」になる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui;
  var esc = U.esc, btn = U.button;

  function api() {
    try { return (root.__vqAppData && root.__vqAppData.publish) || null; } catch (e) { return null; }
  }
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  var NOTICE = [
    { icon: "visibility", text: "公開すると、ほかの人が見て、解いて、自分の一覧に保存できるようになります。" },
    { icon: "gavel", text: "人を傷つける内容や、公序良俗に反する内容は公開できません。" },
    { icon: "copyright", text: "教科書や問題集の丸写しは公開できません。出典が要るものは出典を書いてください。" },
    { icon: "verified_user", text: "公開したあとでも、名前・アイコン・公開をやめることはいつでもできます。" }
  ];

  function open(o) {
    o = o || {};
    var A = api();
    var id = str(o.presetId || (o.preset && o.preset.id));
    if (!id) return null;

    if (!A) {
      /* 受け口がまだ無い（古い版）。これまでの画面へそのまま渡す。 */
      try { root.__vqPresets && root.__vqPresets.action(id, "publish"); } catch (e) {}
      return null;
    }
    var meta = null;
    try { meta = A.meta(id); } catch (e) { meta = null; }
    if (!meta) {
      try { A.openLegacy(id); } catch (e) {}
      return null;
    }

    var app = U.mount("vq2-preset-publish", {
      title: meta.isPublic ? "公開の設定" : "プリセットを公開する",
      sheet: true, stack: true,
      onResize: function () { render(); },
      onClose: function (why) { if (o.onClose) o.onClose(why, st.published); }
    });
    app.root.classList.add("vq2-pp");

    var st = {
      phase: "form",              /* form | working | done */
      slug: meta.slug || "",
      title: meta.publicTitle || meta.name || "",
      icon: meta.publicIcon || "open_book",
      color: meta.publicIconColor || "blue",
      agreed: !!meta.isPublic,    /* 一度公開したものは、もう同意済み */
      wasPublic: !!meta.isPublic,
      published: false,
      checking: false,
      slugOk: !!meta.isPublic,    /* いま使っている ID はそのまま使える */
      slugMsg: meta.isPublic ? "いま使っている公開IDです。" : "英数字とハイフンで決められます。",
      error: "",
      showIcons: false,
      stopping: false, stopped: false,
      token: 0, timer: 0
    };
    if (!st.slug) {
      try { st.slug = A.suggestSlug(st.title || meta.name); } catch (e) { st.slug = ""; }
      st.slugOk = false;
    }

    var ICONS = [];
    var COLORS = [];
    try { ICONS = A.icons() || []; } catch (e) {}
    try { COLORS = A.colors() || []; } catch (e) {}

    render();
    if (!st.wasPublic && st.slug) queueCheck(st.slug);

    /* ── 公開IDの確認（打つたびには投げない） ─────────────────── */
    function queueCheck(v) {
      if (st.timer) { clearTimeout(st.timer); st.timer = 0; }
      st.timer = setTimeout(function () { st.timer = 0; runCheck(v); }, 260);
    }
    function runCheck(v) {
      var val;
      try { val = A.validateSlug(v); } catch (e) { val = { ok: false, slug: str(v), message: "確認できませんでした。" }; }
      st.slug = str(val.slug);
      st.slugOk = false;
      st.checking = false;
      st.slugMsg = str(val.message) || "英数字とハイフンで決められます。";
      if (!val.ok) { paintSlug(); return; }
      var t = ++st.token;
      st.checking = true;
      st.slugMsg = "使えるか確認しています…";
      paintSlug();
      Promise.resolve().then(function () { return A.checkSlug(st.slug, id); }).then(function (body) {
        if (t !== st.token) return;
        st.checking = false;
        st.slugOk = !!(body && body.available);
        st.slugMsg = str(body && body.message) || (st.slugOk ? "この公開IDは使えます。" : "この公開IDは使えません。");
        paintSlug();
      }, function () {
        if (t !== st.token) return;
        st.checking = false;
        st.slugOk = false;
        st.slugMsg = "確認に時間がかかっています。少し置いてからもう一度お試しください。";
        paintSlug();
      });
    }
    /* 全部描き直すと打っている途中の欄が飛ぶので、状態の行だけ塗り替える。 */
    function paintSlug() {
      var s = app.root.querySelector("[data-slugmsg]");
      if (s) {
        s.textContent = st.slugMsg;
        s.className = "vq2-pp-msg" + (st.checking ? " is-wait" : st.slugOk ? " is-ok" : " is-ng");
      }
      var link = app.root.querySelector("[data-link]");
      if (link) link.textContent = linkText();
      var go = app.root.querySelector('[data-act="go"]');
      if (go) go.disabled = !canSubmit();
    }
    function linkText() {
      try { return A.previewLink(st.slug); } catch (e) { return st.slug; }
    }
    function canSubmit() {
      if (!st.slug || !st.slugOk) return false;
      if (!str(st.title).trim()) return false;
      if (!st.agreed) return false;
      return true;
    }

    /* ── 描画 ─────────────────────────────────────────────── */
    function render() {
      if (st.phase === "working") app.root.innerHTML = workingHtml();
      else if (st.phase === "done") app.root.innerHTML = doneHtml();
      else app.root.innerHTML = headHtml() + formHtml() + footHtml();
      wire();
    }

    function iconOf(idv) {
      for (var i = 0; i < ICONS.length; i++) if (ICONS[i].id === idv) return ICONS[i];
      return ICONS[0] || { id: "open_book", icon: "book_2", label: "Book" };
    }
    function colorOf(idv) {
      for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === idv) return COLORS[i];
      return COLORS[0] || { id: "blue", value: "#315eb7" };
    }
    function ms(n) { return '<span class="vq2-ms" aria-hidden="true">' + esc(n) + "</span>"; }

    /* 上：公開したらこう見える */
    function headHtml() {
      var col = colorOf(st.color).value;
      var ic = iconOf(st.icon).icon;
      return '<div class="vq2-pp-head">'
        + '<div class="vq2-pp-headbar">'
        + btn({ icon: "close", iconOnly: true, variant: "quiet", action: "x", aria: "閉じる" })
        + "</div>"
        + '<div class="vq2-pp-kicker">' + (st.wasPublic ? "いまの公開の見え方" : "公開したら、こう見えます") + "</div>"
        + '<div class="vq2-pp-card">'
        + '<span class="vq2-pp-ico" data-prevIco style="background:' + esc(col) + '">' + ms(ic) + "</span>"
        + '<span class="vq2-pp-copy"><strong data-prevTitle>'
        + esc(str(st.title).trim() || meta.name || "（名称なし）") + "</strong>"
        + '<span class="vq2-pp-link" data-link>' + esc(linkText()) + "</span></span>"
        + "</div></div>";
    }

    function formHtml() {
      return '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
        + '<div class="vq2-pp-scroll">'
        + (st.error ? '<div class="vq2-pp-err">' + ms("error") + "<span>" + esc(st.error) + "</span></div>" : "")
        + slugHtml() + titleHtml() + lookHtml() + noticeHtml()
        + "</div></div></div></div>";
    }

    function slugHtml() {
      return '<section class="vq2-card"><div class="vq2-sec-t">公開先のリンク</div>'
        + '<div class="vq2-hint">この名前で公開ページができます。あとから変えられます。</div>'
        + '<div class="vq2-pp-slug">'
        + '<span class="vq2-pp-pre">vocabuquiz.app/preset/</span>'
        + '<input type="text" data-key="slug" value="' + esc(st.slug) + '" autocomplete="off" spellcheck="false"'
        + ' placeholder="my-preset" aria-label="公開ID">'
        + '<button type="button" class="vq2-pp-mini" data-act="autoslug">自動で決める</button>'
        + "</div>"
        + '<div class="vq2-pp-msg' + (st.checking ? " is-wait" : st.slugOk ? " is-ok" : " is-ng") + '" data-slugmsg aria-live="polite">'
        + esc(st.slugMsg) + "</div>"
        + '<div class="vq2-hint">4〜32 文字。英数字とハイフンだけ。ほかの人が使っている ID は選べません。</div>'
        + "</section>";
    }

    function titleHtml() {
      return '<section class="vq2-card"><div class="vq2-sec-t">公開するときの名前</div>'
        + '<div class="vq2-hint">自分の一覧での名前と別にできます。ここで付けた名前が、ほかの人に見えます。</div>'
        + '<input class="vq2-input vq2-pp-title" type="text" data-key="title" maxlength="80" value="'
        + esc(st.title) + '" placeholder="' + esc(meta.name || "公開時の名前") + '" aria-label="公開するときの名前">'
        + "</section>";
    }

    function lookHtml() {
      var cur = iconOf(st.icon);
      var groups = {};
      var order = [];
      ICONS.forEach(function (x) {
        var k = str(x.category) || "その他";
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(x);
      });
      var h = '<section class="vq2-card"><div class="vq2-sec-t">見た目</div>'
        + '<div class="vq2-pp-look">'
        + '<button type="button" class="vq2-pp-pick" data-act="toggle-icons" aria-expanded="' + (st.showIcons ? "true" : "false") + '">'
        + '<span class="vq2-pp-ico is-sm" style="background:' + esc(colorOf(st.color).value) + '">' + ms(cur.icon) + "</span>"
        + "<span>" + esc(cur.label || "アイコン") + "</span>"
        + ms(st.showIcons ? "expand_less" : "expand_more") + "</button>"
        + '<div class="vq2-pp-colors" role="group" aria-label="アイコンの色">'
        + COLORS.map(function (c) {
            return '<button type="button" class="vq2-pp-col' + (c.id === st.color ? " is-on" : "") + '"'
              + ' data-act="color" data-id="' + esc(c.id) + '" aria-label="' + esc(c.label || c.id) + '"'
              + ' aria-pressed="' + (c.id === st.color ? "true" : "false") + '">'
              + '<span style="background:' + esc(c.value) + '"></span></button>';
          }).join("")
        + "</div></div>";
      if (st.showIcons) {
        h += '<div class="vq2-pp-icons">'
          + order.map(function (k) {
              return '<div class="vq2-pp-icg"><h4>' + esc(k) + "</h4><div class=\"vq2-pp-igrid\">"
                + groups[k].map(function (x) {
                    return '<button type="button" class="vq2-pp-ic' + (x.id === st.icon ? " is-on" : "") + '"'
                      + ' data-act="icon" data-id="' + esc(x.id) + '" title="' + esc(x.label || x.id) + '"'
                      + ' aria-label="' + esc(x.label || x.id) + '" aria-pressed="' + (x.id === st.icon ? "true" : "false") + '">'
                      + ms(x.icon) + "</button>";
                  }).join("")
                + "</div></div>";
            }).join("")
          + "</div>";
      }
      return h + "</section>";
    }

    function noticeHtml() {
      var h = '<section class="vq2-card"><div class="vq2-sec-t">公開する前に</div>'
        + '<ul class="vq2-pp-notice">'
        + NOTICE.map(function (n) {
            return "<li>" + ms(n.icon) + "<span>" + esc(n.text) + "</span></li>";
          }).join("")
        + "</ul>";
      if (!st.wasPublic) {
        h += '<label class="vq2-check vq2-pp-agree"><input type="checkbox" data-key="agreed"'
          + (st.agreed ? " checked" : "") + "><span>読みました。この内容で公開します。</span></label>";
      }
      return h + "</section>";
    }

    function footHtml() {
      var label = st.wasPublic ? "変更を保存" : "公開する";
      return '<div class="vq2-pp-foot">'
        + (st.wasPublic ? btn({ label: "公開をやめる", icon: "eye", variant: "quiet", action: "stop" }) : "")
        + '<div class="vq2-top-sp"></div>'
        + btn({ label: "閉じる", variant: "quiet", action: "x" })
        + btn({ label: label, icon: "share", variant: "primary", action: "go", disabled: !canSubmit() })
        + "</div>";
    }

    function workingHtml() {
      return '<div class="vq2-pp-mid">'
        + '<div class="vq2-pp-spin" aria-hidden="true"></div>'
        + "<h3>" + (st.stopping ? "公開をやめています" : "公開しています") + "</h3>"
        + "<p>設定を保存して、公開ページと一覧の表示を用意しています。</p>"
        + '<div class="vq2-pp-link">' + esc(linkText()) + "</div></div>";
    }

    function doneHtml() {
      if (st.stopped) {
        return '<div class="vq2-pp-mid">'
          + '<div class="vq2-pp-mark is-quiet">' + ms("visibility_off") + "</div>"
          + "<h3>公開をやめました</h3>"
          + "<p>ほかの人からは見えなくなりました。設定はそのまま残っているので、いつでもまた公開できます。</p>"
          + '<div class="vq2-pp-done-acts">' + btn({ label: "閉じる", variant: "primary", action: "x" }) + "</div></div>";
      }
      return '<div class="vq2-pp-mid">'
        + '<div class="vq2-pp-mark">' + ms("check") + "</div>"
        + "<h3>" + (st.wasPublic ? "保存しました" : "公開しました") + "</h3>"
        + "<p>ほかの人が見て、解いて、自分の一覧に保存できるようになりました。</p>"
        + '<div class="vq2-pp-card is-flat">'
        + '<span class="vq2-pp-ico" style="background:' + esc(colorOf(st.color).value) + '">' + ms(iconOf(st.icon).icon) + "</span>"
        + '<span class="vq2-pp-copy"><strong>' + esc(str(st.title).trim() || meta.name) + "</strong>"
        + '<span class="vq2-pp-link">' + esc(linkText()) + "</span></span></div>"
        + '<div class="vq2-pp-done-acts">'
        + btn({ label: "リンクをコピー", icon: "copy", action: "copy" })
        + btn({ label: "閉じる", variant: "primary", action: "x" })
        + "</div></div>";
    }

    /* ── 結線 ─────────────────────────────────────────────── */
    /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
       U.on は外す仕組みを持たないので、描き直すたびに張ると聞き手が増え続ける。 */
    function wire() {
      /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
      if (app.root.__ppWired) return;
      app.root.__ppWired = true;
      var r = app.root;
      U.on(r, "click", '[data-act="x"]', function () { app.close("user"); });
      U.on(r, "input", '[data-key="slug"]', function (e, t) {
        st.slug = t.value;
        st.slugOk = false;
        st.checking = true;
        st.slugMsg = "確認します…";
        paintSlug();
        queueCheck(t.value);
      });
      U.on(r, "input", '[data-key="title"]', function (e, t) {
        st.title = t.value;
        var pv = r.querySelector("[data-prevTitle]");
        if (pv) pv.textContent = str(st.title).trim() || meta.name || "（名称なし）";
        var go = r.querySelector('[data-act="go"]');
        if (go) go.disabled = !canSubmit();
      });
      U.on(r, "change", '[data-key="agreed"]', function (e, t) {
        st.agreed = !!t.checked;
        var go = r.querySelector('[data-act="go"]');
        if (go) go.disabled = !canSubmit();
      });
      U.on(r, "click", '[data-act="autoslug"]', function () {
        try { st.slug = A.suggestSlug(st.title || meta.name); } catch (e) {}
        var box = r.querySelector('[data-key="slug"]');
        if (box) box.value = st.slug;
        st.checking = true; st.slugOk = false; st.slugMsg = "使えるか確認しています…";
        paintSlug();
        runCheck(st.slug);
      });
      U.on(r, "click", '[data-act="toggle-icons"]', function () { st.showIcons = !st.showIcons; render(); });
      U.on(r, "click", '[data-act="icon"]', function (e, t) { st.icon = t.getAttribute("data-id"); render(); });
      U.on(r, "click", '[data-act="color"]', function (e, t) { st.color = t.getAttribute("data-id"); render(); });
      U.on(r, "click", '[data-act="go"]', function () { submit(); });
      U.on(r, "click", '[data-act="stop"]', function () { stop(); });
      U.on(r, "click", '[data-act="copy"]', function () {
        var text = linkText();
        try {
          root.navigator.clipboard.writeText(text).then(function () { app.toast("リンクをコピーしました。", "success"); },
                                                        function () { app.toast("コピーできませんでした。", "warning"); });
        } catch (e) { app.toast("コピーできませんでした。", "warning"); }
      });
    }

    function submit() {
      if (!canSubmit()) return;
      st.error = "";
      st.stopping = false;
      st.phase = "working";
      render();
      Promise.resolve().then(function () {
        return A.submit(id, {
          slug: st.slug, publicTitle: str(st.title).trim(),
          publicIcon: st.icon, publicIconColor: st.color
        });
      }).then(function (res) {
        if (res && res.ok) {
          st.published = true;
          st.stopped = false;
          st.phase = "done";
        } else {
          st.phase = "form";
          st.error = str(res && res.error && res.error.message) || "公開できませんでした。時間をおいてもう一度お試しください。";
        }
        render();
        refreshList();
      }, function (err) {
        st.phase = "form";
        st.error = str(err && err.message) || "公開できませんでした。";
        render();
      });
    }

    function stop() {
      app.confirm({
        title: "公開をやめますか",
        body: "ほかの人からは見えなくなります。設定はそのまま残るので、またいつでも公開できます。",
        okLabel: "公開をやめる", danger: true
      }).then(function (yes) {
        if (!yes) return;
        st.stopping = true;
        st.phase = "working";
        render();
        Promise.resolve().then(function () { return A.unpublish(id); }).then(function (res) {
          if (res && res.ok) { st.stopped = true; st.published = true; st.phase = "done"; }
          else { st.phase = "form"; st.error = str(res && res.error && res.error.message) || "公開をやめられませんでした。"; }
          render();
          refreshList();
        }, function (err) {
          st.phase = "form";
          st.error = str(err && err.message) || "公開をやめられませんでした。";
          render();
        });
      });
    }

    /* 一覧を描き直す（検索の入力は保つ） */
    function refreshList() {
      try {
        var host = root.document.getElementById("vqScreens");
        var box = host && host.shadowRoot && host.shadowRoot.querySelector("[data-search]");
        if (root.__vqPresetSearch) root.__vqPresetSearch(box ? box.value : "");
      } catch (e) {}
    }

    return app;
  }

  function canOpen() {
    var A = api();
    if (!A) return false;
    try { return !!A.available(); } catch (e) { return false; }
  }
  function reason() {
    var A = api();
    if (!A) return "公開の準備ができていません。";
    try { return str(A.reason()); } catch (e) { return ""; }
  }

  VQ2.presetPublish = { open: open, canOpen: canOpen, reason: reason };
})(typeof globalThis !== "undefined" ? globalThis : this);
