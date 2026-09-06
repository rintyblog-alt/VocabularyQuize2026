/* ══════════════════════════════════════════════════════════════════════
   国語の 本文の 組みかた（2026-09-06・訴え）

   訴え「本文に 棒線部、空欄、難しい 言葉に ふりがな、難しい 言葉の 注釈…」
       「棒線部の 数字が 2 つ 被って いたり する ことが よく ある」
       「本文の 最後に 注釈を 入れるが、本文の 文末と ちょっと 離してね」
       「あと その 題名、（作者が あれば それも）」

   参考: 実際の 大学入学共通テスト『国語』第1問（Rinty さん 提供の 過去問）。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const app = fs.readFileSync(__dirname + "/js-src/vq2-app.b85018b5b8.js", "utf8");
const wk  = fs.readFileSync(__dirname + "/server/src/worker.js", "utf8");

function 抜く(src, 頭文字) {
  const 頭 = src.indexOf(頭文字);
  if (頭 < 0) throw new Error("見つかりません: " + 頭文字);
  let 深 = 0, 尾 = -1;
  for (let i = src.indexOf("{", 頭); i < src.length; i++) {
    if (src[i] === "{") 深++;
    else if (src[i] === "}") { 深--; if (深 === 0) { 尾 = i + 1; break; } }
  }
  return src.slice(頭, 尾);
}
/* 組む 関数だけ 動かす。rich / esc は 中身を 見たいので 素通しに する。 */
const 組む = new Function(
  "esc", "rich",
  抜く(app, "  function 国語の本文を組む(b, vertical) {") + "; return 国語の本文を組む;"
)((x) => String(x == null ? "" : x), (t) => String(t));

let 合 = 0, 否 = 0;
function 見る(名, 実, 期) {
  const a = JSON.stringify(実), b = JSON.stringify(期);
  if (a === b) { console.log("  ✓ " + 名); 合++; }
  else { console.log("  ✗ " + 名 + "\n      出た: " + a + "\n      ほしい: " + b); 否++; }
}
function 真(名, x) { 見る(名, !!x, true); }

const 本 = {
  id: "b1", type: "passage",
  title: "「贈与」としての美術",
  author: "櫻井あすみ",
  source: "（櫻井あすみ『「贈与」としての美術』による）",
  text: "わたしは街を彷徨う。ポスト構造主義は思想運動である。それは蛇足であるだろう。世界は交換可能だと信じられている。",
  underlines: [{ marker: "A", style: "solid", text: "それは蛇足であるだろう" }],
  ruby: [{ word: "彷徨", read: "さまよ" }, { word: "蛇足", read: "だそく" }],
  notes: [{ n: 1, word: "ポスト構造主義", desc: "一九六〇年代後半から台頭した思想運動。" }],
  blanks: [{ marker: "X", text: "交換可能" }]
};
const h = 組む(本, true);

console.log("\n══ 本文の 持ちもの ══\n");
真("題名が 出る", h.indexOf("「贈与」としての美術") >= 0);
真("作者が （ ）付きで 出る", /（櫻井あすみ）/.test(h));
真("出典が 出る", h.indexOf("による") >= 0);
真("ふりがなは {語|よみ} の 形に なる", h.indexOf("{彷徨|さまよ}") >= 0);
真("2 つ目の ふりがなも 付く", h.indexOf("{蛇足|だそく}") >= 0);
真("注の 番号が 語の うしろに 付く", /\{?ポスト構造主義\}?\(注1\)|ポスト構造主義\(注1\)/.test(h));
真("注釈が いちばん 下に まとまる", h.indexOf("src-notes") >= 0);
真("注釈の 中身が 出る", h.indexOf("一九六〇年代後半") >= 0);
真("空欄が 【X】に なる（rich が 四角に する）", h.indexOf("【X】") >= 0);
真("空欄の 元の 語は 本文から 消える", h.indexOf("交換可能だと") < 0);

console.log("\n══ 並び（離して から 注釈）══\n");
const i本 = h.indexOf("src-body"), i出 = h.indexOf("src-from"), i注 = h.indexOf("src-notes");
真("本文 → 出典 → 注釈 の 順", i本 >= 0 && i出 > i本 && i注 > i出);
真("題名は 本文より 前", h.indexOf("src-title") < i本);
/* 「離して」が 効いて いるか は CSS で 見る。 */
真("★ 出典を 本文から 離す（margin-block-start）",
   /\.src-from \{[^}]*margin-block-start:\s*[45]mm/.test(app));
真("★ 注釈を さらに 離す（出典より 大きい）",
   /\.src-notes \{[^}]*margin-block-start:\s*[67]mm/.test(app));
真("★ 縦書きでも 効く 書き方（block 方向）",
   !/\.src-(from|notes) \{[^}]*margin-top:/.test(app));

console.log("\n══ 無い ときに 落ちない ══\n");
{
  const h2 = 組む({ id: "b", type: "passage", text: "本文だけ。" }, false);
  真("題名・注・ふりがなが 無くても 組める", h2.indexOf("本文だけ。") >= 0);
  見る("注釈の かたまりは 出さない", h2.indexOf("src-notes") >= 0, false);
  見る("出典の 行も 出さない", h2.indexOf("src-from") >= 0, false);
}
{
  const h3 = 組む({ id: "b", type: "passage", text: "あ", title: "題", author: "" }, false);
  見る("作者が 空なら （ ）を 出さない", /（）/.test(h3), false);
}
{
  /* 本文に 無い 語を 指されても、静かに 何も しない（作り話を 出さない）。 */
  const h4 = 組む({ id: "b", type: "passage", text: "あいうえお",
    ruby: [{ word: "存在しない", read: "x" }], notes: [{ n: 1, word: "無い", desc: "d" }],
    blanks: [{ marker: "X", text: "無い" }] }, false);
  見る("本文に 無い ふりがなは 入れない", h4.indexOf("|x}") >= 0, false);
  見る("本文に 無い 空欄は 作らない", h4.indexOf("【X】") >= 0, false);
}

console.log("\n══ 傍線の 記号（訴え「2 つ 被る」）══\n");
/* サーバ側の 振り直しを 動かす。 */
const 振 = new Function("toSafeString", `
  const 本 = "①あああ。②いいい。③ううう。";
  const j1 = { underlines: [
    { marker: "①", text: "ううう" }, { marker: "①", text: "あああ" },
    { marker: "①", text: "いいい" }, { marker: "②", text: "本文に無い" },
    { marker: "③", text: "あああ" }
  ] };
  const 傍記号 = ${/const 傍記号 = (\[[^\]]*\])/.exec(wk)[1]};
  const 見た = new Set();
  const 線 = (Array.isArray(j1 && j1.underlines) ? j1.underlines : [])
    .map((x) => ({ text: toSafeString(x && x.text, 200) }))
    .filter((x) => x.text && 本.indexOf(x.text) >= 0)
    .filter((x) => { if (見た.has(x.text)) return false; 見た.add(x.text); return true; })
    .sort((a, b) => 本.indexOf(a.text) - 本.indexOf(b.text))
    .slice(0, 傍記号.length)
    .map((x, i) => ({ marker: 傍記号[i], style: "solid", text: x.text }));
  return 線;
`)((v, n) => String(v == null ? "" : v).slice(0, n));
見る("★ AI が ①①①② と 返しても 記号は 重複しない",
     振.map((x) => x.marker), ["A", "B", "C"]);
見る("★ 本文に 出て くる 順に 振る（AI の 返した 順では ない）",
     振.map((x) => x.text), ["あああ", "いいい", "ううう"]);
見る("本文に 無い ものは 落とす", 振.filter((x) => x.text === "本文に無い").length, 0);
見る("同じ ところを 二重に 引かない", 振.filter((x) => x.text === "あああ").length, 1);

console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "\n");
process.exit(否 ? 1 : 0);
