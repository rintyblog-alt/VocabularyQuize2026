/* ══════════════════════════════════════════════════════════════════════════
   core/kata/play.js — 型の 芯（あそび）12 種

   ★ ここに 書いてあるものが **実際に 動く 中身**。
     Lumi は これを 1 行も 書かない。文字と 数と 並び を 入れるだけ。
   ★ どの 芯も 返すのは { 中, 手, 帯, css, js } の 5 つだけ。
     並べるのは base.js の 骨。だから 崩れない。
   ★ js の中では 共通の 道具 K（index.js が 先に 差し込む）が 使える。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});

  /* 共通の スロット */
  var 題 = { 鍵: "題", 型: "文", 既定: "あそぶ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };

  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══════════════════════════════════════════════════════════════════
     ① quiz4 — えらぶ問題（2〜6 択）
     ══════════════════════════════════════════════════════════════════ */
  芯.quiz4 = {
    名: "えらぶ問題", 分類: "あそび",
    語: ["クイズ", "4択", "選択", "問題", "テスト", "quiz", "選ぶ", "正誤", "○×", "確認テスト"],
    説明: "問題を 1 問ずつ 出して、いくつかの 選択肢から 選ばせる。正解・解説・得点つき。",
    スロット: [題, 副,
      { 鍵: "問題", 型: "表", 必須: ["問", "答"], 最大: 60,
        形: { 問: "文", 答: "文", 選択肢: "並び", 解説: "文" },
        説: "1 問 ＝ {問, 答, 選択肢[], 解説}。答は 選択肢の どれかと 同じ文字にする",
        既定: [{ 問: "日本の首都は？", 答: "東京", 選択肢: ["東京", "大阪", "京都", "札幌"], 解説: "1868 年から。" }] },
      { 鍵: "制限秒", 型: "数", 既定: 0, 最小: 0, 最大: 300, 説: "1 問あたりの 秒数。0 なら 無制限" },
      { 鍵: "混ぜる", 型: "真偽", 既定: true, 説: "出る順と 選択肢の順を 混ぜるか" }
    ],
    例: { 題: "理科 まとめテスト", 問題: [{ 問: "水の沸点は？", 答: "100℃", 選択肢: ["0℃", "50℃", "100℃", "200℃"], 解説: "1 気圧のとき。" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kS", "0 点"], ["kT", ""]]),
        中: '<div class="k-card" id="kBody"></div><div class="k-gr" id="kChoices" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"></div><div class="k-card k-hide" id="kExp"></div>',
        手: '<button class="k-btn pri" id="kNext">つぎへ</button><button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kBody{font-size:calc(var(--k-fs) + 4px);font-weight:600;line-height:1.7}"
          + "#kChoices .k-btn{min-height:52px;width:100%;white-space:normal;line-height:1.4;padding:8px 12px}"
          + ".ans-o{background:var(--k-good) !important;color:#fff !important;border-color:transparent !important}"
          + ".ans-x{background:var(--k-bad) !important;color:#fff !important;border-color:transparent !important}",
        js: "var Q=" + JSON.stringify(d.問題) + ",MIX=" + (d.混ぜる ? "1" : "0") + ",LIM=" + d.制限秒 + ";\n"
          + "var i=0,sc=0,lock=0,tid=0,left=0;\n"
          + "if(MIX)Q=K.shuffle(Q.slice());\n"
          + "function opts(q){var o=(q.選択肢||[]).slice();if(!o.length)o=[q.答];if(o.indexOf(q.答)<0)o.unshift(q.答);return MIX?K.shuffle(o):o;}\n"
          + "function draw(){lock=0;clearInterval(tid);var q=Q[i];\n"
          + "  K.$('#kQ').textContent=(i+1)+'/'+Q.length;K.$('#kS').textContent=sc+' 点';\n"
          + "  K.$('#kBody').textContent=q.問;K.$('#kExp').classList.add('k-hide');\n"
          + "  var c=K.$('#kChoices');c.innerHTML='';\n"
          + "  opts(q).forEach(function(t){var b=document.createElement('button');b.className='k-btn';b.textContent=t;\n"
          + "    b.onclick=function(){pick(b,t,q);};c.appendChild(b);});\n"
          + "  if(LIM>0){left=LIM;K.$('#kT').textContent=left+' 秒';tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0){clearInterval(tid);pick(null,'',q);}},1000);}\n"
          + "  else K.$('#kT').textContent='';}\n"
          + "function pick(b,t,q){if(lock)return;lock=1;clearInterval(tid);\n"
          + "  var ok=t===q.答;if(ok)sc++;K.$('#kS').textContent=sc+' 点';\n"
          /* ★ 空の 名前を classList.add に 渡すと **その場で 落ちる**（実測）。
             どちらでもない ボタンには 何も 付けない。 */
          + "  K.$$('#kChoices .k-btn').forEach(function(x){var c=x.textContent===q.答?'ans-o':(x===b?'ans-x':'');if(c)x.classList.add(c);});\n"
          + "  var e=K.$('#kExp');e.classList.remove('k-hide');\n"
          + "  e.innerHTML='<b>'+(ok?'せいかい':'こたえ: '+K.esc(q.答))+'</b>'+(q.解説?'<div class=\"k-note\" style=\"margin-top:6px\">'+K.esc(q.解説)+'</div>':'');}\n"
          + "function next(){if(!lock&&Q[i]){pick(null,'',Q[i]);return;}i++;if(i>=Q.length){done();return;}draw();}\n"
          + "function done(){K.$('#kChoices').innerHTML='';K.$('#kExp').classList.add('k-hide');\n"
          + "  K.$('#kBody').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+sc+' / '+Q.length+'</div><div class=\"k-note\">おつかれさま</div></div>';}\n"
          + "K.$('#kNext').onclick=next;K.$('#kAgain').onclick=function(){i=0;sc=0;if(MIX)Q=K.shuffle(Q);draw();};\n"
          + "draw();"
      };
    }
  };

  /* ══ ② flash — 単語カード ═══════════════════════════════════════ */
  芯.flash = {
    名: "単語カード", 分類: "あそび",
    語: ["単語カード", "フラッシュカード", "暗記", "めくる", "英単語", "flashcard", "覚える", "反復"],
    説明: "表を見て 考えて、めくって 答え合わせ。覚えた／まだ で 仕分ける。",
    スロット: [題, 副,
      { 鍵: "カード", 型: "表", 必須: ["表", "裏"], 最大: 200, 形: { 表: "文", 裏: "文", 補足: "文" },
        説: "1 枚 ＝ {表, 裏, 補足}",
        既定: [{ 表: "apple", 裏: "りんご", 補足: "" }, { 表: "dog", 裏: "犬", 補足: "" }] },
      { 鍵: "混ぜる", 型: "真偽", 既定: true, 説: "順番を 混ぜるか" }
    ],
    例: { 題: "英単語 1 章", カード: [{ 表: "increase", 裏: "を増やす" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kO", "覚えた 0"]]),
        中: '<div class="k-card" id="kCard"><div id="kFront"></div><div id="kBack" class="k-hide"></div></div>',
        手: '<button class="k-btn pri" id="kFlip">めくる</button>'
          + '<button class="k-btn" id="kOk">覚えた</button><button class="k-btn" id="kNg">まだ</button>'
          + '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kCard{min-height:min(46vh,300px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;cursor:pointer}"
          + "#kFront{font-size:clamp(24px,6vw,42px);font-weight:800;line-height:1.25}"
          + "#kBack{font-size:clamp(19px,4.4vw,28px);font-weight:600;color:var(--k-accent)}"
          + "#kBack .sub{display:block;font-size:var(--k-fs);color:var(--k-sub);font-weight:400;margin-top:6px}",
        js: "var CARDS=" + JSON.stringify(d.カード) + ",MIX=" + (d.混ぜる ? "1" : "0") + ";\n"
          + "var C=MIX?K.shuffle(CARDS.slice()):CARDS.slice();\nvar i=0,ok=0,open=0;\n"
          + "function draw(){open=0;var c=C[i]||{表:'',裏:''};K.$('#kQ').textContent=(i+1)+'/'+C.length;\n"
          + "  K.$('#kO').textContent='覚えた '+ok;K.$('#kFront').textContent=c.表;\n"
          + "  K.$('#kBack').innerHTML=K.esc(c.裏)+(c.補足?'<span class=\"sub\">'+K.esc(c.補足)+'</span>':'');\n"
          + "  K.$('#kBack').classList.add('k-hide');}\n"
          + "function flip(){open=!open;K.$('#kBack').classList.toggle('k-hide',!open);}\n"
          + "function go(g){if(g)ok++;i++;\n"
          + "  if(i>=C.length){K.$('#kCard').innerHTML='<div class=\"k-center\"><div class=\"k-big\">'+ok+' / '+C.length+'</div><div class=\"k-note\">覚えた かず</div></div>';\n"
          + "    K.$('#kO').textContent='覚えた '+ok;return;}draw();}\n"
          + "function again(){i=0;ok=0;C=MIX?K.shuffle(CARDS.slice()):CARDS.slice();\n"
          + "  K.$('#kCard').innerHTML='<div id=\"kFront\"></div><div id=\"kBack\" class=\"k-hide\"></div>';\n"
          + "  K.$('#kCard').onclick=flip;draw();}\n"
          + "K.$('#kFlip').onclick=flip;K.$('#kCard').onclick=flip;\n"
          + "K.$('#kOk').onclick=function(){go(1);};K.$('#kNg').onclick=function(){go(0);};\n"
          + "K.$('#kAgain').onclick=again;\ndraw();"
      };
    }
  };

  /* ══ ③ pair — 神経衰弱（絵合わせ）═══════════════════════════════ */
  芯.pair = {
    名: "絵合わせ", 分類: "あそび",
    語: ["神経衰弱", "絵合わせ", "ペア", "記憶", "めくって合わせる", "memory", "対応", "組み合わせ"],
    説明: "裏返した札を 2 枚ずつ めくって、対に なるものを そろえる。",
    スロット: [題, 副,
      { 鍵: "対", 型: "表", 必須: ["左", "右"], 最大: 18, 形: { 左: "文", 右: "文" },
        説: "1 組 ＝ {左, 右}。同じ意味の 2 つを 入れる（英語と 日本語 など）",
        既定: [{ 左: "犬", 右: "dog" }, { 左: "猫", 右: "cat" }, { 左: "鳥", 右: "bird" }, { 左: "魚", 右: "fish" }] }
    ],
    例: { 題: "英単語 絵合わせ", 対: [{ 左: "山", 右: "mountain" }] },
    作る: function (d) {
      return {
        帯: 帯([["kM", "0 手"], ["kP", "0 組"]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kBoard{grid-template-columns:repeat(auto-fit,minmax(84px,1fr));align-content:start}"
          + ".cell{aspect-ratio:1/1;border-radius:calc(var(--k-r) - 2px);background:var(--k-accent);color:var(--k-ink);"
          + "display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font-weight:700;"
          + "font-size:calc(var(--k-fs) - 1px);line-height:1.25;word-break:break-word;overflow:hidden;transition:.15s}"
          + ".cell.up{background:var(--k-surface);color:var(--k-text);border:1px solid var(--k-line)}"
          + ".cell.got{background:var(--k-good);color:#fff;pointer-events:none}",
        js: "var P=" + JSON.stringify(d.対) + ";\nvar cards=[],a=null,b=null,mv=0,got=0,lock=0;\n"
          + "function build(){cards=[];P.forEach(function(p,n){cards.push({k:n,t:p.左});cards.push({k:n,t:p.右});});\n"
          + "  cards=K.shuffle(cards);mv=0;got=0;a=b=null;lock=0;\n"
          + "  var bd=K.$('#kBoard');bd.innerHTML='';\n"
          + "  cards.forEach(function(c,idx){var e=document.createElement('button');e.className='cell';e.dataset.i=idx;\n"
          + "    e.textContent='?';e.onclick=function(){tap(e,c);};bd.appendChild(e);});\n"
          + "  K.$('#kM').textContent='0 手';K.$('#kP').textContent='0 組';}\n"
          + "function tap(e,c){if(lock||e.classList.contains('up')||e.classList.contains('got'))return;\n"
          + "  e.classList.add('up');e.textContent=c.t;\n"
          + "  if(!a){a={e:e,c:c};return;}b={e:e,c:c};mv++;K.$('#kM').textContent=mv+' 手';lock=1;\n"
          /* ★ 700ms の 戻しは **その場の 控え**で 持つ。
             はじめから を 押されると a・b は 空に なるので、
             共有の 入れ物を 見ていると そこで 落ちる（実測）。 */
          + "  var A=a,B=b;a=b=null;\n"
          + "  if(A.c.k===B.c.k&&A.e!==B.e){A.e.classList.add('got');B.e.classList.add('got');got++;\n"
          + "    K.$('#kP').textContent=got+' 組';lock=0;\n"
          + "    if(got===P.length)setTimeout(function(){var bd=K.$('#kBoard');if(bd)bd.innerHTML='<div class=\"k-center\" style=\"grid-column:1/-1\"><div class=\"k-big\">そろった</div><div class=\"k-note\">'+mv+' 手</div></div>';},260);return;}\n"
          + "  setTimeout(function(){if(A.e&&A.e.isConnected){A.e.classList.remove('up');A.e.textContent='?';}\n"
          + "    if(B.e&&B.e.isConnected){B.e.classList.remove('up');B.e.textContent='?';}lock=0;},700);}\n"
          + "K.$('#kAgain').onclick=build;build();"
      };
    }
  };

  /* ══ ④ type — タイピング ═══════════════════════════════════════ */
  芯.type = {
    名: "タイピング", 分類: "あそび",
    語: ["タイピング", "打つ", "入力", "typing", "キーボード", "速さ", "スペル", "つづり"],
    説明: "出てくる 言葉を 打ち込む。正しく 打てた数と 速さが 出る。",
    スロット: [題, 副,
      { 鍵: "言葉", 型: "並び", 最大: 200, 上限: 60, 既定: ["apple", "banana", "orange", "grape"],
        説: "打たせたい 言葉の 並び" },
      { 鍵: "秒数", 型: "数", 既定: 60, 最小: 10, 最大: 600, 説: "遊べる 秒数" }
    ],
    例: { 題: "英単語 タイピング", 言葉: ["increase", "prevent", "observe"], 秒数: 60 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kT", d.秒数 + " 秒"]]),
        中: '<div class="k-center"><div id="kWord"></div><input class="k-in" id="kIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ここに 打つ" style="max-width:420px;text-align:center;font-size:calc(var(--k-fs) + 3px)"><div class="k-note" id="kMsg">はじめの 1 字を 打つと 始まります</div></div>',
        手: '<button class="k-btn ghost" id="kAgain">はじめから</button>',
        css: "#kWord{font-size:clamp(28px,7vw,52px);font-weight:800;letter-spacing:.02em;line-height:1.2;word-break:break-all}"
          + "#kWord .ok{color:var(--k-good)}#kWord .ng{color:var(--k-bad);text-decoration:underline}",
        js: "var W=" + JSON.stringify(d.言葉) + ",SEC=" + d.秒数 + ";\n"
          + "var list=K.shuffle(W.slice()),i=0,sc=0,miss=0,run=0,left=SEC,tid=0;\n"
          + "function show(){var w=list[i%list.length]||'';var v=K.$('#kIn').value;\n"
          + "  var h='';for(var n=0;n<w.length;n++){var c=K.esc(w[n]);\n"
          + "    h+= n<v.length ? (v[n]===w[n]?'<span class=\"ok\">'+c+'</span>':'<span class=\"ng\">'+c+'</span>') : c;}\n"
          + "  K.$('#kWord').innerHTML=h;}\n"
          + "function start(){if(run)return;run=1;K.$('#kMsg').textContent='';\n"
          + "  tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0)end();},1000);}\n"
          + "function end(){clearInterval(tid);run=0;K.$('#kIn').disabled=true;\n"
          + "  var wpm=Math.round(sc/Math.max(1,SEC)*60);\n"
          + "  K.$('#kWord').innerHTML='<span class=\"k-big\">'+sc+'</span>';\n"
          + "  K.$('#kMsg').textContent='1 分あたり '+wpm+' 語 ／ 打ちまちがい '+miss;}\n"
          + "K.$('#kIn').addEventListener('input',function(){start();var w=list[i%list.length]||'';var v=K.$('#kIn').value;\n"
          + "  if(v.length&&w.indexOf(v)!==0)miss++;\n"
          + "  if(v===w){sc++;i++;K.$('#kS').textContent=sc;K.$('#kIn').value='';}show();});\n"
          + "K.$('#kAgain').onclick=function(){clearInterval(tid);list=K.shuffle(W.slice());i=0;sc=0;miss=0;left=SEC;run=0;\n"
          + "  K.$('#kIn').disabled=false;K.$('#kIn').value='';K.$('#kS').textContent='0';K.$('#kT').textContent=SEC+' 秒';\n"
          + "  K.$('#kMsg').textContent='はじめの 1 字を 打つと 始まります';show();K.$('#kIn').focus();};\n"
          + "show();setTimeout(function(){K.$('#kIn').focus();},100);"
      };
    }
  };

  /* ══ ⑤ mole — もぐらたたき ═════════════════════════════════════ */
  芯.mole = {
    名: "もぐらたたき", 分類: "あそび",
    語: ["もぐらたたき", "たたく", "反射", "素早く", "whack", "反応", "当てる", "瞬発"],
    説明: "穴から 出てくるものを 押す。合っているものだけ 押すと 点が 入る。",
    スロット: [題, 副,
      { 鍵: "あたり", 型: "並び", 最大: 40, 上限: 20, 既定: ["○"], 説: "押すと 点が 入るもの" },
      { 鍵: "はずれ", 型: "並び", 最大: 40, 上限: 20, 既定: ["×"], 説: "押すと 点が 減るもの" },
      { 鍵: "秒数", 型: "数", 既定: 45, 最小: 10, 最大: 300 },
      { 鍵: "はやさ", 型: "数", 既定: 900, 最小: 300, 最大: 2500, 説: "出てくる 間隔（ミリ秒）。小さいほど 速い" }
    ],
    例: { 題: "偶数を たたけ", あたり: ["2", "4", "6", "8"], はずれ: ["1", "3", "5"], 秒数: 45 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 点"], ["kT", d.秒数 + " 秒"]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button>',
        css: "#kBoard{grid-template-columns:repeat(3,1fr);align-content:center;height:100%}"
          + ".hole{aspect-ratio:1/1;border-radius:50%;background:var(--k-line);display:flex;align-items:center;justify-content:center;"
          + "font-size:clamp(20px,5vw,34px);font-weight:800;color:transparent;transition:.12s;overflow:hidden;padding:6px;text-align:center}"
          + ".hole.up{background:var(--k-accent);color:var(--k-ink)}.hole.hit{background:var(--k-good);color:#fff}"
          + ".hole.bad{background:var(--k-bad);color:#fff}",
        js: "var A=" + JSON.stringify(d.あたり) + ",B=" + JSON.stringify(d.はずれ) + ",SEC=" + d.秒数 + ",SP=" + d.はやさ + ";\n"
          + "var holes=[],sc=0,left=SEC,run=0,t1=0,t2=0;\n"
          + "var bd=K.$('#kBoard');for(var n=0;n<9;n++){var e=document.createElement('button');e.className='hole';e.dataset.v='';\n"
          + "  e.onclick=(function(el){return function(){hit(el);};})(e);bd.appendChild(e);holes.push(e);}\n"
          + "function hit(e){if(!run||!e.classList.contains('up'))return;var good=e.dataset.g==='1';\n"
          + "  sc+=good?1:-1;K.$('#kS').textContent=sc+' 点';e.classList.remove('up');e.classList.add(good?'hit':'bad');\n"
          + "  setTimeout(function(){e.classList.remove('hit','bad');e.textContent='';},220);}\n"
          + "function pop(){holes.forEach(function(e){e.classList.remove('up');e.textContent='';});\n"
          + "  var e=holes[Math.floor(Math.random()*holes.length)];var g=Math.random()<0.6||!B.length;\n"
          + "  var src=g?A:B;if(!src.length)src=A.concat(B);\n"
          + "  e.dataset.g=g?'1':'0';e.textContent=src[Math.floor(Math.random()*src.length)]||'';e.classList.add('up');}\n"
          + "function go(){if(run)return;run=1;sc=0;left=SEC;K.$('#kS').textContent='0 点';K.$('#kGo').textContent='やりなおす';\n"
          + "  clearInterval(t1);clearInterval(t2);t1=setInterval(pop,SP);\n"
          + "  t2=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';if(left<=0)end();},1000);pop();}\n"
          + "function end(){run=0;clearInterval(t1);clearInterval(t2);\n"
          + "  holes.forEach(function(e){e.classList.remove('up');e.textContent='';});\n"
          + "  holes[4].classList.add('up');holes[4].textContent=sc;K.$('#kGo').textContent='もう一度';}\n"
          + "K.$('#kGo').onclick=function(){run=0;go();};"
      };
    }
  };

  /* ══ ⑥ catch — 落ちものキャッチ ═══════════════════════════════ */
  芯.catch = {
    名: "落ちものキャッチ", 分類: "あそび",
    語: ["落ちもの", "キャッチ", "受ける", "よける", "動かす", "catch", "落ちてくる", "かご"],
    説明: "上から 落ちてくるものを 下の かごで 受ける。合うものだけ 受ける。",
    スロット: [題, 副,
      { 鍵: "あたり", 型: "並び", 最大: 40, 上限: 12, 既定: ["◯"], 説: "受けると 点が 入るもの" },
      { 鍵: "はずれ", 型: "並び", 最大: 40, 上限: 12, 既定: ["✕"], 説: "受けると 点が 減るもの" },
      { 鍵: "秒数", 型: "数", 既定: 60, 最小: 10, 最大: 300 }
    ],
    例: { 題: "母音を あつめろ", あたり: ["a", "i", "u", "e", "o"], はずれ: ["k", "s", "t"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 点"], ["kT", d.秒数 + " 秒"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">左右に 動かす（指・矢印キー）</span>',
        css: "#kStage{flex:1;min-height:200px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var A=" + JSON.stringify(d.あたり) + ",B=" + JSON.stringify(d.はずれ) + ",SEC=" + d.秒数 + ";\n"
          + "var cv=K.canvas(K.$('#kC')),sc=0,left=SEC,run=0,px=0.5,items=[],tid=0,acc=0;\n"
          + "K.drag(K.$('#kStage'),function(x){px=x;});\n"
          + "K.keys(function(k){if(k==='ArrowLeft')px=Math.max(0,px-0.07);if(k==='ArrowRight')px=Math.min(1,px+0.07);});\n"
          + "function spawn(){var g=Math.random()<0.62||!B.length;var src=g?A:B;if(!src.length)src=A.concat(B);\n"
          + "  items.push({x:0.08+Math.random()*0.84,y:-0.05,g:g,t:src[Math.floor(Math.random()*src.length)]||'',v:0.0035+Math.random()*0.004});}\n"
          + "cv.loop(function(ctx,w,h,dt){ctx.clearRect(0,0,w,h);\n"
          + "  var cs=K.css('--k-text'),ac=K.css('--k-accent'),gd=K.css('--k-good'),bd=K.css('--k-bad');\n"
          + "  if(run){acc+=dt;if(acc>620){acc=0;spawn();}}\n"
          + "  var by=h-26,bw=Math.max(56,w*0.16);\n"
          + "  ctx.fillStyle=ac;ctx.beginPath();ctx.roundRect(px*w-bw/2,by,bw,16,8);ctx.fill();\n"
          + "  ctx.font='600 '+Math.round(Math.min(26,h*0.07))+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "  for(var i=items.length-1;i>=0;i--){var it=items[i];if(run)it.y+=it.v*dt;\n"
          + "    var x=it.x*w,y=it.y*h;ctx.fillStyle=it.g?gd:bd;ctx.fillText(it.t,x,y);\n"
          + "    if(y>by-8&&y<by+22&&Math.abs(x-px*w)<bw/2+10){sc+=it.g?1:-1;K.$('#kS').textContent=sc+' 点';items.splice(i,1);continue;}\n"
          + "    if(y>h+30)items.splice(i,1);}\n"
          + "  if(!run){ctx.fillStyle=cs;ctx.font='700 '+Math.round(Math.min(30,h*0.09))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(left<=0?('けっか '+sc+' 点'):'はじめる を おす',w/2,h/2);}});\n"
          + "function go(){run=1;sc=0;left=SEC;items=[];K.$('#kS').textContent='0 点';K.$('#kGo').textContent='やりなおす';\n"
          + "  clearInterval(tid);tid=setInterval(function(){left--;K.$('#kT').textContent=left+' 秒';\n"
          + "    if(left<=0){run=0;clearInterval(tid);K.$('#kGo').textContent='もう一度';}},1000);}\n"
          + "K.$('#kGo').onclick=go;"
      };
    }
  };

  /* ══ ⑦ snake — へび ═══════════════════════════════════════════ */
  芯.snake = {
    名: "へび", 分類: "あそび",
    語: ["へび", "スネーク", "snake", "のびる", "food", "むかしのゲーム", "方向"],
    説明: "えさを 取って のびる。壁と 自分に ぶつかると おわり。",
    スロット: [題, 副,
      { 鍵: "ます", 型: "数", 既定: 16, 最小: 8, 最大: 28, 説: "盤の 一辺の ます目" },
      { 鍵: "はやさ", 型: "数", 既定: 140, 最小: 60, 最大: 400, 説: "1 こま の ミリ秒。小さいほど 速い" }
    ],
    例: { 題: "へび", ます: 16 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kL", "長さ 3"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">矢印キー・画面を なぞる</span>',
        css: "#kStage{flex:1;min-height:200px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var N=" + d.ます + ",SP=" + d.はやさ + ";\nvar cv=K.canvas(K.$('#kC'));\n"
          + "var s=[],dir={x:1,y:0},nd={x:1,y:0},food={x:0,y:0},sc=0,run=0,acc=0;\n"
          + "function reset(){s=[{x:2,y:2},{x:1,y:2},{x:0,y:2}];dir={x:1,y:0};nd=dir;sc=0;place();\n"
          + "  K.$('#kS').textContent='0';K.$('#kL').textContent='長さ '+s.length;}\n"
          + "function place(){for(var t=0;t<400;t++){var p={x:(Math.random()*N)|0,y:(Math.random()*N)|0};\n"
          + "  if(!s.some(function(q){return q.x===p.x&&q.y===p.y;})){food=p;return;}}}\n"
          + "function turn(x,y){if(x===-dir.x&&y===-dir.y)return;nd={x:x,y:y};}\n"
          + "K.keys(function(k){if(k==='ArrowLeft')turn(-1,0);if(k==='ArrowRight')turn(1,0);if(k==='ArrowUp')turn(0,-1);if(k==='ArrowDown')turn(0,1);});\n"
          + "K.swipe(K.$('#kStage'),turn);\n"
          + "function step(){dir=nd;var h={x:s[0].x+dir.x,y:s[0].y+dir.y};\n"
          + "  if(h.x<0||h.y<0||h.x>=N||h.y>=N||s.some(function(q){return q.x===h.x&&q.y===h.y;})){run=0;K.$('#kGo').textContent='もう一度';return;}\n"
          + "  s.unshift(h);if(h.x===food.x&&h.y===food.y){sc++;K.$('#kS').textContent=sc;place();}else s.pop();\n"
          + "  K.$('#kL').textContent='長さ '+s.length;}\n"
          + "cv.loop(function(ctx,w,h2,dt){var m=Math.min(w,h2),c=Math.floor(m/N),ox=(w-c*N)/2,oy=(h2-c*N)/2;\n"
          + "  ctx.clearRect(0,0,w,h2);if(run){acc+=dt;if(acc>=SP){acc=0;step();}}\n"
          + "  ctx.fillStyle=K.css('--k-line');ctx.fillRect(ox,oy,c*N,c*N);\n"
          + "  ctx.fillStyle=K.css('--k-bad');ctx.beginPath();ctx.arc(ox+food.x*c+c/2,oy+food.y*c+c/2,c*0.32,0,7);ctx.fill();\n"
          + "  ctx.fillStyle=K.css('--k-accent');s.forEach(function(q,i){ctx.globalAlpha=i?0.85:1;\n"
          + "    ctx.beginPath();ctx.roundRect(ox+q.x*c+1,oy+q.y*c+1,c-2,c-2,Math.max(2,c*0.25));ctx.fill();});ctx.globalAlpha=1;\n"
          + "  if(!run){ctx.fillStyle=K.css('--k-text');ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "    ctx.font='700 '+Math.round(Math.min(28,h2*0.09))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(sc>0?('けっか '+sc):'はじめる を おす',w/2,h2/2);}});\n"
          + "K.$('#kGo').onclick=function(){reset();run=1;K.$('#kGo').textContent='やりなおす';};reset();"
      };
    }
  };

  /* ══ ⑧ breakout — ブロックくずし ═══════════════════════════════ */
  芯.breakout = {
    名: "ブロックくずし", 分類: "あそび",
    語: ["ブロックくずし", "ブロック", "たま", "はねる", "breakout", "パドル", "崩す"],
    説明: "下の 板で たまを はね返して、上の ブロックを 全部 消す。",
    スロット: [題, 副,
      { 鍵: "だん", 型: "数", 既定: 4, 最小: 2, 最大: 8, 説: "ブロックの 段数" },
      { 鍵: "れつ", 型: "数", 既定: 7, 最小: 3, 最大: 12, 説: "ブロックの 列数" },
      { 鍵: "はやさ", 型: "数", 既定: 26, 最小: 12, 最大: 60, 説: "たまの 速さ" }
    ],
    例: { 題: "ブロックくずし", だん: 4, れつ: 7 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kLf", "のこり 3"]]),
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><span class="k-note">左右に 動かす</span>',
        css: "#kStage{flex:1;min-height:220px;position:relative;border-radius:var(--k-r);overflow:hidden;background:var(--k-surface);border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%}",
        js: "var R=" + d.だん + ",C=" + d.れつ + ",SP=" + d.はやさ + "/1000;\nvar cv=K.canvas(K.$('#kC'));\n"
          + "var px=0.5,bx=0.5,by=0.7,vx=SP*0.6,vy=-SP,br=[],sc=0,life=3,run=0;\n"
          + "K.drag(K.$('#kStage'),function(x){px=x;});\n"
          + "K.keys(function(k){if(k==='ArrowLeft')px=Math.max(0,px-0.06);if(k==='ArrowRight')px=Math.min(1,px+0.06);});\n"
          + "function reset(){br=[];for(var r=0;r<R;r++)for(var c=0;c<C;c++)br.push({r:r,c:c,on:1});\n"
          + "  sc=0;life=3;K.$('#kS').textContent='0';K.$('#kLf').textContent='のこり 3';ball();}\n"
          + "function ball(){bx=px;by=0.72;vx=SP*(Math.random()<0.5?-0.6:0.6);vy=-SP;}\n"
          + "cv.loop(function(ctx,w,h,dt){ctx.clearRect(0,0,w,h);var k=Math.min(2.5,dt/16.7);\n"
          + "  var bw=w/C,bh=Math.min(30,h*0.055),top=8;\n"
          + "  br.forEach(function(b){if(!b.on)return;ctx.fillStyle=K.css('--k-accent');ctx.globalAlpha=1-b.r*0.11;\n"
          + "    ctx.beginPath();ctx.roundRect(b.c*bw+2,top+b.r*(bh+3),bw-4,bh,4);ctx.fill();});ctx.globalAlpha=1;\n"
          + "  var pw=Math.max(64,w*0.19),py=h-22;\n"
          + "  ctx.fillStyle=K.css('--k-text');ctx.beginPath();ctx.roundRect(px*w-pw/2,py,pw,12,6);ctx.fill();\n"
          + "  if(run){bx+=vx*k;by+=vy*k*(w/Math.max(1,h));\n"
          + "    if(bx<0.01){bx=0.01;vx=Math.abs(vx);}if(bx>0.99){bx=0.99;vx=-Math.abs(vx);}\n"
          + "    if(by<0.02){by=0.02;vy=Math.abs(vy);}\n"
          + "    var X=bx*w,Y=by*h;\n"
          + "    if(Y>py-8&&Y<py+14&&Math.abs(X-px*w)<pw/2+6&&vy>0){vy=-Math.abs(vy);vx+=(X-px*w)/w*SP*1.4;}\n"
          + "    br.forEach(function(b){if(!b.on)return;var x0=b.c*bw+2,y0=top+b.r*(bh+3);\n"
          + "      if(X>x0&&X<x0+bw-4&&Y>y0&&Y<y0+bh){b.on=0;vy=-vy;sc++;K.$('#kS').textContent=sc;}});\n"
          + "    if(by>1.05){life--;K.$('#kLf').textContent='のこり '+life;if(life<=0){run=0;K.$('#kGo').textContent='もう一度';}else ball();}\n"
          + "    if(!br.some(function(b){return b.on;})){run=0;K.$('#kGo').textContent='もう一度';}}\n"
          + "  ctx.fillStyle=K.css('--k-bad');ctx.beginPath();ctx.arc(bx*w,by*h,Math.max(5,w*0.012),0,7);ctx.fill();\n"
          + "  if(!run){ctx.fillStyle=K.css('--k-text');ctx.textAlign='center';ctx.textBaseline='middle';\n"
          + "    ctx.font='700 '+Math.round(Math.min(26,h*0.08))+'px system-ui,sans-serif';\n"
          + "    ctx.fillText(sc>0?('けっか '+sc):'はじめる を おす',w/2,h*0.62);}});\n"
          + "K.$('#kGo').onclick=function(){reset();run=1;K.$('#kGo').textContent='やりなおす';};reset();"
      };
    }
  };

  /* ══ ⑨ merge2048 — 数をあわせる ═══════════════════════════════ */
  芯.merge2048 = {
    名: "数をあわせる", 分類: "あそび",
    語: ["2048", "合体", "数", "スライド", "パズル", "merge", "同じ数", "倍"],
    説明: "同じ 数どうしを ぶつけて 倍にしていく。4×4 の 盤。",
    スロット: [題, 副,
      { 鍵: "目標", 型: "数", 既定: 2048, 最小: 32, 最大: 8192, 説: "ここまで 行けば 勝ち" }
    ],
    例: { 題: "2048", 目標: 2048 },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0"], ["kB", "最大 0"]]),
        中: '<div id="kBoard"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめから</button><span class="k-note">矢印キー・なぞる</span>',
        css: "#kBoard{margin:auto;width:min(100%,min(72vh,460px));aspect-ratio:1/1;display:grid;grid-template-columns:repeat(4,1fr);"
          + "gap:calc(var(--k-gap) * .6);background:var(--k-line);padding:calc(var(--k-gap) * .6);border-radius:var(--k-r);touch-action:none}"
          + ".tl{border-radius:calc(var(--k-r) - 5px);display:flex;align-items:center;justify-content:center;font-weight:800;"
          + "font-size:clamp(15px,3.6vw,28px);background:var(--k-surface);color:var(--k-text);opacity:.45}"
          + ".tl.on{opacity:1;background:var(--k-accent);color:var(--k-ink)}",
        js: "var GOAL=" + d.目標 + ";\nvar g=[],sc=0,cells=[];\n"
          + "var bd=K.$('#kBoard');for(var i=0;i<16;i++){var e=document.createElement('div');e.className='tl';bd.appendChild(e);cells.push(e);}\n"
          + "function reset(){g=new Array(16).fill(0);sc=0;add();add();draw();}\n"
          + "function add(){var f=[];g.forEach(function(v,i){if(!v)f.push(i);});if(!f.length)return;\n"
          + "  g[f[(Math.random()*f.length)|0]]=Math.random()<0.9?2:4;}\n"
          + "function draw(){var mx=0;g.forEach(function(v,i){mx=Math.max(mx,v);var e=cells[i];\n"
          + "  e.textContent=v?v:'';e.classList.toggle('on',!!v);\n"
          + "  e.style.opacity=v?String(Math.min(1,0.55+Math.log2(v)/12)):'';});\n"
          + "  K.$('#kS').textContent=sc;K.$('#kB').textContent='最大 '+mx;\n"
          + "  if(mx>=GOAL)K.$('#kB').textContent='とうたつ '+mx;}\n"
          + "function line(a){var b=a.filter(function(v){return v;});\n"
          + "  for(var i=0;i<b.length-1;i++){if(b[i]===b[i+1]){b[i]*=2;sc+=b[i];b.splice(i+1,1);}}\n"
          + "  while(b.length<4)b.push(0);return b;}\n"
          + "function move(dx,dy){var before=g.join(',');\n"
          + "  for(var i=0;i<4;i++){var a=[];\n"
          + "    for(var j=0;j<4;j++){var r=dy?j:i,c=dy?i:j;a.push(g[r*4+c]);}\n"
          + "    if(dx>0||dy>0)a.reverse();a=line(a);if(dx>0||dy>0)a.reverse();\n"
          + "    for(var j2=0;j2<4;j2++){var r2=dy?j2:i,c2=dy?i:j2;g[r2*4+c2]=a[j2];}}\n"
          + "  if(g.join(',')!==before){add();}draw();}\n"
          + "K.keys(function(k){if(k==='ArrowLeft')move(-1,0);if(k==='ArrowRight')move(1,0);if(k==='ArrowUp')move(0,-1);if(k==='ArrowDown')move(0,1);});\n"
          + "K.swipe(bd,function(x,y){move(x,y);});\n"
          + "K.$('#kGo').onclick=reset;reset();"
      };
    }
  };

  /* ══ ⑩ memoryseq — 光る順に押す ═══════════════════════════════ */
  芯.memoryseq = {
    名: "光る順に押す", 分類: "あそび",
    語: ["サイモン", "順番", "記憶", "光る", "まねる", "simon", "音", "順序記憶"],
    説明: "光った 順に 押す。1 つずつ 長くなる。",
    スロット: [題, 副,
      { 鍵: "ふだ", 型: "並び", 最大: 9, 上限: 12, 既定: ["あか", "あお", "きいろ", "みどり"], 説: "押す ふだの 名前（4〜9 枚）" }
    ],
    例: { 題: "順番を 覚える", ふだ: ["1", "2", "3", "4"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0 段"], ["kM", ""]]),
        中: '<div id="kBoard" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button>',
        css: "#kBoard{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));align-content:center;height:100%}"
          + ".pd{aspect-ratio:1/1;border-radius:var(--k-r);background:var(--k-surface);border:1px solid var(--k-line);"
          + "font-weight:700;font-size:calc(var(--k-fs) + 1px);display:flex;align-items:center;justify-content:center;"
          + "text-align:center;padding:6px;transition:.1s;word-break:break-word;overflow:hidden}"
          + ".pd.lit{background:var(--k-accent);color:var(--k-ink);transform:scale(.97)}",
        js: "var L=" + JSON.stringify(d.ふだ) + ";\nvar pads=[],seq=[],at=0,lock=1;\n"
          + "var bd=K.$('#kBoard');L.forEach(function(t,i){var e=document.createElement('button');e.className='pd';e.textContent=t;\n"
          + "  e.onclick=function(){tap(i);};bd.appendChild(e);pads.push(e);});\n"
          + "function lit(i,ms){pads[i].classList.add('lit');setTimeout(function(){pads[i].classList.remove('lit');},ms||300);}\n"
          + "function play(){lock=1;K.$('#kM').textContent='見る';var n=0;\n"
          + "  var t=setInterval(function(){if(n>=seq.length){clearInterval(t);lock=0;at=0;K.$('#kM').textContent='どうぞ';return;}\n"
          + "    lit(seq[n],320);n++;},520);}\n"
          + "function tap(i){if(lock)return;lit(i,180);\n"
          + "  if(seq[at]!==i){lock=1;K.$('#kM').textContent='ちがった';K.$('#kGo').textContent='もう一度';return;}\n"
          + "  at++;if(at>=seq.length){K.$('#kS').textContent=seq.length+' 段';setTimeout(next,520);}}\n"
          + "function next(){seq.push((Math.random()*pads.length)|0);play();}\n"
          + "K.$('#kGo').onclick=function(){seq=[];at=0;K.$('#kS').textContent='0 段';K.$('#kGo').textContent='やりなおす';next();};"
      };
    }
  };

  /* ══ ⑪ sortorder — ならべかえ ═════════════════════════════════ */
  芯.sortorder = {
    名: "ならべかえ", 分類: "あそび",
    語: ["並べ替え", "順番", "順序", "ならべる", "時系列", "sort", "手順", "工程", "年代順"],
    説明: "ばらばらの ものを 正しい 順に ならべる。押した 順に 入る。",
    スロット: [題, 副,
      { 鍵: "正しい順", 型: "並び", 最大: 24, 上限: 80, 既定: ["たまごを わる", "かきまぜる", "焼く", "皿に のせる"],
        説: "**正しい順** に 並べて 入れる。画面では 混ぜて 出す" },
      { 鍵: "ヒント", 型: "文", 既定: "", 上限: 120 }
    ],
    例: { 題: "手順を ならべる", 正しい順: ["種をまく", "水をやる", "芽が出る", "花が咲く"] },
    作る: function (d) {
      return {
        帯: 帯([["kS", "0/" + d.正しい順.length], ["kM", ""]]),
        中: '<div class="k-card"><div class="k-note" id="kHint"></div><div id="kSlot" class="k-gr"></div></div>'
          + '<div id="kPool" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kCheck">たしかめる</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kSlot,#kPool{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}"
          + "#kSlot{min-height:46px;margin-top:6px}"
          + ".it{min-height:46px;padding:8px 12px;border-radius:calc(var(--k-r) - 4px);background:var(--k-surface);"
          + "border:1px solid var(--k-line);text-align:left;line-height:1.4;font-weight:600;word-break:break-word}"
          + ".it.in{background:var(--k-accent);color:var(--k-ink);border-color:transparent}"
          + ".it.o{background:var(--k-good);color:#fff;border-color:transparent}"
          + ".it.x{background:var(--k-bad);color:#fff;border-color:transparent}",
        js: "var ANS=" + JSON.stringify(d.正しい順) + ",HINT=" + JSON.stringify(d.ヒント) + ";\nvar put=[];\n"
          + "K.$('#kHint').textContent=HINT||'正しいと 思う 順に おしてください';\n"
          + "function reset(){put=[];var p=K.$('#kPool');p.innerHTML='';K.$('#kSlot').innerHTML='';\n"
          + "  K.$('#kM').textContent='';K.$('#kS').textContent='0/'+ANS.length;\n"
          + "  K.shuffle(ANS.slice()).forEach(function(t){var b=document.createElement('button');b.className='it';b.textContent=t;\n"
          + "    b.onclick=function(){if(b.dataset.used)return;b.dataset.used='1';b.classList.add('in');put.push(t);slot();};p.appendChild(b);});}\n"
          + "function slot(){var s=K.$('#kSlot');s.innerHTML='';put.forEach(function(t,i){var e=document.createElement('div');\n"
          + "  e.className='it in';e.textContent=(i+1)+'. '+t;s.appendChild(e);});K.$('#kS').textContent=put.length+'/'+ANS.length;}\n"
          + "K.$('#kCheck').onclick=function(){var n=0;var s=K.$('#kSlot');s.innerHTML='';\n"
          + "  put.forEach(function(t,i){var ok=ANS[i]===t;if(ok)n++;var e=document.createElement('div');\n"
          + "    e.className='it '+(ok?'o':'x');e.textContent=(i+1)+'. '+t;s.appendChild(e);});\n"
          + "  K.$('#kM').textContent=n+' / '+ANS.length+' 正しい';};\n"
          + "K.$('#kGo').onclick=reset;reset();"
      };
    }
  };

  /* ══ ⑫ hangman — 文字あて ═══════════════════════════════════ */
  芯.hangman = {
    名: "文字あて", 分類: "あそび",
    語: ["文字当て", "hangman", "スペル", "1 文字ずつ", "あてる", "つづり", "虫食い"],
    説明: "隠れた 言葉を 1 文字ずつ あてる。まちがえられるのは 決まった 回数まで。",
    スロット: [題, 副,
      { 鍵: "言葉", 型: "表", 必須: ["語"], 最大: 60, 形: { 語: "文", ヒント: "文" },
        説: "1 問 ＝ {語, ヒント}", 既定: [{ 語: "apple", ヒント: "赤い くだもの" }] },
      { 鍵: "まちがえてよい回数", 型: "数", 既定: 6, 最小: 2, 最大: 12 }
    ],
    例: { 題: "英単語 あてゲーム", 言葉: [{ 語: "science", ヒント: "理科" }] },
    作る: function (d) {
      return {
        帯: 帯([["kQ", "1/1"], ["kL", ""]]),
        中: '<div class="k-center"><div id="kWord"></div><div class="k-note" id="kHint"></div></div><div id="kKeys" class="k-gr"></div>',
        手: '<button class="k-btn pri" id="kNext">つぎへ</button><button class="k-btn ghost" id="kGo">はじめから</button>',
        css: "#kWord{font-size:clamp(24px,6.5vw,46px);font-weight:800;letter-spacing:.14em;word-break:break-all}"
          + "#kKeys{grid-template-columns:repeat(auto-fit,minmax(40px,1fr))}"
          + "#kKeys .k-btn{min-height:40px;padding:0 4px}"
          + "#kKeys .k-btn.used{opacity:.3}",
        js: "var W=" + JSON.stringify(d.言葉) + ",MISS=" + d.まちがえてよい回数 + ";\n"
          + "var i=0,used={},bad=0,done=0;\n"
          + "function cur(){return W[i]||{語:'',ヒント:''};}\n"
          + "function letters(){var s=cur().語.toLowerCase();var out=[];\n"
          + "  for(var n=0;n<s.length;n++){var c=s[n];if(c!==' '&&out.indexOf(c)<0)out.push(c);}\n"
          + "  var az='abcdefghijklmnopqrstuvwxyz'.split('');\n"
          + "  return out.every(function(c){return az.indexOf(c)>=0;})?az:K.shuffle(out.concat(out.slice(0,Math.min(8,out.length))).filter(function(v,n,a){return a.indexOf(v)===n;}));}\n"
          + "function draw(){used={};bad=0;done=0;K.$('#kQ').textContent=(i+1)+'/'+W.length;\n"
          + "  K.$('#kHint').textContent=cur().ヒント||'';show();\n"
          + "  var kb=K.$('#kKeys');kb.innerHTML='';letters().forEach(function(c){var b=document.createElement('button');\n"
          + "    b.className='k-btn';b.textContent=c;b.onclick=function(){hit(c,b);};kb.appendChild(b);});}\n"
          + "function show(){var s=cur().語;var h='';for(var n=0;n<s.length;n++){var c=s[n];\n"
          + "  h+=(c===' ')?'  ':(used[c.toLowerCase()]?K.esc(c):'_');}\n"
          + "  K.$('#kWord').textContent=h;K.$('#kL').textContent='のこり '+(MISS-bad);}\n"
          + "function hit(c,b){if(done||used[c])return;used[c]=1;b.classList.add('used');\n"
          + "  if(cur().語.toLowerCase().indexOf(c)<0){bad++;b.style.opacity='.25';}\n"
          + "  show();\n"
          + "  var all=cur().語.toLowerCase().split('').every(function(x){return x===' '||used[x];});\n"
          + "  if(all){done=1;K.$('#kL').textContent='せいかい';}\n"
          + "  else if(bad>=MISS){done=1;K.$('#kWord').textContent=cur().語;K.$('#kL').textContent='おわり';}}\n"
          + "K.$('#kNext').onclick=function(){i++;if(i>=W.length){i=0;}draw();};\n"
          + "K.$('#kGo').onclick=function(){i=0;draw();};draw();"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
