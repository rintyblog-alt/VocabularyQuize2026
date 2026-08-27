#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqgradelive.cjs — 記述採点を Lumi（Live・音なし）に 任せる（2026-08-28）

   訴え:
     「記述採点を 全部 Lumi に 任せたい。使う API は 無制限で 使える Live を
       裏で 起動させて、**表では ボイスを オンにせず、文字で 解説を 表示するだけ**に
       できる？ 自動採点ね。
       採点基準が あれば それに 従う。無ければ 問題文などを 参照して、
       より 細かく、正確に 解説、採点を するように。」

   実測で 分かっていたこと（2026-08-28）:
     ・Live は responseModalities:["TEXT"] を **受け付けない**（1007）。
       outputAudioTranscription を 付けると 文字が そのまま 流れてくる。
     ・画面には 採点基準ごとの 内訳を 出す 作りが **すでに あった**のに、
       サーバが {score, feedback} しか 返さないので 丸ごと 死んでいた。
     ・feedback は 画面の どこからも 読まれていなかった。
     ・confidence が 返らないので **記述は 1 問残らず「確認をおすすめします」**だった。

   ここで 見ること:
     ① サーバが 採点基準に 沿って 内訳つきで 返す
     ② 採点基準が 無くても、問い・模範解答から 細かく 返す
     ③ **音を 一度も 触らない**（getUserMedia / AudioContext を 使わない）
     ④ 画面が 内訳の 合計を 点に する（AI の 合計を 信用しない）
     ⑤ confidence が 高ければ **確認あつかいに しない**（自動採点が 成り立つ）
     ⑥ 返ってこないときに 張り付かない（見切りが ある）
     ⑦ 採点できなかった ぶんは 待ちに 残る（やり直せる）

   使い方: node vqgradelive.cjs   （検証環境のみ）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 根 = __dirname;
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見 = (n, c, m) => (c ? ok(n, m) : ng(n, m));
const 束 = (前) => {
  const d = path.join(根, "client", "js");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 前 + "\\.[0-9a-f]+\\.js$").test(x));
  return fs.readFileSync(path.join(d, f), "utf8");
};

const 基準あり = {
  questionId: "q1", question: "光合成のしくみを説明しなさい。", points: 3,
  modelAnswer: "植物が光のエネルギーを使い、二酸化炭素と水からデンプンと酸素を作るはたらき。",
  subject: "理科", grade: "中1",
  rubric: [{ id: "r1", description: "光を使うと書けている", points: 1 },
           { id: "r2", description: "二酸化炭素と水を材料と書けている", points: 1 },
           { id: "r3", description: "デンプンと酸素ができると書けている", points: 1 }],
  answer: "植物が光を浴びて、二酸化炭素と水から栄養を作ること。",
  contentCheck: { length: 26, verbatim: false,
    points: [{ text: "光", found: true }, { text: "二酸化炭素と水", found: true },
             { text: "デンプンと酸素", found: false }] }
};
const 基準なし = {
  questionId: "q2", question: "鎌倉幕府が滅びた理由を、御家人の生活にふれて説明しなさい。", points: 4,
  modelAnswer: "元寇の恩賞が不十分で御家人が困窮し、幕府への不満が高まったから。",
  subject: "社会", grade: "中2", rubric: [], answer: "戦争でつかれたから。"
};

async function api(m, p, b, t) {
  const h = { "Content-Type": "application/json" };
  if (t) h.Authorization = "Bearer " + t;
  const r = await fetch(BASE + p, { method: m, headers: h,
    body: b === undefined ? undefined : JSON.stringify(b) });
  const x = await r.text();
  let d = null; try { d = x ? JSON.parse(x) : null; } catch (e) { d = { raw: x.slice(0, 300) }; }
  return { status: r.status, data: d || {} };
}

(async () => {
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: "gl" + Date.now().toString(36).slice(-6) + "44",
      password: "DevGl#2026a", tosAccepted: true, tosVersion: "1" });
  const 札 = reg.data.token;
  if (!札) { console.log("検証アカウントを作れません"); process.exit(1); }

  /* ══ ①② サーバの 返す 中身 ═══════════════════════════════════ */
  console.log("── ①② サーバが 何を 返すか ──────────────────────────");
  const t0 = Date.now();
  const r1 = await api("POST", "/api/ai/grade", { targets: [基準あり, 基準なし] }, 札);
  const かかり = Date.now() - t0;
  見("採点が 通る", r1.status === 200 && Array.isArray(r1.data.grades),
    "HTTP " + r1.status + " / " + かかり + "ms / model=" + (r1.data.model || "-"));
  見("**Live で 走っている**（generateContent へ 落ちていない）",
    String(r1.data.model || "") === "live", String(r1.data.model || ""));
  const g1 = (r1.data.grades || [])[0], g2 = (r1.data.grades || [])[1];
  const d1 = g1 && g1.grade, d2 = g2 && g2.grade;
  見("2 問とも 採点された", !!(d1 && d2));
  if (d1) {
    見("★ 採点基準ごとの 内訳が 返る",
      Array.isArray(d1.rubricBreakdown) && d1.rubricBreakdown.length === 3,
      JSON.stringify((d1.rubricBreakdown || []).map((b) => b.rubricItemId)));
    見("★ 内訳の id が **渡した id と 同じ**",
      (d1.rubricBreakdown || []).every((b) => ["r1", "r2", "r3"].indexOf(b.rubricItemId) >= 0),
      JSON.stringify(d1.rubricBreakdown || []).slice(0, 160));
    見("内訳に 理由が 付く",
      (d1.rubricBreakdown || []).every((b) => String(b.reason || "").length > 4));
    見("配点を 超えない", d1.score <= 3 && (d1.rubricBreakdown || []).every((b) => b.awarded <= 1),
      "score=" + d1.score);
    見("★ confidence が 返る（自動で 確定できる）",
      typeof d1.confidence === "number" && d1.confidence > 0, String(d1.confidence));
    見("一言（feedback）が 返る", String(d1.feedback || "").length > 4, d1.feedback);
  }
  if (d2) {
    見("★ 採点基準が 無くても 採点する", typeof d2.score === "number", "score=" + d2.score);
    見("★ 基準が 無いときは 内訳を 作らない",
      Array.isArray(d2.rubricBreakdown) && d2.rubricBreakdown.length === 0);
    見("★ 基準が 無くても **根拠を 細かく 書く**",
      String(d2.scoringReason || "").length >= 40, String(d2.scoringReason || "").slice(0, 120));
    見("★ 足りない ところを **具体的に** 挙げる",
      Array.isArray(d2.missingElements) && d2.missingElements.length >= 1,
      JSON.stringify(d2.missingElements || []).slice(0, 160));
    見("模範解答との 違いを 書く", String(d2.modelAnswerDifference || "").length > 4,
      String(d2.modelAnswerDifference || "").slice(0, 80));
  }

  /* ══ ③④⑤⑥⑦ 画面 ═══════════════════════════════════════════ */
  console.log("\n── ③ 音を 触らないか（表では ボイスを オンに しない）────");
  const core = 束("bundle-core"), app = 束("vq2-app");
  const srv = http.createServer(async (q, s) => {
    if (/^\/api\//.test(q.url)) {
      try {
        const rr = await fetch(BASE + q.url, {
          method: q.method,
          headers: { "Content-Type": "application/json",
                     Authorization: q.headers.authorization || "" },
          body: ["GET", "HEAD"].indexOf(q.method) >= 0 ? undefined
            : await new Promise((res) => { let b = ""; q.on("data", (c) => b += c); q.on("end", () => res(b)); })
        });
        const b2 = Buffer.from(await rr.arrayBuffer());
        s.writeHead(rr.status, { "Content-Type": rr.headers.get("content-type") || "application/json" });
        s.end(b2);
      } catch (e) { s.writeHead(502); s.end("{}"); }
      return;
    }
    const 実 = path.join(根, "client", decodeURIComponent(q.url.split("?")[0]));
    if (q.url !== "/" && fs.existsSync(実) && fs.statSync(実).isFile()) {
      const 型 = /\.js$/.test(実) ? "text/javascript" : /\.css$/.test(実) ? "text/css"
        : /\.woff2$/.test(実) ? "font/woff2" : "application/octet-stream";
      s.writeHead(200, { "Content-Type": 型 }); s.end(fs.readFileSync(実)); return;
    }
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><title>t</title><body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const 港 = srv.address().port;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const 例外 = [];
  p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
  await p.goto("http://127.0.0.1:" + 港 + "/");
  /* ★ **音に 触ったら 落ちる**ように 差し替えてから 読み込む。
     これが「表では ボイスを オンに しない」の 唯一の 機械的な 確かめ。 */
  await p.evaluate((o) => {
    window.__音に触った = [];
    try {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
        getUserMedia: function () { window.__音に触った.push("getUserMedia");
          return Promise.reject(new Error("音は 使わない")); } } });
    } catch (e) {}
    const だめ = function () { window.__音に触った.push("AudioContext"); throw new Error("音は 使わない"); };
    window.AudioContext = だめ; window.webkitAudioContext = だめ;
    const S = window.speechSynthesis;
    if (S) { const sp = S.speak; S.speak = function () { window.__音に触った.push("speechSynthesis"); return sp.apply(S, arguments); }; }
    window.AUTH_API_BASE = "";
    try { localStorage.setItem("app.auth.token.v1", o.tok); } catch (e) {}
  }, { tok: 札 });
  await p.addScriptTag({ content: core });
  await p.addScriptTag({ content: app });
  await p.waitForTimeout(200);

  const 出 = await p.evaluate(async (o) => {
    const A = window.VQ2.ai, G = window.VQ2.grading;
    const t0 = Date.now();
    let res = null, err = "";
    try { res = await A.gradeAnswers({ targets: o.targets }); }
    catch (e) { err = String((e && e.userMessage) || e); }
    const grades = (res && res.structured && res.structured.data && res.structured.data.grades) || [];
    /* ④⑤ 画面側の 取り込み */
    const 問 = { id: "q1", points: 3,
      scoringRubric: { items: [
        { id: "r1", description: "光を使うと書けている", points: 1 },
        { id: "r2", description: "二酸化炭素と水を材料と書けている", points: 1 },
        { id: "r3", description: "デンプンと酸素ができると書けている", points: 1 }] } };
    const 品 = { questionId: "q1", maxScore: 3 };
    const 取 = grades[0] && grades[0].grade ? G.applyAiGrade(品, 問, grades[0].grade) : null;
    /* AI の 合計が でたらめでも 内訳の 合計が 勝つか */
    const 嘘 = grades[0] && grades[0].grade
      ? G.applyAiGrade(品, 問, Object.assign({}, grades[0].grade, { score: 99 })) : null;
    /* 基準なしの ほう */
    const 問2 = { id: "q2", points: 4 };
    const 取2 = grades[1] && grades[1].grade
      ? G.applyAiGrade({ questionId: "q2", maxScore: 4 }, 問2, grades[1].grade) : null;
    return { ms: Date.now() - t0, err, 件数: grades.length, 取, 嘘, 取2,
             音: window.__音に触った.slice() };
  }, { targets: [基準あり, 基準なし] });

  見("★★ **音を 一度も 触らない**", (出.音 || []).length === 0, JSON.stringify(出.音));
  見("画面から 採点できる", 出.件数 === 2, "件数 " + 出.件数 + " " + (出.err || ""));
  console.log("\n── ④⑤ 画面が 取り込むところ ───────────────────────");
  if (出.取) {
    const t = 出.取;
    見("★ 内訳の 合計が 点に なる",
      Math.abs(t.score - (t.rubricBreakdown || []).reduce((a, x) => a + x.awarded, 0)) < 0.01,
      "score=" + t.score + " / 内訳合計=" + (t.rubricBreakdown || []).reduce((a, x) => a + x.awarded, 0));
    見("★★ **確認あつかいに ならない**（自動採点が 成り立つ）",
      t.requiresReview === false && t.autoConfirmed === true,
      "requiresReview=" + t.requiresReview + " confidence=" + t.confidence);
    見("一言が 画面へ 渡る", String(t.feedback || "").length > 4, t.feedback);
    見("根拠が 画面へ 渡る", String(t.scoringReason || "").length > 10,
      String(t.scoringReason || "").slice(0, 90));
  }
  if (出.嘘)
    見("★ AI の 合計が でたらめでも 内訳が 勝つ", 出.嘘.score <= 3, "score=" + 出.嘘.score);
  if (出.取2) {
    見("★ 基準なしでも 確認あつかいに ならない",
      出.取2.requiresReview === false,
      "requiresReview=" + 出.取2.requiresReview + " / " + JSON.stringify(出.取2.adjustments || []));
    見("基準なしでも 根拠が 渡る", String(出.取2.scoringReason || "").length > 20);
    見("基準なしでも 足りない ところが 渡る",
      (出.取2.missingElements || []).length >= 1, JSON.stringify(出.取2.missingElements || []).slice(0, 120));
  }

  console.log("\n── ⑥⑦ 張り付かない・やり直せる ───────────────────");
  const 素 = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "");
  const src = 素(fs.readFileSync(path.join(根, "js-src",
    fs.readdirSync(path.join(根, "js-src")).find((x) => /^vq2-app\./.test(x))), "utf8"));
  見("★ 採点に 見切りが ある（永久に 待たない）",
    /AbortController/.test(src) && /signal: 中止\.signal/.test(src) && /GRADE_TIMEOUT/.test(src));
  見("★ 採点できた ぶんだけ 待ちから 外す",
    /st\.pendingAi = st\.pendingAi\.filter/.test(src));
  見("★ 失敗しても 待ちを 消さない（やり直せる）",
    !/app\.toast\("記述の採点を完了できませんでした。", "warning"\); st\.pendingAi = \[\];/.test(src));
  見("★ 解き終わったら **自動で** 採点する",
    /if \(st\.pendingAi\.length && !st\.grading\) \{[\s\S]{0,120}runAiGrading\(\)/.test(src));
  見("★ 採点基準が 無くても 走る（手がかりが あれば）",
    /var 手がかりあり = targets\.some/.test(src));
  見("★ 試験モードでも 同じ 材料を 送る（語句の照合・基準の その場作り）",
    (src.match(/EV2 \? EV2\.contentCheck/g) || []).length === 1
    && (src.match(/S\.defaultRubric\(q\.type, q\.points \|\| 10, \{ modelAnswer: model \}\)/g) || []).length === 2);
  /* ★ 2026-08-28・実測で 見つけた 致命傷。この まとまりに apiBase が 無く、
     押すたびに ReferenceError で 落ちていた（＝ 一度も 動いていなかった）。 */
  /* gradeAnswers と 同じ まとまり（IIFE）の 中に apiBase が あること。
     途中に まとまりの 終わり `})(typeof globalThis` が 挟まっていたら 別の 塊。 */
  (function () {
    const g = src.indexOf("function gradeAnswers(");
    const 頭 = src.lastIndexOf("function apiBase()", g);
    const 間 = 頭 >= 0 ? src.slice(頭, g) : "";
    見("★★ 採点の まとまりに apiBase が ある（未定義で 落ちない）",
      頭 >= 0 && 間.indexOf("})(typeof globalThis") < 0,
      頭 < 0 ? "apiBase が 無い" : "手前 " + (g - 頭) + " 字");
  })();
  見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
