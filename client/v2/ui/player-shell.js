/* ══════════════════════════════════════════════════════════════════════
   学習プレイヤーの共通の枠

   通常クイズ（quiz-player.js）と VocabuSpeak（speak.js）は、
   出すものは違うが「枠」は同じでよい。

     上：戻る／題名／進み具合／時間／保存の状態
     中：中身（形式ごとの見た目は Renderer が持つ）
     右：折りたたみのわき（問題一覧・Mission など。狭い画面では出さない）
     下：固定の操作（前へ／目印／次へ）

   ここでは **枠と設定の当て方だけ**を持つ。
   マイク・字幕・音声のような VocabuSpeak 固有のものは、この枠へ押し込まない。
   わき（side）と下（foot）の中身を差し替える口だけ用意して、
   何を入れるかは呼ぶ側が決める。

   ■ 下の固定操作が中身を隠さないようにする
     下は position: sticky ではなく **枠の外**に置く。
     中身側には --vq-pfoot ぶんの余白を必ず入れる。
     iPhone の下端（ホームバー）は env(safe-area-inset-bottom) で足す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, PP = VQ2.playerPrefs;
  var esc = U.esc, icon = U.icon, btn = U.button;

  /* 設定 → CSS 変数。読む側は変数だけ見ればよい。 */
  var FONT = { small: "0.9375rem", standard: "1rem", large: "1.125rem", xlarge: "1.25rem" };
  var WIDTH = { narrow: "620px", standard: "760px", wide: "980px" };
  var PAD = { standard: "20px", compact: "12px", focus: "20px" };
  var GAP = { standard: "10px", compact: "6px" };

  function prefs() { return PP ? PP.all() : {}; }

  /* 画面（Shadow DOM の中）へ設定を流す。値そのものは持たない。 */
  function applyVars(rootEl, p) {
    if (!rootEl || !rootEl.style) return;
    p = p || prefs();
    rootEl.style.setProperty("--vq-pfont", FONT[p.fontSize] || FONT.standard);
    rootEl.style.setProperty("--vq-pwidth", WIDTH[p.maxWidth] || WIDTH.standard);
    rootEl.style.setProperty("--vq-ppad", PAD[p.density] || PAD.standard);
    rootEl.style.setProperty("--vq-pgap", GAP[p.choiceDensity] || GAP.standard);
    rootEl.classList.toggle("is-pfocus", p.density === "focus");
    rootEl.classList.toggle("is-pnomotion", p.animations === false);
  }

  /* ══ 上の帯 ══
     o = { title, sub, progress:{now,total}, timeLabel, timeDanger,
           save:"saved"|"saving"|"error"|null, actions, backAria } */
  function head(o) {
    o = o || {};
    var p = o.prefs || prefs();
    var h = '<div class="vq2-head vq2-phead">'
      + '<div class="vq2-top">'
      + btn({ icon: "chevronL", iconOnly: true, variant: "quiet",
              action: o.backAction || "exit", aria: o.backAria || "終了", title: o.backAria || "終了" })
      + '<div class="vq2-phead-t"><div class="vq2-top-title">' + esc(o.title || "") + "</div>"
      + (o.sub ? '<div class="vq2-top-sub">' + esc(o.sub) + "</div>" : "")
      + "</div>"
      + '<div class="vq2-top-sp"></div>';

    if (p.showSave !== false && o.save) h += saveChip(o.save, !!o.compact);
    if (p.showTimer !== false && o.timeLabel)
      h += '<span class="vq2-badge' + (o.timeDanger ? " is-danger" : "") + '">' + icon("clock")
        + '<span class="vq2-mono" style="margin-left:4px">' + esc(o.timeLabel) + "</span></span>";
    h += '<div class="vq2-top-actions">' + (o.actions || "") + "</div>";
    h += "</div>";

    if (p.showProgress !== false && o.progress && o.progress.total)
      h += '<div class="vq2-phead-p"><div class="vq2-prog-row">'
        + U.progressBar(o.progress.now, o.progress.total, "進捗")
        + '<span class="vq2-prog-n">' + o.progress.now + " / " + o.progress.total + "</span>"
        + "</div></div>";

    return h + "</div>";
  }

  /* 保存の状態。**「保存しました」は本当に書けたときだけ出す。** */
  var SAVE_JA = { saved: "保存済み", saving: "保存中", error: "保存できていません" };
  /* compact のときは印だけにする。狭い画面では、題名と時間で場所が無く、
     文字まで出すと題名へ重なる（実測: 390px で副題の上に乗っていた）。
     読み上げには文字を残すので、意味は落ちない。 */
  function saveChip(state, compact) {
    var s = SAVE_JA[state] ? state : null;
    if (!s) return "";
    return '<span class="vq2-psave is-' + s + (compact ? " is-mini" : "") + '"'
      + ' role="status" aria-live="polite" title="' + esc(SAVE_JA[s]) + '">'
      + icon(s === "error" ? "alert" : s === "saving" ? "refresh" : "check")
      + '<span class="vq2-psave-l">' + esc(SAVE_JA[s]) + "</span></span>";
  }

  /* ══ 下の固定操作 ══
     o = { left, center, right, note } — 中身は呼ぶ側が組む。 */
  function foot(o) {
    o = o || {};
    return '<div class="vq2-pfoot" data-qfoot>'
      + (o.note ? '<div class="vq2-pfoot-n">' + esc(o.note) + "</div>" : "")
      + '<div class="vq2-pfoot-r">'
      + '<div class="vq2-pfoot-l">' + (o.left || "") + "</div>"
      + (o.center ? '<div class="vq2-pfoot-c">' + o.center + "</div>" : "")
      + '<div class="vq2-top-sp"></div>'
      + '<div class="vq2-pfoot-x">' + (o.right || "") + "</div>"
      + "</div></div>";
  }

  /* ══ 中身とわき ══
     o = { main, side, sideTitle, sideOpen, isMobile } */
  function body(o) {
    o = o || {};
    var withSide = !!o.side && !o.isMobile && o.sideOpen !== false;
    var h = '<div class="vq2-pbody' + (withSide ? " has-side" : "") + '">';
    h += '<div class="vq2-pmain" id="pMain"><div class="vq2-pmain-in">' + (o.main || "") + "</div></div>";
    if (withSide) {
      h += '<aside class="vq2-pside" aria-label="' + esc(o.sideTitle || "一覧") + '">'
        + '<div class="vq2-pside-h">' + esc(o.sideTitle || "一覧")
        + '<span class="vq2-top-sp"></span>'
        + btn({ icon: "chevronR", iconOnly: true, size: "sm", variant: "quiet",
                action: "pside-close", aria: "一覧を閉じる" })
        + "</div>"
        + '<div class="vq2-pside-b">' + o.side + "</div></aside>";
    }
    return h + "</div>";
  }

  /* ══ 問題の一覧（クイズ用） ══
     items = [{ id, label, state:"answered"|"blank"|"flagged", current }] */
  function questionList(items, o) {
    o = o || {};
    var list = items || [];
    var done = list.filter(function (x) { return x.state === "answered"; }).length;
    var flagged = list.filter(function (x) { return x.flagged; }).length;
    var h = '<div class="vq2-qlist-sum">'
      + "<span>回答 " + done + " / " + list.length + "</span>"
      + (flagged ? "<span>目印 " + flagged + "</span>" : "")
      + "</div>";
    h += '<div class="vq2-qlist" role="list">'
      + list.map(function (x, i) {
          var cls = x.current ? " is-now" : x.state === "answered" ? " is-done" : "";
          return '<button type="button" role="listitem" class="vq2-qlist-i' + cls
            + (x.flagged ? " is-flag" : "") + '"'
            + ' data-act="' + esc(o.action || "goto-q") + '" data-i="' + i + '"'
            + ' aria-label="問 ' + (i + 1) + (x.state === "answered" ? "・回答済み" : "・未回答")
            + (x.flagged ? "・目印あり" : "") + (x.current ? "・いま表示中" : "") + '"'
            + (x.current ? ' aria-current="true"' : "") + ">"
            + (i + 1) + (x.flagged ? '<span class="vq2-qlist-f" aria-hidden="true"></span>' : "")
            + "</button>";
        }).join("")
      + "</div>";
    if (o.actions) h += '<div class="vq2-qlist-a">' + o.actions + "</div>";
    return h;
  }

  VQ2.playerShell = {
    prefs: prefs,
    applyVars: applyVars,
    head: head,
    foot: foot,
    body: body,
    saveChip: saveChip,
    questionList: questionList,
    FONT: FONT, WIDTH: WIDTH
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
