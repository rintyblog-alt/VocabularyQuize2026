#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqpresetgen.cjs — プリセットAI が 作れなく なった 2 つの 筋（2026-08-31・訴え）

   訴え:「プリセットAIで 自動生成が できないんだが？
         マジで どこか 追加すると 壊れるの マジで うざい。」

   実測で 見つかった 出どころは **2 つ**:

   ① 選択肢の 長さの 関所を、試験だけ でなく **全部の 依頼**に かけて いた。
      入れた 当日（試験の「選択肢が 短すぎる」への 手当て）に、
        ・頼み文  … 「1 つ 1 つを 30〜65 字の **文**に して ください」
        ・受け取り… 平均が 18 字 未満なら 捨てる
      を どの 依頼にも 効かせて しまった。
      プリセットの ふつうの 4択は「札幌市」「函館市」の ような 語 なので、
      これに 全部 引っかかる。
      実測（県庁所在地 10 問）:
        直す前 27.5 秒 / 選択肢が
          「北の都として発展している札幌市が北海道全体の行政の中心としての機能を持っている」
        直した後 3.9 秒 / 選択肢が「札幌市」

   ② 「同じ問題」の 数えかたが 荒く、**問題文に 中身が 無い**だけの ものまで
      同じ 言葉で 断って いた。実測（英単語 10 問）:
        37 件 届いて 36 件が「同じ問題」→ **0 問**。
        捨てた ものを 見ると 問題文が どれも
          「次の 英文を 読んで、空所に 入る 最も 適切な 語句を 選べ。」
        で、肝心の 英文が どこにも 無い（答えは 全部 違う）。
        「前と 同じ 問題です」と 返しても AI は 直しようが なく、
        次の 回も 同じ ものを 出して 予算を 使い切る。

   使い方:
     node vqpresetgen.cjs          … 作りを 読む
     node vqpresetgen.cjs --実     … 開発版で 実際に 作らせる
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const SRC = fs.readFileSync(process.env.VQ_SRC || path.join(__dirname, "server/src/worker.js"), "utf8");

節("① 選択肢の 長さは **試験の ときだけ**");
{
  見(/if \(!o\.exam\) return "";/.test(SRC.slice(SRC.indexOf("function aigenChoiceNote"), SRC.indexOf("function aigenChoiceNote") + 1200)),
    "★ 頼み文は 試験の ときだけ 入る");
  見(/if \(o\.exam && Array\.isArray\(q\.choices\) && q\.choices\.length >= 2\)/.test(SRC),
    "★ **数えて 落とす 関所も 試験の ときだけ**");
  見(/深\.min \* 0\.6/.test(SRC), "試験では これまでどおり 下限の 6 割で 落とす");
}

節("② 「同じ問題」と 「問題文に中身がない」を 分ける");
{
  見(/const 同文 = seen\.has\(keys\[0\]\);/.test(SRC), "★ 問題文だけ 同じ かを 見る");
  見(/const 同選 = keys\.length > 1 && keys\.slice\(1\)\.some/.test(SRC), "選択肢・答えも 同じ かを 見る");
  見(/const 中身なし = 同文 && !同選;/.test(SRC),
    "★ **問題文だけ 同じで 答えが 違う** ＝ 中身が 無い（同じ 問題では ない）");
  見(/"問題文に中身がない"/.test(SRC), "★ **別の 名前で 数える**（混ぜると 原因が 分からない）");
  見(/問題文に 中身が 入って いません/.test(SRC), "★ 直しかたを 返す（何を どう 直すかを 書く）");
  見(/その 問題を 解く のに 要る ものを question の 中に 書いて/.test(SRC),
    "★ 「question の 中に 書け」まで 言う（言わないと 次の 回も 同じ）");
  見(!/指示だけの 問題文は 受け取れません[^"]*\+ *"前に作ったものと同じ/.test(SRC),
    "前と 同じ 断り文には していない");
}

節("③ 捨てた ものを 残す（原因を 当てずっぽうで 探さない）");
{
  見(/metrics\.rejectSamples = metrics\.rejectSamples \|\| \[\];/.test(SRC), "★ 捨てた 例を 残す");
  見(/metrics\.rejectSamples\.length < 3/.test(SRC), "3 件まで（返事を 太らせない）");
  見(/why: 名,/.test(SRC), "理由も 一緒に 残す");
}

(async () => {
  if (process.argv.indexOf("--実") >= 0) {
    節("④ 実際に 作らせる（開発版）");
    const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
    if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.log("  本番では 測りません。"); }
    else {
      const j = (r) => r.json();
      const 鍵 = "vqpg" + Date.now() + Math.random().toString(36).slice(2, 7);
      let r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: 鍵 + "@gmail.com", gradePrefix: "H2", nickname: 鍵.slice(2, 14), password: "Passw0rd!x9" }) }).then(j);
      r = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
      r = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationSession: r.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
      const H = { "Content-Type": "application/json", Authorization: "Bearer " + r.token };
      const 作る = async (名, body) => {
        const t0 = Date.now();
        const g = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H,
          signal: AbortSignal.timeout(400000), body: JSON.stringify(body) }).then(j).catch((e) => ({ err: String(e) }));
        const qs = g.questions || [];
        const 平均 = qs.length && Array.isArray(qs[0].choices)
          ? Math.round(qs.reduce((a, q) => a + (q.choices || []).join("").length / Math.max(1, (q.choices || []).length), 0) / qs.length) : 0;
        console.log("  " + 名 + ": " + ((Date.now() - t0) / 1000).toFixed(1) + "秒  できた " + qs.length + "/" + g.planned
          + "  選択肢の平均 " + 平均 + " 字  捨てた " + JSON.stringify((g.metrics || {}).rejectReasons || {}));
        if ((g.metrics || {}).rejectSamples && g.metrics.rejectSamples.length) {
          console.log("    捨てた例:", JSON.stringify(g.metrics.rejectSamples).slice(0, 260));
        }
        return { g, qs, 平均 };
      };
      const a = await 作る("プリセット（県庁所在地）", { prompt: "日本の 都道府県の 県庁所在地を 4択で 10問 作って ください。", count: 10 });
      見(a.qs.length >= 8, "★ プリセットが 作れる（直す前は 0 問の 回が あった）", a.qs.length);
      見(a.平均 > 0 && a.平均 <= 14, "★ 選択肢が **語の まま**（水増しされない）", a.平均);
      const b = await 作る("プリセット（英単語）", { prompt: "英単語の 意味を 4択で 10問 作って ください。高校 1 年 レベルで。", count: 10 });
      見(b.qs.length >= 8, "★ 英単語も 作れる", b.qs.length);
      const c = await 作る("試験（日本史・難しい）", { prompt: "日本史の 定期試験。4択の 問題を 8問 作って ください。解説も つけて ください。",
        subject: "日本史", exam: true, level: "hard", count: 8, questionPlan: { single_choice: 8 } });
      見(c.qs.length >= 6, "試験も これまでどおり 作れる", c.qs.length);
      見(c.平均 >= 27, "★ 試験の 選択肢は これまでどおり **長い まま**（訴えの 手当てを 消して いない）", c.平均);
    }
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
