
/* ══════════════════════════════════════════════════════════════════════
   VocabuQuiz — 音声会話（Lumi）

   ・「Hey Lumi」と言うと始まる
   ・始まると画面のフチが波打つ
   ・黙っていると すぐ終わる（フワッと消える）
   ・**必ず 10 分で終わる**

   守っていること:
     ・鍵はブラウザへ出さない（サーバが 1 回きりの一時トークンを配る）
     ・Lumi が話している間は マイクを止める（半二重）
       → iPhone はスピーカーの音をマイクが拾い、Lumi が自分に割り込み続ける。
         これは echoCancellation を付けても直らない（実測ではなく仕様上の話。
         iOS の反響消しは Web Audio の出力を打ち消せない）。
     ・AudioContext は **1 つだけ**作り、実際の採取率を読んで自分で変換する
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  if (root.__vqLiveInstalled) return;
  root.__vqLiveInstalled = true;
  var doc = root.document;

  /* ── 決めごと ── */
  /* ══ 「Hey Lumi」の聞き取り ═══════════════════════════════════════
     ★ 決まった言い方を並べて突き合わせる形は **当たらない**（実測 2026-08-15）。
       端末の認識は「ヘイ、ルミ」「へいるみ」「Hey ルミ」「平ルミ」「へいるーみ」…
       と毎回ちがう字で返す。並べきれない。
     ★ そこで **「ルミ」と呼ばれたか**だけを見る。
       ・カタカナはひらがなに直す（ヘイルミ → へいるみ）
       ・記号と空白を落とす
       ・短い一言のときだけ拾う（長い文の中の「るみ」は呼びかけではない）
     これで「るみ」「ルミ」「lumi」「Hey Lumi」がどれも当たる。 */
  /* ★ **日本語の聞き取りは漢字で返ってくる**（2026-08-15）。
     「ルミ」と言っても、端末は「留美」「瑠美」「流美」と書いて返す。
     ひらがな・カタカナだけを見ていたので、**当たらないことが多かった**。
     漢字の当て字も入れる。ここが「反応しない」のいちばんの原因。 */
  /* ══ 呼びかけの判定は **vq-wake.js** にある（2026-08-15）════════════
     ★ 実機で「ルミ」と言ったとき、iPhone が返してきたのは
       ルビー / 海 / エルミ / テルミ / ヘルミ / 恵み / エミ …。
       「るみ」だったのは 23 回中 4 回だけだった。
       当て字の並びを **実測から** 作り直し、診断ページと共通にした。
     ★ 読み込めなかったときのために、最低限の判定だけ残す。 */
  function isWake(raw) {
    try {
      if (root.VQ_WAKE && root.VQ_WAKE.isWake) return root.VQ_WAKE.isWake(raw);
    } catch (e) {}
    var t = String(raw || "").replace(/[\s\u3000、。・ー]/g, "");
    return t.length <= 16 && /るみ|ルミ|lumi|rumi/i.test(t);
  }
  /* ★ **何と聞こえたかを控える。** 当たらないときに、
     推測ではなく実際の字を見て直せるようにする。 */
  /* ★ 待ち受けの **できごと**も同じ場所に残す。
     「聞こえた言葉を見る」を開けば、始まったのか・落ちたのか・
     何と聞こえたのか が 1 枚で分かる。 */
  function noteEv(what) {
    st.evAt = Date.now();          /* ★ 固まりの見張りに使う */
    st.heardLog.unshift(new Date().toLocaleTimeString("ja-JP") + " 〈" + what + "〉");
    if (st.heardLog.length > 40) st.heardLog.length = 40;
  }
  function noteHeard(txt) {
    if (!txt) return;
    st.heardLog.unshift(new Date().toLocaleTimeString("ja-JP") + " 「" + String(txt).slice(0, 40) + "」");
    if (st.heardLog.length > 40) st.heardLog.length = 40;
  }
  /* ══ いつ切るか（2026-08-15 に直した）═══════════════════════════════
     ★ 前は「8 秒 黙ったら切る」だった。だが考えている間・問題を読んでいる間は
       ふつうに 8 秒を超える。**話している途中や、考えている最中に切れていた。**
     ★ 直した決まり:
         ・**まだ一言も交わしていないとき**だけ、20 秒で切る
           （呼んだのに誰も話さない、を片づけるため。元の狙いはこれ）
         ・**一度でも話したあとは、時間では切らない。**
           終わるのは 10 分の上限か、長押しか、「もういいよ」だけ。 */
  var SILENCE_MS = 20000;       /* まだ一言も交わしていないとき */
  var GREET_GRACE_MS = 20000;
  /* ★ 一度でも話したら、**黙っていても 5 分は続ける**（2026-08-15）。
     まったく切らないと、席を立ったときに枠を焼き続ける。 */
  /* ══ 黙っていても 続ける長さ（2026-08-20 に 10 分 → 60 分）════════════
     ★★ 訴え「10 分で、使えない AI になる。6 区間 60 分が 上限に なるように
       って 言ってるじゃん」。**これが その正体だった。**
       会話の 長さの 上限（60 分）とは 別に、
       「一度でも 話したあと、**黙ったまま 10 分**たったら 終わる」
       という 時計が 走っていた。
       勉強していると 10 分 話しかけないのは ふつうなので、
       板を 読んでいる間・問題を 解いている間に 静かに 終わっていた。
     ★ 60 分に そろえる。終わりは 会話の 上限（st.endAt）で 決める。
     ★ あわせて **打っている・板を解説している・道具が動いた**ときも
       「動いている」と 数える（下の armSilence を 見ること）。 */
  var SILENCE_AFTER_MS = 60 * 60 * 1000;

  var st = {
    on: false, ws: null, ctx: null, mic: null, micNode: null, spk: null,
    stream: null, tEnd: 0, tSilence: 0, timer: 0, speaking: false,
    wake: null, wakeOn: false, host: null,
    words: "", inTurn: false, state: "", talked: false,
    heard: false, heardAt: 0, silenceMs: 0, silenceAt: 0,
    armed: false, wakeBusy: false, wakeRetry: false,
    bargeN: 0, tMute: 0, watch: 0, heardLog: [],
    wakeStartAt: 0, wakeAlive: 0, wakeTries: 0,
    btn: null, btnWant: false, keepStream: null,
    endAt: 0, redial: 0, handoff: false, greeted: false, mods: false, resume: ""
  };

  /* ══ 見た目：画面のフチが波打つ ═══════════════════════════════════
     ★ 絵ではなく **枠**で作る。要素を重ねると、下の画面が押せなくなる。
       pointer-events:none で素通りさせる。 */
  var CSS = [
    /* ══ Dynamic Island 風 ═══════════════════════════════════════════
       ★ **動かすのは形と透明度だけ**にする。
         位置や幅を毎フレーム描き直すとカクつく。transform と opacity は
         端末が別枠で滑らかに動かしてくれるので、そこに寄せる。
       ★ 島から にゅっと広がり、閉じるときは島へ吸い込まれて消える。
       ★ どの画面より上（U.mount は 2147483000）。素通りなので邪魔しない。 */
    "#vqLiveEdge{position:fixed;inset:0;z-index:2147483600;pointer-events:none;}",

    /* ── 島（言葉が出るところ）── */
    "#vqLiveEdge .isl{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 11px);",
    "transform:translateX(-50%) scale(.9);transform-origin:50% 0;",
    "width:126px;min-height:37px;max-width:min(680px,calc(100vw - 24px));",
    "display:flex;align-items:center;justify-content:center;",
    "padding:0;border-radius:22px;background:#000;color:#fff;overflow:hidden;",
    "box-shadow:0 10px 34px rgba(0,0,0,.5);opacity:0;",
    /* ふわっと開く。少し戻る曲線にして、機械っぽさを消す。 */
    "transition:width .52s cubic-bezier(.22,1.2,.32,1),",
    "min-height .52s cubic-bezier(.22,1.2,.32,1),",
    "border-radius .52s cubic-bezier(.22,1.2,.32,1),",
    "padding .52s cubic-bezier(.22,1.2,.32,1),",
    "opacity .34s ease,transform .52s cubic-bezier(.22,1.2,.32,1);}",
    /* 待っているとき: 島のまま、小さな点だけ */
    "#vqLiveEdge.on .isl{opacity:1;transform:translateX(-50%) scale(1);}",
    /* 言葉が出るとき: 横にも縦にも広がる */
    "#vqLiveEdge.open .isl{width:min(680px,calc(100vw - 24px));min-height:56px;",
    "border-radius:26px;padding:14px 20px;}",
    /* 消えるとき: 島へ吸い込まれる */
    "#vqLiveEdge.bye .isl{opacity:0;transform:translateX(-50%) scale(.84);}",

    /* ── いま何をしているか（2026-08-16）──────────────────────────
       ★ 訴え「固まっているように見える」。実際 say() の文字は
         **一度も画面に出していなかった**（点しか見えない）。
       ★ 言葉のときの open とは別の形にする。open は全幅で読ませる用、
         こちらは 中身の幅にすっと伸びる小さな帯。 */
    "#vqLiveEdge.work .isl{width:auto;min-height:37px;padding:0 17px 0 13px;",
    "border-radius:22px;gap:9px;justify-content:flex-start;}",
    "#vqLiveEdge.work .isl span{opacity:1;transform:none;width:auto;text-align:left;",
    "font-size:13.5px;font-weight:600;white-space:nowrap;max-height:none;overflow:visible;}",
    /* 「…」を動かす。止まっていないことが ひと目で分かる。 */
    "#vqLiveEdge.work .isl span::after{content:'';display:inline-block;width:1.1em;",
    "text-align:left;animation:vqlDots 1.25s steps(1,end) infinite;}",
    "@keyframes vqlDots{0%{content:'';}25%{content:'.';}50%{content:'..';}75%{content:'...';}}",
    /* 作業中は 点も速く脈打つ */
    "#vqLiveEdge.work .dot{animation:vqlWork 1.1s ease-in-out infinite;}",
    "@keyframes vqlWork{0%,100%{opacity:.35;transform:scale(.8);}50%{opacity:1;transform:scale(1.15);}}",
    "@media (prefers-reduced-motion:reduce){",
    "#vqLiveEdge.work .isl span::after{animation:none;content:'...';}",
    "#vqLiveEdge.work .dot{animation:none;}}",

    /* 中の文字。開いてから遅れて出す（先に出すと、はみ出して見える）。 */
    "#vqLiveEdge .isl span{display:block;width:100%;text-align:center;",
    "font:600 15px/1.7 Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;",
    "white-space:pre-wrap;word-break:break-word;max-height:34vh;overflow-y:auto;",
    "opacity:0;transform:translateY(5px);",
    "transition:opacity .3s ease .14s,transform .3s ease .14s;}",
    "#vqLiveEdge.open .isl span{opacity:1;transform:none;}",
    /* ★ 飾りが 入った文（見出し・表・図・数式）を 島でも 読めるようにする。
       ふだんの 中央そろえのままだと、箇条書きや 表が ばらける。 */
    /* 飾りが 入った文（見出し・表・図・数式）を 帯でも 読めるようにする。
       ★ 中央そろえのままだと、箇条書きや 表が ばらける。
       ★ 表・コード・図は 帯の幅を 超えるので、**その中だけ 横に すべる**。 */
    "#vqLiveEdge .isl span p{margin:.25em 0;}",
    "#vqLiveEdge .isl span p:first-child{margin-top:0;}",
    "#vqLiveEdge .isl span p:last-child{margin-bottom:0;}",
    "#vqLiveEdge .isl span:has(.vqmd-h),#vqLiveEdge .isl span:has(.vqmd-t),",
    "#vqLiveEdge .isl span:has(.vqmd-ul),#vqLiveEdge .isl span:has(.vqmd-ol),",
    "#vqLiveEdge .isl span:has(.vqmd-zu),#vqLiveEdge .isl span:has(.vqmd-math-b),",
    "#vqLiveEdge .isl span:has(.vqmd-pre){text-align:left;}",
    "#vqLiveEdge .isl span .vqmd-tw,#vqLiveEdge .isl span .vqmd-pre{max-width:100%;}",
    "#vqLiveEdge .isl span .vqmd-t th,#vqLiveEdge .isl span .vqmd-t td{",
    "border-color:rgba(255,255,255,.28);}",
    "#vqLiveEdge .isl span .vqmd-t th{background:rgba(255,255,255,.12);}",
    "#vqLiveEdge .isl span mark{background:rgba(255,214,0,.30);color:inherit;}",
    /* 伏せたことの印。小さく・薄く。会話の文と 混ざらない見た目にする。 */
    "#vqLiveEdge .isl span .vqhid{display:inline-block;margin:.25em 0 0 .5em;",
    "padding:1px 8px;border-radius:999px;background:rgba(255,255,255,.13);",
    "color:rgba(255,255,255,.62);font-size:11px;font-weight:600;font-style:normal;",
    "line-height:1.7;vertical-align:middle;white-space:nowrap;}",
    "#vqLiveEdge .isl span .vqmd-c,#vqLiveEdge .isl span .vqmd-pre{",
    "background:rgba(255,255,255,.14);}",
    "@media (max-width:700px){#vqLiveEdge .isl span{font-size:14.5px;max-height:30vh;}}",

    /* 待っているときの点。息をするようにゆっくり明滅する（点滅ではない）。 */
    "#vqLiveEdge .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;",
    "background:#C4B5FD;box-shadow:0 0 12px 3px rgba(196,181,253,.75);",
    "opacity:.9;transition:opacity .26s ease;}",
    "#vqLiveEdge.open .dot{opacity:0;width:0;}",
    "@media (prefers-reduced-motion:no-preference){",
    "#vqLiveEdge .dot{animation:vqLiveBreath 2.6s ease-in-out infinite;}}",
    "@keyframes vqLiveBreath{0%,100%{transform:scale(.82);opacity:.55}",
    "50%{transform:scale(1.15);opacity:1}}",

    /* ── 画面のフチ。**流れない**。ゆっくり息をするだけ。 ──────────
       ★ もとは box-shadow そのものを 動かしていた（2026-08-27 まで）。
         box-shadow は 端末が 別枠で 動かせない。**毎コマ 画面ぜんぶを
         描き直す**ことになり、しかも ぼかしは 170px。
         非力な端末では コマが 落ちて **チカチカ**して見えた（訴え）。
       ★ 直しかた: 明るい光と 暗い光を **2 枚 重ねて 置いておき**、
         上の 1 枚の 透明度だけ 動かす。透明度は 端末が 別枠で 動かすので、
         描き直しは 起きない。見た目は 前と 同じ 息づかい。 */
    "#vqLiveEdge .glow{position:absolute;inset:0;opacity:0;transition:opacity .6s ease;",
    "box-shadow:inset 0 0 44px 8px rgba(138,129,194,.30),",
    "inset 0 0 120px 24px rgba(117,109,179,.14);}",
    "#vqLiveEdge .glow::after{content:\x27\x27;position:absolute;inset:0;opacity:0;",
    "box-shadow:inset 0 0 78px 16px rgba(167,159,209,.55),",
    "inset 0 0 170px 40px rgba(138,129,194,.28);}",
    "#vqLiveEdge.on .glow{opacity:1;}",
    "@media (prefers-reduced-motion:no-preference){",
    "#vqLiveEdge.on .glow::after{animation:vqLiveGlow 4.2s ease-in-out infinite;",
    "will-change:opacity;}",
    "#vqLiveEdge.talk .glow::after{animation-duration:2.1s;}}",
    /* ★ 非力な端末では **動かさない**。half の 明るさで 止めておく。
       vq-ds.css の body.low-perf は この画面まで 効く（島は 影の DOM ではなく
       本体の body に 置いてあるため）。 */
    "body.low-perf #vqLiveEdge .glow::after{animation:none !important;",
    "will-change:auto !important;opacity:.45;}",
    /* ══ いつでも押せるボタン（2026-08-15）════════════════════════════
       ★ 呼びかけが当たらないときに、**設定を開きに行かせない**ため。
         呼びかけが効いている人には、ただの小さな丸として邪魔にならない。
       ★ 会話中は消える（そのときは長押しで終われる）。 */
    /* ★ **すべて !important**。この画面には button を丸ごと整える指定が
       いくつもあり、位置も大きさも潰される（実測 2026-08-15:
       画面の外へ出て 16px になっていた）。ここは譲らない。 */
    /* ══ 会話中の 文字入力（2026-08-16）══════════════════════════════
       ★ 声だけだと、周りに人がいるとき・言いにくいときに詰まる。
         会話中（フチが出ている間）だけ、右下に小さな入力ボタンを出し、
         押すと下から入力欄が上がる。
       ★ 見た目は **アプリ自身の変数**に乗せる。色を直に書くと、
         ダークにしたときやアクセント色を変えたときに浮く。 */
    /* ══ ボタンの置き場（2026-08-18・訴え「カメラと文字のボタンが 離れすぎ」）══
       ★ 前は 1 つずつ right: 14 / 66 / 118px と **数えて置いていた**。
         画面の共有ボタンは 既定で 出さないので、その 52px ぶんが
         **空いたまま**になり、カメラだけ ぽつんと 離れて見えていた。
       ★ 数えるのをやめる。**横に並べる箱**を 1 つ置き、そこへ入れる。
         出ないボタンがあっても、残りが 自然に 詰まる。
       ★ 箱そのものは 素通り（pointer-events:none）。
         下の画面を 押せなくしない。 */
    /* ══ ★ 置く 高さ（2026-08-20・訴え）══════════════════════════
       「Lumi の マイク、チャット、カメラ、メッセージ表示の 4 つの ボタンの
         位置を もう少し 上に して。Lumi を 起動するための ボタンくらいの
         位置で いい」
       ★ 起動ボタン（#vqLiveBtn）と **同じ 式**にする。
         PC は 下から 88px、スマホは 70px。右端も そろえる。
         会話が 始まると 起動ボタンは 消える（showBtn(false)）ので、
         ちょうど その場所に 4 つが 並ぶ。
       ★ 数字を 別々に 持たない。ずれたら すぐ 気づけなくなる。 */
    "#vqLiveDock{position:fixed !important;z-index:2147483601;",
    "right:calc(env(safe-area-inset-right,0px) + 14px);",
    "bottom:calc(env(safe-area-inset-bottom,0px) + 88px);",
    "display:flex;align-items:center;gap:8px;pointer-events:none;}",
    "#vqLiveDock > *{pointer-events:auto;}",
    /* 文字の帯を 出している 間は、帯の ぶん さらに 上へ 逃がす。 */
    "body.vq-live-bar #vqLiveDock{bottom:calc(env(safe-area-inset-bottom,0px) + 96px);}",
    "@media (max-width:700px){",
      "#vqLiveDock{right:calc(env(safe-area-inset-right,0px) + 10px);",
      "bottom:calc(env(safe-area-inset-bottom,0px) + 70px);}",
      "body.vq-live-bar #vqLiveDock{bottom:calc(env(safe-area-inset-bottom,0px) + 92px);}}",
    /* 設定「会話中のボタンを出す」を切ったとき（vq-settings が body に付ける） */
    "body.vq-live-nodock #vqLiveDock{display:none !important;}",
    "#vqLiveType{position:relative !important;z-index:1;",
    "width:44px !important;height:44px !important;min-width:44px !important;",
    "min-height:44px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text,#2B2836) !important;",
    "display:none;align-items:center;justify-content:center;cursor:pointer;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06) !important;",
    "opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;padding:0;}",
    "#vqLiveType.show{display:flex;}",
    /* == 画面をそのまま見せる（リアルタイムキャスト）のボタン ========== */
    "#vqLiveCast{position:relative !important;z-index:1;",
    "width:44px !important;height:44px !important;min-width:44px !important;",
    "min-height:44px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text,#2B2836) !important;",
    "display:none;align-items:center;justify-content:center;cursor:pointer;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06) !important;",
    "opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;padding:0;}",
    "#vqLiveCast.show{display:flex;}",
    "#vqLiveCast.in{opacity:1;transform:scale(1);}",
    "#vqLiveCast:active{transform:scale(.93);}",
    /* 見せている間は はっきり分かるようにする（勝手に映していると思わせない） */
    "#vqLiveCast.on{background:var(--vq-accent,#756DB3) !important;color:#fff !important;",
    "border-color:transparent !important;}",
    "#vqLiveCast.on::after{content:'';position:absolute;top:-3px;right:-3px;width:10px;height:10px;",
    "border-radius:999px;background:#e5484d;box-shadow:0 0 0 2px var(--vq-surface,#fff);",
    "animation:vqCastBlink 1.4s ease-in-out infinite;}",
    "@keyframes vqCastBlink{0%,100%{opacity:1}50%{opacity:.35}}",
    /* ══ カメラを見せる（AR・2026-08-17）═════════════════════════════
       ★ 訴え「スマホのカメラで見ているものを 共有したい」。
         画面の共有（getDisplayMedia）では **目の前の物**を見せられない。
         カメラの絵を そのまま Lumi へ送る。送り口は 画面の共有と同じ
         realtimeInput なので、番の流れを 壊さない。
       ★ **必ず 自分にも見えるようにする。**カメラは 向けている先が
         自分では分からない。小窓を出さないと「何を見せているのか」が
         分からないまま 送り続けることになる。
       ★ Lumi が 指すための 印（AR）を 絵の上に 重ねる。
         印の位置は 0〜1 の割合で受け取る（px で受けると 端末ごとにずれる）。 */
    "#vqLiveCam{position:relative !important;z-index:1;",
    "width:44px !important;height:44px !important;min-width:44px !important;",
    "min-height:44px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text,#2B2836) !important;",
    "display:none;align-items:center;justify-content:center;cursor:pointer;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06) !important;",
    "opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;padding:0;}",
    "#vqLiveCam.show{display:flex;}",
    "#vqLiveCam.in{opacity:1;transform:scale(1);}",
    "#vqLiveCam:active{transform:scale(.93);}",
    "#vqLiveCam svg{width:20px;height:20px;display:block;}",
    /* ★ 「いま映している」の色は **必ず勝つ**こと。ここが 素の白のままだと、
       映しているのか どうかが 見分けられない（2026-08-18・実測で 負けていた）。 */
    "#vqLiveCam.on{background:var(--vq-accent,#756DB3) !important;color:#fff !important;",
    "border-color:transparent !important;}",
    "#vqLiveCam.on::after{content:'';position:absolute;top:-3px;right:-3px;width:10px;height:10px;",
    "border-radius:999px;background:#e5484d;box-shadow:0 0 0 2px var(--vq-surface,#fff);",
    "animation:vqCastBlink 1.4s ease-in-out infinite;}",
    "@media (max-width:700px){#vqLiveCam{width:40px;height:40px;}",
    "#vqLiveCam svg{width:18px;height:18px;}}",
    /* 小窓（見せているものを 自分でも見る） */
    "#vqLiveAR{position:fixed;z-index:2147483599;display:none;",
    "left:max(14px,env(safe-area-inset-left));",
    "bottom:calc(max(14px,env(safe-area-inset-bottom)) + 0px);",
    "width:168px;border-radius:16px;overflow:hidden;background:#0b0a10;",
    "box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14);",
    "transition:width .22s cubic-bezier(.2,.8,.2,1);}",
    "#vqLiveAR.show{display:block;}",
    "#vqLiveAR.big{width:min(78vw,420px);}",
    "#vqLiveAR .vqar-wrap{position:relative;width:100%;line-height:0;}",
    "#vqLiveAR video{width:100%;height:auto;display:block;background:#0b0a10;}",
    "#vqLiveAR .vqar-marks{position:absolute;inset:0;pointer-events:none;}",
    "#vqLiveAR .vqar-m{position:absolute;transform:translate(-50%,-50%);",
    "display:flex;align-items:center;gap:6px;}",
    "#vqLiveAR .vqar-dot{width:14px;height:14px;border-radius:999px;",
    "background:rgba(229,72,77,.92);box-shadow:0 0 0 3px rgba(229,72,77,.30);",
    "animation:vqCastBlink 1.6s ease-in-out infinite;flex:0 0 auto;}",
    "#vqLiveAR .vqar-t{background:rgba(11,10,16,.82);color:#fff;font-size:11px;",
    "line-height:1.5;padding:3px 7px;border-radius:8px;white-space:nowrap;",
    "max-width:180px;overflow:hidden;text-overflow:ellipsis;}",
    "#vqLiveAR .vqar-bar{display:flex;gap:2px;padding:5px 6px;background:rgba(11,10,16,.92);}",
    "#vqLiveAR .vqar-bar button{flex:1 1 auto;border:0;background:transparent;color:#e9e7f2;",
    "font:inherit;font-size:11px;padding:5px 2px;border-radius:8px;cursor:pointer;}",
    "#vqLiveAR .vqar-bar button:active{background:rgba(255,255,255,.14);}",
    /* ══ 紙に貼りつく 答えの札（2026-08-17）════════════════════════
       ★ 訴え「空欄に 解答を 残しておいて。カメラが動いても そこに 出し続けて。
         そこを 押すと 解説も 出るように」。
       ★ 位置は 追跡が 出す **0〜1 の割合**。px で置くと 小窓の大きさで ずれる。
       ★ 見失ったら **薄くする**。間違った所を はっきり指すより、
         薄れて 消えるほうが まし。 */
    "#vqLiveAR .vqar-marks{pointer-events:none;}",
    "#vqLiveAR .vqar-ans{position:absolute;transform:translate(-50%,-50%);",
    "pointer-events:auto;cursor:pointer;max-width:86%;}",
    "#vqLiveAR .vqar-ans .vqar-chip{display:inline-flex;align-items:center;gap:4px;",
    "background:rgba(46,160,67,.94);color:#fff;font-size:12px;font-weight:700;",
    "line-height:1.35;padding:3px 8px;border-radius:8px;white-space:nowrap;",
    "box-shadow:0 2px 8px rgba(0,0,0,.35);max-width:100%;overflow:hidden;",
    "text-overflow:ellipsis;}",
    "#vqLiveAR .vqar-ans.is-low .vqar-chip{background:rgba(214,150,0,.95);}",
    "#vqLiveAR .vqar-ans .vqar-chip i{font-style:normal;opacity:.85;font-size:10px;}",
    /* ★ 解説は **小さい吹き出しでは 出さない**（2026-08-17・訴え
       「解説は もう この大きいパネルで いい。そのほうが 分かりやすい」）。
       小窓の中の 吹き出しは 狭くて、式も 表も 入らなかった。
       押したら **板（#vqLiveNote）**に 出す。中身は 持っておくだけ。 */
    "#vqLiveAR .vqar-ans .vqar-why{display:none;}",
    "#vqLiveAR .vqar-ans.open .vqar-chip{outline:2px solid #fff;outline-offset:1px;}",
    "#vqLiveAR.big .vqar-ans .vqar-chip{font-size:13px;padding:4px 10px;}",
    /* ══ 端末を 横にしたとき（2026-08-17）════════════════════════════
       ★ 訴え「カメラが 横になったら、上部の 文字も 横に なるように」。
       ★ アプリを 縦で 固定していると、端末を 倒しても 画面は 回らない。
         だから **こちらで 回す**。回すのは 帯（島）と 小窓と 板の 3 つだけ。
       ★ 回すと 幅と高さが 入れ替わるので、幅は vh で 決める。 */
    "body.vq-yoko #vqLiveEdge .isl{transform-origin:center center;}",
    "body.vq-yoko-r #vqLiveEdge .isl{transform:translateX(-50%) rotate(90deg);}",
    "body.vq-yoko-l #vqLiveEdge .isl{transform:translateX(-50%) rotate(-90deg);}",
    /* 回すと 幅と高さが 入れ替わるので 幅を vh で決める。
       古い端末むけに 100vh を先に、対応する端末には 100dvh を後で当てる。 */
    "body.vq-yoko #vqLiveEdge.open .isl{width:min(680px,calc(100vh - 24px));}",
    "body.vq-yoko #vqLiveEdge.open .isl{width:min(680px,calc(100dvh - 24px));}",
    "body.vq-yoko-r #vqLiveEdge.open .isl{transform:translateX(-50%) rotate(90deg);}",
    "body.vq-yoko-l #vqLiveEdge.open .isl{transform:translateX(-50%) rotate(-90deg);}",
    "body.vq-yoko #vqLiveAR{transform-origin:bottom left;}",
    "body.vq-yoko-r #vqLiveAR{transform:rotate(90deg) translateY(-100%);}",
    "body.vq-yoko-l #vqLiveAR{transform:rotate(-90deg) translateX(-100%);}",
    "body.vq-yoko #vqLiveNote{width:min(94vh,680px);}",
    "body.vq-yoko-r #vqLiveNote{transform:translateX(-50%) rotate(90deg);}",
    "body.vq-yoko-l #vqLiveNote{transform:translateX(-50%) rotate(-90deg);}",
    "body.vq-yoko-r #vqLiveNote.in{transform:translateX(-50%) rotate(90deg);}",
    "body.vq-yoko-l #vqLiveNote.in{transform:translateX(-50%) rotate(-90deg);}",
    /* ══ かたちのある板（2026-08-17）════════════════════════════════
       ★ 訴え「上に出てくるやつを マークダウン付きにできない？
         強調・線・図・表・色・数式」。
       ★ 島（.isl）は 声の書き起こしを 流すための 細い帯で、
         表や 図を 入れる場所が 無い。**別に 板を出す。**
       ★ 声は 声のまま。板は Lumi が showNote で 出したときだけ 開く。 */
    /* ★ **カメラより 前面**（2026-08-17・訴え「解説を カメラよりも最前面に」）。
       小窓（#vqLiveAR）は 599。板は それより 上の 600 に置く。
       ボタン（601）より 下にしておく——**止める手段は 常に 押せること。** */
    "#vqLiveNote{position:fixed;z-index:2147483600;display:none;",
    "left:50%;transform:translateX(-50%) translateY(-8px);",
    "top:calc(max(10px,env(safe-area-inset-top)) + 58px);",
    "width:min(94vw,680px);max-height:min(62vh,560px);overflow:auto;",
    /* ★ **透けさせない。**下に絵があると 字が読めなくなる（実測で 透けた）。
       色の変数が 半透明でも 大丈夫なように、後ろを ぼかして 重ねる。 */
    "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);",
    "-webkit-backdrop-filter:blur(18px) saturate(1.15);backdrop-filter:blur(18px) saturate(1.15);",
    "border:1px solid var(--vq-border,#E7E4EF);border-radius:18px;",
    "box-shadow:0 12px 40px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.08);",
    "padding:14px 16px 16px;font-size:15px;",
    "opacity:0;transition:opacity .18s ease,transform .18s cubic-bezier(.2,.8,.2,1);",
    "-webkit-overflow-scrolling:touch;}",
    /* ── 動くもの（AR App）を 出すとき（2026-08-19）──
       字を読むだけの板より 広く要る。触るので 高さも 稼ぐ。 */
    /* ★ クラス名は **必ず namespace を 付ける**（2026-08-19 の 3 度目・実測）。
       もとは "app" と 付けていたが、本体の CSS に
         .app{display:flex}  /  body.auth-gate-open .app{display:none !important}
       が あり、板が **flex に なって 崩れ**、場面によっては **丸ごと 消えて**いた。
       訴え「画面がバグってる。生成したものが途切れる」の 正体はこれ。 */
    "#vqLiveNote.vqn-appmode{width:min(96vw,880px);max-height:min(84vh,820px);}",
    /* ★ 全画面（2026-08-19 の 3 度目・訴え「途切れる。全画面にして」）。
       置き場所を 覚えている ぶんの inline style を 押しのけるので **すべて !important**。 */
    "#vqLiveNote.vqn-zen{position:fixed !important;left:0 !important;top:0 !important;",
    "right:0 !important;bottom:0 !important;width:100vw !important;height:100vh !important;",
    "max-width:none !important;max-height:none !important;margin:0 !important;",
    "transform:none !important;border-radius:0 !important;border:0 !important;",
    "padding:8px 10px calc(8px + env(safe-area-inset-bottom)) 10px !important;",
    "display:flex !important;flex-direction:column !important;overflow:hidden !important;",
    "z-index:2147483640 !important;}",
    "#vqLiveNote.vqn-zen .vqn-b{flex:1 1 auto;min-height:0;overflow:auto;}",
    "#vqLiveNote.vqn-zen .vqn-app{height:100%;}",
    "#vqLiveNote.vqn-zen .vqn-app iframe{height:100% !important;min-height:0 !important;}",
    "#vqLiveNote.vqn-zen .vqn-h{flex:0 0 auto;}",
    /* 操作の帯（全画面・拡大・縮小）。
       ★ 2026-08-20・訴え「普通のボードを 全画面にしたりだとかも。
         ゲームや アプリの ボードと 同じように、ボードを 自由に
         縮小拡大できたりとかも いいかも」。
         もとは **動くもの（AR App）のときだけ** 出していた。
         書いたものの ほうが 長くて 読みにくいのに、そちらだけ
         全画面に できなかった。どの板でも 出す。
       ★ たたんだ ときは 出さない（見出しだけに する ためのもの）。 */
    "#vqLiveNote .vqn-ops{display:flex;align-items:center;gap:6px;margin:0 0 8px;flex-wrap:wrap;}",
    "#vqLiveNote.fold .vqn-ops{display:none;}",
    "#vqLiveNote.vqn-zen .vqn-ops{flex:0 0 auto;}",
    "#vqLiveNote .vqn-ops button{min-width:34px !important;height:30px !important;",
    "min-height:30px !important;padding:0 10px !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "box-shadow:none !important;color:var(--vq-text,#2B2836) !important;font:inherit;",
    "font-size:12.5px !important;font-weight:650 !important;cursor:pointer;",
    "display:inline-flex;align-items:center;justify-content:center;}",
    "#vqLiveNote .vqn-ops button:hover{background:var(--vq-surface-hover,#F7F5FC) !important;}",
    "#vqLiveNote .vqn-ops .vqn-zoomv{font-size:12px;color:var(--vq-text-tertiary,#9994A8);",
    "min-width:44px;text-align:center;font-variant-numeric:tabular-nums;}",
    "#vqLiveNote .vqn-app{border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;",
    "overflow:hidden;background:#FCFBFE;}",
    "#vqLiveNote .vqn-app iframe{display:block;width:100%;border:0;}",
    "#vqLiveNote .vqn-appmsg{margin:0 0 8px;padding:7px 11px;border-radius:10px;",
    "font-size:12.5px;line-height:1.6;background:#EAF6EE;color:#2F6B45;",
    "border:1px solid #CBE6D6;white-space:pre-wrap;word-break:break-word;}",
    "#vqLiveNote .vqn-appmsg.ng{background:#FDECEC;color:#9A2A2A;border-color:#F3C9C9;}",
    "#vqLiveNote.show{display:block;}",
    "#vqLiveNote.in{opacity:1;transform:translateX(-50%) translateY(0);}",
    /* ★ 下まで読んだ所からでも つまめるように、見出しの帯は 上に貼り付ける。 */
    "#vqLiveNote .vqn-h{display:flex;align-items:center;gap:6px;margin:0 0 6px;",
    "position:sticky;top:0;z-index:2;background:var(--vq-surface,#fff);padding:2px 0 4px;}",
    "#vqLiveNote .vqn-t{flex:1 1 auto;font-weight:700;font-size:15px;line-height:1.5;}",
    /* 再生・保存。見出しの すぐ右。押せることが 分かる 大きさにする。 */
    "#vqLiveNote .vqn-p,#vqLiveNote .vqn-s{flex:0 0 auto;width:30px;height:30px;",
    "border-radius:999px;border:0;background:transparent;cursor:pointer;font:inherit;",
    "color:var(--vq-text-secondary,#5A5568);display:flex;align-items:center;justify-content:center;}",
    "#vqLiveNote .vqn-p svg,#vqLiveNote .vqn-s svg{width:17px;height:17px;display:block;}",
    "#vqLiveNote .vqn-p:hover,#vqLiveNote .vqn-s:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    "#vqLiveNote .vqn-p.on{background:#5F579E;color:#fff;}",
    "#vqLiveNote .vqn-s.done{color:#2F6B45;}",
    "#vqLiveNote .vqn-x{flex:0 0 auto;width:30px;height:30px;border-radius:999px;border:0;",
    "background:transparent;color:var(--vq-text-tertiary,#9994A8);cursor:pointer;font:inherit;",
    "display:flex;align-items:center;justify-content:center;}",
    "#vqLiveNote .vqn-x:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    "@media (max-width:700px){#vqLiveNote{width:96vw;font-size:14px;padding:12px 13px 14px;",
    "max-height:min(58vh,460px);}}",
    "#vqLiveType.in{opacity:1;transform:scale(1);}",
    "#vqLiveType:active{transform:scale(.93);}",
    "#vqLiveType svg{width:20px;height:20px;display:block;}",
    "@media (max-width:700px){#vqLiveType{width:40px;height:40px;}",
    "#vqLiveType svg{width:18px;height:18px;}}",

    "#vqLiveBtn{position:fixed !important;",
    "right:calc(env(safe-area-inset-right,0px) + 14px) !important;",
    "left:auto !important;top:auto !important;",
    "bottom:calc(env(safe-area-inset-bottom,0px) + 88px) !important;",
    "z-index:2147483590 !important;",
    /* ★ **邪魔にならない大きさと濃さ**にする（2026-08-15）。
       押すときだけはっきりする。ふだんは背景になじませる。 */
    "width:40px !important;height:40px !important;min-width:40px !important;",
    "min-height:40px !important;max-width:40px !important;max-height:40px !important;",
    "padding:0 !important;margin:0 !important;flex:0 0 auto !important;",
    "border-radius:50% !important;border:0 !important;cursor:pointer;",
    "background:#1B1922 !important;color:#C4B5FD !important;",
    "display:none;align-items:center !important;justify-content:center !important;",
    "box-shadow:0 8px 24px rgba(0,0,0,.42) !important;",
    "-webkit-tap-highlight-color:transparent;",
    "opacity:0;transform:scale(.86);",
    "transition:opacity .3s ease,transform .3s cubic-bezier(.22,1.2,.32,1);}",
    "#vqLiveBtn.show{display:flex !important;}",
    "#vqLiveBtn.in{opacity:.42;transform:scale(1);}",
    "#vqLiveBtn.in:hover,#vqLiveBtn.in:focus-visible{opacity:1;}",
    "#vqLiveBtn:active{transform:scale(.92);opacity:1 !important;}",
    "#vqLiveBtn svg{width:19px !important;height:19px !important;display:block;}",
    "@media (max-width:700px){#vqLiveBtn{width:38px !important;height:38px !important;",
    "min-width:38px !important;min-height:38px !important;",
    "max-width:38px !important;max-height:38px !important;",
    "right:calc(env(safe-area-inset-right,0px) + 10px) !important;",
    "bottom:calc(env(safe-area-inset-bottom,0px) + 70px) !important;}",
    "#vqLiveBtn svg{width:17px !important;height:17px !important;}}",
    /* 動かすのは **透明度だけ**。影の 形は 上で 決め打ちにしてある。 */
    "@keyframes vqLiveGlow{0%,100%{opacity:0}50%{opacity:1}}",
    /* 点・「…」も 同じ理由で、非力な端末では 止める（速める のではなく）。 */
    "body.low-perf #vqLiveEdge .dot{animation:none !important;}",
    "body.low-perf #vqLiveEdge.work .isl span::after{animation:none !important;content:\x27...\x27;}",

    /* ══ 会話の履歴（2026-08-18・訴え）══════════════════════════════
       ★ 「文字で伝える」を開いている間、**自分の言葉と Lumi の言葉**を
         さかのぼって読めるようにする。声は流れて消えるので、
         打って聞くときほど「さっき何て言った？」が要る。
       ★ 板のような 1 枚の面にはしない。**1 つずつ浮いている**形にする
         （空間にメッセージが置いてある感じ）。
       ★ 箱そのものは 素通り。玉だけ押せる。画面の操作を奪わない。
       ★ それでも邪魔なときのために、出す／しまうを 押して選べる。 */
    "#vqLiveLog{position:fixed;z-index:2147483598;display:none;",
    "right:max(14px,env(safe-area-inset-right));left:auto;",
    /* ★ 4 つのボタンの **すぐ上**（2026-08-20）。ボタンを 上げたので、
       ここも 同じだけ 上げないと 重なる（44px の ボタン ＋ すき間）。 */
    "bottom:calc(env(safe-area-inset-bottom,0px) + 136px);",
    "width:min(380px,calc(100vw - 28px));max-height:min(52vh,460px);",
    "overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;",
    "pointer-events:none;padding:2px;",
    /* ★ font の一括指定に inherit は **書けない**（2026-08-18・実測）。
       'font:500 13.5px/1.75 inherit' は 丸ごと 捨てられ、行の高さが
       normal のままになって **畳みの判定が 効かなかった**。
       書体はここで決め、大きさと行は 1 つずつ 書く。 */
    "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;}",
    "#vqLiveLog.show{display:block;}",
    "#vqLiveLog::-webkit-scrollbar{width:0;height:0;}",
    /* 入力欄が上がっている間は その上へ逃がす（重ねない） */
    "body.vq-live-bar #vqLiveLog{bottom:calc(env(safe-area-inset-bottom,0px) + 144px);}",
    /* 頭（会話の履歴 ／ Quick Chat に残す）。下まで読んでも 消えない。 */
    "#vqLiveLog .vqlg-h{position:sticky;top:0;z-index:2;pointer-events:auto;",
    "display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:5px 4px 7px;}",
    /* ★ 見出しも 玉と同じで **何の上に来るか 分からない**。
       透けたままだと 下の文字と 重なって 読めない（実測）。小さな面を敷く。 */
    "#vqLiveLog .vqlg-n{flex:0 0 auto;font-size:11px;font-weight:750;letter-spacing:.04em;",
    "color:var(--vq-text-secondary,#5A5568);padding:3px 9px;border-radius:999px;",
    "background:var(--vq-surface,#fff);box-shadow:0 2px 8px rgba(15,23,42,.10);",
    "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}",
    "#vqLiveLog .vqlg-sp{flex:1 1 auto;}",
    "#vqLiveLog .vqlg-save{flex:0 0 auto;padding:4px 11px;border-radius:999px;",
    "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
    "color:var(--vq-text-secondary,#5A5568);font-family:inherit;font-weight:700;",
    "font-size:11px;line-height:1.6;cursor:pointer;white-space:nowrap;",
    "box-shadow:0 2px 8px rgba(15,23,42,.10);}",
    "#vqLiveLog .vqlg-m{display:flex;margin:0 0 8px;opacity:0;transform:translateY(7px);",
    "transition:opacity .26s ease,transform .26s cubic-bezier(.2,.8,.2,1);}",
    "#vqLiveLog .vqlg-m.in{opacity:1;transform:none;}",
    "#vqLiveLog .vqlg-m.me{justify-content:flex-end;}",
    "#vqLiveLog .vqlg-c{pointer-events:auto;max-width:88%;padding:8px 13px 9px;",
    "border-radius:17px;box-shadow:0 6px 22px rgba(15,23,42,.16);",
    "-webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);}",
    "#vqLiveLog .vqlg-m.ai .vqlg-c{background:rgba(24,22,34,.88);color:#fff;",
    "border-bottom-left-radius:7px;}",
    "#vqLiveLog .vqlg-m.me .vqlg-c{background:var(--vq-accent,#756DB3);color:#fff;",
    "border-bottom-right-radius:7px;}",
    "#vqLiveLog .vqlg-t{font-weight:500;font-size:13.5px;line-height:1.75;",
    "white-space:pre-wrap;word-break:break-word;}",
    /* ★ 古いものほど 少しだけ 奥へ。**薄さでは やらない**（2026-08-18・実測）。
       濃さを 落とすと 面の色ごと 薄くなって、白い字が 背景に 溶ける。
       浮いている感じは 影と ぼかしで 足りているので、
       ここは **影を弱める**だけにして 読みやすさを 守る。 */
    "#vqLiveLog .vqlg-m.far .vqlg-c{box-shadow:0 3px 12px rgba(15,23,42,.10);}",
    "#vqLiveLog .vqlg-m.far2 .vqlg-c{box-shadow:0 2px 7px rgba(15,23,42,.07);}",
    /* 2 行を超えたら 畳む。押すと 伸びる。 */
    "#vqLiveLog .vqlg-m.clip .vqlg-t{display:-webkit-box;-webkit-line-clamp:2;",
    "-webkit-box-orient:vertical;overflow:hidden;}",
    "#vqLiveLog .vqlg-more{display:none;margin:3px 0 0 !important;padding:2px 0 !important;",
    "border:0 !important;background:none !important;background-image:none !important;",
    "box-shadow:none !important;border-radius:0 !important;min-height:0 !important;",
    "font-family:inherit !important;font-weight:700 !important;font-size:11.5px !important;",
    "line-height:1.6 !important;color:inherit !important;opacity:.86;cursor:pointer;",
    "text-decoration:underline;text-underline-offset:2px;}",
    "#vqLiveLog .vqlg-m.long .vqlg-more{display:block;}",
    "#vqLiveLog .vqlg-e{pointer-events:auto;text-align:center;padding:14px 8px;",
    "font-family:inherit;font-weight:600;font-size:12px;line-height:1.7;",
    "color:var(--vq-text-tertiary,#9994A8);}",
    "@media (max-width:700px){#vqLiveLog{left:max(10px,env(safe-area-inset-left));",
    "right:max(10px,env(safe-area-inset-right));width:auto;max-height:42vh;",
    "bottom:calc(env(safe-area-inset-bottom,0px) + 114px);}",
    "body.vq-live-bar #vqLiveLog{bottom:calc(env(safe-area-inset-bottom,0px) + 136px);}}",
    /* ══ マイクを 止める（2026-08-18・訴え）══════════════════════════
       ★ 止めていることが **ひと目で分かる**こと。ここが分からないと
         「話しかけても 反応しない」に見える（いちばん困る間違え方）。
         ボタンを 赤くするだけでなく、**画面の上の点も 赤く**する。
         ボタンは 見ていなくても、点は 会話中ずっと 目に入る。 */
    "#vqLiveMic{position:relative !important;z-index:1;",
    "width:44px;height:44px;border-radius:999px;border:1px solid var(--vq-border,#E7E4EF);",
    "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);",
    "display:none;align-items:center;justify-content:center;cursor:pointer;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06);",
    "opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;padding:0;}",
    "#vqLiveMic.show{display:flex;}",
    "#vqLiveMic.in{opacity:1;transform:scale(1);}",
    "#vqLiveMic:active{transform:scale(.93);}",
    "#vqLiveMic svg{width:20px;height:20px;display:block;}",
    "#vqLiveMic .sl{display:none;}",
    "#vqLiveMic.off .sl{display:block;}",
    "@media (max-width:700px){#vqLiveMic{width:40px;height:40px;}",
    "#vqLiveMic svg{width:18px;height:18px;}}",
    /* 止めている間は 画面の上の点も 赤くする */
    "body.vq-live-mute #vqLiveEdge .dot{background:#E5484D !important;",
    "box-shadow:0 0 12px 3px rgba(229,72,77,.62) !important;}",
    /* 履歴の 出し入れボタン（置き場の いちばん左） */
    "#vqLiveLogBtn{position:relative !important;z-index:1;",
    "width:44px !important;height:44px !important;min-width:44px !important;",
    "min-height:44px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text,#2B2836) !important;",
    "display:none;align-items:center;justify-content:center;cursor:pointer;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06) !important;",
    "opacity:0;transform:scale(.9);transition:opacity .18s ease,transform .18s ease;padding:0;}",
    "#vqLiveLogBtn.show{display:flex;}",
    "#vqLiveLogBtn.in{opacity:1;transform:scale(1);}",
    "#vqLiveLogBtn:active{transform:scale(.93);}",
    "#vqLiveLogBtn svg{width:20px;height:20px;display:block;}",
    "#vqLiveLogBtn.on{background:var(--vq-accent,#756DB3) !important;color:#fff !important;",
    "border-color:transparent !important;}",
    "@media (max-width:700px){#vqLiveLogBtn{width:40px;height:40px;}",
    "#vqLiveLogBtn svg{width:18px;height:18px;}}",

    /* ══ 長い返事を 畳む（2026-08-18・訴え）════════════════════════
       ★ 帯（島）に 全文が出ると、返事が長いときに 画面の上半分が 埋まる。
         2 行までにして、続きは 押したときだけ 出す。
       ★ 開いたかどうかは **覚えておく**。番が変わるたびに 畳み直すと、
         長い説明を 読んでいる最中に 引っ込む。 */
    "#vqLiveEdge .isl{flex-wrap:wrap;}",
    "#vqLiveEdge.open.clip .isl span{display:-webkit-box;-webkit-line-clamp:2;",
    "-webkit-box-orient:vertical;overflow:hidden;max-height:none;}",
    /* ★ **すべて !important**（2026-08-18・実測）。
       body[data-ui-v2] の button 一括指定が !important で 白い面を 塗ってくる。
       付けずに出したら、黒い帯の中に **白い箱**が 現れた。ここは譲らない。 */
    "#vqLiveEdge .isl .vqmore{display:none;flex:0 0 100%;pointer-events:auto;",
    "margin:5px 0 0 !important;padding:2px 0 !important;",
    "border:0 !important;background:none !important;background-image:none !important;",
    "box-shadow:none !important;border-radius:0 !important;min-height:0 !important;",
    "color:rgba(255,255,255,.74) !important;font-family:inherit !important;",
    "font-weight:700 !important;font-size:11.5px !important;line-height:1.7 !important;",
    "cursor:pointer;text-align:center;text-decoration:underline;text-underline-offset:2px;}",
    "#vqLiveEdge.open .isl .vqmore.on{display:block;}",

    /* ══ つまんで動かす（2026-08-18・訴え）════════════════════════
       ★ 板もカメラの小窓も、置き場所が 決め打ちだった。
         紙を 映しながら 板を読むとき、どちらかが 必ず邪魔になる。
       ★ 掴む所は **見出しの帯だけ**。中身を なぞったときは 動かない
         （読むための スクロールを 奪わない）。
       ★ 動かした場所は 端末に残す。次に出したとき そこに出る。 */
    "#vqLiveNote .vqn-h{cursor:grab;touch-action:none;user-select:none;",
    "-webkit-user-select:none;}",
    "#vqLiveNote .vqn-h:active{cursor:grabbing;}",
    "#vqLiveNote.moved{transform:none;}",
    "#vqLiveNote.moved.in{transform:none;}",
    "body.vq-yoko-r #vqLiveNote.moved,body.vq-yoko-r #vqLiveNote.moved.in{transform:rotate(90deg);}",
    "body.vq-yoko-l #vqLiveNote.moved,body.vq-yoko-l #vqLiveNote.moved.in{transform:rotate(-90deg);}",
    "#vqLiveNote.fold{max-height:none;overflow:hidden;}",
    "#vqLiveNote.fold .vqn-b{display:none;}",
    "#vqLiveNote.fold .vqn-h{margin-bottom:0;}",
    "#vqLiveNote .vqn-g{flex:0 0 auto;width:24px;height:30px;display:flex;",
    "align-items:center;justify-content:center;color:var(--vq-text-tertiary,#9994A8);}",
    "#vqLiveNote .vqn-g svg{width:16px;height:16px;display:block;}",
    "#vqLiveNote .vqn-f,#vqLiveNote .vqn-r{flex:0 0 auto;",
    "width:30px !important;height:30px !important;min-width:30px !important;",
    "min-height:30px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:0 !important;background:transparent !important;",
    "background-image:none !important;box-shadow:none !important;cursor:pointer;",
    "font:inherit;color:var(--vq-text-tertiary,#9994A8) !important;",
    "display:flex;align-items:center;justify-content:center;}",
    "#vqLiveNote .vqn-f:hover,#vqLiveNote .vqn-r:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    "#vqLiveNote .vqn-f svg,#vqLiveNote .vqn-r svg{width:15px;height:15px;display:block;",
    "transition:transform .2s ease;}",
    "#vqLiveNote.fold .vqn-f svg{transform:rotate(-90deg);}",
    "#vqLiveNote .vqn-r{display:none;}",
    "#vqLiveNote.moved .vqn-r{display:flex;}",
    "#vqLiveAR .vqar-grip{flex:0 0 auto;width:26px;display:flex;align-items:center;",
    "justify-content:center;color:rgba(233,231,242,.72);cursor:grab;touch-action:none;",
    "user-select:none;-webkit-user-select:none;}",
    "#vqLiveAR .vqar-grip:active{cursor:grabbing;}",
    "#vqLiveAR .vqar-grip svg{width:14px;height:14px;display:block;}",
    "#vqLiveAR.moved{bottom:auto;right:auto;}",
    "body.vq-yoko-r #vqLiveAR.moved{transform:rotate(90deg);}",
    "body.vq-yoko-l #vqLiveAR.moved{transform:rotate(-90deg);}",

    /* ══ 一括指定に 勝たせる（2026-08-18・実測）══════════════════════
       ★ このアプリには
           body[data-ui-v2] :is(button, …):not(#appTabBar button)
         という **すべての button を 白く塗る** 指定がある。
         詳細度 2,2,2 ＋ !important。**!important を付けても 勝てない。**
         実測: 黒い帯の中の「つづきを読む」が 白い箱になり、
         カメラを 映している間の 紫も 白のままだった
         （＝映しているのか どうか 見分けられない）。
       ★ 直しかたは この画面の中に すでに前例がある
         （#appV2SidebarBackdrop を ID 3 つ重ねで 3,2,2 にしている）。
         同じ手で 塗り返す。**ここを消すと 白い箱に 戻る。** */
    "html body #vqLiveEdge#vqLiveEdge#vqLiveEdge .isl .vqmore{",
    "background:none !important;background-image:none !important;",
    "background-color:transparent !important;color:rgba(255,255,255,.74) !important;",
    "border:0 !important;box-shadow:none !important;border-radius:0 !important;",
    "padding:2px 0 !important;min-height:0 !important;font-family:inherit !important;",
    "font-weight:700 !important;font-size:11.5px !important;line-height:1.7 !important;}",
    "html body #vqLiveLog#vqLiveLog#vqLiveLog .vqlg-save{",
    "padding:4px 11px !important;min-height:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text-secondary,#5A5568) !important;font-family:inherit !important;",
    "font-weight:700 !important;font-size:11px !important;line-height:1.6 !important;",
    "box-shadow:0 2px 8px rgba(15,23,42,.10) !important;}",
    "html body #vqLiveLog#vqLiveLog#vqLiveLog .vqlg-more{",
    "background:none !important;background-image:none !important;",
    "background-color:transparent !important;color:inherit !important;",
    "border:0 !important;box-shadow:none !important;border-radius:0 !important;",
    "padding:2px 0 !important;min-height:0 !important;font-family:inherit !important;",
    "font-weight:700 !important;font-size:11.5px !important;line-height:1.6 !important;}",
    /* 置き場の 3 つ（＋履歴）。丸・白・薄い枠を 守る。 */
    "html body #vqLiveMic#vqLiveMic#vqLiveMic,",
    "html body #vqLiveLogBtn#vqLiveLogBtn#vqLiveLogBtn,",
    "html body #vqLiveType#vqLiveType#vqLiveType,",
    "html body #vqLiveCast#vqLiveCast#vqLiveCast,",
    "html body #vqLiveCam#vqLiveCam#vqLiveCam{",
    "width:44px !important;height:44px !important;min-width:44px !important;",
    "min-height:44px !important;padding:0 !important;margin:0 !important;",
    "border-radius:999px !important;border:1px solid var(--vq-border,#E7E4EF) !important;",
    "background:var(--vq-surface,#fff) !important;background-image:none !important;",
    "color:var(--vq-text,#2B2836) !important;",
    "box-shadow:0 6px 18px rgba(15,23,42,.10),0 1px 3px rgba(15,23,42,.06) !important;}",
    /* ★ 「いま映している」「履歴を出している」の色は **必ず勝つ**こと。 */
    "html body #vqLiveLogBtn#vqLiveLogBtn#vqLiveLogBtn.on,",
    "html body #vqLiveCast#vqLiveCast#vqLiveCast.on,",
    "html body #vqLiveCam#vqLiveCam#vqLiveCam.on{",
    "background:var(--vq-accent,#756DB3) !important;background-image:none !important;",
    "color:#fff !important;border-color:transparent !important;}",
    /* 止めている間は **赤**。紫（＝働いている色）と 見分けが付くようにする。 */
    "html body #vqLiveMic#vqLiveMic#vqLiveMic.off{",
    "background:#E5484D !important;background-image:none !important;",
    "color:#fff !important;border-color:transparent !important;}",
    "@media (max-width:700px){",
    "html body #vqLiveMic#vqLiveMic#vqLiveMic,",
    "html body #vqLiveLogBtn#vqLiveLogBtn#vqLiveLogBtn,",
    "html body #vqLiveType#vqLiveType#vqLiveType,",
    "html body #vqLiveCast#vqLiveCast#vqLiveCast,",
    "html body #vqLiveCam#vqLiveCam#vqLiveCam{",
    "width:40px !important;height:40px !important;min-width:40px !important;",
    "min-height:40px !important;}}",
    /* 板の 頭のボタン（たたむ・位置を戻す・閉じる） */
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-f,",
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-r,",
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-x{",
    "background:transparent !important;background-image:none !important;",
    "color:var(--vq-text-tertiary,#9994A8) !important;border:0 !important;",
    "box-shadow:none !important;border-radius:999px !important;",
    "width:30px !important;height:30px !important;min-width:30px !important;",
    "min-height:30px !important;padding:0 !important;}",
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-f:hover,",
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-r:hover,",
    "html body #vqLiveNote#vqLiveNote#vqLiveNote .vqn-x:hover{",
    "background:var(--vq-surface-hover,#F7F5FC) !important;}",
    /* カメラの小窓の 3 つ（切替・大きく・やめる）。暗い帯の上の 文字。 */
    "html body #vqLiveAR#vqLiveAR#vqLiveAR .vqar-bar button{",
    "background:transparent !important;background-image:none !important;",
    "color:#e9e7f2 !important;border:0 !important;box-shadow:none !important;",
    "border-radius:8px !important;min-height:0 !important;padding:5px 2px !important;",
    "font-family:inherit !important;font-size:11px !important;font-weight:600 !important;}",
    "html body #vqLiveAR#vqLiveAR#vqLiveAR .vqar-bar button:active{",
    "background:rgba(255,255,255,.14) !important;}"
  ].join("");

  /* ★ 見た目の指定は **ボタンより先に**入れる。
     前は島（ensureHost）の中でだけ入れていたので、
     ボタンだけ先に作られたときに **素のボタンのまま**置かれ、
     画面の外へ流れていた（実測: position が static のままだった）。 */
  /* ★ **いちばん最後に置く**（2026-08-16）。
     同じ強さ（!important どうし・同じ細かさ）なら **あとに書いたほうが勝つ**。
     こちらは早い段階で差し込むので、アプリの CSS があとから読まれると負ける。
     実測: 枠も面も効かず、入力欄だけ四角い箱に見えていた。
     出すたびに末尾へ置き直せば、必ずこちらが勝つ。 */
  function ensureCss() {
    /* ★ 飾りの見た目は **島でも 板でも** 要る。板を作ったときだけ入れると、
       島に 飾りつきの文が来たとき 素のまま出る（実測で そうなる作りだった）。 */
    try {
      if (!doc.getElementById("vqmdCss") && root.VQMD && root.VQMD.CSS) {
        var sm = doc.createElement("style");
        sm.id = "vqmdCss";
        sm.textContent = root.VQMD.CSS() + (root.VQG && root.VQG.CSS ? root.VQG.CSS() : "");
        doc.head.appendChild(sm);
      }
    } catch (e0) {}
    try {
      var stl = doc.getElementById("vqLiveCss");
      if (!stl) {
        stl = doc.createElement("style");
        stl.id = "vqLiveCss"; stl.textContent = CSS;
      }
      /* いつでも末尾へ（すでにあっても置き直す） */
      if (stl.parentNode !== doc.head || stl !== doc.head.lastElementChild) {
        doc.head.appendChild(stl);
      }
    } catch (e) {}
  }
  function ensureHost() {
    /* ★ 打鍵の 見張りは **Lumi の 部品が 出た時点**で 掛ける（2026-08-20）。
       もとは 画面の 見張り（watchScreen）の 中に 置いていたが、
       あれは 繋がり終わってから 掛かるので、
       **繋がる前や 繋ぎ直しの あいだは 打鍵が 見えていなかった**。 */
    try { 打鍵を見張る(); } catch (e0) {}
    if (st.host) return st.host;
    ensureCss();
    try {
      var d = doc.createElement("div");
      d.id = "vqLiveEdge";
      /* ★ 帯ごと aria-hidden にしていたので、Lumi の返事は **読み上げに
         まったく届いていなかった**。飾り（光・点）だけ隠して、
         言葉と「つづきを読む」は 届くようにする（2026-08-18）。 */
      d.innerHTML = '<div class="glow" aria-hidden="true"></div><div class="isl">'
        + '<i class="dot" aria-hidden="true"></i><span></span>'
        + '<button class="vqmore" type="button" aria-expanded="false">つづきを読む</button>'
        + '</div>';
      d.querySelector(".vqmore").addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        st.島を開く = !st.島を開く;
        島の畳みを見る();
      });
      doc.body.appendChild(d);
      st.host = d;
      /* 端末を 横にしたときに 帯も 横にする（画面が 回らない設定のとき用） */
      try { 向きの見張りを付ける(); } catch (e2) {}
    } catch (e) { st.host = null; }
    return st.host;
  }
  /* いつでも押せるボタン。待ち受けが入っているときだけ出す。 */
  function ensureBtn() {
    if (st.btn) return st.btn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveBtn"; b.type = "button";
      b.setAttribute("aria-label", "Lumi と話す");
      b.title = "Lumi と話す";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="9" y="3" width="6" height="11" rx="3"/>'
        + '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        open();
      });
      doc.body.appendChild(b);
      st.btn = b;
    } catch (e) { st.btn = null; }
    return st.btn;
  }
  /* ══ ボタンの置き場（2026-08-18）════════════════════════════════
     ★ 右下のボタンは **全部ここへ入れる**。1 つずつ px を数えて置くと、
       出ないボタンがあったときに 穴が空く（それが「離れすぎ」の正体）。
     ★ 並びは 左から 履歴 / カメラ / 画面 / 文字。順番は data-o で持つ。
       作られる順に関係なく 同じ並びになる。 */
  function ensureDock() {
    if (st.dock) return st.dock;
    ensureCss();
    try {
      var d = doc.createElement("div");
      d.id = "vqLiveDock";
      doc.body.appendChild(d);
      st.dock = d;
    } catch (e) { st.dock = null; }
    return st.dock;
  }
  function dockへ(el, 順) {
    var d = ensureDock();
    if (!d || !el) { try { doc.body.appendChild(el); } catch (e) {} return; }
    el.setAttribute("data-o", String(順));
    var 子 = d.children, 前 = null;
    for (var i = 0; i < 子.length; i++) {
      if (Number(子[i].getAttribute("data-o") || 0) > 順) { 前 = 子[i]; break; }
    }
    if (前) d.insertBefore(el, 前); else d.appendChild(el);
  }

  /* ══ 会話中の 文字入力 ═══════════════════════════════════════════
     ★ 出るのは **会話中だけ**（フチが出ている間）。
     ★ 開いている間はマイクを黙らせる。打っている音や周りの声を
       拾って割り込むと、書いている途中で喋り出してしまう。 */
  function ensureType() {
    if (st.tBtn) return st.tBtn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveType"; b.type = "button";
      b.setAttribute("aria-label", "文字で伝える");
      b.title = "文字で伝える";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M4 7h16M4 12h10M4 17h7"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        showBar(true);
      });
      dockへ(b, 4);
      st.tBtn = b;
    } catch (e) { st.tBtn = null; }
    return st.tBtn;
  }

  /* ══ 画面をそのまま見せる（リアルタイムキャスト・2026-08-16）══════════
     ★ 訴え「常にリアルタイムで自分と同じ画面を共有できないの？
       こっちが何回も指示しないとその通りに動かない」。
       そのとおりで、いまの作りは **道具を呼んだ瞬間しか見えない**。
     ★ 前に会話の流れ（clientContent）へ差し込む方式で失敗している
       （番の途中に入ると返事が返らなくなる）。今度は **realtimeInput**
       ——音声と同じ「実時間の入力」の口を使う。ここは番の区切りと関係が無いので
       流れを壊さない。しかも 絵は それだけでは返事を起こさない（音声と違う）ので、
       映していても Lumi が勝手に喋り出さない。
     ★ 映すかどうかは **利用者が決める**。押している間だけ映し、
       赤い点で「いま映している」ことを必ず見せる。黙って映さない。 */
  function ensureCast() {
    if (st.castBtn) return st.castBtn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveCast"; b.type = "button";
      b.setAttribute("aria-label", "画面を見せる");
      b.title = "画面を見せる（Lumi が同じ画面を見ます）";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (st.cast) キャスト終了("押して止めた");
        else キャスト開始();
      });
      dockへ(b, 3);
      st.castBtn = b;
    } catch (e) { st.castBtn = null; }
    return st.castBtn;
  }
  function キャストの見た目() {
    var b = st.castBtn;
    if (b) {
      if (st.cast && st.castKind !== "カメラ") {
        b.classList.add("on"); b.title = "画面を見せています（押すと止める）";
      } else { b.classList.remove("on"); b.title = "画面を見せる（Lumi が同じ画面を見ます）"; }
    }
    /* ★ **映しているのに ボタンが 無い**を 作らない（2026-08-17・実測）。
       ボタンは 会話を開いたときにしか 作っていなかったので、
       Lumi が cameraOn を呼んだだけのときは 赤い点も 止める口も
       画面に 出ていなかった。映しているなら 必ず 出す。 */
    var 映している = !!(st.cast && st.castKind === "カメラ");
    var c = st.camBtn || (映している ? ensureCam() : null);
    if (c) {
      if (映している) {
        c.classList.add("on", "show");
        requestAnimationFrame(function () { c.classList.add("in"); });
        c.title = "カメラを見せています（押すと止める）";
      } else {
        c.classList.remove("on");
        c.title = "カメラを見せる（Lumi が 目の前のものを 見ます）";
      }
    }
  }
  function キャスト開始(そのまま使う流れ) {
    if (st.cast) return Promise.resolve({ すでに: true });
    /* ★ 試験のときだけ、外から作った流れを渡せるようにする。
       画面の取り込みは OS の許可が要り、試験機では取れない（NotReadableError）。
       取り込み **以外**（絵にする → 変化を見る → 送る）は ここを通せば全部試せる。 */
    if (そのまま使う流れ && そのまま使う流れ.getVideoTracks) {
      return 流れから始める(そのまま使う流れ);
    }
    if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      say("この端末では画面を見せられません");
      return Promise.resolve({ だめ: "getDisplayMedia がありません" });
    }
    return navigator.mediaDevices.getDisplayMedia({
      /* いまのタブを 最初から選んでおく（選ぶ手間を減らす） */
      video: { frameRate: 2, width: { ideal: 1280 } },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      systemAudio: "exclude"
    }).then(流れから始める).catch(function (e) {
      var 名 = String((e && e.name) || "");
      if (名 === "NotAllowedError") say("画面の共有が許可されませんでした");
      else say("画面を見せられませんでした");
      return { だめ: 名 || "失敗" };
    });
  }
  /* ══ カメラを見せる（AR・2026-08-17）═══════════════════════════════
     ★ 送り口は 画面の共有と **まったく同じ**（realtimeInput の video）。
       新しい通信路は 作らない。違うのは「どこから絵を取るか」だけ。
     ★ 既定は **外向き（背面）**。目の前の物を見せるのが目的なので、
       内向き（自分の顔）を既定にすると 毎回 切り替えることになる。 */
  function ensureCam() {
    if (st.camBtn) return st.camBtn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveCam"; b.type = "button";
      b.setAttribute("aria-label", "カメラを見せる");
      b.title = "カメラを見せる（Lumi が 目の前のものを 見ます）";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.1-1.8h5.4L14.8 6h1.7A2.5 2.5 0 0 1 19 8.5v8'
        + 'A2.5 2.5 0 0 1 16.5 19h-11A2.5 2.5 0 0 1 3 16.5z"/>'
        + '<circle cx="11" cy="12" r="3.2"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (st.cast && st.castKind === "カメラ") キャスト終了("押して止めた");
        else カメラ開始();
      });
      dockへ(b, 2);
      st.camBtn = b;
    } catch (e) { st.camBtn = null; }
    return st.camBtn;
  }

  /* 見せているものを **自分でも見る**小窓。これが無いと、
     何を映しているか 分からないまま 送り続けることになる。 */
  function ensureAR() {
    if (st.arBox) return st.arBox;
    ensureCss();
    try {
      var d = doc.createElement("div");
      d.id = "vqLiveAR";
      d.innerHTML = '<div class="vqar-wrap"><video playsinline muted></video>'
        + '<div class="vqar-marks"></div></div>'
        + '<div class="vqar-bar">'
        /* つまむ所。カメラの小窓も 好きな場所へ 動かせる（2026-08-18・訴え）。 */
        + '<span class="vqar-grip" title="つまんで動かす">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" aria-hidden="true">'
        + '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></span>'
        + '<button type="button" data-a="scan">スキャン</button>'
        + '<button type="button" data-a="flip">切替</button>'
        + '<button type="button" data-a="size">大きく</button>'
        + '<button type="button" data-a="stop">やめる</button></div>';
      d.addEventListener("click", function (e) {
        /* ★ 答えの札を 押したら 解説を 開く／閉じる（2026-08-17）。
           開くのは **1 つだけ**（何枚も 開くと 紙が 見えなくなる）。 */
        var ans = e.target.closest ? e.target.closest(".vqar-ans") : null;
        if (ans) {
          e.preventDefault(); e.stopPropagation();
          /* ★ 解説は **大きい板**に 出す（2026-08-17・訴え）。
             小窓の中の 吹き出しは 狭すぎて、式も 表も 入らなかった。
             板は カメラより 前面（z 600）なので、紙の上に かぶさって 読める。 */
          var 開いていた = ans.classList.contains("open");
          Array.prototype.slice.call(d.querySelectorAll(".vqar-ans.open"))
            .forEach(function (x) { x.classList.remove("open"); });
          if (開いていた) { 板を閉じる(); return; }
          ans.classList.add("open");
          var 答 = ans.getAttribute("data-ans") || "";
          var 説 = ans.getAttribute("data-why") || "";
          板を出す(答 ? "答え: " + 答 : "解説", 説 || "解説は ありません。");
          return;
        }
        var t = e.target.closest ? e.target.closest("button[data-a]") : null;
        if (!t) return;
        var a = t.getAttribute("data-a");
        if (a === "stop") キャスト終了("小窓から止めた");
        /* ★ スキャンモード（2026-08-20・訴え「あらかじめ スキャンモードみたいなのを
           作って、そこで 何枚かを スキャンし…」）。
           小窓の カメラは 止める（同じ カメラを 2 つで 取り合うと どちらも 映らない）。 */
        else if (a === "scan") {
          try { キャスト終了("スキャンモードへ"); } catch (e0) {}
          setTimeout(function () { try { if (root.VQSCAN) root.VQSCAN.開く({}); } catch (e1) {} }, 250);
        }
        else if (a === "flip") カメラ開始(st.camFacing === "user" ? "environment" : "user");
        else if (a === "size") {
          d.classList.toggle("big");
          t.textContent = d.classList.contains("big") ? "小さく" : "大きく";
        }
      });
      つまんで動かす(d, d.querySelector(".vqar-grip"), "ar");
      doc.body.appendChild(d);
      st.arBox = d;
    } catch (e) { st.arBox = null; }
    return st.arBox;
  }

  /* ══ かたちのある板（2026-08-17）═══════════════════════════════════
     ★ 声は 声のまま。**書いて伝えたほうが早いもの**——手順・表・図・
       数式・大事な所——を ここへ出す。
     ★ 中身は マークダウン。描くのは 自前の VQMD（外の道具に頼らない）。
       生の HTML は 一切 通さない（すべて エスケープしてから 組み立てる）。 */
  function ensureNote() {
    if (st.noteBox) return st.noteBox;
    ensureCss();
    try {
      /* VQMD の見た目も 一緒に入れる（島の CSS とは 別立て） */
      if (!doc.getElementById("vqmdCss") && root.VQMD && root.VQMD.CSS) {
        var s2 = doc.createElement("style");
        s2.id = "vqmdCss"; s2.textContent = root.VQMD.CSS();
        doc.head.appendChild(s2);
      }
      var d = doc.createElement("div");
      d.id = "vqLiveNote";
      d.setAttribute("role", "region");
      d.setAttribute("aria-label", "Lumi のボード");
      var nsv = function (p2) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
          + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p2 + '</svg>';
      };
      d.innerHTML = '<div class="vqn-h">'
        /* つまむ所。ここを 持って 動かす（中身の上では 動かない）。 */
        + '<span class="vqn-g" aria-hidden="true">'
        + nsv('<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>') + '</span>'
        + '<div class="vqn-t"></div>'
        /* ★ 再生（上から下まで 解説）と 保存（残す）。2026-08-19・訴え。
           ・再生 … Lumi が 区切りごとに 話しながら 線を 引く
           ・保存 … **押したときだけ** AR Board の 一覧へ 入れる
             （前は 出した瞬間に 勝手に 入っていた） */
        + '<button class="vqn-p" type="button" aria-label="上から下まで 解説してもらう"'
        + ' title="解説してもらう">'
        + nsv('<path d="M7 4l12 8-12 8V4z" fill="currentColor" stroke="none"/>') + '</button>'
        + '<button class="vqn-s" type="button" aria-label="このボードを 残す" title="残す">'
        + nsv('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4"/><path d="M8 14h8"/>') + '</button>'
        + '<button class="vqn-r" type="button" aria-label="ボードの位置を元に戻す"'
        + ' title="位置を元に戻す">'
        + nsv('<path d="M4 9h11a5 5 0 1 1 0 10H8"/><path d="M8 5L4 9l4 4"/>') + '</button>'
        + '<button class="vqn-f" type="button" aria-expanded="true"'
        + ' aria-label="ボードをたたむ" title="たたむ">'
        + nsv('<path d="M6 9l6 6 6-6"/>') + '</button>'
        + '<button class="vqn-x" type="button" aria-label="閉じる">✕</button></div>'
        /* ★ 帯は **必ず .vqn-b の 外**に 置く（2026-08-20）。
           中に 入れると
             ・板の 字を 読み返すときに「全画面 − 100% ＋ 等倍」が 混ざる
             ・解説の 区切りとして 数えられ、線が そこへ 引かれる
             ・showNote の たびに 中身ごと 消える
           の 3 つが 起きる。外に 置けば どれも 起きない。 */
        + '<div class="vqn-ops" data-appops>'
        + '<button type="button" data-op="zen" aria-label="全画面にする">⤢ 全画面</button>'
        + '<button type="button" data-op="out" aria-label="小さくする">−</button>'
        + '<span class="vqn-zoomv" data-zoomv>100%</span>'
        + '<button type="button" data-op="in" aria-label="大きくする">＋</button>'
        + '<button type="button" data-op="reset" aria-label="もとの大きさに戻す">等倍</button>'
        + "</div>"
        + '<div class="vqmd vqn-b"></div>';
      d.querySelector(".vqn-x").addEventListener("click", function (e) {
        e.preventDefault(); 板を閉じる();
      });
      /* ★ たたむ／ひらく（2026-08-18・訴え）。
         たたんだかどうかは 端末に残す。読み終わって たたんだのに、
         次の板で また 全面に 開くと、同じ操作を 毎回させることになる。 */
      d.querySelector(".vqn-f").addEventListener("click", function (e) {
        e.preventDefault();
        板をたたむ(!d.classList.contains("fold"));
      });
      /* ★ 再生（上から下まで 解説）。もう一度 押すと 止まる。 */
      d.querySelector(".vqn-p").addEventListener("click", function (e) {
        e.preventDefault();
        var r = 解説を始める();
        if (r && r.だめ) say(r.だめ);
      });
      /* ★ 残す。**押したときだけ** 一覧へ 入る。
         長押し（または 右クリック）で 写真も 一緒に 選べる。 */
      var 残すボタン = d.querySelector(".vqn-s");
      var 長押し = 0;
      残すボタン.addEventListener("click", function (e) {
        e.preventDefault();
        板を残す({}).then(function (r) { say(r.だめ || r.やった); });
      });
      残すボタン.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        板を残す写真つき().then(function (r) { say(r.だめ || r.やった); });
      });
      残すボタン.addEventListener("pointerdown", function () {
        長押し = setTimeout(function () {
          長押し = 0;
          板を残す写真つき().then(function (r) { say(r.だめ || r.やった); });
        }, 620);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) {
        残すボタン.addEventListener(n, function () { if (長押し) { clearTimeout(長押し); 長押し = 0; } });
      });
      d.querySelector(".vqn-r").addEventListener("click", function (e) {
        e.preventDefault(); 位置を戻す(d, "note");
      });
      つまんで動かす(d, d.querySelector(".vqn-h"), "note");
      板の操作をつなぐ(d);
      doc.body.appendChild(d);
      st.noteBox = d;
    } catch (e) { st.noteBox = null; }
    return st.noteBox;
  }
  function 板をたたむ(たたむ) {
    var d = st.noteBox; if (!d) return { たたんだ: false };
    var t = !!たたむ;
    d.classList.toggle("fold", t);
    var b = d.querySelector(".vqn-f");
    if (b) {
      b.setAttribute("aria-expanded", t ? "false" : "true");
      b.setAttribute("aria-label", t ? "ボードをひらく" : "ボードをたたむ");
      b.title = t ? "ひらく" : "たたむ";
    }
    try { root.localStorage.setItem("vq.live.fold.note", t ? "1" : "0"); } catch (e) {}
    return { たたんだ: t };
  }
  /* ══════════════════════════════════════════════════════════════════════
     板を 上から下まで 解説する（2026-08-19・訴え）

     ★ 進行は **こちらが 持つ**。Lumi に 任せると、
       どこを 話しているかが 画面と ずれる（実測: 長い返事の 途中で
       次の 区切りへ 進んでしまい、線が 別の所に 引かれる）。
       こちらが 1 区切りずつ 渡し、**返事が 終わってから** 次へ 進む。

     ★ 線は core/board/play.js（VQB.play）が 引く。ここは 段取りだけ。

     ★ 途中で 人が 話しかけたら **止める**（かぶせて 喋らない）。
     ══════════════════════════════════════════════════════════════════════ */
  var 解説 = null;          /* { 面, i, 止めた, 待ち } */

  function 解説を片づける() {
    /* ★ 解説していなくても、Lumi が 線を 引いたときの 重ね板が 残る。
       それも ここで 一緒に 片づける（残すと 次の板に 前の線が 重なる）。 */
    if (st.単独の面) { try { st.単独の面.片づける(); } catch (e0) {} st.単独の面 = null; }
    if (!解説) return;
    /* ★ 止めたら **合図も 捨てる**。残すと 次の回が それに 釣られる。 */
    解説.止めた = true; 解説.合図 = null; 解説.合図番 = 0;
    try { if (解説.面) 解説.面.片づける(); } catch (e) {}
    try { if (解説.待ち) clearTimeout(解説.待ち); } catch (e) {}
    /* ★ 止めたのが こちらなら 戻す。もとから 手で 止めていたなら そのまま。 */
    try { if (解説 && !解説.前のミュート) マイクを止める(false); } catch (e2) {}
    解説 = null;
    var d = st.noteBox;
    if (d) { var p = d.querySelector(".vqn-p"); if (p) 再生ボタンの見た目(p, false); }
  }

  /* 再生 ⇄ 停止。押せば 止まることが **見て分かる**ようにする。 */
  function 再生ボタンの見た目(b, 中) {
    if (!b) return;
    b.classList.toggle("on", !!中);
    b.innerHTML = 中
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>'
        + '<rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M7 4l12 8-12 8V4z" fill="currentColor" stroke="none"/></svg>';
    var 名 = 中 ? "解説を 止める" : "上から下まで 解説してもらう";
    b.setAttribute("aria-label", 名); b.title = 中 ? "止める" : "解説してもらう";
    b.setAttribute("aria-pressed", 中 ? "true" : "false");
  }

  function 解説を止める(なぜ) {
    if (!解説) return false;
    noteEv("★ 解説を 止めました（" + (なぜ || "手で") + "）");
    解説を片づける();
    return true;
  }

  /* ══ まとまり 1 つを 話してもらう（2026-08-20 に 1 行ずつ → まとまりへ）══
     訴え「1 行 1 行 解説しているから、同じ説明を 2 回くらい することがある。
       ちょっと くどいかもな」
       「カッコが あったり、マーカーが 引いてあるところや、Lumi が 重要だと
         思う部分を **徹底的に** 解説に 入れられるようにして欲しい」

     ★ 1 行ずつ 渡していたので、箇条書きの 3 行は ほぼ 同じ話に なっていた。
       **見出しごとに 束ねて** 渡す。1 回で 言い切れるので 繰り返さない。
     ★ 大事な所は 板から 読み取ってある（蛍光ペン・太字・下線・かっこ・式）。
       それを **名指しで 渡し**、必ず 触れさせる。厚さも そこで 変える。
     ★ すでに 話したことも 渡す。**同じことを 二度 言わせない。** */
  function 一段話す(d, 全体, i, 済み) {
    if (!st.ws || st.ws.readyState !== 1) return Promise.resolve(false);
    var 番 = (d.番号 && d.番号.length) ? d.番号[0] : i;
    var 厚い = (d.重み || 0) >= 5;
    var 語ら = (d.見どころ || []).slice(0, 6);
    var 頭 = i === 0 ? "いまから ボードを 上から順に 解説します。" : "";
    var 文 = 頭
      + "【" + (i + 1) + " / " + 全体 + "】この まとまりを "
      + (厚い ? "**しっかり**（4〜6 文）" : "**短く**（2〜3 文）") + " 説明してください。\n"
      + "――― ここから ―――\n" + String(d.text || "").slice(0, 1200) + "\n――― ここまで ―――\n"
      + (語ら.length
          ? "★★ **ここは 必ず 触れてください**（板で 目立たせてある所です）:\n"
            + 語ら.map(function (g) { return "　　・" + g.語 + "（" + g.種 + "）"; }).join("\n") + "\n"
            + "　　なぜ そうなるのか・どう 使うのかまで 言います。名前を 読み上げるだけに しない。\n"
          : "")
      + (済み && 済み.length
          ? "★ **もう 話したこと**（繰り返さない）: " + 済み.slice(-6).join(" / ") + "\n"
          : "")
      + "・記号（$ \\frac ** # |）は **声に出さない**。式は「2 分の 1」のように 日本語で 言う。\n"
      + "・前置き（では、続いて など）は 要らない。中身から 話す。\n"
      + "・**同じことを 言い直さない。**前の まとまりで 言ったことは 短く 触れるだけ。\n"
      + "\n"
      + "★ **板と 声を そろえる。** いま 話している ところは block=" + 番
      + (d.番号 && d.番号.length > 1 ? "〜" + d.番号[d.番号.length - 1] : "") + " です。\n"
      + "  道具を 使うときは **その中の 番号を 指して**ください。\n"
      + "  別の ところに 引くと、聞いている人は どこの話か 分からなくなります。\n"
      + "\n"
      + "★ 線は **引かなくて よい**。全部に 引くと どこが 大事か 分からなくなります。\n"
      + "  ここに **大事なところ・強調・正解への手がかり**が あるときだけ 引きます:\n"
      + "    boardMark style=marker … いちばん 大事な 1 行\n"
      + "    style=number          … 順番に 見せたい とき（①②③ が 付く）\n"
      + "    style=box / arrow     … 結論・答え・指したい 行\n"
      + "  何も 強調されていない ところでは **何も しない**。\n"
      + "★ この板に **書いていないこと**を 足したいときは boardNote（付箋）。\n"
      + "  声で 言うことと **同じ中身**を 貼ってください（別のことを 貼らない）。\n"
      + "  ★ 付箋の 形は **毎回 変える**。今回 貼るなら こう 書いてみてください:\n"
      + "　　" + 付箋の書きかた() + "\n"
      + "  ★★ **合わないなら 貼らないでください。**形は おまけです。\n"
      + "    いま 話している ことと **関係ないもの**を、形に 合わせるために\n"
      + "    作らないでください（式の 出てこない 話に 式を 書く、など）。\n"
      + "    合うものが 無ければ **何も 貼らない**。それで かまいません。\n";
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: 文 }] }], turnComplete: true } }));
    } catch (e) { return Promise.resolve(false); }
    /* 返事が 終わるのを 待つ。長すぎたら 先へ 進む（止まらない）。 */
    /* ══ 合図は **この 回の もの**（2026-08-20・訴え）════════════════
       「マークダウンだけが 進んで、2 回 再生ボタンを 押すと、
         1 回目の方に 釣られて 無言に なったりする」

       ★ 合図を **1 つの 入れ物**（グローバル）に 置いていた。だから
           ・前の 回の 40 秒の 時計が 切れると、**次の回の 合図を 消す**
           ・止めた 回の 合図が 残っていて、関係ない 返事で 先へ 進む
         が 起きる。**進むのは 板だけ、声は 前の回のまま** ＝ 訴えの見た目。
       ★ 回ごとに 番号を 振り、**その回の 合図しか 受けない**。
       ★ さらに **声が 鳴り終わるまで 待つ**。turnComplete は
         「文を 作り終えた」だけで、音は まだ 何秒も 鳴っている。
         そこで 次へ 行くから 板だけ 先に 進んでいた。 */
    var 回 = 解説.回 = (解説.回 || 0) + 1;
    return new Promise(function (done) {
      var 済 = false;
      var 終 = function () {
        if (済) return; 済 = true;
        clearTimeout(t);
        if (解説 && 解説.合図番 === 回) { 解説.合図 = null; 解説.合図番 = 0; }
        /* 声が 鳴り終わってから 次へ（最長 30 秒）。 */
        var 待 = 0;
        var 見る = function () {
          if (!解説 || 解説.止めた) { done(true); return; }
          待 += 250;
          if (!st.speaking || 待 > 30000) { done(true); return; }
          setTimeout(見る, 250);
        };
        setTimeout(見る, 250);
      };
      var t = setTimeout(function () {
        if (済) return; 済 = true;
        if (解説 && 解説.合図番 === 回) { 解説.合図 = null; 解説.合図番 = 0; }
        done(true);
      }, 60000);
      if (解説) { 解説.合図 = 終; 解説.合図番 = 回; }
    });
  }

  /* ══ 付箋の 書きかた（2026-08-20・訴え「型は 大枠でいい。
     毎回 必ず ランダムに なるように」）════════════════════════════════
     解説の 途中で 貼る 付箋も、放っておくと 毎回 同じ形に なる。
     区切りごとに **別の 書きかた**を 1 つ 渡す。
     ★ 使いきるまで 同じものは 出さない（さいころだと 続けて 同じが 出る）。 */
  /* ★★ どれも **合うときだけ**（2026-08-20・訴え
     「なんか 関係ないものも あるし。。。内容に。こういうのは 入れないように」）。
     実測: 石油ショックの 板に「文の中の式: y=x^2 ／ 読み方: ワイは エックスの2乗」が
     貼られた。形を 渡すと、**中身が 無くても 形に 合わせて 作ってしまう**。
     だから 形の 名に **使ってよい場面**を 必ず 添える。 */
  var 付箋の形 = [
    "> [!コツ] 覚えかたを ひとこと（覚えかたが 思いつく ときだけ）",
    "「語 :: 意味」を 2 行（知らない語が 出てきた ときだけ）",
    "- [ ] 確かめること を 2 つ（あとで 調べることが 実際に ある ときだけ）",
    "**太字の 言い切り** を 1 行 だけ（いつでも 使えます）",
    "> [!れい] 身近な 例を 1 つ（例が 本当に ある ときだけ）",
    "表（| 見かた | 中身 |）で 2 行（比べるものが 2 つ以上 ある ときだけ）",
    "??? もっと 細かく … ??? に たたむ（まだ 話していない 続きが ある ときだけ）",
    "むずかしい語に {漢字|かんじ} で ふりがな（読みにくい語が ある ときだけ）",
    "1. 2. の 短い 手順（順番の ある 話の ときだけ）",
    "==ここが 芯== を 1 か所 だけ（いつでも 使えます）",
    "> [!注意] まちがえやすい ところ（まちがえやすい 所が ある ときだけ）",
    "$…$ の 式 と その 読みかた（**式や 数が 出てくる 話の ときだけ**）"
  ];
  var 付箋に使った = [];
  function 付箋の書きかた() {
    var 選 = 付箋の形.filter(function (x) { return 付箋に使った.indexOf(x) < 0; });
    if (!選.length) { 付箋に使った = []; 選 = 付箋の形.slice(); }
    var x = 選[Math.floor(Math.random() * 選.length)] || 付箋の形[0];
    付箋に使った.push(x);
    return x;
  }

  function 解説を始める() {
    var d = ensureNote();
    if (!d) return { だめ: "ボードが ありません。" };
    if (解説) { 解説を止める("もう一度 押した"); return { やった: "解説を 止めました。" }; }
    if (!root.VQB || !root.VQB.play) return { だめ: "解説の部品（core/board/play.js）が ありません。" };
    if (!st.on || !st.ws || st.ws.readyState !== 1)
      return { だめ: "先に Lumi を 呼んでください（解説は 声で します）。" };

    var 中 = d.querySelector(".vqn-b");
    var 面 = root.VQB.play.作る({ 中身: 中, 巻物: d });
    if (!面 || !面.数()) return { だめ: "解説できる 中身が ありません。" };

    解説 = { 面: 面, i: -1, 止めた: false };
    /* ══ 解説の あいだは マイクを 止める（2026-08-20・訴え）════════════
       「会話中に 自分の声を 認識して プツプツ 解説が 切れたりするのが うざい。
         再生中は 利用者の声を ミュートに して、いちいち 切れないように」
       ★ スピーカーで 聞いていると Lumi 自身の声が 回り込み、
         向こうが「利用者が 話し始めた」と 見なして **自分で 自分を 止める**。
         こちら側で 感度を 下げても、止めきれない 端末が ある。
         **送らなければ 止まらない。** 解説の あいだだけ 口を 閉じる。
       ★ もとから 手で 止めていた人の 設定は 壊さない（戻すときに 見る）。 */
    解説.前のミュート = 手で止めているか();
    if (!解説.前のミュート) { try { マイクを止める(true); } catch (e0) {} }
    var p = d.querySelector(".vqn-p"); if (p) 再生ボタンの見た目(p, true);
    noteEv("★ 解説を 始めます（" + ((面.段 ? 面.段().length : 面.数())) + " まとまり／"
      + 面.数() + " 行・その間 マイクは 止めます）");
    say("上から 解説します（聞くだけで だいじょうぶ）");

    /* ★ **意味の まとまり**で 進む（2026-08-20）。1 行ずつだと くどい。 */
    var 全 = (面.段 ? 面.段() : null) || 面.区切り();
    var 済み = [];
    (function 次へ(i) {
      if (!解説 || 解説.止めた) return;
      if (i >= 全.length) {
        noteEv("★ 解説が 終わりました");
        try { st.ws.send(JSON.stringify({ clientContent: {
          turns: [{ role: "user", parts: [{ text:
            "解説は ここまでです。最後に **ひとこと**（1 文）で まとめて 終わってください。"
            + "道具は 使わないでください。" }] }], turnComplete: true } })); } catch (e) {}
        setTimeout(function () { 解説を片づける(); }, 1500);
        return;
      }
      解説.i = i;
      /* まとまりの 頭の 行へ 寄せる（番号は 区切りの 番号） */
      面.進む((全[i].番号 && 全[i].番号.length) ? 全[i].番号[0] : i);
      /* ★ **自動で 線を 引かない**（2026-08-19・訴え
         「何でもかんでも 線を 引けば いいってもんじゃない」）。
         もとは 区切りごとに 必ず 1 本 引いていた。全部に 引くと
         **どこが 大事なのか 分からなくなる**（引いていないのと 同じ）。
         引くかどうかは Lumi が その場で 決める（boardMark）。
         いま話している所は 目印（進む）で 分かるので、線は 要らない。 */
      一段話す(全[i], 全.length, i, 済み).then(function () {
        if (!解説 || 解説.止めた) return;
        /* 話し終えた 見出し（無ければ 頭の 20 字）を 控える。
           次の まとまりへ「もう 話したこと」として 渡し、繰り返させない。 */
        var 印 = String(全[i].見出し || 全[i].text || "").replace(/\s+/g, " ").trim().slice(0, 24);
        if (印) 済み.push(印);
        解説.待ち = setTimeout(function () { 次へ(i + 1); }, 420);
      });
    })(0);
    return { やった: "上から 解説します（" + 面.数() + " 区切り）。" };
  }

  /* ══ Lumi が 自分で 線を 引く・文字を 足す ═══════════════════════
     解説の 途中で 使う。解説していないときは その場で 重ね板を 作る。 */
  function 引く手を用意() {
    if (解説 && 解説.面) return 解説.面;
    var d = st.noteBox;
    if (!d || !root.VQB || !root.VQB.play) return null;
    var 中 = d.querySelector(".vqn-b");
    if (!中) return null;
    if (!st.単独の面) st.単独の面 = root.VQB.play.作る({ 中身: 中, 巻物: d });
    return st.単独の面;
  }
  function boardMark(a) {
    a = a || {};
    var 面 = 引く手を用意();
    if (!面) return { だめ: "ボードが 出ていません。先に showNote で 出してください。" };
    var 種 = String(a.style || a.kind || "marker");
    if (["marker", "wave", "pen", "box", "arrow", "number", "back"].indexOf(種) < 0) 種 = "marker";
    /* ★ **並びが 逆だった**（2026-08-20・実測）。
       var は 巻き上がるので、先に 入れても すぐ下の
       「var o0番 = null」で **必ず 消えていた**。
       つまり no=3 と 指しても 番号は 毎回 通し番で 振られていた。 */
    var o0番 = Number.isFinite(Number(a.no)) ? Number(a.no) : null;
    var o = { color: a.color, width: a.width };
    if (Number.isFinite(Number(a.block))) o.block = Number(a.block);
    /* ★ points は **平らな並び**（x1,y1,x2,y2,…）で 受ける（2026-08-19）。
       もとは [[x,y],…] の 入れ子で 宣言していたが、
       入れ子の array は 道具の宣言として 通らず、
       **接続そのものが 開かなくなっていた**（実測）。
       古い形（入れ子）で 来ても 受けられるようにしておく。 */
    if (Array.isArray(a.points) && a.points.length) {
      if (Array.isArray(a.points[0])) o.points = a.points;
      else {
        var 点 = [];
        for (var pi = 0; pi + 1 < a.points.length; pi += 2)
          点.push([Number(a.points[pi]) || 0, Number(a.points[pi + 1]) || 0]);
        if (点.length > 1) o.points = 点;
      }
    }
    if (o0番 !== null) o.no = o0番;
    var ok = false;
    try { ok = 面.引く(種, o); } catch (e) { ok = false; }
    if (!ok) return { だめ: "そこには 引けませんでした（block の 番号を 確かめてください）。" };
    return { やった: 種 + " を 引きました。",
             つぎ: "**声では 言い直さない**。線を 引いたことは 見れば 分かります。" };
  }
  function boardWrite(a) {
    a = a || {};
    var 面 = 引く手を用意();
    if (!面) return { だめ: "ボードが 出ていません。" };
    var t = String(a.text || "").slice(0, 400);
    if (!t) return { だめ: "書く中身が ありません。" };
    try { 面.書く(t, { block: Number.isFinite(Number(a.block)) ? Number(a.block) : undefined,
                       instant: a.instant === true }); }
    catch (e) { return { だめ: "書けませんでした。" }; }
    return { やった: "ボードに 書き足しました。",
             つぎ: "**同じ言葉を 声でも 読み上げない**。ひとこと 添えるだけ。" };
  }
  function boardBlocks() {
    var 面 = 引く手を用意();
    if (!面) return { だめ: "ボードが 出ていません。" };
    /* ★ **中身を そのまま 返す**（2026-08-19・実測で 分かったこと）。
       画面を 読む道具（readScreen）は 板を **わざと 読まない**。
       あれは 正しい（読むと 自分の書いた $ や \\frac を 読み上げ始める）。
       だが そのせいで、**Lumi は 自分が 出した板の 中身を 一度も
       見られなかった**（実測: 読める字が 0 件）。
       ここは 「見る」ための 道具なので、**組み上がった あとの字**を 返す。
       記号は すでに 絵や 太字に なっているので、読み上げの 危険も 小さい。 */
    var 並 = 面.区切り();
    return {
      見出し: (st.板 && st.板.見出し) || (st.板のアプリ && st.板のアプリ.名) || "",
      区切りの数: 並.length,
      いま話している: 面.いま(),
      区切り: 並.map(function (x) {
        return { block: x.i, 字: x.text.slice(0, 300) };
      }),
      つぎ: "boardMark / boardWrite / boardNote の block に この番号を 渡します。"
        + "**いま話している ところ**を 指してください（板と 声を そろえる）。"
    };
  }
  /* ボードに **無いこと**を 付箋で 足す（マークダウンが 使える）。 */
  /* いま 板に 何が 出ているかの ひとこと。
     画面を 読む道具（lookScreen / readScreen）に 添えて、
     「板が 出ている」ことに **必ず 気づける**ようにする。 */
  function 板の様子() {
    try {
      var d = st.noteBox;
      if (!d || !d.classList.contains("show")) return null;
      var 動 = d.classList.contains("vqn-appmode");
      var 題 = String((d.querySelector(".vqn-t") || {}).textContent || "").trim();
      var 出 = { 出ている: true, 見出し: 題 || "（見出しなし）",
                 中身: 動 ? "動くもの（AR App）" : "書いたもの" };
      if (動) {
        var 符 = (st.板のアプリ && st.板のアプリ.符) || {};
        出.借りた道具 = ((st.板の枠 && st.板の枠.道具) || []).join("・") || "なし";
        出.組んだもの = String((st.板のアプリ && st.板のアプリ.note) || "").slice(0, 200);
        出.読みかた = "**中は 見えません**（別の入れ物で 動いています）。"
          + "何を 作ったかは 上の「組んだもの」と「借りた道具」で 分かります。"
          + "中の 様子を 知りたいときは 利用者に 聞いてください。";
      } else {
        try {
          var 中 = d.querySelector(".vqn-b");
          出.区切りの数 = 中 ? 中.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre,table").length : 0;
        } catch (e) {}
        出.読みかた = "**中身は boardBlocks で 読めます。**"
          + "ここには 出しません（記号を そのまま 読み上げてしまうため）。";
      }
      return 出;
    } catch (e) { return null; }
  }

  function boardNote(a) {
    a = a || {};
    var 面 = 引く手を用意();
    if (!面) return { だめ: "ボードが 出ていません。" };
    var t = String(a.markdown || a.text || "").slice(0, 900);
    if (!t) return { だめ: "貼る中身が ありません。" };
    var 色 = String(a.color || "");
    if (["aoi", "midori", "momo"].indexOf(色) < 0) 色 = "";
    try { 面.付箋(t, { block: Number.isFinite(Number(a.block)) ? Number(a.block) : undefined, color: 色 }); }
    catch (e) { return { だめ: "貼れませんでした。" }; }
    return { やった: "付箋を 貼りました。",
             つぎ: "**同じ中身を 声でも 読み上げない**。要点だけ ひとこと 添えてください。" };
  }

  function boardClear() {
    var 面 = (解説 && 解説.面) || st.単独の面;
    if (!面) return { やった: "引いたものは ありません。" };
    try { 面.消す(); } catch (e) {}
    return { やった: "引いたものを 消しました。" };
  }

  /* ══ ボードを 残す（**押したときだけ**）═════════════════════════
     ★ 前は 出した瞬間に 一覧へ 入っていた。試しに 出したものまで
       全部 溜まるので、要るものが 埋もれた。
     ★ 写真も 一緒に 残せる（カメラを 見せているときは そのまま、
       そうでなければ 選んでもらう）。 */
  function 板を残す(o) {
    o = o || {};
    var S = root.VQB && root.VQB.store;
    if (!S) return Promise.resolve({ だめ: "置き場が ありません。" });
    var 元 = st.板 || null;
    var 動 = st.板の枠 && st.板のアプリ;
    if (!元 && !動) return Promise.resolve({ だめ: "残すものが ありません。" });
    var 荷 = 動
      ? { kind: "app", title: (st.板のアプリ.名 || "動くもの"), code: st.板のアプリ.符,
          markdown: String(st.板のアプリ.note || ""), subject: String(st.板のアプリ.subject || ""),
          source: "app" }
      : { title: 元.見出し, markdown: 元.md, subject: String(元.subject || ""),
          source: o.photo ? "camera" : "board" };
    if (o.photo) 荷.photo = o.photo;
    return (S.用意 ? S.用意() : Promise.resolve()).then(function () { return S.足す(荷); })
      .then(function (x) {
        if (x && x.id) st.最後のボード = x.id;
        st.残した = true;
        var d = st.noteBox;
        if (d) { var b = d.querySelector(".vqn-s"); if (b) { b.classList.add("done");
          b.setAttribute("aria-label", "残しました"); b.title = "残しました"; } }
        return { やった: "AR Board に 残しました。", id: x && x.id };
      })
      .catch(function (e) { return { だめ: String(e && e.message || e) }; });
  }

  /* 写真を 付けて 残す（カメラ中なら そのまま、そうでなければ 選んでもらう） */
  function 板を残す写真つき() {
    if (st.cast && st.castKind === "カメラ") {
      var 写 = (st.最後の写真 && st.最後の写真.dataUrl) || (しっかり撮る(720) || {}).dataUrl || null;
      return 板を残す({ photo: 写 });
    }
    return new Promise(function (done) {
      /* ★ **返さないまま には しない**（2026-08-20）。
         もとは change が 来たときだけ 返していた。写真を 選ばずに
         閉じると **この約束は 永久に 果たされない**。
         コメントには「少し待って 何も来なければ そのまま」と 書いてあったが、
         その 待つ 仕掛けが **どこにも 無かった**。 */
      var 済 = false;
      var 返す = function (v) { if (済) return; 済 = true; clearTimeout(時計); done(v); };
      var inp = doc.createElement("input");
      inp.type = "file"; inp.accept = "image/*";
      inp.style.cssText = "position:fixed;left:-9999px;";
      doc.body.appendChild(inp);
      var 片づけ = function () { try { inp.remove(); } catch (e) {} };
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        片づけ();
        if (!f) { 返す(板を残す({})); return; }
        var fr = new FileReader();
        fr.onload = function () { 返す(板を残す({ photo: String(fr.result || "") })); };
        fr.onerror = function () { 返す(板を残す({})); };
        fr.readAsDataURL(f);
      });
      /* 選ばずに 閉じたとき。窓が 戻ってきて しばらく 何も 来なければ 写真なしで 残す。 */
      var 戻った = function () {
        setTimeout(function () {
          if (済) return;
          if (inp.files && inp.files.length) return;   /* いま 読んでいる途中 */
          片づけ(); 返す(板を残す({}));
        }, 1200);
      };
      root.addEventListener("focus", 戻った, { once: true });
      /* 最後の 手。60 秒 何も 起きなければ 写真なしで 残す。 */
      var 時計 = setTimeout(function () { 片づけ(); 返す(板を残す({})); }, 60000);
      inp.click();
    });
  }

  function 板を出す(見出し, md) {
    var d = ensureNote(); if (!d) return { だめ: "ボードを 出せません。" };
    /* 前の 解説（線・目印）を 引きずらない。中身が 変われば 座標も 変わる。 */
    try { 解説を片づける(); } catch (e9) {}
    /* 前に 動くものを 出していたら 片づける（残すと 音や 描画が 走り続ける）。 */
    板のアプリを片づける();
    try { 板を全画面(d, false); } catch (e0) {}
    d.classList.remove("vqn-appmode");
    var t = d.querySelector(".vqn-t"), b = d.querySelector(".vqn-b");
    t.textContent = String(見出し || "");
    t.style.display = String(見出し || "").trim() ? "" : "none";
    try {
      b.innerHTML = (root.VQMD && root.VQMD.render)
        ? root.VQMD.render(md)
        : String(md || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    } catch (e) { b.textContent = String(md || ""); }
    d.classList.add("show");
    requestAnimationFrame(function () { d.classList.add("in"); });
    d.scrollTop = 0;
    /* 前に置いた場所・たたんだ状態・字の大きさを そのまま 引き継ぐ */
    位置を当てる(d, "note");
    try { 板の倍率を戻す(d); } catch (e8) {}
    try { 板をたたむ(root.localStorage.getItem("vq.live.fold.note") === "1"); } catch (e9) {}
    st.板 = { 見出し: String(見出し || ""), md: String(md || ""), at: Date.now() };
    /* ★ **数式は 遅れて 組み上がる**（2026-08-17・実測で分かった重い不具合）。
       MathJax は 数式が 出てきたときに はじめて 読み込む（2.28MB）。
       1 回目の 板は 読み込みが 終わる前に 描かれるので、
       **$…$ が そのままの字で 出ていた。**
       それが 画面の文として Lumi へ 戻り、\\frac などを 読み上げ始める
       （「変な英語を 喋り出す」の 正体）。読み終わったら **描き直す。** */
    try {
      if (root.VQM && VQM.svg && !VQM.svg.読み込み済み()
          && /\$[^$\n]+\$/.test(String(md || ""))) {
        VQM.svg.要る();
        if (!st.板の待ち) {
          st.板の待ち = true;
          doc.addEventListener("vqm:ready", function () {
            try {
              if (st.板 && st.noteBox && st.noteBox.classList.contains("show")) {
                st.noteBox.querySelector(".vqn-b").innerHTML = VQMD.render(st.板.md);
              }
            } catch (e) {}
          });
        }
      }
    } catch (e2) {}
    return { 出した: true, 文字数: String(md || "").length };
  }
  /* ══ 板の中で **動くもの**を 出す（AR App・2026-08-19）═══════════════
     ★ 訴え「ボードに 新しい種類を。その場で コードを書いて、
       ボードで 動く ゲームや 教材を すぐ 出せるように。
       **毎回 必ず 崩れずに** 作れるようにして」。
     ★ 崩れない仕掛けは core/board/app.js が 全部 持っている
       （土台の見た目・doctype・見張り・sandbox）。ここは 置くだけ。
     ★ 動いたか／壊れたかを **待って** 返す。返した内容を Lumi が読んで、
       その場で 直せる。だから 2 回目で 必ず 直る。 */
  function 板のアプリを片づける() {
    if (!st.板の枠) return;
    try { st.板の枠.片づける(); } catch (e) {}
    st.板の枠 = null;
  }
  function 板でアプリを出す(見出し, 符) {
    var d = ensureNote();
    if (!d) return Promise.resolve({ だめ: "ボードを 出せません。" });
    if (!root.VQB || !root.VQB.app || !root.VQB.app.枠) {
      return Promise.resolve({ だめ: "動かす部品（core/board/app.js）が 読み込まれていません。"
        + "showNote で 書いて 見せてください。" });
    }
    板のアプリを片づける();
    var t = d.querySelector(".vqn-t"), b = d.querySelector(".vqn-b");
    t.textContent = String(見出し || "");
    t.style.display = String(見出し || "").trim() ? "" : "none";
    /* ★ 帯は ensureNote が **外に** 作ってある（2026-08-20）。
       ここで 作り直すと 中身と 一緒に 消えるので 作らない。 */
    b.style.fontSize = "";
    b.innerHTML = '<div class="vqn-appmsg" data-appmsg>組み立てています…</div>'
      + '<div class="vqn-app" data-appwrap></div>';
    d.classList.add("vqn-appmode", "show");
    requestAnimationFrame(function () { d.classList.add("in"); });
    d.scrollTop = 0;
    位置を当てる(d, "note");
    /* ★ 動くものは **たたまない**（触れないと 意味が無い）。 */
    try { 板をたたむ(false); } catch (e9) {}
    st.板 = { 見出し: String(見出し || ""), md: "", アプリ: true, at: Date.now() };

    var 帯 = b.querySelector("[data-appmsg]");
    var 置き場 = b.querySelector("[data-appwrap]");
    板の倍率を当てる(d, 1);
    /* ★ 高さを 増やした（2026-08-19 の 2 度目）。
       ゲームや 道具は 狭いと 遊べない。画面の 6 割は 使う。 */
    var 高 = Math.max(340, Math.min(680, Math.round((root.innerHeight || 700) * 0.60)));
    return new Promise(function (done) {
      var 済 = false;
      var 時計 = 0;
      var 返す = function (v) { if (済) return; 済 = true; clearTimeout(時計); done(v); };
      /* ★ 枠が 何も 報せて こなかったときの 最後の 手（2026-08-20）。
         報せが 来なければ この約束は 永久に 果たされず、
         道具の 返事が 返らないので **会話が 固まる**。 */
      時計 = setTimeout(function () {
        if (帯) { 帯.className = "vqn-appmsg ng"; 帯.textContent = "組み立てが 終わりませんでした。"; }
        返す({ だめ: "60 秒 待っても 組み上がりませんでした。",
               つぎ: "**動いたと 言わないでください。**中身を 短くして もう一度 試すか、"
                 + "showNote で 書いて 見せてください。" });
      }, 60000);
      st.板の枠 = root.VQB.app.枠(置き場, 符, {
        title: 見出し, 高さ: 高, appId: "live:" + 見出し,
        全画面: d.classList.contains("vqn-zen"),
        /* 中身に 合わせて 枠が 伸びたら、板の 高さの上限も ゆるめる
           （板の max-height に 引っかかって 下が 隠れないように）。 */
        高さが変わった: function (h) {
          try {
            if (d.classList.contains("vqn-zen")) return;
            var 余 = 150;
            var 要 = h + 余;
            var 天井 = Math.round((root.innerHeight || 800) * 0.9);
            d.style.maxHeight = Math.min(要, 天井) + "px";
          } catch (x) {}
        },
        報せ: function (種, 文言) {
          if (種 === "ok") {
            if (帯) { 帯.className = "vqn-appmsg"; 帯.textContent = "動いています。触ってみてください。"; }
            返す({ やった: "ボードで 動かしました。",
                   つぎ: "★★ **コードを 読み上げないでください。**"
                     + "声では「ボードに 出したよ。◯◯を 触ってみて」と ひとこと 添えるだけ。"
                     + "そのあと 何を するのか（遊びかた・見どころ）を ふつうの言葉で 短く 言います。" });
            return;
          }
          if (種 === "blank") {
            if (帯) { 帯.className = "vqn-appmsg ng"; 帯.textContent = "画面に 何も 描かれませんでした。"; }
            返す({ だめ: "組み立ては 通りましたが **画面に 何も 出ていません**。",
                   直しかた: "html に 見える中身を 入れるか、js の 中で"
                     + " document.getElementById(\"vqapp\") へ 中身を 足してください。"
                     + "そのうえで もう一度 showApp を 呼びます。" });
            return;
          }
          if (種 === "silent") {
            if (帯) { 帯.className = "vqn-appmsg ng"; 帯.textContent = "返事が ありません（重すぎるか 止まっています）。"; }
            返す({ だめ: "6 秒 返事が ありませんでした。重すぎるか 途中で 止まっています。",
                   直しかた: "作るものを 小さくして もう一度 showApp を 呼んでください。" });
            return;
          }
          /* 壊れた。**そのまま 返す。**Lumi が 読んで 直せる。 */
          if (帯) { 帯.className = "vqn-appmsg ng"; 帯.textContent = "うまく 動きませんでした：" + 文言; }
          if (/道具を 読み込めませんでした/.test(String(文言 || ""))) {
            返す({ だめ: "借りようとした 道具が ありません。",
                   エラー: String(文言 || "").slice(0, 300),
                   直しかた: "使える道具は phaser / three / matter / p5 / pixi / konva / fabric / "
                     + "chart / d3 / tone / howler / gsap / tailwind / katex / qrcode / sortable / "
                     + "lilgui / confetti だけです。この中から 選び直して もう一度 showApp を 呼んでください。" });
            return;
          }
          返す({ だめ: "動かしたら 止まりました。",
                 エラー: String(文言 || "").slice(0, 300),
                 直しかた: "★ この文をそのまま読んで 原因を 直し、**もう一度 showApp を 呼んでください。**"
                   + "外の道具（CDN・fetch・localStorage）は 使えません。"
                   + "1 枚で 完結する かんたんな作りに してください。" });
        }
      });
      /* 何も言ってこないまま 14 秒 → こちらから 打ち切る（永久に 待たせない）。
         ★ 重い道具（phaser は 1.2MB）を 借りると 1 本目は 数秒 かかる。
           2 本目からは 溜めから 出るので すぐ。 */
      setTimeout(function () {
        返す({ やった: "ボードに 出しました（まだ 読み込み中かもしれません）。",
               つぎ: "利用者に「出たよ、触ってみて」と 言ってください。"
                 + "動いていないと 言われたら、そのとき 直します。" });
      }, 14000);
    });
  }

  /* ══ 動くものの 操作（全画面・拡大縮小）════════════════════════════
     ★ 訴え（2026-08-19）「画面がバグってる。生成したものが 途切れる。
       もったいない。全画面とかにして、拡大縮小もできるように」。
     ★ 途切れるのは 枠の高さが 決め打ちだったから。中身の高さに 合わせる
       ようにしたうえで、それでも 足りないときのために 全画面を 足す。
     ★ 拡大縮小は 中の zoom で やる（引き伸ばしでは ぼやける）。 */
  function 板の操作をつなぐ(d) {
    if (d.__つないだ) return;
    d.__つないだ = true;
    var 帯 = d.querySelector(".vqn-ops");
    if (!帯) return;
    帯.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-op]") : null;
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      var op = t.getAttribute("data-op");
      if (op === "zen") { 板を全画面(d, !d.classList.contains("vqn-zen")); return; }
      var k = st.板の倍率 || 1;
      if (op === "in") k = Math.min(3, Math.round((k + 0.1) * 10) / 10);
      else if (op === "out") k = Math.max(0.4, Math.round((k - 0.1) * 10) / 10);
      else if (op === "reset") k = 1;
      板の倍率を当てる(d, k);
    }, true);
  }
  /* ══ 大きさを 当てる（2026-08-20）══════════════════════════════════
     ★ 動くもの（AR App）は 中の 枠に そのまま 渡す（zoom で 拡げる）。
     ★ 書いたものは **字の 大きさ**で 変える。
       画面ごと 引き伸ばすと ① ぼやける ② 横に はみ出す
       ③ 重ね板（線）の 座標が ずれる の 3 つが 起きる。
       字を 変えれば 中身は 組み直されるので、あとは **線を 引き直す**だけ。
     ★ 選んだ 大きさは 端末に 残す。次の板でも その大きさで 出す。 */
  function 板の倍率を当てる(d, k) {
    if (!d) return { 倍率: 1 };
    k = Math.max(0.4, Math.min(3, Number(k) || 1));
    st.板の倍率 = k;
    if (d.classList.contains("vqn-appmode")) {
      try { if (st.板の枠 && st.板の枠.拡大) st.板の枠.拡大(k); } catch (x) {}
    } else {
      var b = d.querySelector(".vqn-b");
      if (b) {
        b.style.fontSize = Math.round(k * 100) + "%";
        /* 組み直しが 済んでから 線を 引き直す（同じ番の 玉も そのまま）。 */
        setTimeout(function () { 線を引き直す(); }, 60);
      }
    }
    var v = d.querySelector("[data-zoomv]");
    if (v) v.textContent = Math.round(k * 100) + "%";
    try { root.localStorage.setItem("vq.live.zoom.note", String(k)); } catch (e) {}
    return { 倍率: k };
  }
  function 線を引き直す() {
    [(解説 && 解説.面) || null, st.単独の面 || null].forEach(function (m) {
      try { if (m && m.引き直す) m.引き直す(); else if (m && m.測り直す) m.測り直す(); } catch (e) {}
    });
  }
  /* 前に 選んだ 大きさを 出しなおす（板を 出すたび）。 */
  function 板の倍率を戻す(d) {
    var k = 1;
    try { k = Number(root.localStorage.getItem("vq.live.zoom.note")) || 1; } catch (e) { k = 1; }
    板の倍率を当てる(d, k);
    return k;
  }
  function 板を全画面(d, on) {
    if (!d) return { 全画面: false };
    if (on) {
      /* 置き場所を 覚えている inline の指定を 一時 どける（戻すために 控える）。 */
      if (!d.__もとの様子) {
        d.__もとの様子 = { left: d.style.left, top: d.style.top,
                           width: d.style.width, height: d.style.height,
                           transform: d.style.transform };
      }
      d.style.left = ""; d.style.top = ""; d.style.width = ""; d.style.height = "";
      d.style.transform = "";
      d.classList.add("vqn-zen");
    } else {
      d.classList.remove("vqn-zen");
      var m = d.__もとの様子;
      if (m) {
        d.style.left = m.left; d.style.top = m.top;
        d.style.width = m.width; d.style.height = m.height;
        d.style.transform = m.transform;
      }
    }
    var btn = d.querySelector('[data-op="zen"]');
    if (btn) {
      btn.textContent = on ? "⤡ もどす" : "⤢ 全画面";
      btn.setAttribute("aria-label", on ? "全画面をやめる" : "全画面にする");
    }
    try { if (st.板の枠 && st.板の枠.全画面にする) st.板の枠.全画面にする(on); } catch (x) {}
    return { 全画面: !!on };
  }

  function 板を閉じる() {
    var d = st.noteBox; if (!d) return { 閉じた: false };
    try { 解説を片づける(); } catch (e9) {}
    板のアプリを片づける();
    try { 板を全画面(d, false); } catch (e0) {}
    d.classList.remove("vqn-appmode");
    st.板の倍率 = 1;
    d.classList.remove("in");
    setTimeout(function () { d.classList.remove("show"); }, 200);
    st.板 = null; st.板のアプリ = null; st.残した = false;
    return { 閉じた: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     つまんで動かす（2026-08-18・訴え「ボードやカメラの位置を 自分で決めたい」）

     ★ 掴む所は **見出しの帯だけ**にする。中身の上で始めた指は
       読むための スクロールに 使わせる（奪うと 長い解説が 読めなくなる）。
     ★ 指もマウスも同じ口（pointer）で受ける。touch-action:none を
       掴む所だけに 付けてあるので、画面のスクロールとは 喧嘩しない。
     ★ 画面の外へ 逃がさない。**掴み直せなくなるのが いちばん困る**ので、
       どんなに端へ寄せても 56px は 画面に残す。
     ★ 置いた場所は 端末に残す。次に出したとき そこに出る。
       画面の大きさが 変わったら（回転・窓の伸縮）その場で 収め直す。
     ══════════════════════════════════════════════════════════════════ */
  var 位置の鍵 = "vq.live.pos.";
  function 位置を読む(key) {
    try {
      var v = JSON.parse(root.localStorage.getItem(位置の鍵 + key) || "null");
      if (v && isFinite(v.x) && isFinite(v.y)) return v;
    } catch (e) {}
    return null;
  }
  function 位置を書く(key, x, y) {
    try { root.localStorage.setItem(位置の鍵 + key, JSON.stringify({ x: x, y: y })); } catch (e) {}
  }
  function 位置を消す(key) {
    try { root.localStorage.removeItem(位置の鍵 + key); } catch (e) {}
  }
  /* 画面の中へ 収める。x,y は 左上の座標。 */
  function 収める(el, x, y) {
    var w = el.offsetWidth || 1, h = el.offsetHeight || 1;
    var W = root.innerWidth || 0, H = root.innerHeight || 0;
    var のこす = 56;
    x = Math.min(Math.max(x, のこす - w), Math.max(0, W - のこす));
    y = Math.min(Math.max(y, 2), Math.max(0, H - 40));
    void h;
    return { x: Math.round(x), y: Math.round(y) };
  }
  function 置く(el, key, x, y, 記す) {
    var q = 収める(el, x, y);
    el.style.left = q.x + "px";
    el.style.top = q.y + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.classList.add("moved");
    if (記す !== false) 位置を書く(key, q.x, q.y);
    return q;
  }
  function 位置を戻す(el, key) {
    if (!el) return false;
    el.classList.remove("moved");
    el.style.left = ""; el.style.top = ""; el.style.right = ""; el.style.bottom = "";
    位置を消す(key);
    return true;
  }
  /* しまってあった場所を 出すときに 当てる（無ければ 何もしない＝既定の場所） */
  function 位置を当てる(el, key) {
    if (!el) return;
    var v = 位置を読む(key);
    if (!v) { el.classList.remove("moved"); return; }
    /* 出した直後は 大きさが 0 のことがあるので 次の描画で 当てる */
    root.requestAnimationFrame(function () { 置く(el, key, v.x, v.y, false); });
  }
  function つまんで動かす(el, つまみ, key) {
    if (!el || !つまみ || つまみ.__vqDrag) return;
    つまみ.__vqDrag = 1;
    var 掴み = null;
    つまみ.addEventListener("pointerdown", function (e) {
      /* ボタンの上では 動かさない（閉じる・畳むを 押せなくしない） */
      if (e.target && e.target.closest && e.target.closest("button")) return;
      if (e.button !== undefined && e.button !== 0) return;
      var r = el.getBoundingClientRect();
      掴み = { dx: e.clientX - r.left, dy: e.clientY - r.top, 動いた: false };
      try { つまみ.setPointerCapture(e.pointerId); } catch (e2) {}
      e.preventDefault();
    });
    つまみ.addEventListener("pointermove", function (e) {
      if (!掴み) return;
      掴み.動いた = true;
      置く(el, key, e.clientX - 掴み.dx, e.clientY - 掴み.dy, false);
      e.preventDefault();
    });
    var 離す = function (e) {
      if (!掴み) return;
      var 動 = 掴み.動いた; 掴み = null;
      try { つまみ.releasePointerCapture(e.pointerId); } catch (e2) {}
      if (!動) return;
      var r = el.getBoundingClientRect();
      位置を書く(key, Math.round(r.left), Math.round(r.top));
    };
    つまみ.addEventListener("pointerup", 離す);
    つまみ.addEventListener("pointercancel", 離す);
  }
  /* 画面の大きさが 変わったら 収め直す（回転・窓の伸縮で 画面外へ出ない） */
  function 置き場を収め直す() {
    [[st.noteBox, "note"], [st.arBox, "ar"]].forEach(function (x) {
      var el = x[0];
      if (!el || !el.classList.contains("moved")) return;
      var r = el.getBoundingClientRect();
      置く(el, x[1], r.left, r.top);
    });
  }
  try {
    root.addEventListener("resize", function () {
      clearTimeout(st.t収め); st.t収め = setTimeout(置き場を収め直す, 160);
    });
  } catch (e) {}

  /* ══════════════════════════════════════════════════════════════════
     会話の履歴（2026-08-18・訴え）

     ★ 「文字で伝える」を開いている間、**自分の言葉と Lumi の言葉**を
       さかのぼって読めるようにする。声は流れて消えてしまうので、
       打って聞くときほど「さっき何て言った？」が要る。
     ★ 1 枚の面には しない。**1 つずつ 浮いている**形にする
       （空間に メッセージが 置いてある感じ）。
     ★ 箱そのものは 素通り。玉だけ 押せる。画面の操作を 奪わない。
     ★ それでも邪魔なときのために **出す／しまう**を 押して選べる。
     ★ 長い返事は 2 行で 畳む。押したときだけ 伸びる。
     ══════════════════════════════════════════════════════════════════ */
  function 履歴が要るか() {
    try {
      var v = root.__vqSet && root.__vqSet.get("voice.log");
      return v === undefined ? true : !!v;
    } catch (e) { return true; }
  }
  function ensureLog() {
    if (st.logBox) return st.logBox;
    ensureCss();
    try {
      var d = doc.createElement("div");
      d.id = "vqLiveLog";
      d.setAttribute("role", "log");
      d.setAttribute("aria-label", "Lumi との会話");
      /* 頭は 上に貼り付ける（下まで読んでも 保存の入口が 消えない） */
      d.innerHTML = '<div class="vqlg-h"><span class="vqlg-n">会話の履歴</span>'
        + '<span class="vqlg-sp"></span>'
        + '<button class="vqlg-save" type="button">Quick Chat に残す</button></div>';
      d.addEventListener("click", function (e) {
        var sv = e.target.closest ? e.target.closest(".vqlg-save") : null;
        if (sv) {
          e.preventDefault(); e.stopPropagation();
          var r = 会話をChatへ保存("押して保存");
          sv.textContent = r && r.保存した
            ? "Quick Chat に残しました"
            : (r && r.だめ ? r.だめ : "残せませんでした");
          clearTimeout(st.t保存表示);
          st.t保存表示 = setTimeout(function () { sv.textContent = "Quick Chat に残す"; }, 2400);
          return;
        }
        var b = e.target.closest ? e.target.closest(".vqlg-more") : null;
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        var 玉 = b.closest(".vqlg-m"); if (!玉) return;
        玉.setAttribute("data-open", 玉.getAttribute("data-open") === "1" ? "0" : "1");
        玉の畳みを見る(玉);
      });
      doc.body.appendChild(d);
      st.logBox = d;
    } catch (e) { st.logBox = null; }
    return st.logBox;
  }
  /* 玉だけ 消す（頭は 残す） */
  function 履歴を空にする() {
    var d = st.logBox; if (!d) return;
    Array.prototype.slice.call(d.querySelectorAll(".vqlg-m,.vqlg-e"))
      .forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
  }
  /* 2 行を超えているか。**超えていないものに ボタンを出さない**
     （押しても何も起きない入口は 置かない）。 */
  function 玉の畳みを見る(玉) {
    var t = 玉.querySelector(".vqlg-t"); if (!t) return;
    var 開く = 玉.getAttribute("data-open") === "1";
    玉.classList.remove("clip");
    var lh = 0;
    try { lh = parseFloat(root.getComputedStyle(t).lineHeight) || 0; } catch (e) {}
    if (!lh) lh = 23;
    var 長い = t.scrollHeight > lh * 2 + 2;
    玉.classList.toggle("long", 長い);
    if (長い && !開く) 玉.classList.add("clip");
    var b = 玉.querySelector(".vqlg-more");
    if (b) {
      b.textContent = 開く ? "たたむ" : "つづきを読む";
      b.setAttribute("aria-expanded", 開く ? "true" : "false");
    }
  }
  function 玉を作る(e) {
    var m = doc.createElement("div");
    m.className = "vqlg-m " + (e.who === "me" ? "me" : "ai");
    m.innerHTML = '<div class="vqlg-c"><div class="vqlg-t"></div>'
      + '<button class="vqlg-more" type="button" aria-expanded="false">つづきを読む</button></div>';
    return m;
  }
  function 履歴を描く() {
    var d = ensureLog(); if (!d) return;
    var 箱 = st.履歴 || [];
    if (!箱.length) {
      if (!d.querySelector(".vqlg-e")) {
        履歴を空にする();
        var e0 = doc.createElement("div");
        e0.className = "vqlg-e"; e0.textContent = "まだ やりとりがありません";
        d.appendChild(e0);
      }
      return;
    }
    var 空 = d.querySelector(".vqlg-e"); if (空 && 空.parentNode) 空.parentNode.removeChild(空);
    for (var i = 0; i < 箱.length; i++) {
      var e = 箱[i];
      if (!e.el || !e.el.parentNode) {
        e.el = 玉を作る(e);
        d.appendChild(e.el);
        (function (el) {
          root.requestAnimationFrame(function () { el.classList.add("in"); });
        })(e.el);
      }
      var t = e.el.querySelector(".vqlg-t");
      if (t.textContent !== e.text) { t.textContent = e.text; 玉の畳みを見る(e.el); }
      /* 古いものほど 薄く（奥に置いてある感じ） */
      var 後ろから = 箱.length - 1 - i;
      e.el.classList.toggle("far", 後ろから >= 2 && 後ろから < 5);
      e.el.classList.toggle("far2", 後ろから >= 5);
    }
    /* いちばん下（新しいもの）を 見せる */
    try { d.scrollTop = d.scrollHeight; } catch (e2) {}
  }
  /* who: "me" | "ai"。つづき=true なら 最後の 1 件を 書き換える。
     声=true なら 途切れて届くので、少し前のものへ つなぐ。 */
  function 履歴を書く(who, text, つづき, 声) {
    var t = String(text == null ? "" : text);
    if (!t.trim()) return;
    if (!st.履歴) st.履歴 = [];
    var 最後 = st.履歴[st.履歴.length - 1];
    if (つづき && 最後 && 最後.who === who) 最後.text = t;
    else if (声 && 最後 && 最後.who === who && 最後.声 && Date.now() - 最後.at < 9000)
      { 最後.text = (最後.text + t).slice(-1400); 最後.at = Date.now(); }
    else {
      st.履歴.push({ who: who, text: t, at: Date.now(), 声: !!声, el: null });
      /* 覚えておくのは 直近 60 件（古いものは 玉ごと外す） */
      while (st.履歴.length > 60) {
        var 古 = st.履歴.shift();
        try { if (古.el && 古.el.parentNode) 古.el.parentNode.removeChild(古.el); } catch (e) {}
      }
    }
    if (st.logOn) 履歴を描く();
  }
  /* ══════════════════════════════════════════════════════════════════
     Quick Chat へ 会話として残す（2026-08-18・訴え）

     ★ 声の会話は 終われば 消える。**あとから読み返せるようにする。**
     ★ 置き場所は Quick Chat と **まったく同じ**
       （app.chat.sessions.v2 の 1 件 ＋ app.chat.ses.<id>.v2 の本文）。
       専用の入れ物を 作らない——作ると Quick Chat 側の
       名前変更・削除・検索・書き出しが 一切 効かなくなる。
     ★ ただし Quick Chat の本体は、記憶の中の一覧で
       sessions.v2 を **丸ごと書き戻す**ことがある（_chatSaveSessions）。
       そのとき 一覧から 消えても **本文は残る**ので、
       自分の控え（vq.lumi.chats.v1）を 見て 並べ直す。
     ★ 残るのは **この端末のブラウザの中**。Quick Chat の会話一覧と
       同じ扱いで、端末をまたいでは 揃わない（本体もそうなっている）。
     ══════════════════════════════════════════════════════════════════ */
  var 一覧の鍵 = "app.chat.sessions.v2";
  var 控えの鍵 = "vq.lumi.chats.v1";
  function 本文の鍵(id) { return "app.chat.ses." + id + ".v2"; }
  function LS読む(k, 既定) {
    try { var v = JSON.parse(root.localStorage.getItem(k) || "null"); return v == null ? 既定 : v; }
    catch (e) { return 既定; }
  }
  function LS書く(k, v) {
    try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function 題を作る(箱) {
    for (var i = 0; i < 箱.length; i++) {
      if (箱[i].who !== "me") continue;
      var t = String(箱[i].text || "").replace(/\s+/g, " ").trim();
      if (t) return t.length > 28 ? t.slice(0, 27) + "…" : t;
    }
    var d = new Date();
    return "Lumi との会話 " + (d.getMonth() + 1) + "/" + d.getDate();
  }
  function 会話をChatへ保存(なぜ) {
    var 箱 = (st.履歴 || []).filter(function (x) { return x && String(x.text || "").trim(); });
    if (箱.length < 2) return { だめ: "やりとりが 足りません" };
    /* 同じ会話を 二度 残さない（自動と 手押しが 重なることがある）。
       ★ ただし **前に残したものが 本当に まだ在るとき だけ**（2026-08-18）。
         消えているのに「もう残した」と返すと、押しても 何も起きない
         ＝ 会話を 失ったまま 気づけない。 */
    if (st.保存した && st.保存した.数 === 箱.length
        && LS読む(本文の鍵(st.保存した.id), null) != null)
      return { 保存した: true, 同じ: true, id: st.保存した.id };
    var id = "ses-lumi-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var 本文 = 箱.map(function (x, i) {
      return {
        id: id + "-m" + i,
        ts: Number(x.at) || Date.now(),
        updatedAt: Number(x.at) || Date.now(),
        deletedAt: 0,
        role: x.who === "me" ? "user" : "ai",
        text: String(x.text || "").slice(0, 3200),
        intent: "lumi_voice",
        aiMeta: null, uiKind: "", imageData: null, imageMimeType: null, imagePrompt: null,
        rejection: null, attachments: [], presetCard: null, processLog: [],
        processElapsedMs: 0, _html: false
      };
    });
    if (!LS書く(本文の鍵(id), 本文)) return { だめ: "端末に 残せませんでした" };
    var 題 = 題を作る(箱);
    var 一覧 = LS読む(一覧の鍵, []);
    if (!Array.isArray(一覧)) 一覧 = [];
    一覧.unshift({ id: id, title: 題, updatedAt: Date.now(), messageCount: 本文.length, projectId: "" });
    LS書く(一覧の鍵, 一覧);
    /* Quick Chat 側の 題の持ち主（本体が一覧を書き戻しても 題は残る） */
    var 題表 = LS読む("vq.chat.titles.v1", {}); 題表[id] = 題; LS書く("vq.chat.titles.v1", 題表);
    var 控え = LS読む(控えの鍵, []);
    if (!Array.isArray(控え)) 控え = [];
    控え.unshift({ id: id, title: 題, ts: Date.now(), n: 本文.length });
    while (控え.length > 200) 控え.pop();
    LS書く(控えの鍵, 控え);
    st.保存した = { id: id, 数: 箱.length };
    noteEv("Quick Chat へ 残した（" + 本文.length + " 件・" + (なぜ || "") + "）");
    return { 保存した: true, id: id, 題: 題, 件数: 本文.length };
  }
  /* 本体が 一覧を書き戻して 消えてしまった ぶんを 並べ直す。
     **本文が 残っているものだけ**入れる（空の行を 作らない）。 */
  function 控えから並べ直す() {
    var 控え = LS読む(控えの鍵, []);
    if (!Array.isArray(控え) || !控え.length) return 0;
    var 一覧 = LS読む(一覧の鍵, []);
    if (!Array.isArray(一覧)) 一覧 = [];
    var ある = {};
    一覧.forEach(function (x) { if (x && x.id) ある[x.id] = 1; });
    var 戻した = 0;
    控え.forEach(function (x) {
      if (!x || !x.id || ある[x.id]) return;
      if (LS読む(本文の鍵(x.id), null) == null) return;      /* 本文が 無いものは 入れない */
      一覧.unshift({ id: x.id, title: x.title || "Lumi との会話",
                     updatedAt: Number(x.ts) || Date.now(), messageCount: Number(x.n) || 0, projectId: "" });
      戻した++;
    });
    if (戻した) LS書く(一覧の鍵, 一覧);
    return 戻した;
  }
  function 残す設定か() {
    try {
      var v = root.__vqSet && root.__vqSet.get("voice.saveChat");
      return v === undefined ? true : !!v;
    } catch (e) { return true; }
  }

  function showLog(on, 自分で) {
    var d = ensureLog(); if (!d) return;
    var 出す = !!on && 履歴が要るか();
    if (自分で) st.履歴を自分で決めた = true;
    st.logOn = 出す;
    if (出す) {
      /* ★ **見せてから 描く**（2026-08-18・実測）。
         隠れているうちに 測ると 高さが 0 になり、
         「2 行を超えているか」の判定が 全部 素通りしていた。 */
      d.classList.add("show");
      履歴を描く();
    } else d.classList.remove("show");
    [st.logBtn, st.barLog].forEach(function (b) {
      if (!b) return;
      b.classList.toggle("on", 出す);
      b.setAttribute("aria-pressed", 出す ? "true" : "false");
      b.setAttribute("aria-label", 出す ? "会話の履歴をしまう" : "会話の履歴を見る");
      b.title = 出す ? "会話の履歴をしまう" : "会話の履歴を見る";
    });
  }
  /* ══ こちらから マイクを止める（2026-08-18・訴え）══════════════════
     ★ 「ちょっと家族と話す」「まわりがうるさい」ときに、会話を切らずに
       黙らせたい。切ってしまうと 話の続きが 失われる。
     ★ 止めている間は 一切 送らない（worklet 側で 送信そのものを止める）。
       割り込みの判定も 止める（自分の声で 勝手に開いてしまうため）。 */
  function マイクを止める(止める, 自分で) {
    var t = !!止める;
    st.手ミュート = t;
    try { if (st.micNode) st.micNode.port.postMessage({ type: "mute", on: t || !!st.speaking }); } catch (e) {}
    try { doc.body.classList.toggle("vq-live-mute", t); } catch (e2) {}
    var b = st.micBtn;
    if (b) {
      b.classList.toggle("off", t);
      b.setAttribute("aria-pressed", t ? "true" : "false");
      var 名 = t ? "マイクを戻す（いま止めています）" : "マイクを止める";
      b.setAttribute("aria-label", 名); b.title = 名;
    }
    if (自分で) noteEv(t ? "自分でマイクを止めた" : "自分でマイクを戻した");
    return t;
  }
  function ensureMicBtn() {
    if (st.micBtn) return st.micBtn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveMic"; b.type = "button";
      b.setAttribute("aria-label", "マイクを止める");
      b.setAttribute("aria-pressed", "false");
      b.title = "マイクを止める";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="9" y="3" width="6" height="11" rx="3"/>'
        + '<path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>'
        + '<path class="sl" d="M4 3l16 18"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        マイクを止める(!st.手ミュート, true);
      });
      dockへ(b, 0);
      st.micBtn = b;
    } catch (e) { st.micBtn = null; }
    return st.micBtn;
  }

  function ensureLogBtn() {
    if (st.logBtn) return st.logBtn;
    ensureCss();
    try {
      var b = doc.createElement("button");
      b.id = "vqLiveLogBtn"; b.type = "button";
      b.setAttribute("aria-label", "会話の履歴を見る");
      b.setAttribute("aria-pressed", "false");
      b.title = "会話の履歴を見る";
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
        + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.7A7.5 7.5 0 1 1 20 12.5z"/>'
        + '<path d="M8.6 10.6h6.8M8.6 14h4.4"/></svg>';
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        showLog(!st.logOn, true);
      });
      dockへ(b, 1);
      st.logBtn = b;
    } catch (e) { st.logBtn = null; }
    return st.logBtn;
  }

  function カメラ開始(向き) {
    var f = 向き || st.camFacing || "environment";
    if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      say("この端末では カメラを使えません");
      return Promise.resolve({ だめ: "getUserMedia がありません" });
    }
    /* 切り替えのときは 先に 止める（2 本 同時に掴むと 端末が拒む） */
    var 前 = st.cast ? キャスト終了("カメラを切り替える") : null;
    st.camFacing = f;
    return Promise.resolve(前).then(function () {
      /* ★ **なめらかさは ここで決まる**（2026-08-17・訴え「ラグすぎる」）。
         最初は 8 コマ/秒 にしていた。送るのは 1 秒に 1 枚だから 十分だと
         思ったが、**小窓に映るのは 生の流れ**なので、そのまま 8 コマの
         カクカクした絵になっていた。**送る間隔と 映す滑らかさは 別物。**
         ここは 30 コマ/秒 を頼み、送るほうを 間引く。 */
      /* ★ 60 コマ/秒 を頼む（2026-08-17・訴え「もっと ぬるぬるに」）。
         端末が 60 を出せなければ 自動で 30 に落ちる（ideal なので 断られない）。
         min を 24 にしておくと、暗い所で 勝手に 15 まで 落とされるのを 防げる
         （カメラは 暗いと コマ数を 落として 明るさを 稼ごうとする）。 */
      /* ★ min は **絶対の条件**（2026-08-18・実測）。
         24 コマを 出せない端末は、掴めずに OverconstrainedError で 落ちる。
         ＝ カメラが **一度も映らない**。コマ数が足りないことより、
         映らないことのほうが ずっと困る。
         断られたら **条件をゆるめて 掴み直す**。3 段で 諦めない。 */
      var 頼み = [
        { video: { facingMode: { ideal: f },
                   width: { ideal: 1280 }, height: { ideal: 720 },
                   frameRate: { ideal: 60, min: 24 } }, audio: false },
        { video: { facingMode: { ideal: f }, frameRate: { ideal: 30 } }, audio: false },
        { video: true, audio: false }
      ];
      var 掴む = function (i) {
        return navigator.mediaDevices.getUserMedia(頼み[i]).catch(function (e) {
          var 名 = String((e && e.name) || "");
          /* ゆるめて 直せるのは 条件の問題だけ。断られた・無いのは そのまま返す。 */
          if (i + 1 >= 頼み.length || (名 !== "OverconstrainedError" && 名 !== "NotReadableError")) throw e;
          noteEv("カメラの条件が 厳しすぎた（" + 名 + "）ので ゆるめて 掴み直す");
          return 掴む(i + 1);
        });
      };
      return 掴む(0);
    }).then(function (s) { return 流れから始める(s, "カメラ"); })
      .catch(function (e) {
        var 名 = String((e && e.name) || "");
        if (名 === "NotAllowedError") say("カメラの使用が 許可されませんでした");
        else if (名 === "NotFoundError") say("カメラが 見つかりませんでした");
        else say("カメラを 使えませんでした");
        noteEv("カメラを 使えなかった（" + 名 + "）");
        return { だめ: 名 || "失敗" };
      });
  }

  /* ══ しっかり撮る（2026-08-17）═══════════════════════════════════
     ★ 訴え「ワークの答えと Lumi が 違うことがある」。
       送り続けている絵は **横 896px・JPEG 55%**。動きを伝えるには十分でも、
       印刷された 小さい式や 手書きを 読むには 粗すぎる。
       ここで **フル解像度・92%** の 一枚を 撮る。読み取りの土台を上げる。
     ★ 撮った一枚は 送り続けとは 別に扱う（会話の流れを 乱さない）。 */
  function しっかり撮る(最大幅) {
    var v = st.castVideo;
    if (!v || !st.cast) return null;
    var vw = v.videoWidth || 0, vh = v.videoHeight || 0;
    if (!vw || !vh) return null;
    var W = Math.min(Number(最大幅) || 1600, vw);
    var H = Math.round(vh * (W / vw));
    var cv = doc.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.getContext("2d").drawImage(v, 0, 0, W, H);
    var url = cv.toDataURL("image/jpeg", 0.92);
    return { dataUrl: url, base64: url.slice(url.indexOf(",") + 1),
             幅: W, 高: H, バイト: Math.round(url.length * 0.75) };
  }

  /* Lumi が 絵の上に 印を置く（AR）。位置は **0〜1 の割合**。
     px で受けると 端末ごとに ずれる。 */
  function 印を置く(x, y, 文字) {
    var d = ensureAR(); if (!d) return { だめ: "小窓が ありません" };
    var m = d.querySelector(".vqar-marks"); if (!m) return { だめ: "置く所が ありません" };
    var px = Math.max(0, Math.min(1, Number(x)));
    var py = Math.max(0, Math.min(1, Number(y)));
    var e = doc.createElement("div");
    e.className = "vqar-m";
    e.style.left = (px * 100).toFixed(1) + "%";
    e.style.top = (py * 100).toFixed(1) + "%";
    e.innerHTML = '<i class="vqar-dot"></i>'
      + (文字 ? '<span class="vqar-t"></span>' : "");
    if (文字) e.querySelector(".vqar-t").textContent = String(文字).slice(0, 40);
    m.appendChild(e);
    st.arMarks = (st.arMarks || 0) + 1;
    /* 置きっぱなしにしない（古い印が残ると 何を指しているか 分からなくなる） */
    setTimeout(function () { try { e.remove(); } catch (e2) {} }, 20000);
    return { 置いた: { x: px, y: py, 文字: String(文字 || "") }, いまの印: m.children.length };
  }
  function 印を消す() {
    var d = st.arBox; if (!d) return { 消した: 0 };
    var m = d.querySelector(".vqar-marks"); if (!m) return { 消した: 0 };
    var n = m.children.length; m.innerHTML = "";
    return { 消した: n };
  }

  /* ══ 端末を 横にしたら 帯も 横にする（2026-08-17）═══════════════════
     ★ 訴え「カメラが 横になったら、上部の 文字も 横に なるように」。
     ★ ふつうは 端末を 倒すと 画面ごと 回る。**回らないとき**だけ こちらで回す。
       ・アプリを 縦で 固定している（PWA の manifest）
       ・端末の 画面回転ロックが 入っている
       このとき 画面の 縦横は そのままなのに、**人の目だけが 横**になる。
     ★ 見分けかた: 端末の 向きの角度（90 / 270）と、
       **画面が 実際に 横長になったか**（innerWidth > innerHeight）を 比べる。
       角度が 横なのに 画面が 縦のまま＝ 回っていない → こちらで 回す。
     ★ 回すのは 帯・小窓・板 の 3 つだけ。アプリ本体は 触らない
       （本体まで回すと 押す所が ずれて 使えなくなる）。 */
  function 向きを合わせる() {
    try {
      var 角 = 0;
      if (root.screen && root.screen.orientation
          && typeof root.screen.orientation.angle === "number") {
        角 = root.screen.orientation.angle;
      } else if (typeof root.orientation === "number") {
        角 = (root.orientation + 360) % 360;
      }
      var 画面が横 = root.innerWidth > root.innerHeight;
      var 端末が横 = (角 === 90 ||角 === 270);
      var b = doc.body;
      b.classList.remove("vq-yoko", "vq-yoko-r", "vq-yoko-l");
      /* 画面が すでに 回っているなら 何もしない（二重に回さない）。 */
      if (!端末が横 || 画面が横) { st.横 = ""; return st.横; }
      b.classList.add("vq-yoko", 角 === 90 ? "vq-yoko-r" : "vq-yoko-l");
      st.横 = 角 === 90 ? "右" : "左";
      return st.横;
    } catch (e) { return ""; }
  }
  function 向きの見張りを付ける() {
    if (st.向き見張り) return;
    st.向き見張り = true;
    var 回 = function () { setTimeout(向きを合わせる, 120); };
    try {
      if (root.screen && root.screen.orientation && root.screen.orientation.addEventListener) {
        root.screen.orientation.addEventListener("change", 回);
      }
      root.addEventListener("orientationchange", 回);
      root.addEventListener("resize", 回);
    } catch (e) {}
    向きを合わせる();
  }

  /* ══ 紙に貼りつく 答え（2026-08-17）═══════════════════════════════
     ★ 訴え「空欄に 解答を 残して。カメラが動いても そこに 出し続けて。
       押すと 解説も 出るように」。
     ★ 置いた場所の **絵の切れはし**を 覚えて、毎こま 追いかける
       （core/ar/track.js）。カメラが動いても 紙の同じ所に とどまる。
     ★ 見失ったら **薄くして 消す。**違う所を はっきり指すより ましだから。 */
  function 追跡() {
    if (!st.追跡器 && root.VQAR) st.追跡器 = root.VQAR.作る();
    return st.追跡器 || null;
  }
  function 答えを置く(一覧) {
    var T = 追跡(); var d = ensureAR();
    if (!T || !d) return { だめ: "貼りつける 仕組みが ありません。" };
    if (!st.cast || st.castKind !== "カメラ" || !st.castVideo)
      return { だめ: "カメラを 見せていません。**何もしていません。**" };
    var m = d.querySelector(".vqar-marks");
    var 出 = [], 追えない = [];
    (一覧 || []).slice(0, 12).forEach(function (x, i) {
      if (!x) return;
      var id = "a" + (st.答え番 = (st.答え番 || 0) + 1);
      var r = T.置く(st.castVideo, id, x.x, x.y,
        { 答え: String(x.answer || x.答え || ""),
          解説: String(x.explanation || x.解説 || ""),
          自信: Number(x.confidence !== undefined ? x.confidence : x.自信) });
      if (r.だめ) return;
      if (!r.追える) 追えない.push(String(x.answer || "").slice(0, 20));
      /* 札を 1 つ 作る（位置は 追う() が 毎こま 入れ直す） */
      var e = doc.createElement("div");
      e.className = "vqar-ans";
      e.setAttribute("data-ar", id);
      var 自 = Number(x.confidence !== undefined ? x.confidence : x.自信);
      if (自 === 自 && 自 < 0.6) e.classList.add("is-low");
      /* ★ 解説は **札の中に 書かない**。押されたときに 板へ出すので、
         ここでは 持っておくだけ（属性に 入れる）。 */
      var 答文 = String(x.answer || x.答え || "");
      var 説 = String(x.explanation || x.解説 || "");
      e.setAttribute("data-ans", 答文.slice(0, 60));
      e.setAttribute("data-why", 説.slice(0, 1200));
      e.innerHTML = '<span class="vqar-chip"></span>';
      e.querySelector(".vqar-chip").textContent =
        答文.slice(0, 40) + ((自 === 自 && 自 < 0.6) ? "（たぶん）" : "");
      m.appendChild(e);
      出.push({ id: id, x: x.x, y: x.y, 答え: String(x.answer || x.答え || "") });
    });
    if (!出.length) return { だめ: "1 つも 置けませんでした。x と y は 0〜1 の割合です。" };
    追いかけを回す();
    return { 置いた: 出.length, ところ: 出,
             追えないもの: 追えない.length ? 追えない : undefined,
             つぎ: "押すと 解説が 開きます。カメラを 動かしても その場に とどまります。"
               + (追えない.length ? "（のっぺりした所は 追えないので その場に 固定されます）" : "") };
  }
  /* 毎こま 位置を 入れ直す。**映像のこまに 合わせる**（時計で回すと ずれる）。 */
  function 追いかけを回す() {
    if (st.追い中) return;
    st.追い中 = true;
    var 回 = function () {
      if (!st.cast || st.castKind !== "カメラ" || !st.castVideo) { st.追い中 = false; return; }
      var T = st.追跡器, d = st.arBox;
      if (!T || !d || !T.数()) { st.追い中 = false; return; }
      var 位置 = [];
      try { 位置 = T.追う(st.castVideo); } catch (e) {}
      var m = d.querySelector(".vqar-marks");
      位置.forEach(function (p) {
        var e = m.querySelector('[data-ar="' + p.id + '"]');
        if (!e) return;
        e.style.left = (p.x * 100).toFixed(2) + "%";
        e.style.top = (p.y * 100).toFixed(2) + "%";
        e.style.opacity = String(Math.max(0.15, p.濃さ));
      });
      /* 追跡から 消えた札は 画面からも 消す */
      Array.prototype.slice.call(m.querySelectorAll("[data-ar]")).forEach(function (e) {
        var id = e.getAttribute("data-ar");
        if (!位置.some(function (p) { return p.id === id; })) e.remove();
      });
      /* ★ 追いかけは **毎こまでは やらない**（2026-08-17）。
         紙は 1/12 秒で 大きくは 動かない。60 こま/秒 で 追うと、
         端末が 熱くなるうえ、外れた一致に 乗り換える機会が 5 倍に増えて
         **流されやすくなる**（実測で 流された）。 */
      setTimeout(function () {
        if (root.requestAnimationFrame) root.requestAnimationFrame(回); else 回();
      }, 80);
    };
    setTimeout(function () {
      if (root.requestAnimationFrame) root.requestAnimationFrame(回); else 回();
    }, 80);
  }
  function 答えを消す() {
    var T = st.追跡器, d = st.arBox;
    var n = T ? T.消す() : 0;
    if (d) Array.prototype.slice.call(d.querySelectorAll("[data-ar]"))
      .forEach(function (e) { e.remove(); });
    return { 消した: n };
  }

  function 流れから始める(stream, 種類) {
    return Promise.resolve().then(function () {
      st.castStream = stream;
      st.castKind = 種類 || "画面";
      var v;
      if (st.castKind === "カメラ") {
        /* カメラのときは **小窓の中の video を そのまま使う**。
           別に作ると、絵を 2 回 復号することになって 端末が熱くなる。 */
        var box = ensureAR();
        v = box ? box.querySelector("video") : doc.createElement("video");
        if (box) {
          box.classList.add("show"); box.querySelector(".vqar-marks").innerHTML = "";
          位置を当てる(box, "ar");
        }
      } else {
        v = doc.createElement("video");
      }
      v.srcObject = stream; v.muted = true; v.playsInline = true;
      st.castVideo = v;
      /* 利用者が ブラウザ側の「共有をやめる」を押したときも止める */
      try {
        stream.getVideoTracks().forEach(function (t) {
          t.addEventListener("ended", function () { キャスト終了("利用者が止めた"); });
        });
      } catch (e) {}
      return v.play().catch(function () {}).then(function () {
        st.cast = true;
        st.castN = 0; st.castSkip = 0; st.castHash = "";
        キャストの見た目();
        say(st.castKind === "カメラ"
          ? "カメラを見せています（" + (st.camFacing === "user" ? "内向き" : "外向き") + "）"
          : "画面を見せています");
        キャストを送り続ける();
        /* ★ **見え始めたことを Lumi へ 一言だけ 伝える。**
           伝えないと、映っているのに 気づかないまま 話し続ける
           （画面の共有で 実際に そうなっていた）。返事は求めない。 */
        if (st.castKind === "カメラ") {
          try {
            if (st.ws && st.ws.readyState === 1) {
              st.ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{
                text: "（合図）いま スマホのカメラの映像を 見せ始めました。"
                  + "1 秒に 1 枚ずつ 届きます。見えたものについて 聞かれたら 答えてください。"
                  + "指し示したいときは markInView を使ってください。"
              }] }], turnComplete: false } }));
            }
          } catch (e3) {}
        }
        return { 始めた: true, 種類: st.castKind, 向き: st.camFacing || "" };
      });
    });
  }
  function キャスト終了(なぜ) {
    clearTimeout(st.castT); st.castT = null;
    try { if (st.castStream) st.castStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    var 種 = st.castKind || "画面";
    st.castStream = null; st.castVideo = null;
    /* カメラの小窓を 畳む。映像の口も 外す（外さないと 最後の絵が 残る）。 */
    try {
      if (st.arBox) {
        st.arBox.classList.remove("show", "big");
        var vv = st.arBox.querySelector("video");
        if (vv) vv.srcObject = null;
        var mm = st.arBox.querySelector(".vqar-marks");
        if (mm) mm.innerHTML = "";
      }
    } catch (e4) {}
    if (st.cast) {
      st.cast = false; st.castKind = "";
      キャストの見た目();
      say(種 === "カメラ" ? "カメラの共有をやめました" : "画面の共有をやめました");
    }
    if (なぜ) noteEv(種 + "の共有を止めた（" + なぜ + "）");
  }
  /* 1 枚ぶんの絵を作って送る。**変わっていない絵は送らない**（枠と通信の節約）。 */
  function キャストを送り続ける() {
    clearTimeout(st.castT);
    if (!st.cast) return;
    var 次 = function (ms) { st.castT = setTimeout(キャストを送り続ける, ms); };
    if (!st.ws || st.ws.readyState !== 1 || !st.castVideo) return 次(700);
    /* 画面が 見えていないときは 何もしない（裏で 絵を詰め続けない）。 */
    try { if (doc.hidden) return 次(1200); } catch (e0) {}
    try {
      var v = st.castVideo;
      var vw = v.videoWidth || 0, vh = v.videoHeight || 0;
      if (!vw || !vh) return 次(500);
      /* 送る絵は 横 896px まで。読ませるには十分で、量は 1/2 以下になる。 */
      var W2 = Math.min(896, vw), H2 = Math.round(vh * (W2 / vw));
      if (!st.castCv) st.castCv = doc.createElement("canvas");
      var cv = st.castCv; cv.width = W2; cv.height = H2;
      var cx = cv.getContext("2d");
      cx.drawImage(v, 0, 0, W2, H2);
      /* 変わったかを **小さくして** 見る（毎回まるごと比べない） */
      if (!st.castSm) st.castSm = doc.createElement("canvas");
      var sm = st.castSm; sm.width = 32; sm.height = 18;
      var sx = sm.getContext("2d");
      sx.drawImage(cv, 0, 0, 32, 18);
      var d = sx.getImageData(0, 0, 32, 18).data;
      var h = "";
      for (var i = 0; i < d.length; i += 16) h += (d[i] >> 4).toString(16);
      if (h === st.castHash) { st.castSkip++; return 次(600); }
      st.castHash = h;
      /* ★ **絵を JPEG にする所で 画面が 止まっていた**（2026-08-17・訴え
         「カメラが ラグすぎる」）。toDataURL は **その場で 最後まで 詰める**ので、
         896px を 1 秒おきに 詰めるたび、指の動きも 映像も 一瞬 固まる。
         toBlob なら 詰めるのは 別の手に 渡り、こちらは 止まらない。
         使えない端末では これまでどおり toDataURL に 落ちる。 */
      if (cv.toBlob) {
        cv.toBlob(function (blob) {
          if (!blob || !st.cast || !st.ws || st.ws.readyState !== 1) return;
          var fr = new root.FileReader();
          fr.onload = function () {
            try {
              var s = String(fr.result || "");
              st.ws.send(JSON.stringify({ realtimeInput: {
                video: { mimeType: "image/jpeg", data: s.slice(s.indexOf(",") + 1) } } }));
              st.castN++; st.castAt = Date.now();
            } catch (e2) {}
          };
          fr.readAsDataURL(blob);
        }, "image/jpeg", 0.55);
      } else {
        var url = cv.toDataURL("image/jpeg", 0.55);
        st.ws.send(JSON.stringify({ realtimeInput: {
          video: { mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) } } }));
        st.castN++; st.castAt = Date.now();
      }
    } catch (e) {}
    /* 1 秒に 1 枚まで。動きが速いときでも これ以上は増やさない。 */
    次(1000);
  }

  /* ══ 入力欄は **影の中**に作る（2026-08-16）════════════════════════
     ★ アプリの CSS と勝ち負けをやっても切りがない。実測で、枠・面・影は
       通ったのに **入力欄の focus の見た目だけ**が向こうに取られた。
       アプリ本体と同じように 影の中に入れれば、外の CSS は一切届かない。
     ★ 見た目は プリセット AI の入力欄（.vq2-tlc-box）を写す:
       丸い一本（角 999px）・面の色・1px 枠・二重の影・36px の丸い送信。
     ★ 色と角は **アプリの変数**を引き継ぐ（影の中でも var は外から届く）。 */
  var BAR_CSS = [
    ":host{position:fixed;left:0;right:0;bottom:0;z-index:2147483602;",
    "display:none;transform:translateY(110%);",
    "transition:transform .22s cubic-bezier(.2,.8,.2,1);}",
    ":host(.show){display:block;}",
    ":host(.in){transform:translateY(0);}",
    ".wrap{padding:30px 12px calc(10px + env(safe-area-inset-bottom,0px));",
    "background:linear-gradient(to bottom,transparent 0%,",
    "var(--vq-bg-subtle,#F7F6FB) 46%,var(--vq-bg-subtle,#F7F6FB) 100%);}",
    ".box{display:flex;align-items:flex-end;gap:6px;max-width:720px;margin:0 auto;",
    "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);",
    "border-radius:999px;padding:5px 6px 5px 14px;",
    "box-shadow:0 1px 2px rgba(16,15,26,.05),0 8px 24px rgba(16,15,26,.07);}",
    "textarea{flex:1 1 auto;min-height:30px;max-height:132px;resize:none;",
    "border:0;background:transparent;outline:none;padding:6px 0;box-shadow:none;",
    "font-family:inherit;font-size:16px;line-height:1.7;",
    "color:var(--vq-text,#2B2836);}",
    "textarea::placeholder{color:var(--vq-text-tertiary,#9994A8);}",
    "button{border:0;padding:0;cursor:pointer;box-shadow:none;",
    "display:flex;align-items:center;justify-content:center;flex:0 0 auto;",
    "width:36px;height:36px;border-radius:999px;font:inherit;}",
    ".send{background:var(--vq-accent,#756DB3);color:#fff;}",
    ".send:disabled{opacity:.35;cursor:default;}",
    ".x,.clip{background:none;color:var(--vq-text-tertiary,#9994A8);}",
    ".x:hover,.clip:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".clip.on{color:var(--vq-accent,#756DB3);}",
    "svg{width:17px;height:17px;display:block;}"
  ].join("");

  function ensureBar() {
    if (st.bar) return st.bar;
    try {
      var host = doc.createElement("div");
      host.id = "vqLiveBar";
      var sr = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
      var stl = doc.createElement("style");
      stl.textContent = BAR_CSS;
      sr.appendChild(stl);
      var d = doc.createElement("div");
      d.className = "wrap";
      /* 線の太さ 1.7・丸い先端。本物のアイコンと同じ描き方にそろえる。 */
      var sv = function (d2) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"'
          + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d2 + '</svg>';
      };
      d.innerHTML = '<div class="box">'
        /* ★ 資料をつける口（2026-08-17）。
           ここから足したものは Lumi が readAttachment で読める。 */
        + '<input class="pick" type="file" multiple hidden'
        + ' accept=".pdf,.docx,.txt,.md,.csv,.tsv,.json,.zip,image/*">'
        + '<button class="clip" type="button" aria-label="資料をつける" title="資料をつける">'
        + sv('<path d="M21.4 11.05l-8.49 8.49a5 5 0 1 1-7.07-7.07l8.49-8.49a3.5 3.5 0 1 1 4.95 4.95'
             + 'l-8.49 8.49a2 2 0 1 1-2.83-2.83l7.78-7.78"/>') + '</button>'
        /* ★ 打っている画面から **これまでのやりとり**を 見られるようにする
           （2026-08-18・訴え）。邪魔なときは 同じボタンで しまえる。 */
        + '<button class="log" type="button" aria-pressed="false"'
        + ' aria-label="会話の履歴を見る" title="会話の履歴を見る">'
        + sv('<path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.7A7.5 7.5 0 1 1 20 12.5z"/>'
             + '<path d="M8.6 10.6h6.8M8.6 14h4.4"/>') + '</button>'
        + '<textarea rows="1" aria-label="Lumi に文字で伝える"'
        + ' placeholder="Lumi に文字で伝える"></textarea>'
        + '<button class="send" type="button" aria-label="送る">'
        + sv('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>') + '</button>'
        + '<button class="x" type="button" aria-label="閉じる">'
        + sv('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>'
        + '</div>';
      var ta = d.querySelector("textarea");
      var send = d.querySelector(".send");
      var x = d.querySelector(".x");
      send.disabled = true;

      var grow = function () {
        ta.style.height = "auto";
        ta.style.height = Math.min(132, Math.max(30, ta.scrollHeight)) + "px";
        send.disabled = !ta.value.trim();
      };
      ta.addEventListener("input", grow);
      /* パソコンは Enter で送る。改行は Shift+Enter。
         スマホは Enter が改行なので、送るボタンを使う。 */
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && root.innerWidth > 700) {
          e.preventDefault(); sendTyped();
        }
      });
      send.addEventListener("click", function (e) { e.preventDefault(); sendTyped(); });
      x.addEventListener("click", function (e) { e.preventDefault(); showBar(false); });
      var clip = d.querySelector(".clip"), pick = d.querySelector(".pick");
      if (clip && pick) {
        clip.addEventListener("click", function (e) {
          e.preventDefault();
          try { pick.click(); } catch (e2) {}
        });
        pick.addEventListener("change", function () {
          var fs = pick.files;
          if (fs && fs.length) 資料を取り込む(fs);
          try { pick.value = ""; } catch (e3) {}
        });
        st.barClip = clip;
      }
      var lg = d.querySelector(".log");
      if (lg) {
        lg.addEventListener("click", function (e) {
          e.preventDefault();
          st.履歴の希望 = !st.logOn;
          showLog(st.履歴の希望, true);
        });
        st.barLog = lg;
      }
      sr.appendChild(d);
      doc.body.appendChild(host);
      st.bar = host; st.barTa = ta; st.barSend = send;
    } catch (e) { st.bar = null; }
    return st.bar;
  }

  function sendTyped() {
    var ta = st.barTa; if (!ta) return;
    var t = String(ta.value || "").trim();
    if (!t) return;
    /* ══ ★ 繋がる前に打たれたら **預かって、繋がったら自分で送る**
       （2026-08-16・実測で見つけた「無言」の正体）════════════════════
       ★ 前は「まだ繋がっていません。もう一度送ってね」と返すだけだった。
         打った本人からは **黙って無視された**ようにしか見えない。
         しかも押し直す手間を利用者に押しつけている。
       ★ 会話を開いてから繋がるまでは 数秒かかる。その数秒に打つのは
         むしろ自然な使い方なので、**こちらが待って送る**のが筋。
       ★ 60 秒たっても繋がらなければ、預かったものは捨てて 正直に伝える
         （黙って消さない）。 */
    if (!st.ws || st.ws.readyState !== 1) {
      st.預かり = t;
      ta.value = ""; ta.style.height = "30px";
      if (st.barSend) st.barSend.disabled = true;
      say("繋がったら送るね");
      /* ★★ **ここが 鳴りっぱなしの 本体だった**（2026-08-20・実測）。
         もとは 送るたびに 作業開始 を 呼び、そのすぐ下で
         **前の 見張りを 黙って 捨てて**いた。
         捨てられた 見張りは もう 作業終了 を 呼ばない。
         つまり 繋ぎ直しの あいだに 2 回 打つと 作業の数が 1 残り、
         3 回 打てば 2 残る。数が 0 に ならないので
         **考え中の 音が 永久に 鳴り続ける**。
         実測: 3 回 打つと workN が 1→2→3 と 増え、
         返事が 来ても 0 に 戻らなかった。
         預かりは **1 本だけ**。すでに 待っているなら 増やさない。 */
      clearInterval(st.預かり見張り);
      if (!st.預かり中) { st.預かり中 = true; 作業開始("繋がるのを待っています"); }
      var 待ち始め = Date.now();
      st.預かり見張り = setInterval(function () {
        /* ★ 会話が 終わっていたら **必ず 止める**（2026-08-20）。
           ここを 見ていなかったので、閉じたあとも 0.5 秒ごとに 動き続け、
           次に 開いた 瞬間に 前の 打ち込みを 送っていた。 */
        if (!st.on) { clearInterval(st.預かり見張り); st.預かり見張り = 0;
          st.預かり = ""; st.預かり中 = false; return; }
        if (!st.預かり) { clearInterval(st.預かり見張り); st.預かり中 = false; 作業終了(); return; }
        if (st.ws && st.ws.readyState === 1) {
          clearInterval(st.預かり見張り); st.預かり中 = false; 作業終了();
          var 預 = st.預かり; st.預かり = "";
          if (st.barTa) { st.barTa.value = 預; sendTyped(); }
          return;
        }
        if (Date.now() - 待ち始め > 60000) {
          clearInterval(st.預かり見張り); st.預かり中 = false; 作業終了();
          var 消 = st.預かり; st.預かり = "";
          if (st.barTa) st.barTa.value = 消;          /* 消さずに戻す */
          if (st.barSend) st.barSend.disabled = false;
          say("繋がりませんでした。もう一度 送ってね");
        }
      }, 500);
      return;
    }
    /* ══ ★ 打った字と一緒に **いまの画面**も渡す（2026-08-16）════════════
       ★ 訴え「常に画面を見ていてほしい」「クイズ中に打っても分かってくれない」。
         Lumi は 道具を呼んだときしか画面を知らない。打った字だけ渡すと、
         「これ何？」「これで合ってる？」に答えようがない。
       ★ 会話の記録へ差し込む pushScreen 方式は **返事が返らなくなる**ので
         使わない（実測済み）。ここは **番の頭**なので安全に足せる。 */
    var 添え = "";
    try { 添え = 画面のひとまとめ(); } catch (e0) { 添え = ""; }
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: t + 添え }] }], turnComplete: true } }));
    } catch (e) { say("送れませんでした。"); return; }
    /* 会話の履歴へ（添えた画面の説明は 入れない。打った字だけ残す） */
    try { 履歴を書く("me", t); } catch (e7) {}
    /* ══ ★ 文字で送ったら **その場で 声を止める**（2026-08-16）════════
       ★ 訴え「返答中に指示しても、声が終わるまで聞いてくれない」。
         送ってはいたが、**手元に溜まっている声（最大で数十秒ぶん）が
         そのまま鳴り続けていた**ので、聞いてくれないように見えていた。
       ★ 打った時点で「もう聞いていない」ので、鳴らし残しは捨ててよい。
       ★ 遅れて届く 前の番の音も鳴らさない（世代で見分ける）。 */
    st.人の番 = Date.now();                             /* 打った人が優先 */
    /* ★ ここが **仕事の区切り**（2026-08-17・段1 やり直し）。
       これより前に動いた道具は、この頼みの根拠にはならない。
       （前の仕事で openFile が走っていたからといって、
         次の頼みで「開きました」と 言ってよいことにはならない。） */
    st.仕事の区切り = Date.now();
    st.道具の跡 = {};
    /* ★ **頼まれごとを 覚えておく**（2026-08-17・実測で分かった致命傷）。
       送った直後に 1008 で切れると、**その頼みは どこにも残らない**。
       繋ぎ直しても 誰も言い直さないので、Lumi は挨拶だけして永久に待つ。
       実測: 10 枚の資料を頼んだ 10 分間、道具が 1 つも動かなかった。 */
    st.未処理 = { 文: t, at: Date.now(), 動いた: false };
    st.仕事おわり = false; st.促し回 = 0; st.空回り = 0; st.促し時の道具回 = st.道具回 || 0;
    /* ★ 人が何か言ったら **自動の催促は その場で止める**（2026-08-17・訴え）。
       止めずに残していたので、こちらが話しかけている最中も
       裏で「続けてください」を送り続け、同じ返事を繰り返していた。 */
    st.作りかけ = null;
    try { 促しを止める("人が話しかけた"); } catch (e3) {}
    st.mine = (st.mine || []).concat([t]).slice(-80);   /* 覚え書きの材料 */
    try { if (st.spk) st.spk.port.postMessage({ type: "clear" }); } catch (e2) {}
    st.cutAt = Date.now();
    st.lastCut = Date.now();
    duck(1);
    setMuted(false); talkEdge(false);
    st.inTurn = false; st.turnDone = true; st.bargeN = 0;
    st.talked = true;                 /* 文字でも「話した」に数える（すぐ切れないように） */
    st.silenceAt = Date.now();
    ta.value = ""; ta.style.height = "30px";
    if (st.barSend) st.barSend.disabled = true;
    /* 書き直したら すぐ押せるように（入力の知らせを取り逃しても効く保険） */
    clearInterval(st.barIv);
    st.barIv = setInterval(function () {
      try {
        if (!st.barTa || !st.barSend) return;
        st.barSend.disabled = !String(st.barTa.value || "").trim();
      } catch (e) {}
    }, 700);
    /* ★ 打った字をそのまま読み上げ直す知らせは出さない（2026-08-16）。
       自分が打った字は目の前にあるので、言われなくても分かる。
       代わりに **いま考えていること** を出す（黙っていると固まって見える）。 */
    /* ★★ **二重に 数えない**（2026-08-20・訴え
       「思考中の 音楽も ずっと 鳴り続けたりする ことが よくある」）。
       もとは 送るたびに 無条件で 作業開始 を 呼んでいた。
       作業の数（workN）は 呼ぶたび 1 増えるが、減るのは
       「st.thinking が 真なら 1 回だけ」。
       つまり **返事を待たずに 2 回 打つと 数が 1 残る**。
       残ると 作業終了 が 0 に できず、
         ・考え中の 音が **鳴りっぱなし**
         ・「考えています」の 帯が 戻らない
       の 両方が 起きる。すでに 考え中なら 増やさない。 */
    if (!st.thinking) { 作業開始("考えています"); st.thinking = true; }
    else say("考えています");
  }

  /* ★ 文字バーの開け閉めで マイクを止める／開ける。
     ★ **開けるときは Lumi が喋っていないか必ず確かめる**（2026-08-16・重大）。
       前は無条件に解除していたので、文字を打って バーを閉じた瞬間に
       「Lumi が喋っている間の止め」まで解けてしまい、
       以後 worklet の muted が偽のまま固定された。
       割り込みの判定は muted の間しか働かないので、
       **一度 文字を打つと、その会話ではもう声で割り込めなくなっていた**
       （実測: 大きさ 0.37 で線 0.14 を超えても 連続が 0 のまま）。 */
  /* ★ **こちらから マイクを止める**（2026-08-18・訴え）。
     これまで マイクを止めるのは 半二重（Lumi が喋っている間）だけで、
     利用者が 自分の意思で 止める手段が なかった。
     ★ 止めた状態は **どの経路より強い**。開ける口が 4 か所あるので、
       そのすべてで ここを見る。1 か所でも漏れると、
       止めたつもりで 声が届き続ける＝いちばん困る。 */
  function 手で止めているか() { return !!st.手ミュート; }
  function muteMic(on) {
    var 実際 = !!on || !!st.speaking || 手で止めているか();
    try { if (st.micNode) st.micNode.port.postMessage({ type: "mute", on: 実際 }); } catch (e) {}
  }

  /* ★ 止めているつもりと 実際がずれたら 直す（2026-08-16）。
     知らせは 1 通でも落ちると ずれたままになる。0.5 秒ごとに合わせ直す。 */
  function syncMute() {
    clearInterval(st.iSync);
    st.iSync = setInterval(function () {
      if (!st.on || !st.micNode) return;
      var 欲しい = (!!st.speaking && Date.now() > (st.probeUntil || 0)) || 手で止めているか();
      if (st.lastMuted === undefined || st.lastMuted === 欲しい) return;
      try { st.micNode.port.postMessage({ type: "mute", on: 欲しい }); } catch (e) {}
    }, 500);
  }

  function showBar(on) {
    var d = ensureBar(); if (!d) return;
    if (on) {
      d.classList.add("show");
      requestAnimationFrame(function () { d.classList.add("in"); });
      muteMic(true);                   /* 打っている間は聞かない */
      duck(0.3);                       /* 打ち始めた＝もう聞いていないので 声を小さく */
      showType(false);
      /* 履歴の置き場を 入力欄の上へ 逃がす（重ねない） */
      try { doc.body.classList.add("vq-live-bar"); } catch (e1) {}
      /* ★ 打つ画面では 履歴を 既定で出す（2026-08-18・訴え）。
         いちど自分でしまった人には、その選び方を 覚えておく。 */
      showLog(st.履歴の希望 === undefined ? true : !!st.履歴の希望);
      setTimeout(function () { try { st.barTa.focus(); } catch (e) {} }, 120);
    } else {
      d.classList.remove("in");
      setTimeout(function () { d.classList.remove("show"); }, 240);
      muteMic(false);
      duck(1);                         /* 閉じたら 声の大きさを戻す */
      try { doc.body.classList.remove("vq-live-bar"); } catch (e2) {}
      showLog(false);
      if (st.on) showType(true);
    }
    st.barOn = !!on;
  }

  function showType(on) {
    var b = ensureType(); if (!b) return;
    /* ★ 画面を見せる（キャスト）のボタンは **出さない**（2026-08-16）。
       利用者の判断: 「許可を聞かれるのと、共有中の帯が邪魔だから要らない」。
       仕組みは残す（__vqLive.cast(true) で使える）。既定では触らせない。 */
    var c = (root.VQ_CAST_BTN ? ensureCast() : null);
    /* ★ カメラのボタンは **既定で出す**（2026-08-17）。
       画面の共有と違って、カメラは「目の前のものを見せる」ための
       いちばん分かりやすい入口で、共有中の帯も出ない。
       カメラの無い端末では 出さない。 */
    var cam = カメラが使えそう() ? ensureCam() : null;
    /* 履歴のボタン。設定で切ってあるときは 出さない（押せない入口は 置かない）。 */
    var lg = 履歴が要るか() ? ensureLogBtn() : null;
    var mc = ensureMicBtn();
    if (on) {
      b.classList.add("show");
      if (c) c.classList.add("show");
      if (cam) cam.classList.add("show");
      if (lg) lg.classList.add("show");
      if (mc) mc.classList.add("show");
      requestAnimationFrame(function () {
        b.classList.add("in");
        if (c) c.classList.add("in");
        if (cam) cam.classList.add("in");
        if (lg) lg.classList.add("in");
        if (mc) mc.classList.add("in");
      });
    } else {
      b.classList.remove("in");
      if (c) c.classList.remove("in");
      if (cam) cam.classList.remove("in");
      if (lg) lg.classList.remove("in");
      if (mc) mc.classList.remove("in");
      setTimeout(function () {
        b.classList.remove("show");
        if (c) c.classList.remove("show");
        if (lg) lg.classList.remove("show");
        if (mc) mc.classList.remove("show");
        /* 見せている間は 隠さない（止める手段が 消えてしまう） */
        if (cam && !(st.cast && st.castKind === "カメラ")) cam.classList.remove("show");
      }, 200);
    }
  }

  /* カメラがありそうか。**無い端末でボタンだけ出さない。**
     押しても何も起きない入口は 置かない。 */
  function カメラが使えそう() {
    try {
      return !!(root.navigator && navigator.mediaDevices
        && navigator.mediaDevices.getUserMedia
        && (root.isSecureContext !== false));
    } catch (e) { return false; }
  }

  function showBtn(on) {
    var b = ensureBtn(); if (!b) return;
    if (on) {
      b.classList.add("show");
      requestAnimationFrame(function () { b.classList.add("in"); });
    } else {
      b.classList.remove("in");
      setTimeout(function () { if (!st.btnWant) b.classList.remove("show"); }, 320);
    }
  }

  /* 何をしているか（状態）を出す。島は開かず、点だけで示す。 */
  /* ★ いまの様子を **画面に出す**（2026-08-16）。
     これまで st.state に入れるだけで、どこにも出していなかった。
     利用者からは点が光っているだけに見え、固まったと思われていた。 */
  function say(msg) {
    var h = ensureHost(); if (!h) return;
    var sp = h.querySelector(".isl span"); if (!sp) return;
    st.words = "";
    st.state = String(msg || "");
    sp.textContent = st.state;
    h.classList.remove("open");     /* 言葉の表示は畳む */
    h.classList.remove("clip");     /* 作業中の帯は 畳まない（1 行しかない） */
    var mb = h.querySelector(".isl .vqmore"); if (mb) mb.classList.remove("on");
    h.classList.toggle("work", !!st.state);
  }
  /* ★ **返ってきた言葉**を上に出す。流れてくるそばから足していく
     （言い終わるまで待つと、長い返事のあいだ何も出ずに不安になる）。 */
  /* ══════════════════════════════════════════════════════════════════
     言いきってよいかを **道具で** 決める（2026-08-17・段1 やり直し）

     ★ 前のやり方（禁止表現の一覧＝ブラックリスト）は **失敗した。**
       実測: 「昨日作ったファイルを開いて」に対し、開いていないのに
       「開きました」と言った。一覧に「開きました」が無かった。
       **言い方を変えれば いくらでも 漏れる。**
     ★ 方式を変える。**何と言ったかで 決めない。何をしたかで 決める。**
       「〜した」と言えるのは、**それをする道具が この仕事のあいだに
       実際に走り、失敗していないとき だけ。**
       走っていなければ、その文は **画面から落とす。**
     ★ 品質・完了の主張（崩れがない・見直した）は さらに厳しく、
       **数えた結果（報告）が 通っていること**まで要る。
     ★ 声は もう鳴っているので 完全には止まらない。ここで止めるのは
       **画面に残る文**。あとから読んだ人が だまされないようにする。
     ══════════════════════════════════════════════════════════════════ */
  var 主張の表 = [
    { 種: "開いた", 語: ["開きました", "開いたよ", "開いた。", "開いてある", "開いておいた",
                         "表示しました", "出しました", "開いておいたよ"],
      道具: { openFile: 1, newFile: 1, openScreen: 1, makeDocument: 1, startQuiz: 1,
              tapItem: 1, runCommand: 1, fileAction: 1, openWorkplace: 1 } },
    { 種: "保存した", 語: ["保存しました", "保存したよ", "保存した。", "保存しておいた",
                           "しまっておいた", "残しました"],
      道具: { saveDraft: 1, fileAction: 1, makePreset: 1, changeSetting: 1, setSetting: 1 } },
    { 種: "作った", 語: ["作りました", "作ったよ", "作った。", "作成しました", "作成したよ",
                         "完成しました", "組み立てました", "用意しました", "用意したよ"],
      道具: { makeDocument: 1, newFile: 1, docsWrite: 1, sheetsWrite: 1, slidesWrite: 1,
              formsWrite: 1, deckWrite: 1, deckFinish: 1, saveDraft: 1, makePreset: 1,
              addQuestion: 1, startDraft: 1 } },
    /* ★ 「できたよ」は **作ったとは限らない**（2026-08-18・実測）。
       「君ならできたよ」「準備ができたよ」のような ふつうの相づちでも当たる。
       もの作りの話をしているときだけ 見る。 */
    { 種: "作った", 語: ["できました", "できたよ", "できた！"],
      道具: { makeDocument: 1, newFile: 1, docsWrite: 1, sheetsWrite: 1, slidesWrite: 1,
              formsWrite: 1, deckWrite: 1, deckFinish: 1, saveDraft: 1, makePreset: 1,
              addQuestion: 1, startDraft: 1 }, 仕事中のみ: 1 },
    { 種: "直した", 語: ["直しました", "直したよ", "直した。", "修正しました", "修正したよ",
                         "変更しました", "変えました", "変えたよ", "反映しました", "反映したよ",
                         "更新しました", "書き換えました", "対応しました"],
      道具: { fixAt: 1, docsEdit: 1, sheetsEdit: 1, slidesEdit: 1, formsEdit: 1,
              editDocument: 1, editQuestion: 1, editPreset: 1, editPresetQuestions: 1,
              changeSetting: 1, setSetting: 1, runCommand: 1, typeInto: 1,
              chooseOption: 1, slideTo: 1, dragItem: 1 } },
    { 種: "消した", 語: ["削除しました", "消しました", "消したよ", "消した。", "削除したよ",
                         "取り消しました", "捨てました"],
      道具: { deleteFile: 1, removePreset: 1, removeQuestion: 1, removePresetQuestion: 1,
              discardDraft: 1, undoLast: 1, runCommand: 1 } },
    { 種: "足した", 語: ["追加しました", "追加したよ", "足しました", "足したよ", "入れました",
                         "入れておいた", "書き込みました"],
      道具: { addQuestion: 1, addPresetQuestion: 1, docsWrite: 1, sheetsWrite: 1,
              slidesWrite: 1, formsWrite: 1, deckWrite: 1, typeInto: 1 } },
    { 種: "読んだ", 語: ["読み込みました", "読み込んだ", "読みました", "読んだよ",
                         "取り込みました", "目を通しました"],
      道具: { readAttachment: 1, researchRead: 1, readDocument: 1, readPresetQuestions: 1,
              readResult: 1, readWrongQuestions: 1, readScreen: 1 } },
    { 種: "探した", 語: ["探しました", "探したよ", "検索しました", "調べました", "調べたよ",
                         "見つけました", "見つけたよ"],
      道具: { searchWeb: 1, researchSearch: 1, searchApp: 1, listFiles: 1, myPresets: 1,
              listFormats: 1, listTemplates: 1, listCommands: 1, lookScreen: 1,
              readClock: 1, listSettings: 1, findPicture: 1 } },
    { 種: "送った", 語: ["送りました", "送信しました", "送ったよ", "共有しました",
                         "書き出しました", "印刷しました"],
      道具: { runCommand: 1, fileAction: 1 } },
    /* ★ 訴え（2026-08-17）「暗記してと言っても 暗記してくれない」。
       覚える口を 呼ばずに「覚えたよ」と 言っていた。**言わせない。** */
    { 種: "覚えた", 語: ["覚えました", "覚えたよ", "覚えた。", "覚えておく", "覚えておいた",
                         "暗記しました", "暗記したよ", "記憶しました", "メモしました",
                         "メモしたよ", "書きとめました", "忘れないよ", "忘れません"],
      道具: { remember: 1, saveLook: 1, docsWrite: 1, sheetsWrite: 1, formsWrite: 1,
              saveDraft: 1, makePreset: 1, addQuestion: 1 } },
    { 種: "調べた答え", 語: ["答えは", "正解は", "こうなります", "こうなるよ"],
      道具: { solveFromCamera: 1, searchWeb: 1, researchRead: 1, readDocument: 1,
              readPresetQuestions: 1, answerQuestion: 1, readResult: 1,
              readWrongQuestions: 1, readClock: 1, lookScreen: 1, readScreen: 1,
              readAttachment: 1, myPresets: 1, listFormats: 1, draftStatus: 1,
              reviewDocument: 1, listSettings: 1, explainWhy: 1, weakSpots: 1 },
      カメラ中のみ: 1 },
    /* ★ ここから下は 道具だけでは足りない。**数えた結果**が要る。 */
    { 種: "確かめた", 語: ["見直しました", "見直しもした", "見直したよ", "確認しました",
                           "確認したよ", "チェックしました", "検証しました", "点検しました"],
      道具: { reviewDocument: 1, fixAt: 1, checkDone: 1 }, 報告が要る: 1 },
    /* ★ ここは **作ったものの出来ばえ**の話（2026-08-18・訴え）。
       「大丈夫だよ」「問題ないよ」は、ふだんの受け答えで いちばん出る言葉。
       前は これを 会話中でも 消して、代わりに 道具の話を 画面へ出していた。
       ＝ Rinty が見た「道具がどうのこうの が上に出る」の 正体。
       もの作りの話をしているときだけ 見る。 */
    { 種: "崩れなし", 語: ["崩れもない", "崩れはない", "崩れていない", "問題ありません",
                           "問題ないよ", "問題なし", "不備はない", "きれいにできて",
                           "ちゃんとできて", "大丈夫だよ", "大丈夫です"],
      道具: { reviewDocument: 1, fixAt: 1 }, 報告が要る: 1, 仕事中のみ: 1 }
  ];

  /* この仕事のあいだに 実際に走って、失敗しなかった道具 */
  function 走った道具() {
    var 出 = {}, 跡 = st.道具の跡 || {};
    var 境 = Math.max(st.仕事の区切り || 0, Date.now() - 180000);
    Object.keys(跡).forEach(function (n) {
      var a = 跡[n];
      if (a && a.済 && a.時 >= 境) 出[n] = a.時;
    });
    return 出;
  }

  /* 文に切る。**うしろ読み（lookbehind）は使わない**（古い端末で落ちる）。 */
  function 文に切る(s) {
    s = String(s || "");
    var 出 = [], 今 = "";
    for (var i = 0; i < s.length; i++) {
      今 += s.charAt(i);
      if ("。！？!?\n".indexOf(s.charAt(i)) >= 0) { 出.push(今); 今 = ""; }
    }
    if (今) 出.push(今);
    return 出;
  }

  /* ★ 語を **長い順に 1 本の並び**へ均す（2026-08-17・実測）。
     「見直しました」は「直しました」を 中に含む。短いほうで先に当たると、
     見直し（確かめた）が 修正（直した）と 誤って判定される。
     長い語から取り、**重なった短い語は 見ない**。 */
  var 主張の語 = (function () {
    var 出 = [];
    主張の表.forEach(function (m) {
      m.語.forEach(function (w) {
        出.push({ 語: w, 種: m.種, 道具: m.道具, 報告が要る: m.報告が要る,
                  カメラ中のみ: m.カメラ中のみ, 仕事中のみ: m.仕事中のみ });
      });
    });
    出.sort(function (a, b) { return b.語.length - a.語.length; });
    return 出;
  })();

  /* ★ いま「もの作りの話」をしているか（2026-08-18）。
     ・書きもの（Workplace）が この 3 分のうちに 動いた
     ・または この仕事のあいだに 道具が 1 つでも 動いた
     どちらも無ければ、それは **ただの会話**。会話の言葉づかいを
     道具の有無で 消してはいけない。 */
  function 仕事の話か(走) {
    try {
      if (st.書きもの時 && Date.now() - st.書きもの時 < 180000) return true;
      for (var k in (走 || {})) { if (走[k]) return true; }
    } catch (e) {}
    return false;
  }

  /* この 1 文を 出してよいか。だめなら なぜ。 */
  function 出してよい文か(文, 走, 報) {
    var 使った = [];                       /* すでに どの語で 取った所か */
    var 仕事 = 仕事の話か(走);
    function 重なる(a, b) {
      for (var i = 0; i < 使った.length; i++) {
        if (a < 使った[i][1] && 使った[i][0] < b) return true;
      }
      return false;
    }
    for (var i = 0; i < 主張の語.length; i++) {
      var m = 主張の語[i];
      /* ★ カメラを見せている間だけの決まり（2026-08-17・訴え
         「ワークの答えと Lumi が 違う」）。写真の問題は 速さのためのモデルが
         読み違える。**解く道具を通さずに 答えを言うのを 止める。**
         カメラを見せていない ふつうの受け答えは これまでどおり。 */
      if (m.カメラ中のみ && !(st.cast && st.castKind === "カメラ")) continue;
      /* ふだんの受け答えでは 見ない語（2026-08-18） */
      if (m.仕事中のみ && !仕事) continue;
      var p = 文.indexOf(m.語);
      if (p < 0) continue;
      if (重なる(p, p + m.語.length)) continue;
      使った.push([p, p + m.語.length]);
      var 根拠 = "";
      for (var k in m.道具) { if (走[k]) { 根拠 = k; break; } }
      if (!根拠) return { だめ: 1, 種: m.種, 語: m.語, なぜ: "その道具が 動いていない" };
      if (m.報告が要る && (!報 || 報.完成と言ってよい !== true))
        return { だめ: 1, 種: m.種, 語: m.語, なぜ: "数えた結果が 通っていない" };
    }
    return { だめ: 0 };
  }

  var 報告が要る道具 = {
    makeDocument: 1, newFile: 1, editDocument: 1, fixAt: 1,
    docsWrite: 1, docsEdit: 1, sheetsWrite: 1, sheetsEdit: 1,
    slidesWrite: 1, slidesEdit: 1, formsWrite: 1, formsEdit: 1,
    deckWrite: 1, deckFinish: 1, reviewDocument: 1, runCommand: 1, fileAction: 1
  };
  function 機械の報告() {
    try {
      var R = root.VQW && root.VQW.report;
      if (!R || !R.道具の返り) return null;
      /* Workplace の書きものが **この 3 分のうちに** 動いていること */
      if (!st.書きもの時 || Date.now() - st.書きもの時 > 180000) return null;
      var 直 = R.いまの報告 ? R.いまの報告(180000) : null;
      if (直) return 直;
      var K = root.VQ2 && root.VQ2.workplace && root.VQ2.workplace.cmd;
      if (!K || !K.いま || !K.いま()) return null;
      var 検 = K.基盤の検査 ? K.基盤の検査() : null;
      if (!検) return null;
      return R.道具の返り({ status: "applied", 見ただけ: true,
        applied: [], skipped: [], validation: 検 }, {});
    } catch (e) { return null; }
  }

  function said(text, more) {
    var h = ensureHost(); if (!h) return;
    var sp = h.querySelector(".isl span"); if (!sp) return;
    if (!more) st.落とし跡 = "";               /* 番が変わったら 記録し直す */
    st.words = more ? (String(st.words || "") + String(text || "")) : String(text || "");
    /* ★ **生の言葉は st.words に そのまま残す**（覚え書きの材料・監査のため）。
       落とすのは **画面に出す文だけ**。 */
    var 出す = st.words;
    st.落とした = [];
    /* ★ チュートリアルの台本は この関門を通さない（2026-08-18）。
       関門は「道具が動いていないのに『やった』と言うな」というもので、
       中身は正しい。ただし **台本は演技**であって主張ではないので、
       ここを通すと台詞が消え「確かめられなかったので伏せたよ」に化ける。
       デモ中だけ素通しにする。台本側でも 主張の語は使わない（二重の備え）。 */
    try {
      if (st.デモ) throw 0;
      var 走 = 走った道具(), 報 = 機械の報告();
      var 残 = [], 落 = [];
      文に切る(st.words).forEach(function (b) {
        var r = 出してよい文か(b, 走, 報);
        if (r.だめ) 落.push({ 文: b, 種: r.種, なぜ: r.なぜ });
        else 残.push(b);
      });
      if (落.length) {
        st.落とした = 落;
        出す = 残.join("");
        /* ★ **仕組みの話を 会話へ 混ぜない**（2026-08-18・訴え
           「道具がどうのこうのって 上部に表示されちゃってる」）。
           前は「道具は 1 つも 動いていません」という 作り手向けの文を、
           Lumi の言葉と 同じ大きさで 並べていた。読む人には 意味が分からず、
           しかも **Lumi が そう言った**ように 見えていた。
           ★ 伏せたこと自体は 隠さない。小さな印を 1 つ付けるだけにして、
             中身は「聞こえた言葉を見る」で 読めるようにする。
           ★ 数えた結果（機械の報告）は 作ったものの話なので これまでどおり出す。 */
        if (報 && 報.報告) 出す += (出す ? "\n" : "") + 報.報告;
        /* 全部 伏せて 空になったときだけは、黙らずに ひと言 断る。 */
        if (!出す.trim()) 出す = "いま 確かめられなかったので、その部分は 伏せたよ。";
        var 跡 = 落.map(function (x) { return x.種; }).join("/");
        if (st.落とし跡 !== 跡) {
          st.落とし跡 = 跡;
          st.落とし回 = (st.落とし回 || 0) + 1;
          noteEv("★ 根拠の無い言いきりを 落とした（" + 跡 + "）");
        }
      }
    } catch (e2) {}
    /* ★ 飾りが 入っていたら かたちにして出す（2026-08-17）。
       声の書き起こしには ふつう 飾りは 入らない（声に 太字は 無い）。
       それでも 文字で送られたときや、板の中身を そのまま流したときに
       記号が むき出しにならないよう、ここでも 描く。
       飾りが 無ければ **これまでどおり 文字のまま**（速い・安全）。 */
    try {
      if (root.VQMD && VQMD.飾りがある(出す)) sp.innerHTML = VQMD.render(出す);
      else sp.textContent = 出す;
    } catch (e3) { sp.textContent = 出す; }
    /* 伏せたときの 小さな印。Lumi の言葉とは **別の見た目**にする。 */
    try {
      if (st.落とした && st.落とした.length) {
        var 印 = doc.createElement("i");
        印.className = "vqhid";
        印.textContent = "一部を伏せました";
        印.title = "確かめられなかった 言いきりを 画面から 外しました。"
          + "中身は 設定 →「音」→「聞こえた言葉を見る」で 読めます。";
        sp.appendChild(印);
      }
    } catch (e4) {}
    /* 言葉が出たら 作業中の帯は畳む（両方は出さない） */
    if (st.words) { h.classList.remove("work"); st.state = ""; }
    /* 島が にゅっと広がる（class を足すだけ。位置は動かさないのでカクつかない） */
    h.classList.toggle("open", !!st.words);
    try { sp.scrollTop = sp.scrollHeight; } catch (e) {}
    /* 長い返事は 2 行で 畳む（開いているときは そのまま） */
    try { 島の畳みを見る(); } catch (e5) {}
    /* 会話の履歴へ（画面に出した文＝伏せたあとの文を 残す） */
    /* ★ デモ中は 履歴に入れない（2026-08-18）。
       入れると「Lumi との会話」として Quick Chat の一覧に
       **チュートリアルの台本が並ぶ**。 */
    if (!st.デモ) { try { 履歴を書く("ai", 出す, !!more); } catch (e6) {} }
  }
  /* ★ 2 行を超えた返事だけ 畳む（2026-08-18・訴え「長くなるから 制御したい」）。
     ★ 開いたかどうかは **覚えておく**。番が変わるたびに 畳み直すと、
       長い説明を 読んでいる最中に 引っ込んでしまう。 */
  function 島の畳みを見る() {
    var h = st.host; if (!h) return;
    var sp = h.querySelector(".isl span");
    var b = h.querySelector(".isl .vqmore");
    if (!sp || !b) return;
    var 開く = !!st.島を開く;
    h.classList.remove("clip");
    var lh = 0;
    try { lh = parseFloat(root.getComputedStyle(sp).lineHeight) || 0; } catch (e) {}
    if (!lh) lh = 26;
    var 長い = h.classList.contains("open") && sp.scrollHeight > lh * 2 + 2;
    b.classList.toggle("on", 長い);
    b.textContent = 開く ? "たたむ" : "つづきを読む";
    b.setAttribute("aria-expanded", 開く ? "true" : "false");
    if (長い && !開く) h.classList.add("clip");
    /* 開いているときは 流れてくる字を 追いかける */
    if (開く) { try { sp.scrollTop = sp.scrollHeight; } catch (e2) {} }
  }

  function showEdge(on) {
    var h = ensureHost(); if (!h) return;
    if (on) {
      h.classList.remove("bye");
      /* 次の描画で class を足す（同じ描画で足すと、動かずに現れる＝カクつく） */
      requestAnimationFrame(function () { h.classList.add("on"); });
    } else {
      /* 島へ吸い込まれてから消す */
      h.classList.remove("open");
      h.classList.add("bye");
      setTimeout(function () { h.classList.remove("on", "talk", "bye"); }, 560);
    }
  }
  function talkEdge(on) {
    var h = st.host; if (!h) return;
    h.classList.toggle("talk", !!on);
  }

  /* ══ 「Hey Lumi」を待つ ═══════════════════════════════════════════
     端末の音声認識を使う（無料・その場で動く）。
     ★ iPhone は勝手に止まることがあるので、止まったら黙って掛け直す。
     ★ **最初の 1 回は指で触ってもらう**（触らないと始められない決まり）。 */
  function SR() { return root.SpeechRecognition || root.webkitSpeechRecognition || null; }
  function startWake() {
    var C = SR();
    if (!C || st.wakeOn || st.wakeBusy) return false;
    /* ★ **二重に始めない。** 始めかけの間に もう一度呼ばれると
       「すでに動いている」で落ち、そのまま二度と始まらなくなる。 */
    st.wakeBusy = true;
    setTimeout(function () { st.wakeBusy = false; }, 800);
    try {
      var r = new C();
      r.lang = "ja-JP"; r.continuous = true; r.interimResults = true;
      /* 候補を複数もらう（1 番目が漢字で外れても、別の候補で当たる） */
      try { r.maxAlternatives = 5; } catch (e0) {}
      r.onresult = function (e) {
        if (st.on) return;
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var alts = e.results[i];
          /* ★ 候補を **全部**見る。1 番目が漢字で外れても、
             2 番目がひらがなで当たることがある。 */
          for (var a = 0; a < alts.length; a++) {
            var tx = alts[a] && alts[a].transcript;
            if (a === 0) noteHeard(tx);
            /* ★ 聞き取りの知らせの **中で**止めない。
               自分自身を止めることになり、そのあと掛け直せなくなる
               （実測の訴え「1 回しか反応しない」）。次の順番へ回す。 */
            st.evAt = Date.now();
            if (isWake(tx)) { noteEv("★ 当たった「" + tx + "」"); setTimeout(open, 0); return; }
          }
        }
      };
      r.onend = function () {
        /* ★ **止めた本人からの知らせは無視する。**
           止めるときに handler を外しているので、ここへ来るのは
           「勝手に止まった」ときだけ。会話中でなければ、また待ち始める。 */
        /* ★ iPhone の聞き取りは **ひとことごとに勝手に止まる**。
           500ms 空けていたので、その隙に呼びかけると聞き逃していた。
           間を空けずに掛け直す。 */
        st.wakeOn = false;
        st.wakeBusy = false;
        if (st.on) return;
        /* ★ **エラーの種類で分ける**（2026-08-15）。
           前は間を置かずに無条件で掛け直していた。エラーのあとには
           必ず end が来るので、onerror 側の「許可が無いなら諦める」も
           「900ms 空ける」も **どちらも効いていなかった**。
           許可が無い端末では、数十 ms ごとに掛け直し続けることになる。 */
        var why = st.lastErr; st.lastErr = "";
        if (why === "not-allowed" || why === "service-not-allowed") {
          noteEv("止まった（許可が無いので待つ）");
          return;                      /* 次に画面を触ったときに掛け直す */
        }
        /* 回りすぎていたら 冷ます（電池と端末の負担のため） */
        st.endTimes = (st.endTimes || []).filter(function (t) { return Date.now() - t < 10000; });
        st.endTimes.push(Date.now());
        var gap = st.endTimes.length >= 8 ? 3000 : 0;
        noteEv("止まった（掛け直す" + (gap ? "・少し待つ" : "") + "）");
        setTimeout(function () { if (!st.on) startWake(); }, gap);
      };
      r.onerror = function (e) {
        var why = (e && e.error) || "?";
        noteEv("落ちた: " + why);
        st.lastErr = why;
        st.wakeOn = false;
        /* ★ ここで掛け直さない。**エラーのあとには必ず end が来る**（決まり）。
           両方で掛け直すと二重になるので、掛け直しは onend 側に一本化する。 */
      };
      /* ★ **始まったつもりで音が来ていない**ことがある（2026-08-15）。
         会話のあと、端末がマイクを離しきる前に始めると、
         start() は通るのに 1 度も音が届かず、黙って死ぬ。
         音が来たかどうかを別に見て、来なければ掛け直す。 */
      r.onstart = function () { st.wakeLive = true; noteEv("始まった"); };
      r.onaudiostart = function () {
        /* ★ この端末は この知らせを出す、と分かった。以後だけ見張りに使う。 */
        st.audioEvOk = true; st.wakeLive = true;
        st.wakeAlive = Date.now(); st.wakeTries = 0;
        noteEv("音が来ている");
      };
      r.onspeechstart = function () { st.wakeAlive = Date.now(); };
      r.start();
      /* ★ **start() が通っても、始まったとは限らない**（2026-08-15）。
         iPhone では例外を投げずに通り、そのあと何の知らせも来ずに
         死ぬことがある。それを「動いている」と数えると、
         掛け直す道が全部ふさがれて、二度と反応しなくなる。
         実測では start() から onstart まで **約 1 秒**かかる。
         なので、しばらく待って知らせが来なければ 作り直す。 */
      st.wake = r; st.wakeOn = true;
      st.wakeBusy = false;
      st.wakeStartAt = Date.now();
      st.wakeAlive = 0;
      st.wakeLive = false;
      clearTimeout(st.tStart);
      st.tStart = setTimeout(function () {
        if (st.on || st.wake !== r) return;
        if (st.wakeLive) return;               /* ちゃんと始まった */
        stopWake();
        setTimeout(startWake, 300);
      }, 3500);
      st.btnWant = true; showBtn(true);
      watchWake();
      armOnTouch();
      return true;
    } catch (e) {
      /* すでに動いていた等。少し待ってから もう一度だけ試す。 */
      st.wakeOn = false; st.wakeBusy = false;
      if (!st.on && !st.wakeRetry) {
        st.wakeRetry = true;
        setTimeout(function () { st.wakeRetry = false; startWake(); }, 1200);
      }
      return false;
    }
  }
  /* ★ **止めるときは、先に知らせを切る。**
     切らずに abort すると、古い方の onend が動いて
     「止めたのに掛け直す」「二重に始まる」が起き、
     結果として **一度閉じたら二度と反応しない**（実測の訴え）。 */
  /* ★ **見張り**。勝手に止まったまま戻らないことがあるので、
     数秒ごとに様子を見て、止まっていれば掛け直す。
     これが無いと「しばらく使わなかったら反応しなくなった」になる。 */
  function watchWake() {
    if (st.watch) return;
    st.watch = setInterval(function () {
      if (st.on) return;                       /* 会話中は待たない */
      var want = false;
      try { want = root.__vqSet ? (root.__vqSet.get("voice.wake") === true) : false; } catch (e) {}
      if (!want) return;
      /* 止まっている → 掛け直す */
      if (!st.wakeOn && !st.wakeBusy && !st.armed) { startWake(); return; }
      /* ★ 動いているつもりで **音が 1 度も来ていない** → 死んでいる。
         始めてから 4 秒たっても音が来なければ、作り直す。
         ══ ただし **この端末が onaudiostart を出すと分かっている場合だけ**
            （2026-08-15 追記・重大）════════════════════════════════
         ★ この知らせを出さないブラウザがある。出ない端末でこれを使うと、
           **4 秒ごとに待ち受けを殺し続ける**。殺されるので一度も聞けない。
           ＝「スマホでは 1 回目すら反応しない」の正体。
         ★ だから「一度でも出たことがある」と確かめられるまでは使わない。
           出ない端末では、この見張りは黙って何もしない。 */
      /* ★ さらに（2026-08-15 追記）: **どの知らせも来ないまま固まる**端末がある。
         onstart だけ来て、audiostart も end も来ない場合、上の見張りは
         audioEvOk が立たないので働かず、掛け直す道も全部ふさがれる
         （watchWake は !wakeOn が条件、armOnTouch と arm は wakeOn で戻る）。
         そこで「**最後に何か知らせが来てからの時間**」でも見る。
         しきい値は長め（75 秒）。正常な端末が黙っていても損はないが、
         短くすると以前の「4 秒ごとに殺す」に逆戻りする。 */
      /* ★ 75 秒 → 35 秒 に詰めた（2026-08-16）。
         訴え「LUMI と呼んでも反応しないことがある」。
         黙って死んでいると 75 秒ものあいだ 呼んでも届かない。
         35 秒なら短すぎず（以前の「4 秒ごとに殺す」には戻らない）、
         気づけないほど長くもない。 */
      if (st.wakeOn && Date.now() - (st.evAt || st.wakeStartAt) > 35000) {
        noteEv("知らせが来ないので 作り直す");
        stopWake();
        setTimeout(startWake, 400);
        return;
      }
      /* ★ 生きているように見えても、**4 分ごとに張り直す**（2026-08-16）。
         聞き取りは長く動かしっぱなしにすると、知らせだけ出しながら
         実際には拾わなくなる端末がある。待っているだけの時間なので、
         張り直しても利用者には何も起きない。 */
      if (st.wakeOn && Date.now() - (st.wakeStartAt || 0) > 240000) {
        noteEv("長く動かしたので 張り直す（4 分ごと）");
        stopWake();
        setTimeout(startWake, 300);
        return;
      }
      if (st.audioEvOk && st.wakeOn && !st.wakeAlive && Date.now() - st.wakeStartAt > 4000) {
        st.wakeTries = (st.wakeTries || 0) + 1;
        stopWake();
        /* 何度も失敗するなら、間を少しずつ空ける（端末が離すのを待つ） */
        setTimeout(startWake, Math.min(4000, 400 * st.wakeTries));
      }
    }, 2000);
  }
  /* ══ **画面を触ったら 掛け直す**（2026-08-15）════════════════════════
     ★ iPhone の聞き取りは、指で触った流れの外から掛け直すと
       黙って始まらないことがある（許可の扱いが厳しい）。
     ★ 見張り（watchWake）は 2 秒ごとに掛け直すが、それでも駄目な端末が
       ある。そこで **触ったときにも**掛け直す。触るのは自然にやるので、
       利用者は何も意識しなくていい。 */
  function armOnTouch() {
    if (st.touchArm) return;
    st.touchArm = true;
    var fix = function () {
      if (st.on || st.wakeOn || st.wakeBusy) return;
      var want = false;
      try { want = root.__vqSet ? (root.__vqSet.get("voice.wake") === true) : false; } catch (e) {}
      if (want) startWake();
    };
    ["pointerdown", "touchend", "visibilitychange"].forEach(function (n) {
      try { doc.addEventListener(n, fix, true); } catch (e) {}
    });
  }

  function stopWake() {
    var r = st.wake;
    if (r) st.wakeWas = true;      /* ★ 直後にマイクを取るなら 少し待つ印 */
    st.wake = null; st.wakeOn = false; st.wakeBusy = false;
    st.wakeAlive = 0;
    if (!r) return;
    try { r.onend = null; r.onerror = null; r.onresult = null; } catch (e) {}
    try { r.abort(); } catch (e) {}
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ══ マイクを取る（使い回す。ただし **生きているものだけ**）════════════
     ★ iPhone は アプリを開き直すたびに許可を聞く。これは iOS の決まりで
       こちらでは消せない。1 回の起動の中で聞かれる回数だけを減らす。
     ★ readyState が "live" でも **音が来ない**ことがある（聞き取り係の
       あとに取ると起きる）。そこは micAlive() で別に見張る。 */
  async function micStream() {
    var keep = st.keepStream;
    var alive = !!(keep && keep.getTracks().some(function (t) {
      return t.readyState === "live" && !t.muted;
    }));
    if (!alive) {
      try { if (keep) keep.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      keep = await root.navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      st.keepStream = keep;
    }
    return keep;
  }

  /* ══ 「繋がっているのに 声が届かない」を **自分で見つけて直す**════════
     ★ 私は実機のマイクを試せない。だから **画面自身に確かめさせる**。
     ★ 見分けかたは 2 つ。
        ① 線が切れている（readyState が live でない／無音にされた）
           …端末が別のものへマイクを渡したときに起きる。**確実に分かる**。
        ② 線は生きているのに、始めてから 6 秒 音が 1 度も動かない
           …「取れたように見えて 無音」。iPhone で実際に起きるのはこれ。
     ★ 見つけたら 黙って取り直して繋ぎ直す。**2 回まで**。
     ★ 見張りは **繰り返す**。1 回きりだと、途中で死んだときに気づけない
       （最初にそう書いて、試験で捕まえられなかった）。 */
  function watchMic() {
    clearInterval(st.iMic);
    st.micMoved = false;
    st.micAt = Date.now();
    st.micTries = 0;
    st.iMic = setInterval(function () {
      if (!st.on) return;
      var dead = false;
      try {
        var ts = st.stream ? st.stream.getTracks() : [];
        dead = !ts.length || ts.every(function (t) {
          return t.readyState !== "live" || t.muted;
        });
      } catch (e) {}
      /* 動いたことがあるなら、黙っていても正常（話していないだけ）。 */
      var mute = !st.micMoved && Date.now() - st.micAt > 6000;

      /* ★ ここでも **送り口の詰まり**を見る（2026-08-19）。
           マイクは動いているのに 送れていない、が いちばん たちが悪い
           （画面は 何ごとも 無いように 見えるのに 一言も 届いていない）。
           声が 出ているのに 4 秒 送れていなければ、印を 外す。 */
      /* ★ ここも **本当に 塞がっているときだけ**（2026-08-19）。
         塞いでいる印が 無いのに 外しにいくと、何も 変わらないまま
         3 秒おきに 動き続ける。 */
      if (!dead && st.ws && st.ws.readyState === 1
          && (st.speaking || st.先出し中 || st.jingleOn)
          && st.voiceAt && Date.now() - st.voiceAt < 2000
          && Date.now() - (st.sentAt || 0) > 4000
          && Date.now() - (st.詰まり時 || 0) > 6000
          && !st.barOn && !手で止めているか()) {
        st.詰まり時 = Date.now();
        noteEv("✗ 見張り: 声は出ているのに 4 秒 送れていない → 塞ぎを 外す");
        st.speaking = false; st.先出し中 = false; st.jingleOn = false;
        st.probeUntil = 0; st.probeNg = 0;
        if (st.tMute) { clearTimeout(st.tMute); st.tMute = 0; }
        try { duck(1); } catch (e2) {}
        try { st.micNode.port.postMessage({ type: "mute", on: false }); } catch (e3) {}
        st.sentAt = Date.now();
        st.詰まり = (st.詰まり || 0) + 1;
      }

      if (!dead && !mute) return;

      /* ★ 諦めない（2026-08-19・訴え「60 分 続けたい」）。
           前は 2 回 取り直して だめなら **見張りごと 止めて** いた。
           そこから先は 何が 起きても 誰も 直さない ＝ 無反応のまま 60 分。
           取り直しは 何度でも やる。ただし 立て続けには やらない
           （3 回を 超えたら 15 秒 おきに 落とす）。
           告げるのは 1 度だけ。何度も 同じことを 言わない。 */
      if (st.micTries >= 3) {
        if (Date.now() - (st.micSlowAt || 0) < 15000) return;
        st.micSlowAt = Date.now();
        if (!st.micSaid) { st.micSaid = true; say("マイクの音が届きません。取り直しています…"); }
      }
      st.micTries++;
      st.micMoved = false;
      st.micAt = Date.now();
      try {
        if (st.keepStream) st.keepStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      st.keepStream = null;
      micStream().then(function (ms) {
        try { if (st.mic) st.mic.disconnect(); } catch (e) {}
        st.stream = ms;
        st.mic = st.ctx.createMediaStreamSource(ms);
        st.mic.connect(st.micNode);
        st.micAt = Date.now();
      }).catch(function () {});
    }, 3000);
  }

  /* ══ まちがえたときに その場で 教える（2026-08-19・訴え）═══════════
     「間違っていたときは 自動で 次の問題に 進まず、さらに 詳しくて
       誰にでも わかりやすい 説明が できるようにしてほしい。
       **型には しないで。テンプレートとか。自然に そう 誘導するように**」

     ★ だから ここでは **言い方を 決めない**。
       「まちがえた」という 事実と、その場の 中身（問題・選んだもの・正解）
       だけを 渡す。何を どう 話すかは そのときの Lumi に 任せる。
       決まり文句を 持たせると、どの問題でも 同じ 説明に なってしまう。
     ★ 頼むのは 1 つだけ:「**その人が 分かるまで**、言い方を 変えて 話す」。
       段取りや 見出しは 指定しない。 */
  function まちがいを教える(詳) {
    if (!st.on || !st.ws || st.ws.readyState !== 1) return;
    /* 立て続けに 送らない（同じ問題で 何度も 直したときに 重ねない）。 */
    var 印 = String(詳.問題番号 || "") + "|" + String(詳.えらんだ || "");
    if (st.前のまちがい === 印 && Date.now() - (st.まちがい時 || 0) < 8000) return;
    st.前のまちがい = 印; st.まちがい時 = Date.now();

    var 文 = "（画面から の 知らせ。利用者に 読み上げないでください）\n"
      + "いま 解いている 問題で、利用者が **まちがえました**。画面は この問題の ままです。\n"
      + "問題（" + (詳.問題番号 || "") + "・" + (詳.形式 || "") + "）:\n" + (詳.問題 || "") + "\n"
      + "選んだ / 書いた: " + (詳.えらんだ || "（読み取れず）") + "\n"
      + "正しい答え: " + (詳.正解 || "（不明）") + "\n"
      + (詳.選択肢 && 詳.選択肢.length ? "選択肢: " + 詳.選択肢.join(" / ") + "\n" : "")
      + (詳.もとの解説 ? "教材に ついている 解説: " + 詳.もとの解説 + "\n" : "")
      + (詳.足りなかったところ ? "足りなかったところ: " + 詳.足りなかったところ + "\n" : "")
      + "\n"
      + "★ **勝手に 次へ 進めないでください。** この問題の ままで 話します。\n"
      + "★ この人が **本当に 分かるまで** 付き合ってください。\n"
      + "  ・なぜ その答えを 選びたく なったのか、まず そこに 触れる\n"
      + "  ・教材の 解説を そのまま 読まない。**その人に 向けて 言い直す**\n"
      + "  ・difficult な言葉を 使わない。身近な たとえを 使ってよい\n"
      + "  ・一度で 伝わらなければ **別の 言い方**で もう一度\n"
      + "★ 決まった 型（「まず」「次に」「まとめると」）で 話さないでください。\n"
      + "  毎回 同じ 形に なると、聞くほうは 頭に 入りません。\n"
      + "  その問題に いちばん 合う 話し方を、そのつど 選んでください。\n"
      + "★ 図や 式が あったほうが 早いときは showNote で 板に 書き、\n"
      + "  boardMark で 大事なところに 線を 引いてもよいです（声で 記号は 読まない）。\n"
      + "★ 話し終わったら「分かった？」と ひとこと 聞いて、**待ってください**。\n"
      + "  分かったと 言われてから、次へ 進むか どうかを 相談します。";
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: 文 }] }], turnComplete: true } }));
      noteEv("★ まちがえたので その場で 教えに 行きます（" + (詳.問題番号 || "") + "）");
    } catch (e) {}
  }
  try {
    root.addEventListener("vq-answer-wrong", function (e) {
      try { まちがいを教える((e && e.detail) || {}); } catch (x) {}
    });
  } catch (e) {}

  /* ══ 会話を始める ═════════════════════════════════════════════════ */
  function api() {
    try {
      if (root.AUTH_API_BASE) return String(root.AUTH_API_BASE).replace(/\/+$/, "");
      if (root.VQ_API_BASE) return String(root.VQ_API_BASE).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  }
  function token() { try { return root.localStorage.getItem("app.auth.token.v1") || ""; } catch (e) { return ""; } }

  /* ══ マイクの反応の強さ（言いかぶせやすさ）══════════════════════════
     ★ 「どれくらいの声で 割り込めるか」の下限。小さいほど よく反応する。
       端末・部屋・マイクの位置で当たりが違うので、決め打ちにせず
       **覚えられる**ようにした。__vqLive.sens(0.02) で動かせる。
     ★ 既定 0.026: ふつうの話し声は 0.05〜0.12、静かな部屋の雑音は
       0.005〜0.015（実測）。その間に置く。
     ★ 0.008 より下げさせない。雑音で勝手に切れるほうが害が大きい。 */
  /* ══ 底（そこ）— 直近 4 秒の いちばん 静かな ところ（2026-08-20）════
     ★ なぜ 平均や EMA では だめか
       ・EMA を **速く** すると、こちらの 話し声で 押し上げられる
         （＝ 2026-08-19 の 「1 回 言っても 反応しない」）
       ・EMA を **遅く** すると、うるさい 部屋に 追いつくのに 何分も かかる
         （＝ 2026-08-20 の 「雑音を 聞き取ってしまう」）
       どちらかを 立てると もう片方が 倒れる。
     ★ 底なら 両方 立つ
       ・人の 声は **とぎれる**。4 秒の 中には 必ず 息継ぎが あるので、
         底は 声では 上がらない。
       ・扇風機・テレビは **鳴りっぱなし**。底は そのまま その高さに なる。
       ・4 秒で 入れ替わるので 追いつくのも 速い。 */
  var 底の数 = 40;                       /* 100ms × 40 ＝ 4 秒 */
  function 底(窓, 値) {
    窓.push(値);
    if (窓.length > 底の数) 窓.shift();
    var m = 窓[0];
    for (var i = 1; i < 窓.length; i++) if (窓[i] < m) m = 窓[i];
    return m;
  }

  var 感度の鍵 = "vq.live.mic.sens.v1";
  function マイクの感度() {
    var v = Number(root.localStorage ? root.localStorage.getItem(感度の鍵) : NaN);
    if (!isFinite(v) || v <= 0) return 0.026;
    return Math.max(0.008, Math.min(0.2, v));
  }
  function 感度を決める(v) {
    /* ★ 人が 手で 直したら、こちらの 見積りは 捨てる（2026-08-20）。
       残っていると 手で 下げたのに 効かない、に なる。 */
    st.部屋 = undefined; st.部屋N = 0; st.引き金 = 0;
    st.部屋窓 = []; st.漏れ窓 = []; st.回り込み = undefined;
    var n = Number(v);
    if (!isFinite(n) || n <= 0) { try { root.localStorage.removeItem(感度の鍵); } catch (e) {} }
    else { try { root.localStorage.setItem(感度の鍵, String(Math.max(0.008, Math.min(0.2, n)))); } catch (e) {} }
    return { いまの感度: マイクの感度(),
             めやす: "ふつうの話し声は 0.05〜0.12、静かな部屋の雑音は 0.005〜0.015。"
               + "小さくするほど よく割り込めるが、雑音でも切れやすくなる。" };
  }

  /* ══ この人のいまの様子を、その場でまとめる（2026-08-15）════════════
     ★ サーバは成績を持っていない（端末の中にしかない）。
       だから **画面が持っているものを渡す**。別のデータベースを作らないので、
       アプリを更新すれば、次の会話から自動で新しくなる。
     ★ 渡すのは「何を持っていて・どれくらいできていて・どこが苦手か」まで。
       個人を特定するものは渡さない。 */
  function myContext() {
    var out = [];
    /* ★ **覚えておいたことを 先に渡す**（2026-08-17）。
       ここへ入れないと、覚えていても 次の会話で 出てこない
       （覚える口を 作っただけでは 足りない）。 */
    try {
      var 覚 = (st.memo && Array.isArray(st.memo.notes)) ? st.memo.notes : [];
      if (覚.length) {
        out.push("・**覚えておいてと 言われたこと**（" + 覚.length + " 件・新しい順）:");
        覚.slice(0, 12).forEach(function (n) {
          out.push("　" + (n.at || "") + (n.tag ? "［" + n.tag + "］" : "") + " "
            + String(n.text || "").slice(0, 120));
        });
      }
    } catch (e0) {}
    try {
      var ST = root.VQ2 && VQ2.store;
      if (ST && ST.listPresets) {
        var ps = ST.listPresets() || [];
        out.push("・持っているプリセット: " + ps.length + " 本");
        var bySub = {};
        ps.forEach(function (p) {
          var k = String(p.subjectId || "その他").replace(/^sub:/, "");
          (bySub[k] = bySub[k] || []).push(p);
        });
        Object.keys(bySub).slice(0, 8).forEach(function (k) {
          out.push("　" + k + "（" + bySub[k].length + "本）: "
            + bySub[k].slice(0, 6).map(function (p) {
                return String(p.name || "").slice(0, 24)
                  + "（" + ((p.questions || []).length) + "問）";
              }).join("、"));
        });
      }
      if (ST && ST.results && ST.results.list) {
        var rs = (ST.results.list() || []).slice()
          .sort(function (a, b) { return String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")); });
        if (rs.length) {
          var rate = function (r) { return r.maxScore > 0 ? Math.round(r.score / r.maxScore * 100) : 0; };
          var avg = Math.round(rs.slice(0, 20).reduce(function (n, r) { return n + rate(r); }, 0)
            / Math.min(20, rs.length));
          out.push("・解いた回数: " + rs.length + " 回、直近 20 回の平均 " + avg + "%");
          out.push("・最近の結果: " + rs.slice(0, 5).map(function (r) {
            return String(r.presetName || "").slice(0, 20) + " " + rate(r) + "%";
          }).join("、"));
          /* 苦手（点の低い順）。相談にのれるようにする。 */
          var weak = rs.slice(0, 30).filter(function (r) { return rate(r) < 70; })
            .sort(function (a, b) { return rate(a) - rate(b); }).slice(0, 4);
          if (weak.length) {
            out.push("・苦手そうなもの: " + weak.map(function (r) {
              return String(r.presetName || "").slice(0, 20) + " " + rate(r) + "%";
            }).join("、"));
          }
        } else out.push("・まだ 1 回も解いていません");
      }
      /* いま何の画面を見ているか（話の流れに使える） */
      try {
        var tab = doc.body.getAttribute("data-app-tab") || "";
        if (tab) out.push("・いま見ている画面: " + tab);
      } catch (e) {}
      /* 学習の決まり（設定） */
      try {
        var S = root.__vqSet;
        if (S && S.get) {
          out.push("・設定: 1 回 " + S.get("learn.questionCount") + " 問、"
            + "1 問あたり " + (S.get("learn.examTime") || 0) + " 秒");
        }
      } catch (e) {}
    } catch (e) {}
    /* ★ **前に話したこと**（2026-08-16）。会話を閉じるときに残した覚え書き。
       これがあると、翌日でも「この前の続き」から話せる。
       入っているのは要約だけで、会話の全文は どこにも保存していない。 */
    try {
      var M = st.memo;
      if (M && (M.summary || (M.topics || []).length)) {
        out.push("");
        out.push("【前に話したこと（" + (M.updatedAt || "") + "・"
          + (M.回数 || 1) + " 回目の会話）】");
        if (M.summary) out.push("・" + M.summary);
        if ((M.topics || []).length) out.push("・話した中身: " + M.topics.join("、"));
        if (M.nextStep) out.push("・つぎにやろうと言っていたこと: " + M.nextStep);
        out.push("これは前回までの覚え書きです。**いまの画面のことではありません。**"
          + "自然に続きから話してよいですが、"
          + "「この前は〜だったね」と言うのは この覚え書きに書いてあることだけにしてください。");
      }
    } catch (e) {}
    return out.join("\n").slice(0, 3800);
  }

  /* ══ 会話の覚え書き（2026-08-16）════════════════════════════════════
     ★ 「会話を終えても、アカウントごとに動向を保ちたい。翌日に引き継げるように」
     ★ 貯めるのは **要約だけ**。原文はサーバへ出さない。
       要約は 画面の中で機械的に組む（何を話したかの言葉を拾うだけ）。 */
  function 覚え書きを読む() {
    var tk = token(); if (!tk) return;
    fetch(api() + "/api/lumi/memory", { headers: { Authorization: "Bearer " + tk } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok && j.memory) st.memo = j.memory; })
      .catch(function () {});
  }
  function 覚え書きを残す() {
    try {
      var tk = token(); if (!tk) return;
      /* ★ **こちらが頼んだこと**を軸にする（2026-08-16 実測で直した）。
         Lumi の言葉だけを残したら、挨拶しか拾えず 翌日 何の役にも立たなかった。 */
      var 頼み = (st.mine || []).join(" / ").replace(/\s+/g, " ").trim();
      var 返し = (st.said || []).join(" ").replace(/\s+/g, " ").trim()
        .replace(/^(やあ|こんにちは|こんばんは)[^。！？]*[。！？]\s*/, "");   /* 挨拶は落とす */
      var 話 = (頼み ? "頼まれたこと: " + 頼み.slice(-260) : "")
        + (返し ? (頼み ? " ／ " : "") + "話したこと: " + 返し.slice(-260) : "");
      話 = 話.trim();
      if (話.length < 20) return;                 /* ひとことで終わった会話は残さない */
      /* 何の話だったかを拾う（決まった言葉だけ。人の名前などは拾わない） */
      var 語 = ["日本史", "世界史", "地理", "公民", "政治経済", "現代文", "古文", "漢文",
                "英語", "英単語", "数学", "物理", "化学", "生物", "地学", "情報",
                "プリセット", "スライド", "資料", "アンケート", "表", "タイマー",
                "テスト", "試験", "宿題", "復習", "解説", "苦手", "文化祭"];
      var 出た = [];
      var 探す = 頼み + " " + 返し;
      語.forEach(function (w) { if (探す.indexOf(w) >= 0 && 出た.length < 6) 出た.push(w); });
      var mem = {
        summary: 話.slice(0, 400),
        topics: 出た,
        nextStep: String(st.goal || "").slice(0, 100),
        回数: ((st.memo && st.memo.回数) || 0) + 1
      };
      fetch(api() + "/api/lumi/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify(mem), keepalive: true
      }).catch(function () {});
      st.memo = mem;
    } catch (e) {}
  }

  /* ══ 音の入れ物は **1 つだけ作って、ずっと使い回す**（2026-08-15）══════
     ★ 前は会話のたびに作って閉じていた。iPhone はこれを嫌う
       （同時に持てる数に限りがあり、閉じてもすぐには戻らない）。
       そのため **2 回目の会話で音が出ず、声も届かなかった**。
     ★ さらに、作るのは **指で触ったその瞬間**でなければならない。
       await をまたいでから作ると、触った扱いが切れて
       止まったまま（suspended）になり、やはり音が出ない。
       だから open() の入口で、待たずに作る。 */
  function ensureCtx() {
    try {
      if (!st.ctx || st.ctx.state === "closed") {
        st.ctx = new (root.AudioContext || root.webkitAudioContext)();
        st.mods = false;
      }
      if (st.ctx.state === "suspended") st.ctx.resume();
      keepAlive();
      /* iPhone: 消音スイッチでも鳴るようにする（Safari 16.4+） */
      try { if (root.navigator.audioSession) root.navigator.audioSession.type = "play-and-record"; } catch (e) {}
    } catch (e) { st.ctx = null; }
    return st.ctx;
  }

  /* ══ 入れ物を **止めない**（2026-08-15・重大）════════════════════════
     ★ 呼びかけ（Hey Lumi）で始まるとき、**指で触っていない**。
       iPhone は触っていない流れからの resume() を断る。断られると
       止まったままになり、**声が入らず、音も出ない**。
     ★ だから、一度 触った流れで動かしたら **そのまま動かし続ける**。
       何も鳴らさないと端末が勝手に止めるので、無音を流し続けて起こしておく。
     ★ 待ち受けを切っているときは動かさない（電池のため）。 */
  function keepAlive() {
    try {
      if (!st.ctx || st.hum) return;
      var b = st.ctx.createBuffer(1, 1, st.ctx.sampleRate);
      var src = st.ctx.createBufferSource();
      src.buffer = b; src.loop = true;
      var g = st.ctx.createGain();
      g.gain.value = 0;                       /* 無音。聞こえない */
      src.connect(g); g.connect(st.ctx.destination);
      src.start(0);
      st.hum = src;
    } catch (e) {}
  }
  function letSleep() {
    try { if (st.hum) st.hum.stop(); } catch (e) {}
    st.hum = null;
    try { if (st.ctx && st.ctx.state === "running") st.ctx.suspend(); } catch (e) {}
  }

  /* ══ 起動音・終了音（2026-08-16）════════════════════════════════════
     ★ 利用者が作った音。**Lumi の声と同じ入れ物（AudioContext）**で鳴らす。
       <audio> は使わない。iPhone は会話中 play-and-record になっていて、
       別口の <audio> が鳴らない（または受話口へ回る）端末がある。
       声が鳴っている道なら、必ず鳴ることが分かっている。
     ★ **鳴っている間はマイクを送らない。** そうしないと、この音を
       こちらの声だと思って向こうへ送り、いきなり遮られる。
     ★ 入切と大きさは、いまある効果音の設定にそろえる（別の設定を増やさない）。
     ★ もとは 5.1ch の AIFF（1.8MB・2.23秒）。L と R だけが鳴っていて
       残り 4 チャンネルは完全な無音だったので、そこを取り出して
       末尾の無音を切り、m4a にした（28KB）。音そのものは変えていない。 */
  /* ★ m4a（AAC・28KB）を先に試し、**読めなければ WAV（330KB）へ落とす**。
     AAC は Chrome / Safari / Firefox では読めるが、
     codec を積んでいない Chromium では読めない（実測 2026-08-16:
     "Unable to decode audio data"）。WAV はどこでも必ず読める。
     控えを取りにいくのは 読めなかった端末だけなので、ふだんは 28KB で済む。 */
  var 音の道 = {
    start: ["/vq-lumi-start.m4a", "/vq-lumi-start.wav"],
    end: ["/vq-lumi-end.m4a", "/vq-lumi-end.wav"]
  };

  function 効果音の大きさ() {
    try {
      if (root.__vqSet && root.__vqSet.get("sound.sfx") === false) return 0;
      var v = root.__vqSet && root.__vqSet.get("sound.sfxVolume");
      return v === "SMALL" ? 0.35 : v === "LARGE" ? 1 : 0.7;
    } catch (e) { return 0.7; }
  }

  function 音を用意(which) {
    st.jingles = st.jingles || {};
    if (st.jingles[which]) return Promise.resolve(st.jingles[which]);
    if (!st.ctx) return Promise.resolve(null);
    var ctx = st.ctx;
    var 道 = 音の道[which] || [];
    var 試す = function (i) {
      if (i >= 道.length) return Promise.resolve(null);
      return fetch(道[i])
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (ab) {
          if (!ab) return null;
          return new Promise(function (done) {
            try {
              var 約 = ctx.decodeAudioData(ab,
                function (b) { st.jingles[which] = b; done(b); },
                function () { done(null); });
              /* 呼び返しで 受けていても 約束は 別に 失敗する。必ず 拾う。 */
              if (約 && typeof 約.catch === "function") 約.catch(function () { done(null); });
            } catch (e) { done(null); }
          });
        })
        .catch(function () { return null; })
        .then(function (b) { return b || 試す(i + 1); });   /* 読めなければ次の形へ */
    };
    return 試す(0);
  }

  /* 鳴らす。鳴り終わったら done を呼ぶ（終了音は鳴り終わるまで眠らせない）。 */
  function 鳴らす(which, done) {
    var 済んだ = false;
    var 終わり = function () {
      if (済んだ) return;
      済んだ = true;
      st.jingleOn = false;
      if (done) { try { done(); } catch (e) {} }
    };
    if (!効果音の大きさ()) { 終わり(); return; }
    var ctx = ensureCtx();
    if (!ctx) { 終わり(); return; }
    音を用意(which).then(function (buf) {
      if (!buf) { 終わり(); return; }
      try {
        var src = ctx.createBufferSource();
        var gain = ctx.createGain();
        src.buffer = buf;
        gain.gain.value = 効果音の大きさ();
        src.connect(gain); gain.connect(ctx.destination);
        st.jingleOn = true;                 /* この間、マイクは送らない */
        src.onended = 終わり;
        src.start(0);
        /* 保険: onended が来ない端末がある。長さぶんで必ず解く
           （解けないと マイクが永久に届かなくなる） */
        setTimeout(終わり, Math.round(buf.duration * 1000) + 300);
      } catch (e) { 終わり(); }
    }, 終わり);
  }

  /* ══ いま Lumi を出してよい場面か（2026-08-19・訴え）═══════════════════
     「ログイン画面では 本物の Lumi を使えないようにして。
       チュートリアルと かぶってしまうかもだから。」

     出さない場面:
       ・ログイン／新規登録の画面が出ている（合言葉が無い人に 話しかけても
         できることが 無いうえ、暗証番号や規約の入力と 声が ぶつかる）
       ・暗証番号の板が出ている
       ・Lumi のはじめかた（チュートリアル）が出ている
         ── ただし **デモとして呼ばれたときは通す**。
            チュートリアルは この機能を使って 見せ方だけ動かしている。 */
  function 出してよい場面か() {
    try {
      if (st.デモ) return true;                       /* チュートリアルの見せ物は通す */
      var b = doc.body;
      if (b && (b.classList.contains("auth-gate-open") || b.classList.contains("first-launch-open"))) return false;
      if (doc.documentElement && doc.documentElement.classList.contains("vqna-showing")) return false;
      var 出てる = ["vqNewAuth", "authGate", "firstLaunchOverlay", "vqbFlow", "vqPin", "authBootSplash"];
      for (var i = 0; i < 出てる.length; i++) {
        var e = doc.getElementById(出てる[i]);
        if (e && !e.hidden && getComputedStyle(e).display !== "none") return false;
      }
      if (root.__vqPin && root.__vqPin.isOpen && root.__vqPin.isOpen()) return false;
      if (root.__vqLumiTour && root.__vqLumiTour.isOpen && root.__vqLumiTour.isOpen()) return false;
      /* 合言葉が無い＝まだログインしていない */
      var t = "";
      try { t = String(localStorage.getItem("app.auth.token.v1") || "").trim(); } catch (e2) {}
      if (!t) return false;
    } catch (e) { return true; }   /* 判じられないなら 止めない */
    return true;
  }

  function open() {
    if (st.on) return;
    if (!出してよい場面か()) { noteEv("★ いまは出さない場面（ログイン中／暗証番号／チュートリアル）"); return; }
    st.on = true;
    ensureCtx();             /* ★ 触った瞬間に。ここを遅らせると音が出ない */
    覚え書きを読む();        /* 前に話したことを 先に取っておく */
    /* ★ 数式の道具を **先に読んでおく**（2026-08-17・訴え「数式が効いていない」）。
       これまでは「数式が 出てきてから」読んでいた（2.28MB）。
       実測: 板を出した直後は SVG 0・生の $ が 6 個 見えていて、
       1.2 秒 あとに ようやく 組み上がっていた。回線が細いと 何秒も
       「$\frac{1}{2}$」のままの字が 出る＝**効いていないように 見える**。
       会話を始めた時点で 読み始めれば、板が出る頃には 間に合う。
       読み込みは 1 回だけ・あとは 端末に 残る。 */
    try { if (root.VQM && VQM.svg && !VQM.svg.読み込み済み()) VQM.svg.要る(); } catch (e0) {}
    st.said = []; st.mine = [];
    /* ══ 会話の 名札（2026-08-20・訴え「今日の 音声会話を 使い切った」）══
       ★ 1 日の 回数は **会話の数**で 数えたい。ところが サーバは
         「繋ぎ直しかどうか」を 画面から 受け取っていて、その印は
         道具が 動くたび・予告どおりの 繋ぎ替えのたびに 0 に戻る。
         つまり **同じ会話が 何度も 数えられていた**。
       ★ 呼んだときに 1 つ 名札を 作り、切るまで 変えない。
         繋ぎ直しても 同じ 名札で 頼むので、サーバは 1 回と 数える。 */
    st.会話ID = (function () {
      try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
      return "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    })();
    st.openAt = Date.now(); st.aliveAt = Date.now(); st.muteFrom = 0; st.waitSpk = 0;
    st.区間 = 1;
    watchStuck();
    syncMute();
    鳴らす("start");         /* 起動音 */
    音を用意("end");         /* 終わりの音は先に用意しておく（畳むとき待たせない） */
    /* ★ 作業音も先に読んでおく（324KB）。初めての 1 回だけ読み込みで
       出遅れ、いちばん見せたい最初の作業で鳴らなかった（実測 2026-08-16）。 */
    作業音を用意();
    stopWake();
    showBtn(false);          /* 会話中は消す（終わるのは長押し） */
    showType(true);          /* 代わりに 文字で伝える口を出す */
    showEdge(true);
    say("つないでいます…");
    st.つながらず = 0;
    go().catch(function (e) { 繋ぎ直しを頼む(e); });
  }

  /* ══ つながらなかったときの 立て直し（2026-08-20・訴え）════════════
     「10 分弱で 繋ぎ直しになって、応答も しなくなる。
       島では ずっと『繋ぎ直しています』の 文字が」

     ★ もとは `go().catch(function () { close(); })` だった。
       つまり **1 回でも しくじると そこで 終わり**。
       しかも しくじりが 途中で 止まる形（返ってこない fetch）だと
       catch すら 呼ばれず、字が 出たまま 永久に 止まっていた。
     ★ ここに まとめる:
         ・はっきりした 断り（回数切れ・要ログイン）は **繰り返さない**
         ・それ以外は 少し 間を あけて **5 回まで** やり直す
         ・5 回で だめなら 正直に 終わる（黙って 粘らない） */
  /* ── 使えなかった鍵の 控え（端末に 残す）───────────────────── */
  var 鍵控えの鍵 = "vq.live.badkeys.v1";
  /* 形: { "2": { until: 期限, why: "1008 …" } }
     ★ 古い形（数だけ）でも 読めるようにしておく（読み込み直しで 消さない）。 */
  function 鍵控えを読む() {
    var 出 = {};
    try {
      var o = JSON.parse(root.localStorage.getItem(鍵控えの鍵) || "{}");
      var 今 = Date.now();
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
        var v = o[k];
        var 期 = (v && typeof v === "object") ? Number(v.until) : Number(v);
        if (期 > 今) 出[k] = { until: 期, why: String((v && v.why) || "") };
      }
    } catch (e) {}
    return 出;
  }
  /* サーバへ 伝える ぶん（次の 札の 取りにいきで 一緒に 送る）。
     ★ **この会話で 本当に 繋いで 切られた 鍵だけ**を 送る。
       端末の 控えを まるごと 送ってはいけない（2026-08-28・検査で 踏んだ）。
       控えは 手で 書き換えられるし、古い 覚えも 混ざる。それを みんなの
       控えへ 流すと、**1 台の 思い込みで 全員の 鍵が 止まる**。 */
  function 避けた訳() {
    var 出 = {};
    try {
      var o = st.鍵の訳 || {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
        var w = String(o[k] || "");
        if (w) 出[k] = w;
      }
    } catch (e) {}
    return 出;
  }
  function 鍵控えに足す(i, なぜ) {
    if (!(i >= 0)) return;
    st.鍵の訳 = st.鍵の訳 || {};
    st.鍵の訳[i] = String(なぜ || "").slice(0, 200);
    /* 出入り禁止は 待っても 直らない（鍵そのものが 死んでいる）。
       混んでいるだけなら 1 分ほどで 戻る。分けないと、
       混んでいただけの 鍵を 6 時間 捨てることになる。 */
    var 死 = /denied|permission|forbidden|unregistered|invalid|expired|API key/i.test(String(なぜ || ""));
    var まで = Date.now() + (死 ? 6 * 3600 * 1000 : 90 * 1000);
    try {
      var o = 鍵控えを読む();
      if (!(o[i] && Number(o[i].until) > まで))
        o[i] = { until: まで, why: String(なぜ || "").slice(0, 200) };
      root.localStorage.setItem(鍵控えの鍵, JSON.stringify(o));
    } catch (e) {}
    noteEv("★ 鍵 " + i + " を " + (死 ? "6 時間" : "90 秒") + " 避ける（" + String(なぜ || "").slice(0, 60) + "）");
  }
  /* いま 避けるべき 鍵（この会話で しくじった ぶん ＋ 端末の 控え） */
  function 避ける鍵() {
    var 出 = (st.badKeys || []).filter(function (x) { return x >= 0; });
    var o = 鍵控えを読む();
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
      var i = Number(k);
      if (i >= 0 && 出.indexOf(i) < 0) 出.push(i);
    }
    /* ★ **全部を 避けない**。全部 避けると サーバは 仕方なく 1 本目を 返し、
       控えが 効いていないのと 同じに なる。1 本は 必ず 残す。 */
    var 本 = Number(st.keyCount || 0);
    if (本 > 0 && 出.length >= 本) 出 = 出.slice(0, 本 - 1);
    return 出;
  }

  function 繋ぎ直しを頼む(e) {
    if (!st.on) return;
    var 訳 = String((e && e.message) || e || "");
    if (訳) st.最後の訳 = 訳;
    /* 今日ぶんを 使い切った／ログインが 要る は 待っても 変わらない。 */
    if (/使い切|ログイン|UNAUTHORIZED/i.test(訳)) {
      noteEv("★ はっきりした 断りなので 繋ぎ直さない: " + 訳.slice(0, 80));
      say(訳); setTimeout(close, 2600); return;
    }
    st.つながらず = (st.つながらず || 0) + 1;
    if (st.つながらず >= 5) {
      noteEv("★ 5 回 続けて つながらなかったので 終わる（" + 訳.slice(0, 80) + "）");
      say("つながりませんでした。もう一度 呼んでください。");
      setTimeout(close, 1800); return;
    }
    noteEv("✗ つながりませんでした（" + st.つながらず + " 回目）: " + 訳.slice(0, 80));
    say("つなぎ直しています…（" + st.つながらず + " 回目）");
    setTimeout(function () {
      if (!st.on) return;
      go().catch(function (e2) { 繋ぎ直しを頼む(e2); });
    }, Math.min(5000, 700 * st.つながらず));
  }

  /* ══ 繋ぎの 見張り（2026-08-20・訴え）════════════════════════════════
     「10 分弱で 繋ぎ直しになって、応答も しなくなる。
       島では ずっと『繋ぎ直しています』の 文字が」

     ★ 繋ぎ直しは `go()` を 呼ぶだけで、**go() が 途中で 止まったときの
       備えが 何も 無かった**。止まりうる所は 3 つ:
         ・トークンを 取る fetch（細い回線で 何分も 返らない）
         ・マイクを 取り直す（ほかが 掴んでいると 返らない）
         ・部品の 読み込み
       どれかで 止まると **次の 繋ぎ直しが 仕掛からない**。
       画面は 直前に 出した「つなぎ直しています…」の まま 固まる。
       ＝ 訴えの 通りの 見た目に なる。

     ★ だから **25 秒で 見切る**。見切ったら 古い 試みを 捨てて（世代）、
       もう一度 始めから やり直す。5 回 続けて だめなら 正直に 終わる。 */
  function 繋ぎの見張りを掛ける() {
    if (st.t繋ぎ) clearTimeout(st.t繋ぎ);
    st.繋がった = false;
    st.t繋ぎ = setTimeout(function () {
      st.t繋ぎ = 0;
      if (!st.on || st.繋がった) return;
      st.世代 = (st.世代 || 0) + 1;         /* 止まっている 試みを 無効にする */
      st.つながらず = (st.つながらず || 0) + 1;
      noteEv("✗ 25 秒 たっても つながりませんでした（" + st.つながらず + " 回目）。やり直します。");
      var w = st.ws; st.ws = null;
      if (w) { try { w.close(); } catch (e) {} }
      if (st.つながらず >= 5) {
        say("つながりませんでした。もう一度 呼んでください。");
        setTimeout(close, 1600);
        return;
      }
      say("つなぎ直しています…（" + st.つながらず + " 回目）");
      setTimeout(function () {
        if (!st.on) return;
        go().catch(function (e2) { 繋ぎ直しを頼む(e2); });
      }, 800);
    }, 25000);
  }

  async function go() {
    /* ★ この 試みの 世代。見切られたら 追い越されるので、
       途中の await から 戻ったときに 自分が 古いかを 見る。 */
    var 世代 = st.世代 = (st.世代 || 0) + 1;
    繋ぎの見張りを掛ける();
    /* ══ 繋ぎ直しの前に **古い印を 必ず 消す**（2026-08-19・重大）════════
       ★ 訴え「6〜10 分で 繋ぎ直しになって、こちらの声を 聞き取らなくなる。
         最終的に Lumi が 強制終了する」。
       ★ 元凶はこれ。切れた瞬間に Lumi が 喋っていると st.speaking が
         **真のまま 残る**。送り出しの所に「喋っている間は 送らない」が
         あるので、繋ぎ直したあと **こちらの声が 一生 送られない**。
         向こうからは 何も言っていないように見え、5 分の 黙りで 打ち切られる
         ＝「勝手に 終わる」。
       ★ 同じ理由で 止まりうる印を まとめて 戻す。ここを 通らない道は 無い。 */
    st.speaking = false; st.inTurn = false; st.jingleOn = false;
    st.先出し中 = false; st.probeUntil = 0; st.probeNg = 0; st.bargeN = 0;
    st.heard = false;
    /* ★ 回り込みの見積りも 捨てる（2026-08-19）。
       前の接続で 学んだ 大きさを 持ち越すと、線が 高いままになり
       **繋ぎ直したあと 割り込めない**（＝話しかけても 無反応）。
       次の接続で 測り直させる。 */
    st.echo = undefined; st.echoN = 0; st.probeExt = 0; st.強N = 0; st.lastCut = 0; st.probeAt = 0;
    st.声始 = 0; st.voiceAt = 0; st.sentAt = Date.now();
    /* 「考えています」の 表示と 作業音は、印を 落とすだけでは 止まらない。
       止め忘れると 繋ぎ直したあと 鳴りっぱなしになる。必ず 終わりを 通す。 */
    if (st.thinking) { st.thinking = false; try { 作業終了(); } catch (e1) {} }
    if (st.tMute) { clearTimeout(st.tMute); st.tMute = 0; }
    if (st.tProbe) { clearTimeout(st.tProbe); st.tProbe = 0; }
    if (st.t先出し) { clearTimeout(st.t先出し); st.t先出し = 0; }
    if (st.t安定) { clearTimeout(st.t安定); st.t安定 = 0; }
    try { duck(1); } catch (e0) {}
    /* 前の部品だけ外す。**入れ物（ctx）は閉じない**（使い回す）。 */
    try { if (st.micNode) st.micNode.disconnect(); } catch (e) {}
    try { if (st.spk) st.spk.disconnect(); } catch (e) {}
    try { if (st.mic) st.mic.disconnect(); } catch (e) {}
    st.micNode = st.spk = st.mic = null;
    /* ① 一時トークンを取る。**押した直後にしか使えない**ので、ここで取る。 */
    var h = { "Content-Type": "application/json" };
    var tk = token(); if (tk) h.Authorization = "Bearer " + tk;
    /* 選んだ声を渡す。設定が無ければサーバの既定になる。 */
    var voice = "";
    try { voice = String((root.__vqSet && root.__vqSet.get("voice.name")) || ""); } catch (e) {}
    /* ★ **返ってこない fetch で 止まらない**（2026-08-20・訴え
       「島では ずっと『繋ぎ直しています』の 文字が」）。
       細い回線では ここが 何分も 返らないことが ある。返らない間は
       次の 繋ぎ直しも 仕掛からないので、**その字のまま 永久に 止まる**。 */
    var 中止 = (function () { try { return new root.AbortController(); } catch (e) { return { signal: undefined, abort: function () {} }; } })();
    var t中止 = setTimeout(function () { try { 中止.abort(); } catch (e) {} }, 12000);
    var res = await fetch(api() + "/api/live/token", { method: "POST", headers: h,
      /* 繋ぎ直しは 1 日の回数に数えない（利用者は 1 回しか始めていない） */
      /* ★ 枠切れで落ちた鍵は避けて取り直す（鍵は 6 本ある。2026-08-16） */
      signal: 中止.signal,
      body: JSON.stringify({ voice: voice, resume: st.redial > 0, context: myContext(),
                             /* 会話の 名札。繋ぎ直しても 同じ（回数を 二重に 数えさせない） */
                             sid: st.会話ID || "",
                             avoid: 避ける鍵(),
                             /* どの鍵が なぜ だめだったか。サーバが みんなのぶんとして
                                覚えるので、ほかの人は もう 踏まない（2026-08-28）。 */
                             avoidWhy: 避けた訳(),
                             /* ★ 切り分け用のスイッチ（2026-08-17）。
                                段1 が 生成の中身を 変えてしまったのかを 測るため、
                                **モデルに届く分だけ**を 一時的に 外せるようにする。
                                localStorage["vq.dan1"]="off" のときだけ 立つ。 */
                             段1オフ: 段1オフ() }) });
    clearTimeout(t中止);
    var j = await res.json().catch(function () { return null; });
    if (!res.ok || !j || !j.token) {
      throw new Error((j && j.message) || "音声会話を始められませんでした");
    }
    if (世代 !== st.世代) return;      /* 追い越された（古い 繋ぎ直しは 捨てる） */

    /* ② 音の入れ物。**open() で作ったものを使う**（作り直さない）。 */
    if (!ensureCtx()) throw new Error("音を扱えませんでした");
    if (st.ctx.state === "suspended") { try { await st.ctx.resume(); } catch (e) {} }
    /* 部品の読み込みは **1 つの入れ物につき 1 回だけ**（2 回目は例外になる）。 */
    if (!st.mods) {
      await st.ctx.audioWorklet.addModule("/vq-live-pcm.worklet.js");
      st.mods = true;
    }

    /* ══ マイクは **一度だけ取って使い回す**（2026-08-15）════════════
       ★ iPhone は **アプリを開き直すたびに**マイクの許可を聞く。これは
         iOS の決まりで、こちらのコードでは消せない。
       ★ だが「1 回の起動の中で何度も聞かれる」のは減らせる。
         会話のたびに取り直すと、そのたびに聞かれることがある。
         取ったものを持っておき、次の会話でも同じものを使う。
       ★ 生きているかを確かめてから使う（端末が勝手に止めることがある）。 */
    /* ★ **聞き取り係が離しきるのを待つ**（2026-08-15 追記）。
       「Hey Lumi」の聞き取りは iPhone でマイクを 1 人占めする。
       stop() を呼んでも **すぐには離れない**。離れる前に取りにいくと、
       取れたように見えて **無音のマイク**が返る。
       ＝「繋がるのに喋れない」（実測の訴え）。
       なので、少し待ってから取る。 */
    if (st.wakeWas) { st.wakeWas = false; await sleep(450); }

    st.stream = await micStream();
    if (世代 !== st.世代) return;      /* 追い越された（二重に 繋がない） */
    st.mic = st.ctx.createMediaStreamSource(st.stream);
    st.micNode = new root.AudioWorkletNode(st.ctx, "vq-mic-down", {
      /* ★ 止めている間の 直近 1.2 秒を 覚えさせる（2026-08-19）。
         割り込みだと 分かった瞬間に、言葉の **頭から** 送り直すため。 */
      processorOptions: { targetRate: 16000, keepMs: 1200 }
    });
    st.spk = new root.AudioWorkletNode(st.ctx, "vq-speak-up", {
      processorOptions: { sourceRate: 24000 }
    });
    st.mic.connect(st.micNode);
    /* ★ 声と出口の間に つまみを 1 つ入れる（2026-08-16）。
       割り込みを試すあいだ 自分の声を小さくするため。
       小さくしないと、開けたマイクが **自分の声を拾って** 自分を止める。 */
    try {
      st.duck = st.ctx.createGain();
      st.duck.gain.value = 1;
      st.spk.connect(st.duck);
      st.duck.connect(st.ctx.destination);
    } catch (e) { st.duck = null; st.spk.connect(st.ctx.destination); }
    watchMic();                    /* ★ 声が届いているかを 画面自身に見張らせる */

    /* ③ つなぐ。トークンを鍵の代わりに使う。 */
    /* ★ 一時トークンで入る口は **BidiGenerateContentConstrained**（末尾が Constrained）。
       素の BidiGenerateContent は
         code=1008 Method doesn't allow unregistered callers
       と言って切られる（＝鍵で来い、の意味）。実測 2026-08-15 で確定。
       ここを 1 語間違えるだけで「開くのに何も返らない」になる。 */
    st.keyIndex = (j && typeof j.keyIndex === "number") ? j.keyIndex : -1;
    st.keyCount = (j && j.keyCount) || 1;
    var url = "wss://generativelanguage.googleapis.com/ws/"
      + "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained"
      + "?access_token=" + encodeURIComponent(j.token);
    var ws = new root.WebSocket(url);
    ws.binaryType = "arraybuffer";
    st.ws = ws;

    var opened = false;
    ws.onopen = function () {
      opened = true;
      /* 最初の 1 通は必ず setup。返事（setupComplete）が来るまで音は送らない。 */
      ws.send(JSON.stringify({
        setup: {
          model: "models/" + (j.model || "gemini-3.1-flash-live-preview"),
          generationConfig: {
            responseModalities: ["AUDIO"],
            /* ★ 声はここで決める。サーバが通した名前だけが入る
               （知らない名前を渡すと、その場で失敗して喋らなくなる）。 */
            speechConfig: j.voice
              ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: j.voice } } }
              : undefined
          },
          systemInstruction: { parts: [{ text: String(j.systemInstruction || "") }] },
          /* ══ Google 検索は **付けない**（2026-08-16・実測で確定）════════
             ★ 付けて試したところ、**繋ぐたびに毎回 1011 で弾かれた**。
               しかも理由が "quota exceeded" と返るので、
               「断られたら外す」の判定が **枠切れと誤認して発動しない**。
               結果、Lumi が一度も喋らなくなった（利用者の訴えそのもの）。
             ★ 検索を付けずに試したときは 4 回中 4 回とも繋がっている。
               つまり **原因は検索を付けたこと**。無料の枠では使えない。
             ★ 試したいときだけ VQ_SEARCH=1 で付ける。既定は付けない。 */
          tools: (function () {
            var t = (j.tools || []).slice();
            if (root.VQ_SEARCH && !st.noSearch) t = t.concat([{ googleSearch: {} }]);
            return t.length ? t : undefined;
          })(),
          /* 文字起こしも一緒にもらう（学習の記録に使える。別に音声認識を回さずに済む） */
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          /* ══ 話の続きを 持ち越す（2026-08-15）════════════════════════
             ★ Google は 10 分ほどで必ず切る。前は切れるたびに
               **まっさらな相手**に繋ぎ直していた。だから
               「途中から話が通じなくなる」「無視される」が起きていた。
             ★ 札（handle）をもらっておき、繋ぎ直すときに渡すと
               **話の中身をそのまま引き継げる**。
               実測: 1 本目で「好きな食べ物はカレー」と伝え、
               繋ぎ直したあとに聞いたら「カレーですよ」と答えた。
             ★ あわせて、長話は古い所から自動で畳んでもらう。
               これが無いと 1 回の長さに上限が付く。 */
          sessionResumption: st.resume ? { handle: st.resume } : {},
          contextWindowCompression: { slidingWindow: {} },
          /* ══ 割り込みの感度を下げる（2026-08-16・重大）════════════════
             ★ 訴え「Lumi が喋ったらすぐ切れて待機になる」。
               原因は **向こう側の判定**。こちらが送ったマイクの音を
               Google が「利用者が話し始めた」とみなして、Lumi を止める。
               スピーカーで聞いていると、Lumi 自身の声が回り込むので、
               喋り出した瞬間に自分で自分を止めることになる。
             ★ こちら側でもマイクは止めているが、止まる前の一瞬や、
               止めきれない端末があるので、**向こう側も鈍くする**。
               ・話し始めたと判じる線を いちばん低い感度に
               ・話し終わったと判じる線も 低く
               ・前置きを 300ms、黙りを 800ms 見てから動く
             ★ 「割り込ませない」にはしない。**こちらから遮れる**ことは
               会話として大事なので、鈍くするだけに留める。 */
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
              endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
              prefixPaddingMs: 300,
              silenceDurationMs: 800
            }
          }
        }
      }));
    };

    var ready = false;
    ws.onmessage = async function (ev) {
      var text = "";
      try {
        text = (typeof ev.data === "string") ? ev.data
          : await new Response(ev.data).text();
      } catch (e) { return; }
      var m = null; try { m = JSON.parse(text); } catch (e) { return; }

      if (m.setupComplete) {
        ready = true;
        /* 繋ぎの 見張りを 解く（ここまで 来れば 止まっていない） */
        st.繋がった = true; st.つながらず = 0;
        if (st.t繋ぎ) { clearTimeout(st.t繋ぎ); st.t繋ぎ = 0; }
        /* ★ **落ち着いたら 失敗の数を 0 に戻す**（2026-08-19）。
           Google の 1 本の接続は 10 分ほどで 必ず 切れる。60 分 続けるには
           6 回以上 繋ぎ替えることになるが、上限は 3 回だった。
           ＝ **4 回目で 必ず 会話ごと 終わっていた**（訴えの「強制終了」）。
           45 秒 続いた接続は 失敗ではないので、通算から 外す。 */
        if (st.t安定) clearTimeout(st.t安定);
        st.t安定 = setTimeout(function () {
          if (!st.on) return;
          if (st.redial) noteEv("★ 45 秒 続いたので 繋ぎ直しの数を 0 に戻す（前 " + st.redial + "）");
          st.redial = 0; st.micTries = 0; st.巡 = 0; st.micSaid = false;
          st.つながらず = 0; st.waitN = 0;
        }, 45000);
        say("聞いています");
        armSilence(GREET_GRACE_MS);
        /* こちらから 1 声かける（黙ったまま始まると、話しかけてよいのか分からない）。
           ★ ただし **繋ぎ替えのときは挨拶しない**。会話の途中で
             「こんにちは！」と言い直すと、切れたことが丸わかりになる。 */
        /* ★ 繋がったら すぐ **いまの画面**を送り込み、以後 見張る。
           （前はここで return していたので 一度も動いていなかった） */
        setTimeout(function () { pushScreen(true); watchScreen(); }, 300);
        /* ══ ★ **切れて消えた頼みを 言い直す**（2026-08-17）══════════
           ★ 実測: 頼んだ直後に 1008 で切れると、その頼みは失われる。
             繋ぎ直しても 挨拶しか出ず、10 分待っても何も起きなかった。
           ★ まだ道具が 1 つも動いていない頼みが 3 分以内にあるなら、
             こちらから もう一度 渡す。挨拶より こちらが先。 */
        var 言い直した = false;
        try {
          var m2 = st.未処理;
          if (m2 && !m2.動いた && Date.now() - m2.at < 180000) {
            ws.send(JSON.stringify({ clientContent: {
              turns: [{ role: "user", parts: [{ text: m2.文
                + "\n\n（つなぎ直したので もう一度 渡しています。"
                + "挨拶は要りません。**そのまま取りかかってください。**）" }] }],
              turnComplete: true } }));
            言い直した = true;
            noteEv("★ 切れて消えた頼みを 言い直した");
          }
        } catch (e) {}
        /* 仕事の途中で切れたなら、続きを頼む（予定は st に残っている） */
        if (!言い直した && st.goal) {
          /* ★ 促すだけでは 足りない（2026-08-19・大きな仕事）。
             10 分で 1 本の 接続が 切れるので、30 件の 仕事なら
             途中で 何度も 繋ぎ直る。そのたびに **何をどこまでやったか**を
             渡し直さないと、同じ件を もう一度 やったり、
             残りを 忘れたりする（実測で 両方 起きた）。 */
          try {
            var 残2 = のこり件();
            var 済2 = ((st.plan || []).length - 残2.length);
            if ((st.plan || []).length && 残2.length) {
              ws.send(JSON.stringify({ clientContent: {
                turns: [{ role: "user", parts: [{ text:
                  "（つなぎ直しました。挨拶は 要りません。**そのまま 続けてください。**）\n"
                  + "目的:「" + st.goal + "」\n"
                  + "済んだ: " + 済2 + " / " + st.plan.length + " 件\n"
                  + "のこり:\n" + 残2.map(function (x, i) { return (i + 1) + ". " + x; }).join("\n")
                  + "\n★ **済んだ件を もう一度 やらないでください。**"
                  + "のこりの 1 件目から 取りかかり、終わるたびに stepDone を 呼びます。" }] }],
                turnComplete: true } }));
              noteEv("★ 繋ぎ直したので 残り " + 残2.length + " 件を 渡し直した");
            }
            促しを仕込む(1200); 言い直した = true;
          } catch (e) {}
        }
        if (!言い直した && (!st.endAt || !st.greeted)) {
          st.greeted = true;
          try {
            ws.send(JSON.stringify({ clientContent: {
              turns: [{ role: "user", parts: [{ text: "（挨拶して、短く用件を聞いてください）" }] }],
              turnComplete: true } }));
          } catch (e) {}
        }
        return;
      }
      /* ══ 切る予告（goAway）を受けたら、**切れる前に**繋ぎ替える ══════
         実測 2026-08-15: Google は接続を切る **50 秒前**に
           goAway { timeLeft: "50s" }
         を送ってくる。前はこれを見ていなかったので、
         そのまま切られて 1008（予告を無視した）になり、会話が途切れていた。
         予告を受けたら、こちらから静かに繋ぎ替える。切れ目は見えない。 */
      /* 持ち越しの札。切れる前に必ず控えておく。 */
      if (m.sessionResumptionUpdate) {
        if (m.sessionResumptionUpdate.newHandle) st.resume = m.sessionResumptionUpdate.newHandle;
        return;
      }
      if (m.goAway) {
        var leftMs = st.endAt - Date.now();
        /* ★ 何区間目かを 記録する（2026-08-20・訴え「6 区間 60 分」）。
           繋ぎ替えが 起きているのか 起きていないのかが、
           これまで **どこにも 残っていなかった**。 */
        st.区間 = (st.区間 || 1) + 1;
        noteEv("★ 区間 " + st.区間 + " へ 繋ぎ替え（開始から "
          + Math.round((Date.now() - (st.openAt || Date.now())) / 60000) + " 分 ／ のこり "
          + Math.round(leftMs / 60000) + " 分）");
        if (leftMs > 8000) {
          st.redial = 0;                 /* 予告どおりの繋ぎ替えは失敗ではない */
          st.handoff = true;
          try { ws.close(); } catch (e) {}
          setTimeout(function () {
            if (!st.on) return;
            go().catch(function (e9) { 繋ぎ直しを頼む(e9); });
          }, 300);
        }
        return;
      }
      /* ══ 声で画面を開く（2026-08-15）═══════════════════════════════
         Lumi が「開いて」と決めたら、ここで実際に開く。
         ★ 開ける先は **サーバが並べたものだけ**。名前が違えば何もしない。
         ★ 開いたことを必ず返事する（返さないと Lumi が待ち続ける）。 */
      if (m.toolCall && m.toolCall.functionCalls) {
        /* ★ 道具は **待つことがある**（押したあとの画面を見てから返すため）。
           全部そろってから 1 通で返す。
           ★★ ただし **返さないまま になっては いけない**（2026-08-20・訴え
             「なんで 1 回 返事して 島に 何も 出なくなって、固まるんだろう」）。
             道具の 返事は 番を 止める。返さなければ 向こうは **永久に 待つ**。
             画面には 何も 出ず、考え中の 音だけが 鳴り続ける。
             ＝ 訴えの ふたつは **同じ 根**だった。
             だから どんな 道具にも 締め切りを 置き、**必ず 何かを 返す**。 */
        Promise.all(m.toolCall.functionCalls.map(function (fc) {
          var 包む = function (v) {
            if (v && typeof v === "object") {
              if (fc.name !== "finishTask") v = withGoal(v);
              return { id: fc.id, name: fc.name, response: v };
            }
            return { id: fc.id, name: fc.name,
                     response: { result: v ? "できました" : "できませんでした" } };
          };
          var r;
          try { r = doTool(fc.name, fc.args || {}); }
          catch (e) { r = { だめ: "うまくいきませんでした" }; }
          return new Promise(function (done) {
            var 済 = false;
            var 出す = function (v) { if (済) return; 済 = true; done(包む(v)); };
            var 締切 = 道具の締め切り(fc.name, fc.args || {});
            var 時計 = setTimeout(function () {
              noteEv("✗ 道具「" + fc.name + "」が " + Math.round(締切 / 1000)
                + " 秒 返ってきません。時間切れとして 返します（固まらせない）。");
              try { 作業の打ち切り("道具の 時間切れ"); } catch (x) {}
              出す({ だめ: "「" + fc.name + "」は " + Math.round(締切 / 1000)
                       + " 秒 待っても 終わりませんでした。",
                     つぎ: "**できたと 言わないでください。**"
                       + "何が 起きたか 分からないので、利用者に 一言 断ってから "
                       + "別のやり方を 試すか、そのまま 会話を 続けてください。" });
            }, 締切);
            Promise.resolve(r).then(
              function (v) { clearTimeout(時計); 出す(v); },
              function () { clearTimeout(時計); 出す({ だめ: "うまくいきませんでした" }); });
          });
        })).then(function (resps) {
          try { ws.send(JSON.stringify({ toolResponse: { functionResponses: resps } })); } catch (e) {}
          /* ★ **道具の 答えを 返したのに 黙る**（2026-08-29・訴え）。
             「聞いています」の まま 止まり、こちらから 一言 言わないと
             動き出さない。番が 終わっていないので 促し（続きを促す）は
             作りかけの 書類が あるときしか 動かず、ここは 素通りだった。
             だから **返しっぱなしを 見張る** 別の 時計を 置く。 */
          try { 返事の見張りを仕込む(resps); } catch (e) {}
        });
        return;
      }
      st.aliveAt = Date.now();          /* 何か届いた＝繋がりは生きている */
      var sc = m.serverContent;
      if (!sc) return;

      /* 割り込まれた → 鳴らしかけの声をすぐ捨てる */
      if (sc.interrupted) {
        st.lastCut = Date.now(); st.probeNg = 0; st.probeUntil = 0;
        clearTimeout(st.tProbe);
        try { duck(1); } catch (e) {}
        noteEv("★ 声を止めた（向こうが遮った）鳴り始めから "
          + Math.round((Date.now() - (st.speakAt || Date.now())) / 100) / 10 + " 秒");
        try { st.spk.port.postMessage({ type: "clear" }); } catch (e) {}
        setMuted(false); talkEdge(false);
        st.inTurn = false;
        /* ══ ★★ ここが 「ずっと 考えています」の 正体（2026-08-20・訴え）══
           文字で 送ると 作業開始("考えています") で 帯と 音が 立つ。
           畳むのは 「声が 返り始めた」と 「番が 終わった」の 2 か所だけ。
           ところが **遮られると そのどちらも 来ない**。
           つまり 割り込みが 入った 瞬間に 帯と 音が 置き去りに なり、
           45 秒の 打ち切りが 来るまで 「考えています」が 出っぱなしに なる。
           雑音で 割り込みが 起きやすい 部屋では、これが 何度も 起きる。
           ＝ 訴えの ふたつは **つながっていた**。 */
        if (st.thinking) { st.thinking = false; try { 作業終了(); } catch (e6) {} }
        /* 道具が 走っていないのに 音だけ 残っているなら、そこで 断ち切る。 */
        if (!st.workN && st.workSrc) { try { 作業音(false); } catch (e7) {} }
        say("聞いています");      /* 言葉も消える（say は state に切り替える） */
        return;
      }
      /* こちらの声が文字になった＝話している。沈黙の時計を戻す。 */
      if (sc.inputTranscription && sc.inputTranscription.text) {
        /* こちらが実際に話した＝会話が始まった。以後、時間では切らない。 */
        st.talked = true;
        /* ★ 人が話したら **自動の続きは そちらへ譲る**（2026-08-17）。
           かぶせて頼むと、利用者の言葉を打ち消してしまう。 */
        st.人の番 = Date.now();
        /* 声の頼みも 覚えておく（切れたときに言い直すため）。
           声は 1 文ずつ届くので、つないで持つ。 */
        var 声 = String(sc.inputTranscription.text || "");
        if (!st.未処理 || st.未処理.動いた || Date.now() - st.未処理.at > 20000)
          { st.未処理 = { 文: 声, at: Date.now(), 動いた: false, 声: true };
            st.仕事おわり = false; st.促し回 = 0; st.空回り = 0; st.促し時の道具回 = st.道具回 || 0;
            /* ★ 声で話しかけられた時点で 自動の催促は止める（2026-08-17・訴え）。 */
            st.作りかけ = null;
            try { 促しを止める("人が話しかけた"); } catch (e9) {} }
        else { st.未処理.文 = (st.未処理.文 + 声).slice(-600); st.未処理.at = Date.now(); }
        /* ★ 覚え書きの材料。**こちらが何を頼んだか**が いちばん大事
           （Lumi の相づちだけ残しても、翌日 役に立たない）。 */
        st.mine = (st.mine || []).concat([String(sc.inputTranscription.text)]).slice(-80);
        /* 会話の履歴へ。声は 1 文ずつ 途切れて届くので つなぐ。 */
        try { 履歴を書く("me", 声, false, true); } catch (e8) {}
        armSilence(SILENCE_MS);
      }

      /* ★ 返ってくる音の入れ物は 1 通りではない。
         modelTurn.parts[].inlineData のほか、部分ごとに来る版もある。
         **拾い漏らすと「文字は出るのに声が出ない」**になる。 */
      var parts = (sc.modelTurn && sc.modelTurn.parts) || [];
      if (sc.audio && sc.audio.data) parts = parts.concat([{ inlineData: sc.audio }]);
      /* ★ **音を鳴らす前に**マイクを止める（2026-08-16）。
         前は 1 かたまりごとに止めていたので、最初のかたまりを鳴らす
         その瞬間だけ、こちらの音が向こうへ流れていた。
         スピーカーだと そこで自分の声を送り返し、止められる。 */
      /* ★ **返事が本当に終わったか**は 向こうが教えてくれる。
         音が尽きたかどうかで判じてはいけない（2026-08-16）。
         文の切れ目には 1 秒近い間が空くことがあり、そこで
         「終わった」とみなしてマイクを開けると、スピーカーから出ている
         Lumi 自身の声を送り返し、**向こうが Lumi を止める**。
         実測: 5.2 秒で遮られ、「冬は雪遊び」で切れた。 */
      if (sc.turnComplete || sc.generationComplete) {
        st.turnDone = true;
        st.inTurn = false;               /* 組み立て終わり（送り込んでよい） */
        /* ★ 返事が終わった **直後**に、いまの画面を 1 回だけ送る。
           次に聞かれるときには 最新が入っている。 */
        clearTimeout(st.tPush);
        st.tPush = setTimeout(function () { pushScreen(true); }, 900);
      }
      if (parts.length) {
        st.turnDone = false;             /* まだ喋っている */
        st.inTurn = true;                /* 返事を組み立てている（送り込み禁止） */
        st.turnAt = Date.now();
        var hasAudio = false;
        for (var z2 = 0; z2 < parts.length; z2++) {
          var d2 = parts[z2].inlineData || parts[z2].inline_data;
          if (d2 && d2.data) { hasAudio = true; break; }
        }
        if (hasAudio) st.audioAt = Date.now();
        /* 声が返り始めた＝考え終わり。作業中の帯と音を畳む。 */
        if (st.thinking) { st.thinking = false; 作業終了(); }
        /* ★ 声が 出ているのに 考え中の 音が 鳴っているのは 明らかに おかしい
           （2026-08-20）。数が 合っていなくても **音だけは 止める**。 */
        if (hasAudio && st.workSrc) { try { 作業音(false); } catch (e7) {} }
        if (hasAudio && !st.speaking && Date.now() > (st.probeUntil || 0)) {
          setMuted(true); talkEdge(true); st.speakAt = Date.now();
          st.echo = undefined; st.echoN = 0;
        }
      }
      for (var i = 0; i < parts.length; i++) {
        var d = parts[i].inlineData || parts[i].inline_data;
        if (!d || !d.data) continue;
        /* ★ 打ち切った番の 遅れて届いた音は鳴らさない（2026-08-16）。
           捨てた直後に 古い声が続きで鳴ると、割り込んだ意味が無くなる。 */
        if (st.cutAt && st.turnAt && st.turnAt < st.cutAt) continue;
        var bin = root.atob(d.data);
        var buf = new ArrayBuffer(bin.length);
        var v = new Uint8Array(buf);
        for (var k = 0; k < bin.length; k++) v[k] = bin.charCodeAt(k);
        try { st.spk.port.postMessage({ type: "pcm", buf: buf }, [buf]); } catch (e) {}
      }
      /* ★ 言葉は **来たそばから**足す。言い終わりを待たない。 */
      if (sc.outputTranscription && sc.outputTranscription.text) {
        /* ★ **Lumi が 喋った時点で「会話は 始まっている」**（2026-08-20）。
           もとは 利用者の声が 文字に なったときだけ st.talked を 立てていた。
           ところが 板の解説中は こちらの マイクを 止めるし、
           聞いているだけの ときも 文字は 来ない。すると
           「まだ 一言も 交わしていない」扱いのまま **20 秒の 短い時計**が 走り、
           黙って 聞いていると そこで 切れる。
           ＝「2 回目以降 会話が 途中で 切れる」の 一因。 */
        if (!st.talked) { st.talked = true; noteEv("★ 会話が 始まった（Lumi が 喋った）"); }
        /* 覚え書きの材料。**送らない限りどこへも出ない**（閉じるときに要約だけ送る） */
        st.said = (st.said || []).concat([String(sc.outputTranscription.text)]).slice(-160);
        said(sc.outputTranscription.text, st.inTurn);
        st.inTurn = true;
      }
      if (sc.turnComplete) {
        st.inTurn = false;
        st.probeNg = 0;                    /* 番が変われば また試せる */
        if (st.loudest) {
          noteEv("この返事の間、こちらの声の最大は " + st.loudest.toFixed(3)
            + "（線 " + Math.max(マイクの感度(), (st.echo || 0) * 2.8).toFixed(3)
            + " / 感度の下限 " + マイクの感度().toFixed(3) + "）");
          st.loudest = 0;
        }
        /* ★ 保険。ここまでに畳めていなければ 必ず畳む
           （鳴りっぱなしにするのが いちばん困る） */
        if (st.thinking) { st.thinking = false; 作業終了(); }
        /* 解説の 進行は 返事の 終わりで 次へ 進む（かぶせない）。 */
        /* ★ **いま 走っている 解説の 合図だけ** 受ける（2026-08-20）。
           止めた回・前の回の 合図で 先へ 進めない。 */
        if (解説 && 解説.合図 && !解説.止めた) {
          var f0 = 解説.合図; 解説.合図 = null; 解説.合図番 = 0;
          try { f0(); } catch (e00) {}
        }
        armSilence(SILENCE_MS);
        /* ★ **番が終わった直後に、いまの画面を静かに置いておく**（2026-08-16）。
           利用者の判断で 画面の共有（キャスト）はやめた（許可と帯が邪魔）。
           それでも「何回も言わないと動かない」を直すには、
           Lumi が **こちらから言わなくても画面を知っている**必要がある。
           ★ 前に失敗したのは **番の途中**に差し込んだから（返事が返らなくなった）。
             ここは 向こうが言い終わって 完全に手が空いた瞬間なので、
             いちばん安全な差し込み場所。返事も求めない（turnComplete:false）。
           ★ 中身が変わっていないときは送らない。記録を汚さないため。 */
        setTimeout(画面をそっと置く, 400);   /* 保険。ふつうは喋り終わりで置く */
        /* ★★ **仕事が残っているなら、こちらから次を頼む**（2026-08-17）。
           ここが無かったので、1〜2 手 打っては止まり、利用者が
           そのつど返事をしないと 先へ進まなかった。 */
        促しを仕込む(1500);
      }
    };
    ws.onerror = function () {
      if (世代 !== st.世代) return;                 /* 見切られた 古い 試み */
      if (!opened) { say("つながりませんでした"); setTimeout(close, 1500); }
    };
    ws.onclose = function (e) {
      /* ★ **古い 繋ぎの 後始末で 二重に 立て直さない**（2026-08-20）。
         見張りが 見切った あとに 古い口が 閉じると、ここと 見張りの
         両方が 繋ぎ直しを 仕掛け、口が 2 本 立つ。 */
      if (世代 !== st.世代) { noteEv("（古い 繋ぎが 閉じた。何もしない）"); return; }
      /* ══ 枠切れなら **別の鍵で取り直す**（2026-08-16）════════════════
         ★ 枠は 鍵ごとに別。1 本目が尽きても、ほかの鍵はまだ使える。
           トークンの発行は枠を使わないので、発行は通ってしまい、
           **会話を始めてから**落ちる。ここで気づいて替える。 */
      var why = String((e && e.reason) || "");
      st.最後の切れ = (e && e.code ? e.code + " " : "") + why.slice(0, 120);
      /* ★ **setup まで 行けなかった＝その鍵では 話せない**（2026-08-28）。
         理由の 字で 見分けようとして 失敗していた（"denied access" は
         quota でも billing でもないので すり抜けていた）。
         行けなかったのなら 理由が 何であれ 別の鍵を 試す。
         ここを 字で 判じないのが 肝。 */
      if (!ready && st.on && st.keyIndex >= 0
          && (st.badKeys || []).indexOf(st.keyIndex) < 0) {
        st.badKeys = (st.badKeys || []).concat([st.keyIndex]);
        鍵控えに足す(st.keyIndex, why);
        noteEv("鍵 " + st.keyIndex + " では 話せなかった（" + (e && e.code) + " "
          + why.slice(0, 60) + "）。別の鍵で 取り直す（"
          + st.badKeys.length + "/" + st.keyCount + "）");
        if (st.badKeys.length < (st.keyCount || 1)) {
          setTimeout(function () { if (st.on) go().catch(function (e9) { 繋ぎ直しを頼む(e9); }); }, 400);
          return;
        }
        /* ★ **1 日の上限ではない**（2026-08-16 実測）。1 分ほどで戻る。
           全部の鍵が同時に混んでいるだけなので、少し待って もう一度試す。
           ここで「今日はおしまい」と言うのは 間違い（実際に言っていた）。 */
        st.badKeys = [];
        /* ★ **待って直るものと 直らないものを 分ける**（2026-08-28）。
           「混んでいる（quota）」は 1 分ほどで 戻るので 待つ値打ちがある。
           「出入り禁止（denied）」は 鍵そのものが 死んでいるので、
           何秒 待っても 戻らない。前は どちらも 60 秒 待たせていた。 */
        var 直らない = /denied|permission|forbidden|unregistered|invalid|expired|API key/i.test(why);
        if (直らない) {
          noteEv("★ 全部の鍵が 出入り禁止。待っても 戻らないので 終わる: " + why.slice(0, 90));
          say("いま音声会話を 使えません。しばらくしてから もう一度 呼んでください。");
          setTimeout(close, 2200);
          return;
        }
        st.waitN = (st.waitN || 0) + 1;
        if (st.waitN <= 3) {
          say("すこし混んでいます。10 秒だけ待ってね");
          noteEv("全部の鍵が混んでいる。" + (st.waitN * 10) + " 秒待って もう一度");
          setTimeout(function () { if (st.on) go().catch(function (e9) { 繋ぎ直しを頼む(e9); }); },
            st.waitN * 10000);
          return;
        }
        say("いま混み合っています。少ししてから もう一度ためしてね");
        setTimeout(close, 1800);
        return;
      }
      /* ★ 検索を付けていて 繋がる前に閉じたなら、**理由を問わず**外して試す。
         （検索が使えないとき "quota exceeded" と返るので、
           理由で見分けようとすると 永久に外れない。実測で踏んだ） */
      if (!ready && !st.noSearch && st.on && root.VQ_SEARCH) {
        st.noSearch = true;
        noteEv("検索つきで断られたので 外して繋ぎ直す");
        setTimeout(function () { if (st.on) go().catch(function (e9) { 繋ぎ直しを頼む(e9); }); }, 300);
        return;
      }
      if (!st.on) return;
      /* ══ 上限までは **黙って繋ぎ直す**（2026-08-15）════════════════
         ★ Live の接続そのものが、10 分より前に切れることがある
           （1 接続の寿命は 10 分ほどだが、それより早いこともある）。
           前はそこで会話ごと終わっていたので、**話している最中に
           いきなり終わる**ように見えていた。
         ★ 10 分の上限まではこちらから繋ぎ直す。利用者には切れ目が見えない。
         ★ 何度も失敗するなら諦める（黙って永久に繋ぎ直さない）。 */
      /* ══ ★ **仕事の途中なら もっと粘る**（2026-08-17・実測で分かった致命傷）
         ★ ここには 2 つの打ち切りがあった。
             ① 繋ぎ直しは 4 回まで（st.redial > 3 で close）
             ② 会話全体に 10 分の締切（st.endAt）
           どちらも ふつうの雑談なら妥当だが、**10 枚の資料を作る**ような
           仕事では 必ず途中で死ぬ。
           実測: 10 枚を頼んだ 10 分間、1008 が 3 回続いて そこで会話ごと終わり、
           道具が 1 つも動かなかった（利用者からは「何も作れていない」に見える）。
         ★ 仕事（st.goal）が走っている間は
             ・繋ぎ直しの上限を 12 回まで伸ばす
             ・締切を そのつど 10 分 先へ延ばす
           仕事が終われば（finishTask）元の短い決まりへ戻る。
         ★ 際限なく粘らせない。上限を超えたら **正直に終わる**。 */
      /* ★ 上限を 60 分ぶんへ 広げた（2026-08-19・利用者の指示
         「60 分 セッションを 続かせるために、切り替えを なめらかに」）。
         1 本 10 分 × 6 本 ＝ 最低 6 回。混み合いで 失敗する ぶんも見て、
         ふつうの会話 20 回・仕事中 40 回まで 粘る。
         **落ち着いた接続は 上の t安定 で 0 に戻る**ので、これは
         「続けて 失敗した数」に 近い意味になる。 */
      var 仕事中 = !!st.goal;
      var 上限 = 仕事中 ? 40 : 20;
      var left = st.endAt - Date.now();
      if (仕事中 && left < 60000) {
        st.endAt = Date.now() + 600000;
        left = st.endAt - Date.now();
        noteEv("★ 仕事の途中なので 会話の締切を 10 分のばした");
      }
      if (left < 5000) { close(); return; }
      if (st.redial > 上限) {
        /* ★ 上限に 達しても **すぐには 終わらない**（2026-08-19）。
             訴え「60 分 しっかり 繋がったままにしたい」。
             続けて 失敗する ときは たいてい 向こうが 混んでいるだけなので、
             10 秒 待って 数を 0 に戻し、もう一度 始めから 試す。
             それを 3 巡 やってだめなら 正直に 終わる（黙って 粘り続けない）。 */
        st.巡 = (st.巡 || 0) + 1;
        /* ★ 3 巡は 長すぎた（2026-08-19・訴え「ずっと 繋ぎ直しています に なる」）。
           1 巡 ＝ 上限まで（20 回、待ち時間の合計 で 1 分半ほど）。
           3 巡だと 5 分 近く 同じ字を 出したまま になる。
           **2 巡まで**にして、そのあとは 正直に 終わる。 */
        if (st.巡 > 2) {
          noteEv("★ 繋ぎ直しを " + st.巡 + " 巡 試してだめだったので終わる");
          say("つながりませんでした。もう一度 呼んでください。");
          setTimeout(close, 1200); return;
        }
        noteEv("★ 上限（" + 上限 + " 回）に達した。10 秒 待って " + st.巡 + " 巡目を 始める");
        say("つながりにくいので、少し待って もう一度 試します");
        st.redial = 0;
        setTimeout(function () {
          if (!st.on) return;
          go().catch(function (e9) { 繋ぎ直しを頼む(e9); });
        }, 10000);
        return;
      }
      /* 予告どおりの繋ぎ替えなら、もう次を仕掛けてある。何も出さない。 */
      if (st.handoff) { st.handoff = false; return; }
      st.redial = (st.redial || 0) + 1;

      /* ══ ★ 「一度も つながっていない」ときは **早く 諦める**
         （2026-08-19・訴え「ずっと 繋ぎ直しています に なってしまう」）

         2 つを 混ぜていた:
           ① つながってから 切れた … 10 分の 寿命。**何度でも 繋ぎ直してよい**
           ② 一度も つながっていない … 鍵・枠・回線の 問題。
              何度 やっても 同じなので、粘るほど 待たせるだけ。
         ②を ①と 同じ 20 回 粘らせていたので、**1 分半 も
         「つなぎ直しています…」が 出たまま**になっていた。
         ②は 5 回で 打ち切り、**理由を そのまま 伝える**。 */
      if (!ready) {
        st.つながらず = (st.つながらず || 0) + 1;
        if (st.つながらず >= 5) {
          var 訳 = String((e && e.reason) || "").slice(0, 120);
          noteEv("★ 一度も つながらないまま 5 回。理由=" + (e && e.code) + " " + 訳);
          say(/quota|exceeded|billing/i.test(訳)
                ? "いま 混み合っています。少ししてから もう一度 呼んでください。"
                : "つながりませんでした。電波を 確かめて、もう一度 呼んでください。");
          setTimeout(close, 1600);
          return;
        }
      } else { st.つながらず = 0; }

      /* 何度も 同じ字を 出さない（出しっぱなしに 見える）。 */
      if (st.redial <= 2) say("つなぎ直しています…");
      else if (st.redial % 5 === 0) say("つなぎ直しています…（" + st.redial + " 回目）");
      setTimeout(function () {
        if (!st.on) return;
        go().catch(function (e9) { 繋ぎ直しを頼む(e9); });
      }, 400 * st.redial);
    };

    /* 鳴らし終わったらマイクを戻す */
    st.spk.port.onmessage = function (e) {
      /* 鳴らし残しの量（マイクを開けてよいかの判断に使う） */
      if (e && e.data && e.data.type === "level") {
        st.spkMs = e.data.ms || 0;
        if (st.spkMs > (st.maxSpk || 0)) st.maxSpk = st.spkMs;   /* いちばん溜まった量 */
        return;
      }
      /* ★ 溢れて捨てたときは 黙って見過ごさない（起きているかを知るため） */
      if (e && e.data && e.data.type === "drop") {
        st.dropMs = (st.dropMs || 0) + (e.data.ms || 0);
        noteEv("✗ 音を " + e.data.ms + " ミリ秒 捨てた（帯が足りない・累計 " + st.dropMs + "）");
        return;
      }
      if (e && e.data && e.data.type === "idle") {
        /* ★ 音が尽きただけでは開けない。**返事が終わった印**が要る。
           そうしないと 文の切れ目のたびにマイクが開いて遮られる。 */
        if (!st.turnDone) return;
        setMuted(false); talkEdge(false);
        st.inTurn = false;
        if (st.on) say("聞いています");
      }
    };
    /* 鳴らし残しを 0.4 秒ごとに聞く（開けてよいかの判断に使う） */
    clearInterval(st.iLevel);
    clearInterval(st.iStuck);
    clearInterval(st.iSync);
    st.iLevel = setInterval(function () {
      try { if (st.spk) st.spk.port.postMessage({ type: "level" }); } catch (e) {}
    }, 400);

    /* マイクの音を送る */
    st.micNode.port.onmessage = function (e) {
      /* ══ 覚えておいた 直近の声（先出し）════════════════════════════
         ★ 割り込みだと 分かった瞬間に worklet へ flush を頼み、
           ここへ 返ってくる。**生の声より 先に** 送る。
           これで 言葉の 頭から 向こうへ 届く（＝1 回で 通る）。 */
      if (e.data && e.data.type === "preroll") {
        var pb = e.data.buf;
        st.先出し中 = false;
        if (st.t先出し) { clearTimeout(st.t先出し); st.t先出し = 0; }
        try {
          if (pb && pb.byteLength >= 3200 && ready && st.ws && st.ws.readyState === 1) {
            var pu = new Uint8Array(pb), ps = "";
            for (var pi = 0; pi < pu.length; pi += 0x8000) {
              ps += String.fromCharCode.apply(null, pu.subarray(pi, pi + 0x8000));
            }
            st.ws.send(JSON.stringify({ realtimeInput: {
              audio: { mimeType: "audio/pcm;rate=16000", data: root.btoa(ps) } } }));
            st.sentAt = Date.now();
            noteEv("★ 言葉の頭 " + (e.data.ms || 0) + "ms を 先に送った");
          }
        } catch (px) { st.先出し中 = false; }
        return;
      }
      /* 音の大きさの知らせ（話しているかの判断に使う） */
      if (e.data && e.data.type === "level") {
        /* 少しでも動いたら「マイクは生きている」 */
        if (e.data.rms > 0.0008) { st.micMoved = true; st.micTries = 0; }
        var rms = e.data.rms || 0;
        var loud = rms > 0.012;
        if (loud) {
          /* ★ ここでは送らない（2026-08-16 に取り消した）。
             話し始めた瞬間に差し込むと、その番の途中に入ってしまい、
             **返事が返ってこなくなる**。送るのは 返事が終わってから。 */
          st.heard = true; st.heardAt = Date.now();
          /* 文字起こしが遅れても、はっきり声を出していれば会話が始まっている */
          if (rms > 0.03) st.talked = true;
        }
        else if (st.heard && Date.now() - st.heardAt > 900) st.heard = false;
        /* ══ こちらが話し始めたら **Lumi を黙らせる**（割り込み）══════════
           ★ Lumi が話している間、こちらの声を捨てていたので
             「喋ってるのに反応しない」になっていた（実測の訴え）。
           ★ ただし **Lumi の声を拾っただけ**で黙らせてはいけない。
             スピーカーの音は小さめに入るので、**はっきり大きいとき**だけ。
             さらに、ぱっと大きくなった 1 回では動かず、続いたときだけ。 */
        /* ══ 割り込みの判定（2026-08-16 に厳しくした）════════════════
           ★ ここが甘いと、スピーカーから出た **Lumi 自身の声**を
             「利用者が話しかけた」と誤解して、鳴らしかけの声を捨てる。
             ＝「途中で止まる」「飛び飛びになる」。
           ★ 3 つ厳しくした:
             ・大きさの線を 0.05 → 0.10（自分の声の回り込みより上）
             ・続く長さを 0.3 秒 → 0.6 秒
             ・**喋り始めの 0.8 秒は割り込みを見ない**
               （鳴り始めは音が大きく、いちばん誤りやすい） */
        /* ══ 割り込みの判じかた（2026-08-16 に作り直した・重大）════════
           ★ 訴え「喋った瞬間に止まる」が **固定の線では直らなかった**。
             スマホはスピーカーと口が近いので、Lumi 自身の声が
             どんな固定値も超えてくる。iPhone の反響消しは
             Web Audio の音を消せないので、設定でも直らない。
           ★ そこで **回り込みの大きさを その場で測る**。
             Lumi が喋っている間に入ってくる音の平均＝回り込みの量。
             利用者の声は それより **はっきり大きい**はず。
             線を「回り込みの 3.5 倍」に置けば、端末や音量が変わっても付いていく。
           ★ 迷ったら **切らない**。切って困るのは利用者、切らずに困るのは
             「言いかぶせられない」だけ。害の大きさが違う。 */
        var 鳴り始めから = Date.now() - (st.speakAt || 0);
        if (e.data.muted) {
          /* 回り込みの量を ゆっくり学ぶ（急に上げない） */
          /* ★ 回り込みの学習に **利用者の声を混ぜない**（2026-08-16）。
             これまで muted 中の音を何でも平均していたので、こちらが喋ると
             その声が見積りを押し上げ、**線が声を追い越して**
             いつまでも割り込めなかった（式を数値で回して確認）。
             明らかに大きい音は「声」とみなして学習に入れない。 */
          /* ══ ★ ここが 「1 回 言っても 反応しない」の 正体（2026-08-19）══
             前は **いちばん最初の 1 かたまりを そのまま** 回り込みの
             大きさとして 採っていた（st.echo === undefined のとき）。
             回り込みの見積りは Lumi が 喋り出すたびに 捨てられるので、
             **その瞬間に こちらが 話していると、自分の声が
             「回り込み」として 学習される**。
             線は その 2.8 倍に 置かれるので、
             たとえば 0.09 で 話していた人の 線は 0.25 になり、
             **その番の あいだ 二度と 割り込めない**。
             「え？」と 言い直すと、そのころには 番が 変わって
             見積りが 作り直されるので 通る ＝「あーごめんごめん」。

             直しかた: 回り込みは **その場の 下限**（いちばん静かなとき）。
             声は そこに 足されるだけなので、
               ・下がるときは 速く 追う
               ・上がるときは ごく ゆっくり
             にすれば、こちらが 話しても 押し上げられない。
             さらに 最初の 5 かたまりは **小さいほう**を 採る。 */
          /* ══ ★★ **番ごとに 作り直さない**（2026-08-20・実測で 見つけた）══
             2026-08-19 に「最初の 5 かたまりは 小さいほうを 採る」と 直したが、
             **1 個目は 素通し**のままだった:
                 if (st.echo === undefined) { st.echo = rms; ... }
             回り込みの 見積りは Lumi が 喋り出すたび（＝ 番ごと）に
             undefined へ 戻されるので、**その瞬間に こちらが 話していると
             自分の 声が そのまま 回り込みに なる**。
             線は その 2.8 倍。0.04 で 話す人の 線は 0.112 に なり、
             その番の あいだ 一度も 割り込めない。
             実測（vqlivenoise ⑥）: 静かな 部屋の 0.04 が 1 度も 通らなかった。

             ★ 直しかた: 回り込みは **この端末の 漏れぐあい**であって、
               番ごとに 変わるものでは ない。**番をまたいで 持つ。**
               ・下がるときは 速く（静かに なったら すぐ 追う）
               ・上がるときは ほどほど（漏れる端末には 数秒で 追いつく／
                 人の 声は とぎれるので 押し上げきれない）
               1 かたまりでは ほとんど 動かないので、話しかけている 最中に
               Lumi が 喋り出しても 線は 上がらない。 */
          st.漏れ窓 = st.漏れ窓 || [];
          st.回り込み = 底(st.漏れ窓, rms);
          st.echo = st.回り込み; st.echoN = 5;
        } else {
          st.echo = undefined; st.echoN = 0;
          /* ══ ★ 部屋の 静けさ を 覚える（2026-08-20・訴え
             「返答中に 周囲の 雑音や 声を 聞き取ってしまう」）════════════

             これまで 割り込みの 線は 「感度（既定 0.026）」と
             「回り込みの 2.8 倍」だけで 決めていた。
             回り込みは **Lumi が 喋っている 間しか** 測れないので、
             エコー消しが 効いている 端末では ほぼ 0 に なり、
             線は **0.026 に 張り付く**。
             扇風機・テレビ・となりの 話し声は これを 軽く 超えるので、
             100ms でも 超えたら マイクが 開き、
             溜めておいた 1.2 秒＋2.5 秒 を まとめて 向こうへ 送っていた。
             向こうは それを 「人が 話しかけた」と 判じて 自分の 声を 止める。

             直しかた: **Lumi が 黙っている 間の 静けさ**を 覚えて、
             線の 下限に 足す。静かな 部屋では 0 に 近いので これまでどおり、
             うるさい 部屋では その ぶん 線が 上がる。
             上げるのは ごく ゆっくり・下げるのは 速く（＝ 静かなときの 値に 寄る）
             ので、人の声で 押し上げられない。 */
          st.部屋窓 = st.部屋窓 || [];
          st.部屋 = 底(st.部屋窓, rms);
          st.部屋N = 8;
        }
        /* ★ 下限を 0.14 → 0.045 に下げた（2026-08-16・これが本命）。
           マイクは echoCancellation を入れて取っている（micStream）ので、
           Lumi の声はほとんど消える＝回り込みはほぼ 0。すると線は
           **下限に張り付く**。0.14 は かなりの大声でないと越えない値で、
           試験では合成音（rms 0.3〜0.5）だったので通っていたが、
           **ふつうの話し声（0.05〜0.12）では 一度も越えなかった。**
           反響消しが効いているぶん、下げても自分の声では鳴らない。
           さらに 試すあいだは自分の声を 0.3 に絞るので二重の保険。 */
        /* ★ さらに下げた: 0.045 → 感度の既定 0.026（2026-08-16 の 2 度目）。
           訴え「まだ大きく言わないと割り込めない」。0.045 は
           **ふつうの話し声の下のほう（0.05 前後）と ほぼ同じ**なので、
           少し離れて言うと届かない。反響消しが効いていて 回り込みは
           ほぼ 0 なので、下げても自分の声では鳴らない。
           ★ 端末や部屋で当たりが違うので **数値を覚えられる**ようにした。
             __vqLive.sens(0.02) のように動かすと、次からもその値を使う。 */
        /* ★ 部屋が うるさいほど 線を 上げる（2026-08-20）。
           静かな 部屋では 部屋≒0.002 なので 0.0044 にしかならず、
           これまでの 効き（感度 0.026）は そのまま。
           うるさい 部屋では 部屋≒0.02 → 0.044 に 上がるので、
           扇風機や テレビでは 開かず、人の声（0.06〜0.12）では 開く。 */
        /* ★ 上げすぎない。ふつうの 話し声は 0.05〜0.12 なので、
           部屋の ぶんで 作る 線は **0.06 まで**に 留める。
           ここに 蓋が 無いと、空振りが 続いた 部屋で
           「声を 出しても 割り込めない」に 戻ってしまう。 */
        if (st.部屋 > 0.027) st.部屋 = 0.027;
        var 部屋の線 = (st.部屋 || 0) * 2.2;
        var 線 = Math.max(マイクの感度(), (st.echo || 0) * 2.8, 部屋の線);
        /* 実際にどれくらいの大きさだったかを残す（合わないときに数字で直せる） */
        if (e.data.muted && rms > (st.loudest || 0)) st.loudest = rms;
        st.lastRms = rms; st.lastLine = 線;
        st.lastMuted = !!e.data.muted;      /* worklet が「止めている」と思っているか */
        /* 割り込みを試している間、実際に声が出ていた割合を数える */
        if (Date.now() < (st.probeUntil || 0)) {
          st.probeAll = (st.probeAll || 0) + 1;
          if (rms > 線 * 0.6) st.probeHit = (st.probeHit || 0) + 1;
        }
        if (rms > (st.maxRms || 0)) st.maxRms = rms;

        /* ══ ★ 「声は出ているのに 一言も 送れていない」を 見張る ══════
           （2026-08-19・訴え「繋ぎ直しのあと 話しかけても 無反応」）

           watchMic は **マイクが動いているか**しか 見ていない。
           詰まっているのは その先（送り口）なので、あれでは 一生 気づけない。
           送り口には 塞ぐ条件が 4 つ ある:
             st.speaking / st.先出し中 / st.jingleOn / st.barOn
           このうち 先の 3 つは **こちらの都合**で立つ印なので、
           何かの拍子に 立ちっぱなしになると **完全に 無反応**になる。
           そこで「声が 1.2 秒 続いているのに 1 度も 送っていない」を
           詰まりの合図として、印を 外して 送り直す。
           ★ 利用者が 自分で止めている（barOn / 手で止める）ときは 触らない。
              あれは 意図した 無音なので、勝手に 開けてはいけない。 */
        /* ★ 見張りは **線に 頼らない**（2026-08-19）。
           線は 回り込みの見積りから 作るので、見積りが 狂うと
           線も 狂う。狂った線で 「声が 出ていない」と 判じてしまうと、
           **狂っているときほど 助けが 来ない**。
           ここでは 端末に 依らない 素の 大きさ（感度そのもの）で見る。 */
        /* ★ 2026-08-19 は 「線に 頼るな。素の 感度で 見ろ」と した。
           狂った 線で 判じると、狂っているときほど 助けが 来ないため。
           ★ ところが 素の 感度（0.026）だけだと、**スピーカーの 漏れや
             部屋の 雑音**でも 「声が 続いている」に なり、
             6 秒おきに 塞ぎを 外して その音を 送っていた
             （実測 2026-08-20・訴え「返答中に 雑音を 聞き取ってしまう」）。
           ★ 足すのは 底（部屋の 静けさ）だけ。これは **推し量りでは なく
             実測の 最小値**なので、高いときは 本当に うるさい。
             回り込みの 見積りは **ここでは 使わない** — あれは Lumi が
             喋っている 間に 測るもので、詰まりが 起きるのも まさに その間。
             詰まっているときの 値で 詰まりを 判じては いけない。
           ★ そのうえで **「ふつうに 喋っている 間」と 「本当に 詰まっている」を
             分ける**。ふつうの 返事の 間は 音が 次々 届く。
             詰まっているときは 届かない。時間で 分ければ 線に 頼らずに 済む。 */
        var 素の線 = Math.max(マイクの感度(), (st.部屋 || 0) * 2.2);
        if (rms > 素の線) st.voiceAt = Date.now();
        if (rms > 素の線) { if (!st.声始) st.声始 = Date.now(); }
        else if (Date.now() - (st.voiceAt || 0) > 400) st.声始 = 0;
        /* ══ ★★ ここは **暴走しやすい**（2026-08-19・入れた直後に 訴えが 出た）
           「Lumi が ずっと 繋ぎ直しています に なってしまう」。

           元は「声が 1.2 秒 続いているのに 送れていない」だけを 見ていた。
           ところが:
             ・**塞いでいる印が 1 つも 無いとき**にも 当たる。
               その場合 印を 外しても 何も 変わらず、次の 1.2 秒でも また 当たる。
             ・当たるたびに flush を 投げる。flush は **溜めておいた 1.2 秒ぶんの音**を
               まとめて 送る。うるさい部屋では これが **1.2 秒おきに 永久に 続き**、
               送りすぎで 向こうから 切られる → 繋ぎ直す → また 送りすぎ、の輪になる。

           直しかた:
             ① **本当に 塞がっているときだけ**（speaking / 先出し中 / jingleOn の
                どれかが 立っているときだけ）動く。
             ② **6 秒に 1 回まで**。続けて 何度も 外さない。
             ③ flush は **1 回だけ**（続けて 投げない）。 */
        var 塞がっている = !!(st.speaking || st.先出し中 || st.jingleOn);
        /* ★ 「喋っている」で 塞がっているだけなら **ふつうの 返事**かもしれない。
           そのときは 音が 次々 届いているはず。2.5 秒 届いていなければ
           **もう 喋っていないのに 塞がったまま** ＝ 本当の 詰まり。
           （2026-08-20・訴え「返答中に 雑音を 聞き取ってしまう」。
             もとは ふつうの 返事の 最中でも、部屋の音が 0.026 を 超えて
             1.2 秒 続けば 6 秒おきに 塞ぎを 外して その音を 送っていた。） */
        var 本当に詰まり = (!st.speaking) || (Date.now() - (st.audioAt || 0) > 2500);
        if (塞がっている && 本当に詰まり && st.声始 && Date.now() - st.声始 > 1200
            && Date.now() - (st.sentAt || 0) > 1200
            && Date.now() - (st.詰まり時 || 0) > 6000
            && !st.barOn && !手で止めているか()
            && st.ws && st.ws.readyState === 1) {
          st.詰まり時 = Date.now();
          noteEv("✗ 声が " + Math.round((Date.now() - st.声始) / 100) / 10
            + " 秒 続いているのに 何も 送れていない → 塞ぎを 外す"
            + "（喋り=" + !!st.speaking + " 先出し=" + !!st.先出し中
            + " 効果音=" + !!st.jingleOn + "）");
          st.speaking = false; st.先出し中 = false; st.jingleOn = false;
          st.probeNg = 0; st.probeUntil = 0; st.bargeN = 0;
          /* ★ 見積りは **捨てない**（捨てると 次の 1 かたまりが そのまま
             見積りに なり、話している 最中なら 自分の声を 学び直す）。
             感度まで 下へ 寄せるだけに する（2026-08-20）。 */
          /* ★ 見積りが 高止まりして 詰まっていたのかもしれない。
             ただし **窓を 空にしては いけない**（実測 2026-08-20）。
             空にすると 次の 1 かたまり ＝ **いま 話している 声**が
             そのまま 底に なり、線が その 2.8 倍まで 跳ね上がる。
             静けさを 1 つ 入れて 底だけ 下げる。 */
          st.漏れ窓 = st.漏れ窓 || [];
          st.漏れ窓.push(マイクの感度() * 0.2);
          if (st.漏れ窓.length > 底の数) st.漏れ窓.shift();
          st.回り込み = 底(st.漏れ窓, マイクの感度() * 0.2);
          st.echo = st.回り込み;
          if (st.tMute) { clearTimeout(st.tMute); st.tMute = 0; }
          if (st.t先出し) { clearTimeout(st.t先出し); st.t先出し = 0; }
          try { duck(1); } catch (dx) {}
          try { st.micNode.port.postMessage({ type: "mute", on: false }); } catch (mx) {}
          /* 詰まっている間の 声も 拾い直す（言葉の 頭を 落とさない）。
             ★ **連発しない**。flush は 溜めた音を まとめて 送るので、
               何度も 投げると 送りすぎで 向こうから 切られる。 */
          if (Date.now() - (st.先出し時 || 0) > 8000) {
            st.先出し時 = Date.now();
            try { st.micNode.port.postMessage({ type: "flush" }); } catch (fx2) {}
          }
          st.声始 = 0;
          st.詰まり = (st.詰まり || 0) + 1;
        }
        /* ★ 待ち時間も 1.2 秒 → 0.8 秒（言いかぶせが早い人に合わせる）。 */
        /* ★ 手で止めている間は **割り込みも しない**（2026-08-18）。
           ここを塞がないと、止めているのに こちらの声で マイクが開く
           ＝「止めたのに 届いている」になる。 */
        /* ★ 入口を 大きく 下げた（2026-08-19・訴え「1 回で 通じない」）。
             ・待ち時間 800ms → 150ms
               鳴り始めの 0.8 秒は 割り込みを 見ていなかった。
               返事の 出だしに かぶせた ひと言は **丸ごと 消えていた**。
             ・続く長さ 3 かたまり → 1 かたまり
               「え？」「ちがう」のような 短い ひと言は 3 かたまり 続かない。
               頭は 先出し（1.2 秒の 覚え）で 補うので、1 回で 拾ってよい。
           迷ったら 拾う。拾いすぎても 向こうが 判じ直すだけで 害が 小さい。 */
        /* ══ ★ 線が 狂っても 割り込める 二本目の道（2026-08-19）══════════
           線は 回り込みの見積りから 作る。ところが 見積りは
           Lumi が 喋り出すたびに 作り直され、**その瞬間に こちらが
           話していると 自分の声を 回り込みとして 学んでしまう**。
           そうなると 線は 自分の声の 2.8 倍まで 上がり、
           その番の あいだ 何を 言っても 割り込めない
           （＝「1 回 言っても 反応しない」。言い直すと 番が 変わって 通る）。

           見積りの 作り方も 直したが、**それだけでは 足りない**。
           こちらが 喋り続けている限り、どんな作り方でも
           「静かなとき」を 見つけられないため。

           そこで 端末に 依らない 二本目を 置く:
             はっきり 大きい声（感度の 2 倍）が 0.3 秒 続いたら 割り込む。
           空振りしても 害は 小さい（1.5 秒 マイクを 開けて 送るだけで、
           向こうが 判じ直す）。逆に 拾えないことの 害は 大きい。 */
        var 素の感度 = Math.max(マイクの感度(), 部屋の線);
        if (e.data.muted && rms > 素の感度 * 2) st.強N = (st.強N || 0) + 1;
        else if (!e.data.muted || rms <= 素の感度) st.強N = 0;
        var 割り込む = (rms > 線) || ((st.強N || 0) >= 8);
        if (e.data.muted && 割り込む && 鳴り始めから > 150 && !手で止めているか()) {
          st.bargeN = (st.bargeN || 0) + 1;
          /* ══ ★ 1 かたまり（100ms）では 開かない（2026-08-20・訴え
             「返答中に 周囲の 雑音や 声を 聞き取ってしまう」）═══════════

             2026-08-19 に 3 かたまり → 1 かたまり へ 下げた。
             「1 回 言っても 反応しない」は 直ったが、
             **物音や 咳、となりの 話し声も 100ms あれば 通る**ように なった。
             人の ひと言は 200ms 以上 続く。物音は 続かない。

             ★ 2 かたまり（200ms）続いたら 開く … ふつうの ひと言は これで 拾える
             ★ とびきり 大きい 1 回（線の 2.5 倍）は そのまま 開く
               … 「え？」「ちがう」と はっきり 言えば 100ms でも 通る
             2026-08-19 の 前（3 かたまり＋800ms 待ち）よりは ずっと 速い。 */
          var とびきり = rms > 線 * 2.5;
          /* ★ 空振りが 続いたら **求める 長さ**を 少し 増やす（2026-08-20）。
             底（部屋の 静けさ）は 測った 値なので いじらない。
             0 回:200ms / 1 回:300ms / 2 回以上:400ms。
             25 秒 何も 無ければ 空振りの 数は 0 に 戻る（既存の 決まり）。
             とびきり 大きい 声は いつでも 1 回で 通す。 */
          var 要る = 2 + Math.min(2, st.probeNg || 0);
          if (st.bargeN >= 要る || とびきり) {
            st.bargeN = 0;
            /* ══ ★ 声で割り込めるようにする（2026-08-16）══════════════
               ★ 訴え「返答中に指示しても、声が終わるまで聞いてくれない」。
                 原因は 2 つ。
                 ・喋っている間 マイクを 1 かたまりも送っていないので、
                   向こうは割り込みに気づきようがない。
                 ・気づいても こちらが勝手に音を捨てるだけで、
                   向こうへは何も伝えていないので 生成は続く。
               ★ 直しかた: **止める判断は こちらがしない。**
                 1.5 秒だけマイクを開けて送り、向こうに判じてもらう。
                 本物なら interrupted が返り、そこで正しく後始末される。
                 空振りなら そのまま喋り続けるだけで害がない。
               ★ 開けている間は **自分の声を小さくする**（回り込みで
                 自分を止めないための保険）。 */
            /* ★ 空振りの数は **時間で 戻す**（2026-08-19）。
               もとは 通算 3 回で 打ち切りだったので、長い会話では
               途中から **二度と 割り込めなくなっていた**（1 時間の会話では確実）。
               25 秒 何も無ければ 0 に戻す。粘りすぎない・諦めすぎない。 */
            if (Date.now() - (st.probeAt || 0) > 25000) st.probeNg = 0;
            /* ★ 空振りが 続いても **試すのを やめない**（2026-08-19）。
                 前は probeNg が 3 に達すると、25 秒 経つまで 一切 割り込めなかった。
                 静かな声の人は 空振りが 溜まりやすく、
                 **話しかけても 反応しない時間が 定期的に 訪れて**いた。
                 代わりに 空振りが 続いたら **間隔だけ 少し空ける**
                 （0 回:0.4 秒 / 1 回:0.8 秒 / 2 回以上:1.2 秒）。諦めはしない。 */
            /* ══ ★★ 間隔（2026-08-19・**入れた直後に 訴えが 出た所**）
               「Lumi が ずっと 繋ぎ直しています に なってしまう」。

               割り込みの 入口を 下げた（3 かたまり → 1）のは 正しかったが、
               **試す 間隔まで 短くしていた**（0.4〜1.2 秒）。
               試すたびに flush を 投げる。flush は 溜めておいた 1.2 秒ぶんの音を
               **まとめて** 送るので、話し続けている 間じゅう
               1 秒あたり 2 秒ぶん 送ることになる。
               実測: 8 秒 話し続けたら flush が **25 回**。
               送りすぎで 向こうから 切られ → 繋ぎ直す → また 送りすぎ、の輪。

               入口の 早さ（1 かたまりで 気づく）は そのまま、
               **間隔だけ 1.8 秒以上**にする。1 回 試せば 2.5 秒 開くので、
               続けて 話しているぶんには これで 足りる。 */
            var 間 = 1800 + Math.min(2, st.probeNg || 0) * 600;
            if (Date.now() - (st.lastCut || 0) > 間
                && Date.now() - (st.probeAt || 0) > 間) {
              st.probeUntil = Date.now() + 2500;
              st.probeAt = Date.now();
              st.強N = 0;
              st.probeHit = 0; st.probeAll = 0;
              duck(0.3);
              /* ★ **言葉の頭を 先に送る**（2026-08-19）。
                 これが 無かったので、割り込みが 通っても 意味が 半分しか
                 届かず、「2 度言わないと 動かない」になっていた。
                 返ってくるまで 生の声は 止める（順番が 入れ替わると 逆に 崩れる）。 */
              /* ★ flush は **3 秒に 1 回まで**（2026-08-19）。
                 溜めた 1.2 秒ぶんを まとめて 送るので、連発すると
                 送りすぎで 切られる。ここが 最後の 歯止め。
                 投げないときは 先出しを 待たずに そのまま 生の音を 送る。 */
              if (Date.now() - (st.先出し時 || 0) > 3000) {
                st.先出し時 = Date.now();
                st.先出し中 = true;
                if (st.t先出し) clearTimeout(st.t先出し);
                st.t先出し = setTimeout(function () { st.先出し中 = false; }, 250);
                try { st.micNode.port.postMessage({ type: "flush" }); }
                catch (fx) { st.先出し中 = false; }
              }
              setMuted(false);            /* ★ 音は捨てない。開けるだけ */
              if (!手で止めているか())
                try { st.micNode.port.postMessage({ type: "mute", on: false }); } catch (x2) {}
              noteEv("★ 割り込みかも → 1.5 秒 マイクを開けて向こうに判じてもらう"
                + " 大きさ=" + rms.toFixed(3) + " 線=" + 線.toFixed(3)
                + " 回り込み=" + (st.echo || 0).toFixed(3));
              clearTimeout(st.tProbe);
              /* ★ 名前を付ける。strict の中では arguments.callee が 使えず、
                 呼び直そうとした瞬間に 例外で 会話ごと 落ちる。 */
              var 見きわめ = function () {
                if (!st.on) return;
                st.probeUntil = 0;
                duck(1);
                /* ★ 空振りかどうかを **音が届いているか**で判じてはいけない
                   （2026-08-16 実測）。向こうは何十秒も先まで音を送ってくるので、
                   割り込みが通っていても「まだ届いている」は必ず真になり、
                   **毎回 空振り扱いで閉じ直していた**。
                   見るべきは「開けている間、こちらが実際に話し続けたか」。 */
                /* ★ 4 割・6 回に緩めた（2026-08-16 の 2 度目）。
                   ひと言だけ言って黙る（「ちがう」「ストップ」）と、
                   2.5 秒のうち声が出ているのは 3〜5 回ぶん。
                   半分を求めると **短い言葉では通らなかった**。 */
                var 割合 = st.probeAll ? (st.probeHit / st.probeAll) : 0;
                /* ★ 割合だけで 決めない（2026-08-19）。
                     ひと言（0.4 秒）は 2.5 秒のうち 15% ほどにしかならず、
                     4 割・6 回では **短い言葉が 必ず 空振り**になっていた。
                     ・声が出ていた かたまりが 3 つ 以上 あれば 本物とみなす
                     ・**まだ 声が 続いているなら 閉じずに 伸ばす**
                       （言い終わる前に 口を ふさがない） */
                if (Date.now() - (st.voiceAt || 0) < 500 && (st.probeExt || 0) < 6) {
                  st.probeExt = (st.probeExt || 0) + 1;
                  st.probeUntil = Date.now() + 1200;
                  clearTimeout(st.tProbe);
                  st.tProbe = setTimeout(見きわめ, 1200);
                  return;
                }
                st.probeExt = 0;
                if ((割合 >= 0.25 && st.probeAll >= 4) || st.probeHit >= 3) {
                  /* 開けている 2.5 秒のうち 半分以上 声が出ていた＝本物。
                     声を小さくしているので、これは回り込みではない。
                     向こうが遮ってくれなくても、こちらで止める。 */
                  noteEv("★ 話し続けているので こちらで止める（"
                    + Math.round(割合 * 100) + "%）");
                  st.lastCut = Date.now(); st.probeNg = 0;
          /* ★ 解説の 途中で 話しかけられたら 止める（かぶせない）。 */
          try { if (解説) 解説を止める("話しかけられた"); } catch (ex9) {}
                  try { st.spk.port.postMessage({ type: "clear" }); } catch (x3) {}
                  st.cutAt = Date.now();
                  setMuted(false); talkEdge(false);
                  st.inTurn = false; st.turnDone = true;
                  say("聞いています");
                  return;
                }
                st.probeNg = (st.probeNg || 0) + 1;
                setMuted(true);
                /* ★ 空振りが 続いたら、次からは **もう少し 長く 続いたときだけ**
                   開ける（上の 「要る」）。底は 測った値なので いじらない。 */
                noteEv("　空振り " + st.probeNg + " 回目 → 次は "
                  + ((2 + Math.min(2, st.probeNg)) * 100) + "ms 続いたときだけ 開ける");
              };
              st.tProbe = setTimeout(見きわめ, 2500);
            }
          }
        } else { st.bargeN = 0; }          /* ★ 線を割ったら 常に 0（通算にしない） */
        return;
      }
      if (!ready || !st.ws || st.ws.readyState !== 1) return;
      /* 覚えておいた頭を 送り終わるまで 待つ（順番を 崩さない） */
      if (st.先出し中) return;
      /* ★ **Lumi が喋っている間は 1 かたまりも送らない**（2026-08-16）。
         止める指示は別の場所（worklet）へ送るので、伝わるまでの一瞬に
         すでに溜まっていたぶんが漏れる。実測で **1 かたまり**漏れ、
         それだけで向こうが「利用者が話し始めた」と判じて Lumi を止めた。
         送る直前にも見ておけば、隙間が無くなる。 */
      if (st.speaking) return;
      /* ★ 起動音・終了音が鳴っている間も送らない（2026-08-16）。
         送ると、自分の鳴らした音を こちらの声だと思われて遮られる。 */
      if (st.jingleOn) return;
      /* 文字を書いている間も送らない（打鍵音や周りの声で遮られないように） */
      if (st.barOn) return;
      var b = e.data;
      var bytes = new Uint8Array(b);
      var s = "";
      for (var i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      try {
        st.ws.send(JSON.stringify({ realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: root.btoa(s) } } }));
        st.sentAt = Date.now();          /* ★ 見張りの 材料。送れた 証拠。 */
      } catch (x) {}
    };

    /* ④ **必ず 10 分で終える。** 忘れないよう、ここで 1 回だけ仕掛ける。 */
    /* ★ 上限は **最初に始めた時刻**から数える。
       繋ぎ直すたびに 10 分が伸びると、いつまでも終わらなくなる。 */
    if (!st.endAt) st.endAt = Date.now() + Math.max(60000, Number(j.maxMs) || 600000);
    if (st.tEnd) clearTimeout(st.tEnd);
    st.tEnd = setTimeout(function () {
      say("長くなったので、いったん終わります");
      setTimeout(close, 1600);
    }, Math.max(1000, st.endAt - Date.now()));
  }

  /* ══ 画面を開く ══════════════════════════════════════════════════
     ★ **新しい道を作らない。** サイドバーに出ているボタンを、そのまま押す。
       別の道を作ると、本体が変わったときにここだけ古くなる。 */
  function clickShell(label) {
    try {
      var sr = doc.getElementById("vqShell");
      sr = sr && sr.shadowRoot;
      if (!sr) return false;
      var hit = null;
      var items = sr.querySelectorAll(".vqs-item");
      for (var i = 0; i < items.length; i++) {
        var l = items[i].querySelector(".vqs-item__l");
        var t = ((l ? l.textContent : items[i].textContent) || "").trim();
        if (t && t.indexOf(label) >= 0) { hit = items[i]; break; }
      }
      if (!hit) return false;
      hit.click();
      return true;
    } catch (e) { return false; }
  }
  function openScreen(name) {
    var MAP = {
      home: "ホーム", presets: "プリセット", presetNew: "プリセットを作る",
      results: "結果と分析", insights: "Insights", timer: "タイマー",
      quickMock: "Quick Mock", speak: "Speak", workplace: "Workplace",
      docs: "Docs", sheets: "Sheets", slides: "Slides", forms: "Forms",
      quickChat: "Quick Chat", feed: "Feed", news: "NEWS",
      notifications: "通知", profile: "プロフィール", settings: "設定"
    };
    var n0 = String(name || "");
    /* ★ 走っているものがあるうちは ホームへ戻さない（2026-08-17）。
       訴え「タスクが終わってもいないのに、処理中なのにホームに戻ってしまう」。
       ただし利用者が「それでも戻って」と言うことはある。
       **1 分以内に もう一度 呼ばれたら通す**（断りっぱなしにしない）。 */
    if (n0 === "home") {
      var 走2 = まだ動いている();
      var いま = Date.now();
      if (走2.length && !(st.ホーム断り && いま - st.ホーム断り < 60000)) {
        st.ホーム断り = いま;
        return { だめ: "まだ走っているものがあるので、ホームへは戻していません。",
                 走っているもの: 走2,
                 つぎ: "先に片づけてください。利用者が **それでも戻ってほしい** と言ったときだけ、"
                   + "もう一度 openScreen を home で呼べば戻ります。" };
      }
      st.ホーム断り = 0;
    }
    /* 専用の入口があるものは、そちらのほうが確実 */
    if (n0 === "search") { return searchApp(""); }
    if (n0 === "help") { try { if (root.__vqDocs) { root.__vqDocs.open("help"); return true; } } catch (e) {} }
    var label = MAP[n0];
    if (!label) return false;
    /* タイマーと設定は、専用の入口があるならそちらのほうが確実 */
    if (name === "timer") { try { if (root.VQ2 && VQ2.timerUi) { VQ2.timerUi.open(); return true; } } catch (e) {} }
    if (name === "settings") { try { if (root.__vqOpenSettings) { root.__vqOpenSettings(); return true; } } catch (e) {} }
    return clickShell(label);
  }
  /* ══ クイズを始める（2026-08-16 に作り直した・実測で 3 つ壊れていた）══
     ① 名前を `title` だけで見ていた。プリセットは `name` で持っている
        ものもあり、**当たらないことがあった**。
     ② 見つからないと 一覧を開いて **true を返していた**。
        Lumi は「始めたよ」と言うのに 始まっていない＝嘘になる。
     ③ `select`（開くだけ）を呼んでいた。**始まらない。** start が要る。
     ④ 一覧は **画面に描かれているカードから拾う**ので、まだ一度も
        プリセットの画面を開いていないと 0 件になる。開いてから読み直す。 */
  function startQuiz(name) {
    var want = String(name || "").trim();
    if (!want) return { だめ: "どのプリセットか、名前を教えてください。" };
    var 題 = function (p) { return String((p && (p.title || p.name)) || ""); };
    var 探す = function () {
      try {
        var api2 = root.__vqPresets;
        var list = (api2 && api2.list) ? api2.list() : [];
        for (var i = 0; i < list.length; i++) {
          if (題(list[i]) && 題(list[i]).indexOf(want) >= 0) return list[i];
        }
      } catch (e) {}
      return null;
    };
    var 名前を並べる = function () {
      var 名 = [];
      try {
        var api3 = root.__vqPresets;
        ((api3 && api3.list && api3.list()) || []).forEach(function (p) {
          if (名.length < 12 && 題(p)) 名.push(題(p));
        });
      } catch (e) {}
      if (!名.length) {
        try {
          (VQ2.store.listPresets({}) || []).forEach(function (p) {
            if (名.length < 12 && 題(p)) 名.push(題(p));
          });
        } catch (e) {}
      }
      return 名;
    };
    var 始める = function (hit) {
      var api2 = root.__vqPresets;
      /* ★★ **アプリのボタンと 同じ画面を開く**（2026-08-17・実測で見つけた大きい食い違い）。
         これまでは __vqPresets.start（**旧いクイズ画面**）を開いていた。
         旧い画面には VQ2.quizNow が無いので、そこでは
         answerQuestion も quizMove も explainWhy も
         「いまクイズを解いていません」で 全部 断られる。
         利用者が画面のボタンから始めると 新しい画面が開くので、
         **Lumi だけ 別の画面を開いていた**ことになる。
         これが「噛み合わない」の いちばん大きな元。 */
      try {
        var F2 = root.VQ2 && VQ2.flags;
        var 新しい方 = root.VQ2 && VQ2.quizPlayer && VQ2.quizPlayer.open;
        var 使える = !F2 || !F2.isOn || F2.isOn("quizPlayerV2");
        var p2 = null;
        try { p2 = VQ2.store ? VQ2.store.getPreset(hit.id, {}) : null; } catch (e0) {}
        if (新しい方 && 使える && p2 && (p2.questions || []).length) {
          VQ2.quizPlayer.open({ preset: p2, mode: "practice", resume: false });
          return settle(1400).then(function () {
            var q0 = null;
            try { q0 = root.VQ2 && VQ2.quizNow; } catch (e1) {}
            if (q0) {
              return { やった: "「" + 題(hit) + "」を始めました",
                       いまの問題: q0.index + " / " + q0.total + "（" + (q0.形式の名 || "") + "）",
                       つぎ: "答えるときは answerQuestion、進むときは quizMove です。"
                         + "画面のボタンを探して押さないでください。" };
            }
            /* 新しい画面が立ち上がらなかったら、旧い道へ落とす（黙って諦めない） */
            try { if (api2 && api2.start && api2.start(hit.id)) return { やった: "「" + 題(hit) + "」を始めました（古い画面）" }; }
            catch (e2) {}
            return { だめ: "「" + 題(hit) + "」を始められませんでした。",
                     つぎ: "lookScreen で見て、開始のボタンを押してください。" };
          });
        }
      } catch (e3) {}
      try { if (api2 && api2.start && api2.start(hit.id)) return { やった: "「" + 題(hit) + "」を始めました" }; }
      catch (e) {}
      try {
        if (api2 && api2.select && api2.select(hit.id)) {
          return { 開いた: "「" + 題(hit) + "」の画面",
                   つぎ: "まだ始まっていません。lookScreen で見て「開始」を tapItem で押してください。" };
        }
      } catch (e) {}
      return { だめ: "「" + 題(hit) + "」は見つかりましたが、始められませんでした。",
               つぎ: "lookScreen で見て、開始のボタンを押してください。" };
    };
    var hit = 探す();
    if (hit) return 始める(hit);
    /* まだ一覧が描かれていないと 1 件も見えない。開いてから読み直す。 */
    openScreen("presets");
    return new Promise(function (done) {
      setTimeout(function () {
        var h2 = 探す();
        if (h2) return done(始める(h2));
        done({ だめ: "「" + want + "」というプリセットは見つかりませんでした。"
                 + "**始まっていません。**（一覧は開いてあります）",
               いまある名前: 名前を並べる(),
               つぎ: "名前を読み上げて どれのことか聞くか、近い名前でもう一度呼んでください。"
                 + "始めたとは言わないでください。" });
      }, 1400);
    });
  }

  /* ══ 声でできること ══════════════════════════════════════════════
     ★ **どれも「すでにある入口」を使う。** ここで新しい道を作ると、
       本体が変わったときにここだけ古くなって、黙って効かなくなる。
     ★ できなかったら false を返す。Lumi は「できませんでした」と言う。
       **できたふりをしない。** */
  /* ══════════════════════════════════════════════════════════════════
     画面を **見て**、自分で **押す**（2026-08-15）

     ★ これまでの道具は決め打ちだった（画面を開く・クイズを始める…の 10 個）。
       それ以外は何も触れないので、少し外れた頼みごとで手が止まっていた。
     ★ 代わりに「いま画面に何があるか」を番号つきで見せ、番号で押させる。
       Lumi は **見る → 押す → また見る** を繰り返して目的まで進める。

     ★ 気をつけたこと:
       ・番号のずれ。見たあとに画面が変われば、同じ番号は別のものを指す。
         見るたびに通し番号を付け直し、押すときに **名前が一致するか**確かめる。
         違っていたら押さずに「もう一度見て」と返す。
       ・影の中（shadow root）。このアプリはサイドバーも画面も影の中にある。
         潜って集める。
       ・読み上げる相手がいるので、長すぎる一覧は無意味。上限を決めて削る。
       ・**消す・やめる・払う**は勝手に押させない。断って、口で確かめさせる。
     ══════════════════════════════════════════════════════════════════ */

  /* 押すと戻せないもの。ここに当たったら **必ず口で確かめてから**。 */
  var DANGER_RE = /(削除|消す|消去|取り消|退会|解約|ログアウト|サインアウト|購入|支払|課金|初期化|リセット|全部消)/;
  function DANGER(name) {
    /* ★ 「プ**リセット**」が「リセット」に当たってしまった（実測）。
       このアプリで いちばん出てくる言葉なので、先に外してから見る。 */
    return DANGER_RE.test(String(name || "").replace(/プリセット/g, ""));
  }

  var look = { gen: 0, items: [] };

  /* ══ 見えているか（2026-08-15 に作り直した・重大）════════════════════
     ★ 実測: プリセット作成の画面で **83 件のうち 69 件が「幽霊」**だった。
       閉じたハンバーガーメニュー・画像ビューア・連携の同意・ホワイトボードは
       `display:none` ではなく **`opacity:0` のまま置きっぱなし**になっている。
       透明度は **子へ受け継がれない**ので、子のボタンを単体で調べると
       ふつうに「見えている」ことになり、全部通ってしまう。
       しかも DOM の並びで **幽霊が先に来る**ので、名前で選ぶと必ず幽霊が勝つ。
       「閉じる」も「設定」も「戻る」も、本物より幽霊が上にいた。
     ★ checkVisibility は **先祖の透明度まで見てくれる**。実測で
       幽霊 38/38 を落とし、本物 18/18 を残した（取りこぼし 0）。
     ★ pointer-events は **自分のぶんだけ**見る。受け継がれる決まりなので、
       先祖まで遡ると「入れ物 none ＋ 中身 auto」で作られている
       VocabuSurvival の十字キーや結果カードが巻き添えで消える（実測で確認）。 */
  /* ★ **画面の内側にあるか**（2026-08-15 追記）。
     閉じた画面には、透明にせず **画面の外へどけてある**ものがある
     （#skillsOverlay が実測でこれ。中身は不透明・checkVisibility も通る）。
     外へどけてあるものを拾うと、開いてもいない一覧が読まれる。
     ★ 「動かせば見える所」は残す（ページが縦に伸びていればそこまでは可）。 */
  function onScreen(r) {
    /* ★ 横は **画面の幅だけ**を見る（2026-08-16）。
       閉じた画面は右へどけてあることが多く、そのぶん scrollWidth が
       広がる。その広がった値で判定すると、**自分で自分を正当化**して
       通ってしまう（実測: ホームなのに「Apps」と名乗っていた）。
       縦は下に伸びるのが普通なので scrollHeight を見てよい。 */
    var W = root.innerWidth || 0;
    var H = Math.max(root.innerHeight || 0, (doc.documentElement || {}).scrollHeight || 0);
    /* ★ 横は **本当に重なっているか**で見る（2026-08-16・実測で確定）。
       閉じた画面は `transform: translateX(100%)` で **画面のすぐ右**へ
       停めてある。左端が画面の幅とちょうど同じ（実測: 左1280・画面の幅1280）
       になるので、`left > W + 60` という遊びのある見かたでは **すり抜ける**。
       そのせいで #skillsOverlay（Apps）が いつでも前面あつかいになり、
       Insight を開いていても「いまの画面: Apps」と名乗って
       設定の話を始めていた（利用者の訴えと一致）。
       ★ 細い部品を巻き添えにしないよう、必要な重なりは幅までとする。 */
    /* ★ 大きさが 0 のものは **通す**（2026-08-16 実測で足した）。
       `display:contents` の入れ物や、子だけがはみ出している囲みは
       0×0 の枠を返す。ここで落とすと **中身ごと読まれなくなる**。
       実測: Insight の画面が丸ごと消え、横の行き先だけが読まれた。
       枠が無いものは「分からない」なので、子に判じさせる。 */
    if (r.width > 0 && r.height > 0) {
      var 重なり = Math.min(r.right, W) - Math.max(r.left, 0);
      if (重なり < Math.min(8, r.width)) return false;
    }
    if (r.bottom < -60 || r.top > H + 60) return false;
    return true;
  }

  function seeable(el) {
    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { return false; }
    if (r.width < 8 || r.height < 8) return false;
    if (!onScreen(r)) return false;
    var cs;
    try { cs = root.getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) < 0.05) return false;
    if (cs.pointerEvents === "none") return false;
    /* ★ 先祖の透明度まで見る */
    try {
      if (el.checkVisibility && !el.checkVisibility({
        opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true
      })) return false;
    } catch (e) {
      /* 古い端末むけの逃げ道: 先祖の透明度を自分で辿る */
      var n = el.parentNode, hop = 0;
      while (n && hop++ < 30) {
        if (n.nodeType === 1) {
          var c2;
          try { c2 = root.getComputedStyle(n); } catch (e2) { break; }
          if (c2.display === "none" || c2.visibility === "hidden") return false;
          if (Number(c2.opacity) < 0.05) return false;
        }
        n = n.parentNode || (n.host ? n.host : null);
        if (n && n.nodeType === 11) n = n.host;
      }
    }
    try { if (el.closest && el.closest("[inert]")) return false; } catch (e) {}
    return true;
  }

  /* ★ 当たり判定（elementFromPoint）は **使わない**。
     実測: 幽霊は 39 件なのに **57 件**落として、本物のサイドバーまで消した。
     透明度の網（checkVisibility）と pointer-events で 幽霊 39 件は
     ちょうど全部落ちる。二重に掛ける意味がなく、害だけが残る。 */

  /* 行の見出しだけを取る。
     ★ 説明文まで拾ってはいけない。実測で
       「テーマ「自動」は時刻で切り替えます（18:00 からダーク、6:00」
       という行が **9 個並んだ**。.row__main は見出し＋説明なので使わない。 */
  function rowLabel(el) {
    /* ★ **すぐ近くだけ**見る。奥まで探すと、離れた別の行の見出しを拾う。
       実測で、並んでいるボタン 11 個すべてに「学習:」が付いた。 */
    var Q = ":scope > .row__label, :scope > .row__main > .row__label,"
      + " :scope > .mrow__l, :scope > legend, :scope > .lbl";
    var n = el.parentElement, hop = 0;
    while (n && hop++ < 3) {
      var lb = null;
      try { lb = n.querySelector(Q); } catch (e) {}
      if (lb && !lb.contains(el)) {
        var t = String(lb.textContent || "").replace(/\s+/g, " ").trim();
        if (t) return t.slice(0, 26);
      }
      n = n.parentElement;
    }
    return "";
  }

  function nameOf(el) {
    var tag0 = (el.tagName || "").toLowerCase();
    var form = (tag0 === "select" || tag0 === "input" || tag0 === "textarea");

    var t = el.getAttribute("aria-label") || "";
    if (!t) {
      var by = el.getAttribute("aria-labelledby");
      if (by) { var lb0 = doc.getElementById(by); if (lb0) t = lb0.textContent || ""; }
    }
    if (!t) t = el.getAttribute("placeholder") || "";
    if (!t) { try { var lb = el.labels && el.labels[0]; if (lb) t = lb.textContent || ""; } catch (e) {} }
    if (!t) t = el.getAttribute("title") || "";
    t = String(t).replace(/\s+/g, " ").trim();

    /* ★ 自分の文字と 行の見出しを **組み合わせる**（2026-08-15）。
       「ライト」「ダーク」だけでは何の話か分からず、
       行の見出しだけでは どれを押せばいいか分からない。
       「テーマ: ダーク」の形にすると、どちらも分かる。 */
    if (!form) {
      var own = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (own) {
        var rl = rowLabel(el);
        if (rl && own.indexOf(rl) < 0 && rl.indexOf(own) < 0 && own.length <= 14) {
          t = rl + ": " + own;
        } else if (!t) t = own;
      }
    }
    if (!t) t = rowLabel(el);

    /* 秘密の欄は中身を出さない。合言葉・暗証番号・6桁の番号が漏れる。 */
    if (!t && el.value) {
      var ty2 = String(el.type || "").toLowerCase();
      var ac = String(el.getAttribute("autocomplete") || "");
      if (ty2 === "password" || /password|one-time-code/.test(ac)) t = "（入力済み）";
      else t = String(el.value).slice(0, 20);
    }
    t = String(t).replace(/\s+/g, " ").trim();

    /* 選ぶ欄は「いま何が選ばれているか」も添える */
    if (tag0 === "select" && t) {
      var cur = "";
      try { cur = (el.options[el.selectedIndex] || {}).text || ""; } catch (e) {}
      if (cur) t = t + "（いま: " + String(cur).replace(/\s+/g, " ").trim().slice(0, 16) + "）";
    }
    return t.slice(0, 44);
  }

  function kindOf(el) {
    var tag = (el.tagName || "").toLowerCase();
    var role = el.getAttribute("role") || "";
    if (tag === "input") {
      var ty = String(el.type || "text").toLowerCase();
      if (ty === "checkbox") return el.checked ? "チェック済み" : "チェック";
      if (ty === "radio") return el.checked ? "選択中" : "選べる";
      return "入力欄";
    }
    if (tag === "textarea") return "入力欄";
    if (tag === "select") return "選ぶ欄";
    if (role === "tab") return el.getAttribute("aria-selected") === "true" ? "タブ(いま)" : "タブ";
    if (role === "switch" || el.hasAttribute("aria-checked")) {
      return el.getAttribute("aria-checked") === "true" ? "スイッチ(入)" : "スイッチ(切)";
    }
    /* ★ **入り切りのボタンは、切のときも そう書く**（2026-08-15）。
       「入」だけ書くと、**切のトグル**と **ただのボタン** が見分けられない。
       科目のしぼり込みは押すたびに入り切りが変わる本物のトグルなので、
       見分けられないと「外して」と言われて別の科目を入れてしまう（実測）。 */
    if (el.hasAttribute("aria-pressed")) {
      return el.getAttribute("aria-pressed") === "true" ? "入り切り(入)" : "入り切り(切)";
    }
    if (el.getAttribute("aria-current")) return "ボタン(いま)";
    try { if (el.classList && el.classList.contains("is-active")) return "ボタン(いま)"; } catch (e) {}
    if (tag === "a") return "リンク";
    return "ボタン";
  }

  var LOOK_SEL = 'button,a[href],input:not([type="hidden"]),textarea,select,'
    + '[role="button"],[role="tab"],[role="switch"],[role="option"],[role="menuitem"],'
    + '[onclick],[tabindex]:not([tabindex="-1"])';

  /* ══ いま画面にあるものを集める ════════════════════════════════════
     ★ **全部歩いてから並べ替える。**（2026-08-15 に作り直した）
       はじめは「いちばん上に重なっている画面の中だけ」を見ていた。
       だがその器が空で、中身が影の中にあることがあり、**一覧が 0 件**になった。
       取りこぼすくらいなら、全部集めてから **上にあるものを先頭へ**回す。
     ★ 重なりの裏に隠れたものは、印（inert / aria-hidden）が付いていれば外す。 */
  /* ══ 前に出ている **確認の窓**（2026-08-17）════════════════════════════
     ★ 訴え「『終わりますか？』の窓で『一度閉じて』と言ったら、
       プリセット一覧まで戻ってしまった」。
     ★ おおもとは 1 つ。確認の窓は body の直下ではなく **画面の中**に作られる
       （dialog() が その画面の器へ .vq2-dialog-layer を足す）。
       だから topHosts にも topLayer にも映らず、
       ・見るとき  … 窓の下の画面のボタンまで並べていた
       ・閉じるとき … 窓ではなく **窓の下の画面（クイズ）ごと**閉じていた
     ★ ここで窓そのものを見つけ、見る・押す・閉じる の全部で いちばんに扱う。 */
  /* ★ **幽霊の覆いに気をつける**（2026-08-17・実測）。
     このアプリには 閉じたままの覆いが たくさん残っている。
     実測で見えたもの: #vqImgLightbox（1280×900・z 9200）、
     #vqBoardOverlay（1280×900・z 9000）、.ui-modal-card、#menuPanel。
     どれも display は none ではなく、大きさもある。**中身が空なだけ**。
     だから「role=dialog がある」だけで前面と決めると、
     いつも幽霊が前面になり、見ることも閉じることもできなくなる（実際にそうなった）。
     ★ 見分けは 2 つ。① 本物の確認の窓の作り（.vq2-dialog-layer / .overlay の札）
       ② **中に 押せるもの・読めるものが 実際にあるか**。 */
  var 窓のしるし = '.vq2-dialog-layer, .overlay[role="dialog"], [role="alertdialog"]';
  function 窓の中身がある(el) {
    try {
      var els = el.querySelectorAll('button,[role="button"],a[href],input,textarea,select,h1,h2,p');
      for (var i = 0; i < els.length; i++) {
        var e2 = els[i], cs2, r2;
        try { cs2 = root.getComputedStyle(e2); r2 = e2.getBoundingClientRect(); } catch (e3) { continue; }
        if (cs2.display === "none" || cs2.visibility === "hidden") continue;
        if (Number(cs2.opacity) < 0.05) continue;
        if (r2.width < 8 || r2.height < 8) continue;
        if (!onScreen(r2)) continue;
        if (!String(e2.textContent || "").trim() && !e2.getAttribute("aria-label")
          && (e2.tagName || "").toLowerCase() !== "input") continue;
        return true;
      }
    } catch (e) {}
    return false;
  }
  function いまの窓() {
    var 出 = null, bz = -1;
    var 見る = function (n, 深さ) {
      if (!n || 深さ > 12) return;
      var els;
      try { els = n.querySelectorAll(窓のしるし); } catch (e) { els = []; }
      for (var i = 0; i < els.length; i++) {
        var el = els[i], cs, r;
        try { cs = root.getComputedStyle(el); r = el.getBoundingClientRect(); } catch (e2) { continue; }
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (Number(cs.opacity) < 0.05) continue;
        if (cs.pointerEvents === "none") continue;
        if (r.width < 40 || r.height < 30) continue;
        if (!onScreen(r)) continue;
        try {
          if (el.checkVisibility && !el.checkVisibility({
            opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true
          })) continue;
        } catch (e5) {}
        /* ★ ここが幽霊よけ。中身が空の覆いは 窓ではない。 */
        if (!窓の中身がある(el)) continue;
        var z = Number(cs.zIndex); if (!isFinite(z)) z = 0;
        if (z >= bz) { bz = z; 出 = el; }
      }
      var all;
      try { all = n.querySelectorAll("*"); } catch (e3) { all = []; }
      for (var k = 0; k < all.length; k++) if (all[k].shadowRoot) 見る(all[k].shadowRoot, 深さ + 1);
    };
    見る(doc, 0);
    /* 中の札より **外の覆い**を返す（閉じるボタンも中に含めるため） */
    try { if (出 && 出.closest) 出 = 出.closest(".vq2-dialog-layer, .overlay") || 出; } catch (e4) {}
    return 出;
  }
  function 窓の題(窓) {
    if (!窓) return "";
    var t = "";
    try {
      var h = 窓.querySelector(".vq2-dialog-h h2, .sheet-title, h1, h2, [role=heading]");
      t = String((h && h.textContent) || 窓.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    } catch (e) {}
    return t.slice(0, 60) || "確認";
  }

  function collect() {
    var got = [], seen = [];
    var top = topLayer();
    /* ★ 窓が出ているときは **その中だけ** を見る（2026-08-17）。
       後ろの画面のボタンは 押しても効かないのに DOM には残っている。
       混ぜると「窓が出ているのに 後ろのものを押す」ことになる。 */
    var 窓 = いまの窓();
    if (窓) top = 窓;

    var hidden = function (el) {
      var n = el;
      while (n && n.nodeType === 1) {
        if (n.hasAttribute && (n.hasAttribute("inert") || n.getAttribute("aria-hidden") === "true")) return true;
        n = n.parentNode || (n.host ? n.host : null);
        if (n && n.nodeType === 11) n = n.host;      /* 影の外へ出る */
      }
      return false;
    };
    var inTop = function (el) {
      if (!top) return false;
      var n = el;
      while (n) {
        if (n === top) return true;
        n = n.parentNode || (n.host ? n.host : null);
        if (n && n.nodeType === 11) n = n.host;
      }
      return false;
    };

    var walk = function (node) {
      if (!node) return;
      /* ★ その入れ物自身が「影の主」のことがある。設定の画面は #vqSettings という
         空の器で、中身は全部その影の中にある。器に querySelectorAll しても
         **光の側しか見ない**ので何も出ない。器を渡されたら まず影の中へ入る。 */
      if (node.shadowRoot) walk(node.shadowRoot);
      var els;
      try { els = node.querySelectorAll(LOOK_SEL); } catch (e) { els = []; }
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (seen.indexOf(el) >= 0) continue;
        seen.push(el);
        if (el.disabled) continue;
        if (el.closest && el.closest("#vqLiveBtn, #vqLiveEdge, #vqLiveCap")) continue;
        if (!seeable(el)) continue;
        if (hidden(el)) continue;
        var nm = nameOf(el);
        if (!nm) continue;
        got.push({ el: el, name: nm, kind: kindOf(el), 上: inTop(el) });
      }
      var all;
      try { all = node.querySelectorAll("*"); } catch (e) { all = []; }
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot);
    };
    walk(窓 || doc);

    /* ══ 並べ替え（2026-08-15）════════════════════════════════════
       ★ DOM の並びのままだと **サイドバーが必ず先頭**を占める。
         実測で、プリセットの画面を開いても 先頭 14 件が全部
         「ホーム」「Feed」「NEWS」…の並びで、肝心のカードが出なかった。
       ★ 三段に分ける:
           ① 上に重なっている画面の中（いま触っている場所）
           ② 画面の中身（本題）
           ③ 行き先の並び（サイドバー・下の帯）— 最後でよい */
    var navOf = function (g) {
      var n = g.el;
      var hop = 0;
      while (n && hop++ < 40) {
        if (n.nodeType === 1) {
          var tg = (n.tagName || "").toLowerCase();
          if (tg === "nav" || n.getAttribute("role") === "navigation") return true;
          if (n.id === "vqShell" || n.id === "vqTabbar" || n.id === "appTabbar") return true;
          var cl = String(n.className || "");
          if (/(^| )(vqs-|sidebar|tabbar|bottombar|navrail)/.test(cl)) return true;
        }
        n = n.parentNode || (n.host ? n.host : null);
        if (n && n.nodeType === 11) n = n.host;
      }
      return false;
    };
    var a1 = [], a2 = [], a3 = [];
    for (var q = 0; q < got.length; q++) {
      var g2 = got[q];
      if (top && g2.上) a1.push(g2);
      else if (navOf(g2)) a3.push(g2);
      else a2.push(g2);
    }
    /* ★ 前面があるなら、**その中と行き先だけ**にする（2026-08-15）。
       後ろの画面は隠れていて押せないのに、DOM には残っている。
       混ぜると「プリセット一覧を見ながらクイズを解いている」ような
       ちぐはぐな一覧になり、Lumi が後ろの物を押そうとする。
       ★ ただし **少なすぎたら元へ戻す**。前面の見つけ方を外したときに
         一覧が空になるのがいちばん困る（前に 0 件になった）。 */
    if (a1.length >= 3) return a1.concat(a3);
    return a1.concat(a2, a3);
  }

  /* ══ いちばん上に重なっている画面（2026-08-15 に作り直した）════════
     ★ 前は body の直下だけを見ていた。案内の窓（「プリセットが探しやすく
       なりました」）は もっと奥に置かれていたので **見つけられず**、
       その窓のボタンが一覧の先頭に来なかった。
       Lumi から見ると「窓が出ているのに閉じる道が下の方」になる。
     ★ どこにあっても、**画面を広く覆っている固定の物**を探す。
       これは **並べ替えにだけ**使う。ここを根にして中だけ見るのは禁物
       （実測で一覧が 0 件になった）。 */
  function topLayer() {
    var best = null, bz = -1, seen = 0;
    var VW = root.innerWidth || 1, VH = root.innerHeight || 1;
    /* ★ **まず body の直下を見る**（2026-08-15）。アプリの画面は
       そこに置かれる（#vq2-quiz-player など）。前は いきなり全体を
       深く探していて、影の中を数えるうちに上限に当たり、
       **肝心の出題画面まで辿り着けなかった**（実測）。 */
    /* 1 つ調べる */
    var chk = function (el) {
      if (!el || el.nodeType !== 1) return;
      if (el.id === "vqLiveEdge" || el.id === "vqLiveBtn" || el.id === "vqLiveCap") return;
      if (el.id === "vqShell") return;
      /* ★ **横の行き先の帯は「前面の画面」ではない**（2026-08-16・実測）。
         広い画面ではサイドバー（#appTabBar・幅300×高900）だけで
         画面の 23% を覆う。前は #skillsOverlay が黙って前面を取っていて
         気づかなかったが、それを外した途端に **サイドバーが前面になり、
         readScreen が行き先の一覧しか返さなくなった**。
         その結果、Insight も 結果の画面も「見えていない」状態だった。 */
      if (el.id === "appTabBar" || el.id === "appTabbar" || el.id === "vqTabbar") return;
      try {
        if ((el.tagName || "").toLowerCase() === "nav"
          || el.getAttribute("role") === "navigation"
          || (el.closest && el.closest('nav,[role="navigation"]'))) return;
      } catch (e) {}
      var cs;
      try { cs = root.getComputedStyle(el); } catch (e) { return; }
      if (cs.position !== "fixed" && cs.position !== "absolute") return;
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (Number(cs.opacity) < 0.05) return;
      if (cs.pointerEvents === "none") return;
      var z = Number(cs.zIndex);
      /* ★ 上限で切らない（2026-08-15）。アプリの画面は
         z-index: 2147483000 ちょうどで置かれていて、
         前は「ここから上は自分の部品」として **除外していた**。
         そのせいで出題画面が前面と認められず、後ろのプリセット一覧を
         読んでいた。自分の部品は id で外してあるので、それで足りる。 */
      if (!isFinite(z) || z < 50) return;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { return; }
      if (!onScreen(r)) return;
      /* 画面の 2 割以上を覆っているものだけ（小さな吹き出しは違う）
         ★ **見えている分だけ**で数える（2026-08-16）。前は元の大きさで
           数えていたので、画面の外へ停めてある全面の画面（#skillsOverlay）が
           「画面いっぱい」と数えられ、前面あつかいになっていた。 */
      var 見幅 = Math.min(r.right, VW) - Math.max(r.left, 0);
      var 見高 = Math.min(r.bottom, VH) - Math.max(r.top, 0);
      if (見幅 <= 0 || 見高 <= 0) return;
      if (見幅 * 見高 < VW * VH * 0.2) return;
      /* ★ **画面の真ん中を覆っているか**（2026-08-16）。
         重なって出てくる画面（窓・シート・出題画面）は必ず真ん中を隠す。
         端に寄せてある帯（サイドバー・下のタブ・上の知らせ）は隠さない。
         広さだけで判じると、帯が「前面の画面」になってしまう。 */
      if (r.left > VW / 2 || r.right < VW / 2) return;
      if (r.top > VH / 2 || r.bottom < VH / 2) return;
      try {
        if (el.checkVisibility && !el.checkVisibility({
          opacityProperty: true, visibilityProperty: true
        })) return;
      } catch (e) {}
      if (z >= bz) { bz = z; best = el; }
    };
    var scan = function (node) {
      var all;
      try { all = node.querySelectorAll("*"); } catch (e) { return; }
      for (var i = 0; i < all.length && seen < 20000; i++) {
        var el = all[i]; seen++;
        if (el.shadowRoot) scan(el.shadowRoot);
        chk(el);
      }
    };
    /* ① まず body の直下だけ（速い・確実） */
    try {
      var kids = (doc.body && doc.body.children) || [];
      for (var b2 = 0; b2 < kids.length; b2++) chk(kids[b2]);
    } catch (e) {}
    /* ② それから深く探す（影の中も。上限つき） */
    scan(doc);
    return best;
  }

  /* ── 道具① 画面を見る ───────────────────────────────────── */
  function lookScreen(want, page) {
    var got = collect();
    /* ★ 頼まれた言葉が入っているものを前に出す。
       「作るボタン押して」と言われたら、まず「作る」を見せる。 */
    var q = String(want || "").trim();
    if (q) {
      got.sort(function (a, b) {
        var av = a.name.indexOf(q) >= 0 ? 0 : 1;
        var bv = b.name.indexOf(q) >= 0 ? 0 : 1;
        return av - bv;
      });
    }
    /* 読み上げる相手がいるので、多すぎても意味がない。
       ★ ただし **切って終わりにしない**。続きを見られるようにする。 */
    var LIM = 45;
    var all2 = got.length;
    var pg2 = Math.max(1, Math.round(Number(page) || 1));
    var from = (pg2 - 1) * LIM;
    got = got.slice(from, from + LIM);

    look.gen++;
    look.items = got;
    look.from = from;

    /* ★ 同じ名前が並ぶと、番号と名前で守っても取り違える。
       実測: 「閉じる」が 2 つ並び、押したら **奥の画面**が閉じて
       手前の窓だけが取り残された。名前だけでは区別が付かない。
       重なっているものにだけ、どこのものかを添える。 */
    var count = {};
    got.forEach(function (g) { count[g.name] = (count[g.name] || 0) + 1; });
    var list = got.map(function (g, i) {
      var nm2 = g.name;
      if (count[g.name] > 1) {
        var where = "";
        try {
          var rt = g.el.getRootNode();
          if (rt !== doc && rt.host) where = rt.host.id || "";
        } catch (e) {}
        if (!where) {
          var up = g.el.closest && g.el.closest("[id]");
          where = up ? up.id : "";
        }
        var r2 = g.el.getBoundingClientRect();
        nm2 = g.name + "（" + (where ? where + "・" : "")
          + "上から" + Math.round(r2.top) + "）";
      }
      return (from + i + 1) + ". " + g.kind + "「" + nm2 + "」"
        + (DANGER(g.name) ? "（※戻せない）" : "");
    });
    var out2 = {
      いまの画面: whereAmI(),
      操作できるもの: list,
      /* ★ 押せるものだけでなく **板が 出ているか**も 添える（2026-08-19）。
         これが 無いと、板を 出したことに 気づかないまま 別のことを 始める。 */
      ボード: (function () { try { return 板の様子() || undefined; } catch (e) { return undefined; } })(),
      入力中: 入力中の断り(),
      使いかた: "tapItem に number と name を渡すと押します。"
        + "name は一覧の「」の中をそのまま写してください。"
    };
    /* ★ 窓が出ていることを **必ず先に言う**（2026-08-17）。
       言わないと、Lumi は窓に気づかず 後ろの画面の話を続けてしまう。 */
    try {
      var 窓2 = いまの窓();
      if (窓2) {
        out2.確認の窓が出ています = 窓の題(窓2);
        out2.使いかた = "**いまは この窓の中しか押せません。**"
          + "上の一覧は 窓の中のものだけです。"
          + "利用者に どうするかを確かめてから 押してください。"
          + "窓だけ閉じるなら closeScreen（下の画面は閉じません）。";
      }
    } catch (e9) {}
    if (all2 > from + LIM) {
      out2.続きがあります = "ぜんぶで " + all2 + " 個。lookScreen に page: "
        + (pg2 + 1) + " を渡すと続きが見られます。";
    }
    return out2;
  }

  /* いまどこにいるか（Lumi が状況を言えるように） */
  function whereAmI() {
    var t = topLayer();
    var ttl = "";
    if (t) {
      /* ★ 見出しの付け方が画面ごとに違う。1 つしか見ていなかったので、
         どの画面でも「library」と名乗っていた（実測）。 */
      var h = t.querySelector(".vq2-top-title, .vq2-h-t, .vq2-title, .vq2-hd-t,"
        + " [class*=top-title], [class*=head-title], h1, h2");
      ttl = h ? String(h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30) : "";
    }
    /* ★ 重なりが無いときは **行き先の帯で光っているもの**が いまの画面
       （2026-08-16）。読める文字の 1 行目を名前にすると、どの画面にいても
       サイドバーの頭の「VocabuQuiz」になってしまい、Insight を開いていても
       そう名乗れなかった（実測）。aria-current="page" はアプリが自分で
       付けている印なので、いちばん確かで、増えても付いてくる。 */
    if (!t) {
      try {
        var cur = doc.querySelector('[aria-current="page"], .app-tab-link.is-active,'
          + ' .vqs-item.is-active, nav [aria-selected="true"]');
        var ct = "";
        if (cur) {
          /* ★ アイコンの合字を混ぜない。そのままだと
             「query_stats Insight」と名乗る（実測）。 */
          var 写し = cur.cloneNode(true);
          try {
            var ic = 写し.querySelectorAll('.ms,.mi,[class*="material"],[class*="icon"]');
            for (var q9 = 0; q9 < ic.length; q9++) ic[q9].textContent = "";
          } catch (e2) {}
          ct = String(写し.textContent || "").replace(/\s+/g, " ").trim();
        }
        if (ct && ct.length <= 24) ttl = ct;
      } catch (e) {}
    }
    /* 重なりが無ければ、下の画面（タブ）の名前を返す。
       ★ curTab() は別の囲みの中にあってここからは呼べない。
         印は body の属性に出ているので、そこから読む。 */
    /* ★ 題名の付け方は画面ごとに違う。取れないときは
       **その画面の中でいちばん大きい見出し**を名前にする。
       これが無いと、タイマーを開いていても「qredit」と名乗る（実測）。 */
    if (!ttl && t) {
      try {
        var best = "", bs = 0;
        var els = t.querySelectorAll("*");
        for (var i2 = 0; i2 < els.length && i2 < 1200; i2++) {
          var e2 = els[i2];
          if (e2.children.length) continue;
          var tx = String(e2.textContent || "").replace(/\s+/g, " ").trim();
          if (!tx || tx.length > 24) continue;
          /* ★ 絵文字・記号だけのものは名前にしない（実測で「📅」になった）。
             日本語か英数字が 2 文字以上あるものだけ。 */
          if (!/[぀-ヿ一-鿿A-Za-z0-9]{2,}/.test(tx)) continue;
          var cs2;
          try { cs2 = root.getComputedStyle(e2); } catch (e) { continue; }
          if (/material|icon/i.test(String(cs2.fontFamily || ""))) continue;
          var fs = parseFloat(cs2.fontSize) || 0;
          var r3 = e2.getBoundingClientRect();
          if (r3.top > 220) continue;              /* 上の方にあるものだけ */
          if (fs > bs) { bs = fs; best = tx; }
        }
        if (bs >= 15) ttl = best;
      } catch (e) {}
    }
    /* ★ それでも取れないときは **読める文字の 1 行目**を名前にする。
       題名の付け方は画面ごとにばらばらで、決め打ちでは当たらなかった
       （実測: タイマーを開いても「qredit」、設定を開いても「library」）。
       読み取りは正確に動いているので、そちらに乗る。 */
    if (!ttl && !st.inWhere) {
      st.inWhere = true;
      try {
        var rr = readScreen({});
        var l0 = ((rr.書いてあること || [])[0] || "").replace(/^[■・｜！]\s*/, "").trim();
        if (l0 && l0.length <= 26) ttl = l0;
      } catch (e) {}
      st.inWhere = false;
    }
    if (!ttl) {
      try { ttl = doc.body.getAttribute("data-app-tab") || ""; } catch (e) {}
    }
    return ttl || "ホーム";
  }

  /* ── 道具② 押す ─────────────────────────────────────────
     ★ 番号だけでは危ない。見たあとに画面が変わっていることがある。
       名前も一緒にもらって、**一致したときだけ**押す。 */
  function tapItem(a) {
    var i = Number(a && a.number) - 1 - (look.from || 0);
    var want = String((a && a.name) || "").trim();
    if (!look.items.length) return { だめ: "まだ画面を見ていません。先に lookScreen を使ってください。" };
    if (!(i >= 0 && i < look.items.length)) {
      return { だめ: "その番号はありません。もう一度 lookScreen で見てください。" };
    }
    var it = look.items[i];
    if (!doc.contains(it.el) && !inShadow(it.el)) {
      return { だめ: "画面が変わりました。もう一度 lookScreen で見てください。" };
    }
    /* 名前が違う＝ずれている。押さない。 */
    /* 一覧では 同名のときだけ「（どこ・上からいくつ）」を足している。
       照合はその括弧を外して比べる。 */
    want = want.replace(/（[^）]*）\s*$/, "");
    /* ★ **名前が勝つ**（2026-08-16）。前は番号と名前が食い違うと
       押さずに「もう一度見て」と返していた。だが利用者が指で画面を
       変えていると番号は簡単にずれる。そのたびに断られるので
       「何度押してと言ってもダメ」になっていた。
       名前が分かっているなら、**いまの画面から同じ名前を探して押す**。 */
    if (want && it.name.indexOf(want) < 0 && want.indexOf(it.name) < 0) {
      var again = null, cand = collect();
      for (var k2 = 0; k2 < cand.length; k2++) {
        if (cand[k2].name === want) { again = cand[k2]; break; }
      }
      if (!again) {
        for (var k3 = 0; k3 < cand.length; k3++) {
          if (cand[k3].name.indexOf(want) >= 0 || want.indexOf(cand[k3].name) >= 0) { again = cand[k3]; break; }
        }
      }
      if (!again) {
        return { だめ: "「" + want + "」はいまの画面にありません。"
          + "いま押せるのは: " + cand.slice(0, 12).map(function (g) { return g.name; }).join(" / ") };
      }
      it = again;
    }
    if (DANGER(it.name) && !(a && a.sure === true)) {
      return { だめ: "「" + it.name + "」は元に戻せません。"
        + "利用者に声で確かめて、いいと言われたら sure を true にしてもう一度呼んでください。" };
    }
    try {
      it.el.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (e) { try { it.el.scrollIntoView(); } catch (e2) {} }
    try { it.el.focus({ preventScroll: true }); } catch (e) {}
    try { it.el.click(); } catch (e) { return { だめ: "押せませんでした。" }; }
    /* ★ **押したあとの画面を そのまま一緒に返す**（2026-08-15）。
       前は「もう一度 lookScreen で見てください」と書いて返していたが、
       Lumi は喋って番が終わり、**そこで止まっていた**（実測）。
       押す→見るを 1 回にまとめれば、止まりようがない。往復も半分になる。 */
    return settle().then(function () {
      var now = lookScreen("");
      now.押した = it.name;
      return now;
    });
  }

  function inShadow(el) {
    var n = el;
    while (n) {
      if (n === doc) return true;
      n = n.parentNode || (n.host ? n.host : null);
    }
    return false;
  }

  /* ══ 画面が落ち着くまで待つ（2026-08-15）════════════════════════════
     ★ 前は 0.7 秒の決め打ちだった。速い画面では無駄に待ち、
       重い画面では **描き終わる前**に読んでしまう。
       書き換わりが止まってから読む。上限は 2.5 秒。 */
  function settle(maxMs) {
    return new Promise(function (done) {
      var quiet = null, hard = null, mo = null, fin = false;
      var end = function () {
        if (fin) return; fin = true;
        clearTimeout(quiet); clearTimeout(hard);
        try { if (mo) mo.disconnect(); } catch (e) {}
        done();
      };
      var reset = function () {
        clearTimeout(quiet);
        quiet = setTimeout(end, 260);      /* 260ms 静かなら落ち着いたとみなす */
      };
      try {
        mo = new root.MutationObserver(reset);
        mo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
      } catch (e) { return setTimeout(end, 500); }
      reset();
      hard = setTimeout(end, maxMs || 2500);
    });
  }

  /* ══ 道具 画面の文字を読む（2026-08-15 に作り直した）════════════════
     ★ 最初は h1・p・li … と **タグを決め打ち**していた。だが問題文は
       div で描かれていることが多く、その場合 **1 文字も読めない**。
       「解いてる問題のここ何？」に答えられない、の正体はこれ。
     ★ タグを当てにせず、**文字そのもの**を並び順のまま拾う。
       どんな作りの画面でも読める。
     ★ 幽霊（閉じた画面）は lookScreen と同じ網で落とす。
       重なりがあるときは **その中を先に**読む（いま見ているのはそこだから）。 */
  var SKIP_TAG = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, CANVAS: 1 };

  /* ══ 打ちかけの 字を **答えと みなさせない**（2026-08-20・訴え）══════
     画面を 読ませると、入力欄に 打ちかけの 字が そのまま 載る。
     Lumi は それを 答えだと 思って 丸を つける。
     **打っている 最中は そう 書いて 渡す。** */
  function 入力中の断り() {
    if (!打っている最中か()) return undefined;
    return "★★ 利用者は **いま 入力欄に 打っている最中**です。"
      + "画面に 見えている 字は **書きかけ**で、まだ 送っていません。\n"
      + "・**答え合わせを しないでください。**丸も ばつも 付けません。\n"
      + "・**次の 問題へ 進めないでください。**\n"
      + "・打ち終わって 利用者が 送るか、声で 言うまで **黙って 待ちます**。";
  }

  function readScreen(a) {
    var want = String((a && a.want) || "").trim();
    var top = topLayer();
    /* ★ 窓が出ているなら **窓の中だけ**を読む（2026-08-17）。
       窓の下の文まで読むと、Lumi は「まだ問題を解いている」と思い込む。 */
    var 窓3 = null;
    try { 窓3 = いまの窓(); } catch (e0) {}
    if (窓3) top = 窓3;
    var lines = [], chars = 0;

    /* 文字が読めるか（押せる必要は無いので、pointer-events は見ない） */
    var showing = function (el) {
      try {
        var cs = root.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (Number(cs.opacity) < 0.05) return false;
        if (el.checkVisibility && !el.checkVisibility({
          opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true
        })) return false;
        if (el.closest && el.closest("[inert]")) return false;
        /* ★ **Lumi 自身が 出したものは 読み返さない**（2026-08-17）。
           板（showNote）と 帯（言ったこと）を 画面の文として 拾うと、
           それが 道具の返りに 添えられて Lumi へ 戻り、
           **自分の書いた記号（\\frac や $）を 読み上げ始める**。
           実測: 板に 生の $…$ が出ていた あいだ、英語のような音が 続いた。 */
        if (el.closest && el.closest("#vqLiveNote,#vqLiveEdge,#vqLiveAR")) return false;
        /* ★ aria-hidden の中は読まない。読み上げの決まりで「読むな」の印。
           数式（KaTeX）は **見た目用と機械用を両方**置いていて、
           見た目用に aria-hidden が付く。読むと 1 つの式が二重になり、
           しかも記号がばらばらに並んで意味不明になる。 */
        if (el.getAttribute("aria-hidden") === "true") return false;
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        if (!onScreen(r)) return false;
      } catch (e) { return false; }
      return true;
    };

    /* ★ アイコンの字は読まない。Material のアイコンは
       `home` `grid_view` のような **英字の合字**で書かれていて、
       そのまま読むと意味の無い言葉が並ぶ（実測で先頭 5 行がこれだった）。
       ★ 難しいのは、アイコンが **親の文字に混ざる**こと。
         <button><span class="ms">home</span>ホーム</button> の innerText は
         「home ホーム」になる。だから **取り出すときに外す**。 */
    var isIcon = function (el) {
      try {
        if (/material|icon/i.test(String(root.getComputedStyle(el).fontFamily || ""))) return true;
      } catch (e) {}
      try {
        var cl = String(el.className || "");
        if (/(^| )(ms|mi|material-\S+|material-icons\S*)( |$)/.test(cl)) return true;
      } catch (e) {}
      return false;
    };
    /* アイコンを外して文字を取り出す */
    /* ══ 入力欄の **中身** を読む（2026-08-16・重大）════════════════════
       ★ 訴え「クイズ中に文字を入力したのに 認識してくれない」。
         そのとおりで、**打った字は 一度も読めていなかった。**
         `<input>` の value は 文字の節点（テキストノード）ではないので、
         下の textOf のように子をたどるやり方では **永久に空**になる。
         `<textarea>` の textContent も「最初に書いてあった中身」であって、
         いま打っている字ではない。
       ★ 打った字だけでなく、選び・チェック・伏せ字の状態も返す
         （伏せ字は 中身を出さず 文字数だけ）。 */
    var 欄の名 = function (el) {
      var n = String(el.getAttribute("aria-label") || "").trim();
      if (n) return n.slice(0, 30);
      try {
        var id = el.id;
        if (id) {
          var rt = el.getRootNode ? el.getRootNode() : doc;
          var lb = rt.querySelector && rt.querySelector('label[for="' + String(id).replace(/["\\]/g, "\\$&") + '"]');
          if (lb) { n = String(lb.textContent || "").replace(/\s+/g, " ").trim(); if (n) return n.slice(0, 30); }
        }
        var up = el.closest && el.closest("label");
        if (up) { n = String(up.textContent || "").replace(/\s+/g, " ").trim(); if (n) return n.slice(0, 30); }
      } catch (e) {}
      n = String(el.getAttribute("placeholder") || el.getAttribute("name") || "").trim();
      return n.slice(0, 30);
    };
    var 欄の中身 = function (el) {
      var tg = (el.tagName || "").toLowerCase();
      if (tg !== "input" && tg !== "textarea" && tg !== "select") {
        if (el.isContentEditable) {
          var ce = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          return "［書き込み欄: " + (ce ? "「" + ce.slice(0, 300) + "」" : "まだ何も入っていません") + "］";
        }
        return null;
      }
      var 名 = 欄の名(el);
      var 頭 = 名 ? "（" + 名 + "）" : "";
      if (tg === "select") {
        var o = el.options && el.options[el.selectedIndex];
        return "［選ぶ欄" + 頭 + ": " + (o ? String(o.text || "").replace(/\s+/g, " ").trim() : "—") + "］";
      }
      var ty = String(el.type || "text").toLowerCase();
      if (ty === "checkbox" || ty === "radio") {
        return "［" + (el.checked ? "✓ 選んでいる" : "選んでいない") + 頭 + "］";
      }
      if (ty === "hidden" || ty === "file") return "";
      var v = String(el.value === undefined || el.value === null ? "" : el.value);
      if (ty === "password") return "［入力欄" + 頭 + ": " + (v ? "伏せ字 " + v.length + " 文字" : "まだ何も入っていません") + "］";
      if (ty === "range") return "［つまみ" + 頭 + ": " + v + "］";
      return "［入力欄" + 頭 + ": "
        + (v.trim() ? "「" + v.replace(/\s+/g, " ").slice(0, 300) + "」" : "まだ何も入っていません") + "］";
    };

    var textOf = function (el) {
      if (isIcon(el)) return "";
      var 欄 = 欄の中身(el);
      if (欄 !== null) return 欄;
      var t = "", kids = el.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var nd = kids[i];
        if (nd.nodeType === 3) { t += nd.nodeValue; continue; }
        if (nd.nodeType !== 1) continue;
        if (SKIP_TAG[(nd.tagName || "").toUpperCase()]) continue;
        t += " " + textOf(nd);
      }
      return t;
    };

    /* 見出しっぽいか（大きい字・太い字・h タグ・role=heading） */
    var headish = function (el) {
      var tg = (el.tagName || "").toLowerCase();
      if (/^h[1-4]$/.test(tg) || el.getAttribute("role") === "heading") return true;
      try {
        var cs = root.getComputedStyle(el);
        if (parseFloat(cs.fontSize) >= 19 && (Number(cs.fontWeight) || 400) >= 600) return true;
      } catch (e) {}
      return false;
    };

    var out;
    out = function (el, txt) {
      txt = String(txt).replace(/\s+/g, " ").trim();
      if (txt.length < 1) return;
      if (isIcon(el)) return;
      if (txt.length > 400) txt = txt.slice(0, 400) + "…";
      var tg = (el.tagName || "").toLowerCase();
      var mark = "";
      if (headish(el)) mark = "■ ";
      else if (tg === "li") mark = "・";
      else if (tg === "td" || tg === "th") mark = "｜";
      else if (el.getAttribute("role") === "alert" || el.getAttribute("role") === "status") mark = "！ ";
      var line = mark + txt;
      if (want && line.indexOf(want) < 0) return;
      if (lines.length && lines[lines.length - 1] === line) return;   /* 続けて同じは 1 回 */
      lines.push(line);
      chars += line.length;
    };

    /* 文字を持つ **いちばん内側の入れ物**ごとにまとめる */
    var walk = function (node) {
      if (!node || chars > 5000 || lines.length > 200) return;
      if (node.shadowRoot) walk(node.shadowRoot);
      var kids = node.childNodes || [];
      var buf = "";
      for (var i = 0; i < kids.length; i++) {
        var nd = kids[i];
        if (nd.nodeType === 3) { buf += nd.nodeValue; continue; }
        if (nd.nodeType !== 1) continue;
        if (SKIP_TAG[(nd.tagName || "").toUpperCase()]) continue;
        if (nd.id === "vqLiveBtn" || nd.id === "vqLiveEdge" || nd.id === "vqLiveCap") continue;
        if (!showing(nd)) continue;
        /* 中にさらに入れ物があるなら、そちらへ潜る。無ければ そこが文字の単位。 */
        var deeper = false;
        for (var k = 0; k < nd.childNodes.length; k++) {
          var c = nd.childNodes[k];
          if (c.nodeType === 1 && !SKIP_TAG[(c.tagName || "").toUpperCase()]) {
            /* 文字を含む入れ物か？（span だけの飾りは潜らない） */
            if ((c.textContent || "").replace(/\s/g, "").length > 0
              && !/^(span|b|strong|em|i|u|small|sup|sub|code|mark|br|a)$/.test((c.tagName || "").toLowerCase())) {
              deeper = true; break;
            }
          }
        }
        if (deeper || nd.shadowRoot) {
          if (buf.replace(/\s/g, "")) { out(node.nodeType === 1 ? node : nd, buf); buf = ""; }
          walk(nd);
        } else {
          var t = textOf(nd);
          if (t.replace(/\s/g, "")) out(nd, t);
          else if (nd.getAttribute && nd.getAttribute("alt")) out(nd, "［絵: " + nd.getAttribute("alt") + "］");
        }
      }
      if (buf.replace(/\s/g, "") && node.nodeType === 1) out(node, buf);
    };

    /* ★ 読む順も **中身が先**（2026-08-15）。
       DOM の並びのままだと サイドバーの行き先が先頭を占めて、
       肝心の問題文が ずっと下になる。読み上げる相手には致命的。
         ① 重なっている画面 → ② 画面の中身 → ③ 行き先の並び */
    if (top) walk(top);
    var afterTop = lines.length;
    /* ★ 窓が出ているときは **窓の中だけ**を返す（行数が少なくても）。
       後ろの問題文まで混ぜると、Lumi は「まだ問題を解いている」と思い込む。 */
    if (窓3) {
      return {
        いまの画面: "確認の窓「" + 窓の題(窓3) + "」（下に " + whereAmI() + " が開いたまま）",
        確認の窓が出ています: 窓の題(窓3),
        書いてあること: lines,
      /* ★ **板が 出ていることに 必ず 気づけるようにする**（2026-08-19・訴え
         「ボードや アプリの 画面が、Lumi には 見えていないのかも」）。
         実測: 板を 出した状態で readScreen を 呼んでも 読める字は **0 件**だった。
         板の 中身は ここには 出さない（記号を そのまま 読み上げてしまう）。
         代わりに「出ている」ことと「boardBlocks で 読める」ことを 伝える。 */
      ボード: (function () { try { return 板の様子() || undefined; } catch (e) { return undefined; } })(),
      入力中: 入力中の断り(),
        読み: "**いまは この窓が前に出ています。窓の中しか押せません。**"
          + "利用者に どうするかを確かめてから 押してください。"
          + "窓だけ閉じるなら closeScreen です（下の画面は閉じません）。"
      };
    }

    var navRoots = [];
    try {
      var sh = doc.getElementById("vqShell");
      if (sh) navRoots.push(sh);
      var nv = doc.querySelectorAll('nav,[role="navigation"],#vqTabbar,#appTabbar');
      for (var q2 = 0; q2 < nv.length; q2++) navRoots.push(nv[q2]);
    } catch (e) {}
    var inNav = function (el) {
      for (var q3 = 0; q3 < navRoots.length; q3++) {
        var n5 = el, h5 = 0;
        while (n5 && h5++ < 40) {
          if (n5 === navRoots[q3]) return true;
          n5 = n5.parentNode || (n5.host ? n5.host : null);
          if (n5 && n5.nodeType === 11) n5 = n5.host;
        }
      }
      return false;
    };
    /* ★ 前面の中で 3 行以上読めたなら、**後ろは読まない**。
       隠れている画面の文字を読むと、いま見ているものと食い違う。 */
    if (afterTop >= 3) {
      return {
        いまの画面: whereAmI(),
        書いてあること: lines,
      /* ★ **板が 出ていることに 必ず 気づけるようにする**（2026-08-19・訴え
         「ボードや アプリの 画面が、Lumi には 見えていないのかも」）。
         実測: 板を 出した状態で readScreen を 呼んでも 読める字は **0 件**だった。
         板の 中身は ここには 出さない（記号を そのまま 読み上げてしまう）。
         代わりに「出ている」ことと「boardBlocks で 読める」ことを 伝える。 */
      ボード: (function () { try { return 板の様子() || undefined; } catch (e) { return undefined; } })(),
      入力中: 入力中の断り(),
        読み: "■ は見出し、・ は箇条書き、｜ は表のます、！ は知らせです。上から順に並んでいます。"
      };
    }
    var body = [], nav = [];
    var stash = lines; lines = [];
    var pushOrig = out;
    out = function (el, txt) {
      var before = lines.length;
      pushOrig(el, txt);
      if (lines.length > before) {
        (inNav(el) ? nav : body).push(lines[lines.length - 1]);
        lines.length = before;
      }
    };
    walk(doc);
    out = pushOrig;
    lines = stash.slice(0, afterTop).concat(body, nav);

    if (!lines.length) {
      return { いまの画面: whereAmI(), 書いてあること: [],
        /* ★ 読める字が 無くても、板が 出ていれば そう伝える（2026-08-19）。
           実測: 板だけが 出ている場面では **この道**を 通る。
           ここを 抜かすと「何も 見えない」と 返って、
           板を 出したことに 気づけない。 */
        ボード: (function () { try { return 板の様子() || undefined; } catch (e) { return undefined; } })(),
        入力中: 入力中の断り(),
      入力中: 入力中の断り(),
        ことわり: "読める文字がありませんでした。" };
    }
    return {
      いまの画面: whereAmI(),
      書いてあること: lines,
      /* ★ **板が 出ていることに 必ず 気づけるようにする**（2026-08-19・訴え
         「ボードや アプリの 画面が、Lumi には 見えていないのかも」）。
         実測: 板を 出した状態で readScreen を 呼んでも 読める字は **0 件**だった。
         板の 中身は ここには 出さない（記号を そのまま 読み上げてしまう）。
         代わりに「出ている」ことと「boardBlocks で 読める」ことを 伝える。 */
      ボード: (function () { try { return 板の様子() || undefined; } catch (e) { return undefined; } })(),
      入力中: 入力中の断り(),
      読み: "■ は見出し、・ は箇条書き、｜ は表のます、！ は知らせです。上から順に並んでいます。"
    };
  }

  /* ══ 道具 つまみを動かす ══════════════════════════════════════════ */
  /* ══ つかんで運ぶ（2026-08-16）════════════════════════════════════════
     ★ 訴え「掴んで持っていったりとかも。選ぶだけじゃなくて」。
       並べ替え・組み合わせ・分類・図へのラベル貼りは **運ぶ操作**なので、
       押すだけの道具では届かなかった。
     ★ 画面側は DragKit という同じ仕組みで作られていて、
         ・つまむもの = [data-drag-id]
         ・落とす先   = [data-drop-zone]
       の 2 つの印が付いている。だから **印を頼りに運ぶ**。
     ★ 運びかたは 2 通り試す。
         ① 本物と同じ道（押す→動かす→離す）。座標で落とし先を決める。
         ② それで動かなければ、つまんで **落とし先を押す**（DragKit が
            持っている「押して選ぶ」道）。画面の外にはみ出していても効く。
     ★ 動いたかどうかは **並びを前後で比べて**確かめる。
       動いていなければ「運べなかった」と正直に返す（できたふりをしない）。 */
  function 深く集める(sel, 上限) {
    var out = [], 見た = 0;
    var scan = function (r) {
      var all;
      try { all = r.querySelectorAll(sel); } catch (e) { all = []; }
      for (var i = 0; i < all.length && out.length < (上限 || 300); i++) out.push(all[i]);
      var every;
      try { every = r.querySelectorAll("*"); } catch (e) { return; }
      for (var k = 0; k < every.length && 見た++ < 20000; k++) {
        if (every[k].shadowRoot) scan(every[k].shadowRoot);
      }
    };
    scan(doc);
    return out;
  }
  function 運ぶ名(el) {
    var n = String(el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!n) n = String(el.textContent || "").replace(/\s+/g, " ").trim();
    return n.slice(0, 60);
  }
  function 並びをとる() {
    return 深く集める("[data-drag-id]").map(function (e) {
      return e.getAttribute("data-drag-id") + ":" + 運ぶ名(e);
    }).join("|");
  }
  function 指の出来事(el, 種, x, y) {
    var e;
    try {
      e = new root.PointerEvent(種, { bubbles: true, cancelable: true, composed: true,
        pointerId: 71, pointerType: "mouse", isPrimary: true, button: 0,
        buttons: 種 === "pointerup" ? 0 : 1, clientX: x, clientY: y });
    } catch (e2) {
      try {
        e = new root.MouseEvent(種.replace("pointer", "mouse"),
          { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y });
        e.pointerId = 71;
      } catch (e3) { return; }
    }
    try { el.dispatchEvent(e); } catch (e4) {}
  }
  function dragItem(a) {
    var 何 = String((a && a.item) || "").replace(/\s+/g, " ").trim();
    var どこ = String((a && a.to) || "").replace(/\s+/g, " ").trim();
    /* ★ 下へはみ出しているものも **数に入れる**（2026-08-16）。
       札が 5 枚以上ある問題では、下の方は画面の外に出ている。
       seeable（＝いま見えている）で切ると、運びたい相手がいつも足りない。
       動かせば見えるので、運ぶ前に そこまで送る。 */
    var 運べる形 = function (el) {
      try {
        var cs = root.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (Number(cs.opacity) < 0.05 || cs.pointerEvents === "none") return false;
        if (el.checkVisibility && !el.checkVisibility({
          opacityProperty: true, visibilityProperty: true })) return false;
        var r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      } catch (e) { return false; }
    };
    var 掴む物 = 深く集める("[data-drag-id]").filter(運べる形);
    var 置き先 = 深く集める("[data-drop-zone]").filter(運べる形);
    if (!掴む物.length) {
      return { だめ: "この画面には **運べるもの**がありません。",
               つぎ: "並べ替えや組み合わせの問題でだけ使えます。"
                 + "ふつうの問題は tapItem で押してください。" };
    }
    var 一覧 = 掴む物.map(function (e, i) { return (i + 1) + ". " + 運ぶ名(e); });
    if (!何 || !どこ) {
      return { 運べるもの: 一覧,
               置ける場所: 置き先.map(function (e, i) { return (i + 1) + ". " + 運ぶ名(e); }).slice(0, 20),
               つぎ: "dragItem に item（運ぶもの）と to（どこへ）を渡してください。"
                 + "to は 置きたい所にあるものの名前か、「3番目」のような番号です。" };
    }
    var 探す = function (list, w) {
      var n = Number(String(w).replace(/[^\d]/g, ""));
      for (var i = 0; i < list.length; i++) if (運ぶ名(list[i]).indexOf(w) >= 0) return list[i];
      if (isFinite(n) && n >= 1 && n <= list.length) return list[n - 1];
      return null;
    };
    var from = 探す(掴む物, 何);
    if (!from) {
      return { だめ: "「" + 何 + "」は運べるものの中にありません。", 運べるもの: 一覧,
               つぎ: "一覧のとおりに名前を写してください。" };
    }
    var to = 探す(置き先, どこ) || 探す(掴む物, どこ);
    if (!to) {
      return { だめ: "「" + どこ + "」という置き先がありません。",
               置ける場所: 置き先.map(function (e, i) { return (i + 1) + ". " + 運ぶ名(e); }).slice(0, 20),
               つぎ: "一覧のとおりに名前を写してください。" };
    }
    if (from === to) return { だめ: "運ぶものと 置き先が同じです。" };

    var 前 = 並びをとる();
    /* ★ 落とし先は 座標で決まる（elementFromPoint）。画面の外にあると
       運べないので、**両方が見える所まで送ってから**にする。 */
    try { from.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {}
    try { to.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {}
    var r1 = from.getBoundingClientRect(), r2 = to.getBoundingClientRect();
    var x1 = r1.left + r1.width / 2, y1 = r1.top + r1.height / 2;
    var x2 = r2.left + r2.width / 2, y2 = r2.top + r2.height / 2;
    /* ① 本物と同じ道 */
    指の出来事(from, "pointerdown", x1, y1);
    指の出来事(from, "pointermove", x1 + 14, y1 + 14);   /* 8px の敷居を越える */
    指の出来事(from, "pointermove", x2, y2);
    指の出来事(from, "pointerup", x2, y2);

    return settle(1200).then(function () {
      if (並びをとる() !== 前) {
        return { 運んだ: "「" + 運ぶ名(from).slice(0, 30) + "」を「" + 運ぶ名(to).slice(0, 30) + "」の所へ",
                 いまの並び: 深く集める("[data-drag-id]").map(function (e, i) {
                   return (i + 1) + ". " + 運ぶ名(e); }).slice(0, 20),
                 つぎ: "並びが変わりました。答えを決めたら 決定のボタンを押してください。" };
      }
      /* ② つまんで、置き先を押す（DragKit の「押して選ぶ」道） */
      指の出来事(from, "pointerdown", x1, y1);
      指の出来事(from, "pointerup", x1, y1);            /* 動かさない＝つまんだまま */
      try { to.click(); } catch (e) {}
      return settle(1200).then(function () {
        if (並びをとる() !== 前) {
          return { 運んだ: "「" + 運ぶ名(from).slice(0, 30) + "」を「" + 運ぶ名(to).slice(0, 30) + "」の所へ（押して置いた）",
                   いまの並び: 深く集める("[data-drag-id]").map(function (e, i) {
                     return (i + 1) + ". " + 運ぶ名(e); }).slice(0, 20) };
        }
        return { だめ: "**運べませんでした。**並びは変わっていません。",
                 いまの並び: 一覧.slice(0, 20),
                 つぎ: "運べたと言わないでください。"
                   + "並べ替えなら「1 つ上へ」「1 つ下へ」のボタンが出ているので、"
                   + "lookScreen で見て tapItem で押すほうが確実です。" };
      });
    });
  }

  function slideTo(a) {
    var i = Number(a && a.number) - 1 - (look.from || 0);
    var it = look.items[i];
    if (!it) return { だめ: "その番号はありません。先に lookScreen で見てください。" };
    var el = it.el;
    var isRange = (el.tagName || "").toLowerCase() === "input"
      && String(el.type || "").toLowerCase() === "range";
    var isAria = el.getAttribute("role") === "slider";
    if (!isRange && !isAria) return { だめ: "「" + it.name + "」はつまみではありません。" };
    var v = Number(a && a.value);
    if (!isFinite(v)) return { だめ: "数を渡してください。" };
    if (isRange) {
      var lo = Number(el.min || 0), hi = Number(el.max || 100);
      if (v < lo) v = lo; if (v > hi) v = hi;
      try {
        var setter = Object.getOwnPropertyDescriptor(root.HTMLInputElement.prototype, "value").set;
        setter.call(el, String(v));
      } catch (e) { el.value = String(v); }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      /* 自前のつまみは 矢印キーで動かす */
      var now0 = Number(el.getAttribute("aria-valuenow") || 0);
      var step = Number(el.getAttribute("aria-valuestep") || 1) || 1;
      var n2 = Math.round((v - now0) / step);
      var key = n2 >= 0 ? "ArrowRight" : "ArrowLeft";
      n2 = Math.min(Math.abs(n2), 200);
      try { el.focus({ preventScroll: true }); } catch (e) {}
      for (var k = 0; k < n2; k++) {
        el.dispatchEvent(new root.KeyboardEvent("keydown", { key: key, bubbles: true }));
        el.dispatchEvent(new root.KeyboardEvent("keyup", { key: key, bubbles: true }));
      }
    }
    var nm2 = it.name;
    return settle().then(function () {
      var o2 = lookScreen("");
      o2.動かした = nm2; o2.いくつに = v;
      return o2;
    });
  }

  /* ══ 道具 枠の中を動かす ══════════════════════════════════════════ */
  function scrollIn(a) {
    var i = Number(a && a.number) - 1 - (look.from || 0);
    var it = look.items[i];
    if (!it) return { だめ: "その番号はありません。先に lookScreen で見てください。" };
    var dir = String((a && a.direction) || "down");
    /* ★ 日本語で渡されることがある。前は **黙って何もせず**、
       それでも普通の一覧を返していた（＝動いたように見える）。 */
    var MAP = { "下": "down", "上": "up", "右": "right", "左": "left",
                "先頭": "top", "最後": "bottom", "一番上": "top", "一番下": "bottom" };
    dir = MAP[dir] || dir;
    if (["down", "up", "right", "left", "top", "bottom"].indexOf(dir) < 0) {
      return { だめ: "向きは 下・上・左・右・先頭・最後 のどれかにしてください。" };
    }
    var box = null, n3 = it.el.parentElement, hop = 0;
    while (n3 && hop++ < 12) {
      var cs;
      try { cs = root.getComputedStyle(n3); } catch (e) { break; }
      var canY = (cs.overflowY === "auto" || cs.overflowY === "scroll") && n3.scrollHeight > n3.clientHeight + 8;
      var canX = (cs.overflowX === "auto" || cs.overflowX === "scroll") && n3.scrollWidth > n3.clientWidth + 8;
      if (canY || canX) { box = n3; break; }
      n3 = n3.parentElement || (n3.getRootNode && n3.getRootNode().host) || null;
    }
    if (!box) return { だめ: "この部品は 枠の中で動きません。scrollPage を使ってください。" };
    var dy = Math.round(box.clientHeight * 0.8), dx = Math.round(box.clientWidth * 0.8);
    if (dir === "down") box.scrollTop += dy;
    else if (dir === "up") box.scrollTop -= dy;
    else if (dir === "right") box.scrollLeft += dx;
    else if (dir === "left") box.scrollLeft -= dx;
    else if (dir === "top") box.scrollTop = 0;
    else if (dir === "bottom") box.scrollTop = box.scrollHeight;
    return settle(900).then(function () { return lookScreen(""); });
  }

  /* ══ 道具 終わるまで待つ ══════════════════════════════════════════
     ★ 問題を作る等、数十秒かかることがある。押した直後に読んでも
       まだ終わっていない。**言葉が出るまで**待てるようにする。 */
  function waitFor(a) {
    var word = String((a && a.text) || "").trim();
    var sec = Math.min(Math.max(Number(a && a.seconds) || 20, 3), 90);
    var until = Date.now() + sec * 1000;
    return new Promise(function (done) {
      var tick = function () {
        var now4 = lookScreen("");
        var hit = !word || now4.操作できるもの.some(function (x) { return x.indexOf(word) >= 0; });
        if (!hit && word) {
          try {
            hit = (readScreen({}).書いてあること || []).some(function (x) { return x.indexOf(word) >= 0; });
          } catch (e) {}
        }
        if (hit) { now4.待った = word ? "「" + word + "」が出ました" : "待ちました"; return done(now4); }
        if (Date.now() > until) {
          /* ★ 出なかったことを **証拠として控えに残さない**（2026-08-16・監査）。
             前は「『完了』は出ませんでした」という文が控えに入り、
             finishTask に「完了」と出すと その行に当たって **通ってしまった**。
             ＝ 待って失敗した事実が、成功の証拠に化けていた。 */
          now4.待った = "「" + word + "」は " + sec + " 秒たっても出ませんでした";
          now4.未確認 = true;
          now4.つぎ = "**まだ終わっていません。**できたと言わないでください。"
            + "もう少し待つか、画面を見て別の道で進めてください。";
          return done(now4);
        }
        setTimeout(tick, 1200);
      };
      setTimeout(tick, 600);
    });
  }

  /* ── 道具③ 選ぶ欄から選ぶ ───────────────────────────────
     ★ <select> は **押しても開かない**（実測）。値を入れて知らせる。 */
  function chooseOption(a) {
    var i = Number(a && a.number) - 1 - (look.from || 0);
    var want = String((a && a.option) || "").trim();
    var it = look.items[i];
    if (!it) return { だめ: "その番号はありません。先に lookScreen で見てください。" };
    var el = it.el;
    if ((el.tagName || "").toLowerCase() !== "select") {
      return { だめ: "「" + it.name + "」は選ぶ欄ではありません。ボタンなら tapItem を使ってください。" };
    }
    var opts = [], hit = -1;
    for (var k = 0; k < el.options.length; k++) {
      var tx = String(el.options[k].text || "").replace(/\s+/g, " ").trim();
      opts.push(tx);
      if (hit < 0 && want && (tx === want || tx.indexOf(want) >= 0 || want.indexOf(tx) >= 0)) hit = k;
    }
    if (hit < 0) return { だめ: "「" + want + "」は選べません。", 選べるもの: opts };
    el.selectedIndex = hit;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    var nm = it.name;
    return settle().then(function () {
      var now = lookScreen("");
      now.選んだ = opts[hit];
      now.欄 = nm;
      return now;
    });
  }

  /* ══ 道具 文字を入れる（2026-08-15 に作り直した）════════════════════
     ★ **入れたつもりで入っていない**ことがあった（実測・Feed の投稿欄）。
       focus した瞬間に画面がその欄ごと作り直され、こちらが書き込む先は
       **もう外れた古い欄**になる。それでも「入れた」と返していたので、
       Lumi は「投稿しました」と嘘をつく。
       ＝「画面と声が一致しない」の正体のひとつ。
     ★ だから **入れたあとに読み返して確かめる**。
       違っていたら、同じ名前の欄を取り直して もう一度入れる。
       それでも駄目なら **正直に「入れられませんでした」と返す**。 */
  function setVal(el, txt) {
    try {
      if (el.isContentEditable) { el.textContent = txt; }
      else {
        var tag = (el.tagName || "").toLowerCase();
        var proto = tag === "textarea" ? root.HTMLTextAreaElement : root.HTMLInputElement;
        var setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
        setter.call(el, txt);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }
  function valOf(el) {
    try { return el.isContentEditable ? String(el.textContent || "") : String(el.value || ""); }
    catch (e) { return ""; }
  }
  /* 同じ名前の欄を、いまの画面から取り直す */
  function refind(name) {
    var got = collect();
    for (var i = 0; i < got.length; i++) {
      var tg = (got[i].el.tagName || "").toLowerCase();
      if ((tg === "input" || tg === "textarea" || got[i].el.isContentEditable)
        && got[i].name === name) return got[i].el;
    }
    return null;
  }

  function typeInto(a) {
    var i = Number(a && a.number) - 1 - (look.from || 0);
    var txt = String((a && a.text) || "");
    var it = look.items[i];
    if (!it) return { だめ: "その番号はありません。先に lookScreen で見てください。" };
    var el = it.el;
    var tag0 = (el.tagName || "").toLowerCase();
    if (tag0 !== "input" && tag0 !== "textarea" && !el.isContentEditable) {
      return { だめ: "「" + it.name + "」は文字を入れる欄ではありません。" };
    }
    var nm = it.name;
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    try { el.focus({ preventScroll: true }); } catch (e) {}

    return settle(700).then(function () {
      /* focus で作り直されていることがある。外れていたら取り直す。 */
      var cur = doc.contains(el) || inShadow(el) ? el : (refind(nm) || el);
      setVal(cur, txt);
      return settle(700);
    }).then(function () {
      var cur2 = doc.contains(el) || inShadow(el) ? el : (refind(nm) || el);
      if (valOf(cur2) !== txt) {
        /* もう一度だけ、取り直して入れる */
        var again = refind(nm);
        if (again) { try { again.focus({ preventScroll: true }); } catch (e) {} setVal(again, txt); }
        return settle(600).then(function () { return again; });
      }
      return cur2;
    }).then(function (fin) {
      var chk = fin && valOf(fin) === txt ? fin : (refind(nm) || fin);
      var okNow = !!(chk && valOf(chk) === txt);
      var now = lookScreen("");
      if (!okNow) {
        now.だめ = "「" + nm + "」に入れられませんでした。"
          + "画面が入れた直後に作り直されているようです。**入れたと言わないでください。**";
      } else {
        now.入れた = txt.slice(0, 40);
        now.欄 = nm;
      }
      return now;
    });
  }

  /* ══ 道具 書類を **一言から作る**（2026-08-16）════════════════════
     ★ 「〇〇の資料つくって」と言われたとき、白紙を開いて終わりでは意味がない。
       サーバに中身を作らせ、**中身が入った状態**で開く。
     ★ 形は Workplace の決まり（M.emptyBody）に合わせて組み立てる。
       ここを間違えると **開けない書類**ができるので、必ず型どおりに作る。 */
  var WP_TYPE = { document: "document", doc: "document", 文書: "document",
                  spreadsheet: "spreadsheet", sheet: "spreadsheet", 表: "spreadsheet",
                  presentation: "presentation", slide: "presentation", 発表: "presentation",
                  form: "form", フォーム: "form" };

  /* ══ 表のマス目を作る（2026-08-16・重大）════════════════════════════
     ★ 訴え「関数が入らない」。原因はここだった。**どのマスも {v:"文字"} で
       入れていた**ので、「=SUM(B2:B10)」と書けていても ただの文字列になり、
       一度も計算されなかった。表の決まりでは
         { v: 値 }  … そのままの値
         { f: "=…" } … 数式（開いたときに F.recalc が計算する）
       の 2 つに分かれている。=で始まるものは f に入れる。 */
  function 表にする(j, M) {
    var cells = {};
    var put = function (r, c, v) {
      var s = String(v === undefined || v === null ? "" : v);
      if (!s) return;
      var 名 = M.colName(c) + (r + 1);
      cells[名] = /^=/.test(s.trim()) ? { f: s.trim() } : { v: s };
    };
    (j.columns || []).forEach(function (c, i) { put(0, i, c); });
    (j.rows || []).forEach(function (row, r) {
      (row || []).forEach(function (v, i) { put(r + 1, i, v); });
    });
    return cells;
  }

  /* ══ スライドを作る（2026-08-16・重大）════════════════════════════
     ★ ここも作りが違っていた。スライドの中身は **elements** に置く決まりで、
       title / bullets という欄は **誰も読まない**。だから作っても白紙だった。
       レイアウトどおりの位置・大きさで、文字の箱を並べる。 */
  function 表グラフ図形あり(sl) {
    return !!(sl && (sl.table || sl.chart || (sl.shapes && sl.shapes.length >= 2)));
  }
  function スライドにする(sl, i, M) {
    var W = 960, H = 540;
    var T = function (x, y, w, h, text, o) {
      var e = { id: M.uid("e"), type: "text", x: x, y: y, w: w, h: h,
                text: String(text || ""), size: 20, align: "left", lh: 1.5, z: 1 };
      for (var k in (o || {})) e[k] = o[k];
      return e;
    };
    var s2 = M.newSlide(i === 0 ? "title" : "title_body");
    var 箇条 = (sl.bullets || []).map(function (b) {
      return "・" + String(b).replace(/^\s*[・･\-*•]\s*/, "");
    }).join("\n");
    if (i === 0) {
      s2.elements = [
        T(80, H / 2 - 70, W - 160, 90, sl.title || "", { size: 46, bold: true, align: "center" }),
        T(80, H / 2 + 30, W - 160, 60, 箇条.replace(/^・/, "").split("\n")[0] || "",
          { size: 20, align: "center" })
      ];
    } else {
      s2.elements = [T(70, 60, W - 140, 50, sl.title || "", { size: 32, bold: true })];
      /* == 表・グラフ・図形を **本物の部品として** 置く（2026-08-16）======
         * 訴え「グラフや表、図形を入れていると思ったところに、文章で
           『グラフ』と書いてある」。そのとおりで、ここが文字箱 2 つ固定だった。
           画面側は table / chart / shape を描けるのに、**作る側が
           一度も作っていなかった**。 */
      var 本文の上 = 140, 本文の高さ = H - 200;
      if (sl.table && sl.table.rows && sl.table.rows.length) {
        var 行 = [];
        if (sl.table.header && sl.table.header.length) 行.push(sl.table.header.slice());
        sl.table.rows.forEach(function (r) { 行.push(r.slice()); });
        var 列数 = Math.max.apply(null, 行.map(function (r) { return r.length; }));
        行 = 行.map(function (r) {
          var c = r.slice();
          while (c.length < 列数) c.push("");
          return c;
        });
        var 表の高 = Math.min(本文の高さ, 40 + 34 * 行.length);
        s2.elements.push({ id: M.uid("e"), type: "table", x: 70, y: 本文の上,
                           w: W - 140, h: 表の高, rows: 行, size: 15, z: 1 });
        本文の上 += 表の高 + 16;
      } else if (sl.chart && sl.chart.labels && sl.chart.series) {
        var 図の高 = Math.min(本文の高さ, 300);
        s2.elements.push({ id: M.uid("e"), type: "chart", x: 70, y: 本文の上,
                           w: W - 140, h: 図の高,
                           chart: { type: sl.chart.type || "bar",
                                    labels: sl.chart.labels.slice(),
                                    series: sl.chart.series.map(function (x) {
                                      return { name: x.name || "", data: (x.data || []).slice() };
                                    }) }, z: 1 });
        本文の上 += 図の高 + 16;
      } else if (sl.shapes && sl.shapes.length >= 2) {
        /* 横に並べて、あいだを矢印でつなぐ */
        var n2 = sl.shapes.length;
        var 幅 = Math.floor((W - 140 - 30 * (n2 - 1)) / n2);
        var 高 = Math.min(150, 本文の高さ - 40);
        sl.shapes.forEach(function (sp, k) {
          var x = 70 + k * (幅 + 30);
          s2.elements.push({ id: M.uid("e"), type: "shape", x: x, y: 本文の上,
                             w: 幅, h: 高, shape: sp.shape || "rect", z: 1 });
          s2.elements.push(T(x, 本文の上 + Math.floor(高 / 2) - 14, 幅, 28, sp.label || "",
                             { size: 16, bold: true, align: "center", color: "#ffffff", z: 2 }));
          if (k < n2 - 1) {
            s2.elements.push({ id: M.uid("e"), type: "arrow",
                               x: x + 幅 + 4, y: 本文の上 + Math.floor(高 / 2) - 10,
                               w: 22, h: 20, z: 1 });
          }
        });
        本文の上 += 高 + 16;
      }
      /* 残りの高さがあれば 箇条書きも添える（表やグラフの説明になる） */
      if (箇条 && 本文の上 < H - 80) {
        s2.elements.push(T(70, 本文の上, W - 140, H - 40 - 本文の上, 箇条,
                           { size: 表グラフ図形あり(sl) ? 16 : 20, lh: 1.8 }));
      }
    }
    if (sl.notes) s2.notes = String(sl.notes).slice(0, 500);
    /* ★ 念のための最後の関所（2026-08-16）。
       ここを空のまま返すと **まっ白な 1 枚**が出来上がる。
       題も本文も無いときは、そもそも作らない（呼び側で捨てる）。 */
    /* * 表・グラフ・図形だけの枚を 捨てないこと（2026-08-16）。
       文字が無いからといって 空ではない。 */
    var 中身がある = s2.elements.some(function (e) { return String(e.text || "").trim(); })
      || s2.elements.some(function (e) {
           return e.type === "table" || e.type === "chart" || e.type === "shape" || e.type === "image";
         });
    if (!中身がある) return null;
    return s2;
  }

  function wpBody(kind, j, M) {
    var uid = function (p) { return p + Math.random().toString(36).slice(2, 9); };
    if (kind === "document") {
      /* ★ **text 以外の欄を捨てない**（2026-08-16）。
         これまで {id,type,text} しか写していなかったので、
         表（rows）が返ってきても 画面には空の塊しか出なかった。 */
      var blocks = j.blocks.map(function (b) {
        var o2 = { id: uid("b"), type: b.type === "numbered" ? "number" : b.type,
                   text: String(b.text || "") };
        if (b.rows) { o2.rows = b.rows; o2.header = b.header !== false; }
        if (b.src) { o2.src = b.src; o2.alt = b.alt || ""; o2.caption = b.caption || ""; }
        /* ★ 記入欄・解答欄（2026-08-17）。**持っていない値は 埋めない**を
           形にするための箱。ここで受け取らないと、モデルが field を
           返しても ただの段落になり、また それらしい値が 埋まる。 */
        if (o2.type === "field") {
          o2.label = String(b.label || b.key || "");
          o2.key = String(b.key || b.label || "");
          o2.dataType = String(b.dataType || "text");
          o2.hint = String(b.hint || (o2.label ? o2.label + " を書く欄です" : ""));
          o2.text = "";
        }
        if (o2.type === "answerSpace") {
          o2.lines = Math.max(1, Math.min(20, Number(b.lines) || 3));
          o2.label = String(b.label || ""); o2.text = "";
        }
        return o2;
      });
      var base = M.emptyBody("document");
      base.blocks = blocks;
      return base;
    }
    if (kind === "spreadsheet") {
      var base2 = M.emptyBody("spreadsheet");
      base2.sheets[0].cells = 表にする(j, M);
      return base2;
    }
    if (kind === "presentation") {
      var base3 = M.emptyBody("presentation");
      if (j.theme) base3.theme = j.theme;
      base3.slides = j.slides.map(function (sl, i) { return スライドにする(sl, i, M); })
        .filter(Boolean);
      /* まっ白しか作れなかったときは、少なくとも表紙は出す（白紙 6 枚を返さない） */
      if (!base3.slides.length) {
        base3.slides = [スライドにする({ title: j.title || "資料", bullets: [] }, 0, M)]
          .filter(Boolean);
      }
      if (!base3.slides.length) base3.slides = [M.newSlide("title")];
      return base3;
    }
    var base4 = M.emptyBody("form");
    base4.sections[0].title = j.title || "";
    base4.sections[0].description = j.description || "";
    var 直す型 = { text: "short_text", textarea: "long_text", radio: "single_choice",
                   select: "dropdown", multiple_choice: "single_choice", rating: "scale" };
    base4.sections[0].fields = j.fields.map(function (f) {
      return { id: uid("f"), type: 直す型[f.type] || f.type, label: f.label,
               options: (f.options || []).map(function (o) { return { id: uid("o"), label: o }; }),
               required: !!f.required };
    });
    return base4;
  }

  function makeDocument(a) {
    var kind = WP_TYPE[String((a && a.kind) || "document")] || "document";
    var inst = String((a && a.instruction) || "").trim();
    if (!inst) return Promise.resolve({ だめ: "何を作るか教えてください。" });
    var WP = null, M = null, ST = null;
    try { WP = root.VQ2 && VQ2.workplace; M = WP && WP.model; ST = WP && WP.store; } catch (e) {}
    if (!WP || !M || !ST) return Promise.resolve({ だめ: "Workplace を使えません。" });

    return fetch(api() + "/api/wp/make", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ kind: kind, instruction: inst })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: (j && j.message) || "作れませんでした。" };
      var content = { schemaVersion: (M.SCHEMA_VERSION || {})[kind] || 1, content: wpBody(kind, j, M) };
      return ST.create(kind, { title: j.title, content: content }).then(function (res) {
        var mod = { document: WP.docs, spreadsheet: WP.sheets,
                    presentation: WP.slides, form: WP.forms }[kind];
        if (mod && mod.open) mod.open({ item: res.item, content: res.content });
        var 数 = j.blocks ? j.blocks.length + " 個のかたまり"
          : j.rows ? j.rows.length + " 行"
          : j.slides ? j.slides.length + " 枚"
          : (j.fields || []).length + " 個の質問";
        return settle(1200).then(function () {
          var now = lookScreen("");
          now.作った = j.title;
          now.中身 = 数;
          now.種類 = { document: "Docs", spreadsheet: "Sheets",
                       presentation: "Slides", form: "Forms" }[kind];
          return now;
        });
      });
    }).catch(function (e) {
      return { だめ: "作れませんでした（" + String(e && e.message || e).slice(0, 60) + "）" };
    });
  }

  /* ══ いまの画面を **勝手に送り込む**（2026-08-16・重大）════════════
     ★ 訴え「見えてる画面が古い」「何度押してと言ってもダメ」。
       原因は はっきりしている。Lumi は **自分で見に行ったときしか**
       画面を知らない。利用者が指で画面を変えても、Lumi の中の画面は
       会話を始めた時のまま止まっている。そのまま喋るので、
       出まかせ（ハルシネーション）になる。
     ★ 直しかた: **画面が変わるたびに、こちらから送り込む。**
       返事を求めない形（turnComplete: false）で入れると、Lumi は
       黙って受け取るだけで、次に聞かれたときに正しく答える。
       実測で「入れた直後は喋らない・そのあと正確に答える」を確認済み。
     ★ 送りすぎないよう、**中身が変わったときだけ**・2.5 秒に 1 回まで。 */
  /* ══ 番の切れ目に、いまの画面を そっと置いておく（2026-08-16）══════
     ★ ねらい: 声だけで話しているときも Lumi が画面を知っている状態にする。
       利用者は 画面の共有（許可・帯つき）を望まなかったので、
       **文字の写しを、番と番のあいだに 1 回だけ**置く。
     ★ 守ること
       ・向こうが喋っている/組み立てている間は 絶対に入れない（返事が壊れる）
       ・返事は求めない（turnComplete: false）
       ・同じ画面なら送らない
       ・15 秒に 1 回まで（記録を膨らませない） */
  /* ══ 道具ごとの 締め切り（2026-08-20）════════════════════════════
     ★ ほとんどの 道具は 一瞬で 返る。返らないのは 何かが 壊れたとき。
     ★ 待つのが 仕事の 道具（waitFor）と、外へ 出かける 道具
       （調べもの・書きもの・動くもの）は 長めに 見る。
     ★ ここで 決めた 時間を 過ぎたら **時間切れとして 返す**。
       黙って 待ち続けるより、正直に「終わらなかった」と 返すほうが よい。 */
  var 長くかかる道具 = { findPicture: 1, usePicture: 1,
    showApp: 1, showKata: 1, researchRead: 1, researchSearch: 1, searchWeb: 1,
    makeDocument: 1, reviewDocument: 1, readAttachment: 1, docsWrite: 1, sheetsWrite: 1,
    slidesWrite: 1, formsWrite: 1, deckWrite: 1, deckFinish: 1, makePreset: 1,
    startQuiz: 1, startDraft: 1, addQuestion: 1, editPresetQuestions: 1 };
  function 道具の締め切り(name, a) {
    /* 確かめるとき用の 差し替え口（ふだんは 使われない）。 */
    var 上書き = Number(root.VQ_TOOL_DEADLINE || 0);
    if (上書き > 0) return 上書き;
    if (name === "waitFor") {
      var 秒 = Math.min(Math.max(Number(a && a.seconds) || 20, 3), 90);
      return 秒 * 1000 + 15000;                  /* 待つのが 仕事。その ぶんは 足す */
    }
    return 長くかかる道具[name] ? 90000 : 30000;
  }

  function 画面をそっと置く(のこり) {
    /* なぜ置けなかったかを数える（推測で直さないため） */
    st.おけない = st.おけない || {};
    var やめる = function (なぜ) {
      st.おけない[なぜ] = (st.おけない[なぜ] || 0) + 1;
      /* ★ ふさがっているだけなら **少し待って もう一度**。
         実測: 喋り終わりでも 一瞬 st.heard が立っていて 1 度も置けなかった。 */
      if (なぜ !== "会話していない" && なぜ !== "同じ画面" && なぜ !== "間がない"
        && (のこり === undefined ? 6 : のこり) > 0) {
        setTimeout(function () { 画面をそっと置く((のこり === undefined ? 6 : のこり) - 1); }, 1500);
      }
      return;
    };
    if (!st.on || !st.ws || st.ws.readyState !== 1) return やめる("会話していない");
    if (st.speaking) return やめる("まだ喋っている");
    if (st.inTurn) return やめる("返事を組み立てている");
    if (st.heard) return やめる("こちらが喋っている");
    /* ★ 打っている 途中の 字を 見せない（2026-08-20・訴え
       「まだ 書ききれてないのに 答え合わせを してしまう」）。 */
    if (打っている最中か()) return やめる("人が 打っている最中");
    if (Date.now() - (st.おいた時 || 0) < 15000) return やめる("間がない");
    var 文 = "";
    try {
      var r = readScreen({});
      var 行 = (r.書いてあること || []).slice(0, 14).join(" / ");
      if (!行) return;
      文 = "［いまの画面］" + (r.いまの画面 || "") + " ／ " + 行.slice(0, 700);
    } catch (e) { return; }
    if (文 === st.おいた文) { st.おけない["同じ画面"] = (st.おけない["同じ画面"] || 0) + 1; return; }
    /* 送る直前に もう一度 空いているか見る（この間に喋り出していることがある） */
    if (st.speaking || st.inTurn || st.heard) return;
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text:
          文 + "\n（これは自動の知らせです。返事は要りません。"
             + "利用者が画面のことを聞いたときに使ってください。）" }] }],
        turnComplete: false
      } }));
      st.おいた文 = 文; st.おいた時 = Date.now(); st.おいた回 = (st.おいた回 || 0) + 1;
    } catch (e) {}
  }

  /* ══ いまの画面を **短くひとまとめ**（2026-08-16）════════════════════
     ★ 文字で送るときに 一緒に渡す用。長すぎると本文が埋もれるので
       1000 字ほどで切る。押せるものは入れない（打つ人は目で見えている）。 */
  function 画面のひとまとめ() {
    var r;
    try { r = readScreen({}); } catch (e) { return ""; }
    var 文 = (r.書いてあること || []).slice(0, 16).join(" / ");
    if (!文) return "";
    return "\n\n（※ここから下は こちらが自動で足した 画面の写しです。"
      + "利用者が打った言葉ではありません。場所: " + (r.いまの画面 || "")
      + " ／ 出ているもの: " + 文.slice(0, 900) + "）";
  }

  function screenBrief() {
    var l = lookScreen("");
    var r = readScreen({});
    var 押 = (l.操作できるもの || []).slice(0, 24).join(" / ");
    var 文 = (r.書いてあること || []).slice(0, 16).join(" / ");
    st.pushN = (st.pushN || 0) + 1;
    /* ★ **版番号を付ける**（2026-08-16）。
       送り込んだ画面は会話の記録に積み上がるので、Lumi が
       **古いものを見て答える**ことがあった（「今はこれだよ！」と
       言われて初めて直す、という訴えの正体）。
       毎回いちばん新しい番号を付け、それより前は無効だと言い切る。 */
    var t = "［画面 #" + st.pushN + "］これがいまの画面です。"
      + "#" + st.pushN + " より前の画面の知らせは すべて古いので、無いものとして扱ってください。"
      + "\n場所: " + (l.いまの画面 || "")
      + "\n押せるもの: " + 押
      + "\n書いてあること: " + 文;
    return t.slice(0, 1700);
  }

  /* ★ 送り込んでよいのは **相手が黙っているとき だけ**（2026-08-16・重大）。
     ★ 返事を組み立てている最中に turnComplete:false を差し込むと、
       その番が**未完のまま**になり、**何も返ってこなくなる**（実測の訴え）。
     ★ しかも字幕を出すのも画面の書き換えなので、見張りが自分の字幕に
       反応して送り続けていた。自分の部品は見ない。 */
  function canPush() {
    if (!st.on || !st.ws || st.ws.readyState !== 1) return false;
    if (st.speaking) return false;          /* Lumi が喋っている */
    if (st.inTurn) return false;            /* 返事を組み立てている */
    if (st.heard) return false;             /* こちらが喋っている最中 */
    if (打っている最中か()) return false;   /* 人が 打っている最中（2026-08-20） */
    return true;
  }

  /* ══ 画面の送り込みは **やめた**（2026-08-16・重要な判断）════════════
     ★ 会話の流れに turnComplete:false で差し込む方式を試したが、
       返事が **遅れる／返ってこなくなる**（実測: 1 つ目の答えが
       3 つ目に出た。挨拶と 1 回目は無言）。番の途中に入るのが原因で、
       入れる場所をいくら選んでも、根っこが危うい。
     ★ しかも 送り込んだ画面は会話の記録に **積み上がる**ので、
       Lumi が古いものを見て答える元にもなっていた（訴えの「過去の情報」）。
     ★ だから **記録には何も積まない**。画面のことは必ず道具で確かめさせる。
       道具の返事は常に「いまの画面」なので、古くなりようがない。
     ★ 仕組みは残す（VQ_PUSH=1 のときだけ動く）。戻したくなったとき用。 */
  function pushScreen(force) {
    if (!root.VQ_PUSH) return;
    if (st.inTurn && Date.now() - (st.audioAt || 0) > 6000
      && Date.now() - (st.turnAt || 0) > 6000) st.inTurn = false;
    if (!canPush()) return;
    var now = Date.now();
    if (!force && now - (st.pushAt || 0) < 1500) return;
    var t;
    try { t = screenBrief(); } catch (e) { return; }
    /* 版番号を除いて中身を比べる（同じ画面なら送らない） */
    var body = t.replace(/^［画面 #\d+］[^\n]*/, "");
    if (!force && body === st.pushLast) { st.pushN--; return; }
    st.pushLast = body; st.pushAt = now;
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: t }]}],
        turnComplete: false                        /* ★ 返事は求めない */
      }}));
    } catch (e) {}
  }

  /* ══ 人が **打っている最中**か（2026-08-20・訴え）════════════════════
     「入力したら、なぜか すぐに 次に 進んじゃう せいで、
       まだ 書ききれてないのに 答え合わせを してしまう。打ち終わっても
       いないのに」

     ★ 原因は **こちらから 話しかけていた**こと。
       ・番の終わりに「いまの画面」を そっと置く（画面をそっと置く）
       ・仕事が 途中なら 自動で 続きを 頼む（促し）
       この 2 つが、**打っている 途中の 字**を Lumi に 見せる。
       Lumi は それを 答えだと 思って 丸を つける。
       利用者は 何も 送っていないのに 答え合わせが 済んでしまう。

     ★ だから **打っている間は こちらから 手を出さない**。
       打ち終わって 4 秒 経つまで 待つ。

     ★ 影の DOM の 中で 打たれることが ある（クイズは その中）。
       document で 受けると 的が **入れ物**に すり替わるので、
       composedPath の 先頭（本当に 打たれた所）を 見る。 */
  function 打つ場所か(e) {
    if (!e || e.nodeType !== 1) return false;
    var t = String(e.tagName || "").toLowerCase();
    if (t === "input") {
      var ty = String(e.type || "text").toLowerCase();
      return ["button", "submit", "checkbox", "radio", "range", "file", "reset", "image"].indexOf(ty) < 0;
    }
    if (t === "textarea") return true;
    try { if (e.isContentEditable) return true; } catch (x) {}
    return false;
  }
  function 自分の部品か(e) {
    var hop = 0;
    while (e && hop++ < 24) {
      var id = e.id || "";
      if (id === "vqLiveBar" || id === "vqLiveEdge" || id === "vqLiveNote"
        || id === "vqLiveType" || id === "vqLiveBtn" || id === "vqLiveCap"
        || id === "vqLiveAR" || id === "vqLiveLog") return true;
      e = e.parentElement || (e.host ? e.host : (e.getRootNode ? e.getRootNode().host : null));
    }
    return false;
  }
  function 打鍵を見張る() {
    if (st.打鍵見張り) return;
    st.打鍵見張り = function (ev) {
      try {
        var e = (ev.composedPath && ev.composedPath()[0]) || ev.target;
        if (!打つ場所か(e) || 自分の部品か(e)) return;
        st.打鍵時 = Date.now();
      } catch (x) {}
    };
    try {
      doc.addEventListener("input", st.打鍵見張り, true);
      doc.addEventListener("keydown", st.打鍵見張り, true);
    } catch (x) {}
  }
  function 打鍵の見張りをやめる() {
    if (!st.打鍵見張り) return;
    try {
      doc.removeEventListener("input", st.打鍵見張り, true);
      doc.removeEventListener("keydown", st.打鍵見張り, true);
    } catch (x) {}
    st.打鍵見張り = null; st.打鍵時 = 0;
  }
  /* 打ち終わりを 待つ長さ。短いと 打っている 途中で 割り込む。
     長いと 何も 打っていないのに 黙り続ける。4 秒。 */
  var 打鍵の間 = 4000;
  function 打っている最中か() {
    return !!(st.打鍵時 && Date.now() - st.打鍵時 < 打鍵の間);
  }

  /* 画面の書き換わりを見張って、落ち着いたら送る */
  function watchScreen() {
    打鍵を見張る();
    if (st.sMo) return;
    var t = null;
    var mine = function (n) {
      var e2 = n && (n.nodeType === 1 ? n : n.parentElement);
      var hop = 0;
      while (e2 && hop++ < 20) {
        if (e2.id === "vqLiveCap" || e2.id === "vqLiveEdge"
          || e2.id === "vqLiveBar" || e2.id === "vqLiveType" || e2.id === "vqLiveBtn") return true;
        e2 = e2.parentElement || (e2.host ? e2.host : null);
      }
      return false;
    };
    var kick = function (ms) {
      /* ★ 自分が出した字幕やフチの書き換えでは動かない */
      var ours = true;
      for (var i = 0; i < ms.length; i++) {
        if (!mine(ms[i].target)) { ours = false; break; }
      }
      if (ours) return;
      clearTimeout(t);
      t = setTimeout(function () { pushScreen(false); }, 600);
    };
    try {
      st.sMo = new root.MutationObserver(kick);
      st.sMo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (e) {}
    /* 見張りが効かない作りのときのために、定期的にも見る */
    st.sIv = setInterval(function () { pushScreen(false); }, 3000);
  }
  function unwatchScreen() {
    打鍵の見張りをやめる();
    try { if (st.sMo) st.sMo.disconnect(); } catch (e) {}
    st.sMo = null;
    clearInterval(st.sIv);
    st.pushLast = ""; st.pushAt = 0; st.pushN = 0;
  }

  /* ══ 目的を持って、終わるまで自分で進む（2026-08-16）════════════════
     ★ Lumi は 1 手やって喋って番を終えがち。目的を預かり、道具の返事に
       毎回添えることで、何のためにやっているかを忘れないようにする。
     ★ 止まらなくなるのを防ぐため、手数に上限（25 手）。 */
  function startTask(a) {
    st.goal = String((a && a.goal) || "").slice(0, 200);
    st.steps = 0;
    /* ★ 頼まれごとが 2 つ以上つながっているとき、**順番に全部**やらせる
       （2026-08-16）。「A して、B もして、そのあと C」で A だけやって
       喋り出し、B と C が消えていた。予定表を預かって毎回突きつける。 */
    var ss = (a && a.steps) || [];
    if (!Array.isArray(ss)) ss = String(ss || "").split(/[、,]/);
    /* ★ 8 件までだった（2026-08-19・訴え「大規模タスクにも 難なく」）。
       「30 ページの 資料」「50 問の 問題集」のような 頼みは
       **9 件目から 黙って 落ちて**いた。落ちたぶんは 誰も 気づけない。
       40 件まで 預かる。超えるぶんは **落とさずに 伝える**。 */
    var 全部 = ss.map(function (x) { return String(x || "").trim().slice(0, 120); })
                 .filter(Boolean);
    st.plan = 全部.slice(0, 40);
    st.あふれ = Math.max(0, 全部.length - st.plan.length);
    st.planOk = []; st.planAt = 0;
    st.done = [];
    /* 自動の続きの数え直し。**ここから見張りを始める**
       （番が終わるのを待つと、番が終わらないまま止まったときに気づけない）。 */
    st.促し回 = 0; st.空回り = 0; st.促し時の道具回 = st.道具回 || 0;
    st.仕事おわり = false;
    try { 促しを仕込む(20000); } catch (e) {}
    var now = lookScreen("");
    now.はじめた目的 = st.goal;
    if (st.plan.length > 1) {
      now.やること = st.plan.map(function (x, i) { return (i + 1) + ". " + x; });
      if (st.あふれ) now.預かれなかった件数 = st.あふれ
        + "（40 件まで しか 預かれません。終わってから planAdd で 足してください）";
      now.進めかた = "**" + st.plan.length + " 件ぜんぶ**やります。"
        + "1 件終わるたびに stepDone を（証拠つきで）呼び、そのまま次へ進んでください。"
        + "**途中で喋って番を終えないでください。**"
        + "最後の 1 件が終わったら finishTask です。";
    } else {
      now.進めかた = "この目的に届くまで、道具を呼び続けてください。"
        + "1 手ごとに いまの画面が返ります。終わったら finishTask を呼びます。"
        + "**finishTask には証拠が要ります。**";
    }
    return now;
  }

  /* ══ 予定を 途中で 足す（2026-08-19・大きな仕事）════════════════
     やってみて 初めて 分かる 段取りが ある（「表が 3 つ あったので
     それぞれ 図にする」など）。足せないと **黙って 諦める**しか なくなる。 */
  function planAdd(a) {
    a = a || {};
    if (!st.goal) return { だめ: "先に startTask で 目的を 立ててください。" };
    var ss = a.steps || a.step || [];
    if (!Array.isArray(ss)) ss = [ss];
    var 足す = ss.map(function (x) { return String(x || "").trim().slice(0, 120); }).filter(Boolean);
    if (!足す.length) return { だめ: "足す件が ありません。" };
    st.plan = st.plan || []; st.planOk = st.planOk || [];
    var 入る = Math.max(0, 40 - st.plan.length);
    var 実際 = 足す.slice(0, 入る);
    実際.forEach(function (x) { st.plan.push(x); st.planOk.push(false); });
    return { 足した: 実際, 入らなかった: 足す.length - 実際.length,
             ぜんぶで: st.plan.length, のこり: のこり件().length,
             つぎ: "そのまま 続けてください。**番を 終えないでください。**" };
  }
  /* いまの 進み具合（人にも Lumi にも 同じものを 見せる） */
  function planShow() {
    if (!st.goal) return { 仕事: "なし" };
    var 済 = (st.planOk || []).filter(Boolean).length;
    return { 目的: st.goal, ぜんぶ: (st.plan || []).length, 済んだ: 済,
             のこり: のこり件(), 手数: st.steps || 0,
             あふれ: st.あふれ || 0 };
  }

  /* 残っている件（済んでいないもの） */
  function のこり件() {
    var out = [];
    (st.plan || []).forEach(function (x, i) { if (!(st.planOk || [])[i]) out.push(x); });
    return out;
  }

  /* ══ 自分で 最後まで進む（2026-08-17・訴えへの直し）═════════════════
     ★ 訴え「いちいちこっちが返事しないと進めないし、最後まで自律的に通さない」。
       実物は 1 枚の目次だけ作って止まっていた。
     ★ 原因は はっきりしている。**番が終わったあと、続きを促す仕組みが
       1 つも無かった。** 向こうは 1 番のうちに 1〜2 手 打つと喋って番を閉じる。
       閉じたら、こちらが何か言うまで 永久に止まる。
       仕事の予定（st.plan）は残っているのに、誰も次を頼まない。
     ★ 直しかた: **予定が残っているあいだは、こちらから黙って次を頼む。**
       声は出さない。人が話しかけたら すぐ譲る。
     ★ 止まらなくなると困るので、歯止めを 4 つ置く。
        ① 予定が全部終わったら もう促さない
        ② 質問の窓が出ている＝**人の番**なので促さない
        ③ 促しても **道具を 1 つも呼ばなかった**のが 3 回続いたら 諦めて伝える
        ④ 1 つの仕事につき 40 回まで
     ★ 「重要な選択」だけは 人に聞く。それ以外で聞き返してきたときは、
       この促しが「あなたが決めて進めて」と返すので、止まらない。 */
  /* 人には聞こえない形で、こちらから一言だけ送る。 */
  function 自動で送る(文) {
    if (!st.on || !st.ws || st.ws.readyState !== 1) return false;
    try {
      st.ws.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: 文 }] }], turnComplete: true } }));
      return true;
    } catch (e) { return false; }
  }

  /* ══ ★ **返しっぱなしの 見張り**（2026-08-29・訴え）════════════════
     ★ 訴え: 「聞いています のまま 止まって、こちらから 一言 言わないと
       動かない。クエスチョンに 限らない」。
     ★ 何が 起きているか: 道具の 答えを 返したあと、向こうが
       次の 番を 組み立てないまま 黙ることが ある（取りこぼし）。
       こちらは 待ちの 姿勢（聞いています）に なるので、
       人が 何か 言うまで 永久に 止まる。
     ★ 直しかた: 道具の 答えを 返したら 時計を 置く。
       ・声が 鳴り出した／番を 組み立て始めた／次の 道具が 動いた → 取り消す
       ・人が しゃべった → 取り消す（そちらが 優先）
       ・何も 起きないまま 過ぎた → **人には 聞こえない 合図**を 1 つ送る
     ★ 促し（続きを促す）とは 別もの。あちらは「長い仕事の 続き」、
       こちらは「返事が 落ちた」ときの 拾い直し。だから **2 回まで**。 */
  var 見張り待ち = 7000;          /* 道具の 答えを 返してから これだけ待つ */
  function 返事の見張りを止める(なぜ) {
    if (st.見張りt) { clearTimeout(st.見張りt); st.見張りt = 0; if (なぜ) st.見張り理由 = なぜ; }
  }
  function 返事の見張りを仕込む(resps) {
    返事の見張りを止める();
    st.見張り基 = st.道具回 || 0;
    st.見張り人 = st.人の番 || 0;
    /* 段取りの 答えが そろった 直後は とくに 落ちやすいので 早めに 見る。 */
    var 段取り = false;
    try {
      段取り = !!(resps && resps.some && resps.some(function (r) { return r && r.name === "askPlan"; }));
    } catch (e) {}
    st.見張り段 = 段取り;
    st.見張り番 = st.turnAt || 0;
    st.見張り回 = 0;
    st.見張りt = setTimeout(返事を待つ, 段取り ? 5000 : 見張り待ち);
  }
  function 返事を待つ() {
    st.見張りt = 0;
    if (!st.on || !st.ws || st.ws.readyState !== 1) return;
    /* ── ここで やめる（もう 拾う 必要が 無い） ── */
    if ((st.道具回 || 0) !== st.見張り基) return;          /* 次の 道具が 動いた＝生きている */
    if ((st.人の番 || 0) !== st.見張り人) return;          /* 人が しゃべった＝そちらが 優先 */
    /* ★ 段取りの あとだけは「喋ったから もういい」と しない。
       「では 始めますね」と 言って 何も しない のが まさに 訴えの 中身。
       startPlan（＝道具）が 動くまで 見張り続ける。 */
    if (!st.見張り段 && (st.turnAt || 0) !== st.見張り番) return;   /* 返事が 来た */
    /* ── ここは まだ 待つ（少し あとで もう一度） ── */
    if (問い窓 || st.speaking || st.inTurn
      || Date.now() - (st.人の番 || 0) < 2500) {
      st.見張りt = setTimeout(返事を待つ, 1800);
      return;
    }
    st.見張り回 = (st.見張り回 || 0) + 1;
    if (st.見張り回 > 2) return;                           /* 2 回で あきらめる */
    var 文 = st.見張り段
      ? "（これは自動の合図です。利用者は何も言っていません）\n"
        + "**質問の答えは もう そろっています。**\n"
        + "★ 同じことを 声で 聞き直さないでください。\n"
        + "★ 感想や「では始めますね」を 喋らないでください。\n"
        + "★ **いま すぐ startPlan を呼んでください。**"
        + "answers には さっき返ってきた 答えを そのままの順で、"
        + "steps には やる順を 1 件ずつ 入れます。"
      : "（これは自動の合図です。利用者は何も言っていません）\n"
        + "**道具の答えは もう 返っています。そこから 続けてください。**\n"
        + "★ 黙ったままにしないでください。"
        + "次にやることが あるなら **道具を すぐ呼び**、"
        + "終わっているなら **結果を 一言で 伝えて**ください。\n"
        + "★ できていないことを できたと 言わないこと。";
    if (!自動で送る(文)) return;
    noteEv("★ 返事が 落ちたので 拾い直した（" + st.見張り回 + " 回目"
      + (st.見張り段 ? "・段取りの あと" : "") + "）");
    st.見張りt = setTimeout(返事を待つ, 9000);
  }

  /* ★ 催促してよいのは **これらが動いたとき だけ**（2026-08-17・訴え）。
     「ホーム画面に戻って」で画面を動かす道具が動いただけでも
     『仕事の途中』とみなして 12 秒おきに 40 回 催促していた。 */
  var 作る道具 = {
    newFile: 1, makeDocument: 1,
    docsWrite: 1, docsEdit: 1, sheetsWrite: 1, sheetsEdit: 1,
    slidesWrite: 1, slidesEdit: 1, formsWrite: 1, formsEdit: 1,
    deckStart: 1, deckDesign: 1, deckWrite: 1,
    editDocument: 1
  };
  /* ★ **仕事の終わりの道具**（2026-08-17・訴え「保存するたびにうるさい」）。
     fileAction（保存）を 作る道具に入れていたのが原因。
     「保存して」と言われて保存しただけで『作りかけ』になり、
     finishTask を呼ばない普通のやりとりに 12 秒おきに催促していた。
     **保存は 仕事の終わり。**ここに来たら 催促の種を消す。
     runCommand（画面の操作）も 作りものではないので外した。 */
  var 終わりの道具 = { fileAction: 1, deckFinish: 1, finishTask: 1 };
  /* 画面の上に出す言葉。**何をしているか**を そのまま書く。
     「生成中…」で片づけると、保存しているだけのときも
     まだ作っているように見えて 誤解を生む。 */
  var 作業の言いかた = {
    newFile: "書類を作っています…", fileAction: "保存しています…",
    makeDocument: "下書きを作っています…", editDocument: "直しています…",
    docsWrite: "文書を書いています…", docsEdit: "文書を直しています…",
    sheetsWrite: "表を作っています…", sheetsEdit: "表を直しています…",
    slidesWrite: "スライドを作っています…", slidesEdit: "スライドを直しています…",
    formsWrite: "フォームを作っています…", formsEdit: "フォームを直しています…",
    runCommand: "操作しています…", docDesign: "見た目を 決めています…",
    sheetsPivot: "集計しています…"
  };

  function 促しを止める(なぜ) {
    if (st.促しt) { clearTimeout(st.促しt); st.促しt = 0; }
    if (なぜ) noteEv("★ 自動の続きを止めた（" + なぜ + "）");
    st.促し中 = false;
  }
  function 促しを仕込む(ms) {
    if (st.促しt) clearTimeout(st.促しt);
    st.促しt = setTimeout(続きを促す, ms === undefined ? 1500 : ms);
  }

  function 続きを促す() {
    st.促しt = 0;
    if (!st.on || !st.ws || st.ws.readyState !== 1) return;
    var 残 = のこり件();
    /* ══ ★ **startTask を呼ばずに作業を始めることがある**（2026-08-17・実測）
       ★ 最初は st.goal（startTask で立つ）だけを見ていた。
         ところが Lumi は 予定を立てずに いきなり作り始めることがあり、
         そのときは st.goal が空なので **促しが一度も動かなかった。**
         実測: 10 枚の依頼で 3 枚まで作って止まり、自動の続きは 0 回。
       ★ だから **2 つのどちらか**で続きとみなす。
           ① 予定（startTask）が残っている
           ② 頼まれごとに対して 道具が動いたのに、まだ finishTask していない
         ②があるので、予定を立てない進め方でも 止まらない。 */
    /* ══ ★★ **催促は「作りかけの書類がある」ときだけ**（2026-08-17・訴えで判明）
       ★ 前は「道具が 1 つでも動いた」を『途中』とみなしていた。
         そのせいで「ホーム画面に戻って」のような **一言の頼み**でも、
         画面を切り替える道具が動いた時点で 途中あつかいになり、
         finishTask を呼ばない普通の受け答えに対して
         **12 秒おきに 40 回 催促し続けていた。**
         利用者から見ると「同じことを何度も聞いてくる」「勝手に進める」。
         これは 直し漏れではなく **こちらの入れた仕組みの暴走**。
       ★ 直しかた: 催促してよいのは 次の 2 つだけにする。
           ① startTask で立てた予定が **まだ残っている**
           ② **書類を作る道具が動いた**のに まだ仕上げていない
         ②は「作る道具」（docsWrite / slidesWrite / deck* など）に限る。
         画面を動かすだけ・調べるだけの道具では 催促しない。
       ★ さらに、利用者が何か言ったら **その場で止める**（下の 人の番 で）。 */
    var 予定あり = !!(st.goal && st.plan && st.plan.length && 残.length);
    var 途中 = !!(st.作りかけ && !st.仕事おわり
      && Date.now() - (st.作りかけ.at || 0) < 900000);
    /* ★★ **書類がもう整っているなら 催促しない**（2026-08-17・訴え）。
       ここが 最後の歯止め。道具の名前でどれだけ場合分けしても、
       想定していない道具の組み合わせで また鳴ってしまう。
       「その書類が **自分の見直しに通るか**」という
       中身そのものの条件なら、道具が何であっても取りこぼさない。
       通っている＝直す所が無い＝**催促する理由が無い**。 */
    if (途中) {
      try {
        var K3 = WPC(), c3 = K3 && K3.いま();
        if (c3) {
          var r3 = K3.見直す({});
          if (r3 && r3.見つかった数 === 0) { st.作りかけ = null; 途中 = false; }
        }
      } catch (e6) {}
    }
    if (!予定あり && !途中) {
      if (st.goal && st.plan && st.plan.length && !残.length)
        return 促しを止める("予定は全部おわった");
      return 促しを止める("催促する理由が無い");
    }
    if (問い窓) return 促しを仕込む(2500);      /* 人が答えている最中 */
    /* ★ 打っている 最中は 催促しない（2026-08-20・訴え）。
       催促すると Lumi は 画面を 見に行き、打ちかけの 字を
       **答えだと 思って 丸を つける**。 */
    if (打っている最中か()) return 促しを仕込む(1500);
    /* 人が最近しゃべった／打ったなら、そちらが優先。少し待つ。 */
    if (Date.now() - (st.人の番 || 0) < 2500) return 促しを仕込む(1500);
    /* ══ ★ **ふさがっているだけで 永久に先送りしない**（2026-08-17・実測）
       ★ マイクを開けていると st.heard が立ちっぱなしになることがあり、
         「まだ喋っている」と見なして 促しが **一度も出なかった**。
         実測: 10 枚の依頼で 12 分間、自動の続きが 0 回。
       ★ だから **詰まっているか**で見分ける。
         最後に道具が動いてから 25 秒 何も起きていないなら、
         それは喋っているのではなく **止まっている**。そこでは出す。 */
    var 止まって = Date.now() - (st.最後の道具時 || 0);
    var 詰まった = 止まって > 25000;
    if (!詰まった && (st.speaking || st.inTurn || st.heard)) return 促しを仕込む(1200);

    st.促し回 = (st.促し回 || 0) + 1;
    /* ★ 上限を 40 → 8 へ（2026-08-17・訴え）。
       12 秒おきに 40 回＝8 分 鳴り続ける。うるさすぎる。
       本当に長い仕事でも、8 回 促して進まないなら 仕組みの側が悪い。 */
    if (st.促し回 > 8) return 促しを止める("8 回に達した");

    /* 前の促しから **道具が動いたか**。動いていないなら 空回り。 */
    var 打った = (st.道具回 || 0) - (st.促し時の道具回 || 0);
    if (打った <= 0) st.空回り = (st.空回り || 0) + 1;
    else st.空回り = 0;
    st.促し時の道具回 = st.道具回 || 0;
    if (st.空回り >= 2) {
      自動で送る("★ 3 回 頼んでも 道具が動きませんでした。"
        + "**できていないことを 正直に伝えて**ください。"
        + "何が足りないのか（分からない・権限が無い・材料が無い）を一言で言い、"
        + "そこで止めてください。作れたふりをしないこと。");
      return 促しを止める("3 回 空回りした");
    }

    var 文 = "（これは自動の合図です。利用者は何も言っていません。返事は要りません）\n"
      + "**まだ仕事の途中です。そのまま続けてください。**\n"
      + (st.goal ? "目的: " + st.goal + "\n"
         : (st.未処理 ? "頼まれたこと: " + String(st.未処理.文).slice(0, 300) + "\n" : ""))
      + (残.length ? "のこり: " + 残.map(function (x, i) { return (i + 1) + ". " + x; }).join(" / ") + "\n" : "")
      + "★ ここで感想や確認を喋らないでください。**次の道具を すぐ呼びます。**\n"
      + "★ 聞きたいことがあっても、**重要な選択でなければ あなたが決めて**進めてください。\n"
      + "★ 書類を作っているなら、中身を入れ終えたら reviewDocument で崩れを 0 にし、"
      + "fileAction(save) で保存してから finishTask です。";
    if (!自動で送る(文)) return;
    st.促し中 = true;
    noteEv("★ 自動で続きを頼んだ（" + st.促し回 + " 回目・のこり " + 残.length + " 件）");
    促しを仕込む(12000);      /* 返事が来なければ 12 秒後に もう一度見る */
  }

  /* 予定の 1 件が終わった。証拠を見て、次の件へ進める。 */
  function stepDone(a) {
    if (!st.plan || !st.plan.length) {
      return { だめ: "予定を立てていません。"
        + "頼まれごとが 2 つ以上あるときは、startTask の steps に全部入れてから使ってください。" };
    }
    var 残 = のこり件();
    if (!残.length) {
      return { だめ: "予定はもう全部おわっています。finishTask を呼んでください。" };
    }
    /* ★ どの件が終わったのかを 言えるようにする（2026-08-16）。
       順番どおりに進むとは限らない。指定が無ければ 先頭の残りとみなす。 */
    var idx = -1;
    var 指定 = String((a && a.step) || "").trim();
    if (指定) {
      for (var i = 0; i < st.plan.length; i++) {
        if ((st.planOk || [])[i]) continue;
        if (st.plan[i].indexOf(指定) >= 0 || 指定.indexOf(st.plan[i]) >= 0) { idx = i; break; }
      }
    }
    if (idx < 0) {
      for (var k = 0; k < st.plan.length; k++) if (!(st.planOk || [])[k]) { idx = k; break; }
    }
    var cur = st.plan[idx];
    var ev = String((a && a.evidence) || "").trim();
    if (!ev) {
      return { だめ: "「" + cur + "」が終わった **証拠** が要ります。"
        + "画面に出ている言葉か、道具が返した「閉じた」「ゴミ箱へ入れた」「消した」「押した」"
        + "などの文言を evidence に入れて、もう一度呼んでください。" };
    }
    var r2 = onScreenNow(ev);
    if (!r2.ある) {
      var n0 = lookScreen("");
      return { だめ: "「" + ev + "」は **画面にも、済ませたことの控えにも ありません**。"
                 + "「" + cur + "」は まだ終わっていません。",
               いまの画面: n0.いまの画面,
               いま押せるもの: (n0.操作できるもの || []).slice(0, 14),
               使える証拠: (st.done || []).slice(-8),
               つぎ: "**「使える証拠」の中から 1 行を そのまま写して**、もう一度呼んでください。"
                 + "自分で考えた言葉は通りません。"
                 + "★ 見るだけの件（「できるか確かめる」「中身を読む」など）なら、"
                 + "**直前に呼んだ道具の名前（workplaceCan・readDocument など）を"
                 + "そのまま evidence に書けば通ります。**"
                 + "どれも当てはまらないなら、その件はまだ終わっていないので 作業を続けてください。" };
    }
    st.planOk = st.planOk || [];
    st.planOk[idx] = true;
    var 残2 = のこり件();
    if (!残2.length) {
      return { 終わった件: cur, 証拠: r2.見つけた,
               つぎ: "予定は **ぜんぶ終わりました**。finishTask を証拠つきで呼んでください。" };
    }
    return { 終わった件: cur, 証拠: r2.見つけた,
             のこり: 残2.map(function (x, i) { return (i + 1) + ". " + x; }),
             つぎの件: 残2[0],
             つぎ: "**まだ " + 残2.length + " 件 残っています。ここで喋らないでください。**"
               + "そのまま「" + 残2[0] + "」にとりかかって、道具を呼んでください。" };
  }

  /* ══ 「できた」と言うには **証拠**が要る（2026-08-16）════════════════
     ★ 訴え「○○できたよ → でも実際は嘘」。言い聞かせでは消えないので
       **終われない形**にする。画面に出ているはずの言葉を必ず添えさせ、
       こちらで探して、無ければ終わらせない。 */
  /* ══ できたことの控え（2026-08-16）════════════════════════════════
     ★ 証拠を「いま画面に出ているか」だけで見ていたら、**消す仕事で詰まった**。
       消したものは画面から消えるので、指させる証拠がそもそも無い。
       Lumi は通そうとして その辺にある関係ない言葉を証拠に出し、
       予定の勘定が狂った（実測 2026-08-16: 書類を消した証拠に
       タイマーの「止める」を出してきた）。
     ★ そこで、道具が **こちらで確かめて成し遂げたこと** を控えに残し、
       証拠は「画面」か「控え」のどちらかで通す。
       控えに入るのは 確認が取れたものだけなので、嘘は通らない。 */
  var 控えの印 = ["閉じた", "ゴミ箱へ入れた", "消した", "やった", "押した",
                 "入れた", "選んだ", "作った", "開いた", "終わった件",
                 "直した", "読んだ", "確かめた", "プリセット", "読んだ範囲"];
  /* ★ 道具の名前そのものも控える（2026-08-16）。
     「読む」仕事は 何も足さないので、これまで **証拠がどこにも残らず**、
     「問題を読む」という段取りを 永久に終われなかった（実測）。
     呼んで成功した事実は それ自体が証拠になる。 */
  /* 言い聞かせのための欄は 証拠にしない（道具が返した「事実」だけを残す） */
  var 控えない = { つぎ: 1, やること: 1, やめること: 1, 使える証拠: 1, 進めかた: 1,
                  だめ: 1, いまの目的: 1, いまやっている件: 1, つぎの件: 1 };
  function 控える(r, name) {
    if (!r || typeof r !== "object" || r.だめ) return;
    /* ★ **確かめられなかったものは 証拠にしない**（2026-08-16・監査）。
       前は afterAct が作った「やった」がそのまま控えへ入り、
       finishTask / checkDone が **自分でこしらえた文字列で通っていた**。
       唯一の固い関門が、でっち上げで開いていた。 */
    if (r.未確認) return;
    var 印 = [];
    /* ★ **道具が返した欄は 全部 証拠になる**（2026-08-16）。
       決まった名前だけ拾っていたので、「解説がまだ無い問: なし」のような
       実在する欄を証拠に出しても 通らず、そこで足踏みしていた（実測）。 */
    try {
      Object.keys(r).forEach(function (k) {
        if (控えない[k] || 印.length >= 10) return;
        var v = r[k];
        if (typeof v === "number") { 印.push(k + ": " + v); return; }
        if (typeof v === "string" && v && v.length <= 120) { 印.push(k + ": " + v); return; }
        /* ★ **並び（配列）も証拠にする**（2026-08-17・実測）。
           前は配列を丸ごと捨てていた。ところが workplaceCan / readDocument /
           listFormats のように **返りがほとんど配列**の道具では、
           控えに残るのが「済ませた道具: 〜」だけになる。
           Lumi は返ってきた中身（「Docs のかたまり: paragraph」など）を
           証拠に出すが、控えに無いので **必ず断られる**。
           実測: 1 手目まるごと空振りし、作業が次の番へずれ込んだ。 */
        if (Array.isArray(v) && v.length) {
          var 頭 = v.slice(0, 6).map(function (x) {
            if (x === null || x === undefined) return "";
            if (typeof x === "object") return String(x.題 || x.label || x.名 || x.type || x.id || "");
            return String(x);
          }).filter(Boolean).join(" / ").slice(0, 160);
          印.push(k + ": " + v.length + " 個" + (頭 ? "（" + 頭 + "）" : ""));
          return;
        }
        /* 中の 1 段だけは 見る（確かめた: {前, いま} のような形） */
        if (v && typeof v === "object" && 印.length < 8) {
          Object.keys(v).slice(0, 4).forEach(function (k2) {
            var v2 = v[k2];
            if (印.length >= 10) return;
            if (typeof v2 === "number") 印.push(k + "." + k2 + ": " + v2);
            else if (typeof v2 === "string" && v2 && v2.length <= 80) 印.push(k + "." + k2 + ": " + v2);
          });
        }
      });
    } catch (e) {}
    /* 決まった印は 先に置く（いちばん証拠に使われる） */
    控えの印.forEach(function (k) {
      if (typeof r[k] === "string" && r[k]) {
        var 行 = k + ": " + r[k];
        if (印.indexOf(行) < 0) 印.unshift(行);
      }
    });
    if (name) 印.unshift("済ませた道具: " + name);
    if (!印.length) return;
    st.done = (st.done || []).concat([印.join(" / ")]).slice(-40);
  }

  function onScreenNow(word) {
    var w = String(word || "").trim();
    if (!w) return { ある: false };
    var hit = [];
    /* ══ ★ **板（ボード）も 証拠として 見る**（2026-08-19・実測で 見つけた詰まり）
       readScreen は #vqLiveNote を **わざと 読まない**。
       あれは 正しい（読むと Lumi が 自分の書いた $ や \\frac を 読み上げ始める）。
       ところが 証拠を 確かめる ここでも 読まないので、
       **板に 書いたものは 一生 証拠に ならなかった**。
       「板に まとめる」を 何件も 含む 大きな仕事は、
       stepDone が 一度も 通らず **終われない**（実測で 30 件が 0 件のまま）。
       読むのと 確かめるのは 別の話。ここでは 板の字も 見る。 */
    try {
      var 板 = doc.getElementById("vqLiveNote");
      if (板 && 板.classList.contains("show")) {
        var t板 = String(板.textContent || "").replace(/\s+/g, " ");
        if (t板.indexOf(w) >= 0) hit.push("（ボード）" + w);
      }
    } catch (e1) {}
    try {
      var l = lookScreen("");
      (l.操作できるもの || []).forEach(function (x) { if (x.indexOf(w) >= 0) hit.push(x); });
      var r = readScreen({});
      (r.書いてあること || []).forEach(function (x) {
        if (x.indexOf(w) >= 0 && hit.length < 6) hit.push(x);
      });
    } catch (e) {}
    /* ★ **数字は動く**（2026-08-16・実測）。タイマーの「■ 4:57」を証拠に出すと、
       確かめる頃には「4:56」になっていて、**永久に証拠にならない**。
       実測: finishTask が 2 回続けて断られ、3 回目でようやく通った。
       時計・残り時間・進み具合・点数など、動く数字は珍しくない。
       そこで、当たらなかったときだけ **数字を伏せて もう一度**照らす。
       伏せると短くなりすぎるもの（「5」だけ など）は通さない。 */
    var 骨 = function (s) { return String(s).replace(/\s+/g, "").replace(/[0-9０-９]+/g, "#"); };
    if (!hit.length && /[0-9０-９]/.test(w)) {
      var wb = 骨(w);
      if (wb.length >= 3) {
        try {
          var l2 = lookScreen("");
          (l2.操作できるもの || []).forEach(function (x) {
            if (hit.length < 6 && 骨(x).indexOf(wb) >= 0) hit.push("（数字ちがい）" + x);
          });
          var r3 = readScreen({});
          (r3.書いてあること || []).forEach(function (x) {
            if (hit.length < 6 && 骨(x).indexOf(wb) >= 0) hit.push("（数字ちがい）" + x);
          });
        } catch (e) {}
      }
    }
    /* ★ 画面に無くても、**確かめて済ませたこと**なら証拠として通す。 */
    /* ★ 控えを証拠に使うのは **控えのほうが 主張を含んでいるとき だけ**
       （2026-08-16・監査）。前は「控えの末尾が 主張に含まれていれば通す」
       という逆向きの一致も認めていた。控えに「済ませた道具: lookScreen」が
       あるだけで、末尾「lookScreen」を含む長い主張が何でも通ってしまう。
       ＝ **画面を見ただけで、どんな『やった』も証拠になった。** */
    var wn = w.replace(/\s+/g, "");
    if (wn.length >= 2) {
      (st.done || []).forEach(function (x) {
        if (hit.length >= 6) return;
        if (x.replace(/\s+/g, "").indexOf(wn) >= 0) hit.push("（済）" + x);
      });
    }
    return { ある: hit.length > 0, 見つけた: hit.slice(0, 5) };
  }

  function checkDone(a) {
    var w = String((a && a.expect) || "");
    var r = onScreenNow(w);
    /* ★ 「確かめた: ○○」を控えへ残さない（2026-08-16・監査）。
       残すと **Lumi 自身が言った言葉が 次の証拠になる**。
       出ていたときは 見つけた行そのものが画面にあるので、控えは要らない。 */
    if (r.ある) return { 確かめた: w, 結果: "画面に出ています", 見つけた: r.見つけた, 未確認: true };
    var now = lookScreen("");
    return { 確かめた: w, 結果: "**画面に出ていません**", 未確認: true,
             いまの画面: now.いまの画面,
             いま押せるもの: (now.操作できるもの || []).slice(0, 14),
             つぎ: "まだ終わっていません。できたと言わずに、続けてください。" };
  }

  /* ══ ★ **頼まれたものが 揃っているか**（2026-08-17・訴えへの直し）════
     ★ 訴え「10枚作ってと指示した後に、1枚目から10枚目までを しっかり完成まで
       一気に持っていける AI にしたい」。
     ★ 実測: 10 枚と頼んで **6 枚**で finishTask が通った。
       崩れも見た目も合格だったので、関門は素通りさせた。
       **誰も「10 枚と言われたこと」を覚えていなかった。**
     ★ だから 頼まれた文から **数と要る部品を読み取って**、
       足りていなければ 終わらせない。AI に判断させない（言葉で数えるだけ）。
     ★ 言われていないことは 求めない。数字が無ければ 何も言わない。 */
  function 頼まれた注文(文) {
    var t = String(文 || "");
    var 出 = {};
    var 漢数 = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
                 "八": 8, "九": 9, "十": 10 };
    var 数にする = function (x) {
      var n = Number(String(x).replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }));
      if (isFinite(n) && n > 0) return n;
      return 漢数[x] || 0;
    };
    var m = /([0-9０-９]{1,3}|[一二三四五六七八九十])\s*(枚|ページ|ﾍﾟｰｼﾞ|スライド)/.exec(t);
    if (m) { var n1 = 数にする(m[1]); if (n1 >= 1 && n1 <= 60) 出.枚 = n1; }
    var m2 = /([0-9０-９]{1,3}|[一二三四五六七八九十])\s*(問|問題)/.exec(t);
    if (m2) { var n2 = 数にする(m2[1]); if (n2 >= 1 && n2 <= 100) 出.問 = n2; }
    /* 「表で」「表にして」「グラフで」などの言い方だけを拾う。
       「予算表」のような名前は 部品の指示ではないので拾わない。 */
    if (/表(で|にして|に して|を入れ|を作|で作|でまとめ|にまとめ)/.test(t)) 出.表 = true;
    if (/(グラフ|円グラフ|棒グラフ|折れ線)(で|にして|に して|を入れ|を作|で作|でまとめ|にまとめ)/.test(t))
      出.グラフ = true;
    return 出;
  }

  function 注文の関門(c) {
    var 文 = "";
    try { 文 = (st.未処理 && st.未処理.文) || ""; } catch (e) {}
    if (!文) 文 = String(st.goal || "");
    var 注 = 頼まれた注文(文);
    if (!注.枚 && !注.問 && !注.表 && !注.グラフ) return null;
    var K = WPC(); if (!K) return null;
    var b = null;
    try { b = K.本体(c); } catch (e) {}
    if (!b) return null;
    var 足りない = [];
    if (c.kind === "presentation") {
      var 枚 = (b.slides || []).length;
      if (注.枚 && 枚 < 注.枚)
        足りない.push(注.枚 + " 枚と言われましたが **" + 枚 + " 枚しかありません**（あと "
          + (注.枚 - 枚) + " 枚）");
      var 型 = {};
      (b.slides || []).forEach(function (sl) {
        (sl.elements || []).forEach(function (e) { 型[e.type] = (型[e.type] || 0) + 1; }); });
      if (注.表 && !型.table) 足りない.push("**表を入れてと言われましたが、表がありません**");
      if (注.グラフ && !型.chart) 足りない.push("**グラフをと言われましたが、グラフがありません**");
      /* 空のページを 数だけ足して ごまかせないようにする */
      var 空 = (b.slides || []).filter(function (sl) { return !(sl.elements || []).length; }).length;
      if (空) 足りない.push("**中身の無いページが " + 空 + " 枚** あります（数あわせにしないこと）");
    } else if (c.kind === "form") {
      var q = 0;
      (b.sections || []).forEach(function (sec) {
        (sec.fields || []).forEach(function (f) { if (!M.isDecoration(f.type)) q++; }); });
      if (注.問 && q < 注.問)
        足りない.push(注.問 + " 問と言われましたが **" + q + " 問しかありません**（あと "
          + (注.問 - q) + " 問）");
    } else if (c.kind === "document") {
      var 表数 = (b.blocks || []).filter(function (x) { return x.type === "table"; }).length;
      if (注.表 && !表数) 足りない.push("**表を入れてと言われましたが、表がありません**");
    } else if (c.kind === "spreadsheet") {
      if (注.グラフ && !((b.charts || []).length))
        足りない.push("**グラフをと言われましたが、グラフがありません**");
    }
    if (!足りない.length) return null;
    return { だめ: "**頼まれたものが まだ揃っていません。**",
             足りないもの: 足りない,
             頼まれたこと: String(文).slice(0, 200),
             つぎ: "**ここで終わらせないでください。**"
               + "足りないぶんを 最後まで作ってから もう一度 呼んでください。"
               + "残りも 前half と同じ作り込みで（文字だけにしない・色と図形を使う）。" };
  }

  /* 書類が開いているのに 見直していない／崩れが残っている／
     頼まれたものが揃っていないなら 終わらせない */
  function 見直しの関門() {
    var K = WPC();
    if (!K) return null;
    var c = null;
    try { c = K.いま(); } catch (e) {}
    if (!c) return null;                       /* 書類を触っていない仕事は 素通り */
    var it = null;
    try { it = K.書類(c) || {}; } catch (e) { it = {}; }
    /* ★ **数と部品は 見直しより先に見る。**
       中身が足りないのに「崩れが無いから完成」と言わせない。 */
    var 注 = 注文の関門(c);
    if (注) return 注;
    var m = st.見直し;
    if (!m || m.書類 !== it.id) {
      return { だめ: "**まだ見直していません。**（" + (it.title || "この書類") + "）",
               つぎ: "reviewDocument を呼んで、崩れ・抜けが 0 であることを確かめてから"
                 + "もう一度 finishTask を呼んでください。"
                 + "**確かめずに「できました」と言わないでください。**" };
    }
    if (m.残り > 0) {
      var 今;
      try { 今 = K.見直す({}); } catch (e) { 今 = null; }
      if (今 && 今.見つかった数 > 0) {
        return { だめ: "**まだ " + 今.見つかった数 + " か所 崩れています。**",
                 崩れているところ: (今.見つかったもの || []).slice(0, 8),
                 つぎ: "はみ出し・入りきらないは w / h / size で、重なりは x / y で直します。"
                   + "**直して、見つかった数が 0 になってから** もう一度呼んでください。" };
      }
      st.見直し.残り = 0;
    }
    return null;
  }

  function finishTask(a) {
    var g = st.goal;
    var ev = String((a && a.evidence) || "").trim();
    /* ★ **まだ走っているものがあるなら 終わらせない**（2026-08-17）。
       訴え「終わってもいないのに 終わったと認識する」への止め。
       証拠の有無より先に見る（証拠は その場にある別の言葉でも取れてしまう）。 */
    var 走 = まだ動いている();
    if (走.length) {
      return { だめ: "まだ終わっていません。",
               走っているもの: 走,
               つぎ: "**できたと言わないでください。**上のものを片づけてから もう一度呼んでください。" };
    }
    /* ★ **書類を触ったなら、見直してからでないと終われない**（2026-08-17）。
       実測: 3 枚のスライドを作ったあと、reviewDocument を呼ばずに
       保存して「できた」と言い、1 枚目に **100% の重なりが 2 か所**残っていた。
       言い聞かせでは守られなかったので、終われない形にする。
       見直しは いまの中身に対して取れていること（作ったあとに もう一度）。 */
    var 見 = 見直しの関門();
    if (見) return 見;
    /* ★ **目的を宣言していなくても、証拠は要る**（2026-08-16・監査）。
       前はここで素通りしていたので、startTask を呼ばずに finishTask を
       呼ぶだけで「終わった」が返り、しかも サーバの指示は
       「できたと言ってよいのは finishTask が通ってから」と教えている。
       ＝ **証拠ゼロで『できた』の許可が出る道**が開いていた。 */
    if (!g) {
      if (!ev) {
        return { だめ: "終わるには **証拠** が要ります。"
          + "いま画面に出ているはずの言葉を evidence に入れて、もう一度呼んでください。",
          つぎ: "できたと言わないでください。" };
      }
      var r0 = onScreenNow(ev);
      if (!r0.ある) {
        var n0 = lookScreen("");
        return { だめ: "「" + ev + "」は **いま画面にありません**。まだ終わっていません。",
                 いまの画面: n0.いまの画面,
                 いま押せるもの: (n0.操作できるもの || []).slice(0, 14),
                 つぎ: "できたと言わないでください。続けて道具を呼ぶか、"
                   + "どうしても届かないなら『できなかった』と正直に伝えてください。" };
      }
      return { 終わった: "（目的の宣言なし）", 証拠: r0.見つけた,
               結果: String((a && a.result) || "").slice(0, 300),
               つぎ: "何をしたかを 一言で伝えてください。" };
    }
    if (!ev) {
      return { だめ: "終わるには **証拠** が要ります。"
        + "いま画面に出ているはずの言葉を evidence に入れて、もう一度呼んでください。" };
    }
    /* ★ 予定が残っているうちは 終わらせない（2026-08-16）。
       「A して B して C して」の A だけで打ち切るのを、ここで止める。 */
    if (st.plan && st.plan.length && のこり件().length) {
      /* ★ **済んでいる段取りは こちらで埋める**（2026-08-16）。
         「問題を読む」のように 画面に何も足さない仕事は、
         証拠が作れず 永久に終われなかった（実測: 同じ stepDone を
         3 回断られて そこで力尽きた）。
         控えに その仕事の跡が残っているなら、済んだものとして数える。 */
      st.planOk = st.planOk || [];
      var 控え = (st.done || []).join(" ");
      st.plan.forEach(function (x, i) {
        if (st.planOk[i]) return;
        /* 段取りの言葉から 手がかりを取り、控えに跡があれば済とみなす */
        var 手 = String(x).replace(/[をにへとがはのするします作成いれ入れて。、 　]/g, "");
        var 当たり = false;
        if (手.length >= 2) {
          for (var k = 0; k < 手.length - 1; k++) {
            var 二文字 = 手.substr(k, 2);
            if (二文字.length === 2 && 控え.indexOf(二文字) >= 0) { 当たり = true; break; }
          }
        }
        if (当たり) st.planOk[i] = "控えから";
      });
      var のこ = のこり件();
      if (のこ.length) {
        return { だめ: "まだ **" + のこ.length + " 件** 残っているので終われません。",
                 のこり: のこ.map(function (x, i) { return (i + 1) + ". " + x; }),
                 つぎの件: のこ[0],
                 使える証拠: (st.done || []).slice(-6),
                 つぎ: "「" + のこ[0] + "」を続けてください。"
                   + "**もう終わっているなら**、「使える証拠」から 1 行を写して "
                   + "stepDone を呼んでから finishTask にしてください。" };
      }
    }
    var r2 = onScreenNow(ev);
    if (!r2.ある) {
      var now2 = lookScreen("");
      return { だめ: "「" + ev + "」は **いま画面にありません**。まだ終わっていません。",
               いまの画面: now2.いまの画面,
               いま押せるもの: (now2.操作できるもの || []).slice(0, 14),
               つぎ: "できたと言わないでください。続けて道具を呼ぶか、"
                 + "どうしても届かないなら『できなかった』と正直に伝えてください。" };
    }
    var 件数 = (st.plan && st.plan.length) || 0;
    st.goal = ""; st.steps = 0; st.plan = []; st.planOk = []; st.planAt = 0;
    st.あふれ = 0; try { 進み具合を消す(); } catch (e0) {}
    st.仕事おわり = true;                 /* 予定なしで進めた場合も ここで終わり */
    st.作りかけ = null;                   /* 作りかけの印も消す（催促の種を残さない） */
    try { if (root.VQD && root.VQD.pipeline) root.VQD.pipeline.進捗を消す(); } catch (e8) {}
    促しを止める("");                     /* 終わったら 自動の続きも止める */
    st.見直し = null;
    return { 終わった: g, 結果: String((a && a.result) || "").slice(0, 300),
             証拠: r2.見つけた,
             やった件数: 件数 || undefined,
             つぎ: "利用者に 何をしたかを一言で伝えてください。" };
  }

  /* ══ 進み具合を 画面に 出す（2026-08-19・大きな仕事）════════════
     ★ 30 件の 仕事を 頼むと、10 分 何も 見えない 時間が できる。
       「動いているのか 止まったのか」が 分からないのが いちばん つらい。
       小さな 帯を 1 本 出して、いま 何件目かを 見せる。 */
  function 進み具合を出す() {
    if (!st.goal || !(st.plan || []).length) { 進み具合を消す(); return; }
    var 済 = (st.planOk || []).filter(Boolean).length;
    var 全 = st.plan.length;
    var d = doc.getElementById("vqLiveProg");
    if (!d) {
      d = doc.createElement("div");
      d.id = "vqLiveProg";
      d.setAttribute("role", "status");
      d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);"
        + "bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483001;"
        + "max-width:min(92vw,420px);padding:8px 13px;border-radius:999px;"
        + "background:rgba(24,22,38,.90);color:#fff;font-size:12.5px;line-height:1.5;"
        + "box-shadow:0 6px 22px rgba(16,15,26,.28);display:flex;align-items:center;gap:9px;"
        + "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);";
      d.innerHTML = '<span data-pt style="flex:1 1 auto;overflow:hidden;'
        + 'text-overflow:ellipsis;white-space:nowrap;"></span>'
        + '<span data-pn style="flex:0 0 auto;font-variant-numeric:tabular-nums;opacity:.85;"></span>';
      doc.body.appendChild(d);
    }
    var 残 = のこり件();
    d.querySelector("[data-pt]").textContent = 残.length ? 残[0] : "仕上げています…";
    d.querySelector("[data-pn]").textContent = 済 + " / " + 全;
  }
  function 進み具合を消す() {
    var d = doc.getElementById("vqLiveProg");
    if (d) try { d.remove(); } catch (e) {}
  }

  /* 道具の返事に 目的を添える */
  function withGoal(r) {
    if (!r || typeof r !== "object" || !st.goal) return r;
    st.steps = (st.steps || 0) + 1;
    try { 進み具合を出す(); } catch (e0) {}
    /* 予定が何件もあるときは そのぶん手数が要る。件数に応じて伸ばす。 */
    /* ★ 大きな仕事ほど 手数が 要る（2026-08-19）。
       1 件あたり 15 手だったが、資料 1 枚を 作るだけで
       「作る → 見直す → 直す → 確かめる」で 4〜8 手 使う。
       件数が 多いほど 1 件あたりの 余裕も 要るので、少し 厚めに 取る。
       ★ ただし **無限では ない**。届かなければ 正直に 言わせる。 */
    var 件 = Math.max(1, (st.plan && st.plan.length) || 1);
    var 上限 = 25 + 20 * (件 - 1) + Math.min(200, 件 * 4);
    if (st.steps > 上限) {
      /* ★ **目的は消さない**（2026-08-16・監査）。
         前はここで goal も plan も全部消していた。すると
         ・withGoal の催促が止まり、Lumi は喋って番を終えてよくなる
         ・finishTask は「目的なし」の枝へ落ちて **素通り**する
         ＝ 届いていないのに「終わった」で締められる道が開いていた。
         手数は伸ばす（ただし 1 回だけ）。それでも駄目なら、
         **できなかったと言わせる**（できたとは言わせない）。 */
      var 残件 = (st.plan && st.plan.length) ? のこり件() : [];
      if (!st.のばした) {
        st.のばした = true;
        r.手数がきつい = "「" + st.goal + "」は " + 上限 + " 手かかっています。"
          + "**寄り道をやめて、いちばん近い道だけで進めてください。**";
        if (残件.length) r.のこり = 残件;
        return r;
      }
      r.打ち切り = "「" + st.goal + "」は " + st.steps + " 手やっても届きませんでした。";
      if (残件.length) r.できていない件 = 残件;
      r.つぎ = "**「できた」と言ってはいけません。**"
        + "どこまでできて、何が残っているかを 正直に伝えて、"
        + "利用者に どうするか聞いてください。";
      /* 目的は残したまま（finishTask を素通りさせない）。数え直しだけする。 */
      st.steps = Math.floor(上限 / 2);
      return r;
    }
    r.いまの目的 = st.goal + "（" + st.steps + " 手目）";
    if (st.plan && st.plan.length > 1) {
      var 残 = のこり件();
      r.いまやっている件 = 残[0] || "（最後の確認）";
      r.のこり件数 = 残.length;
      r.つぎ = 残.length
        ? "いまは「" + 残[0] + "」の途中です。**喋るだけで番を終えないでください。**"
          + "この件が終わったら stepDone を証拠つきで呼び、残り " + (残.length - 1)
          + " 件へ そのまま進んでください。"
        : "予定はぜんぶ終わりました。finishTask を証拠つきで呼んでください。";
      return r;
    }
    r.つぎ = "まだ届いていないなら、**喋るだけで番を終えず** 続けて道具を呼んでください。"
      + "届いたら finishTask を（証拠つきで）呼びます。";
    return r;
  }

  /* ══ 開いている書類を 声で直す（2026-08-16）════════════════════════
     ★ 「ここに〜を足して」「もっと詳しく」「短くして」を通す。
       いまの中身を丸ごと渡し、直したあとの全体を受け取って差し替える。 */
  /* ══════════════════════════════════════════════════════════════════
     Workplace の 4 つを **構造ごと** Lumi に渡す（2026-08-16）

     ★ 訴え「関数が入らない」「修正しても修正じゃなくて壊れる」。
       おおもとは、Lumi が **画面の中身の形を知らない** こと。
       知らないまま作り直させていたので、直すたびに別物になっていた。
     ★ そこで
         ① できること・使える関数・レイアウト・質問の種類 を全部渡す
         ② 直すときは **作り直さず、番地や id を指して差し替える**
       の 2 本立てにする。
     ══════════════════════════════════════════════════════════════════ */
  function wpNow() {
    try { return (root.VQ2 && VQ2.workplace && VQ2.workplace.current) || null; }
    catch (e) { return null; }
  }
  function wpBodyNow() {
    var c = wpNow();
    try { return (c && c.session && c.session.content && c.session.content.content) || null; }
    catch (e) { return null; }
  }
  var 種類の名 = { document: "Docs（文書）", spreadsheet: "Sheets（表計算）",
                  presentation: "Slides（スライド）", form: "Forms（フォーム）" };

  /* 使える関数を、登録簿から そのまま読む（画面に書いてある物と必ず一致する） */
  function 関数一覧() {
    var out = [];
    try {
      (VQ2.workplace.functionRegistry.all() || []).forEach(function (f) {
        out.push(f.type + "（" + (f.category || "") + "・" + (f.description || "") + "）");
      });
    } catch (e) {}
    return out;
  }

  /* いま開いている表の 使っている範囲を読む */
  function 表を読む(body) {
    var sh = (body.sheets || [])[Math.min(body.activeSheet || 0, (body.sheets || []).length - 1)];
    if (!sh) return null;
    var cells = sh.cells || {}, 最大行 = 0, 最大列 = 0, 数式 = [];
    Object.keys(cells).forEach(function (k) {
      var m = /^([A-Z]+)(\d+)$/.exec(k);
      if (!m) return;
      var c = VQ2.workplace.model.colIndex(m[1]), r = parseInt(m[2], 10);
      if (r > 最大行) 最大行 = r;
      if (c > 最大列) 最大列 = c;
      if (cells[k] && cells[k].f) 数式.push(k + " = " + cells[k].f);
    });
    var 行 = [];
    for (var r2 = 1; r2 <= Math.min(最大行, 40); r2++) {
      var 一行 = [];
      for (var c2 = 0; c2 <= 最大列; c2++) {
        var cell = cells[VQ2.workplace.model.colName(c2) + r2];
        一行.push(cell ? (cell.f ? cell.f : String(cell.v === undefined ? "" : cell.v)) : "");
      }
      行.push(r2 + "行目: " + 一行.join(" | "));
    }
    return { シート名: sh.name, 使っている範囲: "A1:" + VQ2.workplace.model.colName(最大列) + 最大行,
             中身: 行, いま入っている数式: 数式.slice(0, 40),
             シート数: (body.sheets || []).length, グラフ: (body.charts || []).length + " 個" };
  }

  function 発表を読む(body) {
    return {
      枚数: (body.slides || []).length, テーマ: body.theme || "minimal", 比率: body.ratio || "16:9",
      各ページ: (body.slides || []).slice(0, 30).map(function (sl, i) {
        var 文 = (sl.elements || []).filter(function (e) { return e.type === "text"; })
          .map(function (e) { return e.id + "「" + String(e.text || "").replace(/\n/g, " / ").slice(0, 70) + "」"; });
        return (i + 1) + "枚目（" + sl.layout + "・id=" + sl.id + "）: " + 文.join("  ");
      })
    };
  }

  function 問いを読む(body) {
    var out = [];
    (body.sections || []).forEach(function (sec, si) {
      (sec.fields || []).forEach(function (f) {
        out.push("id=" + f.id + " [" + f.type + "] " + f.label
          + (f.options && f.options.length
              ? "（" + f.options.map(function (o) { return o.label; }).join(" / ") + "）" : "")
          + (f.required ? " ※必須" : ""));
      });
      if (!sec.fields || !sec.fields.length) out.push("（" + (si + 1) + "つ目のまとまりは空）");
    });
    return { まとまり: (body.sections || []).length, 質問: out.slice(0, 40),
             見た目: (body.theme && body.theme.preset) || "既定" };
  }

  function describeWorkplace() {
    var 出 = {
      "Workplace でできること": {
        "Docs（文書）": "見出し1〜3・段落・箇条書き・番号つき・引用・**表**・**注意書き（callout）**・区切り線。"
          + "用紙（A4/B5・縦横・余白）、印刷、PDF。"
          + "★ 日程・費用・持ち物・比較・役割分担は **表にすると読みやすい**ので、"
          + "文章で並べずに表を使ってください。",
        "Sheets（表計算）": "関数つきの表。複数シート、CSV の出入り、並べ替え、絞り込み。"
          + "**グラフも作れます**（棒・横棒・折れ線・面・円・ドーナツ・散布図）。"
          + "editDocument で「〇〇のグラフを作って」と頼まれたら 作ってください。",
        "Slides（スライド）": "17 種のレイアウト、16 種のテーマ。"
          + "**文字・図形（四角/丸/三角）・線・表** を座標で置けます。発表・PDF 書き出し。"
          + "★ 写真だけは 声からは入れられません（絵を作る手立てが無いため）。"
          + "「写真を入れた」と言わないこと。図形と表は入れられます。",
        "Forms（フォーム）": "text / textarea / radio / checkbox / select / number / date の質問。"
          + "必須の指定、まとまり分け、公開、回答の CSV 書き出し、Sheets へ送る。"
      },
      "Sheets で使える関数": 関数一覧(),
      "Slides のレイアウト": ["title", "title_body", "section", "two_col", "three_col", "image_text",
        "big_image", "compare", "quote", "number", "chart", "timeline", "process", "team",
        "qa", "summary", "blank"],
      "Slides のテーマ": (function () {
        try { return Object.keys(VQ2.workplace.slides.THEMES || {}); } catch (e) { return []; }
      })(),
      /* ★ 書き写さず **登録簿から読む**（2026-08-16）。
         書き写していたせいで、画面に無い名前（text / radio）を Lumi に教え、
         その型で作られた質問は fieldCard が何も描かず **空のフォーム**になっていた。 */
      "Forms の質問の種類": (function () {
        try { return (VQ2.workplace.fieldRegistry.all() || []).map(function (d) { return d.type; }); }
        catch (e) { return []; }
      })()
    };
    var c = wpNow(), body = wpBodyNow();
    if (!c || !body) {
      出.いま開いているもの = "なし";
      出.つぎ = "作るときは makeDocument、開いているものを直すときは editDocument です。";
      return 出;
    }
    出.いま開いているもの = 種類の名[c.kind] + "「" + ((c.item && c.item.title) || "") + "」";
    try {
      if (c.kind === "spreadsheet") 出.表の中身 = 表を読む(body);
      else if (c.kind === "presentation") 出.発表の中身 = 発表を読む(body);
      else if (c.kind === "form") 出.フォームの中身 = 問いを読む(body);
      else 出.文書の中身 = (body.blocks || []).slice(0, 40).map(function (b, i) {
        return (i + 1) + ". [" + b.type + "] " + String(b.text || "").slice(0, 70);
      });
    } catch (e) {}
    出.つぎ = "**この中身をもとに** editDocument で直してください。"
      + "作り直しではなく、番地（A1 など）や id を指した差し替えになります。"
      + "見ないで直すと壊れるので、直す前に必ずこれを読んでください。";
    return 出;
  }

  /* ══ 調べもの（2026-08-17）════════════════════════════════════════
     ★ searchWeb は 見出しと 2〜3 行だけしか返らない。
       それだけで資料を作ると、**中身の無い作文**になる。
     ★ ここは 2 段。
        researchSearch … 候補を並べる（出どころの信頼度つき）
        researchRead   … その中の 1 本を **本文まで**読む
       本文を読んでから作れば、数字も固有名詞も 出どころも 本物になる。
     ★ 調べすぎない（§27）。同じ言葉は 10 分は繰り返さない。 */
  function researchSearch(a) {
    var qs = [];
    if (a && Array.isArray(a.queries)) qs = a.queries;
    else if (a && a.query) qs = [a.query];
    qs = qs.map(function (x) { return String(x || "").replace(/\s+/g, " ").trim(); })
      .filter(Boolean).slice(0, 4);
    if (!qs.length) return { だめ: "調べる言葉を渡してください。" };
    st.調べ2 = st.調べ2 || {};
    var 鍵 = qs.join("|").toLowerCase();
    var 前 = st.調べ2[鍵];
    if (前 && Date.now() - 前.at < 600000) {
      var 写 = JSON.parse(JSON.stringify(前.r));
      写.つぎ = "**さっき調べたものと同じです。**もう一度は調べません。この中身で進めてください。";
      return 写;
    }
    return fetch(api() + "/api/research/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ queries: qs, category: a && a.category, timeRange: a && a.timeRange })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: "調べられませんでした。", つぎ: "調べたと言わないでください。" };
      if (!j.results || !j.results.length) {
        return { 見つからない: "「" + qs.join(" / ") + "」では 何も出てきませんでした。",
                 どこが動いたか: j.もと,
                 つぎ: "言い方を変えて もう一度だけ試すか、**見つけられなかったと正直に**"
                   + "伝えてください。作り話をしないこと。" };
      }
      var 出 = { 調べた: qs, 見つけたもの: j.results,
                 つぎ: "★ **ここに出ているのは 見出しと 2〜3 行だけ**です。"
                   + "これだけで資料を作ると 中身が薄くなります。"
                   + "**数字・年号・固有名詞を使うなら、researchRead で本文を読んでから**にしてください。"
                   + "読むのは 上から 1〜3 本で足ります（公的機関・大学が上に来ています）。"
                   + "資料には 出どころ（サイト名）を必ず添えてください。" };
      st.調べ2[鍵] = { at: Date.now(), r: JSON.parse(JSON.stringify(出)) };
      return 出;
    }).catch(function () {
      return { だめ: "調べられませんでした（つながりません）。", つぎ: "調べたと言わないでください。" };
    });
  }
  function researchRead(a) {
    var u = String((a && a.url) || "").trim();
    if (!u) return { だめ: "読む URL を渡してください（researchSearch に出ていたもの）。" };
    return fetch(api() + "/api/research/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ url: u, keywords: a && a.keywords, maxChars: a && a.maxChars })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: (j && j.message) || "読めませんでした。",
                                つぎ: "読んだと言わないでください。ほかの候補を試してください。" };
      return { 読んだ: j.title || j.出どころ, url: j.url,
               出どころ: j.出どころ + "（" + j.種類 + "）",
               取った日時: j.取った日時,
               本文: j.text,
               全体の長さ: j.全体の長さ, 渡した長さ: j.渡した長さ,
               ぜんぶ読めていない: j.切った || undefined,
               見つけた言葉: j.見つけた言葉,
               つぎ: "**ここに書いてあることだけ**を使ってください。書いていない数字を足さないこと。"
                 + (j.切った ? "★ 途中までしか渡していません。足りなければ keywords を変えて"
                   + "もう一度読んでください。" : "")
                 + " 資料に載せるときは 出どころ（" + j.出どころ + "）を添えます。" };
    }).catch(function () {
      return { だめ: "読めませんでした（つながりません）。", つぎ: "読んだと言わないでください。" };
    });
  }

  /* ══ Workplace を Lumi が **自分で操作する**（2026-08-17）══════════
     ★ ここまでの Lumi は、書類を作るのも直すのも
       サーバの AI（/api/wp/make・/api/wp/edit）に **文章で頼む**しかなかった。
       そのため
         ・毎回 費用がかかる
         ・座標も書式も細かい指定が通らない
         ・「直した」と言うだけで **本当に変わったか確かめていない**
       が同時に起きていた。プリセットで直したのと 同じ構図。
     ★ 直しかた: 画面の操作の口（VQ2.workplace.cmd）を そのまま道具にする。
       費用 0・正確・そして **やったあと必ず読み直して確かめる**。
     ★ 決まりごと（ここを崩すと また嘘をつく道具になる）
       ・「呼べた」を「やった」と言わない。返りの 確かめた を見る。
       ・作れない物（画像）は 作れるふりをしない。
       ・完成という前に reviewDocument を通す。 */
  function WPC() {
    try { return (root.VQ2 && VQ2.workplace && VQ2.workplace.cmd) || null; } catch (e) { return null; }
  }
  function 操作の口が無い() {
    return { だめ: "Workplace の操作の口が見つかりません。",
             つぎ: "できたと言わないでください。" };
  }
  /* 画面の書き換えが落ち着いてから返す。すぐ返すと **古い画面**を見て答える。 */
  function 落ち着いてから(v) {
    return settle(500).then(function () { return v; });
  }

  function workplaceCan() {
    var K = WPC(); if (!K) return 操作の口が無い();
    return K.できること();
  }
  function readDocument(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return K.読む(a || {});
  }
  function reviewDocument(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    var r = K.見直す(a || {});
    /* ★ **見直した事実を控える**（2026-08-17）。
       finishTask がここを見て、見直していない仕事を終わらせない。 */
    try {
      var c = K.いま();
      if (c && r && typeof r.見つかった数 === "number") {
        st.見直し = { 書類: (K.書類(c) || {}).id, 時: Date.now(),
                      残り: r.見つかった数, 種類: c.kind };
      }
    } catch (e) {}
    return r;
  }
  function undoLast(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.巻き戻す(a || {}));
  }
  function newFile(a) {
    var K = WPC(); if (!K) return Promise.resolve(操作の口が無い());
    return Promise.resolve(K.ファイル.作る(a || {}));
  }
  function listTemplates(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return K.ファイル.ひな形(a || {});
  }
  function listCommands() {
    var K = WPC(); if (!K) return 操作の口が無い();
    return K.命令一覧();
  }
  function runCommand(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.命令(a || {}));
  }
  function fileAction(a) {
    var K = WPC(); if (!K) return Promise.resolve(操作の口が無い());
    var op = String((a && a.op) || "");
    if (op === "save" || op === "保存") return Promise.resolve(K.ファイル.保存());
    if (op === "rename" || op === "題名") return Promise.resolve(K.ファイル.題名(a));
    if (op === "duplicate" || op === "複製") return Promise.resolve(K.ファイル.複製());
    if (op === "convert" || op === "変換") return Promise.resolve(K.ファイル.変換(a));
    return Promise.resolve({ だめ: "その操作は分かりません。**何もしていません。**",
                             できる操作: ["save", "rename", "duplicate", "convert"] });
  }

  /* ── 書類の 見た目（Docs / Sheets / Forms）──────────────────
     訴え（2026-08-29）「スライド／ワード／エクセル／フォームの デザインが
     毎回 同じ。Lumi が 作るように して」。
     スライドは deckDesign が 受け持つ。ここは 残りの 3 つ。
     ★ **中身は 触らない。** 色・書体・見出しの飾り・表の塗り・紙の地 だけ。 */
  function docDesign(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    if (!K.見た目) return { だめ: "この 画面では まだ 見た目を 変えられません。" };
    return 落ち着いてから(K.見た目.決める(a || {}));
  }

  /* ── Docs ─────────────────────────────────────────────────── */
  function docsWrite(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.docs.まとめて(a || {}));
  }
  /* ★ 道具の宣言では op が **二重**になる（外側 "table" / 内側 "行を足す"）。
     そのまま渡すと 内側が外側に食われるので、**ここで名前を付け替える**。
     付け替えを忘れると「呼べたのに何も起きない」になる。 */
  function 付け替え(a, 表) {
    var o = {};
    Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(表 || {}).forEach(function (k) {
      if (o[k] !== undefined) { o[表[k]] = o[k]; delete o[k]; }
    });
    return o;
  }
  function docsEdit(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    a = a || {};
    var op = String(a.op || "");
    if (op === "table" || op === "表")
      return 落ち着いてから(K.docs.表(付け替え(a, { tableOp: "op" })));
    if (op === "page" || op === "用紙")
      return 落ち着いてから(K.docs.用紙(付け替え(a, {
        pageSize: "size", headerText: "header", footerText: "footer" })));
    var f = { add: K.docs.足す, "足す": K.docs.足す,
              edit: K.docs.直す, "直す": K.docs.直す,
              "delete": K.docs.消す, "消す": K.docs.消す,
              move: K.docs.動かす, "動かす": K.docs.動かす,
              style: K.docs.書式, "書式": K.docs.書式 }[op];
    if (!f) return { だめ: "その操作は分かりません。**何もしていません。**",
                     できる操作: ["add", "edit", "delete", "move", "table", "style", "page"] };
    return 落ち着いてから(f(a));
  }

  /* ══ 指した所を 直す（2026-08-17・基盤ゆき）════════════════════════
     ★ 訴え「どのページの どこを直すと 具体的に言うと、違う所を直し始める」。
       原因は 場所の特定を 道具ごとに 手で書いていたこと。
       ここは client/core/selector が 引き受け、
         ・1 つに決まらなければ **何もせず 聞く**
         ・宣言した所しか 変わらない（はみ出したら まるごと戻す）
         ・報告は **機械が** 書く
       の 3 つを まとめて 通す。4 種類（文書・表・スライド・フォーム）共通。
     ★ 「ここ」「これ」と言われたら 画面で 選んでいる所を使う（どこ を省く）。 */
  /* ══ カメラを見せる（AR・2026-08-17）═══════════════════════════════
     ★ 訴え「スマホのカメラで 見ているものを 共有したい」。
       画面の共有では 目の前の物を 見せられない。
     ★ **勝手には 始めない。**カメラは いちばん立ち入る道具なので、
       Lumi が呼んだときも 端末が 許可を聞く（それでよい）。
       断られたら 断られたと 返す。「見えています」と 言わせない。 */
  function cameraOn(a) {
    a = a || {};
    var 向き = /front|内|自分|顔/.test(String(a.facing || "")) ? "user" : "environment";
    return Promise.resolve(カメラ開始(向き)).then(function (r) {
      if (!r || r.だめ) {
        return { だめ: "カメラを 使えませんでした（" + ((r && r.だめ) || "理由不明") + "）。"
          + "**見えているとは 言わないでください。**",
          やること: "利用者に カメラの使用を 許可してもらってください。" };
      }
      return { やった: "カメラを 見せ始めました（"
          + (向き === "user" ? "内向き（自分の顔）" : "外向き（目の前のもの）") + "）",
        送り方: "1 秒に 1 枚ずつ 届きます。変わっていない絵は 送りません。",
        つぎ: "**まだ 何も見えていません。**絵が 届いてから 答えてください。"
          + "指し示したいときは markInView（x, y は 0〜1 の割合）を使います。" };
    });
  }
  function cameraOff() {
    if (!st.cast || st.castKind !== "カメラ") return { だめ: "カメラは 見せていません。" };
    キャスト終了("Lumi が止めた");
    return { やった: "カメラの共有を やめました。" };
  }
  function markInView(a) {
    a = a || {};
    if (!st.cast || st.castKind !== "カメラ")
      return { だめ: "カメラを 見せていないので 印を置けません。**何もしていません。**",
               やること: "先に cameraOn を 呼んでください。" };
    var items = Array.isArray(a.items) && a.items.length ? a.items : [a];
    var 出 = [];
    items.slice(0, 8).forEach(function (x) {
      if (x == null) return;
      var r = 印を置く(x.x, x.y, x.label);
      if (r && r.置いた) 出.push(r.置いた);
    });
    if (!出.length) return { だめ: "置けませんでした。x と y は 0〜1 の割合で 渡してください。" };
    return { やった: 出.length + " か所に 印を置きました（小窓の 絵の上に 出ています）",
             置いたところ: 出,
             つぎ: "印は 20 秒で 消えます。指し示しながら 話してください。" };
  }
  function clearMarks() { return 印を消す(); }

  /* ══ 写したものを **別の頭で 解く**（2026-08-17）═════════════════
     ★ 訴え「ワークの答えと Lumi が 違うことがある」。
       声で話している Lumi は **速さのためのモデル**（flash-live）で、
       考える時間を ほとんど 取らない。写真の細かい式は よく間違える。
     ★ ここは **別の頭**へ回す口。速さを捨てて 正しさを取る。
       Lumi は 自分で答えず、**返ってきた答えを 読む。**
     ★ 本の答え（expected）を 渡せば、食い違いを **隠さずに** 出す。
       どちらが正しいかを 決めつけず、両方の 根拠を 並べる。 */
  function solveFromCamera(a) {
    a = a || {};
    if (!st.cast || st.castKind !== "カメラ")
      return Promise.resolve({ だめ: "カメラを 見せていません。**何もしていません。**",
                               やること: "先に cameraOn を 呼んでください。" });
    var 写 = しっかり撮る(1600);
    if (!写) return Promise.resolve({ だめ: "写真を 撮れませんでした（映像が まだ 来ていません）。" });
    st.最後の写真 = 写;
    return fetch(api() + "/api/lumi/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ image: 写.base64, mimeType: "image/jpeg",
        question: String(a.question || ""), expected: String(a.expected || ""),
        subject: String(a.subject || "") })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: (j && j.message) || "解けませんでした。" };
      st.最後の答え = j;
      if (!j.読めた) {
        return { だめ: "写真が 読めませんでした（" + (j.読めない訳 || "はっきりしない") + "）。"
            + "**答えを 言わないでください。**",
          やること: "「もう少し 近づけて」「影が 入っています」と 伝えて、撮り直してもらう。" };
      }
      /* ★ 読めたものは **ためておく**（2026-08-17）。
         あとで プリセット（練習）や Quick Mock（試験）へ まとめられる。 */
      var ためた = 0;
      try { ためた = 拾う(j, a); } catch (e5) {}
      var 出 = {
        読み取った問題: j.問題文,
        答え: j.答え,
        考えかた: j.考えかた,
        自信: j.自信,
        使った頭: j.使ったモデル + "（" + j.かかった秒 + " 秒 かけて 解いた）",
        つぎ: "**この答えを そのまま 伝えてください。**自分で 解き直さないこと。"
      };
      if (ためた) {
        出.ためた = ためた + " 問（ここまで 合わせて "
          + (st.拾い物 || []).length + " 問）";
        出.まとめられる = "「プリセットにして」で 練習用に、"
          + "「試験にして」で Quick Mock へ まとめられます。**聞かれたときだけ 言うこと。**";
      }
      if (j.自信 < 0.6) {
        出.気をつけること = "自信が " + Math.round(j.自信 * 100) + "% しかありません。"
          + "**言い切らないでください。**「たぶん」と 添えて、確かめ方も 伝えます。";
      }
      /* ★ 空欄が 見つかったら **その場に 答えを 貼る**（2026-08-17）。
         カメラを 動かしても 紙の同じ所に とどまる（core/ar/track.js）。 */
      if (a.貼る !== false && Array.isArray(j.空欄) && j.空欄.length) {
        var 貼 = 答えを置く(j.空欄);
        出.空欄に貼った = 貼.だめ ? 0 : 貼.置いた;
        出.空欄 = j.空欄.map(function (k) {
          return (k.label ? k.label + ": " : "") + k.answer;
        });
        if (貼.だめ) 出.貼れなかった訳 = 貼.だめ;
        else 出.つぎ = "**答えは 紙の上に 出しました。**"
          + "「空欄に 答えを 出したよ。押すと 解説が 見られる」と 伝えてください。"
          + "1 つずつ 読み上げる必要は ありません。";
      }
      if (String(a.expected || "")) {
        出.本の答え = String(a.expected);
        出.本と合うか = j.本と合うか;
        if (j.食い違い) {
          出.食い違い = j.食い違い;
          出.つぎ = "**どちらが正しいかを 決めつけないでください。**"
            + "「私は " + j.答え + "、本には " + a.expected + " とあります」と 両方を 出し、"
            + "上の『食い違い』の理由を 伝えて、一緒に 確かめてください。";
        }
      }
      return 出;
    }).catch(function (e) {
      return { だめ: "解けませんでした（" + String(e && e.message || e).slice(0, 60) + "）" };
    });
  }

  /* ══ かたちのある板に 書いて見せる（2026-08-17）═════════════════════
     ★ 訴え「上に出てくるやつを マークダウン付きにできない？
       強調・線・図・表・色・数式」。
     ★ 声の書き起こしには 飾りを 入れられない（声には 太字が 無い）。
       だから **書いて見せる口**を 別に作る。Lumi は 声で話しながら、
       大事な所を ここへ 書く。
     ★ 板は 声の代わりでは ない。**声で言ったことを 書き直す**のが 役目。 */
  /* ══ 板の 形（2026-08-20・訴え）══════════════════════════════════
     「毎回 再生ボタンの 解説が 同じ マークダウンで 出てくるから、
       型が あるのかと ちょっと 疑ってしまう。**型は 大枠でいい。
       毎回 必ず ランダムに なるように**して」

     ★ なぜ 毎回 同じに なるか
       頼みかたを 変えても、書く人（Lumi）の 手癖は 変わらない。
       「見出し → 説明 → 番号つき → 箇条書き → 区切り線 → 太字のまとめ」が
       いちばん 出やすい形なので、放っておくと **必ず** それに なる。
       「いろいろな形で」と 言うだけでは 効かない（実測）。

     ★ どう 直すか
       **こちらが 毎回 別の形を 指す。** ボードを 出した その場で
       次の形を 1 つ 選び、返事に 添える。選びかたは
       **使いきるまで 同じ形を 出さない**（ただの さいころだと 続けて 同じ形が 出る）。
       形は **大枠だけ**。中の 言い回しは 縛らない。 */
  var 板の形 = [
    { 名: "問いから", 手: "「◯◯って なに？」と 問いで 始め、短く 答え、例を 1 つ 出す" },
    { 名: "くらべる表", 手: "表（| … |）で 2〜3 つを 並べて 比べ、下に 気づきを ひとこと" },
    { 名: "手順", 手: "番号つきで 手を 並べ、つまずく所に > [!コツ] を 1 つ 添える" },
    { 名: "図から", 手: "```図 …``` を 先に 出し、そのあと 図の 読みかたを 書く" },
    { 名: "ことばの意味", 手: "「語 :: 意味」を 並べる（用語の説明の 形）" },
    { 名: "チェック", 手: "- [ ] で 確かめる ことを 並べ、済んだものは - [x] にする" },
    { 名: "だいじ箱", 手: "> [!大事] と > [!注意] の 囲みを 芯にして、間を 短い文で つなぐ" },
    { 名: "たたむ", 手: "要点だけ 見せ、細かい所は ??? 見出し … ??? に たたんで 隠す" },
    { 名: "れい3つ", 手: "> [!れい] を 3 つ 並べ、最後に 共通するところを 1 行" },
    { 名: "まちがい直し", 手: "ありがちな まちがいを ~~取り消し~~ で 見せ、正しい形を **太字**で 隣に" },
    { 名: "ひとこと＋3点", 手: "言い切りの 1 文を 見出しにして、下に 3 点だけ 箇条書き" },
    { 名: "流れ", 手: "```図 はじめ -> つぎ -> おわり``` で 順番を 見せ、各段を 1 行ずつ" },
    { 名: "穴あき", 手: "大事な語を ==目立たせる== で 伏せ気味に 示し、下に 答えを たたんで 置く" },
    { 名: "ふりがな", 手: "むずかしい語に {漢字|かんじ} で ふりがなを 振り、意味を 隣に" },
    { 名: "まとめ先出し", 手: "> [!まとめ] を **いちばん 上**に 置き、そのあと 理由を 並べる" },
    { 名: "数で見る", 手: "数字・式（$…$）を 主役にして、まわりに 短い ことばを 添える" }
  ];
  var 使った形 = [];
  function つぎの形() {
    var 選 = [];
    for (var i = 0; i < 板の形.length; i++)
      if (使った形.indexOf(板の形[i].名) < 0) 選.push(板の形[i]);
    /* ★ 使いきったら 白紙に 戻す。**使いきるまで 同じ形は 出さない。** */
    if (!選.length) { 使った形 = []; 選 = 板の形.slice(); }
    var x = 選[Math.floor(Math.random() * 選.length)] || 板の形[0];
    使った形.push(x.名);
    return x;
  }

  function showNote(a) {
    a = a || {};
    var md = String(a.markdown || a.text || "").trim();
    if (!md) return { だめ: "書く中身が ありません。**何もしていません。**" };
    if (md.length > 6000) md = md.slice(0, 6000);
    var r = 板を出す(String(a.title || ""), md);
    if (r.だめ) return r;
    /* ★ **勝手に 残さない**（2026-08-19・訴え
       「AR Board は、ユーザーが 保存した時だけ 一覧に 追加しよう」）。
       もとは 出した瞬間に 一覧へ 入れていた。試しに 出したものまで
       全部 溜まるので、要るものが 埋もれていた。
       いまは 見出しの 右の 保存ボタンを 押したときだけ 入る（板を残す）。
       中身は st.板 に 持っているので、あとから いつでも 残せる。 */
    st.板 = st.板 || {};
    st.板.subject = String(a.subject || "");
    st.残した = false;
    try {
      var d0 = st.noteBox;
      if (d0) { var s0 = d0.querySelector(".vqn-s");
        if (s0) { s0.classList.remove("done"); s0.title = "残す"; s0.setAttribute("aria-label", "このボードを 残す"); } }
    } catch (e0) {}
    /* ★ **記号を 読み上げさせない**（2026-08-17・実測の不具合）。
       前は「同じことを 声でも 言ってください」と 返していた。
       Lumi は それを **書いたとおりに** 読み、
       「バックスラッシュ フラク マイナス b …」と 英語まじりの音が 続いた。
       声は **ふつうの話し言葉**。記号は 目で読むもの。 */
    var 形 = つぎの形();
    return { やった: "ボードに 書きました（" + r.文字数 + " 字）",
             つぎ: "★★ **ボードに書いた記号を 読み上げないでください。**"
               + "$ や \\frac、**、#、| は **声に出さない**。"
               + "声では「ボードに まとめたよ。要点は ○○」と ふつうの言葉で ひとこと 添えるだけ。"
               + "式は「2 分の 1」のように 日本語で 言います。"
               + "用が済んだら hideNote で 閉じます。\n"
               + "★ **次に ボードを 出すときは 形を 変えてください。**"
               + "同じ 組み立てが 続くと、読む人は 型どおりだと 感じます。\n"
               + "　　次の 形: **" + 形.名 + "** … " + 形.手 + "\n"
               + "　　（中の 言い回しは 自由です。形だけ 変えてください）\n"
               + "★★ ただし **話に 合わないなら 別の形で かまいません。**"
               + "形に 合わせるために、その話と **関係ないもの**を 板に 入れないでください。"
               + "見本や 練習は 書きません。板に 載せるのは **いま 話していること だけ**です。" };
  }
  /* ══ その場で 組み立てて **動かす**（AR App・2026-08-19）═══════════════
     ★ 訴え「即時に コーディングして、ボードで 動かせる かんたんな ゲーム、
       教材として 動かせる ゲームや アプリを 即時 組み立てて 出せるように。
       視覚的に、実際に 利用者が 操作して 理解できるようにしたい。
       コードは どんな形でもいい。**毎回 必ず 崩れずに** 作れるように」。
     ★ 「崩れない」は お願いでは 守れない。**こちらで 組み立てる。**
       ・doctype / 文字コード / 画面幅 / 土台の見た目 … こちらが 必ず 付ける
       ・三連の記号で 囲まれていても、1 枚の HTML を 丸ごと 渡されても 通す
       ・壊れたら iframe の 中だけで 止まり、**本体は 何も 起きない**
       ・壊れた文を そのまま 返すので、**次の 1 回で 直せる**
     ★ 出したものは AR Board に 残る（あとで また 触れる）。 */
  /* ══ 途中で 切れていないか 調べる（2026-08-19 の 3 度目）══════════════
     ★ 訴え「生成したものが 途切れたりしてる気がする。もったいない」。
       長いものを 頼むと、届く前に **文の途中で 終わっている**ことがある。
       そのまま 動かすと 意味の分からない エラーになり、
       Lumi は「どこが 悪いのか」を 直せない。
     ★ だから **切れていることを 名指しで 伝える**。そうすれば
       続きだけ 送り直せる（続き: true）。
     ★ 字の中と 注釈は 数えない。ここを 見落とすと
       "}" を 含む文字列で いつも「壊れている」と 言い出す。 */
  function 括弧の帳尻(js) {
    var 開 = { "{": "}", "(": ")", "[": "]" };
    var 積 = [], 中 = "", 逃 = false;
    var 未閉の字 = false;
    for (var i = 0; i < js.length; i++) {
      var c = js[i], 次 = js[i + 1];
      if (中) {
        if (逃) { 逃 = false; continue; }
        if (c === "\\") { 逃 = true; continue; }
        if (中 === "//" ) { if (c === "\n") 中 = ""; continue; }
        if (中 === "/*" ) { if (c === "*" && 次 === "/") { 中 = ""; i++; } continue; }
        if (c === 中) 中 = "";
        else if (c === "\n" && (中 === "'" || 中 === '"')) { 未閉の字 = true; 中 = ""; }
        continue;
      }
      if (c === "/" && 次 === "/") { 中 = "//"; i++; continue; }
      if (c === "/" && 次 === "*") { 中 = "/*"; i++; continue; }
      if (c === '"' || c === "'" || c === "`") { 中 = c; continue; }
      if (開[c]) { 積.push(開[c]); continue; }
      if (c === "}" || c === ")" || c === "]") {
        if (積.length && 積[積.length - 1] === c) 積.pop();
        else return { 合わない: true, 理由: "閉じが 多い（" + c + "）" };
      }
    }
    if (中 === "'" || 中 === '"' || 中 === "`") return { 合わない: true, 理由: "文字が 閉じていない" };
    if (中 === "/*") return { 合わない: true, 理由: "注釈が 閉じていない" };
    if (未閉の字) return { 合わない: true, 理由: "文字が 行の途中で 切れている" };
    if (積.length) return { 合わない: true, 理由: 積.length + " か所 閉じられていない（" + 積.slice(-3).join("") + " が 足りない）" };
    return { 合わない: false };
  }
  function 切れているか(符) {
    var js = String(符.js || "") + "\n" + String(符.code || "");
    if (js.trim()) {
      var r = 括弧の帳尻(js);
      if (r.合わない) return { 切れ: true, どこ: "js", 理由: r.理由 };
    }
    var html = String(符.html || "");
    if (html.trim()) {
      /* 開いたままの 札が 残っていないか（ざっくりで よい）。 */
      var 開札 = (html.match(/<[a-zA-Z][^>]*$/) || [])[0];
      if (開札) return { 切れ: true, どこ: "html", 理由: "札が 途中で 終わっている" };
    }
    var css = String(符.css || "");
    if (css.trim()) {
      var o = (css.match(/\{/g) || []).length, c2 = (css.match(/\}/g) || []).length;
      if (o !== c2) return { 切れ: true, どこ: "css", 理由: "{ } の数が 合わない（" + o + " 対 " + c2 + "）" };
    }
    return { 切れ: false };
  }

  /* ══ スキャンモードを 開く（2026-08-20・訴え）════════════════════════
     「スキャンしてって 言っても イマイチ スキャンされてない」
     ★ 声で 1 枚 撮る 作りだと、**撮れたのか どうかが 誰にも 分からない**。
       撮れていなくても 話は 進むので、読めていない資料で 答えてしまう。
     ★ だから **画面を 開いて 人に 撮ってもらう**。
       何枚 撮ったか・何が 読めたかが 目で 見える。
     ★ ここで やるのは **開くだけ**。読み取りも、そのあと 何にするかも
       画面の中で 人が 決める。Lumi が 勝手に 進めない。 */
  function scanMode(a) {
    a = a || {};
    if (!root.VQSCAN) {
      return { だめ: "スキャンの部品（core/scan/mode.js）が 読み込まれていません。" };
    }
    if (root.VQSCAN.開いているか()) {
      return { やった: "スキャンモードは もう 開いています。",
               つぎ: "**声で 撮らないでください。**画面の 丸いボタンを 押すのは 利用者です。" };
    }
    try { キャスト終了("スキャンモードへ"); } catch (e) {}
    try { root.VQSCAN.開く({ 件数: Number(a.count) || 0 }); }
    catch (e) { return { だめ: "スキャンモードを 開けませんでした。" }; }
    return { やった: "スキャンモードを 開きました。",
             つぎ: "★★ **ここから先は 利用者が 操作します。**\n"
               + "・紙を 何枚でも 撮れます（丸いボタン）\n"
               + "・写真や PDF も 足せます\n"
               + "・「読み取る」を 押すと 中身が 出て、そこから\n"
               + "  **ボードにまとめる／問題を作る／ゲームにする** を 選べます\n"
               + "声では「撮れたら 読み取るを 押してね」と ひとこと 添えるだけ。"
               + "**撮れたふりを しないでください。**読み取った中身は 画面に 出ます。" };
  }

  /* ══ 型（できあいの ひな型）から 出す ═══════════════════════════
     ★ なぜ 要るか（2026-08-20・訴え）
       「ゲームやアプリのボードは UI が 壊れたり、実用に ならないことが 多い。
         致命的な バグも ある。あらかじめ 型を 決めて 入れ込むだけにすれば
         エラーも 減るし 実用的に なる」
     ★ showApp は Lumi が **毎回 ゼロから** 書くので 毎回 違う壊れかたを する。
       こちらは **こちらが 書いて 動作を 確かめた 24 の 芯**へ
       文字と 数を 入れるだけ。だから 崩れない。 */
  function showKata(a) {
    a = a || {};
    var K = root.VQK;
    if (!K || !K.作る) {
      return { だめ: "型の 部品（core/kata）が 読み込まれていません。",
               直しかた: "showApp（自分で 書く口）を 使ってください。" };
    }
    var 芯名 = String(a.kata || a.型 || "").trim();
    var 中身 = null;
    var 生 = a.dataJson || a.data || a.中身;
    if (typeof 生 === "string") {
      try { 中身 = JSON.parse(生); }
      catch (e) {
        return { だめ: "dataJson が JSON として 読めませんでした。",
                 受け取った: String(生).slice(0, 160),
                 直しかた: "**そのままの JSON** を 1 つの文字列で 渡してください。"
                   + "例: {\"題\":\"九九\",\"やりかた\":\"かける\"}" };
      }
    } else if (生 && typeof 生 === "object") 中身 = 生;
    else 中身 = {};

    if (!K.芯の名 || K.芯の名().indexOf(芯名) < 0) {
      var 近 = [];
      try { 近 = K.さがす(芯名 + " " + String(a.title || ""), 4).map(function (x) { return x.芯 + "（" + x.名 + "）"; }); } catch (e2) {}
      return { だめ: "その型は ありません: " + (芯名 || "（空）"),
               近い型: 近,
               ぜんぶ: K.芯の名 ? K.芯の名().join(" ") : "",
               直しかた: "kata に **一覧の 名前** を そのまま 入れてください。" };
    }

    var m = K.見た目を選ぶ(芯名, String(a.title || "") + "|" + String(a.look || ""));
    var 骨 = String(a.layout || a.骨 || "").trim(), 色 = String(a.palette || a.色 || "").trim(), 詰 = String(a.density || a.詰 || "").trim();
    var 型ID = K.組む(芯名,
      K.骨たち[骨] ? 骨 : m.骨,
      K.色たち[色] ? 色 : m.色,
      K.詰たち[詰] ? 詰 : m.詰);

    var r;
    try { r = K.作る(型ID, 中身); }
    catch (e3) {
      return { だめ: "型を 組み立てられませんでした: " + (e3 && e3.message || e3),
               直しかた: "中身の 形を 一覧の とおりに 直して もう一度 呼んでください。" };
    }
    var 名 = String(a.title || r.見出し || "").slice(0, 60) || r.見出し || "AR App";
    var 符 = { html: r.html, css: r.css, js: r.js, code: "", libs: [], title: 名 };
    st.前のアプリ = 符;
    return 板でアプリを出す(名, 符).then(function (res) {
      if (res && res.やった) {
        st.板のアプリ = { 名: 名, 符: 符, note: String(a.note || ""), subject: String(a.subject || "") };
        st.残した = false;
        try {
          var d1 = st.noteBox;
          if (d1) { var s1 = d1.querySelector(".vqn-s");
            if (s1) { s1.classList.remove("done"); s1.title = "残す"; } }
        } catch (e4) {}
        res.型 = 型ID;
        /* ★ 入れた 中身が 直された ときは **黙らない**。
             そのままだと Lumi は「思ったとおりに 入った」と 思い込む。 */
        if ((r.直した || []).length) {
          res.直した欄 = r.直した;
          res.つぎ = "上の 欄は こちらで 形を 直しました（足りない・型ちがい）。"
            + "見て おかしければ 中身を 直して もう一度 呼んでください。";
        }
      }
      return res;
    });
  }

  function showApp(a) {
    a = a || {};
    var 符 = {
      html: String(a.html || ""),
      css: String(a.css || ""),
      js: String(a.js || ""),
      code: String(a.code || ""),
      /* ★ 借りる道具（2026-08-19 の 2 度目）。名前だけ 言えばよい。
         書き忘れても 中身から 気づいて 貸す（枠の側でやる）。 */
      libs: Array.isArray(a.libs) ? a.libs.slice(0, 8)
            : String(a.libs || "").split(/[,\s、・]+/).filter(Boolean).slice(0, 8)
    };
    if (!(符.html + 符.css + 符.js + 符.code).trim()) {
      return { だめ: "動かす中身が ありません。**何もしていません。**",
               直しかた: "html（見えるもの）と js（動き）を 入れてください。" };
    }
    /* ★ 続き（2026-08-19 の 3 度目）。長いものは 1 回で 届かないことがある。
       続き: true で **前の中身の 後ろに 足す**。作り直させない。 */
    if (a.more || a.続き || a.append) {
      var 前 = st.前のアプリ || { html: "", css: "", js: "", code: "", libs: [], title: "" };
      符.html = String(前.html || "") + 符.html;
      符.css = String(前.css || "") + 符.css;
      符.js = String(前.js || "") + 符.js;
      符.code = String(前.code || "") + 符.code;
      if (!符.libs.length) 符.libs = (前.libs || []).slice();
      if (!String(a.title || "").trim() && 前.title) a.title = 前.title;
    }
    var 名 = String(a.title || "").slice(0, 60) || "AR App";
    符.title = 名;
    st.前のアプリ = 符;

    /* ★ 届いた中身が **文の途中で 終わっていないか**。
       ここで 止めておかないと、動かして 意味の分からない エラーになる。 */
    var 切 = 切れているか(符);
    if (切.切れ) {
      var 長さ = (符.html + 符.css + 符.js + 符.code).length;
      return {
        だめ: "受け取った中身が **途中で 切れています**（" + 切.どこ + "：" + 切.理由 + "）。",
        いまの長さ: 長さ + " 字",
        直しかた: "★ 全部を 送り直さないでください。**続きだけ** を"
          + " showApp（more: true）で 送ってください。"
          + "前に 送ったぶんは こちらで 覚えています。"
          + "1 回に 送るのは 6000 字くらいまでに 分けると 確実です。"
          + "利用者には「長いから 分けて 送るね」と ひとこと 言ってください。"
      };
    }

    return 板でアプリを出す(名, 符).then(function (r) {
      if (r && r.やった) {
        /* ★ **勝手に 残さない**（2026-08-19・訴え）。
           保存ボタンを 押したときだけ 一覧へ 入る。
           残せるように、中身は ここで 覚えておく。 */
        st.板のアプリ = { 名: 名, 符: 符, note: String(a.note || ""), subject: String(a.subject || "") };
        st.残した = false;
        try {
          var d1 = st.noteBox;
          if (d1) { var s1 = d1.querySelector(".vqn-s");
            if (s1) { s1.classList.remove("done"); s1.title = "残す"; } }
        } catch (e0) {}
        r.のこり = "気に入ったら、ボードの 見出しの 右の 保存ボタンで 残せます"
          + "（押すまでは 一覧に 入りません）。";
        try {
          var 借 = (st.板の枠 && st.板の枠.道具) || [];
          if (借.length) r.借りた道具 = 借.join("・");
        } catch (e1) {}
      }
      return r;
    });
  }

  /* AR Board（残してある ボード）を 数える・開く */
  function listBoards() {
    try {
      var S = root.VQB && root.VQB.store;
      if (!S) return { だめ: "AR Board を 使えません。" };
      var 一 = S.一覧();
      return { 残してある数: 一.length,
               新しいもの: 一.slice(0, 8).map(function (b) {
                 return b.title + "（" + String(b.at).slice(5, 16).replace("T", " ") + "）"
                   + (b.photo ? "・写真あり" : ""); }),
               つぎ: 一.length ? "「AR Board を 開いて」と 言われたら openBoards です。"
                               : "まだ 何も ありません。" };
    } catch (e) { return { だめ: "数えられませんでした。" }; }
  }
  function openBoards() {
    try {
      if (!root.VQB || !root.VQB.ui) return { だめ: "AR Board を 開けません。" };
      root.VQB.ui.開く({});
      return { やった: "AR Board を 開きました。",
               つぎ: "カードを 押すと 中身が 出ます。名前を 変えたり 消したり できます。" };
    } catch (e) { return { だめ: "開けませんでした。" }; }
  }

  function hideNote() {
    var r = 板を閉じる();
    return r.閉じた ? { やった: "ボードを 閉じました。" } : { だめ: "ボードは 出ていません。" };
  }

  /* ══ 空欄に 答えを 貼る（2026-08-17）══════════════════════════════
     ★ 訴え「空欄に 解答を 残して。カメラが動いても そこに 出し続けて。
       押すと 解説も 出るように」。
     ★ solveFromCamera が 空欄を 見つけたときは **自動で 貼る**ので、
       この口は「ここに 書いて」と 場所を 指定したいときのため。 */
  function placeAnswers(a) {
    a = a || {};
    var 一覧 = Array.isArray(a.items) && a.items.length ? a.items : [a];
    var r = 答えを置く(一覧);
    if (r.だめ) return r;
    return { やった: r.置いた + " か所に 答えを 貼りました（紙に ついて動きます）",
             ところ: r.ところ, 追えないもの: r.追えないもの,
             つぎ: "「押すと 解説が 見られる」と 伝えてください。"
               + "1 つずつ 読み上げる必要は ありません。" };
  }
  function clearAnswers() {
    var r = 答えを消す();
    return r.消した ? { やった: r.消した + " 個 消しました。" }
                    : { だめ: "貼ってある答えは ありません。" };
  }

  /* ══ 読んだものを ためて、まとめる（2026-08-17）══════════════════
     ★ 訴え「最後に プリセットや Quick Mock に まとめられるようにも してほしい」。
     ★ カメラで 読んだ問題は、そのままでは **その場かぎり**で 消える。
       ためておいて、あとで **練習できる形**（プリセット）や
       **試験の形**（Quick Mock）へ 移せるようにする。
     ★ ためるのは **解いたものだけ**。読めなかったものは 入れない。 */
  function 拾い物() { return (st.拾い物 = st.拾い物 || []); }
  function 拾う(j, o) {
    o = o || {};
    var 箱 = 拾い物();
    var 問 = String(j.問題文 || o.question || "").trim();
    var 答 = String(j.答え || "").trim();
    if (!問 && !答) return 0;
    var n = 0;
    /* 空欄ごとに 分かれているなら、1 つずつ 別の問として ためる。 */
    if (Array.isArray(j.空欄) && j.空欄.length) {
      j.空欄.forEach(function (k) {
        if (!k || !k.answer) return;
        箱.push({ 問: (k.label ? k.label + " " : "") + (問 || "次の問いに答えなさい"),
                  答: String(k.answer), 説: String(k.explanation || ""),
                  自信: Number(k.confidence) || 0, 教科: String(o.subject || ""),
                  時: new Date().toISOString() });
        n++;
      });
    } else if (答) {
      箱.push({ 問: 問 || "次の問いに答えなさい", 答: 答,
                説: (j.考えかた || []).join(" / "), 自信: Number(j.自信) || 0,
                教科: String(o.subject || ""), 時: new Date().toISOString() });
      n++;
    }
    while (箱.length > 200) 箱.shift();
    return n;
  }

  /* ためたものを **プリセット**にする（練習できる形） */
  function makePresetFromCamera(a) {
    a = a || {};
    var 箱 = 拾い物();
    if (!箱.length)
      return { だめ: "まだ 何も ためていません。**作っていません。**",
               やること: "先に solveFromCamera で 問題を 読んでください。" };
    var S2 = null, ST2 = null;
    try { S2 = root.VQ2 && VQ2.schema; ST2 = root.VQ2 && VQ2.store; } catch (e) {}
    if (!S2 || !ST2 || !S2.emptyPreset) return { だめ: "プリセットを 作れません。" };
    var 名 = String(a.name || "").trim()
      || ("カメラで読んだ問題 " + new Date().toISOString().slice(5, 10).replace("-", "/"));
    var 問ら = 箱.map(function (x, i) {
      return S2.emptyQuestion({
        type: "word_input",              /* 答えを 打ち込む形（選択肢を こちらで作らない） */
        prompt: x.問,
        correctAnswer: x.答,
        explanation: x.説,
        topic: x.教科 || undefined,
        points: 1,
        /* 自信が 低かったものは **印を残す**（あとで 人が 見直せるように） */
        requiresReview: x.自信 > 0 && x.自信 < 0.6,
        number: i + 1
      });
    });
    var p = S2.emptyPreset({ name: 名, questions: 問ら,
                             description: "カメラで 読み取った問題を まとめたもの" });
    try { ST2.savePreset(p, { ownerId: ST2.currentOwnerId ? ST2.currentOwnerId() : "local" }); }
    catch (e2) { return { だめ: "保存できませんでした（" + String(e2 && e2.message).slice(0, 60) + "）" }; }
    var 要確認 = 箱.filter(function (x) { return x.自信 > 0 && x.自信 < 0.6; }).length;
    st.拾い物 = [];
    return { やった: "「" + 名 + "」を 作りました（" + 問ら.length + " 問）",
             要確認: 要確認 ? 要確認 + " 問は 自信が 低いので 印を付けました" : undefined,
             つぎ: "プリセット一覧から 解けます。"
               + (要確認 ? "**印の付いた問は 答えを 確かめてもらってください。**" : "") };
  }

  /* ためたものを **Quick Mock（試験）**へ渡す */
  function sendToQuickMock(a) {
    a = a || {};
    var 箱 = 拾い物();
    if (!箱.length)
      return { だめ: "まだ 何も ためていません。**作っていません。**",
               やること: "先に solveFromCamera で 問題を 読んでください。" };
    var MB = null, ST2 = null, QM = null;
    try { MB = root.VQ2 && VQ2.mockBuilder; ST2 = root.VQ2 && VQ2.store;
          QM = root.VQ2 && VQ2.quickMock; } catch (e) {}
    if (!MB || !MB.fromDraft || !ST2 || !ST2.mocks || !ST2.mocks.put)
      return { だめ: "Quick Mock へ 渡せません。" };
    var 題 = String(a.title || "").trim() || "カメラで読んだ問題の試験";
    /* Quick Mock の 下書きの形に そろえる（作りは 向こうが 決める）。 */
    var draft = {
      title: 題, subject: String(a.subject || (箱[0] && 箱[0].教科) || ""),
      sections: [{ title: "大問1", instruction: "次の問いに答えなさい。",
        questions: 箱.map(function (x, i) {
          /* ★ 下書きの 問題文の欄は **question**（prompt では 中身が 消える。
             実測: 渡した文が 空のまま 試験に なっていた）。 */
          return { id: "cq" + (i + 1), type: "short_answer", question: x.問,
                   explanation: x.説, questionNumber: i + 1 };
        }) }],
      answerKey: 箱.map(function (x, i) {
        return { id: "cq" + (i + 1), answer: x.答, explanation: x.説 };
      })
    };
    var spec = null;
    try {
      var r = MB.fromDraft(draft, {});
      spec = r && r.spec ? r.spec : r;
      if (spec && MB.finalize) MB.finalize(spec, []);
    } catch (e3) {
      return { だめ: "試験の形に できませんでした（" + String(e3 && e3.message).slice(0, 80) + "）。"
                 + "**何も 作っていません。**" };
    }
    if (!spec || !spec.sections) return { だめ: "試験の形に できませんでした。**何も 作っていません。**" };
    spec.title = 題;
    try {
      /* ★ 入れ物の口は save ではなく **put**（実測で 分かった。
         save だと「そんな関数は 無い」で 落ちていた）。 */
      var rec = ST2.mocks.put({ id: spec.id, title: 題, spec: spec },
        { ownerId: ST2.currentOwnerId ? ST2.currentOwnerId() : "local" });
      var id = (rec && rec.id) || spec.id;
      if (QM && QM.open) QM.open({ mockId: id });
      st.拾い物 = [];
      return { やった: "「" + 題 + "」を Quick Mock で 開きました（" + 箱.length + " 問）",
               つぎ: "紙面や 配点は Quick Mock の画面で 直せます。"
                 + "**そのままでは 配点も 紙面も 決まっていません。**" };
    } catch (e4) {
      return { だめ: "渡せませんでした（" + String(e4 && e4.message).slice(0, 80) + "）" };
    }
  }
  function listCollected() {
    var 箱 = 拾い物();
    return { ためた数: 箱.length,
             中身: 箱.slice(-12).map(function (x, i) {
               return (i + 1) + ") " + String(x.問).slice(0, 40) + " → " + x.答; }),
             つぎ: 箱.length
               ? "makePresetFromCamera（練習用）か sendToQuickMock（試験）へ まとめられます。"
               : "まだ 何も ありません。" };
  }
  function clearCollected() {
    var n = 拾い物().length; st.拾い物 = [];
    return n ? { やった: n + " 問 捨てました。" } : { だめ: "ためているものは ありません。" };
  }

  /* ══ 覚えておく（2026-08-17）═══════════════════════════════════════
     ★ 訴え「暗記してと言っても 暗記してくれない」。
       これまで 覚え書きは **会話の終わりに 画面が作る要約 1 本だけ**で、
       しかも 毎回 まるごと 上書きしていた。
       Lumi が「覚えたよ」と言っても、**どこにも 残っていなかった。**
     ★ ここは 足していくだけの口。覚えたものは 次の会話でも 消えない。
     ★ **返りを見ずに「覚えた」と 言わせない。**保存できなければ そう返す。 */
  function remember(a) {
    a = a || {};
    var 中身 = String(a.note || a.text || "").trim();
    if (!中身) return Promise.resolve({ だめ: "覚える中身が ありません。**何もしていません。**" });
    var tk = token();
    if (!tk) return Promise.resolve({ だめ: "ログインしていないので 覚えられません。**何もしていません。**" });
    return fetch(api() + "/api/lumi/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify({ note: 中身.slice(0, 300), tag: String(a.tag || "").slice(0, 24) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.覚えた) {
        return { だめ: "覚えられませんでした（" + ((j && j.message) || "理由不明") + "）。"
          + "**覚えたと 言わないでください。**" };
      }
      st.memo = j.memory || st.memo;
      return { やった: "覚えました: 「" + 中身.slice(0, 60) + "」",
               いま覚えている数: j.覚えている数,
               つぎ: "次に話すときも 覚えています。忘れてほしいと言われたら forget です。" };
    }).catch(function (e) {
      return { だめ: "覚えられませんでした（" + String(e && e.message || e).slice(0, 60) + "）。"
        + "**覚えたと 言わないでください。**" };
    });
  }
  function forget(a) {
    a = a || {};
    var 語 = String(a.about || a.text || "").trim();
    if (!語) return Promise.resolve({ だめ: "どれを忘れるか 分かりません。**何もしていません。**" });
    var tk = token();
    if (!tk) return Promise.resolve({ だめ: "ログインしていません。**何もしていません。**" });
    return fetch(api() + "/api/lumi/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify({ forget: 語.slice(0, 100) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: "忘れられませんでした。" };
      st.memo = j.memory || st.memo;
      return j.消した
        ? { やった: j.消した + " 件 忘れました。", のこり: j.覚えている数 }
        : { だめ: "その言葉で 覚えているものは ありませんでした。**何も消していません。**",
            のこり: j.覚えている数 };
    }).catch(function () { return { だめ: "忘れられませんでした。" }; });
  }

  /* ══ 見たものを **残す**（2026-08-17）══════════════════════════════
     ★ 訴え「AR の内容や 解説を 保存できるようにしてほしい。
       そうすれば あとにも 持ち越せる」。
     ★ 置き場は **Workplace の Docs**。新しい入れ物を 作らない。
       そこへ入れれば、あとから 直せる・印刷できる・共有できる——
       すでにある仕組みが 全部 使える。
     ★ 同じノートへ **足していく**（1 回ごとに 別の書類を作らない）。 */
  var ノートの題 = "カメラのノート";
  function saveLook(a) {
    a = a || {};
    var WP = null, M = null, ST = null;
    try { WP = root.VQ2 && VQ2.workplace; M = WP && WP.model; ST = WP && WP.store; } catch (e) {}
    if (!WP || !M || !ST) return Promise.resolve({ だめ: "Workplace を 使えません。" });
    var 写 = st.最後の写真 || (st.cast && st.castKind === "カメラ" ? しっかり撮る(1280) : null);
    var 答 = st.最後の答え || null;
    var 見出し = String(a.title || "").trim()
      || (答 && 答.問題文 ? String(答.問題文).slice(0, 40) : "見たもの");
    var 覚え = String(a.note || "").trim()
      || (答 ? [答.答え ? "答え: " + 答.答え : "",
                (答.考えかた || []).length ? "考えかた: " + 答.考えかた.join(" / ") : ""]
               .filter(Boolean).join("\n") : "");
    if (!写 && !覚え) return Promise.resolve({ だめ: "残すものが ありません。" });

    var 時 = new Date();
    var 日付 = 時.getFullYear() + "/" + (時.getMonth() + 1) + "/" + 時.getDate()
      + " " + String(時.getHours()).padStart(2, "0") + ":" + String(時.getMinutes()).padStart(2, "0");
    var 塊 = [{ type: "heading2", text: 見出し },
              { type: "paragraph", text: 日付 + (答 && 答.使った頭 ? "　／　" + 答.使った頭 : "") }];
    if (写) 塊.push({ type: "image", src: 写.dataUrl, alt: "カメラで写したもの",
                      caption: 見出し + "（" + 写.幅 + "×" + 写.高 + "）" });
    if (覚え) 覚え.split("\n").forEach(function (l) { if (l) 塊.push({ type: "paragraph", text: l }); });
    if (答 && 答.本の答え) {
      塊.push({ type: "paragraph", text: "本の答え: " + 答.本の答え });
      if (答.食い違い) 塊.push({ type: "quote", text: "食い違い: " + 答.食い違い });
    }
    塊.push({ type: "divider" });

    /* すでに開いている「カメラのノート」があれば **そこへ足す**。 */
    var K = WPC();
    var いま = K && K.いま ? K.いま() : null;
    var 同じ = いま && K.書類 && String((K.書類(いま) || {}).title || "").indexOf(ノートの題) >= 0;
    if (同じ) {
      var r = K.docs.まとめて({ blocks: 塊 });
      return Promise.resolve(r && r.だめ ? r
        : { やった: "「" + ノートの題 + "」へ " + 塊.length + " 個 足しました。",
            どこ: ノートの題, つぎ: "あとから Docs で 直せます。" });
    }
    /* 無ければ 新しく 1 冊 作る。 */
    var content = { schemaVersion: (M.SCHEMA_VERSION || {}).document || 1,
                    content: M.emptyBody("document") };
    content.content.blocks = [{ id: M.uid("b"), type: "heading1", text: ノートの題 }]
      .concat(塊.map(function (x) {
        var o = { id: M.uid("b"), type: x.type, text: String(x.text || "") };
        if (x.src) { o.src = x.src; o.alt = x.alt || ""; o.caption = x.caption || ""; }
        if (x.type === "divider") delete o.text;
        return o;
      }));
    return ST.create("document", { title: ノートの題, content: content }).then(function (res) {
      if (WP.docs && WP.docs.open) WP.docs.open({ item: res.item, content: res.content });
      return { やった: "「" + ノートの題 + "」を 作って 残しました。",
               どこ: ノートの題, つぎ: "次からは 同じノートへ 足していきます。" };
    }).catch(function (e) {
      return { だめ: "残せませんでした（" + String(e && e.message || e).slice(0, 60) + "）" };
    });
  }

  function fixAt(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    if (typeof K.直す !== "function")
      return { だめ: "この画面では まだ使えません。slidesEdit / docsEdit を使ってください。" };
    a = a || {};
    var 願 = [];
    if (Array.isArray(a.items) && a.items.length) {
      a.items.slice(0, 40).forEach(function (x) { 願.push(なおし(x)); });
    } else 願.push(なおし(a));
    return 落ち着いてから(K.直す({ まとめて: 願, 全部に当てる: !!a.applyAll,
                                  なぜ: a.why || a.なぜ }));
  }
  function なおし(x) {
    x = x || {};
    var o = {};
    if (x.id) o.どこ = { by: "nodeId", id: String(x.id) };
    else if (x.mark) o.どこ = { by: "text", scope: x.role, contains: String(x.mark) };
    else if (x.index) o.どこ = { by: "ordinal", scope: x.role, index: Number(x.index) };
    else if (x.cell) o.どこ = { by: "field", docTypeField: String(x.cell) };
    /* どれも無ければ 画面で 選んでいる所（by: selection） */
    if (x.text !== undefined) o.文 = String(x.text);
    if (x.formula !== undefined) o.式 = String(x.formula);
    if (x.attrs) o.属性 = x.attrs;
    if (x.remove) o.消す = true;
    if (x.pin !== undefined) o.留める = !!x.pin;
    if (x.applyAll) o.全部に当てる = true;
    return o;
  }

  /* ── Sheets ───────────────────────────────────────────────── */
  function sheetsWrite(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.sheets.セル(a || {}));
  }
  /* 集計表（ピボット）。**元の 表は 触らない**（新しい シートへ 書く）。 */
  function sheetsPivot(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.sheets.集計(a || {}));
  }

  function sheetsEdit(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    a = a || {};
    var op = String(a.op || "");
    if (op === "rowcol" || op === "行列")
      return 落ち着いてから(K.sheets.行列(付け替え(a, { rowcolOp: "op" })));
    if (op === "sheet" || op === "シート")
      return 落ち着いてから(K.sheets.シート(付け替え(a, { sheetOp: "op" })));
    if (op === "chart" || op === "グラフ")
      return 落ち着いてから(K.sheets.グラフ(付け替え(a, { chartOp: "op" })));
    if (op === "conditional" || op === "条件")
      return 落ち着いてから(K.sheets.条件(付け替え(a, { conditionalOp: "op" })));
    var f = { style: K.sheets.書式, "書式": K.sheets.書式,
              sort: K.sheets.並べ替え, "並べ替え": K.sheets.並べ替え,
              merge: K.sheets.結合, "結合": K.sheets.結合,
              freeze: K.sheets.固定, "固定": K.sheets.固定 }[op];
    if (!f) return { だめ: "その操作は分かりません。**何もしていません。**",
                     できる操作: ["rowcol", "style", "sort", "merge", "freeze", "sheet", "chart"] };
    return 落ち着いてから(f(a));
  }

  /* ── Slides ───────────────────────────────────────────────── */
  function slidesPlan(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return K.slides.配置(a || {});
  }
  function slidesWrite(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.slides.組む(a || {}));
  }
  function slidesEdit(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    a = a || {};
    var op = String(a.op || "");
    if (op === "page" || op === "ページ")
      return 落ち着いてから(K.slides.ページ(付け替え(a, { pageOp: "op" })));
    if (op === "element" || op === "部品")
      return 落ち着いてから(K.slides.部品(付け替え(a, { elementOp: "op" })));
    var f = { theme: K.slides.見た目, "見た目": K.slides.見た目,
              review: K.slides.見直す, "見直す": K.slides.見直す }[op];
    if (!f) return { だめ: "その操作は分かりません。**何もしていません。**",
                     できる操作: ["page", "element", "theme", "review"] };
    return 落ち着いてから(f(a));
  }

  /* ── 参考資料（自由に 使える 絵）─────────────────────────────
     ★ 探すのと 取り込むのは **分ける**。
       探しただけで 取り込むと、選ばなかった 絵まで 置き場を 食う。
     ★ 見つけたものは ここに 控える。usePicture は 番号で 指す。 */
  var 絵の候補 = { 言葉: "", 並: [], 時: 0 };
  function findPicture(a) {
    a = a || {};
    var q = String(a.query || a.q || a["言葉"] || "").trim();
    if (!q) return { だめ: "探す言葉が ありません。**探していません。**",
                     形: 'findPicture({ query: "photosynthesis diagram" })' };
    var S2 = root.VQSTOCK;
    if (!S2 || typeof S2.探す !== "function")
      return { だめ: "参考資料の 部品が 読み込まれていません。**探していません。**" };
    var 数 = Math.max(1, Math.min(12, Number(a.limit) || 6));
    return S2.探す(q, { limit: 数 }).then(function (r) {
      if (!r.ok) return { だめ: "探せませんでした（" + (r["なぜ"] || "") + "）。" };
      絵の候補 = { 言葉: q, 並: r.images || [], 時: Date.now() };
      if (!絵の候補.並.length)
        return { 見つかった数: 0,
                 つぎ: "見つかりませんでした。**英語の 言葉**のほうが 見つかります"
                   + "（例: 「光合成の図」→「photosynthesis diagram」）。" };
      return {
        言葉: q,
        見つかった数: 絵の候補.並.length,
        候補: 絵の候補.並.slice(0, 数).map(function (x, i) {
          return { 番号: i + 1, 題: String(x.title || "").slice(0, 60),
                   決まり: x.license || "", 作者: String(x.author || "").slice(0, 40),
                   提供元: x.source || "" };
        }),
        落ちた提供元: (r["落ちた"] || []).length ? r["落ちた"] : undefined,
        つぎ: "★ **まだ 何も 置いていません。**使う 1 枚を usePicture({number}) で 選ぶと"
          + " 取り込んで、src と credit を 返します。それを そのまま"
          + " slidesWrite / docsWrite の image に 渡してください。"
          + "**credit を 落とさないこと**（作者の 表示が 決まりです）。"
      };
    }).catch(function (e) {
      return { だめ: "探せませんでした（" + String(e && e.message || e) + "）。" };
    });
  }
  function usePicture(a) {
    a = a || {};
    var n = Number(a.number || a["番号"] || 0);
    if (!絵の候補.並.length)
      return { だめ: "まだ 探していません。**取り込んでいません。**",
               つぎ: "先に findPicture({query}) で 探してください。" };
    if (!(n >= 1 && n <= 絵の候補.並.length))
      return { だめ: "その番号は ありません。**取り込んでいません。**",
               選べる番号: "1 〜 " + 絵の候補.並.length };
    var x = 絵の候補.並[n - 1];
    var S2 = root.VQSTOCK;
    if (!S2 || typeof S2.取り込む !== "function")
      return { だめ: "参考資料の 部品が 読み込まれていません。**取り込んでいません。**" };
    return S2.取り込む(x).then(function (r) {
      if (!r.ok) return { だめ: "取り込めませんでした（" + (r["なぜ"] || "") + "）。"
                                 + "別の 番号を 試してください。" };
      var 一行 = "";
      try { 一行 = S2.出どころの文(r.credit) || ""; } catch (e2) {}
      return {
        src: r.url, credit: r.credit, alt: String(x.title || "").slice(0, 80),
        出どころ: 一行, 大きさ: r.bytes ? Math.round(r.bytes / 1024) + " KB" : undefined,
        つぎ: "★ **まだ 画面には 置いていません。**"
          + 'slidesWrite なら {type:"image", src, credit, x, y, w, h}、'
          + 'docsWrite なら {type:"image", src, credit} で 置いてください。'
          + "**credit を 必ず 一緒に 渡すこと**（落とすと 決まり違反に なります）。"
      };
    }).catch(function (e) {
      return { だめ: "取り込めませんでした（" + String(e && e.message || e) + "）。" };
    });
  }

  /* ══ デザインエンジン経由の 発表資料づくり（2026-08-17）═══════════════
     ★ ここは slidesWrite と役目が違う。
       slidesWrite は「1 枚を あなたが座標つきで置く」道具。
       deck* は「**あなたは 座標も色も出さない**。役目と文だけ渡す」道具。
       色・書体・余白・座標は client/design/ が 計算で出す。
     ★ 10 枚 20 枚を まとめて作るときは こちら。1 枚の手直しは slidesEdit。 */
  function DE() { return root.VQD && root.VQD.pipeline ? root.VQD.pipeline : null; }
  function デザイン層が無い() {
    return { だめ: "デザインエンジンが読み込まれていません。**何もしていません。**",
             どうする: "画面を開き直してください。それでも出るなら slidesPlan / slidesWrite を使ってください。" };
  }
  function deckStart(a) {
    var P = DE(); if (!P) return Promise.resolve(デザイン層が無い());
    var K = WPC(); if (!K) return Promise.resolve(操作の口が無い());
    a = a || {};
    /* 開いているのが発表資料でなければ、先に 1 つ作る。
       「開いていません」で止めない（利用者はもう頼んでいる）。 */
    var c = null;
    try { c = K.いま(); } catch (e) {}
    if (c && c.kind === "presentation") return Promise.resolve(P.deckStart(a));
    return Promise.resolve(K.ファイル.作る({ kind: "presentation", title: a.title || "" }))
      .then(function (r) {
        return settle(700).then(function () {
          var 出 = P.deckStart(a);
          出.作った書類 = (r && (r.やった || r.書類)) || "新しい発表資料";
          return 出;
        });
      });
  }
  function deckDesign(a) {
    var P = DE(); if (!P) return デザイン層が無い();
    return 落ち着いてから(P.deckDesign(a || {}));
  }
  function deckWrite(a) {
    var P = DE(); if (!P) return デザイン層が無い();
    return 落ち着いてから(P.deckWrite(a || {}));
  }
  function deckFinish(a) {
    var P = DE(); if (!P) return デザイン層が無い();
    var r = P.deckFinish(a || {});
    /* ★ deckFinish は **中で Layout Gate を全ページ通している**。
       これを「見直した」として控えないと、finishTask の関門が
       「まだ見直していません」と断り続け、Lumi が同じ資料を
       もう一度 端から直しにいく（実測で 60 秒 むだにしていた）。
       断られた（だめ）ときは 控えない。 */
    try {
      if (!r || !r.だめ) {
        var K = WPC(), c = K && K.いま();
        if (c) st.見直し = { 書類: (K.書類(c) || {}).id, 時: Date.now(),
                             残り: Number(r && r.崩れ) || 0, 種類: c.kind };
        st.作りかけ = null;               /* 仕上がったので 催促の種を消す */
      }
    } catch (e) {}
    return 落ち着いてから(r);
  }

  /* ── Forms ────────────────────────────────────────────────── */
  function formsWrite(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    return 落ち着いてから(K.forms.まとめて(a || {}));
  }
  function formsEdit(a) {
    var K = WPC(); if (!K) return 操作の口が無い();
    a = a || {};
    var op = String(a.op || "");
    if (op === "field" || op === "質問")
      return 落ち着いてから(K.forms.質問(付け替え(a, { fieldOp: "op" })));
    if (op === "section" || op === "まとまり")
      return 落ち着いてから(K.forms.まとまり(付け替え(a, { sectionOp: "op" })));
    var f = { settings: K.forms.設定, "設定": K.forms.設定 }[op];
    if (!f) return { だめ: "その操作は分かりません。**何もしていません。**",
                     できる操作: ["field", "section", "settings"] };
    return 落ち着いてから(f(a));
  }

  /* ══ 開いているものを 直す（4 種すべて・2026-08-16）════════════════
     ★ 前は Docs だけだった。Sheets / Slides / Forms は「直して」と言っても
       最初から断っていた（cur.kind !== "document"）。
     ★ 直しかたは種類で変える。**まるごと作り直すのは Docs だけ**。
       表・スライド・フォームは 番地や id を指した差し替えにする。
       作り直すと、置いた位置も書式も消えて「直したのに壊れた」になる。 */
  function editDocument(a) {
    var inst = String((a && a.instruction) || "").trim();
    if (!inst) return Promise.resolve({ だめ: "どう直すか教えてください。" });
    var c = wpNow(), body = wpBodyNow();
    if (!c || !body) {
      return Promise.resolve({ だめ: "いま開いている書類がありません。"
        + "先に Workplace で開くか、makeDocument で作ってください。" });
    }
    var 今 = null;
    try {
      if (c.kind === "spreadsheet") 今 = 表を読む(body);
      else if (c.kind === "presentation") 今 = 発表を読む(body);
      else if (c.kind === "form") 今 = 問いを読む(body);
      else 今 = { blocks: (body.blocks || []).map(function (b) {
        return { id: b.id, type: b.type, text: String(b.text || "").slice(0, 400) }; }) };
    } catch (e) {}
    if (!今) return Promise.resolve({ だめ: "中身を読めませんでした。" });

    return fetch(api() + "/api/wp/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ kind: c.kind, instruction: inst,
        blocks: 今.blocks, いま: 今,
        関数: c.kind === "spreadsheet" ? 関数一覧().slice(0, 60) : undefined })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: (j && j.message) || "直せませんでした。" };
      var 変えた = あてる(c, body, j);
      if (変えた.だめ) return 変えた;
      try { if (j.title) c.item.title = j.title; } catch (e) {}
      try { c.paint(); } catch (e) {}
      try { c.session.touch ? c.session.touch() : (c.session.saveNow && c.session.saveNow()); } catch (e) {}
      return settle(1200).then(function () {
        var now = lookScreen("");
        now.直した = inst.slice(0, 60);
        now.何を = 変えた.何を;
        now.つぎ = "**直した所を、いま画面で確かめてから** 伝えてください。"
          + "確かめずに『直したよ』と言わないこと。";
        return now;
      });
    }).catch(function (e) {
      return { だめ: "直せませんでした（" + String(e && e.message || e).slice(0, 60) + "）" };
    });
  }

  /* 返ってきた直しを、いまの中身へ **あてる**（作り直さない） */
  /* ★ 受け口（2026-08-20）。cmd.js が 持っている「形をそろえる」道具。
     ここを 通さないと、同じ 訴え（改行が 文字のまま／表が 空／
     グラフが 出ない／画布の 外）が **この道だけ** 残る。 */
  function 受け口() {
    try { return (VQ2.workplace.cmd && VQ2.workplace.cmd["受け口"]) || null; } catch (e) { return null; }
  }
  function 文そろえ(v) { var R = 受け口(); return R ? R.文(v) : String(v === undefined || v === null ? "" : v); }
  /* ★ 文書（Docs）の 文は **HTML として 描かれる**。改行は <br>。
     スライドと 同じ道具（改行は \n）を 使うと 改行が 消える。分けること。 */
  function 文書文(v) {
    var R = 受け口();
    return R && R["文書の文"] ? R["文書の文"](v) : String(v === undefined || v === null ? "" : v);
  }

  function あてる(c, body, j) {
    var M = VQ2.workplace.model;
    if (c.kind === "document") {
      /* ★ 全文の作り直しをやめた（2026-08-16）。長い文書だと出力が尽きて
         毎回失敗し、表や画像の塊も 黙って消えていた。id を指して当てる。 */
      var 直 = 0, 足 = 0, 消 = 0, 前 = body.blocks.length;
      var 位置 = function (id) {
        for (var i = 0; i < body.blocks.length; i++) if (body.blocks[i].id === id) return i;
        return -1;
      };
      (j.edits || []).forEach(function (e) {
        var i = 位置(String(e && e.id));
        if (i < 0) return;
        if (e.text !== undefined) body.blocks[i].text = 文書文(e.text);
        if (e.type) body.blocks[i].type = String(e.type);
        if (e.rows !== undefined || e.headers !== undefined) {
          var R0 = 受け口(), 表0 = R0 ? R0.表(e) : null;
          if (表0) { body.blocks[i].rows = 表0; body.blocks[i].type = "table"; }
        }
        直++;
      });
      var R2 = 受け口();
      (j.adds || []).forEach(function (a) {
        var ty = String(a.type || "paragraph");
        if (ty === "numbered") ty = "number";
        if (R2 && R2["文書の種類"]) ty = R2["文書の種類"](ty) || ty;
        var 塊 = { id: M.uid("b"), type: ty, text: 文書文(a.text) };
        if (a.rows !== undefined || a.headers !== undefined) {
          var R1 = 受け口(), 表1 = R1 ? R1.表(a) : null;
          塊.rows = 表1 || a.rows; 塊.header = a.header !== false;
        }
        /* ★ 記入欄・解答欄（2026-08-17）。
           「持っていない値は 埋めない」を 形にするための 箱。
           ここを受け取らないと、モデルが field を返しても 素の段落になる。 */
        if (ty === "field") {
          塊.label = String(a.label || a.key || ""); 塊.key = String(a.key || a.label || "");
          塊.dataType = String(a.dataType || "text");
          塊.hint = String(a.hint || (塊.label ? 塊.label + " を書く欄です" : ""));
          塊.text = "";
        }
        if (ty === "answerSpace") {
          塊.lines = Math.max(1, Math.min(20, Number(a.lines) || 3));
          塊.label = String(a.label || ""); 塊.text = "";
        }
        var w = String(a.after || "end");
        if (w === "start") body.blocks.unshift(塊);
        else if (w === "end") body.blocks.push(塊);
        else {
          var i2 = 位置(w);
          if (i2 < 0) body.blocks.push(塊); else body.blocks.splice(i2 + 1, 0, 塊);
        }
        足++;
      });
      (j.removes || []).forEach(function (id) {
        var i3 = 位置(String(id));
        if (i3 >= 0 && body.blocks.length > 1) { body.blocks.splice(i3, 1); 消++; }
      });
      if (!直 && !足 && !消) return { だめ: "変える所が返りませんでした。" };
      return { 何を: "文を " + 直 + " か所直した"
        + (足 ? "・" + 足 + " 個足した" : "") + (消 ? "・" + 消 + " 個消した" : "")
        + "（かたまり " + 前 + " → " + body.blocks.length + " 個）" };
    }
    if (c.kind === "spreadsheet") {
      var sh = (body.sheets || [])[Math.min(body.activeSheet || 0, (body.sheets || []).length - 1)];
      if (!sh) return { だめ: "シートがありません。" };
      sh.cells = sh.cells || {};
      var 入れた = [], 消した = 0;
      (j.cells || []).forEach(function (x) {
        var ref = String((x && x.ref) || "").toUpperCase().trim();
        if (!/^[A-Z]+\d+$/.test(ref)) return;
        if (x.f) { sh.cells[ref] = { f: String(x.f) }; 入れた.push(ref + "=" + x.f); }
        else if (x.v !== undefined && x.v !== null && String(x.v) !== "") {
          sh.cells[ref] = { v: String(x.v) }; 入れた.push(ref + ":" + x.v);
        }
      });
      (j.removes || []).forEach(function (ref2) {
        var k = String(ref2 || "").toUpperCase().trim();
        if (sh.cells[k]) { delete sh.cells[k]; 消した++; }
      });
      /* ★ グラフ（2026-08-16）。画面はもとから描けるのに 口が無かった。 */
      var 図 = 0;
      body.charts = body.charts || [];
      (j.addCharts || []).forEach(function (c) {
        body.charts.push({ id: M.uid("ch"), type: String(c.type || "bar"),
          range: String(c.range || ""), title: String(c.title || ""),
          sheet: Math.min(body.activeSheet || 0, (body.sheets || []).length - 1) });
        図++;
      });
      if (!入れた.length && !消した && !図) return { だめ: "変えるマスが返りませんでした。" };
      return { 何を: (入れた.length ? "マス " + 入れた.length + " 個を入れた" : "")
        + (消した ? "・" + 消した + " 個を消した" : "")
        + (図 ? (入れた.length ? "・" : "") + "グラフを " + 図 + " 個作った" : "")
        + (入れた.length ? "（" + 入れた.slice(0, 8).join(" / ") + "）" : "") };
    }
    if (c.kind === "presentation") {
      var 直 = 0, 足 = 0, 消 = 0;
      var byId = {};
      (body.slides || []).forEach(function (sl) {
        (sl.elements || []).forEach(function (e) { byId[e.id] = e; });
      });
      var R = 受け口();
      (j.elements || []).forEach(function (x) {
        var e = byId[String(x && x.id)];
        if (!e) return;
        if (x.text !== undefined) { e.text = 文そろえ(x.text); 直++; }
        ["size", "bold", "italic", "align", "color", "lh"].forEach(function (k) {
          if (x[k] !== undefined) { e[k] = x[k]; 直++; }
        });
        /* 表・グラフ の 差し替えも 受ける（前は 文字しか 直せなかった） */
        if (R && (x.rows !== undefined || x.headers !== undefined)) {
          var 表 = R.表(x); if (表) { e.rows = 表; 直++; }
        }
        if (R && (x.chart !== undefined || x.labels !== undefined || x.series !== undefined)) {
          var 図 = R.グラフ(x); if (図) { e.chart = 図; 直++; }
        }
      });
      /* 文字の箱を足す（2026-08-16）。これまで **足す口が無かった**ので、
         「ここに一言入れて」と頼まれても何も起きなかった。 */
      var 箱 = 0;
      (j.addElements || []).forEach(function (x) {
        var i = Math.max(0, Math.min((body.slides || []).length - 1, (Number(x.slide) || 1) - 1));
        var sl2 = body.slides[i];
        if (!sl2) return;
        /* ★ 文字だけでなく **図形・線・表** も置けるようにした（2026-08-16）。
           画面はもとから描ける（regEl で登録済み）のに、
           ここが text 決め打ちだったので「図形は入れられない」と言っていた。 */
        var ty2 = String(x.type || "text");
        if (R) ty2 = R.部品名(ty2);
        var e2 = { id: M.uid("e"), type: ty2,
                   x: R ? R.数(x.x, 70, 960) : (Number(x.x) || 70),
                   y: R ? R.数(x.y, 300, 540) : (Number(x.y) || 300),
                   w: R ? R.数(x.w, 820, 960) : (Number(x.w) || 820),
                   h: R ? R.数(x.h, 80, 540) : (Number(x.h) || 80), z: 1 };
        if (ty2 === "shape") {
          e2.shape = R ? R.形(x.shape !== undefined ? x.shape : x.type)
                       : (["rect", "circle", "triangle"].indexOf(String(x.shape)) >= 0 ? String(x.shape) : "rect");
          if (x.fill) e2.fill = String(x.fill);
          if (x.opacity !== undefined) e2.opacity = Number(x.opacity);
          if (x.radius !== undefined) e2.radius = Number(x.radius);
          e2.z = 0;                       /* 図形は後ろに敷く（文字を隠さない） */
        } else if (ty2 === "line" || ty2 === "arrow") {
          if (x.color) e2.color = String(x.color);
          if (x.weight !== undefined) e2.weight = Number(x.weight);
        } else if (ty2 === "table") {
          var 表2 = R ? R.表(x) : null;
          e2.rows = 表2 || (Array.isArray(x.rows) ? x.rows : [["", ""], ["", ""]]);
          e2.size = Number(x.size) || 14;
          if (x.header !== undefined) e2.header = !!x.header;
        } else if (ty2 === "chart") {
          /* ★ グラフを 足す口が **無かった**（2026-08-20）。
             画面は 描けるのに、この道だけ 文字箱に 化けていた。 */
          var 図2 = R ? R.グラフ(x) : null;
          if (!図2) return;
          e2.chart = 図2;
          if (x.h === undefined) e2.h = 300;
        } else if (ty2 === "image") {
          if (!String(x.src || "")) return;
          e2.src = String(x.src);
          if (x.alt) e2.alt = String(x.alt);
        } else {
          e2.type = "text";
          e2.text = 文そろえ(x.text);
          e2.size = Number(x.size) || 20;
          e2.align = x.align || "left";
          e2.lh = 1.5;
          if (x.bold !== undefined) e2.bold = !!x.bold;
          if (x.color) e2.color = String(x.color);
        }
        if (R) { R.箱(e2, { w: 960, h: 540 }); R.収める(e2, { w: 960, h: 540 }); R.箱(e2, { w: 960, h: 540 }); }
        sl2.elements = (sl2.elements || []).concat([e2]);
        箱++;
      });
      /* 足したあと、そのページの 重なりを ほどく（置きっぱなしにしない） */
      if (R && 箱) (body.slides || []).forEach(function (sl3) {
        R.重なり(sl3.elements || [], { w: 960, h: 540 });
      });
      (j.addSlides || []).forEach(function (sl) {
        var 新 = スライドにする(sl, body.slides.length, M);
        if (新) { body.slides.push(新); 足++; }
      });
      (j.removeSlides || []).forEach(function (id) {
        var i = -1;
        body.slides.forEach(function (sl, k) { if (sl.id === id) i = k; });
        if (i >= 0 && body.slides.length > 1) { body.slides.splice(i, 1); 消++; }
      });
      if (j.theme) body.theme = j.theme;
      if (!直 && !足 && !消 && !箱 && !j.theme) return { だめ: "変える所が返りませんでした。" };
      return { 何を: "文字を " + 直 + " か所直した"
        + (箱 ? "・" + 箱 + " 個の箱を足した" : "")
        + (足 ? "・" + 足 + " 枚足した" : "") + (消 ? "・" + 消 + " 枚消した" : "")
        + (j.theme ? "・テーマを " + j.theme + " にした" : "") };
    }
    /* フォーム */
    var uid = function (p2) { return p2 + Math.random().toString(36).slice(2, 9); };
    var 直2 = 0, 足2 = 0, 消2 = 0;
    var 全部 = {};
    (body.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (f) { 全部[f.id] = f; });
    });
    (j.fields || []).forEach(function (x) {
      var f = 全部[String(x && x.id)];
      if (!f) return;
      if (x.label !== undefined) { f.label = String(x.label); 直2++; }
      if (x.required !== undefined) { f.required = !!x.required; 直2++; }
      if (x.type) { f.type = String(x.type); 直2++; }
      if (Array.isArray(x.options)) {
        f.options = x.options.map(function (o) { return { id: uid("o"), label: String(o) }; });
        直2++;
      }
    });
    (j.addFields || []).forEach(function (x) {
      var sec = (body.sections || [])[0];
      if (!sec) return;
      sec.fields.push({ id: uid("f"), type: String(x.type || "text"), label: String(x.label || ""),
        options: (x.options || []).map(function (o) { return { id: uid("o"), label: String(o) }; }),
        required: !!x.required });
      足2++;
    });
    (j.removeFields || []).forEach(function (id) {
      (body.sections || []).forEach(function (sec) {
        var i = -1;
        (sec.fields || []).forEach(function (f, k) { if (f.id === id) i = k; });
        if (i >= 0) { sec.fields.splice(i, 1); 消2++; }
      });
    });
    if (j.title !== undefined && (body.sections || [])[0]) body.sections[0].title = String(j.title);
    if (j.description !== undefined && (body.sections || [])[0]) {
      body.sections[0].description = String(j.description);
    }
    if (!直2 && !足2 && !消2) return { だめ: "変える所が返りませんでした。" };
    return { 何を: "質問を " + 直2 + " か所直した"
      + (足2 ? "・" + 足2 + " 個足した" : "") + (消2 ? "・" + 消2 + " 個消した" : "") };
  }

  /* ══ 「なんでこうなるの？」に 背景から答える（2026-08-16）════════
     ★ いま画面に出ている問題を読み取って、サーバで組み立ててから返す。
       Lumi はそれを **自分の言葉で** 話す。
     ★ 年号・人名を作り話にしないための土台でもある。 */
  /* ★ 問題の **正解**を、アプリの中から取り出す（2026-08-16）。
     訴え「解説はそれっぽいのに、ほとんど正解を外す」の原因はここだった。
     正解は **解く前は画面に出ない**ので、画面を読むだけでは分からない。
     AI が当てにいって外していた。アプリは持っているので、そのまま渡す。
     （実測した形: choices[].isCorrect が正解、explanation が公式の解説） */
  function answerOf(q) {
    if (!q) return null;
    var out = { 正解: "", 選択肢: [], 公式の解説: "", 分野: "", 手がかり: "" };
    try {
      out.公式の解説 = String(q.explanation || "").slice(0, 800);
      out.分野 = [q.topic].concat(q.tags || []).filter(Boolean).join(" / ").slice(0, 80);
      out.手がかり = String(q.hint || "").slice(0, 200);
      if (Array.isArray(q.choices) && q.choices.length) {
        var ok = [];
        q.choices.forEach(function (c) {
          out.選択肢.push({ 印: c.label || "", 文: String(c.text || "").slice(0, 200),
                            正解か: !!c.isCorrect,
                            この選択肢の解説: String(c.explanation || "").slice(0, 300) });
          if (c.isCorrect) ok.push((c.label ? c.label + ". " : "") + String(c.text || ""));
        });
        out.正解 = ok.join(" / ");
      }
      if (!out.正解 && q.correctAnswer != null) out.正解 = String(q.correctAnswer).slice(0, 300);
      if (!out.正解 && Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length) {
        out.正解 = q.acceptedAnswers.map(function (x) { return String(x); }).join(" / ").slice(0, 300);
      }
      if (!out.正解 && Array.isArray(q.blanks) && q.blanks.length) {
        out.正解 = q.blanks.map(function (b2) {
          return String(b2.answer || (b2.accepted || [])[0] || "");
        }).filter(Boolean).join(" / ").slice(0, 300);
      }
      if (!out.正解 && Array.isArray(q.orderItems) && q.orderItems.length) {
        out.正解 = q.orderItems.map(function (x) { return String(x.text || x); }).join(" → ").slice(0, 400);
      }
      if (!out.正解 && Array.isArray(q.pairs) && q.pairs.length) {
        out.正解 = q.pairs.map(function (x) {
          return String(x.left || x.a || "") + " ＝ " + String(x.right || x.b || "");
        }).join(" / ").slice(0, 400);
      }
    } catch (e) {}
    return out;
  }

  function explainWhy(a) {
    var focus = String((a && a.focus) || "").trim();

    /* ── ① まず **アプリが持っている問題**を見る（正解つき）───────── */
    var now = null;
    try { now = root.VQ2 && VQ2.quizNow; } catch (e) {}
    if (now && now.question) {
      var q = now.question;
      var got = answerOf(q);
      var mine = "";
      try {
        var ans = now.answered;
        if (ans) {
          if (ans.choiceId && Array.isArray(q.choices)) {
            q.choices.forEach(function (c) {
              if (c.id === ans.choiceId) mine = (c.label || "") + ". " + c.text;
            });
          } else if (ans.text) mine = String(ans.text).slice(0, 200);
          else if (ans.value != null) mine = String(ans.value).slice(0, 200);
        }
      } catch (e) {}
      var 控え = { 正解: got.正解, 公式の解説: got.公式の解説,
                   話しかた: "正解と公式の解説は **確かなもの**です。これを土台に、"
                     + "なぜそうなるかを自分の言葉で足して話してください。" };
      return fetch(api() + "/api/quiz/why", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({
          question: String(q.prompt || q.instruction || "").slice(0, 1200),
          choices: got.選択肢.map(function (c) { return (c.印 ? c.印 + ". " : "") + c.文; }),
          answer: got.正解,
          official: got.公式の解説,
          topic: got.分野,
          hint: got.手がかり,
          userAnswer: mine,
          focus: focus,
          subject: (now.preset && now.preset.subject) || ""
        })
      }).then(function (x) { return x.json(); }).then(function (j) {
        if (!j || !j.ok) return 控え;
        j.問題 = String(q.prompt || "").slice(0, 200);
        j.何問目 = now.index + " / " + now.total;
        j.こたえ = got.正解 || j.こたえ;      /* ★ 正解は こちらの値で上書きする */
        j.公式の解説 = got.公式の解説;
        j.話しかた = "**こたえは確定しています。変えないでください。**"
          + "これを土台に、自分の言葉で話します。まず答え、つぎに なぜそうなるかを"
          + "順番が分かるように。相手が選んだものが違うならその理由。最後に覚えかた。";
        return j;
      }).catch(function () { return 控え; });
    }

    /* ── ② 出題中でないときは、画面から読む（正解は分からない）───── */
    var r = readScreen({});
    var lines = (r.書いてあること || []);
    if (!lines.length) return Promise.resolve({ だめ: "画面に文字が見つかりませんでした。" });
    var qt = "";
    lines.forEach(function (x) {
      var t = x.replace(/^[■・｜！]\s*/, "");
      if (t.length > qt.length && t.length < 600) qt = t;
    });
    var l = lookScreen("");
    var choices = [];
    (l.操作できるもの || []).forEach(function (x) {
      var m = x.match(/「([A-Da-d1-4①-④][ .、）)]?\s*.+)」/);
      if (m && choices.length < 8) choices.push(m[1]);
    });
    return fetch(api() + "/api/quiz/why", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ question: qt, choices: choices, focus: focus,
                             subject: (l.いまの画面 || "") })
    }).then(function (x) { return x.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: (j && j.message) || "説明を組み立てられませんでした。" };
      j.読んだ問題 = qt.slice(0, 200);
      j.ことわり = "**正解は画面に出ていないので、こちらで確かめられていません。**"
        + "断定せずに「たぶんこうだと思う」と伝えてください。";
      return j;
    }).catch(function (e) {
      return { だめ: "説明を組み立てられませんでした（" + String(e && e.message || e).slice(0, 50) + "）" };
    });
  }

  /* ══ 苦手を見て 次を提案する（2026-08-16）════════════════════════
     ★ 訴え「ユーザーの足りないところを提案し、それに合ったプリセットも
       問題全て終了後に作ったりだとか、導線を作らないとだね」。
     ★ 端末に残っている結果を読んで、**低い順**に並べて返す。
       Lumi はそれを見て「ここが弱いから作ろうか？」と持ちかける。
     ★ 作るのは makePreset（既にある）。ここでは **何を作るべきか**を出す。 */
  function weakSpots(a) {
    /* ★ 結果の入れ物は **配列ではなく list() を持つ**（実測で確かめた）。 */
    var rs = [];
    try {
      var R = root.VQ2 && VQ2.store && VQ2.store.results;
      if (R && typeof R.list === "function") rs = R.list() || [];
      else if (Array.isArray(R)) rs = R;
    } catch (e) {}
    if (!rs.length) {
      try { rs = JSON.parse(root.localStorage.getItem("vq2.results") || "[]"); } catch (e) {}
    }
    if (!Array.isArray(rs)) rs = [];
    if (!rs.length) return { まだ無い: "解いた記録がありません。まず 1 回やってみようと誘ってください。" };

    /* ★ 記録に入っているのは score / maxScore（実測 2026-08-16）。
       correct / total / questions は **どれも存在しない**ので、
       これまで正答率は 1 件も出せず、苦手も出せていなかった。 */
    var rate = function (r) {
      var c = Number(r.score !== undefined ? r.score : r.correct);
      var t = Number(r.maxScore !== undefined ? r.maxScore : r.total);
      if (!isFinite(c) || !isFinite(t) || t <= 0) return null;
      return Math.round(c * 100 / t);
    };
    var 直近 = rs.slice(-30).reverse();
    var 束 = {};
    直近.forEach(function (r) {
      var k = String(r.presetName || r.title || r.presetId || "（名前なし）");
      var v = rate(r);
      if (v === null) return;
      if (!束[k]) 束[k] = { 名前: k, 回数: 0, 合計: 0, 科目: r.subject || "" };
      束[k].回数++; 束[k].合計 += v;
    });
    var 一覧 = Object.keys(束).map(function (k) {
      var b = 束[k];
      return { 名前: b.名前, 科目: b.科目, 回数: b.回数, 平均: Math.round(b.合計 / b.回数) };
    }).sort(function (x, y) { return x.平均 - y.平均; });

    /* 問題ごとの取りこぼしも見る（あれば） */
    var 落とした = [];
    直近.slice(0, 5).forEach(function (r) {
      var qs = r.questions || r.items || [];
      qs.forEach(function (q) {
        var ng = (q.correct === false) || (q.ok === false) || (q.isCorrect === false);
        if (ng && 落とした.length < 12) {
          落とした.push(String(q.q || q.question || q.prompt || "").replace(/\s+/g, " ").slice(0, 60));
        }
      });
    });

    return {
      解いた回数: rs.length,
      苦手な順: 一覧.slice(0, 6),
      得意な順: 一覧.slice(-3).reverse(),
      最近まちがえた問題: 落とした.filter(Boolean).slice(0, 8),
      つぎ: "いちばん低いものと、まちがえた問題の中身を見て、"
        + "**何が足りていないか**を一言で言ってから、"
        + "「そこだけ集めた問題を作ろうか？」と誘ってください。"
        + "いいと言われたら makePreset に、科目・分野・問題数・形式まで入れた"
        + "具体的な指示を渡します（「日本史の鎌倉時代、御家人制度まわりの4択を10問、解説は詳しく」のように）。"
    };
  }

  /* ══ 片づけ（2026-08-16）══════════════════════════════════════════
     ★ 「Docs のいらないファイルを消して、プリセットも整理して」を通す。
     ★ **勝手には消さない。** どちらの道具も sure が true でないと動かない。
       名前を読み上げて確かめてから、もう一度呼ばせる。
     ★ 書類は **ゴミ箱まで**（あとで戻せる）。完全に消す道はここに置かない。
     ★ 消したあと **本当に消えたかを見てから** 返す。 */
  function wpStore() {
    try { return (root.VQ2 && VQ2.workplace && VQ2.workplace.store) || null; } catch (e) { return null; }
  }
  var 種類名 = { document: "Docs（文書）", spreadsheet: "Sheets（表）",
                presentation: "Slides（スライド）", form: "Forms（フォーム）" };

  function 下書き(it) {
    var p = (it && it.preview) || {};
    if (p.kind === "document") {
      return (p.lines || []).map(function (l) { return l && l.t; }).filter(Boolean).join(" ");
    }
    if (p.kind === "presentation") return String(p.title || "");
    return String(p.text || "");
  }
  function 何日前(iso) {
    var t = Date.parse(iso || "") || 0;
    if (!t) return -1;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function listFiles(a) {
    var ST2 = wpStore();
    if (!ST2 || !ST2.list) return Promise.resolve({ だめ: "Workplace が見つかりません。" });
    var kind = String((a && a.kind) || "").trim();
    var opts = { status: "active", sort: "updated" };
    if (種類名[kind]) opts.itemType = kind;
    return Promise.resolve(ST2.list(opts)).then(function (r) {
      var items = ((r && r.items) || []).slice(0, 40);
      st.files = items;                     /* 番号で消せるように覚えておく */
      if (!items.length) {
        return { 書類: [], 件数: 0,
                 つぎ: (種類名[kind] || "Workplace") + " に書類はありません。"
                   + "**消すものはありません。** そう正直に伝えてください。" };
      }
      var 一覧 = items.map(function (it, i) {
        var d = 何日前(it.updatedAt || it.createdAt);
        var body = 下書き(it).replace(/\s+/g, " ").trim();
        var 印 = [];
        if (!body) 印.push("**中身が見当たらない**");
        if (d >= 30) 印.push(d + " 日 さわっていない");
        return (i + 1) + ". 「" + (it.title || "（名前なし）") + "」"
          + "（" + (種類名[it.itemType] || it.itemType) + "・"
          + (d < 0 ? "日付なし" : (d === 0 ? "今日" : d + " 日前")) + "）"
          + (body ? " 中身: " + body.slice(0, 40) : "")
          + (印.length ? "  ← " + 印.join("・") : "");
      });
      return { 書類: 一覧, 件数: items.length,
               つぎ: "**どれを消すかは あなたが決めず、利用者に確かめてください。**"
                 + "「中身が見当たらない」「長くさわっていない」ものを候補として挙げ、"
                 + "名前を読み上げて、いいと言われたものだけ deleteFile を sure=true で呼びます。" };
    }, function (e) {
      return { だめ: "一覧が取れませんでした。" + ((e && e.message) ? "（" + e.message + "）" : "") };
    });
  }

  function 書類をさがす(want, num) {
    var list = st.files || [];
    var it = null;
    if (num >= 1 && num <= list.length) it = list[num - 1];
    var w = String(want || "").trim();
    if (w) {                                /* ★ 名前が番号に勝つ */
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].title || "").indexOf(w) >= 0) { hit = list[i]; break; }
      }
      it = hit || (it && String(it.title || "").indexOf(w) >= 0 ? it : null);
    }
    return it;
  }

  function deleteFile(a) {
    var ST2 = wpStore();
    if (!ST2 || !ST2.meta) return Promise.resolve({ だめ: "Workplace が見つかりません。" });
    var list = st.files || [];
    if (!list.length) {
      return Promise.resolve({ だめ: "まだ一覧を見ていません。先に listFiles を呼んでください。" });
    }
    var want = String((a && a.name) || "").trim();
    var it = 書類をさがす(want, Number(a && a.number) || 0);
    if (!it) {
      return Promise.resolve({
        だめ: want ? "「" + want + "」という書類は 一覧にありません。"
                   : "どれを消すか、名前で教えてください。",
        いまある書類: list.map(function (x, k) { return (k + 1) + ". " + (x.title || "（名前なし）"); }),
        つぎ: "消したと言わないでください。" });
    }
    var 題 = it.title || "（名前なし）";
    if (!a || a.sure !== true) {
      return Promise.resolve({
        まだ消していません: 題,
        つぎ: "**利用者に「" + 題 + "」を消していいか、名前を言って確かめてください。**"
          + "いいと言われてから、sure を true にして もう一度呼びます。"
          + "確かめる前に消したと言わないでください。" });
    }
    return Promise.resolve(ST2.meta(it.id, { action: "trash" })).then(function () {
      /* ★ 本当に消えたかを、手元の控えで確かめる */
      var なお = false;
      try {
        (ST2.localItems() || []).forEach(function (x) {
          if (x.id === it.id && x.status !== "trashed") なお = true;
        });
      } catch (e) {}
      if (なお) {
        return { だめ: "「" + 題 + "」は **消えていません**。",
                 つぎ: "消したと言わないでください。" };
      }
      st.files = list.filter(function (x) { return x !== it; });
      return { ゴミ箱へ入れた: 題, のこり: st.files.length + " 件",
               もどせる: "ゴミ箱から戻せます。完全には消していません。",
               つぎ: st.files.length
                 ? "続けて消すものがあれば、また名前を確かめてから呼んでください。"
                 : "この種類の書類は無くなりました。" };
    }, function (e) {
      return { だめ: "「" + 題 + "」は消せませんでした。"
        + ((e && e.message) ? "（" + e.message + "）" : ""),
        つぎ: "消したと言わないでください。" };
    });
  }

  /* ── プリセットの片づけ ──────────────────────────────────────────
     ★ プリセットは **ゴミ箱が無い**（消すと戻せない）。だから確かめを更に固くする。 */
  /* ★ V2 プリセットの名前は title ではなく **name**（実測 2026-08-16:
     title で読んでいて 全部「（名前なし）」になり、名前で消せなかった）。 */
  function 題名(p) { return String((p && (p.name || p.title)) || "").trim(); }
  function 問題数(p) {
    if (!p) return 0;
    if (Array.isArray(p.questions) && p.questions.length) return p.questions.length;
    if (Array.isArray(p.words) && p.words.length) return p.words.length;
    if (Array.isArray(p.cards) && p.cards.length) return p.cards.length;
    return 0;
  }
  function myPresets() {
    var S2 = null;
    try { S2 = root.VQ2 && VQ2.store; } catch (e) {}
    if (!S2 || !S2.listPresets) return { だめ: "プリセットが見つかりません。" };
    var all = [];
    try { all = S2.listPresets({}) || []; } catch (e) { all = []; }
    st.presets = all.slice(0, 60);
    if (!st.presets.length) {
      return { プリセット: [], 件数: 0, つぎ: "プリセットはありません。そう伝えてください。" };
    }
    var 数 = Object.create(null);
    st.presets.forEach(function (p) { var t = 題名(p); 数[t] = (数[t] || 0) + 1; });
    var 一覧 = st.presets.map(function (p, i) {
      var n = 問題数(p);
      var d = 何日前(p.updatedAt || p.createdAt);
      var 印 = [];
      if (!n) 印.push("**問題が 0 問**");
      if (数[題名(p)] > 1) 印.push("同じ名前が複数");
      if (/^(新しいプリセット|無題|untitled)/i.test(題名(p))) 印.push("名前が既定のまま");
      if (d >= 60) 印.push(d + " 日 使っていない");
      if (p.__source === "legacy") 印.push("古い形式（消せません）");
      return (i + 1) + ". 「" + (題名(p) || "（名前なし）") + "」"
        + "（" + n + " 問・" + (d < 0 ? "日付なし" : (d === 0 ? "今日" : d + " 日前")) + "）"
        + (印.length ? "  ← " + 印.join("・") : "");
    });
    return { プリセット: 一覧, 件数: st.presets.length,
             つぎ: "**プリセットはゴミ箱がありません。消すと戻せません。**"
               + "「問題が 0 問」「名前が既定のまま」のものを候補として挙げ、"
               + "名前を読み上げて 1 つずつ確かめ、いいと言われたものだけ "
               + "removePreset を sure=true で呼んでください。まとめて消さないでください。" };
  }

  function removePreset(a) {
    var S2 = null;
    try { S2 = root.VQ2 && VQ2.store; } catch (e) {}
    if (!S2 || !S2.deletePreset) return { だめ: "プリセットが見つかりません。" };
    /* ★ **名前が分かっているなら 一覧を見ていなくても消せる**（2026-08-17）。
       前は myPresets を先に呼んでいないと必ず断られていたので、
       「◯◯を消して」と言われるたび 2 手 余計にかかっていた。
       番号で指すときだけは、どの一覧の番号かが要るので これまでどおり。 */
    var list = st.presets || [];
    var want = String((a && a.name) || "").trim();
    if (!list.length && want) {
      try { list = S2.listPresets({}) || []; } catch (e2) { list = []; }
    }
    if (!list.length) return { だめ: "まだ一覧を見ていません。先に myPresets を呼んでください。" };
    var num = Number(a && a.number) || 0;
    var p = null;
    if (num >= 1 && num <= list.length) p = list[num - 1];
    if (want) {                             /* ★ 名前が番号に勝つ */
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        if (題名(list[i]).indexOf(want) >= 0) { hit = list[i]; break; }
      }
      p = hit || (p && 題名(p).indexOf(want) >= 0 ? p : null);
    }
    if (!p) {
      return { だめ: want ? "「" + want + "」というプリセットは 一覧にありません。"
                          : "どれを消すか、名前で教えてください。",
               いまあるプリセット: list.map(function (x, k) {
                 return (k + 1) + ". " + (題名(x) || "（名前なし）"); }),
               つぎ: "消したと言わないでください。" };
    }
    var 題 = 題名(p) || "（名前なし）";
    if (p.__source === "legacy") {
      return { だめ: "「" + 題 + "」は 古い形式のプリセットで、ここからは消せません。",
               つぎ: "消せないと正直に伝えてください。" };
    }
    if (!a || a.sure !== true) {
      return { まだ消していません: 題, 問題数: 問題数(p),
               つぎ: "**「" + 題 + "」（" + 問題数(p) + " 問）を消していいか、"
                 + "名前を言って利用者に確かめてください。ゴミ箱はありません。戻せません。**"
                 + "いいと言われてから sure を true にして もう一度呼びます。" };
    }
    var r = null;
    /* ★ 写し（V1）も一緒に消す（2026-08-17）。
       こちらだけ消すと、写しが「古い形式」として一覧へ戻ってきて、
       利用者には **消したのに残っている** としか見えなかった。 */
    try { r = S2.deletePreset(p.id, { alsoV1: true }); } catch (e) { r = { ok: false, error: "ERROR" }; }
    if (!r || !r.ok) {
      return { だめ: "「" + 題 + "」は消せませんでした（" + ((r && r.error) || "不明") + "）。",
               つぎ: "消したと言わないでください。" };
    }
    /* ★ 本当に消えたかを、もう一度並べて確かめる */
    var なお = false;
    try {
      (S2.listPresets({}) || []).forEach(function (x) { if (x.id === p.id) なお = true; });
    } catch (e) {}
    if (なお) return { だめ: "「" + 題 + "」は **まだ残っています**。", つぎ: "消したと言わないでください。" };
    st.presets = list.filter(function (x) { return x !== p; });
    return { 消した: 題, のこり: st.presets.length + " 件",
             つぎ: "戻せないので、消したものの名前を そのまま伝えてください。" };
  }

  /* ══════════════════════════════════════════════════════════════════
     プリセットの中身を **まとめて** 読む・直す（2026-08-16）

     ★ 訴え「10 問ぜんぶに解説を入れて、が完了まで行かない」。
       原因は言い聞かせではなく **道具が無かった**こと。
       これまで Lumi にできたのは 一覧・削除・新規作成だけで、
       中の問題を読む道も 書く道も 1 本も無かった。
       だから画面を押して回るしかなく、1 問 2〜3 手 × 10 問 ＝ 20〜30 手。
       手数の上限（25 手）に **必ず**引っかかって打ち切られていた。
     ★ 読むのも直すのも **1 手**で終わる形にする。
     ★ 直したら **本当に入ったかを読み直して**から返す。
     ══════════════════════════════════════════════════════════════════ */
  function 素のプリセット(a) {
    var S2 = null;
    try { S2 = root.VQ2 && VQ2.store; } catch (e) {}
    if (!S2 || !S2.listPresets) return { だめ: "プリセットが見つかりません。" };
    var all = [];
    try { all = S2.listPresets({}) || []; } catch (e) { all = []; }
    if (!all.length) return { だめ: "プリセットがありません。" };
    var want = String((a && a.name) || "").trim();
    var num = Number(a && a.number) || 0;
    var list = (st.presets && st.presets.length) ? st.presets : all;
    var p = null;
    if (num >= 1 && num <= list.length) p = list[num - 1];
    if (want) {
      var hit = null;
      for (var i = 0; i < all.length; i++) {
        if (題名(all[i]).indexOf(want) >= 0) { hit = all[i]; break; }
      }
      p = hit || (p && 題名(p).indexOf(want) >= 0 ? p : null);
    }
    if (!p) {
      return { だめ: want ? "「" + want + "」というプリセットは見つかりません。"
                          : "どのプリセットか、名前で教えてください。",
               あるもの: all.slice(0, 20).map(function (x, k) { return (k + 1) + ". " + 題名(x); }) };
    }
    return { p: p, S: S2 };
  }

  function readPresetQuestions(a) {
    var r = 素のプリセット(a);
    if (r.だめ) return r;
    var p = r.p, qs = p.questions || [];
    var from = Math.max(1, Number(a && a.from) || 1);
    var to = Math.min(qs.length, Number(a && a.to) || qs.length);
    var 出 = [];
    for (var i = from - 1; i < to && i < qs.length; i++) {
      var q = qs[i];
      var n = i + 1;
      try { n = Number(VQ2.draft.numberOf(q, i)) || (i + 1); } catch (e) {}
      var 正 = (q.choices || []).filter(function (c) { return c.isCorrect; })
        .map(function (c) { return c.text || c.label; })[0] || q.correctAnswer || "";
      出.push({
        番号: n,
        問題: String(q.prompt || "").slice(0, 300),
        こたえ: String(正).slice(0, 120),
        解説: String(q.explanation || ""),
        解説あり: !!String(q.explanation || "").trim(),
        分野: String(q.topic || "").slice(0, 60)
      });
    }
    var 無し = 出.filter(function (x) { return !x.解説あり; }).map(function (x) { return x.番号; });
    return { プリセット: 題名(p), 問題数: qs.length, 読んだ範囲: from + "〜" + to,
             問題: 出,
             解説が無い問: 無し.length ? 無し : "なし",
             つぎ: 無し.length
               ? "解説の無い問が " + 無し.length + " 問あります（" + 無し.join("・") + " 問目）。"
                 + "**editPresetQuestions で まとめて入れてください。**"
                 + "1 問ずつ画面を押して回らないこと（手数が尽きます）。"
               : "ぜんぶ解説が入っています。" };
  }

  /* ══ プリセットの表紙まわりを 声から直す（2026-08-17）════════════════
     ★ 「一覧から削除したり、名前・概要・アイコン・バナーを 自律的に」。
     ★ 保存は 1 か所（VQ2.store.savePreset）。直したら **読み直して**確かめる。
     ★ 絵（バナー）は 1 枚ごとに費用がかかるので、**頼まれたときだけ**作る。 */
  function editPreset(a) {
    var r = 素のプリセット(a);
    if (r.だめ) return r;
    var p = r.p, S2 = r.S;
    if (p.__source === "legacy") {
      return { だめ: "「" + 題名(p) + "」は古い形式で、ここからは直せません。",
               つぎ: "直せないと正直に伝えてください。" };
    }
    a = a || {};
    var ST = root.VQ2 && VQ2.presetStudio;
    var 変 = [];
    var 元名 = 題名(p);

    if (Q文(a.title).trim()) { p.name = Q文(a.title).trim().slice(0, 80); 変.push("名前"); }
    if (a.description !== undefined) {
      p.description = Q文(a.description).slice(0, 600); 変.push("説明");
    }
    if (Q文(a.subject).trim()) { p.subject = Q文(a.subject).trim().slice(0, 40); 変.push("科目"); }
    if (Array.isArray(a.tags)) {
      p.tags = a.tags.map(function (x) { return Q文(x).slice(0, 24); }).filter(Boolean).slice(0, 12);
      変.push("タグ");
    }
    p.appearance = p.appearance || { icon: "", iconImage: "", banner: "" };

    /* アイコン。**画面が持っている一覧の中からだけ** 選ぶ（無い名前は出せない）。
       絵文字はそのまま使える。 */
    var 候補 = null;
    var 欲 = Q文(a.icon).trim();
    if (欲) {
      /* ★ 絵文字かどうかは **絵文字の印**で見る（2026-08-17・実測）。
         「1〜2 文字の非 ASCII」で見ていたので、「地図」「時計」のような
         **日本語の 2 文字がそのまま保存**され、画面に出せない印になっていた。 */
      var 絵文字 = false;
      try { 絵文字 = /\p{Extended_Pictographic}/u.test(欲) && Array.from(欲).length <= 2; }
      catch (e6) { 絵文字 = /[\u2190-\u2BFF\u2600-\u27BF\uD800-\uDFFF\uFE0F]/.test(欲); }
      if (絵文字) { p.appearance.icon = 欲; 変.push("アイコン"); }
      else {
        var 見 = (ST && ST.iconFind) ? ST.iconFind(欲) : [];
        var 完全 = 見.filter(function (x) { return x.name === 欲; })[0];
        if (完全) { p.appearance.icon = 完全.name; 変.push("アイコン"); }
        else if (見.length) {
          p.appearance.icon = 見[0].name;
          候補 = 見.slice(0, 6).map(function (x) { return x.label + "（" + x.name + "）"; });
          変.push("アイコン");
        } else {
          return { だめ: "「" + 欲 + "」に当たるアイコンがありません。",
                   つぎ: "別の言葉（本・地図・時計・音楽・実験 など）で もう一度呼ぶか、"
                     + "絵文字を 1 文字 渡してください。**変えていません。**" };
        }
      }
    }
    if (a.clearBanner === true) { p.appearance.banner = ""; 変.push("バナーを外した"); }

    var 仕上げ = function (追加) {
      if (!変.length) {
        return { だめ: "何を変えるかが入っていません。",
                 いまの中身: { 名前: 元名, 説明: Q文(p.description).slice(0, 80),
                               アイコン: Q文(p.appearance.icon) || "（なし）",
                               バナー: p.appearance.banner ? "あり" : "なし" },
                 つぎ: "title / description / icon / makeBanner のどれかを入れてください。" };
      }
      var res = null;
      try { res = S2.savePreset(p, { baseRevision: p.revision }); }
      catch (e) { res = { ok: false, message: Q文(e && e.message).slice(0, 60) }; }
      if (res && !res.ok && res.error === "VALIDATION") {
        /* もとから不備のあるプリセットで足止めしない（表紙を直しただけなので） */
        try { res = S2.savePreset(p, { baseRevision: p.revision, force: true }); } catch (e2) {}
      }
      if (!res || !res.ok) {
        return { だめ: "保存できませんでした（" + Q文((res && (res.message || res.error)) || "不明") + "）。",
                 つぎ: "変えたと言わないでください。" };
      }
      var 後 = null;
      try { 後 = S2.getPreset(p.id, {}); } catch (e3) {}
      if (!後) return { だめ: "保存したはずですが 読み直せません。", つぎ: "変えたと言わないでください。" };
      var ap = 後.appearance || {};
      try { if (ST && ST.reload) ST.reload(後.id); } catch (e4) {}
      try { if (root.__vqPresets && root.__vqPresets.refresh) root.__vqPresets.refresh(); } catch (e5) {}
      var 出 = { 変えた: 変.join("・") + "（「" + 題名(後) + "」）",
                 いまの中身: { 名前: 題名(後), 説明: Q文(後.description).slice(0, 80) || "（なし）",
                               アイコン: Q文(ap.icon) || (ap.iconImage ? "画像" : "（なし）"),
                               バナー: ap.banner ? "あり" : "なし" },
                 つぎ: "何を変えたかを 一言で伝えてください。" };
      if (候補) 出.ほかの候補 = 候補;
      if (追加) 出.バナー = 追加;
      return 出;
    };

    /* バナーは 絵を作るので 時間も費用もかかる。頼まれたときだけ。 */
    if (a.makeBanner === true) {
      if (!ST || !ST.makeBanner) return 仕上げ("この端末では 絵を作れません。");
      return ST.makeBanner({
        instruction: [題名(p), Q文(p.description)].filter(Boolean).join(" / "),
        subject: Q文(p.subject),
        samples: (p.questions || []).slice(0, 5).map(function (q) { return Q文(q.prompt); }).filter(Boolean)
      }).then(function (b) {
        if (!b || !b.ok) return 仕上げ("作れませんでした（" + Q文(b && b.why).slice(0, 60) + "）");
        p.appearance.banner = b.dataUrl;
        変.push("バナー");
        return 仕上げ("作って入れました");
      }, function () { return 仕上げ("作れませんでした。"); });
    }
    return 仕上げ(null);
  }

  /* ══ 保存済みのプリセットの **問題そのもの** を直す（2026-08-17）══════
     ★ 訴え「『3 問目を記述にして』『3 問目を ◯◯ の問題にして』が通らない」。
       これまでは 解説・問題文・分野・ヒント の 4 つしか触れず、
       **形式を変えることも、中身を作り直すこともできなかった。**
     ★ ここでは addQuestion と **同じ組み立て**を使う。
       形式が変われば骨から作り直し、番号と内部 ID は そのまま残す。 */
  function editPresetQuestions(a) {
    var r = 素のプリセット(a);
    if (r.だめ) return r;
    var p = r.p, S2 = r.S;
    if (p.__source === "legacy") {
      return { だめ: "「" + 題名(p) + "」は古い形式で、ここからは直せません。",
               つぎ: "直せないと正直に伝えてください。" };
    }
    var edits = (a && a.edits) || [];
    if (!Array.isArray(edits) || !edits.length) {
      return { だめ: "何をどう直すか、edits に入れてください。",
               つぎ: "例: [{\"number\":3,\"type\":\"free_write_ai\",\"prompt\":\"…\",\"answer\":\"…\"}]"
                 + "／解説だけなら [{\"number\":1,\"explanation\":\"…\"}]" };
    }
    var qs = p.questions || [];
    var 元の中身 = null;
    try { 元の中身 = JSON.parse(JSON.stringify(p)); } catch (e0) {}
    var 番号表 = {};
    qs.forEach(function (q, i) {
      var n = i + 1;
      try { n = Number(VQ2.draft.numberOf(q, i)) || (i + 1); } catch (e) {}
      if (!番号表[n]) 番号表[n] = { q: q, at: i };
    });
    var 中身の鍵 = ["type", "choices", "answer", "answers", "options", "blanks", "items",
                    "groups", "pairs", "table", "chart", "card", "corrections", "children",
                    "script", "rubric", "points"];
    var 直した = [], 見つからない = [], 断り = [];

    edits.slice(0, 60).forEach(function (e) {
      var row = null;
      if (e && e.id) qs.forEach(function (x, i) { if (!row && x.id === e.id) row = { q: x, at: i }; });
      if (!row && e && e.number) row = 番号表[Number(e.number)];
      if (!row) { 見つからない.push(Q文((e && (e.number || e.id)) || "?")); return; }
      var q = row.q;
      var 作り直す = 中身の鍵.some(function (k) { return e[k] !== undefined; });

      if (!作り直す) {
        /* 文だけ差し替える（骨はそのまま） */
        var 変 = [];
        if (e.explanation !== undefined) { q.explanation = Q文(e.explanation).slice(0, 4000); 変.push("解説"); }
        if (e.prompt !== undefined && Q文(e.prompt).trim()) { q.prompt = Q文(e.prompt).slice(0, 2000); 変.push("問題文"); }
        if (e.topic !== undefined) { q.topic = Q文(e.topic).slice(0, 120); 変.push("分野"); }
        if (e.hint !== undefined) { q.hint = Q文(e.hint).slice(0, 600); 変.push("ヒント"); }
        if (e.difficulty !== undefined) { q.difficulty = 難しさ(e.difficulty); 変.push("難しさ"); }
        if (変.length) 直した.push({ 番号: e.number || "", 変えたもの: 変.join("・") });
        return;
      }

      /* 形式や中身ごと 作り直す。足りないものは **入れずに** 理由を返す。 */
      var b = {};
      for (var k in e) if (e.hasOwnProperty(k)) b[k] = e[k];
      if (!Q文(b.type).trim()) b.type = q.type;
      if (b.prompt === undefined) b.prompt = q.prompt;
      if (b.explanation === undefined) b.explanation = q.explanation;
      if (b.topic === undefined) b.topic = q.topic;
      if (b.difficulty === undefined) b.difficulty = q.difficulty;
      var 出 = 問題を組む(b, (e.number ? e.number + " 問目: " : ""));
      if (出.だめ) {
        断り.push({ 番号: e.number || "", 理由: 出.だめ, 足りないもの: 出.足りないもの });
        return;
      }
      /* 番号と内部 ID は 引き継ぐ（並びと結果の記録が切れないように） */
      出.q.id = q.id;
      if (q.questionNumber !== undefined) 出.q.questionNumber = q.questionNumber;
      if (q.groupId !== undefined) 出.q.groupId = q.groupId;
      qs[row.at] = 出.q;
      row.q = 出.q;
      var QQ = QT2();
      直した.push({ 番号: e.number || "", 変えたもの: "形式と中身（" + (QQ ? QQ.label(出.q.type) : 出.q.type) + "）" });
    });

    if (!直した.length) {
      return { だめ: "直せた問がありません。**入れていません。**",
               入らなかった理由: 断り.length ? 断り : undefined,
               見つからない番号: 見つからない.length ? 見つからない : undefined,
               つぎ: 断り.length
                 ? "上の「足りないもの」を入れて もう一度 editPresetQuestions を呼んでください。"
                 : "先に readPresetQuestions で番号を確かめてください。" };
    }

    var res = null;
    try { res = S2.savePreset(p, { baseRevision: p.revision }); }
    catch (e2) { res = { ok: false, error: "ERROR", message: Q文(e2 && e2.message) }; }
    /* ★ **もとから不備のあるプリセット**で足止めしない（直す前と同じ不備なら通す）。
       ただし **黙って通さない**。何が残っているかは必ず伝える。 */
    var もとの不備 = 0;
    if (res && !res.ok && res.error === "VALIDATION") {
      try {
        var 前の姿 = JSON.parse(JSON.stringify(元の中身));
        var v0 = VQ2.validate.validatePresetForSave(前の姿, {});
        もとの不備 = (v0 || []).filter(function (x) { return x.severity === "error"; }).length;
        var いまの不備 = (res.issues || []).filter(function (x) { return x.severity === "error"; }).length;
        if (もとの不備 && いまの不備 <= もとの不備) {
          res = S2.savePreset(p, { baseRevision: p.revision, force: true });
        }
      } catch (e5) {}
    }
    if (!res || !res.ok) {
      return { だめ: "保存できませんでした（" + Q文((res && (res.message || res.error)) || "不明") + "）。",
               直せなかった理由: ((res && res.issues) || []).slice(0, 4)
                 .map(function (x) { return x.path + ": " + x.message; }),
               つぎ: "入れたと言わないでください。" };
    }
    /* 本当に入ったかを 読み直して確かめる */
    var 後 = null;
    try { 後 = S2.getPreset(p.id, {}); } catch (e3) {}
    var QT3 = QT2();
    var いまの形 = ((後 && 後.questions) || []).slice(0, 30).map(function (q, i) {
      return (i + 1) + ". " + (QT3 ? QT3.label(q.type) : q.type);
    });
    var 残り = [];
    ((後 && 後.questions) || []).forEach(function (q, i) {
      if (!Q文(q.explanation).trim()) 残り.push(i + 1);
    });
    var 映した = false;
    try {
      if (root.VQ2 && VQ2.presetStudio && VQ2.presetStudio.reload) {
        VQ2.presetStudio.reload(p.id); 映した = true;
      }
    } catch (e4) {}
    return { 入れた: 直した.length + " 問（" + 題名(p) + "）",
             中身: 直した.slice(0, 12),
             いまの形式: いまの形,
             入らなかったもの: 断り.length ? 断り : undefined,
             もとからあった不備: もとの不備 ? もとの不備 + " 件（こちらの直しとは別）" : undefined,
             見つからない番号: 見つからない.length ? 見つからない : undefined,
             解説がまだ無い問: 残り.length ? 残り : "なし",
             画面に映した: 映した,
             つぎ: 断り.length
               ? "**入らなかった問があります。**上の理由を直して もう一度呼んでください。"
               : "直りました。何をどう変えたかを 一言で伝えてください。" };
  }

  /* 保存済みのプリセットへ **問題を足す／減らす** */
  function addPresetQuestion(a) {
    var r = 素のプリセット(a);
    if (r.だめ) return r;
    var p = r.p, S2 = r.S;
    var 出 = 問題を組む(a || {}, "");
    if (出.だめ) return 出;
    p.questions = p.questions || [];
    if (p.questions.length >= 200) return { だめ: "1 つのプリセットに入れられるのは 200 問までです。" };
    p.questions.push(出.q);
    try { if (VQ2.draft && VQ2.draft.stampNumbers) VQ2.draft.stampNumbers(p.questions); } catch (e) {}
    var res = null;
    try { res = S2.savePreset(p, { baseRevision: p.revision }); }
    catch (e2) { res = { ok: false, message: Q文(e2 && e2.message) }; }
    if (res && !res.ok && res.error === "VALIDATION") {
      try { res = S2.savePreset(p, { baseRevision: p.revision, force: true }); } catch (e3) {}
    }
    if (!res || !res.ok) {
      return { だめ: "保存できませんでした（" + Q文((res && (res.message || res.error)) || "不明") + "）。",
               つぎ: "足したと言わないでください。" };
    }
    var 後 = null;
    try { 後 = S2.getPreset(p.id, {}); } catch (e4) {}
    var QQ = QT2();
    return { 足した: ((後 && 後.questions) || []).length + " 問目（"
               + (QQ ? QQ.label(出.q.type) : 出.q.type) + "）",
             プリセット: 題名(p),
             いま: ((後 && 後.questions) || []).length + " 問" };
  }

  function removePresetQuestion(a) {
    var r = 素のプリセット(a);
    if (r.だめ) return r;
    var p = r.p, S2 = r.S;
    var qs = p.questions || [];
    var n = Math.floor(Number(a && a.number));
    if (!(n >= 1 && n <= qs.length)) {
      return { だめ: "何問目かを number で入れてください（いま " + qs.length + " 問）。" };
    }
    if (!(a && a.sure === true)) {
      return { だめ: n + " 問目「" + Q文(qs[n - 1].prompt).slice(0, 40) + "」を消します。",
               つぎ: "利用者に確かめて、いいと言われてから sure=true で もう一度呼んでください。" };
    }
    if (qs.length <= 1) {
      return { だめ: "最後の 1 問は消せません（0 問のプリセットは保存できません）。",
               つぎ: "プリセットごと消すなら removePreset です。" };
    }
    var 消 = qs.splice(n - 1, 1)[0];
    try { if (VQ2.draft && VQ2.draft.stampNumbers) VQ2.draft.stampNumbers(qs); } catch (e) {}
    var res = null;
    try { res = S2.savePreset(p, { baseRevision: p.revision, force: true }); }
    catch (e2) { res = { ok: false, message: Q文(e2 && e2.message) }; }
    if (!res || !res.ok) {
      return { だめ: "保存できませんでした（" + Q文((res && (res.message || res.error)) || "不明") + "）。",
               つぎ: "消したと言わないでください。" };
    }
    var 後 = null;
    try { 後 = S2.getPreset(p.id, {}); } catch (e3) {}
    return { 消した: n + " 問目「" + Q文(消.prompt).slice(0, 40) + "」",
             のこり: ((後 && 後.questions) || []).length + " 問（" + 題名(p) + "）" };
  }

  /* ══ **まず計画を立ててから動く**（2026-08-17）════════════════════════
     ★ 「Claude Code のように、作る前・直す前に 3〜5 個 質問して、
       その答えで 構造的に考えて 自律的に進めてほしい」。
     ★ 作りは 2 つだけ。
        askPlan   … 目的と **3〜5 個の質問**を出す。ここではまだ何もしない。
        startPlan … 質問の答えと 段取りを受け取り、そこから最後まで自律的に進む。
     ★ 決まり
        ・質問は 3〜5 個。多いと 相手が疲れる（利用者の言葉）。
        ・**答えが揃うまで 動かない。** 勝手に決めて先へ行かない。
        ・答えが揃ったら **もう聞かない。** 最後まで通す。
     ★ プリセットに限らない。資料づくり・片づけ・設定の見直しにも使う。 */
  /* ══ 段取りの質問を **画面で** 聞く（2026-08-17）════════════════════
     ★ これまでは askPlan が「声で 3〜5 個 聞いてください」と返すだけだった。
       声だけで 5 問を往復するのは しんどい（1 問ごとに 10 秒近くかかる）。
     ★ 中央に窓を出し、番号で選べるようにする。
       ・1 問ずつ出す。右上に「1/4」。
       ・選択肢は 番号つき（1〜9 のキーでも選べる）
       ・いちばん下に **おまかせ** と **自由に書く欄**
       ・スキップ（この問だけ飛ばす）
     ★ 答え終わるまで 道具は返らない（返りが そのまま答えになる）。
       ただし待ちっぱなしにはしない。返事が無ければ 3 分で切り上げ、
       **答えをもらえていないと正直に返す**。
     ★ 窓の見た目は アプリの色（--vq-*）から取る。暗い見た目でもそのまま合う。 */
  var 問い窓 = null;

  function 問い窓を閉じる() {
    try { if (問い窓 && 問い窓.el && 問い窓.el.parentNode) 問い窓.el.parentNode.removeChild(問い窓.el); } catch (e) {}
    try { if (問い窓 && 問い窓.key) doc.removeEventListener("keydown", 問い窓.key, true); } catch (e) {}
    /* ★ 見張りと 切り上げの 時計も 必ず 止める（2026-08-29）。
       残すと、窓を 閉じた あとも 600ms おきに 走り続ける。 */
    try { if (問い窓 && 問い窓.見張り) clearInterval(問い窓.見張り); } catch (e) {}
    try { if (問い窓 && 問い窓.切上) clearTimeout(問い窓.切上); } catch (e) {}
    問い窓 = null;
  }

  /* 質問を そろえる。文字だけでも、選択肢つきでも受ける。 */
  function 質問をそろえる(v) {
    return Q配(v).map(function (x) {
      if (x && typeof x === "object") {
        var o = { 問: Q文(x.q || x.question || x.問).trim(), 選: [],
                  /* ★ いくつでも 選べる 問（2026-08-29）。
                     Lumi が multi:true を 付けたときだけ 複数選べる。 */
                  複数: !!(x.multi || x.multiple || x.複数) };
        Q配(x.options).forEach(function (y) {
          if (y && typeof y === "object") {
            var l = Q文(y.label || y.title).trim();
            if (l) o.選.push({ 名: l, 説: Q文(y.desc || y.description).trim() });
          } else {
            var l2 = Q文(y).trim();
            if (l2) o.選.push({ 名: l2, 説: "" });
          }
        });
        o.選 = o.選.slice(0, 6);
        return o.問 ? o : null;
      }
      var t = Q文(x).trim();
      return t ? { 問: t, 選: [] } : null;
    }).filter(Boolean);
  }

  function 問い窓を出す(目的, 質問) {
    問い窓を閉じる();
    var el = doc.createElement("div");
    el.id = "vqPlanAsk";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "段取りの確認");
    /* ★ **かならず 最前面**（2026-08-29・訴え）。
       前は z-index:9500 だった。ところが アプリの 覆い（クイズ・設定・
       プリセットの 窓）は 2147483000 台を 使う。だから この窓は
       **その 下に 隠れて**、人は 何を 聞かれているのか 分からないまま
       Lumi が 黙って 待っている、という 見え方に なっていた。
       ここは「人が 答えるまで 先へ 進めない」窓なので、
       止まっている とき の 覆い（vq-downtime = ...646）だけ 上に 残し、
       それ以外の すべてより 上に 置く。
       さらに 下の 見張りで、あとから 出た 覆いにも 抜かれないよう
       いちばん後ろの 子として 置き直す。 */
    el.style.cssText = "position:fixed;inset:0;z-index:2147483644;display:grid;place-items:center;"
      + "background:rgba(12,14,22,.52);backdrop-filter:blur(3px);padding:16px";
    var sr = el.attachShadow({ mode: "open" });
    doc.body.appendChild(el);

    var 状態 = { 番: 0, 答: [], 選び: [], 済: false, 解決: null };

    /* ★ :host に all:initial を **書かないこと**（2026-08-17・実測）。
       書くと **CSS 変数の受け継ぎまで切れて**、--vq-surface などが
       影の中へ届かなくなる。実測: 暗い見た目にしても 窓だけ真っ白のまま
       （控えの #fff が使われていた）。文字の見た目だけ揃えれば足りる。
       書体は --vq-app-font（設定の 61 種）に従わせる。 */
    sr.innerHTML = '<style>'
      + ':host{display:contents}'
      + '*{box-sizing:border-box;margin:0;padding:0;'
      + 'font-family:var(--vq-app-font,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif)}'
      + '.w{width:min(560px,100%);max-height:88vh;overflow:auto;'
      + 'background:var(--vq-surface,#fff);color:var(--vq-text,#1e2330);'
      + 'border:1px solid var(--vq-border,#e6e8f0);border-radius:22px;'
      + 'box-shadow:0 30px 80px rgba(8,11,20,.34);font-size:16px;line-height:1.6;'
      + 'animation:up .22s cubic-bezier(.2,.9,.3,1) both}'
      + '@keyframes up{from{opacity:0;transform:translateY(14px) scale(.985)}}'
      /* 上の 細い 進み具合 */
      + '.pg{height:3px;background:var(--vq-border-subtle,#eef0f6);'
      + 'border-radius:22px 22px 0 0;overflow:hidden}'
      + '.pg i{display:block;height:100%;background:var(--vq-text,#1e2330);'
      + 'transition:width .28s cubic-bezier(.2,.9,.3,1)}'
      /* 見出し */
      + '.hd{display:flex;align-items:center;justify-content:space-between;'
      + 'gap:12px;padding:22px 26px 0}'
      + '.kk{font-size:11.5px;font-weight:800;letter-spacing:.2em;'
      + 'color:var(--vq-text-secondary,#8a90a2)}'
      + '.n{font-size:12.5px;font-weight:700;color:var(--vq-text-secondary,#8a90a2)}'
      + '.q{padding:10px 26px 0;font-size:22px;font-weight:800;line-height:1.42}'
      + '.gl{padding:8px 26px 0;font-size:13.5px;color:var(--vq-text-secondary,#8a90a2)}'
      + '.mx{padding:8px 26px 0;font-size:12.5px;color:var(--vq-text-secondary,#8a90a2)}'
      /* 選ぶところ */
      + '.ls{margin-top:16px;border-top:1px solid var(--vq-border-subtle,#eef0f6)}'
      + 'button.o{display:flex;width:100%;align-items:center;gap:14px;text-align:left;'
      + 'padding:15px 26px;background:transparent;border:0;'
      + 'border-bottom:1px solid var(--vq-border-subtle,#eef0f6);'
      + 'cursor:pointer;color:inherit;font:inherit}'
      + 'button.o:hover,button.o:focus-visible{background:var(--vq-surface-hover,#f6f7fb);outline:none}'
      + 'button.o:focus-visible{box-shadow:inset 3px 0 0 var(--vq-accent,#2b70ef)}'
      /* 丸い チェック */
      + '.ck{flex:0 0 auto;width:24px;height:24px;border-radius:50%;'
      + 'border:2px solid var(--vq-border,#cfd4e2);display:grid;place-items:center;'
      + 'transition:background .12s ease,border-color .12s ease}'
      + '.ck svg{width:13px;height:13px;opacity:0;transition:opacity .12s ease}'
      + 'button.o[aria-pressed="true"] .ck{background:var(--vq-accent,#2b70ef);'
      + 'border-color:var(--vq-accent,#2b70ef)}'
      + 'button.o[aria-pressed="true"] .ck svg{opacity:1}'
      + '.t{flex:1;min-width:0}'
      + '.t b{display:block;font-size:15.5px;font-weight:700}'
      + '.t s{display:block;font-size:13px;color:var(--vq-text-secondary,#8a90a2);'
      + 'text-decoration:none;margin-top:2px;line-height:1.5}'
      + '.k{flex:0 0 auto;font-size:11.5px;font-weight:700;'
      + 'color:var(--vq-text-secondary,#b3b8c6)}'
      /* 自分の言葉 */
      + '.fw{padding:16px 26px 0}'
      + 'input.f{width:100%;padding:12px 14px;font:inherit;font-size:15px;'
      + 'border:1px solid var(--vq-border,#dde1ec);border-radius:12px;'
      + 'background:var(--vq-bg,#fff);color:inherit}'
      + 'input.f:focus{outline:none;border-color:var(--vq-accent,#2b70ef);'
      + 'box-shadow:0 0 0 3px rgba(43,112,239,.16)}'
      /* 下の 帯 */
      + '.ft{display:flex;align-items:center;gap:10px;padding:16px 26px 22px}'
      + '.sp{flex:1}'
      + 'button.s{padding:10px 4px;font:inherit;font-size:14px;font-weight:600;'
      + 'cursor:pointer;border:0;background:transparent;'
      + 'color:var(--vq-text-secondary,#8a90a2);text-decoration:underline;'
      + 'text-underline-offset:3px}'
      + 'button.s:hover{color:var(--vq-text,#1e2330)}'
      /* 黒い 丸ボタン */
      + 'button.go{padding:13px 32px;border-radius:999px;border:0;cursor:pointer;'
      + 'font:inherit;font-size:15px;font-weight:800;'
      + 'background:var(--vq-text,#12151f);color:var(--vq-surface,#fff);'
      + 'transition:opacity .12s ease,transform .1s ease}'
      + 'button.go:hover{opacity:.86}'
      + 'button.go:active{transform:scale(.97)}'
      + 'button.go[disabled]{opacity:.3;cursor:default;transform:none}'
      + '@media (max-width:520px){'
      + '.q{font-size:19px}.hd{padding-top:18px}'
      + '.hd,.q,.gl,.mx,.fw,.ft{padding-left:18px;padding-right:18px}'
      + 'button.o{padding-left:18px;padding-right:18px}}'
      + '</style><div class="w" data-role="w"></div>';

    var w = sr.querySelector('[data-role="w"]');
    var esc2 = function (s) {
      return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    };
    var 丸印 = '<span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" '
      + 'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M4 12.6 9.2 18 20 6.6"/></svg></span>';

    /* いま選んでいる中身（文字）。選択肢＋自由に書いた分。 */
    function いまの答え() {
      var q = 質問[状態.番] || {};
      var 選 = q.選 || [];
      var out = (状態.選び || []).map(function (i) { return (選[i] || {}).名 || ""; })
        .filter(Boolean);
      var f = sr.querySelector('[data-role="free"]');
      var v = f ? String(f.value || "").trim() : "";
      if (v) out.push(v);
      return out.join(" / ");
    }
    function 送信を塗る() {
      var b = sr.querySelector('[data-role="ok"]');
      if (b) b.disabled = !いまの答え();
    }

    function 描く() {
      var q = 質問[状態.番];
      var 選 = q.選 || [];
      var 複 = !!q.複数;
      状態.選び = [];
      var 進 = Math.round((状態.番 / 質問.length) * 100);
      var h = '<div class="pg"><i style="width:' + 進 + '%"></i></div>'
        + '<div class="hd"><span class="kk">質問</span>'
        + '<span class="n">' + (状態.番 + 1) + " / " + 質問.length + "</span></div>"
        + '<div class="q">' + esc2(q.問) + "</div>";
      if (状態.番 === 0 && 目的) h += '<div class="gl">' + esc2(目的) + "</div>";
      if (選.length) {
        h += '<div class="mx">'
          + (複 ? "あてはまるものを いくつでも 選べます。"
                : "1 つ 選んで 送信。もう一度 押すと すぐ 送ります。")
          + "</div>";
        h += '<div class="ls">';
        選.forEach(function (o, i) {
          h += '<button type="button" class="o" aria-pressed="false" data-i="' + i + '">'
            + 丸印 + '<span class="t"><b>' + esc2(o.名) + "</b>"
            + (o.説 ? "<s>" + esc2(o.説) + "</s>" : "")
            + '</span><span class="k">' + (i + 1) + "</span></button>";
        });
        h += "</div>";
      }
      h += '<div class="fw"><input class="f" type="text" data-role="free" '
        + 'placeholder="' + (選.length ? "ほかに あれば 書く…" : "自分の 言葉で 書く…") + '" '
        + 'aria-label="自分の言葉で答える" /></div>'
        + '<div class="ft"><button type="button" class="s" data-role="auto">おまかせでいい</button>'
        + '<span class="sp"></span>'
        + '<button type="button" class="go" data-role="ok" disabled>送信</button></div>';
      w.innerHTML = h;
      var f = sr.querySelector('[data-role="free"]');
      if (f) f.addEventListener("input", 送信を塗る);
      /* ★ 選択肢が無い問だけ 自動で欄へ移す。
         選択肢があるのに欄へ移すと、番号キーが打てない（1 が欄に入る）。 */
      if (!選.length && f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 60);
      送信を塗る();
    }

    /* 選ぶ／外す。単一の問では ほかを 外す。
       すでに 選んでいる ものを もう一度 押したら **そのまま 送る**。 */
    function 選ぶ(i) {
      var q = 質問[状態.番] || {};
      var 複 = !!q.複数;
      var 今 = 状態.選び.indexOf(i);
      if (!複) {
        if (今 >= 0) return 送る();              /* 2 度目＝決定 */
        状態.選び = [i];
      } else if (今 >= 0) 状態.選び.splice(今, 1);
      else 状態.選び.push(i);
      Array.prototype.forEach.call(sr.querySelectorAll("button.o"), function (b) {
        var n = Number(b.getAttribute("data-i"));
        b.setAttribute("aria-pressed", 状態.選び.indexOf(n) >= 0 ? "true" : "false");
      });
      送信を塗る();
    }
    function 送る() {
      var v = いまの答え();
      次へ(v || "おまかせ（この人は決めなかった）");
    }

    function 次へ(答) {
      状態.答.push(String(答 === undefined || 答 === null ? "" : 答));
      状態.番++;
      if (状態.番 >= 質問.length) return 終わる();
      描く();
    }
    function 終わる() {
      if (状態.済) return;
      状態.済 = true;
      var 出 = 質問.map(function (q, i) {
        return { 問い: q.問, 答え: 状態.答[i] || "（おまかせ）" };
      });
      問い窓を閉じる();
      if (状態.解決) 状態.解決(出);
    }

    sr.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      var i = b.getAttribute("data-i");
      if (i !== null) { 選ぶ(Number(i)); return; }
      var role = b.getAttribute("data-role");
      if (role === "auto") { 次へ("おまかせ（この人は決めなかった）"); return; }
      if (role === "ok") 送る();
    });
    sr.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var f = sr.querySelector('[data-role="free"]');
      if (f && sr.activeElement === f) { e.preventDefault(); 送る(); }
    });
    /* 1〜9 のキーで選ぶ。文字を打っている最中は 効かせない。 */
    var key = function (e) {
      if (!問い窓) return;
      var f = sr.querySelector('[data-role="free"]');
      var 打っている = f && sr.activeElement === f;
      if (e.key === "Escape") { e.preventDefault(); 次へ("おまかせ（この人は決めなかった）"); return; }
      if (打っている) return;
      if (e.key === "Enter") { e.preventDefault(); 送る(); return; }
      var n = Number(e.key);
      if (n >= 1 && n <= 9) {
        var q = 質問[状態.番];
        if (q.選 && q.選[n - 1]) { e.preventDefault(); 選ぶ(n - 1); }
      }
    };
    doc.addEventListener("keydown", key, true);

    /* ★ 前へ 出し直す 見張り（2026-08-29）。
       この窓を 出したあとに 別の 覆いが 開くと、同じ z でも
       **あとから 置かれた 方が 上**に なる。だから いちばん後ろの
       子でなくなったら 置き直す。ついでに z も 当て直す。 */
    var 見張り = setInterval(function () {
      try {
        if (!問い窓 || !el.parentNode) return;
        if (doc.body.lastElementChild !== el) doc.body.appendChild(el);
        if (el.style.zIndex !== "2147483644") el.style.zIndex = "2147483644";
      } catch (e) {}
    }, 600);

    問い窓 = { el: el, sr: sr, 状態: 状態, key: key, 見張り: 見張り };
    描く();

    return new Promise(function (done) {
      状態.解決 = done;
      /* 待ちっぱなしにしない。3 分で切り上げる。 */
      問い窓.切上 = setTimeout(function () {
        if (状態.済) return;
        状態.済 = true;
        var 途中 = 質問.map(function (q, i) {
          return { 問い: q.問, 答え: 状態.答[i] || null };
        });
        問い窓を閉じる();
        done({ 途中まで: 途中 });
      }, 180000);
    });
  }

  function askPlan(a) {
    a = a || {};
    var 目的 = Q文(a.goal).trim();
    var qs = 質問をそろえる(a.questions);
    if (!目的) return { だめ: "何をするか（goal）を 1 文で入れてください。" };
    if (qs.length < 3 || qs.length > 5) {
      return { だめ: "質問は **3〜5 個** にしてください（いま " + qs.length + " 個）。",
               つぎ: "答えで中身が変わるものだけを聞きます。例:"
                 + "「何について作りますか」「何問くらい」「どれくらいの難しさ」"
                 + "「形式の好みはありますか」「いつ使いますか」。" };
    }
    st.計画 = { 目的: 目的, 質問: qs.map(function (q) { return q.問; }), at: Date.now() };

    /* ★ **窓で聞く**（2026-08-17）。声だけの往復をやめる。
       答えが返るまで この道具は返らない＝返りが そのまま答えになる。 */
    return 問い窓を出す(目的, qs).then(function (r) {
      if (r && r.途中まで) {
        var 出た = r.途中まで.filter(function (x) { return x.答え; });
        st.計画 = null;
        return { だめ: "**まだ答えをもらえていません**（窓を出したまま 3 分たちました）。",
                 もらえた分: 出た,
                 つぎ: "『答えてね』と せかさないでください。"
                   + "『あとでいい？』のように 一言かけて、待つか、"
                   + "『おまかせで進めていい？』と 聞いてください。"
                   + "**勝手に作り始めないこと。**" };
      }
      var 答 = r.map(function (x) { return x.答え; });
      st.計画答 = 答;
      var おまかせ = r.filter(function (x) { return /おまかせ/.test(x.答え); }).length;
      return { 聞けた: 目的,
               答え: r,
               つぎ: "**答えが そろいました。**"
                 + (おまかせ ? "（" + おまかせ + " つは おまかせなので、"
                   + "あなたが いちばん良いと思うもので決めてください）" : "")
                 + "この答えをふまえて steps（やる順）を組み立て、"
                 + "**すぐに startPlan を呼んでください。**"
                 + "answers には ここに出ている 答え を そのままの順で入れます。"
                 + "★ 同じことを 声で もう一度 聞き返さないでください。**もう聞いてあります。**" };
    }, function () {
      st.計画 = null;
      return { だめ: "窓を出せませんでした。", つぎ: "声で 1 つずつ聞いてください。" };
    });
  }
  function startPlan(a) {
    a = a || {};
    var pl = st.計画;
    if (!pl) {
      return { だめ: "先に askPlan で 目的と質問を出してください。",
               つぎ: "いきなり始めないでください。" };
    }
    /* ★ 窓でもらった答えがあれば それを既定にする（2026-08-17）。
       Lumi が answers を写し忘れても、**もらった答えは失わない**。 */
    var ans = Q配(a.answers).map(function (x) { return Q文(x).trim(); });
    if (Array.isArray(st.計画答) && st.計画答.length) {
      pl.質問.forEach(function (q, i) { if (!ans[i]) ans[i] = Q文(st.計画答[i]).trim(); });
    }
    var 足りない = [];
    pl.質問.forEach(function (q, i) { if (!ans[i]) 足りない.push((i + 1) + ". " + q); });
    if (足りない.length) {
      return { だめ: "まだ答えをもらっていない質問があります。",
               のこり: 足りない,
               つぎ: "**これを聞いてから** もう一度 startPlan を呼んでください。"
                 + "「おまかせ」と言われたなら、その旨を answers に書いてください。" };
    }
    var steps = Q配(a.steps).map(function (x) { return Q文(x).trim(); }).filter(Boolean);
    if (!steps.length) {
      return { だめ: "やる順（steps）を入れてください。",
               つぎ: "聞いた答えをふまえて、1 件ずつに分けた段取りを入れます。" };
    }
    var 出 = startTask({ goal: pl.目的, steps: steps }) || {};
    if (出.だめ) return 出;
    出.計画 = { 目的: pl.目的,
                 聞いたこと: pl.質問.map(function (q, i) { return q + " → " + ans[i]; }) };
    出.つぎ = "**ここから最後まで 一気に通してください。**"
      + "もう確かめなくてよいです（戻せないことだけ別）。"
      + "1 件終わるごとに stepDone、ぜんぶ終わったら finishTask です。";
    st.計画 = null; st.計画答 = null;
    return 出;
  }

  /* ══ 設定を **全部** 触れるようにする（2026-08-16）════════════════
     ★ これまで setSetting は 10 項目だけの表を自前で持っていた。
       アプリの設定は 50 項目以上あり、残りは声から一切触れなかった。
     ★ 定義表（__vqSet.specs）をそのまま使う。増えても勝手に追いつく。
     ★ **自分で自分を切る設定**（呼びかけ voice.wake）は断る。 */
  var 触らせない = { "voice.wake": "これを切ると「Hey Lumi」で呼べなくなります。画面から変えてください。" };

  /* ★ 「言いかぶせやすさ」は アプリの設定表には無い（会話の中だけの値）。
     だが 端末や部屋で当たりが変わるので、**声から動かせる**ようにする。
     段は 3 つだけにする。生の数値は言われても受けるが、覚えなくてよい。 */
  var 感度の段 = { "敏感": 0.016, "ふつう": 0.026, "鈍い": 0.05 };
  function 感度の段の名(v) {
    if (v <= 0.02) return "敏感";
    if (v <= 0.035) return "ふつう";
    return "鈍い";
  }
  var 感度の項 = function () {
    return { 名前: "声で割り込む感度", id: "live.sens",
             いま: 感度の段の名(マイクの感度()) + "（" + マイクの感度().toFixed(3) + "）",
             選べる: "敏感（小さな声でも止まる） / ふつう / 鈍い（はっきり言ったときだけ）",
             種類: "select" };
  };

  function listSettings(a) {
    var S2 = root.__vqSet;
    if (!S2 || !S2.specs) return { だめ: "設定を読めません。" };
    var want = String((a && a.want) || "").trim();
    var out = [];
    try {
      S2.specs().forEach(function (sp) {
        if (!sp || !sp.id) return;
        var 名 = String(sp.label || sp.id);
        if (want && 名.indexOf(want) < 0 && String(sp.id).indexOf(want) < 0) return;
        var いま = "";
        try { いま = String(S2.get(sp.id)); } catch (e) {}
        /* ★ 選べる値は **opts**（[[値, 表示名]] の並び）。実測で確かめた。 */
        var 選べる = "";
        if (sp.type === "toggle") 選べる = "入 / 切";
        else if (Array.isArray(sp.opts) && sp.opts.length) {
          選べる = sp.opts.map(function (o) {
            return Array.isArray(o) ? (o[0] + "（" + o[1] + "）") : String(o);
          }).slice(0, 12).join(" / ");
        } else if (sp.type === "number") 選べる = "数字";
        if (out.length < 60) {
          out.push({ 名前: 名, id: sp.id, いま: いま,
                     選べる: 選べる || "自由", 種類: sp.type || "" });
        }
      });
    } catch (e) {}
    /* 会話の中だけの値（アプリの設定表には無い）も 同じ並びに混ぜる */
    if (!want || /感度|割り込|わりこみ|マイク|声/.test(want)) out.unshift(感度の項());
    if (!out.length) return { だめ: want ? "「" + want + "」に当たる設定はありません。" : "設定が読めません。" };
    return { 設定: out, 件数: out.length,
             つぎ: "変えるときは changeSetting に id と 値を渡します。"
               + "利用者が言った言葉と 名前が近いものを選んでください。" };
  }

  function changeSetting(a) {
    var S2 = root.__vqSet;
    if (!S2 || !S2.set) return { だめ: "設定を変えられません。" };
    var id = String((a && a.id) || "").trim();
    var 値 = (a && a.value);
    if (!id) return { だめ: "どの設定か id で教えてください（listSettings で調べられます）。" };
    if (触らせない[id]) return { だめ: 触らせない[id], つぎ: "変えたと言わないでください。" };
    /* ★ 「声で割り込む感度」だけは アプリの設定表の外にある */
    if (id === "live.sens" || /割り込|わりこみ.*感度|マイク.*感度|感度/.test(id)) {
      var 前s = マイクの感度(), v1 = String(値).trim();
      var 新 = 感度の段[v1];
      if (新 === undefined && /敏感|高く|上げ|よく反応|小さ(い|な)声/.test(v1)) 新 = 感度の段["敏感"];
      if (新 === undefined && /鈍|低く|下げ|反応しにく/.test(v1)) 新 = 感度の段["鈍い"];
      if (新 === undefined && isFinite(Number(v1)) && Number(v1) > 0) 新 = Number(v1);
      if (新 === undefined) {
        return { だめ: "「" + v1 + "」は選べません。",
                 選べる: ["敏感", "ふつう", "鈍い"],
                 つぎ: "変えたと言わないでください。" };
      }
      感度を決める(新);
      return { 変えた: "声で割り込む感度",
               前: 感度の段の名(前s), いま: 感度の段の名(マイクの感度()),
               つぎ: "これで、返事の途中でも " + 感度の段の名(マイクの感度())
                 + "に反応します。一言で伝えてください。" };
    }
    var sp = null;
    try { sp = S2.spec(id); } catch (e) {}
    if (!sp) {
      /* 名前で探す（利用者は id を知らない） */
      try {
        S2.specs().forEach(function (x) {
          if (!sp && String(x.label || "").indexOf(id) >= 0) { sp = x; id = x.id; }
        });
      } catch (e) {}
    }
    if (!sp) return { だめ: "「" + id + "」という設定はありません。",
                      つぎ: "listSettings で名前を確かめてください。" };
    if (触らせない[id]) return { だめ: 触らせない[id] };
    var 前 = "";
    try { 前 = String(S2.get(id)); } catch (e) {}
    if (sp.type === "toggle") {
      var t = String(値).toLowerCase();
      値 = (t === "true" || t === "on" || t === "入" || t === "1" || 値 === true);
    } else if (Array.isArray(sp.opts) && sp.opts.length) {
      /* 「大」のように **表示名**で言われることのほうが多い。値へ直す。 */
      var v0 = String(値);
      var 当たり = null;
      sp.opts.forEach(function (o) {
        if (当たり) return;
        if (!Array.isArray(o)) { if (String(o) === v0) 当たり = String(o); return; }
        if (String(o[0]) === v0 || String(o[1]) === v0) 当たり = String(o[0]);
      });
      if (当たり) 値 = 当たり;
    }
    try { S2.set(id, 値); } catch (e) { return { だめ: "変えられませんでした。" }; }
    var 後 = "";
    try { 後 = String(S2.get(id)); } catch (e) {}
    if (後 === 前) {
      return { だめ: "「" + (sp.label || id) + "」は " + 前 + " のまま変わりませんでした。",
               選べる: (Array.isArray(sp.opts) ? sp.opts : []).map(function (o) {
                 return Array.isArray(o) ? o[0] : String(o); }).slice(0, 12),
               つぎ: "変えたと言わないでください。選べる値を確かめてください。" };
    }
    return { 変えた: String(sp.label || id), 前: 前, いま: 後,
             つぎ: "何をどう変えたかを 一言で伝えてください。" };
  }

  /* ══════════════════════════════════════════════════════════════════
     結果を読む（2026-08-16）

     ★ 「この前のテストどうだった？」に答えられなかった。
       結果は端末の中にあるのに、Lumi は一度も読んでいなかった。
     ★ 記録の形（実測）: { id, presetId, presetName, kind, score, maxScore,
       finishedAt, items:[{questionId, correct, score, maxScore, answered}],
       questionsSnapshot:[{id, type, topic, ...}] }
     ══════════════════════════════════════════════════════════════════ */
  function 結果一覧() {
    try {
      var R = root.VQ2 && VQ2.store && VQ2.store.results;
      var rs = (R && R.list) ? (R.list() || []) : [];
      return rs.slice().sort(function (a, b) {
        return String(b.finishedAt || "").localeCompare(String(a.finishedAt || ""));
      });
    } catch (e) { return []; }
  }
  function 割合(r) {
    var c = Number(r && r.score), t = Number(r && r.maxScore);
    return (isFinite(c) && isFinite(t) && t > 0) ? Math.round(c * 100 / t) : null;
  }
  function 何日前の(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? "今日" : (d === 1 ? "きのう" : d + " 日前");
  }

  function readResult(a) {
    var rs = 結果一覧();
    if (!rs.length) return { まだ無い: "解いた記録がありません。まず 1 回やってみようと誘ってください。" };
    var want = String((a && a.name) || "").trim();
    var r = rs[0];
    if (want) {
      for (var i = 0; i < rs.length; i++) {
        if (String(rs[i].presetName || rs[i].title || "").indexOf(want) >= 0) { r = rs[i]; break; }
      }
    }
    /* 同じプリセットの 1 つ前と比べる（伸びを言えるように） */
    var 前 = null;
    rs.forEach(function (x) {
      if (前) return;
      if (x !== r && x.presetId === r.presetId
        && String(x.finishedAt || "") < String(r.finishedAt || "")) 前 = x;
    });
    var items = r.items || [];
    var 正 = items.filter(function (x) { return x.correct; }).length;
    var 未 = items.filter(function (x) { return !x.answered; }).length;
    /* 分野べつの出来 */
    var snap = {};
    (r.questionsSnapshot || []).forEach(function (q) { if (q && q.id) snap[q.id] = q; });
    var 分野 = {};
    items.forEach(function (x) {
      var q = snap[x.questionId] || {};
      var k = String(q.topic || q.unit || "").trim() || "（分野なし）";
      if (!分野[k]) 分野[k] = { 出た: 0, 正解: 0 };
      分野[k].出た++; if (x.correct) 分野[k].正解++;
    });
    var 分野の出来 = Object.keys(分野).map(function (k) {
      return { 分野: k, 出来: Math.round(分野[k].正解 * 100 / 分野[k].出た) + "%",
               問数: 分野[k].出た };
    }).sort(function (x, y) { return parseInt(x.出来) - parseInt(y.出来); }).slice(0, 8);

    var 今 = 割合(r), 昔 = 前 ? 割合(前) : null;
    return {
      なに: String(r.presetName || r.title || "（名前なし）")
        + (r.kind === "mock" ? "（試験）" : ""),
      いつ: 何日前の(r.finishedAt),
      正答率: 今 === null ? "—" : 今 + "%",
      点: (r.score || 0) + " / " + (r.maxScore || 0),
      問題数: items.length,
      正解した数: 正,
      まちがえた数: items.length - 正 - 未,
      答えなかった数: 未,
      前回から: (今 !== null && 昔 !== null)
        ? ((今 - 昔 >= 0 ? "+" : "") + (今 - 昔) + " ポイント（前回 " + 昔 + "%）") : "前回の記録なし",
      分野べつの出来: 分野の出来,
      つぎ: "数字をそのまま読み上げず、**よかった所と 弱かった所**を一言ずつ言ってください。"
        + "まちがえた問題を見たいと言われたら readWrongQuestions を使います。"
    };
  }

  /* ══ 形式に関係なく 答える（2026-08-17）════════════════════════════
     ★ 訴え「組み合わせに対応していない」「C を選んでと言っても動かない」
       「2 回言っても聞かない」。
     ★ これまでは **画面のボタンを探して押させて**いた。だから
       選ぶ形式でしか動かず、組み合わせ・並べ替え・分類・穴埋めは
       そもそも押しようが無かった（実測: 表示側は 20 形式すべて描けるのに、
       Lumi から答えられるのは 選ぶ形式だけ）。
     ★ 直しかた: **出題の仕組みへ 値をそのまま渡す**（VQ2.quizNow.答える）。
       押しかたを覚える必要が無くなり、形式が増えても付いていける。
     ★ 入れたあとは **読み返して**から返す。入っていなければ「入らなかった」。
     ★ 座標が要るもの（画像の位置・ラベル貼り）は 声では無理なので、
       できないと正直に返す。ごまかして別のことをしない。 */
  function 言葉を分ける(t) {
    return String(t || "").split(/[、,／\/]|\bと\b|\s{2,}/)
      .map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function 選択肢を当てる(q, w) {
    var cs = (q && q.choices) || [];
    var s = String(w || "").trim();
    if (!s) return null;
    var 正規 = s.replace(/[（）()。、,\s]/g, "").toLowerCase();
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      var lab = String(c.label || "").replace(/\s/g, "").toLowerCase();
      if (lab && lab === 正規) return c.id;
      if (String(c.id).toLowerCase() === 正規) return c.id;
    }
    /* 「1 番目」「ひとつ目」なども通す */
    var n = 正規.match(/^([0-9０-９]+)/);
    if (n) {
      var k = Number(String(n[1]).replace(/[０-９]/g, function (d) { return "0123456789"["０１２３４５６７８９".indexOf(d)]; }));
      if (k >= 1 && k <= cs.length) return cs[k - 1].id;
    }
    var 順 = ["a", "b", "c", "d", "e", "f"];
    if (順.indexOf(正規) >= 0 && 順.indexOf(正規) < cs.length) return cs[順.indexOf(正規)].id;
    /* 中身の言葉で当てる（いちばん長く一致するもの） */
    var 当, 長 = 0;
    cs.forEach(function (c) {
      var t = String(c.text || "").replace(/\s/g, "");
      if (!t) return;
      if (t === s.replace(/\s/g, "")) { 当 = c.id; 長 = 999; return; }
      if (長 < 999 && (t.indexOf(s) >= 0 || s.indexOf(t) >= 0) && t.length > 長) { 当 = c.id; 長 = t.length; }
    });
    return 当 || null;
  }
  function 中身で当てる(list, w, 取る) {
    var s = String(w || "").replace(/\s/g, "");
    if (!s) return null;
    var 当 = null, 長 = 0;
    (list || []).forEach(function (x) {
      var t = String(取る(x) || "").replace(/\s/g, "");
      if (!t) return;
      if (t === s) { 当 = x; 長 = 999; return; }
      if (長 < 999 && (t.indexOf(s) >= 0 || s.indexOf(t) >= 0) && t.length > 長) { 当 = x; 長 = t.length; }
    });
    return 当;
  }
  function answerQuestion(a) {
    var now = null;
    try { now = root.VQ2 && VQ2.quizNow; } catch (e) {}
    if (!now || !now.question || typeof now.答える !== "function") {
      return { だめ: "いまクイズを解いていません。",
               つぎ: "答えたと言わないでください。まずクイズを始めてください。" };
    }
    var q = now.question, 形 = String(now.答えかた || "");
    var w = String((a && a.answer) || "").trim();
    if (!w) {
      return { だめ: "何と答えるかを answer に入れてください。",
               いまの問題: String(q.prompt || "").slice(0, 160),
               形式: now.形式の名 || now.形式, 答えかた: 形 };
    }
    var 値 = null, 何を = "";

    if (形 === "choiceId") {
      値 = 選択肢を当てる(q, w);
      if (!値) return { だめ: "「" + w + "」がどの選択肢か分かりません。",
                        選べるもの: (q.choices || []).map(function (c, i) {
                          return (c.label || String.fromCharCode(65 + i)) + ": " + (c.text || ""); }),
                        つぎ: "選べるものの中から そのまま写して もう一度呼んでください。" };
      何を = "選んだ";
    } else if (形 === "choiceIds") {
      var ids = [], 迷 = [];
      言葉を分ける(w).forEach(function (x) {
        var id = 選択肢を当てる(q, x);
        if (id) { if (ids.indexOf(id) < 0) ids.push(id); } else 迷.push(x);
      });
      if (!ids.length) return { だめ: "どれも選択肢に当たりません（" + w + "）。",
                                選べるもの: (q.choices || []).map(function (c, i) {
                                  return (c.label || String.fromCharCode(65 + i)) + ": " + (c.text || ""); }) };
      値 = ids; 何を = ids.length + " つ選んだ";
      if (迷.length) 何を += "（分からなかった: " + 迷.join("・") + "）";
    } else if (形 === "text" || 形 === "correction") {
      値 = w; 何を = "書いた";
    } else if (形 === "blanks") {
      値 = 言葉を分ける(w); 何を = 値.length + " か所うめた";
    } else if (形 === "order") {
      var items = (q.orderItems || []);
      var 並 = [], 迷2 = [];
      言葉を分ける(w).forEach(function (x) {
        var it = 中身で当てる(items, x, function (y) { return y.text; });
        if (it && 並.indexOf(it.id) < 0) 並.push(it.id); else 迷2.push(x);
      });
      items.forEach(function (it) { if (並.indexOf(it.id) < 0) 並.push(it.id); });
      if (迷2.length === 言葉を分ける(w).length)
        return { だめ: "並べる順番が読み取れませんでした（" + w + "）。",
                 並べるもの: items.map(function (x) { return x.text; }),
                 つぎ: "「一、二、三」のように 中身の言葉を 順番に並べて言ってください。" };
      値 = 並; 何を = "並べた";
    } else if (形 === "pairs") {
      var L = ((q.pairs && q.pairs.left) || []);
      var R2 = ((q.pairs && q.pairs.right) || []);
      var p = {}, 迷3 = [];
      String(w).split(/[、,\n]/).forEach(function (組) {
        var m = String(組).split(/[はーー\-=＝:：]|→|は\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (m.length < 2) { if (組.trim()) 迷3.push(組.trim()); return; }
        var l = 中身で当てる(L, m[0], function (y) { return y.text || y.left; });
        var r = 中身で当てる(R2, m.slice(1).join(""), function (y) { return y.text || y.right; });
        if (l && r) p[l.id] = r.id; else 迷3.push(組.trim());
      });
      if (!Object.keys(p).length)
        return { だめ: "つなぎ方が読み取れませんでした（" + w + "）。",
                 左: L.map(function (x) { return x.text || x.left; }),
                 右: R2.map(function (x) { return x.text || x.right; }),
                 つぎ: "「明治維新は明治、関東大震災は大正」のように 左と右を 1 組ずつ言ってください。" };
      値 = p; 何を = Object.keys(p).length + " 組つないだ";
      if (迷3.length) 何を += "（読めなかった: " + 迷3.join("・") + "）";
    } else if (形 === "groups") {
      var G = ((q.classification && q.classification.groups) || []);
      var IT = ((q.classification && q.classification.items) || []);
      var g2 = {}, 迷4 = [];
      String(w).split(/[、,\n]/).forEach(function (組) {
        var m = String(組).split(/[はーー\-=＝:：]|→/).map(function (x) { return x.trim(); }).filter(Boolean);
        if (m.length < 2) { if (組.trim()) 迷4.push(組.trim()); return; }
        var it = 中身で当てる(IT, m[0], function (y) { return y.text; });
        var gr = 中身で当てる(G, m.slice(1).join(""), function (y) { return y.label; });
        if (it && gr) g2[it.id] = gr.id; else 迷4.push(組.trim());
      });
      if (!Object.keys(g2).length)
        return { だめ: "分けかたが読み取れませんでした（" + w + "）。",
                 わけるもの: IT.map(function (x) { return x.text; }),
                 いれさき: G.map(function (x) { return x.label; }),
                 つぎ: "「犬は動物、桜は植物」のように 1 つずつ言ってください。" };
      値 = g2; 何を = Object.keys(g2).length + " 個わけた";
    } else if (形 === "selfMark") {
      値 = /できた|正解|合って|わかった|覚えて/.test(w) ? "correct" : "wrong";
      何を = (値 === "correct" ? "できた" : "できなかった") + "として印を付けた";
    } else if (形 === "points" || 形 === "labels" || 形 === "cells" || 形 === "children") {
      return { だめ: "この形式（" + (now.形式の名 || 形) + "）は **声からは答えられません**。"
                 + "画像の位置や 表のますは、指で触って答えてください。",
               つぎ: "答えたと言わないでください。"
                 + "問題の中身を読み上げたり、考え方を説明するのは できます。" };
    } else {
      値 = w; 何を = "答えた";
    }

    var 出 = now.答える(値);
    if (出 && 出.だめ) return { だめ: "答えを入れられませんでした（" + 出.だめ + "）。" };
    /* ★ 読み返して 本当に入ったかを見る */
    var 入った = 出 ? 出.入れた : null;
    var 空 = (入った === null || 入った === undefined || 入った === ""
      || (Array.isArray(入った) && !入った.length)
      || (入った && typeof 入った === "object" && !Array.isArray(入った) && !Object.keys(入った).length));
    if (空) {
      return { だめ: "答えが入りませんでした（画面に反映されていません）。",
               つぎ: "答えたと言わないでください。もう一度 別の言い方で試してください。" };
    }
    var 後 = null;
    try { 後 = root.VQ2 && VQ2.quizNow; } catch (e) {}
    /* ★ **入れたら その場で採点も返す**（2026-08-17・利用者の指示）。
       「記入する → 採点する → ここはこうだね → 次へ」を 1 本の流れにする。
       画面から読み取らせると 正解が出ていないことがあるので、
       アプリが持っている採点そのものを渡す。 */
    var 採点 = null;
    try {
      var もと = (出 && 出.次へ送った) ? null : 後;
      if (もと && typeof もと.採点を見る === "function") 採点 = もと.採点を見る();
      /* 次へ送られたあとは いまの問題が変わっているので、採点は取らない */
    } catch (e2) {}
    return {
      やった: 何を + "（" + (now.形式の名 || now.形式) + "）",
      入れた中身: 入った,
      次へ送った: !!(出 && 出.次へ送った),
      いまの問題: 後 ? (後.index + " / " + 後.total) : "",
      出した採点: 採点 || undefined,
      間違えた: !!(出 && 出.間違えた) || undefined,
      つぎ: (出 && 出.間違えた)
        /* ★ まちがえたときは **進まない**（2026-08-19・訴え）。
           言い方は 決めない。分かるまで 付き合う、とだけ 伝える。 */
        ? "**まちがえました。ここに 留まってください（quizMove を 呼ばない）。**"
          + "「出した採点」に 正解と 解説が あります。"
          + "教材の 解説を そのまま 読まず、**その人に 向けて 言い直して**ください。"
          + "なぜ そちらを 選びたく なったのかに まず 触れ、伝わらなければ 言い方を 変えて もう一度。"
          + "決まった型（まず／次に／まとめると）で 話さないこと。"
          + "分かったと 言われてから、次へ 進むか 相談します。"
        : (出 && 出.次へ送った)
        ? "**もう次の問題に進んでいます。**重ねて次へ送らないでください（2 問飛びます）。"
        : ((採点 ? "「出した採点」を見て、**合っていたか・なぜそうなるかを 一言**伝えてください。その上で " : "")
           + "次へ進むなら quizMove を使ってください。**採点を伝えただけで 止まらないこと。**")
    };
  }

  /* クイズの中を 行き来する（進む・戻る・番号へ飛ぶ・採点する） */
  function quizMove(a) {
    var now = null;
    try { now = root.VQ2 && VQ2.quizNow; } catch (e) {}
    if (!now || typeof now.つぎへ !== "function") {
      return { だめ: "いまクイズを解いていません。" };
    }
    var 前 = now.index + " / " + now.total;
    var w = String((a && a.where) || "next");
    /* ★ **答えないまま 次へ行かない／終わらせない**（2026-08-17）。
       訴え「最後の問題で『これ回答して次の問題いこ』と言ったのに、
       答えずに 終わろうとした」。
       いまの問題が空のまま next / grade を呼ぶのは、たいてい取りこぼし。
       わざと飛ばすときだけ skip を true にする。 */
    var 空 = (function () {
      /* ★ **写しではなく いまの値を読む**（2026-08-17）。
         now.answered は描き直した時点の写しで、文字を入れる形式では
         ずっと空のままだった（＝入れた直後に「まだ答えていません」）。 */
      var v = (typeof now.いまの答え === "function") ? now.いまの答え() : now.answered;
      if (v === null || v === undefined || v === "") return true;
      if (Array.isArray(v)) return v.filter(function (x) {
        return x !== null && x !== undefined && String(x).trim() !== "";
      }).length === 0;
      if (typeof v === "object") return Object.keys(v).length === 0;
      return false;
    })();
    var 最後 = (Number(now.index) >= Number(now.total));
    if ((w === "next" || w === "grade") && 空 && !(a && a.skip === true)) {
      return { だめ: "いまの問題（" + 前 + "・" + (now.形式の名 || "") + "）は **まだ答えていません。**",
               いまの問題: String((now.question && now.question.prompt) || "").slice(0, 120),
               答えかた: now.答えかた || "",
               つぎ: "**先に answerQuestion で答えてください。**"
                 + (最後 ? "これが最後の問題です。答えてから next を呼ぶと、採点の確認が出ます。" : "")
                 + "わざと飛ばすときだけ skip を true にして もう一度呼びます。"
                 + "**進んだ・終わったとは 言わないでください。**" };
    }
    var いま見る = function () { try { return root.VQ2 && VQ2.quizNow; } catch (e) { return null; } };
    var 位置 = function (q2) { return q2 ? (q2.index + " / " + q2.total) : "（終わった）"; };

    /* ★ 出来上がりを 1 か所で作る（どの道から来ても 同じ言い方にする） */
    var 仕上げ = function (今, 窓, 採点, 回数) {
      if (窓) {
        var n3 = lookScreen("");
        return { やった: (最後 && w === "next")
                   ? "最後の問題だったので、**採点していいかの確認**が出ました"
                   : "**確認の窓**が出ました",
                 確認の窓: 窓の題(窓),
                 出した採点: 採点 || undefined,
                 いま押せるもの: (n3.操作できるもの || []).slice(0, 8),
                 つぎ: "**まだ採点していません。**利用者に どうするかを聞いて、"
                   + "決まってから 窓の中のボタンを tapItem で押してください。"
                   + "窓だけ閉じたいときは closeScreen です（クイズは閉じません）。" };
      }
      if (w !== "grade" && 今 === 前) {
        return { だめ: "動きませんでした（" + 前 + " のまま）。押した回数: " + (回数 || 1),
                 出した採点: 採点 || undefined,
                 つぎ: "進んだと言わないでください。"
                   + "答えていないと進めないことがあります。先に answerQuestion で答えてください。" };
      }
      var 後2 = いま見る();
      return { やった: (w === "grade" ? "採点した"
                        : ((採点 ? "採点を出してから " : "") + 前 + " → " + 今)),
               出した採点: 採点 || undefined,
               いまの問題: 後2 ? String((後2.question && 後2.question.prompt) || "").slice(0, 120) : "",
               形式: 後2 ? (後2.形式の名 || 後2.形式) : "" };
    };

    /* ★★ **効くまで押す**（2026-08-17・利用者の指示）════════════════════
       ★ この作りでは「次へ」を 1 回押すと、まず **採点（解説）が出るだけ**で
         問題は変わらない。そこで止まると
         「採点は出たのに 次の問題へ行かない」になる（訴えのとおり）。
       ★ 番号が変わるまで、または 確認の窓が出るまで、**繰り返し押す**。
         押した採点の中身は 拾っておいて、Lumi が「ここはこうだね」と
         言えるように返す。 */
    if (w === "next") {
      var 採点 = null;
      var 押す = function (のこり) {
        var q3 = いま見る();
        if (!q3) return settle(300).then(function () { return 仕上げ("（終わった）", いまの窓(), 採点, 4 - のこり); });
        /* 押す前に、いま採点が出ているなら その中身を拾う */
        try {
          if (!採点 && typeof q3.採点を見る === "function"
            && typeof q3.解説が出ている === "function" && q3.解説が出ている()) 採点 = q3.採点を見る();
        } catch (e) {}
        try { q3.つぎへ(); } catch (e2) {}
        return settle(700).then(function () {
          var q4 = いま見る();
          var 今 = 位置(q4);
          var 窓 = いまの窓();
          try {
            if (!採点 && q4 && typeof q4.採点を見る === "function"
              && typeof q4.解説が出ている === "function" && q4.解説が出ている()) 採点 = q4.採点を見る();
          } catch (e3) {}
          if (窓 || 今 !== 前 || のこり <= 1) return 仕上げ(今, 窓, 採点, 4 - のこり + 1);
          return 押す(のこり - 1);
        });
      };
      return 押す(4);
    }

    var 効 = false;
    if (w === "prev") 効 = now.まえへ();
    else if (w === "grade") 効 = now.採点する();
    else if (/^\d+$/.test(w)) 効 = now.いくつ目へ(Number(w));
    else return { だめ: "next / prev / grade / 問題の番号 のどれかを渡してください。" };
    return settle(900).then(function () {
      return 仕上げ(位置(いま見る()), いまの窓(), null, 1);
    });
  }

  /* ══ いまのことを調べる（2026-08-16）════════════════════════════════
     ★ 訴え「情報が 2023 年くらいで止まっている」。そのとおりで、
       Lumi には **調べる口が 1 つも無かった**。
     ★ Google の grounding は無料の枠では使えない（付けると接続そのものが
       1011 で弾かれるのを実測済み。setup の注記を参照）。
       だから **アプリの検索**（SearXNG → DuckDuckGo）へ回す。 */
  function searchWeb(a) {
    var q = String((a && a.query) || "").replace(/\s+/g, " ").trim();
    if (!q) return { だめ: "何を調べるかを 言葉で渡してください。" };
    /* ══ ★ 調べすぎない（2026-08-16）════════════════════════════════
       ★ 訴え「聞くたびに ずっと調べてくる。適度でいいのよ」。
         道具を足した直後は こうなりやすい。**同じことを二度調べない**。
       ★ 10 分のうちに 同じ言葉で調べていたら、そのときのものを返す。
         毎回サーバへ行くと 3〜6 秒 待たされるので、会話の間が悪くなる。 */
    st.調べ = st.調べ || {};
    var 鍵 = q.replace(/\s+/g, "").toLowerCase();
    var 前 = st.調べ[鍵];
    if (前 && Date.now() - 前.at < 600000) {
      var 写し = JSON.parse(JSON.stringify(前.r));
      写し.つぎ = "**さっき調べたものと同じです。**もう一度は調べません。"
        + "この中身で答えてください。";
      return 写し;
    }
    return fetch(api() + "/api/lumi/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
      body: JSON.stringify({ query: q.slice(0, 200) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return { だめ: "調べられませんでした。", つぎ: "調べたと言わないでください。" };
      if (!j.results || !j.results.length) {
        /* ★ 出てこなかったことも 覚える。覚えないと 同じ言葉で
           何度も調べに行き、そのたび数秒 待たせることになる。 */
        var 空 = { 見つからない: "「" + q + "」では 何も出てきませんでした。",
                   つぎ: "言い方を変えて もう一度だけ試すか、"
                     + "**見つけられなかったと正直に**伝えてください。作り話をしないこと。" };
        st.調べ[鍵] = { at: Date.now(), r: JSON.parse(JSON.stringify(空)) };
        return 空;
      }
      var 出 = { 調べた: q, 見つけたもの: j.results,
                 つぎ: "**ここに書いてあることだけ**を使って答えてください。"
                   + "書いていないことを足さないこと。"
                   + "話すときは 1〜2 件にしぼり、出どころ（サイト名）を一言そえます。"
                   + "日付が新しいものを優先してください。"
                   + "★ この話題では **もう調べなくてよい**です。続けて聞かれても、"
                   + "この中身で答えてください。" };
      st.調べ[鍵] = { at: Date.now(), r: JSON.parse(JSON.stringify(出)) };
      return 出;
    }).catch(function () {
      return { だめ: "調べられませんでした（つながりません）。",
               つぎ: "調べたと言わないでください。" };
    });
  }

  /* ══ いまの日時（2026-08-16）════════════════════════════════════════
     ★ 訴え「時刻を聞くと世界協定時間（UTC）で答える」。
       原因は はっきりしていて、**日時を 1 度も渡していなかった**こと。
       渡していなければ、向こうは自分の中の時計＝UTC で答えるほかない。
     ★ 端末の時計を **日本時間として** 読んで返す。会話の途中で日が変わっても
       呼ぶたびに新しくなるので、こちらのほうが確かめ書きより正確。 */
  function readClock() {
    var d = new Date();
    var f = function (opt) {
      opt.timeZone = "Asia/Tokyo";
      try { return new Intl.DateTimeFormat("ja-JP", opt).format(d); } catch (e) { return ""; }
    };
    var 時 = f({ hour: "2-digit", minute: "2-digit" });
    var 日 = f({ year: "numeric", month: "long", day: "numeric", weekday: "long" });
    return {
      いま: 日 + " " + 時,
      日付: 日, 時刻: 時,
      どこの時間: "日本時間（JST・UTC より 9 時間あと）",
      つぎ: "**これをそのまま使ってください。**自分で計算し直したり、"
        + "世界協定時（UTC）に直したりしないこと。"
        + "「何時？」には時刻だけ、「今日は？」には日付だけを短く答えます。"
    };
  }

  function readWrongQuestions(a) {
    var rs = 結果一覧();
    if (!rs.length) return { まだ無い: "解いた記録がありません。" };
    var want = String((a && a.name) || "").trim();
    var r = rs[0];
    if (want) {
      for (var i = 0; i < rs.length; i++) {
        if (String(rs[i].presetName || rs[i].title || "").indexOf(want) >= 0) { r = rs[i]; break; }
      }
    }
    var snap = {};
    (r.questionsSnapshot || []).forEach(function (q) { if (q && q.id) snap[q.id] = q; });
    /* 問題文はプリセット側にしか無いことがある。突き合わせる。 */
    var pq = {};
    try {
      var p = VQ2.store.getPreset(r.presetId, {});
      ((p && p.questions) || []).forEach(function (q) { if (q && q.id) pq[q.id] = q; });
    } catch (e) {}
    var 何問 = Math.max(1, Math.min(10, Number(a && a.count) || 5));
    var 出 = [];
    (r.items || []).forEach(function (x) {
      if (x.correct || 出.length >= 何問) return;
      var q = pq[x.questionId] || snap[x.questionId] || {};
      var 正 = (q.choices || []).filter(function (c) { return c.isCorrect; })
        .map(function (c) { return c.text || c.label; })[0] || q.correctAnswer || "";
      出.push({
        問題: String(q.prompt || "（問題文が残っていません）").slice(0, 200),
        こたえ: String(正).slice(0, 120),
        解説: String(q.explanation || "").slice(0, 400),
        分野: String(q.topic || snap[x.questionId] && snap[x.questionId].topic || ""),
        答えなかった: !x.answered
      });
    });
    if (!出.length) return { なに: r.presetName || "", 全部あっていた: true,
                             つぎ: "全部あっていたと伝えて、ほめてください。" };
    return { なに: String(r.presetName || r.title || ""), いつ: 何日前の(r.finishedAt),
             まちがえた問題: 出,
             ほかにもある: ((r.items || []).filter(function (x) { return !x.correct; }).length > 出.length),
             つぎ: "**1 問ずつ**、なぜそうなるかを あなたの言葉で説明してください。"
               + "解説がある問はそれを土台にします。一度に全部読み上げないこと。" };
  }

  /* ══ 書類を 名前で開く（2026-08-16）════════════════════════════════
     ★ これまで Lumi は 作る・並べる・捨てる しかできず、
       **すでにある書類を開く口が 1 つも無かった**。
       だから「あの資料ひらいて」も「あれ直して」も通らなかった。 */
  function openFile(a) {
    var ST2 = wpStore();
    if (!ST2 || !ST2.list) return Promise.resolve({ だめ: "Workplace が見つかりません。" });
    var want = String((a && a.name) || "").trim();
    var num = Number(a && a.number) || 0;
    return Promise.resolve(ST2.list({ status: "active", sort: "updated" })).then(function (res) {
      var items = (res && res.items) || [];
      st.files = items;
      if (!items.length) return { だめ: "書類がありません。" };
      var it = null;
      if (num >= 1 && num <= items.length) it = items[num - 1];
      if (want) {
        var hit = null;
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].title || "").indexOf(want) >= 0) { hit = items[i]; break; }
        }
        it = hit || (it && String(it.title || "").indexOf(want) >= 0 ? it : null);
      }
      if (!it) {
        return { だめ: want ? "「" + want + "」という書類は見つかりません。" : "どれを開くか名前で教えてください。",
                 いまある書類: items.slice(0, 20).map(function (x, k) {
                   return (k + 1) + ". " + (x.title || "（名前なし）")
                     + "（" + (種類名[x.itemType] || x.itemType) + "）"; }) };
      }
      return ST2.open(it.id).then(function (c) {
        var WP2 = root.VQ2.workplace;
        var mod = { document: WP2.docs, spreadsheet: WP2.sheets,
                    presentation: WP2.slides, form: WP2.forms }[it.itemType];
        if (!mod || !mod.open) return { だめ: "この種類は開けません（" + it.itemType + "）。" };
        mod.open({ item: c.item, content: c.content });
        return settle(1400).then(function () {
          var now = lookScreen("");
          now.開いた = it.title + "（" + (種類名[it.itemType] || it.itemType) + "）";
          now.つぎ = "中身を直すなら describeWorkplace で見てから editDocument です。";
          return now;
        });
      }, function (e) {
        return { だめ: "開けませんでした（" + String(e && e.message).slice(0, 60) + "）" };
      });
    });
  }

  /* ══ 動かしたあと、**本当に変わったかを見てから** 返す（2026-08-16）════
     ★ これまで「押す・開く・閉じる」系は true を返すだけで、こちらが勝手に
       「できました」と伝えていた。閉じていないのに「閉じたよ」と言った元凶。
     ★ 動いたあとの画面を必ず添える。うまくいかなければ はっきり「できなかった」。 */
  var 見て返す道具 = {
    /* ★ makePreset と startQuiz は **自分で確かめて object を返す**ので、
       ここには入れない（入れると afterAct が 0.42 秒で先に答えてしまう）。 */
    openScreen: 1, closeScreen: 1, goBack: 1, scrollPage: 1,
    searchApp: 1, timerSet: 1, timerControl: 1, setSetting: 1
  };
  function 手短に(a) {
    var s = [];
    try {
      Object.keys(a || {}).forEach(function (k) {
        if (s.length < 3) s.push(String(a[k]).slice(0, 24));
      });
    } catch (e) {}
    return s.length ? "（" + s.join("・") + "）" : "";
  }
  /* ══ 効いたかを **その道具が変えたはずの値を読み直して** 確かめる ══════
     （2026-08-16・監査で確定した いちばんの穴）
     ★ これまで afterAct は「道具が true を返した」だけで「やった」と断言していた。
       true の意味は道具によって違い、たいてい「入口を呼べた」「ボタンを押せた」
       でしかない。狙った所に着いたかは 一度も見ていなかった。
       サーバの指示は「道具の返事に『やった』とあるときだけ できたと言ってよい」なので、
       この 1 行が **すべての嘘の出口**になっていた。
     ★ 画面の名前どうしを比べるのは駄目（whereAmI は設定を開いても別名を返すことがある、
       とコード自身が書いている）。**変えたはずの値そのもの**を読み直す。
     ★ 確かめようが無い道具は 「やった」と言わせない（未確認: true を立てる）。
       未確認のものは 証拠の控えにも載せない（控える() が弾く）。 */
  var 確かめ役 = {
    timerSet: function (a) {
      try {
        var ts = VQ2.timer.read();
        var 秒 = (Number(a.hours) || 0) * 3600 + (Number(a.minutes) || 0) * 60 + (Number(a.seconds) || 0);
        if (!秒) return null;                      /* 長さの指定が無いなら 見ない */
        return Math.round((ts.totalMs || 0) / 1000) === 秒;
      } catch (e) { return null; }
    },
    timerControl: function (a) {
      try {
        var ts = VQ2.timer.read();
        var w = String(a && a.action || "");
        if (w === "start" || w === "resume") return !!ts.running;
        if (w === "pause" || w === "stop") return !ts.running;
        if (w === "reset") return !ts.running || (ts.restMs === ts.totalMs);
        return null;
      } catch (e) { return null; }
    },
    setSetting: function (a) {
      /* ★ 「入ったはずの値」を 読み直して突き合わせる。
         setSetting は 知らない値を false（＝切る）に丸めるので、
         true が返っても **頼まれたとおりとは限らない**。 */
      try {
        var 表 = { theme: ["display.theme", { auto: "AUTO", light: "LIGHT", dark: "DARK" }],
                   fontSize: ["display.fontSize", { small: "SMALL", "default": "DEFAULT", large: "LARGE" }],
                   accent: ["display.accent", null], radius: ["display.radius", null],
                   animations: ["display.animations", "bool"],
                   questionCount: ["learn.questionCount", "num"],
                   questionTime: ["learn.examTime", "num"],
                   autoNext: ["learn.autoNext", "bool"],
                   sound: ["sound.sfx", "bool"], bgm: ["sound.bgm", "bool"] };
        var row = 表[String((a && a.key) || "")];
        if (!row || !root.__vqSet || !root.__vqSet.get) return null;
        var v = String((a && a.value) == null ? "" : a.value).toLowerCase().trim();
        var 欲しい;
        if (row[1] === "bool") 欲しい = /^(on|true|入|オン|つけて|有効)$/.test(v);
        else if (row[1] === "num") 欲しい = Math.floor(Number(v));
        else if (row[1]) 欲しい = row[1][v];
        else 欲しい = v;
        if (欲しい === undefined) return false;
        return String(root.__vqSet.get(row[0])) === String(欲しい);
      } catch (e) { return null; }
    },
    scrollPage: function (a, 前) {
      try { return 前 && 前.巻き !== undefined ? 巻きの位置() !== 前.巻き : null; }
      catch (e) { return null; }
    },
    openScreen: function (a, 前, now) {
      /* 名前で比べない。**押せるものの並びが変わったか**で見る。
         行き先が変われば 必ず中身が入れ替わる。 */
      try {
        if (!前 || !前.並び) return null;
        return (now.操作できるもの || []).join("|") !== 前.並び;
      } catch (e) { return null; }
    },
    searchApp: function () {
      try {
        var l = lookScreen("");
        return (l.操作できるもの || []).some(function (x) { return /検索|探す|コマンド/.test(x); });
      } catch (e) { return null; }
    }
  };
  function 巻きの位置() {
    var n = 0;
    try {
      n = (doc.scrollingElement || doc.documentElement || {}).scrollTop || 0;
      var all = doc.querySelectorAll("*");
      for (var i = 0; i < all.length && i < 4000; i++) n += all[i].scrollTop || 0;
    } catch (e) {}
    return n;
  }
  function 前の姿(name) {
    var 前 = {};
    try {
      if (name === "scrollPage" || name === "scrollIn") 前.巻き = 巻きの位置();
      if (name === "openScreen") 前.並び = (lookScreen("").操作できるもの || []).join("|");
    } catch (e) {}
    return 前;
  }
  function afterAct(name, a, v, 前) {
    return new Promise(function (done) {
      setTimeout(function () {
        var now = lookScreen("");
        if (v === false || v === null || v === undefined) {
          done({ だめ: "「" + name + "」は **できませんでした**。",
                 いまの画面: now.いまの画面,
                 いま押せるもの: (now.操作できるもの || []).slice(0, 14),
                 つぎ: "できたと言わないでください。"
                   + "画面を見て、別の道で進むか、できなかったと正直に伝えてください。" });
          return;
        }
        /* ★ ここが本題。効いたかを 値で確かめる。 */
        var 効いた = null;
        try { if (確かめ役[name]) 効いた = 確かめ役[name](a || {}, 前 || {}, now); }
        catch (e) { 効いた = null; }
        if (効いた === false) {
          done({ だめ: "「" + name + "」を呼びましたが、**何も変わっていません**。",
                 いまの画面: now.いまの画面,
                 いま押せるもの: (now.操作できるもの || []).slice(0, 14),
                 つぎ: "**できたと言わないでください。**"
                   + "lookScreen で画面を見て、別の道（押す・入れる・選ぶ）で もう一度やってください。"
                   + "3 回試して届かないときだけ、できなかったと正直に伝えます。" });
          return;
        }
        var r = { やった: name + 手短に(a), いまの画面: now.いまの画面,
                  いま見えているもの: (now.操作できるもの || []).slice(0, 14) };
        if (効いた === null) {
          /* 確かめようが無かった。**「やった」と言わせない。** */
          delete r.やった;
          r.呼んだ = name + 手短に(a);
          r.未確認 = true;
          r.つぎ = "**まだ「できた」と言わないでください。**この道具は 効いたかを"
            + "こちらで確かめられません。checkDone で 画面に出ているはずの言葉を"
            + "確かめてから 伝えてください。";
        }
        done(r);
      }, 420);
    });
  }

  /* ══ いま何をしているか（2026-08-16）════════════════════════════════
     ★ 訴え「固まっているように見える」。
       道具を呼んでいる間、画面には何も出ていなかった。
     ★ 道具ごとに 言い方を変える。「処理中」ひとつでは、
       何が起きているのか分からず、やはり不安になる。 */
  var 様子 = {
    lookScreen: "画面を見ています", readScreen: "画面を読んでいます",
    tapItem: "押しています", typeInto: "文字を入れています",
    chooseOption: "選んでいます", slideTo: "動かしています",
    scrollIn: "画面を動かしています", scrollPage: "画面を動かしています",
    waitFor: "終わるのを待っています",
    openScreen: "画面を開いています", closeScreen: "画面を閉じています",
    goBack: "前に戻っています", searchApp: "探しています",
    startQuiz: "クイズを始めています", makePreset: "問題を作っています",
    listFormats: "形式を選んでいます", startDraft: "入れ物を用意しています",
    readAttachment: "資料を読んでいます",
    addQuestion: "問題を作っています", draftStatus: "下書きを確かめています",
    editQuestion: "問題を直しています", removeQuestion: "問題を消しています",
    discardDraft: "下書きを片づけています", saveDraft: "保存しています",
    makeDocument: "資料を作っています", editDocument: "書類を直しています",
    describeWorkplace: "中身を確かめています",
    fixAt: "指されたところを 直しています",
    explainWhy: "解説を用意しています", weakSpots: "苦手を調べています",
    listFiles: "書類を並べています", myPresets: "プリセットを並べています",
    deleteFile: "片づけています", removePreset: "片づけています",
    timerSet: "タイマーを合わせています", timerControl: "タイマーを動かしています",
    setSetting: "設定を変えています", listSettings: "設定を探しています",
    changeSetting: "設定を変えています",
    readResult: "結果を読んでいます", readWrongQuestions: "まちがえた所を読んでいます",
    readClock: "時計を見ています", openFile: "書類を開いています",
    searchWeb: "いまのことを調べています", dragItem: "つかんで運んでいます",
    answerQuestion: "答えを入れています", quizMove: "問題を移っています",
    readPresetQuestions: "問題を読んでいます", editPresetQuestions: "問題を直しています",
    editPreset: "プリセットを直しています", addPresetQuestion: "問題を足しています",
    removePresetQuestion: "問題を消しています",
    askPlan: "段取りを考えています", startPlan: "段取りを立てています",
    startTask: "段取りを立てています", stepDone: "ここまでを確かめています",
    finishTask: "できたか確かめています", checkDone: "できたか確かめています"
  };

  /* ══ 作業中に流す音（Start1）════════════════════════════════════════
     ★ 起動音・終了音と同じ入れ物で、**繰り返し**流す。
     ★ 終わったら **すっと消す**（ぶつっと止めない）。
     ★ 声より小さくする。Lumi の声と重なる場面があるため。 */
  /* ★ 新しい音に 差し替えた（2026-08-19・利用者が 用意した Thinking Newer）。
     元は 5.1ch の WAV 20.6MB。そのままは 配れないので
     ステレオへ 落として AAC 96kbps にした（320KB・26 秒）。
     実測: 山 0.99→0.97 / 実効 0.150→0.150 で 中身は 落ちていない。
     ★ **名前に 指紋を 入れる**。同じ名前だと 端末に 溜まった 古い音が
       鳴り続けて「差し替えたのに 変わらない」になる。
     ★ 古い名前も 残しておく（前の版を 開いている人の ため）。 */
  var 作業音の道 = ["/vq-lumi-think.c3dd946b16.m4a", "/vq-lumi-think.m4a"];
  function 作業音を用意() {
    if (st.jingles && st.jingles.think) return Promise.resolve(st.jingles.think);
    st.jingles = st.jingles || {};
    if (!st.ctx) return Promise.resolve(null);
    var ctx = st.ctx;
    var 試す = function (i) {
      if (i >= 作業音の道.length) return Promise.resolve(null);
      return fetch(作業音の道[i])
        .then(function (r) { return r.ok ? r.arrayBuffer() : 試す(i + 1); })
        .catch(function () { return 試す(i + 1); });
    };
    return 試す(0)
      .then(function (ab) {
        if (!ab) return null;
        return new Promise(function (done) {
          try {
            var 約2 = ctx.decodeAudioData(ab, function (b) { st.jingles.think = b; done(b); },
              function () { done(null); });
            if (約2 && typeof 約2.catch === "function") 約2.catch(function () { done(null); });
          } catch (e) { done(null); }
        });
      })
      .catch(function () { return null; });
  }
  function 作業音(on) {
    var ctx = st.ctx;
    if (!ctx) return;
    if (on) {
      if (st.workSrc) return;                     /* もう流れている */
      var g0 = 効果音の大きさ();
      if (!g0) return;
      var 目標 = g0 * 0.5;                        /* 声より控えめに */
      st.workWant = true;
      作業音を用意().then(function (buf) {
        if (!buf || !st.workWant || st.workSrc) return;
        try {
          var src = ctx.createBufferSource();
          var gain = ctx.createGain();
          src.buffer = buf; src.loop = true;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(目標, ctx.currentTime + 0.35);
          src.connect(gain); gain.connect(ctx.destination);
          src.start(0);
          st.workSrc = src; st.workGain = gain; st.workStart = Date.now();
        } catch (e) {}
      });
    } else {
      st.workWant = false; st.workStart = 0;
      var src2 = st.workSrc, g2 = st.workGain;
      st.workSrc = null; st.workGain = null;
      if (!src2) return;
      try {
        /* すっと消す（0.7 秒）。急に止めるとプツッと鳴る。 */
        var t = ctx.currentTime;
        g2.gain.cancelScheduledValues(t);
        g2.gain.setValueAtTime(Math.max(0.0001, g2.gain.value), t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        setTimeout(function () { try { src2.stop(); src2.disconnect(); } catch (e) {} }, 900);
      } catch (e) { try { src2.stop(); } catch (e2) {} }
    }
  }

  /* 作業を始める・終える。道具が重なっても数を数えて 1 本にまとめる。
     ★ すぐ終わる道具（画面を見るなど、1 ミリ秒）でチカチカさせない。
       **少し待ってから**出す。それより速く終われば 何も出さない。
     ★ 終わったら **元の様子に戻す**（「聞いています」を消してしまわない）。 */
  function 出ている() {
    try { return !!(st.host && st.host.classList.contains("work")); } catch (e) { return false; }
  }
  function 作業開始(名) {
    st.workName = 名 || "考えています";
    if (!(st.workN || 0)) st.prevState = st.state || "";
    st.workN = (st.workN || 0) + 1;
    if (st.workT) return;                         /* 出す予定がある → そのまま待つ */
    if (st.workSrc) { say(st.workName); return; } /* もう鳴っている → 言い方だけ差し替え */
    /* ★ 喋っている最中は 言葉の表示を横取りしない。ただし **あきらめない**。
       前は 1 回試して駄目なら二度と出さなかったので、
       道具を呼んだ瞬間に喋っていると 何も出ないままだった（実測 2026-08-16）。 */
    var 出す = function () {
      st.workT = 0;
      if (!st.workN) return;                      /* もう終わった */
      /* ★ ここを st.words で判じてはいけない（実測 2026-08-16）。
         st.words は **前の発言を持ったまま**なので、最初の一言のあとは
         ずっと真になり、帯も音も 二度と出なくなっていた。
         見るのは「いま声が鳴っているか」だけ。 */
      if (st.speaking) { st.workT = setTimeout(出す, 200); return; }
      say(st.workName);
      作業音(true);
      /* ★ **鳴らしっぱなしの 上限**（2026-08-20）。
         道具が どれだけ 手こずっても 45 秒。それを 超えたら
         勘定が 合っていないので、音も 帯も 打ち切る。 */
      if (st.workLimit) clearTimeout(st.workLimit);
      st.workLimit = setTimeout(function () {
        st.workLimit = 0; 作業の打ち切り("45 秒を 超えた");
      }, 45000);
    };
    st.workT = setTimeout(出す, 180);
  }
  function 作業終了() {
    st.workN = Math.max(0, (st.workN || 0) - 1);
    if (st.workN) return;                         /* まだ別の道具が動いている */
    if (st.workT) { clearTimeout(st.workT); st.workT = 0; }
    if (st.workLimit) { clearTimeout(st.workLimit); st.workLimit = 0; }
    作業音(false);
    /* いま喋っているならそのまま。そうでなければ 元の様子へ戻す。 */
    if (!st.speaking && 出ている()) say(st.prevState || "");
  }
  /* ══ 最後の 手（2026-08-20・訴え「思考中の 音楽が ずっと 鳴り続ける」）══
     数の 勘定が どこかで 合わなくても、**音だけは 必ず 止まる**ようにする。
     数を 数える やり方は 呼び忘れ 1 つで 破れる。破れても
     利用者に 届く 害（鳴りっぱなし）は ここで 断ち切る。 */
  function 作業の打ち切り(なぜ) {
    if (!(st.workN || st.workSrc || st.workT)) return false;
    var 秒 = st.workStart ? Math.round((Date.now() - st.workStart) / 100) / 10 : 0;
    noteEv("★ 考え中の 帯と 音を 打ち切った（" + (なぜ || "") + "・" + 秒 + " 秒）");
    st.workN = 0; st.thinking = false;
    if (st.workT) { clearTimeout(st.workT); st.workT = 0; }
    if (st.workLimit) { clearTimeout(st.workLimit); st.workLimit = 0; }
    try { 作業音(false); } catch (e) {}
    if (!st.speaking && 出ている()) { try { say(st.prevState || ""); } catch (e2) {} }
    return true;
  }

  /* ══ 同じ失敗を繰り返させない（2026-08-16）════════════════════════
     ★ 訴え「AI が 操作できない → 終わり」。
       実測でも、断られた stepDone を **まったく同じ引数で 3 回**呼んで
       そこで力尽きていた。断り文に「どうすれば通るか」が無いのが原因。
     ★ 2 回目からは **同じ呼び方は通さず**、通る道を名指しで示す。 */
  function 呼び跡(name, a) {
    var s2 = "";
    try { s2 = JSON.stringify(a || {}).slice(0, 200); } catch (e) { s2 = String(a); }
    return name + "|" + s2;
  }
  function 使える証拠() {
    return (st.done || []).slice(-6);
  }
  function 繰り返し(name, a, r) {
    if (!r || typeof r !== "object" || !r.だめ) {
      /* うまくいったら、その呼び方の失敗数は忘れる */
      if (st.ng) delete st.ng[呼び跡(name, a)];
      return r;
    }
    var k = 呼び跡(name, a);
    st.ng = st.ng || {};
    st.ng[k] = (st.ng[k] || 0) + 1;
    if (st.ng[k] < 2) {
      /* 1 回目。何が使えるかを添えて返す。 */
      r.使える証拠 = 使える証拠();
      return r;
    }
    /* 2 回目以降。**同じ呼び方は もう通らない**と はっきり言う。 */
    var 今 = null;
    try { 今 = lookScreen(""); } catch (e) {}
    return {
      だめ: "**同じ呼び方を " + st.ng[k] + " 回 続けています。これ以上は通りません。**"
        + "（" + name + "）もとの理由: " + String(r.だめ).slice(0, 120),
      やめること: "同じ引数で もう一度呼ぶこと。",
      やること: name === "stepDone" || name === "finishTask"
        ? "証拠は **下の「使える証拠」から そのまま写して**ください。"
          + "自分で考えた言葉は通りません。"
        : "引数を変えるか、別の道具を使ってください。"
          + "何ができるか分からないときは lookScreen で画面を見てください。",
      使える証拠: 使える証拠(),
      いまの画面: 今 ? 今.いまの画面 : "",
      いま押せるもの: 今 ? (今.操作できるもの || []).slice(0, 12) : [],
      つぎ: "それでも進めないなら、**できなかったと正直に伝えて**ください。"
        + "黙って同じことを繰り返さないこと。"
    };
  }

  /* ══ 道具の返事に **いまの画面をいつも添える**（2026-08-16）══════════
     ★ 訴え「常に画面を見ていてほしい」「察して動いてほしい」。
     ★ 会話の記録へ差し込む方式は やめた（番の途中に入ると返事が
       返らなくなるのを実測済み。pushScreen 参照）。
       代わりに **道具の返事に必ず付ける**。道具を呼ぶたびに
       いちばん新しい画面が渡るので、古くなりようがなく、
       会話の記録も汚さない。
     ★ 画面を読む道具（readScreen など）には付けない（二重になる）。 */
  function 画面を添える(x) {
    if (!x || typeof x !== "object") return x;
    if (x.書いてあること || x.操作できるもの) return x;
    try {
      if (!x.いまの画面) x.いまの画面 = whereAmI();
      if (!x.画面に書いてあること) {
        var rr = readScreen({});
        var 行 = (rr.書いてあること || []).slice(0, 10);
        if (行.length) x.画面に書いてあること = 行;
      }
    } catch (e) {}
    return x;
  }

  /* ══ 書きものの返りに **機械の報告**を 必ず添える（2026-08-17・段1）══
     ★ §8.2「報告は 機械が 書く」。ここまで その口は fixAt にしか
       付いていなかったので、makeDocument / docsWrite で作ったときは
       **何の裏づけも無いまま** Lumi が完成を宣言できていた。
     ★ ここでは **止めない**（採用しない・直す は 段3 の仕事）。
       返りに 事実を 添えるだけ。 */
  /* ★ 切り分け用（2026-08-17）。段1 の うち **モデルに届く分**だけを 外す。
     画面の落とし込みは 外さない（表示は モデルの動きに 影響しない）。 */
  function 段1オフ() {
    try { return root.localStorage.getItem("vq.dan1") === "off"; } catch (e) { return false; }
  }

  function 報告を添える(name, x) {
    if (段1オフ()) return x;
    if (!報告が要る道具[name]) return x;
    st.書きもの時 = Date.now();
    if (!x || typeof x !== "object") return x;
    /* すでに 機械の報告そのもの（fixAt など）なら 触らない */
    if (x.報告 !== undefined && x.完成と言ってよい !== undefined) {
      try { root.VQW.report.覚える(x); } catch (e0) {}
      return x;
    }
    try {
      var R = root.VQW && root.VQW.report; if (!R || !R.道具の返り) return x;
      var K = root.VQ2 && root.VQ2.workplace && root.VQ2.workplace.cmd;
      if (!K || !K.いま || !K.いま()) return x;
      var 検 = K.基盤の検査 ? K.基盤の検査() : null; if (!検) return x;
      var 出 = R.道具の返り({ status: "applied", 見ただけ: true,
        applied: [], skipped: [], validation: 検 }, {});
      x.報告 = 出.報告;
      x.完成と言ってよい = 出.完成と言ってよい;
      x.残る崩れ = 出.残る崩れ;
      /* ★ 既にある「つぎ」を 潰さない（別の名前で 添える） */
      x.伝えかた = 出.つぎ;
      if (出.言ってはいけない言葉) x.言ってはいけない言葉 = 出.言ってはいけない言葉;
    } catch (e) {}
    return x;
  }

  function doTool(name, a) {
    var v;
    st.道具回 = (st.道具回 || 0) + 1;    /* 自動の続きが 空回りしていないかを見る用 */
    if (st.未処理) st.未処理.動いた = true;   /* 頼みは 届いて 動き出した */
    st.最後の道具時 = Date.now();
    /* ★ **「作りかけ」だけを 催促の対象にする**（2026-08-17・訴え）。
       画面を切り替える・調べる・答えるだけの道具では 催促しない。
       ここに無い道具しか動いていないなら、それは「仕事」ではなく
       ただの受け答えなので、終わったら 静かにしている。 */
    if (終わりの道具[name]) {
      st.作りかけ = null;
      try { 促しを止める("仕事の終わりの道具（" + name + "）が動いた"); } catch (e7) {}
    }
    if (作る道具[name]) {
      st.作りかけ = { 道具: name, at: Date.now() };
      /* ★ 訴え「生成中は固まるんじゃなくて、上部に 生成中… と出しておいて」。
         書類を作る道具が動いているあいだは 画面の上に出す。
         deck* の通しは pipeline 側が 枚数つきで上書きするので、
         ここでは **その他の書きもの** のための素の表示だけ。
         押せる物は隠さない（pointer-events:none）。 */
      try {
        if (name.indexOf("deck") !== 0 && root.VQD && root.VQD.pipeline)
          root.VQD.pipeline.進捗(作業の言いかた[name] || "作業しています…", 0, 0, 6000);
      } catch (e0) {}
    }
    /* 道具が動いた＝繋がりは生きている。繋ぎ直しの数を戻す
       （戻さないと、長い仕事の途中で 上限に達して終わってしまう）。 */
    st.redial = 0;
    作業開始(様子[name]);
    /* ★ 効いたかを比べるため、**呼ぶ前の姿**を控えておく */
    var 前 = 見て返す道具[name] ? 前の姿(name) : null;
    try { v = doTool0(name, a); }
    catch (e) { v = false; }
    var 締める = function (x) {
      作業終了();
      /* ★ **何が実際に走ったか**を控える（2026-08-17・段1 やり直し）。
         画面の出口は これだけを 根拠にする。ここに載らない仕事は
         「やった」と 言わせない。だめ が返った道具は **走っていない扱い**。 */
      st.道具の跡 = st.道具の跡 || {};
      st.道具の跡[name] = { 時: Date.now(),
        済: !(x === false || (x && typeof x === "object" && (x.だめ || x.未確認))) };
      return 報告を添える(name, 画面を添える(繰り返し(name, a, x)));
    };
    /* ★★ **どの道を 通っても 締める**（2026-08-20）。
       締めそこねると 作業の数（workN）が 減らず、
       「考えています」の 帯と 音が **鳴りっぱなし**に なる。
       もとは afterAct が こけた ときに 締める が 呼ばれない 道が 2 本 あった
       （下の 2 か所）。数え方だけに 頼らず、**出口を 1 本に 束ねる**。 */
    /* ★ **関数で 受ける**。約束を 受けると、その約束を 作る 途中で
       こけた ときに ここへ 来ない（＝ 締めそこねる）。 */
    var 必ず締める = function (作る) {
      var p2;
      try { p2 = 作る(); } catch (e2) { return 締める(false); }
      return Promise.resolve(p2).then(function (y) { return 締める(y); },
        function () { return 締める(false); });
    };
    if (!見て返す道具[name]) {
      if (v && typeof v.then === "function") {
        return v.then(function (x) { 控える(x, name); return 締める(x); },
                      function () { return 締める({ だめ: "うまくいきませんでした" }); });
      }
      控える(v, name);
      return 締める(v);
    }
    return Promise.resolve(v).then(function (x) {
      /* すでに中身のある返事を作っている道具（closeScreen）は そのまま通す */
      if (x && typeof x === "object") { 控える(x, name); return 締める(x); }
      return 必ず締める(function () {
        return afterAct(name, a, x, 前).then(function (y) { 控える(y, name); return y; });
      });
    }, function () {
      return 必ず締める(function () { return afterAct(name, a, false, 前); });
    });
  }

  function doTool0(name, a) {
    if (name === "weakSpots") return weakSpots(a);
    if (name === "explainWhy") return explainWhy(a);
    if (name === "editDocument") return editDocument(a);
    if (name === "describeWorkplace") return describeWorkplace(a);
    /* ── Workplace を 自分で操作する（2026-08-17）───────────────── */
    if (name === "researchSearch") return researchSearch(a);
    if (name === "researchRead") return researchRead(a);
    if (name === "workplaceCan") return workplaceCan(a);
    if (name === "readDocument") return readDocument(a);
    if (name === "reviewDocument") return reviewDocument(a);
    if (name === "undoLast") return undoLast(a);
    if (name === "newFile") return newFile(a);
    if (name === "listTemplates") return listTemplates(a);
    if (name === "listCommands") return listCommands(a);
    if (name === "runCommand") return runCommand(a);
    if (name === "fileAction") return fileAction(a);
    if (name === "fixAt") return fixAt(a);
    /* ── カメラを見せる（AR・2026-08-17）───────────────────────── */
    if (name === "cameraOn") return cameraOn(a);
    if (name === "cameraOff") return cameraOff(a);
    if (name === "markInView") return markInView(a);
    if (name === "clearMarks") return clearMarks(a);
    if (name === "solveFromCamera") return solveFromCamera(a);
    if (name === "saveLook") return saveLook(a);
    if (name === "remember") return remember(a);
    if (name === "forget") return forget(a);
    if (name === "showNote") return showNote(a);
    /* ★ ボードに 線を 引く・書き足す（2026-08-19・訴え
       「解説している部分に マーカー・波線・ペン・文字を リアルタイムで」）。 */
    if (name === "planAdd") return withGoal(planAdd(a));
    if (name === "planShow") return planShow();
    if (name === "boardBlocks") return boardBlocks();
    if (name === "boardMark") return boardMark(a);
    if (name === "boardWrite") return boardWrite(a);
    if (name === "boardNote") return boardNote(a);
    if (name === "boardClear") return boardClear();
    if (name === "scanMode") return scanMode(a);
    if (name === "showKata") return showKata(a);
    if (name === "showApp") return showApp(a);
    if (name === "listBoards") return listBoards(a);
    if (name === "openBoards") return openBoards(a);
    if (name === "hideNote") return hideNote(a);
    if (name === "placeAnswers") return placeAnswers(a);
    if (name === "clearAnswers") return clearAnswers(a);
    if (name === "makePresetFromCamera") return makePresetFromCamera(a);
    if (name === "sendToQuickMock") return sendToQuickMock(a);
    if (name === "listCollected") return listCollected(a);
    if (name === "clearCollected") return clearCollected(a);
    if (name === "docsWrite") return docsWrite(a);
    if (name === "docsEdit") return docsEdit(a);
    if (name === "sheetsWrite") return sheetsWrite(a);
    if (name === "sheetsEdit") return sheetsEdit(a);
    if (name === "slidesPlan") return slidesPlan(a);
    if (name === "slidesWrite") return slidesWrite(a);
    if (name === "slidesEdit") return slidesEdit(a);
    if (name === "findPicture") return findPicture(a);
    if (name === "usePicture") return usePicture(a);
    if (name === "docDesign") return docDesign(a);
    if (name === "sheetsPivot") return sheetsPivot(a);
    if (name === "deckStart") return deckStart(a);
    if (name === "deckDesign") return deckDesign(a);
    if (name === "deckWrite") return deckWrite(a);
    if (name === "deckFinish") return deckFinish(a);
    if (name === "formsWrite") return formsWrite(a);
    if (name === "formsEdit") return formsEdit(a);
    if (name === "startTask") return startTask(a);
    if (name === "stepDone") return stepDone(a);
    if (name === "finishTask") return finishTask(a);
    if (name === "checkDone") return checkDone(a);
    if (name === "listFiles") return listFiles(a);
    if (name === "deleteFile") return deleteFile(a);
    if (name === "myPresets") return myPresets(a);
    if (name === "removePreset") return removePreset(a);
    if (name === "readPresetQuestions") return readPresetQuestions(a);
    if (name === "editPresetQuestions") return editPresetQuestions(a);
    if (name === "editPreset") return editPreset(a);
    if (name === "addPresetQuestion") return addPresetQuestion(a);
    if (name === "removePresetQuestion") return removePresetQuestion(a);
    if (name === "askPlan") return askPlan(a);
    if (name === "startPlan") return startPlan(a);
    if (name === "readResult") return readResult(a);
    if (name === "readClock") return readClock(a);
    if (name === "searchWeb") return searchWeb(a);
    if (name === "answerQuestion") return answerQuestion(a);
    if (name === "quizMove") return quizMove(a);
    if (name === "dragItem") return dragItem(a);
    if (name === "readWrongQuestions") return readWrongQuestions(a);
    if (name === "openFile") return openFile(a);
    if (name === "listSettings") return listSettings(a);
    if (name === "changeSetting") return changeSetting(a);
    if (name === "makeDocument") return makeDocument(a);
    if (name === "lookScreen") return lookScreen(a && a.want, a && a.page);
    if (name === "tapItem") return tapItem(a);
    if (name === "typeInto") return typeInto(a);
    if (name === "chooseOption") return chooseOption(a);
    if (name === "readScreen") return readScreen(a);
    if (name === "slideTo") return slideTo(a);
    if (name === "scrollIn") return scrollIn(a);
    if (name === "waitFor") return waitFor(a);
    if (name === "openScreen") return openScreen(a.screen);
    if (name === "closeScreen" || name === "goBack") return closeTop();
    if (name === "scrollPage") return scrollPage(a.direction);
    if (name === "startQuiz") return startQuiz(a.name);
    if (name === "listFormats") return listFormats(a);
    if (name === "readAttachment") return readAttachment(a);
    if (name === "startDraft") return startDraft(a);
    if (name === "addQuestion") return addQuestion(a);
    if (name === "draftStatus") return draftStatus(a);
    if (name === "editQuestion") return editQuestion(a);
    if (name === "removeQuestion") return removeQuestion(a);
    if (name === "discardDraft") return discardDraft(a);
    if (name === "saveDraft") return saveDraft(a);
    if (name === "makePreset") return makePreset(a.instruction);
    if (name === "searchApp") return searchApp(a.query);
    if (name === "timerSet") return timerSet(a);
    if (name === "timerControl") return timerControl(a.action);
    if (name === "setSetting") return setSetting(a.key, a.value);
    if (name === "endConversation") { setTimeout(close, 700); return true; }
    return false;
  }

  /* いま重なっている画面を、上から順に並べる。
     U.mount で作った画面には host.__vq2 が付いている。これがいちばん確実な目印。 */
  function topHosts() {
    var hosts = [];
    try {
      var all = doc.querySelectorAll("body > *");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.id === "vqLiveEdge" || el.id === "vqShell" || el.id === "vqLiveBar") continue;
        if (el.id === "vq2-timer-bar") continue;   /* 小さな帯。画面ではない */
        var own = !!el.__vq2;
        var cs = root.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!own) {
          /* ★ 古い覆いは **幽霊が多い**（実測 2026-08-16: 閉じたままの
             「画像を拡大表示」が z=9200 で残っていて、いちばん上に見えた）。
             lookScreen と同じ見えかたの物差しで落とす。 */
          if (cs.position !== "fixed") continue;
          var r = el.getBoundingClientRect();
          if (r.width < 240 || r.height < 240) continue;
          if (Number(cs.opacity) < 0.05) continue;
          if (cs.pointerEvents === "none") continue;
          try {
            if (el.checkVisibility && !el.checkVisibility({
              opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true
            })) continue;
          } catch (e2) {}
        }
        hosts.push({ el: el, z: Number(cs.zIndex) || 0, i: i, own: own });
      }
    } catch (e) {}
    /* 同じ高さなら **あとから置かれたほう**が上（U.mount は末尾へ足す） */
    hosts.sort(function (x, y) { return (y.z - x.z) || (y.i - x.i); });
    /* ★ 畳める画面（U.mount）があるなら、そちらだけを相手にする。
       古い覆いは閉じ方が分からないので、混ぜると「閉じられない」で詰まる。 */
    var 畳める = hosts.filter(function (h) { return h.own; });
    return 畳める.length ? 畳める : hosts;
  }

  /* ══ いちばん上の画面を閉じる ══════════════════════════════════════
     ★ 2026-08-16 に作り直した。前は「閉じるボタンを探して押す」だけで、
       ボタンの無い画面（タイマーのようなシート）では **何も閉じないのに
       true を返していた**。実際「タイマーの画面閉じたよ」と言いながら
       タイマーは出たままだった。嘘の出どころはここ。
     ★ U.mount の画面は host.__vq2.close() が正しい入口。探して押すより確実で、
       後始末（onClose）もちゃんと走る。
     ★ そして **本当に消えたかを見てから** 返す。消えていなければ「閉じた」と
       言わせない。 */
  /* ══════════════════════════════════════════════════════════════════
     「閉じる」の 意味を **アプリ全体で 1 つに 決める**（2026-08-19・訴え）

     訴え:「ボードや ゲームを 閉じてって、クイズ中の ゲームボードが
           表示された状態で 指示すると、クイズ画面が 閉じてしまい、
           せっかく 解いてきた クイズの 履歴が 消えた。
           これ **閉じる の 意味を Lumi に 定義する 必要**が あるんじゃない？」

     決めごと（上から 順に 1 つだけ 閉じる）:
       ① 確認の窓が 出ていれば → **その窓だけ**
       ② ボード（書いたもの・動くもの）が 出ていれば → **ボードだけ**
       ③ 重なっている 画面（設定・詳細など）が あれば → いちばん上の 1 枚
       ④ ①〜③が 何も 無く、**クイズだけ**が 開いている → **閉じない**

     ④が 要。クイズを 閉じると 解いてきた ぶんが 消える。
     「閉じて」は ふつう **手前の じゃまなもの**を 指していて、
     解いている クイズを 捨てる 意味では ない。
     本当に やめたいなら「クイズを やめる」と はっきり 言ってもらう。
     ══════════════════════════════════════════════════════════════════ */
  function クイズ中か() {
    try {
      var q = root.VQ2 && VQ2.quizNow;
      return !!(q && typeof q.total === "number" && q.total > 0);
    } catch (e) { return false; }
  }
  function 板が出ているか() {
    try {
      var d = st.noteBox;
      return !!(d && d.classList.contains("show"));
    } catch (e) { return false; }
  }

  function closeTop() {
    /* ★ **確認の窓が出ていたら、先に その窓だけを閉じる**（2026-08-17）。
       実測: 「クイズを終了しますか？」の窓で『一度閉じて』と言われて、
       窓ではなく **クイズごと** 閉じ、プリセット一覧まで戻っていた。 */
    var 窓 = いまの窓();
    if (窓) {
      var 題 = 窓の題(窓);
      var b = null;
      try {
        b = 窓.querySelector('[data-act="dlg-c"], [data-act="dlg-x"], #quizExitCancelBtn,'
          + ' #quizExitCloseBtn, [aria-label="閉じる"], [aria-label="Close"]');
      } catch (e) {}
      if (b) { try { b.click(); } catch (e2) {} }
      else {
        try {
          窓.dispatchEvent(new root.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        } catch (e3) {}
      }
      return settle(450).then(function () {
        var まだ = いまの窓();
        var now0 = lookScreen("");
        if (まだ && doc.body.contains(窓) && まだ === 窓) {
          return { だめ: "確認の窓「" + 題 + "」は **閉じませんでした**。",
                   いま押せるもの: (now0.操作できるもの || []).slice(0, 10),
                   つぎ: "閉じたと言わないでください。"
                     + "窓の中のボタンを tapItem で押してください。" };
        }
        return { 閉じた: "確認の窓「" + 題 + "」",
                 のこっている画面: now0.いまの画面,
                 いま押せるもの: (now0.操作できるもの || []).slice(0, 12),
                 つぎ: "**窓を閉じただけです。下の画面（クイズなど）は そのまま開いています。**"
                   + "画面まで閉じたとは 言わないでください。"
                   + "利用者が『さっきの問題に答えたい』と言ったなら、"
                   + "そのまま answerQuestion で答えてください。" };
      });
    }
    /* ② ボードが 出ていれば **ボードだけ** 閉じる（2026-08-19）。
       ここを 入れる前は、板が 出ていても 下の画面（クイズ）を 閉じていた。 */
    if (板が出ているか()) {
      var 動 = false;
      try { 動 = st.noteBox.classList.contains("vqn-appmode"); } catch (e) {}
      var 残 = !!(st.板 && !st.残した) || !!(st.板のアプリ && !st.残した);
      板を閉じる();
      var n0 = lookScreen("");
      return { 閉じた: 動 ? "ボード（動くもの）" : "ボード",
               のこっている画面: n0.いまの画面,
               クイズは開いたまま: クイズ中か() || undefined,
               のこしていない: 残 ? "このボードは **残していません**（保存を 押していません）。"
                 + "また 見たいと 言われたら、もう一度 作り直すことになります。" : undefined,
               つぎ: "**ボードだけ 閉じました。下の画面は そのままです。**"
                 + (クイズ中か() ? "クイズは 開いたままなので、そのまま 続けられます。" : "") };
    }

    var before = topHosts();
    if (!before.length) {
      /* ④ 何も 重なっていない。ここで 閉じると **クイズごと** 消える。 */
      if (クイズ中か()) {
        var nq = lookScreen("");
        return { だめ: "**閉じませんでした。**いま クイズを 解いている 途中で、"
                   + "ここで 閉じると **解いた ぶんが 消えます**。",
                 いまの画面: nq.いまの画面,
                 つぎ: "「閉じて」は ふつう **手前の じゃまなもの**（ボードなど）を 指します。"
                   + "いまは 手前に 何も ありません。\n"
                   + "・クイズを 続けるなら 何も しないでください。\n"
                   + "・本当に やめたいのか **利用者に 確かめて**ください。"
                   + "「やめると ここまでの 答えが 消えますが いいですか」と 聞きます。\n"
                   + "・やめると 言われたら、画面の「終了」や「×」を tapItem で 押します"
                   + "（そのとき 確認の窓が 出ます）。" };
      }
      var n1 = lookScreen("");
      return { だめ: "いま閉じられる画面はありません（もういちばん下です）。",
               いまの画面: n1.いまの画面,
               つぎ: "閉じたと言わないでください。" };
    }
    var t = before[0];
    var name = t.el.getAttribute("aria-label") || t.el.id || "画面";
    var api2 = t.el.__vq2;
    if (api2 && typeof api2.close === "function") {
      try { api2.close("lumi"); } catch (e) {}
    } else {
      var b = null;
      try {
        b = (t.el.shadowRoot || t.el).querySelector(
          '[data-act="x"], [aria-label="閉じる"], [aria-label="Close"], .sh-x');
      } catch (e) {}
      if (b) { try { b.click(); } catch (e) {} }
    }
    return new Promise(function (done) {
      setTimeout(function () {
        var gone = !doc.body.contains(t.el)
          || root.getComputedStyle(t.el).display === "none";
        var now = lookScreen("");
        if (gone) return done({ 閉じた: name, いまの画面: now.いまの画面,
                                いま見えているもの: (now.操作できるもの || []).slice(0, 14) });
        done({ だめ: "「" + name + "」は **閉じませんでした**。まだ画面に出ています。",
               いまの画面: now.いまの画面,
               いま押せるもの: (now.操作できるもの || []).slice(0, 14),
               つぎ: "閉じたと言わないでください。"
                 + "保存の確認を聞かれている場合があります。画面を見て、"
                 + "閉じるためのボタンを自分で押してください。" });
      }, 420);
    });
  }

  function scrollPage(dir) {
    var box = null;
    try {
      /* いちばん上の画面の、中で流れているところを探す */
      var cands = doc.querySelectorAll("body > *");
      for (var i = cands.length - 1; i >= 0 && !box; i--) {
        var sr = cands[i].shadowRoot;
        if (!sr) continue;
        var ss = sr.querySelectorAll("*");
        for (var k = 0; k < ss.length; k++) {
          if (ss[k].scrollHeight > ss[k].clientHeight + 40) { box = ss[k]; break; }
        }
      }
    } catch (e) {}
    var t = box || doc.scrollingElement || doc.documentElement;
    var h = (box ? box.clientHeight : root.innerHeight) * 0.8;
    try {
      if (dir === "top") t.scrollTo({ top: 0, behavior: "smooth" });
      else if (dir === "bottom") t.scrollTo({ top: t.scrollHeight, behavior: "smooth" });
      else t.scrollBy({ top: dir === "up" ? -h : h, behavior: "smooth" });
      return true;
    } catch (e) { return false; }
  }

  /* ══ Lumi が **自分で 1 問ずつ作る**（2026-08-17）═══════════════════
     ★ 訴え 3 つを 一度に直す。
        ①「10 問 作って」と言うと **1 問ずつ 10 個のプリセット**になった。
          毎回 makePreset を呼び、そのたび別のプリセットが生まれていた。
        ② 形式を 生成 AI に渡すだけなので、思ったものが返ってこない。
        ③ 直したいときも AI に頼み直すしかなく、そのたび費用がかかる。
     ★ 作りは 3 つだけ。
          startDraft  … 入れ物を 1 つ作る（saveDraft まで **ずっと同じ入れ物**）
          addQuestion … 1 問ずつ足す。**その場で形を確かめ、駄目なら入れない**
          saveDraft   … 最後に 1 回だけ保存する（＝1 プリセットに全問）
        途中の直しは editQuestion / removeQuestion。追加の指示はここで受ける。
     ★ 形式は 166 種類あるが、中身の作りは **エンジン 20 種**しかない。
       骨は qmodel.emptyQuestion(形式) が作る。ここは中身を詰めるだけ。
       形式が増えても ここは増えない。
     ★ 画像の要る 3 種（画像選択・画像内の位置・ラベル配置）は
       声から作れない。**作れるふりをせず、はっきり断る。** */
  var 作り中 = { p: null, ねらい: 0 };

  function QT2() { return root.VQ2 && VQ2.qtypes; }
  function QM2() { return root.VQ2 && VQ2.qmodel; }
  function Q文(v) { return v === null || v === undefined ? "" : String(v); }
  function Q配(v) {
    if (Array.isArray(v)) return v;
    if (v === null || v === undefined || v === "") return [];
    return [v];
  }

  /* 形式 ID。「4択」「組み合わせ」のような日本語でも受ける。 */
  function 形式を決める(t) {
    var Q = QT2();
    if (!Q) return null;
    var s = Q文(t).trim();
    if (!s) return null;
    var id = null;
    try { id = Q.canonicalId(s); } catch (e) {}
    if (id) return id;
    try { var jp = Q.fromJapanese(s); if (jp && jp.length) return jp[0]; } catch (e2) {}
    return null;
  }

  /* 画像がいる＝声だけでは作れない。ここに嘘を作らせない。 */
  var 声で作れない = {
    image_choice: "選択肢ごとの画像",
    image_point: "画像と 正解の場所",
    image_label: "画像と ラベルを置く場所"
  };

  function 難しさ(v) {
    var s = Q文(v);
    if (/easy|やさし|かんたん|簡単|初/.test(s)) return "easy";
    if (/hard|むずかし|難し|応用|上級/.test(s)) return "hard";
    return "normal";
  }

  function 形式の内訳(qs) {
    var Q = QT2(), 表 = {};
    (qs || []).forEach(function (q) {
      var n = Q ? Q.label(q.type) : q.type;
      表[n] = (表[n] || 0) + 1;
    });
    return Object.keys(表).map(function (k) { return k + " " + 表[k] + " 問"; });
  }

  function 問題の見出し(q) {
    var t = Q文(q && q.prompt).trim();
    if (!t && q && q.card) t = Q文(q.card.front);
    if (!t && q && q.context) t = Q文(q.context);
    return t.replace(/\s+/g, " ").slice(0, 44);
  }

  /* ── 1 問を組み立てる。**形が通らなければ入れない。** ─────────────
     戻り: { q: 問題 } か { だめ: 理由, 足りないもの: [...] } */
  function 問題を組む(a, 道) {
    var Q = QT2(), M = QM2(), S = root.VQ2 && VQ2.schema;
    a = a || {};
    道 = Q文(道);
    if (!Q || !M) return { だめ: "問題を組み立てる仕組みが見つかりません。" };
    var id = 形式を決める(a.type);
    if (!id) {
      return { だめ: 道 + "「" + Q文(a.type) + "」という形式は知りません。",
               つぎ: "listFormats で 使える形式を見て、その id を type に入れてください。" };
    }
    var d = Q.get(id), e = d.engine;
    if (声で作れない[e]) {
      return { だめ: 道 + "「" + d.name + "」には " + 声で作れない[e] + " が要ります。**声だけでは作れません。**",
               つぎ: "画像のいらない形式（4択・組み合わせ・分類・並べ替え・穴埋め など）に変えるか、"
                 + "この 1 問だけ画面から作ってください。**作れたことにしないでください。**" };
    }
    if (d.status === "coming_soon") {
      return { だめ: 道 + "「" + d.name + "」はまだ使えません（準備中）。",
               つぎ: "別の形式にしてください。" };
    }

    var q = M.emptyQuestion(id, {
      prompt: Q文(a.prompt).slice(0, 2000),
      points: (a.points !== undefined && isFinite(Number(a.points))) ? Number(a.points) : undefined,
      topic: Q文(a.topic).slice(0, 120),
      difficulty: 難しさ(a.difficulty),
      createdBy: "lumi"
    });
    q.explanation = Q文(a.explanation).slice(0, 4000);
    if (Q文(a.hint).trim()) q.hint = Q文(a.hint).slice(0, 600);
    if (Q文(a.context).trim()) q.context = Q文(a.context).slice(0, 4000);

    var 選択肢を作る = function (list) {
      return list.map(function (c, i) {
        var o = (c && typeof c === "object") ? c : { text: c };
        var t = Q文(o.text !== undefined && o.text !== null ? o.text : o.label);
        return { id: "c" + (i + 1), label: String.fromCharCode(65 + i),
                 text: t.slice(0, 400),
                 isCorrect: (o.correct === true || o.isCorrect === true) };
      });
    };
    /* 印が無いときは、言葉・記号（A/B/C）・番号 のどれからでも当てる */
    var 正解をあてる = function (cs, want) {
      var w = Q文(want).trim();
      if (!w) return false;
      var 当 = null;
      cs.forEach(function (c) { if (!当 && c.text && c.text === w) 当 = c; });
      if (!当) cs.forEach(function (c) {
        if (!当 && c.text && (c.text.indexOf(w) >= 0 || w.indexOf(c.text) >= 0)) 当 = c;
      });
      if (!当 && /^[A-Za-zＡ-Ｚａ-ｚ]$/.test(w)) {
        var k = w.replace(/[Ａ-Ｚａ-ｚ]/g, function (ch) {
          return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
        }).toUpperCase().charCodeAt(0) - 65;
        if (cs[k]) 当 = cs[k];
      }
      if (!当) {
        var n = Number(w.replace(/[^0-9]/g, ""));
        if (isFinite(n) && n >= 1 && cs[n - 1]) 当 = cs[n - 1];
      }
      if (!当) return false;
      当.isCorrect = true;
      return true;
    };

    if (e === "single_choice" || e === "image_choice" || e === "audio_choice") {
      var cs = Q配(a.choices);
      if (cs.length < 2) {
        return { だめ: 道 + "「" + d.name + "」には 選択肢が 2 つ以上要ります。",
                 つぎ: "choices に [{\"text\":\"…\",\"correct\":true}, …] の形で入れてください。" };
      }
      q.choices = 選択肢を作る(cs);
      var ある = q.choices.some(function (c) { return c.isCorrect; });
      if (!ある) 正解をあてる(q.choices, a.answer !== undefined ? a.answer : a.correct);
      if (e === "audio_choice") q.script = Q文(a.script || a.prompt).slice(0, 2000);
    } else if (e === "multi_choice") {
      var cs2 = Q配(a.choices);
      if (cs2.length < 2) {
        return { だめ: 道 + "「" + d.name + "」には 選択肢が 2 つ以上要ります。",
                 つぎ: "choices に [{\"text\":\"…\",\"correct\":true}, …] の形で入れてください。" };
      }
      q.choices = 選択肢を作る(cs2);
      if (!q.choices.some(function (c) { return c.isCorrect; })) {
        Q配(a.answers !== undefined ? a.answers : a.answer).forEach(function (w) {
          正解をあてる(q.choices, w);
        });
      }
    } else if (e === "true_false") {
      var cs3 = Q配(a.choices);
      if (cs3.length === 2) q.choices = 選択肢を作る(cs3);
      if (!q.choices.some(function (c) { return c.isCorrect; })) {
        var w2 = Q文(a.answer !== undefined ? a.answer : a.correct).trim();
        if (/^(正|○|◯|まる|マル|true|はい|T|Ｔ)/i.test(w2)) q.choices[0].isCorrect = true;
        else if (/^(誤|×|✕|ばつ|バツ|false|いいえ|F|Ｆ|まちが)/i.test(w2)) q.choices[1].isCorrect = true;
        else 正解をあてる(q.choices, w2);
      }
    } else if (e === "fill_blank") {
      var bs = Q配(a.blanks);
      if (!bs.length) bs = Q配(a.answers).map(function (x) { return { answer: x }; });
      if (!bs.length && Q文(a.answer).trim()) bs = [{ answer: a.answer }];
      if (!bs.length) {
        return { だめ: 道 + "穴埋めには 空欄の正解が要ります。",
                 つぎ: "answers に 空欄の順で [\"…\",\"…\"] と入れてください。" };
      }
      q.blanks = bs.map(function (b, i) {
        var o = (b && typeof b === "object") ? b : { answer: b };
        var row = { id: "b" + (i + 1), label: Q文(o.label) || String(i + 1),
                    answer: Q文(o.answer).slice(0, 200),
                    acceptedAnswers: Q配(o.acceptedAnswers).map(Q文).slice(0, 10) };
        var op = Q配(o.options).map(Q文).filter(function (x) { return x.trim(); }).slice(0, 10);
        if (op.length) row.options = op;
        return row;
      });
      /* ★ **空欄の印を そろえる**（2026-08-17・利用者の訴え）。
         このアプリの空欄は **【1】【2】…** だけ（画面はこれを空欄の箱に変える）。
         Lumi が「[ ]」「（　）」「＿＿」と書くと、**そのまま文字として出る**
         （実測: 「頭につけると空を飛べるのは「[ ]」である。」と出た）。
         ここで書き方を揃え、番号を振り直す。数が合わなければ入れない。 */
      var 印 = /【[\s　]*[0-9０-９]{0,2}[\s　]*】|［[\s　]*[0-9０-９]{0,2}[\s　]*］|\[[\s]*[0-9]{0,2}[\s]*\]|（[\s　]*[0-9０-９]{0,2}[\s　]*）|\([\s]*[0-9]{0,2}[\s]*\)|＿{2,}|_{2,}/g;
      var 番 = 0;
      q.prompt = Q文(q.prompt).replace(印, function () { 番++; return "【" + 番 + "】"; });
      if (番 === 0) {
        return { だめ: 道 + "問題文に **空欄の印がありません。**",
                 いまの問題文: Q文(q.prompt).slice(0, 120),
                 つぎ: "空欄にする所を **【1】** と書いてください（2 つ目は【2】）。"
                   + "「[ ]」「（　）」「＿＿」ではなく、**【1】** です。"
                   + "例:「頭につけると空を飛べる道具は【1】である。」"
                   + "**入れていません。**書き直して もう一度 addQuestion を呼んでください。" };
      }
      if (番 !== q.blanks.length) {
        return { だめ: 道 + "空欄の印が " + 番 + " 個なのに、答えが " + q.blanks.length + " 個です。",
                 いまの問題文: Q文(q.prompt).slice(0, 120),
                 つぎ: "数をそろえてください（印が【1】【2】なら answers も 2 つ）。**入れていません。**" };
      }
      /* ★ 「選ばせる穴埋め」は 語群がないと 解答欄が作れない（実測 2026-08-17: ここで 3 形式が落ちた）。
         語群は ①言われたもの ②空欄の答え全部（＝ふつうの語群）の順で用意する。
         **足りないときは 語を勝手にこしらえず、正直に断る。** */
      var 選ばせる = (d.defaults && d.defaults.blankMode === "select");
      if (選ばせる) {
        var 言われた語群 = Q配(a.options).map(Q文).filter(function (x) { return x.trim(); });
        var 答えの語群 = q.blanks.map(function (b) { return b.answer; })
          .filter(function (x) { return x && x.trim(); });
        var 語群 = 言われた語群.length ? 言われた語群 : 答えの語群;
        q.blanks.forEach(function (b) { if (!Q配(b.options).length) b.options = 語群.slice(0, 10); });
        if (q.blanks.some(function (b) { return Q配(b.options).length < 2; })) {
          return { だめ: 道 + "「" + d.name + "」は 選んで答える穴埋めです。**選ばせる語（語群）が 2 つ以上要ります。**",
                   つぎ: "options に 語群を [\"…\",\"…\",\"…\"] と入れるか、"
                     + "空欄を 2 つ以上にしてください（空欄の答えが そのまま語群になります）。" };
        }
      }
    } else if (e === "reorder") {
      var its = Q配(a.items).map(function (x) {
        return Q文((x && typeof x === "object") ? x.text : x);
      }).filter(function (x) { return x.trim(); });
      if (its.length < 2) {
        return { だめ: 道 + "並べ替えには 項目が 2 つ以上要ります。",
                 つぎ: "items に **正しい順で** [\"…\",\"…\",\"…\"] と入れてください（画面では混ぜて出ます）。" };
      }
      q.orderItems = its.map(function (t, i) {
        return { id: "i" + (i + 1), text: t.slice(0, 300), order: i + 1 };
      });
      q.correctOrder = its.map(function (x, i) { return "i" + (i + 1); });
    } else if (e === "matching") {
      var ps = Q配(a.pairs);
      if (ps.length < 2) {
        return { だめ: 道 + "組み合わせには 対が 2 組以上要ります。",
                 つぎ: "pairs に [{\"left\":\"…\",\"right\":\"…\"}, …] の形で入れてください。" };
      }
      var L = [], R = [], C = {}, 空 = false;
      ps.forEach(function (p, i) {
        var l = Q文(p && p.left).trim(), r = Q文(p && p.right).trim();
        if (!l || !r) 空 = true;
        L.push({ id: "L" + (i + 1), text: l.slice(0, 200) });
        R.push({ id: "R" + (i + 1), text: r.slice(0, 200) });
        C["L" + (i + 1)] = "R" + (i + 1);
      });
      if (空) {
        return { だめ: 道 + "組み合わせの 左か右が空の組があります。",
                 つぎ: "pairs のすべてに left と right を入れてください。" };
      }
      Q配(a.extraRight).forEach(function (t, i) {
        R.push({ id: "R" + (ps.length + i + 1), text: Q文(t).slice(0, 200) });
      });
      q.pairs = { left: L, right: R, correct: C };
    } else if (e === "classification") {
      var gs = [], its2 = [];
      var gin = Q配(a.groups);
      var 入れ子 = gin.length && gin[0] && typeof gin[0] === "object"
        && (gin[0].items !== undefined || gin[0].name !== undefined || gin[0].label !== undefined);
      if (入れ子) {
        gin.forEach(function (g, i) {
          gs.push({ id: "g" + (i + 1), label: Q文(g.name || g.label).slice(0, 120) });
          Q配(g.items).forEach(function (t) {
            its2.push({ id: "t" + (its2.length + 1),
                        text: Q文((t && typeof t === "object") ? t.text : t).slice(0, 200),
                        groupId: "g" + (i + 1) });
          });
        });
      } else {
        gin.forEach(function (g, i) {
          gs.push({ id: "g" + (i + 1), label: Q文((g && typeof g === "object") ? (g.name || g.label) : g).slice(0, 120) });
        });
        Q配(a.items).forEach(function (it) {
          var o = (it && typeof it === "object") ? it : { text: it };
          var 名 = Q文(o.group || o.groupName || o.label).trim();
          var gi = -1;
          gs.forEach(function (g, k) { if (gi < 0 && g.label && g.label === 名) gi = k; });
          if (gi < 0 && 名) { gs.push({ id: "g" + (gs.length + 1), label: 名.slice(0, 120) }); gi = gs.length - 1; }
          its2.push({ id: "t" + (its2.length + 1), text: Q文(o.text).slice(0, 200),
                      groupId: gi >= 0 ? gs[gi].id : "" });
        });
      }
      if (gs.length < 2 || its2.length < 2) {
        return { だめ: 道 + "分類には 分け先 2 つ以上・項目 2 つ以上が要ります。",
                 つぎ: "groups に [{\"name\":\"動物\",\"items\":[\"犬\",\"猫\"]},{\"name\":\"植物\",\"items\":[\"桜\"]}] の形で入れてください。" };
      }
      q.classification = { groups: gs, items: its2 };
    } else if (e === "table_fill") {
      var T = a.table;
      if (!T || !Q配(T.rows).length) {
        return { だめ: 道 + "表の完成には table が要ります。",
                 つぎ: "table に {\"columns\":[\"年\",\"できごと\"],\"rows\":[{\"cells\":[{\"text\":\"1868\"},{\"answer\":\"明治維新\"}]}]} の形で入れてください。" };
      }
      var cols = Q配(T.columns).map(function (c, i) {
        return { id: "col" + (i + 1), text: Q文((c && typeof c === "object") ? c.text : c).slice(0, 120) };
      });
      if (cols.length < 1) cols = [{ id: "col1", text: "" }, { id: "col2", text: "" }];
      var 埋 = 0;
      var rows = Q配(T.rows).map(function (r, ri) {
        var cells = Q配(r && r.cells).map(function (c, ci) {
          var o = (c && typeof c === "object") ? c : { text: c };
          var ans = Q文(o.answer).trim();
          if (ans) 埋++;
          return { id: "r" + (ri + 1) + "c" + (ci + 1), text: Q文(o.text).slice(0, 200),
                   editable: !!ans, answer: ans.slice(0, 200),
                   acceptedAnswers: Q配(o.acceptedAnswers).map(Q文).slice(0, 6) };
        });
        return { id: "r" + (ri + 1), header: Q文(r && r.header).slice(0, 120), cells: cells };
      });
      if (!埋) {
        return { だめ: 道 + "埋めるますが 1 つもありません。",
                 つぎ: "cells のどれかに answer を入れてください（answer のあるますが 解答欄になります）。" };
      }
      q.table = { columns: cols, rows: rows };
    } else if (e === "chart_read") {
      var C2 = a.chart;
      if (C2) {
        var 種 = Q文(C2.kind || C2.type).toLowerCase();
        if (["bar", "line", "pie", "table", "scatter"].indexOf(種) < 0) 種 = "bar";
        var cats = Q配(C2.categories || C2.labels).map(function (x) { return Q文(x).slice(0, 60); });
        var ser = Q配(C2.series).map(function (s, i) {
          return { id: "s" + (i + 1), name: Q文(s && s.name) || ("系列" + (i + 1)),
                   values: Q配(s && s.values).map(function (v) { return Number(v); }) };
        });
        /* ★ 数が合わないまま作らない。
           実測（2026-08-16）: 値のカンマが落ちて [120180150] の 1 本になっていた。
           合わないときは **数を作り足さず**、正直に断る。 */
        var ずれ = ser.filter(function (s) {
          return s.values.length !== cats.length || s.values.some(function (v) { return !isFinite(v); });
        });
        if (cats.length < 2 || !ser.length || ずれ.length) {
          return { だめ: 道 + "図表の数が合いません（項目 " + cats.length + " 個に対して 値の数が違う系列があります）。",
                   つぎ: "**数を作り足さないでください。**categories と 各 series.values の数をそろえて入れ直してください。" };
        }
        q.chart = { kind: 種, title: Q文(C2.title).slice(0, 120), categories: cats, series: ser };
      }
      var cs4 = Q配(a.choices);
      if (cs4.length >= 2) {
        q.choices = 選択肢を作る(cs4);
        if (!q.choices.some(function (c) { return c.isCorrect; })) 正解をあてる(q.choices, a.answer);
        q.correctAnswer = "";
      } else {
        q.choices = [];
        q.correctAnswer = Q文(a.answer).slice(0, 200);
      }
    } else if (e === "dictation") {
      q.correctAnswer = Q文(a.answer || a.script).slice(0, 1000);
      if (!q.correctAnswer.trim()) {
        return { だめ: 道 + "書き取りには 書き取る正しい文（answer）が要ります。" };
      }
      q.script = Q文(a.script || a.answer).slice(0, 2000);
    } else if (e === "error_correction") {
      var cor = Q配(a.corrections);
      if (!cor.length && Q文(a.answer).trim() && Q文(a.wrong).trim()) {
        cor = [{ wrong: a.wrong, correct: a.answer }];
      }
      if (!cor.length) {
        return { だめ: 道 + "誤り訂正には どこが誤りかが要ります。",
                 つぎ: "corrections に [{\"wrong\":\"go\",\"correct\":\"goes\"}] の形で入れてください。"
                   + "wrong は **問題文の中にある語をそのまま**写してください。" };
      }
      q.errorSpans = cor.map(function (c, i) {
        var o = (c && typeof c === "object") ? c : { wrong: c };
        return { id: "e" + (i + 1), wrong: Q文(o.wrong).slice(0, 200),
                 correct: Q文(o.correct).slice(0, 200),
                 acceptedAnswers: Q配(o.acceptedAnswers).map(Q文).slice(0, 6) };
      });
    } else if (e === "free_text") {
      if (a.points === undefined) q.points = 10;
      q.correctAnswer = Q文(a.answer).slice(0, 2000);
      var rb = Q配(a.rubric);
      if (rb.length) {
        var items = rb.map(function (r, i) {
          var o = (r && typeof r === "object") ? r : { description: r };
          return { id: "r" + (i + 1),
                   description: Q文(o.description || o.label || o.text).slice(0, 200),
                   points: Number(o.points) || 0,
                   criterionId: Q文(o.criterionId) || "thinking_judgment_expression" };
        }).filter(function (x) { return x.description && x.points > 0; });
        if (items.length) {
          q.scoringRubric = { items: items };
          q.points = items.reduce(function (s2, x) { return s2 + x.points; }, 0);
        }
      }
      if (!q.scoringRubric || !Q配(q.scoringRubric.items).length) {
        try {
          q.scoringRubric = S && S.defaultRubric
            ? S.defaultRubric(id, q.points, { modelAnswer: q.correctAnswer }) : null;
        } catch (e7) { q.scoringRubric = null; }
      }
    } else if (e === "flashcard") {
      var cd = (a.card && typeof a.card === "object") ? a.card : {};
      q.card = { front: Q文(cd.front !== undefined ? cd.front : a.prompt).slice(0, 500),
                 back: Q文(cd.back !== undefined ? cd.back : a.answer).slice(0, 500) };
      if (!q.card.front.trim() || !q.card.back.trim()) {
        return { だめ: 道 + "カードには 表と裏が要ります。",
                 つぎ: "card に {\"front\":\"表に出す言葉\",\"back\":\"裏に出す答え\"} を入れてください。" };
      }
    } else if (e === "composite") {
      var kids = Q配(a.children);
      if (!kids.length) {
        return { だめ: 道 + "複合大問には 小問が 1 つ以上要ります。",
                 つぎ: "children に 小問を [{\"type\":\"…\",\"prompt\":\"…\", …}] の形で入れてください。" };
      }
      var 子 = [], 悪 = null;
      kids.slice(0, 30).forEach(function (c, i) {
        if (悪) return;
        var r = 問題を組む(c, 道 + "小問 " + (i + 1) + ": ");
        if (r.だめ) { 悪 = r; return; }
        子.push(r.q);
      });
      if (悪) return 悪;
      q.children = 子;
      q.context = Q文(a.context || a.prompt).slice(0, 4000);
    } else {
      /* text_input / numeric_input / そのほか（正解 1 本で答えるもの） */
      q.acceptedAnswers = Q配(a.answers).map(function (x) { return Q文(x).slice(0, 200); }).slice(0, 10);
      q.correctAnswer = Q文(a.answer).slice(0, 500);
      if (!q.correctAnswer.trim() && q.acceptedAnswers.length) q.correctAnswer = q.acceptedAnswers[0];
      if (!q.correctAnswer.trim()) {
        return { だめ: 道 + "「" + d.name + "」には 正解（answer）が要ります。" };
      }
      if (e === "numeric_input" && !isFinite(Number(q.correctAnswer.replace(/,/g, "")))) {
        return { だめ: 道 + "数値で答える形式ですが、正解「" + q.correctAnswer + "」が数値ではありません。",
                 つぎ: "数字だけを answer に入れるか、形式を 文字入力（word_input）にしてください。" };
      }
    }

    var q2;
    try { q2 = M.normalize(q); }
    catch (e9) {
      return { だめ: 道 + "この問題を組み立てられませんでした（" + Q文(e9 && e9.message).slice(0, 60) + "）。" };
    }
    var 指摘 = [];
    try { M.validateQuestion(q2, "問", 指摘, { strict: true }); } catch (e8) {}
    var 誤り = 指摘.filter(function (x) { return x && x.severity === "error"; });
    if (誤り.length) {
      return { だめ: 道 + "この問題は そのままでは出せません。**入れていません。**",
               足りないもの: 誤り.slice(0, 6).map(function (x) { return x.message; }),
               つぎ: "足りないものを入れて **もう一度 addQuestion を呼んでください。**"
                 + "入っていないので、作れたことにしないでください。" };
    }
    return { q: q2,
             注意: 指摘.filter(function (x) { return x && x.severity === "warning"; })
                     .slice(0, 3).map(function (x) { return x.message; }) };
  }

  /* ── 使える形式を見せる（166 種類あるので、絞って出す）───────────── */
  function listFormats(a) {
    var Q = QT2();
    if (!Q) return { だめ: "形式の一覧がありません。" };
    var w = Q文(a && a.keyword).trim();
    var 一覧;
    try {
      一覧 = w ? Q.search(w, { availableOnly: true }) : Q.list({ availableOnly: true });
    } catch (e) { 一覧 = []; }
    if (!一覧.length && w) {
      return { だめ: "「" + w + "」に当たる形式はありません。",
               つぎ: "keyword なしで もう一度呼ぶと、よく使うものから並べます。" };
    }
    var 出 = [], 断 = [];
    一覧.forEach(function (d) {
      if (声で作れない[d.engine]) { if (断.length < 6) 断.push(d.name); return; }
      出.push(d.id + "（" + d.name + "・" + d.description.slice(0, 26) + "）");
    });
    return { 使える形式: 出.slice(0, w ? 30 : 60),
             全部で: 出.length + " 種類",
             声からは作れないもの: 断.length ? 断.join("・") + "（画像が要ります）" : "なし",
             つぎ: "この id を addQuestion の type に そのまま入れてください。"
               + "利用者が形式を言わないときは、内容に合うものを **自分で選んで** ください。"
               + "毎回 4 択にしないこと。" };
  }

  /* ── 入れ物を 1 つ作る ───────────────────────────────────────── */
  function startDraft(a) {
    var S = root.VQ2 && VQ2.schema;
    if (!S || !VQ2.store) return { だめ: "問題を入れる場所がありません。" };
    if (作り中.p && Q配(作り中.p.questions).length) {
      return { だめ: "「" + Q文(作り中.p.name) + "」の下書きが まだ保存されていません（"
                 + 作り中.p.questions.length + " 問）。",
               つぎ: "先に saveDraft で保存してください。捨ててよいなら discardDraft を呼びます。" };
    }
    var 題 = Q文(a && a.title).trim().slice(0, 80);
    if (!題) return { だめ: "何のプリセットか、title を入れてください。" };
    var p = S.emptyPreset({ name: 題, description: Q文(a && a.description).slice(0, 400) });
    p.questions = [];
    作り中.p = p;
    var n = Math.floor(Number(a && a.count));
    作り中.ねらい = (isFinite(n) && n > 0 && n <= 100) ? n : 0;
    return { 始めた: 題,
             目標: 作り中.ねらい ? 作り中.ねらい + " 問" : "（数は決めていない）",
             つぎ: "**ここから addQuestion を " + (作り中.ねらい || "必要な数") + " 回 続けて呼びます。**"
               + "1 問ごとに利用者へ確かめないでください。喋って番を終えないでください。"
               + "ぜんぶ入れ終わってから saveDraft を **1 回だけ** 呼ぶと、"
               + "**1 つのプリセットに 全問** 入ります。" };
  }

  function addQuestion(a) {
    a = a || {};
    if (!作り中.p) {
      var 題 = Q文(a.presetTitle).trim();
      if (!題) {
        return { だめ: "まだ入れ物がありません。",
                 つぎ: "先に startDraft を呼んで、プリセットの題名を決めてください。" };
      }
      var r0 = startDraft({ title: 題 });
      if (r0.だめ) return r0;
    }
    var qs = 作り中.p.questions;
    if (qs.length >= 100) {
      return { だめ: "1 つのプリセットに入れられるのは 100 問までです。",
               つぎ: "saveDraft で保存してから、別の入れ物を作ってください。" };
    }
    var r = 問題を組む(a, "");
    if (r.だめ) return r;
    /* ★ つなぎ直しのあと 同じ問題が 2 回入るのを止める（2026-08-17）。
       実測: 作っている途中に 1008 で切れることがあり、
       そのとき Lumi は 同じ道具を もう一度呼ぶ。黙って重ねない。 */
    var 見出し = 問題の見出し(r.q);
    var 同じ番 = -1;
    if (見出し) qs.forEach(function (x, k) {
      if (同じ番 < 0 && x.type === r.q.type && 問題の見出し(x) === 見出し) 同じ番 = k;
    });
    if (同じ番 >= 0) {
      return { だめ: "同じ問題が すでに " + (同じ番 + 1) + " 問目に入っています。**入れていません。**",
               いま: qs.length + " 問",
               つぎ: "作り直しではなく、**次の問題**へ進んでください。"
                 + "直したいなら editQuestion に number を付けて呼びます。" };
    }
    qs.push(r.q);
    var Q = QT2();
    var のこり = 作り中.ねらい ? 作り中.ねらい - qs.length : 0;
    /* ★ 同じ形式が続いたら **その場で数えて見せる**（2026-08-17）。
       訴え「毎回 4 択になる」。文でお願いするだけでは偏るので、
       作っている最中に 数字で知らせる。4択と3択は 同じ仲間として数える。 */
    var 仲間 = function (q) {
      try { return q.engine || Q.engineOf(q.type) || q.type; } catch (e) { return q.type; }
    };
    var 続き = 0, 今 = 仲間(r.q);
    for (var i = qs.length - 1; i >= 0 && 仲間(qs[i]) === 今; i--) 続き++;
    var 偏り = 続き >= 3
      ? "**同じ仲間の形式が " + 続き + " 問 続いています。次は 別の形式にしてください。**" : "";
    return { 入れた: qs.length + " 問目（" + Q.label(r.q.type) + "）",
             問題文: 問題の見出し(r.q),
             いま: qs.length + " 問",
             これまでの形式: 形式の内訳(qs),
             注意: (r.注意 && r.注意.length) ? r.注意 : undefined,
             つぎ: (のこり > 0
               ? "あと " + のこり + " 問です。**続けて addQuestion を呼んでください。**"
                 + "ここで喋って番を終えないでください。確認も要りません。"
               : "そろったら saveDraft を呼んで、1 つのプリセットとして保存してください。") + 偏り };
  }

  function draftStatus() {
    var p = 作り中.p;
    if (!p || !Q配(p.questions).length) {
      return { 下書き: "まだ 1 問も入っていません",
               つぎ: "startDraft で入れ物を作ってから addQuestion を呼びます。" };
    }
    var Q = QT2();
    return { 題名: p.name, いま: p.questions.length + " 問",
             目標: 作り中.ねらい ? 作り中.ねらい + " 問" : "（数は決めていない）",
             中身: p.questions.slice(0, 30).map(function (q, i) {
               return (i + 1) + ". [" + Q.label(q.type) + "] " + 問題の見出し(q);
             }),
             形式の内訳: 形式の内訳(p.questions),
             つぎ: "直すなら editQuestion、消すなら removeQuestion、"
               + "そろったら saveDraft です。**まだ保存していません。**" };
  }

  function editQuestion(a) {
    a = a || {};
    var p = 作り中.p;
    if (!p || !Q配(p.questions).length) {
      return { だめ: "直せる下書きがありません。",
               つぎ: "保存済みのプリセットを直すなら editPresetQuestions を使ってください。" };
    }
    var n = Math.floor(Number(a.number));
    if (!(n >= 1 && n <= p.questions.length)) {
      return { だめ: "何問目かを number で入れてください（いま " + p.questions.length + " 問）。" };
    }
    var 前 = p.questions[n - 1];
    var Q = QT2();
    /* 形式もろとも作り直すか、文だけ直すか。
       type が来ていれば作り直し。来ていなければ 元の形式のまま。 */
    var b = {};
    for (var k in a) if (a.hasOwnProperty(k)) b[k] = a[k];
    if (!Q文(b.type).trim()) b.type = 前.type;
    /* 部分的な直し（解説だけ・問題文だけ）で 中身を落とさない */
    var 中身の鍵 = ["choices", "answer", "answers", "blanks", "items", "groups",
                    "pairs", "table", "chart", "card", "corrections", "children"];
    var 中身が来た = 中身の鍵.some(function (key) { return b[key] !== undefined; });
    if (!中身が来た && Q文(b.type) === 前.type) {
      /* 骨はそのまま。文だけ差し替える。 */
      var 変 = [];
      if (b.prompt !== undefined && Q文(b.prompt).trim()) { 前.prompt = Q文(b.prompt).slice(0, 2000); 変.push("問題文"); }
      if (b.explanation !== undefined) { 前.explanation = Q文(b.explanation).slice(0, 4000); 変.push("解説"); }
      if (b.topic !== undefined) { 前.topic = Q文(b.topic).slice(0, 120); 変.push("分野"); }
      if (b.hint !== undefined) { 前.hint = Q文(b.hint).slice(0, 600); 変.push("ヒント"); }
      if (b.difficulty !== undefined) { 前.difficulty = 難しさ(b.difficulty); 変.push("難しさ"); }
      if (!変.length) {
        return { だめ: "何を直すかが入っていません。",
                 つぎ: "prompt / explanation / choices などを入れて もう一度呼んでください。" };
      }
      return { 直した: n + " 問目の " + 変.join("・"),
               いま: 問題の見出し(前),
               つぎ: "**まだ保存していません。**続けて直すか、saveDraft を呼んでください。" };
    }
    var r = 問題を組む(b, n + " 問目: ");
    if (r.だめ) return r;
    r.q.id = 前.id;
    p.questions[n - 1] = r.q;
    return { 直した: n + " 問目（" + Q.label(r.q.type) + "）",
             いま: 問題の見出し(r.q),
             つぎ: "**まだ保存していません。**続けて直すか、saveDraft を呼んでください。" };
  }

  function removeQuestion(a) {
    var p = 作り中.p;
    if (!p || !Q配(p.questions).length) return { だめ: "消せる下書きがありません。" };
    var n = Math.floor(Number(a && a.number));
    if (!(n >= 1 && n <= p.questions.length)) {
      return { だめ: "何問目かを number で入れてください（いま " + p.questions.length + " 問）。" };
    }
    var 消 = p.questions.splice(n - 1, 1)[0];
    return { 消した: n + " 問目「" + 問題の見出し(消) + "」",
             のこり: p.questions.length + " 問",
             つぎ: "**まだ保存していません。**" };
  }

  function discardDraft(a) {
    var p = 作り中.p;
    if (!p) return { だめ: "捨てる下書きがありません。" };
    if (!(a && a.sure === true)) {
      return { だめ: "「" + Q文(p.name) + "」の " + Q配(p.questions).length + " 問が消えます。",
               つぎ: "利用者に 声で確かめて、いいと言われてから sure=true で もう一度呼んでください。" };
    }
    var 名 = Q文(p.name), 数 = Q配(p.questions).length;
    作り中.p = null; 作り中.ねらい = 0;
    return { 捨てた: "「" + 名 + "」（" + 数 + " 問）" };
  }

  /* ── 1 回だけ保存する（＝1 プリセットに全問）───────────────────── */
  function saveDraft(a) {
    var p = 作り中.p;
    if (!p || !Q配(p.questions).length) {
      return Promise.resolve({ だめ: "保存できる下書きがありません。まだ 1 問も入っていません。",
                               つぎ: "できたと言わないでください。" });
    }
    var S2 = root.VQ2 && VQ2.store;
    if (!S2) return Promise.resolve({ だめ: "保存する場所がありません。" });
    var 題 = Q文(a && a.title).trim();
    if (題) p.name = 題.slice(0, 80);
    try { if (VQ2.draft && VQ2.draft.stampNumbers) VQ2.draft.stampNumbers(p.questions); } catch (e) {}
    var res = null;
    try { res = S2.savePreset(p); }
    catch (e2) { res = { ok: false, message: Q文(e2 && e2.message).slice(0, 80) }; }
    if (!res || !res.ok) {
      var 理由 = ((res && res.issues) || []).filter(function (x) { return x && x.severity === "error"; })
        .slice(0, 5).map(function (x) { return x.path + ": " + x.message; });
      return Promise.resolve({
        だめ: "保存できませんでした（" + Q文((res && (res.message || res.error)) || "不明") + "）。",
        直せなかった理由: 理由.length ? 理由 : undefined,
        つぎ: "**保存できていません。**上の理由に当たる問を editQuestion で直してから、"
          + "もう一度 saveDraft を呼んでください。できたと言わないでください。" });
    }
    /* ★ 本当に入ったかを **読み直して** 確かめる。savePreset の ok だけでは足りない。 */
    var 後 = null;
    try { 後 = S2.getPreset(p.id, {}); } catch (e3) {}
    if (!後 || !Q配(後.questions).length) {
      return Promise.resolve({ だめ: "保存したはずですが、読み直すと見つかりません。",
                               つぎ: "できたと言わないでください。" });
    }
    var 名 = Q文(後.name), 数 = 後.questions.length;
    作り中.p = null; 作り中.ねらい = 0;
    /* ★ 作ったものを **画面に出す**。
       ここを開かないと、利用者は何も見えないまま「できました」と言われる。
       finishTask は「画面に出ている言葉」を証拠に求めるので、その足場にもなる。 */
    var 開いた = false;
    try { 開いた = !!openScreen("presets"); } catch (e4) {}
    return settle(1400).then(function () {
      var 見えた = false;
      try { 見えた = !!onScreenNow(名).ある; } catch (e5) {}
      return { 保存した: "「" + 名 + "」に " + 数 + " 問",
               形式の内訳: 形式の内訳(後.questions),
               一覧に出した: 開いた ? (見えた ? "はい（画面に出ています）" : "開きましたが、まだ一覧に見えません") : "いいえ",
               つぎ: "**1 つのプリセットに " + 数 + " 問 入りました。**"
                 + "題名と問題数を 一言で伝えてください。"
                 + (見えた ? "終わりに finishTask を呼ぶなら evidence は「" + 名 + "」です。"
                          : "画面にまだ出ていないなら waitFor で待ってから確かめてください。") };
    });
  }

  /* ══ 資料をつける（2026-08-17）══════════════════════════════════════
     ★ 「資料を添付できるようにすれば、それを Live が読んで、その資料について
       答えたり、その資料に関するプリセットを作れるようになる」。
     ★ 取り出しは アプリが既に持っている道（__vqChatFiles）を使う。
       PDF・DOCX・ZIP・CSV・テキスト・コード まで そのまま読める。
       ただし **Quick Chat の下書きを汚さない**ように、
       ここで足したものは 読み取ったら すぐ外す。
     ★ 中身を 丸ごと会話へ流さない。長い資料は 数十万字あり、
       流すと会話が壊れる（実測で 40MB が詰まった前がある）。
       ここに置いておいて、readAttachment で **要るところだけ** 読ませる。
     ★ 画像は 文字が取れないので、**絵のまま** realtimeInput で送る
       （キャストと同じ口。番の区切りを壊さないことは実測済み）。 */
  var 資料 = [];

  function 資料の見出し() {
    return 資料.map(function (r, i) {
      return (i + 1) + ". 「" + r.名 + "」（" + (r.絵 ? "画像" : r.種 + "・" + r.文字数 + " 字"
        + (r.ページ ? "・" + r.ページ + " ページ" : "")) + "）";
    });
  }

  function 絵を送る(file, 名) {
    try {
      var url = root.URL.createObjectURL(file);
      var img = new root.Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 1, h = img.naturalHeight || 1;
          var 倍 = Math.min(1, 1024 / Math.max(w, h));
          var cv = doc.createElement("canvas");
          cv.width = Math.max(1, Math.round(w * 倍));
          cv.height = Math.max(1, Math.round(h * 倍));
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          var b64 = cv.toDataURL("image/jpeg", 0.82).split(",")[1];
          if (st.ws && st.ws.readyState === 1 && b64) {
            st.ws.send(JSON.stringify({ realtimeInput: {
              video: { mimeType: "image/jpeg", data: b64 } } }));
            資料.push({ 名: 名, 種: "画像", 文字数: 0, ページ: 0, 本文: "", 絵: true });
          }
        } catch (e) {}
        try { root.URL.revokeObjectURL(url); } catch (e2) {}
      };
      img.onerror = function () { try { root.URL.revokeObjectURL(url); } catch (e3) {} };
      img.src = url;
    } catch (e4) {}
  }

  /* 知らせは **相手が黙るまで待ってから** 出す。
     ★ 実測（2026-08-17）: つけた直後に出したら、Lumi が挨拶を喋っている
       最中で、知らせがその番に飲み込まれ、**資料を一度も読まなかった**。
       喋っている・返事を組み立てている・こちらが喋っている の間は出さない。
     ★ 繋がる前につけられることもあるので、繋がるのも待つ。 */
  function 資料の知らせ(文) {
    var 始 = Date.now();
    clearInterval(st.資料見張り);
    var 出す = function () {
      try {
        st.ws.send(JSON.stringify({ clientContent: {
          turns: [{ role: "user", parts: [{ text: 文 }] }], turnComplete: true } }));
        return true;
      } catch (e) { return false; }
    };
    var 空いている = function () {
      return !!(st.ws && st.ws.readyState === 1 && !st.speaking && !st.inTurn && !st.heard);
    };
    if (空いている()) { 出す(); return; }
    st.資料見張り = setInterval(function () {
      if (空いている()) { clearInterval(st.資料見張り); 出す(); return; }
      /* 90 秒 空かなければ、ふさがっていても出す（黙って捨てない） */
      if (Date.now() - 始 > 90000) {
        clearInterval(st.資料見張り);
        if (st.ws && st.ws.readyState === 1) 出す();
      }
    }, 700);
  }

  function 資料を取り込む(files) {
    var F = root.__vqChatFiles;
    if (!F || !F.add) { say("この端末では 資料を読めません"); return; }
    var 前 = {};
    try { F.list().forEach(function (x) { 前[x.id] = 1; }); } catch (e) {}
    var 名前 = Array.prototype.slice.call(files).map(function (f) { return f.name; });
    作業開始("資料を読んでいます");
    say(名前.length === 1 ? "「" + 名前[0] + "」を読むね" : 名前.length + " 件 読むね");

    var 取り出す = function (mine) {
      作業終了();
      var 入 = [], 駄目 = [];
      mine.forEach(function (x) {
        if (x.status === "failed" || x.status === "cancelled") {
          駄目.push(x.name + "（" + String(x.error || "読めませんでした").slice(0, 40) + "）");
        } else if (x.kind === "image" && x.file) {
          絵を送る(x.file, x.name); 入.push(x.name + "（画像）");
        } else if (String(x.text || "").trim()) {
          資料.push({ 名: x.name, 種: x.kind, 文字数: String(x.text).length,
                      ページ: x.pageCount || 0, 本文: String(x.text) });
          入.push(x.name);
        } else {
          駄目.push(x.name + "（文字が取れませんでした。写しの PDF かもしれません）");
        }
        try { F.remove(x.id); } catch (e2) {}
      });
      if (st.barClip) st.barClip.className = 資料.length ? "clip on" : "clip";
      if (!入.length) {
        say("読めませんでした");
        資料の知らせ("【資料をつけようとしたが 読めませんでした】" + 駄目.join(" / ")
          + "。利用者に そのまま正直に伝えて、別の形（PDF か テキスト）で もらえないか聞いてください。");
        return;
      }
      say(入.length + " 件 読めたよ");
      資料の知らせ("【資料がつきました】" + 資料の見出し().join(" / ")
        + (駄目.length ? "／読めなかったもの: " + 駄目.join("・") : "")
        + "。\n中身は **readAttachment** で読めます（number でどれか、from / to で何字目からか）。"
        + "**まず 1 つめの頭を読んで、何の資料かを 一言で伝えてください。**"
        + "そのあと「これで問題を作ろうか？」と誘ってください。"
        + "問題を頼まれたら、**資料を読んでから** startDraft → addQuestion で作ります。"
        + "読まずに 知っていることだけで作ってはいけません。");
    };

    Promise.resolve(F.add(files)).then(function () {
      var 始 = Date.now();
      var みる = function () {
        var mine = [];
        try { mine = F.list().filter(function (x) { return !前[x.id]; }); } catch (e) {}
        var 済 = mine.filter(function (x) {
          return x.status === "ready" || x.status === "warning"
            || x.status === "failed" || x.status === "cancelled";
        });
        if (mine.length && 済.length === mine.length) return 取り出す(mine);
        if (Date.now() - 始 > 180000) return 取り出す(mine);
        setTimeout(みる, 600);
      };
      setTimeout(みる, 600);
    }, function () { 作業終了(); say("資料を読めませんでした"); });
  }

  function readAttachment(a) {
    if (!資料.length) {
      return { だめ: "まだ 資料がついていません。",
               つぎ: "会話の帯にある クリップの印から 資料をつけてもらってください。"
                 + "**資料を読んだふりをしないでください。**" };
    }
    var n = Math.floor(Number(a && a.number));
    if (!(n >= 1 && n <= 資料.length)) {
      return { ついている資料: 資料の見出し(), 件数: 資料.length,
               つぎ: "number でどれを読むか決めてください（from・to で 何字目からかも決められます）。" };
    }
    var r = 資料[n - 1];
    if (r.絵) {
      return { 資料: r.名, 種: "画像",
               つぎ: "画像は すでに あなたへ送ってあります。見えたものを そのまま話してください。"
                 + "見えていないなら「見えない」と正直に言ってください。" };
    }
    var 上限 = 6000;
    var from = Math.max(0, Math.floor(Number(a && a.from) || 0));
    var to = Math.floor(Number(a && a.to) || (from + 上限));
    if (to - from > 上限) to = from + 上限;
    if (to <= from) to = from + 上限;
    var 本 = r.本文.slice(from, to);
    var 端 = Math.min(to, r.文字数);
    return { 資料: r.名, 全体: r.文字数 + " 字", 読んだ範囲: from + " 〜 " + 端 + " 字目",
             中身: 本,
             つづき: 端 < r.文字数
               ? "まだ " + (r.文字数 - 端) + " 字 残っています（from=" + 端 + " で続きが読めます）"
               : "ここで終わりです",
             つぎ: 端 < r.文字数
               ? "問題を作るなら **要るところまで読んでから** 作ってください。"
                 + "読んでいない所から 問題を作ってはいけません。"
               : "ぜんぶ読みました。" };
  }

  /* ══ **まだ動いているのに「終わった」と言わせない**（2026-08-17）═══════
     ★ 訴え「タスクが終わってもいないのに 終わったと認識し、
       処理中なのにホームに戻ってしまう」。
     ★ おおもとは 1 つ。終わりの判定が **走っているものを見ていなかった**。
       「いま走っているもの」をここ 1 か所にまとめ、
       finishTask（終わったと言う口）と ホームへ戻る の 両方から見る。
     ★ ここに入れるのは **Lumi 自身が始めて、まだ片づいていないもの** だけ。
       クイズの途中は入れない（「クイズを始めて」が目的のときは
       途中で止まっているのが 正しい姿だから）。 */
  function まだ動いている() {
    var 理由 = [];
    try {
      if (作り中.p && Q配(作り中.p.questions).length) {
        理由.push("「" + Q文(作り中.p.name) + "」の下書きに " + 作り中.p.questions.length
          + " 問 入っていますが、**まだ保存していません**（saveDraft を呼んでください）");
      }
    } catch (e) {}
    try {
      var P = root.VQ2 && VQ2.presetNow;
      if (P && typeof P.生成中 === "function" && P.生成中()) {
        理由.push("プリセット「" + Q文(P.name) + "」を **いま作っている途中**です"
          + "（waitFor で 出来上がるのを待ってください）");
      }
    } catch (e2) {}
    return 理由;
  }

  /* ══ 問題を作る（2026-08-16 に作り直した・監査で見つかった 最大の嘘）══
     ★ 前は VQ2.presetStudio.open() を呼んだ **その瞬間に true** を返していた。
       欄へ文字を入れるのは 0.9 秒後、「作る」を押すのは さらに 0.5 秒後。
       afterAct は 0.42 秒で答えるので、**1 文字も入っていない時点で
       「作りました」** になっていた。欄やボタンが見つからなければ
       黙って何もしないまま、それでも「やった」と返っていた。
     ★ いまは **入ったこと・押せたことを見届けてから** 返す。
       途中で見つからなければ、そこまでを正直に返す。 */
  function makePreset(text) {
    if (!root.VQ2 || !VQ2.presetStudio) return { だめ: "問題を作る画面がありません。" };
    var want = String(text || "").trim();
    try { VQ2.presetStudio.open({}); } catch (e) { return { だめ: "作る画面を開けませんでした。" }; }
    if (!want) {
      return settle(1500).then(function () {
        return { 開いた: "問題を作る画面",
                 つぎ: "**まだ作っていません。**何を作るかを instruction に入れて もう一度呼ぶか、"
                   + "lookScreen で見て 自分で入れてください。" };
      });
    }
    var 深く = function (sel, 判) {
      var 出 = null;
      var scan = function (r) {
        try {
          r.querySelectorAll(sel).forEach(function (e) { if (!出 && (!判 || 判(e))) 出 = e; });
          r.querySelectorAll("*").forEach(function (e) { if (e.shadowRoot) scan(e.shadowRoot); });
        } catch (e2) {}
      };
      scan(doc);
      return 出;
    };
    /* 欄が描かれるまで、少しずつ待って 探し直す（決め打ちの 0.9 秒に頼らない） */
    var 探して入れる = function (のこり) {
      var box = 深く("textarea", function (e) {
        var b = e.getBoundingClientRect();
        return b.width > 150 && /指示|作りたい/.test(e.placeholder || "");
      });
      if (!box) {
        if (のこり <= 0) {
          return Promise.resolve({ だめ: "作る画面は開きましたが、**指示を入れる欄が見つかりません**。"
                                     + "まだ 1 問も作っていません。",
                                   つぎ: "できたと言わないでください。"
                                     + "lookScreen で画面を見て、入力欄を探して typeInto で入れてください。" });
        }
        return new Promise(function (ok) { setTimeout(ok, 300); })
          .then(function () { return 探して入れる(のこり - 1); });
      }
      try {
        box.focus();
        var set = Object.getOwnPropertyDescriptor(root.HTMLTextAreaElement.prototype, "value").set;
        set.call(box, want);
        box.dispatchEvent(new Event("input", { bubbles: true }));
        box.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {}
      if (String(box.value || "").indexOf(want.slice(0, 12)) < 0) {
        return Promise.resolve({ だめ: "指示を欄へ入れられませんでした。まだ作っていません。",
                                 つぎ: "できたと言わないでください。lookScreen から typeInto で入れてください。" });
      }
      /* 「作る」を押す */
      return new Promise(function (ok) { setTimeout(ok, 350); }).then(function () {
        var go = 深く('[aria-label="作る"], .vq2-tlc-send', function (b) { return !b.disabled; });
        if (!go) {
          return { だめ: "指示は入れましたが、**「作る」のボタンが押せません**。まだ作っていません。",
                   入れた: want.slice(0, 60),
                   つぎ: "できたと言わないでください。lookScreen で見て、作るボタンを tapItem で押してください。" };
        }
        try { go.click(); } catch (e) {}
        return settle(2500).then(function () {
          return { やった: "問題を作りはじめました（" + want.slice(0, 40) + "）",
                   つぎ: "**まだ出来上がっていません。**作るのに数十秒かかります。"
                     + "waitFor で「完了」や問題の一覧が出るのを待ってから、できたと伝えてください。" };
        });
      });
    };
    return settle(1200).then(function () { return 探して入れる(6); });
  }

  function searchApp(q) {
    try {
      if (root.__vqCmdk && root.__vqCmdk.open) { root.__vqCmdk.open(String(q || "")); return true; }
    } catch (e) {}
    return false;
  }

  function timerSet(a) {
    try {
      var T = root.VQ2 && VQ2.timer;
      if (!T) return false;
      var ms = ((Number(a.hours) || 0) * 3600 + (Number(a.minutes) || 0) * 60
        + (Number(a.seconds) || 0)) * 1000;
      if (ms < 1000) return false;
      T.setTotal(T.read(), ms);
      if (root.VQ2.timerUi) { VQ2.timerUi.open(); VQ2.timerUi.paintBar(); }
      return true;
    } catch (e) { return false; }
  }
  function timerControl(act) {
    try {
      var T = root.VQ2 && VQ2.timer;
      if (!T) return false;
      var s0 = T.read();
      if (act === "start") T.start(s0);
      else if (act === "pause") T.pause(s0);
      else if (act === "reset") T.reset(s0);
      else if (act === "countdown") T.setKind(s0, "countdown");
      else if (act === "stopwatch") T.setKind(s0, "stopwatch");
      else return false;
      if (root.VQ2.timerUi) VQ2.timerUi.paintBar();
      return true;
    } catch (e) { return false; }
  }

  /* 設定を変える。**変えられるのは この表に書いたものだけ。** */
  function setSetting(key, value) {
    var MAP = {
      theme: ["display.theme", { auto: "AUTO", light: "LIGHT", dark: "DARK" }],
      fontSize: ["display.fontSize", { small: "SMALL", "default": "DEFAULT", large: "LARGE" }],
      accent: ["display.accent", null],
      radius: ["display.radius", null],
      animations: ["display.animations", "bool"],
      questionCount: ["learn.questionCount", "num"],
      questionTime: ["learn.examTime", "num"],
      autoNext: ["learn.autoNext", "bool"],
      sound: ["sound.sfx", "bool"],
      bgm: ["sound.bgm", "bool"]
    };
    var row = MAP[String(key || "")];
    if (!row) return false;
    var v = String(value == null ? "" : value).toLowerCase().trim();
    var out;
    if (row[1] === "bool") out = /^(on|true|入|オン|つけて|有効)$/.test(v) ? true : false;
    else if (row[1] === "num") { out = Math.floor(Number(v)); if (!isFinite(out)) return false; }
    else if (row[1]) { out = row[1][v]; if (out === undefined) return false; }
    else out = v;
    try {
      var S = root.__vqSet;
      if (!S || !S.set) return false;
      return S.set(row[0], out) !== false;
    } catch (e) { return false; }
  }

  /* 自分の声の大きさを変える（1 = ふつう / 0.3 = 小さく） */
  function duck(v) {
    try {
      if (!st.duck || !st.ctx) return;
      var t = st.ctx.currentTime;
      st.duck.gain.cancelScheduledValues(t);
      st.duck.gain.setTargetAtTime(v, t, 0.05);
    } catch (e) {}
  }

  /* ══ いきなり喋らなくなるのを防ぐ 見張り（2026-08-16）════════════
     ★ 訴え「一定時間すると いきなり喋らなくなる」。
       止めた（muted）まま解けなくなると、こちらの声が 1 かたまりも
       届かなくなり、**完全な無反応**になる。原因が何であれ、
       ここで必ず解く。解いたことは記録に残す。 */
  function watchStuck() {
    clearInterval(st.iStuck);
    clearInterval(st.iSync);
    st.iStuck = setInterval(function () {
      if (!st.on) return;
      if (!st.speaking) { st.muteFrom = 0; return; }
      if (!st.muteFrom) { st.muteFrom = Date.now(); return; }
      var 経過 = Date.now() - st.muteFrom;
      var 音が来ていない = Date.now() - (st.audioAt || 0) > 8000;
      if (経過 > 45000 && 音が来ていない && (st.spkMs || 0) < 200) {
        noteEv("✗ 45 秒 黙ったままだった → こちらから開け直す");
        st.muteFrom = 0; st.waitSpk = 0;
        setMuted(false); talkEdge(false);
        if (st.on) say("聞いています");
      }
      /* ★ 3 分 → 10 分（2026-08-20）。
         Live は **こちらが 話しかけない限り 何も 送ってこない**。
         「3 分 届かない＝死んでいる」は 誤りで、板を 読んでいる間や
         問題を 解いている間に **3 分おきに 繋ぎ替えて**いた。
         繋ぎ替えるたび マイクを 取り直すので、そのたびに 途切れる。
         ほんとうに 死んでいれば 話しかけたときに 返事が 来ないので、
         そちらで 気づける（上の 45 秒の 見張り）。 */
      if (Date.now() - (st.aliveAt || st.openAt || Date.now()) > 600000) {
        noteEv("✗ 10 分 何も届かない → 繋ぎ直す");
        st.aliveAt = Date.now();
        try { if (st.ws) st.ws.close(); } catch (e) {}
      }
    }, 5000);
  }

  function setMuted(on) {
    var 前は喋っていた = !!st.speaking;
    st.speaking = !!on;
    /* ★ **喋り終わった瞬間**に、いまの画面をそっと置く（2026-08-16）。
       turnComplete では早すぎる。あの時点では 音がまだ何十秒も
       鳴り残っていて（st.speaking が真のまま）、置く条件に一生入らない。
       実測: 置いた回数 0 回。ここが正しい合図。 */
    if (前は喋っていた && !st.speaking) {
      setTimeout(function () { try { 画面をそっと置く(); } catch (e) {} }, 600);
    }
    try { st.micNode.port.postMessage({ type: "mute", on: !!on || 手で止めているか() }); } catch (e) {}
    /* ★ **止めっぱなしにしない**（保険）。
       返事が途中で切れたときなど、解除の知らせが来ないことがある。
       そのままだと、こちらの声が永久に届かない（＝完全に無反応）。 */
    if (st.tMute) { clearTimeout(st.tMute); st.tMute = 0; }
    if (on) {
      /* ★ **まだ音が届いているなら 開けない**（2026-08-16）。
         長い返事は 15 秒を超える。途中で開けると回り込みを送り返して
         向こうに止められる。届かなくなってから 3 秒たったときだけ開ける。 */
      var 保険 = function () {
        if (!st.on || !st.speaking) return;
        if (Date.now() - (st.audioAt || 0) < 3000) {
          st.tMute = setTimeout(保険, 3000);
          return;
        }
        /* ★ **まだ鳴らし残しがあるなら 開けない**（2026-08-16）。
           前は「音が届かなくなって 3 秒」だけを見ていたので、
           手元に十数秒ぶん残っていても開けてしまい、
           自分の声を送り返して **向こうに止められていた**
           （＝長い返事が途中で切れる）。 */
        /* ★ ただし **待ち続けない**（2026-08-16）。残量の数字は worklet が
           答えて初めて新しくなるので、繋ぎ替えなどで答えが来なくなると
           古い数字のまま止まり、**マイクが二度と開かない**
           （＝いきなり喋らなくなる）。30 秒で必ず打ち切る。 */
        st.waitSpk = (st.waitSpk || 0) + 1;
        if ((st.spkMs || 0) > 200 && st.waitSpk <= 20) {
          st.tMute = setTimeout(保険, 1500);
          return;
        }
        if (st.waitSpk > 20) noteEv("✗ 鳴らし残しの数字が止まっていた → マイクを開ける");
        st.waitSpk = 0;
        setMuted(false); talkEdge(false);
        if (st.on) say("聞いています");
      };
      st.tMute = setTimeout(保険, 60000);   /* 最後の砦。長い返事でも切らない */
    }
  }
  /* ══ 黙っていたら切る ═══════════════════════════════════════════
     ★ **Lumi が話している間は数えない**（2026-08-15 に直した）。
       前は話している最中も時計が動いていたので、返事が 8 秒を超えると
       **喋っている途中で切れて**いた。長い説明ほど切れる、という嫌な形。
     ★ こちらが声を出している間も数えない。
       文字起こしが届くのは少し遅れるので、それを待っていると
       ゆっくり話す人ほど切られる。**音の大きさ**で見る。 */
  function armSilence(ms) {
    st.silenceMs = ms || SILENCE_MS;
    st.silenceAt = Date.now();
    if (!st.tSilence) {
      st.tSilence = setInterval(function () {
        if (!st.on) return;
        /* Lumi が話している / こちらが声を出している間は、時計を進めない */
        /* ★ 文字を打っている間は 黙っていても切らない。
           入力欄を開くとマイクを止めるので、そのままだと
           **書いている途中で切れる**（実測せずとも確実に起きる筋）。 */
        if (st.barOn) { st.silenceAt = Date.now(); return; }
        if (st.speaking || st.heard) { st.silenceAt = Date.now(); return; }
        /* ★ 声を出していなくても **使っている**ことは ある（2026-08-20）。
           打っている／板を 解説している／道具が 動いた ばかり、は
           「黙っている」では ない。ここを 数えないと、
           勉強している 最中に 静かに 終わる。 */
        try { if (打っている最中か()) { st.silenceAt = Date.now(); return; } } catch (e0) {}
        if (解説) { st.silenceAt = Date.now(); return; }
        if (Date.now() - (st.最後の道具時 || 0) < 90000) { st.silenceAt = Date.now(); return; }
        /* 一度でも話したあとは、黙っていても 5 分は続ける。 */
        var lim = st.talked ? SILENCE_AFTER_MS : st.silenceMs;
        if (Date.now() - st.silenceAt < lim) return;
        clearInterval(st.tSilence); st.tSilence = 0;
        say("またね");
        talkEdge(false);
        setTimeout(close, 1100);
      }, 400);
    }
  }

  /* ══ 終わる（フワッと消す）═══════════════════════════════════════ */
  /* ══ 会話を 閉じたら **走っているものを 全部 止める**（2026-08-20）════
     訴え「2 回目以降 Lumi を 起動すると、会話が 途中で 切れたり、なんか 重い」

     ★ 止め忘れが 実際に あった。いちばん 悪いのは **預かりの 見張り**:
       繋がる前に 打った字は 0.5 秒ごとに「繋がったか」を 見ていて、
       閉じても **止まらない**。次に 開いたとき 繋がった瞬間に
       **前の会話の 打ち込みを 勝手に 送る**。
       ＝「2 回目の 会話が いきなり おかしくなる」の 正体。
     ★ そのほか t安定 / tPush / 促し / 先出し / 収め / castT / workLimit も
       閉じたあとに 効いて、次の会話の 数え直しや 送り込みを 起こす。
     ★ **1 か所に まとめる。** ばらばらに 消していたから 抜けた。
       新しい 時計を 足したら、ここへも 足すこと。 */
  var 時計たち = ["t繋ぎ", "t安定", "tPush", "tEnd", "tMute", "tProbe", "t先出し", "t収め",
                  "tStart", "castT", "t保存表示", "workT", "workLimit", "促しt", "解説待ち"];
  var くり返したち = ["iStuck", "iSync", "iMic", "iLevel", "tSilence", "barIv", "sIv",
                      "資料見張り", "預かり見張り"];
  function 全部止める() {
    時計たち.forEach(function (k) { if (st[k]) { try { clearTimeout(st[k]); } catch (e) {} st[k] = 0; } });
    くり返したち.forEach(function (k) { if (st[k]) { try { clearInterval(st[k]); } catch (e) {} st[k] = 0; } });
    /* 預かりは **中身も** 捨てる。次の会話へ 持ち越さない。 */
    st.預かり = ""; st.預かり中 = false;
    st.促し中 = false; st.促し回 = 0; st.空回り = 0;
    try { if (解説) 解説を片づける(); } catch (e) {}
  }

  function close() {
    if (!st.on) return;
    st.on = false;
    try { 促しを止める(""); } catch (e) {}   /* 自動の続きも必ず止める */
    try { 問い窓を閉じる(); } catch (e) {}
    if (st.tEnd) { clearTimeout(st.tEnd); st.tEnd = 0; }
    if (st.tSilence) { clearInterval(st.tSilence); st.tSilence = 0; }
    if (st.tMute) { clearTimeout(st.tMute); st.tMute = 0; }
    if (press.t) { clearTimeout(press.t); press.t = 0; }
    st.bargeN = 0;
    /* ★ 画面の共有は **会話を閉じたら必ず止める**。
       映しっぱなしは 一番やってはいけないこと。 */
    try { キャスト終了("会話を閉じた"); } catch (e) {}
    try { if (st.ws) st.ws.close(); } catch (e) {}
    /* ══ マイクは **必ず離す**（2026-08-15 に戻した）════════════════
       ★ 許可を聞かれる回数を減らそうとして、持ちっぱなしにしていた。
         ところが **持ったままだと「Hey Lumi」の聞き取りが音を取れない。**
         「2 回目以降 反応しない」の正体はこれ（私が入れた不具合）。
       ★ 許可はページを開いている間ずっと有効なので、
         離してもう一度取っても **聞かれ直しません**（聞かれるのは
         アプリを開き直したときだけで、それは iOS の決まり）。 */
    try {
      if (st.keepStream) st.keepStream.getTracks().forEach(function (t) { t.stop(); });
    } catch (e) {}
    st.keepStream = null;
    st.stream = null;
    clearInterval(st.iMic);
    clearInterval(st.iLevel);
    clearInterval(st.iStuck);
    clearInterval(st.iSync);
    clearInterval(st.barIv);
    clearTimeout(st.tProbe);
    st.spkMs = 0; st.maxSpk = 0; st.dropMs = 0;
    st.probeUntil = 0; st.probeNg = 0; st.cutAt = 0;
    st.micTries = 0;
    覚え書きを残す();        /* ★ 会話を閉じる前に 要約だけ残す（翌日への引き継ぎ） */
    /* ★ 資料は **その会話のもの**（2026-08-17）。次の会話へ持ち越さない。
       持ち越すと、つけた覚えのない資料を読んで話し始めることになる。 */
    if (資料.length) { 資料 = []; }
    try { if (st.barClip) st.barClip.className = "clip"; } catch (e0) {}
    clearInterval(st.資料見張り);
    /* ★ 下書きは **消さない**。つなぎ直しで消えると、作った分が丸ごと消える。
       ただし 黙って抱え込まない。残っていることを その場で伝える。 */
    try {
      if (作り中.p && (作り中.p.questions || []).length) {
        say("下書きが " + 作り中.p.questions.length + " 問 残ってるよ");
      }
    } catch (e1) {}
    st.resume = "";          /* Google 側の札は 次の会話へは持ち越さない */
    st.badKeys = []; st.waitN = 0;
    st.goal = ""; st.steps = 0; st.plan = []; st.planOk = []; st.planAt = 0;
    st.あふれ = 0; try { 進み具合を消す(); } catch (e0) {}
    st.done = [];
    st.workN = 0; st.thinking = false;
    if (st.workT) { clearTimeout(st.workT); st.workT = 0; }
    作業音(false);                                     /* 鳴らしっぱなしにしない */
    showBar(false); showType(false);
    unwatchScreen();
    try { if (st.micNode) st.micNode.disconnect(); } catch (e) {}
    try { if (st.spk) st.spk.disconnect(); } catch (e) {}
    try { if (st.mic) st.mic.disconnect(); } catch (e) {}
    /* ★ **入れ物（ctx）は閉じない。** 閉じて作り直すと、
       2 回目の会話で音が出なくなる（iPhone で実際にそうなった）。
       ★ さらに、待ち受けが入っているなら **止めもしない**。
         次は呼びかけ＝指で触っていない流れで始まるので、
         止めると起こし直せない。無音を流したまま動かし続ける。 */
    var wantWake = false;
    try { wantWake = root.__vqSet ? (root.__vqSet.get("voice.wake") === true) : false; } catch (e) {}
    if (wantWake) ensureCtx();
    /* ★ 終了音を鳴らしてから眠らせる（2026-08-16）。
       先に止めると、鳴り始める前に入れ物が止まって **無音のまま終わる**。 */
    鳴らす("end", function () {
      if (st.on) return;                    /* もう次の会話が始まっていたら触らない */
      var またWake = false;
      try { またWake = root.__vqSet ? (root.__vqSet.get("voice.wake") === true) : false; } catch (e) {}
      if (!またWake) letSleep();
    });
    st.ws = st.mic = st.micNode = st.spk = st.stream = null;
    showEdge(false);            /* CSS の transition でフワッと消える */
    st.words = ""; st.inTurn = false; st.talked = false;
    /* 会話が終わったら 履歴も 片づける（前の人のやりとりを 残さない）。 */
    try {
      /* ★ 会話が終わったら Quick Chat へ 残す（2026-08-18・訴え）。
         ひとことだけの会話は 残さない（一覧が 空の会話で 埋まる）。 */
      if (残す設定か()) { try { 会話をChatへ保存("会話の終わり"); } catch (e11) {} }
      showLog(false);
      /* 次の会話へ 止めを持ち越さない（黙ったままだと 気づけない） */
      マイクを止める(false);
      st.履歴 = []; st.履歴の希望 = undefined; st.島を開く = false;
      履歴を空にする();
      doc.body.classList.remove("vq-live-bar");
    } catch (e10) {}
    st.endAt = 0; st.redial = 0; st.handoff = false; st.greeted = false;
    st.会話ID = "";                 /* 次に 呼ばれたら 新しい 名札を 作る */
    全部止める();
    st.巡 = 0; st.micSaid = false; st.詰まり = 0; st.声始 = 0; st.voiceAt = 0;
    st.つながらず = 0; st.waitN = 0; st.詰まり時 = 0; st.先出し時 = 0;
    setTimeout(function () { say(""); }, 500);
    /* ══ また「Hey Lumi」を待ち始める ═══════════════════════════════
       ★ 音の入れ物を閉じた直後は、端末がまだマイクを離していないことがある。
         少し置いてから始め、**それでも駄目なら次のひと触りで**始める
         （前は 1 回試して終わりだったので、失敗すると二度と戻らなかった）。
       ★ 設定が切ってあるなら、掛け直さない。 */
    /* ★ 端末がマイクを離しきるのを待つ。急ぐと start() は通るのに
       音が来ない（＝黙って死ぬ）。見張りが拾い直すので、ここは長めでよい。 */
    setTimeout(function () {
      var want = false;
      try { want = root.__vqSet ? (root.__vqSet.get("voice.wake") === true) : false; } catch (e) {}
      if (!want) return;
      st.btnWant = true; showBtn(true);      /* ボタンは必ず戻す */
      st.wakeTries = 0;
      if (!startWake()) arm();
    }, 2200);
  }

  /* ══ 画面のどこかを長押しすると終わる（2026-08-15）════════════════
     ★ 声で「もういいよ」と言えないとき（うるさい所・言いにくい所）の逃げ道。
     ★ **押したまま動かしていないとき**だけ。
       なぞる・引っぱるの途中で終わってしまうと、操作の邪魔になる。
     ★ 会話しているときだけ効く（ふだんは何もしない）。 */
  var press = { t: 0, x: 0, y: 0 };
  function pressStart(e) {
    if (!st.on) return;
    var p = (e.touches && e.touches[0]) || e;
    press.x = p.clientX || 0; press.y = p.clientY || 0;
    if (press.t) clearTimeout(press.t);
    press.t = setTimeout(function () {
      press.t = 0;
      if (!st.on) return;
      say("またね");
      talkEdge(false);
      setTimeout(close, 700);
    }, 750);
  }
  function pressMove(e) {
    if (!press.t) return;
    var p = (e.touches && e.touches[0]) || e;
    var dx = (p.clientX || 0) - press.x, dy = (p.clientY || 0) - press.y;
    if (dx * dx + dy * dy > 144) { clearTimeout(press.t); press.t = 0; }   /* 12px 動いたらやめる */
  }
  function pressEnd() { if (press.t) { clearTimeout(press.t); press.t = 0; } }
  doc.addEventListener("pointerdown", pressStart, true);
  doc.addEventListener("pointermove", pressMove, true);
  doc.addEventListener("pointerup", pressEnd, true);
  doc.addEventListener("pointercancel", pressEnd, true);

  /* 画面を裏にすると音の入れ物が止まる。切っておく（黙って枠を焼かない）。 */
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden && st.on) close();
  });

  /* ══ 次に触ったときに、黙って待ち受けを始める ═══════════════════
     マイクは「指で触ってから」でないと始められない。だが
     **許可そのものは端末が覚えている**ので、
       ・すでに許可されているなら その場で始める
       ・まだなら、次のひと触りで始める（利用者は何もしなくてよい）
     これで「開き直すたびにスイッチを入れ直す」が無くなる。 */
  function arm() {
    st.btnWant = true; showBtn(true);   /* 待ち受けが入るなら、ボタンも出す */
    if (st.wakeOn || st.armed) return;
    st.armed = true;
    /* 許可済みかを聞いてみる（聞けない端末もあるので、失敗しても進む） */
    var tryNow = function () {
      try {
        if (root.navigator.permissions && root.navigator.permissions.query) {
          root.navigator.permissions.query({ name: "microphone" }).then(function (p) {
            if (p && p.state === "granted") { st.armed = false; startWake(); }
          }).catch(function () {});
        }
      } catch (e) {}
    };
    tryNow();
    var once = function () {
      if (!st.armed) return;
      st.armed = false;
      doc.removeEventListener("pointerdown", once, true);
      doc.removeEventListener("keydown", once, true);
      startWake();
    };
    doc.addEventListener("pointerdown", once, true);
    doc.addEventListener("keydown", once, true);
  }

  root.__vqLive = {
    open: open, close: close, arm: arm,
    /* 「Hey Lumi」を待ち始める。**指で触ったときに呼ぶ**（決まりで、触らないと始められない）。 */
    listen: function () { return startWake(); },
    stopListen: stopWake,
    isOn: function () { return !!st.on; },
    isListening: function () { return !!st.wakeOn; },
    /* ★ **何と聞こえたか**を見るための口。
       「反応しない」を推測で直さないために置く。 */
    heard: function () { return st.heardLog.slice(); },
    hideButton: function () { st.btnWant = false; showBtn(false); },
    /* ★ **いまの様子**（不具合を推測で直さないための窓）。
       実機で「繋がるのに喋れない」と言われたとき、
       どこで止まっているかをこの数字で見分ける。 */
    state: function () {
      var tr = [];
      try {
        if (st.keepStream) tr = st.keepStream.getTracks().map(function (t) {
          return t.readyState + (t.muted ? "/無音" : "") + (t.enabled ? "" : "/切");
        });
      } catch (e) {}
      return {
        会話中: !!st.on,
        待っている: !!st.wakeOn,
        音の入れ物: st.ctx ? st.ctx.state : "無い",
        マイクの線: tr,
        マイクが動いた: !!st.micMoved,
        取り直した回数: st.micTries || 0,
        繋がり: st.ws ? st.ws.readyState : -1,
        /* ★ 繋ぎの 顛末（2026-08-28・訴え「繋がらないことがある」）。
           readyState=1 でも setup が 返っていなければ **話せていない**。
           そこを 分けて 見られるようにする。 */
        話せている: !!st.繋がった,
        使った鍵: st.keyIndex === undefined ? -1 : st.keyIndex,
        鍵の本数: st.keyCount || 0,
        この会話で避けた鍵: (st.badKeys || []).slice(),
        端末で避けている鍵: (function () {
          try { return Object.keys(鍵控えを読む()).map(Number); } catch (e) { return []; }
        })(),
        つながらなかった回数: st.つながらず || 0,
        繋ぎ直した回数: st.redial || 0,
        最後に切れた訳: String(st.最後の切れ || ""),
        /* ★ **送り口の様子**（2026-08-19）。
           「マイクは動いているのに 一言も 届いていない」を
           外から 見えるようにする。訴えの ほとんどは ここで 分かる。 */
        送り口: {
          喋っている: !!st.speaking,
          先出し中: !!st.先出し中,
          効果音中: !!st.jingleOn,
          文字を書いている: !!st.barOn,
          手で止めている: (function () { try { return !!手で止めているか(); } catch (e3) { return null; } })(),
          最後に送ってから: st.sentAt ? (Date.now() - st.sentAt) : null,
          最後に声が出てから: st.voiceAt ? (Date.now() - st.voiceAt) : null,
          詰まりを外した回数: st.詰まり || 0,
          いまの大きさ: st.lastRms || 0,
          いまの線: st.lastLine || 0,
          素の感度: (function () { try { return マイクの感度(); } catch (e4) { return null; } })(),
          はっきり大きい数: st.強N || 0,
          /* ★ 割り込みまわり（2026-08-20・訴え「雑音を 聞き取ってしまう」）。
             数字で 見えないと、感度の 話は 推測で しか 直せない。 */
          割り込みを試している: Date.now() < (st.probeUntil || 0),
          続いた数: st.bargeN || 0,
          空振り: st.probeNg || 0,
          部屋の静けさ: st.部屋 || 0,
          部屋から作った線: (st.部屋 || 0) * 2.2,
          回り込み: st.回り込み || 0,
          回り込みから作った線: (st.回り込み || 0) * 2.8,
          底の窓: { 部屋: (st.部屋窓 || []).length, 漏れ: (st.漏れ窓 || []).length },
          繋ぎ直し: st.redial || 0,
          巡: st.巡 || 0,
          受け口がある: !!(st.micNode && st.micNode.port && st.micNode.port.onmessage)
        }
      };
    },
    /* ★ 画面操作の道具を そのまま呼べるようにする。
       会話を通さずに試せるので、不具合を推測で直さずに済む。 */
    /* ★ 道具の受け口を そのまま外へ。試験で **全部を一度に叩く**ため。
       関数を消してしまう事故（実際に起きた）を、これで必ず捕まえる。 */
    /* ★ Lumi が受け取るものと **同じ**にする（withGoal も通す）。
       ここだけ通さないと、試しても本番と食い違うものを見ることになる。 */
    tool: function (name, args) {
      return Promise.resolve(doTool(name, args || {})).then(function (v) {
        if (v && typeof v === "object" && name !== "finishTask") return withGoal(v);
        return v;
      });
    },
    look: function (want, page) { return lookScreen(want, page); },
    /* ★ 文字の帯を出す／しまう。資料をつける口も この中にある。
       試験から 実際の入口をそのまま叩くために出す（作り物で試さないため）。 */
    bar: function (on) { showBar(on !== false); return !!st.bar; },
    /* 文字バーへ 打って 送る（確かめるとき用）。人が 打つのと 同じ道を 通る。 */
    打つ: function (t) {
      showBar(true);
      if (!st.barTa) return false;
      st.barTa.value = String(t || "");
      try { sendTyped(); } catch (e) { return false; }
      return true;
    },
    /* いま ついている資料（名前と字数だけ。中身は出さない） */
    attached: function () {
      return 資料.map(function (r) {
        return { 名: r.名, 種: r.絵 ? "画像" : r.種, 文字数: r.文字数 };
      });
    },
    /* ★ 出口だけを 動かす口（2026-08-17・段1の試験用）。
       実 AI を待たずに「言いすぎを 画面で 差し替えているか」を 測る。
       ここを通さないと、直したかどうかを **推測でしか** 言えない。 */
    言う: function (t, more) {
      said(t, more);
      var sp = null;
      try { sp = doc.querySelector("#vqLiveEdge .isl span"); } catch (e) {}
      return { 画面: sp ? sp.textContent : null, 生: st.words,
               /* ★ 伏せたことは **小さな印**で知らせる（2026-08-18）。
                  作り手向けの文を 会話へ混ぜない。印が出ているかは ここで見る。 */
               伏せた印: !!(sp && sp.querySelector(".vqhid")),
               落とした: (st.落とした || []).slice(), 落とし回: st.落とし回 || 0,
               走った道具: 走った道具() };
    },
    道具: function (n, a) { return doTool(n, a || {}); },
    /* ★ カメラ（AR）。試験と、外から確かめるための口。 */
    camera: function (向き) { return カメラ開始(向き); },
    撮る: function (幅) { return しっかり撮る(幅); },
    板: function (t, md) { return md === undefined ? st.板 : 板を出す(t, md); },
    /* 板の中で 動くものを 出す（スキャンモードから 呼ぶ・2026-08-20） */
    アプリ: function (t, 符) { return 板でアプリを出す(String(t || ""), String(符 || "")); },
    /* スキャンモードを 開く（声からも 押しても 同じ道） */
    スキャン: function (o) {
      try { if (root.VQSCAN) return root.VQSCAN.開く(o || {}); } catch (e) {}
      return null;
    },
    貼る: function (list) { return 答えを置く(list); },
    ためる: function (list) {
      var 箱 = 拾い物();
      (list || []).forEach(function (x) { 箱.push(x); });
      return 箱.length;
    },
    貼りはがす: function () { return 答えを消す(); },
    追跡の様子: function () {
      var T = st.追跡器;
      return { 数: T ? T.数() : 0, 位置: T ? T.いまの位置() : [],
               札: st.arBox ? st.arBox.querySelectorAll("[data-ar]").length : 0 };
    },
    向き: function () { return { いま: st.横 || "たて", 合わせ直した: 向きを合わせる() }; },
    板を閉じる: function () { return 板を閉じる(); },
    /* ★ ここから下は 2026-08-18 に足した口（会話の履歴・畳み・置き場所）。
       画面を 目で見て確かめるだけでは 回帰を 測れないので、外から触れるようにする。 */
    履歴: function () {
      return (st.履歴 || []).map(function (x) {
        return { who: x.who, text: x.text, at: x.at, 声: !!x.声 };
      });
    },
    履歴を出す: function (on) { showLog(on !== false, true); return !!st.logOn; },
    /* ★ 打った字・話した言葉が 履歴へ入る所を 外から叩く口。
       本番の 2 か所（sendTyped / inputTranscription）と **同じ関数**を呼ぶ。
       通信を張らずに 履歴の見た目を 測るために出す。 */
    私の言葉: function (t, 声) { 履歴を書く("me", t, false, !!声); return (st.履歴 || []).length; },
    /* ★ チュートリアル用（2026-08-18）。**通信は張らない。**
       見せる部品（帯・ボード・小窓）だけを 本物のまま動かすために出す。 */
    デモ: function (on) { st.デモ = on !== false; return !!st.デモ; },
    /* ★ 練習用の映像を 小窓へ流す（2026-08-18・チュートリアル）。
       本物の カメラ開始() は getUserMedia を叩くので、途中で許可を
       聞かれて話が止まる。**枠は本物・映像だけ差し替える。**
       送り続けの輪は 回さない（通信を張らないため）。 */
    デモ映像: function (stream) {
      try {
        var d = ensureAR(); if (!d) return false;
        var v = d.querySelector("video");
        v.srcObject = stream; v.muted = true; v.playsInline = true;
        d.querySelector(".vqar-marks").innerHTML = "";
        d.classList.add("show");
        位置を当てる(d, "ar");
        st.castVideo = v; st.castKind = "デモ";
        v.play().catch(function () {});
        return true;
      } catch (e) { return false; }
    },
    デモ映像を止める: function () {
      try {
        var d = st.arBox; if (!d) return false;
        var v = d.querySelector("video");
        try { if (v.srcObject) v.srcObject.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {}
        v.srcObject = null;
        d.classList.remove("show", "big");
        st.castVideo = null; st.castKind = "";
        return true;
      } catch (e) { return false; }
    },
    デモ中: function () { return !!st.デモ; },
    音を出す: function (which) { return 鳴らす(which); },
    音の入れ物: function () { try { return ensureCtx(); } catch (e) { return null; } },
    帯: function (on) { showEdge(on !== false); return true; },
    喋っている風: function (on) { talkEdge(on !== false); return true; },
    考え中: function (t) { say(String(t || "")); return true; },
    履歴を消す: function () {
      st.履歴 = []; st.保存した = null; 履歴を空にする();
      if (st.logOn) 履歴を描く();
      return 0;
    },
    /* ★ こちらから マイクを止める／戻す。いまの様子も返す。 */
    マイク: function (止める) {
      if (止める !== undefined) マイクを止める(!!止める, true);
      return { 止めている: !!st.手ミュート,
               worklet: st.lastMuted === undefined ? null : !!st.lastMuted,
               印: !!(doc.body && doc.body.classList.contains("vq-live-mute")) };
    },
    /* ★ Quick Chat へ 会話として残す（手押しと 同じ道を通る） */
    残す: function (なぜ) { return 会話をChatへ保存(なぜ || "外から"); },
    残したもの: function () {
      var 控え = LS読む(控えの鍵, []);
      var 一覧 = LS読む(一覧の鍵, []);
      var ある = {}; (Array.isArray(一覧) ? 一覧 : []).forEach(function (x) { if (x && x.id) ある[x.id] = 1; });
      return (Array.isArray(控え) ? 控え : []).map(function (x) {
        return { id: x.id, title: x.title, n: x.n,
                 一覧にある: !!ある[x.id],
                 本文: (LS読む(本文の鍵(x.id), null) || []).length };
      });
    },
    並べ直す: function () { return 控えから並べ直す(); },
    /* ★ 右下のボタンの 出し入れ。会話を始めずに 並びを 測るために出す。 */
    ボタン: function (on) {
      showType(on !== false);
      var d = st.dock;
      return {
        置き場: !!d,
        並び: d ? Array.prototype.slice.call(d.children).map(function (x) { return x.id; }) : [],
        見えている: d ? Array.prototype.slice.call(d.children)
          .filter(function (x) { return x.classList.contains("show"); })
          .map(function (x) { return x.id; }) : []
      };
    },
    履歴の様子: function () {
      var d = st.logBox;
      var 玉 = d ? Array.prototype.slice.call(d.querySelectorAll(".vqlg-m")) : [];
      return {
        出ている: !!(d && d.classList.contains("show")),
        件数: 玉.length,
        畳んでいる: 玉.filter(function (x) { return x.classList.contains("clip"); }).length,
        ボタンあり: 玉.filter(function (x) { return x.classList.contains("long"); }).length
      };
    },
    島の様子: function () {
      var h = st.host;
      var b = h ? h.querySelector(".isl .vqmore") : null;
      return {
        畳んでいる: !!(h && h.classList.contains("clip")),
        ボタン: !!(b && b.classList.contains("on")),
        文言: b ? b.textContent : "",
        伏せた印: !!(h && h.querySelector(".isl span .vqhid"))
      };
    },
    島を開く: function (on) {
      st.島を開く = on !== false; 島の畳みを見る(); return !!st.島を開く;
    },
    たたむ: function (on) { return 板をたたむ(on !== false); },
    置き場: function () {
      var f = function (el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { 動かした: el.classList.contains("moved"),
                 x: Math.round(r.left), y: Math.round(r.top),
                 w: Math.round(r.width), h: Math.round(r.height) };
      };
      return { 板: f(st.noteBox), 小窓: f(st.arBox), 履歴: f(st.logBox) };
    },
    動かす: function (誰, x, y) {
      var el = 誰 === "小窓" ? st.arBox : st.noteBox;
      if (!el) return null;
      return 置く(el, 誰 === "小窓" ? "ar" : "note", x, y);
    },
    置き場を戻す: function (誰) {
      var el = 誰 === "小窓" ? st.arBox : st.noteBox;
      return 位置を戻す(el, 誰 === "小窓" ? "ar" : "note");
    },
    cameraStop: function () { キャスト終了("外から止めた"); return true; },
    mark: function (x, y, t) { return 印を置く(x, y, t); },
    marks: function () {
      try {
        var m = st.arBox && st.arBox.querySelector(".vqar-marks");
        return { 見せている: !!st.cast, 種類: st.castKind || "",
                 向き: st.camFacing || "", 印: m ? m.children.length : 0,
                 送った枚: st.castN || 0, 小窓: !!(st.arBox && st.arBox.classList.contains("show")) };
      } catch (e) { return { だめ: String(e && e.message) }; }
    },
    忘れる: function () {
      st.書きもの時 = 0; st.落とし跡 = ""; st.道具の跡 = {};
      st.仕事の区切り = Date.now();
      try { root.VQW.report.忘れる(); } catch (e) {}
      return true;
    },
    /* ★ 近道もすべて doTool を通す（2026-08-16）。
       ここだけ素通りだと 控えに載らず、**試したものと本番が食い違う**。 */
    tap: function (n, name, sure) { return doTool("tapItem", { number: n, name: name, sure: sure }); },
    type: function (n, t) { return doTool("typeInto", { number: n, text: t }); },
    choose: function (n, o) { return doTool("chooseOption", { number: n, option: o }); },
    read: function (w) { return readScreen({ want: w }); },
    slide: function (n, v) { return doTool("slideTo", { number: n, value: v }); },
    scrollIn: function (n, d) { return doTool("scrollIn", { number: n, direction: d }); },
    waitFor: function (t, s2) { return doTool("waitFor", { text: t, seconds: s2 }); },
    make: function (k, i) { return doTool("makeDocument", { kind: k, instruction: i }); },
    edit: function (i) { return doTool("editDocument", { instruction: i }); },
    wp: function () { return describeWorkplace(); },
    why: function (f) { return doTool("explainWhy", { focus: f }); },
    weak: function () { return doTool("weakSpots", {}); },
    files: function (k) { return doTool("listFiles", { kind: k }); },
    delFile: function (n, sure) { return doTool("deleteFile", { name: n, sure: sure }); },
    presets: function () { return doTool("myPresets", {}); },
    delPreset: function (n, sure) { return doTool("removePreset", { name: n, sure: sure }); },
    readQs: function (n, from, to) { return doTool("readPresetQuestions", { name: n, from: from, to: to }); },
    result: function (n) { return doTool("readResult", { name: n }); },
    clock: function () { return doTool("readClock", {}); },
    web: function (q) { return doTool("searchWeb", { query: q }); },
    drag: function (i, t) { return doTool("dragItem", { item: i, to: t }); },
    ans: function (v) { return doTool("answerQuestion", { answer: v }); },
    move: function (w) { return doTool("quizMove", { where: w }); },
    /* 画面をそのまま見せる（リアルタイムキャスト） */
    cast: function (on) {
      if (on === false) { キャスト終了("外から止めた"); return { 止めた: true }; }
      if (on && on.getVideoTracks) return キャスト開始(on);   /* 試験用 */
      if (on === "そっと") return { 置いた回: st.おいた回 || 0, 置けなかった理由: st.おけない || {},
                                    最後に置いた: st.おいた時 ? new Date(st.おいた時).toLocaleTimeString("ja-JP") : "",
                                    中身: String(st.おいた文 || "").slice(0, 120) };
      if (on === undefined) {
        return { 見せている: !!st.cast, 送った枚: st.castN || 0,
                 変わらず送らなかった回: st.castSkip || 0,
                 最後に送った: st.castAt ? new Date(st.castAt).toLocaleTimeString("ja-JP") : "" };
      }
      return キャスト開始();
    },
    wrong: function (n, c) { return doTool("readWrongQuestions", { name: n, count: c }); },
    openFile: function (n) { return doTool("openFile", { name: n }); },
    settings: function (w) { return doTool("listSettings", { want: w }); },
    setIt: function (id, v) { return doTool("changeSetting", { id: id, value: v }); },
    editQs: function (n, edits) { return doTool("editPresetQuestions", { name: n, edits: edits }); },
    plan: function (g, steps) { return startTask({ goal: g, steps: steps }); },
    step: function (ev, which) { return stepDone({ evidence: ev, step: which }); },
    done: function () { return (st.done || []).slice(); },
    close2: function () { return closeTop(); },
    /* 起動音・終了音を 単体で確かめる（鳴り終わるまで待てる） */
    jingle: function (which) {
      return new Promise(function (done) {
        var t0 = Date.now();
        鳴らす(which, function () { done({ 鳴らした: which, かかった: Date.now() - t0,
                                          いま止めている: !!st.jingleOn }); });
      });
    },
    jingleOn: function () { return !!st.jingleOn; },
    /* 何区間目か・あと何分か（2026-08-20・「60 分 続いているか」を 外から 見る） */
    区間: function () {
      return { 区間: st.区間 || 1,
               経った分: st.openAt ? Math.round((Date.now() - st.openAt) / 60000) : 0,
               のこり分: st.endAt ? Math.round((st.endAt - Date.now()) / 60000) : 0,
               黙っている秒: st.silenceAt ? Math.round((Date.now() - st.silenceAt) / 1000) : 0,
               黙りの上限分: Math.round(SILENCE_AFTER_MS / 60000),
               いまの黙りの上限秒: Math.round((st.talked ? SILENCE_AFTER_MS : (st.silenceMs || 0)) / 1000),
               一度でも話した: !!st.talked,
               繋がっている: !!(st.ws && st.ws.readyState === 1) };
    },
    /* 考え中の 音と 帯の 様子（2026-08-20・「音楽が 鳴り続ける」を 外から 見るため） */
    作業: function () {
      return { workN: st.workN || 0, 鳴っている: !!st.workSrc, 名: st.workName || "",
               帯: st.state || "", 考え中: !!st.thinking,
               部屋の静けさ: st.部屋 || 0, 部屋の線: (st.部屋 || 0) * 2.2,
               鳴り始め: st.workStart || 0 };
    },
    spkMs: function () { return st.spkMs || 0; },
    dropMs: function () { return st.dropMs || 0; },
    /* 反応の強さ（言いかぶせやすさ）。引数なしで いまの値、数値で書き換え。 */
    sens: function (v) { return v === undefined ? マイクの感度() : 感度を決める(v); },
    mic: function () {
      return { 感度の下限: マイクの感度(),
               いまの大きさ: st.lastRms, 線: st.lastLine, いちばん大きかった: st.maxRms,
               回り込みの見積り: st.echo, 連続: st.bargeN || 0,
               喋っている間の最大: st.loudest,
               止めている: !!st.speaking,
               worklet側も止めている: !!st.lastMuted,
               micNodeがある: !!st.micNode,
               試している: Date.now() < (st.probeUntil || 0) };
    },
    memo: function () { return st.memo || null; },
    saveMemo: function () { return 覚え書きを残す(); },
    loadMemo: function () { return 覚え書きを読む(); },
    maxSpk: function () { return st.maxSpk || 0; },
    /* いま何をしていると出しているか・作業音が鳴っているか */
    doing: function () {
      var h = st.host;
      return { 出している言葉: st.state || "",
               帯が出ている: !!(h && h.classList.contains("work")),
               作業音: !!st.workSrc,
               重なり: st.workN || 0,
               喋っている: !!st.speaking,
               会話中: !!st.on,
               音の用意: !!(st.jingles && st.jingles.think),
               大きさ: 効果音の大きさ(),
               入れ物: st.ctx ? st.ctx.state : "なし",
               待ち: !!st.workT, ほしい: !!st.workWant };
    },
    work: function (on, name) { if (on) 作業開始(name); else 作業終了(); return true; },
    hosts: function () {
      return topHosts().map(function (h) {
        return (h.el.getAttribute("aria-label") || h.el.id || "?")
          + "（z=" + h.z + (h.own ? "・畳める" : "・畳めない") + "）";
      });
    },
    /* 番号がどの部品を指しているか（不具合を推測で追わないため） */
    info: function (n) {
      var it = look.items[Number(n) - 1 - (look.from || 0)];
      if (!it) return { だめ: "その番号はありません" };
      var b = it.el.getBoundingClientRect();
      var rt = it.el.getRootNode();
      return { 名前: it.name, 種類: it.kind, tag: it.el.tagName,
        cls: String(it.el.className || "").slice(0, 60), id: it.el.id || "",
        位置: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
        影の中: rt !== doc, 影の主: (rt !== doc && rt.host) ? (rt.host.id || rt.host.tagName) : "—" };
    },
    /* 試験用。マイクを殺して、自分で直せるかを見る。 */
    _killMic: function () {
      try { st.keepStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      st.micMoved = false; st.micAt = Date.now();
    }
  };
  /* ★ 残した会話が 一覧から 消えていたら 並べ直す（2026-08-18）。
     Quick Chat の本体は 記憶の中の一覧で sessions.v2 を **丸ごと書き戻す**ので、
     こちらが 足した 1 行が 落ちることがある（本文は 残る）。
     ・読み込んだとき
     ・Quick Chat の画面へ 移ったとき
     の 2 回 見て 戻す。読むのは 鍵 2 つだけなので 軽い。 */
  function 並べ直しを仕掛ける() {
    try { 控えから並べ直す(); } catch (e) {}
    try {
      if (!doc.body) return;
      var 前 = doc.body.getAttribute("data-app-tab") || "";
      new MutationObserver(function () {
        var いま = doc.body.getAttribute("data-app-tab") || "";
        if (いま === 前) return;
        前 = いま;
        if (いま === "chat") { try { 控えから並べ直す(); } catch (e2) {} }
      }).observe(doc.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e3) {}
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", 並べ直しを仕掛ける);
  else root.setTimeout(並べ直しを仕掛ける, 0);

})(typeof globalThis !== "undefined" ? globalThis : this);
