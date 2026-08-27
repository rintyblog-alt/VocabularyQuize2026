import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/worker.js";

const {
  buildSystemPrompt,
  normalizeReplyCodeBlocks,
  normalizeCodeFenceLang
} = __testables;

test("system prompt は cmd を含む code block ルールを持つ", () => {
  const prompt = buildSystemPrompt({ mode: "standard" });
  assert.match(prompt, /fenced code block/i);
  assert.match(prompt, /html.*css.*javascript.*typescript.*python.*json.*bash.*cmd/i);
});

test("言語ラベル alias を正規化できる", () => {
  assert.equal(normalizeCodeFenceLang("js"), "javascript");
  assert.equal(normalizeCodeFenceLang("py"), "python");
  assert.equal(normalizeCodeFenceLang("cmd"), "cmd");
  assert.equal(normalizeCodeFenceLang("shell"), "bash");
});

test("HTML のベタ書きコードを fenced block に補正できる", () => {
  const reply = normalizeReplyCodeBlocks("この形です。\n\n<button class=\"btn\">送信</button>", "HTML でボタンを作って");
  assert.match(reply, /```html/);
  assert.match(reply, /<button class=\"btn\">送信<\/button>/);
});

test("JavaScript のベタ書きコードを fenced block に補正できる", () => {
  const reply = normalizeReplyCodeBlocks("配列を回す例です。\n\nconst items = [1, 2, 3];\nfor (const item of items) {\n  console.log(item);\n}", "JavaScript で配列をループするコードを書いて");
  assert.match(reply, /```javascript/);
  assert.match(reply, /console\.log/);
});

test("CSS の単一段落コードも fenced block に補正できる", () => {
  const reply = normalizeReplyCodeBlocks("display: flex;\njustify-content: center;\nalign-items: center;", "CSS で中央寄せして");
  assert.match(reply, /```css/);
  assert.match(reply, /justify-content: center;/);
});

test("Python と JSON のコードを fenced block に補正できる", () => {
  const py = normalizeReplyCodeBlocks("data = {\"name\": \"VocabuQuiz\", \"score\": 92}\nprint(data[\"name\"])", "Python で辞書の例を出して");
  assert.match(py, /```python/);
  const json = normalizeReplyCodeBlocks("{\n  \"theme\": \"light\",\n  \"notifications\": true\n}", "JSON で設定例を見せて");
  assert.match(json, /```json/);
});

test("cmd や shell 系のコードを bash block に寄せる", () => {
  const reply = normalizeReplyCodeBlocks("npm install\nnpm run dev", "cmd で起動コマンドを見せて");
  assert.match(reply, /```cmd/);
  assert.match(reply, /npm run dev/);
});

test("インラインのコマンドしか無い返答でも code block を追記できる", () => {
  const reply = normalizeReplyCodeBlocks("起動コマンドは `vocabuquiz` です。ヘルプは `vocabuquiz --help` を使います。", "cmd で起動コマンドを見せて");
  assert.match(reply, /```cmd/);
  assert.match(reply, /vocabuquiz --help/);
});

test("既に fenced block がある場合は保ちつつ言語ラベルだけ正規化する", () => {
  const reply = normalizeReplyCodeBlocks("```js\nconsole.log('hello');\n```", "JavaScript で");
  assert.equal(reply.trim(), "```javascript\nconsole.log('hello');\n```");
});
