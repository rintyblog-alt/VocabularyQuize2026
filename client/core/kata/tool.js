/* ══════════════════════════════════════════════════════════════════════════
   core/kata/tool.js — 型の 芯（どうぐ）6 種
   どれも **保存が 効く**（K.save / K.load が 本体の 溜めへ 預ける）。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var E = function (s) { return VQK.逃がす(s); };
  var 芯 = VQK.芯 || (VQK.芯 = {});
  var 題 = { 鍵: "題", 型: "文", 既定: "どうぐ", 上限: 40, 説: "画面の いちばん上に 出す 名前" };
  var 副 = { 鍵: "副", 型: "文", 既定: "", 上限: 60, 説: "その下の 小さな 説明（無くてよい）" };
  function 帯(品) {
    return 品.map(function (p) { return '<span class="k-chip" id="' + p[0] + '">' + E(p[1]) + "</span>"; }).join("");
  }

  /* ══ ⑲ checklist — やることリスト ═══════════════════════════════ */
  芯.checklist = {
    名: "やることリスト", 分類: "どうぐ",
    語: ["チェックリスト", "やること", "todo", "持ち物", "手順", "確認", "リスト", "タスク", "点検"],
    説明: "項目に チェックを 入れていく。足す・消す・並べ替えも できる。閉じても 残る。",
    スロット: [題, 副,
      { 鍵: "項目", 型: "並び", 最大: 100, 上限: 100, 既定: ["教科書", "ノート", "筆記用具"], 説: "はじめから 入れておく 項目" },
      { 鍵: "足せる", 型: "真偽", 既定: true, 説: "使う人が 項目を 足せるように するか" }
    ],
    例: { 題: "遠足の 持ち物", 項目: ["水とう", "おべんとう", "しおり"] },
    作る: function (d) {
      return {
        帯: 帯([["kP", "0/0"]]),
        中: '<div class="k-bar"><i id="kBar" style="width:0%"></i></div><div id="kList" class="k-gr"></div>',
        手: (d.足せる
          ? '<input class="k-in" id="kNew" placeholder="足したいことを 書く" style="flex:1;min-width:160px">'
            + '<button class="k-btn pri" id="kAdd">足す</button>' : "")
          + '<button class="k-btn ghost" id="kClear">ぜんぶ はずす</button>',
        css: "#kList{grid-template-columns:1fr}"
          + ".ck{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:calc(var(--k-r) - 4px);"
          + "background:var(--k-surface);border:1px solid var(--k-line);text-align:left;width:100%}"
          + ".ck .bx{width:24px;height:24px;flex:0 0 auto;border-radius:7px;border:2px solid var(--k-line);"
          + "display:flex;align-items:center;justify-content:center;font-weight:900;color:transparent;font-size:15px}"
          + ".ck.on .bx{background:var(--k-good);border-color:transparent;color:#fff}"
          + ".ck .t{flex:1;min-width:0;line-height:1.45;word-break:break-word}"
          + ".ck.on .t{opacity:.5;text-decoration:line-through}"
          + ".ck .rm{flex:0 0 auto;opacity:.45;padding:2px 8px;border-radius:6px}",
        js: "var INIT=" + JSON.stringify(d.項目) + ",ADD=" + (d.足せる ? "1" : "0") + ";\n"
          + "var L=K.load('list',null)||INIT.map(function(t){return {t:t,on:0};});\n"
          + "function save(){K.save('list',L);}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';var n=0;\n"
          + "  L.forEach(function(it,i){if(it.on)n++;var b=document.createElement('div');b.className='ck'+(it.on?' on':'');\n"
          + "    b.innerHTML='<button class=\"bx\">✓</button><span class=\"t\"></span><button class=\"rm\">✕</button>';\n"
          + "    b.querySelector('.t').textContent=it.t;\n"
          + "    b.querySelector('.bx').onclick=function(){it.on=it.on?0:1;save();draw();};\n"
          + "    b.querySelector('.rm').onclick=function(){L.splice(i,1);save();draw();};\n"
          + "    el.appendChild(b);});\n"
          + "  K.$('#kP').textContent=n+'/'+L.length;\n"
          + "  K.$('#kBar').style.width=(L.length?Math.round(n/L.length*100):0)+'%';}\n"
          + "if(ADD){K.$('#kAdd').onclick=function(){var v=String(K.$('#kNew').value||'').trim();if(!v)return;\n"
          + "  L.push({t:v,on:0});K.$('#kNew').value='';save();draw();};\n"
          + "  K.$('#kNew').addEventListener('keydown',function(e){if(e.key==='Enter')K.$('#kAdd').click();});}\n"
          + "K.$('#kClear').onclick=function(){L.forEach(function(x){x.on=0;});save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ⑳ pomodoro — 集中タイマー ═════════════════════════════════ */
  芯.pomodoro = {
    名: "集中タイマー", 分類: "どうぐ",
    語: ["タイマー", "ポモドーロ", "集中", "休憩", "時間", "timer", "計る", "25分", "勉強時間"],
    説明: "決めた 時間 集中して、決めた 時間 休む。何回 まわったかも 数える。",
    スロット: [題, 副,
      { 鍵: "集中分", 型: "数", 既定: 25, 最小: 1, 最大: 120 },
      { 鍵: "休み分", 型: "数", 既定: 5, 最小: 1, 最大: 60 },
      { 鍵: "音", 型: "真偽", 既定: true, 説: "切り替わるときに 音を 鳴らすか" }
    ],
    例: { 題: "数学に 集中", 集中分: 25, 休み分: 5 },
    作る: function (d) {
      return {
        帯: 帯([["kR", "0 回"], ["kW", "集中"]]),
        中: '<div class="k-center"><div id="kT" class="k-big" style="font-size:clamp(48px,17vw,120px);font-variant-numeric:tabular-nums">25:00</div>'
          + '<div class="k-bar" style="width:min(420px,86%)"><i id="kBar" style="width:0%"></i></div>'
          + '<div class="k-note" id="kMsg">はじめる を おす</div></div>',
        手: '<button class="k-btn pri" id="kGo">はじめる</button><button class="k-btn" id="kSkip">つぎへ</button>'
          + '<button class="k-btn ghost" id="kReset">もどす</button>',
        css: "",
        js: "var W=" + d.集中分 + "*60,B=" + d.休み分 + "*60,SND=" + (d.音 ? "1" : "0") + ";\n"
          + "var work=1,left=W,run=0,tid=0,round=K.load('round',0)||0;\n"
          + "K.$('#kR').textContent=round+' 回';\n"
          + "function fmt(s){var m=Math.floor(s/60),x=s%60;return m+':'+(x<10?'0':'')+x;}\n"
          + "function draw(){K.$('#kT').textContent=fmt(Math.max(0,left));\n"
          + "  K.$('#kW').textContent=work?'集中':'休み';var all=work?W:B;\n"
          + "  K.$('#kBar').style.width=Math.round((1-left/all)*100)+'%';}\n"
          + "function tick(){left--;if(left<=0)flip();draw();}\n"
          + "function flip(){if(SND)K.beep(work?880:520);\n"
          + "  if(work){round++;K.save('round',round);K.$('#kR').textContent=round+' 回';}\n"
          + "  work=!work;left=work?W:B;K.$('#kMsg').textContent=work?'また 集中':'ひと休み';}\n"
          + "K.$('#kGo').onclick=function(){run=!run;clearInterval(tid);\n"
          + "  if(run){tid=setInterval(tick,1000);K.$('#kGo').textContent='とめる';K.$('#kMsg').textContent='';}\n"
          + "  else K.$('#kGo').textContent='つづける';};\n"
          + "K.$('#kSkip').onclick=function(){flip();draw();};\n"
          + "K.$('#kReset').onclick=function(){clearInterval(tid);run=0;work=1;left=W;\n"
          + "  K.$('#kGo').textContent='はじめる';K.$('#kMsg').textContent='はじめる を おす';draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉑ counter — かぞえる ═══════════════════════════════════ */
  芯.counter = {
    名: "かぞえる", 分類: "どうぐ",
    語: ["カウンター", "数える", "回数", "集計", "タリー", "counter", "記録", "何回", "点数板"],
    説明: "いくつでも 作れる 数とり。押すたび 増える。閉じても 残る。",
    スロット: [題, 副,
      { 鍵: "名前", 型: "並び", 最大: 12, 上限: 24, 既定: ["1組", "2組"], 説: "数える ものの 名前" },
      { 鍵: "きざみ", 型: "数", 既定: 1, 最小: 1, 最大: 100, 説: "1 回 押すと いくつ 増えるか" }
    ],
    例: { 題: "得点板", 名前: ["赤チーム", "白チーム"] },
    作る: function (d) {
      return {
        帯: 帯([["kSum", "合計 0"]]),
        中: '<div id="kList" class="k-gr"></div>',
        手: '<button class="k-btn ghost" id="kReset">ぜんぶ 0 に</button>',
        css: "#kList{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}"
          + ".cn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--k-pad);"
          + "border-radius:var(--k-r);background:var(--k-surface);border:1px solid var(--k-line)}"
          + ".cn .nm{font-weight:700;text-align:center;word-break:break-word}"
          + ".cn .v{font-size:clamp(32px,8vw,54px);font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}"
          + ".cn .row{display:flex;gap:8px;width:100%}"
          + ".cn .row .k-btn{flex:1;min-height:46px;font-size:calc(var(--k-fs) + 3px)}",
        js: "var NM=" + JSON.stringify(d.名前) + ",ST=" + d.きざみ + ";\n"
          + "var V=K.load('v',null)||NM.map(function(){return 0;});\n"
          + "if(V.length!==NM.length)V=NM.map(function(_,i){return V[i]||0;});\n"
          + "function save(){K.save('v',V);}\n"
          + "function sum(){var s=0;V.forEach(function(x){s+=x;});K.$('#kSum').textContent='合計 '+s;}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';\n"
          + "  NM.forEach(function(n,i){var c=document.createElement('div');c.className='cn';\n"
          + "    c.innerHTML='<div class=\"nm\"></div><div class=\"v\"></div>"
          + "<div class=\"row\"><button class=\"k-btn\">−</button><button class=\"k-btn pri\">＋</button></div>';\n"
          + "    c.querySelector('.nm').textContent=n;c.querySelector('.v').textContent=V[i];\n"
          + "    var bs=c.querySelectorAll('.k-btn');\n"
          + "    bs[0].onclick=function(){V[i]-=ST;c.querySelector('.v').textContent=V[i];save();sum();};\n"
          + "    bs[1].onclick=function(){V[i]+=ST;c.querySelector('.v').textContent=V[i];save();sum();};\n"
          + "    el.appendChild(c);});sum();}\n"
          + "K.$('#kReset').onclick=function(){V=NM.map(function(){return 0;});save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉒ budget — かんたん出納 ═══════════════════════════════════ */
  芯.budget = {
    名: "かんたん出納", 分類: "どうぐ",
    語: ["家計", "お金", "出納", "支出", "収入", "予算", "budget", "つけ", "会計", "小遣い", "おこづかい", "おこづかいの記録", "こづかい帳"],
    説明: "入った お金と 出た お金を 足していく。のこりが すぐ 分かる。",
    スロット: [題, 副,
      { 鍵: "はじめの残り", 型: "数", 既定: 0, 最小: -9999999, 最大: 9999999 },
      { 鍵: "たんい", 型: "文", 既定: "円", 上限: 6 },
      { 鍵: "わけ", 型: "並び", 最大: 12, 上限: 16, 既定: ["食べもの", "本", "交通", "その他"], 説: "選べる 使いみち" }
    ],
    例: { 題: "8 月の おこづかい", はじめの残り: 5000, わけ: ["おやつ", "文具"] },
    作る: function (d) {
      return {
        帯: 帯([["kBal", "0"]]),
        中: '<div id="kList" class="k-gr"></div>',
        手: '<input class="k-in" id="kName" placeholder="なにに" style="flex:2;min-width:120px">'
          + '<input class="k-in" id="kAmt" inputmode="numeric" placeholder="いくら" style="flex:1;min-width:90px">'
          + '<select class="k-in" id="kCat" style="flex:1;min-width:110px"></select>'
          + '<button class="k-btn" id="kIn2">入った</button><button class="k-btn pri" id="kOut">出た</button>'
          + '<button class="k-btn ghost" id="kReset">まっさら</button>',
        css: "#kList{grid-template-columns:1fr}"
          + ".rw{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:calc(var(--k-r) - 4px);"
          + "background:var(--k-surface);border:1px solid var(--k-line)}"
          + ".rw .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
          + ".rw .ct{font-size:calc(var(--k-fs) - 4px);color:var(--k-sub);padding:2px 8px;border-radius:99px;background:var(--k-bg)}"
          + ".rw .am{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}"
          + ".rw .rm{opacity:.45;padding:2px 6px}",
        js: "var START=" + d.はじめの残り + ",UNIT=" + JSON.stringify(d.たんい) + ",CAT=" + JSON.stringify(d.わけ) + ";\n"
          + "var R=K.load('rows',null)||[];\n"
          + "var sel=K.$('#kCat');CAT.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});\n"
          + "function save(){K.save('rows',R);}\n"
          + "function yen(n){return (n<0?'−':'')+Math.abs(n).toLocaleString('ja-JP')+UNIT;}\n"
          + "function draw(){var el=K.$('#kList');el.innerHTML='';var bal=START;\n"
          + "  R.forEach(function(r,i){bal+=r.a;var d2=document.createElement('div');d2.className='rw';\n"
          + "    d2.innerHTML='<span class=\"nm\"></span><span class=\"ct\"></span><span class=\"am\"></span><button class=\"rm\">✕</button>';\n"
          + "    d2.querySelector('.nm').textContent=r.n;d2.querySelector('.ct').textContent=r.c||'';\n"
          + "    var am=d2.querySelector('.am');am.textContent=(r.a>0?'+':'')+yen(r.a);\n"
          + "    am.className='am '+(r.a>0?'k-good':'k-bad');\n"
          + "    d2.querySelector('.rm').onclick=function(){R.splice(i,1);save();draw();};el.appendChild(d2);});\n"
          + "  K.$('#kBal').textContent='のこり '+yen(bal);}\n"
          + "function add(sign){var n=String(K.$('#kName').value||'').trim()||'（なまえ なし）';\n"
          + "  var a=Math.abs(Number(K.$('#kAmt').value)||0);if(!a)return;\n"
          + "  R.unshift({n:n,a:sign*a,c:sel.value||''});K.$('#kName').value='';K.$('#kAmt').value='';save();draw();}\n"
          + "K.$('#kIn2').onclick=function(){add(1);};K.$('#kOut').onclick=function(){add(-1);};\n"
          + "K.$('#kAmt').addEventListener('keydown',function(e){if(e.key==='Enter')add(-1);});\n"
          + "K.$('#kReset').onclick=function(){R=[];save();draw();};\ndraw();"
      };
    }
  };

  /* ══ ㉓ dice — さいころ・くじ ═══════════════════════════════════ */
  芯.dice = {
    名: "さいころ・くじ", 分類: "どうぐ",
    語: ["さいころ", "くじ", "ルーレット", "抽選", "ランダム", "dice", "当番", "決める", "順番決め", "あみだ"],
    説明: "並べたものから 1 つ 選ぶ。同じものを 続けて 出さない ようにも できる。",
    スロット: [題, 副,
      { 鍵: "候補", 型: "並び", 最大: 200, 上限: 40, 既定: ["1", "2", "3", "4", "5", "6"], 説: "選ばれる もの" },
      { 鍵: "重ねない", 型: "真偽", 既定: false, 説: "全部 出るまで 同じものを 出さないか" }
    ],
    例: { 題: "きょうの 当番", 候補: ["あさひ", "みなと", "ゆい"], 重ねない: true },
    作る: function (d) {
      return {
        帯: 帯([["kN", "0 回"], ["kL", ""]]),
        中: '<div class="k-center"><div id="kOut" class="k-big" style="font-size:clamp(36px,11vw,84px);word-break:break-word;text-align:center;min-height:1.2em">？</div>'
          + '<div class="k-note" id="kHist"></div></div>',
        手: '<button class="k-btn pri" id="kGo" style="min-height:56px;min-width:160px;font-size:calc(var(--k-fs) + 3px)">ひく</button>'
          + '<button class="k-btn ghost" id="kReset">もどす</button>',
        css: "#kOut.roll{opacity:.35}",
        js: "var C=" + JSON.stringify(d.候補) + ",UNIQ=" + (d.重ねない ? "1" : "0") + ";\n"
          + "var pool=C.slice(),n=0,hist=[],rolling=0;\n"
          + "function left(){K.$('#kL').textContent=UNIQ?('のこり '+pool.length):'';}\n"
          + "function go(){if(rolling)return;\n"
          + "  if(UNIQ&&!pool.length){K.$('#kOut').textContent='おわり';return;}\n"
          + "  rolling=1;K.$('#kOut').classList.add('roll');var t=0;\n"
          + "  var iv=setInterval(function(){K.$('#kOut').textContent=C[(Math.random()*C.length)|0];\n"
          + "    if(++t>8){clearInterval(iv);fin();}},60);}\n"
          + "function fin(){var v;\n"
          + "  if(UNIQ){var i=(Math.random()*pool.length)|0;v=pool[i];pool.splice(i,1);}\n"
          + "  else v=C[(Math.random()*C.length)|0];\n"
          + "  K.$('#kOut').classList.remove('roll');K.$('#kOut').textContent=v;\n"
          + "  n++;K.$('#kN').textContent=n+' 回';hist.unshift(v);hist=hist.slice(0,12);\n"
          + "  K.$('#kHist').textContent=hist.join(' ・ ');left();rolling=0;}\n"
          + "K.$('#kGo').onclick=go;\n"
          + "K.$('#kReset').onclick=function(){pool=C.slice();n=0;hist=[];K.$('#kN').textContent='0 回';\n"
          + "  K.$('#kHist').textContent='';K.$('#kOut').textContent='？';left();};left();"
      };
    }
  };

  /* ══ ㉔ draw — お絵かき ═══════════════════════════════════════ */
  芯.draw = {
    名: "お絵かき", 分類: "どうぐ",
    語: ["お絵かき", "描く", "落書き", "ホワイトボード", "図", "draw", "手書き", "スケッチ", "板書"],
    説明: "指や マウスで 描く。太さと 色を 変えられる。消しゴムと 全消しつき。",
    スロット: [題, 副,
      { 鍵: "背景", 型: "選", 候補: ["まっしろ", "方眼", "横線"], 既定: "まっしろ" },
      { 鍵: "はじめの太さ", 型: "数", 既定: 4, 最小: 1, 最大: 40 }
    ],
    例: { 題: "考えを 書く", 背景: "方眼" },
    作る: function (d) {
      return {
        帯: "",
        中: '<div id="kStage"><canvas id="kC"></canvas></div>',
        手: '<div id="kPal" style="display:flex;gap:6px"></div>'
          + '<input type="range" id="kW" min="1" max="40" value="' + d.はじめの太さ + '" style="width:110px">'
          + '<button class="k-btn" id="kEr">消しゴム</button><button class="k-btn ghost" id="kClr">全部 消す</button>',
        css: "#kStage{flex:1;min-height:220px;border-radius:var(--k-r);overflow:hidden;background:#fff;border:1px solid var(--k-line);touch-action:none}"
          + "#kC{display:block;width:100%;height:100%;cursor:crosshair}"
          + "#kPal button{width:30px;height:30px;border-radius:50%;border:2px solid transparent}"
          + "#kPal button.on{border-color:var(--k-text)}",
        js: "var BG=" + JSON.stringify(d.背景) + ",W0=" + d.はじめの太さ + ";\n"
          + "var cv=K.canvas(K.$('#kC'),1),cols=['#1E2430','#D14343','#2E9E6B','#2A5382','#C98A16','#9A2B52'];\n"
          + "var col=cols[0],wid=W0,er=0,down=0,last=null,strokes=[];\n"
          + "var pal=K.$('#kPal');cols.forEach(function(c,i){var b=document.createElement('button');\n"
          + "  b.style.background=c;if(!i)b.className='on';\n"
          + "  b.onclick=function(){col=c;er=0;K.$$('#kPal button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};\n"
          + "  pal.appendChild(b);});\n"
          + "K.$('#kW').oninput=function(){wid=Number(K.$('#kW').value)||4;};\n"
          + "K.$('#kEr').onclick=function(){er=!er;K.$('#kEr').classList.toggle('pri',!!er);};\n"
          + "K.$('#kClr').onclick=function(){strokes=[];};\n"
          + "function pos(e){var r=K.$('#kC').getBoundingClientRect();var t=e.touches?e.touches[0]:e;\n"
          + "  return {x:(t.clientX-r.left)/r.width,y:(t.clientY-r.top)/r.height};}\n"
          + "function start(e){e.preventDefault();down=1;last=pos(e);\n"
          + "  strokes.push({c:er?'#FFFFFF':col,w:er?wid*3:wid,p:[last]});}\n"
          + "function move(e){if(!down)return;e.preventDefault();var p=pos(e);\n"
          + "  strokes[strokes.length-1].p.push(p);last=p;}\n"
          + "function end(){down=0;}\n"
          + "var st=K.$('#kStage');\n"
          + "st.addEventListener('pointerdown',start);st.addEventListener('pointermove',move);\n"
          + "window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);\n"
          + "cv.loop(function(ctx,w,h){ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,w,h);\n"
          + "  ctx.strokeStyle='#E3E7EE';ctx.lineWidth=1;\n"
          + "  if(BG==='方眼'){for(var x=0;x<w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}\n"
          + "    for(var y=0;y<h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}\n"
          + "  else if(BG==='横線'){for(var y2=32;y2<h;y2+=32){ctx.beginPath();ctx.moveTo(0,y2);ctx.lineTo(w,y2);ctx.stroke();}}\n"
          + "  ctx.lineCap='round';ctx.lineJoin='round';\n"
          + "  strokes.forEach(function(s){if(s.p.length<1)return;ctx.strokeStyle=s.c;ctx.lineWidth=s.w;\n"
          + "    ctx.beginPath();ctx.moveTo(s.p[0].x*w,s.p[0].y*h);\n"
          + "    for(var i=1;i<s.p.length;i++)ctx.lineTo(s.p[i].x*w,s.p[i].y*h);\n"
          + "    if(s.p.length===1)ctx.lineTo(s.p[0].x*w+0.1,s.p[0].y*h);ctx.stroke();});});"
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
