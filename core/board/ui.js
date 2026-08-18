/* ══════════════════════════════════════════════════════════════════════
   core/board/ui.js — AR Board の 一覧と 中身

   ★ 訴え（2026-08-17）「左サイドメニューに AR Board を 追加して、
     そこに ボードを 格納して。写真付きだと どこの 何かが 分かる。
     一覧画面は プリセット一覧の UI を 参考に」。

   ★ 作り
     ・一覧は **カードを 並べる**（プリセット一覧と 同じ考えかた）。
       写真が あれば 表紙にする。無ければ 中身の 先頭を 出す。
     ・押すと 中身（マークダウン・数式・図・表）を そのまま 出す。
     ・名前を 変える／消す が その場で できる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 日(iso) {
    try {
      var d = new Date(iso);
      return (d.getMonth() + 1) + "/" + d.getDate() + " "
        + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    } catch (e) { return ""; }
  }
  function 抜き(md) {
    try {
      var t = root.VQMD && root.VQMD.素 ? root.VQMD.素(md) : String(md || "");
      return t.replace(/\s+/g, " ").slice(0, 60);
    } catch (e) { return String(md || "").slice(0, 60); }
  }

  var CSS = [
    ".vqb-wrap{padding:14px 14px 28px;}",
    ".vqb-head{display:flex;align-items:center;gap:10px;margin:0 0 12px;}",
    ".vqb-head h2{flex:1 1 auto;margin:0;font-size:17px;font-weight:700;}",
    ".vqb-cnt{font-size:12px;color:var(--vq-text-tertiary,#9994A8);}",
    ".vqb-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));}",
    ".vqb-card{position:relative;display:flex;flex-direction:column;text-align:left;",
    "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);",
    "border-radius:16px;overflow:hidden;cursor:pointer;padding:0;font:inherit;color:inherit;",
    "box-shadow:0 1px 2px rgba(16,15,26,.05);transition:transform .12s ease,box-shadow .12s ease;}",
    ".vqb-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(16,15,26,.10);}",
    ".vqb-thumb{width:100%;aspect-ratio:4/3;background:var(--vq-surface-sunken,#F4F2FB);",
    "display:flex;align-items:center;justify-content:center;overflow:hidden;}",
    ".vqb-thumb img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".vqb-thumb .vqb-none{font-size:11px;line-height:1.6;padding:10px;",
    "color:var(--vq-text-tertiary,#9994A8);text-align:center;}",
    ".vqb-body{padding:9px 11px 11px;}",
    ".vqb-t{font-size:13.5px;font-weight:700;line-height:1.5;margin:0 0 3px;",
    "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".vqb-m{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);}",
    ".vqb-tag{position:absolute;top:8px;left:8px;background:rgba(11,10,16,.72);color:#fff;",
    "font-size:10.5px;padding:2px 7px;border-radius:999px;}",
    ".vqb-empty{padding:44px 16px;text-align:center;color:var(--vq-text-tertiary,#9994A8);",
    "font-size:14px;line-height:1.9;}",
    ".vqb-one{padding:14px;}",
    ".vqb-one .vqb-photo{width:100%;max-height:38vh;object-fit:contain;border-radius:12px;",
    "background:var(--vq-surface-sunken,#F4F2FB);margin:0 0 12px;display:block;}",
    ".vqb-bar{display:flex;gap:8px;margin:14px 0 0;flex-wrap:wrap;}",
    ".vqb-bar button{border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;font:inherit;font-size:13px;padding:7px 13px;border-radius:999px;cursor:pointer;}",
    ".vqb-bar button.dn{color:#d1373b;border-color:rgba(209,55,59,.35);}",
    "@media (max-width:700px){.vqb-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));}}"
  ].join("");

  function 開く(o) {
    o = o || {};
    var U = root.VQ2 && root.VQ2.ui;
    var S = VQB.store;
    if (!U || !U.mount || !S) return null;
    var 面 = U.mount("vq2-ar-board", {
      title: "AR Board", sheet: true, stack: true,
      css: CSS + (root.VQMD && root.VQMD.CSS ? root.VQMD.CSS() : "")
        + (root.VQG && root.VQG.CSS ? root.VQG.CSS() : "")
    });
    描く();
    return 面;

    function 描く() {
      var 一 = S.一覧();
      var h = ['<div class="vqb-wrap"><div class="vqb-head"><h2>AR Board</h2>'
        + '<span class="vqb-cnt">' + 一.length + " 件"
        + (一.length ? "・" + S.使っている量() + "KB" : "") + "</span></div>"];
      if (!一.length) {
        h.push('<div class="vqb-empty">まだ ありません。<br>'
          + "Lumi が ボードに 書いたものが ここに 残ります。<br>"
          + "カメラで 読んだときは 写真も 一緒に 入ります。</div>");
      } else {
        h.push('<div class="vqb-grid">');
        一.forEach(function (b) {
          h.push('<button class="vqb-card" type="button" data-b="' + esc(b.id) + '">');
          h.push('<div class="vqb-thumb">'
            + (b.photo ? '<img src="' + esc(b.photo) + '" alt="">'
                       : '<span class="vqb-none">' + esc(抜き(b.markdown)) + "</span>")
            + "</div>");
          if (b.source === "camera") h.push('<span class="vqb-tag">カメラ</span>');
          h.push('<div class="vqb-body"><div class="vqb-t">' + esc(b.title) + "</div>"
            + '<div class="vqb-m">' + 日(b.at) + (b.subject ? "・" + esc(b.subject) : "") + "</div></div>");
          h.push("</button>");
        });
        h.push("</div>");
      }
      h.push("</div>");
      面.root.innerHTML = h.join("");
      U.on(面.root, "click", "[data-b]", function (e, t) { 一つ(t.getAttribute("data-b")); });
    }

    function 一つ(id) {
      var b = S.取る(id);
      if (!b) return;
      var h = ['<div class="vqb-one">'];
      if (b.photo) h.push('<img class="vqb-photo" src="' + esc(b.photo) + '" alt="写したもの">');
      h.push('<div class="vqmd">'
        + (root.VQMD && root.VQMD.render ? root.VQMD.render(b.markdown) : esc(b.markdown))
        + "</div>");
      h.push('<div class="vqb-bar">'
        + '<button type="button" data-act="back">一覧へ</button>'
        + '<button type="button" data-act="rename">名前を変える</button>'
        + '<button class="dn" type="button" data-act="del">消す</button></div>');
      h.push("</div>");
      面.root.innerHTML = h.join("");
      /* 数式は あとから 組み上がることがある。届いたら 描き直す。 */
      try {
        if (root.VQM && root.VQM.svg && !root.VQM.svg.読み込み済み()) {
          root.VQM.svg.要る();
          doc.addEventListener("vqm:ready", function 一度() {
            doc.removeEventListener("vqm:ready", 一度);
            var el = 面.root.querySelector(".vqmd");
            if (el) el.innerHTML = root.VQMD.render(b.markdown);
          });
        }
      } catch (e) {}
      U.on(面.root, "click", '[data-act="back"]', function () { 描く(); });
      U.on(面.root, "click", '[data-act="rename"]', function () {
        var n = root.prompt("新しい名前", b.title);
        if (n === null) return;
        S.名を変える(b.id, n); b.title = n; 一つ(b.id);
      });
      U.on(面.root, "click", '[data-act="del"]', function () {
        if (!root.confirm("この ボードを 消しますか。")) return;
        S.消す(b.id); 描く();
      });
    }
  }

  VQB.ui = { 開く: 開く, CSS: CSS };
})(typeof globalThis !== "undefined" ? globalThis : this);
