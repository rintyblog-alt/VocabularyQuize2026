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
          ②「キャラクターが シンプルすぎる。作り込んで」
          ③「面白くない。もっと ボディも あるような」

     ★ **全身**で 描く。顔だけでは 誰が 誰か 分かっても 面白く ない。
     ★ 絵は **読み込まない。その場で 描く。**
       1000 人ぶんの 画像を 取りに 行ったら 教室の 回線は もたない。
     ★ 何に なるかは **サーバが 決めた 数 1 つ**から 割り出す。
       同じ 名前なら いつも 同じ 姿。
     ★ 重ねる 順は 後ろから:
         しっぽ → あし → からだ → うで → あたま(みみ) → かお → かざり
       同じ 色の 上に 同じ 色で 描くと 消える ので、**輪郭を 必ず 付ける**。

     すがた 10 × 服 6 × うで 3 × 目 8 × 口 7 × 飾り 9 × ほお 2
     ＝ 181,440 通り。
     ══════════════════════════════════════════════════════════════════ */
  var 濃 = "#241F30";                 /* 輪郭・目・口（どの 色の 上でも 読める） */
  var 肌 = "#FFF6EC";                 /* 顔と 手の 地 */
  var 線 = "' stroke='" + 濃 + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'";

  /* ── みみ・つの（頭の 後ろ）と しっぽ（いちばん 後ろ）── */
  var すがた = [
    { 名: "ねこ",
      みみ: "<path d='M22 22L27 -8l24 22z'/><path d='M78 22L73 -8 49 14z'/>"
        + "<path d='M29 18L32 2l11 12z' fill='rgba(255,255,255,.55)' stroke='none'/>"
        + "<path d='M71 18L68 2 57 14z' fill='rgba(255,255,255,.55)' stroke='none'/>",
      しっぽ: "<path d='M70 108q26 4 22-16-2-10-11-8' fill='none' stroke-width='9'/>" },
    { 名: "くま",
      みみ: "<circle cx='24' cy='16' r='13'/><circle cx='76' cy='16' r='13'/>"
        + "<circle cx='24' cy='16' r='6' fill='rgba(255,255,255,.55)' stroke='none'/>"
        + "<circle cx='76' cy='16' r='6' fill='rgba(255,255,255,.55)' stroke='none'/>",
      しっぽ: "<circle cx='74' cy='104' r='8'/>" },
    { 名: "うさぎ",
      みみ: "<ellipse cx='36' cy='-2' rx='8' ry='24'/><ellipse cx='64' cy='-2' rx='8' ry='24'/>"
        + "<ellipse cx='36' cy='0' rx='3.6' ry='16' fill='rgba(255,255,255,.6)' stroke='none'/>"
        + "<ellipse cx='64' cy='0' rx='3.6' ry='16' fill='rgba(255,255,255,.6)' stroke='none'/>",
      しっぽ: "<circle cx='75' cy='104' r='9' fill='#fff'/>" },
    { 名: "きつね",
      みみ: "<path d='M16 24L24 -12l26 26z'/><path d='M84 24L76 -12 50 14z'/>"
        + "<path d='M25 20L29 0l12 14z' fill='rgba(255,255,255,.5)' stroke='none'/>"
        + "<path d='M75 20L71 0 59 14z' fill='rgba(255,255,255,.5)' stroke='none'/>",
      しっぽ: "<path d='M70 110q28 0 24-20-3-12-14-8-10 4-10 14z'/>"
        + "<path d='M88 92q6 6 3 14' fill='#fff' stroke='none' opacity='.65'/>" },
    { 名: "とり",
      みみ: "<path d='M50 -14c9 0 12 10 9 16H41c-3-6 0-16 9-16z'/>",
      しっぽ: "<path d='M70 104l22 8-22 8z'/>" },
    { 名: "ロボ",
      みみ: "<rect x='46' y='-16' width='8' height='26' rx='4'/><circle cx='50' cy='-18' r='8'/>"
        + "<rect x='12' y='32' width='11' height='22' rx='5'/><rect x='77' y='32' width='11' height='22' rx='5'/>",
      しっぽ: "" },
    { 名: "おばけ",
      みみ: "<path d='M50 -8c20 0 30 14 30 32v10H20V24C20 6 30-8 50-8z'/>",
      しっぽ: "" },
    { 名: "ドラゴン",
      みみ: "<path d='M30 18L18-14l26 18z'/><path d='M70 18L82-14 56 4z'/>",
      しっぽ: "<path d='M68 108q26 2 24-16l10 6-2-16-12 8q-8-6-20 4z'/>" },
    { 名: "ぱんだ",
      みみ: "<circle cx='23' cy='16' r='13' fill='" + 濃 + "'/><circle cx='77' cy='16' r='13' fill='" + 濃 + "'/>",
      しっぽ: "<circle cx='74' cy='105' r='7' fill='" + 濃 + "'/>" },
    { 名: "ひつじ",
      みみ: "<circle cx='26' cy='14' r='14'/><circle cx='50' cy='2' r='16'/><circle cx='74' cy='14' r='14'/>",
      しっぽ: "<circle cx='73' cy='104' r='8'/>" },
    /* ── 人間（2026-09-10・訴え「人間も 入れて いいし」）──────────
       ★ 髪は **後ろ（みみ）と 前（まえ）の 2 枚**で 描く。
         後ろだけだと 顔の 円に 隠れて 坊主に 見える。 */
    { 名: "人間・ショート",
      みみ: "<path d='M50 0c-24 0-36 16-36 38v26h72V38C86 16 74 0 50 0z'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 4-12 12-18 22-16l6 10 6-10c10-2 18 4 22 16C83 18 71 4 50 4z'/>",
      しっぽ: "" },
    { 名: "人間・ツインテール",
      みみ: "<path d='M50 0c-24 0-36 16-36 38v22h72V38C86 16 74 0 50 0z'/>"
        + "<ellipse cx='9' cy='58' rx='12' ry='24'/><ellipse cx='91' cy='58' rx='12' ry='24'/>"
        + "<circle cx='11' cy='32' r='9'/><circle cx='89' cy='32' r='9'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 5-13 13-19 23-17l5 11 5-11c10-2 18 4 23 17C83 18 71 4 50 4z'/>",
      しっぽ: "" },
    { 名: "人間・おだんご",
      みみ: "<circle cx='50' cy='-10' r='15'/>"
        + "<path d='M50 0c-24 0-36 16-36 38v20h72V38C86 16 74 0 50 0z'/>",
      まえ: "<path d='M50 4c-21 0-33 14-34 32 11-8 20-13 34-13s23 5 34 13C83 18 71 4 50 4z'/>",
      しっぽ: "" },
    /* ── オリジナル（訴え「オリジナルキャラクターとかも」）────────── */
    { 名: "スライム",
      みみ: "<path d='M50 -6c-4 10-10 12-10 18h20c0-6-6-8-10-18z'/>"
        + "<path d='M14 66q0-30 36-30t36 30q0 8-8 8H22q-8 0-8-8z' opacity='.55'/>",
      しっぽ: "<path d='M22 108q28 10 56 0v8q-28 10-56 0z' opacity='.6'/>" },
    { 名: "ほしのこ",
      みみ: "<path d='M50 -24l7.6 15.4 17 2.5-12.3 12 2.9 16.9L50 34.8 34.8 42.8l2.9-16.9-12.3-12 17-2.5z'/>",
      しっぽ: "<path d='M74 100l4 8 9 1.3-6.5 6.3 1.5 8.9-8-4.2-8 4.2 1.5-8.9-6.5-6.3 9-1.3z'/>" },
    { 名: "きのこ",
      みみ: "<path d='M50 -8c-24 0-38 16-38 30 0 6 6 8 38 8s38-2 38-8c0-14-14-30-38-30z'/>"
        + "<circle cx='30' cy='14' r='6' fill='#fff' stroke='none' opacity='.75'/>"
        + "<circle cx='62' cy='8' r='7' fill='#fff' stroke='none' opacity='.75'/>"
        + "<circle cx='74' cy='22' r='4.5' fill='#fff' stroke='none' opacity='.75'/>",
      しっぽ: "" }
  ];

  /* ── 服（からだ）。x30〜70・y72〜114 に 収める ── */
  var 服 = [
    /* ふつう */ function () {
      return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>";
    },
    /* パーカー */ function () {
      return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>"
        + "<path d='M36 70q14 14 28 0' fill='none'/>"
        + "<rect x='40' y='92' width='20' height='12' rx='4' fill='rgba(255,255,255,.3)'/>";
    },
    /* ワンピース */ function () {
      return "<path d='M50 68c-11 0-16 6-16 14l-8 26c-1 6 6 8 24 8s25-2 24-8l-8-26c0-8-5-14-16-14z'/>"
        + "<path d='M32 96h36' fill='none' stroke-width='2.6' opacity='.55'/>";
    },
    /* しましま */ function () {
      return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z'/>"
        + "<path d='M31 84h38M31 96h38' fill='none' stroke='rgba(255,255,255,.5)' stroke-width='6'/>";
    },
    /* つなぎ */ function () {
      return "<path d='M50 68c-13 0-20 8-20 20v18c0 6 4 10 20 10s20-4 20-10V88c0-12-7-20-20-20z' fill='" + 肌 + "'/>"
        + "<path d='M34 84h32v22c0 6-4 10-16 10s-16-4-16-10z'/>"
        + "<path d='M38 84V72M62 84V72' fill='none'/>";
    },
    /* マント */ function () {
      return "<path d='M50 66c-18 0-28 12-30 30l-4 22h68l-4-22c-2-18-12-30-30-30z' opacity='.9'/>"
        + "<path d='M50 68c-12 0-18 8-18 20v18c0 6 4 10 18 10s18-4 18-10V88c0-12-6-20-18-20z' fill='" + 肌 + "'/>";
    }
  ];

  /* ── うで（3 とおり）──
     ★ **2 度 描く**（2026-09-10 実測）。1 度だけだと 輪郭の 色（濃）で
       塗られて **黒い 棒**に 見える。太い 濃 の 上に 細い 肌 を 重ねる。 */
  function 腕(d) {
    return "<path d='" + d + "' fill='none' stroke='" + 濃 + "' stroke-width='13' stroke-linecap='round'/>"
      + "<path d='" + d + "' fill='none' stroke='" + 肌 + "' stroke-width='8' stroke-linecap='round'/>";
  }
  function 手(x, y, r0) {
    return "<circle cx='" + x + "' cy='" + y + "' r='" + r0 + "' fill='" + 肌
      + "' stroke='" + 濃 + "' stroke-width='3'/>";
  }
  var うで = [
    /* おろす */ function () {
      return 腕("M31 84q-8 6-7 18") + 腕("M69 84q8 6 7 18") + 手(24, 104, 6.5) + 手(76, 104, 6.5);
    },
    /* てをふる */ function () {
      return 腕("M31 84q-10 2-12-14") + 腕("M69 84q8 6 7 18") + 手(19, 68, 7) + 手(76, 104, 6.5);
    },
    /* こしに て */ function () {
      return 腕("M31 84q-12 4-6 16 4 5 10 3") + 腕("M69 84q12 4 6 16-4 5-10 3");
    }
  ];

  /* ── あし ── */
  function あし() {
    return "<rect x='36' y='106' width='11' height='18' rx='5.5' fill='" + 肌 + "'/>"
      + "<rect x='53' y='106' width='11' height='18' rx='5.5' fill='" + 肌 + "'/>"
      + "<ellipse cx='39' cy='124' rx='10' ry='6.5'/><ellipse cx='61' cy='124' rx='10' ry='6.5'/>";
  }

  /* ── 目 ── */
  var 目 = [
    "<circle cx='38' cy='40' r='5'/><circle cx='62' cy='40' r='5'/>"
      + "<circle cx='40' cy='38' r='1.8' fill='#fff'/><circle cx='64' cy='38' r='1.8' fill='#fff'/>",
    "<path d='M32 42q6-10 12 0' fill='none' stroke-width='4.4'/><path d='M56 42q6-10 12 0' fill='none' stroke-width='4.4'/>",
    "<path d='M38 33l2.4 5 5.4.8-4 3.8.9 5.4-4.7-2.5-4.7 2.5.9-5.4-4-3.8 5.4-.8z'/>"
      + "<path d='M62 33l2.4 5 5.4.8-4 3.8.9 5.4-4.7-2.5-4.7 2.5.9-5.4-4-3.8 5.4-.8z'/>",
    "<rect x='32' y='38' width='12' height='4.4' rx='2.2'/><rect x='56' y='38' width='12' height='4.4' rx='2.2'/>",
    "<circle cx='38' cy='40' r='5'/><circle cx='40' cy='38' r='1.8' fill='#fff'/>"
      + "<path d='M56 42q6-10 12 0' fill='none' stroke-width='4.4'/>",
    "<circle cx='37' cy='40' r='7'/><circle cx='63' cy='40' r='7'/>"
      + "<circle cx='40' cy='37' r='2.5' fill='#fff'/><circle cx='66' cy='37' r='2.5' fill='#fff'/>",
    "<path d='M32 40q6 8 12 0' fill='none' stroke-width='4.4'/><path d='M56 40q6 8 12 0' fill='none' stroke-width='4.4'/>",
    "<path d='M38 35a5 5 0 1 1-4.6 3' fill='none' stroke-width='3.2'/>"
      + "<path d='M62 35a5 5 0 1 1-4.6 3' fill='none' stroke-width='3.2'/>"
  ];

  /* ── 口 ── */
  var 口 = [
    "<path d='M43 53q7 9 14 0' fill='none' stroke-width='4.2'/>",
    "<ellipse cx='50' cy='55' rx='5' ry='6'/>",
    "<rect x='44' y='53' width='12' height='4' rx='2'/>",
    "<path d='M43 52q3.5 5 7 0' fill='none' stroke-width='3.6'/><path d='M50 52q3.5 5 7 0' fill='none' stroke-width='3.6'/>",
    "<path d='M43 58q7-9 14 0' fill='none' stroke-width='4.2'/>",
    "<path d='M41 52q10 10 19 1' fill='none' stroke-width='4'/>",
    "<path d='M43 52q7 8 14 0' fill='none' stroke-width='4'/>"
      + "<path d='M49 57q4 7 8 1z' fill='#E5484D' stroke='none'/>"
  ];

  /* ── 飾り ── */
  var 飾り = [
    function () { return ""; },
    /* とんがり帽 */ function (c) {
      return "<path d='M50 -22L70 10H30z' fill='" + c + 線 + "/>"
        + "<circle cx='50' cy='-22' r='5' fill='#fff'" + 線 + "/>";
    },
    /* リボン */ function () {
      return "<g transform='translate(72,14)'><path d='M0 0L-13-8v16z' fill='#E93D82'" + 線 + "/>"
        + "<path d='M0 0l13-8v16z' fill='#E93D82'" + 線 + "/>"
        + "<circle cx='0' cy='0' r='4' fill='#fff'" + 線 + "/></g>";
    },
    /* めがね */ function () {
      return "<g fill='none' stroke='" + 濃 + "' stroke-width='2.8'>"
        + "<circle cx='38' cy='40' r='11'/><circle cx='62' cy='40' r='11'/>"
        + "<path d='M49 40h4M27 38l-6-3M73 38l6-3'/></g>";
    },
    /* ヘッドホン */ function (c) {
      return "<path d='M20 40a30 30 0 0 1 60 0' fill='none' stroke='" + 濃 + "' stroke-width='6'/>"
        + "<rect x='11' y='36' width='15' height='22' rx='7' fill='" + c + 線 + "/>"
        + "<rect x='74' y='36' width='15' height='22' rx='7' fill='" + c + 線 + "/>";
    },
    /* 王冠 */ function () {
      return "<path d='M30 12l6-18 8 11 6-15 6 15 8-11 6 18z' fill='#FFB224'" + 線 + "/>"
        + "<circle cx='50' cy='-12' r='3.4' fill='#E93D82' stroke='none'/>";
    },
    /* マフラー */ function (c) {
      return "<path d='M30 66q20 10 40 0v9q-20 10-40 0z' fill='" + c + 線 + "/>"
        + "<path d='M62 74l7 20 9-4-7-18z' fill='" + c + 線 + "/>";
    },
    /* おはな */ function () {
      return "<g transform='translate(74,16)'>"
        + "<circle cx='0' cy='-7' r='5' fill='#E93D82'/><circle cx='6.6' cy='-2.2' r='5' fill='#E93D82'/>"
        + "<circle cx='4.1' cy='5.7' r='5' fill='#E93D82'/><circle cx='-4.1' cy='5.7' r='5' fill='#E93D82'/>"
        + "<circle cx='-6.6' cy='-2.2' r='5' fill='#E93D82'/><circle cx='0' cy='0' r='3.6' fill='#FFB224'/></g>";
    },
    /* はね（背中） */ function () {
      return "<path d='M28 78q-20-14-22 4 12 6 22 2z' fill='#fff' opacity='.9'" + 線 + "/>"
        + "<path d='M72 78q20-14 22 4-12 6-22 2z' fill='#fff' opacity='.9'" + 線 + "/>";
    }
  ];

  /* 数 1 つ から すべてを 割り出す。 */
  function 顔(face, c) {
    var n = Math.max(0, Number(face) || 0);
    var sg = すがた[n % すがた.length];
    var fk = 服[Math.floor(n / 10) % 服.length];
    var ud = うで[Math.floor(n / 60) % うで.length];
    var me = 目[Math.floor(n / 180) % 目.length];
    var kt = 口[Math.floor(n / 1440) % 口.length];
    var kz = 飾り[Math.floor(n / 10080) % 飾り.length];
    var ho = Math.floor(n / 90720) % 2;
    var 塗 = " fill='" + c + "' stroke='" + 濃 + "' stroke-width='3' stroke-linejoin='round' stroke-linecap='round'";
    return "<svg viewBox='-8 -30 116 168' class='vqlf' aria-hidden='true'>"
      + "<g" + 塗 + ">"
      + sg.しっぽ                       /* しっぽ（いちばん 後ろ） */
      + あし()
      + fk(c)                           /* 服 */
      + ud()                            /* うで */
      + sg.みみ                         /* みみ・つの（頭の 後ろ） */
      + "</g>"
      /* 顔 */
      + "<circle cx='50' cy='40' r='29' fill='" + 肌 + "' stroke='" + 濃 + "' stroke-width='3'/>"
      /* ★ 前髪は **顔の 前**（後ろだけだと 顔の 円に 隠れて 坊主に 見える） */
      + (sg.まえ ? "<g" + 塗 + ">" + sg.まえ + "</g>" : "")
      + (ho ? "<ellipse cx='29' cy='48' rx='6.5' ry='4.2' fill='#E93D82' opacity='.45'/>"
            + "<ellipse cx='71' cy='48' rx='6.5' ry='4.2' fill='#E93D82' opacity='.45'/>" : "")
      + "<g fill='" + 濃 + "' stroke='" + 濃 + "' stroke-linecap='round'>" + me + kt + "</g>"
      + kz(c)
      + "</svg>";
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
    ".vqw-grid{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 16px 20px;",
      "display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));align-content:start;}",
    ".vqw-t{position:relative;aspect-ratio:16/11;border-radius:14px;overflow:hidden;",
      "background:var(--vq-surface-sunken,#1a1728);display:flex;align-items:center;justify-content:center;}",
    /* ★ 裏の ボカシ。**同じ 絵を 大きく 引き伸ばして ぼかす**（Discord と 同じ 作り）。 */
    ".vqw-bg{position:absolute;inset:-26%;filter:blur(24px) saturate(1.6);opacity:.5;",
      "display:flex;align-items:center;justify-content:center;}",
    ".vqw-bg .vqlf{width:100%;height:100%;}",
    ".vqw-av{position:relative;z-index:2;width:46%;max-width:96px;aspect-ratio:1;border-radius:999px;",
      "display:flex;align-items:center;justify-content:center;overflow:visible;",
      "box-shadow:0 8px 22px rgba(0,0,0,.32);}",
    ".vqw-av .vqlf{width:100%;height:100%;display:block;}",
    ".vqw-name{position:absolute;left:8px;bottom:8px;z-index:3;max-width:calc(100% - 16px);",
      "padding:3px 9px;border-radius:8px;background:rgba(10,8,20,.7);color:#fff;",
      "font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".vqw-badge{position:absolute;right:8px;top:8px;z-index:3;height:20px;padding:0 8px;border-radius:999px;",
      "background:rgba(10,8,20,.62);color:#fff;font-size:10.5px;font-weight:750;",
      "display:inline-flex;align-items:center;}",
    ".vqw-t.is-host{outline:2px solid var(--vq-accent,#756DB3);outline-offset:-2px;}",
    ".vqw-t.is-off{opacity:.42;}",
    ".vqw-more{display:flex;align-items:center;justify-content:center;border-radius:14px;",
      "background:var(--vq-surface-sunken,#1a1728);aspect-ratio:16/11;font-size:14px;font-weight:750;",
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
      + "<div class='vqw-h'></div><div class='vqw-grid'></div><div class='vqw-foot'></div></div>";
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
            + " style='background:linear-gradient(158deg," + c + "," + c + "b0)'"
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
            : "<span class='vqlb-av' style='background:" + 色(p.color) + "'>" + 顔(p.face, 色(p.color)) + "</span>";
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
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + 顔(r.face, 色(r.color))
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
          return "<div><span class='vqlb-av' style='background:" + 色(r.color) + "'>" + 顔(r.face, 色(r.color))
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

  root.__vqParty = {
    開く: 開く,
    作る: function (preset) { 作る画面(preset); },
    入る: function (pin) { 入る画面(pin || ""); },
    いま: 状態
  };
})();
