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
  return { uid: N(row.userId, 0), nickname: S(row.nickname, 40), grade: S(row.gradePrefix, 8) };
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
  `CREATE INDEX IF NOT EXISTS idx_survive_rec_course ON survive_records (course_id, best_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_survive_stats_xp ON survive_stats (xp DESC)`
];

let _tablesReady = 0;
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

  /* プリセットが 指定されて いれば そこから */
  const presetId = S(body.presetId, 80);
  if (presetId && env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT payload FROM account_blobs WHERE key = ?1 LIMIT 1"
      ).bind("preset:" + presetId).first().catch(() => null);
      if (row && row.payload) {
        const d = JSON.parse(String(row.payload));
        const words = (d && (d.words || d.items || d.rows)) || [];
        const got = [];
        for (const w of words) {
          const a = S(w.term || w.word || w.q || w.front, 60);
          const b = S(w.meaning || w.answer || w.a || w.back, 60);
          if (a && b) got.push([a, b]);
        }
        if (got.length >= 8) pairs = got;
      }
    } catch (e) { /* 使えなければ 次へ */ }
  }

  if (!pairs) pairs = FALLBACK_WORDS;
  const questions = buildQuestions(pairs, count, seed);
  return json({ ok: true, questions, source: pairs === FALLBACK_WORDS ? "builtin" : "preset" });
}

/* ══ ② 友だち ═════════════════════════════════════════════════════════
   すでに ある フォローの 表を 使う。**相互に フォロー**している 人だけ。 */
async function handleFriends(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (!env.DB) return json({ ok: true, friends: [] });
  let rows = [];
  try {
    rows = (await env.DB.prepare(`
      SELECT u.id AS id, u.nickname AS name
        FROM social_follows a
        JOIN social_follows b ON b.follower_id = a.following_id AND b.following_id = a.follower_id
        JOIN users u ON u.id = a.following_id
       WHERE a.follower_id = ?1
       LIMIT 60
    `).bind(me.uid).all().catch(() => ({ results: [] }))).results || [];
  } catch (e) { rows = []; }
  return json({
    ok: true,
    friends: rows.map((r) => ({ id: String(r.id), name: S(r.name, 40) || ("ID" + r.id), online: false }))
  });
}

/* ══ ③ 成績を 残す ════════════════════════════════════════════════════ */
async function handleResult(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (!(await ensureTables(env))) return json({ ok: true, saved: false });
  const b = await readJson(request, 8 * 1024);
  if (!b) return bad("BAD_REQUEST", "本文が 読めません。");
  const courseId = S(b.courseId, 24);
  const finished = !!b.finished;
  const timeMs = Math.round(CL(b.time, 0, 3600) * 1000);
  const rank = CL(b.rank, 0, 64);
  const correct = CL(b.correct, 0, 200);
  const wrong = CL(b.wrong, 0, 200);
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
      await env.DB.prepare(`
        INSERT INTO survive_records (user_id, course_id, best_ms, runs, finishes, updated_at)
        VALUES (?1, ?2, ?3, 1, ?4, ?5)
        ON CONFLICT(user_id, course_id) DO UPDATE SET
          best_ms = ?3, runs = runs + 1, finishes = finishes + ?4, updated_at = ?5
      `).bind(me.uid, courseId, best, finished ? 1 : 0, now).run();
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
  const rows = (await env.DB.prepare(`
    SELECT r.user_id AS id, u.nickname AS name, r.best_ms AS bestMs
      FROM survive_records r JOIN users u ON u.id = r.user_id
     WHERE r.course_id = ?1 AND r.best_ms > 0
     ORDER BY r.best_ms ASC LIMIT 20
  `).bind(S(courseId, 24)).all().catch(() => ({ results: [] }))).results || [];
  return json({ ok: true, rows: rows.map((r, i) => ({ rank: i + 1, id: String(r.id), name: S(r.name, 40), bestMs: N(r.bestMs) })) });
}

/* ══ ⑤ 部屋 ═══════════════════════════════════════════════════════════ */
function roomCode(seed) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  /* 見間違えやすい 文字を 抜く */
  let s = "";
  const r = mulberry(seed >>> 0);
  for (let i = 0; i < 6; i++) s += A[Math.floor(r() * A.length)];
  return s;
}

async function handleRoomCreate(request, env) {
  const me = await userFromRequest(request, env);
  if (!me) return bad("UNAUTHORIZED", "ログインが 必要です。", 401);
  if (!env.SURVIVE_ROOMS) return bad("NOT_CONFIGURED", "対戦の 部屋が 使えません。", 500);
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
    if (m === "GET" && path === "/api/survive/friends") return await handleFriends(request, env);
    if (m === "POST" && path === "/api/survive/result") return await handleResult(request, env);
    if (m === "GET" && path === "/api/survive/stats") return await handleStats(request, env);
    if (m === "POST" && path === "/api/survive/room") return await handleRoomCreate(request, env);
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
      phase: r.phase, max: r.max, seed: r.seed, startAt: r.startAt,
      players: Object.values(r.players).map((p) => ({
        id: String(p.uid), name: p.name, colorIndex: p.color,
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
        uid, name, color: n % 8, ready: false, online: true,
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
    if (t === "course" && uid === r.hostId && r.phase === "lobby") {
      r.courseId = S(m.id, 24) || r.courseId;
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
    /* 問題を **サーバで 作る**。全員 同じ もの。答えは 隠して 配る。 */
    r.questions = buildQuestions(FALLBACK_WORDS, 10, r.seed >>> 0);
    for (const p of Object.values(r.players)) {
      p.pr = 0; p.cp = 0; p.fin = false; p.finTime = 0; p.rank = 0;
      p.qc = 0; p.qw = 0; p.gates = {}; p.cheat = 0; p.rs = 0;
      /* 出発の 位置は これから 1 通目で 決まる */
      p.lastPos = 0; p.x = 0; p.y = 0; p.z = 0;
    }
    await this._save();
    this._all({ t: "go", startAt: r.startAt, seed: r.seed, courseId: r.courseId,
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
