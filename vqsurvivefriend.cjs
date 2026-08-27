#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivefriend.cjs — 友だちと 招待（要件 8 / 12）。

   ・相互に フォローして いる 人だけが 出る
   ・招待は 相互フォローの 人にだけ 送れる
   ・同じ 相手へは 1 日 3 回まで
   ・通知として 実際に 届く

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

async function api(m, p, b, t) {
  const h = { "Content-Type": "application/json" };
  if (t) h.Authorization = "Bearer " + t;
  const r = await fetch(BASE + p, { method: m, headers: h, body: b === undefined ? undefined : JSON.stringify(b) });
  const x = await r.text();
  let d = null; try { d = x ? JSON.parse(x) : null; } catch (e) { d = { raw: x.slice(0, 200) }; }
  return { s: r.status, d: d || {} };
}
async function 人(i) {
  const n = "fr" + Date.now().toString(36).slice(-5) + i;
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: n, password: "DevFr#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.d.token) throw new Error("作れません");
  const me = await api("GET", "/api/auth/me", undefined, r.d.token);
  const id = (me.d && (me.d.id || (me.d.user && me.d.user.id))) || 0;
  return { t: r.d.token, n, id };
}

(async () => {
  const A = await 人(1), B = await 人(2), C = await 人(3);
  console.log("     id: A=" + A.id + " B=" + B.id + " C=" + C.id);

  節("① フォローする 前");
  const f0 = await api("GET", "/api/survive/friends", undefined, A.t);
  ok("友だちは 0 人", f0.s === 200 && (f0.d.friends || []).length === 0, f0.d);

  節("② 片方だけ フォロー");
  const t1 = await api("POST", "/api/follow/toggle", { targetUserId: B.id, follow: true }, A.t);
  console.log("     A→B: " + t1.s + " " + JSON.stringify(t1.d).slice(0, 120));
  const f1 = await api("GET", "/api/survive/friends", undefined, A.t);
  ok("片方だけでは 友だちに ならない", (f1.d.friends || []).length === 0, f1.d.friends);

  節("③ 相互に フォロー");
  const t2 = await api("POST", "/api/follow/toggle", { targetUserId: A.id, follow: true }, B.t);
  console.log("     B→A: " + t2.s);
  const f2 = await api("GET", "/api/survive/friends", undefined, A.t);
  const 相互 = (f2.d.friends || []).length > 0;
  ok("相互なら 友だちに なる", 相互, f2.d.friends);
  if (相互) {
    ok("相手の 名前が 入っている", !!f2.d.friends[0].name, f2.d.friends[0]);
    ok("相手の id が 入っている", String(f2.d.friends[0].id) === String(B.id), f2.d.friends[0]);
    const f2b = await api("GET", "/api/survive/friends", undefined, B.t);
    ok("反対から 見ても 友だち", (f2b.d.friends || []).length > 0, f2b.d.friends);
  }

  節("④ 招待");
  const room = await api("POST", "/api/survive/room", { courseId: "c01" }, A.t);
  const roomId = room.d.roomId;
  ok("部屋を 作れる", !!roomId, room.d);
  const bad1 = await api("POST", "/api/survive/invite", { userId: C.id, roomId }, A.t);
  ok("友だちで ない 人は 誘えない", bad1.s === 403, { s: bad1.s, d: bad1.d });
  const bad2 = await api("POST", "/api/survive/invite", { userId: A.id, roomId }, A.t);
  ok("自分は 誘えない", bad2.s === 400, bad2.s);
  const bad3 = await api("POST", "/api/survive/invite", { userId: B.id }, A.t);
  ok("あいことばが 無ければ 断る", bad3.s === 400, bad3.s);
  const bad4 = await api("POST", "/api/survive/invite", { userId: B.id, roomId });
  ok("札が 無ければ 断る", bad4.s === 401, bad4.s);

  if (相互) {
    const inv = await api("POST", "/api/survive/invite", { userId: B.id, roomId }, A.t);
    ok("友だちは 誘える", inv.s === 200 && inv.d.sent === true, inv.d);

    節("⑤ 通知として 届く");
    /* ★ 一覧の 口は /api/user/notifications（/api/notifications では ない）。 */
    const nt = await api("GET", "/api/user/notifications", undefined, B.t);
    const rows = (nt.d && (nt.d.notifications || nt.d.items || nt.d.rows)) || [];
    const 招待 = rows.filter((r) => String(r.type || "") === "survive_invite");
    ok("誘われた 人に 通知が 届く", 招待.length >= 1, { 全: rows.length, 型: rows.map((r) => r.type).slice(0, 5) });
    if (招待.length) {
      ok("あいことばが 通知に 入っている",
        String(招待[0].body || "").indexOf(roomId) >= 0, 招待[0].body);
      ok("誘った 人の 名前が 入っている",
        String(招待[0].title || "").indexOf(A.n) >= 0, 招待[0].title);
    }

    節("⑥ しつこさを 止める");
    let 送れた = 1;
    for (let i = 0; i < 5; i++) {
      const r = await api("POST", "/api/survive/invite", { userId: B.id, roomId }, A.t);
      if (r.d && r.d.sent) 送れた++;
    }
    ok("同じ 相手へは 1 日 3 回まで", 送れた <= 3, 送れた);
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
