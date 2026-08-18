/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — Scene 4 プレイヤー / 5 VocabuSpeak / 6 Insight
   （実装 D。契約は DESIGN.md。update は local 秒から冪等に絵を決める）

   この改修の方針:
   ・面は「光の当たった物体」。上辺の高光り・内側の落ち込み・接地影を必ず持たせる。
   ・色は 1 面につきアクセント 1 つ。彩度の高いベタ塗りは使わない（発光でだけ色を出す）。
   ・コピーはすべて VQAD.kinSplit / kinPose（1 文字ずつ）。行ごとフェードは安く見える。
   ・**面の大きさは常に「その時点の中身」が決める**。まだ出ていない要素のために
     場所を空けておくと、そこが空箱に見えて未完成の絵になる。
   ・カメラ（main.js）が舞台ごと動かすので、シーン側は中央に組むだけ。
     大きな平行移動はここでは足さない。
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;

  /* ── 省モーション判定（main.js が boot 冒頭で html に付ける。build はその後） ──
     毎フレーム classList を読むのは無駄なので 1 回だけ確定させる。 */
  var RM = null;
  function rm() {
    if (RM === null) RM = document.documentElement.classList.contains("vqad-rm");
    return RM;
  }

  /* ── 小さな共通ヘルパー ─────────────────────────────────────── */

  /* textContent の書き換えは値が変わったときだけ */
  function setText(el2, s) {
    if (el2.__vqText !== s) { el2.__vqText = s; el2.textContent = s; }
  }

  /* 要素生成 */
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  /* CSS 変数の書き込みも変化時だけ（毎フレームの style 更新を減らす） */
  function setVar(node, name, val) {
    var key = "__v" + name;
    if (node[key] === val) return;
    node[key] = val;
    node.style.setProperty(name, val);
  }

  /* 「長い尾」のイージング。cubic-bezier(0.16,1,0.3,1) の JS 版に近い。
     ease-out の短いやつは安く見えるので、値の駆動もこちらに寄せる。 */
  function expoOut(t) {
    t = V.clamp01(t);
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  /* コピーのキネティックタイポ。省モーション時は素直なフェードへ落とす。 */
  function pose(spans, local, tIn, tOut, stagger) {
    if (!rm()) return V.kinPose(spans, local, tIn, tOut, stagger);
    var o = V.span(local, tIn, tIn + 0.5) * (1 - V.span(local, tOut - 0.5, tOut));
    var s = o.toFixed(3);
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].__o === s) continue;
      spans[i].__o = s;
      spans[i].style.opacity = s;
      spans[i].style.transform = "";
      spans[i].style.filter = "";
    }
    return o > 0;
  }

  /* コピー要素を作って 1 文字ずつに割る */
  function copyEl(rootEl, cls, text) {
    var node = el("div", "vqad-copy " + cls);
    var spans = V.kinSplit(node, text);
    rootEl.appendChild(node);
    return spans;
  }

  /* タイプライター: 文字を span に分解して持ち、表示文字数だけを差分更新する。
     文字数は local から決めるので seek しても常に正しい絵になる。 */
  function makeTyper(container, text, chClass) {
    var spans = [];
    for (var i = 0; i < text.length; i++) {
      var s = el("span", chClass, text[i]);
      container.appendChild(s);
      spans.push(s);
    }
    return {
      len: text.length,
      last: 0,
      set: function (n) {
        n = Math.max(0, Math.min(this.len, n));
        if (n === this.last) return;
        var i;
        if (n > this.last) { for (i = this.last; i < n; i++) spans[i].classList.add("is-on"); }
        else { for (i = n; i < this.last; i++) spans[i].classList.remove("is-on"); }
        this.last = n;
      }
    };
  }

  /* 2 色の RGB 補間（波形の話者カラー用） */
  function mixRgb(c1, c2, t) {
    return "rgb(" + Math.round(V.lerp(c1[0], c2[0], t)) + ","
      + Math.round(V.lerp(c1[1], c2[1], t)) + ","
      + Math.round(V.lerp(c1[2], c2[2], t)) + ")";
  }

  /* ══════════════════════════════════════════════════════════════
     Scene 4 — クイズプレイヤー（38–50s / local 0–12s）
     問題カード → カーソルが行を舐める（光のスイープ）→ 選択 →
     行の背後から柔らかい光 → スマホへ「組み直し」（速度に比例したブレ）
     ══════════════════════════════════════════════════════════════ */
  (function () {
    /* beat: 0 カード / 1 設問 / 2 英文 / 3 選択肢 / 4 カーソル /
             5 B 選択（青）/ 6 正解（ミント）/ 7 モーフ */
    var T4 = [0.15, 0.85, 1.35, 2.00, 4.30, 5.70, 6.50, 8.00];

    /* 光のスイープ（左→右 0.6 秒）を通す行と、その開始時刻。
       カーソルが A に乗る → B へ滑る、の 2 回だけ。多用すると安くなる。 */
    var SWEEPS = [
      { i: 0, t: 4.35 },
      { i: 1, t: 5.45 }
    ];

    var root, barFill, countEl, checkPath, cardWrap, choiceEls = [];
    var copySpans;

    /* モーフ量（local の純関数）。速度は差分から出してブレに使う。
       区間は 7.85→9.40。9.4 で着地させ、以降はスマホの完成形をホールドする。 */
    var M_IN = 7.85, M_OUT = 9.40;
    function morphAt(x) { return V.ease.inOut(V.span(x, M_IN, M_OUT)); }

    function build(rootEl) {
      root = rootEl;

      var wrap = el("div", "s4-wrap");

      /* ── スマホ枠 ──
         枠は「カードを包む余白」だけを持ち、カードを **中に入れる**。
         こうすると枠の高さが中身に必ず追従し、枠の中に空白が生まれない。
         以前は 320×540 の固定枠にカードを縮小して置いていたので、
         枠内の上 29% / 下 34% が空いたまま 2.6 秒静止していた（実測 47.5s）。 */
      var phone = el("div", "s4-phone");
      phone.appendChild(el("div", "s4-phone-shell"));  /* 枠・面・影（濃さは --s4-pm） */
      phone.appendChild(el("div", "s4-phone-notch"));
      phone.appendChild(el("div", "s4-phone-home"));   /* ホームインジケータ */

      /* 問題カード。ここは backdrop-filter を使わない:
         親に filter（モーションブラー）が乗ると backdrop が根から切れて
         フロストが一瞬で消えるため。深いインディゴの不透明面 + 縁の光で作る。 */
      var cardwrap = el("div", "s4-cardwrap");
      cardWrap = cardwrap;
      var card = el("div", "vqad-glass s4-card");

      /* 上辺: 12 / 20 と進捗バー（5px・満ちる側だけ淡く光る） */
      var top = el("div", "s4-top");
      countEl = el("div", "s4-count", "12 / 20");
      top.appendChild(countEl);
      var bar = el("div", "s4-bar");
      barFill = el("div", "s4-bar-fill");
      bar.appendChild(barFill);
      top.appendChild(bar);
      card.appendChild(top);

      /* 設問（淡く・字間を広く）と英文（主役） */
      card.appendChild(el("div", "s4-q", "最も適切な意味を選ぶ"));
      card.appendChild(el("div", "s4-sentence", "The results exceeded our expectations."));

      /* 選択肢 4 つ。正解行の背後に置く発光層と、カーソルの帯を先に敷く */
      var choices = el("div", "s4-choices");
      choices.appendChild(el("div", "s4-ok"));      /* 正解の滲み（行の背後） */
      choices.appendChild(el("div", "s4-cursor"));  /* カーソルの帯 */
      var items = [
        ["A", "結果は私たちの想定を下回った。"],
        ["B", "結果は私たちの期待を上回った。"],
        ["C", "結果はほぼ予想どおりだった。"],
        ["D", "結果はまだ発表されていない。"]
      ];
      for (var i = 0; i < items.length; i++) {
        var c = el("div", "s4-choice");
        c.setAttribute("data-k", items[i][0]);
        c.style.setProperty("--d", (i * 0.10).toFixed(2) + "s"); /* 出現の時差 */
        c.appendChild(el("span", "s4-key", items[i][0]));
        c.appendChild(el("span", "s4-choice-text", items[i][1]));
        if (items[i][0] === "B") {
          /* 正解チェック（線は JS が local から描く） */
          var ck = el("span", "s4-check-wrap");
          ck.innerHTML =
            "<svg class='s4-check' viewBox='0 0 24 24' aria-hidden='true'>" +
            "<path d='M5 12.5l4.6 4.6L19 7.5' pathLength='1' fill='none'" +
            " stroke='currentColor' stroke-width='2.2'" +
            " stroke-linecap='round' stroke-linejoin='round'/></svg>";
          c.appendChild(ck);
          checkPath = ck.querySelector("path");
        }
        choices.appendChild(c);
        choiceEls.push(c);
      }
      /* 指のタップの波紋（B の行の中心から 1 回だけ）。ホールドの間の唯一の出来事。 */
      choices.appendChild(el("div", "s4-tap"));
      card.appendChild(choices);

      cardwrap.appendChild(card);
      phone.appendChild(cardwrap);
      wrap.appendChild(phone);
      rootEl.appendChild(wrap);

      copySpans = copyEl(rootEl, "s4-copy", "解く体験まで、洗練する。");
    }

    function update(local, dur, api) {
      V.beats(root, local, T4);

      /* 進捗バー: 12 問目を解いている間は 60%（= 12/20）のまま静止。
         スマホに収まったあと 13 問目へ進んで 65% まで伸びる。
         47.4〜50.0 の 2.6 秒ホールドが「ただの静止画」にならないための出来事。 */
      var adv = expoOut(V.span(local, 10.30, 11.15));
      setVar(barFill, "--w", (60 + 5 * adv).toFixed(2) + "%");
      setText(countEl, local >= 10.30 ? "13 / 20" : "12 / 20");

      /* カーソル: A に現れ 5.0s 前後で B へ滑る */
      setVar(root, "--s4-cy", V.ease.inOut(V.span(local, 4.90, 5.55)).toFixed(4));

      /* 行を舐める光のスイープ（0.6 秒で左から右へ）。
         位置と濃さは local の純関数なので seek しても同じ絵になる。 */
      for (var s = 0; s < SWEEPS.length; s++) {
        var sw = SWEEPS[s];
        var p = V.span(local, sw.t, sw.t + 0.6);
        var node = choiceEls[sw.i];
        setVar(node, "--sw", p.toFixed(4));
        /* 端では消しておく（棒が横切ったように見せない） */
        var o = rm() ? 0 : Math.sin(Math.PI * p);
        setVar(node, "--swo", (o * o).toFixed(3));
      }

      /* 正解の滲み出し: 0 → 最大 → 少し戻す（0.9 秒）。上品に一度だけ。 */
      var rise = expoOut(V.span(local, 6.50, 6.95));
      var back = V.ease.inOut(V.span(local, 6.95, 7.40));
      setVar(root, "--s4-ok", (rise * (1 - 0.36 * back)).toFixed(4));

      /* 正解チェックの線描画 */
      var ck2 = expoOut(V.span(local, 6.55, 7.15));
      checkPath.style.strokeDashoffset = String((1 - ck2).toFixed(4));

      /* 46s〜: カードがスマホのレイアウトへ「組み直る」。
         幅が縮む → 英文が折り返して縦に伸びる → 縦長の画面になる。
         単純な scale だと横長のまま小さくなるだけで、枠の中に空白が残る。 */
      var mk = V.span(local, M_IN, M_OUT);
      var m = rm() ? (mk >= 0.5 ? 1 : 0) : V.ease.inOut(mk);
      /* 枠は中身に追従するのではみ出しようがない。組み直りの終盤から現す。 */
      var pm = rm() ? m : expoOut(V.span(local, 8.95, 9.60));
      setVar(root, "--s4-m", m.toFixed(4));
      setVar(root, "--s4-pm", pm.toFixed(4));

      /* 指のタップの波紋（10.00〜10.78 に 1 回だけ）。
         「答えを確定 → 次の問題へ」の合図。local の純関数なので seek しても同じ。 */
      var tp = V.span(local, 10.00, 10.78);
      var tapO = rm() ? 0 : Math.min(1, tp * 16) * Math.pow(1 - tp, 1.7);
      setVar(root, "--s4-tap", (0.24 + 3.2 * V.ease.out(tp)).toFixed(3));
      setVar(root, "--s4-tapo", (tapO * 0.62).toFixed(3));

      /* モーションブラー: 移動速度（m の時間微分）に比例した極小のブレ。
         これがあるだけで「UI の移動」ではなく「映像」に見える。 */
      if (!rm()) {
        var eps = 0.05;
        var rate = Math.abs(morphAt(local + eps) - morphAt(local)) / eps;
        var b = Math.min(0.85, rate * 0.9);
        var f = b > 0.03 ? "blur(" + b.toFixed(2) + "px)" : "";
        if (cardWrap.__f !== f) { cardWrap.__f = f; cardWrap.style.filter = f; }
      }

      pose(copySpans, local, 2.90, 11.60, 0.030);
    }

    V.sceneDefs.push({ id: "s4", order: 4, build: build, update: update });
  })();

  /* ══════════════════════════════════════════════════════════════
     Scene 5 — VocabuSpeak（50–68s / local 0–18s）
     滑らかな「音の帯」→ 会話 → 主役 1 つのスコアリング
     ══════════════════════════════════════════════════════════════ */
  (function () {
    /* beat: 0 パネル / 1 AI 行 / 2 和訳 / 3 ユーザー行 / 4 スコア */
    var T5 = [0.25, 1.40, 5.90, 7.40, 11.10];

    var AI_TEXT = "What would you like to order?";
    var USER_TEXT = "I’d like a coffee, please.";
    var AI_START = 1.70, USER_START = 8.40, CPS = 15; /* 1 秒あたりの文字数 */

    /* ── 波形（SVG の連続曲線。棒グラフはチープなので使わない） ──
       中心線から上下対称に膨らむ帯を 3 本。外側ほど大きく淡い。 */
    var WV_W = 640, WV_H = 120, WV_CY = 60, WV_N = 52, WV_A = 40;
    var BANDS = [
      { amp: 1.00, op: 0.06 },  /* 外側: 大きく淡い */
      { amp: 0.62, op: 0.11 },
      { amp: 0.30, op: 0.26 }   /* 芯: 小さく濃い */
    ];
    var C_AI = [214, 124, 164];   /* 話者カラー: AI（ピンク寄り。彩度は抑える） */
    var C_USER = [108, 156, 236]; /* 話者カラー: ユーザー（青寄り） */

    /* スコアは 3 つ並べず、1 つを主役にする */
    var HERO = { label: "発音", value: 92 };
    var SIDE = [
      { label: "流暢さ", value: 88, t: 11.65 },
      { label: "文法", value: 95, t: 11.95 }
    ];

    var root, waveSvg, waveHalo, bandPaths = [], xs = [], win = [];
    var aiTyper, userTyper, aiCaret, userCaret, micRing;
    var heroNum, heroRing, sideNums = [], sideItems = [];
    var copy1, copy2;
    var lastColor = "";
    var waveStatic = false;

    /* 帯の d を local から毎フレーム作る。
       点を単純な二次ベジェで結ぶ（中点を通す）ので滑らかで軽い。 */
    function bandPath(b, env, local) {
      var top = [], bot = [], i, u, sh, h;
      for (i = 0; i < WV_N; i++) {
        u = i / (WV_N - 1);
        sh = 0.34 + 0.66 * (0.5 + 0.5 * (
          0.52 * Math.sin(u * b.f1 + local * b.s1 + b.p1) +
          0.30 * Math.sin(u * b.f2 - local * b.s2 + b.p2) +
          0.18 * Math.sin(u * b.f3 + local * b.s3 + b.p3)));
        h = (1.2 + WV_A * b.amp * env * sh) * win[i];
        top.push(Math.round(WV_CY - h));
        bot.push(Math.round(WV_CY + h));
      }
      var d = ["M", xs[0], " ", top[0]];
      for (i = 1; i < WV_N - 1; i++) {
        d.push(" Q", xs[i], " ", top[i], " ",
          (xs[i] + xs[i + 1]) >> 1, " ", (top[i] + top[i + 1]) >> 1);
      }
      d.push(" L", xs[WV_N - 1], " ", top[WV_N - 1]);
      d.push(" L", xs[WV_N - 1], " ", bot[WV_N - 1]);
      for (i = WV_N - 2; i > 0; i--) {
        d.push(" Q", xs[i], " ", bot[i], " ",
          (xs[i] + xs[i - 1]) >> 1, " ", (bot[i] + bot[i - 1]) >> 1);
      }
      d.push(" L", xs[0], " ", bot[0], " Z");
      return d.join("");
    }

    function build(rootEl) {
      root = rootEl;

      var wrap = el("div", "s5-wrap");
      var panel = el("div", "vqad-glass s5-panel");

      /* 機能名は極小キャップスのキッカー 1 行だけ（チップは賑やかすぎるので削除） */
      var head = el("div", "s5-head");
      head.appendChild(el("span", "s5-kicker", "VOCABUSPEAK"));
      head.appendChild(el("span", "s5-rule"));
      panel.appendChild(head);

      /* ── 音の帯 ── */
      var waveWrap = el("div", "s5-wave-wrap");
      waveHalo = el("div", "s5-wave-halo");
      waveWrap.appendChild(waveHalo);
      var svgHost = el("div", "s5-wave");
      var svgStr =
        "<svg class='s5-wave-svg' viewBox='0 0 " + WV_W + " " + WV_H + "'" +
        " preserveAspectRatio='none' aria-hidden='true'><defs>" +
        /* 端を消す横グラデ。currentColor 参照なので話者カラーで色が変わる */
        "<linearGradient id='s5WaveFade' x1='0' y1='0' x2='1' y2='0'>" +
        "<stop offset='0' stop-color='currentColor' stop-opacity='0'/>" +
        "<stop offset='0.16' stop-color='currentColor' stop-opacity='0.9'/>" +
        "<stop offset='0.5' stop-color='currentColor' stop-opacity='1'/>" +
        "<stop offset='0.84' stop-color='currentColor' stop-opacity='0.9'/>" +
        "<stop offset='1' stop-color='currentColor' stop-opacity='0'/>" +
        "</linearGradient></defs>" +
        "<line class='s5-wave-axis' x1='0' y1='" + WV_CY + "' x2='" + WV_W + "' y2='" + WV_CY + "'" +
        " stroke='url(#s5WaveFade)'/>";
      for (var b = 0; b < BANDS.length; b++) {
        /* 面だけだと塊に見えるので、極細の輪郭を重ねて「等高線」として読ませる */
        svgStr += "<path class='s5-band' d='' fill='url(#s5WaveFade)'" +
          " fill-opacity='" + BANDS[b].op + "'" +
          " stroke='url(#s5WaveFade)' stroke-width='1'" +
          " stroke-opacity='" + (0.10 + b * 0.10).toFixed(2) + "'/>";
      }
      svgStr += "</svg>";
      svgHost.innerHTML = svgStr;
      waveSvg = svgHost.querySelector(".s5-wave-svg");
      var pl = svgHost.querySelectorAll(".s5-band");
      for (var q = 0; q < pl.length; q++) bandPaths.push(pl[q]);
      waveWrap.appendChild(svgHost);
      panel.appendChild(waveWrap);

      /* 帯ごとの位相・周波数（種固定 rng。録画で必ず同じ絵になる） */
      for (var k = 0; k < BANDS.length; k++) {
        var bb = BANDS[k];
        bb.p1 = V.rng() * Math.PI * 2; bb.p2 = V.rng() * Math.PI * 2; bb.p3 = V.rng() * Math.PI * 2;
        /* 周波数は「波形」に見える密度まで上げる。低いとレンズ状の塊になって安い。 */
        bb.f1 = 22.0 + k * 6.5; bb.f2 = 41.0 + k * 9.0; bb.f3 = 11.0 + k * 3.0;
        bb.s1 = 2.6 + k * 0.5; bb.s2 = 4.3 + k * 0.7; bb.s3 = 1.5 + k * 0.3;
      }
      /* x 座標と端をすぼめる窓関数は固定なので先に作る */
      for (var i = 0; i < WV_N; i++) {
        var u = i / (WV_N - 1);
        xs.push(Math.round(u * WV_W));
        /* 端だけすぼめる。指数を上げるとレンズ型の塊になって波形に見えない。 */
        win.push(Math.pow(Math.sin(Math.PI * u), 0.42));
      }

      /* ── 会話（話者ラベルは吹き出しの外。メッセンジャーに見せない） ── */
      var chat = el("div", "s5-chat");

      var aiRow = el("div", "s5-row s5-row-ai");
      aiRow.appendChild(el("div", "s5-name", "AI"));
      var aiBubble = el("div", "s5-bubble s5-ai");
      var aiText = el("span", "s5-text");
      aiTyper = makeTyper(aiText, AI_TEXT, "s5-ch");
      aiBubble.appendChild(aiText);
      aiCaret = el("span", "s5-caret");
      aiBubble.appendChild(aiCaret);
      aiRow.appendChild(aiBubble);
      aiRow.appendChild(el("div", "s5-sub", "何をご注文なさいますか？"));
      chat.appendChild(aiRow);

      var userRow = el("div", "s5-row s5-row-user");
      userRow.appendChild(el("div", "s5-name", "YOU"));
      var line = el("div", "s5-userline");
      var mic = el("span", "s5-mic");
      micRing = el("span", "s5-mic-ring");
      mic.appendChild(micRing);
      var micIcon = el("span", "s5-mic-icon");
      micIcon.innerHTML =
        "<svg viewBox='0 0 24 24' aria-hidden='true'>" +
        "<path d='M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z' fill='currentColor'/>" +
        "<path d='M6.5 11.2a5.5 5.5 0 0 0 11 0' fill='none' stroke='currentColor'" +
        " stroke-width='1.6' stroke-linecap='round'/>" +
        "<path d='M12 17v3.2' fill='none' stroke='currentColor'" +
        " stroke-width='1.6' stroke-linecap='round'/></svg>";
      mic.appendChild(micIcon);
      line.appendChild(mic);
      var userBubble = el("div", "s5-bubble s5-user");
      var userText = el("span", "s5-text");
      userTyper = makeTyper(userText, USER_TEXT, "s5-ch");
      userBubble.appendChild(userText);
      userCaret = el("span", "s5-caret");
      userBubble.appendChild(userCaret);
      line.appendChild(userBubble);
      userRow.appendChild(line);
      chat.appendChild(userRow);

      panel.appendChild(chat);

      /* ── スコア: 主役は 1 つ（発音）。残りは右に数値だけ ── */
      var scores = el("div", "s5-scores");
      var hero = el("div", "s5-hero");
      var ringHost = el("div", "s5-hero-ring");
      ringHost.innerHTML =
        "<svg viewBox='0 0 120 120' aria-hidden='true'>" +
        "<circle class='s5-hero-track' cx='60' cy='60' r='52' pathLength='100'/>" +
        "<circle class='s5-hero-val' cx='60' cy='60' r='52' pathLength='100'/></svg>";
      heroNum = el("span", "s5-hero-num", "0");
      ringHost.appendChild(heroNum);
      heroRing = ringHost.querySelector(".s5-hero-val");
      hero.appendChild(ringHost);
      hero.appendChild(el("div", "s5-hero-label", HERO.label));
      scores.appendChild(hero);

      var side = el("div", "s5-side");
      for (var j = 0; j < SIDE.length; j++) {
        var item = el("div", "s5-side-item");
        item.appendChild(el("span", "s5-side-label", SIDE[j].label));
        var n = el("span", "s5-side-num", "0");
        item.appendChild(n);
        side.appendChild(item);
        sideNums.push(n);
        sideItems.push(item);
      }
      scores.appendChild(side);
      panel.appendChild(scores);

      wrap.appendChild(panel);
      rootEl.appendChild(wrap);

      copy1 = copyEl(rootEl, "s5-copy1", "聞く。話す。伝える。");
      copy2 = copyEl(rootEl, "s5-copy2", "英語を、答えるものから、使うものへ。");
    }

    function update(local, dur, api) {
      V.beats(root, local, T5);

      /* ── タイプ表示（表示文字数 = local の関数） ── */
      aiTyper.set(Math.floor((local - AI_START) * CPS));
      userTyper.set(Math.floor((local - USER_START) * CPS));
      var aiEnd = AI_START + aiTyper.len / CPS + 0.5;
      var userEnd = USER_START + userTyper.len / CPS + 0.5;
      aiCaret.classList.toggle("is-on", local >= AI_START - 0.15 && local <= aiEnd);
      userCaret.classList.toggle("is-on", local >= USER_START - 0.15 && local <= userEnd);

      /* ── 音の帯 ──
         発話中は大きく膨らみ、非発話でも「静かに息をしている」振幅を保つ。
         下限を 0.06 にしていた頃は 54s で env=0.22 の細い一本線になり、
         波形ではなくレンズの傷に見えていた。下限は 0.45 前後。
         AI: local 1.5–4.1 / ユーザー: local 8.2–10.7 */
      var envA = Math.min(V.span(local, 1.50, 2.00), 1 - V.span(local, 3.50, 4.10));
      var envU = Math.min(V.span(local, 8.20, 8.70), 1 - V.span(local, 10.10, 10.70));
      var speak = Math.max(envA, envU);
      var idle = 0.45 + 0.05 * Math.sin(local * 1.15 + 0.6); /* 待機中の息づかい */
      var env = idle + (1 - idle) * speak;
      var mix = V.span(local, 7.60, 8.60); /* 0=AI(ピンク) → 1=ユーザー(青) */
      var col = mixRgb(C_AI, C_USER, mix);
      if (col !== lastColor) { lastColor = col; waveSvg.style.color = col; }
      setVar(waveHalo, "--o", (0.10 + 0.42 * speak).toFixed(3));

      if (rm()) {
        /* 省モーション: 静止した一本の帯として成立させる */
        if (!waveStatic) {
          waveStatic = true;
          for (var z = 0; z < bandPaths.length; z++) {
            bandPaths[z].setAttribute("d", bandPath(BANDS[z], 0.50, 0));
          }
        }
      } else {
        for (var b = 0; b < bandPaths.length; b++) {
          bandPaths[b].setAttribute("d", bandPath(BANDS[b], env, local));
        }
      }

      /* ── マイクの脈動（控えめに一定リズム。省モーションでは止める） ── */
      var ms = Math.min(V.span(local, 7.40, 7.90), 1 - V.span(local, 10.70, 11.40));
      var pulse = rm() ? 0.5 : 0.5 + 0.5 * Math.sin(local * Math.PI * 2 * 1.15);
      micRing.style.opacity = ((0.18 + 0.34 * pulse) * ms).toFixed(3);
      micRing.style.transform = "scale(" + (1 + (rm() ? 0 : 0.24 * pulse * ms)).toFixed(3) + ")";

      /* ── スコア: リングは 1.1 秒かけて満ち、数字はカウントアップ。
            出るまではパネルごと高さを畳んでおく（CSS の beat-4）。 */
      var hp = expoOut(V.span(local, 11.30, 12.40));
      setText(heroNum, hp > 0 ? String(Math.round(HERO.value * hp)) : "");
      heroRing.style.strokeDasharray = (HERO.value * hp).toFixed(1) + " 100";
      for (var j = 0; j < SIDE.length; j++) {
        var p = expoOut(V.span(local, SIDE[j].t, SIDE[j].t + 0.95));
        setText(sideNums[j], p > 0 ? String(Math.round(SIDE[j].value * p)) : "");
        /* ラベルだけ先に出ていると「数字が入っていない行」に見える。
           行ごと、その行の計測が始まる直前から出す（local の純関数なので冪等）。 */
        setVar(sideItems[j], "--o",
          V.span(local, SIDE[j].t - 0.28, SIDE[j].t + 0.22).toFixed(3));
      }

      /* コピーは前が抜けきる前に次が入る（重ねる）。
         以前は 9.60 退場 → 10.20 入場で 0.6 秒の字幕空白ができ、
         ちょうど 60s が画面下 25% 真っ黒の絵になっていた。 */
      pose(copy1, local, 2.00, 9.85, 0.032);
      pose(copy2, local, 9.58, 17.30, 0.028);
    }

    V.sceneDefs.push({ id: "s5", order: 5, build: build, update: update });
  })();

  /* ══════════════════════════════════════════════════════════════
     Scene 6 — Insight（68–78s / local 0–10s）
     折れ線が主役。統計は数字だけを大きく。おすすめは光が 1 度通る。
     ══════════════════════════════════════════════════════════════ */
  (function () {
    /* beat: 0 チャート / 1 統計 3 枚（同時。時差は CSS の --d で最大 0.08s）/ 2 おすすめ */
    var T6 = [0.20, 2.20, 5.20];

    /* 正答率の推移（固定データ。録画の再現性のため定数） */
    var DATA = [56, 63, 60, 69, 75, 72, 81, 86];
    var STATS = [
      /* カウントはカードが現れる少し前から始める（「0」が見えた瞬間が安く見える）。
         3 枚とも同時に走らせる（枚ごとに数え上がりがずれると列が揃って見えない）。 */
      { label: "今週の学習", value: 12.5, unit: "時間", dec: 1, start: 2.05 },
      { label: "正答率", value: 86, unit: "%", dec: 0, start: 2.10 },
      { label: "連続", value: 14, unit: "日", dec: 0, start: 2.15 }
    ];

    /* 図の座標系（横長。線を大きく見せる）。
       BASE は viewBox の底ぴったり。面の下辺に線が見えると図表くさくなる。 */
    var W = 960, H = 208, PADX = 34, PADY = 24, BASE = H;

    var root, linePath, areaPath, endDot, endHalo, recoInner;
    var statNums = [], copySpans;

    function points() {
      var lo = 50, hi = 90, pts = [];
      for (var i = 0; i < DATA.length; i++) {
        var x = PADX + i * (W - PADX * 2) / (DATA.length - 1);
        var y = PADY + (1 - (DATA[i] - lo) / (hi - lo)) * (H - PADY * 2);
        pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      }
      return pts;
    }

    function build(rootEl) {
      root = rootEl;

      var wrap = el("div", "s6-wrap");

      /* ── 主役: 折れ線グラフ ── */
      var chart = el("div", "vqad-glass s6-chart");
      chart.appendChild(el("div", "s6-chart-title", "正答率の推移"));

      var pts = points();
      var d = "";
      for (var i = 0; i < pts.length; i++) {
        d += (i === 0 ? "M" : "L") + pts[i][0] + " " + pts[i][1] + " ";
      }
      var first = pts[0], last = pts[pts.length - 1];
      /* 面は **最初と最後のデータ点の間だけ**。グリッド線と同じ余白（PADX）で
         始まり、同じ余白で終わる。以前は viewBox の左右いっぱいまで伸ばしていたので、
         最終点 86% を越えて右端まで平らに続き、カードの角丸で断ち切られていた
         （実測 71s: クライマックスの点が右端に無く、グラフが枠で切れた印象）。
         端の縦の直線は下の横マスクで溶かす。 */
      var areaD = "M" + first[0] + " " + first[1] + " " + d.slice(d.indexOf("L")) +
        "L" + last[0] + " " + BASE + " L" + first[0] + " " + BASE + " Z";

      /* 面はシアン 22% → 透明。線はシアン 1 色（1 面につきアクセント 1 つ）。 */
      var svgWrap = el("div", "s6-svg-wrap");
      svgWrap.innerHTML =
        "<svg class='s6-svg' viewBox='0 0 " + W + " " + H + "' aria-hidden='true'>" +
        "<defs>" +
        "<linearGradient id='s6LineGrad' x1='0' y1='0' x2='1' y2='0'>" +
        "<stop offset='0' stop-color='#4f8dff'/>" +
        "<stop offset='0.6' stop-color='#64e0ff'/>" +
        "<stop offset='1' stop-color='#b9f2ff'/></linearGradient>" +
        /* 面グラデは viewBox の上端ではなく「線が通る帯の上端（y=28）」から始める。
           上端起点だと線の位置ではもう 18%→10% まで落ちていて、面が存在しないように見えた。 */
        "<linearGradient id='s6AreaGrad' gradientUnits='userSpaceOnUse'" +
        " x1='0' y1='28' x2='0' y2='" + BASE + "'>" +
        "<stop offset='0' stop-color='#64e0ff' stop-opacity='0.22'/>" +
        "<stop offset='0.55' stop-color='#64e0ff' stop-opacity='0.11'/>" +
        "<stop offset='1' stop-color='#64e0ff' stop-opacity='0'/></linearGradient>" +
        /* 横方向のマスク。面は最終点の手前から静かに消える（縦の切り口を作らない）。 */
        "<linearGradient id='s6AreaFadeG' gradientUnits='userSpaceOnUse'" +
        " x1='" + first[0] + "' y1='0' x2='" + last[0] + "' y2='0'>" +
        "<stop offset='0' stop-color='#000'/>" +
        "<stop offset='0.05' stop-color='#fff'/>" +
        "<stop offset='0.90' stop-color='#fff'/>" +
        "<stop offset='1' stop-color='#000'/></linearGradient>" +
        "<mask id='s6AreaFade' maskUnits='userSpaceOnUse'" +
        " x='0' y='0' width='" + W + "' height='" + H + "'>" +
        "<rect x='" + first[0] + "' y='0' width='" + (last[0] - first[0]) + "'" +
        " height='" + H + "' fill='url(#s6AreaFadeG)'/></mask>" +
        /* グリッドは面と同じ範囲で、両端だけを軽く溶かす（端の処理を揃える） */
        "<linearGradient id='s6GridFadeG' gradientUnits='userSpaceOnUse'" +
        " x1='" + first[0] + "' y1='0' x2='" + last[0] + "' y2='0'>" +
        "<stop offset='0' stop-color='#000'/>" +
        "<stop offset='0.035' stop-color='#fff'/>" +
        "<stop offset='0.965' stop-color='#fff'/>" +
        "<stop offset='1' stop-color='#000'/></linearGradient>" +
        "<mask id='s6GridFade' maskUnits='userSpaceOnUse'" +
        " x='0' y='0' width='" + W + "' height='" + H + "'>" +
        "<rect x='" + first[0] + "' y='0' width='" + (last[0] - first[0]) + "'" +
        " height='" + H + "' fill='url(#s6GridFadeG)'/></mask>" +
        "</defs>" +
        "<g mask='url(#s6GridFade)'>" +
        "<line class='s6-gridline' x1='" + PADX + "' y1='56' x2='" + (W - PADX) + "' y2='56'/>" +
        "<line class='s6-gridline' x1='" + PADX + "' y1='104' x2='" + (W - PADX) + "' y2='104'/>" +
        "<line class='s6-gridline' x1='" + PADX + "' y1='152' x2='" + (W - PADX) + "' y2='152'/>" +
        "</g>" +
        "<path class='s6-area' d='" + areaD + "' fill='url(#s6AreaGrad)'" +
        " mask='url(#s6AreaFade)'/>" +
        "<path class='s6-line' d='" + d.trim() + "' pathLength='1'" +
        " fill='none' stroke='url(#s6LineGrad)' stroke-width='3'" +
        " stroke-linecap='round' stroke-linejoin='round'/>" +
        "<circle class='s6-dot-halo' cx='" + last[0] + "' cy='" + last[1] + "' r='0'/>" +
        "<circle class='s6-dot' cx='" + last[0] + "' cy='" + last[1] + "' r='0'/>" +
        "</svg>";
      chart.appendChild(svgWrap);
      linePath = svgWrap.querySelector(".s6-line");
      areaPath = svgWrap.querySelector(".s6-area");
      endDot = svgWrap.querySelector(".s6-dot");
      endHalo = svgWrap.querySelector(".s6-dot-halo");
      wrap.appendChild(chart);

      /* ── 統計: 塗らない。数字だけを大きく ── */
      var stats = el("div", "s6-stats");
      for (var j = 0; j < STATS.length; j++) {
        var card = el("div", "s6-stat s6-stat-" + j);
        card.appendChild(el("div", "s6-stat-label", STATS[j].label));
        var row = el("div", "s6-stat-row");
        var num = el("span", "s6-stat-num", "0");
        row.appendChild(num);
        row.appendChild(el("span", "s6-stat-unit", STATS[j].unit));
        card.appendChild(row);
        stats.appendChild(card);
        statNums.push(num);
      }
      wrap.appendChild(stats);

      /* ── 苦手 → 次のおすすめ（細い線 + 小さな三角。光は 1 度だけ通る） ── */
      var reco = el("div", "s6-reco");
      recoInner = el("div", "s6-reco-inner");
      var weak = el("span", "s6-chip s6-chip-weak");
      weak.appendChild(el("span", "s6-chip-kicker", "苦手"));
      weak.appendChild(el("span", "s6-chip-body", "仮定法"));
      recoInner.appendChild(weak);
      var arrow = el("span", "s6-arrow");
      arrow.innerHTML =
        "<svg viewBox='0 0 40 12' aria-hidden='true'>" +
        "<line x1='0' y1='6' x2='29' y2='6' stroke='currentColor' stroke-width='1'/>" +
        "<path d='M29 2.4 L37 6 L29 9.6 Z' fill='currentColor'/></svg>";
      recoInner.appendChild(arrow);
      var next = el("span", "s6-chip s6-chip-next");
      next.appendChild(el("span", "s6-chip-kicker", "次のおすすめ"));
      next.appendChild(el("span", "s6-chip-body", "仮定法 集中セット"));
      recoInner.appendChild(next);
      recoInner.appendChild(el("span", "s6-reco-sweep"));
      reco.appendChild(recoInner);
      wrap.appendChild(reco);

      rootEl.appendChild(wrap);
      copySpans = copyEl(rootEl, "s6-copy", "結果は、次の学びになる。");
    }

    function update(local, dur, api) {
      V.beats(root, local, T6);

      /* ── 折れ線の描画（1.7 秒かけて左から）──
         expo だと前半で描き切ってしまうので、両端を緩める inOut を使う。 */
      var k = V.ease.inOut(V.span(local, 0.60, 2.30));
      linePath.style.strokeDashoffset = String((1 - k).toFixed(4));
      setVar(areaPath, "--o", V.ease.inOut(V.span(local, 1.40, 2.80)).toFixed(3));

      /* 先端の発光ドット（線が描き終わる頃に生まれる） */
      var dk = Math.max(0, V.ease.outBack(V.span(local, 2.20, 2.75)));
      endDot.setAttribute("r", (4.2 * dk).toFixed(2));
      endHalo.setAttribute("r", (13 * dk).toFixed(2));

      /* ── 統計のカウントアップ ── */
      for (var j = 0; j < STATS.length; j++) {
        var st = STATS[j];
        var p = expoOut(V.span(local, st.start, st.start + 1.15));
        setText(statNums[j], st.dec ? (st.value * p).toFixed(1) : String(Math.round(st.value * p)));
      }

      /* ── おすすめ行を光が 1 度だけ通る（local 駆動なので seek しても同じ） ── */
      var sw = V.ease.inOut(V.span(local, 6.00, 7.10));
      setVar(recoInner, "--sw", sw.toFixed(4));
      var so = rm() ? 0 : Math.sin(Math.PI * sw);
      setVar(recoInner, "--swo", (so * so).toFixed(3));

      /* コピーは線が引き終わる頃から立ち上げる。
         12 文字 × 0.030 + 0.52 なので 2.75s には出揃う。 */
      pose(copySpans, local, 1.90, 9.30, 0.030);
    }

    V.sceneDefs.push({ id: "s6", order: 6, build: build, update: update });
  })();
})();
