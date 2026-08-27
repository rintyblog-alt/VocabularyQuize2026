/* ══════════════════════════════════════════════════════════════════════════
   core/kata/learn.js — 型の 芯（まなび）6 種
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});
  var 題 = { 鍵: "題", 型: "文", 既定: "まなぶ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };
  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══ ⑬ drill — 計算ドリル ═══════════════════════════════════════ */
  芯.drill = {
    名: "計算ドリル", 分類: "まなび",
    語: ["計算", "ドリル", "算数", "足し算", "引き算", "かけ算", "わり算", "暗算", "数学", "練習", "九九", "けいさん", "百ます"],
    説明: "その場で 問題を 作って 出す。答えを 打ち込む。何問 正解したかが 出る。",
    スロット: [題, 副,
      { 鍵: "やりかた", 型: "選", 候補: ["たす", "ひく", "かける", "わる", "まぜる"], 既定: "まぜる" },
      { 鍵: "上のかず", 型: "数", 既定: 20, 最小: 2, 最大: 999, 説: "使う数の いちばん大きいところ" },
      { 鍵: "問数", 型: "数", 既定: 20, 最小: 3, 最大: 100 }
    ],
    例: { 題: "九九の れんしゅう", やりかた: "かける", 上のかず: 9, 問数: 20 },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.問数], ["kS", "0 問 正解"]]),
        中: '<div class="k-center"><div id="kEx"></div>'
          + '<input class="k-in" id="kIn" inputmode="numeric" autocomplete="off" placeholder="こたえ" style="max-width:220px;text-align:center;font-size:calc(var(--k-fs) + 6px)">'
          + '<div class="k-note" id="kMsg">Enter で つぎへ</div></div>',
        手: '<button class="k-btn pri" id="kOk">こたえる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kEx{font-size:clamp(30px,8vw,58px);font-weight:800;letter-spacing:.02em}",
        js: "var OP=" + JSON.stringify(d.やりかた) + ",MAX=" + d.上のかず + ",N=" + d.問数 + ";\n"
          + "var i=0,sc=0,cur=null,done=0;\n"
          + "function make(){var ops=OP==='まぜる'?['たす','ひく','かける','わる']:[OP];\n"
          + "  var o=ops[(Math.random()*ops.length)|0];\n"
          + "  var a=1+((Math.random()*MAX)|0),b=1+((Math.random()*MAX)|0);\n"
          + "  if(o==='ひく'&&b>a){var t=a;a=b;b=t;}\n"
          + "  if(o==='わる'){b=Math.max(1,b);a=b*(1+((Math.random()*Math.max(1,Math.floor(MAX/b)))|0));}\n"
          + "  var s=o==='たす'?'+':o==='ひく'?'−':o==='かける'?'×':'÷';\n"
          + "  var v=o==='たす'?a+b:o==='ひく'?a-b:o==='かける'?a*b:a/b;\n"
          + "  return {t:a+' '+s+' '+b,v:v};}\n"
          + "function draw(){done=0;cur=make();K.$('#kEx').textContent=cur.t;K.$('#kIn').value='';\n"
          + "  K.$('#kQ').textContent=(i+1)+'/'+N;K.$('#kMsg').textContent='Enter で つぎへ';K.$('#kIn').focus();}\n"
          + "function ans(){if(done){i++;if(i>=N){fin();return;}draw();return;}\n"
          + "  done=1;var v=Number(K.$('#kIn').value);var ok=v===cur.v;if(ok)sc++;\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  K.$('#kMsg').innerHTML=ok?'<b class=\"k-good\">せいかい</b>':'<b class=\"k-bad\">こたえ '+cur.v+'</b>';}\n"
          + "function fin(){K.$('#kEx').innerHTML='<span class=\"k-big\">'+sc+' / '+N+'</span>';\n"
          + "  K.$('#kIn').classList.add('k-hide');K.$('#kMsg').textContent='おつかれさま';}\n"
          + "K.$('#kOk').onclick=ans;\n"
          + "K.$('#kIn').addEventListener('keydown',function(e){if(e.key==='Enter')ans();});\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';K.$('#kIn').classList.remove('k-hide');draw();};\n"
          + "draw();"
      };
    }
  };

  /* ══ ⑭ matchline — 線つなぎ ═══════════════════════════════════ */
  芯.matchline = {
    名: "線つなぎ", 分類: "まなび",
    語: ["線つなぎ", "線でつなぐ", "対応", "結ぶ", "マッチング", "左右", "match", "組にする", "つなげる", "意味をつなぐ"],
    説明: "左と 右を 1 つずつ 選んで つなぐ。合っていれば 消える。",
    スロット: [題, 副,
      { 鍵: "対", 型: "表", 必須: ["左", "右"], 最大: 20, 形: { 左: "文", 右: "文" },
        説: "1 組 ＝ {左, 右}",
        既定: [{ 左: "光合成", 右: "植物が 養分を 作る" }, { 左: "蒸散", 右: "葉から 水が 出る" }] }
    ],
    例: { 題: "用語と 意味を つなぐ", 対: [{ 左: "還元", 右: "酸素を うばう" }] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/" + d.対.length], ["kM", ""]]),
        中: '<div id="kWrap"><div id="kL" class="col"></div><div id="kR" class="col"></div></div>',
        手: '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kWrap{display:flex;gap:var(--k-gap);align-items:flex-start}"
          + "#kWrap .col{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--k-gap) * .6)}"
          + ".mi{min-height:48px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;word-break:break-word;font-weight:600}"
          + ".mi.sel{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".mi.got{background:var(--k-good);color:#fff;border-color:transparent;pointer-events:none}"
          + ".mi.ng{background:var(--k-bad);color:#fff;border-color:transparent}",
        js: "var P=" + JSON.stringify(d.対) + ";\nvar sel=null,got=0;\n"
          + "function build(){got=0;sel=null;K.$('#kM').textContent='';K.$('#kP').textContent='0/'+P.length;\n"
          + "  var L=K.$('#kL'),R=K.$('#kR');L.innerHTML='';R.innerHTML='';\n"
          + "  K.shuffle(P.map(function(p,i){return {i:i,t:p.左};})).forEach(function(o){L.appendChild(item(o,'L'));});\n"
          + "  K.shuffle(P.map(function(p,i){return {i:i,t:p.右};})).forEach(function(o){R.appendChild(item(o,'R'));});}\n"
          + "function item(o,side){var b=document.createElement('button');b.className='mi';b.textContent=o.t;\n"
          + "  b.dataset.i=o.i;b.dataset.s=side;b.onclick=function(){tap(b);};return b;}\n"
          + "function tap(b){if(!sel){sel=b;b.classList.add('sel');return;}\n"
          + "  if(sel===b){sel.classList.remove('sel');sel=null;return;}\n"
          + "  if(sel.dataset.s===b.dataset.s){sel.classList.remove('sel');sel=b;b.classList.add('sel');return;}\n"
          + "  var a=sel;sel=null;a.classList.remove('sel');\n"
          + "  if(a.dataset.i===b.dataset.i){a.classList.add('got');b.classList.add('got');got++;\n"
          + "    K.$('#kP').textContent=got+'/'+P.length;\n"
          + "    if(got===P.length)K.$('#kM').textContent='ぜんぶ そろった';return;}\n"
          + "  a.classList.add('ng');b.classList.add('ng');\n"
          + "  setTimeout(function(){a.classList.remove('ng');b.classList.remove('ng');},520);}\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑮ fillblank — 穴うめ ═══════════════════════════════════ */
  芯.fillblank = {
    名: "穴うめ", 分類: "まなび",
    語: ["穴埋め", "空欄", "虫食い", "書き込む", "fill", "補う", "文中", "入れる"],
    説明: "文の 空いた所に 言葉を 入れる。打ち込みでも、選ぶ形でも 出せる。",
    スロット: [題, 副,
      { 鍵: "問題", 型: "表", 必須: ["文", "答"], 最大: 60, 形: { 文: "文", 答: "文", 選択肢: "並び", 解説: "文" },
        説: "文の 空けたい所に ＿＿ と 書く。答が その中身",
        既定: [{ 文: "水は ＿＿ ℃ で 沸とうする。", 答: "100", 選択肢: [], 解説: "1 気圧のとき。" }] }
    ],
    例: { 題: "歴史 穴うめ", 問題: [{ 文: "1868 年に ＿＿ が 始まった。", 答: "明治維新" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.問題.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-card"><div id="kSent"></div></div>'
          + '<div id="kPick" class="k-gr" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))"></div>'
          + '<div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn pri" id="kOk">たしかめる</button><button class="k-btn" id="kNext">つぎへ</button>'
          + '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kSent{font-size:calc(var(--k-fs) + 3px);line-height:2.1;word-break:break-word}"
          + "#kSent input{display:inline-block;width:min(190px,52vw);min-height:38px;padding:2px 10px;margin:0 4px;"
          + "border-radius:8px;border:1px solid var(--k-line);background:var(--k-bg);text-align:center;font-weight:700}"
          + "#kSent .fx{padding:2px 10px;border-radius:8px;font-weight:700}"
          + "#kSent .fx.o{background:var(--k-good);color:#fff}#kSent .fx.x{background:var(--k-bad);color:#fff}",
        js: "var Q=" + JSON.stringify(d.問題) + ";\nvar i=0,sc=0,done=0;\n"
          + "function draw(){done=0;var q=Q[i];K.$('#kQ').textContent=(i+1)+'/'+Q.length;\n"
          + "  var parts=String(q.文).split(/＿＿+|_{2,}/);\n"
          + "  if(parts.length<2)parts=[String(q.文)+' ',''];\n"
          + "  K.$('#kSent').innerHTML=K.esc(parts[0])+'<input id=\"kBlank\" autocomplete=\"off\">'+K.esc(parts.slice(1).join(' '));\n"
          + "  K.$('#kExp').classList.add('k-hide');\n"
          + "  var p=K.$('#kPick');p.innerHTML='';\n"
          + "  if((q.選択肢||[]).length){K.shuffle(q.選択肢.slice()).forEach(function(t){var b=document.createElement('button');\n"
          + "    b.className='k-btn';b.textContent=t;b.onclick=function(){K.$('#kBlank').value=t;};p.appendChild(b);});}\n"
          + "  K.$('#kBlank').addEventListener('keydown',function(e){if(e.key==='Enter')check();});\n"
          + "  K.$('#kBlank').focus();}\n"
          + "function check(){if(done)return;done=1;var q=Q[i];var v=String(K.$('#kBlank').value||'').trim();\n"
          + "  var ok=v.toLowerCase()===String(q.答).trim().toLowerCase();if(ok)sc++;\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  var parts=String(q.文).split(/＿＿+|_{2,}/);if(parts.length<2)parts=[String(q.文)+' ',''];\n"
          + "  K.$('#kSent').innerHTML=K.esc(parts[0])+'<span class=\"fx '+(ok?'o':'x')+'\">'+K.esc(ok?v:q.答)+'</span>'+K.esc(parts.slice(1).join(' '));\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b>'+(ok?'せいかい':'こたえ: '+K.esc(q.答))+'</b>'+(q.解説?'<div class=\"k-note\" style=\"margin-top:6px\">'+K.esc(q.解説)+'</div>':'');}\n"
          + "K.$('#kOk').onclick=check;\n"
          + "K.$('#kNext').onclick=function(){if(!done){check();return;}i++;\n"
          + "  if(i>=Q.length){K.$('#kSent').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+sc+' / '+Q.length+'</div></div>';\n"
          + "    K.$('#kPick').innerHTML='';K.$('#kExp').classList.add('k-hide');return;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';draw();};draw();"
      };
    }
  };

  /* ══ ⑯ sortcat — しわけ ═══════════════════════════════════════ */
  芯.sortcat = {
    名: "しわけ", 分類: "まなび",
    語: ["仕分け", "分類", "グループ", "分ける", "カテゴリ", "sort", "属する", "どっち", "振り分け"],
    説明: "出てくる ものを 決められた 箱へ 分ける。合っていれば 箱に たまる。",
    スロット: [題, 副,
      { 鍵: "箱", 型: "並び", 最大: 6, 上限: 24, 既定: ["動物", "植物"], 説: "分け先の 名前（2〜6 個）" },
      { 鍵: "品", 型: "表", 必須: ["名", "箱"], 最大: 80, 形: { 名: "文", 箱: "文" },
        説: "1 つ ＝ {名, 箱}。箱は 上の 並びの どれかと 同じ 文字にする",
        既定: [{ 名: "いぬ", 箱: "動物" }, { 名: "さくら", 箱: "植物" }, { 名: "ねこ", 箱: "動物" }, { 名: "すぎ", 箱: "植物" }] }
    ],
    例: { 題: "生きもの しわけ", 箱: ["こん虫", "ほ乳類"], 品: [{ 名: "カブトムシ", 箱: "こん虫" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "0/" + d.品.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-center" id="kNow"></div><div id="kBox" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kNow{font-size:clamp(22px,5.5vw,38px);font-weight:800;min-height:1.4em;text-align:center;word-break:break-word}"
          + "#kBox{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}"
          + ".bx{min-height:80px;border-radius:var(--k-r);border:2px dashed var(--k-line);background:var(--k-surface);"
          + "padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:700}"
          + ".bx .n{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub);font-weight:600}"
          + ".bx.o{border-color:var(--k-good)}.bx.x{border-color:var(--k-bad)}",
        js: "var BX=" + JSON.stringify(d.箱) + ",IT=" + JSON.stringify(d.品) + ";\n"
          + "var q=[],i=0,sc=0,cnt={};\n"
          + "function build(){q=K.shuffle(IT.slice());i=0;sc=0;cnt={};\n"
          + "  var b=K.$('#kBox');b.innerHTML='';BX.forEach(function(t){cnt[t]=0;\n"
          + "    var e=document.createElement('button');e.className='bx';e.dataset.t=t;\n"
          + "    e.innerHTML='<span>'+K.esc(t)+'</span><span class=\"n\">0</span>';\n"
          + "    e.onclick=function(){pick(e,t);};b.appendChild(e);});\n"
          + "  K.$('#kS').textContent='0 問 正解';draw();}\n"
          + "function draw(){K.$('#kQ').textContent=i+'/'+q.length;\n"
          + "  K.$('#kNow').textContent=i<q.length?q[i].名:'おわり';}\n"
          + "function pick(e,t){if(i>=q.length)return;var ok=q[i].箱===t;if(ok)sc++;\n"
          + "  cnt[t]++;e.querySelector('.n').textContent=cnt[t];\n"
          + "  e.classList.add(ok?'o':'x');setTimeout(function(){e.classList.remove('o','x');},380);\n"
          + "  K.$('#kS').textContent=sc+' 問 正解';i++;\n"
          + "  if(i>=q.length){K.$('#kNow').innerHTML='<span class=\"k-big\">'+sc+' / '+q.length+'</span>';\n"
          + "    K.$('#kQ').textContent=q.length+'/'+q.length;return;}draw();}\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑰ timeline — 年表ならべ ═══════════════════════════════════ */
  芯.timeline = {
    名: "年表ならべ", 分類: "まなび",
    語: ["年表", "歴史", "年代", "順番", "いつ", "timeline", "出来事", "古い順", "時代"],
    説明: "出来事を 古い順に ならべる。答え合わせで 年も 出す。",
    スロット: [題, 副,
      { 鍵: "出来事", 型: "表", 必須: ["名"], 最大: 24, 形: { 名: "文", 年: "数", 説明: "文" },
        説: "1 件 ＝ {名, 年, 説明}。年は 数字（西暦）",
        既定: [{ 名: "大化の改新", 年: 645 }, { 名: "鎌倉幕府", 年: 1192 }, { 名: "明治維新", 年: 1868 }] }
    ],
    例: { 題: "日本史の 流れ", 出来事: [{ 名: "応仁の乱", 年: 1467, 説明: "京都が 焼けた" }] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/" + d.出来事.length], ["kM", ""]]),
        中: '<div id="kLine" class="k-gr"></div><div id="kPool" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kOk">たしかめる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kLine,#kPool{grid-template-columns:1fr}"
          + "#kLine{border-left:3px solid var(--k-line);padding-left:12px;min-height:44px}"
          + ".ev{min-height:46px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;font-weight:600;word-break:break-word}"
          + ".ev .y{font-size:calc(var(--k-fs) - 3px);color:var(--k-sub);font-weight:600;margin-left:8px}"
          + ".ev.in{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".ev.in .y{color:var(--k-ink);opacity:.8}"
          + ".ev.o{background:var(--k-good);color:#fff;border-color:transparent}"
          + ".ev.x{background:var(--k-bad);color:#fff;border-color:transparent}"
          + ".ev.o .y,.ev.x .y{color:#fff;opacity:.85}",
        js: "var EV=" + JSON.stringify(d.出来事) + ";\n"
          + "var ANS=EV.slice().sort(function(a,b){return (a.年||0)-(b.年||0);});\nvar put=[];\n"
          + "function build(){put=[];K.$('#kLine').innerHTML='';K.$('#kM').textContent='';\n"
          + "  K.$('#kP').textContent='0/'+EV.length;var p=K.$('#kPool');p.innerHTML='';\n"
          + "  K.shuffle(EV.slice()).forEach(function(e){var b=document.createElement('button');b.className='ev';\n"
          + "    b.textContent=e.名;b.onclick=function(){if(b.dataset.u)return;b.dataset.u='1';b.classList.add('in');\n"
          + "      put.push(e);line();};p.appendChild(b);});}\n"
          + "function line(){var L=K.$('#kLine');L.innerHTML='';\n"
          + "  put.forEach(function(e,i){var d2=document.createElement('div');d2.className='ev in';\n"
          + "    d2.innerHTML=(i+1)+'. '+K.esc(e.名);L.appendChild(d2);});\n"
          + "  K.$('#kP').textContent=put.length+'/'+EV.length;}\n"
          + "K.$('#kOk').onclick=function(){var n=0;var L=K.$('#kLine');L.innerHTML='';\n"
          + "  put.forEach(function(e,i){var ok=ANS[i]&&ANS[i].名===e.名;if(ok)n++;\n"
          + "    var d2=document.createElement('div');d2.className='ev '+(ok?'o':'x');\n"
          + "    d2.innerHTML=(i+1)+'. '+K.esc(e.名)+'<span class=\"y\">'+(e.年||'')+(e.説明?' ・ '+K.esc(e.説明):'')+'</span>';\n"
          + "    L.appendChild(d2);});\n"
          + "  K.$('#kM').textContent=n+' / '+EV.length+' 正しい';};\n"
          + "K.$('#kGo').onclick=build;build();"
      };
    }
  };

  /* ══ ⑱ dictation — 聞きとり ═══════════════════════════════════ */
  芯.dictation = {
    名: "聞きとり", 分類: "まなび",
    語: ["聞き取り", "リスニング", "ディクテーション", "読み上げ", "音", "listening", "書き取り", "発音"],
    説明: "読み上げを 聞いて 書き取る。何度でも 聞き直せる。",
    スロット: [題, 副,
      { 鍵: "文", 型: "表", 必須: ["文"], 最大: 60, 形: { 文: "文", 訳: "文" },
        説: "1 問 ＝ {文, 訳}。文が 読み上げられる",
        既定: [{ 文: "I go to school every day.", 訳: "私は 毎日 学校へ 行く。" }] },
      { 鍵: "ことば", 型: "選", 候補: ["英語", "日本語"], 既定: "英語", 説: "読み上げる ことば" },
      { 鍵: "はやさ", 型: "数", 既定: 90, 最小: 50, 最大: 150, 説: "読む 速さ（100 が ふつう）" }
    ],
    例: { 題: "英文 聞き取り", 文: [{ 文: "She lives in Osaka.", 訳: "彼女は 大阪に 住んでいる。" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/" + d.文.length], ["kS", "0 問 正解"]]),
        中: '<div class="k-center"><button class="k-btn pri" id="kPlay" style="min-height:64px;min-width:180px;font-size:calc(var(--k-fs) + 3px)">きく</button>'
          + '<input class="k-in" id="kIn" autocomplete="off" placeholder="聞こえたとおりに 書く" style="max-width:520px">'
          + '<div class="k-note" id="kMsg"></div></div><div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn" id="kOk">たしかめる</button><button class="k-btn" id="kNext">つぎへ</button>'
          + '<button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kExp b{font-size:calc(var(--k-fs) + 2px)}",
        js: "var S=" + JSON.stringify(d.文) + ",LANG=" + JSON.stringify(d.ことば === "英語" ? "en-US" : "ja-JP")
          + ",RATE=" + (d.はやさ / 100) + ";\nvar i=0,sc=0,done=0;\n"
          + "function say(){var t=(S[i]||{}).文||'';\n"
          + "  try{var u=new SpeechSynthesisUtterance(t);u.lang=LANG;u.rate=RATE;\n"
          + "    speechSynthesis.cancel();speechSynthesis.speak(u);K.$('#kMsg').textContent='';}\n"
          + "  catch(e){K.$('#kMsg').textContent='この端末では 読み上げられません。下に 文を 出します。';\n"
          + "    K.$('#kExp').classList.remove('k-hide');K.$('#kExp').innerHTML='<b>'+K.esc(t)+'</b>';}}\n"
          + "function draw(){done=0;K.$('#kQ').textContent=(i+1)+'/'+S.length;K.$('#kIn').value='';\n"
          + "  K.$('#kExp').classList.add('k-hide');K.$('#kMsg').textContent='';K.$('#kIn').focus();say();}\n"
          + "function norm(s){return String(s||'').toLowerCase().replace(/[.,!?;:\\u3001\\u3002]/g,'').replace(/\\s+/g,' ').trim();}\n"
          + "function check(){if(done)return;done=1;var q=S[i]||{文:''};\n"
          + "  var ok=norm(K.$('#kIn').value)===norm(q.文);if(ok)sc++;K.$('#kS').textContent=sc+' 問 正解';\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b class=\"'+(ok?'k-good':'k-bad')+'\">'+(ok?'せいかい':'ほんとうは')+'</b>'\n"
          + "    +'<div style=\"margin-top:6px\">'+K.esc(q.文)+'</div>'\n"
          + "    +(q.訳?'<div class=\"k-note\" style=\"margin-top:4px\">'+K.esc(q.訳)+'</div>':'');}\n"
          + "K.$('#kPlay').onclick=say;K.$('#kOk').onclick=check;\n"
          + "K.$('#kIn').addEventListener('keydown',function(e){if(e.key==='Enter')check();});\n"
          + "K.$('#kNext').onclick=function(){if(!done){check();return;}i++;\n"
          + "  if(i>=S.length){K.$('#kMsg').innerHTML='<span class=\"k-big\">'+sc+' / '+S.length+'</span>';return;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;sc=0;K.$('#kS').textContent='0 問 正解';draw();};\n"
          + "K.$('#kQ').textContent='1/'+S.length;"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
