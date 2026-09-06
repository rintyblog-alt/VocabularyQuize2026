/* ══════════════════════════════════════════════════════════════════════════
   core/scan/mode.js — **スキャンモード**（2026-08-20）

   訴え:
     「カメラからスキャンをして、その範囲を問題にしたり、そこをボードに
       まとめたりをできるようにしてほしい。**スキャンしてって言っても
       イマイチスキャンされてない**から、あらかじめ スキャンモードみたいなのを
       作って、そこで 何枚かをスキャンし、何枚も、あるいは PDF、写真なので
       まとめられたりできるといい。スキャンされた内容は、そこから
       ボードにまとめられるように。または ゲームにするとか。
       または 問題プリセットを作成したりも。」

   なぜ「モード」にするか:
     声で「スキャンして」と頼む形だと、**いつ撮れたのかが 誰にも 分からない**。
     撮れていなくても 話は進むので、読めていない資料で 答えてしまう。
     モードにすれば
       ・何枚 撮ったかが 見える
       ・**読み取った中身が 目で 確かめられる**（ここが いちばん 大事）
       ・気に入らなければ 撮り直せる
     つまり「読めたつもり」を なくすための 作り。

   引き受けること:
     ・カメラで **何枚でも** 撮る（1 枚ずつ 溜める）
     ・写真・PDF を **足す**（撮らなくてもよい）
     ・並べ替え・削除
     ・**読み取り**（/api/scan/generate?step=ocr）で 中身を 見せる
     ・そこから 3 つへ 渡す
         ボードにまとめる … /api/ai/chat（資料つき）→ マークダウン → 板
         問題を作る       … /api/aigen/questions（資料つき）
         ゲームにする     … /api/ai/chat（資料つき）→ 1 枚の HTML → 板で動かす

   守ること:
     ・**影の DOM の中**に作る（書体の設定やほかの CSS に 崩されない）
     ・写真は 送る前に 小さくする（長辺 1600px・JPEG）。生のままだと 1 枚 8MB
     ・撮ったものは **勝手に どこへも 送らない**。押されたときだけ 送る
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (!root || root.VQSCAN) return;
  var doc = root.document;
  if (!doc) return;

  var 長辺 = 1600, 画質 = 0.72;

  var CSS = [
    ":host{all:initial;}",
    "*{box-sizing:border-box;font-family:-apple-system,'system-ui','Hiragino Sans',",
    "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;}",
    ".back{position:fixed;inset:0;background:#14121C;color:#F4F3F9;display:flex;",
    "flex-direction:column;z-index:2147483500;}",
    ".head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:",
    "calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;}",
    ".head h1{flex:1 1 auto;margin:0;font-size:16px;font-weight:750;}",
    ".x{width:36px;height:36px;border-radius:999px;border:0;background:rgba(255,255,255,.12);",
    "color:#F4F3F9;font-size:17px;cursor:pointer;flex:0 0 auto;}",
    ".x:hover{background:rgba(255,255,255,.2);}",
    ".view{flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;",
    "justify-content:center;background:#000;overflow:hidden;}",
    ".view video{max-width:100%;max-height:100%;display:block;}",
    ".hint{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:12.5px;",
    "color:rgba(255,255,255,.82);text-shadow:0 1px 3px rgba(0,0,0,.7);padding:0 16px;}",
    ".nocam{color:#BBB7C5;font-size:14px;line-height:1.9;text-align:center;padding:24px;}",
    /* 撮ったもの（横に並ぶ） */
    ".strip{flex:0 0 auto;display:flex;gap:8px;overflow-x:auto;padding:10px 12px;",
    "background:#1C1A26;-webkit-overflow-scrolling:touch;}",
    ".strip:empty{display:none;}",
    ".pg{position:relative;flex:0 0 auto;width:64px;height:84px;border-radius:8px;",
    "overflow:hidden;background:#2B2836;border:1px solid rgba(255,255,255,.14);}",
    ".pg img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".pg .no{position:absolute;left:3px;top:3px;min-width:17px;height:17px;border-radius:999px;",
    "background:rgba(0,0,0,.66);color:#fff;font-size:10.5px;font-weight:700;display:flex;",
    "align-items:center;justify-content:center;padding:0 4px;}",
    ".pg .mk{position:absolute;left:3px;bottom:3px;min-width:17px;height:17px;border-radius:999px;",
    "display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}",
    ".pg .mk .ok{color:#7BD88F;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .mk .ng{color:#FF8A8A;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .mk .run{color:#D7D2E4;background:rgba(0,0,0,.66);border-radius:999px;width:17px;height:17px;",
    "display:flex;align-items:center;justify-content:center;}",
    ".pg .del{position:absolute;right:2px;top:2px;width:19px;height:19px;border-radius:999px;",
    "border:0;background:rgba(0,0,0,.66);color:#fff;font-size:11px;line-height:1;cursor:pointer;}",
    ".pg .pdf{display:flex;align-items:center;justify-content:center;width:100%;height:100%;",
    "font-size:10.5px;color:#D7D2E4;text-align:center;padding:4px;line-height:1.5;word-break:break-all;}",
    /* 操作 */
    ".bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;justify-content:center;",
    "padding:12px 12px calc(env(safe-area-inset-bottom,0px) + 14px);background:#1C1A26;}",
    ".shot{width:66px;height:66px;border-radius:999px;border:4px solid rgba(255,255,255,.9);",
    "background:#fff;cursor:pointer;flex:0 0 auto;}",
    ".shot:active{transform:scale(.94);}",
    ".shot:disabled{opacity:.35;cursor:default;}",
    ".sub{height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.2);",
    "background:rgba(255,255,255,.08);color:#F4F3F9;font-size:13.5px;font-weight:650;",
    "cursor:pointer;flex:0 0 auto;}",
    ".sub:hover{background:rgba(255,255,255,.16);}",
    ".sub:disabled{opacity:.35;cursor:default;}",
    /* 読み取り結果 */
    ".sheet{position:absolute;inset:0;background:#14121C;display:flex;flex-direction:column;}",
    ".sheet .body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 14px 14px;}",
    ".txt{white-space:pre-wrap;word-break:break-word;font-size:13.5px;line-height:1.9;",
    "color:#E6E3F0;background:#211F29;border:1px solid rgba(255,255,255,.1);border-radius:12px;",
    "padding:12px 13px;}",
    ".go3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}",
    ".go3 button{height:44px;font-size:13px;padding:0 6px;}",
    "@media (max-width:360px){.go3{grid-template-columns:repeat(2,1fr);}}",
    ".go{display:grid;grid-template-columns:1fr;gap:9px;padding:12px 14px ",
    "calc(env(safe-area-inset-bottom,0px) + 16px);background:#1C1A26;flex:0 0 auto;}",
    ".go button{height:48px;border-radius:12px;border:0;background:#5F579E;color:#fff;",
    "font-size:15px;font-weight:700;cursor:pointer;}",
    ".go button:hover{background:#544C8E;}",
    ".go button.alt{background:rgba(255,255,255,.1);color:#F4F3F9;}",
    ".go button.alt:hover{background:rgba(255,255,255,.18);}",
    ".go button:disabled{opacity:.4;cursor:default;}",
    ".note{font-size:12.5px;line-height:1.8;color:#BBB7C5;padding:10px 14px 0;}",
    /* 指示（プロンプト）欄 — 2026-08-31・訴え「プロンプトと 投げられる ように」 */
    ".ask{margin-top:12px;}",
    ".ask label{display:block;font-size:12.5px;font-weight:700;color:#D5D0EC;margin:0 0 6px;}",
    ".ask textarea{width:100%;min-height:76px;resize:vertical;border-radius:12px;",
    "border:1px solid rgba(255,255,255,.16);background:#211F29;color:#F4F3F9;",
    "font-size:14px;line-height:1.8;padding:10px 12px;font-family:inherit;}",
    ".ask textarea:focus{outline:2px solid #8A81C2;outline-offset:1px;}",
    ".ask .n{display:flex;align-items:center;gap:10px;margin-top:10px;}",
    ".ask .n label{margin:0;}",
    ".ask .n input{width:88px;height:40px;border-radius:10px;text-align:center;",
    "border:1px solid rgba(255,255,255,.16);background:#211F29;color:#F4F3F9;",
    "font-size:15px;font-family:inherit;}",
    ".ask .hint{font-size:12px;line-height:1.7;color:#9994A8;margin-top:8px;}",
    ".err{margin:10px 14px 0;padding:10px 12px;border-radius:10px;background:rgba(229,72,77,.18);",
    "border:1px solid rgba(229,72,77,.4);color:#FFC9CB;font-size:13px;line-height:1.8;}",
    /* 進み具合 */
    ".prog{margin:12px 14px;height:8px;border-radius:999px;background:rgba(255,255,255,.12);",
    "overflow:hidden;}",
    ".prog i{display:block;height:100%;background:#8A81C2;width:0;transition:width .25s ease;}",
    ".pmsg{padding:0 14px;font-size:13px;color:#D7D2E4;line-height:1.9;}"
  ].join("");

  var 状 = null;      /* { host, sr, ページ:[], stream, video, 文, 見出し } */

  function 番号(n) { return String(n); }

  /* ── 写真を 小さくする（送る前に 必ず 通す）───────────────── */
  function 小さくする(src, mime) {
    return new Promise(function (done) {
      try {
        var im = new Image();
        im.onload = function () {
          try {
            var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
            var r = Math.min(1, 長辺 / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * r)), ch = Math.max(1, Math.round(h * r));
            var c = doc.createElement("canvas");
            c.width = cw; c.height = ch;
            c.getContext("2d").drawImage(im, 0, 0, cw, ch);
            done({ dataUrl: c.toDataURL("image/jpeg", 画質), 幅: cw, 高: ch });
          } catch (e) { done({ dataUrl: src, 幅: 0, 高: 0 }); }
        };
        im.onerror = function () { done({ dataUrl: src, 幅: 0, 高: 0 }); };
        im.src = src;
      } catch (e) { done({ dataUrl: src, 幅: 0, 高: 0 }); }
    });
  }

  function 読み込む(file) {
    return new Promise(function (done) {
      var fr = new FileReader();
      fr.onload = function () { done(String(fr.result || "")); };
      fr.onerror = function () { done(""); };
      fr.readAsDataURL(file);
    });
  }

  /* ── カメラ ─────────────────────────────────────────────── */
  function カメラを出す() {
    if (!状) return Promise.resolve(false);
    var v = 状.sr.querySelector("video");
    if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      映せない("この端末では カメラを 使えません。下の「写真・PDF を足す」から 入れてください。");
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false
    }).then(function (s) {
      状.stream = s;
      v.srcObject = s; v.playsInline = true; v.muted = true;
      return v.play().catch(function () {});
    }).then(function () { return true; }, function (e) {
      映せない("カメラを 使えませんでした（" + String((e && e.name) || e) + "）。"
        + "許可を 確かめるか、下の「写真・PDF を足す」から 入れてください。");
      return false;
    });
  }
  function 映せない(文) {
    if (!状) return;
    var vw = 状.sr.querySelector(".view");
    if (vw) vw.innerHTML = '<div class="nocam">' + 逃す(文) + "</div>";
    var b = 状.sr.querySelector(".shot"); if (b) b.disabled = true;
  }
  function カメラを止める() {
    if (!状 || !状.stream) return;
    try { 状.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    状.stream = null;
  }

  function 撮る() {
    if (!状 || !状.stream) return Promise.resolve(false);
    var v = 状.sr.querySelector("video");
    if (!v || !v.videoWidth) return Promise.resolve(false);
    var w = v.videoWidth, h = v.videoHeight;
    var r = Math.min(1, 長辺 / Math.max(w, h));
    var c = doc.createElement("canvas");
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    状.ページ.push({ 種: "写真", 名: "撮ったもの " + (状.ページ.length + 1),
                     dataUrl: c.toDataURL("image/jpeg", 画質), mime: "image/jpeg" });
    並べ直す();
    return Promise.resolve(true);
  }

  function 足す(files) {
    var 並 = Array.prototype.slice.call(files || []).slice(0, 20);
    var 次 = Promise.resolve();
    並.forEach(function (f) {
      次 = 次.then(function () {
        return 読み込む(f).then(function (u) {
          if (!u) return;
          if (/^image\//i.test(f.type)) {
            return 小さくする(u, f.type).then(function (o) {
              状.ページ.push({ 種: "写真", 名: f.name || "写真", dataUrl: o.dataUrl, mime: "image/jpeg" });
            });
          }
          状.ページ.push({ 種: "PDF", 名: f.name || "PDF", dataUrl: u,
                           mime: f.type || "application/pdf", file: f });
        });
      });
    });
    return 次.then(並べ直す);
  }

  function 逃す(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function 印章(p) {
    if (p.種 === "PDF") return "";
    if (p.状態 === "済") return '<span class="ok">✓</span>';
    if (p.状態 === "だめ") return '<span class="ng">!</span>';
    if (p.状態 === "読み中") return '<span class="run">…</span>';
    return "";
  }
  function 札を塗る() {
    if (!状) return;
    var 並 = 状.sr.querySelectorAll(".pg");
    for (var i = 0; i < 並.length && i < 状.ページ.length; i++) {
      var m = 並[i].querySelector(".mk");
      if (m) m.innerHTML = 印章(状.ページ[i]);
    }
  }
  function 並べ直す() {
    if (!状) return;
    var st = 状.sr.querySelector(".strip");
    st.innerHTML = 状.ページ.map(function (p, i) {
      var 中 = p.種 === "写真"
        ? '<img alt="" src="' + p.dataUrl + '">'
        : '<div class="pdf">' + 逃す(String(p.名).slice(0, 22)) + "</div>";
      return '<div class="pg">' + 中 + '<span class="no">' + 番号(i + 1) + "</span>"
        + '<span class="mk">' + 印章(p) + "</span>"
        + '<button class="del" type="button" data-del="' + i + '" aria-label="' + 番号(i + 1) + ' 枚目を 消す">✕</button></div>';
    }).join("");
    /* ★ **撮った そばから 読み始める**（2026-08-20）。
       読み取りは 1 枚 7〜8 秒 かかる。押してから 読み始めると
       5 枚で 40 秒 待たせる。撮っている 間に 走らせておけば、
       押したときには たいてい もう 済んでいる。 */
    setTimeout(読む列を回す, 0);
    var 読 = 状.sr.querySelector("[data-read]");
    if (読) {
      読.disabled = !状.ページ.length;
      読.textContent = 状.ページ.length ? "読み取る（" + 状.ページ.length + " 枚）" : "読み取る";
    }
  }

  /* ── 読み取り（1 枚ずつ）───────────────────────────────── */
  /* ══ 1 枚 読む（2026-08-20）════════════════════════════════════════
     ★ 実測: 読み取りの 時間は **ほぼ 全部 サーバの 画像認識**。
         長辺1600px(50KB) → 7.5〜8.1 秒（通信も 縮小も 0 秒）
         長辺1000px      → 5.9 秒だが **誤読が 増える**（縮めても 損）
       だから 速くする道は「小さくする」ではなく
       **同時に 走らせる**ことと **撮った時点で 先に 読み始める**こと。
     ★ ときどき 24 秒で 詰まる（実測 2/2）。1 回だけ やり直す。 */
  function 読む1枚(p, 回) {
    p.状態 = "読み中"; 札を塗る();
    /* ★ 読み取りの 口を 替えた（2026-08-20・訴え「もう少し 早く できる？」）。
       実測（同じ紙）:
         前 /api/scan/generate?step=ocr … 7,547ms・誤読あり・24 秒で 詰まることも
         今 /api/scan/read（Gemini）    … 1,638ms・誤読なし
       **4.7 倍 速くて、しかも 正しい。** */
    return fetch(api() + "/api/scan/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ task: "ocr", images: [p.dataUrl] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok) {
        p.文 = String(j.text || "").trim();
        if (!p.題) { var 頭 = (p.文.split("\n")[0] || "").trim(); if (頭 && 頭.length <= 30) p.題 = 頭; }
        p.状態 = "済"; 札を塗る(); return true;
      }
      throw new Error(String((j && j.message) || "読めません"));
    }).catch(function (e) {
      if ((回 || 0) < 1) return 読む1枚(p, (回 || 0) + 1);   /* 1 回だけ やり直す */
      p.文 = ""; p.訳 = String((e && e.message) || e).slice(0, 60);
      p.状態 = "だめ"; 札を塗る(); return false;
    });
  }

  /* 溜まっている紙を **3 枚ずつ** 読む。撮った そばから 走らせる。 */
  var 同時 = 3;
  function 読む列を回す() {
    if (!状) return;
    var 走 = 状.ページ.filter(function (p) { return p.状態 === "読み中"; }).length;
    var 待 = 状.ページ.filter(function (p) { return p.種 === "写真" && !p.状態; });
    for (var i = 0;走 + i < 同時 && i < 待.length; i++) {
      読む1枚(待[i], 0).then(function () { 読む列を回す(); 読み終わりを見る(); });
    }
  }
  function まだ読んでいる() {
    return !!(状 && 状.ページ.some(function (p) {
      return p.種 === "写真" && (!p.状態 || p.状態 === "読み中"); }));
  }
  var 待ち人 = [];
  function 読み終わりを見る() {
    if (まだ読んでいる()) return;
    var 並 = 待ち人.slice(); 待ち人 = [];
    並.forEach(function (f) { try { f(); } catch (e) {} });
  }

  /* いまの 紙の 顔つき。変わっていなければ 読み直さない。 */
  function 印() {
    return 状.ページ.map(function (p) { return p.種 + ":" + String(p.dataUrl || "").length; }).join("|");
  }

  function まとめる() {
    var 出 = [], 見出し = "";
    状.ページ.forEach(function (p, i) {
      if (p.種 === "PDF") { 出.push("【" + p.名 + "】（PDF は そのまま AI へ 渡します）"); return; }
      if (!見出し && p.題) 見出し = p.題;
      出.push("【" + (i + 1) + " 枚目】\n"
        + (p.状態 === "済" ? (p.文 || "（字が 見つかりませんでした）")
           : "読めませんでした（" + (p.訳 || "訳は 分かりません") + "）"));
    });
    状.文 = 出.join("\n\n");
    状.見出し = 見出し || "スキャンした資料";
    状.読んだ印 = 印();
  }

  function 読み取る() {
    if (!状 || !状.ページ.length) return Promise.resolve(null);
    /* ★ 同じ紙を 二度 読まない。控えてある 中身を そのまま 出す。 */
    if (状.文 && 状.読んだ印 === 印()) { 面を消す(); 板面("読み取った中身"); 結果を出す();
      return Promise.resolve({ 文: 状.文, 見出し: 状.見出し }); }
    読む列を回す();
    if (!まだ読んでいる()) { まとめる(); 面を消す(); 板面("読み取った中身"); 結果を出す();
      return Promise.resolve({ 文: 状.文, 見出し: 状.見出し }); }
    var 面 = 板面("読み取っています…");
    var 帯 = 面.querySelector(".prog i"), 文 = 面.querySelector(".pmsg");
    var 全 = 状.ページ.filter(function (p) { return p.種 === "写真"; }).length;
    var 刻 = setInterval(function () {
      if (!状 || !状.面) { clearInterval(刻); return; }
      var 済 = 状.ページ.filter(function (p) { return p.種 === "写真" && (p.状態 === "済" || p.状態 === "だめ"); }).length;
      try {
        帯.style.width = Math.round(済 / Math.max(1, 全) * 100) + "%";
        文.textContent = 済 + " / " + 全 + " 枚 読めました（" + 同時 + " 枚ずつ 同時に 読んでいます）";
      } catch (e) {}
    }, 200);
    return new Promise(function (done) { 待ち人.push(done); }).then(function () {
      clearInterval(刻);
      まとめる();
      結果を出す();
      return { 文: 状.文, 見出し: 状.見出し };
    });
  }

  /* API の 行き先は 本体と 同じ決めかたに そろえる（別に持つと 食い違う）。 */
  function api() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function token() { try { return String(root.localStorage.getItem("app.auth.token.v1") || ""); } catch (e) { return ""; } }

  function 板面(題) {
    var s = doc.createElement("div");
    s.className = "sheet";
    s.innerHTML = '<div class="head"><h1>' + 逃す(題) + '</h1>'
      + '<button class="x" type="button" data-back aria-label="戻る">‹</button></div>'
      + '<div class="prog"><i></i></div><div class="pmsg"></div>'
      + '<div class="body"></div>';
    状.sr.querySelector(".back").appendChild(s);
    状.面 = s;
    return s;
  }
  function 面を消す() { if (状 && 状.面) { try { 状.面.remove(); } catch (e) {} 状.面 = null; } }

  function 結果を出す() {
    if (!状 || !状.面) return;
    var s = 状.面;
    s.querySelector(".head h1").textContent = "読み取った中身";
    var pr = s.querySelector(".prog"); if (pr) pr.remove();
    var pm = s.querySelector(".pmsg"); if (pm) pm.remove();
    var 枚 = 状.ページ.length;
    var 字 = String(状.文 || "").length;
    s.querySelector(".body").innerHTML =
      '<p class="note" style="padding-left:0;padding-right:0">'
      + 枚 + ' 枚 から ' + 字 + ' 字を 読み取りました。'
      + 'ここに 出ているものが、AI に 渡る 中身です。ちがっていたら 戻って 撮り直してください。</p>'
      + '<div class="txt">' + 逃す(状.文 || "（何も 読めませんでした）") + "</div>"
      /* ★ **指示（プロンプト）を 書ける ように する**（2026-08-31・訴え
         「何枚も スキャンしてから、添付させて、プロンプト（指示文章）と
           投げられる ように して ほしい。…プロンプトに 沿って」）。
         これまでは「この資料から N 問 作ってください」で 決め打ちだった。 */
      + '<div class="ask">'
      +   '<label for="vqscan-p">どんな 問題に しますか？（書かなくても 作れます）</label>'
      +   '<textarea id="vqscan-p" placeholder="例: 3 ページ目の 表から 計算問題を 中心に。'
      +     '記述も 2 問 入れて。難しめで。">' + 逃す(状.指示 || "") + '</textarea>'
      +   '<div class="n"><label for="vqscan-n">問題数</label>'
      +     '<input id="vqscan-n" type="number" min="3" max="30" step="1" value="'
      +     (Number(状.件数) || 10) + '"></div>'
      +   '<p class="hint">書いたことに 沿って 作ります。'
      +   '（読み取った 文字を そのまま 渡すので、絵を 送り直しません。）</p>'
      + '</div>';
    var go = doc.createElement("div");
    go.className = "go";
    /* ★ **いちばん やりたい ことだけ 大きく**（2026-09-01）。
       行き先が 4 つに 増えて、小さい 画面では ボタンの 列が 読む ところを
       食べて いた。**主役は 1 つ・残りは 横に 3 つ**。 */
    var 主 = 状.用途 === "添付"
      ? '<button type="button" data-go="attach">この 内容を 添付する</button>'
      : '<button type="button" data-go="quiz">問題を作る</button>';
    var 副 = (状.用途 === "添付"
        ? '<button type="button" data-go="quiz" class="alt">問題を作る</button>' : "")
      + '<button type="button" data-go="board" class="alt">ボードにまとめる</button>'
      + '<button type="button" data-go="game" class="alt">ゲームにする</button>';
    go.innerHTML = 主 + '<div class="go3">' + 副 + "</div>";
    s.appendChild(go);
  }

  /* いま 画面に 書かれている 指示と 問題数を 取る（無ければ 控えの まま）。 */
  function 指示を読む() {
    if (!状) return { 指示: "", 件数: 10 };
    var t = null, n = null;
    try { t = 状.sr.getElementById ? 状.sr.getElementById("vqscan-p") : 状.sr.querySelector("#vqscan-p"); } catch (e) {}
    try { n = 状.sr.getElementById ? 状.sr.getElementById("vqscan-n") : 状.sr.querySelector("#vqscan-n"); } catch (e) {}
    var 指示 = t ? String(t.value || "").trim() : String(状.指示 || "");
    var 件数 = n ? Number(n.value) : Number(状.件数);
    状.指示 = 指示;
    状.件数 = Math.max(3, Math.min(30, 件数 || 10));
    return { 指示: 指示, 件数: 状.件数 };
  }

  /* ── 渡す先 ─────────────────────────────────────────────── */
  /* ★★ **sourceType が 無いと 黙って 捨てられる**（2026-08-20・実測）。
     受け側（aiNormalizeChatImageAttachments）は
       sourceType === "image" かつ preview が data:image/ で 始まる
     ものしか 通さない。付け忘れていたので、**画像は 1 枚も 届いていなかった**。
     AI は「画像が 読み込まれていません」と 答え、板も ゲームも 作れなかった。
     ＝ 訴え「OCR が ちゃんと できてない」「ボードも 何も」の 正体。 */
  function 資料() {
    return 状.ページ.map(function (p) {
      return { name: p.名, mimeType: p.mime, preview: p.dataUrl,
               sourceType: p.種 === "PDF" ? "pdf" : "image" };
    });
  }
  function 待たせる(題, 文言) {
    面を消す();
    var s = 板面(題);
    s.querySelector(".pmsg").textContent = 文言;
    s.querySelector(".prog i").style.width = "35%";
    return s;
  }
  function 訳を読む(j) {
    var m = String((j && (j.message || j.code)) || "").trim();
    if (/混|BUSY|UNAVAILABLE/i.test(m)) return "いま AI が 混み合っています。少し おいて もう一度 押してください。";
    return m || "できませんでした。";
  }
  function しくじり(s, 文) {
    var e = doc.createElement("div");
    e.className = "err"; e.textContent = 文;
    s.querySelector(".body").appendChild(e);
    s.querySelector(".prog i").style.width = "100%";
    s.querySelector(".pmsg").textContent = "できませんでした。";
  }

  /* ★ 「混んでいます」は **待てば 戻る**（2026-08-20・訴え
     「混雑してるって言って 作れなかった。ボードも 何も」）。
     1 回で 諦めると、押した人には ただの 失敗に 見える。
     少し 待って もう一度だけ 試す。それでも だめなら 正直に 出す。 */
  function 話しかける(仕事, 追, 回) {
    /* ★ /api/ai/chat では **本番で Gemini に ならない**（CHAT_PROVIDER が
       workers_ai）。読み取りと 同じ口を 使う（提供元を 決め打てる）。 */
    return fetch(api() + "/api/scan/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ task: 仕事, images: 画たち(), prompt: 追 || "" })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var 本文 = String((j && j.text) || "").trim();
      var 混 = !本文 && /混|BUSY|UNAVAILABLE|しばらく|時間をおいて/i.test(
        String((j && (j.message || j.code)) || ""));
      if ((混 || !本文) && (回 || 0) < 1) {
        return new Promise(function (r2) { setTimeout(r2, 2500); })
          .then(function () { return 話しかける(仕事, 追, (回 || 0) + 1); });
      }
      return j;
    }, function (e) {
      if ((回 || 0) < 1) {
        return new Promise(function (r2) { setTimeout(r2, 2500); })
          .then(function () { return 話しかける(仕事, 追, (回 || 0) + 1); });
      }
      throw e;
    });
  }
  /* 送る 画（写真だけ。PDF は この口では 読めない） */
  function 画たち() {
    return 状.ページ.filter(function (p) { return p.種 === "写真"; })
      .map(function (p) { return p.dataUrl; }).slice(0, 8);
  }

  function ボードへ() {
    var s = 待たせる("ボードにまとめています…", "読み取った中身から、板を 組み立てています。");
    return 話しかける("board", "読み取った中身（参考）:\n" + String(状.文 || "").slice(0, 6000))
      .then(function (j) {
      var md = String((j && j.text) || "").trim();
      if (!md) { しくじり(s, 訳を読む(j)); return false; }
      md = md.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "");
      try {
        if (root.__vqLive && root.__vqLive.板) { root.__vqLive.板(状.見出し || "スキャンした資料", md); 閉じる(); return true; }
      } catch (e) {}
      /* 板の 部品が 無ければ、この画面に そのまま 出す（黙って 消さない）。 */
      s.querySelector(".head h1").textContent = "まとめました";
      s.querySelector(".prog").remove(); s.querySelector(".pmsg").remove();
      s.querySelector(".body").innerHTML = '<div class="txt">' + 逃す(md) + "</div>";
      return true;
    }, function () { しくじり(s, "つながりませんでした。"); return false; });
  }

  function 問題へ(o2) {
    /* 前は 件数（数）を そのまま 受けていた。指示も 受ける ので 器を 変える。
       数を そのまま 渡された ときも これまでどおり 動く。 */
    if (typeof o2 === "number" || typeof o2 === "string") o2 = { 件数: o2 };
    o2 = o2 || {};
    var n = Math.max(3, Math.min(30, Number(o2.件数) || Number(状 && 状.件数) || 10));
    var 指示 = String(o2.指示 || (状 && 状.指示) || "").trim().slice(0, 1200);

    /* ══ ★ **読み取った 文字を 渡す**（2026-08-31・訴え「高速で 読んで、
         すぐに 問題に できる ように」）══════════════════════════════
       これまでは 撮った 絵を そのまま 送り直していた。
       スキャンは 撮った そばから 1 枚 1.6 秒で 文字に して あるのに、
       作る ときに **同じ 絵を もう 一度** 読ませていた。しかも 生成は
       2〜5 回に 分けて 頼むので、同じ 絵を その 回数だけ 送る。
       文字なら 数十 KB。絵は 1 枚 50KB × 枚数 × 頼む 回数。
       ★ 読めなかった ページ（PDF・失敗）だけは これまでどおり 絵で 送る。
         「読めた ふり」を しない ため。 */
    var 文 = String((状 && 状.文) || "").trim();
    var 残り = (状 ? 状.ページ : []).filter(function (p) {
      return p.種 === "PDF" || p.状態 !== "済" || !String(p.文 || "").trim();
    });
    var files = (文 ? 残り : (状 ? 状.ページ : [])).map(function (p) {
      var m = /^data:([^;,]+);base64,(.+)$/i.exec(String(p.dataUrl || ""));
      return m ? { mimeType: m[1], data: m[2] } : null;
    }).filter(Boolean);

    var 頼み = (指示 || "この 資料から 問題を 作って ください。")
      + "\n\n★ **" + n + " 問** 作って ください。"
      + "\n★ 下の【資料の 本文】に 書いて ある ことだけを 根拠に します。"
      + "書いて いない ことは 足さないで ください。";
    if (文) 頼み += "\n\n【資料の 本文】\n" + 文.slice(0, 60000);
    if (files.length) {
      頼み += "\n\n（文字に できなかった " + files.length + " ページは そのまま 添えて います。）";
    }

    var s = 待たせる("問題を作っています…",
      n + " 問 作ります。" + (文 ? "読み取った 文字（" + 文.length + " 字）で 作るので 速いです。"
                                : "資料を 読みながら 作るので 1 分ほど かかります。"));
    return fetch(api() + "/api/aigen/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ prompt: 頼み, count: n, files: files })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.ok === false) { しくじり(s, 訳を読む(j)); return null; }
      s.querySelector(".head h1").textContent = "問題ができました";
      s.querySelector(".prog i").style.width = "100%";
      s.querySelector(".pmsg").textContent = "";
      var qs = (j.questions || j.items || []);
      s.querySelector(".body").innerHTML = '<p class="note" style="padding-left:0">'
        + qs.length + " 問 できました。下から プリセットとして 残せます。</p>"
        + '<div class="txt">' + 逃す(qs.slice(0, 8).map(function (q, i) {
            return (i + 1) + ". " + String(q.question || q.front || q.q || "").slice(0, 120);
          }).join("\n")) + (qs.length > 8 ? "\n…ほか " + (qs.length - 8) + " 問" : "") + "</div>";
      状.問題 = j;
      var go = doc.createElement("div");
      go.className = "go";
      go.innerHTML = '<button type="button" data-save="preset">プリセットとして残す</button>';
      s.appendChild(go);
      return j;
    }, function () { しくじり(s, "つながりませんでした。"); return null; });
  }

  function ゲームへ() {
    var s = 待たせる("ゲームを作っています…", "読み取った中身から、遊べるものを 組み立てています。");
    return 話しかける("game", "読み取った中身（参考）:\n" + String(状.文 || "").slice(0, 5000))
      .then(function (j) {
      var code = String((j && j.text) || "").trim();
      if (!code) { しくじり(s, 訳を読む(j)); return false; }
      code = code.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
      try {
        if (root.__vqLive && root.__vqLive.アプリ) {
          root.__vqLive.アプリ(状.見出し || "スキャンから作ったもの", code); 閉じる(); return true;
        }
      } catch (e) {}
      しくじり(s, "動かす部品が ありません。ボードにまとめる を 使ってください。");
      return false;
    }, function () { しくじり(s, "つながりませんでした。"); return false; });
  }

  /* ── 開く・閉じる ───────────────────────────────────────── */
  function 開く(o) {
    o = o || {};
    if (状) return 状;
    var host = doc.createElement("div");
    host.setAttribute("data-vqscan", "1");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483500;";
    var sr = host.attachShadow({ mode: "open" });
    var st0 = doc.createElement("style"); st0.textContent = CSS; sr.appendChild(st0);
    var box = doc.createElement("div");
    box.className = "back";
    box.innerHTML = '<div class="head"><h1>スキャン</h1>'
      + '<button class="x" type="button" data-close aria-label="やめる">✕</button></div>'
      + '<div class="view"><video playsinline muted></video>'
      + '<div class="hint">紙が 画面いっぱいに 入るように 構えて、丸いボタンで 撮ります。何枚でも 撮れます。</div></div>'
      + '<div class="strip"></div>'
      + '<div class="bar">'
      + '<button class="sub" type="button" data-add>写真・PDF を足す</button>'
      + '<button class="shot" type="button" aria-label="撮る"></button>'
      + '<button class="sub" type="button" data-read disabled>読み取る</button>'
      + "</div>";
    sr.appendChild(box);
    doc.body.appendChild(host);
    状 = { host: host, sr: sr, ページ: [], stream: null, 文: "", 見出し: "", 面: null,
           /* ★ 指示（プロンプト）と 問題数を **画面に 持たせる**（2026-08-31）。
              開いた 人が 先に 渡す ことも、画面で 書く ことも できる。 */
           指示: String(o.指示 || ""), 件数: Math.max(3, Math.min(30, Number(o.件数) || 10)),
           /* 用途 "添付" … 問題に せず、読み取った 中身を 呼んだ 側へ 返す。 */
           用途: String(o.用途 || ""), 済んだら: (typeof o.済んだら === "function" ? o.済んだら : null) };

    sr.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-close]")) { e.preventDefault(); 閉じる(); return; }
      if (t.closest("[data-back]")) { e.preventDefault(); 面を消す(); return; }
      if (t.closest(".shot")) { e.preventDefault(); 撮る(); return; }
      if (t.closest("[data-add]")) { e.preventDefault(); 選ばせる(); return; }
      if (t.closest("[data-read]")) { e.preventDefault(); 読み取る(); return; }
      var d = t.closest("[data-del]");
      if (d) { e.preventDefault(); 状.ページ.splice(Number(d.getAttribute("data-del")), 1); 並べ直す(); return; }
      var g = t.closest("[data-go]");
      if (g) {
        e.preventDefault();
        var k = g.getAttribute("data-go");
        var 注 = 指示を読む();
        if (k === "board") ボードへ();
        else if (k === "quiz") 問題へ({ 件数: 注.件数 || o.件数, 指示: 注.指示 });
        else if (k === "game") ゲームへ();
        else if (k === "attach") 添付する();
        return;
      }
      if (t.closest("[data-save]")) { e.preventDefault(); 残す(); return; }
    });
    doc.addEventListener("keydown", 鍵, true);
    カメラを出す();
    return 状;
  }
  function 鍵(e) { if (e.key === "Escape" && 状) { e.preventDefault(); if (状.面) 面を消す(); else 閉じる(); } }

  function 選ばせる() {
    var inp = doc.createElement("input");
    inp.type = "file"; inp.multiple = true;
    inp.accept = "image/*,application/pdf";
    inp.style.cssText = "position:fixed;left:-9999px;";
    doc.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var fs = inp.files;
      try { inp.remove(); } catch (e) {}
      if (fs && fs.length) 足す(fs);
    });
    inp.click();
  }

  function 残す() {
    if (!状 || !状.問題) return Promise.resolve(false);
    try {
      if (root.VQ2 && root.VQ2.presets && root.VQ2.presets.取り込む) {
        root.VQ2.presets.取り込む(状.問題);
        閉じる(); return Promise.resolve(true);
      }
    } catch (e) {}
    /* 受け口が 無ければ **黙って 捨てない**。端末に 残して 知らせる。 */
    try {
      root.localStorage.setItem("vq.scan.lastQuestions",
        JSON.stringify(状.問題).slice(0, 2 * 1024 * 1024));
    } catch (e) {}
    var s = 状.面;
    if (s) しくじり(s, "この画面からは まだ 残せません。作ったものは 端末に 控えました（vq.scan.lastQuestions）。");
    return Promise.resolve(false);
  }

  /* ══ 読み取った 中身を **呼んだ 側へ 返す**（2026-08-31・訴え「添付させて」）══
     作る 画面から 開いた ときは、ここで 資料として 渡して 閉じる。
     ★ 返すのは **文字**（と 読めなかった ページの 絵）。
       絵だけ 返すと、受け取った 側で もう 一度 読む ことに なる。 */
  function 添付する() {
    if (!状) return false;
    var 注 = 指示を読む();
    var 出 = {
      文: String(状.文 || ""), 見出し: 状.見出し || "スキャンした資料",
      枚数: 状.ページ.length, 指示: 注.指示, 件数: 注.件数,
      ページ: 状.ページ.map(function (p) {
        return { 種: p.種, 名: p.名, mime: p.mime, dataUrl: p.dataUrl,
                 文: String(p.文 || ""), 状態: p.状態 || "" };
      })
    };
    var 受け = 状.済んだら;
    閉じる();
    if (受け) { try { 受け(出); } catch (e) {} }
    return true;
  }

  function 閉じる() {
    if (!状) return false;
    カメラを止める();
    try { doc.removeEventListener("keydown", 鍵, true); } catch (e) {}
    try { 状.host.remove(); } catch (e) {}
    状 = null;
    return true;
  }

  root.VQSCAN = {
    開く: 開く, 閉じる: 閉じる,
    開いているか: function () { return !!状; },
    枚数: function () { return 状 ? 状.ページ.length : 0; },
    取り出す: function () { return 状 ? { ページ: 状.ページ.slice(), 文: 状.文, 見出し: 状.見出し } : null; },
    /* 確かめるとき用（カメラの 無い所でも 中身を 入れられる） */
    _足す: function (p) { if (状) { 状.ページ.push(p); 並べ直す(); } },
    読み取る: 読み取る, ボードへ: ボードへ, 問題へ: 問題へ, ゲームへ: ゲームへ,
    添付する: 添付する, 指示を読む: 指示を読む,
    CSS: CSS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
