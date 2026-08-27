/* ══════════════════════════════════════════════════════════════════════
   同梱している書体の一覧（build-fonts.mjs が作る。手で直さないこと）

   ここに並んでいるものは **すべて実体を配ってある**。
   端末に入っているかは関係なく、選べば必ずその形で出る。
   実体は /fonts/css/<id>.css を読み込んだ時点で効き始める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  WP.fontData = [
 {
  "id": "anton",
  "family": "Anton",
  "group": "欧文 サンセリフ",
  "label": "Anton",
  "note": "極太。一言のキャッチに",
  "generic": "sans-serif",
  "css": "/fonts/css/anton.css"
 },
 {
  "id": "archivo",
  "family": "Archivo",
  "group": "欧文 サンセリフ",
  "label": "Archivo",
  "note": "やや幅広で力強い見出し向け",
  "generic": "sans-serif",
  "css": "/fonts/css/archivo.css"
 },
 {
  "id": "barlowcondensed",
  "family": "Barlow Condensed",
  "group": "欧文 サンセリフ",
  "label": "Barlow Condensed",
  "note": "表や狭い欄に詰めて置く",
  "generic": "sans-serif",
  "css": "/fonts/css/barlowcondensed.css"
 },
 {
  "id": "bebasneue",
  "family": "Bebas Neue",
  "group": "欧文 サンセリフ",
  "label": "Bebas Neue",
  "note": "大文字だけの強い見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/bebasneue.css"
 },
 {
  "id": "bricolagegrotesque",
  "family": "Bricolage Grotesque",
  "group": "欧文 サンセリフ",
  "label": "Bricolage Grotesque",
  "note": "個性の強い見出しや扉に",
  "generic": "sans-serif",
  "css": "/fonts/css/bricolagegrotesque.css"
 },
 {
  "id": "cabin",
  "family": "Cabin",
  "group": "欧文 サンセリフ",
  "label": "Cabin",
  "note": "人文的でやさしい説明文",
  "generic": "sans-serif",
  "css": "/fonts/css/cabin.css"
 },
 {
  "id": "chivo",
  "family": "Chivo",
  "group": "欧文 サンセリフ",
  "label": "Chivo",
  "note": "力強い見出しや字幕向け",
  "generic": "sans-serif",
  "css": "/fonts/css/chivo.css"
 },
 {
  "id": "dmsans",
  "family": "DM Sans",
  "group": "欧文 サンセリフ",
  "label": "DM Sans",
  "note": "小さい字でも整うUI向け",
  "generic": "sans-serif",
  "css": "/fonts/css/dmsans.css"
 },
 {
  "id": "ibmplexsans",
  "family": "IBM Plex Sans",
  "group": "欧文 サンセリフ",
  "label": "IBM Plex Sans",
  "note": "コードと並べる技術資料に",
  "generic": "sans-serif",
  "css": "/fonts/css/ibmplexsans.css"
 },
 {
  "id": "inter",
  "family": "Inter",
  "group": "欧文 サンセリフ",
  "label": "Inter",
  "note": "画面のUIと本文に最も無難",
  "generic": "sans-serif",
  "css": "/fonts/css/inter.css"
 },
 {
  "id": "josefinsans",
  "family": "Josefin Sans",
  "group": "欧文 サンセリフ",
  "label": "Josefin Sans",
  "note": "装飾的。ロゴや扉ページ",
  "generic": "sans-serif",
  "css": "/fonts/css/josefinsans.css"
 },
 {
  "id": "jost",
  "family": "Jost",
  "group": "欧文 サンセリフ",
  "label": "Jost",
  "note": "Futura風。上品な表紙に",
  "generic": "sans-serif",
  "css": "/fonts/css/jost.css"
 },
 {
  "id": "karla",
  "family": "Karla",
  "group": "欧文 サンセリフ",
  "label": "Karla",
  "note": "少し癖のある小見出し向け",
  "generic": "sans-serif",
  "css": "/fonts/css/karla.css"
 },
 {
  "id": "lato",
  "family": "Lato",
  "group": "欧文 サンセリフ",
  "label": "Lato",
  "note": "やわらかく温かみのある本文",
  "generic": "sans-serif",
  "css": "/fonts/css/lato.css"
 },
 {
  "id": "lexend",
  "family": "Lexend",
  "group": "欧文 サンセリフ",
  "label": "Lexend",
  "note": "読みやすさ重視。学習教材に",
  "generic": "sans-serif",
  "css": "/fonts/css/lexend.css"
 },
 {
  "id": "manrope",
  "family": "Manrope",
  "group": "欧文 サンセリフ",
  "label": "Manrope",
  "note": "見出しと本文を1書体で",
  "generic": "sans-serif",
  "css": "/fonts/css/manrope.css"
 },
 {
  "id": "montserrat",
  "family": "Montserrat",
  "group": "欧文 サンセリフ",
  "label": "Montserrat",
  "note": "大きな見出しや表紙に映える",
  "generic": "sans-serif",
  "css": "/fonts/css/montserrat.css"
 },
 {
  "id": "notosans",
  "family": "Noto Sans",
  "group": "欧文 サンセリフ",
  "label": "Noto Sans",
  "note": "日本語と混ぜても崩れない",
  "generic": "sans-serif",
  "css": "/fonts/css/notosans.css"
 },
 {
  "id": "nunito",
  "family": "Nunito",
  "group": "欧文 サンセリフ",
  "label": "Nunito",
  "note": "先端が丸い。低学年の本文",
  "generic": "sans-serif",
  "css": "/fonts/css/nunito.css"
 },
 {
  "id": "opensans",
  "family": "Open Sans",
  "group": "欧文 サンセリフ",
  "label": "Open Sans",
  "note": "長い読み物の本文に安定",
  "generic": "sans-serif",
  "css": "/fonts/css/opensans.css"
 },
 {
  "id": "oswald",
  "family": "Oswald",
  "group": "欧文 サンセリフ",
  "label": "Oswald",
  "note": "狭い幅で大きく見せる見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/oswald.css"
 },
 {
  "id": "outfit",
  "family": "Outfit",
  "group": "欧文 サンセリフ",
  "label": "Outfit",
  "note": "均一な幾何学。UIの見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/outfit.css"
 },
 {
  "id": "plusjakartasans",
  "family": "Plus Jakarta Sans",
  "group": "欧文 サンセリフ",
  "label": "Plus Jakarta Sans",
  "note": "今どきのアプリ画面向け",
  "generic": "sans-serif",
  "css": "/fonts/css/plusjakartasans.css"
 },
 {
  "id": "poppins",
  "family": "Poppins",
  "group": "欧文 サンセリフ",
  "label": "Poppins",
  "note": "円形基調で明るい見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/poppins.css"
 },
 {
  "id": "publicsans",
  "family": "Public Sans",
  "group": "欧文 サンセリフ",
  "label": "Public Sans",
  "note": "公的な資料や説明文に中立",
  "generic": "sans-serif",
  "css": "/fonts/css/publicsans.css"
 },
 {
  "id": "quicksand",
  "family": "Quicksand",
  "group": "欧文 サンセリフ",
  "label": "Quicksand",
  "note": "丸くやさしい。子ども向け",
  "generic": "sans-serif",
  "css": "/fonts/css/quicksand.css"
 },
 {
  "id": "roboto",
  "family": "Roboto",
  "group": "欧文 サンセリフ",
  "label": "Roboto",
  "note": "汎用。数字や表が読みやすい",
  "generic": "sans-serif",
  "css": "/fonts/css/roboto.css"
 },
 {
  "id": "rubik",
  "family": "Rubik",
  "group": "欧文 サンセリフ",
  "label": "Rubik",
  "note": "角が丸く親しみやすい見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/rubik.css"
 },
 {
  "id": "sora",
  "family": "Sora",
  "group": "欧文 サンセリフ",
  "label": "Sora",
  "note": "角ばった近未来的な見出し",
  "generic": "sans-serif",
  "css": "/fonts/css/sora.css"
 },
 {
  "id": "sourcesans3",
  "family": "Source Sans 3",
  "group": "欧文 サンセリフ",
  "label": "Source Sans 3",
  "note": "配布資料や技術文書の本文",
  "generic": "sans-serif",
  "css": "/fonts/css/sourcesans3.css"
 },
 {
  "id": "spacegrotesk",
  "family": "Space Grotesk",
  "group": "欧文 サンセリフ",
  "label": "Space Grotesk",
  "note": "理系・技術系の見出しに個性",
  "generic": "sans-serif",
  "css": "/fonts/css/spacegrotesk.css"
 },
 {
  "id": "worksans",
  "family": "Work Sans",
  "group": "欧文 サンセリフ",
  "label": "Work Sans",
  "note": "画面上の長めの本文に",
  "generic": "sans-serif",
  "css": "/fonts/css/worksans.css"
 },
 {
  "id": "alegreya",
  "family": "Alegreya",
  "group": "欧文 セリフ",
  "label": "Alegreya",
  "note": "手書きの温かみが残る長文本文",
  "generic": "serif",
  "css": "/fonts/css/alegreya.css"
 },
 {
  "id": "bitter",
  "family": "Bitter",
  "group": "欧文 セリフ",
  "label": "Bitter",
  "note": "画面向きのスラブで本文も可",
  "generic": "serif",
  "css": "/fonts/css/bitter.css"
 },
 {
  "id": "bodonimoda",
  "family": "Bodoni Moda",
  "group": "欧文 セリフ",
  "label": "Bodoni Moda",
  "note": "線の強弱が際立つ雑誌風見出し",
  "generic": "serif",
  "css": "/fonts/css/bodonimoda.css"
 },
 {
  "id": "cardo",
  "family": "Cardo",
  "group": "欧文 セリフ",
  "label": "Cardo",
  "note": "古典語や引用の多い資料向け",
  "generic": "serif",
  "css": "/fonts/css/cardo.css"
 },
 {
  "id": "cormorantgaramond",
  "family": "Cormorant Garamond",
  "group": "欧文 セリフ",
  "label": "Cormorant Garamond",
  "note": "細く優美、大きめの見出し向き",
  "generic": "serif",
  "css": "/fonts/css/cormorantgaramond.css"
 },
 {
  "id": "crimsonpro",
  "family": "Crimson Pro",
  "group": "欧文 セリフ",
  "label": "Crimson Pro",
  "note": "学術書のような読み物本文に",
  "generic": "serif",
  "css": "/fonts/css/crimsonpro.css"
 },
 {
  "id": "dmserifdisplay",
  "family": "DM Serif Display",
  "group": "欧文 セリフ",
  "label": "DM Serif Display",
  "note": "短い大見出し専用の華やかさ",
  "generic": "serif",
  "css": "/fonts/css/dmserifdisplay.css"
 },
 {
  "id": "ebgaramond",
  "family": "EB Garamond",
  "group": "欧文 セリフ",
  "label": "EB Garamond",
  "note": "古典的で落ち着いた長文本文に",
  "generic": "serif",
  "css": "/fonts/css/ebgaramond.css"
 },
 {
  "id": "frankruhllibre",
  "family": "Frank Ruhl Libre",
  "group": "欧文 セリフ",
  "label": "Frank Ruhl Libre",
  "note": "端正で硬めの見出しと小見出し",
  "generic": "serif",
  "css": "/fonts/css/frankruhllibre.css"
 },
 {
  "id": "fraunces",
  "family": "Fraunces",
  "group": "欧文 セリフ",
  "label": "Fraunces",
  "note": "個性を出したい表紙や見出しに",
  "generic": "serif",
  "css": "/fonts/css/fraunces.css"
 },
 {
  "id": "instrumentserif",
  "family": "Instrument Serif",
  "group": "欧文 セリフ",
  "label": "Instrument Serif",
  "note": "抜け感のある大きめの表題に",
  "generic": "serif",
  "css": "/fonts/css/instrumentserif.css"
 },
 {
  "id": "librebaskerville",
  "family": "Libre Baskerville",
  "group": "欧文 セリフ",
  "label": "Libre Baskerville",
  "note": "画面で読ませる教材本文に最適",
  "generic": "serif",
  "css": "/fonts/css/librebaskerville.css"
 },
 {
  "id": "literata",
  "family": "Literata",
  "group": "欧文 セリフ",
  "label": "Literata",
  "note": "電子書籍風の落ち着いた長文に",
  "generic": "serif",
  "css": "/fonts/css/literata.css"
 },
 {
  "id": "lora",
  "family": "Lora",
  "group": "欧文 セリフ",
  "label": "Lora",
  "note": "柔らかく上品な記事やコラムに",
  "generic": "serif",
  "css": "/fonts/css/lora.css"
 },
 {
  "id": "merriweather",
  "family": "Merriweather",
  "group": "欧文 セリフ",
  "label": "Merriweather",
  "note": "小さい字でも読み崩れない本文",
  "generic": "serif",
  "css": "/fonts/css/merriweather.css"
 },
 {
  "id": "newsreader",
  "family": "Newsreader",
  "group": "欧文 セリフ",
  "label": "Newsreader",
  "note": "新聞記事のような読み物向け",
  "generic": "serif",
  "css": "/fonts/css/newsreader.css"
 },
 {
  "id": "notoserif",
  "family": "Noto Serif",
  "group": "欧文 セリフ",
  "label": "Noto Serif",
  "note": "多言語が混ざる配布資料の本文",
  "generic": "serif",
  "css": "/fonts/css/notoserif.css"
 },
 {
  "id": "ptserif",
  "family": "PT Serif",
  "group": "欧文 セリフ",
  "label": "PT Serif",
  "note": "欧文キリル混在の資料に強い",
  "generic": "serif",
  "css": "/fonts/css/ptserif.css"
 },
 {
  "id": "petrona",
  "family": "Petrona",
  "group": "欧文 セリフ",
  "label": "Petrona",
  "note": "軽やかで細身、余白の多い誌面に",
  "generic": "serif",
  "css": "/fonts/css/petrona.css"
 },
 {
  "id": "playfairdisplay",
  "family": "Playfair Display",
  "group": "欧文 セリフ",
  "label": "Playfair Display",
  "note": "華やかな表紙やタイトルに",
  "generic": "serif",
  "css": "/fonts/css/playfairdisplay.css"
 },
 {
  "id": "robotoslab",
  "family": "Roboto Slab",
  "group": "欧文 セリフ",
  "label": "Roboto Slab",
  "note": "硬質で明快なスラブの見出し",
  "generic": "serif",
  "css": "/fonts/css/robotoslab.css"
 },
 {
  "id": "sourceserif4",
  "family": "Source Serif 4",
  "group": "欧文 セリフ",
  "label": "Source Serif 4",
  "note": "UIに馴染む堅実な明朝系本文",
  "generic": "serif",
  "css": "/fonts/css/sourceserif4.css"
 },
 {
  "id": "spectral",
  "family": "Spectral",
  "group": "欧文 セリフ",
  "label": "Spectral",
  "note": "画面での長文読書に合う本文",
  "generic": "serif",
  "css": "/fonts/css/spectral.css"
 },
 {
  "id": "vollkorn",
  "family": "Vollkorn",
  "group": "欧文 セリフ",
  "label": "Vollkorn",
  "note": "力強く親しみやすい本文と小見出し",
  "generic": "serif",
  "css": "/fonts/css/vollkorn.css"
 },
 {
  "id": "youngserif",
  "family": "Young Serif",
  "group": "欧文 セリフ",
  "label": "Young Serif",
  "note": "太く素朴、目を引く見出しに",
  "generic": "serif",
  "css": "/fonts/css/youngserif.css"
 },
 {
  "id": "zillaslab",
  "family": "Zilla Slab",
  "group": "欧文 セリフ",
  "label": "Zilla Slab",
  "note": "技術資料や表組みに合うスラブ",
  "generic": "serif",
  "css": "/fonts/css/zillaslab.css"
 },
 {
  "id": "abrilfatface",
  "family": "Abril Fatface",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Abril Fatface",
  "note": "雑誌風の優雅な大見出し",
  "generic": "fantasy",
  "css": "/fonts/css/abrilfatface.css"
 },
 {
  "id": "alfaslabone",
  "family": "Alfa Slab One",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Alfa Slab One",
  "note": "太いスラブの装飾見出し",
  "generic": "fantasy",
  "css": "/fonts/css/alfaslabone.css"
 },
 {
  "id": "archivoblack",
  "family": "Archivo Black",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Archivo Black",
  "note": "重量感のある短い見出し",
  "generic": "fantasy",
  "css": "/fonts/css/archivoblack.css"
 },
 {
  "id": "bungee",
  "family": "Bungee",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Bungee",
  "note": "看板風の遊びある表示",
  "generic": "fantasy",
  "css": "/fonts/css/bungee.css"
 },
 {
  "id": "caveat",
  "family": "Caveat",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Caveat",
  "note": "手書きメモや注釈向け",
  "generic": "cursive",
  "css": "/fonts/css/caveat.css"
 },
 {
  "id": "courierprime",
  "family": "Courier Prime",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Courier Prime",
  "note": "台本やタイプライター風",
  "generic": "monospace",
  "css": "/fonts/css/courierprime.css"
 },
 {
  "id": "dmmono",
  "family": "DM Mono",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "DM Mono",
  "note": "軽く静かな数値表示向け",
  "generic": "monospace",
  "css": "/fonts/css/dmmono.css"
 },
 {
  "id": "dancingscript",
  "family": "Dancing Script",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Dancing Script",
  "note": "読みやすい軽やかな筆記体",
  "generic": "cursive",
  "css": "/fonts/css/dancingscript.css"
 },
 {
  "id": "firacode",
  "family": "Fira Code",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Fira Code",
  "note": "合字が効くコード向け",
  "generic": "monospace",
  "css": "/fonts/css/firacode.css"
 },
 {
  "id": "fredoka",
  "family": "Fredoka",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Fredoka",
  "note": "丸くて親しみやすい表示",
  "generic": "fantasy",
  "css": "/fonts/css/fredoka.css"
 },
 {
  "id": "greatvibes",
  "family": "Great Vibes",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Great Vibes",
  "note": "招待状のような優雅な筆記",
  "generic": "cursive",
  "css": "/fonts/css/greatvibes.css"
 },
 {
  "id": "ibmplexmono",
  "family": "IBM Plex Mono",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "IBM Plex Mono",
  "note": "端正で技術文書に合う",
  "generic": "monospace",
  "css": "/fonts/css/ibmplexmono.css"
 },
 {
  "id": "inconsolata",
  "family": "Inconsolata",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Inconsolata",
  "note": "細身で行数を稼げる",
  "generic": "monospace",
  "css": "/fonts/css/inconsolata.css"
 },
 {
  "id": "jetbrainsmono",
  "family": "JetBrains Mono",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "JetBrains Mono",
  "note": "コード表示に最適な等幅",
  "generic": "monospace",
  "css": "/fonts/css/jetbrainsmono.css"
 },
 {
  "id": "lobster",
  "family": "Lobster",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Lobster",
  "note": "ロゴ風の太い装飾書体",
  "generic": "fantasy",
  "css": "/fonts/css/lobster.css"
 },
 {
  "id": "pacifico",
  "family": "Pacifico",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Pacifico",
  "note": "陽気なロゴ風の筆記体",
  "generic": "cursive",
  "css": "/fonts/css/pacifico.css"
 },
 {
  "id": "patrickhand",
  "family": "Patrick Hand",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Patrick Hand",
  "note": "素朴で読みやすい手書き",
  "generic": "cursive",
  "css": "/fonts/css/patrickhand.css"
 },
 {
  "id": "permanentmarker",
  "family": "Permanent Marker",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Permanent Marker",
  "note": "太マーカーの手書き強調",
  "generic": "cursive",
  "css": "/fonts/css/permanentmarker.css"
 },
 {
  "id": "righteous",
  "family": "Righteous",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Righteous",
  "note": "レトロで軽快なタイトル",
  "generic": "fantasy",
  "css": "/fonts/css/righteous.css"
 },
 {
  "id": "robotomono",
  "family": "Roboto Mono",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Roboto Mono",
  "note": "本文に馴染む汎用の等幅",
  "generic": "monospace",
  "css": "/fonts/css/robotomono.css"
 },
 {
  "id": "sacramento",
  "family": "Sacramento",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Sacramento",
  "note": "細く繊細なサイン風",
  "generic": "cursive",
  "css": "/fonts/css/sacramento.css"
 },
 {
  "id": "satisfy",
  "family": "Satisfy",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Satisfy",
  "note": "落ち着いた筆サイン風",
  "generic": "cursive",
  "css": "/fonts/css/satisfy.css"
 },
 {
  "id": "shadowsintolight",
  "family": "Shadows Into Light",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Shadows Into Light",
  "note": "軽い手書きの書き込み風",
  "generic": "cursive",
  "css": "/fonts/css/shadowsintolight.css"
 },
 {
  "id": "sourcecodepro",
  "family": "Source Code Pro",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Source Code Pro",
  "note": "癖のない標準の等幅",
  "generic": "monospace",
  "css": "/fonts/css/sourcecodepro.css"
 },
 {
  "id": "spacemono",
  "family": "Space Mono",
  "group": "欧文 等幅・飾り・筆記体",
  "label": "Space Mono",
  "note": "個性的な見出し用の等幅",
  "generic": "monospace",
  "css": "/fonts/css/spacemono.css"
 },
 {
  "id": "notosansjp",
  "family": "Noto Sans JP",
  "group": "日本語 ゴシック",
  "label": "Noto Sans 日本語",
  "note": "本文とUIの標準。迷ったらこれ",
  "generic": "sans-serif",
  "css": "/fonts/css/notosansjp.css"
 },
 {
  "id": "notoserifjp",
  "family": "Noto Serif JP",
  "group": "日本語 明朝",
  "label": "Noto Serif 日本語",
  "note": "長文の本文に。字数の多い資料向け",
  "generic": "serif",
  "css": "/fonts/css/notoserifjp.css"
 },
 {
  "id": "bizudpgothic",
  "family": "BIZ UDPGothic",
  "group": "日本語 ゴシック",
  "label": "BIZ UDPゴシック",
  "note": "UD書体。配布資料や教材の本文に",
  "generic": "sans-serif",
  "css": "/fonts/css/bizudpgothic.css"
 },
 {
  "id": "bizudpmincho",
  "family": "BIZ UDPMincho",
  "group": "日本語 明朝",
  "label": "BIZ UDP明朝",
  "note": "UD設計。教材や配布資料の本文に",
  "generic": "serif",
  "css": "/fonts/css/bizudpmincho.css"
 },
 {
  "id": "zenmarugothic",
  "family": "Zen Maru Gothic",
  "group": "日本語 ゴシック",
  "label": "Zen 丸ゴシック",
  "note": "丸ゴシック。低学年や親しみのある面に",
  "generic": "sans-serif",
  "css": "/fonts/css/zenmarugothic.css"
 },
 {
  "id": "mplusrounded1c",
  "family": "M PLUS Rounded 1c",
  "group": "日本語 丸ゴシック",
  "label": "M PLUS 丸ゴシック 1c",
  "note": "ボタンやラベルなど画面UI全般に",
  "generic": "sans-serif",
  "css": "/fonts/css/mplusrounded1c.css"
 },
 {
  "id": "zenkakugothicnew",
  "family": "Zen Kaku Gothic New",
  "group": "日本語 ゴシック",
  "label": "Zen 角ゴシック New",
  "note": "端正で見出しが締まる",
  "generic": "sans-serif",
  "css": "/fonts/css/zenkakugothicnew.css"
 },
 {
  "id": "shipporimincho",
  "family": "Shippori Mincho",
  "group": "日本語 明朝",
  "label": "しっぽり明朝",
  "note": "見出しにも本文にも効く定番明朝",
  "generic": "serif",
  "css": "/fonts/css/shipporimincho.css"
 },
 {
  "id": "kleeone",
  "family": "Klee One",
  "group": "日本語 明朝",
  "label": "Klee One（教科書体風）",
  "note": "教科書体風。国語や書き取りに",
  "generic": "serif",
  "css": "/fonts/css/kleeone.css"
 },
 {
  "id": "mplus1p",
  "family": "M PLUS 1p",
  "group": "日本語 ゴシック",
  "label": "M PLUS 1p",
  "note": "やわらかい字面。読み物の本文に",
  "generic": "sans-serif",
  "css": "/fonts/css/mplus1p.css"
 },
 {
  "id": "bizudgothic",
  "family": "BIZ UDGothic",
  "group": "日本語 ゴシック",
  "label": "BIZ UDゴシック（等幅）",
  "note": "字幅が揃うUD。表や数値の桁揃えに",
  "generic": "sans-serif",
  "css": "/fonts/css/bizudgothic.css"
 },
 {
  "id": "ibmplexsansjp",
  "family": "IBM Plex Sans JP",
  "group": "日本語 ゴシック",
  "label": "IBM Plex Sans 日本語",
  "note": "英数字混じりの技術文書に強い",
  "generic": "sans-serif",
  "css": "/fonts/css/ibmplexsansjp.css"
 },
 {
  "id": "mplus2",
  "family": "M PLUS 2",
  "group": "日本語 ゴシック",
  "label": "M PLUS 2",
  "note": "字幅が狭く画面表示に向く",
  "generic": "sans-serif",
  "css": "/fonts/css/mplus2.css"
 },
 {
  "id": "murecho",
  "family": "Murecho",
  "group": "日本語 ゴシック",
  "label": "Murecho（ムレチョ）",
  "note": "軽く癖が少ない。UIラベル向き",
  "generic": "sans-serif",
  "css": "/fonts/css/murecho.css"
 },
 {
  "id": "zenkakugothicantique",
  "family": "Zen Kaku Gothic Antique",
  "group": "日本語 ゴシック",
  "label": "Zen 角ゴシック Antique",
  "note": "少し古風。落ち着いた紙面に",
  "generic": "sans-serif",
  "css": "/fonts/css/zenkakugothicantique.css"
 },
 {
  "id": "sawarabigothic",
  "family": "Sawarabi Gothic",
  "group": "日本語 ゴシック",
  "label": "さわらびゴシック",
  "note": "線が細く静か。和文の長文に",
  "generic": "sans-serif",
  "css": "/fonts/css/sawarabigothic.css"
 },
 {
  "id": "delagothicone",
  "family": "Dela Gothic One",
  "group": "日本語 ゴシック",
  "label": "デラゴシック One",
  "note": "極太。スライドの大見出しに",
  "generic": "sans-serif",
  "css": "/fonts/css/delagothicone.css"
 },
 {
  "id": "dotgothic16",
  "family": "DotGothic16",
  "group": "日本語 ゴシック",
  "label": "ドットゴシック16",
  "note": "ドット文字。ゲーム風の演出に",
  "generic": "sans-serif",
  "css": "/fonts/css/dotgothic16.css"
 },
 {
  "id": "kosugi",
  "family": "Kosugi",
  "group": "日本語 ゴシック",
  "label": "小杉ゴシック",
  "note": "素朴で軽い。注釈や補足文に",
  "generic": "sans-serif",
  "css": "/fonts/css/kosugi.css"
 },
 {
  "id": "yomogi",
  "family": "Yomogi",
  "group": "日本語 デザイン・手書き",
  "label": "よもぎ",
  "note": "やさしい手書きの吹き出しに",
  "generic": "cursive",
  "css": "/fonts/css/yomogi.css"
 },
 {
  "id": "shizuru",
  "family": "Shizuru",
  "group": "日本語 デザイン・手書き",
  "label": "シズル",
  "note": "かすれた筆ペン、力強い強調",
  "generic": "cursive",
  "css": "/fonts/css/shizuru.css"
 },
 {
  "id": "stick",
  "family": "Stick",
  "group": "日本語 デザイン・手書き",
  "label": "スティック",
  "note": "極細の直線、ミニマルな表示",
  "generic": "sans-serif",
  "css": "/fonts/css/stick.css"
 },
 {
  "id": "trainone",
  "family": "Train One",
  "group": "日本語 デザイン・手書き",
  "label": "トレイン One",
  "note": "縁取り線のレトロ看板風",
  "generic": "fantasy",
  "css": "/fonts/css/trainone.css"
 },
 {
  "id": "rampartone",
  "family": "Rampart One",
  "group": "日本語 デザイン・手書き",
  "label": "ランパート One",
  "note": "立体的な表紙やロゴ風に",
  "generic": "fantasy",
  "css": "/fonts/css/rampartone.css"
 },
 {
  "id": "reggaeone",
  "family": "Reggae One",
  "group": "日本語 デザイン・手書き",
  "label": "レゲエ One",
  "note": "勢いのある装飾見出しに",
  "generic": "fantasy",
  "css": "/fonts/css/reggaeone.css"
 },
 {
  "id": "rocknrollone",
  "family": "RocknRoll One",
  "group": "日本語 デザイン・手書き",
  "label": "ロックンロール One",
  "note": "明るく元気なタイトル向き",
  "generic": "sans-serif",
  "css": "/fonts/css/rocknrollone.css"
 },
 {
  "id": "kaiseidecol",
  "family": "Kaisei Decol",
  "group": "日本語 デザイン・手書き",
  "label": "解星 デコール",
  "note": "丸みのある装飾明朝、やわらか",
  "generic": "serif",
  "css": "/fonts/css/kaiseidecol.css"
 },
 {
  "id": "kiwimaru",
  "family": "Kiwi Maru",
  "group": "日本語 丸ゴシック",
  "label": "Kiwi 丸明朝",
  "note": "丸みのある明朝。長めの読み物に",
  "generic": "serif",
  "css": "/fonts/css/kiwimaru.css"
 },
 {
  "id": "hachimarupop",
  "family": "Hachi Maru Pop",
  "group": "日本語 丸ゴシック",
  "label": "はち丸ポップ",
  "note": "かわいい手書き。子ども向け教材に",
  "generic": "cursive",
  "css": "/fonts/css/hachimarupop.css"
 },
 {
  "id": "yuseimagic",
  "family": "Yusei Magic",
  "group": "日本語 丸ゴシック",
  "label": "ゆうせい マジック",
  "note": "サインペン風。ひとこと注釈に",
  "generic": "sans-serif",
  "css": "/fonts/css/yuseimagic.css"
 },
 {
  "id": "pottaone",
  "family": "Potta One",
  "group": "日本語 丸ゴシック",
  "label": "ポッタ ワン",
  "note": "ぽってり太い装飾タイトル向け",
  "generic": "sans-serif",
  "css": "/fonts/css/pottaone.css"
 },
 {
  "id": "mochiypopone",
  "family": "Mochiy Pop One",
  "group": "日本語 丸ゴシック",
  "label": "モチイ ポップ",
  "note": "太くて目立つ。表紙や大見出しに",
  "generic": "sans-serif",
  "css": "/fonts/css/mochiypopone.css"
 },
 {
  "id": "kosugimaru",
  "family": "Kosugi Maru",
  "group": "日本語 丸ゴシック",
  "label": "小杉丸ゴシック",
  "note": "細めで軽い。小さな文字も読みやすい",
  "generic": "sans-serif",
  "css": "/fonts/css/kosugimaru.css"
 },
 {
  "id": "zenantique",
  "family": "Zen Antique",
  "group": "日本語 明朝",
  "label": "Zen アンティーク",
  "note": "昭和の印刷風。和レトロな表紙に",
  "generic": "serif",
  "css": "/fonts/css/zenantique.css"
 },
 {
  "id": "zenoldmincho",
  "family": "Zen Old Mincho",
  "group": "日本語 明朝",
  "label": "Zen オールド明朝",
  "note": "書籍のような落ち着いた読み物に",
  "generic": "serif",
  "css": "/fonts/css/zenoldmincho.css"
 },
 {
  "id": "sawarabimincho",
  "family": "Sawarabi Mincho",
  "group": "日本語 明朝",
  "label": "さわらび明朝",
  "note": "細身で軽い。引用や注釈の文に",
  "generic": "serif",
  "css": "/fonts/css/sawarabimincho.css"
 },
 {
  "id": "hinamincho",
  "family": "Hina Mincho",
  "group": "日本語 明朝",
  "label": "ひな明朝",
  "note": "極細で繊細。大きな見出し向き",
  "generic": "serif",
  "css": "/fonts/css/hinamincho.css"
 },
 {
  "id": "newtegomin",
  "family": "New Tegomin",
  "group": "日本語 明朝",
  "label": "ニューテゴミン",
  "note": "活版のような素朴でレトロな味",
  "generic": "serif",
  "css": "/fonts/css/newtegomin.css"
 },
 {
  "id": "yujisyuku",
  "family": "Yuji Syuku",
  "group": "日本語 明朝",
  "label": "佑字 肅（筆書き）",
  "note": "毛筆調。和の見出しや題字に",
  "generic": "serif",
  "css": "/fonts/css/yujisyuku.css"
 },
 {
  "id": "kaiseitokumin",
  "family": "Kaisei Tokumin",
  "group": "日本語 明朝",
  "label": "解星 特ミン",
  "note": "太く力強い。表紙や大見出しに",
  "generic": "serif",
  "css": "/fonts/css/kaiseitokumin.css"
 }
];
})(typeof window !== "undefined" ? window : globalThis);
