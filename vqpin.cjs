/* ══════════════════════════════════════════════════════════════════════════
   vqpin.cjs — 暗証番号（PIN）と、既存ユーザーの引き上げ（メール＋同意）

   ここはサーバだけを相手にする（ブラウザは使わない）。
   見るところ:
     ① 既存ユーザーは「暗証番号・メール・同意」の 3 つが未了だと分かる
     ② 暗証番号を決める前は、まだ中へ入れる（決めさせるため）
     ③ 決めたら、**次のログインからは確かめるまで中へ入れない**
     ④ 弱い番号（1111 / 1234 / 1212）は断る／4 桁・6 桁だけ通す
     ⑤ 間違えると止まる（5 回で 5 分）
     ⑥ メールは Gmail だけ・確認コードで本人確認・同意で仕上げ
     ⑦ 新規登録は「確認コード → 暗証番号 → 同意」で、暗証番号なしでは作れない
     ⑧ 暗証番号は変えられる（いまの番号が要る）
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
/* ローカルの D1 を直に書き換える下ごしらえは、配信先へ向けたときは使えない。 */
const IS_LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function call(path, { method = "GET", token = "", body = null } = {}) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, j: j || {} };
}
const uniq = () => "vqpin" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);

/* 新しい人を 1 人作る（確認コードは echo モードで返ってくる） */
async function makeUser(pin) {
  const u = uniq();
  const a = await call("/api/auth/register/start", {
    method: "POST",
    body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" }
  });
  if (!a.j.challengeId) return { err: "start", a };
  const b = await call("/api/auth/register/verify", {
    method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode }
  });
  if (!b.j.registrationSession) return { err: "verify", b };
  const c = await call("/api/auth/register/consent", {
    method: "POST",
    body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin }
  });
  return { u, session: b.j.registrationSession, consent: c };
}
const login = (u, password = "Passw0rd!vq") =>
  call("/api/auth/login", { method: "POST", body: { gradePrefix: "H2", nickname: u, password } });

(async () => {
  console.log("\n### 新規登録：暗証番号なしでは作れない");
  {
    const u = uniq();
    const a = await call("/api/auth/register/start", {
      method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" }
    });
    const b = await call("/api/auth/register/verify", {
      method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode }
    });
    const noPin = await call("/api/auth/register/consent", {
      method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true }
    });
    ok("暗証番号を出さないと登録できない", noPin.status === 400 && noPin.j.code === "PIN_REQUIRED",
      noPin.status + " " + noPin.j.code);
    const weak = await call("/api/auth/register/consent", {
      method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1234" }
    });
    ok("続き番号は断る", weak.status === 400 && weak.j.code === "WEAK_PIN", weak.status + " " + weak.j.code);
    const bad = await call("/api/auth/register/consent", {
      method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "12345" }
    });
    ok("5 桁は断る（4 桁か 6 桁だけ）", bad.status === 400 && bad.j.code === "PIN_REQUIRED", bad.status + " " + bad.j.code);
    const good = await call("/api/auth/register/consent", {
      method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" }
    });
    ok("ちゃんとした暗証番号なら作れる", good.status === 200 && !!good.j.token, good.status + " " + (good.j.code || ""));
    if (good.j.token) {
      const me = await call("/api/auth/me", { token: good.j.token });
      ok("作った直後はそのまま入れる（決めた本人の端末）", me.status === 200 && me.j.pinVerified === true,
        me.status + " " + JSON.stringify(me.j.account || {}));
      ok("新規登録の人は 3 つとも済んでいる",
        me.j.account && !me.j.account.needsPin && !me.j.account.needsEmail && !me.j.account.needsConsent,
        JSON.stringify(me.j.account || {}));
    }
  }

  console.log("\n### つくった人で、次のログインから確かめが要る");
  const made = await makeUser("8306");
  ok("下ごしらえのアカウントができた", !!made.consent && made.consent.status === 200, JSON.stringify(made.err || ""));
  const nick = made.u;
  {
    const li = await login(nick);
    ok("ログインできる", li.status === 200 && !!li.j.token, li.status + " " + (li.j.code || ""));
    ok("ログインの答えに「暗証番号が要る」と入る", li.j.pinRequired === true, JSON.stringify(li.j.account || {}));
    const tk = li.j.token;
    const before = await call("/api/settings", { token: tk });
    ok("確かめる前は、ほかの API が通らない（401）", before.status === 401, String(before.status));
    const st = await call("/api/auth/pin/status", { token: tk });
    ok("暗証番号の様子だけは見られる", st.status === 200 && st.j.hasPin === true && st.j.pinVerified === false,
      st.status + " " + JSON.stringify(st.j));

    const wrong = await call("/api/auth/pin/verify", { method: "POST", token: tk, body: { pin: "9999" } });
    ok("違う番号ははじく", wrong.status === 401 && wrong.j.code === "PIN_MISMATCH", wrong.status + " " + wrong.j.code);
    const right = await call("/api/auth/pin/verify", { method: "POST", token: tk, body: { pin: "8306" } });
    ok("合っていれば通る", right.status === 200 && right.j.pinVerified === true, right.status + " " + (right.j.code || ""));
    const after = await call("/api/settings", { token: tk });
    ok("確かめたあとは、ほかの API も通る", after.status === 200, String(after.status));

    /* 別の端末（別のログイン）では、また確かめが要る */
    const li2 = await login(nick);
    const other = await call("/api/settings", { token: li2.j.token });
    ok("別の端末では、また確かめが要る", other.status === 401, String(other.status));
  }

  console.log("\n### 間違えると止まる");
  {
    const made2 = await makeUser("470913");
    const li = await login(made2.u);
    const tk = li.j.token;
    let last = null;
    for (let i = 0; i < 5; i++) {
      last = await call("/api/auth/pin/verify", { method: "POST", token: tk, body: { pin: "111112" } });
    }
    ok("5 回間違えると止まる", last.status === 429 && last.j.code === "PIN_LOCKED",
      last.status + " " + last.j.code);
    ok("止まっている間は正しい番号でも通さない",
      (await call("/api/auth/pin/verify", { method: "POST", token: tk, body: { pin: "470913" } })).status === 429);
    ok("いつまで止まるかを伝える", Number(last.j.retryAtMs || 0) > Date.now(), String(last.j.retryAtMs));
  }

  console.log("\n### 6 桁も使える／変えられる");
  {
    const made3 = await makeUser("470913");
    const li = await login(made3.u);
    const tk = li.j.token;
    ok("6 桁で確かめられる",
      (await call("/api/auth/pin/verify", { method: "POST", token: tk, body: { pin: "470913" } })).status === 200);
    const noCur = await call("/api/auth/pin/set", { method: "POST", token: tk, body: { pin: "8306" } });
    ok("変えるにはいまの番号が要る", noCur.status === 400 && noCur.j.code === "CURRENT_PIN_REQUIRED",
      noCur.status + " " + noCur.j.code);
    const badCur = await call("/api/auth/pin/set", { method: "POST", token: tk, body: { pin: "8306", currentPin: "111112" } });
    ok("いまの番号が違うと変えられない", badCur.status === 401, String(badCur.status));
    const okSet = await call("/api/auth/pin/set", { method: "POST", token: tk, body: { pin: "8306", currentPin: "470913" } });
    ok("いまの番号が合っていれば変えられる", okSet.status === 200 && okSet.j.pinLen === 4,
      okSet.status + " " + JSON.stringify(okSet.j.pinLen));
    const li2 = await login(made3.u);
    ok("新しい番号で入れる",
      (await call("/api/auth/pin/verify", { method: "POST", token: li2.j.token, body: { pin: "8306" } })).status === 200);
    ok("古い番号では入れない",
      (await call("/api/auth/pin/verify", { method: "POST", token: li2.j.token, body: { pin: "470913" } })).status === 401);
  }

  console.log("\n### 既存ユーザーの引き上げ（暗証番号なしの人）");
  {
    /* 「更新前からいる人」を、その場でこしらえる。
       いちど作ってから、暗証番号・メール・同意の列を空へ戻す（＝更新前の姿）。
       毎回この形から始めるので、何度流しても同じ結果になる。 */
    let tk = "";
    if (!IS_LOCAL) {
      console.log("  --   配信先では「更新前の人」を作れないので飛ばす（ローカルで確かめる）");
    } else {
      const made = await makeUser("8306");
      try {
        require("node:child_process").execSync(
          `/Users/user/.npm-global/bin/wrangler d1 execute vocabuquiz_auth --local ` +
          `--config server/.local-run/echo/wrangler.toml --command ` +
          `"UPDATE users SET pin_hash='',pin_salt='',pin_len=0,pin_set_at=0,email='',email_canonical='',` +
          `email_verified_at=0,consented_at=0,tos_version='1',privacy_version='' WHERE nickname='${made.u}'"`,
          { stdio: "ignore" });
        const li = await login(made.u);
        tk = li.j.token || "";
      } catch (e) { tk = ""; }
    }
    if (!tk) {
      console.log("  --   更新前の人をこしらえられなかったので飛ばす");
    } else {
      const st = await call("/api/auth/pin/status", { token: tk });
      ok("まだ何も済んでいないと分かる",
        st.status === 200 && st.j.needsPin === true, st.status + " " + JSON.stringify(st.j));
      const before = await call("/api/settings", { token: tk });
      ok("暗証番号を決める前は、まだ中へ入れる（決めさせるため）", before.status === 200, String(before.status));

      const weak = await call("/api/auth/pin/set", { method: "POST", token: tk, body: { pin: "1111" } });
      ok("弱い番号は断る", weak.status === 400 && weak.j.code === "WEAK_PIN", weak.status + " " + weak.j.code);
      const set = await call("/api/auth/pin/set", { method: "POST", token: tk, body: { pin: "620487" } });
      ok("暗証番号を決められる", set.status === 200 && set.j.hasPin === true, set.status + " " + (set.j.code || ""));
      ok("決めた端末はそのまま使える", (await call("/api/settings", { token: tk })).status === 200);
      ok("つぎはメールと同意が残っていると分かる",
        set.j.needsEmail === true && set.j.needsConsent === true, JSON.stringify(set.j));

      const notGmail = await call("/api/auth/upgrade/email/start", { method: "POST", token: tk, body: { email: "a@example.com" } });
      ok("Gmail 以外は断る", notGmail.status === 400 && notGmail.j.code === "EMAIL_NOT_GMAIL",
        notGmail.status + " " + notGmail.j.code);
      const addr = "vqup" + String(Date.now()).slice(-8) + "@gmail.com";
      const start = await call("/api/auth/upgrade/email/start", { method: "POST", token: tk, body: { email: addr } });
      ok("確認コードを送れる", start.status === 200 && !!start.j.challengeId, start.status + " " + (start.j.code || ""));
      const badCode = await call("/api/auth/upgrade/email/verify", {
        method: "POST", token: tk, body: { challengeId: start.j.challengeId, code: "000000" }
      });
      ok("違うコードははじく", badCode.status === 401 && badCode.j.code === "CODE_MISMATCH",
        badCode.status + " " + badCode.j.code);
      const okCode = await call("/api/auth/upgrade/email/verify", {
        method: "POST", token: tk, body: { challengeId: start.j.challengeId, code: start.j.devCode }
      });
      ok("正しいコードでメールが付く", okCode.status === 200 && okCode.j.needsEmail === false,
        okCode.status + " " + JSON.stringify(okCode.j));
      const halfConsent = await call("/api/auth/upgrade/consent", {
        method: "POST", token: tk, body: { agreeTerms: true, agreePrivacy: false, agreeAge: true }
      });
      ok("3 つそろわないと同意にならない", halfConsent.status === 400, String(halfConsent.status));
      const consent = await call("/api/auth/upgrade/consent", {
        method: "POST", token: tk, body: { agreeTerms: true, agreePrivacy: true, agreeAge: true }
      });
      ok("同意でぜんぶ済む",
        consent.status === 200 && !consent.j.needsPin && !consent.j.needsEmail && !consent.j.needsConsent,
        consent.status + " " + JSON.stringify(consent.j));
    }
  }

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
