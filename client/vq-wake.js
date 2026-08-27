/* ══════════════════════════════════════════════════════════════════════
   「ルミ」と呼ばれたかどうかを判じる。

   ★ **推測で作っていない。** iPhone（iOS 18.7 / Safari 26.6）で実際に
     「ルミ」と 3 回言ったときに、端末が返してきた字を全部並べて作った:

       ルビー / 海・海海・海海海 / るみ / エルミ・エル海・恵海・エミ・恵み
       テルミ・ヘルミ・テイルミ / オイル

     23 回のうち「るみ」だったのは 4 回だけ。残りは全部よそへ行っている。
     日本語の聞き取りは短い言葉に弱く、しかも **漢字で返す**。
     「るみ」だけを見ていたら、当たらないのが当たり前だった。

   ★ 二段にする。
       近い（strong）: まず間違いなく呼びかけ。言葉の長さを問わない。
       似た音（weak）: 「海」「恵み」のようによその意味も持つ字。
                       **一言だけのとき**しか採らない（普通の会話で誤って
                       始まらないようにするため）。

   ★ このファイルは **アプリと診断ページの両方**が読む。
     片方だけ直して食い違う、を防ぐため。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  /* ── 近い音：これが出たら 長さを問わず呼びかけとみなす ────────── */
  var STRONG = [
    /* そのもの */
    "るみ", "るーみ", "るうみ", "ろみ", "るび", "るびー", "るーび",
    /* 「ヘイ ルミ」がくっついた形（実測） */
    "へるみ", "てるみ", "ているみ", "えるみ", "へいるみ", "へいるび",
    /* 人名の当て字（聞き取りは人名に寄せてくる） */
    "留美", "瑠美", "流美", "琉美", "留実", "瑠海", "留海", "流海",
    "ルミ", "ルーミ",
    /* 英語で返ってくる場合 */
    "lumi", "loomi", "rumi", "roomi", "lumy", "ruumi", "lumie", "roomie"
  ];

  /* ── 似た音：一言だけのときに限って採る ──────────────────────
     「ルミ」は「うみ」と紛れる。「海」はその漢字。
     「恵み（めぐみ）」「エミ」も実測で出た。
     ★ よその意味を持つので、**短いときだけ**。 */
  var WEAK = [
    "うみ", "えみ", "ゆみ", "くみ", "むみ", "ぬみ",
    "海", "恵", "恵み", "膿", "産み", "生み", "弓", "笑み",
    "おいる", "える", "へい", "えるび"
  ];

  var STRONG_RE = new RegExp(STRONG.join("|"));
  var WEAK_RE = new RegExp(WEAK.join("|"));

  function kata2hira(t) {
    return String(t || "").replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  /* 記号・空白・伸ばし棒を落とす。「ルー ミ」「る・み」でも当たるように。 */
  function tidy(t) {
    return String(t || "").replace(/[\s　、。,.!！?？「」『』・ー…〜~\-]/g, "");
  }
  /* 同じ字の繰り返しを 1 つに畳む。「海海海」→「海」（実測で出た形）。 */
  function fold(t) {
    return t.replace(/(.)\1+/g, "$1");
  }

  /* 呼びかけか？ 返すのは真偽。 */
  function isWake(raw) {
    return !!why(raw).hit;
  }

  /* なぜそう判じたかも返す（診断ページで見せるため）。 */
  function why(raw) {
    var src = tidy(String(raw || ""));
    if (!src) return { hit: false, reason: "空" };
    if (src.length > 16) return { hit: false, reason: "長すぎる（呼びかけではない）" };

    var hira = kata2hira(src.toLowerCase());
    var cand = [src, hira, fold(src), fold(hira)];

    /* ★ 近い音でも、**文の途中に埋もれている**なら呼びかけではない。
       「くるみパンを買ってきた」の「るみ」で起きてはいけない（実際に起きた）。
       頭にあるか、ぜんぶで一言ぶんの短さなら呼びかけとみなす。 */
    for (var i = 0; i < cand.length; i++) {
      var m = cand[i].match(STRONG_RE);
      if (!m) continue;
      if (m.index === 0 || cand[i].length <= 8) {
        return { hit: true, reason: "近い音", 見た字: cand[i] };
      }
    }
    /* 似た音は **一言だけ**のときに限る（畳んだあとで 6 字まで）。 */
    var shortEnough = fold(hira).length <= 6;
    if (shortEnough) {
      for (var j = 0; j < cand.length; j++) {
        if (WEAK_RE.test(cand[j])) return { hit: true, reason: "似た音（一言だけ）", 見た字: cand[j] };
      }
      return { hit: false, reason: "当たらない（短いが似ていない）" };
    }
    return { hit: false, reason: "当たらない" };
  }

  var API = { isWake: isWake, why: why, STRONG: STRONG, WEAK: WEAK };
  root.VQ_WAKE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
