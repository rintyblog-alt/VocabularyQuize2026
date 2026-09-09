/* ══════════════════════════════════════════════════════════════════════
   問題文と 形式の 食い違いを 見つけられるか（実 AI 不要）。

   訴え（2026-09-06・Rinty さん）:
     「(2) とか 選べって 言ってんのに 選ぶものが なかったり、
       (3) も 空欄 2 個 あるのに、右の 解答欄では なぜか 記述」

   ★ ここは **落とす** 判定なので、間違えると 正しい 問題まで 消える。
     「落とすべきものを 落とす」より「落として はいけない ものを 残す」
     ほうを 厚く 見る。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/server/src/worker.js", "utf8");

/* 必要な 関数だけ 抜いて 動かす（worker 全体は 起こさない）。 */
function 抜く(名) {
  const 頭 = src.indexOf("function " + 名 + "(");
  if (頭 < 0) throw new Error("見つかりません: " + 名);
  let 深 = 0, 尾 = -1;
  for (let i = src.indexOf("{", 頭); i < src.length; i++) {
    if (src[i] === "{") 深++;
    else if (src[i] === "}") { 深--; if (深 === 0) { 尾 = i + 1; break; } }
  }
  return src.slice(頭, 尾);
}
function 定数(名) {
  const re = new RegExp("^const " + 名 + " = .*?;$", "m");
  const m = re.exec(src);
  if (!m) throw new Error("見つかりません: " + 名);
  return m[0];
}
const 場 = [
  定数("AIGEN_BLANK_MARK_RE"), 定数("AIGEN_PICK_RE"),
  "const AIGEN_WRITE_ENGINES = new Set(['free_text','long_answer','essay','english_writing','source_analysis']);",
  /* ★ **AIGEN_ENGINES も 要る**（2026-09-09 に 決まり③が 参照するように なった）。
     本体から 表 ごと 持って くると 巨大に なるので、この 検査で 要る
     「選ばせる 形式か どうか」だけを 写す。増えたら ここへ 足す。 */
  "const AIGEN_ENGINES = new Proxy({}, { get: (_, k) => ({ choiceBased:"
    + " ['single_choice','multi_choice','true_false','audio_choice','image_choice'].indexOf(String(k)) >= 0 }) });",
  抜く("aigenBlankNums"), 抜く("aigenPromptTypeMismatch"),
  "return aigenPromptTypeMismatch;"
].join("\n");
const 見つける = new Function(場)();

let 合 = 0, 否 = 0;
function 落ちる(名, q, engine) {
  const r = 見つける(q, engine);
  if (r) { console.log("  ✓ " + 名 + "\n      → " + r); 合++; }
  else { console.log("  ✗ " + 名 + "（落ちるべきなのに 通った）"); 否++; }
}
function 通る(名, q, engine) {
  const r = 見つける(q, engine);
  if (!r) { console.log("  ✓ " + 名); 合++; }
  else { console.log("  ✗ " + 名 + "（通るべきなのに 落ちた）\n      → " + r); 否++; }
}

console.log("\n══ 落とすべきもの ══\n");
落ちる("訴えの (3)：空欄 2 個 なのに 記述",
  { question: "2次方程式の解の公式において、b^2-4ac の値を【1】といい、これが【2】であるとき、その方程式は異なる2つの実数解を持つ。" },
  "free_text");
落ちる("空欄 3 個 なのに 記述",
  { question: "【1】と【2】と【3】を うめよ。" }, "long_answer");
落ちる("訴えの (2)：選べ と 言って いるのに 選択肢が 無い",
  { question: "2次不等式 x^2-5x+6<0 を満たす x の範囲として最も適当なものを選べ。", choices: [] },
  "single_choice");
落ちる("選択肢が 1 個 しか ない", { question: "正しいものを選べ。", choices: ["ア"] }, "single_choice");
落ちる("選択肢が 空文字 だけ", { question: "選びなさい。", choices: ["", "  "] }, "single_choice");

console.log("\n══ 資料に 触れて いるのに 資料が 無い ══\n");
落ちる("【グラフ1】に 触れて いるのに 資料が 無い",
  { question: "【グラフ1】から 読み取れる 変化として 最も 適当な ものを 選べ。", choices: ["ア","イ","ウ","エ"] },
  "single_choice");
落ちる("「表 1 から」に 触れて いるのに 資料が 無い",
  { question: "表 1 から 読み取れる ことを 説明せよ。" }, "free_text");
落ちる("本文（passage）だけ では 資料に ならない",
  { question: "図 2 の 位置を 答えよ。", materials: [{ type: "passage", text: "本文" }] },
  "text_input");

console.log("\n══ 通すべきもの（ここを 間違えると 全滅する）══\n");
通る("★ グラフに 触れて いて **資料が ある** なら 通す",
  { question: "【グラフ1】から 読み取れる 変化を 選べ。", choices: ["ア","イ","ウ","エ"],
    materials: [{ type: "passage", text: "本文" }, { type: "chart", chartType: "bar" }] },
  "single_choice");
通る("★ 「本文」「文章」だけを 指す 問いは 落とさない（本文は 必ず ある）",
  { question: "本文の 内容と 合致する ものを 選べ。", choices: ["ア","イ","ウ","エ"] },
  "single_choice");
通る("★ 「資料」の 二字だけでは 落とさない（言い回しに よく 出る）",
  { question: "この 資料的な 価値に ついて 説明せよ。" }, "free_text");
通る("★ 傍線部の 問いは 図表と 関係ない",
  { question: "傍線部A「…」と あるが、それは どういう ことか。最も 適当な ものを 選べ。",
    choices: ["ア","イ","ウ","エ"] }, "single_choice");
通る("★ 表現・図式 などの 語は 資料では ない",
  { question: "筆者の 図式的な 理解を 説明せよ。" }, "free_text");
通る("空欄 1 個 の 記述は 通す（穴が 1 つなら 記述で 答えられる）",
  { question: "【1】に 入る 語を 説明せよ。" }, "free_text");
通る("空欄 2 個 でも **穴埋め形式**なら 正しい",
  { question: "【1】と【2】を うめよ。", answers: ["A", "B"] }, "fill_blank");
通る("空欄の 無い 記述は そのまま",
  { question: "この 現象が 起きる 理由を 160 字 以内で 説明せよ。" }, "free_text");
通る("選択肢が ある 選択問題",
  { question: "最も適当なものを選べ。", choices: ["ア", "イ", "ウ", "エ"] }, "single_choice");
通る("★ 並べ替えは 札が 別の ところに ある（choices が 空でも 正しい）",
  { question: "正しい順に並べ、最も適当なものを選べ。", choices: [] }, "reorder");
通る("★ 対応づけも 同じ", { question: "当てはまるものを選べ。", choices: [] }, "matching");
通る("★ 分類も 同じ", { question: "どれか に 分けよ。当てはまるものを選べ。", choices: [] }, "classification");
通る("★ 表うめも 同じ", { question: "当てはまるものを選べ。", choices: [] }, "table_fill");
通る("問題文が 空でも 落とさない（別の 検査の 仕事）", { question: "" }, "free_text");
通る("問題そのものが 無くても 落ちない", null, "free_text");
通る("記述以外の 形式で 空欄が 多くても 触らない",
  { question: "【1】【2】【3】", choices: ["ア", "イ"] }, "single_choice");

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "\n");
process.exit(否 ? 1 : 0);
