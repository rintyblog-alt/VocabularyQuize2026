/* vqdevenv.cjs（CommonJS）から checkDevConfig を使うためのブリッジ。
   実装は複製せず、check-dev-config.mjs の本体をそのまま読み込んで評価する。 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "check-dev-config.mjs"), "utf8");
/* import 文と、直接実行時だけ走る末尾ブロックを外す */
const body = src
  .replace(/^import[^\n]*\n/gm, "")
  .replace(/const HERE[\s\S]*?const SERVER[^\n]*\n/, "")
  .replace(/\/\* ── 直接実行されたときだけ検査を走らせる ── \*\/[\s\S]*$/, "")
  .replace(/^export /gm, "");
module.exports = new Function(body + "\nreturn { checkDevConfig, checkProdConfig, readToml, PRODUCTION };")();
