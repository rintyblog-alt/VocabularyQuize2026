/* ══════════════════════════════════════════════════════════════════════════
   core/board/play.js — 板を **上から下まで 解説する**（2026-08-19）

   訴え:
     「ボードが 出たときに、タイトルの右に 再生マークを 置いてほしい。
       ここを 再生すると、ボードを 上から下まで Lumi が 解説できるように。
       リアルタイムで 解説している部分に マーカーを 引いたり、
       波線を 新たに 引いたり、自由に ペンで 説明できたりも できるように。
       あとは 追加で テキストで リアルタイムに 文字を 増やしたり」

   ここが 引き受けること（**声は 出さない**。声は vq-live が 持つ）:
     ・板の中身を **区切り**に 分ける（見出し・段落・箇条書き・表・式）
     ・いま話している区切りへ **すっと 動かして**、そこを 目立たせる
     ・上に 透明な 板を 重ねて、そこへ 線を 引く
         marker … 蛍光ペン（文字の 上に 重ねる）
         wave   … 波線（文字の 下に 引く）
         pen    … 自由な線（Lumi が 点を 渡す／人が 指で 描く）
         box    … 囲み
         arrow  … 矢印
     ・区切りの あとに **文字を 足す**（言いながら 書き足す）

   守ること:
     ・線は **中身と 同じ座標**で 持つ。だから 動かしても ずれない。
     ・板の 中身を 書き換えない（線は 別の 重ね板）。消せば 元どおり。
     ・重ね板は 触れない（pointer-events:none）。ただし
       **人が 描くとき だけ** 触れるようにする。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  if (VQB.play) return;
  var doc = root.document;

  var CSS = [
    ".vqp-host{position:relative;}",
    ".vqp-lay{position:absolute;inset:0;pointer-events:none;z-index:3;overflow:visible;}",
    ".vqp-lay.on{pointer-events:auto;cursor:crosshair;}",
    /* 蛍光ペン。明るい画面は かけ算（下の 字が 透ける）。
       暗い画面で かけ算に すると **真っ黒に 沈んで 字が 読めない**ので、
       重ねかたを 変える。どちらでも 字は 読める。 */
    ".vqp-mk{mix-blend-mode:multiply;}",
    "@media (prefers-color-scheme:dark){.vqp-mk{mix-blend-mode:screen;opacity:.30;}}",
    /* いま話している所 */
    ".vqp-now{position:relative;z-index:1;}",
    ".vqp-now::before{content:'';position:absolute;inset:-6px -10px;border-radius:10px;",
    "background:rgba(124,110,220,.10);box-shadow:0 0 0 1.5px rgba(124,110,220,.30);",
    "pointer-events:none;animation:vqp-in .22s ease;}",
    "@keyframes vqp-in{from{opacity:0;transform:scale(.99)}to{opacity:1;transform:none}}",
    /* 言いながら 足した文字 */
    ".vqp-add{display:block;margin:6px 0 0;padding:7px 10px;border-radius:9px;",
    "background:rgba(124,110,220,.08);border-left:3px solid rgba(124,110,220,.55);",
    "font-size:.95em;line-height:1.85;animation:vqp-in .2s ease;}",
    ".vqp-cursor{display:inline-block;width:2px;height:1em;vertical-align:-.15em;",
    "background:currentColor;animation:vqp-blink 1s steps(2) infinite;margin-left:1px;}",
    "@keyframes vqp-blink{50%{opacity:0}}",
    /* 操作の帯 */
    ".vqp-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px;}",
    ".vqp-bar button{height:30px;padding:0 11px;border-radius:999px;font:inherit;font-size:12.5px;",
    "font-weight:650;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}",
    ".vqp-bar button.on{background:#5F579E;border-color:#5F579E;color:#fff;}",
    ".vqp-bar .sp{flex:1 1 auto;}",
    ".vqp-bar .st{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);",
    "font-variant-numeric:tabular-nums;}",
    /* 下線に つける 番号（①②③…）。線の 左端に 小さく 出す。 */
    ".vqp-no{position:absolute;transform:translate(-50%,-50%);font-size:11px;font-weight:750;",
    "line-height:1;color:#fff;background:#E0563C;border-radius:999px;min-width:16px;height:16px;",
    "display:flex;align-items:center;justify-content:center;padding:0 4px;pointer-events:none;",
    "box-shadow:0 1px 3px rgba(16,15,26,.25);animation:vqp-in .2s ease;}",
    /* 付箋。ボードに **無いこと**を あとから 貼る。 */
    /* ★ 付箋は **紙**。暗い画面でも 紙のままにする（2026-08-20・訴え
       「ダークモードだと 付箋が ちょっと 怪しいかもしれない」）。
       もとは 背景だけ 決めて 字の色を 決めていなかった。
       暗い画面では 字が 明るい色を 受け継ぐので、
       **薄い黄色の 紙に 白い字**になって 読めなくなる。
       字の色を ここで 決め打つ。紙の色も 暗い画面では 少し 沈める。 */
    ".vqp-tag{position:relative;display:block;margin:8px 0 2px;padding:10px 12px 10px 13px;",
    "border-radius:10px;background:#FFF8D6;border:1px solid #F0E2A0;color:#2B2836;",
    "box-shadow:0 2px 8px rgba(16,15,26,.10);font-size:.94em;line-height:1.85;",
    "animation:vqp-in .22s ease;}",
    ".vqp-tag *{color:inherit;}",
    ".vqp-tag mark{background:rgba(255,214,0,.55);color:#2B2836;}",
    ".vqp-tag code{background:rgba(16,15,26,.09);color:#2B2836;}",
    ".vqp-tag::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;",
    "border-radius:3px;background:#E3B341;}",
    ".vqp-tag.aoi{background:#EAF2FE;border-color:#C9DCF7;}",
    ".vqp-tag.aoi::before{background:#5B8DEF;}",
    ".vqp-tag.midori{background:#EAF6EE;border-color:#CBE6D6;}",
    ".vqp-tag.midori::before{background:#4C9A6A;}",
    ".vqp-tag.momo{background:#FDECEF;border-color:#F5CBD4;}",
    ".vqp-tag.momo::before{background:#D9587A;}",
    ".vqp-tag>*:first-child{margin-top:0;}",
    ".vqp-tag>*:last-child{margin-bottom:0;}",
    ".vqp-tag h1,.vqp-tag h2,.vqp-tag h3{font-size:1.02em;margin:.5em 0 .3em;}",
    ".vqp-tag code{background:rgba(16,15,26,.07);padding:.1em .35em;border-radius:4px;}",
    ".vqp-tag ul,.vqp-tag ol{margin:.3em 0 .3em 1.2em;}",
    /* 暗い画面。紙は 少し 沈め、字は 濃いまま（読めることを 最優先）。 */
    "@media (prefers-color-scheme:dark){",
    ".vqp-tag{background:#F2E7BE;border-color:#D9C888;color:#241F14;",
    "box-shadow:0 2px 10px rgba(0,0,0,.42);}",
    ".vqp-tag.aoi{background:#D9E6FA;border-color:#A9C4EA;color:#12213A;}",
    ".vqp-tag.midori{background:#D8EDDF;border-color:#A8CDB7;color:#12291C;}",
    ".vqp-tag.momo{background:#F7DCE3;border-color:#E2AFBD;color:#33141C;}",
    ".vqp-tag mark{background:rgba(255,196,0,.55);color:#241F14;}",
    ".vqp-tag code{background:rgba(0,0,0,.10);color:#241F14;}}"
  ].join("");

  /* ══ 色（2026-08-19・訴え「背景の 色つきマーカーで 線を 引けるものも 追加して。
     破綻しないように」）════════════════════════════════════════════
     ★ 色は **選ばせない**（好きな色を 渡させると、濃すぎて 字が 読めなくなる）。
       名前で 選ぶ。濃さは こちらで 決める。
     ★ 暗い画面では multiply だと **真っ黒に 沈む**ので、
       重ねかたを 変える（CSS の @media で 切り替え）。
     ★ 線（波線・囲み・矢印）は はっきり 見える 濃い色、
       蛍光ペンは 薄い色。同じ 名前でも 用途で 分ける。 */
  var 色見本 = {
    "": { 塗: "#FFE24D", 線: "#E0563C" },
    "きいろ": { 塗: "#FFE24D", 線: "#C9922B" },
    "ももいろ": { 塗: "#FFC1D4", 線: "#D9587A" },
    "あお": { 塗: "#BBD9FF", 線: "#3E72C9" },
    "みどり": { 塗: "#B8ECC8", 線: "#3E9160" },
    "だいだい": { 塗: "#FFD1A6", 線: "#D2762A" },
    "むらさき": { 塗: "#DCCBFF", 線: "#7A5BD1" },
    "あか": { 塗: "#FFC6C0", 線: "#D1373B" }
  };
  /* 英語でも 受ける（言い方を 縛らない）。 */
  var 色の別名 = { yellow: "きいろ", pink: "ももいろ", blue: "あお", green: "みどり",
                   orange: "だいだい", purple: "むらさき", red: "あか",
                   黄: "きいろ", 桃: "ももいろ", 青: "あお", 緑: "みどり",
                   橙: "だいだい", 紫: "むらさき", 赤: "あか" };
  function 色を選ぶ(名, 用途) {
    var k = String(名 || "").trim();
    if (色の別名[k]) k = 色の別名[k];
    var c = 色見本[k] || 色見本[""];
    /* 名前で 選ばれなかった とき、**#rrggbb を 渡されても 受けない**。
       濃さが 分からない色を 塗ると 字が 消える。既定に 落とす。 */
    return 用途 === "塗" ? c.塗 : c.線;
  }

  /* ── 区切りを 見つける ────────────────────────────────────────
     見出し・段落・箇条書き・表・式。**中に 字が 在るもの**だけ。 */
  var 区切りの札 = "h1,h2,h3,h4,p,li,blockquote,pre,table,.vqmd-math,.vqm-svg,figure";
  function 区切りを拾う(親) {
    if (!親) return [];
    var 出 = [], 見た = [];
    var 並 = 親.querySelectorAll(区切りの札);
    for (var i = 0; i < 並.length; i++) {
      var e = 並[i];
      /* 入れ子（li の 中の p など）は 外側だけ 採る */
      var 中に入っている = false;
      for (var j = 0; j < 見た.length; j++) if (見た[j].contains(e)) { 中に入っている = true; break; }
      if (中に入っている) continue;
      var t = String(e.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      見た.push(e);
      出.push({ i: 出.length, el: e, text: t });
    }
    return 出;
  }

  /* ══ どこが **大事か** を 板から 読む（2026-08-20・訴え）════════════
     「カッコが あったり、マーカーが 引いてあるところや、Lumi が 重要だと
       思う部分を **徹底的に 解説に 入れられるように**して欲しい」

     ★ 大事さは **書いた人が すでに 印を つけている**。
       太字・下線・蛍光ペン・注意書き・カッコ・数と式。
       それを 数えれば「どこを 厚く 話すか」は こちらで 決められる。
       Lumi の 気分に 任せない。
     ★ 拾った言葉は **そのまま 渡す**。「ここは 必ず 触れて」と 言えるようにする。 */
  function 見どころ(el) {
    var 出 = [], 重み = 0;
    var 足す = function (t, 種, 点) {
      t = String(t || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 60) return;
      if (出.some(function (x) { return x.語 === t; })) return;
      出.push({ 語: t, 種: 種 }); 重み += 点;
    };
    try {
      /* ① 印が ついている所（いちばん 強い） */
      el.querySelectorAll("mark").forEach(function (x) { 足す(x.textContent, "蛍光ペン", 3); });
      el.querySelectorAll("strong,b").forEach(function (x) { 足す(x.textContent, "太字", 2); });
      el.querySelectorAll("u").forEach(function (x) { 足す(x.textContent, "下線", 2); });
      el.querySelectorAll("code").forEach(function (x) { 足す(x.textContent, "そのままの語", 1); });
      el.querySelectorAll(".vqmd-math,.vqmd-math-b").forEach(function (x) { 足す(x.textContent, "式", 2); });
      /* ② 注意書き（> [!大事] など）は かたまりごと 大事 */
      if (el.closest && el.closest(".vqmd-cal")) 重み += 3;
      if (/^H[1-4]$/.test(el.tagName || "")) 重み += 2;      /* 見出し */
      /* ③ カッコの 中（言いかえ・読み・補足が 入る所） */
      var t = String(el.textContent || "");
      var m = t.match(/[（(]([^（()）]{1,40})[)）]/g) || [];
      m.slice(0, 4).forEach(function (x) {
        足す(x.replace(/^[（(]|[)）]$/g, ""), "かっこの中", 2);
      });
      /* ④ 数・式が 出てくる所 */
      if (/\d/.test(t)) 重み += 1;
    } catch (e) {}
    return { 語ら: 出, 重み: 重み };
  }

  /* ══ 意味の まとまりに 束ねる（2026-08-20・訴え）════════════════════
     「1 行 1 行 解説しているから、同じ説明を 2 回くらい することがある。
       ちょっと くどいかもな」

     ★ 板は 見出し → 説明 → 箇条書き…と 続く。1 行ずつ 話すと
       **同じことを 言い直す**（箇条書きの 3 行は だいたい 同じ話）。
     ★ 見出しで 区切り、その下の 行を ひとまとめにする。
       見出しが 無ければ 600 字ごとに 束ねる。
     ★ まとまりの 中の どの行に 線を 引くかは 番号で 指せるように 残す。 */
  function 段に束ねる(区切り) {
    var 段 = [], いま = null;
    var 新しく = function (x) {
      いま = { i: 段.length, 見出し: "", 行: [], 番号: [], 語ら: [], 重み: 0 };
      段.push(いま);
      return いま;
    };
    区切り.forEach(function (x) {
      var 見 = /^H[1-4]$/.test((x.el.tagName || "").toUpperCase());
      var 長い = いま && いま.行.join("").length > 600;
      if (!いま || 見 || 長い) 新しく();
      if (見 && !いま.見出し) いま.見出し = x.text;
      else いま.行.push(x.text);
      いま.番号.push(x.i);
      var v = 見どころ(x.el);
      いま.重み += v.重み;
      v.語ら.forEach(function (g) {
        if (いま.語ら.length < 8 && !いま.語ら.some(function (y) { return y.語 === g.語; })) いま.語ら.push(g);
      });
    });
    /* 中身の 無い 段は 落とす */
    return 段.filter(function (d) { return (d.見出し + d.行.join("")).trim(); })
      .map(function (d, i) {
        d.i = i;
        d.text = (d.見出し ? "■ " + d.見出し + "\n" : "") + d.行.join("\n");
        return d;
      });
  }

  /* ══ ★★ 見た目（CSS）を **自分で 入れる**（2026-08-19・実測で 踏んだ）
     呼ぶ側に 任せていたら、**誰も 入れていなかった**。
     すると .vqp-lay の position:absolute が 効かず、
     重ね板は **ただの 要素として 本文の 後ろに 流し込まれる**。
     線は 字の 場所ではなく **本文の 下の 何もない所**に 並ぶ
     （実測: 字が y=384 で 終わっているのに 線は 423 / 530 / 650）。
     .vqp-host の position:relative も 効かないので 座標の 基準も ずれる。
     ここで 入れれば、どこから 呼ばれても 必ず 効く。 */
  function 見た目を入れる(親) {
    var d2 = (親 && 親.ownerDocument) || doc;
    var 置き場 = d2;
    /* 影の DOM の 中なら **その中へ**入れる（外の CSS は 届かない）。 */
    try {
      var r = 親 && 親.getRootNode && 親.getRootNode();
      if (r && r.host) 置き場 = r;
    } catch (e) {}
    try {
      if (置き場.querySelector && 置き場.querySelector("style[data-vqp]")) return;
      var st2 = d2.createElement("style");
      st2.setAttribute("data-vqp", "1");
      st2.textContent = CSS;
      (置き場.head || 置き場).appendChild(st2);
    } catch (e) {}
  }

  function 作る(o) {
    o = o || {};
    var 中 = o.中身;                    /* 字が 入っている 要素（.vqmd / .vqn-b） */
    var 巻 = o.巻物 || 中;              /* 縦に 動く 入れ物 */
    if (!中) return null;
    見た目を入れる(中);

    /* 重ね板（線を 引く所）。**中身と 同じ 大きさ**にする。
       ★ position は **必ず** relative にする（2026-08-19）。
         「static のときだけ」にしていたが、CSS が 効かないと
         classList だけ 付いても relative に ならない。
         style で 直に 当てれば、どんな CSS でも 崩れない。 */
    中.classList.add("vqp-host");
    try { if (getComputedStyle(中).position === "static") 中.style.position = "relative"; } catch (e) {}
    var 面 = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    面.setAttribute("class", "vqp-lay");
    面.setAttribute("aria-hidden", "true");
    /* ★ 要のところは **style で 直に**（クラスだけだと 誰かの CSS に 負ける）。 */
    面.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:3;overflow:visible;";
    中.appendChild(面);

    var 区切り = 区切りを拾う(中);
    var いま = -1, 描く手 = null, 引いたもの = [], 番号カウンタ = 0;
    /* ══ 引いた線の **控え**（2026-08-20）════════════════════════════
       訴え「ボードを 自由に 縮小拡大できたりとかも いいかも」。
       字の 大きさを 変えると 字は 組み直されるが、**線は 組み直されない**
       （線は 引いた ときの 座標を そのまま 持っている）。
       だから 変えたら ここから **引き直す**。
       ★ 付箋・書き足した文は ふつうの 要素なので 一緒に 流れる。
         引き直すのは **座標を 持っているもの**（線と 番号の玉）だけ。 */
    var 台帳 = [], 座標もの = [];

    function 測り直す() {
      var w = 中.scrollWidth || 中.clientWidth || 1;
      var h = 中.scrollHeight || 中.clientHeight || 1;
      面.setAttribute("viewBox", "0 0 " + w + " " + h);
      面.setAttribute("width", w); 面.setAttribute("height", h);
      面.style.width = w + "px"; 面.style.height = h + "px";
    }
    測り直す();
    var 見張り = null, 直し待ち = null;
    try {
      見張り = new root.ResizeObserver(function () {
        測り直す();
        /* ★ 大きさが 変われば 字は 組み直される。線も 引き直さないと
           **前の 座標のまま 取り残される**（2026-08-20）。
           続けて 何度も 呼ばれるので 少し 待ってから 1 回だけ。 */
        if (直し待ち) clearTimeout(直し待ち);
        直し待ち = setTimeout(function () { 直し待ち = null; try { 引き直す(); } catch (e2) {} }, 180);
      });
      見張り.observe(中);
    } catch (e) {}

    /* 中身の 中での 位置（重ね板と 同じ 座標）。 */
    function 場所(el) {
      var a = el.getBoundingClientRect(), b = 中.getBoundingClientRect();
      return { x: a.left - b.left + 中.scrollLeft, y: a.top - b.top + 中.scrollTop,
               w: a.width, h: a.height };
    }
    /* 字の 1 行ずつの 場所（蛍光ペンを 行ごとに 引くため）。 */
    function 行たち(el) {
      var 出 = [];
      try {
        var r = doc.createRange(); r.selectNodeContents(el);
        var 箱 = r.getClientRects(), b = 中.getBoundingClientRect();
        for (var i = 0; i < 箱.length; i++) {
          var c = 箱[i];
          if (c.width < 2 || c.height < 2) continue;
          出.push({ x: c.left - b.left + 中.scrollLeft, y: c.top - b.top + 中.scrollTop,
                    w: c.width, h: c.height });
        }
      } catch (e) {}
      if (!出.length) 出.push(場所(el));
      return 出;
    }

    function 印(名, 中身) {
      var e = doc.createElementNS("http://www.w3.org/2000/svg", 名);
      for (var k in 中身) e.setAttribute(k, 中身[k]);
      面.appendChild(e); 引いたもの.push(e); 座標もの.push(e);
      return e;
    }
    /* すっと 現れる（急に 出さない）。 */
    var 引き直し中 = false;
    function 現す(e, ミリ秒) {
      /* 引き直しでは すっと 出さない（何度も 動くと ちらつく）。 */
      if (引き直し中) return;
      try {
        var L = e.getTotalLength ? e.getTotalLength() : 0;
        if (L) {
          e.style.strokeDasharray = L; e.style.strokeDashoffset = L;
          e.style.transition = "stroke-dashoffset " + (ミリ秒 || 500) + "ms ease";
          requestAnimationFrame(function () { e.style.strokeDashoffset = "0"; });
        } else {
          e.style.opacity = "0"; e.style.transition = "opacity " + (ミリ秒 || 300) + "ms ease";
          requestAnimationFrame(function () { e.style.opacity = "1"; });
        }
      } catch (x) {}
    }

    /* ── 線を 引く ──────────────────────────────────────────── */
    function 引く(種類, o2) {
      o2 = o2 || {};
      /* 引き直しの ためだけに 控える。__再 は 引き直しの ときの 目印。 */
      if (!o2.__再) 台帳.push({ 種類: 種類, o2: o2 });
      var 色 = 色を選ぶ(o2.color, 種類 === "marker" ? "塗" : "線");
      var 的 = o2.el || (Number.isFinite(o2.block) ? (区切り[o2.block] || {}).el : null)
             || (いま >= 0 ? (区切り[いま] || {}).el : null);
      if (種類 === "pen" && Array.isArray(o2.points) && o2.points.length > 1) {
        var d = "M" + o2.points.map(function (p) { return p[0] + " " + p[1]; }).join(" L");
        var e0 = 印("path", { d: d, fill: "none", stroke: 色, "stroke-width": o2.width || 3,
                              "stroke-linecap": "round", "stroke-linejoin": "round" });
        現す(e0, 700); return true;
      }
      if (!的) return false;

      if (種類 === "marker") {
        行たち(的).forEach(function (r, i) {
          var 高 = Math.min(r.h * 0.62, 20);
          var e = 印("rect", { x: r.x - 2, y: r.y + r.h - 高 - 1, width: r.w + 4, height: 高,
                               rx: 3, fill: 色, opacity: 0.42, class: "vqp-mk" });
          setTimeout(function () { 現す(e, 260); }, i * 70);
        });
        return true;
      }
      /* 番号つきの 下線（①②③…）。順番に 見せたいときに 使う。 */
      if (種類 === "number" || 種類 === "numbered") {
        var 番 = Number.isFinite(Number(o2.no)) ? Number(o2.no) : (++番号カウンタ);
        o2.no = 番;                       /* 引き直しても 番が ずれないように 焼き付ける */
        var 行1 = 行たち(的);
        行1.forEach(function (r, i) {
          var y1 = r.y + r.h - 1;
          var e5 = 印("line", { x1: r.x, y1: y1, x2: r.x + r.w, y2: y1,
                                stroke: 色, "stroke-width": o2.width || 2.2,
                                "stroke-linecap": "round" });
          setTimeout(function () { 現す(e5, 420); }, i * 80);
        });
        var r0 = 行1[0];
        var 玉 = doc.createElement("span");
        玉.className = "vqp-no";
        玉.textContent = String(番);
        /* ★ 玉は 真ん中で 置くので、そのままだと 左端の 見出し（x≒0）で
           **半分 板の外**へ 出る（2026-08-20・実測）。中へ 寄せる。 */
        玉.style.left = Math.max(10, r0.x - 2) + "px";
        玉.style.top = (r0.y + r0.h + 2) + "px";
        中.appendChild(玉); 引いたもの.push(玉); 座標もの.push(玉);
        return true;
      }
      /* かたまり ぜんぶの 背景を 塗る（見出しや 短い段落を 目立たせるとき）。
         字の 上ではなく **後ろ**に 敷くので、どんな色でも 字は 読める。 */
      if (種類 === "back" || 種類 === "背景") {
        var p3 = 場所(的);
        var 左3 = Math.max(1, p3.x - 8), 右3 = Math.min((中.scrollWidth || p3.x + p3.w) - 1, p3.x + p3.w + 8);
        var e6 = 印("rect", { x: 左3, y: Math.max(1, p3.y - 5), width: Math.max(4, 右3 - 左3), height: p3.h + 10,
                              rx: 8, fill: 色, opacity: 0.28, class: "vqp-mk" });
        現す(e6, 320);
        return true;
      }
      if (種類 === "wave") {
        行たち(的).forEach(function (r, i) {
          var y = r.y + r.h - 1, d = "M" + r.x + " " + y, x = r.x;
          var 幅 = 6, 高 = 3;
          while (x < r.x + r.w) {
            d += " q" + (幅 / 2) + " " + (-高) + " " + 幅 + " 0";
            d += " q" + (幅 / 2) + " " + 高 + " " + 幅 + " 0";
            x += 幅 * 2;
          }
          var e = 印("path", { d: d, fill: "none", stroke: 色, "stroke-width": o2.width || 2,
                               "stroke-linecap": "round" });
          setTimeout(function () { 現す(e, 500); }, i * 90);
        });
        return true;
      }
      if (種類 === "box") {
        var p = 場所(的);
        var 左2 = Math.max(1.5, p.x - 6), 右2 = Math.min((中.scrollWidth || p.x + p.w) - 1.5, p.x + p.w + 6);
        var e2 = 印("rect", { x: 左2, y: Math.max(1.5, p.y - 4), width: Math.max(6, 右2 - 左2),
                              height: p.h + 8, rx: 8,
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4 });
        現す(e2, 620); return true;
      }
      /* ══ 矢印（2026-08-20・訴え「矢印の位置が ちょっと 気になる」）══
         もとの 決め打ちが 悪かった。実測で 分かったこと:
           ① 的の **まんなか**（q.y + q.h/2）を 指していた。
              かたまりが 何行も あると、まんなかは **字と 字の すきま**。
              「1. 領域」のように 下に 説明が ぶら下がる かたまりでは、
              矢は 見出しでは なく 下の 行を 指す。
           ② 尾を いつも **左上 46px**に 置いていた。左端の 見出し
              （x≒0）では 尾が **板の 外**（x=-54）に はみ出す。
              overflow:visible なので 消えず、板の 縁に 貼り付いて 見える。
           ③ 矢じりが l-9 -3 / l-4 -8 の **決め打ち**。尾の 向きが
              変わっても 羽の 向きは 変わらないので、右から 指すと
              羽が 逆を 向く。
         直しかた:
           ・**1 行目の 高さ**を 指す（行たち の 先頭）。字の 横に 付く。
           ・左に 余地が あれば 左から、無ければ 右から、
             どちらも 無ければ 上（上も 詰まっていれば 下）から。
           ・尾は **必ず 板の中**へ 収める。
           ・矢じりは 尾→頭の **角度から 計算**する。 */
      if (種類 === "arrow") {
        var 行3 = 行たち(的), r2 = 行3[0] || 場所(的);
        var 板W = 中.scrollWidth || 中.clientWidth || 1;
        var 板H = 中.scrollHeight || 中.clientHeight || 1;
        var 矢長 = 42, すき = 9, 頭x, 頭y, 尾x, 尾y;
        var 中心y = r2.y + r2.h / 2;
        if (r2.x - すき - 矢長 >= 6) {                       /* 左から */
          頭x = r2.x - すき; 頭y = 中心y; 尾x = 頭x - 矢長; 尾y = 頭y - 15;
        } else if (r2.x + r2.w + すき + 矢長 <= 板W - 6) {   /* 右から */
          頭x = r2.x + r2.w + すき; 頭y = 中心y; 尾x = 頭x + 矢長; 尾y = 頭y - 15;
        } else if (r2.y - 34 >= 6) {                          /* 上から */
          頭x = r2.x + Math.min(30, r2.w * 0.35); 頭y = r2.y - 6;
          尾x = 頭x - 26; 尾y = 頭y - 26;
        } else {                                              /* 下から */
          頭x = r2.x + Math.min(30, r2.w * 0.35); 頭y = r2.y + r2.h + 6;
          尾x = 頭x - 26; 尾y = 頭y + 26;
        }
        尾x = Math.max(4, Math.min(板W - 4, 尾x));
        尾y = Math.max(4, Math.min(板H - 4, 尾y));
        頭x = Math.max(3, Math.min(板W - 3, 頭x));
        頭y = Math.max(3, Math.min(板H - 3, 頭y));
        var e3 = 印("path", { d: "M" + 尾x.toFixed(1) + " " + 尾y.toFixed(1)
                                 + " L" + 頭x.toFixed(1) + " " + 頭y.toFixed(1),
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4,
                              "stroke-linecap": "round" });
        現す(e3, 420);
        var 角 = Math.atan2(頭y - 尾y, 頭x - 尾x), 羽 = 10, 開 = 0.44;
        var 羽1x = 頭x - 羽 * Math.cos(角 - 開), 羽1y = 頭y - 羽 * Math.sin(角 - 開);
        var 羽2x = 頭x - 羽 * Math.cos(角 + 開), 羽2y = 頭y - 羽 * Math.sin(角 + 開);
        var e4 = 印("path", { d: "M" + 羽1x.toFixed(1) + " " + 羽1y.toFixed(1)
                                 + " L" + 頭x.toFixed(1) + " " + 頭y.toFixed(1)
                                 + " L" + 羽2x.toFixed(1) + " " + 羽2y.toFixed(1),
                              fill: "none", stroke: 色, "stroke-width": o2.width || 2.4,
                              "stroke-linecap": "round", "stroke-linejoin": "round" });
        setTimeout(function () { 現す(e4, 200); }, 400);
        return true;
      }
      return false;
    }

    /* ── 文字を 足す（言いながら 書き足す）───────────────────── */
    function 書く(文, o2) {
      o2 = o2 || {};
      var 的 = Number.isFinite(o2.block) ? (区切り[o2.block] || {}).el
             : (いま >= 0 ? (区切り[いま] || {}).el : null);
      var 箱 = doc.createElement("div");
      箱.className = "vqp-add";
      if (的 && 的.parentNode) 的.parentNode.insertBefore(箱, 的.nextSibling);
      else 中.appendChild(箱);
      引いたもの.push(箱);
      var 全 = String(文 || "");
      if (o2.instant) { 箱.textContent = 全; 測り直す(); return 箱; }
      /* 1 文字ずつ。**速すぎず 遅すぎず**（読める速さ）。 */
      var i = 0, 印棒 = doc.createElement("span");
      印棒.className = "vqp-cursor";
      箱.appendChild(印棒);
      var t = setInterval(function () {
        if (i >= 全.length) { clearInterval(t); try { 印棒.remove(); } catch (e) {} 測り直す(); return; }
        印棒.insertAdjacentText("beforebegin", 全.charAt(i++));
      }, Math.max(12, Math.min(60, o2.speed || 26)));
      引いたもの.push({ 止める: function () { clearInterval(t); } });
      return 箱;
    }

    /* ── いま話している所へ 動く ───────────────────────────── */
    function 進む(i) {
      if (!区切り.length) return null;
      i = Math.max(0, Math.min(区切り.length - 1, Number(i) || 0));
      if (いま >= 0 && 区切り[いま]) 区切り[いま].el.classList.remove("vqp-now");
      いま = i;
      var e = 区切り[i].el;
      e.classList.add("vqp-now");
      try {
        /* 巻物の 中で **真ん中あたり**へ。画面ごと 飛ばさない。 */
        var a = e.getBoundingClientRect(), b = 巻.getBoundingClientRect();
        var 先 = 巻.scrollTop + (a.top - b.top) - Math.max(24, b.height * 0.28);
        巻.scrollTo({ top: Math.max(0, 先), behavior: "smooth" });
      } catch (x) { try { e.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (y) {} }
      return 区切り[i];
    }

    /* ── 人が 指で 描く ──────────────────────────────────── */
    function 手描き(on, o2) {
      o2 = o2 || {};
      if (!on) {
        面.classList.remove("on");
        if (描く手) { 描く手(); 描く手 = null; }
        return false;
      }
      面.classList.add("on");
      var 引き中 = null, 点 = [];
      var 場 = function (ev) {
        var b = 面.getBoundingClientRect();
        return [Math.round(ev.clientX - b.left), Math.round(ev.clientY - b.top)];
      };
      var 始 = function (ev) {
        ev.preventDefault();
        点 = [場(ev)];
        引き中 = 印("path", { d: "M" + 点[0][0] + " " + 点[0][1], fill: "none",
                             stroke: o2.color || "#E0563C", "stroke-width": o2.width || 3,
                             "stroke-linecap": "round", "stroke-linejoin": "round" });
        try { 面.setPointerCapture(ev.pointerId); } catch (e) {}
      };
      var 動 = function (ev) {
        if (!引き中) return;
        ev.preventDefault();
        var p = 場(ev); 点.push(p);
        引き中.setAttribute("d", "M" + 点.map(function (q) { return q[0] + " " + q[1]; }).join(" L"));
      };
      var 終 = function () { 引き中 = null; };
      面.addEventListener("pointerdown", 始);
      面.addEventListener("pointermove", 動);
      面.addEventListener("pointerup", 終);
      面.addEventListener("pointercancel", 終);
      描く手 = function () {
        面.removeEventListener("pointerdown", 始);
        面.removeEventListener("pointermove", 動);
        面.removeEventListener("pointerup", 終);
        面.removeEventListener("pointercancel", 終);
      };
      return true;
    }

    /* ══ 付箋（2026-08-19・訴え）════════════════════════════════
       「すでに 作られている ボードに ない ことも、追加で 上書きで
         付箋なんかを ボードに 貼り付けて、わかりやすくしたり。
         （付箋にも マークダウン適用）」
       ★ 中身は **マークダウン**として 組む（VQMD が あれば）。
       ★ 元の 中身は 触らない。消せば きれいに 戻る。 */
    function 付箋(文, o2) {
      o2 = o2 || {};
      var 的 = Number.isFinite(Number(o2.block)) ? (区切り[Number(o2.block)] || {}).el
             : (いま >= 0 ? (区切り[いま] || {}).el : null);
      var 箱 = doc.createElement("div");
      箱.className = "vqp-tag" + (o2.color ? " " + String(o2.color) : "");
      var md = String(文 || "");
      try {
        if (root.VQMD && root.VQMD.render) 箱.innerHTML = root.VQMD.render(md);
        else 箱.textContent = md;
      } catch (e) { 箱.textContent = md; }
      if (的 && 的.parentNode) 的.parentNode.insertBefore(箱, 的.nextSibling);
      else 中.appendChild(箱);
      引いたもの.push(箱);
      測り直す();
      return 箱;
    }

    /* ══ 引き直す（2026-08-20）════════════════════════════════════
       字の 大きさ・板の 幅が 変わったら 呼ぶ。線だけ 引き直す。
       ★ 付箋と 書き足した文は **消さない**（ふつうの要素なので 流れる）。 */
    function 引き直す() {
      if (!台帳.length) { 測り直す(); return 0; }
      引き直し中 = true;
      座標もの.forEach(function (e) {
        try { e.remove(); } catch (x) {}
        var k = 引いたもの.indexOf(e); if (k >= 0) 引いたもの.splice(k, 1);
      });
      座標もの = [];
      測り直す();
      番号カウンタ = 0;
      var 控 = 台帳.slice();
      控.forEach(function (x) {
        var o3 = {}; for (var k in x.o2) o3[k] = x.o2[k];
        o3.__再 = true;
        try { 引く(x.種類, o3); } catch (e2) {}
      });
      引き直し中 = false;
      return 控.length;
    }

    function 消す() {
      番号カウンタ = 0;
      引いたもの.forEach(function (e) {
        try { if (e && e.止める) e.止める(); else if (e && e.remove) e.remove(); } catch (x) {}
      });
      引いたもの = []; 座標もの = []; 台帳 = [];
    }
    function 片づける() {
      消す(); 手描き(false);
      if (いま >= 0 && 区切り[いま]) 区切り[いま].el.classList.remove("vqp-now");
      いま = -1;
      try { if (直し待ち) { clearTimeout(直し待ち); 直し待ち = null; } } catch (e) {}
      try { if (見張り) 見張り.disconnect(); } catch (e) {}
      try { 面.remove(); } catch (e) {}
      中.classList.remove("vqp-host");
    }

    return {
      区切り: function () { return 区切り.map(function (x) { return { i: x.i, text: x.text }; }); },
      /* 意味の まとまり（見出しごと）。解説は これを 1 つずつ 話す。 */
      段: function () {
        return 段に束ねる(区切り).map(function (d) {
          return { i: d.i, 見出し: d.見出し, text: d.text, 番号: d.番号.slice(),
                   重み: d.重み, 見どころ: d.語ら.slice() };
        });
      },
      数: function () { return 区切り.length; },
      いま: function () { return いま; },
      進む: 進む, 引く: 引く, 書く: 書く, 付箋: 付箋, 消す: 消す, 手描き: 手描き,
      測り直す: 測り直す, 引き直す: 引き直す, 片づける: 片づける
    };
  }

  VQB.play = { 作る: 作る, CSS: CSS, 区切りを拾う: 区切りを拾う,
               段に束ねる: 段に束ねる, 見どころ: 見どころ };
})(typeof globalThis !== "undefined" ? globalThis : this);
