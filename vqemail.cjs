/* ══════════════════════════════════════════════════════════════════════
   メールアドレスの登録（必須化）の通し確認 — 開発環境のみ

   ・ログインしただけの人は「メールがまだ」と分かること
   ・登録の画面が出て、コードで確かめて、最後まで通ること
   ・登録が済んだら「もう要らない」と分かること
   ・登録したアドレスで、パスワードの再設定まで実際にできること
   ・連携しているアカウントの一覧が読めること

   使い方: node vqemail.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: data || {} };
}

(async () => {
  console.log("接続先: " + BASE + "（開発環境）");
  const nick = "eml" + Date.now().toString(36).slice(-7);
  const grade = "H2";
  const pw0 = "FirstPass#2026a";
  const pw1 = "SecondPass#2026b";
  const addr = "vqtest." + nick + "@gmail.com";

  section("準備：検証用アカウントを作る");
  const reg = await api("POST", "/api/auth/register", {
    gradePrefix: grade, nickname: nick, password: pw0, tosAccepted: true, tosVersion: "1" });
  ok("アカウントを作れた", !!reg.data.token, reg.data);
  const token = reg.data.token;
  if (!token) { console.log("先へ進めません。"); process.exit(1); }

  section("★ログイン直後に「メールがまだ」と分かる");
  {
    const me = await api("GET", "/api/auth/me", undefined, token);
    ok("/api/auth/me が読める", me.status === 200, me.status);
    ok("account が返る", !!me.data.account, Object.keys(me.data || {}));
    ok("★needsEmail が true（＝画面が足止めする）", me.data.account && me.data.account.needsEmail === true, me.data.account);
    ok("setupRequired も true", me.data.setupRequired === true, me.data.setupRequired);
  }

  section("Gmail 以外は受け取らない");
  {
    const r = await api("POST", "/api/auth/upgrade/email/start", { email: "someone@example.com" }, token);
    ok("gmail 以外は断る", r.status === 400 && r.data.code === "EMAIL_NOT_GMAIL", r.data);
    ok("理由が日本語で分かる", /gmail\.com/.test(r.data.message || ""), r.data.message);

    const r2 = await api("POST", "/api/auth/upgrade/email/start", { email: "こわれた" }, token);
    ok("形になっていないものも断る", r2.status === 400, r2.data);

    const r3 = await api("POST", "/api/auth/upgrade/email/start", { email: addr });
    ok("ログインしていないと受け取らない", r3.status === 401, r3.status);
  }

  section("★確認コードを送って、確かめる");
  let challengeId = null, code = null;
  {
    const r = await api("POST", "/api/auth/upgrade/email/start", { email: addr }, token);
    ok("確認コードを送れた", r.status === 200 && !!r.data.challengeId, r.data);
    challengeId = r.data.challengeId;
    code = r.data.devCode;
    ok("開発環境ではコードが返る（本番では返らない）", !!code, Object.keys(r.data));
    ok("画面に出すための伏せたアドレスが返る", !!r.data.maskedEmail, r.data.maskedEmail);
    ok("伏せたアドレスに素のアドレスが混ざっていない", !(r.data.maskedEmail || "").includes(nick), r.data.maskedEmail);

    const again = await api("POST", "/api/auth/upgrade/email/start", { email: addr }, token);
    ok("すぐ送り直すと待たされる", again.status === 429 && again.data.code === "RESEND_COOLDOWN", again.data);
    ok("いつ送り直せるかが返る", !!again.data.retryAtMs, again.data.retryAtMs);
  }
  {
    const wrong = await api("POST", "/api/auth/upgrade/email/verify",
      { challengeId, code: code === "000000" ? "111111" : "000000" }, token);
    ok("違うコードは通らない", wrong.status === 401 && wrong.data.code === "CODE_MISMATCH", wrong.data);
    ok("あと何回かが返る", wrong.data.remaining !== undefined, wrong.data);

    const nf = await api("POST", "/api/auth/upgrade/email/verify", { challengeId: "upg_ない", code }, token);
    ok("知らない受付番号は断る", nf.status === 404, nf.status);

    const done = await api("POST", "/api/auth/upgrade/email/verify", { challengeId, code }, token);
    ok("★確認できた", done.status === 200 && done.data.ok === true, done.data);
    ok("その場で「もう要らない」と返る", done.data.needsEmail === false, done.data);

    const twice = await api("POST", "/api/auth/upgrade/email/verify", { challengeId, code }, token);
    ok("同じ受付番号は 2 度使えない", twice.status === 409, twice.data);
  }

  section("★登録が済んだら足止めしない");
  {
    const me = await api("GET", "/api/auth/me", undefined, token);
    ok("★needsEmail が false になる", me.data.account && me.data.account.needsEmail === false, me.data.account);
    ok("登録したアドレスが伏せた形で返る", !!(me.data.account || {}).email, (me.data.account || {}).email);
    ok("素のアドレスは返さない", !String((me.data.account || {}).email || "").includes(nick), (me.data.account || {}).email);
  }

  section("ほかの人が同じアドレスを取れない");
  {
    const nick2 = nick + "x";
    const reg2 = await api("POST", "/api/auth/register", {
      gradePrefix: grade, nickname: nick2, password: pw0, tosAccepted: true, tosVersion: "1" });
    const t2 = reg2.data.token;
    if (t2) {
      const r = await api("POST", "/api/auth/upgrade/email/start", { email: addr }, t2);
      ok("使われているアドレスは断る", r.status === 409 && r.data.code === "EMAIL_TAKEN", r.data);
      await api("POST", "/api/auth/delete", { password: pw0 }, t2).catch(() => {});
    } else {
      ok("使われているアドレスは断る", false, "2 人目を作れませんでした");
    }
  }

  section("★これで再設定が本当にできる（登録の目的そのもの）");
  {
    const m = await api("GET", "/api/auth/reset/methods?gradePrefix=" + grade + "&nickname=" + nick);
    const byId = {};
    (m.data.methods || []).forEach((x) => { byId[x.id] = x; });
    ok("★再設定でメールが「使える」に変わる", byId.email && byId.email.available === true, byId.email);
    ok("どのアドレスへ送るかが分かる", !!(byId.email || {}).hint, (byId.email || {}).hint);

    const st = await api("POST", "/api/auth/reset/start", { gradePrefix: grade, nickname: nick });
    ok("★もう NEED_EMAIL_SETUP で断られない", st.status === 200, st.data);
    const cid = st.data.challengeId, rcode = st.data.devCode;
    ok("受付番号とコードが返る", !!cid && !!rcode, Object.keys(st.data));

    const vc = await api("POST", "/api/auth/reset/code", { challengeId: cid, code: rcode });
    ok("コードで引き換え札が出る", vc.status === 200 && !!vc.data.resetToken, vc.data);

    const done = await api("POST", "/api/auth/reset/password",
      { challengeId: cid, resetToken: vc.data.resetToken, newPassword: pw1 });
    ok("★メールだけでパスワードを変えられた", done.status === 200 && done.data.ok, done.data);

    const login = await api("POST", "/api/auth/login", { gradePrefix: grade, nickname: nick, password: pw1 });
    ok("★新しいパスワードで入れる", !!login.data.token, login.data);

    section("連携しているアカウントの一覧");
    if (login.data.token) {
      const li = await api("GET", "/api/auth/social/list", undefined, login.data.token);
      ok("一覧が読める", li.status === 200 && Array.isArray(li.data.identities), li.data);
      ok("まだ 0 件（誰とも結んでいない）", (li.data.identities || []).length === 0, li.data.identities);
      ok("パスワードを持っていることが分かる", li.data.hasPassword === true, li.data.hasPassword);
      ok("結べる先の一覧も返る", Array.isArray(li.data.available) && li.data.available.length > 0, li.data.available);

      const un = await api("POST", "/api/auth/social/unlink", { provider: "google" }, login.data.token);
      ok("結んでいないものを外そうとしても壊れない", un.status === 200 || un.status === 400, un.status);

      await api("POST", "/api/auth/delete", { password: pw1 }, login.data.token).catch(() => {});
    }
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) { console.log("\n  失敗:"); bad.forEach(b => console.log("   - " + b)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
