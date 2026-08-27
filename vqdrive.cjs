/* ══════════════════════════════════════════════════════════════════════
   Lumi が **画面を見て、自分で押す** 仕組みを守る。

   ★ 期待値は、実際に開発版で動かして分かったことから取っている。
     推測で書いた行は 1 つも無い。

   ★ 実際に動かす試験（開発版が要る）は VQ_LIVE=1 のときだけ走る。
     ふだんはコードの形だけを見る（速いので毎回回せる）。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const IDX = require("./vqsrc.cjs").丸ごと();
const W = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name); }
}
function sec(t) { console.log("\n■ " + t); }

sec("道具がそろっている");
ok("画面を見る・押す・選ぶ・入れる の 4 つがある",
  /function lookScreen/.test(IDX) && /function tapItem/.test(IDX)
  && /function chooseOption/.test(IDX) && /function typeInto/.test(IDX));
ok("4 つとも AI に渡してある",
  /fn\("lookScreen"/.test(W) && /fn\("tapItem"/.test(W)
  && /fn\("chooseOption"/.test(W) && /fn\("typeInto"/.test(W));
ok("使いかたを教えてある（見る→押す→続ける）",
  /画面を自分で操作できます/.test(W) && /届くまで道具を呼び続けてください/.test(W));

sec("★ 幽霊を拾わない（実測: 83 件中 69 件が閉じた画面だった）");
ok("先祖の透明度まで見る（透明度は子へ受け継がれない）",
  /checkVisibility\(\{/.test(IDX) && /opacityProperty: true/.test(IDX));
ok("checkVisibility が無い端末むけに 先祖を自分で辿る道もある",
  /先祖の透明度を自分で辿る/.test(IDX));
ok("pointer-events は **自分のぶんだけ** 見る（先祖まで見ると本物が消える）",
  /cs\.pointerEvents === "none"/.test(IDX)
  && !/closest\("\[style\*=pointer-events/.test(IDX));
ok("inert の下は拾わない", /closest\("\[inert\]"\)/.test(IDX));
ok("当たり判定（elementFromPoint）は使わない（幽霊39に対し57落ちた）",
  !/function reachable/.test(IDX) && /当たり判定（elementFromPoint）は \*\*使わない\*\*/.test(IDX));

sec("★ 影の中まで潜る");
ok("入れ物自身が『影の主』のときも 中へ入る",
  /if \(node\.shadowRoot\) walk\(node\.shadowRoot\);/.test(IDX));
/* ★ 集めるのは全部。並べ替えで「前面 → 中身 → 行き先」にする。
   前面の中だけにするのは **3 件以上あるとき**に限る（0 件になった過去がある）。 */
ok("全部歩いてから並べ替える（中だけ見ると 0 件になった）",
  /walk\(doc\);/.test(IDX) && /前面があるなら、\*\*その中と行き先だけ\*\*にする/.test(IDX)
  && /if \(a1\.length >= 3\)/.test(IDX));

sec("★ 名前が人に分かる形になっている");
ok("行の見出しは **すぐ近くだけ** 見る（離れた見出しを拾って 11 個に付いた）",
  /:scope > \.row__label/.test(IDX) && /hop\+\+ < 3/.test(IDX));
ok("説明文まで拾わない（.row__main を見出しに使わない）",
  !/querySelector\(".row__label, .row__main"/.test(IDX));
ok("行の見出しと 自分の文字を組み合わせる（「角の丸み: 丸い」）",
  /t = rl \+ ": " \+ own;/.test(IDX));
ok("選ぶ欄は いま何が選ばれているかを添える",
  /"（いま: " \+ String\(cur\)/.test(IDX));
ok("欄のたぐいは 中身を名前にしない（選択肢が全部つながる）",
  /var form = \(tag0 === "select" \|\| tag0 === "input" \|\| tag0 === "textarea"\);/.test(IDX)
  && /if \(!form\) \{\n\s*var own = String\(el\.innerText/.test(IDX));

sec("★ 画面の文字を読む（解いてる問題を説明できるように）");
ok("読む道具がある・AI にも渡してある",
  /function readScreen/.test(IDX) && /fn\("readScreen"/.test(W));
ok("★ タグを決め打ちしない（問題文は div で描かれる）",
  !/var READ_SEL/.test(IDX) && /文字そのもの\*\*を並び順のまま拾う/.test(IDX));
ok("★ アイコンの合字を読まない（home / grid_view が並んでいた）",
  /var isIcon = function/.test(IDX) && /var textOf = function/.test(IDX));
ok("★ aria-hidden の中は読まない（数式が二重になる）",
  /el\.getAttribute\("aria-hidden"\) === "true"\) return false;/.test(IDX));
ok("★ 前面があるなら 後ろは読まない（隠れた画面と食い違う）",
  /if \(afterTop >= 3\)/.test(IDX));
ok("　行き先の並びは最後（問題文が下に埋もれる）",
  /var body = \[\], nav = \[\];/.test(IDX) && /lines = stash\.slice\(0, afterTop\)\.concat\(body, nav\)/.test(IDX));

sec("★ 打った字を読む・つかんで運ぶ・調べすぎない（2026-08-16）");
/* ★ 訴え「クイズ中に文字を入力したのに 認識してくれない」。
   input の value は 文字の節点ではないので、子をたどる読み方では
   **永久に空**だった。打った字・選び・チェックの状態を返すようにした。 */
ok("★★ 入力欄の中身を読む（打った字が読めなかった本体）",
  /var 欄の中身 = function \(el\)/.test(IDX)
  && /var 欄 = 欄の中身\(el\);/.test(IDX)
  && /if \(欄 !== null\) return 欄;/.test(IDX));
ok("★ 打った字は「入力欄」と分かる形で出す",
  /"［入力欄" \+ 頭 \+ ": "/.test(IDX) && /まだ何も入っていません/.test(IDX));
ok("★ 選ぶ欄・チェック・書き込み欄の状態も読む",
  /"［選ぶ欄" \+ 頭/.test(IDX) && /✓ 選んでいる/.test(IDX) && /書き込み欄/.test(IDX));
ok("★ 伏せ字は 中身を出さない（文字数だけ）",
  /ty === "password"/.test(IDX) && /伏せ字 " \+ v\.length \+ " 文字/.test(IDX));
/* ★ 訴え「掴んで持っていったりとかも。選ぶだけじゃなくて」 */
ok("★★ つかんで運ぶ道具がある",
  /function dragItem/.test(IDX) && /name === "dragItem"/.test(IDX));
ok("★ 運ぶ道は 2 通り試す（本物の道 → 押して置く道）",
  /指の出来事\(from, "pointerdown"/.test(IDX)
  && /指の出来事\(from, "pointermove"/.test(IDX)
  && /to\.click\(\);/.test(IDX));
ok("★★ 運べたかは **並びを前後で比べて**確かめる（できたふりをしない）",
  /var 前 = 並びをとる\(\);/.test(IDX)
  && /並びをとる\(\) !== 前/.test(IDX)
  && /運べませんでした/.test(IDX));
ok("★ 画面の外にはみ出した札も 運べる（送ってから掴む）",
  /from\.scrollIntoView/.test(IDX) && /to\.scrollIntoView/.test(IDX));
/* ★ 訴え「聞くたびに 今の情報をずっと調べてくる。適度でいいのよ」 */
ok("★★ 同じ言葉では 二度調べない（10 分は覚えておく）",
  /st\.調べ = st\.調べ \|\| \{\};/.test(IDX)
  && /Date\.now\(\) - 前\.at < 600000/.test(IDX)
  && /さっき調べたものと同じです/.test(IDX));
ok("　出てこなかったことも 覚える（同じ空振りを繰り返さない）",
  /出てこなかったことも 覚える/.test(IDX));
/* ★ 訴え「常に画面を見れるようにしてほしい」 */
ok("★★ 文字で送るときは いまの画面も一緒に渡す",
  /function 画面のひとまとめ/.test(IDX)
  && /text: t \+ 添え/.test(IDX));
ok("　添えたものは 利用者の言葉ではないと 断ってある",
  /利用者が打った言葉ではありません/.test(IDX));
ok("★ どの道具の返事にも いまの画面が付く",
  /function 画面を添える/.test(IDX)
  && /画面を添える\(繰り返し\(name, a, x\)\)/.test(IDX));

sec("★ 画面の外に どけてあるものを拾わない");
/* ★ 2026-08-16: 「+60 の遊び」では **すり抜けていた**。閉じた画面は
   translateX(100%) で 左端がちょうど画面の幅と同じ所に停まるので、
   left > W + 60 は成り立たない。実測で #skillsOverlay が前面あつかいになり、
   Insight を開いていても「いまの画面: Apps」と名乗っていた。
   横は **本当に重なっているか**で見る形へ変えた（前より厳しい）。 */
ok("画面の内側かを見る（#skillsOverlay は不透明のまま外にある）",
  /function onScreen/.test(IDX)
  && /var 重なり = Math\.min\(r\.right, W\) - Math\.max\(r\.left, 0\);/.test(IDX)
  && /if \(重なり < Math\.min\(8, r\.width\)\) return false;/.test(IDX));
ok("★ 大きさ 0 の入れ物は 落とさない（中身ごと消える）",
  /if \(r\.width > 0 && r\.height > 0\) \{/.test(IDX)
  && /Insight の画面が丸ごと消え/.test(IDX));
ok("★ 横の行き先の帯を「前面の画面」と数えない（読めるのが一覧だけになる）",
  /el\.id === "appTabBar"/.test(IDX)
  && /el\.closest\('nav,\[role="navigation"\]'\)/.test(IDX));
ok("★ 前面は **画面の真ん中を覆っているもの**だけ",
  /if \(r\.left > VW \/ 2 \|\| r\.right < VW \/ 2\) return;/.test(IDX)
  && /if \(r\.top > VH \/ 2 \|\| r\.bottom < VH \/ 2\) return;/.test(IDX));
ok("★ 覆っている広さは **見えている分だけ**で数える",
  /var 見幅 = Math\.min\(r\.right, VW\) - Math\.max\(r\.left, 0\);/.test(IDX));

sec("★ いちばん上の画面を 取り違えない");
ok("先に body の直下を見る（影を数えて上限に当たっていた）",
  /まず body の直下だけ（速い・確実）/.test(IDX));
ok("重なり順に 上限を設けない（アプリの画面は 2147483000 ちょうど）",
  /if \(!isFinite\(z\) \|\| z < 50\) return;/.test(IDX));
ok("前面の中だけにする。ただし少なすぎたら戻す",
  /if \(a1\.length >= 3\) return a1\.concat\(a3\);/.test(IDX));

sec("★ 足した道具");
ok("つまみ・枠の中・待つ が使える",
  /function slideTo/.test(IDX) && /function scrollIn/.test(IDX) && /function waitFor/.test(IDX)
  && /fn\("slideTo"/.test(W) && /fn\("scrollIn"/.test(W) && /fn\("waitFor"/.test(W));
ok("★ 待ちは 決め打ちでなく 画面が落ち着くまで",
  /function settle/.test(IDX) && /MutationObserver\(reset\)/.test(IDX)
  && !/\}, 700\);           \/\* 画面が描き変わる/.test(IDX));
ok("45 件で切らず 続きを見られる",
  /out2\.続きがあります/.test(IDX) && /page: N\("続きを見るとき/.test(W));
ok("言っただけで終わらせない、と教えてある",
  /言っただけで終わらせないこと/.test(W));

sec("★ 画面と声を 一致させる（全画面で試して見つかった穴）");
ok("★ 文字を入れたあと **本当に入ったか読み返す**（Feed は入れた直後に作り直される）",
  /function valOf/.test(IDX) && /if \(valOf\(cur2\) !== txt\)/.test(IDX)
  && /入れたと言わないでください/.test(IDX));
ok("　入らなかったら 取り直して もう一度だけ試す", /function refind/.test(IDX));
ok("★ 枠を動かす向きは 日本語も受ける。分からなければ 黙って成功にしない",
  /"下": "down", "上": "up"/.test(IDX)
  && /向きは 下・上・左・右・先頭・最後 のどれかにしてください/.test(IDX));
ok("★ いまの画面の名前を 取り違えない（どの画面でも library と名乗っていた）",
  /\.vq2-top-title, \.vq2-h-t/.test(IDX));
ok("★ 同じ名前が並ぶときは 見分けが付くようにする（「閉じる」が 2 つあった）",
  /count\[g\.name\] > 1/.test(IDX) && /"上から" \+ Math\.round\(r2\.top\)/.test(IDX));
ok("　押すときの照合は 括弧を外して比べる",
  /want = want\.replace\(\/（\[\^）\]\*）\\s\*\$\/, ""\);/.test(IDX));
ok("★ 続きを見る口が 引数を捨てていない",
  /look: function \(want, page\) \{ return lookScreen\(want, page\); \}/.test(IDX));

sec("★ 60 分の会話（持ち越し）");
ok("★ 話の続きを持ち越す札をもらう", /if \(m\.sessionResumptionUpdate\)/.test(IDX)
  && /st\.resume = m\.sessionResumptionUpdate\.newHandle/.test(IDX));
ok("★ 繋ぎ直すときに 札を渡す",
  /sessionResumption: st\.resume \? \{ handle: st\.resume \} : \{\}/.test(IDX));
ok("★ 長話は 古い所から畳んでもらう（1 回の長さの上限が外れる）",
  /contextWindowCompression: \{ slidingWindow: \{\} \}/.test(IDX));
ok("★ 1 回の上限は 60 分", /LIVE_MAX_MS = 60 \* 60 \* 1000/.test(W));
/* ★ 2026-08-19 に **60 分**へ そろえた（板を読んでいる間に 静かに 終わって
   いたため）。この検査は 圧縮ずみを 読んでいて 気づけなかった（2026-08-28）。 */
ok("　黙っていても 60 分は続く", /SILENCE_AFTER_MS = 60 \* 60 \* 1000/.test(IDX));
ok("　次の会話へ 札を持ち越さない", /st\.resume = "";/.test(IDX));

sec("★ 一言から 書類を作る（Docs / Sheets / Slides / Forms）");
ok("作る口がある・AI にも渡してある",
  /function makeDocument/.test(IDX) && /fn\("makeDocument"/.test(W)
  && /path === "\/api\/wp\/make"/.test(W));
ok("★ 白紙ではなく **中身ごと** 作ると教えてある",
  /\*\*中身まで作って開きます。\*\* 白紙を開いて/.test(W));
ok("形は画面側の決まりに合わせる（違うと開けない）",
  /function wpBody/.test(IDX) && /M\.emptyBody\("spreadsheet"\)/.test(IDX)
  && /M\.colName\(c\)/.test(IDX));
ok("返す前に 形を整える（列と行の長さをそろえる等）", /function wpTidy/.test(W));
ok("行頭の「・」を二重に付けない", /const strip = \(t, type\)/.test(W));
ok("種類は 日本語でも受ける", /文書: "document"/.test(IDX) && /表: "spreadsheet"/.test(IDX));

sec("★ いまの画面を こちらから送り込む（出まかせ対策）");
ok("★ 画面が変わったら 勝手に送り込む",
  /function pushScreen/.test(IDX) && /function watchScreen/.test(IDX));
ok("★ 返事を求めない形で入れる（入れた瞬間に喋らせない）",
  /turnComplete: false                        \/\* ★ 返事は求めない \*\//.test(IDX));
ok("★ 繋がったらすぐ 1 回送る（前は手前で return されて動いていなかった）",
  /setTimeout\(function \(\) \{ pushScreen\(true\); watchScreen\(\); \}, 300\);/.test(IDX));
/* 送り込みは廃止した（VQ_PUSH のときだけ動く）。仕組みは残してある。 */
ok("　送り込みの仕組みは残してある（戻せるように）",
  /function canPush/.test(IDX) && /st\.pushLast/.test(IDX));
/* ★ 2026-08-16（監査）: 前は「［いまの画面］の知らせが 画面が変わるたびに入ります」と
   教えていたが、その仕組み（pushScreen）は **止めてある**（164136 の VQ_PUSH）。
   無い物を約束すると、Lumi は届かない知らせを待って **画面を見なくなる**。
   よってここは「約束していないこと」と「実際にあるものだけを教えていること」の
   両方を求める（前の版より厳しい）。 */
ok("★ 止めてある仕組みを あるかのように教えていない",
  !/いちばん新しいものが本当の画面/.test(W)
  && !/画面が変わるたびに入ります/.test(W));
ok("★ 推し量って喋るなと 教えてある",
  /推し量って喋らないこと/.test(W));
ok("★★ 声のときは **自分で見てから**答えろ、と教えてある",
  /声のときは付かないので/.test(W) && /必ず readScreen か lookScreen で見てから/.test(W));
ok("★★ 画面のことを聞かれたら その番のうちに 1 回は見る、と教えてある",
  /その番のうちに 1 回は readScreen か lookScreen を呼んでから/.test(W));
ok("★★ 「未確認」が付いたら できたと言うな、と教えてある",
  /「未確認」と付いていたら、まだ「できた」と言ってはいけません/.test(W));
ok("★★ 利用者へ丸投げして終わるのを 禁じてある",
  /利用者へ投げ返して終わるのは 禁止/.test(W));

sec("★ 形式に関係なく 答えられる（2026-08-17）");
/* ★ 訴え「組み合わせに対応していない」「Cを選んでと言っても動かない」。
   これまでは **画面のボタンを探して押させて**いたので、選ぶ形式でしか
   動かなかった。組み合わせ・並べ替え・分類は 押す所が無い。
   実測: 表示側は 20 形式すべて描けるのに、Lumi から答えられるのは
   選ぶ形式だけだった。 */
ok("★★ 出題の仕組みへ **値をそのまま渡す** 道具がある",
  /function answerQuestion/.test(IDX) && /name === "answerQuestion"/.test(IDX));
ok("★★ 答えを入れる道は **1 本**（画面から押しても 声から入れても同じ所を通る）",
  /var 答えを入れた = function \(qid, v, meta\)/.test(IDX)
  && /onChange: function \(v, meta\) \{ 答えを入れた\(q\.id, v, meta\); \}/.test(IDX));
ok("★★ 形式ごとに 値の形へ直す（選ぶ・複数・穴埋め・並べ替え・組み合わせ・分類）",
  /形 === "choiceIds"/.test(IDX) && /形 === "blanks"/.test(IDX)
  && /形 === "order"/.test(IDX) && /形 === "pairs"/.test(IDX) && /形 === "groups"/.test(IDX));
ok("★★ 声では無理な形式（画像の位置・ラベル・表のます）は **正直に断る**",
  /形 === "points" \|\| 形 === "labels" \|\| 形 === "cells"/.test(IDX)
  && /声からは答えられません/.test(IDX));
ok("★★ 入れたあと **読み返して**から返す（入っていなければ「入らなかった」）",
  /答えが入りませんでした（画面に反映されていません）/.test(IDX));
ok("★★ 自動で次へ送ったかを 返事に入れる（二重に進めて 1 問飛ぶのを防ぐ）",
  /次へ送った: !!\(出 && 出\.次へ送った\)/.test(IDX)
  && /重ねて次へ送らないでください（2 問飛びます）/.test(IDX));
ok("★ engineOf は **型の文字列**を取る（問題そのものを渡すと null）",
  /engineOf は \*\*型の文字列\*\*を取る/.test(IDX)
  && /_q\.engine \|\| \(QT\.engineOf \? QT\.engineOf\(_q\.type\) : ""\)/.test(IDX));
ok("★★ いま選んでいる答えを 読めるようにした（配列なので answerFor で引く）",
  /session\.answers は \*\*配列\*\*なので/.test(IDX)
  && /var a = answerFor\(_q\.id\); return a \? a\.value : null;/.test(IDX));
ok("★ クイズの中を 行き来できる（次・前・番号・採点）",
  /function quizMove/.test(IDX) && /w === "grade"/.test(IDX));
ok("★★ 動かなかったら 進んだと言わせない",
  /動きませんでした（" \+ 前 \+ " のまま）/.test(IDX));
ok("★ 押して答えるなと 教えてある（押す所が無い形式がある）",
  /押しても答えられません/.test(W) && /answerQuestion に「C」と渡すだけ/.test(W));

sec("★ 言わなくても 画面を知っている（2026-08-16）");
/* ★ 利用者の判断: 画面の共有（getDisplayMedia）は **要らない**
   （許可を聞かれるのと、ブラウザの「共有しています」の帯が邪魔）。
   そこで **文字の写しを 番と番のあいだに置く**方式にした。
   許可も帯も要らず、しかも文字なので中身は正確。 */
ok("★★ 番の切れ目に いまの画面を そっと置く",
  /function 画面をそっと置く/.test(IDX) && /turnComplete: false/.test(IDX));
ok("★★ 置くのは **喋り終わった瞬間**（turnComplete では早すぎる）",
  /前は喋っていた && !st\.speaking/.test(IDX)
  && /あの時点では 音がまだ何十秒も/.test(IDX));
ok("★★ ふさがっていたら 少し待って もう一度（実測: 一度も置けなかった）",
  /画面をそっと置く\(\(のこり === undefined \? 6 : のこり\) - 1\)/.test(IDX));
ok("★ 喋っている間・返事を組み立てている間は **絶対に入れない**（返事が壊れる）",
  /if \(st\.speaking\) return やめる\("まだ喋っている"\);/.test(IDX)
  && /if \(st\.inTurn\) return やめる\("返事を組み立てている"\);/.test(IDX));
ok("★ 同じ画面なら送らない・15 秒に 1 回まで（記録を汚さない）",
  /if \(文 === st\.おいた文\)/.test(IDX) && /< 15000\) return やめる\("間がない"\)/.test(IDX));
ok("★ なぜ置けなかったかを 数えている（推測で直さないため）",
  /st\.おけない\[なぜ\]/.test(IDX));
/* 画面の共有そのものは 仕組みだけ残す（既定では出さない） */
ok("★★ 共有のボタンは **既定で出さない**（利用者が要らないと言った）",
  /root\.VQ_CAST_BTN \? ensureCast\(\) : null/.test(IDX));
ok("★ 共有は 音声と同じ realtimeInput の口で送る（会話の流れを壊さない）",
  /realtimeInput: \{\n\s*video: \{ mimeType: "image\/jpeg"/.test(IDX));
ok("★ 共有中は 赤い点で はっきり見せる（黙って映さない）",
  /#vqLiveCast\.on::after/.test(IDX));
ok("★ 会話を閉じたら 共有も必ず止める",
  /キャスト終了\("会話を閉じた"\)/.test(IDX));

sec("★ スライドが破綻していた 2 つの原因（2026-08-16）");
/* ① 書体名の二重引用符が style="…" を途中で終わらせ、
   色・大きさ・太さ・行間・揃えが **まるごと消えていた**。
   色が消えると外側の白文字を継ぐので、白い紙に白い字＝何も見えない。 */
/* ★ 見るのは **HTML の文字列に混ぜている所** だけ。
   setAttribute("style", …) は DOM の口なので 引用符が入っても壊れない
   （applyStyleToSelection がこれ。ここまで禁じると誤爆する）。 */
ok("★★ 書体名の二重引用符を そのまま style へ入れない",
  /function 属性に入れられる書体/.test(IDX)
  && !/style="font-family:' \+ U\.fontCss\(/.test(IDX)
  && !/;font-family:" \+ U\.fontCss\(/.test(IDX));
ok("★ 書体を混ぜている所は ぜんぶ 安全にした形を通っている",
  (IDX.match(/属性に入れられる書体\(/g) || []).length >= 4);
ok("★★ 文字の箱は 安全にした書体を使う",
  /return 属性に入れられる書体\(U\.fontCss\(id\)\);/.test(IDX));
ok("★ 大きな数字・テーマ見本も 同じ形に揃えた",
  (IDX.match(/属性に入れられる書体\(U\.fontCss\(/g) || []).length >= 3);
/* ② 表・グラフ・図形が 文章になっていた（作る側が一度も作っていなかった） */
ok("★★ 表は **本物の表の部品**にする",
  /type: "table", x: 70, y: 本文の上/.test(IDX) && /rows: 行/.test(IDX));
ok("★★ グラフは **本物のグラフの部品**にする",
  /type: "chart", x: 70, y: 本文の上/.test(IDX) && /chart: \{ type: sl\.chart\.type/.test(IDX));
ok("★★ 図形は 並べて **矢印でつなぐ**",
  /type: "shape", x: x, y: 本文の上/.test(IDX) && /type: "arrow"/.test(IDX));
ok("★★ 表やグラフだけの枚を 空あつかいで捨てない",
  /表・グラフ・図形だけの枚を 捨てないこと/.test(IDX)
  && /e\.type === "table" \|\| e\.type === "chart"/.test(IDX));

sec("★ 発表の作り側（サーバ）");
ok("★★ 枚ごとに 中身の形（表/グラフ/図形）まで聞く",
  /async function wpSlide/.test(W) && /並ぶ情報は 表/.test(W));
ok("★★ 例そのものに 表・グラフ・図形を入れてある（説明だけでは真似しない）",
  /"table":\{"header":\["日","内容"\]/.test(W)
  && /"chart":\{"type":"bar"/.test(W)
  && /"shapes":\[\{"shape":"circle"/.test(W));
ok("★★ bullets に「表を入れる」と書くのを 禁じてある",
  /bullets の中に「表を入れる」「グラフで示す」と書くのは 禁止/.test(W));
ok("★★ 枚数は **表紙を入れた合計**（先に切ってから聞く）",
  /function wp枚数/.test(W) && /const 使う章 = 欲しい枚 \? secs\.slice/.test(W));
ok("★★ 数が合わないグラフは **通さない**（足りない数を作らない）",
  /function wpChartOk/.test(W)
  && /se\.data\.length === n/.test(W)
  && /足りない数をこちらで作ってはいけない/.test(W));
ok("★ カンマ落ちを 問いの側でも防ぐ",
  /\[120,180,150\] であって \[120180150\] ではありません/.test(W));

sec("★ 繋がる前に打った字を 捨てない（無言の正体）");
/* ★ 実測: 繋がる前に送ると sendTyped が断るだけで、打った本人からは
   **黙って無視された**ようにしか見えなかった。預かって自分で送る。 */
ok("★★ 繋がっていなければ 預かる（消さない・投げ返さない）",
  /st\.預かり = t;/.test(IDX) && /say\("繋がったら送るね"\)/.test(IDX));
ok("★★ 繋がったら **自分で送り直す**",
  /if \(st\.ws && st\.ws\.readyState === 1\) \{/.test(IDX)
  && /st\.barTa\.value = 預; sendTyped\(\);/.test(IDX));
ok("★ 待っている間も 様子を出す（固まって見えない）",
  /作業開始\("繋がるのを待っています"\)/.test(IDX));
ok("★★ 60 秒で諦めるときも **打った字は返す**（黙って消さない）",
  /Date\.now\(\) - 待ち始め > 60000/.test(IDX)
  && /st\.barTa\.value = 消;/.test(IDX)
  && /繋がりませんでした。もう一度 送ってね/.test(IDX));

sec("★ 嘘で終わらせない（2026-08-16 の監査で塞いだ穴）");
/* ① afterAct が true だけで「やった」と断言していた（すべての嘘の出口） */
ok("★★ 効いたかを **値を読み直して** 確かめてから「やった」と言う",
  /var 確かめ役 = \{/.test(IDX)
  && /var 効いた = null;/.test(IDX)
  && /if \(確かめ役\[name\]\) 効いた = 確かめ役\[name\]\(a \|\| \{\}, 前 \|\| \{\}, now\);/.test(IDX));
ok("★★ 確かめて **変わっていなければ 断る**",
  /効いた === false/.test(IDX) && /何も変わっていません/.test(IDX));
ok("★★ 確かめようが無い道具には 「やった」と言わせない（未確認を立てる）",
  /効いた === null/.test(IDX) && /delete r\.やった;/.test(IDX) && /r\.未確認 = true;/.test(IDX));
ok("★ 呼ぶ前の姿を控えてから比べる",
  /function 前の姿/.test(IDX) && /var 前 = 見て返す道具\[name\] \? 前の姿\(name\) : null;/.test(IDX));
ok("★ タイマー・設定は **読み直して**突き合わせる（true を信じない）",
  /timerSet: function \(a\)/.test(IDX) && /timerControl: function \(a\)/.test(IDX)
  && /setSetting: function \(a\)/.test(IDX)
  && /String\(root\.__vqSet\.get\(row\[0\]\)\) === String\(欲しい\)/.test(IDX));
/* ② 嘘が証拠台帳に載って finishTask を通していた */
ok("★★ 確かめられなかったものは **証拠にしない**",
  /if \(r\.未確認\) return;/.test(IDX));
ok("★★ 控えの一致は **控えが主張を含むとき だけ**（逆向きの一致をやめた）",
  /if \(wn\.length >= 2\) \{/.test(IDX)
  && !/wn\.indexOf\(値\) >= 0/.test(IDX));
ok("★★ 目的を宣言していなくても finishTask には 証拠が要る",
  /目的を宣言していなくても、証拠は要る/.test(IDX)
  && /終わった: "（目的の宣言なし）"/.test(IDX));
ok("★★ 待って出なかったことを 証拠にしない",
  /出なかったことを \*\*証拠として控えに残さない\*\*/.test(IDX));
ok("★★ checkDone の結果じたいを 証拠にしない（自分の言葉が証拠になる輪を切る）",
  /Lumi 自身が言った言葉が 次の証拠になる/.test(IDX));
/* ③ 手数切れで 目的ごと消えて 素通りしていた */
ok("★★ 手数がきつくなっても **目的を消さない**（消すと finishTask が素通りする）",
  /\*\*目的は消さない\*\*/.test(IDX)
  && /st\.のばした/.test(IDX)
  && /「できた」と言ってはいけません/.test(IDX));
/* ④ makePreset は 入力も送信もしていないのに true を返していた */
ok("★★ 問題づくりは **入って・押せたのを見届けてから** 返す",
  /指示を入れる欄が見つかりません/.test(IDX)
  && /「作る」のボタンが押せません/.test(IDX)
  && /問題を作りはじめました/.test(IDX));
ok("★ makePreset は afterAct に載せない（0.42 秒で先に答えてしまうため）",
  /makePreset と startQuiz は \*\*自分で確かめて object を返す\*\*/.test(IDX));

sec("★ 「押して」が通らない を直す");
ok("★ 番号がずれていても **名前で探して押す**",
  /名前が分かっているなら、\*\*いまの画面から同じ名前を探して押す\*\*/.test(IDX)
  && /if \(cand\[k2\]\.name === want\)/.test(IDX));
ok("　見つからないときは いま押せるものを並べて返す",
  /いま押せるのは: /.test(IDX));
ok("　番号より名前が大事、と教えてある", /押すときは \*\*番号より名前\*\*/.test(W));

sec("★ 目的を持って 最後まで自分で進む");
ok("目的を宣言する・終わりを告げる 道具がある",
  /function startTask/.test(IDX) && /function finishTask/.test(IDX)
  && /fn\("startTask"/.test(W) && /fn\("finishTask"/.test(W));
ok("★ 1 手ごとに 目的を添える（途中で見失わない）",
  /function withGoal/.test(IDX) && /r\.いまの目的 = st\.goal/.test(IDX));
/* 上限は残したまま、**件数に応じて伸びる**形にした（2026-08-16）。
   3 件つながった頼まれごとは 25 手では届かなかったため。 */
/* ★ 2026-08-19 に 厚くした（資料 1 枚で 4〜8 手 使うため）。
   大事なのは **無限では ないこと**なので、式ではなく
   「件数で 伸びる ＋ 上限で 止まる」を 見る。 */
ok("★ 手数に上限がある（止まらなくならない）",
  /var 上限 = 25 \+ 20 \* \(件 - 1\) \+ Math\.min\(200, 件 \* 4\);/.test(IDX)
  && /if \(st\.steps > 上限\)/.test(IDX));
ok("　喋って番を終えるな、と 1 手ごとに書いてある",
  /\*\*喋るだけで番を終えず\*\* 続けて道具を呼んでください/.test(IDX));
ok("　会話を閉じたら 目的も捨てる", /st\.goal = ""; st\.steps = 0; st\.plan = \[\]/.test(IDX));

/* ── つながった頼まれごと（2026-08-16）──────────────────────────── */
ok("★ 予定を 何件も預かれる（steps）",
  /function stepDone/.test(IDX) && /fn\("stepDone"/.test(W)
  && /steps: \{ type: "ARRAY"/.test(W));
ok("★ 予定が残っているうちは finishTask が通らない",
  /まだ \*\*" \+ のこ\.length \+ " 件\*\* 残っているので終われません/.test(IDX));
ok("★ 1 件終わるたびに 残りと 次の件を返す",
  /のこり: 残2\.map/.test(IDX) && /つぎの件: 残2\[0\]/.test(IDX));
ok("★ 途中で喋るなと 1 件ごとに言う",
  /まだ " \+ 残2\.length \+ " 件 残っています。ここで喋らないでください/.test(IDX));
ok("★ 順番どおりでなくても どの件か指せる", /var 指定 = String\(\(a && a\.step\)/.test(IDX));
ok("　つなげて頼まれたら steps に全部入れろ、と教えてある",
  /startTask の steps に ぜんぶ入れてから始めます/.test(W));

/* ── 「できた」の証拠（2026-08-16）──────────────────────────────── */
ok("★ 済ませたことを控えに残す（消した物は画面から消えるため）",
  /function 控える/.test(IDX) && /st\.done = \(st\.done \|\| \[\]\)\.concat/.test(IDX));
ok("★ 証拠は 画面 か 控え のどちらかで通る",
  /画面に無くても、\*\*確かめて済ませたこと\*\*なら証拠として通す/.test(IDX));
ok("★ 控えに入るのは 失敗していないものだけ",
  /if \(!r \|\| typeof r !== "object" \|\| r\.だめ\) return;/.test(IDX));

/* ── 画面を閉じる（2026-08-16・訴えの元）────────────────────────── */
sec("★ 画面を閉じたと 嘘をつかない");
ok("★ 閉じるのは 探して押すのではなく その画面の畳む口を使う",
  /api2 && typeof api2\.close === "function"/.test(IDX));
ok("★ 閉じたあと 本当に消えたかを見てから返す",
  /var gone = !doc\.body\.contains\(t\.el\)/.test(IDX)
  && /閉じませんでした\*\*。まだ画面に出ています/.test(IDX));
ok("★ 消えていなければ 「閉じた」と言わせない",
  /閉じたと言わないでください/.test(IDX));
ok("★ 幽霊の覆いを いちばん上と間違えない",
  /畳める\.length \? 畳める : hosts/.test(IDX));
ok("　閉じたと言ってよいのは 返事にそう書いてあるときだけ、と教えてある",
  /画面を閉じたと言ってよいのは、道具の返事に「閉じた」と書いてあるときだけです/.test(W));

/* ── 動かしたあとに 必ず確かめる（2026-08-16）──────────────────── */
sec("★ 動かしたら 見てから返す");
ok("★ true を「できました」に読み替えない",
  /function afterAct/.test(IDX) && /見て返す道具/.test(IDX));
ok("★ できなかったときは はっきり だめ と返す",
  /は \*\*できませんでした\*\*/.test(IDX));
ok("　開く・閉じる・押す・合わせる が対象",
  /openScreen: 1, closeScreen: 1, goBack: 1/.test(IDX)
  && /timerSet: 1, timerControl: 1, setSetting: 1/.test(IDX));

/* ── 片づけ（2026-08-16）────────────────────────────────────────── */
sec("★ 消すときは 必ず確かめてから");
ok("書類とプリセットの 一覧・削除の道具がある",
  /function listFiles/.test(IDX) && /function deleteFile/.test(IDX)
  && /function myPresets/.test(IDX) && /function removePreset/.test(IDX)
  && /fn\("listFiles"/.test(W) && /fn\("deleteFile"/.test(W)
  && /fn\("myPresets"/.test(W) && /fn\("removePreset"/.test(W));
ok("★ sure が無ければ 消さずに確かめ待ちにする",
  /if \(!a \|\| a\.sure !== true\)/.test(IDX));
ok("★ 書類は ゴミ箱まで（戻せる）", /action: "trash"/.test(IDX)
  && /ゴミ箱から戻せます。完全には消していません/.test(IDX));
ok("★ プリセットは戻せないと はっきり言う",
  /プリセットはゴミ箱がありません。消すと戻せません/.test(IDX));
ok("★ 消したあと 本当に消えたかを見てから返す",
  /は \*\*消えていません\*\*/.test(IDX) && /は \*\*まだ残っています\*\*/.test(IDX));
ok("★ どれを消すかを 自分で決めるなと言っている",
  /どれを消すかは あなたが決めず、利用者に確かめてください/.test(IDX)
  && /どれを消すかを あなたが勝手に決めてはいけません/.test(W));
ok("　0 問・名前が既定のまま・重複 に印を付ける",
  /問題が 0 問/.test(IDX) && /名前が既定のまま/.test(IDX) && /同じ名前が複数/.test(IDX));

/* ── Workplace 4 つ（2026-08-16）────────────────────────────────── */
sec("★ Workplace 4 つを 構造ごと持っている");
ok("できること・関数・レイアウト・質問の種類を返す道具がある",
  /function describeWorkplace/.test(IDX) && /fn\("describeWorkplace"/.test(W));
ok("★ 関数の一覧は 画面の登録簿から読む（書き写さない）",
  /VQ2\.workplace\.functionRegistry\.all\(\)/.test(IDX));
ok("★ 4 つとも いま開いているものの取っ手を出す",
  (IDX.match(/WP\.current = \{ kind: "/g) || []).length === 4,
  ((IDX.match(/WP\.current = \{ kind: "/g) || []).length) + " か所");
ok("★ 表の数式は f、ただの値は v に入れる（訴え「関数が入らない」の元）",
  /cells\[名\] = \/\^=\/\.test\(s\.trim\(\)\) \? \{ f: s\.trim\(\) \} : \{ v: s \}/.test(IDX));
ok("★ スライドの中身は elements に置く（title\/bullets は誰も読まない）",
  /function スライドにする/.test(IDX) && /s2\.elements = \[/.test(IDX));
ok("★ 直すときは 作り直さず 番地や id を指して差し替える",
  /function あてる/.test(IDX)
  && /sh\.cells\[ref\] = \{ f: String\(x\.f\) \}/.test(IDX)
  && /var e = byId\[String\(x && x\.id\)\]/.test(IDX));
ok("　直す前に中身を見ろ、と教えてある",
  /readDocument で番号と id を見てから/.test(W)
  && /見ないで番号を作ると/.test(W));
ok("★★ 作る順番が 8 手で決まっている（飛ばすなと書いてある）",
  /workplaceCan で \*\*何ができるか\*\*を見る/.test(W)
  && /飛ばさないでください/.test(W)
  && /reviewDocument で崩れを数える/.test(W));
ok("★★ 完成という前に 必ず見直せ、と教えてある",
  /「できました」と言う前に かならず reviewDocument を通します/.test(W)
  && /見つかった数が 0 でないのに「完成しました」と言ってはいけません/.test(W));
ok("★★ 自分の手で作れ（makeDocument は最後の手）と教えてある",
  /書類は あなた自身が 1 つずつ組み立てます/.test(W)
  && /makeDocument（別の AI に文章で頼む道具）は \*\*最後の手\*\*/.test(W));
ok("★ Slides を 目分量で置くなと教えてある",
  /Slides は 目分量で置かないでください/.test(W)
  && /slidesPlan を呼び/.test(W)
  && /毎回おなじレイアウトにしないでください/.test(W));
ok("★ 画像は入れられないと 正直に言えと教えてある",
  /「画像を入れた」とは 絶対に言わないでください/.test(W));
ok("★ 画面の命令をそのまま呼べると教えてある",
  /listCommands/.test(W) && /runCommand に その名前をそのまま渡すと走ります/.test(W));
ok("★ 巻き戻せると教えてある", /undoLast です/.test(W));
(function 頼まれたものが揃うまで終われないか() {
  /* ★ 訴え「10枚作ってと指示した後に、1枚目から10枚目まで 完成まで一気に」。
     実測: 10 枚と頼んで **6 枚**で finishTask が通っていた。
     誰も「10 枚と言われたこと」を覚えていなかった。 */
  ok("★★ 頼まれた文から 数と部品を読み取る",
    IDX.indexOf("function 頼まれた注文(") > 0 && IDX.indexOf("function 注文の関門(") > 0);
  ok("★★ 枚数が足りなければ 終われない",
    /枚と言われましたが \*\*" \+ 枚 \+ " 枚しかありません/.test(IDX));
  ok("★★ 問題数が足りなければ 終われない",
    /問と言われましたが \*\*" \+ q \+ " 問しかありません/.test(IDX));
  ok("★★ 表・グラフの指示を 覚えている",
    IDX.indexOf("表を入れてと言われましたが、表がありません") > 0
    && IDX.indexOf("グラフをと言われましたが、グラフがありません") > 0);
  ok("★★ 空のページで 数あわせできない",
    IDX.indexOf("中身の無いページが") > 0 && IDX.indexOf("数あわせにしないこと") > 0);
  ok("★ 数と部品は 見直しより **先に** 見る（崩れが無いから完成、と言わせない）",
    IDX.indexOf("数と部品は 見直しより先に見る") > 0);
  ok("★ 言われていないことは 求めない（数字が無ければ何も言わない）",
    /if \(!注\.枚 && !注\.問 && !注\.表 && !注\.グラフ\) return null;/.test(IDX));
})();

(function 途中で死なないか() {
  /* ★ 2026-08-17 の訴え「何も作れてない・最後まで通せない」の直し。
     どれか 1 つでも抜けると、長い仕事は また途中で死ぬ。 */
  ok("★★ 切れて消えた頼みを 言い直す",
    IDX.indexOf("st.未処理 = { 文: t,") > 0
    && IDX.indexOf("つなぎ直したので もう一度 渡しています") > 0);
  /* ★ 2026-08-19 に 20 / 40 へ 広げた（1 本 10 分 × 6 本 で 60 分 続けるため）。
     見たいのは **仕事中のほうが 多いこと**。 */
  ok("★★ 仕事中は 繋ぎ直しの上限を のばす（4 回で諦めない）",
    /var 上限 = 仕事中 \? 40 : 20;/.test(IDX));
  ok("★★ 仕事中は 会話の締切を のばす（10 分で切らない）",
    IDX.indexOf("st.endAt = Date.now() + 600000;") > 0
    && IDX.indexOf("仕事の途中なので 会話の締切を 10 分のばした") > 0);
  ok("★ 道具が動いたら 繋ぎ直しの数を戻す",
    /st\.redial = 0;\n    \/\* 道具が動いた/.test(IDX) || IDX.indexOf("道具が動いた＝繋がりは生きている") > 0);
  ok("★★ 番が終わっても 仕事が残っていれば こちらから続きを頼む",
    IDX.indexOf("function 続きを促す()") > 0
    && IDX.indexOf("促しを仕込む(1500);") > 0);
  /* ══ ★★ ここは **利用者の訴えで 期待値そのものを 書き替えた**（2026-08-17）
     旧: 「道具が 1 つでも動いたら 続きを促す」を 正しいこととして確かめていた。
     ところが実際には「ホーム画面に戻って」のような一言でも画面の道具が動き、
     終わったあとも 12 秒おきに 40 回 催促し続けた。
     利用者の言葉:「同じこと聞いてくる。何回も」「勝手に進める。やりすぎ」。
     **この試験が 暴走を「正しい」と書いていた。** だから期待値を直す。
     新: 催促してよいのは
       ① startTask の予定が残っている
       ② **書類を作る道具**（docsWrite / slidesWrite / deck* …）が動いて まだ仕上げていない
     の 2 つだけ。緩めたのではなく **狭くした**。 */
  ok("★★ 催促は『作りかけの書類がある』ときだけ（一言の頼みでは 催促しない）",
    IDX.indexOf("var 途中 = !!(st.作りかけ && !st.仕事おわり") > 0
    && IDX.indexOf("var 作る道具 = {") > 0
    && /if \(作る道具\[name\]\) \{\s*\n\s*st\.作りかけ = /.test(IDX));
  ok("★★ 画面を動かすだけの道具は 催促の種にしない",
    (() => {
      const i = IDX.indexOf("var 作る道具 = {");
      const 表 = IDX.slice(i, IDX.indexOf("};", i));
      return 表.indexOf("slidesWrite") > 0 && 表.indexOf("deckWrite") > 0
        && 表.indexOf("tapItem") < 0 && 表.indexOf("readScreen") < 0 && 表.indexOf("pressButton") < 0;
    })());
  /* ★ 訴え「保存するときに ずっと言ってる。うるさ」（2026-08-17）。
     fileAction（保存）を 作る道具に入れていたので、保存しただけで
     『作りかけ』になり 催促が始まっていた。**保存は仕事の終わり。** */
  ok("★★ 保存（fileAction）は 催促の種ではなく **終わりの合図**",
    (() => {
      const i = IDX.indexOf("var 作る道具 = {");
      const 表 = IDX.slice(i, IDX.indexOf("};", i));
      return 表.indexOf("fileAction") < 0 && 表.indexOf("runCommand") < 0
        && IDX.indexOf("var 終わりの道具 = { fileAction: 1") > 0
        && /if \(終わりの道具\[name\]\) \{\s*\n\s*st\.作りかけ = null;/.test(IDX);
    })());
  ok("★★ 書類が **見直しに通っている**なら 催促しない（最後の歯止め）",
    /var r3 = K3\.見直す\(\{\}\);/.test(IDX)
    && /if \(r3 && r3\.見つかった数 === 0\) \{ st\.作りかけ = null; 途中 = false; \}/.test(IDX));
  ok("★★ 人が何か言ったら 催促を **その場で止める**（延期ではなく停止）",
    (IDX.match(/促しを止める\("人が話しかけた"\)/g) || []).length >= 2
    && (IDX.match(/st\.作りかけ = null;/g) || []).length >= 3);
  ok("★★ 仕上がったら 催促の種を消す（finishTask / deckFinish の両方）",
    IDX.indexOf("st.作りかけ = null;                   /* 作りかけの印も消す") > 0
    && IDX.indexOf("st.作りかけ = null;               /* 仕上がったので 催促の種を消す */") > 0);
  ok("★ 人が話したら 自動の続きは そちらへ譲る",
    IDX.indexOf("st.人の番 = Date.now();") > 0
    && /Date\.now\(\) - \(st\.人の番 \|\| 0\) < 2500/.test(IDX));
  /* ★ 上限も 訴えに合わせて 厳しくした（40 回 → 8 回、空回り 3 → 2）。
     12 秒おきに 40 回 ＝ 8 分 鳴り続ける。うるさすぎる。 */
  ok("★ 際限なく回さない（8 回まで・空回り 2 回で諦める）",
    /st\.促し回 > 8/.test(IDX) && /st\.空回り >= 2/.test(IDX));
  ok("★ 質問の窓が出ている間は 促さない（人の番）",
    /if \(問い窓\) return 促しを仕込む\(2500\);/.test(IDX));
  ok("★★ 見た目の不足を 見直しで落とす（文字だけ・色なし・レイアウト偏り・図形なし）",
    IDX.indexOf("文字だけのページが 続いている") > 0
    && IDX.indexOf("色を 一度も使っていない") > 0
    && IDX.indexOf("レイアウトが 偏っている") > 0
    && IDX.indexOf("図形・線を 一度も置いていない") > 0);
  ok("★★ レイアウトの偏りは 枚数で見る（title 1 + title_body 9 を通さない）",
    /var 要る種類 = 枚 >= 6 \? 3 : \(枚 >= 4 \? 2 : 1\);/.test(IDX)
    && /いちばん多い > 枚 \* 0\.7/.test(IDX));
  ok("★ 表・グラフ・大きな数字が ゼロなら 指摘する",
    IDX.indexOf("表・グラフ・大きな数字が 1 つも無い") > 0);
  ok("★ 見出しと本文が同じ大きさなら 指摘する",
    IDX.indexOf("見出しと本文の大きさが同じ") > 0);
  ok("★★ slidesPlan が テーマの色を渡す（渡さないと真っ白になる）",
    IDX.indexOf("使える色: { 主:") > 0 && IDX.indexOf("見た目の作りかた") > 0);
  ok("★★ 式は入っているのに もとの数が空、を見つける",
    IDX.indexOf("式は入っているのに もとの数が空") > 0);
  ok("★ 1 番で何手でも打てと教えてある",
    /1 番のうちに 何手でも打ってください/.test(W)
    && /聞き返さないでください/.test(W));
  ok("★ 自動の合図は 利用者の言葉ではないと教えてある",
    /自動で「続けて」と合図/.test(W) && /それは利用者の言葉ではありません/.test(W));
  ok("★ 目次だけで終わるなと教えてある",
    /目次だけ作って終わりにしないでください/.test(W));
  ok("★★ 見た目に手を抜くなと教えてある（見直しで落ちると明記）",
    /見た目に手を抜かないでください/.test(W)
    && /finishTask が通りません/.test(W));
  ok("★★ 枚数を言われたら その枚数まで質を落とさないと教えてある",
    /枚数を言われたら その枚数まで 質を落とさず作ります/.test(W));
  ok("★ 数を先に入れてから式、と教えてある",
    /数を先に入れてから 式を入れてください/.test(W));
})();

(function 見直さずに終われないか() {
  ok("★★ 書類を触ったら 見直すまで終われない（仕組みで止める）",
    IDX.indexOf("function 見直しの関門()") > 0
    && IDX.indexOf("まだ見直していません") > 0);
  ok("★★ 崩れが残っていれば 終われない",
    /か所 崩れています/.test(IDX) && IDX.indexOf("崩れているところ") > 0);
  ok("★ 見直した事実を控える（reviewDocument が st.見直し を残す）",
    IDX.indexOf("st.見直し = { 書類:") > 0);
  ok("★ 書類を触っていない仕事は 素通りさせる",
    IDX.indexOf("if (!c) return null;                       /* 書類を触っていない仕事は 素通り */") > 0);
})();

(function 段取りの質問が画面に出るか() {
  ok("★★ 質問は 画面の窓で聞く（声で往復しない）",
    IDX.indexOf("function 問い窓を出す(") > 0 && IDX.indexOf('el.id = "vqPlanAsk"') > 0);
  ok("★ 右上に 何問目かを出す", /\(状態\.番 \+ 1\) \+ " \/ " \+ 質問\.length/.test(IDX));
  ok("★ いちばん下に おまかせ と 自由記述 がある",
    IDX.indexOf('data-role="auto"') > 0 && IDX.indexOf('data-role="free"') > 0
    && IDX.indexOf('data-role="skip"') > 0);
  ok("★ 番号キー（1〜9）でも選べる", /if \(n >= 1 && n <= 9\)/.test(IDX));
  ok("★★ :host に all:initial を書かない（書くと暗い見た目に追随しない）",
    IDX.indexOf("':host{all:initial}'") < 0
    && IDX.indexOf("all:initial を **書かないこと**") > 0);
  ok("★ アプリの書体（--vq-app-font）に従う",
    /font-family:var\(--vq-app-font/.test(IDX));
  ok("★ 待ちっぱなしにしない（3 分で切り上げる）",
    /}, 180000\);/.test(IDX) && IDX.indexOf("まだ答えをもらえていません") > 0);
  ok("★ 答えを写し忘れても 窓の答えを使う",
    IDX.indexOf("st.計画答") > 0 && IDX.indexOf("Lumi が answers を写し忘れても") > 0);
  ok("★★ askPlan の宣言に 選択肢（options）がある",
    W.indexOf('選ぶ答え（2〜5 個）') > 0);
  ok("★★ 声で読み上げるなと 教えてある",
    /質問は 画面の真ん中に 窓で出ます/.test(W)
    && /同じことを声で聞き直さないでください/.test(W));
})();

(function Workplaceの道具がそろっているか() {
  var 要る = ["workplaceCan", "readDocument", "reviewDocument", "undoLast", "newFile",
    "listTemplates", "listCommands", "runCommand", "fileAction",
    "docsWrite", "docsEdit", "sheetsWrite", "sheetsEdit",
    "slidesPlan", "slidesWrite", "slidesEdit", "formsWrite", "formsEdit"];
  var 無い = 要る.filter(function (n) { return W.indexOf('fn("' + n + '"') < 0; });
  ok("★★ Workplace の道具 18 個が すべて宣言されている", 無い.length === 0, 無い.join(" / "));
  var 受け口無し = 要る.filter(function (n) {
    return IDX.indexOf('name === "' + n + '"') < 0;
  });
  ok("★★ その 18 個に すべて 画面側の受け口がある", 受け口無し.length === 0, 受け口無し.join(" / "));
  var 口 = ["いま", "本体", "書類", "要約", "読む", "見直す", "できること",
    "控える", "控え一覧", "巻き戻す", "命令一覧", "命令"];
  var 欠 = 口.filter(function (n) { return IDX.indexOf("    " + n + ":") < 0 && IDX.indexOf(n + ": " + n) < 0; });
  ok("★ 操作の口（cmd）が 画面側にある", IDX.indexOf("WP.cmd = {") > 0);
  ok("★ ACTION → VERIFY の仕組みがある（確かめて返す）",
    IDX.indexOf("function 確かめて返す(") > 0 && IDX.indexOf("ほんとうに変わった") > 0);
  ok("★ 保存後に item が差し替わる罠に 手当てしてある",
    IDX.indexOf("function 書類(c)") > 0 && IDX.indexOf("session の item を まるごと別の物に差し替える") > 0);
})();

ok("　Sheets は本物の表計算だと教えてある",
  /Sheets は本物の表計算です/.test(W) && /「=」で始まる数式/.test(W));
ok("　まとめて頼まれたら まとめて作れと教えてある",
  /一度にまとめて頼まれたら、まとめて作ります/.test(W));

/* ── 断られたら 考え直して やり直す（2026-08-16）────────────────
   訴え「AI が 操作できない → 終わり」。実測でも 同じ stepDone を
   3 回そのまま呼んで力尽きていた。 */
sec("★ 断られたら 別の道を試す");
ok("★ 同じ呼び方の繰り返しを 数えて止める",
  /function 繰り返し/.test(IDX) && /st\.ng\[k\] = \(st\.ng\[k\] \|\| 0\) \+ 1;/.test(IDX)
  && /同じ呼び方を " \+ st\.ng\[k\] \+ " 回 続けています/.test(IDX));
ok("★ うまくいったら 失敗の数は忘れる（永久に禁じない）",
  /if \(st\.ng\) delete st\.ng\[呼び跡\(name, a\)\];/.test(IDX));
ok("★ 断るときは **使える証拠** を必ず添える",
  /r\.使える証拠 = 使える証拠\(\);/.test(IDX)
  && /使える証拠: \(st\.done \|\| \[\]\)\.slice\(-8\)/.test(IDX));
ok("★ 「そのまま写して」と やりかたを言う",
  /「使える証拠」の中から 1 行を そのまま写して/.test(IDX));
ok("★ 読んだことも 控えに残す（読む仕事に証拠が無かった）",
  /"読んだ", "確かめた"/.test(IDX)
  && /印\.unshift\("済ませた道具: " \+ name\);/.test(IDX));
ok("★ 証拠の作れない段取りは 控えから埋める（永久に終われなくしない）",
  /済んでいる段取りは こちらで埋める/.test(IDX)
  && /st\.planOk\[i\] = "控えから";/.test(IDX));
ok("　進めないなら 正直に言えと伝えている",
  /できなかったと正直に伝えて/.test(IDX));

/* ── プリセットを まとめて直す（2026-08-16）──────────────────── */
sec("★ プリセットの問題を まとめて読む・直す");
ok("読む道具と まとめて直す道具がある",
  /function readPresetQuestions/.test(IDX) && /function editPresetQuestions/.test(IDX)
  && /fn\("readPresetQuestions"/.test(W) && /fn\("editPresetQuestions"/.test(W));
ok("★ 解説が無い問を 教える", /解説が無い問:/.test(IDX));
ok("★ 1 問ずつ押すなと 道具の返事でも言う",
  /1 問ずつ画面を押して回らないこと（手数が尽きます）/.test(IDX));
ok("★ 入れたあと 読み直して確かめる",
  /後 = S2\.getPreset\(p\.id, \{\}\)/.test(IDX) && /解説がまだ無い問:/.test(IDX));
ok("★ もとからある不備で 足止めしない（黙って通しもしない）",
  /もとから不備のあるプリセット\*\*で足止めしない/.test(IDX)
  && /もとからあった不備:/.test(IDX));
ok("★ 古い形式は 直さず はっきり断る", /は古い形式で、ここからは直せません/.test(IDX));
ok("★ 開いている編集画面へ映す（版が食い違わない）",
  /VQ2\.presetNow = \{/.test(IDX) && /reload: function \(id\)/.test(IDX));
ok("　1 問ずつ押すなと 言い聞かせにも書いてある",
  /プリセットの問題を直すときは 画面を押して回らないでください/.test(W)
  && /解説は \*\*あなたが書きます\*\*/.test(W));

/* ── プリセット画面の AI（「1問目から10問目まで」）──────────────── */
sec("★ プリセット画面の AI が 直しへ回るか");
ok("★ 「N問目」を 作る数と数えない（生成へ流れていた）",
  /「N問目」「N番目」は \*\*場所\*\*であって 作る数ではない/.test(IDX)
  && /\(\?!\\s\*\(\?:目\|め\|番\)\)/.test(IDX));
ok("★ 「解説を追加」は 問題を足す指示ではない",
  /var 中身を足す = /.test(IDX) && /!中身を足す && !場所を指す/.test(IDX));
ok("★ 番号の範囲を 画面側でも id に直す",
  /function idsFromInstruction/.test(IDX) && /名指し = idsFromInstruction\(st\.autoInstruction\)/.test(IDX));

/* ── スライドの白紙（2026-08-16）──────────────────────────────── */
sec("★ 白紙スライド");
ok("★ 「空白」にも 文字の箱を置く（要素0で固まらない）",
  /case "blank":/.test(IDX) && /これまで空の配列を返していたので/.test(IDX));
ok("★ 中身も箱も無い枚は 書ける状態にする",
  /sl\.elements = layoutElements\(sl\.layout \|\| "title_body"\);/.test(IDX));
ok("★ 文字の箱を 声で足せる", /j\.addElements \|\| \[\]/.test(IDX)
  && /addElements/.test(W));
/* ★ 2026-08-16 に できることが増えた（図形・表は置ける）。
   「できないと言う」対象は **写真だけ** に絞る。できるものを
   できないと言わせるのも、できないものをできると言わせるのも 同じ嘘。 */
ok("★ 写真は入れられないと はっきり言う（図形と表は入れられる）",
  /写真だけは 声からは入れられません/.test(IDX)
  && /\*\*写真だけは足せません。\*\*/.test(W)
  && /図形と表は入れられます/.test(IDX));

/* ── 出自の作り話（2026-08-16）────────────────────────────────── */
sec("★ 表・図形を 入れられる");
ok("★ Docs で 表・注意書き・区切りを通す",
  /table: 1, callout: 1, divider: 1/.test(W));
ok("★ 文字の無い塊（表・区切り）を 捨てない",
  /\*\*表と区切りは 文字が無い\*\*/.test(W));
ok("★ 章ごとに書く道でも 表を作らせる",
  /\*\*並ぶ情報は 表にしてください\*\*/.test(W));
ok("★ 番号つきの型名の食い違いを 吸収する（番号が付いていなかった）",
  /if \(t === "numbered"\) t = "number";/.test(W)
  && /type: b\.type === "numbered" \? "number" : b\.type/.test(IDX));
ok("★ 表の欄（rows）を 画面まで運ぶ",
  /\*\*text 以外の欄を捨てない\*\*/.test(IDX)
  && /o2\.rows = b\.rows;/.test(IDX));
ok("★ Slides に 図形・線・表を置ける",
  /const OKEL = \{ text: 1, shape: 1, line: 1, table: 1 \};/.test(W)
  && /ty2 === "shape"/.test(IDX));
ok("★ 図形は 文字の後ろに敷く（文字を隠さない）", /e2\.z = 0;/.test(IDX));
ok("★ 「入れられない」と言わせない",
  /\*\*表・図形は 入れられます。\*\*「入れられない」と言わないでください/.test(W));
ok("★ 毎回同じにしない（ただし言われたことは守る）",
  /見た目は \*\*毎回同じにしないでください。\*\*/.test(W)
  && /利用者が言ったこと（題・日時・場所・枚数・色・入れる中身）は必ず守ります/.test(W));
ok("　写真だけは できないと正直に言う",
  /写真だけは 声からは入れられません/.test(W));

sec("★ できることを増やした（2026-08-16）");
ok("★ 結果を読む・まちがえた問題を読む",
  /function readResult/.test(IDX) && /function readWrongQuestions/.test(IDX)
  && /fn\("readResult"/.test(W) && /fn\("readWrongQuestions"/.test(W));
ok("★★ 苦手の計算を直した（score / maxScore が正しい欄）",
  /記録に入っているのは score \/ maxScore/.test(IDX)
  && /var c = Number\(r\.score !== undefined \? r\.score : r\.correct\);/.test(IDX));
ok("★ すでにある書類を 名前で開ける（開く口が 1 つも無かった）",
  /function openFile/.test(IDX) && /fn\("openFile"/.test(W));
ok("★ 設定は 10 項目ではなく 定義表ぜんぶ",
  /function listSettings/.test(IDX) && /function changeSetting/.test(IDX)
  && /S2\.specs\(\)/.test(IDX) && /fn\("changeSetting"/.test(W));
ok("★ 自分を切る設定は 断る", /voice\.wake": "これを切ると/.test(IDX));
ok("★ 表示名（「大」など）でも設定を変えられる",
  /\*\*表示名\*\*で言われることのほうが多い/.test(IDX));
ok("★ 声で グラフを作れる",
  /addCharts/.test(W) && /j\.addCharts \|\| \[\]/.test(IDX));
ok("★★ フォームの型を 画面の登録簿に合わせた（前は何も描かれなかった）",
  /short_text: 1, long_text: 1, single_choice: 1/.test(W)
  && /text: "short_text", textarea: "long_text", radio: "single_choice"/.test(W)
  && /直す型\[f\.type\] \|\| f\.type/.test(IDX));
ok("★ 質問の種類は 登録簿から読む（書き写して食い違わせない）",
  /VQ2\.workplace\.fieldRegistry\.all\(\)/.test(IDX));
ok("★ 無い機能を宣伝しない（条件つき書式は実装が無い）",
  IDX.indexOf("条件つき書式") < 0);

sec("★ 会話の持ち越し");
ok("★ 覚え書きの表と口がある",
  /CREATE TABLE IF NOT EXISTS lumi_memory/.test(W)
  && /async function handleLumiMemory/.test(W)
  && /path === "\/api\/lumi\/memory"/.test(W));
ok("★ 2 本の作り道 どちらにも足してある（片方だけだと全 API が 500）",
  (W.match(/CREATE TABLE IF NOT EXISTS lumi_memory/g) || []).length === 2
  && /await ensureCols\("lumi_memory"/.test(W));
ok("★ 入れるのは要約だけ（全文は入れない）",
  /入れるのは \*\*要約だけ\*\*。会話の全文は入れない/.test(W));
ok("★ uid の取り違えを直した（回数記録もプリセット引きも動いていなかった）",
  /const uid = String\(user\.uid \|\| ""\);/.test(W));

sec("★ 出自を作り話にしない");
ok("★ 作ったのは Rinty だと言う", /\*\*Rinty（リンティー）\*\* です。個人開発です/.test(W));
ok("★ 2026 年 2 月から・バージョン 3", /作りはじめたのは \*\*2026 年 2 月\*\*。いまは \*\*バージョン 3\*\*/.test(W));
ok("★ 利用者は「増え続けている」だけ・数は言わない",
  /利用者の数は \*\*増え続けています\*\*/.test(W) && /\*\*具体的な人数は言いません\*\*/.test(W));
ok("★ どこかの会社の製品だと言わせない",
  /Google・Apple・Microsoft などの会社が作ったものでは \*\*ありません\*\*/.test(W));
ok("★ 書いていないことは 知らないと言わせる",
  /\*\*上に書いてあること以外は、あなたは知りません。\*\*/.test(W)
  && /開発の人数・費用・売上・利用者の実数/.test(W)
  && /それらしい答えを作らないこと/.test(W));

/* ── 長い文書と、白紙スライド（2026-08-16 の訴え）────────────────── */
sec("★ 長い文書の直しと、白紙スライドの復旧");
ok("★ Docs も 全文の書き直しをやめた（長いと書き切れず毎回失敗していた）",
  /全文の作り直しをやめた/.test(IDX)
  && /\(j\.edits \|\| \[\]\)\.forEach/.test(IDX)
  && /\(j\.adds \|\| \[\]\)\.forEach/.test(IDX)
  && /全文を書き直さないこと。長い文書では書き切れず 失敗します/.test(W));
ok("★ 足す場所を 前後の id で指せる（末尾・先頭も）",
  /if \(w === "start"\) body\.blocks\.unshift\(塊\);/.test(IDX)
  && /else if \(w === "end"\) body\.blocks\.push\(塊\);/.test(IDX));
ok("★ 直すとき 塊の id を サーバへ渡す（指せないと当てられない）",
  /return \{ id: b\.id, type: b\.type, text: String\(b\.text \|\| ""\)\.slice\(0, 400\) \};/.test(IDX));
ok("★ 白紙のスライドは 開いたときに中身を戻す",
  /まっ白なスライドを 開いたときに直す/.test(IDX)
  && /if \(\(sl\.elements \|\| \[\]\)\.length\) return;/.test(IDX)
  && /delete sl\.title; delete sl\.bullets;/.test(IDX));
ok("★ 通らないレイアウト名も そのとき直す",
  /if \(!ok\) sl\.layout = "title_body";/.test(IDX));
/* ★ 2026-08-16: 「文字が無ければ捨てる」から **「文字も部品も無ければ捨てる」**へ。
   表やグラフだけの枚を 捨てなくなった分だけ厳しい。 */
ok("★ 中身の無い枚は そもそも作らない",
  /var 中身がある = s2\.elements\.some/.test(IDX)
  && /if \(!中身がある\) return null;/.test(IDX)
  && /if \(!base3\.slides\.length\)/.test(IDX));

sec("★ 画面の名前");
ok("読める文字の 1 行目を使う（題名の付け方が画面ごとに違う）",
  /読める文字の 1 行目\*\*を名前にする/.test(IDX) && /st\.inWhere/.test(IDX));
ok("絵文字だけのものは名前にしない", /\[぀-ヿ一-鿿A-Za-z0-9\]\{2,\}/.test(IDX));
ok("★ 横は 画面の幅だけ見る（外へどけた物が幅を広げて自分を正当化していた）",
  /var W = root\.innerWidth \|\| 0;/.test(IDX));

sec("★ 喋っている途中で切れない（2026-08-16 の訴え）");
ok("★ 返事の終わりは **向こうの印**で判じる（音が尽きたかで判じない）",
  /sc\.turnComplete \|\| sc\.generationComplete/.test(IDX)
  && /st\.turnDone = true;/.test(IDX) && /if \(!st\.turnDone\) return;/.test(IDX));
/* ★ 2026-08-16: 割り込みを試している 1.5 秒だけは 止め直さない
   （止め直すと こちらの声が 1 かたまりも届かず、永久に割り込めない）。
   それ以外は これまでどおり 鳴らす前に止める。 */
ok("★ 音を鳴らす **前に** マイクを止める（割り込みを試している間を除く）",
  /if \(hasAudio && !st\.speaking && Date\.now\(\) > \(st\.probeUntil \|\| 0\)\)/.test(IDX)
  && /st\.speakAt = Date\.now\(\)/.test(IDX));
ok("★ 送る直前にも止める（止める指示が伝わる前に 1 かたまり漏れていた）",
  /if \(st\.speaking\) return;/.test(IDX));
ok("　文字を書いている間も送らない", /if \(st\.barOn\) return;/.test(IDX));
ok("★ 向こう側の割り込み判定も 鈍くする",
  /startOfSpeechSensitivity: "START_SENSITIVITY_LOW"/.test(IDX)
  && /silenceDurationMs: 800/.test(IDX));
ok("　こちらからの割り込みは 残す（NO_INTERRUPTION にしない）",
  !/NO_INTERRUPTION/.test(IDX));
/* さらに厳しくした（2026-08-16 夜）: 線は **回り込みを測って** 決める。
   固定値ではスマホの回り込みを超えられず、自分の声で自分を止めていた。 */
/* ★ 2026-08-16: 学習に **利用者の声を混ぜない**ようにした。
   混ぜていたときは 線が声を追い越して、実測で一度も割り込めなかった。
   数え方も 通算 8 → 連続 4 に直した。 */
/* ★ 2026-08-16 の 2 度目: 0.045 でも「大きく言わないと割り込めない」と
   訴えが続いたので、下限を **覚えられる値**にし、続く長さも 0.4→0.3 秒へ。
   数値を焼き付けるのはやめ、**満たすべき性質**で見る。 */
/* ★ 2026-08-20 に 直した。1 個目を 素通しで 採ると、番の 始めに こちらが
   話していたとき **自分の声が 回り込みに なる**（vqlivenoise ⑥ で 実測）。
   いまは 番ごとに 作り直さない。線の 作りかた（実測 × 2.8）は そのまま。 */
ok("★ 割り込みの線は 回り込みを測って決める（固定値では直らなかった）",
  /st\.echo === undefined/.test(IDX)
  /* ★ 2026-08-26 に **部屋の線（直近 4 秒の 底）**を 足した
     （雑音の 多い所で 拾いすぎるため）。3 つの うち いちばん 高いものを 採る。 */
  && /var 線 = Math\.max\(マイクの感度\(\), \(st\.echo \|\| 0\) \* 2\.8, 部屋の線\)/.test(IDX)
  /* ★ 2026-08-20 に **空振りの数で 伸びる**形に なった（固定 3 では なくなった）。
     とびきり 大きい 声は いつでも 1 回で 通す。 */
  && /var 要る = 2 \+ Math\.min\(2, st\.probeNg \|\| 0\);/.test(IDX)
  && /if \(st\.bargeN >= 要る \|\| とびきり\)/.test(IDX));
ok("★ 感度は 覚えられる（端末ごとに当たりが違う）",
  /function マイクの感度/.test(IDX) && /function 感度を決める/.test(IDX)
  && /vq\.live\.mic\.sens\.v1/.test(IDX));
ok("★ 感度は 声からも変えられる（画面を触らずに直せる）",
  /id === "live\.sens"/.test(IDX) && /感度の段\[v1\]/.test(IDX));

sec("★ 会話中の 文字入力");
ok("入力ボタンと 入力欄がある", /function ensureType/.test(IDX) && /function ensureBar/.test(IDX));
ok("★ 影の中に作る（アプリの CSS と勝ち負けをしない）",
  /host\.attachShadow \? host\.attachShadow\(\{ mode: "open" \}\)/.test(IDX)
  && /var BAR_CSS = \[/.test(IDX));
ok("★ 見た目は 本物と同じ（丸い一本・36px の丸い送信）",
  /border-radius:999px;padding:5px 6px 5px 14px;/.test(IDX)
  && /width:36px;height:36px;border-radius:999px/.test(IDX));
ok("★ 字は 16px 以上（iPhone が勝手に拡大しない）",
  /font-size:16px;line-height:1\.7;/.test(IDX));
ok("　出るのは 会話中だけ", /showType\(true\);          \/\* 代わりに 文字で伝える口を出す \*\//.test(IDX));
ok("　書いている間は 黙っていても切らない", /if \(st\.barOn\) \{ st\.silenceAt = Date\.now\(\); return; \}/.test(IDX));
ok("　書いている間は マイクを止める", /function muteMic/.test(IDX) && /muteMic\(true\);/.test(IDX));

sec("★ 嘘をなくす（2026-08-16 の大きい直し）");
ok("★ 画面の送り込みは やめた（返事が返らなくなる・古い画面が積み上がる）",
  /if \(!root\.VQ_PUSH\) return;/.test(IDX)
  && /会話の流れに turnComplete:false で差し込む方式を試したが/.test(IDX));
ok("★ 画面のことは 必ず道具で確かめてから答える、と教えてある",
  /答える前に必ず lookScreen か readScreen で確かめます/.test(W)
  && /前に見た画面は もう違う/.test(W));
ok("★ 終わるには 証拠が要る（画面に無ければ終われない）",
  /function onScreenNow/.test(IDX)
  && /まだ終わっていません。/.test(IDX)
  && /終わるには \*\*証拠\*\* が要ります。/.test(IDX));
ok("　できたか確かめる道具がある", /function checkDone/.test(IDX) && /fn\("checkDone"/.test(W));
ok("★ やっていないことを やったと言うな、と教えてある",
  /やっていないことを『やった』と言わないでください/.test(W)
  && /道具を呼ぶ前に「〜したよ」と言うのは 嘘です/.test(W));

sec("★ Workplace を 自律で作る・直す");
ok("★ 骨組みを立ててから 章ごとに書く（ひな型なしで作れるように）",
  /async function wpOutline/.test(W) && /async function wpSection/.test(W)
  && /まず章立てだけ\*\*を考えてください/.test(W));
ok("　外部呼び出しの数に 天井を置いている（落ちないように）",
  /const budget = \{ used: 0, max: kind === "presentation" \? 12 : 8 \};/.test(W)
  && /budget\.used >= budget\.max/.test(W));
ok("★ 開いている文書を 声で直せる",
  /function editDocument/.test(IDX) && /path === "\/api\/wp\/edit"/.test(W)
  && /fn\("editDocument"/.test(W));
/* ★ 2026-08-16 に方針を変えた。
   前は「直したあとの全体を返させる」だった（部分だと どこを差し替えるか
   食い違うため）。だが長い文書では **書き切る前に出力が尽きて毎回失敗**し、
   通せない形の塊（表・画像）も 黙って消えていた。
   いまは **塊に id があるので部分返しでも食い違わない**。
   その安全装置が効いていることを確かめる。 */
ok("★ 直すときは 変える所だけを返させる（全文だと長文で失敗する）",
  /\*\*変える所だけ\*\*を返します。触らない かたまりは書かないでください/.test(W));
ok("★ 指す先は id。勝手な id を作らせない",
  /id は 上の一覧の id= を そのまま写します。勝手に作らないこと/.test(W));
ok("★ 知らない id は 当てずに読み飛ばす（別の所を壊さない）",
  /var i = 位置\(String\(e && e\.id\)\);\s*\n\s*if \(i < 0\) return;/.test(IDX));
ok("★ 言われていない所を消させない",
  /言われていない所を勝手に削らないこと。removes は はっきり消せと言われたときだけ/.test(W));
ok("　開いている書類の取っ手がある", /WP\.current = \{ kind: "document"/.test(IDX));

sec("★ なんでこうなるか を 背景から説明");
ok("説明を組み立てる口と道具がある",
  /async function handleQuizWhy/.test(W) && /function explainWhy/.test(IDX)
  && /fn\("explainWhy"/.test(W));
ok("★ 形が決まっている（こたえ・なぜ・ほかがちがう理由・覚えかた・もう一歩）",
  /こたえ:/.test(W) && /なぜ:/.test(W) && /ほかがちがう理由:/.test(W)
  && /覚えかた:/.test(W) && /もう一歩:/.test(W));
ok("　知らないことは書かせない（年号・人名の作り話を防ぐ）",
  /\*\*知らないことは書かないでください。\*\*/.test(W)
  && /思い出して言わないこと/.test(W));
ok("　答えだけで終わらせない、と教えてある", /\*\*答えだけ言って終わりにしないこと。\*\*/.test(W));

sec("★ 解き終わったあとの導線");
ok("苦手を見る道具がある", /function weakSpots/.test(IDX) && /fn\("weakSpots"/.test(W));
ok("　結果は list\(\) で読む（配列ではない）", /typeof R\.list === "function"/.test(IDX));
ok("★ 解き終わりで 終わりにせず 次を誘う、と教えてある",
  /\*\*問題を解き終わったら、そこで終わりにしないでください。\*\*/.test(W)
  && /そこだけ集めた問題を作ろうか？』と誘ってください/.test(W));
ok("　ぼんやりした誘いを禁じている", /ぼんやりした誘いはしないこと/.test(W));

sec("★ 道具の受け口が 生きている（関数を消す事故を捕まえる）");
ok("受け口が外に出ている", /tool: function \(name, args\)/.test(IDX));

sec("★ 問題の正解を 当てにいかせない（2026-08-16 の訴え）");
ok("★ いま解いている問題への 取っ手がある",
  /root\.VQ2\.quizNow = _q \? \{/.test(IDX));
ok("★ 正解は アプリの中から取り出す（choices\[\].isCorrect）",
  /function answerOf/.test(IDX) && /if \(c\.isCorrect\) ok\.push/.test(IDX));
ok("　選択肢以外の形（穴埋め・並べ替え・組み合わせ）も拾う",
  /q\.acceptedAnswers/.test(IDX) && /q\.blanks/.test(IDX)
  && /q\.orderItems/.test(IDX) && /q\.pairs/.test(IDX));
ok("★ 公式の解説も 一緒に渡す", /official: got\.公式の解説/.test(IDX));
ok("★ サーバは 正解を **確定事実**として扱う",
  /\*\*確定しています。絶対に変えないでください\*\*/.test(W)
  && /上に書いてある正解をそのまま\*\*入れてください/.test(W));
ok("★ 返ってきた答えは こちらの正解で上書きする",
  /j\.こたえ = got\.正解 \|\| j\.こたえ;/.test(IDX));
ok("　出題中でないときは 断定させない",
  /こちらで確かめられていません/.test(IDX) && /たぶんこうだと思う/.test(IDX));
ok("　当てにいくな、と教えてある",
  /\*\*当てにいってはいけません。\*\*/.test(W));
ok("　サーバが駄目でも 正解と公式の解説は渡す", /var 控え = \{ 正解: got\.正解/.test(IDX));

sec("★ Gemini の鍵を 6 本ぜんぶ使う");
/* ★ 2026-08-28 に 強くした。実測で 鍵 5 本のうち 1 本が
   1008 "Your project has been denied access." で 死んでいて、
     ・画面は quota / exceeded / billing の 字でしか 鍵を 避けず すり抜けた
     ・サーバは 1 分ずっと 同じ鍵を 配っていたので 全員が 巻き添えに なった
   ＝「繋がらないことがある」の 正体。ここは その 直しを 守る。 */
ok("★ 開始位置を回す（いつも 1 本目から試さない・人ごとにも ずらす）",
  /const spin = \(Math\.floor\(Date\.now\(\) \/ 60000\) \+ 人ずれ\) % keys\.length/.test(W)
  && /人ずれ = \(人ずれ \* 31 \+ uid\.charCodeAt\(i\)\)/.test(W));
ok("★ 駄目だった鍵を 避けられる（端末の 控えも 含めて）",
  /const avoid = Array\.isArray\(body\?\.avoid\)/.test(W)
  && /avoid: 避ける鍵\(\)/.test(IDX)
  && /function 避ける鍵\(\)/.test(IDX));
ok("★★ setup まで 行けずに 切れたら **理由を問わず 別の鍵で取り直す**",
  /if \(!ready && st\.on && st\.keyIndex >= 0/.test(IDX)
  && /st\.badKeys = \(st\.badKeys \|\| \[\]\)\.concat/.test(IDX)
  && /鍵控えに足す\(st\.keyIndex, why\)/.test(IDX));
ok("★ 出入り禁止は 長く・混雑は 短く 覚える",
  /denied\|permission\|forbidden\|unregistered\|invalid\|expired\|API key/.test(IDX)
  && /6 \* 3600 \* 1000 : 90 \* 1000/.test(IDX));
ok("★ 使えない鍵は サーバでも 覚える（ほかの人が 踏まない）",
  /avoidWhy/.test(IDX) && /liveBadKeysFrom\(body\?\.avoidWhy/.test(W)
  && /LIVE_BAD_KEYS_ROW/.test(W));
ok("★ 鍵が 本当に 話せるかを 点検できる",
  /path === "\/api\/live\/keys\/check"/.test(W) && /liveKeyHandshake/.test(W));
/* 2026-08-16 実測: これは **1 日の上限ではない**。1 分ほどで戻る。
   「今日はおしまい」と言うのは間違いだったので、待って もう一度にした。 */
ok("　全部混んでいたら 待って もう一度（今日はおしまい、と言わない）",
  /st\.waitN \* 10000/.test(IDX) && !/今日はもう話せません/.test(IDX));
ok("　どの鍵で取ったかを返す", /keyIndex: usedKey/.test(W) && /keyCount: keys\.length/.test(W));

sec("★ 外部検索は 付けない（実測で全滅した）");
ok("★ 既定では付けない（VQ_SEARCH のときだけ）",
  /if \(root\.VQ_SEARCH && !st\.noSearch\)/.test(IDX)
  && /繋ぐたびに毎回 1011 で弾かれた/.test(IDX));
ok("　付けたときは 理由を問わず外して試す（quota と誤認しない）",
  /if \(!ready && !st\.noSearch && st\.on && root\.VQ_SEARCH\)/.test(IDX));
/* ★ 2026-08-16: 「消さずに、押し直させる」から **「預かって こちらが送る」**へ
   進めた。守る中身（打った字を失わせない）は同じで、手間を利用者に返さない分
   厳しい。よって 古い投げ返しの文言が **残っていないこと**まで求める。 */
ok("★ 繋がっていないとき 打った字を 投げ返さない",
  !/まだ繋がっていません。少し待ってから もう一度送ってね/.test(IDX));
ok("★ どの道でも 打った字は残る（預ける / 戻す）",
  /st\.預かり = t;/.test(IDX) && /st\.barTa\.value = 消;/.test(IDX));
ok("　書き直したら また押せる（保険の見張り）", /st\.barIv = setInterval/.test(IDX));

sec("★ ログインで詰まらせない");
ok("★ 学年ちがいだと そう伝える（合言葉を疑わせない）",
  /\*\*学年\*\*が違っているかもしれません/.test(W)
  && /nickname_norm = \?1 AND grade_prefix <> \?2/.test(W));
ok("　いない相手には 何も漏らさない",
  /学年ちがい\n\s*\? "ログインできませんでした/.test(W)
  || /: "ログイン情報が正しくありません。" \}, 401\);/.test(W));
ok("　入れた学年を覚える仕組みがある", /app\.auth\.lastGrade/.test(IDX));

sec("★ 押し間違いを防ぐ");
/* 決まりを変えた（2026-08-16）: 番号がずれても **名前が合えば探して押す**。
   「何度押してと言ってもダメ」を直すため。取り違えは名前で守る。 */
ok("番号がずれても 名前が合えば押す。名前も違えば押さない",
  /if \(!again\) \{\n\s*return \{ だめ: "「" \+ want \+ "」はいまの画面にありません。/.test(IDX));
ok("見る前に押させない", /まだ画面を見ていません。先に lookScreen/.test(IDX));
ok("押したら **押したあとの画面** を一緒に返す（喋って止まっていた）",
  /now\.押した = it\.name;/.test(IDX));
ok("待つ道具に対応している（Promise.all で 1 通にまとめる）",
  /Promise\.all\(m\.toolCall\.functionCalls\.map/.test(IDX));
ok("道具の中身を **そのまま** 返す（前は決まり文句に置き換えて捨てていた）",
  /if \(v && typeof v === "object"\) \{/.test(IDX)
  && /return \{ id: fc\.id, name: fc\.name, response: v \};/.test(IDX));

sec("★ 戻せない操作は勝手に押さない");
ok("消す・退会・支払いは 口で確かめるまで押さない",
  /利用者に声で確かめて、いいと言われたら sure を true/.test(IDX));
ok("「プリセット」が「リセット」に当たらない",
  /replace\(\/プリセット\/g, ""\)/.test(IDX));
ok("Lumi にも 声で確かめるよう教えてある",
  /必ず声で確かめてから/.test(W) && /勝手に押してはいけません/.test(W));

sec("★ 秘密を読み上げない");
ok("合言葉・暗証番号の中身は名前にしない",
  /ty2 === "password" \|\| \/password\|one-time-code\//.test(IDX));

sec("★ 入り切りの状態が分かる");
ok("切のときも そう書く（ただのボタンと区別できないと逆にしてしまう）",
  /aria-pressed" \) === "true" \? "入り切り\(入\)" : "入り切り\(切\)"/.test(IDX)
  || /"入り切り\(入\)" : "入り切り\(切\)"/.test(IDX));
ok("いま選ばれている画面も分かる", /"ボタン\(いま\)"/.test(IDX));

sec("読み上げる相手を考えている");
ok("一覧は 45 件まで", /var LIM = 45;/.test(IDX));
ok("探したい言葉があれば 前へ出す", /got\.sort\(function \(a, b\)/.test(IDX));

sec("★ Lumi が 自分で 1 問ずつ作る（2026-08-17）");
/* ★ 訴え「10問 作らせると 1 プリセットに 1 問で、10 個できてしまう」
       「形式を AI に渡すのではなく、LUMI Live 自身が 1 問ずつ作れるように」
       「これならコスト 0 じゃね？」。
   実測（開発版・実会話 2026-08-17）:
     startDraft ×1 → addQuestion ×10 → editQuestion ×1 → saveDraft ×1、
     makePreset は **0 回**。プリセット 1 個に 10 問、形式は 7 種類。
     クイズに出せない問 0・解説の無い問 0。 */
ok("★★ 入れ物・1 問追加・保存 の 3 つがある",
  /function startDraft/.test(IDX) && /function addQuestion/.test(IDX)
  && /function saveDraft/.test(IDX));
ok("★★ 3 つとも AI に渡してある",
  /fn\("startDraft"/.test(W) && /fn\("addQuestion"/.test(W) && /fn\("saveDraft"/.test(W));
ok("★★ 保存は **最後に 1 回だけ**と教えてある（1 問ずつ別プリセットにしない）",
  /1 つのプリセットに 全問/.test(W) && /saveDraft は いちばん最後の 1 回だけ/.test(W));
ok("★★ 1 問ごとに確かめないと教えてある（利用者の訴え）",
  /1 問ごとに『これでいい？』と聞かないでください/.test(W)
  && /黙って最後まで通します/.test(W));
ok("★★ makePreset（生成 AI）は **最後の手**に落としてある",
  /\*\*最後の手\*\* です。生成 AI に問題を作らせます/.test(W)
  && /問題は addQuestion で \*\*自分で\*\* 作ります/.test(W));
ok("★★ 形式は 20 エンジンぶん 全部 組み立てられる",
  /e === "single_choice" \|\| e === "image_choice" \|\| e === "audio_choice"/.test(IDX)
  && /e === "multi_choice"/.test(IDX) && /e === "true_false"/.test(IDX)
  && /e === "fill_blank"/.test(IDX) && /e === "reorder"/.test(IDX)
  && /e === "matching"/.test(IDX) && /e === "classification"/.test(IDX)
  && /e === "table_fill"/.test(IDX) && /e === "chart_read"/.test(IDX)
  && /e === "dictation"/.test(IDX) && /e === "error_correction"/.test(IDX)
  && /e === "free_text"/.test(IDX) && /e === "flashcard"/.test(IDX)
  && /e === "composite"/.test(IDX));
ok("★★ 画像が要る 3 エンジンは **作れるふりをせず 断る**",
  /var 声で作れない = \{/.test(IDX) && /image_choice:/.test(IDX)
  && /image_point:/.test(IDX) && /image_label:/.test(IDX)
  && /声だけでは作れません/.test(IDX));
ok("★★ 組み立てたら **その場で確かめて、通らなければ入れない**",
  /M\.validateQuestion\(q2, "問", 指摘, \{ strict: true \}\)/.test(IDX)
  && /入っていないので、作れたことにしないでください/.test(IDX));
ok("★★ 図表の値の数が合わないときは **数を作り足さない**",
  /数を作り足さないでください/.test(IDX));
ok("★ 選んで答える穴埋めは 語群が要る（語を こしらえない）",
  /d\.defaults && d\.defaults\.blankMode === "select"/.test(IDX)
  && /語群/.test(IDX));
ok("★★ 保存は **読み直して**から返す（ok だけを信じない）",
  /S2\.getPreset\(p\.id, \{\}\)/.test(IDX)
  && /保存したはずですが、読み直すと見つかりません/.test(IDX));
ok("★ 保存したら 一覧の画面に出して、見えたかを返す",
  /openScreen\("presets"\)/.test(IDX) && /一覧に出した:/.test(IDX));
ok("★★ 途中の追加の指示を受ける口がある（作り直さない）",
  /function editQuestion/.test(IDX) && /function removeQuestion/.test(IDX)
  && /fn\("editQuestion"/.test(W) && /はじめから作り直さないでください/.test(W));
ok("★ 形式の一覧を 声から見られる（毎回 4 択にしない）",
  /function listFormats/.test(IDX) && /fn\("listFormats"/.test(W)
  && /毎回 4 択にしないでください/.test(W));
ok("★★ 同じ問題を 2 回 入れない（つなぎ直しの直後に重なる）",
  /同じ問題が すでに/.test(IDX) && /つなぎ直しのあと 同じ問題が 2 回入るのを止める/.test(IDX));
ok("★★ 同じ仲間の形式が 続いたら その場で数えて知らせる（毎回 4 択を防ぐ）",
  /同じ仲間の形式が/.test(IDX) && /これまでの形式: 形式の内訳\(qs\)/.test(IDX));
ok("★ 「混ぜて」と言われたら 4 種類以上と教えてある",
  /少なくとも 4 種類\*\* 使ってください/.test(W));
ok("★★ 資料の知らせは **相手が黙るまで待って**から出す",
  /var 空いている = function \(\) \{/.test(IDX)
  && /!st\.speaking && !st\.inTurn && !st\.heard/.test(IDX));
ok("★ 会話を閉じたら 資料は持ち越さない／下書きは残して そう伝える",
  /if \(資料\.length\) \{ 資料 = \[\]; \}/.test(IDX)
  && /下書きが " \+ 作り中\.p\.questions\.length \+ " 問 残ってるよ/.test(IDX));
ok("★ 捨てるときだけ 声で確かめる",
  /function discardDraft/.test(IDX) && /a\.sure === true/.test(IDX));

sec("★ 走っているうちは 終わらせない（2026-08-17）");
/* ★ 訴え「タスクが終わってもいないのに 終わったと認識し、
       処理中なのにホームに戻ってしまう」。
   実測: 下書きが未保存のまま finishTask も openScreen(home) も断られ、
       もう一度呼べば ホームへは戻れる（断りっぱなしにしない）。 */
ok("★★ 走っているものを 1 か所にまとめてある",
  /function まだ動いている/.test(IDX));
ok("★★ finishTask は 走っている間 通らない",
  /var 走 = まだ動いている\(\);/.test(IDX)
  && /走っているもの: 走/.test(IDX));
ok("★★ ホームへ戻るのも 走っている間は止める",
  /if \(n0 === "home"\) \{/.test(IDX) && /ホームへは戻していません/.test(IDX));
ok("★ ただし もう一度 言われたら 戻す（断りっぱなしにしない）",
  /st\.ホーム断り/.test(IDX) && /60000/.test(IDX));
ok("★ 生成が走っているかを 画面側から読める",
  /生成中: function \(\)/.test(IDX) && /st\.draft\.state === "generating"/.test(IDX));
ok("★★ 走っている間は「終わった」と言うなと教えてある",
  /走っているものがあるうちに『終わった』と言わないでください/.test(W));

sec("★ 資料をつけて Live が読む（2026-08-17）");
/* ★ 「資料を添付できるようにすれば、それを Live が読んで、
       その資料に関するプリセットを作れる」。
   実測: テキストと CSV を つけて、readAttachment で中身が読め、
       そこから 4択と 組み合わせを 1 プリセットに作れた。 */
ok("★★ 会話の帯に 資料をつける口がある",
  /class="pick" type="file" multiple hidden/.test(IDX)
  && /class="clip" type="button" aria-label="資料をつける"/.test(IDX));
ok("★★ 取り出しは アプリの既存の道を使う（PDF・DOCX・ZIP・CSV）",
  /root\.__vqChatFiles/.test(IDX) && /function 資料を取り込む/.test(IDX));
ok("★★ Quick Chat の下書きを汚さない（読んだら外す）",
  /F\.remove\(x\.id\)/.test(IDX) && /Quick Chat の下書きを汚さない/.test(IDX));
ok("★★ 中身は 丸ごと流さず、要るところだけ読ませる",
  /function readAttachment/.test(IDX) && /var 上限 = 6000;/.test(IDX)
  && /fn\("readAttachment"/.test(W));
ok("★★ 読んでいない所から 作るなと教えてある",
  /読んでいない所から 問題や答えを作ってはいけません/.test(W));
ok("★ 画像は 絵のまま送る（文字が取れないので）",
  /function 絵を送る/.test(IDX) && /realtimeInput: \{\s*\n?\s*video: \{ mimeType: "image\/jpeg"/.test(IDX));
ok("★ 文字が取れなかったら 正直に言う",
  /文字が取れませんでした。写しの PDF かもしれません/.test(IDX));

sec("★ 噛み合わない所を 0 にする（2026-08-17）");
/* ★ 訴え そのまま:
     ①「これ回答して次の問題いこ」→ 最後の問題を **答えずに終わろうとした**
     ②「終わりますか？」の窓で「一度閉じて」→ **プリセット一覧まで戻った**
     ③ 採点は出るのに **次の問題へ行かない**
     ④ 穴埋めの空欄が【1】でなく [ ] のまま出る
   実測（flow.cjs・開発版）: 18 / 18 通過。 */
ok("★★ Lumi の startQuiz は **画面のボタンと同じ新しいクイズ画面**を開く",
  /VQ2\.quizPlayer\.open\(\{ preset: p2, mode: "practice", resume: false \}\)/.test(IDX)
  && /Lumi だけ 別の画面を開いていた/.test(IDX));
ok("★★ いまの答えは **写しでなく その場で読む**（記入系で必ず刺さっていた）",
  /いまの答え: function \(\)/.test(IDX)
  && /typeof now\.いまの答え === "function"\) \? now\.いまの答え\(\)/.test(IDX));
ok("★★ 答えないまま next / grade は 通さない（skip のときだけ通す）",
  /まだ答えていません/.test(IDX) && /a\.skip === true/.test(IDX)
  && /fn\("quizMove"/.test(W) && /skip: B\(/.test(W));
ok("★★ 次へは **効くまで繰り返す**（採点が出るだけで止まらない）",
  /効くまで押す/.test(IDX) && /var 押す = function \(のこり\)/.test(IDX)
  && /return 押す\(4\);/.test(IDX));
ok("★★ 答えたら **その場で採点も返す**（ここはこうだね、が言える）",
  /採点を見る: function \(\)/.test(IDX) && /出した採点: 採点/.test(IDX)
  && /採点を伝えただけで 止まらないこと/.test(IDX));
ok("★★ 「答える→採点→次へ」を 1 本の流れだと教えてある",
  /「答える → 採点を伝える → 次へ」は 1 本の流れです/.test(W)
  && /次の問題へ移るまで やりきってください/.test(W));
ok("★★ 確認の窓を **見つけられる**（窓は画面の中に作られる）",
  /function いまの窓/.test(IDX) && /var 窓のしるし =/.test(IDX));
ok("★★ 幽霊の覆いを 窓と間違えない（中身があるかで見分ける）",
  /function 窓の中身がある/.test(IDX) && /幽霊の覆いに気をつける/.test(IDX)
  && /vqImgLightbox/.test(IDX));
ok("★★ closeScreen は **窓だけ**を閉じる（下の画面は残す）",
  /確認の窓が出ていたら、先に その窓だけを閉じる/.test(IDX)
  && /下の画面（クイズなど）は そのまま開いています/.test(IDX));
ok("★★ 窓が出ていたら 見る・読むも **窓の中だけ**",
  /確認の窓が出ています = 窓の題/.test(IDX)
  && /いまは この窓が前に出ています。窓の中しか押せません/.test(IDX));
ok("★★ 最後の問題の next は「動きませんでした」ではなく 窓が出たと返す",
  /最後の問題だったので、\*\*採点していいかの確認\*\*が出ました/.test(IDX));
ok("★★ 窓のときの言い方を 教えてある（勝手に採点しない）",
  /【確認の窓が出たとき】/.test(W)
  && /窓は こちらで勝手に決めないでください/.test(W)
  && /クイズごと閉じて プリセット一覧まで戻っていました/.test(W));
ok("★★ 穴埋めの空欄は 【1】 にそろえる（[ ] のまま出さない）",
  /空欄の印を そろえる/.test(IDX) && /"【" \+ 番 \+ "】"/.test(IDX)
  && /空欄の印が " \+ 番 \+ " 個なのに/.test(IDX));
ok("★ 空欄の書き方を AI にも教えてある",
  /穴埋めの空欄は 【1】【2】… と書きます/.test(W));
ok("★★ クイズを閉じたら 「いま解いている問題」を消す",
  /root\.VQ2\.quizNow = null/.test(IDX)
  && /Lumi は「まだクイズを解いている」と思い込んで/.test(IDX));

sec("★ アプリ全体の書体（2026-08-17）");
/* ★ 「システムの既定が 1 つだけ。何十種類かから選べるように。
     可愛い系・日本風・明るい系・ポップ・悲しい・チル・静かで落ち着く」。
   実測（font.cjs / wpfont.cjs・開発版）: 61 種類・9 つの気分、15/15 と 10/10 通過。 */
ok("★★ 書体の表がある（気分ごと）",
  /var FONTS = \[/.test(IDX) && /気: "可愛い"/.test(IDX) && /気: "日本風"/.test(IDX)
  && /気: "静かで落ち着く"/.test(IDX) && /気: "明るい・ポップ"/.test(IDX)
  && /気: "チル"/.test(IDX) && /気: "切ない"/.test(IDX));
ok("★★ 設定から選べる", /id: "display\.fontFamily"/.test(IDX) && /apply: applyFont/.test(IDX));
ok("★★ 選んだものだけ 取りに行く（全部は読み込まない）",
  /function 書体を取り寄せる/.test(IDX) && /取った書体\[f\.g\]/.test(IDX));
ok("★★ アイコン・数式・コードは 触らない",
  /var 触らない =/.test(IDX) && /:not\(\.katex \*\)/.test(IDX)
  && /material-symbols/.test(IDX));
ok("★★ **Workplace の書類は 染めない**（利用者の訴え）",
  /var 書類の器 = \[/.test(IDX) && /"\.wp-main"/.test(IDX)
  && /書類側で選んだ書体/.test(IDX));
ok("★★ ちらつき対策① アプリが動く前に貼る",
  /id="vq-font-early"/.test(IDX) && /vq\.font\.v1/.test(IDX));
ok("★★ ちらつき対策② display=block（システムを先に出さない）",
  /display=block/.test(IDX) && /先にシステムの書体で描いてから/.test(IDX));
ok("★★ ちらつき対策③ 影は できた瞬間に配る",
  /function 影ができたら配る/.test(IDX) && /E\.attachShadow = function/.test(IDX)
  && /一瞬だけ システムの書体/.test(IDX));

sec("★ ダークの見えかた・ヘルプ（2026-08-17）");
ok("★★ ストレージの上のカードが 明暗どちらでも読める（#fff の直書きを外した）",
  /linear-gradient\(180deg,var\(--vq-surface-hover,#FaF9FE\),var\(--vq-surface,#fff\)\)/.test(IDX)
  && /下の止まり色が \*\*#fff の直書き\*\*だった/.test(IDX));
ok("★★ ヘルプが いまのアプリの中身になっている",
  /id: "lumi", t: "Lumi（声で使える AI）"/.test(IDX)
  && /id: "make", t: "問題を作る"/.test(IDX)
  && /id: "workplace", t: "Workplace/.test(IDX)
  && /id: "look", t: "見た目（テーマ・書体）"/.test(IDX));
ok("★ 古いままの記述が残っていない",
  !/TURN は順番どおり、RANDOM は入れ替えて/.test(IDX));
ok("★ ヘルプに 空欄の書きかたが載っている",
  /穴埋めの空欄はどう書きますか/.test(IDX) && /この形だけが空欄の箱になります/.test(IDX));

sec("★★ 道具の宣言そのものが 壊れていないか（2026-08-17）");
/* ★ 実際に起きた事故: editPresetQuestions の edits.items へ
     **スキーマではなく properties の表**を渡してしまい、
     Gemini が setup を 1007 で弾き、**Lumi がまったく起動しなくなった**。
     文字の一致では捕まえられないので、**宣言を実際に組み立てて 形を確かめる。** */
(function 道具の形を確かめる() {
  var src = W.slice(W.indexOf("function liveTools()"));
  src = src.slice(0, src.indexOf("\n}\n") + 3);
  var tools;
  try { tools = new Function("return (" + src + ")()")(); }
  catch (e) { ok("★★ liveTools を組み立てられる", false); return; }
  ok("★★ liveTools を組み立てられる", Array.isArray(tools) && tools.length > 0);
  var decls = (tools[0] && tools[0].functionDeclarations) || [];
  ok("★★ 道具が 40 個以上ある", decls.length >= 40);

  var 型 = ["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT"];
  var 悪 = [];
  var みる = function (node, 道) {
    if (!node || typeof node !== "object") { 悪.push(道 + ": 中身がない"); return; }
    if (型.indexOf(node.type) < 0) { 悪.push(道 + ": type が " + JSON.stringify(node.type)); return; }
    if (node.type === "ARRAY") {
      if (!node.items) { 悪.push(道 + ".items: 無い"); return; }
      みる(node.items, 道 + ".items");
    }
    if (node.type === "OBJECT") {
      var ps = node.properties || {};
      /* 入れ物の無い道具（readClock など）は 根が空でよい。
         中に入れた OBJECT が空なのは、渡すものが決まらないので駄目。 */
      if (!Object.keys(ps).length) {
        if (道.indexOf(".") >= 0) 悪.push(道 + ".properties: 空");
        return;
      }
      Object.keys(ps).forEach(function (k) { みる(ps[k], 道 + "." + k); });
      (node.required || []).forEach(function (k) {
        if (!ps[k]) 悪.push(道 + ".required: 無い項目 " + k);
      });
    }
  };
  decls.forEach(function (d) {
    if (!d.name) { 悪.push("(名前なし)"); return; }
    if (!d.parameters) { 悪.push(d.name + ": parameters が無い"); return; }
    みる(d.parameters, d.name);
  });
  ok("★★ **どの道具の形も 正しい**（これが崩れると Lumi が起動しない）",
    悪.length === 0);
  if (悪.length) 悪.slice(0, 6).forEach(function (x) { console.log("      ← " + x); });

  /* 名前の重なりも見る（同じ名前が 2 つあると、片方が黙って効かない） */
  var 見た = {}, 重 = [];
  decls.forEach(function (d) { if (見た[d.name]) 重.push(d.name); 見た[d.name] = 1; });
  ok("★ 同じ名前の道具が 2 つ無い", 重.length === 0);

  /* 画面側に受け口があるか（宣言だけあって 呼べない道具を作らない） */
  var 無い = decls.map(function (d) { return d.name; }).filter(function (n) {
    return IDX.indexOf('name === "' + n + '"') < 0;
  });
  ok("★★ 宣言した道具は ぜんぶ 画面側に受け口がある", 無い.length === 0);
  if (無い.length) console.log("      ← 受け口が無い: " + 無い.join(", "));
})();

sec("★ プリセットの整理と 保存済みの直し（2026-08-17）");
/* ★ 訴え「一覧から削除・名前・概要・アイコン・バナーを自律的に」
     「『3 問目を記述にして』『3 問目を◯◯の問題にして』が通らない」。
   実測（edit.cjs・開発版）: 27 / 27 通過。 */
ok("★★ 保存済みの問題を **形式ごと 作り直せる**（addQuestion と同じ組み立て）",
  /var 中身の鍵 = \["type", "choices"/.test(IDX)
  && /出\.q\.id = q\.id;/.test(IDX)
  && /番号と内部 ID は 引き継ぐ/.test(IDX));
ok("★★ 足りないまま 入れない（入らなかったものを返す）",
  /入らなかったもの: 断り\.length \? 断り : undefined/.test(IDX));
ok("★★ 文だけの直しは これまでどおり通る",
  /文だけ差し替える（骨はそのまま）/.test(IDX));
ok("★★ AI にも 2 通りの直しかたを教えてある",
  /形式や中身ごと 作り直す/.test(W) && /3 問目を記述にして/.test(W)
  && /『直せません』『作り直してください』と言わないでください/.test(W));
ok("★★ 名前・説明・アイコン・バナーを 声から直せる",
  /function editPreset\(a\)/.test(IDX) && /fn\("editPreset"/.test(W));
ok("★★ アイコンは **画面が持っている一覧の中から**（無い名前は断る）",
  /function iconFind/.test(IDX) && /に当たるアイコンがありません/.test(IDX));
ok("★★ バナーは 頼まれたときだけ作る（費用がかかる）",
  /function makeBannerFor/.test(IDX) && /a\.makeBanner === true/.test(IDX)
  && /頼まれたときだけ/.test(W));
ok("★★ 問題を 足す・減らすもできる",
  /function addPresetQuestion/.test(IDX) && /function removePresetQuestion/.test(IDX)
  && /fn\("addPresetQuestion"/.test(W) && /fn\("removePresetQuestion"/.test(W));
ok("★★ 消したものが **戻ってこない**（V1 の写しも消す）",
  /opts\.alsoV1 === true/.test(IDX) && /S2\.deletePreset\(p\.id, \{ alsoV1: true \}\)/.test(IDX)
  && /消したのに残っている/.test(IDX));
ok("★ 名前が分かっていれば 一覧を見ていなくても消せる",
  /名前が分かっているなら 一覧を見ていなくても消せる/.test(IDX));

sec("★ まず段取りを立ててから動く（2026-08-17）");
/* ★ 「Claude Code のように、3〜5 問 質問してから 構造的に自律で動いてほしい」。 */
ok("★★ 聞いてから動く 2 段の作りがある",
  /function askPlan/.test(IDX) && /function startPlan/.test(IDX)
  && /fn\("askPlan"/.test(W) && /fn\("startPlan"/.test(W));
ok("★★ 質問は 3〜5 個に限る",
  /qs\.length < 3 \|\| qs\.length > 5/.test(IDX) && /5 個より多く聞かないでください/.test(W));
ok("★★ 答えが揃うまで 動かない",
  /まだ答えをもらっていない質問があります/.test(IDX)
  && /揃うまでは 何も作りません/.test(W));
ok("★★ 揃ったら 最後まで一気に（もう確かめない）",
  /ここから最後まで 一気に通してください/.test(IDX)
  && /そこから先は もう確かめずに、最後まで一気に/.test(W));
ok("★ 急いでいる人を 質問で足止めしない",
  /急いでいる人を質問で足止めしないこと/.test(W));
ok("★ プリセットに限らず どの仕事でも使える",
  /プリセットに限らない。資料づくり・片づけ・設定の見直しにも使う/.test(IDX));

/* ── 実際に動かす（VQ_LIVE=1 のときだけ）───────────────────────── */
if (process.env.VQ_LIVE === "1") {
  const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
  if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
    console.error("本番では実行しません。"); process.exit(2);
  }
  (async () => {
    sec("実際に動かす（" + BASE + "）");
    const { chromium } = require("playwright");
    const br = await chromium.launch();
    const pg = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    /* ★ **メール登録の関門を越えた**アカウントで測る。
       ただ register するだけだと、画面が関門で覆われて何も描かれず、
       一覧が空になる（実測で丸ごと落ちた）。 */
    const J = (u, b, h) => fetch(BASE + u, { method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, h || {}),
      body: JSON.stringify(b) }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => ({})) }));
    const nick = "rt" + Date.now().toString(36).slice(-6);
    let g0 = await J("/api/auth/register/start", { gradePrefix: "H1", nickname: nick, loginId: nick,
      password: "DevGen#2026a", email: nick + "@gmail.com", tosAccepted: true, tosVersion: "1" });
    if (!g0.j.devCode) { console.error("開発版の確認コードが返りません: " + JSON.stringify(g0.j).slice(0, 160)); process.exit(1); }
    const cid0 = g0.j.challengeId;
    g0 = await J("/api/auth/register/verify", { challengeId: cid0, code: g0.j.devCode });
    const sess0 = g0.j.registrationSession;
    g0 = await J("/api/auth/register/consent", { challengeId: cid0, registrationSession: sess0,
      agreeTerms: true, agreePrivacy: true, tosVersion: "1", pin: "482913" },
      { Authorization: "Bearer " + sess0 });
    const reg = g0.j;
    if (!reg.token) { console.error("アカウントを作れません: " + JSON.stringify(g0.j).slice(0, 160)); process.exit(1); }
    await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), reg.token);
    await pg.reload({ waitUntil: "domcontentloaded" });
    /* ★ 8 秒待つ。5 秒では描き終わっておらず、一覧が 9 件しか出ない（実測）。 */
    await pg.waitForTimeout(8000);

    const look = (w) => pg.evaluate((q) => window.__vqLive.look(q), w || "");
    const tap = (n, nm) => pg.evaluate((a) => Promise.resolve(window.__vqLive.tap(a.n, a.nm)), { n, nm });
    const choose = (n, o) => pg.evaluate((a) => Promise.resolve(window.__vqLive.choose(a.n, a.o)), { n, o });
    const find = (r, re) => { const i = r.操作できるもの.findIndex((x) => re.test(x)); return i < 0 ? 0 : i + 1; };

    /* 案内の窓が出ていたら閉じる（利用者も Lumi も同じことをする） */
    for (let k = 0; k < 4; k++) {
      const r0 = await look("");
      const i = r0.操作できるもの.findIndex((x) => /あとで見る|使ってみる|わかった/.test(x));
      if (i < 0) break;
      const nm0 = r0.操作できるもの[i].replace(/^\d+\.\s*\S+?「/, "").replace(/」.*$/, "");
      await tap(i + 1, nm0);
      await pg.waitForTimeout(1400);
    }
    let r = await look();
    ok("ホームで一覧が取れる（20 件以上）", r.操作できるもの.length >= 20,
      r.操作できるもの.length + " 件");
    ok("幽霊が混ざっていない（閉じたメニューの『同意して連携』が無い）",
      !r.操作できるもの.some((x) => /同意して連携|画像をダウンロード/.test(x)));

    r = await look("設定");
    const n1 = find(r, /「設定」/);
    ok("「設定」が見つかり、探した言葉が先頭へ来る", n1 === 1);
    r = await tap(n1, "設定");
    ok("押したら 押したあとの画面が返る", !!r.押した && !!r.操作できるもの);
    ok("設定の中身が見えている（影の中）",
      r.操作できるもの.some((x) => /「画面と表示」/.test(x)));
    ok("名前に説明文が混ざっていない",
      !r.操作できるもの.some((x) => /時刻で切り替えます/.test(x)));
    ok("並んだボタンに 隣の見出しが付いていない",
      !r.操作できるもの.some((x) => /「学習: (AI|音|データ)」/.test(x)));

    const n2 = find(r, /選ぶ欄「テーマ/);
    ok("選ぶ欄の名前が「テーマ（いま: …）」になっている", n2 > 0);
    const before = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
    r = await choose(n2, "ライト");
    await pg.waitForTimeout(600);
    const after = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok("選ぶ欄から選ぶと 本当に変わる（" + before + " → " + after + "）", before !== after);

    /* ── 解いている最中に 問題文が読めるか（利用者の一番の要望）── */
    const nn = "qz" + Date.now().toString(36).slice(-6);
    let g = await J("/api/auth/register/start", { gradePrefix: "H1", nickname: nn, loginId: nn,
      password: "DevGen#2026a", email: nn + "@gmail.com", tosAccepted: true, tosVersion: "1" });
    if (g.j.devCode) {
      const cid = g.j.challengeId;
      g = await J("/api/auth/register/verify", { challengeId: cid, code: g.j.devCode });
      const sess = g.j.registrationSession;
      g = await J("/api/auth/register/consent", { challengeId: cid, registrationSession: sess,
        agreeTerms: true, agreePrivacy: true, tosVersion: "1", pin: "482913" }, { Authorization: "Bearer " + sess });
      if (g.j.token) {
        const p2 = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
        await p2.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
        await p2.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), g.j.token);
        await p2.reload({ waitUntil: "domcontentloaded" });
        await p2.waitForTimeout(9000);
        const L = (w) => p2.evaluate((q) => window.__vqLive.look(q), w || "");
        const T = (n, nm) => p2.evaluate((a) => Promise.resolve(window.__vqLive.tap(a.n, a.nm)), { n, nm });
        const nameAt = (rr, i) => rr.操作できるもの[i - 1].replace(/^\d+\.\s*\S+?「/, "").replace(/」.*$/, "");
        /* 案内 → プリセット → 案内 → 開始 */
        for (let k = 0; k < 6; k++) {
          const r0 = await L("");
          let i = r0.操作できるもの.findIndex((x) => /あとで見る|使ってみる|わかった|はじめる|閉じる/.test(x));
          if (i >= 0) { await T(i + 1, nameAt(r0, i + 1)); await p2.waitForTimeout(1400); continue; }
          i = r0.操作できるもの.findIndex((x) => /「プリセット」/.test(x));
          if (i >= 0 && !/を開始/.test(r0.操作できるもの.join(""))) {
            await T(i + 1, "プリセット"); await p2.waitForTimeout(1600); continue;
          }
          i = r0.操作できるもの.findIndex((x) => /を開始/.test(x));
          if (i >= 0) { await T(i + 1, nameAt(r0, i + 1)); await p2.waitForTimeout(2500); break; }
          break;
        }
        const rd = await p2.evaluate(() => window.__vqLive.read());
        const txt = (rd.書いてあること || []).join("\n");
        ok("★ 解いている問題の 問題文が読める", /問\s*\d|どれか|なにか|何か|説明/.test(txt),
          "先頭: " + (rd.書いてあること || [])[0]);
        ok("★ 選択肢も読める", /(^|\n)[ABCD] /.test(txt) || /[①②③④]/.test(txt));
        ok("★ 後ろのプリセット一覧が混ざらない", !/公開プリセット|お気に入り 0/.test(txt));
        const lq = await L("");
        ok("★ 選択肢が 押せるものとして並ぶ",
          lq.操作できるもの.filter((x) => /^\d+\. \S+「[ABCD] /.test(x)).length >= 3);
        await p2.close();
      }
    }

    /* 番号のずれを防いでいるか */
    const bad = await pg.evaluate(() => Promise.resolve(window.__vqLive.tap(1, "ぜったいに無い名前")));
    ok("名前が食い違ったら 押さずに知らせる", !!bad.だめ);

    await br.close();
    console.log("\n" + (fail ? "❌ 落ちています" : "✅ 全部通りました")
      + "  通過 " + pass + " / 失敗 " + fail);
    process.exit(fail ? 1 : 0);
  })().catch((e) => { console.error("動かせませんでした: " + e.message); process.exit(1); });
} else {
  console.log("\n（実際に動かす試験は VQ_LIVE=1 で走ります）");
  console.log("\n" + (fail ? "❌ 落ちています" : "✅ 全部通りました")
    + "  通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
}
