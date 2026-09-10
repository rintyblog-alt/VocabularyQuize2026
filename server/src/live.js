/* ══════════════════════════════════════════════════════════════════════════
   みんなで解く（ライブルーム）　2026-09-10
   訴え「他のユーザーとカフートのように、部屋（PINコード6桁 V から始まる）を
        作って、それを入力し、ユーザーのニックネームを設定したら始まる仕組みに」

   ★ ここへは **入口と 部屋だけ**。worker.js は 70,000 行 あるので
     admin.js / survive.js / calls.js と 同じく 丸ごと 引き受ける。

   受け持つ 道:
     POST /api/live/create   部屋を 作る（作る人だけ ログインが 要る）
     GET  /api/live/info     PIN から 部屋の 様子（入る 前の 下見）
     POST /api/live/join     PIN と ニックネームで 入る（**ログイン不要**）
     GET  /ws/live/:PIN      つなぐ（WebSocket）

   決めごと:
     ・PIN は **6 文字・先頭 V**。残り 5 文字は 見まちがえない 字だけ
       （0/O・1/I/L は 使わない）。
     ・**答えは 配らない。** 問題を 配る ときに answer を 落とす。
       画面の JSON を 見れば 分かる、では 意味が ない。
     ・**正誤は サーバが 出す。** 画面に 出させると いくらでも 言い張れる。
     ・参加者は ログインしなくて よい。合言葉の 代わりに **入室の 鍵**を 配る。
   ══════════════════════════════════════════════════════════════════════════ */

const PIN_LEN = 6;
/* 見まちがえない 字だけ（0 O 1 I L を 抜いた 32 字）。
   声で 伝えたり 手で 書いたり する ので、ここは けちらない。 */
const PIN_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;   /* 6 時間で 消える */
/* ★ 1000 人（2026-09-10・訴え「参加者は 最大 1000 人に」）。
   ただし **人数を 増やす だけでは 壊れる**。
   部屋の 姿を 丸ごと 配ると 1 人 約 80 バイト × 1000 人 ＝ 80KB。
   入室の たびに 全員へ 配れば 1 回で 80MB。だから:
     ・配る 人の 一覧は **先頭 SHOW 人まで**（総数は 別に 送る）
     ・部屋の 姿は **まとめて 1.2 秒に 1 回**（入室が 続く ときに 効く）
     ・順位は **上位 100 位まで** */
const MAX_PLAYERS = 1000;
const SHOW_PLAYERS = 60;     /* 一覧で 配る 人数 */
const SHOW_RANK = 100;       /* 順位で 配る 人数 */
const ROOM_PUSH_MS = 1200;   /* 部屋の 姿を 配る 間隔 */
const MAX_QUESTIONS = 100;
const NICK_MAX = 16;

/* 人ごとの 色。**12 色まで**。並んだ ときに 隣どうしが 似ない 順に した。 */
const PLAYER_COLORS = 12;
/* ★ キャラクター（2026-09-10・訴え「キャラクターとかも あると いいかもね」）。
   絵は 画面側が 描く。ここは **どの 顔かを 決める だけ**（0〜N）。
   ニックネームから 決める ので、同じ 名前なら いつも 同じ 顔に なる。 */
/* ★ 種類は 多く 取る（2026-09-10・訴え「キャラクターが シンプルすぎる」）。
   画面側が この 数から **すがた・目・口・飾り**を 割り出す ので、
   ここが 小さいと 同じ 顔ばかりに なる。 */
const FACES = 40320;
function 顔を決める(name, n) {
  let h = 0;
  const t = String(name || "");
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return (h + n) % FACES;
}

const J = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const S = (v, n) => String(v === undefined || v === null ? "" : v).slice(0, n || 200);
const N = (v, d) => { const x = Number(v); return isFinite(x) ? x : (d || 0); };
const CL = (v, a, b) => Math.max(a, Math.min(b, N(v, a)));

/* ══ 札から 人を 引く ══════════════════════════════════════════════════
   ★ **survive.js と 同じ 見かた**（2026-09-10）。
     worker.js の `resolveAuthUserByTokenString` は
     **暗証番号も 利用停止も 見て いない**。この 引き受けは 本体の 関所より
     先に あるので、自分で 見ないと 止めた はずの 人が 遊べて しまう。 */
async function sha256Hex(v) {
  const b = new TextEncoder().encode(String(v || ""));
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
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
  const until = S(row.suspend_until, 40);
  if (st === "suspended" && until && new Date(until).getTime() < Date.now()) return false;
  return true;
}
/* ★ **断る 理由を 分ける**（2026-09-10・訴え「ログインして いるのに 部屋を
   作れない」）。ぜんぶ「ログインが 要ります」に して いたので、
   暗証番号を 確かめて いないだけの 人が **何を すれば よいか 分からなかった**。 */
async function 人を引く(request, env) {
  const m = /^Bearer\s+(.+)$/i.exec(String(request.headers.get("Authorization") || ""));
  const token = m ? m[1].trim() : "";
  if (!token) return { だめ: "NO_TOKEN", message: "部屋を 作るには ログインが 要ります。" };
  if (!env || !env.DB) return { だめ: "NO_DB", message: "いま 部屋を 作れません。少し 待って ください。" };
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT s.user_id AS userId, s.pin_ok_at AS pinOkAt, u.nickname AS nickname, u.pin_hash AS pinHash"
    + " FROM auth_sessions s JOIN users u ON u.id = s.user_id"
    + " WHERE s.token_hash = ?1 AND s.expires_at > ?2 LIMIT 1"
  ).bind(hash, Date.now()).first().catch(() => null);
  if (!row) return { だめ: "EXPIRED", message: "ログインの 期限が 切れて います。入り直して ください。" };
  if (String(row.pinHash || "") && !(N(row.pinOkAt, 0) > 0)) {
    return { だめ: "PIN_REQUIRED",
      message: "暗証番号を 確かめて から 部屋を 作れます。一度 ホームへ 戻って 暗証番号を 入れて ください。" };
  }
  const uid = N(row.userId, 0);
  if (await 止められているか(env, uid)) {
    return { だめ: "BLOCKED", message: "いま この 機能は ご利用いただけません。" };
  }
  return { uid, nickname: S(row.nickname, 40) };
}

/* ══ 経路の 見分け ══════════════════════════════════════════════════════ */
export function isLivePath(path) {
  /* ★ 短い 道 `/v/PIN` は **参加者の 入口**（2026-09-10・訴え
     「参加者は どこから 参加すんのよ」）。
     ※ 注釈の 中に「アスタリスク2つ＋スラッシュ」を 書くと そこで 注釈が
       閉じる。この 罠は 9/10 に 2 回 踏んだ。
     左の メニューを 開いて PIN を 打つ、しか 道が 無かった。
     この 短い 道を 紙に 書いたり QR に したり して 配れる ように する。 */
  /* ★★ **道を まとめて 引き受けては いけない**（2026-09-10・訴え
     「ルミが 反応しなく なった。起動しなく なった。繋ぎ直しに なって しまう」）。

     もとは `path.startsWith("/api/live/")` で その 下を **丸ごと**
     引き受けて いた。ところが **Lumi の 音声会話の 入口が
     `/api/live/token`** で、そこを こちらが 横取りして
     「そのような 口は ありません」を 返して いた。
     札が 取れないので Lumi は 起動できず、繋ぎ直しを くり返す。

     ★ 引き受けるのは **自分の 道だけ**。前方一致で 名乗らない。 */
  return path === "/api/live/create"
    || path === "/api/live/info"
    || path === "/api/live/join"
    || path.startsWith("/ws/live/")
    || /^\/v\/[A-Za-z0-9]{1,8}$/.test(path);
}

function randomPin() {
  const a = new Uint8Array(PIN_LEN - 1);
  crypto.getRandomValues(a);
  let s = "V";
  for (let i = 0; i < a.length; i++) s += PIN_CHARS[a[i] % PIN_CHARS.length];
  return s;
}
function validPin(p) {
  const s = String(p || "").toUpperCase();
  if (s.length !== PIN_LEN || s[0] !== "V") return "";
  for (let i = 1; i < s.length; i++) if (PIN_CHARS.indexOf(s[i]) < 0) return "";
  return s;
}
function randomKey() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function roomStub(env, pin) {
  const id = env.LIVE_ROOMS.idFromName("live:" + pin);
  return env.LIVE_ROOMS.get(id);
}

/* ══ 入口 ══════════════════════════════════════════════════════════════ */
export async function handleLiveRequest(request, env, ctx) {
  let path = "/";
  try { path = (new URL(request.url).pathname || "/").replace(/\/+$/, "") || "/"; } catch (e) { return null; }
  if (!isLivePath(path)) return null;
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  /* ── `/v/PIN` … 参加者の 入口。**トップの 画面を そのまま 返す。**
     画面側は 開いた ときに この 道を 見て、PIN を 入れた 状態で 開く。
     ★ 302 で /?pin= へ 飛ばすと 履歴が 汚れ、戻るで 行き来する。
       中身を そのまま 返す。 */
  if (/^\/v\//.test(path)) {
    const pin = validPin(path.slice(3));
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      /* ★ 資産は **index.html を 名指しで** 取る（2026-09-10 実測）。
         この 資産は html_handling = "none" なので、"/" では 返って こない
         （302 に 落ちて、参加者は トップへ 飛ばされるだけ だった）。 */
      const res = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url).toString(), {
        headers: request.headers
      })).catch(() => null);
      if (res && res.status === 200) {
        const h = new Headers(res.headers);
        h.set("Cache-Control", "no-store");
        /* 画面が すぐ 読めるように、PIN を 印として 添える。 */
        if (pin) h.set("X-VQ-Live-Pin", pin);
        return new Response(res.body, { status: 200, headers: h });
      }
    }
    return new Response("", { status: 302, headers: { Location: "/?pin=" + encodeURIComponent(pin) } });
  }

  if (!env.LIVE_ROOMS) return J({ ok: false, code: "NOT_READY", message: "みんなで解くは まだ 使えません。" }, 503);

  /* ── つなぐ（WebSocket）──────────────────────────────────────────
     ★ 鍵は **クエリで** 受ける。WebSocket は 独自ヘッダを 付けられない
       （ブラウザの API に その口が 無い）。 */
  if (path.startsWith("/ws/live/")) {
    const pin = validPin(path.slice("/ws/live/".length));
    if (!pin) return J({ ok: false, code: "BAD_PIN" }, 400);
    if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return J({ ok: false, code: "NEED_UPGRADE" }, 400);
    }
    const key = S(url.searchParams.get("k"), 64);
    if (!key) return J({ ok: false, code: "NO_KEY" }, 401);
    const stub = roomStub(env, pin);
    return stub.fetch(new Request("https://live/connect?k=" + encodeURIComponent(key), {
      headers: request.headers
    }));
  }

  /* ── 部屋を 作る ─────────────────────────────────────────────────
     ★ 作る 人だけ ログインが 要る（誰の プリセットかを 残す ため）。 */
  if (request.method === "POST" && path === "/api/live/create") {
    const 人 = await 人を引く(request, env);
    if (!人 || 人.だめ) {
      return J({ ok: false, code: 人 ? 人.だめ : "UNAUTHORIZED",
        message: (人 && 人.message) || "部屋を 作るには ログインが 要ります。" },
        人 && 人.だめ === "NO_DB" ? 503 : 401);
    }
    const uid = 人.uid;
    let body = null;
    try { body = await request.json(); } catch (e) { body = null; }
    const qs = Array.isArray(body?.questions) ? body.questions.slice(0, MAX_QUESTIONS) : [];
    if (!qs.length) return J({ ok: false, code: "NO_QUESTIONS", message: "問題が ありません。" }, 400);

    /* PIN が ぶつかったら 引き直す。**同じ PIN の 部屋を 上書きしない。** */
    let pin = "", stub = null, made = null;
    for (let i = 0; i < 6; i++) {
      const p = randomPin();
      const s = roomStub(env, p);
      const r = await s.fetch(new Request("https://live/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: p, hostUid: uid,
          hostName: S(body?.hostName, NICK_MAX) || S(人.nickname, NICK_MAX) || "ホスト",
          title: S(body?.title, 60) || "みんなで解く",
          questions: qs,
          settings: body?.settings || {}
        })
      })).then((x) => x.json()).catch(() => null);
      if (r && r.ok) { pin = p; stub = s; made = r; break; }
      if (r && r.code !== "TAKEN") return J(r, 400);
    }
    if (!pin) return J({ ok: false, code: "PIN_BUSY", message: "いま 混み合って います。もう一度 押して ください。" }, 503);
    return J({ ok: true, pin, hostKey: made.hostKey, room: made.room });
  }

  /* ── 下見（入る 前に 部屋が 生きて いるか）─────────────────────── */
  if (request.method === "GET" && path === "/api/live/info") {
    const pin = validPin(url.searchParams.get("pin"));
    if (!pin) return J({ ok: false, code: "BAD_PIN", message: "PIN は V で 始まる 6 文字です。" }, 400);
    const r = await roomStub(env, pin).fetch(new Request("https://live/info")).then((x) => x.json()).catch(() => null);
    if (!r || !r.ok) return J({ ok: false, code: "NOT_FOUND", message: "その PIN の 部屋は ありません。" }, 404);
    return J(r);
  }

  /* ── 入る（ログイン不要）───────────────────────────────────────── */
  if (request.method === "POST" && path === "/api/live/join") {
    let body = null;
    try { body = await request.json(); } catch (e) { body = null; }
    const pin = validPin(body?.pin);
    if (!pin) return J({ ok: false, code: "BAD_PIN", message: "PIN は V で 始まる 6 文字です。" }, 400);
    const nick = S(body?.nickname, NICK_MAX).trim();
    if (!nick) return J({ ok: false, code: "NO_NICK", message: "ニックネームを 入れて ください。" }, 400);
    const r = await roomStub(env, pin).fetch(new Request("https://live/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nick, uid: 0, rejoinKey: S(body?.rejoinKey, 64) })
    })).then((x) => x.json()).catch(() => null);
    if (!r) return J({ ok: false, code: "NOT_FOUND", message: "その PIN の 部屋は ありません。" }, 404);
    return J(r, r.ok ? 200 : (r.status || 400));
  }

  return J({ ok: false, code: "NOT_FOUND", message: "そのような 口は ありません。" }, 404);
}

/* ══════════════════════════════════════════════════════════════════════════
   採点。**サーバが 出す。**
   159 形式 ぜんぶは 見ない。まず 多人数で 意味の ある ものだけ。
   知らない 形式は「集めるだけ・正誤は 付けない」（黙って 不正解に しない）。
   ══════════════════════════════════════════════════════════════════════════ */
const 正規化 = (v) => String(v === undefined || v === null ? "" : v)
  .replace(/[\s　]+/g, "")
  .replace(/[。、，．,.！？!?「」『』（）()]/g, "")
  .toLowerCase();

function 採点(q, v) {
  const t = String(q?.type || "");
  const a = q?.answer;
  /* 選ぶ 形式は **番号**で 比べる（文字は 揺れる） */
  /* ★ 呼び名は 形式ごとに 分かれて いる（4択 は multiple_choice_single、
     2択 は choice_2 …）。**画面側の 出せる形式 と 同じ 顔ぶれに 揃える。**
     片方だけ 増やすと「出るのに 正誤が 付かない」に なる。 */
  if (t === "single_choice" || t === "multiple_choice_single"
      || t === "choice_2" || t === "choice_3" || t === "choice_5" || t === "choice_many"
      || t === "audio_choice" || t === "image_choice") {
    if (v === null || v === undefined || v === "") return null;
    return String(v) === String(a) ? true : false;
  }
  if (t === "true_false") {
    if (v === null || v === undefined || v === "") return null;
    const b = (x) => x === true || x === "true" || x === "1" || x === 1 || x === "○";
    return b(v) === b(a);
  }
  if (t === "multi_choice" || t === "multiple_choice_multiple") {
    if (!Array.isArray(v) || !Array.isArray(a)) return null;
    const A = a.map(String).sort().join(","), B = v.map(String).sort().join(",");
    return A === B;
  }
  if (t === "text_input" || t === "word_input" || t === "numeric_input" || t === "numeric") {
    if (!String(v || "").trim()) return null;
    const 候補 = Array.isArray(a) ? a : [a];
    return 候補.some((x) => 正規化(x) === 正規化(v));
  }
  if (t === "fill_blank") {
    const A = Array.isArray(a) ? a : [a];
    const B = Array.isArray(v) ? v : [v];
    if (!B.length || B.every((x) => !String(x || "").trim())) return null;
    if (A.length !== B.length) return false;
    return A.every((x, i) => 正規化(x) === 正規化(B[i]));
  }
  if (t === "reorder" || t === "ordering") {
    if (!Array.isArray(v) || !Array.isArray(a)) return null;
    return v.map(String).join("|") === a.map(String).join("|");
  }
  /* ★ 形式名が 分からなくても、**選択肢が あれば 4択と 同じ 扱い**。
     画面側も 同じ 見かたで 出して いる（出せるか）。 */
  if (Array.isArray(q?.choices) && q.choices.length >= 2 && a !== undefined && a !== null) {
    if (v === null || v === undefined || v === "") return null;
    return String(v) === String(a);
  }
  /* ★ 知らない 形式は **正誤を 付けない**（null）。
     不正解に すると、記述の 問題が 全員 0 点に なる。 */
  return null;
}

/* 得点。カフートと 同じ 考え —— **合っていて 速いほど 高い**。
   ただし 0 点には しない（当たれば 必ず 入る）。 */
function 得点(ok, ms, 制限ms) {
  if (!ok) return 0;
  const 上限 = Math.max(1000, 制限ms || 20000);
  const 割 = Math.max(0, Math.min(1, 1 - (ms / 上限)));
  return Math.round(500 + 500 * 割);
}

/* ══════════════════════════════════════════════════════════════════════════
   部屋（Durable Object）
   ══════════════════════════════════════════════════════════════════════════ */
export class LiveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();   /* playerId -> {ws, id} */
    this.room = null;
    this._loading = this._load();
    this._timer = null;
  }

  async _load() {
    const saved = await this.state.storage.get("room");
    this.room = (saved && typeof saved === "object") ? saved : null;
  }
  async _ready() { await this._loading; }
  async _save() { try { await this.state.storage.put("room", this.room); } catch (e) {} }

  /* 外へ 出す 部屋の 姿。**答えも 鍵も 入れない。** */
  _public() {
    const r = this.room;
    if (!r) return null;
    return {
      pin: r.pin, title: r.title, phase: r.phase,
      hostName: r.hostName,
      total: (r.questions || []).length,
      at: r.at,
      settings: r.settings,
      /* ★ 全員ぶんは 配らない。**数は 別に 送る。** */
      count: Object.keys(r.players).length - 1,          /* 作った 人を 除く */
      online: Object.values(r.players).filter((p) => p.online && !p.host).length,
      answered: (function () {
        const i = r.cur;
        return Object.values(r.players).filter((p) => !p.host && p.answers[i] !== undefined).length;
      })(),
      shown: SHOW_PLAYERS,
      /* 見せる 順: 回答を 見せて いる 人 → つないで いる 人 → 入った 順。
         **1000 人 いても 大事な 人が 先に 来る。** */
      players: Object.values(r.players)
        .sort((a, b) => (b.share - a.share) || (b.online - a.online)
          || (b.host - a.host) || (Number(a.id.slice(1)) - Number(b.id.slice(1))))
        .slice(0, SHOW_PLAYERS)
        .map((p) => ({
          id: p.id, name: p.name, color: p.color, face: p.face, online: p.online,
          share: !!p.share, score: p.score, streak: p.streak,
          answered: !!p.answeredAt, host: !!p.host
        }))
    };
  }
  /* ★ 部屋の 姿は **まとめて** 配る（入室が 続く ときに 効く）。 */
  _room送る() {
    if (this._roomT) return;
    this._roomT = setTimeout(() => {
      this._roomT = null;
      try { this._all({ t: "room", room: this._public() }); } catch (e) {}
    }, ROOM_PUSH_MS);
  }
  /* 配る 問題。**answer と explanation は 落とす。** */
  _maskQ(i) {
    const q = (this.room.questions || [])[i];
    if (!q) return null;
    const out = {};
    Object.keys(q).forEach((k) => {
      if (k === "answer" || k === "explanation" || k === "解説") return;
      out[k] = q[k];
    });
    out.i = i;
    return out;
  }

  _send(ws, m) { try { ws.send(JSON.stringify(m)); } catch (e) {} }
  _all(m, 除く) {
    const s = JSON.stringify(m);
    this.sessions.forEach((v, id) => {
      if (除く && id === 除く) return;
      try { v.ws.send(s); } catch (e) {}
    });
  }
  _host() {
    const r = this.room;
    return Object.values(r.players).find((p) => p.host) || null;
  }

  async fetch(request) {
    await this._ready();
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/create") {
      let b = null;
      try { b = await request.json(); } catch (e) { b = null; }
      /* すでに 生きて いる 部屋なら 取られている（PIN を 引き直させる） */
      if (this.room && this.room.at + ROOM_TTL_MS > Date.now() && this.room.phase !== "end") {
        return J({ ok: false, code: "TAKEN" });
      }
      const hostKey = randomKey();
      const hostId = "p1";
      this.room = {
        pin: S(b?.pin, PIN_LEN),
        title: S(b?.title, 60),
        hostUid: N(b?.hostUid, 0),
        hostName: S(b?.hostName, NICK_MAX) || "ホスト",
        hostKey,
        at: Date.now(),
        phase: "lobby",              /* lobby | q | reveal | end */
        cur: -1,
        curAt: 0,
        nextId: 2,
        questions: (b?.questions || []).slice(0, MAX_QUESTIONS),
        settings: {
          /* 1 問の 制限時間（秒）。0 は 無制限。 */
          limit: CL(b?.settings?.limit, 0, 300) || 20,
          /* 答え合わせを 出すか */
          reveal: b?.settings?.reveal !== false,
          /* 参加者が 自分で 進めるか（既定は 作った 人が 進める） */
          selfPaced: b?.settings?.selfPaced === true
        },
        players: {
          [hostId]: {
            id: hostId, key: hostKey, name: S(b?.hostName, NICK_MAX) || "ホスト",
            color: 0, face: 顔を決める(S(b?.hostName, NICK_MAX) || "ホスト", 0),
            host: true, online: false, share: false,
            score: 0, streak: 0, best: 0, answers: {}, answeredAt: 0, live: null
          }
        }
      };
      await this._save();
      return J({ ok: true, hostKey, room: this._public() });
    }

    if (p === "/info") {
      if (!this.room) return J({ ok: false, code: "NOT_FOUND" }, 404);
      if (this.room.at + ROOM_TTL_MS < Date.now()) return J({ ok: false, code: "EXPIRED" }, 404);
      return J({ ok: true, room: this._public() });
    }

    if (p === "/join") {
      if (!this.room) return J({ ok: false, code: "NOT_FOUND", message: "その PIN の 部屋は ありません。" });
      if (this.room.at + ROOM_TTL_MS < Date.now()) return J({ ok: false, code: "EXPIRED", message: "その 部屋は 終わって います。" });
      let b = null;
      try { b = await request.json(); } catch (e) { b = null; }
      const nick = S(b?.nickname, NICK_MAX).trim();

      /* ★ **入り直し**（電波が 切れた・画面を 閉じた）。
         鍵が 合えば 同じ 人として 戻す。点も 残る。 */
      const rk = S(b?.rejoinKey, 64);
      if (rk) {
        const 前 = Object.values(this.room.players).find((x) => x.key === rk);
        if (前) {
          前.name = nick || 前.name;
          await this._save();
          return J({ ok: true, you: 前.id, key: 前.key, room: this._public() });
        }
      }
      if (!nick) return J({ ok: false, code: "NO_NICK", message: "ニックネームを 入れて ください。" });

      const 数 = Object.keys(this.room.players).length;
      if (数 >= MAX_PLAYERS) return J({ ok: false, code: "FULL", message: "部屋が いっぱいです（" + MAX_PLAYERS + "人）。" });
      /* 同じ 名前が いたら 番号を 足す（誰が 誰か 分からなく なる ため） */
      let name = nick;
      const 使用中 = Object.values(this.room.players).map((x) => x.name);
      if (使用中.indexOf(name) >= 0) {
        for (let k = 2; k < 99; k++) { if (使用中.indexOf(nick + k) < 0) { name = nick + k; break; } }
      }
      const id = "p" + (this.room.nextId++);
      const key = randomKey();
      this.room.players[id] = {
        id, key, name, color: 数 % PLAYER_COLORS, face: 顔を決める(name, 数),
        host: false, online: false,
        share: false, score: 0, streak: 0, best: 0, answers: {}, answeredAt: 0, live: null,
        uid: N(b?.uid, 0)
      };
      await this._save();
      this._room送る();
      return J({ ok: true, you: id, key, room: this._public() });
    }

    if (p === "/connect") {
      if (!this.room) return J({ ok: false, code: "NOT_FOUND" }, 404);
      const key = S(url.searchParams.get("k"), 64);
      const me = Object.values(this.room.players).find((x) => x.key === key);
      if (!me) return J({ ok: false, code: "UNAUTHORIZED" }, 401);
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      server.accept();
      this._attach(server, me.id);
      return new Response(null, { status: 101, webSocket: client });
    }

    return J({ ok: false, code: "NOT_FOUND" }, 404);
  }

  _attach(ws, id) {
    const me = this.room.players[id];
    if (!me) { try { ws.close(1000); } catch (e) {} return; }
    /* 別の 端末で 入り直したら 前の つなぎを 閉じる（二重に 数えない） */
    const 前 = this.sessions.get(id);
    if (前 && 前.ws !== ws) { try { 前.ws.close(1000, "別の 端末で 入り直しました"); } catch (e) {} }
    this.sessions.set(id, { ws, id });
    me.online = true;

    ws.addEventListener("message", (ev) => this._onMessage(id, ev.data));
    ws.addEventListener("close", () => this._onClose(id));
    ws.addEventListener("error", () => this._onClose(id));

    this._send(ws, {
      t: "welcome", you: id, host: !!me.host, room: this._public(),
      q: this.room.phase === "lobby" ? null : this._maskQ(this.room.cur),
      curAt: this.room.curAt
    });
    this._room送る();
    this._save();
  }

  _onClose(id) {
    const me = this.room && this.room.players[id];
    if (me) { me.online = false; me.live = null; }
    this.sessions.delete(id);
    this._room送る();
    this._save();
  }

  async _onMessage(id, raw) {
    await this._ready();
    let m = null;
    try { m = JSON.parse(String(raw || "")); } catch (e) { return; }
    const r = this.room;
    if (!r) return;
    const me = r.players[id];
    if (!me) return;
    const t = String(m.t || "");

    /* ── 回答を みんなに 見せる／隠す ────────────────────────────
       ★ **本人が 決める。** ほかの 人が 勝手に 開けられない。 */
    if (t === "share") {
      me.share = m.on === true;
      if (!me.share) me.live = null;
      this._room送る();
      if (me.share && me.live !== null) this._all({ t: "live", id, v: me.live });
      return this._save();
    }

    /* ── 書きかけの 回答（見せて いい 人だけ）───────────────────
       ★ 見せて いない 人の 書きかけは **受け取っても 配らない**。 */
    if (t === "typing") {
      if (r.phase !== "q") return;
      me.live = m.v === undefined ? null : m.v;
      if (me.share) this._all({ t: "live", id, v: me.live }, id);
      return;
    }

    /* ── 回答を 出す ──────────────────────────────────────────── */
    if (t === "answer") {
      if (r.phase !== "q") return;
      const i = N(m.i, -1);
      if (i !== r.cur) return;
      if (me.answers[i] !== undefined) return;      /* 出し直しは させない */
      const ms = Math.max(0, Date.now() - (r.curAt || Date.now()));
      me.answers[i] = { v: m.v, ms };
      me.answeredAt = Date.now();
      if (me.share) { me.live = m.v; this._all({ t: "live", id, v: m.v }, id); }
      this._all({ t: "answered", id, n: this._答えた数() });
      this._save();
      /* 全員 出したら すぐ 答え合わせへ（待たせない） */
      if (this._答えた数() >= this._いる数()) this._reveal();
      return;
    }

    /* ── ここから 先は 作った 人だけ ──────────────────────────────── */
    if (!me.host) return;

    if (t === "start") {
      if (r.phase !== "lobby") return;
      return this._go(0);
    }
    if (t === "next") {
      if (r.cur + 1 >= (r.questions || []).length) return this._end();
      return this._go(r.cur + 1);
    }
    if (t === "reveal") return this._reveal();
    if (t === "end") return this._end();
    if (t === "kick") {
      const 相 = r.players[S(m.id, 16)];
      if (!相 || 相.host) return;
      delete r.players[相.id];
      const s = this.sessions.get(相.id);
      if (s) { try { s.ws.close(1000, "退出させられました"); } catch (e) {} }
      this.sessions.delete(相.id);
      this._all({ t: "room", room: this._public() });
      return this._save();
    }
    if (t === "setting") {
      r.settings.limit = CL(m.limit, 0, 300);
      r.settings.reveal = m.reveal !== false;
      this._all({ t: "room", room: this._public() });
      return this._save();
    }
  }

  _いる数() {
    return Object.values(this.room.players).filter((p) => p.online && !p.host).length;
  }
  _答えた数() {
    const i = this.room.cur;
    return Object.values(this.room.players)
      .filter((p) => !p.host && p.answers[i] !== undefined).length;
  }

  _go(i) {
    const r = this.room;
    r.cur = i;
    r.phase = "q";
    r.curAt = Date.now();
    Object.values(r.players).forEach((p) => { p.answeredAt = 0; p.live = null; });
    this._all({ t: "q", i, q: this._maskQ(i), curAt: r.curAt, limit: r.settings.limit });
    this._all({ t: "room", room: this._public() });
    this._save();
    this._時計();
  }

  /* 制限時間。**サーバで 数える。** 画面の 時計は ずれる。 */
  _時計() {
    try { if (this._timer) clearTimeout(this._timer); } catch (e) {}
    this._timer = null;
    const lim = this.room.settings.limit;
    if (!lim) return;
    const 残 = (this.room.curAt + lim * 1000) - Date.now();
    this._timer = setTimeout(() => {
      if (this.room && this.room.phase === "q") this._reveal();
    }, Math.max(200, 残));
  }

  _reveal() {
    const r = this.room;
    if (r.phase !== "q") return;
    try { if (this._timer) clearTimeout(this._timer); } catch (e) {}
    this._timer = null;
    const i = r.cur;
    const q = (r.questions || [])[i];
    const 結果 = [];
    Object.values(r.players).forEach((p) => {
      if (p.host) return;
      const a = p.answers[i];
      const ok = a ? 採点(q, a.v) : null;
      const 点 = ok === true ? 得点(true, a.ms, (r.settings.limit || 20) * 1000) : 0;
      if (ok === true) { p.streak++; p.best = Math.max(p.best, p.streak); }
      else if (ok === false) p.streak = 0;
      p.score += 点;
      if (a) { a.ok = ok; a.gain = 点; }
      結果.push({ id: p.id, v: a ? a.v : null, ok, ms: a ? a.ms : null, gain: 点, score: p.score });
    });
    r.phase = "reveal";
    this._all({
      t: "reveal", i,
      answer: r.settings.reveal ? (q ? q.answer : null) : null,
      explanation: r.settings.reveal ? (q ? (q.explanation || "") : "") : "",
      /* ★ 明細も 上限（1000 人ぶん 配らない）。見せて いる 人と 上位を 先に。 */
      results: 結果.sort((a, b) => (b.gain - a.gain) || 0).slice(0, SHOW_PLAYERS),
      正解数: 結果.filter((x) => x.ok === true).length,
      回答数: 結果.filter((x) => x.v !== null && x.v !== undefined).length,
      rank: this._順位()
    });
    this._all({ t: "room", room: this._public() });
    this._save();
  }

  _順位() {
    return Object.values(this.room.players)
      .filter((p) => !p.host)
      .sort((a, b) => b.score - a.score || b.best - a.best || a.name.localeCompare(b.name))
      .slice(0, SHOW_RANK)
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, color: p.color,
                        face: p.face, score: p.score, best: p.best }));
  }

  _end() {
    const r = this.room;
    try { if (this._timer) clearTimeout(this._timer); } catch (e) {}
    this._timer = null;
    r.phase = "end";
    this._all({ t: "end", rank: this._順位() });
    this._all({ t: "room", room: this._public() });
    this._save();
  }
}
