/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — アプリ設定（§20）
   ・ここに並べる項目は、すべて実際に効くものだけ。
     読み込みはしても使っていない項目は置かない。
   ・保存は利用者ごと（store の prefs → localStorage、ログイン時はサーバ設定にも同期）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var ST = WP.store, U = WP.ui;
  var esc = U.esc, icon = U.icon, btn = U.btn;

  /* 定義表 1 本。画面はこれを読んで作る。 */
  var GROUPS = [
    { id: "common", label: "Workplace 共通", items: [
      { k: "defaultTab", label: "最初に出すタブ", type: "select",
        options: [["all", "すべて"], ["docs", "Docs"], ["sheets", "Sheets"], ["slides", "Slides"],
          ["forms", "Forms"], ["recent", "最近使用"], ["fav", "お気に入り"]] },
      { k: "view", label: "一覧の見せ方", type: "select",
        options: [["card", "カード"], ["compact", "コンパクト"], ["list", "リスト"]] },
      { k: "sort", label: "並び順", type: "select",
        options: [["updated", "更新が新しい順"], ["created", "作成が新しい順"], ["name", "名前順"]] },
      { k: "mode", label: "表示する機能の量", type: "select",
        options: [["simple", "シンプル"], ["standard", "標準"], ["detail", "詳細"]],
        note: "機能は減りません。最初に見える量だけが変わります。" },
      { k: "autosave", label: "自動保存する", type: "bool" },
      { k: "autosaveMs", label: "自動保存までの待ち（ミリ秒）", type: "number", min: 400, max: 5000 },
      { k: "showSaveState", label: "保存の状態を出す", type: "bool" },
      { k: "confirmDelete", label: "ゴミ箱へ入れる前に確認する", type: "bool" },
      { k: "trashDays", label: "ゴミ箱の保持日数（表示のみ）", type: "number", min: 1, max: 365,
        note: "自動では消しません。完全削除は手動で行います。" },
      { k: "defaultVisibility", label: "作ったときの公開範囲", type: "select",
        options: [["private", "非公開"], ["link", "リンクを知っている人"]] },
      { k: "animation", label: "動きを付ける", type: "bool",
        note: "端末の「視差効果を減らす」設定が優先されます。" }
    ] },
    { id: "docs", label: "Docs", sub: "docs", items: [
      { k: "pageMode", label: "既定のページ表示", type: "select",
        options: [["flow", "ページなし"], ["paper", "A4 風"]] },
      { k: "pageWidth", label: "既定のページ幅（px）", type: "number", min: 480, max: 1200 },
      { k: "outline", label: "アウトラインを開いた状態にする", type: "bool" },
      { k: "counter", label: "文字数を出す", type: "bool" }
    ] },
    { id: "sheets", label: "Sheets", sub: "sheets", items: [
      { k: "rows", label: "新しいシートの行数", type: "number", min: 20, max: 500 },
      { k: "cols", label: "新しいシートの列数", type: "number", min: 5, max: 60 },
      { k: "freezeHeader", label: "1 行目を固定して作る", type: "bool" },
      { k: "csvBom", label: "CSV に BOM を付ける（Excel 用）", type: "bool" }
    ] },
    { id: "slides", label: "Slides", sub: "slides", items: [
      { k: "ratio", label: "既定の比率", type: "select", options: [["16:9", "16:9"], ["4:3", "4:3"]] },
      { k: "theme", label: "既定のテーマ", type: "select",
        options: [["minimal", "Minimal"], ["modern", "Modern"], ["modernPurple", "Modern Purple"],
          ["cosmic", "Cosmic V3"], ["warm", "Warm"], ["ink", "Ink"]] },
      { k: "transition", label: "既定の切り替え", type: "select",
        options: [["none", "なし"], ["fade", "フェード"], ["slide", "スライド"], ["zoom", "ズーム"]] },
      { k: "notes", label: "発表者ノートを開いた状態にする", type: "bool" }
    ] },
    { id: "forms", label: "Forms", sub: "forms", items: [
      { k: "anonymous", label: "既定で匿名にする", type: "bool" },
      { k: "requireLogin", label: "既定でログインを必須にする", type: "bool" },
      { k: "onePerDevice", label: "既定で同じ端末から 1 回だけにする", type: "bool" },
      { k: "progress", label: "既定で進み具合を出す", type: "bool" },
      { k: "showQuestionNumber", label: "既定で質問に番号を付ける", type: "bool" }
    ] }
  ];

  var DEFAULT_SUB = {
    docs: { pageMode: "flow", pageWidth: 800, outline: true, counter: true },
    sheets: { rows: 60, cols: 20, freezeHeader: true, csvBom: true },
    slides: { ratio: "16:9", theme: "minimal", transition: "fade", notes: false },
    forms: { anonymous: true, requireLogin: false, onePerDevice: false, progress: true,
      showQuestionNumber: true }
  };

  function valueOf(prefs, g, item) {
    if (!g.sub) return prefs[item.k];
    var sub = prefs[g.sub] || {};
    var v = sub[item.k];
    return v === undefined ? DEFAULT_SUB[g.sub][item.k] : v;
  }
  function setValue(g, item, v) {
    if (!g.sub) {
      var patch = {};
      patch[item.k] = v;
      ST.setPrefs(patch);
      return;
    }
    var prefs = ST.prefs();
    var sub = Object.assign({}, DEFAULT_SUB[g.sub], prefs[g.sub] || {});
    sub[item.k] = v;
    var p2 = {};
    p2[g.sub] = sub;
    ST.setPrefs(p2);
  }

  function open(api, onChange) {
    var prefs = ST.prefs();
    var h = "";
    GROUPS.forEach(function (g) {
      h += '<div class="wp-lab" style="margin:14px 0 6px;font-weight:600;color:var(--vq-text)">'
        + esc(g.label) + "</div>";
      g.items.forEach(function (it) {
        var v = valueOf(prefs, g, it);
        var id = "st_" + g.id + "_" + it.k;
        if (it.type === "bool") {
          h += '<label class="wp-switch"><input type="checkbox" data-g="' + g.id + '" data-k="' + it.k + '"'
            + (v ? " checked" : "") + " />" + esc(it.label) + "</label>";
        } else if (it.type === "select") {
          h += '<div class="wp-row"><label class="wp-lab" for="' + id + '">' + esc(it.label) + "</label>"
            + '<select class="wp-sel" id="' + id + '" data-g="' + g.id + '" data-k="' + it.k + '">'
            + it.options.map(function (o) {
              return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "")
                + ">" + esc(o[1]) + "</option>";
            }).join("") + "</select></div>";
        } else {
          h += '<div class="wp-row"><label class="wp-lab" for="' + id + '">' + esc(it.label) + "</label>"
            + '<input class="wp-in" id="' + id + '" type="number" value="' + esc(v) + '"'
            + (it.min !== undefined ? ' min="' + it.min + '"' : "")
            + (it.max !== undefined ? ' max="' + it.max + '"' : "")
            + ' data-g="' + g.id + '" data-k="' + it.k + '" /></div>';
        }
        if (it.note) h += '<div class="wp-lab" style="margin:-4px 0 10px">' + esc(it.note) + "</div>";
      });
    });
    h += '<div class="wp-lab" style="margin-top:18px">保存の状態：'
      + (ST.isSignedIn() ? "ログイン済み（サーバーに保存されます）" : "未ログイン（この端末にだけ保存されます）")
      + "</div>";
    if (ST.isSignedIn())
      h += btn({ label: "未同期の変更をサーバーへ送る", act: "sync", variant: "outline", icon: "upload", cls: "is-lg" });

    U.sheet(api.root, {
      title: "Workplace の設定",
      html: h,
      onOpen: function (bodyEl, close) {
        function apply(e) {
          var t = e.target.closest ? e.target.closest("[data-k]") : null;
          if (!t) return;
          var gid = t.getAttribute("data-g"), k = t.getAttribute("data-k");
          var g = GROUPS.filter(function (x) { return x.id === gid; })[0];
          if (!g) return;
          var it = g.items.filter(function (x) { return x.k === k; })[0];
          if (!it) return;
          var v = it.type === "bool" ? t.checked : (it.type === "number" ? Number(t.value) : t.value);
          if (it.type === "number") {
            if (it.min !== undefined) v = Math.max(it.min, v);
            if (it.max !== undefined) v = Math.min(it.max, v);
          }
          setValue(g, it, v);
          if (onChange) onChange();
        }
        bodyEl.addEventListener("change", apply);
        bodyEl.addEventListener("input", function (e) {
          var t = e.target.closest ? e.target.closest("[data-k]") : null;
          if (t && t.type === "number") apply(e);
        });
        bodyEl.addEventListener("click", function (e) {
          if (!e.target.closest || !e.target.closest('[data-act="sync"]')) return;
          ST.syncPending().then(function (r) {
            api.toast(r.synced ? r.synced + " 件を同期しました"
              : (r.skipped ? "ログインが必要です" : "未同期のものはありません"), "ok");
          });
        });
      }
    });
  }

  /* 新規作成のとき、設定を実際に反映する（設定を「置くだけ」にしない）。 */
  function applyToNew(itemType, content) {
    var p = ST.prefs();
    var body = content.content;
    if (itemType === "document") {
      var d = Object.assign({}, DEFAULT_SUB.docs, p.docs || {});
      body.page.mode = d.pageMode;
      body.page.width = d.pageWidth;
    } else if (itemType === "spreadsheet") {
      var s = Object.assign({}, DEFAULT_SUB.sheets, p.sheets || {});
      (body.sheets || []).forEach(function (sh) {
        sh.rows = s.rows; sh.cols = s.cols;
        sh.freeze = { rows: s.freezeHeader ? 1 : 0, cols: 0 };
      });
    } else if (itemType === "presentation") {
      var sl = Object.assign({}, DEFAULT_SUB.slides, p.slides || {});
      body.ratio = sl.ratio;
      body.theme = sl.theme;
      body.transition = { type: sl.transition, speed: 300 };
    } else if (itemType === "form") {
      var f = Object.assign({}, DEFAULT_SUB.forms, p.forms || {});
      body.settings.anonymous = f.anonymous;
      body.settings.requireLogin = f.requireLogin;
      body.settings.onePerDevice = f.onePerDevice;
      body.settings.showQuestionNumber = f.showQuestionNumber;
      body.theme.progress = f.progress;
    }
    return content;
  }

  WP.settings = { open: open, GROUPS: GROUPS, DEFAULT_SUB: DEFAULT_SUB, applyToNew: applyToNew };
})(typeof globalThis !== "undefined" ? globalThis : this);
