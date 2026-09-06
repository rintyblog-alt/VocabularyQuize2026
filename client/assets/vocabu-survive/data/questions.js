/* ══════════════════════════════════════════════════════════════════════════
   門に 出す 問題。

   出どころは 3 つ。上から 順に 試す:
     ① サーバ /api/survive/questions（プリセット・AI 生成・学習履歴）
     ② 本体が すでに 持っている 問題（window.VQ2 の プリセット）
     ③ ここに 書いてある 控え

   ★ ③ を **必ず 持つ**。通信が 落ちても 門が 開かなく なっては いけない。
     ゲームが 止まるより、控えの 問題で 続く ほうが ずっと よい。

   形は 1 つに 揃える:
     { prompt, choices[4], answer, tag }
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 控え。英単語を 中心に 6 種類（要件の 対応表そのまま）。 */
const BANK = [
  /* 意味（英→日） */
  ["enormous", ["巨大な", "小さな", "狭い", "浅い"], 0, "意味"],
  ["ancient", ["古代の", "現代の", "未来の", "毎日の"], 0, "意味"],
  ["fragile", ["こわれやすい", "頑丈な", "重い", "明るい"], 0, "意味"],
  ["reluctant", ["気が進まない", "熱心な", "正直な", "陽気な"], 0, "意味"],
  ["abundant", ["豊富な", "乏しい", "危険な", "静かな"], 0, "意味"],
  ["obvious", ["明らかな", "あいまいな", "秘密の", "複雑な"], 0, "意味"],
  ["reveal", ["明らかにする", "隠す", "壊す", "忘れる"], 0, "意味"],
  ["persuade", ["説得する", "拒む", "疑う", "無視する"], 0, "意味"],
  ["sufficient", ["十分な", "不足した", "余分な", "重要な"], 0, "意味"],
  ["hesitate", ["ためらう", "急ぐ", "決める", "叫ぶ"], 0, "意味"],
  ["genuine", ["本物の", "偽の", "安い", "古い"], 0, "意味"],
  ["essential", ["不可欠な", "余分な", "偶然の", "一時的な"], 0, "意味"],
  ["remarkable", ["注目すべき", "平凡な", "退屈な", "小さな"], 0, "意味"],
  ["diminish", ["減らす", "増やす", "続ける", "始める"], 0, "意味"],
  ["accurate", ["正確な", "おおよその", "誤った", "曖昧な"], 0, "意味"],
  ["deliberate", ["意図的な", "偶然の", "急な", "静かな"], 0, "意味"],
  ["scarce", ["乏しい", "豊富な", "新しい", "重い"], 0, "意味"],
  ["evident", ["明白な", "不明な", "遠い", "細かい"], 0, "意味"],
  ["reluctance", ["気乗りしないこと", "熱意", "正直さ", "速さ"], 0, "意味"],
  ["profound", ["深い", "浅い", "軽い", "早い"], 0, "意味"],

  /* 意味（日→英） */
  ["「増加する」に あたる 語は？", ["increase", "decrease", "remain", "avoid"], 0, "語彙"],
  ["「必要な」に あたる 語は？", ["necessary", "optional", "useless", "extra"], 0, "語彙"],
  ["「たぶん」に あたる 語は？", ["probably", "never", "rarely", "exactly"], 0, "語彙"],
  ["「経験」に あたる 語は？", ["experience", "expensive", "expert", "export"], 0, "語彙"],
  ["「環境」に あたる 語は？", ["environment", "equipment", "entertainment", "engagement"], 0, "語彙"],
  ["「political」の 名詞形は？", ["politics", "politely", "policy", "polite"], 0, "語彙"],
  ["「決心する」に あたる 語は？", ["decide", "divide", "delay", "deny"], 0, "語彙"],
  ["「影響を与える」に あたる 語は？", ["affect", "effect", "reflect", "collect"], 0, "語彙"],
  ["「発見する」に あたる 語は？", ["discover", "discuss", "disappear", "disagree"], 0, "語彙"],
  ["「responsibility」の 意味は？", ["責任", "反応", "尊敬", "返答"], 0, "語彙"],

  /* 同義語 */
  ["happy と 最も 近い 語は？", ["glad", "sad", "angry", "tired"], 0, "同義語"],
  ["quick と 最も 近い 語は？", ["rapid", "slow", "heavy", "quiet"], 0, "同義語"],
  ["begin と 最も 近い 語は？", ["start", "finish", "stop", "close"], 0, "同義語"],
  ["difficult と 最も 近い 語は？", ["hard", "easy", "simple", "plain"], 0, "同義語"],
  ["huge と 最も 近い 語は？", ["immense", "tiny", "narrow", "brief"], 0, "同義語"],
  ["famous と 最も 近い 語は？", ["well-known", "unknown", "secret", "hidden"], 0, "同義語"],
  ["silent と 最も 近い 語は？", ["quiet", "loud", "noisy", "busy"], 0, "同義語"],
  ["repair と 最も 近い 語は？", ["fix", "break", "waste", "lose"], 0, "同義語"],
  ["purchase と 最も 近い 語は？", ["buy", "sell", "rent", "give"], 0, "同義語"],
  ["assist と 最も 近い 語は？", ["help", "harm", "leave", "ignore"], 0, "同義語"],

  /* 反意語 */
  ["increase の 反対は？", ["decrease", "expand", "extend", "enlarge"], 0, "反意語"],
  ["accept の 反対は？", ["refuse", "receive", "agree", "allow"], 0, "反意語"],
  ["ancient の 反対は？", ["modern", "old", "past", "former"], 0, "反意語"],
  ["arrive の 反対は？", ["depart", "reach", "enter", "come"], 0, "反意語"],
  ["success の 反対は？", ["failure", "victory", "profit", "growth"], 0, "反意語"],
  ["public の 反対は？", ["private", "open", "common", "shared"], 0, "反意語"],
  ["increase の 名詞の 反対は？", ["reduction", "addition", "growth", "rise"], 0, "反意語"],
  ["temporary の 反対は？", ["permanent", "brief", "short", "quick"], 0, "反意語"],
  ["artificial の 反対は？", ["natural", "fake", "false", "man-made"], 0, "反意語"],
  ["majority の 反対は？", ["minority", "most", "many", "plenty"], 0, "反意語"],

  /* つづり */
  ["正しい つづりは？", ["necessary", "neccessary", "necesary", "necessery"], 0, "つづり"],
  ["正しい つづりは？", ["separate", "seperate", "seperete", "sepalate"], 0, "つづり"],
  ["正しい つづりは？", ["definitely", "definately", "definitly", "definetely"], 0, "つづり"],
  ["正しい つづりは？", ["receive", "recieve", "receve", "reccieve"], 0, "つづり"],
  ["正しい つづりは？", ["occurred", "occured", "ocurred", "occureed"], 0, "つづり"],
  ["正しい つづりは？", ["beautiful", "beatiful", "beautifull", "beautifal"], 0, "つづり"],
  ["正しい つづりは？", ["accommodate", "acommodate", "accomodate", "acomodate"], 0, "つづり"],
  ["正しい つづりは？", ["environment", "enviroment", "envionment", "enviornment"], 0, "つづり"],
  ["正しい つづりは？", ["restaurant", "restarant", "resturant", "restraunt"], 0, "つづり"],
  ["正しい つづりは？", ["rhythm", "rythm", "rhythem", "rythem"], 0, "つづり"],

  /* 文法 */
  ["She ___ to school every day.", ["goes", "go", "going", "gone"], 0, "文法"],
  ["I have ___ finished my homework.", ["already", "yet", "still", "ever"], 0, "文法"],
  ["If it ___ tomorrow, we'll stay home.", ["rains", "rain", "rained", "raining"], 0, "文法"],
  ["This is the book ___ I bought.", ["that", "who", "whose", "where"], 0, "文法"],
  ["He is interested ___ music.", ["in", "on", "at", "for"], 0, "文法"],
  ["She has lived here ___ 2019.", ["since", "for", "from", "during"], 0, "文法"],
  ["The window ___ by Tom.", ["was broken", "broke", "breaks", "is breaking"], 0, "文法"],
  ["I'd rather ___ at home tonight.", ["stay", "to stay", "staying", "stayed"], 0, "文法"],
  ["Neither of them ___ the answer.", ["knows", "know", "knowing", "known"], 0, "文法"],
  ["It's the ___ movie I've ever seen.", ["best", "better", "good", "well"], 0, "文法"],

  /* 文（会話） */
  ["\"How are you doing?\" への 自然な 返事は？", ["Pretty good, thanks.", "Yes, I do.", "It's over there.", "At three o'clock."], 0, "会話"],
  ["\"Would you like some tea?\" への 断り方は？", ["No, thank you.", "Yes, I am.", "That's mine.", "See you."], 0, "会話"],
  ["\"Could you say that again?\" の 意味は？", ["もう一度 言ってください", "もう 行きます", "また 会いましょう", "ありがとう"], 0, "会話"],
  ["\"I'm afraid I can't.\" の 意味は？", ["残念ですが できません", "こわいです", "できます", "急いでいます"], 0, "会話"],
  ["\"Take your time.\" の 意味は？", ["ゆっくりで いいですよ", "時間を 計って", "早く して", "時間を ください"], 0, "会話"],
  ["\"It's up to you.\" の 意味は？", ["あなた次第です", "上を 見て", "起きてください", "終わりです"], 0, "会話"],
  ["\"Never mind.\" の 意味は？", ["気にしないで", "決して 考えない", "覚えておいて", "心配して"], 0, "会話"],
  ["\"Long time no see.\" の 意味は？", ["久しぶり", "長く 見ないで", "遠くを 見て", "さようなら"], 0, "会話"],
  ["\"I'm running late.\" の 意味は？", ["遅れそうです", "走っています", "遅く 走ります", "後で 走ります"], 0, "会話"],
  ["\"That makes sense.\" の 意味は？", ["なるほど", "感覚を 作る", "意味が ない", "感じます"], 0, "会話"],

  /* ══════════════════════════════════════════════════════════════════════
     ここから 2026-08-31 に 足した 120 問（合計 200 問）。

     ★ なぜ 足したか: 控えは **通信が 落ちた とき**と **まだ ログインして
       いない 人**が 見る もの。80 問だと 門 8 つ × 10 走で ひと回りして
       しまい、「さっきと 同じ 問題」に なる（実測: 1 走 8 問）。
     ★ 決めごと（元の 80 問と 同じ）:
       ・正解は **必ず 0 番**（出す ときに 混ぜる ので 偏らない）
       ・まぎらわしい 選択肢を 1 つは 入れる（4 択が 作業に ならない ように）
       ・高校で 出る 語を 中心に する
     ══════════════════════════════════════════════════════════════════════ */

  /* 意味（英→日）＋40 */
  ["adequate", ["十分な", "余分な", "不足した", "危険な"], 0, "意味"],
  ["anticipate", ["予期する", "忘れる", "遅らせる", "断る"], 0, "意味"],
  ["appropriate", ["適切な", "無関係な", "余分な", "不安な"], 0, "意味"],
  ["assume", ["思い込む", "確かめる", "断る", "忘れる"], 0, "意味"],
  ["consequence", ["結果", "順序", "会議", "自信"], 0, "意味"],
  ["contribute", ["貢献する", "妨げる", "断る", "隠す"], 0, "意味"],
  ["crucial", ["決定的な", "些細な", "偶然の", "退屈な"], 0, "意味"],
  ["demonstrate", ["実演する", "隠す", "疑う", "壊す"], 0, "意味"],
  ["distinguish", ["区別する", "混ぜる", "消す", "続ける"], 0, "意味"],
  ["eliminate", ["取り除く", "加える", "認める", "保つ"], 0, "意味"],
  ["emphasize", ["強調する", "省略する", "疑う", "遅らせる"], 0, "意味"],
  ["encounter", ["出会う", "避ける", "見送る", "分ける"], 0, "意味"],
  ["establish", ["設立する", "廃止する", "貸す", "訪ねる"], 0, "意味"],
  ["exhausted", ["疲れ果てた", "元気な", "空腹な", "退屈な"], 0, "意味"],
  ["fundamental", ["基本的な", "表面的な", "一時的な", "余分な"], 0, "意味"],
  ["identify", ["特定する", "見失う", "隠す", "疑う"], 0, "意味"],
  ["inevitable", ["避けられない", "任意の", "珍しい", "危険な"], 0, "意味"],
  ["initiative", ["主導権", "終わり", "失敗", "退屈"], 0, "意味"],
  ["maintain", ["維持する", "捨てる", "壊す", "借りる"], 0, "意味"],
  ["moderate", ["適度な", "極端な", "無料の", "危険な"], 0, "意味"],
  ["neglect", ["怠る", "世話する", "強調する", "招く"], 0, "意味"],
  ["obstacle", ["障害", "助け", "近道", "記録"], 0, "意味"],
  ["participate", ["参加する", "欠席する", "断る", "眺める"], 0, "意味"],
  ["perceive", ["知覚する", "見落とす", "作る", "隠す"], 0, "意味"],
  ["precise", ["正確な", "曖昧な", "広い", "遅い"], 0, "意味"],
  ["previous", ["以前の", "次の", "現在の", "永久の"], 0, "意味"],
  ["reasonable", ["妥当な", "無理な", "高価な", "危険な"], 0, "意味"],
  ["reject", ["拒む", "受け入れる", "提案する", "遅らせる"], 0, "意味"],
  ["reliable", ["信頼できる", "怪しい", "壊れやすい", "退屈な"], 0, "意味"],
  ["resemble", ["似ている", "異なる", "壊す", "集める"], 0, "意味"],
  ["restore", ["元に戻す", "壊す", "捨てる", "隠す"], 0, "意味"],
  ["significant", ["重要な", "些細な", "無料の", "偶然の"], 0, "意味"],
  ["subtle", ["微妙な", "露骨な", "巨大な", "騒々しい"], 0, "意味"],
  ["sustain", ["支え続ける", "手放す", "壊す", "急ぐ"], 0, "意味"],
  ["tremendous", ["途方もない", "わずかな", "普通の", "静かな"], 0, "意味"],
  ["urgent", ["緊急の", "のんびりした", "安全な", "退屈な"], 0, "意味"],
  ["vague", ["曖昧な", "明確な", "強い", "速い"], 0, "意味"],
  ["vital", ["きわめて重要な", "不要な", "一時的な", "静かな"], 0, "意味"],
  ["withdraw", ["引き下がる", "進み出る", "続ける", "加える"], 0, "意味"],
  ["yield", ["生み出す", "奪う", "隠す", "壊す"], 0, "意味"],

  /* 意味（日→英）＋15 */
  ["「解決する」に あたる 語は？", ["solve", "salve", "serve", "save"], 0, "語彙"],
  ["「準備する」に あたる 語は？", ["prepare", "repair", "compare", "prefer"], 0, "語彙"],
  ["「想像する」に あたる 語は？", ["imagine", "imitate", "immigrate", "improve"], 0, "語彙"],
  ["「証拠」に あたる 語は？", ["evidence", "evident", "event", "avenue"], 0, "語彙"],
  ["「目的」に あたる 語は？", ["purpose", "propose", "process", "promise"], 0, "語彙"],
  ["「文化」に あたる 語は？", ["culture", "capture", "creature", "cultivate"], 0, "語彙"],
  ["「政府」に あたる 語は？", ["government", "governor", "guidance", "guarantee"], 0, "語彙"],
  ["「機会」に あたる 語は？", ["opportunity", "opposition", "operation", "optimism"], 0, "語彙"],
  ["「知識」に あたる 語は？", ["knowledge", "knowing", "acknowledge", "known"], 0, "語彙"],
  ["「成功する」に あたる 語は？", ["succeed", "success", "successful", "succession"], 0, "語彙"],
  ["「decide」の 名詞形は？", ["decision", "deciding", "decisive", "decided"], 0, "語彙"],
  ["「strong」の 名詞形は？", ["strength", "strongly", "stronger", "strengthen"], 0, "語彙"],
  ["「analyze」の 名詞形は？", ["analysis", "analyzing", "analytic", "analyzer"], 0, "語彙"],
  ["「high」の 名詞形は？", ["height", "highly", "higher", "heighten"], 0, "語彙"],
  ["「able」の 名詞形は？", ["ability", "ably", "enable", "abled"], 0, "語彙"],

  /* 同義語 ＋15 */
  ["important と 最も 近い 語は？", ["significant", "tiny", "usual", "silent"], 0, "同義語"],
  ["choose と 最も 近い 語は？", ["select", "refuse", "forget", "delay"], 0, "同義語"],
  ["answer と 最も 近い 語は？", ["reply", "ask", "doubt", "listen"], 0, "同義語"],
  ["buy と 最も 近い 語は？", ["purchase", "sell", "lend", "borrow"], 0, "同義語"],
  ["show と 最も 近い 語は？", ["display", "hide", "cover", "close"], 0, "同義語"],
  ["strange と 最も 近い 語は？", ["odd", "normal", "clear", "safe"], 0, "同義語"],
  ["enough と 最も 近い 語は？", ["sufficient", "scarce", "extra", "empty"], 0, "同義語"],
  ["allow と 最も 近い 語は？", ["permit", "forbid", "refuse", "prevent"], 0, "同義語"],
  ["decrease と 最も 近い 語は？", ["reduce", "expand", "raise", "repeat"], 0, "同義語"],
  ["think と 最も 近い 語は？", ["consider", "ignore", "shout", "sleep"], 0, "同義語"],
  ["reach と 最も 近い 語は？", ["arrive at", "leave", "avoid", "delay"], 0, "同義語"],
  ["explain と 最も 近い 語は？", ["describe", "confuse", "hide", "deny"], 0, "同義語"],
  ["keep と 最も 近い 語は？", ["retain", "release", "waste", "lose"], 0, "同義語"],
  ["almost と 最も 近い 語は？", ["nearly", "exactly", "hardly", "rarely"], 0, "同義語"],
  ["build と 最も 近い 語は？", ["construct", "destroy", "borrow", "carry"], 0, "同義語"],

  /* 反意語 ＋15 */
  ["expand の 反対は？", ["shrink", "grow", "widen", "stretch"], 0, "反意語"],
  ["allow の 反対は？", ["forbid", "permit", "accept", "admit"], 0, "反意語"],
  ["ancient の 名詞の 反対は？", ["modernity", "antiquity", "history", "tradition"], 0, "反意語"],
  ["victory の 反対は？", ["defeat", "success", "prize", "record"], 0, "反意語"],
  ["depart の 反対は？", ["arrive", "leave", "exit", "escape"], 0, "反意語"],
  ["remember の 反対は？", ["forget", "recall", "memorize", "review"], 0, "反意語"],
  ["useful の 反対は？", ["useless", "helpful", "handy", "practical"], 0, "反意語"],
  ["frequent の 反対は？", ["rare", "often", "usual", "common"], 0, "反意語"],
  ["ancient の 語感に 近い 反対は？", ["contemporary", "aged", "antique", "classic"], 0, "反意語"],
  ["dangerous の 反対は？", ["safe", "risky", "harmful", "serious"], 0, "反意語"],
  ["full の 反対は？", ["empty", "whole", "entire", "complete"], 0, "反意語"],
  ["simple の 反対は？", ["complicated", "easy", "plain", "clear"], 0, "反意語"],
  ["borrow の 反対は？", ["lend", "take", "receive", "keep"], 0, "反意語"],
  ["encourage の 反対は？", ["discourage", "support", "praise", "help"], 0, "反意語"],
  ["appear の 反対は？", ["disappear", "arrive", "seem", "look"], 0, "反意語"],

  /* つづり ＋12 */
  ["正しい つづりは？", ["necessary", "neccessary", "necesary", "nesessary"], 0, "つづり"],
  ["正しい つづりは？", ["beginning", "begining", "beginnning", "begginning"], 0, "つづり"],
  ["正しい つづりは？", ["definitely", "definately", "definitly", "defenitely"], 0, "つづり"],
  ["正しい つづりは？", ["separate", "seperate", "seperete", "separete"], 0, "つづり"],
  ["正しい つづりは？", ["occurred", "occured", "ocurred", "occureed"], 0, "つづり"],
  ["正しい つづりは？", ["received", "recieved", "receeved", "receved"], 0, "つづり"],
  ["正しい つづりは？", ["environment", "enviroment", "envrionment", "environmet"], 0, "つづり"],
  ["正しい つづりは？", ["restaurant", "restraunt", "restaurent", "resturant"], 0, "つづり"],
  ["正しい つづりは？", ["immediately", "imediately", "immediatly", "immedietely"], 0, "つづり"],
  ["正しい つづりは？", ["successful", "succesful", "successfull", "sucessful"], 0, "つづり"],
  ["正しい つづりは？", ["knowledge", "knowlege", "knowladge", "knowledege"], 0, "つづり"],
  ["正しい つづりは？", ["opportunity", "oportunity", "opportunety", "oppotunity"], 0, "つづり"],

  /* 文法 ＋12 */
  ["We have been friends ___ childhood.", ["since", "for", "from", "while"], 0, "文法"],
  ["I have known him ___ ten years.", ["for", "since", "in", "at"], 0, "文法"],
  ["If I ___ you, I would apologize.", ["were", "am", "was being", "will be"], 0, "文法"],
  ["The book ___ by many students.", ["is read", "reads", "is reading", "read"], 0, "文法"],
  ["He is the man ___ helped me.", ["who", "which", "whose", "whom"], 0, "文法"],
  ["I'm looking forward to ___ you.", ["seeing", "see", "saw", "be seen"], 0, "文法"],
  ["This is ___ interesting than that.", ["more", "much", "very", "most"], 0, "文法"],
  ["She made me ___ the room.", ["clean", "to clean", "cleaning", "cleaned"], 0, "文法"],
  ["Not only he but also they ___ right.", ["are", "is", "was", "has been"], 0, "文法"],
  ["___ finished, he went out.", ["Having", "Have", "To have", "Had"], 0, "文法"],
  ["I don't know ___ to start.", ["where", "which", "that", "whom"], 0, "文法"],
  ["He speaks English as ___ as you.", ["well", "good", "better", "best"], 0, "文法"],

  /* 会話 ＋11 */
  ["\"What do you do?\" の 意味は？", ["お仕事は 何ですか", "何を していますか（今）", "どうしますか", "何が 好きですか"], 0, "会話"],
  ["\"Help yourself.\" の 意味は？", ["ご自由に どうぞ", "自分で 助けて", "手伝って", "気を つけて"], 0, "会話"],
  ["\"I'll take it.\" の 意味は？", ["これを 買います", "持って いきます", "受け取りません", "取ってください"], 0, "会話"],
  ["\"Sounds good.\" の 意味は？", ["いいですね", "音が いい", "聞こえます", "うるさい"], 0, "会話"],
  ["\"Just in case.\" の 意味は？", ["念のため", "この 場合だけ", "箱の 中に", "たまたま"], 0, "会話"],
  ["\"No wonder.\" の 意味は？", ["どうりで", "不思議だ", "驚かない で", "疑問は ない"], 0, "会話"],
  ["\"Let me see.\" の 意味は？", ["ええと", "見せて", "会いましょう", "分かりました"], 0, "会話"],
  ["\"After you.\" の 意味は？", ["お先に どうぞ", "あなたの 後で 行く", "あとで 会おう", "追いかけて"], 0, "会話"],
  ["\"It doesn't matter.\" の 意味は？", ["かまいません", "物質では ない", "問題です", "重要です"], 0, "会話"],
  ["\"Keep in touch.\" の 意味は？", ["連絡を 取り合おう", "触って いて", "近づかない で", "手を つないで"], 0, "会話"],
  ["\"I owe you one.\" の 意味は？", ["借りが できた", "1 つ 持っている", "1 つ あげる", "あなたの ものだ"], 0, "会話"]
];

function fromBank(row) {
  return { prompt: row[0], choices: row[1].slice(), answer: row[2], tag: row[3] };
}

/** 選択肢を 混ぜる（正解の 位置が 偏らない ように）。種で 決まる。 */
function shuffle(q, rnd) {
  const idx = [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  const cs = idx.map((i) => q.choices[i]);
  const ans = idx.indexOf(q.answer);
  return { prompt: q.prompt, choices: cs, answer: ans, tag: q.tag };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 控えから n 問。同じ 種なら 同じ 並び（対戦で 全員 同じ 問題に する ため）。 */
export function localQuestions(n, seed) {
  const rnd = mulberry((seed || 1) >>> 0);
  const pool = BANK.map(fromBank);
  /* 取り出す 順を 混ぜる */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(shuffle(pool[i % pool.length], rnd));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   自分の 単語帳（手元に あるもの）

   ★ **サーバを 通さない。** 理由:
     ① プリセットの 実体は 1 つの 大きな かたまり（vq2.presets.v1）に
        まとめて 入っている。ひとつ 引くだけでも 全部を 読む ことに なる。
     ② 自分の 単語帳は 自分の 端末に すでに ある。取りに 行く 必要が ない。
     ③ 他の 人には 引けない ので、**ひとりで 遊ぶ ときだけ** 使える。
        対戦で 使うと 自分だけ 自分の 単語・相手は 控えの 単語に なり、
        同じ 問題で 競って いない ことに なる。
   ══════════════════════════════════════════════════════════════════════════ */

/** 単語帳の 中身（3 通りの 形）から [表, 裏] を 取り出す。 */
function ペアを取り出す(d) {
  if (!d || typeof d !== "object") return [];
  const rows = (Array.isArray(d.cards) && d.cards.length) ? d.cards
    : (Array.isArray(d.words) && d.words.length) ? d.words
    : (Array.isArray(d.items) && d.items.length) ? d.items
    : (Array.isArray(d.rows) ? d.rows : []);
  const got = [];
  for (const w of rows) {
    if (!w || typeof w !== "object") continue;
    const a = String(w.front || w.term || w.word || w.q || w.left || "").trim().slice(0, 60);
    const b = String(w.back || w.meaning || w.answer || w.a || w.right || "").trim().slice(0, 60);
    if (a && b) got.push([a, b]);
  }
  return got;
}

/** 手元の 単語帳の 一覧。8 語 未満の ものは 4 択が 作れない ので 出さない。 */
export function listLocalPresets() {
  const out = [];
  try {
    const st = window.VQ2 && window.VQ2.store;
    if (!st || typeof st.listPresets !== "function") return out;
    const list = st.listPresets() || [];
    for (const p of list) {
      if (!p || !p.id) continue;
      const pairs = ペアを取り出す(p);
      if (pairs.length < 8) continue;
      out.push({ id: String(p.id), name: String(p.name || p.title || p.id).slice(0, 60), words: pairs.length, kind: "mine" });
    }
  } catch (e) { /* 本体が まだ 起きて いない ＝ 空 */ }
  out.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return out.slice(0, 60);
}

/** 手元の 単語帳 1 つ から ペアを 取り出す。 */
export function localPresetPairs(id) {
  try {
    const st = window.VQ2 && window.VQ2.store;
    if (!st || typeof st.listPresets !== "function") return null;
    for (const p of (st.listPresets() || [])) {
      if (p && String(p.id) === String(id)) {
        const pairs = ペアを取り出す(p);
        return pairs.length >= 8 ? pairs : null;
      }
    }
  } catch (e) {}
  return null;
}

/** 誰でも 読める 単語帳（公開・公式）の 一覧。 */
export async function listSharedPresets() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4500);
    const tk = token();
    const r = await fetch(apiBase() + "/api/survive/presets", {
      headers: tk ? { Authorization: "Bearer " + tk } : {},
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (!r.ok) return { public: [], official: [] };
    const d = await r.json();
    return {
      public: Array.isArray(d && d.public) ? d.public : [],
      official: Array.isArray(d && d.official) ? d.official : []
    };
  } catch (e) { return { public: [], official: [] }; }
}

/**
 * ペアから 問題を 作る。**サーバと 同じ 手順**（同じ 種 → 同じ 問題）。
 * ここが ずれると、ひとり用と 対戦で 難しさが 変わって しまう。
 */
export function questionsFromPairs(pairs, count, seed) {
  const rnd = mulberry((seed || 1) >>> 0);
  const pool = pairs.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = pool[i % pool.length];
    if (!p) break;
    const wrong = [];
    let guard = 0;
    while (wrong.length < 3 && guard++ < 200) {
      const q = pool[Math.floor(rnd() * pool.length)];
      if (!q || q[1] === p[1] || wrong.indexOf(q[1]) >= 0) continue;
      wrong.push(q[1]);
    }
    while (wrong.length < 3) wrong.push("—");
    const choices = [p[1], wrong[0], wrong[1], wrong[2]];
    for (let k = choices.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = choices[k]; choices[k] = choices[j]; choices[j] = t;
    }
    out.push({ prompt: String(p[0]), choices: choices.map(String), answer: choices.indexOf(p[1]), tag: "意味" });
  }
  return out;
}

function apiBase() {
  try {
    if (typeof window !== "undefined" && window.VQ_API_BASE) return String(window.VQ_API_BASE).replace(/\/+$/, "");
  } catch (e) {}
  return "";
}
function token() {
  try { if (typeof window._authGetToken === "function") return String(window._authGetToken() || ""); } catch (e) {}
  return "";
}

/**
 * サーバから 取る。取れなければ 控えを 返す。
 * @param {{count:number, presetId?:string, seed?:number, difficulty?:number}} opt
 */
export async function fetchQuestions(opt) {
  const n = Math.max(1, opt.count || 6);
  const seed = opt.seed || 1;

  /* 自分の 単語帳は **手元で 作る**（通信 なし・失敗 なし） */
  if (opt.presetKind === "mine" && opt.presetId) {
    const pairs = localPresetPairs(opt.presetId);
    if (pairs) {
      const q = questionsFromPairs(pairs, n, seed);
      if (q.length >= n) return q.map(norm);
      if (q.length) return q.map(norm).concat(localQuestions(n - q.length, seed + 7));
    }
    /* 単語帳が 消えて いた ときは 黙って 控えへ 落ちる（門が 開かなく なるより よい） */
  }

  try {
    const base = apiBase();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4500);
    const tk = token();
    const r = await fetch(base + "/api/survive/questions", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, tk ? { Authorization: "Bearer " + tk } : {}),
      body: JSON.stringify({
        count: n, presetId: opt.presetId || "", presetKind: opt.presetKind || "",
        presetOwner: opt.presetOwner || 0, seed, difficulty: opt.difficulty || 1
      }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (r.ok) {
      const d = await r.json();
      const rows = (d && d.questions) || [];
      const ok = rows.filter((q) => q && q.prompt && Array.isArray(q.choices) && q.choices.length >= 2
        && typeof q.answer === "number" && q.answer >= 0 && q.answer < q.choices.length);
      if (ok.length >= n) return ok.slice(0, n).map(norm);
      if (ok.length > 0) {
        /* 足りない ぶんは 控えで 埋める */
        return ok.map(norm).concat(localQuestions(n - ok.length, seed + 7));
      }
    }
  } catch (e) { /* 通信できない = 控えで 続ける */ }
  return localQuestions(n, seed);
}

function norm(q) {
  const cs = q.choices.slice(0, 4);
  while (cs.length < 4) cs.push("—");
  return { prompt: String(q.prompt), choices: cs.map(String), answer: q.answer | 0, tag: q.tag || "QUIZ" };
}

export const BANK_SIZE = BANK.length;
