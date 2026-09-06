/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz Admin — 管理ダッシュボードのサーバ側（2026-08-18）

   ★ 置き場所を worker.js と分けた理由
     worker.js は 59,000 行ある。ここへ 2,000 行を差し込むと、
     以後の差分がまったく読めなくなる。**別ファイルにして、
     worker.js への差し込みは「入口 1 か所」だけ**にする。

   ★ この画面がぜったいに守ること（指示書の絶対原則）
     ① 生成物の中身を Admin に出さない。**メタデータだけ**を扱う。
        問題文・書類の中身・氏名・金額は、この API から一切返さない。
     ② 理由なしの Ban・停止をできなくする。理由が空なら **サーバが弾く**。
     ③ 壊す操作はすべて監査ログへ。誰が・いつ・何を・なぜ・前後。
     ④ 設定はぜんぶ D1。**出し直し（デプロイ）なしで効く。**
     ⑤ Ban は取り消せる。恒久削除とは別物にする。
     ⑥ 画面を作ったら、必ずナビゲーションから行ける。

   ★ いちばん大事な決まり
     **権限はサーバで見る。** 画面でボタンを隠すのは飾りであって、
     権限制御ではない。すべての口で呼び出し元の権限を確かめる。
   ══════════════════════════════════════════════════════════════════════════ */

/* ★ 通話（2026-08-29）。控えを 捨てる 口と、数だけの 集計を 借りる。
   calls.js は 何も import しないので、ここから 読んでも 輪に ならない。 */
import { forgetCallLimitCache, callsAdminSummary, callsReportDetail, callsSelfTest,
  開いている人へ押す } from "./calls.js";

/* ══ 1. 権限 ══════════════════════════════════════════════════════════════
   ロールではなく **権限の集合**で持つ。ロールはその詰め合わせにすぎない。
   あとから権限を足すときに、ロールの定義を書き換えずに済む。 */
export const ADMIN_PERMISSIONS = [
  "metrics.view",
  "users.view",
  "users.suspend",
  "users.ban",
  "users.delete",
  "users.reveal_email",
  /* 公式マークの 付け外し（2026-08-20）。moderator には 渡さない。 */
  "users.badge",
  /* ダウンタイム（サービス全体を 止める）。owner と admin だけ。 */
  "system.downtime",
  "admins.view",
  "admins.invite",
  "admins.revoke",
  "admins.role_change",
  "flags.view",
  "flags.toggle",
  "limits.view",
  "limits.edit",
  "content.view",
  "content.hide",
  "announcements.view",
  "announcements.publish",
  /* 通知を 直接 送る（2026-09-05）。お知らせ（News）とは 別に、
     通知欄へ 直に 入れる。moderator には 渡さない。 */
  "notify.send",
  /* Qredit・サブスクを 手で 動かす（2026-09-05）。owner と admin だけ。 */
  "users.qredit",
  "audit.view"
];

const ALL = ADMIN_PERMISSIONS.slice();

export const ADMIN_ROLE_PERMISSIONS = {
  /* すべて。唯一の存在。 */
  owner: ALL.slice(),
  /* owner 管理（revoke / role_change）と users.delete を除くすべて */
  admin: ALL.filter((p) => p !== "admins.revoke" && p !== "admins.role_change" && p !== "users.delete"),
  moderator: [
    "metrics.view", "users.view", "users.suspend",
    "content.view", "content.hide", "announcements.view"
  ],
  /* 見るだけ。操作は 1 つもできない。 */
  viewer: ["metrics.view", "users.view", "flags.view", "limits.view"]
};

/* 壊す操作。ここに載っているものは **再認証**を要求する。 */
const DESTRUCTIVE = new Set([
  "users.suspend", "users.ban", "users.delete", "users.unban", "users.restore", "users.purge",
  "admins.invite", "admins.revoke", "admins.role_change", "admins.transfer_owner",
  "flags.toggle", "limits.edit", "content.hide", "announcements.publish",
  /* 2026-09-05。どちらも **取り消しにくい**。通知は 送ったら 引っ込められないし、
     Qredit は 人の 持ちものを 動かす。理由と 再認証を 要る ように する。 */
  "notify.send", "users.qredit"
]);

const REAUTH_WINDOW_MS = 10 * 60 * 1000;      /* 再認証は 10 分だけ有効 */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;    /* セッションは 8 時間 */
const LOGIN_LOCK_MS = 15 * 60 * 1000;         /* 5 回失敗で 15 分ロック */
const LOGIN_MAX_FAIL = 5;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;    /* 招待は 72 時間 */
const DELETED_RESTORE_DAYS = 30;              /* 論理削除から 30 日は戻せる */
/* ★ フラグの持ち回し（2026-08-18・実測で 8 秒へ縮めた）。
   もとは 20 秒だった。**画面側の見に行く間隔と足し算になる**ので、
   サーバ 20 秒 + 画面 20 秒 = 最悪 40 秒かかり、
   「off にしたら消えたが、on に戻しても 32 秒では戻らない」が実際に起きた。
   フラグを書き換えた側の isolate は持ち回しを捨てられるが、
   別の isolate は捨てられない。だから **持ち回しそのものを短くする**。
   いま: サーバ 8 秒 + 画面 15 秒 = 最悪 23 秒（要件の 30 秒以内）。 */
const FLAG_CACHE_MS = 8 * 1000;

/* ══ 2. 小道具 ═══════════════════════════════════════════════════════════ */

function jsonRes(data, status = 200, extraHeaders) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    /* 管理画面は検索に載せない */
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer"
  });
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) h.set(k, v);
  return new Response(JSON.stringify(data), { status, headers: h });
}
const ok = (data) => jsonRes(Object.assign({ ok: true }, data || {}), 200);
const bad = (code, message, status = 400) => jsonRes({ ok: false, code, message }, status);

function S(v) { return v === undefined || v === null ? "" : String(v); }
function N(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function uuid() { return crypto.randomUUID(); }
function nowMs() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }

/* JST の日付（YYYY-MM-DD）。集計は全部これで揃える。 */
function jstDay(ms) {
  return new Date(N(ms, Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function jstDayAgo(n) { return jstDay(Date.now() - n * 86400000); }

function bytesToHex(b) {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(h) {
  const s = S(h);
  const out = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
function randomHex(nBytes) {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}
async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S(s)));
  return bytesToHex(new Uint8Array(d));
}
/* 突き合わせは **長さで差が出ない**やり方で。 */
function safeEq(a, b) {
  const x = S(a), y = S(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
/* ★ Cloudflare Workers の Web Crypto は **PBKDF2 を 100,000 回まで**しか
   受け付けない（2026-08-18・実測。210,000 を渡したら deriveBits が投げ、
   owner の初期設定が「処理に失敗しました」だけ返して止まっていた）。
   既存の users テーブルの既定値も 100000 で、そろえておく。 */
const PBKDF2_ITER = 100000;
async function pbkdf2Hex(pass, saltHex, iter) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(S(pass)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: Math.min(PBKDF2_ITER, N(iter, PBKDF2_ITER)), hash: "SHA-256" },
    key, 256);
  return bytesToHex(new Uint8Array(bits));
}

/* ══ TOTP（RFC 6238）══════════════════════════════════════════════════════
   二要素認証。外の部品を使わずに書く（管理画面のために依存を増やさない）。 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  const clean = S(s).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpAt(secretB32, counter) {
  const key = await crypto.subtle.importKey(
    "raw", base32Decode(secretB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  dv.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}
async function totpVerify(secretB32, code, window = 1) {
  const c = S(code).replace(/\D/g, "");
  if (c.length !== 6 || !S(secretB32)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let d = -window; d <= window; d++) {
    if (safeEq(await totpAt(secretB32, step + d), c)) return true;
  }
  return false;
}

/* メールアドレスの隠し方。既定はこれ。展開には権限と監査がいる。 */
export function maskEmail(raw) {
  const e = S(raw).trim();
  if (!e || e.indexOf("@") < 0) return e ? "***" : "";
  const [u, d] = e.split("@");
  const head = u.slice(0, 2) || "*";
  const dparts = S(d).split(".");
  const dh = (dparts[0] || "").slice(0, 2) || "*";
  const tail = dparts.length > 1 ? "." + dparts.slice(1).join(".") : "";
  return head + "***@" + dh + "***" + tail;
}

function clientIp(request) {
  return S(request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For") || "").split(",")[0].trim();
}
function clientUa(request) { return S(request.headers.get("User-Agent")).slice(0, 300); }

function cookieValue(request, name) {
  const raw = S(request.headers.get("Cookie"));
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/* ══ 3. スキーマ ═════════════════════════════════════════════════════════
   ★ audit_log は **追記のみ**。UPDATE / DELETE は SQLite の引き金で止める。
     「そういうコードを書かない」だけでは保証にならない。DB で止める。 */
let _adminSchemaDone = false;
let _adminSchemaPromise = null;

const ADMIN_TABLES = [
  `CREATE TABLE IF NOT EXISTS admins (
    admin_id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer',
    custom_permissions TEXT NOT NULL DEFAULT '',
    pass_hash TEXT NOT NULL DEFAULT '',
    pass_salt TEXT NOT NULL DEFAULT '',
    pass_iter INTEGER NOT NULL DEFAULT 100000,
    totp_secret TEXT NOT NULL DEFAULT '',
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT '',
    last_login_at TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email ON admins (email)`,
  `CREATE TABLE IF NOT EXISTS admin_invites (
    invite_id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer',
    token_hash TEXT NOT NULL DEFAULT '',
    invited_by TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    accepted_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL DEFAULT '',
    admin_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    reauth_at TEXT NOT NULL DEFAULT '',
    totp_ok INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions (token_hash)`,
  /* カスタムロール。権限にチェックを入れて名前を付けたもの。 */
  `CREATE TABLE IF NOT EXISTS admin_custom_roles (
    role_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    permissions TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  /* ログインの試行。5 回失敗で 15 分ロック。 */
  `CREATE TABLE IF NOT EXISTS admin_login_attempts (
    key TEXT PRIMARY KEY,
    failed INTEGER NOT NULL DEFAULT 0,
    lock_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  /* 全アクセスの IP と UA。**残す**と決めた以上、必ず書く。 */
  `CREATE TABLE IF NOT EXISTS admin_access_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_access_created ON admin_access_log (created_at)`,
  /* ★ 監査ログ。追記のみ。 */
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL DEFAULT '',
    admin_email TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    before TEXT NOT NULL DEFAULT '',
    after TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log (admin_id, created_at)`,
  /* ★★ 追記のみを **DB で** 保証する。 */
  `CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
     BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
     BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
  /* 利用者の状態 */
  `CREATE TABLE IF NOT EXISTS user_status (
    user_id TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'active',
    reason_category TEXT NOT NULL DEFAULT '',
    reason_text TEXT NOT NULL DEFAULT '',
    suspend_until TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT '',
    notified INTEGER NOT NULL DEFAULT 0,
    changed_by TEXT NOT NULL DEFAULT '',
    changed_at TEXT NOT NULL DEFAULT '',
    deleted_at TEXT NOT NULL DEFAULT ''
  )`,
  /* 理由カテゴリ（編集できる） */
  `CREATE TABLE IF NOT EXISTS admin_reason_categories (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  /* 機能フラグ */
  `CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'on',
    visible_in_sidebar INTEGER NOT NULL DEFAULT 0,
    sidebar_order INTEGER NOT NULL DEFAULT 0,
    badge TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT 'all',
    allowlist TEXT NOT NULL DEFAULT '[]',
    percentage INTEGER NOT NULL DEFAULT 100,
    notice TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL DEFAULT 'main',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  /* 利用制限 */
  `CREATE TABLE IF NOT EXISTS rate_limit_config (
    key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    value INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    applies_to TEXT NOT NULL DEFAULT 'all',
    default_value INTEGER NOT NULL DEFAULT 0,
    group_key TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  /* 提供元の上限（プロバイダ側の仕様変更に追随できるよう、DB に置く） */
  `CREATE TABLE IF NOT EXISTS provider_limit_config (
    key TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    rpm INTEGER NOT NULL DEFAULT 0,
    tpm INTEGER NOT NULL DEFAULT 0,
    rpd INTEGER NOT NULL DEFAULT 0,
    keys INTEGER NOT NULL DEFAULT 1,
    /* ★ この上限で **実際に止めるか**。既定は 0（記録だけ）。
       いきなり止める側にすると、上限値が 1 つ間違っているだけで
       生成が丸ごと動かなくなる。まず記録して、数字が合っていることを
       確かめてから、画面で 1 つずつ止める側へ切り替える。 */
    enforce INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS provider_limit_hits (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT '',
    minutes INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
  )`,
  /* 集計（日次ロールアップ）。書き手は下の rollup。 */
  `CREATE TABLE IF NOT EXISTS provider_usage_daily (
    date_jst TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
    rate_limited INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date_jst, provider, model)
  )`,
  `CREATE TABLE IF NOT EXISTS provider_usage_minute (
    ts TEXT NOT NULL, provider TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ts, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS generation_daily (
    date_jst TEXT NOT NULL, feature TEXT NOT NULL, provider TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0, publishable INTEGER NOT NULL DEFAULT 0,
    repaired INTEGER NOT NULL DEFAULT 0, unresolved INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date_jst, feature, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS validation_error_daily (
    date_jst TEXT NOT NULL, feature TEXT NOT NULL, error_code TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date_jst, feature, error_code)
  )`,
  `CREATE TABLE IF NOT EXISTS lumi_session_daily (
    date_jst TEXT PRIMARY KEY,
    sessions INTEGER NOT NULL DEFAULT 0, total_seconds INTEGER NOT NULL DEFAULT 0,
    audio_tokens_in INTEGER NOT NULL DEFAULT 0, audio_tokens_out INTEGER NOT NULL DEFAULT 0,
    tool_calls INTEGER NOT NULL DEFAULT 0, tool_errors INTEGER NOT NULL DEFAULT 0,
    disconnects INTEGER NOT NULL DEFAULT 0,
    latency_p50_ms INTEGER NOT NULL DEFAULT 0, latency_p95_ms INTEGER NOT NULL DEFAULT 0
  )`,
  /* お知らせ。**公式サイトのニュースと同じ置き場所**（news_articles）へ
     書き出すので、ここは下書き・予約・配信先の管理だけを持つ。 */
  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body_md TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'both',
    category TEXT NOT NULL DEFAULT 'release',
    published_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    news_id TEXT NOT NULL DEFAULT '',
    media_json TEXT NOT NULL DEFAULT '[]',
    notify INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  )`,
  /* 通報と非表示。既存に通報表が無いので、ここで持つ。 */
  `CREATE TABLE IF NOT EXISTS content_reports (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL DEFAULT 'preset',
    target_id TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL DEFAULT '',
    reporter_id TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'open',
    handled_by TEXT NOT NULL DEFAULT '',
    handled_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  /* 本体と同じ通知の表。**本体が先に作っているのが普通**だが、
     管理側だけを先に触った環境でも落ちないように作っておく。 */
  `CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 0,
    actor_user_id INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    ts INTEGER NOT NULL DEFAULT 0,
    day_key TEXT NOT NULL DEFAULT '',
    meta_json TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS content_hidden (
    target_type TEXT NOT NULL, target_id TEXT NOT NULL,
    reason_category TEXT NOT NULL DEFAULT '', reason_text TEXT NOT NULL DEFAULT '',
    hidden_by TEXT NOT NULL DEFAULT '', hidden_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (target_type, target_id)
  )`
];

/* 最初に入れておくフラグ。**サイドパネルはこれで描く。**
   ここに無いものはサイドパネルに出ない＝ハードコードが残っていない、と言える。 */
const SEED_FLAGS = [
  /* key,               表示名,          icon,     path,               区画,   並び, 出す, 状態,   バッジ */
  ["home", "ホーム", "home", "tab:home", "main", 10, 1, "on", ""],
  ["preset", "プリセット", "grid", "tab:library", "main", 20, 1, "on", ""],
  ["feed", "Feed", "message", "tab:inbox", "main", 30, 1, "on", ""],
  ["dm", "DM", "mail", "fn:dm", "main", 35, 1, "on", "NEW"],
  ["news", "NEWS", "news", "tab:news", "main", 40, 1, "on", ""],
  ["insights", "Insights", "trend", "tab:insight", "main", 50, 1, "on", ""],
  /* 旧 VocabuSurvival は 画面が Error 2800 で 塞がっている（2026-08-28 実測）。
     下の 一度きりの 直しで 左パネルから 外し、代わりに VocabuSurvive を 出す。 */
  ["survival", "VocabuSurvival", "shield", "tab:survival3", "hidden", 60, 0, "off", ""],
  ["survive", "VocabuSurvive", "game", "tab:survive", "main", 60, 1, "on", "NEW"],
  /* 文章添削（校正モード）2026-08-31。画面を 切り替えず 重ねて 開く。 */
  ["write", "文章添削", "pencil", "fn:write", "tools", 5, 1, "beta", "NEW"],
  /* カレンダー・ヘルプ（2026-09-01・訴え）。
     ★ 種は **新しい DB にしか 効かない**。すでに ある DB へは
       下の 一度きりの 直しで 入れる（前に これで 出なかった）。 */
  ["calendar", "カレンダー", "cal", "fn:calendar", "tools", 15, 1, "on", "NEW"],
  ["help", "ヘルプ", "help", "fn:help", "foot", 30, 1, "on", ""],
  ["timer", "タイマー", "timer", "fn:timer", "tools", 10, 1, "on", ""],
  ["quick_chat", "Quick Chat", "zap", "tab:chat", "tools", 20, 1, "on", ""],
  ["notifications", "通知", "bell", "tab:notifications", "tools", 30, 1, "on", ""],
  ["qredit", "Qredit", "coins", "tab:qredit", "tools", 40, 1, "on", ""],
  ["subscription", "Subscription", "crown", "tab:subscription", "tools", 50, 1, "on", ""],
  ["profile", "プロフィール", "user", "action:open-profile", "foot", 10, 1, "on", ""],
  ["settings", "設定", "gear", "fn:settings", "foot", 20, 1, "on", ""],
  /* サイドパネルには出ないが、機能としては錠を掛けられるもの */
  ["quick_mock", "Quick Mock", "grid", "feature:quick_mock", "hidden", 0, 0, "on", ""],
  ["workplace", "Workplace", "layers", "feature:workplace", "hidden", 0, 0, "beta", "β"],
  ["vocabu_speak", "VocabuSpeak", "message", "feature:vocabu_speak", "hidden", 0, 0, "on", ""],
  ["lumi_live", "Lumi Live", "zap", "feature:lumi_live", "hidden", 0, 0, "on", ""],
  ["ar_board", "AR Board", "wand", "feature:ar_board", "hidden", 0, 0, "on", ""]
];

const SEED_REASONS = [
  ["spam", "スパム", 10], ["inappropriate", "不適切なコンテンツの公開", 20],
  ["copyright", "著作権侵害", 30], ["tos", "規約違反", 40],
  ["automation", "自動化された大量利用", 50], ["harassment", "他ユーザーへの迷惑行為", 60],
  ["self_request", "本人からの依頼", 70], ["other", "その他", 80]
];

/* 利用制限の初期値。**現在値と既定値の両方**を持つ（戻せるように）。 */
const SEED_LIMITS = [
  ["generation.daily.free", "日次の生成回数上限（未連携）", 50, "回/日", "free", "generation"],
  ["generation.daily.byok", "日次の生成回数上限（BYOK）", 200, "回/日", "byok", "generation"],
  ["generation.weekly.free", "週次の生成回数上限（未連携）", 200, "回/週", "free", "generation"],
  ["generation.weekly.byok", "週次の生成回数上限（BYOK）", 800, "回/週", "byok", "generation"],
  ["generation.weekly.reset", "週次リセット（0=日曜, JST の 0 時）", 0, "曜日", "all", "generation"],
  ["generation.daily.reset_mode", "日次リセット（0=使い始めから24時間 / 1=JST 0時）", 0, "方式", "all", "generation"],
  ["lumi.sessions.daily", "1日あたりの Lumi セッション数上限", 20, "回/日", "all", "lumi"],
  ["lumi.session.max_seconds", "1セッションの最大時間", 1800, "秒", "all", "lumi"],
  ["lumi.concurrent.max", "同時セッション数の上限", 8, "本", "all", "lumi"],
  ["storage.user.max_mb", "1ユーザーあたりの保存容量上限", 512, "MB", "all", "storage"],
  ["storage.file.max_mb", "1ファイルの最大サイズ", 24, "MB", "all", "storage"],
  ["quickmock.questions.max", "1回に生成できる最大問題数", 60, "問", "all", "quickmock"],
  ["quickmock.upload.max_files", "資料アップロードの上限枚数", 20, "枚", "all", "quickmock"],
  ["quickmock.upload.max_mb", "資料アップロードの上限サイズ", 40, "MB", "all", "quickmock"],
  /* ── DM の 音声通話（2026-08-29）──────────────────────────────────
     ★ 既定値は calls.js の 制限の既定 と **同じ数字**に しておくこと。
       ずれると「画面で 直したのに 効かない」に 見える。 */
  ["call.daily.minutes", "1日あたりの通話時間の上限", 120, "分/日", "all", "call"],
  ["call.daily.count", "1日あたりの発信回数の上限", 30, "回/日", "all", "call"],
  ["call.max_minutes", "1通話の最大時間", 60, "分", "all", "call"],
  ["call.concurrent.max", "同時通話数", 1, "本", "all", "call"],
  ["call.lumi.daily.count", "Lumi介入の1日あたり回数", 10, "回/日", "all", "call"],
  ["call.lumi.max_seconds", "Lumi介入の1回あたり最大時間", 300, "秒", "all", "call"]
];

/* 提供元の上限。**実測値**（wrangler.dev.toml のコメントと同じ根拠）。 */
const SEED_PROVIDER_LIMITS = [
  ["groq:openai/gpt-oss-20b", "groq", "openai/gpt-oss-20b", 30, 15000, 1000, 6, "6鍵。1日あたり合計 5,400,000 トークン（実測）"],
  ["groq:openai/gpt-oss-120b", "groq", "openai/gpt-oss-120b", 30, 8000, 1000, 6, "6鍵"],
  ["gemini:gemini-3.1-flash-lite", "gemini", "gemini-3.1-flash-lite", 15, 250000, 500, 5,
   "Flash（無印）は RPD 20 で即止まる。**Lite に固定している**（運用上の判断）"],
  ["gemini:gemini-3.5-flash-lite", "gemini", "gemini-3.5-flash-lite", 15, 250000, 500, 5,
   "Quick Chat の主。Flash（無印）は RPD 20 のため使わない"],
  /* ★ 音声会話（Lumi Live）。2026-08-20 に 足した。
     上限表に 行が 無いと、管理画面から **音声会話の枠が まったく 見えない**。
     提供元の RPM/TPM/RPD は 実測できていないので 0（＝未設定）で 置く。
     数字が 分かったら この画面で 入れる。 */
  ["gemini:live", "gemini", "gemini-3.1-flash-live-preview", 0, 0, 0, 5,
   "Lumi の 音声会話。1 人 1 日 80 会話までは こちらで 止めている（繋ぎ直しは 数えない）"],
  ["workers_ai:default", "workers_ai", "@cf/*", 0, 0, 10000, 1, "Cloudflare Workers AI。Neuron 制"],
  ["local:bridge", "local", "bridge", 0, 0, 0, 1, "M3 Max のローカル Bridge。上限なし（機材の速度が上限）"]
];

export async function ensureAdminSchema(env) {
  if (_adminSchemaDone) return;
  if (_adminSchemaPromise) return _adminSchemaPromise;
  _adminSchemaPromise = (async () => {
    if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
    for (const sql of ADMIN_TABLES) {
      try { await env.DB.prepare(sql).run(); }
      catch (e) {
        const m = S(e?.message);
        /* D1 の meta バグ（duration）は既存コードと同じ扱いで見送る */
        if (!/duration/i.test(m)) console.warn("[admin] schema:", m, sql.slice(0, 60));
      }
    }
    /* ★ **すでにある表には CREATE TABLE IF NOT EXISTS で列は増えない**
       （2026-08-18・実測。enforce を足したのに "no such column" で落ちた）。
       あとから足した列は、ここで 1 つずつ入れる。 */
    const 列を足す = async (表, 列, ddl) => {
      try {
        const info = await env.DB.prepare(`PRAGMA table_info(${表})`).all();
        const ある = ((info && info.results) || []).some((c) => S(c.name) === 列);
        if (!ある) await env.DB.prepare(`ALTER TABLE ${表} ADD COLUMN ${ddl}`).run();
      } catch (e) { /* 表がまだ無いなら CREATE 側で入る */ }
    };
    await 列を足す("provider_limit_config", "enforce", "enforce INTEGER NOT NULL DEFAULT 0");
    await 列を足す("user_status", "deleted_at", "deleted_at TEXT NOT NULL DEFAULT ''");
    await 列を足す("feature_flags", "section", "section TEXT NOT NULL DEFAULT 'main'");
    await 列を足す("rate_limit_config", "default_value", "default_value INTEGER NOT NULL DEFAULT 0");
    await 列を足す("rate_limit_config", "group_key", "group_key TEXT NOT NULL DEFAULT ''");
    /* お知らせに 添える 画像・動画 と、通知にも 送るか（2026-08-20） */
    await 列を足す("announcements", "media_json", "media_json TEXT NOT NULL DEFAULT '[]'");
    await 列を足す("announcements", "notify", "notify INTEGER NOT NULL DEFAULT 0");

    /* 種を入れる（すでに在るものは触らない＝運用中の値を上書きしない） */
    for (const f of SEED_FLAGS) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO feature_flags
         (key, display_name, description, state, visible_in_sidebar, sidebar_order,
          badge, audience, allowlist, percentage, notice, icon, path, section, updated_by, updated_at)
         VALUES (?1,?2,'',?3,?4,?5,?6,'all','[]',100,'',?7,?8,?9,'seed',?10)`
      ).bind(f[0], f[1], f[7], f[6], f[5], f[8], f[2], f[3], f[4], nowIso()).run().catch(() => {});
    }
    /* ── 一度きりの 直し（2026-08-28）───────────────────────────────
       種は INSERT OR IGNORE なので、**すでに ある 行は 変わらない**。
       旧 VocabuSurvival の 行は 前の 種で 作られていて、いまも
       左パネルに 出てしまう。画面は Error 2800 で 何も できないので 外す。
       ただし **管理画面で 誰かが 触った 行は 触らない**（updated_by で 見る）。 */
    await env.DB.prepare(
      `UPDATE feature_flags
          SET visible_in_sidebar = 0, section = 'hidden', state = 'off',
              updated_by = 'seed', updated_at = ?1
        WHERE key = 'survival' AND updated_by = 'seed' AND path = 'tab:survival3'`
    ).bind(nowIso()).run().catch(() => {});

    /* ★ 種は INSERT OR IGNORE なので、**すでに 表が ある 環境には 入らない**。
       文章添削は あとから 足した ので、ここで 1 度だけ 入れ直す
       （管理画面で 触った 行は 触らない）。 */
    await env.DB.prepare(
      `INSERT OR IGNORE INTO feature_flags
       (key, display_name, description, state, visible_in_sidebar, sidebar_order,
        badge, audience, allowlist, percentage, notice, icon, path, section, updated_by, updated_at)
       VALUES ('write','文章添削','','beta',1,5,'NEW','all','[]',100,'','pencil','fn:write','tools','seed',?1)`
    ).bind(nowIso()).run().catch(() => {});
    /* ★ カレンダー・ヘルプ（2026-09-01）。種は すでに ある DB には 効かない ので
       ここでも 1 度だけ 入れる。入れ忘れると **左の 帯に 出ない**。 */
    await env.DB.prepare(
      `INSERT OR IGNORE INTO feature_flags
       (key, display_name, description, state, visible_in_sidebar, sidebar_order,
        badge, audience, allowlist, percentage, notice, icon, path, section, updated_by, updated_at)
       VALUES ('calendar','カレンダー','','on',1,15,'NEW','all','[]',100,'','cal','fn:calendar','tools','seed',?1)`
    ).bind(nowIso()).run().catch(() => {});
    await env.DB.prepare(
      `INSERT OR IGNORE INTO feature_flags
       (key, display_name, description, state, visible_in_sidebar, sidebar_order,
        badge, audience, allowlist, percentage, notice, icon, path, section, updated_by, updated_at)
       VALUES ('help','ヘルプ','','on',1,30,'','all','[]',100,'','help','fn:help','foot','seed',?1)`
    ).bind(nowIso()).run().catch(() => {});

    for (const r of SEED_REASONS) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO admin_reason_categories (key, label, sort_order, active) VALUES (?1,?2,?3,1)`
      ).bind(r[0], r[1], r[2]).run().catch(() => {});
    }
    for (const l of SEED_LIMITS) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO rate_limit_config
         (key, display_name, value, unit, applies_to, default_value, group_key, updated_by, updated_at)
         VALUES (?1,?2,?3,?4,?5,?3,?6,'seed',?7)`
      ).bind(l[0], l[1], l[2], l[3], l[4], l[5], nowIso()).run().catch(() => {});
    }
    for (const p of SEED_PROVIDER_LIMITS) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO provider_limit_config
         (key, provider, model, rpm, tpm, rpd, keys, note, updated_by, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'seed',?9)`
      ).bind(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], nowIso()).run().catch(() => {});
    }
    /* 最初の owner。**環境変数で 1 人だけ**作る。以後は招待。 */
    const boot = S(env.ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
    if (boot) {
      const has = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM admins WHERE role='owner' AND status='active'`).first().catch(() => null);
      if (!N(has?.n)) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO admins (admin_id, email, display_name, role, created_at, status)
           VALUES (?1,?2,?3,'owner',?4,'active')`
        ).bind("adm_boot_" + (await sha256Hex(boot)).slice(0, 12), boot, "Owner", nowIso())
          .run().catch(() => {});
      }
    }
    _adminSchemaDone = true;
  })();
  try { await _adminSchemaPromise; }
  finally { _adminSchemaPromise = null; }
}

/* ══ 4. 権限の判定 ═══════════════════════════════════════════════════════ */

async function permissionsOf(env, adm) {
  if (!adm) return [];
  const custom = S(adm.custom_permissions).trim();
  if (custom) {
    try {
      const a = JSON.parse(custom);
      if (Array.isArray(a) && a.length) return a.filter((p) => ADMIN_PERMISSIONS.includes(S(p)));
    } catch (e) {}
  }
  const role = S(adm.role);
  if (ADMIN_ROLE_PERMISSIONS[role]) return ADMIN_ROLE_PERMISSIONS[role].slice();
  /* カスタムロール */
  const row = await env.DB.prepare(
    `SELECT permissions FROM admin_custom_roles WHERE role_key = ?1`).bind(role).first().catch(() => null);
  if (row) {
    try {
      const a = JSON.parse(S(row.permissions) || "[]");
      if (Array.isArray(a)) return a.filter((p) => ADMIN_PERMISSIONS.includes(S(p)));
    } catch (e) {}
  }
  return [];
}

/* ══ 5. セッション ═══════════════════════════════════════════════════════ */

async function resolveAdminSession(request, env) {
  const token = cookieValue(request, "vqadm");
  if (!token) return null;
  const h = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.session_id, s.admin_id, s.expires_at, s.reauth_at, s.totp_ok,
            a.email, a.display_name, a.role, a.custom_permissions, a.status,
            a.totp_enabled, a.totp_secret, a.pass_hash, a.pass_salt, a.pass_iter
       FROM admin_sessions s JOIN admins a ON a.admin_id = s.admin_id
      WHERE s.token_hash = ?1 LIMIT 1`).bind(h).first().catch(() => null);
  if (!row) return null;
  if (S(row.status) !== "active") return null;
  if (new Date(S(row.expires_at) || 0).getTime() < nowMs()) return null;
  /* admin 以上は TOTP 必須。通していない間は「入っていない」扱い。 */
  const needTotp = S(row.role) === "owner" || S(row.role) === "admin";
  const perms = await permissionsOf(env, row);
  return {
    sessionId: S(row.session_id),
    adminId: S(row.admin_id),
    email: S(row.email),
    displayName: S(row.display_name),
    role: S(row.role),
    perms,
    totpEnabled: !!N(row.totp_enabled),
    totpSecret: S(row.totp_secret),
    totpOk: !!N(row.totp_ok),
    needTotp,
    passHash: S(row.pass_hash),
    passSalt: S(row.pass_salt),
    passIter: N(row.pass_iter, PBKDF2_ITER),
    reauthAt: S(row.reauth_at),
    fresh: new Date(S(row.reauth_at) || 0).getTime() > nowMs() - REAUTH_WINDOW_MS
  };
}

function has(adm, perm) { return !!adm && adm.perms.indexOf(perm) >= 0; }

/* ══ 6. 監査ログ ═════════════════════════════════════════════════════════ */

async function audit(env, adm, o) {
  const rec = {
    id: uuid(),
    admin_id: S(adm?.adminId),
    admin_email: S(adm?.email),
    action: S(o.action),
    target_type: S(o.targetType),
    target_id: S(o.targetId),
    reason: S(o.reason).slice(0, 2000),
    before: o.before === undefined ? "" : JSON.stringify(o.before).slice(0, 4000),
    after: o.after === undefined ? "" : JSON.stringify(o.after).slice(0, 4000),
    ip: S(o.ip),
    created_at: nowIso()
  };
  await env.DB.prepare(
    `INSERT INTO audit_log (id, admin_id, admin_email, action, target_type, target_id,
       reason, before, after, ip, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
  ).bind(rec.id, rec.admin_id, rec.admin_email, rec.action, rec.target_type, rec.target_id,
    rec.reason, rec.before, rec.after, rec.ip, rec.created_at).run();
  return rec.id;
}

async function accessLog(env, adm, request, path, status) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_access_log (id, admin_id, method, path, status, ip, user_agent, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(uuid(), S(adm?.adminId), S(request.method), S(path), N(status),
      clientIp(request), clientUa(request), nowIso()).run();
  } catch (e) {}
}

/* ══ 7. フラグの評価 ═════════════════════════════════════════════════════
   ★ 出し分けの判定を **1 か所**に集める。画面もサーバもここを見る。
     ばらばらに書くと、画面では消えているのに API は通る、が起きる。 */
let _flagCache = { at: 0, rows: null };

async function loadFlags(env) {
  if (_flagCache.rows && nowMs() - _flagCache.at < FLAG_CACHE_MS) return _flagCache.rows;
  const r = await env.DB.prepare(
    `SELECT * FROM feature_flags ORDER BY section, sidebar_order, key`).all().catch(() => null);
  const rows = (r && r.results) || [];
  _flagCache = { at: nowMs(), rows };
  return rows;
}
function invalidateFlagCache() { _flagCache = { at: 0, rows: null }; }

/* ユーザーIDのハッシュで **安定して** 割合を決める（毎回変わらない）。 */
async function stablePercent(userId, key) {
  const h = await sha256Hex(S(key) + ":" + S(userId));
  return parseInt(h.slice(0, 8), 16) % 100;
}

export async function evaluateFlag(env, flagRow, ctx) {
  const state = S(flagRow.state) || "on";
  const isAdmin = !!ctx?.isAdmin;
  if (state === "off") return { on: false, why: "off" };
  if (state === "internal" && !isAdmin) return { on: false, why: "internal" };
  const audience = S(flagRow.audience) || "all";
  const uid = S(ctx?.userId);
  if (audience === "allowlist") {
    let list = [];
    try { list = JSON.parse(S(flagRow.allowlist) || "[]"); } catch (e) { list = []; }
    if (!uid || !list.map(String).includes(uid)) return { on: false, why: "allowlist" };
  } else if (audience === "percentage") {
    const p = Math.max(0, Math.min(100, N(flagRow.percentage, 100)));
    if (p <= 0) return { on: false, why: "percentage" };
    if (p < 100) {
      if (!uid) return { on: false, why: "percentage" };
      if (await stablePercent(uid, S(flagRow.key)) >= p) return { on: false, why: "percentage" };
    }
  }
  return { on: true, why: state };
}

/* 画面へ渡す形。**中身は出さない**（フラグの説明文だけ）。 */
export async function effectiveFlags(env, ctx) {
  await ensureAdminSchema(env);
  const rows = await loadFlags(env);
  const out = [];
  for (const f of rows) {
    const v = await evaluateFlag(env, f, ctx);
    out.push({
      key: S(f.key),
      on: v.on,
      state: S(f.state),
      label: S(f.display_name),
      icon: S(f.icon),
      path: S(f.path),
      section: S(f.section) || "main",
      order: N(f.sidebar_order),
      sidebar: !!N(f.visible_in_sidebar) && v.on,
      badge: S(f.badge),
      notice: S(f.notice)
    });
  }
  out.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  return out;
}

/* ★ URL 直打ちの遮断。**サイドパネルから消すだけでは非表示にならない。**
   API のパス → フラグの対応。ここに載っている口は、フラグが off なら 403。 */
const PATH_FLAGS = [
  [/^\/api\/(quickmock|quick-mock|mock)\//i, "quick_mock"],
  [/^\/api\/wp\//i, "workplace"],
  [/^\/api\/workplace\//i, "workplace"],
  [/^\/api\/speak\//i, "vocabu_speak"],
  [/^\/api\/live\//i, "lumi_live"],
  [/^\/api\/lumi\//i, "lumi_live"],
  [/^\/api\/survival\//i, "survival"],
  [/^\/api\/survive\//i, "survive"],
  [/^\/api\/posts\//i, "feed"],
  [/^\/api\/dm\//i, "dm"],
  [/^\/api\/news\//i, "news"],
  [/^\/api\/insight/i, "insights"],
  [/^\/api\/qredit\//i, "qredit"]
];

export async function flagBlockResponse(env, path, ctx) {
  if (!env?.DB) return null;
  let key = "";
  for (const [re, k] of PATH_FLAGS) { if (re.test(path)) { key = k; break; } }
  if (!key) return null;
  try {
    await ensureAdminSchema(env);
    const rows = await loadFlags(env);
    const f = rows.find((x) => S(x.key) === key);
    if (!f) return null;
    const v = await evaluateFlag(env, f, ctx);
    if (v.on) return null;
    return jsonRes({
      ok: false, code: "FEATURE_DISABLED", feature: key,
      message: S(f.notice) || "この機能はいまご利用いただけません。"
    }, 403);
  } catch (e) { return null; }
}

/* ══ 7.5 本体へ効かせるための控え（2026-08-18）═══════════════════════════
   ★ なぜ要るか
     管理画面で上限を変えても、**本体が読んでいなければ何も変わらない**。
     実際そうなっていた（画面では保存できるのに、生成の上限は env のまま）。
     押せるが効かない設定は、効かない Ban と同じで嘘なので結線する。
   ★ どう繋ぐか
     本体の上限を決める関数（lumiUsagePolicy）は **同期**なので、
     そこから D1 を読むことはできない。だから
       ・API が来るたびに（8 秒の持ち回し付きで）まとめて読み込み
       ・本体からは **同期の getter** で引く
     という形にする。フラグと同じ考え方。 */
let _cfg = { at: 0, limits: {}, providers: {}, hidden: {} };
let _cfgLoading = null;

export async function refreshRuntimeConfig(env) {
  if (!env?.DB) return;
  if (nowMs() - _cfg.at < FLAG_CACHE_MS) return;
  if (_cfgLoading) return _cfgLoading;
  _cfgLoading = (async () => {
    try {
      const lim = await allRows(env, `SELECT key, value FROM rate_limit_config`);
      const prov = await allRows(env,
        `SELECT key, provider, model, rpm, tpm, rpd, keys, enforce FROM provider_limit_config`);
      const today = jstDay();
      const use = await allRows(env,
        `SELECT provider, SUM(requests) AS n FROM provider_usage_daily WHERE date_jst = ?1 GROUP BY provider`,
        [today]);
      const hid = await allRows(env, `SELECT target_type, target_id FROM content_hidden`);
      const L = {}, P = {}, H = {};
      lim.forEach((r) => { L[S(r.key)] = N(r.value); });
      const used = {};
      use.forEach((r) => { used[S(r.provider)] = N(r.n); });
      prov.forEach((r) => {
        const k = S(r.provider);
        P[k] = P[k] || { rpd: 0, keys: 1, enforce: 0, used: N(used[k]) };
        /* 同じ提供元に複数モデルがあるときは **いちばん大きい枠**を採る
           （モデルごとの内訳は画面で見る。ここは「止めるかどうか」だけ）。 */
        P[k].rpd = Math.max(P[k].rpd, N(r.rpd) * Math.max(1, N(r.keys, 1)));
        P[k].enforce = P[k].enforce || (N(r.enforce) ? 1 : 0);
      });
      hid.forEach((r) => { H[S(r.target_type) + ":" + S(r.target_id)] = 1; });
      _cfg = { at: nowMs(), limits: L, providers: P, hidden: H };
    } catch (e) { /* 読めなくても本体は止めない（既定値で動く） */ }
    finally { _cfgLoading = null; }
  })();
  return _cfgLoading;
}

/* ★ 「いま本体はどの値で動いているか」を **本体自身の関数から**もらう。
   ここで同じ計算をやり直すと、本体と食い違ったときに気付けない
   （画面が嘘をつく）。だから本体に計算させて、その結果だけ受け取る。 */
let _probe = null;
export function setRuntimeProbe(fn) { _probe = typeof fn === "function" ? fn : null; }

/* ══ お知らせを Feed へ（2026-08-20）════════════════════════════════
   訴え「NEWS が 更新されたら、マークダウンありで feed にも 投稿される」

   ★ ここでは **投稿しない**。本体（worker.js）が 持っている
     social_posts の 作りを、admin.js が 二重に 書くと 必ず ずれる。
     本体から 口を 差してもらい、ここは **呼ぶだけ**。
     （runtime probe と 同じ形。admin.js は worker.js を import できない） */
let _newsFeed = null;
export function setNewsFeedPublisher(fn) { _newsFeed = typeof fn === "function" ? fn : null; }

/* 画像・動画を あげる 口。中身は 本体（worker.js）が 持っている。
   ここで 書き写すと 上限も 置き場も 必ず ずれるので、差してもらう。 */
let _upload = null;
export function setAdminUploader(fn) { _upload = typeof fn === "function" ? fn : null; }

/* ★ 本体から呼ぶ。**同期**。まだ読み込めていなければ既定値を返す。 */
export function limitValue(key, fallback) {
  const v = _cfg.limits[S(key)];
  return v === undefined || v === null ? fallback : v;
}

/* 提供元を止めるか。**enforce が 1 のときだけ** 止める。 */
export function providerBlocked(provider) {
  const p = _cfg.providers[S(provider)];
  if (!p || !p.enforce || !(p.rpd > 0)) return false;
  return p.used >= p.rpd;
}

/* 非表示にされているか（公開の一覧・詳細から外すため） */
export function isHidden(targetType, targetId) {
  return !!_cfg.hidden[S(targetType) + ":" + S(targetId)];
}

/* AI を 1 回呼んだことを記録する。**画面の数字はここから来る。**
   失敗しても本体を止めない（記録は本業ではない）。 */
export async function noteProviderUse(env, provider, model, o) {
  o = o || {};
  if (!env?.DB || !S(provider)) return;
  const day = jstDay();
  const rate = o.status === 429 || o.rateLimited === true;
  const err = rate || (N(o.status, 200) >= 400) || o.ok === false;
  try {
    await env.DB.prepare(
      `INSERT INTO provider_usage_daily (date_jst, provider, model, requests, tokens_in, tokens_out, errors, rate_limited)
       VALUES (?1,?2,?3,1,?4,?5,?6,?7)
       ON CONFLICT(date_jst,provider,model) DO UPDATE SET
         requests = requests + 1,
         tokens_in = tokens_in + ?4, tokens_out = tokens_out + ?5,
         errors = errors + ?6, rate_limited = rate_limited + ?7`
    ).bind(day, S(provider), S(model) || "*", N(o.tokensIn), N(o.tokensOut),
      err ? 1 : 0, rate ? 1 : 0).run();
    /* 数えた分は控えにも足す（次の読み込みまで止め判定がずれないように） */
    const p = _cfg.providers[S(provider)];
    if (p) p.used = N(p.used) + 1;
    if (rate) {
      await env.DB.prepare(
        `INSERT INTO provider_limit_hits (id, provider, model, kind, started_at, minutes, detail)
         VALUES (?1,?2,?3,'rate_limited',?4,0,?5)`
      ).bind(uuid(), S(provider), S(model) || "*", nowIso(), S(o.detail).slice(0, 200)).run();
    }
  } catch (e) {}
}

/* ★ 本人へ知らせる（2026-08-18）。
   ★ もとは notified に 1 を書くだけで、**何も飛んでいなかった**。
     「本人に通知する」に印を付けたのに届かないのは、
     押せるが効かないボタンと同じ。本体と同じ user_notifications へ入れる。
   ★ 理由の自由記述は入れない。**カテゴリだけ**にする。
     自由記述は運営の内部メモで、本人へそのまま見せる前提で書かれていない。 */
async function notifyUser(env, userId, o) {
  if (!env?.DB || !S(userId)) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO user_notifications (id, user_id, actor_user_id, type, title, body, ts, day_key, meta_json)
       VALUES (?1,?2,0,?3,?4,?5,?6,?7,?8)`
    ).bind(uuid(), N(userId), S(o.type) || "account", S(o.title), S(o.body),
      nowMs(), jstDay(), JSON.stringify(o.meta || {})).run();
    /* ★ 開いて いる 人には **その場で** 届ける（2026-09-05）。
       ここは 管理画面からの 知らせ（停止・再開・お知らせ）。
       worker.js の pushNotifyUser を 通らない ので、ここでも 押す。
       繋いで いない 人は 素通り（false が 返るだけ）。 */
    try {
      await 開いている人へ押す(env, N(userId), {
        type: "notify.new", at: nowMs(),
        title: S(o.title), body: S(o.body), tag: "adm:" + (S(o.type) || "account") + ":" + nowMs()
      });
    } catch (e) {}
    return true;
  } catch (e) { return false; }
}

/* ══ みんなへ 知らせる（2026-08-20）══════════════════════════════════
   訴え「ダッシュボードから、通知の方にも アップロードできるようにして。
   今は News だけだからさ」

   ★ 通知は **1 人 1 行**（本体が そう読む）。一気に 入れるので、
     まとめて（batch）・少しずつ（100 行ずつ）入れる。
   ★ **上限を 置く**。無限に 入れると D1 が 詰まる。
     入れた数を そのまま 返して、何人に 届いたかを 隠さない。
   ★ 同じ お知らせを 2 回 配信しても 増えないよう、
     id は お知らせの id から 決め打ち（news:<newsId>:<userId>）。 */
const 知らせの上限 = 20000;
async function みんなへ知らせる(env, o) {
  if (!env?.DB) return { 入れた: 0, 全体: 0 };
  /* ★ 絞り込み（2026-09-05）。無ければ これまでどおり 全員。 */
  const 絞 = o.絞り && o.絞り.sql ? o.絞り : null;
  const 引数 = [知らせの上限 + 1].concat(絞 ? (絞.引数 || []) : []);
  const rows = await allRows(env,
    `SELECT u.id AS id FROM users u
       LEFT JOIN user_status s ON s.user_id = CAST(u.id AS TEXT)
      WHERE COALESCE(s.state,'active') NOT IN ('deleted','purged')
        ${絞 ? "AND " + 絞.sql : ""}
      ORDER BY u.id LIMIT ?1`, 引数);
  const ids = rows.map((r) => N(r.id)).filter((x) => x > 0);
  const 全体 = ids.length;
  const 使う = ids.slice(0, 知らせの上限);
  const now = nowMs(), day = jstDay();
  const title = S(o.title).slice(0, 200);
  const body = S(o.body).slice(0, 600);
  const meta = JSON.stringify(o.meta || {});
  const 鍵 = S(o.key) || uuid();
  let 入れた = 0;
  for (let i = 0; i < 使う.length; i += 100) {
    const 束 = 使う.slice(i, i + 100).map((uid) => env.DB.prepare(
      `INSERT OR REPLACE INTO user_notifications
         (id, user_id, actor_user_id, type, title, body, ts, day_key, meta_json)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    ).bind(鍵 + ":" + uid, uid, N(o.actorUserId), S(o.type) || "news",
      title, body, now, day, meta));
    try { await env.DB.batch(束); 入れた += 束.length; }
    catch (e) {
      /* batch が 使えない 環境でも 落とさない。1 行ずつ 入れ直す。 */
      for (const st of 束) { try { await st.run(); 入れた += 1; } catch (e2) {} }
    }
  }
  /* ★ 開いて いる 人には **その場で** 届ける（2026-09-05）。
     繋いで いない 人は 素通り（false が 返るだけ）。
     20 人ずつ。一度に 全部 投げると 詰まる。 */
  try {
    const msg = {
      type: "notify.new", at: now,
      title, body, tag: 鍵
    };
    for (let i = 0; i < 使う.length; i += 20) {
      await Promise.all(使う.slice(i, i + 20).map((uid) =>
        開いている人へ押す(env, uid, msg).catch(() => false)));
    }
  } catch (e) {}
  return { 入れた, 全体 };
}

/* ══ 8. 利用者の状態（Ban を **実際に効かせる**）═════════════════════════ */

export async function userStatusBlock(env, userId, path, method) {
  if (!env?.DB || !S(userId)) return null;
  let row = null;
  try {
    row = await env.DB.prepare(
      `SELECT state, scope, reason_category, reason_text, suspend_until
         FROM user_status WHERE user_id = ?1`).bind(S(userId)).first();
  } catch (e) { return null; }
  if (!row) return null;
  const state = S(row.state);
  if (state === "active") return null;
  /* 期限つきの一時停止は、期限が過ぎたら **自動で戻す** */
  const until = S(row.suspend_until);
  if (state === "suspended" && until && new Date(until).getTime() < nowMs()) {
    await env.DB.prepare(
      `UPDATE user_status SET state='active', scope='', suspend_until='', changed_at=?2
         WHERE user_id = ?1`).bind(S(userId), nowIso()).run().catch(() => {});
    return null;
  }
  /* 自分の状態を知る口だけは通す（何が起きたか見えないと直せない） */
  if (path === "/api/auth/me" || path === "/api/user/notifications") return null;

  if (state === "banned" || state === "deleted") {
    return jsonRes({
      ok: false, code: "ACCOUNT_BANNED",
      message: "このアカウントはご利用いただけません。",
      reason: S(row.reason_category)
    }, 423);
  }
  const scope = S(row.scope) || "login_blocked";
  if (scope === "login_blocked") {
    return jsonRes({ ok: false, code: "ACCOUNT_SUSPENDED",
      message: "このアカウントは一時的に停止されています。", until }, 423);
  }
  if (scope === "generation_blocked" && /^\/api\/(ai|aigen|gen|quickmock|preset)/i.test(path)) {
    return jsonRes({ ok: false, code: "GENERATION_SUSPENDED",
      message: "生成のご利用を一時的に停止しています。", until }, 423);
  }
  if (scope === "publish_blocked" && /^\/api\/(posts|public|share)/i.test(path)
      && S(method).toUpperCase() !== "GET") {
    return jsonRes({ ok: false, code: "PUBLISH_SUSPENDED",
      message: "公開のご利用を一時的に停止しています。", until }, 423);
  }
  return null;
}

/* ══ 9. 集計（既存の表から **実データ**で作る）══════════════════════════
   ★ 指示書のロールアップ表は、書き手がいないと 0 のままになる。
     0 と「まだ記録していない」は別物なので、
     **既にある表（ai_jobs / ai_quota / live_sessions / users …）**から
     組み立てて、ロールアップ表へ書き戻す。 */

async function allRows(env, sql, binds) {
  try {
    const st = env.DB.prepare(sql);
    const r = await (binds && binds.length ? st.bind(...binds) : st).all();
    return (r && r.results) || [];
  } catch (e) { return []; }
}
async function oneRow(env, sql, binds) {
  try {
    const st = env.DB.prepare(sql);
    return await (binds && binds.length ? st.bind(...binds) : st).first();
  } catch (e) { return null; }
}
/* 表がそもそも無い環境で 0 と言い切らないため、存在を見てから数える。 */
async function tableExists(env, name) {
  const r = await oneRow(env,
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?1`, [S(name)]);
  return !!r;
}

async function rollupFromLiveTables(env, days = 30) {
  const since = Date.now() - days * 86400000;
  const out = { provider: 0, generation: 0, errors: 0, lumi: 0 };
  if (await tableExists(env, "ai_jobs")) {
    /* 提供元ごと・日ごと */
    const rows = await allRows(env,
      `SELECT date(created_at/1000, 'unixepoch', '+9 hours') AS d,
              COALESCE(NULLIF(executor,''),'unknown') AS provider,
              COUNT(*) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS toi,
              SUM(CASE WHEN status='failed' OR error_code<>'' THEN 1 ELSE 0 END) AS err,
              SUM(CASE WHEN error_code LIKE '%RATE%' OR error_code LIKE '%429%' THEN 1 ELSE 0 END) AS rl
         FROM ai_jobs WHERE created_at >= ?1 GROUP BY d, provider`, [since]);
    for (const r of rows) {
      await env.DB.prepare(
        `INSERT INTO provider_usage_daily (date_jst, provider, model, requests, tokens_in, tokens_out, errors, rate_limited)
         VALUES (?1,?2,'*',?3,?4,?5,?6,?7)
         ON CONFLICT(date_jst,provider,model) DO UPDATE SET
           requests=excluded.requests, tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out,
           errors=excluded.errors, rate_limited=excluded.rate_limited`
      ).bind(S(r.d), S(r.provider), N(r.n), N(r.ti), N(r.toi), N(r.err), N(r.rl)).run().catch(() => {});
      out.provider++;
    }
    /* 機能ごと・提供元ごとの成否 */
    const g = await allRows(env,
      `SELECT date(created_at/1000,'unixepoch','+9 hours') AS d,
              COALESCE(NULLIF(type,''),'other') AS feature,
              COALESCE(NULLIF(executor,''),'unknown') AS provider,
              COUNT(*) AS total,
              SUM(CASE WHEN status='done' AND error_code='' THEN 1 ELSE 0 END) AS pub,
              SUM(CASE WHEN status='done' AND retry_count > 0 THEN 1 ELSE 0 END) AS rep,
              SUM(CASE WHEN status<>'done' THEN 1 ELSE 0 END) AS un
         FROM ai_jobs WHERE created_at >= ?1 GROUP BY d, feature, provider`, [since]);
    for (const r of g) {
      await env.DB.prepare(
        `INSERT INTO generation_daily (date_jst, feature, provider, total, publishable, repaired, unresolved)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(date_jst,feature,provider) DO UPDATE SET
           total=excluded.total, publishable=excluded.publishable,
           repaired=excluded.repaired, unresolved=excluded.unresolved`
      ).bind(S(r.d), S(r.feature), S(r.provider), N(r.total), N(r.pub), N(r.rep), N(r.un))
        .run().catch(() => {});
      out.generation++;
    }
    /* 検証エラーの内訳 */
    const e = await allRows(env,
      `SELECT date(created_at/1000,'unixepoch','+9 hours') AS d,
              COALESCE(NULLIF(type,''),'other') AS feature,
              COALESCE(NULLIF(error_code,''),'(none)') AS code, COUNT(*) AS n
         FROM ai_jobs WHERE created_at >= ?1 AND error_code <> '' GROUP BY d, feature, code`, [since]);
    for (const r of e) {
      await env.DB.prepare(
        `INSERT INTO validation_error_daily (date_jst, feature, error_code, count)
         VALUES (?1,?2,?3,?4)
         ON CONFLICT(date_jst,feature,error_code) DO UPDATE SET count=excluded.count`
      ).bind(S(r.d), S(r.feature), S(r.code), N(r.n)).run().catch(() => {});
      out.errors++;
    }
  }
  if (await tableExists(env, "live_sessions")) {
    const rows = await allRows(env,
      `SELECT day AS d, SUM(n) AS sessions FROM live_sessions GROUP BY day ORDER BY day DESC LIMIT ?1`, [days]);
    for (const r of rows) {
      await env.DB.prepare(
        `INSERT INTO lumi_session_daily (date_jst, sessions) VALUES (?1,?2)
         ON CONFLICT(date_jst) DO UPDATE SET sessions=excluded.sessions`
      ).bind(S(r.d), N(r.sessions)).run().catch(() => {});
      out.lumi++;
    }
  }
  return out;
}

/* ══ 10. 各画面の中身 ════════════════════════════════════════════════════ */

async function screenDashboard(env) {
  const today = jstDay();
  const warn = [];

  /* 提供元の到達率 */
  const limits = await allRows(env, `SELECT * FROM provider_limit_config`);
  const usage = await allRows(env,
    `SELECT provider, SUM(requests) AS req, SUM(tokens_in+tokens_out) AS tok, SUM(errors) AS err
       FROM provider_usage_daily WHERE date_jst = ?1 GROUP BY provider`, [today]);
  const byProv = {};
  for (const u of usage) byProv[S(u.provider)] = u;
  const providers = [];
  for (const l of limits) {
    const u = byProv[S(l.provider)] || {};
    const rpd = N(l.rpd) * Math.max(1, N(l.keys, 1));
    const req = N(u.req);
    const pct = rpd > 0 ? Math.round((req / rpd) * 100) : null;
    providers.push({
      key: S(l.key), provider: S(l.provider), model: S(l.model),
      requests: req, rpdLimit: rpd, percent: pct, errors: N(u.err),
      note: S(l.note)
    });
    if (pct !== null && pct >= 95) warn.push({ level: "high", text: `${l.provider} が上限の ${pct}% に達しています` });
    else if (pct !== null && pct >= 80) warn.push({ level: "warn", text: `${l.provider} が上限の ${pct}% です` });
  }

  /* ★ 上限表と 本番の **ズレ**（2026-08-20）。
     ここに 出さないと 誰も 気づかない。実際に 半月 気づかなかった。 */
  {
    let rt = null;
    try { rt = _probe ? _probe(env) : null; } catch (e) { rt = null; }
    const く = 実際とくらべる(rt, limits);
    for (const z of く.ズレ.slice(0, 6)) {
      warn.push({ level: z.種 === "QuickChat の 提供元" || z.種 === "鍵の 借用" ? "warn" : "info",
        text: "設定のズレ: " + z.文 });
    }
    if (く.ズレ.length > 6) {
      warn.push({ level: "info", text: `設定のズレが ほかに ${く.ズレ.length - 6} 件（提供元の画面で 見られます）` });
    }
  }

  /* 未対応の通報 */
  const rep = await oneRow(env, `SELECT COUNT(*) AS n FROM content_reports WHERE state='open'`);
  if (N(rep?.n) > 0) warn.push({ level: "warn", text: `未対応の通報が ${N(rep.n)} 件あります` });

  /* off のフラグ */
  const offFlags = await allRows(env, `SELECT key, display_name FROM feature_flags WHERE state='off'`);
  for (const f of offFlags) warn.push({ level: "info", text: `機能フラグ「${S(f.display_name) || S(f.key)}」が off です` });

  /* 未完成のまま出た生成 */
  const un = await oneRow(env,
    `SELECT SUM(unresolved) AS n, SUM(total) AS t FROM generation_daily WHERE date_jst = ?1`, [today]);
  if (N(un?.t) > 0 && N(un?.n) / N(un.t) > 0.1) {
    warn.push({ level: "warn", text: `未完成のまま出力された生成が ${N(un.n)} 件（${Math.round(N(un.n) / N(un.t) * 100)}%）` });
  }

  /* 今日の数値。**実データがある表だけ**から取る。 */
  const dayStart = new Date(today + "T00:00:00+09:00").getTime();
  const newUsers = await oneRow(env, `SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1`, [dayStart]);
  const activeUsers = await oneRow(env, `SELECT COUNT(*) AS n FROM users WHERE last_login_at >= ?1`, [dayStart]);
  const gen = await oneRow(env, `SELECT SUM(total) AS n FROM generation_daily WHERE date_jst = ?1`, [today]);
  const lumi = await oneRow(env, `SELECT sessions FROM lumi_session_daily WHERE date_jst = ?1`, [today]);

  const audit = await allRows(env,
    `SELECT id, admin_email, action, target_type, target_id, reason, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT 10`);

  const quality = await allRows(env,
    `SELECT provider, SUM(total) AS total, SUM(publishable) AS pub, SUM(unresolved) AS un
       FROM generation_daily WHERE date_jst >= ?1 GROUP BY provider`, [jstDayAgo(7)]);

  return {
    date: today,
    warnings: warn,
    today: {
      activeUsers: N(activeUsers?.n),
      newUsers: N(newUsers?.n),
      generations: gen?.n === null || gen?.n === undefined ? null : N(gen.n),
      lumiSessions: lumi?.sessions === undefined ? null : N(lumi.sessions)
    },
    providers,
    quality,
    audit
  };
}

async function screenUsers(env, url) {
  const q = S(url.searchParams.get("q")).trim();
  const state = S(url.searchParams.get("state")).trim();
  const sort = S(url.searchParams.get("sort")) || "created";
  const page = Math.max(1, N(url.searchParams.get("page"), 1));
  const per = Math.min(100, Math.max(10, N(url.searchParams.get("per"), 25)));
  const sortSql = {
    created: "u.created_at DESC",
    login: "u.last_login_at DESC",
    gen: "genCount DESC",
    reports: "reportCount DESC"
  }[sort] || "u.created_at DESC";

  const where = [];
  const binds = [];
  if (q) {
    binds.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
    where.push(`(u.email LIKE ?${binds.length - 2} OR u.nickname LIKE ?${binds.length - 1} OR CAST(u.id AS TEXT) LIKE ?${binds.length})`);
  }
  if (state) { binds.push(state); where.push(`COALESCE(st.state,'active') = ?${binds.length}`); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const hasJobs = await tableExists(env, "ai_jobs");
  const genSel = hasJobs
    ? `(SELECT COUNT(*) FROM ai_jobs j WHERE j.user_id = u.id)`
    : `0`;
  const rows = await allRows(env,
    `SELECT u.id AS userId, u.nickname, u.grade_prefix, u.email, u.created_at, u.last_login_at,
            COALESCE(st.state,'active') AS state, COALESCE(st.reason_category,'') AS reasonCategory,
            COALESCE(st.suspend_until,'') AS suspendUntil, COALESCE(st.scope,'') AS scope,
            ${genSel} AS genCount,
            (SELECT COUNT(*) FROM content_reports r WHERE r.owner_id = CAST(u.id AS TEXT)) AS reportCount
       FROM users u LEFT JOIN user_status st ON st.user_id = CAST(u.id AS TEXT)
       ${whereSql} ORDER BY ${sortSql} LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`,
    binds.concat([per, (page - 1) * per]));
  const total = await oneRow(env,
    `SELECT COUNT(*) AS n FROM users u LEFT JOIN user_status st ON st.user_id = CAST(u.id AS TEXT) ${whereSql}`, binds);

  return {
    page, per, total: N(total?.n),
    /* ★ メールアドレスは **既定でマスク**。生の値は返さない。 */
    users: rows.map((r) => ({
      userId: S(r.userId),
      displayId: (S(r.grade_prefix) ? S(r.grade_prefix) + "-" : "") + S(r.nickname),
      emailMasked: maskEmail(r.email),
      hasEmail: !!S(r.email),
      createdAt: N(r.created_at), lastLoginAt: N(r.last_login_at),
      state: S(r.state), reasonCategory: S(r.reasonCategory),
      suspendUntil: S(r.suspendUntil), scope: S(r.scope),
      genCount: N(r.genCount), reportCount: N(r.reportCount)
    }))
  };
}

async function screenUserDetail(env, userId) {
  const u = await oneRow(env,
    `SELECT id, nickname, grade_prefix, email, created_at, last_login_at,
            email_verified_at, pin_set_at
       FROM users WHERE id = ?1`, [N(userId)]);
  if (!u) return null;
  const st = await oneRow(env, `SELECT * FROM user_status WHERE user_id = ?1`, [S(userId)]);
  const uidStr = S(userId);

  const jobs = (await tableExists(env, "ai_jobs")) ? await oneRow(env,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS d,
            SUM(CASE WHEN created_at >= ?3 THEN 1 ELSE 0 END) AS w
       FROM ai_jobs WHERE user_id = ?1`,
    [N(userId), Date.now() - 86400000, Date.now() - 7 * 86400000]) : null;

  const byType = (await tableExists(env, "ai_jobs")) ? await allRows(env,
    `SELECT COALESCE(NULLIF(type,''),'other') AS feature, COUNT(*) AS n
       FROM ai_jobs WHERE user_id = ?1 GROUP BY feature ORDER BY n DESC`, [N(userId)]) : [];

  const lumi = (await tableExists(env, "live_sessions")) ? await oneRow(env,
    `SELECT SUM(n) AS sessions FROM live_sessions WHERE user_id = ?1`, [uidStr]) : null;
  const lumiUsage = (await tableExists(env, "lumi_usage")) ? await oneRow(env,
    `SELECT daily_units, weekly_units, daily_reset_at, weekly_reset_at FROM lumi_usage WHERE user_id = ?1`,
    [uidStr]) : null;

  const presets = (await tableExists(env, "public_presets")) ? await oneRow(env,
    `SELECT COUNT(*) AS n FROM public_presets WHERE user_id = ?1 AND deleted_at = 0`, [N(userId)]) : null;
  const reports = await oneRow(env,
    `SELECT COUNT(*) AS n FROM content_reports WHERE owner_id = ?1`, [uidStr]);
  const storage = (await tableExists(env, "media_blob_meta")) ? await oneRow(env,
    `SELECT COUNT(*) AS files, SUM(size) AS bytes FROM media_blob_meta WHERE user_id = ?1`, [N(userId)]) : null;

  /* BYOK は **有無だけ**。鍵そのものは一切読まない。 */
  let byok = false;
  if (await tableExists(env, "user_settings")) {
    const s = await oneRow(env, `SELECT settings_json FROM user_settings WHERE user_id = ?1`, [N(userId)]);
    const raw = S(s?.settings_json);
    byok = /"(byok|apiKey|api_key|geminiKey|groqKey)"\s*:\s*"[^"]{8,}/i.test(raw);
  }

  const limits = await allRows(env, `SELECT key, display_name, value, unit FROM rate_limit_config WHERE group_key='generation'`);
  const badgeRow = (await tableExists(env, "user_badges"))
    ? await oneRow(env, `SELECT badge, note, granted_by, granted_at FROM user_badges WHERE user_id=?1`, [N(userId)])
    : null;

  return {
    userId: uidStr,
    badge: S(badgeRow?.badge),
    badgeNote: S(badgeRow?.note),
    badgeGrantedBy: S(badgeRow?.granted_by),
    badgeGrantedAt: N(badgeRow?.granted_at),
    displayId: (S(u.grade_prefix) ? S(u.grade_prefix) + "-" : "") + S(u.nickname),
    emailMasked: maskEmail(u.email),
    hasEmail: !!S(u.email),
    createdAt: N(u.created_at),
    lastLoginAt: N(u.last_login_at),
    authMethod: S(u.email) ? (N(u.email_verified_at) ? "メール（確認済み）" : "メール（未確認）") : "ID とパスワード",
    hasPin: N(u.pin_set_at) > 0,
    state: S(st?.state) || "active",
    reasonCategory: S(st?.reason_category),
    reasonText: S(st?.reason_text),
    suspendUntil: S(st?.suspend_until),
    scope: S(st?.scope),
    deletedAt: S(st?.deleted_at),
    generation: jobs ? { total: N(jobs.total), daily: N(jobs.d), weekly: N(jobs.w) } : null,
    byFeature: byType.map((r) => ({ feature: S(r.feature), count: N(r.n) })),
    lumi: {
      sessions: lumi?.sessions === undefined ? null : N(lumi.sessions),
      dailyUnits: lumiUsage ? N(lumiUsage.daily_units) : null,
      weeklyUnits: lumiUsage ? N(lumiUsage.weekly_units) : null
    },
    publicPresets: presets ? N(presets.n) : null,
    reportedCount: N(reports?.n),
    storage: storage ? { files: N(storage.files), bytes: N(storage.bytes) } : null,
    byokConfigured: byok,
    limits: limits.map((l) => ({ key: S(l.key), label: S(l.display_name), value: N(l.value), unit: S(l.unit) }))
  };
}

/* ══ 表と 本番の **ズレ**を 見つける（2026-08-20）════════════════════
   訴え「管理ダッシュボードと 今の本番を 同期させたい」。

   ★ 上限表（provider_limit_config）は 手で入れるもの。提供元が 決める
     RPM / TPM / RPD は 本体からは 読めないので、これは 表のままでよい。
   ★ ところが **どの提供元を・どのモデルで・鍵 何本で 動かしているか**は
     本体が 知っている。ここが 食い違うと、枠の 見積りが まるごと 狂う。
     実際に 食い違っていた（2026-08-20 実測）:
       表「Quick Chat の 主は Gemini」／ 本番 CHAT_PROVIDER = workers_ai
   ★ だから **勝手に 書き換えない**。名指しで ズレを 出し、
     直すかどうかは 人が 決める（手で入れた 運用値を 消さないため）。 */
function 実際とくらべる(runtime, limits) {
  const R = runtime && runtime.AIの実際;
  if (!R) return { 実際: null, ズレ: [] };
  const ズレ = [];
  const 行 = (limits || []).map((l) => ({
    key: S(l.key), provider: S(l.provider), model: S(l.model), keys: N(l.keys, 1)
  }));

  /* ① 使っているモデルと 鍵の本数を 提供元ごとに まとめる */
  const 使う = {};                       /* provider -> { models:Set, keys:number } */
  const 足す = (p, models, keys) => {
    const k = S(p);
    if (!使う[k]) 使う[k] = { models: new Set(), keys: 0 };
    (models || []).forEach((m) => { if (m) 使う[k].models.add(S(m)); });
    使う[k].keys = Math.max(使う[k].keys, N(keys));
  };
  const QC = R.QuickChat || {};
  足す(QC.提供元, QC.モデル, QC.鍵の本数);
  const G = R.生成 || {};
  for (const p of Object.keys(G)) 足す(p, G[p].モデル, G[p].鍵の本数);
  const L = R.音声会話 || {};
  足す("gemini", [L.モデル], L.鍵の本数);

  /* ② 本番で 使っているのに 表に 無いもの */
  for (const p of Object.keys(使う)) {
    for (const m of 使う[p].models) {
      const あった = 行.some((r) => r.provider === p && (r.model === m || r.model === "@cf/*"));
      if (!あった) ズレ.push({ 種: "表に無い", provider: p, model: m,
        文: `本番は ${p} の「${m}」を 使っているが、上限表に 行が 無い` });
    }
  }
  /* ③ 表にあるのに 本番では 使っていないもの
     ★ **知らない提供元は 何も 言わない**。ローカル Bridge のように
       Worker の 外で 動くものは ここからは 見えない。見えないものを
       「使っていない」と 言うと **嘘の 警告**になる。 */
  for (const r of 行) {
    if (r.model === "@cf/*") continue;                       /* まとめ行は 除く */
    if (!使う[r.provider]) continue;                          /* この口からは 見えない提供元 */
    if (!使う[r.provider].models.has(r.model)) {
      ズレ.push({ 種: "使っていない", provider: r.provider, model: r.model,
        文: `上限表に「${r.model}」が あるが、本番では 使っていない` });
    }
  }
  /* ④ 鍵の本数の 食い違い */
  for (const r of 行) {
    const 実 = 使う[r.provider] ? 使う[r.provider].keys : 0;
    if (!実) continue;
    if (N(r.keys, 1) !== 実) ズレ.push({ 種: "鍵の本数", provider: r.provider, model: r.model,
      表: N(r.keys, 1), 実際: 実,
      文: `${r.provider}: 表は ${N(r.keys, 1)} 鍵だが、本番は ${実} 鍵` });
  }
  /* ⑤ Quick Chat が どこで 動いているか（いちばん 見落としやすい） */
  if (QC.提供元 && QC.提供元 !== "gemini") {
    ズレ.push({ 種: "QuickChat の 提供元", provider: S(QC.提供元),
      文: `Quick Chat は いま **${QC.提供元}**で 動いている（Gemini では ない）` });
  }
  if (QC.生成の鍵を借りている) {
    ズレ.push({ 種: "鍵の 借用", provider: "gemini",
      文: "Quick Chat 専用の 鍵が 無く、生成（LUMI）の 鍵を 借りている。話しかけた ぶんだけ 生成の 枠が 減る" });
  }
  return { 実際: R, ズレ };
}

async function screenProviders(env) {
  const limits = await allRows(env, `SELECT * FROM provider_limit_config ORDER BY provider, model`);
  const today = jstDay();
  const daily = await allRows(env,
    `SELECT * FROM provider_usage_daily WHERE date_jst >= ?1 ORDER BY date_jst DESC`, [jstDayAgo(30)]);
  const hits = await allRows(env,
    `SELECT * FROM provider_limit_hits ORDER BY started_at DESC LIMIT 50`);
  const todayByProv = {};
  for (const d of daily) {
    if (S(d.date_jst) !== today) continue;
    const k = S(d.provider);
    todayByProv[k] = todayByProv[k] || { requests: 0, tokens: 0, errors: 0, rateLimited: 0 };
    todayByProv[k].requests += N(d.requests);
    todayByProv[k].tokens += N(d.tokens_in) + N(d.tokens_out);
    todayByProv[k].errors += N(d.errors);
    todayByProv[k].rateLimited += N(d.rate_limited);
  }
  /* ★ 「保存できた」ではなく「**本体が この設定で 動いている**」を 出す。 */
  let runtime = null;
  try { runtime = _probe ? _probe(env) : null; } catch (e) { runtime = null; }
  const くらべ = 実際とくらべる(runtime, limits);

  return {
    date: today,
    limits: limits.map((l) => ({
      key: S(l.key), provider: S(l.provider), model: S(l.model),
      rpm: N(l.rpm), tpm: N(l.tpm), rpd: N(l.rpd), keys: N(l.keys, 1), note: S(l.note),
      enforce: !!N(l.enforce),
      updatedBy: S(l.updated_by), updatedAt: S(l.updated_at)
    })),
    実際: くらべ.実際,
    ズレ: くらべ.ズレ,
    today: todayByProv,
    daily,
    hits,
    /* 運用上の判断を **画面に出す**（あとから見て理由が分かるように） */
    notes: [
      "Gemini Flash（無印）は無料枠 RPD 20 で即停止するため、Flash Lite に固定している。",
      "Groq の枠は「鍵 × モデル」ごとに別。6 鍵 × 7 モデルで 1 日およそ 1 万本（実測）。",
      "ここの上限値は D1（provider_limit_config）にある。提供元の仕様変更にはこの画面で追随する。",
      "今日の回数は AI を呼ぶたびに実時間で増える（日次の集計を待たない）。上限に当たったら「上限到達の履歴」に残る。",
      "「上限で止める」を入れた提供元だけ、上限に達した時点で実際に使わなくなる。既定は記録だけ。"
    ]
  };
}

async function screenLumi(env) {
  const daily = await allRows(env,
    `SELECT * FROM lumi_session_daily WHERE date_jst >= ?1 ORDER BY date_jst DESC`, [jstDayAgo(30)]);
  const limits = await allRows(env,
    `SELECT * FROM rate_limit_config ORDER BY group_key, key`);
  /* 時間帯ごとの同時本数。**公開後にいちばん最初に当たるのがここ。** */
  let peak = null;
  if (await tableExists(env, "live_sessions")) {
    const rows = await allRows(env,
      `SELECT day, SUM(n) AS n FROM live_sessions GROUP BY day ORDER BY day DESC LIMIT 30`);
    const max = rows.reduce((a, r) => Math.max(a, N(r.n)), 0);
    peak = { measure: "1 日あたりのセッション数の最大", value: max, days: rows.length,
             note: "時間帯ごとの同時本数は live_sessions に時刻が無いため出せない（下の未計測を参照）" };
  }
  return {
    daily, limits: limits.map((l) => ({
      key: S(l.key), label: S(l.display_name), value: N(l.value), unit: S(l.unit),
      appliesTo: S(l.applies_to), defaultValue: N(l.default_value), group: S(l.group_key),
      updatedBy: S(l.updated_by), updatedAt: S(l.updated_at)
    })),
    peak,
    unmeasured: [
      "平均・最長セッション長（live_sessions に開始・終了の時刻が無い）",
      "音声トークンの入出力（記録していない）",
      "ツール呼び出しの回数と失敗の内訳（記録していない）",
      "切断の内訳と応答遅延 p50 / p95（記録していない）",
      "時間帯別の同時セッション数（記録していない）"
    ]
  };
}

async function screenQuality(env, url) {
  const days = Math.min(90, Math.max(1, N(url.searchParams.get("days"), 30)));
  const since = jstDayAgo(days);
  const daily = await allRows(env,
    `SELECT * FROM generation_daily WHERE date_jst >= ?1 ORDER BY date_jst DESC`, [since]);
  const errors = await allRows(env,
    `SELECT error_code, feature, SUM(count) AS n FROM validation_error_daily
      WHERE date_jst >= ?1 GROUP BY error_code, feature ORDER BY n DESC LIMIT 60`, [since]);
  const byProvider = await allRows(env,
    `SELECT provider, SUM(total) AS total, SUM(publishable) AS publishable,
            SUM(repaired) AS repaired, SUM(unresolved) AS unresolved
       FROM generation_daily WHERE date_jst >= ?1 GROUP BY provider ORDER BY total DESC`, [since]);
  const byFeature = await allRows(env,
    `SELECT feature, SUM(total) AS total, SUM(publishable) AS publishable,
            SUM(repaired) AS repaired, SUM(unresolved) AS unresolved
       FROM generation_daily WHERE date_jst >= ?1 GROUP BY feature ORDER BY total DESC`, [since]);
  return { days, daily, errors, byProvider, byFeature };
}

async function screenStorage(env) {
  const hasMeta = await tableExists(env, "media_blob_meta");
  if (!hasMeta) return { available: false, reason: "media_blob_meta がまだありません" };
  const total = await oneRow(env, `SELECT COUNT(*) AS files, SUM(size) AS bytes FROM media_blob_meta`);
  const byType = await allRows(env,
    `SELECT CASE
        WHEN content_type LIKE 'audio/%' THEN '音声'
        WHEN content_type LIKE 'image/%' THEN '画像'
        WHEN content_type LIKE 'video/%' THEN '動画'
        WHEN content_type LIKE 'application/pdf' THEN '資料'
        ELSE 'その他' END AS kind,
        COUNT(*) AS files, SUM(size) AS bytes
       FROM media_blob_meta GROUP BY kind ORDER BY bytes DESC`);
  const topUsers = await allRows(env,
    `SELECT user_id, COUNT(*) AS files, SUM(size) AS bytes FROM media_blob_meta
      GROUP BY user_id ORDER BY bytes DESC LIMIT 50`);
  const old = await oneRow(env,
    `SELECT COUNT(*) AS files, SUM(size) AS bytes FROM media_blob_meta WHERE created_at < ?1`,
    [Date.now() - 180 * 86400000]);
  const capRow = await oneRow(env, `SELECT value FROM rate_limit_config WHERE key='storage.user.max_mb'`);
  const capBytes = N(capRow?.value) * 1024 * 1024;
  const over = topUsers.filter((u) => capBytes > 0 && N(u.bytes) > capBytes);
  return {
    available: true,
    total: { files: N(total?.files), bytes: N(total?.bytes) },
    byType, topUsers, over,
    stale: { files: N(old?.files), bytes: N(old?.bytes),
             note: "last_accessed_at を持っていないため、**作成日**が 180 日より古いもので数えている" },
    capMb: N(capRow?.value)
  };
}

async function screenContent(env, url) {
  const hasPresets = await tableExists(env, "public_presets");
  const presets = hasPresets ? await allRows(env,
    `SELECT p.user_id AS ownerId, p.preset_id AS presetId,
            p.public_title AS title, p.published_at AS publishedAt,
            (SELECT COUNT(*) FROM content_reports r WHERE r.target_id = p.preset_id) AS reports,
            (SELECT COUNT(*) FROM content_hidden h WHERE h.target_id = p.preset_id) AS hidden
       FROM public_presets p WHERE p.is_public = 1 AND p.deleted_at = 0
       ORDER BY p.published_at DESC LIMIT 200`) : [];
  const reports = await allRows(env,
    `SELECT * FROM content_reports ORDER BY (state='open') DESC, created_at DESC LIMIT 200`);
  const hidden = await allRows(env, `SELECT * FROM content_hidden ORDER BY hidden_at DESC LIMIT 200`);
  return {
    presets: presets.map((p) => ({
      ownerId: S(p.ownerId), presetId: S(p.presetId),
      /* ★ タイトルも「中身」に当たるので **出さない**。数だけ。 */
      publishedAt: N(p.publishedAt), reports: N(p.reports), hidden: N(p.hidden) > 0
    })),
    reports, hidden
  };
}

/* ══ 11. ルータ ══════════════════════════════════════════════════════════ */

async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

/* 壊す操作の共通の関所。**権限 → 再認証 → 理由** の順で確かめる。 */
function guard(adm, perm, opts) {
  if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
  if (adm.needTotp && !adm.totpEnabled) {
    return bad("TOTP_REQUIRED", "二要素認証の登録が必要です。", 403);
  }
  if (adm.needTotp && !adm.totpOk) {
    return bad("TOTP_REQUIRED", "二要素認証を通してください。", 403);
  }
  if (perm && !has(adm, perm)) {
    return bad("FORBIDDEN", "この操作の権限がありません（必要: " + perm + "）。", 403);
  }
  if (opts && opts.destructive && !adm.fresh) {
    return bad("REAUTH_REQUIRED", "この操作の前に、パスワードか二要素認証をもう一度入力してください。", 403);
  }
  if (opts && opts.reason !== undefined) {
    const cat = S(opts.reasonCategory).trim();
    const txt = S(opts.reason).trim();
    if (!cat || !txt) return bad("REASON_REQUIRED", "理由カテゴリと理由の記述は必須です。", 400);
  }
  return null;
}

export function isAdminPath(path) {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/");
}

export async function handleAdminRequest(request, env, ctx, 本体 = {}) {
  const url = new URL(request.url);
  const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
  if (!isAdminPath(path)) return null;
  /* ══ ここだけは 引き受けない（2026-09-03・実測で 見つけた）═════════
     アプリの お知らせ画面から 書く／消す 口は **本体（worker.js）**に
     あって、ADMIN_KEY（x-admin-key）で 見ている。
     ところが この 振り分けは /api/admin/* を **丸ごと** 取るので、
       ・独自ヘッダ X-VQ-Admin が 無い → その場で 403 CSRF
       ・付けても この中に news/save は 無い → 404
     となり、**本体の handleAdminNewsSavePost は 一度も 呼ばれていなかった**。
     ＝ お知らせ画面の「保存する」「消す」が ずっと 効いていなかった。
     ★ 管理ダッシュボードの お知らせ（announcements）は これまでどおり
       ここで 引き受ける。別の 口なので 混ざらない。 */
  if (path === "/api/admin/news/save" || path === "/api/admin/news/delete") return null;
  /* ★ 公式の 英単語プリセットを 配り直す 口も 同じ（2026-09-03）。
     ここで 引き受けると CSRF で 403、通しても route に 無いので 404 で、
     **一度も 呼べない 口**だった。本体側で ADMIN_KEY を 見る。 */
  if (path === "/api/admin/eiken-deliver") return null;
  if (!env?.DB) return bad("DB_NOT_CONFIGURED", "データベースが設定されていません。", 500);

  /* 画面（HTML）。中身は client/admin.html。
     ★ ここで **元のリクエストを引き継いではいけない**（2026-08-18・実測）。
       引き継ぐと Sec-Fetch-Mode: navigate も一緒に渡り、アセット側の
       not_found_handling = "single-page-application" が効いて
       **アプリ本体（12MB の index.html）が返ってきた**。
       curl では再現せず、ブラウザで開いたときだけ起きる。
       だからヘッダを持たない素の GET で取りに行く。 */
  if (!path.startsWith("/api/admin/")) {
    const res = await env.ASSETS.fetch(
      new Request(new URL("/admin.html", url.origin).toString(), { method: "GET" }));
    const h = new Headers(res.headers);
    h.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    h.set("Cache-Control", "no-store");
    h.set("Content-Type", "text/html; charset=utf-8");
    return new Response(res.body, { status: res.status, headers: h });
  }

  await ensureAdminSchema(env);
  /* ★ 管理の口は本体の入口より **手前で返している**ので、
     本体側で控えを温める処理を通らない（2026-08-18・実測）。
     そのため「いま本体はどの値で動いているか」を聞かれても
     控えが空で、env の既定値を返していた。ここでも読み込む。 */
  await refreshRuntimeConfig(env).catch(() => null);
  const method = S(request.method).toUpperCase();
  const sub = path.slice("/api/admin/".length);
  const ip = clientIp(request);

  /* CSRF よけ。書き込みは **独自ヘッダ**を必須にする
     （別のサイトからは、preflight 無しでこのヘッダを付けられない）。 */
  if (method !== "GET" && S(request.headers.get("X-VQ-Admin")) !== "1") {
    return bad("CSRF", "不正なリクエストです。", 403);
  }

  const adm = await resolveAdminSession(request, env);
  let res = null;
  try {
    res = await route(request, env, url, sub, method, adm, ip, 本体);
  } catch (e) {
    console.error("[admin]", S(e?.message));
    /* ★ 検証用 Worker では **理由をそのまま返す**（2026-08-18）。
       本番ホストでは返さない。「処理に失敗しました」だけだと、
       どこで転んだのか分からず、直しようがない。 */
    const devHost = /-dev\.|localhost|127\.0\.0\.1/.test(S(url.hostname));
    res = devHost
      ? jsonRes({ ok: false, code: "ADMIN_ERROR", message: "処理に失敗しました。", detail: S(e?.message).slice(0, 300) }, 500)
      : bad("ADMIN_ERROR", "処理に失敗しました。", 500);
  }
  if (!res) res = bad("NOT_FOUND", "その口はありません。", 404);
  /* 全アクセスの IP と UA を残す */
  if (ctx && ctx.waitUntil) ctx.waitUntil(accessLog(env, adm, request, path, res.status));
  else await accessLog(env, adm, request, path, res.status);
  return res;
}

async function route(request, env, url, sub, method, adm, ip, 本体 = {}) {
  /* ★ あげる（upload）だけは **中身を 読まない**（2026-08-20）。
     ここで request.json() を 呼ぶと、その時点で 中身の 流れを
     使い切ってしまい、画像・動画の **本体が 消える**。 */
  const 生のまま = method === "POST" && sub === "upload";
  const body = (method === "GET" || 生のまま) ? {} : await readJson(request);

  /* ── 認証 ─────────────────────────────────────────────────────────── */

  if (sub === "auth/login" && method === "POST") {
    const email = S(body.email).trim().toLowerCase();
    const pass = S(body.password);
    const key = "login:" + email + ":" + ip;
    const at = await oneRow(env, `SELECT failed, lock_until FROM admin_login_attempts WHERE key=?1`, [key]);
    if (N(at?.lock_until) > nowMs()) {
      return bad("LOCKED", "試行回数の上限です。しばらくしてからお試しください。", 429);
    }
    const a = await oneRow(env,
      `SELECT admin_id, email, role, pass_hash, pass_salt, pass_iter, totp_enabled, status
         FROM admins WHERE email = ?1`, [email]);
    const okPass = a && S(a.pass_hash)
      && safeEq(await pbkdf2Hex(pass, S(a.pass_salt), N(a.pass_iter, PBKDF2_ITER)), S(a.pass_hash));
    if (!a || S(a.status) !== "active" || !okPass) {
      const failed = N(at?.failed) + 1;
      await env.DB.prepare(
        `INSERT INTO admin_login_attempts (key, failed, lock_until, updated_at) VALUES (?1,?2,?3,?4)
         ON CONFLICT(key) DO UPDATE SET failed=?2, lock_until=?3, updated_at=?4`
      ).bind(key, failed, failed >= LOGIN_MAX_FAIL ? nowMs() + LOGIN_LOCK_MS : 0, nowMs()).run().catch(() => {});
      return bad("BAD_CREDENTIALS", "メールアドレスまたはパスワードが違います。", 401);
    }
    await env.DB.prepare(`DELETE FROM admin_login_attempts WHERE key=?1`).bind(key).run().catch(() => {});
    const token = randomHex(32);
    const sid = uuid();
    await env.DB.prepare(
      `INSERT INTO admin_sessions (session_id, token_hash, admin_id, created_at, expires_at, ip, user_agent, reauth_at, totp_ok)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    ).bind(sid, await sha256Hex(token), S(a.admin_id), nowIso(),
      new Date(nowMs() + SESSION_TTL_MS).toISOString(), ip, clientUa(request),
      nowIso(), N(a.totp_enabled) ? 0 : 1).run();
    await env.DB.prepare(`UPDATE admins SET last_login_at=?2 WHERE admin_id=?1`)
      .bind(S(a.admin_id), nowIso()).run().catch(() => {});
    await audit(env, { adminId: S(a.admin_id), email }, { action: "admin.login", targetType: "admin", targetId: S(a.admin_id), ip });
    return jsonRes({ ok: true, needTotp: !!N(a.totp_enabled), role: S(a.role) }, 200, {
      "Set-Cookie": `vqadm=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (sub === "auth/bootstrap" && method === "POST") {
    /* 最初の owner にパスワードを決めてもらう。**pass_hash が空のときだけ**通る。 */
    const email = S(body.email).trim().toLowerCase();
    const boot = S(env.ADMIN_BOOTSTRAP_EMAIL).trim().toLowerCase();
    const need = S(env.ADMIN_BOOTSTRAP_TOKEN);
    if (!boot || email !== boot) return bad("FORBIDDEN", "この操作はできません。", 403);
    if (need && !safeEq(S(body.setupToken), need)) return bad("FORBIDDEN", "設定用トークンが違います。", 403);
    const a = await oneRow(env, `SELECT admin_id, pass_hash FROM admins WHERE email=?1`, [email]);
    if (!a) return bad("NOT_FOUND", "初期 owner がまだ作られていません。", 404);
    if (S(a.pass_hash)) return bad("ALREADY_SET", "すでに設定済みです。", 409);
    const pass = S(body.password);
    if (pass.length < 12) return bad("WEAK_PASSWORD", "パスワードは 12 文字以上にしてください。", 400);
    const salt = randomHex(16);
    await env.DB.prepare(`UPDATE admins SET pass_hash=?2, pass_salt=?3, pass_iter=?4 WHERE admin_id=?1`)
      .bind(S(a.admin_id), await pbkdf2Hex(pass, salt, PBKDF2_ITER), salt, PBKDF2_ITER).run();
    await audit(env, { adminId: S(a.admin_id), email }, { action: "admin.bootstrap", targetType: "admin", targetId: S(a.admin_id), ip });
    return ok({});
  }

  if (sub === "auth/me" && method === "GET") {
    if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
    return ok({
      admin: {
        adminId: adm.adminId, email: adm.email, displayName: adm.displayName,
        role: adm.role, permissions: adm.perms,
        totpEnabled: adm.totpEnabled, totpOk: adm.totpOk, needTotp: adm.needTotp,
        reauthFresh: adm.fresh
      },
      allPermissions: ADMIN_PERMISSIONS,
      rolePermissions: ADMIN_ROLE_PERMISSIONS
    });
  }

  if (sub === "auth/logout" && method === "POST") {
    if (adm) await env.DB.prepare(`DELETE FROM admin_sessions WHERE session_id=?1`)
      .bind(adm.sessionId).run().catch(() => {});
    return jsonRes({ ok: true }, 200, {
      "Set-Cookie": "vqadm=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    });
  }

  if (sub === "auth/totp/setup" && method === "POST") {
    if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
    if (adm.totpEnabled) return bad("ALREADY_SET", "すでに登録済みです。", 409);
    /* ★★ **すでに 出してある鍵は 出し直さない**（2026-08-20）。
       もとは この口を 呼ぶたび **新しい鍵**を 作って 上書きしていた。
       登録の 途中で 画面を 読み直すと、認証アプリに 入れた鍵は
       **もう 使えない鍵**になり、6 桁を 入れても 通らない。
       原因が 画面から 分からないので、詰まると 抜け出せない。
       まだ 有効にしていない 鍵は そのまま 返す。 */
    let secret = S(adm.totpSecret);
    if (!secret) {
      const b = new Uint8Array(20);
      crypto.getRandomValues(b);
      secret = base32Encode(b);
      await env.DB.prepare(`UPDATE admins SET totp_secret=?2 WHERE admin_id=?1`)
        .bind(adm.adminId, secret).run();
    }
    const label = encodeURIComponent("VocabuQuiz Admin:" + adm.email);
    return ok({ secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=VocabuQuiz&digits=6&period=30` });
  }

  if (sub === "auth/totp/enable" && method === "POST") {
    if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
    if (!await totpVerify(adm.totpSecret, body.code)) return bad("BAD_CODE", "コードが違います。", 400);
    await env.DB.prepare(`UPDATE admins SET totp_enabled=1 WHERE admin_id=?1`).bind(adm.adminId).run();
    await env.DB.prepare(`UPDATE admin_sessions SET totp_ok=1, reauth_at=?2 WHERE session_id=?1`)
      .bind(adm.sessionId, nowIso()).run();
    await audit(env, adm, { action: "admin.totp.enable", targetType: "admin", targetId: adm.adminId, ip });
    return ok({});
  }

  if (sub === "auth/totp/verify" && method === "POST") {
    if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
    if (!await totpVerify(adm.totpSecret, body.code)) return bad("BAD_CODE", "コードが違います。", 400);
    await env.DB.prepare(`UPDATE admin_sessions SET totp_ok=1, reauth_at=?2 WHERE session_id=?1`)
      .bind(adm.sessionId, nowIso()).run();
    return ok({});
  }

  if (sub === "auth/reauth" && method === "POST") {
    if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);
    let good = false;
    if (S(body.code)) good = await totpVerify(adm.totpSecret, body.code);
    else if (S(body.password) && adm.passHash) {
      good = safeEq(await pbkdf2Hex(S(body.password), adm.passSalt, adm.passIter), adm.passHash);
    }
    if (!good) return bad("BAD_CREDENTIALS", "確認できませんでした。", 401);
    await env.DB.prepare(`UPDATE admin_sessions SET reauth_at=?2 WHERE session_id=?1`)
      .bind(adm.sessionId, nowIso()).run();
    return ok({ until: new Date(nowMs() + REAUTH_WINDOW_MS).toISOString() });
  }

  /* 招待の受諾は **ログイン前**に通る（トークンが本人証明） */
  if (sub === "invites/accept" && method === "POST") {
    const token = S(body.token);
    if (!token) return bad("BAD_REQUEST", "トークンがありません。", 400);
    const h = await sha256Hex(token);
    const inv = await oneRow(env,
      `SELECT * FROM admin_invites WHERE token_hash=?1`, [h]);
    if (!inv) return bad("NOT_FOUND", "招待が見つかりません。", 404);
    if (S(inv.accepted_at)) return bad("USED", "この招待は使用済みです。", 409);
    if (S(inv.revoked_at)) return bad("REVOKED", "この招待は取り消されています。", 409);
    if (new Date(S(inv.expires_at)).getTime() < nowMs()) return bad("EXPIRED", "招待の期限が切れています。", 410);
    const pass = S(body.password);
    if (pass.length < 12) return bad("WEAK_PASSWORD", "パスワードは 12 文字以上にしてください。", 400);
    const salt = randomHex(16);
    const adminId = "adm_" + randomHex(8);
    await env.DB.prepare(
      `INSERT INTO admins (admin_id, email, display_name, role, pass_hash, pass_salt, pass_iter, created_at, status)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active')`
    ).bind(adminId, S(inv.email), S(body.displayName) || S(inv.email).split("@")[0],
      S(inv.role), await pbkdf2Hex(pass, salt, PBKDF2_ITER), salt, PBKDF2_ITER, nowIso()).run();
    await env.DB.prepare(`UPDATE admin_invites SET accepted_at=?2 WHERE invite_id=?1`)
      .bind(S(inv.invite_id), nowIso()).run();
    await audit(env, { adminId, email: S(inv.email) },
      { action: "admin.invite.accept", targetType: "admin", targetId: adminId, ip, after: { role: S(inv.role) } });
    return ok({ adminId });
  }

  /* ここから先は **必ず** セッションが要る */
  if (!adm) return bad("ADMIN_UNAUTHORIZED", "ログインしてください。", 401);

  /* ── ダッシュボード ─────────────────────────────────────────────── */
  if (sub === "dashboard" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    return ok({ data: await screenDashboard(env) });
  }
  if (sub === "rollup" && method === "POST") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    const r = await rollupFromLiveTables(env, N(body.days, 30));
    return ok({ rolled: r });
  }

  /* ── ユーザー ────────────────────────────────────────────────────── */
  if (sub === "users" && method === "GET") {
    const g = guard(adm, "users.view"); if (g) return g;
    return ok({ data: await screenUsers(env, url) });
  }
  let m;
  /* いまの 残高と プランを 読む（画面が 開いた ときに 出す） */
  if ((m = /^users\/([^/]+)\/qredit-now$/.exec(sub)) && method === "GET") {
    const g = guard(adm, "users.qredit"); if (g) return g;
    const uid = N(m[1]);
    const bal = 本体.qreditLoadBalanceRow ? await 本体.qreditLoadBalanceRow(env, uid).catch(() => null) : null;
    const sub2 = await oneRow(env,
      `SELECT plan_name, status, renews_at FROM user_subscription_state WHERE user_id=?1`, [uid]);
    return ok({ 残高: N(bal?.balance), plan: S(sub2?.plan_name) || "free",
      状態: S(sub2?.status), 期限: N(sub2?.renews_at) });
  }

  /* ══ Qredit を 手で 動かす（2026-09-05）══════════════════════════
     訴え「Admin で できる ことを 増やしたい」→「Qredit ・ サブスクの 手動操作」。
     ★ 残高の 動かしかたは **本体の qreditGrant / qreditSpend** を 借りる。
       ここで 直に UPDATE すると 台帳（qredit_ledger）と 食い違う。
     ★ 理由 必須・再認証 必須・監査ログ。人の 持ちものを 動かす ので。 */
  if ((m = /^users\/([^/]+)\/qredit$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "users.qredit", {
      destructive: true, reason: S(body.reasonText), reasonCategory: S(body.reasonCategory) || "other"
    });
    if (g) return g;
    if (!本体.qreditGrant || !本体.qreditSpend) {
      return bad("NOT_WIRED", "Qredit の 口が つながって いません。", 500);
    }
    const uid = N(m[1]);
    const いる = await oneRow(env, `SELECT id FROM users WHERE id=?1`, [uid]);
    if (!いる) return bad("NOT_FOUND", "その 人は いません。", 404);
    const 向き = S(body.direction) === "revoke" ? "revoke" : "grant";
    const 量 = Math.max(1, Math.min(1000000, N(body.amount)));
    if (!量) return bad("BAD_REQUEST", "いくつ 動かすかを 入れて ください。", 400);
    const 鍵 = "adm:qredit:" + adm.adminId + ":" + uuid();
    const 前 = 本体.qreditLoadBalanceRow ? await 本体.qreditLoadBalanceRow(env, uid).catch(() => null) : null;
    const r = 向き === "grant"
      ? await 本体.qreditGrant(env, { userId: uid, amount: 量, type: "admin_grant",
          reasonCode: "admin", idempotencyKey: 鍵, createdBy: adm.adminId,
          meta: { by: adm.adminId, reason: S(body.reasonText) } })
      : await 本体.qreditSpend(env, { userId: uid, amount: 量, type: "admin_revoke",
          reasonCode: "admin", idempotencyKey: 鍵, createdBy: adm.adminId,
          meta: { by: adm.adminId, reason: S(body.reasonText) } });
    if (!r || !r.ok) {
      return bad(S(r?.code) || "QREDIT_FAILED",
        向き === "revoke" ? "回収できません（残高が 足りない かも しれません）。" : "付与できません。", 400);
    }
    const 後 = 本体.qreditLoadBalanceRow ? await 本体.qreditLoadBalanceRow(env, uid).catch(() => null) : null;
    await audit(env, adm, { action: "users.qredit." + 向き, targetType: "user", targetId: String(uid),
      reason: (S(body.reasonCategory) || "other") + " / " + S(body.reasonText),
      before: { balance: N(前?.balance) }, after: { balance: N(後?.balance), amount: 量 }, ip });
    /* 本人にも 知らせる（黙って 増やしたり 減らしたり しない）。 */
    await notifyUser(env, uid, {
      type: "qredit",
      title: 向き === "grant" ? "Qredit が 追加されました" : "Qredit が 調整されました",
      body: (向き === "grant" ? "+" : "−") + 量 + " Qredit"
        + (S(body.reasonText) ? "（" + S(body.reasonText) + "）" : ""),
      meta: { by: "admin", amount: 量, direction: 向き }
    }).catch(() => false);
    return ok({ 残高: N(後?.balance), 動かした: 量, 向き });
  }

  /* ══ サブスクを 手で 動かす（2026-09-05）══════════════════════════ */
  if ((m = /^users\/([^/]+)\/subscription$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "users.qredit", {
      destructive: true, reason: S(body.reasonText), reasonCategory: S(body.reasonCategory) || "other"
    });
    if (g) return g;
    const uid = N(m[1]);
    const いる = await oneRow(env, `SELECT id FROM users WHERE id=?1`, [uid]);
    if (!いる) return bad("NOT_FOUND", "その 人は いません。", 404);
    /* ★ プランの 呼び名は **本体が 決める**（free / edu_pre / pre）。
       ここで 並べ直すと、プランが 増えた ときに 食い違う。 */
    const 正す = 本体.プランを正す || ((v) => S(v).trim().toLowerCase());
    const plan = 正す(S(body.planId)) || "";
    if (!plan) {
      const 並び = 本体.プラン一覧 ? 本体.プラン一覧().join(" / ") : "free";
      return bad("BAD_REQUEST", "プランは " + 並び + " のどれかです。", 400);
    }
    const 日 = Math.max(0, Math.min(3650, N(body.days)));
    const now = nowMs();
    const renews = plan === "free" ? 0 : (日 ? now + 日 * 86400000 : 0);
    const 前 = await oneRow(env,
      `SELECT plan_name, status, renews_at FROM user_subscription_state WHERE user_id=?1`, [uid]);
    await env.DB.prepare(`
      INSERT INTO user_subscription_state (user_id, plan_name, status, source, started_at, renews_at, updated_at)
      VALUES (?1,?2,?3,'admin',?4,?5,?4)
      ON CONFLICT(user_id) DO UPDATE SET plan_name=?2, status=?3, source='admin', renews_at=?5, updated_at=?4
    `).bind(uid, plan, plan === "free" ? "inactive" : "active", now, renews).run();
    await audit(env, adm, { action: "users.subscription", targetType: "user", targetId: String(uid),
      reason: (S(body.reasonCategory) || "other") + " / " + S(body.reasonText),
      before: { plan: S(前?.plan_name), status: S(前?.status), renewsAt: N(前?.renews_at) },
      after: { plan, status: plan === "free" ? "inactive" : "active", renewsAt: renews }, ip });
    await notifyUser(env, uid, {
      type: "subscription", title: "プランが 変わりました",
      body: plan.toUpperCase() + (renews ? "（" + new Date(renews).toLocaleDateString("ja-JP") + " まで）" : ""),
      meta: { by: "admin", plan }
    }).catch(() => false);
    return ok({ plan, 期限: renews });
  }

  /* ══ 利用者の 中身を 見る（2026-09-05）════════════════════════════
     訴え「Admin で できる ことを 増やしたい」→「利用者の 中身を 見る」。
     何か あった とき（通報・問い合わせ）に **その人の 手元を 1 枚で**。
     ★ 見た ことは 監査ログに 残す。黙って 覗かない。
     ★ 出すのは **持ちものの 一覧と 数**まで。
       プリセットの 問題文・DM の 中身・生成した 文章は 出さない。 */
  if ((m = /^users\/([^/]+)\/inspect$/.exec(sub)) && method === "GET") {
    const g = guard(adm, "users.view"); if (g) return g;
    const uid = N(m[1]);
    const いる = await oneRow(env, `SELECT id, nickname FROM users WHERE id=?1`, [uid]);
    if (!いる) return bad("NOT_FOUND", "その 人は いません。", 404);

    /* プリセット（公開して いる もの） */
    const presets = (await tableExists(env, "public_presets")) ? await allRows(env,
      `SELECT preset_id, name, public_title, subject_id, is_public,
              public_visibility_state, published_at, created_at, updated_at
         FROM public_presets WHERE user_id=?1 AND deleted_at=0
        ORDER BY updated_at DESC LIMIT 50`, [uid]) : [];

    /* 生成の 記録（何を 頼んだか の 種類と 結果だけ。中身は 出さない） */
    const jobs = (await tableExists(env, "ai_jobs")) ? await allRows(env,
      `SELECT id, type, status, executor, engine_version, made_count, planned_count,
              error_code, created_at, completed_at
         FROM ai_jobs WHERE user_id=?1 ORDER BY created_at DESC LIMIT 30`, [uid]) : [];

    /* 通報（この 人が された もの・した もの） */
    const された = await allRows(env,
      `SELECT id, target_type, reason, state, created_at FROM content_reports
        WHERE owner_id=?1 ORDER BY created_at DESC LIMIT 20`, [S(uid)]);
    const した = await allRows(env,
      `SELECT id, target_type, reason, state, created_at FROM content_reports
        WHERE reporter_id=?1 ORDER BY created_at DESC LIMIT 20`, [S(uid)]).catch(() => []);

    /* 通知（最近 届いた もの。何が 起きて いるかが 分かる） */
    const 通知 = (await tableExists(env, "user_notifications")) ? await allRows(env,
      `SELECT type, title, ts FROM user_notifications WHERE user_id=?1
        ORDER BY ts DESC LIMIT 20`, [uid]) : [];

    await audit(env, adm, { action: "users.inspect", targetType: "user", targetId: String(uid),
      reason: "調べ", after: { nickname: S(いる.nickname) }, ip });

    return ok({ data: {
      user: { id: uid, nickname: S(いる.nickname) },
      presets, jobs, 通報: { された, した }, 通知
    } });
  }

  if ((m = /^users\/([^/]+)$/.exec(sub)) && method === "GET") {
    const g = guard(adm, "users.view"); if (g) return g;
    const d = await screenUserDetail(env, m[1]);
    if (!d) return bad("NOT_FOUND", "そのユーザーはいません。", 404);
    return ok({ data: d });
  }
  if ((m = /^users\/([^/]+)\/reveal-email$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "users.reveal_email"); if (g) return g;
    const u = await oneRow(env, `SELECT email FROM users WHERE id=?1`, [N(m[1])]);
    if (!u) return bad("NOT_FOUND", "そのユーザーはいません。", 404);
    /* ★ 展開のたびに監査ログへ。 */
    await audit(env, adm, { action: "users.reveal_email", targetType: "user", targetId: S(m[1]),
      reason: S(body.reason) || "（理由の記述なし）", ip });
    return ok({ email: S(u.email) });
  }
  if ((m = /^users\/([^/]+)\/(suspend|ban|unban|delete|restore|purge)$/.exec(sub)) && method === "POST") {
    const uid = S(m[1]), act = m[2];
    const permMap = { suspend: "users.suspend", ban: "users.ban", unban: "users.ban",
                      delete: "users.delete", restore: "users.delete", purge: "users.delete" };
    const needReason = act === "suspend" || act === "ban" || act === "delete";
    const g = guard(adm, permMap[act], {
      destructive: true,
      reason: needReason ? S(body.reasonText) : undefined,
      reasonCategory: needReason ? S(body.reasonCategory) : undefined
    });
    if (g) return g;
    if (act === "purge" && adm.role !== "owner") {
      return bad("FORBIDDEN", "恒久削除は owner のみです。", 403);
    }
    const before = await oneRow(env, `SELECT * FROM user_status WHERE user_id=?1`, [uid]);
    const exists = await oneRow(env, `SELECT id FROM users WHERE id=?1`, [N(uid)]);
    if (!exists) return bad("NOT_FOUND", "そのユーザーはいません。", 404);

    let next = { state: "active", scope: "", suspendUntil: "", deletedAt: "" };
    if (act === "suspend") {
      const scope = S(body.scope);
      if (!["login_blocked", "generation_blocked", "publish_blocked"].includes(scope)) {
        return bad("SCOPE_REQUIRED", "停止範囲を選んでください。", 400);
      }
      next = { state: "suspended", scope, suspendUntil: S(body.until), deletedAt: "" };
    } else if (act === "ban") {
      next = { state: "banned", scope: "login_blocked", suspendUntil: "", deletedAt: "" };
    } else if (act === "delete") {
      next = { state: "deleted", scope: "login_blocked", suspendUntil: "", deletedAt: nowIso() };
    } else if (act === "purge") {
      next = { state: "purged", scope: "login_blocked", suspendUntil: "", deletedAt: S(before?.deleted_at) };
    }
    await env.DB.prepare(
      `INSERT INTO user_status (user_id, state, reason_category, reason_text, suspend_until, scope,
        notified, changed_by, changed_at, deleted_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(user_id) DO UPDATE SET state=?2, reason_category=?3, reason_text=?4,
        suspend_until=?5, scope=?6, notified=?7, changed_by=?8, changed_at=?9, deleted_at=?10`
    ).bind(uid, next.state, S(body.reasonCategory), S(body.reasonText), next.suspendUntil,
      next.scope, body.notify ? 1 : 0, adm.adminId, nowIso(), next.deletedAt).run();

    /* ★ 「本人に通知する」に印が付いていたら **実際に飛ばす**。
       飛んだかどうかを返り値にも入れる（飛ばなかったのに飛んだと言わない）。 */
    let 通知した = false;
    if (body.notify) {
      const 文 = {
        suspend: ["ご利用を一時的に停止しています",
          "一部のご利用を一時的に停止しました。" + (next.suspendUntil ? "解除の予定: " + next.suspendUntil : "")],
        ban: ["アカウントのご利用を停止しました", "アカウントのご利用を停止しました。お心当たりがない場合はお問い合わせください。"],
        unban: ["ご利用を再開しました", "アカウントのご利用を再開しました。"],
        delete: ["アカウントを削除しました", "アカウントを削除しました。30 日以内であれば復元できます。"],
        restore: ["アカウントを復元しました", "アカウントを復元しました。"],
        purge: ["", ""]
      }[act] || ["", ""];
      if (文[0]) {
        通知した = await notifyUser(env, uid, {
          type: "account", title: 文[0], body: 文[1],
          meta: { reasonCategory: S(body.reasonCategory), scope: next.scope, until: next.suspendUntil }
        });
      }
    }

    await audit(env, adm, {
      action: "users." + act, targetType: "user", targetId: uid,
      reason: S(body.reasonCategory) + " / " + S(body.reasonText),
      before: before ? { state: S(before.state), scope: S(before.scope), until: S(before.suspend_until) }
                     : { state: "active" },
      after: { state: next.state, scope: next.scope, until: next.suspendUntil, notified: 通知した },
      ip
    });
    return ok({ state: next.state, reversible: act !== "purge", notified: 通知した });
  }
  /* ── 公式マーク（2026-08-20）─────────────────────────────────────
     訴え「admin ダッシュボードから 公式マーク（青 または 金）を
     付与できるように。通常は 無だけど、あとから こちら側が 付与できる形に」

     ★ official（青と金の 重ね）は **owner だけ**。ごく限られた 公式のため。
     ★ 付け外しは かならず 監査ログへ 残す。 */
  /* ══ 通知を 直接 送る（2026-09-05）════════════════════════════════
     訴え「Admin で できる ことを 増やしたい」→「通知を 直接 送る」。

     お知らせ（News）は **公式サイトにも 載る 読みもの**。
     こちらは **通知欄へ 直に 入れる 短い 知らせ**。用途が 違う ので 別の 口。
     ・宛先は 3 つ: 全員 / この人 / 条件で 絞る
     ・下書きは 持たない（短いので 書いたら 送る）
     ・**何人に 入れたかを そのまま 返す**（届いたふりを しない）
     ・開いて いる 人には その場で 鳴る（notifyUser / みんなへ知らせる が 押す） */
  if (sub === "notify/send" && method === "POST") {
    const g = guard(adm, "notify.send", {
      destructive: true, reason: S(body.reasonText), reasonCategory: S(body.reasonCategory) || "other"
    });
    if (g) return g;
    const title = S(body.title).slice(0, 200).trim();
    const 本文 = S(body.body).slice(0, 600).trim();
    if (!title) return bad("BAD_REQUEST", "見出しを 書いて ください。", 400);
    if (!本文) return bad("BAD_REQUEST", "本文を 書いて ください。", 400);
    const 宛 = S(body.to) || "user";
    const 鍵 = "adm:" + uuid();
    if (宛 === "user") {
      const uid = N(body.userId);
      if (!uid) return bad("BAD_REQUEST", "誰に 送るかを 選んで ください。", 400);
      const いる = await oneRow(env, `SELECT id FROM users WHERE id=?1`, [uid]);
      if (!いる) return bad("NOT_FOUND", "その 人は いません。", 404);
      const 入った = await notifyUser(env, uid, {
        type: "admin", title, body: 本文, meta: { from: "admin", by: adm.adminId }
      });
      await audit(env, adm, { action: "notify.send", targetType: "user", targetId: String(uid),
        reason: (S(body.reasonCategory) || "other") + " / " + S(body.reasonText),
        after: { to: "user", userId: uid, title }, ip });
      return ok({ 送った: 入った ? 1 : 0, 宛先: "この人" });
    }
    /* 全員 / 条件で 絞る */
    let 絞り = null, 名 = "全員";
    if (宛 === "inactive") {
      const 日 = Math.min(365, Math.max(1, N(body.days) || 7));
      絞り = { sql: `u.last_login_at < ?2`, 引数: [Date.now() - 日 * 86400000] };
      名 = 日 + " 日 開いて いない 人";
    } else if (宛 === "active") {
      const 日 = Math.min(365, Math.max(1, N(body.days) || 7));
      絞り = { sql: `u.last_login_at >= ?2`, 引数: [Date.now() - 日 * 86400000] };
      名 = 日 + " 日 以内に 開いた 人";
    }
    const r = await みんなへ知らせる(env, {
      key: 鍵, type: "admin", title, body: 本文,
      meta: { from: "admin", by: adm.adminId }, 絞り
    });
    await audit(env, adm, { action: "notify.send", targetType: "broadcast", targetId: 鍵,
      reason: (S(body.reasonCategory) || "other") + " / " + S(body.reasonText),
      after: { to: 宛, 名, title, 入れた: r.入れた, 全体: r.全体 }, ip });
    return ok({ 送った: r.入れた, 全体: r.全体, 宛先: 名, 打ち切り: r.入れた < r.全体 });
  }

  /* 誰に 届くかを **送る前に** 数える（送ってから 驚かない ため）。 */
  if (sub === "notify/count" && method === "POST") {
    const g = guard(adm, "notify.send"); if (g) return g;
    const 宛 = S(body.to) || "user";
    if (宛 === "user") return ok({ 人数: N(body.userId) ? 1 : 0 });
    let where = `COALESCE(s.state,'active') NOT IN ('deleted','purged')`;
    const 引数 = [];
    if (宛 === "inactive" || 宛 === "active") {
      const 日 = Math.min(365, Math.max(1, N(body.days) || 7));
      where += ` AND u.last_login_at ${宛 === "inactive" ? "<" : ">="} ?1`;
      引数.push(Date.now() - 日 * 86400000);
    }
    const row = await oneRow(env,
      `SELECT COUNT(*) AS n FROM users u
         LEFT JOIN user_status s ON s.user_id = CAST(u.id AS TEXT)
        WHERE ${where}`, 引数);
    return ok({ 人数: N(row?.n) });
  }

  if ((m = /^users\/([^/]+)\/badge$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "users.badge", { destructive: false }); if (g) return g;
    const uid = N(m[1]);
    const badge = S(body.badge).trim().toLowerCase();
    if (!["", "blue", "gold", "official"].includes(badge)) {
      return bad("BAD_REQUEST", "その種類はありません（無し / blue / gold / official）。", 400);
    }
    if (badge === "official" && adm.role !== "owner") {
      return bad("FORBIDDEN", "青と金の重ね（official）は owner のみが付けられます。", 403);
    }
    const exists = await oneRow(env, `SELECT id FROM users WHERE id=?1`, [uid]);
    if (!exists) return bad("NOT_FOUND", "そのユーザーはいません。", 404);
    /* ★ /admin は 本体の ensureDbSchema を 通らない。
       ここで 表が 無いまま 書くと 500 になるので、無ければ 作る。 */
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS user_badges (
         user_id INTEGER PRIMARY KEY,
         badge TEXT NOT NULL DEFAULT '',
         note TEXT NOT NULL DEFAULT '',
         granted_by TEXT NOT NULL DEFAULT '',
         granted_at INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL DEFAULT 0)`
    ).run().catch(() => {});
    const before = await oneRow(env, `SELECT badge FROM user_badges WHERE user_id=?1`, [uid]);
    const now = nowMs();
    if (badge) {
      await env.DB.prepare(
        `INSERT INTO user_badges (user_id, badge, note, granted_by, granted_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?5)
         ON CONFLICT(user_id) DO UPDATE SET badge=?2, note=?3, granted_by=?4, updated_at=?5`
      ).bind(uid, badge, S(body.note).slice(0, 200), adm.adminId, now).run();
    } else {
      await env.DB.prepare(`DELETE FROM user_badges WHERE user_id=?1`).bind(uid).run();
    }
    await audit(env, adm, { action: "users.badge", targetType: "user", targetId: S(m[1]),
      before: { badge: S(before?.badge) }, after: { badge }, reason: S(body.note), ip });
    /* 本体の 覚えは 60 秒で 取り直す。すぐに 見えないことがある。 */
    return ok({ badge, appliesWithinSeconds: 60 });
  }

  /* ══ ダウンタイム（2026-08-20）══════════════════════════════════
     訴え「ダッシュボードから ダウンタイムを 有効にできるように。
     ダウンタイムを オンにしたら 登録者は 全員 ログアウトされ、
     ログインしても 登録しても ダウンタイム中の モーダルが 出て、
     何も 操作は できなくなる」

     ★ 置き場所は D1（maintenance_state・1 行だけ）。
       もとの 仕組みは Firestore 置きで、本番に 鍵が 無いので 動かなかった。
     ★ /admin は 本体の ensureDbSchema を 通らないので、ここで 表を 作る。 */
  const DOWNTIME_ICONS = ["wrench", "bolt", "cloud", "shield", "sparkles", "clock", "alert"];
  async function ensureDowntimeTable() {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS maintenance_state (
         id TEXT PRIMARY KEY,
         enabled INTEGER NOT NULL DEFAULT 0,
         title TEXT NOT NULL DEFAULT '',
         reason TEXT NOT NULL DEFAULT '',
         icon TEXT NOT NULL DEFAULT 'wrench',
         starts_at INTEGER NOT NULL DEFAULT 0,
         ends_at INTEGER NOT NULL DEFAULT 0,
         logout_at INTEGER NOT NULL DEFAULT 0,
         updated_by TEXT NOT NULL DEFAULT '',
         updated_at INTEGER NOT NULL DEFAULT 0)`
    ).run().catch(() => {});
  }
  if (sub === "maintenance" && method === "GET") {
    const g = guard(adm, "system.downtime"); if (g) return g;
    await ensureDowntimeTable();
    const r = await oneRow(env, `SELECT * FROM maintenance_state WHERE id='current'`);
    const 生きている = (await oneRow(env,
      `SELECT COUNT(1) AS c FROM auth_sessions WHERE expires_at > ?1`, [nowMs()])) || {};
    return ok({
      downtime: {
        enabled: !!N(r?.enabled),
        title: S(r?.title),
        reason: S(r?.reason),
        icon: S(r?.icon) || "wrench",
        startsAt: N(r?.starts_at),
        endsAt: N(r?.ends_at),
        logoutAt: N(r?.logout_at),
        updatedBy: S(r?.updated_by),
        updatedAt: N(r?.updated_at)
      },
      icons: DOWNTIME_ICONS,
      いま生きている合言葉: N(生きている.c),
      反映まで: "最大 5 秒（本体は 5 秒ごとに 見ています）"
    });
  }
  if (sub === "maintenance" && method === "POST") {
    /* 止めるのは 取り返しの つく操作だが、影響が 大きいので 再認証を 求める。 */
    const g = guard(adm, "system.downtime", { destructive: true }); if (g) return g;
    await ensureDowntimeTable();
    const enabled = body.enabled === true;
    const icon = DOWNTIME_ICONS.includes(S(body.icon)) ? S(body.icon) : "wrench";
    const title = S(body.title).trim().slice(0, 120) || "メンテナンス中";
    const reason = S(body.reason).trim().slice(0, 2000);
    if (enabled && !reason) {
      return bad("REASON_REQUIRED", "理由を書いてください（画面にそのまま出ます）。", 400);
    }
    const 時 = (v) => { const t = Date.parse(S(v)); return Number.isFinite(t) ? t : 0; };
    const startsAt = 時(body.startsAt), endsAt = 時(body.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) {
      return bad("BAD_RANGE", "終わりは 始まりより あとにしてください。", 400);
    }
    const before = await oneRow(env, `SELECT * FROM maintenance_state WHERE id='current'`);
    const now = nowMs();
    /* ★ 「全員 ログアウト」は **合言葉を 実際に 切る**。
       印を 立てるだけでは、すでに 開いている 画面は 動き続ける。 */
    let 切った = 0;
    const 切る = enabled && body.logoutAll !== false;
    if (切る) {
      const r2 = await env.DB.prepare(
        `UPDATE auth_sessions SET expires_at = 0 WHERE expires_at > ?1`
      ).bind(now).run().catch(() => null);
      切った = N(r2?.meta?.changes);
    }
    await env.DB.prepare(
      `INSERT INTO maintenance_state (id, enabled, title, reason, icon,
         starts_at, ends_at, logout_at, updated_by, updated_at)
       VALUES ('current', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(id) DO UPDATE SET enabled=?1, title=?2, reason=?3, icon=?4,
         starts_at=?5, ends_at=?6, logout_at=?7, updated_by=?8, updated_at=?9`
    ).bind(enabled ? 1 : 0, title, reason, icon, startsAt, endsAt,
      切る ? now : N(before?.logout_at), adm.adminId, now).run();

    await audit(env, adm, {
      action: enabled ? "downtime.on" : "downtime.off",
      targetType: "system", targetId: "downtime",
      before: before ? { enabled: !!N(before.enabled), title: S(before.title) } : { enabled: false },
      after: { enabled, title, icon, startsAt, endsAt, 切った合言葉: 切った },
      reason: reason || S(body.reasonText), ip
    });
    return ok({ enabled, 切った合言葉: 切った, 反映まで秒: 5 });
  }

  if (sub === "reason-categories" && method === "GET") {
    const g = guard(adm, "users.view"); if (g) return g;
    return ok({ categories: await allRows(env,
      `SELECT key, label, sort_order, active FROM admin_reason_categories ORDER BY sort_order`) });
  }
  if (sub === "reason-categories" && method === "POST") {
    const g = guard(adm, "users.suspend", { destructive: true }); if (g) return g;
    const key = S(body.key).trim(), label = S(body.label).trim();
    if (!key || !label) return bad("BAD_REQUEST", "キーと表示名が必要です。", 400);
    await env.DB.prepare(
      `INSERT INTO admin_reason_categories (key, label, sort_order, active) VALUES (?1,?2,?3,?4)
       ON CONFLICT(key) DO UPDATE SET label=?2, sort_order=?3, active=?4`
    ).bind(key, label, N(body.sortOrder, 100), body.active === false ? 0 : 1).run();
    await audit(env, adm, { action: "reason_category.upsert", targetType: "reason", targetId: key,
      after: { label }, ip });
    return ok({});
  }

  /* ── 管理者 ──────────────────────────────────────────────────────── */
  if (sub === "admins" && method === "GET") {
    const g = guard(adm, "admins.view"); if (g) return g;
    const rows = await allRows(env,
      `SELECT admin_id, email, display_name, role, custom_permissions, totp_enabled,
              created_at, last_login_at, status FROM admins ORDER BY created_at`);
    const invites = await allRows(env,
      `SELECT invite_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at
         FROM admin_invites ORDER BY created_at DESC LIMIT 100`);
    const roles = await allRows(env, `SELECT * FROM admin_custom_roles ORDER BY created_at`);
    return ok({
      admins: rows.map((r) => ({
        adminId: S(r.admin_id), email: maskEmail(r.email), emailRaw: S(r.email),
        displayName: S(r.display_name), role: S(r.role),
        customPermissions: S(r.custom_permissions),
        totpEnabled: !!N(r.totp_enabled), createdAt: S(r.created_at),
        lastLoginAt: S(r.last_login_at), status: S(r.status),
        isSelf: S(r.admin_id) === adm.adminId
      })),
      invites, customRoles: roles
    });
  }
  if (sub === "admins/invite" && method === "POST") {
    const g = guard(adm, "admins.invite", { destructive: true }); if (g) return g;
    const email = S(body.email).trim().toLowerCase();
    const role = S(body.role).trim() || "viewer";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("BAD_EMAIL", "メールアドレスの形式が違います。", 400);
    const known = ADMIN_ROLE_PERMISSIONS[role]
      || await oneRow(env, `SELECT role_key FROM admin_custom_roles WHERE role_key=?1`, [role]);
    if (!known) return bad("BAD_ROLE", "そのロールはありません。", 400);
    /* admin が owner を招くのは不可（owner の管理は owner だけ） */
    if (role === "owner" && adm.role !== "owner") return bad("FORBIDDEN", "owner を招待できるのは owner だけです。", 403);
    const dup = await oneRow(env, `SELECT admin_id FROM admins WHERE email=?1 AND status='active'`, [email]);
    if (dup) return bad("DUPLICATE", "すでに管理者として登録されています。", 409);
    const token = randomHex(32);
    const id = uuid();
    await env.DB.prepare(
      `INSERT INTO admin_invites (invite_id, email, role, token_hash, invited_by, expires_at, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(id, email, role, await sha256Hex(token), adm.adminId,
      new Date(nowMs() + INVITE_TTL_MS).toISOString(), nowIso()).run();
    await audit(env, adm, { action: "admins.invite", targetType: "invite", targetId: id,
      after: { email: maskEmail(email), role }, ip });
    /* トークンは **この 1 回だけ**返す（保存しているのはハッシュ） */
    return ok({ inviteId: id, token, acceptUrl: url.origin + "/admin/accept?token=" + token });
  }
  if ((m = /^admins\/invites\/([^/]+)\/revoke$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "admins.invite", { destructive: true }); if (g) return g;
    await env.DB.prepare(`UPDATE admin_invites SET revoked_at=?2 WHERE invite_id=?1 AND accepted_at=''`)
      .bind(S(m[1]), nowIso()).run();
    await audit(env, adm, { action: "admins.invite.revoke", targetType: "invite", targetId: S(m[1]), ip });
    return ok({});
  }
  if ((m = /^admins\/([^/]+)\/role$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "admins.role_change", { destructive: true }); if (g) return g;
    const targetId = S(m[1]), role = S(body.role).trim();
    if (targetId === adm.adminId) return bad("SELF_FORBIDDEN", "自分自身のロールは変更できません。", 400);
    const t = await oneRow(env, `SELECT admin_id, role, email, status FROM admins WHERE admin_id=?1`, [targetId]);
    if (!t) return bad("NOT_FOUND", "その管理者はいません。", 404);
    const known = ADMIN_ROLE_PERMISSIONS[role]
      || await oneRow(env, `SELECT role_key FROM admin_custom_roles WHERE role_key=?1`, [role]);
    if (!known) return bad("BAD_ROLE", "そのロールはありません。", 400);
    if (S(t.role) === "owner" && role !== "owner") {
      const n = await oneRow(env, `SELECT COUNT(*) AS n FROM admins WHERE role='owner' AND status='active'`);
      if (N(n?.n) <= 1) return bad("LAST_OWNER", "最後の owner を降格することはできません。", 400);
    }
    if (role === "owner" && adm.role !== "owner") return bad("FORBIDDEN", "owner にできるのは owner だけです。", 403);
    await env.DB.prepare(`UPDATE admins SET role=?2, custom_permissions=?3 WHERE admin_id=?1`)
      .bind(targetId, role, S(body.customPermissions || "")).run();
    await audit(env, adm, { action: "admins.role_change", targetType: "admin", targetId,
      before: { role: S(t.role) }, after: { role }, reason: S(body.reason), ip });
    return ok({});
  }
  if ((m = /^admins\/([^/]+)\/revoke$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "admins.revoke", { destructive: true }); if (g) return g;
    const targetId = S(m[1]);
    if (targetId === adm.adminId) return bad("SELF_FORBIDDEN", "自分自身を削除することはできません。", 400);
    const t = await oneRow(env, `SELECT admin_id, role, status FROM admins WHERE admin_id=?1`, [targetId]);
    if (!t) return bad("NOT_FOUND", "その管理者はいません。", 404);
    if (S(t.role) === "owner") {
      const n = await oneRow(env, `SELECT COUNT(*) AS n FROM admins WHERE role='owner' AND status='active'`);
      if (N(n?.n) <= 1) return bad("LAST_OWNER", "最後の owner を削除することはできません。", 400);
    }
    await env.DB.prepare(`UPDATE admins SET status='revoked' WHERE admin_id=?1`).bind(targetId).run();
    await env.DB.prepare(`DELETE FROM admin_sessions WHERE admin_id=?1`).bind(targetId).run().catch(() => {});
    await audit(env, adm, { action: "admins.revoke", targetType: "admin", targetId,
      before: { status: S(t.status), role: S(t.role) }, after: { status: "revoked" },
      reason: S(body.reason), ip });
    return ok({});
  }
  /* ★ 認証アプリを失くしたときの戻し方（2026-08-18）。
     ★ **自分自身には使えない**ようにしてある。使えるようにすると
       「パスワードだけで二要素認証を外せる」ことになり、
       二要素認証の意味が無くなる。だから **他の管理者に頼む**形にした。
       裏返すと、管理者が 1 人だと詰む。**2 人以上にしておくこと。**
     ★ 解除したら、その人の端末のセッションも全部切る。
       鍵を失くした＝誰かの手に渡ったかもしれない、ということなので。 */
  if ((m = /^admins\/([^/]+)\/totp\/reset$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "admins.role_change", {
      destructive: true,
      reason: S(body.reasonText), reasonCategory: S(body.reasonCategory)
    });
    if (g) return g;
    const targetId = S(m[1]);
    if (targetId === adm.adminId) {
      return bad("SELF_FORBIDDEN",
        "自分自身の二要素認証は、ここでは解除できません。ほかの管理者に頼んでください。", 400);
    }
    const t = await oneRow(env,
      `SELECT admin_id, email, role, totp_enabled FROM admins WHERE admin_id=?1 AND status='active'`,
      [targetId]);
    if (!t) return bad("NOT_FOUND", "その管理者はいません。", 404);
    await env.DB.prepare(`UPDATE admins SET totp_secret='', totp_enabled=0 WHERE admin_id=?1`)
      .bind(targetId).run();
    await env.DB.prepare(`DELETE FROM admin_sessions WHERE admin_id=?1`)
      .bind(targetId).run().catch(() => {});
    await audit(env, adm, {
      action: "admins.totp_reset", targetType: "admin", targetId,
      reason: S(body.reasonCategory) + " / " + S(body.reasonText),
      before: { totpEnabled: !!N(t.totp_enabled) },
      after: { totpEnabled: false, sessionsCleared: true }, ip
    });
    return ok({ note: "次のログインで登録し直してもらってください。端末のログインは全部切りました。" });
  }

  if (sub === "admins/transfer-owner" && method === "POST") {
    const g = guard(adm, "admins.role_change", { destructive: true }); if (g) return g;
    if (adm.role !== "owner") return bad("FORBIDDEN", "owner の譲渡ができるのは owner だけです。", 403);
    const targetId = S(body.toAdminId);
    if (targetId === adm.adminId) return bad("SELF_FORBIDDEN", "自分自身へは譲渡できません。", 400);
    const t = await oneRow(env, `SELECT admin_id, role FROM admins WHERE admin_id=?1 AND status='active'`, [targetId]);
    if (!t) return bad("NOT_FOUND", "その管理者はいません。", 404);
    /* ★ 1 操作で行う。途中で止まると owner が 0 人 or 2 人になる。 */
    await env.DB.batch([
      env.DB.prepare(`UPDATE admins SET role='owner' WHERE admin_id=?1`).bind(targetId),
      env.DB.prepare(`UPDATE admins SET role='admin' WHERE admin_id=?1`).bind(adm.adminId)
    ]);
    await audit(env, adm, { action: "admins.transfer_owner", targetType: "admin", targetId,
      before: { newOwnerRole: S(t.role), oldOwner: adm.adminId },
      after: { newOwner: targetId, oldOwnerRole: "admin" }, reason: S(body.reason), ip });
    return ok({});
  }
  if (sub === "roles" && method === "POST") {
    const g = guard(adm, "admins.role_change", { destructive: true }); if (g) return g;
    const key = S(body.roleKey).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const perms = Array.isArray(body.permissions)
      ? body.permissions.filter((p) => ADMIN_PERMISSIONS.includes(S(p))) : [];
    if (!key || !S(body.displayName).trim()) return bad("BAD_REQUEST", "キーと表示名が必要です。", 400);
    if (ADMIN_ROLE_PERMISSIONS[key]) return bad("RESERVED", "その名前は使えません。", 400);
    await env.DB.prepare(
      `INSERT INTO admin_custom_roles (role_key, display_name, permissions, created_by, created_at)
       VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(role_key) DO UPDATE SET display_name=?2, permissions=?3`
    ).bind(key, S(body.displayName).trim(), JSON.stringify(perms), adm.adminId, nowIso()).run();
    await audit(env, adm, { action: "roles.upsert", targetType: "role", targetId: key,
      after: { permissions: perms }, ip });
    return ok({});
  }

  /* ── 提供元 ──────────────────────────────────────────────────────── */
  if (sub === "providers" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    return ok({ data: await screenProviders(env) });
  }
  if (sub === "providers/limits" && method === "POST") {
    const g = guard(adm, "limits.edit", { destructive: true }); if (g) return g;
    const key = S(body.key);
    const before = await oneRow(env, `SELECT * FROM provider_limit_config WHERE key=?1`, [key]);
    if (!before) return bad("NOT_FOUND", "その提供元はありません。", 404);
    const enforce = body.enforce === undefined ? N(before.enforce) : (body.enforce ? 1 : 0);
    await env.DB.prepare(
      `UPDATE provider_limit_config SET rpm=?2, tpm=?3, rpd=?4, keys=?5, note=?6, enforce=?7,
         updated_by=?8, updated_at=?9 WHERE key=?1`
    ).bind(key, N(body.rpm), N(body.tpm), N(body.rpd), Math.max(1, N(body.keys, 1)),
      S(body.note) || S(before.note), enforce, adm.adminId, nowIso()).run();
    _cfg.at = 0;   /* 控えを捨てて、次の呼び出しで読み直す */
    await audit(env, adm, { action: "providers.limit_edit", targetType: "provider", targetId: key,
      before: { rpm: N(before.rpm), tpm: N(before.tpm), rpd: N(before.rpd), keys: N(before.keys),
                enforce: !!N(before.enforce) },
      after: { rpm: N(body.rpm), tpm: N(body.tpm), rpd: N(body.rpd), keys: N(body.keys, 1),
               enforce: !!enforce },
      reason: S(body.reason), ip });
    return ok({});
  }

  /* ── Lumi と 利用制限 ───────────────────────────────────────────── */
  if (sub === "lumi" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    return ok({ data: await screenLumi(env) });
  }
  if (sub === "limits" && method === "GET") {
    const g = guard(adm, "limits.view"); if (g) return g;
    const rows = await allRows(env, `SELECT * FROM rate_limit_config ORDER BY group_key, key`);
    /* ★ 「保存できた」ではなく「**本体がこの値で動いている**」を出す。 */
    let runtime = null;
    try { runtime = _probe ? _probe(env) : null; } catch (e) { runtime = null; }
    return ok({
      limits: rows.map((l) => ({
        key: S(l.key), label: S(l.display_name), value: N(l.value), unit: S(l.unit),
        appliesTo: S(l.applies_to), defaultValue: N(l.default_value), group: S(l.group_key),
        updatedBy: S(l.updated_by), updatedAt: S(l.updated_at)
      })),
      runtime
    });
  }
  if (sub === "limits" && method === "POST") {
    const g = guard(adm, "limits.edit", { destructive: true }); if (g) return g;
    const key = S(body.key);
    const before = await oneRow(env, `SELECT * FROM rate_limit_config WHERE key=?1`, [key]);
    if (!before) return bad("NOT_FOUND", "その項目はありません。", 404);
    const v = N(body.value);
    await env.DB.prepare(`UPDATE rate_limit_config SET value=?2, updated_by=?3, updated_at=?4 WHERE key=?1`)
      .bind(key, v, adm.adminId, nowIso()).run();
    _cfg.at = 0;   /* ★ 控えを捨てる。捨てないと最大 8 秒 古い値で動く。 */
    try { forgetCallLimitCache(); } catch (e) {}   /* 通話側の 控えも 同時に 捨てる */
    await audit(env, adm, { action: "limits.edit", targetType: "limit", targetId: key,
      before: { value: N(before.value) }, after: { value: v }, reason: S(body.reason), ip });
    return ok({ value: v });
  }

  /* ── 通話（2026-08-29）────────────────────────────────────────────
     ★ **個別の 通話の 中身は 出さない。数だけ。**
       音声は そもそも 保存していないので、出しようが ない。 */
  if (sub === "calls" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    const 要約 = await callsAdminSummary(env);
    const reports = await allRows(env, `
      SELECT r.report_id AS id, r.call_id AS callId, r.reporter_id AS reporterId,
             r.reported_id AS reportedId, r.category, r.detail, r.status, r.created_at AS createdAt,
             c.duration_sec AS durationSec, c.started_at AS startedAt, c.state AS callState,
             c.lumi_used AS lumiUsed
        FROM call_reports r LEFT JOIN calls c ON c.call_id = r.call_id
       ORDER BY (r.status='open') DESC, r.created_at DESC LIMIT 200`);
    const limits = await allRows(env,
      `SELECT key, display_name, value, unit, default_value FROM rate_limit_config WHERE group_key='call' ORDER BY key`);
    return ok({ data: {
      summary: 要約,
      reports: reports.map((r) => ({
        id: S(r.id), callId: S(r.callId), reporterId: N(r.reporterId), reportedId: N(r.reportedId),
        category: S(r.category), detail: S(r.detail), status: S(r.status),
        createdAt: N(r.createdAt), startedAt: N(r.startedAt),
        durationSec: N(r.durationSec), callState: S(r.callState), lumiUsed: N(r.lumiUsed) === 1
      })),
      limits: limits.map((l) => ({ key: S(l.key), label: S(l.display_name),
        value: N(l.value), unit: S(l.unit), defaultValue: N(l.default_value) })),
      note: "通話の 音声は 保存していません。内容は 確認できません。"
    } });
  }
  /* 土台の 自己診断。**実際に SFU へ 1 回 つないで**、返事を そのまま 出す。 */
  if (sub === "calls/selftest" && method === "POST") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    const d = await callsSelfTest(env);
    await audit(env, adm, { action: "call.selftest", targetType: "call", targetId: "sfu",
      after: { ok: !!d.ok, code: S(d.code) }, ip });
    return ok({ data: d });
  }
  if ((m = /^calls\/reports\/([^/]+)\/(handle|dismiss)$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "content.hide", { destructive: true }); if (g) return g;
    const id = S(m[1]);
    const next = m[2] === "handle" ? "handled" : "dismissed";
    const before = await oneRow(env, `SELECT status, call_id FROM call_reports WHERE report_id=?1`, [id]);
    if (!before) return bad("NOT_FOUND", "その通報はありません。", 404);
    await env.DB.prepare(
      `UPDATE call_reports SET status=?2, handled_by=?3, handled_at=?4 WHERE report_id=?1`)
      .bind(id, next, adm.adminId, Date.now()).run();
    try {
      await env.DB.prepare(`UPDATE content_reports SET state=?2, handled_by=?3, handled_at=?4 WHERE id=?1`)
        .bind(id, next === "handled" ? "handled" : "rejected", adm.adminId, nowIso()).run();
    } catch (e) {}
    await audit(env, adm, { action: "call.report." + m[2], targetType: "call_report", targetId: id,
      before: { status: S(before.status) }, after: { status: next }, reason: S(body.reason), ip });
    return ok({ status: next });
  }
  if ((m = /^calls\/([^/]+)$/.exec(sub)) && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    const d = await callsReportDetail(env, S(m[1]));
    if (!d) return bad("NOT_FOUND", "その通話はありません。", 404);
    return ok({ data: d });
  }

  /* ── 機能フラグ ─────────────────────────────────────────────────── */
  if (sub === "flags" && method === "GET") {
    const g = guard(adm, "flags.view"); if (g) return g;
    const rows = await allRows(env, `SELECT * FROM feature_flags ORDER BY section, sidebar_order, key`);
    return ok({ flags: rows });
  }
  if ((m = /^flags\/([^/]+)$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "flags.toggle", { destructive: true }); if (g) return g;
    const key = S(m[1]);
    const before = await oneRow(env, `SELECT * FROM feature_flags WHERE key=?1`, [key]);
    if (!before) return bad("NOT_FOUND", "そのフラグはありません。", 404);
    const state = ["on", "off", "beta", "internal"].includes(S(body.state)) ? S(body.state) : S(before.state);
    const audience = ["all", "allowlist", "percentage"].includes(S(body.audience))
      ? S(body.audience) : S(before.audience);
    let allow = S(before.allowlist);
    if (Array.isArray(body.allowlist)) allow = JSON.stringify(body.allowlist.map(String));
    await env.DB.prepare(
      `UPDATE feature_flags SET state=?2, visible_in_sidebar=?3, sidebar_order=?4, badge=?5,
         audience=?6, allowlist=?7, percentage=?8, notice=?9, display_name=?10, icon=?11,
         path=?12, section=?13, updated_by=?14, updated_at=?15 WHERE key=?1`
    ).bind(key, state,
      body.visibleInSidebar === undefined ? N(before.visible_in_sidebar) : (body.visibleInSidebar ? 1 : 0),
      body.sidebarOrder === undefined ? N(before.sidebar_order) : N(body.sidebarOrder),
      body.badge === undefined ? S(before.badge) : S(body.badge),
      audience, allow,
      body.percentage === undefined ? N(before.percentage) : Math.max(0, Math.min(100, N(body.percentage))),
      body.notice === undefined ? S(before.notice) : S(body.notice),
      body.displayName === undefined ? S(before.display_name) : S(body.displayName),
      body.icon === undefined ? S(before.icon) : S(body.icon),
      body.path === undefined ? S(before.path) : S(body.path),
      body.section === undefined ? S(before.section) : S(body.section),
      adm.adminId, nowIso()).run();
    invalidateFlagCache();
    const after = await oneRow(env, `SELECT * FROM feature_flags WHERE key=?1`, [key]);
    await audit(env, adm, { action: "flags.toggle", targetType: "flag", targetId: key,
      before: {
        state: S(before.state), visibleInSidebar: N(before.visible_in_sidebar),
        sidebarOrder: N(before.sidebar_order), badge: S(before.badge),
        audience: S(before.audience), percentage: N(before.percentage), notice: S(before.notice)
      },
      after: {
        state: S(after.state), visibleInSidebar: N(after.visible_in_sidebar),
        sidebarOrder: N(after.sidebar_order), badge: S(after.badge),
        audience: S(after.audience), percentage: N(after.percentage), notice: S(after.notice)
      },
      reason: S(body.reason), ip });
    return ok({});
  }
  if (sub === "flags" && method === "POST") {
    const g = guard(adm, "flags.toggle", { destructive: true }); if (g) return g;
    const key = S(body.key).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!key) return bad("BAD_REQUEST", "キーが必要です。", 400);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO feature_flags (key, display_name, state, visible_in_sidebar, sidebar_order,
        icon, path, section, updated_by, updated_at)
       VALUES (?1,?2,'off',?3,?4,?5,?6,?7,?8,?9)`
    ).bind(key, S(body.displayName) || key, body.visibleInSidebar ? 1 : 0, N(body.sidebarOrder, 999),
      S(body.icon), S(body.path), S(body.section) || "main", adm.adminId, nowIso()).run();
    invalidateFlagCache();
    await audit(env, adm, { action: "flags.create", targetType: "flag", targetId: key,
      after: { state: "off" }, ip });
    return ok({});
  }

  /* ── 生成品質 / ストレージ ─────────────────────────────────────── */
  if (sub === "quality" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    return ok({ data: await screenQuality(env, url) });
  }
  if (sub === "storage" && method === "GET") {
    const g = guard(adm, "metrics.view"); if (g) return g;
    return ok({ data: await screenStorage(env) });
  }

  /* ── コンテンツ ─────────────────────────────────────────────────── */
  if (sub === "content" && method === "GET") {
    const g = guard(adm, "content.view"); if (g) return g;
    return ok({ data: await screenContent(env, url) });
  }
  if ((m = /^content\/([^/]+)\/(hide|unhide)$/.exec(sub)) && method === "POST") {
    const id = S(m[1]), act = m[2];
    const g = guard(adm, "content.hide", {
      destructive: true,
      reason: act === "hide" ? S(body.reasonText) : undefined,
      reasonCategory: act === "hide" ? S(body.reasonCategory) : undefined
    });
    if (g) return g;
    const type = S(body.targetType) || "preset";
    const before = await oneRow(env,
      `SELECT * FROM content_hidden WHERE target_type=?1 AND target_id=?2`, [type, id]);
    if (act === "hide") {
      await env.DB.prepare(
        `INSERT INTO content_hidden (target_type, target_id, reason_category, reason_text, hidden_by, hidden_at)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(target_type,target_id) DO UPDATE SET reason_category=?3, reason_text=?4, hidden_by=?5, hidden_at=?6`
      ).bind(type, id, S(body.reasonCategory), S(body.reasonText), adm.adminId, nowIso()).run();
    } else {
      await env.DB.prepare(`DELETE FROM content_hidden WHERE target_type=?1 AND target_id=?2`)
        .bind(type, id).run();
    }
    _cfg.at = 0;
    await audit(env, adm, { action: "content." + act, targetType: type, targetId: id,
      reason: S(body.reasonCategory) + " / " + S(body.reasonText),
      before: before ? { hidden: true } : { hidden: false },
      after: { hidden: act === "hide" }, ip });
    return ok({ reversible: true });
  }
  if ((m = /^content\/reports\/([^/]+)\/(resolve|reject)$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "content.hide", { destructive: true }); if (g) return g;
    const id = S(m[1]);
    const before = await oneRow(env, `SELECT state FROM content_reports WHERE id=?1`, [id]);
    if (!before) return bad("NOT_FOUND", "その通報はありません。", 404);
    const next = m[2] === "resolve" ? "handled" : "rejected";
    await env.DB.prepare(`UPDATE content_reports SET state=?2, handled_by=?3, handled_at=?4 WHERE id=?1`)
      .bind(id, next, adm.adminId, nowIso()).run();
    await audit(env, adm, { action: "content.report." + m[2], targetType: "report", targetId: id,
      before: { state: S(before.state) }, after: { state: next }, reason: S(body.reason), ip });
    return ok({});
  }
  if ((m = /^content\/([^/]+)\/reveal$/.exec(sub)) && method === "POST") {
    const g = guard(adm, "content.view", { destructive: true }); if (g) return g;
    /* ★ 中身を見るのは **確認画面を挟んだうえで** だけ。見たことは必ず残す。 */
    if (body.confirmed !== true) return bad("CONFIRM_REQUIRED", "確認が必要です。", 400);
    const id = S(m[1]);
    const row = await oneRow(env,
      `SELECT public_title AS title, subject_id AS subject FROM public_presets WHERE preset_id=?1`, [id]);
    if (!row) return bad("NOT_FOUND", "見つかりません。", 404);
    await audit(env, adm, { action: "content.reveal", targetType: "preset", targetId: id,
      reason: S(body.reason) || "（理由の記述なし）", ip });
    /* 通報対応に要る最小限だけ。問題文そのものは返さない。 */
    return ok({ title: S(row.title), subject: S(row.subject),
      note: "問題文そのものは Admin へ返さない決まりです。" });
  }

  /* ── 画像・動画を あげる（2026-08-20）─────────────────────────────
     訴え「画像や 動画は アップできないの？」
     中身（種類の 見分け・上限・置き場・台帳）は **本体のものを そのまま**使う。
     ここで 書き写すと、上限も 置き場の 決めかたも 必ず ずれる。 */
  if (sub === "upload" && method === "POST") {
    const g = guard(adm, "announcements.view"); if (g) return g;
    if (!_upload) return bad("NOT_READY", "あげる口が まだ 用意できていません。", 503);
    const res = await _upload(request, env);
    /* 本体が 作った 返事を そのまま 返す（上限の 断り文も そのまま）。 */
    return res;
  }

  /* ── お知らせ ───────────────────────────────────────────────────── */
  /* 添えもの（画像・動画）。**自分のところの 置き場だけ** 受ける。 */
  const 添えものを整える = (raw) => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((m) => {
      const url = S(m && m.url);
      if (!/^\/api\/media\/(img|vid)\/[A-Za-z0-9._-]+$/.test(url)) return null;
      return { kind: url.indexOf("/vid/") >= 0 ? "video" : "image",
               url, name: S(m && m.name).slice(0, 120), bytes: N(m && m.bytes) };
    }).filter(Boolean).slice(0, 8);
  };

  if (sub === "announcements" && method === "GET") {
    const g = guard(adm, "announcements.view"); if (g) return g;
    const rows = await allRows(env, `SELECT * FROM announcements ORDER BY updated_at DESC LIMIT 200`);
    return ok({ announcements: rows.map((r) => Object.assign({}, r, {
      media: 添えものを整える((() => { try { return JSON.parse(S(r.media_json) || "[]"); } catch (e) { return []; } })()),
      notify: N(r.notify) === 1
    })) });
  }
  if (sub === "announcements" && method === "POST") {
    const g = guard(adm, "announcements.view", { destructive: false }); if (g) return g;
    const id = S(body.id) || uuid();
    const before = await oneRow(env, `SELECT * FROM announcements WHERE id=?1`, [id]);
    const status = ["draft", "published", "archived"].includes(S(body.status)) ? S(body.status) : "draft";
    let feedPosted = false;
    let 知らせた = { 入れた: 0, 全体: 0 };
    if (status === "published" && !has(adm, "announcements.publish")) {
      return bad("FORBIDDEN", "配信の権限がありません（必要: announcements.publish）。", 403);
    }
    if (status === "published" && !adm.fresh) {
      return bad("REAUTH_REQUIRED", "配信の前に、もう一度ご本人確認をしてください。", 403);
    }
    const 添え = 添えものを整える(body.media);
    const 知らせる = body.notify === true;
    await env.DB.prepare(
      `INSERT INTO announcements (id, title, body_md, channel, category, published_at, expires_at,
         created_by, status, news_id, media_json, notify, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?12,?13,?11)
       ON CONFLICT(id) DO UPDATE SET title=?2, body_md=?3, channel=?4, category=?5,
         published_at=?6, expires_at=?7, status=?9, media_json=?12, notify=?13, updated_at=?11`
    ).bind(id, S(body.title), S(body.bodyMd), S(body.channel) || "both", S(body.category) || "release",
      S(body.publishedAt), S(body.expiresAt), adm.adminId, status, S(before?.news_id), nowIso(),
      JSON.stringify(添え), 知らせる ? 1 : 0).run();

    /* ★ 公式サイトのニュースと **同じ置き場所**へ書く（二重管理にしない）。 */
    if (status === "published" && await tableExists(env, "news_articles")) {
      const newsId = S(before?.news_id) || ("news_" + id.slice(0, 12));
      const pubMs = S(body.publishedAt) ? new Date(S(body.publishedAt)).getTime() : nowMs();
      /* ★ 表紙（バナー）と 要約（2026-09-02）。
         これまでは 本文の 先頭 160 字を 要約に して、表紙は 一切 書いて
         いなかった。そのため **どこから 配信しても バナーが 付けられなかった**。
         表紙は アプリの お知らせ（cover）と 公式サイト（一覧の 札・記事の 頭・
         共有の 絵）で そのまま 使う。http(s) の ものだけ 通す。 */
      /* ★ あげた 画像も 表紙に できる（2026-09-03・訴え「バナー画像を
         設定できるように」）。自分の 置き場（/api/media/img/…）と
         外の http(s) の 両方を 通す。動画・ファイルは 表紙に しない。 */
      const 表紙 = (/^\/api\/media\/img\/[A-Za-z0-9._-]+$/.test(S(body.coverUrl))
        || /^https?:\/\//i.test(S(body.coverUrl))) ? S(body.coverUrl).slice(0, 500) : "";
      const 要約 = S(body.summary).trim().slice(0, 400)
        || S(body.bodyMd).replace(/[#*`>\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
      await env.DB.prepare(
        `INSERT INTO news_articles (id, category, title, summary, body, cover_url, status, published_at, created_at, updated_at, author_id, media_json)
         VALUES (?1,?2,?3,?4,?5,?9,'published',?6,?7,?7,0,?8)
         ON CONFLICT(id) DO UPDATE SET category=?2, title=?3, summary=?4, body=?5,
           cover_url=?9, status='published', published_at=?6, updated_at=?7, media_json=?8`
      ).bind(newsId, S(body.category) || "release", S(body.title),
        要約, S(body.bodyMd), pubMs, nowMs(),
        JSON.stringify(添え), 表紙).run().catch(() => {});
      await env.DB.prepare(`UPDATE announcements SET news_id=?2 WHERE id=?1`).bind(id, newsId).run().catch(() => {});

      /* ★ 同じ内容を VocabuQuiz 公式として Feed へも 出す。
         二重に 出さないよう、投稿の id は お知らせの id から 決め打ち。
         うまくいかなくても お知らせ自体は 通す（ここで 落とさない）。 */
      if (_newsFeed) {
        feedPosted = await _newsFeed(env, {
          newsId, title: S(body.title), bodyMd: S(body.bodyMd),
          category: S(body.category) || "release", publishedAt: pubMs,
          media: 添え
        }).catch(() => false);
      }

      /* ★ 通知にも 送る（2026-08-20・訴え「通知の方にも」）。
         本体の 通知は **1 人 1 行**なので、みんなへ 入れる。
         id は お知らせから 決め打ちなので、配信し直しても 増えない。 */
      if (知らせる) {
        const 本文 = S(body.bodyMd).replace(/[#*_>`~\-]/g, " ").replace(/\s+/g, " ").trim();
        知らせた = await みんなへ知らせる(env, {
          key: "news:" + newsId,
          type: "news",
          title: S(body.title) || "お知らせ",
          body: 本文.slice(0, 300),
          meta: { type: "news", newsId, 添え: 添え.length }
        });
      }
    }
    if (status === "archived" && S(before?.news_id) && await tableExists(env, "news_articles")) {
      await env.DB.prepare(`UPDATE news_articles SET status='archived' WHERE id=?1`)
        .bind(S(before.news_id)).run().catch(() => {});
      /* Feed からも 下げる（消さずに 伏せる。戻せるように）。 */
      await env.DB.prepare(`UPDATE social_posts SET deleted_at=?2 WHERE id=?1`)
        .bind("sp:news:" + S(before.news_id), nowMs()).run().catch(() => {});
    }
    await audit(env, adm, { action: "announcements." + status, targetType: "announcement", targetId: id,
      before: before ? { status: S(before.status), title: S(before.title) } : undefined,
      after: { status, title: S(body.title), channel: S(body.channel) || "both", feedPosted,
               添えもの: 添え.length, 通知: 知らせた.入れた },
      reason: S(body.reason), ip });
    return ok({ id, feedPosted, 添えもの: 添え.length,
                通知を入れた: 知らせた.入れた, 対象の人数: 知らせた.全体 });
  }

  /* ── 監査ログ ───────────────────────────────────────────────────── */
  if ((sub === "audit" || sub === "audit.csv") && method === "GET") {
    const g = guard(adm, "audit.view"); if (g) return g;
    const w = [], b = [];
    const q = (k, col) => { const v = S(url.searchParams.get(k)); if (v) { b.push(v); w.push(`${col} = ?${b.length}`); } };
    q("adminId", "admin_id"); q("action", "action"); q("targetId", "target_id"); q("targetType", "target_type");
    const from = S(url.searchParams.get("from")), to = S(url.searchParams.get("to"));
    if (from) { b.push(from); w.push(`created_at >= ?${b.length}`); }
    if (to) { b.push(to + "T23:59:59Z"); w.push(`created_at <= ?${b.length}`); }
    const where = w.length ? "WHERE " + w.join(" AND ") : "";
    const lim = sub === "audit.csv" ? 5000 : Math.min(500, N(url.searchParams.get("per"), 100));
    const rows = await allRows(env,
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ${lim}`, b);
    if (sub === "audit.csv") {
      const esc = (v) => '"' + S(v).replace(/"/g, '""') + '"';
      const head = ["created_at", "admin_email", "action", "target_type", "target_id", "reason", "before", "after", "ip"];
      const csv = [head.join(",")].concat(rows.map((r) => head.map((k) => esc(r[k])).join(","))).join("\n");
      return new Response("﻿" + csv, { status: 200, headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit_log.csv"',
        "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store"
      } });
    }
    const admins = await allRows(env, `SELECT DISTINCT admin_id, admin_email FROM audit_log LIMIT 200`);
    const actions = await allRows(env, `SELECT DISTINCT action FROM audit_log ORDER BY action LIMIT 200`);
    return ok({ rows, admins, actions });
  }

  return null;
}
