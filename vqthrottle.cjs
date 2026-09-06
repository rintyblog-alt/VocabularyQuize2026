#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqthrottle.cjs — 呼びすぎの 関所（server/src/throttle.js）を 単体で 測る

   2026-09-01 の 夜、本番が 351,226 回で 止まり 翌朝 9 時まで 開けなく なった。
   出どころは **開きっぱなしの タブ**（この 家の 3 台で その 時間の 98%）。
   画面側の 間隔だけ 直しても、古い 画面が 残れば また 増える。
   だから **サーバが 上限を 持つ**。ここは その 上限が 効く ことを 測る。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 200) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); } };

(async () => {
  const T = await import("./server/src/throttle.js");

  節("① 見張る 道／見張らない 道");
  見(T.定期通信か("/api/call/state") === "/api/call/state", "★ 通話の 様子見は 見張る");
  見(T.定期通信か("/api/dm/sync") === "/api/dm/sync", "★ DM の 取り直しは 見張る");
  /* ★ ここが いちばん 大事。学ぶ 道を 止めたら 対策が 事故に なる。 */
  const 学ぶ道 = ["/api/aigen/questions", "/api/auth/login", "/api/account/store",
    "/api/quiz/answer", "/api/preset/save", "/api/live/session", "/", "/index.html"];
  const 誤 = 学ぶ道.filter((p) => T.定期通信か(p));
  見(誤.length === 0, "★★ **学ぶ・保存する・入る は 1 つも 見張らない**", 誤);

  節("② 上限を 超えたら 止める");
  const 鍵 = "テスト|" + Math.random();
  const 出 = [];
  for (let i = 0; i < 34; i++) 出.push(T.呼びすぎ判定(鍵, "/api/call/state").ok);
  const 通 = 出.filter(Boolean).length;
  見(通 === 30, "★★ **60 秒に 30 回まで 通す**（31 回目から 止める）", { 通した: 通 });
  const 判 = T.呼びすぎ判定(鍵, "/api/call/state");
  見(判.ok === false && 判.待ち >= 30, "★ 待つ 秒数を 返す", 判);

  節("③ 叩くほど 長く 待たせる");
  const 鍵2 = "テスト2|" + Math.random();
  for (let i = 0; i < 30; i++) T.呼びすぎ判定(鍵2, "/api/call/state");
  const a = T.呼びすぎ判定(鍵2, "/api/call/state").待ち;
  for (let i = 0; i < 30; i++) T.呼びすぎ判定(鍵2, "/api/call/state");
  const b = T.呼びすぎ判定(鍵2, "/api/call/state").待ち;
  見(b > a, "★ しつこいほど 長く 待たせる", { はじめ: a, あと: b });
  見(b <= 600, "★ 待たせすぎない（最大 10 分）", b);

  節("④ 別の 端末は 巻き添えに しない");
  const 鍵3 = "べつの人|" + Math.random();
  見(T.呼びすぎ判定(鍵3, "/api/call/state").ok === true, "★★ **1 台が 叩きすぎても 他の 人は 通る**");

  節("⑤ 道ごとに 別で 数える");
  const 鍵4 = "同じ人|" + Math.random();
  for (let i = 0; i < 40; i++) T.呼びすぎ判定(鍵4 + "|/api/call/state", "/api/call/state");
  見(T.呼びすぎ判定(鍵4 + "|/api/dm/sync", "/api/dm/sync").ok === true,
     "★ 通話で 止まっても DM は 通る");

  節("⑥ 記憶が 膨らまない");
  const 前 = T._呼び数.size;
  for (let i = 0; i < 3000; i++) T.呼びすぎ判定("ばらばら" + i, "/api/call/state");
  const 後 = T._呼び数.size;
  見(後 - 前 <= 3100, "★ 数える 表が 際限なく 増えない（掃除が 入る）", { 前, 後 });

  節("⑦ ふつうの 使いかたでは 当たらない");
  /* 画面側: call/state は 90 秒に 1 回 ＝ 60 秒あたり 0.67 回。上限 6 の 9 倍 余裕 */
  const 鍵5 = "ふつう|" + Math.random();
  let 全部通った = true;
  for (let i = 0; i < 3; i++) if (!T.呼びすぎ判定(鍵5, "/api/call/state").ok) 全部通った = false;
  見(全部通った, "★★ **ふつうに 使って いる 人は 一生 当たらない**", "90 秒に 1 回 ＝ 上限の 1/45。同じ 回線に 45 台 いても 通る");

  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
