/* ══════════════════════════════════════════════════════════════════════════
   vq-write — 文章添削（校正モード）／文章を 書く（2026-08-31・訴え）

   訴え:
     ・「どんな風に 仕上げるか、なども プロンプトで 指示したり、
        その プロンプト入力ボックスに 資料を 添付すると、そこの ファイルから
        文章を 読み取って、そこから 必要事項の 記入欄の 事項なども 含めて、
        文章を 校正、または 構成する だけでなく、生成する 文章を 作って ほしい」
     ・「AI らしい 文章を 作るのは やめて ほしい。
        ちゃんと 抽象すぎず、具体的に 書いて ほしい」

   ★ 中身は サーバ（/api/ai/write）が 決める。ここは 見せるだけ。
     Live（無制限の 枠）を まず 通る。
   ★ **作り話を 隠さない。** サーバが 「元の 文に 無い 数」を 見つけたら、
     ここで 赤い 注意として 出す。黙って いると そのまま 提出される。
   ★ vq2-app（91,400 行）には 足さない。自分の ファイル・自分の 指紋
     （vq-make.js / vq-call.js と 同じ 作法）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqWriteInstalled) return;
  window.__vqWriteInstalled = true;

  var doc = document;
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function apiBase() {
    try { if (window.VQ2 && window.VQ2.apiBase) return window.VQ2.apiBase(); } catch (e) {}
    try {
      var h = location.hostname;
      if (h === "127.0.0.1" || h === "localhost") return location.origin;
    } catch (e) {}
    return "https://www.vocabuquiz.app";
  }
  function token() {
    try { return localStorage.getItem("app.auth.token.v1") || ""; } catch (e) { return ""; }
  }

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    spark: '<path ' + P + ' d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    file: '<path ' + P + ' d="M6 3h8l4 4v14H6z"/><path ' + P + ' d="M14 3v4h4"/>',
    copy: '<path ' + P + ' d="M9 9h11v11H9z"/><path ' + P + ' d="M5 15V4h11"/>',
    undo: '<path ' + P + ' d="M4 9h11a4 4 0 010 8h-6"/><path ' + P + ' d="M8 5L4 9l4 4"/>',
    down: '<path ' + P + ' d="M6 9l6 6 6-6"/>',
    warn: '<path ' + P + ' d="M12 4l9 16H3z"/><path ' + P + ' d="M12 10v4M12 17v.5"/>',
    help: '<circle ' + P + ' cx="12" cy="12" r="9"/>'
      + '<path ' + P + ' d="M9.6 9.2a2.5 2.5 0 1 1 4 2.3c-.9.6-1.6 1-1.6 2M12 17h.01"/>'
  };
  function svg(n, c) {
    return '<svg viewBox="0 0 24 24" class="' + (c || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483102;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836);background:var(--vq-bg,#FCFBFE)}",
    ":host([data-open='1']){display:block;overflow:auto}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    "textarea,input{font:inherit;color:inherit}",
    ".i{width:18px;height:18px;flex:0 0 auto}",
    ".wrap{max-width:1560px;margin:0 auto;padding:20px 22px 40px}",
    /* 見出し */
    ".hd{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px;flex-wrap:wrap}",
    ".ttl{font-size:22px;font-weight:700;display:flex;align-items:center;gap:8px}",
    ".beta{font-size:11px;font-weight:650;padding:2px 7px;border-radius:999px;",
      "background:var(--vq-primary-subtle,#F4F2FB);color:var(--vq-primary,#756DB3)}",
    ".sub{font-size:12.5px;color:var(--vq-text-muted,#7A7589);margin-top:3px}",
    ".sp{flex:1 1 auto}",
    ".hd-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;",
      "border:1px solid var(--vq-border,#D7D2E4);border-radius:10px;font-size:13px;",
      "background:var(--vq-surface,#fff)}",
    ".dot{width:8px;height:8px;border-radius:50%;background:#3BA55D;flex:0 0 auto}",
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;",
      "padding:0 15px;border-radius:11px;font-size:13.5px;font-weight:600;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".btn:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".btn.pri{background:var(--vq-primary,#756DB3);color:#fff;border-color:transparent}",
    ".btn.pri:hover{filter:brightness(1.06)}",
    ".btn[disabled]{opacity:.5;cursor:default}",
    /* 3 列 */
    ".cols{display:grid;grid-template-columns:1fr 1fr 340px;gap:16px;align-items:start}",
    "@media (max-width:1180px){.cols{grid-template-columns:1fr 1fr}}",
    "@media (max-width:820px){.cols{grid-template-columns:1fr}}",
    ".card{background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#D7D2E4);",
      "border-radius:14px;padding:14px}",
    ".card+.card{margin-top:14px}",
    ".ch{display:flex;align-items:center;gap:8px;margin-bottom:10px}",
    ".ch b{font-size:14px}",
    ".ch .sp{flex:1}",
    /* タブ */
    ".tabs{display:flex;gap:2px;margin-bottom:12px;border-bottom:1px solid var(--vq-border,#D7D2E4)}",
    ".tab{height:38px;padding:0 14px;font-size:13.5px;font-weight:600;",
      "color:var(--vq-text-muted,#7A7589);border-bottom:2px solid transparent;margin-bottom:-1px}",
    ".tab[aria-selected='true']{color:var(--vq-primary,#756DB3);border-bottom-color:var(--vq-primary,#756DB3)}",
    /* 入力 */
    ".ta{width:100%;min-height:230px;padding:12px;border:1px solid var(--vq-border,#D7D2E4);",
      "border-radius:11px;font-size:14px;line-height:1.9;resize:vertical;",
      "background:var(--vq-surface,#fff)}",
    ".ta:focus{outline:2px solid var(--vq-primary,#756DB3);outline-offset:1px}",
    ".ta.sm{min-height:76px;line-height:1.7}",
    ".lb{display:block;font-size:11.5px;font-weight:650;color:var(--vq-text-muted,#7A7589);margin:12px 0 5px}",
    ".foot{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}",
    ".cnt{font-size:12px;color:var(--vq-text-muted,#7A7589)}",
    /* 差分 */
    ".diff{font-size:14px;line-height:2;white-space:pre-wrap;word-break:break-word;",
      "max-height:520px;overflow:auto}",
    ".del{color:#C0392B;text-decoration:line-through;text-decoration-thickness:1px}",
    ".add{color:#1E7A46;font-weight:600}",
    ".legend{display:flex;gap:8px;font-size:11.5px}",
    ".legend span{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;",
      "border:1px solid var(--vq-border,#D7D2E4)}",
    /* 右 */
    ".gr{display:flex;align-items:center;gap:14px}",
    ".gr-b{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;",
      "font-size:28px;font-weight:750;flex:0 0 auto;",
      "border:3px solid var(--vq-primary,#756DB3);color:var(--vq-primary,#756DB3)}",
    ".sec-t{font-size:12.5px;font-weight:700;margin:12px 0 6px;display:flex;align-items:center;gap:6px}",
    ".ul{list-style:none;display:flex;flex-direction:column;gap:5px}",
    ".ul li{font-size:12.5px;line-height:1.75;padding-left:13px;position:relative;color:var(--vq-text,#2B2836)}",
    /* ★ 注意の 箱の 中では **色を 継ぐ**（2026-08-31 実測）。
       --vq-text は 暗い 見た目では 白に 近く、薄い 緑の 箱の 上で 消えて いた。 */
    ".warn .ul li{color:inherit}",
    ".warn b{font-weight:700}",
    ".ul li:before{content:'・';position:absolute;left:0;color:var(--vq-text-muted,#7A7589)}",
    ".rw{font-size:12.5px;line-height:1.8}",
    ".rw i{font-style:normal;color:var(--vq-text-muted,#7A7589)}",
    ".acc{border-top:1px solid var(--vq-border,#D7D2E4)}",
    ".acc button{width:100%;display:flex;align-items:center;gap:8px;height:42px;font-size:13px;font-weight:600;text-align:left}",
    ".acc .bd{font-size:12.5px;line-height:1.9;padding:0 0 12px;color:var(--vq-text-muted,#5A5568)}",
    ".qs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}",
    ".q{font-size:12px;padding:6px 11px;border-radius:999px;border:1px solid var(--vq-border,#D7D2E4);",
      "background:var(--vq-surface,#fff);text-align:left}",
    ".q:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    /* 注意 */
    ".warn{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:11px;",
      "background:#FDF3F2;border:1px solid #F0C9C4;color:#8C2F26;font-size:12.5px;line-height:1.8;margin-top:10px}",
    ".ok{background:#F1F9F4;border-color:#C6E4D2;color:#1E5C39}",
    ".ph{background:#FFF8E8;border-color:#F2DFAE;color:#7A5A12}",
    ".err{padding:10px 12px;border-radius:11px;background:#FDF3F2;border:1px solid #F0C9C4;",
      "color:#8C2F26;font-size:13px;margin-top:10px}",
    ".files{display:flex;flex-direction:column;gap:6px;margin-top:8px}",
    ".file{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:7px 10px;",
      "border:1px solid var(--vq-border,#D7D2E4);border-radius:10px}",
    ".sk{height:13px;border-radius:6px;background:var(--vq-border,#D7D2E4);opacity:.5;margin:7px 0}",
    "@keyframes bl{0%,100%{opacity:.35}50%{opacity:.7}}",
    ".sk{animation:bl 1.4s ease-in-out infinite}"
  ].join("");

  var host = null, root = null;
  var st = {
    開: false, 面: "text", 忙: false, err: "",
    文: "", 指示: "", 種類: "", 字数: 0,
    資料: [], 結果: null, 開いた: {}, 元表示: false
  };

  /* ── 差分（語ごと。日本語は 文字ごとに 割る）───────────────────
     ★ 外の 部品を 借りない（束を 増やさない）。
       素直な LCS。数百字なら 一瞬で 終わる。 */
  function 割る(s) { return String(s || "").split(/(\s+|[、。！？])/).filter(function (x) { return x !== ""; }); }
  function 差分(a0, b0) {
    var a = 割る(a0), b = 割る(b0);
    var n = a.length, m = b.length;
    /* 大きすぎるときは 中を 諦める（画面が 止まる ほうが 困る）。 */
    if (n * m > 900000) return [{ t: "del", v: a0 }, { t: "add", v: b0 }];
    var d = [];
    for (var i = 0; i <= n; i++) { d.push(new Uint32Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
      }
    }
    var out = []; i = 0; j = 0;
    function 足す(t, v) {
      if (out.length && out[out.length - 1].t === t) out[out.length - 1].v += v;
      else out.push({ t: t, v: v });
    }
    while (i < n && j < m) {
      if (a[i] === b[j]) { 足す("same", a[i]); i++; j++; }
      else if (d[i + 1][j] >= d[i][j + 1]) { 足す("del", a[i]); i++; }
      else { 足す("add", b[j]); j++; }
    }
    while (i < n) { 足す("del", a[i]); i++; }
    while (j < m) { 足す("add", b[j]); j++; }
    return out;
  }

  /* ── 器 ──────────────────────────────────────────────────── */
  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqWrite";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var box = doc.createElement("div"); box.setAttribute("data-box", ""); root.appendChild(box);
    doc.body.appendChild(host);
    つなぐ();
  }
  function 開く() { 建てる(); st.開 = true; host.setAttribute("data-open", "1"); 描く(); }
  function 閉じる() { st.開 = false; if (host) host.removeAttribute("data-open"); }

  /* ── 描く ──────────────────────────────────────────────── */
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    box.innerHTML = '<div class="wrap">' + 見出し() + '<div class="cols">'
      + '<div>' + 入力() + "</div>"
      + '<div>' + 結果の差分() + "</div>"
      + '<div>' + 右() + "</div>"
      + "</div>" + 下() + "</div>";
  }

  function 見出し() {
    return '<div class="hd"><div>'
      + '<div class="ttl">文章添削（校正モード）<span class="beta">Beta</span></div>'
      + '<div class="sub">文章を より よく する ために、自然さ・論理性・表現力の 観点から 添削します。</div>'
      + "</div><div class=\"sp\"></div><div class=\"hd-r\">"
      /* ★ **中で 使って いる 技術の 名前は 出さない**（2026-08-31・訴え）。
         Lumi の 人がらにも 「Gemini や Google の 名前は 出しません」と
         書いて ある のに、この 画面だけ 出て いた。 */
      + '<span class="chip"><span class="dot"></span>Lumi AI（無制限）</span>'
      + '<button class="btn" data-a="export"' + (st.結果 ? "" : " disabled") + ">"
      + svg("copy") + "結果を 書き出す</button>"
      /* ★ **この 画面の ヘルプ**（2026-09-01）。困った その 場から 開く。 */
      + '<button class="btn" data-a="help" aria-label="この 画面の ヘルプ" title="この 画面の ヘルプ">'
      + svg("help") + "</button>"
      + '<button class="btn" data-a="close" aria-label="閉じる">' + svg("x") + "</button>"
      + "</div></div>";
  }

  function 入力() {
    var 生 = st.面 === "file";
    var h = '<div class="card">'
      + '<div class="tabs" role="tablist">'
      + '<button class="tab" role="tab" aria-selected="' + (!生) + '" data-a="tab" data-v="text">文章を 入力</button>'
      + '<button class="tab" role="tab" aria-selected="' + (生) + '" data-a="tab" data-v="file">資料から 書く</button>'
      + "</div>";
    if (!生) {
      h += '<label class="lb">あなたの 文章</label>'
        + '<textarea class="ta" data-f="text" placeholder="ここに 文章を 貼り付けます。">' + esc(st.文) + "</textarea>";
    } else {
      h += '<label class="lb">資料（PDF・画像・テキスト）</label>'
        + '<button class="btn" data-a="pick">' + svg("file") + "ファイルを 選ぶ</button>"
        + '<div class="files">'
        + st.資料.map(function (f, i) {
            return '<div class="file">' + svg("file") + "<span>" + esc(f.name) + "</span>"
              + '<span class="sp" style="flex:1"></span>'
              + '<button class="btn" style="height:28px;padding:0 10px" data-a="del-file" data-i="' + i + '">外す</button></div>';
          }).join("")
        + "</div>"
        + '<label class="lb">下書き（あれば。無くても かまいません）</label>'
        + '<textarea class="ta sm" data-f="text" placeholder="下書きが あれば ここへ。">' + esc(st.文) + "</textarea>";
    }
    h += '<label class="lb">どんな風に 仕上げますか（指示）</label>'
      + '<textarea class="ta sm" data-f="instruction" placeholder="例: 志望理由書として。'
      + '体験が 具体的に 伝わるように。ですます調で。">' + esc(st.指示) + "</textarea>"
      + '<div class="foot">'
      + '<span class="cnt">文章の 種類</span>'
      + '<input class="btn" style="width:150px;padding:0 10px" data-f="kind" placeholder="志望理由書" value="' + esc(st.種類) + '" />'
      + '<span class="cnt">字数</span>'
      + '<input class="btn" style="width:92px;padding:0 10px" data-f="maxChars" type="number" min="0" max="4000" '
      + 'placeholder="400" value="' + (st.字数 || "") + '" />'
      + "</div>"
      + '<div class="foot"><span class="cnt">いまの 文字数：' + 数(st.文) + " 文字</span>"
      + '<span class="sp" style="flex:1"></span>'
      + '<button class="btn pri" data-a="run"' + (st.忙 ? " disabled" : "") + ">"
      + svg("spark") + (st.忙 ? "作って います…" : (生 ? "資料から 書く" : "添削を 実行する")) + "</button></div>";
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += "</div>";
    return h;
  }
  function 数(t) { return String(t || "").replace(/\s/g, "").length; }

  function 結果の差分() {
    var h = '<div class="card"><div class="ch"><b>差分修正案（Diff）</b><span class="sp"></span>'
      + '<span class="legend"><span class="del">− 削除</span><span class="add">＋ 追加</span></span></div>';
    if (st.忙) return h + '<div class="sk"></div><div class="sk"></div><div class="sk"></div>'
      + '<div class="sk" style="width:60%"></div></div>';
    var r = st.結果;
    if (!r) {
      return h + '<p class="cnt" style="line-height:2">左に 文章を 入れて「添削を 実行する」を 押すと、'
        + "どこを どう 直したかが ここに 出ます。<br>資料から 書く ときは、資料の 記入欄も 読み取ります。</p></div>";
    }
    if (r.mode === "compose") {
      h += '<div class="diff">' + esc(r.draft || "") + "</div>";
    } else {
      var parts = 差分(r.original || "", r.revised || "");
      h += '<div class="diff">' + parts.map(function (p2) {
        var v = esc(p2.v);
        return p2.t === "same" ? v : '<span class="' + p2.t + '">' + v + "</span>";
      }).join("") + "</div>";
    }
    /* ★ 数えかたを 1 か所に する（2026-08-31 実測）。
       上は サーバの 数、下は こちらの 数 に なって いて **210 と 196 が 並んで** いた。 */
    var 本文 = String(r.mode === "compose" ? r.draft : r.revised || "");
    var 前 = 数(r.original || ""), 後 = 数(本文);
    h += '<div class="foot"><span class="cnt">文字数（変更後）：' + 後 + " 文字"
      + (r.mode === "compose" ? "" : "（" + (後 - 前 >= 0 ? "+" : "") + (後 - 前) + "）")
      + (r.maxChars ? " ／ 上限 " + r.maxChars + " 文字" : "") + "</span>"
      + '<span class="sp" style="flex:1"></span>'
      + '<button class="btn" data-a="copy">' + svg("copy") + "修正版を コピー</button></div>";
    h += 注意(r);
    return h + "</div>";
  }

  /* ★ **作り話と 空欄の 札を 隠さない。** */
  function 注意(r) {
    var h = "";
    var 本 = String(r.mode === "compose" ? r.draft : r.revised || "");
    var 札 = (本.match(/【[^】]{1,40}】/g) || []);
    if ((r.invented || []).length) {
      h += '<div class="warn">' + svg("warn") + "<div><b>元の 文章に 無い 数が 残って います:</b> "
        + esc(r.invented.join(" / "))
        + "<br>あなたが 書いて いない ことです。<b>そのまま 出さないで ください。</b></div></div>";
    }
    if (札.length) {
      h += '<div class="warn ph">' + svg("warn") + "<div><b>" + 札.length + " か所、あなたに しか 書けない ところが あります。</b>"
        + "<br>" + esc(札.slice(0, 6).join(" ")) + "<br>"
        + "AI は ここを <b>作りません</b>。実際に あった ことを 自分で 埋めて ください。</div></div>";
    }
    if ((r.questions || []).length) {
      h += '<div class="warn ok">' + svg("warn") + "<div><b>これが 分かると もっと 良く なります</b><ul class=\"ul\">"
        + r.questions.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul></div></div>";
    }
    return h;
  }

  function 右() {
    var r = st.結果;
    var h = '<div class="card"><div class="ch"><b>総合評価</b></div>';
    if (!r || r.mode === "compose") {
      h += '<p class="cnt" style="line-height:2">添削すると、A〜D の 評価と 直す ところが ここに 出ます。</p></div>';
      if (r && r.mode === "compose") h += 生成の右(r);
      return h;
    }
    h += '<div class="gr"><div class="gr-b">' + esc(r.grade || "B") + "</div><div>"
      + '<div style="font-size:14px;font-weight:650">' + esc(r.gradeNote || "") + "</div>"
      + '<div class="cnt" style="margin-top:3px">論理性・表現力・一貫性で 見て います。</div></div></div></div>';

    h += '<div class="card"><div class="ch"><b>フィードバック</b></div>';
    if ((r.good || []).length) {
      h += '<div class="sec-t">良かった 点</div><ul class="ul">'
        + r.good.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }
    if ((r.improve || []).length) {
      h += '<div class="sec-t">改善 ポイント</div><ul class="ul">'
        + r.improve.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }
    if ((r.rewrites || []).length) {
      h += '<div class="sec-t">表現の 提案</div>'
        + r.rewrites.map(function (x) {
            return '<div class="rw"><i>' + esc(x.from) + "</i> → <b>" + esc(x.to) + "</b></div>";
          }).join("");
    }
    h += "</div>";

    if ((r.advice || []).length) {
      h += '<div class="card"><div class="ch"><b>詳細 アドバイス</b></div>';
      r.advice.forEach(function (a, i) {
        var 開 = !!st.開いた[i];
        h += '<div class="acc"><button data-a="acc" data-i="' + i + '">' + esc(a.title)
          + '<span class="sp" style="flex:1"></span>' + svg("down") + "</button>"
          + (開 ? '<div class="bd">' + esc(a.body) + "</div>" : "") + "</div>";
      });
      h += "</div>";
    }
    return h;
  }

  function 生成の右(r) {
    var h = "";
    if ((r.fields || []).length) {
      h += '<div class="card"><div class="ch"><b>資料の 記入欄</b></div>'
        + r.fields.map(function (f) {
            return '<div class="sec-t">' + esc(f.name) + '</div><div class="rw">' + esc(f.value) + "</div>";
          }).join("") + "</div>";
    }
    if ((r.outline || []).length) {
      h += '<div class="card"><div class="ch"><b>段落の ねらい</b></div><ul class="ul">'
        + r.outline.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    if ((r.notes || []).length) {
      h += '<div class="card"><div class="ch"><b>気を つけた ところ</b></div><ul class="ul">'
        + r.notes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    return h;
  }

  function 下() {
    var r = st.結果;
    if (!r) return "";
    var 本 = String(r.mode === "compose" ? r.draft : r.revised || "");
    return '<div class="card" style="margin-top:16px"><div class="ch"><b>'
      + (r.mode === "compose" ? "書き上げた 文章" : "修正版 プレビュー") + "</b>"
      + '<span class="sp"></span><span class="cnt">' + 数(本) + " 文字"
      + (r.maxChars ? " ／ 上限 " + r.maxChars : "") + "</span></div>"
      + '<div class="diff" style="max-height:none">' + esc(本) + "</div>"
      + '<div class="foot"><span class="sp" style="flex:1"></span>'
      + '<button class="btn" data-a="copy">' + svg("copy") + "コピー</button>"
      + '<button class="btn" data-a="print">印刷 ／ PDF で 保存</button></div></div>';
  }

  /* ── 動き ──────────────────────────────────────────────── */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.dataset.a;
      if (a === "close") { 閉じる(); return; }
      if (a === "help") {
        try { if (window.__vqHelp) { window.__vqHelp.open({ id: "write-basic" }); return; } } catch (eH) {}
        return;
      }
      if (a === "tab") { st.面 = el.dataset.v; st.err = ""; 描く(); return; }
      if (a === "acc") { var i = el.dataset.i; st.開いた[i] = !st.開いた[i]; 描く(); return; }
      if (a === "del-file") { st.資料.splice(parseInt(el.dataset.i, 10), 1); 描く(); return; }
      if (a === "pick") { 選ぶ(); return; }
      if (a === "run") { 走る(); return; }
      if (a === "copy") { 写す(); return; }
      if (a === "print") { try { window.print(); } catch (e2) {} return; }
      if (a === "export") { 書き出す(); return; }
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t || !t.dataset || !t.dataset.f) return;
      var f = t.dataset.f;
      if (f === "maxChars") st.字数 = Math.max(0, parseInt(t.value, 10) || 0);
      else if (f === "text") {
        st.文 = String(t.value || "");
        /* 打っている 最中に 描き直さない。文字数だけ 差し替える。 */
        var c = root.querySelector(".cnt");
        if (c && /いまの 文字数/.test(c.textContent)) c.textContent = "いまの 文字数：" + 数(st.文) + " 文字";
        return;
      }
      else if (f === "instruction") { st.指示 = String(t.value || ""); return; }
      else if (f === "kind") { st.種類 = String(t.value || ""); return; }
    });
  }

  function 選ぶ() {
    var inp = doc.createElement("input");
    inp.type = "file"; inp.multiple = true;
    inp.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv";
    inp.addEventListener("change", function () {
      var fs = Array.prototype.slice.call(inp.files || []).slice(0, 8);
      var 残 = fs.length;
      if (!残) return;
      fs.forEach(function (f) {
        var rd = new FileReader();
        rd.onload = function () {
          var s = String(rd.result || "");
          var at = s.indexOf(",");
          st.資料.push({ name: f.name, mimeType: f.type || "application/octet-stream",
                         data: at >= 0 ? s.slice(at + 1) : s });
          if (!--残) 描く();
        };
        rd.onerror = function () { if (!--残) 描く(); };
        rd.readAsDataURL(f);
      });
    });
    inp.click();
  }

  function 写す() {
    var r = st.結果; if (!r) return;
    var t = String(r.mode === "compose" ? r.draft : r.revised || "");
    try { navigator.clipboard.writeText(t); } catch (e) {}
    try { window.__vqToast && window.__vqToast("コピーしました"); } catch (e) {}
  }

  function 書き出す() {
    var r = st.結果; if (!r) return;
    var 行 = [];
    行.push("■ " + (r.mode === "compose" ? "書き上げた 文章" : "修正版"));
    行.push(String(r.mode === "compose" ? r.draft : r.revised || ""));
    if (r.grade) 行.push("\n■ 総合評価  " + r.grade + "　" + (r.gradeNote || ""));
    if ((r.good || []).length) 行.push("\n■ 良かった 点\n" + r.good.map(function (x) { return "・" + x; }).join("\n"));
    if ((r.improve || []).length) 行.push("\n■ 改善 ポイント\n" + r.improve.map(function (x) { return "・" + x; }).join("\n"));
    if ((r.rewrites || []).length) 行.push("\n■ 表現の 提案\n" + r.rewrites.map(function (x) { return "・" + x.from + " → " + x.to; }).join("\n"));
    if ((r.advice || []).length) 行.push("\n■ くわしい 助言\n" + r.advice.map(function (a) { return "【" + a.title + "】\n" + a.body; }).join("\n"));
    if ((r.questions || []).length) 行.push("\n■ 自分で 埋める ところ\n" + r.questions.map(function (x) { return "・" + x; }).join("\n"));
    var b = new Blob([行.join("\n")], { type: "text/plain;charset=utf-8" });
    var u = URL.createObjectURL(b);
    var a2 = doc.createElement("a");
    a2.href = u; a2.download = "添削の結果.txt";
    doc.body.appendChild(a2); a2.click(); doc.body.removeChild(a2);
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }

  function 走る() {
    if (st.忙) return;
    var 生 = st.面 === "file";
    if (!生 && !st.文.trim()) { st.err = "直す 文章を 入れて ください。"; 描く(); return; }
    if (生 && !st.資料.length && !st.指示.trim() && !st.文.trim()) {
      st.err = "資料を 選ぶか、何を 書くかを 指示欄に 書いて ください。"; 描く(); return;
    }
    var tk = token();
    if (!tk) { st.err = "ログインが 必要です。"; 描く(); return; }
    st.忙 = true; st.err = ""; st.結果 = null; 描く();
    var 体 = {
      mode: 生 ? "compose" : "proofread",
      text: st.文, instruction: st.指示, kind: st.種類,
      maxChars: st.字数 || undefined,
      files: st.資料.length ? st.資料.map(function (f) { return { mimeType: f.mimeType, data: f.data }; }) : undefined
    };
    var 中止 = null;
    try { 中止 = new AbortController(); } catch (e) {}
    var 見切り = setTimeout(function () { try { 中止 && 中止.abort(); } catch (e) {} }, 180000);
    fetch(apiBase() + "/api/ai/write", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify(体),
      signal: 中止 ? 中止.signal : undefined
    }).then(function (r) { clearTimeout(見切り); return r.json().catch(function () { return null; }); },
      function () { clearTimeout(見切り); throw new Error("つながりませんでした"); })
      .then(function (j) {
        st.忙 = false;
        if (!j || !j.ok) { st.err = (j && j.message) || "いま 直せませんでした。"; 描く(); return; }
        st.結果 = j; st.開いた = {}; 描く();
      })
      .catch(function (e) {
        st.忙 = false;
        st.err = String((e && e.message) || e).slice(0, 160);
        描く();
      });
  }

  /* ── 外へ 出す 口 ─────────────────────────────────────── */
  window.__vqWrite = {
    open: function (o) {
      o = o || {};
      建てる();
      if (typeof o.text === "string") st.文 = o.text;
      if (typeof o.instruction === "string") st.指示 = o.instruction;
      if (typeof o.kind === "string") st.種類 = o.kind;
      if (o.mode === "compose") st.面 = "file";
      開く();
    },
    close: 閉じる,
    /* 検証のため（画面を 触らずに 中を 見る） */
    state: function () {
      return { 開: st.開, 面: st.面, 忙: st.忙, err: st.err,
               文: st.文.length, 資料: st.資料.length,
               結果: st.結果 ? { mode: st.結果.mode, grade: st.結果.grade,
                                 model: st.結果.model,
                                 revised: (st.結果.revised || st.結果.draft || "").length,
                                 invented: (st.結果.invented || []).length } : null };
    },
    /* 検証のため。差分の 中身を そのまま 見る。 */
    diff: 差分,
    /* 検証のため。**AI を 呼ばずに** 返って きた 形を 差し込んで 見た目を 見る。
       （画面の 見た目を 直す たびに 実際に 作らせるのは 遅く、お金も かかる） */
    __show: function (r) { 建てる(); st.結果 = r; st.忙 = false; st.err = ""; 開く(); }
  };
})();
