/* ══════════════════════════════════════════════════════════════════════════
   みんなで解く（ライブルーム）　画面側　2026-09-10
   訴え「他のユーザーとカフートのように、部屋（PINコード6桁 V から始まる）を
        作って、それを入力し、ユーザーのニックネームを設定したら始まる仕組みに。
        一番メインは、プリセットの画面。それぞれ回答が色別でリアルタイム上で
        共有され、その下にそれぞれユーザーのアイコンが表示される。
        ユーザーが回答共有を許可したら、アイコンが外れ、リアルタイムでの回答が
        表示される。正誤も。ランキングでポイントもある。」

   ★ 作りの 決まり（実測で 決まって いる）
     1. **U.mount で 別画面を 作らない。** それは ほかの V2 画面を 全部 畳むので、
        出題画面が 閉じる。参加者の 帯は `VQ2.quizNow.影` の 中へ 差し込む。
     2. 影の DOM に 外の CSS は 届かない。**style を 影へ 直接 入れる。**
        ただし `--vq-*` の トークンは 器ごしに 届く（それは 使ってよい）。
     3. 出題画面は 問題が 変わるたび 中身を 丸ごと 入れ替える。
        `vq:quiz:render` を 受けて **毎回 差し直す**。
     4. 正誤と 点は **サーバが 出す**。画面で 出すと いくらでも 言い張れる。

   ★ 名前は **vq-party**。`vq-live` は すでに Lumi の 音声会話が 使って いる
     （`js-src/vq-live.9628a32d29.js`・`window.__vqLive`）。同じ 名前に すると
     こちらの 入口が **黙って 何も しなく なる**（実測で 踏んだ:
     先に 読まれた ほうが `if (root.__vqLive) return;` で 止まる）。

   出す もの: window.__vqParty
     開く()        入口（作る / 入る を 選ぶ）
     作る(preset)  そのプリセットで 部屋を 作る
     入る(pin)     PIN から 入る
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var root = window, doc = document;
  if (root.__vqParty) return;

  var API = (function () {
    try { if (root.VQ2 && root.VQ2.apiBase) return root.VQ2.apiBase(); } catch (e) {}
    try { if (root.__vqApiBase) return root.__vqApiBase; } catch (e) {}
    return "";
  })();
  var K_ME = "vq.live.me.v1";      /* 入り直し用の 鍵 */

  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  var q = function (sel, r) { return (r || doc).querySelector(sel); };

  /* 人ごとの 色。**12 色。** 隣どうしが 似ない 順に 並べて ある。 */
  var COLORS = [
    "#E5484D", "#0090FF", "#30A46C", "#F76B15",
    "#8E4EC6", "#12A594", "#E93D82", "#FFB224",
    "#3E63DD", "#46A758", "#D6409F", "#5B5BD6"
  ];
  var 色 = function (i) { return COLORS[(Number(i) || 0) % COLORS.length]; };

  /* ══════════════════════════════════════════════════════════════════
     キャラクター（2026-09-10）
     訴え ①「キャラクターとかも あると いいかもね」
          ②「シンプルすぎる。作り込んで」③「もっと ボディも あるような」
          ④「動物・オリジナル・人間も」
          ⑤「まだ 安っぽい。顔の 表情や パーツ、色を 変えたり。
             もっと リアルに したい 質感を。アニメっぽく」

     ★ アニメ調に する ために 足した もの:
       ・**目**を 作り込む（白目 → 虹彩の ぼかし → ひとみ → ハイライト 2 つ
         → 上まぶたの 影 → まつ毛）。ここが いちばん 効く。
       ・**眉**。表情の 半分は 眉で 決まる。
       ・**肌・髪・瞳を 別々の 色**に する（服だけが その人の 色）。
       ・**陰影**（あごの下・体の わき・髪の つや）。
       ・輪郭は **外を 太く・中を 細く**。

     ★ 絵は 読み込まない。その場で 描く（1000 人ぶんの 画像は 回線が もたない）。
     ★ 何に なるかは サーバが 決めた 数 1 つから 割り出す（同じ 名前 → 同じ 姿）。
     ★ ぼかしの id は **1 枚ごとに 別**に する。同じ id を 使うと
       同じ 画面の ほかの 絵に 引きずられる。
     ══════════════════════════════════════════════════════════════════ */
  var 濃 = "#2A2233";                       /* 輪郭 */
  var 細 = "#4A3F55";                       /* 中の 線（細い） */

  /* ══ 肌の 色は **割り当てない**（2026-09-10・訴え）════════════════
     訴え「これ 黒人と 白人の 差別に なる。いまは グローバル化だから、
          これは あかんよ いくらなんでも」

     ★ **そのとおり。** 直前まで ニックネームの ハッシュから
       肌の 色を 5 段階で 割り当てて いた。
       本人が 選んで いないのに、名前から 人種的な 見た目を 機械が 決める、
       という 作りに なって いた。理由の ない 割り当ては しない。
     ★ ここは **中立の 1 色**（生きものの 絵の 地）に する。
       見分けは **すがた・髪の色・瞳・服・飾り**で 十分 付く。
     ★ 見た目を 選びたい 人は 自分で 選べる ように する（入る ときに 選ぶ）。 */
  var 肌 = ["#FBEBDA", "#F0D4BC"];
  var 髪色 = [
    ["#3B3247", "#241D2E"], ["#6B4A33", "#4A3122"], ["#C79B57", "#A47B3C"],
    ["#D9534F", "#A93B37"], ["#E88BB4", "#C96694"], ["#5B79D6", "#3B57AC"],
    ["#9A6BD6", "#7449B0"], ["#59A87A", "#3C8058"], ["#C9CBD6", "#A0A3B2"],
    ["#4FB0AE", "#31908E"], ["#E0873F", "#BB6725"], ["#F2EDE6", "#D5CCC0"]
  ];
  var 瞳色 = ["#4A7FD6", "#8B5BC4", "#3F9E7A", "#C25A4E", "#C08A2E",
              "#4AA8B8", "#B8558F", "#5C5F86", "#7A4E2E", "#2E7D8F"];

  /* ── みみ・つの・髪（後ろ）と しっぽ、まえ（前髪）── */
  var すがた = [
    { 名: "ねこ", 毛: 1,
      うしろ: "<path d='M22 22L27 -8l24 22z'/><path d='M78 22L73 -8 49 14z'/>",
      うえ: "<path d='M29 18L32 2l11 12z' fill='#F6B8C8' stroke='none' opacity='.9'/>"
        + "<path d='M71 18L68 2 57 14z' fill='#F6B8C8' stroke='none' opacity='.9'/>",
      しっぽ: "<path d='M70 108q26 4 22-16-2-10-11-8' fill='none' stroke-width='9'/>" },
    { 名: "くま", 毛: 1,
      うしろ: "<circle cx='24' cy='16' r='13'/><circle cx='76' cy='16' r='13'/>",
      うえ: "<circle cx='24' cy='16' r='6' fill='#F6B8C8' stroke='none' opacity='.85'/>"
        + "<circle cx='76' cy='16' r='6' fill='#F6B8C8' stroke='none' opacity='.85'/>",
      しっぽ: "<circle cx='74' cy='104' r='8'/>" },
    { 名: "うさぎ", 毛: 1,
      うしろ: "<ellipse cx='36' cy='-2' rx='8' ry='24'/><ellipse cx='64' cy='-2' rx='8' ry='24'/>",
      うえ: "<ellipse cx='36' cy='0' rx='3.6' ry='16' fill='#F6B8C8' stroke='none' opacity='.9'/>"
        + "<ellipse cx='64' cy='0' rx='3.6' ry='16' fill='#F6B8C8' stroke='none' opacity='.9'/>",
      しっぽ: "<circle cx='75' cy='104' r='9' fill='#fff'/>" },
    { 名: "きつね", 毛: 1,
      うしろ: "<path d='M16 24L24 -12l26 26z'/><path d='M84 24L76 -12 50 14z'/>",
      うえ: "<path d='M25 20L29 0l12 14z' fill='#F6B8C8' stroke='none' opacity='.9'/>"
        + "<path d='M75 20L71 0 59 14z' fill='#F6B8C8' stroke='none' opacity='.9'/>",
      しっぽ: "<path d='M70 110q28 0 24-20-3-12-14-8-10 4-10 14z'/>"
        + "<path d='M86 92q7 6 4 15' fill='#fff' stroke='none' opacity='.6'/>" },
    { 名: "とり", 毛: 1,
      うしろ: "<path d='M50 -14c9 0 12 10 9 16H41c-3-6 0-16 9-16z'/>",
      しっぽ: "<path d='M70 104l22 8-22 8z'/>" },
    { 名: "ロボ", 毛: 0,
      うしろ: "<rect x='46' y='-16' width='8' height='26' rx='4'/><circle cx='50' cy='-18' r='8'/>"
        + "<rect x='12' y='34' width='11' height='22' rx='5'/><rect x='77' y='34' width='11' height='22' rx='5'/>",
      しっぽ: "" },
    { 名: "おばけ", 毛: 0,
      うしろ: "<path d='M50 -8c20 0 30 14 30 32v10H20V24C20 6 30-8 50-8z'/>",
      しっぽ: "" },
    { 名: "ドラゴン", 毛: 1,
      うしろ: "<path d='M30 18L18-14l26 18z'/><path d='M70 18L82-14 56 4z'/>",
      しっぽ: "<path d='M68 108q26 2 24-16l10 6-2-16-12 8q-8-6-20 4z'/>" },
    { 名: "ぱんだ", 毛: 0,
      うしろ: "<circle cx='23' cy='16' r='13' fill='#2A2233'/><circle cx='77' cy='16' r='13' fill='#2A2233'/>",
      しっぽ: "<circle cx='74' cy='105' r='7' fill='#2A2233'/>" },
    { 名: "ひつじ", 毛: 1,
      うしろ: "<circle cx='26' cy='14' r='14'/><circle cx='50' cy='2' r='16'/><circle cx='74' cy='14' r='14'/>",
      しっぽ: "<circle cx='73' cy='104' r='8'/>" },
    /* ── 人間。髪は **後ろ・前・つや** の 3 枚 ── */
    { 名: "人間・ショート", 毛: 1,
      うしろ: "<path d='M50 0c-24 0-36 16-36 38v26h72V38C86 16 74 0 50 0z'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 4-12 12-18 22-16l6 10 6-10c10-2 18 4 22 16C83 18 71 4 50 4z'/>",
      つや: "<path d='M32 16q10-8 20-6' fill='none' stroke='#fff' stroke-width='3.4' opacity='.5' stroke-linecap='round'/>",
      しっぽ: "" },
    { 名: "人間・ツインテール", 毛: 1,
      うしろ: "<path d='M50 0c-24 0-36 16-36 38v22h72V38C86 16 74 0 50 0z'/>"
        + "<ellipse cx='9' cy='58' rx='12' ry='24'/><ellipse cx='91' cy='58' rx='12' ry='24'/>"
        + "<circle cx='11' cy='32' r='9'/><circle cx='89' cy='32' r='9'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 5-13 13-19 23-17l5 11 5-11c10-2 18 4 23 17C83 18 71 4 50 4z'/>",
      つや: "<path d='M34 14q9-7 18-5' fill='none' stroke='#fff' stroke-width='3.4' opacity='.5' stroke-linecap='round'/>",
      しっぽ: "" },
    { 名: "人間・おだんご", 毛: 1,
      うしろ: "<circle cx='50' cy='-10' r='15'/><path d='M50 0c-24 0-36 16-36 38v20h72V38C86 16 74 0 50 0z'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 11-8 20-13 34-13s23 5 34 13C83 18 71 4 50 4z'/>",
      つや: "<path d='M33 18q11-8 22-6' fill='none' stroke='#fff' stroke-width='3.4' opacity='.5' stroke-linecap='round'/>",
      しっぽ: "" },
    /* ── オリジナル ── */
    { 名: "スライム", 毛: 0,
      うしろ: "<path d='M50 -6c-4 10-10 12-10 18h20c0-6-6-8-10-18z'/>"
        + "<path d='M14 66q0-30 36-30t36 30q0 8-8 8H22q-8 0-8-8z' opacity='.5'/>",
      しっぽ: "<path d='M22 108q28 10 56 0v8q-28 10-56 0z' opacity='.55'/>" },
    { 名: "ほしのこ", 毛: 0,
      うしろ: "<path d='M50 -24l7.6 15.4 17 2.5-12.3 12 2.9 16.9L50 34.8 34.8 42.8l2.9-16.9-12.3-12 17-2.5z'/>",
      しっぽ: "<path d='M74 100l4 8 9 1.3-6.5 6.3 1.5 8.9-8-4.2-8 4.2 1.5-8.9-6.5-6.3 9-1.3z'/>" },
    { 名: "きのこ", 毛: 0,
      うしろ: "<path d='M50 -8c-24 0-38 16-38 30 0 6 6 8 38 8s38-2 38-8c0-14-14-30-38-30z'/>",
      うえ: "<circle cx='30' cy='14' r='6' fill='#fff' stroke='none' opacity='.8'/>"
        + "<circle cx='62' cy='8' r='7' fill='#fff' stroke='none' opacity='.8'/>"
        + "<circle cx='74' cy='22' r='4.5' fill='#fff' stroke='none' opacity='.8'/>",
      しっぽ: "" }
  ];

  /* ── 服 ── */
  var 服 = [
    function () { return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>"; },
    function () { return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>"
      + "<path d='M36 70q14 14 28 0' fill='none' stroke='" + 細 + "' stroke-width='2.4'/>"
      + "<rect x='40' y='92' width='20' height='12' rx='4' fill='rgba(0,0,0,.16)' stroke='none'/>"; },
    function () { return "<path d='M50 68c-11 0-16 6-16 14l-8 26c-1 6 6 8 24 8s25-2 24-8l-8-26c0-8-5-14-16-14z'/>"
      + "<path d='M32 96h36' fill='none' stroke='rgba(255,255,255,.45)' stroke-width='3'/>"; },
    function () { return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>"
      + "<path d='M31 84h38M31 96h38' fill='none' stroke='rgba(255,255,255,.5)' stroke-width='6'/>"; },
    function (c, sk) { return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z' fill='" + sk + "'/>"
      + "<path d='M34 84h32v22c0 6-4 10-16 10s-16-4-16-10z'/>"
      + "<path d='M38 84V72M62 84V72' fill='none' stroke-width='4'/>"; },
    function () { return "<path d='M50 66c-18 0-28 12-30 30l-4 22h68l-4-22c-2-18-12-30-30-30z' opacity='.85'/>"
      + "<path d='M50 68c-12 0-18 8-18 20v18c0 6 4 10 18 10s18-4 18-10V88c0-12-6-20-18-20z'/>"; }
  ];

  /* ── うで（太い 輪郭 の 上に 細い 肌）── */
  function 腕(d, sk) {
    return "<path d='" + d + "' fill='none' stroke='" + 濃 + "' stroke-width='13' stroke-linecap='round'/>"
      + "<path d='" + d + "' fill='none' stroke='" + sk + "' stroke-width='8' stroke-linecap='round'/>";
  }
  function 手(x, y, r0, sk) {
    return "<circle cx='" + x + "' cy='" + y + "' r='" + r0 + "' fill='" + sk
      + "' stroke='" + 濃 + "' stroke-width='2.6'/>";
  }
  var うで = [
    function (sk) { return 腕("M31 84q-8 6-7 18", sk) + 腕("M69 84q8 6 7 18", sk) + 手(24, 104, 6.5, sk) + 手(76, 104, 6.5, sk); },
    function (sk) { return 腕("M31 84q-10 2-12-14", sk) + 腕("M69 84q8 6 7 18", sk) + 手(19, 68, 7, sk) + 手(76, 104, 6.5, sk); },
    function (sk) { return 腕("M31 84q-12 4-6 16 4 5 10 3", sk) + 腕("M69 84q12 4 6 16-4 5-10 3", sk); }
  ];
  /* ★ 足は **くつ**として 描く（2026-09-10 実測）。
     塗りを 決めずに 楕円を 置いて いたので、黒い かたまりが
     ぷかぷか 浮いて 見えて いた。 */
  function あし(sk, c) {
    return "<rect x='36' y='104' width='11' height='16' rx='5.5' fill='" + sk + "' stroke='" + 濃 + "' stroke-width='2.6'/>"
      + "<rect x='53' y='104' width='11' height='16' rx='5.5' fill='" + sk + "' stroke='" + 濃 + "' stroke-width='2.6'/>"
      + "<path d='M32 118h13v5q0 4-4 4h-9q-3 0-3-3z' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6' stroke-linejoin='round'/>"
      + "<path d='M68 118H55v5q0 4 4 4h9q3 0 3-3z' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6' stroke-linejoin='round'/>"
      + "<path d='M32 122h13M68 122H55' fill='none' stroke='rgba(255,255,255,.45)' stroke-width='2'/>";
  }

  /* ══ 目。**ここが アニメらしさの 芯**。7 つの 部品で できて いる。 ══ */
  var 目形 = [
    { 名: "まる",   rx: 8.6, ry: 10.6, ふた: 0.30, まつ: 1 },
    { 名: "たれ",   rx: 8.8, ry: 9.6,  ふた: 0.34, まつ: 1, かたむき: 8 },
    { 名: "つり",   rx: 8.4, ry: 9.4,  ふた: 0.34, まつ: 1, かたむき: -8 },
    { 名: "おおきい", rx: 9.8, ry: 12.2, ふた: 0.26, まつ: 1 },
    { 名: "ほそ",   rx: 8.6, ry: 7.4,  ふた: 0.42, まつ: 0 },
    { 名: "きらきら", rx: 9.4, ry: 11.4, ふた: 0.24, まつ: 1, ほし: 1 }
  ];
  function 片目(x, y, g, ir, id, 左) {
    var k = g.かたむき ? (" transform='rotate(" + (左 ? g.かたむき : -g.かたむき) + " " + x + " " + y + ")'") : "";
    var 上 = y - g.ry + g.ry * g.ふた * 2;
    return "<g" + k + ">"
      /* 白目 */
      + "<ellipse cx='" + x + "' cy='" + y + "' rx='" + g.rx + "' ry='" + g.ry + "' fill='#FFFDF9'/>"
      /* 虹彩（上が 濃く 下が 明るい ぼかし） */
      + "<clipPath id='" + id + "'><ellipse cx='" + x + "' cy='" + y + "' rx='" + g.rx + "' ry='" + g.ry + "'/></clipPath>"
      + "<g clip-path='url(#" + id + ")'>"
      + "<circle cx='" + x + "' cy='" + (y + 0.6) + "' r='" + (g.rx * 0.82) + "' fill='url(#" + id + "i)'/>"
      + "<circle cx='" + x + "' cy='" + (y + 1.4) + "' r='" + (g.rx * 0.42) + "' fill='#1B1424'/>"
      /* まぶたの 影 */
      + "<ellipse cx='" + x + "' cy='" + (上 - g.ry * 0.9) + "' rx='" + (g.rx * 1.1) + "' ry='" + (g.ry * 0.7)
      + "' fill='rgba(20,12,30,.28)'/>"
      + "</g>"
      /* ハイライト 2 つ */
      + "<ellipse cx='" + (x - g.rx * 0.32) + "' cy='" + (y - g.ry * 0.36) + "' rx='" + (g.rx * 0.26)
      + "' ry='" + (g.ry * 0.22) + "' fill='#fff' transform='rotate(-20 " + x + " " + y + ")'/>"
      + "<circle cx='" + (x + g.rx * 0.34) + "' cy='" + (y + g.ry * 0.3) + "' r='" + (g.rx * 0.13) + "' fill='rgba(255,255,255,.85)'/>"
      + (g.ほし ? "<path d='M" + (x + g.rx * 0.3) + " " + (y - g.ry * 0.5)
          + "l1.6 3.2 3.5.5-2.6 2.5.6 3.5-3.1-1.7-3.1 1.7.6-3.5-2.6-2.5 3.5-.5z' fill='#fff' opacity='.9'/>" : "")
      /* 外の 線と まつ毛 */
      + "<ellipse cx='" + x + "' cy='" + y + "' rx='" + g.rx + "' ry='" + g.ry
      + "' fill='none' stroke='" + 濃 + "' stroke-width='2.2'/>"
      + "<path d='M" + (x - g.rx) + " " + (y - g.ry * 0.5) + "q" + g.rx + " " + (-g.ry * 0.8) + " "
      + (g.rx * 2) + " 0' fill='none' stroke='" + 濃 + "' stroke-width='3.4' stroke-linecap='round'/>"
      + (g.まつ ? "<path d='M" + (x + g.rx * 0.95) + " " + (y - g.ry * 0.62) + "l4.5-3.4' fill='none' stroke='"
          + 濃 + "' stroke-width='2.6' stroke-linecap='round'/>" : "")
      + "</g>";
  }

  /* ── 眉（表情の 半分は ここ）── */
  var 眉 = [
    "M31 30q6-4 12-1M57 29q6-3 12 1",          /* ふつう */
    "M31 32q6-6 12-2M57 30q6-4 12 2",          /* 上がり */
    "M31 28q6 2 12 3M57 31q6-1 12-3",          /* 下がり */
    "M32 29h11M57 29h11",                      /* まっすぐ */
    "M31 33q6-8 12-1M57 32q6-7 12 1"           /* おこり */
  ];

  /* ── 口（小さく・アニメ調）── */
  var 口 = [
    "<path d='M45 60q5 6 10 0' fill='none' stroke-width='2.8'/>",
    "<path d='M45 62q5-6 10 0' fill='none' stroke-width='2.8'/>",
    "<ellipse cx='50' cy='61' rx='3.4' ry='4.4' fill='#8E3B4E' stroke='none'/>"
      + "<ellipse cx='50' cy='62.6' rx='2.2' ry='2.4' fill='#D2596B' stroke='none'/>",
    "<path d='M44 59q6 8 12 0' fill='none' stroke-width='2.8'/>"
      + "<path d='M45.4 60.4q4.6 5 9.2 0z' fill='#C4576A' stroke='none'/>",
    "<path d='M46 60h8' fill='none' stroke-width='2.8'/>",
    "<path d='M44 59q3 4 6 0q3 4 6 0' fill='none' stroke-width='2.6'/>",
    "<path d='M45 59q5 6 10 0' fill='none' stroke-width='2.8'/>"
      + "<path d='M49 63q3 5 6 1z' fill='#E5697E' stroke='none'/>"
  ];

  /* ── 飾り ── */
  var 飾り = [
    function () { return ""; },
    function (c) { return "<path d='M50 -22L70 10H30z' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.8'/>"
      + "<circle cx='50' cy='-22' r='5' fill='#fff' stroke='" + 濃 + "' stroke-width='2.6'/>"; },
    function () { return "<g transform='translate(74,12)'><path d='M0 0L-13-8v16z' fill='#E93D82' stroke='" + 濃 + "' stroke-width='2.4'/>"
      + "<path d='M0 0l13-8v16z' fill='#E93D82' stroke='" + 濃 + "' stroke-width='2.4'/>"
      + "<circle cx='0' cy='0' r='4' fill='#fff' stroke='" + 濃 + "' stroke-width='2.4'/></g>"; },
    function () { return "<g fill='none' stroke='" + 濃 + "' stroke-width='2.4'>"
      + "<rect x='26' y='36' width='22' height='18' rx='6'/><rect x='52' y='36' width='22' height='18' rx='6'/>"
      + "<path d='M48 44h4M24 40l-6-3M76 40l6-3'/></g>"
      + "<rect x='26' y='36' width='22' height='18' rx='6' fill='rgba(255,255,255,.22)' stroke='none'/>"
      + "<rect x='52' y='36' width='22' height='18' rx='6' fill='rgba(255,255,255,.22)' stroke='none'/>"; },
    function (c) { return "<path d='M20 40a30 30 0 0 1 60 0' fill='none' stroke='" + 濃 + "' stroke-width='6'/>"
      + "<rect x='11' y='36' width='15' height='22' rx='7' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6'/>"
      + "<rect x='74' y='36' width='15' height='22' rx='7' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6'/>"; },
    function () { return "<path d='M30 12l6-18 8 11 6-15 6 15 8-11 6 18z' fill='url(#kin)' stroke='" + 濃 + "' stroke-width='2.6'/>"
      + "<circle cx='50' cy='-12' r='3.4' fill='#E93D82'/>"; },
    function (c) { return "<path d='M30 66q20 10 40 0v9q-20 10-40 0z' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6'/>"
      + "<path d='M62 74l7 20 9-4-7-18z' fill='" + c + "' stroke='" + 濃 + "' stroke-width='2.6'/>"; },
    function () { return "<g transform='translate(76,14)'>"
      + "<circle cx='0' cy='-7' r='5' fill='#E93D82'/><circle cx='6.6' cy='-2.2' r='5' fill='#E93D82'/>"
      + "<circle cx='4.1' cy='5.7' r='5' fill='#E93D82'/><circle cx='-4.1' cy='5.7' r='5' fill='#E93D82'/>"
      + "<circle cx='-6.6' cy='-2.2' r='5' fill='#E93D82'/><circle cx='0' cy='0' r='3.6' fill='#FFD36B'/></g>"; },
    function () { return "<path d='M28 78q-20-14-22 4 12 6 22 2z' fill='#fff' opacity='.92' stroke='" + 濃 + "' stroke-width='2.4'/>"
      + "<path d='M72 78q20-14 22 4-12 6-22 2z' fill='#fff' opacity='.92' stroke='" + 濃 + "' stroke-width='2.4'/>"; }
  ];

  var 顔連番 = 0;

  /* o.顔だけ = true で **頭だけ**（帯や 順位の 小さな 丸 用）。
     全身の まま 30px の 丸に 入れると 豆粒に なって 誰か 分からない。 */
  function 顔(face, c, o) {
    o = o || {};
    var n = Math.max(0, Number(face) || 0);
    /* ★ ぼかしの id は 1 枚ごとに 別に する（同じ id だと 引きずられる）。 */
    var u = "vqc" + (顔連番++);
    var sg = すがた[n % すがた.length];
    var fk = 服[Math.floor(n / 16) % 服.length];
    var ud = うで[Math.floor(n / 96) % うで.length];
    var eg = 目形[Math.floor(n / 288) % 目形.length];
    var mu = 眉[Math.floor(n / 1728) % 眉.length];
    var kt = 口[Math.floor(n / 8640) % 口.length];
    var kz = 飾り[Math.floor(n / 60480) % 飾り.length];
    var sk = 肌;
    var hr = 髪色[Math.floor(n / 7) % 髪色.length];
    var ir = 瞳色[Math.floor(n / 11) % 瞳色.length];
    var ho = Math.floor(n / 13) % 2;
    var 毛 = sg.毛 ? hr[0] : c;
    var 毛暗 = sg.毛 ? hr[1] : c;

    var 塗毛 = " fill='url(#" + u + "h)' stroke='" + 濃 + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'";
    var 塗服 = " fill='url(#" + u + "b)' stroke='" + 濃 + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'";

    var 枠 = o.顔だけ ? "8 -34 84 92" : "-10 -36 120 176";
    return "<svg viewBox='" + 枠 + "' class='vqlf' aria-hidden='true'>"
      + "<defs>"
      + "<linearGradient id='" + u + "h' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='" + 毛 + "'/><stop offset='1' stop-color='" + 毛暗 + "'/></linearGradient>"
      + "<linearGradient id='" + u + "b' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='" + c + "'/><stop offset='1' stop-color='" + c + "' stop-opacity='.72'/></linearGradient>"
      + "<linearGradient id='" + u + "s' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='" + sk[0] + "'/><stop offset='1' stop-color='" + sk[1] + "'/></linearGradient>"
      + "<radialGradient id='" + u + "Li' cx='.5' cy='.72' r='.62'>"
      + "<stop offset='0' stop-color='" + ir + "' stop-opacity='.35'/><stop offset='1' stop-color='" + ir + "'/></radialGradient>"
      + "<radialGradient id='" + u + "Ri' cx='.5' cy='.72' r='.62'>"
      + "<stop offset='0' stop-color='" + ir + "' stop-opacity='.35'/><stop offset='1' stop-color='" + ir + "'/></radialGradient>"
      + "<linearGradient id='kin' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='#FFD980'/><stop offset='1' stop-color='#D99A16'/></linearGradient>"
      + "</defs>"
      /* 後ろ（しっぽ・耳・髪） */
      + "<g" + 塗毛 + ">" + sg.しっぽ + "</g>"
      + あし(sk[0], c)
      + "<g" + 塗服 + ">" + fk(c, sk[0]) + "</g>"
      /* 体の わきの 影 */
      + "<path d='M32 88q4 14 2 24' fill='none' stroke='rgba(20,12,30,.16)' stroke-width='5'/>"
      + ud(sk[0])
      + "<g" + 塗毛 + ">" + sg.うしろ + "</g>"
      + (sg.うえ ? "<g>" + sg.うえ + "</g>" : "")
      /* 顔 */
      + "<ellipse cx='50' cy='42' rx='28' ry='29.5' fill='url(#" + u + "s)' stroke='" + 濃 + "' stroke-width='3'/>"
      /* あごの下の 影 */
      + "<path d='M28 52q22 26 44 0' fill='none' stroke='rgba(20,12,30,.10)' stroke-width='7'/>"
      /* 前髪 */
      + (sg.まえ ? "<g" + 塗毛 + ">" + sg.まえ + "</g>" + (sg.つや || "") : "")
      /* ほお */
      + (ho ? "<ellipse cx='28' cy='52' rx='6.5' ry='4' fill='#F0808F' opacity='.45'/>"
            + "<ellipse cx='72' cy='52' rx='6.5' ry='4' fill='#F0808F' opacity='.45'/>" : "")
      /* 眉 */
      + "<path d='" + mu + "' fill='none' stroke='" + (sg.毛 ? 毛暗 : 濃) + "' stroke-width='3' stroke-linecap='round'/>"
      /* 目 */
      + 片目(36, 45, eg, ir, u + "L", true)
      + 片目(64, 45, eg, ir, u + "R", false)
      /* 鼻 */
      + "<path d='M50 54q1.6 1.6 0 3' fill='none' stroke='rgba(60,40,50,.45)' stroke-width='1.8' stroke-linecap='round'/>"
      /* 口 */
      + "<g fill='none' stroke='" + 濃 + "' stroke-linecap='round'>" + kt + "</g>"
      + kz(c)
      + "</svg>";
  }

  /* ══ QR（2026-09-10・訴え「参加者は どこから 参加すんのよ」）════════
     ★ **自作を やめた。** 自分で 組んだ 符号化は 441 ます 中 100 ます 違い、
       読み取り器に 通らなかった（実測）。**読めない QR は 出さない。**
       実績の ある もの（qrcode）を **束ねて 持つ**（外から 読み込まない）。
       入口の 読み込みには 足さず、**必要に なった ときだけ**取りに 行く。
     ★ 読めるかは 検査で 毎回 測る（vqparty の「QR が 本当に 読める」）。 */
  var QRけた = null;
  function QRを描く(text) {
    if (!root.__vqQR) return "";
    try { return root.__vqQR(text, 4); } catch (e) { return ""; }
  }
  function QRを用意(cb) {
    if (root.__vqQR) { cb(true); return; }
    if (QRけた === "だめ") { cb(false); return; }
    var el = doc.createElement("script");
    el.src = (root.__vqQRSrc || "/js/vq-qr.826430d916.js");
    el.onload = function () { cb(!!root.__vqQR); };
    el.onerror = function () { QRけた = "だめ"; cb(false); };
    doc.head.appendChild(el);
  }

  /* ══ 通信 ══════════════════════════════════════════════════════════ */
  /* ★ 札の 置き場は **app.auth.token.v1**（2026-09-10・訴え
     「ログインして いるのに 部屋を 作れない」）。
     `VQ2.auth` は **存在しない**し、`wordPractice400.auth.token` も 違う。
     DM（vq-dm.js:38）と 通話（vq-call.js:27）が 使って いる 鍵に そろえる。
     ★ 検査が 自分で 偽の 鍵を 置いて いたので、間違ったまま 通って いた。 */
  var TOKEN_KEY = "app.auth.token.v1";
  function 札() {
    try { return String(root.localStorage.getItem(TOKEN_KEY) || "").trim(); } catch (e) { return ""; }
  }
  function 頼む(path, o) {
    o = o || {};
    var h = { "Content-Type": "application/json" };
    try {
      var t = 札();
      if (t) h.Authorization = "Bearer " + t;
    } catch (e) {}
    return root.fetch(API + path, {
      method: o.method || "GET", headers: h,
      body: o.body ? JSON.stringify(o.body) : undefined
    }).then(function (r) { return r.json(); });
  }

  /* ══ 部屋との つなぎ ══════════════════════════════════════════════
     ★ 切れたら **自分で 戻る**。教室の Wi-Fi は よく 切れる。 */
  function つなぐ(pin, key, 受ける) {
    var ws = null, 死 = false, 待ち = 500, 再 = null;
    function 開く() {
      if (死) return;
      var u = (API || location.origin).replace(/^http/, "ws") + "/ws/live/" + pin + "?k=" + encodeURIComponent(key);
      try { ws = new WebSocket(u); } catch (e) { 戻す(); return; }
      ws.onopen = function () { 待ち = 500; 受ける({ t: "_open" }); };
      ws.onmessage = function (e) {
        var m = null;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        受ける(m);
      };
      ws.onclose = function () { 受ける({ t: "_close" }); 戻す(); };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }
    function 戻す() {
      if (死) return;
      try { if (再) clearTimeout(再); } catch (e) {}
      再 = setTimeout(開く, 待ち);
      待ち = Math.min(8000, Math.round(待ち * 1.7));
    }
    開く();
    return {
      送る: function (m) { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch (e) {} },
      閉じる: function () { 死 = true; try { if (再) clearTimeout(再); } catch (e) {} try { ws && ws.close(); } catch (e) {} }
    };
  }

  /* ══ 見た目 ══════════════════════════════════════════════════════ */
  var CSS = [
    ".vql{position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;",
      "background:rgba(20,16,40,.62);backdrop-filter:blur(6px);font-family:inherit;}",
    ".vql-card{width:min(520px,92vw);max-height:88vh;overflow:auto;background:var(--vq-surface,#fff);",
      "color:var(--vq-text,#2B2836);border-radius:22px;padding:26px 24px 22px;box-shadow:0 24px 70px rgba(20,10,50,.36);}",
    ".vql-h{font-size:20px;font-weight:800;margin:0 0 4px;}",
    ".vql-sub{font-size:13.5px;color:var(--vq-text-secondary,#7A7589);margin:0 0 18px;line-height:1.7;}",
    ".vql-row{display:flex;gap:10px;flex-wrap:wrap;}",
    ".vql-b{flex:1 1 180px;min-height:96px;border-radius:16px;border:1px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-surface,#fff);cursor:pointer;font:inherit;color:inherit;padding:14px;text-align:left;",
      "display:flex;flex-direction:column;gap:5px;transition:transform .12s,box-shadow .12s;}",
    ".vql-b:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(80,60,140,.16);}",
    ".vql-b b{font-size:15px;}",
    ".vql-b span{font-size:12.5px;color:var(--vq-text-secondary,#7A7589);line-height:1.6;}",
    /* ══ PIN は **1 文字ずつ マス**（2026-09-10・訴え「もっと 良い デザインに」）
       1 本の 入力欄だと 何文字 入れたか 分からず、打ち間違いに 気づけない。
       ★ 打つ ところは **見えない 入力欄 1 つ**（入力の 仕組みは 1 本のまま）。
         マスは その 上に 描くだけ。こう しないと 変換や 貼り付けが 壊れる。 */
    ".vql-pinbox{position:relative;margin:6px 0 4px;}",
    ".vql-pin{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;",
      "font-size:16px;font-family:inherit;color:transparent;background:transparent;caret-color:transparent;",
      "letter-spacing:2.2em;text-indent:1.1em;cursor:pointer;}",
    ".vql-cells{display:flex;gap:7px;justify-content:center;pointer-events:none;}",
    ".vql-cell{flex:1 1 0;max-width:56px;aspect-ratio:3/4;border-radius:12px;",
      "border:2px solid var(--vq-border,#DED8EE);background:var(--vq-bg,#FCFBFE);",
      "display:flex;align-items:center;justify-content:center;",
      "font-size:26px;font-weight:800;transition:border-color .14s,transform .14s;}",
    ".vql-cell.is-fix{background:var(--vq-accent,#756DB3);border-color:transparent;color:#fff;}",
    ".vql-cell.is-on{border-color:var(--vq-accent,#756DB3);transform:translateY(-2px);}",
    ".vql-cell.is-now{border-color:var(--vq-accent,#756DB3);}",
    ".vql-cell.is-now::after{content:'';width:2px;height:26px;background:var(--vq-accent,#756DB3);",
      "border-radius:2px;animation:vqlblink 1s steps(1) infinite;}",
    "@keyframes vqlblink{50%{opacity:0}}",
    ".vql-hint{text-align:center;font-size:12px;color:var(--vq-text-secondary,#7A7589);margin:8px 0 0;}",
    ".vql-in{width:100%;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-bg,#FCFBFE);color:inherit;font-family:inherit;}",
    ".vql-go{width:100%;height:52px;margin-top:14px;border:0;border-radius:14px;cursor:pointer;",
      "background:var(--vq-accent,#756DB3);color:#fff;font-size:16px;font-weight:750;font-family:inherit;}",
    ".vql-go[disabled]{opacity:.45;cursor:default;}",
    ".vql-x{position:absolute;right:18px;top:14px;width:38px;height:38px;border:0;border-radius:999px;",
      "background:rgba(255,255,255,.14);color:#fff;font-size:20px;cursor:pointer;}",
    ".vql-err{margin-top:10px;font-size:13px;color:var(--vq-danger,#C62A2F);min-height:18px;}",
    ".vql-code{font-size:44px;font-weight:800;letter-spacing:.2em;text-align:center;margin:10px 0 6px;",
      "font-variant-numeric:tabular-nums;}",
    ".vql-people{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;}",
    ".vql-p{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 4px;border-radius:999px;",
      "background:var(--vq-surface-sunken,#F6F4FB);font-size:13px;font-weight:650;}",
    ".vql-av{width:26px;height:26px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;",
      "color:#fff;font-size:11px;font-weight:800;}"
  ].join("");

  /* ══ 待機画面（Discord の 通話画面のような タイル）══════════════ */
  var 待CSS = [
    /*
       タイルを 敷きつめ、**裏に その人の アイコンを ぼかして 置く**。
       ★ 覆いの 中の 小さな 箱では なく **全画面**に する（1000 人 並ぶ）。 */
    ".vqw{position:fixed;inset:0;z-index:2147483600;background:var(--vq-bg,#0f0d18);",
      "color:var(--vq-text,#2B2836);display:flex;flex-direction:column;font-family:inherit;}",
    ".vqw-h{flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:14px 20px;}",
    ".vqw-pin{font-size:clamp(26px,4vw,44px);font-weight:800;letter-spacing:.18em;",
      "font-variant-numeric:tabular-nums;}",
    ".vqw-lab{font-size:12px;font-weight:700;color:var(--vq-text-secondary,#7A7589);}",
    ".vqw-n{margin-left:auto;font-size:15px;font-weight:750;}",
    /* ★ **参加の しかた**（2026-09-10・訴え「参加者は どこから 参加すんのよ」）。
       PIN を 出すだけでは 入れない。**どこを 開くか**を 並べて 出す。 */
    ".vqw-how{flex:0 0 auto;display:flex;gap:16px;align-items:center;padding:0 20px 12px;flex-wrap:wrap;}",
    ".vqw-qr{width:132px;height:132px;flex:0 0 auto;border-radius:12px;overflow:hidden;background:#fff;padding:6px;}",
    ".vqw-qr svg{width:100%;height:100%;display:block;}",
    ".vqw-way{font-size:13.5px;line-height:1.9;}",
    ".vqw-url{display:inline-flex;align-items:center;gap:8px;margin-top:4px;}",
    ".vqw-url b{font-size:17px;font-weight:800;letter-spacing:.02em;}",
    ".vqw-copy{border:1px solid var(--vq-border,#DED8EE);background:var(--vq-surface,#fff);color:inherit;",
      "border-radius:8px;height:30px;padding:0 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;}",
    ".vqw-grid{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 16px 20px;",
      "display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));align-content:start;}",
    ".vqw-t{position:relative;aspect-ratio:1/1;border-radius:14px;overflow:hidden;",
      "background:var(--vq-surface-sunken,#1a1728);display:flex;align-items:center;justify-content:center;}",
    /* ★ 裏の ボカシ。**同じ 絵を 大きく 引き伸ばして ぼかす**（Discord と 同じ 作り）。 */
    ".vqw-bg{position:absolute;inset:-26%;filter:blur(24px) saturate(1.6);opacity:.5;",
      "display:flex;align-items:center;justify-content:center;}",
    ".vqw-bg .vqlf{width:100%;height:100%;}",
    /* ★ 立ち姿を **大きく**（2026-09-10 実測）。丸に 押し込めると
       全身が 豆粒に なって 誰か 分からない。 */
    ".vqw-av{position:relative;z-index:2;height:96%;aspect-ratio:120/176;",
      "display:flex;align-items:flex-end;justify-content:center;overflow:visible;",
      "filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));}",
    ".vqw-av .vqlf{width:100%;height:100%;display:block;}",
    ".vqw-name{position:absolute;left:8px;bottom:8px;z-index:3;max-width:calc(100% - 16px);",
      "padding:3px 9px;border-radius:8px;background:rgba(10,8,20,.7);color:#fff;",
      "font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqw-badge{position:absolute;right:8px;top:8px;z-index:3;height:20px;padding:0 8px;border-radius:999px;",
      "background:rgba(10,8,20,.62);color:#fff;font-size:10.5px;font-weight:750;",
      "display:inline-flex;align-items:center;}",
    ".vqw-t.is-host{outline:2px solid var(--vq-accent,#756DB3);outline-offset:-2px;}",
    ".vqw-t.is-off{opacity:.6;filter:saturate(.5);}",
    ".vqw-more{display:flex;align-items:center;justify-content:center;border-radius:14px;",
      "background:var(--vq-surface-sunken,#1a1728);aspect-ratio:1/1;font-size:14px;font-weight:750;",
      "color:var(--vq-text-secondary,#7A7589);text-align:center;padding:10px;}",
    ".vqw-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:12px;",
      "padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));}",
    ".vqw-go{height:54px;min-width:220px;border:0;border-radius:999px;cursor:pointer;font-family:inherit;",
      "background:var(--vq-accent,#756DB3);color:#fff;font-size:17px;font-weight:800;}",
    ".vqw-go[disabled]{opacity:.4;cursor:default;}",
    ".vqw-x{height:54px;width:54px;border:0;border-radius:999px;cursor:pointer;",
      "background:var(--vq-surface-sunken,#1a1728);color:var(--vq-text-secondary,#7A7589);font-size:15px;}",
    ".vqw-wait{text-align:center;font-size:14px;color:var(--vq-text-secondary,#7A7589);}",
  ].join("");

  /* 覆いを 1 枚 出す（入口・ロビー・結果 用）。
     ★ ここは 出題画面が 開く 前 なので 覆いで よい。 */
  function 覆い(html) {
    var old = q("#vqPartyOverlay");
    if (old) old.remove();
    var host = doc.createElement("div");
    host.id = "vqPartyOverlay";
    var sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = "<style>" + CSS + "</style><div class='vql'><div class='vql-card'>" + html + "</div></div>";
    doc.body.appendChild(host);
    return {
      影: sh, 器: host,
      閉じる: function () { try { host.remove(); } catch (e) {} },
      書く: function (h) { sh.querySelector(".vql-card").innerHTML = h; }
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     参加者の 帯（**出題画面の 影の DOM の 中**へ 差し込む）
     ══════════════════════════════════════════════════════════════════ */
  var 帯CSS = [
    ".vqlb{position:absolute;left:0;right:0;bottom:0;z-index:40;padding:8px 10px 10px;",
      "background:linear-gradient(0deg,var(--vq-surface,#fff) 78%,rgba(0,0,0,0));",
      "border-top:1px solid var(--vq-border-subtle,#ECEAF4);}",
    ".vqlb-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11.5px;",
      "color:var(--vq-text-secondary,#7A7589);font-weight:650;}",
    ".vqlb-pin{font-weight:800;letter-spacing:.12em;color:var(--vq-accent-text,#5F579E);}",
    ".vqlb-list{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch;}",
    ".vqlb-i{flex:0 0 auto;min-width:52px;max-width:150px;border-radius:12px;padding:5px 8px;",
      "background:var(--vq-surface-sunken,#F6F4FB);display:flex;flex-direction:column;align-items:center;gap:3px;",
      "border:2px solid transparent;transition:border-color .15s;}",
    ".vqlb-i.is-ok{border-color:#30A46C;}",
    ".vqlb-i.is-ng{border-color:#E5484D;}",
    ".vqlb-i.is-done{background:var(--vq-accent-subtle,#F2EEFB);}",
    ".vqlb-i.is-off{opacity:.4;}",
    ".vqlb-av{width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;",
      "color:#fff;font-size:12px;font-weight:800;flex:0 0 auto;overflow:hidden;}",
    ".vqlb-av .vqlf{width:100%;height:100%;display:block;}",
    ".vqlb-n{font-size:10.5px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqlb-a{font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;color:#fff;max-width:100%;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqlb-s{font-size:10px;color:var(--vq-text-secondary,#7A7589);font-variant-numeric:tabular-nums;}",
    /* 選択肢の 上に 打つ 人の 点 */
    ".vqld{position:absolute;right:6px;top:6px;display:flex;gap:3px;flex-wrap:wrap;max-width:60%;",
      "justify-content:flex-end;pointer-events:none;z-index:6;}",
    ".vqld i{width:11px;height:11px;border-radius:999px;display:block;box-shadow:0 0 0 2px var(--vq-surface,#fff);}",
    /* 参加者が 押す「見せる」 */
    ".vqlb-share{margin-left:auto;border:1px solid var(--vq-border,#DED8EE);background:var(--vq-surface,#fff);",
      "border-radius:999px;height:26px;padding:0 11px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;",
      "color:var(--vq-text-secondary,#7A7589);}",
    ".vqlb-share.is-on{background:var(--vq-accent,#756DB3);color:#fff;border-color:transparent;}",
    ".vqlb-host{margin-left:6px;border:0;border-radius:999px;height:26px;padding:0 13px;font:inherit;font-size:11.5px;",
      "font-weight:750;cursor:pointer;background:var(--vq-accent,#756DB3);color:#fff;}"
  ].join("");

  /* ══════════════════════════════════════════════════════════════════
     本体
     ══════════════════════════════════════════════════════════════════ */
  var 場 = null;   /* いまの 部屋 */

  function 状態() {
    return 場;
  }

  /* ── 入口 ───────────────────────────────────────────────────── */
  function 開く(o) {
    o = o || {};
    var ov = 覆い(
      "<h2 class='vql-h'>みんなで解く</h2>"
      + "<p class='vql-sub'>同じ 問題を みんなで 同時に 解きます。"
      + "部屋を 作ると <b>6 文字の PIN</b> が 出ます。参加する 人は それを 入れるだけ —— "
      + "<b>ログインは 要りません</b>。</p>"
      + "<div class='vql-row'>"
      + "<button class='vql-b' data-go='make'><b>部屋を 作る</b><span>自分の プリセットで 出題します。PIN が 出ます。</span></button>"
      + "<button class='vql-b' data-go='join'><b>PIN で 入る</b><span>聞いた 6 文字を 入れます。</span></button>"
      + "</div>"
    );
    ov.影.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-go]");
      if (!b) return;
      ov.閉じる();
      if (b.getAttribute("data-go") === "join") 入る画面(o.pin || "");
      else 作る画面();
    });
    /* 背景を 押したら 閉じる */
    ov.影.querySelector(".vql").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) ov.閉じる();
    });
  }

  /* ── 入る（PIN → ニックネーム）───────────────────────────────── */
  function 入る画面(pin0) {
    var ov = 覆い(
      "<h2 class='vql-h'>PIN で 入る</h2>"
      + "<p class='vql-sub'>部屋の <b>6 文字</b>を 入れてください。"
      + "はじめの <b>V</b> は 入れなくて かまいません。</p>"
      + "<div class='vql-pinbox'>"
      + "<div class='vql-cells' data-cells></div>"
      /* ★ 打つ ところは 1 つだけ（貼り付け・変換・スマホの 予測を 壊さない） */
      + "<input class='vql-pin' data-pin maxlength='6' autocomplete='one-time-code' "
      + "inputmode='latin' autocapitalize='characters' spellcheck='false' value='" + esc(pin0 || "") + "'>"
      + "</div>"
      + "<div style='height:14px'></div>"
      + "<input class='vql-in' data-nick maxlength='16' placeholder='ニックネーム（みんなに 見えます）'>"
      + "<p class='vql-hint'>名前は あとから 変えられません。みんなに 見えます。</p>"
      + "<div class='vql-err' data-err></div>"
      + "<button class='vql-go' data-join>入る</button>"
    );
    var sh = ov.影;
    var pinEl = sh.querySelector("[data-pin]"), nickEl = sh.querySelector("[data-nick]");
    var cells = sh.querySelector("[data-cells]");
    var err = sh.querySelector("[data-err]"), go = sh.querySelector("[data-join]");
    /* マスを 描く。1 文字目は **V で 固定**（間違えようが ない）。 */
    function マス() {
      var v = pinEl.value;
      var h = "<span class='vql-cell is-fix'>V</span>";
      for (var i = 1; i < 6; i++) {
        var c = v[i] || "";
        h += "<span class='vql-cell" + (c ? " is-on" : (v.length === i ? " is-now" : "")) + "'>"
          + esc(c) + "</span>";
      }
      cells.innerHTML = h;
    }
    function そろえる() {
      var v = pinEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      /* V を 打っても 打たなくても よい ように、先頭の V は 足して そろえる。 */
      if (v && v[0] !== "V") v = "V" + v;
      pinEl.value = v.slice(0, 6);
      マス();
    }
    そろえる();
    setTimeout(function () { try { pinEl.focus(); } catch (e) {} }, 60);
    cells.parentNode.addEventListener("click", function () { try { pinEl.focus(); } catch (e) {} });
    pinEl.addEventListener("input", function () {
      そろえる();
      if (pinEl.value.length === 6) nickEl.focus();
    });
    pinEl.addEventListener("blur", マス);
    pinEl.addEventListener("focus", マス);
    var 送る = function () {
      var pin = pinEl.value.trim().toUpperCase(), nick = nickEl.value.trim();
      if (!/^V[0-9A-Z]{5}$/.test(pin)) { err.textContent = "PIN は V で 始まる 6 文字です。"; return; }
      if (!nick) { err.textContent = "ニックネームを 入れてください。"; nickEl.focus(); return; }
      go.disabled = true; err.textContent = "";
      var 前 = null;
      try { 前 = JSON.parse(root.localStorage.getItem(K_ME) || "null"); } catch (e) {}
      頼む("/api/live/join", { method: "POST", body: {
        pin: pin, nickname: nick,
        rejoinKey: (前 && 前.pin === pin) ? 前.key : ""
      } }).then(function (r) {
        go.disabled = false;
        if (!r || !r.ok) { err.textContent = (r && r.message) || "入れませんでした。"; return; }
        try { root.localStorage.setItem(K_ME, JSON.stringify({ pin: pin, key: r.key, you: r.you })); } catch (e) {}
        ov.閉じる();
        始める({ pin: pin, key: r.key, you: r.you, host: false, room: r.room });
      }, function () { go.disabled = false; err.textContent = "つながりませんでした。"; });
    };
    go.addEventListener("click", 送る);
    sh.addEventListener("keydown", function (e) { if (e.key === "Enter") 送る(); });
  }

  /* ── 作る（プリセットを 選んで 部屋を 作る）──────────────────── */
  function 作る画面(preset) {
    if (preset) return 作る(preset);
    /* プリセットが 渡されて いなければ、一覧から 選んで もらう */
    var list = [];
    try {
      var ST = root.VQ2 && root.VQ2.store;
      list = (ST && ST.presets && ST.presets.list ? ST.presets.list() : []) || [];
    } catch (e) { list = []; }
    var 使える = list.filter(function (p) { return p && (p.questions || []).length; });
    if (!使える.length) {
      var o1 = 覆い("<h2 class='vql-h'>プリセットが ありません</h2>"
        + "<p class='vql-sub'>先に 問題を 作ってから、もう一度 お試しください。</p>"
        + "<button class='vql-go' data-x>閉じる</button>");
      o1.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o1.閉じる(); });
      return;
    }
    var ov = 覆い("<h2 class='vql-h'>どれで やりますか</h2>"
      + "<p class='vql-sub'>選んだ プリセットの 問題を みんなで 解きます。</p>"
      + "<div class='vql-row' style='flex-direction:column'>"
      + 使える.slice(0, 30).map(function (p, i) {
          return "<button class='vql-b' data-i='" + i + "' style='min-height:auto'><b>" + esc(p.title || "名前なし")
            + "</b><span>" + (p.questions || []).length + " 問</span></button>";
        }).join("")
      + "</div>");
    ov.影.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-i]");
      if (!b) return;
      ov.閉じる();
      作る(使える[Number(b.getAttribute("data-i"))]);
    });
  }

  /* ══ みんなで解くに **出せる 形式**（2026-09-10）════════════════════
     出せない ものを 混ぜると、選択肢の 無い 文字入力に 化けて
     **答えようが ない 問題**が 出る。だから 部屋に 入れる 前に よける。
     ★ よけた ことは 隠さない。何問 よけたかを 作った 人に 見せる。
     ★ ここに 足す ときは server/src/live.js の 採点() も 一緒に 直す
       （こちらだけ 増やすと「出るのに 正誤が 付かない」に なる）。 */
  var 出せる形式 = {
    single_choice: 1, multiple_choice_single: 1, choice_2: 1, choice_3: 1, choice_5: 1,
    multi_choice: 1, multiple_choice_multiple: 1,
    true_false: 1,
    text_input: 1, word_input: 1,
    numeric_input: 1, numeric: 1
  };
  function 出せるか(q) {
    if (!q) return false;
    var t = String(q.type || "");
    if (出せる形式[t]) return true;
    /* 形式名が 分からなくても、**選択肢が あれば 出せる**（4択と 同じ 扱い）。 */
    return Array.isArray(q.choices) && q.choices.length >= 2;
  }

  function 作る(preset) {
    var 全 = (preset.questions || []);
    var qs = 全.filter(出せるか).slice(0, 100);
    var よけた = 全.length - qs.length;
    if (!qs.length) {
      var o0 = 覆い("<h2 class='vql-h'>この プリセットは まだ 出せません</h2>"
        + "<p class='vql-sub'>みんなで解くで 出せるのは <b>4択・○×・短答・数値</b> です。"
        + "記述や 並べ替え、資料の 問題は これから 増やします。</p>"
        + "<button class='vql-go' data-x>閉じる</button>");
      o0.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o0.閉じる(); });
      return;
    }
    preset = { id: preset.id, title: preset.title || preset.name, subject: preset.subject, questions: qs };
    if (よけた) 作った後に伝える = よけた;
    var ov = 覆い("<h2 class='vql-h'>部屋を 作って います…</h2><p class='vql-sub'>少し お待ちください。</p>");
    頼む("/api/live/create", { method: "POST", body: {
      title: preset.title || "みんなで解く",
      questions: qs,
      settings: { limit: 20, reveal: true }
    } }).then(function (r) {
      ov.閉じる();
      if (!r || !r.ok) {
        var o2 = 覆い("<h2 class='vql-h'>作れませんでした</h2><p class='vql-sub'>"
          + esc((r && r.message) || "もう一度 お試しください。") + "</p><button class='vql-go' data-x>閉じる</button>");
        o2.影.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) o2.閉じる(); });
        return;
      }
      ロビー({ pin: r.pin, key: r.hostKey, you: "p1", host: true, room: r.room,
               preset: preset, よけた: 作った後に伝える });
      作った後に伝える = 0;
    }, function () { ov.閉じる(); });
  }

  /* 作った ときに「よけた 問題数」を 待機画面へ 渡す ための 一時の 置き場。
     ★ ロビーを 差し替えた ときに この 宣言ごと 落として しまい、
       部屋を 作った 瞬間に 落ちて いた（実測）。 */
  /* 参加の 道。**短い ほうを 出す**（黒板に 書ける・口で 言える）。 */
  function 参加のURL(pin) {
    var h = "";
    try { h = location.host.replace(/^www\./, ""); } catch (e) { h = "vocabuquiz.app"; }
    return h + "/v/" + pin;
  }
  function 参加のURL完全(pin) {
    try { return location.origin + "/v/" + pin; } catch (e) { return "https://vocabuquiz.app/v/" + pin; }
  }

  var 作った後に伝える = 0;

  /* ── 待機画面（Discord の 通話画面のような タイル）─────────────
     訴え「参加者待機画面には、ユーザーの アイコンと 裏には ボカシ。
          Discord 通話画面のような UI 表示に したい。参加者は 最大 1000 人に」
     ★ 1000 人 ぜんぶは 描かない。**サーバが 先頭 60 人だけ 配る**ので、
       残りは 数で 出す（黙って 減らさない）。 */
  function ロビー(s) {
    var old = q("#vqPartyWait");
    if (old) old.remove();
    var host = doc.createElement("div");
    host.id = "vqPartyWait";
    var sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = "<style>" + CSS + 待CSS + "</style><div class='vqw'>"
      + "<div class='vqw-h'></div><div class='vqw-how'></div>"
      + "<div class='vqw-grid'></div><div class='vqw-foot'></div></div>";
    doc.body.appendChild(host);

    var conn = null;
    function 描く(room) {
      var ps = (room && room.players || []).filter(function (p) { return !p.host; });
      var 総 = (room && typeof room.count === "number") ? room.count : ps.length;
      var 残 = Math.max(0, 総 - ps.length);
      sh.querySelector(".vqw-h").innerHTML =
        "<div><div class='vqw-lab'>" + (s.host ? "この PIN を 伝えて ください" : "入りました") + "</div>"
        + "<div class='vqw-pin'>" + esc(s.pin) + "</div></div>"
        + "<div class='vqw-n'>" + 総 + " 人</div>";

      /* ★ **どこから 入るか**を 出すのは 作った 人の 画面だけ。 */
      var how = sh.querySelector(".vqw-how");
      if (s.host) {
        if (!how.dataset.done) {
          how.dataset.done = "1";
          how.innerHTML = "<div class='vqw-qr' data-qr></div>"
            + "<div class='vqw-way'>参加する 人は、この どちらかで 入れます。"
            + "<b style='color:var(--vq-accent-text,#5F579E)'>ログインは 要りません。</b><br>"
            + "① QR を スマホの カメラで 読む<br>"
            + "② 下の ページを 開いて、名前を 入れる"
            + "<div class='vqw-url'><b data-url>" + esc(参加のURL(s.pin)) + "</b>"
            + "<button class='vqw-copy' data-copy>コピー</button></div></div>";
          QRを用意(function (ok) {
            var box = sh.querySelector("[data-qr]");
            if (!box) return;
            if (ok) box.innerHTML = QRを描く(参加のURL完全(s.pin));
            /* ★ 出せない ときは **黙って 空にしない**。②が ある ことを 伝える。 */
            else box.outerHTML = "";
          });
        }
      } else { how.innerHTML = ""; }

      var 箱 = sh.querySelector(".vqw-grid");
      if (!ps.length) {
        箱.innerHTML = "<div class='vqw-more' style='grid-column:1/-1;aspect-ratio:auto;padding:40px 10px'>"
          + (s.host ? "PIN を 伝えると、ここに 参加者が 並びます。" : "ほかの 人を 待って います…") + "</div>";
      } else {
        箱.innerHTML = ps.map(function (p) {
          var c = 色(p.color);
          var f = 顔(p.face, c);
          return "<div class='vqw-t" + (p.online ? "" : " is-off") + "'"
            /* ★ 地は **しっかり 色**（13% だと 洗い色に なって Discord と 別物に 見えた） */
            + " style='background:linear-gradient(168deg," + c + "," + c + "99)'"
            + " title='" + esc(p.name) + "'>"
            /* ★ 裏は **同じ 絵を 引き伸ばして ぼかす**（Discord と 同じ 作り） */
            + "<span class='vqw-bg' style='background:" + c + "'>" + f + "</span>"
            + "<span class='vqw-av' style='background:" + c + "'>" + f + "</span>"
            + "<span class='vqw-name'>" + esc(p.name) + "</span>"
            + (p.online ? "" : "<span class='vqw-badge'>はなれた</span>")
            + "</div>";
        }).join("")
          + (残 ? "<div class='vqw-more'>ほか <b>" + 残 + " 人</b><br>（多いので 表示は " + ps.length + " 人まで）</div>" : "");
      }

      sh.querySelector(".vqw-foot").innerHTML = s.host
        ? ((s.よけた
            ? "<div class='vqw-wait'>出せない 形式の " + s.よけた + " 問は 外しました</div>" : "")
          + "<button class='vqw-x' data-quit aria-label='やめる'>✕</button>"
          + "<button class='vqw-go' data-start" + (総 ? "" : " disabled") + ">始める（" + 総 + " 人）</button>")
        : "<div class='vqw-wait'>始まるのを 待って います…</div>"
          + "<button class='vqw-x' data-quit aria-label='やめる'>✕</button>";
    }
    描く(s.room);

    conn = つなぐ(s.pin, s.key, function (m) {
      if (m.t === "welcome" || m.t === "room") 描く(m.room);
      if (m.t === "q") { try { host.remove(); } catch (e) {} 出題へ(s, conn, m); }
    });
    sh.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-copy]")) {
        var b2 = e.target.closest("[data-copy]");
        try {
          root.navigator.clipboard.writeText(参加のURL完全(s.pin));
          b2.textContent = "コピーしました";
          setTimeout(function () { b2.textContent = "コピー"; }, 1600);
        } catch (x) { b2.textContent = "コピーできません"; }
        return;
      }
      if (e.target.closest && e.target.closest("[data-start]")) conn.送る({ t: "start" });
      if (e.target.closest && e.target.closest("[data-quit]")) {
        try { conn.閉じる(); } catch (x) {}
        try { host.remove(); } catch (x) {}
        場 = null;
      }
    });
    場 = { s: s, conn: conn, room: s.room };
  }

  /* 参加者側は ロビーを 経由して 出題へ 入る */
  function 始める(s) { ロビー(s); }

  /* ══════════════════════════════════════════════════════════════════
     出題（**プリセットの 画面が 主役**）
     ══════════════════════════════════════════════════════════════════ */
  function 出題へ(s, conn, 最初) {
    /* 部屋の 問題を そのまま 1 つの プリセットに して 開く。
       ★ 答えは サーバが 落として いる ので、この プリセットに 正解は 無い。
         正誤は サーバの reveal で 受ける。 */
    var 状 = {
      s: s, conn: conn,
      /* ★ **部屋の 姿を 最初から 持たせる**（2026-09-10 実測）。
         null で 始めて いたので 見出しが「1/?」に なり、
         帯も 最初の room が 来るまで 空だった。 */
      room: s.room || null, cur: -1, q: null,
      players: {}, live: {}, res: {}, rank: [],
      share: false, 送った: {}, 直近送信: 0
    };
    場 = 状;

    /* 出題画面を 開く（1 問ずつ サーバが 配る ので、器だけ 借りる） */
    var preset = {
      id: "live:" + s.pin, title: (s.room && s.room.title) || "みんなで解く",
      subject: "", questions: []
    };

    /* ★ 出題画面を そのまま 使うと 「次へ」で 勝手に 進んで しまう。
       みんなで解く では **サーバが 進める** ので、
       1 問ずつ 差し替える 軽い 出題面を 自前で 出す。
       （出題画面の 描画は R.renderHtml を 借りる。作り直さない） */
    面を開く(状);
    面へ(状, 最初);

    conn.受け = true;
  }

  /* 出題の 面。**影の DOM を 1 枚 だけ 持つ。** */
  function 面を開く(状) {
    var old = q("#vqPartyStage");
    if (old) old.remove();
    var host = doc.createElement("div");
    host.id = "vqPartyStage";
    var sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = "<style>" + CSS + 帯CSS + 面CSS + "</style>"
      + "<div class='vqls'><div class='vqls-h'></div><div class='vqls-b'></div><div class='vqlb'></div></div>";
    doc.body.appendChild(host);
    状.影 = sh;
    状.器 = host;

    sh.addEventListener("click", function (e) {
      var t = e.target;
      var sBtn = t.closest && t.closest("[data-share]");
      if (sBtn) {
        状.share = !状.share;
        状.conn.送る({ t: "share", on: 状.share });
        帯を描く(状);
        return;
      }
      var hBtn = t.closest && t.closest("[data-host]");
      if (hBtn) { 状.conn.送る({ t: hBtn.getAttribute("data-host") }); return; }
      var c = t.closest && t.closest("[data-ch]");
      if (c) 選ぶ(状, Number(c.getAttribute("data-ch")));
      var x = t.closest && t.closest("[data-quit]");
      if (x) 終わる(状);
    });
    sh.addEventListener("input", function (e) {
      var i = e.target.closest && e.target.closest("[data-txt]");
      if (i) 打つ(状, i.value);
    });
    sh.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var i = e.target.closest && e.target.closest("[data-txt]");
        if (i) 出す(状, i.value);
      }
    });
  }

  var 面CSS = [
    /* ★ 重なりは **いちばん 上**（2026-09-10 実測）。
       2147482900 だと 初回案内の 下に 隠れて、動いて いるのに 見えなかった。 */
    ".vqls{position:fixed;inset:0;z-index:2147483550;background:var(--vq-bg,#FCFBFE);color:var(--vq-text,#2B2836);",
      "display:flex;flex-direction:column;font-family:inherit;}",
    ".vqls-h{flex:0 0 auto;padding:12px 16px;display:flex;align-items:center;gap:10px;",
      "border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);font-size:13px;}",
    ".vqls-b{flex:1 1 auto;overflow:auto;padding:22px 18px 190px;}",
    ".vqls-q{font-size:clamp(18px,2.6vw,26px);font-weight:750;line-height:1.6;margin:0 auto 22px;max-width:820px;}",
    ".vqls-cs{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;max-width:820px;margin:0 auto;}",
    ".vqls-c{position:relative;min-height:74px;border-radius:16px;border:2px solid var(--vq-border,#DED8EE);",
      "background:var(--vq-surface,#fff);color:inherit;font:inherit;font-size:16px;font-weight:650;cursor:pointer;",
      "padding:16px 18px;text-align:left;transition:transform .12s,border-color .12s;}",
    ".vqls-c:hover{transform:translateY(-2px);}",
    ".vqls-c.is-mine{border-color:var(--vq-accent,#756DB3);background:var(--vq-accent-subtle,#F2EEFB);}",
    ".vqls-c.is-ok{border-color:#30A46C;background:rgba(48,164,108,.12);}",
    ".vqls-c.is-ng{border-color:#E5484D;background:rgba(229,72,77,.10);}",
    ".vqls-t{width:100%;max-width:820px;margin:0 auto;display:block;font-size:20px;padding:16px 18px;",
      "border-radius:16px;border:2px solid var(--vq-border,#DED8EE);background:var(--vq-surface,#fff);",
      "color:inherit;font-family:inherit;}",
    ".vqls-n{font-size:12.5px;color:var(--vq-text-secondary,#7A7589);font-weight:700;}",
    ".vqls-tm{margin-left:auto;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;}",
    ".vqls-quit{border:0;background:none;font:inherit;font-size:13px;color:var(--vq-text-secondary,#7A7589);cursor:pointer;}",
    ".vqls-rv{max-width:820px;margin:20px auto 0;padding:14px 16px;border-radius:14px;",
      "background:var(--vq-surface-sunken,#F6F4FB);font-size:14px;line-height:1.8;}",
    ".vqls-rank{max-width:820px;margin:14px auto 0;}",
    ".vqls-rank div{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;font-size:14px;}",
    ".vqls-rank div:nth-child(odd){background:var(--vq-surface-sunken,#F6F4FB);}",
    ".vqls-rank b{margin-left:auto;font-variant-numeric:tabular-nums;}"
  ].join("");

  /* ── 1 問 出す ───────────────────────────────────────────────── */
  function 面へ(状, m) {
    /* 前の 問題の「回答ずみ」を 消す（残ると 全員 出した ように 見える） */
    ((状.room && 状.room.players) || []).forEach(function (p) { p.answered = false; });
    状.cur = m.i;
    状.q = m.q;
    状.live = {};
    状.res = {};
    状.終 = m.curAt && m.limit ? (m.curAt + m.limit * 1000) : 0;
    本文を描く(状);
    帯を描く(状);
    時計(状);
  }

  function 本文を描く(状) {
    var sh = 状.影;
    if (!sh) return;
    var q0 = 状.q || {};
    var h = sh.querySelector(".vqls-h"), b = sh.querySelector(".vqls-b");
    h.innerHTML = "<span class='vqls-n'>" + (状.cur + 1) + " / " + ((状.room && 状.room.total) || "?") + "</span>"
      + "<span class='vqls-n' style='letter-spacing:.1em'>" + esc(状.s.pin) + "</span>"
      + "<span class='vqls-tm' data-tm></span>"
      + "<button class='vqls-quit' data-quit>やめる</button>";

    var 選 = Array.isArray(q0.choices) ? q0.choices : null;
    var 私 = 状.送った[状.cur];
    var body = "<div class='vqls-q'>" + esc(q0.question || q0.prompt || "") + "</div>";
    if (q0.type === "true_false") {
      body += "<div class='vqls-cs'>"
        + ["○ 正しい", "× まちがい"].map(function (t, i) {
            return "<button class='vqls-c" + (私 !== undefined && String(私) === String(i === 0) ? " is-mine" : "")
              + "' data-ch='" + i + "'>" + t + "<span class='vqld' data-dot='" + i + "'></span></button>";
          }).join("") + "</div>";
    } else if (選 && 選.length) {
      body += "<div class='vqls-cs'>"
        + 選.map(function (c, i) {
            return "<button class='vqls-c" + (私 === i ? " is-mine" : "") + "' data-ch='" + i + "'>"
              + esc(typeof c === "string" ? c : (c && c.text) || "")
              + "<span class='vqld' data-dot='" + i + "'></span></button>";
          }).join("") + "</div>";
    } else {
      body += "<input class='vqls-t' data-txt placeholder='答えを 入力して Enter' value='"
        + esc(私 === undefined ? "" : 私) + "'>";
    }
    b.innerHTML = body;
    点を打つ(状);
  }

  /* ── 選ぶ／打つ／出す ─────────────────────────────────────── */
  function 選ぶ(状, i) {
    if (状.送った[状.cur] !== undefined) return;
    var v = (状.q && 状.q.type === "true_false") ? (i === 0) : i;
    状.conn.送る({ t: "typing", v: v });
    出す(状, v);
  }
  function 打つ(状, s) {
    /* ★ **1 文字ごとに 送らない。** 0.3 秒 おき。
       （1 文字ごとに 重い ことを するな、は この アプリの 決まり） */
    if (状.share && 状.s.you) { 状.live[状.s.you] = s; 帯を描く(状); }
    var now = Date.now();
    if (now - 状.直近送信 < 300) return;
    状.直近送信 = now;
    状.conn.送る({ t: "typing", v: s });
  }
  function 出す(状, v) {
    if (状.送った[状.cur] !== undefined) return;
    状.送った[状.cur] = v;
    /* ★ **自分のぶんは 自分で 入れる**（2026-09-10 実測）。
       サーバは 送り主へ live を 返さない ので、
       「見せる」を 押して いても 自分の 欄だけ「…」の ままだった。 */
    if (状.s.you) 状.live[状.s.you] = v;
    状.conn.送る({ t: "answer", i: 状.cur, v: v });
    本文を描く(状);
    帯を描く(状);
  }

  /* ── 参加者の 帯 ─────────────────────────────────────────── */
  function 帯を描く(状) {
    var sh = 状.影;
    if (!sh) return;
    var bar = sh.querySelector(".vqlb");
    if (!bar) return;
    var ps = ((状.room && 状.room.players) || []).filter(function (p) { return !p.host; });
    bar.innerHTML =
      "<div class='vqlb-top'><span class='vqlb-pin'>" + esc(状.s.pin) + "</span>"
      + "<span>" + ps.length + " 人</span>"
      + "<span>" + ps.filter(function (p) { return p.answered; }).length + " 人 回答ずみ</span>"
      + (状.s.host
          ? "<button class='vqlb-host' data-host='reveal'>答え合わせ</button>"
            + "<button class='vqlb-host' data-host='next'>次へ</button>"
          : "<button class='vqlb-share" + (状.share ? " is-on" : "") + "' data-share>"
            + (状.share ? "回答を 見せて います" : "回答を みんなに 見せる") + "</button>")
      + "</div>"
      + "<div class='vqlb-list'>"
      + ps.map(function (p) {
          var r = 状.res[p.id];
          var 見 = p.share;
          /* 答え合わせが 済んで いれば、書きかけ ではなく **出した 答え**を 出す。 */
          var r0 = 状.res[p.id];
          var v = (r0 && r0.v !== undefined && r0.v !== null) ? r0.v : 状.live[p.id];
          var cls = "vqlb-i" + (p.online ? "" : " is-off")
            + (r && r.ok === true ? " is-ok" : r && r.ok === false ? " is-ng" : "")
            + (p.answered && !r ? " is-done" : "");
          /* ★ **見せて いい 人だけ** 中身を 出す。
             許可して いない 人は アイコンのまま（訴えの とおり）。 */
          var 中 = 見
            ? "<span class='vqlb-a' style='background:" + 色(p.color) + "'>" + esc(答えの字(状.q, v)) + "</span>"
            /* ★ アイコンは **キャラクター**（頭文字では ない）。
               待機画面と 同じ 顔が 出題中も 並ぶ ので、誰が 誰か 分かる。 */
            : "<span class='vqlb-av' style='background:" + 色(p.color) + "'>" + 顔(p.face, 色(p.color), { 顔だけ: true }) + "</span>";
          return "<div class='" + cls + "' title='" + esc(p.name) + "'>" + 中
            + "<span class='vqlb-n'>" + esc(p.name) + "</span>"
            + "<span class='vqlb-s'>" + (p.score || 0) + "</span></div>";
        }).join("")
      + "</div>";
  }

  /* 選んだ ものを 短い 字に する（帯は 狭い） */
  function 答えの字(q0, v) {
    if (v === undefined || v === null || v === "") return "…";
    if (q0 && q0.type === "true_false") return v === true || v === "true" ? "○" : "×";
    if (q0 && Array.isArray(q0.choices) && typeof v === "number") {
      return String.fromCharCode(65 + v);
    }
    return String(v).slice(0, 12);
  }

  /* 選択肢の 上に 「誰が いま 選んで いるか」を 色の 点で 打つ */
  function 点を打つ(状) {
    var sh = 状.影;
    if (!sh) return;
    var 箱 = {};
    sh.querySelectorAll("[data-dot]").forEach(function (el) {
      箱[el.getAttribute("data-dot")] = el;
      el.innerHTML = "";
    });
    var ps = ((状.room && 状.room.players) || []).filter(function (p) { return !p.host && p.share; });
    ps.forEach(function (p) {
      var v = 状.live[p.id];
      var k = null;
      if (状.q && 状.q.type === "true_false") k = (v === true || v === "true") ? "0" : (v === false || v === "false" ? "1" : null);
      else if (typeof v === "number") k = String(v);
      if (k === null || !箱[k]) return;
      var i = doc.createElement("i");
      i.style.background = 色(p.color);
      i.title = p.name;
      箱[k].appendChild(i);
    });
  }

  /* ── 残り 時間 ─────────────────────────────────────────────── */
  function 時計(状) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    状.時 = setInterval(function () {
      var el = 状.影 && 状.影.querySelector("[data-tm]");
      if (!el) return;
      if (!状.終) { el.textContent = ""; return; }
      var 残 = Math.max(0, Math.ceil((状.終 - Date.now()) / 1000));
      el.textContent = 残 + " 秒";
      if (残 <= 0) { try { clearInterval(状.時); } catch (e) {} }
    }, 200);
  }

  /* ── 答え合わせ ───────────────────────────────────────────── */
  function 答え合わせ(状, m) {
    状.res = {};
    (m.results || []).forEach(function (r) { 状.res[r.id] = r; });
    状.rank = m.rank || [];
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    状.終 = 0;
    var sh = 状.影;
    if (!sh) return;
    /* ★ 秒数を **消す**（2026-09-10 実測）。時計は 止めて いたが 字が 残り、
       答え合わせの 最中も「16 秒」と 出たままに なって いた。 */
    var tm = sh.querySelector("[data-tm]");
    if (tm) tm.textContent = "";
    /* 自分の 選択肢に 正誤の 色を 付ける */
    var 正 = m.answer;
    sh.querySelectorAll("[data-ch]").forEach(function (el) {
      var i = Number(el.getAttribute("data-ch"));
      var これ = (状.q && 状.q.type === "true_false") ? (i === 0) : i;
      if (正 !== null && 正 !== undefined && String(これ) === String(正)) el.classList.add("is-ok");
      else if (状.送った[状.cur] !== undefined && String(状.送った[状.cur]) === String(これ)) el.classList.add("is-ng");
    });
    var b = sh.querySelector(".vqls-b");
    var 私 = 状.res[状.s.you];
    var h = "<div class='vqls-rv'>"
      + (私 ? (私.ok === true ? "<b style='color:#30A46C'>正解！ +" + 私.gain + " 点</b>"
              : 私.ok === false ? "<b style='color:#E5484D'>ざんねん</b>"
              : "<b>受け取りました</b>") : "<b>答え合わせ</b>")
      + (m.answer !== null && m.answer !== undefined
          ? "<div>正解：" + esc(答えの字(状.q, m.answer) === "…" ? String(m.answer) : 正解の字(状.q, m.answer)) + "</div>" : "")
      + (m.explanation ? "<div style='margin-top:6px'>" + esc(m.explanation) + "</div>" : "")
      + "</div>"
      + "<div class='vqls-rank'>"
      + (状.rank || []).slice(0, 10).map(function (r) {
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + 顔(r.face, 色(r.color), { 顔だけ: true })
            + "</span><span>" + r.rank + ". " + esc(r.name) + "</span><b>" + r.score + "</b></div>";
        }).join("")
      + "</div>";
    b.insertAdjacentHTML("beforeend", h);
    帯を描く(状);
  }
  function 正解の字(q0, v) {
    if (q0 && q0.type === "true_false") return v === true ? "○ 正しい" : "× まちがい";
    if (q0 && Array.isArray(q0.choices) && typeof v === "number") {
      var c = q0.choices[v];
      return (typeof c === "string" ? c : (c && c.text) || String(v));
    }
    return Array.isArray(v) ? v.join("、") : String(v);
  }

  /* ── 終わり ──────────────────────────────────────────────── */
  function 結果(状, m) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    var sh = 状.影;
    if (!sh) return;
    sh.querySelector(".vqls-h").innerHTML = "<span class='vqls-n'>おしまい</span>"
      + "<button class='vqls-quit' data-quit style='margin-left:auto'>閉じる</button>";
    sh.querySelector(".vqlb").innerHTML = "";
    sh.querySelector(".vqls-b").innerHTML =
      "<div class='vqls-q' style='text-align:center'>結果</div>"
      + "<div class='vqls-rank'>"
      + (m.rank || []).map(function (r) {
          var 金 = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : "";
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + 顔(r.face, 色(r.color), { 顔だけ: true })
            + "</span><span>" + 金 + " " + r.rank + ". " + esc(r.name) + "</span><b>" + r.score + " 点</b></div>";
        }).join("")
      + "</div>";
  }

  function 終わる(状) {
    try { if (状.時) clearInterval(状.時); } catch (e) {}
    try { 状.conn && 状.conn.閉じる(); } catch (e) {}
    try { 状.器 && 状.器.remove(); } catch (e) {}
    場 = null;
  }

  /* ══ 受け口を 1 か所に する ══════════════════════════════════════
     ロビーで つないだ 通信を、出題へ 移った あとも 使い回す。 */
  var 元つなぐ = つなぐ;
  つなぐ = function (pin, key, 受ける) {
    return 元つなぐ(pin, key, function (m) {
      /* 出題に 入って いれば こちらで 先に 処理する */
      var 状 = 場;
      if (状 && 状.影) {
        if (m.t === "room") { 状.room = m.room; 帯を描く(状); 点を打つ(状); }
        if (m.t === "q") { 面へ(状, m); return; }
        if (m.t === "live") { 状.live[m.id] = m.v; 点を打つ(状); 帯を描く(状); return; }
        if (m.t === "answered") {
          /* ★ **room を 待たない**（2026-09-10 実測）。
             回答の たびに 部屋の 姿を 丸ごと 配ると 通信量が 増えるので、
             サーバは 軽い 合図だけ 送る。こちらで 印を 立てる。 */
          var ps0 = (状.room && 状.room.players) || [];
          for (var i0 = 0; i0 < ps0.length; i0++) {
            if (ps0[i0].id === m.id) { ps0[i0].answered = true; break; }
          }
          帯を描く(状);
          return;
        }
        if (m.t === "reveal") { 答え合わせ(状, m); return; }
        if (m.t === "end") { 結果(状, m); return; }
        if (m.t === "welcome") { 状.room = m.room; 帯を描く(状); return; }
      }
      受ける(m);
    });
  };

  /* ══ `/v/PIN` で 開いた ときは、その まま 入る 画面へ ══════════════
     ★ これが 無いと URL を 配っても トップが 開くだけで 入れない。 */
  function 道から開く() {
    var pin = "";
    try {
      var m = /^\/v\/([A-Za-z0-9]{1,8})\/?$/.exec(location.pathname || "");
      if (m) pin = String(m[1]).toUpperCase();
      if (!pin) {
        var q2 = new URLSearchParams(location.search || "");
        pin = String(q2.get("pin") || "").toUpperCase();
      }
    } catch (e) {}
    if (!/^V[0-9A-Z]{5}$/.test(pin)) return;
    /* 道は きれいに して おく（戻るで 行き来しない ように）。 */
    try { history.replaceState(null, "", "/"); } catch (e) {}
    setTimeout(function () { 入る画面(pin); }, 400);
  }
  道から開く();

  root.__vqParty = {
    開く: 開く,
    作る: function (preset) { 作る画面(preset); },
    入る: function (pin) { 入る画面(pin || ""); },
    いま: 状態
  };
})();
