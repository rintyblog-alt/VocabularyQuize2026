/* ══════════════════════════════════════════════════════════════════════
   パスワードの再設定（自分でできる形）の通し確認 — 開発環境のみ

   ・管理者コードが要らないこと
   ・使える方法を先に教えること
   ・暗証番号（4/6桁）での再設定が **本当に最後まで通ること**
   ・メールが無い／暗証番号が無いときに、正直に断ること
   ・再設定したら、ほかの端末のログインが切れること

   使い方: node vqreset.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0,240) : ""))); };
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
  const nick = "rst" + Date.now().toString(36).slice(-7);
  const grade = "H1";
  const pw0 = "OldPass#2026a";
  const pw1 = "NewPass#2026b";
  const pin = "4826";

  section("準備：検証用アカウントを作る");
  const reg = await api("POST", "/api/auth/register", {
    gradePrefix: grade, nickname: nick, password: pw0, tosAccepted: true, tosVersion: "1" });
  ok("アカウントを作れた", !!reg.data.token, reg.data);
  const token0 = reg.data.token;

  section("使える方法を先に教える");
  {
    const m = await api("GET", "/api/auth/reset/methods?gradePrefix=" + grade + "&nickname=" + nick);
    ok("方法の一覧が取れる", m.status === 200 && Array.isArray(m.data.methods), m.data);
    const byId = {};
    (m.data.methods || []).forEach((x) => { byId[x.id] = x; });
    ok("メールは「まだ使えない」と出る", byId.email && byId.email.available === false, byId.email);
    ok("暗証番号も「まだ使えない」と出る", byId.pin && byId.pin.available === false, byId.pin);
    ok("どちらも使えないことが分かる", m.data.anyAvailable === false, m.data.anyAvailable);
  }

  section("メールが無いと、正直に断る");
  {
    const r = await api("POST", "/api/auth/reset/start", { gradePrefix: grade, nickname: nick });
    ok("NEED_EMAIL_SETUP で断る", r.status === 409 && r.data.code === "NEED_EMAIL_SETUP", r.data);
    ok("理由が日本語で分かる", /メールアドレスが登録されていない/.test(r.data.message || ""), r.data.message);
  }

  section("暗証番号が無いと、正直に断る");
  {
    const r = await api("POST", "/api/auth/reset/pin", { gradePrefix: grade, nickname: nick, pin: pin });
    ok("PIN_NOT_SET で断る", r.status === 409 && r.data.code === "PIN_NOT_SET", r.data);
  }

  section("暗証番号を決める");
  {
    const r = await api("POST", "/api/auth/pin/set", { pin: pin }, token0);
    ok("暗証番号を決められた", r.status === 200, r.data);
    const m = await api("GET", "/api/auth/reset/methods?gradePrefix=" + grade + "&nickname=" + nick);
    const byId = {};
    (m.data.methods || []).forEach((x) => { byId[x.id] = x; });
    ok("方法の一覧で「使える」に変わる", byId.pin && byId.pin.available === true, byId.pin);
    ok("どれか使えると分かる", m.data.anyAvailable === true);
  }

  section("★暗証番号でパスワードを再設定する（通し）");
  let challengeId = null, resetToken = null;
  {
    const wrong = await api("POST", "/api/auth/reset/pin",
      { gradePrefix: grade, nickname: nick, pin: "0000" });
    ok("違う暗証番号は通らない", wrong.status >= 400, wrong.status);

    const r = await api("POST", "/api/auth/reset/pin", { gradePrefix: grade, nickname: nick, pin: pin });
    ok("正しい暗証番号で引き換え札が出る", r.status === 200 && !!r.data.resetToken, r.data);
    challengeId = r.data.challengeId; resetToken = r.data.resetToken;

    const shortPw = await api("POST", "/api/auth/reset/password",
      { challengeId, resetToken, newPassword: "abc" });
    ok("短いパスワードは断る", shortPw.status === 400 && shortPw.data.code === "BAD_PASSWORD", shortPw.data);

    const badTok = await api("POST", "/api/auth/reset/password",
      { challengeId, resetToken: "wrong", newPassword: pw1 });
    ok("違う札では変えられない", badTok.status === 400, badTok.data);

    const done = await api("POST", "/api/auth/reset/password", { challengeId, resetToken, newPassword: pw1 });
    ok("★パスワードを変えられた", done.status === 200 && done.data.ok, done.data);
  }

  section("変えたあとの動き");
  {
    const oldLogin = await api("POST", "/api/auth/login",
      { gradePrefix: grade, nickname: nick, password: pw0 });
    ok("古いパスワードでは入れない", oldLogin.status === 401, oldLogin.status);

    const newLogin = await api("POST", "/api/auth/login",
      { gradePrefix: grade, nickname: nick, password: pw1 });
    ok("★新しいパスワードで入れる", !!newLogin.data.token, newLogin.data);

    const me = await api("GET", "/api/auth/me", undefined, token0);
    ok("前の端末のログインは切れている", me.status === 401, me.status);

    const again = await api("POST", "/api/auth/reset/password", { challengeId, resetToken, newPassword: "Another#2026c" });
    ok("同じ札は 2 度使えない", again.status >= 400, again.data);

    /* 後始末 */
    if (newLogin.data.token) {
      await api("POST", "/api/auth/delete", { password: pw1 }, newLogin.data.token).catch(() => {});
    }
  }

  section("管理者コード方式が要らなくなっている");
  {
    const oldWay = await api("POST", "/api/auth/reset_password",
      { gradePrefix: grade, nickname: nick, resetKey: "", newPassword: pw1 });
    ok("旧方式（管理者キー）は今も鍵がかかったまま", oldWay.status === 403 || oldWay.status === 404, oldWay.status);
    console.log("     ※ 旧経路はサポート用に残してあります（画面からは使いません）。");
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) { console.log("\n  失敗:"); bad.forEach(b => console.log("   - " + b)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
