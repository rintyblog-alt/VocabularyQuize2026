/* ══════════════════════════════════════════════════════════════════════════
   vqsynckeys.cjs — アカウント同期の 土台（2026-08-26）

   訴え:「アカウント同士での 同期は 必ず 行うこと。
          例えば、プリセット、設定、インサイト、学習履歴」

   ★ この検査が 止めたい 3 つの 事故（どれも **無言**で 起きる）

     ① 鍵の 二重管理
        client/core/store/cloud.js の 揃える鍵 と
        server/src/worker.js の ACCOUNT_KEYS_OK は **手で** そろえている。
        片方だけ 足すと accountKeyOk が 断り、
        画面には 何も 出ない（console.warn だけ）。

     ② 件ごとに 突き合わせない鍵
        並びの 鍵を 件ごと に 登録し忘れると **まるごと 上書き**になり、
        別の端末の ぶんが 消える。

     ③ 消しても 上がらない／消したのに 戻る
        ・鍵の 更新時刻が **戻る**と サーバが 断る（消すと 下がっていた）
        ・消した ぶんに 抜け殻を 残さないと 突き合わせで **生き返る**

   使いかた: node vqsynckeys.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const 根 = __dirname;

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 240); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

const C = fs.readFileSync(path.join(根, "client", "core", "store", "cloud.js"), "utf8");
const W = fs.readFileSync(path.join(根, "server", "src", "worker.js"), "utf8");
const A = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq2-app\./.test(f))), "utf8");
const S = fs.readFileSync(path.join(根, "js-src",
  fs.readdirSync(path.join(根, "js-src")).find((f) => /^vq-screens\./.test(f))), "utf8");

function 鍵を抜く(src, 印し) {
  const i = src.indexOf(印し);
  if (i < 0) return null;
  const j = src.indexOf("];", i);
  if (j < 0) return null;
  /* コメントを 落としてから 文字列だけ 拾う */
  const 塊 = src.slice(i, j)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return (塊.match(/"([A-Za-z0-9_.]+\.v1)"/g) || []).map((x) => x.replace(/"/g, ""));
}

節("① 鍵の 一覧が 2 か所で そろっている");
const 客 = 鍵を抜く(C, "var 揃える鍵 = [");
const 鯖 = 鍵を抜く(W, "const ACCOUNT_KEYS_OK = [");
ok("画面側の 一覧が 読める", Array.isArray(客) && 客.length > 0, 客 && 客.length);
ok("サーバ側の 一覧が 読める", Array.isArray(鯖) && 鯖.length > 0, 鯖 && 鯖.length);
if (客 && 鯖) {
  ok("★ 数が 同じ", 客.length === 鯖.length, { 画面: 客.length, サーバ: 鯖.length });
  ok("★ 中身が そっくり 同じ（片方だけ 足していない）",
     [...客].sort().join(",") === [...鯖].sort().join(","),
     { 画面だけ: 客.filter((k) => !鯖.includes(k)), サーバだけ: 鯖.filter((k) => !客.includes(k)) });
}

節("② 学習の 記録も 同期の 対象に なっている（訴えの 中身）");
const 要る = ["vq2.presets.v1", "vq2.results.v1", "vq2.learn.sessions.v1",
              "vq2.learn.answers.v1", "vq2.learn.events.v1",
              "wordPractice.analytics.sessions.v1"];
要る.forEach((k) => ok("「" + k + "」を 送っている", (客 || []).includes(k)));

節("③ 並びの 鍵は **件ごと**に 突き合わせる（まるごと 上書きしない）");
{
  const i = C.indexOf("var 件ごと = {");
  const 塊 = i > 0 ? C.slice(i, C.indexOf("};", i)) : "";
  const 件 = (塊.match(/"([A-Za-z0-9_.]+\.v1)"/g) || []).map((x) => x.replace(/"/g, ""));
  ok("件ごとの 一覧が 読める", 件.length > 0, 件.length);
  /* 並びで 持っている 鍵は 全部 件ごと で なければ ならない */
  const 並びの鍵 = ["vq2.presets.v1", "wordPractice400.presets.v1", "vq2.mocks.v1",
                    "vq2.results.v1", "vq2.learn.sessions.v1", "vq2.learn.answers.v1",
                    "vq2.learn.events.v1", "wordPractice.analytics.sessions.v1"];
  const 抜け = 並びの鍵.filter((k) => (客 || []).includes(k) && !件.includes(k));
  ok("★ 並びの 鍵に 件ごと の 登録もれが 無い（もれると 他端末のぶんが 消える）",
     抜け.length === 0, 抜け);
}

節("④ 更新時刻が **戻らない**（消しても 上がるように）");
ok("★ 鍵ごとの 印を 手元に 残している", /var 印の鍵 = "vq\.cloud\.at\.v1"/.test(C));
ok("★ 必ず 1 つは 進む（max(いま, 前+1)）",
   /Math\.max\(Date\.now\(\), \(Number\(p\[k\]\) \|\| 0\) \+ 1\)/.test(C));
ok("書くたびに 進める", /印を進める\(k\);/.test(C));
ok("★ 中身の いちばん 新しい 時刻を そのまま 送っていない（これが 下がっていた）",
   !/updatedAt: 鍵の時\(k\) \}\);[\s\S]{0,10}\n[\s\S]{0,200}var m = 0;/.test(C));

節("⑤ 消した ぶんに 抜け殻を 残す（消したのに 戻る の 対策）");
ok("★ 抜け殻を 作る", /function 墓標にする/.test(A));
ok("★ 消すときに 抜け殻へ 置き換える（splice で 消していない）",
   /list\[idx\] = 墓標にする\(list\[idx\], me\);/.test(A));
ok("一覧には 出さない", /if \(!r \|\| 墓標か\(r\)\) return false;/.test(A));
ok("古い 抜け殻は 片づける", /function 古い墓標を片づける/.test(A));
ok("突き合わせは deletedAt も 見る（前から）", /時に直す\(x && x\.deletedAt\)/.test(C));

節("⑥ 引いた 直後に 画面へ 出す");
ok("★ vq-presets-restored に 受け手が いる",
   /addEventListener\("vq-presets-restored"/.test(S));
ok("受けたら 描き直す", /if \(curScreen === "presets"\) renderPresets\(\);/.test(S));

節("⑦ 容量の 物差し（工事の 前後を 測れるように）");
ok("★ プリセットは data_json を 見る（payload_json は 存在しない列）",
   /FROM sync_presets WHERE user_id = \?1 AND deleted_at = 0/.test(W)
   && /SUM\(length\(data_json\)\)[\s\S]{0,120}FROM sync_presets/.test(W));
ok("★ Workplace は content_json を 見る（body_json では ない）",
   /SUM\(length\(content_json\)\)[\s\S]{0,80}FROM wp_content/.test(W));
ok("控えは backup_json", /SUM\(length\(backup_json\)\)[\s\S]{0,80}FROM user_backups/.test(W));
ok("通知は meta_json", /meta_json[\s\S]{0,120}FROM user_notifications/.test(W));
ok("★ いま 実体が 入っている account_blob_meta も 数える",
   /FROM account_blob_meta WHERE user_id = \?1 AND deleted_at = 0/.test(W));
ok("プリセットの 数字に 両方を 足している", /bytes: presets\.bytes \+ blobs\.bytes/.test(W));
ok("payload_json / body_json は もう 使っていない",
   !/length\(payload_json\)/.test(W) && !/length\(body_json\)/.test(W));

console.log(印.join("\n"));
console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
