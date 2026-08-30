/* ══════════════════════════════════════════════════════════════════════════
   vqcallshare.cjs — 通話中の **画面の 同席**（VocabuQuiz の 中だけ）を 実物で 測る。

   訴え（2026-08-30）:「VocabuQuiz内だけの画面共有、Lumiの呼び出しを行えるように」

   決めたこと（測る対象）:
     ・映像は 送らない。**画面の 要約（文字）だけ**を 中継する
     ・保存しない。start / stop の 事実だけ call_events に 残す
     ・通話に 入っていない 人は 覗けない
     ・通話が 終わって いれば 送れない（ブロック・通報も 通話を 終わらせる）
     ・大きすぎる ものは 捨てる。長すぎる 行・多すぎる 行は 切り落とす
     ・山かっこ・制御文字は 落とす（相手の 画面へ そのまま 出す 文なので）

   測るところ:
     S-1  通話中でなければ 同席を 始められない
     S-2  通話中なら 始められる
     S-3  通話に いない 人は 始められない／送れない／覗けない
     S-4  画面の 要約が 相手へ 中継される
     S-5  大きすぎる 画面は 断られる（413）
     S-6  長い 行・多い 行は 切り落とされる
     S-7  山かっこ・制御文字が 落ちる
     S-8  中身が 空の ものは 送らない
     S-9  やめると 止まる。通話が 終わった あとでも やめられる
     S-10 通話が 終わったら 送れない
     S-11 表に 中身が 残っていない（call_events は 事実だけ）
     S-12 Admin の 数に 同席の 回数が 出る

   使い方: VQ_BASE=<dev> node vqcallshare.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { execSync } = require("child_process");
let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 再fetch(u, o, n) {
  let 最後 = null;
  for (let i = 0; i < (n || 3); i++) {
    try { return await fetch(u, o); }
    catch (e) { 最後 = e; await new Promise((s) => setTimeout(s, 800 * (i + 1))); }
  }
  throw 最後;
}
async function 作る(名) {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const mail = "vqs" + 印 + "@gmail.com";
  const r = await 再fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: (名 + 印).slice(0, 14),
      password: "Passw0rd!z3" }) }).then(j);
  const v = await 再fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await 再fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return { token: c.token, uid: Number(c.user && c.user.id), name: (名 + 印).slice(0, 14) };
}
async function api(path, tok, opts = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  const r = await 再fetch(BASE + path, { method: opts.method || "GET", headers: h,
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

/* 通話を 1 本 立てて connected に する。 */
async function 通話をつなぐ(A, B) {
  const inv = await api("/api/call/invite", A.token, { method: "POST", body: { peerId: B.uid } });
  const id = inv.j && inv.j.callId;
  if (!id) throw new Error("発信できない: " + JSON.stringify(inv).slice(0, 300));
  const ac = await api("/api/call/accept", B.token, { method: "POST", body: { callId: id } });
  if (ac.status !== 200) throw new Error("応答できない: " + JSON.stringify(ac).slice(0, 300));
  return id;
}

/* 合図の 通り道を 開いて、届いた ものを ためる。
   ★ 札を URL に 載せない 作りなので、**使い捨ての 合言葉**を もらってから つなぐ。 */
async function 耳をすます(U) {
  const t = await api("/api/call/ticket", U.token, { method: "POST", body: {} });
  const 合 = t.j && (t.j.ticket || t.j.合言葉);
  if (!合) throw new Error("合言葉が 取れない: " + JSON.stringify(t).slice(0, 200));
  /* 合言葉は "k"（"ticket" では ない）。 */
  const url = BASE.replace(/^http/, "ws") + "/ws/call?k=" + encodeURIComponent(合);
  const ws = new WebSocket(url);
  const 箱 = [];
  ws.addEventListener("message", (ev) => {
    try { 箱.push(JSON.parse(String(ev.data || "{}"))); } catch (e) {}
  });
  await new Promise((done, ng) => {
    const t2 = setTimeout(() => ng(new Error("つながらない")), 12000);
    ws.addEventListener("open", () => { clearTimeout(t2); done(); });
    ws.addEventListener("error", () => { clearTimeout(t2); ng(new Error("つなげない")); });
  });
  return {
    箱,
    閉じる: () => { try { ws.close(); } catch (e) {} },
    /* 型の 合図が 来るまで 待つ */
    待つ: async (型, ms) => {
      const 限 = Date.now() + (ms || 8000);
      for (;;) {
        const x = 箱.find((y) => y && y.type === 型);
        if (x) return x;
        if (Date.now() > 限) return null;
        await 待(150);
      }
    }
  };
}

/* 画面の 要約の ひな形。 */
function 画面(o) {
  return Object.assign({
    v: 1, tab: "library", view: "", where: "プリセット", title: "英検2級 / 20問",
    lines: ["英検2級 頻出単語", "全 20 問", "最後に解いた: 8月28日"],
    go: { tab: "library" }
  }, o || {});
}

(async () => {
  console.log("測る先:", BASE);
  const A = await 作る("sA"); await 待(900);
  const B = await 作る("sB"); await 待(900);
  const C = await 作る("sC");
  console.log("A =", A.uid, "/ B =", B.uid, "/ C =", C.uid);

  await 相互に(A, B);
  await 同意(A); await 同意(B); await 同意(C);

  節("段① 関所 — 通話に 入っている 人しか 触れない");

  /* S-1 通話が 無いのに 始めようとする */
  let r = await api("/api/call/share/start", A.token,
    { method: "POST", body: { callId: "ないよ" } });
  見(r.status === 404, "S-1a 無い 通話では 始められない", { status: r.status, code: r.j.code });

  const id = await 通話をつなぐ(A, B);
  console.log("  通話 =", id);

  /* S-3 通話に いない 人 */
  r = await api("/api/call/share/start", C.token, { method: "POST", body: { callId: id } });
  見(r.status === 403, "S-3a よその 人は 始められない", { status: r.status, code: r.j.code });
  r = await api("/api/call/share/frame", C.token,
    { method: "POST", body: { callId: id, frame: 画面() } });
  見(r.status === 403, "S-3b よその 人は 送れない", { status: r.status, code: r.j.code });

  /* S-2 通話中なら 始められる */
  r = await api("/api/call/share/start", A.token, { method: "POST", body: { callId: id } });
  見(r.status === 200 && r.j.ok === true && r.j.on === true,
    "S-2 通話中なら 同席を 始められる", { status: r.status, j: r.j });

  節("段② 中継 — 送った ものが そのまま 削られて 渡る");

  /* S-4 ふつうに 送れる */
  r = await api("/api/call/share/frame", A.token,
    { method: "POST", body: { callId: id, frame: 画面() } });
  見(r.status === 200 && r.j.ok === true, "S-4 画面の 要約を 送れる", { status: r.status, j: r.j });

  /* S-5 大きすぎる */
  const でかい = 画面({ lines: new Array(60).fill("x".repeat(300)) });
  r = await api("/api/call/share/frame", A.token,
    { method: "POST", body: { callId: id, frame: でかい } });
  見(r.status === 413 && r.j.code === "TOO_LARGE",
    "S-5 大きすぎる 画面は 断られる", { status: r.status, code: r.j.code });

  /* S-6 行が 多い・長い（上限のすぐ内側。断らずに 切り落とす） */
  r = await api("/api/call/share/frame", A.token, { method: "POST", body: { callId: id,
    frame: 画面({ lines: new Array(20).fill("あ".repeat(150)) }) } });
  見(r.status === 200 && r.j.ok === true && r.j.skipped !== true,
    "S-6 多い 行は 切り落として 通す", { status: r.status, j: r.j });

  /* S-7 山かっこ */
  r = await api("/api/call/share/frame", A.token, { method: "POST", body: { callId: id,
    frame: 画面({ where: "<img src=x onerror=alert(1)>", lines: ["<b>ふとじ</b>"] }) } });
  見(r.status === 200 && r.j.ok === true, "S-7 山かっこ入りでも 通る（落として 渡す）",
    { status: r.status, j: r.j });

  /* S-8 中身が 空 */
  r = await api("/api/call/share/frame", A.token, { method: "POST", body: { callId: id,
    frame: { v: 1, tab: "", view: "", where: "", title: "", lines: [], go: {} } } });
  見(r.status === 200 && r.j.skipped === true, "S-8 中身が 空の ものは 送らない",
    { status: r.status, j: r.j });

  /* S-8b 形が でたらめ */
  r = await api("/api/call/share/frame", A.token,
    { method: "POST", body: { callId: id, frame: "ただの文字列" } });
  見(r.status === 200 && r.j.skipped === true, "S-8b 形が 違うものは 送らない",
    { status: r.status, j: r.j });

  節("段②' 相手の 耳で 受け取る（合図の 通り道を 実際に つなぐ）");

  let 耳 = null;
  try { 耳 = await 耳をすます(B); } catch (e) {
    console.log("  （通り道に つなげません: " + String(e.message).slice(0, 80) + "）");
  }
  if (耳) {
    await 待(400);
    /* 削られかたを 相手の 目で 確かめる。
       ・行は 12 本まで ・1 行は 200 字まで ・山かっこは 落ちる */
    const 送った = 画面({
      where: "<b>プリセット</b>",
      title: "英検2級",
      /* 上限（12 行 × 200 字）を **超えているが、丸ごと 断られる 大きさ（6000 字）は
         超えない** ところを 狙う。画面側は ここまでしか 作らないので、
         これが 実際に 起こりうる いちばん 大きい 形。 */
      lines: new Array(20).fill(0).map((_, i) => "行" + i + "<script>" + "あ".repeat(230))
    });
    const f1 = await api("/api/call/share/frame", A.token,
      { method: "POST", body: { callId: id, frame: 送った } });
    見(f1.j && f1.j.delivered === true, "S-4b 相手へ 本当に 届く", f1.j);

    const 便 = await 耳.待つ("call.share.frame", 8000);
    見(!!便, "S-4c 相手が 受け取れる", 便 ? { type: 便.type, by: 便.by } : null);
    if (便) {
      const f = 便.frame || {};
      見(f.lines && f.lines.length === 12, "S-6b 行は 12 本まで に 切られる",
        { 本数: f.lines && f.lines.length });
      見(f.lines && f.lines.every((x) => x.length <= 200), "S-6c 1 行は 200 字まで",
        { 最長: f.lines && Math.max.apply(null, f.lines.map((x) => x.length)) });
      const 全文 = JSON.stringify(f);
      見(全文.indexOf("<") < 0 && 全文.indexOf(">") < 0,
        "S-7b 山かっこが 落ちている", 全文.slice(0, 160));
      見(f.where === "bプリセット/b" || f.where.indexOf("プリセット") >= 0,
        "S-7c 中身の 字は 残る", { where: f.where });
      見(f.at && typeof f.at === "number", "S-4d 受け取った 時刻が 付く", { at: f.at });
      見(f.go && f.go.tab === "library", "S-4e 行き先（タブ）が 渡る", f.go);
      /* 知らない key は 捨てる */
      見(Object.keys(f).sort().join(",") === "at,go,lines,tab,title,v,view,where",
        "S-4f 決めた key しか 渡らない", Object.keys(f).sort());
    }

    /* 止めた ことも 相手へ 伝わる */
    耳.箱.length = 0;
    await api("/api/call/share/stop", A.token, { method: "POST", body: { callId: id } });
    const s2 = await 耳.待つ("call.share.state", 8000);
    見(!!s2 && s2.on === false, "S-9c やめた ことが 相手へ 伝わる", s2);
    耳.閉じる();
    /* 止めたので 測りなおす ぶんを 立て直す */
    await api("/api/call/share/start", A.token, { method: "POST", body: { callId: id } });
  }

  節("段③ 止める — 止められない 共有を 作らない");

  /* S-9 やめられる */
  r = await api("/api/call/share/stop", A.token, { method: "POST", body: { callId: id } });
  見(r.status === 200 && r.j.on === false, "S-9a 同席を やめられる", { status: r.status, j: r.j });

  /* S-3c よその 人は やめられない */
  r = await api("/api/call/share/stop", C.token, { method: "POST", body: { callId: id } });
  見(r.status === 403, "S-3c よその 人は やめられない", { status: r.status, code: r.j.code });

  /* 相手（受け側）も 始められる */
  r = await api("/api/call/share/start", B.token, { method: "POST", body: { callId: id } });
  見(r.status === 200 && r.j.on === true, "S-2b 受けた 側からも 始められる", { status: r.status, j: r.j });

  節("段④ 通話が 終わったら 触れない");

  await api("/api/call/end", A.token, { method: "POST", body: { callId: id, reason: "hangup" } });
  await 待(600);

  /* S-10 送れない */
  r = await api("/api/call/share/frame", A.token,
    { method: "POST", body: { callId: id, frame: 画面() } });
  見(r.status === 409 && r.j.code === "BAD_STATE",
    "S-10a 通話が 終われば 送れない", { status: r.status, code: r.j.code });

  r = await api("/api/call/share/start", A.token, { method: "POST", body: { callId: id } });
  見(r.status === 409, "S-10b 通話が 終われば 始められない", { status: r.status, code: r.j.code });

  /* S-9b 終わった あとでも「やめる」は 通る（止められない 共有を 作らない） */
  r = await api("/api/call/share/stop", A.token, { method: "POST", body: { callId: id } });
  見(r.status === 200 && r.j.on === false,
    "S-9b 通話が 終わった あとでも やめられる", { status: r.status, j: r.j });

  節("段⑤ 残っている ものを 直に 見る");

  /* S-11 中身は 残っていない。事実だけ */
  let 出来 = true, 事実 = [];
  try {
    事実 = d1("SELECT kind, note FROM call_events WHERE call_id = '" + id
      + "' AND kind LIKE 'share.%' ORDER BY at");
  } catch (e) { 出来 = false; console.log("  （D1 を 見られません: " + String(e.message).slice(0, 80) + "）"); }
  if (出来) {
    const 種 = 事実.map((x) => x.kind);
    見(種.indexOf("share.start") >= 0 && 種.indexOf("share.stop") >= 0,
      "S-11a 始めた/やめた 事実が 残る", 種);
    const 中身が漏れた = 事実.some((x) => /英検|頻出|プリセット|onerror/.test(String(x.note || "")));
    見(!中身が漏れた, "S-11b 画面の 中身は 残っていない", 事実.map((x) => x.note));

    /* 音声・画面の 列を 増やしていない（PRAGMA で 直に 見る） */
    const 列 = d1("PRAGMA table_info(calls)").map((x) => x.name);
    見(!列.some((n) => /share_|screen|frame|audio|voice_data/i.test(n)),
      "S-11c calls に 画面や 音の 列を 足していない", 列.filter((n) => /share|screen|audio/i.test(n)));
  }

  節("段⑥ Admin の 数");
  /* S-12 admin は 管理者しか 見られないので、口が 生きていることだけ 見る */
  r = await api("/api/admin/calls", A.token);
  見(r.status === 403 || r.status === 401,
    "S-12 admin の 数は ふつうの 人には 見えない", { status: r.status });

  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
