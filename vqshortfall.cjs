/* 問題数が足りないときの言い方と操作のテスト（ブラウザ不要）。

   実測でこうなった:
     100 問の指定に対して 81 問（10 ページの資料・理由 duplicate_only）

   ここで確かめるのは、
     ・指定数・作れる数・不足数・理由の 4 つを必ず並べて出せること
     ・操作が「この数で確定 / 形式を広げる / 資料を追加 / やめる」から出ること
     ・理由ごとに文言と「効く手段」が変わること
     ・数合わせのための言い換えや資料外の知識を勧めないこと

   実行: node vqshortfall.cjs
*/
const fs = require("node:fs");

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  NG   " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

/* domain/shortfall.js をそのまま読み込む */
const g = { VQ2: {} };
new Function("globalThis", "window", fs.readFileSync("client/v2/domain/shortfall.js", "utf8"))(g, g);
const SF = g.VQ2.shortfall;

section("実測の形（100 問 → 81 問・duplicate_only）");
{
  const d = SF.describe({
    code: "duplicate_only", availableCount: 81, shortfall: 19, requested: 100,
    canAddSources: false, canWidenTypes: true, canAcceptCurrent: true
  });
  ok("指定問題数を出す", d.requested === 100);
  ok("高品質に作成可能な数を出す", d.available === 81);
  ok("不足数を出す", d.missing === 19);
  ok("不足理由を出す", d.code === "duplicate_only");
  ok("4 つを並べて出せる", d.rows.length === 4
    && d.rows[0].value === 100 && d.rows[1].value === 81
    && d.rows[2].value === 19 && d.rows[3].value === "duplicate_only");

  const ids = d.actions.map((a) => a.id);
  ok("「81 問で確定」がある", ids.indexOf("accept") >= 0
    && /81 問で確定/.test(d.actions[0].label));
  ok("「出題形式を広げる」がある", ids.indexOf("widen") >= 0);
  ok("「資料を追加」は出さない（この理由では増えない）", ids.indexOf("add") < 0);
  ok("「やめる」がある", ids.indexOf("cancel") >= 0);
  ok("確定が既定の操作", d.actions[0].primary === true);
  ok("資料を足しても増えないと言う", /資料を足しても/.test(d.hint));
}

section("理由ごとに文言と手段が変わる");
{
  const codes = ["insufficient_topics", "insufficient_evidence", "duplicate_only",
                 "unsupported_question_angle", "low_confidence_evidence", "excluded_pages"];
  const seen = new Set();
  for (const c of codes) {
    const d = SF.describe({ code: c, availableCount: 40, shortfall: 60, requested: 100 });
    ok(c + " の見出しがある", !!d.title && d.title.length > 3);
    ok(c + " の理由文がある", !!d.why && d.why.length > 5);
    seen.add(d.title + "|" + d.why);
  }
  ok("6 通りの文言がすべて違う", seen.size === codes.length);

  const topics = SF.describe({ code: "insufficient_topics", availableCount: 5, shortfall: 95, requested: 100 });
  ok("論点不足では資料の追加を勧める", topics.canAddSources === true);
  ok("論点不足では形式を広げても増えないと扱う", topics.canWidenTypes === false);

  const angle = SF.describe({ code: "unsupported_question_angle", availableCount: 30, shortfall: 70, requested: 100 });
  ok("角度不足では両方が効く", angle.canAddSources === true && angle.canWidenTypes === true);

  const excl = SF.describe({ code: "excluded_pages", availableCount: 60, shortfall: 40, requested: 100 });
  ok("除外ページでは資料追加も形式拡張も勧めない",
    excl.canAddSources === false && excl.canWidenTypes === false);
  ok("除外ページでは戻し方を伝える", /外したページを戻す/.test(excl.hint));
}

section("数合わせを勧めない");
{
  const all = ["insufficient_topics", "insufficient_evidence", "duplicate_only",
               "unsupported_question_angle", "low_confidence_evidence", "excluded_pages"]
    .map((c) => SF.describe({ code: c, availableCount: 10, shortfall: 90, requested: 100 }));
  const text = all.map((d) => d.title + d.why + d.hint + d.actions.map((a) => a.label).join("")).join("");
  ok("言い換えで埋める案を出さない", !/言い換え|言いかえ|表現を変え/.test(text));
  ok("資料外の知識で埋める案を出さない", !/一般知識|資料外|教科書の外|補って/.test(text));
  ok("「とりあえず作る」を勧めない", !/とりあえず|適当/.test(text));
}

section("出題形式を広げる");
{
  const w = SF.widenTypes(["multiple_choice"]);
  ok("いま使っていない形式が足される", w && w.length > 1);
  ok("いまの形式は残る", w && w.indexOf("multiple_choice") === 0);
  ok("重複しない", w && new Set(w).size === w.length);
  ok("全形式を使っていれば広げられないと返す", SF.widenTypes(SF.ALL_TYPES) === null);
  ok("足すのは決まった 4 形式だけ（勝手な形式を作らない）",
    w.every((t) => SF.ALL_TYPES.indexOf(t) >= 0));
}

section("端の条件");
{
  ok("不足 0 なら missing 0", SF.describe({ code: "duplicate_only", availableCount: 100,
                                            shortfall: 0, requested: 100 }).missing === 0);
  const unknown = SF.describe({ code: "なにか知らない理由", availableCount: 1, shortfall: 9, requested: 10 });
  ok("知らない理由でも壊れない", unknown.rows.length === 4 && unknown.actions.length >= 2);
  ok("作れる数が 0 でも操作を返す",
    SF.describe({ code: "insufficient_topics", availableCount: 0, shortfall: 10, requested: 10 })
      .actions.length >= 2);
}

section("画面側の結線");
{
  const qm = fs.readFileSync("client/v2/ui/quick-mock.js", "utf8");
  ok("不足のダイアログがある", /function showShortfall\(/.test(qm));
  ok("4 つの操作を出している",
    /data-sf="accept"|data-sf='accept'/.test(qm) || /"accept"/.test(qm));
  ok("生成から不足を受け取る", /onShortfall/.test(qm));
  ok("結果からも不足を拾う", /res\.shortfall/.test(qm));
  ok("形式を広げたら不足分だけ作り直す", /runBackfillFromShortfall/.test(qm));
  const ai = fs.readFileSync("client/v2/ui/ai.js", "utf8");
  ok("SSE の shortfall を受ける", /ev === "shortfall"/.test(ai));
  ok("不足を結果へ載せる", /shortfall: acc\.shortfall/.test(ai));
  const built = fs.readFileSync("client/index.html", "utf8");
  ok("ビルドへ入っている", /VQ2\.shortfall\s*=|shortfall: describe/.test(built));
}

console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
process.exit(fail ? 1 : 0);
