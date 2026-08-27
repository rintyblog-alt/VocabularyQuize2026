/* ══════════════════════════════════════════════════════════════════════
   design/pipeline.js — 通し（[2]構成 →[3][5]設計 →[6]中身 →[8]関門 →[9]修復）

   ★ LLM を呼ぶのは **3 回だけ**（構成 / 設計 / 中身）。
     [4] Tokens・[7] 座標・[8] 崩れ検出・[9] どう直すかの判断 は 計算だけ。
   ★ LLM に出させるのは **enum と整数と文** のみ。
     色コード・書体名・pt・px・座標は 1 つも出させない。
   ★ 修復は ページごと 2 回まで、全体 3 周まで。
     それでも残ったら「要確認」の印を付けて **出す**。止まり続けない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  var 状態 = null;          /* いま作りかけのデッキ */

  /* ══ 生成中の表示（画面の上）══════════════════════════════════════
     ★ 訴え「生成中は固まるんじゃなくて、上部に 生成中… と出しておいて」。
       作っているあいだ 画面は静かなので、止まったように見えていた。
     ★ 決めごと:
       ・**操作の邪魔を絶対にしない**（pointer-events:none。押せる物を隠さない）
       ・z-index は控えめ（前に z-index の取り合いで画面が固まったことがある）
       ・iPhone の切り欠きぶんを avoid（safe-area-inset-top）
       ・90 秒で自動的に消える（消し忘れて出っぱなしにしない）
       ・アプリの明暗（data-theme-mode）に合わせる */
  var 帯 = null, 帯タイマー = 0;
  function 進捗(文, 済, 全, 消えるまで) {
    try {
      var doc = root.document;
      if (!doc || !doc.body) return;
      if (!帯) {
        帯 = doc.createElement("div");
        帯.id = "vqdProgress";
        帯.setAttribute("role", "status");
        帯.setAttribute("aria-live", "polite");
        帯.style.cssText = [
          "position:fixed", "left:50%", "transform:translateX(-50%)",
          /* ★ Live の「聞いています。」の帯と **同じ場所に出ていた**（実測・目視）。
             真上は先客がいるので、その下へ ずらす。重ねない。 */
          "top:calc(env(safe-area-inset-top,0px) + 56px)",
          "z-index:900", "pointer-events:none",
          "display:flex", "align-items:center", "gap:10px",
          "padding:9px 16px", "border-radius:999px",
          "font:600 13px/1.4 -apple-system,'Hiragino Sans','Noto Sans JP',sans-serif",
          "letter-spacing:.02em",
          "background:var(--vq-surface,#ffffff)", "color:var(--vq-text,#1e2330)",
          "border:1px solid var(--vq-border,rgba(15,23,42,.12))",
          "box-shadow:0 6px 24px rgba(15,23,42,.16)",
          "max-width:min(92vw,420px)", "white-space:nowrap",
          "overflow:hidden", "text-overflow:ellipsis",
          "opacity:0", "transition:opacity .18s ease"
        ].join(";");
        帯.innerHTML = '<span class="vqd-sp" style="width:13px;height:13px;flex:none;'
          + "border-radius:50%;border:2px solid currentColor;border-top-color:transparent;"
          + 'animation:vqdSpin .8s linear infinite"></span><span class="vqd-tx"></span>';
        var st2 = doc.createElement("style");
        st2.textContent = "@keyframes vqdSpin{to{transform:rotate(360deg)}}"
          + "@media (prefers-reduced-motion:reduce){#vqdProgress .vqd-sp{animation:none}}";
        doc.head.appendChild(st2);
        doc.body.appendChild(帯);
        /* 次の描画で 出す（いきなり出すと 変化として見えない） */
        root.setTimeout(function () { if (帯) 帯.style.opacity = "1"; }, 16);
      }
      var t = 文 + (全 ? "（" + 済 + " / " + 全 + " 枚）" : "");
      var tx = 帯.querySelector(".vqd-tx");
      if (tx && tx.textContent !== t) tx.textContent = t;
      帯.style.opacity = "1";
      if (帯タイマー) root.clearTimeout(帯タイマー);
      /* ★ 消し忘れて 出っぱなしにしない。次の合図が来るまでの猶予。
         書類づくりの通し（deck*）は 長いので 90 秒、
         1 回きりの手直しは 6 秒で 静かに消す。 */
      帯タイマー = root.setTimeout(function () { 進捗を消す(); }, 消えるまで || 90000);
    } catch (e) {}
  }
  function 進捗を消す() {
    try {
      if (帯タイマー) { root.clearTimeout(帯タイマー); 帯タイマー = 0; }
      if (!帯) return;
      var b = 帯;
      b.style.opacity = "0";
      root.setTimeout(function () { try { b.parentNode.removeChild(b); } catch (e) {} }, 220);
      帯 = null;
    } catch (e) {}
  }

  function VQ() { return root.VQ2 && root.VQ2.workplace; }
  function 今() { try { return VQ().cmd.いま(); } catch (e) { return null; } }

  function S(v) { return v === undefined || v === null ? "" : String(v); }
  function N(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  /* ── [1] 始める（構成は LLM が purpose の並びで渡す）───────────── */
  function deckStart(a) {
    a = a || {};
    var 枚 = Math.max(1, Math.min(60, N(a.pageCount, (a.pages || []).length || 8)));
    var 並び = (a.pages || []).map(function (p) {
      return S(p && (p.purpose || p)) || "detail";
    }).slice(0, 枚);
    while (並び.length < 枚) 並び.push("detail");

    進捗("生成中… 組み立てを始めています", 0, 枚);
    var 知らない = 並び.filter(function (p) { return VQD.grammar.PURPOSES.indexOf(p) < 0; });
    状態 = {
      meta: { title: S(a.title) || "無題", audience: S(a.audience), purpose: S(a.purpose),
              pageCount: 枚, lang: a.lang === "en" ? "en" : "ja" },
      purposes: 並び.map(function (p) { return VQD.grammar.PURPOSES.indexOf(p) >= 0 ? p : "detail"; }),
      deck: null, 段階: "設計まち", 周: 0
    };
    return {
      やった: 枚 + " 枚の組み立てを 始めました。",
      ページの役目: 状態.purposes.map(function (p, i) { return (i + 1) + ". " + p; }),
      知らない役目: 知らない.length ? 知らない : undefined,
      つぎ: "**deckDesign を 1 回だけ呼んでください。**"
        + "デザインの 10 軸と、各ページの割りかたを まとめて渡します。",
      デザインの軸: 軸の説明(),
      レイアウトの決まり: {
        分割: "1〜4。ratio は " + VQD.grammar.RATIOS.map(function (r) { return r.join(":"); }).join(" / ") + " のどれか",
        向き: "vertical = 上下に積む ／ horizontal = 左右に並べる",
        役目: VQD.grammar.ROLES_使える,
        重み: "primary は 1 ページに **ちょうど 1 つ**",
        面: "table / chart / diagram は その枠が 面の 40% 以上を占めること",
        ちがい: "**となりのページと 3 つ以上 変えること。**同じ割りかたを続けない"
      }
    };
  }

  function 軸の説明() {
    var A = VQD.seed.AXES, 出 = {};
    VQD.seed.ORDER.forEach(function (k) {
      if (k === "fontPair") {
        出.fontPair = { 選べる: "0〜23", 意味: VQD.fonts.一覧() };
        return;
      }
      出[k] = { 選べる: VQD.seed.valuesOf(k), 印象: A[k].印象 };
    });
    return 出;
  }

  /* ── [3][5] 設計（Seed と 各ページの割りかたを 1 回で受け取る）───── */
  function deckDesign(a) {
    if (!状態) return { だめ: "先に deckStart を呼んでください。**何もしていません。**" };
    進捗("生成中… デザインを決めています", 0, 状態.meta.pageCount);
    a = a || {};
    var 直し = [];

    /* Seed: 形をそろえて、禁じ手なら **計算で** いちばん近い有効な組へ */
    var s0 = VQD.seed.normalize(a);
    var n = VQD.constraints.nearestValidSeed(s0);
    if (n.直した.length)
      n.直した.forEach(function (x) {
        直し.push("Seed: " + x.軸 + " を " + x.前 + " → " + x.後 + "（" + x.なぜ + "）");
      });

    var deck = VQD.ir.newDeck(状態.meta, n.seed);

    /* レイアウト: 渡ってきたものを 正規化 → 妥当性を計算で直す */
    var 渡 = {};
    (a.layouts || []).forEach(function (L) {
      var i = N(L && L.page, 0);
      if (i >= 1 && i <= 状態.purposes.length) 渡[i - 1] = L;
    });
    var specs = 状態.purposes.map(function (p, i) {
      var L = 渡[i];
      if (!L) { 直し.push((i + 1) + " 枚目: 割りかたが渡らなかったので 受け皿を使いました"); return VQD.grammar.受け皿(p, i); }
      var r = VQD.grammar.直す(L);
      if (r.直し.length) 直し.push((i + 1) + " 枚目: " + r.直し.join(" / "));
      if (!r.ok) { 直し.push((i + 1) + " 枚目: " + r.悪.join(" / ") + " → 受け皿へ"); return VQD.grammar.受け皿(p, i); }
      return r.spec;
    });

    /* 多様性は **計算で**そろえる（LLM に作り直させない） */
    var 整 = VQD.diversity.整える(specs, (deck.tokens.seed.hue + deck.tokens.seed.fontPair) | 0);
    整.直し.forEach(function (x) { 直し.push(x.番 + " 枚目: 割りかたを 変えました（" + x.なぜ + "）"); });

    整.specs.forEach(function (sp, i) {
      deck.pages.push(VQD.ir.newPage(状態.purposes[i], sp, i));
    });
    状態.deck = deck;
    状態.段階 = "中身まち";

    return {
      やった: "デザインを決めました。",
      使った設計: 設計の要約(deck),
      計算で直したこと: 直し.length ? 直し : "なし",
      書くところ: 書くところ(deck, 1, Math.min(5, deck.pages.length)),
      ページの流れ: 状態.purposes.map(function (p, i) { return (i + 1) + ". " + p; }),
      つぎ: "**deckWrite で 5 枚ずつ 書いてください。**"
        + "各スロットの『文字数上限』と『行数上限』を **必ず**守ること。"
        + "超えたら 入りきらず、やり直しになります。"
    };
  }

  function 設計の要約(deck) {
    var s = deck.tokens.seed, p = VQD.fonts.of(s.fontPair);
    return {
      Seed: deck.tokens.seedKey,
      色: s.hue + "° / " + s.scheme + " / " + s.mode,
      書体: p.名 + "（" + p.印象 + "）",
      組み: "比 " + s.typeScale + " / " + s.grid + " 列 / " + s.spacing
        + " / " + s.shape + " / 飾り " + s.accent + " / 地 " + s.background,
      "★色や px は こちらで計算しました": "あなたは 文だけ書いてください。"
    };
  }

  /* 何をどれだけ書けばよいか（数で渡す。「短く」とは言わない） */
  /* すでに書けているページの 役目と見出し。
     ★ 5 枚ずつ書く作りなので、後半を書くとき **前半に何を書いたか**を
       渡さないと、目次と中身が食い違う（訴え「目次と矛盾する」）。 */
  function これまでの見出し(deck) {
    var 出 = [];
    (deck.pages || []).forEach(function (p, i) {
      var h = "";
      (p.content || []).forEach(function (c) {
        if (c.role === "heading" && !h) h = S(c.text);
      });
      if (h) 出.push({ page: i + 1, 役目: p.purpose, 見出し: h });
    });
    return 出;
  }

  function 書くところ(deck, from, to) {
    var 出 = [];
    for (var i = from - 1; i < to && i < deck.pages.length; i++) {
      var p = deck.pages[i];
      var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
      出.push({
        page: i + 1, 役目: p.purpose,
        スロット: 寸.filter(function (x) { return x.role !== "spacer"; }).map(function (x) {
          var o = { slotIndex: x.slotIndex, role: x.role };
          if (x.role === "table") { o.欲しいもの = "rows（1 行目が見出し）"; o.行数の目安 = x.行数上限; }
          else if (x.role === "chart") o.欲しいもの = "chart（type / labels / series）";
          else if (x.role === "metric") { o.欲しいもの = "value（数そのもの）と caption（何の数か）";
            o["value の文字数上限"] = Math.min(10, x.一行の文字数); o["caption の文字数上限"] = 20; }
          else if (x.role === "bullets") { o.欲しいもの = "items（箇条書き）";
            o.項目数の上限 = x.行数上限; o["1 項目の文字数上限"] = Math.max(4, x.一行の文字数 - 1); }
          else if (x.role === "diagram") { o.欲しいもの = "items（流れの各段）"; o.項目数の上限 = 4; o["1 項目の文字数上限"] = 8; }
          else if (x.role === "quote") { o.欲しいもの = "text（引用）と caption（出どころ）"; o.文字数上限 = x.文字数上限; }
          else { o.欲しいもの = "text"; o.文字数上限 = x.文字数上限; }
          /* ★ どの枠でも **文の かわりに 図**を 置ける（2026-08-28）。
             役目を 増やさずに 図を 通す作りなので、ここで 知らせる。
             知らせないと Lumi は 図を 置けることに 気づけない。 */
          o["図でもよい"] = 'svg（<svg viewBox=…>…</svg>）か、'
            + "usePicture が返した src と credit を 渡すと、この枠は 図に なります";
          return o;
        })
      });
    }
    return 出;
  }

  /* ── [6] 中身 → [7] 座標 → [8] 関門 → [9] 修復 ─────────────────── */
  function deckWrite(a) {
    if (!状態 || !状態.deck) return { だめ: "先に deckStart → deckDesign を呼んでください。**何もしていません。**" };
    /* ★ 仕上げたあとに 書き直させない（2026-08-17・訴え「保存されない」の筋）。
       deckWrite は **全ページを作り直して丸ごと差し替える**ので、
       仕上げたあとに呼ぶと、そのあとの手直し（人の打ち替えも、
       slidesEdit の直しも）が **黙って消える**。
       利用者からは「直したのに保存されていない」に見える。
       仕上げたあとの手直しは slidesEdit の仕事。 */
    if (状態.段階 === "おわり")
      return { だめ: "この資料は **もう仕上がっています**。deckWrite で書き直すと"
                 + "そのあとの手直しが 消えます。**何もしていません。**",
               つぎ: "直したい所は slidesEdit（op:element）で指してください。"
                 + "指しかたは slide＋役／slide＋目印／slide＋type＋番号。"
                 + "何か所もあるときは elementOp:\"まとめて\" で 1 回にまとめられます。"
                 + "作り直したいなら deckStart からやり直してください。" };
    a = a || {};
    var deck = 状態.deck;
    var 入れた = 0;
    /* ★ 図が 通らなかったときは **黙らない**（2026-08-28）。
       黙ると 図の 無い ページが できて、Lumi は「入れた」と 言う。 */
    var 図のだめ = [];
    (a.pages || []).forEach(function (P) {
      var i = N(P && P.page, 0) - 1;
      if (i < 0 || i >= deck.pages.length) return;
      var pg = deck.pages[i];
      var 役 = {};
      pg.layout.slots.forEach(function (s, k) { 役[k] = s.role; });
      var 元 = {};
      (pg.content || []).forEach(function (c) { 元[c.slotIndex] = c; });
      (P.slots || []).forEach(function (c) {
        var k = N(c && c.slotIndex, -1);
        if (k < 0 || k >= pg.layout.slots.length) return;
        var y = VQD.ir.中身をそろえる(Object.assign({}, c, { slotIndex: k }), 役[k]);
        if (y.svgだめ) { 図のだめ.push((i + 1) + " 枚目 " + (k + 1) + " 番目の枠: 図を 置けません（" + y.svgだめ + "）"); delete y.svgだめ; }
        if (y.srcだめ) { 図のだめ.push((i + 1) + " 枚目 " + (k + 1) + " 番目の枠: " + y.srcだめ); delete y.srcだめ; }
        元[k] = y;
      });
      pg.content = Object.keys(元).map(function (k) { return 元[k]; });
      入れた++;
    });

    var 直した = 修復(deck);
    var 出せた = 書き出す(deck);
    var できた = deck.pages.filter(function (p) { return (p.content || []).length; }).length;
    if (できた >= deck.pages.length) 進捗("生成中… 仕上げを確かめています", できた, deck.pages.length);
    else 進捗("生成中… 中身を書いています", できた, deck.pages.length);

    /* ★ **まだ書いていないページを「直して」と言わない**（2026-08-17）。
       それは『書くところ』でもう案内している。二重に言うと
       どれが本当の直しか 分からなくなる。 */
    var 残 = deck.pages.map(function (p, i) {
      if (!(p.content || []).length) return null;
      var err = (p.issues || []).filter(function (x) { return x.深刻 === "error"; });
      if (!err.length) return null;
      return { page: i + 1, 直しかた: 直しの指示(p, deck, err) };
    }).filter(Boolean);

    var 済 = deck.pages.filter(function (p) { return p.status === "ok"; }).length;
    var つぎ番 = 次に書くページ(deck);
    return {
      やった: 入れた + " 枚に 中身を入れました。",
      置けなかった図: 図のだめ.length ? 図のだめ.slice(0, 8) : undefined,
      できたページ: 済 + " / " + deck.pages.length,
      計算で直したこと: 直した.length ? 直した : "なし",
      画面へ出せたか: 出せた ? "出しました" : "★ **出していません**（この資料は 別の所で直されています）",
      直してほしいところ: 残.length ? 残 : "なし",
      書くところ: つぎ番 ? 書くところ(deck, つぎ番, Math.min(つぎ番 + 4, deck.pages.length)) : [],
      すでに書いた見出し: これまでの見出し(deck),
      "★ここに注意": "上の『すでに書いた見出し』と 食い違わないように書いてください。"
        + "目次に無いページを足したり、目次と違う見出しを付けたりしないこと。",
      つぎ: 残.length
        ? "★ **直してほしいところ の指示どおりに 書き直して、もう一度 deckWrite を呼んでください。**"
        : (つぎ番 ? "**続けて deckWrite で " + つぎ番 + " 枚目から書いてください。**"
                  : "全部 入りました。**deckFinish を呼んでください。**")
    };
  }

  function 次に書くページ(deck) {
    for (var i = 0; i < deck.pages.length; i++) {
      var p = deck.pages[i];
      var 空 = !(p.content || []).length;
      if (空) return i + 1;
    }
    return 0;
  }

  /* ── [9] 修復（どう直すかは **計算で** 決める。LLM に選ばせない）──── */
  function 修復(deck) {
    var 直した = [];
    状態.周 = (状態.周 || 0) + 1;
    VQD.ir.全部解く(deck);
    if (状態.周 > 3) return 直した;               /* 全体の周回上限（§9）*/

    deck.pages.forEach(function (p, i) {
      /* ★ **まだ書いていないページには 手を出さない**（2026-08-17・実測）。
         5 枚ずつ書く作りなので、1 束目のあと 6〜10 枚目は 中身が空。
         それを「空のスロット」とみなして 枠を spacer へ畳んでいた。
         その結果、頼まれていた 表とグラフの枠が 丸ごと消えていた。 */
      if (!(p.content || []).length) return;
      var 回 = 0;
      while (回 < 2) {
        var err = (p.issues || []).filter(function (x) { return x.深刻 === "error"; });
        if (!err.length) return;
        var 種 = {};
        err.forEach(function (x) { 種[x.種] = (種[x.種] || 0) + 1; });
        var 前の数 = err.length;
        var 手 = null;

        if (種.boundsOverflow || 種.overlap) {
          /* 割りかたを 選び直す（多様性の決まりは保つ） */
          /* ★ ここは **かたい=true**。中身を書いたあとなので、
             枠の数や役目が変わると 書いた文が 行き場を失う。 */
          var n = VQD.diversity.選び直す(deck.pages.map(function (x) { return x.layout; }),
                                         i + 1, (deck.tokens.seed.hue + i * 7) | 0, 0, true);
          if (n) { p.layout = n; 手 = "割りかたを 選び直した"; }
        } else if (種.emptySlot && (p.repairCount || 0) >= 1) {
          /* 中身が無いスロットは **こちらでは埋めない**（作り話になる）。
             1 度は「書いてください」と返し、それでも空なら
             役目を spacer へ落として ページとして成立させる。 */
          var 変 = false;
          p.layout.slots.forEach(function (s, k) {
            var ある = (p.content || []).some(function (c) { return c.slotIndex === k; });
            if (!ある && s.role !== "spacer" && p.layout.slots.length > 1) { s.role = "spacer"; 変 = true; }
          });
          if (変) { p.layout = VQD.grammar.正規化(p.layout); 手 = "中身の無い枠を たたんだ"; }
        }
        if (!手) break;                            /* 文字数の直しは LLM の番 */

        var 前 = JSON.parse(JSON.stringify(p.issues || []));
        VQD.ir.解く(deck, p);
        var 後 = (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length;
        if (後 > 前の数) { p.issues = 前; break; }  /* 悪くなったら 元へ戻す */
        直した.push((i + 1) + " 枚目: " + 手 + "（error " + 前の数 + " → " + 後 + "）");
        p.repairCount = (p.repairCount || 0) + 1;
        回++;
      }
      if ((p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length && p.repairCount >= 2)
        p.status = "unresolved";
    });
    VQD.ir.全部解く(deck);
    return 直した;
  }

  /* LLM へ返す「どう書き直すか」。**必ず数で言う。** */
  function 直しの指示(p, deck, err) {
    var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
    var 出 = [];
    err.forEach(function (x) {
      if (x.種 === "lineOverflow" || x.種 === "charDensity") {
        (p.content || []).forEach(function (c) {
          var 上 = 寸[c.slotIndex];
          if (!上) return;
          var いま = (c.text || (c.items || []).join("")).length;
          if (x.種 === "charDensity" && c.role !== "body" && c.role !== "bullets") return;
          if (いま > 上.文字数上限)
            出.push("slotIndex " + c.slotIndex + "（" + c.role + "）を **"
              + 上.文字数上限 + " 文字以内**にしてください（いま " + いま + " 文字）");
        });
      } else if (x.種 === "emptySlot") {
        出.push(x.どこが + " → その slotIndex に 中身を書いてください");
      } else {
        出.push(x.どこが);
      }
    });
    if (!出.length) 出.push(err.map(function (x) { return x.どこが; }).join(" / "));
    return 出;
  }

  /* ── 画面へ書き出す（1 束ごとに 出す。最後まで待たせない）──────── */
  function 指紋(b) {
    try {
      var ss = b.slides || [];
      return ss.length + ":" + ss.reduce(function (n, s) { return n + (s.elements || []).length; }, 0)
        + ":" + ss.map(function (s) {
            return (s.elements || []).map(function (e) { return (e.text || "").length; }).join(",");
          }).join("|");
    } catch (e) { return ""; }
  }
  function 書き出す(deck) {
    try {
      var c = 今();
      if (!c || c.kind !== "presentation") return false;
      var b = VQ().cmd.本体(c);
      /* ★ **よそで変わっていたら 上書きしない**（2026-08-17・訴え）。
         前に自分が書き出したときの形と違うなら、
         その間に 人か slidesEdit が手を入れている。
         そこへ全ページ差し替えを当てると 手直しが消える。 */
      if (状態 && 状態.指紋 && 状態.指紋 !== 指紋(b)) {
        状態.よそで変わった = true;
        return false;
      }
      var out = VQD.toWorkplace(deck).content;
      b.theme = out.theme; b.ratio = out.ratio;
      b.slides = out.slides; b.transition = out.transition;
      b.designSeed = out.designSeed;
      try { c.paint(); } catch (e) {}
      try { c.session.touch ? c.session.touch() : (c.session.saveNow && c.session.saveNow()); } catch (e) {}
      if (状態) 状態.指紋 = 指紋(b);
      return true;
    } catch (e) { return false; }
  }

  /* ══ 目次を **実際の見出しに合わせる**（2026-08-17・訴え）═════════════
     ★ 訴え「目次に書いてあることと矛盾していたりする」。
     ★ 原因: 目次は 1 枚目の束で書くのに、中身は そのあとの束で書く。
       書いている時点では 後ろのページの見出しは まだ存在しない。
       LLM にいくら注意しても、**知らないものは書けない**。
     ★ 直しかた: 全部書き終わった時点で、目次の項目を
       **実際の見出しから作り直す**。ここは推測が要らないので計算でやる。
       勝手に直したことは 黙らずに返す。 */
  function 目次をそろえる(deck) {
    var 見 = [];
    deck.pages.forEach(function (p, i) {
      if (["title", "agenda", "closing"].indexOf(p.purpose) >= 0) return;
      var h = "";
      (p.content || []).forEach(function (c) { if (c.role === "heading" && !h) h = S(c.text); });
      if (h) 見.push(h);
    });
    if (!見.length) return null;
    var 直した = null;
    deck.pages.forEach(function (p, i) {
      if (p.purpose !== "agenda") return;
      var 枠 = null;
      p.layout.slots.forEach(function (s, k) { if (s.role === "bullets" && 枠 === null) 枠 = k; });
      if (枠 === null) return;
      var 寸 = VQD.measure.上限一覧(p.layout, deck.tokens, { purpose: p.purpose, lang: deck.meta.lang });
      var 行 = Math.max(2, (寸[枠] && 寸[枠].行数上限) || 6);
      var 幅 = Math.max(6, ((寸[枠] && 寸[枠].一行の文字数) || 20) - 2);
      var 並 = 見.slice();
      /* 入る行数より多いときは まとめる（勝手に削らず「ほか N 件」と書く） */
      var 出 = 並.slice(0, 行).map(function (t) {
        return t.length > 幅 ? t.slice(0, Math.max(2, 幅 - 1)) + "…" : t;
      });
      if (並.length > 行) 出[出.length - 1] = "ほか " + (並.length - 行 + 1) + " 件";
      var 前 = null;
      (p.content || []).forEach(function (c) { if (c.slotIndex === 枠) 前 = (c.items || []).join("／"); });
      if (前 === 出.join("／")) return;
      var 新 = (p.content || []).filter(function (c) { return c.slotIndex !== 枠; });
      新.push(VQD.ir.中身をそろえる({ slotIndex: 枠, items: 出 }, "bullets"));
      p.content = 新;
      直した = { page: i + 1, 前: 前, 後: 出 };
    });
    return 直した;
  }

  /* ── 仕上げ ───────────────────────────────────────────────── */
  function deckFinish() {
    if (!状態 || !状態.deck) { 進捗を消す(); return { だめ: "作りかけのデッキがありません。" }; }
    var deck = 状態.deck;
    var 目次直し = null;
    try { 目次直し = 目次をそろえる(deck); } catch (e) {}
    var r = VQD.ir.全部解く(deck);
    書き出す(deck);
    var 未 = deck.pages.map(function (p, i) {
      return (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length ? i + 1 : 0;
    }).filter(Boolean);
    var 種類 = {};
    deck.pages.forEach(function (p) { 種類[VQD.diversity.key(p.layout)] = 1; });
    var 空 = deck.pages.filter(function (p) { return !(p.content || []).length; }).length;
    if (空) {
      進捗("生成中… のこり " + 空 + " 枚", deck.pages.length - 空, deck.pages.length);
      return { だめ: "まだ **中身の無いページが " + 空 + " 枚**あります。**終われません。**",
               つぎ: "deckWrite で 残りを書いてください。",
               書くところ: 書くところ(deck, 次に書くページ(deck), Math.min(次に書くページ(deck) + 4, deck.pages.length)) };
    }
    進捗を消す();
    var 出 = {
      やった: deck.pages.length + " 枚 仕上げました。",
      Seed: deck.tokens.seedKey,
      レイアウトの種類: Object.keys(種類).length + " 種",
      崩れ: r.error数, 気になるところ: r.warning数,
      要確認のページ: 未.length ? 未 : "なし"
    };
    if (目次直し)
      出.目次を合わせました = {
        何枚目: 目次直し.page,
        前: 目次直し.前 || "（空）", 後: 目次直し.後.join("／"),
        なぜ: "目次を書いた時点では 後ろのページの見出しが まだ無かったので、"
          + "**実際の見出しに合わせました**。利用者へ「目次は中身に合わせた」と伝えてください。"
      };
    if (未.length)
      出.正直に = "★ " + 未.length + " 枚は 直しきれませんでした。"
        + "**「" + 未.join(",") + " 枚目は 確認してほしい」と 利用者へ伝えてください。**"
        + "できたふりをしないこと。";
    状態.段階 = "おわり";
    return 出;
  }

  /* いま作りかけのものを 見る（試験と 見直しのため） */
  function deckState() {
    if (!状態) return { 作りかけ: null };
    var d = 状態.deck;
    return {
      段階: 状態.段階, 周: 状態.周,
      meta: 状態.meta,
      Seed: d ? d.tokens.seedKey : null,
      ページ: d ? d.pages.map(function (p, i) {
        return { page: i + 1, 役目: p.purpose, 状態: p.status,
                 部品: p.resolved ? p.resolved.elements.length : 0,
                 崩れ: (p.issues || []).filter(function (x) { return x.深刻 === "error"; }).length };
      }) : []
    };
  }

  VQD.pipeline = { deckStart: deckStart, deckDesign: deckDesign, deckWrite: deckWrite,
                   deckFinish: deckFinish, deckState: deckState,
                   進捗: 進捗, 進捗を消す: 進捗を消す,
                   書き出す: 書き出す, 書くところ: 書くところ,
                   状態: function () { return 状態; },
                   捨てる: function () { 状態 = null; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
