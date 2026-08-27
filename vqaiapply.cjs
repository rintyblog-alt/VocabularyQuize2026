/* ══════════════════════════════════════════════════════════════════════════
   vqaiapply.cjs — AI が 作ったものの 入れかた（2026-08-26）

   訴え:「AIの生成物は、すべて 適用しないと いけないのよね。だから、
          オートモードと、標準モードで 切り替えられるように してほしい。
          オートモードの場合は、自動で 問題に 全て 追加される もの」

   ★ 決めたこと
     ・既定は **標準**（これまでどおり 差分を 見せて 選ばせる）。
       勝手に オートに しない。「選ぶ」を 奪わない。
     ・オートに すると、できた ぶんを そのまま 全部 入れる。
     ・**入れられなかったら 差分を 見せる。**黙って 捨てない。
     ・修復（repair）は 元と 見比べる 画面なので オートでも 自動では 入れない。

   ★ いちばん 危ない ところ
     `applyAi("all")` を そのまま 呼ぶと、直し（revise）のときに
     触らなかった 問題まで removeCandidate に なり **全部 消える**。
     いまの applyAi は 消してよい id だけに 絞る 手当てが 入っている。
     その手当てを 外していないことを ここで 見張る。

   使いかた: node vqaiapply.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const 根 = __dirname;
let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

const A = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq2-app\./.test(f))), "utf8");
const S = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq-settings-store\./.test(f))), "utf8");

節("① 設定に 置き場が ある（st に 持たせない）");
ok("★ ai.applyMode が ある", /id: "ai\.applyMode"/.test(S));
ok("★ 既定は 標準（勝手に オートに しない）", /id: "ai\.applyMode"[\s\S]{0,200}def: "standard"/.test(S));
ok("2 つから 選ぶ形（seg）", /id: "ai\.applyMode"[\s\S]{0,120}type: "seg"/.test(S));
ok("選択肢が 標準 と オート", /\["standard", "標準（選ぶ）"\], \["auto", "オート（全部入れる）"\]/.test(S));
ok("アカウントで 同期する（kind:own）", /id: "ai\.applyMode"[\s\S]{0,160}kind: "own"/.test(S));

節("② すでに ある「auto」と 名前が ぶつかっていない");
ok("★ st.mode の auto（AIで作る/手で直す）と 別名に なっている",
   /ai\.applyMode/.test(S) && !/id: "ai\.mode"/.test(S));
ok("st.mixStyle の auto とも 別",
   !/applyMode[\s\S]{0,40}mixStyle/.test(A));

節("③ 読む側");
ok("★ 設定から 読む（st に 持たない）", /function 入れかたはオート\(\)/.test(A));
ok("__vqSet を try/catch で 読む",
   /root\.__vqSet && root\.__vqSet\.get\("ai\.applyMode"\)/.test(A) && /catch \(e\) \{ return false; \}/.test(A));
ok("既定は 標準（読めなければ オートに しない）",
   /\|\| "standard"\) === "auto"/.test(A));

節("④ 入れる場所（二重適用を 避ける）");
ok("★ finishAi の 中で 呼んでいる", /function finishAi[\s\S]{0,3000}入れかたはオート\(\)/.test(A));
{
  const i = A.indexOf("function finishAi");
  const 塊 = A.slice(i, i + 4000);
  const 追 = 塊.indexOf("pendingFollowups()");
  const 自 = 塊.indexOf("入れかたはオート()");
  ok("★ 追加指示の 呼び直しより **後ろ**に ある（二重適用を 避ける）",
     追 > 0 && 自 > 0 && 自 > 追, { 追加指示: 追, 自動: 自 });
  ok("★ 修復（repair）は 自動で 入れない", /!st\.repairCtx && st\.diff/.test(塊));
  ok("変更が 0 件なら 何もしない", /\(st\.diff\.changes \|\| \[\]\)\.length && 入れかたはオート\(\)/.test(塊));
}

節("⑤ 入れられなかったら 差分を 見せる（黙って 捨てない）");
ok("★ applyAi は 入ったかどうかを 返す", /if \(applyAi\("all"\) === true\)/.test(A));
ok("入ったときだけ 抜ける（だめなら 下の 差分表示へ 落ちる）",
   /if \(applyAi\("all"\) === true\) \{[\s\S]{0,320}return;\s*\n\s*\}\s*\n\s*\}/.test(A));
ok("番号が ぶつかったときは false を 返す",
   /元の内容をそのまま残しました[\s\S]{0,140}return false;/.test(A));
ok("入ったときは true を 返す", /件の変更を反映しました[\s\S]{0,200}return true;/.test(A));

節("⑥ **全部消える**手当てを 外していない（いちばん 危ない ところ）");
ok("★ 名指しされた 削除だけに 絞る", /c\.kind === "removeCandidate" && c\.requestedDelete/.test(A));
ok("★ all:true のまま includeRemovals を 立てていない",
   /sel = \{ questionIds: ids, includeRemovals: true, fields: sel\.fields \};/.test(A));
ok("その注意書きが 残っている", /全部消える/.test(A));

console.log(印.join("\n"));
console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
