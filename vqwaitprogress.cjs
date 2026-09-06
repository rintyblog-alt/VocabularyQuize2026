/* ══════════════════════════════════════════════════════════════════════
   生成を 待つ とき、**時間では なく 進み具合**で 見切れて いるか。

   訴え（2026-09-06・画面の 写真）:
     「向こうで 10 / 24 問（6 本 走って います）」と 出て いるのに、
     その 下に「時間内に 終わりません でした」が 3 件。
     4 分 27 秒 経過。＝ 向こうは 動いて いるのに 画面が 先に 諦めて いた。

   ★ ここを 間違えると:
     ・早く 切りすぎ → できかけを 捨てて 作り直す（今回の 不具合）
     ・切らなさすぎ → 本当に 詰まった とき 何分も 止まって 見える
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/js-src/vq2-app.b85018b5b8.js", "utf8");
const mk  = fs.readFileSync(__dirname + "/js-src/vq-make.js", "utf8");

function 抜く(頭文字) {
  const 頭 = src.indexOf(頭文字);
  if (頭 < 0) throw new Error("見つかりません: " + 頭文字);
  let 深 = 0, 尾 = -1;
  for (let i = src.indexOf("{", 頭); i < src.length; i++) {
    if (src[i] === "{") 深++;
    else if (src[i] === "}") { 深--; if (深 === 0) { 尾 = i + 1; break; } }
  }
  return src.slice(頭, 尾);
}

let 合 = 0, 否 = 0;
function 見る(名, 実, 期) {
  const a = JSON.stringify(実), b = JSON.stringify(期);
  if (a === b) { console.log("  ✓ " + 名); 合++; }
  else { console.log("  ✗ " + 名 + "\n      出た: " + a + "\n      ほしい: " + b); 否++; }
}

/* 時計と 通信を 差し替えて followJob を 動かす。 */
function 走らせる(ジョブら, o) {
  let いま = 0;                       /* 作りものの 時計（ms） */
  const now = () => いま;
  let 回 = 0;
  const root = {
    setTimeout: (fn, ms) => { いま += ms; Promise.resolve().then(fn); },
    localStorage: { getItem: () => null, setItem: () => {} },
    dispatchEvent: () => {}
  };
  const jobGet = () => Promise.resolve(ジョブら[Math.min(回++, ジョブら.length - 1)]);
  const POLL_MS = 900, POLL_MAX_MS = 15 * 60 * 1000;
  const VQ2 = { aijob: null };
  const f = new Function(
    "root", "jobGet", "POLL_MS", "POLL_MAX_MS", "VQ2", "Date", "isDone", "jobResult", "notifyDone", "adoptQuestions", "jobTaken", "markJobTaken", "jobToResult",
    抜く("  function followJob(jobId, o) {") + "; return followJob;"
  )(root, jobGet, POLL_MS, POLL_MAX_MS, VQ2, Object.assign(function () {}, { now }),
    (st) => st === "completed" || st === "partial" || st === "failed" || st === "cancelled",
    (job) => Promise.resolve({ questions: [], job: job }),
    () => {}, (x) => x, () => false, () => {}, (job) => ({ questions: [], job: job }));
  return f("j1", o).then(
    (r) => ({ ok: true, r, 秒: Math.round(いま / 1000) }),
    (e) => ({ ok: false, why: e.message, stalled: !!e.stalled, 文: e.userMessage, 秒: Math.round(いま / 1000) })
  );
}
const 仕事 = (made, calls, status) => ({ status: status || "running", made: made, planned: 24,
  aiCalls: calls, stages: [], currentStage: "" });

(async () => {
  console.log("\n══ 進んで いる 間は 待つ ══\n");
  {
    /* 1 問ずつ 増え続ける → 4 分を 超えても 切らない（前は ここで 切って いた）。 */
    const 並 = [];
    for (let i = 0; i < 400; i++) 並.push(仕事(i, i));
    並.push(Object.assign(仕事(24, 30, "completed"), { questions: [] }));
    const x = await 走らせる(並, { maxWaitMs: 10 * 60 * 1000, stallMs: 90 * 1000 });
    見る("進み続ければ 4 分を 過ぎても 待つ", [x.ok, x.秒 > 240], [true, true]);
  }
  {
    /* できた 数は 増えないが **呼び出し回数**は 増えて いる → 進んで いる。 */
    const 並 = [];
    for (let i = 0; i < 300; i++) 並.push(仕事(0, i));
    並.push(Object.assign(仕事(24, 30, "completed"), { questions: [] }));
    const x = await 走らせる(並, { maxWaitMs: 10 * 60 * 1000, stallMs: 90 * 1000 });
    見る("★ 問題数が 0 の ままでも、呼び出しが 増えて いれば 待つ", x.ok, true);
  }

  console.log("\n══ 止まったら 切る ══\n");
  {
    const 並 = [];
    for (let i = 0; i < 2000; i++) 並.push(仕事(10, 5));   /* ずっと 同じ＝止まって いる */
    const x = await 走らせる(並, { maxWaitMs: 10 * 60 * 1000, stallMs: 90 * 1000 });
    見る("90 秒 進まなければ 切る", [x.ok, x.stalled], [false, true]);
    見る("★ 10 分 待たずに 切る（詰まりに 速く 気づく）", x.秒 < 150, true);
    見る("止まった ときの 言い方を 変える", /止まって いる/.test(x.文 || ""), true);
  }
  {
    /* 進みながらも 全体の 上限を 超えたら 切る（無限に 待たない）。 */
    const 並 = [];
    for (let i = 0; i < 3000; i++) 並.push(仕事(i, i));
    const x = await 走らせる(並, { maxWaitMs: 60 * 1000, stallMs: 90 * 1000 });
    見る("全体の 上限は 効く（無限に 待たない）", [x.ok, x.stalled], [false, false]);
  }

  console.log("\n══ 設定（作る画面）══\n");
  見る("上限は 10 分", /頼み\.maxWaitMs = 10 \* 60 \* 1000;/.test(mk), true);
  見る("止まったと みなすのは 90 秒", /頼み\.stallMs = 90 \* 1000;/.test(mk), true);
  見る("★ 4 分の 一律 打ち切りは 消えた", /maxWaitMs = 4 \* 60 \* 1000/.test(mk), false);

  console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否 + "\n");
  process.exit(否 ? 1 : 0);
})();
