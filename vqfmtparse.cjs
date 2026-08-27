/* ══════════════════════════════════════════════════════════════════════
   利用者の言い方を **読み取れているか**を、AI を使わずに確かめる。

   vqformat.cjs は実際に作らせて測る（本物・遅い・お金がかかる）。
   こちらは **読み取りだけ**を見るので、速くて、いつでも回せる。
   読み取りが壊れたら、作る前の段階で分かる。

   ★ 期待値は「利用者がそう書いたら、そう読めてほしい」で決める。
     内部の都合で弱めない。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

/* 必要な関数だけを **1 つのまとまり**として取り出して動かす。
   （別々に eval すると const どうしが見えない） */
function cut(from, to) {
  const a = SRC.indexOf(from);
  if (a < 0) { console.log("見つかりません: " + from); process.exit(2); }
  const b = to ? SRC.indexOf(to, a) : -1;
  return SRC.slice(a, b > 0 ? b : SRC.indexOf("\n", a));
}
const PARTS = [
  "function aigenBlankNums() { return []; }",
  cut("const AIGEN_LEN_WHO", "/* 字数の注文を、AI へ渡す文にする"),
  cut("const AIGEN_CHOICE_MARKS", "/* ══ 「N 択」を数から直接読む"),
  cut("const AIGEN_KANJI_NUM = {"),
  cut("const AIGEN_KANA_NUM = {", "/* ══ engine ごとの「日本語の言い方」を 1 本にまとめる")
].join("\n");
eval(PARTS);

let pass = 0, fail = 0;
function ok(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + "\n      期待 " + w + "\n      実際 " + g); }
}
function sec(t) { console.log("\n■ " + t); }

/* ── 字数：上限 ─────────────────────────────────────────────── */
sec("字数の注文（〜字以内）");
ok("解説は40字以内", aigenLengthLimits("生物の4択を6問。解説は40字以内で短くまとめて。"), { explanation: 40 });
ok("主語が別の文にある", aigenLengthLimits("解説を全部に入れて。ただし50字以内で。"), { explanation: 50 });
ok("問題文と解説を別々に", aigenLengthLimits("問題文は30字以内、解説は100字以内で"), { question: 30, explanation: 100 });
/* ★ ひらがなで打つ人がいる（2026-08-15） */
ok("ひらがな（30じいない）", aigenLengthLimits("せかいし よんたく 6もん かいせつ 30じいない"), { explanation: 30 });
ok("ひらがな（50もじいない）", aigenLengthLimits("かいせつを50もじいないで"), { explanation: 50 });

/* ── 字数：下限（ここが丸ごと読めていなかった）───────────────── */
sec("字数の注文（〜字以上）");
ok("解説は200字以上", aigenLengthLimits("日本史の4択を6問。解説はできるだけ具体的に、200字以上で書いてください。"),
  { explanationMin: 200 });
ok("解説は120字以上", aigenLengthLimits("英作文の並べ替えを5問。解説は120字以上で書いて。"), { explanationMin: 120 });
/* ★ いちばん近い主語に付ける。前は「選択肢」に取られて注文ごと消えていた */
ok("手前に別の主語があっても、近いほうに付く",
  aigenLengthLimits("ただし選択肢はつけないで、解説は120字以上で書いて。"), { explanationMin: 120 });
ok("上限と下限が両方", aigenLengthLimits("問題文は30字以内、解説は100字以上で"),
  { question: 30, explanationMin: 100 });
ok("ひらがな（150じいじょう）", aigenLengthLimits("かいせつ 150じいじょう"), { explanationMin: 150 });

/* ── 数を言わない「詳しく」「短く」──────────────────────────── */
sec("数を言わない注文");
ok("できるだけ具体的に", aigenLengthLimits("解説はできるだけ具体的に書いて"), { explanationMin: 180 });
ok("詳しく", aigenLengthLimits("解説を詳しく"), { explanationMin: 140 });
ok("他の選択肢がなぜ違うかも", aigenLengthLimits("解説には他の選択肢がなぜ違うのかも必ず書いて。"),
  { explanationMin: 140 });
ok("途中の式まで", aigenLengthLimits("解説は途中の式まで書いて"), { explanationMin: 140 });
ok("短くまとめて", aigenLengthLimits("解説は短くまとめて"), { explanation: 70 });
ok("注文が無ければ 何も立てない", aigenLengthLimits("日本史の4択を6問"), {});
/* 数の注文があるときは そちらが勝つ（数のほうが具体的） */
ok("数が優先される", aigenLengthLimits("解説は詳しく、ただし80字以内で"), { explanation: 80 });

/* ── 形式の名指し ───────────────────────────────────────────── */
sec("形式の名指し（いちばん詳しい名前が勝つ）");
const vid = (t) => { const v = aigenVariantInText(t); return v ? v.id : null; };
ok("英作文の並べ替え → 並べ替え", vid("英作文の並べ替えを5問"), "reorder_english");
ok("英作文だけ → 自由記述", vid("英作文を5問"), "english_writing");
ok("年代順", vid("年代順に5問"), "reorder_chronology");
ok("頭文字ヒント付き", vid("頭文字ヒント付きで8問"), "hint_initial_input");
ok("用語と定義のマッチング", vid("用語と定義のマッチングを4問"), "matching_term_def");
ok("ランキング", vid("人口の多い順に並べる問題を4問"), "reorder_ranking");
ok("空欄が2つ以上", vid("穴埋めで空欄が2つ以上あるものを5問"), "fill_blank_multi");

/* ── 「N 択」の数 ──────────────────────────────────────────── */
sec("選択肢の数");
ok("5択", aigenChoiceCountIn("政治経済の5択問題を6問"), 5);
ok("３択（全角）", aigenChoiceCountIn("地理３択5問"), 3);
ok("三択（漢数字）", aigenChoiceCountIn("三択で"), 3);
ok("4たく（ひらがな）", aigenChoiceCountIn("4たくで"), 4);
/* ★ 数もひらがなで打つ（2026-08-15） */
ok("よんたく", aigenChoiceCountIn("れきし よんたく 8"), 4);
ok("ごたく", aigenChoiceCountIn("ごたくで6もん"), 5);
ok("にたく", aigenChoiceCountIn("にたくにして"), 2);
ok("択の注文が無ければ 0", aigenChoiceCountIn("日本史の問題を6問"), 0);

/* ── 形式の表と、画面との同期 ───────────────────────────────── */
sec("形式の数と 画面との同期");
const CLIENT = require("./vqsrc.cjs").丸ごと();
const clientIds = new Set((CLIENT.match(/def\(\{\s*id:\s*"([^"]+)"/g) || [])
  .map((s) => s.replace(/.*id:\s*"/, "").replace(/"$/, "")));
const varBlock = SRC.slice(SRC.indexOf("const AIGEN_VARIANTS = {"), SRC.indexOf("/* 呼び名 → 細かい違い"));
const varIds = new Set((varBlock.match(/^  ([a-z_0-9]+):/gm) || []).map((s) => s.trim().replace(":", "")));
const engBlock = SRC.slice(SRC.indexOf("const AIGEN_ENGINES = {"), SRC.indexOf("const AIGEN_CHOICE_ENGINES"));
const engIds = new Set((engBlock.match(/^  ([a-z_]+): \{/gm) || []).map((s) => s.trim().replace(": {", "")));

console.log("  （画面 " + clientIds.size + " 形式 / AI の個別指示 " + varIds.size + " / engine " + engIds.size + "）");
ok("AI の個別指示が 100 以上ある", varIds.size >= 100, true);
/* ★ AI にあって 画面に無い id を作らない。作ると、AI が返した形式を
   画面が知らず、既定へ落ちる（直したつもりで直らない）。
   画像・音声が要るものは AI 側に入れないので、こちらの向きだけ見る。 */
const orphan = [...varIds].filter((id) => !clientIds.has(id) && !engIds.has(id));
ok("AI にあって 画面に無い形式が無い", orphan.length ? orphan.slice(0, 8) : [], []);

console.log("\n" + (fail ? "❌ 落ちています" : "✅ 全部通りました")
  + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail ? 1 : 0);
