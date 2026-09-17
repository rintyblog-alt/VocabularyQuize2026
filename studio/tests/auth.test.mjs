/* ══════════════════════════════════════════════════════════════════════
   tests/auth.test.mjs — core/auth.js の試験（node --test で回る）

   ★ 何を守る試験か
     1. 純関数（passwordStrength の単調性と境界 / validate 系 / 学年接頭）
     2. AuthError の分類（偽の fetch で NETWORK / TIMEOUT / HTTP_401 / 429 を作る）
     3. トークンの保管（**本体アプリと同じキー**）と remember の切り替え
     4. boot() のオフライン挙動（落とさない・stale を立てる・編集を止めない）
     5. 契約書 §10.1 の口へ送る本文の形（特に change-password の snake_case）

   ★ なぜこの形か
     ・auth.js は DOM を触らないので、storage と fetch を差し替えれば Node で
       全部確かめられる。だから createAuth は storage / sessionStorage /
       fetchImpl / timeout を受ける（実装側の CONTRACT-NOTE 参照）。
     ・「ネット不通」と「サーバの拒否」を混ぜた瞬間に、利用者へ出す文言が
       逆になる。ここが崩れていないことを **毎回**確かめる。
     ・強度は数字そのものより **単調（強くしたら下がらない）**が大事。
       梯子を 1 段ずつ登って下がらないことを見る。
   ══════════════════════════════════════════════════════════════════════ */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createAuth, AuthError, AUTH_KEYS, DEFAULT_API_BASE, GRADE_PREFIX_RE,
  MIN_PASSWORD_LENGTH, CODE_LENGTH, NICKNAME_STRICT_RE,
  passwordStrength, validateNickname, validateEmail, normalizeGradePrefix,
  normalizeExpiresAt, isTokenExpired, maskEmail, resolveApiBase,
} from "../src/core/auth.js";

/* ── 道具 ──────────────────────────────────────────────────────── */

/** localStorage / sessionStorage の代わり（注入して中身を覗く） */
class MemStore {
  constructor(init = {}) {
    this.map = new Map(Object.entries(init).map(([k, v]) => [k, String(v)]));
  }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  has(k) { return this.map.has(k); }
  get(k) { return this.map.get(k); }
}

/** Response の代わり */
function res(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const low = {};
  for (const [k, v] of Object.entries(headers)) low[k.toLowerCase()] = String(v);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (low[String(k).toLowerCase()] ?? null) },
    text: async () => text,
  };
}

/**
 * 記録付きの偽 fetch。routes は path → ({ body, init }) => Response（throw も可）。
 * 未登録の path を叩いたら試験を落とす（口の名前の書き間違いを見つけるため）。
 */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), path, method: init.method || "GET", headers: init.headers || {}, body });
    const handler = routes[path];
    assert.ok(handler, `未登録の path を叩いた: ${path}`);
    return handler({ path, init, body });
  };
  fn.calls = calls;
  fn.last = () => calls[calls.length - 1];
  return fn;
}

function makeAuth(routes, opts = {}) {
  const store = opts.store || new MemStore();
  const session = opts.session || new MemStore();
  const fetchImpl = typeof routes === "function" ? routes : fakeFetch(routes || {});
  const auth = createAuth({
    apiBase: "https://api.test", storage: store, sessionStorage: session,
    fetchImpl, timeout: opts.timeout,
  });
  return { auth, fetchImpl, store, session };
}

const HOUR = 3600 * 1000;
const USER = { id: 10, gradePrefix: "H1", nickname: "minato" };
/** ログイン済みの端末（本体アプリが書いた状態）を真似た保管 */
function loggedInStore(extra = {}) {
  return new MemStore({
    [AUTH_KEYS.token]: "tk_main_app",
    [AUTH_KEYS.expiresAt]: String(Date.now() + 24 * HOUR),
    [AUTH_KEYS.profile]: JSON.stringify(USER),
    [AUTH_KEYS.mode]: "user",
    ...extra,
  });
}

/* ── 1. passwordStrength（純関数・単調性・境界） ───────────────── */

test("passwordStrength: 強くしていくと score は下がらない（単調）", () => {
  const ladder = ["", "q", "qw3z", "qw3zp1x2", "Qw3zP1x2", "Qw3zP1x2!", "Qw3zP1x2!m9Kd", "Qw3zP1x2!m9Kd#7Vb"];
  let prev = -1;
  for (const pw of ladder) {
    const r = passwordStrength(pw);
    assert.ok(r.score >= prev, `${JSON.stringify(pw)} で下がった: ${prev} → ${r.score}`);
    assert.ok(r.score >= 0 && r.score <= 4, "score は 0..4");
    prev = r.score;
  }
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("Qw3zP1x2!m9Kd#7Vb").score, 4);
});

test("passwordStrength: 長さの境界（8 / 12）で上がる", () => {
  assert.ok(passwordStrength("Qw3zP1x").score < passwordStrength("Qw3zP1x2").score, "7 文字 < 8 文字");
  assert.ok(passwordStrength("Qw3zP1x2!m9").score < passwordStrength("Qw3zP1x2!m9K").score, "11 文字 < 12 文字");
  // 8 文字未満は どんなに種類が多くても 1 まで
  assert.ok(passwordStrength("Qw3!z").score <= 1);
  assert.equal(passwordStrength("Qw3zP1x").hints.some((h) => h.includes("8 文字以上")), true);
});

test("passwordStrength: 種類が増えると上がる（同じ長さで比べる）", () => {
  const a = passwordStrength("qwrtzpxm");        // 小文字だけ
  const b = passwordStrength("qw3zp1x2");        // 小文字 + 数字
  const c = passwordStrength("Qw3zP1x2");        // + 大文字
  const d = passwordStrength("Qw3z!1x2");        // + 記号
  assert.ok(a.score <= b.score && b.score <= c.score, "種類が増えたら下がらない");
  assert.ok(d.score >= b.score);
  assert.equal(a.classes, 1);
  assert.equal(c.classes, 3);
  assert.equal(d.classes, 4);
});

test("passwordStrength: よくある語・連続・繰り返しは 0 に落ちる", () => {
  for (const pw of ["password", "Password123", "12345678", "abcdefgh", "aaaaaaaaaaaa", "abcabcabcabc", "sakura1234"]) {
    const r = passwordStrength(pw);
    assert.equal(r.score, 0, `${pw} は 0 のはず（実際 ${r.score}）`);
    assert.ok(r.hints.length > 0, "理由（助言）を返す");
  }
  // 途中に連続が混じる程度なら 0 にはしない（過剰に叱らない）
  assert.ok(passwordStrength("Qw3z1234P!mv").score >= 2);
});

test("passwordStrength: 形（label / hints）と壊れた入力", () => {
  const labels = new Set(["とても弱い", "弱い", "ふつう", "強い", "とても強い"]);
  for (const pw of ["", "a", "Qw3zP1x2", "Qw3zP1x2!m9Kd", null, undefined, 12345678, {}]) {
    const r = passwordStrength(pw);
    assert.ok(labels.has(r.label), `label が変: ${r.label}`);
    assert.ok(Array.isArray(r.hints) && r.hints.length <= 4, "hints は 4 つまで");
    for (const h of r.hints) assert.equal(typeof h, "string");
    assert.equal(typeof r.length, "number");
  }
  assert.equal(passwordStrength(null).score, 0);
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test("passwordStrength: 純関数（同じ入力なら何度でも同じ）", () => {
  const pw = "Qw3zP1x2!m9Kd";
  const a = passwordStrength(pw);
  passwordStrength("password");           // 間に別の呼びを挟む
  passwordStrength("");
  const b = passwordStrength(pw);
  assert.deepEqual(a, b);
});

/* ── 2. validate 系 / 学年接頭（純関数） ──────────────────────── */

test("validateNickname: 長さと空白と文字種", () => {
  assert.equal(validateNickname("").ok, false);
  assert.equal(validateNickname("a").ok, false);
  assert.equal(validateNickname("ab").ok, true);
  assert.equal(validateNickname("ab").strict, true);
  assert.equal(validateNickname(" min ato ").value, "minato", "空白は落とす");
  assert.equal(validateNickname("a".repeat(24)).ok, true);
  assert.equal(validateNickname("a".repeat(25)).ok, false);
  // 既存の会員に日本語の名前が居るので **通す**（strict だけ false）
  const jp = validateNickname("みなと");
  assert.equal(jp.ok, true);
  assert.equal(jp.strict, false);
  assert.equal(validateNickname(null).ok, false);
  assert.equal(NICKNAME_STRICT_RE.test("min_ato.1-x"), true);
  for (const r of [validateNickname(""), validateNickname("a".repeat(30))]) {
    assert.ok(r.message.length > 0, "落とすときは理由を返す");
  }
});

test("validateEmail: 形と、小文字化しないこと", () => {
  assert.equal(validateEmail("minato@example.com").ok, true);
  assert.equal(validateEmail("A@B.co").value, "A@B.co", "大小を変えない");
  assert.equal(validateEmail("a b@c.jp").value, "ab@c.jp", "空白は落とす");
  for (const bad of ["", "a@b", "a@@b.jp", "a b", "@example.com", "a@.com", null]) {
    assert.equal(validateEmail(bad).ok, false, `${bad} は弾く`);
  }
  assert.equal(validateEmail(`${"a".repeat(250)}@b.jp`).ok, false, "長すぎるものは弾く");
  assert.equal(maskEmail("minato@example.com"), "m*****@example.com");
  assert.equal(maskEmail("こわれた"), "***");
});

test("normalizeGradePrefix: h1 → H1、全角も、知らない形は通す", () => {
  assert.equal(normalizeGradePrefix("h1"), "H1");
  assert.equal(normalizeGradePrefix(" h1 "), "H1");
  assert.equal(normalizeGradePrefix("Ｈ１"), "H1", "iOS の全角");
  assert.equal(normalizeGradePrefix("H1"), "H1");
  assert.equal(normalizeGradePrefix("ot"), "OT", "本体の その他 は OT");
  assert.equal(normalizeGradePrefix("other"), "OTHER");
  assert.equal(normalizeGradePrefix("その他"), "OTHER");
  assert.equal(normalizeGradePrefix(""), "");
  assert.equal(normalizeGradePrefix(null), "");
  assert.equal(normalizeGradePrefix("zz9"), "ZZ9", "知らない形でも通す（サーバが正）");
  assert.equal(GRADE_PREFIX_RE.test(normalizeGradePrefix("h1")), true);
});

test("expiresAt: 秒とミリ秒が混ざっても比べられる", () => {
  assert.equal(normalizeExpiresAt(1750000000), 1750000000000, "秒は ms へ");
  assert.equal(normalizeExpiresAt(1750000000000), 1750000000000, "ms はそのまま");
  assert.equal(normalizeExpiresAt(0), 0);
  assert.equal(normalizeExpiresAt("こわれた"), 0);
  const now = 1750000000000;
  assert.equal(isTokenExpired(0, now), false, "分からないときは /me に確かめさせる");
  assert.equal(isTokenExpired(now - 1, now), true);
  assert.equal(isTokenExpired(now + 1000, now), false);
  assert.equal(isTokenExpired(now + 1000, now, 5000), true, "手前で切れた扱いにもできる");
});

test("resolveApiBase: 明示が最優先・既定は契約書の値", () => {
  assert.equal(resolveApiBase("https://x.test/"), "https://x.test", "末尾の / は落とす");
  assert.equal(resolveApiBase(), DEFAULT_API_BASE);
  assert.equal(DEFAULT_API_BASE, "https://vocabuquiz-api.rintyblog.workers.dev");
});

/* ── 3. AuthError の分類 ───────────────────────────────────────── */

test("AuthError: ネット不通は NETWORK（サーバの拒否と混ぜない）", async () => {
  const { auth } = makeAuth(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(
    () => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.code, "NETWORK");
      assert.equal(err.status, 0);
      assert.equal(err.isOffline, true);
      assert.match(err.message, /つながりません/);
      return true;
    },
  );
});

test("AuthError: 応答が来ないと TIMEOUT（AbortController が効く）", async () => {
  const hang = (url, init) => new Promise((_resolve, reject) => {
    const s = init.signal;
    assert.ok(s, "signal を渡していない（timeout が効かない）");
    s.addEventListener("abort", () => reject(new Error("aborted")));
  });
  const { auth } = makeAuth(hang, { timeout: 20 });
  await assert.rejects(
    () => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }),
    (err) => {
      assert.equal(err.code, "TIMEOUT");
      assert.equal(err.isOffline, true);
      return true;
    },
  );
});

test("AuthError: 401 は HTTP_401 で、onUnauthorized に伝わる", async () => {
  const { auth } = makeAuth({
    "/api/auth/login": () => res(401, { message: "ログイン情報が正しくありません" }),
  });
  const seen = [];
  const off = auth.onUnauthorized((e) => seen.push(e));
  await assert.rejects(
    () => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }),
    (err) => {
      assert.equal(err.code, "HTTP_401");
      assert.equal(err.status, 401);
      assert.equal(err.isOffline, false, "401 は「もう一度」ではない");
      assert.match(err.message, /ログイン情報/);
      return true;
    },
  );
  assert.equal(seen.length, 1, "401 を 1 度だけ知らせる");
  off();
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }));
  assert.equal(seen.length, 1, "外したら もう来ない");
});

test("AuthError: 429 は retryAfter を拾う（ヘッダ・本文の両方）", async () => {
  const { auth } = makeAuth({
    "/api/auth/register/resend": () => res(429, { message: "送りすぎです" }, { "Retry-After": "30" }),
    "/api/auth/reset/start": () => res(429, { message: "待ってください", retryAfter: 45 }),
  });
  await assert.rejects(() => auth.register.resend({ challengeId: "ch_1" }), (err) => {
    assert.equal(err.code, "HTTP_429");
    assert.equal(err.status, 429);
    assert.equal(err.retryAfter, 30);
    return true;
  });
  await assert.rejects(() => auth.reset.start({ gradePrefix: "H1", nickname: "minato" }), (err) => {
    assert.equal(err.retryAfter, 45, "本文の retryAfter も見る");
    return true;
  });
});

test("AuthError: サーバの status 文字列がそのまま code になる", async () => {
  const { auth } = makeAuth({
    "/api/auth/register/verify": ({ body }) => (body.code === "111111"
      ? res(200, { ok: false, status: "RESTART_REQUIRED", message: "最初からやり直してください" })
      : res(200, { ok: false, message: "コードが違います", attemptsRemaining: 2 })),
    "/api/auth/login": () => res(503, { message: "点検中です" }),
  });
  await assert.rejects(() => auth.register.verify({ challengeId: "ch_1", code: "111111" }), (err) => {
    assert.equal(err.code, "RESTART_REQUIRED");
    assert.equal(err.serverStatus, "RESTART_REQUIRED");
    return true;
  });
  await assert.rejects(() => auth.register.verify({ challengeId: "ch_1", code: "222222" }), (err) => {
    assert.equal(err.code, "REJECTED", "status が無い ok:false は REJECTED");
    assert.equal(err.attemptsRemaining, 2, "残り回数を画面へ渡せる");
    return true;
  });
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }), (err) => {
    assert.equal(err.code, "HTTP_503");
    assert.match(err.message, /点検中/);
    return true;
  });
});

test("AuthError: JSON でない応答でも落ちない", async () => {
  const { auth } = makeAuth({
    "/api/auth/login": () => res(502, "<html>Bad Gateway</html>"),
  });
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }), (err) => {
    assert.equal(err.code, "HTTP_502");
    assert.match(err.message, /Bad Gateway/);
    return true;
  });
});

test("AuthError: 送る前の検め（VALIDATION）は通信しない", async () => {
  const { auth, fetchImpl } = makeAuth({});
  await assert.rejects(() => auth.login({ gradePrefix: "", nickname: "minato", password: "x" }), (e) => e.code === "VALIDATION");
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "a", password: "x" }), (e) => e.code === "VALIDATION");
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "minato", password: "" }), (e) => e.code === "VALIDATION");
  await assert.rejects(
    () => auth.register.start({ email: "a@b.jp", gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!", password2: "chigau!!" }),
    (e) => e.code === "VALIDATION" && /2 つのパスワード/.test(e.message),
  );
  await assert.rejects(() => auth.register.verify({ challengeId: "ch_1", code: "12345" }), (e) => e.code === "VALIDATION");
  await assert.rejects(() => auth.reset.pin({ gradePrefix: "H1", nickname: "minato", pin: "123" }), (e) => e.code === "VALIDATION");
  assert.equal(fetchImpl.calls.length, 0, "一度も通信していない");
  assert.equal(CODE_LENGTH, 6);
});

/* ── 4. ログイン・保管・remember ───────────────────────────────── */

test("login: 本体と同じキーに保管し、送る本文は §10.1 の形", async () => {
  const { auth, fetchImpl, store } = makeAuth({
    "/api/auth/login": () => res(200, { token: "tk_1", expiresAt: Date.now() + 24 * HOUR, user: USER }),
  });
  const st = await auth.login({ gradePrefix: "h1", nickname: " minato ", password: "Qw3zP1x2!" });
  assert.equal(st.status, "user");
  assert.equal(st.user.nickname, "minato");
  assert.equal(st.stale, false);

  const call = fetchImpl.last();
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://api.test/api/auth/login");
  assert.deepEqual(Object.keys(call.body).sort(), ["gradePrefix", "nickname", "password"]);
  assert.equal(call.body.gradePrefix, "H1", "学年は大文字へ揃える");
  assert.equal(call.body.nickname, "minato");

  assert.equal(store.get(AUTH_KEYS.token), "tk_1");
  assert.equal(store.get(AUTH_KEYS.mode), "user");
  assert.equal(JSON.parse(store.get(AUTH_KEYS.profile)).nickname, "minato");
  assert.ok(Number(store.get(AUTH_KEYS.expiresAt)) > Date.now());
  // 本体アプリが読むキーそのものであること（ここを変えると共有が切れる）
  assert.equal(AUTH_KEYS.token, "app.auth.token.v1");
  assert.equal(AUTH_KEYS.expiresAt, "app.auth.expiresAt.v1");
  assert.equal(AUTH_KEYS.profile, "app.auth.profile.v1");
  assert.equal(AUTH_KEYS.mode, "app.auth.mode.v1");
});

test("login: 応答に token / user が無ければ BAD_RESPONSE（黙って入らない）", async () => {
  const { auth, store } = makeAuth({
    "/api/auth/login": () => res(200, { token: "", user: null }),
  });
  await assert.rejects(() => auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }), (e) => e.code === "BAD_RESPONSE");
  assert.equal(store.has(AUTH_KEYS.token), false);
});

test("remember: 切ると ブラウザセッションの終わりで捨てる", async () => {
  const routes = {
    "/api/auth/login": () => res(200, { token: "tk_2", expiresAt: Date.now() + 24 * HOUR, user: USER }),
    "/api/auth/me": () => res(200, { user: USER }),
  };
  const store = new MemStore();
  const session = new MemStore();
  const first = makeAuth(routes, { store, session });
  await first.auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!", remember: false });
  assert.equal(store.get(AUTH_KEYS.sessionOnly), "1", "本体と同じ印を立てる");
  assert.equal(session.get(AUTH_KEYS.sessionAlive), "1");

  // 同じセッションで開き直した（sessionStorage が生きている）＝ 残る
  const same = makeAuth(routes, { store, session });
  assert.equal((await same.auth.boot()).status, "user");

  // ブラウザを閉じた（sessionStorage が空）＝ 捨てる
  const reopened = makeAuth(routes, { store, session: new MemStore() });
  const st = await reopened.auth.boot();
  assert.equal(st.status, "anon", "remember していないので入り直させる");
  assert.equal(store.has(AUTH_KEYS.token), false, "トークンも消す");
});

test("remember: 入れたままなら ブラウザを閉じても残る", async () => {
  const routes = {
    "/api/auth/login": () => res(200, { token: "tk_3", expiresAt: Date.now() + 24 * HOUR, user: USER }),
    "/api/auth/me": () => res(200, { user: USER }),
  };
  const store = new MemStore();
  const first = makeAuth(routes, { store, session: new MemStore() });
  await first.auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!", remember: true });
  assert.equal(store.has(AUTH_KEYS.sessionOnly), false);

  const reopened = makeAuth(routes, { store, session: new MemStore() });
  const st = await reopened.auth.boot();
  assert.equal(st.status, "user");
  assert.equal(st.user.nickname, "minato");
  assert.equal(store.get(AUTH_KEYS.token), "tk_3");
});

test("authHeader / request: Bearer を付けるのは auth のときだけ", async () => {
  const { auth, fetchImpl, store } = makeAuth({
    "/api/auth/login": () => res(200, { token: "tk_4", expiresAt: Date.now() + HOUR, user: USER }),
    "/api/profile/me": () => res(200, { profile: { nickname: "minato" } }),
  });
  assert.deepEqual(auth.authHeader(), {}, "入っていなければ付けない");
  await auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" });
  assert.deepEqual(auth.authHeader(), { Authorization: "Bearer tk_4" });
  assert.equal(fetchImpl.calls[0].headers.Authorization, undefined, "login には付けない");

  await auth.profile();
  const call = fetchImpl.last();
  assert.equal(call.path, "/api/profile/me");
  assert.equal(call.method, "GET");
  assert.equal(call.headers.Authorization, "Bearer tk_4");
  assert.equal(store.get(AUTH_KEYS.token), "tk_4");
});

/* ── 5. boot（本体との相乗り・オフライン・期限切れ） ───────────── */

test("boot: 本体でログイン済みなら Studio も入っている", async () => {
  const store = loggedInStore();
  const { auth, fetchImpl } = makeAuth({ "/api/auth/me": () => res(200, { user: USER }) }, { store });
  assert.equal(auth.state.status, "booting", "boot を待つ間は booting");
  const st = await auth.boot();
  assert.equal(st.status, "user");
  assert.equal(st.user.nickname, "minato");
  assert.equal(st.stale, false);
  assert.equal(fetchImpl.last().path, "/api/auth/me");
  assert.equal(fetchImpl.last().headers.Authorization, "Bearer tk_main_app");
});

test("boot: オフラインなら保存済みの user で暫定的に入れて stale を立てる", async () => {
  const store = loggedInStore();
  const { auth } = makeAuth(async () => { throw new TypeError("fetch failed"); }, { store });
  const st = await auth.boot();               // **例外を投げないこと**
  assert.equal(st.status, "user", "編集を止めない");
  assert.equal(st.stale, true, "確かめていない印");
  assert.equal(st.user.nickname, "minato", "保存済みの profile を使う");
  assert.equal(store.get(AUTH_KEYS.token), "tk_main_app", "トークンを捨てない");
});

test("boot: 時間切れ（TIMEOUT）でも同じく暫定で入れる", async () => {
  const store = loggedInStore();
  const hang = (url, init) => new Promise((_r, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
  const { auth } = makeAuth(hang, { store, timeout: 20 });
  const st = await auth.boot();
  assert.equal(st.status, "user");
  assert.equal(st.stale, true);
});

test("boot: 401 なら anon に落として保管を捨てる（投げない）", async () => {
  const store = loggedInStore();
  const { auth } = makeAuth({ "/api/auth/me": () => res(401, { message: "期限切れです" }) }, { store });
  const seen = [];
  auth.onUnauthorized((e) => seen.push(e.code));
  const st = await auth.boot();
  assert.equal(st.status, "anon");
  assert.equal(st.user, null);
  assert.equal(st.token, "");
  assert.equal(store.has(AUTH_KEYS.token), false);
  assert.equal(store.has(AUTH_KEYS.profile), false);
  assert.deepEqual(seen, ["HTTP_401"]);
});

test("boot: 期限切れのトークンは /me を叩かずに捨てる", async () => {
  const store = loggedInStore({ [AUTH_KEYS.expiresAt]: String(Date.now() - HOUR) });
  const { auth, fetchImpl } = makeAuth({ "/api/auth/me": () => res(200, { user: USER }) }, { store });
  const st = await auth.boot();
  assert.equal(st.status, "anon");
  assert.equal(fetchImpl.calls.length, 0, "無駄な通信をしない");
  assert.equal(store.has(AUTH_KEYS.token), false);
});

test("boot: /me が user を返さなければ anon", async () => {
  const store = loggedInStore();
  const { auth } = makeAuth({ "/api/auth/me": () => res(200, { ok: true }) }, { store });
  assert.equal((await auth.boot()).status, "anon");
});

test("boot: 何も無ければ anon、mode が guest なら guest で戻る", async () => {
  const empty = makeAuth({}, {});
  assert.equal((await empty.auth.boot()).status, "anon");
  assert.equal(empty.fetchImpl.calls.length, 0);

  const g = makeAuth({}, { store: new MemStore({ [AUTH_KEYS.mode]: "guest", [AUTH_KEYS.guestId]: "guest_abcd1234" }) });
  const st = await g.auth.boot();
  assert.equal(st.status, "guest");
  assert.equal(st.guestId, "guest_abcd1234", "前のゲスト id を引き継ぐ");
});

test("boot: 2 回同時に呼んでも /me は 1 回だけ", async () => {
  const store = loggedInStore();
  const { auth, fetchImpl } = makeAuth({ "/api/auth/me": () => res(200, { user: USER }) }, { store });
  const [a, b] = await Promise.all([auth.boot(), auth.boot()]);
  assert.equal(a.status, "user");
  assert.equal(b.status, "user");
  assert.equal(fetchImpl.calls.length, 1);
});

test("subscribe: 変わるたびに呼ばれ、外すと止まる", async () => {
  const { auth } = makeAuth({
    "/api/auth/login": () => res(200, { token: "tk_5", expiresAt: Date.now() + HOUR, user: USER }),
  });
  const seen = [];
  const off = auth.subscribe((s) => seen.push(s.status));
  auth.guest();
  await auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" });
  off();
  auth.logout();
  assert.deepEqual(seen, ["guest", "user"]);
  assert.equal(auth.state.status, "anon", "外しても state 自体は正しい");
});

/* ── 6. ゲスト ─────────────────────────────────────────────────── */

test("guest: ローカルだけの id を作って覚える（機能は制限しない）", () => {
  const store = new MemStore();
  const { auth } = makeAuth({}, { store });
  const st = auth.guest();
  assert.equal(st.status, "guest");
  assert.match(st.guestId, /^guest_[A-Za-z0-9]{4,}$/);
  assert.equal(st.token, "", "ゲストはトークンを持たない");
  assert.equal(store.get(AUTH_KEYS.mode), "guest");
  assert.equal(auth.guest().guestId, st.guestId, "呼び直しても同じ id");

  const again = makeAuth({}, { store });
  assert.equal(again.auth.guest().guestId, st.guestId, "開き直しても同じ id");
});

test("guest: 本体のログインを壊さない（token が在れば mode を触らない）", () => {
  const store = loggedInStore();
  const { auth } = makeAuth({}, { store });
  auth.guest();
  assert.equal(store.get(AUTH_KEYS.mode), "user", "本体の mode を guest に書き換えない");
  assert.equal(store.get(AUTH_KEYS.token), "tk_main_app");
});

test("logout: keepGuest でそのまま編集を続けられる", async () => {
  const store = loggedInStore();
  const { auth } = makeAuth({ "/api/auth/me": () => res(200, { user: USER }) }, { store });
  await auth.boot();
  const st = auth.logout({ keepGuest: true });
  assert.equal(st.status, "guest");
  assert.match(st.guestId, /^guest_/);
  assert.equal(store.has(AUTH_KEYS.token), false);
  assert.equal(store.get(AUTH_KEYS.mode), "guest");

  const st2 = auth.logout();
  assert.equal(st2.status, "anon");
  assert.equal(store.has(AUTH_KEYS.mode), false);
});

/* ── 7. 新規登録の 4 段（状態を持たない・devCode をそのまま返す） ── */

test("register.start: §10.1 の本文を送り、Challenge を整えて返す", async () => {
  const { auth, fetchImpl } = makeAuth({
    "/api/auth/register/start": () => res(200, {
      ok: true, challengeId: "ch_9", maskedEmail: "m*****@example.com",
      expiresIn: 600, resendAvailableIn: 30, resendsRemaining: 3, devCode: "123456",
    }),
  });
  const ch = await auth.register.start({
    email: " minato@example.com ", gradePrefix: "h1", nickname: "minato",
    password: "Qw3zP1x2!", password2: "Qw3zP1x2!",
  });
  assert.deepEqual(Object.keys(fetchImpl.last().body).sort(),
    ["email", "gradePrefix", "nickname", "password", "password2", "turnstileToken"]);
  assert.equal(fetchImpl.last().body.email, "minato@example.com");
  assert.equal(fetchImpl.last().body.gradePrefix, "H1");
  assert.equal(ch.challengeId, "ch_9");
  assert.equal(ch.devCode, "123456", "開発環境のコードはそのまま渡す");
  assert.equal(ch.expiresIn, 600);
  assert.equal(ch.resendsRemaining, 3);
});

test("register.start: 足りない値は既定で埋め、maskedEmail は自前で作る", async () => {
  const { auth } = makeAuth({
    "/api/auth/register/start": () => res(200, { ok: true, challengeId: "ch_10" }),
  });
  const ch = await auth.register.start({
    email: "minato@example.com", gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!",
  });
  assert.equal(ch.maskedEmail, "m*****@example.com");
  assert.equal(ch.expiresIn, 600);
  assert.equal(ch.resendAvailableIn, 30);
  assert.equal(ch.resendsRemaining, 3);
  assert.equal(ch.devCode, "");
});

test("register: challengeId が来なければ BAD_RESPONSE", async () => {
  const { auth } = makeAuth({ "/api/auth/register/start": () => res(200, { ok: true }) });
  await assert.rejects(
    () => auth.register.start({ email: "a@b.jp", gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" }),
    (e) => e.code === "BAD_RESPONSE",
  );
});

test("register: verify → resend → consent（受付は呼び出し側が持ち回る）", async () => {
  const { auth, fetchImpl, store } = makeAuth({
    "/api/auth/register/verify": () => res(200, { ok: true, verified: true, registrationSession: "rs_1" }),
    "/api/auth/register/resend": () => res(200, { ok: true, expiresIn: 600, resendAvailableIn: 30, resendsRemaining: 2, devCode: "654321" }),
    "/api/auth/register/consent": () => res(200, { ok: true, token: "tk_new", expiresAt: Date.now() + 24 * HOUR, user: USER }),
  });

  const v = await auth.register.verify({ challengeId: "ch_9", code: "12 34 56" });
  assert.equal(v.registrationSession, "rs_1");
  assert.equal(v.verified, true);
  assert.deepEqual(fetchImpl.last().body, { challengeId: "ch_9", code: "123456" }, "数字だけ送る");

  const again = await auth.register.resend({ challengeId: "ch_9" });
  assert.equal(again.challengeId, "ch_9", "同じ受付を続けられる形で返す");
  assert.equal(again.resendsRemaining, 2);
  assert.equal(again.devCode, "654321");

  const st = await auth.register.consent({ registrationSession: "rs_1", pin: "1234" });
  assert.deepEqual(Object.keys(fetchImpl.last().body).sort(),
    ["agreeAge", "agreePrivacy", "agreeTerms", "pin", "registrationSession"]);
  assert.equal(fetchImpl.last().body.agreeTerms, true);
  assert.equal(fetchImpl.last().body.pin, "1234");
  assert.equal(st.status, "user", "そのまま入った状態になる");
  assert.equal(store.get(AUTH_KEYS.token), "tk_new");
});

test("register.verify: alreadyVerified も通す", async () => {
  const { auth } = makeAuth({
    "/api/auth/register/verify": () => res(200, { ok: true, alreadyVerified: true, registrationSession: "rs_2" }),
  });
  const v = await auth.register.verify({ challengeId: "ch_9", code: "123456" });
  assert.equal(v.alreadyVerified, true);
  assert.equal(v.registrationSession, "rs_2");
});

/* ── 8. パスワード変更・再設定 ─────────────────────────────────── */

test("changePassword: **ここだけ snake_case**（契約書 §10.1）", async () => {
  const { auth, fetchImpl } = makeAuth({
    "/api/auth/change-password": () => res(200, { ok: true, message: "変えました" }),
  });
  const r = await auth.changePassword({
    gradePrefix: "h1", nickname: "minato", oldPassword: "Furui-1234!", newPassword: "Atarashii-5678!",
  });
  assert.equal(r.ok, true);
  assert.equal(r.message, "変えました");
  const body = fetchImpl.last().body;
  assert.deepEqual(Object.keys(body).sort(), ["grade_prefix", "new_password", "nickname", "old_password"]);
  assert.equal(body.grade_prefix, "H1");
  assert.equal(body.old_password, "Furui-1234!");
  assert.equal(body.new_password, "Atarashii-5678!");
});

test("changePassword: 短い / 同じ は送る前に止める", async () => {
  const { auth, fetchImpl } = makeAuth({});
  await assert.rejects(() => auth.changePassword({ gradePrefix: "H1", nickname: "minato", oldPassword: "a", newPassword: "short" }),
    (e) => e.code === "VALIDATION" && /8 文字以上/.test(e.message));
  await assert.rejects(() => auth.changePassword({ gradePrefix: "H1", nickname: "minato", oldPassword: "Onaji-1234!", newPassword: "Onaji-1234!" }),
    (e) => e.code === "VALIDATION");
  assert.equal(fetchImpl.calls.length, 0);
});

test("reset: start → code → password（コードの道）", async () => {
  const { auth, fetchImpl } = makeAuth({
    "/api/auth/reset/start": () => res(200, { ok: true, challengeId: "ch_r", maskedEmail: "m*****@example.com", resendsRemaining: 3, devCode: "999999" }),
    "/api/auth/reset/code": () => res(200, { ok: true, resetToken: "rt_1", attemptsRemaining: 4 }),
    "/api/auth/reset/password": () => res(200, { ok: true, message: "変えました" }),
  });
  const ch = await auth.reset.start({ gradePrefix: "h1", nickname: "minato" });
  assert.deepEqual(fetchImpl.last().body, { gradePrefix: "H1", nickname: "minato" });
  assert.equal(ch.challengeId, "ch_r");
  assert.equal(ch.devCode, "999999");

  const c = await auth.reset.code({ challengeId: "ch_r", code: "123456" });
  assert.equal(c.resetToken, "rt_1");
  assert.equal(c.attemptsRemaining, 4);

  const done = await auth.reset.password({ challengeId: "ch_r", resetToken: "rt_1", newPassword: "Atarashii-5678!" });
  assert.equal(done.ok, true);
  assert.deepEqual(Object.keys(fetchImpl.last().body).sort(), ["challengeId", "newPassword", "resetToken"]);
});

test("reset: pin の道（4 桁 or 6 桁）", async () => {
  const { auth, fetchImpl } = makeAuth({
    "/api/auth/reset/pin": () => res(200, { ok: true, challengeId: "ch_p", resetToken: "rt_2" }),
  });
  const r = await auth.reset.pin({ gradePrefix: "H1", nickname: "minato", pin: "12 34" });
  assert.deepEqual(fetchImpl.last().body, { gradePrefix: "H1", nickname: "minato", pin: "1234" });
  assert.equal(r.challengeId, "ch_p");
  assert.equal(r.resetToken, "rt_2");
});

test("reset: resetToken が来なければ REJECTED（残り回数も渡す）", async () => {
  const { auth } = makeAuth({
    "/api/auth/reset/code": () => res(200, { ok: true, attemptsRemaining: 1, message: "違います" }),
  });
  await assert.rejects(() => auth.reset.code({ challengeId: "ch_r", code: "000000" }), (e) => {
    assert.equal(e.code, "REJECTED");
    assert.equal(e.attemptsRemaining, 1);
    return true;
  });
});

/* ── 9. 保管が使えない環境（iOS プライベートモード） ───────────── */

test("storage が throw する環境でも落ちない", async () => {
  const broken = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  const routes = {
    "/api/auth/login": () => res(200, { token: "tk_6", expiresAt: Date.now() + HOUR, user: USER }),
    "/api/auth/me": () => res(200, { user: USER }),
  };
  const opts = { apiBase: "https://api.test", storage: broken, sessionStorage: broken };
  const auth = createAuth({ ...opts, fetchImpl: fakeFetch(routes) });
  assert.equal(auth.state.status, "anon");
  const st = await auth.login({ gradePrefix: "H1", nickname: "minato", password: "Qw3zP1x2!" });
  assert.equal(st.status, "user", "保存できなくても その場は使える");
  assert.deepEqual(auth.authHeader(), { Authorization: "Bearer tk_6" });
  // 同じ instance の中は覚えている（その場だけの代わりを使う）ので入ったまま
  assert.equal((await auth.boot()).status, "user");
  // 開き直すと 何も残っていない（= 毎回入り直し。壊れた storage でも落ちない）
  const reopened = createAuth({ ...opts, fetchImpl: fakeFetch(routes) });
  assert.equal(reopened.state.status, "anon");
  assert.equal((await reopened.boot()).status, "anon");
});

test("createAuth: 契約書 §10.2 の口が揃っている", () => {
  const { auth } = makeAuth({});
  for (const k of ["boot", "login", "logout", "guest", "changePassword", "authHeader",
    "passwordStrength", "subscribe", "onUnauthorized", "refresh", "request", "profile"]) {
    assert.equal(typeof auth[k], "function", `${k} が無い`);
  }
  for (const k of ["start", "verify", "resend", "consent"]) {
    assert.equal(typeof auth.register[k], "function", `register.${k} が無い`);
  }
  for (const k of ["start", "code", "pin", "password"]) {
    assert.equal(typeof auth.reset[k], "function", `reset.${k} が無い`);
  }
  assert.deepEqual(Object.keys(auth.state).sort(), ["expiresAt", "guestId", "stale", "status", "token", "user"]);
  assert.equal(auth.apiBase, "https://api.test");
});
