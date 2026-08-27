/* ══════════════════════════════════════════════════════════════════════
   Qredit Card の発行（本人確認つき）— サーバ側の確認

   見るところ:
     ① 本人確認は 4 つ揃って初めて通る（ID / Gmail / パスワード / 暗証番号）
     ② 1 つでも違えば通さない
     ③ 6 桁のコードは **その人の通知**に届く（履歴に残る）
     ④ 違うコードは弾く。回数を超えたら止める
     ⑤ 確認できた合図が無ければ発行しない
     ⑥ 同意していなければ発行しない
     ⑦ 発行できると、残高が付き、2 枚目は出ない
     ⑧ 他人の確認は使えない

   使い方: node vqqreditissue.cjs   （ローカルの dev-local.sh echo を起動しておく）
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
/* 本番へは向けない。この Mac か、検証用（-dev）だけ。 */
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}
const uniq = () => "vqi" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
const PIN = "8306", PW = "Passw0rd!vq";

async function makeUser() {
  const u = uniq();
  const email = u + "@gmail.com";
  const a = await call("/api/auth/register/start", { method: "POST", body: { email, gradePrefix: "H2", nickname: u, password: PW } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", {
    method: "POST",
    body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: PIN }
  });
  return { u, email, token: c.j.token };
}

(async () => {
  const me = await makeUser();
  if (!me.token) { console.error("検証アカウントを作れません"); process.exit(1); }
  const T = { token: me.token };
  const good = { userId: me.u, email: me.email, password: PW, pin: PIN, cardholderName: "H2 " + me.u };

  section("① 4 つ揃わなければ通さない");
  const wrongId = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: { ...good, userId: me.u + "x" } });
  ok("ユーザーIDが違えば通さない", wrongId.s === 401 && wrongId.j.code === "USER_ID_MISMATCH", wrongId);
  const wrongMail = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: { ...good, email: "someone.else@gmail.com" } });
  ok("メールが違えば通さない", wrongMail.s === 401 && wrongMail.j.code === "EMAIL_MISMATCH", wrongMail);
  const notGmail = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: { ...good, email: "a@example.com" } });
  ok("Gmail でなければ断る", notGmail.s === 400 && notGmail.j.code === "EMAIL_NOT_GMAIL", notGmail);
  const wrongPw = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: { ...good, password: PW + "!" } });
  ok("パスワードが違えば通さない", wrongPw.s === 401 && wrongPw.j.code === "PASSWORD_MISMATCH", wrongPw);
  const wrongPin = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: { ...good, pin: "1111" } });
  ok("暗証番号が違えば通さない", wrongPin.s === 401 || wrongPin.s === 429, wrongPin);
  const noAuth = await call("/api/qredit-card/verify/start", { method: "POST", body: good });
  ok("ログインしていなければ通さない", noAuth.s === 401, noAuth);

  section("② 揃えば、通知へ 6 桁が届く");
  const start = await call("/api/qredit-card/verify/start", { method: "POST", ...T, body: good });
  ok("受付ができる", start.s === 200 && !!start.j.challengeId, start.j.code || start.s);
  ok("期限が返る", Number(start.j.expiresAt || 0) > Date.now(), start.j.expiresAt);
  ok("メールは伏せて返る", /\*/.test(String(start.j.maskedEmail || "")), start.j.maskedEmail);
  const code = String(start.j.devCode || "");
  ok("ローカル検証ではコードが返る（本番では返らない）", /^\d{6}$/.test(code), code ? "6桁" : "なし");

  const notif = await call("/api/user/notifications?limit=10", T);
  const list = notif.j.items || notif.j.notifications || [];
  const hit = list.find((n) => String(n.type || "").indexOf("qredit_card_verify") >= 0);
  ok("通知に届いている（履歴に残る）", !!hit, { status: notif.s, n: list.length });
  if (hit) {
    ok("通知の本文にコードが入っている", String(hit.body || "").indexOf(code) >= 0);
    ok("通知の見出しが分かる", /確認コード/.test(String(hit.title || "")), hit.title);
  }

  section("③ コードの確かめ方");
  const badCode = await call("/api/qredit-card/verify/confirm", { method: "POST", ...T, body: { challengeId: start.j.challengeId, code: "000000" === code ? "111111" : "000000" } });
  ok("違うコードは弾く", badCode.s === 401 && badCode.j.code === "CODE_MISMATCH", badCode);
  ok("あと何回かを返す", Number(badCode.j.remaining) >= 0, badCode.j.remaining);
  const noSuch = await call("/api/qredit-card/verify/confirm", { method: "POST", ...T, body: { challengeId: "qcv:none", code } });
  ok("知らない受付は弾く", noSuch.s === 404, noSuch);

  const conf = await call("/api/qredit-card/verify/confirm", { method: "POST", ...T, body: { challengeId: start.j.challengeId, code } });
  ok("正しいコードで通る", conf.s === 200 && !!conf.j.verifySession, conf);

  section("④ 発行");
  const noSess = await call("/api/qredit-card/issue", { method: "POST", ...T, body: { agreeTerms: true, selectedDesign: "aurora" } });
  ok("確認できた合図が無ければ発行しない", noSess.s === 401 && noSess.j.code === "VERIFY_REQUIRED", noSess);
  const noAgree = await call("/api/qredit-card/issue", { method: "POST", ...T, body: { verifySession: conf.j.verifySession, agreeTerms: false } });
  ok("同意していなければ発行しない", noAgree.s === 400 && noAgree.j.code === "AGREEMENT_REQUIRED", noAgree);

  const issue = await call("/api/qredit-card/issue", {
    method: "POST", ...T,
    body: { verifySession: conf.j.verifySession, agreeTerms: true, cardholderName: good.cardholderName, selectedDesign: "aurora" }
  });
  ok("発行できる", issue.s === 200 && issue.j.ok === true, issue.j.code || issue.s);
  const card = (issue.j.qreditCard || {}).card || (issue.j.qreditCard || {});
  ok("カード番号が付く", !!(card.cardId || card.card_id), card);
  ok("有効期限が付く", Number(card.expiresAt || 0) > Date.now(), card.expiresAt);
  ok("初期残高が入る", Number((issue.j.qredit || {}).balance || 0) > 0, (issue.j.qredit || {}).balance);

  const again = await call("/api/qredit-card/issue", {
    method: "POST", ...T, body: { verifySession: conf.j.verifySession, agreeTerms: true }
  });
  ok("同じ確認は 2 度使えない", again.s === 409 || again.j.code === "QREDIT_CARD_ALREADY_ISSUED", again);

  section("⑤ 他人の確認は使えない");
  const other = await makeUser();
  const cross = await call("/api/qredit-card/issue", {
    method: "POST", token: other.token, body: { verifySession: conf.j.verifySession, agreeTerms: true }
  });
  ok("他人の合図では発行しない", cross.s === 401 && cross.j.code === "VERIFY_REQUIRED", cross);
  const crossConfirm = await call("/api/qredit-card/verify/confirm", {
    method: "POST", token: other.token, body: { challengeId: start.j.challengeId, code }
  });
  ok("他人の受付は確かめられない", crossConfirm.s === 404, crossConfirm);

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
