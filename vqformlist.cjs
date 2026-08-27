/* ══════════════════════════════════════════════════════════════════════════
   vqformlist.cjs — 編集フォームと一覧カードを読みやすくした（2026-08-13）

   ① 編集フォーム
      ・選択肢ごとの解説欄が **常に空で開いていた** → 4 択で欄が 8 つ並び縦が倍
      ・配点・単元・タグ・出典が常時表示で、問題文と同じ大きさ
        → どれが大事か分からない
      どちらも <details> で畳む。**開け閉めに JS は要らない**（配線を増やさない）。
      中身が入っているときは開いた状態で出す（気づかず埋もれさせない）。

   ② 一覧カード
      ・「英語・20 問・約 12 分」が中黒でつながった 1 本の文字列だった
        → どこが問題数でどこが時間か目で拾えない
      区切って絵を添える。
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ✓ " + n); }
  else { fail++; console.log("  ✗ " + n + (d ? "  → " + d : "")); } };

const src = require("./vqsrc.cjs").丸ごと();
const studio = (function () {
  const a = src.indexOf("/* ───────── ui/preset-studio.js ───────── */");
  const b = src.indexOf("/* ───────── ui/speak.js ───────── */");
  return a >= 0 && b > a ? src.slice(a, b) : "";
})();

console.log("\n① 選択肢の解説を畳む");
{
  ok("<details> で包んでいる", /<details class="vq2-cx"/.test(studio));
  ok("書いてあるときだけ開く", /\(c\.explanation \? " open" : ""\)/.test(studio));
  ok("入力欄そのものは残っている（保存の配線を壊していない）",
    /data-key="choiceExp" data-cid="/.test(studio));
  ok("説明文が短くなっている（欄の中）", /placeholder="まちがえやすい理由など"/.test(studio));
  ok("見出しに何の欄か書いてある", /この選択肢の解説<\/summary>/.test(studio));
  ok("開け閉めに JS を足していない",
    !/data-act="cx-toggle"|data-act="choice-exp"/.test(studio));
}

console.log("\n② くわしい設定を畳む");
{
  ok("<details> で包んでいる", /<details class="vq2-adv"/.test(studio));
  ok("中身があるときは開く", /var hasAdv = !!\(q\.topic \|\| \(q\.tags \|\| \[\]\)\.length/.test(studio));
  ok("出典があるときも開く", /\(q\.sourceReferences \|\| \[\]\)\.length \|\| q\.requiresReview/.test(studio));
  ok("配点が既定(1)でなければ開く", /\(q\.points != null && q\.points !== 1\)/.test(studio));
  ok("閉じているときは中身を予告する", /配点・単元・タグ・出典<\/span>/.test(studio));
  /* 4 つの欄が中に入ったこと */
  const adv = studio.match(/<details class="vq2-adv"[\s\S]*?"<\/div><\/details>";/);
  ok("くわしい設定の範囲を取り出せた", !!adv);
  for (const k of ["配点", "単元", "タグ（カンマ区切り）", "出典", "要確認"]) {
    ok("中に入っている: " + k, adv && adv[0].indexOf(k) >= 0);
  }
  /* 上に残るのは 形式 と 難易度 だけ */
  ok("上は 形式・難易度 の 2 列になった", /h \+= '<div class="vq2-grid c2">'\s*\n\s*\+ \('<div class="vq2-field"><label class="vq2-label">形式<\/label>'/.test(studio));
  ok("上に配点が残っていない",
    !/c3">'\s*\n\s*\+ \('<div class="vq2-field"><label class="vq2-label">形式/.test(studio));
}

console.log("\n③ 畳んだものの見た目");
{
  ok("三角の既定マークを消している（自前の印にする）",
    /::-webkit-details-marker\{display:none;\}/.test(studio));
  ok("開いているか閉じているかが記号で分かる",
    /\.vq2-cx>summary::before\{content:'\+ ';\}/.test(studio)
    && /\.vq2-cx\[open\]>summary::before\{content:'− ';\}/.test(studio));
  ok("押せると分かる（cursor:pointer）", /\.vq2-adv>summary\{list-style:none;cursor:pointer/.test(studio));
  ok("狭い画面で予告文を隠す", /@media \(max-width:719px\)\{\.vq2-adv-n\{display:none;\}\}/.test(studio));
  ok("色はトークン（生の値の直書きをしない）",
    /var\(--vq-border-subtle\)/.test(studio) && /var\(--vq-text-secondary\)/.test(studio));
}

console.log("\n④ 一覧カードの meta を区切る");
{
  ok("組み立て関数がある", /var metaHtml = \(function \(\) \{/.test(src));
  ok("科目・問題数・時間 の 3 つに分けている",
    /seg\("menu_book"/.test(src) && /seg\("quiz"/.test(src) && /seg\("schedule"/.test(src));
  ok("無いものは出さない", /if \(!text\) return;/.test(src));
  ok("空のときは枠ごと出さない", /\(metaHtml \? '<div class="pc__meta">' \+ metaHtml \+ "<\/div>" : ""\)/.test(src));
  ok("中黒でつなぐ古い書き方が残っていない", !/\+ '<div class="pc__meta">' \+ esc\(meta\)/.test(src));
  ok("翻訳よけのある ms\\(\\) を使っている（記号が文字化けしない）",
    /out\.push\('<span class="pc__m">' \+ ms\(name\) \+ esc\(text\)/.test(src));
  ok("並びの CSS がある", /\.pc__m\{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;\}/.test(src));
  ok("折り返せる（横にあふれない）", /\.pc__meta\{[^}]*flex-wrap:wrap/.test(src));
}

console.log("\n⑤ 壊していないこと");
{
  ok("3 ペインのまま", /WS\.layout\(\{/.test(studio));
  ok("プレビューは残っている", /プレビュー（解く人にはこう見えます）/.test(studio));
  ok("数学記号の欄は残っている", /QE\.mathPaletteHtml/.test(studio));
  ok("選択肢の追加・削除は残っている",
    /action: "add-choice"/.test(studio) && /action: "del-choice"/.test(studio));
  ok("正解の印は残っている", /action: "mark-correct"/.test(studio));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
