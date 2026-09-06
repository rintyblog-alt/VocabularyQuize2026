#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqaigenspread.cjs — **添付した資料の どこから 出題されているか**を 数える。

   ★ 訴え（2026-08-31）:
     「資料を 添付した とき、その 資料に 偏ってしまう。
       最初から 最後まで 満遍なく 均等に 出題してほしい。
       大問ごとに 分野を 分けたりして」

   ★ 直す前の 作り（コードを 読んで 分かった こと）:
     生成は 1 回では 終わらず 2〜5 回に 分けて AI を 呼ぶ。ところが
     **どの 回にも「資料の どこから 作るか」を 一度も 言って いなかった。**
     どの 回も 資料を 頭から 読み直す ので 前半が 何度も 選ばれる。

   ここで 見るもの:
     ① 配りかた（aigenSpread）… 合計・0 の かたまりを 作らない・大きさに 比例
     ② 範囲の 言い方（aigenPartNote）… 「ここだけ」と 言えて いるか
     ③ **実際に 作らせて 数える**（鍵が ある ところだけ）
        …8 つの 節に 別々の 造語を 置いた 資料を 渡し、
          問題文が どの 節の 言葉を 使ったかで 数える

   使い方:
     node vqaigenspread.cjs                  … ①② だけ（AI を 使わない）
     VQ_API=https://…-dev.… node vqaigenspread.cjs --実  … ③ も
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const 実 = process.argv.indexOf("--実") >= 0;
if (実 && !/-dev\.|127\.0\.0\.1|localhost/.test(BASE)) {
  console.error("本番では 実行しません。"); process.exit(2);
}

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 420) : "")); }
};

/* worker.js から 関数を **そのまま 取り出して** 動かす。
   ★ 写して 別に 持つと、本体を 直しても 検査だけ 古い ままに なる。 */
function 取り出す(名前, 引数の数) {
  const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  const 頭 = src.indexOf("function " + 名前 + "(");
  if (頭 < 0) throw new Error(名前 + " が 見つかりません");
  let i = src.indexOf("{", 頭), depth = 0, end = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(名前 + " の 終わりが 見つかりません");
  const body = src.slice(頭, end);
  /* 依存する 小道具（worker.js の 中の もの）を 足して 包む。 */
  const 前置き = "function qreditSafeInt(v, d){ const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : d; }\n";
  // eslint-disable-next-line no-new-func
  return new Function(前置き + body + "\nreturn " + 名前 + ";")();
}

const aigenSpread = 取り出す("aigenSpread");
const aigenPartNote = 取り出す("aigenPartNote");

節("① 配りかた（aigenSpread）");
const P = (n, shares) => Array.from({ length: n }, (_, i) => ({
  title: "第" + (i + 1) + "章", field: "分野" + (i + 1), where: "p." + (i * 10 + 1),
  share: shares ? shares[i] : 100 / n
}));

{
  const a = aigenSpread(P(6), 24);
  見(a.reduce((x, y) => x + y, 0) === 24, "合計が 頼んだ 数と 合う", a);
  見(a.every((v) => v > 0), "★ **どの かたまりも 0 問に しない**", a);
  見(Math.max.apply(null, a) - Math.min.apply(null, a) <= 1, "同じ 大きさなら ほぼ 均等", a);
}
{
  /* 大きい 章に 多く。ただし 小さい 章も 0 に しない。 */
  const a = aigenSpread(P(4, [70, 10, 10, 10]), 20);
  見(a.reduce((x, y) => x + y, 0) === 20, "合計が 合う（大きさに 差が ある とき）", a);
  見(a.every((v) => v > 0), "★ 小さい 章も 0 に しない", a);
  見(a[0] > a[1] && a[0] > a[2], "★ 大きい 章に 多く 配る", a);
}
{
  /* 問題数が かたまりより 少ない とき。**前半に 寄せない。** */
  const a = aigenSpread(P(8), 3);
  見(a.reduce((x, y) => x + y, 0) === 3, "合計が 合う（数 < かたまり）", a);
  const 付 = a.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  見(付.length === 3, "3 か所に 付く", 付);
  見(付[0] <= 2 && 付[付.length - 1] >= 5,
    "★ **前・中・後ろ に ばらける**（前半 3 つに 固まらない）", 付);
}
{
  見(aigenSpread([], 10).length === 0, "かたまりが 無ければ 空", aigenSpread([], 10));
  見(aigenSpread(P(3), 0).length === 0, "数が 0 なら 空");
  const a = aigenSpread(P(3), 1);
  見(a.reduce((x, y) => x + y, 0) === 1, "1 問でも 落とさない", a);
}

節("② 範囲の 言い方（aigenPartNote）");
{
  const t = aigenPartNote({ title: "第3章 電流", field: "電気", where: "p.34〜p.48" });
  見(/第3章 電流/.test(t), "見出しが 入る");
  見(/p\.34〜p\.48/.test(t), "どこかが 入る");
  見(/だけ/.test(t) && /外から/.test(t), "★ 「ここだけ・外から 作らない」と 言えて いる");
  見(/先頭に 寄せないで/.test(t), "★ 範囲の 中でも 偏らせない と 言えて いる");
  見(aigenPartNote(null) === "", "範囲が 無ければ 何も 言わない");
}

節("③ 人が 決めた 大問（構成案を 自分で 調整する）");
{
  const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  見(/parts: \(\(\) => \{/.test(src), "★ **人が 決めた 大問を 受け取る 口**が ある");
  見(/count: Math\.max\(0, qreditSafeInt\(x && \(x\.count \?\? x\.questions\), 0\)\)/.test(src),
    "★ 大問ごとの **問題数**を 受け取る");
  見(/where: toSafeString\(x && \(x\.where \?\? x\.pages \?\? x\.range\), 60\)/.test(src),
    "★ **ページの 範囲**を 受け取る（p.12〜p.27 など）");
  見(/人が決めた \? 目次\.map\(\(p2\) => Math\.max\(0, p2\.count \| 0\)\)/.test(src),
    "★ 人が 数を 決めたら **配り直さない**");
  見(/!o\.parts && Array\.isArray\(o\.files\)/.test(src),
    "★ 人が 決めて いる ときは AI に 目次を 作らせない（AI 1 回 節約）");
  見(/その 合計を 頼む 数に する/.test(src),
    "★ 大問の 合計に 合わせて 頼む 数を 直す（最後の 大問が 空に ならない）");
  見(/Math\.min\(6, 目次数\)/.test(src),
    "★ かたまりの 数だけ **呼び出しの 予算**を 足す（後ろまで 届く）");
  見(/Math\.min\(12, 目次\.length \+ 3\)/.test(src),
    "★ かたまりの 数だけ **巡る 回数**も 足す");
}

節("④ prompt に 範囲が 入る か（worker.js の 中を 見る）");
{
  const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  見((src.match(/aigenPartNote\(o\.part\)/g) || []).length === 2,
    "★ **2 か所とも**（まとめ頼み／形式ごと頼み）で 範囲を 出す",
    (src.match(/aigenPartNote\(o\.part\)/g) || []).length);
  見((src.match(/もう一度: 資料の/g) || []).length === 2,
    "★ **最後に もう一度 言う**（長い 指示の 途中では 埋もれる）",
    (src.match(/もう一度: 資料の/g) || []).length);
  見((src.match(/この回の 範囲（/g) || []).length === 2,
    "返す 前の 確かめにも 入って いる",
    (src.match(/この回の 範囲（/g) || []).length);
  見((src.match(/印を付ける\(\);/g) || []).length === 2,
    "★ できた 問題に **どの 範囲から かの 印**を 付ける（2 つの 道 とも）",
    (src.match(/印を付ける\(\);/g) || []).length);
  見(/out\.sections = sections;/.test(src), "★ 大問（分野ごと）を 返す");
  見(/out\.spread = sections/.test(src), "どこから 何問 出たかを 返す");
  見(/総数 >= 5/.test(src), "問題数が 少ない ときは 目次を 作らない（AI の 無駄）");
  見(/outlineMeta\.aiCalls/.test(src), "★ 目次に 使った 回数も **正直に 数える**");
}

/* ── ③ 実際に 作らせて 数える ───────────────────────────────────── */
/* ★ **資料は 大きくないと 偏りが 出ない**（2026-08-31 実測）。
   8 節・1KB の 作り物では、目次を 付けても 付けなくても 均等に 出た。
   60 章・43KB まで 増やして はじめて 直す前の 偏りが 再現した:
     10 章ごと 8 9 6 1 0 0（後ろ 20 章から **1 問も** 出ない）
   本物の 資料（何十ページの PDF）は こちら側に 近い。 */
const 頭 = ["ゼ","サ","ト","ミ","ヴ","コ","ハ","ネ","カ","オ","ブ","ジ","ラ","ペ","ウ","シ","モ","テ","ザ","フ","ヨ","ク","ヌ","メ","ヘ","ソ","チ","ア","イ","エ"];
const 尾 = ["ルフ機関","リム結晶","ゥーレ条約","ナス式計算","ェクタ植生","ルド交易路","ザリ音階","ルド反応","イム暦","ルガ模型","レド航法","ュナ紋様","ーシャ理論","トナ合金","ィム測地","ャレド暦法","ルガ通貨","ルナ気候","イル建築","ォナ言語"];
const 節々 = [];
for (let i = 0; i < 60; i++) {
  const w = 頭[i % 頭.length] + 尾[(i * 7) % 尾.length] + (i < 20 ? "" : "第" + (i + 1) + "型");
  節々.push({ 名: w, 分: "第" + (i + 1) + "章 " + w,
    文: "第" + (i + 1) + "章では " + w + " を 扱う。" + w + " は " + (1600 + i * 17)
      + " 年に 記録が 残り、基準値は " + (100 + i * 7) + " である。"
      + w + " の 主な 特徴は 三つ ある。第一に 構造が " + (3 + i % 5) + " 層に 分かれる こと、"
      + "第二に 標準の 範囲が " + (20 + i) + " から " + (60 + i * 2) + " まで で ある こと、"
      + "第三に 例外が " + (i % 4 + 1) + " つ 知られて いる こと で ある。"
      + w + " を 扱う ときは、まず 前提を 確かめ、次に 基準値 " + (100 + i * 7) + " と 比べ、"
      + "最後に 例外に 当たらないかを 見る。この 手順を 守らないと 結果が ずれる。"
      + w + " の 応用は 広く、" + (1600 + i * 17 + 40) + " 年 以降 は 実務でも 使われて いる。" });
}

async function 実測() {
  節("⑤ 実際に 資料を 付けて 作らせる（" + BASE + "）");
  const 文書 = ["# 架空教材（全60章・検査用）", ""].concat(
    節々.map((s) => ["## " + s.分, s.文, ""].join("\n"))).join("\n");
  const b64 = Buffer.from(文書, "utf8").toString("base64");

  const api = async (m, p, body, token) => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, data: j };
  };
  /* 検証アカウント。vqaigen.cjs と 同じ 作りかた（3 段の 入口にも 対応）。 */
  const nick = "spr" + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  let token = (reg.data && reg.data.token) || "";
  if (!token) {
    const a = await api("POST", "/api/auth/register/start",
      { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevGen#2026a" });
    const b = await api("POST", "/api/auth/register/verify",
      { challengeId: a.data && a.data.challengeId, code: a.data && a.data.devCode });
    const c = await api("POST", "/api/auth/register/consent",
      { registrationSession: b.data && b.data.registrationSession,
        agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    token = (c.data && c.data.token) || "";
  }
  if (!token) { 見(false, "検証アカウントを 作れない（④ は 測れません）", reg.data); return; }

  const t0 = Date.now();
  const r = await api("POST", "/api/aigen/questions", {
    prompt: "添付した教材から 4択問題を 24 問 作ってください。",
    count: 24,
    questionTypes: ["multiple_choice_single"],
    /* ★ 中身の 点検は **切る**（2026-08-31）。
       ここで 使う 資料は 造語だらけの 作り物なので、点検が
       「事実として 正しくない」と 正しく 判断して **全部 落とす**
       （実測: 27 件 届いて 23 件が 点検で 外れ、1 問しか 残らなかった）。
       ここで 測りたいのは **どこから 出題されたか** であって
       中身の 正しさでは ない。 */
    review: false,
    files: [{ mimeType: "text/plain", data: b64 }]
  }, token);
  const j = r.data || {};
  const qs = Array.isArray(j.questions) ? j.questions : [];
  console.log("     " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒 / "
    + qs.length + " 問 / AI " + (j.metrics && j.metrics.aiCalls) + " 回");
  見(qs.length >= 18, "問題が 作れる", { 数: qs.length, status: j.status, msg: j.message });
  if (!qs.length) return;

  見(Array.isArray(j.outline) && j.outline.length >= 3, "★ 資料の 目次が 返る",
    (j.outline || []).map((p2) => p2.title));
  見((j.outline || []).some((p2) => (p2.topics || []).length >= 3),
    "★ 目次に **範囲の 中の 見出し**が 並ぶ（無いと 範囲の 先頭からしか 作らない）",
    ((j.outline || [])[0] || {}).topics);
  見(Array.isArray(j.sections) && j.sections.length >= 3, "★ 大問（分野ごと）が 返る",
    (j.sections || []).map((s2) => s2.title + ":" + s2.count));

  /* どの 節の 言葉を 使ったかで 数える。 */
  const 数 = 節々.map(() => 0);
  const 不明 = [];
  for (const q of qs) {
    const 文 = [q.question, q.explanation].concat(q.choices || []).join(" ");
    let hit = -1;
    節々.forEach((s2, i) => { if (文.indexOf(s2.名) >= 0) hit = i; });
    if (hit >= 0) 数[hit]++; else 不明.push(String(q.question || "").slice(0, 24));
  }
  console.log("     節ごとの 数: " + 数.map((v, i) => (i + 1) + "章=" + v).join(" ")
    + (不明.length ? "  （どこか 分からない: " + 不明.length + "）" : ""));
  /* 10 章ずつ 6 つの 帯に まとめて 見る（1 章ずつでは ばらつきが 大きい）。 */
  const 帯 = [0, 0, 0, 0, 0, 0];
  数.forEach((v, i) => { 帯[Math.min(5, Math.floor(i / 10))] += v; });
  console.log("     10 章ごと: " + 帯.join(" ") + "  ／ 出た章 "
    + 数.filter((v) => v > 0).length + "/" + 数.length);
  見(帯.every((v) => v > 0),
    "★ **どの 帯（10 章ごと）からも 出題される**（直す前: 8 9 6 1 0 0 で 後ろ 2 帯が 0）", 帯);
  見(帯[4] + 帯[5] >= 4, "★ **資料の 後ろ 3 分の 1 からも ちゃんと 出る**",
    { 後ろ2帯: 帯[4] + 帯[5], 帯 });
  const mx = Math.max.apply(null, 帯), mn = Math.min.apply(null, 帯);
  見(mx <= mn * 3, "★ 帯どうしの 差が 3 倍 以内（偏って いない）", { 多: mx, 少: mn, 帯 });
  見(数.filter((v) => v > 0).length >= 14,
    "★ 同じ 章に 固まらない（14 章 以上 に 散る）", 数.filter((v) => v > 0).length);
}

(async () => {
  if (実) { try { await 実測(); } catch (e) { 見(false, "実測で 落ちた", String(e && e.message || e)); } }
  else console.log("\n（④ 実測は --実 を 付けた ときだけ 走ります）");
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})();
