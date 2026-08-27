/* ══════════════════════════════════════════════════════════════════════
   2026-08-15 に直した 8 件が、あとで黙って戻らないようにする。

   ここで見るのは **原因そのもの**。見た目の文字ではなく、
   「なぜ壊れていたか」に当たる 1 行を見る。
   ・原因が戻れば落ちる
   ・書き方を整えただけでは落ちない
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const INDEX = require("./vqsrc.cjs").丸ごと();
/* 呼びかけの判定は 2026-08-15 に別ファイルへ出した（アプリと診断ページで共通） */
const WAKE = fs.readFileSync(path.join(__dirname, "client", "vq-wake.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name); }
}
function sec(t) { console.log("\n■ " + t); }

/* ── ① 資料：添付したときに 文字を取り出す ────────────────────────
   原因：attachLocalOnly が本体だけ持ち、文字を 1 字も取っていなかった。
        そのため 9MB 超は「文字が無い」と見なされ、預ける道（403）へ回り、
        資料つきの作成が必ず失敗していた。 */
sec("資料を添付したとき、文字を取り出す");
ok("★ 添付したら 文字を取り出しに行く", /readTextLocally\(added\);/.test(INDEX));
ok("　取り出しは 既存の読み取り部品に任せる（作り直さない）",
  /function readTextLocally\(added\)[\s\S]{0,1200}root\.__vqChatFiles/.test(INDEX));
ok("★ 取り出した文字を 添付そのものへ入れる",
  /a\.extractedText = String\(it\.text \|\| ""\);/.test(INDEX));
ok("★ 取り出しが終わるまで 作り始めない（クラウドでも待つ）",
  /if \(st\.attachBusy && st\.attachPending\) \{/.test(INDEX)
  && !/if \(!cloudNow && st\.attachBusy && st\.attachPending\)/.test(INDEX));
ok("　9MB 超は 文字で渡す（そのままは送れない）",
  /x\.file\.size \|\| 0\) > INLINE_MAX[\s\S]{0,140}extractedText[\s\S]{0,40}length > 200/.test(INDEX));

/* ── ② 資料：スキャン・写真を 絵にして渡す ───────────────────────
   原因：文字の無い資料に道が無く、403 で必ず失敗していた。 */
sec("スキャン・写真の資料を 絵にして渡す");
ok("★ ページを絵にする部品がある", /function pdfToImages\(file, used\)/.test(INDEX));
ok("★ 大きい写真は 縮めて渡す", /function imageToJpeg\(file\)/.test(INDEX));
ok("★ 量で止める（枚数だけで決めない）",
  /SCAN_MAX_BYTES = 14 \* 1024 \* 1024/.test(INDEX)
  && /bytes >= SCAN_MAX_BYTES/.test(INDEX));
ok("　1 ファイルの上限は 100MB", /SCAN_MAX_FILE = 100 \* 1024 \* 1024/.test(INDEX));
ok("★ 絵にしたページを 送る形にする", /function scanImagesOf\(atts\)/.test(INDEX));
ok("★ 絵があるなら 預ける道（403）へ行かない",
  /if \(scans\.length\) return Promise\.resolve\(scans\);/.test(INDEX));
ok("★ 絵で渡していることを 依頼文に書く",
  /【資料（ページの画像）】/.test(INDEX) && /画像に写っている内容だけ/.test(INDEX));
ok("　切ったページ数を 隠さず伝える",
  /ページ中 " \+ x\.done \+ " ページまで/.test(INDEX));
ok("★ 絵は 保存しない（置き場所の上限を超えて保存ごと失敗していた）",
  /if \(k2 !== "pageImages"\) noImg\[k2\] = a\[k2\];/.test(INDEX));

/* ── ③ 数式 ─────────────────────────────────────────────────────
   原因：カードの表裏などが esc() のままで、$…$ が文字のまま出ていた。
        プレビューは本番と別に組み立てていたので、さらに出なかった。 */
sec("数式（$…$）が組まれて出る");
ok("★ カードの表裏を 数式に通す",
  /class="vq2-card3-t">' \+ mathText\(faceUp \? back : front\)/.test(INDEX));
ok("★ 並べかえの項目", /class="vq2-sort-t">' \+ mathText\(it\.text/.test(INDEX));
ok("★ 対応づけの左側", /class="vq2-match-t">' \+ mathText\(l\.text/.test(INDEX));
ok("★ 表の見出し", /<th scope="col">' \+ mathText\(c\.text/.test(INDEX));
ok("　語群のボタン", /left <= 0 \? " disabled" : ""\) \+ ">" \+ mathText\(w\.text/.test(INDEX));
ok("　空欄に入った語", /vals\[i\] \? mathText\(vals\[i\]/.test(INDEX));
ok("　採点の観点", /"<li><span>" \+ mathText\(it\.description/.test(INDEX));
ok("★ プレビューは 本番と同じ描画部品を通す",
  /QR\.promptHtml\(q, \{\}\) \+ QR\.reviewHtml\(q, null, \{\}\)/.test(INDEX));
ok("　プレビューが 独自組み立てへ戻っていない",
  !/問 ' \+ numberOf\(q, i\) \+ "　" \+ esc\(q\.prompt\)/.test(INDEX));

/* ── ④ ダークで白地に白文字 ──────────────────────────────────── */
sec("ダークモードで 読めなくならない");
ok("★ グラフのツールチップは 黒地・白文字で固定",
  /\.tip\{position:absolute;pointer-events:none;background:#1B1922;color:#FFFFFF;/.test(INDEX));
ok("★ トーストも 黒地・白文字（3 か所）",
  (INDEX.match(/"background:#1B1922;color:#FFFFFF;border:1px solid rgba\(255,255,255,\.16\);"/g) || []).length >= 3);
ok("　背景に var(--vq-text) を使う書き方が 残っていない（トースト・ツールチップ）",
  !/\.tip\{[^}]*background:var\(--vq-text/.test(INDEX));

/* ── ⑤ プロフィール編集で 上へ跳ぶ ───────────────────────────── */
sec("プロフィール編集で 上へ跳ばない");
ok("★ 描き直す前に 位置を控える", /var sb = box\.querySelector\("\.sh-b"\);/.test(INDEX));
ok("★ 描き直したあとに 位置を戻す", /if \(sb2 && keep\.top\) sb2\.scrollTop = keep\.top;/.test(INDEX));
ok("★ 打っていた欄と 文字の位置も戻す",
  /back\.setSelectionRange\(keep\.s, keep\.e\)/.test(INDEX));

/* ── ⑥ 公開まわり ───────────────────────────────────────────── */
sec("公開したプリセットの プロフィールと数");
ok("★ プロフィールは 新しい画面で開く",
  /if \(typeof window\.__vqOpenProfile === "function"\)\{/.test(INDEX));
ok("★ サーバの数を 途中で捨てない（ここで落としていた）",
  /favoriteCount: Math\.max\(0, Number\(item\.favoriteCount \|\| 0\)\),/.test(INDEX)
  && /viewCount: Math\.max\(0, Number\(item\.viewCount \|\| 0\)\),/.test(INDEX));
ok("★ 公開しているものは 0 でも数を出す",
  /if \(typeof c\.favoriteCount === "number" && \(published \|\| c\.favoriteCount > 0\)\)/.test(INDEX));
ok("　数は 値のまま持たせる（文字から拾わない）",
  /card\.dataset\.viewCount = String\(Math\.max\(0, Number\(c\.view \|\| 0\)\)\);/.test(INDEX));
ok("　読み取り側も data-* から読む", /numAttr\("data-view-count"\)/.test(INDEX));

/* ── ⑦ 検索 ─────────────────────────────────────────────────── */
sec("検索が 画面と設定を 取りこぼさない");
ok("★ サイドバーを 実際に読む（決め打ちにしない）",
  /function shellEntries\(\)/.test(INDEX) && /getElementById\("vqShell"\)/.test(INDEX));
ok("★ 見出しは すぐ次のかたまりにだけかける",
  /var navs = sr\.querySelectorAll\("\.nav"\);/.test(INDEX)
  && /prev\.classList\.contains\("section"\)/.test(INDEX));
ok("★ 設定の 1 行 1 行を 引ける", /function settingEntries\(\)/.test(INDEX)
  && /window\.__vqSettingsIndex/.test(INDEX));
ok("★ 設定の一覧は 定義表が持ち主（入れ忘れが起きない）",
  /window\.__vqSettingsIndex = function \(\) \{/.test(INDEX));
ok("★ 押すと その設定の行まで連れていく",
  /window\.__vqOpenSettings = function \(focusId\)/.test(INDEX)
  && /if \(focusId\) focusRow\(focusId\);/.test(INDEX));
ok("　見つけた行を しばらく光らせる", /\.row\.is-found\{/.test(INDEX));

/* ── ⑧ 結果と分析 ───────────────────────────────────────────── */
sec("結果と分析が 一覧だけの画面でない");
ok("★ カードで並べる", /vq2-rgrid/.test(INDEX) && /vq2-rcard/.test(INDEX));
ok("★ 上に 数字を 4 つ出す", /vq2-rstats/.test(INDEX)
  && /stat\("受けた回数", n, "回"\)/.test(INDEX));
ok("★ 種類で 絞りこめる", /data-rfilter=/.test(INDEX));
ok("★ 出来ぐあいを 色だけで伝えない（言葉も出す）",
  /return \{ id: "good", label: "よくできた" \};/.test(INDEX)
  && /vq2-rcard-band-l/.test(INDEX));
ok("★ 前回からの伸びを出す（履歴があるときだけ）",
  /var p = prevOf\(r\), d = p \? rate - rateOf\(p\) : null;/.test(INDEX));
ok("　左右に 余白がある（端に貼り付かない）", /\.vq2-rwrap\{max-width:1180px/.test(INDEX));
ok("　古い一覧（vq2-item の羅列）へ戻っていない",
  !/data-rid="' \+ U\.esc\(r\.id\) \+ '">'\s*\+ '<span class="vq2-item-m">/.test(INDEX));

/* ── ⑨ プリセット詳細の「解きかたを決める」（2026-08-15 追記）─────
   原因：ラベルは「1 問ごとに答え合わせ」なのに、値は practice だった。
        登録では practice は feedback:"end"（最後にまとめて）。
        1 問ごとに出すのは study。**どちらを選んでも同じ動き**だった。 */
sec("プリセット詳細の 解きかた");
ok("★ 1 問ごとは study（practice ではない）",
  /\{ value: "study", label: "1 問ごとに答え合わせ" \}/.test(INDEX));
ok("★ 最後にまとめては practice", /\{ value: "practice", label: "最後にまとめて採点" \}/.test(INDEX));
ok("　古い food（練習＝1問ごと）の書き方が残っていない",
  !/value: "practice", label: "練習（1 問ごとに答え合わせ）"/.test(INDEX));
ok("★ 登録では study が feedback:\"each\"",
  /id: "study",[\s\S]{0,160}feedback: "each"/.test(INDEX));
ok("★ 登録では practice が feedback:\"end\"",
  /id: "practice",[\s\S]{0,160}feedback: "end"/.test(INDEX));
ok("★ 既定は study（黙って本番形式にしない）", /o0 = \{ mode: "study"/.test(INDEX));
ok("★ 出題数・時間は 自由に打てる", /data-num="/.test(INDEX) && /data-step="/.test(INDEX)
  && /num\("出題数", "limit"/.test(INDEX) && /num\("1 問あたりの時間", "perQ"/.test(INDEX)
  && /num\("全体の制限時間", "limitMin"/.test(INDEX));
ok("★ アプリの設定から初期値を引く",
  /S\.get\("learn\.questionCount"\)/.test(INDEX) && /S\.get\("learn\.examTime"\)/.test(INDEX));
ok("★ アプリの設定に合わせる口がある",
  /data-act="use-app"/.test(INDEX) && /アプリの設定に合わせました/.test(INDEX));
ok("　勝手に上書きしない（押したときだけ）", /押したときだけ。勝手に上書きしない/.test(INDEX));

/* ── ⑩ 読み上げ（TTS）───────────────────────────────────────── */
sec("読み上げ");
const W = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");
const WORKLET = fs.readFileSync(path.join(__dirname, "client", "vq-live-pcm.worklet.js"), "utf8");
ok("★ 日本語は Gemini（melotts は全滅していた）",
  /if \(l\.indexOf\("ja"\) === 0 \|\| l\.indexOf\("jp"\) === 0\)[\s\S]{0,80}kind: "gemini"/.test(W));
ok("★ 生の PCM に WAV の頭を付ける", /function ttsPcmToWav/.test(W));
ok("★ 読み上げ専用だと言い切る（指示文でも読ませる）",
  /あなたは読み上げの係です/.test(W));
ok("★ 鍵 × モデルで回す（枠はその組み合わせごと）",
  /for \(const k of keys\) for \(const m of TTS_GEMINI_MODELS\)/.test(W));
ok("　鍵を 3 本に絞る書き方が残っていない", !/keys\.slice\(0, 3\)/.test(W));
ok("★ 設定が要らないキャッシュを使う", /caches\.default/.test(W) && /cache-edge/.test(W));

/* ── ⑪ 音声会話（Lumi）─────────────────────────────────────────
   実測で分かった落とし穴を、そのまま固定する。
   ここが戻ると「開くのに何も返らない」「鍵が漏れる」になる。 */
sec("音声会話（Lumi）");
ok("★ 一時トークンで入る口は Constrained（素の口は 1008 で切られる）",
  /BidiGenerateContentConstrained/.test(INDEX));
ok("　素の BidiGenerateContent へ戻っていない",
  !/GenerativeService\.BidiGenerateContent"\s*\n?\s*\+ "\?access_token/.test(INDEX));
ok("★ 鍵はブラウザへ出さない（サーバが一時トークンを配る）",
  /fetch\(api\(\) \+ "\/api\/live\/token"/.test(INDEX)
  && !/GEMINI_API_KEY/.test(INDEX));
ok("★ Lumi と名乗る", /あなたは「Lumi（ルミ）」です/.test(W));
/* 中身の出どころは **画面**に変えた（サーバの表は名前が違って読めなかった）。
   別のデータベースを作らない、という趣旨は同じ。 */
ok("★ 中身はアプリのデータからその場で組む（別DBを持たない）",
  /function liveSystemInstruction/.test(W) && /function myContext/.test(INDEX)
  && !/FROM presets WHERE owner_user_id/.test(W));
/* 上限は 60 分（2026-08-16）。持ち越しの札で中身ごと繋ぎ替えられることを
   16 分の実測で確かめたので伸ばした。**必ず終わる**ことは変えていない。 */
ok("★ 必ず時間で終わる（上限がある）", /LIVE_MAX_MS = 60 \* 60 \* 1000/.test(W)
  && /st\.tEnd = setTimeout/.test(INDEX));
/* 「短命」は **繋ぎ始められる窓**が 1 分、という形に変えた
   （寿命そのものを 1 分にすると会話が 60 秒で切れる）。 */
ok("★ トークンは 1 回きり・繋ぎ始めは 1 分以内",
  /uses: 1/.test(W) && /LIVE_TOKEN_START_MS = 60 \* 1000/.test(W));
ok("★ 1 人あたりの回数に上限（枠を他人に食われない）",
  /LIVE_DAILY_MAX = 30/.test(W) && /LIVE_DAILY_LIMIT/.test(W));
/* 8 秒 → 20 秒に変えた（考えている間に切れていたため）。
   「切る仕組みがある」ことと「話したあとは切らない」ことを見る。 */
ok("★ 沈黙が続いたら切る（まだ話していないときだけ）",
  /SILENCE_MS = 20000/.test(INDEX) && /armSilence/.test(INDEX));
ok("★ Lumi が話す間はマイクを止める（iPhone の反響ループ対策）",
  /type: "mute"/.test(INDEX) && /this\.muted/.test(WORKLET));
ok("★ 割り込まれたら鳴らしかけを捨てる",
  /sc\.interrupted/.test(INDEX) && /type === "clear"/.test(WORKLET));
ok("★ 採取率は実際の値を読んで変換する（決め打ちしない）",
  /sampleRate \/ this\.target/.test(WORKLET) && /this\.src \/ sampleRate/.test(WORKLET));
ok("　worklet は実ファイル（文字列やインラインは受け取らない）",
  /addModule\("\/vq-live-pcm\.worklet\.js"\)/.test(INDEX));
ok("★ 設定から入れる・切れる", /id: "voice\.wake"/.test(INDEX) && /id: "voice\.now"/.test(INDEX));
ok("★ 押した指のまま動かす（マイクは触った扱いが要る）",
  /data-run="/.test(INDEX) && /sp0\.run === "function"/.test(INDEX));
ok("　会話の扱いを隠さず書いている", /会話の内容は AI の改善に使われます/.test(INDEX));
ok("　裏に回ったら切る（黙って枠を焼かない）", /doc\.hidden && st\.on/.test(INDEX));
ok("★ 返ってきた言葉は 画面の上に出す", /top:calc\(env\(safe-area-inset-top,0px\) \+ 14px\)/.test(INDEX));
ok("★ 1 行で切らない（長い返事も読める）", /white-space:pre-wrap/.test(INDEX)
  && !/#vqLiveEdge b\{[^}]*white-space:nowrap/.test(INDEX));
ok("★ 言葉は来たそばから足す（言い終わりを待たない）",
  /said\(sc\.outputTranscription\.text, st\.inTurn\)/.test(INDEX));
ok("★ どの画面より上に出す（隠れない）", /z-index:2147483600/.test(INDEX));
/* ── 呼びかけ・切れる・見た目・知識・画面操作（2026-08-15 追記）── */
/* 判定は client/vq-wake.js へ移した（アプリと診断ページで共通にするため）。
   見る場所は変わったが、確かめる中身は同じ。細かい当たり外れは vqwake.cjs。 */
ok("★ 呼びかけは 決まった言い方の一覧で当てない（当たらなかった）",
  /function isWake/.test(INDEX) && /kata2hira/.test(WAKE) && /function fold/.test(WAKE));
ok("★ Lumi が話している間は 沈黙を数えない（途中で切れていた）",
  /if \(st\.speaking \|\| st\.heard\)/.test(INDEX));
ok("★ 話しているかは 音の大きさで見る（文字起こしを待たない）",
  /type: "level"/.test(WORKLET) && /rms > 0\.012/.test(INDEX));
ok("★ 見た目は Dynamic Island 風（島から広がる）",
  /#vqLiveEdge \.isl\{/.test(INDEX) && /#vqLiveEdge\.open \.isl\{/.test(INDEX));
ok("★ カクつかせない（動かすのは形と透明度だけ）",
  /cubic-bezier\(\.22,1\.2,\.32,1\)/.test(INDEX)
  && /requestAnimationFrame\(function \(\) \{ h\.classList\.add\("on"\); \}\)/.test(INDEX));
ok("★ 消えるときは島へ吸い込まれる", /#vqLiveEdge\.bye \.isl\{/.test(INDEX)
  && /h\.classList\.add\("bye"\)/.test(INDEX));
ok("★ フチは流れずに息をする（直線の流れをやめた）",
  /vqLiveGlow/.test(INDEX) && !/@keyframes vqLiveX/.test(INDEX));
ok("★ どの教科でも作れると知っている（英単語アプリだと言っていた）",
  /このアプリは \*\*どの教科でも使えます\*\*/.test(W)
  && /「数学の問題は作れない」というのは \*\*まちがい\*\*です/.test(W));
ok("★ アプリの画面を知っている", /【アプリの中にある画面】/.test(W)
  && /Quick Mock/.test(W) && /Workplace/.test(W));
ok("★ できないと決めつけさせない", /できないと決めつけないでください/.test(W));
ok("★ 声で画面を開ける", /function liveTools/.test(W) && /openScreen/.test(W)
  && /m\.toolCall && m\.toolCall\.functionCalls/.test(INDEX));
/* 道具の書き方を短くしたので、**中身**で見る（enum があること＋行き先が並んでいること）。 */
ok("　開ける先は並べたものだけ（勝手な場所へ飛ばさない）",
  /o\.enum = e/.test(W) && /"home", "presets", "presetNew"/.test(W));
ok("　画面を開くのは 既存のボタンを押すだけ（新しい道を作らない）",
  /function clickShell/.test(INDEX) && /\.vqs-item/.test(INDEX));
/* ── 声でできることを増やした分（2026-08-15 追記）── */
ok("★ 画面を閉じる・戻る", /closeScreen/.test(W) && /function closeTop/.test(INDEX));
ok("★ 上下に動かす", /scrollPage/.test(W) && /function scrollPage/.test(INDEX));
ok("★ 問題を作る（頼みを欄に入れる）", /makePreset/.test(W) && /function makePreset/.test(INDEX));
ok("★ アプリの中を探す", /searchApp/.test(W) && /__vqCmdk/.test(INDEX));
ok("★ タイマーを声で（長さ・開始・停止・戻す・ストップウォッチ）",
  /timerSet/.test(W) && /timerControl/.test(W)
  && /function timerControl/.test(INDEX) && /"stopwatch"/.test(INDEX));
ok("★ 設定を声で変える（決めた項目だけ）",
  /setSetting/.test(W) && /function setSetting/.test(INDEX)
  && /display\.theme/.test(INDEX) && /learn\.questionCount/.test(INDEX));
ok("★ 会話を終われる", /endConversation/.test(W));
ok("　開ける画面が増えている（Docs / 通知 / プロフィールなど）",
  /docs: "Docs"/.test(INDEX) && /notifications: "通知"/.test(INDEX));
/* ── 開き直しても残る ── */
ok("★ 開き直しても待ち受けが残る（毎回スイッチを入れ直さない）",
  /function arm\(\)/.test(INDEX) && /if \(o && o\.boot\) \{ L\.arm\(\); return; \}/.test(INDEX));
ok("　許可済みならその場で、まだなら次のひと触りで始める",
  /navigator\.permissions\.query/.test(INDEX)
  && /doc\.addEventListener\("pointerdown", once, true\)/.test(INDEX));
/* ── 回数の数え方 ── */
/* ── 一度閉じたら二度と反応しない（2026-08-15 の訴え）── */
ok("★ 止めるときは 先に知らせを切る（古い方が掛け直して二重に始まっていた）",
  /r\.onend = null; r\.onerror = null; r\.onresult = null;/.test(INDEX));
ok("★ 二重に始めない見張り", /st\.wakeBusy/.test(INDEX));
ok("★ 始められなくても諦めない（次のひと触りで掛け直す）",
  /if \(!startWake\(\)\) arm\(\);/.test(INDEX));
/* 「切ってあるなら掛け直さない」の見方は === true に変えた
   （設定が読めないときも掛け直さない＝安全側）。 */
ok("　設定が切ってあるなら掛け直さない", /get\("voice\.wake"\) === true/.test(INDEX));
/* ── 声 ── */
ok("★ 声を選べる（実際に日本語で鳴った 5 つだけ）",
  /id: "voice\.name"/.test(INDEX)
  && /const LIVE_VOICES = \[/.test(W)
  && (W.match(/const LIVE_VOICES = \[([^\]]*)\]/) || [,""])[1].split(",").length === 5);
ok("★ 知らない声名は そのまま渡さない（喋らなくなるため）",
  /function liveVoiceOf/.test(W) && /return LIVE_VOICE_DEFAULT/.test(W));
ok("★ 会話と読み上げで 同じ声になる",
  /voice: o\.voice \|\| vname/.test(INDEX)
  && /ttsGemini\(env, text, liveVoiceOf\(body\?\.voice\), note\)/.test(W));
ok("　選んだその場で試せる", /この声でお話しします/.test(INDEX));
ok("　声は 女性3・男性2（公式の性格に合わせた）",
  /\["Kore", "Aoede", "Sulafat", "Charon", "Puck"\]/.test(W));
/* ── 呼びかけが当たらない（2026-08-15 の訴え）── */
ok("★ 漢字の当て字も見る（日本語の聞き取りは漢字で返る）",
  /"留美", "瑠美", "流美"/.test(WAKE) && /"海", "恵", "恵み"/.test(WAKE));
ok("★ 候補を全部見る（1番目が外れても別の候補で当たる）",
  /r\.maxAlternatives = 5/.test(INDEX)
  && /for \(var a = 0; a < alts\.length; a\+\+\)/.test(INDEX));
ok("★ 掛け直しに間を空けない（隙に呼ぶと聞き逃していた）",
  /if \(!st\.on\) startWake\(\);/.test(INDEX));
ok("★ 止まったままにならない見張り", /function watchWake/.test(INDEX));
ok("★ 何と聞こえたかを見られる（推測で直さない）",
  /function noteHeard/.test(INDEX) && /id: "voice\.heard"/.test(INDEX));
/* ── 喋っても反応しない ── */
ok("★ 止めている間も 声の大きさは測る（前は丸ごと捨てていた）",
  /this\.port\.postMessage\(\{ type: "level", rms: this\.rms, muted: this\.muted \}\);/.test(WORKLET));
/* 2026-08-16: 線を厳しくした（0.05→0.10 / 0.3秒→0.6秒 / 鳴り始め 0.8 秒は見ない）。
   甘いと Lumi 自身の回り込みで **自分の声を止めて**しまい、
   「喋ったらすぐ切れる」になっていた。割り込めること自体は変えていない。 */
/* 2026-08-16 夜: 線を **回り込みを測って** 決める形にした。
   固定値ではスマホの回り込みを超えられず、自分の声で自分を止めていた。
   割り込めること自体は変えていない。 */
/* ★ 2026-08-16 の 2 度目: 下限を 決め打ちから **覚えられる値**へ。 */
ok("★ こちらが話し始めたら Lumi を黙らせる（割り込み）",
  /st\.bargeN/.test(INDEX) && /var 線 = Math\.max\(マイクの感度\(\)/.test(INDEX));
/* ★ 2026-08-16: 数え方を 通算 8 → **連続 4** に直し、
   学習に利用者の声を混ぜないようにした（混ぜると線が声を追い越して
   一度も割り込めない）。守る中身は同じ＝1 回拾っただけでは黙らせない。 */
/* ★ 続く長さを 0.4→0.3 秒、待ち時間を 1.2→0.8 秒へ。
   「1 回拾っただけでは黙らせない」という守る中身は変えていない。 */
ok("　Lumi の声を拾っただけでは黙らせない（続いたときだけ）",
  /st\.bargeN >= 3/.test(INDEX) && /鳴り始めから > 800/.test(INDEX)
  && /st\.echo \* 0\.93 \+ rms \* 0\.07/.test(INDEX)
  && /\} else \{ st\.bargeN = 0; \}/.test(INDEX));
ok("★ 止めっぱなしにしない保険", /st\.tMute = setTimeout/.test(INDEX));
/* ── いきなり喋らなくなる／呼んでも反応しない（2026-08-16）──────── */
ok("★ 鳴らし残しを待つのは 30 秒まで（数字が止まると永久に開かない）",
  /st\.waitSpk = \(st\.waitSpk \|\| 0\) \+ 1;/.test(INDEX)
  && /st\.waitSpk <= 20/.test(INDEX)
  && /鳴らし残しの数字が止まっていた → マイクを開ける/.test(INDEX));
ok("★ 45 秒 黙ったままなら こちらから開け直す",
  /function watchStuck/.test(INDEX)
  && /45 秒 黙ったままだった → こちらから開け直す/.test(INDEX));
ok("★ 3 分 何も届かなければ 繋ぎ直す",
  /3 分 何も届かない → 繋ぎ直す/.test(INDEX) && /st\.aliveAt = Date\.now\(\);/.test(INDEX));
ok("★ 呼びかけの見張りは 35 秒（75 秒では気づけない）",
  /\(st\.evAt \|\| st\.wakeStartAt\) > 35000/.test(INDEX));
ok("★ 生きて見えても 4 分ごとに張り直す",
  /長く動かしたので 張り直す（4 分ごと）/.test(INDEX));
/* ── 長押しで終わる ── */
ok("★ 画面を長押しすると終わる", /function pressStart/.test(INDEX)
  && /}, 750\);/.test(INDEX));
ok("　なぞっている途中では終わらない", /dx \* dx \+ dy \* dy > 144/.test(INDEX));
/* ── 1 回しか反応しない（2026-08-15 の訴え）── */
ok("★ 聞き取りの知らせの中で 自分を止めない（止めると掛け直せなくなる）",
  /setTimeout\(open, 0\)/.test(INDEX));
ok("★ 始まったつもりで音が来ていないのを見つける",
  /r\.onaudiostart = function/.test(INDEX)
  && /!st\.wakeAlive && Date\.now\(\) - st\.wakeStartAt > 4000/.test(INDEX));
ok("★ 何度も失敗するなら 間を空けて掛け直す",
  /Math\.min\(4000, 400 \* st\.wakeTries\)/.test(INDEX));
ok("　会話のあとは 端末がマイクを離すのを待つ", /\}, 2200\);/.test(INDEX));
/* ── 設定を開かずに話せる ── */
ok("★ いつでも押せるボタンがある", /id = "vqLiveBtn"/.test(INDEX)
  && /function ensureBtn/.test(INDEX));
ok("★ 会話中は消えて、終わると戻る",
  /showBtn\(false\);          \/\* 会話中は消す/.test(INDEX)
  && /st\.btnWant = true; showBtn\(true\);      \/\* ボタンは必ず戻す/.test(INDEX));
ok("★ 見た目の指定は ボタンより先に入れる（素のボタンで置かれていた）",
  /function ensureCss/.test(INDEX)
  && /function ensureBtn\(\) \{\s*if \(st\.btn\) return st\.btn;\s*ensureCss\(\);/.test(INDEX));
ok("　位置と大きさは譲らない（既存の指定に潰されていた）",
  /position:fixed !important/.test(INDEX) && /width:52px !important/.test(INDEX));
ok("　スイッチを切ったらボタンも消える", /L\.hideButton\(\)/.test(INDEX));
/* ── 時間で切れる（2026-08-15 の訴え）── */
/* 黙っていても続く時間は 5 分 → 10 分（2026-08-16）。
   席を立ったときに焼かないための上限、という趣旨は変えていない。 */
ok("★ 一度でも話したら 長く続く（10 分）",
  /var lim = st\.talked \? SILENCE_AFTER_MS : st\.silenceMs;/.test(INDEX)
  && /SILENCE_AFTER_MS = 10 \* 60 \* 1000/.test(INDEX));
ok("★ まだ一言も交わしていないときだけ切る（20 秒）",
  /var SILENCE_MS = 20000;/.test(INDEX));
ok("★ 接続が切れても 上限まで黙って繋ぎ直す",
  /say\("つなぎ直しています…"\)/.test(INDEX) && /st\.redial/.test(INDEX));
ok("★ 上限は 最初に始めた時刻から数える（繋ぎ直しで伸びない）",
  /if \(!st\.endAt\) st\.endAt = Date\.now\(\) \+ Math\.max\(60000/.test(INDEX));
ok("　繋ぎ直しは 1 日の回数に数えない",
  /resume: st\.redial > 0/.test(INDEX) && /const resuming = !!\(body && body\.resume\)/.test(W));
ok("　何度も失敗するなら諦める（永久に繋ぎ直さない）",
  /st\.redial > 3/.test(INDEX));
/* ── マイクの許可 ── */
ok("★ マイクは 一度取って使い回す（会話のたびに聞かれない）",
  /st\.keepStream/.test(INDEX) && /t\.readyState === "live"/.test(INDEX));
/* ★ これは **逆にした**。持ったままだと「Hey Lumi」が聞き取れなかった。
   許可はページを開いている間ずっと有効なので、離しても聞かれ直さない。 */
ok("　閉じたらマイクを離す（持ったままだと聞き取れない）",
  /マイクは \*\*必ず離す\*\*/.test(INDEX));
ok("　iOS の決まりであることを 隠さず書いている",
  /iOS の決まりです/.test(INDEX) && /「Safari」→「マイク」→「許可」/.test(INDEX));
/* ── 2 回目以降 反応しない（私が入れた不具合）── */
ok("★ 会話が終わったら マイクを必ず離す（持ったままだと聞き取れない）",
  /st\.keepStream\.getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\); \}\)/.test(INDEX)
  && /st\.keepStream = null;/.test(INDEX));
/* ── 2 回目の会話で 声が届かない（iPhone）── */
ok("★ 音の入れ物は **1 つだけ作って使い回す**（閉じて作り直すと 2 回目が死ぬ）",
  /function ensureCtx/.test(INDEX)
  && !/st\.ctx\.close\(\)/.test(INDEX)
  && /if \(st\.ctx && st\.ctx\.state === "running"\) st\.ctx\.suspend\(\)/.test(INDEX));
ok("★ 入れ物は **触ったその瞬間**に作る（await をまたぐと止まったままになる）",
  /st\.on = true;\s*\n\s*ensureCtx\(\);/.test(INDEX));
ok("　部品の読み込みは 入れ物ごとに 1 回だけ", /if \(!st\.mods\) \{/.test(INDEX));
ok("★ 聞き取り係が離しきるのを待ってからマイクを取る",
  /if \(st\.wakeWas\) \{ st\.wakeWas = false; await sleep\(450\); \}/.test(INDEX));
ok("★ 声が届かないのを **画面自身が見つけて 取り直す**",
  /function watchMic/.test(INDEX) && /st\.iMic = setInterval/.test(INDEX)
  && /st\.micTries >= 2/.test(INDEX));
ok("　見張りは 繰り返す（1 回きりだと 途中で死んでも気づけない）",
  /clearInterval\(st\.iMic\)/.test(INDEX) && !/st\.tMic/.test(INDEX));
ok("　線が切れた／無音にされた を 直接読む",
  /t\.readyState !== "live" \|\| t\.muted/.test(INDEX));
ok("★ 触ったときにも 掛け直す（iPhone は触らないと始められないことがある）",
  /function armOnTouch/.test(INDEX) && /"pointerdown", "touchend", "visibilitychange"/.test(INDEX));
ok("　いまの様子を 外から見られる（推測で直さないため）",
  /state: function \(\)/.test(INDEX) && /音の入れ物:/.test(INDEX) && /マイクの線:/.test(INDEX));
/* ── 実機の記録から直したもの（iOS 18.7 / Safari 26.6・2026-08-15）── */
ok("★ 呼びかけの判定は 1 か所（vq-wake.js）にまとめてある",
  /<script src="\/vq-wake\.js"><\/script>/.test(INDEX)
  && /root\.VQ_WAKE && root\.VQ_WAKE\.isWake/.test(INDEX));
/* ★ 2026-08-16: 終了音を鳴らしきってから眠らせる形に変えた。
   守る中身は同じ（呼びかけが入っているなら止めない）。
   眠らせる直前に **もう一度** 設定を読むので、鳴っている 1.9 秒の間に
   切り替えられても取り違えない。 */
ok("★ 呼びかけで起きるときは 指で触っていない → 入れ物を止めない",
  /function keepAlive/.test(INDEX) && /g\.gain\.value = 0;/.test(INDEX)
  && /if \(wantWake\) ensureCtx\(\);/.test(INDEX)
  && /if \(!またWake\) letSleep\(\);/.test(INDEX));
ok("★ 眠らせるのは 終了音が鳴り終わってから（先に止めると無音で終わる）",
  /鳴らす\("end", function \(\) \{[\s\S]{0,400}?letSleep\(\);/.test(INDEX));
ok("　次の会話が始まっていたら 眠らせない（畳む処理が新しい会話を止めない）",
  /鳴らす\("end", function \(\) \{\s*\n\s*if \(st\.on\) return;/.test(INDEX));
ok("★ start\(\) が通っても『始まった』とみなさない（onstart を待つ）",
  /r\.onstart = function \(\) \{ st\.wakeLive = true;/.test(INDEX)
  && /if \(st\.wakeLive\) return;/.test(INDEX));
ok("　4 秒の見張りは この端末が知らせを出すと分かってからだけ使う",
  /if \(st\.audioEvOk && st\.wakeOn && !st\.wakeAlive/.test(INDEX));
ok("★ 待ち受けのできごとも 記録に残す（次は 1 枚で分かる）",
  /function noteEv/.test(INDEX) && /noteEv\("★ 当たった/.test(INDEX)
  && /noteEv\("落ちた: /.test(INDEX));
ok("　診断ページがある（実機を私が触れないため）",
  require("fs").existsSync(require("path").join(__dirname, "client", "live-check.html")));
/* ── 作るボタンまで押す ── */
/* ★ 2026-08-16（監査）: 「押すところまでやる」だけでは足りなかった。
   押す前に true を返していたので、afterAct が 0.42 秒で「作りました」と
   答えてしまい、**1 文字も入っていない**のに成功になっていた。
   よって「押す」に加えて **各段で失敗を正直に返すこと**まで求める（前より厳しい）。 */
ok("★ プリセットは 欄に入れて「作る」まで押す",
  /aria-label="作る"\], \.vq2-tlc-send/.test(INDEX) && /go\.click\(\);/.test(INDEX));
ok("★★ 欄が見つからなければ 正直に断る（黙って諦めない）",
  /指示を入れる欄が見つかりません/.test(INDEX) && /まだ 1 問も作っていません/.test(INDEX));
ok("★★ 入れられなかったら 正直に断る",
  /指示を欄へ入れられませんでした/.test(INDEX));
ok("★★ 作るボタンが押せなければ 正直に断る",
  /「作る」のボタンが押せません/.test(INDEX));
ok("★★ 押せても「出来上がった」とは言わせない（数十秒かかる）",
  /問題を作りはじめました/.test(INDEX) && /まだ出来上がっていません/.test(INDEX));
/* ── ボタンが邪魔 ── */
ok("★ ボタンは小さく・薄く（押すときだけはっきり）",
  /width:40px !important/.test(INDEX) && /#vqLiveBtn\.in\{opacity:\.42/.test(INDEX));
/* ── 知識が狭い ── */
ok("★ この人のことは 画面から渡す（サーバの表は名前が違って読めていなかった）",
  /function myContext/.test(INDEX) && /context: myContext\(\)/.test(INDEX)
  && /const ctx = String\(\(o && o\.context\) \|\| ""\)/.test(W));
ok("★ 渡すのは 持ち物・成績・苦手・いまの画面・設定",
  /持っているプリセット/.test(INDEX) && /苦手そうなもの/.test(INDEX)
  && /いま見ている画面/.test(INDEX));
ok("　引けなかったときの控えは 正しい表を見る（sync_presets）",
  /FROM sync_presets WHERE user_id/.test(W));
ok("　無いことは作らせない", /ここに書いてあることだけを事実として話します/.test(W));
/* ── 会話の長さ ── */
ok("★ 切る予告（goAway）を受けたら 切れる前に繋ぎ替える",
  /if \(m\.goAway\)/.test(INDEX) && /st\.handoff = true/.test(INDEX));
ok("★ 繋ぎ替えのときは 挨拶し直さない", /st\.greeted/.test(INDEX));
ok("★ 話したあとは 黙っていても 10 分続く",
  /SILENCE_AFTER_MS = 10 \* 60 \* 1000/.test(INDEX));
ok("★ 1 回の上限は 60 分（札で繋ぎ替えて跨ぐ）",
  /LIVE_MAX_MS = 60 \* 60 \* 1000/.test(W)
  && /sessionResumption: st\.resume/.test(INDEX));
ok("★ トークンの寿命と 繋ぎ始めの窓を分ける（60秒で切れていた）",
  /LIVE_TOKEN_MS = 20 \* 60 \* 1000/.test(W)
  && /LIVE_TOKEN_START_MS = 60 \* 1000/.test(W));
/* ★ 2026-08-16: この確認は **壊れていたほう**を固定していた。
   resolveAuthUser が返すのは uid だけで、userId / id / user_id は
   存在しない。つまり uid は常に空文字で、数える処理は
   一度も走っていなかった（＝制限が効いていなかった）。 */
ok("★ 見分けが取れないときは 数えない（全員で 1 枠を数えていた）",
  /if \(env\?\.DB && uid && !resuming\)/.test(W));
/* ★ 2026-08-16: uid を直した日に、私の検証が 30 回ぶん数えられて
   利用者が使えなくなった。数えるのは続け、**検証用では止めない**。 */
ok("★ 検証用では 回数で止めない（数えるのは続ける）",
  /const 検証用 = String\(env\?\.AI_PROBE_ENABLED \|\| ""\) === "1";/.test(W)
  && /if \(n >= LIVE_DAILY_MAX && !検証用\)/.test(W));
ok("★ 見分けは resolveAuthUser が返す uid から取る（空のままだった）",
  /const uid = String\(user\.uid \|\| ""\);/.test(W)
  && !/String\(user\.userId \|\| user\.id \|\| user\.user_id \|\| ""\)/.test(W));

console.log("\n" + (fail ? "❌ 落ちています" : "✅ 全部通りました")
  + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail ? 1 : 0);
