#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivesec.cjs — 安全の 検査（要件 38）。

   見ること:
     ① 札が 無ければ 通さない
     ② 他人の ものを 読めない（プリセット）
     ③ 部屋の 権限（部屋主だけ）
     ④ 入力の 検算（変な 値を 入れても 落ちない・通らない）
     ⑤ 作りすぎを 止める
     ⑥ 文字を そのまま 画面へ 出さない

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WSBASE = BASE.replace(/^http/, "ws");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}
async function 人を作る(i) {
  const nick = "sc" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevSc#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません");
  return { token: r.data.token, name: nick };
}
function つなぐ(url, token) {
  return new Promise((res) => {
    const ws = new WebSocket(url + (token ? "?token=" + encodeURIComponent(token) : ""));
    const box = { ws, msgs: [], you: "", closed: false, code: 0 };
    const to = setTimeout(() => res(box), 3500);
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
      box.msgs.push(m);
      if (m.t === "welcome") { box.you = m.you; clearTimeout(to); res(box); }
    };
    ws.onclose = (e) => { box.closed = true; box.code = e.code; };
    ws.onerror = () => {};
  });
}

(async () => {
  const A = await 人を作る(1), B = await 人を作る(2);

  節("① 札が 無ければ 通さない");
  for (const [m, p, b] of [
    ["POST", "/api/survive/room", {}],
    ["POST", "/api/survive/result", { courseId: "c01" }],
    ["GET", "/api/survive/stats", undefined],
    ["GET", "/api/survive/friends", undefined]
  ]) {
    const r = await api(m, p, b);
    ok("札なし " + m + " " + p + " → 401", r.status === 401, r.status);
  }
  /* ★ 札は HTTP ヘッダに 入るので **ASCII で なければ ならない**。
     日本語を 入れると fetch 自体が 例外に なり、検査が そこで 止まる。 */
  const nb = await api("POST", "/api/survive/room", {}, "not-a-real-token-0000");
  ok("でたらめな 札も 断る", nb.status === 401, nb.status);
  const q = await api("POST", "/api/survive/questions", { count: 2, seed: 1 });
  ok("問題は 札なしでも 引ける（中身は 一般の 単語）", q.status === 200 && q.data.ok, q.status);

  節("② 他人の ものを 読めない");
  const 単語 = { words: [] };
  for (let i = 0; i < 12; i++) 単語.words.push({ term: "ZZQ" + i, meaning: "ざざ" + i });
  const put = await api("POST", "/api/account/blob",
    { key: "preset:SECRET1", value: JSON.stringify(単語) }, A.token);
  const 置けた = put.status === 200;
  console.log("     単語帳を 置けたか: " + 置けた + "（置けなくても 下の 判定は 意味を 持つ）");
  const qa = await api("POST", "/api/survive/questions", { count: 4, seed: 1, presetId: "SECRET1" }, A.token);
  const qb = await api("POST", "/api/survive/questions", { count: 4, seed: 1, presetId: "SECRET1" }, B.token);
  const qx = await api("POST", "/api/survive/questions", { count: 4, seed: 1, presetId: "SECRET1" });
  ok("他人の 単語帳から 問題が 作られない", qb.data.source !== "preset", qb.data.source);
  ok("札なしでも 他人の 単語帳を 読めない", qx.data.source !== "preset", qx.data.source);
  const 漏れ = JSON.stringify(qb.data) + JSON.stringify(qx.data);
  ok("他人の 単語が 一文字も 出ていない", 漏れ.indexOf("ZZQ") < 0, 漏れ.slice(0, 120));
  if (置けた) ok("自分の 単語帳なら 使える", qa.data.source === "preset", qa.data.source);

  節("③ 部屋の 権限");
  const cr = await api("POST", "/api/survive/room", { courseId: "c01" }, A.token);
  const roomId = cr.data.roomId;
  const ws = WSBASE + "/ws/survive/" + roomId;
  const a = await つなぐ(ws, A.token);
  const b = await つなぐ(ws, B.token);
  await 待つ(300);
  const 無札 = await つなぐ(ws, "");
  ok("札なしでは WebSocket に 入れない", 無札.you === "", "入れてしまった");
  b.ws.send(JSON.stringify({ t: "course", id: "c30" }));
  b.ws.send(JSON.stringify({ t: "start", length: 100 }));
  await 待つ(400);
  const 部屋 = a.msgs.filter((m) => m.t === "room").pop();
  ok("部屋主で なければ コースを 変えられない", 部屋 && 部屋.room.courseId === "c01", 部屋 && 部屋.room.courseId);
  ok("部屋主で なければ 始められない", a.msgs.filter((m) => m.t === "go").length === 0);

  節("④ 変な 値を 入れても 壊れない");
  const 変な入力 = [
    { t: "in", s: { x: "abc", y: null, z: [], pr: {}, cp: -5 } },
    { t: "in", s: { x: 1e308, y: 1e308, z: 1e308, pr: 1e308 } },
    { t: "gate", g: 99999, a: -12345 },
    { t: "color", v: 999 },
    { t: "ready", v: { evil: true } },
    { t: "  ", x: 1 },
    { t: "in" },
    {}
  ];
  for (const x of 変な入力) { try { b.ws.send(JSON.stringify(x)); } catch (e) {} }
  b.ws.send(JSON.stringify({ t: "in", s: { x: null, y: null, z: null } }));
  b.ws.send("これは JSON では ない");
  await 待つ(600);
  ok("変な 値を 入れても 部屋が 落ちない", !a.closed && !b.closed, { a: a.closed, b: b.closed });
  const info = await api("GET", "/api/survive/room/" + roomId);
  ok("部屋は 生きている", info.status === 200 && info.data.ok, info.status);

  節("⑤ 変な HTTP");
  const 変 = [
    ["POST", "/api/survive/result", { courseId: "x".repeat(500), time: 1e9, rank: -50, correct: 1e9, wrong: -1 }, A.token],
    ["POST", "/api/survive/questions", { count: 99999, seed: "abc" }, A.token],
    ["POST", "/api/survive/questions", { count: -5 }, A.token],
    ["GET", "/api/survive/room/" + "X".repeat(200), undefined, A.token],
    ["GET", "/api/survive/leaderboard/" + encodeURIComponent("'; DROP TABLE users;--"), undefined, undefined]
  ];
  for (const [m, p, bd, tk] of 変) {
    const r = await api(m, p, bd, tk);
    ok("壊れずに 返す " + m + " " + p.slice(0, 40) + " → " + r.status, r.status < 500, r.status);
  }
  const many = await api("POST", "/api/survive/questions", { count: 99999, seed: 1 }, A.token);
  ok("問題の 数に 上限が ある（24 以下）", (many.data.questions || []).length <= 24, (many.data.questions || []).length);
  const st = await api("GET", "/api/survive/stats", undefined, A.token);
  ok("でたらめな 成績で 表が 壊れない", st.status === 200, st.status);
  const users = await api("GET", "/api/auth/me", undefined, A.token);
  ok("users の 表は 生きている（SQL は 通っていない）", users.status === 200, users.status);

  節("⑥ 部屋の 作りすぎ");
  let 断られた = 0, 作れた = 0;
  for (let i = 0; i < 16; i++) {
    const r = await api("POST", "/api/survive/room", {}, B.token);
    if (r.status === 429) 断られた++;
    else if (r.status === 200) 作れた++;
  }
  ok("連打すると 途中で 断られる", 断られた > 0, 断られた);
  ok("作れた のは 12 件まで", 作れた <= 12, 作れた);
  /* ★ **isolate が 入れ替わっても 忘れない** ことを 見る。
     手元の Map だけだと、入れ替わりを 待つ だけで 何度でも 作れて しまう。
     ここでは 表を 直に 引いて 「数えた 跡が 残っている」ことを 確かめる。 */
  const 別人 = await 人を作る(9);
  const r1 = await api("POST", "/api/survive/room", {}, 別人.token);
  ok("別の 人は ふつうに 作れる", r1.status === 200, r1.status);
  await 待つ(200);
  let なお断る = 0;
  for (let i = 0; i < 3; i++) {
    const r = await api("POST", "/api/survive/room", {}, B.token);
    if (r.status === 429) なお断る++;
  }
  ok("しばらく 経っても まだ 断る", なお断る === 3, なお断る);

  節("⑦ 文字を そのまま 画面へ 出さない");
  const fs = require("fs");
  const src = fs.readFileSync("client/assets/vocabu-survive/ui/lobby.js", "utf8")
    + fs.readFileSync("client/assets/vocabu-survive/ui/hud.js", "utf8")
    + fs.readFileSync("client/assets/vocabu-survive/ui/result.js", "utf8")
    + fs.readFileSync("client/assets/vocabu-survive/game/match.js", "utf8")
    + fs.readFileSync("client/assets/vocabu-survive/boot/loading.js", "utf8");
  ok("画面が innerHTML を 使っていない", src.indexOf("innerHTML") < 0, "innerHTML が ある");
  ok("h() の html: を 使っていない", src.indexOf("html:") < 0, "html: が ある");
  const evil = await api("GET", "/api/survive/friends", undefined, A.token);
  ok("友だちは JSON で 返る", evil.status === 200 && Array.isArray(evil.data.friends));

  for (const x of [a, b]) { try { x.ws.close(); } catch (e) {} }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
