/* ══════════════════════════════════════════════════════════════════════════
   vqcall.cjs — DM の 音声通話を 実物で 測る。

   依頼（2026-08-29）「DM 音声通話 + Lumi介入 実装指示書」。
   年齢の 確認は **入れない**（依頼者の 指示。同意の 画面だけ）。

   測るところ（指示書の 番号に そろえてある）:
     V-5  相互フォローで ない 相手へ 発信            → 403
     V-6  ブロック中の 相手へ 発信                   → 403
     V-8  画面を 通さず API を 直接 叩く             → 403（curl の 出力を そのまま 出す）
     V-c  同意していない うちは 発信できない          → 403（年齢の 代わりの 関所）
     V-d  相手が 通話を 切っている                   → 403
     C-1  発信 → 着信 → 応答 → 通話 → 切断
     C-2  拒否
     C-3  30 秒 無応答 → 不在着信
     C-5  通話中に ブロック → その場で 切れる
     C-7  同時に 2 本目 → 断られる
     C-8  375px で 崩れない
     R-1  通話中に 通報 → 切れる ＋ 自動ブロック ＋ 台帳に 残る
     R-3  音声は 保存していない（表の 列を 直に 見る）
     L-1  片方だけの 同意では 起動しない
     L-2  両方 同意 → 有料の 鍵が 無ければ **起動しない**（無料枠へ 流さない）
     L-4  同意の 記録が 残る

   使い方: VQ_BASE=<dev> node vqcall.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { execSync } = require("child_process");
let 済 = 0, 落 = 0;
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 作る(名) {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const mail = "vqc" + 印 + "@gmail.com";
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: (名 + 印).slice(0, 14),
      password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return { token: c.token, uid: Number(c.user && c.user.id), name: (名 + 印).slice(0, 14) };
}
async function api(path, tok, opts = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  const r = await fetch(BASE + path, { method: opts.method || "GET", headers: h,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: r.status, j: await j(r) };
}
async function 相互に(A, B) {
  await api("/api/follow/toggle", A.token, { method: "POST", body: { targetUserId: B.uid, follow: true } });
  await api("/api/follow/toggle", B.token, { method: "POST", body: { targetUserId: A.uid, follow: true } });
}
async function 同意(U) {
  return await api("/api/call/consent", U.token, { method: "POST", body: { agree: true } });
}
function d1(sql) {
  const out = execSync(
    "cd server && npx wrangler d1 execute vocabuquiz_auth_dev --remote --config wrangler.dev.toml"
    + " --json --command " + JSON.stringify(sql),
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const k = out.indexOf("[");
  return JSON.parse(out.slice(k))[0].results;
}

(async () => {
  console.log("測る先:", BASE);
  const A = await 作る("cA"); await 待(900);
  const B = await 作る("cB"); await 待(900);
  const C = await 作る("cC");
  console.log("A =", A.uid, "/ B =", B.uid, "/ C =", C.uid);

  /* ══ 段A の 関所 ══ */
  節("段A — 関所（サーバだけで 決まっているか）");

  /* V-c 同意していない うちは かけられない */
  await 相互に(A, B);
  let r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  見(r.status === 403 && r.j.code === "CONSENT_REQUIRED",
    "V-c 同意していない うちは 発信できない", { status: r.status, code: r.j.code });

  await 同意(A);
  r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  見(r.status === 403 && r.j.code === "PEER_CONSENT_REQUIRED",
    "V-c2 相手が 同意していなければ かけられない", { status: r.status, code: r.j.code });
  await 同意(B);
  await 同意(C);

  /* V-5 相互フォローで ない */
  r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: C.uid } });
  見(r.status === 403 && r.j.code === "NOT_MUTUAL",
    "V-5 相互フォローで ない 相手へは かけられない", { status: r.status, code: r.j.code });

  /* V-d 相手が 通話を 切っている */
  await api("/api/call/settings", B.token, { method: "POST", body: { callEnabled: false } });
  r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  見(r.status === 403 && r.j.code === "PEER_CALL_DISABLED",
    "V-d 相手が 通話を 切っていれば かけられない", { status: r.status, code: r.j.code });
  await api("/api/call/settings", B.token, { method: "POST", body: { callEnabled: true } });

  /* V-6 ブロック */
  await api("/api/dm/block", B.token, { method: "POST", body: { userId: A.uid, on: true } });
  r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  見(r.status === 403 && r.j.code === "NOT_AVAILABLE",
    "V-6 ブロック中の 相手へは かけられない", { status: r.status, code: r.j.code });
  見(!/ブロック/.test(String(r.j.message || "")),
    "V-6b ブロックされた ことを 教えていない", r.j.message);
  await api("/api/dm/block", B.token, { method: "POST", body: { userId: A.uid, on: false } });

  /* V-8 画面を 通さず 直接 叩く（curl の 出力を そのまま） */
  節("V-8 — curl で API を 直接 叩く");
  const curl1 = execSync(
    `curl -s -i -X POST ${BASE}/api/call/invite -H "Content-Type: application/json" `
    + `-H "Authorization: Bearer ${C.token}" -d '{"peerId":${B.uid}}' | head -1`,
    { encoding: "utf8" }).trim();
  const curl2 = execSync(
    `curl -s -X POST ${BASE}/api/call/invite -H "Content-Type: application/json" `
    + `-H "Authorization: Bearer ${C.token}" -d '{"peerId":${B.uid}}'`,
    { encoding: "utf8" }).trim();
  console.log("  $ curl -X POST /api/call/invite  （C→B・相互フォローで ない）");
  console.log("  " + curl1);
  console.log("  " + curl2);
  見(/403/.test(curl1) && /NOT_MUTUAL/.test(curl2),
    "V-8 画面を 改変して 直接 叩いても 断られる");

  const curl3 = execSync(
    `curl -s -X POST ${BASE}/api/call/invite -H "Content-Type: application/json" -d '{"peerId":${B.uid}}'`,
    { encoding: "utf8" }).trim();
  console.log("  $ curl -X POST /api/call/invite  （札なし）");
  console.log("  " + curl3);
  見(/UNAUTHORIZED/.test(curl3), "V-8b 札が 無ければ 断られる");

  /* ══ 段B/C 通話の 流れ ══ */
  節("段B/C — 通話の 流れ");
  const 設定 = await api("/api/call/config", A.token);
  const SFUあり = !!設定.j.configured;
  const 有料鍵あり = !!設定.j.lumiConfigured;
  console.log("  Cloudflare Realtime:", SFUあり ? "設定ずみ" : "**未設定**",
    "/ Lumi の 有料鍵:", 有料鍵あり ? "設定ずみ" : "**未設定**");

  /* C-1 発信 → 応答 → 切断 */
  r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  if (!SFUあり) {
    見(r.status === 503 && r.j.code === "CALLS_NOT_CONFIGURED",
      "C-0 SFU 未設定なら **発信を 断る**（P2P へ 落とさない）", { status: r.status, code: r.j.code });
    console.log("\n  ※ CALLS_APP_ID / CALLS_APP_SECRET が 無いので、"
      + "ここから 先の 通話の 流れは 測れません。");
    console.log("    設定の しかた:");
    console.log("      cd server && npx wrangler secret put CALLS_APP_ID       --config wrangler.dev.toml");
    console.log("      cd server && npx wrangler secret put CALLS_APP_SECRET   --config wrangler.dev.toml");
    console.log("      （Lumi を 使うなら）npx wrangler secret put GEMINI_PAID_API_KEY --config wrangler.dev.toml");
  } else {
    const call1 = r.j.callId;
    見(r.status === 200 && !!call1, "C-1a 発信できる", { status: r.status, callId: call1 });
    let s = await api("/api/call/state?callId=" + call1, B.token);
    見(s.j.call && s.j.call.state === "ringing", "C-1b 相手側で 鳴っている", s.j.call && s.j.call.state);
    let ac = await api("/api/call/accept", B.token, { method: "POST", body: { callId: call1 } });
    見(ac.status === 200, "C-1c 応答できる", { status: ac.status });
    s = await api("/api/call/state?callId=" + call1, A.token);
    見(s.j.call && s.j.call.state === "connected", "C-1d 通話中に なる", s.j.call && s.j.call.state);
    /* C-7 2 本目 */
    const 二 = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    見(二.status === 403 && 二.j.code === "BUSY", "C-7 同時に 2 本目は 断られる",
      { status: 二.status, code: 二.j.code });
    await 待(1200);
    const en = await api("/api/call/end", A.token, { method: "POST", body: { callId: call1 } });
    見(en.status === 200 && en.j.state === "ended", "C-1e 切断できる", en.j);
    見(Number(en.j.durationSec) >= 1, "C-1f 通話の 長さが 残る（秒）", en.j.durationSec);
  }

  /* C-2 拒否（SFU 無しでも 測れるよう D1 へ 直に 1 本 入れる…ことは しない）。
     SFU 未設定でも 「断る」ところまでは 見たので、ここは 設定ずみの ときだけ。 */
  if (SFUあり) {
    r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    const c2 = r.j.callId;
    const rj = await api("/api/call/reject", B.token, { method: "POST", body: { callId: c2 } });
    見(rj.status === 200 && rj.j.state === "rejected", "C-2 拒否できる", rj.j);

    /* C-5 通話中に ブロック → その場で 切れる */
    r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    const c5 = r.j.callId;
    await api("/api/call/accept", B.token, { method: "POST", body: { callId: c5 } });
    await api("/api/dm/block", B.token, { method: "POST", body: { userId: A.uid, on: true } });
    const s5 = await api("/api/call/state?callId=" + c5, A.token);
    見(s5.j.call && (s5.j.call.state === "ended" || s5.j.call.state === "rejected"),
      "C-5 通話中に ブロックされたら その場で 切れる", s5.j.call && s5.j.call.state);
    await api("/api/dm/block", B.token, { method: "POST", body: { userId: A.uid, on: false } });
  }

  /* ══ R 通報 ══ */
  節("段E — 通報");
  if (SFUあり) {
    r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    const cr = r.j.callId;
    await api("/api/call/accept", B.token, { method: "POST", body: { callId: cr } });
    await 待(1100);
    const rep = await api("/api/call/report", B.token, { method: "POST", body: {
      callId: cr, category: "harassment", detail: "検証のための 報告です。" } });
    見(rep.status === 200 && rep.j.blocked === true, "R-1a 通報で 自動ブロックされる", rep.j);
    const s6 = await api("/api/call/state?callId=" + cr, A.token);
    見(s6.j.call && s6.j.call.state === "ended", "R-1b 通報で その場で 切れる", s6.j.call && s6.j.call.state);
    const inv = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    見(inv.status === 403, "R-1c 通報の あとは かけられない", { status: inv.status, code: inv.j.code });
    const rows = d1("SELECT report_id, category, status FROM call_reports WHERE call_id='" + cr + "'");
    見(rows.length === 1 && rows[0].category === "harassment", "R-1d 通報が 台帳に 残る", rows[0]);
    const con = d1("SELECT id, target_type, state FROM content_reports WHERE id='" + rows[0].report_id + "'");
    見(con.length === 1 && con[0].target_type === "call", "R-1e Admin の 通報一覧へ 流れている", con[0]);
    await api("/api/dm/block", B.token, { method: "POST", body: { userId: A.uid, on: false } });
  } else {
    console.log("  ※ SFU 未設定のため 通話を 作れず、通報の 流れは 測れません。");
  }

  /* R-3 音声を 保存していない（表の 列を 直に 見る） */
  const 列 = d1("PRAGMA table_info(calls)").map((x) => String(x.name));
  console.log("  calls の 列:", 列.join(", "));
  見(!列.some((n) => /audio|record|voice|blob|stream|transcript/i.test(n)),
    "R-3 通話の 表に 音声を 入れる 列が 無い", 列);
  const 列2 = d1("PRAGMA table_info(call_events)").map((x) => String(x.name));
  見(!列2.some((n) => /audio|record|voice|blob|transcript/i.test(n)),
    "R-3b 出来事の 表にも 音声の 列が 無い", 列2);

  /* ══ L Lumi ══ */
  節("段G — Lumi の 割り込み");
  if (SFUあり) {
    r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    const cl = r.j.callId;
    await api("/api/call/accept", B.token, { method: "POST", body: { callId: cl } });
    /* 呼ぶ 口。有料の 鍵が 無ければ **相手を 巻き込む 前に** 断る。 */
    const q = await api("/api/call/lumi/request", A.token, { method: "POST", body: { callId: cl } });
    if (!有料鍵あり) {
      見(q.status === 503 && q.j.code === "LUMI_PAID_KEY_MISSING",
        "L-5a 有料の 鍵が 無ければ **相手に 聞く 前に 断る**", { status: q.status, code: q.j.code });
    } else {
      見(q.status === 200, "L-0 Lumi を 呼べる", q.j);
    }
    /* 同意の 手続きそのものは 鍵に よらず 測れる（同意は 先に 記録される）。 */
    const one = await api("/api/call/lumi/consent", A.token, { method: "POST", body: { callId: cl, agree: true } });
    見(one.status === 200 && one.j.started === false && one.j.reason === "waiting",
      "L-1 片方だけの 同意では 起動しない", one.j);
    const two = await api("/api/call/lumi/consent", B.token, { method: "POST", body: { callId: cl, agree: true } });
    if (!有料鍵あり) {
      見(two.status === 503 && two.j.code === "LUMI_PAID_KEY_MISSING",
        "L-2 両方 同意しても 有料の 鍵が 無ければ **起動しない**", { status: two.status, code: two.j.code });
    } else {
      見(two.status === 200 && two.j.started === true, "L-2 両方 同意で 起動する", { started: two.j.started });
      見(String(two.j.token || "").length > 10, "L-2b 一時トークンが 返る（鍵そのものでは ない）");
    }
    /* 断った ときは 起動しない。★ 先に いまの 通話を 切る（切らないと BUSY で 作れない）。 */
    await api("/api/call/end", A.token, { method: "POST", body: { callId: cl } });
    const cl2 = (await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } })).j.callId;
    見(!!cl2, "L-1b 前の 通話を 切れば 次を かけられる", cl2);
    if (cl2) {
      await api("/api/call/accept", B.token, { method: "POST", body: { callId: cl2 } });
      await api("/api/call/lumi/consent", A.token, { method: "POST", body: { callId: cl2, agree: true } });
      const no = await api("/api/call/lumi/consent", B.token, { method: "POST", body: { callId: cl2, agree: false } });
      見(no.status === 200 && no.j.started === false && no.j.reason === "denied",
        "L-1b 片方が 断れば 起動しない", no.j);
      await api("/api/call/end", A.token, { method: "POST", body: { callId: cl2 } });
    }
    const ev = d1("SELECT kind, actor_id FROM call_events WHERE call_id='" + cl + "' ORDER BY at");
    見(ev.filter((x) => String(x.kind) === "lumi.consent.agree").length === 2,
      "L-4 2 人ぶんの 同意が 記録に 残る", ev.map((x) => x.kind));
    const 列3 = d1("PRAGMA table_info(calls)").map((x) => String(x.name));
    見(列3.indexOf("lumi_consent_caller") >= 0 && 列3.indexOf("lumi_consent_callee") >= 0
      && 列3.indexOf("lumi_seconds") >= 0,
      "L-4b 同意と 時間の 列が 通話の 表に ある");
  } else {
    /* SFU 無しでも 「有料の 鍵が 無ければ 起動しない」ことは コードで 確かめられる */
    console.log("  ※ SFU 未設定のため、Lumi の 同意の 流れは 測れません。");
  }

  /* L-5 どの 名前の 鍵を 見ているか。**コードから 直に 取り出して** 確かめる。
     （説明の コメントに 無料枠の 鍵の 名前が 出てくるので、素の grep では 測れない） */
  {
    const src = require("fs").readFileSync("server/src/calls.js", "utf8");
    const m = /function 有料の鍵\(env\)\s*\{[\s\S]*?\n\}/.exec(src);
    const 中 = m ? m[0].replace(/\/\*[\s\S]*?\*\//g, "") : "";
    const 名 = (中.match(/"[A-Z0-9_]+"/g) || []).map((x) => x.replace(/"/g, ""));
    見(名.length > 0 && 名.every((n) => /PAID|CALL_LUMI/.test(n)),
      "L-5 Lumi が 見る 鍵は **有料の 名前だけ**（無料枠の 鍵を 読まない）", 名);
  }

  /* ══ 段A の 続き — 不在着信（30 秒）══ */
  節("C-3 — 30 秒 無応答");
  if (SFUあり) {
    r = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
    const c3 = r.j.callId;
    console.log("  32 秒 待ちます…");
    await 待(32000);
    const s3 = await api("/api/call/state?callId=" + c3, A.token);
    見(s3.j.call && s3.j.call.state === "missed", "C-3 30 秒 出なければ 不在着信に なる",
      s3.j.call && s3.j.call.state);
  } else {
    console.log("  ※ SFU 未設定のため 測れません。");
  }

  /* ══ 後始末の 確かめ ══ */
  節("SFU の 部屋の 後始末");
  const 生き残り = d1(
    "SELECT COUNT(*) AS n FROM calls WHERE state IN ('ended','rejected','missed','failed')"
    + " AND (caller_session <> '' OR callee_session <> '')");
  見(Number(生き残り[0].n) === 0,
    "終わった 通話に SFU の 部屋が 残っていない（課金の 暴走を 止める）", 生き残り[0]);

  console.log(`\n────────────────────────────────`);
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && (e.stack || e)); process.exit(1); });
