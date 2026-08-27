/* ══════════════════════════════════════════════════════════════════════
   紙面（用紙・向き・余白）と、印刷 / PDF

   考え方:
     ・画面では **1 枚の白い紙**として出す。幅も余白も本物の寸法（mm）で持つ。
       途切れ目は線で見せるだけにして、書いている途中で入力欄が分かれないようにする。
       （紙ごとに入力欄を分けると、行をまたいだ選択や貼り付けが壊れる）
     ・印刷と PDF は **別の窓を作り、そこで実際に紙へ割り付ける**。
       割り付けを自分でやるのは、ページ番号とヘッダー・フッターを
       1 枚ごとに正しく出すため。ブラウザの @page だけでは番号を置けない。

   ここが持つのはデータと組み立てだけ。画面の操作は ui-docs 側。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});

  /* 1mm を画面の何点として扱うか。CSS の決まりで 1in = 96px、1in = 25.4mm。 */
  var MM = 96 / 25.4;

  /* 用紙。w/h は縦向きのときの寸法（mm）。 */
  var SIZES = {
    a3:     { label: "A3",        w: 297,   h: 420 },
    b4:     { label: "B4（JIS）", w: 257,   h: 364 },
    a4:     { label: "A4",        w: 210,   h: 297 },
    b5:     { label: "B5（JIS）", w: 182,   h: 257 },
    a5:     { label: "A5",        w: 148,   h: 210 },
    letter: { label: "レター",    w: 215.9, h: 279.4 },
    legal:  { label: "リーガル",  w: 215.9, h: 355.6 },
    hagaki: { label: "はがき",    w: 100,   h: 148 },
    custom: { label: "自由な大きさ", w: 210, h: 297 }
  };
  var SIZE_ORDER = ["a4", "b5", "a5", "a3", "b4", "letter", "legal", "hagaki", "custom"];

  /* 余白のよく使う組み合わせ（mm）。上右下左。 */
  var MARGINS = {
    normal:  { label: "標準",   t: 25.4, r: 25.4, b: 25.4, l: 25.4 },
    narrow:  { label: "狭い",   t: 12.7, r: 12.7, b: 12.7, l: 12.7 },
    moderate:{ label: "やや狭い", t: 25.4, r: 19,   b: 25.4, l: 19 },
    wide:    { label: "広い",   t: 25.4, r: 50.8, b: 25.4, l: 50.8 },
    jp:      { label: "日本語文書", t: 30, r: 25, b: 30, l: 25 },
    custom:  { label: "自由",   t: 25.4, r: 25.4, b: 25.4, l: 25.4 }
  };
  var MARGIN_ORDER = ["normal", "moderate", "narrow", "wide", "jp", "custom"];

  /* 既定。新しい文書はここから始まる。 */
  function defaults() {
    return {
      mode: "paper",            /* paper=紙として出す / flow=画面いっぱい */
      size: "a4",
      orient: "portrait",       /* portrait=縦 / landscape=横 */
      customW: 210, customH: 297,
      marginPreset: "normal",
      margin: { t: 25.4, r: 25.4, b: 25.4, l: 25.4 },
      header: "", footer: "",
      pageNumber: false,
      pageNumberFormat: "n",    /* n=1 / n-of-m=1 / 3 ページ */
      firstPageNumber: 1,
      background: "#ffffff",
      /* 「紙にしない」を **利用者が自分で選んだか**。
         これが false のうちは、どこで作られた文書でも紙にする。
         ひな形・取り込み・昔の保存が mode:"flow" を持っていても、
         それは選ばれた結果ではないため。 */
      modeChosen: false,
      /* 昔の形（width だけ持っていた頃）から来たときの逃げ道 */
      width: 0
    };
  }

  /* 昔の形（{mode,width,margin:数値,...}）でも壊れないように整える。 */
  function normalize(pg) {
    var d = defaults();
    if (!pg || typeof pg !== "object") return d;

    /* ── 昔の形からの引き上げ ──────────────────────────────
       用紙という考え方が無かった頃の文書は
         { mode:"flow", width:800, margin:64, ... }
       で保存されている。size を持っていないのが目印。
       この形をそのまま読むと mode:"flow" が残り、**紙にならない**。
       既に作ってある文書・ひな形・取り込んだ文書がすべてそうなので、
       ここで A4 の縦へ引き上げる。ヘッダー等は書いたものを残す。 */
    var isOld = pg.size === undefined;
    if (isOld) {
      var keep = { header: pg.header || "", footer: pg.footer || "",
        pageNumber: !!pg.pageNumber };
      var up = defaults();
      up.header = keep.header; up.footer = keep.footer; up.pageNumber = keep.pageNumber;
      return up;
    }

    var out = d;
    Object.keys(d).forEach(function (k) { if (pg[k] !== undefined) out[k] = pg[k]; });
    if (!SIZES[out.size]) out.size = "a4";
    if (out.orient !== "landscape") out.orient = "portrait";
    /* 昔は margin が 1 つの数値（px）だった。mm へ寄せる。 */
    if (typeof pg.margin === "number") {
      var mm = Math.round((pg.margin / MM) * 10) / 10;
      out.margin = { t: mm, r: mm, b: mm, l: mm };
      out.marginPreset = "custom";
    } else if (pg.margin && typeof pg.margin === "object") {
      out.margin = { t: num(pg.margin.t, 25.4), r: num(pg.margin.r, 25.4),
        b: num(pg.margin.b, 25.4), l: num(pg.margin.l, 25.4) };
    }
    if (out.mode !== "flow") out.mode = "paper";
    /* 自分で選んでいないのに flow になっているものは、紙へ戻す。 */
    if (out.mode === "flow" && !out.modeChosen) out.mode = "paper";
    out.customW = clamp(num(out.customW, 210), 50, 1000);
    out.customH = clamp(num(out.customH, 297), 50, 1000);
    out.firstPageNumber = Math.max(0, Math.round(num(out.firstPageNumber, 1)));
    return out;
  }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* 紙の寸法（mm）。向きを当てたあとの値。 */
  function sizeMm(pg) {
    pg = normalize(pg);
    var s = SIZES[pg.size] || SIZES.a4;
    var w = pg.size === "custom" ? pg.customW : s.w;
    var h = pg.size === "custom" ? pg.customH : s.h;
    if (pg.orient === "landscape") { var t = w; w = h; h = t; }
    return { w: w, h: h };
  }
  /* 画面に出すときの寸法（px）。 */
  function sizePx(pg) {
    var s = sizeMm(pg);
    return { w: Math.round(s.w * MM), h: Math.round(s.h * MM) };
  }
  /* 文字が入る範囲（mm）。余白を引いたもの。 */
  function innerMm(pg) {
    pg = normalize(pg);
    var s = sizeMm(pg);
    return {
      w: Math.max(20, s.w - pg.margin.l - pg.margin.r),
      h: Math.max(20, s.h - pg.margin.t - pg.margin.b)
    };
  }
  function label(pg) {
    pg = normalize(pg);
    var s = SIZES[pg.size] || SIZES.a4;
    var nm = pg.size === "custom" ? (pg.customW + "×" + pg.customH + "mm") : s.label;
    return nm + "・" + (pg.orient === "landscape" ? "横" : "縦");
  }

  /* 画面の紙に当てる style。paint() がそのまま差し込む。 */
  function sheetStyle(pg) {
    pg = normalize(pg);
    var s = sizePx(pg);
    var m = pg.margin;
    return "--pw:" + s.w + "px;--ph:" + s.h + "px;"
      + "--pmt:" + (m.t * MM).toFixed(1) + "px;--pmr:" + (m.r * MM).toFixed(1) + "px;"
      + "--pmb:" + (m.b * MM).toFixed(1) + "px;--pml:" + (m.l * MM).toFixed(1) + "px;"
      + "--pbg:" + (pg.background || "#ffffff") + ";";
  }
  /* 何ページになるか（画面での目安）。文字が入る高さで割る。 */
  function pageCount(contentPx, pg) {
    var ih = innerMm(pg).h * MM;
    if (ih <= 0) return 1;
    return Math.max(1, Math.ceil(contentPx / ih));
  }

  /* ══ 印刷 / PDF ═══════════════════════════════════════════════════
     別の窓に、紙 1 枚ぶんの箱を並べた文書を作る。
     中身の割り付けはその窓の中で測ってから行う（ここでは高さが分からないため）。 */
  function printDoc(o) {
    o = o || {};
    var pg = normalize(o.page);
    var s = sizeMm(pg), inn = innerMm(pg), m = pg.margin;
    var title = String(o.title || "文書");
    var fontLinks = (o.fontCssHrefs || []).map(function (h) {
      return '<link rel="stylesheet" href="' + esc(h) + '">';
    }).join("");

    var css = [
      "@page{size:" + s.w + "mm " + s.h + "mm;margin:0}",
      "*{box-sizing:border-box}",
      "html,body{margin:0;padding:0;background:#f1f5f9}",
      "body{font-family:" + (o.fontFamily || "'Noto Sans JP','Hiragino Sans',sans-serif")
        + ";color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
      /* 1 枚ぶんの箱 */
      ".pg{width:" + s.w + "mm;height:" + s.h + "mm;background:" + (pg.background || "#fff")
        + ";position:relative;overflow:hidden;margin:0 auto 10mm;box-shadow:0 1px 6px rgba(15,23,42,.18)}",
      ".pg__in{position:absolute;left:" + m.l + "mm;top:" + m.t + "mm;"
        + "width:" + inn.w + "mm;height:" + inn.h + "mm;overflow:hidden;"
        + "line-height:" + (o.lineHeight || 1.9) + ";font-size:" + (o.fontSize || 10.5) + "pt}",
      ".pg__hd,.pg__ft{position:absolute;left:" + m.l + "mm;width:" + inn.w + "mm;"
        + "font-size:9pt;color:#64748b;display:flex;align-items:center;gap:8px}",
      ".pg__hd{top:" + Math.max(4, m.t / 2 - 3) + "mm}",
      ".pg__ft{bottom:" + Math.max(4, m.b / 2 - 3) + "mm}",
      ".pg__ft .no{margin-left:auto}",
      ".pg__hd .no{margin-left:auto}",
      /* 中身 */
      "h1{font-size:20pt;margin:0 0 8pt}h2{font-size:15pt;margin:12pt 0 6pt}",
      "h3{font-size:12.5pt;margin:10pt 0 5pt}h4{font-size:11pt;margin:9pt 0 4pt}",
      "p{margin:0 0 6pt}ul,ol{margin:0 0 6pt 1.4em;padding:0}li{margin:0 0 3pt}",
      "table{border-collapse:collapse;width:100%;margin:6pt 0}",
      "td,th{border:1px solid #cbd5e1;padding:4pt 6pt;font-size:9.5pt}th{background:#f1f5f9}",
      "blockquote{border-left:3px solid #cbd5e1;padding-left:10pt;color:#475569;margin:6pt 0}",
      "pre{background:#f1f5f9;padding:8pt;border-radius:4pt;white-space:pre-wrap;font-size:9pt}",
      ".callout{background:#eef2ff;padding:8pt 10pt;border-radius:6pt;margin:6pt 0}",
      "img{max-width:100%}figure{margin:6pt 0}figcaption{font-size:8.5pt;color:#64748b}",
      "hr{border:0;border-top:1px solid #cbd5e1;margin:8pt 0}",
      ".brk{break-after:page}",
      /* 印刷のときは影と隙間を消す（画面で見たときだけ紙らしく見せる） */
      "@media print{html,body{background:#fff}.pg{margin:0;box-shadow:none}"
        + ".pg+.pg{break-before:page}.bar{display:none}}",
      /* 上の操作帯（画面で開いたときだけ） */
      ".bar{position:sticky;top:0;z-index:9;display:flex;gap:8px;align-items:center;"
        + "padding:10px 14px;background:#fff;border-bottom:1px solid #e2e8f0;font-size:14px}",
      ".bar button{font:inherit;border:1px solid #cbd5e1;background:#fff;border-radius:8px;"
        + "padding:7px 14px;cursor:pointer}",
      ".bar button.pri{background:#2b70ef;border-color:#2b70ef;color:#fff}",
      ".bar .sp{margin-left:auto;color:#64748b;font-size:12px}"
    ].join("");

    /* 窓の中で走らせる割り付け。
       中身を上から順に 1 枚ぶんの箱へ詰め、はみ出したら次の紙を作る。
       表や画像のように途中で切りたくないものは、まるごと次の紙へ送る。 */
    var script = [
      "(function(){",
      "var src=document.getElementById('src');",
      "var out=document.getElementById('out');",
      "var W=" + JSON.stringify({
        header: pg.header || "", footer: pg.footer || "",
        num: !!pg.pageNumber, fmt: pg.pageNumberFormat || "n",
        first: pg.firstPageNumber, title: title
      }) + ";",
      "function mkPage(){",
      "  var p=document.createElement('div');p.className='pg';",
      "  var hd=document.createElement('div');hd.className='pg__hd';",
      "  var ft=document.createElement('div');ft.className='pg__ft';",
      "  var inn=document.createElement('div');inn.className='pg__in';",
      "  hd.textContent=W.header||'';ft.textContent=W.footer||'';",
      "  p.appendChild(hd);p.appendChild(inn);p.appendChild(ft);out.appendChild(p);",
      "  return {el:p,in:inn,hd:hd,ft:ft};",
      "}",
      "var pages=[],cur=mkPage();pages.push(cur);",
      "function full(){return cur.in.scrollHeight>cur.in.clientHeight+1;}",
      "var nodes=Array.prototype.slice.call(src.childNodes);",
      "for(var i=0;i<nodes.length;i++){",
      "  var n=nodes[i];",
      "  if(n.nodeType===1&&n.classList&&n.classList.contains('brk')){",
      "    cur=mkPage();pages.push(cur);continue;}",
      "  cur.in.appendChild(n);",
      "  if(full()){",
      /* まず 1 つ丸ごと次の紙へ送ってみる */
      "    cur.in.removeChild(n);",
      "    if(!cur.in.childNodes.length){cur.in.appendChild(n);continue;}",  /* 1 個で入らないなら諦めてそのまま */
      "    cur=mkPage();pages.push(cur);cur.in.appendChild(n);",
      /* それでも入らないなら、段落だけは行で割る */
      "    if(full()&&n.nodeType===1&&/^(P|LI|DIV)$/.test(n.tagName)){",
      "      var words=(n.textContent||'').split(/(\\s+)/);var keep='';var rest='';",
      "      var probe=n.cloneNode(false);cur.in.replaceChild(probe,n);",
      "      for(var w=0;w<words.length;w++){",
      "        probe.textContent=keep+words[w];",
      "        if(cur.in.scrollHeight>cur.in.clientHeight+1){rest=words.slice(w).join('');break;}",
      "        keep+=words[w];}",
      "      probe.textContent=keep;",
      "      if(rest){var nx=n.cloneNode(false);nx.textContent=rest;",
      "        nodes.splice(i+1,0,nx);}",
      "    }",
      "  }",
      "}",
      "src.remove();",
      /* ページ番号を入れる */
      "if(W.num){",
      "  for(var k=0;k<pages.length;k++){",
      "    var no=W.first+k;",
      "    var t=(W.fmt==='n-of-m')?(no+' / '+(W.first+pages.length-1)):String(no);",
      "    var sp=document.createElement('span');sp.className='no';sp.textContent=t;",
      "    pages[k].ft.appendChild(sp);}",
      "}",
      "var st=document.getElementById('cnt');",
      "if(st)st.textContent=pages.length+' ページ';",
      "window.__vqPages=pages.length;",
      "window.__vqReady=true;",
      "if(location.hash==='#print')setTimeout(function(){window.print();},350);",
      "})();"
    ].join("\n");

    return "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
      + "<title>" + esc(title) + "</title>"
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + fontLinks
      + "<style>" + css + "</style></head><body>"
      + '<div class="bar">'
      + '<button type="button" class="pri" onclick="window.print()">印刷 / PDF で保存</button>'
      + '<button type="button" onclick="window.close()">閉じる</button>'
      + '<span class="sp">' + esc(label(pg)) + '・<span id="cnt">計算中…</span>'
      + "／PDF にするには、印刷の宛先で「PDF に保存」を選んでください</span></div>"
      + '<div id="out"></div>'
      + '<div id="src" style="position:absolute;left:-99999px;top:0;width:' + inn.w + 'mm;'
      + "line-height:" + (o.lineHeight || 1.9) + ";font-size:" + (o.fontSize || 10.5) + 'pt">'
      + (o.bodyHtml || "") + "</div>"
      + "<script>" + script + "<\/script></body></html>";
  }

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  WP.paper = {
    MM: MM, SIZES: SIZES, SIZE_ORDER: SIZE_ORDER,
    MARGINS: MARGINS, MARGIN_ORDER: MARGIN_ORDER,
    defaults: defaults, normalize: normalize,
    sizeMm: sizeMm, sizePx: sizePx, innerMm: innerMm,
    label: label, sheetStyle: sheetStyle, pageCount: pageCount,
    printDoc: printDoc
  };
})(typeof window !== "undefined" ? window : globalThis);
