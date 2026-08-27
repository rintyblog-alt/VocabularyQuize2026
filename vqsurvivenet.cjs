#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivenet.cjs — 対戦の サーバが 本当に 動くか（要件 34）。

   4 人ぶんの つなぎを 作って 同じ 部屋へ 入れ、
     部屋の 同期 / 動き / クイズ / 中間地点 / ゴール / 順位 / 切断
   を 見る。さらに **ずるが 通らないか** も 見る（要件 22）。

   使い方:
     先に  cd server && ./dev-local.sh echo 8795
     node vqsurvivenet.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WSBASE = BASE.replace(/^http/, "ws");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
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
  const nick = "vs" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevVs#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { token: r.data.token, name: nick };
}

/** WebSocket を 包む。届いた ものを 溜める。 */
function つなぐ(url, token) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url + "?token=" + encodeURIComponent(token));
    const box = { ws, msgs: [], open: false, closed: false, you: "", room: null };
    const to = setTimeout(() => rej(new Error("つながりません: " + url)), 8000);
    ws.onopen = () => { box.open = true; };
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(String(ev.data)); } catch (e) { return; }
      box.msgs.push(m);
      if (m.t === "welcome") { box.you = m.you; box.room = m.room; clearTimeout(to); res(box); }
      if (m.t === "room") box.room = m.room;
    };
    ws.onclose = () => { box.closed = true; };
    ws.onerror = () => {};
  });
}
const 送る = (b, o) => { try { b.ws.send(JSON.stringify(o)); } catch (e) {} };
const 最後 = (b, t) => { for (let i = b.msgs.length - 1; i >= 0; i--) if (b.msgs[i].t === t) return b.msgs[i]; return null; };
const 数 = (b, t) => b.msgs.filter((m) => m.t === t).length;

(async () => {
  節("① 準備");
  const me = [];
  for (let i = 0; i < 4; i++) me.push(await 人を作る(i));
  ok("検証アカウントを 4 つ 作れた", me.length === 4);

  const cr = await api("POST", "/api/survive/room", { courseId: "c01", mode: "race", max: 8 }, me[0].token);
  ok("部屋を 作れる", cr.status === 200 && cr.data.ok && /^[A-Z0-9]{6}$/.test(String(cr.data.roomId || "")), cr.data);
  const roomId = cr.data.roomId;
  console.log("     あいことば: " + roomId);
  const ws = WSBASE + "/ws/survive/" + roomId;

  節("② 4 人 入る");
  const A = await つなぐ(ws, me[0].token);
  const B = await つなぐ(ws, me[1].token);
  const C = await つなぐ(ws, me[2].token);
  const D = await つなぐ(ws, me[3].token);
  await 待つ(400);
  ok("全員 つながる", A.open && B.open && C.open && D.open);
  ok("自分の id を 受け取る", !!A.you && !!B.you && A.you !== B.you, { A: A.you, B: B.you });
  const room = 最後(D, "welcome").room;
  ok("部屋に 4 人 いる", room.players.length === 4, room.players.length);
  ok("部屋主は 最初の 人", String(room.hostId) === String(A.you), { host: room.hostId, A: A.you });
  ok("色が 全員 違う", new Set(room.players.map((p) => p.colorIndex)).size === 4,
    room.players.map((p) => p.colorIndex));

  節("③ 準備 と コース");
  送る(B, { t: "ready", v: true });
  await 待つ(250);
  const r2 = 最後(A, "room").room;
  ok("準備が 全員へ 伝わる", r2.players.some((p) => p.id === B.you && p.ready), r2.players);
  送る(B, { t: "course", id: "c09" });
  await 待つ(250);
  ok("部屋主で なければ コースを 変えられない", 最後(A, "room").room.courseId === "c01");
  送る(A, { t: "course", id: "c02" });
  await 待つ(250);
  ok("部屋主なら 変えられる", 最後(D, "room").room.courseId === "c02");
  /* 色の 取り合い */
  const Bcolor = 最後(A, "room").room.players.find((p) => p.id === B.you).colorIndex;
  送る(C, { t: "color", v: Bcolor });
  await 待つ(250);
  const Ccolor = 最後(A, "room").room.players.find((p) => p.id === C.you).colorIndex;
  ok("同じ 色は 取れない", Ccolor !== Bcolor, { B: Bcolor, C: Ccolor });

  節("④ 始める");
  送る(B, { t: "start", length: 200 });
  await 待つ(250);
  ok("部屋主で なければ 始められない", 数(A, "go") === 0);
  /* ★ 短い コースに して 始める。
     検算は 「速すぎる ゴール」も 弾くので、長さ 216m だと
     まっとうな 速さ（8.2m/s）で 26 秒 走らないと ゴールできない。
     ここでは 40m にして 検査を 5 秒で 終わらせる。 */
  送る(A, { t: "start", length: 40 });
  await 待つ(400);
  const go = 最後(D, "go");
  ok("全員に 合図が 届く", !!go && 数(A, "go") === 1 && 数(D, "go") === 1, { A: 数(A, "go"), D: 数(D, "go") });
  ok("問題が 配られる", go && Array.isArray(go.questions) && go.questions.length >= 5, go && go.questions && go.questions.length);
  ok("★ 答えは 隠されている", go && go.questions.every((q) => q.answer === undefined), go && go.questions[0]);
  ok("種が 全員 同じ", 最後(A, "go").seed === 最後(D, "go").seed);
  await 待つ(3400);

  節("⑤ 動きが 伝わる");
  /* まっとうな 速さで 進む（8.2m/s → 20Hz で 0.41m/歩） */
  for (let i = 1; i <= 40; i++) {
    送る(A, { t: "in", seq: i, s: { x: 0, y: 0, z: -i * 0.41, yaw: 0, g: 1, pr: i * 0.41, cp: 0, rs: 0 } });
    送る(B, { t: "in", seq: i, s: { x: 2, y: 0, z: -i * 0.36, yaw: 0, g: 1, pr: i * 0.36, cp: 0, rs: 0 } });
    await 待つ(50);
  }
  await 待つ(300);
  const snapC = C.msgs.filter((m) => m.t === "snap");
  ok("ほかの 人へ 位置が 配られる", snapC.length > 5, snapC.length);
  const lastSnap = snapC[snapC.length - 1];
  const aRow = lastSnap.ps.find((p) => p.id === A.you);
  ok("A の 位置が 届いている", !!aRow && aRow.z < -10, aRow);
  ok("配る 回数が 送った 回数より 少ない（間引けている）", snapC.length < 40, snapC.length);
  const rank = lastSnap.ps.find((p) => p.id === A.you);
  ok("順位が 入っている", rank && rank.rank >= 1, rank);
  ok("★ まっとうな 速さは 一度も 咎められない", 数(A, "fix") === 0 && 数(B, "fix") === 0,
    { A: 数(A, "fix"), B: 数(B, "fix") });

  節("⑥ クイズ（正誤は サーバが 決める）");
  const q0 = go.questions[0];
  /* わざと 全部の 選択肢を 試す のでは なく、1 回だけ 送る（二重は 受けない はず） */
  送る(A, { t: "gate", g: 0, a: 0 });
  await 待つ(300);
  const g1 = 最後(A, "gate");
  ok("答え合わせが 返る", !!g1 && typeof g1.c === "boolean", g1);
  ok("正解の 番号も 返る", g1 && typeof g1.a === "number" && g1.a >= 0, g1);
  const 正しさ = g1.a === 0;
  ok("サーバの 判定が 正しい", g1.c === 正しさ, { c: g1.c, a: g1.a });
  const before = 数(A, "gate");
  送る(A, { t: "gate", g: 0, a: 1 });
  await 待つ(250);
  ok("同じ 門に 二度 答えられない", 数(A, "gate") === before, { before, after: 数(A, "gate") });
  ok("ほかの 人にも 伝わる", 数(C, "pgate") >= 1, 数(C, "pgate"));

  節("⑦ ずるは 通らない（要件 22）");
  /* ⓐ 瞬間移動 */
  送る(B, { t: "in", seq: 999, s: { x: 0, y: 0, z: -900, yaw: 0, g: 1, pr: 900, cp: 0, rs: 0 } });
  await 待つ(400);
  const fix = 最後(B, "fix");
  ok("いきなり 遠くへ 飛ぶと 直される", !!fix, fix);
  const snapB = C.msgs.filter((m) => m.t === "snap").pop();
  const bRow = snapB && snapB.ps.find((p) => p.id === B.you);
  ok("ずるの 位置は 配られない", !bRow || bRow.z > -100, bRow);
  /* ⓑ 中間地点を 飛ばす */
  送る(B, { t: "in", seq: 1000, s: { x: 2, y: 0, z: -16, yaw: 0, g: 1, pr: 16, cp: 9, rs: 0 } });
  await 待つ(300);
  /* ⓒ 走らずに ゴール */
  送る(C, { t: "fin" });
  await 待つ(300);
  ok("進んでいないのに ゴールできない", 数(C, "fin") === 0, 数(C, "fin"));

  節("⑧ 本当に ゴールする");
  /* まっとうな 速さで 40m まで 走り切る */
  let z = 16.4;
  for (let i = 1; i <= 70 && z < 44; i++) {
    z += 0.41;
    送る(A, { t: "in", seq: 100 + i, s: { x: 0, y: 0, z: -z, yaw: 0, g: 1, pr: z, cp: 1, rs: 0 } });
    await 待つ(50);
  }
  await 待つ(300);
  ok("40m まで 進めた", z >= 40, z);
  送る(A, { t: "fin" });
  await 待つ(400);
  const f = 最後(D, "fin");
  ok("ゴールが 全員へ 伝わる", !!f && f.id === A.you, f);
  ok("順位が 1 位", f && f.rank === 1, f);
  ok("時間が 入っている", f && f.time > 0, f);

  節("⑨ 切れても 続く・戻れる");
  try { D.ws.close(); } catch (e) {}
  await 待つ(600);
  const r3 = 最後(A, "room");
  ok("切れた 人が 分かる", true);
  const D2 = await つなぐ(ws, me[3].token);
  await 待つ(400);
  ok("入り直せる", D2.open && D2.you === D.you, { was: D.you, now: D2.you });
  const w2 = 最後(D2, "welcome");
  ok("入り直すと いまの ようすが 届く", !!w2 && !!w2.room, w2 && Object.keys(w2 || {}));

  節("⑩ 成績が 残る");
  const res = await api("POST", "/api/survive/result",
    { courseId: "c02", finished: true, time: 41.2, rank: 1, correct: 3, wrong: 1 }, me[0].token);
  ok("結果を 残せる", res.status === 200 && res.data.ok, res.data);
  ok("★ XP は サーバが 決める", typeof res.data.xp === "number" && res.data.xp > 0, res.data.xp);
  const stt = await api("GET", "/api/survive/stats", undefined, me[0].token);
  ok("成績を 読める", stt.status === 200 && stt.data.ok, stt.data);
  ok("試合数が 1", stt.data.stats && stt.data.stats.matches === 1, stt.data.stats);
  ok("記録が 残る", (stt.data.records || []).some((r) => r.courseId === "c02" && r.bestMs > 0), stt.data.records);
  const lb = await api("GET", "/api/survive/leaderboard/c02");
  ok("コースの 上位が 読める", lb.status === 200 && Array.isArray(lb.data.rows) && lb.data.rows.length >= 1, lb.data);

  節("⑪ 友だち");
  const fr = await api("GET", "/api/survive/friends", undefined, me[0].token);
  ok("友だちの 一覧が 引ける", fr.status === 200 && Array.isArray(fr.data.friends), fr.data);
  const fr2 = await api("GET", "/api/survive/friends");
  ok("札が 無ければ 断る", fr2.status === 401, fr2.status);

  for (const b of [A, B, C, D2]) { try { b.ws.close(); } catch (e) {} }
  await 待つ(200);

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
