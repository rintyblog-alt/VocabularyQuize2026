/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — 実装 C（scenes-a.js / scenes-a.css のみ担当）

   Scene 1: Opening（字幕カード + キネティックコピー + 光の一閃）
   Scene 2: プリセットライブラリ（暗い面のカード・極細線画・下を流れるチップ）
   Scene 3: Quick Mock（資料の断片 → 極細ステッパー → 試験用紙 → スマホ枠）

   規約（DESIGN.md §3）:
   ・すべての見た目は update(local) の local 秒から決める（冪等・seek 耐性）
   ・離散状態はクラス切替（収束は CSS transition が担う）、連続値は inline style
   ・乱数もタイマーも持たない（固定パラメータ表で決定的）

   美学（今回の改修方針）:
   ・キャンディ色を使わない。面は深いインディゴ、色は発光でだけ触れる
   ・面には必ず「上辺の高光り・内側の落ち込み・接地影」を作る
   ・模様は敷かない。使うなら極細の線画を 9% の不透明度で沈める
   ・イージングは長い尾（cubic-bezier(0.16,1,0.3,1) 相当）。出現に 0.9 秒使う
   ・主役 1 つ＋脇役の時差。全部を同時に動かさない
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var V = window.VQAD;
  var E = V.ease;

  /* ────────────────────────────────────────────────────────────────
     道具
     ──────────────────────────────────────────────────────────────── */

  /* 要素を 1 つ作る */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* 長い尾のイージング。cubic-bezier(0.16, 1, 0.3, 1) の代替。
     ease-out の短いやつは「安い動き」に見えるので既定はこちら。 */
  function outLong(t) { t = V.clamp01(t); var u = 1 - t; return 1 - u * u * u * u * u; }
  /* 少しだけ尾が短い版（線が満ちる・下線が滑る等の中距離の動きに使う） */
  function outSoft(t) { t = V.clamp01(t); var u = 1 - t; return 1 - u * u * u * u; }
  /* 0 → 1 → 0 の山（1 度だけの揺り戻しに使う。local の純関数） */
  function pulse(local, t0, dur) {
    var p = (local - t0) / dur;
    if (p <= 0 || p >= 1) return 0;
    return Math.sin(Math.PI * p);
  }

  /* コピー 1 本。1 文字ずつの span に割って持つ（行ごとフェードは安く見える）。 */
  function copyLine(cls, text) {
    var node = el("div", cls);
    return { node: node, spans: V.kinSplit(node, text) };
  }
  /* 位置と不透明度は kinPose（純関数）が書く。ここは表示可否だけ裁く。 */
  function poseCopy(c, local, tIn, tOut, stagger) {
    var vis = V.kinPose(c.spans, local, tIn, tOut, stagger);
    c.node.style.visibility = vis ? "visible" : "hidden";
  }

  /* ════════════════════════════════════════════════════════════════
     Scene 1 — Opening（0–10s / 背景が主役。DOM は最小）
     ════════════════════════════════════════════════════════════════ */

  V.sceneDefs.push({
    id: "s1", order: 1,

    build: function (root) {
      /* 字幕カード: 画面中央上に極小キャップス、上下に 1px のヘアライン。
         左上に小さく置くと「デバッグ表示」に見える。中央に据えると映画の題字になる。 */
      var kick = el("div", "s1-kicker");
      var h1 = el("i", "s1-hair"), h2 = el("i", "s1-hair");
      var kt = el("span", "s1-kick-t", "VOCABUQUIZ V3 — CINEMATIC PREVIEW");
      kick.appendChild(h1);
      kick.appendChild(kt);
      kick.appendChild(h2);
      this.kicker = kick;
      this.hairs = [h1, h2];
      this.kickT = kt;

      this.copyA = copyLine("vqad-copy s1-copy", "学びは、もっと自由に進化できる。");
      this.copyB = copyLine("vqad-copy s1-copy", "これが、新しい学びの流れ。");

      /* コピーの下を 1 度だけ通り抜ける細い光 */
      var sweep = el("div", "s1-sweep", "<i></i>");
      this.sweep = sweep;
      this.sweepBar = sweep.firstChild;

      root.appendChild(kick);
      root.appendChild(this.copyA.node);
      root.appendChild(this.copyB.node);
      root.appendChild(sweep);
    },

    update: function (local) {
      /* ── 字幕カード: ヘアラインが先に伸び、文字が遅れて座る ── */
      var k = outLong(V.span(local, 0.7, 2.3));
      var kOut = E.inOut(V.span(local, 7.5, 8.6));
      var kv = k * (1 - kOut);
      this.kicker.style.opacity = kv.toFixed(3);
      this.kicker.style.visibility = kv <= 0.002 ? "hidden" : "visible";
      this.hairs[0].style.transform = "scaleX(" + (0.08 + 0.92 * k).toFixed(3) + ")";
      this.hairs[1].style.transform = "scaleX(" + (0.08 + 0.92 * outLong(V.span(local, 0.85, 2.45))).toFixed(3) + ")";
      var kt = outLong(V.span(local, 1.05, 2.5));
      this.kickT.style.transform = "translateY(" + (5 * (1 - kt)).toFixed(2) + "px)";
      this.kickT.style.filter = kt >= 1 ? "" : "blur(" + (4 * (1 - kt)).toFixed(2) + "px)";

      /* ── コピー 2 本（1 文字ずつ入り、まとめて抜ける）── */
      poseCopy(this.copyA, local, 2.0, 5.9, 0.045);
      poseCopy(this.copyB, local, 6.6, 9.7, 0.05);

      /* ── 光の一閃（1 回だけ・コピー A の下を左から右へ）── */
      var sw = V.span(local, 3.9, 5.5);
      if (sw <= 0 || sw >= 1) {
        this.sweep.style.visibility = "hidden";
      } else {
        this.sweep.style.visibility = "visible";
        this.sweep.style.opacity = Math.min(1, sw * 6, (1 - sw) * 4).toFixed(3);
        this.sweepBar.style.transform = "translateX(" + (-130 + 350 * E.inOut(sw)).toFixed(2) + "%)";
      }
    }
  });

  /* ════════════════════════════════════════════════════════════════
     Scene 2 — プリセットライブラリ（10–22s）
     局所時刻: パネル 0.25 / カード 0.9〜 / タブ 1.5→自分 4.0→公開 6.5→公式
               コピー 2.0 / 近景チップ 4.2〜7.3 と 7.3〜10.7
     ════════════════════════════════════════════════════════════════ */

  /* カード 6 枚。
     表紙は「模様」ではなく **教科イニシャルの大型タイポ 1 文字**。
     同心円・サイン波・六角格子…を並べると中身と無関係な模様の見本帳に見え、
     しかも全部が同じ線画なので個体差が消える。文字なら一目で教科が判る。
     g   : 表紙に敷く 1 文字（右下へはみ出すようトリミングする）
     acc : その教科に 1 色だけ、ごく淡く効かせるアクセント r,g,b */
  var S2_CARDS = [
    { t: "日本史・鎌倉", s: "4択 ・ 24問",       acc: "139,133,216", g: "史" },
    { t: "英単語 TOEFL", s: "音声 ・ 60問",       acc: "100,224,255", g: "E" },
    { t: "化学基礎",     s: "穴埋め ・ 30問",     acc: "79,141,255",  g: "化" },
    { t: "古文単語",     s: "マッチング ・ 40問", acc: "226,178,104", g: "古" },
    { t: "世界史・近代", s: "記述 ・ 28問",       acc: "255,45,146",  g: "世" },
    { t: "情報 Ⅰ",      s: "並べ替え ・ 22問",   acc: "120,160,255", g: "情" }
  ];

  /* 形式チップは 2 枚だけ。
     以前は 3 枚を 1.1〜2.4px のぼかしで流していたが、ぼかしが文字サイズに対して
     浅すぎて **カードに付いたバッジ**（穴埋めが「情報Ⅰ」の右下角に重なった）や
     **描画の汚れ**（リスニングが画面下端の光の帯に滲んだ）に誤読された。
     近景だと一目で分かる条件は「大きい・強くぼける・速く通る」の 3 つ。
     ぼかしは文字の実サイズに対する比で効くので、拡大率とセットで決める
     （例: 12.5px × 2.05 = 25.6px の字に 5.2px ＝ 比 0.20。明らかに焦点外）。
     sc0→sc1 で通過中に少しだけ近づき、drift で斜めに抜ける。 */
  var S2_CHIPS = [
    { t: "穴埋め",     top: 61, sc0: 1.62, sc1: 1.86, bl: 4.0, t0: 4.2, dur: 3.1, drift:  26 },
    { t: "リスニング", top: 70, sc0: 1.94, sc1: 2.22, bl: 5.2, t0: 7.3, dur: 3.4, drift: -30 }
  ];

  V.sceneDefs.push({
    id: "s2", order: 2,

    build: function (root) {
      var self = this;
      var i;

      var wrap = el("div", "s2-wrap");
      var panel = el("div", "s2-panel vqad-glass");
      wrap.appendChild(panel);

      /* ヘッダ（要素は 1 つだけ。広告であって管理画面ではない） */
      var head = el("div", "s2-head");
      head.appendChild(el("div", "s2-title", "プリセットライブラリ"));
      panel.appendChild(head);

      /* タブ 3 つ + 光る 2px の下線 */
      var tabsBox = el("div", "s2-tabs");
      var tabNames = ["自分のプリセット", "公開", "公式"];
      this.tabs = [];
      for (i = 0; i < 3; i++) {
        var tb = el("div", "s2-tab", tabNames[i]);
        this.tabs.push(tb);
        tabsBox.appendChild(tb);
      }
      this.ink = el("div", "s2-ink");
      tabsBox.appendChild(this.ink);
      panel.appendChild(tabsBox);

      /* カードグリッド 3×2 */
      var grid = el("div", "s2-grid");
      this.cards = [];
      for (i = 0; i < S2_CARDS.length; i++) {
        var c = S2_CARDS[i];
        var card = el("div", "s2-card");
        card.style.setProperty("--s2-acc", c.acc);
        /* 表紙 = 深いインディゴ + 教科 1 色の淡い光 + 右下へトリミングした大型タイポ。
           ラテン 1 文字は和文と字面の高さが違うので置き方を分ける。 */
        var lat = c.g.charCodeAt(0) < 0x2e80 ? " is-lat" : "";
        card.appendChild(el("div", "s2-cover",
          '<span class="s2-glyph' + lat + '">' + c.g + "</span>"));
        var body = el("div", "s2-card-body");
        body.appendChild(el("div", "s2-name", c.t));
        body.appendChild(el("div", "s2-meta", c.s));
        body.appendChild(el("span", "s2-badge",
          '<span class="s2-b0">MY PRESET</span>' +
          '<span class="s2-b1">PUBLIC</span>' +
          '<span class="s2-b2">OFFICIAL</span>'));
        card.appendChild(body);
        this.cards.push(card);
        grid.appendChild(card);
      }
      panel.appendChild(grid);

      /* 形式チップ（パネルの手前を横切る層） */
      var band = el("div", "s2-chipband");
      this.chips = [];
      for (i = 0; i < S2_CHIPS.length; i++) {
        var chip = el("div", "s2-chip", S2_CHIPS[i].t);
        chip.style.top = S2_CHIPS[i].top + "%";
        this.chips.push(chip);
        band.appendChild(chip);
      }

      this.copy = copyLine("vqad-copy s2-copy", "学びたいものが、ここに集まる。");
      this.panel = panel;
      root.appendChild(wrap);
      root.appendChild(band);
      root.appendChild(this.copy.node);

      /* タブ下線はレイアウト計測が要る（visibility:hidden でも計測可）。
         リサイズしたら測り直す */
      this.inkDirty = true;
      this.rects = null;
      window.addEventListener("resize", function () { self.inkDirty = true; });
    },

    update: function (local, dur) {
      var i;

      /* ── パネル: 奥から 1.4 秒かけて浮上 → 微かな漂い → 終盤にわずかに退く ── */
      var ap = outLong(V.span(local, 0.2, 1.6));
      var ex = E.inOut(V.span(local, dur - 1.2, dur));
      var floatY = Math.sin(local * 0.62) * 3.4;
      var rx = 3.6 + Math.sin(local * 0.41 + 1.7) * 0.6;
      var ry = -5.2 + Math.sin(local * 0.29) * 0.8;
      this.panel.style.opacity = ap.toFixed(3);
      this.panel.style.transform =
        "rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)" +
        " translateY(" + (40 * (1 - ap) + floatY - 10 * ex).toFixed(2) + "px)" +
        " translateZ(" + (-240 * (1 - ap)).toFixed(1) + "px)" +
        " scale(" + (0.95 + 0.05 * ap - 0.025 * ex).toFixed(4) + ")";
      this.panel.style.filter = ap >= 1 ? "" : "blur(" + (10 * (1 - ap)).toFixed(2) + "px)";

      /* ── タブ: 1.5s 自分 → 4.0s 公開 → 6.5s 公式（下線が 0.55 秒で滑る）── */
      if (this.inkDirty) {
        this.rects = [];
        for (i = 0; i < 3; i++) {
          this.rects.push({ x: this.tabs[i].offsetLeft, w: this.tabs[i].offsetWidth });
        }
        this.inkDirty = false;
      }
      /* p は 0→1→2 の連続値。切替の 0.55 秒だけ長い尾で移動する */
      var p = outSoft(V.span(local, 4.0, 4.55)) + outSoft(V.span(local, 6.5, 7.05));
      var lo = Math.floor(p), hi = Math.min(2, lo + 1), f = p - lo;
      var ix = V.lerp(this.rects[lo].x, this.rects[hi].x, f);
      var iw = V.lerp(this.rects[lo].w, this.rects[hi].w, f);
      var born = outLong(V.span(local, 1.5, 2.2));
      this.ink.style.opacity = born.toFixed(3);
      this.ink.style.transform =
        "translateX(" + ix.toFixed(1) + "px) scaleX(" + (iw * born).toFixed(2) + ")";

      /* 離散状態（アクティブタブ・バッジの文言と枠色） */
      var mode = local < 4.0 ? 0 : local < 6.5 ? 1 : 2;
      for (i = 0; i < 3; i++) {
        this.tabs[i].classList.toggle("is-on", local >= 1.5 && i === mode);
        this.panel.classList.toggle("s2-mode-" + i, i === mode);
      }

      /* ── カード: 0.9 秒かけて「奥から + ぼかし解除 + 僅かな回転」。
            スタッガー 0.09 秒。タブ切替では小さく沈んで戻る（差し替えの重み）。 ── */
      for (i = 0; i < this.cards.length; i++) {
        var t0 = 0.75 + i * 0.09;
        var ck = outLong(V.span(local, t0, t0 + 0.9));
        var sw = Math.max(pulse(local, 4.02 + i * 0.045, 0.62), pulse(local, 6.52 + i * 0.045, 0.62));
        var card = this.cards[i];
        var tilt = (i % 2 ? 2.6 : -2.6) * (1 - ck);
        card.style.opacity = (ck * (1 - 0.34 * sw)).toFixed(3);
        card.style.transform =
          "perspective(760px)" +
          " translateZ(" + (-150 * (1 - ck) - 26 * sw).toFixed(1) + "px)" +
          " translateY(" + (16 * (1 - ck) + 5 * sw).toFixed(2) + "px)" +
          " rotateX(" + (-5 * (1 - ck)).toFixed(2) + "deg)" +
          " rotateY(" + tilt.toFixed(2) + "deg)";
        card.style.filter = (ck >= 1 && sw <= 0) ? ""
          : "blur(" + (9 * (1 - ck) + 3.4 * sw).toFixed(2) + "px)";
      }

      /* ── 形式チップ: 2 枚だけが「近景」としてパネルの手前を速く抜ける ──
            大きく・強くぼかし・不透明度を落とす。1 枚ずつしか出さないので
            カードの角と重なっても「バッジ」には見えない。 */
      for (i = 0; i < this.chips.length; i++) {
        var cf = S2_CHIPS[i];
        var ckp = V.span(local, cf.t0, cf.t0 + cf.dur);
        var chip = this.chips[i];
        if (ckp <= 0 || ckp >= 1) { chip.style.visibility = "hidden"; continue; }
        chip.style.visibility = "visible";
        chip.style.opacity = (Math.min(1, ckp * 7, (1 - ckp) * 7) * 0.62).toFixed(3);
        chip.style.transform =
          "translateX(" + (-30 + 168 * ckp).toFixed(2) + "vw)" +
          " translateY(" + (cf.drift * ckp + Math.sin(local * 0.9 + i * 2.1) * 5).toFixed(2) + "px)" +
          " scale(" + (cf.sc0 + (cf.sc1 - cf.sc0) * ckp).toFixed(3) + ")";
        chip.style.filter = "blur(" + cf.bl + "px)";
      }

      /* コピー（12s abs = local 2.0。退場はシーンのフェード任せ） */
      poseCopy(this.copy, local, 2.0, 99, 0.05);
    }
  });

  /* ════════════════════════════════════════════════════════════════
     Scene 3 — Quick Mock（22–38s）
     局所時刻: 断片 0–5.9 / ステッパー 3.0（点灯 3.5,5,7,9,11,13）/
               紙面 6.2 / スマホ 12.0 / コピー 3.55・9.0
     ════════════════════════════════════════════════════════════════ */

  /* 資料の断片（x,y: 中心からの開始位置 vw/vh、r: 傾き deg、d: 吸い寄せの時差、
     z: 奥行き -1 遠 / 0 中 / 1 近、p: 版面の中身）。
     丸バーを 3 本並べた白い角丸長方形は Word / Google Docs のプレースホルダそのもので、
     一目で安く見える。**実際の答案の版面を縮小したもの**を敷く。組版言語は
     s3-paper（明朝の見出し行・「第1問」の枠・罫・①〜④・解答欄）と揃える。

     配置の決め方: 26s（local 4.0）は「資料が集まってくる」場面の代表フレーム。
     以前は d を 0〜1.4 に詰めていたため、その時刻には早い断片が中央へ消え、
     残りが右上へ固まって左下が空になった（暗部 42.7%）。
     d を 0〜2.55 まで開き、**下左（近景の大判）と下右（中景）を最後に残す**。 */
  var S3_FRAGS = [
    {
      x: -33, y: -19, r: -13.0, d: 0.00, z: 0,
      p: { t: "実力確認テスト", n: "第1問", s: "次の各問いに答えなさい。",
           q: ["問1　資料の内容として正しいものを、次の①〜④から一つ選べ。",
               "問2　下線部の理由を簡潔に記述せよ。"] }
    },
    {
      x: 32, y: -25, r: 11.0, d: 0.35, z: 0,
      p: { t: "日本史 演習", n: "第2問", s: "配点 20",
           q: ["問1　鎌倉幕府の成立過程について述べた文を選べ。",
               "問2　守護と地頭の職務の違いを説明せよ。"] }
    },
    {
      x: -40, y: 13, r: 8.0, d: 0.75, z: -1,
      p: { t: "英語 長文読解", n: "第1問", s: "次の英文を読み、問いに答えよ。",
           q: ["問1　本文の主題として最も適切なものを一つ選べ。",
               "問2　下線部を日本語に訳しなさい。"] }
    },
    {
      x: -14, y: -31, r: 16.5, d: 1.15, z: -1,
      p: { t: "古文 単語演習", n: "第1問", s: "傍線部の意味を答えよ。",
           q: ["問1　傍線部Aの語の意味として適切なものを選べ。",
               "問2　助動詞の意味と活用形を答えよ。"] }
    },
    {
      x: 40, y: 6, r: -10.5, d: 1.75, z: -1,
      p: { t: "化学基礎 小テスト", n: "第3問", s: "配点 15",
           q: ["問1　物質量に関する記述として誤りを含むものを選べ。",
               "問2　中和滴定の量的関係を式で示せ。"] }
    },
    {
      x: 31, y: 27, r: -7.0, d: 2.55, z: 0,
      p: { t: "世界史 演習", n: "第2問", s: "配点 18",
           q: ["問1　産業革命の影響として適切なものを一つ選べ。",
               "問2　その背景を年表を用いて説明せよ。"] }
    },
    {
      x: -28, y: 22, r: -12.0, d: 2.80, z: 1,
      p: { t: "模擬試験 第2回", n: "第4問", s: "配点 25",
           q: ["問1　資料Ⅰ・Ⅱから読み取れる内容を一つ選べ。",
               "問2　その変化の背景を四十字以内で述べよ。"] }
    }
  ];

  /* 奥行きの表（z = -1 / 0 / 1 → 添字 0 / 1 / 2）。
     近いものは **大きく・強くぼけて・速く** 通る。これが無いと 6 枚が同じ大きさ
     同じ速さで漂うだけになり、「集まってくる」動きの気配が出ない。
     sc: 基準倍率 / bl: 被写界深度の常時ぼかし / dur: 吸い寄せに使う秒数 /
     mb: 動きぼけの係数（画面上の速度に比例して足す） */
  var S3_DEPTH = [
    { sc: 0.76, bl: 0.9, dur: 3.4, mb: 1.8, cls: "is-far" },
    { sc: 1.00, bl: 0.0, dur: 2.6, mb: 2.6, cls: "" },
    { sc: 1.30, bl: 2.4, dur: 1.9, mb: 4.0, cls: "is-near" }
  ];

  var S3_STEPS = ["条件", "教材", "構成案", "問題", "紙面", "完成"];
  var S3_LIT = [3.5, 5, 7, 9, 11, 13]; /* 各ステップの点灯時刻（= abs 25.5〜35s） */
  var S3_ROWS = [6.8, 7.5, 8.1, 8.7, 9.3, 9.9]; /* 紙面の各行が生まれる時刻 */

  /* 断片の中身 = 答案の版面のミニチュア。
     紙色は必ず .s3-fill（inset:0 の 1 枚）が塗る。背景を要素本体だけに任せると
     合成の都合で塗りが落ちて「真っ黒な板」になった実績があるので、
     全カードが同じ紙色レイヤーを必ず 1 枚持つ構造にしてある。 */
  function fragHtml(fp) {
    var pg = fp.p, i;
    var h = '<i class="s3-fill"></i><i class="s3-fold"></i><div class="s3-fpage">';
    h += '<div class="s3-fhead"><span class="s3-ftitle">' + pg.t + "</span>" +
      '<span class="s3-fname">氏名<i></i></span></div>';
    h += '<div class="s3-fh1"><span class="s3-fnum">' + pg.n + "</span>" +
      '<span class="s3-fnumt">' + pg.s + "</span></div>";
    for (i = 0; i < pg.q.length; i++) h += '<p class="s3-fq">' + pg.q[i] + "</p>";
    h += '<div class="s3-fch"><span>①<i></i></span><span>②<i></i></span>' +
      "<span>③<i></i></span><span>④<i></i></span></div>";
    h += '<div class="s3-fans"><span>解答欄</span></div>';
    return h + "</div>";
  }

  /* 紙面の 1 行を作る（real: 完成形 / skel: 骨組みバーのオーバーレイ） */
  function s3Row(cls, realHtml, skelBars) {
    var row = el("div", "s3-row " + cls);
    row.appendChild(el("div", "s3-real", realHtml));
    var sk = el("div", "s3-skel");
    for (var i = 0; i < skelBars.length; i++) {
      var b = el("span", "s3-skelbar");
      b.style.width = skelBars[i] + "%";
      sk.appendChild(b);
    }
    row.appendChild(sk);
    return row;
  }

  V.sceneDefs.push({
    id: "s3", order: 3,

    build: function (root) {
      var i;

      /* ── 資料の断片（角の折れ目・罫線の濃淡・傾き差 + 奥行き 3 段） ── */
      var frags = el("div", "s3-frags");
      this.fragEls = [];
      for (i = 0; i < S3_FRAGS.length; i++) {
        var dp = S3_DEPTH[S3_FRAGS[i].z + 1];
        var fr = el("div", "s3-frag" + (dp.cls ? " " + dp.cls : ""), fragHtml(S3_FRAGS[i]));
        fr.style.zIndex = String(S3_FRAGS[i].z + 1); /* 近いものが手前に重なる */
        this.fragEls.push(fr);
        frags.appendChild(fr);
      }
      this.frags = frags;
      root.appendChild(frags);

      /* ── ステッパー: 極細の線 1 本の上に 4px の点が 6 つ。番号は出さない。
            番号付きの丸を並べるとウィザード UI に見えて広告の空気が壊れる。 ── */
      var st = el("div", "s3-stepper");
      var track = el("div", "s3-track");
      this.trackFill = el("i", "s3-trackfill");
      track.appendChild(this.trackFill);
      st.appendChild(track);
      var steps = el("div", "s3-steps");
      this.stepEls = [];
      for (i = 0; i < S3_STEPS.length; i++) {
        var step = el("div", "s3-step",
          '<i class="s3-pt"></i><span class="s3-lab">' + S3_STEPS[i] + "</span>");
        this.stepEls.push(step);
        steps.appendChild(step);
      }
      st.appendChild(steps);
      this.stepper = st;
      root.appendChild(st);

      /* ── 白い試験用紙（段階的に組み上がる） ── */
      var pwrap = el("div", "s3-paperwrap");
      var paper = el("div", "s3-paper");
      this.rows = [
        s3Row("s3-p-titlerow",
          '<span class="s3-p-title">実力確認テスト</span>' +
          '<span class="s3-p-name">氏名<i></i></span>',
          [44, 18]),
        s3Row("s3-p-h1row",
          '<span class="s3-p-h1">第1問</span>' +
          '<span class="s3-p-h1t">次の各問いに答えなさい。（配点 20）</span>',
          [58]),
        s3Row("s3-p-q",
          "問1　資料の内容として正しいものを、次の①〜④から一つ選べ。",
          [86]),
        s3Row("s3-p-q",
          "問2　下線部について、その理由を簡潔に記述せよ。",
          [68]),
        s3Row("s3-p-choicerow",
          '<span class="s3-choice">①<i></i></span>' +
          '<span class="s3-choice">②<i></i></span>' +
          '<span class="s3-choice">③<i></i></span>' +
          '<span class="s3-choice">④<i></i></span>',
          [74]),
        s3Row("s3-p-ansrow",
          '<span class="s3-anslab">解答欄</span>',
          [100])
      ];
      for (i = 0; i < this.rows.length; i++) paper.appendChild(this.rows[i]);
      pwrap.appendChild(paper);
      this.paper = paper;
      root.appendChild(pwrap);

      /* ── スマホ枠（同じ紙のミニチュア。枠の内側にガラスのグレアを 1 本）── */
      var phone = el("div", "s3-phone",
        '<span class="s3-ph-notch"></span>' +
        '<div class="s3-ph-scr">' +
        '<span class="s3-m-bar s3-m-title"></span>' +
        '<span class="s3-m-h">第1問</span>' +
        '<span class="s3-m-bar" style="width:92%"></span>' +
        '<span class="s3-m-bar" style="width:76%"></span>' +
        '<span class="s3-m-bar" style="width:84%"></span>' +
        '<span class="s3-m-ans"></span>' +
        '<i class="s3-ph-glare"></i>' +
        "</div>");
      this.phone = phone;
      root.appendChild(phone);

      this.copyA = copyLine("vqad-copy s3-copy", "資料から、本番形式の試験へ。");
      this.copyB = copyLine("vqad-copy s3-copy", "AIと一緒に、試験をつくる。");
      root.appendChild(this.copyA.node);
      root.appendChild(this.copyB.node);
    },

    update: function (local, dur) {
      var i;

      /* ── 断片: 漂いながら中央へ吸い寄せられ、縮んで消える ──
            奥行きで「大きさ・ぼけ・速さ」を変える。近い断片は 1.9 秒で抜け、
            遠い断片は 3.4 秒かけて漂う。速度に比例した動きぼけも足す。 */
      var fragsOn = local < 5.9;
      this.frags.style.visibility = fragsOn ? "visible" : "hidden";
      if (fragsOn) {
        for (i = 0; i < this.fragEls.length; i++) {
          var fp = S3_FRAGS[i];
          var dp = S3_DEPTH[fp.z + 1];
          /* 吸い寄せは 1 枚ずつ時差で。全部が同時に動くと軽く見える。 */
          var t0 = 1.05 + fp.d;
          var u = V.span(local, t0, t0 + dp.dur);
          var k = E.inOut(u);
          var oIn = outLong(V.span(local, 0.05 + i * 0.09, 0.9 + i * 0.09));
          /* 消え際: 白い紙をただ薄くすると、黒い宇宙の上では **灰色の平らな板** に
             なる（実測 26s で不透明度 27% の灰色の四角が残っていた）。
             ぼかしが紙の大きさに対して小さいと、いくら薄くしても輪郭が四角いまま。
             そこで「不透明度は最後まで落とさず、ぼかしを紙の幅と同じ桁まで上げて
             光に溶かす」向きに変える（away 0.9 で 39px ＝ 縮んだ紙の幅の半分弱）。 */
          var away = V.span(k, 0.66, 0.93);
          var oOut = 1 - Math.pow(away, 2.6);
          var wob = 1 - k; /* 吸い込まれるほど揺れが収まる */
          /* 画面上の速さ = inOut の微分 ÷ 所要秒数。中景の最速を 1 とする。 */
          var dk = (u <= 0 || u >= 1) ? 0 : (u < 0.5 ? 4 * u : 4 - 4 * u);
          var spd = dk * 0.5 * (2.6 / dp.dur);
          var node = this.fragEls[i];
          var op = oIn * oOut * 0.94;
          if (op < 0.05) op = 0; /* 端数の灰色を残さない */
          node.style.opacity = op.toFixed(3);
          /* 出現はピントが合うように（ぼけ + 少し小さい）。
             ただフェードさせるだけだと灰色の板が浮くだけに見える。 */
          node.style.transform =
            "translate(-50%,-50%)" +
            " translate(" + (fp.x * wob).toFixed(2) + "vw," + (fp.y * wob).toFixed(2) + "vh)" +
            " translateY(" + (Math.sin(local * 1.1 + i * 2.3) * 10 * wob).toFixed(2) + "px)" +
            " rotate(" + (fp.r * wob + Math.sin(local * 0.9 + i) * 3 * wob).toFixed(2) + "deg)" +
            " scale(" + (dp.sc * (0.86 + 0.14 * oIn) * (1 - 0.5 * k)).toFixed(3) + ")";
          var fb = dp.bl + dp.mb * spd + 7 * (1 - oIn) + 46 * Math.pow(away, 1.5);
          if (fb > 42) fb = 42;
          node.style.filter = fb < 0.05 ? "" : "blur(" + fb.toFixed(2) + "px)";
        }
      }

      /* ── ステッパー: 3.0s に降りてきて、3.5s から順に点が灯る。
            線は到達済み区間だけがシアン→ピンクで満ちる。 ── */
      var sk = outLong(V.span(local, 3.0, 4.0));
      this.stepper.style.opacity = sk.toFixed(3);
      this.stepper.style.transform = "translateY(" + (-14 * (1 - sk)).toFixed(2) + "px)";
      var seg = 0;
      for (i = 0; i < S3_LIT.length - 1; i++) {
        seg += outSoft(V.span(local, S3_LIT[i] + 0.12, S3_LIT[i + 1] - 0.15));
      }
      this.trackFill.style.transform = "scaleX(" + (seg / (S3_LIT.length - 1)).toFixed(4) + ")";
      for (i = 0; i < this.stepEls.length; i++) {
        this.stepEls[i].classList.toggle("is-lit", local >= S3_LIT[i]);
      }

      /* ── 試験用紙: 6.2s に浮上、各行は 骨組み(0.95s) → 実線 ── */
      var pk = outLong(V.span(local, 6.2, 7.6));
      var pex = E.inOut(V.span(local, dur - 1.2, dur));
      this.paper.style.opacity = pk.toFixed(3);
      this.paper.style.transform =
        "rotateX(" + (7 - 3.8 * pk).toFixed(2) + "deg)" +
        " translateY(" + (40 * (1 - pk) + Math.sin(local * 0.45) * 2.6 - 10 * pex).toFixed(2) + "px)" +
        " scale(" + (0.93 + 0.07 * pk - 0.02 * pex).toFixed(4) + ")";
      this.paper.style.filter = pk >= 1 ? "" : "blur(" + (11 * (1 - pk)).toFixed(2) + "px)";
      for (i = 0; i < this.rows.length; i++) {
        var rt = S3_ROWS[i];
        var row = this.rows[i];
        row.classList.toggle("is-in", local >= rt);
        row.classList.toggle("is-skel", local >= rt && local < rt + 0.95);
        row.classList.toggle("is-real", local >= rt + 0.95);
      }

      /* ── スマホ枠: 12.0s に右からふわりと ── */
      var ph = outLong(V.span(local, 12.0, 13.4));
      this.phone.style.opacity = ph.toFixed(3);
      this.phone.style.transform =
        "translateX(" + (48 * (1 - ph)).toFixed(2) + "px)" +
        " translateY(" + (Math.sin(local * 0.7) * 4).toFixed(2) + "px)" +
        " rotate(" + (3.4 * (1 - ph)).toFixed(2) + "deg)";

      /* コピー。1 本目は local 3.55（= 25.55s）から。
         以前は 4.0 = ちょうど 26.0s ちょうどに置いていたため、26s のフレームでは
         全文字が不透明度 0 で「字幕が消えている絵」になっていた。
         0.45 秒早めると 26s では前半 9 文字が立ち、残りが立ち上がる途中になる。 */
      poseCopy(this.copyA, local, 3.55, 8.7, 0.045);
      poseCopy(this.copyB, local, 9.0, 99, 0.05);
    }
  });
})();
