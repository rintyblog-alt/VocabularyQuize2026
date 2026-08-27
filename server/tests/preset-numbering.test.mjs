/* プリセットを **サーバへ保存する直前** の採番を固定する。

   /api/preset/publish は preset_json を D1 へそのまま保存する。
   クライアント側でも採番しているが、そこを通らない経路（古い版・
   改変されたリクエスト・取り込み）が残るので、ここが最後の関門になる。

   決め方はクライアント側と同じ 1 つだけ：
   **いま存在する最大番号 + 1 から順に振る。空きは埋めない。既存は動かさない。**

   実行: node server/tests/preset-numbering.test.mjs
*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "src", "worker.js"), "utf8");

/* worker.js は Workers 用の巨大な 1 本なので、対象の関数だけを取り出して評価する。
   （import すると Cloudflare 固有の束縛が要るため） */
function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} が worker.js に見つかりません`);
  let depth = 0, i = SRC.indexOf("{", start);
  const from = i;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (!depth) break; }
  }
  return SRC.slice(start, i + 1);
}
const presetNumberingRepair = new Function(
  extract("presetNumberingRepair") + "; return presetNumberingRepair;")();

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section("V1 のカード（id がそのまま問題番号）");

let p = { cards: [{ id: 1, front: "a" }, { id: 2, front: "b" }, { id: 3, front: "c" }] };
presetNumberingRepair(p);
ok("正しく並んでいるものは動かさない", eq(p.cards.map((c) => c.id), [1, 2, 3]));

p = { cards: [{ id: 1 }, { id: 2 }, { id: 4 }, { id: 7 }] };
presetNumberingRepair(p);
ok("空き（3,5,6）を勝手に埋めない", eq(p.cards.map((c) => c.id), [1, 2, 4, 7]));

p = { cards: [{ id: 1 }, { id: 2 }, { id: 4 }, { id: 7 }, {}, {}, {}] };
presetNumberingRepair(p);
ok("番号の無いカードは最大の次から振る（8,9,10）",
  eq(p.cards.map((c) => c.id), [1, 2, 4, 7, 8, 9, 10]), JSON.stringify(p.cards.map((c) => c.id)));

p = { cards: [{ id: 1 }, { id: 1 }, { id: 1 }] };
presetNumberingRepair(p);
ok("番号が重なっていたら、先に出てきたものを残して振り直す",
  eq(p.cards.map((c) => c.id), [1, 2, 3]), JSON.stringify(p.cards.map((c) => c.id)));

p = { cards: [{ id: 5 }, { id: "ai_q1" }, { id: "ai_q1" }] };
presetNumberingRepair(p);
ok("AI が付けた文字列 ID は整数の番号へ置き換える",
  eq(p.cards.map((c) => c.id), [5, 6, 7]), JSON.stringify(p.cards.map((c) => c.id)));

p = { words: [{ id: 2 }, { id: 2 }, {}] };
presetNumberingRepair(p);
ok("words 形式でも同じように直す", eq(p.words.map((w) => w.id), [2, 3, 4]), JSON.stringify(p.words.map((w) => w.id)));

p = { cards: [{ id: 1, front: "a", back: "b", explanation: "解説", tags: ["x"] }] };
presetNumberingRepair(p);
ok("番号以外の中身には触らない",
  p.cards[0].front === "a" && p.cards[0].back === "b" && p.cards[0].explanation === "解説"
  && eq(p.cards[0].tags, ["x"]));

ok("作業用の印を残さない", !("__numbered" in p.cards[0]));

section("V2 の questions（内部 ID と問題番号は別）");

p = { questions: [
  { id: "q_a", questionNumber: 1 }, { id: "q_b", questionNumber: 2 },
  { id: "q_c", questionNumber: 5 }
]};
let r = presetNumberingRepair(p);
ok("正しいものは動かさない", r.ok && eq(p.questions.map((q) => q.questionNumber), [1, 2, 5]));

p = { questions: [
  { id: "ai_q1", questionNumber: 1 }, { id: "ai_q1", questionNumber: 1 },
  { id: "ai_q2", questionNumber: 2 }
]};
r = presetNumberingRepair(p);
const ids = p.questions.map((q) => q.id);
const nos = p.questions.map((q) => q.questionNumber);
ok("内部 ID の重複を直す", r.ok && new Set(ids).size === 3, ids.join(","));
ok("問題番号の重複を直す", new Set(nos).size === 3, nos.join(","));
ok("先に出てきた番号は残る", nos[0] === 1, nos.join(","));
ok("あとから重なったものは最大の次へ送る", nos[1] === 3, nos.join(","));

p = { questions: [{ id: "q_a" }, { id: "q_b" }, { id: "q_c" }] };
presetNumberingRepair(p);
ok("番号を持っていない場合は 1 から振る",
  eq(p.questions.map((q) => q.questionNumber), [1, 2, 3]),
  JSON.stringify(p.questions.map((q) => q.questionNumber)));

p = { questions: [{ id: "q_a", questionNumber: 4 }, { id: "q_b" }, { id: "q_c" }] };
presetNumberingRepair(p);
ok("既存の番号があれば、その最大の次から続ける（5,6）",
  eq(p.questions.map((q) => q.questionNumber), [4, 5, 6]),
  JSON.stringify(p.questions.map((q) => q.questionNumber)));

p = { questions: [{ id: "q_a", questionNumber: 1, prompt: "問題文", choices: [{ id: "c1" }] }] };
presetNumberingRepair(p);
ok("番号以外の中身には触らない（V2）",
  p.questions[0].prompt === "問題文" && p.questions[0].choices.length === 1);
ok("作業用の印を残さない（V2）", !("__no" in p.questions[0]));

section("直せないときは保存させない");

r = presetNumberingRepair({});
ok("questions も cards も無い入力は素通しする", r.ok);
r = presetNumberingRepair(null);
ok("null でも落ちない", r.ok);

section("公開の入口が拒否コードを返すこと（配線の確認）");

ok("BAD_PRESET_NUMBERING を返す分岐がある", SRC.indexOf("BAD_PRESET_NUMBERING") >= 0);
ok("publish が採番を通す", /const numbering = presetNumberingRepair\(out\)/.test(SRC));
ok("fork も採番を通す", /const forkNumbering = presetNumberingRepair\(copy\)/.test(SRC));
ok("publish はログイン必須のまま", /handlePublicPresetPublish[\s\S]{0,400}UNAUTHORIZED/.test(SRC));
ok("publish は本人の user_id で保存するまま", /handlePublicPresetPublish[\s\S]{0,4000}INSERT INTO public_presets/.test(SRC));

console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
failures.forEach((f) => console.log(`    - ${f}`));
process.exit(fail ? 1 : 0);
