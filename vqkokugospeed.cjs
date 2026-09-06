#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqkokugospeed.cjs — 国語の 生成が **なぜ 遅かったか**（2026-08-31・訴え）

   訴え:「生成時間が 遅すぎる。国語の 場合。なんでや。そんな 時間 かかる？」

   直す前の 実測（開発版・20 問・難しい・3 回）:
     本文づくり 17.8 / 20.9 / 22.2 秒
     問題づくり 124.8 / 24.2 / 18.1 秒   → 全体 142.8 / 45.2 / 40.4 秒
     20 問 そろったのは 1 回だけ。あとの 2 回は 11 問しか できず、
     spread は「第1問 だけ」＝ **第2〜4問が 0 問**だった。

   遅さの 出どころは 2 つ とも「順番に 待って いた」こと:
     ① 本文づくりが 3 回 直列（本文 → 漢字 → 話し合い）。
        漢字と 話し合いは どちらも「書き上がった 本文」だけが 材料で、
        互いを 待つ 理由が 無い。
     ② 大問を 1 巡に 1 つ ずつ。国語は 大問 4 つ なので 4 回 順番に 待つ。
        さらに 外へ 出せる 回数の 天井（16）を 前の 大問が 使い切ると、
        後ろの 大問は **1 問も 作られない まま 終わる**。

   ここで 見るもの（AI を 使わない・作りを 読む だけ）:
     ① 漢字と 話し合いを **同時に** 頼んで いる
     ② 大問が 2 つ 以上 なら 同時に 作る 道へ 入る
     ③ 予算は 大問の 数で **割って** 配る／使った ぶんを 引く
     ④ 待ち時間は 合計では なく **いちばん 長かった もの**
     ⑤ 大問を またいだ 重なりは 落とす／大問の 順に 並べ直す
     ⑥ 漢字の 選択肢が 全部 同じ なら 捨てる（実測で 出た）
     ⑦ 漢字の 問題に 第1問の 印が 付く

   使い方:
     node vqkokugospeed.cjs                 … 作りを 読む
     VQ_SRC=/tmp/old.js node vqkokugospeed.cjs  … 直す前の 版に 当てて 落ちる ことを 見る
     node vqkokugospeed.cjs --実            … 開発版で **実際に 走らせて** 時間を 測る
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const SRC = fs.readFileSync(process.env.VQ_SRC || path.join(__dirname, "server/src/worker.js"), "utf8");

/** 関数の 中身を 取り出す。
    ★ 波かっこを 数える やりかたは 使えない。頼み文の 中に
      '{"kanji":[...]}' の ような **文字列の 波かっこ**が あるので、
      数が 合わず 途中で 切れる（この 検査自体が 何も 見なく なる）。
      次の 関数の 頭までを そのまま 取る。 */
function 塊(名前) {
  const 頭 = SRC.indexOf("function " + 名前 + "(");
  if (頭 < 0) return "";
  const 次 = SRC.slice(頭 + 10).search(/\n(?:async )?function [A-Za-z_$]/);
  return 次 < 0 ? SRC.slice(頭) : SRC.slice(頭, 頭 + 10 + 次);
}

/* ══ ① 本文づくり: 漢字と 話し合いを 同時に ══════════════════════════ */
節("① 本文づくりの 3 回の うち、後ろの 2 回を 同時に");
{
  const f = 塊("aigenKokugoPassage");
  見(!!f, "aigenKokugoPassage が ある");
  見(/const\s+p2\s*=\s*呼ぶ\(/.test(f), "★ 漢字は **待たずに** 頼む（p2）");
  見(/const\s+p3\s*=\s*[^\n]*呼ぶ\(|const\s+p3\s*=\s*o\.dialogue/.test(f), "★ 話し合いも 待たずに 頼む（p3）");
  見(/await\s+Promise\.all\(\[\s*p2\s*,\s*p3\s*\]\)/.test(f), "★ **2 つを 同時に 待つ**（Promise.all）");
  /* 直す前は「const j2 = await 呼ぶ(」→「const j3 = await 呼ぶ(」の 直列だった。 */
  見(!/const\s+j2\s*=\s*await\s+呼ぶ\(/.test(f), "漢字を 単独で 待って いない");
  見(!/const\s+j3\s*=\s*await\s+呼ぶ\(/.test(f), "話し合いを 単独で 待って いない");
  /* 話し合いを 切れる ことは 変わらない。 */
  見(/o\.dialogue\s*===\s*false/.test(f), "話し合いは これまでどおり 切れる");
}

/* ══ ② 大問を 同時に 作る 道 ═══════════════════════════════════════ */
節("② 大問が 2 つ 以上 なら 同時に 作る");
{
  const f = 塊("aigenGenerateByParts");
  見(!!f, "aigenGenerateByParts が ある");
  const all = 塊("aigenGenerateAll");
  見(/aigenGenerateByParts\(env,\s*contract,\s*o\)/.test(all), "★ 生成の 入口から 呼ばれて いる");
  見(/o\.parts[^\n]*filter\(Boolean\)\.length\s*>=\s*2/.test(all), "★ 大問が **2 つ 以上**の ときだけ");
  見(/仕事\.length\s*<\s*2\)\s*return\s+aigenGenerate\(/.test(f), "1 かたまりに なったら これまでどおり");
  見(/await\s+Promise\.all\(/.test(f), "★ **同時に 待つ**");
  見(/LANES/.test(f), "同時に 出す 数に 上限が ある（混雑で 落ちない ため）");
}

/* ══ ③ 予算を 割って 配る ═════════════════════════════════════════ */
節("③ 呼び出しの 予算は 大問の 数で 割る");
{
  const f = 塊("aigenGenerateByParts");
  見(/Math\.floor\(残り\s*\/\s*仕事\.length\)/.test(f), "★ **大問の 数で 割る**");
  見(/qreditSafeInt\(o\.usedCalls,\s*0\)/.test(f), "★ 本文づくりで 使った ぶんを **引く**");
  見(/maxCalls: 枠/.test(f) && /枠: 予算/.test(f), "割った 予算を 各 大問へ 渡す");
  見(/Math\.min\(16,/.test(f), "天井 16 は 動かして いない");
  const all = 塊("aigenGenerateAll");
  見(/usedCalls:[^\n]*kp\.aiCalls/.test(all), "★ 本文の 回数を 持ち越す");
  見(/usedCalls:[^\n]*ol\.aiCalls/.test(all), "目次の 回数も 持ち越す");
}

/* ══ ④ 待ち時間の 数えかた ════════════════════════════════════════ */
節("④ 同時に 走らせた ときの 待ち時間");
{
  const f = 塊("aigenGenerateByParts");
  見(/totalMs:\s*各時間\.length\s*\?\s*Math\.max\.apply/.test(f),
    "★ 合計では なく **いちばん 長かった もの**（足すと 速く なったのに 数字が 増える）");
  見(/partsMs:\s*各時間/.test(f), "大問ごとの 時間も 残す");
  見(/partsParallel:/.test(f), "同時に 走らせた 数も 残す");
  見(/aiCalls:\s*add\("aiCalls"\)/.test(f), "呼び出し回数は **足し合わせる**（隠さない）");
}

/* ══ ⑤ まとめかた ═════════════════════════════════════════════════ */
節("⑤ 大問を またいだ 重なり／並び順");
{
  const f = 塊("aigenGenerateByParts");
  見(/見た\.has\(鍵\)/.test(f), "★ 大問を またいだ 同じ 問題を 落とす");
  見(/crossPartDupes/.test(f), "落とした 数を 残す");
  見(/questions\.sort\(\(a,\s*b\)\s*=>\s*\(a\.part[^\n]*b\.part/.test(f), "★ **大問の 順に 並べ直す**（同時なので 返る 順は ばらばら）");
  見(/q\.part\s*=\s*jb\.i/.test(f), "どの 大問で 作った かの 印を 付ける");
}

/* ══ ⑥ 漢字の 選択肢（実測で 出た 不具合）══════════════════════════ */
節("⑥ 同じ 選択肢が 4 つ 並ぶ ものを 捨てる");
{
  const f = 塊("aigenKokugoPassage");
  見(/new Set\(ch\)\.size\s*!==\s*4/.test(f), "★ 4 つ とも **別の 語**で なければ 捨てる");
  見(/ch\.indexOf\(kana\)\s*>=\s*0/.test(f), "★ 傍線部の カタカナ そのものは 混ぜない（答えが 丸見え）");
}

/* ══ ⑥-b 本文が 短くても 捨てない ═════════════════════════════════ */
節("⑥-b 本文が 短くても 捨てない");
{
  const f = 塊("aigenKokugoPassage");
  見(/const 下限 = Math\.max\(900,/.test(f),
    "★ 下限は **900 字**（直す前は 目安の 8 割＝2,080 字 で 丸ごと 捨てて いた）");
  見(/out\.short = text0\.length/.test(f), "★ 短い ことは **隠さず 残す**");
  見(/kanjiWhy/.test(f) && /捨\("本文に無い語"\)/.test(f),
    "★ 漢字を 捨てた **理由を 数える**（0 個の とき 見当違いを 直さない ため）");
}

/* ══ ⑦ 漢字の 問題は 第1問 ════════════════════════════════════════ */
節("⑦ 漢字の 問題に 第1問の 印");
{
  const all = 塊("aigenGenerateAll");
  見(/漢字の問\.forEach\(\(q\)\s*=>\s*\{\s*q\.part\s*=\s*0/.test(all),
    "★ 漢字にも 大問の 印（付けないと 第1問の 数が 合わない）");
}

/* ══ ⑧ 実測（--実 の ときだけ）════════════════════════════════════ */
(async () => {
  if (process.argv.indexOf("--実") >= 0) {
    節("⑧ 実際に 走らせて 測る（開発版）");
    const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
    if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.log("  本番では 測りません。"); }
    else {
      const j = (r) => r.json();
      const 鍵 = "vqkspd" + Date.now() + Math.random().toString(36).slice(2, 7);
      let r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: 鍵 + "@gmail.com", gradePrefix: "H2", nickname: 鍵.slice(0, 12), password: "Passw0rd!x9" }) }).then(j);
      r = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
      r = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationSession: r.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
      const H = { "Content-Type": "application/json", Authorization: "Bearer " + r.token };
      const t0 = Date.now();
      const g = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H, signal: AbortSignal.timeout(600000),
        body: JSON.stringify({ prompt: "国語の 定期試験。現代文の 評論を 中心に、4択の 問題を 20問 作って ください。解説も つけて ください。",
          subject: "国語", exam: true, level: "hard", count: 20, questionPlan: { single_choice: 20 } }) }).then(j);
      const 秒 = (Date.now() - t0) / 1000;
      const m = g.metrics || {};
      console.log("  かかった 全体:", 秒.toFixed(1), "秒   本文:", ((m.passageMs || 0) / 1000).toFixed(1),
        "秒   問題:", ((m.totalMs || 0) / 1000).toFixed(1), "秒");
      console.log("  できた:", (g.questions || []).length, "/", g.planned,
        "  呼び出し:", m.aiCalls, "  同時:", m.partsParallel, "  大問ごと:", JSON.stringify(m.partsMs || []));
      console.log("  spread:", JSON.stringify(g.spread || []));
      見(秒 < 90, "全体が 90 秒 未満（直す前は 142 秒）", 秒.toFixed(1));
      見((m.passageMs || 0) < 17000, "本文づくりが 17 秒 未満（直す前は 18〜22 秒）", m.passageMs);
      見((g.spread || []).length >= 3, "★ **大問が 3 つ 以上 埋まる**（直す前は 第1問 だけ の 回が あった）", g.spread);
      見((g.questions || []).length >= 16, "20 問 中 16 問 以上", (g.questions || []).length);
    }
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
