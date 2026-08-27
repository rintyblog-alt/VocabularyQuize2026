/* ══════════════════════════════════════════════════════════════════════
   AI ワークスペースの土台（3 ペインと、その中で使う部品）

   これまでの画面は「設定フォーム ＋ 生成結果」で、
   どこで何をすればいいかが並び順からしか読めなかった。
   ここでは体験を 4 層（指示する → 進行を見る → 内容を確認する → 完成させる）
   に割り当てた入れ物を用意する。

     左   ＝ 指示と条件（何を作ってほしいか）
     中央 ＝ 中身（できたもの・検証・修復・紙面）
     右   ＝ AI アクティビティ（いま何をしているか・追加指示）

   狭い画面ではこの 3 つを並べない。上のタブで切り替え、
   アクティビティは下から引き出すシートにする。

   公開: VQ2.ws
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui;
  var esc = U.esc, icon = U.icon, btn = U.button;

  /* ══════════════════════════════════════════════════════════════════
     セクションカード
     見出し（＋補助文・右肩の操作）と中身を持つ、左ペインの基本単位。
     ══════════════════════════════════════════════════════════════════ */
  function sectionCard(o) {
    o = o || {};
    var h = '<section class="vq2-wsc' + (o.tone ? " tone-" + esc(o.tone) : "")
      + (o.flush ? " is-flush" : "") + '"'
      + (o.id ? ' id="' + esc(o.id) + '"' : "") + ">";
    if (o.title || o.aside) {
      h += '<header class="vq2-wsc-h">';
      h += '<div class="vq2-wsc-ht">';
      if (o.icon) h += '<span class="vq2-wsc-i">' + icon(o.icon) + "</span>";
      h += "<div>";
      if (o.title) h += '<h3 class="vq2-wsc-t">' + esc(o.title) + "</h3>";
      if (o.sub) h += '<p class="vq2-wsc-s">' + esc(o.sub) + "</p>";
      h += "</div></div>";
      if (o.aside) h += '<div class="vq2-wsc-a">' + o.aside + "</div>";
      h += "</header>";
    }
    h += '<div class="vq2-wsc-b">' + (o.body || "") + "</div>";
    if (o.foot) h += '<footer class="vq2-wsc-f">' + o.foot + "</footer>";
    return h + "</section>";
  }

  /* 折りたためるセクションカード（詳しい設定を畳んでおくため） */
  function foldCard(o) {
    o = o || {};
    var open = !!o.open;
    var h = '<section class="vq2-wsc is-fold' + (open ? " is-open" : "") + '">';
    h += '<button type="button" class="vq2-wsc-fh" data-act="' + esc(o.action || "wsfold") + '"'
      + ' data-fold="' + esc(o.key || "") + '" aria-expanded="' + (open ? "true" : "false") + '">';
    if (o.icon) h += '<span class="vq2-wsc-i">' + icon(o.icon) + "</span>";
    h += '<span class="vq2-wsc-fl"><span class="vq2-wsc-t">' + esc(o.title || "") + "</span>"
      + (o.summary ? '<span class="vq2-wsc-s">' + esc(o.summary) + "</span>" : "") + "</span>";
    h += '<span class="vq2-wsc-fc">' + icon(open ? "chevronU" : "chevronD") + "</span>";
    h += "</button>";
    /* 畳んでいるあいだは中身を置かない。
       hidden で隠すだけだと、見えない入力欄が数十個そこに居続ける
       （読み上げの順番も、タブ移動の順番も、そのぶん長くなる）。 */
    if (open) h += '<div class="vq2-wsc-b">' + (o.body || "") + "</div>";
    return h + "</section>";
  }

  /* ══════════════════════════════════════════════════════════════════
     区切られたタブ（中央ペインの見出し）
     items: [{ id, label, count, tone, disabled }]
     ══════════════════════════════════════════════════════════════════ */
  function segmentedTabs(items, current, o) {
    o = o || {};
    var act = o.action || "wstab";
    var h = '<div class="vq2-seg" role="tablist"'
      + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : "") + ">";
    (items || []).forEach(function (t) {
      var on = t.id === current;
      h += '<button type="button" class="vq2-seg-t" role="tab"'
        + ' aria-selected="' + (on ? "true" : "false") + '"'
        + ' data-act="' + esc(act) + '" data-tab="' + esc(t.id) + '"'
        + (t.disabled ? " disabled" : "") + ">"
        + (t.icon ? icon(t.icon) : "")
        + "<span>" + esc(t.label) + "</span>"
        + (t.count ? '<span class="vq2-seg-n' + (t.tone ? " tone-" + esc(t.tone) : "") + '">'
            + esc(String(t.count)) + "</span>" : "")
        + "</button>";
    });
    return h + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     状態バッジ（色だけで伝えない。必ず文字を添える）
     ══════════════════════════════════════════════════════════════════ */
  function statusBadge(tone, text, o) {
    o = o || {};
    return '<span class="vq2-sbadge tone-' + esc(tone || "neutral") + '">'
      + (o.icon ? icon(o.icon) : "")
      + "<span>" + esc(text) + "</span></span>";
  }

  /* ══════════════════════════════════════════════════════════════════
     その場のお知らせ（軽い注意。エラーの色は使わない）
     ══════════════════════════════════════════════════════════════════ */
  function inlineNotice(o) {
    o = o || {};
    var tone = o.tone || "info";
    var ic = tone === "warning" ? "warning" : tone === "danger" ? "error"
      : tone === "success" ? "check" : "info";
    return '<div class="vq2-note2 tone-' + esc(tone) + '" role="' + (tone === "danger" ? "alert" : "status") + '">'
      + '<span class="vq2-note2-i">' + icon(ic) + "</span>"
      + '<div class="vq2-note2-b">'
      + (o.title ? '<div class="vq2-note2-t">' + esc(o.title) + "</div>" : "")
      + (o.body ? '<div class="vq2-note2-s">' + esc(o.body) + "</div>" : "")
      + "</div>"
      + (o.action ? '<div class="vq2-note2-a">' + o.action + "</div>" : "")
      + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     空の状態（何をすれば進むのかを必ず書く）
     ══════════════════════════════════════════════════════════════════ */
  function emptyState(o) {
    o = o || {};
    return '<div class="vq2-empty2">'
      + '<span class="vq2-empty2-i">' + icon(o.icon || "sparkle") + "</span>"
      + '<p class="vq2-empty2-t">' + esc(o.title || "") + "</p>"
      + (o.body ? '<p class="vq2-empty2-s">' + esc(o.body) + "</p>" : "")
      + (o.action ? '<div class="vq2-empty2-a">' + o.action + "</div>" : "")
      + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     下に貼りつく操作列（スクロールしても主要操作を見失わない）
     ══════════════════════════════════════════════════════════════════ */
  function stickyFooter(o) {
    o = o || {};
    return '<div class="vq2-stick">'
      + (o.note ? '<div class="vq2-stick-n">' + esc(o.note) + "</div>" : "")
      + '<div class="vq2-stick-a">' + (o.actions || "") + "</div></div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     3 ペインの骨格

     o = {
       left:  HTML（設定・条件）
       main:  HTML（中身）
       side:  HTML（AI アクティビティ）
       tabs:  segmentedTabs の HTML（中央の上に置く）
       mobile: "left" | "main" | "side"   狭い画面でどれを出すか
       sideOpen: bool                     広い画面で右を出すか
       leftTitle / mainTitle / sideTitle
     }
     ══════════════════════════════════════════════════════════════════ */
  function layout(o) {
    o = o || {};
    var mobile = !!o.isMobile;
    var tab = o.mobile || "main";
    var sideOpen = o.sideOpen !== false;

    var h = '<div class="vq2-ws' + (mobile ? " is-mobile" : "")
      + (sideOpen ? "" : " is-sideoff") + '">';

    /* 左（設定ペイン）。渡されなければ置かない＝2 ペインになる。 */
    if (o.left) {
      h += '<aside class="vq2-ws-l" id="wsLeft"'
        + (mobile && tab !== "left" ? " hidden" : "") + ">"
        + '<div class="vq2-ws-scroll">' + o.left + "</div>"
        + (o.leftFoot ? '<div class="vq2-ws-foot">' + o.leftFoot + "</div>" : "")
        + "</aside>";
    }

    /* 中央 */
    h += '<main class="vq2-ws-m" id="wsMain"'
      + (mobile && tab !== "main" ? " hidden" : "") + ">";
    if (o.tabs) h += '<div class="vq2-ws-tabs">' + o.tabs + "</div>";
    h += '<div class="vq2-ws-scroll" id="wsMainScroll">' + (o.main || "") + "</div>";
    if (o.mainFoot) h += '<div class="vq2-ws-foot">' + o.mainFoot + "</div>";
    h += "</main>";

    /* 右 */
    if (mobile) {
      /* 下から引き出すシート。閉じているときは掴み手だけ残す。 */
      h += '<div class="vq2-ws-sheet' + (tab === "side" ? " is-open" : "") + '" id="wsSide">'
        + (o.side || "") + "</div>";
    } else if (sideOpen) {
      h += '<aside class="vq2-ws-r" id="wsSide">' + (o.side || "") + "</aside>";
    }

    return h + "</div>";
  }

  /* 狭い画面の下タブ（作る / できたもの / AI） */
  function mobileBar(current, o) {
    o = o || {};
    var items = o.items || [
      { id: "left", label: "指示", icon: "settings" },
      { id: "main", label: "内容", icon: "doc" },
      { id: "side", label: "AI", icon: "sparkle" }
    ];
    var act = o.action || "wspane";
    return '<nav class="vq2-wsbar" role="tablist" aria-label="表示の切り替え">'
      + items.map(function (t) {
          var on = t.id === current;
          return '<button type="button" class="vq2-wsbar-t" role="tab"'
            + ' aria-selected="' + (on ? "true" : "false") + '"'
            + ' data-act="' + esc(act) + '" data-pane="' + esc(t.id) + '">'
            + icon(t.icon) + "<span>" + esc(t.label) + "</span>"
            + (t.dot ? '<span class="vq2-wsbar-d"></span>' : "")
            + "</button>";
        }).join("")
      + "</nav>";
  }

  /* ══════════════════════════════════════════════════════════════════
     依頼を書く欄（左ペインの先頭）
     ══════════════════════════════════════════════════════════════════ */
  function requestComposer(o) {
    o = o || {};
    var h = '<div class="vq2-req2">';
    h += '<textarea class="vq2-req2-in" data-key="' + esc(o.key || "instruction") + '"'
      + ' rows="' + (o.rows || 4) + '"'
      + ' placeholder="' + esc(o.placeholder || "") + '"'
      + ' aria-label="' + esc(o.aria || "AI への依頼") + '">' + esc(o.value || "") + "</textarea>";
    if (o.hint) h += '<p class="vq2-req2-h">' + esc(o.hint) + "</p>";
    if (o.chips && o.chips.length)
      h += '<div class="vq2-req2-chips">' + o.chips.map(function (c) {
        return '<button type="button" class="vq2-chip" data-act="' + esc(o.chipAction || "wschip")
          + '" data-chip="' + esc(c) + '">' + esc(c) + "</button>";
      }).join("") + "</div>";
    return h + "</div>";
  }

  /* 数値・選択などを 2 列で並べる小さな枠（クイック条件） */
  function fieldGrid(inner, cols) {
    return '<div class="vq2-fgrid c' + (cols || 2) + '">' + inner + "</div>";
  }

  VQ2.ws = {
    sectionCard: sectionCard,
    foldCard: foldCard,
    segmentedTabs: segmentedTabs,
    statusBadge: statusBadge,
    inlineNotice: inlineNotice,
    emptyState: emptyState,
    stickyFooter: stickyFooter,
    layout: layout,
    mobileBar: mobileBar,
    requestComposer: requestComposer,
    fieldGrid: fieldGrid
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
