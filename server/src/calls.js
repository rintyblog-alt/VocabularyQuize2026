/* ══════════════════════════════════════════════════════════════════════════
   DM の 音声通話 — サーバ側

   ★ worker.js へは **入口だけ** を 足す（survive.js / admin.js と 同じ 決まり）。
     あちらは 65,000 行 あるので、ここへ 2,000 行 差し込むと 差分が 読めなくなる。

   ここに ある もの:
     ① D1 の 表（設定・通話・通報・出来事）
     ② 通話して よいかの 判定（**サーバ側だけで 決める**）
     ③ /api/call/*（同意・発信・応答・拒否・切断・通報・制限）
     ④ /ws/call（合図の 通り道 → CallHub）
     ⑤ CallHub（Durable Object。**1 人 1 個**。その人へ 押し出す だけ）
     ⑥ Cloudflare Realtime（SFU）への 中継。**鍵は 画面へ 出さない**
     ⑦ Lumi の 割り込み（両者の 同意が いる・有料の 鍵しか 使わない）

   決めごと（要件）:
     ・**通話して よいかは 必ず ここで 決める。** 画面の ボタンを 隠すだけに しない。
     ・**合図の たびに 決め直す。** 通話中に ブロックされたら その場で 切る。
     ・**音声は 残さない。** 誰と いつ 何分 だけを 残す。
     ・**必ず SFU を 通す（P2P に しない）。** 相手に IP が 漏れないため。
     ・Lumi は **両者が 同意した ときだけ**。片方の 操作では 起きない。
     ・Lumi は **有料の 鍵だけ**。他人同士の 会話を 無料枠へ 流さない。

   年齢の 確認は **入れない**（依頼者の 指示。同意の 画面だけ）。
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 小道具 ─────────────────────────────────────────────────────────── */
const S = (v, n) => String(v === undefined || v === null ? "" : v).slice(0, n || 200);
const N = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : (d || 0); };
const 今 = () => Date.now();

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function bad(code, message, status) { return json({ ok: false, code, message }, status || 400); }

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function 印(前) {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return (前 || "") + Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* 同意の 版。**文面を 変えたら ここを 上げる**（もう一度 同意を もらうため）。 */
export const CALL_CONSENT_VERSION = "2026-08-29";
export const CALL_LUMI_CONSENT_VERSION = "2026-08-29";

/* 着信の 待ち時間。過ぎたら 不在着信。 */
const RING_MS = 30 * 1000;

/* ══ ① 表 ════════════════════════════════════════════════════════════════ */
const 表 = [
  /* 本人の 設定。通話を 使う前の 同意も ここに 残す。 */
  `CREATE TABLE IF NOT EXISTS call_settings (
    user_id INTEGER PRIMARY KEY,
    call_enabled INTEGER NOT NULL DEFAULT 1,
    consent_version TEXT NOT NULL DEFAULT '',
    consent_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  /* 通話。**音声は 入れない。** 誰と いつ 何分 だけ。 */
  `CREATE TABLE IF NOT EXISTS calls (
    call_id TEXT PRIMARY KEY,
    caller_id INTEGER NOT NULL DEFAULT 0,
    callee_id INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'ringing',
    room_id TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL DEFAULT 0,
    connected_at INTEGER NOT NULL DEFAULT 0,
    ended_at INTEGER NOT NULL DEFAULT 0,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    end_reason TEXT NOT NULL DEFAULT '',
    lumi_used INTEGER NOT NULL DEFAULT 0,
    lumi_consent_caller INTEGER NOT NULL DEFAULT 0,
    lumi_consent_callee INTEGER NOT NULL DEFAULT 0,
    lumi_seconds INTEGER NOT NULL DEFAULT 0,
    caller_session TEXT NOT NULL DEFAULT '',
    callee_session TEXT NOT NULL DEFAULT '',
    lumi_asked_by INTEGER NOT NULL DEFAULT 0,
    lumi_started_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS call_reports (
    report_id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL DEFAULT '',
    reporter_id INTEGER NOT NULL DEFAULT 0,
    reported_id INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL DEFAULT 0,
    handled_by TEXT NOT NULL DEFAULT '',
    handled_at INTEGER NOT NULL DEFAULT 0
  )`,
  /* 同意の 記録。あとから「同意していない」と なった ときの 根拠。 */
  `CREATE TABLE IF NOT EXISTS call_events (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT '',
    actor_id INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT ''
  )`
];
const 索引 = [
  "CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls (caller_id, started_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls (callee_id, started_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_calls_state ON calls (state, started_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_call_reports_state ON call_reports (status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events (call_id, at)"
];

let _表できた = false, _表の途中 = null;
export async function ensureCallSchema(env) {
  if (_表できた) return;
  if (_表の途中) return _表の途中;
  _表の途中 = (async () => {
    if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
    for (const sql of 表) {
      try { await env.DB.prepare(sql).run(); }
      catch (e) { console.warn("[call] schema:", S(e?.message, 120)); }
    }
    for (const sql of 索引) { try { await env.DB.prepare(sql).run(); } catch (e) {} }
    _表できた = true;
  })();
  try { await _表の途中; } finally { _表の途中 = null; }
}

async function 記す(env, callId, kind, actorId, note) {
  try {
    await env.DB.prepare(
      "INSERT INTO call_events (id, call_id, at, kind, actor_id, note) VALUES (?1,?2,?3,?4,?5,?6)"
    ).bind(印("ev_"), S(callId, 64), 今(), S(kind, 40), N(actorId, 0), S(note, 400)).run();
  } catch (e) { /* 記録に 失敗しても 通話は 続ける */ }
}

/* ══ 札から 人を 引く（worker.js の resolveAuthUser と 同じ 表）══════════ */
async function 人(request, env, tokenRaw) {
  const t = tokenRaw || (() => {
    const h = S(request.headers.get("Authorization"), 400);
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m ? m[1].trim() : "";
  })();
  if (!t || !env?.DB) return null;
  const hash = await sha256Hex(t);
  const row = await env.DB.prepare(`
    SELECT s.user_id AS userId, s.pin_ok_at AS pinOkAt,
           u.nickname AS nickname, u.grade_prefix AS gradePrefix, u.pin_hash AS pinHash
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2 LIMIT 1
  `).bind(hash, 今()).first().catch(() => null);
  if (!row) return null;
  /* 暗証番号を 決めている 人は、その 端末で 確かめるまで 中へ 入れない。 */
  if (S(row.pinHash) && !(N(row.pinOkAt, 0) > 0)) return null;
  const uid = N(row.userId, 0);
  if (!uid) return null;
  return { uid, nickname: S(row.nickname, 40), grade: S(row.gradePrefix, 8) };
}

/* ══ ② 通話して よいか ══════════════════════════════════════════════════
   ★ ここが この 機能の 芯。**画面の 出し分けは 制御では ない。**
     どの 口からでも 必ず ここを 通す。 */

/* 相互承認（＝ 両方が 承認済みで フォローし合っている）か */
async function 相互か(env, a, b) {
  const row = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM user_follows
        WHERE follower_id = ?1 AND followee_id = ?2 AND deleted_at = 0 AND approved_at > 0) AS x,
      (SELECT COUNT(*) FROM user_follows
        WHERE follower_id = ?2 AND followee_id = ?1 AND deleted_at = 0 AND approved_at > 0) AS y
  `).bind(a, b).first().catch(() => null);
  return N(row?.x, 0) > 0 && N(row?.y, 0) > 0;
}

/* どちらかが ブロックしていれば true（片側で 成立する） */
async function ブロックか(env, a, b) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM dm_blocks
     WHERE (blocker_id = ?1 AND blocked_id = ?2) OR (blocker_id = ?2 AND blocked_id = ?1)
  `).bind(a, b).first().catch(() => null);
  return N(row?.n, 0) > 0;
}

/* 管理画面からの 措置（利用停止・制限）が 効いているか */
async function 止められているか(env, uid) {
  const row = await env.DB.prepare(`
    SELECT level FROM account_enforcements
     WHERE user_id = ?1 AND is_active = 1 AND (ends_at = 0 OR ends_at > ?2)
     LIMIT 1
  `).bind(uid, 今()).first().catch(() => null);
  if (!row) return false;
  const lv = S(row.level).toUpperCase();
  return lv === "RED" || lv === "MAX" || lv === "PERMANENT";
}

/* 本人の 設定（同意・自分でオフ） */
async function 設定(env, uid) {
  const row = await env.DB.prepare("SELECT * FROM call_settings WHERE user_id = ?1")
    .bind(uid).first().catch(() => null);
  return {
    callEnabled: row ? N(row.call_enabled, 1) !== 0 : true,
    consentVersion: S(row?.consent_version, 40),
    consentAt: N(row?.consent_at, 0),
    consented: S(row?.consent_version, 40) === CALL_CONSENT_VERSION
  };
}

/* ── 利用制限（Admin の rate_limit_config を そのまま 読む）────────────── */
const 制限の既定 = {
  "call.daily.minutes": 120,      /* 1 日あたりの 通話時間（分） */
  "call.daily.count": 30,         /* 1 日あたりの 発信回数 */
  "call.max_minutes": 60,         /* 1 通話の 最大時間（分） */
  "call.concurrent.max": 1,       /* 同時通話数 */
  "call.lumi.daily.count": 10,    /* Lumi 介入の 1 日あたり 回数 */
  "call.lumi.max_seconds": 300    /* Lumi 介入の 1 回あたり 最大時間（秒） */
};
let _制限 = { 時: 0, 値: null };
async function 制限(env) {
  if (_制限.値 && 今() - _制限.時 < 30000) return _制限.値;
  const 出 = Object.assign({}, 制限の既定);
  try {
    const r = await env.DB.prepare(
      "SELECT key, value FROM rate_limit_config WHERE group_key = 'call'").all();
    for (const row of (r?.results || [])) {
      const k = S(row.key, 60);
      if (k in 出) 出[k] = N(row.value, 出[k]);
    }
  } catch (e) { /* 表が まだ 無ければ 既定で 動かす */ }
  _制限 = { 時: 今(), 値: 出 };
  return 出;
}
export function forgetCallLimitCache() { _制限 = { 時: 0, 値: null }; }

/* 日本時間の 「今日」。UTC で 切ると 朝 9 時に 戻ってしまう。 */
function 今日() {
  return new Date(今() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function 今日の始まり() {
  const d = new Date(今() + 9 * 3600 * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - 9 * 3600 * 1000;
}

async function 今日の使用(env, uid) {
  const 始 = 今日の始まり();
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(duration_sec),0) AS sec
      FROM calls
     WHERE caller_id = ?1 AND started_at >= ?2
  `).bind(uid, 始).first().catch(() => null);
  const both = await env.DB.prepare(`
    SELECT COALESCE(SUM(duration_sec),0) AS sec
      FROM calls
     WHERE (caller_id = ?1 OR callee_id = ?1) AND started_at >= ?2
  `).bind(uid, 始).first().catch(() => null);
  const lumi = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM calls
     WHERE (caller_id = ?1 OR callee_id = ?1) AND started_at >= ?2 AND lumi_used = 1
  `).bind(uid, 始).first().catch(() => null);
  return {
    発信回数: N(row?.n, 0),
    通話秒: N(both?.sec, 0),
    lumi回数: N(lumi?.n, 0)
  };
}

/* いま 通話中か（ringing も 含める。同時に 2 本 鳴らさない） */
async function 通話中(env, uid) {
  const row = await env.DB.prepare(`
    SELECT call_id, state, caller_id, callee_id, started_at FROM calls
     WHERE (caller_id = ?1 OR callee_id = ?1) AND state IN ('ringing','connected')
     ORDER BY started_at DESC LIMIT 1
  `).bind(uid).first().catch(() => null);
  if (!row) return null;
  /* 鳴りっぱなしで 残っている ものは 掃除する（画面が 落ちた ときなど）。 */
  if (S(row.state) === "ringing" && 今() - N(row.started_at, 0) > RING_MS + 15000) {
    await 終える(env, S(row.call_id, 64), "timeout", "missed").catch(() => {});
    return null;
  }
  return row;
}

/**
 * 通話して よいか。**ここだけが 判定の 場所。**
 * @returns {{allowed:boolean, code:string, message:string}}
 */
export async function canCall(env, aId, bId, opts) {
  const a = N(aId, 0), b = N(bId, 0);
  const o = opts || {};
  if (!a || !b) return { allowed: false, code: "BAD_REQUEST", message: "相手が わかりません。" };
  if (a === b) return { allowed: false, code: "NO_SELF", message: "自分には かけられません。" };

  const [sa, sb] = await Promise.all([設定(env, a), 設定(env, b)]);
  /* 同意（かける 側は 必ず。受ける 側は 応答の ときに 確かめる） */
  if (!sa.consented) {
    return { allowed: false, code: "CONSENT_REQUIRED", message: "通話を 使う前に 同意が 必要です。" };
  }
  if (!o.skipPeerConsent && !sb.consented) {
    return { allowed: false, code: "PEER_CONSENT_REQUIRED", message: "相手が まだ 通話を 使える 状態では ありません。" };
  }
  if (!sa.callEnabled) return { allowed: false, code: "CALL_DISABLED", message: "あなたの 設定で 通話を 切っています。" };
  if (!sb.callEnabled) return { allowed: false, code: "PEER_CALL_DISABLED", message: "相手は 通話を 受け付けていません。" };

  if (await ブロックか(env, a, b)) {
    /* ★ ブロックされた 側に「ブロックされた」と 教えない。
       「いま かけられません」で 止める。 */
    return { allowed: false, code: "NOT_AVAILABLE", message: "いま この相手には かけられません。" };
  }
  if (!(await 相互か(env, a, b))) {
    return { allowed: false, code: "NOT_MUTUAL", message: "相互フォローの 相手にだけ かけられます。" };
  }
  if (await 止められているか(env, a)) {
    return { allowed: false, code: "SUSPENDED", message: "いまは 利用が 制限されています。" };
  }
  if (await 止められているか(env, b)) {
    return { allowed: false, code: "PEER_SUSPENDED", message: "いま この相手には かけられません。" };
  }

  const L = await 制限(env);
  const 同時 = Math.max(1, N(L["call.concurrent.max"], 1));
  const [ca, cb] = await Promise.all([通話中(env, a), 通話中(env, b)]);
  if (ca && S(ca.call_id) !== S(o.allowCallId || "")) {
    return { allowed: false, code: "BUSY", message: "すでに 別の 通話中です。" };
  }
  if (同時 <= 1 && cb && S(cb.call_id) !== S(o.allowCallId || "")) {
    return { allowed: false, code: "PEER_BUSY", message: "相手は いま ほかの 通話中です。" };
  }

  if (!o.skipQuota) {
    const 使 = await 今日の使用(env, a);
    if (使.発信回数 >= Math.max(0, N(L["call.daily.count"], 30))) {
      return { allowed: false, code: "LIMIT_COUNT", message: "今日の 発信回数の 上限に 達しました。" };
    }
    if (使.通話秒 >= Math.max(0, N(L["call.daily.minutes"], 120)) * 60) {
      return { allowed: false, code: "LIMIT_MINUTES", message: "今日の 通話時間の 上限に 達しました。" };
    }
  }
  return { allowed: true, code: "OK", message: "" };
}

/* ══ ③ 押し出し（CallHub へ）════════════════════════════════════════════ */
async function 押す(env, uid, msg) {
  if (!env?.CALL_HUB) return false;
  try {
    const stub = env.CALL_HUB.get(env.CALL_HUB.idFromName("u:" + N(uid, 0)));
    const r = await stub.fetch("https://call.hub/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg || {})
    });
    const j = await r.json().catch(() => null);
    return !!(j && j.delivered);
  } catch (e) { return false; }
}
async function 見張らせる(env, uid, callId, until) {
  if (!env?.CALL_HUB) return;
  try {
    const stub = env.CALL_HUB.get(env.CALL_HUB.idFromName("u:" + N(uid, 0)));
    await stub.fetch("https://call.hub/ring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: S(callId, 64), until: N(until, 0) })
    });
  } catch (e) {}
}

/* ══ 通話を 終える（1 か所に まとめる）════════════════════════════════ */
async function 通話を引く(env, callId) {
  return await env.DB.prepare("SELECT * FROM calls WHERE call_id = ?1")
    .bind(S(callId, 64)).first().catch(() => null);
}
async function 終える(env, callId, reason, state) {
  const row = await 通話を引く(env, callId);
  if (!row) return null;
  if (S(row.state) === "ended" || S(row.state) === "rejected"
      || S(row.state) === "missed" || S(row.state) === "failed") return row;
  const t = 今();
  const 接 = N(row.connected_at, 0);
  const 秒 = 接 ? Math.max(0, Math.round((t - 接) / 1000)) : 0;
  const 次 = S(state || (接 ? "ended" : "missed"), 20);
  await env.DB.prepare(`
    UPDATE calls SET state = ?2, ended_at = ?3, duration_sec = ?4, end_reason = ?5
     WHERE call_id = ?1
  `).bind(S(callId, 64), 次, t, 秒, S(reason || "hangup", 40)).run().catch(() => null);
  /* SFU の 部屋を 必ず 閉じる（**閉じ忘れは 課金に 直結する**） */
  await sfuCloseCall(env, row).catch(() => {});
  return Object.assign({}, row, { state: 次, ended_at: t, duration_sec: 秒 });
}

async function 両方へ(env, row, msg) {
  await Promise.all([
    押す(env, N(row.caller_id, 0), msg),
    押す(env, N(row.callee_id, 0), msg)
  ]);
}

/* 通話中に ブロックされたら その場で 切る。worker.js の ブロックから 呼ぶ。 */
export async function callsOnBlock(env, blockerId, blockedId) {
  try {
    await ensureCallSchema(env);
    const a = N(blockerId, 0), b = N(blockedId, 0);
    if (!a || !b) return;
    const row = await env.DB.prepare(`
      SELECT * FROM calls
       WHERE state IN ('ringing','connected')
         AND ((caller_id = ?1 AND callee_id = ?2) OR (caller_id = ?2 AND callee_id = ?1))
       ORDER BY started_at DESC LIMIT 1
    `).bind(a, b).first().catch(() => null);
    if (!row) return;
    const 後 = await 終える(env, S(row.call_id, 64), "blocked", N(row.connected_at, 0) ? "ended" : "rejected");
    await 記す(env, S(row.call_id, 64), "blocked", a, "");
    await 両方へ(env, row, { type: "call.blocked", callId: S(row.call_id, 64),
      state: S(後?.state || "ended"), reason: "blocked" });
  } catch (e) { /* 切れなくても ブロック そのものは 成立させる */ }
}

/* ══ ⑥ Cloudflare Realtime（SFU）══════════════════════════════════════
   ★ 1 対 1 でも **必ず SFU を 通す**。P2P だと 相手に IP が 漏れる。
   ★ 鍵（App Secret）は **画面へ 出さない**。ここで 中継する。 */
/* ★ 検証用の「作りものの SFU」（2026-08-29）。
   **開発版でしか 動かない。** 本番の 鍵（VQ_ENV）が development で ない かぎり
   どれだけ 変数を 立てても false。
   なぜ 要るか: SFU の 鍵が 無いと、合図・状態・通報・Lumi の 同意まで
   **1 つも 測れない**。音が 流れない ことだけを 諦めて、残りを 測れるように する。 */
function にせSFUか(env) {
  /* ★ **2 つとも 開発版の wrangler.dev.toml にしか 書いていない 変数**。
     AI_PROBE_ENABLED は 「本番の wrangler.toml には 入れない」と
     もとから 決めてある もの。CALLS_FAKE は ここで 新しく 足した もの。
     片方だけでは 立たないので、本番へ 紛れ込む 目は ほぼ 無い。 */
  return String(env?.CALLS_FAKE || "") === "1"
    && String(env?.AI_PROBE_ENABLED || "") === "1";
}
/* ══ 通話の 土台は 2 通り ══════════════════════════════════════════════
   ★ どちらも **SFU（中継）**。P2P には しない（相手に IP を 見せない）。
     鍵の 入りかたで 自動で 選ぶ。両方 入っていれば RealtimeKit を 先に 使う。

     rtk … Cloudflare RealtimeKit（会議を 作って 参加札を 配る 上位の 作り）
     sfu … Cloudflare Realtime サーバーレス SFU（自分で 管を つなぐ 作り）
     fake … 開発版だけの 作りもの（音は 流れない。段取りだけ 測る ため）

   ★ **どちらの 作りでも 判定・同意・通報・制限・Lumi は 同じ もの**を 通る。
     変わるのは 「音の 通り道を どう 作るか」だけ。 */
function 土台(env) {
  const r = rtk設定(env);
  if (r.ok) return "rtk";
  const c = sfu設定(env);
  if (c.ok) return "sfu";
  if (c.にせ) return "fake";
  return "";
}

/* ── RealtimeKit ────────────────────────────────────────────────────
   POST /accounts/{acct}/realtime/kit/{app}/meetings              → 会議
   POST /accounts/{acct}/realtime/kit/{app}/meetings/{id}/participants → 参加札
   GET  /accounts/{acct}/realtime/kit/{app}/presets               → 役の 一覧
   ★ App ID と 役の 名前は **入っていなければ 自分で 拾う**（人に 探させない）。 */
const CF_API = "https://api.cloudflare.com/client/v4";
function rtk設定(env) {
  const acct = S(env?.CF_ACCOUNT_ID, 120).trim();
  const token = S(env?.RTK_API_TOKEN, 400).trim();
  return { acct, token, appId: S(env?.RTK_APP_ID, 120).trim(),
           preset: S(env?.RTK_PRESET, 120).trim(), ok: !!(acct && token) };
}
async function cf(env, path, method, body) {
  const r = rtk設定(env);
  const res = await fetch(CF_API + "/accounts/" + encodeURIComponent(r.acct) + path, {
    method: method || "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + r.token },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await res.json().catch(() => null);
  return { ok: res.ok && j?.success !== false, status: res.status, json: j,
           err: S(j?.errors?.[0]?.message || j?.error || (res.ok ? "" : "HTTP " + res.status), 300) };
}
/* ★ RealtimeKit の 返事は **data** に 入る（Cloudflare の 他の API の result では ない。
   実測 2026-08-29: {"success":true,"data":[…],"paging":{…}}）。両方 見る。 */
function 中身(j) {
  if (!j) return null;
  return j.data !== undefined ? j.data : j.result;
}
/* 拾った ものは 実体の 中で 10 分 持ち回す（毎回 聞きに行かない）。 */
let _rtk覚え = { at: 0, appId: "", preset: "" };
async function rtkアプリ(env) {
  const r = rtk設定(env);
  if (r.appId) return r.appId;
  if (_rtk覚え.appId && 今() - _rtk覚え.at < 600000) return _rtk覚え.appId;
  /* ★ 一覧の 口は「 /realtime/kit/apps 」。「 /realtime/kit 」では 無い（実測 2026-08-29）。
     ここに ** で 囲む 書きかたを すると、閉じの 記号が 先に 来て 束ねが 落ちる。 */
  const res = await cf(env, "/realtime/kit/apps", "GET");
  const 一覧 = 中身(res.json);
  const 並 = Array.isArray(一覧) ? 一覧 : (一覧?.apps || []);
  const 先 = 並[0] || null;
  const id = S(先?.id || 先?.app_id || 先?.uuid, 120);
  if (id) _rtk覚え = { at: 今(), appId: id, preset: _rtk覚え.preset };
  else console.warn("[call] rtk apps:", S(JSON.stringify(res.json), 300));
  return id;
}
async function rtk役(env, appId) {
  const r = rtk設定(env);
  if (r.preset) return r.preset;
  if (_rtk覚え.preset && 今() - _rtk覚え.at < 600000) return _rtk覚え.preset;
  const res = await cf(env, "/realtime/kit/" + encodeURIComponent(appId) + "/presets", "GET");
  const 一覧 = 中身(res.json);
  const 並 = Array.isArray(一覧) ? 一覧 : (一覧?.presets || []);
  const 名 = (x) => S(x?.name || x?.preset_name, 120);
  /* ★ 選ぶ 順（実測 2026-08-29: 既定で group_call_guest / _host / _participant …）。
     ・音声だけの 役が あれば いちばん 良い
     ・次は participant。**guest は 待合室に 入る 作りの ことが ある**ので 後回し
     ・それも 無ければ host（1 対 1 なので 権限が 広くても 困らない） */
  const 音 = 並.find((x) => /audio|voice|音/i.test(名(x)));
  const 参 = 並.find((x) => /participant/i.test(名(x)));
  const 主 = 並.find((x) => /host/i.test(名(x)));
  const 客 = 並.find((x) => !/guest|viewer|watch/i.test(名(x)));
  const 出 = 名(音 || 参 || 主 || 客 || 並[0]);
  if (出) _rtk覚え = { at: 今(), appId: _rtk覚え.appId || appId, preset: 出 };
  return 出;
}
/* この 通話の 会議を 用意する。**先に 書いた 人が 勝つ**（二重に 作らない）。 */
async function 会議を用意する(env, row) {
  const callId = S(row.call_id, 64);
  const いま = S(row.room_id, 120);
  if (いま && いま !== callId) return { meetingId: いま };      /* もう ある */
  const appId = await rtkアプリ(env);
  if (!appId) return { err: "RTK_APP_NOT_FOUND" };
  const res = await cf(env, "/realtime/kit/" + encodeURIComponent(appId) + "/meetings", "POST",
    { title: "vq-" + callId.slice(-12) });
  const d = 中身(res.json) || {};
  const id = S(d.id || d.meeting_id || d.roomName, 120);
  if (!res.ok || !id) {
    console.warn("[call] rtk meeting:", S(JSON.stringify(res.json), 300));
    return { err: res.err || "RTK_MEETING_FAILED" };
  }
  /* 相手が 先に 作っていたら そちらを 使う（自分の ぶんは 捨てる）。 */
  const up = await env.DB.prepare(
    "UPDATE calls SET room_id = ?2 WHERE call_id = ?1 AND room_id = ?3")
    .bind(callId, id, callId).run().catch(() => null);
  if (N(up?.meta?.changes, 0) > 0) return { meetingId: id };
  const 後 = await 通話を引く(env, callId);
  const 勝 = S(後?.room_id, 120);
  return { meetingId: (勝 && 勝 !== callId) ? 勝 : id };
}
async function rtk参加札(env, meetingId, uid, 名) {
  const appId = await rtkアプリ(env);
  if (!appId) return { err: "RTK_APP_NOT_FOUND" };
  const preset = await rtk役(env, appId);
  if (!preset) return { err: "RTK_PRESET_NOT_FOUND" };
  const res = await cf(env, "/realtime/kit/" + encodeURIComponent(appId)
    + "/meetings/" + encodeURIComponent(meetingId) + "/participants", "POST",
    { name: S(名, 60) || ("user" + uid), preset_name: preset,
      custom_participant_id: "vq-" + N(uid, 0) });
  const d = 中身(res.json) || {};
  const t = S(d.token || d.auth_token || d.authToken, 4000);
  if (!res.ok || !t) {
    console.warn("[call] rtk participant:", S(JSON.stringify(res.json), 300));
    return { err: res.err || "RTK_PARTICIPANT_FAILED" };
  }
  return { authToken: t, preset };
}

function sfu設定(env) {
  const appId = S(env?.CALLS_APP_ID, 120).trim();
  const secret = S(env?.CALLS_APP_SECRET, 400).trim();
  return { appId, secret, ok: !!(appId && secret), にせ: にせSFUか(env) };
}
export function callsConfigured(env) { return 土台(env) !== ""; }

async function sfu(env, path, method, body) {
  const c = sfu設定(env);
  if (!c.ok && c.にせ) {
    /* 作りもの。**音は 流れない。** 形だけ 返して 先の 段取りを 測れるように する。 */
    if (/\/sessions\/new$/.test(path)) return { ok: true, status: 200, json: { sessionId: 印("fake_") } };
    if (/\/tracks\/new$/.test(path)) {
      return { ok: true, status: 200, json: {
        sessionDescription: { type: "answer", sdp: "v=0\r\n(fake)\r\n" },
        tracks: (body?.tracks || []).map((t) => ({ trackName: t.trackName, mid: t.mid || "0" })),
        requiresImmediateRenegotiation: false
      } };
    }
    return { ok: true, status: 200, json: {} };
  }
  if (!c.ok) return { ok: false, status: 503, json: { errorDescription: "CALLS_NOT_CONFIGURED" } };
  const url = "https://rtc.live.cloudflare.com/v1/apps/" + encodeURIComponent(c.appId) + path;
  const r = await fetch(url, {
    method: method || "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.secret },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, json: j };
}

/* ICE。SFU を 使うので STUN だけで 足りるが、
   TURN の 鍵が あれば 足す（厳しい 回線の 受け皿）。SFU 併用の TURN は 無料。 */
async function iceServers(env) {
  const out = [{ urls: "stun:stun.cloudflare.com:3478" }];
  const kid = S(env?.CALLS_TURN_KEY_ID, 120).trim();
  const tok = S(env?.CALLS_TURN_TOKEN, 400).trim();
  if (!kid || !tok) return out;
  try {
    const r = await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/"
      + encodeURIComponent(kid) + "/credentials/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ ttl: 3600 })
    });
    const j = await r.json().catch(() => null);
    if (j && j.iceServers) out.push(j.iceServers);
  } catch (e) {}
  return out;
}

async function sfuCloseCall(env, row) {
  const c = sfu設定(env);
  if (!row) return;
  /* RealtimeKit は 会議が 自分で 畳む（人が 抜ければ 終わる）。閉じる 口は 要らない。 */
  if (rtk設定(env).ok) return;
  if (!c.ok && !c.にせ) return;
  for (const sid of [S(row.caller_session, 120), S(row.callee_session, 120)]) {
    if (!sid) continue;
    try {
      await sfu(env, "/sessions/" + encodeURIComponent(sid) + "/tracks/close", "PUT",
        { tracks: [], force: true, sessionDescription: undefined });
    } catch (e) {}
  }
  try {
    await env.DB.prepare("UPDATE calls SET caller_session='', callee_session='' WHERE call_id = ?1")
      .bind(S(row.call_id, 64)).run();
  } catch (e) {}
}

/* ══ ⑦ Lumi の 割り込み ════════════════════════════════════════════════
   ★ **有料の 鍵しか 使わない。** 無ければ 起動させない（黙って 無料枠へ 流さない）。 */
const LUMI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
function 有料の鍵(env) {
  /* 名前は 「有料」だと 分かる ものだけ。無料枠の 鍵（GEMINI_API_KEY…）は 見ない。 */
  for (const n of ["GEMINI_PAID_API_KEY", "GEMINI_API_KEY_PAID", "CALL_LUMI_API_KEY"]) {
    const v = S(env?.[n], 400).trim();
    if (v) return { key: v, name: n };
  }
  return null;
}
export function callsLumiConfigured(env) { return !!有料の鍵(env); }

async function lumi一時トークン(env) {
  const k = 有料の鍵(env);
  if (!k) return { err: "LUMI_PAID_KEY_MISSING" };
  const t = 今();
  const body = {
    uses: 1,
    expireTime: new Date(t + 25 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(t + 90 * 1000).toISOString()
  };
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": k.key },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => null);
    if (j && j.name) return { token: S(j.name, 400), keyName: k.name };
    return { err: S(j?.error?.message || r.status, 160) };
  } catch (e) { return { err: S(e?.message || e, 140) }; }
}

const LUMI_CALL_SYS = [
  "あなたは Lumi。いま 2 人の 音声通話に 招かれています。",
  "・呼ばれた ときだけ 話します。用が 済んだら すぐ 黙ります。",
  "・短く 話します。長い 説明は しません（3 文まで）。",
  "・2 人の 会話を 遮らないでください。聞かれた ことにだけ 答えます。",
  "・個人情報を 聞き出さない。連絡先や 住所を 尋ねない。",
  "・「ありがとう」「もう いいよ」と 言われたら 「はい、抜けますね」と 言って 終わります。",
  "・日本語で 話します。",
  "",
  "【画面の 同席について】",
  "・2 人が 画面を 同席している ときは、いま 見えている ものが",
  "  『いまの 画面』として 文字で 渡されます。渡された ときは 黙って 受け取り、",
  "  **それに ついて 聞かれた ときだけ** 答えます。",
  "・画面が 変わっただけで 話しかけない。読み上げも しない。",
  "・『これ』『この 問題』『いま 見えてる やつ』は **いちばん 新しい 画面**の ことです。",
  "・画面に 書いていない ことを 推測で 言わない。分からなければ 分からないと 言う。",
  "・クイズの 画面の ときは **答えを 先に 言わない**。聞かれたら ヒントから 出す。"
].join("\n");

/* ══ ③ 口（REST）════════════════════════════════════════════════════════ */

export function isCallPath(path) {
  return path === "/ws/call" || path.startsWith("/api/call/");
}

async function 体(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

export async function handleCallRequest(request, env, ctx) {
  let path = "/";
  try { path = (new URL(request.url).pathname || "/").replace(/\/+$/, "") || "/"; }
  catch (e) { return null; }
  if (!isCallPath(path)) return null;
  const m = request.method.toUpperCase();
  if (m === "OPTIONS") return new Response(null, { status: 204 });

  try {
    await ensureCallSchema(env);

    /* ── 合図の 通り道 ── */
    if (path === "/ws/call") return await wsつなぐ(request, env);

    const me = await 人(request, env);
    if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
    const uid = me.uid;
    const b = (m === "POST" || m === "PUT") ? await 体(request) : {};

    if (m === "POST" && path === "/api/call/ticket") return await 口の合言葉(env, uid);
    if (m === "GET" && path === "/api/call/config") return await 口の設定(env, uid);
    if (m === "POST" && path === "/api/call/consent") return await 口の同意(env, uid, b);
    if (m === "POST" && path === "/api/call/settings") return await 口の設定変更(env, uid, b);
    if (m === "POST" && path === "/api/call/can") return await 口のかけられるか(env, uid, b);
    if (m === "POST" && path === "/api/call/invite") return await 口の発信(env, uid, b);
    if (m === "POST" && path === "/api/call/accept") return await 口の応答(env, uid, b);
    if (m === "POST" && path === "/api/call/reject") return await 口の拒否(env, uid, b);
    if (m === "POST" && path === "/api/call/cancel") return await 口の取消(env, uid, b);
    if (m === "POST" && path === "/api/call/end") return await 口の切断(env, uid, b);
    if (m === "GET" && path === "/api/call/state") return await 口の様子(request, env, uid);
    if (m === "POST" && path === "/api/call/ice") return await 口の中継(env, uid, b);
    if (m === "POST" && path === "/api/call/report") return await 口の通報(env, uid, b);
    if (m === "GET" && path === "/api/call/history") return await 口の履歴(env, uid);

    /* ★ **開発版だけ**の 覗き口。Cloudflare の 返事の 形を そのまま 見る。
       本番では 立たない（AI_PROBE_ENABLED は 開発版の toml にしか 無い）。 */
    if (m === "GET" && path === "/api/call/rtc/apps") {
      if (String(env?.AI_PROBE_ENABLED || "") !== "1") return bad("NOT_FOUND", "ありません。", 404);
      const a = await cf(env, "/realtime/kit/apps", "GET");
      const 並 = 中身(a.json);
      const one = Array.isArray(並) ? 並[0] : null;
      const appId = S(one?.id || one?.app_id || one?.uuid, 120);
      const pr = appId ? await cf(env, "/realtime/kit/" + encodeURIComponent(appId) + "/presets", "GET") : null;
      /* 会議と 参加札も 1 回 作って、返事の 形を そのまま 見せる（開発版だけ）。 */
      let mt = null, pt = null;
      /* 会議を 作るのは ?deep=1 の ときだけ（毎回 作らない）。 */
      const 深く = new URL(request.url).searchParams.get("deep") === "1";
      if (appId && 深く) {
        mt = await cf(env, "/realtime/kit/" + encodeURIComponent(appId) + "/meetings", "POST",
          { title: "vq-shape-check" });
        const mid = S((中身(mt.json) || {}).id, 120);
        const pn = await rtk役(env, appId).catch(() => "");
        if (mid && pn) {
          pt = await cf(env, "/realtime/kit/" + encodeURIComponent(appId)
            + "/meetings/" + encodeURIComponent(mid) + "/participants", "POST",
            { name: "shape", preset_name: pn, custom_participant_id: "vq-shape" });
        }
      }
      return json({ ok: true, appId, apps: a.json, presets: pr ? pr.json : null,
        meeting: mt ? mt.json : null,
        participant: pt ? { status: pt.status, keys: Object.keys((中身(pt.json) || {})),
          長さ: S((中身(pt.json) || {}).token, 4000).length, 生: pt.ok ? undefined : pt.json } : null });
    }
    if (m === "POST" && path === "/api/call/rtc/join") return await 口の入場(env, uid, me, b);
    if (m === "POST" && path === "/api/call/rtc/session") return await 口のSFU部屋(env, uid, b);
    if (m === "POST" && path === "/api/call/rtc/tracks") return await 口のSFU管(env, uid, b);
    if (m === "PUT" && path === "/api/call/rtc/renegotiate") return await 口のSFU再交渉(env, uid, b);
    if (m === "POST" && path === "/api/call/rtc/close") return await 口のSFU閉じ(env, uid, b);

    /* 画面の 同席（VocabuQuiz の 中だけ。映像は 送らない） */
    if (m === "POST" && path === "/api/call/share/start") return await 口の共有開始(env, uid, b);
    if (m === "POST" && path === "/api/call/share/stop") return await 口の共有終い(env, uid, b);
    if (m === "POST" && path === "/api/call/share/frame") return await 口の共有フレーム(env, uid, b);

    if (m === "POST" && path === "/api/call/lumi/request") return await 口のLumi呼ぶ(env, uid, b);
    if (m === "POST" && path === "/api/call/lumi/consent") return await 口のLumi同意(env, uid, b);
    if (m === "POST" && path === "/api/call/lumi/end") return await 口のLumi終い(env, uid, b);

    return bad("NOT_FOUND", "そのような 口は ありません。", 404);
  } catch (e) {
    console.error("[call] " + path + " で 失敗:", S(e && (e.stack || e.message), 400));
    return bad("SERVER_ERROR", "サーバで 失敗しました。", 500);
  }
}

/* ── 合言葉（WS 用。60 秒だけ 有効）──────────────────────────────────
   ★ **D1 に 置かない。** 置いて 読み直すと、書いた 直後の 読みが
     複製の ほうへ 行って **たまに 401 に なる**（実測 2026-08-29:
     着信が 5 回に 1 回 届かなかった 真因が これ）。
     署名して 自分で 確かめる。表も 通信も 要らないので ずれようが ない。 */
function 合言葉の鍵(env) {
  return S(env?.REGISTRATION_SESSION_SECRET, 400)
    || S(env?.OTP_PEPPER, 400)
    || S(env?.CALLS_APP_SECRET, 400)
    || S(env?.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id, 200)
    || "vq-call-ticket";
}
function b64u(buf) {
  let s2 = "";
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) s2 += String.fromCharCode(u8[i]);
  return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function 署名(env, 中身) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(合言葉の鍵(env)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(中身));
  return b64u(sig);
}
async function 口の合言葉(env, uid) {
  const 期限 = 今() + 60 * 1000;
  const 中身 = uid + "." + 期限;
  const t = 中身 + "." + (await 署名(env, 中身));
  return json({ ok: true, ticket: t, expiresAt: 期限 });
}
async function 合言葉から(env, ticket) {
  const k = S(ticket, 400);
  const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(k);
  if (!m) return 0;
  const uid = N(m[1], 0), 期限 = N(m[2], 0);
  if (!uid || 期限 < 今()) return 0;
  if (期限 > 今() + 5 * 60 * 1000) return 0;          /* 先の 日付を 名乗らせない */
  const 正 = await 署名(env, uid + "." + 期限);
  /* 長さの ちがいで 早く 抜けない ように、そろえてから 1 文字ずつ 見る。 */
  if (正.length !== m[3].length) return 0;
  let 差 = 0;
  for (let i = 0; i < 正.length; i++) 差 |= 正.charCodeAt(i) ^ m[3].charCodeAt(i);
  return 差 === 0 ? uid : 0;
}

/* ── 設定・同意 ── */
async function 口の設定(env, uid) {
  const s = await 設定(env, uid);
  const L = await 制限(env);
  const 使 = await 今日の使用(env, uid);
  return json({
    ok: true,
    me: uid,
    configured: callsConfigured(env),
    lumiConfigured: callsLumiConfigured(env),
    consentVersion: CALL_CONSENT_VERSION,
    lumiConsentVersion: CALL_LUMI_CONSENT_VERSION,
    consented: s.consented,
    callEnabled: s.callEnabled,
    limits: L,
    today: { calls: 使.発信回数, seconds: 使.通話秒, lumi: 使.lumi回数 }
  });
}
async function 口の同意(env, uid, b) {
  const agree = b?.agree === true;
  const t = 今();
  await env.DB.prepare(`
    INSERT INTO call_settings (user_id, call_enabled, consent_version, consent_at, updated_at)
    VALUES (?1, 1, ?2, ?3, ?3)
    ON CONFLICT(user_id) DO UPDATE SET consent_version = ?2, consent_at = ?3, updated_at = ?3
  `).bind(uid, agree ? CALL_CONSENT_VERSION : "", agree ? t : 0).run().catch(() => null);
  await 記す(env, "", agree ? "consent.call.agree" : "consent.call.withdraw", uid, CALL_CONSENT_VERSION);
  return json({ ok: true, consented: agree });
}
async function 口の設定変更(env, uid, b) {
  const on = b?.callEnabled !== false;
  const t = 今();
  await env.DB.prepare(`
    INSERT INTO call_settings (user_id, call_enabled, consent_version, consent_at, updated_at)
    VALUES (?1, ?2, '', 0, ?3)
    ON CONFLICT(user_id) DO UPDATE SET call_enabled = ?2, updated_at = ?3
  `).bind(uid, on ? 1 : 0, t).run().catch(() => null);
  /* 切ったら、いま 鳴っている ものは 止める。 */
  if (!on) {
    const c = await 通話中(env, uid);
    if (c) {
      const 後 = await 終える(env, S(c.call_id, 64), "disabled", N(c.connected_at, 0) ? "ended" : "rejected");
      await 両方へ(env, c, { type: "call.end", callId: S(c.call_id, 64),
        state: S(後?.state || "ended"), reason: "disabled" });
    }
  }
  return json({ ok: true, callEnabled: on });
}
async function 口のかけられるか(env, uid, b) {
  const peer = N(b?.peerId, 0);
  const r = await canCall(env, uid, peer);
  return json({ ok: true, allowed: r.allowed, code: r.code, message: r.message });
}

/* ── 発信・応答 ── */
async function 口の発信(env, uid, b) {
  const peer = N(b?.peerId, 0);
  const r = await canCall(env, uid, peer);
  if (!r.allowed) return json({ ok: false, code: r.code, message: r.message }, 403);
  if (!callsConfigured(env)) {
    return json({ ok: false, code: "CALLS_NOT_CONFIGURED",
      message: "通話の 準備が まだ できていません（管理者へ）。" }, 503);
  }
  const callId = 印("call_");
  const t = 今();
  await env.DB.prepare(`
    INSERT INTO calls (call_id, caller_id, callee_id, state, room_id, started_at)
    VALUES (?1, ?2, ?3, 'ringing', ?4, ?5)
  `).bind(callId, uid, peer, callId, t).run();
  await 記す(env, callId, "invite", uid, "");
  const 相手 = await 相手の札(env, peer);
  const 自分 = await 相手の札(env, uid);
  const 届いた = await 押す(env, peer, { type: "call.invite", callId, from: 自分, at: t, expiresAt: t + RING_MS });
  await 押す(env, uid, { type: "call.ringing", callId, to: 相手, at: t, expiresAt: t + RING_MS });
  await 見張らせる(env, peer, callId, t + RING_MS);
  await 見張らせる(env, uid, callId, t + RING_MS);
  /* delivered … 相手の 画面が 合図の 通り道に つながって いたか。
     false でも 相手が 開き直せば 拾える（/api/call/state）。測るために 返す。 */
  return json({ ok: true, callId, peer: 相手, expiresAt: t + RING_MS, delivered: 届いた });
}

async function 相手の札(env, uid) {
  const row = await env.DB.prepare(`
    SELECT u.id AS userId, u.nickname, u.grade_prefix,
           up.display_name, up.handle, up.avatar_url
      FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = ?1 LIMIT 1
  `).bind(N(uid, 0)).first().catch(() => null);
  if (!row) return { userId: N(uid, 0), displayName: "利用者", handle: "user", avatar: "" };
  return {
    userId: N(row.userId, 0),
    displayName: S(row.display_name, 60) || S(row.nickname, 60) || "利用者",
    handle: S(row.handle, 60) || S(row.nickname, 60) || "user",
    avatar: S(row.avatar_url, 400)
  };
}

async function 通話の関所(env, uid, callId, 期待) {
  const row = await 通話を引く(env, callId);
  if (!row) return { err: bad("NOT_FOUND", "その 通話は ありません。", 404) };
  const a = N(row.caller_id, 0), b2 = N(row.callee_id, 0);
  if (uid !== a && uid !== b2) return { err: bad("FORBIDDEN", "この 通話には 入れません。", 403) };
  if (期待 && 期待.indexOf(S(row.state)) < 0) {
    return { err: json({ ok: false, code: "BAD_STATE", message: "いまの 状態では できません。",
      state: S(row.state) }, 409) };
  }
  /* ★ **合図の たびに 決め直す。** ここを 省くと 通話中の ブロックが 効かない。 */
  const g = await canCall(env, uid, uid === a ? b2 : a,
    { allowCallId: S(row.call_id, 64), skipQuota: true, skipPeerConsent: true });
  if (!g.allowed) {
    const 後 = await 終える(env, S(row.call_id, 64), g.code === "NOT_AVAILABLE" ? "blocked" : "gate",
      N(row.connected_at, 0) ? "ended" : "rejected");
    await 両方へ(env, row, { type: "call.blocked", callId: S(row.call_id, 64),
      state: S(後?.state || "ended"), reason: g.code });
    return { err: json({ ok: false, code: g.code, message: g.message }, 403) };
  }
  return { row, peer: uid === a ? b2 : a, 自分が発信 : uid === a };
}

async function 口の応答(env, uid, b) {
  const callId = S(b?.callId, 64);
  const g = await 通話の関所(env, uid, callId, ["ringing"]);
  if (g.err) return g.err;
  if (N(g.row.callee_id, 0) !== uid) {
    return bad("FORBIDDEN", "受ける 側だけが 応答できます。", 403);
  }
  /* 受ける 側の 同意も ここで 確かめる（画面を 直しても 抜けられない）。 */
  const s = await 設定(env, uid);
  if (!s.consented) return json({ ok: false, code: "CONSENT_REQUIRED",
    message: "通話を 使う前に 同意が 必要です。" }, 403);
  const t = 今();
  await env.DB.prepare("UPDATE calls SET state='connected', connected_at=?2 WHERE call_id=?1")
    .bind(callId, t).run();
  await 記す(env, callId, "accept", uid, "");
  /* RealtimeKit の ときは ここで 会議を 1 つ 作っておく（出る 人だけが 作る）。
     失敗しても 通話は 続ける — 下の join が もう一度 作りに行く。 */
  if (土台(env) === "rtk") {
    const mk = await 会議を用意する(env, g.row).catch(() => ({ err: "x" }));
    if (mk.err) console.warn("[call] 会議を 作れず:", mk.err);
  }
  const L = await 制限(env);
  const 上限 = Math.max(1, N(L["call.max_minutes"], 60)) * 60 * 1000;
  await 両方へ(env, g.row, { type: "call.accept", callId, at: t, hardEndAt: t + 上限 });
  return json({ ok: true, callId, connectedAt: t, hardEndAt: t + 上限 });
}

async function 口の拒否(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return bad("NOT_FOUND", "その 通話は ありません。", 404);
  if (N(row.callee_id, 0) !== uid) return bad("FORBIDDEN", "受ける 側だけが 断れます。", 403);
  const 後 = await 終える(env, callId, "reject", "rejected");
  await 記す(env, callId, "reject", uid, "");
  await 両方へ(env, row, { type: "call.reject", callId, state: "rejected" });
  return json({ ok: true, state: S(後?.state || "rejected") });
}

async function 口の取消(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return bad("NOT_FOUND", "その 通話は ありません。", 404);
  if (N(row.caller_id, 0) !== uid) return bad("FORBIDDEN", "かけた 側だけが 取り消せます。", 403);
  const 後 = await 終える(env, callId, "cancel", "missed");
  await 記す(env, callId, "cancel", uid, "");
  await 両方へ(env, row, { type: "call.cancel", callId, state: S(後?.state || "missed") });
  return json({ ok: true, state: S(後?.state || "missed") });
}

async function 口の切断(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return bad("NOT_FOUND", "その 通話は ありません。", 404);
  if (N(row.caller_id, 0) !== uid && N(row.callee_id, 0) !== uid) {
    return bad("FORBIDDEN", "この 通話には 入れません。", 403);
  }
  const 後 = await 終える(env, callId, S(b?.reason, 40) || "hangup",
    N(row.connected_at, 0) ? "ended" : "missed");
  await 記す(env, callId, "end", uid, S(b?.reason, 40));
  await 両方へ(env, row, { type: "call.end", callId, state: S(後?.state || "ended"),
    durationSec: N(後?.duration_sec, 0) });
  return json({ ok: true, state: S(後?.state || "ended"), durationSec: N(後?.duration_sec, 0) });
}

async function 口の様子(request, env, uid) {
  let callId = "";
  try { callId = S(new URL(request.url).searchParams.get("callId"), 64); } catch (e) {}
  let row = callId ? await 通話を引く(env, callId) : await 通話中(env, uid);
  if (!row) return json({ ok: true, call: null });
  if (N(row.caller_id, 0) !== uid && N(row.callee_id, 0) !== uid) {
    return bad("FORBIDDEN", "この 通話には 入れません。", 403);
  }
  /* 見に来た ときにも 決め直す。 */
  if (S(row.state) === "ringing" || S(row.state) === "connected") {
    const peer = N(row.caller_id, 0) === uid ? N(row.callee_id, 0) : N(row.caller_id, 0);
    const g = await canCall(env, uid, peer,
      { allowCallId: S(row.call_id, 64), skipQuota: true, skipPeerConsent: true });
    if (!g.allowed) {
      const 後 = await 終える(env, S(row.call_id, 64), "gate", N(row.connected_at, 0) ? "ended" : "rejected");
      await 両方へ(env, row, { type: "call.blocked", callId: S(row.call_id, 64),
        state: S(後?.state || "ended"), reason: g.code });
      row = 後 || row;
    }
  }
  const 相 = await 相手の札(env, N(row.caller_id, 0) === uid ? N(row.callee_id, 0) : N(row.caller_id, 0));
  return json({ ok: true, call: {
    callId: S(row.call_id, 64), state: S(row.state, 20),
    iCall: N(row.caller_id, 0) === uid,
    peer: 相,
    startedAt: N(row.started_at, 0), connectedAt: N(row.connected_at, 0),
    endedAt: N(row.ended_at, 0), durationSec: N(row.duration_sec, 0),
    lumiUsed: N(row.lumi_used, 0) === 1,
    lumiOn: N(row.lumi_started_at, 0) > 0 && !N(row.ended_at, 0)
  } });
}

/* ICE の 中継。SFU を 使うので ふつうは 要らないが、
   合図の 道は 1 本に しておく（相手の 端末へ 直に は 送らない）。 */
async function 口の中継(env, uid, b) {
  const g = await 通話の関所(env, uid, S(b?.callId, 64), ["ringing", "connected"]);
  if (g.err) return g.err;
  await 押す(env, g.peer, { type: "call.ice", callId: S(b?.callId, 64),
    from: uid, payload: b?.payload || null });
  return json({ ok: true });
}

async function 口の履歴(env, uid) {
  const r = await env.DB.prepare(`
    SELECT call_id, caller_id, callee_id, state, started_at, connected_at, ended_at,
           duration_sec, end_reason, lumi_used
      FROM calls
     WHERE caller_id = ?1 OR callee_id = ?1
     ORDER BY started_at DESC LIMIT 50
  `).bind(uid).all().catch(() => null);
  const rows = (r?.results || []).map((x) => ({
    callId: S(x.call_id, 64), state: S(x.state, 20),
    iCall: N(x.caller_id, 0) === uid,
    peerId: N(x.caller_id, 0) === uid ? N(x.callee_id, 0) : N(x.caller_id, 0),
    startedAt: N(x.started_at, 0), durationSec: N(x.duration_sec, 0),
    endReason: S(x.end_reason, 40), lumiUsed: N(x.lumi_used, 0) === 1
  }));
  return json({ ok: true, calls: rows });
}

/* ── 入場（どの 土台で つなぐか を ここで 決めて 返す）──────────────
   ★ 画面は 「どの 土台か」を 自分で 決めない。ここが 返した とおりに する。 */
async function 口の入場(env, uid, me, b) {
  const callId = S(b?.callId, 64);
  const g = await 通話の関所(env, uid, callId, ["ringing", "connected"]);
  if (g.err) return g.err;
  const 種 = 土台(env);
  if (!種) {
    return json({ ok: false, code: "CALLS_NOT_CONFIGURED",
      message: "通話の 準備が まだ できていません（管理者へ）。" }, 503);
  }
  if (種 !== "rtk") {
    /* サーバーレス SFU（および 開発版の 作りもの）は これまでの 口を 使う。 */
    return json({ ok: true, driver: "sfu" });
  }
  const mk = await 会議を用意する(env, g.row);
  if (mk.err) {
    return json({ ok: false, code: "RTK_FAILED",
      message: "通話の 部屋を 作れませんでした。", detail: mk.err }, 502);
  }
  const 札 = await rtk参加札(env, mk.meetingId, uid, me && me.nickname);
  if (札.err) {
    return json({ ok: false, code: "RTK_FAILED",
      message: "通話に 入れませんでした。", detail: 札.err }, 502);
  }
  return json({ ok: true, driver: "rtk", meetingId: mk.meetingId,
    authToken: 札.authToken, preset: 札.preset });
}

/* ── SFU の 中継 ── */
async function 口のSFU部屋(env, uid, b) {
  const callId = S(b?.callId, 64);
  const g = await 通話の関所(env, uid, callId, ["ringing", "connected"]);
  if (g.err) return g.err;
  const r = await sfu(env, "/sessions/new", "POST", {});
  if (!r.ok || !r.json?.sessionId) {
    return json({ ok: false, code: "SFU_FAILED",
      message: "通話の 部屋を 作れませんでした。",
      detail: S(r.json?.errorDescription, 160) }, 502);
  }
  const sid = S(r.json.sessionId, 120);
  const 列 = g.自分が発信 ? "caller_session" : "callee_session";
  await env.DB.prepare("UPDATE calls SET " + 列 + " = ?2 WHERE call_id = ?1")
    .bind(callId, sid).run().catch(() => null);
  /* 相手の 部屋（もう 作られていれば）を 返し、こちらの 部屋を 相手へ 知らせる。
     これが 無いと **どちらも 相手の 音を 取りに 行けない**。 */
  const 相手の部屋 = S(g.自分が発信 ? g.row.callee_session : g.row.caller_session, 120);
  await 押す(env, g.peer, { type: "call.rtc.peer", callId, sessionId: sid });
  return json({ ok: true, sessionId: sid, peerSessionId: 相手の部屋,
    iceServers: await iceServers(env) });
}

/* 「その 通話の、その 人の 部屋か」を 必ず 確かめる。 */
async function SFUの持ち主か(env, uid, callId, sessionId) {
  const row = await 通話を引く(env, callId);
  if (!row) return { err: bad("NOT_FOUND", "その 通話は ありません。", 404) };
  const 自分が発信 = N(row.caller_id, 0) === uid;
  if (!自分が発信 && N(row.callee_id, 0) !== uid) {
    return { err: bad("FORBIDDEN", "この 通話には 入れません。", 403) };
  }
  const 持 = S(自分が発信 ? row.caller_session : row.callee_session, 120);
  if (!持 || 持 !== S(sessionId, 120)) {
    return { err: bad("FORBIDDEN", "その 部屋は あなたの ものでは ありません。", 403) };
  }
  return { row, 自分が発信 };
}

async function 口のSFU管(env, uid, b) {
  const callId = S(b?.callId, 64), sid = S(b?.sessionId, 120);
  const g = await 通話の関所(env, uid, callId, ["ringing", "connected"]);
  if (g.err) return g.err;
  const o = await SFUの持ち主か(env, uid, callId, sid);
  if (o.err) return o.err;
  const r = await sfu(env, "/sessions/" + encodeURIComponent(sid) + "/tracks/new", "POST", {
    sessionDescription: b?.sessionDescription || undefined,
    tracks: Array.isArray(b?.tracks) ? b.tracks : []
  });
  if (!r.ok) return json({ ok: false, code: "SFU_FAILED",
    message: "音の 通り道を 作れませんでした。", detail: S(r.json?.errorDescription, 160) }, 502);
  /* 相手が 受け取れるように、いま 出した 管の 名前を 知らせる。 */
  if (Array.isArray(b?.publish) && b.publish.length) {
    await 押す(env, g.peer, { type: "call.tracks", callId,
      sessionId: sid, tracks: b.publish.map((x) => S(x, 80)) });
  }
  return json({ ok: true, result: r.json });
}

async function 口のSFU再交渉(env, uid, b) {
  const callId = S(b?.callId, 64), sid = S(b?.sessionId, 120);
  const g = await 通話の関所(env, uid, callId, ["ringing", "connected"]);
  if (g.err) return g.err;
  const o = await SFUの持ち主か(env, uid, callId, sid);
  if (o.err) return o.err;
  const r = await sfu(env, "/sessions/" + encodeURIComponent(sid) + "/renegotiate", "PUT", {
    sessionDescription: b?.sessionDescription || undefined
  });
  if (!r.ok) return json({ ok: false, code: "SFU_FAILED",
    message: "つなぎ直せませんでした。", detail: S(r.json?.errorDescription, 160) }, 502);
  return json({ ok: true, result: r.json });
}

async function 口のSFU閉じ(env, uid, b) {
  const callId = S(b?.callId, 64), sid = S(b?.sessionId, 120);
  const o = await SFUの持ち主か(env, uid, callId, sid);
  if (o.err) return o.err;
  await sfu(env, "/sessions/" + encodeURIComponent(sid) + "/tracks/close", "PUT",
    { tracks: Array.isArray(b?.tracks) ? b.tracks : [], force: true }).catch(() => {});
  const 列 = o.自分が発信 ? "caller_session" : "callee_session";
  await env.DB.prepare("UPDATE calls SET " + 列 + " = '' WHERE call_id = ?1")
    .bind(callId).run().catch(() => null);
  return json({ ok: true });
}

/* ── 通報 ── */
const 通報の理由 = ["harassment", "inappropriate", "impersonation", "age", "solicitation", "other"];

async function 口の通報(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return bad("NOT_FOUND", "その 通話は ありません。", 404);
  const a = N(row.caller_id, 0), c = N(row.callee_id, 0);
  if (uid !== a && uid !== c) return bad("FORBIDDEN", "この 通話には 入れません。", 403);
  const 相手 = uid === a ? c : a;
  const cat = 通報の理由.indexOf(S(b?.category, 40)) >= 0 ? S(b?.category, 40) : "other";
  const detail = S(b?.detail, 1200);
  const t = 今();
  const rid = 印("crep_");

  /* ① その場で 切る */
  const 後 = await 終える(env, callId, "reported", N(row.connected_at, 0) ? "ended" : "rejected");
  /* ② 相手を 自動で ブロック（片側で 成立する） */
  await env.DB.prepare(`
    INSERT INTO dm_blocks (blocker_id, blocked_id, created_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(blocker_id, blocked_id) DO NOTHING
  `).bind(uid, 相手, t).run().catch(() => null);
  /* ③ 残す */
  await env.DB.prepare(`
    INSERT INTO call_reports (report_id, call_id, reporter_id, reported_id, category, detail, status, created_at)
    VALUES (?1,?2,?3,?4,?5,?6,'open',?7)
  `).bind(rid, callId, uid, 相手, cat, detail, t).run().catch(() => null);
  /* ④ Admin の 通報一覧（content_reports）へ 流し込む */
  try {
    await env.DB.prepare(`
      INSERT INTO content_reports (id, target_type, target_id, owner_id, reporter_id, reason, state, created_at)
      VALUES (?1, 'call', ?2, ?3, ?4, ?5, 'open', ?6)
    `).bind(rid, callId, String(相手), String(uid),
      cat + (detail ? " / " + detail.slice(0, 300) : ""), new Date(t).toISOString()).run();
  } catch (e) { /* 表が 無い 環境でも 通報そのものは 残す */ }
  await 記す(env, callId, "report", uid, cat);
  await 両方へ(env, row, { type: "call.end", callId, state: S(後?.state || "ended"), reason: "reported" });
  return json({ ok: true, reportId: rid, blocked: true, state: S(後?.state || "ended") });
}

/* ── Lumi ── */
async function 口のLumi呼ぶ(env, uid, b) {
  const callId = S(b?.callId, 64);
  const g = await 通話の関所(env, uid, callId, ["connected"]);
  if (g.err) return g.err;
  if (!callsLumiConfigured(env)) {
    return json({ ok: false, code: "LUMI_PAID_KEY_MISSING",
      message: "通話中の Lumi は いま 使えません（有料の 鍵が 未設定）。" }, 503);
  }
  const L = await 制限(env);
  const 使 = await 今日の使用(env, uid);
  if (使.lumi回数 >= Math.max(0, N(L["call.lumi.daily.count"], 10))) {
    return json({ ok: false, code: "LUMI_LIMIT", message: "今日の Lumi の 回数の 上限です。" }, 429);
  }
  /* 呼んだ 側の 同意は この 操作で 成立。相手にも 聞く。 */
  const 列 = g.自分が発信 ? "lumi_consent_caller" : "lumi_consent_callee";
  const 逆 = g.自分が発信 ? "lumi_consent_callee" : "lumi_consent_caller";
  await env.DB.prepare("UPDATE calls SET " + 列 + " = 1, " + 逆 + " = 0, lumi_asked_by = ?2 WHERE call_id = ?1")
    .bind(callId, uid).run().catch(() => null);
  await 記す(env, callId, "lumi.ask", uid, CALL_LUMI_CONSENT_VERSION);
  await 両方へ(env, g.row, { type: "call.lumi.ask", callId, by: uid,
    version: CALL_LUMI_CONSENT_VERSION });
  return json({ ok: true, waiting: true });
}

async function 口のLumi同意(env, uid, b) {
  const callId = S(b?.callId, 64);
  const agree = b?.agree === true;
  const g = await 通話の関所(env, uid, callId, ["connected"]);
  if (g.err) return g.err;
  const 列 = g.自分が発信 ? "lumi_consent_caller" : "lumi_consent_callee";
  await env.DB.prepare("UPDATE calls SET " + 列 + " = ?2 WHERE call_id = ?1")
    .bind(callId, agree ? 1 : 0).run().catch(() => null);
  await 記す(env, callId, agree ? "lumi.consent.agree" : "lumi.consent.deny", uid,
    CALL_LUMI_CONSENT_VERSION);
  const now = await 通話を引く(env, callId);
  const 両方 = N(now?.lumi_consent_caller, 0) === 1 && N(now?.lumi_consent_callee, 0) === 1;
  if (!agree) {
    await 両方へ(env, g.row, { type: "call.lumi.state", callId, on: false, reason: "denied", by: uid });
    return json({ ok: true, started: false, reason: "denied" });
  }
  if (!両方) {
    return json({ ok: true, started: false, reason: "waiting" });
  }
  /* ★ ここで はじめて 起動する。**片方の 操作だけでは ここへ 来ない。** */
  if (!callsLumiConfigured(env)) {
    return json({ ok: false, code: "LUMI_PAID_KEY_MISSING",
      message: "通話中の Lumi は いま 使えません（有料の 鍵が 未設定）。" }, 503);
  }
  const t = 今();
  await env.DB.prepare("UPDATE calls SET lumi_used = 1, lumi_started_at = ?2 WHERE call_id = ?1")
    .bind(callId, t).run().catch(() => null);
  await 記す(env, callId, "lumi.start", N(now?.lumi_asked_by, 0), "");
  const L = await 制限(env);
  const 上限秒 = Math.max(30, N(L["call.lumi.max_seconds"], 300));
  await 両方へ(env, g.row, { type: "call.lumi.state", callId, on: true,
    speaker: N(now?.lumi_asked_by, 0), maxSeconds: 上限秒 });
  /* 音を Live へ 送るのは **呼んだ 人 だけ**。
     Live API は 入力を 1 本しか 受け取らず、話者を 分けない。
     2 人ぶんを 混ぜると 誰が 話したか 分からなくなる。 */
  const 呼んだ = N(now?.lumi_asked_by, 0);
  if (uid !== 呼んだ) {
    return json({ ok: true, started: true, speaker: 呼んだ, token: null, maxSeconds: 上限秒 });
  }
  const tk = await lumi一時トークン(env);
  if (tk.err) {
    await env.DB.prepare("UPDATE calls SET lumi_started_at = 0 WHERE call_id = ?1").bind(callId).run().catch(() => null);
    await 両方へ(env, g.row, { type: "call.lumi.state", callId, on: false, reason: "failed" });
    return json({ ok: false, code: "LUMI_TOKEN_FAILED", message: "Lumi を 呼べませんでした。" }, 503);
  }
  return json({ ok: true, started: true, speaker: 呼んだ,
    token: tk.token, model: LUMI_LIVE_MODEL, systemInstruction: LUMI_CALL_SYS,
    maxSeconds: 上限秒, keyName: tk.keyName });
}

async function 口のLumi終い(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return bad("NOT_FOUND", "その 通話は ありません。", 404);
  if (N(row.caller_id, 0) !== uid && N(row.callee_id, 0) !== uid) {
    return bad("FORBIDDEN", "この 通話には 入れません。", 403);
  }
  const 秒 = Math.max(0, Math.min(3600, N(b?.seconds, 0)));
  await env.DB.prepare(`
    UPDATE calls SET lumi_seconds = lumi_seconds + ?2, lumi_started_at = 0,
                     lumi_consent_caller = 0, lumi_consent_callee = 0
     WHERE call_id = ?1
  `).bind(callId, 秒).run().catch(() => null);
  await 記す(env, callId, "lumi.end", uid, String(秒));
  await 両方へ(env, row, { type: "call.lumi.state", callId, on: false, reason: S(b?.reason, 40) || "left" });
  return json({ ok: true });
}

/* ══ ⑤ 画面の 同席（VocabuQuiz の 中だけ）══════════════════════════════
   ★ **映像は 一切 送らない。** 送るのは「いま どの 画面の どこを 見ているか」
     という **短い 文だけ**。だから
       ・iPhone でも 動く（iOS Safari に getDisplayMedia は 無い）
       ・通信量が ほぼ ゼロ（1 回 2KB 未満）
       ・**アプリの 外は 原理的に 漏れない**（他のタブも 通知も 写らない）
   ★ ここでも 保存しない。中身は 中継するだけで 表に 書かない
     （start / stop の 事実だけ call_events に 残す）。 */

/* 送ってよい 大きさ。越えたら 捨てる（好きな 量を 押し込ませない）。 */
const 共有の上限 = { 行: 12, 行の字: 200, 名: 80, 生: 6000 };

/** 相手の 画面へ そのまま 出す 文なので、ここで 削り落とす。
 *  ★ 描く 側でも 逃がして いるが、**山かっこは ここでも 落とす**。 */
function 共有の一行(s) {
  return S(s, 共有の上限.行の字)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** 受け取った 画面の 要約を **決めた 形へ 削り落とす**。知らない key は 捨てる。 */
function 画面を清める(o) {
  if (!o || typeof o !== "object") return null;
  const 行 = Array.isArray(o.lines) ? o.lines : [];
  const g = (o.go && typeof o.go === "object") ? o.go : {};
  const 出 = {
    v: 1,
    at: 今(),
    tab: S(o.tab, 32).replace(/[^a-zA-Z0-9_-]/g, ""),
    view: S(o.view, 32).replace(/[^a-zA-Z0-9_-]/g, ""),
    where: 共有の一行(o.where).slice(0, 共有の上限.名),
    title: 共有の一行(o.title).slice(0, 共有の上限.名),
    lines: 行.slice(0, 共有の上限.行).map(共有の一行).filter((x) => x.length > 0),
    go: { tab: S(g.tab, 32).replace(/[^a-zA-Z0-9_-]/g, "") }
  };
  /* 中身が 何も 無い ものは 送らない（空の 帯を 相手に 出さない）。 */
  if (!出.where && !出.title && !出.lines.length) return null;
  return 出;
}

/** 合図の たびの 重い 決め直し（通話の関所）は start / stop だけ。
 *  フレームは 毎秒 来るので **1 回の 読みだけ**で 通す。
 *  ★ それで 安全が 崩れない 理由: ブロックも 通報も 切断も
 *    **通話そのものを 終わらせる**（state が connected でなくなる）。
 *    だから state を 見れば 止まる。 */
async function 軽い関所(env, uid, callId) {
  const row = await 通話を引く(env, callId);
  if (!row) return { err: bad("NOT_FOUND", "その 通話は ありません。", 404) };
  const a = N(row.caller_id, 0), b2 = N(row.callee_id, 0);
  if (uid !== a && uid !== b2) return { err: bad("FORBIDDEN", "この 通話には 入れません。", 403) };
  if (S(row.state) !== "connected") {
    return { err: json({ ok: false, code: "BAD_STATE", message: "いまの 状態では できません。",
      state: S(row.state) }, 409) };
  }
  return { row, peer: uid === a ? b2 : a };
}

async function 口の共有開始(env, uid, b) {
  const callId = S(b?.callId, 64);
  const g = await 通話の関所(env, uid, callId, ["connected"]);
  if (g.err) return g.err;
  await 記す(env, callId, "share.start", uid, "");
  await 押す(env, g.peer, { type: "call.share.state", callId, on: true, by: uid });
  return json({ ok: true, on: true });
}

async function 口の共有終い(env, uid, b) {
  const callId = S(b?.callId, 64);
  const row = await 通話を引く(env, callId);
  if (!row) return json({ ok: true, on: false });
  if (N(row.caller_id, 0) !== uid && N(row.callee_id, 0) !== uid) {
    return bad("FORBIDDEN", "この 通話には 入れません。", 403);
  }
  /* ★ 終わりは **通話が どんな 状態でも 通す**。
     止められない 共有を 作らない（これが いちばん 怖い）。 */
  await 記す(env, callId, "share.stop", uid, S(b?.reason, 40));
  await 両方へ(env, row, { type: "call.share.state", callId, on: false, by: uid });
  return json({ ok: true, on: false });
}

async function 口の共有フレーム(env, uid, b) {
  const callId = S(b?.callId, 64);
  /* 大きすぎる ものは **読む前に** 捨てる。 */
  let 生 = "";
  try { 生 = JSON.stringify(b?.frame || {}); } catch (e) { 生 = ""; }
  if (生.length > 共有の上限.生) {
    return bad("TOO_LARGE", "画面の 中身が 大きすぎます。", 413);
  }
  const g = await 軽い関所(env, uid, callId);
  if (g.err) return g.err;
  const f = 画面を清める(b?.frame);
  if (!f) return json({ ok: true, skipped: true });
  const 届 = await 押す(env, g.peer, { type: "call.share.frame", callId, by: uid, frame: f });
  return json({ ok: true, delivered: 届 });
}

/* ══ ④ 合図の 通り道 ════════════════════════════════════════════════════ */
async function wsつなぐ(request, env) {
  if (S(request.headers.get("Upgrade"), 40).toLowerCase() !== "websocket") {
    return bad("BAD_REQUEST", "WebSocket upgrade が 必要です。", 400);
  }
  /* ★ 本物の 札を URL に 載せない。**使い捨ての 合言葉**だけを 受ける。 */
  let k = "";
  try { k = S(new URL(request.url).searchParams.get("k"), 80); } catch (e) {}
  const uid = await 合言葉から(env, k);
  if (!uid) return bad("UNAUTHORIZED", "つなぎ直してください。", 401);
  if (!env?.CALL_HUB) return bad("CALL_NOT_CONFIGURED", "Durable Object が 未設定です。", 500);
  const stub = env.CALL_HUB.get(env.CALL_HUB.idFromName("u:" + uid));
  const u = new URL(request.url);
  u.pathname = "/connect";
  u.searchParams.delete("k");
  const r = new Request(u.toString(), request);
  r.headers.set("X-Call-User-Id", String(uid));
  return await stub.fetch(r);
}

/* ══ ⑤ CallHub（Durable Object。1 人 1 個）══════════════════════════════
   ここは **押し出す だけ**。判定は しない（判定は 上の canCall 1 か所）。 */
export class CallHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.socks = new Set();
    this.uid = 0;
  }

  /* 次に 起こす 時刻を 決め直す。用は 2 つ（着信の 見張り／居なくなった 人の 始末）。 */
  async _目覚ましを直す() {
    const ring = await this.state.storage.get("ring").catch(() => null);
    const gone = await this.state.storage.get("gone").catch(() => null);
    const 候補 = [];
    if (ring && N(ring.until, 0)) 候補.push(N(ring.until, 0) + 1200);
    if (gone && N(gone.at, 0)) 候補.push(N(gone.at, 0));
    if (!候補.length) { try { await this.state.storage.deleteAlarm(); } catch (e) {} return; }
    try { await this.state.storage.setAlarm(Math.min.apply(null, 候補)); } catch (e) {}
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";

    if (path === "/connect") {
      if (S(request.headers.get("Upgrade"), 40).toLowerCase() !== "websocket") {
        return json({ ok: false, code: "BAD_REQUEST" }, 400);
      }
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      server.accept();
      this.uid = N(request.headers.get("X-Call-User-Id"), this.uid);
      if (this.uid) await this.state.storage.put("uid", this.uid).catch(() => {});
      this.socks.add(server);
      /* 戻って きたので「居なくなった」の 予定は 取り消す。 */
      await this.state.storage.delete("gone").catch(() => {});
      await this._目覚ましを直す();
      const 落とす = () => {
        try { this.socks.delete(server); } catch (e) {}
        /* ★ **通話中に タブを 閉じた／回線が 切れた**とき、これが 無いと
           通話が connected の まま 残り、SFU の 部屋も 開きっぱなしに なる
           （＝ 課金が 止まらない）。つないで いる 人が 1 人も 居なくなったら
           12 秒 待って 始末する。すぐ 切らないのは 繋ぎ直しの 一瞬で 落とさない ため。 */
        if (this.socks.size === 0) {
          this.state.storage.put("gone", { at: Date.now() + 12000 })
            .then(() => this._目覚ましを直す()).catch(() => {});
        }
      };
      server.addEventListener("close", 落とす);
      server.addEventListener("error", 落とす);
      server.addEventListener("message", (ev) => {
        /* 画面からは **合図を 受け取らない**（全部 REST を 通す）。
           生きているかの 確認だけ 返す。 */
        let d = null;
        try { d = JSON.parse(String(ev?.data || "{}")); } catch (e) { d = null; }
        if (d && d.type === "ping") {
          try { server.send(JSON.stringify({ type: "pong", at: Date.now() })); } catch (e) {}
        }
      });
      try { server.send(JSON.stringify({ type: "hello", at: Date.now() })); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === "/push" && request.method === "POST") {
      const msg = await request.json().catch(() => null);
      let n = 0;
      for (const s of Array.from(this.socks)) {
        try { s.send(JSON.stringify(msg || {})); n++; }
        catch (e) { try { this.socks.delete(s); } catch (x) {} }
      }
      return json({ ok: true, delivered: n > 0, n });
    }

    /* 着信の 見張り。30 秒 過ぎたら 不在着信に する。 */
    if (path === "/ring" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      const callId = S(b?.callId, 64), until = N(b?.until, 0);
      if (!callId || !until) return json({ ok: false }, 400);
      await this.state.storage.put("ring", { callId, until });
      await this._目覚ましを直す();
      return json({ ok: true });
    }

    return json({ ok: false, code: "NOT_FOUND" }, 404);
  }

  async alarm() {
    const env = this.env;
    /* ── ② 居なくなった 人の 始末 ── */
    const g = await this.state.storage.get("gone").catch(() => null);
    if (g && N(g.at, 0) <= Date.now() + 500) {
      await this.state.storage.delete("gone").catch(() => {});
      if (this.socks.size === 0 && env?.DB) {
        const uid = this.uid || N(await this.state.storage.get("uid").catch(() => 0), 0);
        if (uid) {
          try {
            const row = await env.DB.prepare(`
              SELECT * FROM calls
               WHERE (caller_id = ?1 OR callee_id = ?1) AND state IN ('ringing','connected')
               ORDER BY started_at DESC LIMIT 1
            `).bind(uid).first().catch(() => null);
            if (row) {
              const 後 = await 終える(env, S(row.call_id, 64), "network",
                N(row.connected_at, 0) ? "ended" : "missed");
              await 記す(env, S(row.call_id, 64), "gone", uid, "");
              await 両方へ(env, row, { type: "call.end", callId: S(row.call_id, 64),
                state: S(後?.state || "ended"), reason: "network" });
            }
          } catch (e) {}
        }
      }
    }
    /* ── ① 着信の 見張り ── */
    const r = await this.state.storage.get("ring").catch(() => null);
    if (!r || !r.callId || N(r.until, 0) > Date.now() + 500) { await this._目覚ましを直す(); return; }
    await this.state.storage.delete("ring").catch(() => {});
    if (!env?.DB) { await this._目覚ましを直す(); return; }
    try {
      const row = await env.DB.prepare("SELECT * FROM calls WHERE call_id = ?1")
        .bind(S(r.callId, 64)).first().catch(() => null);
      if (!row || S(row.state) !== "ringing") return;
      await env.DB.prepare(`
        UPDATE calls SET state='missed', ended_at=?2, end_reason='timeout' WHERE call_id=?1
      `).bind(S(r.callId, 64), Date.now()).run().catch(() => null);
      const msg = { type: "call.end", callId: S(r.callId, 64), state: "missed", reason: "timeout" };
      for (const uid of [N(row.caller_id, 0), N(row.callee_id, 0)]) {
        try {
          const stub = env.CALL_HUB.get(env.CALL_HUB.idFromName("u:" + uid));
          await stub.fetch("https://call.hub/push", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg)
          });
        } catch (e) {}
      }
    } catch (e) {}
    await this._目覚ましを直す();
  }
}

/* ══ Admin へ 出す 数（**中身は 出さない。数だけ**）══════════════════════ */
export async function callsAdminSummary(env) {
  await ensureCallSchema(env).catch(() => {});
  const 始 = 今日の始まり();
  const 週 = 今() - 7 * 24 * 3600 * 1000;
  const q = async (sql, ...bind) => {
    try { return await env.DB.prepare(sql).bind(...bind).first(); } catch (e) { return null; }
  };
  const 今日分 = await q(`
    SELECT COUNT(*) AS n, COALESCE(SUM(duration_sec),0) AS sec,
           SUM(CASE WHEN state='connected' OR state='ended' THEN 1 ELSE 0 END) AS ok
      FROM calls WHERE started_at >= ?1`, 始);
  const 週分 = await q(`
    SELECT COUNT(*) AS n, COALESCE(SUM(duration_sec),0) AS sec FROM calls WHERE started_at >= ?1`, 週);
  const 通報 = await q(`
    SELECT COUNT(*) AS n, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open FROM call_reports`);
  const lumi = await q(`
    SELECT COUNT(*) AS n, COALESCE(SUM(lumi_seconds),0) AS sec FROM calls WHERE lumi_used = 1 AND started_at >= ?1`, 週);
  /* 画面の 同席。**中身は 残していない**ので 回数だけ（call_events から 数える）。 */
  const 同席 = await q(`
    SELECT COUNT(*) AS n, COUNT(DISTINCT call_id) AS calls
      FROM call_events WHERE kind = 'share.start' AND at >= ?1`, 週);
  const 件 = Math.max(1, N(今日分?.n, 0));
  /* SFU の 帯域は 実測できないので **音声の 実測ビットレートから 見積もる**。
     Opus 32kbps を 2 本（上り・下り）× 2 人 = 1 秒 あたり およそ 16KB。 */
  const 見積GB = (N(週分?.sec, 0) * 16 * 1024) / (1024 * 1024 * 1024);
  return {
    today: { calls: N(今日分?.n, 0), seconds: N(今日分?.sec, 0),
             avgSeconds: Math.round(N(今日分?.sec, 0) / 件) },
    week: { calls: N(週分?.n, 0), seconds: N(週分?.sec, 0) },
    reports: { total: N(通報?.n, 0), open: N(通報?.open, 0) },
    lumi: { calls: N(lumi?.n, 0), seconds: N(lumi?.sec, 0) },
    share: { starts: N(同席?.n, 0), calls: N(同席?.calls, 0),
             note: "画面の 同席は 映像を 送らず、中身も 残していません（回数だけ）。" },
    bandwidth: { estimatedGbWeek: Math.round(見積GB * 1000) / 1000, freeGb: 1000,
                 note: "見積もりです（音声 32kbps × 2 方向 で 計算）。実測は Cloudflare の 画面で 確かめてください。" },
    configured: callsConfigured(env),
    lumiConfigured: callsLumiConfigured(env)
  };
}

/* ══ 土台の 自己診断（2026-08-29）══════════════════════════════════════
   ★ 鍵を 入れても 動かない とき、いまは 503 が 返るだけで
     「鍵が 無い」のか「鍵が 違う」のか「アカウントが まだ 有効でない」のかが
     **画面から 一切 分からない**。実際に SFU へ 1 回だけ 部屋を 作って、
     Cloudflare の 返事を そのまま 見せる。作った 部屋は すぐ 閉じる。 */
export async function callsSelfTest(env) {
  if (rtk設定(env).ok) {
    const appId = await rtkアプリ(env).catch(() => "");
    if (!appId) {
      return { ok: false, code: "RTK_APP_NOT_FOUND", mode: "rtk",
        message: "RealtimeKit の アプリが 見つかりません。",
        ヒント: "RTK_APP_ID を 入れるか、トークンに Realtime の 権限が あるか 確かめてください。" };
    }
    const preset = await rtk役(env, appId).catch(() => "");
    const t0 = 今();
    const res = await cf(env, "/realtime/kit/" + encodeURIComponent(appId) + "/meetings", "POST",
      { title: "vq-selftest" }).catch((e) => ({ ok: false, status: 0, err: S(e?.message, 200) }));
    const ms = 今() - t0;
    if (!res.ok) {
      return { ok: false, code: "RTK_FAILED", mode: "rtk", status: res.status, ms,
        message: res.err || ("HTTP " + res.status),
        ヒント: res.status === 401 || res.status === 403
          ? "API トークンの 権限を 確かめてください（Realtime / Realtime Admin・編集）。"
          : "Cloudflare 側の 返事です。RealtimeKit の アプリが 生きているか 確かめてください。" };
    }
    return { ok: true, mode: "rtk", ms, appId: appId.slice(0, 8) + "…", preset: preset || "(既定)",
      message: "RealtimeKit に つながりました。通話を 始められます。" };
  }
  const c = sfu設定(env);
  if (c.にせ && !c.ok) {
    return { ok: true, mode: "fake", message: "開発版の 作りものの SFU で 通っています（音は 流れません）。" };
  }
  if (!c.ok) {
    return { ok: false, code: "NOT_CONFIGURED",
      message: "CALLS_APP_ID / CALLS_APP_SECRET が 入っていません。",
      appId: !!c.appId, secret: !!c.secret };
  }
  const t0 = 今();
  const r = await sfu(env, "/sessions/new", "POST", {}).catch((e) => ({
    ok: false, status: 0, json: { errorDescription: S(e?.message, 200) } }));
  const ms = 今() - t0;
  if (!r.ok || !r.json?.sessionId) {
    /* Cloudflare の 言い分を そのまま 出す（**鍵は 出さない**）。 */
    return { ok: false, code: "SFU_FAILED", status: r.status, ms,
      message: S(r.json?.errorDescription || r.json?.errors?.[0]?.message
        || ("HTTP " + r.status), 300),
      ヒント: r.status === 401 || r.status === 403
        ? "鍵が 違うか、まだ 権限が ありません。App ID と App Secret を 見直してください。"
        : r.status === 404
          ? "その App ID が 見つかりません。Realtime の SFU アプリを 作り直してください。"
          : r.status === 0
            ? "Cloudflare へ 届いていません。少し あとで もう一度。"
            : "Cloudflare 側の 返事です。アカウントの 有効化が 済んでいるか 確かめてください。" };
  }
  const sid = S(r.json.sessionId, 120);
  /* 作った 部屋は **必ず 閉じる**（開けっぱなしは 課金に つながる）。 */
  await sfu(env, "/sessions/" + encodeURIComponent(sid) + "/tracks/close", "PUT",
    { tracks: [], force: true }).catch(() => {});
  return { ok: true, mode: "live", ms,
    message: "SFU に つながりました。通話を 始められます。",
    sessionId: sid.slice(0, 8) + "…" };
}

/* Admin の 通報一覧に 出す ための 1 件分（**音声は 無い** ことも 一緒に 返す）。 */
export async function callsReportDetail(env, callId) {
  await ensureCallSchema(env).catch(() => {});
  const row = await 通話を引く(env, callId);
  if (!row) return null;
  return {
    callId: S(row.call_id, 64),
    callerId: N(row.caller_id, 0), calleeId: N(row.callee_id, 0),
    state: S(row.state, 20),
    startedAt: N(row.started_at, 0), connectedAt: N(row.connected_at, 0),
    endedAt: N(row.ended_at, 0), durationSec: N(row.duration_sec, 0),
    endReason: S(row.end_reason, 40),
    lumiUsed: N(row.lumi_used, 0) === 1, lumiSeconds: N(row.lumi_seconds, 0),
    audio: null,
    note: "通話の 音声は 保存していません。内容は 確認できません。"
  };
}

/* 利用制限の 初期値（Admin の rate_limit_config へ 入れる ための 種）。 */
export const CALL_SEED_LIMITS = [
  ["call.daily.minutes", "1日あたりの通話時間の上限", 120, "分/日", "all", "call"],
  ["call.daily.count", "1日あたりの発信回数の上限", 30, "回/日", "all", "call"],
  ["call.max_minutes", "1通話の最大時間", 60, "分", "all", "call"],
  ["call.concurrent.max", "同時通話数", 1, "本", "all", "call"],
  ["call.lumi.daily.count", "Lumi介入の1日あたり回数", 10, "回/日", "all", "call"],
  ["call.lumi.max_seconds", "Lumi介入の1回あたり最大時間", 300, "秒", "all", "call"]
];
