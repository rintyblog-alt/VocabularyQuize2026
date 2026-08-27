/* ══════════════════════════════════════════════════════════════════════════
   vqlumilog.cjs — LUMI のログを「使う人の言葉」にする（2026-08-13）

   実物（スクリーンショット）に出ていた文:
     「2 回目：4 問できました（重複 1 問は除きました）／合計 10 / 10 問」
     「2 回目：頼んだ形式と違うものが返りました — 用語と意味のマッチング が…」
     「頼んでいない形式が入りました：短文入力 1 問」
     「名前「高校古典」・アイコン menu_book を付けました。」

   何が悪いか:
     ・**「N 回目」はこちらの都合**。使う人には関係がない
     ・「頼んだ形式と違うものが返りました」は **こちらと AI のやりとり**の話。
       知りたいのは「頼んだとおりになっているか」だけ
     ・**menu_book は内部の符号**。画面に出す意味がない
     ・「エラー 5 → 3 件」も数えかたの話

   直したあと:
     「4 問できました（似ていた 1 問は入れていません）／10 / 10 問」
     「足りない形式があります：文章並べ替え 2/3 問」
     「かわりに入っています：短文入力 1 問」
     「名前「高校古典」・アイコン を付けました。」
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = require("./vqsrc.cjs").丸ごと();
const studio = (function () {
  const a = src.indexOf("/* ───────── ui/preset-studio.js ───────── */");
  const b = src.indexOf("/* ───────── ui/speak.js ───────── */");
  return a >= 0 && b > a ? src.slice(a, b) : "";
})();

/* 画面に出る文だけを見る（コメントは対象外）。 */
const shown = (function () {
  return studio
    .replace(/\/\*[\s\S]*?\*\//g, "")   /* ブロックコメント */
    .replace(/^\s*\/\/.*$/gm, "");      /* 行コメント */
})();

console.log("\n① 「N 回目」を画面に出さない");
{
  const hits = [...shown.matchAll(/[^\n]*回目[^\n]*/g)].map((m) => m[0].trim());
  ok("画面に出る文に「回目」が残っていない", hits.length === 0,
    hits.slice(0, 3).join(" / "));
  /* 出していた 4 か所が、それぞれ言い換わっていること */
  ok("あと何問か だけを言う", /logAdd\("step", "あと " \+ \(want - collected\.length\) \+ " 問つくっています"/.test(shown));
  ok("できた数と合計だけを言う",
    /\(fresh\.length \? fresh\.length \+ " 問できました" : "新しい問題はできませんでした"\)/.test(shown));
  ok("途中で止まったときも回数を言わない", /logAdd\("warn", why \+ "ので、ここまでを残します。"\)/.test(shown));
  ok("追加の指示でも回数を言わない",
    /logAdd\("step", "追加の指示 " \+ items\.length \+ " 件を反映しています"\);/.test(shown));
  ok("待ち時間の見出しでも回数を言わない", /etaRoundBegin\("問題を作っています"\)/.test(shown));
}

console.log("\n② やりとりではなく「結果」を伝える");
{
  ok("「頼んだ形式と違うものが返りました」が消えている",
    shown.indexOf("頼んだ形式と違うものが返りました") < 0);
  ok("足りない形式を、数で言う", /logAdd\("warn", "足りない形式があります："/.test(shown));
  ok("いくつ中いくつか が分かる", /r\.name \+ " " \+ r\.got \+ "\/" \+ r\.wanted \+ " 問"/.test(shown));
  ok("「頼んでいない形式が入りました」→「かわりに入っています」",
    shown.indexOf("頼んでいない形式が入りました") < 0
    && /logAdd\("note", "かわりに入っています："/.test(shown));
  ok("「重複」→「似ていた」（機械の言葉をやめる）",
    /"（似ていた " \+ \(got\.length - fresh\.length\) \+ " 問は入れていません）"/.test(shown)
    && shown.indexOf("（重複 \" + (got.length") < 0);
}

console.log("\n③ 内部の符号を画面に出さない");
{
  ok("アイコンの符号（menu_book など）を出していない",
    /got\.push\("アイコン"\);/.test(shown) && !/got\.push\("アイコン " \+ a\.icon\)/.test(shown));
  /* 名前は使う人が読むものなので、そのまま出してよい */
  ok("名前はこれまでどおり出す", /got\.push\("名前「" \+ p\.name \+ "」"\)/.test(shown));
}

console.log("\n④ 数えかたではなく「どこまで直ったか」");
{
  ok("「N 回目 / 最大 N 回」が消えている", shown.indexOf("回目 / 最大") < 0);
  ok("「エラー N → N 件」が消えている", !/エラー " \+ x\.before \+ " → "/.test(shown));
  ok("いま何件残っているかを出す", /"直すところ " \+ \(l\.history\[l\.history\.length - 1\]\.after\) \+ " 件"/.test(shown));
  ok("何件直ったかを出す",
    /\(l\.history\[0\]\.before - l\.history\[l\.history\.length - 1\]\.after\) \+ " 件 直りました"/.test(shown));
  ok("始まっていないときは数字を出さない（0 件と書かない）",
    /: "はじめています"/.test(shown));
}

console.log("\n⑤ 壊していないこと");
{
  /* ログの種類（step/done/warn/note/error）は変えていない。
     ここを変えると色と印がずれる。 */
  const kinds = [...shown.matchAll(/logAdd\("([a-z]+)"/g)].map((m) => m[1]);
  /* ★ run と chat は **前から ある**（2026-08-28 に 分かった）。
     この検査は 長いあいだ 圧縮ずみの 中身を 見ていて、logAdd( を 1 つも
     見つけられず **空っぽで 通っていた**。圧縮前を 見るように 直したら
     初めて 見えた。どちらも rowDot（既定の 丸）で 描かれるので、
     色も 印も ずれていない。ここは 実際の 姿を 書いておく。
     **これ以外の 新しい種類が 増えたら 落ちる**（それが この検査の 役目）。 */
  const known = ["step", "done", "warn", "note", "error", "run", "chat"];
  const bad = [...new Set(kinds)].filter((k) => known.indexOf(k) < 0);
  ok("ログの種類を増やしていない", bad.length === 0, bad.join(", "));
  ok("ログの件数が減りすぎていない（黙らせていない）", kinds.length >= 25, kinds.length + "件");
  /* 数が合わない表示にしていないこと（多めに頼んでいるぶんを出さない） */
  ok("「あと N 問」は残りの数から出している",
    /"あと " \+ \(want - collected\.length\) \+ " 問/.test(shown));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
