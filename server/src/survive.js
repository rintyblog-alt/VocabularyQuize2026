/* ══════════════════════════════════════════════════════════════════════════
   VocabuSurvive — サーバ側

   ★ worker.js へは **入口だけ** を 足す。
     あちらは 65,000 行 あるので、ここへ 1,500 行 差し込むと
     以後の 差分が 読めなくなる（admin.js と 同じ 決まり）。

   ここに ある もの:
     ① D1 の 表（成績・記録・試合）
     ② /api/survive/*（問題・友だち・結果・成績・記録・部屋）
     ③ /ws/survive/:roomId（WebSocket → SurviveRoom）
     ④ SurviveRoom（Durable Object。1 試合 = 1 部屋）

   通信の 決めごと（要件 19〜22）:
     ・**サーバが 正。** 位置は 各自が 送るが、サーバが 「あり得るか」を 見る。
       速さ・瞬間移動・中間地点の 順・ゴール・クイズの 答え を 確かめる。
     ・毎フレーム 送らない。入力と 位置は 20Hz、配るのは 15Hz。
     ・変わっていない 人は 配らない（差分）。
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 小道具 ─────────────────────────────────────────────────────────── */
const S = (v, n) => String(v === undefined || v === null ? "" : v).slice(0, n || 200);
const N = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : (d || 0); };
const CL = (v, a, b) => Math.max(a, Math.min(b, N(v, a)));

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
function bad(code, message, status) { return json({ ok: false, code, message }, status || 400); }

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseBearer(request) {
  const h = String(request.headers.get("Authorization") || "");
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}
async function readJson(request, max) {
  try {
    const t = await request.text();
    if (t.length > (max || 64 * 1024)) return null;
    return t ? JSON.parse(t) : {};
  } catch (e) { return null; }
}

/** 札から 人を 引く。worker.js の resolveAuthUser と 同じ 表を 見る。 */
async function userFromToken(token, env) {
  if (!token || !env || !env.DB) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT s.user_id AS userId, s.pin_ok_at AS pinOkAt,
           u.nickname AS nickname, u.grade_prefix AS gradePrefix, u.pin_hash AS pinHash
      FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2 LIMIT 1
  `).bind(hash, Date.now()).first().catch(() => null);
  if (!row) return null;
  /* 暗証番号を 決めている 人は、その 端末で 確かめるまで 中へ 入れない */
  if (String(row.pinHash || "") && !(N(row.pinOkAt, 0) > 0)) return null;
  const uid = N(row.userId, 0);
  /* ★ 管理画面からの Ban / 一時停止を **ここでも 効かせる**。
     この 引き受けは 本体の 「利用停止の 関所」より 先に あるので、
     自分で 見ないと 止めた はずの 人が 遊べて しまう。 */
  if (await 止められているか(env, uid)) return { uid, blocked: true, nickname: "", grade: "" };
  return { uid, nickname: S(row.nickname, 40), grade: S(row.gradePrefix, 8) };
}

async function 止められているか(env, uid) {
  if (!env || !env.DB || !uid) return false;
  let row = null;
  try {
    row = await env.DB.prepare(
      "SELECT state, suspend_until FROM user_status WHERE user_id = ?1 LIMIT 1"
    ).bind(String(uid)).first();
  } catch (e) { return false; }
  if (!row) return false;
  const st = S(row.state, 24);
  if (!st || st === "active") return false;
  /* 期限つきの 一時停止は 期限が 過ぎたら 通す（戻すのは 本体に 任せる） */
  const until = S(row.suspend_until, 40);
  if (st === "suspended" && until && new Date(until).getTime() < Date.now()) return false;
  return true;
}
async function userFromRequest(request, env) {
  return userFromToken(parseBearer(request), env);
}

/* ── D1 の 表 ───────────────────────────────────────────────────────── */
const TABLES = [
  `CREATE TABLE IF NOT EXISTS survive_stats (
     user_id INTEGER PRIMARY KEY,
     matches INTEGER NOT NULL DEFAULT 0,
     wins INTEGER NOT NULL DEFAULT 0,
     losses INTEGER NOT NULL DEFAULT 0,
     finishes INTEGER NOT NULL DEFAULT 0,
     xp INTEGER NOT NULL DEFAULT 0,
     quiz_correct INTEGER NOT NULL DEFAULT 0,
     quiz_wrong INTEGER NOT NULL DEFAULT 0,
     play_seconds INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS survive_records (
     user_id INTEGER NOT NULL,
     course_id TEXT NOT NULL,
     best_ms INTEGER NOT NULL DEFAULT 0,
     runs INTEGER NOT NULL DEFAULT 0,
     finishes INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, course_id)
   )`,
  `CREATE TABLE IF NOT EXISTS survive_matches (
     id TEXT PRIMARY KEY,
     course_id TEXT NOT NULL DEFAULT '',
     mode TEXT NOT NULL DEFAULT 'race',
     players INTEGER NOT NULL DEFAULT 0,
     started_at INTEGER NOT NULL DEFAULT 0,
     ended_at INTEGER NOT NULL DEFAULT 0,
     result_json TEXT NOT NULL DEFAULT ''
   )`,
  /* 週ごとの 上位。1 人 1 コース 1 週に つき 1 行（その 週の 自己ベスト）。
     走った 全部を 残すと 際限なく 増える。主キーで 上書きに すれば
     行数は 「遊んだ 人 × 遊んだ コース × 遊んだ 週」で 頭打ちに なる。
     week は 月曜 始まりの 週（例 2026-W35）。 */
  `CREATE TABLE IF NOT EXISTS survive_weekly (
     user_id INTEGER NOT NULL,
     course_id TEXT NOT NULL,
     week TEXT NOT NULL,
     best_ms INTEGER NOT NULL DEFAULT 0,
     runs INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, course_id, week)
   )`,
  /* 部屋を 作った 記録。作りすぎの 見張りに 使う。
     ★ **D1 に 置く。** isolate の 中の Map だけだと、
       isolate が 入れ替わった 瞬間に 数え直しに なり、
       入れ替わりを 待つ だけで 何度でも 作れて しまう。 */
  `CREATE TABLE IF NOT EXISTS survive_room_hits (
     user_id INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_survive_room_hits ON survive_room_hits (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_survive_weekly ON survive_weekly (course_id, week, best_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_survive_rec_course ON survive_records (course_id, best_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_survive_stats_xp ON survive_stats (xp DESC)`
];

let _tablesReady = 0;
/* 月曜 始まりの 週の 名前（2026-W35 の 形）。
   ★ 「日曜 始まり」と 混ぜると 週の 変わり目で 上位が 入れ替わって 見える。
     ここで **1 か所に 決めて** 全部 これを 使う。 */
function 週の名(ms) {
  const d = new Date(ms);
  /* UTC で 揃える。端末の 時計に 合わせると 人ごとに 週が ずれる。 */
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dt = new Date(t);
  const 曜 = (dt.getUTCDay() + 6) % 7;          /* 月=0 … 日=6 */
  dt.setUTCDate(dt.getUTCDate() - 曜 + 3);      /* その週の 木曜へ */
  const 年 = dt.getUTCFullYear();
  const 元日 = new Date(Date.UTC(年, 0, 4));
  const 差 = Math.round((dt - 元日) / 86400000);
  const 週 = 1 + Math.floor((差 + ((元日.getUTCDay() + 6) % 7)) / 7);
  return 年 + "-W" + (週 < 10 ? "0" + 週 : String(週));
}

/* 後から 足した 列。**無ければ 足す**（既に 動いている 表を 作り直さない）。
   ★ 失敗しても 黙って 進む。ここで 例外を 投げると 全部の API が 500 に なる
     （ensureCols で 一度 やらかしている）。 */
let _colsReady = 0;
async function ensureCols(env) {
  const now = Date.now();
  if (now - _colsReady < 300000) return;
  _colsReady = now;
  for (const q of [
    "ALTER TABLE survive_records ADD COLUMN splits_json TEXT NOT NULL DEFAULT ''"
  ]) {
    try { await env.DB.prepare(q).run(); } catch (e) { /* もう ある */ }
  }
}

async function ensureTables(env) {
  /* ★ 30 秒 覚える。毎回 5 本 走らせると 全部の API が 遅くなる。
     （過去に ensureCols で 全 API が 500 に なった 事故が ある） */
  const now = Date.now();
  if (now - _tablesReady < 30000) return true;
  if (!env || !env.DB) return false;
  try {
    for (const q of TABLES) await env.DB.prepare(q).run();
    _tablesReady = now;
    return true;
  } catch (e) {
    console.error("[survive] 表を 作れません:", String(e && e.message || e));
    return false;
  }
}

/* ══ ① 問題 ═══════════════════════════════════════════════════════════
   門に 出す 問題。**同じ 種なら 全員 同じ 問題**（対戦の 公平さ）。
   出どころ: プリセット（あれば）→ 単語表 → 控え。 */

const FALLBACK_WORDS = [
  ["enormous", "巨大な"], ["ancient", "古代の"], ["fragile", "こわれやすい"],
  ["reluctant", "気が進まない"], ["abundant", "豊富な"], ["obvious", "明らかな"],
  ["reveal", "明らかにする"], ["persuade", "説得する"], ["sufficient", "十分な"],
  ["hesitate", "ためらう"], ["genuine", "本物の"], ["essential", "不可欠な"],
  ["remarkable", "注目すべき"], ["diminish", "減らす"], ["accurate", "正確な"],
  ["deliberate", "意図的な"], ["scarce", "乏しい"], ["evident", "明白な"],
  ["profound", "深い"], ["ambiguous", "あいまいな"], ["consistent", "一貫した"],
  ["adequate", "十分な"], ["reluctance", "気乗りしないこと"], ["obtain", "得る"],
  ["maintain", "保つ"], ["reduce", "減らす"], ["increase", "増やす"],
  ["prevent", "防ぐ"], ["recognize", "認識する"], ["observe", "観察する"],
  ["imagine", "想像する"], ["describe", "説明する"], ["require", "必要とする"],
  ["provide", "与える"], ["achieve", "達成する"], ["consider", "考慮する"],
  ["improve", "改善する"], ["suggest", "提案する"], ["decrease", "減少する"],
  ["contain", "含む"]
];

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 単語帳の 中身（プリセットの JSON）から [表, 裏] の 組を 取り出す ──
   ★ 形が **3 通り** ある。cards（いまの 形）/ words（古い 形）/ items（AI が 作る 形）。
     どれか 1 つしか 見ていないと 「単語帳を 選んだのに 控えの 問題が 出る」に なる。 */
function ペアを取り出す(d) {
  if (!d || typeof d !== "object") return [];
  const rows = (Array.isArray(d.cards) && d.cards.length) ? d.cards
    : (Array.isArray(d.words) && d.words.length) ? d.words
    : (Array.isArray(d.items) && d.items.length) ? d.items
    : (Array.isArray(d.rows) ? d.rows : []);
  const got = [];
  for (const w of rows) {
    if (!w || typeof w !== "object") continue;
    const a = S(w.front || w.term || w.word || w.q || w.left, 60);
    const b = S(w.back || w.meaning || w.answer || w.a || w.right, 60);
    if (a && b) got.push([a, b]);
  }
  return got;
}

/* ── 公開されている 単語帳を 1 つ 読む ────────────────────────────
   ★ ここで 読めるのは **公開されている もの だけ**。
     自分の 単語帳（手元に しか ない）は サーバを 通さず 画面の 中で 作る。 */
async function 公開の単語帳(env, kind, id, owner) {
  if (!env.DB || !id) return null;
  try {
    if (kind === "official") {
      const r = await env.DB.prepare(
        "SELECT name, words_json FROM official_presets WHERE id = ?1 LIMIT 1"
      ).bind(id).first();
      if (!r) return null;
      let w = [];
      try { w = JSON.parse(String(r.words_json || "[]")); } catch (e) { w = []; }
      return { name: S(r.name, 80), pairs: ペアを取り出す(Array.isArray(w) ? { words: w } : w) };
    }
    if (kind === "public") {
      const uid = N(owner, 0);
      if (!uid) return null;
      const r = await env.DB.prepare(
        "SELECT name, public_title, preset_json FROM public_presets " +
        "WHERE user_id = ?1 AND preset_id = ?2 AND is_public = 1 AND deleted_at = 0 LIMIT 1"
      ).bind(uid, id).first();
      if (!r) return null;
      let d = null;
      try { d = JSON.parse(String(r.preset_json || "{}")); } catch (e) { return null; }
      return { name: S(r.public_title || r.name, 80), pairs: ペアを取り出す(d) };
    }
  } catch (e) { /* 読めなければ 控えへ */ }
  return null;
}

/* ══ ①-b 選べる 単語帳の 一覧 ═══════════════════════════════════════
   返すのは **誰でも 読める もの だけ**（公開・公式）。
   ★ 自分の 単語帳を ここに 載せない のには 理由が ある:
     対戦相手の 端末からは その 単語帳を 引けない。
     引けないまま 始めると 自分だけ 自分の 単語・相手は 控えの 単語に なり、
     「同じ 問題で 競っている」ことに ならない。
     ひとりで 遊ぶ ときの 自分の 単語帳は 画面の 中（手元の 控え）から 出す。 */
async function handlePresets(request, env) {
  const out = { ok: true, public: [], official: [] };
  if (!env.DB) return json(out);
  const me = await userFromRequest(request, env);
  if (me && me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  try {
    const rs = await env.DB.prepare(
      "SELECT user_id AS uid, preset_id AS pid, name, public_title FROM public_presets " +
      "WHERE is_public = 1 AND deleted_at = 0 ORDER BY updated_at DESC LIMIT 40"
    ).all();
    for (const r of (rs?.results || [])) {
      const nm = S(r.public_title || r.name, 80);
      if (!nm) continue;
      out.public.push({ id: S(r.pid, 80), owner: N(r.uid, 0), name: nm, kind: "public" });
    }
  } catch (e) { /* 表が まだ 無い＝空で 返す */ }
  try {
    const rs = await env.DB.prepare(
      "SELECT id, name, word_count AS n FROM official_presets ORDER BY delivered_at DESC LIMIT 40"
    ).all();
    for (const r of (rs?.results || [])) {
      const nm = S(r.name, 80);
      if (!nm) continue;
      out.official.push({ id: S(r.id, 80), owner: 0, name: nm, words: N(r.n, 0), kind: "official" });
    }
  } catch (e) { /* 同上 */ }
  return json(out);
}

function buildQuestions(pairs, count, seed) {
  const rnd = mulberry(seed >>> 0 || 1);
  const pool = pairs.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = pool[i % pool.length];
    if (!p) break;
    /* まぎらわしい 選択肢を 3 つ 選ぶ */
    const wrong = [];
    let guard = 0;
    while (wrong.length < 3 && guard++ < 200) {
      const q = pool[Math.floor(rnd() * pool.length)];
      if (!q || q[1] === p[1] || wrong.indexOf(q[1]) >= 0) continue;
      wrong.push(q[1]);
    }
    while (wrong.length < 3) wrong.push("—");
    const choices = [p[1], wrong[0], wrong[1], wrong[2]];
    /* 位置を 混ぜる（正解が いつも 上に ならない ように） */
    for (let k = choices.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      const t = choices[k]; choices[k] = choices[j]; choices[j] = t;
    }
    out.push({
      prompt: String(p[0]),
      choices: choices.map(String),
      answer: choices.indexOf(p[1]),
      tag: "意味"
    });
  }
  return out;
}

async function handleQuestions(request, env) {
  const body = await readJson(request, 8 * 1024);
  if (!body) return bad("BAD_REQUEST", "本文が 読めません。");
  const count = CL(body.count, 1, 24);
  const seed = (N(body.seed, 1) >>> 0) || 1;
  let pairs = null;

  /* プリセットが 指定されて いれば そこから。
     ★ **自分の もの しか 読ませない。**
       前は user_id で 絞らずに 引いていた（しかも 列名が 違って 常に 失敗）。
       あのまま 動いて いたら、鍵を 当てれば 他人の 単語帳を 読めた。 */
  const presetId = S(body.presetId, 80);
  const presetKind = S(body.presetKind, 16);
  let 単語帳名 = "";

  /* 公開・公式の 単語帳は **誰でも 同じものを 引ける**ので 対戦でも 使える。 */
  if (presetId && (presetKind === "public" || presetKind === "official")) {
    const got = await 公開の単語帳(env, presetKind, presetId, body.presetOwner);
    if (got && got.pairs.length >= 8) { pairs = got.pairs; 単語帳名 = got.name; }
  }

  if (!pairs && presetId && env.DB) {
    const me = await userFromRequest(request, env);
    if (me && !me.blocked) {
      try {
        const rows = (await env.DB.prepare(
          "SELECT chunk FROM account_blobs WHERE user_id = ?1 AND key = ?2 ORDER BY part ASC LIMIT 64"
        ).bind(me.uid, "preset:" + presetId).all().catch(() => ({ results: [] }))).results || [];
        if (rows.length) {
          const d = JSON.parse(rows.map((r) => String(r.chunk || "")).join(""));
          const words = (d && (d.words || d.items || d.rows)) || [];
          const got = [];
          for (const w of words) {
            const a = S(w.term || w.word || w.q || w.front, 60);
            const b = S(w.meaning || w.answer || w.a || w.back, 60);
            if (a && b) got.push([a, b]);
          }
          if (got.length >= 8) pairs = got;
        }
      } catch (e) { /* 使えなければ 控えへ */ }
    }
  }

  if (!pairs) pairs = FALLBACK_WORDS;
  const questions = buildQuestions(pairs, count, seed);
  return json({
    ok: true, questions,
    source: pairs === FALLBACK_WORDS ? "builtin" : "preset",
    words: pairs.length, name: 単語帳名
  });
}

/* ══ ② 友だち ═════════════════════════════════════════════════════════
   すでに ある フォローの 表を 使う。**相互に フォロー**している 人だけ。 */
async function handleFriends(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  if (!env.DB) return json({ ok: true, friends: [] });
  /* ★ 表の 名前は **user_follows**。social_follows は この アプリに 無い。
     前は 無い 表を 引いて いたので、友だちは 必ず 0 件だった。
     「相互に フォロー」＝ どちらの 行も 生きて いて 承認ずみ。 */
  let rows = [];
  try {
    rows = (await env.DB.prepare(`
      SELECT u.id AS id, u.nickname AS name, up.display_name AS disp
        FROM user_follows a
        JOIN user_follows b
          ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
         AND b.deleted_at = 0 AND b.approved_at > 0
        JOIN users u ON u.id = a.followee_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE a.follower_id = ?1 AND a.deleted_at = 0 AND a.approved_at > 0
       ORDER BY u.id LIMIT 60
    `).bind(me.uid).all().catch(() => ({ results: [] }))).results || [];
  } catch (e) { rows = []; }
  return json({
    ok: true,
    friends: rows.map((r) => ({
      id: String(r.id),
      name: S(r.disp || r.name, 40) || ("ID" + r.id),
      online: false
    }))
  });
}

/* ══ ②' 招待 ═════════════════════════════════════════════════════════
   相互に フォローして いる 人にだけ 送れる。
   同じ 相手へは 1 日 3 回まで（しつこさを 止める）。 */
const INVITE_PER_DAY = 3;

async function handleInvite(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  if (!env.DB) return bad("DB_NOT_CONFIGURED", "DB が ありません。", 500);
  const b = await readJson(request, 4096);
  if (!b) return bad("BAD_REQUEST", "本文が 読めません。");
  const to = Math.max(0, N(b.userId, 0));
  const roomId = S(b.roomId, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!to || to === me.uid) return bad("BAD_REQUEST", "招く 相手が 正しく ありません。");
  if (!roomId) return bad("BAD_REQUEST", "あいことばが ありません。");

  /* 相互に フォローして いるか */
  const rel = await env.DB.prepare(`
    SELECT 1 AS ok FROM user_follows a
      JOIN user_follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
       AND b.deleted_at = 0 AND b.approved_at > 0
     WHERE a.follower_id = ?1 AND a.followee_id = ?2 AND a.deleted_at = 0 AND a.approved_at > 0
     LIMIT 1
  `).bind(me.uid, to).first().catch(() => null);
  if (!rel) return bad("FORBIDDEN", "相互に フォローして いる 人だけ 誘えます。", 403);

  const now = Date.now();
  const dayKey = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);   /* 日本の 日付 */
  const cnt = await env.DB.prepare(`
    SELECT COUNT(1) AS c FROM user_notifications
     WHERE user_id = ?1 AND type = 'survive_invite' AND day_key = ?2 AND actor_user_id = ?3
  `).bind(to, dayKey, me.uid).first().catch(() => null);
  if (N(cnt && cnt.c, 0) >= INVITE_PER_DAY) {
    return json({ ok: true, sent: false, reason: "daily_limit", message: "この 人への 招待は 今日は ここまでです。" });
  }

  const title = (me.nickname || "だれか") + "さんが VocabuSurvive に 誘っています。";
  const body = ["あいことば: " + roomId, "開いて すぐ 入れます。"].join("\n");
  const meta = JSON.stringify({ type: "survive_invite", actorUserId: me.uid, roomId });
  try {
    await env.DB.prepare(`
      INSERT INTO user_notifications (id, user_id, actor_user_id, type, title, body, ts, day_key, meta_json)
      VALUES (?1, ?2, ?3, 'survive_invite', ?4, ?5, ?6, ?7, ?8)
    `).bind("un:" + crypto.randomUUID(), to, me.uid, title, body, now, dayKey, meta).run();
  } catch (e) {
    console.error("[survive] 招待を 送れません:", String(e && e.message || e));
    return json({ ok: true, sent: false, reason: "notify_failed" });
  }
  return json({ ok: true, sent: true, roomId });
}

/* ══ ③ 成績を 残す ════════════════════════════════════════════════════ */
async function handleResult(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  if (!(await ensureTables(env))) return json({ ok: true, saved: false });
  await ensureCols(env);
  const b = await readJson(request, 8 * 1024);
  if (!b) return bad("BAD_REQUEST", "本文が 読めません。");
  const courseId = S(b.courseId, 24);
  const finished = !!b.finished;
  const timeMs = Math.round(CL(b.time, 0, 3600) * 1000);
  const rank = CL(b.rank, 0, 64);
  const correct = CL(b.correct, 0, 200);
  const wrong = CL(b.wrong, 0, 200);
  /* 区間の 記録（中間地点を 通った 時刻・秒）。
     ★ **順に 増えていて、ゴール時間を 超えない** ものだけ 受ける。
       画面から 来る 値なので、そのまま 信じて 表に 入れない。 */
  let splits = [];
  if (Array.isArray(b.splits)) {
    let 前 = 0, よい = true;
    for (const v of b.splits.slice(0, 16)) {
      const t = Math.round(CL(v, 0, 3600) * 1000);
      if (!(t > 前) || t > timeMs + 50) { よい = false; break; }
      前 = t; splits.push(t);
    }
    if (!よい) splits = [];
  }
  /* ★ XP は **サーバで 決める**。画面から 来た 値は 使わない。 */
  const xp = Math.round(
    (finished ? 120 : 40) + Math.max(0, 8 - rank) * 24 + correct * 18 +
    Math.round((correct + wrong > 0 ? correct / (correct + wrong) : 0) * 60)
  );
  const now = Date.now();
  try {
    await env.DB.prepare(`
      INSERT INTO survive_stats (user_id, matches, wins, losses, finishes, xp, quiz_correct, quiz_wrong, play_seconds, updated_at)
      VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(user_id) DO UPDATE SET
        matches = matches + 1,
        wins = wins + ?2, losses = losses + ?3, finishes = finishes + ?4,
        xp = xp + ?5, quiz_correct = quiz_correct + ?6, quiz_wrong = quiz_wrong + ?7,
        play_seconds = play_seconds + ?8, updated_at = ?9
    `).bind(me.uid, rank === 1 ? 1 : 0, rank === 1 ? 0 : 1, finished ? 1 : 0,
      xp, correct, wrong, Math.round(timeMs / 1000), now).run();
    if (courseId) {
      const prev = await env.DB.prepare(
        "SELECT best_ms FROM survive_records WHERE user_id = ?1 AND course_id = ?2 LIMIT 1"
      ).bind(me.uid, courseId).first().catch(() => null);
      const prevBest = N(prev && prev.best_ms, 0);
      const best = finished && timeMs > 0 ? (prevBest > 0 ? Math.min(prevBest, timeMs) : timeMs) : prevBest;
      /* 区間は **自己ベストを 更新した ときだけ** 入れ替える。
         そうしないと「一番 速かった 走りの 区間」で なくなる。 */
      const 更新 = finished && timeMs > 0 && (prevBest === 0 || timeMs < prevBest);
      const sj = (更新 && splits.length) ? JSON.stringify(splits) : "";
      await env.DB.prepare(`
        INSERT INTO survive_records (user_id, course_id, best_ms, runs, finishes, splits_json, updated_at)
        VALUES (?1, ?2, ?3, 1, ?4, ?6, ?5)
        ON CONFLICT(user_id, course_id) DO UPDATE SET
          best_ms = ?3, runs = runs + 1, finishes = finishes + ?4, updated_at = ?5,
          splits_json = CASE WHEN ?6 <> '' THEN ?6 ELSE splits_json END
      `).bind(me.uid, courseId, best, finished ? 1 : 0, now, sj).run();
      /* 今週の 自己ベスト */
      if (finished && timeMs > 0) {
        await env.DB.prepare(`
          INSERT INTO survive_weekly (user_id, course_id, week, best_ms, runs, updated_at)
          VALUES (?1, ?2, ?3, ?4, 1, ?5)
          ON CONFLICT(user_id, course_id, week) DO UPDATE SET
            best_ms = MIN(best_ms, ?4), runs = runs + 1, updated_at = ?5
        `).bind(me.uid, courseId, 週の名(now), timeMs, now).run();
      }
    }
  } catch (e) {
    console.error("[survive] 成績を 残せません:", String(e && e.message || e));
    return json({ ok: true, saved: false });
  }
  return json({ ok: true, saved: true, xp });
}

/* ══ ④ 成績を 見る ════════════════════════════════════════════════════ */
async function handleStats(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  if (!(await ensureTables(env))) return json({ ok: true, stats: null, records: [] });
  const st = await env.DB.prepare("SELECT * FROM survive_stats WHERE user_id = ?1 LIMIT 1")
    .bind(me.uid).first().catch(() => null);
  const rec = (await env.DB.prepare(
    "SELECT course_id AS courseId, best_ms AS bestMs, runs, finishes FROM survive_records WHERE user_id = ?1 ORDER BY course_id"
  ).bind(me.uid).all().catch(() => ({ results: [] }))).results || [];
  return json({
    ok: true,
    stats: st ? {
      matches: N(st.matches), wins: N(st.wins), losses: N(st.losses),
      finishes: N(st.finishes), xp: N(st.xp),
      correct: N(st.quiz_correct), wrong: N(st.quiz_wrong),
      seconds: N(st.play_seconds)
    } : { matches: 0, wins: 0, losses: 0, finishes: 0, xp: 0, correct: 0, wrong: 0, seconds: 0 },
    records: rec
  });
}

/** コースごとの 上位（誰でも 見られる） */
async function handleLeaderboard(request, env, courseId) {
  if (!(await ensureTables(env))) return json({ ok: true, rows: [] });
  await ensureCols(env);
  const cid = S(courseId, 24);
  let period = "all", scope = "all";
  try {
    const u = new URL(request.url);
    const p = S(u.searchParams.get("period"), 8);
    const sc = S(u.searchParams.get("scope"), 8);
    if (p === "week") period = "week";
    if (sc === "friends") scope = "friends";
  } catch (e) { /* 既定のまま */ }

  /* 札が あれば 自分の 順位も 返す（無くても 上位は 見せる）。 */
  const me = await userFromRequest(request, env);
  if (me && me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  let 相手 = null;
  if (scope === "friends") {
    if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
    相手 = new Set([String(me.uid)]);
    for (const id of await 相互フォロー(env, me.uid)) 相手.add(String(id));
  }

  const week = 週の名(Date.now());
  const 全部 = period === "week"
    ? (await env.DB.prepare(`
        SELECT w.user_id AS id, u.nickname AS name, w.best_ms AS bestMs
          FROM survive_weekly w JOIN users u ON u.id = w.user_id
         WHERE w.course_id = ?1 AND w.week = ?2 AND w.best_ms > 0
         ORDER BY w.best_ms ASC LIMIT 200
      `).bind(cid, week).all().catch(() => ({ results: [] })))
    : (await env.DB.prepare(`
        SELECT r.user_id AS id, u.nickname AS name, r.best_ms AS bestMs
          FROM survive_records r JOIN users u ON u.id = r.user_id
         WHERE r.course_id = ?1 AND r.best_ms > 0
         ORDER BY r.best_ms ASC LIMIT 200
      `).bind(cid).all().catch(() => ({ results: [] })));
  let 並び = (全部.results || []).map((r) => ({ id: String(r.id), name: S(r.name, 40), bestMs: N(r.bestMs) }));
  if (相手) 並び = 並び.filter((r) => 相手.has(r.id));
  並び = 並び.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, bestMs: r.bestMs }));

  /* ★ **自分の 順位を 必ず 返す。**
     上位 20 だけ 返すと、ほとんどの 人は 自分が どこに いるか 分からない。
     「20 位までに 入っていないと 何も 見えない」は 記録として 役に 立たない。 */
  let 私 = null;
  if (me) {
    私 = 並び.filter((r) => r.id === String(me.uid))[0] || null;
    if (!私) {
      const row = period === "week"
        ? await env.DB.prepare(
            "SELECT best_ms FROM survive_weekly WHERE user_id = ?1 AND course_id = ?2 AND week = ?3 LIMIT 1"
          ).bind(me.uid, cid, week).first().catch(() => null)
        : await env.DB.prepare(
            "SELECT best_ms FROM survive_records WHERE user_id = ?1 AND course_id = ?2 LIMIT 1"
          ).bind(me.uid, cid).first().catch(() => null);
      const b = N(row && row.best_ms, 0);
      /* 200 位より 下でも 「何位か」は 数えて 返す（数えるだけなら 安い）。 */
      if (b > 0) {
        const c = period === "week"
          ? await env.DB.prepare(
              "SELECT COUNT(1) AS n FROM survive_weekly WHERE course_id = ?1 AND week = ?2 AND best_ms > 0 AND best_ms < ?3"
            ).bind(cid, week, b).first().catch(() => null)
          : await env.DB.prepare(
              "SELECT COUNT(1) AS n FROM survive_records WHERE course_id = ?1 AND best_ms > 0 AND best_ms < ?2"
            ).bind(cid, b).first().catch(() => null);
        私 = { rank: N(c && c.n, 0) + 1, id: String(me.uid), name: me.nickname || "あなた", bestMs: b, 圏外: true };
      }
    }
  }

  /* 区間の 記録（自分の いちばん 速かった 走り） */
  let splits = [];
  if (me) {
    const r = await env.DB.prepare(
      "SELECT splits_json FROM survive_records WHERE user_id = ?1 AND course_id = ?2 LIMIT 1"
    ).bind(me.uid, cid).first().catch(() => null);
    try { const v = JSON.parse(String((r && r.splits_json) || "[]")); if (Array.isArray(v)) splits = v.slice(0, 16).map((x) => N(x, 0)); } catch (e) {}
  }

  return json({ ok: true, period, scope, week, rows: 並び.slice(0, 20), me: 私, splits, total: 並び.length });
}

/* 相互に フォローして いる 人の 番号。友だちの 一覧と 同じ 決まりに 揃える。 */
async function 相互フォロー(env, uid) {
  const out = [];
  try {
    const rs = await env.DB.prepare(`
      SELECT a.followee_id AS id FROM user_follows a
        JOIN user_follows b
          ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
         AND b.deleted_at = 0 AND b.approved_at > 0
       WHERE a.follower_id = ?1 AND a.deleted_at = 0 AND a.approved_at > 0
       LIMIT 200
    `).bind(uid).all();
    for (const r of (rs?.results || [])) out.push(N(r.id, 0));
  } catch (e) { /* 表が 無ければ 友だち 0 人 */ }
  return out.filter(Boolean);
}

/* ══ ⑤ 部屋 ═══════════════════════════════════════════════════════════ */
function roomCode(seed) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  /* 見間違えやすい 文字を 抜く */
  let s = "";
  const r = mulberry(seed >>> 0);
  for (let i = 0; i < 6; i++) s += A[Math.floor(r() * A.length)];
  return s;
}

/* 部屋を 立て続けに 作られない ように する。
   ★ Worker の isolate は いつ 消えても おかしくない ので、これは
     「完全な 見張り」では ない。**それでも 素直な 連打は 止まる。**
     本気の 妨害は Durable Object 側の 人数上限が 受け止める。 */
const ROOM_WINDOW_MS = 10 * 60 * 1000;
const ROOM_MAX = 12;
const _roomHits = new Map();
let _roomPruned = 0;

/* 手元の 数え（速い・ただし isolate が 消えると 忘れる）。
   これは **おまけ**。本当の 判定は 下の 表で 行う。 */
function tooManyRoomsFast(uid) {
  const now = Date.now();
  const a = (_roomHits.get(uid) || []).filter((t) => now - t < ROOM_WINDOW_MS);
  a.push(now);
  _roomHits.set(uid, a);
  if (_roomHits.size > 5000) _roomHits.clear();   /* 溜め込まない */
  return a.length > ROOM_MAX;
}

/* 表の 数え（isolate が 入れ替わっても 残る）。
   ★ 数え → 足す の 順。先に 足すと 自分の 1 件で 上限が 1 つ 減る。
   ★ 表が 使えない ときは **通す**。見張りの ために 遊びを 止めない。 */
async function tooManyRoomsDurable(env, uid) {
  if (!env || !env.DB) return false;
  const now = Date.now();
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(1) AS n FROM survive_room_hits WHERE user_id = ?1 AND created_at > ?2"
    ).bind(uid, now - ROOM_WINDOW_MS).first();
    const n = N(r && r.n, 0);
    /* 古い 行は ときどき 捨てる（10 分に 1 回で 十分） */
    if (now - _roomPruned > ROOM_WINDOW_MS) {
      _roomPruned = now;
      await env.DB.prepare("DELETE FROM survive_room_hits WHERE created_at < ?1")
        .bind(now - ROOM_WINDOW_MS * 3).run().catch(() => {});
    }
    if (n >= ROOM_MAX) return true;
    await env.DB.prepare("INSERT INTO survive_room_hits (user_id, created_at) VALUES (?1, ?2)")
      .bind(uid, now).run();
  } catch (e) { return false; }
  return false;
}

async function handleRoomCreate(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  if (!env.SURVIVE_ROOMS) return bad("NOT_CONFIGURED", "対戦の 部屋が 使えません。", 500);
  await ensureTables(env);
  if (tooManyRoomsFast(me.uid) || await tooManyRoomsDurable(env, me.uid)) {
    return bad("TOO_MANY", "部屋を 作りすぎです。少し 待ってください。", 429);
  }
  const b = (await readJson(request, 4096)) || {};
  const id = roomCode((Date.now() ^ (me.uid * 2654435761)) >>> 0);
  const stub = env.SURVIVE_ROOMS.get(env.SURVIVE_ROOMS.idFromName(id));
  await stub.fetch("https://survive.internal/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomId: id, hostId: me.uid,
      courseId: S(b.courseId, 24) || "c01",
      mode: S(b.mode, 24) || "race",
      max: CL(b.max, 2, 8) || 8
    })
  }).catch(() => null);
  return json({ ok: true, roomId: id, wsUrl: wsUrlFor(request, id) });
}

async function handleRoomInfo(request, env, roomId) {
  if (!env.SURVIVE_ROOMS) return bad("NOT_CONFIGURED", "対戦の 部屋が 使えません。", 500);
  const id = S(roomId, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!id) return bad("BAD_REQUEST", "あいことばが 不正です。");
  const stub = env.SURVIVE_ROOMS.get(env.SURVIVE_ROOMS.idFromName(id));
  const r = await stub.fetch("https://survive.internal/info").catch(() => null);
  if (!r || !r.ok) return json({ ok: false, code: "NOT_FOUND", message: "その 部屋は ありません。" }, 404);
  const d = await r.json().catch(() => null);
  return json({ ok: true, room: d, wsUrl: wsUrlFor(request, id) });
}

function wsUrlFor(request, roomId) {
  try {
    const u = new URL(request.url);
    const proto = u.protocol === "http:" ? "ws:" : "wss:";
    return proto + "//" + u.host + "/ws/survive/" + roomId;
  } catch (e) { return "/ws/survive/" + roomId; }
}

async function handleWsUpgrade(request, env, roomIdRaw) {
  if (!env.SURVIVE_ROOMS) return bad("NOT_CONFIGURED", "対戦の 部屋が 使えません。", 500);
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return bad("BAD_REQUEST", "WebSocket が 必要です。");
  }
  const id = S(roomIdRaw, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!id) return bad("BAD_REQUEST", "あいことばが 不正です。");
  const url = new URL(request.url);
  const token = S(url.searchParams.get("token") || "", 4096) || parseBearer(request);
  const me = await userFromToken(token, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (me.blocked) return bad("ACCOUNT_BLOCKED", "この アカウントは いま 使えません。", 403);
  const stub = env.SURVIVE_ROOMS.get(env.SURVIVE_ROOMS.idFromName(id));
  return stub.fetch("https://survive.internal/connect", {
    headers: {
      Upgrade: "websocket", Connection: "Upgrade",
      "X-VS-Uid": String(me.uid),
      "X-VS-Name": encodeURIComponent(me.nickname || ("ID" + me.uid)),
      "X-VS-Room": id
    }
  });
}

/* ══ 入口 ═════════════════════════════════════════════════════════════ */
export function isSurvivePath(path) {
  return path.startsWith("/api/survive/") || path.startsWith("/ws/survive/");
}

export async function handleSurviveRequest(request, env, ctx) {
  let path = "/";
  try { path = (new URL(request.url).pathname || "/").replace(/\/+$/, "") || "/"; } catch (e) { return null; }
  if (!isSurvivePath(path)) return null;
  const m = request.method.toUpperCase();

  try {
    if (path.startsWith("/ws/survive/")) {
      return await handleWsUpgrade(request, env, path.slice("/ws/survive/".length));
    }
    if (m === "POST" && path === "/api/survive/questions") return await handleQuestions(request, env);
    if (m === "GET" && path === "/api/survive/presets") return await handlePresets(request, env);
    if (m === "GET" && path === "/api/survive/friends") return await handleFriends(request, env);
    if (m === "POST" && path === "/api/survive/result") return await handleResult(request, env);
    if (m === "GET" && path === "/api/survive/stats") return await handleStats(request, env);
    if (m === "POST" && path === "/api/survive/room") return await handleRoomCreate(request, env);
    if (m === "POST" && path === "/api/survive/invite") return await handleInvite(request, env);
    {
      const g = /^\/api\/survive\/room\/([A-Za-z0-9]{1,16})$/.exec(path);
      if (m === "GET" && g) return await handleRoomInfo(request, env, g[1]);
      const lb = /^\/api\/survive\/leaderboard\/([A-Za-z0-9_-]{1,24})$/.exec(path);
      if (m === "GET" && lb) return await handleLeaderboard(request, env, lb[1]);
    }
    if (m === "OPTIONS") return new Response(null, { status: 204 });
    return json({ ok: false, code: "NOT_FOUND", message: "そのような 口は ありません。" }, 404);
  } catch (e) {
    console.error("[survive] " + path + " で 失敗:", String(e && e.stack || e));
    return json({ ok: false, code: "SERVER_ERROR", message: "サーバで 失敗しました。" }, 500);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SurviveRoom — 1 試合 ＝ 1 部屋（Durable Object）

   決めごと（要件 19〜22）:
     ・**サーバが 正。** ただし 走る計算まで サーバで 回すのは 重すぎるので、
       「あり得るか」を 見る 方式にする。
         速さ  … 前の 知らせからの 移動距離が 物理の 上限を 超えていないか
         瞬間移動 … いきなり 遠くへ 飛んでいないか
         中間地点 … 順番を 飛ばしていないか
         ゴール … 中間地点を 全部 通り、進みが 9 割を 超えているか
         クイズ … **答えは サーバが 持っている**（画面の 自己申告を 信じない）
     ・毎フレーム 配らない。受けるのは 20Hz、配るのは 15Hz。
     ・切れても 試合は 続く。戻って来られる。
   ══════════════════════════════════════════════════════════════════════════ */

const TICK_MS = 66;              /* 配る 間隔（≒15Hz） */
const ROOM_TTL_MS = 45 * 60 * 1000;
const GHOST_MS = 25 * 1000;      /* 切れた 人を 残す 時間 */
const MAX_SPEED = 8.2 * 1.34;    /* ごほうびの 加速 込み */
const SPEED_MARGIN = 1.6;        /* 通信の ゆらぎぶん */
const COUNTDOWN_MS = 3200;

export class SurviveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();     /* uid → {ws, uid, name} */
    this.room = null;
    this._timer = null;
    this._load = this._restore();
  }

  async _restore() {
    const st = await this.state.storage.get("room").catch(() => null);
    this.room = (st && typeof st === "object") ? st : {
      roomId: "", hostId: 0, courseId: "c01", mode: "race", max: 8,
      presetKind: "", presetId: "", presetOwner: 0, presetName: "",
      /* 自作コースの 中身（合言葉と 同じ 縮めた 文字）。
         ★ **中身は 見ない。** 受け取った 画面が 洗ってから 組み立てる。
           ここで 洗おうとすると、区画の 決まりを サーバにも 写す ことに なり、
           片方だけ 直った ときに 「主だけ 違う コース」に なる。 */
      courseCode: "", courseName: "",
      phase: "lobby",                 /* lobby / countdown / running / finished */
      createdAt: Date.now(), expiresAt: Date.now() + ROOM_TTL_MS,
      seed: (Date.now() / 1000) | 0,
      startAt: 0, players: {}, questions: [], finishOrder: [], courseLength: 0
    };
  }
  async _ready() { await this._load; if (!this.room) await this._restore(); }
  async _save() { try { await this.state.storage.put("room", this.room); } catch (e) {} }

  _send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  _all(o) { const s = JSON.stringify(o); for (const x of this.sessions.values()) { try { x.ws.send(s); } catch (e) {} } }
  _except(uid, o) {
    const s = JSON.stringify(o);
    for (const x of this.sessions.values()) { if (x.uid !== uid) { try { x.ws.send(s); } catch (e) {} } }
  }

  _publicRoom() {
    const r = this.room;
    return {
      roomId: r.roomId, hostId: r.hostId, courseId: r.courseId, mode: r.mode,
      presetKind: r.presetKind || "", presetId: r.presetId || "",
      presetOwner: r.presetOwner || 0, presetName: r.presetName || "",
      /* ★ 合言葉そのものは ここに 載せない。部屋の 知らせは 何度も 飛ぶ ので、
         3KB を 毎回 配ると 通信が 太る。始める ときに 1 回だけ 配る。 */
      courseName: r.courseName || "", hasCourse: r.courseCode ? 1 : 0,
      phase: r.phase, max: r.max, seed: r.seed, startAt: r.startAt,
      players: Object.values(r.players).map((p) => ({
        id: String(p.uid), name: p.name, colorIndex: p.color,
        hat: p.hat || "none", hatColor: p.hatColor | 0,
        ready: !!p.ready, online: !!p.online, rank: p.rank | 0,
        progress: Math.round(p.pr * 10) / 10, finished: !!p.fin,
        finishTime: p.finTime || 0, correct: p.qc | 0, wrong: p.qw | 0
      }))
    };
  }

  async fetch(request) {
    await this._ready();
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/create" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      this.room.roomId = S(b.roomId, 16);
      this.room.hostId = N(b.hostId, 0);
      this.room.courseId = S(b.courseId, 24) || "c01";
      this.room.mode = S(b.mode, 24) || "race";
      this.room.max = CL(b.max, 2, 8) || 8;
      this.room.expiresAt = Date.now() + ROOM_TTL_MS;
      this.room.phase = "lobby";
      await this._save();
      return json({ ok: true, room: this._publicRoom() });
    }

    if (p === "/info") {
      if (!this.room.roomId) return json({ ok: false }, 404);
      if (Date.now() > this.room.expiresAt) return json({ ok: false }, 404);
      return json(this._publicRoom());
    }

    if (p === "/connect" && String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket") {
      const uid = N(request.headers.get("X-VS-Uid"), 0);
      const name = S(decodeURIComponent(request.headers.get("X-VS-Name") || ""), 24) || ("ID" + uid);
      const rid = S(request.headers.get("X-VS-Room"), 16);
      if (!uid) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
      if (!this.room.roomId) { this.room.roomId = rid; this.room.hostId = uid; }
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      server.accept();
      this._attach(server, uid, name);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ ok: false, code: "NOT_FOUND" }, 404);
  }

  _attach(ws, uid, name) {
    const r = this.room;
    /* すでに いる 人（切れて 戻ってきた）? */
    let p = r.players[String(uid)];
    const first = !p;
    if (!p) {
      const n = Object.keys(r.players).length;
      if (n >= r.max) { this._send(ws, { t: "err", code: "FULL", msg: "部屋が いっぱいです。" }); try { ws.close(1000); } catch (e) {} return; }
      p = {
        uid, name, color: n % 8, hat: "none", hatColor: 0, ready: false, online: true,
        x: 0, y: 0, z: 0, yaw: 0, g: 1, pr: 0, cp: 0, fin: false, finTime: 0,
        rank: 0, qc: 0, qw: 0, seq: 0, lastAt: Date.now(), gates: {}
      };
      r.players[String(uid)] = p;
    } else {
      p.online = true; p.name = name; p.lastAt = Date.now();
    }
    const old = this.sessions.get(uid);
    if (old && old.ws !== ws) { try { old.ws.close(1000, "別の 端末で 入り直しました"); } catch (e) {} }
    this.sessions.set(uid, { ws, uid, name });

    ws.addEventListener("message", (ev) => this._onMessage(uid, ev.data));
    ws.addEventListener("close", () => this._onClose(uid));
    ws.addEventListener("error", () => this._onClose(uid));

    this._send(ws, { t: "welcome", you: String(uid), room: this._publicRoom(),
      questions: r.phase === "lobby" ? null : this._maskQuestions() });
    this._all({ t: "room", room: this._publicRoom() });
    this._ensureTimer();
    this._save();
  }

  _onClose(uid) {
    const p = this.room.players[String(uid)];
    if (p) { p.online = false; p.offAt = Date.now(); }
    this.sessions.delete(uid);
    this._all({ t: "room", room: this._publicRoom() });
    this._save();
    if (!this.sessions.size) this._stopTimer();
  }

  /** 問題は **答えを 隠して** 配る（画面が 先に 見られない ように） */
  _maskQuestions() {
    return (this.room.questions || []).map((q) => ({ prompt: q.prompt, choices: q.choices, tag: q.tag }));
  }

  async _onMessage(uid, raw) {
    await this._ready();
    let m = null;
    try { m = JSON.parse(String(raw || "")); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    const r = this.room;
    const p = r.players[String(uid)];
    if (!p) return;
    p.lastAt = Date.now();
    const t = S(m.t, 16);

    if (t === "ping") { const s = this.sessions.get(uid); if (s) this._send(s.ws, { t: "pong", ts: N(m.ts, 0) }); return; }

    if (t === "ready") { p.ready = !!m.v; this._all({ t: "room", room: this._publicRoom() }); this._save(); return; }
    if (t === "color") {
      const c = CL(m.v, 0, 7);
      /* 同じ 色は 取れない */
      for (const q of Object.values(r.players)) if (q.uid !== uid && q.color === c) return;
      p.color = c; this._all({ t: "room", room: this._publicRoom() }); this._save(); return;
    }
    /* かぶりもの。**見た目だけ**なので だぶっても かまわない（色とは 違う）。 */
    if (t === "hat") {
      p.hat = S(m.v, 16) || "none";
      p.hatColor = CL(m.c, 0, 15);
      this._all({ t: "room", room: this._publicRoom() }); this._save(); return;
    }
    if (t === "course" && uid === r.hostId && r.phase === "lobby") {
      r.courseId = S(m.id, 40) || r.courseId;
      /* 自作コース。**大きさだけ 見る**（24KB まで）。
         中身は 受け取る 側が 洗う。 */
      const code = S(m.code, 24 * 1024);
      if (code && /^VS1[A-Za-z0-9\-_]+$/.test(code)) {
        r.courseCode = code; r.courseName = S(m.name, 40);
      } else { r.courseCode = ""; r.courseName = ""; }
      this._all({ t: "room", room: this._publicRoom() }); this._save(); return;
    }
    /* ★ 対戦で 使えるのは **誰でも 読める もの だけ**（公開・公式）。
       「自分の 単語帳」は 相手の 端末から 引けない ので ここでは 受けない。
       受けて しまうと 相手だけ 控えの 単語に なり、同じ 問題で 競って いない。 */
    if (t === "preset" && uid === r.hostId && r.phase === "lobby") {
      const k = S(m.kind, 16);
      if (k === "public" || k === "official") {
        r.presetKind = k; r.presetId = S(m.id, 80);
        r.presetOwner = N(m.owner, 0); r.presetName = S(m.name, 80);
      } else {
        r.presetKind = ""; r.presetId = ""; r.presetOwner = 0; r.presetName = "";
      }
      this._all({ t: "room", room: this._publicRoom() }); this._save(); return;
    }
    if (t === "mode" && uid === r.hostId && r.phase === "lobby") {
      r.mode = S(m.v, 24) || r.mode;
      this._all({ t: "room", room: this._publicRoom() }); this._save(); return;
    }
    if (t === "start" && uid === r.hostId && r.phase === "lobby") { await this._start(N(m.length, 0)); return; }

    if (t === "in" && r.phase === "running") { this._onInput(p, m); return; }

    if (t === "gate" && r.phase === "running") {
      const gi = CL(m.g, 0, 63);
      if (p.gates[gi]) return;                       /* 二重は 受けない */
      const q = r.questions[gi % Math.max(1, r.questions.length)];
      const pick = N(m.a, -1);
      /* ★ 正解かどうかは **サーバが 決める**。画面の 申告は 使わない。 */
      const correct = q ? (pick === q.answer) : false;
      p.gates[gi] = correct ? 1 : 2;
      if (correct) p.qc++; else p.qw++;
      const s = this.sessions.get(uid);
      if (s) this._send(s.ws, { t: "gate", g: gi, c: correct, a: q ? q.answer : -1 });
      this._except(uid, { t: "pgate", id: String(uid), g: gi, c: correct });
      return;
    }

    if (t === "fin" && r.phase === "running") { this._onFinish(p, m); return; }
  }

  /* ── 入力と 位置。**ここが 検算**。 ─────────────────────────────── */
  _onInput(p, m) {
    const s = m.s || {};
    const now = Date.now();
    const dt = Math.max(0.016, Math.min(1.5, (now - (p.lastPos || now)) / 1000));
    const 初回 = !p.lastPos;
    p.lastPos = now;

    /* ★ 最初の 1 通は そのまま 受ける。
       出発の 並びは 人ごとに 横へ ずれている（最大 ±7m）ので、
       0 を もとに 比べると **正しく 走っているのに 咎められる**。
       実際 B（x=2 から 出発）が 1 通目で 弾かれた（2026-08-28 実測）。 */
    if (初回) {
      p.x = N(s.x, 0); p.y = N(s.y, 0); p.z = N(s.z, 0);
      p.yaw = N(s.yaw, 0); p.g = s.g ? 1 : 0; p.st = s.st ? 1 : 0;
      p.pr = Math.max(0, N(s.pr, 0)); p.cp = CL(s.cp, 0, 32);
      p.rs = N(s.rs, 0); p.seq = N(m.seq, 0); p.dirty = true;
      return;
    }

    const nx = N(s.x, p.x), ny = N(s.y, p.y), nz = N(s.z, p.z);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return;

    /* ① 速さ。物理の 上限＋ゆらぎ を 超えたら 直す。 */
    const moved = Math.hypot(nx - p.x, nz - p.z);
    const allow = MAX_SPEED * dt + SPEED_MARGIN;
    let 直す = false;
    if (moved > allow) {
      /* 中間地点へ 戻った ときは 大きく 飛ぶので 見逃す */
      const back = N(s.rs, 0);   /* 戻された 回数 */
      if (back <= (p.rs || 0)) { 直す = true; p.cheat = (p.cheat || 0) + 1; }
      p.rs = back;
    } else { p.rs = N(s.rs, p.rs || 0); }

    /* ② 進み。戻った とき 以外は 減らない。 */
    const npr = Math.max(0, N(s.pr, p.pr));
    if (npr - p.pr > MAX_SPEED * dt + SPEED_MARGIN * 2) { 直す = true; p.cheat = (p.cheat || 0) + 1; }

    /* ③ 中間地点。飛ばせない。 */
    const ncp = CL(s.cp, 0, 32);
    if (ncp > p.cp + 1) { p.cheat = (p.cheat || 0) + 1; }
    else if (ncp >= p.cp) p.cp = ncp;

    if (直す) {
      const sess = this.sessions.get(p.uid);
      if (sess) this._send(sess.ws, { t: "fix", x: p.x, y: p.y, z: p.z, pr: p.pr, why: "speed" });
      return;   /* 受け付けない */
    }

    p.x = nx; p.y = ny; p.z = nz;
    p.yaw = N(s.yaw, p.yaw);
    p.g = s.g ? 1 : 0;
    p.st = s.st ? 1 : 0;
    p.pr = npr;
    p.seq = N(m.seq, p.seq);
    p.dirty = true;
  }

  _onFinish(p, m) {
    const r = this.room;
    if (p.fin) return;
    /* ④ ゴールの 検算 */
    const need = r.courseLength > 0 ? r.courseLength * 0.9 : 0;
    if (need > 0 && p.pr < need) { p.cheat = (p.cheat || 0) + 1; return; }
    const el = (Date.now() - r.startAt) / 1000;
    const fastest = r.courseLength > 0 ? (r.courseLength / (MAX_SPEED * 1.05)) : 0;
    if (el < fastest * 0.75) { p.cheat = (p.cheat || 0) + 1; return; }
    p.fin = true;
    p.finTime = Math.round(el * 1000) / 1000;
    r.finishOrder.push(String(p.uid));
    p.rank = r.finishOrder.length;
    this._all({ t: "fin", id: String(p.uid), rank: p.rank, time: p.finTime });
    this._save();
    const alive = Object.values(r.players).filter((q) => q.online && !q.fin);
    if (!alive.length) this._end();
  }

  async _start(courseLength) {
    const r = this.room;
    r.phase = "countdown";
    r.seed = ((Date.now() / 1000) | 0) ^ (r.hostId * 2654435761);
    r.startAt = Date.now() + COUNTDOWN_MS;
    r.courseLength = Math.max(0, N(courseLength, 0));
    r.finishOrder = [];
    /* 問題を **サーバで 作る**。全員 同じ もの。答えは 隠して 配る。
       ★ 部屋主が 選んだ 単語帳（公開・公式）が あれば そこから。
         読めなければ 黙って 内蔵の 単語へ 落ちる。門が 開かなく なるより よい。 */
    let 種本 = FALLBACK_WORDS;
    if (r.presetKind === "public" || r.presetKind === "official") {
      const got = await 公開の単語帳(this.env, r.presetKind, r.presetId, r.presetOwner);
      if (got && got.pairs.length >= 8) 種本 = got.pairs;
    }
    r.questions = buildQuestions(種本, 10, r.seed >>> 0);
    for (const p of Object.values(r.players)) {
      p.pr = 0; p.cp = 0; p.fin = false; p.finTime = 0; p.rank = 0;
      p.qc = 0; p.qw = 0; p.gates = {}; p.cheat = 0; p.rs = 0;
      /* 出発の 位置は これから 1 通目で 決まる */
      p.lastPos = 0; p.x = 0; p.y = 0; p.z = 0;
    }
    await this._save();
    this._all({ t: "go", startAt: r.startAt, seed: r.seed, courseId: r.courseId,
      courseCode: r.courseCode || "", courseName: r.courseName || "",
      mode: r.mode, questions: this._maskQuestions(), room: this._publicRoom() });
    this._ensureTimer();
    setTimeout(() => { if (this.room.phase === "countdown") { this.room.phase = "running"; this._save(); } }, COUNTDOWN_MS + 50);
  }

  _end() {
    const r = this.room;
    if (r.phase === "finished") return;
    r.phase = "finished";
    const rows = Object.values(r.players).map((p) => ({
      id: String(p.uid), name: p.name, colorIndex: p.color,
      rank: p.rank || 99, finished: !!p.fin, finishTime: p.finTime || 0,
      progress: p.pr, correct: p.qc, wrong: p.qw, suspicious: (p.cheat || 0) > 3
    }));
    rows.sort((a, b) => (a.rank - b.rank) || (b.progress - a.progress));
    this._all({ t: "end", results: rows });
    this._save();
  }

  /* ── 配る ─────────────────────────────────────────────────────── */
  _ensureTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }
  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _tick() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();

    /* 切れた 人の 後始末 */
    let changed = false;
    for (const p of Object.values(r.players)) {
      if (!p.online && p.offAt && now - p.offAt > GHOST_MS && r.phase === "lobby") {
        delete r.players[String(p.uid)];
        changed = true;
      }
    }
    if (changed) this._all({ t: "room", room: this._publicRoom() });

    if (r.phase === "countdown" && now >= r.startAt) { r.phase = "running"; this._save(); }
    if (r.phase !== "running") return;

    /* 順位（進んだ 順） */
    const rest = Object.values(r.players).filter((p) => !p.fin);
    rest.sort((a, b) => b.pr - a.pr);
    for (let i = 0; i < rest.length; i++) rest[i].rank = r.finishOrder.length + i + 1;

    /* 変わった 人だけ 配る */
    const ps = [];
    for (const p of Object.values(r.players)) {
      if (!p.dirty) continue;
      p.dirty = false;
      ps.push({
        id: String(p.uid),
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100,
        yaw: Math.round(p.yaw * 100) / 100, g: p.g, st: p.st | 0,
        pr: Math.round(p.pr * 10) / 10, cp: p.cp, rank: p.rank, fin: p.fin ? 1 : 0
      });
    }
    if (ps.length) this._all({ t: "snap", ts: now, ps });

    /* 全員 ゴール／時間切れ */
    if (now - r.startAt > 6 * 60 * 1000) this._end();
  }
}
