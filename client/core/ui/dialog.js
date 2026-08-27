/* ══════════════════════════════════════════════════════════════════════════
   core/ui/dialog.js — **自分たちの 窓**（2026-08-19）

   訴え:
     「Feed の 報告画面、削除が システムの方の モーダルに なってるから、
       独自で 作って。**これからも 必ず 独自で 作れるようにして**」

   なぜ 端末の窓（confirm / alert / prompt）が だめか:
     ・見た目が アプリと まったく 違う（URL が 出る・書体が 変わる）
     ・**画面を 止める**。裏で 動いている 保存や 通信も 止まる
     ・iPhone では 出る場所も 形も 選べない。「このページの内容」と 出る
     ・危ない操作（消す）と ふつうの操作の 区別が つけられない
     ・字の 大きさ・色・並びを こちらで 決められない

   ここが 引き受けること:
     VQDLG.たずねる({題, 文, はい, いいえ, 危険})   → Promise<真偽>
     VQDLG.知らせる({題, 文, 閉じる})                → Promise<void>
     VQDLG.書いてもらう({題, 文, 既定, 上限, 複数行}) → Promise<文字 か null>

   守ること:
     ・**影の DOM の 中**に 作る。書体の設定（61 種類・!important）や
       ほかの CSS が どれだけ 強くても、この窓は 崩れない。
     ・Esc で やめる／Enter で 決める／Tab は 窓の 中だけを 回る
     ・開いたとき **前に 触っていた所**を 覚えて、閉じたら 戻す
     ・重ねて 呼ばれても 1 つずつ 順に 出す
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (!root || root.VQDLG) return;
  var doc = root.document;
  if (!doc) return;

  var CSS = [
    ":host{all:initial;}",
    "*{box-sizing:border-box;font-family:-apple-system,'system-ui','Hiragino Sans',",
    "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;}",
    ".back{position:fixed;inset:0;background:rgba(24,22,38,.42);",
    "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);",
    "display:flex;align-items:center;justify-content:center;padding:20px;",
    "opacity:0;transition:opacity .16s ease;z-index:2147483600;}",
    ".back.in{opacity:1;}",
    ".card{width:min(420px,100%);max-height:86vh;overflow:auto;background:#fff;color:#2B2836;",
    "border-radius:18px;padding:20px 20px 16px;box-shadow:0 18px 50px rgba(16,15,26,.30);",
    "transform:translateY(8px) scale(.985);transition:transform .18s cubic-bezier(.2,.9,.3,1);}",
    ".back.in .card{transform:none;}",
    ".t{margin:0 0 8px;font-size:16.5px;font-weight:750;line-height:1.5;}",
    ".m{margin:0;font-size:14px;line-height:1.85;color:#5A5568;white-space:pre-wrap;",
    "word-break:break-word;}",
    ".in-wrap{margin:13px 0 0;}",
    "textarea,input{width:100%;font-size:15px;line-height:1.7;color:#2B2836;background:#F9F8FC;",
    "border:1px solid #D7D2E4;border-radius:11px;padding:10px 12px;outline:0;resize:vertical;}",
    "textarea:focus,input:focus{border-color:#756DB3;background:#fff;",
    "box-shadow:0 0 0 3px rgba(117,109,179,.16);}",
    "textarea{min-height:92px;}",
    ".cnt{margin:5px 2px 0;font-size:11.5px;color:#9994A8;text-align:right;",
    "font-variant-numeric:tabular-nums;}",
    ".bar{display:flex;gap:9px;justify-content:flex-end;margin:18px 0 0;flex-wrap:wrap;}",
    "button{font-size:14px;font-weight:650;line-height:1;padding:11px 17px;border-radius:11px;",
    "border:1px solid #D7D2E4;background:#fff;color:#2B2836;cursor:pointer;min-width:88px;}",
    "button:hover{background:#F7F5FC;}",
    "button:focus-visible{outline:3px solid rgba(117,109,179,.45);outline-offset:2px;}",
    "button.go{background:#5F579E;border-color:#5F579E;color:#fff;}",
    "button.go:hover{background:#544C8E;}",
    "button.dn{background:#C4373B;border-color:#C4373B;color:#fff;}",
    "button.dn:hover{background:#AE3034;}",
    "@media (max-width:520px){.card{width:100%;border-radius:16px;padding:18px 16px 14px;}",
    ".bar{flex-direction:column-reverse;}button{width:100%;}}",
    "@media (prefers-color-scheme:dark){.card{background:#2B2836;color:#F4F3F9;}",
    ".m{color:#BBB7C5;}textarea,input{background:#211F29;color:#F4F3F9;border-color:#454151;}",
    "button{background:#353143;color:#F4F3F9;border-color:#454151;}",
    "button:hover{background:#454151;}}"
  ].join("");

  var 並び = Promise.resolve();      /* 重ねて 呼ばれても 1 つずつ */

  function 逃がす(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function 出す(o) {
    o = o || {};
    return new Promise(function (done) {
      var 前に触っていた = null;
      try { 前に触っていた = doc.activeElement; } catch (e) {}

      var host = doc.createElement("div");
      host.setAttribute("data-vqdlg", "1");
      host.style.cssText = "position:fixed;inset:0;z-index:2147483600;";
      var sr = host.attachShadow({ mode: "open" });
      var st = doc.createElement("style"); st.textContent = CSS; sr.appendChild(st);

      var 入力欄 = "";
      if (o.種類 === "書いてもらう") {
        var 上限 = Number(o.上限) || 500;
        入力欄 = '<div class="in-wrap">'
          + (o.複数行 === false
              ? '<input type="text" maxlength="' + 上限 + '" value="' + 逃がす(o.既定) + '">'
              : '<textarea maxlength="' + 上限 + '">' + 逃がす(o.既定) + "</textarea>")
          + '<div class="cnt"><span data-n>0</span> / ' + 上限 + "</div></div>";
      }
      var やめる = o.いいえ === null ? "" :
        '<button type="button" data-no>' + 逃がす(o.いいえ || "やめる") + "</button>";
      var 決める = '<button type="button" data-yes class="'
        + (o.危険 ? "dn" : "go") + '">' + 逃がす(o.はい || "OK") + "</button>";

      var 箱 = doc.createElement("div");
      箱.className = "back";
      箱.innerHTML = '<div class="card" role="dialog" aria-modal="true"'
        + (o.題 ? ' aria-label="' + 逃がす(o.題) + '"' : "") + ">"
        + (o.題 ? '<h2 class="t">' + 逃がす(o.題) + "</h2>" : "")
        + (o.文 ? '<p class="m">' + 逃がす(o.文) + "</p>" : "")
        + 入力欄
        + '<div class="bar">' + やめる + 決める + "</div></div>";
      sr.appendChild(箱);
      doc.body.appendChild(host);
      requestAnimationFrame(function () { 箱.classList.add("in"); });

      var 字 = sr.querySelector("textarea,input");
      var 数 = sr.querySelector("[data-n]");
      if (字 && 数) {
        var 数える = function () { 数.textContent = String(字.value.length); };
        字.addEventListener("input", 数える); 数える();
      }

      var 済 = false;
      function 閉じる(答) {
        if (済) return; 済 = true;
        doc.removeEventListener("keydown", 鍵, true);
        箱.classList.remove("in");
        setTimeout(function () { try { host.remove(); } catch (e) {} }, 180);
        try { if (前に触っていた && 前に触っていた.focus) 前に触っていた.focus(); } catch (e) {}
        done(答);
      }
      function 鍵(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); 閉じる(o.種類 === "書いてもらう" ? null : false); return; }
        if (e.key === "Enter") {
          /* 複数行の 入力では Enter は 改行。決めるのは ⌘/Ctrl+Enter。 */
          var 複数行 = 字 && 字.tagName === "TEXTAREA";
          if (!複数行 || e.metaKey || e.ctrlKey) {
            e.preventDefault(); 決定();
          }
          return;
        }
        if (e.key === "Tab") {
          /* 窓の 外へ 出さない */
          var 並2 = [].slice.call(sr.querySelectorAll("button,textarea,input"))
            .filter(function (x) { return !x.disabled; });
          if (!並2.length) return;
          var 先 = 並2[0], 後 = 並2[並2.length - 1];
          var いま = sr.activeElement;
          if (e.shiftKey && いま === 先) { e.preventDefault(); 後.focus(); }
          else if (!e.shiftKey && いま === 後) { e.preventDefault(); 先.focus(); }
        }
      }
      function 決定() {
        if (o.種類 === "書いてもらう") 閉じる(字 ? String(字.value) : "");
        else 閉じる(true);
      }
      doc.addEventListener("keydown", 鍵, true);
      var y = sr.querySelector("[data-yes]"), n = sr.querySelector("[data-no]");
      if (y) y.addEventListener("click", function (e) { e.preventDefault(); 決定(); });
      if (n) n.addEventListener("click", function (e) {
        e.preventDefault(); 閉じる(o.種類 === "書いてもらう" ? null : false);
      });
      /* 外を 押したら やめる（危ない操作のときは 押し間違いを 防ぐため 反応しない） */
      箱.addEventListener("click", function (e) {
        if (e.target !== 箱 || o.危険) return;
        閉じる(o.種類 === "書いてもらう" ? null : false);
      });

      setTimeout(function () {
        try { (字 || y || n).focus(); if (字 && 字.select) 字.select(); } catch (e) {}
      }, 60);
    });
  }

  function 並べて(o) {
    var 次 = 並び.then(function () { return 出す(o); });
    並び = 次.catch(function () {});
    return 次;
  }

  root.VQDLG = {
    /* はい／いいえ。消すときは 危険:true（赤くなり、外を押しても 閉じない）。 */
    たずねる: function (o) {
      o = o || {};
      return 並べて({ 種類: "たずねる", 題: o.題, 文: o.文,
                     はい: o.はい || (o.危険 ? "消す" : "はい"),
                     いいえ: o.いいえ || "やめる", 危険: !!o.危険 });
    },
    /* 知らせるだけ。ボタンは 1 つ。 */
    知らせる: function (o) {
      o = o || {};
      return 並べて({ 種類: "知らせる", 題: o.題, 文: o.文,
                     はい: o.閉じる || "OK", いいえ: null }).then(function () {});
    },
    /* 書いてもらう。やめたら null。 */
    書いてもらう: function (o) {
      o = o || {};
      return 並べて({ 種類: "書いてもらう", 題: o.題, 文: o.文, 既定: o.既定,
                     上限: o.上限, 複数行: o.複数行,
                     はい: o.はい || "決定", いいえ: o.いいえ || "やめる" });
    },
    CSS: CSS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
