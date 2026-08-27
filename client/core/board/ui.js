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
    /* ★ **スクロールする枠を 自分で 持つ**（2026-08-27・訴え「AR Board が
       スクロールできない」）。U.mount が 作る .vq2-root は
       `display:flex; flex-direction:column; overflow:hidden` なので、
       中身を そのまま 置くと **はみ出た分は 切り落とされ、指でも 動かせない**。
       他の画面は .vq2-pane-b のような すべる枠を 挟んでいたが、
       ここは 直に 置いていたので 1 画面ぶんしか 見えなかった。
       min-height:0 が 要る（flex の 子は 既定で 縮まないため）。 */
    ".vqb-wrap,.vqb-one{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;",
    "-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}",
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
    /* ── 動くもの（AR App）── */
    ".vqb-appthumb{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;",
    "justify-content:center;gap:6px;background:linear-gradient(135deg,#EFEAFB,#E3F0FA);color:#5F579E;}",
    ".vqb-appthumb b{font-size:12px;font-weight:750;letter-spacing:.02em;}",
    ".vqb-appthumb span{font-size:10.5px;color:#7A7589;padding:0 10px;text-align:center;",
    "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}",
    ".vqb-tag.is-app{background:rgba(95,87,158,.92);}",
    ".vqb-app-wrap{border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;overflow:hidden;",
    "background:#FCFBFE;margin:0 0 10px;}",
    ".vqb-app-frame{display:block;width:100%;border:0;}",
    ".vqb-app-msg{margin:0 0 10px;padding:9px 12px;border-radius:12px;font-size:12.5px;line-height:1.7;",
    "background:#FDECEC;color:#9A2A2A;border:1px solid #F3C9C9;white-space:pre-wrap;word-break:break-word;}",
    ".vqb-app-msg.ok{background:#EAF6EE;color:#2F6B45;border-color:#CBE6D6;}",
    ".vqb-app-libs{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin:0 0 8px;}",
    ".vqb-app-ops{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;}",
    ".vqb-app-ops button{min-width:34px;height:30px;padding:0 10px;border-radius:999px;",
    "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;",
    "display:inline-flex;align-items:center;justify-content:center;}",
    ".vqb-app-ops button:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".vqb-app-ops .z{font-size:12px;color:var(--vq-text-tertiary,#9994A8);min-width:44px;",
    "text-align:center;font-variant-numeric:tabular-nums;}",
    ".vqb-one.zen{position:fixed;inset:0;z-index:60;margin:0;padding:12px;overflow:auto;",
    "background:var(--vq-bg,#FCFBFE);}",
    ".vqb-one.zen .vqb-app-frame{height:calc(100vh - 120px) !important;min-height:0 !important;}",
    ".vqb-code{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:#F7F6FB;",
    "border:1px solid var(--vq-border-subtle,#EFEDF5);font-size:11.5px;line-height:1.6;",
    "white-space:pre-wrap;word-break:break-all;max-height:34vh;overflow:auto;}",
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
    /* ★ 中身は IndexedDB にあるので **待ってから** 描く（2026-08-19）。
       待たずに 描くと 1 回目だけ 空に見える。読み終わったら もう一度 描く。 */
    描く();
    try { if (S.用意) S.用意().then(function () { 描く(); }); } catch (e) {}
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
          var 動くもの = b.kind === "app";
          h.push('<div class="vqb-thumb">'
            + (b.photo ? '<img src="' + esc(b.photo) + '" alt="">'
               : 動くもの
                 ? '<span class="vqb-appthumb"><b>▶ 動かせます</b><span>'
                   + esc(b.subject || 抜き(b.markdown) || "触って 確かめる 教材") + "</span></span>"
                 : '<span class="vqb-none">' + esc(抜き(b.markdown)) + "</span>")
            + "</div>");
          if (動くもの) h.push('<span class="vqb-tag is-app">AR App</span>');
          else if (b.source === "camera") h.push('<span class="vqb-tag">カメラ</span>');
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

    /* 動かしている 枠。画面を 描き直すときに 必ず 片づける
       （片づけないと 見張りが 積み重なって、同じ知らせが 何度も 出る）。 */
    var いまの枠 = null, 倍率 = 1;
    function 枠を片づける() {
      if (!いまの枠) return;
      try { いまの枠.片づける(); } catch (e) {}
      いまの枠 = null;
    }

    function 一つ(id) {
      枠を片づける();
      var b = S.取る(id);
      if (!b) return;
      var 動くもの = b.kind === "app";
      var h = ['<div class="vqb-one">'];
      if (b.photo) h.push('<img class="vqb-photo" src="' + esc(b.photo) + '" alt="写したもの">');
      if (動くもの) {
        h.push('<div class="vqb-app-ops">'
          + '<button type="button" data-op="out" aria-label="小さくする">−</button>'
          + '<span class="z" data-zoomv>100%</span>'
          + '<button type="button" data-op="in" aria-label="大きくする">＋</button>'
          + '<button type="button" data-op="reset" aria-label="もとの大きさに戻す">等倍</button>'
          + "</div>");
        h.push('<div class="vqb-app-msg ok" data-appmsg>読み込んでいます…</div>');
        h.push('<div class="vqb-app-wrap" data-appwrap></div>');
        h.push('<div class="vqb-app-libs" data-applibs></div>');
      }
      if (!動くもの || String(b.markdown || "").trim()) {
        h.push('<div class="vqmd">'
          + (root.VQMD && root.VQMD.render ? root.VQMD.render(b.markdown) : esc(b.markdown))
          + "</div>");
      }
      h.push('<div class="vqb-bar">'
        + '<button type="button" data-act="back">一覧へ</button>'
        + (動くもの ? '<button type="button" data-act="zen">大きく</button>'
                    + '<button type="button" data-act="rerun">やり直す</button>'
                    + '<button type="button" data-act="code">コードを見る</button>' : "")
        + '<button type="button" data-act="rename">名前を変える</button>'
        + '<button class="dn" type="button" data-act="del">消す</button></div>');
      if (動くもの) h.push('<pre class="vqb-code" data-codebox hidden></pre>');
      h.push("</div>");
      面.root.innerHTML = h.join("");

      if (動くもの) 動かす(b);
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
      U.on(面.root, "click", '[data-act="back"]', function () { 枠を片づける(); 描く(); });
      U.on(面.root, "click", '[data-act="rerun"]', function () { 動かす(b); });
      U.on(面.root, "click", "[data-op]", function (e, t) {
        var k = 倍率;
        var op = t.getAttribute("data-op");
        if (op === "in") k = Math.min(3, Math.round((k + 0.1) * 10) / 10);
        else if (op === "out") k = Math.max(0.4, Math.round((k - 0.1) * 10) / 10);
        else k = 1;
        倍率 = k;
        try { if (いまの枠 && いまの枠.拡大) いまの枠.拡大(k); } catch (x) {}
        var v = 面.root.querySelector("[data-zoomv]");
        if (v) v.textContent = Math.round(k * 100) + "%";
      });
      U.on(面.root, "click", '[data-act="zen"]', function (e, t) {
        var one = 面.root.querySelector(".vqb-one");
        if (!one) return;
        var 大 = one.classList.toggle("zen");
        t.textContent = 大 ? "もどす" : "大きく";
        /* 大きさが 変わったので 枠も 作り直す（中の 板も 測り直される）。 */
        動かす(b);
      });
      U.on(面.root, "click", '[data-act="code"]', function (e, t) {
        var box = 面.root.querySelector("[data-codebox]");
        if (!box) return;
        var c = b.code || {};
        if (box.hidden) {
          box.textContent = [
            c.html ? "── HTML ──\n" + c.html : "",
            c.css ? "── CSS ──\n" + c.css : "",
            c.js ? "── JS ──\n" + c.js : "",
            c.code ? "── コード ──\n" + c.code : ""
          ].filter(Boolean).join("\n\n");
          box.hidden = false; t.textContent = "コードを隠す";
        } else { box.hidden = true; t.textContent = "コードを見る"; }
      });
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

    /* ══ 動かす（AR App）══════════════════════════════════════════════
       ★ 壊れても **本体は 何も 起きない**（sandbox の 中だけ）。
       ★ 壊れたら 黙らずに 帯へ 出す。何行目かも 出す。 */
    function 動かす(b) {
      枠を片づける();
      var 置き場 = 面.root.querySelector("[data-appwrap]");
      var 帯 = 面.root.querySelector("[data-appmsg]");
      if (!置き場) return;
      置き場.innerHTML = "";
      if (!root.VQB || !root.VQB.app || !root.VQB.app.枠) {
        if (帯) { 帯.className = "vqb-app-msg"; 帯.textContent = "動かす部品が 読み込まれていません。"; }
        return;
      }
      /* 画面の 高さの 半分くらいを 使う。狭い端末でも 320px は 確保する。
         大きく（全画面）のときは 目いっぱい。 */
      var 全画面 = 面.root.querySelector(".vqb-one.zen");
      var 高 = 全画面 ? Math.max(360, (root.innerHeight || 700) - 130)
                      : Math.max(340, Math.min(620, Math.round((root.innerHeight || 700) * 0.56)));
      いまの枠 = root.VQB.app.枠(置き場, b.code || {}, {
        title: b.title, 高さ: 高, appId: b.id,
        全画面: !!全画面,
        /* 中身に 合わせて 伸びたぶん、全画面のときは 上限まで 使う。 */
        上限: 全画面 ? Math.max(360, (root.innerHeight || 700) - 130) : 0,
        報せ: function (種, 文言) {
          if (!帯) return;
          if (種 === "ok") { 帯.className = "vqb-app-msg ok"; 帯.textContent = "動いています。触ってみてください。"; return; }
          if (種 === "blank") { 帯.className = "vqb-app-msg"; 帯.textContent = "画面に 何も 描かれませんでした。「やり直す」を押すか、Lumi に 直してもらってください。"; return; }
          if (種 === "silent") { 帯.className = "vqb-app-msg"; 帯.textContent = "返事が ありません。重すぎるか、途中で 止まっています。"; return; }
          帯.className = "vqb-app-msg"; 帯.textContent = "うまく 動きませんでした：" + 文言;
        }
      });
      /* 前に 変えていた 倍率を そのまま 掛け直す（作り直しで 戻ってしまわないように）。 */
      if (倍率 !== 1) {
        setTimeout(function () {
          try { if (いまの枠 && いまの枠.拡大) いまの枠.拡大(倍率); } catch (x) {}
          var v = 面.root.querySelector("[data-zoomv]");
          if (v) v.textContent = Math.round(倍率 * 100) + "%";
        }, 900);
      }
      /* どの道具を 借りたか 出す（重いものを 借りていると 待ち時間の 説明になる）。 */
      try {
        var 名 = (いまの枠 && いまの枠.道具) || [];
        var 行 = 面.root.querySelector("[data-applibs]");
        if (行) 行.textContent = 名.length ? "借りている道具：" + 名.join("・") : "";
      } catch (e) {}
    }
  }

  VQB.ui = { 開く: 開く, CSS: CSS };
})(typeof globalThis !== "undefined" ? globalThis : this);
