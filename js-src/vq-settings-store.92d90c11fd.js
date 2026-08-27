
/* ══════════════════════════════════════════════════════════════════════════
   vq-settings-store — 設定の置き場所を 1 つにする層

   ここが持つのは 3 つだけ。

   ① 定義表（SPECS）
      設定 1 つ = 1 行。id / 束 / 種類 / 既定値 / 効果（apply）/ 検証。
      **効果を書けない設定は、この表に載せない。** 見た目だけの飾りを増やすと
      「動かない設定」が溜まり、どれが本物か誰にも分からなくなる。

   ② 保存
      端末: localStorage["vq.settings.v1"] = { <id>: { v: 値, at: 時刻 } }
      account: PUT /api/settings（差分だけ送る）
      合流は **鍵ごとに at が新しい方を残す**。まとめて置き換えないので、
      2 台で別々の設定をいじっても片方が消えない。

   ③ 効果を実際に当てる
      ・自前の設定 → apply(v) を呼ぶ
      ・昔からある設定 → 本物のコントロール（#settingsThemeSelect 等）へ橋渡し
        （持ち主はアプリ本体のまま。ここは写しを持って同期にだけ使う）

   Shadow DOM の中にも CSS を届ける必要があるので、登録した CSS は
   document.head と **開いている shadow root すべて** へ配る（paintRoots）。
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (root.__vqSetInstalled) return;
  root.__vqSetInstalled = true;

  var LS_KEY = "vq.settings.v1";
  var TOKEN_KEY = "app.auth.token.v1";
  var PUSH_WAIT = 900;          /* まとめて送るまでの待ち時間 */

  var doc = document, de = doc.documentElement;

  function now() { return Date.now(); }
  function token() { try { return String(localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (e) { return ""; } }
  function $(id) { return doc.getElementById(id); }

  /* ── Shadow DOM も含めて CSS を配る ─────────────────────────────
     document の <style> は shadow root の中には届かない。
     設定の効果（動きを減らす・下線・押せる範囲…）は Feed や設定画面など
     shadow root の中にも効いてほしいので、開いている root を全部探して配る。 */
  var SHEETS = {};                 /* id -> css */
  function collectRoots() {
    var out = [doc];
    try {
      var els = doc.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) {
        var sr = els[i].shadowRoot;
        if (!sr) continue;
        out.push(sr);
        var in2 = sr.querySelectorAll("*");
        for (var j = 0; j < in2.length; j++) if (in2[j].shadowRoot) out.push(in2[j].shadowRoot);
      }
    } catch (e) {}
    return out;
  }
  function paintOne(r) {
    var holder = (r === doc) ? doc.head : r;
    if (!holder) return;
    for (var id in SHEETS) {
      if (!Object.prototype.hasOwnProperty.call(SHEETS, id)) continue;
      var el = null;
      try { el = (r === doc) ? doc.getElementById(id) : r.getElementById && r.getElementById(id); } catch (e) {}
      if (!el) {
        try {
          var q = (r === doc ? doc : r).querySelector('style[data-vqset="' + id + '"]');
          if (q) el = q;
        } catch (e2) {}
      }
      if (!el) {
        el = doc.createElement("style");
        el.id = id;
        el.setAttribute("data-vqset", id);
        try { holder.appendChild(el); } catch (e3) { continue; }
      }
      if (el.textContent !== SHEETS[id]) el.textContent = SHEETS[id];
    }
  }
  function paintRoots() {
    var roots = collectRoots();
    for (var i = 0; i < roots.length; i++) paintOne(roots[i]);
  }
  /* ★ 影は **できた瞬間** に配る（2026-08-17・利用者の訴え）。
     前は 250 ミリ秒 遅れて配っていたので、画面を切り替えるたびに
     **一瞬だけ システムの書体**が見えていた。
     ここを塞ぐと、書体だけでなく 動きを減らす・下線などの設定も
     画面が出た最初の 1 枚から効くようになる。 */
  (function 影ができたら配る() {
    try {
      var E = root.Element && root.Element.prototype;
      if (!E || !E.attachShadow || E.__vqsetShadowPatched) return;
      var 元 = E.attachShadow;
      E.attachShadow = function () {
        var sr = 元.apply(this, arguments);
        try { paintOne(sr); } catch (e) {}
        return sr;
      };
      E.__vqsetShadowPatched = true;
    } catch (e) {}
  })();
  function sheet(id, css) {
    if (SHEETS[id] === css) return;
    SHEETS[id] = css;
    paintRoots();
  }
  /* 後から生えた shadow root にも配る（層は遅れて組み上がる） */
  var repaintTimer = null;
  function schedulePaint() {
    if (repaintTimer) return;
    repaintTimer = setTimeout(function () { repaintTimer = null; paintRoots(); }, 250);
  }

  /* ── 本物のコントロールへの橋渡し（昔からある設定用）───────────── */
  function bSelect(id, val) {
    var e = $(id); if (!e) return false;
    if (String(e.value) === String(val)) return true;
    e.value = String(val);
    e.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function bCheck(id, on) {
    var e = $(id); if (!e) return false;
    if (!!e.checked === !!on) return true;
    e.checked = !!on;
    e.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  /* id でも CSS セレクタでも押せる。旧画面には id の無いボタンがある。 */
  /* VocabuQuiz OS の設定は本物の <select> が持ち主。今の値をそのまま読む。 */
  function osPref(id, fb) {
    var e = $(id);
    var v = e ? String(e.value || "") : "";
    return v || fb;
  }
  /* 学習の設定は本体が窓口を出している（<select> は用意した選択肢しか取れないため）。 */
  function learnBridge(k, v) {
    try {
      var L = root.__vqLearnSet;
      if (L && typeof L[k] === "function") { L[k](v); return true; }
    } catch (e) {}
    return false;
  }
  function bClick(sel) {
    var e = null;
    try { e = /^[A-Za-z][\w-]*$/.test(sel) ? $(sel) : null; } catch (er) {}
    if (!e) { try { e = doc.querySelector(sel); } catch (er2) {} }
    if (e) { e.click(); return true; }
    return false;
  }

  /* ── アプリ本体が持っている設定を localStorage から直読み ───────── */
  var LEVELS = { SMALL: 1, DEFAULT: 1, LARGE: 1 };
  function clampInt(v, lo, hi, fb) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fb;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }
  function appSettings() {
    var legacy = {}, modern = {};
    try { var a = JSON.parse(localStorage.getItem("wordPractice400.settings.v2") || "{}"); if (a && typeof a === "object") legacy = a; } catch (e) {}
    try { var b = JSON.parse(localStorage.getItem("app.settings.v1") || "{}"); if (b && typeof b === "object") modern = b; } catch (e) {}
    var p = {}, k;
    for (k in legacy) p[k] = legacy[k];
    for (k in modern) p[k] = modern[k];
    return {
      direction: p.direction === "JA_EN" ? "JA_EN" : "EN_JA",
      animations: "animations" in p ? !!p.animations : true,
      debug: "debug" in p ? !!p.debug : true,
      sfx: "sfx" in p ? !!p.sfx : true,
      bgm: "bgm" in p ? !!p.bgm : true,
      bgmVolume: LEVELS[p.bgmVolume] ? p.bgmVolume : "DEFAULT",
      sfxVolume: LEVELS[p.sfxVolume] ? p.sfxVolume : "DEFAULT",
      /* 問題数と制限時間は自由。範囲だけ見る。 */
      questionCount: clampInt(p.questionCount, 1, 500, 100),
      choiceTimeLimitSec: clampInt(p.choiceTimeLimitSec, 0, 600, 0),
      autoNext: "autoNext" in p ? !!p.autoNext : true,
      reverseExamQA: "reverseExamQA" in p ? !!p.reverseExamQA : false,
      reverseWriteQA: "reverseWriteQA" in p ? !!p.reverseWriteQA : false,
      theme: { AUTO: 1, LIGHT: 1, DARK: 1 }[p.theme] ? p.theme : "AUTO",
      fontSize: LEVELS[p.fontSize] ? p.fontSize : "DEFAULT"
    };
  }

  /* ══ 効果（apply）で使う小道具 ═══════════════════════════════════ */
  function setVar(name, val) {
    try { if (val == null || val === "") de.style.removeProperty(name); else de.style.setProperty(name, val); } catch (e) {}
  }
  function setFlag(attr, on) {
    try { if (on) de.setAttribute(attr, "1"); else de.removeAttribute(attr); } catch (e) {}
  }

  /* いまダークかどうか。テーマは本体が html[data-theme-mode] に書く。 */
  function isDark() {
    try {
      var m = de.getAttribute("data-theme-mode");
      if (m === "dark") return true;
      if (m === "light") return false;
      return !!(root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) { return false; }
  }

  /* アクセント。Studio の層はすべて --vq-accent 系を見ているので、
     ここを差し替えると Feed / News / 通知 / クイズ / 設定 が一斉に変わる。
     ダークは同じ色をそのまま置くと沈むので、明るい側の組を別に持つ。
     a=主色 / h=触れたとき / s=薄い面 / t=薄い面の上の文字 / k=主色の上の文字 */
  /* ══ アプリ全体の書体（2026-08-17）════════════════════════════════════
     ★ 「システムの既定が 1 つだけ。何十種類かから選べるようにしてほしい。
       可愛い系・日本風・明るい系・ポップ・悲しい・チル・静かで落ち着く、
       とか色々増やしていい」。
     ★ 作りは 3 つ。
       ① 選んだものだけ 読み込む（全部あらかじめ読むと 何十 MB にもなる）
       ② 文字の指定は アプリの中に 310 か所ある。1 つずつ直すのは無理なので、
          **上から 1 枚かぶせる**（既にある sheet() が影の中まで配ってくれる）
       ③ **アイコン（Material Symbols）と 数式（KaTeX）と コードは 触らない。**
          ここを巻き込むと、アイコンが英単語になり、数式が崩れる。
     ★ 端末に無い書体は Google Fonts から取る（初回だけ数秒かかる）。 */
  var 和ゴ = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var 和明 = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  /* g … Google Fonts の要求（無ければ端末の書体だけで出す）
     s … 実際に使う書体の並び
     気 … 気分の分け（選ぶときの目印） */
  var FONTS = [
    /* ── そのまま ── */
    { id: "system", 気: "標準", name: "システム標準（いまのまま）", g: "",
      s: '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,' + 和ゴ },
    { id: "hiragino", 気: "標準", name: "ヒラギノ角ゴ", g: "", s: '"Hiragino Sans",' + 和ゴ },
    { id: "yugothic", 気: "標準", name: "游ゴシック", g: "", s: '"Yu Gothic","YuGothic",' + 和ゴ },
    { id: "meiryo", 気: "標準", name: "メイリオ", g: "", s: '"Meiryo",' + 和ゴ },
    { id: "notosans", 気: "標準", name: "Noto Sans JP（すっきり）", g: "Noto+Sans+JP:wght@400;500;700",
      s: '"Noto Sans JP",' + 和ゴ },
    { id: "murecho", 気: "標準", name: "Murecho（やわらかい角ゴ）", g: "Murecho:wght@400;500;700",
      s: '"Murecho",' + 和ゴ },
    { id: "bizgothic", 気: "標準", name: "BIZ UDPGothic（読みやすさ重視）", g: "BIZ+UDPGothic:wght@400;700",
      s: '"BIZ UDPGothic",' + 和ゴ },
    { id: "ibmplexjp", 気: "標準", name: "IBM Plex Sans JP", g: "IBM+Plex+Sans+JP:wght@400;500;700",
      s: '"IBM Plex Sans JP",' + 和ゴ },

    /* ── 静かで落ち着く ── */
    { id: "hiraginoMincho", 気: "静かで落ち着く", name: "ヒラギノ明朝", g: "", s: 和明 },
    { id: "yumincho", 気: "静かで落ち着く", name: "游明朝", g: "", s: '"Yu Mincho","YuMincho",' + 和明 },
    { id: "notoserif", 気: "静かで落ち着く", name: "Noto Serif JP", g: "Noto+Serif+JP:wght@400;500;700",
      s: '"Noto Serif JP",' + 和明 },
    { id: "zenold", 気: "静かで落ち着く", name: "Zen Old Mincho（落ち着いた明朝）", g: "Zen+Old+Mincho:wght@400;700",
      s: '"Zen Old Mincho",' + 和明 },
    { id: "shippori", 気: "静かで落ち着く", name: "しっぽり明朝", g: "Shippori+Mincho:wght@400;700",
      s: '"Shippori Mincho",' + 和明 },
    { id: "bizmincho", 気: "静かで落ち着く", name: "BIZ UDP明朝", g: "BIZ+UDPMincho",
      s: '"BIZ UDPMincho",' + 和明 },
    { id: "sourceserif", 気: "静かで落ち着く", name: "Source Serif 4", g: "Source+Serif+4:wght@400;600",
      s: '"Source Serif 4",' + 和明 },

    /* ── 日本風・和 ── */
    { id: "zenantique", 気: "日本風", name: "Zen Antique（古い印刷風）", g: "Zen+Antique",
      s: '"Zen Antique",' + 和明 },
    { id: "zenantiqueSoft", 気: "日本風", name: "Zen Antique Soft", g: "Zen+Antique+Soft",
      s: '"Zen Antique Soft",' + 和明 },
    { id: "newtegomin", 気: "日本風", name: "New Tegomin（手書きの明朝）", g: "New+Tegomin",
      s: '"New Tegomin",' + 和明 },
    { id: "sawarabim", 気: "日本風", name: "さわらび明朝", g: "Sawarabi+Mincho",
      s: '"Sawarabi Mincho",' + 和明 },
    { id: "sawarabig", 気: "日本風", name: "さわらびゴシック", g: "Sawarabi+Gothic",
      s: '"Sawarabi Gothic",' + 和ゴ },
    { id: "kaiseidecol", 気: "日本風", name: "解星デコール", g: "Kaisei+Decol:wght@400;700",
      s: '"Kaisei Decol",' + 和明 },
    { id: "kaiseiopti", 気: "日本風", name: "解星オプティ", g: "Kaisei+Opti:wght@400;700",
      s: '"Kaisei Opti",' + 和明 },
    { id: "hinamincho", 気: "日本風", name: "Hina Mincho（細い和の明朝）", g: "Hina+Mincho",
      s: '"Hina Mincho",' + 和明 },
    { id: "shipporiantique", 気: "日本風", name: "しっぽりアンチック", g: "Shippori+Antique",
      s: '"Shippori Antique",' + 和ゴ },

    /* ── 可愛い ── */
    { id: "zenmaru", 気: "可愛い", name: "Zen Maru Gothic（丸ゴシック）", g: "Zen+Maru+Gothic:wght@400;500;700",
      s: '"Zen Maru Gothic",' + 和ゴ },
    { id: "mplusround", 気: "可愛い", name: "M PLUS Rounded 1c", g: "M+PLUS+Rounded+1c:wght@400;500;700",
      s: '"M PLUS Rounded 1c",' + 和ゴ },
    { id: "kosugimaru", 気: "可愛い", name: "小杉丸ゴシック", g: "Kosugi+Maru",
      s: '"Kosugi Maru",' + 和ゴ },
    { id: "hachimaru", 気: "可愛い", name: "はちまるポップ", g: "Hachi+Maru+Pop",
      s: '"Hachi Maru Pop",' + 和ゴ },
    { id: "yomogi", 気: "可愛い", name: "Yomogi（やわらかい手書き）", g: "Yomogi",
      s: '"Yomogi",' + 和ゴ },
    { id: "klee", 気: "可愛い", name: "Klee One（鉛筆の手書き）", g: "Klee+One:wght@400;600",
      s: '"Klee One",' + 和明 },
    { id: "potta", 気: "可愛い", name: "Potta One（ぽってり）", g: "Potta+One",
      s: '"Potta One",' + 和ゴ },
    { id: "yuseimagic", 気: "可愛い", name: "Yusei Magic（ゆるい手書き）", g: "Yusei+Magic",
      s: '"Yusei Magic",' + 和ゴ },
    { id: "hiraginoMaru", 気: "可愛い", name: "ヒラギノ丸ゴ", g: "",
      s: '"Hiragino Maru Gothic ProN",' + 和ゴ },

    /* ── 明るい・ポップ ── */
    { id: "delagothic", 気: "明るい・ポップ", name: "Dela Gothic One（極太）", g: "Dela+Gothic+One",
      s: '"Dela Gothic One",' + 和ゴ },
    { id: "rocknroll", 気: "明るい・ポップ", name: "RocknRoll One", g: "RocknRoll+One",
      s: '"RocknRoll One",' + 和ゴ },
    { id: "rampart", 気: "明るい・ポップ", name: "Rampart One（立体）", g: "Rampart+One",
      s: '"Rampart One",' + 和ゴ },
    { id: "reggae", 気: "明るい・ポップ", name: "Reggae One", g: "Reggae+One",
      s: '"Reggae One",' + 和ゴ },
    { id: "trainone", 気: "明るい・ポップ", name: "Train One（線路風）", g: "Train+One",
      s: '"Train One",' + 和ゴ },
    { id: "stick", 気: "明るい・ポップ", name: "Stick（角ばった細字）", g: "Stick",
      s: '"Stick",' + 和ゴ },
    { id: "dotgothic", 気: "明るい・ポップ", name: "DotGothic16（ドット絵）", g: "DotGothic16",
      s: '"DotGothic16",' + 和ゴ },
    { id: "mplus1p", 気: "明るい・ポップ", name: "M PLUS 1p", g: "M+PLUS+1p:wght@400;500;700",
      s: '"M PLUS 1p",' + 和ゴ },

    /* ── チル・やわらか ── */
    { id: "zenkaku", 気: "チル", name: "Zen Kaku Gothic New", g: "Zen+Kaku+Gothic+New:wght@400;500;700",
      s: '"Zen Kaku Gothic New",' + 和ゴ },
    { id: "kosugi", 気: "チル", name: "小杉ゴシック", g: "Kosugi", s: '"Kosugi",' + 和ゴ },
    { id: "nunito", 気: "チル", name: "Nunito（丸くやさしい）", g: "Nunito:wght@400;600;700",
      s: '"Nunito",' + 和ゴ },
    { id: "quicksand", 気: "チル", name: "Quicksand", g: "Quicksand:wght@400;600;700",
      s: '"Quicksand",' + 和ゴ },
    { id: "lato", 気: "チル", name: "Lato", g: "Lato:wght@400;700", s: '"Lato",' + 和ゴ },
    { id: "worksans", 気: "チル", name: "Work Sans", g: "Work+Sans:wght@400;500;600",
      s: '"Work Sans",' + 和ゴ },

    /* ── 切ない・しっとり ── */
    { id: "kaiseiharuno", 気: "切ない", name: "解星 春の海", g: "Kaisei+HarunoUmi:wght@400;700",
      s: '"Kaisei HarunoUmi",' + 和明 },
    { id: "kaiseitokumin", 気: "切ない", name: "解星 特ミン", g: "Kaisei+Tokumin:wght@400;700",
      s: '"Kaisei Tokumin",' + 和明 },
    { id: "shipporib1", 気: "切ない", name: "しっぽり明朝 B1", g: "Shippori+Mincho+B1:wght@400;700",
      s: '"Shippori Mincho B1",' + 和明 },
    { id: "playfair", 気: "切ない", name: "Playfair Display", g: "Playfair+Display:wght@400;600",
      s: '"Playfair Display",' + 和明 },
    { id: "cormorant", 気: "切ない", name: "Cormorant Garamond", g: "Cormorant+Garamond:wght@400;600",
      s: '"Cormorant Garamond",' + 和明 },

    /* ── きりっと ── */
    { id: "inter", 気: "きりっと", name: "Inter", g: "Inter:wght@400;500;700", s: '"Inter",' + 和ゴ },
    { id: "roboto", 気: "きりっと", name: "Roboto", g: "Roboto:wght@400;500;700", s: '"Roboto",' + 和ゴ },
    { id: "montserrat", 気: "きりっと", name: "Montserrat", g: "Montserrat:wght@400;600;700",
      s: '"Montserrat",' + 和ゴ },
    { id: "poppins", 気: "きりっと", name: "Poppins", g: "Poppins:wght@400;500;600",
      s: '"Poppins",' + 和ゴ },
    { id: "oswald", 気: "きりっと", name: "Oswald（細長い）", g: "Oswald:wght@400;600",
      s: '"Oswald",' + 和ゴ },
    { id: "sourcesans", 気: "きりっと", name: "Source Sans 3", g: "Source+Sans+3:wght@400;600",
      s: '"Source Sans 3",' + 和ゴ },

    /* ── 等幅（コード向け） ── */
    { id: "jetbrains", 気: "等幅", name: "JetBrains Mono", g: "JetBrains+Mono:wght@400;700",
      s: '"JetBrains Mono",ui-monospace,' + 和ゴ },
    { id: "firacode", 気: "等幅", name: "Fira Code", g: "Fira+Code:wght@400;600",
      s: '"Fira Code",ui-monospace,' + 和ゴ },
    { id: "ibmplexmono", 気: "等幅", name: "IBM Plex Mono", g: "IBM+Plex+Mono:wght@400;600",
      s: '"IBM Plex Mono",ui-monospace,' + 和ゴ }
  ];
  var FONT_BY_ID = {};
  FONTS.forEach(function (f) { FONT_BY_ID[f.id] = f; });

  /* 選ばれたものだけ 取りに行く。同じものは 二度取らない。 */
  var 取った書体 = {};
  function 書体を取り寄せる(f) {
    if (!f || !f.g || 取った書体[f.g]) return;
    取った書体[f.g] = 1;
    try {
      /* 先につなぎ先を開けておく（取りに行く時間を縮める） */
      if (!doc.getElementById("vqFontPre")) {
        [["https://fonts.googleapis.com", "vqFontPre", false],
         ["https://fonts.gstatic.com", "vqFontPre2", true]].forEach(function (p) {
          var k = doc.createElement("link");
          k.id = p[1]; k.rel = "preconnect"; k.href = p[0];
          if (p[2]) k.crossOrigin = "anonymous";
          doc.head.appendChild(k);
        });
      }
      var href0 = "https://fonts.googleapis.com/css2?family=" + f.g + "&display=block";
      /* 頭の仕込み（vq-font-early）が もう貼っているなら 二度貼らない */
      try { if (doc.querySelector('link[href="' + href0 + '"]')) return; } catch (e9) {}
      var l = doc.createElement("link");
      l.rel = "stylesheet";
      l.setAttribute("data-vq-font", f.id);
      /* ★ display=block（2026-08-17・利用者の訴え）。
         swap だと **先にシステムの書体で描いてから** 差し替わるので、
         画面を切り替えるたび 一瞬だけ元の書体が見えていた。
         block は 届くまで字を出さないので ちらつかない。 */
      l.href = "https://fonts.googleapis.com/css2?family=" + f.g + "&display=block";
      doc.head.appendChild(l);
    } catch (e) {}
  }

  /* ★ 触らないもの。ここを巻き込むと 画面が壊れる。
     ・.ms / material-symbols … アイコン。書体を変えると英単語が出る
     ・.katex とその中     … 数式。字ごとに別の書体を使っている
     ・code / pre / kbd / samp … コードは等幅のまま */
  /* ★ Workplace の **書類そのもの**は 触らない（2026-08-17・利用者の訴え）。
     Docs の紙・Slides の一枚・Sheets の表・Forms の用紙は
     **書類側で選んだ書体**が正しい。アプリの書体で塗り替えてはいけない。
     data-vq-font-keep を付けたところも 同じ扱いにする（あとから増やせる口）。 */
  /* ★ いちばん確かなのは .wp-main（Workplace の **書類が載る入れ物**）。
     Docs・Slides・Sheets・Forms の 4 つとも ここに入る。
     上の帯やわきの道具（.wp-top / .wp-right）は 外に出ているので、
     Workplace の **道具まわりは アプリの書体に そろう**。
     個別の器も念のため残す（作りが変わっても どちらかで止まる）。 */
  var 書類の器 = [".wp-main", ".wpd-page", ".wpd-doc", ".wpp-canvas", ".wpp-thumbs",
                  ".wps-tbl", ".wpd-tbl", ".wpf-wrap", "[data-vq-font-keep]"];
  /* ★ **アイコンの書体は 絶対に 上書きしない**（2026-08-19・実測で 見つけた）。
       ここに 載っていない クラスは、選んだ書体で font-family が
       !important で 塗り替えられる。アイコンは 合字（ligature）で 描いているので、
       書体が 変わると **絵ではなく「menu_book」という 文字が そのまま 出る**。
       44px の枠から あふれて 隣と 重なる ＝ 訴えの「アイコンがバグり散らかしてる」。

       いままで .ms だけを 外していたが、プリセットの設定などで 使っている
       **.vq2-ms が 抜けていた**（クラス名が 違うので .ms には 当たらない）。
       アイコン書体を 当てている クラスは いま .ms と .vq2-ms の 2 つ。
       増やしたときは **必ず ここへも 足すこと。** */
  var 触らない = ':not(.ms):not(.vq2-ms):not([class*="material-symbols"]):not([class*="material-icons"])'
    + ":not(code):not(pre):not(kbd):not(samp):not(.katex):not(.katex *)"
    + 書類の器.map(function (k) { return ":not(" + k + "):not(" + k + " *)"; }).join("");
  function applyFont(v) {
    var f = FONT_BY_ID[v] || FONT_BY_ID.system;
    /* ★ 次に開いたときに **描く前から** 効かせるため、選んだものを覚えておく。
       頭の小さな仕込み（vq-font-early）が、これを読んで先に貼る。 */
    try {
      if (root.localStorage) {
        if (f.id === "system") root.localStorage.removeItem("vq.font.v1");
        else root.localStorage.setItem("vq.font.v1",
          JSON.stringify({ id: f.id, s: f.s, g: f.g, x: 触らない }));
      }
    } catch (e0) {}
    if (f.id === "system") { sheet("vqsetFont", ""); setVar("--vq-app-font", null); return; }
    書体を取り寄せる(f);
    setVar("--vq-app-font", f.s);
    /* :host も一緒に書く。sheet() は影の中にも同じものを配るので、
       document では :host が空振りし、影の中では :root が空振りする。 */
    sheet("vqsetFont",
      ":root,:host{--vq-app-font:" + f.s + ";}"
      + "body,:host{font-family:var(--vq-app-font)!important;}"
      + "body *" + 触らない + ",:host *" + 触らない
      + "{font-family:var(--vq-app-font)!important;}");
  }

  var ACCENTS = {
    lavender: null,   /* 既定＝トークンのまま（上書きを外す） */
    blue: {
      light: { a: "#4F7DC9", h: "#4571BC", s: "#E4ECF9", t: "#2F5793", k: "#FFFFFF" },
      dark:  { a: "#8FB3EC", h: "#A2C0F1", s: "#20293C", t: "#A9C6F2", k: "#17161D" }
    },
    teal: {
      light: { a: "#3E8F86", h: "#35827A", s: "#DFF0ED", t: "#26635C", k: "#FFFFFF" },
      dark:  { a: "#7FC9BF", h: "#93D4CB", s: "#1B322F", t: "#9BD9D0", k: "#17161D" }
    },
    sand: {
      light: { a: "#A8804A", h: "#9A7442", s: "#F4EADB", t: "#7A5C31", k: "#FFFFFF" },
      dark:  { a: "#D9B47C", h: "#E4C392", s: "#332818", t: "#E3C79B", k: "#17161D" }
    },
    rose: {
      light: { a: "#B75D77", h: "#A9536C", s: "#F8E6EC", t: "#8A4058", k: "#FFFFFF" },
      dark:  { a: "#E29BB2", h: "#EBACC0", s: "#37202A", t: "#EFB6C7", k: "#17161D" }
    }
  };
  function applyAccent(v) {
    var set = ACCENTS[v];
    if (!set) {
      ["--vq-accent", "--vq-accent-hover", "--vq-accent-active", "--vq-accent-subtle",
       "--vq-accent-subtle-hover", "--vq-accent-text", "--vq-accent-contrast",
       "--vq-border-focus", "--vq-text-link", "--vq-lav-600"].forEach(function (n) { setVar(n, null); });
      return;
    }
    var c = isDark() ? set.dark : set.light;
    setVar("--vq-accent", c.a); setVar("--vq-accent-hover", c.h);
    setVar("--vq-accent-active", c.t); setVar("--vq-accent-subtle", c.s);
    setVar("--vq-accent-subtle-hover", c.s); setVar("--vq-accent-text", c.t);
    setVar("--vq-accent-contrast", c.k); setVar("--vq-border-focus", c.a);
    setVar("--vq-text-link", c.t); setVar("--vq-lav-600", c.a);
  }

  /* 角の丸み。層の CSS は border-radius を calc(Npx * var(--vq-r-scale,1)) にしてあるので、
     倍率を 1 つ変えるだけで全部の角がそろって動く。丸ボタン(999px)は動かない。 */
  var RADII = { square: "0.3", standard: null, round: "1.7" };
  function applyRadius(v) {
    var k = RADII[v];
    setVar("--vq-r-scale", k);
    setVar("--vq-r-lg", k ? "calc(18px * " + k + ")" : null);
    setVar("--vq-r-md", k ? "calc(14px * " + k + ")" : null);
    setVar("--vq-r-sm", k ? "calc(10px * " + k + ")" : null);
  }

  /* 本文の幅。層ごとに読みやすい幅（Feed 1100 / Insight 820 / 通知 760 …）が
     決めてあるので、一律の数で潰さず **倍率** をかける。 */
  var WIDTHS = { narrow: "0.8", standard: null, wide: "1.25" };
  function applyWidth(v) { setVar("--vq-width-scale", WIDTHS[v] || null); }

  function applyTabular(on) {
    sheet("vqsetTabular", on
      ? ":root,body{font-variant-numeric:tabular-nums;}:host{font-variant-numeric:tabular-nums;}"
      : "");
  }
  function applyReduceMotion(on) {
    setFlag("data-vq-reduce-motion", on);
    sheet("vqsetMotion", on
      ? "*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;" +
        "transition-duration:.01ms !important;scroll-behavior:auto !important;}"
      : "");
  }
  function applyFocusRing(on) {
    sheet("vqsetFocus", on
      ? "a:focus,button:focus,input:focus,select:focus,textarea:focus,[tabindex]:focus{" +
        "outline:2px solid var(--vq-accent,#8A81C2) !important;outline-offset:2px !important;}"
      : "");
  }
  function applyUnderline(on) {
    sheet("vqsetUnderline", on
      ? "a[href]:not(.btn):not(button){text-decoration:underline !important;text-underline-offset:2px;}"
      : "");
  }
  function applyBigTap(on) {
    sheet("vqsetTap", on
      ? "button,[role='button'],a.btn,.row.tap,.mrow,select,input[type='checkbox']{min-height:52px;}" +
        "button.sw,.sw{min-height:0;}"
      : "");
  }
  /* 文字を濃くする。ダークでは逆に **明るく** しないと読みにくくなる。 */
  function applyContrast(on) {
    var d = isDark();
    setVar("--vq-text-secondary", on ? (d ? "#E4DFEC" : "#4A4557") : null);
    setVar("--vq-text-tertiary", on ? (d ? "#B7B0C4" : "#5D5769") : null);
    setVar("--vq-text-subtle", on ? (d ? "#B7B0C4" : "#5D5769") : null);
    setVar("--vq-border-subtle", on ? (d ? "#4A4559" : "#CFC9DC") : null);
  }

  /* クイズ画面（旧 #viewQuiz と v2 の両方）の見せ方 */
  /* 学習プレイヤー（v2）へ写す。まだ読み込まれていない時間帯もあるので、
     入っていなければ黙って何もしない（次に開いたときに保存済みの値が当たる）。 */
  function player(key, v) {
    try {
      var PP = root.VQ2 && root.VQ2.playerPrefs;
      if (!PP) return;
      var patch = {}; patch[key] = v;
      PP.set(patch);
    } catch (e) {}
  }

  /* 新しいクイズ画面は VQ2.playerPrefs だけを 読む。ここの値を そこへ 写す。
     **二重に 持たない**（どちらから 変えても 食い違わないように）。 */
  function applyPlayerPref(key) {
    return function (v) {
      try {
        var PP = root.VQ2 && root.VQ2.playerPrefs;
        if (PP && PP.set) PP.set(key, v);
      } catch (e) {}
    };
  }
  function applyQuizChrome() {
    var css = "";
    if (get("learn.showTimer") === false) css += "#viewQuiz #timerPill{display:none !important;}";
    if (get("learn.showProgress") === false) css += "#viewQuiz .progress,.vq2-prog-row{display:none !important;}";
    /* まわりを隠すのは vq-quiz-skin の規則。display を上書きし返すと
       元が flex の要素を壊すので、規則ごと当たらないように印を付ける。 */
    try {
      if (get("learn.focus") === false) de.setAttribute("data-vq-quiz-focus", "off");
      else de.removeAttribute("data-vq-quiz-focus");
    } catch (e) {}
    sheet("vqsetQuiz", css);
  }

  /* ══ 定義表 ═══════════════════════════════════════════════════════
     kind:"legacy" … 持ち主はアプリ本体。lget で読み、lset で橋渡しする。
     kind:"own"    … 持ち主はここ。apply(v) が実際の効果。
     kind:"action" … 値を持たない。押すと本物のボタンを押す。
     kind:"info"   … 表示だけ。read() が今の状態を返す。
     ───────────────────────────────────────────────────────────── */
  /* DM の 背景。DM は 別の 層（vq-dm.js）なので、
     ここは **覚えを 置いて 合図する**だけ。DM 側が 拾って 当てる。 */
  function applyDmBackground(v) {
    var 名 = ["plain", "paper", "dots", "grid", "dawn", "forest", "night", "sakura"];
    var k = 名.indexOf(String(v)) >= 0 ? String(v) : "plain";
    try { localStorage.setItem("vq.dm.bg", k); } catch (e) {}
    try { de.setAttribute("data-dm-bg", k); } catch (e2) {}
    try {
      var h = doc.getElementById("vqDM");
      if (h) h.setAttribute("data-bg", k);
    } catch (e3) {}
  }

  var SPECS = [
    /* ── 画面と表示 ───────────────────────────────────────── */
    /* 「自動」が何をするかを、選ぶ前に見えるようにしておく。
       端末の設定ではなく時計で決めているので、書かないと誤解される。 */
    { id: "display.theme", group: "display", type: "select", kind: "legacy", label: "テーマ",
      desc: "「自動」は時刻で切り替えます（18:00 からダーク、6:00 からライト）",
      opts: [["AUTO", "自動（18時からダーク）"], ["LIGHT", "ライト"], ["DARK", "ダーク"]],
      lget: function (s) { return s.theme; }, lset: function (v) { return bSelect("settingsThemeSelect", v); } },
    { id: "display.fontFamily", group: "display", type: "select", kind: "own", def: "system",
      label: "フォント", desc: "アプリ全体の書体。気分で選べます（端末に無いものは初回だけ読み込みに数秒）",
      opts: FONTS.map(function (f) { return [f.id, f.気 + " ・ " + f.name]; }),
      apply: applyFont },
    { id: "display.fontSize", group: "display", type: "select", kind: "legacy", label: "文字の大きさ",
      opts: [["SMALL", "小"], ["DEFAULT", "標準"], ["LARGE", "大"]],
      lget: function (s) { return s.fontSize; }, lset: function (v) { return bSelect("settingsFontSizeSelect", v); } },
    { id: "display.animations", group: "display", type: "toggle", kind: "legacy", label: "画面の演出",
      desc: "切り替えの動きや効果を出す",
      lget: function (s) { return s.animations; }, lset: function (v) { return bCheck("animToggle", v); } },
    { id: "display.accent", group: "display", type: "select", kind: "own", def: "lavender",
      label: "アクセントの色", desc: "ボタンや選択中の色が変わる",
      opts: [["lavender", "ラベンダー"], ["blue", "ブルー"], ["teal", "ティール"], ["sand", "サンド"], ["rose", "ローズ"]],
      apply: applyAccent },
    { id: "display.radius", group: "display", type: "seg", kind: "own", def: "standard",
      label: "角の丸み", opts: [["square", "角ばる"], ["standard", "標準"], ["round", "丸い"]],
      apply: applyRadius },
    { id: "display.width", group: "display", type: "seg", kind: "own", def: "standard",
      label: "本文の幅", desc: "画面の広い端末での読みやすさ",
      opts: [["narrow", "せまい"], ["standard", "標準"], ["wide", "広い"]],
      apply: applyWidth },
    { id: "display.tabularNums", group: "display", type: "toggle", kind: "own", def: false,
      label: "数字の幅をそろえる", desc: "点数や時間がガタつかなくなる", apply: applyTabular },
    /* ★ 訴え（2026-08-20）「DM の背景を 設定から 設定できるように。
       VocabuQuiz 側でも 用意はしておこう。テンプレートを 8 つくらい」
       絵の中身は vq-dm.js が 持つ（:host([data-bg]) の CSS）。
       ここは **どれを 選んだか** だけを 覚えて、DM へ 伝える。 */
    { id: "display.dmBackground", group: "display", type: "select", kind: "own", def: "plain",
      label: "DM の背景", desc: "メッセージ画面の 下地。8 種類から 選べます",
      opts: [["plain", "無地"], ["paper", "和紙"], ["dots", "水玉"], ["grid", "方眼"],
             ["dawn", "朝焼け"], ["forest", "森"], ["night", "夜"], ["sakura", "さくら"]],
      apply: applyDmBackground },
    /* VocabuQuiz OS（外殻）。従来の設定画面にしか無かったものを、こちらへ移した。 */
    { id: "display.osTheme", group: "display", type: "select", kind: "legacy", label: "OS のテーマ",
      opts: [["midnight", "Midnight"], ["slate", "Slate"], ["dusk", "Dusk"]],
      lget: function () { return osPref("vqOsThemeSelect", "midnight"); },
      lset: function (v) { return bSelect("vqOsThemeSelect", v); } },
    { id: "display.osWallpaper", group: "display", type: "select", kind: "legacy", label: "OS の壁紙",
      opts: [["aurora", "Aurora"], ["grid", "Grid"], ["quiet", "Quiet"]],
      lget: function () { return osPref("vqOsWallpaperSelect", "aurora"); },
      lset: function (v) { return bSelect("vqOsWallpaperSelect", v); } },
    { id: "display.osMotion", group: "display", type: "seg", kind: "legacy", label: "OS の動きの強さ",
      opts: [["standard", "標準"], ["reduced", "控えめ"]],
      lget: function () { return osPref("vqOsMotionSelect", "standard"); },
      lset: function (v) { return bSelect("vqOsMotionSelect", v); } },
    { id: "display.osDensity", group: "display", type: "seg", kind: "legacy", label: "クイズの詰まり具合",
      opts: [["compact", "詰める"], ["comfortable", "標準"], ["relaxed", "ゆったり"]],
      lget: function () { return osPref("vqOsDensitySelect", "comfortable"); },
      lset: function (v) { return bSelect("vqOsDensitySelect", v); } },

    /* ── 学習 ─────────────────────────────────────────────────
       出題の向きは廃止した（プリセットごとに決まるため、全体の設定にすると噛み合わない）。
       EXAM と WRITE で別々だった「問題数」「入れ替え」も 1 つにまとめ、
       問題数と制限時間は決め打ちの選択肢をやめて **自由に決められる** ようにした。 */
    { id: "learn.questionCount", group: "learn", type: "number", kind: "legacy",
      label: "問題数", desc: "1〜500 問。EXAM と WRITE の両方に使う",
      min: 1, max: 500, step: 1, unit: "問",
      lget: function (s) { return s.questionCount; },
      lset: function (v) { return learnBridge("questionCount", Number(v)); } },
    { id: "learn.examTime", group: "learn", type: "number", kind: "legacy",
      label: "1 問あたりの制限時間", desc: "0〜600 秒。0 にすると制限なし",
      min: 0, max: 600, step: 1, unit: "秒", zeroLabel: "制限なし",
      lget: function (s) { return s.choiceTimeLimitSec; },
      lset: function (v) { return learnBridge("examTime", Number(v)); } },
    /* ══ ここから 新しいクイズ画面へ つないだもの（2026-08-19）════════════
       ★ 訴え「学習の設定を 新たな導線に 繋ぐために 作り直すこと」。
       ★ もとは **古い出題画面の 隠しボタンを 押す**作りだった。
         新しいクイズ画面が すべての入口に なったので、押しても どこにも
         効かなくなっていた（＝ 飾りの設定に なっていた）。
       ★ いまは 値の持ち主が ここで、読むのは VQ2.learn（開く道の 1 本）。
         プリセット詳細・一覧からの開始・本体からの開始、どれも そこを 通る。 */
    { id: "learn.mode", group: "learn", type: "seg", kind: "own", def: "study",
      label: "解きかた", desc: "プリセットを開いたときの初期値",
      opts: [["study", "1 問ずつ"], ["practice", "まとめて採点"], ["exam", "試験"]],
      readBy: "v2/ui/preset-detail.js（VQ2.learn.既定）" },
    { id: "learn.shuffleQ", group: "learn", type: "toggle", kind: "own", def: false,
      label: "問題の順番をばらばらにする", desc: "プリセットを開いたときの初期値",
      readBy: "v2/ui/preset-detail.js（VQ2.learn.既定）" },
    { id: "learn.shuffleC", group: "learn", type: "toggle", kind: "own", def: false,
      label: "選択肢の順番をばらばらにする", desc: "プリセットを開いたときの初期値",
      readBy: "v2/ui/preset-detail.js（VQ2.learn.既定）" },
    { id: "learn.autoNext", group: "learn", type: "toggle", kind: "own", def: false,
      label: "答え合わせのあと自動で次へ", desc: "1 つ選ぶ形式と正誤問題のときだけ効きます",
      readBy: "v2/ui/quiz-player.js", apply: applyPlayerPref("autoNext") },
    { id: "learn.instantExplain", group: "learn", type: "toggle", kind: "own", def: false,
      label: "答えたらすぐ解説を出す", desc: "練習のときだけ。試験では出しません",
      readBy: "v2/ui/quiz-player.js", apply: applyPlayerPref("instantExplain") },
    /* ★ オート（2026-08-28・訴え）。
       「選択肢の問題のみ、クリックしたら 直ぐに 答え合わせを し、次に行く」。
       上の「答えたらすぐ解説を出す」が 入っているときは **そちらが 勝つ**
       （プリセット詳細でも 切れない）。ここは それが 切れている ときに、
       プリセット詳細の スイッチが 覚える 先。 */
    { id: "learn.autoStep", group: "learn", type: "toggle", kind: "own", def: false,
      label: "オート（選んだらすぐ答え合わせ→次へ）",
      desc: "1 つ選ぶ形式と正誤問題だけ。まちがえたときは止まります",
      readBy: "v2/ui/quiz-player.js", apply: applyPlayerPref("autoStep") },
    { id: "learn.confirmSubmit", group: "learn", type: "toggle", kind: "own", def: true,
      label: "採点の前に確認する", readBy: "v2/ui/quiz-player.js",
      apply: applyPlayerPref("confirmSubmit") },
    { id: "learn.warnUnanswered", group: "learn", type: "toggle", kind: "own", def: true,
      label: "未回答があれば知らせる", readBy: "v2/ui/quiz-player.js",
      apply: applyPlayerPref("warnUnanswered") },
    { id: "learn.reverse", group: "learn", type: "toggle", kind: "own", def: false,
      label: "問題と答えを入れ替える",
      desc: "打って答える問題だけ。選択式は 選択肢を 作り直せないので そのまま",
      readBy: "v2/ui/entry.js（VQ2.learn.表裏）",
      /* 古い画面にも 同じ値を 伝えておく（そちらから 入ったときも 揃うように）。 */
      apply: function (v) { try { learnBridge("reverse", !!v); } catch (e) {} } },
    { id: "learn.keyboard", group: "learn", type: "toggle", kind: "own", def: true,
      label: "キーボードで答える", desc: "1〜9 と A〜Z で選択肢を選ぶ", readBy: "v2/ui/quiz-player.js" },
    { id: "learn.showTimer", group: "learn", type: "toggle", kind: "own", def: true,
      label: "残り時間を出す", apply: applyQuizChrome },
    { id: "learn.showProgress", group: "learn", type: "toggle", kind: "own", def: true,
      label: "進み具合を出す", apply: applyQuizChrome },
    { id: "learn.focus", group: "learn", type: "toggle", kind: "own", def: true,
      label: "解いている間はまわりを隠す", desc: "左のパネルと下のバーを隠して集中する",
      apply: applyQuizChrome },

    /* ── 学習プレイヤー（クイズ・VocabuSpeak の解いている画面）─────────
       値の持ち主はここ（設定ストア）。apply で VQ2.playerPrefs へ写す。
       解いている画面（v2/ui/quiz-player.js / speak.js）は playerPrefs だけを読む。
       二重に持たないので、どちらから変えても食い違わない。

       **効かない項目は置かない。** ここに並ぶものは、すべて読む場所がある。 */
    { id: "player.density", group: "player", type: "seg", kind: "own", def: "standard",
      label: "画面の詰まり具合", desc: "余白の広さ。「集中」は右の一覧も隠す",
      opts: [["standard", "標準"], ["compact", "コンパクト"], ["focus", "集中"]],
      apply: function (v) { player("density", v); } },
    { id: "player.fontSize", group: "player", type: "seg", kind: "own", def: "standard",
      label: "問題文の文字の大きさ",
      opts: [["small", "小"], ["standard", "標準"], ["large", "大"], ["xlarge", "特大"]],
      apply: function (v) { player("fontSize", v); } },
    { id: "player.maxWidth", group: "player", type: "seg", kind: "own", def: "standard",
      label: "問題文の幅", desc: "広い画面で 1 行が長くなりすぎないようにする",
      opts: [["narrow", "せまい"], ["standard", "標準"], ["wide", "広い"]],
      apply: function (v) { player("maxWidth", v); } },
    { id: "player.animations", group: "player", type: "toggle", kind: "own", def: true,
      label: "解いている間の画面の動き", apply: function (v) { player("animations", v); } },
    { id: "player.showProgress", group: "player", type: "toggle", kind: "own", def: true,
      label: "進み具合を出す", apply: function (v) { player("showProgress", v); } },
    { id: "player.showTimer", group: "player", type: "toggle", kind: "own", def: true,
      label: "時間を出す", desc: "気になるときは消せる", apply: function (v) { player("showTimer", v); } },
    { id: "player.showSave", group: "player", type: "toggle", kind: "own", def: true,
      label: "保存の状態を出す", apply: function (v) { player("showSave", v); } },
    { id: "player.listPanel", group: "player", type: "toggle", kind: "own", def: true,
      label: "問題の一覧を出す", desc: "広い画面のとき、右側に一覧を出す",
      apply: function (v) { player("listPanel", v); } },
    { id: "player.keyboard", group: "player", type: "toggle", kind: "own", def: true,
      label: "キーボードで答える", desc: "1〜9 と A〜Z で選び、Enter で次へ",
      apply: function (v) { player("keyboard", v); } },
    { id: "player.autoNext", group: "player", type: "toggle", kind: "own", def: false,
      label: "答えたら自動で次へ", desc: "1 つ選ぶ形式と正誤問題のときだけ効く",
      apply: function (v) { player("autoNext", v); } },
    { id: "player.instantExplain", group: "player", type: "toggle", kind: "own", def: false,
      label: "答えたらすぐ解説", desc: "練習のときだけ。試験形式では出さない",
      apply: function (v) { player("instantExplain", v); } },
    { id: "player.choiceDensity", group: "player", type: "seg", kind: "own", def: "standard",
      label: "選択肢の詰まり具合", opts: [["standard", "標準"], ["compact", "詰める"]],
      apply: function (v) { player("choiceDensity", v); } },
    { id: "player.resetScroll", group: "player", type: "toggle", kind: "own", def: true,
      label: "問題ごとに先頭へ戻す", apply: function (v) { player("resetScroll", v); } },
    { id: "player.confirmSubmit", group: "player", type: "toggle", kind: "own", def: true,
      label: "採点の前に確認する", apply: function (v) { player("confirmSubmit", v); } },
    { id: "player.warnUnanswered", group: "player", type: "toggle", kind: "own", def: true,
      label: "未回答があれば知らせる", apply: function (v) { player("warnUnanswered", v); } },
    { id: "player.speakBigMic", group: "player", type: "toggle", kind: "own", def: true,
      label: "マイクを大きく出す", desc: "VocabuSpeak で話す練習のとき",
      apply: function (v) { player("speakBigMic", v); } },
    { id: "player.speakInstantFeedback", group: "player", type: "toggle", kind: "own", def: true,
      label: "答えたらすぐ手ごたえを出す", desc: "VocabuSpeak のレッスン中",
      apply: function (v) { player("speakInstantFeedback", v); } },

    /* ── 音 ───────────────────────────────────────────────── */
    { id: "sound.bgm", group: "sound", type: "toggle", kind: "legacy", label: "BGM",
      lget: function (s) { return s.bgm; }, lset: function (v) { return bCheck("bgmToggle", v); } },
    { id: "sound.sfx", group: "sound", type: "toggle", kind: "legacy", label: "効果音",
      lget: function (s) { return s.sfx; }, lset: function (v) { return bCheck("sfxToggle", v); } },
    { id: "sound.bgmVolume", group: "sound", type: "seg", kind: "legacy", label: "BGM の大きさ",
      opts: [["SMALL", "小"], ["DEFAULT", "標準"], ["LARGE", "大"]],
      lget: function (s) { return s.bgmVolume; },
      lset: function (v) { return bClick(v === "SMALL" ? "bgmVolSmallBtn" : v === "LARGE" ? "bgmVolLargeBtn" : "bgmVolDefaultBtn"); } },
    /* 新しいお知らせ（NEWS）が来たときに鳴らす音。選ぶとその場で試聴できる。
       既定は「通知音 1」。 */
    /* ══ 音声会話（Lumi）════════════════════════════════════════════
       ★ マイクは **一度 指で触らないと**始められない決まりがある。
         このスイッチを押した瞬間が、その「触った」に当たる。
         だからここで待ち受けを始める（起動時に勝手には始められない）。
       ★ 会話の中身の扱いは、隠さず desc に書く。 */
    { id: "voice.wake", group: "sound", type: "toggle", kind: "own", def: false,
      label: "「Hey Lumi」で呼べるようにする",
      desc: "マイクをずっと待たせて、呼びかけたら音声会話が始まります。"
        + "話しかけると Lumi は黙ります。画面を長押しすると終わります。"
        + "会話の内容は AI の改善に使われます。1 回の会話は 10 分で終わります。"
        /* ★ iPhone は開くたびに許可を聞く。**これは iOS の決まりで消せない。**
           黙っていると「壊れている」と思われるので、消せないことと、
           聞かれなくする方法を、ここに書いておく。 */
        + "／iPhone は開くたびにマイクの許可を聞きます（iOS の決まりです）。"
        + "聞かれたくないときは 設定アプリ →「Safari」→「マイク」→「許可」にすると出なくなります",
      apply: function (v, o) {
        try {
          var L = root.__vqLive;
          if (!L) return;
          if (v) {
            /* ★ **開き直しても残るようにする**（2026-08-15）。
               前は起動時に何もしなかったので、開くたびにスイッチを
               入れ直す必要があった。
               マイクは「指で触ってから」でないと始められない決まりがあるが、
               **許可は端末が覚えている**ので、
                 ・許可済みなら その場で始める
                 ・そうでなければ **次に画面を触ったとき**に黙って始める
               どちらもスイッチを押し直さずに済む。 */
            if (o && o.boot) { L.arm(); return; }
            if (!L.listen()) {
              /* すぐ始められなくても切らない。次に触ったときに始める。 */
              L.arm();
            }
          } else { L.stopListen(); L.hideButton(); }
        } catch (e) {}
      } },
    /* ★ 声（2026-08-26 に **男女で 20 まで 増やした**）。
       ─ 前は ここに 5 つ 手で 書いてあった。サーバの LIVE_VOICES とは
         別の 場所なので、片方だけ 足すと 「選べるのに 鳴らない」に なった。
       ─ いまは **サーバの /api/tts/voices が 決めどころ**。ここは それを 読む。
       ─ opts を 取り出すたびに 今の 一覧を 返す（**取り出し口**にしてある）ので、
         あとから サーバの ぶんが 届いても 描き直せば すぐ 反映される。
       ─ 男女は 声の 高さを 実際に 測って 分けてある（推測ではない）。 */
    { id: "voice.name", group: "sound", type: "select", kind: "own", def: "Kore",
      label: "Lumi の声", desc: "女性 8・男性 12。選ぶとその場で試せます（音声会話と読み上げの両方に効きます）",
      get opts() {
        try {
          var V = root.VQVOICE;
          if (V && V.選択肢) { var o = V.選択肢(); if (o && o.length) return o; }
        } catch (e) {}
        /* VQVOICE が まだ 読み込まれていないとき用の 最低限（既定だけは 出す） */
        return [["Kore", "コレ（女性・しっかり／既定）"]];
      },
      apply: function (v, o) {
        /* 選んだその場で聞かせる。起動のときや、サーバから降りてきたときは鳴らさない。 */
        if (o && (o.boot || o.quiet)) return;
        try {
          if (root.VQ2 && VQ2.tts && VQ2.tts.play) {
            VQ2.tts.play("こんにちは。Lumi です。この声でお話しします。", { lang: "ja" });
          }
        } catch (e) {}
      } },
    /* ★ 「呼んでも反応しない」を **推測で直さない**ための口。
       端末が実際に何と聞き取ったかを、そのまま見せる。 */
    /* ★ 実機でしか出ない不具合を **推測で直さない**ための入口。
       1 タップで、聞き取りの知らせが 1 つずつ出るか／どこで落ちるかが分かる。 */
    /* ══ 端末の声で 代用するか（2026-08-28）════════════════════════
       ★ 訴え「iPhone だと、なぜか Apple の TTS が 流れてしまう」。
         流れるのは **こちらが 用意できなかった とき の 逃げ道**。
         無音より ましなので 既定は 入だが、
         「用意した 声でないなら 鳴らさなくていい」人は 切れるようにする。 */
    { id: "voice.deviceFallback", group: "sound", type: "switch", kind: "own",
      def: true, label: "用意した声を出せないときは端末の声で読む",
      desc: "切ると、iPhone や PC の標準の声（Apple / Google の声）に切り替わらなくなります。かわりに、なぜ出せなかったかだけを出します",
      /* 当てる 相手が 居ない（この場で 変える 見た目が 無い）。
         鳴らす その時に 読まれる ので、持ち主を 書いておく。
         空の apply を 置くのは **効いている ふり**なので しない。 */
      readBy: "v2/ui/tts.js" },

    /* ══ 読み上げの 調子を みる（2026-08-28）════════════════════════
       ★ 「鳴らない」の 原因は 端末ごとに 違う（さわり待ち・枠切れ・
         札が 無い・つながらない）。**その端末で 1 段ずつ 試して**
         どこで 止まっているかを 出す。作り話は しない。 */
    { id: "voice.selfcheck", group: "sound", type: "action", kind: "own",
      label: "読み上げの調子をみる", value: "みる",
      desc: "音が鳴らないとき。この端末で 1 段ずつ試して、どこで止まっているかを出します",
      run: function () {
        var 行 = [];
        var 出す = function (t, o2) {
          try {
            if (root.VQ2 && root.VQ2.ui && root.VQ2.ui.mount) {
              var app = root.VQ2.ui.mount("vq2-ttscheck",
                { title: "読み上げの調子", sheet: true, stack: true });
              app.root.innerHTML = '<div class="vq2-body"><div class="vq2-pane vq2-pane-c">'
                + '<div class="vq2-pane-b"><div class="vq2-card">'
                + '<pre style="white-space:pre-wrap;word-break:break-word;margin:0;'
                + 'font:13px/1.9 ui-monospace,SFMono-Regular,Menlo,monospace">'
                + String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                + "</pre></div></div></div></div>";
              return;
            }
          } catch (e) {}
          try { root.alert(t); } catch (e) {}
        };
        var 印 = function (ok, 文) { 行.push((ok ? "○ " : "× ") + 文); };

        /* ① ログインの札 */
        var tok = "";
        try { tok = String(root.localStorage.getItem("app.auth.token.v1") || ""); } catch (e) {}
        印(tok.length > 20, "ログインの札" + (tok.length > 20 ? "（あり）" : "（なし＝サーバの声は使えません）"));

        /* ② 器の 鍵（さわった 流れの中なので、ここで 開くはず） */
        var T = root.VQ2 && root.VQ2.tts;
        印(!!T, "読み上げの部品");
        if (!T) { 出す(行.join("\n")); return; }
        印(!!T.canSpeakLocal(), "この端末の声（逃げ道）");

        /* ③ サーバへ 届くか（声の一覧） */
        var base = "";
        try { base = String(root.AUTH_API_BASE || root.VQ_API_BASE || "").replace(/\/+$/, ""); } catch (e) {}
        var t0 = Date.now();
        root.fetch(base + "/api/tts/voices").then(function (r) {
          印(r.ok, "サーバへ届く（声の一覧 HTTP " + r.status + "・" + (Date.now() - t0) + "ms）");
          return r.ok ? r.json() : null;
        }).catch(function () {
          印(false, "サーバへ届かない（つながりません）");
          return null;
        }).then(function (j) {
          if (j && j.voices) 印(true, "使える声 " + j.voices.length + " 種");
          /* ④ 実際に 1 本 作って 鳴らす */
          var t1 = Date.now();
          return T.play("読み上げの調子を みています。", { rate: 1 }).then(function (r) {
            var ms = Date.now() - t1;
            if (r && r.ok) {
              印(true, "鳴らせた（" + (r.source === "local" ? "この端末の声" :
                r.source === "cache" ? "手元に置いてあったもの" : "サーバの声") + "・" + ms + "ms）");
              if (r.note) 行.push("   " + r.note);
            } else {
              印(false, "鳴らせなかった（" + ms + "ms）");
              行.push("   理由: " + ((r && r.reason) || "分かりません"));
              if (r && r.さわり待ち) 行.push("   → 画面をさわってから、もう一度 押してください。");
            }
          });
        }).then(function () {
          行.push("");
          if (/iPhone|iPad|iPod/i.test(String(root.navigator.userAgent))) {
            行.push("※「鳴らせた」と出ているのに 聞こえないときは、");
            行.push("　 iPhone 横の 消音スイッチ（オレンジが 見えている状態）を 確かめてください。");
            行.push("　 消音のときは 用意した声だけ 消えて、端末の声は 鳴ります。");
          }
          行.push("端末: " + String(root.navigator.userAgent).slice(0, 120));
          出す(行.join("\n"));
        });
      } },

    { id: "voice.check", group: "sound", type: "action", kind: "own",
      label: "呼びかけを調べる", value: "調べる",
      desc: "「Hey Lumi」が反応しないとき。30秒はかって、どこで止まっているかを出します",
      run: function () {
        /* ★ **別窓で開かない。** 塞がれても例外を投げず null を返すだけなので、
           catch に落ちず「押しても何も起きない」になる。
           同じ窓で移る。壊れている当のアプリの中で測れる利点もある。 */
        try { root.location.href = "/live-check.html"; }
        catch (e) { root.location.assign("/live-check.html"); }
      } },
    { id: "voice.heard", group: "sound", type: "action", kind: "own",
      label: "聞こえた言葉を見る", value: "見る",
      desc: "「Hey Lumi」で反応しないとき、端末が何と聞き取ったかを確かめられます",
      run: function () {
        var list = [];
        try { list = (root.__vqLive && root.__vqLive.heard()) || []; } catch (e) {}
        var body = list.length ? list.join("\n")
          : "まだ何も聞こえていません。\n「Hey Lumi」で呼べるようにする が入っているか確かめてください。";
        try {
          if (root.VQ2 && VQ2.ui && VQ2.ui.mount) {
            var app = VQ2.ui.mount("vq2-heard", { title: "聞こえた言葉", sheet: true, stack: true });
            app.root.innerHTML = '<div class="vq2-body"><div class="vq2-pane vq2-pane-c">'
              + '<div class="vq2-pane-b"><div class="vq2-card">'
              + '<div class="vq2-sec-t">端末が聞き取った言葉（新しい順）</div>'
              + '<pre style="white-space:pre-wrap;font:13px/1.9 inherit;margin:0">'
              + String(body).replace(/[&<>]/g, function (c) {
                  return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; })
              + "</pre></div></div></div></div>";
            return;
          }
        } catch (e) {}
        try { root.alert(body); } catch (e) {}
      } },
    { id: "voice.tour", group: "sound", type: "action", kind: "own",
      label: "Lumi のはじめかたを もう一度見る", value: "見る",
      desc: "5 つの手順で、呼びかけ・ボード・カメラを試せます",
      run: function () { try { root.__vqLumiTour && root.__vqLumiTour.もう一度(); } catch (e) {} } },
    { id: "voice.now", group: "sound", type: "action", kind: "own",
      label: "いますぐ Lumi と話す", value: "話す",
      desc: "呼びかけずに、その場で音声会話を始めます",
      run: function () { try { root.__vqLive && root.__vqLive.open(); } catch (e) {} } },
    /* ── Lumi の画面まわり（2026-08-18・訴え）──────────────────────
       会話中に出る 右下のボタン（履歴・カメラ・文字）と、
       会話の履歴そのものを 出すかどうか。どちらも すぐ効く。 */
    { id: "voice.dock", group: "sound", type: "toggle", kind: "own", def: true,
      label: "会話中に右下のボタンを出す",
      desc: "履歴・カメラ・文字入力のボタン。切ると画面がすっきりします",
      apply: function (v) {
        try { document.body.classList.toggle("vq-live-nodock", !v); } catch (e) {}
      } },
    { id: "voice.saveChat", group: "sound", type: "toggle", kind: "own", def: true,
      label: "会話を Quick Chat に残す",
      desc: "音声会話が終わったら、その内容を Quick Chat の会話として保存します（この端末の中）",
      readBy: "vq-live" },
    { id: "voice.log", group: "sound", type: "toggle", kind: "own", def: true,
      label: "会話の履歴を出せるようにする",
      desc: "自分と Lumi のやりとりを画面に浮かべます。切ると履歴のボタンも出ません",
      apply: function (v) {
        try { if (!v && root.__vqLive && root.__vqLive.履歴を出す) root.__vqLive.履歴を出す(false); } catch (e) {}
      } },
    /* ★ 「デフォルト」を 足して **初期値**にした（2026-08-20・訴え）。
       並びは 鳴らさない → デフォルト → 通知音 1〜7。
       もとの 初期値は 通知音 1 だった。すでに 自分で 選んでいる人の
       設定は そのまま（def は **まだ 選んでいない人**にだけ 効く）。 */
    { id: "sound.notify", group: "sound", type: "select", kind: "own", def: "n0",
      label: "通知音", desc: "新しいお知らせがあるときに鳴らす音。選ぶと試聴できる",
      opts: [["off", "鳴らさない"], ["n0", "デフォルト"],
             ["n1", "通知音 1"], ["n2", "通知音 2"], ["n3", "通知音 3"],
             ["n4", "通知音 4"], ["n5", "通知音 5"], ["n6", "通知音 6"], ["n7", "通知音 7"]],
      apply: function (v, o) {
        /* 選んだその場で聞かせる。起動のときや、サーバから降りてきたときは鳴らさない。 */
        if (o && (o.boot || o.quiet)) return;
        try { if (root.__vqNewsFlash) root.__vqNewsFlash.play(v); } catch (e) {}
      } },
    { id: "sound.sfxVolume", group: "sound", type: "select", kind: "legacy", label: "効果音の大きさ",
      opts: [["SMALL", "小"], ["DEFAULT", "標準"], ["LARGE", "大"]],
      lget: function (s) { return s.sfxVolume; }, lset: function (v) { return bSelect("settingsSfxVolumeSelect", v); } },

    /* ── 通知 ─────────────────────────────────────────────── */
    { id: "notif.enabled", group: "notif", type: "toggle", kind: "own", def: true,
      label: "画面の通知を出す", desc: "保存や書き出しの進み具合など", readBy: "vq-notify" },
    { id: "notif.position", group: "notif", type: "seg", kind: "own", def: "tr",
      label: "出る場所", opts: [["tl", "左上"], ["tr", "右上"], ["br", "右下"]],
      apply: function () { if (root.__vqNotifyRelayout) try { root.__vqNotifyRelayout(); } catch (e) {} } },
    { id: "notif.duration", group: "notif", type: "seg", kind: "own", def: "normal",
      label: "消えるまで", opts: [["short", "短い"], ["normal", "標準"], ["long", "長い"]],
      readBy: "vq-notify" },
    /* iPhone の通知。起動のたびに聞かれるのをやめたので、ここが入口。 */
    { id: "notif.push", group: "notif", type: "action", label: "iPhone の通知を設定する",
      value: "開く", real: "", push: true, closeFirst: true },

    /* ── AI ───────────────────────────────────────────────── */
    { id: "ai.advice", group: "ai", type: "toggle", kind: "own", def: true,
      label: "結果に助言を自動で出す", desc: "この端末の中の AI が作る。外へは送らない",
      readBy: "v2/ui/result-view.js" },
    /* ★ AI が 作った ぶんを **自動で 全部 入れる**か、いったん 見せるか
       （2026-08-26）。
       訴え:「AIの生成物は、すべて 適用しないと いけないのよね。だから、
              オートモードと、標準モードで 切り替えられるように してほしい。
              オートモードの場合は、自動で 問題に 全て 追加される もの」
       ★ 名前に "auto" を そのまま 使わないこと。プリセット作成画面には
         すでに st.mode="auto"（AI で作る／手で直す）と
         st.mixStyle="auto"（形式の内訳を おまかせ）が あり、相乗りすると 壊れる。 */
    { id: "ai.applyMode", group: "ai", type: "seg", kind: "own", def: "standard",
      label: "AI が作ったものの入れかた",
      desc: "オート＝できたら そのまま 全部 入れる／標準＝入れる前に 見せて 選ぶ",
      opts: [["standard", "標準（選ぶ）"], ["auto", "オート（全部入れる）"]],
      readBy: "v2/ui/preset-studio.js" },
    { id: "ai.localStatus", group: "ai", type: "info", label: "この端末の AI",
      read: function () { return root.__vqLocalAI ? "つながっている" : "見つからない"; } },
    /* ★ 読み上げ・音声は **いつでも サーバ**が 既定（2026-08-26・約束）。
       手元の AI（この Mac の 中の VOICEVOX / Kokoro）は 配った先には
       無いので、既定で 使うと 端末ごとに 声が 変わり、選んだ 声も 効かない。
       開発で 試したい ときだけ 自分で 入れる。 */
    { id: "ai.local", group: "ai", type: "toggle", kind: "own", def: false,
      label: "この端末の AI を使う", desc: "切のときは いつでも サーバで作ります（既定・おすすめ）",
      readBy: "v2/ui/tts.js" },

    /* ── アクセシビリティ ─────────────────────────────────── */
    { id: "a11y.reduceMotion", group: "a11y", type: "toggle", kind: "own", def: false,
      label: "動きを減らす", desc: "画面の動きをほぼ無くす", apply: applyReduceMotion },
    { id: "a11y.contrast", group: "a11y", type: "toggle", kind: "own", def: false,
      label: "文字を濃くする", desc: "薄い文字と線をはっきりさせる", apply: applyContrast },
    { id: "a11y.focusRing", group: "a11y", type: "toggle", kind: "own", def: false,
      label: "選んでいる場所に枠を出す", desc: "キーボードで操作するとき分かりやすい", apply: applyFocusRing },
    { id: "a11y.underlineLinks", group: "a11y", type: "toggle", kind: "own", def: false,
      label: "リンクに下線を引く", apply: applyUnderline },
    { id: "a11y.bigTap", group: "a11y", type: "toggle", kind: "own", def: false,
      label: "押せる範囲を広げる", apply: applyBigTap },

    /* ── データ ───────────────────────────────────────────── */
    { id: "data.sync", group: "data", type: "toggle", kind: "own", def: true,
      label: "設定をアカウントに保存する", desc: "ログインしている端末どうしで設定がそろう",
      apply: function (v) { if (v) pull(); } },
    { id: "data.debug", group: "data", type: "toggle", kind: "legacy", label: "データ検証を表示する",
      lget: function (s) { return s.debug; }, lset: function (v) { return bCheck("debugToggle", v); } },
    { id: "data.backup", group: "data", type: "action", label: "端末の中にバックアップを作る", value: "実行", real: "backupCreateNowBtn" },
    { id: "data.export", group: "data", type: "action", label: "JSON に書き出す", value: "書き出す", real: "backupExportBtn" },
    { id: "data.import", group: "data", type: "action", label: "JSON から戻す", value: "選ぶ", real: "backupImportBtn", closeFirst: true },
    { id: "data.restore", group: "data", type: "action", label: "端末の中の最新から戻す", value: "実行", real: "backupRestoreLatestBtn", closeFirst: true },
    { id: "data.clearLogs", group: "data", type: "action", label: "学習の記録を消す", value: "消す", real: "settingsDeleteLogsBtn", danger: true, closeFirst: true },
    { id: "data.clearShare", group: "data", type: "action", label: "共有の一時保存を消す", value: "消す", real: "settingsClearShareCacheBtn", danger: true, closeFirst: true },
    { id: "data.factory", group: "data", type: "action", label: "はじめの状態に戻す", value: "初期化", real: "settingsFactoryResetBtn", danger: true, closeFirst: true },

    /* ── ヘルプと情報 ─────────────────────────────────────────
       4 つとも新しい画面（vq-docs）。従来のメニューの記事は開かない。 */
    { id: "help.help", group: "help", type: "action", label: "ヘルプ", value: "開く",
      doc: "help", closeFirst: true },
    { id: "help.report", group: "help", type: "action", label: "報告 / お問い合わせ", value: "開く",
      doc: "report", closeFirst: true },
    { id: "help.terms", group: "help", type: "action", label: "利用規約", value: "開く",
      doc: "terms", closeFirst: true },
    { id: "help.privacy", group: "help", type: "action", label: "プライバシーポリシー", value: "開く",
      doc: "privacy", closeFirst: true },
    { id: "help.share", group: "help", type: "action", label: "プリセットを共有する", value: "開く",
      real: '#appSettingsPage [data-settings-shortcut="openPresetShare"]', closeFirst: true },

    /* ── この端末について ─────────────────────────────────── */
    { id: "about.online", group: "about", type: "info", label: "通信",
      read: function () { return navigator.onLine === false ? "つながっていない" : "つながっている"; } },
    { id: "about.account", group: "about", type: "info", label: "アカウント",
      read: function () { return token() ? "ログイン中" : "未ログイン"; } },
    { id: "about.sync", group: "about", type: "info", label: "設定の同期",
      read: function () { return syncLabel(); } },
    { id: "about.storage", group: "about", type: "info", label: "この端末で使っている容量",
      read: function () { return storageLabel(); } },
    { id: "about.screen", group: "about", type: "info", label: "画面の幅",
      read: function () { return String(root.innerWidth || 0) + " px"; } }
  ];

  var GROUPS = [
    /* ── 並び ──────────────────────────────────────────────────
       group が **PC もモバイルも同じ**並びの正。
       近いものを隣に置く（探すときに行き来させない）:
         1 学ぶ … 出題・解く画面・作る・AI
         2 見た目と音
         3 アカウントとデータ … 本人・容量・同期・お知らせ
         4 その他 … 困ったとき・端末の状態・道具
       以前は group が入っておらず、モバイルは全部ひとかたまり、
       PC は別の基準（nav）で並んでいたため、両者が食い違っていた。 */
    { id: "learn", label: "学習", ms: "quiz", sub: "出題の向き・問題数・時間", group: 1 },
    { id: "player", label: "学習プレイヤー", ms: "play_circle", sub: "解いている画面の見え方・進み方", group: 1 },
    { id: "workspace", label: "Learning Workspace", ms: "school", sub: "AI での作成・試験", group: 1, special: "workspace" },
    { id: "ai", label: "AI", ms: "auto_awesome", sub: "結果の助言・この端末の AI", group: 1 },

    { id: "display", label: "画面と表示", ms: "palette", sub: "テーマ・色・文字の大きさ", group: 2 },
    /* ★ 印は **手元の 書体に 入っているものだけ**（2026-08-20・訴え
       「モバイルの ストレージ、見やすさ・使いやすさの アイコンが おかしい。
         英語が 剥き出しの ままだよ」）。
       アイコンは 合字なので、書体に 無い 名前は **その名前が そのまま 文字で 出る**。
       accessibility_new は 入っていなかった（実測 408px ＝ 文字）。 */
    { id: "a11y", label: "見やすさ・使いやすさ", ms: "visibility", sub: "動きを減らす・文字を濃く・枠", group: 2 },
    { id: "sound", label: "音", ms: "volume_up", sub: "BGM・効果音・大きさ", group: 2 },

    { id: "account", label: "アカウント", ms: "person", sub: "ログイン・連携・退会", group: 3, special: "account" },
    /* database も 入っていなかった（実測 192px ＝ 文字）。
       data_usage は 入っていて、意味も「使っている量」で ぴたりと 合う。 */
    { id: "storage", label: "ストレージ", ms: "data_usage", sub: "使っている容量の内訳", group: 3, special: "storage" },
    { id: "data", label: "データ", ms: "storage", sub: "同期・バックアップ・初期化", group: 3 },
    { id: "notif", label: "通知", ms: "notifications", sub: "出る場所・消えるまで", group: 3 },

    { id: "help", label: "ヘルプと情報", ms: "help", sub: "レポート・共有・規約", group: 4 },
    { id: "about", label: "この端末について", ms: "info", sub: "通信・容量・画面", group: 4 },
    { id: "advanced", label: "詳細・管理", ms: "tune", sub: "OS / 拡張アシスタント / OEA / Admin", group: 4, special: "advanced" }
  ];

  var BY_ID = {};
  SPECS.forEach(function (s) { BY_ID[s.id] = s; });

  /* ── 検証（壊れた値を入れない） ─────────────────────────────── */
  function valid(spec, v) {
    if (!spec) return false;
    if (spec.type === "toggle") return typeof v === "boolean";
    if (spec.type === "number") {
      if (typeof v !== "number" || !isFinite(v)) return false;
      if (Math.round(v) !== v) return false;
      return v >= spec.min && v <= spec.max;
    }
    if (spec.type === "select" || spec.type === "seg") {
      if (!spec.opts) return false;
      for (var i = 0; i < spec.opts.length; i++) if (String(spec.opts[i][0]) === String(v)) return true;
      return false;
    }
    return false;
  }
  function coerce(spec, v) {
    if (!spec) return v;
    /* 入／切は **本当の真偽値だけ** 受ける。
       ここで !!v にしてしまうと "yes" や 0 が黙って通り、
       壊れた値が入らないという約束が崩れる。 */
    if (spec.type === "toggle") return v;
    /* 数は「数のまま」。文字にすると範囲の判定ができなくなる。
       サーバから戻る値は数字の文字列のことがあるので、数字だけの文字列は数へ直す。 */
    if (spec.type === "number") {
      if (typeof v === "number") return v;
      if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
      return v;
    }
    return (v === null || v === undefined) ? v : String(v);
  }

  /* ── 端末の中の記録 ─────────────────────────────────────────── */
  var rec = {};        /* id -> {v, at} */
  function loadRec() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { o = {}; }
    rec = {};
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      var e = o[k];
      if (!e || typeof e !== "object") continue;
      var sp = BY_ID[k];
      if (!sp) continue;                     /* 知らない鍵は捨てる */
      var v = coerce(sp, e.v);
      if (!valid(sp, v)) continue;
      rec[k] = { v: v, at: Number(e.at) || 0 };
    }
  }
  function saveRec() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (e) {}
  }

  /* ── 読み書き ───────────────────────────────────────────────── */
  function get(id) {
    var sp = BY_ID[id];
    if (!sp) return undefined;
    if (rec[id]) return rec[id].v;
    if (sp.kind === "legacy") return sp.lget(appSettings());
    return sp.def;
  }
  function defaultOf(id) {
    var sp = BY_ID[id];
    if (!sp) return undefined;
    if (sp.kind === "legacy") return sp.lget(appSettings());
    return sp.def;
  }

  var listeners = [];
  function fire(id, v) {
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](id, v); } catch (e) {} }
  }

  function applyOne(id, v, opts) {
    var sp = BY_ID[id];
    if (!sp) return;
    if (sp.kind === "own" && typeof sp.apply === "function") { try { sp.apply(v, opts || {}); } catch (e) {} }
    /* readBy 型（読む側がその都度見る設定）はここで当てるものが無い。 */
    else if (sp.kind === "legacy" && !(opts && opts.skipBridge)) { try { sp.lset(v); } catch (e) {} }
  }

  var dirty = {};       /* 送りたい鍵 */
  var pushTimer = null;
  function set(id, v, opts) {
    var sp = BY_ID[id];
    if (!sp || sp.type === "action" || sp.type === "info") return false;
    v = coerce(sp, v);
    if (!valid(sp, v)) return false;
    var cur = get(id);
    rec[id] = { v: v, at: now() };
    saveRec();
    if (cur !== v || (opts && opts.force)) applyOne(id, v, opts);
    dirty[id] = true;
    schedulePush();
    fire(id, v);
    return true;
  }
  function reset(id) {
    var sp = BY_ID[id];
    if (!sp) return false;
    return set(id, defaultOf(id), { force: true });
  }
  function resetGroup(g) {
    SPECS.forEach(function (s) {
      if (s.group !== g) return;
      if (s.type === "action" || s.type === "info") return;
      if (s.kind === "own") set(s.id, s.def, { force: true });
    });
    return true;
  }

  /* ── サーバとの合流 ─────────────────────────────────────────── */
  var syncState = { at: 0, ok: null, msg: "まだ試していない", busy: false };
  function syncLabel() {
    if (!token()) return "未ログイン（この端末のみ）";
    if (get("data.sync") === false) return "しない設定";
    if (syncState.busy) return "確認中…";
    if (syncState.ok === true) return "そろっている";
    if (syncState.ok === false) return "つながらない（" + syncState.msg + "）";
    return "まだ試していない";
  }
  function storageLabel() {
    var n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k) || "";
        n += k.length + v.length;
      }
    } catch (e) { return "分からない"; }
    var mb = n * 2 / 1024 / 1024;     /* UTF-16 概算 */
    return (mb < 1 ? (n * 2 / 1024).toFixed(0) + " KB" : mb.toFixed(1) + " MB");
  }

  function api(path, opts) {
    opts = opts || {};
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return fetch(path, {
      method: opts.method || "GET", headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* サーバの {id:{v,at}} と手元を鍵ごとに合流させる。
     ・サーバの方が新しい鍵 → 手元へ入れて効果を当てる
     ・手元の方が新しい鍵   → 送る側へ積む */
  function mergeRemote(remote) {
    var changed = [], push = {};
    for (var id in BY_ID) {
      if (!Object.prototype.hasOwnProperty.call(BY_ID, id)) continue;
      var sp = BY_ID[id];
      if (sp.type === "action" || sp.type === "info") continue;
      var mine = rec[id] || null;
      var theirs = remote && remote[id] && typeof remote[id] === "object" ? remote[id] : null;
      var tv = theirs ? coerce(sp, theirs.v) : undefined;
      var tat = theirs ? (Number(theirs.at) || 0) : -1;
      if (theirs && !valid(sp, tv)) { theirs = null; tat = -1; }
      var mat = mine ? mine.at : -1;
      if (theirs && tat > mat) {
        rec[id] = { v: tv, at: tat };
        changed.push(id);
      } else if (mine && mat > tat) {
        push[id] = { v: mine.v, at: mine.at };
      }
    }
    if (changed.length) saveRec();
    changed.forEach(function (id) { applyOne(id, rec[id].v, { quiet: true }); fire(id, rec[id].v); });
    return push;
  }

  function pull() {
    if (!token() || get("data.sync") === false) { syncState.ok = null; return Promise.resolve(false); }
    syncState.busy = true;
    return api("/api/settings").then(function (j) {
      syncState.busy = false;
      var push = mergeRemote(j && j.settings ? j.settings : {});
      syncState.ok = true; syncState.at = now(); syncState.msg = "";
      if (Object.keys(push).length) return api("/api/settings", { method: "PUT", body: { patch: push } }).then(function () { return true; });
      return true;
    }).catch(function (e) {
      syncState.busy = false; syncState.ok = false;
      syncState.msg = e && e.status ? ("HTTP " + e.status) : "通信できない";
      return false;
    });
  }
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, PUSH_WAIT);
  }
  function pushNow() {
    pushTimer = null;
    var ids = Object.keys(dirty);
    if (!ids.length) return Promise.resolve(false);
    if (!token() || get("data.sync") === false) { dirty = {}; return Promise.resolve(false); }
    var patch = {};
    ids.forEach(function (id) { if (rec[id]) patch[id] = { v: rec[id].v, at: rec[id].at }; });
    dirty = {};
    if (!Object.keys(patch).length) return Promise.resolve(false);
    return api("/api/settings", { method: "PUT", body: { patch: patch } }).then(function () {
      syncState.ok = true; syncState.at = now(); return true;
    }).catch(function (e) {
      syncState.ok = false;
      syncState.msg = e && e.status ? ("HTTP " + e.status) : "通信できない";
      /* 送れなかった鍵は次の機会にもう一度送る */
      Object.keys(patch).forEach(function (id) { dirty[id] = true; });
      return false;
    });
  }

  /* ── 起動 ───────────────────────────────────────────────────── */
  function applyOwnAll() {
    SPECS.forEach(function (s) {
      if (s.kind !== "own") return;
      var v = get(s.id);
      /* 起動のときは「選んだ合図」を出さない（通知音が勝手に鳴らないように） */
      if (typeof s.apply === "function") { try { s.apply(v, { boot: true }); } catch (e) {} }
    });
  }

  /* 昔からある設定は、アプリ本体が持ち主。
     手元の記録と本体の値がずれていたら「本体を外でいじった」とみなし、
     記録の方を今の時刻で更新する（＝この端末の変更が新しい）。 */
  function reconcileLegacy() {
    var s = appSettings();
    SPECS.forEach(function (sp) {
      if (sp.kind !== "legacy") return;
      var live = sp.lget(s);
      var mine = rec[sp.id];
      if (!mine) { rec[sp.id] = { v: live, at: now() }; dirty[sp.id] = true; return; }
      if (String(mine.v) !== String(live)) { rec[sp.id] = { v: live, at: now() }; dirty[sp.id] = true; }
    });
    saveRec();
  }

  function boot() {
    loadRec();
    applyOwnAll();
    paintRoots();
    /* 層は遅れて組み上がるので、しばらくは配り直す */
    [400, 1200, 2500, 5000].forEach(function (ms) { setTimeout(paintRoots, ms); });
    try {
      new MutationObserver(schedulePaint).observe(doc.body || de, { childList: true, subtree: false });
    } catch (e) {}
    /* 本体の設定が読み込まれるのを待ってから合流 */
    setTimeout(function () {
      reconcileLegacy();
      pull().then(function () { pushNow(); });
    }, 1500);
    root.addEventListener("online", function () { pull(); });
    /* ★ 声の 一覧を サーバから 取る（2026-08-26）。
       手元にも 同じ 控えを 持っているので、取れなくても 選択肢は 出る。
       届いたら **描き直す**（描き直さないと 5 つのままに 見える）。 */
    try {
      if (root.VQVOICE && root.VQVOICE["取りに行く"]) {
        root.addEventListener("vq-voices-updated", schedulePaint);
        setTimeout(function () { root.VQVOICE["取りに行く"](""); }, 800);
      }
    } catch (e) {}
    /* テーマ（ライト／ダーク）が変わったら、明暗で向きが変わる設定を当て直す。
       アクセントも「文字を濃くする」も、ダークでは別の色を置かないと沈む。 */
    function reapplyForTheme() {
      applyAccent(get("display.accent"));
      applyContrast(get("a11y.contrast") === true);
    }
    try {
      new MutationObserver(reapplyForTheme).observe(de, { attributes: true, attributeFilter: ["data-theme-mode"] });
    } catch (e) {}
    try {
      var mq = root.matchMedia && root.matchMedia("(prefers-color-scheme: dark)");
      if (mq && mq.addEventListener) mq.addEventListener("change", reapplyForTheme);
    } catch (e) {}
  }

  /* ── 外向きの口 ─────────────────────────────────────────────── */
  root.__vqSet = {
    get: get,
    set: set,
    reset: reset,
    resetGroup: resetGroup,
    defaultOf: defaultOf,
    spec: function (id) { return BY_ID[id]; },
    specs: function () { return SPECS.slice(); },
    groups: function () { return GROUPS.slice(); },
    inGroup: function (g) { return SPECS.filter(function (s) { return s.group === g; }); },
    on: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    sync: pull,
    flush: pushNow,
    syncLabel: syncLabel,
    paintRoots: paintRoots,
    click: bClick,
    appSettings: appSettings,
    /* 通知層など、他の層から見るための短い形 */
    is: function (id) { return get(id) !== false; }
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
