/* ══════════════════════════════════════════════════════════════════════
   core/tts/script.js — 読み上げ原稿の **タグ**（2026-08-26）

   訴え:「プリセット編集画面の 読み上げ文章の ところから、タグを 追加して、
          読み上げ部分に タグから 持って来れるように してほしい。
          例えば、音声を ここの タグで 指定できたり（複数人 男女で 会話文の
          リスニングを 作成するときなど）、あとは 感情とか 速さとかも
          この タグで 指定できたり できると いい」

   ★ 何を するものか
     原稿の 中に [ ] で 印を 書いておくと、読み上げの ときに
     **その場から 声・感情・速さが 変わる**。会話文の リスニングを
     1 つの 原稿で 作れる。

       [A] Hello. How are you?
       [B] I'm fine, thanks.
       [A][excited] Great! Let's go.

   ★ 決めごと
     ・感情・速さは **次に 変えるまで 続く**（そこから 先に かかる）。
     ・ただし **話し手が 変わったら 感情は 戻る**。
       「[A][怒り] 遅いよ！ / [B] ごめん…」で B まで 怒って 読むのは
       書いた人の 思っていることと 違う（速さは 全体の 調子なので 続く）。
     ・効果（笑い・ため息など）と 間（ま）は **その場かぎり**。
     ・知らないタグは **消さずに 文として 残す**。消すと 書いた人が
       「なぜ 出ないのか」分からない。警告として 返す。
     ・A / B / C / D は 話し手の 札。既定は 女→男→女→男 の 順で
       サーバの 声を 当てる（男女が 交互に なるように）。
     ・**タグは 画面には 出さない**（読み上げの ための 印であって 本文では ない）。

   ★ 置き場所
     ここは **タグの 決めどころ**。編集画面の「タグを選択」も、
     読み上げの 段づくりも、原稿の 見せかたも 全部 ここを 読む。
     ばらばらに 書くと、増やしたとき 片方だけ 直って ずれる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ = root.VQSCRIPT || (root.VQSCRIPT = {});

  /* ── タグの 一覧 ──────────────────────────────────────────────
     name … 画面に 出す 名前
     tag  … 実際に 差し込む 文字（[ ] を 除いた 中身）
     別名 … 書いても 通る 言いかた（日本語・英語）
     style… 読み上げに 渡す 言いかた（サーバは これを そのまま 指示に 使う） */
  var 感情 = [
    { name: "怒り",     tag: "angry",     別名: ["怒り", "おこり", "angry", "怒って"],     style: "怒った口調で" },
    { name: "悲しみ",   tag: "sad",       別名: ["悲しみ", "かなしみ", "sad"],             style: "悲しそうな口調で" },
    { name: "うれしい", tag: "happy",     別名: ["うれしい", "嬉しい", "happy", "joy"],    style: "うれしそうな口調で" },
    { name: "照れ",     tag: "shy",       別名: ["照れ", "てれ", "shy", "bashful"],        style: "照れたような口調で" },
    { name: "強調",     tag: "emphasis",  別名: ["強調", "emphasis", "strong"],            style: "強く言い切るように" },
    { name: "ささやき", tag: "whisper",   別名: ["ささやき", "囁き", "whisper"],           style: "ささやくような小さな声で" },
    { name: "ソフト",   tag: "soft",      別名: ["ソフト", "soft", "やわらかく"],          style: "やわらかく穏やかな口調で" },
    { name: "息まじり", tag: "breathy",   別名: ["息まじり", "breathy"],                   style: "息まじりの声で" },
    { name: "興奮",     tag: "excited",   別名: ["興奮", "excited"],                       style: "興奮した早めの口調で" },
    { name: "まじめ",   tag: "serious",   別名: ["まじめ", "真面目", "serious"],           style: "まじめで落ち着いた口調で" },
    { name: "やさしい", tag: "gentle",    別名: ["やさしい", "優しい", "gentle", "kind"],  style: "やさしく語りかけるように" },
    { name: "不安",     tag: "nervous",   別名: ["不安", "nervous", "worried"],            style: "不安そうな口調で" },
    { name: "ふつう",   tag: "normal",    別名: ["ふつう", "普通", "normal", "plain"],     style: "" }
  ];
  var 効果 = [
    { name: "笑い",         tag: "laugh",    別名: ["笑い", "わらい", "laugh"],        style: "笑いながら" },
    { name: "くすくす笑い", tag: "chuckle",  別名: ["くすくす笑い", "chuckle", "くすくす"], style: "くすくす笑いながら" },
    { name: "うめき声",     tag: "groan",    別名: ["うめき声", "groan"],              style: "うめくように" },
    { name: "咳払い",       tag: "cough",    別名: ["咳払い", "せきばらい", "cough"],  style: "咳払いをしてから" },
    { name: "すすり泣き",   tag: "sob",      別名: ["すすり泣き", "sob"],              style: "すすり泣きながら" },
    { name: "大泣き",       tag: "cry",      別名: ["大泣き", "cry", "泣き"],          style: "泣きながら" },
    { name: "ため息",       tag: "sigh",     別名: ["ため息", "sigh"],                 style: "ため息をついてから" },
    { name: "荒い息",       tag: "panting",  別名: ["荒い息", "panting"],              style: "息を切らしながら" },
    { name: "うなり声",     tag: "growl",    別名: ["うなり声", "growl"],              style: "低くうなるように" }
  ];
  var 速さ = [
    { name: "とてもゆっくり", tag: "speed:0.7", 値: 0.7 },
    { name: "ゆっくり",       tag: "speed:0.85", 値: 0.85 },
    { name: "ふつうの速さ",   tag: "speed:1",   値: 1 },
    { name: "少し速く",       tag: "speed:1.15", 値: 1.15 },
    { name: "速く",           tag: "speed:1.3", 値: 1.3 }
  ];
  var 話し手 = [
    { name: "A さん", tag: "A" }, { name: "B さん", tag: "B" },
    { name: "C さん", tag: "C" }, { name: "D さん", tag: "D" }
  ];
  var その他 = [
    { name: "女性の声", tag: "女" }, { name: "男性の声", tag: "男" },
    { name: "間（0.5 秒）", tag: "pause:500" }, { name: "間（1 秒）", tag: "pause:1000" }
  ];

  /* 画面の「タグを選択」は これを 読む（束ごと 出す） */
  VQ.束 = function () {
    return [
      { 名: "話し手", 説明: "会話文は これで 分けます（男女が 交互に なります）", 品: 話し手 },
      { 名: "感情",   説明: "その場から 先に かかります",                         品: 感情 },
      { 名: "効果",   説明: "その 1 か所だけ",                                     品: 効果 },
      { 名: "速さ",   説明: "その場から 先に かかります",                         品: 速さ },
      { 名: "そのほか", 説明: "",                                                  品: その他 }
    ];
  };
  VQ.感情 = function () { return 感情.slice(); };
  VQ.効果 = function () { return 効果.slice(); };

  function 引く(並, t) {
    var k = String(t || "").trim().toLowerCase();
    for (var i = 0; i < 並.length; i++) {
      var x = 並[i];
      if (String(x.tag).toLowerCase() === k) return x;
      for (var j = 0; j < (x.別名 || []).length; j++)
        if (String(x.別名[j]).toLowerCase() === k) return x;
    }
    return null;
  }

  /* 話し手 → 声。**男女が 交互**に なるように 当てる。
     声の 実体は VQVOICE（サーバの 実測つき 一覧）から 取る。 */
  function 声を割り当てる(札, 決め) {
    決め = 決め || {};
    if (決め[札]) return 決め[札];
    var V = root.VQVOICE;
    var 女 = (V && V.女) ? V.女() : [];
    var 男 = (V && V.男) ? V.男() : [];
    var 順 = ["A", "B", "C", "D"];
    var i = 順.indexOf(String(札).toUpperCase());
    if (i < 0) i = 0;
    var 群 = (i % 2 === 0) ? 女 : 男;      /* A=女 / B=男 / C=女 / D=男 */
    var 番 = Math.floor(i / 2);
    if (!群.length) return (V && V.既定) || "Kore";
    return 群[番 % 群.length].id;
  }

  /* 原稿を 段（せつ）に 分ける。 */
  VQ.読む = function (text, o) {
    o = o || {};
    var 生 = String(text === undefined || text === null ? "" : text);
    var 決め = o.話し手の声 || {};
    var いまの声 = o.voice || "";
    var いまの性 = "";
    var いま速さ = Number(o.speed) || 1;
    var いま感情 = "";
    var 次の効果 = "";
    var 次の間 = 0;
    var 段 = [], 警告 = [], 使った = {}, 札の声 = {};
    var 溜 = "";

    function 出す() {
      var t = 溜.replace(/[ \t]+/g, " ").trim();
      溜 = "";
      if (!t) {
        /* 文が 無くても 間は 残す（[間] だけの 行） */
        if (次の間) { 段.push({ text: "", pauseMs: 次の間 }); 次の間 = 0; }
        return;
      }
      var st = [];
      if (次の効果) st.push(次の効果);
      if (いま感情) st.push(いま感情);
      段.push({
        text: t,
        voice: いまの声 || "",
        speed: いま速さ,
        style: st.join("、"),
        pauseMs: 次の間
      });
      次の効果 = ""; 次の間 = 0;
      if (いまの声) 使った[いまの声] = true;
    }

    /* 「A: こんにちは」という 昔ながらの 書きかたも 話し手として 読む
       （前から この 形を すすめていたので、急に 効かなくすると 壊れる） */
    var 行 = 生.split("\n");
    for (var li = 0; li < 行.length; li++) {
      var line = 行[li];
      var m0 = /^\s*([A-Da-d])\s*[:：]\s*/.exec(line);
      if (m0) {
        出す();
        var 札0 = m0[1].toUpperCase();
        札の声[札0] = 札の声[札0] || 声を割り当てる(札0, 決め);
        if (いまの声 !== 札の声[札0]) いま感情 = "";
        いまの声 = 札の声[札0];
        line = line.slice(m0[0].length);
      } else if (li > 0) 溜 += "\n";

      var re = /\[([^\[\]\n]{1,40})\]/g;
      var at = 0, m;
      while ((m = re.exec(line))) {
        溜 += line.slice(at, m.index);
        at = m.index + m[0].length;
        var 中 = String(m[1]).trim();

        /* 話し手 */
        if (/^[A-Da-d]$/.test(中)) {
          出す();
          var 札 = 中.toUpperCase();
          札の声[札] = 札の声[札] || 声を割り当てる(札, 決め);
          if (いまの声 !== 札の声[札]) いま感情 = "";   /* 話し手が 変われば 感情は 戻す */
          いまの声 = 札の声[札];
          continue;
        }
        /* 男女 */
        if (/^(女|女性|female|f)$/i.test(中) || /^(男|男性|male|m)$/i.test(中)) {
          出す();
          var 女か = /^(女|女性|female|f)$/i.test(中);
          var V2 = root.VQVOICE;
          var 群2 = V2 ? (女か ? V2.女() : V2.男()) : [];
          var 新 = 群2.length ? 群2[0].id : いまの声;
          if (いまの声 !== 新) いま感情 = "";
          いまの声 = 新;
          いまの性 = 女か ? "女" : "男";
          continue;
        }
        /* 声を 名指し */
        var mv = /^(?:voice|声)\s*[:：]\s*(.+)$/i.exec(中);
        if (mv) {
          出す();
          var 名 = mv[1].trim();
          var V3 = root.VQVOICE;
          if (V3 && V3.ある && V3.ある(名)) いまの声 = 名;
          else {
            /* 日本語の 呼び名（コレ・カロン…）でも 当てる */
            var 当 = null;
            if (V3 && V3.一覧) V3.一覧().forEach(function (x) {
              if (!当 && (x.名 === 名 || String(x.id).toLowerCase() === 名.toLowerCase())) 当 = x.id;
            });
            if (当) いまの声 = 当;
            else 警告.push("「" + 名 + "」という 声は ありません。");
          }
          continue;
        }
        /* 速さ */
        var ms = /^(?:speed|速さ|はやさ)\s*[:：]\s*([0-9.]+)$/i.exec(中);
        if (ms) {
          出す();
          var sp = Number(ms[1]);
          if (isFinite(sp) && sp >= 0.5 && sp <= 2) いま速さ = sp;
          else 警告.push("速さは 0.5〜2 の 間で 書いてください（" + ms[1] + "）。");
          continue;
        }
        if (/^(ゆっくり|slow)$/i.test(中)) { 出す(); いま速さ = 0.85; continue; }
        if (/^(はやく|速く|fast)$/i.test(中)) { 出す(); いま速さ = 1.3; continue; }
        /* 間 */
        var mp = /^(?:pause|間|ま)(?:\s*[:：]\s*([0-9.]+))?$/i.exec(中);
        if (mp) {
          出す();
          var v = mp[1] === undefined ? 500 : Number(mp[1]);
          if (v > 0 && v <= 20) v = v * 1000;          /* 秒で 書かれても 受ける */
          次の間 = Math.max(0, Math.min(5000, v || 500));
          continue;
        }
        /* 感情（先に かかる） */
        var e = 引く(感情, 中);
        if (e) { 出す(); いま感情 = e.style; continue; }
        /* 効果（その場かぎり） */
        var f = 引く(効果, 中);
        if (f) { 出す(); 次の効果 = f.style; continue; }

        /* 知らない印。**消さない**。本文として 残し、警告に 出す。 */
        警告.push("「[" + 中 + "]」は 分かりません。そのまま 読み上げます。");
        溜 += m[0];
      }
      溜 += line.slice(at);
    }
    出す();

    /* 声を 1 つも 指していないときは、全部 同じ（既定）で 読む */
    var 声の数 = Object.keys(使った).length;
    return {
      段: 段,
      話し手: 札の声,
      使った声: Object.keys(使った),
      多人数: 声の数 >= 2,
      警告: 警告,
      素の文: VQ.素の文(生)
    };
  };

  /* タグを 外した 文（画面に 見せる ぶん・字数を 数える ぶん） */
  VQ.素の文 = function (text) {
    var s = String(text === undefined || text === null ? "" : text);
    /* 知っている タグだけ 外す（知らない [ ] は 本文かもしれない） */
    return s.replace(/\[([^\[\]\n]{1,40})\]/g, function (all, 中) {
      var t = String(中).trim();
      if (/^[A-Da-d]$/.test(t)) return "";
      if (/^(女|女性|female|f|男|男性|male|m)$/i.test(t)) return "";
      if (/^(?:voice|声|speed|速さ|はやさ|pause|間|ま)\s*[:：]/i.test(t)) return "";
      if (/^(pause|間|ま|ゆっくり|はやく|速く|slow|fast)$/i.test(t)) return "";
      if (引く(感情, t) || 引く(効果, t)) return "";
      return all;
    }).replace(/[ \t]{2,}/g, " ")
      .replace(/^[ \t]+/gm, "")        /* [A] を 外した あとの 頭の 空きを 消す */
      .replace(/\n{3,}/g, "\n\n");
  };

  /* タグが 1 つでも 入っているか（入っていなければ 前と 同じ 道で 読む） */
  VQ.タグがある = function (text) {
    var s = String(text || "");
    if (!/\[/.test(s) && !/^\s*[A-Da-d]\s*[:：]/m.test(s)) return false;
    var r = VQ.読む(s, {});
    return r.多人数 || r.段.some(function (x) {
      return x.style || (x.speed && x.speed !== 1) || x.pauseMs || x.voice;
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
