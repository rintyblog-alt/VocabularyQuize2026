/* ══════════════════════════════════════════════════════════════════════
   design/font-pairs.js — 書体の組み合わせ 24 組

   ★ ここに並ぶ id は **すべて同梱**（client/fonts/css/<id>.css）。
     端末に入っているかは関係なく、選べば必ずその形で出る。
   ★ body（本文）に置いてよいのは
       ・400 と 700 の両方が実体としてある
       ・和文は 和文グリフを持つもの
     だけ。飾りの強い書体は display にしか置かない。
   ★ 欧文と和文を **並べて 1 つの stack** にする。
     "Anton","Noto Sans JP",sans-serif のように、
     英数は欧文の顔、かなと漢字は和文の顔になる。
   ★ 同じ性格（genre）が 5 組以上にならないようにしてある。
     この決まりは design/checks の試験で機械的に見張る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* w: 実体としてあるウェイト（build 時に css を読んで確かめた値） */
  var P = [
    { id: 0, 名: "静かで正確", genre: "ui", 印象: "画面のUIのような端正さ。数字が読みやすい",
      display: "inter", body: "inter", mono: "jetbrainsmono",
      jpDisplay: "zenkakugothicnew", jpBody: "notosansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 1, 名: "洗練・幾何", genre: "geometric", 印象: "Futura 風。上品で少し冷たい",
      display: "jost", body: "jost", mono: "dmmono",
      jpDisplay: "zenkakugothicnew", jpBody: "murecho",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 2, 名: "強い断言", genre: "condensed", 印象: "極太の見出しで言い切る。宣言や表紙向き",
      display: "anton", body: "worksans", mono: "robotomono",
      jpDisplay: "delagothicone", jpBody: "notosansjp",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 3, 名: "やさしく確実", genre: "humanist", 印象: "学習教材。読み間違えにくい",
      display: "lexend", body: "lexend", mono: "sourcecodepro",
      jpDisplay: "zenkakugothicnew", jpBody: "bizudpgothic",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 4, 名: "格式", genre: "display-serif", 印象: "古典的で改まった場。式典や提案書",
      display: "playfairdisplay", body: "ebgaramond", mono: "ibmplexmono",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 5, 名: "誌面らしい", genre: "display-serif", 印象: "雑誌の特集。見出しが華やか",
      display: "abrilfatface", body: "literata", mono: "courierprime",
      jpDisplay: "zenantique", jpBody: "zenoldmincho",
      weightRange: { display: [400], body: [400, 700] } },
    { id: 6, 名: "技術的", genre: "mono-tech", 印象: "開発者向け資料。等幅が馴染む",
      display: "spacegrotesk", body: "ibmplexsans", mono: "ibmplexmono",
      jpDisplay: "ibmplexsansjp", jpBody: "ibmplexsansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 7, 名: "親しみ・まるい", genre: "rounded", 印象: "角がない。子どもや初学者に向く",
      display: "quicksand", body: "nunito", mono: "dmmono",
      jpDisplay: "zenmarugothic", jpBody: "mplusrounded1c",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 8, 名: "報道", genre: "condensed", 印象: "新聞の紙面。事実を淡々と並べる",
      display: "oswald", body: "newsreader", mono: "robotomono",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 600, 700], body: [400, 700] } },
    { id: 9, 名: "先進", genre: "mono-tech", 印象: "少し近未来。プロダクト発表向き",
      display: "sora", body: "manrope", mono: "spacemono",
      jpDisplay: "mplus2", jpBody: "mplus2",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 10, 名: "手作り", genre: "handwriting", 印象: "手書きの温度。ワークショップや部活",
      display: "caveat", body: "cabin", mono: "courierprime",
      jpDisplay: "yomogi", jpBody: "zenmarugothic",
      weightRange: { display: [400, 700], body: [400, 600, 700] } },
    { id: 11, 名: "硬質", genre: "slab", 印象: "スラブセリフ。工業・実務の硬さ",
      display: "robotoslab", body: "bitter", mono: "robotomono",
      jpDisplay: "zenkakugothicantique", jpBody: "bizudgothic",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 12, 名: "掲示・大声", genre: "condensed", 印象: "ポスター。遠くから読ませる",
      display: "bebasneue", body: "barlowcondensed", mono: "spacemono",
      jpDisplay: "mochiypopone", jpBody: "mplus2",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 13, 名: "端正", genre: "oldstyle-serif", 印象: "細部まで整った明朝。落ち着いた報告",
      display: "frankruhllibre", body: "sourceserif4", mono: "ibmplexmono",
      jpDisplay: "zenoldmincho", jpBody: "bizudpmincho",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 14, 名: "抜け感", genre: "display-serif", 印象: "細い明朝の見出しに 素直なゴシック本文",
      display: "dmserifdisplay", body: "dmsans", mono: "dmmono",
      jpDisplay: "hinamincho", jpBody: "notosansjp",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 15, 名: "学術", genre: "oldstyle-serif", 印象: "論文や研究発表。長い文が読める",
      display: "crimsonpro", body: "crimsonpro", mono: "courierprime",
      jpDisplay: "shipporimincho", jpBody: "notoserifjp",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 16, 名: "楽しい", genre: "rounded", 印象: "明るくポップ。イベントや告知",
      display: "fredoka", body: "rubik", mono: "dmmono",
      jpDisplay: "pottaone", jpBody: "mplusrounded1c",
      weightRange: { display: [400, 700], body: [400, 600, 700] } },
    { id: 17, 名: "中立・公的", genre: "ui", 印象: "役所や学校の配布物。癖を出さない",
      display: "publicsans", body: "publicsans", mono: "sourcecodepro",
      jpDisplay: "bizudgothic", jpBody: "bizudpgothic",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 18, 名: "温かい主張", genre: "display-serif", 印象: "少し癖のあるセリフ。個人の言葉",
      display: "fraunces", body: "vollkorn", mono: "ibmplexmono",
      jpDisplay: "kaiseitokumin", jpBody: "zenoldmincho",
      weightRange: { display: [400, 700], body: [400, 700] } },
    { id: 19, 名: "明快", genre: "geometric", 印象: "表紙が映える定番。誰にでも通じる",
      display: "montserrat", body: "opensans", mono: "robotomono",
      jpDisplay: "zenkakugothicnew", jpBody: "notosansjp",
      weightRange: { display: [400, 600, 700], body: [400, 600, 700] } },
    { id: 20, 名: "和の趣", genre: "jp-retro", 印象: "毛筆調の題字。和のテーマや行事",
      display: "youngserif", body: "spectral", mono: "courierprime",
      jpDisplay: "yujisyuku", jpBody: "zenoldmincho",
      weightRange: { display: [400], body: [400, 700] } },
    { id: 21, 名: "余白・ミニマル", genre: "ui", 印象: "線が細い。ほとんど何も足さない",
      display: "instrumentserif", body: "karla", mono: "inconsolata",
      jpDisplay: "stick", jpBody: "murecho",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 22, 名: "レトロ看板", genre: "jp-retro", 印象: "昭和の看板。縁取りの太い題字",
      display: "righteous", body: "archivo", mono: "spacemono",
      jpDisplay: "trainone", jpBody: "mplus1p",
      weightRange: { display: [400], body: [400, 600, 700] } },
    { id: 23, 名: "教科書", genre: "oldstyle-serif", 印象: "教科書体。書き取りや国語の教材",
      display: "librebaskerville", body: "lato", mono: "courierprime",
      jpDisplay: "kleeone", jpBody: "bizudpmincho",
      weightRange: { display: [400, 700], body: [400, 700] } }
  ];

  /* 役目ごとの stack（欧文 → 和文 → 総称）。
     ここで返す id は そのまま /fonts/css/<id>.css へ対応する。 */
  function stack(pairIndex, role) {
    var p = P[((pairIndex | 0) % P.length + P.length) % P.length];
    if (role === "mono") return [p.mono, p.jpBody];
    if (role === "display") return [p.display, p.jpDisplay];
    return [p.body, p.jpBody];
  }
  function of(i) { return P[((i | 0) % P.length + P.length) % P.length]; }

  /* 性格の一覧（LLM へ渡す説明文。**書体名は渡さない**） */
  function 一覧() {
    return P.map(function (p) { return { fontPair: p.id, 性格: p.名, 印象: p.印象 }; });
  }

  VQD.fontPairs = P;
  VQD.fonts = { of: of, stack: stack, 一覧: 一覧 };
})(typeof globalThis !== "undefined" ? globalThis : this);
