/* ══════════════════════════════════════════════════════════════════════
   プリセットの詳細
   ・一覧のカードを押すと開く。PC は中央のカード、スマホは下から出る全画面。
   ・**3 つの出どころ（自分 / 公開 / 公式）を、同じ形で見せる。**
     どれかを推測しない。種別は一覧のカードが持っている印をそのまま使う。
   ・出すのは実データだけ。無い項目は行ごと出さない（空欄を並べない）。
   ・内部の ID（sub:english / summarize）は一切出さない。
   ・「0 で全問」のような、数字に意味を持たせる書き方はしない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, ST = VQ2.store, F = VQ2.flags;
  var esc = U.esc, btn = U.button;

  function L() { return VQ2.library || null; }
  function bridge() { return root.__vqPresets || null; }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }

  /* 一覧のカードが無いときでも開けるように、V2 のプリセットから作る。 */
  function cardOf(o) {
    if (o.card) return o.card;
    var b = bridge();
    var id = o.presetId || (o.preset && o.preset.id) || "";
    if (b && b.card && id) { var c = b.card(id); if (c) return c; }
    /* 一覧に出ていないもの（この端末の保存にしかない）は、保存から作る。 */
    if (o.preset && L()) {
      try { return L().fromLocal(o.preset, { me: ST.currentOwnerId() }); }
      catch (e) { return null; }
    }
    return null;
  }

  function open(o) {
    o = o || {};
    var preset = o.preset || (o.presetId ? safeGet(o.presetId) : null);
    var card = cardOf(o);
    if (!preset && !card) return null;

    var id = (card && card.id) || (preset && preset.id) || "";
    var title = (card && card.title) || (preset && preset.name) || "（名称なし）";
    var questions = (preset && preset.questions) || [];
    var total = questions.length;
    /* 本体でしか始められないもの（単語帳など）は、こちらで問題を持っていない。
       そのときは出題の設定を出さず、本体の開始へ渡す。 */
    var playable = !!(total && F.isOn("quizPlayerV2"));

    var app = U.mount("vq2-preset-detail", {
      title: title,
      sheet: true,
      onResize: function () { render(); },
      onClose: o.onClose
    });
    app.root.classList.add("vq2-pd");

    var opt = { mode: "practice", limit: 0, limitMin: 0, perQ: 0, shuffleQ: false, shuffleC: false };
    render();

    function render() {
      app.root.innerHTML = headHtml() + bodyHtml() + footHtml();
      wire();
    }

    /* ── 上：表紙・アイコン・名前・種別・作者 ─────────────────── */
    function headHtml() {
      var lib = L();
      var banner = (card && card.bannerUrl) || (preset && preset.appearance && preset.appearance.banner) || "";
      var fb = (lib && card) ? lib.fallbackBanner(card) : { pattern: "plain", style: "" };
      var h = '<div class="vq2-pd-head" data-pat="' + esc(fb.pattern) + '" style="' + esc(fb.style) + '">';
      if (banner) h += '<img class="vq2-pd-banner" src="' + esc(banner) + '" alt="">';
      h += '<div class="vq2-pd-kinds">' + kindsHtml() + "</div>";
      h += '<div class="vq2-pd-headbar">'
        + btn({ icon: "close", iconOnly: true, variant: "ghost", action: "x", aria: "閉じる" })
        + "</div>";
      h += "</div>";
      h += '<div class="vq2-pd-id">' + iconHtml()
        + '<div class="vq2-pd-name"><div class="vq2-pd-t">' + esc(title) + "</div>"
        + '<div class="vq2-pd-by">' + byHtml() + "</div></div></div>";
      return h;
    }
    function kindsHtml() {
      if (!card) return "";
      var out = [];
      if (card.isOfficial) out.push(chip("VocabuQuiz公式", "is-official"));
      else if (card.isOwnedByCurrentUser) {
        out.push(chip("マイプリセット", ""));
        out.push(chip(L() ? L().visibilityLabel(card.visibility) : "", ""));
      } else out.push(chip("公開プリセット", ""));
      return out.join("");
      function chip(t, cls) { return t ? '<span class="vq2-pd-kind ' + cls + '">' + esc(t) + "</span>" : ""; }
    }
    function iconHtml() {
      var a = (preset && preset.appearance) || {};
      var url = (card && card.iconUrl) || a.iconImage || "";
      if (url) return '<span class="vq2-pd-icon"><img src="' + esc(url) + '" alt=""></span>';
      var style = (card && card.accentColor) ? ' style="background:' + esc(card.accentColor) + ';color:#fff"' : "";
      if (card && card.iconText && card.iconText.length > 2) {
        /* 本体が付けた記号の名前（3 文字以上は Material Symbols、1〜2 文字は絵文字） */
        return '<span class="vq2-pd-icon is-ms"' + style + '><span class="vq2-ms">' + esc(card.iconText) + "</span></span>";
      }
      if (a.icon) return '<span class="vq2-pd-icon is-emoji">' + esc(a.icon) + "</span>";
      if (card && card.iconText) return '<span class="vq2-pd-icon is-emoji"' + style + ">" + esc(card.iconText) + "</span>";
      return '<span class="vq2-pd-icon is-emoji">' + esc(String(title).trim().slice(0, 1) || "?") + "</span>";
    }
    function byHtml() {
      if (!card) return esc(total + " 問");
      if (card.isOfficial) {
        return "VocabuQuiz が用意した教材"
          + (card.officialKind ? "（" + esc(card.officialKind) + "）" : "");
      }
      if (card.isOwnedByCurrentUser) return "自分が作成";
      var av = card.ownerAvatarUrl
        ? '<img class="vq2-pd-av" src="' + esc(card.ownerAvatarUrl) + '" alt="">' : "";
      return av + esc(card.ownerName || "名前のない人")
        + (card.ownerHandle ? ' <span class="vq2-pd-handle">@' + esc(card.ownerHandle) + "</span>" : "");
    }

    /* ── 中身 ─────────────────────────────────────────────── */
    function bodyHtml() {
      return '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
        + '<div class="vq2-pd-scroll">'
        + descHtml() + factsHtml() + breakdownHtml() + optionsHtml() + moreHtml()
        + "</div></div></div></div>";
    }

    function descHtml() {
      var d = (card && card.description) || (preset && preset.description) || "";
      if (!d) return "";
      return '<div class="vq2-card"><div class="vq2-pd-desc">' + esc(d) + "</div></div>";
    }

    function factsHtml() {
      var lib = L(), rows = [];
      var subject = (card && card.subject) || (preset && ((preset.subjects || [])[0] || preset.subjectId)) || o.subject || "";
      if (subject) row("科目", lib ? lib.subjectLabel(subject) : subject);
      if (card && card.unit) row("範囲", card.unit);
      var n = total || (card ? card.questionCount : 0);
      var unit = (!total && card && card.countUnit) || "問";
      if (n) row(unit === "語" ? "収録語数" : "問題数", n + " " + unit);
      var mins = (card && num(card.estimatedMinutes, null)) || (lib && total ? lib.estimateMinutes(questions) : null);
      if (mins) row("目安の時間", "約 " + mins + " 分");
      if (card && card.tags && card.tags.length) row("タグ", card.tags.join("・"));
      if (card && !card.isOfficial && !card.isOwnedByCurrentUser && card.favoriteCount)
        row("保存された数", card.favoriteCount + " 件");
      if (card && card.isOwnedByCurrentUser) row("公開範囲", lib ? lib.visibilityLabel(card.visibility) : "");
      var upd = (card && card.updatedAt) || (preset && preset.updatedAt) || "";
      if (upd) row("最終更新", fmtDate(upd));
      else if (card && card.updatedLabel) row("最終更新", card.updatedLabel);
      if (card && card.lastPlayedAt && lib) row("最後に解いた日", lib.relTime(card.lastPlayedAt));
      if (!rows.length) return "";
      return '<div class="vq2-card"><div class="vq2-sec-t">このプリセット</div>'
        + '<div class="vq2-pd-facts">' + rows.join("") + "</div></div>";
      function row(k, v) {
        if (!v) return;
        rows.push('<div class="vq2-pd-fact"><span class="vq2-pd-fk">' + esc(k) + "</span>"
          + '<span class="vq2-pd-fv">' + v + "</span></div>");
      }
    }

    /* 問題の内訳。**内部の ID ではなく日本語の名前で出す。** */
    function breakdownHtml() {
      var lib = L();
      var counts = (lib && total) ? lib.typeCounts(questions)
                 : (card && card.questionTypeCounts) || null;
      if (!lib || !counts) return "";
      var rows = lib.typeBreakdown(counts);
      if (!rows.length) return "";
      return '<div class="vq2-card"><div class="vq2-sec-t">問題の内訳</div>'
        + '<div class="vq2-pd-mix">' + rows.map(function (r) {
            return '<div class="vq2-pd-mixrow"><span class="vq2-pd-mixl">' + esc(r.label) + "</span>"
              + '<span class="vq2-pd-mixbar"><i style="width:' + r.ratio + '%"></i></span>'
              + '<span class="vq2-pd-mixn">' + r.count + " 問</span></div>";
          }).join("") + "</div></div>";
    }

    /* 解きかた。数字に隠れた意味（0 で全問 など）を持たせない。 */
    function optionsHtml() {
      if (!playable) {
        return '<div class="vq2-card"><div class="vq2-sec-t">解きかた</div>'
          + '<div class="vq2-hint">このプリセットは、これまでの出題画面で始まります。'
          + "モードの細かい設定はそちらで選べます。</div></div>";
      }
      return '<div class="vq2-card"><div class="vq2-sec-t">解きかたを決める</div>'
        + '<div class="vq2-pd-opts">'
        + sel("モード", "mode", opt.mode, [
            { value: "practice", label: "練習（1 問ごとに答え合わせ）" },
            { value: "exam", label: "テスト（最後にまとめて採点）" }])
        + sel("出題数", "limit", String(opt.limit), limitOptions())
        + sel("1 問あたりの時間", "perQ", String(opt.perQ), [
            { value: "0", label: "制限しない" }, { value: "30", label: "30 秒" },
            { value: "60", label: "1 分" }, { value: "90", label: "1 分 30 秒" },
            { value: "120", label: "2 分" }, { value: "180", label: "3 分" }])
        + sel("全体の制限時間", "limitMin", String(opt.limitMin), [
            { value: "0", label: "制限しない" }, { value: "10", label: "10 分" },
            { value: "20", label: "20 分" }, { value: "30", label: "30 分" },
            { value: "45", label: "45 分" }, { value: "60", label: "60 分" },
            { value: "90", label: "90 分" }])
        + "</div>"
        + '<div class="vq2-pd-checks">'
        + '<label class="vq2-check"><input type="checkbox" data-key="shuffleQ"' + (opt.shuffleQ ? " checked" : "")
        + "><span>問題の順番をばらばらにする</span></label>"
        + '<label class="vq2-check"><input type="checkbox" data-key="shuffleC"' + (opt.shuffleC ? " checked" : "")
        + "><span>選択肢の順番をばらばらにする</span></label></div>"
        + (opt.perQ ? '<div class="vq2-hint">時間が来たら次の問題へ進みます。'
            + "答えていない問題は未回答のまま残ります。</div>" : "")
        + "</div>";
    }
    function limitOptions() {
      var out = [{ value: "0", label: "全部（" + total + " 問）" }];
      [5, 10, 20, 30, 50, 100].forEach(function (n) {
        if (n < total) out.push({ value: String(n), label: n + " 問" });
      });
      return out;
    }
    function sel(label, key, value, options) {
      return '<label class="vq2-pd-opt"><span class="vq2-pd-optl">' + esc(label) + "</span>"
        + '<span class="vq2-pd-optw"><select data-key="' + key + '">'
        + options.map(function (op) {
            return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(value) ? " selected" : "")
              + ">" + esc(op.label) + "</option>";
          }).join("")
        + "</select></span></label>";
    }

    /* できることだけ出す。本体にボタンが無い操作は出さない。 */
    function moreHtml() {
      var b = bridge(), items = [];
      function can(key) { return !!(b && b.can && card && b.can(card, key)); }
      if (can("write")) push("書き取りで始める", "edit_note", "write");
      if (can("fork")) push("自分のものとして複製する", "content_copy", "fork");
      if (can("share")) push("共有リンクを作る", "share", "share");
      /* 新しい公開画面は 1 枚で「公開する / 変更を保存 / 公開をやめる」を持つので、
         入口も 1 つにする。古い画面しか無いときだけ、やめる操作を別に出す。 */
      var newPublish = !!VQ2.presetPublish;
      if (can("publish")) push(card && card.visibility === "public" ? "公開の設定を開く" : "公開する", "public", "publish");
      if (can("unpublish") && !newPublish) push("公開をやめる", "visibility_off", "unpublish");
      if (can("profile")) push("作者のプロフィールを見る", "person", "profile");
      if (!items.length) return "";
      return '<div class="vq2-card"><div class="vq2-sec-t">ほかにできること</div>'
        + '<div class="vq2-pd-more">' + items.join("") + "</div></div>";
      function push(label, icon, act) {
        items.push('<button class="vq2-pd-morebtn" data-more="' + esc(act) + '">'
          + '<span class="vq2-ms">' + esc(icon) + "</span><span>" + esc(label) + "</span></button>");
      }
    }

    /* ── 下：いつでも押せる位置に固定 ─────────────────────── */
    function footHtml() {
      var b = bridge();
      var canEdit = !!(card && card.canEdit) && F.isOn("presetStudioV2");
      var canDel = !!(card && card.canDelete);
      var fav = !!(card && card.isFavoritedByCurrentUser);
      var startable = playable || !!(b && b.can && card && b.can(card, "start"));
      return '<div class="vq2-pd-foot">'
        + '<button class="vq2-pd-fav' + (fav ? " on" : "") + '" data-act="fav" aria-pressed="' + (fav ? "true" : "false")
        + '" aria-label="お気に入り"><span class="vq2-ms">star</span></button>'
        + (canDel ? btn({ label: "削除", icon: "trash", variant: "quiet", action: "del" }) : "")
        + '<div class="vq2-top-sp"></div>'
        + (canEdit ? btn({ label: "編集", icon: "settings", action: "edit" }) : "")
        + btn({ label: "クイズを開始", icon: "play", variant: "primary", action: "start", disabled: !startable })
        + "</div>"
        + (startable ? "" : '<div class="vq2-hint vq2-pd-note">このプリセットには、まだ始められる問題がありません。</div>');
    }

    function fmtDate(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
    }

    /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
       U.on は外す仕組みを持たないので、描き直すたびに張ると聞き手が増え続ける。 */
    function wire() {
      /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
      if (app.root.__pdWired) return;
      app.root.__pdWired = true;
      U.on(app.root, "click", '[data-act="x"]', function () { app.close("user"); });
      U.on(app.root, "change", "[data-key]", function (e, t) {
        readOpt(t);
        if (t.getAttribute("data-key") === "perQ") render();
      });
      U.on(app.root, "click", '[data-act="start"]', function () { start(); });
      U.on(app.root, "click", '[data-act="fav"]', function (e, t) {
        if (!L() || !card) return;
        var on = L().toggleFavorite(card.id);
        card.isFavoritedByCurrentUser = on;
        t.classList.toggle("on", on);
        t.setAttribute("aria-pressed", on ? "true" : "false");
        refreshList();
      });
      U.on(app.root, "click", '[data-act="edit"]', function () {
        app.close("edit");
        if (preset && VQ2.presetStudio) VQ2.presetStudio.open({ preset: preset });
        else act("edit");
      });
      U.on(app.root, "click", '[data-act="del"]', function () { remove(); });
      U.on(app.root, "click", "[data-more]", function (e, t) {
        var key = t.getAttribute("data-more");
        /* 公開まわりは新しいモーダルで開く（これまでの全画面フローは逃げ道として残す） */
        if ((key === "publish" || key === "unpublish") && VQ2.presetPublish) {
          if (!VQ2.presetPublish.canOpen()) {
            app.toast(VQ2.presetPublish.reason() || "いま公開できません。", "warning");
            return;
          }
          app.close("publish");
          VQ2.presetPublish.open({ presetId: id });
          return;
        }
        app.close("more:" + key);
        act(key);
      });
    }
    function readOpt(t) {
      var k = t.getAttribute("data-key");
      if (!k) return;
      opt[k] = t.type === "checkbox" ? t.checked
        : (k === "mode" ? t.value : Number(t.value) || 0);
    }
    function act(key) {
      var b = bridge();
      if (b && b.action) return b.action(id, key);
      return false;
    }

    function start() {
      if (playable) {
        app.close("start");
        VQ2.quizPlayer.open({
          preset: preset,
          mode: opt.mode,
          limit: opt.limit || 0,
          timeLimitSec: (opt.limitMin || 0) * 60,
          perQuestionSec: opt.perQ || 0,
          shuffleQuestions: opt.shuffleQ,
          shuffleChoices: opt.shuffleC,
          resume: false
        });
        return;
      }
      /* 本体の出題へ渡す。渡せなければ、その理由をそのまま伝える。 */
      app.close("start");
      if (!act("start")) {
        if (VQ2.ui && VQ2.ui.toast) { /* シートは閉じたので本体側へは出せない */ }
      }
    }

    /* 削除。
       一覧に出ているプリセットは本体の削除処理が持ち主なので、そこへ渡す。
       確認もアプリ側のものを 1 回だけ出す（こちらでも出すと二重になるし、
       アプリの確認ダイアログはこのシートの後ろに隠れてしまう）。 */
    function remove() {
      var libBtn = findLibBtn(id);
      if (libBtn) {
        app.close("delete");
        libBtn.click();
        watchGone(id);
        return;
      }
      app.confirm({
        title: "このプリセットを削除しますか",
        body: "「" + title + "」を削除します。これまでのクイズの結果は残ります。",
        okLabel: "削除する", danger: true
      }).then(function (yes) {
        if (!yes) return;
        var r = ST.deletePreset(id);
        if (r && r.ok === false) { app.toast(labelOfError(r.error), "error"); return; }
        app.close("deleted");
        refreshList();
        if (o.onDeleted) o.onDeleted(id);
      });
    }
    function labelOfError(code) {
      return code === "FORBIDDEN" ? "他の人のプリセットは削除できません。"
        : code === "NOT_FOUND" ? "見つかりませんでした。" : "削除できませんでした。";
    }
    function findLibBtn(pid) {
      var doc = root.document;
      var page = doc.getElementById("appLibraryPage");
      if (!page) return null;
      var all = page.querySelectorAll('[data-lib-action="deleteCustom"][data-id]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute("data-id") === String(pid)) return all[i];
      }
      return null;
    }
    function watchGone(pid) {
      var tries = 0;
      var t = root.setInterval(function () {
        if (!findLibBtn(pid)) {
          root.clearInterval(t);
          ST.deletePreset(pid);
          refreshList();
          if (o.onDeleted) o.onDeleted(pid);
          return;
        }
        if (++tries > 40) root.clearInterval(t);   /* 取り消されたら何もしない */
      }, 300);
    }
    /* 本体のプリセット一覧を描き直す（検索の入力は保つ） */
    function refreshList() {
      try {
        var host = root.document.getElementById("vqScreens");
        var box = host && host.shadowRoot && host.shadowRoot.querySelector("[data-search]");
        if (root.__vqPresetSearch) root.__vqPresetSearch(box ? box.value : "");
      } catch (e) {}
    }

    return app;
  }

  function safeGet(id) { try { return ST.getPreset(id); } catch (e) { return null; } }

  VQ2.presetDetail = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
