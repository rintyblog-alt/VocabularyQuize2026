/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — ホーム（§5 / §6）
   ・4 製品のランチャーで終わらせない。作ったものが並ぶ「置き場」を主にする。
   ・カードの表紙は種類ごとの色と模様。中身のプレビューも出す（§6.1）。
   ・並べるのは、開ける・動く操作だけ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store, U = WP.ui, T = WP.templates;
  var doc = root.document;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  var TABS = [
    { id: "all", label: "すべて" },
    { id: "docs", label: "Docs", itemType: "document" },
    { id: "sheets", label: "Sheets", itemType: "spreadsheet" },
    { id: "slides", label: "Slides", itemType: "presentation" },
    { id: "forms", label: "Forms", itemType: "form" },
    { id: "shared", label: "共有" },
    { id: "fav", label: "お気に入り" },
    { id: "recent", label: "最近使用" },
    { id: "templates", label: "テンプレート" },
    { id: "trash", label: "ゴミ箱" }
  ];

  var state = null;

  function open(o) {
    o = o || {};
    var prefs = ST.prefs();
    state = {
      tab: o.tab || prefs.defaultTab || "all",
      query: "", sort: prefs.sort, view: prefs.view,
      items: [], loading: true, source: "", error: null,
      tplType: o.tplType || "document", tplCat: ""
    };

    var api = VQ2.ui.mount("vq-workplace", {
      title: "Vocabu Workplace",
      css: WP.CSS || "",
      onClose: function () { if (o.onClose) o.onClose(); }
    });
    state.api = api;
    render();
    load();
    bind();
    return api;

    function load() {
      state.loading = true;
      var opts = { status: state.tab === "trash" ? "trashed" : "active" };
      ST.list(opts).then(function (r) {
        state.items = r.items || [];
        state.source = r.source;
        state.error = r.error || null;
        state.signedIn = r.signedIn;
        state.loading = false;
        render();
      }).catch(function (e) {
        state.loading = false; state.error = e; render();
      });
    }

    function visible() {
      var t = TABS.filter(function (x) { return x.id === state.tab; })[0] || TABS[0];
      var out = state.items.slice();
      if (t.itemType) out = out.filter(function (i) { return i.itemType === t.itemType; });
      if (state.tab === "fav") out = out.filter(function (i) { return i.favorite; });
      if (state.tab === "shared") out = out.filter(function (i) { return i.visibility && i.visibility !== "private"; });
      if (state.tab === "recent") {
        out = out.filter(function (i) { return i.lastOpenedAt; })
          .sort(function (a, b) { return String(b.lastOpenedAt).localeCompare(String(a.lastOpenedAt)); })
          .slice(0, 24);
        return filterQuery(out);
      }
      out.sort(function (a, b) {
        if (state.sort === "name") return String(a.title).localeCompare(String(b.title), "ja");
        if (state.sort === "created") return String(b.createdAt).localeCompare(String(a.createdAt));
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
      return filterQuery(out);
    }
    function filterQuery(list) {
      var q = state.query.trim().toLowerCase();
      if (!q) return list;
      return list.filter(function (i) {
        var hay = (i.title + " " + (i.description || "") + " " + previewText(i)).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    function previewText(i) {
      var p = i.preview || {};
      if (p.kind === "document") return (p.lines || []).map(function (l) { return l.t; }).join(" ");
      if (p.kind === "presentation") return String(p.title || "");
      return "";
    }

    function render() {
      api.root.innerHTML =
        '<div class="wp">' + topBar() + '<div class="wp-main"><div class="wp-home">'
        + (state.tab === "templates" ? templatesView() : mainView())
        + "</div></div>"
        + '<button class="wp-fab" data-act="fab" aria-label="新しく作る">' + icon("plus") + "</button>"
        + "</div>";
    }

    function topBar() {
      return '<div class="wp-top">'
        + btn({ icon: "back", iconOnly: true, label: "閉じる", act: "close" })
        + '<span class="wp-quick__i" style="width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#2b70ef,#7b3fe4)">'
        + icon("layers") + "</span>"
        + '<div style="font:var(--vq-type-heading-sm);color:var(--vq-text)">Vocabu Workplace</div>'
        + '<div class="wp-top__sp"></div>'
        + btn({ icon: "search", iconOnly: true, label: "コマンドを探す（Ctrl+K）", act: "palette" })
        + btn({ icon: "settings", iconOnly: true, label: "Workplace の設定", act: "settings" })
        + "</div>";
    }

    function mainView() {
      if (state.tab === "trash") return trashView();
      var list = visible();
      return hero() + quick() + tabs() + filters()
        + (state.loading ? loadingCards() : (list.length ? grid(list) : emptyView()));
    }

    function hero() {
      var warn = "";
      if (!ST.isSignedIn()) {
        warn = '<div class="wp-ai__scope" style="background:var(--vq-warning-bg);color:var(--vq-warning-text)">'
          + "ログインしていません。作ったファイルは<b>この端末にだけ</b>保存されます。"
          + "ログインすると、同じ内容が他の端末からも開けるようになります。</div>";
      } else if (state.source === "local" && state.error) {
        warn = '<div class="wp-ai__scope" style="background:var(--vq-warning-bg);color:var(--vq-warning-text)">'
          + "サーバーへつながらないため、端末に残っている内容を出しています。"
          + "編集は端末に保存し、つながったときに同期します。</div>";
      }
      return '<h1 class="wp-hero__t">Vocabu Workplace</h1>'
        + '<p class="wp-hero__s">文書、表、スライド、フォームを、ひとつの場所で作成・保存・共有できます。</p>'
        + warn;
    }

    function quick() {
      return '<div class="wp-quick">' + M.APPS.map(function (a) {
        return '<button type="button" class="wp-quick__c" data-act="new" data-type="' + a.itemType + '">'
          + '<span class="wp-quick__i" style="background:' + esc(a.accent) + '">' + icon(a.icon) + "</span>"
          + "<span><span class=\"wp-quick__n\">" + esc(newLabel(a.itemType)) + "</span>"
          + '<span class="wp-quick__d">' + esc(a.desc) + "</span></span></button>";
      }).join("") + "</div>";
    }
    function newLabel(t) {
      return { document: "新しい文書", spreadsheet: "新しい表", presentation: "新しいスライド",
        form: "新しいフォーム" }[t];
    }

    function tabs() {
      return '<div class="wp-tabs" role="tablist">' + TABS.map(function (t) {
        return '<button type="button" class="wp-tab" role="tab" data-act="tab" data-tab="' + t.id
          + '" aria-selected="' + (state.tab === t.id ? "true" : "false") + '">' + esc(t.label) + "</button>";
      }).join("") + "</div>";
    }

    function filters() {
      return '<div class="wp-filters">'
        + '<label class="wp-search">' + icon("search")
        + '<input type="search" placeholder="名前や中身で探す" value="' + esc(state.query)
        + '" data-act="q" aria-label="ファイルを検索" /></label>'
        + '<select class="wp-sel" style="width:auto" data-act="sort" aria-label="並び順">'
        + '<option value="updated"' + (state.sort === "updated" ? " selected" : "") + ">更新が新しい順</option>"
        + '<option value="created"' + (state.sort === "created" ? " selected" : "") + ">作成が新しい順</option>"
        + '<option value="name"' + (state.sort === "name" ? " selected" : "") + ">名前順</option>"
        + "</select>"
        + '<div class="wp-top__grp">'
        + btn({ icon: "grid", iconOnly: true, label: "カード表示", act: "view", val: "card", on: state.view === "card" })
        + btn({ icon: "layout", iconOnly: true, label: "コンパクト表示", act: "view", val: "compact", on: state.view === "compact" })
        + btn({ icon: "listUl", iconOnly: true, label: "リスト表示", act: "view", val: "list", on: state.view === "list" })
        + "</div></div>";
    }

    function loadingCards() {
      var one = '<div class="wp-card"><div class="wp-card__banner" style="background:var(--vq-surface-sunken)"></div>'
        + '<div class="wp-card__b"><div style="height:12px;width:70%;background:var(--vq-surface-sunken);border-radius:4px"></div>'
        + '<div style="height:10px;width:40%;background:var(--vq-surface-sunken);border-radius:4px"></div></div></div>';
      return '<div class="wp-grid" aria-busy="true" role="status">' + one + one + one + one + "</div>";
    }

    function grid(list) {
      return '<div class="wp-grid is-' + esc(state.view) + '">'
        + list.map(cardHtml).join("") + "</div>";
    }

    function cardHtml(it) {
      var app = M.appOf(it.itemType) || M.APPS[0];
      var ap = it.appearance || {};
      var banner = ap.bannerType === "image" && ap.coverImageUrl
        ? 'background-image:url(' + esc(ap.coverImageUrl) + ');background-size:cover'
        : "background:" + esc(ap.bannerValue || app.accent);
      return '<div class="wp-card" tabindex="0" role="button" data-act="open" data-id="' + esc(it.id) + '"'
        + ' aria-label="' + esc(it.title) + " を開く" + '">'
        + '<div class="wp-card__banner" style="' + banner + '">' + previewHtml(it)
        + '<span class="wp-card__badge">' + icon(app.icon) + "</span>"
        + '<div class="wp-card__acts">'
        + '<button type="button" class="wp-card__act' + (it.favorite ? " is-on" : "")
        + '" data-act="fav" data-id="' + esc(it.id) + '" aria-label="お気に入り" aria-pressed="'
        + (it.favorite ? "true" : "false") + '">' + (it.favorite ? U.iconFill("star") : icon("star")) + "</button>"
        + '<button type="button" class="wp-card__act" data-act="menu" data-id="' + esc(it.id)
        + '" aria-label="メニュー">' + icon("more") + "</button>"
        + "</div></div>"
        + '<div class="wp-card__b">'
        + '<div class="wp-card__t">' + esc(it.title) + "</div>"
        + '<div class="wp-card__m"><span>' + esc(app.short) + "</span><span>·</span><span>"
        + esc(U.fmtDate(it.updatedAt)) + "</span>" + metaChips(it) + "</div>"
        + "</div></div>";
    }
    function metaChips(it) {
      var out = "";
      var p = it.preview || {};
      if (p.kind === "form") {
        out += "<span>·</span><span>" + (p.questions || 0) + " 問</span>";
        if (!p.accepting) out += U.chip("受付停止", "warn");
      }
      if (p.kind === "presentation" && p.count) out += "<span>·</span><span>" + p.count + " 枚</span>";
      if (p.kind === "spreadsheet" && p.sheets) out += "<span>·</span><span>" + p.sheets + " シート</span>";
      if (p.kind === "document" && p.chars) out += "<span>·</span><span>" + p.chars + " 字</span>";
      if (it.visibility === "public") out += U.chip("公開", "ok");
      else if (it.visibility === "link") out += U.chip("リンク限定", "accent");
      if (it.__localOnly) out += U.chip("この端末のみ", "warn");
      return out;
    }
    /* カードの中のプレビュー（§6.1）。本文をすべて読み込まず、保存時に作った要約から描く。 */
    function previewHtml(it) {
      var p = it.preview || {};
      if (p.kind === "document" && (p.lines || []).length) {
        return '<div class="wp-card__prev is-doc">' + p.lines.slice(0, 5).map(function (l) {
          var head = /^heading/.test(l.k);
          return "<div" + (head ? ' class="h"' : "") + ">" + esc(l.t) + "</div>";
        }).join("") + "</div>";
      }
      if (p.kind === "spreadsheet" && (p.grid || []).length) {
        return '<div class="wp-card__prev"><table class="wp-card__ptable">'
          + p.grid.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
          }).join("") + "</table></div>";
      }
      if (p.kind === "presentation" && p.title) {
        return '<div class="wp-card__prev" style="display:grid;place-items:center;text-align:center">'
          + '<div style="font-weight:700;color:var(--vq-text)">' + esc(p.title) + "</div></div>";
      }
      if (p.kind === "form") {
        return '<div class="wp-card__prev" style="display:flex;align-items:flex-end;padding-bottom:14px">'
          + '<div><div style="font-weight:700;color:var(--vq-text)">' + esc(it.title) + "</div>"
          + "<div>" + (p.questions || 0) + " 問 · " + (p.accepting ? "受付中" : "停止中") + "</div></div></div>";
      }
      return "";
    }

    function emptyView() {
      var isSearch = !!state.query.trim();
      return '<div class="wp-empty"><div class="wp-empty__i">' + icon(isSearch ? "search" : "layers") + "</div>"
        + '<div class="wp-empty__t">' + (isSearch ? "見つかりませんでした" : "まだ何もありません") + "</div>"
        + '<div class="wp-empty__d">'
        + (isSearch ? "別の言葉で探すか、絞り込みを外してみてください。"
          : "上のカードから、文書・表・スライド・フォームを作れます。テンプレートから始めることもできます。")
        + "</div>"
        + (isSearch ? btn({ label: "検索を消す", act: "clearq", variant: "outline" })
          : btn({ label: "テンプレートから作る", act: "tab", val: "templates", variant: "primary", icon: "layers" }))
        + "</div>";
    }

    function trashView() {
      var list = visible();
      return '<h1 class="wp-hero__t">ゴミ箱</h1>'
        + '<p class="wp-hero__s">' + ST.prefs().trashDays + " 日たつと自動では消えません。完全に消すときは「完全に削除」を選びます。</p>"
        + tabs()
        + (list.length ? grid(list) : '<div class="wp-empty"><div class="wp-empty__i">' + icon("trash")
          + '</div><div class="wp-empty__t">ゴミ箱は空です</div></div>');
    }

    function templatesView() {
      var cats = T.categories(state.tplType);
      var list = T.all(state.tplType).filter(function (t) {
        return !state.tplCat || t.category === state.tplCat;
      });
      return '<h1 class="wp-hero__t">テンプレート</h1>'
        + '<p class="wp-hero__s">選ぶと写しが作られます。テンプレートそのものは変わりません。</p>'
        + tabs()
        + '<div class="wp-filters">'
        + '<select class="wp-sel" style="width:auto" data-act="tpltype" aria-label="種類">'
        + M.APPS.map(function (a) {
          return '<option value="' + a.itemType + '"' + (state.tplType === a.itemType ? " selected" : "")
            + ">" + esc(a.name) + "</option>";
        }).join("") + "</select>"
        + '<select class="wp-sel" style="width:auto" data-act="tplcat" aria-label="分類">'
        + '<option value="">すべての分類</option>'
        + cats.map(function (c) {
          return '<option value="' + esc(c) + '"' + (state.tplCat === c ? " selected" : "") + ">" + esc(c) + "</option>";
        }).join("") + "</select></div>"
        + '<div class="wp-tpl">' + list.map(function (t) {
          return '<button type="button" class="wp-tpl__c" data-act="usetpl" data-id="' + esc(t.id) + '">'
            + '<div class="wp-tpl__b" style="background:' + esc(t.appearance.bannerValue) + '"></div>'
            + '<div class="wp-tpl__t">' + esc(t.title) + "</div>"
            + '<div class="wp-tpl__d">' + esc(t.description) + "</div></button>";
        }).join("") + "</div>";
    }

    /* ── 操作 ─────────────────────────────────────────────────── */
    function bind() {
      api.root.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var act = t.getAttribute("data-act");
        var id = t.getAttribute("data-id");
        if (act === "close") { api.close("user"); return; }
        if (act === "palette") { openPalette(); return; }
        if (act === "settings") { WP.settings.open(api, function () { render(); }); return; }
        if (act === "tab") { state.tab = t.getAttribute("data-tab") || t.getAttribute("data-val");
          state.query = ""; render(); if (state.tab === "trash" || state.tab === "all") load(); return; }
        if (act === "view") { state.view = t.getAttribute("data-val"); ST.setPrefs({ view: state.view }); render(); return; }
        if (act === "clearq") { state.query = ""; render(); return; }
        if (act === "new") { create(t.getAttribute("data-type")); return; }
        if (act === "fab") { newSheet(); return; }
        if (act === "usetpl") { useTemplate(id); return; }
        if (act === "fav") { e.stopPropagation(); toggleFav(id); return; }
        if (act === "menu") { e.stopPropagation(); cardMenu(id, t); return; }
        if (act === "open") { openItem(id); return; }
      });
      api.root.addEventListener("keydown", function (e) {
        var card = e.target.closest ? e.target.closest('.wp-card[data-act="open"]') : null;
        if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openItem(card.getAttribute("data-id")); }
        if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); openPalette(); }
      });
      api.root.addEventListener("input", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        if (t.getAttribute("data-act") === "q") {
          state.query = t.value;
          var box = api.root.querySelector(".wp-grid");
          var list = visible();
          if (box) box.outerHTML = list.length ? grid(list) : emptyView();
          else { var empty = api.root.querySelector(".wp-empty");
            if (empty) empty.outerHTML = list.length ? grid(list) : emptyView(); }
        }
      });
      api.root.addEventListener("change", function (e) {
        var t = e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) return;
        var a = t.getAttribute("data-act");
        if (a === "sort") { state.sort = t.value; ST.setPrefs({ sort: t.value }); render(); }
        else if (a === "tpltype") { state.tplType = t.value; state.tplCat = ""; render(); }
        else if (a === "tplcat") { state.tplCat = t.value; render(); }
      });
    }

    function newSheet() {
      U.sheet(api.root, {
        title: "新しく作る",
        html: M.APPS.map(function (a) {
          return '<button type="button" class="wp-cmd__i" data-type="' + a.itemType + '">'
            + icon(a.icon) + "<span>" + esc(newLabel(a.itemType)) + "</span></button>";
        }).join("")
          + '<button type="button" class="wp-cmd__i" data-type="__tpl">' + icon("layers")
          + "<span>テンプレートから作る</span></button>",
        onOpen: function (body, close) {
          body.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-type]") : null;
            if (!t) return;
            close();
            var v = t.getAttribute("data-type");
            if (v === "__tpl") { state.tab = "templates"; render(); }
            else create(v);
          });
        }
      });
    }

    function create(itemType) {
      ST.create(itemType, {}).then(function (r) {
        state.items.unshift(r.item);
        openEditor(r.item, r.content);
        if (r.error) api.toast("サーバーへ保存できませんでした。端末に保存しています。", "warn", 5000);
      }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error"); });
    }
    function useTemplate(id) {
      var spec = T.instantiate(id);
      if (!spec) return;
      ST.create(spec.itemType, spec).then(function (r) {
        state.items.unshift(r.item);
        openEditor(r.item, r.content);
      }).catch(function (e) { api.toast("作れませんでした: " + e.message, "error"); });
    }
    function openItem(id) {
      var it = null;
      state.items.some(function (x) { if (x.id === id) { it = x; return true; } return false; });
      if (it && it.status === "trashed") {
        api.toast("ゴミ箱のファイルです。先に元へ戻してください。", "warn");
        return;
      }
      api.toast("開いています…", "info", 1200);
      ST.open(id).then(function (r) {
        if (r.recovery) askRecovery(r);
        else openEditor(r.item, r.content);
      }).catch(function (e) { api.toast("開けませんでした: " + e.message, "error", 6000); });
    }
    /* 端末に未同期の変更が残っていた場合（§10.2）。勝手にどちらかを消さない。 */
    function askRecovery(r) {
      api.confirm({
        title: "端末に未同期の変更があります",
        message: "この端末で保存された " + U.fmtDate(r.recovery.at) + " の変更が残っています。どちらを開きますか。",
        okText: "端末の変更を復元する", cancelText: "サーバー版を使う"
      }).then(function (useLocal) {
        openEditor(r.item, useLocal ? r.recovery.content : r.content);
        if (!useLocal) ST.pendingSet(r.item.id, null);
      });
    }
    function openEditor(item, content) {
      var mod = { document: WP.docs, spreadsheet: WP.sheets, presentation: WP.slides, form: WP.forms }[item.itemType];
      if (!mod || typeof mod.open !== "function") {
        api.toast("この種類はまだ開けません。", "error");
        return;
      }
      mod.open({ item: item, content: content, onClose: function () { open({ tab: state.tab }); } });
    }
    function toggleFav(id) {
      var it = null;
      state.items.some(function (x) { if (x.id === id) { it = x; return true; } return false; });
      if (!it) return;
      it.favorite = !it.favorite;
      ST.meta(id, { favorite: it.favorite });
      render();
    }
    function cardMenu(id, anchor) {
      var it = null;
      state.items.some(function (x) { if (x.id === id) { it = x; return true; } return false; });
      if (!it) return;
      var app = M.appOf(it.itemType);
      var items;
      if (it.status === "trashed") {
        items = [
          { label: "元に戻す", icon: "restore", run: function () {
            ST.meta(id, { action: "restore" }).then(function () { api.toast("元に戻しました", "ok"); load(); }); } },
          { label: "完全に削除", icon: "trash", danger: true, run: function () {
            api.confirm({ title: "完全に削除しますか", message: "この操作は取り消せません。", okText: "削除" })
              .then(function (yes) { if (!yes) return;
                ST.meta(id, { action: "purge" }).then(function () { api.toast("削除しました", "ok"); load(); }); }); } }
        ];
      } else {
        items = [
          { label: "開く", icon: "eye", run: function () { openItem(id); } },
          { label: "名前を変更", icon: "type", run: function () { renameDialog(it); } },
          { label: "複製を作る", icon: "copy", run: function () {
            ST.duplicate(id).then(function (r) { api.toast("複製しました", "ok"); load(); })
              .catch(function (e) { api.toast("複製できませんでした: " + e.message, "error"); }); } },
          { label: it.favorite ? "お気に入りから外す" : "お気に入りに入れる", icon: "star",
            run: function () { toggleFav(id); } },
          { label: "表紙を変える", icon: "palette", run: function () { bannerDialog(it); } }
        ];
        /* 種類ごとの操作。実装があるものだけ並べる。 */
        if (it.itemType === "form") {
          items.push({ label: "回答ページを開く", icon: "globe", run: function () { openPublic(it); } });
          items.push({ label: "回答結果を見る", icon: "chart", run: function () {
            ST.open(id).then(function (r) {
              WP.forms.open({ item: r.item, content: r.content, startTab: "responses",
                onClose: function () { open({ tab: state.tab }); } });
            }); } });
        }
        items.push({ label: "他の形式へ変換", icon: "layers", run: function () { convertDialog(it); } });
        items.push({ label: "ゴミ箱へ移動", icon: "trash", danger: true, run: function () {
          if (!ST.prefs().confirmDelete) { doTrash(); return; }
          api.confirm({ title: "ゴミ箱へ移動しますか", message: "ゴミ箱から元へ戻せます。", okText: "移動" })
            .then(function (yes) { if (yes) doTrash(); });
          function doTrash() {
            ST.meta(id, { action: "trash" }).then(function () { api.toast("ゴミ箱へ移動しました", "ok"); load(); });
          }
        } });
      }
      U.sheet(api.root, {
        title: it.title,
        html: items.map(function (x, i) {
          return '<button type="button" class="wp-cmd__i" data-i="' + i + '">'
            + icon(x.icon) + "<span>" + esc(x.label) + "</span></button>";
        }).join(""),
        onOpen: function (body, close) {
          body.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-i]") : null;
            if (!t) return;
            close();
            items[Number(t.getAttribute("data-i"))].run();
          });
        }
      });
    }
    function openPublic(it) {
      if (!it.publicId) {
        api.toast("まだ公開されていません。共有の設定から公開してください。", "warn", 5000);
        return;
      }
      WP.formsPublic.open({ publicId: it.publicId, preview: true });
    }
    function renameDialog(it) {
      U.sheet(api.root, {
        title: "名前を変更",
        html: '<div class="wp-row"><label class="wp-lab" for="wpn">ファイル名</label>'
          + '<input class="wp-in" id="wpn" value="' + esc(it.title) + '" /></div>'
          + btn({ label: "変更する", variant: "primary", act: "ok", cls: "is-lg" }),
        onOpen: function (body, close) {
          var inp = body.querySelector("#wpn");
          try { inp.focus(); inp.select(); } catch (e) {}
          function go() {
            var v = inp.value.trim();
            if (!v) return;
            it.title = v;
            ST.meta(it.id, { title: v }).then(function () { close(); render(); api.toast("名前を変えました", "ok"); });
          }
          body.addEventListener("click", function (e) {
            if (e.target.closest && e.target.closest('[data-act="ok"]')) go();
          });
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
        }
      });
    }
    function bannerDialog(it) {
      U.sheet(api.root, {
        title: "表紙を選ぶ",
        html: '<div class="wp-tpl">' + M.GRADIENTS.map(function (g) {
          return '<button type="button" class="wp-tpl__c" data-g="' + esc(g.value) + '">'
            + '<div class="wp-tpl__b" style="background:' + esc(g.value) + '"></div>'
            + '<div class="wp-tpl__t">' + esc(g.label) + "</div></button>";
        }).join("") + "</div>",
        onOpen: function (body, close) {
          body.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-g]") : null;
            if (!t) return;
            it.appearance = it.appearance || {};
            it.appearance.bannerType = "gradient";
            it.appearance.bannerValue = t.getAttribute("data-g");
            ST.meta(it.id, { appearance: it.appearance }).then(function () { close(); render(); });
          });
        }
      });
    }
    function convertDialog(it) {
      var targets = WP.convert.targetsFor(it.itemType);
      if (!targets.length) { api.toast("この種類から変換できる先はまだありません。", "warn"); return; }
      U.sheet(api.root, {
        title: "他の形式へ変換",
        html: '<div class="wp-lab">元のファイルはそのまま残り、新しいファイルが作られます。</div>'
          + targets.map(function (t, i) {
            return '<button type="button" class="wp-cmd__i" data-i="' + i + '">'
              + icon(t.icon) + "<span>" + esc(t.label) + "</span></button>";
          }).join(""),
        onOpen: function (body, close) {
          body.addEventListener("click", function (e) {
            var t = e.target.closest ? e.target.closest("[data-i]") : null;
            if (!t) return;
            close();
            var target = targets[Number(t.getAttribute("data-i"))];
            api.toast("変換しています…", "info");
            ST.open(it.id).then(function (r) { return WP.convert.run(target.id, r.item, r.content); })
              .then(function (created) {
                api.toast("「" + created.item.title + "」を作りました", "ok", 4000);
                load();
              })
              .catch(function (e2) { api.toast("変換できませんでした: " + e2.message, "error", 6000); });
          });
        }
      });
    }

    function openPalette() {
      var cmds = [];
      M.APPS.forEach(function (a) {
        cmds.push({ group: "作る", label: newLabel(a.itemType), icon: a.icon,
          keywords: a.name + " " + a.short, run: function () { create(a.itemType); } });
      });
      cmds.push({ group: "作る", label: "テンプレートから作る", icon: "layers",
        run: function () { state.tab = "templates"; render(); } });
      TABS.forEach(function (t) {
        cmds.push({ group: "移動", label: t.label + " を表示", icon: "chevronR",
          run: function () { state.tab = t.id; render(); if (t.id === "trash") load(); } });
      });
      cmds.push({ group: "表示", label: "Workplace の設定", icon: "settings",
        run: function () { WP.settings.open(api, function () { render(); }); } });
      cmds.push({ group: "表示", label: "一覧を読み込み直す", icon: "restore", run: load });
      if (ST.isSignedIn()) cmds.push({ group: "表示", label: "未同期の変更をサーバーへ送る", icon: "upload",
        run: function () {
          ST.syncPending().then(function (r) {
            api.toast(r.synced ? r.synced + " 件を同期しました" : "未同期のものはありません", "ok");
            load();
          });
        } });
      U.palette(api.root, cmds);
    }
  }

  WP.home = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
