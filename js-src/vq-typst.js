/* ══════════════════════════════════════════════════════════════════════
   vq-typst.js — 組版（Typst）を **この端末の ブラウザで** 走らせる

   訴え（2026-08-30・Rinty さん）「Typst を Mac から 離す」

   これまで 組版は Rinty さんの Mac の Bridge でしか 走らなかった。
   だから `available: false` のまま で、誰も 使えていなかった。
   Cloudflare Worker では Typst は 走らせられないので、
   残る 道は **ブラウザで wasm を 動かす**こと。

   実測（2026-08-30・本物の 試験の 原稿 36,056 字）
     ・組版そのもの … **387ms**（2 回目は 9ms）
     ・出てきたもの … 本物の PDF・3 ページ・日本語の 書体が 埋め込まれる
     ・表紙も 出る（年 組 番 氏名／開始の指示があるまで開かないこと）

   ★ 重さ（正直に 言う）
       組版の 本体   10.8MB（gzip したもの。中では 28.3MB に 戻る）
       明朝 NotoSerifJP-Regular  6.2MB
       ゴシック NotoSansJP-Regular 4.5MB
       つなぎ        0.24MB
       ────────────────────────
       合わせて およそ 21MB。**押したときにしか 取りに行かない。**
     1 年 溜めるので 2 回目からは 1 バイトも 流れない（_headers）。
     細い 回線（1.2Mbps）だと 3 分ちかく かかる。だから **先に 大きさを 言う**。

   ★ 使えるふりを しない
     読み込みに 失敗したら false のまま。**組めたことを 一度 確かめてから**
     「使える」と 言う（layout-profiles.js の 約束）。

   出しているもの: window.VQTYPST
     用意ができているか()   … もう 読み込み済みか
     大きさ()               … 何 MB 要るか（画面に 出す用）
     用意する(onProgress)   … 読み込む。Promise<{ok}>
     組む(source)           … Promise<Uint8Array（PDF）>
     試す()                 … 小さな 原稿で 一度 組んでみる（自己点検）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQTYPST = root.VQTYPST || (root.VQTYPST = {});

  var 置き場 = "/typst/";
  var 部品 = {
    つなぎ: 置き場 + "typst-ts.js",
    本体:   置き場 + "typst-compiler.wasm.gz",
    明朝:   置き場 + "NotoSerifJP-Regular.otf",
    ゴシック: 置き場 + "NotoSansJP-Regular.otf"
  };
  /* 画面へ 出す 目安。実測の バイト数（_headers で 1 年 溜まる）。 */
  var 目安 = { 本体: 10733225, 明朝: 6210492, ゴシック: 4533028, つなぎ: 241434 };
  var 合計 = 目安.本体 + 目安.明朝 + 目安.ゴシック + 目安.つなぎ;

  var 状態 = { 済み: false, 進行中: null, 使える: false, なぜ: "", $typst: null };

  function MB(n) { return Math.round(n / 1024 / 1024 * 10) / 10; }
  function 大きさ() {
    return { バイト: 合計, MB: MB(合計),
             内訳: { 本体: MB(目安.本体), 明朝: MB(目安.明朝),
                     ゴシック: MB(目安.ゴシック), つなぎ: MB(目安.つなぎ) } };
  }
  function 用意ができているか() { return 状態.済み && 状態.使える; }

  /* 進み具合が 分かるように、**読んだ バイト数**を 数えながら 取る。
     20MB を 黙って 待たせない（何も 起きていないように 見える）。 */
  function 取る(url, 進み, 目安バイト) {
    return root.fetch(url, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " が 取れません（HTTP " + r.status + "）");
      if (!r.body || !r.body.getReader) return r.arrayBuffer();
      var 全 = Number(r.headers.get("content-length")) || 目安バイト || 0;
      var reader = r.body.getReader();
      var 切れ = [], 読んだ = 0;
      return (function 次へ() {
        return reader.read().then(function (x) {
          if (x.done) {
            var 出 = new Uint8Array(読んだ), p = 0;
            切れ.forEach(function (c) { 出.set(c, p); p += c.length; });
            return 出.buffer;
          }
          切れ.push(x.value); 読んだ += x.value.length;
          if (進み) 進み(読んだ, 全);
          return 次へ();
        });
      })();
    });
  }

  /* gzip を ほどく。ブラウザが 持っている DecompressionStream を 使う
     （自前の 展開器を 持ち込まない）。 */
  function ほどく(buf) {
    if (typeof root.DecompressionStream !== "function") {
      return Promise.reject(new Error("この ブラウザは gzip を ほどけません。"));
    }
    var st = new root.DecompressionStream("gzip");
    var w = st.writable.getWriter();
    w.write(new Uint8Array(buf)); w.close();
    return new root.Response(st.readable).arrayBuffer();
  }

  function 用意する(onProgress) {
    if (状態.済み) return Promise.resolve({ ok: 状態.使える, なぜ: 状態.なぜ });
    if (状態.進行中) return 状態.進行中;

    var 済バイト = 0;
    function 知らせる(段, 読んだ, 全) {
      if (!onProgress) return;
      var いま = 済バイト + (読んだ || 0);
      onProgress({ 段: 段, 読んだ: いま, 全: 合計,
                   割合: Math.max(0, Math.min(1, いま / 合計)) });
    }

    状態.進行中 = Promise.resolve()
      .then(function () {
        知らせる("つなぎ", 0, 目安.つなぎ);
        /* つなぎ（typst.ts を esbuild で 束ねたもの）。window.__typst を 置く。 */
        if (root.__typst) return null;
        return new Promise(function (ok, ng) {
          var s = root.document.createElement("script");
          s.type = "module";
          s.src = 部品.つなぎ;
          s.onload = function () { ok(null); };
          s.onerror = function () { ng(new Error("組版の つなぎを 読み込めません。")); };
          (root.document.head || root.document.documentElement).appendChild(s);
        }).then(function () {
          /* type="module" は onload の あとに 実行が 終わっているとは 限らない。
             __typst が 現れるまで 少しだけ 待つ。 */
          return new Promise(function (ok, ng) {
            var n = 0;
            var t = setInterval(function () {
              if (root.__typst) { clearInterval(t); ok(null); return; }
              if (++n > 100) { clearInterval(t); ng(new Error("組版の つなぎが 動きません。")); }
            }, 50);
          });
        });
      })
      .then(function () {
        済バイト = 目安.つなぎ;
        知らせる("本体", 0, 目安.本体);
        return 取る(部品.本体, function (r, a) { 知らせる("本体", r, a); }, 目安.本体);
      })
      .then(function (gz) { return ほどく(gz); })
      .then(function (wasm) {
        済バイト = 目安.つなぎ + 目安.本体;
        var T = root.__typst;
        if (!T || !T.$typst) throw new Error("組版の つなぎが ありません。");
        T.$typst.setCompilerInitOptions({
          getModule: function () { return wasm; },
          /* ★ `assets: false` を **必ず 付ける**（2026-08-30）。
             付けないと typst.ts が 既定の 書体を
             cdn.jsdelivr.net から 勝手に 取りに 行く（実測 19 本）。
             ・回線が 無いと そこで 止まる
             ・どこへ 何を 取りに 行ったかが 外へ 漏れる
             Noto Serif JP / Noto Sans JP は 英数字も 持っているので、
             既定の 書体は 要らない。 */
          beforeBuild: [ T.preloadRemoteFonts([部品.明朝, 部品.ゴシック], { assets: false }) ]
        });
        知らせる("書体", 0, 目安.明朝 + 目安.ゴシック);
        状態.$typst = T.$typst;
        return null;
      })
      .then(function () { return 試す(); })
      .then(function (r) {
        状態.済み = true;
        状態.使える = !!(r && r.ok);
        状態.なぜ = (r && r.なぜ) || "";
        知らせる("できた", 合計, 合計);
        return { ok: 状態.使える, なぜ: 状態.なぜ };
      })
      .catch(function (e) {
        状態.済み = true; 状態.使える = false;
        状態.なぜ = String((e && e.message) || e).slice(0, 200);
        状態.進行中 = null;
        return { ok: false, なぜ: 状態.なぜ };
      });
    return 状態.進行中;
  }

  /* 自己点検。**組めたことを 一度 確かめてから**「使える」と 言う。
     ここを 飛ばすと、書体が 落ちていても「使える」に なり、
     豆腐（□□□）だらけの 紙が 出る。 */
  function 試す() {
    if (!状態.$typst) return Promise.resolve({ ok: false, なぜ: "組版が 用意できていません。" });
    var 見本 = '#set page(width: 100mm, height: 40mm, margin: 8mm)\n'
      + '#set text(font: ("Noto Serif JP", "Noto Sans JP"), size: 10.5pt)\n'
      + '試験　日本語が 組めています。\n';
    return 状態.$typst.pdf({ mainContent: 見本 }).then(function (pdf) {
      var u = new Uint8Array(pdf || []);
      if (u.length < 500) return { ok: false, なぜ: "組めましたが 中身が ありません。" };
      var 頭 = String.fromCharCode(u[0], u[1], u[2], u[3], u[4]);
      if (頭 !== "%PDF-") return { ok: false, なぜ: "PDF に なりませんでした。" };
      /* 書体が 埋め込まれているか。埋め込まれていないと 豆腐に なる。 */
      var 文 = "";
      for (var i = 0; i < Math.min(u.length, 60000); i++) 文 += String.fromCharCode(u[i]);
      if (文.indexOf("/BaseFont") < 0) return { ok: false, なぜ: "書体が 埋め込まれませんでした。" };
      return { ok: true, バイト: u.length };
    }, function (e) {
      return { ok: false, なぜ: String((e && e.message) || e).slice(0, 160) };
    });
  }

  /* 原稿（Typst のソース）を PDF に する。
     ★ 原稿を 作るのは VQ2.typstRenderer。ここは **走らせるだけ**。 */
  function 組む(source) {
    var src = String(source || "");
    if (!src) return Promise.reject(new Error("原稿が ありません。"));
    return 用意する().then(function (r) {
      if (!r.ok) throw new Error(r.なぜ || "組版を 用意できませんでした。");
      return 状態.$typst.pdf({ mainContent: src });
    }).then(function (pdf) {
      var u = new Uint8Array(pdf || []);
      if (u.length < 500) throw new Error("組めましたが 中身が ありません。");
      return u;
    });
  }

  /* PDF を そのまま 保存させる。印刷の 窓を 通さない
     （通すと 余白が 変わり、紙面が ずれる）。 */
  function 保存する(u8, 名) {
    try {
      var blob = new root.Blob([u8], { type: "application/pdf" });
      var url = root.URL.createObjectURL(blob);
      var a = root.document.createElement("a");
      a.href = url;
      a.download = String(名 || "exam") + ".pdf";
      root.document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { root.document.body.removeChild(a); root.URL.revokeObjectURL(url); } catch (e) {}
      }, 2000);
      return true;
    } catch (e) { return false; }
  }

  VQTYPST.用意ができているか = 用意ができているか;
  VQTYPST.大きさ = 大きさ;
  VQTYPST.用意する = 用意する;
  VQTYPST.組む   = 組む;
  VQTYPST.試す   = 試す;
  VQTYPST.保存する = 保存する;
  VQTYPST.状態   = function () { return { 済み: 状態.済み, 使える: 状態.使える, なぜ: 状態.なぜ }; };
})(typeof globalThis !== "undefined" ? globalThis : this);
