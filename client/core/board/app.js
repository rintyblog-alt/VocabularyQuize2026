/* ══════════════════════════════════════════════════════════════════════
   core/board/app.js — AR Board で **動くもの**（AR App）

   ★ 訴え（2026-08-19）
     ① 「その場で コードを書いて、ボードで 動く ゲームや 教材を すぐ 出して。
        **毎回 必ず 崩れずに**」
     ② 「さらに 高度なアプリを。今のじゃ まだまだ。**まじで すごいものを 一発で**」
     ③ 「外部のものを 最大限に 使って、普通に 日常でも、ゲームとしても、
        アプリとしても 使えて 遊べるものに」

   ★ ① を守りながら ②③ を出すために、次の 4 段で 作る。

     ㋐ **道具を 貸す**（/vendor/arapp/）
        phaser・three・matter・p5・pixi・konva・fabric・chart・d3・
        tone・howler・gsap・tailwind・katex・qrcode・sortable・lil-gui・confetti。
        名前で 頼むだけ。読み込む順も 置き場所も こちらが 持つ。
        **本体と 同じ出どころ**から 配るので、外へは 一切 出ない。

     ㋑ **土台の API（window.VQ）を 先に 差し込む**（runtime.js）
        canvas の 用意・DPR・毎こまの輪・キー・指・音・保存・点の帯・粒。
        決まりきった書き物で 力尽きないように、そこは 全部 こちらが 持つ。

     ㋒ **包みは こちらが 作る**
        doctype・文字コード・画面幅・土台の見た目・見張り。
        向こうには **中身だけ** 書かせる。忘れようが 崩れない。

     ㋓ **壊れても 外は 無傷、そして 黙らない**
        sandbox（allow-same-origin なし）＝ 本体の DOM も 保存も 触れない。
        落ちたら 中の帯に 出し、親へ 送り、Lumi が その場で 直す。

   ★ 外へは 繋がせない（connect-src 'none'）。
     日常づかいの道具（メモ・時計・家計・暗記・作図）も ゲームも、
     外に 出さずに 作れる。保存は VQ.store が 本体の 溜めへ 預かる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQB = root.VQB || (root.VQB = {});
  var doc = root.document;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══ 貸せる道具 ═════════════════════════════════════════════════
     名前 → 実ファイル。**版は 名前の中**（1 年 溜めてよい）。
     いくつか 別名を 受ける（言い間違えても 通るように）。 */
  var 道具 = {
    phaser:   { js: "phaser-3.87.0.js",   別: ["ゲームエンジン", "game"] },
    three:    { js: "three-0.149.0.js",   別: ["threejs", "3d", "3D"] },
    matter:   { js: "matter-0.20.0.js",   別: ["matterjs", "物理", "physics"] },
    p5:       { js: "p5-1.11.10.js",      別: ["p5js", "processing"] },
    pixi:     { js: "pixi-7.4.2.js",      別: ["pixijs"] },
    konva:    { js: "konva-9.3.16.js",    別: [] },
    fabric:   { js: "fabric-5.3.0.js",    別: ["fabricjs", "お絵かき"] },
    chart:    { js: "chart-4.5.0.js",     別: ["chartjs", "グラフ"] },
    d3:       { js: "d3-7.9.0.js",        別: ["d3js"] },
    tone:     { js: "tone-15.0.4.js",     別: ["tonejs", "音楽"] },
    howler:   { js: "howler-2.2.4.js",    別: ["howlerjs"] },
    gsap:     { js: "gsap-3.13.0.js",     別: ["アニメ", "animation"] },
    tailwind: { js: "tailwind-4.1.11.js", 別: ["tw", "tailwindcss"] },
    katex:    { js: "katex-0.16.11.js", css: "katex-0.16.11.css", 別: ["数式", "math"] },
    qrcode:   { js: "qrcode-1.0.0.js",    別: ["qr"] },
    sortable: { js: "sortable-1.15.6.js", 別: ["sortablejs", "並べ替え", "dnd"] },
    lilgui:   { js: "lilgui-0.20.0.js",   別: ["gui", "つまみ"] },
    confetti: { js: "confetti-1.9.3.js",  別: ["紙吹雪"] }
  };
  var 別名 = (function () {
    var m = {};
    Object.keys(道具).forEach(function (k) {
      m[k] = k;
      (道具[k].別 || []).forEach(function (a) { m[String(a).toLowerCase()] = k; });
    });
    return m;
  })();
  function 道具を選ぶ(v) {
    var 出 = [], 見 = {};
    var 列 = Array.isArray(v) ? v : 文(v).split(/[,\s、・]+/);
    列.forEach(function (x) {
      var k = 別名[String(x || "").trim().toLowerCase()];
      if (k && !見[k]) { 見[k] = 1; 出.push(k); }
    });
    return 出;
  }
  /* 名前を 書き忘れても、中身から 気づいて 貸す（一発で 出すために大事）。 */
  function 中身から気づく(全文, すでに) {
    var 見 = {};
    すでに.forEach(function (k) { 見[k] = 1; });
    var 手がかり = {
      phaser: /\bPhaser\b/, three: /\bTHREE\b/, matter: /\bMatter\b/, p5: /\b(createCanvas|setup\s*\(\s*\)|p5\.)/,
      pixi: /\bPIXI\b/, konva: /\bKonva\b/, fabric: /\bfabric\b/, chart: /\bnew\s+Chart\b/,
      d3: /\bd3\./, tone: /\bTone\./, howler: /\bHowl\b/, gsap: /\bgsap\b|\bTweenMax\b/,
      katex: /\bkatex\b/, qrcode: /\bQRCode\b/, sortable: /\bSortable\b/, lilgui: /\b(lil|GUI)\b\s*\./,
      confetti: /\bconfetti\s*\(/,
      tailwind: /class\s*=\s*"[^"]*\b(flex|grid|bg-(?:slate|gray|blue|indigo|emerald|rose|amber|violet)-\d|text-(?:xl|2xl|3xl|sm)|rounded-(?:lg|xl|2xl)|p[xytblr]?-\d)\b/
    };
    var 足す = [];
    Object.keys(手がかり).forEach(function (k) {
      if (!見[k] && 手がかり[k].test(全文)) { 見[k] = 1; 足す.push(k); }
    });
    return 足す;
  }

  /* ── 三連の記号で 囲まれていたら 外す ─────────────────────────── */
  function 囲みを外す(s) {
    var t = 文(s).trim();
    if (!t) return "";
    var m = t.match(/^```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)\n?```$/);
    if (m) return m[1];
    var re = /```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)```/g, best = "", x;
    while ((x = re.exec(t))) { if (x[1].length > best.length) best = x[1]; }
    return best || t;
  }
  function 丸ごとか(h) {
    var t = 文(h).slice(0, 400).toLowerCase();
    return t.indexOf("<!doctype") >= 0 || t.indexOf("<html") >= 0;
  }
  function 閉じを逃がす(s) { return 文(s).replace(/<\/script/gi, "<\\/script"); }

  /* ── 土台の見た目。**必ず付ける。** ────────────────────────────── */
  var 土台 = [
    "*,*::before,*::after{box-sizing:border-box;}",
    "html,body{margin:0;padding:0;height:100%;}",
    "body{font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',",
    "system-ui,sans-serif;font-size:15px;line-height:1.7;color:#2B2836;background:#FCFBFE;",
    "-webkit-text-size-adjust:100%;overflow-x:hidden;overscroll-behavior:contain;}",
    /* ★ #vqapp に min-height を **付けない**（2026-08-19 の 3 度目）。
       付けていると 中身の高さが いつも「画面いっぱい」になり、
       **どこまでが 中身か 測れない** → 枠を 伸ばせない → 途切れて見えた。
       地の色は body が 持つので、見た目は 変わらない。 */
    "#vqapp{padding:14px;}",
    "html,body{min-height:100%;}",
    "h1{font-size:20px;}h2{font-size:17px;}h3{font-size:15px;}",
    "h1,h2,h3{margin:0 0 8px;line-height:1.5;font-weight:750;}",
    "p{margin:0 0 8px;}",
    "img{max-width:100%;height:auto;}",
    "table{border-collapse:collapse;}td,th{border:1px solid #E7E4EF;padding:6px 10px;}",
    "canvas{max-width:100%;display:block;touch-action:none;}",
    /* 触るもの */
    "button,.vq-btn{font:inherit;font-weight:650;min-height:40px;padding:0 16px;border-radius:12px;",
    "border:1px solid #E7E4EF;background:#fff;color:#2B2836;cursor:pointer;",
    "transition:background .12s,transform .08s;}",
    "button:hover,.vq-btn:hover{background:#F7F5FC;}",
    "button:active,.vq-btn:active{transform:scale(.97);}",
    ".vq-btn.main{background:#756DB3;border-color:#756DB3;color:#fff;}",
    ".vq-btn.main:hover{filter:brightness(1.08);}",
    "input,select,textarea{font:inherit;padding:9px 11px;border:1px solid #E7E4EF;",
    "border-radius:11px;background:#fff;color:#2B2836;max-width:100%;}",
    "input[type=range]{padding:0;width:100%;accent-color:#756DB3;}",
    /* 土台 API が 出すもの */
    ".vq-stage{width:100%;margin:0 0 12px;}",
    ".vq-panel{background:#fff;border:1px solid #EFEDF5;border-radius:16px;padding:16px;margin:0 0 12px;",
    "box-shadow:0 1px 2px rgba(84,72,140,.05);}",
    ".vq-sub{color:#7A7589;font-size:13px;margin:0;}",
    ".vq-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;}",
    ".vq-label{font-size:14px;color:#454151;margin:0 0 8px;}",
    ".vq-slider{display:block;margin:0 0 12px;}",
    ".vq-slider-l{display:block;font-size:12.5px;color:#7A7589;font-weight:650;margin:0 0 4px;}",
    ".vq-hud{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}",
    ".vq-hud-i{display:inline-flex;align-items:baseline;gap:6px;padding:6px 12px;border-radius:999px;",
    "background:#EAE8F7;color:#5F579E;font-size:12.5px;font-weight:650;}",
    ".vq-hud-i i{font-style:normal;font-size:16px;font-weight:750;color:#2B2836;",
    "font-variant-numeric:tabular-nums;}",
    ".vq-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:80;",
    "padding:10px 18px;border-radius:999px;background:rgba(24,22,38,.92);color:#fff;",
    "font-size:13.5px;font-weight:650;transition:opacity .25s,transform .25s;}",
    ".vq-toast.out{opacity:0;transform:translateX(-50%) translateY(8px);}",
    ".vq-fx{position:fixed;inset:0;z-index:90;pointer-events:none;}",
    /* 壊れたときの 帯 */
    "#vqerr{position:fixed;left:0;right:0;bottom:0;z-index:99;margin:0;padding:8px 12px;",
    "background:#FDECEC;color:#9A2A2A;border-top:1px solid #F3C9C9;font-size:12px;",
    "line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:38%;overflow:auto;}"
  ].join("");

  /* ── 見張り。**中身より 先に** 置く ────────────────────────────── */
  var 見張り = [
    "(function(){",
    "  var 送る=function(k,m){try{parent.postMessage({__vqapp:1,kind:k,message:String(m).slice(0,600)},'*');}catch(e){}};",
    "  var 出す=function(m){try{var d=document.getElementById('vqerr');",
    "    if(!d){d=document.createElement('pre');d.id='vqerr';(document.body||document.documentElement).appendChild(d);}",
    "    d.textContent=String(m).slice(0,600);}catch(e){}};",
    "  window.addEventListener('error',function(e){",
    "    var m=(e&&e.message)||'エラー';",
    "    if(e&&e.target&&e.target.tagName==='SCRIPT'&&e.target.src){",
    "      m='道具を 読み込めませんでした: '+e.target.src;}",
    "    else if(e&&e.filename&&e.lineno)m+=' （'+e.lineno+' 行目）';",
    "    出す(m);送る('error',m);},true);",
    "  window.addEventListener('unhandledrejection',function(e){",
    "    var m='待っていたものが 失敗しました: '+((e&&e.reason&&e.reason.message)||e.reason||'');",
    "    出す(m);送る('error',m);});",
    "  var ce=console.error;console.error=function(){",
    "    try{送る('console',Array.prototype.join.call(arguments,' '));}catch(x){}",
    "    try{ce.apply(console,arguments);}catch(x){}};",
    "  var 見た=function(){",
    "    var b=document.getElementById('vqapp')||document.body;",
    "    var 中=b?b.innerHTML.replace(/\\s|<!--[\\s\\S]*?-->/g,''):'';",
    "    var 板=document.querySelector('canvas,svg,input,button,select,textarea');",
    "    var 空=!中.length&&!板;",
    "    送る(空?'blank':'ok',空?'画面に 何も 描かれていません':'動いています');",
    "  };",
    "  window.addEventListener('load',function(){setTimeout(見た,900);});",
    /* ★ **中身の高さを 知らせる**（2026-08-19 の 3 度目・訴え「途切れる」）。
       外の枠は これを 見て 伸びる。測るのは #vqapp の 中身だけ
       （body を 測ると 枠の高さを そのまま 返すので 伸び続ける）。 */
    "  var 前H=0;",
    "  var 測る=function(){",
    "    try{",
    "      var b=document.getElementById('vqapp');",
    "      var h=b?b.scrollHeight:0;",
    "      var e=document.getElementById('vqerr');",
    "      if(e)h+=e.offsetHeight||0;",
    "      /* 絶対配置や 固定のものは scrollHeight に 入らない。いちばん下を 探す。 */",
    "      var 全=document.querySelectorAll('#vqapp *');",
    "      for(var i=0;i<全.length;i++){",
    "        var st2=getComputedStyle(全[i]);",
    "        if(st2.position!=='absolute'&&st2.position!=='fixed')continue;",
    "        var r=全[i].getBoundingClientRect();",
    "        var y=r.bottom+(window.scrollY||0);",
    "        if(y>h&&y<20000)h=y;",
    "      }",
    "      h=Math.round(h);",
    "      if(h>0&&Math.abs(h-前H)>6){前H=h;送る2('height',h);}",
    "    }catch(x){}",
    "  };",
    "  var 送る2=function(k,v){try{parent.postMessage({__vqapp:1,kind:k,value:v},'*');}catch(e){}};",
    "  try{",
    "    var ro=new ResizeObserver(function(){測る();});",
    "    var 待=function(){var b=document.getElementById('vqapp');if(b){ro.observe(b);測る();}else setTimeout(待,80);};",
    "    待();",
    "  }catch(x){setInterval(測る,700);}",
    "  setTimeout(測る,400);setTimeout(測る,1200);setTimeout(測る,2600);setTimeout(測る,5000);",
    /* ★ **拡大縮小**（訴え「拡大縮小もできるように」）。
       transform で 引き伸ばすと ぼやける。zoom なら 組み直すので くっきり。 */
    "  window.addEventListener('message',function(e){",
    "    var d=e&&e.data;if(!d||d.__vqapp!==2)return;",
    "    if(d.kind==='zoom'){",
    "      try{",
    "        var k=Math.max(0.4,Math.min(3,Number(d.value)||1));",
    "        document.documentElement.style.zoom=k===1?'':String(k);",
    "        window.dispatchEvent(new Event('resize'));",
    "        setTimeout(測る,120);setTimeout(測る,420);",
    "      }catch(x){}",
    "    }",
    "    if(d.kind==='measure'){測る();}",
    "  });",
    "})();"
  ].join("\n");

  /* ── 土台 API（runtime.js）の 中身。読み込み時に 1 度だけ 取る ──── */
  var _土台API = null, _取得中 = null;
  function 元()  {
    try { return root.location.origin; } catch (e) { return ""; }
  }
  function 土台APIを取る() {
    if (_土台API !== null) return Promise.resolve(_土台API);
    if (_取得中) return _取得中;
    /* 束ねたものの中に 文字列として 持っている（VQB.RUNTIME）。
       持っていなければ 取りに行く。どちらも だめでも **止めない**
       （VQ が 無いだけで、素の JS は 動く）。 */
    if (root.VQB && typeof root.VQB.RUNTIME === "string" && root.VQB.RUNTIME.length > 100) {
      _土台API = root.VQB.RUNTIME;
      return Promise.resolve(_土台API);
    }
    _取得中 = fetch("/core/board/runtime.js")
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) { _土台API = t || ""; return _土台API; })
      .catch(function () { _土台API = ""; return ""; });
    return _取得中;
  }

  /* ══ 1 枚の 文書に 組み立てる ══════════════════════════════════════ */
  function 文書(a, o) {
    o = o || {};
    if (typeof a === "string") a = { code: a };
    a = a || {};
    var html = 囲みを外す(a.html);
    var css = 囲みを外す(a.css);
    var js = 囲みを外す(a.js);
    var code = 囲みを外す(a.code);
    if (!html && !css && !js && code) {
      if (丸ごとか(code)) html = code;
      else if (/<[a-z][\s\S]*>/i.test(code)) html = code;
      else js = code;
    }
    var 全文 = html + "\n" + css + "\n" + js;
    var 借りる = 道具を選ぶ(a.libs || a.道具 || []);
    借りる = 借りる.concat(中身から気づく(全文, 借りる));

    var org = 元();
    /* 道具は **本体と 同じ出どころ**からだけ。外の住所は 一切 許さない。 */
    var csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' " + org,
      "style-src 'unsafe-inline' " + org,
      "img-src data: blob: " + org,
      "media-src data: blob: " + org,
      "font-src data: " + org,
      "worker-src blob:",
      "connect-src 'none'",
      "form-action 'none'"
    ].join("; ");

    var 借り物 = 借りる.map(function (k) {
      var d = 道具[k], 出 = [];
      if (d.css) 出.push('<link rel="stylesheet" href="/vendor/arapp/' + d.css + '">');
      出.push('<script src="/vendor/arapp/' + d.js + '"><\/script>');
      return 出.join("\n");
    }).join("\n");

    var 土台API = o.土台API === undefined ? (_土台API || "") : o.土台API;

    /* 丸ごとの HTML を 渡された … 包みは そのまま、見張りと 土台だけ 差す。 */
    if (丸ごとか(html)) {
      var 差し = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n'
        + "<style>" + 土台 + "</style>\n"
        + "<script>" + 見張り + "<\/script>\n"
        + (土台API ? "<script>" + 土台API + "<\/script>\n" : "")
        + 借り物 + "\n";
      if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, "<head$1>\n" + 差し);
      if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, "<body$1>\n" + 差し);
      return 差し + html;
    }

    return [
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
      '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
      "<title>AR App</title>",
      "<style>" + 土台 + "</style>",
      css ? "<style>\n" + css + "\n</style>" : "",
      "<script>" + 見張り + "<\/script>",
      土台API ? "<script>" + 土台API + "<\/script>" : "",
      借り物,
      "</head><body>",
      '<div id="vqapp">' + (html || "") + "</div>",
      js ? ("<script>\ntry{\n" + 閉じを逃がす(js) + "\n}catch(e){\n"
            + "  var m=(e&&e.message)||String(e);\n"
            + "  try{var d=document.createElement('pre');d.id='vqerr';"
            + "d.textContent=m;document.body.appendChild(d);}catch(x){}\n"
            + "  try{parent.postMessage({__vqapp:1,kind:'error',message:m},'*');}catch(x){}\n"
            + "}\n<\/script>") : "",
      "</body></html>"
    ].filter(Boolean).join("\n");
  }

  /* ══ 中からの 頼みごと（保存・問題）に 答える ══════════════════════
     ★ iframe は 本体の 保存を **触れない**（そう作ってある）。
       代わりに ここが 預かる。鍵は アプリごとに 分ける。 */
  function 既定の橋(appId) {
    var 頭 = "vq2.arapp." + (appId || "app") + ".";
    return function (kind, d) {
      try {
        if (kind === "store.get") {
          var s = root.localStorage.getItem(頭 + d.key);
          return s === null ? null : JSON.parse(s);
        }
        if (kind === "store.set") {
          root.localStorage.setItem(頭 + d.key, JSON.stringify(d.value === undefined ? null : d.value));
          return true;
        }
        if (kind === "quiz.get") return 問題を渡す(d);
      } catch (e) {}
      return null;
    };
  }
  /* 本体が 持っている 本物の問題を 渡す（教材として いちばん 効く）。
     **個人を 特定するものは 渡さない**（問題文と 答えだけ）。 */
  function 問題を渡す(d) {
    var n = Math.max(1, Math.min(60, Number(d && d.count) || 10));
    var 束 = [];
    try {
      var ST = root.VQ2 && root.VQ2.store;
      if (!ST || !ST.listPresets) return [];
      var 一 = ST.listPresets() || [];
      if (d && d.presetId) 一 = 一.filter(function (p) { return String(p.id) === String(d.presetId); });
      一.forEach(function (p) {
        (p.questions || []).forEach(function (q) {
          var 正 = q.correctAnswer;
          var 選 = (q.choices || []).map(function (c) { return c.text; });
          if (!正 && (q.choices || []).length) {
            var c0 = (q.choices || []).filter(function (c) { return c.isCorrect; })[0];
            正 = c0 ? c0.text : "";
          }
          if (!q.prompt || !正) return;
          束.push({ q: String(q.prompt).slice(0, 300), a: String(正).slice(0, 200),
                    choices: 選.slice(0, 8), explanation: String(q.explanation || "").slice(0, 300),
                    preset: String(p.name || "") });
        });
      });
    } catch (e) { return []; }
    /* 並べ替えて 頭から n 個。毎回 同じ順に しない。 */
    for (var i = 束.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = 束[i]; 束[i] = 束[j]; 束[j] = t;
    }
    return 束.slice(0, n);
  }

  /* ══ 枠（iframe）に 入れて 出す ═══════════════════════════════════ */
  function 枠(親, a, o) {
    o = o || {};
    if (!親) return null;
    var 本文 = 文書(a, { 土台API: _土台API || "" });
    var f = doc.createElement("iframe");
    f.className = "vqb-app-frame";
    f.setAttribute("title", 文(o.title) || "AR App");
    /* allow-same-origin は **付けない**。付けると 本体の保存も 触れてしまう。 */
    f.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals");
    f.setAttribute("allow", "fullscreen; autoplay");
    f.setAttribute("referrerpolicy", "no-referrer");
    var 高 = Number(o.高さ) || 340;
    f.style.cssText = "display:block;width:100%;border:0;background:#FCFBFE;"
      + "border-radius:12px;min-height:" + 高 + "px;height:" + 高 + "px;";
    f.srcdoc = 本文;
    親.appendChild(f);

    var 橋 = o.橋 || 既定の橋(o.appId || o.title || "app");
    var 済み = false, 生きてる = true;

    function 聞く(e) {
      var d = e && e.data;
      if (!d || d.__vqapp !== 1) return;
      if (!f.contentWindow || e.source !== f.contentWindow) return;
      /* ★ 頼みごと（保存・問題）は **rid の有無に かかわらず** 橋へ 回す
         （2026-08-19・実測の不具合）。
         もとは rid が付いているものだけ 橋へ 渡していたので、
         返事の要らない store.set が **どこへも 届かず**、
         そのうえ 「知らせ」として 扱われて
         「うまく 動きませんでした：undefined」と 帯に 出ていた。 */
      if (/^(store|quiz|app)\./.test(String(d.kind || ""))) {
        var v = null;
        try { v = 橋(d.kind, d); } catch (x) { v = null; }
        if (d.rid) {
          Promise.resolve(v).then(function (val) {
            try { f.contentWindow.postMessage({ __vqapp: 2, rid: d.rid, value: val }, "*"); } catch (x) {}
          });
        }
        return;
      }
      /* ★ 中身の高さが 届いた → **枠を そこまで 伸ばす**（2026-08-19 の 3 度目）。
         訴え「生成したものが 途切れる。もったいない」。
         もとは 枠の高さが 決め打ちだったので、長いものは 下が 切れていた。 */
      if (d.kind === "height") { 高さに合わせる(d.value); return; }
      if (d.kind === "ok") 済み = true;
      /* 知らせは **決まったものだけ** 上へ渡す。知らない名前で
         「壊れた」と 出さない（同じ間違いを 二度としないため）。 */
      if (["ok", "blank", "silent", "error", "console", "done"].indexOf(String(d.kind)) < 0) return;
      if (typeof o.報せ === "function") { try { o.報せ(d.kind, d.message, d); } catch (x) {} }
    }
    /* ── 枠の高さを 中身に 合わせる ────────────────────────────────
       ★ 伸ばすだけで **縮めすぎない**。ゲームは 中で 画面いっぱいに
         描くことがあり、そこで 縮めると 逆に 切れる。
       ★ 上限は 画面の高さ（全画面のときは 目いっぱい）。それを 超えたら
         枠の中で スクロールさせる（外の板ごと 伸ばさない）。 */
    var 最低 = 高, いまの高 = 高, 自動 = o.自動高さ !== false;
    function 上限() {
      if (o.上限) return Number(o.上限);
      var v = root.innerHeight || 800;
      return Math.max(320, Math.round(v * (o.全画面 ? 0.94 : 0.78)));
    }
    function 高さに合わせる(h) {
      if (!自動) return;
      var n = Math.round(Number(h) || 0);
      if (!n) return;
      n = Math.max(最低, Math.min(上限(), n + 4));
      if (Math.abs(n - いまの高) < 8) return;
      いまの高 = n;
      f.style.height = n + "px";
      f.style.minHeight = n + "px";
      if (typeof o.高さが変わった === "function") { try { o.高さが変わった(n); } catch (x) {} }
    }
    root.addEventListener("message", 聞く);
    var t = setTimeout(function () {
      if (済み || !生きてる) return;
      if (typeof o.報せ === "function") { try { o.報せ("silent", "8 秒 返事が ありません"); } catch (x) {} }
    }, 8000);

    /* 大きい道具（phaser 1.2MB）を 借りると 少し 待つ。**先に 出しておく。** */
    土台APIを取る().then(function (rt) {
      if (!生きてる || !rt || _土台API === "") return;
      /* すでに 出した文書に 土台 API が 入っていなければ 入れ直す。 */
      if (本文.indexOf("window.VQ=VQ") < 0 && 本文.indexOf("W.VQ = VQ") < 0) {
        本文 = 文書(a, { 土台API: rt });
        f.srcdoc = 本文;
      }
    });

    return {
      枠: f, 文書: 本文,
      道具: 道具を選ぶ((a && (a.libs || a.道具)) || []).concat(
        中身から気づく(文((a && a.html) || "") + 文((a && a.css) || "") + 文((a && a.js) || "") + 文((a && a.code) || ""),
                     道具を選ぶ((a && (a.libs || a.道具)) || []))),
      高さを変える: function (h) {
        最低 = いまの高 = Number(h) || 最低;
        f.style.height = いまの高 + "px"; f.style.minHeight = いまの高 + "px";
      },
      /* ★ 拡大縮小（0.4〜3 倍）。中で zoom を 使うので **ぼやけない**。 */
      拡大: function (k) {
        var v = Math.max(0.4, Math.min(3, Number(k) || 1));
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "zoom", value: v }, "*"); } catch (x) {}
        return v;
      },
      測り直す: function () {
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "measure" }, "*"); } catch (x) {}
      },
      /* 全画面のときは 上限が 変わるので、測り直させる。 */
      全画面にする: function (on) {
        o.全画面 = !!on;
        try { f.contentWindow.postMessage({ __vqapp: 2, kind: "measure" }, "*"); } catch (x) {}
      },
      いまの高さ: function () { return いまの高; },
      作り直す: function (b) { 済み = false; 本文 = 文書(b || a, { 土台API: _土台API || "" }); f.srcdoc = 本文; },
      片づける: function () {
        生きてる = false;
        clearTimeout(t);
        try { root.removeEventListener("message", 聞く); } catch (x) {}
        try { if (f.parentNode) f.parentNode.removeChild(f); } catch (x) {}
      }
    };
  }

  /* 起動のとき 土台 API を 先に 温めておく（1 本目から 使えるように）。 */
  try { 土台APIを取る(); } catch (e) {}

  VQB.app = {
    文書: 文書, 枠: 枠, 囲みを外す: 囲みを外す, 丸ごとか: 丸ごとか,
    道具一覧: function () { return Object.keys(道具); },
    道具を選ぶ: 道具を選ぶ, 中身から気づく: 中身から気づく,
    土台APIを取る: 土台APIを取る
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
