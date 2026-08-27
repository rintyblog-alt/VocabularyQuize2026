/* ══════════════════════════════════════════════════════════════════════════
   core/kata/index.js — 型の 目録・さがす・組み立てる

   使いかた（本体から）:
     VQK.型たち()            … 芯 24 種の 一覧（Lumi へ 見せる）
     VQK.かず()              … 全部で いくつ 型が あるか
     VQK.さがす("九九の練習") … 近い 型を 点つきで 返す
     VQK.作る(型ID, 中身)     … {html, css, js} を 返す（そのまま AR App へ）

   ★ Lumi は コードを 書かない。型ID と 中身（文字・数・並び）だけ。
   ★ 中身が どんなに おかしくても、差し込みの検査が 必ず 直してから 渡す。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQK = root.VQK || (root.VQK = {});
  var 芯 = VQK.芯 || (VQK.芯 = {});

  /* ══ 中で 使える 共通の 道具 K ═══════════════════════════════════
     ★ すべての 型の js は これを 先に 読み込んで から 動く。
       ここに 集めておくと、芯ごとに 書き直さずに 済み、
       直すときも 1 か所で 済む（＝ 壊れにくい）。 */
  var 共通JS = [
    "var K=(function(){",
    "  var mem={},booted=0,waiting=[];",
    "  function $(s){return document.querySelector(s);}",
    "  function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s));}",
    "  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')",
    "    .replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}",
    "  function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=(Math.random()*(i+1))|0;",
    "    var t=a[i];a[i]=a[j];a[j]=t;}return a;}",
    "  function css(n){try{return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#888';}",
    "    catch(e){return '#888';}}",
    /* 保存。iframe には localStorage が 無い（そう作ってある）ので
       本体の 溜めへ 預ける。読みは 起動時に 1 回だけ まとめて。 */
    "  function save(k,v){mem[k]=v;try{if(window.VQ&&VQ.store)VQ.store.set('kata',mem);}catch(e){}}",
    "  function load(k,d){return mem[k]===undefined?d:mem[k];}",
    /* ★ 画面が 差し替わったあとも 時計が 動き続けると、
       もう無い所を さわって 落ちる（実測。144 通しで 出た）。
       ここで 一括して 「土台が 外れたら 自分で 止まる」に する。 */
    "  var 根=null,生き=1;",
    "  function 生きてる(){if(!生き)return 0;if(!根)根=document.querySelector('.k');",
    "    if(根&&!根.isConnected){生き=0;return 0;}return 1;}",
    "  function 見張る(){var si=window.setInterval,st2=window.setTimeout;",
    "    window.setInterval=function(f,ms){var id=si(function(){",
    "      if(!生きてる()){clearInterval(id);return;}f();},ms);return id;};",
    "    window.setTimeout=function(f,ms){return st2(function(){if(!生きてる())return;f();},ms);};",
    "    var raf=window.requestAnimationFrame;",
    "    window.requestAnimationFrame=function(f){return raf(function(t){if(!生きてる())return;f(t);});};}",
    "  function 始める(fn){",
    "    var go=function(){booted=1;見張る();try{fn();}catch(e){",
    "      try{var p=document.createElement('pre');p.id='vqerr';p.textContent=(e&&e.message)||String(e);",
    "        document.body.appendChild(p);}catch(x){}",
    "      try{parent.postMessage({__vqapp:1,kind:'error',message:(e&&e.message)||String(e)},'*');}catch(x){}}};",
    "    var t=setTimeout(go,1200);",
    "    try{",
    "      if(window.VQ&&VQ.store&&VQ.store.get){",
    "        VQ.store.get('kata',{}).then(function(v){if(v&&typeof v==='object')mem=v;",
    "          clearTimeout(t);if(!booted)go();}).catch(function(){clearTimeout(t);if(!booted)go();});",
    "      }else{clearTimeout(t);go();}",
    "    }catch(e){clearTimeout(t);go();}",
    "  }",
    /* 絵を 描く 場所。画素の 濃さ（DPR）も 大きさ直しも こちらが 持つ。 */
    "  function canvas(el,noloop){",
    "    var ctx=el.getContext('2d'),W=0,H=0,fn=null,last=0,raf=0;",
    "    function fit(){var r=el.getBoundingClientRect();var d=Math.min(2,window.devicePixelRatio||1);",
    "      W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));",
    "      el.width=Math.round(W*d);el.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);}",
    "    fit();",
    "    try{new ResizeObserver(fit).observe(el);}catch(e){window.addEventListener('resize',fit);}",
    "    if(!ctx.roundRect)ctx.roundRect=function(x,y,w,h,r){r=Math.min(r,w/2,h/2);this.beginPath();",
    "      this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);",
    "      this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;};",
    "    function step(t){raf=requestAnimationFrame(step);var dt=last?Math.min(64,t-last):16;last=t;",
    "      if(fn){try{fn(ctx,W,H,dt);}catch(e){cancelAnimationFrame(raf);throw e;}}}",
    "    return {ctx:ctx,fit:fit,w:function(){return W;},h:function(){return H;},",
    "      loop:function(f){fn=f;if(!raf&&!noloop)raf=requestAnimationFrame(step);",
    "        if(noloop){fn=f;raf=requestAnimationFrame(step);}}};",
    "  }",
    /* 左右に 引く（0〜1 で 返す）。指も マウスも 同じ 口。 */
    "  function drag(el,fn){",
    "    var on=0;function p(e){var r=el.getBoundingClientRect();var t=e.touches?e.touches[0]:e;",
    "      fn(Math.max(0,Math.min(1,(t.clientX-r.left)/Math.max(1,r.width))));}",
    "    el.addEventListener('pointerdown',function(e){on=1;p(e);e.preventDefault();});",
    "    el.addEventListener('pointermove',function(e){if(on){p(e);e.preventDefault();}});",
    "    window.addEventListener('pointerup',function(){on=0;});",
    "    el.addEventListener('mousemove',function(e){p(e);});",
    "  }",
    /* なぞる向き（上下左右）。 */
    "  function swipe(el,fn){var sx=0,sy=0,on=0;",
    "    el.addEventListener('pointerdown',function(e){on=1;sx=e.clientX;sy=e.clientY;});",
    "    window.addEventListener('pointerup',function(e){if(!on)return;on=0;",
    "      var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)<24&&Math.abs(dy)<24)return;",
    "      if(Math.abs(dx)>Math.abs(dy))fn(dx>0?1:-1,0);else fn(0,dy>0?1:-1);});}",
    "  function keys(fn){window.addEventListener('keydown',function(e){",
    "    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)>=0)e.preventDefault();fn(e.key,e);});}",
    /* 短い 音。外の 音は 使わない（つながせない ため）。 */
    "  function beep(hz,ms){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;",
    "    var c=beep._c||(beep._c=new A());var o=c.createOscillator(),g=c.createGain();",
    "    o.frequency.value=hz||660;o.connect(g);g.connect(c.destination);",
    "    g.gain.setValueAtTime(0.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(0.14,c.currentTime+0.01);",
    "    g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+((ms||180)/1000));",
    "    o.start();o.stop(c.currentTime+((ms||180)/1000)+0.02);}catch(e){}}",
    "  return {$:$,$$:$$,esc:esc,shuffle:shuffle,css:css,save:save,load:load,",
    "    始める:始める,canvas:canvas,drag:drag,swipe:swipe,keys:keys,beep:beep};",
    "})();"
  ].join("\n");

  /* ══ 目録 ═══════════════════════════════════════════════════════ */
  function 芯の名() { return Object.keys(芯); }
  function かず() {
    return 芯の名().length * VQK.骨の名.length * VQK.色の名.length * VQK.詰の名.length;
  }
  function 型たち() {
    return 芯の名().map(function (k) {
      var a = 芯[k];
      return { 芯: k, 名: a.名, 分類: a.分類, 説明: a.説明, 語: a.語,
        スロット: a.スロット.map(function (s) {
          return { 鍵: s.鍵, 型: s.型, 説: s.説 || "", 既定: s.既定, 候補: s.候補, 形: s.形 };
        }), 例: a.例 || {} };
    });
  }

  /* ══ 型 ID ═════════════════════════════════════════════════════ */
  function 分解(id) {
    var a = String(id || "").split("/");
    return {
      芯: 芯[a[0]] ? a[0] : "",
      骨: VQK.骨たち[a[1]] ? a[1] : "stack",
      色: VQK.色たち[a[2]] ? a[2] : "slate",
      詰: VQK.詰たち[a[3]] ? a[3] : "normal"
    };
  }
  function 組む(芯名, 骨, 色, 詰) {
    return [芯名, 骨 || "stack", 色 || "slate", 詰 || "normal"].join("/");
  }
  /* 決まった 文字から 決まった 見た目を 選ぶ（同じ頼みなら 毎回 同じ）。 */
  function 種(s) {
    var h = 2166136261;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function 見た目を選ぶ(芯名, 手がかり) {
    var a = 芯[芯名] || {};
    var h = 種(芯名 + "|" + (手がかり || ""));
    /* 芯ごとに 似合う 骨を 先に 決めておく（外れが 出ないように）。 */
    var 似合う = {
      quiz4: ["card", "stack"], flash: ["card", "stack"], pair: ["board", "stack"],
      type: ["card", "hud"], mole: ["board", "hud"], "catch": ["hud", "board"],
      snake: ["board", "hud"], breakout: ["board", "hud"], merge2048: ["board", "hud"],
      memoryseq: ["board", "stack"], sortorder: ["stack", "split"], hangman: ["card", "stack"],
      drill: ["card", "hud"], matchline: ["split", "stack"], fillblank: ["card", "stack"],
      sortcat: ["stack", "board"], timeline: ["split", "stack"], dictation: ["card", "stack"],
      checklist: ["stack", "panel"], pomodoro: ["card", "stack"], counter: ["stack", "board"],
      budget: ["stack", "panel"], dice: ["card", "board"], draw: ["board", "stack"]
    }[芯名] || ["stack"];
    return {
      骨: 似合う[h % 似合う.length],
      色: VQK.色の名[(h >>> 3) % VQK.色の名.length],
      詰: VQK.詰の名[(h >>> 7) % VQK.詰の名.length]
    };
  }

  /* ══ さがす ═══════════════════════════════════════════════════
     言葉の 重なりで 点をつける。**近いものが 無ければ 無いと 言う**
     （むりに 当てはめると 実用に ならないものが 出る）。 */
  function 正す(s) {
    return String(s || "").toLowerCase().replace(/[\s　、。，．・「」『』（）()]/g, "");
  }
  function さがす(希望, n) {
    var q = 正す(希望);
    n = Math.max(1, Math.min(12, Number(n) || 6));
    var 出 = 芯の名().map(function (k) {
      var a = 芯[k], 点 = 0;
      (a.語 || []).forEach(function (w) {
        var v = 正す(w);
        if (!v) return;
        if (q.indexOf(v) >= 0) 点 += Math.min(6, v.length) * 2;
        else if (v.length >= 2 && v.indexOf(q) >= 0 && q.length >= 2) 点 += 3;
      });
      if (q && 正す(a.名).length && q.indexOf(正す(a.名)) >= 0) 点 += 10;
      /* 説明の 中の 言葉も 少しだけ 見る */
      正す(a.説明).split("").length && (a.語 || []).length;
      var m = 見た目を選ぶ(k, 希望);
      return { 芯: k, 名: a.名, 分類: a.分類, 説明: a.説明, 点: 点,
        型ID: 組む(k, m.骨, m.色, m.詰),
        スロット: a.スロット.map(function (s) { return { 鍵: s.鍵, 型: s.型, 説: s.説 || "", 既定: s.既定, 候補: s.候補, 形: s.形 }; }),
        例: a.例 || {} };
    });
    出.sort(function (a, b) { return b.点 - a.点 || a.芯.localeCompare(b.芯); });
    return 出.slice(0, n);
  }

  /* ══ 組み立てる ═══════════════════════════════════════════════ */
  function 作る(型ID, 中身, o) {
    o = o || {};
    var p = 分解(型ID);
    if (!p.芯) {
      /* 型 ID が 分からないときは **黙って 適当に 作らない**。 */
      var e = new Error("その型は ありません: " + String(型ID));
      e.code = "KATA_NOT_FOUND";
      e.候補 = さがす(o.希望 || String(型ID), 5).map(function (x) { return x.型ID; });
      throw e;
    }
    var a = 芯[p.芯];
    var v = VQK.差し込みを直す(a.スロット, 中身);
    var r = a.作る(v.中身);
    var html = VQK.骨で包む(p.骨, {
      題: VQK.逃がす(v.中身.題 || a.名),
      副: VQK.逃がす(v.中身.副 || ""),
      帯: r.帯 || "", 中: r.中 || "", 手: r.手 || ""
    });
    var css = VQK.土台CSS(p.色, p.詰) + (r.css || "");
    /* ★ 差し込んだ 文の中に </script> が あると、包みの <script> を
       **そこで 閉じてしまう**（実測。問題文へ 仕掛けを 入れると 起きた）。
       包み（core/board/app.js）でも 逃がしているが、
       **ここでも 逃がす**（別の 出しかたでも 安全なように）。 */
    var js = 共通JS + "\nK.始める(function(){\n" + (r.js || "") + "\n});";
    js = js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
    return {
      型ID: 組む(p.芯, p.骨, p.色, p.詰),
      芯: p.芯, 骨: p.骨, 色: p.色, 詰: p.詰,
      html: html, css: css, js: js,
      直した: v.直した, 中身: v.中身,
      見出し: v.中身.題 || a.名
    };
  }

  /* 希望の文 → いちばん近い 型で そのまま 作る（Lumi の 近道） */
  function 近いので作る(希望, 中身) {
    var c = さがす(希望, 1)[0];
    if (!c || c.点 <= 0) {
      var e = new Error("近い型が 見つかりませんでした。");
      e.code = "KATA_NO_MATCH";
      e.候補 = 型たち().map(function (t) { return t.芯 + "（" + t.名 + "）"; });
      throw e;
    }
    return 作る(c.型ID, 中身, { 希望: 希望 });
  }

  VQK.共通JS = 共通JS;
  VQK.芯の名 = 芯の名;
  VQK.かず = かず;
  VQK.型たち = 型たち;
  VQK.分解 = 分解;
  VQK.組む = 組む;
  VQK.見た目を選ぶ = 見た目を選ぶ;
  VQK.さがす = さがす;
  VQK.作る = 作る;
  VQK.近いので作る = 近いので作る;
})(typeof window !== "undefined" ? window : globalThis);
