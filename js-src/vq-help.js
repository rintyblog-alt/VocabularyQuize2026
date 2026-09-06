/* ══════════════════════════════════════════════════════════════════════════
   vq-help — ヘルプ（2026-09-01・訴え）

   訴え:「アプリの ヘルプ画面を 大改造。アプリ内の 細かい 操作までを 全て
         画像付き込みの ヘルプ記事を ものすごく 大量に。使い方から 表とかも
         あったり、番号で 手順を 作ったり。**検索**も 追加すれば
         関連記事を フェッチして 確認も できる。」

   直す前: ヘルプらしい ものは **1 つも 無かった**。
           困った ときに 見る ところが どこにも 無く、
           はじめての 案内（起動の ときの 板）を 閉じたら 二度と 出せなかった。

   作り:
     ・記事は vq-help-data.js（**中身と 見た目を 分ける**。記事を 足す ときに
       画面の 作りを 触らなくて 済む）
     ・絵は client/help/img/ の **実機の 画像**。作り物は 1 枚も 使わない
     ・検索は 題・要約・本文・探しことば を まとめて 見る（打つ たびに 出る）
     ・記事の 下に **関連記事**。行き止まりを 作らない

   ★ vq2-app には 足さない。自分の ファイル・自分の 指紋。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqHelpInstalled) return;
  window.__vqHelpInstalled = true;

  var doc = document;
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /* **文の 中の 強調だけ** 通す（それ以外の 札は 通さない）。 */
  function 文(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function D() { try { return window.VQHELP || null; } catch (e) { return null; } }

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle ' + P + ' cx="11" cy="11" r="7"/><path ' + P + ' d="m20 20-3.6-3.6"/>',
    back: '<path ' + P + ' d="M15 5l-7 7 7 7"/>',
    book: '<path ' + P + ' d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path ' + P + ' d="M4 20.5A2.5 2.5 0 016.5 18H20"/>',
    right: '<path ' + P + ' d="M9 5l7 7-7 7"/>',
    help: '<circle ' + P + ' cx="12" cy="12" r="9"/><path ' + P + ' d="M9.6 9.2a2.5 2.5 0 114 2.3c-.9.6-1.6 1-1.6 2M12 17h.01"/>'
  };
  function svg(n, c) { return '<svg viewBox="0 0 24 24" class="' + (c || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>"; }

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483105;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836);background:var(--vq-bg,#FCFBFE)}",
    ":host([data-open='1']){display:block}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:left}",
    "input{font:inherit;color:inherit}",
    ".i{width:18px;height:18px;flex:0 0 auto}",
    /* 上の 帯 */
    ".top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;",
      "padding:calc(12px + var(--vq-sat,0px)) 18px 12px;",
      "background:var(--vq-surface,#fff);border-bottom:1px solid var(--vq-border,#E7E4EF)}",
    ".ttl{font-size:17px;font-weight:750;display:flex;align-items:center;gap:8px;flex:0 0 auto}",
    ".sbox{position:relative;flex:1 1 auto;max-width:560px}",
    ".sbox svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);opacity:.55}",
    ".sbox input{width:100%;height:40px;padding:0 12px 0 36px;border-radius:11px;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-bg-subtle,#F7F6FB)}",
    ".sbox input:focus{outline:2px solid var(--vq-primary,#756DB3);outline-offset:1px;background:var(--vq-surface,#fff)}",
    ".ib{width:38px;height:38px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;",
      "border:1px solid var(--vq-border,#E7E4EF);flex:0 0 auto}",
    ".ib:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    /* 本体 */
    ".body{display:flex;gap:0;align-items:flex-start;max-width:1180px;margin:0 auto;",
      "height:calc(100dvh - 65px);overflow:hidden}",
    ".side{flex:0 0 246px;height:100%;overflow:auto;padding:18px 12px 40px;",
      "border-right:1px solid var(--vq-border,#E7E4EF)}",
    ".cat{display:block;width:100%;padding:9px 11px;border-radius:10px;font-size:13.5px;font-weight:600}",
    ".cat:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".cat.on{background:var(--vq-primary-subtle,#F4F2FB);color:var(--vq-primary-text,#5F579E)}",
    ".cat small{display:block;font-size:11px;font-weight:500;opacity:.7;margin-top:2px;line-height:1.5}",
    ".main{flex:1 1 auto;height:100%;overflow:auto;padding:24px 26px 80px;min-width:0}",
    /* 一覧 */
    ".crumb{font-size:12px;color:var(--vq-text-muted,#7A7589);margin-bottom:10px;display:flex;",
      "align-items:center;gap:6px;flex-wrap:wrap}",
    /* ★ パンくずは **見た目は 小さい まま、押しどころだけ 広げる**
       （2026-09-01 実測: 高さ 18px で 指では 押しにくかった）。
       上下に 余白を 取り、同じだけ 外へ 出して 並びは 変えない。 */
    ".crumb button{font-size:12px;color:var(--vq-primary,#756DB3);padding:11px 5px;margin:-11px -3px}",
    ".crumb button:hover{text-decoration:underline}",
    ".h1{font-size:28px;font-weight:780;line-height:1.35;margin-bottom:8px;word-break:break-word}",
    ".lead{font-size:14px;color:var(--vq-text-secondary,#5A5568);line-height:1.9;margin-bottom:20px}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}",
    ".card{border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;padding:14px 15px;",
      "background:var(--vq-surface,#fff);width:100%}",
    ".card:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".card b{display:block;font-size:14px;font-weight:700;line-height:1.5}",
    ".card span{display:block;font-size:12px;color:var(--vq-text-muted,#7A7589);margin-top:5px;line-height:1.75}",
    ".sec{margin-top:26px}",
    ".sec-h{font-size:12px;font-weight:750;letter-spacing:.06em;color:var(--vq-text-muted,#7A7589);",
      "margin-bottom:9px}",
    /* 記事 */
    ".art p{font-size:14.5px;line-height:2;margin:12px 0}",
    ".art h2{font-size:18px;font-weight:750;margin:28px 0 8px;padding-top:14px;",
      "border-top:1px solid var(--vq-border-subtle,#EFEDF5)}",
    ".art ul{margin:10px 0 10px 4px;list-style:none}",
    ".art ul li{position:relative;padding-left:18px;font-size:14px;line-height:1.95;margin:5px 0}",
    ".art ul li::before{content:'';position:absolute;left:4px;top:.85em;width:5px;height:5px;",
      "border-radius:50%;background:var(--vq-primary,#756DB3)}",
    ".art ol{margin:12px 0;list-style:none;counter-reset:s}",
    ".art ol li{counter-increment:s;position:relative;padding:10px 0 10px 40px;font-size:14.5px;line-height:1.9;",
      "border-bottom:1px solid var(--vq-border-subtle,#EFEDF5)}",
    ".art ol li:last-child{border-bottom:0}",
    ".art ol li::before{content:counter(s);position:absolute;left:0;top:9px;width:26px;height:26px;",
      "border-radius:50%;background:var(--vq-primary,#756DB3);color:#fff;font-size:13px;font-weight:750;",
      "display:grid;place-items:center}",
    ".art figure{margin:18px 0}",
    ".art img{display:block;width:100%;height:auto;border-radius:12px;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-bg-subtle,#F7F6FB)}",
    ".art figcaption{font-size:12px;color:var(--vq-text-muted,#7A7589);margin-top:7px;line-height:1.7}",
    ".tw{overflow-x:auto;margin:16px 0;border:1px solid var(--vq-border,#E7E4EF);border-radius:12px}",
    ".art table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:420px}",
    ".art th{text-align:left;padding:10px 13px;background:var(--vq-bg-subtle,#F7F6FB);font-weight:700;",
      "border-bottom:1px solid var(--vq-border,#E7E4EF);white-space:nowrap}",
    ".art td{padding:10px 13px;border-bottom:1px solid var(--vq-border-subtle,#EFEDF5);line-height:1.8;vertical-align:top}",
    ".art tr:last-child td{border-bottom:0}",
    ".note,.tip{margin:16px 0;padding:12px 14px;border-radius:12px;font-size:13.5px;line-height:1.9}",
    ".note{background:var(--vq-warn-subtle,#FFF6E5);color:var(--vq-warn-text,#7A5A10);",
      "border:1px solid var(--vq-warn-border,#F3DFB0)}",
    ".tip{background:var(--vq-success-subtle,#E8F5EC);color:var(--vq-success-text,#1E6B36);",
      "border:1px solid var(--vq-success-border,#BFE3CB)}",
    ".note b,.tip b{font-weight:750}",
    ".see{margin-top:32px;padding-top:18px;border-top:1px solid var(--vq-border,#E7E4EF)}",
    ".see-t{font-size:12px;font-weight:750;letter-spacing:.06em;color:var(--vq-text-muted,#7A7589);margin-bottom:9px}",
    ".see-l{display:grid;gap:7px}",
    ".see-i{display:flex;align-items:center;gap:9px;border:1px solid var(--vq-border,#E7E4EF);",
      "border-radius:11px;padding:11px 12px;font-size:13.5px;font-weight:600;width:100%}",
    ".see-i:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".see-i svg{margin-left:auto;opacity:.5}",
    /* 検索 */
    ".hit{width:100%;border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;padding:12px 14px;",
      "margin-bottom:8px;background:var(--vq-surface,#fff)}",
    ".hit:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".hit b{display:block;font-size:14px;font-weight:700}",
    ".hit .k{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;",
      "background:var(--vq-primary-subtle,#F4F2FB);color:var(--vq-primary-text,#5F579E);margin-bottom:6px}",
    ".hit span{display:block;font-size:12.5px;color:var(--vq-text-muted,#7A7589);margin-top:4px;line-height:1.75}",
    ".hit mark{background:var(--vq-warn-subtle,#FFF0C8);color:inherit;border-radius:3px;padding:0 2px}",
    ".none{font-size:13.5px;color:var(--vq-text-muted,#7A7589);line-height:1.9;padding:20px 0}",
    /* スマホ */
    "@media (max-width:820px){",
      ".body{display:block;height:calc(100dvh - 61px);overflow:auto}",
      ".side{display:none}",
      ".main{height:auto;overflow:visible;padding:16px 16px 90px}",
      ".top{flex-wrap:wrap;padding:calc(10px + var(--vq-sat,0px)) 14px 10px;gap:8px}",
      ".ttl{font-size:15px}",
      ".sbox{max-width:none;order:3;flex:1 1 100%}",
      ".h1{font-size:22px}",
      ".art ol li{padding-left:36px;font-size:14px}",
      ".art p,.art ul li{font-size:14px}",
      ".chips{display:flex;gap:6px;overflow-x:auto;padding:12px 16px 4px;scrollbar-width:none}",
      ".chips::-webkit-scrollbar{display:none}",
      /* ★ 指で 押す ものは **40px 以上**（2026-09-01 実測 34px だった）。
         34px は 親指の 腹より 小さく、隣の 札を 押して しまう。 */
      ".chip{flex:0 0 auto;height:40px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:650;",
        "border:1px solid var(--vq-border,#D7D2E4);white-space:nowrap}",
      ".chip.on{background:var(--vq-primary,#756DB3);color:#fff;border-color:transparent}",
      ".grid{grid-template-columns:1fr}",
    "}",
    "@media (min-width:821px){.chips{display:none}}"
  ].join("");

  var host = null, root = null;
  var st = { 開: false, 面: "top", cat: "", id: "", q: "", 前: "" };

  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqHelp";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var b = doc.createElement("div"); b.setAttribute("data-box", ""); root.appendChild(b);
    doc.body.appendChild(host);
    つなぐ();
  }
  function 開く(o) {
    建てる();
    o = o || {};
    st.開 = true; st.前 = "";
    /* ★ **探して いた 言葉を 消す**（2026-09-01 実測）。
       消さないと 中身は いつまでも 検索の 結果を 出し、
       記事を 開いた つもりで 関連記事も パンくずも 出なかった。 */
    if (o.id) { st.面 = "art"; st.id = String(o.id); st.q = ""; }
    else if (o.cat) { st.面 = "cat"; st.cat = String(o.cat); st.q = ""; }
    else if (o.q) { st.面 = "find"; st.q = String(o.q); }
    else { st.面 = "top"; st.q = ""; }
    host.setAttribute("data-open", "1");
    描く();
  }
  function 閉じる() { st.開 = false; if (host) host.removeAttribute("data-open"); }

  function 記事(id) {
    var d = D(); if (!d) return null;
    for (var i = 0; i < d.ARTICLES.length; i++) if (d.ARTICLES[i].id === id) return d.ARTICLES[i];
    return null;
  }
  function 区分(id) {
    var d = D(); if (!d) return null;
    for (var i = 0; i < d.CATS.length; i++) if (d.CATS[i].id === id) return d.CATS[i];
    return null;
  }

  /* ══ 検索。**題・要約・本文・探しことば を まとめて 見る**。
     題に あった ものを 上へ（探して いる ものは たいてい 題に ある）。 */
  function 探す(q) {
    var d = D(); if (!d) return [];
    var 語 = String(q || "").trim().toLowerCase();
    if (!語) return [];
    var 並 = 語.split(/\s+/).filter(Boolean);
    var out = [];
    d.ARTICLES.forEach(function (a) {
      var 本 = [];
      (a.body || []).forEach(function (b) {
        if (typeof b.x === "string") 本.push(b.x);
        else if (Array.isArray(b.x)) 本.push(b.x.join(" "));
        if (b.t === "table") {
          本.push((b.head || []).join(" "));
          (b.rows || []).forEach(function (r) { 本.push(r.join(" ")); });
        }
        if (b.cap) 本.push(b.cap);
      });
      var 題 = String(a.title || "").toLowerCase();
      var 要 = String(a.summary || "").toLowerCase();
      var 鍵 = (a.keys || []).join(" ").toLowerCase();
      var 全 = 本.join(" ").toLowerCase();
      var 点 = 0, 当 = 0;
      並.forEach(function (w) {
        var h = 0;
        if (題.indexOf(w) >= 0) { 点 += 10; h = 1; }
        if (鍵.indexOf(w) >= 0) { 点 += 6; h = 1; }
        if (要.indexOf(w) >= 0) { 点 += 4; h = 1; }
        if (全.indexOf(w) >= 0) { 点 += 2; h = 1; }
        当 += h;
      });
      /* ★ **すべての 言葉が どこかに 当たった ものだけ** 出す。
         1 語でも 当たれば 出すと、2 語で 絞った つもりが 逆に 増える。 */
      if (当 === 並.length && 点 > 0) out.push({ a: a, 点: 点, 本: 本.join("　") });
    });
    out.sort(function (x, y) { return y.点 - x.点; });
    return out.slice(0, 30);
  }
  /* 当たった ところの 前後を 少しだけ 出す。 */
  function さわり(本, q) {
    var 語 = String(q || "").trim().split(/\s+/)[0] || "";
    var i = 本.toLowerCase().indexOf(語.toLowerCase());
    if (i < 0) return esc(本.slice(0, 90));
    var s = Math.max(0, i - 28);
    var 切 = 本.slice(s, s + 100);
    return (s > 0 ? "…" : "") + esc(切).replace(new RegExp(語.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
      function (m) { return "<mark>" + m + "</mark>"; }) + "…";
  }

  /* ══ 描く。**巻きと 指を 保つ**（同じ 面の 描き直しでは 動かさない）。 */
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.開) { box.innerHTML = ""; st.前 = ""; return; }
    var 印 = st.面 + "/" + st.cat + "/" + st.id;
    var 同 = st.前 === 印;
    var 控 = null;
    if (同) {
      var m0 = box.querySelector(".main") || box.querySelector(".body");
      if (m0) {
        控 = { 巻: m0.scrollTop, 焦: null, s: null };
        var a0 = null; try { a0 = root.activeElement; } catch (e) {}
        if (a0 && a0.id) { 控.焦 = a0.id; try { 控.s = a0.selectionStart; } catch (e) {} }
      }
    }
    box.innerHTML = 上() + '<div class="body">' + 横() + '<div class="main">' + 中身() + "</div></div>";
    st.前 = 印;
    if (控) {
      var m = box.querySelector(".main") || box.querySelector(".body");
      if (m && 控.巻) { void m.scrollHeight; m.scrollTop = 控.巻; }
      if (控.焦) {
        var t = root.getElementById ? root.getElementById(控.焦) : box.querySelector("#" + 控.焦);
        if (t) {
          try { t.focus({ preventScroll: true }); } catch (e) { try { t.focus(); } catch (e2) {} }
          if (控.s !== null && t.setSelectionRange) { try { t.setSelectionRange(控.s, 控.s); } catch (e) {} }
        }
      }
    }
  }

  function 上() {
    return '<div class="top">'
      + '<div class="ttl">' + svg("help") + "ヘルプ</div>"
      + '<div class="sbox">' + svg("search")
      + '<input id="hp-q" type="search" placeholder="やりたい ことで 探す（例: 公開／スキャン／同期）" value="'
      + esc(st.q) + '" autocomplete="off"></div>'
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button>"
      + "</div>"
      + '<div class="chips">' + (D() ? D().CATS.map(function (c) {
          return '<button class="chip' + (st.面 === "cat" && st.cat === c.id ? " on" : "")
            + '" data-a="cat" data-v="' + c.id + '">' + esc(c.名) + "</button>";
        }).join("") : "") + "</div>";
  }
  function 横() {
    var d = D(); if (!d) return '<div class="side"></div>';
    return '<div class="side">'
      + '<button class="cat' + (st.面 === "top" ? " on" : "") + '" data-a="top">すべて</button>'
      + d.CATS.map(function (c) {
          var n = d.ARTICLES.filter(function (a) { return a.cat === c.id; }).length;
          return '<button class="cat' + (st.面 === "cat" && st.cat === c.id ? " on" : "")
            + '" data-a="cat" data-v="' + c.id + '">' + esc(c.名) + "（" + n + "）"
            + "<small>" + esc(c.説) + "</small></button>";
        }).join("")
      + "</div>";
  }

  function 中身() {
    var d = D();
    if (!d) return '<p class="none">ヘルプの 記事を 読み込めませんでした。</p>';
    if (st.q) return 探した();
    if (st.面 === "art") return 記事を出す();
    if (st.面 === "cat") return 区分を出す();
    return 目次();
  }

  function 目次() {
    var d = D();
    var h = '<h1 class="h1">ヘルプ</h1>'
      + '<p class="lead">やりたい ことから 探せます。上の 欄に 言葉を 入れると 本文からも 探します。'
      + "絵は すべて **いま 動いて いる 画面**を そのまま 撮った ものです。</p>".replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    d.CATS.forEach(function (c) {
      var 並 = d.ARTICLES.filter(function (a) { return a.cat === c.id; });
      if (!並.length) return;
      h += '<div class="sec"><div class="sec-h">' + esc(c.名) + "</div><div class=\"grid\">"
        + 並.map(function (a) {
            return '<button class="card" data-a="art" data-v="' + esc(a.id) + '"><b>' + esc(a.title)
              + "</b><span>" + esc(a.summary) + "</span></button>";
          }).join("") + "</div></div>";
    });
    return h;
  }

  function 区分を出す() {
    var d = D(), c = 区分(st.cat);
    if (!c) return 目次();
    var 並 = d.ARTICLES.filter(function (a) { return a.cat === c.id; });
    return '<div class="crumb"><button data-a="top">ヘルプ</button>' + svg("right", "i")
      + "<span>" + esc(c.名) + "</span></div>"
      + '<h1 class="h1">' + esc(c.名) + "</h1>"
      + '<p class="lead">' + esc(c.説) + "</p>"
      + '<div class="grid">' + 並.map(function (a) {
          return '<button class="card" data-a="art" data-v="' + esc(a.id) + '"><b>' + esc(a.title)
            + "</b><span>" + esc(a.summary) + "</span></button>";
        }).join("") + "</div>";
  }

  function 記事を出す() {
    var a = 記事(st.id);
    if (!a) return '<p class="none">その 記事は 見つかりませんでした。</p>';
    var c = 区分(a.cat);
    var h = '<div class="crumb"><button data-a="top">ヘルプ</button>' + svg("right", "i")
      + '<button data-a="cat" data-v="' + esc(a.cat) + '">' + esc(c ? c.名 : "") + "</button>"
      + svg("right", "i") + "<span>" + esc(a.title) + "</span></div>"
      + '<h1 class="h1">' + esc(a.title) + "</h1>"
      + '<p class="lead">' + esc(a.summary) + "</p>"
      + '<div class="art">';
    var 関 = [];
    (a.body || []).forEach(function (b) {
      if (b.t === "p") h += "<p>" + 文(b.x) + "</p>";
      else if (b.t === "h") h += "<h2>" + esc(b.x) + "</h2>";
      else if (b.t === "ul") h += "<ul>" + (b.x || []).map(function (x) { return "<li>" + 文(x) + "</li>"; }).join("") + "</ul>";
      else if (b.t === "steps") h += "<ol>" + (b.x || []).map(function (x) { return "<li>" + 文(x) + "</li>"; }).join("") + "</ol>";
      else if (b.t === "img") {
        h += '<figure><img src="/help/img/' + esc(b.src) + '" alt="' + esc(b.cap || a.title)
          + '" loading="lazy" decoding="async">'
          + (b.cap ? "<figcaption>" + esc(b.cap) + "</figcaption>" : "") + "</figure>";
      } else if (b.t === "table") {
        h += '<div class="tw"><table><thead><tr>'
          + (b.head || []).map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("")
          + "</tr></thead><tbody>"
          + (b.rows || []).map(function (r) {
              return "<tr>" + r.map(function (x) { return "<td>" + 文(x) + "</td>"; }).join("") + "</tr>";
            }).join("")
          + "</tbody></table></div>";
      } else if (b.t === "note") h += '<div class="note">' + 文(b.x) + "</div>";
      else if (b.t === "tip") h += '<div class="tip">' + 文(b.x) + "</div>";
      else if (b.t === "see") 関 = 関.concat(b.x || []);
    });
    h += "</div>";
    if (関.length) {
      h += '<div class="see"><div class="see-t">あわせて 読む</div><div class="see-l">'
        + 関.map(function (id) {
            var r = 記事(id);
            if (!r) return "";
            return '<button class="see-i" data-a="art" data-v="' + esc(id) + '">' + esc(r.title)
              + svg("right", "i") + "</button>";
          }).join("") + "</div></div>";
    }
    return h;
  }

  function 探した() {
    var 出 = 探す(st.q);
    var h = '<div class="crumb"><button data-a="top">ヘルプ</button>' + svg("right", "i")
      + '<span>「' + esc(st.q) + "」で 探す</span></div>"
      + '<h1 class="h1">' + 出.length + " 件</h1>";
    if (!出.length) {
      return h + '<p class="none">見つかりませんでした。'
        + "言葉を 短く するか、別の 言いかたで 試して ください"
        + "（例:「公開」「スキャン」「同期」「遅い」）。</p>";
    }
    h += 出.map(function (r) {
      var c = 区分(r.a.cat);
      return '<button class="hit" data-a="art" data-v="' + esc(r.a.id) + '">'
        + '<span class="k">' + esc(c ? c.名 : "") + "</span>"
        + "<b>" + esc(r.a.title) + "</b>"
        + "<span>" + さわり(r.本, st.q) + "</span></button>";
    }).join("");
    return h;
  }

  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      e.preventDefault();
      if (a === "close") { 閉じる(); return; }
      if (a === "top") { st.面 = "top"; st.q = ""; st.id = ""; st.前 = ""; 描く(); 上へ(); return; }
      if (a === "cat") { st.面 = "cat"; st.cat = el.getAttribute("data-v") || ""; st.q = ""; st.前 = ""; 描く(); 上へ(); return; }
      if (a === "art") { st.面 = "art"; st.id = el.getAttribute("data-v") || ""; st.q = ""; st.前 = ""; 描く(); 上へ(); return; }
    });
    /* ★ 打つ たびに 出す。**画面は 作り直さず 中身だけ**（打てなく ならない ため）。 */
    var 待 = 0;
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || t.id !== "hp-q") return;
      st.q = String(t.value || "");
      if (待) clearTimeout(待);
      待 = setTimeout(function () {
        待 = 0;
        var m = root.querySelector(".main");
        if (!m) { 描く(); return; }
        m.innerHTML = st.q ? 探した() : (st.面 === "art" ? 記事を出す() : st.面 === "cat" ? 区分を出す() : 目次());
        m.scrollTop = 0;
      }, 130);
    });
    doc.addEventListener("keydown", function (e) {
      if (!st.開) return;
      if (e.key === "Escape") { e.preventDefault(); 閉じる(); }
    }, true);
  }
  function 上へ() {
    var m = root.querySelector(".main") || root.querySelector(".body");
    if (m) m.scrollTop = 0;
  }

  window.__vqHelp = {
    open: 開く, close: 閉じる,
    探す: function (q) { return 探す(q).map(function (r) { return r.a.id; }); },
    記事数: function () { var d = D(); return d ? d.ARTICLES.length : 0; },
    状態: function () { return { 開: st.開, 面: st.面, cat: st.cat, id: st.id, q: st.q }; }
  };
})();
